/** 联机同步频率与量化精度（位置/旋转故意偏低以省带宽） */

export const SYNC = {
  /** 世界状态（血量、波次、基地） */
  worldHz: 10,
  /** 位置 / 朝向 / 动画态 */
  transformHz: 5,
  /** 私有状态（手牌等）按需发送 */
  privateHz: 8,
  heartbeatSec: 12,
  reconnectGraceSec: 90,
  clientInterpBufferMs: 120,
  /** 位置量化：0.25m 一格 */
  posStep: 0.25,
  /** 朝向量化：约 8° 一步 */
  yawStep: 0.14,
  commandThrottleMs: 70
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

export function encodeAnimPhase(unit) {
  const t = (performance.now() * 0.001) % 1;
  return Math.max(0, Math.min(255, Math.floor(t * 255)));
}

export function visualStateCode(state) {
  return VISUAL_STATE_CODES[state] ?? VISUAL_STATE_CODES.idle;
}
