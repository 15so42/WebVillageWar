import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ENEMY_DIFFICULTY_STAT_SCALE,
  standardEnemyStatFactors
} from '../src/systems/difficultyRules.js';
import {
  applyEndlessDifficulty,
  endlessEnemyStatFactors,
  endlessPlayerUnitDeathDifficultyDelta
} from '../src/systems/endlessMode.js';

assert.equal(ENEMY_DIFFICULTY_STAT_SCALE, 0.6);
assert.deepEqual(standardEnemyStatFactors(1), { health: 0.6, damage: 0.6 });
assert.deepEqual(standardEnemyStatFactors(10), { health: 1.194, damage: 1.14 });
assert.deepEqual(endlessEnemyStatFactors(0), { health: 0.6, damage: 0.6 });
assert.deepEqual(endlessEnemyStatFactors(10), { health: 1.26, damage: 1.2 });

assert.equal(endlessPlayerUnitDeathDifficultyDelta(30, 10), -0.9);
assert.equal(endlessPlayerUnitDeathDifficultyDelta(30, 2), -4.5);
assert.equal(endlessPlayerUnitDeathDifficultyDelta(30, 1), -9);
assert.equal(applyEndlessDifficulty(4, -10), 0, '无尽难度不得降到零以下');

const gameSource = readFileSync(new URL('../src/systems/Game.js', import.meta.url), 'utf8');
const enchantmentSource = readFileSync(new URL('../src/systems/EnemyEnchantmentSystem.js', import.meta.url), 'utf8');
const dataSource = readFileSync(new URL('../src/data/gameData.js', import.meta.url), 'utf8');
assert.match(gameSource, /WAVE_DIFFICULTY_GROWTH_PER_SELECTED_DIFFICULTY\s*=\s*0\.16/);
assert.doesNotMatch(gameSource, /applyOpeningForceScaling/);
assert.doesNotMatch(`${gameSource}\n${enchantmentSource}\n${dataSource}`, /threatTier|minThreat|\bthreat\b/);

console.log('Difficulty scaling checks passed.');
