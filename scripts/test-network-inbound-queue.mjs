import assert from 'node:assert/strict';
import { CoopMatchController } from '../src/network/CoopMatchController.js';
import { GameNetworkBridge } from '../src/network/bridge/GameNetworkBridge.js';
import { MSG } from '../src/network/protocol/messages.js';

const bridge = new GameNetworkBridge({
  role: 'client',
  localPlayerId: 'client',
  hostPlayerId: 'host',
  transport: null,
  roomId: 'room',
  matchId: 'match'
});

const applied = [];
bridge.handlePayload = (payload, fromPlayerId) => {
  applied.push({ payload, fromPlayerId });
};

bridge.enqueuePayload({ type: MSG.STATE_PATCH, matchId: 'match', serverSeq: 1 }, 'host');
bridge.enqueuePayload({ type: MSG.TRANSFORM_STREAM, matchId: 'match', sampleSeq: 1 }, 'host');
bridge.enqueuePayload({ type: MSG.TRANSFORM_STREAM, matchId: 'match', sampleSeq: 2 }, 'host');
bridge.enqueuePayload({ type: MSG.EVENT, matchId: 'match', serverSeq: 2 }, 'host');
bridge.enqueuePayload({ type: MSG.EVENT, matchId: 'other-match', serverSeq: 3 }, 'host');

assert.equal(applied.length, 0, 'gameplay payloads must wait for the render-frame flush');
bridge.flushInboundPayloads();

assert.deepEqual(
  applied.map((entry) => entry.payload.type),
  [MSG.STATE_PATCH, MSG.EVENT, MSG.TRANSFORM_STREAM],
  'reliable payloads must retain order and apply before the latest transform'
);
assert.equal(applied.at(-1).payload.sampleSeq, 2, 'stale transforms must be coalesced');

const snapshot = bridge.inboundApplicationSnapshot();
assert.equal(snapshot.reliableQueued, 0);
assert.equal(snapshot.transformsQueued, 0);
assert.equal(snapshot.coalescedTransforms, 1);
assert.ok(snapshot.payloadsPerSecond > 0);
assert.deepEqual(
  snapshot.categories.map((entry) => entry.category).sort(),
  ['event', 'state:unknown', 'transform'],
  'diagnostics must attribute application peaks to payload categories'
);

const controller = Object.create(CoopMatchController.prototype);
let lobbyRenders = 0;
let forwardedPayloads = 0;
controller.activeBridge = {};
controller.roomClient = { isHost: false };
controller.onLobbyVisible = () => {
  lobbyRenders += 1;
};
controller.handleGamePayload = () => {
  forwardedPayloads += 1;
};
controller.handleRoomUpdate({
  event: MSG.NET_FORWARD,
  forward: {
    fromPlayerId: 'host',
    payload: { type: MSG.TRANSFORM_STREAM }
  }
});
assert.equal(forwardedPayloads, 1, 'the controller must still route lobby/protocol payloads');
assert.equal(lobbyRenders, 0, 'in-match packets must not rebuild the hidden co-op lobby');

console.log('network inbound queue regression passed');
