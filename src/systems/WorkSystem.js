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
  resourceNodeHarvestSeconds,
  resourceNodeStrikeHeight
} from '../data/gameData.js';
import { Inventory } from './Inventory.js';
import {
  countOfInWorkerCargo,
  moveWorkerCargoSlotTo,
  workerCargoSlotCount,
  workerCargoSlotStart,
  workerCargoUsedSlots
} from './workerInventory.js';
import { RESOURCE_ERROR } from './ResourceNodeSystem.js';
import {
  advanceHarvestProgress,
  planWorkerStep,
  WORK_ACTION,
  WORK_REASON,
  WORK_STATE,
  workRules,
  workStateLabel,
  WorkTaskBoard,
  workerInventoryFull,
  workerManaDepleted
} from './workOrders.js';
import {
  puppetGearFor,
  PUPPET_GEAR,
  PUPPET_GEAR_LABELS
} from './puppetArms.js';
import {
  COMBAT_ACTION,
  combatFoes,
  combatPlanRules,
  combatPowerOf,
  decideCombatMove,
  isContactFoe
} from './combatPlan.js';
import {
  BODY_HOLDER,
  COMBAT_PHASE,
  corneredReached,
  defenseTriggered,
  fightResolved,
  fleeResolved,
  fleeTimedOut,
  selectBodyHolder
} from './combatReflex.js';
import {
  advanceSwing,
  cancelSwing,
  createWorkSwing,
  isSwingActive,
  queueSwingCompletions,
  startSwing,
  swingKindForTool,
  workSwingTiming
} from './workSwing.js';
import { playUnitAnimation, setUnitHeldTool } from '../art/visualRegistry.js';
import { itemStacksByMerging } from './items.js';
import { STATION_KIND } from './StationSystem.js';
import { chestAcceptsItem } from './workTasks.js';
import { clamp } from '../utils/math.js';
import { CRAFT_READY_PRIORITY } from './workTasks.js';

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

// 逃跑落点的复用时长与提前重算距离。
// 1.4 秒**必须大于** Game.ROUTE_REPATH_COOLDOWN（1.35）：否则落点总在寻路冷却结束前
// 就换掉，每一帧的寻路请求都会被冷却挡回去，A* 等于没接上（绕障失效）。
// 距离阈值比 Game.ROUTE_REPATH_DISTANCE（1.15）大一点，避免刚走两步就换目标。
const FLEE_TARGET_SECONDS = 1.4;
const FLEE_RETARGET_DISTANCE = 1.6;

export class WorkSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = workRules(options.rules ?? {});
    // 打还是逃的规则（迎战/脱离战力线、危险半径、冷静宽限、逃跑距离）。
    // 独立于作业规则，因为它们的调参节奏完全不同：一个是"多久走到"，一个是"敢不敢打"。
    this.combatRules = combatPlanRules(options.combat ?? {});
    // 节点评分里"每点威胁值折合多少米"。选 2 表示：多 1 点威胁相当于多走 2 米，
    // 所以傀儡仍然优先近的节点，但只要近处那个明显更危险就会换去远处安全的。
    this.threatNodeWeight = Number.isFinite(options.threatNodeWeight) ? options.threatNodeWeight : 2;
    /**
     * 威胁值超过这个数的资源点**不派活**（不只是扣分，而是直接不可选）。
     *
     * 为什么必须"不可选"而不是"扣分"：扣分只能改变优先级，近处那个危险节点
     * （5m 外、威胁 8 → 评分 21）依然会赢过 30m 外的安全节点（评分 30）。
     * 于是傀儡被反复派去同一个危险点，走到就逃、逃完又走回去——
     * 用户报的「跑一段又回头又接着跑」就是这个循环。
     * 2.0 折算成距离大约是"单一敌人 6.3m 以内"。
     */
    this.maxNodeThreat = Number.isFinite(options.maxNodeThreat) ? options.maxNodeThreat : 2;
    this.tasks = new Map();
    // 玩家框选出来的资源点：nodeId -> 优先级 1..12（数字小的先做）。
    // 没有标记就不派活。旧的「按资源种类需求自动采集」不再驱动傀儡。
    this.markedNodes = new Map();
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
      depletedTasks: 0,
      // 自卫反射的可观测计数（验收脚本靠它们断言"打了几场、逃了几次"）
      combats: 0,
      flees: 0,
      fleeTimeouts: 0,
      cornered: 0
    };
    // 上一次执行失败的原因（按 workerId 存），供 HUD / 调试读取；
    // 不放进 workerState 的返回值里，避免每帧新建对象。
    this.lastErrors = new Map();
  }

  // ------------------------------------------------------------------ 登记
  /**
   * 把「单位 / 单位 id / 作业记录」统一解析成作业记录。
   *
   * 为什么必须有这个函数：下面这些入口的第一行以前都是
   *   `const unitId = typeof x === 'object' ? x?.id : x;`
   * 而**作业记录上没有 `id`**（它叫 `unitId`）。于是内部代码一旦顺手写成
   * `this.clearTask(record)`，`unitId` 就是 `undefined`、`records.get(undefined)` 是
   * `undefined`、方法静默 `return false`——什么也没做，而且不报错。
   *
   * 这条静默路径害了一次实打实的 bug（用户口径：「砍完树后就在原地不动了」）：
   * 采空的节点每帧被判一次"已采空"，`clearTask` 每帧都无效，
   * `record.task` 于是永远指着那棵空树；而 `updateAutoAssign` 只挑"手上没活"的傀儡，
   * 所以它**再也不会被派活**，原地待命到天荒地老（`depletedTasks` 每帧 +1）。
   * 同一个坑还有一个受害者：`releaseTaskInDanger` 里的 `clearTask(record)` 也一直是空操作。
   */
  recordFor(target) {
    if (!target) return null;
    // 已经是作业记录：记录表里存的就是它本身
    if (target.unitId !== undefined && this.records.get(target.unitId) === target) return target;
    const unitId = typeof target === 'object' ? target.id : target;
    return this.records.get(unitId) ?? null;
  }

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
    // 基础容量记在 baseManaCapacity 上：背包里的魔力石会在此基础上叠加，
    // 每次重算都从基础值出发，所以反复刷新不会把加成越堆越高。
    unit.baseManaCapacity = POWER_RULES.workerManaCapacity;
    unit.manaCapacity = POWER_RULES.workerManaCapacity;
    if (!Number.isFinite(unit.activityMana)) unit.activityMana = POWER_RULES.workerManaCapacity;
    unit.activityMana = clamp(unit.activityMana, 0, unit.manaCapacity);
    unit.inventoryCapacity = workerCargoSlotCount(owned);
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
        inventoryCapacity: workerCargoSlotCount(owned),
        activityMana: unit.activityMana,
        manaCapacity: unit.manaCapacity
      },
      task: null,
      progress: 0,
      // 采集挥击：动作与"产物在命中帧落地"的节拍都归它管（纯逻辑在 workSwing.js）。
      swing: createWorkSwing(),
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
      assignedAt: 0,
      /** 上一帧是否处于迎战状态（用于跨帧的"胶着"判定，见 updateWorker） */
      engaging: false,
      /** 上一帧的威胁结论（'work'|'engage'|'flee'|'hold'），供 HUD 与调试读取 */
      dangerAction: null,
      /** 这一帧身体归谁（'selfDefense' | 'workOrder'），见 combatReflex.selectBodyHolder */
      bodyHolder: null,
      /**
       * 正在跑的那一场战斗：`null` = 没在打。
       * `{ phase:'fight'|'flee', reason, foeId, startedAt, lastFoeSeenAt, stuckSeconds, cornered, lastX, lastZ }`
       * 见 tickSelfDefense —— 一场战斗是一个**状态**，不是每帧一次重算。
       */
      combat: null,
      /** 战斗刚结束时的时刻，用来算 2 秒冷静宽限（`calmGraceSeconds`） */
      combatCalmSince: null,
      /** 当前复用中的逃跑落点 `{x,z,threat,source,expiresAt}`（见 resolveFleeTarget） */
      flee: null,
      /**
       * 补魔会话：本帧之前是不是正处在"回去补魔 / 原地补魔"里。
       *
       * 状态机（workOrders.planWorkerStep）是纯函数，两个阈值的迟滞需要一份跨帧记忆，
       * 所以它由作业记录持有：`state === lowPower` 置真，其余状态一律置假。
       * 没有这一位就会退化成"补到刚过 25% 就出发"——用户报的
       * 「回到基地一点立刻又去采矿」。
       */
      recharging: false,
      /** 合成 / 存放 / 取出。采集仍走 task，不和差事叠在同一次手上。 */
      errand: null
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
    const record = this.recordFor(unitOrId);
    const unitId = record?.unitId ?? (typeof unitOrId === 'object' ? unitOrId?.id : unitOrId);
    if (unitId === null || unitId === undefined) return false;
    const unit = record?.unit ?? (typeof unitOrId === 'object' ? unitOrId : null);
    if (record?.errand) this.clearErrand(record);
    if (record) cancelSwing(record.swing);
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
    return this.recordFor(unitOrId) !== null;
  }

  inventoryFor(unitOrId) {
    const record = this.recordFor(unitOrId);
    if (record) return this.inventories.get(record.unitId) ?? null;
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    return this.inventories.get(unitId) ?? null;
  }

  // ------------------------------------------------------------------ 任务
  // 派活：先在任务板上占坑，避免多个傀儡一起把同一棵树采穿。
  assignNode(unitOrId, nodeId) {
    const record = this.recordFor(unitOrId);
    if (!record || !nodeId) return false;
    if (record.errand) this.clearErrand(record);
    const unitId = record.unitId;
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
    const record = this.recordFor(unitOrId);
    if (!record) return false;
    const unitId = record.unitId;
    const nodeId = record.task?.nodeId ?? null;
    this.board.release(unitId);
    this.tasks.delete(unitId);
    if (nodeId) this.game?.stations?.releaseGatherClaim?.(nodeId);
    record.task = null;
    record.progress = 0;
    // 挥击也要停：命中的是**节点**，换任务之后那一下会打到别的资源上，
    // 于是玩家会看到"傀儡在砍树、却掉出一块铁矿"。
    cancelSwing(record.swing);
    resetMoveGoal(record);
    return true;
  }

  pokeAssign() {
    this.autoAssignCooldown = 0;
  }

  prepareErrand(record) {
    if (!record) return;
    record.progress = 0;
    resetMoveGoal(record);
  }

  clearErrand(record) {
    if (!record?.errand) return false;
    const errand = record.errand;
    record.errand = null;
    record.progress = 0;
    this.game?.stations?.releaseClaim?.(errand);
    resetMoveGoal(record);
    return true;
  }

  clearErrandsForStation(stationId) {
    if (!stationId) return 0;
    let cleared = 0;
    this.records.forEach((record) => {
      if (record.errand?.stationId !== stationId) return;
      this.clearErrand(record);
      cleared += 1;
    });
    return cleared;
  }

  // 合成、把货从傀儡背包送进容器。
  tickErrand(record, unit, dt) {
    const errand = record.errand;
    const stations = this.game?.stations;
    const station = stations?.stationById?.(errand?.stationId);
    if (!errand || !station || station.unit?.alive === false) {
      this.clearErrand(record);
      return;
    }
    this.clearTransientTargets(unit);
    unit.visualState = 'idle';
    unit.aiState = 'working';
    const range = this.rules.depositRange;
    if (errand.kind === 'craft') {
      this.tickCraftErrand(record, unit, station, range, dt);
      return;
    }
    if (errand.kind === 'store') {
      this.tickHaulErrand(record, unit, station, range, dt);
    }
  }

  tickCraftErrand(record, unit, station, range, dt) {
    const point = buildingPoint(station.unit);
    const here = { x: unitPositionX(unit), z: unitPositionZ(unit) };
    if (distance2D(here.x, here.z, point.x, point.z) > range) {
      unit.drainPerSecond = POWER_RULES.workerDrainMove;
      this.applyMove(record, unit, point, 'station', dt);
      record.lastPlan = {
        state: WORK_STATE.movingToNode,
        reason: WORK_REASON.none,
        note: '前往工作台'
      };
      return;
    }
    this.holdPosition(record, unit);
    unit.drainPerSecond = POWER_RULES.workerDrainHarvest;
    record.progress += dt;
    record.lastPlan = {
      state: WORK_STATE.harvesting,
      reason: WORK_REASON.none,
      note: '正在合成'
    };
    if (record.progress < 1.15) return;
    record.progress = 0;
    const result = this.game.stations.performCraft(station);
    if (!result?.ok || station.craftPriority !== CRAFT_READY_PRIORITY) this.clearErrand(record);
  }

  tickHaulErrand(record, unit, station, range, dt) {
    if (station.kind === STATION_KIND.playerBase) {
      this.tickPlayerBaseStoreErrand(record, unit, station, range, dt);
      return;
    }
    const stations = this.game.stations;
    const here = { x: unitPositionX(unit), z: unitPositionZ(unit) };
    const destPt = buildingPoint(station.unit);
    const carrying = errandCarried(record, record.errand);
    if (record.errand.phase === 'pickup' && !carrying) {
      const offer = stations.storeOffer(station, record.inventory);
      if (!offer?.itemId || countOfInWorkerCargo(record.inventory, offer.itemId) <= 0) {
        this.clearErrand(record);
        return;
      }
      record.errand.itemId = offer.itemId;
      record.errand.phase = 'dropoff';
      resetMoveGoal(record);
      return;
    }
    record.errand.phase = 'dropoff';
    if (distance2D(here.x, here.z, destPt.x, destPt.z) > range) {
      unit.drainPerSecond = POWER_RULES.workerDrainCarry;
      this.applyMove(record, unit, destPt, 'station', dt);
      record.lastPlan = {
        state: WORK_STATE.haulingHome,
        reason: WORK_REASON.none,
        note: '送进容器'
      };
      return;
    }
    const itemId = record.errand.itemId;
    const given = stations.giveCarried(record.inventory, station.inventory, itemId, record.errand.offer);
    this.markPackDirty(record);
    if (!given?.ok) {
      stations.returnCarriedToBase(record.inventory, itemId);
      this.markPackDirty(record);
      this.clearErrand(record);
      return;
    }
    stations.touch(station);
    resetMoveGoal(record);
    const more = stations.storeOffer(station, record.inventory);
    if (more && countOfInWorkerCargo(record.inventory, more.itemId) > 0) {
      record.errand.phase = 'pickup';
      record.errand.itemId = null;
      return;
    }
    this.clearErrand(record);
  }

  tickPlayerBaseStoreErrand(record, unit, station, range, dt) {
    const stations = this.game.stations;
    const here = { x: unitPositionX(unit), z: unitPositionZ(unit) };
    const basePt = this.basePoint();
    const errand = record.errand;
    const carrying = errandCarried(record, errand);
    const offer = errand?.offer ?? stations.storeOffer(station, record.inventory);
    if (!offer?.itemId) {
      this.clearErrand(record);
      return;
    }
    errand.offer = offer;

    if (errand.phase === 'pickup' && !carrying) {
      if (countOfInWorkerCargo(record.inventory, offer.itemId) <= 0) {
        this.clearErrand(record);
        return;
      }
      errand.itemId = offer.itemId;
      errand.phase = 'dropoff';
      resetMoveGoal(record);
      return;
    }
    errand.phase = 'dropoff';
    if (distance2D(here.x, here.z, basePt.x, basePt.z) > range) {
      unit.drainPerSecond = POWER_RULES.workerDrainCarry;
      this.applyMove(record, unit, basePt, 'base', dt);
      record.lastPlan = {
        state: WORK_STATE.haulingHome,
        reason: WORK_REASON.none,
        note: '送进基地'
      };
      return;
    }
    const destination = this.game.baseInventory;
    const itemId = errand.itemId ?? offer.itemId;
    const given = stations.giveCarried(record.inventory, destination, itemId, errand.offer);
    this.markPackDirty(record);
    if (!given?.ok) {
      this.clearErrand(record);
      return;
    }
    stations.touch(station);
    resetMoveGoal(record);
    const more = stations.storeOffer(station, record.inventory);
    if (more && countOfInWorkerCargo(record.inventory, more.itemId) > 0) {
      errand.phase = 'pickup';
      errand.itemId = null;
      errand.offer = more;
      return;
    }
    this.clearErrand(record);
  }

  baseStorageFilter() {
    return this.game?.stations?.playerBaseStation?.()?.filter ?? null;
  }

  taskFor(unitOrId) {
    const record = this.recordFor(unitOrId);
    if (record) return record.task ?? null;
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    return this.tasks.get(unitId) ?? null;
  }

  // 最近一次执行失败的原因（如 needs_tool / no_capacity），供 HUD 解释「为什么不干活」。
  lastError(unitOrId) {
    const record = this.recordFor(unitOrId);
    if (record) return this.lastErrors.get(record.unitId) ?? null;
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

    if (record.rally) {
      const rallyGear = puppetGearFor({
        toolIds: record.pack.toolIds,
        weaponItemId: unit.weaponItemId ?? null
      });
      return this.updateRally(record, unit, step, rallyGear);
    }

    const view = refreshView(record);
    const manaDepleted = workerManaDepleted(view);
    if (manaDepleted && unit.commandMoveGoal) {
      unit.drainPerSecond = POWER_RULES.workerDrainMove;
      return false;
    }
    const gear = puppetGearFor({
      toolIds: record.pack.toolIds,
      weaponItemId: unit.weaponItemId ?? null
    });
    let decision = this.tickSelfDefense(record, unit, view, gear, step);
    if (manaDepleted && decision.action === 'engage') {
      decision = { action: 'flee', reason: 'no_mana', holder: decision.holder };
    }
    const action = decision.action;
    // 记下这一帧的有效结论，供 HUD 与调试读取
    record.dangerAction = action;
    record.bodyHolder = decision.holder;
    // 逃跑时如果手上的活儿就在危险区里，先把它放掉。
    // 不放掉的话威胁一散它就走回那个点，然后再次逃跑——就是"跑一段又回头又接着跑"。
    if (action === 'flee') this.releaseTaskInDanger(record);
    this.applyPuppetGear(unit, gear, action === 'engage');
    if (action === 'engage') {
      record.engaging = true;
      // 把这一帧交回战斗 AI（返回 false）。作业任务**保留**，威胁散了自己回去干。
      this.holdPosition(record, unit);
      unit.homePoint = null;
      unit.drainPerSecond = POWER_RULES.workerDrainIdle;
      record.lastPlan = {
        state: WORK_STATE.engaging,
        reason: WORK_REASON.threatNearby,
        action: WORK_ACTION.none,
        target: null,
        note: workStateLabel(WORK_STATE.engaging, WORK_REASON.threatNearby),
        gear: gear.kind
      };
      return false;
    }
    if (action === 'hold') {
      // 冷静宽限窗口：上一场刚打完，身体还没交回作业层，但也没有可打的目标。
      // 站在警戒里等窗口过去——**不能**这时候回去干活，否则刚被打断的活
      // 会在一帧之内又被同一只怪打断，玩家看到的就是"来回拉扯"。
      record.engaging = false;
      this.clearTransientTargets(unit);
      this.holdPosition(record, unit);
      unit.visualState = 'idle';
      unit.aiState = 'working';
      unit.drainPerSecond = POWER_RULES.workerDrainIdle;
      record.lastPlan = {
        state: WORK_STATE.idle,
        reason: WORK_REASON.threatNearby,
        action: WORK_ACTION.none,
        target: null,
        note: '警戒中',
        gear: gear.kind
      };
      return true;
    }
    record.engaging = false;

    // 合成 / 存放 / 取出不走采集状态机。逃跑仍交给下面的 planWorkerStep。
    if (action !== 'flee' && record.errand && !manaDepleted) {
      this.tickErrand(record, unit, step);
      return true;
    }

    // 傀儡不参与常规战斗 AI：目标/回城点由作业系统独占
    this.clearTransientTargets(unit);
    unit.visualState = 'idle';
    unit.aiState = 'working';
    // 本帧行为耗魔由下面的 action 分支按需覆盖；这里先归零，
    // 免得傀儡站着不动却按上一帧的「搬运/采集」费率扣魔。
    unit.drainPerSecond = POWER_RULES.workerDrainIdle;

    const task = this.refreshTask(record);
    const base = this.basePoint();
    const supply = this.supplyPoint();
    // 节点已经采空：任务到此结束，直接把预留还给任务板。
    // 这一步必须在这里做，而不是等规划器报 node_depleted——采空后再喂一个
    // 空节点给规划器，它只会回报「没有有效任务」，玩家看不到「为什么停下了」。
    // 交掉任务后 workerState 会读取上一帧的 node_depleted 结论，原因文案不会丢。
    if (task && (task.node?.amount ?? 0) <= 0) {
      if (task.nodeId) this.markedNodes.delete(task.nodeId);
      this.game?.syncResourceGatherMarks?.();
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
      // 手里的工具模型跟着"当前要采什么"走：砍树握斧、挖矿握镐。
      // 工具不在背包里时**不显示**——不能让它空手却举着一把斧子。
      // 每帧调用是安全的：setUnitHeldTool 只在工具真的换了的时候动节点。
      setUnitHeldTool(unit, validTask.toolSatisfied ? requiredTool : null);
    }
    const plan = planWorkerStep({
      worker: view,
      task: validTask,
      base,
      supplyPoint: supply,
      inSupplyRange: this.workerInsideSupply(unit),
      baseHasRoom: this.baseHasRoomFor(record),
      rules: this.rules,
      // 补魔迟滞的跨帧记忆在这个纯状态机外面（见 record.recharging 的注释）
      recharging: record.recharging === true,
      // 逃跑落点在这里算：它要读威胁数组与"能不能走"，两者都不属于纯状态机。
      // 已经决定迎战的分支在上面就返回了，所以这里只可能是 'flee' 或 null。
      danger: action === 'flee'
        ? { action: 'flee', target: this.resolveFleeTarget(record, unit) }
        : null
    });
    record.lastPlan = plan;
    // 什么时候算"还在补魔里"。
    //
    // 只要这一帧**没有放行去干活**，补魔会话就保留：去作业、待命、无法继续都表示放行了，
    // 而 `lowPower`（原地补/往回走）与 `haulingHome`/`depositing`（背着满包顺路回基地）
    // 都还站在"没补满就不出发"这一侧。
    //
    // 为什么不能只认 lowPower：满包回程排在补魔**前面**，一个又满包又缺魔的傀儡
    // 走回来的那几帧 state 是 hauling_home。只认 lowPower 的话，这几帧会把它刚攒下的
    // 补魔会话清掉，等它卸完货魔力已经过 25%，就直接带着半电去采矿了——
    // 正是这次要修的"回到基地不多补一会儿"。反之若一律保留，一个满电却背着货的傀儡
    // 也会被无谓地记成"在补魔"（只是显示噪点，不影响行为：它在供能点旁本来就会回满）。
    //
    // 迎战与警戒在上面就 return 了，所以战斗打断**不会**冲掉这一位：
    // 打完之后魔力还是见底，它会接着把电补满再回矿点。
    record.recharging = plan.state === WORK_STATE.lowPower
      || plan.action === WORK_ACTION.moveToBase
      || plan.action === WORK_ACTION.deposit;

    this.executeAction(record, unit, plan, step, validTask);
    return true;
  }

  /**
   * 自卫反射：这一刻身体归谁，以及打还是逃。
   *
   * 返回 `{ action, reason, holder }`，`action` 取：
   *   - `'work'`   —— 身体交回作业层，照常干活
   *   - `'engage'` —— 迎战：把这一帧交回常规战斗 AI（挥击/弹道/走位全归那一份实现）
   *   - `'flee'`   —— 逃跑：自己去低威胁的地方
   *   - `'hold'`   —— 身体还归反射（冷静宽限窗口里），但没有可打的目标，原地警戒
   *
   * 与旧实现的三点差别，每一点都对应一个被用户实测打脸的症状：
   *
   * 1. **触发是布尔，而且要求"它正在打我"**。
   *    旧实现只要威胁压力超过 `safePressure` 就接管，于是"8m 外站着的一只狼"
   *    也会让傀儡丢下工作（用户第 4 轮："一开始为什么还朝狼走"）。
   *    现在只有"锁了我 / 刚咬过我"并且**已经进了它自己的危险半径**才触发；
   *    路过的、还没动手的敌人一律不管——这就是"有些会打有些不会打，很干脆"。
   *
   * 2. **一场战斗是一个状态，不是每帧一次重算**（`record.combat`）。
   *    开打时判一次打还是逃，然后只在四个事件上重判：目标没了、来了新的敌人、
   *    我扛不住了、退无可退。旧实现每帧重算 + 判定含距离，就是「互相拉扯」。
   *
   * 3. **结束条件只有一个**：战斗是"没人再追我"（含 2 秒冷静宽限），
   *    逃跑是"身边没有追兵"。刻意不用"威胁压力降下来了"——
   *    傀儡一跑起来那个值按定义就会降，起跑两秒就判"跑掉了"，而身后还跟着三只。
   */
  tickSelfDefense(record, unit, view, gear, dt) {
    const rules = this.combatRules;
    const now = Number(this.game?.elapsedTime) || 0;
    const reachOf = this.attackReachResolver();
    const threats = this.game?.threat?.threatsNear?.(view, rules.scanRadius) ?? [];
    const foes = combatFoes({ self: unit, threats, rules, reachOf, now });
    const triggered = defenseTriggered({ foes });
    const holder = selectBodyHolder({
      session: record.combat ?? null,
      triggered,
      now,
      calmSince: record.combatCalmSince ?? null,
      rules
    });

    if (holder !== BODY_HOLDER.selfDefense) {
      // 身体不归反射：把还在跑的那一场收干净（正常情况下上面已经收过了，
      // 这里兜的是"单位被换掉/目标直接消失"之类的边界）
      if (record.combat) this.closeCombatSession(record, { now, calm: false });
      return { action: 'work', reason: 'clear', holder };
    }

    const power = combatPowerOf({ unit, gear });

    if (!record.combat) {
      // 开一场新的：**当场判一次打还是逃**。
      const manaEmpty = (unit.manaCapacity ?? 0) > 0 && (unit.activityMana ?? 0) <= 0;
      let move = decideCombatMove({
        self: unit,
        foes,
        gearPower: power,
        engaged: false,
        cornered: false,
        last: null,
        rules
      });
      if (manaEmpty && move.action !== COMBAT_ACTION.disengage && move.action !== COMBAT_ACTION.done) {
        move = { ...move, action: COMBAT_ACTION.disengage, reason: 'no_mana' };
      }
      if (move.action === COMBAT_ACTION.done) {
        // 冷静宽限期里的空转：不新开一场，也不把身体交回作业
        //（Numen 的 `tick` 在这个窗口里就是"返回 RUNNING 但什么也不做"）。
        return { action: 'hold', reason: 'calm', holder };
      }
      this.openCombatSession(record, view, move, now);
      return { action: this.combatPhaseAction(record), reason: record.combat.reason, holder };
    }

    if (record.combat.phase === COMBAT_PHASE.fight) {
      if ((unit.manaCapacity ?? 0) > 0 && (unit.activityMana ?? 0) <= 0) {
        record.combat.phase = COMBAT_PHASE.flee;
        record.combat.reason = 'no_mana';
        record.combat.startedAt = now;
        record.combat.stuckSeconds = 0;
        record.flee = null;
        this.stats.flees += 1;
        return { action: 'flee', reason: 'no_mana', holder };
      }
      if (foes.some(isContactFoe)) record.combat.lastFoeSeenAt = now;
      if (fightResolved({ foes })) {
        // 收场并进入**唯一**的那个冷静宽限：身体还归反射、站在原地警戒，
        // 但不再新开一场。宽限结束后 `combatCalmSince` 自然过期，身体交回作业。
        // 刻意在收场时返回 'hold' 而不是 'work'：后者会让这一帧先闪一下作业状态
        // （清目标、摆出干活姿势），下一帧又被宽限拉回警戒，看起来像抖了一下。
        this.closeCombatSession(record, { now, calm: true });
        return { action: 'hold', reason: 'calm', holder: BODY_HOLDER.selfDefense };
      }
      const move = decideCombatMove({
        self: unit,
        foes,
        gearPower: power,
        engaged: true,
        cornered: record.combat.cornered === true,
        last: record.combat,
        rules
      });
      if (move.action === COMBAT_ACTION.disengage) {
        // 打不过了：转逃跑。**落点丢掉重算**，否则会沿着"迎战方向"的旧路线跑。
        record.combat.phase = COMBAT_PHASE.flee;
        record.combat.reason = move.reason;
        record.combat.startedAt = now;
        record.combat.stuckSeconds = 0;
        record.flee = null;
        this.stats.flees += 1;
      } else {
        // 承诺：`decideCombatMove` 会优先保留上一刻那只，只有它死了/消失了才换
        record.combat.foeId = move.foeId ?? record.combat.foeId;
        record.combat.reason = move.reason;
      }
      return { action: this.combatPhaseAction(record), reason: record.combat.reason, holder };
    }

    // ---- 逃跑阶段 ----
    this.trackFleeStuck(record, unit, view, foes, power, dt);
    const pursuers = this.game?.threat?.pursuersNear?.(view, rules.fleeDistance) ?? [];
    if (fleeResolved({ pursuers })) {
      this.closeCombatSession(record, { now, calm: false });
      return { action: 'work', reason: 'escaped', holder: BODY_HOLDER.workOrder };
    }
    // 兜底阀门：追兵比傀儡快时距离永远拉不开，不能"永远在跑"（狼 3.9 vs 傀儡 2.85）
    if (fleeTimedOut({ startedAt: record.combat.startedAt, now, rules })) {
      this.stats.fleeTimeouts += 1;
      this.closeCombatSession(record, { now, calm: false });
      return { action: 'work', reason: 'flee_timeout', holder: BODY_HOLDER.workOrder };
    }
    return { action: this.combatPhaseAction(record), reason: record.combat.reason, holder };
  }

  combatPhaseAction(record) {
    return record?.combat?.phase === COMBAT_PHASE.flee ? 'flee' : 'engage';
  }

  openCombatSession(record, view, move, now) {
    const fleeing = move.action === COMBAT_ACTION.disengage;
    record.combat = {
      phase: fleeing ? COMBAT_PHASE.flee : COMBAT_PHASE.fight,
      reason: move.reason,
      foeId: move.foeId ?? null,
      startedAt: now,
      lastFoeSeenAt: now,
      stuckSeconds: 0,
      cornered: false,
      lastX: view?.x ?? 0,
      lastZ: view?.z ?? 0
    };
    record.flee = null;
    record.combatCalmSince = null;
    this.stats.combats += 1;
    if (fleeing) this.stats.flees += 1;
    return record.combat;
  }

  /**
   * 收场。
   *
   * `calm` 决定要不要留冷静宽限：**战斗**结束后要（刚杀掉一只，狼群边上还有别的，
   * 不留宽限就会一帧一帧地重开），**逃跑**结束后不要（那时身边 14m 内已经没有追兵，
   * 再触发是不可能的，留了只是白站两秒）。
   */
  closeCombatSession(record, { now = 0, calm = false } = {}) {
    const combat = record.combat;
    if (!combat) return false;
    if (combat.cornered === true) this.stats.cornered += 1;
    record.combat = null;
    record.engaging = false;
    record.flee = null;
    record.combatCalmSince = calm ? now : null;
    return true;
  }

  /**
   * 「退无可退」（Numen `cornered`）：想跑但一步都没动 → 转身打。
   *
   * 这是逃跑阶段唯一的提前结束理由，而且**一闩住就不再翻回来**：
   * 它退到墙角、挪不动、转身打；不闩的话下一刻又判"跑步掉"、再撞回墙角，一帧一帧地抖。
   * 空手例外——power 恒为 0，"硬着头皮打"只是站着挨打，所以它继续找路逃。
   */
  trackFleeStuck(record, unit, view, foes, power, dt) {
    const combat = record.combat;
    if (!combat) return false;
    const lastX = Number.isFinite(combat.lastX) ? combat.lastX : view?.x ?? 0;
    const lastZ = Number.isFinite(combat.lastZ) ? combat.lastZ : view?.z ?? 0;
    const moved = Math.hypot((view?.x ?? 0) - lastX, (view?.z ?? 0) - lastZ);
    combat.stuckSeconds = moved < 0.02 ? (combat.stuckSeconds ?? 0) + Math.max(0, dt) : 0;
    combat.lastX = view?.x ?? 0;
    combat.lastZ = view?.z ?? 0;
    if (combat.cornered === true) return false;
    if (!corneredReached({ stuckSeconds: combat.stuckSeconds, rules: this.combatRules })) return false;
    combat.cornered = true;
    combat.stuckSeconds = 0;
    const move = decideCombatMove({
      self: unit,
      foes,
      gearPower: power,
      engaged: true,
      cornered: true,
      last: combat,
      rules: this.combatRules
    });
    if (move.action === COMBAT_ACTION.disengage) {
      combat.reason = 'cornered-unarmed';
      return false;
    }
    combat.phase = COMBAT_PHASE.fight;
    combat.reason = 'cornered';
    record.flee = null;
    return true;
  }

  /** 攻击射程的解析器：武器/增益会改射程，所以危险半径必须走 modifiers 而不是裸 definition。 */
  attackReachResolver() {
    const modifiers = this.game?.modifiers;
    if (typeof modifiers?.getAttackRange !== 'function') return null;
    return (target) => modifiers.getAttackRange(target);
  }

  /** 傀儡的"目标/回城点/移动指令"三件套：作业层独占，每次交还身体时一起清掉。 */
  clearTransientTargets(unit) {
    unit.target = null;
    unit.attackRangeHoldTargetId = null;
    unit.commandMoveGoal = null;
    unit.homePoint = null;
  }

  /**
   * 把装备的数值写到**这一个单位**的属性上。
   *
   * 刻意走 `attributes.setBase` 而不是改 `UNIT_DEFINITIONS`：定义是全体共享的，
   * 改它等于让所有傀儡同时获得战力，而"拿斧子的那支能打、空手的那支只会跑"
   * 正是需求要区分的东西。这与 `Game.applyWeaponToUnit` 是同一条路。
   *
   * `aggroRange` 是"要不要打"的总开关：不迎战时钉死为 0，傀儡就不会自己去找架打。
   */
  applyPuppetGear(unit, gear, engaging) {
    const attributes = unit?.attributes;
    if (!attributes?.setBase || !gear) return;
    attributes.setBase('physicalAttack', gear.damage, { min: 0 });
    attributes.setBase('attackRate', gear.attackRate, { min: 0.05 });
    attributes.setBase('maxDurability', gear.maxDurability, { min: 1 });
    attributes.setBase('durabilityCost', gear.durabilityCost, { min: 0 });
    attributes.setBase('aggroRange', engaging ? this.combatRules.engageAggroRange : 0, { min: 0 });
    if (unit.weapon) {
      unit.weapon.name = gear.name;
      // 从真武器换回工具时，旧武器的满耐久会超过新的上限，夹一下免得 HUD 显示 90/40
      if (Number.isFinite(unit.weapon.durability) && unit.weapon.durability > gear.maxDurability) {
        unit.weapon.durability = gear.maxDurability;
      }
    }
    unit.workerGearKind = gear.kind;
    unit.workerGearLabel = PUPPET_GEAR_LABELS[gear.kind] ?? gear.kind;
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
      case 'flee':
        // 逃跑按"赶路"计费：它确实在跑
        unit.drainPerSecond = POWER_RULES.workerDrainMove;
        this.applyFlee(record, unit, plan.target, dt);
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
  // 逃跑：朝威胁更低的方向走，并且**走寻路**（A* 路线），不是直线。
  //
  // 为什么不能只决定方向：
  //   直线逃跑撞上障碍就完全走不动（`tryApplyWalkableStep` 三次尝试都失败 → 返回 false），
  //   而威胁还在逼近，于是表现是"傀儡贴着一堵墙原地抽搐直到被咬死"。
  //   用户原话：「木傀儡逃跑时要寻路，而不是只决定方向，不然撞墙卡死」。
  //
  // 为什么不复用 applyMove：
  //   1. applyMove 只在「目标类型变了」时才更新落点（ensureGoal），而逃跑的落点
  //      必须跟着威胁走——但**不能每帧重算**（见 resolveFleeTarget 的注释）；
  //   2. applyMove 走不动时会把当前任务的节点标成 `reachable = false`。逃跑时
  //      被逼到角落走不动是正常的，不能让傀儡回去以后拒绝自己原本的节点。
  //
  // 路线还没算出来的那一两帧会站着，不算失败。不算直线硬挤：树干前面挤不动。
  applyFlee(record, unit, target, dt) {
    if (!target) {
      // 周围没有更安全的落点：原地不动比朝随机方向乱跑安全（乱跑会撞进更大的威胁）
      this.holdPosition(record, unit);
      return false;
    }
    const move = record.move;
    move.x = target.x;
    move.z = target.z;
    move.hasMoveGoal = true;
    move.goalKind = 'flee';
    move.staleSeconds = 0;
    // 逃跑也走寻路。直线退路会一头扎进旁边的树，然后在树干前停死。
    unit.moveGoalUsesDirectSteering = false;
    return unit.movement?.moveToward(target, dt, WORKER_ARRIVE_DISTANCE) === true;
  }

  /**
   * 逃跑落点的复用：**算出来的落点要保持一小段时间**，不能每帧重算。
   *
   * 两个原因，缺一个都会退化：
   *   1. 寻路需要稳定的目标。`navGridSteeringToward` 只在"目标变了超过
   *      ROUTE_REPATH_DISTANCE"时才重新找路，而且有重寻冷却（1.35 秒）。
   *      落点每帧都动 → 每帧都判定"目标变了" → 每帧的寻路请求都被冷却挡掉
   *      → 它只能沿着一条为旧目标算出来的路线走，绕障等于没有生效。
   *   2. 落点每帧重算还会让它在两个差不多安全的格子之间来回抖。
   *
   * 所以：算一次用 `FLEE_TARGET_SECONDS`，走到附近就提前重算（威胁散了要能马上停）。
   *
   * 落点用 `escapeTargetFor`（按"离追兵最远"排）而不是 `fleeTargetFor`（按"威胁值最低"排）：
   * 威胁值在威胁圈外一律是 0，排不出"3 米外"和"14 米外"的差别，而逃跑要的正是后者——
   * Numen 的原话是"逃跑距离必须远大于危险半径，两件事共用一个数的时候，
   * 她退两格就判'跑掉了'、站住、被追上，于是走走停停"。
   */
  resolveFleeTarget(record, unit) {
    const now = Number(this.game?.elapsedTime) || 0;
    const current = record.flee;
    if (current) {
      const distance = distance2D(unitPositionX(unit), unitPositionZ(unit), current.x, current.z);
      if (distance > FLEE_RETARGET_DISTANCE && now < current.expiresAt) return current;
    }
    const reach = this.combatRules.fleeDistance;
    const threat = this.game?.threat;
    const next = threat?.escapeTargetFor?.(unit, { reach, rings: 6 })
      ?? threat?.fleeTargetFor?.(unit, { stepSize: reach / 3 })
      ?? null;
    record.flee = next
      ? { x: next.x, z: next.z, threat: next.threat, source: next.source, expiresAt: now + FLEE_TARGET_SECONDS }
      : null;
    return record.flee;
  }

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
    // 走寻路，不走直线。直线会贴着树停住：tryApplyWalkableStep 拒绝走进阻挡，
    // 傀儡就在树干前面一帧一帧地返回 false。采集点的落点已经让到树冠外面，
    // 寻路的终点是那一圈可走的站位，不是树心。
    unit.moveGoalUsesDirectSteering = false;
    const moved = unit.movement?.moveToward(goal, dt, WORKER_ARRIVE_DISTANCE) === true;
    if (moved) {
      record.move.staleSeconds = 0;
      return true;
    }
    const stillFar = distance2D(unitPositionX(unit), unitPositionZ(unit), goal.x, goal.z) > WORKER_ARRIVE_DISTANCE + 0.05;
    if (!stillFar) {
      record.move.staleSeconds = 0;
      return false;
    }
    // 路线还在寻路线程里的时候不要当成撞墙。算完之前站着等，比直线撞树强。
    if (unit.pendingRouteRequestId != null) {
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

  // 采集：按时间累积进度；每满一次就"挥一下"，产物与打击反馈在挥击的命中帧落地。
  //
  // 为什么拆成"进度"和"挥击"两件事：进度负责**吞吐**（多久出一份货），
  // 挥击只负责**节拍与表现**（哪一帧出手、哪一帧冒木屑）。
  // 如果让挥击把进度累积挡住，一次采集就变成「攒 1.6 秒 + 挥 0.9 秒」，
  // 采集速度直接掉三分之一——那是把表现需求做成了平衡改动，不能这么干。
  //
  // 结算失败分两类：
  //   needs_tool / no_capacity —— 重试也不会变好，本帧就此打住，交给规划器把傀儡带走；
  //   depleted / out_of_range / no_request —— 立刻可恢复，记录原因即可。
  applyHarvest(record, unit, task, dt) {
    const node = task?.node ?? (task?.nodeId ? this.game?.resourceNodes?.nodeById?.(task.nodeId) : null);
    if (!node || (node.amount ?? 0) <= 0) {
      record.progress = 0;
      cancelSwing(record.swing);
      return false;
    }
    // 采集时面向资源点。
    //
    // 为什么必须显式转向：傀儡是靠 `moveToward` 才转向的（它按实际移动方向摆姿势），
    // 而进了采集距离之后就不再移动 —— 站位刚好的时候 `moveToward` 直接早退，
    // 一帧都不转向。于是"迎战后回到树前"的表现是：朝向停在刚才那只敌人的方向，
    // 举着斧子朝空地砍（用户实测第 1 条：杀掉敌人回到任务后不会转向）。
    // 这里每帧 face 一次是安全的：MovementAgent.face 只在角度真的差着时才动 mesh。
    unit.movement?.face(node, dt);
    // 背包满了就先不挥这一下：采了也装不进去，进度却已经推进了，
    // 会出现「卡在采集状态、货却进不了包」的静默空转。规划器下一帧会把它送回基地。
    if (workerInventoryFull(record.view)) {
      record.progress = 0;
      cancelSwing(record.swing);
      return false;
    }

    // 先把正在进行的挥击推进到这一帧：跨过命中帧就结算产物 + 打出反馈。
    const swingStep = advanceSwing(record.swing, dt);
    if (swingStep.struck) {
      const settled = this.settleWorkSwing(record, unit, node, swingStep.completions);
      if (settled) return true;
      // 结算失败（缺工具/背包满/采空）：挥击已经作废，进度也要清掉，
      // 否则恢复之后会"凭空多采一次"。
      record.progress = 0;
      cancelSwing(record.swing);
      return false;
    }

    const advance = advanceHarvestProgress(
      record.progress,
      dt,
      resourceNodeHarvestSeconds(node.definitionId)
    );
    record.progress = advance.progress;
    if (advance.completions <= 0) return false;

    // 攒够一份货：开始一次挥击，产物在它的命中帧落地。
    // 已经在挥的时候只把次数记进去（下一次命中帧一起结算），
    // 这样"产物来得比动作快"不会打断动作，也不会丢货。
    const kind = swingKindForTool(requiredToolFor(node.definitionId));
    if (isSwingActive(record.swing)) {
      queueSwingCompletions(record.swing, advance.completions);
      return false;
    }
    const timing = workSwingTiming(unit.definition, kind);
    startSwing(record.swing, {
      kind,
      duration: timing.duration,
      strikeAt: timing.strikeAt,
      completions: advance.completions
    });
    // 动作与挥击同一帧开始：动画系统按名字取 timelines 里的时长与命中点，
    // 两边用的是**同一份数据**（workSwingTiming 读的就是 definition.art.timelines）。
    playUnitAnimation(unit, kind);
    return false;
  }

  /** 挥击命中：把攒下的采集次数结算掉，并在同一个接触点打出打击反馈。 */
  settleWorkSwing(record, unit, node, completions) {
    const result = this.harvestOnce(record, unit, node, completions);
    if (!result || result.blocked) return false;
    if ((result.harvested ?? 0) <= 0) return false;
    this.spawnWorkStrikeFeedback(unit, node);
    return true;
  }

  /**
   * 砍/挖的打击反馈：木屑、碎石、尘与地面擦痕。
   *
   * 接触点用节点自己的"咬合高度"（见 `resourceNodeStrikeHeight`），
   * 而不是统一 1 米：树砍在树干中段、石堆砸在腰上、浆果丛齐膝。
   * 特效本身的形状与对象池在 EffectsSystem 里，这里只负责"在哪、是什么材质"。
   */
  spawnWorkStrikeFeedback(unit, node) {
    const effects = this.game?.effects;
    if (!effects?.spawnWorkStrike) return false;
    const definition = RESOURCE_NODE_DEFINITIONS[node.definitionId] ?? null;
    const x = node.x ?? 0;
    const z = node.z ?? 0;
    const groundY = this.game?.groundHeightAt?.(x, z) ?? 0;
    return effects.spawnWorkStrike(
      { x, y: groundY + resourceNodeStrikeHeight(node.definitionId), z },
      {
        resource: definition?.resource ?? 'wood',
        radius: Math.max(0.6, Number(definition?.navRadius) || 0.9),
        kind: swingKindForTool(definition?.tool ?? null)
      }
    );
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
    this.refreshPack(record);
    let moved = 0;
    let blockedItem = null;
    const filter = this.baseStorageFilter();
    const start = workerCargoSlotStart();
    for (let index = start; index < inventory.slots.length; index += 1) {
      const slot = inventory.slots[index];
      if (!slot?.itemId || !itemStacksByMerging(slot.itemId)) continue;
      if (filter && !chestAcceptsItem(filter, slot.itemId)) continue;
      if ((slot.count ?? 0) < WORKER_DEPOSIT_MIN_COUNT) continue;
      const result = moveWorkerCargoSlotTo(inventory, index, base);
      if (result?.ok) {
        moved += result.moved ?? 0;
        continue;
      }
      blockedItem = slot.itemId;
      this.setLastError(record, 'container_full', slot.itemId);
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
    const record = this.recordFor(unitOrId);
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
      inventoryUsed: workerCargoUsedSlots(record.inventory),
      inventoryCapacity: workerCargoSlotCount(record.inventory),
      activityMana: record.unit?.activityMana ?? 0,
      manaCapacity: record.unit?.manaCapacity ?? 0,
      // 补魔会话（迟滞）：为真表示"这一轮补魔还没结束，补满才会回去干活"。
      // HUD 与验收脚本读它，避免再去反推 state 字符串。
      recharging: record.recharging === true,
      progress: record.progress,
      error: record.lastError ?? null,
      // 威胁与战力：验收脚本靠这几个字段判断"它到底是打、是逃、还是在干活"，
      // 不必再去反推 plan 的字符串。
      threat: this.game?.threat?.threatAt?.(record.view?.x ?? 0, record.view?.z ?? 0) ?? 0,
      gearKind: record.unit?.workerGearKind ?? PUPPET_GEAR.unarmed,
      engaging: record.engaging === true,
      // 自卫反射的状态：验收脚本靠它断言"这一场有没有真的开起来、在打还是在逃"，
      // 不必再去反推 plan 的字符串或 action 字段。
      bodyHolder: record.bodyHolder ?? BODY_HOLDER.workOrder,
      combatPhase: record.combat?.phase ?? null,
      combatReason: record.combat?.reason ?? null,
      combatFoeId: record.combat?.foeId ?? null,
      cornered: record.combat?.cornered === true
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

  // 旧的资源需求表还留着入口，但派活不再读它。
  setDemands(demands) {
    this.demands = Array.isArray(demands) ? demands : [];
    return this;
  }

  /**
   * 把框选到的资源点标上优先级。1 最先做，12 最后做。
   * 同一个点再框一次就改成新的优先级，不叠加。
   */
  markNodes(nodeIds, priority) {
    const level = Math.max(1, Math.min(12, Math.round(Number(priority) || 4)));
    const nodes = this.game?.resourceNodes;
    let marked = 0;
    (nodeIds ?? []).forEach((nodeId) => {
      const node = nodes?.nodeById?.(nodeId) ?? null;
      if (!node || (node.amount ?? 0) <= 0) return;
      this.markedNodes.set(nodeId, level);
      marked += 1;
    });
    if (marked > 0) this.autoAssignCooldown = 0;
    this.game?.syncResourceGatherMarks?.();
    return marked;
  }

  /**
   * 右键临时点：先放下手里的活，走过去；路上不接战、不受击，到点立刻恢复采集任务。
   */
  beginRally(unit, point) {
    const record = this.recordFor(unit);
    if (!record || !point) return false;
    const suspendedNodeId = record.task?.nodeId ?? record.rally?.suspendedNodeId ?? null;
    this.clearTask(record);
    record.rally = {
      x: point.x,
      z: point.z,
      phase: 'moving',
      suspendedNodeId
    };
    resetMoveGoal(record);
    return true;
  }

  nearestHostile(unit, range) {
    const enemies = this.game?.enemyUnits;
    if (!enemies?.length || !unit?.position) return null;
    let best = null;
    let bestDistance = range;
    enemies.forEach((enemy) => {
      if (!enemy?.alive || enemy.underConstruction) return;
      const distance = Math.hypot(
        (enemy.position?.x ?? 0) - unit.position.x,
        (enemy.position?.z ?? 0) - unit.position.z
      );
      if (distance >= bestDistance) return;
      best = enemy;
      bestDistance = distance;
    });
    return best;
  }

  updateRally(record, unit, dt, gear) {
    const rally = record.rally;
    if (!rally) return false;
    record.engaging = false;
    this.applyPuppetGear(unit, gear, false);
    this.clearTransientTargets(unit);
    const distance = distance2D(unitPositionX(unit), unitPositionZ(unit), rally.x, rally.z);
    if (distance <= 1.2) {
      this.finishRally(record, unit);
      return true;
    }
    rally.phase = 'moving';
    this.applyMove(record, unit, rally, 'rally', dt);
    unit.visualState = 'walk';
    unit.aiState = 'working';
    unit.drainPerSecond = POWER_RULES.workerDrainMove;
    record.lastPlan = {
      state: WORK_STATE.movingToNode,
      reason: WORK_REASON.none,
      action: WORK_ACTION.moveToNode,
      target: rally,
      note: '前往临时位置'
    };
    return true;
  }

  finishRally(record, unit) {
    const nodeId = record.rally?.suspendedNodeId ?? null;
    record.rally = null;
    resetMoveGoal(record);
    if (!nodeId) return;
    const node = this.game?.resourceNodes?.nodeById?.(nodeId);
    if (!node || (node.amount ?? 0) <= 0) return;
    this.assignNode(unit, nodeId);
  }

  // 自动派活。只处理「手上没有活、也没在赶临时点」的傀儡。
  // 活只来自玩家框选的资源点，按优先级从 1 到 12，同级里挑更近、更安全的。
  updateAutoAssign(dt) {
    if (!this.records.size) return;
    // 框选采集、合成、存放、取出共用这一次节流。数字越小越先做。
    this.autoAssignCooldown = Math.max(0, (this.autoAssignCooldown ?? 0) - Math.max(0, dt));
    if (this.autoAssignCooldown > 0) return;
    this.autoAssignCooldown = AUTO_ASSIGN_INTERVAL_SECONDS;
    this.game?.stations?.assignIdleWorkers?.(this);
    if (!this.markedNodes.size) return;

    const idle = [...this.records.entries()]
      .filter(([, record]) => (
        !record.rally && !record.task && !record.errand && record.unit?.alive !== false
      ))
      .map(([unitId]) => unitId)
      .sort();
    if (!idle.length) return;

    const activeNodes = this.game?.resourceNodes?.activeNodes?.() ?? [];
    const pool = activeNodes.filter((node) => (
      this.markedNodes.has(node.id) && this.nodeIsWorkable(node)
    ));
    if (!pool.length) return;
    const claimed = new Set();
    idle.forEach((unitId) => {
      const record = this.records.get(unitId);
      if (!record) return;
      const unitX = record.unit?.position?.x ?? 0;
      const unitZ = record.unit?.position?.z ?? 0;
      const pick = pool
        .filter((node) => !claimed.has(node.id))
        .sort((a, b) => {
          const priorityDelta = (this.markedNodes.get(a.id) ?? 12) - (this.markedNodes.get(b.id) ?? 12);
          if (priorityDelta !== 0) return priorityDelta;
          return this.nodeWorkScore(a, unitX, unitZ) - this.nodeWorkScore(b, unitX, unitZ);
        })[0];
      if (!pick) return;
      claimed.add(pick.id);
      this.assignNode(unitId, pick.id);
    });
  }

  /**
   * 一个资源点现在能不能派活。
   *
   * `nodeWorkScore` 给危险节点打了极大的分，但**光靠评分是不够的**：
   * `pool.sort(score)[0]` 总会挑出一个来，全是危险节点时照样会派。
   * 所以派活的池子必须显式过滤掉它们（见 updateAutoAssign）。
   */
  nodeIsWorkable(node) {
    return this.nodeThreatAt(node) < this.maxNodeThreat;
  }

  nodeThreatAt(node) {
    if (!node) return 0;
    return this.game?.threat?.threatAt?.(node.x, node.z) ?? 0;
  }

  /**
   * 资源节点的作业评分：越小的越优先。
   *
   * 需求原文：「在执行非战斗任务时要选择威胁度低的地方执行」。所以评分不是纯距离，
   * 而是"距离 + 威胁惩罚"：`threatNodeWeight` 是每 1 点威胁折合多少米。
   * 这样近处那个明显更危险的节点会被换掉，但不会因为远处节点威胁值差一点点
   * 就让傀儡横穿全岛。
   *
   * 威胁超过 `maxNodeThreat` 的点直接给 `Infinity`（配合 `nodeIsWorkable` 的过滤），
   * 表达的是"这个点现在不是'远一点'，而是'不能去'"。
   */
  nodeWorkScore(node, unitX, unitZ) {
    const distance = Math.hypot((node?.x ?? 0) - unitX, (node?.z ?? 0) - unitZ);
    if (!(this.threatNodeWeight > 0)) return distance;
    if (!this.nodeIsWorkable(node)) return Number.POSITIVE_INFINITY;
    return distance + this.nodeThreatAt(node) * this.threatNodeWeight;
  }

  /**
   * 逃跑期间把"就在危险区里"的那个任务放掉。
   *
   * 不放掉的话：威胁一散它就照原路走回那个节点 → 又进入危险区 → 再次逃跑，
   * 玩家看到的就是"跑一段又回头又接着跑"。任务放掉之后它会被派到**安全**的节点
   * （`nodeIsWorkable` 的过滤保证），循环自然断掉。
   *
   * 只放掉"确实在危险区里"的任务：只是路过威胁、节点本身安全的话，
   * 保留任务才能让它在威胁散掉后接着干，不必重新排队。
   */
  releaseTaskInDanger(record) {
    const node = record?.task?.node;
    if (!node) return false;
    if (this.nodeIsWorkable(node)) return false;
    this.clearTask(record);
    return true;
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
    const filter = this.baseStorageFilter();
    const pack = this.refreshPack(record);
    for (let i = 0; i < pack.itemIds.length; i += 1) {
      const itemId = pack.itemIds[i];
      if (!itemStacksByMerging(itemId)) continue;
      if (filter && !chestAcceptsItem(filter, itemId)) continue;
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
    const record = this.recordFor(unitOrId);
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
    const toolEnd = workerCargoSlotStart();
    record.inventory.slots.forEach((slot, index) => {
      if (!slot) return;
      if (index < toolEnd) {
        const tool = ITEM_DEFINITIONS[slot.itemId]?.tool;
        if (tool) {
          if (!pack.toolSet.has(tool)) pack.toolSet.add(tool);
          if (!pack.toolIds.includes(tool)) pack.toolIds.push(tool);
        }
        return;
      }
      pack.totalCount += slot.count ?? 0;
      if (!pack.itemIds.includes(slot.itemId)) pack.itemIds.push(slot.itemId);
      if (itemStacksByMerging(slot.itemId)) {
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

function buildingPoint(unit) {
  return { x: unit?.position?.x ?? 0, z: unit?.position?.z ?? 0 };
}

function errandCarried(record, errand) {
  if (!errand?.itemId || !record?.inventory) return false;
  return countOfInWorkerCargo(record.inventory, errand.itemId) > 0;
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
  view.inventoryUsed = workerCargoUsedSlots(record.inventory);
  view.inventoryCapacity = workerCargoSlotCount(record.inventory);
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
  // **必须一起清掉"停机位"。**
  //
  // `applyMove` 里的可采集节点要站在障碍外缘，而那个落点是**只算一次**的
  // （`approachKind !== goalKind` 才重算，避免落点跟着傀儡漂移）。
  // 而 `resetMoveGoal` 以前只清 goalKind、不清 approachKind，于是"换一个资源点"
  // 之后 condition 依然是 `'node' === 'node'`，落点还是**上一棵树**的停机位：
  // 傀儡一路走到旧点、站在那儿不动，工人状态却一直显示"前往资源点"。
  // 实测复现：把傀儡放到基地 34m 外再派一棵 5.8m 外的树，它朝反方向走到
  // 17m 外的旧落点后原地卡死（progress 永远 0）。
  record.move.approachKind = null;
  record.move.approachX = undefined;
  record.move.approachZ = undefined;
}

function distance2D(ax, az, bx, bz) {
  return Math.hypot((ax ?? 0) - (bx ?? 0), (az ?? 0) - (bz ?? 0));
}
