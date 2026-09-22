// 供能系统的状态归属方。
//
// 模型（对应计划第 3 节的建议供能模型）：
//   1. 接收者用自己的储备干活：每段先从自身 activityMana 里扣掉行为消耗。
//   2. 供能源只负责「往储备里补」：本段的供应总量受 supplyPerSecond × dt 限制。
//   3. 离开供能半径不会禁止行动，只是不再补魔，储备耗尽后自然干不动。
//
// 因此「供需余量」就是这一段补进去多少、扣掉多少：供给充足时储备回满，
// 供给不足时储备下降，储备见底才真正停机。
//
// 与旧符文资源的边界：这里只认 activityMana / activityManaCapacity，
// 绝不碰符文石上的 mana 字段。
import { POWER_RULES } from '../data/gameData.js';
import {
  POWER_STRATEGY,
  allocatePower,
  powerDistance,
  powerNeedRatio,
  powerReturnReserve,
  powerSupplierBudget
} from './power.js';

export const POWER_STATE = {
  powered: 'powered',
  recharging: 'recharging',
  low: 'low',
  starved: 'starved',
  outOfRange: 'out_of_range'
};

export class PowerSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = { ...POWER_RULES, ...(options.rules ?? {}) };
    this.strategy = options.strategy ?? POWER_STRATEGY.nearestFirst;
    this.suppliers = new Map();
    this.receivers = new Map();
    this.stats = { ticks: 0, consumed: 0, supplied: 0, shortfall: 0, starvedTicks: 0 };
    this.lastReport = null;
  }

  // ------------------------------------------------------------------ 供能源
  registerSupplier({ id, kind = 'base', x = 0, z = 0, supplyPerSecond = null, supplyRadius = null, manaStored = null } = {}) {
    if (!id) return null;
    const supplier = {
      id,
      kind,
      x,
      z,
      supplyPerSecond: supplyPerSecond ?? this.rules.baseSupplyPerSecond,
      supplyRadius: supplyRadius ?? this.rules.baseSupplyRadius,
      manaStored
    };
    this.suppliers.set(id, supplier);
    return supplier;
  }

  updateSupplierPosition(id, x, z) {
    const supplier = this.suppliers.get(id);
    if (!supplier) return false;
    supplier.x = x;
    supplier.z = z;
    return true;
  }

  unregisterSupplier(id) {
    return this.suppliers.delete(id);
  }

  supplierList() {
    return [...this.suppliers.values()];
  }

  totalSupplyPerSecond() {
    return this.supplierList().reduce((sum, supplier) => sum + Math.max(0, supplier.supplyPerSecond), 0);
  }

  // ------------------------------------------------------------------ 接收者
  // demandFor(dt) 由接收者自己决定这一段想要补多少：
  //   有储备的（傀儡、带缓冲的设施）＝ 容量缺口，且不超过最大充能速率；
  //   没储备的（直接耗能的设施）＝ 本段消耗，必须被覆盖才起作用。
  registerReceiver(receiver, { demandFor = null, onGranted = null, onConsumed = null, positionOf = null } = {}) {
    if (!receiver?.id) return null;
    const entry = {
      receiver,
      demandFor: demandFor ?? ((dt) => this.defaultDemandFor(receiver, dt)),
      onGranted,
      onConsumed,
      positionOf: positionOf ?? (() => ({ x: receiver.x ?? 0, z: receiver.z ?? 0 }))
    };
    this.receivers.set(receiver.id, entry);
    return entry;
  }

  unregisterReceiver(id) {
    return this.receivers.delete(id);
  }

  receiverList() {
    return [...this.receivers.values()].map((entry) => entry.receiver);
  }

  defaultDemandFor(receiver, dt) {
    const capacity = Math.max(0, receiver.manaCapacity ?? 0);
    const stored = Math.max(0, Math.min(capacity, receiver.activityMana ?? 0));
    const drain = Math.max(0, receiver.drainPerSecond ?? 0) * Math.max(0, dt);
    if (capacity <= 0) return drain;
    const rechargeCap = this.rules.maxRechargePerSecond * Math.max(0, dt);
    return Math.min(capacity - stored, rechargeCap);
  }

  // ------------------------------------------------------------- 位置与查询
  nearestSupplier(x, z, { radiusLimit = null } = {}) {
    let best = null;
    this.supplierList().forEach((supplier) => {
      const distance = powerDistance({ x, z }, supplier);
      if (radiusLimit !== null && distance > radiusLimit) return;
      if (!best || distance < best.distance) best = { supplier, distance };
    });
    return best;
  }

  receiverState(receiver) {
    const position = { x: receiver.x ?? 0, z: receiver.z ?? 0 };
    const capacity = Math.max(0, receiver.manaCapacity ?? 0);
    const stored = Math.max(0, Math.min(capacity, receiver.activityMana ?? 0));
    const nearest = this.nearestSupplier(position.x, position.z);
    const inRange = Boolean(nearest && nearest.distance <= nearest.supplier.supplyRadius);
    if (capacity > 0 && stored <= 0) return POWER_STATE.starved;
    if (capacity > 0 && stored / capacity <= this.rules.lowManaRatio) return POWER_STATE.low;
    if (!inRange) return POWER_STATE.outOfRange;
    if (capacity > 0 && stored < capacity) return POWER_STATE.recharging;
    return POWER_STATE.powered;
  }

  // 回到最近供能源所需的最低储备。用于「低魔力主动返程」的提示，不是行动禁令。
  returnReserveFor(receiver, { moveSpeed = 4, extraSeconds = null } = {}) {
    const position = { x: receiver.x ?? 0, z: receiver.z ?? 0 };
    const nearest = this.nearestSupplier(position.x, position.z);
    if (!nearest) return 0;
    return powerReturnReserve({
      drainPerSecond: receiver.drainPerSecond ?? this.rules.workerDrainMove,
      distance: nearest.distance,
      moveSpeed,
      extraSeconds: extraSeconds ?? this.rules.returnExtraSeconds
    });
  }

  // ------------------------------------------------------------------- 每帧
  // 与其它系统一致的入口名
  update(dt) {
    return this.tick(dt);
  }

  tick(dt) {
    const step = Math.max(0, dt);
    if (step <= 0) return this.lastReport;
    const entries = [...this.receivers.values()];
    const report = {
      dt: step,
      consumers: [],
      consumed: 0,
      supplied: 0,
      capacity: 0,
      demand: 0,
      surplus: 0,
      starved: []
    };
    if (!entries.length && !this.suppliers.size) {
      this.lastReport = report;
      return report;
    }

    // 1) 先用自己的储备支付行为消耗——供给不足时储备自然会掉下去
    const demands = [];
    entries.forEach((entry) => {
      const receiver = entry.receiver;
      const receiverCapacity = Math.max(0, receiver.manaCapacity ?? 0);
      const drain = Math.max(0, receiver.drainPerSecond ?? 0) * step;
      const before = Math.max(
        0,
        Math.min(receiverCapacity > 0 ? receiverCapacity : Infinity, receiver.activityMana ?? 0)
      );
      const paid = Math.min(before, drain);
      const shortfall = drain - paid;
      if (receiverCapacity > 0 || drain > 0) receiver.activityMana = before - paid;
      report.consumed += paid;
      if (shortfall > 0) report.starved.push(receiver.id);
      entry.onConsumed?.({ receiver, paid, shortfall, dt: step });

      const position = entry.positionOf() ?? { x: 0, z: 0 };
      const want = Math.max(0, entry.demandFor(step) ?? 0);
      demands.push({
        id: receiver.id,
        kind: receiver.kind ?? 'unit',
        x: position.x,
        z: position.z,
        manaCapacity: receiverCapacity,
        manaStored: receiver.activityMana ?? 0,
        priority: receiver.powerPriority ?? 0,
        demand: want
      });
    });

    // 2) 供能源按预算分配，总量不会超过 supplyPerSecond × dt
    const supplyCapacity = this.supplierList()
      .reduce((sum, supplier) => sum + powerSupplierBudget(supplier, step), 0);
    const allocation = allocatePower({
      suppliers: this.supplierList(),
      receivers: demands,
      dt: step,
      strategy: this.strategy
    });

    // 3) 把补到的魔力写回接收者
    allocation.grants.forEach((grant) => {
      const entry = this.receivers.get(grant.id);
      if (!entry || grant.granted <= 0) return;
      const receiver = entry.receiver;
      const receiverCapacity = Math.max(0, receiver.manaCapacity ?? 0);
      if (receiverCapacity > 0) {
        receiver.activityMana = Math.min(
          receiverCapacity,
          Math.max(0, receiver.activityMana ?? 0) + grant.granted
        );
      }
      entry.onGranted?.({ receiver, granted: grant.granted, dt: step });
      report.supplied += grant.granted;
      report.consumers.push({
        id: grant.id,
        kind: receiver.kind ?? 'unit',
        state: this.receiverState(receiver),
        stored: receiver.activityMana ?? 0,
        capacity: receiverCapacity,
        needRatio: powerNeedRatio(receiver)
      });
    });
    allocation.grants.forEach((grant) => {
      if (grant.granted > 0) return;
      const entry = this.receivers.get(grant.id);
      if (!entry) return;
      report.consumers.push({
        id: grant.id,
        kind: entry.receiver.kind ?? 'unit',
        state: this.receiverState(entry.receiver),
        stored: entry.receiver.activityMana ?? 0,
        capacity: Math.max(0, entry.receiver.manaCapacity ?? 0),
        needRatio: powerNeedRatio(entry.receiver)
      });
    });

    report.capacity = supplyCapacity;
    report.demand = allocation.totalDemand;
    report.surplus = Math.max(0, supplyCapacity - allocation.totalGranted);
    // 守恒断言用：任何一段的实发量都不可能超过这一段的可供量
    report.overBudget = allocation.totalGranted > supplyCapacity + 1e-9;

    this.stats.ticks += 1;
    this.stats.consumed += report.consumed;
    this.stats.supplied += report.supplied;
    this.stats.shortfall += allocation.grants.reduce((sum, grant) => sum + grant.shortfall, 0);
    this.stats.starvedTicks += report.starved.length;
    this.lastReport = report;
    return report;
  }

  snapshot() {
    return {
      suppliers: this.supplierList().map((supplier) => ({ ...supplier })),
      receivers: [...this.receivers.values()].map((entry) => ({
        id: entry.receiver.id,
        kind: entry.receiver.kind ?? 'unit',
        activityMana: entry.receiver.activityMana ?? 0,
        manaCapacity: entry.receiver.manaCapacity ?? 0,
        drainPerSecond: entry.receiver.drainPerSecond ?? 0
      })),
      stats: { ...this.stats }
    };
  }

  // 供能与供需状态的摘要，供 HUD 与验收脚本读取
  summary() {
    const receivers = [...this.receivers.values()].map((entry) => ({
      id: entry.receiver.id,
      state: this.receiverState(entry.receiver),
      stored: entry.receiver.activityMana ?? 0,
      capacity: entry.receiver.manaCapacity ?? 0
    }));
    return {
      suppliers: this.supplierList().length,
      supplyPerSecond: this.totalSupplyPerSecond(),
      receivers: receivers.length,
      states: receivers.reduce((acc, entry) => {
        acc[entry.state] = (acc[entry.state] ?? 0) + 1;
        return acc;
      }, {}),
      stats: { ...this.stats }
    };
  }
}
