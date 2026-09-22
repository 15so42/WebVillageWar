import {
  RUNE_LOCATION_BASE,
  RUNE_LOCATION_GROUND,
  RUNE_LOCATION_UNIT,
  RUNE_STONE_ITEM_ID,
  applyManaToStone,
  baseRuneCapacity,
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
  stoneItemData,
  unitRuneCapacity
} from './runeStones.js';
import { addGrowth, growthModifiersFor, growthOf } from './runeGrowth.js';

/**
 * 符文石背包的运行时权威。
 *
 * 规则（对应 docs/RUNE_STONE_GAMEPLAY_PLAN.md 第 3～4 节、
 * docs/SURVIVAL_LOGISTICS_GAMEPLAY_PLAN.md 第 7～8 节）：
 * - 附魔卡使用一次即消耗，并在基地背包或目标单位背包里生成一块石头。
 * - 石头放在单位背包即生效；同名石头里只有排在最前的一块生效。
 * - 石头随时可转移，不限制地点、不限制交战状态。
 * - **永久成长（growth）记录在石头实例上，不记在单位或 Buff 上**：
 *   石头转到谁身上谁就享受已有成长，不需要重新练。
 * - **单位阵亡时石头落地成为可拾取的遗物包**，等级/经验/成长原样保留；
 *   地面上的石头不给原单位或附近单位继续提供加成。
 * - 等级只由魔力成长；获得魔力时按携带数量均分。
 *
 * 单机时 `players` 为 null，此时石头归属于 `game.localPlayerSlot`。
 * 联机时每名玩家各自拥有自己的石头，转移/出售都由 Host 校验（见 RuneStoneSystem 的校验方法）。
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
  [RUNE_ERROR.UNIT_FULL]: '该单位的符文背包已满',
  [RUNE_ERROR.BASE_FULL]: '基地符文背包已满',
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
    /** 阵亡单位档案：unitId → { unitId, unitType, name, playerId }。
     *  新玩法里石头会在阵亡时落地（`detachStonesOnDeath`），所以这份档案不再
     *  承载"石头留在尸体背包"的语义，仅保留给旧存档的显示兜底。 */
    this.strandedUnits = new Map();
  }

  localSlot() {
    const game = this.game;
    return game?.localPlayerId ?? game?.localPlayerSlot ?? 'local-player';
  }

  cardSystemFor(slot = null) {
    const game = this.game;
    if (!game) return null;
    const target = slot ?? this.localSlot();
    if (game.cardSystems?.[target]) return game.cardSystems[target];
    if (target === this.localSlot()) return game.cardSystem ?? null;
    return null;
  }

  playerSlots() {
    const game = this.game;
    if (typeof game?.coopPlayerSlots === 'function') return game.coopPlayerSlots();
    return [this.localSlot()];
  }

  // ---- 查询 ----

  stoneById(stoneId) {
    if (stoneId == null) return null;
    return this.stones.get(String(stoneId)) ?? null;
  }

  allStones({ playerId = null } = {}) {
    const all = [...this.stones.values()].sort((a, b) => a.order - b.order);
    if (!playerId) return all;
    return all.filter((stone) => stone.playerId === playerId);
  }

  baseStones(playerId = this.localSlot()) {
    return this.allStones({ playerId }).filter((stone) => stone.location.kind === RUNE_LOCATION_BASE);
  }

  unitStones(unitId) {
    if (unitId == null) return [];
    const key = String(unitId);
    return [...this.stones.values()]
      .filter((stone) => stone.location.kind === RUNE_LOCATION_UNIT && stone.location.unitId === key)
      .sort((a, b) => a.order - b.order);
  }

  stonesForUnit(unit) {
    return unit ? this.unitStones(unit.id) : [];
  }

  /** 单位背包里的附魔 id 集合，用于同名校验与效果同步。 */
  enchantmentIdsForUnit(unitId) {
    const ids = new Set();
    this.unitStones(unitId).forEach((stone) => ids.add(stone.enchantmentId));
    return ids;
  }

  /**
   * 同名石头里只有「排在最前的一块」生效（stonesForUnit 已按获得顺序排序）。
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
   * 阵亡单位留下的背包。
   *
   * 新玩法里单位阵亡时石头会立刻落地（见 `detachStonesOnDeath`），所以这个查询
   * 对当前一局只会返回空数组——UI 的那一段会自动隐藏。之所以保留：旧存档里可能
   * 还有 `location.kind === 'unit'` 而单位已不存在的石头，加载后仍然要能看见并收回。
   * 地面上的石头**故意不列在这里**：方案第 7 节把"是否允许远程手动拾取"列为待定，
   * 而这个列表里的石头可以拖拽，等于开了远程拾取的后门。
   */
  strandedBackpacks(playerId = this.localSlot()) {
    const groups = new Map();
    this.allStones({ playerId })
      .filter((stone) => stone.location.kind === RUNE_LOCATION_UNIT)
      .forEach((stone) => {
        const unitId = stone.location.unitId;
        if (this.game?.unitRegistry?.byId?.get?.(Number(unitId))) return;
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
    const stones = this.allStones({ playerId });
    return {
      total: stones.length,
      base: stones.filter((stone) => stone.location.kind === RUNE_LOCATION_BASE).length,
      baseCapacity: baseRuneCapacity(),
      levelSum: stones.reduce((sum, stone) => sum + stone.level, 0)
    };
  }

  // ---- 校验 ----

  /**
   * 同名石头可以放进同一个单位背包：只有排在最前的一块生效，
   * 其余同名石头是「备用石」——不提供效果，但照常吃魔力升级，方便之后转交新单位。
   * 因此这里只校验容量，不再拒绝同名。
   */
  canPlaceInUnit(unit, enchantmentId, { ignoreStoneId = null } = {}) {
    if (!unit) return { ok: false, reason: RUNE_ERROR.UNKNOWN_UNIT };
    const owned = this.unitStones(unit.id)
      .filter((stone) => stone.id !== String(ignoreStoneId ?? ''));
    if (owned.length >= unitRuneCapacity(unit)) {
      return { ok: false, reason: RUNE_ERROR.UNIT_FULL };
    }
    return { ok: true };
  }

  canPlaceInBase(playerId) {
    if (this.baseStones(playerId).length >= baseRuneCapacity()) {
      return { ok: false, reason: RUNE_ERROR.BASE_FULL };
    }
    return { ok: true };
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
    const stone = normalizeRuneStone({
      id: `rune-${this.nextStoneId}`,
      enchantmentId,
      level,
      mana,
      paidEnergy,
      playerId,
      sourceCardId,
      order: this.orderCounter,
      location: location ?? { kind: RUNE_LOCATION_BASE, unitId: null }
    });
    if (!stone) return null;
    this.nextStoneId += 1;
    this.orderCounter += 1;
    this.stones.set(stone.id, stone);
    return stone;
  }

  /**
   * 附魔卡的唯一落点：拖到单位 → 直接进该单位背包；拖到空处 → 进基地背包。
   * paidEnergy 必须传入实际支付的能量，作为后续售价基准。
   */
  createFromCard(card, { playerId = this.localSlot(), targetUnit = null, paidEnergy = 0 } = {}) {
    const enchantmentId = runeEnchantmentIdForCard(card);
    if (!enchantmentId) return { ok: false, reason: RUNE_ERROR.UNKNOWN_STONE };
    const level = initialRuneLevelForCard(card);

    if (targetUnit) {
      const check = this.canPlaceInUnit(targetUnit, enchantmentId);
      if (!check.ok) return { ok: false, reason: check.reason, targetUnit };
      const stone = this.createStone({
        enchantmentId,
        level,
        paidEnergy,
        playerId,
        sourceCardId: card?.id ?? null,
        location: { kind: RUNE_LOCATION_UNIT, unitId: String(targetUnit.id) }
      });
      if (!stone) return { ok: false, reason: RUNE_ERROR.UNKNOWN_STONE };
      this.syncUnitEnchantments(targetUnit);
      return { ok: true, stone, targetUnit, placement: RUNE_LOCATION_UNIT };
    }

    const check = this.canPlaceInBase(playerId);
    if (!check.ok) return { ok: false, reason: check.reason };
    const stone = this.createStone({
      enchantmentId,
      level,
      paidEnergy,
      playerId,
      sourceCardId: card?.id ?? null,
      location: { kind: RUNE_LOCATION_BASE, unitId: null }
    });
    if (!stone) return { ok: false, reason: RUNE_ERROR.UNKNOWN_STONE };
    return { ok: true, stone, targetUnit: null, placement: RUNE_LOCATION_BASE };
  }

  // ---- 转移 ----

  /**
   * 目标形态：
   *   { kind: 'unit', unit }
   *   { kind: 'base', playerId }
   */
  moveStone(stoneId, target, { playerId = this.localSlot() } = {}) {
    const stone = this.stoneById(stoneId);
    if (!stone) return { ok: false, reason: RUNE_ERROR.UNKNOWN_STONE };
    if (stone.playerId !== playerId) return { ok: false, reason: RUNE_ERROR.NOT_OWNED };

    const previousUnit = this.unitForStrandedId(stone.location.unitId);

    if (target?.kind === RUNE_LOCATION_UNIT) {
      const unit = target.unit;
      if (!unit || !unit.alive) return { ok: false, reason: RUNE_ERROR.TARGET_DEAD };
      const check = this.canPlaceInUnit(unit, stone.enchantmentId, { ignoreStoneId: stone.id });
      if (!check.ok) return { ok: false, reason: check.reason };
      stone.location = { kind: RUNE_LOCATION_UNIT, unitId: String(unit.id) };
      this.syncUnitEnchantments(unit);
    } else {
      const check = this.canPlaceInBase(playerId);
      if (!check.ok) return { ok: false, reason: check.reason };
      stone.location = { kind: RUNE_LOCATION_BASE, unitId: null };
    }

    if (previousUnit && previousUnit !== target?.unit) this.syncUnitEnchantments(previousUnit);
    this.markPrivateStateDirty(playerId);
    return { ok: true, stone };
  }

  unitForStrandedId(unitId) {
    if (unitId == null) return null;
    const units = [
      ...(this.game?.friendlyUnits ?? []),
      ...(this.game?.enemyUnits ?? [])
    ];
    return units.find((unit) => String(unit.id) === String(unitId) && unit.alive) ?? null;
  }

  // ---- 出售 ----

  /** 售价 = 生成时实际支付能量 × 比例；练级不提高售价。出售只销毁这一块实例。 */
  sellStone(stoneId, { playerId = this.localSlot() } = {}) {
    const stone = this.stoneById(stoneId);
    if (!stone) return { ok: false, reason: RUNE_ERROR.UNKNOWN_STONE };
    if (stone.playerId !== playerId) return { ok: false, reason: RUNE_ERROR.NOT_OWNED };

    const previousUnit = this.unitForStrandedId(stone.location.unitId);
    const refund = runeSellValue(stone);

    this.stones.delete(stone.id);
    if (previousUnit) this.syncUnitEnchantments(previousUnit);
    if (refund > 0) this.cardSystemFor(playerId)?.addEnergy?.(refund);
    this.markPrivateStateDirty(playerId);
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
    const holder = this.unitForStrandedId(stone.location?.unitId);
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
   * 同名石头只让第一块生效，备用石留在背包里不提供效果（但仍会参与魔力均分）。
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
   * 单位阵亡：石头离开单位，作为可拾取物品返回给掉落系统。
   *
   * 石头本体不离开 `this.stones`（还是同一块），只是位置变成 `ground`，
   * 所以等级、魔力经验与累计成长天然保留，不存在"再来一份"的可能。
   */
  detachStonesOnDeath(unit, { x = null, z = null, dropId = null } = {}) {
    if (!unit) return [];
    const stones = this.stonesForUnit(unit);
    if (!stones.length) return [];
    const px = Number.isFinite(x) ? x : (unit.position?.x ?? 0);
    const pz = Number.isFinite(z) ? z : (unit.position?.z ?? 0);
    const fallenName = unit.name ?? unit.definition?.name ?? unit.type ?? null;
    const stacks = stones.map((stone) => {
      stone.location = {
        kind: RUNE_LOCATION_GROUND,
        x: px,
        z: pz,
        dropId: dropId != null ? String(dropId) : null,
        fallenUnitId: String(unit.id),
        fallenUnitName: fallenName != null ? String(fallenName) : null
      };
      return {
        itemId: RUNE_STONE_ITEM_ID,
        count: 1,
        instanceId: stone.id,
        data: stoneItemData(stone)
      };
    });
    // 立刻撤掉单位身上的附魔与成长：不允许"已经掉在地上的石头还在给原单位加成"。
    this.clearUnitProjections(unit);
    this.markPrivateStateDirty(unit.controllerPlayerId ?? unit.ownerPlayerId ?? this.localSlot());
    return stacks;
  }

  /**
   * 拾取一块掉落的石头：把同一实例挂回拾取者背包。
   *
   * 背包已满时返回 `{ ok: false, reason: UNIT_FULL }`，让掉落物留在原地——
   * 不允许静默销毁，也不允许在别处再造一块。
   */
  pickUpStone(stoneId, unit, data = null) {
    const id = stoneId != null ? String(stoneId) : null;
    if (!id) return { ok: false, reason: RUNE_ERROR.UNKNOWN_STONE };
    if (!unit?.id || unit.alive === false) return { ok: false, reason: RUNE_ERROR.UNKNOWN_UNIT };

    let stone = this.stoneById(id);
    if (!stone) {
      // 存档 / 联机快照可能只留下物品数据：按同一个 instanceId 复原，绝不新发一块。
      stone = normalizeRuneStone({
        ...(data ?? {}),
        id,
        location: { kind: RUNE_LOCATION_UNIT, unitId: String(unit.id) }
      });
      if (!stone) return { ok: false, reason: RUNE_ERROR.UNKNOWN_STONE };
      this.stones.set(stone.id, stone);
      const numeric = Number(String(stone.id).replace(/[^0-9]/g, ''));
      if (Number.isFinite(numeric)) this.nextStoneId = Math.max(this.nextStoneId, numeric + 1);
      this.orderCounter = Math.max(this.orderCounter, stone.order + 1);
    }

    const check = this.canPlaceInUnit(unit, stone.enchantmentId, { ignoreStoneId: stone.id });
    if (!check.ok) return { ok: false, reason: check.reason };

    // 归属不在这里改：石头是谁的，由生成它的那次调用（createStone / createFromCard）决定。
    // 单位身上的 ownerPlayerId / controllerPlayerId 属于卡牌系统那套 id 空间，
    // 和符文系统用的 slot 不是同一个命名空间（本地单机实测是 'p1' vs 'local-player'），
    // 拿它覆盖的后果是这块石头当场从玩家自己的符文背包 UI 里消失。
    // 跨玩家拾取的归属规则在方案第 7 节里仍是待定项，所以这里保持原归属，不静默转移。
    stone.location = { kind: RUNE_LOCATION_UNIT, unitId: String(unit.id) };
    this.syncUnitEnchantments(unit);
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
    [...this.stones.values()]
      .filter((stone) => stone.playerId === playerId)
      .forEach((stone) => this.stones.delete(stone.id));
    list.forEach((row) => {
      const stone = normalizeRuneStone({ ...row, playerId: row?.playerId ?? playerId });
      if (!stone) return;
      this.stones.set(stone.id, stone);
      const numeric = Number(String(stone.id).replace(/[^0-9]/g, ''));
      if (Number.isFinite(numeric)) this.nextStoneId = Math.max(this.nextStoneId, numeric + 1);
      this.orderCounter = Math.max(this.orderCounter, stone.order + 1);
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
