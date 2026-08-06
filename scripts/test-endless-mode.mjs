import assert from 'node:assert/strict';
import {
  applyEndlessDifficulty,
  applyEndlessPerformanceMultiplier,
  calculateEndlessReward,
  endlessDifficultyDelta,
  endlessEnchantCount,
  endlessEnchantLevel,
  endlessEnemyClass,
  endlessEnemyDifficultyValue,
  endlessDifficultyReferenceHealth,
  endlessEnemyStatFactors,
  endlessExpectedLifetime,
  endlessKillPerformanceDelta,
  endlessPlayerUnitDeathPerformanceDelta,
  normalizeChallengeMode,
  resetEndlessDeckLevels,
  resolveEndlessEnemyDefeat
} from '../src/systems/endlessMode.js';
import { AttributeSet } from '../src/systems/AttributeSet.js';
import { ModifierSystem } from '../src/systems/ModifierSystem.js';
import { EnemyEnchantmentSystem } from '../src/systems/EnemyEnchantmentSystem.js';
import { BUFF_DEFINITIONS, TEAMS } from '../src/data/gameData.js';

assert.equal(normalizeChallengeMode('endless'), 'endless');
assert.equal(normalizeChallengeMode('unknown'), 'standard');
assert.equal(endlessEnemyClass({ isElite: true }), 'elite');
assert.equal(endlessEnemyClass({ isBoss: true }), 'boss');

assert.equal(endlessExpectedLifetime({ baseHealth: 18 }), 5);
assert.equal(endlessExpectedLifetime({ baseHealth: 64, enemyClass: 'elite' }), 8.75);
assert.equal(endlessExpectedLifetime({ baseHealth: 150, enemyClass: 'boss' }), 17.5);
assert.equal(endlessDifficultyReferenceHealth({
  definition: { maxHealth: 110 },
  maxHealth: 742
}), 110, '难度权重不应再次计入已经放大的实际生命');
assert.equal(endlessDifficultyReferenceHealth({ maxHealth: 64 }), 64);

assert.equal(endlessEnemyDifficultyValue({ baseHealth: 18, enemyClass: 'normal' }), 0.168);
assert.equal(endlessEnemyDifficultyValue({ baseHealth: 90, enemyClass: 'normal' }), 0.84);
assert.equal(endlessEnemyDifficultyValue({ baseHealth: 150, enemyClass: 'boss' }), 7);
assert.equal(endlessDifficultyDelta({ baseHealth: 90, performanceMultiplier: 1 }), 0.84);
assert.equal(endlessDifficultyDelta({ baseHealth: 90, performanceMultiplier: 2 }), 1.68);
assert.equal(endlessDifficultyDelta({ baseHealth: 90, performanceMultiplier: -0.5 }), -0.42);

assert.equal(endlessKillPerformanceDelta({ lifetime: 0, expectedLifetime: 5 }), 0.1);
assert.equal(endlessKillPerformanceDelta({ lifetime: 2.5, expectedLifetime: 5 }), 0.05);
assert.equal(endlessKillPerformanceDelta({ lifetime: 5, expectedLifetime: 5 }), 0);
assert.equal(endlessKillPerformanceDelta({ lifetime: 7.5, expectedLifetime: 5 }), -0.025);
assert.equal(endlessKillPerformanceDelta({ lifetime: 10, expectedLifetime: 5 }), -0.05);
assert.equal(endlessKillPerformanceDelta({ lifetime: 20, expectedLifetime: 5 }), -0.05);
assert.equal(applyEndlessPerformanceMultiplier(1, 0.1), 1.1);
assert.equal(applyEndlessPerformanceMultiplier(0.05, -0.1), -0.05);
assert.equal(endlessPlayerUnitDeathPerformanceDelta(), -0.1);

assert.deepEqual(resolveEndlessEnemyDefeat({
  baseHealth: 90,
  lifetime: 0,
  expectedLifetime: 5,
  enemyClass: 'normal',
  performanceMultiplier: 1
}), {
  performanceDelta: 0.1,
  performanceMultiplier: 1.1,
  enemyDifficulty: 0.84,
  difficultyDelta: 0.924
});
assert.deepEqual(resolveEndlessEnemyDefeat({
  baseHealth: 90,
  lifetime: 0,
  expectedLifetime: 5,
  enemyClass: 'normal',
  performanceMultiplier: -0.4
}), {
  performanceDelta: 0.1,
  performanceMultiplier: -0.3,
  enemyDifficulty: 0.84,
  difficultyDelta: -0.252
});
assert.equal(applyEndlessDifficulty(-0.25, -0.125), -0.37);

{
  let difficulty = 10;
  let performanceMultiplier = 2;
  for (let index = 0; index < 7; index += 1) {
    const result = resolveEndlessEnemyDefeat({
      baseHealth: 110,
      lifetime: 0,
      expectedLifetime: 10,
      enemyClass: 'normal',
      performanceMultiplier
    });
    performanceMultiplier = result.performanceMultiplier;
    difficulty = applyEndlessDifficulty(difficulty, result.difficultyDelta);
  }
  assert(difficulty >= 26 && difficulty <= 30, `连续优势后的难度应平滑落在约 30，实际 ${difficulty}`);
}

{
  let difficulty = 30;
  let performanceMultiplier = -1;
  for (let index = 0; index < 7; index += 1) {
    const result = resolveEndlessEnemyDefeat({
      baseHealth: 110,
      lifetime: 20,
      expectedLifetime: 10,
      enemyClass: 'normal',
      performanceMultiplier
    });
    performanceMultiplier = result.performanceMultiplier;
    difficulty = applyEndlessDifficulty(difficulty, result.difficultyDelta);
  }
  assert(difficulty >= 20 && difficulty <= 24, `连续劣势后的难度不应瞬间塌陷，实际 ${difficulty}`);
}

assert.deepEqual(endlessEnemyStatFactors(0), { health: 1, damage: 1 });
assert.deepEqual(endlessEnemyStatFactors(-100), { health: 0.1, damage: 0.1 });
for (const seed of [1, 7, 31, 99, 707]) {
  assert.match(String(endlessEnchantCount(100, { enemyClass: 'normal', seed })), /^[01]$/);
  assert.match(String(endlessEnchantCount(100, { enemyClass: 'elite', seed })), /^[12]$/);
  assert.match(String(endlessEnchantCount(100, { enemyClass: 'boss', seed })), /^[23]$/);
}
const normalLevels = [1, 7, 31, 99, 707].map((seed) => endlessEnchantLevel(20, {
  enemyClass: 'normal',
  slotIndex: 0,
  seed
}));
assert(new Set(normalLevels).size > 1);
assert(normalLevels.every((level) => level >= 1 && level <= 3));
assert(endlessEnchantLevel(100, { enemyClass: 'normal', seed: 1 }) <= 4);
assert(endlessEnchantLevel(100, { enemyClass: 'elite', seed: 1 }) <= 5);
assert(endlessEnchantLevel(100, { enemyClass: 'boss', seed: 1 }) <= 6);
assert.equal(calculateEndlessReward(-3, 2), 0);
assert.equal(calculateEndlessReward(7.9, 1.5), 71);
assert.equal(calculateEndlessReward(7.9, 600, 1.5), 75);
assert.equal(calculateEndlessReward(7.9, 7200, 1.5), 92);

const swarmSpeedAttributes = new AttributeSet({ moveSpeed: 2.75 });
swarmSpeedAttributes.addModifier({
  stat: 'moveSpeed',
  type: 'multiply',
  factor: 1.02,
  factorPerLevel: 0.02,
  levelCurve: 'sqrt'
}, 'test:swarm', { level: 100 });
const swarmEnemy = {
  team: 'enemy',
  definition: { speed: 2.75 },
  attributes: swarmSpeedAttributes,
  hasEnchantment: (id) => id === 'waveSwarm'
};
const swarmSpeed = new ModifierSystem({}).getMoveSpeed(swarmEnemy);
assert(Math.abs(swarmSpeed - 3.355) < 1e-9);
assert(swarmSpeed > 3.2);

const upgradedDeck = [
  { id: 'militia', level: 5, instanceId: 'card-1' },
  { id: 'archer', level: 3, instanceId: 'card-2' }
];
const endlessDeck = resetEndlessDeckLevels(upgradedDeck);
assert.deepEqual(endlessDeck.map((card) => card.level), [1, 1]);
assert.deepEqual(upgradedDeck.map((card) => card.level), [5, 3]);
assert.notEqual(endlessDeck[0], upgradedDeck[0]);
assert.deepEqual(resetEndlessDeckLevels(null), []);

const eliteUnit = {
  id: 101,
  alive: true,
  team: TEAMS.ENEMY,
  type: 'goblinSoldier',
  definition: { role: 'melee' },
  isElite: true,
  endlessEnchantBudget: 1,
  maxEnchantmentSlots: 5,
  enchantments: new Map(),
  buffs: new Map(),
  maxHealth: 100,
  health: 100,
  maxShield: 0,
  shield: 0,
  weapon: { maxDurability: 20, durability: 20 },
  addBuff(id, definition, overrides = {}) {
    const buff = { ...definition, ...overrides, id, level: overrides.level ?? 1 };
    this.buffs.set(id, buff);
    if (definition.category === 'enchantment') this.enchantments.set(id, buff);
    return buff;
  }
};
const eliteSpawnGame = {
  isEndlessMode: () => true,
  endlessDifficulty: 0,
  friendlyUnits: [],
  enemyUnits: [eliteUnit],
  buffs: {
    applyBuff(target, id, source, overrides) {
      return target.addBuff(id, BUFF_DEFINITIONS[id], { ...overrides, source });
    }
  },
  enemyEnergyAvailableForEnchant: () => 0,
  spendEnemyEnergy: () => false,
  grantEnemyEnergy: () => {},
  effects: { spawnDamageNumber: () => {} }
};
new EnemyEnchantmentSystem(eliteSpawnGame).enchantSpawnWave([eliteUnit], {
  id: 3,
  index: 3,
  kind: 'elite',
  threatTier: 3,
  effectiveDifficulty: 0
});
assert.equal(eliteUnit.enchantments.size, 1, 'endless elite spawn receives its guaranteed enchantment');
assert.equal(eliteUnit.enchantments.values().next().value.level, 1);

console.log('Endless mode logic checks passed.');
