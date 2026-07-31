import assert from 'node:assert/strict';

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

const [
  { Game },
  { CommandValidator },
  { COMMAND, GAME_PROTOCOL_VERSION, MSG }
] = await Promise.all([
  import('../src/systems/Game.js'),
  import('../src/network/host/CommandValidator.js'),
  import('../src/network/protocol/messages.js')
]);

function makeRun(overrides = {}) {
  return {
    connected: true,
    strategyEvent: null,
    shopPrices: { unit: 12 },
    strategyRewardRerollCount: 0,
    runShopFreeReward: true,
    runShopActiveCategory: 'unit',
    runShopChoices: [{ choiceId: 'choice-a' }],
    runShopPendingOffers: { unit: [{ choiceId: 'choice-a' }] },
    runShopAutoSelectSecondsRemaining: 12,
    silver: 0,
    runCardsPlayedCount: 0,
    waveRewardDeck: [],
    acquiredUnitCardTypes: new Set(),
    teamGenericUpgradeCounts: {},
    teamSpecialUpgrades: new Set(),
    teamSupportModifiersApplied: new Set(),
    ...overrides
  };
}

function makeCommand({ playerId, seq, name, payload = {} }) {
  return {
    type: MSG.COMMAND,
    gameProtocolVersion: GAME_PROTOCOL_VERSION,
    matchId: 'match-test',
    clientSeq: seq,
    expectedPhaseRevision: 4,
    name,
    payload
  };
}

{
  const game = Object.assign(Object.create(Game.prototype), {
    coopRewardAutoSelectSecondsRemaining: 7,
    runShopAutoSelectSecondsRemaining: 7,
    strategyEvent: null,
    runShopOpen: false
  });

  assert.equal(game.setCoopRewardCountdownSeconds(null, { force: true }), true);
  assert.equal(game.coopRewardAutoSelectSecondsRemaining, null);
  assert.equal(game.runShopAutoSelectSecondsRemaining, null);
}

{
  let waitingShown = 0;
  const hostRun = makeRun();
  const guestRun = makeRun();
  const game = Object.assign(Object.create(Game.prototype), {
    localPlayerSlot: 'host',
    activeEconomySlot: 'host',
    players: { host: hostRun, guest: guestRun },
    cardSystem: { clearHint: () => {} },
    clock: { getDelta: () => 0 },
    networkBridge: { markPrivateStateDirty: () => {} },
    coopRewardKind: 'run-shop',
    coopRewardWaitSlots: new Set(['host', 'guest']),
    runShopUi: {
      overlay: {
        hidden: false,
        setAttribute(name, value) {
          this[name] = value;
          if (name === 'hidden') this.hidden = true;
        }
      },
      choices: { hidden: false },
      root: { classList: makeClassList() },
      toggle: { classList: makeClassList() }
    },
    strategyEvent: null,
    shopPrices: hostRun.shopPrices,
    strategyRewardRerollCount: hostRun.strategyRewardRerollCount,
    runShopFreeReward: true,
    runShopActiveCategory: 'unit',
    runShopChoices: hostRun.runShopChoices,
    runShopPendingOffers: hostRun.runShopPendingOffers,
    runShopAutoSelectSecondsRemaining: 12,
    silver: 0,
    runCardsPlayedCount: 0,
    waveRewardDeck: [],
    acquiredUnitCardTypes: new Set(),
    teamGenericUpgradeCounts: {},
    teamSpecialUpgrades: new Set(),
    teamSupportModifiersApplied: new Set(),
    clearCoopRewardAutoSelectTimer: () => {},
    hideCoopRunShopWaitingUi: () => {},
    showCoopRunShopWaitingUi: () => {
      waitingShown += 1;
    },
    continueAfterStrategyFlow: () => {}
  });

  game.finishCoopRunShop('host');

  assert.equal(game.runShopFreeReward, false);
  assert.equal(hostRun.runShopFreeReward, false);
  assert.deepEqual(hostRun.runShopChoices, []);
  assert.deepEqual(hostRun.runShopPendingOffers, {});
  assert.equal(game.coopRewardWaitSlots.has('host'), false);
  assert.equal(game.coopRewardWaitSlots.has('guest'), true);
  assert.equal(game.runShopUi.overlay.hidden, true);
  assert.equal(game.runShopOpen, false);
  assert.equal(waitingShown, 1);

  game.withPlayerContext('host', () => {
    assert.equal(game.runShopFreeReward, false);
    assert.deepEqual(game.runShopChoices, []);
    assert.deepEqual(game.runShopPendingOffers, {});
  });
}

{
  let waitingShown = 0;
  let opened = 0;
  const game = Object.assign(Object.create(Game.prototype), {
    levelFinished: false,
    levelSession: { debug: false },
    strategyEvent: null,
    runShopFreeReward: false,
    runShopOpen: false,
    localPlayerSlot: 'host',
    coop: { enabled: true },
    coopRewardKind: 'run-shop',
    coopRewardWaitSlots: new Set(['guest']),
    strategyEventUi: {
      root: {
        dataset: {}
      }
    },
    showCoopRunShopWaitingUi: () => {
      waitingShown += 1;
    },
    openRunShop: () => {
      opened += 1;
      return true;
    }
  });

  game.toggleRunShop();

  assert.equal(waitingShown, 1);
  assert.equal(opened, 0);
}

{
  let waitingShown = 0;
  const game = Object.assign(Object.create(Game.prototype), {
    runShopFreeReward: false,
    localPlayerSlot: 'host',
    coop: { enabled: true },
    coopRewardKind: 'run-shop',
    coopRewardWaitSlots: new Set(['guest']),
    strategyEventUi: {
      root: {
        dataset: {}
      }
    },
    showCoopRunShopWaitingUi: () => {
      waitingShown += 1;
    }
  });

  assert.equal(Game.prototype.openRunShop.call(game), false);
  assert.equal(waitingShown, 1);
}

{
  const guestRun = makeRun({
    networkInteractionId: 'shop-1',
    networkShopRevision: 3,
    runShopChoices: [{ choiceId: 'choice-a', disabled: false }]
  });
  const game = Object.assign(Object.create(Game.prototype), {
    localPlayerSlot: 'host',
    activeEconomySlot: 'host',
    players: {
      host: makeRun({ runShopFreeReward: false, runShopChoices: [], runShopPendingOffers: {} }),
      guest: guestRun
    },
    coopRewardKind: 'run-shop',
    coopRewardWaitSlots: new Set(['guest']),
    cardSystem: {},
    strategyEvent: null,
    shopPrices: { unit: 12 },
    strategyRewardRerollCount: 0,
    runShopFreeReward: false,
    runShopActiveCategory: null,
    runShopChoices: [],
    runShopPendingOffers: {},
    silver: 0,
    runCardsPlayedCount: 0,
    waveRewardDeck: [],
    acquiredUnitCardTypes: new Set(),
    teamGenericUpgradeCounts: {},
    teamSpecialUpgrades: new Set(),
    teamSupportModifiersApplied: new Set(),
    canRunShopCategory(category) {
      return this.runShopFreeReward && category === 'unit' ? { ok: true } : { ok: false };
    }
  });
  const validator = new CommandValidator(game, {
    matchId: 'match-test',
    getPhaseRevision: () => 4
  });

  assert.deepEqual(
    validator.validate(makeCommand({
      playerId: 'host',
      seq: 1,
      name: COMMAND.SHOP_CATEGORY,
      payload: { category: 'unit' }
    }), 'host'),
    { ok: false, reasonCode: 'shop_reward_not_active' }
  );

  assert.equal(
    validator.validate(makeCommand({
      playerId: 'guest',
      seq: 1,
      name: COMMAND.SHOP_CATEGORY,
      payload: { category: 'unit' }
    }), 'guest').ok,
    true
  );

  assert.deepEqual(
    validator.validate(makeCommand({
      playerId: 'guest',
      seq: 2,
      name: COMMAND.SHOP_CHOOSE,
      payload: { choiceId: 'choice-a', offerId: 'stale-shop', revision: 3 }
    }), 'guest'),
    { ok: false, reasonCode: 'stale_shop' }
  );

  const validChoice = validator.validate(makeCommand({
    playerId: 'guest',
    seq: 2,
    name: COMMAND.SHOP_CHOOSE,
    payload: { choiceId: 'choice-a', offerId: 'shop-1', revision: 3 }
  }), 'guest');

  assert.equal(validChoice.ok, true);
  assert.equal(validChoice.payload.choiceIndex, 0);
}

{
  let previewUpdated = 0;
  let waveStarted = 0;
  const game = Object.assign(Object.create(Game.prototype), {
    levelSession: { debug: false },
    levelFinished: false,
    strategyEvent: null,
    currentWave: null,
    pendingWaveAdvance: true,
    runShopFreeReward: false,
    openNextStrategyReward: () => false,
    updateWavePreview: () => {
      previewUpdated += 1;
    },
    startNextWave: () => {
      waveStarted += 1;
    }
  });

  game.updateWaveFlow();

  assert.equal(game.pendingWaveAdvance, false);
  assert.equal(previewUpdated, 1);
  assert.equal(waveStarted, 1);
}

{
  let waveStarted = 0;
  const game = Object.assign(Object.create(Game.prototype), {
    levelSession: { debug: false },
    levelFinished: false,
    strategyEvent: null,
    currentWave: null,
    pendingWaveAdvance: true,
    runShopFreeReward: true,
    openNextStrategyReward: () => false,
    updateWavePreview: () => {},
    startNextWave: () => {
      waveStarted += 1;
    }
  });

  game.updateWaveFlow();

  assert.equal(game.pendingWaveAdvance, true);
  assert.equal(waveStarted, 0);
}

{
  const services = { hidden: true, innerHTML: '' };
  const game = Object.assign(Object.create(Game.prototype), {
    localPlayerSlot: 'guest',
    activeEconomySlot: 'guest',
    players: {
      guest: makeRun({ silver: 30, runShopFreeReward: false })
    },
    silver: 0,
    runShopOpen: true,
    runShopFreeReward: false,
    runShopActiveCategory: null,
    runShopChoices: [],
    runShopUi: {
      root: { classList: makeClassList() },
      services
    },
    shopPrice: () => 12,
    canRunShopCategory: () => ({ ok: true, reason: '' })
  });

  game.renderRunShop();

  assert.match(services.innerHTML, /12 银币/);
  assert.doesNotMatch(services.innerHTML, /disabled aria-disabled="true"/);
}

console.log('Coop run-shop flow checks passed.');
