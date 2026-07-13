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

  async connect() {
    await this.transport.connect();
    this.transport.onMessage((message) => this.handleServerMessage(message));
    this.transport.onClose(() => this.stopHeartbeat());
    const saved = this.transport.loadSession();
    if (saved?.roomId && saved?.playerToken) {
      await this.reconnect(saved);
    }
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

  async createRoom(name, deckSize) {
    await this.connect();
    this.transport.send({ type: MSG.ROOM_CREATE, name, deckSize });
  }

  async joinRoom(roomId, name, deckSize) {
    await this.connect();
    this.transport.send({ type: MSG.ROOM_JOIN, roomId, name, deckSize });
  }

  setReady(ready, deck = []) {
    this.transport.send({
      type: MSG.ROOM_READY,
      ready: Boolean(ready),
      deck: Array.isArray(deck) ? deck : []
    });
  }

  leaveRoom() {
    this.transport.send({ type: MSG.ROOM_LEAVE });
    this.transport.clearSession();
    this.room = null;
    this.playerSlot = null;
    this.playerToken = null;
    this.stopHeartbeat();
  }

  startMatch({ levelId, difficulty, matchSeed, players }) {
    this.transport.send({
      type: MSG.ROOM_START,
      levelId,
      difficulty,
      matchSeed,
      players
    });
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
    await this.connect();
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
