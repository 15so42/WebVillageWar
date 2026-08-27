export const FREE_ENCHANTMENT_INTERVAL_SECONDS = 60;
export const FREE_ENCHANTMENT_MAX_CHARGES = 4;
export const FREE_ENCHANTMENT_HINT_INTERVAL_SECONDS = 5;

export function normalizeFreeEnchantmentCharges(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(FREE_ENCHANTMENT_MAX_CHARGES, Math.floor(number)));
}

export function advanceFreeEnchantmentState(charges, progress, dt) {
  const currentCharges = normalizeFreeEnchantmentCharges(charges);
  if (currentCharges >= FREE_ENCHANTMENT_MAX_CHARGES) {
    return { charges: FREE_ENCHANTMENT_MAX_CHARGES, progress: 0, gained: 0 };
  }

  const elapsed = Math.max(0, Number(progress) || 0) + Math.max(0, Number(dt) || 0);
  const availableGains = Math.floor(elapsed / FREE_ENCHANTMENT_INTERVAL_SECONDS);
  const gained = Math.min(
    FREE_ENCHANTMENT_MAX_CHARGES - currentCharges,
    availableGains
  );
  const nextCharges = currentCharges + gained;
  return {
    charges: nextCharges,
    progress: nextCharges >= FREE_ENCHANTMENT_MAX_CHARGES
      ? 0
      : elapsed - gained * FREE_ENCHANTMENT_INTERVAL_SECONDS,
    gained
  };
}

export function hasFreeEnchantmentCharge(card, unit) {
  return card?.kind === 'enchant'
    && normalizeFreeEnchantmentCharges(unit?.freeEnchantmentCharges) > 0;
}

export function consumeFreeEnchantmentCharge(card, unit) {
  if (!hasFreeEnchantmentCharge(card, unit)) return false;
  unit.freeEnchantmentCharges = normalizeFreeEnchantmentCharges(unit.freeEnchantmentCharges) - 1;
  unit.statusUiDirty = true;
  return true;
}
