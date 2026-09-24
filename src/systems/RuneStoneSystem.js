import {
  RUNE_LOCATION_BASE,
  RUNE_LOCATION_GROUND,
  RUNE_LOCATION_UNIT,
  RUNE_STONE_ITEM_ID,
  applyManaToStone,
  initialRuneLevelForCard,
  manaThresholdForLevel,
  normalizeRuneStone,
  runeColor,
  runeDisplayName,
  runeEnchantmentDefinition,
  runeEnchantmentIdForCard,
  runeSellValue,
  serializeRuneStone,
  splitManaEvenly,
  stoneItemData
} from './runeStones.js';
import { addGrowth, growthModifiersFor, growthOf } from './runeGrowth.js';
import { moveSlot } from './inventoryTransfer.js';

/**
 * 符文石的运行时权威。
 *
 * **本地改造（本轮第 2 条需求）**：符文石不再住在自己的"位置表"里，而是
 * **就是背包里的一件普通物品**——`itemId === 'runeStone'`、`instanceId` 就是石头自己的 id、
 * 等级/魔力/成长放在格子的 `data` 里。
 *
 * 这样做的直接后果（也是改造的目的）：
 *   - 单位背包是一个真正的背包：符文石、魔力石、工具、材料共用一个 6 列网格；
 *   - 基地背包同理，B 键打开的就是"能放任何东西的背包"；
 *   - 搬运、掉落、拾取全部走库存那一套已经验证过的原子接口，不再有两套并行的位置语义。
 *
 * 由此带来的两条纪律：
 *   1. `this.stones` 是**石头数据的权威**（等级、魔力、永久成长），格子里的 `data` 只是投影，
 *      任何改动都要 `writeThrough` 回格子，否则存档 / 掉落会带着旧等级跑；
 *   2. 落点（`stone.location`）是**读出来的**，不是存出来的：`stoneForSlot()` 在被读到时
 *      顺手把 location 写成它所在容器的位置。所以查询即重建，不需要额外的失效通知。
 *
 * 规则本身没变（见 docs/RUNE_STONE_GAMEPLAY_PLAN.md 第 3～4 节）：
 *   - 石头放在单位背包即生效；同名石头里只有**排在格子最前**的一块生效；
 *   - 石头随时可转移，不限制地点、不限制交战状态；
 *   - 单位阵亡时石头落地成为可拾取的遗物包，等级/经验/成长原样保留；
 *   - 等级只由魔力成长；获得魔力时按携带数量均分。
 */

export const RUNE_ERROR = {
  UNKNOWN_STONE: 'unknown_rune_stone',
  NOT_OWNED: 'rune_stone_not_owned',
  UNKNOWN_UNIT: 'rune_stone_target_not_found',
  NOT_OWNED_UNIT: 'rune_stone_target_not_owned',
  DUPLICATE_NAME: 'rune_stone_duplicate_name',
  UNIT_FULL: 'rune_stone_unit_full',
  BASE_FULL: 'rune_stone_base_full',
  TARGET_DEAD: 'rune_stone_target_dead'
};

export const RUNE_ERROR_LABELS = {
  [RUNE_ERROR.UNKNOWN_STONE]: '找不到这块符文石',
  [RUNE_ERROR.NOT_OWNED]: '这不是你的符文石',
  [RUNE_ERROR.UNKNOWN_UNIT]: '目标单位不存在',
  [RUNE_ERROR.NOT_OWNED_UNIT]: '这不是你的单位',
  [RUNE_ERROR.DUPLICATE_NAME]: '该单位已携带同名符文石',
  [RUNE_ERROR.UNIT_FULL]: '该单位的背包已满',
  [RUNE_ERROR.BASE_FULL]: '基地背包已满',
  [RUNE_ERROR.TARGET_DEAD]: '目标单位已阵亡'
};

export class RuneStoneSystem {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    /** @type {Map<string, object>} 本局所有符文石实例，按 id 索引。 */
    this.stones = new Map();
    this.nextStoneId = 1;
    this.orderCounter = 0;
    /** 阵亡单位档案：unitId → { unitId, unitType, name, playerId }。石头现在会随死亡落地，
     *  这份档案只留给旧存档里"石头还在某个已不存在的单位背包里"的显示兜底。 */
    this.strandedUnits = new Map();
  }

  localSlot() {
    const game = this.game;
    return game?.localPlayerId ?? game?.localPlayerSlot ?? 'local-player';
  }

  playerSlots() {
    const game = this.game;
    if (typeof game?.coopPlayerSlots === 'function') return game.coopPlayerSlots();
    return [this.localSlot()];
  }

  // ---- 容器 ----

  baseInventory() {
    return this.game?.baseInventory ?? null;
  }

  /** 单位的背包。建筑没有背包，返回 null。 */
  inventoryForUnit(unit) {
    if (!unit) return null;
    const existing = unit.workerInventory ?? unit.itemBag ?? null;
    if (existing) return existing;
    return this.game?.itemBagFor?.(unit, { create: false }) ?? null;
  }

  /** 取（必要时创建）单位背包：只有真的能拿东西的单位才会有。 */
  ensureInventoryForUnit(unit) {
    if (!unit) return null;
    return this.inventoryForUnit(unit) ?? this.game?.itemBagFor?.(unit, { create: true }) ?? null;
  }

  /**
   * 所有可能装着符文石的容器。
   * 敌我两边都要扫：被招募过来的单位在换队之前仍留在 `enemyUnits` 里，
   * 只扫友军会让它背包里的石头"消失"。
   */
  containers() {
    const list = [];
    const base = this.baseInventory();
    if (base) {
      list.push({ inventory: base, location: { kind: RUNE_LOCATION_BASE, unitId: null }, unit: null });
    }
    const seen = new Set();
    const scan = (units) => {
      (units ?? []).forEach((unit) => {
        if (!unit || seen.has(unit)) return;
        seen.add(unit);
        const inventory = this.inventoryForUnit(unit);
        if (!inventory) return;
        list.push({
          inventory,
          location: { kind: RUNE_LOCATION_UNIT, unitId: String(unit.id) },
          unit
        });
      });
    };
    scan(this.game?.friendlyUnits);
    scan(this.game?.enemyUnits);
    return list;
  }

  unitById(unitId) {
    if (unitId == null) return null;
    const key = String(unitId);
    const find = (units) => (units ?? []).find((unit) => String(unit?.id) === key) ?? null;
    return find(this.game?.friendlyUnits) ?? find(this.game?.enemyUnits);
  }

  // ---- 格子 ↔ 石头 ----

  bumpNextId(id) {
    const numeric = Number(String(id).replace(/[^0-9]/g, ''));
    if (Number.isFinite(numeric)) this.nextStoneId = Math.max(this.nextStoneId, numeric + 1);
  }

  /**
   * 由一个库存格子取回石头本体。
   *
   * 格子里的 `data` 是投影，`this.stones` 才是权威；但投影可能是**唯一**的来源
   * （合成直接把石头塞进背包、旧存档、联机快照），所以缺失时要按格子数据重建，
   * 并且**复用同一个 instanceId**——再造一块新的就等于凭空多一块石头。
   */
  stoneForSlot(slot, location = null) {
    if (slot?.itemId !== RUNE_STONE_ITEM_ID) return null;
    const id = slot.instanceId != null ? String(slot.instanceId) : null;
    if (!id) return null;
    let stone = this.stones.get(id);
    if (!stone) {
      const data = slot.data ?? {};
      stone = normalizeRuneStone({
        ...data,
        id,
        playerId: data.playerId ?? this.localSlot(),
        order: Number.isFinite(Number(data.order)) ? Number(data.order) : this.orderCounter
      });
      if (!stone) return null;
      this.orderCounter = Math.max(this.orderCounter, stone.order + 1);
      this.stones.set(stone.id, stone);
      this.bumpNextId(stone.id);
    }
    if (location) stone.location = { ...location };
    return stone;
  }

  /** 一个背包里的全部符文石，按格子顺序返回（顺序决定同名石头谁生效）。 */
  stonesInInventory(inventory, location) {
    if (!inventory?.slots) return [];
    const out = [];
    inventory.slots.forEach((slot) => {
      const stone = this.stoneForSlot(slot, location);
      if (stone) out.push(stone);
    });
    return out;
  }

  /** 把所有容器里的石头都登记进来。UI 与存档读取前调用一次即可。 */
  discoverAll() {
    this.containers().forEach(({ inventory, location }) => this.stonesInInventory(inventory, location));
    return this.stones.size;
  }

  /** 石头数据变了之后写回它所在的格子（等级/魔力/成长都要跟着走）。 */
  writeThrough(stone, inventory = null) {
    if (!stone) return false;
    const project = (target) => {
      if (!target?.slots) return false;
      const index = target.slots.findIndex((slot) => slot && String(slot.instanceId) === stone.id);
      if (index < 0) return false;
      target.slots[index].data = stoneItemData(stone);
      return true;
    };
    if (inventory) return project(inventory);
    return this.containers().some((entry) => project(entry.inventory));
  }

  /** 某块石头现在在哪个背包的哪一格。 */
  inventoryHolding(stoneId) {
    const id = stoneId != null ? String(stoneId) : null;
    if (!id) return null;
    const entries = this.containers();
    for (const entry of entries) {
      const index = entry.inventory.slots.findIndex((slot) => slot && String(slot.instanceId) === id);
      if (index >= 0) return { ...entry, index };
    }
    return null;
  }

  // ---- 查询 ----

  stoneById(stoneId) {
    if (stoneId == null) return null;
    return this.stones.get(String(stoneId)) ?? null;
  }

  allStones({ playerId = null } = {}) {
    this.discoverAll();
    const all = [...this.stones.values()].sort((a, b) => a.order - b.order);
    if (!playerId) return all;
    return all.filter((stone) => stone.playerId === playerId);
  }

  baseStones(playerId = null) {
    const inventory = this.baseInventory();
    if (!inventory) return [];
    const stones = this.stonesInInventory(inventory, { kind: RUNE_LOCATION_BASE, unitId: null });
    if (!playerId) return stones;
    return stones.filter((stone) => stone.playerId === playerId);
  }

  unitStones(unitId) {
    const unit = this.unitById(unitId);
    if (!unit) return [];
    return this.stonesForUnit(unit);
  }

  stonesForUnit(unit) {
    if (!unit) return [];
    const inventory = this.inventoryForUnit(unit);
    if (!inventory) return [];
    return this.stonesInInventory(inventory, { kind: RUNE_LOCATION_UNIT, unitId: String(unit.id) });
  }

  /** 单位背包里的附魔 id 集合，用于同名校验与效果同步。 */
  enchantmentIdsForUnit(unitId) {
    const ids = new Set();
    this.unitStones(unitId).forEach((stone) => ids.add(stone.enchantmentId));
    return ids;
  }

  /**
   * 同名石头里只有「格子里排在最前的一块」生效（stonesForUnit 已按格子顺序返回）。
   * 其余同名石头是备用石：留在背包里灰色显示、不生效，但照常吃魔力升级。
   */
  isStoneActive(stone) {
    if (!stone || stone.location.kind !== RUNE_LOCATION_UNIT) return true;
    const sameName = this.unitStones(stone.location.unitId)
      .filter((entry) => entry.enchantmentId === stone.enchantmentId);
    return sameName.length === 0 || sameName[0].id === stone.id;
  }

  /** 是否属于「同名未生效」的备用石（基地背包里的石头不算，那是存储而非备用）。 */
  isStoneInactiveDuplicate(stone) {
    return stone?.location?.kind === RUNE_LOCATION_UNIT && !this.isStoneActive(stone);
  }

  /** 单位当前实际生效的附魔：每个附魔名取第一块石头。 */
  activeStonesForUnit(unit) {
    const active = new Map();
    this.stonesForUnit(unit).forEach((stone) => {
      if (active.has(stone.enchantmentId)) return;
      if (runeEnchantmentDefinition(stone.enchantmentId)) {
        active.set(stone.enchantmentId, stone);
      }
    });
    return active;
  }

  /**
   * 失去了落点的石头：不属于基地、也不在任何活着的单位背包里。
   *
   * 正常情况下不会出现（阵亡时会先 `detachStonesOnDeath` 把它们变成地面掉落物），
   * 但旧存档与联机快照可能留下这种状态。**不能静默丢掉**，所以列出来让玩家手动收回基地。
   * 地面掉落物故意不列在这里：那会让 UI 变成"远程拾取"的后门。
   */
  strandedBackpacks(playerId = this.localSlot()) {
    this.discoverAll();
    const groups = new Map();
    this.allStones({ playerId })
      .filter((stone) => stone.location.kind === RUNE_LOCATION_UNIT && !this.unitById(stone.location.unitId))
      .forEach((stone) => {
        const unitId = stone.location.unitId;
        const record = groups.get(unitId) ?? {
          unitId,
          profile: this.strandedUnits.get(unitId) ?? null,
          stones: []
        };
        record.stones.push(stone);
        groups.set(unitId, record);
      });
    return [...groups.values()];
  }

  stats(playerId = this.localSlot()) {
    const inventory = this.baseInventory();
    const stones = playerId ? this.allStones({ playerId }) : this.allStones();
    return {
      total: stones.length,
      base: stones.filter((stone) => stone.location.kind === RUNE_LOCATION_BASE).length,
      baseCapacity: Math.max(0, Number(inventory?.capacity) || 0),
      levelSum: stones.reduce((sum, stone) => sum + stone.level, 0)
    };
  }

  // ---- 校验 ----

  /**
   * 同名石头可以放进同一个单位背包：只有格子里排在最前的一块生效，
   * 其余同名石头是「备用石」——不提供效果，但照常吃魔力升级，方便之后转交新单位。
   * 因此这里只校验有没有空格子，不再拒绝同名。
   */
  canPlaceInUnit(unit) {
    if (!unit) return { ok: false, reason: RUNE_ERROR.UNKNOWN_UNIT };
    if (unit.alive === false) return { ok: false, reason: RUNE_ERROR.TARGET_DEAD };
    const inventory = this.ensureInventoryForUnit(unit);
    if (!inventory) return { ok: false, reason: RUNE_ERROR.UNKNOWN_UNIT };
    if (inventory.freeSlots() <= 0) return { ok: false, reason: RUNE_ERROR.UNIT_FULL };
    return { ok: true };
  }

  canPlaceInBase() {
    const inventory = this.baseInventory();
    if (!inventory) return { ok: false, reason: RUNE_ERROR.BASE_FULL };
    if (inventory.freeSlots() <= 0) return { ok: false, reason: RUNE_ERROR.BASE_FULL };
    return { ok: true };
  }

  /** 单位背包格数（UI 用它画网格；不再是"符文槽位数"）。 */
  capacityForUnit(unit) {
    return Math.max(0, Number(this.inventoryForUnit(unit)?.capacity) || 0);
  }

  // ---- 生成 ----

  createStone({
    enchantmentId,
    level = 1,
    mana = 0,
    paidEnergy = 0,
    playerId = this.localSlot(),
    sourceCardId = null,
    location = null
  }) {
    if (!enchantmentId) return null;
    const resolved = location ?? { kind: RUNE_LOCATION_BASE, unitId: null };
    const id = `rune-${this.nextStoneId}`;
    const stone = normalizeRuneStone({
      id,
      enchantmentId,
      level,
      mana,
      paidEnergy,
      playerId,
      sourceCardId,
      order: this.orderCounter,
      location: resolved
    });
    if (!stone) return null;

    // 先落格再登记：放不进去就不该在系统里存在，否则会留下"看不见但存在"的幽灵石头。
    if (resolved.kind === RUNE_LOCATION_BASE) {
      const inventory = this.baseInventory();
      if (!inventory) return null;
      const added = inventory.add(RUNE_STONE_ITEM_ID, 1, { instanceIds: [id], data: stoneItemData(stone) });
      if (!added?.ok) return null;
    } else if (resolved.kind === RUNE_LOCATION_UNIT) {
      const unit = this.unitById(resolved.unitId);
      const inventory = this.ensureInventoryForUnit(unit);
      if (!inventory) return null;
      const added = inventory.add(RUNE_STONE_ITEM_ID, 1, { instanceIds: [id], data: stoneItemData(stone) });
      if (!added?.ok) return null;
    }

    this.nextStoneId += 1;
    this.orderCounter += 1;
    this.stones.set(stone.id, stone);
    return stone;
  }

  /**
   * 无卡造石入口：附魔台用它产出石头，验收脚本也用它做前置。
   * 放置检查（进单位还是进基地背包）在这里做一次，调用方不需要各写一遍。
   */
  createEnchantmentStone({
    enchantmentId,
    level = 1,
    playerId = this.localSlot(),
    targetUnit = null,
    paidEnergy = 0,
    sourceCardId = null
  } = {}) {
    if (!enchantmentId) return { ok: false, reason: RUNE_ERROR.UNKNOWN_STONE };

    if (targetUnit) {
      const check = this.canPlaceInUnit(targetUnit);
      if (!check.ok) return { ok: false, reason: check.reason, targetUnit };
      const stone = this.createStone({
        enchantmentId,
        level,
        paidEnergy,
        playerId,
        sourceCardId,
        location: { kind: RUNE_LOCATION_UNIT, unitId: String(targetUnit.id) }
      });
      if (!stone) return { ok: false, reason: RUNE_ERROR.UNKNOWN_STONE };
      this.syncUnitEnchantments(targetUnit);
      this.game?.onUnitBackpackChanged?.(targetUnit);
      return { ok: true, stone, targetUnit, placement: RUNE_LOCATION_UNIT };
    }

    const check = this.canPlaceInBase();
    if (!check.ok) return { ok: false, reason: check.reason };
    const stone = this.createStone({
      enchantmentId,
      level,
      paidEnergy,
      playerId,
      sourceCardId,
      location: { kind: RUNE_LOCATION_BASE, unitId: null }
    });
    if (!stone) return { ok: false, reason: RUNE_ERROR.UNKNOWN_STONE };
    return { ok: true, stone, targetUnit: null, placement: RUNE_LOCATION_BASE };
  }

  /** 旧接口保留：附魔卡时代按卡造石，现在只有验收脚本与旧存档会走。 */
  createFromCard(card, { playerId = this.localSlot(), targetUnit = null, paidEnergy = 0 } = {}) {
    const enchantmentId = runeEnchantmentIdForCard(card);
    if (!enchantmentId) return { ok: false, reason: RUNE_ERROR.UNKNOWN_STONE };
    return this.createEnchantmentStone({
      enchantmentId,
      level: initialRuneLevelForCard(card),
      playerId,
      targetUnit,
      paidEnergy,
      sourceCardId: card?.id ?? null
    });
  }

  // ---- 转移 ----

  /**
   * 把一个背包里的东西搬到另一个背包之后的收尾：
   * 谁丢了石头、谁拿到了石头，双方的附魔与最大魔力都要重算。
   */
  afterStorageChange(playerId, ...units) {
    const seen = new Set();
    units.filter(Boolean).forEach((unit) => {
      if (seen.has(unit)) return;
      seen.add(unit);
      this.game?.onUnitBackpackChanged?.(unit);
      this.syncUnitEnchantments(unit);
    });
    this.markPrivateStateDirty(playerId);
  }

  /**
   * 移动一块石头。
   *
   * 目标形态：
   *   { kind: 'unit', unit }
   *   { kind: 'base' }
   * `slotIndex` 给出时是"放到指定格子"，与《我的世界》一致；不给就自动找位置。
   */
  moveStone(stoneId, target, { playerId = this.localSlot(), slotIndex = null } = {}) {
    const stone = this.stoneById(stoneId);
    if (!stone) return { ok: false, reason: RUNE_ERROR.UNKNOWN_STONE };
    if (stone.playerId && playerId && stone.playerId !== playerId) {
      return { ok: false, reason: RUNE_ERROR.NOT_OWNED };
    }

    const targetUnit = target?.kind === RUNE_LOCATION_UNIT ? target.unit : null;
    if (target?.kind === RUNE_LOCATION_UNIT && (!targetUnit || targetUnit.alive === false)) {
      return { ok: false, reason: RUNE_ERROR.TARGET_DEAD };
    }
    const targetInventory = targetUnit
      ? this.ensureInventoryForUnit(targetUnit)
      : this.baseInventory();
    const fullReason = targetUnit ? RUNE_ERROR.UNIT_FULL : RUNE_ERROR.BASE_FULL;
    if (!targetInventory) return { ok: false, reason: fullReason };

    const holding = this.inventoryHolding(stone.id);
    const location = targetUnit
      ? { kind: RUNE_LOCATION_UNIT, unitId: String(targetUnit.id) }
      : { kind: RUNE_LOCATION_BASE, unitId: null };

    if (holding && holding.inventory === targetInventory) {
      // 同一个背包内换位：只是顺序变化，同名石头谁生效可能因此改变。
      if (slotIndex == null || slotIndex === holding.index) {
        this.writeThrough(stone, holding.inventory);
        return { ok: true, stone };
      }
      const result = moveSlot(holding.inventory, holding.inventory, {
        fromIndex: holding.index,
        toIndex: slotIndex
      });
      if (!result.ok) return { ok: false, reason: fullReason };
      stone.location = location;
      this.afterStorageChange(playerId, targetUnit);
      return { ok: true, stone };
    }

    if (holding) {
      const result = moveSlot(holding.inventory, targetInventory, {
        fromIndex: holding.index,
        toIndex: slotIndex
      });
      if (!result.ok) return { ok: false, reason: fullReason };
    } else {
      // 没有落点的石头（旧存档 / 阵亡遗留）：直接放进目标背包，不许丢。
      const inserted = targetInventory.add(RUNE_STONE_ITEM_ID, 1, {
        instanceIds: [stone.id],
        data: stoneItemData(stone)
      });
      if (!inserted?.ok) return { ok: false, reason: fullReason };
    }

    stone.location = location;
    this.afterStorageChange(playerId, targetUnit, holding?.unit ?? null);
    return { ok: true, stone };
  }

  // ---- 出售 ----

  /** 售价 = 生成时实际支付能量 × 比例 + 等级溢价。出售只销毁这一块实例。 */
  sellStone(stoneId, { playerId = this.localSlot() } = {}) {
    const stone = this.stoneById(stoneId);
    if (!stone) return { ok: false, reason: RUNE_ERROR.UNKNOWN_STONE };
    if (stone.playerId && playerId && stone.playerId !== playerId) {
      return { ok: false, reason: RUNE_ERROR.NOT_OWNED };
    }
    const holding = this.inventoryHolding(stone.id);
    if (holding) holding.inventory.slots[holding.index] = null;

    const refund = runeSellValue(stone);
    this.stones.delete(stone.id);
    this.afterStorageChange(playerId, holding?.unit ?? null);
    return { ok: true, refund };
  }

  // ---- 魔力成长 ----

  /**
   * 单位击杀获得魔力：按当前携带的石头数量均分，各石头独立累计进度。
   * 未携带石头时默认不暂存（第 6.2 节未定项，可通过配置开启）。
   */
  awardMana(unit, amount) {
    const value = Math.max(0, Number(amount) || 0);
    if (!unit || value <= 0) {
      return { distributed: 0, wasted: value, perStone: 0, levelsGained: 0, upgrades: [] };
    }
    const stones = this.stonesForUnit(unit);
    if (!stones.length) {
      return { distributed: 0, wasted: value, perStone: 0, levelsGained: 0, upgrades: [] };
    }

    const shares = splitManaEvenly(value, stones.length);
    const upgrades = [];
    let levelsGained = 0;
    stones.forEach((stone, index) => {
      const next = applyManaToStone(stone, shares[index] ?? 0);
      stone.mana = next.mana;
      if (next.level !== stone.level) {
        stone.level = next.level;
        levelsGained += next.levelsGained;
        upgrades.push(stone);
      }
      // 等级与进度都是物品数据的一部分：掉落/存档搬运的是同一个格子，必须写回。
      this.writeThrough(stone);
    });
    if (upgrades.length) this.syncUnitEnchantments(unit);

    this.markPrivateStateDirty(unit.controllerPlayerId ?? unit.ownerPlayerId ?? this.localSlot());
    return {
      distributed: value,
      wasted: 0,
      perStone: shares[0] ?? 0,
      levelsGained,
      upgrades
    };
  }

  /** 祭坛等非击杀来源的魔力，规则与击杀一致（均分给携带的石头）。 */
  grantManaToUnit(unit, amount) {
    return this.awardMana(unit, amount);
  }

  // ---- 效果同步 ----

  /** 单位当前生效的石头列表（每个附魔名取第一块），顺序稳定。 */
  activeStones(unit) {
    return [...this.activeStonesForUnit(unit).values()];
  }

  /**
   * 把石头上的永久成长投影成单位的属性修改器。
   *
   * 这是「石头是唯一持有者」在属性层的落地：修改器的值每次都从石头现算，
   * 单位侧不再保存任何累计值。修改器来源按石头实例区分，因此
   * 卸下一块只移除这一块的贡献，同单位另一块同名石头不受影响。
   */
  applyGrowthModifiers(unit, { stat = 'maxHealth' } = {}) {
    if (!unit?.attributes) return 0;
    const desired = growthModifiersFor(this.activeStones(unit), { stat });
    const tracked = unit.runeGrowthSources instanceof Set
      ? unit.runeGrowthSources
      : new Set();
    // 先撤销不再需要的来源：石头被卸下/掉落/转走后必须立刻停止提供加成。
    tracked.forEach((source) => {
      if (!desired.has(source)) unit.attributes.removeModifiersBySource(source);
    });
    desired.forEach((modifier, source) => {
      // 先删后加：石头成长值变化时同源修改器要整体替换，不能叠加成两份。
      unit.attributes.removeModifiersBySource(source);
      unit.attributes.addModifier({
        stat: modifier.stat,
        type: 'add',
        amount: modifier.amount
      }, source);
    });
    unit.runeGrowthSources = new Set(desired.keys());
    return desired.size;
  }

  /**
   * 击杀产生的永久成长写进石头，再据此刷新持有者的属性。
   * 返回累计后的成长值；找不到石头时返回 null（调用方据此判断"没有持久持有者"）。
   */
  addStoneGrowth(stoneId, amount) {
    const stone = this.stoneById(stoneId);
    if (!stone) return null;
    const total = addGrowth(stone, amount);
    this.writeThrough(stone);
    const holder = this.unitById(stone.location?.unitId);
    if (holder) {
      const before = holder.attributes?.get?.('maxHealth');
      this.applyGrowthModifiers(holder);
      // 方案第 8.3 节：推荐增加上限时不凭空补血；但上限被削减时当前生命要裁剪。
      // 所以这里只在 maxHealth 变小时裁剪，变大时不动当前生命。
      if (Number.isFinite(before) && holder.maxHealth < before) holder.clampToAttributeCaps?.();
      holder.statusUiDirty = true;
    }
    this.markPrivateStateDirty(stone.playerId ?? this.localSlot());
    return total;
  }

  /** 这块石头当前的累计成长（供 UI / 断言读取，不在单位上留副本）。 */
  stoneGrowth(stoneId, field = 'triumphHealthBonus') {
    return growthOf(this.stoneById(stoneId), field);
  }

  /** 把单位的附魔效果与成长修改器一起撤掉（阵亡后立刻生效，不等对象回收）。 */
  clearUnitProjections(unit) {
    if (!unit?.removeBuff) return;
    const managed = unit.runeEnchantmentIds instanceof Set ? unit.runeEnchantmentIds : new Set();
    managed.forEach((id) => unit.removeBuff(id));
    unit.runeEnchantmentIds = new Set();
    this.applyGrowthModifiers(unit);
  }

  /**
   * 让单位身上的附魔与背包内容一致。
   * 只管理由符文石施加的附魔（unit.runeEnchantmentIds），不会误删其他系统挂上的 Buff。
   * 同名石头只让格子最前的一块生效，备用石留在背包里不提供效果（但仍会参与魔力均分）。
   */
  syncUnitEnchantments(unit) {
    if (!unit?.addBuff || unit?.alive === false) return;
    const desired = this.activeStonesForUnit(unit);

    const managed = unit.runeEnchantmentIds instanceof Set
      ? unit.runeEnchantmentIds
      : new Set();
    managed.forEach((id) => {
      if (!desired.has(id)) unit.removeBuff(id);
    });

    const nextManaged = new Set();
    desired.forEach((stone, enchantmentId) => {
      const definition = runeEnchantmentDefinition(enchantmentId);
      unit.addBuff(enchantmentId, definition, {
        level: Math.max(1, Math.floor(stone.level)),
        absoluteLevel: true,
        ignoreEnchantmentSlots: true,
        runeStoneId: stone.id,
        sourceCard: stone.sourceCardId ?? null
      });
      nextManaged.add(enchantmentId);
    });
    unit.runeEnchantmentIds = nextManaged;
    // 成长修改器在附魔之后同步：凯旋这类 Buff 的累计值现在就长在石头上，
    // 属性层的投影是它唯一的出口。
    this.applyGrowthModifiers(unit);
    unit.statusUiDirty = true;
  }

  // ---- 阵亡掉落与拾取（方案第 7 节） ----

  /**
   * 单位阵亡：背包里的石头离开格子，作为可拾取物品返回给掉落系统。
   *
   * 石头本体不离开 `this.stones`（还是同一块），只是位置变成 `ground`，
   * 所以等级、魔力经验与累计成长天然保留，不存在"再来一份"的可能。
   * 背包里剩下的普通物品由 `planDeathDrop` 照常结算（见 Game.dropUnitBelongingsOnDeath）。
   */
  detachStonesOnDeath(unit, { x = null, z = null, dropId = null } = {}) {
    if (!unit) return [];
    const inventory = this.inventoryForUnit(unit);
    if (!inventory) return [];
    const px = Number.isFinite(x) ? x : (unit.position?.x ?? 0);
    const pz = Number.isFinite(z) ? z : (unit.position?.z ?? 0);
    const fallenName = unit.name ?? unit.definition?.name ?? unit.type ?? null;
    const location = {
      kind: RUNE_LOCATION_UNIT,
      unitId: String(unit.id)
    };

    const stacks = [];
    inventory.slots.forEach((slot, index) => {
      const stone = this.stoneForSlot(slot, location);
      if (!stone) return;
      inventory.slots[index] = null;
      stone.location = {
        kind: RUNE_LOCATION_GROUND,
        x: px,
        z: pz,
        dropId: dropId != null ? String(dropId) : null,
        fallenUnitId: String(unit.id),
        fallenUnitName: fallenName != null ? String(fallenName) : null
      };
      stacks.push({
        itemId: RUNE_STONE_ITEM_ID,
        count: 1,
        instanceId: stone.id,
        data: stoneItemData(stone)
      });
    });

    if (!stacks.length) return [];
    // 立刻撤掉单位身上的附魔与成长：不允许"已经掉在地上的石头还在给原单位加成"。
    this.clearUnitProjections(unit);
    this.markPrivateStateDirty(unit.controllerPlayerId ?? unit.ownerPlayerId ?? this.localSlot());
    return stacks;
  }

  /**
   * 拾取一块掉落的石头：把同一实例放回拾取者背包。
   *
   * 背包已满时返回 `{ ok: false, reason: UNIT_FULL }`，让掉落物留在原地——
   * 不允许静默销毁，也不允许在别处再造一块。
   */
  pickUpStone(stoneId, unit, data = null) {
    const id = stoneId != null ? String(stoneId) : null;
    if (!id) return { ok: false, reason: RUNE_ERROR.UNKNOWN_STONE };
    if (!unit?.id || unit.alive === false) return { ok: false, reason: RUNE_ERROR.UNKNOWN_UNIT };

    let stone = this.stones.get(id) ?? null;
    if (!stone) {
      // 存档 / 联机快照可能只留下物品数据：按同一个 instanceId 复原，绝不新发一块。
      stone = normalizeRuneStone({
        ...(data ?? {}),
        id,
        playerId: data?.playerId ?? this.localSlot(),
        location: { kind: RUNE_LOCATION_GROUND }
      });
      if (!stone) return { ok: false, reason: RUNE_ERROR.UNKNOWN_STONE };
      this.stones.set(stone.id, stone);
      this.bumpNextId(stone.id);
      this.orderCounter = Math.max(this.orderCounter, stone.order + 1);
    }

    const inventory = this.ensureInventoryForUnit(unit);
    if (!inventory) return { ok: false, reason: RUNE_ERROR.UNKNOWN_UNIT };

    // 石头本来就住在某个背包里（基地背包、另一个单位，或旧存档的幽灵位置）。
    // "拾取"在这种模型下就是**搬运**，不是凭空再放一份：
    // 先从原处取出，再放进拾取者背包；放不进去要原样放回，不能把石头弄丢。
    const holding = this.inventoryHolding(stone.id);
    if (holding && holding.inventory === inventory) {
      // 已经在这个单位身上（重复拾取通知）：什么也不做。
      stone.location = { kind: RUNE_LOCATION_UNIT, unitId: String(unit.id) };
      return { ok: true, stone, alreadyHeld: true };
    }
    if (inventory.freeSlots() <= 0) {
      return { ok: false, reason: RUNE_ERROR.UNIT_FULL };
    }

    let carried = null;
    if (holding) {
      carried = holding.inventory.slots[holding.index];
      holding.inventory.slots[holding.index] = null;
    }
    const added = inventory.add(RUNE_STONE_ITEM_ID, 1, {
      instanceIds: [stone.id],
      data: stoneItemData(stone)
    });
    if (!added?.ok) {
      // 放不回去就等于把石头从原背包里抹掉了，必须回滚。
      if (holding) holding.inventory.slots[holding.index] = carried;
      return { ok: false, reason: RUNE_ERROR.UNIT_FULL };
    }

    // 归属不在这里改：石头是谁的，由生成它的那次调用（createStone / createFromCard）决定。
    // 单位身上的 ownerPlayerId / controllerPlayerId 属于卡牌系统那套 id 空间，
    // 和符文系统用的 slot 不是同一个命名空间（本地单机实测是 'p1' vs 'local-player'），
    // 拿它覆盖的后果是这块石头当场从玩家自己的背包 UI 里消失。
    // 跨玩家拾取的归属规则在方案第 7 节里仍是待定项，所以这里保持原归属，不静默转移。
    stone.location = { kind: RUNE_LOCATION_UNIT, unitId: String(unit.id) };
    // 原持有者也要重算：石头从它身上搬走了，附魔与最大魔力都得跟着掉。
    if (holding?.unit) {
      this.syncUnitEnchantments(holding.unit);
      this.game?.onUnitBackpackChanged?.(holding.unit);
    }
    this.syncUnitEnchantments(unit);
    this.game?.onUnitBackpackChanged?.(unit);
    this.markPrivateStateDirty(stone.playerId ?? this.localSlot());
    return { ok: true, stone };
  }

  /** 掉落物被销毁时断开石头与它的关联，避免留下"地上还有块石头"的幽灵引用。 */
  forgetGroundStones(dropId) {
    if (dropId == null) return 0;
    const key = String(dropId);
    let count = 0;
    this.stones.forEach((stone) => {
      if (stone.location?.kind !== RUNE_LOCATION_GROUND) return;
      if (String(stone.location.dropId ?? '') !== key) return;
      stone.location = {
        ...stone.location,
        dropId: null
      };
      count += 1;
    });
    return count;
  }

  // ---- 联机 / 存档 ----

  markPrivateStateDirty(slot) {
    this.game?.networkBridge?.markPrivateStateDirty?.(slot ?? this.localSlot());
  }

  serializeForSlot(playerId = this.localSlot()) {
    this.discoverAll();
    return {
      stones: this.allStones({ playerId })
        .filter((stone) => stone.playerId === playerId)
        .map(serializeRuneStone)
    };
  }

  /** 客户端镜像：整体替换本地玩家的石头（Host 权威，客户端不自行推演）。 */
  applyNetworkSnapshot(rows = []) {
    const list = Array.isArray(rows) ? rows : [];
    const playerId = this.localSlot();
    const inventory = this.baseInventory();
    const removed = new Set(
      [...this.stones.values()].filter((stone) => stone.playerId === playerId).map((stone) => stone.id)
    );
    if (inventory) {
      inventory.slots.forEach((slot, index) => {
        if (slot?.itemId !== RUNE_STONE_ITEM_ID) return;
        if (removed.has(String(slot.instanceId))) inventory.slots[index] = null;
      });
    }
    removed.forEach((id) => this.stones.delete(id));

    list.forEach((row) => {
      const stone = normalizeRuneStone({ ...row, playerId: row?.playerId ?? playerId });
      if (!stone) return;
      this.stones.set(stone.id, stone);
      this.bumpNextId(stone.id);
      this.orderCounter = Math.max(this.orderCounter, stone.order + 1);
      if (stone.location.kind === RUNE_LOCATION_BASE && inventory) {
        inventory.add(RUNE_STONE_ITEM_ID, 1, {
          instanceIds: [stone.id],
          data: stoneItemData(stone)
        });
      }
    });
  }

  // ---- 展示辅助 ----

  describeStone(stone) {
    if (!stone) return '';
    const name = runeDisplayName(stone.enchantmentId);
    const need = manaThresholdForLevel(stone.level);
    const progress = Number.isFinite(need)
      ? ` · 魔力 ${Math.floor(stone.mana)}/${need}`
      : ' · 已满级';
    return `${name} Lv.${stone.level}${progress}`;
  }

  stoneColor(stone) {
    return runeColor(stone?.enchantmentId);
  }
}
