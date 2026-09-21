import { BALANCE, BUFF_DEFINITIONS, ENCHANTMENTS } from '../data/gameData.js';

/**
 * 符文石的纯数据层。
 *
 * 附魔卡使用后不再直接给单位挂 Buff，而是生成一块「符文石」实例：
 *   { id, enchantmentId, level, mana, paidEnergy, playerId, location, order, sourceCardId }
 * - 石头放在单位背包里即产生原附魔对应的效果，放在基地背包里只是存储。
 * - 石头随时可以转移，永久保留，死亡不掉落。
 * - 等级只由魔力成长，不再通过重复施加同名附魔卡叠加。
 *
 * 本文件只做数值与规范化，不接触 game / THREE；运行时状态在 RuneStoneSystem。
 */

export const RUNE_LOCATION_BASE = 'base';
export const RUNE_LOCATION_UNIT = 'unit';

export function runeConfig() {
  return BALANCE.runes ?? {};
}

export function normalizeRuneLevel(level) {
  const value = Math.floor(Number(level));
  if (!Number.isFinite(value)) return 1;
  return Math.min(runeMaxLevel(), Math.max(1, value));
}

export function runeMaxLevel() {
  return Math.max(1, Math.floor(Number(runeConfig().maxLevel ?? 10)));
}

/** 单位符文背包容量：沿用原附魔槽位上限，允许单位自身被强化过。 */
export function unitRuneCapacity(unit) {
  const config = runeConfig();
  const fallback = Math.max(0, Math.floor(Number(config.unitCapacity ?? 5)));
  const value = Math.floor(Number(unit?.maxEnchantmentSlots ?? fallback));
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export function baseRuneCapacity() {
  return Math.max(0, Math.floor(Number(runeConfig().baseCapacity ?? 24)));
}

/** 附魔数据：ENCHANTMENTS 是 BUFF_DEFINITIONS 的别名子集，兜底再查一次。 */
export function runeEnchantmentDefinition(enchantmentId) {
  if (!enchantmentId) return null;
  return ENCHANTMENTS[enchantmentId] ?? BUFF_DEFINITIONS[enchantmentId] ?? null;
}

export function runeDisplayName(enchantmentId) {
  return runeEnchantmentDefinition(enchantmentId)?.name ?? String(enchantmentId ?? '符文石');
}

export function runeColor(enchantmentId) {
  return runeEnchantmentDefinition(enchantmentId)?.color ?? '#b78cff';
}

/** 从 1 级升到 2 级所需魔力是索引 0，满级返回 Infinity。 */
export function manaThresholdForLevel(level) {
  const curve = runeConfig().manaPerLevel ?? [];
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  if (safeLevel >= runeMaxLevel()) return Infinity;
  const value = Number(curve[safeLevel - 1]);
  return Number.isFinite(value) ? Math.max(0, value) : Infinity;
}

export function manaProgressForStone(stone) {
  const level = normalizeRuneLevel(stone?.level);
  const need = manaThresholdForLevel(level);
  const have = Math.max(0, Number(stone?.mana) || 0);
  if (!Number.isFinite(need)) return { have: 0, need: 0, ratio: 1 };
  return { have, need, ratio: need > 0 ? Math.min(1, have / need) : 1 };
}

/**
 * 把 mana 点魔力记到一块石头上，跨级时连续扣除阈值。
 * 满级后不再累计进度，避免显示无意义的溢出值。
 */
export function applyManaToStone(stone, mana) {
  const maxLevel = runeMaxLevel();
  let level = normalizeRuneLevel(stone?.level);
  let pool = Math.max(0, Number(stone?.mana) || 0) + Math.max(0, Number(mana) || 0);
  let levelsGained = 0;

  while (level < maxLevel) {
    const need = manaThresholdForLevel(level);
    if (!Number.isFinite(need) || pool < need) break;
    pool -= need;
    level += 1;
    levelsGained += 1;
  }
  if (level >= maxLevel) pool = 0;

  return { level, mana: pool, levelsGained };
}

/**
 * 均分魔力：携带 K 块石头时每块分得 M / K，不能每块都拿满 M。
 * 最后一块吸收浮点余数，保证分配总量与原值严格一致，不凭空增减。
 */
export function splitManaEvenly(total, count) {
  const parts = Math.max(0, Math.floor(Number(count) || 0));
  const amount = Number(total);
  if (parts <= 0 || !Number.isFinite(amount) || amount === 0) return [];
  const share = amount / parts;
  const shares = new Array(parts - 1).fill(share);
  shares.push(amount - share * (parts - 1));
  return shares;
}

/** 能量保留两位小数：允许 1.6 这类小数返还，同时避免浮点噪声反复套利。 */
export function roundEnergy(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

/**
 * 售价 = 生成该石头时实际支付的能量 × 比例 + 等级溢价。
 * 等级每提升一级额外加价（sellPricePerLevel），练出来的石头更值钱；
 * 等级溢价与实付能量无关，因此实付为 0 的石头只要练过级也卖得出价钱。
 */
export function runeSellValue(stone, options = {}) {
  const config = runeConfig();
  const ratio = Number.isFinite(Number(options.ratio))
    ? Math.max(0, Number(options.ratio))
    : Math.max(0, Number(config.sellRefundRatio ?? 0.8));
  const perLevel = Number.isFinite(Number(options.pricePerLevel))
    ? Math.max(0, Number(options.pricePerLevel))
    : Math.max(0, Number(config.sellPricePerLevel ?? 0));
  const paid = Math.max(0, Number(stone?.paidEnergy) || 0);
  const level = normalizeRuneLevel(stone?.level);
  return roundEnergy(paid * ratio + Math.max(0, level - 1) * perLevel);
}

/** 附魔卡等级决定新石头的初始等级（可配置；关闭时一律 1 级）。 */
export function initialRuneLevelForCard(card) {
  if (runeConfig().initialLevelFromCard === false) return 1;
  return normalizeRuneLevel(Math.max(1, Math.floor(Number(card?.level) || 1)));
}

export function runeEnchantmentIdForCard(card) {
  return card?.enchantmentId ?? card?.effect?.buffId ?? null;
}

export function normalizeRuneStone(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const enchantmentId = raw.enchantmentId;
  if (!enchantmentId) return null;
  const id = raw.id != null ? String(raw.id) : null;
  if (!id) return null;
  const locationKind = raw.location?.kind === RUNE_LOCATION_UNIT
    ? RUNE_LOCATION_UNIT
    : RUNE_LOCATION_BASE;
  const unitId = locationKind === RUNE_LOCATION_UNIT
    ? (raw.location?.unitId != null ? String(raw.location.unitId) : null)
    : null;
  return {
    id,
    enchantmentId: String(enchantmentId),
    level: normalizeRuneLevel(raw.level),
    mana: Math.max(0, Number(raw.mana) || 0),
    paidEnergy: roundEnergy(Math.max(0, Number(raw.paidEnergy) || 0)),
    playerId: raw.playerId != null ? String(raw.playerId) : null,
    sourceCardId: raw.sourceCardId != null ? String(raw.sourceCardId) : null,
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0,
    location: unitId
      ? { kind: RUNE_LOCATION_UNIT, unitId }
      : { kind: RUNE_LOCATION_BASE, unitId: null }
  };
}

/** 网络与存档只需这几个字段；Map/Set 不能直接 JSON 化。 */
export function serializeRuneStone(stone) {
  return {
    id: stone.id,
    enchantmentId: stone.enchantmentId,
    level: normalizeRuneLevel(stone.level),
    mana: Math.max(0, Number(stone.mana) || 0),
    paidEnergy: roundEnergy(Math.max(0, Number(stone.paidEnergy) || 0)),
    playerId: stone.playerId ?? null,
    sourceCardId: stone.sourceCardId ?? null,
    order: Number(stone.order) || 0,
    location: stone.location?.kind === RUNE_LOCATION_UNIT
      ? { kind: RUNE_LOCATION_UNIT, unitId: String(stone.location.unitId) }
      : { kind: RUNE_LOCATION_BASE, unitId: null }
  };
}

export function serializeRuneStones(stones = []) {
  return (Array.isArray(stones) ? stones : []).map(serializeRuneStone);
}
