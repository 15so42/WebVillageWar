/** Multiplayer stream rates and quantization. Persistent state is change-driven. */

export const SYNC = {
  transformHz: 20,
  heartbeatSec: 12,
  clientReconnectGraceSec: 90,
  hostLeaseSec: 60,
  clientProjectileLead: 0.7,
  timeSyncIntervalMs: 2_000,
  maxPositionLeadMs: 120,
  maxPositionLeadDistance: 0.75,
  positionCorrectionRate: 24,
  knockbackCorrectionRate: 30,
  maxPositionCorrectionSpeed: 18,
  maxKnockbackCorrectionSpeed: 16,
  maxStopCorrectionSpeed: 20,
  rotationCorrectionRate: 22,
  stopCorrectionRate: 28,
  snapDistance: 1.6,
  posStep: 0.02,
  yawStep: 0.035,
  commandThrottleMs: 55,
  positionEpsilon: 0.015,
  yawEpsilon: 0.02
};

export const VISUAL_STATE_CODES = {
  idle: 0,
  walk: 1,
  attack: 2,
  stunned: 3,
  dead: 4
};

export const VISUAL_STATE_FROM_CODE = Object.fromEntries(
  Object.entries(VISUAL_STATE_CODES).map(([key, value]) => [value, key])
);

export function quantizePosition(value, step = SYNC.posStep) {
  return Math.round(value / step) * step;
}

export function quantizeYaw(value, step = SYNC.yawStep) {
  let yaw = value;
  while (yaw > Math.PI) yaw -= Math.PI * 2;
  while (yaw < -Math.PI) yaw += Math.PI * 2;
  return Math.round(yaw / step) * step;
}

export function visualStateCode(state) {
  return VISUAL_STATE_CODES[state] ?? VISUAL_STATE_CODES.idle;
}
