import assert from 'node:assert/strict';

const [
  { SnapshotBuilder },
  { ClientMirror }
] = await Promise.all([
  import('../src/network/host/SnapshotBuilder.js'),
  import('../src/network/client/ClientMirror.js')
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
    runShopFreeReward: false,
    runShopActiveCategory: null,
    runShopChoices: [],
    ...overrides
  };
}

const hostCards = {
  energy: 6,
  handCards: [card('hand-swordsman', 2)],
  drawPile: [],
  discardPile: [],
  temporaryCards: [],
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

const privateState = new SnapshotBuilder(hostGame, { matchId: 'private-state-test' })
  .buildPrivateState('guest');

assert.equal(privateState.zones.hand[0].level, 2);
assert.equal(privateState.zones.reserve[0].level, 2);
assert.deepEqual(privateState.cardRuntime.levelBonuses, [['swordsman', 1]]);
assert.equal(privateState.cardRuntime.upgrades[0].upgradeIds[0], 'swordsman:runtime-level:test');

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

new ClientMirror(clientGame).applyPrivateState(privateState);

assert.equal(renderedHandLevel, 2);
assert.equal(clientCards.handCards[0].level, 2);
assert.equal(clientCards.reservePile[0].level, 2);
assert.equal(clientCards.runtimeCardLevelBonuses.get('swordsman'), 1);
assert.deepEqual(
  clientCards.runtimeCardUpgrades.get('swordsman').upgradeIds,
  ['swordsman:runtime-level:test']
);
assert.equal(clientRun.silver, 24);
assert.equal(clientGame.silver, 24);

console.log('Coop private card and silver state checks passed.');
