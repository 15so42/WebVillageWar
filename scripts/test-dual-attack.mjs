import assert from 'node:assert/strict';
import { UNIT_DEFINITIONS } from '../src/data/gameData.js';
import { AttributeSet } from '../src/systems/AttributeSet.js';
import { ModifierSystem } from '../src/systems/ModifierSystem.js';

for (const [type, definition] of Object.entries(UNIT_DEFINITIONS)) {
  assert.ok(Number.isFinite(definition.physicalAttack), `${type} 缺少物理攻击力`);
  assert.ok(Number.isFinite(definition.magicAttack), `${type} 缺少魔法攻击力`);
  const primaryAttack = definition.attackDamageType === 'magic'
    ? definition.magicAttack
    : definition.physicalAttack;
  assert.equal(primaryAttack, definition.damage, `${type} 迁移后主攻击力与旧伤害不一致`);
}

const attributes = new AttributeSet({
  maxHealth: 100,
  physicalAttack: 10,
  magicAttack: 6
});
const unit = {
  attributes,
  health: 100,
  definition: {
    physicalAttack: 10,
    magicAttack: 6,
    attackDamageType: 'physical',
    traits: []
  }
};
const modifiers = new ModifierSystem({});

assert.equal(modifiers.getPhysicalAttack(unit), 10);
assert.equal(modifiers.getMagicAttack(unit), 6);
assert.equal(modifiers.getAttackDamage(unit, 'physical'), 10);
assert.equal(modifiers.getAttackDamage(unit, 'magic'), 6);

attributes.addModifiers([
  { stat: 'attackPower', type: 'add', amount: 2 }
], 'test:both');
assert.equal(modifiers.getPhysicalAttack(unit), 12);
assert.equal(modifiers.getMagicAttack(unit), 8);

attributes.addModifiers([
  { stat: 'physicalAttack', type: 'add', amount: 3 }
], 'test:physical-only');
assert.equal(modifiers.getPhysicalAttack(unit), 15);
assert.equal(modifiers.getMagicAttack(unit), 8);

attributes.addModifier(
  { stat: 'attackPower', type: 'multiply', amount: 2 },
  'test:direct-both'
);
assert.equal(modifiers.getPhysicalAttack(unit), 30);
assert.equal(modifiers.getMagicAttack(unit), 16);

const magicContext = modifiers.createAttackContext(unit, {}, {
  attackDamageType: 'magic'
});
assert.equal(magicContext.damage, 16);
assert.equal(magicContext.attackDamageType, 'magic');

const physicalContext = modifiers.createAttackContext(unit, {});
assert.equal(physicalContext.damage, 30);
assert.equal(physicalContext.attackDamageType, 'physical');

console.log('dual attack tests passed');
