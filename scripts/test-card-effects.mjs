import assert from 'node:assert/strict';
import { BUFF_DEFINITIONS } from '../src/data/gameData.js';
import { CardEffectSystem } from '../src/systems/CardEffectSystem.js';
import { AttributeSet } from '../src/systems/AttributeSet.js';
import { BuffSystem } from '../src/systems/BuffSystem.js';

const applied = [];
const targetUnit = {
  position: { x: 0, y: 0, z: 0 },
  projectileHitHeight: 1.5,
  enchantments: new Map(),
  maxEnchantmentSlots: 12
};
const game = {
  buffs: {
    applyBuff(target, buffId, source, overrides = {}) {
      applied.push({ buffId, level: overrides.level });
      target.enchantments.set(`${buffId}:${applied.length}`, {
        id: buffId,
        level: overrides.level
      });
      return { id: buffId, color: '#b68cff' };
    }
  },
  effects: {
    spawnRing() {},
    spawnDamageNumber() {}
  },
  selectUnit() {}
};
const effects = new CardEffectSystem(game);
const previousRandom = Math.random;
Math.random = () => 0;
try {
  const result = effects.applyRandomEnchantments({
    card: {
      id: 'temporary-mana-surge-enchant',
      level: 8,
      color: '#b68cff'
    },
    effect: {
      type: 'apply-random-enchantments',
      count: 5,
      level: 1
    },
    targetUnit
  });
  assert.equal(result, true);
  assert.equal(applied.length, 5);
  assert.ok(applied.every((entry) => entry.level === 1));
} finally {
  Math.random = previousRandom;
}

const buffGame = {
  friendlyUnits: [],
  enemyUnits: [],
  effects: {
    spawnRing() {},
    spawnDamageNumber() {},
    spawnPoisonParticles() {}
  }
};
buffGame.buffs = new BuffSystem(buffGame);

const supportTarget = createBuffUnit({
  armor: 3,
  magicResistance: 2,
  maxHealth: 40,
  maxShield: 0
});
buffGame.buffs.applyBuff(supportTarget, 'overhealShield', null, { level: 2 });
assert.equal(supportTarget.maxShield, 4);
buffGame.buffs.onOverheal(supportTarget, 6);
assert.equal(supportTarget.shield, 4);

buffGame.buffs.applyBuff(supportTarget, 'shieldWard', null, { level: 3 });
supportTarget.shield = 10;
const shieldDamageContext = {
  target: supportTarget,
  damage: 5,
  bypassShield: false,
  damageTypes: new Set()
};
buffGame.buffs.beforeShieldDamage(shieldDamageContext);
assert.equal(shieldDamageContext.damage, 2.75);

const plagueTarget = createBuffUnit({
  armor: 5,
  magicResistance: 4,
  maxHealth: 50,
  maxShield: 0
});
buffGame.buffs.applyBuff(plagueTarget, 'plague', null, { level: 3, duration: 3 });
assert.equal(plagueTarget.armor, 3);
assert.equal(plagueTarget.magicResistance, 2);

console.log('card effect tests passed');

function createBuffUnit({
  armor,
  magicResistance,
  maxHealth,
  maxShield
}) {
  const attributes = new AttributeSet({
    maxHealth,
    maxShield,
    physicalAttack: 0,
    magicAttack: 0,
    knockback: 0,
    maxDurability: 1,
    durabilityCost: 0
  });
  attributes.setBase('armor', armor, { min: -99 });
  attributes.setBase('magicResistance', magicResistance, { min: -99 });
  const unit = {
    alive: true,
    canReceiveBuffs: true,
    immuneToStatusEffects: false,
    position: { x: 0, y: 0, z: 0 },
    projectileHitHeight: 1.45,
    definition: { traits: [] },
    attributes,
    buffs: new Map(),
    enchantments: new Map(),
    shield: 0,
    game: buffGame,
    get maxHealth() {
      return this.attributes.get('maxHealth');
    },
    get maxShield() {
      return this.attributes.get('maxShield');
    },
    get armor() {
      return this.attributes.get('armor');
    },
    get magicResistance() {
      return this.attributes.get('magicResistance');
    },
    addBuff(buffId, definition = BUFF_DEFINITIONS[buffId], overrides = {}) {
      if (!definition) return null;
      const source = `buff:${buffId}`;
      const instance = {
        ...definition,
        ...overrides,
        id: buffId,
        level: Math.max(1, Math.floor(overrides.level ?? definition.level ?? 1)),
        remaining: overrides.duration ?? definition.duration ?? 0
      };
      this.attributes.removeModifiersBySource(source);
      this.buffs.set(buffId, instance);
      this.attributes.addModifiers(instance.modifiers, source, {
        level: instance.level,
        buff: instance,
        owner: this
      });
      if (definition.category === 'enchantment') {
        this.enchantments.set(buffId, instance);
      }
      return instance;
    },
    restoreShield(amount) {
      const previousShield = this.shield;
      this.shield = Math.min(this.maxShield, Math.max(0, this.shield + amount));
      return this.shield - previousShield;
    }
  };
  return unit;
}
