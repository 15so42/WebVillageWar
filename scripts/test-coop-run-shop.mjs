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
  { COMMAND, GAME_PROTOCOL_VERSION, MSG },
  {
    RUN_SHOP_ACTION_BUY_ENERGY,
    RUN_SHOP_ACTION_SPECIALIZATION_UNIT,
    RUN_SHOP_CONTINUE_LABEL,
    RUN_SHOP_ENERGY_CARD_ID,
    RUN_SHOP_FREE_LABEL,
    RUN_SHOP_SOLD_OUT_LABEL,
    RUN_SHOP_STEP_SPECIALIZATION_TYPE,
    RUN_SHOP_STEP_SPECIALIZATION_UPGRADE,
    RUN_SHOP_STEP_SUPPLY,
    isRunShopCategoryRetired,
    runShopSupplyEnergyAmount,
    runShopSupplyItemCount,
    runShopSupplyKindPrice,
    runShopSupplyKindSequence
  }
] = await Promise.all([
  import('../src/systems/Game.js'),
  import('../src/network/host/CommandValidator.js'),
  import('../src/network/protocol/messages.js'),
  import('../src/systems/runShopCatalog.js')
]);

// 旧版“先选服务类别再付费揭示候选”的入口必须从 Game 上彻底移除。
for (const removed of [
  'selectRunShopCategory',
  'createShopChoicesForCategory',
  'shopPriceIncrement'
]) {
  assert.equal(removed in Game.prototype, false, `${removed} 应随旧八类军需铺一起删除`);
}

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
    // 临时牌堆已移除，特殊牌与普通牌一样作为手牌
    handCards: [groundSpell, temporarySpell],
    findCardByInstanceId(instanceId) {
      return this.handCards.find((card) => card.instanceId === instanceId) ?? null;
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
      payload: { cardInstanceId: temporarySpell.instanceId, sourceLocation: 'hand' }
    },
    'Host 应将特殊法术牌的来源位置归一为手牌'
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
    // runShopActiveCategory 现在承载“整备步骤”而不是旧的服务类别。
    runShopActiveCategory: RUN_SHOP_STEP_SPECIALIZATION_TYPE,
    runShopChoices: [{ choiceId: 'choice-a' }],
    runShopPendingOffers: { unit: [{ choiceId: 'choice-a' }] },
    runShopItems: null,
    runShopPrepNodeKey: null,
    runShopSpecializationClaimed: false,
    runShopSpecializationUnitType: null,
    runShopPrepCompleted: false,
    runShopCompletedNodeKey: null,
    runShopAutoSelectSecondsRemaining: 12,
    silver: 0,
    runCardsPlayedCount: 0,
    waveRewardDeck: [],
    acquiredUnitCardTypes: new Set(),
    teamGenericUpgradeCounts: new Map(),
    teamSpecialUpgrades: new Map(),
    teamSupportModifiersApplied: new Set(),
    ...overrides
  };
}

// 联机 Boss 整备的最小可控环境：真实跑 openCoopRunShopForAll / ensureRunShopPrep /
// applyNetworkShopChoice / purchaseRunShopSupplyItem / finishCoopRunShop，
// 只桩掉 DOM 渲染、波次推进与卡牌牌组来源。
function makeCoopPrepGame({
  host: hostOverrides = {},
  guest: guestOverrides = {},
  hostPool = [
    { id: 'host-unit', name: '单位甲', kind: 'summon', unitType: 'swordsman', summary: '甲', energyCost: 3 },
    { id: 'host-enchant', name: '附魔甲', kind: 'enchant', enchantmentId: 'flame', summary: '甲附魔', energyCost: 2 },
    { id: 'host-spell', name: '法术甲', kind: 'spell', summary: '甲法术' },
    { id: 'host-ability', name: '能力甲', kind: 'ability', summary: '甲能力' }
  ],
  guestPool = [
    { id: 'guest-unit', name: '单位乙', kind: 'summon', unitType: 'knight', summary: '乙', energyCost: 3 },
    { id: 'guest-enchant', name: '附魔乙', kind: 'enchant', enchantmentId: 'frost', summary: '乙附魔', energyCost: 2 },
    { id: 'guest-spell', name: '法术乙', kind: 'spell', summary: '乙法术' },
    { id: 'guest-ability', name: '能力乙', kind: 'ability', summary: '乙能力' }
  ]
} = {}) {
  const addedCardsBySlot = { host: [], guest: [] };
  const energyGainedBySlot = { host: 0, guest: 0 };
  const dirtySlots = [];
  const openedShops = [];
  const runeStoneCalls = { createStone: 0, createFromCard: 0 };
  const makeCards = (slot) => ({
    setHint: () => {},
    clearHint: () => {},
    addCardToDrawPile(card) {
      addedCardsBySlot[slot].push(card);
      return { added: true };
    },
    addEnergy(amount) {
      energyGainedBySlot[slot] += amount;
      return amount;
    }
  });
  const hostCards = makeCards('host');
  const guestCards = makeCards('guest');
  const hostRun = makeRun({
    runShopFreeReward: false,
    silver: 30,
    acquiredUnitCardTypes: new Set(['swordsman']),
    waveRewardDeck: [],
    runShopPendingOffers: {},
    ...hostOverrides
  });
  const guestRun = makeRun({
    runShopFreeReward: false,
    silver: 52,
    acquiredUnitCardTypes: new Set(['knight']),
    waveRewardDeck: [],
    runShopPendingOffers: {},
    ...guestOverrides
  });
  const game = Object.assign(Object.create(Game.prototype), {
    localPlayerSlot: 'host',
    activeEconomySlot: 'host',
    coop: { enabled: true },
    networkClientMode: false,
    players: { host: hostRun, guest: guestRun },
    strategyEvent: null,
    strategyEventUi: makeStrategyEventUi(),
    cardSystem: hostCards,
    cardSystems: { host: hostCards, guest: guestCards },
    abilities: { updateUi: () => {} },
    abilitySystems: { host: { updateUi: () => {} }, guest: { updateUi: () => {} } },
    friendlyUnits: [],
    runeStones: {
      createStone() {
        runeStoneCalls.createStone += 1;
        return null;
      },
      createFromCard() {
        runeStoneCalls.createFromCard += 1;
        return null;
      },
      allStones: () => [],
      stonesForUnit: () => []
    },
    shopPrices: hostRun.shopPrices,
    strategyRewardRerollCount: 0,
    runShopFreeReward: hostRun.runShopFreeReward,
    runShopActiveCategory: hostRun.runShopActiveCategory,
    runShopChoices: hostRun.runShopChoices,
    runShopPendingOffers: hostRun.runShopPendingOffers,
    runShopItems: null,
    runShopPrepNodeKey: null,
    runShopSpecializationClaimed: false,
    runShopSpecializationUnitType: null,
    runShopPrepCompleted: false,
    runShopCompletedNodeKey: null,
    runShopOpen: false,
    runShopCausedPause: false,
    silver: hostRun.silver,
    runCardsPlayedCount: 0,
    waveRewardDeck: hostRun.waveRewardDeck,
    acquiredUnitCardTypes: hostRun.acquiredUnitCardTypes,
    teamGenericUpgradeCounts: hostRun.teamGenericUpgradeCounts,
    teamSpecialUpgrades: hostRun.teamSpecialUpgrades,
    teamSupportModifiersApplied: hostRun.teamSupportModifiersApplied,
    bossesDefeated: 1,
    pendingStrategyRewards: [],
    coopRewardWaitSlots: null,
    coopRewardKind: null,
    coopRewardDeadlineAtMs: null,
    paused: false,
    levelFinished: false,
    levelSession: { debug: false },
    clock: { getDelta: () => {} },
    cancelCameraDrag: () => {},
    cancelSelectionDrag: () => {},
    updateHud: () => {},
    openNextStrategyReward: () => false,
    startNextWave: () => {},
    updateWavePreview: () => {},
    continueAfterStrategyFlow: () => {},
    openRunShop(options = {}) {
      openedShops.push(options);
      this.runShopOpen = true;
      return true;
    },
    renderRunShop: () => {},
    networkBridge: {
      markPrivateStateDirty(slot) {
        dirtySlots.push(slot ?? null);
      }
    },
    waveRewardCardPool() {
      const slot = this.activeEconomySlot ?? this.localPlayerSlot;
      return slot === 'guest' ? guestPool : hostPool;
    }
  });
  return {
    game,
    hostRun,
    guestRun,
    addedCardsBySlot,
    energyGainedBySlot,
    dirtySlots,
    openedShops,
    runeStoneCalls
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
  // 新版补给铺直接生成 4～6 件具体商品：名称、效果、价格与售罄状态都随商品实例一起给到。
  const remainingCards = [
    { id: 'unit-a', name: '单位甲', kind: 'summon', unitType: 'swordsman', summary: '甲' },
    { id: 'enchant-b', name: '附魔乙', kind: 'enchant', enchantmentId: 'flame', summary: '乙' },
    { id: 'spell-c', name: '法术丙', kind: 'spell', summary: '丙' },
    { id: 'ability-d', name: '能力丁', kind: 'ability', summary: '丁' }
  ];
  const game = Object.assign(Object.create(Game.prototype), {
    localPlayerSlot: 'host',
    activeEconomySlot: 'host',
    bossesDefeated: 1,
    silver: 20,
    teamGenericUpgradeCounts: new Map(),
    waveRewardCardPool() {
      return remainingCards;
    }
  });

  const config = game.runShopSupplyConfig();
  const items = game.createRunShopSupplyItems('boss:1');
  const expectedKinds = runShopSupplyKindSequence(config, runShopSupplyItemCount(config, 0));

  assert.ok(items.length >= 4 && items.length <= 6, '补给铺必须展示 4～6 件商品');
  assert.deepEqual(
    items.map((item) => item.kind),
    expectedKinds,
    '商品类别按目录配额展开，能量补给排最后'
  );
  assert.equal(new Set(items.map((item) => item.itemId)).size, items.length, '每件商品必须有独立实例身份');
  assert.ok(items.every((item) => item.sold === false), '新生成的商品都未售罄');
  assert.ok(
    items.every((item) => item.price === runShopSupplyKindPrice(item.kind, config)),
    '商品价格必须来自目录的明码标价'
  );
  assert.ok(
    items.every((item) => item.title && item.choice && item.choice.action),
    '商品必须带名称、效果与可执行动作'
  );
  assert.ok(
    items.every((item) => item.choice.title === item.title && item.choice.description),
    '商品效果说明必须直接展示给玩家'
  );

  const cardItem = items.find((item) => item.kind === 'unitCard');
  assert.equal(cardItem.cardId, 'unit-a');
  assert.equal(cardItem.choice.action, 'add-card');
  assert.equal(cardItem.choice.rewardSource, 'wave-reward-deck');

  const enchantItem = items.find((item) => item.kind === 'enchant');
  assert.equal(enchantItem.cardId, 'enchant-b', '附魔商品必须是具体附魔卡');

  const energyItem = items.find((item) => item.kind === 'energy');
  assert.equal(energyItem.cardId, RUN_SHOP_ENERGY_CARD_ID);
  assert.equal(energyItem.choice.action, RUN_SHOP_ACTION_BUY_ENERGY);
  assert.equal(energyItem.energyAmount, runShopSupplyEnergyAmount(config));

  // 明码标价与售罄状态在渲染前就可判定。
  const affordable = game.runShopItemToChoice(cardItem, cardItem.price + 1);
  assert.equal(affordable.soldOut, false);
  assert.equal(affordable.disabled, false);
  assert.equal(affordable.itemId, cardItem.itemId);
  assert.equal(affordable.actionLabel, `${runShopSupplyKindPrice('unitCard', config)} 银币`);

  const tooPoor = game.runShopItemToChoice(cardItem, cardItem.price - 1);
  assert.equal(tooPoor.soldOut, false);
  assert.equal(tooPoor.disabled, true, '银币不够的商品在选择项上就是禁用的');

  cardItem.sold = true;
  const soldOut = game.runShopItemToChoice(cardItem, 999);
  assert.equal(soldOut.soldOut, true);
  assert.equal(soldOut.disabled, true);
  assert.equal(soldOut.actionLabel, RUN_SHOP_SOLD_OUT_LABEL);
  cardItem.sold = false;

  // 旧八类服务类别全部下架：没有可用类别，也没有新的候选生成入口。
  for (const category of ['attribute', 'unit', 'trait', 'copy', 'remove', 'upgrade', 'energy', 'temporary']) {
    assert.equal(isRunShopCategoryRetired(category), true);
    assert.equal(game.canRunShopCategory(category).ok, false, `${category} 不得再作为服务类别打开`);
  }
  assert.equal(game.canRunShopCategory('brand-new-service').ok, false);
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
  // 新版整备：每位玩家各自一套「选兵种 → 选专精 → 补给铺」状态，互不干扰。
  const { game, hostRun, guestRun, openedShops } = makeCoopPrepGame();

  assert.equal(game.openCoopRunShopForAll({ freeReward: true }), true);
  assert.equal(hostRun.runShopFreeReward, true, '整备激活状态由 Host 统一开启');
  assert.equal(guestRun.runShopFreeReward, true);
  assert.deepEqual([...game.coopRewardWaitSlots].sort(), ['guest', 'host'], '两位玩家都在等待集合里');
  assert.equal(openedShops.length, 1, '本机玩家直接进入整备界面');
  assert.equal(openedShops[0].freeReward, true);
  assert.equal(game.paused, true, 'Boss 整备必须暂停战斗');

  for (const [slot, run] of [['host', hostRun], ['guest', guestRun]]) {
    assert.equal(
      run.runShopActiveCategory,
      RUN_SHOP_STEP_SPECIALIZATION_TYPE,
      `${slot} 的第一步永远是免费兵种专精`
    );
    assert.ok(
      run.runShopItems.length >= 4 && run.runShopItems.length <= 6,
      `${slot} 必须各自拿到 4～6 件具体商品`
    );
  }
  assert.notEqual(hostRun.runShopItems, guestRun.runShopItems, '每位玩家的商品实例必须独立');
  assert.notEqual(hostRun.runShopChoices, guestRun.runShopChoices);

  // 第一步只列本局已获得兵种：host 拿到剑士，guest 拿到骑士。
  assert.equal(hostRun.runShopChoices[0].action, RUN_SHOP_ACTION_SPECIALIZATION_UNIT);
  assert.equal(hostRun.runShopChoices[0].unitType, 'swordsman');
  assert.equal(guestRun.runShopChoices[0].unitType, 'knight');

  // host：选兵种 → 选专精 → 立即生效（不发卡、不花银币）。
  const hostSilverBefore = hostRun.silver;
  assert.equal(game.applyNetworkShopChoice('host', 0), true);
  assert.equal(hostRun.runShopActiveCategory, RUN_SHOP_STEP_SPECIALIZATION_UPGRADE);
  assert.equal(hostRun.runShopSpecializationUnitType, 'swordsman');
  assert.equal(hostRun.runShopSpecializationClaimed, false, '进入专精列表还没领取');
  assert.equal(hostRun.runShopChoices.length >= 1, true);
  assert.equal(guestRun.runShopActiveCategory, RUN_SHOP_STEP_SPECIALIZATION_TYPE, '另一位玩家不受影响');

  const hostUpgrade = hostRun.runShopChoices[0].upgrade;
  assert.equal(game.applyNetworkShopChoice('host', 0), true);
  assert.equal(hostRun.runShopSpecializationClaimed, true, '专精只能领取一次');
  assert.equal(hostRun.runShopSpecializationUnitType, null);
  assert.ok(hostRun.teamSpecialUpgrades.get('swordsman').has(hostUpgrade.id));
  assert.equal(hostRun.silver, hostSilverBefore, '免费专精不花银币');
  assert.equal(hostRun.runShopActiveCategory, RUN_SHOP_STEP_SUPPLY, '领完专精直接进入明码标价补给铺');
  assert.equal(hostRun.runShopChoices.length, hostRun.runShopItems.length);
  assert.equal(hostRun.runShopFreeReward, true, '领取专精不会结束整备');

  // 重复领取同一项专精必须失败。
  assert.equal(
    game.withPlayerContext('host', () => game.claimRunShopSpecialization('swordsman', hostUpgrade)),
    false,
    '同一节点不能重复领取专精'
  );
  assert.equal(hostRun.teamSpecialUpgrades.get('swordsman').size, 1);

  // 另一位玩家的专精与银币状态必须完全隔离。
  assert.equal(guestRun.teamSpecialUpgrades.size, 0, '专精状态按玩家隔离');
  assert.equal(guestRun.runShopSpecializationClaimed, false);
  assert.equal(guestRun.runShopSpecializationUnitType, null);
  assert.equal(guestRun.silver, 52);
  assert.equal(guestRun.runShopActiveCategory, RUN_SHOP_STEP_SPECIALIZATION_TYPE);

  // guest 走完整流程后同样只影响自己。
  assert.equal(game.applyNetworkShopChoice('guest', 0), true);
  const guestUpgrade = guestRun.runShopChoices[0].upgrade;
  assert.equal(game.applyNetworkShopChoice('guest', 0), true);
  assert.ok(guestRun.teamSpecialUpgrades.get('knight').has(guestUpgrade.id));
  assert.equal(guestRun.teamSpecialUpgrades.has('swordsman'), false, 'host 的专精不会记到 guest 名下');
  assert.deepEqual([...hostRun.teamSpecialUpgrades.get('swordsman')], [hostUpgrade.id]);
}

{
  // 付费补给：明码标价、买一件售罄一件、只扣该玩家自己的银币。
  const { game, hostRun, guestRun, addedCardsBySlot, dirtySlots, runeStoneCalls } = makeCoopPrepGame();
  hostRun.waveRewardDeck = ['host-unit', 'host-enchant'];

  game.openCoopRunShopForAll({ freeReward: true });
  game.applyNetworkShopChoice('host', 0);
  game.applyNetworkShopChoice('host', 0);
  assert.equal(hostRun.runShopActiveCategory, RUN_SHOP_STEP_SUPPLY);
  assert.equal(guestRun.runShopActiveCategory, RUN_SHOP_STEP_SPECIALIZATION_TYPE, 'guest 仍停在专精步骤');

  const unitIndex = hostRun.runShopChoices.findIndex((choice) => choice.itemKind === 'unitCard');
  assert.ok(unitIndex >= 0, '补给铺必须包含单位卡商品');
  const unitChoice = hostRun.runShopChoices[unitIndex];
  assert.equal(
    unitChoice.actionLabel,
    `${runShopSupplyKindPrice('unitCard', game.runShopSupplyConfig())} 银币`,
    '购买前即可看到明码标价'
  );
  assert.equal(unitChoice.disabled, false);

  const hostSilverBefore = hostRun.silver;
  const guestSilverBefore = guestRun.silver;
  assert.equal(game.applyNetworkShopChoice('host', unitIndex), true);
  assert.equal(hostRun.silver, hostSilverBefore - unitChoice.itemPrice, '只扣该商品的标价');
  assert.equal(hostRun.runShopItems[unitIndex].sold, true, '购买后该商品立即售罄');
  assert.equal(hostRun.runShopChoices[unitIndex].soldOut, true);
  assert.equal(hostRun.runShopChoices[unitIndex].actionLabel, RUN_SHOP_SOLD_OUT_LABEL);
  assert.equal(hostRun.runShopChoices[unitIndex].disabled, true);
  assert.equal(addedCardsBySlot.host.length, 1, '购买卡牌商品得到的是卡牌');
  assert.equal(addedCardsBySlot.host[0].id, 'host-unit');
  assert.equal(hostRun.waveRewardDeck.includes('host-unit'), false, '同名单位卡定义被本局消耗');

  // 购买不会结束整备：只有「继续战斗」才结束。
  assert.equal(hostRun.runShopFreeReward, true);
  assert.equal(game.coopRewardWaitSlots.has('host'), true);
  assert.equal(hostRun.runShopActiveCategory, RUN_SHOP_STEP_SUPPLY);
  assert.ok(dirtySlots.includes('host'), '购买后必须标记该玩家私有状态待同步');

  // guest 的银币、商品与售罄状态完全独立。
  assert.equal(guestRun.silver, guestSilverBefore);
  assert.equal(guestRun.runShopItems.every((item) => item.sold === false), true);
  assert.equal(addedCardsBySlot.guest.length, 0);

  // 买附魔卡：得到的是卡牌，而不是免费的符文石。
  const enchantIndex = hostRun.runShopChoices.findIndex((choice) => choice.itemKind === 'enchant');
  assert.ok(enchantIndex >= 0, '补给铺必须包含附魔卡商品');
  assert.equal(game.applyNetworkShopChoice('host', enchantIndex), true);
  const enchantCard = addedCardsBySlot.host.at(-1);
  assert.equal(enchantCard.id, 'host-enchant');
  assert.equal(enchantCard.kind, 'enchant');
  assert.equal(enchantCard.energyCost, 2, '附魔卡仍按自己的费用与消耗规则打出');
  assert.equal(
    hostRun.waveRewardDeck.includes('host-enchant'),
    true,
    '附魔卡是消耗品：同类可重复获得，不消耗牌组定义'
  );
  assert.equal(
    runeStoneCalls.createFromCard + runeStoneCalls.createStone,
    0,
    '购买附魔卡不得顺带生成免费符文石'
  );
  assert.equal(hostRun.runShopChoices[enchantIndex].soldOut, true);
}

{
  // 购买是原子的：银币不足 / 已售罄 / 过期与伪造命令都不得改变任何状态。
  const { game, hostRun, addedCardsBySlot, energyGainedBySlot } = makeCoopPrepGame();
  game.openCoopRunShopForAll({ freeReward: true });
  game.applyNetworkShopChoice('host', 0);
  game.applyNetworkShopChoice('host', 0);

  const items = hostRun.runShopItems;
  const unitItem = items.find((item) => item.kind === 'unitCard');
  const unitIndex = hostRun.runShopChoices.findIndex((choice) => choice.itemId === unitItem.itemId);
  assert.ok(unitIndex >= 0);
  const price = unitItem.price;

  // 1) 银币不足：界面禁用，直接购买同样被拒绝。
  hostRun.silver = price - 1;
  game.withPlayerContext('host', () => game.refreshRunShopSupplyChoices());
  assert.equal(hostRun.runShopChoices[unitIndex].disabled, true, '余额不足的商品必须禁用');
  assert.equal(game.applyNetworkShopChoice('host', unitIndex), false);
  assert.equal(game.purchaseRunShopSupplyItem(unitItem), false);
  assert.equal(hostRun.silver, price - 1, '被拒绝的购买不得扣款');
  assert.equal(unitItem.sold, false);
  assert.equal(addedCardsBySlot.host.length, 0, '被拒绝的购买不得发卡');

  // 2) 正常购买后，同一件已售罄商品不能重复购买。
  hostRun.silver = 100;
  game.withPlayerContext('host', () => game.refreshRunShopSupplyChoices());
  const staleChoice = { ...hostRun.runShopChoices[unitIndex] };
  assert.equal(game.applyNetworkShopChoice('host', unitIndex), true);
  const silverAfterBuy = hostRun.silver;
  assert.equal(silverAfterBuy, 100 - price);
  assert.equal(game.applyNetworkShopChoice('host', unitIndex), false, '售罄商品不能重复购买');
  assert.equal(game.purchaseRunShopSupplyItem(unitItem), false);
  assert.equal(
    game.withPlayerContext('host', () => game.completeRunShopPurchase(staleChoice)),
    false,
    '滞后/重放的选择项在商品售罄后必须被拒绝'
  );
  assert.equal(hostRun.silver, silverAfterBuy, '被拒绝的重复购买不得扣款');
  assert.equal(addedCardsBySlot.host.length, 1, '被拒绝的重复购买不得重复发卡');

  // 3) 伪造商品：不属于本节点商品池、或 itemId 已失效。
  const forgedEnergy = {
    itemId: 'run-shop-item:forged',
    kind: 'energy',
    price: 0,
    sold: false,
    energyAmount: 99,
    title: '伪造能量',
    choice: { action: RUN_SHOP_ACTION_BUY_ENERGY, title: '伪造能量' }
  };
  assert.equal(game.purchaseRunShopSupplyItem(forgedEnergy), false, '伪造商品必须被拒绝');
  assert.equal(energyGainedBySlot.host, 0, '被拒绝的伪造商品不得发能量');
  assert.equal(
    game.withPlayerContext('host', () => game.completeRunShopPurchase({
      ...staleChoice,
      itemId: 'run-shop-item:boss:99:0:unitCard'
    })),
    false,
    '指向其他节点商品的命令必须被拒绝'
  );
  assert.equal(game.applyNetworkShopChoice('host', 999), false, '越界索引必须被拒绝');
  assert.equal(hostRun.silver, silverAfterBuy);
  assert.equal(hostRun.runShopItems.filter((item) => item.sold).length, 1);

  // 4) 整备结束后：所有滞后命令一律失败。
  assert.equal(game.applyNetworkShopRewardSkip('host'), true);
  assert.equal(hostRun.runShopFreeReward, false);
  const unsoldItem = items.find((item) => !item.sold);
  assert.equal(game.purchaseRunShopSupplyItem(unsoldItem), false, '整备结束后不能再购买');
  assert.equal(unsoldItem.sold, false);
  assert.equal(game.applyNetworkShopChoice('host', 0), false, '整备结束后的滞后购买命令必须失败');
  assert.equal(hostRun.silver, silverAfterBuy);
}

{
  // 旧八类服务永久下架：伪造 shopCategory 命令不能重开，也不改变任何状态。
  const { game, hostRun, dirtySlots } = makeCoopPrepGame();
  game.openCoopRunShopForAll({ freeReward: true });
  game.applyNetworkShopChoice('host', 0);
  game.applyNetworkShopChoice('host', 0);
  const unitIndex = hostRun.runShopChoices.findIndex((choice) => choice.itemKind === 'unitCard');
  assert.equal(game.applyNetworkShopChoice('host', unitIndex), true);
  assert.ok(hostRun.runShopSpecializationClaimed, 'host 已经领过专精');
  assert.equal(hostRun.runShopItems.filter((item) => item.sold).length, 1);

  const before = {
    silver: hostRun.silver,
    itemIds: hostRun.runShopItems.map((item) => item.itemId),
    sold: hostRun.runShopItems.map((item) => item.sold),
    choiceItemIds: hostRun.runShopChoices.map((choice) => choice.itemId ?? null),
    category: hostRun.runShopActiveCategory,
    claimed: hostRun.runShopSpecializationClaimed,
    specializationCount: [...hostRun.teamSpecialUpgrades.values()].reduce((sum, set) => sum + set.size, 0)
  };
  const dirtyBefore = dirtySlots.length;

  for (const category of [
    'unit',
    'upgrade',
    'copy',
    'remove',
    'temporary',
    'trait',
    'attribute',
    'energy',
    'not-a-service'
  ]) {
    assert.equal(isRunShopCategoryRetired(category), category !== 'not-a-service');
    assert.equal(game.applyNetworkShopCategory('host', category), false, `旧服务 ${category} 必须永久下架`);
    assert.equal(game.canRunShopCategory(category).ok, false);
  }

  assert.equal(hostRun.silver, before.silver, '被拒绝的类别命令不得扣款');
  assert.deepEqual(hostRun.runShopItems.map((item) => item.itemId), before.itemIds);
  assert.deepEqual(hostRun.runShopItems.map((item) => item.sold), before.sold);
  assert.deepEqual(hostRun.runShopChoices.map((choice) => choice.itemId ?? null), before.choiceItemIds);
  assert.equal(hostRun.runShopActiveCategory, before.category);
  assert.equal(hostRun.runShopSpecializationClaimed, before.claimed);
  assert.equal(
    [...hostRun.teamSpecialUpgrades.values()].reduce((sum, set) => sum + set.size, 0),
    before.specializationCount,
    '被拒绝的类别命令不得补发专精'
  );
  assert.equal(dirtySlots.length, dirtyBefore, '被拒绝的类别命令不产生同步副作用');
}

{
  // 客户端重连时恢复 Host 权威的整备步骤与商品选择项（含售价与售罄状态）。
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
      activeCategory: RUN_SHOP_STEP_SUPPLY,
      choices: [{
        choiceId: 'reconnected-supply-choice',
        itemId: 'run-shop-item:boss:1:0:unitCard',
        itemKind: 'unitCard',
        itemPrice: 14,
        soldOut: true,
        disabled: true,
        title: '客机单位',
        actionLabel: RUN_SHOP_SOLD_OUT_LABEL,
        card: { id: 'guest-unit', name: '客机单位', kind: 'summon', level: 3 }
      }]
    }
  });

  assert.equal(game.runShopActiveCategory, RUN_SHOP_STEP_SUPPLY, '客户端应恢复 Host 权威的整备步骤');
  assert.equal(game.shopPrices.unit, 15, 'client should restore the Host-authoritative price table');
  assert.equal(guestRun.shopPrices.unit, 15);
  assert.equal(game.runShopChoices[0].itemId, 'run-shop-item:boss:1:0:unitCard');
  assert.equal(game.runShopChoices[0].itemPrice, 14);
  assert.equal(game.runShopChoices[0].soldOut, true, '重连必须保留已售罄状态');
  assert.equal(game.runShopChoices[0].actionLabel, RUN_SHOP_SOLD_OUT_LABEL);
  assert.equal(game.runShopChoices[0].card.id, 'guest-unit', '商品卡面数据必须一并恢复');
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
  // 命令校验：新版军需铺只认“具体商品/专精”的 shopChoice，旧服务类别一律下架。
  const guestRun = makeRun({
    networkInteractionId: 'shop-1',
    networkShopRevision: 3,
    runShopChoices: [
      { choiceId: 'choice-a', disabled: false, itemId: 'run-shop-item:boss:1:0:unitCard' },
      {
        choiceId: 'choice-sold',
        disabled: true,
        soldOut: true,
        itemId: 'run-shop-item:boss:1:1:enchant',
        actionLabel: RUN_SHOP_SOLD_OUT_LABEL
      }
    ]
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
    teamGenericUpgradeCounts: new Map(),
    teamSpecialUpgrades: new Map(),
    teamSupportModifiersApplied: new Set()
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
    { ok: false, reasonCode: 'shop_reward_not_active' },
    '不在等待集合里的玩家不能操作共享整备'
  );

  // 新版军需铺没有“服务类别”这一步：即使还在整备中，shopCategory 也必须失败。
  for (const category of ['unit', 'upgrade', 'not-a-service']) {
    assert.deepEqual(
      validator.validate(makeCommand({
        playerId: 'guest',
        seq: category === 'unit' ? 1 : 2,
        name: COMMAND.SHOP_CATEGORY,
        payload: { category }
      }), 'guest'),
      { ok: false, reasonCode: 'shop_category_not_available' },
      `旧服务类别 ${category} 不应再被接受`
    );
  }

  assert.deepEqual(
    validator.validate(makeCommand({
      playerId: 'guest',
      seq: 3,
      name: COMMAND.SHOP_CHOOSE,
      payload: { choiceId: 'choice-a', offerId: 'stale-shop', revision: 3 }
    }), 'guest'),
    { ok: false, reasonCode: 'stale_shop' }
  );

  assert.deepEqual(
    validator.validate(makeCommand({
      playerId: 'guest',
      seq: 3,
      name: COMMAND.SHOP_CHOOSE,
      payload: { choiceId: 'choice-a', offerId: 'shop-1', revision: 99 }
    }), 'guest'),
    { ok: false, reasonCode: 'stale_shop_revision' }
  );

  const validChoice = validator.validate(makeCommand({
    playerId: 'guest',
    seq: 3,
    name: COMMAND.SHOP_CHOOSE,
    payload: { choiceId: 'choice-a', offerId: 'shop-1', revision: 3 }
  }), 'guest');

  assert.equal(validChoice.ok, true);
  assert.equal(validChoice.payload.choiceIndex, 0);

  assert.deepEqual(
    validator.validate(makeCommand({
      playerId: 'guest',
      seq: 4,
      name: COMMAND.SHOP_CHOOSE,
      payload: { choiceId: 'choice-sold', offerId: 'shop-1', revision: 3 }
    }), 'guest'),
    { ok: false, reasonCode: 'shop_choice_not_found' },
    '已售罄的商品不能在命令层被选中'
  );

  assert.deepEqual(
    validator.validate(makeCommand({
      playerId: 'guest',
      seq: 5,
      name: COMMAND.SHOP_CHOOSE,
      payload: { choiceId: 'missing-choice', offerId: 'shop-1', revision: 3 }
    }), 'guest'),
    { ok: false, reasonCode: 'shop_choice_not_found' }
  );

  // 「继续战斗」在整备期间有效，整备结束后失效。
  assert.equal(
    validator.validate(makeCommand({
      playerId: 'guest',
      seq: 6,
      name: COMMAND.SHOP_REWARD_SKIP
    }), 'guest').ok,
    true
  );
  guestRun.runShopFreeReward = false;
  assert.deepEqual(
    validator.validate(makeCommand({
      playerId: 'guest',
      seq: 7,
      name: COMMAND.SHOP_REWARD_SKIP
    }), 'guest'),
    { ok: false, reasonCode: 'shop_reward_not_active' }
  );
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
    runShopActiveCategory: RUN_SHOP_STEP_SPECIALIZATION_TYPE,
    openNextStrategyReward: () => false,
    updateWavePreview: () => {},
    startNextWave: () => {
      waveStarted += 1;
    }
  });

  game.updateWaveFlow();

  assert.equal(game.pendingWaveAdvance, true);
  assert.equal(waveStarted, 0, '免费专精步骤必须阻塞下一波');

  // 补给的付费购买也算整备的一部分：走完两步之前都不能开下一波。
  game.runShopActiveCategory = RUN_SHOP_STEP_SPECIALIZATION_UPGRADE;
  game.runShopChoices = [{ action: 'apply-team-special-upgrade', unitType: 'swordsman', upgrade: { id: 'x' } }];
  game.updateWaveFlow();
  assert.equal(game.pendingWaveAdvance, true);
  assert.equal(waveStarted, 0);

  game.runShopActiveCategory = RUN_SHOP_STEP_SUPPLY;
  game.runShopChoices = [];
  game.updateWaveFlow();
  assert.equal(game.pendingWaveAdvance, true, '补给铺阶段同样阻塞');
  assert.equal(waveStarted, 0);

  // 「继续战斗」结束整备后才放行。
  game.runShopFreeReward = false;
  game.runShopActiveCategory = null;
  game.updateWaveFlow();
  assert.equal(game.pendingWaveAdvance, false);
  assert.equal(waveStarted, 1);
}

{
  // 联机：只要还有一位玩家没完成整备，就不能推进下一波。
  const { game, hostRun, guestRun } = makeCoopPrepGame();
  let waveStarted = 0;
  // 用真实的 continueAfterStrategyFlow，只有它才会推进波次。
  delete game.continueAfterStrategyFlow;
  game.openNextStrategyReward = () => false;
  game.updateWavePreview = () => {};
  game.startNextWave = () => {
    waveStarted += 1;
  };

  game.openCoopRunShopForAll({ freeReward: true });
  game.pendingWaveAdvance = true;
  game.updateWaveFlow();
  assert.equal(waveStarted, 0, '本机整备未结束时不能开下一波');
  assert.equal(game.pendingWaveAdvance, true);

  assert.equal(game.applyNetworkShopRewardSkip('host'), true);
  assert.equal(waveStarted, 0, '还有一位玩家在整备，流程不能继续');
  assert.equal(game.pendingWaveAdvance, true);
  assert.equal(game.coopRewardKind, 'run-shop');
  assert.equal(game.paused, true, '等待队友期间必须保持暂停');
  assert.equal(hostRun.runShopFreeReward, false);
  assert.equal(guestRun.runShopFreeReward, true);

  // 等待界面与倒计时仍然生效。
  assert.equal(game.strategyEventUi.root.hidden, false);
  assert.equal(game.strategyEventUi.root.dataset.eventType, 'run-shop-waiting');
  assert.equal(game.strategyEventUi.title.textContent, '等待队友完成 Boss 整备');
  assert.match(game.strategyEventUi.summary.textContent, /所有玩家完成后会继续战斗/);
  assert.match(game.strategyEventUi.summary.textContent, /剩余 30 秒/);
  assert.equal(game.coopRewardAutoSelectSecondsRemaining, 30);
  assert.equal(game.strategyEventUi.choices.innerHTML, '');

  assert.equal(game.applyNetworkShopRewardSkip('guest'), true);
  assert.equal(game.coopRewardWaitSlots, null, '所有玩家结束后清空等待集合');
  assert.equal(game.paused, false);
  assert.equal(waveStarted, 1, '最后一位玩家完成时才推进下一波');
  assert.equal(game.pendingWaveAdvance, false);
  assert.equal(game.coopRewardAutoSelectSecondsRemaining, null, '整备结束后清空倒计时');
  assert.equal(game.strategyEventUi.root.hidden, true, '等待界面必须关闭');
  assert.equal(game.strategyEventUi.root.dataset.eventType, undefined);
}

{
  // 超时自动处理：Host 代领一项可用专精，但绝不代买需要银币的补给。
  const { game, hostRun, guestRun, addedCardsBySlot } = makeCoopPrepGame();
  game.openCoopRunShopForAll({ freeReward: true });
  const hostSilverBefore = hostRun.silver;
  const guestSilverBefore = guestRun.silver;
  const hostItems = game.runShopItems;
  assert.ok(Array.isArray(hostItems) && hostItems.length >= 4);

  // coopRewardSecondsRemaining() 与倒计时使用同一时钟；把截止时间放到过去即视为超时。
  const clockNow = globalThis.performance?.now?.() ?? Date.now();
  game.coopRewardDeadlineAtMs = clockNow - 1000;
  game.updateCoopRewardAutoResolve();

  assert.equal(hostRun.silver, hostSilverBefore, '超时自动处理不得花掉玩家银币');
  assert.equal(guestRun.silver, guestSilverBefore);
  assert.equal(hostItems.every((item) => item.sold === false), true, '超时不得代买任何商品');
  assert.equal(hostRun.teamSpecialUpgrades.get('swordsman').size, 1, '超时只代领一项专精');
  assert.equal(guestRun.teamSpecialUpgrades.get('knight').size, 1);
  assert.equal(addedCardsBySlot.host.length, 0, '超时不得代买卡牌商品');
  assert.equal(addedCardsBySlot.guest.length, 0);
  assert.equal(guestRun.runShopFreeReward, false, 'guest 的超时处理必须结束整备');
  assert.equal(guestRun.runShopItems, null);
  assert.equal(guestRun.runShopSpecializationClaimed, true);
  assert.equal(guestRun.runShopCompletedNodeKey, 'boss:1');
  // 本机（host）的权威整备状态保存在 game 上，run 只在作用域切换时镜像。
  assert.equal(game.runShopFreeReward, false, 'host 的超时处理必须结束整备');
  assert.equal(game.runShopItems, null);
  assert.equal(game.runShopSpecializationClaimed, true);
  assert.equal(game.runShopCompletedNodeKey, 'boss:1');
  assert.equal(game.coopRewardWaitSlots, null);
  assert.equal(game.coopRewardKind, null);
  assert.equal(game.paused, false);
}

{
  // 断线：跳过该玩家的整备，不补发专精、不发免费商品。
  const { game, hostRun, guestRun, addedCardsBySlot } = makeCoopPrepGame();
  game.openCoopRunShopForAll({ freeReward: true });
  const guestSilverBefore = guestRun.silver;
  guestRun.connected = false;

  assert.equal(game.resolveDisconnectedCoopRewardSlots(), true, '断线玩家必须被移出等待集合');
  assert.equal(game.coopRewardWaitSlots.has('guest'), false);
  assert.equal(game.coopRewardWaitSlots.has('host'), true, '另一位玩家继续整备');
  assert.equal(guestRun.silver, guestSilverBefore, '断线跳过不扣银币');
  assert.equal(guestRun.teamSpecialUpgrades.size, 0, '断线不补发专精');
  assert.equal(guestRun.runShopItems, null, '断线不发免费商品');
  assert.equal(addedCardsBySlot.guest.length, 0);
  assert.equal(guestRun.runShopSpecializationClaimed, true, '跳过的节点记为已处理，防止重连后补领');
  assert.equal(hostRun.runShopActiveCategory, RUN_SHOP_STEP_SPECIALIZATION_TYPE, 'Host 的整备不受影响');
  assert.ok(hostRun.runShopItems.length >= 4);
  assert.equal(
    game.withPlayerContext('guest', () => game.claimRunShopSpecialization(
      'knight',
      { id: 'knight-holy-shield', kind: 'unit-special' }
    )),
    false,
    '断线跳过的玩家不能补领专精'
  );
  assert.equal(guestRun.teamSpecialUpgrades.size, 0);
}

{
  // 重复打开 / 重连：不重置已售罄商品，也不重复发专精。
  const { game, guestRun } = makeCoopPrepGame();
  game.openCoopRunShopForAll({ freeReward: true });
  assert.equal(game.applyNetworkShopChoice('guest', 0), true);
  const guestUpgrade = guestRun.runShopChoices[0].upgrade;
  assert.equal(game.applyNetworkShopChoice('guest', 0), true);
  const unitIndex = guestRun.runShopChoices.findIndex((choice) => choice.itemKind === 'unitCard');
  assert.equal(game.applyNetworkShopChoice('guest', unitIndex), true);
  const soldItemId = guestRun.runShopItems.find((item) => item.sold).itemId;
  const claimedUpgrades = [...guestRun.teamSpecialUpgrades.get('knight')];

  // 同一节点重复初始化：不重建商品、不重置售罄、不重复发专精。
  assert.equal(game.withPlayerContext('guest', () => game.ensureRunShopPrep()), true);
  assert.equal(
    guestRun.runShopItems.find((item) => item.itemId === soldItemId).sold,
    true,
    '重新打开不得重置已售罄商品'
  );
  assert.deepEqual([...guestRun.teamSpecialUpgrades.get('knight')], claimedUpgrades);
  assert.equal(guestRun.runShopActiveCategory, RUN_SHOP_STEP_SUPPLY, '重开仍停留在补给铺');
  assert.equal(
    game.withPlayerContext('guest', () => game.claimRunShopSpecialization('knight', guestUpgrade)),
    false,
    '同一节点不能重复领取专精'
  );

  // 「继续战斗」后本节点整备完成：重新初始化同一节点不会重建商品，也不会补发专精。
  assert.equal(game.applyNetworkShopRewardSkip('guest'), true);
  assert.equal(guestRun.runShopFreeReward, false);
  assert.equal(guestRun.runShopCompletedNodeKey, 'boss:1');
  assert.equal(guestRun.runShopSpecializationClaimed, true);
  assert.equal(guestRun.runShopItems, null);
  assert.deepEqual([...guestRun.teamSpecialUpgrades.get('knight')], claimedUpgrades);
  assert.equal(
    game.withPlayerContext('guest', () => game.ensureRunShopPrep()),
    false,
    '已完成的整备节点不会被重建'
  );
  assert.equal(guestRun.runShopItems, null);
  assert.deepEqual([...guestRun.teamSpecialUpgrades.get('knight')], claimedUpgrades);
}

{
  // 客户端重连：只恢复 Host 同步过来的状态，不自行生成商品、不补发专精。
  const clientRun = makeRun({
    runShopFreeReward: false,
    runShopActiveCategory: null,
    runShopChoices: [],
    runShopItems: null,
    silver: 42
  });
  let opened = 0;
  const clientGame = Object.assign(Object.create(Game.prototype), {
    networkClientMode: true,
    localPlayerSlot: 'guest',
    players: { guest: clientRun },
    runShopFreeReward: false,
    runShopActiveCategory: null,
    runShopChoices: [],
    runShopItems: null,
    runShopOpen: false,
    shopPrices: { unit: 12 },
    openRunShop: () => {
      opened += 1;
      return true;
    },
    renderRunShop: () => {}
  });

  clientGame.applyNetworkPrivateUi({
    runShopState: {
      freeReward: true,
      activeCategory: RUN_SHOP_STEP_SUPPLY,
      choices: [
        {
          choiceId: 'supply-1',
          itemId: 'run-shop-item:boss:1:0:unitCard',
          itemKind: 'unitCard',
          itemPrice: 14,
          soldOut: true,
          disabled: true,
          title: '单位甲',
          actionLabel: RUN_SHOP_SOLD_OUT_LABEL
        },
        {
          choiceId: 'supply-2',
          itemId: 'run-shop-item:boss:1:4:energy',
          itemKind: 'energy',
          itemPrice: 8,
          soldOut: false,
          disabled: false,
          title: '能量补给 +2',
          actionLabel: '8 银币'
        }
      ]
    }
  });

  assert.equal(opened, 1, '重连恢复时应重新打开整备界面');
  assert.equal(clientGame.runShopFreeReward, true);
  assert.equal(clientGame.runShopActiveCategory, RUN_SHOP_STEP_SUPPLY);
  assert.equal(clientGame.runShopChoices[0].soldOut, true, '重连必须保留已售罄状态');
  assert.equal(clientGame.runShopChoices[0].actionLabel, RUN_SHOP_SOLD_OUT_LABEL);
  assert.equal(clientGame.runShopChoices[1].itemPrice, 8);
  assert.equal(clientGame.ensureRunShopPrep(), false, '客户端不得自行生成商品');
  assert.equal(
    clientGame.claimRunShopSpecialization('knight', { id: 'knight-holy-shield', kind: 'unit-special' }),
    false,
    '客户端不得自行补发专精'
  );
  assert.equal(clientRun.teamSpecialUpgrades.size, 0);
}

{
  // 最终 Boss 直接结算，只有仍有后续战斗的模式才继续提供整备。
  const makeBossGame = ({ challengeMode, bossesDefeated, onOpen, onFinish }) => Object.assign(
    Object.create(Game.prototype),
    {
      levelSession: { debug: false, challengeMode },
      levelFinished: false,
      strategyEvent: null,
      currentWave: { kind: 'boss', index: 8 },
      currentEnemyForce: null,
      waveIndex: 9,
      waveSchedule: new Array(16).fill(null),
      bossesDefeated,
      pendingWaveAdvance: false,
      coop: { enabled: true },
      players: { host: makeRun({ runShopFreeReward: false, silver: 0 }) },
      localPlayerSlot: 'host',
      activeEconomySlot: 'host',
      silver: 0,
      playerBase: null,
      updateWavePreview: () => {},
      updateHud: () => {},
      ensureWaveConfig: () => null,
      openCoopRunShopForAll: (options) => {
        onOpen(options);
        return true;
      },
      openRunShop: (options) => {
        onOpen(options);
        return true;
      },
      finishLevel: (win, options) => onFinish(win, options)
    }
  );

  let finalFinishes = [];
  let finalOpens = 0;
  const finalGame = makeBossGame({
    challengeMode: 'standard',
    bossesDefeated: 2,
    onOpen: () => {
      finalOpens += 1;
    },
    onFinish: (win, options) => finalFinishes.push({ win, options })
  });
  finalGame.completeCurrentWave();

  assert.equal(finalFinishes.length, 1, '标准战役最终 Boss 后直接结算');
  assert.equal(finalFinishes[0].options.endReason, 'waves_completed');
  assert.equal(finalOpens, 0, '最终 Boss 不得打开当局用不到的整备');
  assert.equal(finalGame.pendingWaveAdvance, false);
  assert.equal(finalGame.bossesDefeated, 3);
  assert.ok(finalGame.players.host.silver > 0, 'Boss 战利银币仍照常发放');

  let endlessFinishes = 0;
  let endlessOptions = null;
  const endlessGame = makeBossGame({
    challengeMode: 'endless',
    bossesDefeated: 3,
    onOpen: (options) => {
      endlessOptions = options;
    },
    onFinish: () => {
      endlessFinishes += 1;
    }
  });
  endlessGame.completeCurrentWave();

  assert.equal(endlessFinishes, 0, '无尽模式不因 Boss 序号结算');
  assert.deepEqual(endlessOptions, { freeReward: true }, '无尽模式仍有后续战斗，必须继续提供整备');
  assert.equal(endlessGame.pendingWaveAdvance, true);
  assert.equal(endlessGame.bossesDefeated, 4);
}

{
  // 补给铺渲染：直接展示具体商品、明码标价与售罄状态，没有旧八类服务主页。
  const services = { hidden: true, innerHTML: '' };
  const skip = { hidden: true, textContent: '', disabled: true };
  const back = { hidden: true, textContent: '' };
  const choices = { hidden: true };
  const choiceList = { classList: makeClassList(), innerHTML: '', scrollTop: 0 };
  const remainingCards = [
    { id: 'unit-a', name: '单位甲', kind: 'summon', unitType: 'swordsman', summary: '甲' },
    { id: 'enchant-b', name: '附魔乙', kind: 'enchant', enchantmentId: 'flame', summary: '乙' },
    { id: 'spell-c', name: '法术丙', kind: 'spell', summary: '丙' }
  ];
  const game = Object.assign(Object.create(Game.prototype), {
    localPlayerSlot: 'guest',
    activeEconomySlot: 'guest',
    players: {
      guest: makeRun({
        silver: 100,
        runShopFreeReward: true,
        runShopActiveCategory: RUN_SHOP_STEP_SUPPLY,
        runShopChoices: [],
        acquiredUnitCardTypes: new Set(['swordsman'])
      })
    },
    silver: 0,
    bossesDefeated: 1,
    teamGenericUpgradeCounts: new Map(),
    runShopOpen: true,
    runShopFreeReward: true,
    runShopActiveCategory: RUN_SHOP_STEP_SUPPLY,
    runShopChoices: [],
    runShopItems: null,
    runShopUi: {
      root: { classList: makeClassList() },
      services,
      skip,
      back,
      choices,
      choiceList,
      silver: { textContent: '' },
      title: { textContent: '' },
      kicker: { textContent: '' }
    },
    waveRewardCardPool: () => remainingCards
  });

  game.runShopItems = game.createRunShopSupplyItems('boss:1');
  game.runShopChoices = game.createRunShopSupplyChoices();
  game.renderRunShop();

  assert.equal(services.hidden, false);
  assert.match(services.innerHTML, /run-shop-supply-item/, '补给铺必须渲染具体商品');
  assert.match(services.innerHTML, /银币/, '商品价格必须直接可见');
  assert.match(services.innerHTML, /单位甲|附魔乙|法术丙/, '商品名称必须直接可见');
  assert.ok(services.innerHTML.includes(RUN_SHOP_ENERGY_CARD_ID) === false, '渲染层不应暴露伪卡牌 id');
  assert.doesNotMatch(
    services.innerHTML,
    /复制卡牌|移除卡牌|升级卡牌|临时咒印|特性专精/,
    '旧八类服务不得再渲染'
  );
  assert.doesNotMatch(services.innerHTML, /disabled aria-disabled="true"/, '余额充足时商品可选');
  assert.equal(skip.hidden, false);
  assert.equal(skip.textContent, RUN_SHOP_CONTINUE_LABEL);
  assert.equal(skip.disabled, false);
  assert.equal(back.hidden, true);
  assert.equal(choices.hidden, true);

  // 余额不足：仍显示具体价格，但按钮禁用。
  game.players.guest.silver = 0;
  game.runShopChoices = game.createRunShopSupplyChoices();
  game.renderRunShop();
  assert.match(services.innerHTML, /disabled aria-disabled="true"/, '余额不足的商品必须禁用');
  assert.match(services.innerHTML, /银币/);

  // 已售罄：文案切换为「已售罄」，但仍占据同一个商品位。
  game.players.guest.silver = 100;
  game.runShopItems[0].sold = true;
  game.runShopChoices = game.createRunShopSupplyChoices();
  game.renderRunShop();
  assert.match(services.innerHTML, new RegExp(RUN_SHOP_SOLD_OUT_LABEL));

  // 第一步（选兵种）只显示「免费」，且未领专精时不出现「继续战斗」。
  game.runShopActiveCategory = RUN_SHOP_STEP_SPECIALIZATION_TYPE;
  game.runShopChoices = game.createRunShopSpecializationTypeChoices();
  game.renderRunShop();
  assert.match(services.innerHTML, new RegExp(RUN_SHOP_FREE_LABEL), '免费专精必须标为免费');
  assert.doesNotMatch(services.innerHTML, /银币/, '免费专精不涉及银币价格');
  assert.equal(skip.hidden, true, '专精还没领完时不显示「继续战斗」');
  assert.equal(game.runShopUi.renderedCategory, RUN_SHOP_STEP_SPECIALIZATION_TYPE);
}

{
  // 步骤切换时的面板滚动行为：切换步骤回到顶部，同步刷新不打断滚动。
  const root = { classList: makeClassList(), scrollTop: 68 };
  const choiceList = { classList: makeClassList(), innerHTML: '', scrollTop: 34 };
  const services = { hidden: true, innerHTML: '' };
  const choices = { hidden: true };
  const skip = { hidden: true, textContent: '', disabled: true };
  const back = { hidden: true, textContent: '' };
  const game = Object.assign(Object.create(Game.prototype), {
    localPlayerSlot: 'host',
    activeEconomySlot: 'host',
    runShopOpen: true,
    runShopFreeReward: true,
    runShopActiveCategory: RUN_SHOP_STEP_SPECIALIZATION_TYPE,
    runShopChoices: [],
    runShopItems: null,
    runShopPrepNodeKey: 'boss:2',
    runShopSpecializationClaimed: false,
    runShopSpecializationUnitType: null,
    bossesDefeated: 2,
    silver: 40,
    waveRewardDeck: [],
    friendlyUnits: [],
    acquiredUnitCardTypes: new Set(['swordsman']),
    teamGenericUpgradeCounts: new Map(),
    teamSpecialUpgrades: new Map(),
    teamSupportModifiersApplied: new Set(),
    updateHud: () => {},
    runShopUi: {
      root,
      services,
      choices,
      choiceList,
      skip,
      back,
      silver: { textContent: '' },
      title: { textContent: '' },
      kicker: { textContent: '' }
    }
  });

  game.runShopChoices = game.createRunShopSpecializationTypeChoices();
  game.runShopItems = game.createRunShopSupplyItems(game.runShopPrepKey());
  game.renderRunShop();
  assert.equal(root.scrollTop, 0, '进入整备第一步应回到面板顶部');
  assert.equal(choiceList.scrollTop, 0);
  assert.equal(game.runShopUi.renderedCategory, RUN_SHOP_STEP_SPECIALIZATION_TYPE);
  assert.equal(services.hidden, false);
  assert.equal(choices.hidden, true);
  assert.equal(skip.hidden, true);
  assert.equal(back.hidden, true);

  root.scrollTop = 52;
  game.renderRunShop();
  assert.equal(root.scrollTop, 52, '同一步骤的状态刷新不应打断玩家滚动');
  assert.equal(game.runShopUi.renderedCategory, RUN_SHOP_STEP_SPECIALIZATION_TYPE);

  // 第二步（选择该兵种专精）：切回顶部并改用卡面列表。
  const unitType = game.runShopChoices[0].unitType;
  assert.equal(game.selectRunShopSpecializationUnit(unitType), true);
  assert.equal(game.runShopActiveCategory, RUN_SHOP_STEP_SPECIALIZATION_UPGRADE);
  assert.equal(root.scrollTop, 0, '切换步骤应回到面板顶部');
  assert.equal(choiceList.scrollTop, 0);
  assert.equal(game.runShopUi.renderedCategory, RUN_SHOP_STEP_SPECIALIZATION_UPGRADE);
  assert.equal(services.hidden, true);
  assert.equal(choices.hidden, false);
  assert.equal(back.hidden, false);
  assert.equal(back.textContent, '← 重新选择兵种');
  assert.ok(choiceList.innerHTML.length > 0, '专精列表必须渲染卡面选项');

  // 返回兵种列表（真实回退方法）：再次回到顶部。
  assert.equal(game.applyNetworkShopBack('host'), true);
  assert.equal(game.runShopActiveCategory, RUN_SHOP_STEP_SPECIALIZATION_TYPE);
  assert.equal(root.scrollTop, 0, '返回上一步应回到面板顶部');

  // 领取专精 → 补给铺：切回顶部，并出现「继续战斗」。
  assert.equal(game.selectRunShopSpecializationUnit(unitType), true);
  const upgrade = game.runShopChoices[0].upgrade;
  assert.equal(game.claimRunShopSpecialization(unitType, upgrade), true);
  assert.equal(game.runShopActiveCategory, RUN_SHOP_STEP_SUPPLY);
  assert.equal(root.scrollTop, 0, '切换到补给铺应回到面板顶部');
  assert.equal(game.runShopUi.renderedCategory, RUN_SHOP_STEP_SUPPLY);
  assert.equal(skip.hidden, false);
  assert.equal(skip.textContent, RUN_SHOP_CONTINUE_LABEL);
  assert.equal(services.hidden, false);
  assert.equal(choices.hidden, true);
  assert.match(services.innerHTML, /run-shop-supply-item/);

  // 没有整备步骤时不渲染服务主页。
  game.runShopFreeReward = false;
  game.runShopActiveCategory = null;
  game.runShopChoices = [];
  root.scrollTop = 30;
  game.renderRunShop();
  assert.equal(game.runShopUi.renderedCategory, null);
  assert.match(services.innerHTML, /当前没有可用的军需补给/);
  assert.equal(skip.hidden, true);
  assert.equal(root.scrollTop, 0, '退出整备步骤应回到面板顶部');
}

console.log('Coop run-shop flow checks passed.');
