import { MSG, relayEnvelope, RELAY_VERSION } from '../protocol/messages.js';
import { SYNC } from '../protocol/syncConfig.js';
import { WebSocketTransport, defaultCoopWsUrl } from '../transport/WebSocketTransport.js';

export class RoomClient {
  constructor(url = defaultCoopWsUrl()) {
    this.transport = new WebSocketTransport(url);
    this.room = null;
    this.playerId = null;
    this.connectionId = null;
    this.reconnectToken = null;
    this.handlers = new Set();
    this.heartbeatTimer = null;
    this.messageBound = false;
  }

  onUpdate(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(patch) {
    this.room = patch.room ?? this.room;
    this.playerId = patch.playerId ?? this.playerId;
    this.connectionId = patch.connectionId ?? this.connectionId;
    this.reconnectToken = patch.reconnectToken ?? this.reconnectToken;
    this.handlers.forEach((handler) => handler({
      room: this.room,
      playerId: this.playerId,
      // Temporary compatibility alias; its value is the stable playerId.
      playerSlot: this.playerId,
      connectionId: this.connectionId,
      reconnectToken: this.reconnectToken,
      ...patch
    }));
  }

  async ensureConnected() {
    await this.transport.connect();
    if (!this.messageBound) {
      this.messageBound = true;
      this.transport.onMessage((message) => this.handleServerMessage(message));
      this.transport.onClose((manual) => {
        this.stopHeartbeat();
        if (!manual) {
          const saved = this.transport.loadSession();
          if (saved?.playerId && saved.playerId !== saved.hostPlayerId) {
            this.transport.saveSession({
              ...saved,
              expiresAt: Date.now() + SYNC.clientReconnectGraceSec * 1_000
            });
          }
          this.emit({
            event: MSG.CONNECTION_LOST,
            reconnectAvailable: this.transport.hasReconnectSession()
          });
        }
      });
    }
  }

  async connect() {
    await this.ensureConnected();
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.transport.sendHeartbeat();
    }, SYNC.heartbeatSec * 1000);
  }

  stopHeartbeat() {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  resetLocalRoom({ notify = true } = {}) {
    if (notify && this.room && this.transport.connected) {
      this.transport.send({ type: MSG.ROOM_LEAVE });
    }
    this.room = null;
    this.playerId = null;
    this.connectionId = null;
    this.reconnectToken = null;
    this.transport.clearSession();
    this.stopHeartbeat();
  }

  async createRoom(name) {
    this.resetLocalRoom();
    await this.ensureConnected();
    if (!this.transport.send({ type: MSG.ROOM_CREATE, name })) {
      throw new Error('无法创建房间：中继未连接，请先运行 npm run server:coop');
    }
  }

  async joinRoom(roomId, name) {
    const normalizedId = String(roomId || '').trim().toUpperCase();
    if (!normalizedId) throw new Error('请输入房间号');
    this.resetLocalRoom();
    await this.ensureConnected();
    if (!this.transport.send({ type: MSG.ROOM_JOIN, roomId: normalizedId, name })) {
      throw new Error('无法加入房间：中继未连接，请先运行 npm run server:coop');
    }
  }

  leaveRoom() {
    this.resetLocalRoom();
  }

  forward(payload, to = 'broadcast') {
    if (!this.room?.id) return false;
    return this.transport.send(relayEnvelope(this.room.id, to, payload));
  }

  async reconnect(saved = this.transport.loadSession()) {
    if (!saved?.roomId || !saved?.reconnectToken) return false;
    await this.ensureConnected();
    return this.transport.send({
      type: MSG.RECONNECT,
      roomId: saved.roomId,
      reconnectToken: saved.reconnectToken
    });
  }

  async probeReconnect(saved = this.transport.loadSession()) {
    if (!saved?.roomId || !saved?.reconnectToken) return false;
    await this.ensureConnected();
    return this.transport.send({
      type: MSG.RECONNECT_PROBE,
      roomId: saved.roomId,
      reconnectToken: saved.reconnectToken
    });
  }

  handleServerMessage(message) {
    if (message?.relayVersion !== RELAY_VERSION) {
      this.resetLocalRoom({ notify: false });
      this.emit({
        event: MSG.ERROR,
        message: '联机中继版本过旧，请停止旧进程后重新运行 npm run server:coop'
      });
      return;
    }
    switch (message.type) {
      case MSG.ROOM_CREATE:
      case MSG.ROOM_JOIN:
      case MSG.RECONNECT_OK: {
        const previous = this.transport.loadSession() ?? {};
        const record = {
          ...previous,
          roomId: message.roomId,
          playerId: message.playerId,
          hostPlayerId: message.room?.hostPlayerId ?? previous.hostPlayerId,
          reconnectToken: message.reconnectToken ?? this.reconnectToken,
          expiresAt: message.expiresAt
        };
        this.transport.saveSession(record);
        this.emit({
          event: message.type,
          room: message.room,
          playerId: message.playerId,
          connectionId: message.connectionId,
          reconnectToken: record.reconnectToken
        });
        this.startHeartbeat();
        break;
      }
      case MSG.ROOM_STATE:
        this.emit({ event: MSG.ROOM_STATE, room: message.room });
        break;
      case MSG.HEARTBEAT: {
        const saved = this.transport.loadSession();
        if (saved?.playerId && saved.playerId !== saved.hostPlayerId) {
          this.transport.saveSession({
            ...saved,
            expiresAt: Date.now() + SYNC.clientReconnectGraceSec * 1_000
          });
        }
        break;
      }
      case MSG.RECONNECT_STATUS:
        this.emit({
          event: MSG.RECONNECT_STATUS,
          roomId: message.roomId,
          reconnectAvailable: message.available === true,
          hostOnline: message.hostOnline === true,
          reconnectReason: message.reason ?? null
        });
        break;
      case MSG.NET_FORWARD:
        this.emit({ event: MSG.NET_FORWARD, forward: message });
        break;
      case MSG.ROOM_CLOSED:
        this.emit({ event: MSG.ROOM_CLOSED, reason: message.reason });
        this.resetLocalRoom({ notify: false });
        break;
      case MSG.ERROR:
        this.emit({ event: MSG.ERROR, message: message.message });
        break;
      default:
        break;
    }
  }

  get isHost() {
    return Boolean(this.playerId && this.playerId === this.room?.hostPlayerId);
  }

  get hostPlayerId() {
    return this.room?.hostPlayerId ?? null;
  }
}
