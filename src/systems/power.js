// 供能与活动魔力的纯分配逻辑。
//
// 计划文档第 3 节里最硬的一条约束是：
//   在时间段 dt 内，分配给所有接收者的魔力之和，不能超过供能源当段实际可提供的
//   supplyPerSecond × dt；不能给范围内每个单位各发一份完整功率，也不能把同一个
//   单位的工作消耗重复扣除。
// 这个文件就是那条约束的实现位置，也是它能被单独证明的位置：函数不修改任何入参，
// 只返回分配结果，所以「总量守恒」可以直接断言，不需要跑一局游戏。
//
// 文档把「负载不足时的分配策略」与「多供能源重叠规则」列为待定项，
// 这里的默认是「就近优先」：一个接收者由最近、且还有余量的供能源补，
// 最近的那个被抢空后再顺延到次近的。要换策略只需替换 strategy 参数。
//
// 注意：这里的「魔力」是傀儡活动用的那一份，和旧符文升级资源同名但完全无关。
// 实现上用 activityMana 系列字段，绝不和符文石上的 mana 字段混用。
export const POWER_STRATEGY = {
  nearestFirst: 'nearest_first',
  evenSplit: 'even_split'
};

const EPSILON = 1e-9;

// 一个供能源在 dt 内最多能拿出多少。带储备的供能源（以后烧燃料的魔力炉）
// 还要受自身储备限制，所以这里同时返回 throughput 与 stored 的上限。
export function powerSupplierBudget(supplier, dt) {
  const step = Math.max(0, dt);
  const throughput = Math.max(0, supplier?.supplyPerSecond ?? 0) * step;
  const stored = Number.isFinite(supplier?.manaStored) ? Math.max(0, supplier.manaStored) : null;
  return stored === null ? throughput : Math.min(throughput, stored);
}

export function powerDistance(receiver, supplier) {
  return Math.hypot(
    (receiver?.x ?? 0) - (supplier?.x ?? 0),
    (receiver?.z ?? 0) - (supplier?.z ?? 0)
  );
}

export function powerReceiverInRange(receiver, supplier) {
  return powerDistance(receiver, supplier) <= Math.max(0, supplier?.supplyRadius ?? 0);
}

// 越缺越先拿：0 表示空，1 表示满。没有容量的接收者按「全空」处理。
export function powerNeedRatio(receiver) {
  const capacity = Math.max(0, receiver?.manaCapacity ?? 0);
  if (capacity <= 0) return 0;
  const stored = Math.max(0, Math.min(capacity, receiver?.manaStored ?? 0));
  return stored / capacity;
}

// 返程储备建议：按移动耗魔估算回到最近供能源需要多少魔力。
// 这是「建议保留多少」，不是禁止行动——离开范围仍然可以继续活动。
export function powerReturnReserve({ drainPerSecond = 0, distance = 0, moveSpeed = 1, extraSeconds = 0 } = {}) {
  const drain = Math.max(0, drainPerSecond);
  if (drain <= 0) return 0;
  const speed = Math.max(0.1, moveSpeed);
  return drain * (Math.max(0, distance) / speed + Math.max(0, extraSeconds));
}

export function allocatePower({
  suppliers = [],
  receivers = [],
  dt = 0,
  strategy = POWER_STRATEGY.nearestFirst
} = {}) {
  const step = Math.max(0, dt);
  const budgets = suppliers.map((supplier) => ({
    supplier,
    remaining: powerSupplierBudget(supplier, step)
  }));
  const entries = receivers.map((receiver) => ({
    receiver,
    demand: Math.max(0, Number(receiver?.demand) || 0),
    granted: 0,
    sources: []
  }));

  // 预先算好「这个接收者能向哪些供能源要、按距离排序」。
  // 排序只决定谁先拿到、从谁那里拿，不改变任何总量上限。
  entries.forEach((entry) => {
    entry.sources = budgets
      .map((budget) => ({ budget, distance: powerDistance(entry.receiver, budget.supplier) }))
      .filter((source) => source.distance <= Math.max(0, source.budget.supplier?.supplyRadius ?? 0))
      .sort((a, b) => a.distance - b.distance);
  });

  const order = [...entries].sort((a, b) => {
    const priorityA = a.receiver?.priority ?? 0;
    const priorityB = b.receiver?.priority ?? 0;
    if (priorityA !== priorityB) return priorityB - priorityA;
    return powerNeedRatio(a.receiver) - powerNeedRatio(b.receiver);
  });

  // 从最近的供能源开始取，取到需求满足或所有源都空了为止。
  // 每次取用的量都不超过该源剩余预算，因此总和天然受预算约束。
  const takeNearestFirst = (entry, want) => {
    let remaining = Math.max(0, want);
    for (const source of entry.sources) {
      if (remaining <= EPSILON) break;
      const take = Math.min(remaining, source.budget.remaining);
      if (take <= EPSILON) continue;
      source.budget.remaining -= take;
      entry.granted += take;
      remaining -= take;
    }
    return Math.max(0, want) - remaining;
  };

  if (strategy === POWER_STRATEGY.evenSplit) {
    // 均衡分配：每个供能源把本段预算平均分给范围内所有接收者，再按各自需求截断。
    // 之后仍然走一次就近补齐，把被截断留下的余量利用起来。
    budgets.forEach((budget) => {
      const sharing = entries.filter((entry) => (
        entry.sources.some((source) => source.budget === budget)
      ));
      if (!sharing.length) return;
      const share = budget.remaining / sharing.length;
      sharing.forEach((entry) => {
        const room = Math.max(0, entry.demand - entry.granted);
        const take = Math.min(room, share, budget.remaining);
        if (take <= EPSILON) return;
        budget.remaining -= take;
        entry.granted += take;
      });
    });
  }

  order.forEach((entry) => {
    takeNearestFirst(entry, entry.demand - entry.granted);
  });

  const grants = entries.map((entry) => ({
    id: entry.receiver?.id ?? null,
    demand: entry.demand,
    granted: entry.granted,
    shortfall: Math.max(0, entry.demand - entry.granted),
    sourceCount: entry.sources.length
  }));
  const totalBudget = budgets.reduce((sum, budget) => sum + powerSupplierBudget(budget.supplier, step), 0);
  const totalDemand = grants.reduce((sum, grant) => sum + grant.demand, 0);
  const totalGranted = grants.reduce((sum, grant) => sum + grant.granted, 0);

  return {
    grants,
    totalBudget,
    totalDemand,
    totalGranted,
    surplus: Math.max(0, totalBudget - totalGranted),
    starved: grants.filter((grant) => grant.shortfall > EPSILON).map((grant) => grant.id)
  };
}
