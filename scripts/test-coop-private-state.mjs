import assert from 'node:assert/strict';

const [
  { SnapshotBuilder },
  { ClientMirror },
  { CoopLobbySystem }
] = await Promise.all([
  import('../src/network/host/SnapshotBuilder.js'),
  import('../src/network/client/ClientMirror.js'),
  import('../src/systems/CoopLobbySystem.js')
]);

function card(instanceId, level) {
  return {
    id: 'swordsman',
    instanceId,
    name: '剑士',
    kind: 'summon',
    level,
    runtimeLevelBonusApplied: Math.max(0, level - 1)
  };
}

function runState(overrides = {}) {
  return {
    silver: 24,
    strategyEvent: null,
    strategyRewardRerollCount: 0,
    waveRewardDeck: ['fire-enchant'],
    runShopFreeReward: false,
    runShopActiveCategory: null,
    runShopChoices: [],
    ...overrides
  };
}

const temporaryImmortalityCard = {
  id: 'temporary-immortality-enchant',
  instanceId: 'temporary-immortality-test',
  name: '不朽附魔',
  kind: 'enchant',
  level: 1,
  energyCost: 0,
  target: 'friendly-unit',
  radius: 1.1,
  uses: 1,
  maxUses: 1,
  remainingUses: 1,
  lootOnly: true,
  enchantmentId: 'immortality',
  effect: {
    type: 'apply-buff',
    buffId: 'immortality'
  }
};

const hostCards = {
  energy: 6,
  handCards: [card('hand-swordsman', 2)],
  drawPile: [],
  discardPile: [],
  temporaryCards: [temporaryImmortalityCard],
  exilePile: [],
  reservePile: [card('reserve-swordsman', 2)],
  runtimeCardLevelBonuses: new Map([['swordsman', 1]]),
  runtimeCardUpgrades: new Map([['swordsman', {
    upgradeIds: ['swordsman:runtime-level:test'],
    unitUpgradeIds: []
  }]]),
  serializeCooldowns: () => []
};
const hostRun = runState();
const hostGame = {
  localPlayerSlot: 'guest',
  players: { guest: hostRun },
  cardSystems: { guest: hostCards },
  cardSystem: hostCards,
  strategyEvent: null,
  runShopChoices: [],
  runShopFreeReward: false,
  runShopActiveCategory: null,
  coopRewardWaitSlots: null,
  coopRewardKind: null,
  abilitySystems: {},
  getSilver: () => hostRun.silver,
  coopRewardSecondsRemaining: () => null
};

const snapshotBuilder = new SnapshotBuilder(hostGame, { matchId: 'private-state-test' });
const privateState = snapshotBuilder.buildPrivateState('guest');

assert.equal(privateState.zones.hand[0].level, 2);
assert.equal(privateState.zones.reserve[0].level, 2);
assert.equal(privateState.zones.temporary[0].target, 'friendly-unit');
assert.equal(privateState.zones.temporary[0].enchantmentId, 'immortality');
assert.equal(privateState.zones.temporary[0].effect.buffId, 'immortality');
assert.equal(privateState.zones.temporary[0].uses, 1);
assert.deepEqual(privateState.cardRuntime.levelBonuses, [['swordsman', 1]]);
assert.equal(privateState.cardRuntime.upgrades[0].upgradeIds[0], 'swordsman:runtime-level:test');
assert.deepEqual(privateState.waveRewardDeck, ['fire-enchant']);

hostGame.runShopActiveCategory = 'unit';
hostGame.shopPrices = { unit: 15 };
hostGame.runShopChoices = [{
  choiceId: 'paid-shop-choice',
  title: '剑士',
  prepaid: true,
  prepaidPrice: 12,
  card: card('paid-shop-swordsman', 2)
}];
const paidShopPrivateState = snapshotBuilder.buildPrivateState('guest');
assert.equal(paidShopPrivateState.runShopState.prices.unit, 15);
assert.equal(paidShopPrivateState.runShopState.choices[0].prepaid, true);
assert.equal(paidShopPrivateState.runShopState.choices[0].prepaidPrice, 12);

hostRun.strategyEvent = {
  type: 'wave-reward',
  title: '波次奖励',
  summary: '请选择一项奖励。',
  choices: [{
    choiceId: 'reward-choice',
    title: '剑士',
    rewardSource: 'wave-reward-deck',
    card: card('reward-swordsman', 2)
  }]
};
hostGame.runShopFreeReward = true;
hostGame.runShopActiveCategory = 'unit';
hostGame.runShopChoices = [{ choiceId: 'shop-choice', title: '剑士', card: card('shop-swordsman', 2) }];
hostGame.coopRewardWaitSlots = new Set(['guest']);
hostGame.coopRewardKind = 'strategy';
hostGame.coopRewardSecondsRemaining = () => 9;
const countdownPrivateState = snapshotBuilder.buildPrivateState('guest');
assert.equal(countdownPrivateState.coopRewardAutoSelectSecondsRemaining, 9);
assert.equal('autoSelectSecondsRemaining' in countdownPrivateState.strategyUi, false);
assert.equal('autoSelectSecondsRemaining' in countdownPrivateState.runShopState, false);
assert.equal(countdownPrivateState.strategyUi.choices[0].rewardSource, 'wave-reward-deck');

let renderedHandLevel = null;
const clientCards = {
  energy: 0,
  handCards: [card('old-hand-swordsman', 1)],
  drawPile: [],
  discardPile: [],
  temporaryCards: [],
  exilePile: [],
  reservePile: [card('old-reserve-swordsman', 1)],
  runtimeCardLevelBonuses: new Map(),
  runtimeCardUpgrades: new Map(),
  updateEnergyUi: () => {},
  updateCardAffordability: () => {},
  renderHand() {
    renderedHandLevel = this.handCards[0]?.level ?? null;
  },
  renderTemporaryCards: () => {},
  updatePileUi: () => {},
  applyCooldownSnapshot: () => {}
};
const clientRun = runState({ silver: 0 });
const clientGame = {
  localPlayerId: 'guest',
  localPlayerSlot: 'guest',
  players: { guest: clientRun },
  cardSystem: clientCards,
  silver: 0,
  updateSilverHud: () => {},
  applyNetworkPrivateUi: () => {}
};

const transportedPrivateState = JSON.parse(JSON.stringify(privateState));
const clientMirror = new ClientMirror(clientGame);
clientMirror.applyPrivateState(transportedPrivateState);

assert.equal(renderedHandLevel, 2);
assert.equal(clientCards.handCards[0].level, 2);
assert.equal(clientCards.reservePile[0].level, 2);
assert.equal(clientCards.temporaryCards[0].target, 'friendly-unit');
assert.equal(clientCards.temporaryCards[0].enchantmentId, 'immortality');
assert.equal(clientCards.temporaryCards[0].effect.buffId, 'immortality');
assert.equal(clientCards.temporaryCards[0].uses, 1);
assert.equal(clientCards.runtimeCardLevelBonuses.get('swordsman'), 1);
assert.deepEqual(
  clientCards.runtimeCardUpgrades.get('swordsman').upgradeIds,
  ['swordsman:runtime-level:test']
);
assert.equal(clientRun.silver, 24);
assert.equal(clientGame.silver, 24);
assert.deepEqual(clientRun.waveRewardDeck, ['fire-enchant']);

const guardedHostUnit = {
  id: 'guarded-unit',
  team: 'player',
  factionId: 'player',
  type: 'swordsman',
  ownerPlayerId: 'guest',
  controllerPlayerId: 'guest',
  health: 18,
  maxHealth: 18,
  physicalAttack: 5,
  magicAttack: 0,
  shield: 0,
  maxShield: 0,
  maxEnchantmentSlots: 5,
  weapon: { durability: 20, maxDurability: 20 },
  underConstruction: false,
  buildProgress: 1,
  selected: false,
  controlMode: 'guard',
  guardPoint: { x: 4.26, y: 0.4, z: -7.5 },
  guardRadius: 8.75,
  effects: [],
  enchantments: new Map(),
  position: { x: 9, y: 0.4, z: -1 },
  mesh: { rotation: { y: 0 } }
};
const guardedSnapshot = snapshotBuilder.serializeUnitState(guardedHostUnit);
assert.deepEqual(guardedSnapshot.guardPoint, [4.26, 0.4, -7.5]);
assert.equal(guardedSnapshot.guardRadius, 8.75);

const guardedClientUnit = {
  health: 18,
  position: { y: 0 },
  controlMode: 'normal',
  guardPoint: null,
  guardRadius: null,
  statusUiDirty: false
};
clientMirror.applyUnitState(guardedClientUnit, {
  isGuarding: true,
  guardPoint: guardedSnapshot.guardPoint,
  guardRadius: guardedSnapshot.guardRadius
});
assert.equal(guardedClientUnit.controlMode, 'guard');
assert.deepEqual(guardedClientUnit.guardPoint.toArray(), [4.26, 0.4, -7.5]);
assert.equal(guardedClientUnit.guardRadius, 8.75);

const completedMatchController = { id: 'disposed-controller' };
const freshRoomController = { id: 'fresh-controller' };
const retainedLobby = Object.assign(Object.create(CoopLobbySystem.prototype), {
  controller: completedMatchController,
  notice: '上一局结束',
  joinRoomId: 'OLDROOM'
});
retainedLobby.setController(freshRoomController);
assert.equal(retainedLobby.controller, freshRoomController, '保留的大厅必须改绑到下一局的新控制器');
assert.equal(retainedLobby.notice, '');
assert.equal(retainedLobby.joinRoomId, '');

hostGame.endlessDifficulty = 3.25;
hostGame.endlessPerformanceMultiplier = -0.35;
const flowPatches = [];
snapshotBuilder.collectFlowPatches(flowPatches);
assert.equal(flowPatches[0].payload.changes.endlessPerformanceMultiplier, -0.35);
clientMirror.applyMatchPatch(flowPatches[0].payload);
assert.equal(clientGame.endlessDifficulty, 3.25);
assert.equal(clientGame.endlessPerformanceMultiplier, -0.35);

console.log('Coop private card and silver state checks passed.');
