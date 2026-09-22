// 生产设施的纯规则（方案第 9 节）。
//
// 和 resources.js / crafting.js 一样刻意不依赖 THREE / DOM / Game：
// "缺料就停摆""进度不会凭空跳""一段时间内产出不超过材料允许的次数"
// 这些必须能单独断言。
import { PRODUCTION_RECIPES } from '../data/gameData.js';

export const PRODUCTION_ERROR = {
  none: 'none',
  unknownRecipe: 'unknown_recipe',
  invalidRecipe: 'invalid_recipe'
};

/**
 * 规范化一条生产配方：非法条目返回 null，而不是产出一堆 NaN。
 * 输出的是「一个周期」的量，`seconds` 决定周期长度。
 */
export function normalizeProductionRecipe(recipe) {
  if (!recipe?.id || !recipe.input?.itemId || !recipe.output?.itemId) return null;
  const inputCount = Math.floor(Number(recipe.input.count));
  const outputCount = Math.floor(Number(recipe.output.count));
  const seconds = Number(recipe.seconds);
  if (!Number.isFinite(inputCount) || inputCount <= 0) return null;
  if (!Number.isFinite(outputCount) || outputCount <= 0) return null;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return {
    id: String(recipe.id),
    name: recipe.name != null ? String(recipe.name) : String(recipe.id),
    unitType: recipe.unitType != null ? String(recipe.unitType) : null,
    input: { itemId: String(recipe.input.itemId), count: inputCount },
    output: { itemId: String(recipe.output.itemId), count: outputCount },
    seconds,
    drainPerSecond: Math.max(0, Number(recipe.drainPerSecond) || 0),
    manaCapacity: Math.max(0, Number(recipe.manaCapacity) || 0)
  };
}

export function productionRecipeById(recipeId) {
  if (!recipeId) return null;
  return normalizeProductionRecipe(PRODUCTION_RECIPES[recipeId]);
}

export function productionRecipeForUnitType(unitType) {
  if (!unitType) return null;
  const found = Object.values(PRODUCTION_RECIPES)
    .map(normalizeProductionRecipe)
    .find((recipe) => recipe?.unitType === unitType);
  return found ?? null;
}

export function allProductionRecipes() {
  return Object.values(PRODUCTION_RECIPES).map(normalizeProductionRecipe).filter(Boolean);
}

/**
 * 一帧的生产推进。
 *
 * 输入：
 *   - progress：这个设施已经攒了多久（秒）
 *   - dt：这一段的时间
 *   - cyclesAllowed：**这一段最多能做几个周期**，由「基地库存里现有材料够做几次」
 *     与「产物还放得下几次」共同决定，取小值。调用方算，因为那需要读库存。
 *
 * 输出：新的进度与这一段应该结算的周期数。
 * 关键性质：**进度只在真的结算后按 seconds 回绕**，不会因为材料不够而清零——
 * 材料接上之后应该接着烧，而不是从头再来。
 */
export function advanceProduction({ progress = 0, dt = 0, seconds = 1, cyclesAllowed = 0 } = {}) {
  const period = Number(seconds);
  const step = Math.max(0, Number(dt) || 0);
  const allowed = Math.max(0, Math.floor(Number(cyclesAllowed) || 0));
  if (!Number.isFinite(period) || period <= 0) return { progress: 0, cycles: 0, stalled: true };
  if (allowed <= 0) {
    // 做不了：进度原地保留（可能是缺料，也可能是产物放不下）
    return { progress: Math.max(0, Number(progress) || 0), cycles: 0, stalled: true };
  }
  const total = Math.max(0, Number(progress) || 0) + step;
  const cycles = Math.min(allowed, Math.floor(total / period));
  // **空转时间不能攒成下一次的工作量。**
  // `cyclesAllowed` 是材料/空间给的"这一段最多做几次"，不是时间给的：
  // 材料不够的那段时间设施是闲着的，如果按 total 直接留余数，
  // 一台饿了一百秒的熔炉会在木材到的瞬间一次做掉十几批。
  // 所以最多只保留一个周期的进度。
  const remainder = Math.min(total - cycles * period, period);
  return { progress: remainder, cycles, stalled: false };
}

/**
 * 现有材料最多能做几个周期。`countOf` 是库存的查询函数（传进来而不是读全局）。
 * 返回的只是**材料上限**，还要和产物的空间上限取小值。
 */
export function maxCyclesByInput(recipe, countOf) {
  const normalized = normalizeProductionRecipe(recipe);
  if (!normalized || typeof countOf !== 'function') return 0;
  const have = Math.max(0, Math.floor(Number(countOf(normalized.input.itemId)) || 0));
  return Math.floor(have / normalized.input.count);
}

/** 产物的空间最多还能放几个周期。`canAccept` 同样是注入的。 */
export function maxCyclesByOutput(recipe, canAccept) {
  const normalized = normalizeProductionRecipe(recipe);
  if (!normalized || typeof canAccept !== 'function') return 0;
  const room = Math.max(0, Math.floor(Number(canAccept(normalized.output.itemId)) || 0));
  return Math.floor(room / normalized.output.count);
}

/** 一个周期的材料与产物，按次数放大。结算与断言都用它，避免两边算法不一致。 */
export function productionCycleAmounts(recipe, cycles = 1) {
  const normalized = normalizeProductionRecipe(recipe);
  if (!normalized) return null;
  const times = Math.max(0, Math.floor(Number(cycles) || 0));
  return {
    consumed: { itemId: normalized.input.itemId, count: normalized.input.count * times },
    produced: { itemId: normalized.output.itemId, count: normalized.output.count * times }
  };
}
