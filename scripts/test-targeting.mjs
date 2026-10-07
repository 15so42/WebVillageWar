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

const wolf = {
  id: 7,
  alive: true,
  team: TEAMS.ENEMY,
  isWildlife: true,
  position: { x: 80, y: 0, z: 0 }
};
const fleeingPuppet = {
  id: 8,
  alive: true,
  team: TEAMS.PLAYER,
  position: { x: 82, y: 0, z: 0 },
  collisionRadius: 0.42,
  definition: { role: 'worker' }
};
const wildlifeGame = {
  modifiers: { getAggroRange: () => 9.5 },
  unitRegistry: { allUnits: [wolf, fleeingPuppet] },
  playerBase: null,
  enemyCamp: null,
  attacks: { cancelPendingAttacksFor: () => {} }
};
const wildlifeTargeting = new TargetingSystem(wildlifeGame);
wolf.target = fleeingPuppet;
assert.equal(
  wildlifeTargeting.isCurrentTargetValid(wolf, fleeingPuppet),
  true,
  'enemies should keep chasing across the map once they have a target'
);
assert.equal(
  wildlifeTargeting.acquireTarget(wolf),
  null,
  'enemies still only acquire targets within aggro range'
);
wolf.position = { x: 0, y: 0, z: 0 };
fleeingPuppet.position = { x: 3, y: 0, z: 0 };
wildlifeTargeting.rebuild();
assert.equal(
  wildlifeTargeting.acquireTarget(wolf),
  fleeingPuppet,
  'wildlife uses the same in-range acquire rule as other enemies'
);

// ---------------------------------------------------------------------------
// 守卫领地：路边营地与野生动物只打进入自己地盘的目标，不会跨岛追进基地。
// 巢穴夜袭单位没有 guardRadius，仍然是"接上目标就一直追"。
// ---------------------------------------------------------------------------
const HOME = { x: -14, y: 0, z: 52 };
const guarded = {
  id: 9,
  alive: true,
  team: TEAMS.ENEMY,
  position: { x: -14, y: 0, z: 52 },
  guardRadius: 9,
  homePoint: HOME
};
const nestRaider = {
  id: 10,
  alive: true,
  team: TEAMS.ENEMY,
  position: { x: -14, y: 0, z: 52 },
  guardRadius: 0,
  homePoint: null
};
const nearWorker = {
  id: 11,
  alive: true,
  team: TEAMS.PLAYER,
  position: { x: -14, y: 0, z: 46 },
  collisionRadius: 0,
  definition: {}
};
const farWorker = {
  id: 12,
  alive: true,
  team: TEAMS.PLAYER,
  position: { x: 0.4, y: 0, z: 43.4 },
  collisionRadius: 0,
  definition: {}
};
const guardGame = {
  modifiers: { getAggroRange: () => 12 },
  unitRegistry: { allUnits: [guarded, nestRaider] },
  playerBase: null,
  enemyCamp: null
};
const guardTargeting = new TargetingSystem(guardGame);
guarded.target = farWorker;
assert.equal(
  guardTargeting.isCurrentTargetValid(guarded, farWorker),
  false,
  '有领地的敌人不该追出领地（这正是"追进基地死循环"的根因）'
);
assert.equal(
  guardTargeting.isCurrentTargetValid(guarded, nearWorker),
  true,
  '进入领地的目标照打'
);
assert.equal(
  guardTargeting.isCurrentTargetValid(nestRaider, farWorker),
  true,
  '没有 guardRadius 的夜袭单位必须保持原来的永不脱战'
);
assert.equal(
  guardTargeting.isInsideGuardZone(guarded, nearWorker),
  true,
  '领地判定用目标位置：目标在领地内 → 允许'
);
assert.equal(
  guardTargeting.isInsideGuardZone(nestRaider, farWorker),
  true,
  '半径 ≤0 视为不限制'
);
guardGame.unitRegistry.allUnits = [guarded, farWorker];
guardTargeting.rebuild();
assert.equal(
  guardTargeting.acquireTarget(guarded),
  null,
  '领地外的玩家单位不该被索敌（出生点旁的守卫不该开局就锁住傀儡）'
);
guardGame.unitRegistry.allUnits = [guarded, nearWorker];
guardTargeting.rebuild();
assert.equal(
  guardTargeting.acquireTarget(guarded),
  nearWorker,
  '走进领地的玩家单位会被索敌'
);

console.log('Nearest-unit targeting checks passed.');
