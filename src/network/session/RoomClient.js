import { MSG } from '../protocol/messages.js';
import { WebSocketTransport, defaultCoopWsUrl } from '../transport/WebSocketTransport.js';

export class RoomClient {
  constructor(url = defaultCoopWsUrl()) {
    this.transport = new WebSocketTransport(url);
    this.room = null;
    this.playerSlot = null;
    this.playerToken = null;
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
    this.playerSlot = patch.playerSlot ?? this.playerSlot;
    this.playerToken = patch.playerToken ?? this.playerToken;
    this.handlers.forEach((handler) => handler({
      room: this.room,
      playerSlot: this.playerSlot,
      playerToken: this.playerToken,
      ...patch
    }));
  }

  async ensureConnected({ allowReconnect = false } = {}) {
    await this.transport.connect();
    if (!this.messageBound) {
      this.messageBound = true;
      this.transport.onMessage((message) => this.handleServerMessage(message));
      this.transport.onClose(() => this.stopHeartbeat());
    }
    if (!allowReconnect) return;
    const saved = this.transport.loadSession();
    if (saved?.roomId && saved?.playerToken) {
      this.transport.send({
        type: MSG.RECONNECT,
        roomId: saved.roomId,
        playerToken: saved.playerToken,
        lastAckTick: 0,
        lastAckSeq: 0
      });
    }
  }

  /** @deprecated use ensureConnected */
  async connect() {
    await this.ensureConnected({ allowReconnect: true });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.transport.sendHeartbeat();
    }, 12_000);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  resetLocalRoom() {
    if (this.room && this.transport.connected) {
      this.transport.send({ type: MSG.ROOM_LEAVE });
    }
    this.room = null;
    this.playerSlot = null;
    this.playerToken = null;
    this.transport.clearSession();
    this.stopHeartbeat();
  }

  async createRoom(name, deckSize) {
    this.resetLocalRoom();
    await this.ensureConnected({ allowReconnect: false });
    const sent = this.transport.send({ type: MSG.ROOM_CREATE, name, deckSize });
    if (!sent) {
      throw new Error('无法创建房间：中继未连接，请先运行 npm run server:coop');
    }
  }

  async joinRoom(roomId, name, deckSize) {
    const normalizedId = String(roomId || '').trim().toUpperCase();
    if (!normalizedId) {
      throw new Error('请输入房间号');
    }
    this.resetLocalRoom();
    await this.ensureConnected({ allowReconnect: false });
    const sent = this.transport.send({
      type: MSG.ROOM_JOIN,
      roomId: normalizedId,
      name,
      deckSize
    });
    if (!sent) {
      throw new Error('无法加入房间：中继未连接，请先运行 npm run server:coop');
    }
  }

  setReady(ready, deck = []) {
    const sent = this.transport.send({
      type: MSG.ROOM_READY,
      ready: Boolean(ready),
      deck: Array.isArray(deck) ? deck : []
    });
    if (!sent) {
      this.emit({ event: MSG.ERROR, message: '未连接中继，无法准备' });
    }
  }

  leaveRoom() {
    this.resetLocalRoom();
  }

  startMatch({ levelId, difficulty, matchSeed, players }) {
    const sent = this.transport.send({
      type: MSG.ROOM_START,
      levelId,
      difficulty,
      matchSeed,
      players
    });
    if (!sent) {
      this.emit({ event: MSG.ERROR, message: '未连接中继，无法开始' });
    }
  }

  forward(payload, to = 'all') {
    return this.transport.send({
      type: MSG.NET_FORWARD,
      roomId: this.room?.id,
      to,
      payload
    });
  }

  async reconnect(saved, lastAckTick = 0, lastAckSeq = 0) {
    await this.ensureConnected({ allowReconnect: false });
    this.transport.send({
      type: MSG.RECONNECT,
      roomId: saved.roomId,
      playerToken: saved.playerToken,
      lastAckTick,
      lastAckSeq
    });
  }

  handleServerMessage(message) {
    switch (message.type) {
      case MSG.ROOM_CREATE:
      case MSG.ROOM_JOIN:
      case MSG.RECONNECT_OK:
        this.transport.saveSession({
          roomId: message.roomId,
          playerToken: message.playerToken,
          playerSlot: message.playerSlot
        });
        this.emit({
          event: message.type,
          room: message.room,
          playerSlot: message.playerSlot,
          playerToken: message.playerToken
        });
        this.startHeartbeat();
        break;
      case MSG.ROOM_STATE:
        this.emit({ event: MSG.ROOM_STATE, room: message.room });
        break;
      case MSG.NET_FORWARD:
        this.emit({ event: MSG.NET_FORWARD, forward: message });
        break;
      case MSG.ERROR:
        this.emit({ event: MSG.ERROR, message: message.message });
        break;
      default:
        break;
    }
  }

  get isHost() {
    return this.playerSlot === 'p1';
  }
}
