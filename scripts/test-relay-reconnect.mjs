import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { COMMAND, MSG, RELAY_VERSION } from '../src/network/protocol/messages.js';

const port = 20000 + Math.floor(Math.random() * 1000);
const relay = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: { ...process.env, COOP_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

try {
  await waitForRelay(relay);
  const host = await connect(port);
  const client = await connect(port);
  try {
    host.send({ type: MSG.ROOM_CREATE, relayVersion: RELAY_VERSION, name: 'host' });
    const created = await waitFor(host.messages, (message) => message.type === MSG.ROOM_CREATE);

    client.send({
      type: MSG.ROOM_JOIN,
      relayVersion: RELAY_VERSION,
      roomId: created.roomId,
      name: 'client'
    });
    const joined = await waitFor(client.messages, (message) => message.type === MSG.ROOM_JOIN);

    client.send({
      type: MSG.RECONNECT,
      relayVersion: RELAY_VERSION,
      roomId: created.roomId,
      reconnectToken: joined.reconnectToken
    });
    const reconnected = await waitFor(client.messages, (message) => message.type === MSG.RECONNECT_OK);

    assert.equal(reconnected.playerId, joined.playerId);
    assert.ok(reconnected.room.players[joined.playerId], 'same-socket reconnect must keep the player in room');
    assert.equal(
      reconnected.room.playerOrder.filter((playerId) => playerId === joined.playerId).length,
      1,
      'same-socket reconnect must not duplicate the player order entry'
    );

    client.send(forward(created.roomId, created.playerId, {
      type: MSG.COMMAND,
      commandId: `${joined.playerId}:ready`,
      name: COMMAND.READY_SET
    }));

    const forwarded = await waitFor(host.messages, (message) => (
      message.type === MSG.NET_FORWARD
      && message.fromPlayerId === joined.playerId
      && message.payload?.name === COMMAND.READY_SET
    ));
    assert.equal(forwarded.to, created.playerId);
  } finally {
    host.socket.close();
    client.socket.close();
  }
} finally {
  relay.kill();
}

console.log('relay reconnect regression passed');

function forward(roomId, to, payload) {
  return {
    type: MSG.NET_FORWARD,
    relayVersion: RELAY_VERSION,
    roomId,
    to,
    channel: 'game',
    payload
  };
}

async function connect(portNumber) {
  const socket = new WebSocket(`ws://127.0.0.1:${portNumber}`);
  const messages = [];
  socket.on('message', (raw) => messages.push(JSON.parse(String(raw))));
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return { socket, messages, send: (payload) => socket.send(JSON.stringify(payload)) };
}

async function waitFor(messages, predicate, timeoutMs = 1_500) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const match = messages.find(predicate);
    if (match) return match;
    await delay(10);
  }
  throw new Error('timed out waiting for relay message');
}

async function waitForRelay(process) {
  let output = '';
  process.stdout.on('data', (chunk) => { output += String(chunk); });
  process.stderr.on('data', (chunk) => { output += String(chunk); });
  const until = Date.now() + 1_500;
  while (Date.now() < until) {
    if (output.includes('listening on')) return;
    if (process.exitCode !== null) throw new Error(`relay exited: ${output}`);
    await delay(10);
  }
  throw new Error(`relay did not start: ${output}`);
}
