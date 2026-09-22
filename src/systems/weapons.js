// 武器换装的纯规则（方案第 6.2 节）。
//
// 方案原文：「战斗单位可装备附魔石，**武器只能换成同类武器**」，
// 并要求「同类武器用配置标识如 `weaponFamily` 校验，不依赖物品名称字符串」、
// 「换武器时保留兵种身份，**检查攻击动画、投射物、射程、攻击事件和耐力参数兼容，
// 不能只改模型**」。
//
// 所以"能不能装"由四件事共同决定，缺一不可：
//   1. family 相同（剑只能换剑）
//   2. attackRange 一致（近战武器不能塞给弓手）
//   3. projectileType 一致（有无投射物、什么投射物要对得上）
//   4. attackAnimation 一致（攻击动作不能对不上）
// 只有伤害、耐久、耐力消耗、攻速允许不同——这几项不影响动作与投射物。
//
// 这个模块不碰 THREE / DOM / Game，所以"跨族被拒""射程不一致被拒"这些
// 可以单独断言，不必开游戏。
import { ITEM_DEFINITIONS, UNIT_DEFINITIONS } from '../data/gameData.js';

export const WEAPON_ERROR = {
  none: 'none',
  notAWeapon: 'not_a_weapon',
  unknownItem: 'unknown_item',
  notEquippable: 'not_equippable',
  familyMismatch: 'family_mismatch',
  rangeMismatch: 'range_mismatch',
  projectileMismatch: 'projectile_mismatch',
  animationMismatch: 'animation_mismatch',
  noBag: 'no_bag',
  notInBag: 'not_in_bag',
  noSpaceForOldWeapon: 'no_space_for_old_weapon',
  alreadyEquipped: 'already_equipped'
};

export const WEAPON_ERROR_LABELS = {
  [WEAPON_ERROR.notAWeapon]: '这件东西不是武器',
  [WEAPON_ERROR.unknownItem]: '没有这件物品',
  [WEAPON_ERROR.notEquippable]: '这个单位不能用武器',
  [WEAPON_ERROR.familyMismatch]: '武器类型不匹配（只能换成同类武器）',
  [WEAPON_ERROR.rangeMismatch]: '攻击距离不匹配',
  [WEAPON_ERROR.projectileMismatch]: '投射方式不匹配',
  [WEAPON_ERROR.animationMismatch]: '攻击动作不匹配',
  [WEAPON_ERROR.noBag]: '这个单位没有物品背包',
  [WEAPON_ERROR.notInBag]: '背包里没有这件武器',
  [WEAPON_ERROR.noSpaceForOldWeapon]: '背包放不下换下来的武器',
  [WEAPON_ERROR.alreadyEquipped]: '已经装备着这件武器'
};

const RANGE_EPSILON = 1e-6;

/** 把物品定义里的 weapon 块规范化；不是武器就返回 null。 */
export function normalizeWeapon(definition) {
  if (!definition?.weapon?.family) return null;
  const weapon = definition.weapon;
  return {
    itemId: definition.id != null ? String(definition.id) : null,
    name: definition.name != null ? String(definition.name) : String(definition.id ?? ''),
    family: String(weapon.family),
    attackRange: Number.isFinite(Number(weapon.profile?.attackRange))
      ? Number(weapon.profile.attackRange)
      : null,
    projectileType: weapon.profile?.projectileType ?? null,
    attackAnimation: weapon.profile?.attackAnimation != null
      ? String(weapon.profile.attackAnimation)
      : null,
    damage: Math.max(0, Number(weapon.damage) || 0),
    damageType: weapon.damageType === 'magic' ? 'magic' : 'physical',
    maxDurability: Math.max(1, Number(weapon.maxDurability) || 1),
    durabilityCost: Math.max(0, Number(weapon.durabilityCost) || 0),
    attackRate: Number.isFinite(Number(weapon.attackRate)) ? Number(weapon.attackRate) : null,
    defaultFor: weapon.defaultFor != null ? String(weapon.defaultFor) : null
  };
}

export function weaponItem(itemId) {
  return normalizeWeapon(ITEM_DEFINITIONS[itemId]);
}

export function isWeaponItem(itemId) {
  return Boolean(ITEM_DEFINITIONS[itemId]?.weapon?.family);
}

/** 单位当前的武器情况（家族 + 动作档位），完全来自它的定义。 */
export function unitWeaponProfile(unitOrType) {
  const type = typeof unitOrType === 'string' ? unitOrType : unitOrType?.type;
  const definition = UNIT_DEFINITIONS[type];
  if (!definition) return null;
  const family = definition.weapon?.family;
  if (!family) return null;
  const art = definition.art ?? {};
  return {
    unitType: type,
    family: String(family),
    attackRange: Number.isFinite(Number(definition.attackRange)) ? Number(definition.attackRange) : null,
    // 单位的投射物类型取自定义；没有就是纯近战
    projectileType: definition.projectileType ?? null,
    attackAnimation: art.clips?.attack != null ? String(art.clips.attack) : null
  };
}

/** 该家族"原配武器"的物化物品 id（换下原配武器时用它放回背包）。 */
export function baselineWeaponItemFor(family) {
  if (!family) return null;
  const found = Object.values(ITEM_DEFINITIONS)
    .map(normalizeWeapon)
    .find((weapon) => weapon?.family === String(family) && weapon.defaultFor);
  return found?.itemId ?? null;
}

/**
 * 能不能把这件武器装到这个单位身上。返回 `{ ok, reason, label }`，
 * `label` 可以直接显示给玩家——"装不上"必须说清是哪一项不匹配。
 */
export function canEquipWeapon(itemId, unit) {
  const definition = ITEM_DEFINITIONS[itemId];
  if (!definition) return { ok: false, reason: WEAPON_ERROR.unknownItem, label: WEAPON_ERROR_LABELS[WEAPON_ERROR.unknownItem] };
  const weapon = normalizeWeapon(definition);
  if (!weapon) return { ok: false, reason: WEAPON_ERROR.notAWeapon, label: WEAPON_ERROR_LABELS[WEAPON_ERROR.notAWeapon] };
  const profile = unitWeaponProfile(unit);
  if (!profile) return { ok: false, reason: WEAPON_ERROR.notEquippable, label: WEAPON_ERROR_LABELS[WEAPON_ERROR.notEquippable] };
  if (weapon.family !== profile.family) {
    return { ok: false, reason: WEAPON_ERROR.familyMismatch, label: WEAPON_ERROR_LABELS[WEAPON_ERROR.familyMismatch] };
  }
  if (weapon.attackRange == null || profile.attackRange == null
    || Math.abs(weapon.attackRange - profile.attackRange) > RANGE_EPSILON) {
    return { ok: false, reason: WEAPON_ERROR.rangeMismatch, label: WEAPON_ERROR_LABELS[WEAPON_ERROR.rangeMismatch] };
  }
  if ((weapon.projectileType ?? null) !== (profile.projectileType ?? null)) {
    return { ok: false, reason: WEAPON_ERROR.projectileMismatch, label: WEAPON_ERROR_LABELS[WEAPON_ERROR.projectileMismatch] };
  }
  if ((weapon.attackAnimation ?? null) !== (profile.attackAnimation ?? null)) {
    return { ok: false, reason: WEAPON_ERROR.animationMismatch, label: WEAPON_ERROR_LABELS[WEAPON_ERROR.animationMismatch] };
  }
  return { ok: true, reason: WEAPON_ERROR.none, label: '', weapon };
}

/**
 * 换装后的属性变化。纯计算，不改任何东西——调用方拿到结果再一次性应用，
 * 这样"扣了新的、旧的没还回去"这种半成品状态无从发生。
 */
export function weaponStatPatch(itemId) {
  const weapon = weaponItem(itemId);
  if (!weapon) return null;
  return {
    damage: weapon.damage,
    damageType: weapon.damageType,
    maxDurability: weapon.maxDurability,
    durabilityCost: weapon.durabilityCost,
    attackRate: weapon.attackRate,
    name: weapon.name
  };
}
