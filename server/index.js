import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes, randomUUID } from 'node:crypto';

const PORT = Number(process.env.COOP_PORT ?? 8787);
const RELAY_VERSION = 2;
const HOST_LEASE_MS = 60_000;
const CLIENT_RECONNECT_GRACE_MS = 90_000;
const MAX_MESSAGE_BYTES = 256 * 1024;
// A Host can legitimately emit transform, combat and FX bursts in the same second.
const MAX_MESSAGES_PER_WINDOW = 600;
const RATE_WINDOW_MS = 1_000;
const ROOM_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const MSG = Object.freeze({
  ROOM_CREATE: 'room_create',
  ROOM_JOIN: 'room_join',
  ROOM_LEAVE: 'room_leave',
  ROOM_STATE: 'room_state',
  ROOM_CLOSED: 'room_closed',
  HEARTBEAT: 'heartbeat',
  RECONNECT_PROBE: 'reconnect_probe',
  RECONNECT_STATUS: 'reconnect_status',
  RECONNECT: 'reconnect',
  RECONNECT_OK: 'reconnect_ok',
  NET_FORWARD: 'net_forward',
  ERROR: 'error'
});

/** @type {Map<string, any>} */
const rooms = new Map();
/** @type {Map<WebSocket, any>} */
const connections = new Map();

function randomRoomId() {
  let id = '';
  for (let i = 0; i < 6; i += 1) {
    id += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
  }
  return rooms.has(id) ? randomRoomId() : id;
}

function reconnectToken() {
  return randomBytes(24).toString('hex');
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ ...payload, relayVersion: RELAY_VERSION }));
  }
}

function roomSnapshot(room) {
  const players = {};
  room.playerOrder.forEach((playerId, order) => {
    const player = room.players.get(playerId);
    if (!player) return;
    players[playerId] = {
      playerId,
      order,
      name: player.name,
      connected: player.connected,
      joinedAt: player.joinedAt
    };
  });
  return {
    id: room.id,
    state: room.state,
    hostPlayerId: room.hostPlayerId,
    hostDisconnectedAt: room.hostDisconnectedAt,
    playerOrder: room.playerOrder.slice(),
    players
  };
}

function broadcastRoom(room) {
  const payload = { type: MSG.ROOM_STATE, room: roomSnapshot(room) };
  room.sockets.forEach((socket) => send(socket, payload));
}

function createPlayer(socket, room, name) {
  const playerId = randomUUID();
  const token = reconnectToken();
  const now = Date.now();
  const player = {
    playerId,
    name: String(name || `玩家 ${room.playerOrder.length + 1}`).slice(0, 32),
    reconnectToken: token,
    connected: true,
    joinedAt: now,
    lastSeen: now,
    disconnectTimer: null
  };
  room.players.set(playerId, player);
  room.playerOrder.push(playerId);
  room.sockets.add(socket);
  bindConnection(socket, room.id, player);
  return player;
}

function bindConnection(socket, roomId, player) {
  connections.set(socket, {
    roomId,
    playerId: player.playerId,
    connectionId: randomUUID(),
    reconnectToken: player.reconnectToken,
    rateWindowStartedAt: Date.now(),
    rateCount: 0
  });
}

function createRoom(socket, message) {
  detachSocket(socket, { explicit: true, notify: false });
  const id = randomRoomId();
  const room = {
    id,
    state: 'open',
    hostPlayerId: null,
    hostDisconnectedAt: null,
    hostLeaseTimer: null,
    players: new Map(),
    playerOrder: [],
    sockets: new Set()
  };
  const host = createPlayer(socket, room, message.name);
  room.hostPlayerId = host.playerId;
  rooms.set(id, room);
  const info = connections.get(socket);
  send(socket, {
    type: MSG.ROOM_CREATE,
    roomId: id,
    playerId: host.playerId,
    connectionId: info.connectionId,
    reconnectToken: host.reconnectToken,
    expiresAt: Date.now() + HOST_LEASE_MS,
    room: roomSnapshot(room)
  });
}

function joinRoom(socket, message) {
  const roomId = String(message.roomId || '').trim().toUpperCase();
  const room = rooms.get(roomId);
  if (!room) return send(socket, { type: MSG.ERROR, message: '房间不存在' });
  if (room.state !== 'open') return send(socket, { type: MSG.ERROR, message: '房间不可加入' });
  detachSocket(socket, { explicit: true, notify: false });
  const player = createPlayer(socket, room, message.name);
  const info = connections.get(socket);
  send(socket, {
    type: MSG.ROOM_JOIN,
    roomId,
    playerId: player.playerId,
    connectionId: info.connectionId,
    reconnectToken: player.reconnectToken,
    expiresAt: Date.now() + CLIENT_RECONNECT_GRACE_MS,
    room: roomSnapshot(room)
  });
  broadcastRoom(room);
}

function isPlayerOnline(room, playerId) {
  const player = room?.players.get(playerId);
  if (!player?.connected) return false;
  return [...room.sockets].some((socket) => {
    const info = connections.get(socket);
    return socket.readyState === WebSocket.OPEN && info?.playerId === playerId;
  });
}

function handleReconnectProbe(socket, message) {
  const roomId = String(message.roomId || '').trim().toUpperCase();
  const room = rooms.get(roomId);
  if (!room) {
    return send(socket, {
      type: MSG.RECONNECT_STATUS,
      roomId,
      available: false,
      hostOnline: false,
      reason: 'room_missing'
    });
  }
  const player = [...room.players.values()].find((entry) => (
    entry.reconnectToken === message.reconnectToken
  ));
  if (!player) {
    return send(socket, {
      type: MSG.RECONNECT_STATUS,
      roomId,
      available: false,
      hostOnline: isPlayerOnline(room, room.hostPlayerId),
      reason: 'invalid_token'
    });
  }
  if (player.playerId === room.hostPlayerId) {
    return send(socket, {
      type: MSG.RECONNECT_STATUS,
      roomId,
      available: false,
      hostOnline: isPlayerOnline(room, room.hostPlayerId),
      reason: 'host_reconnect_disabled'
    });
  }
  if (!player.connected && Date.now() - player.lastSeen > CLIENT_RECONNECT_GRACE_MS) {
    return send(socket, {
      type: MSG.RECONNECT_STATUS,
      roomId,
      available: false,
      hostOnline: isPlayerOnline(room, room.hostPlayerId),
      reason: 'expired'
    });
  }
  const hostOnline = isPlayerOnline(room, room.hostPlayerId);
  return send(socket, {
    type: MSG.RECONNECT_STATUS,
    roomId,
    available: hostOnline,
    hostOnline,
    reason: hostOnline ? null : 'host_offline'
  });
}

function handleReconnect(socket, message) {
  const room = rooms.get(String(message.roomId || '').toUpperCase());
  if (!room) return send(socket, { type: MSG.ERROR, message: '房间不存在或已释放' });
  const player = [...room.players.values()].find((entry) => (
    entry.reconnectToken === message.reconnectToken
  ));
  if (!player) return send(socket, { type: MSG.ERROR, message: '重连凭证无效' });
  if (player.playerId === room.hostPlayerId) {
    return send(socket, { type: MSG.ERROR, message: 'Host 断线后权威状态无法恢复，请重新创建房间' });
  }
  if (!isPlayerOnline(room, room.hostPlayerId)) {
    return send(socket, { type: MSG.ERROR, message: 'Host 当前不在线，无法回连' });
  }
  if (!player.connected && Date.now() - player.lastSeen > CLIENT_RECONNECT_GRACE_MS) {
    return send(socket, { type: MSG.ERROR, message: '重连已超时' });
  }
  detachSocket(socket, { explicit: true, notify: false });
  clearTimeout(player.disconnectTimer);
  player.disconnectTimer = null;
  player.connected = true;
  player.lastSeen = Date.now();
  room.sockets.add(socket);
  bindConnection(socket, room.id, player);
  const info = connections.get(socket);
  send(socket, {
    type: MSG.RECONNECT_OK,
    roomId: room.id,
    playerId: player.playerId,
    connectionId: info.connectionId,
    reconnectToken: player.reconnectToken,
    expiresAt: Date.now() + CLIENT_RECONNECT_GRACE_MS,
    room: roomSnapshot(room)
  });
  broadcastRoom(room);
}

function forwardMessage(socket, message) {
  const info = connections.get(socket);
  const room = info ? rooms.get(info.roomId) : null;
  if (!room || !room.players.has(info.playerId)) return;
  const target = message.to ?? 'broadcast';
  if (target !== 'broadcast' && target !== 'all' && !room.players.has(target)) {
    return send(socket, { type: MSG.ERROR, message: '转发目标不是房间成员' });
  }
  room.sockets.forEach((peer) => {
    if (peer === socket) return;
    const peerInfo = connections.get(peer);
    if (!peerInfo) return;
    if (target !== 'broadcast' && target !== 'all' && peerInfo.playerId !== target) return;
    send(peer, {
      type: MSG.NET_FORWARD,
      relayVersion: RELAY_VERSION,
      roomId: room.id,
      fromPlayerId: info.playerId,
      connectionId: info.connectionId,
      to: target,
      channel: message.channel ?? 'game',
      payload: message.payload
    });
  });
}

function detachSocket(socket, { explicit = false, notify = true } = {}) {
  const info = connections.get(socket);
  if (!info) return;
  connections.delete(socket);
  const room = rooms.get(info.roomId);
  if (!room) return;
  room.sockets.delete(socket);
  const player = room.players.get(info.playerId);
  if (!player) return;

  if (explicit) {
    if (info.playerId === room.hostPlayerId) {
      closeRoom(room, 'host_left');
      return;
    }
    clearTimeout(player.disconnectTimer);
    room.players.delete(info.playerId);
    room.playerOrder = room.playerOrder.filter((id) => id !== info.playerId);
    if (notify) broadcastRoom(room);
    return;
  }

  player.connected = false;
  player.lastSeen = Date.now();
  if (info.playerId === room.hostPlayerId) {
    room.hostDisconnectedAt = Date.now();
    clearTimeout(room.hostLeaseTimer);
    room.hostLeaseTimer = setTimeout(() => {
      const currentHost = room.players.get(room.hostPlayerId);
      if (currentHost?.connected) return;
      closeRoom(room, 'host_lease_expired');
    }, HOST_LEASE_MS);
  } else {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = setTimeout(() => {
      if (player.connected) return;
      room.players.delete(player.playerId);
      room.playerOrder = room.playerOrder.filter((id) => id !== player.playerId);
      broadcastRoom(room);
    }, CLIENT_RECONNECT_GRACE_MS);
  }
  if (notify) broadcastRoom(room);
}

function closeRoom(room, reason) {
  if (!rooms.has(room.id)) return;
  rooms.delete(room.id);
  clearTimeout(room.hostLeaseTimer);
  room.players.forEach((player) => clearTimeout(player.disconnectTimer));
  room.sockets.forEach((peer) => {
    send(peer, { type: MSG.ROOM_CLOSED, roomId: room.id, reason });
    connections.delete(peer);
  });
  room.sockets.clear();
}

function consumeRateBudget(socket) {
  const info = connections.get(socket);
  if (!info) return true;
  const now = Date.now();
  if (now - info.rateWindowStartedAt >= RATE_WINDOW_MS) {
    info.rateWindowStartedAt = now;
    info.rateCount = 0;
  }
  info.rateCount += 1;
  return info.rateCount <= MAX_MESSAGES_PER_WINDOW;
}

const wss = new WebSocketServer({ port: PORT, maxPayload: MAX_MESSAGE_BYTES });
console.log(`[multiplayer-relay] listening on ws://0.0.0.0:${PORT}`);

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    if (raw.byteLength > MAX_MESSAGE_BYTES || !consumeRateBudget(socket)) {
      send(socket, { type: MSG.ERROR, message: '消息过大或发送过于频繁' });
      return;
    }
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message.relayVersion !== RELAY_VERSION) {
      send(socket, {
        type: MSG.ERROR,
        message: '联机客户端与中继版本不一致，请刷新页面并重启联机中继'
      });
      return;
    }
    try {
      switch (message.type) {
        case MSG.ROOM_CREATE:
          createRoom(socket, message);
          break;
        case MSG.ROOM_JOIN:
          joinRoom(socket, message);
          break;
        case MSG.ROOM_LEAVE:
          detachSocket(socket, { explicit: true });
          break;
        case MSG.RECONNECT:
          handleReconnect(socket, message);
          break;
        case MSG.RECONNECT_PROBE:
          handleReconnectProbe(socket, message);
          break;
        case MSG.HEARTBEAT: {
          const info = connections.get(socket);
          const player = info ? rooms.get(info.roomId)?.players.get(info.playerId) : null;
          if (player) player.lastSeen = Date.now();
          send(socket, { type: MSG.HEARTBEAT, ok: true, serverTime: Date.now() });
          break;
        }
        case MSG.NET_FORWARD:
          forwardMessage(socket, message);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('[multiplayer-relay] message handler error:', error);
      send(socket, { type: MSG.ERROR, message: '中继处理失败，请重试' });
    }
  });
  socket.on('close', () => detachSocket(socket));
});
