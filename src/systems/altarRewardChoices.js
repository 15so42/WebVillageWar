export function pickAltarSpecializationChoices(
  choices,
  ownedUnitTypes,
  count = 3,
  random = Math.random
) {
  const limit = Math.max(0, Math.floor(count));
  if (!limit || !Array.isArray(choices) || !choices.length) return [];

  const owned = ownedUnitTypes instanceof Set
    ? ownedUnitTypes
    : new Set(ownedUnitTypes ?? []);
  const preferred = [];
  const fallback = [];
  choices.forEach((choice) => {
    if (owned.has(choice?.unitType)) preferred.push(choice);
    else fallback.push(choice);
  });

  const selected = takeRandom(preferred, limit, random);
  if (selected.length < limit) {
    selected.push(...takeRandom(fallback, limit - selected.length, random));
  }
  return shuffle(selected, random);
}

function takeRandom(items, count, random) {
  return shuffle(items, random).slice(0, Math.min(count, items.length));
}

function shuffle(items, random) {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const value = Number(random?.());
    const normalized = Number.isFinite(value)
      ? Math.min(0.999999999, Math.max(0, value))
      : Math.random();
    const swapIndex = Math.floor(normalized * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool;
}
