const DEFAULT_MIN_VALUE = 0;

export class AttributeSet {
  constructor(baseValues = {}) {
    this.values = new Map();
    Object.entries(baseValues).forEach(([name, value]) => {
      this.setBase(name, value);
    });
  }

  setBase(name, baseValue, options = {}) {
    const entry = this.ensureEntry(name);
    entry.base = toFiniteNumber(baseValue, 0);
    entry.min = options.min ?? entry.min ?? DEFAULT_MIN_VALUE;
    entry.max = options.max ?? entry.max ?? Number.POSITIVE_INFINITY;
    return entry;
  }

  addModifier(modifier, source = modifier.source ?? 'runtime', context = {}) {
    if (!modifier?.stat) return null;
    const entry = this.ensureEntry(modifier.stat);
    const type = modifierType(modifier);
    const normalized = {
      ...modifier,
      id: modifier.id ?? `${source}:${modifier.stat}:${type}:${entry[type].length}`,
      source,
      level: modifier.level ?? context.level ?? 1
    };
    entry[type].push(normalized);
    return normalized.id;
  }

  addModifiers(modifiers = [], source = 'runtime', context = {}) {
    return modifiers
      .map((modifier) => this.addModifier(modifier, source, context))
      .filter(Boolean);
  }

  removeModifiersBySource(source) {
    this.values.forEach((entry) => {
      entry.add = entry.add.filter((modifier) => modifier.source !== source);
      entry.multiply = entry.multiply.filter((modifier) => modifier.source !== source);
    });
  }

  get(name, fallback = 0, context = {}) {
    const entry = this.values.get(name);
    if (!entry) return fallback;
    const addValue = entry.add.reduce(
      (sum, modifier) => sum + resolveAddAmount(modifier, context),
      0
    );
    const multiplier = entry.multiply.reduce(
      (product, modifier) => product * resolveMultiplier(modifier, context),
      1
    );
    const value = (entry.base + addValue) * multiplier;
    return clampNumber(value, entry.min, entry.max);
  }

  snapshot() {
    const result = {};
    this.values.forEach((entry, name) => {
      result[name] = {
        base: entry.base,
        add: entry.add.map(minifyModifier),
        multiply: entry.multiply.map(minifyModifier),
        value: this.get(name)
      };
    });
    return result;
  }

  ensureEntry(name) {
    if (!this.values.has(name)) {
      this.values.set(name, {
        base: 0,
        min: DEFAULT_MIN_VALUE,
        max: Number.POSITIVE_INFINITY,
        add: [],
        multiply: []
      });
    }
    return this.values.get(name);
  }
}

export function bindAttributeGetter(target, propertyName, attributeName = propertyName) {
  Object.defineProperty(target, propertyName, {
    configurable: true,
    enumerable: true,
    get() {
      return this.attributes.get(attributeName);
    }
  });
}

function modifierType(modifier) {
  const rawType = modifier.type ?? modifier.op ?? 'add';
  return rawType === 'multiply' || rawType === 'mul' ? 'multiply' : 'add';
}

function resolveAddAmount(modifier, context) {
  const level = resolveLevel(modifier, context);
  const amount = toFiniteNumber(modifier.amount ?? modifier.value, 0);
  const amountPerLevel = toFiniteNumber(modifier.amountPerLevel, 0);
  const nearbyAllyAmountPerLevel = toFiniteNumber(modifier.nearbyAllyAmountPerLevel, 0);
  return amount +
    amountPerLevel * level +
    resolveNearbyAllyCount(modifier, context) * nearbyAllyAmountPerLevel * level;
}

function resolveMultiplier(modifier, context) {
  const level = resolveLevel(modifier, context);
  if (Number.isFinite(modifier.factor) || Number.isFinite(modifier.factorPerLevel)) {
    return (
      toFiniteNumber(modifier.factor, 1) +
      toFiniteNumber(modifier.factorPerLevel, 0) * level
    );
  }

  const percent = toFiniteNumber(modifier.percent ?? modifier.percentage, null);
  const percentPerLevel = toFiniteNumber(modifier.percentPerLevel, 0);
  if (percent !== null || percentPerLevel !== 0) {
    return 1 + toFiniteNumber(percent, 0) + percentPerLevel * level;
  }

  return toFiniteNumber(modifier.amount ?? modifier.value, 1);
}

function resolveLevel(modifier, context) {
  return Math.max(1, toFiniteNumber(modifier.level ?? context.level, 1));
}

function resolveNearbyAllyCount(modifier, context) {
  if (!modifier.nearbyAllyAmountPerLevel) return 0;
  const owner = context.owner;
  const game = context.game;
  if (!owner?.position || !game) return 0;
  const radius = Math.max(0, toFiniteNumber(modifier.radius, 6));
  if (radius <= 0) return 0;
  const units = owner.team === 'player' ? game.friendlyUnits : game.enemyUnits;
  return (units ?? []).filter((unit) => {
    if (!unit.alive || unit === owner || unit.team !== owner.team) return false;
    const dx = unit.position.x - owner.position.x;
    const dz = unit.position.z - owner.position.z;
    return Math.hypot(dx, dz) <= radius;
  }).length;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function minifyModifier(modifier) {
  return {
    id: modifier.id,
    source: modifier.source,
    amount: modifier.amount,
    amountPerLevel: modifier.amountPerLevel,
    nearbyAllyAmountPerLevel: modifier.nearbyAllyAmountPerLevel,
    radius: modifier.radius,
    factor: modifier.factor,
    percent: modifier.percent,
    percentPerLevel: modifier.percentPerLevel,
    level: modifier.level
  };
}
