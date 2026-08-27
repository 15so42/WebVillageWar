import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createAttackRangeRing } from '../src/art/lowpoly.js';
import { UNIT_SPECIAL_UPGRADES } from '../src/data/cardUpgrades.js';
import { shouldConsumeWaveRewardCard } from '../src/systems/waveRewardPool.js';

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

const unitRewardCard = { id: 'lightning-mages', kind: 'summon', unitType: 'lightningMage' };
const regularRewardCard = { id: 'fire-enchant', kind: 'enchant' };
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
    type: 'boss-reward',
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
