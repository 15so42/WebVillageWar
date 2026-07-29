import assert from 'node:assert/strict';
import {
  applyEndlessDifficulty,
  calculateEndlessReward,
  endlessDifficultyDelta,
  endlessEnchantCount,
  endlessEnchantLevel,
  endlessEnemyStatFactors,
  endlessExpectedLifetime,
  endlessPlayerUnitDeathDifficultyDelta,
  normalizeChallengeMode,
  resetEndlessDeckLevels
} from '../src/systems/endlessMode.js';
import { AttributeSet } from '../src/systems/AttributeSet.js';
import { ModifierSystem } from '../src/systems/ModifierSystem.js';

assert.equal(normalizeChallengeMode('endless'), 'endless');
assert.equal(normalizeChallengeMode('unknown'), 'standard');

assert.equal(endlessExpectedLifetime({ baseHealth: 18 }), 5);
assert.equal(endlessExpectedLifetime({ baseHealth: 64, enemyClass: 'elite' }), 8.75);
assert.equal(endlessExpectedLifetime({ baseHealth: 150, enemyClass: 'boss' }), 17.5);

assert.equal(endlessDifficultyDelta({
  baseHealth: 18,
  lifetime: 5,
  expectedLifetime: 5,
  enemyClass: 'normal'
}), 0);
assert.equal(endlessDifficultyDelta({
  baseHealth: 18,
  lifetime: 0.01,
  expectedLifetime: 5,
  enemyClass: 'normal'
}), 0.168);
assert.equal(endlessDifficultyDelta({
  baseHealth: 90,
  lifetime: 0.01,
  expectedLifetime: 5,
  enemyClass: 'normal'
}), 0.84);
assert.equal(endlessDifficultyDelta({
  baseHealth: 150,
  lifetime: 0.01,
  expectedLifetime: 17.5,
  enemyClass: 'boss'
}), 7);
assert(endlessDifficultyDelta({
  baseHealth: 18,
  lifetime: 10,
  expectedLifetime: 5,
  enemyClass: 'normal'
}) < 0);
assert.equal(endlessDifficultyDelta({
  baseHealth: 18,
  lifetime: 10,
  expectedLifetime: 5,
  enemyClass: 'normal'
}), -0.015);
assert.equal(applyEndlessDifficulty(-0.25, -0.125), -0.37);
assert.equal(endlessPlayerUnitDeathDifficultyDelta(2), -0.48);
assert.equal(endlessPlayerUnitDeathDifficultyDelta(3), -0.72);
assert.equal(endlessPlayerUnitDeathDifficultyDelta(-1), 0);
assert.equal(applyEndlessDifficulty(2, endlessPlayerUnitDeathDifficultyDelta(3)), 1.28);

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

console.log('Endless mode logic checks passed.');
