// Transform snapshots are replaceable: a newer sample contains the current
// pose, whereas command/results/UI messages must remain reliable and ordered.
export const TRANSFORM_BUFFER_LIMIT_BYTES = 32 * 1024;
export const TRANSFORM_FLUSH_INTERVAL_MS = 25;
export const TRANSFORM_MIN_SEND_INTERVAL_MS = 50;

export function isReplaceableTransform(message) {
  return message?.channel === 'game'
    && message?.payload?.type === 'transform_stream';
}

export function queueLatestTransform(connection, payload) {
  connection.pendingTransform = payload;
}

export function flushLatestTransform(socket, connection, now, send) {
  if (!connection?.pendingTransform) return false;
  if ((socket?.bufferedAmount ?? 0) >= TRANSFORM_BUFFER_LIMIT_BYTES) return false;
  if (now < (connection.nextTransformSendAt ?? 0)) return false;
  const payload = connection.pendingTransform;
  connection.pendingTransform = null;
  connection.nextTransformSendAt = now + TRANSFORM_MIN_SEND_INTERVAL_MS;
  send(socket, payload);
  return true;
}
