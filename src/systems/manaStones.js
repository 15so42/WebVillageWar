// 魔力石的纯规则层。
//
// 设计要点（对应本轮需求的第 2 条）：
//   - 魔力石是**实例物品**，一格一块、不可堆叠（`kind: 'instance'`）；
//   - 它放在单位背包里就生效，效果是提高该单位的**最大活动魔力**（`manaCapacity`）；
//   - 多块的效果**线性叠加**，所以它是"电池"而不是"升级"：想扩容就多占格子。
//
// 和 resources.js / items.js / crafting.js 一样刻意不依赖 THREE / DOM / Game：
// "多带一块就多一份容量""卸下之后容量要立刻回落"这些必须能单独断言。
import { ITEM_DEFINITIONS, BALANCE } from '../data/gameData.js';

export const MANA_STONE_ITEM_ID = 'manaStone';

/** 默认规则；数值本身来自物品定义与 BALANCE，这里只兜底。 */
export const MANA_STONE_RULES = {
  // 单块魔力石提供的活动魔力上限
  manaBonus: 15,
  // 单个单位最多能背几块；0 表示不额外限制（真正的限制是背包格数）
  maxPerUnit: 0
};

export function manaStoneRules(overrides = {}) {
  return { ...MANA_STONE_RULES, ...(BALANCE?.manaStones ?? {}), ...(overrides ?? {}) };
}

export function isManaStoneItem(itemId) {
  return itemId === MANA_STONE_ITEM_ID;
}

export function manaStoneDefinition() {
  return ITEM_DEFINITIONS[MANA_STONE_ITEM_ID] ?? null;
}

/** 一块魔力石给多少上限：物品定义优先，规则兜底。 */
export function manaStoneBonus(itemId = MANA_STONE_ITEM_ID) {
  if (!isManaStoneItem(itemId)) return 0;
  const raw = Number(manaStoneDefinition()?.manaBonus);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return Math.max(0, Number(manaStoneRules().manaBonus) || 0);
}

/**
 * 一个背包里一共装了几块魔力石。
 * 只数实例（每块占一格），因此格数就是块数；不按 count 求和会漏掉"一格多块"这种
 * 不该存在的状态，所以这里仍然按 count 累加并只信任实例物品的 count === 1。
 */
export function manaStoneCount(inventory) {
  if (!inventory?.slots) return 0;
  return inventory.slots.reduce(
    (sum, slot) => (slot && isManaStoneItem(slot.itemId) ? sum + Math.max(1, Math.floor(slot.count ?? 1)) : sum),
    0
  );
}

/** 背包里所有魔力石提供的上限加成。 */
export function manaStoneCapacityBonus(inventory, { rules = null } = {}) {
  const count = manaStoneCount(inventory);
  if (count <= 0) return 0;
  const resolved = rules ? { ...manaStoneRules(), ...rules } : manaStoneRules();
  const perStone = Number.isFinite(Number(resolved.manaBonus)) && Number(resolved.manaBonus) > 0
    ? Number(resolved.manaBonus)
    : manaStoneBonus();
  const capped = Number(resolved.maxPerUnit) > 0
    ? Math.min(count, Math.floor(Number(resolved.maxPerUnit)))
    : count;
  return capped * perStone;
}

/**
 * 有效最大活动魔力 = 基础上限 + 背包里魔力石的加成。
 *
 * `base` 必须是**基础**上限（工作系统给的 60、设施配方给的 24 之类），
 * 不能是"已经加上加成之后"的值，否则每刷新一次就多加一份。
 */
export function effectiveManaCapacity(base, inventory, { rules = null } = {}) {
  const safeBase = Math.max(0, Number(base) || 0);
  return safeBase + manaStoneCapacityBonus(inventory, { rules });
}

/** 面板上显示的一句话说明。 */
export function manaStoneHint() {
  const per = manaStoneBonus();
  return `魔力石：每块 +${per} 最大魔力，不可堆叠、占一格，多块可叠加。`;
}
