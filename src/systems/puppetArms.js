// 木傀儡的「装备与战力」规则（纯逻辑，不碰 THREE / DOM / Game）。
//
// 为什么单独一个模块：用户把两条线索绑在了一起——
//   1. 「木傀儡在没有武器的情况下需要会逃跑」
//   2. 「斧头稿子也可以作战，但是斧头稿子战斗力弱，需要增加战力判断」
// 于是"我有多能打"必须由**可断言**的纯函数给出，而不是散在 WorkSystem 里的一堆 if。
//
// 本模块只回答「手里拿的是什么、它值多少战力」。
// 「这一刻该打还是该逃、打谁」在 `combatPlan.js`（Numen 式判据），
// 「什么时候抢占身体、什么时候归还」在 `combatReflex.js`。
// 这样拆的原因见那两个文件的头部注释：旧实现把三件事混在 WorkSystem 里，
// 于是每帧重算一次、判定含距离、没有记忆，表现就是用户报的「互相拉扯」。
//
// 两条硬约束：
//   - 战力公式对**双方用同一个**，否则"我打不打得过他"没有意义；
//   - 只读 `definition`，不查 buff / 装备加成。傀儡的决定必须能被单测复现，
//     不能因为某帧刚好叠了一层 buff 就让同一份数据得出不同结论。
import { ITEM_DEFINITIONS, UNIT_DEFINITIONS } from '../data/gameData.js';
import { itemMaxDurability } from './items.js';

export const PUPPET_GEAR = {
  unarmed: 'unarmed',
  tool: 'tool',
  weapon: 'weapon'
};

export const PUPPET_GEAR_LABELS = {
  [PUPPET_GEAR.unarmed]: '空手',
  [PUPPET_GEAR.tool]: '临时工具',
  [PUPPET_GEAR.weapon]: '傀儡武器'
};

/** 傀儡武器族名。必须与 `gameData.js` 里 woodPuppet.weapon.family 完全一致。 */
export const PUPPET_WEAPON_FAMILY = 'puppetArm';

/**
 * 斧/镐当武器用时的伤害。
 *
 * 刻意给得低：它们是工具，不是武器。但"低"到多少是被实测校正过的：
 *   一开始给的是斧 3 / 镐 2.5，结果木傀儡**打不过任何常见敌人**——
 *   连一只狼都打不过（3 dps 打 36 血要 12 秒，狼打死它只要 7.7 秒），
 *   于是"斧头也可以作战"在体感上变成了"从不还手"（用户试玩就是这么反馈的）。
 *
 * 现在按"能打赢野狼、打不过哥布林士兵"这条界线标定：
 *   斧 4.6 dps / 镐 4.4 dps（傀儡攻击间隔为 1 秒，所以伤害就等于 dps）
 *   野狼战力 7.69 → 斧 8.19、镐 7.83，都打得过（约 4 秒，剩六成血）
 *   哥布林士兵战力 8.54 → 两个都打不过，遇到还是要逃
 * 也就是"工具能清野怪、清不了成建制的敌人"，正好接上"想推进得合成武器"。
 *
 * 改这两个数要重跑 test-puppet-arms.mjs 的标定断言，
 * 以及 test-combat-plan.mjs 里"打得过狼 / 打不过哥布林士兵"的两条判据断言。
 */
export const IMPROVISED_TOOL_DAMAGE = { axe: 4.6, pickaxe: 4.4 };

/** 这件物品是不是木傀儡能装的武器。 */
export function isPuppetWeaponItem(itemId) {
  return Boolean(itemId) && ITEM_DEFINITIONS[itemId]?.weapon?.family === PUPPET_WEAPON_FAMILY;
}

/**
 * 傀儡当前拿的是什么。
 *
 * `weaponItemId` 是换装后的武器（`unit.weaponItemId`，由 Game.applyWeaponToUnit 写入）；
 * `toolIds` 是背包里的工具实例（WorkSystem 的 pack.toolIds）。
 * 优先级：真武器 > 工具 > 空手。空手的伤害恒为 0，也就是"一定逃"的来源。
 */
export function puppetGearFor({ toolIds = [], weaponItemId = null } = {}) {
  if (isPuppetWeaponItem(weaponItemId)) {
    const definition = ITEM_DEFINITIONS[weaponItemId];
    const weapon = definition.weapon;
    return {
      kind: PUPPET_GEAR.weapon,
      itemId: weaponItemId,
      name: definition.name ?? weaponItemId,
      damage: Math.max(0, Number(weapon.damage) || 0),
      attackRate: Number.isFinite(Number(weapon.attackRate)) ? Number(weapon.attackRate) : 1,
      maxDurability: Math.max(1, Number(weapon.maxDurability) || 1),
      durabilityCost: Math.max(0, Number(weapon.durabilityCost) || 0)
    };
  }
  const tool = (toolIds ?? []).find((itemId) => IMPROVISED_TOOL_DAMAGE[itemId] != null) ?? null;
  if (tool) {
    return {
      kind: PUPPET_GEAR.tool,
      itemId: tool,
      name: ITEM_DEFINITIONS[tool]?.name ?? tool,
      damage: IMPROVISED_TOOL_DAMAGE[tool],
      // 工具挥起来比真武器慢，沿用傀儡自己的 attackRate
      attackRate: 1,
      maxDurability: Math.max(1, itemMaxDurability(tool) || 30),
      durabilityCost: Math.max(0, Number(ITEM_DEFINITIONS[tool]?.durabilityCost) || 0)
    };
  }
  return {
    kind: PUPPET_GEAR.unarmed,
    itemId: null,
    name: '空手',
    damage: 0,
    attackRate: 1,
    maxDurability: 40,
    durabilityCost: 0
  };
}

/**
 * 战力：最大 DPS × 有效血量系数。单调、可比较、双方同公式。
 * 空手（damage 0）恒为 0 —— 这是"没有武器就必须逃跑"的数学表达。
 */
export function combatPower({
  damage = 0,
  attackRate = 1,
  maxHealth = 0,
  maxShield = 0,
  armor = 0
} = {}) {
  const dps = Math.max(0, Number(damage) || 0) * Math.max(0, Number(attackRate) || 0);
  if (dps <= 0) return 0;
  const effectiveHealth = (Math.max(0, maxHealth) + Math.max(0, maxShield))
    * (1 + Math.max(0, armor) * 0.02);
  return dps * (1 + effectiveHealth / 40);
}

/** 任意单位/单位类型的战力。敌人用它，傀儡也用它（换成装备后的伤害）。 */
export function unitCombatPower(unitOrType) {
  const definition = typeof unitOrType === 'string' ? UNIT_DEFINITIONS[unitOrType] : unitOrType?.definition;
  if (!definition) return 0;
  const damage = Math.max(
    Number(definition.physicalAttack) || 0,
    Number(definition.magicAttack) || 0,
    Number(definition.damage) || 0
  );
  return combatPower({
    damage,
    attackRate: Number(definition.attackRate) || 1,
    maxHealth: definition.maxHealth,
    maxShield: definition.maxShield,
    armor: definition.armor
  });
}

/** 傀儡装备后的战力：伤害/攻速来自装备，血量来自单位。 */
export function puppetCombatPower(gear, unitOrType = 'woodPuppet') {
  const definition = typeof unitOrType === 'string' ? UNIT_DEFINITIONS[unitOrType] : unitOrType?.definition;
  if (!definition || !gear) return 0;
  return combatPower({
    damage: gear.damage,
    attackRate: gear.attackRate,
    maxHealth: definition.maxHealth,
    maxShield: definition.maxShield,
    armor: definition.armor
  });
}
