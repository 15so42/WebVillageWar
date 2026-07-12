import { TEAMS } from '../data/gameData.js';

const AFFIX_PRIMARY_BUFF = {
  swarm: 'waveSwarm',
  armored: 'waveArmored',
  rush: 'waveRush',
  ranged: 'waveRanged',
  siege: 'waveSiege'
};

const AFFIX_ENCHANT_WEIGHTS = {
  swarm: [
    { id: 'waveSwarm', weight: 8 },
    { id: 'power', weight: 1 },
    { id: 'poison', weight: 1 }
  ],
  armored: [
    { id: 'waveArmored', weight: 8 },
    { id: 'protection', weight: 2 },
    { id: 'block', weight: 2 }
  ],
  rush: [
    { id: 'waveRush', weight: 8 },
    { id: 'power', weight: 2 },
    { id: 'critical', weight: 1 }
  ],
  ranged: [
    { id: 'waveRanged', weight: 8 },
    { id: 'focus', weight: 2 },
    { id: 'fire', weight: 1 }
  ],
  siege: [
    { id: 'waveSiege', weight: 8 },
    { id: 'power', weight: 2 },
    { id: 'explosion', weight: 2 }
  ]
};

const ROLE_ENCHANT_FALLBACK = {
  melee: [
    { id: 'power', weight: 3 },
    { id: 'toughness', weight: 2 },
    { id: 'block', weight: 2 }
  ],
  ranged: [
    { id: 'focus', weight: 3 },
    { id: 'fire', weight: 2 },
    { id: 'critical', weight: 2 }
  ],
  support: [
    { id: 'protection', weight: 2 },
    { id: 'recovery', weight: 3 },
    { id: 'spiritShield', weight: 3 }
  ]
};

const UNIT_ENCHANT_PROFILES = {
  goblinSoldier: [
    { id: 'power', weight: 3 },
    { id: 'toughness', weight: 2 },
    { id: 'block', weight: 2 }
  ],
  enemyRaider: [
    { id: 'power', weight: 3 },
    { id: 'critical', weight: 3 },
    { id: 'lifesteal', weight: 2 }
  ],
  skeletonSoldier: [
    { id: 'thorns', weight: 3 },
    { id: 'toughness', weight: 3 },
    { id: 'block', weight: 2 }
  ],
  goblinTroll: [
    { id: 'toughness', weight: 3 },
    { id: 'protection', weight: 3 },
    { id: 'power', weight: 2 }
  ],
  ogre: [
    { id: 'power', weight: 3 },
    { id: 'toughness', weight: 3 },
    { id: 'explosion', weight: 2 }
  ],
  yellowSandOgre: [
    { id: 'power', weight: 3 },
    { id: 'toughness', weight: 3 },
    { id: 'explosion', weight: 2 }
  ],
  frostTrollBoss: [
    { id: 'frost', weight: 4 },
    { id: 'toughness', weight: 3 },
    { id: 'power', weight: 2 }
  ],
  shieldBearer: [
    { id: 'block', weight: 4 },
    { id: 'protection', weight: 3 },
    { id: 'thorns', weight: 2 }
  ],
  sandScorpionGuard: [
    { id: 'thorns', weight: 3 },
    { id: 'poison', weight: 3 },
    { id: 'protection', weight: 2 }
  ],
  scorpion: [
    { id: 'poison', weight: 4 },
    { id: 'thorns', weight: 2 },
    { id: 'bleed', weight: 2 }
  ],
  goblinArcher: [
    { id: 'focus', weight: 3 },
    { id: 'fire', weight: 2 },
    { id: 'critical', weight: 2 }
  ],
  skeletonArcher: [
    { id: 'focus', weight: 3 },
    { id: 'critical', weight: 3 },
    { id: 'spiritWeapon', weight: 2 }
  ],
  goblinHunter: [
    { id: 'focus', weight: 3 },
    { id: 'critical', weight: 3 },
    { id: 'bleed', weight: 2 }
  ],
  venomArcher: [
    { id: 'poison', weight: 4 },
    { id: 'focus', weight: 2 },
    { id: 'bleed', weight: 2 }
  ],
  elfSniper: [
    { id: 'focus', weight: 4 },
    { id: 'critical', weight: 3 },
    { id: 'power', weight: 1 }
  ],
  tombLanternCrossbowman: [
    { id: 'focus', weight: 3 },
    { id: 'critical', weight: 3 },
    { id: 'soulEater', weight: 2 }
  ],
  frostAcolyte: [
    { id: 'frost', weight: 4 },
    { id: 'focus', weight: 2 },
    { id: 'drain', weight: 2 }
  ],
  frostScout: [
    { id: 'frost', weight: 3 },
    { id: 'critical', weight: 3 },
    { id: 'focus', weight: 2 }
  ],
  goblinShaman: [
    { id: 'spiritShield', weight: 3 },
    { id: 'recovery', weight: 3 },
    { id: 'drain', weight: 2 }
  ],
  boneVoicePriest: [
    { id: 'curse', weight: 3 },
    { id: 'drain', weight: 3 },
    { id: 'spiritShield', weight: 2 }
  ],
  snowDuskShaman: [
    { id: 'frost', weight: 3 },
    { id: 'spiritShield', weight: 3 },
    { id: 'recovery', weight: 2 }
  ],
  wizard: [
    { id: 'fire', weight: 3 },
    { id: 'spiritWeapon', weight: 3 },
    { id: 'drain', weight: 2 }
  ],
  goblinBomber: [
    { id: 'explosion', weight: 4 },
    { id: 'fire', weight: 3 },
    { id: 'power', weight: 1 }
  ],
  spider: [
    { id: 'poison', weight: 4 },
    { id: 'bleed', weight: 3 },
    { id: 'power', weight: 1 }
  ]
};

const PLAYER_COUNTER_ENCHANTS = {
  buildings: [
    { id: 'power', weight: 2 },
    { id: 'explosion', weight: 3 },
    { id: 'soulEater', weight: 2 }
  ],
  ranged: [
    { id: 'thorns', weight: 3 },
    { id: 'protection', weight: 2 },
    { id: 'block', weight: 2 }
  ],
  melee: [
    { id: 'fire', weight: 2 },
    { id: 'poison', weight: 2 },
    { id: 'focus', weight: 2 }
  ],
  support: [
    { id: 'power', weight: 2 },
    { id: 'critical', weight: 2 },
    { id: 'lifesteal', weight: 2 }
  ]
};

const MAX_FIELD_ENCHANTS = {
  normal: 3,
  elite: 3,
  boss: 4
};

export function waveEnchantCountForIndex(waveIndex) {
  const index = Math.max(1, Math.floor(Number(waveIndex) || 1));
  if (index >= 14) return 3;
  if (index >= 7) return 2;
  return 1;
}

const SOURCE_WEIGHT = {
  unit: 4,
  affix: 2,
  counter: 1,
  role: 1
};

export class EnemyEnchantmentSystem {
  constructor(game) {
    this.game = game;
    this.thinkTimer = 2.2;
  }

  destroy() {
    this.thinkTimer = 0;
  }

  update(dt) {
    if (this.game.levelFinished || this.game.strategyEvent || this.game.levelSession?.debug) return;
    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return;
    this.thinkTimer = Math.max(2.5, Number(this.game.enemyDirectorConfig.enchantThinkInterval ?? 4.5));
    this.tryEnchantField();
  }

  hasEnchantIntent() {
    const minCost = this.enchantCostForUnit({ isElite: false, isBoss: false }, 1);
    if (this.game.enemyEnergyAvailableForEnchant() < minCost) return false;
    const intel = this.game.enemyCommander?.getPlayerIntel?.();
    return (this.game.enemyUnits ?? []).some((unit) => (
      this.isEnchantCandidate(unit) &&
      this.fieldEnchantScore(unit, intel) >= 2.8 &&
      unit.enchantments.size < this.maxEnchantSlots(unit)
    ));
  }

  enchantSpawnWave(units, waveConfig) {
    if (!Array.isArray(units) || units.length === 0) return;

    const level = enemyEnchantLevel(waveConfig?.threatTier ?? 1, waveConfig?.effectiveDifficulty ?? 1);
    const sorted = [...units].sort((left, right) => enchantPriority(right) - enchantPriority(left));
    sorted.forEach((unit, index) => {
      const slots = this.spawnEnchantSlots(unit, waveConfig, index);
      for (let slot = 0; slot < slots; slot += 1) {
        const buffId = this.pickEnchantForUnit(unit, waveConfig, slot);
        if (!buffId) continue;
        this.applyEnchant(unit, buffId, level, waveConfig, 0);
      }
    });
  }

  shouldEnchantWave(waveConfig) {
    void waveConfig;
    return true;
  }

  spawnEnchantSlots(unit, waveConfig, indexInWave) {
    void unit;
    void indexInWave;
    const waveIndex = waveConfig?.index ?? waveConfig?.threatTier ?? 1;
    return waveEnchantCountForIndex(waveIndex);
  }

  tryEnchantField() {
    const intel = this.game.enemyCommander?.getPlayerIntel?.();
    const candidates = (this.game.enemyUnits ?? [])
      .filter((unit) => this.isEnchantCandidate(unit))
      .map((unit) => ({
        unit,
        score: this.fieldEnchantScore(unit, intel)
      }))
      .sort((left, right) => right.score - left.score);

    const maxFieldActions = Math.max(1, Number(this.game.enemyDirectorConfig.enchantFieldActionsPerTick ?? 1));
    let actions = 0;
    for (let i = 0; i < candidates.length; i += 1) {
      if (actions >= maxFieldActions) break;
      const { unit, score } = candidates[i];
      if (score < 2.4) break;
      if (unit.enchantments.size >= this.maxEnchantSlots(unit)) continue;
      const level = enemyEnchantLevel(
        this.game.enemyDirector?.threatTier ?? 1,
        unit.enemyForce?.effectiveDifficulty ?? this.game.effectiveDifficulty?.() ?? 1
      );
      const cost = this.enchantCostForUnit(unit, level);
      if (this.game.enemyEnergyAvailableForEnchant(unit) < cost) continue;
      const buffId = this.pickEnchantForUnit(unit, {
        affixId: unit.enemyForce?.affixId ?? null,
        threatTier: this.game.enemyDirector?.threatTier ?? 1,
        effectiveDifficulty: unit.enemyForce?.effectiveDifficulty ?? 1
      }, unit.enchantments.size);
      if (!buffId) continue;
      if (!this.applyEnchant(unit, buffId, level, unit.enemyForce, cost)) continue;
      actions += 1;
    }
  }

  fieldEnchantScore(unit, intel) {
    let score = 0;
    if (unit.enemyCommanderRole === 'attack') score += 2.4;
    if (unit.enemyCommanderRole === 'flank') score += 1.8;
    if (unit.isElite) score += 2.2;
    if (unit.isBoss) score += 3.5;
    if (unit.enchantments.size === 0) score += 1.5;
    else if (unit.enchantments.size === 1) score += 0.6;
    const role = unit.definition?.role ?? 'melee';
    const playerRanged = intel?.units?.filter((entry) => entry.role === 'ranged').length ?? 0;
    if (role === 'ranged' && (intel?.buildingCount ?? 0) >= 1) score += 0.8;
    if (role === 'melee' && playerRanged >= 3) score += 0.7;
    if ((intel?.supportCount ?? 0) >= 1 && (role === 'melee' || role === 'ranged')) score += 0.5;
    return score;
  }

  isEnchantCandidate(unit) {
    return unit?.alive !== false &&
      unit.team === TEAMS.ENEMY &&
      !unit.isWildlife &&
      unit.canReceiveBuffs !== false &&
      unit.immuneToStatusEffects !== true;
  }

  maxEnchantSlots(unit) {
    const waveIndex = unit.enemyForce?.index
      ?? unit.enemyForce?.threatTier
      ?? this.game.currentWave?.index
      ?? 1;
    return waveEnchantCountForIndex(waveIndex);
  }

  pickEnchantForUnit(unit, waveConfig, slotIndex = 0) {
    const used = new Set(unit.enchantments.keys());
    const affixIds = [
      waveConfig?.affixId,
      ...(Array.isArray(waveConfig?.affixIds) ? waveConfig.affixIds : [])
    ].filter(Boolean);
    const affixForSlot = affixIds[slotIndex] ?? affixIds[0];
    const primaryBuff = AFFIX_PRIMARY_BUFF[affixForSlot];
    if (primaryBuff && !used.has(primaryBuff) && !unitResistsEnchant(unit, primaryBuff)) {
      return primaryBuff;
    }

    const weighted = new Map();
    const addEntries = (entries, multiplier) => {
      entries.forEach((entry) => {
        if (!entry?.id || used.has(entry.id) || unitResistsEnchant(unit, entry.id)) return;
        weighted.set(entry.id, (weighted.get(entry.id) ?? 0) + Math.max(1, entry.weight) * multiplier);
      });
    };

    const unitProfile = UNIT_ENCHANT_PROFILES[unit.type];
    if (unitProfile) addEntries(unitProfile, SOURCE_WEIGHT.unit);
    const affixId = affixForSlot ?? waveConfig?.affixId;
    if (affixId && AFFIX_ENCHANT_WEIGHTS[affixId]) {
      addEntries(AFFIX_ENCHANT_WEIGHTS[affixId], SOURCE_WEIGHT.affix);
    }
    addEntries(this.counterEnchantPool(), SOURCE_WEIGHT.counter);
    const role = unit.definition?.role ?? 'melee';
    addEntries(ROLE_ENCHANT_FALLBACK[role] ?? ROLE_ENCHANT_FALLBACK.melee, SOURCE_WEIGHT.role);

    const pool = [...weighted.entries()].map(([id, weight]) => ({ id, weight }));
    if (!pool.length) return null;
    const roll = stableEnchantRoll(unit, waveConfig, slotIndex + pool.length * 7);
    return pickWeightedEnchant(pool, roll);
  }

  counterEnchantPool() {
    const intel = this.game.enemyCommander?.getPlayerIntel?.();
    if (!intel) return [];
    const pool = [];
    if ((intel.buildingCount ?? 0) >= 1) pool.push(...PLAYER_COUNTER_ENCHANTS.buildings);
    if ((intel.supportCount ?? 0) >= 1) pool.push(...PLAYER_COUNTER_ENCHANTS.support);
    const rangedCount = intel.units?.filter((entry) => entry.role === 'ranged').length ?? 0;
    const meleeCount = intel.units?.filter((entry) => entry.role === 'melee').length ?? 0;
    if (rangedCount >= meleeCount && rangedCount >= 3) pool.push(...PLAYER_COUNTER_ENCHANTS.ranged);
    if (meleeCount >= rangedCount + 2) pool.push(...PLAYER_COUNTER_ENCHANTS.melee);
    return pool;
  }

  applyEnchant(unit, buffId, level, waveConfig, costOverride = null) {
    if (!this.isEnchantCandidate(unit) || unit.enchantments.has(buffId)) return false;
    const cost = costOverride ?? this.enchantCostForUnit(unit, level);
    if (cost > 0 && this.game.enemyEnergyAvailableForEnchant(unit) < cost) return false;
    if (cost > 0 && !this.game.spendEnemyEnergy(cost)) return false;
    const applied = this.game.buffs.applyBuff(unit, buffId, unit, {
      level: Math.max(1, Math.floor(level)),
      sourceEnemyEnchant: true,
      sourceWaveAffix: waveConfig?.affixId ?? null
    });
    if (!applied) {
      if (cost > 0) {
        this.game.grantEnemyEnergy(cost, unit.position, { silent: true });
      }
      return false;
    }
    unit.health = unit.maxHealth;
    unit.shield = Math.min(unit.shield, unit.maxShield);
    unit.weapon.durability = unit.weapon.maxDurability;
    unit.statusUiDirty = true;
    if (cost > 0.001) {
      this.game.effects.spawnDamageNumber(unit.position, cost, {
        text: `附魔-${cost >= 10 ? cost.toFixed(0) : cost.toFixed(1)}`,
        color: '#c9a6ff',
        stroke: '#2d1848',
        height: (unit.statusHeight ?? 1.8) + 0.35,
        duration: 0.82,
        fontSize: 78
      });
    }
    return true;
  }

  enchantCostForUnit(unit, level) {
    return this.game.enemyEnchantCost?.(unit, level) ?? 2.4;
  }
}

function enemyEnchantLevel(threatTier, difficulty) {
  return 1 +
    Math.floor((Math.max(1, difficulty) - 1) / 2) +
    Math.floor((Math.max(1, threatTier) - 1) / 4);
}

function enchantPriority(unit) {
  if (unit?.isBoss) return 3;
  if (unit?.isElite) return 2;
  return 1;
}

function pickWeightedEnchant(entries, roll) {
  const total = entries.reduce((sum, entry) => sum + Math.max(1, entry.weight), 0);
  if (total <= 0) return null;
  let remaining = roll % total;
  for (let i = 0; i < entries.length; i += 1) {
    remaining -= Math.max(1, entries[i].weight);
    if (remaining < 0) return entries[i].id;
  }
  return entries[entries.length - 1].id;
}

function unitResistsEnchant(unit, buffId) {
  const traits = unit.definition?.traits ?? [];
  const immuneTrait = traits.find((trait) => trait.type === 'statusImmune');
  if (!immuneTrait) return false;
  const statuses = immuneTrait.statuses ?? [];
  if (buffId === 'poison' && statuses.includes('poisoned')) return true;
  if (buffId === 'bleed' && statuses.includes('bleeding')) return true;
  return false;
}

function stableEnchantRoll(unit, waveConfig, salt = 0) {
  const unitId = Number(unit?.id) || 0;
  const forceId = Number(waveConfig?.id) || 0;
  const threatTier = Number(waveConfig?.threatTier) || 1;
  return Math.abs((unitId * 73856093) ^ (forceId * 19349663) ^ (threatTier * 83492791) ^ (salt * 2654435761));
}
