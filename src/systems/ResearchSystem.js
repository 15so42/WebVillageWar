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
  RESEARCH_ERROR,
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
  techById,
  unitTechModifiersFor
} from './research.js';

/** 单位属性修正的唯一 source：每次重挂前按它整段移除，重复调用不会叠乘。 */
export const TECH_UNIT_SOURCE = 'tech:unit-effects';

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
    // 清空之后必须把已经挂在单位身上的修正摘掉，否则"新开一局还有上一局的效果"。
    this.refreshTechUnitEffects();
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
   * 区域图纸权威：某座内巢是否已经被真正摧毁。
   *
   * 事实只有一个来源——`spawnPoints.points[].cleared`（清点流程和存档读回都写在这里）。
   * 不新增背包物品、不做随机掉率：图纸就是"这座巢被拆掉了"这件事本身。
   * **读不到点位时按"没拆"处理**（返回 false）：图纸是新内容的门槛，没有权威来源时
   * 宁可锁着，也不能凭空送出四项能力。老科技不看这个函数，行为完全不变。
   */
  nestCleared(nestId) {
    const points = this.game?.spawnPoints?.points;
    if (!nestId) return true;
    if (!Array.isArray(points)) return false;
    return points.some((point) => point?.id === nestId && point.cleared === true);
  }

  /** 这座巢穴的名字（面板要说清"去拆哪一座"）。 */
  nestName(nestId) {
    const point = this.game?.spawnPoints?.pointById?.(nestId) ?? null;
    return point?.name ?? nestId ?? '';
  }

  researchContext() {
    return {
      researched: this.researched,
      countOf: (itemId) => this.countOf(itemId),
      stationReady: this.stationReady(),
      nestCleared: (nestId) => this.nestCleared(nestId)
    };
  }

  /**
   * 研究一项科技。成功才扣材料——先算够不够，再一次性扣掉，
   * 中途任何一项扣不动就把已经扣掉的退回去。
   */
  research(techId) {
    const check = canResearch(techId, this.researchContext());
    if (!check.ok) {
      return {
        ok: false,
        reason: check.reason,
        label: this.reasonLabel(check),
        missing: check.missing,
        requiresNestId: check.requiresNestId ?? null
      };
    }
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
    // 同理：已经建好的箭塔/弩炮要立刻拿到新射程，已经在场上的战斗单位立刻换耐久折扣。
    this.refreshTechUnitEffects();
    this.game?.baseStorage?.markDirty?.();
    this.game?.hints?.setHintOnce?.(`科技已解锁：${tech.name}`, `research:${tech.id}`);
    return { ok: true, reason: 'none', tech };
  }

  /**
   * 面向玩家的拒绝理由。图纸缺口必须说清"去拆哪一座巢穴"，
   * 而不是笼统的"无法研究"——否则玩家不知道该往哪打。
   */
  reasonLabel(check) {
    if (check?.reason === RESEARCH_ERROR.missingBlueprint) {
      const name = this.nestName(check.requiresNestId);
      return `还没有区域图纸：先拆掉${name}`;
    }
    return RESEARCH_ERROR_LABELS[check?.reason] ?? '';
  }

  /**
   * 把已研究科技的单位属性修正挂到**这一个单位**身上。
   *
   * 幂等靠唯一 source：每次先按 `TECH_UNIT_SOURCE` 整段移除再加。
   * 所以注册、招募归队、换武器、applySnapshot、reset 都可以放心重复调用，
   * 不会出现"换一次武器耐久折扣叠一层"。
   * 只读 unit.definition 与 unit.team，不改共享的 UNIT_DEFINITIONS。
   */
  applyUnitTechAttributes(unit) {
    if (!unit?.attributes?.removeModifiersBySource) return [];
    unit.attributes.removeModifiersBySource(TECH_UNIT_SOURCE);
    const modifiers = this.unitModifiersFor(unit);
    if (modifiers.length) {
      unit.attributes.addModifiers(modifiers, TECH_UNIT_SOURCE, {
        owner: unit,
        game: this.game
      });
    }
    return modifiers;
  }

  /**
   * 这个单位该吃哪些科技修正。
   * 哨站测距只认箭塔/弩炮；军械保养只认**己方移动战斗单位**（含傀儡），
   * 建筑、基地、敌方与中立都不吃。
   */
  unitModifiersFor(unit) {
    if (!unit) return [];
    const definition = unit.definition ?? null;
    return unitTechModifiersFor({
      team: unit.team,
      type: unit.type,
      canMove: definition?.canMove !== false,
      isBuilding: unit.isBuilding === true || unit.kind === 'building' || unit.kind === 'structure',
      hasWeapon: Boolean(definition?.weapon)
    }, this.researched);
  }

  /** 把当前科技状态重新套到所有己方单位上（研究成功/读档/重置后调用）。 */
  refreshTechUnitEffects() {
    const units = this.game?.friendlyUnits;
    if (!Array.isArray(units)) return 0;
    let applied = 0;
    units.forEach((unit) => {
      if (!unit?.alive) return;
      applied += this.applyUnitTechAttributes(unit).length ? 1 : 0;
    });
    return applied;
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
    // 走无卡的造石入口：放置检查（基地符文背包是否放得下）在那边统一做，
    // 这里不再自己重复一遍容量判断。
    const created = runeSystem.createEnchantmentStone?.({
      enchantmentId,
      level: 1,
      playerId: runeSystem.localSlot?.() ?? null
    }) ?? null;
    if (!created?.ok) {
      removed.forEach((done) => inventory.add(done.itemId, done.count));
      return {
        ok: false,
        reason: created?.reason ?? 'create_failed',
        label: created ? '基地符文背包已满' : '制作失败',
        missing: []
      };
    }
    const stone = created.stone;
    this.stats.enchanted += 1;
    this.stats.spentOnEnchant += check.recipe.cost.reduce((sum, entry) => sum + entry.count, 0);
    this.game?.baseStorage?.markDirty?.();
    this.game?.backpack?.refresh?.();
    this.game?.hints?.setHintOnce?.(`制作完成：${stone.enchantmentId} 附魔石`, `enchant:${stone.id}`);
    return { ok: true, reason: 'none', stone };
  }

  /**
   * 供 UI 渲染的科技状态：每项科技当前能不能研究、缺什么、已经解锁了什么。
   * 界面里不重算规则——和合成面板同一条纪律。
   */
  techStatus() {
    return allTechs().map((tech) => {
      const check = canResearch(tech, this.researchContext());
      return {
        ...tech,
        researched: this.has(tech.id),
        canResearch: check.ok,
        reason: check.reason,
        reasonLabel: check.ok ? '' : this.reasonLabel(check),
        missingPrerequisites: check.prerequisites ?? [],
        requiresNestId: tech.requiresNestId,
        blueprintReady: tech.requiresNestId ? this.nestCleared(tech.requiresNestId) : true,
        nestName: tech.requiresNestId ? this.nestName(tech.requiresNestId) : null,
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
    // 读档之后单位属性要跟着快照走：不重挂的话，存档里"研究过的射程"会丢在上一局。
    this.game?.production?.refreshRecipes?.();
    this.refreshTechUnitEffects();
    return true;
  }
}
