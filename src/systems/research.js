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
  noStation: 'no_station',
  missingBlueprint: 'missing_blueprint'
};

export const RESEARCH_ERROR_LABELS = {
  [RESEARCH_ERROR.unknownTech]: '没有这项科技',
  [RESEARCH_ERROR.alreadyResearched]: '已经研究过了',
  [RESEARCH_ERROR.missingPrerequisites]: '前置科技还没研究',
  [RESEARCH_ERROR.missingInputs]: '材料不够',
  [RESEARCH_ERROR.noStation]: '需要先建好科研站',
  [RESEARCH_ERROR.missingBlueprint]: '还没有区域图纸'
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
    // 区域图纸：绑定的内圈巢穴 id。缺省 null = 这项科技不看图纸（老科技行为不变）。
    // 必须显式带过来：normalizeTech 是白名单，漏登记等于运行时永远拿不到这个字段。
    requiresNestId: tech.requiresNestId ? String(tech.requiresNestId) : null,
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
      },
      // 单位属性修正（哨站测距 / 军械保养走这里）。
      // 形状与 AttributeSet.addModifiers 兼容：{ stat, type, amount|percent, unitTypes? }。
      // 只有"能被改写"的项才留下来：stat 必须有名字，type 只认 add/multiply，
      // 数值必须是有限数，否则静默丢掉而不是在运行时制造 NaN。
      attributes: (tech.effects?.attributes ?? [])
        .filter((entry) => entry?.stat)
        .map((entry) => {
          const type = entry.type === 'multiply' ? 'multiply' : 'add';
          const numeric = type === 'multiply'
            ? (Number.isFinite(entry.percent) ? { percent: Number(entry.percent) } : (Number.isFinite(entry.factor) ? { factor: Number(entry.factor) } : null))
            : (Number.isFinite(entry.amount) ? { amount: Number(entry.amount) } : null);
          if (!numeric) return null;
          return {
            stat: String(entry.stat),
            type,
            ...numeric,
            unitTypes: (entry.unitTypes ?? []).map((value) => String(value)),
            excludeUnitTypes: (entry.excludeUnitTypes ?? []).map((value) => String(value)),
            // 作用域开关：由 unitTechModifiersFor 在纯规则层判定，不交给 AttributeSet 猜。
            mobileOnly: entry.mobileOnly === true,
            excludeBuildings: entry.excludeBuildings === true,
            weaponOnly: entry.weaponOnly === true
          };
        })
        .filter(Boolean)
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
 * 区域图纸缺口：这项科技绑定的内巢还没被打掉时返回那座巢穴的 id，否则 null。
 *
 * **拿不到权威来源时按"锁着"处理**（返回巢穴 id）：区域图纸是一项真实门槛，
 * 默认放行等于在没有点位数据的运行时白送四项能力。老科技没有 `requiresNestId`，
 * 所以既有门槛完全不受影响（它们根本走不到这里）。
 */
export function missingBlueprint(tech, context = {}) {
  const normalized = normalizeTech(tech);
  if (!normalized?.requiresNestId) return null;
  const { nestCleared = null } = context;
  if (typeof nestCleared !== 'function') return normalized.requiresNestId;
  return nestCleared(normalized.requiresNestId) === true ? null : normalized.requiresNestId;
}

/**
 * 能不能研究这项科技。`context` 由运行时提供：
 *   - researched：已研究集合
 *   - countOf：库存查询
 *   - stationReady：科研站是否已建成（不是施工中）
 *   - nestCleared：(nestId) => boolean，区域图纸权威（缺省时视为"没有图纸"）
 */
export function canResearch(techOrId, context = {}) {
  const tech = typeof techOrId === 'string' ? techById(techOrId) : normalizeTech(techOrId);
  if (!tech) return { ok: false, reason: RESEARCH_ERROR.unknownTech, missing: [], tech: null };
  const { researched = null, countOf = null, stationReady = false } = context;
  const owned = researched instanceof Set ? researched : new Set(researched ?? []);
  if (owned.has(tech.id)) return { ok: false, reason: RESEARCH_ERROR.alreadyResearched, missing: [], tech };
  if (!stationReady) return { ok: false, reason: RESEARCH_ERROR.noStation, missing: [], tech };
  const nestId = missingBlueprint(tech, context);
  if (nestId) {
    return {
      ok: false,
      reason: RESEARCH_ERROR.missingBlueprint,
      missing: [],
      requiresNestId: nestId,
      tech
    };
  }
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
 * 已研究科技给**某个单位实例**的属性修正（哨站测距 / 军械保养）。
 *
 * 入参是描述符而不是活单位，这样纯规则层能单独断言：
 *   - team：'player' | 'enemy'（默认要求 player）
 *   - type：单位类型
 *   - canMove / isBuilding / hasWeapon：用于 mobileOnly / excludeBuildings / weaponOnly
 *
 * 只做过滤，不碰 AttributeSet：真正的挂载（按唯一 source 先移除再加）在 ResearchSystem，
 * 保证重复调用、换武器、招募归队都不会把修正叠乘起来。
 */
export function unitTechModifiersFor(descriptor = {}, researched) {
  const owned = researched instanceof Set ? researched : new Set(researched ?? []);
  if (!owned.size) return [];
  const team = descriptor.team ?? 'player';
  const type = descriptor.type != null ? String(descriptor.type) : '';
  const canMove = descriptor.canMove !== false;
  const isBuilding = descriptor.isBuilding === true;
  const hasWeapon = descriptor.hasWeapon !== false;
  const modifiers = [];
  allTechs().forEach((tech) => {
    if (!owned.has(tech.id)) return;
    tech.effects.attributes.forEach((effect) => {
      // 只给己方单位：敌方/中立单位不享受玩家科技。
      if (team !== 'player') return;
      if (effect.mobileOnly && !canMove) return;
      if (effect.excludeBuildings && isBuilding) return;
      if (effect.weaponOnly && !hasWeapon) return;
      if (effect.unitTypes.length && !effect.unitTypes.includes(type)) return;
      if (effect.excludeUnitTypes.length && effect.excludeUnitTypes.includes(type)) return;
      modifiers.push({
        stat: effect.stat,
        type: effect.type,
        ...(effect.amount != null ? { amount: effect.amount } : {}),
        ...(effect.percent != null ? { percent: effect.percent } : {}),
        ...(effect.factor != null ? { factor: effect.factor } : {}),
        unitTypes: [...effect.unitTypes],
        excludeUnitTypes: [...effect.excludeUnitTypes]
      });
    });
  });
  return modifiers;
}

/** 一项科技绑定的内巢 id（没有图纸门槛时为 null）。 */
export function techNestRequirement(techOrId) {
  const tech = typeof techOrId === 'string' ? techById(techOrId) : normalizeTech(techOrId);
  return tech?.requiresNestId ?? null;
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
