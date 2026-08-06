import assert from 'node:assert/strict';
import { CoopMatchController } from '../src/network/CoopMatchController.js';
import { GameNetworkBridge } from '../src/network/bridge/GameNetworkBridge.js';
import { MSG } from '../src/network/protocol/messages.js';
import { mergeMultiplayerDecksAtHighestLevel } from '../src/network/session/MultiplayerSession.js';

assert.deepEqual(
  mergeMultiplayerDecksAtHighestLevel([
    [{ id: 'swordsman', level: 2 }, { id: 'archer', level: 7 }],
    [{ id: 'swordsman', level: 5 }, { id: 'fireball', level: 3 }],
    [{ id: 'archer', level: 4 }, { id: 'fireball', level: 6 }]
  ]),
  [
    { id: 'swordsman', level: 5 },
    { id: 'archer', level: 7 },
    { id: 'fireball', level: 6 }
  ],
  'the shared co-op deck must use the highest level of each card in stable order'
);

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

{
  const saved = {
    roomId: 'ABC123',
    playerId: 'client-old',
    hostPlayerId: 'host',
    reconnectToken: 'token-old',
    expiresAt: Date.now() + 60_000
  };
  let confirmCalls = 0;
  let joinCalls = 0;
  const reconnectController = Object.create(CoopMatchController.prototype);
  Object.assign(reconnectController, {
    pendingReconnectSession: null,
    roomClient: {
      transport: {
        loadSession: () => saved,
        clearSession: () => {}
      },
      joinRoom: () => {
        joinCalls += 1;
      }
    },
    confirmReconnect: () => {
      confirmCalls += 1;
      return true;
    },
    onNotice: () => {},
    resetMatchState: () => {
      throw new Error('joining the saved room must not create a fresh player');
    }
  });

  reconnectController.joinRoom('abc123', 'client');

  assert.equal(confirmCalls, 1, 'joining the saved room should be redirected to reconnect');
  assert.equal(joinCalls, 0, 'redirected reconnect must not create a duplicate lobby player');
  assert.equal(reconnectController.pendingReconnectSession, saved);
}

{
  const saved = {
    roomId: 'ABC123',
    playerId: 'client-old',
    hostPlayerId: 'host',
    reconnectToken: 'token-old',
    matchActive: true,
    expiresAt: Date.now() + 60_000
  };
  let reconnectCalls = 0;
  let watchCalls = 0;
  let versionHelloCalls = 0;
  let lobbyRendersAfterConfirm = 0;
  const liveController = Object.create(CoopMatchController.prototype);
  Object.assign(liveController, {
    pendingReconnectSession: saved,
    reconnectRequestSession: null,
    roomClient: {
      room: { id: 'ABC123' },
      playerId: 'client-old',
      isRoomBound: true,
      transport: {
        connected: true,
        clearSession: () => {}
      },
      reconnect: () => {
        reconnectCalls += 1;
        return Promise.resolve(true);
      }
    },
    startReconnectResumeWatch: () => {
      watchCalls += 1;
    },
    sendVersionHello: () => {
      versionHelloCalls += 1;
      return true;
    },
    onNotice: () => {},
    onLobbyVisible: () => {
      lobbyRendersAfterConfirm += 1;
    },
    viewState: (state) => state
  });

  assert.equal(liveController.confirmReconnect(), true);
  assert.equal(reconnectCalls, 0, 'already connected players must not send a second reconnect');
  assert.equal(versionHelloCalls, 1, 'already connected players should re-request Host resume');
  assert.equal(watchCalls, 1, 'active matches should keep waiting for Host resume');
  assert.equal(lobbyRendersAfterConfirm, 1);
  assert.equal(liveController.pendingReconnectSession, null);
}

{
  const saved = {
    roomId: 'ABC123',
    playerId: 'client-old',
    hostPlayerId: 'host',
    reconnectToken: 'token-old',
    matchActive: true,
    expiresAt: Date.now() + 60_000
  };
  let reconnectCalls = 0;
  let versionHelloCalls = 0;
  const probedController = Object.create(CoopMatchController.prototype);
  Object.assign(probedController, {
    pendingReconnectSession: saved,
    reconnectRequestSession: null,
    roomClient: {
      room: { id: 'ABC123' },
      playerId: 'client-old',
      // RECONNECT_PROBE opens a WebSocket but does not bind it to the room.
      // Stale local room/player fields must never make that socket look resumed.
      isRoomBound: false,
      transport: {
        connected: true,
        clearSession: () => {}
      },
      reconnect: () => {
        reconnectCalls += 1;
        return Promise.resolve(true);
      }
    },
    sendVersionHello: () => {
      versionHelloCalls += 1;
      return true;
    },
    onNotice: () => {},
    onLobbyVisible: () => {},
    viewState: (state) => state
  });

  assert.equal(probedController.confirmReconnect(), true);
  assert.equal(reconnectCalls, 1, 'a probe-only socket must still send the real reconnect request');
  assert.equal(versionHelloCalls, 0, 'version hello must wait until RECONNECT_OK binds the socket');
  assert.equal(probedController.reconnectRequestSession, saved);
}

console.log('network inbound queue regression passed');
