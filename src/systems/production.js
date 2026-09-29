// 生产设施的纯规则（方案第 9 节）。
//
// 和 resources.js / crafting.js 一样刻意不依赖 THREE / DOM / Game：
// "缺料就停摆""进度不会凭空跳""一段时间内产出不超过材料允许的次数"
// 这些必须能单独断言。
import { ITEM_RULES, PRODUCTION_RECIPES } from '../data/gameData.js';

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

/** 熔炉格子里是哪种原料，就匹配哪条同 unitType 的配方。 */
export function productionRecipeForInput(unitType, itemId) {
  if (!unitType || !itemId) return null;
  const id = String(itemId);
  return Object.values(PRODUCTION_RECIPES)
    .map(normalizeProductionRecipe)
    .find((recipe) => recipe?.unitType === unitType && recipe.input.itemId === id)
    ?? null;
}

export function productionRecipesForUnitType(unitType) {
  if (!unitType) return [];
  return Object.values(PRODUCTION_RECIPES)
    .map(normalizeProductionRecipe)
    .filter((recipe) => recipe?.unitType === unitType);
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

/**
 * 熔炉：进料格 + 产物输出格；产物只进 outputInv，不写入基地。
 */
export function furnaceFuelItemIds() {
  const list = ITEM_RULES.furnaceFuelItemIds;
  return Array.isArray(list) && list.length ? list.map(String) : ['wood', 'charcoal'];
}

export function isFurnaceFuelItem(itemId) {
  if (!itemId) return false;
  return furnaceFuelItemIds().includes(String(itemId));
}

export function countFurnaceFuel(fuelInv) {
  if (!fuelInv?.slots) return 0;
  const ids = new Set(furnaceFuelItemIds());
  let total = 0;
  for (const slot of fuelInv.slots) {
    if (!slot?.itemId || !ids.has(slot.itemId)) continue;
    total += Math.max(0, Math.floor(slot.count ?? 0));
  }
  return total;
}

export function maxCyclesByFurnaceFuel(fuelInv, cyclesWanted) {
  const per = Math.max(1, Math.floor(Number(ITEM_RULES.furnaceFuelPerCycle) || 1));
  const have = countFurnaceFuel(fuelInv);
  const byFuel = Math.floor(have / per);
  const want = Math.max(0, Math.floor(Number(cyclesWanted) || 0));
  return Math.min(byFuel, want);
}

export function consumeFurnaceFuel(fuelInv, cycles) {
  const times = Math.max(0, Math.floor(Number(cycles) || 0));
  if (!fuelInv || times <= 0) return { ok: true, consumed: 0 };
  const per = Math.max(1, Math.floor(Number(ITEM_RULES.furnaceFuelPerCycle) || 1));
  let need = times * per;
  const ids = new Set(furnaceFuelItemIds());
  for (let index = 0; index < fuelInv.slots.length && need > 0; index += 1) {
    const slot = fuelInv.slots[index];
    if (!slot?.itemId || !ids.has(slot.itemId)) continue;
    const take = Math.min(need, slot.count ?? 0);
    if (take <= 0) continue;
    const removed = fuelInv.removeAt(index, take);
    if (!removed.ok) return { ok: false, consumed: 0 };
    need -= removed.removed;
  }
  if (need > 0) return { ok: false, consumed: 0 };
  return { ok: true, consumed: times * per };
}

export function maxCyclesForFurnace(recipe, inputSlot, outputInv, { stackLimit = 64, fuelInv = null } = {}) {
  const normalized = normalizeProductionRecipe(recipe);
  if (!normalized || !inputSlot?.itemId || inputSlot.itemId !== normalized.input.itemId) return 0;
  if (!outputInv?.canAccept) return 0;
  const have = Math.max(0, Math.floor(inputSlot.count ?? 0));
  const byInput = Math.floor(have / normalized.input.count);
  if (byInput <= 0) return 0;
  const byOutput = maxCyclesByOutput(normalized, (itemId) => {
    if (itemId !== normalized.output.itemId) return 0;
    return outputInv.canAccept(itemId, Number.MAX_SAFE_INTEGER);
  });
  let allowed = Math.min(byInput, byOutput);
  if (fuelInv) {
    allowed = Math.min(allowed, maxCyclesByFurnaceFuel(fuelInv, allowed));
  }
  return allowed;
}

/** @deprecated 仅测试脚本兼容名 */
export const maxCyclesForFurnaceSlot = maxCyclesForFurnace;

export function settleFurnaceProduction(inputInv, outputInv, recipe, cycles, { stackLimit = 64 } = {}) {
  const normalized = normalizeProductionRecipe(recipe);
  const times = Math.max(0, Math.floor(Number(cycles) || 0));
  if (!inputInv?.slots || !outputInv?.add || !normalized || times <= 0) {
    return { ok: false, reason: 'invalid' };
  }
  const slot = inputInv.slots[0];
  if (!slot?.itemId || slot.itemId !== normalized.input.itemId) {
    return { ok: false, reason: 'no_input' };
  }
  const amounts = productionCycleAmounts(normalized, times);
  if ((slot.count ?? 0) < amounts.consumed.count) {
    return { ok: false, reason: 'no_input' };
  }
  const limit = Math.max(1, Math.floor(stackLimit));
  const room = outputInv.canAccept(amounts.produced.itemId, amounts.produced.count);
  if (room < amounts.produced.count) {
    return { ok: false, reason: 'output_full' };
  }
  const taken = inputInv.removeAt(0, amounts.consumed.count);
  if (!taken.ok) return { ok: false, reason: 'no_input' };
  const added = outputInv.add(amounts.produced.itemId, amounts.produced.count, { allowPartial: false });
  if (!added.ok) {
    inputInv.add(slot.itemId, taken.removed);
    return { ok: false, reason: 'output_full' };
  }
  return { ok: true, reason: 'none' };
}

/** @deprecated 旧单格+基地溢出逻辑，勿用于熔炉 */
export function settleProductionOnSlot(inventory, slotIndex, recipe, cycles, { stackLimit = 64 } = {}) {
  const normalized = normalizeProductionRecipe(recipe);
  const times = Math.max(0, Math.floor(Number(cycles) || 0));
  if (!inventory?.slots || !normalized || times <= 0) {
    return { ok: false, reason: 'invalid', spill: 0, spillItemId: null };
  }
  const slot = inventory.slots[slotIndex];
  if (!slot?.itemId || slot.itemId !== normalized.input.itemId) {
    return { ok: false, reason: 'no_input', spill: 0, spillItemId: null };
  }
  const amounts = productionCycleAmounts(normalized, times);
  if ((slot.count ?? 0) < amounts.consumed.count) {
    return { ok: false, reason: 'no_input', spill: 0, spillItemId: null };
  }
  slot.count -= amounts.consumed.count;
  const remInput = slot.count > 0 ? slot.count : 0;
  if (slot.count <= 0) inventory.slots[slotIndex] = null;

  const outId = amounts.produced.itemId;
  const outCount = amounts.produced.count;
  const limit = Math.max(1, Math.floor(stackLimit));
  let spill = 0;

  if (remInput > 0) {
    spill = outCount;
  } else if (!inventory.slots[slotIndex]) {
    inventory.slots[slotIndex] = { itemId: outId, count: Math.min(outCount, limit) };
    spill = Math.max(0, outCount - limit);
  } else {
    const target = inventory.slots[slotIndex];
    if (target.itemId === outId) {
      const room = Math.max(0, limit - (target.count ?? 0));
      const placed = Math.min(room, outCount);
      target.count = (target.count ?? 0) + placed;
      spill = outCount - placed;
    } else {
      spill = outCount;
    }
  }

  return {
    ok: spill === 0,
    reason: spill > 0 ? 'needs_spill' : 'none',
    spill,
    spillItemId: spill > 0 ? outId : null
  };
}
