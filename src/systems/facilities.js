// 需要魔力的功能设施的纯规则（方案第 9 节）。
//
// 只有一条真正的规则：**魔力耗尽就停机，而且要充到重启门槛才重新开工**。
//
// 为什么必须有滞回（`restartRatio`）：没有它的话，魔力在 0 附近来回时设施会
// 一帧开一帧停，箭塔表现成抽搐式射击，食堂表现成"治疗一下停一下"。
// 有了滞回，停机之后要先充到容量的 40% 才重新开工，行为是可预测的。
import { FACILITY_CONFIGS } from '../data/gameData.js';

export function normalizeFacilityConfig(config) {
  if (!config?.id || !config.unitType) return null;
  const drainPerSecond = Number(config.drainPerSecond);
  const manaCapacity = Number(config.manaCapacity);
  const restartRatio = Number(config.restartRatio ?? 0.4);
  if (!Number.isFinite(drainPerSecond) || drainPerSecond < 0) return null;
  if (!Number.isFinite(manaCapacity) || manaCapacity <= 0) return null;
  return {
    id: String(config.id),
    unitType: String(config.unitType),
    name: config.name != null ? String(config.name) : String(config.id),
    drainPerSecond,
    manaCapacity,
    restartRatio: Math.max(0, Math.min(1, Number.isFinite(restartRatio) ? restartRatio : 0.4))
  };
}

export function facilityConfigById(configId) {
  if (!configId) return null;
  return normalizeFacilityConfig(FACILITY_CONFIGS[configId]);
}

export function facilityConfigForUnitType(unitType) {
  if (!unitType) return null;
  const found = Object.values(FACILITY_CONFIGS)
    .map(normalizeFacilityConfig)
    .find((config) => config?.unitType === unitType);
  return found ?? null;
}

export function allFacilityConfigs() {
  return Object.values(FACILITY_CONFIGS).map(normalizeFacilityConfig).filter(Boolean);
}

/**
 * 这一段设施是开还是停，以及它要吃多少魔力。
 *
 * - 从"开"的状态掉到 0 才停机（`mana <= 0`）；
 * - 停机之后要充到 `capacity * restartRatio` 才重新开工；
 * - 停机期间 `drainPerSecond` 为 0，让它能重新充起来（否则永远起不来）。
 */
export function facilityPowerState({
  mana = 0,
  capacity = 0,
  restartRatio = 0.4,
  wasDown = false,
  drainPerSecond = 0
} = {}) {
  const cap = Math.max(0, Number(capacity) || 0);
  const stored = Math.max(0, Math.min(cap, Number(mana) || 0));
  if (cap <= 0) {
    // 没有魔力容量的设施不受这套规则约束（比如发生在非生存关）
    return { poweredDown: false, drainPerSecond: 0, reason: 'no_capacity' };
  }
  const threshold = cap * Math.max(0, Math.min(1, Number(restartRatio) || 0));
  const down = wasDown ? stored < threshold : stored <= 0;
  return {
    poweredDown: down,
    drainPerSecond: down ? 0 : Math.max(0, Number(drainPerSecond) || 0),
    reason: down ? (wasDown ? 'recharging' : 'no_mana') : 'powered'
  };
}
