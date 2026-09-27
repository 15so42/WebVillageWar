// 物品与堆叠规则的纯逻辑。
//
// 和 resources.js 一样刻意不依赖 THREE / DOM / Game：物品守恒、堆叠上限、
// 实例唯一性这些规则必须能在没有渲染、没有对局的情况下单独验证。
import { ITEM_DEFINITIONS, ITEM_RULES } from '../data/gameData.js';

export const ITEM_KIND = {
  stack: 'stack',
  instance: 'instance'
};

export function itemDefinition(itemId) {
  return ITEM_DEFINITIONS[itemId] ?? null;
}

export function itemName(itemId) {
  return ITEM_DEFINITIONS[itemId]?.name ?? itemId ?? '未知物品';
}

export function itemKind(itemId) {
  return ITEM_DEFINITIONS[itemId]?.kind ?? null;
}

export function itemStackLimit(itemId) {
  const definition = ITEM_DEFINITIONS[itemId];
  if (!definition) return 0;
  return Math.max(1, Math.round(definition.stackLimit ?? 1));
}

// 实例类物品永远不合并：附魔石、工具、武器都按件管理，
// 否则「把两块不同的石头并成一块」会直接吃掉成长数据。
export function itemStacksByMerging(itemId) {
  return itemKind(itemId) === ITEM_KIND.stack;
}

export function itemRules(overrides = {}) {
  return { ...ITEM_RULES, ...(overrides ?? {}) };
}

export function isKnownItem(itemId) {
  return Boolean(ITEM_DEFINITIONS[itemId]);
}

// 资源种类与同名物品的对应关系：资源节点产出 node.resource，
// 直接就是库存里的 itemId。这里把两者的一致性做成可断言的事实。
export function resourceItemId(resourceId) {
  const definition = Object.values(ITEM_DEFINITIONS)
    .find((item) => item.category === 'resource' && item.resource === resourceId);
  return definition?.id ?? null;
}

/**
 * 能不能"交给单位"——屏幕底部快捷栏与拖拽给单位用的判据。
 *
 * 只有**装备类**物品算：工具（斧/镐）、武器、符文石、魔力石。
 * 木材石料这类堆叠材料不算：它们的作用是合成，单位背包只是中转，
 * 让它们霸占快捷栏会把"能用的东西"挤掉。
 * 判定看 `category` 而不是 `kind`：`kind` 只区分"能不能堆叠"，
 * 而"能不能给单位用"是玩法语义，两者不是一回事。
 */
export const GIVABLE_ITEM_CATEGORIES = Object.freeze(['tool', 'weapon', 'rune', 'manaStone']);

export function itemIsGivable(itemId) {
  const definition = ITEM_DEFINITIONS[itemId];
  if (!definition) return false;
  // 可放置的建筑不是"给单位"的，它走放置流程
  if (definition.placeable?.unitType) return false;
  return GIVABLE_ITEM_CATEGORIES.includes(definition.category);
}

/**
 * 快捷栏一格"用一下"是哪一类动作。
 *
 * 这是快捷栏**唯一**的分发依据：鼠标点一下、按数字键、从槽位拖出去松手，
 * 三条路径读的都是这个值。分成两处判断的话，"点"和"拖"迟早会出现两种效果
 * （同一种东西点一下是建造、拖出去是别的事），那是这类界面最难查的 bug。
 *
 *   place   —— 建筑：进入放置模式，预览跟鼠标走，左键落地 / 右键取消。
 *   consume —— 消耗品：立刻用掉（具体效果见 Game.useConsumable）。
 *   give    —— 装备（工具 / 武器 / 符文石 / 魔力石）：交给当前选中的己方单位；
 *              从槽位拖到某个单位身上时，落点决定给谁。
 *   null    —— 材料之类没有"用"这个动作的东西。**可以**放进快捷栏、可以搬运，
 *              但按下去只会得到一句说明，而不是静默什么都不发生。
 */
export const ITEM_USE = Object.freeze({
  place: 'place',
  consume: 'consume',
  give: 'give'
});

export function itemUseKind(itemId) {
  const definition = ITEM_DEFINITIONS[itemId];
  if (!definition) return null;
  if (definition.placeable?.unitType) return ITEM_USE.place;
  if (definition.category === 'consumable') return ITEM_USE.consume;
  if (itemIsGivable(itemId)) return ITEM_USE.give;
  return null;
}

let instanceCounter = 0;

// 生成唯一实例 ID。只用于本地；联机时由 Host 下发，客户端不自行发放。
export function nextItemInstanceId(itemId) {
  instanceCounter += 1;
  return `${itemId}#${instanceCounter.toString(36)}`;
}

export function resetItemInstanceCounter(value = 0) {
  instanceCounter = Math.max(0, value);
}

export function currentItemInstanceCounter() {
  return instanceCounter;
}
