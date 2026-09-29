// 傀儡作业状态机（纯逻辑）。
//
import { resourceNodeSurfaceDistance } from './resources.js';

// 与 resources.js / power.js 一样不依赖 THREE / DOM / Game：作业决策必须能在
// 没有渲染、没有寻路的情况下单独验证，否则「为什么这个傀儡站着不动」
// 只能靠在游戏里盯着看。
//
// 一个作业回合的输入是「傀儡 + 任务 + 基地 + 规则」，输出是「这一步做什么」。
// 真正走路、扣魔力、改库存都由调用方按 action 执行，这里不产生任何副作用。
//
// 覆盖计划文档第 5 节要求可见的状态：缺少工具、资源耗尽、没有有效任务、
// 容器已满、路线不可达、供能不足、正在补魔、正在采集、正在运输。
export const WORK_STATE = {
  idle: 'idle',
  movingToNode: 'moving_to_node',
  harvesting: 'harvesting',
  haulingHome: 'hauling_home',
  depositing: 'depositing',
  blocked: 'blocked',
  lowPower: 'low_power',
  // 附近有威胁：打不过（或空手）就往低威胁处跑。任务**不取消**，
  // 威胁一散它照原路回去干活——半路清任务会让它把已经背上的货和预留都丢掉。
  fleeing: 'fleeing',
  // 附近有威胁，但战力判断认为打得过：这一帧交回常规战斗 AI。
  engaging: 'engaging'
};

export const WORK_REASON = {
  none: 'none',
  noTask: 'no_task',
  missingTool: 'missing_tool',
  nodeDepleted: 'node_depleted',
  inventoryFull: 'inventory_full',
  unreachable: 'unreachable',
  lowPower: 'low_power',
  recharging: 'recharging',
  containerFull: 'container_full',
  threatNearby: 'threat_nearby'
};

export const WORK_ACTION = {
  none: 'none',
  moveToNode: 'move_to_node',
  harvest: 'harvest',
  moveToBase: 'move_to_base',
  deposit: 'deposit',
  flee: 'flee'
};

const STATE_LABELS = {
  [WORK_STATE.idle]: '待命',
  [WORK_STATE.movingToNode]: '前往资源点',
  [WORK_STATE.harvesting]: '正在采集',
  [WORK_STATE.haulingHome]: '正在运输',
  [WORK_STATE.depositing]: '正在卸货',
  [WORK_STATE.blocked]: '无法继续',
  [WORK_STATE.lowPower]: '魔力不足',
  [WORK_STATE.fleeing]: '逃跑',
  [WORK_STATE.engaging]: '迎战'
};

const REASON_LABELS = {
  [WORK_REASON.none]: '',
  [WORK_REASON.noTask]: '没有有效任务',
  [WORK_REASON.missingTool]: '缺少工具',
  [WORK_REASON.nodeDepleted]: '资源已耗尽',
  [WORK_REASON.inventoryFull]: '背包已满',
  [WORK_REASON.unreachable]: '路线不可达',
  [WORK_REASON.lowPower]: '供能不足',
  [WORK_REASON.recharging]: '正在补魔',
  [WORK_REASON.containerFull]: '容器已满',
  [WORK_REASON.threatNearby]: '附近有敌人'
};

export const WORK_RULES = {
  // 采集判定距离：站到这个距离内才算够得着
  harvestRange: 2.6,
  /** 每次采集命中消耗的工具耐久（木制工具满耐久 100）。 */
  harvestToolWear: 1,
  // 卸货判定距离
  depositRange: 3.2,
  // 低于容量的这个比例就主动回供能区（与 POWER_RULES.lowManaRatio 同义，独立配置便于调）
  lowPowerRatio: 0.25,
  // 补魔的**退出水位**，默认 1 = 充满。
  //
  // 「低于 25% 回去补」和「补到多少算够」必须是两个数，否则回程变成来回横跳：
  // 只用一个阈值时，它在基地旁补到刚过 25% 就被判"魔力够用"，
  // 立刻被派回矿点，玩家看到的是「回到基地站一下、马上又去采矿」。
  // 所以进入补魔看 lowPowerRatio，退出看 rechargeRatio（迟滞）。
  rechargeRatio: 1
};

export function workRules(overrides = {}) {
  return { ...WORK_RULES, ...(overrides ?? {}) };
}

export function workStateLabel(state, reason = WORK_REASON.none) {
  const base = STATE_LABELS[state] ?? state;
  const extra = REASON_LABELS[reason] ?? '';
  return extra ? `${base}（${extra}）` : base;
}

export function workReasonLabel(reason) {
  return REASON_LABELS[reason] ?? '';
}

function distance2D(a, b) {
  return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.z ?? 0) - (b?.z ?? 0));
}

// 傀儡还能装多少件货。用「占格」而不是「件数」判断，
// 因为一堆木材和一株纤维草占的格数一样但对玩家意义不同。
export function workerInventoryFull(worker) {
  const capacity = Math.max(0, worker?.inventoryCapacity ?? 0);
  if (capacity <= 0) return false;
  return (worker?.inventoryUsed ?? 0) >= capacity;
}

export function workerManaRatio(worker) {
  const capacity = Math.max(0, worker?.manaCapacity ?? 0);
  if (capacity <= 0) return 1;
  const stored = Math.max(0, Math.min(capacity, worker?.activityMana ?? 0));
  return stored / capacity;
}

/** 活动魔力见底：不能攻击、不能干活，只能移动（回供能点 / 逃跑 / 玩家右键移动）。 */
export function workerManaDepleted(worker) {
  const capacity = Math.max(0, worker?.manaCapacity ?? 0);
  if (capacity <= 0) return false;
  return (worker?.activityMana ?? 0) <= 0;
}

// 单步决策。优先级顺序与文档一致：
//   威胁（打/逃）> 满包回程 > 缺魔力返程 > 任务有效性 > 工具 > 距离 > 采集
//
// 「威胁」排在**最前**，包括满包回程之前：背着满包跑回基地的路上被截杀，
// 货和人都没了，而"先逃到安全处、威胁散了再回程"永远不亏。
//
// `danger` 由调用方（WorkSystem）从自卫反射（combatReflex + combatPlan）里算好后传进来——
// "打不打得过"需要战力公式与敌人列表，"什么时候还该继续打"需要跨帧的记忆，
// 那两样都不属于这个纯状态机。
// 这里只消费结论：`{action:'flee'|'engage', target?}`。
//
// `recharging` 是补魔会话的跨帧记忆（由调用方维护）：本帧之前是不是正处在
// "回去补魔 / 原地补魔"里。它是**迟滞**的一半，见 WORK_RULES.rechargeRatio。
export function planWorkerStep({
  worker = {},
  task = null,
  base = { x: 0, z: 0 },
  rules = WORK_RULES,
  supplyPoint = null,
  inSupplyRange = true,
  baseHasRoom = true,
  danger = null,
  recharging = false
} = {}) {
  const resolved = workRules(rules);
  const workerPosition = { x: worker.x ?? 0, z: worker.z ?? 0 };
  const supply = supplyPoint ?? base;
  const result = (state, reason, action, target) => ({
    state,
    reason,
    action,
    target: target ?? null,
    note: workStateLabel(state, reason)
  });

  // 0) 威胁：最高优先级。打不过（含空手）就跑，打得过就把这一帧交回战斗 AI。
  //    `flee` 的 target 为 null 表示"周围找不到更安全的落点"——此时原地不动，
  //    而不是朝随机方向乱跑（乱跑会把它送进更大的威胁里）。
  if (danger?.action === 'flee') {
    return result(WORK_STATE.fleeing, WORK_REASON.threatNearby, WORK_ACTION.flee, danger.target ?? null);
  }
  if (danger?.action === 'engage' && !workerManaDepleted(worker)) {
    return result(WORK_STATE.engaging, WORK_REASON.threatNearby, WORK_ACTION.none, null);
  }

  // 活动魔力为 0：只允许走向供能点等待补魔（移动），不做任何作业
  if (workerManaDepleted(worker)) {
    const atSupply = distance2D(workerPosition, supply) <= resolved.depositRange;
    if (!atSupply) {
      return result(WORK_STATE.lowPower, WORK_REASON.lowPower, WORK_ACTION.moveToBase, supply);
    }
    return result(WORK_STATE.lowPower, WORK_REASON.recharging, WORK_ACTION.none, null);
  }

  // 1) 背包满了：先把货送回基地，任务不取消，卸完继续
  if (workerInventoryFull(worker)) {
    if (!baseHasRoom) {
      return result(WORK_STATE.blocked, WORK_REASON.containerFull, WORK_ACTION.none, null);
    }
    if (distance2D(workerPosition, base) <= resolved.depositRange) {
      return result(WORK_STATE.depositing, WORK_REASON.inventoryFull, WORK_ACTION.deposit, base);
    }
    return result(WORK_STATE.haulingHome, WORK_REASON.inventoryFull, WORK_ACTION.moveToBase, base);
  }

  // 2) 魔力过低：不要带着见底的魔力出发。
  //    已经在供能点旁边就原地等补，否则（不管在不在供能半径里）都先走回供能点。
  //    这正是文档说的「任务开始前估计工作和返程用量，保留返程储备」。
  //
  //    迟滞（两个阈值）：**进入**看 lowPowerRatio，**退出**看 rechargeRatio。
  //    只用一个阈值时，傀儡在基地旁补到刚过 25% 就被判"够用了"、立刻出发，
  //    玩家看到的是"回到基地站一下就又去采矿"——所以一旦进入补魔就必须补到
  //    rechargeRatio（默认充满）为止。返回值本身不需要新状态：
  //    `state === lowPower` 就是"这一帧还在补魔"，调用方据此维护跨帧的 recharging。
  const manaRatio = workerManaRatio(worker);
  const needsPower = recharging
    ? manaRatio < resolved.rechargeRatio
    : manaRatio <= resolved.lowPowerRatio;
  if (needsPower) {
    const atSupply = distance2D(workerPosition, supply) <= resolved.depositRange;
    if (atSupply) {
      return result(WORK_STATE.lowPower, WORK_REASON.recharging, WORK_ACTION.none, null);
    }
    return result(WORK_STATE.lowPower, WORK_REASON.lowPower, WORK_ACTION.moveToBase, supply);
  }

  // 3) 没有任务
  if (!task || !task.node) {
    return result(WORK_STATE.idle, WORK_REASON.noTask, WORK_ACTION.none, null);
  }

  // 4) 任务已失效
  const node = task.node;
  if ((node.amount ?? 0) <= 0 || task.depleted) {
    return result(WORK_STATE.idle, WORK_REASON.nodeDepleted, WORK_ACTION.none, null);
  }

  // 5) 工具条件
  const missingTool = task.toolSatisfied === false;
  if (missingTool) {
    return result(WORK_STATE.blocked, WORK_REASON.missingTool, WORK_ACTION.none, null);
  }

  // 6) 够不够得着
  const nodeDistance = resourceNodeSurfaceDistance(node, workerPosition);
  if (nodeDistance > resolved.harvestRange) {
    if (task.reachable === false) {
      return result(WORK_STATE.blocked, WORK_REASON.unreachable, WORK_ACTION.none, null);
    }
    return result(WORK_STATE.movingToNode, WORK_REASON.none, WORK_ACTION.moveToNode, node);
  }

  // 7) 采集
  return result(WORK_STATE.harvesting, WORK_REASON.none, WORK_ACTION.harvest, node);
}

// 采集进度推进：按时间累积，每满 1 结算一次。
//
// 两个容易写错的点：
//   1. 结算后必须把溢出的时间带到下一轮（清零会让每次采集都多花掉接近一个 dt）；
//   2. 一段 dt 很长时可能结算多次，所以返回次数而不是布尔值。
// 容差 1e-9 是为了让 0.1 × 10 这种浮点累加仍然算作「刚好到 1」。
export function advanceHarvestProgress(progress, dt, harvestSeconds) {
  const duration = Math.max(0.05, harvestSeconds ?? 1);
  const next = Math.max(0, (progress ?? 0) + Math.max(0, dt) / duration);
  const completions = Math.floor(next + 1e-9);
  return {
    // 容差可能让 next 略小于 completions，夹一下避免出现负进度
    progress: completions > 0 ? Math.max(0, next - completions) : next,
    completions,
    completed: completions > 0
  };
}

// ---------------------------------------------------------------------------
// 任务预留
//
// 多个傀儡指向同一个资源点时，如果没人记账，它们会一起把节点采穿，
// 后面的人白跑一趟。这里按节点记录「已经被预留了多少」，
// 让调度器在派活前判断还剩多少可派。
// ---------------------------------------------------------------------------
export class WorkTaskBoard {
  constructor() {
    // workerId -> { nodeId, reserved }
    this.assignments = new Map();
  }

  ownerOf(nodeId) {
    for (const [workerId, assignment] of this.assignments.entries()) {
      if (assignment.nodeId === nodeId) return workerId;
    }
    return null;
  }

  reservationFor(nodeId) {
    let total = 0;
    this.assignments.forEach((assignment) => {
      if (assignment.nodeId === nodeId) total += assignment.reserved;
    });
    return total;
  }

  // 已经把某个节点派给某个傀儡。reserved 是该傀儡这一趟预期取走的量。
  claim(workerId, nodeId, reserved = 0) {
    if (!workerId || !nodeId) return false;
    this.assignments.set(workerId, { nodeId, reserved: Math.max(0, reserved) });
    return true;
  }

  release(workerId) {
    return this.assignments.delete(workerId);
  }

  releaseNode(nodeId) {
    let released = 0;
    [...this.assignments.entries()].forEach(([workerId, assignment]) => {
      if (assignment.nodeId !== nodeId) return;
      this.assignments.delete(workerId);
      released += 1;
    });
    return released;
  }

  // 节点上还剩多少「没被别人预定」的量。调度器据此避免派出注定空手而归的傀儡。
  availableFor(nodeId, node, excludeWorkerId = null) {
    const remaining = Math.max(0, node?.amount ?? 0);
    let reserved = 0;
    this.assignments.forEach((assignment, workerId) => {
      if (assignment.nodeId !== nodeId) return;
      if (excludeWorkerId && workerId === excludeWorkerId) return;
      reserved += assignment.reserved;
    });
    return Math.max(0, remaining - reserved);
  }

  clear() {
    this.assignments.clear();
  }

  snapshot() {
    return [...this.assignments.entries()].map(([workerId, assignment]) => ({
      workerId,
      nodeId: assignment.nodeId,
      reserved: assignment.reserved
    }));
  }
}
