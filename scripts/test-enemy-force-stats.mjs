import assert from 'node:assert/strict';
import { AttributeSet } from '../src/systems/AttributeSet.js';
import {
  ELITE_AND_BOSS_INITIAL_ATTACK_PENALTY,
  eliteOrBossInitialAttackModifiers
} from '../src/systems/enemyForceRules.js';

assert.equal(ELITE_AND_BOSS_INITIAL_ATTACK_PENALTY, -2);
assert.deepEqual(eliteOrBossInitialAttackModifiers(), [{
  stat: 'attackPower',
  type: 'add',
  amount: -2
}]);

const attributes = new AttributeSet({ physicalAttack: 10, magicAttack: 6 });
attributes.addModifiers([
  ...eliteOrBossInitialAttackModifiers(),
  { stat: 'attackPower', type: 'multiply', amount: 1.2 }
], 'test:elite-or-boss');
assert.equal(attributes.get('physicalAttack'), 9.6, '基础攻击先减 2，再按模式倍率成长');
assert.equal(attributes.get('magicAttack'), 4.8, '物理和魔法攻击都使用同一基础攻击修正');

console.log('Elite and Boss initial attack penalty checks passed.');
