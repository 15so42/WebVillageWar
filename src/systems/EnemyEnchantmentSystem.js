import { TEAMS } from '../data/gameData.js';
import { endlessEnchantCount, endlessEnchantLevel, endlessEnemyClass } from './endlessMode.js';

export const ENEMY_RANDOM_ENCHANT_IDS = Object.freeze([
  'waveArmored',
  'waveRush',
  'waveRanged',
  'waveSiege',
  'power',
  'poison',
  'protection',
  'block',
  'critical',
  'focus',
  'fire',
  'explosion',
  'toughness',
  'lifesteal',
  'thorns',
  'frost',
  'spiritShield',
  'bleed',
  'spiritWeapon',
  'soulEater',
  'drain',
  'recovery',
  'curse'
]);

export function waveEnchantCountForIndex(waveIndex) {
  const index = Math.max(1, Math.floor(Number(waveIndex) || 1));
  if (index >= 14) return 3;
  if (index >= 7) return 2;
  return 1;
}

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
    const intel = this.getPlayerIntel();
    return (this.game.enemyUnits ?? []).some((unit) => (
      this.isEnchantCandidate(unit) &&
      this.fieldEnchantScore(unit, intel) >= 2.8 &&
      unit.enchantments.size < this.maxEnchantSlots(unit)
    ));
  }

  enchantSpawnWave(units, waveConfig) {
    if (!Array.isArray(units) || units.length === 0) return;

    const sorted = [...units].sort((left, right) => enchantPriority(right) - enchantPriority(left));
    sorted.forEach((unit, index) => {
      const slots = this.spawnEnchantSlots(unit, waveConfig, index);
      for (let slot = unit.enchantments.size; slot < slots; slot += 1) {
        const buffId = this.pickEnchantForUnit(unit, waveConfig, slot);
        if (!buffId) continue;
        const level = this.enchantLevelForSlot(unit, waveConfig, slot);
        this.applyEnchant(unit, buffId, level, waveConfig, 0);
      }
    });
  }

  shouldEnchantWave(waveConfig) {
    void waveConfig;
    return true;
  }

  spawnEnchantSlots(unit, waveConfig, indexInWave) {
    if (this.game.isEndlessMode?.()) {
      return Math.min(
        Math.max(0, Math.floor(unit?.maxEnchantmentSlots ?? 5)),
        unit?.endlessEnchantBudget ?? endlessEnchantCount(
          waveConfig?.effectiveDifficulty ?? this.game.endlessDifficulty,
          {
            enemyClass: endlessEnemyClass(unit),
            seed: stableEnchantRoll(unit, waveConfig, indexInWave)
          }
        )
      );
    }
    const waveIndex = waveConfig?.index ?? 1;
    return waveEnchantCountForIndex(waveIndex);
  }

  tryEnchantField() {
    const intel = this.getPlayerIntel();
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
      const level = this.enchantLevelForSlot(unit, unit.enemyForce, unit.enchantments.size);
      const cost = this.enchantCostForUnit(unit, level);
      if (this.game.enemyEnergyAvailableForEnchant(unit) < cost) continue;
      const buffId = this.pickEnchantForUnit(unit, {
        id: unit.enemyForce?.id ?? null,
        index: unit.enemyForce?.index ?? this.game.currentWave?.index ?? 1,
        effectiveDifficulty: unit.enemyForce?.effectiveDifficulty ?? 1
      }, unit.enchantments.size);
      if (!buffId) continue;
      if (!this.applyEnchant(unit, buffId, level, unit.enemyForce, cost)) continue;
      actions += 1;
    }
  }

  fieldEnchantScore(unit, intel) {
    let score = 0;
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
    const unitLimit = Math.max(0, Math.floor(unit?.maxEnchantmentSlots ?? 5));
    if (this.game.isEndlessMode?.()) {
      return Math.min(
        unitLimit,
        unit?.endlessEnchantBudget ?? endlessEnchantCount(
          unit.enemyForce?.effectiveDifficulty ?? this.game.endlessDifficulty,
          {
            enemyClass: endlessEnemyClass(unit),
            seed: stableEnchantRoll(unit, unit.enemyForce, unit.enchantments.size)
          }
        )
      );
    }
    const waveIndex = unit.enemyForce?.index
      ?? this.game.currentWave?.index
      ?? 1;
    return Math.min(unitLimit, waveEnchantCountForIndex(waveIndex));
  }

  enchantLevelForSlot(unit, waveConfig, slotIndex) {
    if (this.game.isEndlessMode?.()) {
      return endlessEnchantLevel(
        waveConfig?.effectiveDifficulty ?? this.game.endlessDifficulty,
        {
          enemyClass: endlessEnemyClass(unit),
          slotIndex,
          seed: stableEnchantRoll(unit, waveConfig, slotIndex)
        }
      );
    }
    return enemyEnchantLevel(
      waveConfig?.effectiveDifficulty ?? this.game.effectiveDifficulty?.() ?? 1
    );
  }

  pickEnchantForUnit(unit, waveConfig, slotIndex = 0) {
    const used = new Set(unit.enchantments.keys());
    const pool = ENEMY_RANDOM_ENCHANT_IDS.filter((buffId) => (
      !used.has(buffId) && !unitResistsEnchant(unit, buffId)
    ));
    if (!pool.length) return null;
    const roll = stableEnchantRoll(unit, waveConfig, slotIndex + pool.length * 7);
    return pool[roll % pool.length];
  }

  getPlayerIntel() {
    const units = (this.game.friendlyUnits ?? [])
      .filter((unit) => unit?.alive && !unit.isBuilding)
      .map((unit) => ({ role: unit.definition?.role ?? 'melee' }));
    return {
      units,
      buildingCount: (this.game.friendlyUnits ?? []).filter((unit) => unit?.alive && unit.isBuilding).length,
      supportCount: units.filter((unit) => unit.role === 'support').length
    };
  }

  applyEnchant(unit, buffId, level, waveConfig, costOverride = null) {
    if (!this.isEnchantCandidate(unit) || unit.enchantments.has(buffId)) return false;
    const cost = costOverride ?? this.enchantCostForUnit(unit, level);
    if (cost > 0 && this.game.enemyEnergyAvailableForEnchant(unit) < cost) return false;
    if (cost > 0 && !this.game.spendEnemyEnergy(cost)) return false;
    const applied = this.game.buffs.applyBuff(unit, buffId, unit, {
      level: Math.max(1, Math.floor(level)),
      sourceEnemyEnchant: true
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

function enemyEnchantLevel(difficulty) {
  return 1 + Math.floor((Math.max(1, difficulty) - 1) / 2);
}

function enchantPriority(unit) {
  if (unit?.isBoss) return 3;
  if (unit?.isElite) return 2;
  return 1;
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
  const waveIndex = Number(waveConfig?.index) || 1;
  return Math.abs((unitId * 73856093) ^ (forceId * 19349663) ^ (waveIndex * 83492791) ^ (salt * 2654435761));
}
