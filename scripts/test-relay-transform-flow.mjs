import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { RELAY_VERSION } from '../src/network/protocol/messages.js';

const port = 19000 + Math.floor(Math.random() * 1000);
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
    host.send({ type: 'room_create', relayVersion: RELAY_VERSION, name: 'host' });
    const created = await waitFor(host.messages, (message) => message.type === 'room_create');
    client.send({ type: 'room_join', relayVersion: RELAY_VERSION, roomId: created.roomId, name: 'client' });
    await waitFor(client.messages, (message) => message.type === 'room_join');

    host.send(forward(created.roomId, { type: 'transform_stream', sampleSeq: 71 }));
    host.send(forward(created.roomId, { type: 'transform_stream', sampleSeq: 72 }));
    host.send(forward(created.roomId, { type: 'transaction', serverSeq: 1 }));

    await delay(140);
    const forwarded = client.messages.filter((message) => message.type === 'net_forward');
    assert.deepEqual(
      forwarded.filter((message) => message.payload?.type === 'transform_stream').map((message) => message.payload.sampleSeq),
      [72],
      'relay must replace an unsent transform with the newest sample'
    );
    assert.equal(
      forwarded.some((message) => message.payload?.type === 'transaction' && message.payload?.serverSeq === 1),
      true,
      'reliable messages must remain forwarded'
    );
  } finally {
    host.socket.close();
    client.socket.close();
  }
} finally {
  relay.kill();
}

console.log('relay transform flow test passed');

function forward(roomId, payload) {
  return {
    type: 'net_forward',
    relayVersion: RELAY_VERSION,
    roomId,
    to: 'broadcast',
    channel: 'game',
    payload
  };
}

async function connect(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
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
