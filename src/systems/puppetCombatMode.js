import { ITEM_DEFINITIONS } from '../data/gameData.js';
import { itemMaxDurability, slotDurability } from './items.js';
import { unitCombatPower } from './puppetArms.js';
import { isStationaryCombatUnit } from './combatHelpers.js';
import { distance2D } from '../utils/math.js';
import { workerToolZoneSlots } from './workerInventory.js';

export const PUPPET_COMBAT_MODE = {
  avoid: 'avoid',
  fight: 'fight',
  auto: 'auto'
};

export const PUPPET_COMBAT_MODE_LABELS = {
  [PUPPET_COMBAT_MODE.avoid]: '避战',
  [PUPPET_COMBAT_MODE.fight]: '战斗',
  [PUPPET_COMBAT_MODE.auto]: '自动'
};

const DEFAULT_MODE = PUPPET_COMBAT_MODE.fight;

export function normalizePuppetCombatMode(mode) {
  if (mode === PUPPET_COMBAT_MODE.avoid || mode === PUPPET_COMBAT_MODE.auto) return mode;
  return PUPPET_COMBAT_MODE.fight;
}

export function getPuppetCombatMode(unit) {
  return normalizePuppetCombatMode(unit?.workerCombatMode);
}

export function setPuppetCombatMode(unit, mode) {
  if (!unit?.isWorker) return false;
  unit.workerCombatMode = normalizePuppetCombatMode(mode);
  return true;
}

/** 敌人附魔：每个附魔等级粗略 +10% 战力（仅自动模式判定时使用）。 */
export function foePowerForPuppetAuto(unit) {
  let power = unitCombatPower(unit);
  const enchantments = unit?.enchantments;
  if (!enchantments?.size) return power;
  enchantments.forEach((instance) => {
    const level = Math.max(1, Number(instance?.level ?? instance?.stacks ?? 1) || 1);
    power *= 1 + 0.1 * level;
  });
  return power;
}

export function applyFoePowerForPuppetDecision(foes, mode) {
  if (mode !== PUPPET_COMBAT_MODE.auto || !Array.isArray(foes)) return foes;
  return foes.map((foe) => ({
    ...foe,
    power: foePowerForPuppetAuto(foe.unit ?? foe)
  }));
}

/** 友方最近、可攻击的建筑物（箭塔、基地激光等）。 */
export function pickNearestFriendlyCombatBuilding(game, unit) {
  const candidates = game?.friendlyUnits ?? [];
  let best = null;
  let bestDistance = Infinity;
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (!candidate?.alive || candidate.underConstruction) continue;
    const attackRange = Math.max(
      0,
      Number(candidate.attackRange ?? candidate.definition?.attackRange) || 0
    );
    if (attackRange <= 0) continue;
    if (candidate.isBuilding !== true && !isStationaryCombatUnit(candidate)) continue;
    const distance = distance2D(unit.position, candidate.position);
    if (distance >= bestDistance) continue;
    best = candidate;
    bestDistance = distance;
  }
  return best;
}

export function retreatPointNearBuilding(building, unit, standOff = 2.4) {
  if (!building?.position) return null;
  const bx = building.position.x;
  const bz = building.position.z;
  const ux = unit?.position?.x ?? bx;
  const uz = unit?.position?.z ?? bz;
  const dx = ux - bx;
  const dz = uz - bz;
  const len = Math.hypot(dx, dz) || 1;
  return {
    x: bx + (dx / len) * standOff,
    z: bz + (dz / len) * standOff
  };
}
