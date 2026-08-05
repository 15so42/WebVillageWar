export function rollOverflowChance(chance, random = Math.random) {
  const normalizedChance = Number.isFinite(chance) ? Math.max(0, chance) : 0;
  const guaranteedSuccesses = Math.floor(normalizedChance);
  const remainder = normalizedChance - guaranteedSuccesses;
  return guaranteedSuccesses + (remainder > 0 && random() < remainder ? 1 : 0);
}
