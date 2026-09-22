// 采集需求与工作分配（纯逻辑）。
//
// 计划第 5 节把「百分比」列为待定项，用户示例是「第一项 50%、第二项 25%」，
// 但明确要求：不能每帧随机切换、达到库存目标或缺工具时要跳过、
// 多傀儡要能分头承担、不能因为某一项永远排在前面就把别的饿死。
//
// 这里把百分比解释为「采集工作投入比例」，并配套库存目标与可执行性判断。
// 分配结果按需求权重摊给傀儡；不可执行的需求先被剔除，再在剩下的之间重新分配
// ——而不是简单地按固定顺序发活。
export const DEMAND_STATE = {
  active: 'active',
  satisfied: 'satisfied',
  noNodes: 'no_nodes',
  disabled: 'disabled'
};

export const DEMAND_STATE_LABELS = {
  [DEMAND_STATE.active]: '采集中',
  [DEMAND_STATE.satisfied]: '库存已达标',
  [DEMAND_STATE.noNodes]: '没有可达资源点',
  [DEMAND_STATE.disabled]: '未启用'
};

export const WORK_PRIORITY_RULES = {
  // 傀儡总数少于需求数时，至少保证权重最高的需求有人做
  minWorkersPerActiveDemand: 1,
  // 权重上下限，防止某一项配成 0 或巨大值把调度器带偏
  minWeight: 0.01,
  maxWeight: 1
};

export function workPriorityRules(overrides = {}) {
  return { ...WORK_PRIORITY_RULES, ...(overrides ?? {}) };
}

export function normalizeWeight(value, rules = WORK_PRIORITY_RULES) {
  const numeric = Number.isFinite(value) ? value : 0;
  if (numeric <= 0) return 0;
  // 界面上的读数是百分数（50），配置里也可能直接写比例（0.5）。
  // 判断依据只能是「大于 1 就是百分数」——之前写成 numeric/100 > 1，
  // 于是 50 被当成 50 而不是 50%，直接被夹到上限。
  const ratio = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(rules.minWeight, Math.min(rules.maxWeight, ratio));
}

// 把界面上的百分比读数规范成调度用的权重。
// 允许传 50（百分数）或 0.5（比例），两种写法结果一致。
export function normalizeDemands(demands = [], rules = WORK_PRIORITY_RULES) {
  const resolved = workPriorityRules(rules);
  return demands.map((demand, index) => ({
    id: demand.id ?? `demand-${index}`,
    resource: demand.resource ?? null,
    weight: normalizeWeight(demand.weight ?? demand.percent ?? 0, resolved),
    targetStock: Math.max(0, Number.isFinite(demand.targetStock) ? demand.targetStock : 0),
    enabled: demand.enabled !== false
  }));
}

// 一个需求当前能不能派活。顺序是有意的：
// 未启用 → 库存达标 → 没有可达资源点。这样「为什么这项没人采」永远只有一个答案。
export function demandState(demand, { stock = 0, availableNodes = 0 } = {}) {
  if (!demand.enabled || demand.weight <= 0) return DEMAND_STATE.disabled;
  if (demand.targetStock > 0 && stock >= demand.targetStock) return DEMAND_STATE.satisfied;
  if (availableNodes <= 0) return DEMAND_STATE.noNodes;
  return DEMAND_STATE.active;
}

// 把傀儡按权重摊到各个可执行需求上。
//
// 两个刻意的约束：
//   1. 只有可执行的需求参与分配，达标/没资源的不会分到人（避免「派了活却永远在等」）；
//   2. 剩余的人按权重从大到小补，权重相同按 id 排序，保证同样的输入永远得到同样的结果
//      （不能每帧换人，否则傀儡会在两个资源点之间来回跑）。
export function planWorkAllocation({
  demands = [],
  stock = {},
  availableNodes = {},
  workerIds = [],
  rules = WORK_PRIORITY_RULES
} = {}) {
  const resolved = workPriorityRules(rules);
  const normalized = normalizeDemands(demands, resolved);
  const states = normalized.map((demand) => ({
    demand,
    state: demandState(demand, {
      stock: stock[demand.resource] ?? 0,
      availableNodes: availableNodes[demand.resource] ?? 0
    })
  }));

  const active = states
    .filter((entry) => entry.state === DEMAND_STATE.active)
    .sort((a, b) => (b.demand.weight - a.demand.weight) || String(a.demand.id).localeCompare(String(b.demand.id)));

  const assignments = [];
  const workers = [...workerIds];
  if (!active.length || !workers.length) {
    return {
      assignments,
      states: states.map((entry) => ({
        id: entry.demand.id,
        resource: entry.demand.resource,
        weight: entry.demand.weight,
        state: entry.state,
        label: DEMAND_STATE_LABELS[entry.state],
        assigned: 0
      })),
      idleWorkers: workers
    };
  }

  // 先按 minWorkersPerActiveDemand 保证每项至少有人，再按权重把剩下的人摊出去。
  const quota = new Map(active.map((entry) => [entry.demand.id, 0]));
  active.forEach((entry) => {
    if (workers.length <= 0) return;
    if (quota.get(entry.demand.id) >= resolved.minWorkersPerActiveDemand) return;
    quota.set(entry.demand.id, quota.get(entry.demand.id) + 1);
    workers.shift();
  });

  // 权重归一化后逐人分配：每个人归给「当前已分到的人 / 权重」最小的那一项，
  // 等价于按权重轮转，且结果是确定的。
  while (workers.length > 0) {
    let best = null;
    active.forEach((entry) => {
      const total = quota.get(entry.demand.id);
      const ratio = total / Math.max(resolved.minWeight, entry.demand.weight);
      if (!best || ratio < best.ratio) best = { entry, ratio };
    });
    if (!best) break;
    quota.set(best.entry.demand.id, quota.get(best.entry.demand.id) + 1);
    workers.shift();
  }

  active.forEach((entry) => {
    const count = quota.get(entry.demand.id);
    if (count > 0) assignments.push({ demandId: entry.demand.id, resource: entry.demand.resource, count });
  });

  return {
    assignments,
    states: states.map((entry) => ({
      id: entry.demand.id,
      resource: entry.demand.resource,
      weight: entry.demand.weight,
      state: entry.state,
      label: DEMAND_STATE_LABELS[entry.state],
      assigned: quota.get(entry.demand.id) ?? 0
    })),
    idleWorkers: workers
  };
}
