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
// 旧的那套「威胁度分级」难度缩放（threatTier / minThreat）必须保持删除状态。
//
// ⚠️ 这里**只**禁这两个标识符，不再像早先那样连裸词 `threat` 一起禁。
// 原因：本轮新增了另一个同名但完全不同的系统——覆盖场景的「威胁度二维数组」
// （ThreatFieldSystem / threatField.js），木傀儡靠它避险。它是玩法侧的感知数据，
// 不参与敌人难度缩放，也不含任何分级逻辑。继续禁裸词会把两件不相干的事混在一起，
// 于是每次动威胁度数组都要来改这条断言，而它真正要守的东西反而被淹没。
assert.doesNotMatch(`${gameSource}\n${enchantmentSource}\n${dataSource}`, /threatTier|minThreat/);
// 反过来钉住"难度缩放确实没有偷偷按威胁度分档"：这两个文件里不得出现按威胁度取档位的写法
assert.doesNotMatch(`${gameSource}\n${enchantmentSource}`, /threat[A-Z]\w*\s*[\[(]/);

console.log('Difficulty scaling checks passed.');
