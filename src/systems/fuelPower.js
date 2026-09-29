// 燃料供能设施的纯规则（方案第 9 节：魔力炉「消耗燃料，为周围生产和战斗提供魔力」）。
//
// 生产设施把材料变成物品，这里把燃料变成**一段时间的供能功率**。
// 周期推进的那点数学与生产完全一样（缺料停摆、空转不攒工作量），
// 所以直接复用 `advanceProduction`——它是纯时间/周期计算，不碰任何物品。
import { FUEL_POWER_CONFIGS, POWER_RULES } from '../data/gameData.js';
import { advanceProduction } from './production.js';

export function normalizeFuelPowerConfig(config) {
  if (!config?.id || !config.fuelItemId) return null;
  const fuelPerCycle = Math.floor(Number(config.fuelPerCycle));
  const cycleSeconds = Number(config.cycleSeconds);
  const manaPerCycle = Math.floor(Number(config.manaPerCycle));
  const manaCapacity = Math.floor(Number(config.manaCapacity ?? POWER_RULES.baseManaCapacity));
  if (!Number.isFinite(fuelPerCycle) || fuelPerCycle <= 0) return null;
  if (!Number.isFinite(cycleSeconds) || cycleSeconds <= 0) return null;
  if (!Number.isFinite(manaPerCycle) || manaPerCycle <= 0) return null;
  if (!Number.isFinite(manaCapacity) || manaCapacity <= 0) return null;
  return {
    id: String(config.id),
    unitType: config.unitType != null ? String(config.unitType) : null,
    name: config.name != null ? String(config.name) : String(config.id),
    fuelItemId: String(config.fuelItemId),
    fuelPerCycle,
    cycleSeconds,
    manaPerCycle,
    manaCapacity
  };
}

export function fuelPowerConfigById(configId) {
  if (!configId) return null;
  return normalizeFuelPowerConfig(FUEL_POWER_CONFIGS[configId]);
}

export function fuelPowerConfigForUnitType(unitType) {
  if (!unitType) return null;
  const found = Object.values(FUEL_POWER_CONFIGS)
    .map(normalizeFuelPowerConfig)
    .find((config) => config?.unitType === unitType);
  return found ?? null;
}

export function allFuelPowerConfigs() {
  return Object.values(FUEL_POWER_CONFIGS).map(normalizeFuelPowerConfig).filter(Boolean);
}

/** 现有燃料够烧几个周期。 */
export function fuelCyclesAvailable(config, countOf) {
  const normalized = normalizeFuelPowerConfig(config);
  if (!normalized || typeof countOf !== 'function') return 0;
  const have = Math.max(0, Math.floor(Number(countOf(normalized.fuelItemId)) || 0));
  return Math.floor(have / normalized.fuelPerCycle);
}

/**
 * 推进一次烧燃料。
 *
 * `active` 表示"这一段它是否在供能"，判据是**手上还有燃料能覆盖下一份**：
 *   - 够烧 → 供能，并照常推进进度；
 *   - 不够 → **立即停止供能**，进度保留（燃料接上之后接着烧）。
 *
 * 注意不能写成"`cyclesAvailable > 0 || progress > 0`"：进度在缺料时是**保留**的，
 * 一旦把"有进度"也算成供能，一台烧到一半就断料的魔力炉会永远白送电。
 * 这一条是被验收脚本抓出来的（那版就是那么写的）。
 */
export function advanceFuelBurn({ progress = 0, dt = 0, config, countOf } = {}) {
  const normalized = normalizeFuelPowerConfig(config);
  if (!normalized) return { progress: 0, burned: 0, active: false, reason: 'unknown_config' };
  const cyclesAvailable = fuelCyclesAvailable(normalized, countOf);
  const active = cyclesAvailable > 0;
  const step = advanceProduction({
    progress,
    dt,
    seconds: normalized.cycleSeconds,
    cyclesAllowed: active ? cyclesAvailable : 0
  });
  return {
    progress: step.progress,
    cycles: step.cycles,
    burned: step.cycles * normalized.fuelPerCycle,
    active,
    reason: active ? 'none' : 'no_fuel',
    manaGained: step.cycles * normalized.manaPerCycle
  };
}

/** 一个周期烧掉多少燃料。结算与断言共用，避免两边算法不一致。 */
export function fuelCycleAmount(config, cycles = 1) {
  const normalized = normalizeFuelPowerConfig(config);
  if (!normalized) return 0;
  return normalized.fuelPerCycle * Math.max(0, Math.floor(Number(cycles) || 0));
}
