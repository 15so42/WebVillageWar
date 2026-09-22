// 傀儡（工人）作业系统的状态归属方。
//
// 分层：
//
//   workOrders.js  纯逻辑：给定「傀儡 + 任务 + 基地 + 规则」算出这一步该做什么
//   本文件         执行层：真正走路、扣进度、采进背包、运回基地、登记供能接收者
//   UnitLogicSystem 帧驱动：worker 单位每帧调用 updateWorker，命中后跳过战斗 AI
//
// 两条不能越过的边界：
//   1. 活动魔力只写 activityMana / manaCapacity，绝不动符文石实例上的 mana 字段；
//   2. 工具所有权来自傀儡背包里的实例物品（ITEM_DEFINITIONS[...].tool），
//      不另立一份平行列表——否则「背包里有斧子但系统说没有」这种矛盾迟早出现。
import {
  ITEM_DEFINITIONS,
  ITEM_RULES,
  POWER_RULES,
  RESOURCE_NODE_DEFINITIONS,
  resourceNodeHarvestSeconds
} from '../data/gameData.js';
import { Inventory } from './Inventory.js';
import { RESOURCE_ERROR } from './ResourceNodeSystem.js';
import {
  advanceHarvestProgress,
  planWorkerStep,
  WORK_REASON,
  WORK_STATE,
  workRules,
  workStateLabel,
  WorkTaskBoard,
  workerInventoryFull
} from './workOrders.js';
import { itemStacksByMerging } from './items.js';
import { planWorkAllocation } from './workPriority.js';
import { clamp } from '../utils/math.js';

// 自动派活的节流间隔。调度每帧重算会让傀儡在两个资源点之间来回跑，
// 所以既在调度器里保证分配结果确定，也在这里限频。
const AUTO_ASSIGN_INTERVAL_SECONDS = 1;

// 工具属于实例物品，永远不会被 transferTo 搬走（实例转移必须走 transferInstanceTo：
// 重新发一个 instanceId 等于凭空复制一件新工具，带成长数据的实例会直接丢成长）。
// 所以卸货时只搬堆叠类物品，工具留在傀儡背包里。
const WORKER_DEPOSIT_MIN_COUNT = 1;

// 工人接收供能的优先级：低于基地自身设施，但高于「可有可无」的接收者。
const WORKER_POWER_PRIORITY = 5;

// 傀儡自己走路时的到达距离：比 0.18 稍大一点，避免贴着树根来回抖
const WORKER_ARRIVE_DISTANCE = 0.24;

// 连续这么久「想走但一步都没动」才判定为路线不可达。
// 时间太短会把「绕路时被同伴挤住」误判成不可达，太长则玩家盯着站桩的傀儡不明白为什么。
const UNREACHABLE_SECONDS = 0.9;

export class WorkSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = workRules(options.rules ?? {});
    this.tasks = new Map();
    this.inventories = new Map();
    this.records = new Map();
    this.board = new WorkTaskBoard();
    this.stats = {
      registered: 0,
      unregistered: 0,
      assigned: 0,
      harvestActions: 0,
      harvested: 0,
      deposited: 0,
      depositBlocked: 0,
      toolBlocked: 0,
      depletedTasks: 0
    };
    // 上一次执行失败的原因（按 workerId 存），供 HUD / 调试读取；
    // 不放进 workerState 的返回值里，避免每帧新建对象。
    this.lastErrors = new Map();
  }

  // ------------------------------------------------------------------ 登记
  // 把一支普通单位变成傀儡：背包、活动魔力、供能接收者、作业记录一次配齐。
  registerWorker(unit, { inventory = null } = {}) {
    if (!unit?.id) return null;
    const owned = inventory ?? new Inventory({
      id: `worker:${unit.id}`,
      capacity: ITEM_RULES.workerInventorySlots
    });
    owned.id = owned.id ?? `worker:${unit.id}`;
    unit.isWorker = true;
    unit.kind = 'unit';
    unit.manaCapacity = POWER_RULES.workerManaCapacity;
    if (!Number.isFinite(unit.activityMana)) unit.activityMana = POWER_RULES.workerManaCapacity;
    unit.activityMana = clamp(unit.activityMana, 0, unit.manaCapacity);
    unit.inventoryCapacity = owned.capacity;
    // 待机不吃魔；真正干活时才由 updateWorker 按行为改这个值
    if (!Number.isFinite(unit.drainPerSecond)) unit.drainPerSecond = POWER_RULES.workerDrainIdle;
    unit.powerPriority = WORKER_POWER_PRIORITY;
    unit.workerInventory = owned;
    this.inventories.set(unit.id, owned);
    const record = {
      // 记录自己知道属于哪个系统：模块级的小工具函数（视图刷新、背包缓存）
      // 需要用到系统方法，避免把它们都写成依赖 this 的闭包。
      work: this,
      unit,
      unitId: unit.id,
      inventory: owned,
      // 每帧复用的视图对象：planWorkerStep 只读它，不需要新对象
      view: {
        id: unit.id,
        x: 0,
        z: 0,
        inventoryUsed: 0,
        inventoryCapacity: owned.capacity,
        activityMana: unit.activityMana,
        manaCapacity: unit.manaCapacity
      },
      task: null,
      progress: 0,
      // 背包内容的缓存。工具列表和卸货清单都从这里派生，
      // 只在背包真正变化（采到货 / 卸完货）时重算。
      pack: {
        dirty: true,
        itemIds: [],
        toolSet: new Set(),
        toolIds: [],
        totalCount: 0,
        anyStacks: false
      },
      move: {
        x: 0,
        z: 0,
        hasMoveGoal: false,
        goalKind: null,
        staleSeconds: 0
      },
      lastPlan: null,
      lastError: null,
      lastErrorTool: null,
      assignedAt: 0
    };
    this.records.set(unit.id, record);
    this.tasks.set(unit.id, null);
    this.registerPowerReceiver(unit);
    this.stats.registered += 1;
    return record;
  }

  registerPowerReceiver(unit) {
    const power = this.game?.power;
    if (!power) return null;
    return power.registerReceiver(unit, {
      // 单位的位置在 unit.position（Vector3）上，单位本身没有 x / z 字段
      positionOf: () => ({ x: unit.position?.x ?? 0, z: unit.position?.z ?? 0 })
    });
  }

  // 取消登记：供能接收者、任务预留、背包记录一起清掉，不留半个傀儡。
  unregisterWorker(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    if (unitId === null || unitId === undefined) return false;
    const record = this.records.get(unitId);
    const unit = record?.unit ?? (typeof unitOrId === 'object' ? unitOrId : null);
    this.game?.power?.unregisterReceiver?.(unitId);
    this.board.release(unitId);
    this.tasks.delete(unitId);
    this.inventories.delete(unitId);
    this.lastErrors.delete(unitId);
    this.records.delete(unitId);
    if (unit) {
      unit.isWorker = false;
      unit.drainPerSecond = 0;
      unit.workerInventory = null;
    }
    this.stats.unregistered += 1;
    return true;
  }

  isWorker(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    return this.records.has(unitId);
  }

  inventoryFor(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    return this.inventories.get(unitId) ?? null;
  }

  // ------------------------------------------------------------------ 任务
  // 派活：先在任务板上占坑，避免多个傀儡一起把同一棵树采穿。
  assignNode(unitOrId, nodeId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    const record = this.records.get(unitId);
    if (!record || !nodeId) return false;
    const node = this.game?.resourceNodes?.nodeById?.(nodeId) ?? null;
    if (!node || (node.amount ?? 0) <= 0) return false;
    const reserved = Math.max(WORKER_DEPOSIT_MIN_COUNT, this.rules.harvestPerAction ?? 1);
    this.board.claim(unitId, nodeId, reserved);
    const task = {
      nodeId,
      node,
      // 位置来自节点状态而不是模型：采空后状态里的坐标仍然有效，轨迹不会突然跳到原点
      x: node.x ?? 0,
      z: node.z ?? 0,
      definitionId: node.definitionId ?? null,
      resource: node.resource ?? null,
      reachable: true
    };
    this.tasks.set(unitId, task);
    record.task = task;
    record.progress = 0;
    record.assignedAt = this.game?.elapsedTime ?? 0;
    resetMoveGoal(record);
    this.setLastError(record, null);
    this.stats.assigned += 1;
    return true;
  }

  clearTask(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    const record = this.records.get(unitId);
    if (!record) return false;
    this.board.release(unitId);
    this.tasks.delete(unitId);
    record.task = null;
    record.progress = 0;
    resetMoveGoal(record);
    return true;
  }

  taskFor(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    return this.tasks.get(unitId) ?? null;
  }

  // 最近一次执行失败的原因（如 needs_tool / no_capacity），供 HUD 解释「为什么不干活」。
  lastError(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    return this.lastErrors.get(unitId) ?? null;
  }

  setLastError(record, error, toolId = null) {
    if (!record) return;
    const previous = record.lastError;
    record.lastError = error ?? null;
    record.lastErrorTool = toolId ?? null;
    if (previous === record.lastError) return;
    if (record.lastError) this.lastErrors.set(record.unitId, { error: record.lastError, toolId: record.lastErrorTool });
    else this.lastErrors.delete(record.unitId);
  }

  // ------------------------------------------------------------------ 每帧
  // 傀儡的整帧驱动。返回 true 表示这一帧由本系统接管（UnitLogicSystem 会跳过战斗 AI）。
  updateWorker(unit, dt) {
    const step = Math.max(0, dt);
    if (!unit?.id || !unit.alive || unit.isBuilding || unit.definition?.canMove === false) return false;
    const record = this.ensureRecord(unit);
    if (!record) return false;

    // 傀儡不参与常规战斗 AI：目标/回城点由作业系统独占
    unit.target = null;
    unit.attackRangeHoldTargetId = null;
    unit.commandMoveGoal = null;
    unit.homePoint = null;
    unit.visualState = 'idle';
    unit.aiState = 'working';
    // 本帧行为耗魔由下面的 action 分支按需覆盖；这里先归零，
    // 免得傀儡站着不动却按上一帧的「搬运/采集」费率扣魔。
    unit.drainPerSecond = POWER_RULES.workerDrainIdle;

    const view = refreshView(record);
    const task = this.refreshTask(record);
    const base = this.basePoint();
    const supply = this.supplyPoint();
    // 节点已经采空：任务到此结束，直接把预留还给任务板。
    // 这一步必须在这里做，而不是等规划器报 node_depleted——采空后再喂一个
    // 空节点给规划器，它只会回报「没有有效任务」，玩家看不到「为什么停下了」。
    // 交掉任务后 workerState 会读取上一帧的 node_depleted 结论，原因文案不会丢。
    if (task && (task.node?.amount ?? 0) <= 0) {
      this.clearTask(record);
      this.stats.depletedTasks += 1;
    }
    const validTask = task && (task.node?.amount ?? 0) > 0 ? task : null;
    if (validTask) {
      // toolSatisfied 必须和 resourceNodeToolSatisfied 同义：
      // 节点定义 tool 为 null（浆果、纤维草）时，任何傀儡都能采。
      // 所以这里先判断「需不需要工具」，不能直接 pack.toolSet.has(null)。
      const requiredTool = requiredToolFor(validTask.node?.definitionId);
      validTask.toolSatisfied = !requiredTool || record.pack.toolSet.has(requiredTool);
      validTask.reachable = !record.move.unreachable;
    }
    const plan = planWorkerStep({
      worker: view,
      task: validTask,
      base,
      supplyPoint: supply,
      inSupplyRange: this.workerInsideSupply(unit),
      baseHasRoom: this.baseHasRoomFor(record),
      rules: this.rules
    });
    record.lastPlan = plan;

    this.executeAction(record, unit, plan, step, validTask);
    return true;
  }

  ensureRecord(unit) {
    const existing = this.records.get(unit.id);
    if (existing) return existing;
    // 还没登记过的傀儡单位（存档恢复、联机镜像、玩家自己捏的单位）当场补登记，
    // 避免「单位是傀儡但没有作业记录」导致整帧丢失。
    return unit.isWorker ? this.registerWorker(unit) : null;
  }

  executeAction(record, unit, plan, dt, task) {
    switch (plan.action) {
      case 'move_to_node':
        this.applyMove(record, unit, plan.target, 'node', dt);
        unit.drainPerSecond = POWER_RULES.workerDrainMove;
        return;
      case 'move_to_base':
        this.applyMove(record, unit, plan.target ?? this.supplyPoint(), 'base', dt);
        unit.drainPerSecond = hasLoad(record)
          ? POWER_RULES.workerDrainCarry
          : POWER_RULES.workerDrainMove;
        return;
      case 'harvest':
        unit.drainPerSecond = POWER_RULES.workerDrainHarvest;
        this.applyHarvest(record, unit, task, dt);
        return;
      case 'deposit':
        unit.drainPerSecond = POWER_RULES.workerDrainIdle;
        this.applyDeposit(record);
        return;
      default:
        // none：原地不动。已经在基地旁边补魔的傀儡靠 PowerSystem 自己回魔，
        // 这里不需要额外动作，只把耗魔归零。
        unit.drainPerSecond = POWER_RULES.workerDrainIdle;
        this.holdPosition(record, unit);
    }
  }

  // 走到目标点。只在目标「有意义地变了」时才确认一次移动意图，
  // 之后每帧的位移由 movement.moveToward 负责（它内部已经做了导航转向）。
  applyMove(record, unit, target, goalKind, dt) {
    if (!target) return false;
    // 资源点自己就是寻路阻挡（橡树 navRadius≈0.95）。让傀儡朝圆心走，
    // MovementAgent.moveToward 里的 safeSurfaceSteeringToward 会一直拿不到安全转向，
    // 于是每帧返回 false，被误判成「路线不可达」——表现就是傀儡一步不动。
    // 所以目标取障碍外缘的可站点；只在首次确定目标时算一次，
    // 避免目标点跟着傀儡一起漂移导致绕圈。
    const needsApproach = goalKind === 'node' && (target.navRadius ?? 0) > 0;
    // 只在目标类型变化时算一次。不能用 hasMoveGoal 判断：它在状态切换时会每帧被重置，
    // 那样目标点会跟着傀儡漂移，顺带把「不可达」计时器也一起清零。
    if (needsApproach && record.move.approachKind !== goalKind) {
      const dx = unitPositionX(unit) - target.x;
      const dz = unitPositionZ(unit) - target.z;
      const length = Math.hypot(dx, dz) || 1;
      // 站在障碍外缘再往外留 0.8：既踩得到采集距离，又不卡在阻挡里
      const stand = Math.min(length, (target.navRadius ?? 0) + 0.8);
      record.move.approachX = target.x + (dx / length) * stand;
      record.move.approachZ = target.z + (dz / length) * stand;
      record.move.approachKind = goalKind;
    }
    const goal = needsApproach
      ? { x: record.move.approachX ?? target.x, z: record.move.approachZ ?? target.z }
      : target;
    ensureGoal(record, goal, goalKind);
    // 傀儡走直线（direct steering）。
    // 这不是随手选的：实测在傀儡位置与目标点都可走的情况下，
    // 导航转向 safeSurfaceSteeringToward 仍会返回空，moveToward 于是每帧 false、
    // 傀儡一步不动（而作业状态机还在按「正在移动」扣魔力）。
    // 直线转向能稳定拿到位移；撞上障碍时 MovementAgent 的 directMoveBlocked
    // 会累计并让规划器改判「路线不可达」，不会静默卡死。
    // 代价是傀儡不会自己绕路——岛上地形开阔时够用，等障碍变密再回头查导航转向。
    unit.moveGoalUsesDirectSteering = true;
    const moved = unit.movement?.moveToward(goal, dt, WORKER_ARRIVE_DISTANCE, { direct: true }) === true;
    if (moved) {
      record.move.staleSeconds = 0;
      return true;
    }
    const stillFar = distance2D(unitPositionX(unit), unitPositionZ(unit), goal.x, goal.z) > WORKER_ARRIVE_DISTANCE + 0.05;
    if (!stillFar) {
      record.move.staleSeconds = 0;
      return false;
    }
    record.move.staleSeconds += dt;
    if (record.move.staleSeconds >= UNREACHABLE_SECONDS) {
      record.move.unreachable = true;
      if (record.task) record.task.reachable = false;
    }
    return false;
  }

  holdPosition(record) {
    record.move.hasMoveGoal = false;
    record.move.goalKind = null;
    record.move.staleSeconds = 0;
  }

  // 采集：按时间累积进度，每满一次结算一次产物，产物直接进傀儡自己的背包。
  //
  // 结算失败分两类：
  //   needs_tool / no_capacity —— 重试也不会变好，本帧就此打住，交给规划器把傀儡带走；
  //   depleted / out_of_range / no_request —— 立刻可恢复，记录原因即可。
  applyHarvest(record, unit, task, dt) {
    const node = task?.node ?? (task?.nodeId ? this.game?.resourceNodes?.nodeById?.(task.nodeId) : null);
    if (!node || (node.amount ?? 0) <= 0) {
      record.progress = 0;
      return false;
    }
    // 背包满了就先不挥这一下：采了也装不进去，进度却已经推进了，
    // 会出现「卡在采集状态、货却进不了包」的静默空转。规划器下一帧会把它送回基地。
    if (workerInventoryFull(record.view)) {
      record.progress = 0;
      return false;
    }
    const advance = advanceHarvestProgress(
      record.progress,
      dt,
      resourceNodeHarvestSeconds(node.definitionId)
    );
    record.progress = advance.progress;
    if (advance.completions <= 0) return false;

    const result = this.harvestOnce(record, unit, node, advance.completions);
    if (!result) return false;
    if (result.blocked) {
      // 不可恢复的失败：把进度清零，避免恢复后「凭空多采一次」
      record.progress = 0;
      return false;
    }
    return true;
  }

  harvestOnce(record, unit, node, completions) {
    const nodes = this.game?.resourceNodes;
    if (!nodes?.harvest) return null;
    let harvested = 0;
    for (let i = 0; i < completions; i += 1) {
      if ((node.amount ?? 0) <= 0) break;
      const result = nodes.harvest(node.id, {
        // 科技加成（"采集效率"）在这里生效：每次采集动作多取几个。
        // 放在调用点而不是改全局规则，是为了让加成来源单一可查。
        amount: Math.max(1, Math.floor(this.rules.harvestPerAction ?? 5)
          + (this.game?.research?.harvestBonus?.() ?? 0)),
        toolIds: record.pack.toolIds,
        position: { x: unitPositionX(unit), z: unitPositionZ(unit) },
        depositTarget: record.inventory
      });
      if (result?.ok) {
        harvested += result.taken ?? 0;
        this.markPackDirty(record);
        continue;
      }
      const error = result?.error ?? RESOURCE_ERROR.noRequest;
      this.setLastError(record, error, result?.requiredTool ?? null);
      if (error === RESOURCE_ERROR.needsTool) this.stats.toolBlocked += 1;
      if (error === RESOURCE_ERROR.depleted || error === RESOURCE_ERROR.unknownNode) {
        record.progress = 0;
        this.board.release(record.unitId);
        return { blocked: true, harvested };
      }
      if (error === RESOURCE_ERROR.needsTool || error === RESOURCE_ERROR.noCapacity) {
        return { blocked: true, harvested };
      }
      // out_of_range / no_request：下一帧规划器会处理，不当作不可恢复
      return { blocked: false, harvested };
    }
    if (harvested > 0) {
      this.stats.harvestActions += 1;
      this.stats.harvested += harvested;
      this.setLastError(record, null);
      unit.visualState = 'harvest';
    }
    return { blocked: false, harvested };
  }

  // 卸货：把背包里所有堆叠类物品转给基地库存。
  // 基地装不下时留在背包里并记录原因——绝不能让这批货在半路上消失。
  applyDeposit(record) {
    const base = this.game?.baseInventory;
    const inventory = record.inventory;
    if (!base || !inventory) return false;
    const pack = this.refreshPack(record);
    let moved = 0;
    let blockedItem = null;
    for (let i = 0; i < pack.itemIds.length; i += 1) {
      const itemId = pack.itemIds[i];
      if (!itemStacksByMerging(itemId)) continue;
      const count = inventory.countOf(itemId);
      if (count < WORKER_DEPOSIT_MIN_COUNT) continue;
      const result = inventory.transferTo(base, itemId, count);
      if (result?.ok) {
        moved += result.moved ?? 0;
        continue;
      }
      blockedItem = itemId;
      this.setLastError(record, 'container_full', itemId);
      break;
    }
    if (moved > 0) {
      this.markPackDirty(record);
      this.stats.deposited += moved;
      this.setLastError(record, null);
      // 卸完这一趟，任务继续：规划器下一帧会根据背包是否为空决定回节点还是待命
    }
    if (blockedItem) {
      this.stats.depositBlocked += 1;
      return false;
    }
    return moved > 0;
  }

  // ------------------------------------------------------------------ 查询
  // 对外状态：一步决策的结果 + 背包与进度，HUD 与调试面板都读它。
  workerState(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    const record = this.records.get(unitId);
    if (!record) {
      return {
        state: WORK_STATE.idle,
        reason: WORK_REASON.noTask,
        note: workStateLabel(WORK_STATE.idle, WORK_REASON.noTask),
        nodeId: null,
        carrying: 0,
        progress: 0
      };
    }
    const plan = record.lastPlan;
    const carrying = record.inventory.totalCount();
    return {
      state: plan?.state ?? WORK_STATE.idle,
      reason: plan?.reason ?? WORK_REASON.noTask,
      note: plan?.note ?? workStateLabel(WORK_STATE.idle, WORK_REASON.noTask),
      nodeId: record.task?.nodeId ?? null,
      carrying,
      inventoryUsed: record.inventory.usedSlots(),
      inventoryCapacity: record.inventory.capacity,
      activityMana: record.unit?.activityMana ?? 0,
      manaCapacity: record.unit?.manaCapacity ?? 0,
      progress: record.progress,
      error: record.lastError ?? null
    };
  }

  // 非每单位的簿记：只清理「单位已经不在注册表里」的傀儡。
  // 不扫描资源节点，也不遍历世界——这条路径每帧都会跑，必须便宜。
  update(dt) {
    void dt;
    if (!this.records.size) return;
    const registry = this.game?.unitRegistry;
    if (!registry?.byId) return;
    const stale = [];
    this.records.forEach((record, unitId) => {
      const unit = record.unit;
      if (!unit || registry.byId.get(unitId) !== unit || unit.alive === false) stale.push(unitId);
    });
    stale.forEach((unitId) => this.unregisterWorker(unitId));
    this.updateAutoAssign(dt);
  }

  // 采集需求表：{ id, resource, weight, targetStock, enabled }
  setDemands(demands) {
    this.demands = Array.isArray(demands) ? demands : [];
    this.autoAssignCooldown = 0;
    return this;
  }

  // 自动派活。只处理「手上没有活」的傀儡，绝不打断正在采或正在运的傀儡——
  // 半路改派会让它把已经背上的货丢掉，也会让玩家看到它在两个点之间反复横跳。
  updateAutoAssign(dt) {
    if (!this.demands?.length || !this.records.size) return;
    this.autoAssignCooldown = Math.max(0, (this.autoAssignCooldown ?? 0) - Math.max(0, dt));
    if (this.autoAssignCooldown > 0) return;
    this.autoAssignCooldown = AUTO_ASSIGN_INTERVAL_SECONDS;

    const idle = [...this.records.entries()]
      .filter(([, record]) => !record.task && record.unit?.alive !== false)
      .map(([unitId]) => unitId)
      .sort();
    if (!idle.length) return;

    const activeNodes = this.game?.resourceNodes?.activeNodes?.() ?? [];
    if (!activeNodes.length) return;
    const stock = this.game?.baseInventory?.countsByItem?.() ?? {};
    const availableNodes = {};
    activeNodes.forEach((node) => {
      availableNodes[node.resource] = (availableNodes[node.resource] ?? 0) + 1;
    });

    const plan = planWorkAllocation({
      demands: this.demands,
      stock,
      availableNodes,
      workerIds: idle
    });
    if (!plan.assignments.length) return;

    // 按资源种类把节点分组，交给每个傀儡最近的、还没被这一轮派出去的节点
    const claimed = new Set();
    const workers = [...idle];
    plan.assignments.forEach((assignment) => {
      const pool = activeNodes.filter((node) => node.resource === assignment.resource);
      for (let i = 0; i < assignment.count && workers.length > 0; i += 1) {
        const unitId = workers.shift();
        const record = this.records.get(unitId);
        if (!record) continue;
        const unitX = record.unit?.position?.x ?? 0;
        const unitZ = record.unit?.position?.z ?? 0;
        const pick = pool
          .filter((node) => !claimed.has(node.id))
          .sort((a, b) => (
            Math.hypot(a.x - unitX, a.z - unitZ) - Math.hypot(b.x - unitX, b.z - unitZ)
          ))[0];
        if (!pick) break;
        claimed.add(pick.id);
        this.assignNode(unitId, pick.id);
      }
    });
  }

  summary() {
    const nodes = new Set();
    let carrying = 0;
    let working = 0;
    this.records.forEach((record) => {
      const plan = record.lastPlan;
      if (plan?.state === 'harvesting' || plan?.state === 'moving_to_node' || plan?.state === 'hauling_home') {
        working += 1;
      }
      if (record.task?.nodeId) nodes.add(record.task.nodeId);
      carrying += record.inventory.totalCount();
    });
    return {
      workers: this.records.size,
      working,
      tasked: [...this.records.values()].filter((record) => Boolean(record.task)).length,
      nodes: nodes.size,
      carrying,
      reservations: this.board.snapshot().length,
      stats: { ...this.stats }
    };
  }

  serializeForSlot() {
    return {
      tasks: [...this.records.entries()].map(([workerId, record]) => ({
        workerId,
        nodeId: record.task?.nodeId ?? null,
        progress: record.progress
      })),
      inventories: [...this.inventories.entries()].map(([workerId, inventory]) => ({
        workerId,
        inventory: inventory.serialize()
      })),
      reservations: this.board.snapshot()
    };
  }

  // ------------------------------------------------------------- 内部小工具
  basePoint() {
    const position = this.game?.playerBase?.position;
    const target = this._basePoint ?? (this._basePoint = { x: 0, z: 0 });
    target.x = position?.x ?? 0;
    target.z = position?.z ?? 0;
    return target;
  }

  // 供能点：优先用基地（PowerSystem 里注册的 player-base 供能半径以基地为圆心）。
  // supplyPoint 与 base 必须是两个独立对象：planWorkerStep 会同时读距离，
  // 共用同一个引用会在后续改动里变成「改一处动两处」的隐患。
  supplyPoint() {
    const position = this.game?.playerBase?.position;
    const resolved = this._supplyPoint ?? (this._supplyPoint = { x: 0, z: 0 });
    resolved.x = position?.x ?? 0;
    resolved.z = position?.z ?? 0;
    return resolved;
  }

  // 「这个傀儡现在是否在供能半径内」：由 PowerSystem 的基地供能半径决定，
  // 不另立一份半径配置，否则会出现「系统说在范围内、实际补不到魔」。
  workerInsideSupply(unit) {
    const position = this.game?.playerBase?.position;
    return distance2D(unitPositionX(unit), unitPositionZ(unit), position?.x ?? 0, position?.z ?? 0)
      <= POWER_RULES.baseSupplyRadius;
  }

  // 基地还装不装得下背包里的货。按物品问，不能凭格数猜。
  baseHasRoomFor(record) {
    const base = this.game?.baseInventory;
    if (!base?.canAccept) return true;
    const pack = this.refreshPack(record);
    for (let i = 0; i < pack.itemIds.length; i += 1) {
      const itemId = pack.itemIds[i];
      if (!itemStacksByMerging(itemId)) continue;
      const count = record.inventory.countOf(itemId);
      if (count <= 0) continue;
      if (base.canAccept(itemId, count) > 0) return true;
    }
    // 背包里全是工具或空背包：没有可卸的货，不构成「容器已满」
    return !pack.anyStacks;
  }

  markPackDirty(record) {
    record.pack.dirty = true;
  }

  /**
   * 外部改动了某个傀儡的背包（例如玩家在基地库存面板里把斧子塞给它）之后调用。
   * 背包缓存不会自己失效：工具列表与卸货清单都从缓存派生，
   * 不通知的话会出现"背包里明明有斧子，规划器还说缺工具"。
   */
  notifyInventoryChanged(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    const record = this.records.get(unitId);
    if (!record) return false;
    this.markPackDirty(record);
    return true;
  }

  // 重算背包缓存：物品清单、工具列表、总件数。只在背包变化后调用。
  refreshPack(record) {
    const pack = record.pack;
    if (!pack.dirty) return pack;
    pack.itemIds.length = 0;
    pack.toolIds.length = 0;
    pack.toolSet.clear();
    pack.totalCount = 0;
    pack.anyStacks = false;
    record.inventory.slots.forEach((slot) => {
      if (!slot) return;
      pack.totalCount += slot.count ?? 0;
      if (!pack.itemIds.includes(slot.itemId)) pack.itemIds.push(slot.itemId);
      const tool = ITEM_DEFINITIONS[slot.itemId]?.tool;
      if (tool) {
        if (!pack.toolSet.has(tool)) pack.toolSet.add(tool);
        if (!pack.toolIds.includes(tool)) pack.toolIds.push(tool);
      } else if (itemStacksByMerging(slot.itemId)) {
        pack.anyStacks = true;
      }
    });
    pack.dirty = false;
    return pack;
  }

  // 任务里的节点引用要指向实时状态对象：节点被采空后 amount 归零，
  // 规划器据此报「资源已耗尽」，而不是继续对着一个已经隐藏的模型挥斧头。
  refreshTask(record) {
    const task = record.task;
    if (!task) return null;
    const node = task.nodeId ? this.game?.resourceNodes?.nodeById?.(task.nodeId) : null;
    if (!node) {
      record.task = null;
      return null;
    }
    task.node = node;
    return task;
  }
}

function requiredToolFor(definitionId) {
  return RESOURCE_NODE_DEFINITIONS[definitionId]?.tool ?? null;
}

// 单位位置统一从 unit.position（Vector3）读。
// UnitEntity 没有 unit.x / unit.z 字段，直接读会得到 undefined，
// 距离计算随之变成 NaN，表现是「傀儡接不到任务、站着不动」。
function unitPositionX(unit) {
  return unit?.position?.x ?? 0;
}

function unitPositionZ(unit) {
  return unit?.position?.z ?? 0;
}

function refreshView(record) {
  const unit = record.unit;
  const view = record.view;
  // 回收节点可能会往背包里塞东西，所以视图刷新前先确保背包缓存是最新的
  record.work.refreshPack(record);
  view.x = unitPositionX(unit);
  view.z = unitPositionZ(unit);
  view.inventoryUsed = record.inventory.usedSlots();
  view.inventoryCapacity = record.inventory.capacity;
  view.activityMana = unit.activityMana ?? 0;
  view.manaCapacity = unit.manaCapacity ?? POWER_RULES.workerManaCapacity;
  return view;
}

function hasLoad(record) {
  record.work.refreshPack(record);
  return record.pack.totalCount > 0;
}

// 目标点变化判定：用记录里的标量比较，避免每帧 clone 向量。
function ensureGoal(record, target, goalKind) {
  const move = record.move;
  if (!move.hasMoveGoal || move.goalKind !== goalKind) {
    move.x = target.x;
    move.z = target.z;
    move.hasMoveGoal = true;
    move.goalKind = goalKind;
    move.staleSeconds = 0;
  }
  return target;
}

function resetMoveGoal(record) {
  record.move.hasMoveGoal = false;
  record.move.goalKind = null;
  record.move.staleSeconds = 0;
  record.move.unreachable = false;
}

function distance2D(ax, az, bx, bz) {
  return Math.hypot((ax ?? 0) - (bx ?? 0), (az ?? 0) - (bz ?? 0));
}
