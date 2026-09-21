// 开局选牌与抽牌堆循环回归测试：
// 1) 开局步骤由关卡路线数驱动：单位卡三选一 ×路线数 → 能力卡 → 地形卡；
//    不再有开局法术卡与开局附魔卡步骤（附魔改为附魔卡一次性生成符文石）；
// 2) 每种开局事件都能给出三张对应种类的候选卡（牌组不足时用全部同名卡补足）；
// 3) 地形卡候选必须按地形牌规则筛选，不能把所有法术都当成地形卡；
// 4) 多路线关卡同时增加开局单位卡选择次数与开局能量；
// 5) 联机“开局选择完成”只在最后一次选完后发出；
// 6) 弃牌补位仍沿用“抽牌堆为空时把弃牌堆洗回抽牌堆”的原有循环规则。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  location: { href: 'http://localhost/', search: '' },
  matchMedia: () => ({ matches: false }),
  addEventListener: () => {},
  removeEventListener: () => {}
};

globalThis.document = {
  body: {
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => false,
      contains: () => false
    }
  }
};

const [
  { BALANCE, CARD_DEFINITIONS, isTerrainCard, openingEnergyForLevel, openingUnitCardCount },
  { CardSystem },
  {
    Game,
    isOpeningRewardType,
    openingRewardStepsForLevel
  }
] = await Promise.all([
  import('../src/data/gameData.js'),
  import('../src/systems/CardSystem.js'),
  import('../src/systems/Game.js')
]);
const GAME_SOURCE = readFileSync(new URL('../src/systems/Game.js', import.meta.url), 'utf8');

// ---- 1) 开局步骤顺序与路线数派生 ----
const openingTypes = ['opening-unit', 'opening-ability', 'opening-terrain'];
openingTypes.forEach((type) => {
  assert.equal(isOpeningRewardType(type), true, `${type} 应被识别为开局步骤`);
});
// 法术卡与附魔卡的开口步骤已移除。
assert.equal(isOpeningRewardType('opening-spell'), false, '开局不应再有法术卡步骤');
assert.equal(isOpeningRewardType('opening-enchant'), false, '开局不应再有附魔卡步骤');
assert.equal(isOpeningRewardType('wave-reward'), false);

const declaredOrder = [...GAME_SOURCE.matchAll(/type: '(opening-[a-z]+)'/g)].map((match) => match[1]);
assert.deepEqual(
  declaredOrder,
  openingTypes,
  '开局步骤声明顺序必须是 单位 → 能力 → 地形'
);

{
  const single = openingRewardStepsForLevel({ routeCount: 1 });
  assert.deepEqual(
    single.map((step) => step.type),
    ['opening-unit', 'opening-ability', 'opening-terrain'],
    '单路线开局 = 1 次单位卡 + 1 次能力卡 + 1 次地形卡'
  );
  assert.equal(openingUnitCardCount({ routeCount: 1 }), 1);
  assert.equal(openingUnitCardCount({ routeCount: 2 }), 2);
  assert.equal(openingUnitCardCount({}), 1, '缺少 routeCount 时按单路线处理');

  const dual = openingRewardStepsForLevel({ routeCount: 2 });
  assert.deepEqual(
    dual.map((step) => step.type),
    ['opening-unit', 'opening-unit', 'opening-ability', 'opening-terrain'],
    '多路线开局按路线数增加单位卡选择次数'
  );

  const baseline = Math.max(0, Number(BALANCE.playerEnergy?.initial) || 0);
  assert.equal(
    openingEnergyForLevel({ routeCount: 1 }),
    baseline,
    '单路线开局能量保持原值'
  );
  assert.equal(
    openingEnergyForLevel({ routeCount: 2 }),
    baseline + Math.max(0, Number(BALANCE.opening?.energyPerExtraRoute) || 0),
    '多一条路线必须额外增加开局能量'
  );
}

function makeGame(overrides = {}) {
  return Object.assign(Object.create(Game.prototype), {
    levelSession: { deck: [], cardLevels: {}, level: { routeCount: 1 } },
    localPlayerSlot: 'p1',
    activeEconomySlot: 'p1',
    coop: { enabled: false },
    players: null,
    pendingStrategyRewards: [],
    isEndlessMode: () => false,
    cardSystem: { applyRuntimeCardLevel: (card) => card },
    ...overrides
  });
}

{
  const game = makeGame();
  game.queueOpeningRewardSteps();
  assert.deepEqual(
    game.pendingStrategyRewards.map((entry) => entry.type),
    ['opening-ability', 'opening-terrain'],
    '开局第一步之后应排入能力卡与地形卡两次三选一'
  );
  assert.equal(game.pendingStrategyRewards.every((entry) => entry.coop === false), true);
  assert.equal(game.hasPendingOpeningReward(), true);

  const dualGame = makeGame({
    levelSession: { deck: [], cardLevels: {}, level: { routeCount: 2 } }
  });
  dualGame.queueOpeningRewardSteps();
  assert.deepEqual(
    dualGame.pendingStrategyRewards.map((entry) => entry.type),
    ['opening-unit', 'opening-ability', 'opening-terrain'],
    '双路线开局第二步仍是单位卡三选一'
  );

  const coopGame = makeGame({ coop: { enabled: true }, players: { p1: {} } });
  coopGame.queueOpeningRewardSteps();
  assert.equal(
    coopGame.pendingStrategyRewards.every((entry) => entry.coop === true),
    true,
    '联机开局步骤必须带 coop 标记，才能重走全员三选一流程'
  );

  const drained = makeGame();
  assert.equal(drained.hasPendingOpeningReward(), false);
}

// ---- 1b) 队列推进：开局步骤没走完不得开第一波 ----
{
  const calls = [];
  const game = makeGame({
    awaitingOpeningReward: true,
    levelFinished: false,
    pendingWaveAdvance: false,
    pendingStrategyRewards: [],
    strategyEvent: null,
    openNextStrategyReward: Game.prototype.openNextStrategyReward,
    openStrategyEvent(type) {
      calls.push(type);
      this.strategyEvent = { type, choices: [{}] };
      return true;
    },
    cardSystem: {
      applyRuntimeCardLevel: (card) => card,
      drawToFullHand() {
        calls.push('draw-hand');
      }
    },
    updateWavePreview() {
      calls.push('preview');
    },
    startNextWave() {
      calls.push('wave-1');
    }
  });
  game.queueOpeningRewardSteps();
  assert.equal(game.hasPendingOpeningReward(), true);

  for (let step = 0; step < 2; step += 1) {
    game.strategyEvent = null;
    game.continueAfterStrategyFlow(true);
    assert.equal(game.awaitingOpeningReward, true, '开局未选完前不得结束开局等待');
  }
  assert.deepEqual(
    calls,
    ['opening-ability', 'opening-terrain'],
    '开局应按 能力 → 地形 依次弹出三选一'
  );

  calls.length = 0;
  game.strategyEvent = null;
  game.continueAfterStrategyFlow(true);
  assert.deepEqual(calls, ['draw-hand', 'preview', 'wave-1'], '全部选完后补满手牌并开第一波');
  assert.equal(game.awaitingOpeningReward, false);
  assert.equal(game.hasPendingOpeningReward(), false);
}

// ---- 2) 开局三选一的候选池 ----
{
  const game = makeGame();
  const expectations = [
    ['opening-ability', 'ability', '选择起始能力卡'],
    ['opening-terrain', 'spell', '选择起始地形卡']
  ];
  expectations.forEach(([type, kind, title]) => {
    const event = game.createStrategyEvent(type);
    assert.equal(event.title, title);
    assert.equal(
      event.choices.every((choice) => choice.card.kind === kind && choice.action === 'add-card'),
      true,
      `${type} 的候选卡种类必须是 ${kind}`
    );
    assert.equal(
      event.choices.every((choice) => (choice.card.level ?? 1) >= 1),
      true
    );
  });

  // 地形卡候选必须全部是地形牌，不能混入普通法术。
  const terrainPool = CARD_DEFINITIONS.filter(
    (card) => card.kind === 'spell' && !card.lootOnly && !card.retired && isTerrainCard(card)
  );
  assert.ok(terrainPool.length > 0, '卡表中应存在地形牌');
  const terrainEvent = game.createStrategyEvent('opening-terrain');
  assert.equal(
    terrainEvent.choices.length,
    Math.min(3, terrainPool.length),
    '地形卡三选一的候选数量受地形牌池上限约束'
  );
  assert.equal(
    terrainEvent.choices.every((choice) => isTerrainCard(choice.card)),
    true,
    '地形卡候选必须全部满足地形牌规则'
  );
  const nonTerrainSpells = CARD_DEFINITIONS.filter(
    (card) => card.kind === 'spell' && !card.retired && !isTerrainCard(card)
  );
  if (nonTerrainSpells.length > 0) {
    assert.equal(
      terrainEvent.choices.some((choice) => nonTerrainSpells.some((spell) => spell.id === choice.card.id)),
      false,
      '普通法术不得被当成地形卡'
    );
  }

  const unitEvent = game.createStrategyEvent('opening-unit');
  assert.equal(unitEvent.choices.length, 3);
  assert.equal(
    unitEvent.choices.every((choice) => (
      choice.action === 'grant-opening-unit-card' && choice.card.kind === 'summon'
    )),
    true,
    '开局单位三选一必须仍然发放单位卡'
  );
}

{
  // 牌组里该类不足三张时，用全部同名卡补足三选一
  const deckAbility = CARD_DEFINITIONS.find((card) => card.kind === 'ability' && !card.retired);
  const game = makeGame({
    levelSession: { deck: [deckAbility.id], cardLevels: { [deckAbility.id]: 3 }, level: { routeCount: 1 } }
  });
  const event = game.createStrategyEvent('opening-ability');
  assert.equal(event.choices.length, 3, '牌组只有一张能力卡时也应给出三选一');
  const deckChoice = event.choices.find((choice) => choice.card.id === deckAbility.id);
  if (deckChoice) assert.equal(deckChoice.card.level, 3, '牌组内的卡应使用玩家升级等级');
}

// ---- 3) 联机开局完成通知只在最后一次选完后发出 ----
{
  const notifyIndex = GAME_SOURCE.indexOf('notifyOpeningSelectionComplete?.()');
  assert.ok(notifyIndex > 0, '应保留联机开局完成通知');
  const notifyGuard = GAME_SOURCE.slice(Math.max(0, notifyIndex - 400), notifyIndex);
  assert.match(
    notifyGuard,
    /!this\.hasPendingOpeningReward\(\)/,
    'notifyOpeningSelectionComplete 必须等到开局全部选择结束'
  );
}

// ---- 4) 弃牌 / 抽牌堆循环保持原有行为（弃牌堆洗回抽牌堆） ----
function makeDiscardSystem({ discardPile, drawPile = [] }) {
  return Object.assign(Object.create(CardSystem.prototype), {
    handCards: new Array(10).fill(null),
    drawPile,
    discardPile,
    pendingDrawAnimations: new Set(),
    updatePileUi() {},
    isCardSpent: () => false
  });
}

{
  const unitCard = { id: 'barbarians', instanceId: 'unit-1', kind: 'summon' };
  const system = makeDiscardSystem({ discardPile: [unitCard] });
  const drawn = system.refillHandSlot(0);
  assert.equal(drawn, unitCard, '抽牌堆为空时应把弃牌堆洗回抽牌堆并补回手牌');
  assert.deepEqual(system.discardPile, []);
  assert.equal(system.handCards[0], unitCard);
}

console.log('opening reward sequence checks passed');
