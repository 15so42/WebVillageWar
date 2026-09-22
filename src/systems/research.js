// 科技与附魔台的纯规则（方案第 9 节）。
//
// 和 crafting.js 同源的三条要求：
//   1. 材料不够 → 整笔失败，不扣任何材料；
//   2. 前置科技没研究出来 → 拒绝，不能"先解锁再补前置"；
//   3. 建筑没建好（或还在施工）→ 拒绝。
// 这里不碰 THREE / DOM / Game，所以这些能单独断言。
import { ENCHANT_RECIPES, RESEARCH_RULES, TECH_DEFINITIONS } from '../data/gameData.js';

export const RESEARCH_ERROR = {
  none: 'none',
  unknownTech: 'unknown_tech',
  alreadyResearched: 'already_researched',
  missingPrerequisites: 'missing_prerequisites',
  missingInputs: 'missing_inputs',
  noStation: 'no_station'
};

export const RESEARCH_ERROR_LABELS = {
  [RESEARCH_ERROR.unknownTech]: '没有这项科技',
  [RESEARCH_ERROR.alreadyResearched]: '已经研究过了',
  [RESEARCH_ERROR.missingPrerequisites]: '前置科技还没研究',
  [RESEARCH_ERROR.missingInputs]: '材料不够',
  [RESEARCH_ERROR.noStation]: '需要先建好科研站'
};

export const ENCHANT_ERROR = {
  none: 'none',
  unknownEnchantment: 'unknown_enchantment',
  missingInputs: 'missing_inputs',
  noTable: 'no_table'
};

export const ENCHANT_ERROR_LABELS = {
  [ENCHANT_ERROR.unknownEnchantment]: '没有这种附魔',
  [ENCHANT_ERROR.missingInputs]: '材料不够',
  [ENCHANT_ERROR.noTable]: '需要先建好附魔台'
};

export function normalizeTech(tech) {
  if (!tech?.id) return null;
  return {
    id: String(tech.id),
    name: tech.name != null ? String(tech.name) : String(tech.id),
    description: tech.description != null ? String(tech.description) : '',
    cost: (tech.cost ?? [])
      .filter((entry) => entry?.itemId)
      .map((entry) => ({
        itemId: String(entry.itemId),
        count: Math.max(1, Math.floor(Number(entry.count) || 1))
      })),
    requires: (tech.requires ?? []).map((id) => String(id)),
    unlocks: {
      recipes: (tech.unlocks?.recipes ?? []).map((id) => String(id))
    },
    // 效果块原样保留：它是"科技改运转参数"的统一入口，
    // 解析交给下面几个按类别取用的函数，避免把各类效果塞进一个巨大的 switch。
    effects: {
      production: (tech.effects?.production ?? [])
        .filter((entry) => entry?.recipeId && entry.patch && typeof entry.patch === 'object')
        .map((entry) => ({ recipeId: String(entry.recipeId), patch: { ...entry.patch } })),
      harvest: {
        perActionBonus: Math.max(0, Math.floor(Number(tech.effects?.harvest?.perActionBonus) || 0))
      }
    }
  };
}

export function allTechs() {
  return Object.values(TECH_DEFINITIONS).map(normalizeTech).filter(Boolean);
}

export function techById(techId) {
  if (!techId) return null;
  return normalizeTech(TECH_DEFINITIONS[techId]);
}

/** 还差哪些材料：`[{ itemId, need, have, missing }]`，空数组表示齐了。 */
export function missingTechInputs(tech, countOf) {
  const normalized = normalizeTech(tech);
  if (!normalized) return [];
  return normalized.cost
    .map((entry) => {
      const have = typeof countOf === 'function'
        ? Math.max(0, Math.floor(Number(countOf(entry.itemId)) || 0))
        : 0;
      return { itemId: entry.itemId, need: entry.count, have, missing: Math.max(0, entry.count - have) };
    })
    .filter((entry) => entry.missing > 0);
}

/** 前置科技是否都已研究。 */
export function missingPrerequisites(tech, researched) {
  const normalized = normalizeTech(tech);
  if (!normalized) return [];
  const owned = researched instanceof Set ? researched : new Set(researched ?? []);
  return normalized.requires.filter((id) => !owned.has(id));
}

/**
 * 能不能研究这项科技。`context` 由运行时提供：
 *   - researched：已研究集合
 *   - countOf：库存查询
 *   - stationReady：科研站是否已建成（不是施工中）
 */
export function canResearch(techOrId, context = {}) {
  const tech = typeof techOrId === 'string' ? techById(techOrId) : normalizeTech(techOrId);
  if (!tech) return { ok: false, reason: RESEARCH_ERROR.unknownTech, missing: [], tech: null };
  const { researched = null, countOf = null, stationReady = false } = context;
  const owned = researched instanceof Set ? researched : new Set(researched ?? []);
  if (owned.has(tech.id)) return { ok: false, reason: RESEARCH_ERROR.alreadyResearched, missing: [], tech };
  if (!stationReady) return { ok: false, reason: RESEARCH_ERROR.noStation, missing: [], tech };
  const prereq = missingPrerequisites(tech, owned);
  if (prereq.length) {
    return { ok: false, reason: RESEARCH_ERROR.missingPrerequisites, missing: [], prerequisites: prereq, tech };
  }
  const missing = missingTechInputs(tech, countOf);
  if (missing.length) return { ok: false, reason: RESEARCH_ERROR.missingInputs, missing, tech };
  return { ok: true, reason: RESEARCH_ERROR.none, missing: [], tech };
}

export function normalizeEnchantRecipe(recipe) {
  if (!recipe?.enchantmentId) return null;
  return {
    enchantmentId: String(recipe.enchantmentId),
    cost: (recipe.cost ?? [])
      .filter((entry) => entry?.itemId)
      .map((entry) => ({
        itemId: String(entry.itemId),
        count: Math.max(1, Math.floor(Number(entry.count) || 1))
      }))
  };
}

export function allEnchantRecipes() {
  return ENCHANT_RECIPES.map(normalizeEnchantRecipe).filter(Boolean);
}

export function enchantRecipeById(enchantmentId) {
  if (!enchantmentId) return null;
  const found = ENCHANT_RECIPES.find((recipe) => recipe?.enchantmentId === enchantmentId);
  return normalizeEnchantRecipe(found);
}

export function missingEnchantInputs(recipe, countOf) {
  const normalized = normalizeEnchantRecipe(recipe);
  if (!normalized) return [];
  return normalized.cost
    .map((entry) => {
      const have = typeof countOf === 'function'
        ? Math.max(0, Math.floor(Number(countOf(entry.itemId)) || 0))
        : 0;
      return { itemId: entry.itemId, need: entry.count, have, missing: Math.max(0, entry.count - have) };
    })
    .filter((entry) => entry.missing > 0);
}

export function canEnchant(enchantmentId, context = {}) {
  const recipe = enchantRecipeById(enchantmentId);
  if (!recipe) return { ok: false, reason: ENCHANT_ERROR.unknownEnchantment, missing: [], recipe: null };
  const { countOf = null, tableReady = false } = context;
  if (!tableReady) return { ok: false, reason: ENCHANT_ERROR.noTable, missing: [], recipe };
  const missing = missingEnchantInputs(recipe, countOf);
  if (missing.length) return { ok: false, reason: ENCHANT_ERROR.missingInputs, missing, recipe };
  return { ok: true, reason: ENCHANT_ERROR.none, missing: [], recipe };
}

/** 配方是否已被科技解锁。没有 `tech` 字段的配方默认解锁。 */
export function recipeUnlocked(recipe, researched) {
  const techId = recipe?.tech;
  if (!techId) return true;
  const owned = researched instanceof Set ? researched : new Set(researched ?? []);
  return owned.has(String(techId));
}

/**
 * 已研究科技对某条**生产配方**的补丁，按研究顺序依次合并。
 * 只做浅合并（顶层字段覆盖），因为补丁本身就是"整段替换 output"这种粒度；
 * 需要更细的合并时再扩展，不要在这里猜调用方的意图。
 */
export function productionPatchFor(recipeId, researched) {
  if (!recipeId) return null;
  const owned = researched instanceof Set ? researched : new Set(researched ?? []);
  if (!owned.size) return null;
  let patch = null;
  allTechs().forEach((tech) => {
    if (!owned.has(tech.id)) return;
    tech.effects.production.forEach((entry) => {
      if (entry.recipeId !== String(recipeId)) return;
      patch = { ...(patch ?? {}), ...entry.patch };
    });
  });
  return patch;
}

/** 已研究科技给"每次采集动作"的加成。 */
export function harvestPerActionBonus(researched) {
  const owned = researched instanceof Set ? researched : new Set(researched ?? []);
  if (!owned.size) return 0;
  return allTechs().reduce((sum, tech) => (
    owned.has(tech.id) ? sum + tech.effects.harvest.perActionBonus : sum
  ), 0);
}

/**
 * 把补丁套到一条配方上。纯函数，返回新对象，不改原配方——
 * 配方表是共享数据，就地改会把补丁泄漏到下一局。
 */
export function applyProductionPatch(recipe, patch) {
  if (!recipe) return recipe;
  if (!patch) return recipe;
  const next = { ...recipe };
  if (patch.output) {
    next.output = {
      itemId: patch.output.itemId ?? recipe.output?.itemId,
      // 产出数量必须仍是正整数，补丁写错就退回原值而不是产出 0 个
      count: Math.max(1, Math.floor(Number(patch.output.count) || recipe.output?.count || 1))
    };
  }
  if (patch.seconds != null) {
    const seconds = Number(patch.seconds);
    if (Number.isFinite(seconds) && seconds > 0) next.seconds = seconds;
  }
  if (patch.drainPerSecond != null) {
    const drain = Number(patch.drainPerSecond);
    if (Number.isFinite(drain) && drain >= 0) next.drainPerSecond = drain;
  }
  return next;
}

export function researchRules() {
  return { ...RESEARCH_RULES };
}
