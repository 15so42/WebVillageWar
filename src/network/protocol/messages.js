export const MSG = {
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
  MATCH_START: 'match_start',
  SNAPSHOT_WORLD: 'snapshot_world',
  SNAPSHOT_TRANSFORM: 'snapshot_transform',
  PRIVATE_STATE: 'private_state',
  FULL_SNAPSHOT: 'full_snapshot',
  EVENT: 'event',
  EVENT_CATCHUP: 'event_catchup',
  CMD: 'cmd',
  HOST_WAITING: 'host_waiting',
  ERROR: 'error'
};

export function forwardEnvelope(roomId, from, to, payload) {
  return {
    type: MSG.NET_FORWARD,
    roomId,
    from,
    to: to ?? 'all',
    payload,
    sentAt: Date.now()
  };
}
