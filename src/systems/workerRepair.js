// 木傀儡工具区耐久维护（纯逻辑）。
import { ITEM_RULES } from '../data/gameData.js';
import { itemMaxDurability, slotDurability } from './items.js';
import { workerToolZoneSlots } from './workerInventory.js';

export const WORKER_REPAIR_RULES = {
  /** 低于该比例时主动前往维修站（与补魔 lowPowerRatio 同思路）。 */
  lowDurabilityRatio: 0.35,
  /** 维修会话退出水位（迟滞）：修到这个比例以上才回去干活。 */
  rechargeDurabilityRatio: 1,
  /** 站到维修站旁多远算「在站内」。 */
  repairRange: 3.2,
  /** 每秒恢复的耐久点数（在站旁且付得起魔时）。 */
  durabilityPerSecond: 12,
  /** 每恢复 1 点耐久消耗的活动魔力。 */
  manaPerDurability: 0.1
};

export function workerRepairRules(overrides = {}) {
  return { ...WORKER_REPAIR_RULES, ...(overrides ?? {}) };
}

function distance2D(a, b) {
  return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.z ?? 0) - (b?.z ?? 0));
}

/** 工具区内可修复物品的最低耐久比例；无耐久物品返回 null。 */
export function workerMinToolZoneDurabilityRatio(inventory, rules = ITEM_RULES) {
  if (!inventory?.slots) return null;
  const end = workerToolZoneSlots(rules);
  let min = null;
  for (let i = 0; i < end; i += 1) {
    const slot = inventory.slots[i];
    if (!slot?.itemId) continue;
    const max = itemMaxDurability(slot.itemId);
    if (max <= 0) continue;
    const ratio = Math.max(0, Math.min(1, slotDurability(slot, slot.itemId) / max));
    min = min == null ? ratio : Math.min(min, ratio);
  }
  return min;
}

export function workerNeedsGearRepair(inventory, repairing = false, overrides = {}) {
  const resolved = workerRepairRules(overrides);
  const min = workerMinToolZoneDurabilityRatio(inventory);
  if (min == null) return false;
  return repairing
    ? min < resolved.rechargeDurabilityRatio
    : min <= resolved.lowDurabilityRatio;
}

/**
 * 选最近的可用维修站（已建成、存活、未断电）。
 * `stations` 每项：`{ id, x, z, poweredDown }`
 */
export function pickNearestRepairStation(workerPosition, stations = [], overrides = {}) {
  const resolved = workerRepairRules(overrides);
  let best = null;
  for (let i = 0; i < stations.length; i += 1) {
    const station = stations[i];
    if (!station || station.poweredDown === true) continue;
    const pos = { x: station.x ?? 0, z: station.z ?? 0 };
    const distance = distance2D(workerPosition, pos);
    if (distance > 120) continue;
    if (!best || distance < best.distance) {
      best = { ...station, x: pos.x, z: pos.z, distance };
    }
  }
  return best;
}

export function workerAtRepairStation(workerPosition, station, overrides = {}) {
  if (!station) return false;
  const resolved = workerRepairRules(overrides);
  return distance2D(workerPosition, { x: station.x ?? 0, z: station.z ?? 0 }) <= resolved.repairRange;
}

/** 本帧可恢复多少耐久（受魔力上限约束）。 */
export function repairBudgetForTick({ activityMana = 0, dt = 0, overrides = {} } = {}) {
  const resolved = workerRepairRules(overrides);
  const mana = Math.max(0, Number(activityMana) || 0);
  const rate = Math.max(0, resolved.durabilityPerSecond) * Math.max(0, dt);
  const maxByMana = mana / Math.max(0.001, resolved.manaPerDurability);
  return Math.max(0, Math.min(rate, maxByMana));
}

/** 把预算分配到工具区各格（优先最残的）。返回 { restored, manaSpent, touched }。 */
export function applyRepairToToolZone(inventory, budget, rules = ITEM_RULES) {
  const remaining = Math.max(0, Number(budget) || 0);
  if (remaining <= 0 || !inventory?.slots) {
    return { restored: 0, manaSpent: 0, touched: false };
  }
  const end = workerToolZoneSlots(rules);
  const slots = [];
  for (let i = 0; i < end; i += 1) {
    const slot = inventory.slots[i];
    if (!slot?.itemId) continue;
    const max = itemMaxDurability(slot.itemId);
    if (max <= 0) continue;
    const current = slotDurability(slot, slot.itemId);
    const missing = Math.max(0, max - current);
    if (missing <= 0) continue;
    slots.push({ index: i, slot, max, current, missing });
  }
  slots.sort((a, b) => (a.current / a.max) - (b.current / b.max));
  let left = remaining;
  let restored = 0;
  let touched = false;
  for (let s = 0; s < slots.length && left > 0.001; s += 1) {
    const entry = slots[s];
    const add = Math.min(left, entry.missing);
    if (add <= 0) continue;
    if (!entry.slot.data) entry.slot.data = {};
    entry.slot.data.durability = entry.current + add;
    restored += add;
    left -= add;
    touched = true;
  }
  const manaPer = workerRepairRules().manaPerDurability;
  return { restored, manaSpent: restored * manaPer, touched };
}
