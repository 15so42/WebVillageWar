import assert from 'node:assert/strict';
import { TEAMS } from '../src/data/gameData.js';
import { TargetingSystem } from '../src/systems/TargetingSystem.js';

const source = {
  id: 1,
  alive: true,
  team: TEAMS.ENEMY,
  position: { x: 0, y: 0, z: 0 },
  definition: {
    targetPriority: {
      supportWeight: 999,
      woundedWeight: 999,
      backlineWeight: 999
    }
  }
};
const nearestMelee = {
  id: 2,
  alive: true,
  team: TEAMS.PLAYER,
  position: { x: 2, y: 0, z: 0 },
  collisionRadius: 0,
  definition: { role: 'melee' }
};
const fartherSupport = {
  id: 3,
  alive: true,
  team: TEAMS.PLAYER,
  position: { x: 5, y: 0, z: 0 },
  collisionRadius: 0,
  health: 1,
  maxHealth: 100,
  definition: {
    role: 'support',
    support: true,
    attackRange: 9,
    attackDamageType: 'magic'
  }
};

const game = {
  unitRegistry: {
    allUnits: [source, fartherSupport, nearestMelee]
  },
  modifiers: {
    getAggroRange: () => 12
  },
  playerBase: null,
  enemyCamp: null
};

const targeting = new TargetingSystem(game);
targeting.rebuild();

assert.equal(
  targeting.acquireTarget(source),
  nearestMelee,
  'enemy targeting should choose the nearest legal unit without role or wounded preferences'
);

const playerSource = {
  id: 4,
  alive: true,
  team: TEAMS.PLAYER,
  position: { x: 0, y: 0, z: 10 },
  definition: {}
};
const nearestEnemy = {
  id: 5,
  alive: true,
  team: TEAMS.ENEMY,
  position: { x: 1, y: 0, z: 10 },
  collisionRadius: 0,
  definition: {}
};
const fartherEnemy = {
  id: 6,
  alive: true,
  team: TEAMS.ENEMY,
  position: { x: 4, y: 0, z: 10 },
  collisionRadius: 0,
  definition: {}
};
const playerGame = {
  ...game,
  unitRegistry: {
    allUnits: [playerSource, fartherEnemy, nearestEnemy]
  }
};
const playerTargeting = new TargetingSystem(playerGame);
playerTargeting.rebuild();

assert.equal(
  playerTargeting.acquireTarget(playerSource),
  nearestEnemy,
  'player targeting should use the same nearest-unit rule'
);

console.log('Nearest-unit targeting checks passed.');
