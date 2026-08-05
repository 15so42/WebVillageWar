import assert from 'node:assert/strict';
import { BUFF_DEFINITIONS, LEVEL_DEFINITIONS, UNIT_DEFINITIONS } from '../src/data/gameData.js';
import { createProjectileModel, createUnitModel } from '../src/art/visualRegistry.js';

const level = LEVEL_DEFINITIONS.find((entry) => entry.id === 'emerald-marsh');
assert.ok(level, '应注册翡翠沼泽关卡');
assert.equal(level.baseDifficulty, 4);
assert.equal(level.world?.sceneKey, 'emerald-marsh');
assert.deepEqual(level.elitePool.map((entry) => entry.type), ['mireHunter']);
assert.deepEqual(level.bossPool.map((entry) => entry.type), ['rotrootColossus']);
assert.equal(level.enemyPool.some((entry) => entry.type === 'mireHunter'), false);
assert.equal(level.enemyPool.some((entry) => entry.type === 'rotrootColossus'), false);

const hunter = UNIT_DEFINITIONS.mireHunter;
const boss = UNIT_DEFINITIONS.rotrootColossus;
assert.equal(hunter?.monsterAbility?.type, 'mireJavelin');
assert.equal(hunter?.monsterAbility?.cooldown, 8.2);
assert.equal(hunter?.monsterAbility?.projectilePierce, 2);
assert.equal(boss?.monsterAbility?.type, 'rootQuake');
assert.equal(boss?.monsterAbility?.cooldown, 11.5);
assert.equal(boss?.monsterAbility?.statusBuffId, 'mireSnared');
assert.equal(BUFF_DEFINITIONS.mireSnared?.modifiers?.[0]?.amount, 0.65);

const hunterModel = createUnitModel('mireHunter', 'enemy');
const bossModel = createUnitModel('rotrootColossus', 'enemy');
const javelinModel = createProjectileModel('mireJavelin', { color: '#8abf68' });
assert.ok(hunterModel.children.length > 0);
assert.ok(hunterModel.userData.parts?.projectileSocket);
assert.ok(bossModel.children.length > 0);
assert.ok(bossModel.userData.parts?.weaponPivot);
assert.ok(javelinModel.children.length >= 4);

console.log('emerald marsh data and model tests passed');
