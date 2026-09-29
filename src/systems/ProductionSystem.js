// 生产设施的运行时（熔炉等）。
//
// 熔炉：进料格 + 产物输出格；产物只进输出格，由输出运输线运走（不自动进基地库存）。
// 无输出运输线，或输出格满且端口运不走时，停止熔炼（进度保留）。
// 工作时每秒消耗配方 drainPerSecond（熔炉默认 1），且须在供能范围内。
import { ITEM_RULES } from '../data/gameData.js';
import { itemStackLimit } from './items.js';
import {
  advanceProduction,
  consumeFurnaceFuel,
  countFurnaceFuel,
  maxCyclesForFurnace,
  normalizeProductionRecipe,
  productionRecipeForInput,
  productionRecipeForUnitType,
  productionRecipesForUnitType,
  settleFurnaceProduction
} from './production.js';

export class ProductionSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = options.rules ?? {};
    /** @type {Map<number, object>} unitId → producer record */
    this.producers = new Map();
    this.stats = { registered: 0, cycles: 0, consumed: 0, produced: 0, stalledTicks: 0 };
  }

  registerProducer(unit, { recipe = null } = {}) {
    if (!unit?.id) return null;
    const template = normalizeProductionRecipe(recipe)
      ?? productionRecipeForUnitType(unit.type);
    if (!template) return null;

    this.game?.stations?.registerBuilding?.(unit);

    const record = {
      unit,
      template,
      baseRecipes: productionRecipesForUnitType(unit.type),
      recipe: null,
      progress: 0,
      cycles: 0,
      stalled: true,
      reason: 'no_input'
    };
    this.producers.set(unit.id, record);
    unit.kind = 'building';
    unit.baseManaCapacity = template.manaCapacity;
    unit.manaCapacity = template.manaCapacity;
    if (!Number.isFinite(unit.activityMana)) unit.activityMana = template.manaCapacity;
    unit.activityMana = Math.min(Math.max(0, unit.activityMana), template.manaCapacity);
    unit.drainPerSecond = 0;
    unit.powerPriority = this.rules.powerPriority ?? 1;
    this.game?.power?.registerReceiver?.(unit, {
      positionOf: () => ({ x: unit.position?.x ?? 0, z: unit.position?.z ?? 0 })
    });
    this.stats.registered += 1;
    this.refreshRecipes();
    return record;
  }

  unregisterProducer(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    const record = this.producers.get(unitId);
    if (!record) return false;
    this.producers.delete(unitId);
    this.game?.power?.unregisterReceiver?.(unitId);
    return true;
  }

  furnaceStation(unit) {
    return this.game?.stations?.stationFor?.(unit) ?? null;
  }

  furnaceInputInventory(unit) {
    return this.furnaceStation(unit)?.inventory ?? null;
  }

  furnaceOutputInventory(unit) {
    return this.furnaceStation(unit)?.outputInventory ?? null;
  }

  furnaceFuelInventory(unit) {
    return this.furnaceStation(unit)?.fuelInventory ?? null;
  }

  activeRecipe(record) {
    const inventory = this.furnaceInputInventory(record.unit);
    const slot = inventory?.slots?.[0] ?? null;
    if (!slot?.itemId) return null;
    const base = productionRecipeForInput(record.unit.type, slot.itemId);
    if (!base) return null;
    const patched = this.game?.research?.effectiveProductionRecipe?.(base) ?? base;
    record.recipe = patched;
    return patched;
  }

  statusOf(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    const record = this.producers.get(unitId);
    if (!record) return null;
    const recipe = this.activeRecipe(record) ?? record.recipe ?? record.template;
    const inventory = this.furnaceInputInventory(record.unit);
    const slot = inventory?.slots?.[0] ?? null;
    const outInv = this.furnaceOutputInventory(record.unit);
    return {
      unitId: record.unit.id,
      recipeId: recipe?.id ?? null,
      inputItemId: slot?.itemId ?? null,
      inputCount: slot?.count ?? 0,
      outputCount: recipe?.output?.itemId ? (outInv?.countOf?.(recipe.output.itemId) ?? 0) : 0,
      progress: record.progress,
      seconds: recipe?.seconds ?? 0,
      stalled: record.stalled,
      reason: record.reason,
      activityMana: record.unit.activityMana ?? 0,
      manaCapacity: recipe?.manaCapacity ?? record.template?.manaCapacity ?? 0,
      drainPerSecond: recipe?.drainPerSecond ?? record.template?.drainPerSecond ?? 0,
      fuelCount: countFurnaceFuel(this.furnaceFuelInventory(record.unit))
    };
  }

  update(dt) {
    if (!this.producers.size) return;
    this.producers.forEach((record, unitId) => {
      const unit = record.unit;
      if (!unit?.alive) {
        this.unregisterProducer(unitId);
        return;
      }
      this.tickProducer(record, dt);
    });
  }

  refreshRecipes() {
    this.producers.forEach((record) => {
      record.baseRecipes = productionRecipesForUnitType(record.unit.type).map((entry) => {
        const base = normalizeProductionRecipe(entry);
        return this.game?.research?.effectiveProductionRecipe?.(base) ?? base;
      });
    });
  }

  tickProducer(record, dt) {
    const { unit } = record;
    const inputInv = this.furnaceInputInventory(unit);
    const outputInv = this.furnaceOutputInventory(unit);
    const fuelInv = this.furnaceFuelInventory(unit);
    const slot = inputInv?.slots?.[0] ?? null;
    const recipe = this.activeRecipe(record);

    if (!inputInv || !outputInv) {
      record.stalled = true;
      record.reason = 'no_inventory';
      unit.drainPerSecond = 0;
      return;
    }

    if (!slot?.itemId) {
      record.stalled = true;
      record.reason = 'no_input';
      record.cycles = 0;
      unit.drainPerSecond = 0;
      this.stats.stalledTicks += 1;
      return;
    }

    if (!recipe) {
      record.stalled = true;
      record.reason = 'unknown_material';
      record.cycles = 0;
      unit.drainPerSecond = 0;
      this.stats.stalledTicks += 1;
      return;
    }

    const fuelPerCycle = Math.max(1, Math.floor(Number(ITEM_RULES.furnaceFuelPerCycle) || 1));
    const hasInput = (slot.count ?? 0) >= recipe.input.count;
    const hasFuel = countFurnaceFuel(fuelInv) >= fuelPerCycle;
    const hasMana = (unit.activityMana ?? 0) > 0;

    let reason = 'working';
    if (!hasInput) reason = 'no_input';
    else if (!hasFuel) reason = 'no_fuel';
    else if (!hasMana) reason = 'no_power';
    else if (maxCyclesForFurnace(recipe, slot, outputInv, {
      stackLimit: itemStackLimit(recipe.output.itemId),
      fuelInv
    }) <= 0) reason = 'output_blocked';

    unit.drainPerSecond = reason === 'working' ? recipe.drainPerSecond : 0;

    if (reason !== 'working') {
      record.stalled = true;
      record.reason = reason;
      record.cycles = 0;
      this.stats.stalledTicks += 1;
      return;
    }

    const cyclesAllowed = maxCyclesForFurnace(recipe, slot, outputInv, {
      stackLimit: itemStackLimit(recipe.output.itemId),
      fuelInv
    });

    const step = advanceProduction({
      progress: record.progress,
      dt,
      seconds: recipe.seconds,
      cyclesAllowed
    });

    if (step.cycles > 0) {
      const settled = settleFurnaceProduction(inputInv, outputInv, recipe, step.cycles, {
        stackLimit: itemStackLimit(recipe.output.itemId)
      });
      if (!settled.ok) {
        record.stalled = true;
        record.reason = settled.reason === 'output_full' ? 'output_blocked' : settled.reason;
        record.cycles = 0;
        return;
      }
      const burned = consumeFurnaceFuel(fuelInv, step.cycles);
      if (!burned.ok) {
        record.stalled = true;
        record.reason = 'no_fuel';
        record.cycles = 0;
        return;
      }
      this.stats.cycles += step.cycles;
      this.stats.consumed += recipe.input.count * step.cycles;
      this.stats.produced += recipe.output.count * step.cycles;
      this.game?.stationPanel?.markDirty?.();
      this.game?.backpack?.markDirty?.();
      this.game?.transportVisual?.markDirty?.();
    }

    record.progress = step.progress;
    record.cycles = step.cycles;
    record.stalled = step.stalled;
    record.reason = step.stalled ? reason : 'working';
  }

  serialize() {
    return [...this.producers.values()].map((record) => ({
      unitId: record.unit.id,
      recipeId: record.recipe?.id ?? record.template?.id ?? null,
      progress: record.progress
    }));
  }
}
