import assert from 'node:assert/strict';
import {
  TRANSFORM_BUFFER_LIMIT_BYTES,
  TRANSFORM_MIN_SEND_INTERVAL_MS,
  flushLatestTransform,
  isReplaceableTransform,
  queueLatestTransform
} from '../server/relayBackpressure.js';

assert.equal(isReplaceableTransform({ channel: 'game', payload: { type: 'transform_stream' } }), true);
assert.equal(isReplaceableTransform({ channel: 'game', payload: { type: 'transaction' } }), false);
assert.equal(isReplaceableTransform({ channel: 'control', payload: { type: 'transform_stream' } }), false);

const socket = { bufferedAmount: TRANSFORM_BUFFER_LIMIT_BYTES };
const connection = { pendingTransform: null, nextTransformSendAt: 0 };
const sent = [];
const send = (_socket, payload) => sent.push(payload);

queueLatestTransform(connection, { sampleSeq: 41 });
queueLatestTransform(connection, { sampleSeq: 42 });
assert.equal(flushLatestTransform(socket, connection, 1_000, send), false);
assert.deepEqual(connection.pendingTransform, { sampleSeq: 42 });

socket.bufferedAmount = 0;
assert.equal(flushLatestTransform(socket, connection, 1_000, send), true);
assert.deepEqual(sent, [{ sampleSeq: 42 }]);
assert.equal(connection.pendingTransform, null);

queueLatestTransform(connection, { sampleSeq: 43 });
assert.equal(flushLatestTransform(socket, connection, 1_000 + TRANSFORM_MIN_SEND_INTERVAL_MS - 1, send), false);
assert.equal(flushLatestTransform(socket, connection, 1_000 + TRANSFORM_MIN_SEND_INTERVAL_MS, send), true);
assert.deepEqual(sent, [{ sampleSeq: 42 }, { sampleSeq: 43 }]);

console.log('relay backpressure tests passed');
