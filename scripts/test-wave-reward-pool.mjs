import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createAttackRangeRing } from '../src/art/lowpoly.js';
import { UNIT_SPECIAL_UPGRADES } from '../src/data/cardUpgrades.js';
import { CARD_DEFINITIONS } from '../src/data/gameData.js';
import {
  createWaveRewardDeckIds,
  shouldConsumeWaveRewardCard,
  waveRewardUnitCards
} from '../src/systems/waveRewardPool.js';

globalThis.window = {
  innerWidth: 1,
  innerHeight: 1
};
const {
  createWaveRewardCandidateEntries,
  Game,
  normalizeStrategyEventType,
  shouldAutoGuardSummonedUnit
} = await import('../src/systems/Game.js');
assert.equal(Game.prototype.weightedCardChoices, undefined, 'wave affixes do not weight card rewards');

const unifiedNormalCards = Array.from({ length: 8 }, (_, index) => ({
  id: `normal-reward-${index + 1}`,
  name: `普通奖励 ${index + 1}`,
  summary: '普通卡牌',
  kind: index === 7 ? 'summon' : 'spell',
  unitType: index === 7 ? 'knight' : undefined
}));
const unifiedTrainingChoices = Array.from({ length: 4 }, (_, index) => ({
  action: 'add-card',
  actionLabel: '获得训练卡',
  card: { id: `training-reward-${index + 1}`, kind: 'tactic' }
}));
const unifiedCandidates = createWaveRewardCandidateEntries(
  unifiedNormalCards,
  unifiedTrainingChoices
);
assert.equal(unifiedCandidates.length, 12, 'all normal and training cards share one candidate pool');
assert.deepEqual(
  unifiedCandidates.map((candidate) => candidate.card.id),
  [...unifiedNormalCards, ...unifiedTrainingChoices.map((choice) => choice.card)].map((card) => card.id)
);
assert.ok(unifiedCandidates.slice(0, 8).every((candidate) => (
  candidate.rewardSource === 'wave-reward-deck'
)));
assert.ok(unifiedCandidates.slice(8).every((candidate) => (
  candidate.rewardSource == null && !Object.hasOwn(candidate, 'weight')
)));

assert.equal(shouldConsumeWaveRewardCard({
  rewardSource: 'wave-reward-deck',
  action: 'add-card',
  card: { kind: 'summon', unitType: 'raider' }
}), true, 'summon reward cards are one-time offers');

assert.equal(shouldConsumeWaveRewardCard({
  rewardSource: 'wave-reward-deck',
  action: 'add-card',
  card: { kind: 'spell' }
}), true, 'non-unit reward cards remain one-time offers');

assert.equal(shouldConsumeWaveRewardCard({
  rewardSource: 'run-shop',
  action: 'add-card',
  card: { kind: 'summon' }
}), false, 'run shop choices never use the wave reward pool rule');
assert.equal(shouldConsumeWaveRewardCard({
  action: 'add-card',
  card: { id: 'fire-enchant', kind: 'enchant' }
}, 'wave-reward', ['fire-enchant']), true, 'a synchronized wave reward still consumes without a source marker');
assert.equal(shouldConsumeWaveRewardCard({
  action: 'add-card',
  card: { id: 'team-upgrade-unit-attack', kind: 'tactic' }
}, 'wave-reward', ['fire-enchant']), false, 'repeatable training cards stay outside the one-time reward deck');

const unitRewardCard = { id: 'lightning-mages', kind: 'summon', unitType: 'lightningMage' };
const regularRewardCard = { id: 'fire-enchant', kind: 'enchant' };
const liveSessionRewardDeck = createWaveRewardDeckIds([regularRewardCard], CARD_DEFINITIONS);
const availableUnitRewardCards = waveRewardUnitCards(CARD_DEFINITIONS);
assert.equal(availableUnitRewardCards.length, 15);
assert.ok(
  availableUnitRewardCards.every((card) => liveSessionRewardDeck.includes(card.id)),
  'real sessions exclude summons from the combat deck, so reward initialization must add every unit card separately'
);
const liveSessionPoolGame = Object.assign(Object.create(Game.prototype), {
  localPlayerSlot: 'p1',
  levelSession: {
    challengeMode: 'standard',
    deck: [regularRewardCard],
    cardLevels: { 'lightning-mages': 2 },
    players: {
      p1: { cardLevels: { 'lightning-mages': 2 } },
      p2: { cardLevels: { 'lightning-mages': 5 } }
    }
  },
  waveRewardDeck: liveSessionRewardDeck,
  acquiredUnitCardTypes: new Set(),
  teamSpecialUpgrades: new Map(),
  selectedCardPool() {
    return [regularRewardCard];
  },
  cardSystem: {
    applyRuntimeCardLevel(card) {
      return card;
    }
  }
});
const liveUnitRewardPool = liveSessionPoolGame.waveRewardCardPool()
  .filter((card) => card.kind === 'summon');
assert.equal(liveUnitRewardPool.length, 15, 'normal live-session rewards must actually expose unit cards');
assert.equal(
  liveUnitRewardPool.find((card) => card.id === 'lightning-mages')?.level,
  5,
  'wave-reward unit cards use the highest multiplayer card level'
);
const rewardPoolGame = Object.assign(Object.create(Game.prototype), {
  localPlayerSlot: 'p1',
  levelSession: { deck: [unitRewardCard, regularRewardCard] },
  waveRewardDeck: [unitRewardCard.id, regularRewardCard.id],
  acquiredUnitCardTypes: new Set(),
  teamSpecialUpgrades: new Map(),
  selectedCardPool() {
    return [unitRewardCard, regularRewardCard];
  }
});
assert.deepEqual(
  rewardPoolGame.waveRewardCardPool().map((card) => card.id),
  [unitRewardCard.id, regularRewardCard.id],
  'normal wave rewards include summon cards'
);
assert.equal(rewardPoolGame.consumeWaveRewardCard(unitRewardCard), true);
assert.equal(rewardPoolGame.waveRewardDeck.includes(unitRewardCard.id), false);
assert.equal(rewardPoolGame.consumeWaveRewardCard(regularRewardCard), true);
assert.equal(rewardPoolGame.waveRewardDeck.includes(regularRewardCard.id), false);
assert.equal(rewardPoolGame.consumeWaveRewardCard(regularRewardCard), false, 'a claimed fire enchant cannot be consumed or offered twice');

const sharedWaveChoices = [{ action: 'add-card', card: regularRewardCard }];
const waveEventGame = {
  resetStrategyRewardRerollForEvent() {},
  createCardWaveRewardChoices: () => sharedWaveChoices
};
const normalWaveEvent = Game.prototype.createStrategyEvent.call(waveEventGame, 'wave-reward', {
  wave: { index: 2, kind: 'normal' }
});
const eliteWaveEvent = Game.prototype.createStrategyEvent.call(waveEventGame, 'wave-reward', {
  wave: { index: 3, kind: 'elite' }
});
assert.equal(normalWaveEvent.type, 'wave-reward');
assert.equal(eliteWaveEvent.type, 'wave-reward');
assert.equal(normalWaveEvent.choices, sharedWaveChoices);
assert.equal(eliteWaveEvent.choices, sharedWaveChoices, 'normal and elite waves must use the same reward choice source');

let synchronizedChoiceConsumed = null;
const synchronizedChoiceGame = {
  strategyEvent: { type: 'wave-reward' },
  cardSystem: {
    addCardToDrawPile: () => ({ added: true })
  },
  waveRewardDeckIds: () => ['fire-enchant'],
  consumeWaveRewardCard(card) {
    synchronizedChoiceConsumed = card.id;
    return true;
  },
  applyStrategyChoiceCost() {}
};
assert.equal(Game.prototype.applyStrategyChoice.call(synchronizedChoiceGame, {
  action: 'add-card',
  card: regularRewardCard
}), true);
assert.equal(synchronizedChoiceConsumed, 'fire-enchant', 'restored wave choices must still consume the selected definition');

let rewardPoolDirtyMarks = 0;
rewardPoolGame.networkBridge = {
  markPrivateStateDirty(slot) {
    assert.equal(slot, 'p1');
    rewardPoolDirtyMarks += 1;
  }
};
assert.equal(rewardPoolGame.recordAcquiredUnitCard(unitRewardCard, 'p1'), true);
const unlockedSpecializationIds = UNIT_SPECIAL_UPGRADES.lightningMage.map((upgrade) => (
  `team-special-lightningMage-${upgrade.id}`
));
assert.ok(unlockedSpecializationIds.every((id) => rewardPoolGame.waveRewardDeck.includes(id)));
const unlockedSpecializationCards = rewardPoolGame.waveRewardCardPool()
  .filter((card) => unlockedSpecializationIds.includes(card.id));
assert.equal(unlockedSpecializationCards.length, unlockedSpecializationIds.length);
assert.ok(unlockedSpecializationCards.every((card) => (
  card.kind === 'ability'
  && card.unitType === 'lightningMage'
  && card.exhaust === true
  && card.energyCost === 0
  && card.effect?.type === 'apply-team-special-upgrade'
)));
rewardPoolGame.activeEconomySlot = 'p1';
rewardPoolGame.friendlyUnits = [];
rewardPoolGame.teamSupportModifiersApplied = new Set();
rewardPoolGame.abilitiesFor = () => null;
const acquiredSpecialization = UNIT_SPECIAL_UPGRADES.lightningMage[0];
assert.equal(rewardPoolGame.applyTeamSpecialUpgrade('lightningMage', acquiredSpecialization), true);
assert.equal(
  rewardPoolGame.waveRewardDeck.includes(`team-special-lightningMage-${acquiredSpecialization.id}`),
  false,
  'specializations obtained elsewhere are removed from the wave reward pool'
);
assert.equal(rewardPoolGame.recordAcquiredUnitCard(unitRewardCard, 'p1'), false);
assert.equal(rewardPoolGame.recordAcquiredUnitCard({
  kind: 'ability',
  unitType: 'archer'
}, 'p1'), false, 'only summon cards unlock unit specialization rewards');
assert.equal(rewardPoolDirtyMarks, 2);

assert.equal(normalizeStrategyEventType('unit-upgrade'), 'wave-reward');
assert.equal(normalizeStrategyEventType('altar-reward'), 'altar-reward');
assert.equal(shouldAutoGuardSummonedUnit(unitRewardCard), true);
assert.equal(shouldAutoGuardSummonedUnit({ kind: 'ability' }), false);

let openedBossShopOptions = null;
const bossRewardGame = Object.assign(Object.create(Game.prototype), {
  currentWave: { index: 7, kind: 'boss' },
  currentEnemyForce: { index: 7, kind: 'boss' },
  levelFinished: false,
  waveIndex: 7,
  bossesDefeated: 0,
  pendingWaveAdvance: false,
  coop: { enabled: false },
  isEndlessMode: () => true,
  ensureWaveConfig() {},
  updateWavePreview() {},
  grantWaveSilver() {},
  openRunShop(options) {
    openedBossShopOptions = options;
    return true;
  }
});
bossRewardGame.completeCurrentWave();
assert.deepEqual(openedBossShopOptions, { freeReward: true });
assert.equal(bossRewardGame.pendingWaveAdvance, true);
assert.equal(bossRewardGame.strategyEvent, undefined, 'Boss 结算不应再生成随机三选一策略奖励');
assert.equal(Game.prototype.createBossRewardChoices, undefined);

let soloAutoSkipCount = 0;
const soloAutoSkipGame = Object.assign(Object.create(Game.prototype), {
  autoSkipWaveRewards: true,
  autoSkippedWaveRewardKey: null,
  strategyEvent: { type: 'wave-reward', wave: { index: 8 }, choices: [{ id: 'untouched' }] },
  wave: 8,
  waveIndex: 8,
  bossesDefeated: 1,
  networkBridge: null,
  isEndlessMode: () => true,
  skipStrategyReward() {
    soloAutoSkipCount += 1;
    return true;
  }
});
assert.equal(soloAutoSkipGame.tryAutoSkipWaveReward(), true);
assert.equal(soloAutoSkipCount, 1, '无尽单机应直接跳过且不应用任何奖励选项');
assert.equal(soloAutoSkipGame.tryAutoSkipWaveReward(), false, '同一奖励交互不能重复跳过');

let networkSkipRequests = 0;
let networkWaitingDisplays = 0;
const networkAutoSkipGame = Object.assign(Object.create(Game.prototype), {
  autoSkipWaveRewards: true,
  autoSkippedWaveRewardKey: null,
  strategyEvent: {
    networkInteractionId: 'reward-auto-skip-1',
    type: 'wave-reward',
    choices: [{ id: 'untouched' }]
  },
  wave: 14,
  waveIndex: 14,
  bossesDefeated: 2,
  networkClientMode: true,
  isEndlessMode: () => true,
  networkBridge: {
    shouldRouteLocalCommands: () => true,
    commandSender: {
      strategySkip() {
        networkSkipRequests += 1;
        return true;
      }
    }
  },
  showCoopRewardWaitingUi() {
    networkWaitingDisplays += 1;
  }
});
assert.equal(networkAutoSkipGame.tryAutoSkipWaveReward(), true);
assert.equal(networkSkipRequests, 1, '联机自动跳过必须发送已有的 Host 权威跳过命令');

let shopSkipRequests = 0;
let shopWaitingDisplays = 0;
const freeShopAutoSkipGame = Object.assign(Object.create(Game.prototype), {
  autoSkipWaveRewards: true,
  autoSkippedWaveRewardKey: null,
  runShopFreeReward: true,
  bossesDefeated: 2,
  activeEconomySlot: 'p2',
  localPlayerSlot: 'p2',
  networkClientMode: true,
  isEndlessMode: () => true,
  networkBridge: {
    shouldRouteLocalCommands: () => true,
    commandSender: {
      shopRewardSkip() {
        shopSkipRequests += 1;
        return true;
      }
    }
  },
  showCoopRunShopWaitingUi() {
    shopWaitingDisplays += 1;
  }
});
assert.equal(freeShopAutoSkipGame.tryAutoSkipRunShopReward(), true);
assert.equal(shopSkipRequests, 1, '无尽联机应通过免费军需铺的 Host 权威跳过命令完成 Boss 奖励');
assert.equal(shopWaitingDisplays, 1);
assert.equal(freeShopAutoSkipGame.tryAutoSkipRunShopReward(), false, '同一次免费军需铺不能重复跳过');
assert.equal(networkWaitingDisplays, 1, '联机跳过后应立即进入选择完成等待状态');

let completedNetworkSlot = null;
const hostSkipGame = Object.assign(Object.create(Game.prototype), {
  localPlayerSlot: 'p1',
  activeEconomySlot: 'p1',
  strategyEvent: null,
  players: {
    p2: {
      strategyEvent: { type: 'wave-reward', choices: [{ id: 'must-not-apply' }] }
    }
  },
  withPlayerContext(slot, action) {
    const previous = this.strategyEvent;
    this.strategyEvent = this.players[slot].strategyEvent;
    const result = action();
    this.players[slot].strategyEvent = this.strategyEvent;
    this.strategyEvent = previous;
    return result;
  },
  finishCoopStrategyReward(slot) {
    completedNetworkSlot = slot;
    this.players[slot].strategyEvent = null;
  }
});
assert.equal(hostSkipGame.applyNetworkStrategySkip('p2'), true);
assert.equal(completedNetworkSlot, 'p2', 'Host 应把跳过玩家标记为奖励选择完成');
assert.equal(hostSkipGame.players.p2.strategyEvent, null, '跳过时不应保留或应用奖励选项');

const openingAutoSkipGame = Object.assign(Object.create(Game.prototype), {
  autoSkipWaveRewards: true,
  strategyEvent: { type: 'opening-unit', choices: [{ id: 'required' }] },
  isEndlessMode: () => true
});
assert.equal(openingAutoSkipGame.tryAutoSkipWaveReward(), false, '开局单位选择不能被自动跳过');

const standardAutoSkipGame = Object.assign(Object.create(Game.prototype), {
  autoSkipWaveRewards: true,
  strategyEvent: { type: 'wave-reward', choices: [{ id: 'required' }] },
  isEndlessMode: () => false
});
assert.equal(standardAutoSkipGame.tryAutoSkipWaveReward(), false, '普通模式不启用自动跳过');

const gameSource = readFileSync(new URL('../src/systems/Game.js', import.meta.url), 'utf8');
assert.match(gameSource, /data-endless-auto-skip-wave-rewards/);
assert.match(gameSource, /<span>自动跳过奖励<\/span>/);

const playableTrainingChoice = Game.prototype.createPlayableTrainingCardChoice.call({}, {
  action: 'apply-team-upgrade',
  title: '护甲训练',
  description: '全队护甲提升。',
  upgrade: { id: 'unit-armor', kind: 'unit-generic' },
  card: { id: 'team-upgrade-unit-armor', kind: 'tactic', energyCost: 0 }
});
assert.equal(playableTrainingChoice.action, 'add-card');
assert.equal(playableTrainingChoice.card.exhaust, true);
assert.equal(playableTrainingChoice.card.target, 'none');
assert.deepEqual(playableTrainingChoice.card.effect, {
  type: 'apply-team-generic-upgrade',
  upgrade: { id: 'unit-armor', kind: 'unit-generic' }
});

const openingCard = { id: 'swordsmen', unitType: 'swordsman', kind: 'summon' };
const receivedOpeningCards = [];
const openingGame = {
  cardSystem: {
    addCardToDrawPile(card, options) {
      receivedOpeningCards.push({ card, options });
      return { added: true };
    }
  },
  heroUnitType: null,
  applyStrategyChoiceCost() {}
};
assert.equal(Game.prototype.applyStrategyChoice.call(openingGame, {
  action: 'grant-opening-unit-card',
  card: openingCard
}), true);
assert.equal(openingGame.heroUnitType, 'swordsman');
assert.equal(receivedOpeningCards.length, 1);
assert.equal(receivedOpeningCards[0].card, openingCard);
assert.match(receivedOpeningCards[0].options.prefix, /^opening-swordsmen-/);

const upgradedOpeningCards = [
  { id: 'barbarians', name: '蛮族', summary: '测试', kind: 'summon', unitType: 'raider' },
  { id: 'swordsmen', name: '剑士', summary: '测试', kind: 'summon', unitType: 'swordsman' },
  { id: 'archers', name: '弓手', summary: '测试', kind: 'summon', unitType: 'archer' }
];
const upgradedOpeningGame = {
  activeEconomySlot: 'local-player',
  localPlayerSlot: 'local-player',
  levelSession: {
    challengeMode: 'standard',
    cardLevels: { barbarians: 2, swordsmen: 5, archers: 3 }
  },
  isEndlessMode: () => false,
  openingUnitCardLevel: Game.prototype.openingUnitCardLevel,
  cardSystem: {
    applyRuntimeCardLevel(card) {
      return card;
    }
  }
};
const upgradedOpeningChoices = Game.prototype.openingUnitChoices.call(upgradedOpeningGame, {
  pool: upgradedOpeningCards,
  action: 'grant-opening-unit-card',
  actionLabel: '获得单位卡'
});
assert.deepEqual(
  Object.fromEntries(upgradedOpeningChoices.map((choice) => [choice.card.id, choice.card.level])),
  { barbarians: 2, swordsmen: 5, archers: 3 },
  '开局单位卡必须使用玩家局外升级后的实际等级'
);
assert.equal(Game.prototype.openingUnitCardLevel.call({
  activeEconomySlot: 'p2',
  localPlayerSlot: 'p1',
  levelSession: {
    players: {
      p1: { cardLevels: { swordsmen: 7 } },
      p2: { cardLevels: { swordsmen: 4 } }
    }
  },
  isEndlessMode: () => false
}, 'swordsmen'), 7, '联机开局单位卡必须使用所有参战玩家中的最高等级');
assert.equal(Game.prototype.openingUnitCardLevel.call({
  levelSession: { cardLevels: { swordsmen: 8 } },
  isEndlessMode: () => true
}, 'swordsmen'), 1, '无尽模式仍应覆盖为 Lv.1');

const guardUnit = {
  alive: true,
  team: 'player',
  isBuilding: false,
  definition: { canMove: true },
  position: new THREE.Vector3(3, 1, -4),
  moveGoal: new THREE.Vector3(1, 0, 1),
  commandMoveGoal: new THREE.Vector3(2, 0, 2),
  target: { alive: true }
};
let guardVisualEnabled = false;
const guardGame = {
  groundHeightAt: () => 0.25,
  gameGuardRadiusFor: () => 6.5,
  clearUnitRoute(unit) {
    unit.routeCleared = true;
  },
  applyUnitGuardVisualState(unit, enabled) {
    guardVisualEnabled = enabled;
  }
};
assert.equal(Game.prototype.setUnitGuardMode.call(guardGame, guardUnit), true);
assert.equal(guardUnit.controlMode, 'guard');
assert.deepEqual(guardUnit.guardPoint.toArray(), [3, 0.25, -4]);
assert.equal(guardUnit.guardRadius, 6.5);
assert.equal(guardUnit.moveGoal, null);
assert.equal(guardUnit.commandMoveGoal, null);
assert.equal(guardUnit.target, null);
assert.equal(guardUnit.routeCleared, true);
assert.equal(guardVisualEnabled, true);

const ordinaryGuardRing = createAttackRangeRing('#62d56f');
ordinaryGuardRing.traverse((child) => {
  assert.equal(child.layers.mask, 1, 'guard ring uses the normal render layer');
  if (!child.material) return;
  assert.equal(child.material.depthTest, true, 'guard ring respects normal scene depth');
  assert.equal(child.renderOrder, 0, 'guard ring does not force an overlay render order');
});

console.log('wave reward pool checks passed');
