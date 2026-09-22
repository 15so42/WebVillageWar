// 燃料供能设施的运行时（目前是魔力炉）。
//
// 它同时是两件事：
//   1. 一个**供能源**：注册进 PowerSystem，按半径给周围的生产与战斗补魔力；
//   2. 一个**消费者**：烧基地库存里的木炭换供能时间。
//
// 三条规则：
//   - 有燃料才供能：燃料见底时 `supplyPerSecond` 直接设成 0，
//     绝不能出现"没燃料还在白送电"；
//   - 烧燃料是整笔原子的：先确认够、再扣，扣不动就不算这一周期；
//   - 进度与生产设施一样保留：燃料接上之后接着烧，不从头再来。
//
// 更新顺序：必须在 `power.update` **之前**跑，否则这一段分配用的还是上一帧的功率。
import {
  advanceFuelBurn,
  fuelPowerConfigForUnitType,
  normalizeFuelPowerConfig
} from './fuelPower.js';

export class FuelPowerSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = options.rules ?? {};
    /** @type {Map<number, object>} unitId → { unit, config, progress, burned, active, reason, supplierId } */
    this.burners = new Map();
    this.stats = { registered: 0, cycles: 0, fuelBurned: 0, stalledTicks: 0 };
  }

  registerBurner(unit, { config = null } = {}) {
    if (!unit?.id) return null;
    const resolved = normalizeFuelPowerConfig(config) ?? fuelPowerConfigForUnitType(unit.type);
    if (!resolved) return null;
    const supplierId = `fuel-power:${unit.id}`;
    const supplier = this.game?.power?.registerSupplier?.({
      id: supplierId,
      kind: 'manaFurnace',
      x: unit.position?.x ?? 0,
      z: unit.position?.z ?? 0,
      supplyPerSecond: 0,
      supplyRadius: resolved.supplyRadius
    }) ?? null;
    const record = {
      unit,
      config: resolved,
      progress: 0,
      burned: 0,
      active: false,
      reason: 'no_fuel',
      supplierId,
      supplier
    };
    this.burners.set(unit.id, record);
    this.stats.registered += 1;
    return record;
  }

  unregisterBurner(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    const record = this.burners.get(unitId);
    if (!record) return false;
    this.burners.delete(unitId);
    this.game?.power?.unregisterSupplier?.(record.supplierId);
    return true;
  }

  statusOf(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    const record = this.burners.get(unitId);
    if (!record) return null;
    return {
      unitId: record.unit.id,
      configId: record.config.id,
      progress: record.progress,
      cycleSeconds: record.config.cycleSeconds,
      active: record.active,
      reason: record.reason,
      supplyPerSecond: record.supplier?.supplyPerSecond ?? 0,
      supplyRadius: record.config.supplyRadius,
      fuelItemId: record.config.fuelItemId
    };
  }

  update(dt) {
    if (!this.burners.size) return;
    const inventory = this.game?.baseInventory ?? null;
    this.burners.forEach((record, unitId) => {
      const unit = record.unit;
      if (!unit?.alive) {
        this.unregisterBurner(unitId);
        return;
      }
      this.tickBurner(record, inventory, dt);
    });
  }

  tickBurner(record, inventory, dt) {
    const { config, supplier } = record;
    if (!inventory) {
      record.active = false;
      record.reason = 'no_inventory';
      if (supplier) supplier.supplyPerSecond = 0;
      return;
    }
    const step = advanceFuelBurn({
      progress: record.progress,
      dt,
      config,
      countOf: (itemId) => inventory.countOf(itemId)
    });

    if (step.burned > 0) {
      const removed = inventory.remove(config.fuelItemId, step.burned);
      if (removed.ok) {
        record.progress = step.progress;
        this.stats.cycles += step.burned / config.fuelPerCycle;
        this.stats.fuelBurned += step.burned;
      } else {
        // 理论上前面的 fuelCyclesAvailable 已经确认够烧；真到了这里就不推进进度，
        // 也不能扣出半份燃料。
        record.active = false;
        record.reason = 'no_fuel';
        if (supplier) supplier.supplyPerSecond = 0;
        this.stats.stalledTicks += 1;
        return;
      }
    } else {
      record.progress = step.progress;
    }

    record.active = step.active;
    record.reason = step.reason;
    record.burned = step.burned;
    // 供能源的功率跟着燃料走：没燃料就是 0，PowerSystem 这一段就分不出魔力
    if (supplier) supplier.supplyPerSecond = step.supplyPerSecond;
    if (!step.active) this.stats.stalledTicks += 1;
  }

  serialize() {
    return [...this.burners.values()].map((record) => ({
      unitId: record.unit.id,
      configId: record.config.id,
      progress: record.progress
    }));
  }
}
