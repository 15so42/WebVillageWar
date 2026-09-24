// 生产设施的运行时。
//
// 一座设施（目前是熔炉）按周期把基地库存里的材料变成产物。三条规则：
//   1. **必须在供能范围内**：设施注册成供能接收者，干活才吃魔（`drainPerSecond`），
//      停摆时设回 0——和傀儡待机不吃魔是同一套模型。
//   2. **缺料就停摆**：进度原地保留，材料接上之后接着烧，不从头再来。
//   3. **结算是整笔原子的**：先算"这一段最多能做几个周期"（材料上限与产物空间取小），
//      再扣材料、再加产物。扣了木材却没出木炭这种半成品状态不允许出现。
//
// 输入输出都走基地库存：方案第 5 节推荐的"容器连接 + 搬运"还没做，
// 所以 v1 用共享的基地库存，而不是给设施再发一个独立缓冲——
// 那会引入一套临时的第二物流，接上真正的搬运时反而要拆掉。
import {
  advanceProduction,
  maxCyclesByInput,
  maxCyclesByOutput,
  normalizeProductionRecipe,
  productionCycleAmounts,
  productionRecipeForUnitType
} from './production.js';

export class ProductionSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = options.rules ?? {};
    /** @type {Map<number, object>} unitId → { unit, recipe, progress, cycles, stalled, reason } */
    this.producers = new Map();
    this.stats = { registered: 0, cycles: 0, consumed: 0, produced: 0, stalledTicks: 0 };
  }

  /**
   * 把一座建好的设施登记成生产者。`recipe` 缺省时按 unitType 自动匹配；
   * 匹配不到就返回 null（不是所有建筑都生产东西）。
   */
  registerProducer(unit, { recipe = null } = {}) {
    if (!unit?.id) return null;
    const resolved = normalizeProductionRecipe(recipe)
      ?? productionRecipeForUnitType(unit.type);
    if (!resolved) return null;
    const record = {
      unit,
      recipe: resolved,
      baseRecipe: resolved,
      progress: 0,
      cycles: 0,
      stalled: true,
      reason: 'no_input'
    };
    this.producers.set(unit.id, record);
    // 供电：容量与"干活时"的消耗先给上，真正的开关在 update 里按有没有料来切
    unit.kind = 'building';
    unit.baseManaCapacity = resolved.manaCapacity;
    unit.manaCapacity = resolved.manaCapacity;
    if (!Number.isFinite(unit.activityMana)) unit.activityMana = resolved.manaCapacity;
    unit.activityMana = Math.min(Math.max(0, unit.activityMana), resolved.manaCapacity);
    unit.drainPerSecond = 0;
    unit.powerPriority = this.rules.powerPriority ?? 1;
    this.game?.power?.registerReceiver?.(unit, {
      positionOf: () => ({ x: unit.position?.x ?? 0, z: unit.position?.z ?? 0 })
    });
    this.stats.registered += 1;
    // 建的时候先把当前科技的效果套上（先研究后建的情况）
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

  /** 设施当前状态，供 HUD / 验收脚本读取。 */
  statusOf(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    const record = this.producers.get(unitId);
    if (!record) return null;
    return {
      unitId: record.unit.id,
      recipeId: record.recipe.id,
      progress: record.progress,
      seconds: record.recipe.seconds,
      stalled: record.stalled,
      reason: record.reason,
      activityMana: record.unit.activityMana ?? 0,
      manaCapacity: record.recipe.manaCapacity
    };
  }

  update(dt) {
    if (!this.producers.size) return;
    const inventory = this.game?.baseInventory ?? null;
    this.producers.forEach((record, unitId) => {
      const unit = record.unit;
      if (!unit?.alive) {
        this.unregisterProducer(unitId);
        return;
      }
      this.tickProducer(record, inventory, dt);
    });
  }

  /**
   * 重新解析所有生产者的配方（研究完"高效烧炭"这类科技之后调用）。
   *
   * 事件驱动而不是每帧解析：配方补丁只会在研究完成的那一刻变化，
   * 每帧给每座设施做一次对象合并是白白的 GC。
   */
  refreshRecipes() {
    this.producers.forEach((record) => {
      const base = record.baseRecipe ?? record.recipe;
      record.baseRecipe = base;
      record.recipe = this.game?.research?.effectiveProductionRecipe?.(base) ?? base;
    });
  }

  tickProducer(record, inventory, dt) {
    const { recipe, unit } = record;
    const inputHave = inventory?.countOf?.(recipe.input.itemId) ?? 0;
    const hasInput = inputHave >= recipe.input.count;
    const hasMana = (unit.activityMana ?? 0) > 0;

    // 停摆原因分得细一点：HUD 与验收脚本要能区分"缺料"和"没电"
    let reason = 'working';
    if (!hasInput) reason = 'no_input';
    else if (!hasMana) reason = 'no_power';

    // 干活才吃魔：停摆时设回 0，让储备慢慢回满（供能系统只在有需求时补）
    unit.drainPerSecond = reason === 'working' ? recipe.drainPerSecond : 0;

    if (reason !== 'working') {
      record.stalled = true;
      record.reason = reason;
      record.cycles = 0;
      this.stats.stalledTicks += 1;
      // 注意：**进度保留**。材料接上之后接着烧，不从头再来。
      return;
    }

    if (!inventory) {
      record.stalled = true;
      record.reason = 'no_inventory';
      record.cycles = 0;
      return;
    }

    // 这一段最多能做几个周期：材料上限与产物空间取小。
    // 产物空间用剩余可接受量算，避免"做了才发现放不下"。
    const byInput = maxCyclesByInput(recipe, (itemId) => inventory.countOf(itemId));
    const byOutput = maxCyclesByOutput(recipe, (itemId) => inventory.canAccept(itemId, Number.MAX_SAFE_INTEGER));
    // 一个周期至少走完一个 seconds 才能结算，所以这一段的理论上限也受 dt 限制
    const step = advanceProduction({
      progress: record.progress,
      dt,
      seconds: recipe.seconds,
      cyclesAllowed: Math.min(byInput, byOutput)
    });

    if (step.cycles > 0) {
      const amounts = productionCycleAmounts(recipe, step.cycles);
      const removed = inventory.remove(amounts.consumed.itemId, amounts.consumed.count);
      if (removed.ok) {
        const added = inventory.add(amounts.produced.itemId, amounts.produced.count);
        if (!added.ok) {
          // 理论上前面的 canAccept 已经保证放得下；真到了这里必须把材料退回去，
          // 否则就是"扣了木材但木炭没出来"。
          inventory.add(amounts.consumed.itemId, amounts.consumed.count);
          record.stalled = true;
          record.reason = 'no_space';
          record.cycles = 0;
          return;
        }
        this.stats.cycles += step.cycles;
        this.stats.consumed += amounts.consumed.count;
        this.stats.produced += amounts.produced.count;
      } else {
        record.stalled = true;
        record.reason = 'no_input';
        record.cycles = 0;
        return;
      }
    }

    record.progress = step.progress;
    record.cycles = step.cycles;
    record.stalled = step.stalled;
    record.reason = step.stalled ? reason : 'working';
  }

  serialize() {
    return [...this.producers.values()].map((record) => ({
      unitId: record.unit.id,
      recipeId: record.recipe.id,
      progress: record.progress
    }));
  }
}
