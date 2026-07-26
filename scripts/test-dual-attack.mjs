import assert from 'node:assert/strict';
import { BUFF_DEFINITIONS, TEAMS, UNIT_DEFINITIONS } from '../src/data/gameData.js';
import { AttributeSet } from '../src/systems/AttributeSet.js';
import { BuffSystem } from '../src/systems/BuffSystem.js';
import { CombatSystem } from '../src/systems/CombatSystem.js';
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

const combatGame = createCombatGame();
const swordsman = createCombatUnit({
  id: 101,
  team: TEAMS.PLAYER,
  type: 'swordsman',
  physicalAttack: 8,
  armor: 0,
  x: 0
});
const armoredEnemy = createCombatUnit({
  id: 102,
  team: TEAMS.ENEMY,
  type: 'skeletonSoldier',
  physicalAttack: 0,
  armor: 3,
  x: 1
});
swordsman.runtimeTraits.add('sunderArmor');
combatGame.friendlyUnits.push(swordsman);
combatGame.enemyUnits.push(armoredEnemy);

assert.equal(combatGame.modifiers.getArmor(armoredEnemy), 3);
assert.equal(combatGame.combat.applyAttack(swordsman, armoredEnemy), true);
assert.ok(armoredEnemy.buffs.has('armorShredded'));
assert.equal(combatGame.modifiers.getArmor(armoredEnemy), 2);

console.log('dual attack tests passed');

function createCombatGame() {
  const game = {
    elapsedTime: 0,
    friendlyUnits: [],
    enemyUnits: [],
    effects: {
      spawnDamageNumber() {},
      spawnHit() {},
      spawnRing() {},
      spawnHealNumber() {}
    },
    getAbilityStacks: () => 0,
    markEndlessEnemyCombatStarted() {},
    handleUnitDeath() {}
  };
  game.modifiers = new ModifierSystem(game);
  game.buffs = new BuffSystem(game);
  game.combat = new CombatSystem(game);
  return game;
}

function createCombatUnit({
  id,
  team,
  type,
  physicalAttack,
  armor,
  x
}) {
  const attributes = new AttributeSet({
    maxHealth: 50,
    maxShield: 0,
    physicalAttack,
    magicAttack: 0,
    knockback: 0,
    knockbackResistance: 0,
    dodgeChance: 0,
    maxDurability: 10,
    durabilityCost: 0
  });
  attributes.setBase('armor', armor, { min: -99 });
  attributes.setBase('magicResistance', 0, { min: -99 });
  return {
    id,
    team,
    type,
    alive: true,
    isBuilding: false,
    underConstruction: false,
    position: { x, y: 0, z: 0 },
    definition: {
      role: 'melee',
      physicalAttack,
      magicAttack: 0,
      attackDamageType: 'physical',
      knockback: 0,
      knockbackResistance: 0,
      armor,
      magicResistance: 0,
      dodgeChance: 0,
      traits: [],
      weapon: {
        name: '测试武器',
        maxDurability: 10,
        durabilityCost: 0
      }
    },
    attributes,
    buffs: new Map(),
    enchantments: new Map(),
    runtimeTraits: new Set(),
    health: 50,
    shield: 0,
    weapon: {
      name: '测试武器',
      durability: 10,
      maxDurability: 10
    },
    projectileHitHeight: 1.45,
    hitStunTimer: 0,
    knockbackVelocity: {
      addScaledVector() {},
      clampLength() {}
    },
    hasEnchantment: () => false,
    addBuff(buffId, definition = BUFF_DEFINITIONS[buffId], overrides = {}) {
      if (!definition) return null;
      const source = `buff:${buffId}`;
      const instance = {
        ...definition,
        ...overrides,
        id: buffId,
        level: Math.max(1, Math.floor(overrides.level ?? 1)),
        remaining: overrides.duration ?? definition.duration ?? 0
      };
      this.attributes.removeModifiersBySource(source);
      this.buffs.set(buffId, instance);
      this.attributes.addModifiers(instance.modifiers, source, {
        level: instance.level,
        buff: instance,
        owner: this
      });
      return instance;
    },
    takeRawDamage(amount, { bypassShield = false } = {}) {
      let remaining = Math.max(0, amount);
      if (!bypassShield && this.shield > 0) {
        const absorbed = Math.min(this.shield, remaining);
        this.shield -= absorbed;
        remaining -= absorbed;
      }
      this.health = Math.max(0, this.health - remaining);
      if (this.health <= 0) this.alive = false;
    }
  };
}
