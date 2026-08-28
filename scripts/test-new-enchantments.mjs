import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BUFF_DEFINITIONS,
  CARD_DEFINITIONS,
  ENCHANTMENTS
} from '../src/data/gameData.js';
import { AttributeSet } from '../src/systems/AttributeSet.js';
import { BuffSystem } from '../src/systems/BuffSystem.js';
import { EffectsSystem } from '../src/systems/EffectsSystem.js';
import { UnitEntity } from '../src/entities/UnitEntity.js';

const enchantmentCards = new Map(
  CARD_DEFINITIONS.filter((card) => card.kind === 'enchant').map((card) => [card.enchantmentId, card])
);
for (const id of ['undying', 'triumph', 'assault', 'shockwave', 'solarFlare', 'fireworks']) {
  assert.equal(ENCHANTMENTS[id], BUFF_DEFINITIONS[id], `${id} must be a registered enchantment`);
  assert.equal(enchantmentCards.get(id)?.effect?.buffId, id, `${id} must have a playable enchantment card`);
  assert.equal(enchantmentCards.get(id)?.energyCost, 2);
}

{
  const game = createGame();
  const source = createUnit({ id: 1, team: 'player', maxHealth: 40, health: 10 });
  const target = createUnit({ id: 2, team: 'enemy', x: 1 });
  game.friendlyUnits.push(source);
  game.enemyUnits.push(target);
  attachGame(game, source, target);
  game.buffs.applyBuff(source, 'undying', source, { level: 3 });

  const first = attackContext(source, target, 5);
  game.buffs.modifyAttack(first);
  approximately(first.damage, 7.64);
  first.damageDealt = first.damage;
  game.buffs.afterDamage(first);
  approximately(source.health, 12.64);

  game.elapsedTime = 2;
  const coolingDown = attackContext(source, target, 5);
  game.buffs.modifyAttack(coolingDown);
  assert.equal(coolingDown.damage, 5);

  game.elapsedTime = 6;
  const readyAgain = attackContext(source, target, 5);
  game.buffs.modifyAttack(readyAgain);
  approximately(readyAgain.damage, 7.64);
}

{
  const game = createGame();
  const source = createUnit({ id: 3, team: 'player' });
  const target = createUnit({ id: 4, team: 'enemy', x: 1 });
  game.friendlyUnits.push(source);
  game.enemyUnits.push(target);
  attachGame(game, source, target);
  game.buffs.applyBuff(source, 'assault', source, { level: 3 });
  const bonuses = [];
  for (let index = 0; index < 5; index += 1) {
    const context = attackContext(source, target, 5);
    game.buffs.modifyAttack(context);
    bonuses.push(context.damage - 5);
  }
  assert.deepEqual(bonuses, [1, 2, 3, 0, 1]);
}

{
  const game = createGame();
  const source = createUnit({ id: 5, team: 'player', maxHealth: 40, health: 20 });
  const victim = createUnit({ id: 6, team: 'enemy', x: 1, alive: false });
  game.friendlyUnits.push(source);
  game.enemyUnits.push(victim);
  attachGame(game, source, victim);
  game.buffs.applyBuff(source, 'triumph', source, { level: 2 });
  game.buffs.unitDeath(victim, source);
  assert.equal(source.maxHealth, 42);
  assert.equal(source.health, 26);

  const upgraded = source.addBuff('triumph', BUFF_DEFINITIONS.triumph, { level: 1, source });
  assert.equal(upgraded.level, 3);
  assert.equal(upgraded.triumphHealthBonus, 2);
  assert.equal(source.maxHealth, 42, 'upgrading triumph must preserve earned maximum health');
}

{
  const game = createGame();
  const source = createUnit({ id: 7, team: 'player', maxDurability: 40 });
  const nearEnemy = createUnit({ id: 8, team: 'enemy', x: 4 });
  const farEnemy = createUnit({ id: 9, team: 'enemy', x: 5.1 });
  game.friendlyUnits.push(source);
  game.enemyUnits.push(nearEnemy, farEnemy);
  attachGame(game, source, nearEnemy, farEnemy);
  game.buffs.applyBuff(source, 'shockwave', source, { level: 2 });
  source.spendDurability(40);
  assert.equal(game.records.damage.length, 1);
  assert.equal(game.records.damage[0].target, nearEnemy);
  approximately(game.records.damage[0].amount, 1.6);
  assert.equal(game.records.shockwaves.length, 1);
  source.spendDurability(10);
  assert.equal(game.records.shockwaves.length, 1, 'zero durability must not retrigger without recovery');
  source.restoreDurability(40);
  source.spendDurability(40);
  assert.equal(game.records.shockwaves.length, 1, 'shockwave must respect its four-second cooldown');
  game.elapsedTime = 4;
  source.restoreDurability(40);
  source.spendDurability(40);
  assert.equal(game.records.shockwaves.length, 2);
}

{
  const game = createGame();
  const source = createUnit({ id: 10, team: 'player', maxHealth: 40 });
  const nearEnemy = createUnit({ id: 11, team: 'enemy', x: 4.9 });
  const farEnemy = createUnit({ id: 12, team: 'enemy', x: 5.1 });
  game.friendlyUnits.push(source);
  game.enemyUnits.push(nearEnemy, farEnemy);
  attachGame(game, source, nearEnemy, farEnemy);
  game.buffs.applyBuff(source, 'solarFlare', source, { level: 2 });
  game.buffs.update(5, [source]);
  assert.equal(game.records.damage.length, 1);
  assert.equal(game.records.damage[0].target, nearEnemy);
  approximately(game.records.damage[0].amount, 3.04);
  assert.equal(game.records.solarPulses.length, 1);
}

{
  const game = createGame();
  const source = createUnit({ id: 13, team: 'player', health: 40 });
  const ally = createUnit({ id: 14, team: 'player', x: 2, health: 30 });
  const target = createUnit({ id: 15, team: 'enemy', x: 1 });
  const secondEnemy = createUnit({ id: 16, team: 'enemy', x: 6.5 });
  const farEnemy = createUnit({ id: 17, team: 'enemy', x: 8.1 });
  game.friendlyUnits.push(source, ally);
  game.enemyUnits.push(target, secondEnemy, farEnemy);
  attachGame(game, source, ally, target, secondEnemy, farEnemy);
  game.buffs.applyBuff(source, 'fireworks', source, { level: 2 });
  const context = attackContext(source, target, 5);
  context.damageDealt = 5;
  game.buffs.afterDamage(context);
  assert.deepEqual(game.records.attacks.map((entry) => entry.target.id), [15, 16]);
  assert(game.records.attacks.every((entry) => entry.override.damage === 2));
  assert(game.records.attacks.every((entry) => entry.override.damageTypes.has('fireworks')));
  assert.equal(ally.health, 32);
  assert.equal(game.records.fireworks.length, 1);
  approximately(game.records.fireworks[0].position.y, 2.2);
}

{
  const game = createGame();
  const source = createUnit({ id: 18, team: 'player' });
  attachGame(game, source);
  const undying = source.addBuff('undying', BUFF_DEFINITIONS.undying, { level: 1, source });
  undying.undyingReadyAt = 12;
  const assault = source.addBuff('assault', BUFF_DEFINITIONS.assault, { level: 1, source });
  assault.assaultStacks = 1;
  assert.equal(source.addBuff('undying', BUFF_DEFINITIONS.undying, { level: 1, source }).undyingReadyAt, 12);
  assert.equal(source.addBuff('assault', BUFF_DEFINITIONS.assault, { level: 1, source }).assaultStacks, 1);
}

{
  const scene = new THREE.Scene();
  const effects = new EffectsSystem(scene);
  effects.spawnYellowShockwave(new THREE.Vector3(), 5);
  effects.spawnSolarFlarePulse(new THREE.Vector3(), 5);
  effects.spawnFirework(new THREE.Vector3(0, 2, 0), 7);
  const flags = effects.effects.map((entry) => entry.object.userData);
  assert(flags.some((data) => data.isYellowShockwave));
  assert(flags.some((data) => data.isSolarFlarePulse));
  assert(flags.some((data) => data.isEnchantmentFirework));
  const particleMaps = [];
  effects.effects.forEach(({ object }) => object.traverse((child) => {
    if (child.isSprite) particleMaps.push(child.material.map?.userData?.particleFalloff);
  }));
  assert(particleMaps.length > 0 && particleMaps.every((falloff) => falloff === 'tight'));
  effects.update(0.1);
  effects.destroy();
}

globalThis.document = {
  createElement() {
    return {
      className: '',
      innerHTML: '',
      querySelector() {
        return {};
      },
      remove() {}
    };
  }
};
const visualUnit = new UnitEntity({
  type: 'swordsman',
  team: 'player',
  position: new THREE.Vector3()
});
visualUnit.addBuff('solarFlare', BUFF_DEFINITIONS.solarFlare, { level: 1, source: visualUnit });
visualUnit.updateVisual(null, 1 / 60);
const solarAura = visualUnit.enchantHalo.children.find((child) => child.userData.isSolarFlameAura);
assert.equal(solarAura?.visible, true);
assert.equal(solarAura?.userData.particles.length, 8);
assert(solarAura.userData.particles.every((particle) => (
  particle.material.map?.userData?.particleFalloff === 'tight'
)));

console.log('New enchantment focused checks passed.');

function createGame() {
  const records = {
    attacks: [],
    damage: [],
    shockwaves: [],
    solarPulses: [],
    fireworks: []
  };
  const game = {
    elapsedTime: 0,
    friendlyUnits: [],
    enemyUnits: [],
    records,
    effects: {
      spawnRing() {},
      spawnDamageNumber() {},
      spawnHealNumber() {},
      spawnYellowShockwave(position, radius) {
        records.shockwaves.push({ position, radius });
      },
      spawnSolarFlarePulse(position, radius) {
        records.solarPulses.push({ position, radius });
      },
      spawnFirework(position, radius) {
        records.fireworks.push({ position, radius });
      }
    },
    combat: {
      applyDamage(target, amount, source, knockback, context) {
        records.damage.push({ target, amount, source, knockback, context });
        return true;
      },
      applyAttack(source, target, override) {
        records.attacks.push({ source, target, override });
        return true;
      }
    }
  };
  game.buffs = new BuffSystem(game);
  return game;
}

function createUnit({
  id,
  team,
  x = 0,
  z = 0,
  maxHealth = 40,
  health = maxHealth,
  maxDurability = 20,
  alive = true
}) {
  const attributes = new AttributeSet({
    maxHealth,
    maxShield: 0,
    attackRange: 4,
    physicalAttack: 5,
    magicAttack: 0,
    maxDurability,
    durabilityCost: 1
  });
  const unit = {
    id,
    team,
    attributes,
    buffs: new Map(),
    enchantments: new Map(),
    enchantHalo: { children: [] },
    maxEnchantmentSlots: 12,
    alive,
    health,
    shield: 0,
    position: new THREE.Vector3(x, 0, z),
    projectileHitHeight: 1.45,
    weapon: { durability: maxDurability },
    statusUiDirty: false,
    get maxHealth() {
      return this.attributes.get('maxHealth');
    },
    get maxShield() {
      return this.attributes.get('maxShield');
    },
    addBuff: UnitEntity.prototype.addBuff,
    hasEnchantment: UnitEntity.prototype.hasEnchantment,
    clampToAttributeCaps: UnitEntity.prototype.clampToAttributeCaps,
    restoreHealth: UnitEntity.prototype.restoreHealth,
    restoreDurability: UnitEntity.prototype.restoreDurability,
    spendDurability: UnitEntity.prototype.spendDurability
  };
  Object.defineProperty(unit.weapon, 'maxDurability', {
    get() {
      return attributes.get('maxDurability');
    }
  });
  return unit;
}

function attachGame(game, ...units) {
  units.forEach((unit) => {
    unit.game = game;
  });
}

function attackContext(source, target, damage) {
  return {
    source,
    target,
    damage,
    damageTypes: new Set(),
    attackDamageType: 'physical',
    isAttack: true
  };
}

function approximately(actual, expected, epsilon = 1e-8) {
  assert(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be approximately ${expected}`);
}
