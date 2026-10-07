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

/** 三种模式的简短含义：toggle 常驻显示的那一行，不能再让玩家靠猜。 */
export const PUPPET_COMBAT_MODE_MEANINGS = {
  [PUPPET_COMBAT_MODE.avoid]: '遇敌撤向最近友方可攻击建筑，不还手',
  [PUPPET_COMBAT_MODE.fight]: '遇敌主动迎战，打得过就打',
  [PUPPET_COMBAT_MODE.auto]: '按战力与敌附魔估算打或逃'
};

/** 多选里出现不同模式时的显示名。 */
export const PUPPET_COMBAT_MODE_MIXED_LABEL = '混合';

/** toggle 下方的短建议：一致状态下替代"重复含义"，只说这条策略该怎么用。 */
export const PUPPET_COMBAT_MODE_HINTS = {
  [PUPPET_COMBAT_MODE.avoid]: '采集期用这条：遇敌先跑，别为一把斧子送掉唯一的工人。',
  [PUPPET_COMBAT_MODE.fight]: '清点期用这条：想主动接战就先给它装上傀儡武器。',
  [PUPPET_COMBAT_MODE.auto]: '不确定敌人强弱时用这条：打不过就撤，打得过才上。'
};

/** 单选/多选统一口径：返回 { mode, mixed, count, modes }。 */
export function summarizePuppetCombatModes(units) {
  const workers = (Array.isArray(units) ? units : [units])
    .filter((unit) => unit?.isWorker === true && unit.alive !== false);
  if (!workers.length) return { mode: null, mixed: false, count: 0, modes: [] };
  const modes = [...new Set(workers.map((unit) => getPuppetCombatMode(unit)))];
  return {
    mode: modes.length === 1 ? modes[0] : null,
    mixed: modes.length > 1,
    count: workers.length,
    modes
  };
}

/** 当前模式的完整显示文案（toggle 顶部那行）。 */
export function puppetCombatModeSummaryText(units) {
  const summary = summarizePuppetCombatModes(units);
  if (!summary.count) return '未选中木傀儡';
  if (summary.mixed) {
    return `${PUPPET_COMBAT_MODE_MIXED_LABEL}（${summary.modes.map((mode) => PUPPET_COMBAT_MODE_LABELS[mode]).join(' / ')}）`;
  }
  return `${PUPPET_COMBAT_MODE_LABELS[summary.mode]}：${PUPPET_COMBAT_MODE_MEANINGS[summary.mode]}`;
}

/** 批量设置（多选不同模式时一次改成同一个）。返回真正改动的单位数。 */
export function setPuppetCombatModeForUnits(units, mode) {
  const next = normalizePuppetCombatMode(mode);
  let changed = 0;
  (Array.isArray(units) ? units : [units]).forEach((unit) => {
    if (unit?.isWorker !== true) return;
    if (getPuppetCombatMode(unit) === next) return;
    if (setPuppetCombatMode(unit, next)) changed += 1;
  });
  return changed;
}

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
