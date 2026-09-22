// 需要魔力的功能设施的运行时（目前是箭塔与食堂）。
//
// 它做的事很少，但每一件都必要：
//   1. 把设施登记成**供能接收者**，给上 manaCapacity 与干活时的 drainPerSecond；
//   2. 每帧按 `facilityPowerState` 判定开停，把结果写到 `unit.poweredDown`；
//   3. 消耗方（箭塔的射击、食堂的治疗）读 `unit.poweredDown` 决定要不要干活。
//
// **只在海岛生存关生效**：另外四关的箭塔/食堂来自卡牌，那里没有供能网络，
// 强行要求魔力会把已经验收过的老玩法直接改坏。判定走 `game.isSurvivalLevel()`，
// 和刷怪点、掉落、生产链是同一道门。
import {
  facilityConfigForUnitType,
  facilityPowerState,
  normalizeFacilityConfig
} from './facilities.js';

export class FacilitySystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = options.rules ?? {};
    /** @type {Map<number, object>} unitId → { unit, config, poweredDown, reason } */
    this.facilities = new Map();
    this.stats = { registered: 0, brownouts: 0, upTicks: 0, downTicks: 0 };
  }

  /** 这一关是否套用"设施要魔力"的规则。 */
  rulesActive() {
    const game = this.game;
    if (!game) return false;
    if (typeof game.isSurvivalLevel === 'function') return game.isSurvivalLevel() === true;
    // 没有这个方法（老测试替身）时退回"有供能系统就启用"，避免静默不生效
    return Boolean(game.power);
  }

  registerFacility(unit, { config = null } = {}) {
    if (!unit?.id) return null;
    const resolved = normalizeFacilityConfig(config) ?? facilityConfigForUnitType(unit.type);
    if (!resolved) return null;
    if (!this.rulesActive()) return null;
    unit.kind = 'building';
    unit.manaCapacity = resolved.manaCapacity;
    unit.activityMana = resolved.manaCapacity;
    unit.drainPerSecond = resolved.drainPerSecond;
    unit.poweredDown = false;
    this.game?.power?.registerReceiver?.(unit, {
      positionOf: () => ({ x: unit.position?.x ?? 0, z: unit.position?.z ?? 0 })
    });
    const record = {
      unit,
      config: resolved,
      poweredDown: false,
      reason: 'powered'
    };
    this.facilities.set(unit.id, record);
    this.stats.registered += 1;
    return record;
  }

  unregisterFacility(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    const record = this.facilities.get(unitId);
    if (!record) return false;
    this.facilities.delete(unitId);
    this.game?.power?.unregisterReceiver?.(unitId);
    return true;
  }

  statusOf(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    const record = this.facilities.get(unitId);
    if (!record) return null;
    return {
      unitId: record.unit.id,
      configId: record.config.id,
      poweredDown: record.poweredDown,
      reason: record.reason,
      activityMana: Math.round((record.unit.activityMana ?? 0) * 100) / 100,
      manaCapacity: record.config.manaCapacity,
      drainPerSecond: record.unit.drainPerSecond ?? 0
    };
  }

  update(dt) {
    void dt;
    if (!this.facilities.size) return;
    this.facilities.forEach((record, unitId) => {
      const unit = record.unit;
      if (!unit?.alive) {
        this.unregisterFacility(unitId);
        return;
      }
      const state = facilityPowerState({
        mana: unit.activityMana ?? 0,
        capacity: record.config.manaCapacity,
        restartRatio: record.config.restartRatio,
        wasDown: record.poweredDown === true,
        drainPerSecond: record.config.drainPerSecond
      });
      if (state.poweredDown && !record.poweredDown) this.stats.brownouts += 1;
      record.poweredDown = state.poweredDown;
      record.reason = state.reason;
      // 两个字段都要写：poweredDown 给消耗方读，drainPerSecond 给供能系统扣
      unit.poweredDown = state.poweredDown;
      unit.drainPerSecond = state.drainPerSecond;
      if (state.poweredDown) this.stats.downTicks += 1;
      else this.stats.upTicks += 1;
    });
  }

  serialize() {
    return [...this.facilities.values()].map((record) => ({
      unitId: record.unit.id,
      configId: record.config.id,
      poweredDown: record.poweredDown === true
    }));
  }
}
