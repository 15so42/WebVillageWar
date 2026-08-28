import assert from 'node:assert/strict';

function makeClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    toggle(name, force) {
      const shouldAdd = force === undefined ? !values.has(name) : Boolean(force);
      if (shouldAdd) values.add(name);
      else values.delete(name);
      return shouldAdd;
    },
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
  { Game, resolveUnitPlayerName },
  { CommandValidator },
  { COMMAND, GAME_PROTOCOL_VERSION, MSG }
] = await Promise.all([
  import('../src/systems/Game.js'),
  import('../src/network/host/CommandValidator.js'),
  import('../src/network/protocol/messages.js')
]);

const rerollPricingGame = Object.create(Game.prototype);
for (const [rerollCount, expectedCost] of [[0, 4], [1, 4], [2, 4], [3, 4]]) {
  rerollPricingGame.strategyRewardRerollCount = rerollCount;
  assert.equal(rerollPricingGame.getStrategyRewardRerollCost(), expectedCost);
}
rerollPricingGame.strategyRewardRerollCount = 3;
rerollPricingGame.resetStrategyRewardRerollForEvent('wave-reward');
assert.equal(rerollPricingGame.strategyRewardRerollCount, 0, '每波波次奖励应重置本波重随次数显示');
rerollPricingGame.strategyRewardRerollCount = 3;
rerollPricingGame.resetStrategyRewardRerollForEvent('altar-reward');
assert.equal(rerollPricingGame.strategyRewardRerollCount, 3, '非波次奖励不应重置波次重随次数');

const fixedSilverRerollGame = Object.assign(Object.create(Game.prototype), {
  strategyRewardRerollCount: 0,
  strategyEvent: { type: 'wave-reward', wave: {}, choices: [{ card: { id: 'old' } }] },
  createCardWaveRewardChoices: () => [{ card: { id: 'new' } }],
  silver: 10,
  getSilver() { return this.silver; },
  setSilver(value) { this.silver = value; }
});
assert.equal(fixedSilverRerollGame.rerollStrategyRewardChoices({ render: false }), true);
assert.equal(fixedSilverRerollGame.silver, 6);
assert.equal(fixedSilverRerollGame.strategyRewardRerollCount, 1);
assert.equal(fixedSilverRerollGame.getStrategyRewardRerollCost(), 4);
fixedSilverRerollGame.strategyEventUi = {
  actions: { hidden: true, innerHTML: '' }
};
fixedSilverRerollGame.renderStrategyEventActions(fixedSilverRerollGame.strategyEvent);
assert.match(fixedSilverRerollGame.strategyEventUi.actions.innerHTML, /当前剩余 6 银币/);
fixedSilverRerollGame.silver = 3.99;
assert.equal(fixedSilverRerollGame.rerollStrategyRewardChoices({ render: false }), false);
assert.equal(fixedSilverRerollGame.silver, 3.99);

assert.equal(resolveUnitPlayerName({
  players: { 'player-2': { name: '沼泽骑士' } }
}, 'player-2'), '沼泽骑士');
assert.equal(resolveUnitPlayerName({
  matchRules: { players: [{ playerId: 'player-3', name: '银弩手' }] }
}, 'player-3'), '银弩手');
assert.equal(resolveUnitPlayerName({}, 'missing-player'), '');

const playerNameGame = Object.assign(Object.create(Game.prototype), {
  coop: { enabled: true },
  levelSession: { players: { 'player-2': { name: '沼泽骑士' } } }
});
const playerNameLabel = { textContent: '', hidden: true };
playerNameGame.applyUnitPlayerName({
  team: 'player',
  ownerPlayerId: 'player-2',
  statusElement: { parts: { playerName: playerNameLabel } }
});
assert.deepEqual(playerNameLabel, { textContent: '沼泽骑士', hidden: false });

{
  const groundSpell = {
    id: 'meteor-test',
    instanceId: 'spell-ground-1',
    kind: 'spell',
    target: 'ground'
  };
  const temporarySpell = {
    id: 'wildfire-test',
    instanceId: 'spell-temporary-1',
    kind: 'spell',
    target: 'ground'
  };
  const cards = {
    handCards: [groundSpell],
    temporaryCards: [temporarySpell],
    findCardByInstanceId(instanceId) {
      return [...this.handCards, ...this.temporaryCards]
        .find((card) => card.instanceId === instanceId) ?? null;
    }
  };
  const game = {
    localPlayerId: 'host',
    players: { host: {} },
    cardSystems: { host: cards },
    friendlyUnits: [],
    enemyUnits: []
  };
  const validator = new CommandValidator(game, {
    matchId: 'match-test',
    getPhaseRevision: () => 4
  });

  assert.deepEqual(
    validator.validate(makeCommand({
      playerId: 'host',
      seq: 1,
      name: COMMAND.DISCARD_CARD,
      payload: { cardInstanceId: groundSpell.instanceId, sourceLocation: 'hand' }
    }), 'host'),
    {
      ok: true,
      payload: { cardInstanceId: groundSpell.instanceId, sourceLocation: 'hand' }
    },
    '丢弃地面法术不应要求施法坐标'
  );

  assert.deepEqual(
    validator.validate(makeCommand({
      playerId: 'host',
      seq: 2,
      name: COMMAND.DISCARD_CARD,
      payload: { cardInstanceId: temporarySpell.instanceId, sourceLocation: 'hand' }
    }), 'host'),
    {
      ok: true,
      payload: { cardInstanceId: temporarySpell.instanceId, sourceLocation: 'temporary' }
    },
    'Host 应按权威牌区纠正临时法术牌的来源位置'
  );

  assert.deepEqual(
    validator.validate(makeCommand({
      playerId: 'host',
      seq: 3,
      name: COMMAND.PLAY_CARD,
      payload: { cardInstanceId: groundSpell.instanceId }
    }), 'host'),
    { ok: false, reasonCode: 'invalid_target_point' },
    '正常施放地面法术仍必须提供坐标'
  );
}

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
  let strategyRenders = 0;
  let shopRenders = 0;
  let waitingSummaryUpdates = 0;
  const summary = { textContent: '', hidden: true };
  const kicker = { textContent: '' };
  const game = Object.assign(Object.create(Game.prototype), {
    coopRewardAutoSelectSecondsRemaining: 9,
    runShopAutoSelectSecondsRemaining: 9,
    strategyEvent: {
      summary: '请选择一项奖励。',
      autoSelectSecondsRemaining: 9
    },
    strategyEventUi: {
      root: { hidden: false },
      summary
    },
    runShopOpen: true,
    runShopFreeReward: true,
    runShopUi: { kicker },
    bossesDefeated: 2,
    renderStrategyEvent: () => {
      strategyRenders += 1;
    },
    renderRunShop: () => {
      shopRenders += 1;
    },
    updateCoopRewardWaitingSummary: () => {
      waitingSummaryUpdates += 1;
    }
  });

  assert.equal(game.setCoopRewardCountdownSeconds(8, { render: true }), true);
  assert.equal(strategyRenders, 0, 'countdown ticks must not rebuild wave reward choices');
  assert.equal(shopRenders, 0, 'countdown ticks must not rebuild free-shop choices');
  assert.equal(waitingSummaryUpdates, 1);
  assert.match(summary.textContent, /8 秒/);
  assert.match(kicker.textContent, /8 秒/);
}

{
  const remainingCards = [
    { id: 'unit-a', name: '单位甲', kind: 'summon', summary: '甲' },
    { id: 'spell-b', name: '法术乙', kind: 'spell', summary: '乙' },
    { id: 'building-c', name: '建筑丙', kind: 'building', summary: '丙' },
    { id: 'ability-d', name: '能力丁', kind: 'ability', summary: '丁' }
  ];
  const game = Object.assign(Object.create(Game.prototype), {
    waveRewardCardPool(options = {}) {
      assert.equal(options.kind, undefined);
      return remainingCards;
    },
    randomCardChoices({ pool, action, actionLabel }) {
      return pool.slice(0, 3).map((card) => ({
        card,
        action,
        actionLabel,
        title: card.name,
        description: card.summary
      }));
    }
  });

  const choices = game.createShopChoicesForCategory('unit');
  assert.equal(choices.length, 3);
  assert.deepEqual(choices.map((choice) => choice.card.id), ['unit-a', 'spell-b', 'building-c']);
  assert.ok(choices.every((choice) => choice.actionLabel === '获得卡牌'));
  assert.ok(choices.every((choice) => choice.rewardSource === 'wave-reward-deck'));
}

{
  const game = Object.assign(Object.create(Game.prototype), {
    localPlayerSlot: 'host',
    activeEconomySlot: 'host',
    waveRewardDeck: ['unit-a', 'unit-b'],
    runShopPendingOffers: {
      unit: [{ card: { id: 'unit-a' } }]
    },
    networkBridge: { markPrivateStateDirty: () => {} }
  });

  assert.equal(game.consumeWaveRewardCard({ id: 'unit-a' }), true);
  assert.deepEqual(game.waveRewardDeck, ['unit-b']);
  assert.equal(game.runShopPendingOffers.unit, undefined);
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
  const guestUnit = { id: 'guest-unit', name: '客机单位', kind: 'summon', level: 3 };
  const guestSpell = { id: 'guest-spell', name: '客机法术', kind: 'spell', level: 2 };
  const guestBuilding = { id: 'guest-building', name: '客机建筑', kind: 'building', level: 1 };
  const guestEnchant = { id: 'guest-enchant', name: '客机附魔', kind: 'enchant', level: 2 };
  const addedCards = [];
  const dirtySlots = [];
  let rollCount = 0;
  const guestCards = {
    setHint: () => {},
    addCardToDrawPile(card) {
      addedCards.push(card);
      return { added: true };
    }
  };
  const hostRun = makeRun({
    runShopFreeReward: false,
    silver: 10,
    waveRewardDeck: ['host-unit']
  });
  const guestRun = makeRun({
    runShopFreeReward: false,
    silver: 52,
    shopPrices: { unit: 12 },
    runShopActiveCategory: null,
    runShopChoices: [],
    waveRewardDeck: ['guest-unit', 'guest-spell', 'guest-building', 'guest-enchant']
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
    waveRewardDeck: hostRun.waveRewardDeck,
    acquiredUnitCardTypes: new Set(),
    teamGenericUpgradeCounts: {},
    teamSpecialUpgrades: new Set(),
    teamSupportModifiersApplied: new Set(),
    updateHud: () => {},
    renderRunShop: () => {},
    shopPriceIncrement: () => 3,
    canRunShopCategory: () => ({ ok: true, reason: '' }),
    createShopChoicesForCategory() {
      const rolls = [
        [guestUnit, guestSpell, guestBuilding],
        [guestEnchant, guestUnit, guestSpell]
      ];
      return rolls[Math.min(rollCount++, rolls.length - 1)].map((card) => ({
        action: 'add-card',
        actionLabel: '获得卡牌',
        title: card.name,
        card,
        rewardSource: 'wave-reward-deck',
        disabled: false
      }));
    },
    networkBridge: {
      markPrivateStateDirty(slot) {
        dirtySlots.push(slot);
      }
    }
  });

  assert.equal(game.applyNetworkShopCategory('guest', 'unit'), true);
  assert.equal(guestRun.silver, 40, 'Host should charge the requesting player when the paid roll opens');
  assert.equal(guestRun.shopPrices.unit, 15);
  assert.deepEqual(guestRun.runShopChoices.map((choice) => choice.card.id), [
    'guest-unit',
    'guest-spell',
    'guest-building'
  ]);
  assert.ok(guestRun.runShopChoices.every((choice) => choice.prepaid && choice.prepaidPrice === 12));

  assert.equal(game.applyNetworkShopBack('guest'), true);
  assert.equal(guestRun.silver, 40, 'backing out must not refund the paid roll');
  assert.deepEqual(guestRun.runShopChoices, []);

  assert.equal(game.applyNetworkShopCategory('guest', 'unit'), true);
  assert.equal(guestRun.silver, 25, 'opening the service again should charge the increased price');
  assert.equal(guestRun.shopPrices.unit, 18);
  assert.deepEqual(guestRun.runShopChoices.map((choice) => choice.card.id), [
    'guest-enchant',
    'guest-unit',
    'guest-spell'
  ]);

  assert.equal(game.applyNetworkShopChoice('guest', 0), true);
  assert.deepEqual(addedCards, [guestEnchant]);
  assert.deepEqual(guestRun.waveRewardDeck, ['guest-unit', 'guest-spell', 'guest-building']);
  assert.deepEqual(hostRun.waveRewardDeck, ['host-unit']);
  assert.equal(guestRun.silver, 25, 'choosing from a prepaid roll must not charge a second time');
  assert.equal(guestRun.shopPrices.unit, 18);
  assert.equal(hostRun.silver, 10);
  assert.ok(dirtySlots.includes('guest'));
}

{
  const guestRun = makeRun({
    runShopFreeReward: false,
    shopPrices: { unit: 12 }
  });
  const game = Object.assign(Object.create(Game.prototype), {
    networkClientMode: true,
    localPlayerSlot: 'guest',
    players: { guest: guestRun },
    shopPrices: guestRun.shopPrices,
    runShopOpen: false,
    runShopFreeReward: false,
    runShopActiveCategory: null,
    runShopChoices: []
  });

  game.applyNetworkPrivateUi({
    runShopState: {
      freeReward: false,
      prices: { unit: 15 },
      activeCategory: 'unit',
      choices: [{
        choiceId: 'reconnected-paid-choice',
        prepaid: true,
        prepaidPrice: 12,
        card: { id: 'guest-unit', name: '客机单位', kind: 'summon', level: 3 }
      }]
    }
  });

  assert.equal(game.shopPrices.unit, 15, 'client should restore the Host-authoritative next roll price');
  assert.equal(guestRun.shopPrices.unit, 15);
  assert.equal(game.runShopChoices[0].prepaid, true, 'reconnect should preserve the already-paid offer');
  assert.equal(game.runShopChoices[0].prepaidPrice, 12);
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
  const dirtySlots = [];
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
    networkBridge: {
      markPrivateStateDirty(slot) {
        dirtySlots.push(slot);
      }
    }
  });

  assert.equal(game.applyNetworkStrategyReroll('guest'), true);
  // 联机重随由 Host 从发起玩家的私有局内账户固定扣除 4 银币。
  assert.equal(guestRun.silver, 48);
  assert.equal(guestRun.strategyRewardRerollCount, 1);
  assert.deepEqual(guestRun.strategyEvent.choices, newChoices);
  assert.ok(dirtySlots.includes('guest'), 'Host 扣银币后应标记该玩家私有状态待同步');
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

  assert.equal(game.toggleRunShop(), false);
  assert.equal(waitingShown, 0);
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
  assert.equal(waitingShown, 0);
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

{
  const root = { classList: makeClassList(), scrollTop: 68 };
  const choiceList = {
    classList: makeClassList(),
    innerHTML: '',
    scrollTop: 34
  };
  const game = Object.assign(Object.create(Game.prototype), {
    localPlayerSlot: 'host',
    activeEconomySlot: 'host',
    runShopOpen: true,
    runShopFreeReward: false,
    runShopActiveCategory: 'attribute',
    runShopChoices: [{
      action: 'apply-team-upgrade',
      title: '披甲训练',
      description: '全队护甲提升。',
      upgrade: { stat: 'armor' }
    }],
    runShopUi: {
      root,
      services: { hidden: false },
      choices: { hidden: true },
      choiceList,
      skip: { hidden: false }
    },
    shopPrice: () => 12,
    canRunShopCategory: () => ({ ok: true, reason: '' })
  });

  game.renderRunShop();
  assert.equal(root.scrollTop, 0, '切换到军需铺服务详情时应回到面板顶部');
  assert.equal(choiceList.scrollTop, 0);
  assert.equal(game.runShopUi.renderedCategory, 'attribute');

  root.scrollTop = 52;
  game.renderRunShop();
  assert.equal(root.scrollTop, 52, '同一详情的状态刷新不应打断玩家滚动');

  game.runShopActiveCategory = null;
  game.runShopChoices = [];
  game.renderRunShop();
  assert.equal(root.scrollTop, 0, '返回军需服务列表时应回到面板顶部');
  assert.equal(game.runShopUi.renderedCategory, null);
}

console.log('Coop run-shop flow checks passed.');
