// 树坑与种植的纯规则（方案第 9 节）。
//
// 一个回合的状态机：
//   empty     坑是空的，等树苗
//   growing   已种下，正在长（progress / growthSeconds）
//   grown     旁边已经长出一棵树，等傀儡去砍
//
// 三条来自方案第 9 节的硬要求：
//   1. **保留量**：只在树苗数量**超过** `reserveSaplings` 时才补种，
//      避免把下一轮种植所需的苗也种掉。
//   2. **净产出为正**：一棵橡树 45 木材 ÷ 15 = 3 棵树苗，补种只花 1 棵。
//      这条按数据直接算得出来，不靠手感。
//   3. 同时最多养 `maxGrownNodes` 棵，防止无限铺开塞满地图。
import { PLANTING_CONFIGS, RESOURCE_NODE_DEFINITIONS } from '../data/gameData.js';

export const PLANTING_STATE = {
  empty: 'empty',
  growing: 'growing',
  grown: 'grown'
};

export const PLANTING_ERROR = {
  none: 'none',
  unknownConfig: 'unknown_config',
  noSapling: 'no_sapling',
  belowReserve: 'below_reserve',
  alreadyPlanted: 'already_planted',
  plotFull: 'plot_full'
};

export const PLANTING_ERROR_LABELS = {
  [PLANTING_ERROR.unknownConfig]: '这个设施不能种植',
  [PLANTING_ERROR.noSapling]: '没有树苗',
  [PLANTING_ERROR.belowReserve]: '树苗要留种，先攒够再种',
  [PLANTING_ERROR.alreadyPlanted]: '已经种下了',
  [PLANTING_ERROR.plotFull]: '这块地已经长满了'
};

export function normalizePlantingConfig(config) {
  if (!config?.id || !config.saplingItemId || !config.nodeDefinitionId) return null;
  const saplingCost = Math.max(1, Math.floor(Number(config.saplingCost) || 1));
  const reserveSaplings = Math.max(0, Math.floor(Number(config.reserveSaplings) || 0));
  const growthSeconds = Number(config.growthSeconds);
  const spawnRadius = Number(config.spawnRadius);
  const maxGrownNodes = Math.max(1, Math.floor(Number(config.maxGrownNodes) || 1));
  if (!Number.isFinite(growthSeconds) || growthSeconds <= 0) return null;
  if (!Number.isFinite(spawnRadius) || spawnRadius <= 0) return null;
  return {
    id: String(config.id),
    unitType: config.unitType != null ? String(config.unitType) : null,
    name: config.name != null ? String(config.name) : String(config.id),
    saplingItemId: String(config.saplingItemId),
    saplingCost,
    reserveSaplings,
    growthSeconds,
    nodeDefinitionId: String(config.nodeDefinitionId),
    spawnRadius,
    maxGrownNodes
  };
}

export function plantingConfigById(configId) {
  if (!configId) return null;
  return normalizePlantingConfig(PLANTING_CONFIGS[configId]);
}

export function plantingConfigForUnitType(unitType) {
  if (!unitType) return null;
  const found = Object.values(PLANTING_CONFIGS)
    .map(normalizePlantingConfig)
    .find((config) => config?.unitType === unitType);
  return found ?? null;
}

export function allPlantingConfigs() {
  return Object.values(PLANTING_CONFIGS).map(normalizePlantingConfig).filter(Boolean);
}

/**
 * 现在能不能补种。
 *
 * **保留量是这里的核心**：要求 `have >= saplingCost + reserveSaplings`，
 * 而不是 `have >= saplingCost`。写成后者的话，最后一棵苗也会被种掉，
 * 一旦这一轮产出没跟上（比如树被敌人砍了）就再也没有下一轮。
 */
export function canPlant(config, { saplings = 0, grownNodes = 0, state = PLANTING_STATE.empty } = {}) {
  const normalized = normalizePlantingConfig(config);
  if (!normalized) return { ok: false, reason: PLANTING_ERROR.unknownConfig };
  if (state === PLANTING_STATE.growing) return { ok: false, reason: PLANTING_ERROR.alreadyPlanted };
  if (grownNodes >= normalized.maxGrownNodes) return { ok: false, reason: PLANTING_ERROR.plotFull };
  const have = Math.max(0, Math.floor(Number(saplings) || 0));
  if (have < normalized.saplingCost) return { ok: false, reason: PLANTING_ERROR.noSapling };
  if (have < normalized.saplingCost + normalized.reserveSaplings) {
    return { ok: false, reason: PLANTING_ERROR.belowReserve };
  }
  return { ok: true, reason: PLANTING_ERROR.none };
}

/**
 * 推进生长。返回新的进度与是否长成。
 * 与生产设施的周期推进同一条纪律：**进度不会因为别的原因被清零**，
 * 缺苗只是"不开始新的"，已经在长的树照长不误（它已经种下去了）。
 */
export function advanceGrowth({ progress = 0, dt = 0, growthSeconds = 1 } = {}) {
  const period = Number(growthSeconds);
  const step = Math.max(0, Number(dt) || 0);
  if (!Number.isFinite(period) || period <= 0) return { progress: 0, grown: false };
  const next = Math.max(0, Number(progress) || 0) + step;
  if (next >= period) return { progress: period, grown: true };
  return { progress: next, grown: false };
}

/** 生长进度 0..1（给"树苗渐渐长高"的视觉用）。 */
export function growthRatio(progress, growthSeconds) {
  const period = Number(growthSeconds);
  if (!Number.isFinite(period) || period <= 0) return 0;
  return Math.max(0, Math.min(1, (Number(progress) || 0) / period));
}

/**
 * 种植链的净产出核对（方案第 9 节明确要求"实施时检查整个链的净产出"）。
 *
 * 一棵树产出：
 *   - 木材 = 节点定义的 amount
 *   - 树苗 = floor(amount / byproduct.perAmount)，且不超过 maxPerNode
 * 补种消耗 = saplingCost
 * 所以净树苗 = 上面两个数相减，净木材 = amount。
 * 返回每个树坑配置一行，调用方（测试）断言净值为正。
 */
export function plantingYield(config) {
  const normalized = normalizePlantingConfig(config);
  if (!normalized) return null;
  const definition = RESOURCE_NODE_DEFINITIONS[normalized.nodeDefinitionId];
  if (!definition) return null;
  const wood = Math.max(0, Number(definition.amount) || 0);
  const byproduct = definition.byproduct;
  let saplings = 0;
  if (byproduct?.itemId === normalized.saplingItemId && Number(byproduct.perAmount) > 0) {
    saplings = Math.floor(wood / Number(byproduct.perAmount));
    if (Number.isFinite(Number(byproduct.maxPerNode))) {
      saplings = Math.min(saplings, Math.max(0, Math.floor(Number(byproduct.maxPerNode))));
    }
  }
  return {
    configId: normalized.id,
    nodeDefinitionId: normalized.nodeDefinitionId,
    wood,
    saplings,
    saplingCost: normalized.saplingCost,
    netSaplings: saplings - normalized.saplingCost,
    netWood: wood
  };
}
