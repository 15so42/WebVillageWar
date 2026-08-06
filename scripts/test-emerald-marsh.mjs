import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BUFF_DEFINITIONS, LEVEL_DEFINITIONS, UNIT_DEFINITIONS } from '../src/data/gameData.js';
import { createProjectileModel, createUnitModel } from '../src/art/visualRegistry.js';
import { AreaEffectSystem } from '../src/systems/AreaEffectSystem.js';
import { AttackSystem } from '../src/systems/AttackSystem.js';

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
assert.equal(boss?.role, 'ranged');
assert.equal(boss?.attackDamageType, 'magic');
assert.equal(boss?.projectileType, 'thornVine');
assert.equal(boss?.attackRange, 8.6);
assert.equal(boss?.monsterAbility?.type, 'vineField');
assert.equal(boss?.monsterAbility?.cooldown, 10.5);
assert.equal(boss?.monsterAbility?.duration, 5.4);
assert.equal(boss?.monsterAbility?.tickInterval, 0.75);
assert.equal(boss?.monsterAbility?.damagePerSecond, 5.6);
assert.equal(boss?.monsterAbility?.statusBuffId, 'mireSnared');
assert.equal(BUFF_DEFINITIONS.mireSnared?.modifiers?.[0]?.amount, 0.65);

const hunterModel = createUnitModel('mireHunter', 'enemy');
const bossModel = createUnitModel('rotrootColossus', 'enemy');
const javelinModel = createProjectileModel('mireJavelin', { color: '#8abf68' });
const thornVineModel = createProjectileModel('thornVine', { color: '#9fbd64' });
assert.ok(hunterModel.children.length > 0);
assert.ok(hunterModel.userData.parts?.projectileSocket);
assert.ok(bossModel.children.length > 0);
assert.ok(bossModel.userData.parts?.weaponPivot);
assert.ok(bossModel.userData.parts?.projectileSocket);
assert.ok(javelinModel.children.length >= 4);
assert.ok(thornVineModel.children.length >= 7);

const damageCalls = [];
const buffCalls = [];
const target = {
  id: 7,
  alive: true,
  underConstruction: false,
  position: new THREE.Vector3(1, 0, 2),
  projectileHitHeight: 1.5
};
const source = {
  id: 8,
  alive: true,
  team: 'enemy',
  position: new THREE.Vector3(0, 0, 0),
  projectileHitHeight: 2.62
};
const game = {
  elapsedTime: 12,
  scene: new THREE.Scene(),
  friendlyUnits: [target],
  enemyUnits: [],
  groundHeightAt: () => 0,
  scaleSpellAreaRadius: (radius) => radius,
  combat: {
    applyDamage: (...args) => {
      damageCalls.push(args);
      return true;
    }
  },
  buffs: {
    applyBuff: (...args) => {
      buffCalls.push(args);
      return true;
    }
  },
  effects: {
    spawnDamageNumber: () => {}
  },
  networkBridge: {
    notifyAreaEffectSpawn: () => {}
  }
};
game.areaEffects = new AreaEffectSystem(game);
const attacks = new AttackSystem(game);
assert.equal(attacks.castVineField(source, target.position, boss.monsterAbility), true);
assert.equal(game.areaEffects.zones.length, 1);
assert.equal(game.areaEffects.zones[0].kind, 'rootVines');
assert.equal(game.areaEffects.zones[0].target, 'opponent');
assert.equal(game.areaEffects.zones[0].defenseDamageType, 'magic');
assert.equal(damageCalls.length, 1, '藤蔓区生成时应立即造成首段伤害');
assert.ok(Math.abs(damageCalls[0][1] - 4.2) < 0.000001);
assert.equal(damageCalls[0][2], source);
assert.equal(damageCalls[0][4].defenseDamageType, 'magic');
assert.equal(buffCalls.length, 1);
assert.equal(buffCalls[0][1], 'mireSnared');
game.areaEffects.update(0.74);
assert.equal(damageCalls.length, 1, '未到 0.75 秒时不应重复结算');
game.areaEffects.update(0.02);
assert.equal(damageCalls.length, 2, '藤蔓区应按固定间隔持续结算');
game.areaEffects.destroy();

console.log('emerald marsh data and model tests passed');
