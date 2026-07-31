import assert from 'node:assert/strict';
import { AttributeSet } from '../src/systems/AttributeSet.js';
import { UNIT_GENERIC_UPGRADES } from '../src/data/cardUpgrades.js';

function makeClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name)
  };
}

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  location: {
    href: 'http://localhost/',
    search: ''
  },
  matchMedia: () => ({ matches: false }),
  addEventListener: () => {},
  removeEventListener: () => {},
  requestAnimationFrame: (callback) => setTimeout(callback, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  setTimeout,
  clearTimeout
};

globalThis.document = {
  body: {
    classList: makeClassList()
  }
};

const { Game } = await import('../src/systems/Game.js');

const ATTACK_UPGRADE = UNIT_GENERIC_UPGRADES.find((upgrade) => upgrade.id === 'unit-attack');
assert.ok(ATTACK_UPGRADE, 'unit attack training upgrade must exist');

function makeUnit() {
  const attributes = new AttributeSet({
    maxHealth: 100,
    maxDurability: 30,
    physicalAttack: 50,
    magicAttack: 20,
    armor: 10,
    magicResistance: 8
  });
  const unit = {
    alive: true,
    isWildlife: false,
    type: 'knight',
    ownerPlayerId: 'host',
    controllerPlayerId: 'host',
    attributes,
    health: 100,
    weapon: {
      durability: 30,
      attributes
    },
    clampToAttributeCaps() {}
  };
  Object.defineProperties(unit, {
    maxHealth: { get: () => attributes.get('maxHealth') },
    physicalAttack: { get: () => attributes.get('physicalAttack') },
    magicAttack: { get: () => attributes.get('magicAttack') },
    armor: { get: () => attributes.get('armor') },
    magicResistance: { get: () => attributes.get('magicResistance') }
  });
  Object.defineProperty(unit.weapon, 'maxDurability', {
    get: () => attributes.get('maxDurability')
  });
  return unit;
}

function makeGame(friendlyUnits = []) {
  return Object.assign(Object.create(Game.prototype), {
    localPlayerSlot: 'host',
    activeEconomySlot: 'host',
    friendlyUnits,
    teamGenericUpgradeCounts: new Map(),
    teamSpecialUpgrades: new Map(),
    unitBelongsToPlayer: () => true
  });
}

const trainedUnit = makeUnit();
trainedUnit.attributes.addModifier(
  { stat: 'physicalAttack', type: 'multiply', percent: 1 },
  'test:card-level'
);
trainedUnit.attributes.addModifier(
  { stat: 'magicAttack', type: 'multiply', percent: 1 },
  'test:card-level'
);

const game = makeGame([trainedUnit]);
assert.equal(trainedUnit.physicalAttack, 100);
assert.equal(trainedUnit.magicAttack, 40);

assert.equal(game.applyTeamGenericUpgrade(ATTACK_UPGRADE), true);
assert.equal(game.applyTeamGenericUpgrade(ATTACK_UPGRADE), true);

assert.equal(game.teamGenericUpgradeCounts.get(ATTACK_UPGRADE.id), 2);
assert.equal(trainedUnit.physicalAttack, 120);
assert.equal(trainedUnit.magicAttack, 48);

const replayedUnit = makeUnit();
replayedUnit.attributes.addModifier(
  { stat: 'physicalAttack', type: 'multiply', percent: 1 },
  'test:card-level'
);
replayedUnit.attributes.addModifier(
  { stat: 'magicAttack', type: 'multiply', percent: 1 },
  'test:card-level'
);
const replayGame = makeGame([replayedUnit]);
replayGame.teamGenericUpgradeCounts.set(ATTACK_UPGRADE.id, 2);
replayGame.applyTeamUpgradesToUnit(replayedUnit);

assert.equal(replayedUnit.physicalAttack, 120);
assert.equal(replayedUnit.magicAttack, 48);

console.log('Team generic upgrade training stays linear against base attributes.');
