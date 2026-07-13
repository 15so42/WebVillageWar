import { WebSocketServer } from 'ws';
import { randomBytes } from 'node:crypto';

const PORT = Number(process.env.COOP_PORT ?? 8787);
const RECONNECT_GRACE_MS = 90_000;
const ROOM_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const MSG = {
  ROOM_CREATE: 'room_create',
  ROOM_JOIN: 'room_join',
  ROOM_LEAVE: 'room_leave',
  ROOM_READY: 'room_ready',
  ROOM_START: 'room_start',
  ROOM_STATE: 'room_state',
  HEARTBEAT: 'heartbeat',
  RECONNECT: 'reconnect',
  RECONNECT_OK: 'reconnect_ok',
  NET_FORWARD: 'net_forward',
  ERROR: 'error'
};

/** @type {Map<string, any>} */
const rooms = new Map();
/** @type {Map<WebSocket, { roomId: string, playerSlot: string, playerToken: string }>} */
const sockets = new Map();

function randomRoomId() {
  let id = '';
  for (let i = 0; i < 6; i += 1) {
    id += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
  }
  return rooms.has(id) ? randomRoomId() : id;
}

function token() {
  return randomBytes(16).toString('hex');
}

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function roomSnapshot(room) {
  return {
    id: room.id,
    state: room.state,
    hostSlot: room.hostSlot,
    levelId: room.levelId,
    difficulty: room.difficulty,
    players: Object.fromEntries(
      Object.entries(room.players).map(([slot, player]) => [slot, {
        name: player.name,
        ready: player.ready,
        connected: player.connected,
        deckSize: player.deckSize ?? 0
      }])
    )
  };
}

function broadcastRoom(room) {
  const payload = { type: MSG.ROOM_STATE, room: roomSnapshot(room) };
  room.sockets.forEach((socket) => send(socket, payload));
}

function createRoom(hostSocket, name, deckSize) {
  const id = randomRoomId();
  const playerToken = token();
  const room = {
    id,
    state: 'lobby',
    hostSlot: 'p1',
    levelId: null,
    difficulty: 1,
    sockets: new Set([hostSocket]),
    players: {
      p1: {
        name: name || '玩家 1',
        ready: false,
        connected: true,
        playerToken,
        deckSize,
        lastSeen: Date.now()
      },
      p2: null
    }
  };
  rooms.set(id, room);
  sockets.set(hostSocket, { roomId: id, playerSlot: 'p1', playerToken });
  send(hostSocket, {
    type: MSG.ROOM_CREATE,
    roomId: id,
    playerSlot: 'p1',
    playerToken,
    room: roomSnapshot(room)
  });
  return room;
}

function joinRoom(socket, roomId, name, deckSize) {
  const room = rooms.get(roomId);
  if (!room) {
    send(socket, { type: MSG.ERROR, message: '房间不存在' });
    return;
  }
  if (room.state !== 'lobby') {
    send(socket, { type: MSG.ERROR, message: '房间已开始或已结束' });
    return;
  }
  if (room.players.p2 && room.players.p2.connected) {
    send(socket, { type: MSG.ERROR, message: '房间已满' });
    return;
  }
  const playerToken = token();
  room.players.p2 = {
    name: name || '玩家 2',
    ready: false,
    connected: true,
    playerToken,
    deckSize,
    lastSeen: Date.now()
  };
  room.sockets.add(socket);
  sockets.set(socket, { roomId, playerSlot: 'p2', playerToken });
  send(socket, {
    type: MSG.ROOM_JOIN,
    roomId,
    playerSlot: 'p2',
    playerToken,
    room: roomSnapshot(room)
  });
  broadcastRoom(room);
}

function leaveRoom(socket) {
  const info = sockets.get(socket);
  if (!info) return;
  const room = rooms.get(info.roomId);
  sockets.delete(socket);
  if (!room) return;
  room.sockets.delete(socket);
  const player = room.players[info.playerSlot];
  if (player) {
    player.connected = false;
    player.lastSeen = Date.now();
    player.disconnectTimer = setTimeout(() => {
      if (!player.connected && room.state === 'lobby') {
        room.players[info.playerSlot] = info.playerSlot === 'p2' ? null : room.players.p2;
        if (info.playerSlot === 'p1') {
          rooms.delete(room.id);
        }
      }
    }, RECONNECT_GRACE_MS);
  }
  if (room.sockets.size === 0 && room.state !== 'running') {
    rooms.delete(room.id);
    return;
  }
  broadcastRoom(room);
}

function handleReconnect(socket, payload) {
  const room = rooms.get(payload.roomId);
  if (!room) {
    send(socket, { type: MSG.ERROR, message: '房间不存在' });
    return;
  }
  const slotEntry = Object.entries(room.players).find(([, player]) => player?.playerToken === payload.playerToken);
  if (!slotEntry) {
    send(socket, { type: MSG.ERROR, message: '重连凭证无效' });
    return;
  }
  const [playerSlot, player] = slotEntry;
  if (Date.now() - (player.lastSeen ?? 0) > RECONNECT_GRACE_MS && !player.connected) {
    send(socket, { type: MSG.ERROR, message: '重连已超时' });
    return;
  }
  if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
  player.connected = true;
  player.lastSeen = Date.now();
  room.sockets.add(socket);
  sockets.set(socket, { roomId: room.id, playerSlot, playerToken: player.playerToken });
  send(socket, {
    type: MSG.RECONNECT_OK,
    roomId: room.id,
    playerSlot,
    room: roomSnapshot(room)
  });
  broadcastRoom(room);
  const hostSocket = [...room.sockets].find((peer) => sockets.get(peer)?.playerSlot === room.hostSlot);
  if (hostSocket && playerSlot !== room.hostSlot) {
    send(hostSocket, {
      type: MSG.NET_FORWARD,
      from: 'server',
      to: room.hostSlot,
      payload: {
        type: 'client_reconnected',
        playerSlot,
        lastAckTick: payload.lastAckTick ?? 0,
        lastAckSeq: payload.lastAckSeq ?? 0
      }
    });
  }
}

function forwardMessage(socket, message) {
  const info = sockets.get(socket);
  if (!info) return;
  const room = rooms.get(info.roomId);
  if (!room) return;
  const target = message.to ?? 'all';
  room.sockets.forEach((peer) => {
    if (peer === socket && message.payload?.type !== MSG.SNAPSHOT_WORLD) return;
    const peerInfo = sockets.get(peer);
    if (!peerInfo) return;
    if (target !== 'all' && peerInfo.playerSlot !== target) return;
    send(peer, {
      type: MSG.NET_FORWARD,
      roomId: room.id,
      from: info.playerSlot,
      to: target,
      payload: message.payload
    });
  });
}

const wss = new WebSocketServer({ port: PORT });
console.log(`[coop-server] listening on ws://0.0.0.0:${PORT}`);

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    switch (message.type) {
      case MSG.ROOM_CREATE:
        createRoom(socket, message.name, message.deckSize ?? 0);
        break;
      case MSG.ROOM_JOIN:
        joinRoom(socket, message.roomId, message.name, message.deckSize ?? 0);
        break;
      case MSG.ROOM_LEAVE:
        leaveRoom(socket);
        break;
      case MSG.ROOM_READY: {
        const info = sockets.get(socket);
        const room = info ? rooms.get(info.roomId) : null;
        const player = room?.players?.[info?.playerSlot];
        if (player) {
          player.ready = Boolean(message.ready);
          if (Array.isArray(message.deck)) player.deck = message.deck;
          broadcastRoom(room);
        }
        break;
      }
      case MSG.ROOM_START: {
        const info = sockets.get(socket);
        const room = info ? rooms.get(info.roomId) : null;
        if (!room || info.playerSlot !== room.hostSlot) {
          send(socket, { type: MSG.ERROR, message: '只有房主可以开始' });
          break;
        }
        room.state = 'running';
        room.levelId = message.levelId;
        room.difficulty = message.difficulty;
        broadcastRoom(room);
        const startPayload = {
          type: 'match_start',
          levelId: message.levelId,
          difficulty: message.difficulty,
          matchSeed: message.matchSeed ?? Date.now(),
          players: {
            p1: {
              name: room.players.p1?.name,
              deck: room.players.p1?.deck ?? []
            },
            p2: {
              name: room.players.p2?.name,
              deck: room.players.p2?.deck ?? []
            }
          }
        };
        room.sockets.forEach((peer) => {
          const peerInfo = sockets.get(peer);
          send(peer, {
            type: MSG.NET_FORWARD,
            roomId: room.id,
            from: room.hostSlot,
            to: peerInfo?.playerSlot ?? 'all',
            payload: startPayload
          });
        });
        break;
      }
      case MSG.RECONNECT:
        handleReconnect(socket, message);
        break;
      case MSG.HEARTBEAT: {
        const info = sockets.get(socket);
        const room = info ? rooms.get(info.roomId) : null;
        const player = room?.players?.[info?.playerSlot];
        if (player) player.lastSeen = Date.now();
        send(socket, { type: MSG.HEARTBEAT, ok: true });
        break;
      }
      case MSG.NET_FORWARD:
        forwardMessage(socket, message);
        break;
      default:
        break;
    }
  });
  socket.on('close', () => leaveRoom(socket));
});
