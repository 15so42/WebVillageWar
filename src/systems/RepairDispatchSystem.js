// 建筑脱战维修的运行时：请求登记、脱离交战判定、分派预留与实际修复结算。
//
// 职责边界（设计文档第二节）：
//   - 登记：只对**玩家已建成、存活**的建筑，且生命/结构耐久低于上限；
//   - 脱战：最后受伤或发起攻击满 8 秒才派活；交战中保留请求但不执行；
//   - 唯一性：按 building id 管理一份请求，重复受伤只更新；
//   - 预留：每栋建筑同时只有 maxWorkersFor 名傀儡（基地/魔力炉可 2 名），
//     多个傀儡不会各扣一次材料修同一份缺口；
//   - 结算：一批修复吃掉真实材料，换成有限修复额度（见 buildingRepair.js）。
//
// 频率：0.5 秒一次有限采样（`sampleSeconds`），不做每帧全量扫描；
// 威胁检查复用 `buildings` 集合 + 交战时间戳，不对每栋建筑每帧扫全部敌人。
import {
  REPAIR_REQUEST_STATE,
  REPAIR_STATE_LABELS,
  buildingRepairRules,
  buildingRepairStatus,
  pickRepairRequest,
  repairBatchPlan,
  repairMaterialFor,
  repairPriorityScore
} from './buildingRepair.js';

export const REPAIR_ERROR = {
  none: 'none',
  no_material: 'no_material',
  no_building: 'no_building',
  in_combat: 'in_combat',
  satisfied: 'satisfied',
  reserved: 'reserved'
};

export class RepairDispatchSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = buildingRepairRules(options.rules ?? {});
    /** @type {Map<number, object>} buildingId → request */
    this.requests = new Map();
    this.sampleTimer = 0;
    this.stats = {
      registered: 0,
      satisfied: 0,
      batches: 0,
      materialsSpent: 0,
      healthRestored: 0,
      durabilityRestored: 0,
      materialStalls: 0,
      combatBlocks: 0
    };
  }

  /** 玩家可关闭自动维修（设计文档要求留出主动安排劳动的空间）。 */
  get enabled() {
    return this.game?.autoBuildingRepair !== false;
  }

  /** 建筑自己记交战时间；这里只读。 */
  lastCombatAt(unit) {
    const value = Number(unit?.lastCombatAt);
    return Number.isFinite(value) ? value : null;
  }

  inCombatWindow(unit, now = this.game?.elapsedTime ?? 0) {
    const stamp = this.lastCombatAt(unit);
    if (stamp === null) return false;
    return (now - stamp) < this.rules.outOfCombatSeconds;
  }

  #snapshotRequest(unit, now) {
    const status = buildingRepairStatus(unit, this.rules);
    if (!status) return null;
    return {
      id: unit.id,
      unit,
      status,
      createdAt: now,
      updatedAt: now,
      state: this.inCombatWindow(unit, now)
        ? REPAIR_REQUEST_STATE.pending
        : REPAIR_REQUEST_STATE.waiting,
      reservedWorkers: new Set(),
      lastMaterial: status.material,
      lastReason: 'none'
    };
  }

  /**
   * 登记或更新一栋建筑的缺口。
   * 返回请求对象；不需要维修时返回 `null` **并清掉已有请求**。
   */
  register(unit) {
    if (!unit?.id) return null;
    const now = this.game?.elapsedTime ?? 0;
    const fresh = this.#snapshotRequest(unit, now);
    if (!fresh) {
      this.requests.delete(unit.id);
      return null;
    }
    const existing = this.requests.get(unit.id);
    if (existing) {
      // 已有请求：只更新缺口，**重建时间保持不动**（那是"等了多久"的依据）
      existing.status = fresh.status;
      existing.updatedAt = now;
      if (existing.state === REPAIR_REQUEST_STATE.satisfied) existing.state = REPAIR_REQUEST_STATE.waiting;
      return existing;
    }
    this.requests.set(unit.id, fresh);
    this.stats.registered += 1;
    return fresh;
  }

  /**
   * 有限频率采样。威胁成本很低：只读建筑自己的 `lastCombatAt`。
   */
  update(dt = 0) {
    const step = Math.max(0, Number(dt) || 0);
    this.sampleTimer -= step;
    if (this.sampleTimer > 0) return;
    this.sampleTimer = Math.max(0.2, Number(this.rules.sampleSeconds) || 0.5);
    this.sample();
  }

  sample() {
    const now = this.game?.elapsedTime ?? 0;
    const buildings = this.game?.buildings?.buildings ?? null;
    if (!buildings) return;
    // 先清掉已经不在集合里的（死亡/重开/销毁）
    this.requests.forEach((request, buildingId) => {
      const unit = request.unit;
      if (!unit || unit.alive === false || !buildings.has(unit)) {
        this.requests.delete(buildingId);
      }
    });
    if (!this.enabled) return;
    buildings.forEach((unit) => {
      if (!unit?.isBuilding) return;
      if (unit.team && this.game?.localPlayerSlot && unit.team !== 'player') return;
      // 中立/敌方建筑不登记
      if (unit.team === 'enemy') return;
      // 刷怪巢穴这类目标不该被玩家"维修"
      if (unit.definition?.repairable === false) return;
      this.register(unit);
    });
  }

  requestFor(buildingId) {
    if (buildingId === null || buildingId === undefined) return null;
    const request = this.requests.get(buildingId);
    if (!request) return null;
    if (request.unit?.alive === false) {
      this.requests.delete(buildingId);
      return null;
    }
    return request;
  }

  /**
   * 材料恢复供给后，"待材料"的请求必须能重新排队。
   *
   * 这条以前是缺的：请求一旦落到 `missing_material`，`availableRequests()` 会
   * 一直跳过它，`register()` 也不会把它改回 `waiting`——于是补给补回来了、
   * 傀儡也闲着，那栋建筑却永远停在"缺材料"，只能靠重开消掉。
   * 设计文档的口径是"材料不足时保留请求为待材料，允许傀儡转做其它任务"，
   * "恢复供给后可继续"，所以这里每次派活前重查一次可达材料。
   *
   * 检查范围刻意只有两处，避免把"待材料"变成每帧全量扫库存：
   *   1. 基地库存里有没有这种材料（维修的主要来源）；
   *   2. 当前这名傀儡身上有没有（从别处背回来的那份）。
   */
  canRestockRepair(request, worker = null) {
    const material = request?.status?.material ?? repairMaterialFor(request?.unit?.type);
    if (!material) return false;
    if ((this.game?.baseInventory?.countOf?.(material) ?? 0) > 0) return true;
    if (!worker) return false;
    const carry = this.game?.work?.inventoryFor?.(worker) ?? null;
    return (carry?.countOf?.(material) ?? 0) > 0;
  }

  /**
   * 当前可派活的请求（脱战、还没满员、还有缺口）。
   * `worker` 可选：传了就能把"刚从别处背回材料"的待材料请求一起放回队列。
   */
  availableRequests(worker = null) {
    const now = this.game?.elapsedTime ?? 0;
    const list = [];
    this.requests.forEach((request) => {
      const unit = request.unit;
      if (!unit || unit.alive === false) return;
      if (this.inCombatWindow(unit, now)) {
        request.state = REPAIR_REQUEST_STATE.pending;
        this.stats.combatBlocks += 1;
        return;
      }
      const status = buildingRepairStatus(unit, this.rules);
      if (!status) {
        request.state = REPAIR_REQUEST_STATE.satisfied;
        return;
      }
      request.status = status;
      const reserved = request.reservedWorkers.size;
      if (reserved >= Math.max(1, status.maxWorkers ?? 1)) {
        request.state = REPAIR_REQUEST_STATE.assigned;
        return;
      }
      // 缺料状态：不是"不可维修"，而是"这一轮先别派"。
      // 设计文档要求材料不足时保留请求为"待材料"，同时**允许傀儡转做其它任务**，
      // 不能反复取不存在的材料、也不能锁住全部工人。
      // 但补给一旦回来就要放行，否则请求会永久卡在"缺材料"。
      if (request.state === REPAIR_REQUEST_STATE.missingMaterial) {
        if (!this.canRestockRepair(request, worker)) return;
        request.state = REPAIR_REQUEST_STATE.waiting;
        request.lastReason = 'none';
      }
      if (request.state !== REPAIR_REQUEST_STATE.assigned) {
        request.state = reserved > 0 ? REPAIR_REQUEST_STATE.assigned : REPAIR_REQUEST_STATE.waiting;
      }
      list.push(request);
    });
    return list;
  }

  /** 给某个空闲傀儡挑一条维修请求。挑不到返回 null（它该去干别的）。 */
  pickFor(worker) {
    if (!this.enabled) return null;
    const requests = this.availableRequests(worker);
    if (!requests.length) return null;
    return pickRepairRequest(requests, {
      unitX: worker?.position?.x ?? 0,
      unitZ: worker?.position?.z ?? 0,
      now: this.game?.elapsedTime ?? 0,
      reservedCounts: null,
      rules: this.rules
    });
  }

  priorityScoreFor(request, unit) {
    return repairPriorityScore(request, {
      unitX: unit?.position?.x ?? 0,
      unitZ: unit?.position?.z ?? 0,
      now: this.game?.elapsedTime ?? 0,
      rules: this.rules
    });
  }

  /** 预定一名傀儡。达到 maxWorkersFor 时返回 false（不重复预留）。 */
  reserve(requestOrId, workerId) {
    const request = typeof requestOrId === 'object' ? requestOrId : this.requestFor(requestOrId);
    if (!request || workerId === null || workerId === undefined) return false;
    const allowed = Math.max(1, request.status?.maxWorkers ?? 1);
    if (request.reservedWorkers.has(workerId)) return true;
    if (request.reservedWorkers.size >= allowed) return false;
    request.reservedWorkers.add(workerId);
    request.state = REPAIR_REQUEST_STATE.assigned;
    return true;
  }

  release(requestOrId, workerId = null) {
    const request = typeof requestOrId === 'object' ? requestOrId : this.requestFor(requestOrId);
    if (!request) return false;
    if (workerId === null || workerId === undefined) request.reservedWorkers.clear();
    else request.reservedWorkers.delete(workerId);
    if (request.reservedWorkers.size <= 0) {
      request.reservedWorkers.clear();
      if (request.state === REPAIR_REQUEST_STATE.assigned) request.state = REPAIR_REQUEST_STATE.waiting;
    }
    return true;
  }

  /** 所有请求上这名傀儡的预留（换目标、被取消、单位死亡时都要清）。 */
  releaseWorkerEverywhere(workerId) {
    if (workerId === null || workerId === undefined) return 0;
    let released = 0;
    this.requests.forEach((request) => {
      if (request.reservedWorkers.delete(workerId)) released += 1;
      if (request.reservedWorkers.size <= 0 && request.state === REPAIR_REQUEST_STATE.assigned) {
        request.state = REPAIR_REQUEST_STATE.waiting;
      }
    });
    return released;
  }

  /**
   * 一个傀儡要为这栋建筑取哪种材料、从哪取。
   *
   * 顺序：**自己的背包 → 基地库存**。基地库存只在建筑就在基地旁可达时才用，
   * 所以「前线建筑从远处基地隔空取料」不会发生——它必须先回去把料背上。
   * 这是"材料实际从可达库存或背包取用"的落地方式。
   */
  resolveRepairMaterial(worker, request) {
    const material = request?.status?.material ?? repairMaterialFor(request?.unit?.type);
    if (!worker || !material) return { ok: false, reason: REPAIR_ERROR.no_material, material };
    const carry = this.game?.work?.inventoryFor?.(worker) ?? null;
    if ((carry?.countOf?.(material) ?? 0) > 0) {
      return { ok: true, material, source: 'carry' };
    }
    const baseInventory = this.game?.baseInventory ?? null;
    if (!baseInventory) return { ok: false, reason: REPAIR_ERROR.no_material, material };
    if ((baseInventory.countOf?.(material) ?? 0) <= 0) {
      request.lastReason = REPAIR_ERROR.no_material;
      request.lastMaterial = material;
      request.state = REPAIR_REQUEST_STATE.missingMaterial;
      this.stats.materialStalls += 1;
      return { ok: false, reason: REPAIR_ERROR.no_material, material };
    }
    // 从基地库存领一份带到身上：傀儡真的会背着它走过去。
    const taken = baseInventory.remove?.(material, 1);
    if (!taken?.ok) return { ok: false, reason: REPAIR_ERROR.no_material, material };
    const added = carry?.add?.(material, 1) ?? { ok: false };
    if (!added.ok) {
      // 背包放不下就原样还回基地，不让材料凭空消失
      baseInventory.add?.(material, 1);
      return { ok: false, reason: REPAIR_ERROR.no_material, material };
    }
    this.game?.backpack?.markDirty?.();
    return { ok: true, material, source: 'base' };
  }

  /**
   * 在建筑旁打一批维修。材料从傀儡背包扣除，换成有限的修复额度。
   * 返回 `{ ok, materials, material, health, durability, reason }`。
   */
  applyRepairBatch(worker, request) {
    if (!worker || !request) return { ok: false, reason: REPAIR_ERROR.no_building };
    const unit = request.unit;
    if (!unit || unit.alive === false) {
      this.release(request, worker.id);
      return { ok: false, reason: REPAIR_ERROR.no_building };
    }
    if (this.inCombatWindow(unit)) {
      request.state = REPAIR_REQUEST_STATE.pending;
      return { ok: false, reason: REPAIR_ERROR.in_combat };
    }
    const status = buildingRepairStatus(unit, this.rules);
    if (!status) {
      request.state = REPAIR_REQUEST_STATE.satisfied;
      this.stats.satisfied += 1;
      this.release(request, worker.id);
      return { ok: false, reason: REPAIR_ERROR.satisfied };
    }
    const material = status.material;
    const carry = this.game?.work?.inventoryFor?.(worker) ?? null;
    const available = carry?.countOf?.(material) ?? 0;
    const plan = repairBatchPlan(status, { rules: this.rules, available });
    if (plan.materials <= 0 || plan.health + plan.durability <= 0) {
      request.lastReason = REPAIR_ERROR.no_material;
      request.state = REPAIR_REQUEST_STATE.missingMaterial;
      this.stats.materialStalls += 1;
      return { ok: false, reason: REPAIR_ERROR.no_material, material };
    }
    const spent = carry?.remove?.(material, plan.materials) ?? { ok: false };
    if (!spent.ok) {
      request.lastReason = REPAIR_ERROR.no_material;
      request.state = REPAIR_REQUEST_STATE.missingMaterial;
      return { ok: false, reason: REPAIR_ERROR.no_material, material };
    }
    // 结构耐久与生命分别恢复；生命是"建筑被打坏"，耐久是"结构磨损"。
    const healedHealth = plan.health > 0 ? unit.restoreHealth(plan.health) : 0;
    const healedDurability = plan.durability > 0 && unit.restoreDurability
      ? unit.restoreDurability(plan.durability)
      : 0;
    this.game?.syncEquippedWeaponDurabilityToBag?.(unit);
    this.stats.batches += 1;
    this.stats.materialsSpent += plan.materials;
    this.stats.healthRestored += healedHealth;
    this.stats.durabilityRestored += healedDurability;
    // `freshStatus` 为 null 表示这栋建筑已经修满：此时必须**清掉请求**，
    // 而不是把旧的缺口快照再挂回去（`?? status` 会把 null 当成"没取到值"）。
    // 以前这里写的是 `?? status`，结果是：修满之后请求还留着、
    // 预留也不释放，建筑会永远显示"傀儡维修中"。
    const freshStatus = buildingRepairStatus(unit, this.rules);
    request.status = freshStatus;
    request.lastReason = 'none';
    request.lastMaterial = material;
    this.game?.effects?.spawnRing?.(unit.position, '#9dd8ff', Math.min(1.6, 0.6 + plan.materials * 0.2), 0.42);
    this.game?.effects?.spawnStructureDust?.(unit.position, 1.1, '#cbbfa8');
    this.game?.baseStorage?.markDirty?.();
    this.game?.hotbar?.refresh?.();
    if (!request.status) {
      request.state = REPAIR_REQUEST_STATE.satisfied;
      this.stats.satisfied += 1;
      this.release(request, worker.id);
      // 修满即从请求池里移除：留着一个空请求只会让它每 0.5 秒被重新扫到。
      this.requests.delete(request.id);
    }
    return {
      ok: true,
      materials: plan.materials,
      material,
      health: healedHealth,
      durability: healedDurability,
      reason: 'none'
    };
  }

  /**
   * 是否还有"关键建筑急修"没处理：白天目标提示只给最紧要的一到两项，
   * 这个查询就是那一项的判据。
   */
  urgentRequest(now = this.game?.elapsedTime ?? 0) {
    let best = null;
    this.requests.forEach((request) => {
      const unit = request.unit;
      if (!unit || unit.alive === false) return;
      if (this.inCombatWindow(unit, now)) return;
      const status = request.status ?? buildingRepairStatus(unit, this.rules);
      if (!status?.urgent) return;
      const score = status.importance * 100 - status.damageRatio * 30;
      if (!best || score < best.score) best = { request, score, status };
    });
    return best?.request ?? null;
  }

  summary() {
    const now = this.game?.elapsedTime ?? 0;
    const counts = {};
    let waiting = 0;
    let urgent = 0;
    let missing = 0;
    this.requests.forEach((request) => {
      const unit = request.unit;
      const status = request.status ?? (unit ? buildingRepairStatus(unit, this.rules) : null);
      if (!status) return;
      const inCombat = this.inCombatWindow(unit, now);
      // 「缺材料」是**已经结算过、确实取不到料**的状态（见 resolveRepairMaterial /
      // applyRepairBatch），不能被这里重新推导成 waiting——否则界面永远看不到
      // "缺材料"，玩家只会觉得工人闲着不干活。其余状态才按当前实际情况推导。
      const state = inCombat ? REPAIR_REQUEST_STATE.pending
        : (request.state === REPAIR_REQUEST_STATE.missingMaterial
          ? REPAIR_REQUEST_STATE.missingMaterial
          : (request.reservedWorkers.size > 0 ? REPAIR_REQUEST_STATE.assigned : REPAIR_REQUEST_STATE.waiting));
      request.state = state;
      counts[state] = (counts[state] ?? 0) + 1;
      if (state === REPAIR_REQUEST_STATE.waiting) waiting += 1;
      if (state === REPAIR_REQUEST_STATE.missingMaterial) missing += 1;
      if (status.urgent) urgent += 1;
    });
    return {
      enabled: this.enabled,
      requests: this.requests.size,
      waiting,
      urgent,
      missingMaterial: missing,
      byState: counts,
      labels: REPAIR_STATE_LABELS,
      stats: { ...this.stats }
    };
  }

  serialize() {
    return [...this.requests.values()].map((request) => ({
      buildingId: request.id,
      state: request.state,
      createdAt: request.createdAt,
      material: request.status?.material ?? null
    }));
  }

  /** 重新开始 / 快照加载：清干净，不留半个预留。 */
  reset() {
    this.requests.clear();
    this.sampleTimer = 0;
    return true;
  }
}
