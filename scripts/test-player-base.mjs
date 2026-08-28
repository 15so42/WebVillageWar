import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BALANCE } from '../src/data/gameData.js';
import {
  consumeBaseHealthLossMilestones,
  resolvePlayerBaseDamage,
  resolveStructureDamage
} from '../src/systems/playerBaseRules.js';

assert.equal(resolvePlayerBaseDamage(999, { isAttack: true, attackDamage: 1 }), 1);
assert.equal(resolvePlayerBaseDamage(0, { isAttack: true, attackDamage: 1 }), 1);
assert.equal(resolvePlayerBaseDamage(10, { isAttack: false, attackDamage: 1 }), 10);

assert.equal(resolveStructureDamage(999, { isAttack: true, attackDamage: 1 }), 1);
assert.equal(resolveStructureDamage(0, { isAttack: true, attackDamage: 1 }), 1);
assert.equal(resolveStructureDamage(10, { isAttack: false, attackDamage: 1 }), 10);

assert.deepEqual(
  consumeBaseHealthLossMilestones(9, 1, 10),
  { milestones: 1, progress: 0 }
);
assert.deepEqual(
  consumeBaseHealthLossMilestones(0, 25, 10),
  { milestones: 2, progress: 5 }
);
assert.deepEqual(
  consumeBaseHealthLossMilestones(4, 5, 10),
  { milestones: 0, progress: 9 }
);

assert.equal(BALANCE.playerBase.attackKnockback, 1.35);
const gameSource = readFileSync(new URL('../src/systems/Game.js', import.meta.url), 'utf8');
const playerBaseAttackSource = gameSource.match(
  /applyPlayerBaseAttack\(target\) \{([\s\S]*?)\n  updateEnemyCampAttack\(dt\)/
)?.[1] ?? '';
assert.match(playerBaseAttackSource, /applyKnockbackImpulse\(this, target, this\.playerBase\.position, knockback\)/);

console.log('Player-base damage and energy milestone checks passed.');
