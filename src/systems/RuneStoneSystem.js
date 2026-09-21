import {
  RUNE_LOCATION_BASE,
  RUNE_LOCATION_UNIT,
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
  unitRuneCapacity
} from './runeStones.js';

/**
 * 符文石背包的运行时权威。
 *
 * 规则（对应 docs/RUNE_STONE_GAMEPLAY_PLAN.md 第 3～4 节）：
 * - 附魔卡使用一次即消耗，并在基地背包或目标单位背包里生成一块石头。
 * - 石头放在单位背包即生效；同名石头同一单位只能带一块。
 * - 石头随时可转移，不限制地点、不限制交战状态。
 * - 死亡不掉落、不自动回基地：石头继续留在原单位背包，数据不随单位对象回收而丢失。
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
    /** 阵亡后仍保留背包的单位档案：unitId → { unitId, unitType, name, playerId }。 */
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

  /** 阵亡单位留下的背包：石头仍在原单位，玩家可手动把它们收回基地。 */
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
    unit.statusUiDirty = true;
  }

  /** 单位阵亡：石头留在原背包，不掉落、不自动回基地、不销毁。 */
  handleUnitDeath(unit) {
    if (!unit) return;
    const stones = this.stonesForUnit(unit);
    if (!stones.length) return;
    const record = {
      unitId: String(unit.id),
      unitType: unit.type,
      name: unit.name ?? unit.definition?.name ?? unit.type,
      playerId: unit.controllerPlayerId ?? unit.ownerPlayerId ?? this.localSlot()
    };
    this.strandedUnits.set(record.unitId, record);
  }

  /** 重生会创建全新的单位对象，需要把原背包引到新单位上，避免复制出一套石头。 */
  reassignUnitStones(previousUnitId, unit) {
    if (previousUnitId == null || !unit) return 0;
    const key = String(previousUnitId);
    const stones = this.unitStones(key);
    if (!stones.length) return 0;
    const placed = [];
    stones.forEach((stone) => {
      const check = this.canPlaceInUnit(unit, stone.enchantmentId);
      if (!check.ok) return;
      stone.location = { kind: RUNE_LOCATION_UNIT, unitId: String(unit.id) };
      placed.push(stone);
    });
    this.strandedUnits.delete(key);
    this.syncUnitEnchantments(unit);
    return placed.length;
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
