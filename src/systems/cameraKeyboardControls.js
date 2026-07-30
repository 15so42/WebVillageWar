const CAMERA_KEY_BY_CODE = Object.freeze({
  KeyW: 'w',
  KeyA: 'a',
  KeyS: 's',
  KeyD: 'd'
});

const CAMERA_KEYBOARD_BASE_SPEED = 10;
const CAMERA_KEYBOARD_ZOOM_SPEED = 0.35;

export function cameraMoveKeyForEvent(event = {}) {
  const codeKey = CAMERA_KEY_BY_CODE[event.code];
  if (codeKey) return codeKey;
  const key = String(event.key ?? '').toLowerCase();
  return key === 'w' || key === 'a' || key === 's' || key === 'd'
    ? key
    : null;
}

export function cameraKeyboardPanDelta(
  activeKeys,
  cameraOffsetDirection,
  cameraDistance,
  dt
) {
  const elapsed = Math.max(0, Number(dt) || 0);
  if (!activeKeys?.size || elapsed <= 0) return null;

  const forwardInput = (activeKeys.has('w') ? 1 : 0) - (activeKeys.has('s') ? 1 : 0);
  const sideInput = (activeKeys.has('d') ? 1 : 0) - (activeKeys.has('a') ? 1 : 0);
  if (forwardInput === 0 && sideInput === 0) return null;

  let forwardX = -(Number(cameraOffsetDirection?.x) || 0);
  let forwardZ = -(Number(cameraOffsetDirection?.z) || 0);
  const forwardLength = Math.hypot(forwardX, forwardZ);
  if (forwardLength <= 0.0001) {
    forwardX = 0;
    forwardZ = -1;
  } else {
    forwardX /= forwardLength;
    forwardZ /= forwardLength;
  }

  const rightX = -forwardZ;
  const rightZ = forwardX;
  let directionX = forwardX * forwardInput + rightX * sideInput;
  let directionZ = forwardZ * forwardInput + rightZ * sideInput;
  const directionLength = Math.hypot(directionX, directionZ);
  if (directionLength <= 0.0001) return null;
  directionX /= directionLength;
  directionZ /= directionLength;

  const speed = CAMERA_KEYBOARD_BASE_SPEED
    + Math.max(0, Number(cameraDistance) || 0) * CAMERA_KEYBOARD_ZOOM_SPEED;
  return {
    x: directionX * speed * elapsed,
    z: directionZ * speed * elapsed
  };
}

export function cameraFollowCenter(units) {
  let count = 0;
  let x = 0;
  let z = 0;

  for (const unit of units ?? []) {
    if (!unit?.alive || !unit.position) continue;
    const unitX = Number(unit.position.x);
    const unitZ = Number(unit.position.z);
    if (!Number.isFinite(unitX) || !Number.isFinite(unitZ)) continue;
    x += unitX;
    z += unitZ;
    count += 1;
  }

  if (count === 0) return null;
  return {
    x: x / count,
    z: z / count,
    count
  };
}
