// 科技与附魔台的运行时。
//
// 两件事：
//   1. 研究科技：需要**建好的科研站** + 材料，消耗是整笔原子的；
//   2. 制作附魔石：需要**建好的附魔台** + 材料，产出直接交给 RuneStoneSystem。
//
// 为什么附魔石不先做成物品再搬运：石头是**实例**，带着等级、经验与成长，
// 而它的事实归属一直是 `RuneStoneSystem.stones`（符文背包 UI、装备、掉落全走那边）。
// 让附魔台直接 `createStone()` 就不存在"物品库存里有一块石头、符文系统里没有"的
// 双重身份，也不需要在这一轮去动那套已经验收过的符文链路。
// 方案第 10 节说的"迁移为通用物品基础"是更大的改造，留待专门一轮。
import {
  ENCHANT_ERROR_LABELS,
  RESEARCH_ERROR_LABELS,
  allEnchantRecipes,
  allTechs,
  applyProductionPatch,
  canEnchant,
  canResearch,
  harvestPerActionBonus,
  normalizeTech,
  productionPatchFor,
  recipeUnlocked,
  researchRules,
  techById
} from './research.js';

export class ResearchSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = { ...researchRules(), ...(options.rules ?? {}) };
    /** @type {Set<string>} 已研究的科技 id */
    this.researched = new Set();
    this.stats = { researched: 0, enchanted: 0, spentOnResearch: 0, spentOnEnchant: 0 };
  }

  reset() {
    this.researched.clear();
    this.stats = { researched: 0, enchanted: 0, spentOnResearch: 0, spentOnEnchant: 0 };
  }

  has(techId) {
    return this.researched.has(String(techId ?? ''));
  }

  /** 科研站是否已建成（施工中不算）。 */
  stationReady() {
    return this.buildingReady(this.rules.stationUnitType);
  }

  /** 附魔台是否已建成（施工中不算）。 */
  tableReady() {
    return this.buildingReady(this.rules.enchantUnitType);
  }

  buildingReady(unitType) {
    if (!unitType) return false;
    return (this.game?.friendlyUnits ?? []).some((unit) => (
      unit?.alive && unit.type === unitType && unit.underConstruction !== true
    ));
  }

  countOf(itemId) {
    return this.game?.baseInventory?.countOf?.(itemId) ?? 0;
  }

  /**
   * 研究一项科技。成功才扣材料——先算够不够，再一次性扣掉，
   * 中途任何一项扣不动就把已经扣掉的退回去。
   */
  research(techId) {
    const check = canResearch(techId, {
      researched: this.researched,
      countOf: (itemId) => this.countOf(itemId),
      stationReady: this.stationReady()
    });
    if (!check.ok) return { ok: false, reason: check.reason, label: RESEARCH_ERROR_LABELS[check.reason] ?? '', missing: check.missing };
    const tech = check.tech;
    const inventory = this.game?.baseInventory;
    if (!inventory) return { ok: false, reason: 'no_inventory', label: '', missing: [] };

    const removed = [];
    for (const entry of tech.cost) {
      const result = inventory.remove(entry.itemId, entry.count);
      if (!result.ok) {
        // 退回到研究前的状态：宁可整笔失败，也不能扣了一半材料
        removed.forEach((done) => inventory.add(done.itemId, done.count));
        return { ok: false, reason: 'missing_inputs', label: RESEARCH_ERROR_LABELS.missing_inputs, missing: [] };
      }
      removed.push(entry);
    }
    this.researched.add(tech.id);
    this.stats.researched += 1;
    this.stats.spentOnResearch += tech.cost.reduce((sum, entry) => sum + entry.count, 0);
    // 研究完立刻把"改运转参数"的科技应用到已经建好的设施上。
    // 不做这一步的话，先建熔炉再研究高效烧炭就不会生效——
    // 而玩家的实际顺序几乎总是"先建设施，后研究"。
    this.game?.production?.refreshRecipes?.();
    this.game?.baseStorage?.markDirty?.();
    this.game?.cardSystem?.setHintOnce?.(`科技已解锁：${tech.name}`, `research:${tech.id}`);
    return { ok: true, reason: 'none', tech };
  }

  /** 生产配方在当前科技下的实际形态（可被科技补丁修改）。 */
  effectiveProductionRecipe(recipe) {
    if (!recipe) return recipe;
    const patch = productionPatchFor(recipe.id, this.researched);
    return applyProductionPatch(recipe, patch);
  }

  /** 每次采集动作的加成。 */
  harvestBonus() {
    return harvestPerActionBonus(this.researched);
  }

  /**
   * 用材料制作一块附魔石，直接进符文系统。
   * 材料扣除同样是整笔原子的。
   */
  enchant(enchantmentId) {
    const check = canEnchant(enchantmentId, {
      countOf: (itemId) => this.countOf(itemId),
      tableReady: this.tableReady()
    });
    if (!check.ok) return { ok: false, reason: check.reason, label: ENCHANT_ERROR_LABELS[check.reason] ?? '', missing: check.missing };
    const runeSystem = this.game?.runeStones;
    if (!runeSystem?.createStone) return { ok: false, reason: 'no_rune_system', label: '', missing: [] };
    const capacity = runeSystem.canPlaceInBase?.(runeSystem.localSlot?.());
    if (capacity && capacity.ok === false) {
      return { ok: false, reason: capacity.reason, label: '基地符文背包已满', missing: [] };
    }
    const inventory = this.game?.baseInventory;
    const removed = [];
    for (const entry of check.recipe.cost) {
      const result = inventory.remove(entry.itemId, entry.count);
      if (!result.ok) {
        removed.forEach((done) => inventory.add(done.itemId, done.count));
        return { ok: false, reason: 'missing_inputs', label: ENCHANT_ERROR_LABELS.missing_inputs, missing: [] };
      }
      removed.push(entry);
    }
    const stone = runeSystem.createStone({
      enchantmentId,
      level: 1,
      playerId: runeSystem.localSlot?.() ?? null
    });
    if (!stone) {
      removed.forEach((done) => inventory.add(done.itemId, done.count));
      return { ok: false, reason: 'create_failed', label: '制作失败', missing: [] };
    }
    this.stats.enchanted += 1;
    this.stats.spentOnEnchant += check.recipe.cost.reduce((sum, entry) => sum + entry.count, 0);
    this.game?.baseStorage?.markDirty?.();
    this.game?.runeBackpack?.refresh?.();
    this.game?.cardSystem?.setHintOnce?.(`制作完成：${stone.enchantmentId} 附魔石`, `enchant:${stone.id}`);
    return { ok: true, reason: 'none', stone };
  }

  /**
   * 供 UI 渲染的科技状态：每项科技当前能不能研究、缺什么、已经解锁了什么。
   * 界面里不重算规则——和合成面板同一条纪律。
   */
  techStatus() {
    return allTechs().map((tech) => {
      const check = canResearch(tech, {
        researched: this.researched,
        countOf: (itemId) => this.countOf(itemId),
        stationReady: this.stationReady()
      });
      return {
        ...tech,
        researched: this.has(tech.id),
        canResearch: check.ok,
        reason: check.reason,
        reasonLabel: check.ok ? '' : (RESEARCH_ERROR_LABELS[check.reason] ?? ''),
        missingPrerequisites: check.prerequisites ?? [],
        cost: tech.cost.map((entry) => ({ ...entry, have: this.countOf(entry.itemId) }))
      };
    });
  }

  /** 供 UI 渲染的附魔状态。`tableReady` 决定整段是否可用。 */
  enchantStatus() {
    const tableReady = this.tableReady();
    return {
      tableReady,
      stationReady: this.stationReady(),
      recipes: allEnchantRecipes().map((recipe) => {
        const check = canEnchant(recipe.enchantmentId, {
          countOf: (itemId) => this.countOf(itemId),
          tableReady
        });
        return {
          ...recipe,
          canEnchant: check.ok,
          reason: check.reason,
          reasonLabel: check.ok ? '' : (ENCHANT_ERROR_LABELS[check.reason] ?? ''),
          cost: recipe.cost.map((entry) => ({ ...entry, have: this.countOf(entry.itemId) }))
        };
      })
    };
  }

  /** 配方是否被科技解锁（合成面板按这个过滤）。 */
  recipeUnlocked(recipe) {
    return recipeUnlocked(recipe, this.researched);
  }

  serialize() {
    return { researched: [...this.researched] };
  }

  applySnapshot(snapshot) {
    const rows = snapshot?.researched;
    if (!Array.isArray(rows)) return false;
    this.researched = new Set(rows.filter((id) => techById(id)).map((id) => String(id)));
    return true;
  }
}
