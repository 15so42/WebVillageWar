// 资源节点的纯逻辑。
//
// 这里刻意不引用 THREE、DOM 或 Game：资源节点是「有独立 ID 与剩余量的实例」，
// 它的状态机（剩余量、采空、工具校验、序列化）必须能在没有渲染的情况下单独测试。
// 场景模型与寻路阻挡由 world 提供句柄，系统层只负责状态与守恒。
import {
  ITEM_DEFINITIONS,
  RESOURCE_NODE_DEFINITIONS,
  RESOURCE_NODE_RULES,
  RESOURCE_TYPES,
  isDepletedOreSiteResource
} from '../data/gameData.js';

export function resourceTypeDefinition(resourceId) {
  return RESOURCE_TYPES[resourceId] ?? null;
}

// 资源种类 → 库存物品 ID。资源节点产出 node.resource，采到的东西直接就是
// 库存里的 itemId，中间不需要转换层；这里把这条对应关系集中在一处。
export { resourceItemId } from './items.js';

export function resourceTypeName(resourceId) {
  return RESOURCE_TYPES[resourceId]?.name ?? resourceId ?? '未知资源';
}

export function resourceNodeDefinition(definitionId) {
  return RESOURCE_NODE_DEFINITIONS[definitionId] ?? null;
}

export function resourceNodeDisplayName(definitionId) {
  return RESOURCE_NODE_DEFINITIONS[definitionId]?.name ?? definitionId ?? '资源';
}

export function resourceNodeRules(overrides = {}) {
  return { ...RESOURCE_NODE_RULES, ...(overrides ?? {}) };
}

export function resourceNodeIsDepleted(node) {
  if (!node) return true;
  return (node.amount ?? 0) <= 0;
}

/**
 * 采空节点 → 贫矿址记录。`null` 表示这个资源不该留矿址（木材/纤维/食物）。
 *
 * 「留下可识别的矿址或贫矿标记，保存稳定 id、类型与位置」——位置与 id 都来自
 * 节点自身，所以不受建筑/单位压在上面影响，也不会因为重载而漂移。
 */
export function depletedOreSiteFromNode(node) {
  if (!node?.id) return null;
  if (!isDepletedOreSiteResource(node.resource)) return null;
  return {
    id: `poor-site:${node.id}`,
    nodeId: node.id,
    definitionId: node.definitionId ?? null,
    resource: node.resource,
    x: Number(node.x) || 0,
    z: Number(node.z) || 0,
    // 贫矿址的选址半径比地表节点略宽：地表富集层没了，玩家要能在残堆周围
    // 找一块真正放得下建筑的空地，而不是被原来的 navRadius 卡住。
    siteRadius: Math.max(3, Number(node.navRadius) || 0) + 2.5,
    depleted: true
  };
}

/** 一个贫矿址是不是在 `point` 的选址半径内。 */
export function depletedOreSiteDistance(site, point) {
  if (!site || !point) return Infinity;
  return Math.hypot((site.x ?? 0) - point.x, (site.z ?? 0) - point.z);
}

// 采集结算：从节点剩余量里取出不超过请求量与剩余量的部分。
// 返回新的剩余量而不是就地修改，调用方负责写回，避免中途抛错时状态半更新。
export function resolveHarvest(node, requested, rules = RESOURCE_NODE_RULES) {
  const remaining = Math.max(0, node?.amount ?? 0);
  const requestedAmount = Number.isFinite(requested) ? requested : rules.harvestPerAction;
  const wanted = Math.max(0, Math.min(remaining, requestedAmount));
  return {
    taken: wanted,
    remaining: remaining - wanted,
    depleted: remaining - wanted <= 0
  };
}

// 工具校验：definition.tool 为 null 表示徒手可采（浆果、纤维）。
export function resourceNodeNeedsTool(definitionId) {
  return Boolean(RESOURCE_NODE_DEFINITIONS[definitionId]?.tool);
}

export function resourceNodeToolSatisfied(definitionId, toolIds) {
  const required = RESOURCE_NODE_DEFINITIONS[definitionId]?.tool;
  if (!required) return true;
  const owned = Array.isArray(toolIds) ? toolIds : (toolIds ? [toolIds] : []);
  return owned.includes(required);
}

export function resourceNodeRequiredToolName(definitionId) {
  const required = RESOURCE_NODE_DEFINITIONS[definitionId]?.tool;
  if (!required) return null;
  return required === 'axe' ? '木斧' : required === 'pickaxe' ? '木镐' : required;
}

/** 背包里符合该节点的工具里，最快的那把。没有加成时是 1。 */
export function toolHarvestRate(slots, requiredTool) {
  let best = 1;
  (slots ?? []).forEach((slot) => {
    const def = ITEM_DEFINITIONS[slot?.itemId];
    if (!def?.tool) return;
    if (requiredTool && def.tool !== requiredTool) return;
    const rate = Number(def.harvestRate);
    if (Number.isFinite(rate) && rate > best) best = rate;
  });
  return best;
}

export function resourceNodeDistance(node, point) {
  if (!node || !point) return Infinity;
  return Math.hypot(node.x - point.x, node.z - point.z);
}

/** 到资源点外表（扣掉 navRadius）的距离，采集站位按树干/石体算，不按圆心。 */
export function resourceNodeSurfaceDistance(node, point) {
  const center = resourceNodeDistance(node, point);
  const radius = Math.max(0, Number(node.navRadius) || 0);
  return Math.max(0, center - radius);
}

// 规范化：所有位置类型都要能安全往返，未知字段不能静默丢掉。
export function normalizeResourceNodeState(raw, fallback = null) {
  const definitionId = raw?.definitionId ?? fallback?.definitionId ?? null;
  const definition = RESOURCE_NODE_DEFINITIONS[definitionId] ?? null;
  const maxAmount = Math.max(
    0,
    Number.isFinite(raw?.maxAmount)
      ? raw.maxAmount
      : (Number.isFinite(fallback?.maxAmount) ? fallback.maxAmount : (definition?.amount ?? 0))
  );
  const amount = clampAmount(
    Number.isFinite(raw?.amount) ? raw.amount : (fallback?.amount ?? maxAmount),
    maxAmount
  );
  return {
    id: raw?.id ?? fallback?.id ?? null,
    definitionId,
    resource: raw?.resource ?? fallback?.resource ?? definition?.resource ?? null,
    x: Number.isFinite(raw?.x) ? raw.x : (fallback?.x ?? 0),
    z: Number.isFinite(raw?.z) ? raw.z : (fallback?.z ?? 0),
    y: Number.isFinite(raw?.y) ? raw.y : (fallback?.y ?? 0),
    amount,
    maxAmount,
    navRadius: Number.isFinite(raw?.navRadius) ? raw.navRadius : (fallback?.navRadius ?? 0),
    released: raw?.released === true || fallback?.released === true,
    // 副产物计数必须跟着状态走：这里是**显式白名单**，不登记就会被静默丢掉，
    // 表现是"每次快照往返之后树苗又从零开始数"（同一类坑在刷怪点上踩过）。
    harvestedTotal: normalizeCounter(raw?.harvestedTotal ?? fallback?.harvestedTotal),
    byproductGiven: normalizeCounter(raw?.byproductGiven ?? fallback?.byproductGiven)
  };
}

function normalizeCounter(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

export function serializeResourceNodeState(node) {
  return {
    id: node.id,
    definitionId: node.definitionId,
    resource: node.resource,
    amount: node.amount,
    maxAmount: node.maxAmount,
    released: node.released === true,
    harvestedTotal: normalizeCounter(node.harvestedTotal),
    byproductGiven: normalizeCounter(node.byproductGiven)
  };
}

export function clampAmount(value, maxAmount) {
  const numeric = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(Math.max(0, maxAmount), numeric));
}

export function totalResourceAmount(nodes, resourceId = null) {
  return (nodes ?? []).reduce((sum, node) => {
    if (resourceId && node.resource !== resourceId) return sum;
    return sum + Math.max(0, node.amount ?? 0);
  }, 0);
}

export function resourceAmountsByType(nodes) {
  const totals = {};
  (nodes ?? []).forEach((node) => {
    if (!node.resource) return;
    totals[node.resource] = (totals[node.resource] ?? 0) + Math.max(0, node.amount ?? 0);
  });
  return totals;
}
