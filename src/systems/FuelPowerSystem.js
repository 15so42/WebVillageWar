// 燃料供能设施的运行时（魔力炉）。
//
// 魔力炉是单格容器：运输线送入木炭，有燃料就按周期燃烧，把魔力充入炉内储备（上限与基地一致）。
// 储备 > 0 时按基地相同的 supplyPerSecond / supplyRadius 向周围放电；储备耗尽则停止供能。
// 更新顺序：必须在 `power.update` **之前**跑。
import { POWER_RULES } from '../data/gameData.js';
import {
  advanceFuelBurn,
  fuelPowerConfigForUnitType,
  normalizeFuelPowerConfig
} from './fuelPower.js';

export class FuelPowerSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = options.rules ?? {};
    /** @type {Map<number, object>} unitId → burner record */
    this.burners = new Map();
    this.stats = { registered: 0, cycles: 0, fuelBurned: 0, manaCharged: 0, stalledTicks: 0 };
  }

  registerBurner(unit, { config = null } = {}) {
    if (!unit?.id) return null;
    const resolved = normalizeFuelPowerConfig(config) ?? fuelPowerConfigForUnitType(unit.type);
    if (!resolved) return null;
    const powerRules = this.game?.power?.rules ?? POWER_RULES;
    const supplierId = `fuel-power:${unit.id}`;
    const supplier = this.game?.power?.registerSupplier?.({
      id: supplierId,
      kind: 'manaFurnace',
      x: unit.position?.x ?? 0,
      z: unit.position?.z ?? 0,
      supplyPerSecond: 0,
      supplyRadius: powerRules.baseSupplyRadius,
      manaStored: 0
    }) ?? null;
    if (supplier) {
      supplier.manaCapacity = resolved.manaCapacity ?? powerRules.baseManaCapacity ?? 100;
      supplier.manaStored = Math.max(0, Math.min(supplier.manaCapacity, supplier.manaStored ?? 0));
    }
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

  fuelInventoryFor(unit) {
    return this.game?.stations?.stationFor?.(unit)?.inventory ?? null;
  }

  statusOf(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    const record = this.burners.get(unitId);
    if (!record) return null;
    const supplier = record.supplier;
    const cap = supplier?.manaCapacity ?? record.config.manaCapacity ?? 100;
    const stored = Math.max(0, Math.min(cap, supplier?.manaStored ?? 0));
    const inv = this.fuelInventoryFor(record.unit);
    return {
      unitId: record.unit.id,
      configId: record.config.id,
      progress: record.progress,
      cycleSeconds: record.config.cycleSeconds,
      active: record.active,
      reason: record.reason,
      supplyPerSecond: supplier?.supplyPerSecond ?? 0,
      supplyRadius: supplier?.supplyRadius ?? 0,
      fuelItemId: record.config.fuelItemId,
      fuelCount: inv?.countOf?.(record.config.fuelItemId) ?? 0,
      manaStored: stored,
      manaCapacity: cap
    };
  }

  update(dt) {
    if (!this.burners.size) return;
    this.burners.forEach((record, unitId) => {
      const unit = record.unit;
      if (!unit?.alive) {
        this.unregisterBurner(unitId);
        return;
      }
      this.tickBurner(record, dt);
    });
  }

  tickBurner(record, dt) {
    const { config, supplier, unit } = record;
    const inventory = this.fuelInventoryFor(unit);
    const powerRules = this.game?.power?.rules ?? POWER_RULES;
    const pos = unit.position;
    if (pos && record.supplierId) {
      this.game?.power?.updateSupplierPosition?.(record.supplierId, pos.x, pos.z);
    }
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
      if (!removed.ok) {
        record.active = false;
        record.reason = 'no_fuel';
        if (supplier) supplier.supplyPerSecond = 0;
        this.stats.stalledTicks += 1;
        return;
      }
      record.progress = step.progress;
      this.stats.cycles += (step.cycles ?? 0);
      this.stats.fuelBurned += step.burned;
      if (supplier && step.manaGained > 0) {
        const cap = supplier.manaCapacity ?? config.manaCapacity;
        supplier.manaStored = Math.min(cap, Math.max(0, (supplier.manaStored ?? 0) + step.manaGained));
        this.stats.manaCharged += step.manaGained;
      }
      this.game?.stationPanel?.markDirty?.();
      this.game?.transportLinkPanel?.markDirty?.();
    } else {
      record.progress = step.progress;
    }

    record.active = step.active;
    record.reason = step.reason;
    record.burned = step.burned;

    const stored = supplier?.manaStored ?? 0;
    if (supplier) {
      supplier.supplyPerSecond = stored > 0 ? powerRules.baseSupplyPerSecond : 0;
    }
    if (!step.active && stored <= 0) this.stats.stalledTicks += 1;
  }

  serialize() {
    return [...this.burners.values()].map((record) => ({
      unitId: record.unit.id,
      configId: record.config.id,
      progress: record.progress,
      manaStored: record.supplier?.manaStored ?? 0
    }));
  }
}
