export const RELAY_VERSION = 2;
export const GAME_PROTOCOL_VERSION = 'multiplayer-v3';
export const CATALOG_VERSION = 'cards-v1';

export const MATCH_PHASE = Object.freeze({
  LOBBY_EDITING: 'LOBBY_EDITING',
  READY_CHECK: 'READY_CHECK',
  MATCH_LOADING: 'MATCH_LOADING',
  OPENING_SELECTION: 'OPENING_SELECTION',
  RUNNING: 'RUNNING',
  ENDED: 'ENDED'
});

export const MSG = Object.freeze({
  // Relay protocol. The relay is intentionally unaware of game rules.
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
  CONNECTION_LOST: 'connection_lost',
  NET_FORWARD: 'net_forward',
  ERROR: 'error',

  // End-to-end game protocol. These values are opaque to the relay.
  COMMAND: 'command',
  COMMAND_ACCEPTED: 'command_accepted',
  COMMAND_REJECTED: 'command_rejected',
  VERSION_HELLO: 'version_hello',
  VERSION_RESULT: 'version_result',
  LOBBY_STATE: 'lobby_state',
  MATCH_LOADING_STARTED: 'match_loading_started',
  MATCH_RESUME: 'match_resume',
  MATCH_PHASE_CHANGED: 'match_phase_changed',
  MATCH_RUNNING: 'match_running',
  STATE_PATCH: 'state_patch',
  TRANSACTION: 'transaction',
  UI_STATE: 'ui_state',
  TRANSFORM_STREAM: 'transform_stream',
  MOTION_EVENT: 'motion_event',
  TIME_SYNC_REQUEST: 'time_sync_request',
  TIME_SYNC_RESPONSE: 'time_sync_response',
  FULL_SNAPSHOT: 'full_snapshot',
  RESYNC_REQUEST: 'resync_request',
  EVENT: 'event',
  HOST_WAITING: 'host_waiting'
});

export const COMMAND = Object.freeze({
  READY_SET: 'ready_set',
  CLIENT_LOADED: 'client_loaded',
  PLAY_CARD: 'play_card',
  DISCARD_CARD: 'discard_card',
  ISSUE_MOVE: 'issue_move',
  ISSUE_GUARD: 'issue_guard',
  ISSUE_STOP: 'issue_stop',
  SELECTION_SET: 'selection_set',
  REWARD_CHOOSE: 'reward_choose',
  REWARD_REROLL: 'reward_reroll',
  REWARD_SKIP: 'reward_skip',
  SHOP_CATEGORY: 'shop_category',
  SHOP_CHOOSE: 'shop_choose',
  SHOP_ENERGY: 'shop_energy',
  SHOP_BACK: 'shop_back',
  SHOP_REWARD_SKIP: 'shop_reward_skip'
});

export function relayEnvelope(roomId, to, payload) {
  return {
    type: MSG.NET_FORWARD,
    relayVersion: RELAY_VERSION,
    roomId,
    to: to ?? 'broadcast',
    channel: 'game',
    payload
  };
}

export function createCommand({
  matchId = null,
  playerId,
  clientSeq,
  expectedPhaseRevision = 0,
  name,
  payload = {}
}) {
  return {
    type: MSG.COMMAND,
    gameProtocolVersion: GAME_PROTOCOL_VERSION,
    matchId,
    commandId: `${playerId}:${clientSeq}`,
    clientSeq,
    expectedPhaseRevision,
    name,
    payload
  };
}
