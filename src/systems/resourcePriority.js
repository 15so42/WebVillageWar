// 资源优先级（纯逻辑，不碰 THREE / DOM / Game）。
//
// 需求原文：「b 键面板右侧除了合成玩应该增加一个资源 tab，在这里显示木傀儡可以采集到的、
// 可以合成的所有物品，然后玩家可以点击对应物品增加或者减少优先级。Ai 根据优先级去做相关任务」
// 以及后续澄清：「只影响采集：合成类物品自动换算成它的材料需求」。
//
// 所以这个模块只做一件事：**把"玩家在界面上点出来的优先级"换算成采集需求**
// （`{id, resource, weight, targetStock, enabled}`，就是 `WorkSystem.setDemands` 吃的那张表）。
//
// 三个刻意的决定：
//
// 1. **合成类物品不直接派活，只折算成材料。** 木傀儡只会采集；让它"去做魔力石"
//    需要基地自动合成，那是另一套系统。用户明确选了"只影响采集"，
//    所以点了「魔力石 +1」的效果是"去多挖点铁、多烧点炭"。
//
// 2. **换算按配方里的占比分摊，而不是把优先级原样加到每种材料上。**
//    魔力石要 4 铁 + 6 炭，如果 +1 就等于"铁 +1 且炭 +1"，那么需求 4 块魔力石时
//    两种材料拿到的权重完全一样，看不出配比。按份额分摊后炭会自然拿到更多权重。
//
// 3. **优先级可以降到负数 = 禁止采集。** 用户要的是"增加或者减少优先级"，
//    只有 0..N 的话"这一项我现在不想要"就没法表达——那才是最常见的诉求
//    （比如前期不想让傀儡跑去采纤维）。
import {
  ITEM_DEFINITIONS,
  PRODUCTION_RECIPES,
  RECIPES,
  RESOURCE_NODE_DEFINITIONS
} from '../data/gameData.js';

export const PRIORITY_MIN = -1;
export const PRIORITY_MAX = 5;
export const PRIORITY_DEFAULT = 1;

export const RESOURCE_PRIORITY_RULES = {
  min: PRIORITY_MIN,
  max: PRIORITY_MAX,
  /** 权重 = base + step × 有效优先级；再夹到 workPriority 的上下限里。 */
  baseWeight: 0.1,
  weightStep: 0.2,
  /** 目标库存 = 有效优先级 × 每级库存；到量之后这项需求自动变成"已达标"。 */
  targetStockPerLevel: 70,
  maxTargetStock: 500
};

export function resourcePriorityRules(overrides = {}) {
  return { ...RESOURCE_PRIORITY_RULES, ...(overrides ?? {}) };
}

export function clampPriority(value, rules = RESOURCE_PRIORITY_RULES) {
  const resolved = resourcePriorityRules(rules);
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) return PRIORITY_DEFAULT;
  return Math.max(resolved.min, Math.min(resolved.max, numeric));
}

/**
 * 界面上那句人话。刻意不用纯数字：
 * 「0」和「-1」对玩家来说没有区别，但"不专门去采"和"禁止采集"是两回事。
 */
export function priorityLabel(priority) {
  const value = Math.round(Number(priority)) || 0;
  if (value <= PRIORITY_MIN) return `禁止（${value}）`;
  if (value === 0) return '不采（0）';
  return `优先级 ${value}`;
}

/** 木傀儡真的能从资源节点上采到的东西（按 `resource` 去重、排序，结果稳定）。 */
export function gatherableResources() {
  const found = new Set();
  Object.values(RESOURCE_NODE_DEFINITIONS).forEach((node) => {
    if (node?.resource) found.add(String(node.resource));
  });
  return [...found].sort();
}

/**
 * 一件物品（可以是合成产物）需要哪些**可采集资源**，以及每份产出各要多少。
 *
 * 递归展开：如果某个材料本身也是加工出来的（木炭来自熔炉），就继续往下展开到可采集为止。
 *
 * ⚠️ 两条配方表都要看。合成表（`RECIPES`）之外还有**生产表**（`PRODUCTION_RECIPES`，
 * 熔炉烧炭那条链）。只查合成表的话，「魔力石」会被算成"只要铁"，因为木炭
 * 在合成表里找不到来源——于是给魔力石加优先级不会让傀儡去砍树，
 * 而玩家在界面上明明看到它需要木炭。这正是"折算成材料需求"最容易错的地方。
 *
 * `depth` 上限与 `memo` 都是为了防御配方环——数据现在没有环，
 * 但"某天有人加了一条 木炭 → 木材 → 木炭"的配方时，这里不能变成死循环。
 */
export function gatherableInputsFor(itemId, { gatherable = null, depth = 0, memo = new Map() } = {}) {
  const allowed = gatherable ?? new Set(gatherableResources());
  const cacheKey = String(itemId);
  if (memo.has(cacheKey)) return memo.get(cacheKey);
  if (depth > 6) return [];
  const recipe = findRecipeOutputting(cacheKey);
  if (!recipe) {
    const result = allowed.has(cacheKey) ? [{ itemId: cacheKey, count: 1 }] : [];
    memo.set(cacheKey, result);
    return result;
  }
  const totals = new Map();
  const outputCount = Math.max(1, Math.floor(Number(recipe.output?.count) || 1));
  recipe.inputs.forEach((input) => {
    if (!input?.itemId) return;
    const expanded = gatherableInputsFor(input.itemId, { gatherable: allowed, depth: depth + 1, memo });
    const perOutput = (Math.max(1, Math.floor(Number(input.count) || 1))) / outputCount;
    expanded.forEach((entry) => {
      totals.set(entry.itemId, (totals.get(entry.itemId) ?? 0) + entry.count * perOutput);
    });
  });
  const result = [...totals.entries()]
    .map(([id, count]) => ({ itemId: id, count: Math.round(count * 1000) / 1000 }))
    .sort((a, b) => (b.count - a.count) || a.itemId.localeCompare(b.itemId));
  memo.set(cacheKey, result);
  return result;
}

/**
 * 找"产出这件物品"的配方，把合成表与生产表统一成 `{inputs, output}`。
 * 生产表用的是单数 `input`，合成表用的是复数 `inputs`——两种写法都要接住。
 */
export function findRecipeOutputting(itemId) {
  const crafted = Object.values(RECIPES).find((entry) => entry?.output?.itemId === itemId);
  if (crafted) return { inputs: crafted.inputs ?? [], output: crafted.output };
  const produced = Object.values(PRODUCTION_RECIPES).find((entry) => entry?.output?.itemId === itemId);
  if (produced) {
    return {
      inputs: produced.input ? [produced.input] : (produced.inputs ?? []),
      output: produced.output
    };
  }
  return null;
}

/**
 * 资源 tab 的数据行。
 *
 * 两类行：
 *   - `resource`：直接可采集的资源（木材、石料、铁矿…），优先级直接派活；
 *   - `craft`   ：配方产物（熔炉、魔力石、傀儡木刃…），优先级折算成它的材料需求。
 * 顺序：先资源（按可采集顺序），再合成（按配方 id），保证同一份数据永远同样的顺序。
 */
export function resourcePriorityRows({
  priorities = {},
  stock = {},
  rules = RESOURCE_PRIORITY_RULES
} = {}) {
  const resolved = resourcePriorityRules(rules);
  const gatherable = gatherableResources();
  const rows = gatherable.map((resource) => ({
    itemId: resource,
    name: ITEM_DEFINITIONS[resource]?.name ?? resource,
    kind: 'resource',
    priority: priorities[resource] == null
      ? defaultPriorityFor(resource)
      : clampPriority(priorities[resource], resolved),
    stock: Math.max(0, Number(stock[resource]) || 0),
    gatherable: true,
    inputs: [{ itemId: resource, count: 1 }]
  }));
  const crafted = Object.values(RECIPES)
    .filter((recipe) => recipe?.output?.itemId)
    .map((recipe) => ({
      itemId: recipe.output.itemId,
      recipeId: recipe.id,
      name: ITEM_DEFINITIONS[recipe.output.itemId]?.name ?? recipe.name ?? recipe.output.itemId,
      kind: 'craft',
      priority: priorities[recipe.output.itemId] == null
        ? 0
        : clampPriority(priorities[recipe.output.itemId], resolved),
      stock: Math.max(0, Number(stock[recipe.output.itemId]) || 0),
      gatherable: false,
      inputs: gatherableInputsFor(recipe.output.itemId, { gatherable: new Set(gatherable) })
    }))
    .filter((row) => ITEM_DEFINITIONS[row.itemId])
    .sort((a, b) => String(a.itemId).localeCompare(String(b.itemId)));
  return [...rows, ...crafted];
}

/**
 * 默认优先级：木材最高、石料次之、食物再次，其余 0。
 * 与旧版硬编码的 `auto-wood 50 / auto-stone 30 / auto-food 20` 是同一套意图，
 * 只是换算到了 0..5 的刻度上（换算结果见 test-resource-priority.mjs 的标定断言）。
 */
export function defaultPriorityFor(resource) {
  if (resource === 'wood') return 3;
  if (resource === 'stone') return 2;
  if (resource === 'food') return 1;
  return 0;
}

/**
 * 把每一行的优先级合成"每种可采集资源拿到多少权重"。
 *
 * 资源行：直接贡献自己的优先级。
 * 合成行：把自己的优先级按**配方占比**分摊到材料上（见文件头的第 2 条）。
 * 负数优先级同样参与累加，所以"把某项压到 -1"能真的把它按住，
 * 而不是被别的合成需求又抬起来。
 */
export function priorityByResource(rows, rules = RESOURCE_PRIORITY_RULES) {
  const resolved = resourcePriorityRules(rules);
  const totals = new Map();
  (rows ?? []).forEach((row) => {
    if (!row || row.priority === 0) return;
    const inputs = row.inputs ?? [];
    const sum = inputs.reduce((acc, entry) => acc + (Number(entry.count) || 0), 0);
    if (!(sum > 0)) return;
    inputs.forEach((entry) => {
      const share = (Number(entry.count) || 0) / sum;
      const contribution = row.kind === 'resource' ? row.priority : row.priority * share;
      totals.set(entry.itemId, (totals.get(entry.itemId) ?? 0) + contribution);
    });
  });
  return totals;
}

/**
 * 最终的采集需求表（`WorkSystem.setDemands` 的入参）。
 *
 * `enabled` 由有效优先级决定：<= 0 表示"不要采"。注意这里**不是**把 weight 设成 0 就完事——
 * `planWorkAllocation` 会把 weight<=0 的需求判成 disabled 从而跳过，
 * 但把 enabled 也显式写出来，是为了让"为什么这项没人采"在 workerState / 调试里只有一个答案。
 */
export function demandsFromRows(rows, rules = RESOURCE_PRIORITY_RULES) {
  const resolved = resourcePriorityRules(rules);
  const totals = priorityByResource(rows, resolved);
  return [...totals.entries()]
    .map(([resource, effective]) => ({
      id: `auto-${resource}`,
      resource,
      weight: Math.max(0, resolved.baseWeight + resolved.weightStep * effective),
      targetStock: effective <= 0
        ? 0
        : Math.min(resolved.maxTargetStock, Math.round(effective * resolved.targetStockPerLevel)),
      enabled: effective > 0
    }))
    .sort((a, b) => a.resource.localeCompare(b.resource));
}

/** 一步到位：从优先级字典直接得到需求表。 */
export function demandsFromPriorities(priorities, { stock = {}, rules = RESOURCE_PRIORITY_RULES } = {}) {
  return demandsFromRows(resourcePriorityRows({ priorities, stock, rules }), rules);
}
