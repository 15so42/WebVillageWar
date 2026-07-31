import assert from 'node:assert/strict';

function makeClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name)
  };
}

function makeStrategyEventUi() {
  return {
    root: {
      hidden: true,
      dataset: {},
      setAttribute(name, value) {
        this[name] = value;
      }
    },
    kicker: { textContent: '', hidden: true },
    title: { textContent: '' },
    summary: { textContent: '', hidden: true },
    choices: { innerHTML: '' },
    actions: { hidden: true, innerHTML: '' }
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
  const hostRun = makeRun({ runShopFreeReward: false, silver: 10 });
  const guestRun = makeRun({ runShopFreeReward: false, silver: 52 });
  let dirtySlot = null;
  const game = Object.assign(Object.create(Game.prototype), {
    localPlayerSlot: 'host',
    activeEconomySlot: 'host',
    players: { host: hostRun, guest: guestRun },
    strategyEvent: null,
    cardSystem: {},
    cardSystems: { host: {}, guest: {} },
    abilities: {},
    abilitySystems: {},
    shopPrices: hostRun.shopPrices,
    strategyRewardRerollCount: 0,
    runShopFreeReward: false,
    runShopActiveCategory: null,
    runShopChoices: [],
    runShopPendingOffers: {},
    silver: hostRun.silver,
    runCardsPlayedCount: 0,
    waveRewardDeck: [],
    acquiredUnitCardTypes: new Set(),
    teamGenericUpgradeCounts: {},
    teamSpecialUpgrades: new Set(),
    teamSupportModifiersApplied: new Set(),
    networkBridge: {
      markPrivateStateDirty(slot) {
        dirtySlot = slot;
      }
    }
  });

  game.withPlayerContext('guest', () => {
    game.setSilver(game.getSilver() - 12);
    assert.equal(game.silver, 40);
  });

  assert.equal(guestRun.silver, 40);
  assert.equal(hostRun.silver, 10);
  assert.equal(game.silver, hostRun.silver);
  assert.equal(dirtySlot, 'guest');
}

{
  const guestCard = { id: 'swordsman', instanceId: 'guest-swordsman', name: '剑士', level: 1 };
  let upgradedCard = null;
  const guestCards = {
    setHint: () => {},
    upgradeCardFamily(card, amount) {
      upgradedCard = card;
      card.level += amount;
      return true;
    }
  };
  const hostRun = makeRun({ runShopFreeReward: false, silver: 10 });
  const guestRun = makeRun({
    runShopFreeReward: false,
    runShopActiveCategory: 'upgrade',
    runShopChoices: [{
      action: 'upgrade-card',
      title: '剑士',
      targetCard: guestCard,
      card: guestCard,
      choiceId: 'upgrade-choice',
      disabled: false
    }],
    silver: 52,
    shopPrices: { upgrade: 12 }
  });
  const game = Object.assign(Object.create(Game.prototype), {
    localPlayerSlot: 'host',
    activeEconomySlot: 'host',
    players: { host: hostRun, guest: guestRun },
    strategyEvent: null,
    cardSystem: {},
    cardSystems: { host: {}, guest: guestCards },
    abilities: {},
    abilitySystems: {},
    shopPrices: hostRun.shopPrices,
    strategyRewardRerollCount: 0,
    runShopFreeReward: false,
    runShopActiveCategory: null,
    runShopChoices: [],
    runShopPendingOffers: {},
    silver: hostRun.silver,
    runCardsPlayedCount: 0,
    waveRewardDeck: [],
    acquiredUnitCardTypes: new Set(),
    teamGenericUpgradeCounts: {},
    teamSpecialUpgrades: new Set(),
    teamSupportModifiersApplied: new Set(),
    updateHud: () => {},
    renderRunShop: () => {},
    shopPriceIncrement: () => 3,
    networkBridge: { markPrivateStateDirty: () => {} }
  });

  assert.equal(game.applyNetworkShopChoice('guest', 0), true);
  assert.equal(guestRun.silver, 40);
  assert.equal(guestRun.shopPrices.upgrade, 15);
  assert.equal(guestRun.runShopActiveCategory, null);
  assert.deepEqual(guestRun.runShopChoices, []);
  assert.equal(upgradedCard, guestCard);
  assert.equal(guestCard.level, 2);
}

{
  const hostRun = makeRun({ runShopFreeReward: false, silver: 10 });
  const guestRun = makeRun({
    runShopFreeReward: false,
    silver: 52,
    strategyEvent: {
      type: 'wave-reward',
      wave: { index: 3, kind: 'normal' },
      choices: [{ choiceId: 'old-choice', title: '旧奖励' }]
    },
    strategyRewardRerollCount: 0
  });
  const newChoices = [{ choiceId: 'new-choice', title: '新奖励' }];
  const game = Object.assign(Object.create(Game.prototype), {
    localPlayerSlot: 'host',
    activeEconomySlot: 'host',
    players: { host: hostRun, guest: guestRun },
    strategyEvent: null,
    cardSystem: {},
    cardSystems: { host: {}, guest: {} },
    abilities: {},
    abilitySystems: {},
    shopPrices: hostRun.shopPrices,
    strategyRewardRerollCount: 0,
    runShopFreeReward: false,
    runShopActiveCategory: null,
    runShopChoices: [],
    runShopPendingOffers: {},
    silver: hostRun.silver,
    runCardsPlayedCount: 0,
    waveRewardDeck: [],
    acquiredUnitCardTypes: new Set(),
    teamGenericUpgradeCounts: {},
    teamSpecialUpgrades: new Set(),
    teamSupportModifiersApplied: new Set(),
    createCardWaveRewardChoices: () => newChoices,
    networkBridge: { markPrivateStateDirty: () => {} }
  });

  assert.equal(game.applyNetworkStrategyReroll('guest'), true);
  assert.equal(guestRun.silver, 48);
  assert.equal(guestRun.strategyRewardRerollCount, 1);
  assert.deepEqual(guestRun.strategyEvent.choices, newChoices);
}

{
  document.body.classList = makeClassList();
  let waitingShown = 0;
  const hostRun = makeRun();
  const guestRun = makeRun();
  const game = Object.assign(Object.create(Game.prototype), {
    localPlayerSlot: 'host',
    activeEconomySlot: 'host',
    coop: { enabled: true },
    networkClientMode: false,
    players: { host: hostRun, guest: guestRun },
    cardSystem: { clearHint: () => {} },
    clock: { getDelta: () => 0 },
    networkBridge: { markPrivateStateDirty: () => {} },
    coopRewardKind: 'run-shop',
    coopRewardWaitSlots: new Set(['host', 'guest']),
    paused: false,
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
  assert.equal(game.paused, true);
  assert.equal(document.body.classList.contains('is-game-paused'), true);
  assert.equal(waitingShown, 1);

  game.withPlayerContext('host', () => {
    assert.equal(game.runShopFreeReward, false);
    assert.deepEqual(game.runShopChoices, []);
    assert.deepEqual(game.runShopPendingOffers, {});
  });
}

{
  document.body.classList = makeClassList();
  let continued = 0;
  let dirty = 0;
  const hostRun = makeRun({ strategyEvent: { choices: [{ id: 'host-choice' }] } });
  const guestRun = makeRun({ strategyEvent: { choices: [{ id: 'guest-choice' }] } });
  const game = Object.assign(Object.create(Game.prototype), {
    localPlayerSlot: 'host',
    activeEconomySlot: 'host',
    coop: { enabled: true },
    networkClientMode: false,
    players: { host: hostRun, guest: guestRun },
    strategyEvent: hostRun.strategyEvent,
    strategyEventUi: makeStrategyEventUi(),
    cardSystem: {
      setHint: () => {},
      clearHint: () => {}
    },
    clock: { getDelta: () => 0 },
    networkBridge: {
      markPrivateStateDirty: () => {
        dirty += 1;
      }
    },
    coopRewardKind: 'strategy',
    coopRewardWaitSlots: new Set(['host', 'guest']),
    coopRewardAutoSelectSecondsRemaining: 9,
    paused: false,
    cancelCameraDrag: () => {},
    cancelSelectionDrag: () => {},
    clearCoopRewardAutoSelectTimer: () => {},
    continueAfterStrategyFlow: () => {
      continued += 1;
    }
  });

  game.finishCoopStrategyReward('host');

  assert.equal(game.strategyEvent, null);
  assert.equal(hostRun.strategyEvent, null);
  assert.equal(game.coopRewardWaitSlots.has('host'), false);
  assert.equal(game.coopRewardWaitSlots.has('guest'), true);
  assert.equal(game.paused, true);
  assert.equal(document.body.classList.contains('is-game-paused'), true);
  assert.equal(game.strategyEventUi.root.dataset.eventType, 'waiting');
  assert.equal(dirty, 1);
  assert.equal(continued, 0);
}

{
  document.body.classList = makeClassList();
  let hudUpdated = 0;
  let clockDelta = 0;
  const game = Object.assign(Object.create(Game.prototype), {
    coop: { enabled: true },
    networkClientMode: false,
    coopRewardKind: 'strategy',
    coopRewardWaitSlots: new Set(['guest']),
    strategyEvent: null,
    runShopFreeReward: false,
    paused: false,
    hudUpdateTimer: 5,
    cardSystem: { clearHint: () => {} },
    clock: {
      getDelta: () => {
        clockDelta += 1;
      }
    },
    updateHud: () => {
      hudUpdated += 1;
    }
  });

  game.onNetworkMatchPhaseChanged('RUNNING');

  assert.equal(game.paused, true);
  assert.equal(document.body.classList.contains('is-game-paused'), true);
  assert.equal(game.hudUpdateTimer, 5);
  assert.equal(clockDelta, 0);
  assert.equal(hudUpdated, 0);
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
