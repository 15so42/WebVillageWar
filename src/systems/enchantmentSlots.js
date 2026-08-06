export function enchantmentIdForCard(card) {
  return card?.effect?.buffId ?? card?.enchantmentId ?? null;
}

export function isEnchantmentSlotFull(target, enchantmentId) {
  if (!target || !enchantmentId) return false;
  if (target.enchantments?.has?.(enchantmentId)) return false;
  const usedSlots = Math.max(0, Number(target.enchantments?.size) || 0);
  const maxSlots = Math.max(0, Math.floor(target.maxEnchantmentSlots ?? 5));
  return usedSlots >= maxSlots;
}

export function isEnchantmentCardBlocked(card, target) {
  if (card?.kind !== 'enchant') return false;
  return isEnchantmentSlotFull(target, enchantmentIdForCard(card));
}
