// 合成规则的纯逻辑。
//
// 和 resources.js / items.js / drops.js 一样刻意不依赖 THREE / DOM / Game：
// "材料不够不许扣一半""做出来的东西没地方放就整笔别做"这些必须能单独断言。
//
// 之所以不按顺序调 `remove` 再 `add`，是因为那样有两种半成品状态：
//   a) 先扣材料，做完发现产物放不下 —— 材料白没了；
//   b) 先查有没有空位，再扣材料 —— 材料腾出来的格子本来可以让产物放得下，
//      于是把一次完全合法的合成误判成"放不下"。
// 所以整笔事务先在一份副本上跑通，成功了才落回真库存（见 craftRecipe）。
import { ITEM_DEFINITIONS, RECIPES } from '../data/gameData.js';
import { Inventory } from './Inventory.js';
import { itemStackLimit, itemStacksByMerging } from './items.js';

export const CRAFT_ERROR = {
  none: 'none',
  unknownRecipe: 'unknown_recipe',
  unknownItem: 'unknown_item',
  missingInputs: 'missing_inputs',
  noSpace: 'no_space',
  invalidTimes: 'invalid_times'
};

export const CRAFT_ERROR_LABELS = {
  [CRAFT_ERROR.unknownRecipe]: '没有这个配方',
  [CRAFT_ERROR.unknownItem]: '配方里有未定义的物品',
  [CRAFT_ERROR.missingInputs]: '材料不够',
  [CRAFT_ERROR.noSpace]: '库存放不下产物',
  [CRAFT_ERROR.invalidTimes]: '合成次数不合法'
};

export function allRecipes() {
  return Object.values(RECIPES);
}

export function recipeById(recipeId) {
  if (!recipeId) return null;
  return RECIPES[recipeId] ?? null;
}

/** 规范化配方：非法条目直接剔除，数量取整且至少 1。 */
export function normalizeRecipe(recipe) {
  if (!recipe?.id || !recipe.output?.itemId) return null;
  const output = {
    itemId: String(recipe.output.itemId),
    count: Math.max(1, Math.floor(Number(recipe.output.count) || 1))
  };
  const inputs = (recipe.inputs ?? [])
    .filter((entry) => entry?.itemId)
    .map((entry) => ({
      itemId: String(entry.itemId),
      count: Math.max(1, Math.floor(Number(entry.count) || 1))
    }));
  return {
    id: String(recipe.id),
    name: recipe.name != null ? String(recipe.name) : String(recipe.id),
    description: recipe.description != null ? String(recipe.description) : '',
    inputs,
    output
  };
}

/** 按次数换算后的材料需求（合成 N 次就是 N 倍的量）。 */
export function recipeInputsFor(recipe, times = 1) {
  const batches = Math.max(1, Math.floor(Number(times) || 1));
  return (normalizeRecipe(recipe)?.inputs ?? []).map((entry) => ({
    itemId: entry.itemId,
    count: entry.count * batches
  }));
}

export function recipeOutputFor(recipe, times = 1) {
  const normalized = normalizeRecipe(recipe);
  if (!normalized) return null;
  const batches = Math.max(1, Math.floor(Number(times) || 1));
  return {
    itemId: normalized.output.itemId,
    count: normalized.output.count * batches
  };
}

/** 还差哪些材料：返回 [{ itemId, need, have, missing }]，空的表示材料齐了。 */
export function missingInputs(inventory, recipe, times = 1) {
  if (!inventory) return recipeInputsFor(recipe, times).map((entry) => ({ ...entry, have: 0, missing: entry.count }));
  return recipeInputsFor(recipe, times)
    .map((entry) => {
      const have = inventory.countOf(entry.itemId);
      return { itemId: entry.itemId, need: entry.count, have, missing: Math.max(0, entry.count - have) };
    })
    .filter((entry) => entry.missing > 0);
}

/**
 * 能不能合成。返回 `{ ok, reason, missing }`。
 * 注意这里判的是"在当前库存状态下能不能做成"，包含"材料腾出格子后产物放得下"的情况，
 * 所以用的是模拟而不是简单的空位比较。
 */
export function canCraft(inventory, recipeOrId, { times = 1 } = {}) {
  return attemptCraft(inventory, recipeOrId, { times, commit: false });
}

/** 真正合成。成功才落盘，失败时库存一个字节都不变。 */
export function craftRecipe(inventory, recipeOrId, { times = 1 } = {}) {
  return attemptCraft(inventory, recipeOrId, { times, commit: true });
}

function attemptCraft(inventory, recipeOrId, { times, commit }) {
  const recipe = typeof recipeOrId === 'string' ? recipeById(recipeOrId) : normalizeRecipe(recipeOrId);
  if (!recipe) return { ok: false, reason: CRAFT_ERROR.unknownRecipe, crafted: 0, missing: [] };
  // 次数必须是正整数：静默 floor 会把 UI 传错值（比如 2.7 期望两批）藏起来，
  // 而"多做了一批"在合成里是要扣材料的，不能猜。
  const rawTimes = Number(times);
  if (!Number.isInteger(rawTimes) || rawTimes < 1) {
    return { ok: false, reason: CRAFT_ERROR.invalidTimes, crafted: 0, missing: [] };
  }
  const batches = rawTimes;
  if (!inventory) return { ok: false, reason: CRAFT_ERROR.noSpace, crafted: 0, missing: [] };

  const inputs = recipeInputsFor(recipe, batches);
  const output = recipeOutputFor(recipe, batches);
  for (const entry of [...inputs, output]) {
    if (!ITEM_DEFINITIONS[entry.itemId]) {
      return { ok: false, reason: CRAFT_ERROR.unknownItem, crafted: 0, missing: [] };
    }
  }

  const missing = missingInputs(inventory, recipe, batches);
  if (missing.length) {
    return { ok: false, reason: CRAFT_ERROR.missingInputs, crafted: 0, missing };
  }

  // 在副本上跑完整笔事务：先扣材料（这一步会腾出格子），再放产物。
  const draft = Inventory.deserialize(inventory.serialize(), {
    id: inventory.id,
    capacity: inventory.capacity
  });
  for (const entry of inputs) {
    const removed = draft.remove(entry.itemId, entry.count);
    if (!removed.ok) {
      return { ok: false, reason: CRAFT_ERROR.missingInputs, crafted: 0, missing: [{ ...entry, missing: entry.count }] };
    }
  }
  const added = draft.add(output.itemId, output.count);
  if (!added.ok || added.added !== output.count) {
    return { ok: false, reason: CRAFT_ERROR.noSpace, crafted: 0, missing: [] };
  }

  if (!commit) return { ok: true, reason: CRAFT_ERROR.none, crafted: output.count, missing: [], steps: batches };
  inventory.loadSlots(draft.serialize().slots);
  return {
    ok: true,
    reason: CRAFT_ERROR.none,
    crafted: output.count,
    recipeId: recipe.id,
    output,
    consumed: inputs,
    steps: batches
  };
}

/** 产物堆叠上限与配方数量的关系，供 UI 判断"一次能做几批"。 */
export function maxCraftableTimes(inventory, recipeOrId, { limit = 99 } = {}) {
  const recipe = typeof recipeOrId === 'string' ? recipeById(recipeOrId) : normalizeRecipe(recipeOrId);
  if (!recipe || !inventory) return 0;
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  let times = 0;
  while (times < cap && canCraft(inventory, recipe, { times: times + 1 }).ok) times += 1;
  return times;
}

/** 产物是不是可堆叠（UI 用来决定"做多了会不会占格"）。 */
export function recipeOutputStacks(recipeOrId) {
  const recipe = typeof recipeOrId === 'string' ? recipeById(recipeOrId) : normalizeRecipe(recipeOrId);
  if (!recipe) return false;
  return itemStacksByMerging(recipe.output.itemId);
}

export function recipeOutputStackLimit(recipeOrId) {
  const recipe = typeof recipeOrId === 'string' ? recipeById(recipeOrId) : normalizeRecipe(recipeOrId);
  return recipe ? itemStackLimit(recipe.output.itemId) : 0;
}
