import assert from 'node:assert/strict';
import { BuffSystem } from '../src/systems/BuffSystem.js';
import { ModifierSystem } from '../src/systems/ModifierSystem.js';
import {
  performSelfDestructAttacks,
  performSelfDestructExplosion,
  SELF_DESTRUCT_DAMAGE_PER_LEVEL,
  SELF_DESTRUCT_RADIUS,
  selfDestructDamageForLevel
} from '../src/systems/selfDestructRules.js';

const strikeCalls = [];
const selfDestructGame = {
  enemyUnits: [
    { id: 'near', alive: true, position: { x: 6, y: 0, z: 0 } },
    { id: 'far', alive: true, position: { x: 6.001, y: 0, z: 0 } }
  ],
  friendlyUnits: []
};
const selfDestructUnit = {
  alive: false,
  team: 'player',
  position: { x: 0, y: 0, z: 0 }
};

assert.equal(SELF_DESTRUCT_RADIUS, 6);
assert.equal(SELF_DESTRUCT_DAMAGE_PER_LEVEL, 3);
assert.equal(selfDestructDamageForLevel(3), 9);
assert.equal(performSelfDestructAttacks(
  selfDestructUnit,
  selfDestructGame,
  (source, target, options) => {
    strikeCalls.push({ source, target, options });
    return true;
  }
), 1);
assert.deepEqual(strikeCalls.map(({ target }) => target.id), ['near']);
assert.deepEqual(strikeCalls[0].options, {
  isExplosionDamage: true,
  allowDeadSourceEffects: true
});

const explosionCalls = [];
assert.equal(performSelfDestructExplosion(
  selfDestructUnit,
  selfDestructGame,
  3,
  (source, target, damage, options) => {
    explosionCalls.push({ source, target, damage, options });
    return true;
  }
), 1);
assert.deepEqual(explosionCalls.map(({ target }) => target.id), ['near']);
assert.equal(explosionCalls[0].damage, 9);
assert.deepEqual(explosionCalls[0].options, {
  isExplosionDamage: true,
  allowDeadSourceEffects: true
});

const modifierSystem = new ModifierSystem({});
const context = modifierSystem.createAttackContext(
  { definition: {}, alive: false },
  { definition: {} },
  { damage: 8, knockback: 0, isExplosionDamage: true, allowDeadSourceEffects: true }
);
assert.equal(context.isExplosionDamage, true);
assert.equal(context.allowDeadSourceEffects, true);

const buffEvents = [];
const buffSystem = {
  runBuffEffects(owner, eventName) {
    buffEvents.push([owner.id, eventName]);
  }
};
const deadSourceAttack = {
  isAttack: true,
  allowDeadSourceEffects: true,
  damageDealt: 6,
  source: { id: 'dead-source', alive: false },
  target: { id: 'target', alive: true }
};
BuffSystem.prototype.afterDamage.call(buffSystem, deadSourceAttack);
BuffSystem.prototype.afterAttack.call(buffSystem, deadSourceAttack);
assert.deepEqual(buffEvents, [
  ['dead-source', 'afterDamage'],
  ['target', 'receiveDamage'],
  ['dead-source', 'afterAttack']
]);

console.log('Self-destruct per-target attack checks passed.');
