import assert from 'node:assert/strict';
import {
  applyEndlessDifficulty,
  calculateEndlessReward,
  endlessDifficultyDelta,
  endlessEnchantCount,
  endlessEnchantLevel,
  endlessEnemyStatFactors,
  endlessExpectedLifetime,
  normalizeChallengeMode,
  resetEndlessDeckLevels
} from '../src/systems/endlessMode.js';

assert.equal(normalizeChallengeMode('endless'), 'endless');
assert.equal(normalizeChallengeMode('unknown'), 'standard');

assert.equal(endlessExpectedLifetime({ baseHealth: 18 }), 20);
assert.equal(endlessExpectedLifetime({ baseHealth: 64, enemyClass: 'elite' }), 35);
assert.equal(endlessExpectedLifetime({ baseHealth: 150, enemyClass: 'boss' }), 70);

assert.equal(endlessDifficultyDelta({
  lifetime: 20,
  expectedLifetime: 20,
  enemyClass: 'normal'
}), 0);
assert.equal(endlessDifficultyDelta({
  lifetime: 0.01,
  expectedLifetime: 20,
  enemyClass: 'normal'
}), 2);
assert.equal(endlessDifficultyDelta({
  lifetime: 0.01,
  expectedLifetime: 70,
  enemyClass: 'boss'
}), 10);
assert(endlessDifficultyDelta({
  lifetime: 40,
  expectedLifetime: 20,
  enemyClass: 'normal'
}) < 0);
assert.equal(applyEndlessDifficulty(-0.25, -0.125), -0.37);

assert.deepEqual(endlessEnemyStatFactors(0), { health: 1, damage: 1 });
assert.deepEqual(endlessEnemyStatFactors(-100), { health: 0.1, damage: 0.1 });
assert.equal(endlessEnchantCount(-2), 1);
assert.equal(endlessEnchantCount(3), 2);
assert.equal(endlessEnchantCount(7), 3);
assert.equal(endlessEnchantLevel(-2), 1);
assert.equal(endlessEnchantLevel(7), 4);
assert.equal(calculateEndlessReward(-3, 2), 0);
assert.equal(calculateEndlessReward(7.9, 1.5), 11);

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
