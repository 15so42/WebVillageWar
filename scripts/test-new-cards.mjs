import assert from 'node:assert/strict';
import { BUFF_DEFINITIONS, CARD_DEFINITIONS } from '../src/data/gameData.js';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';
import { BuffSystem } from '../src/systems/BuffSystem.js';
import { CardSystem } from '../src/systems/CardSystem.js';
import { rollOverflowChance } from '../src/utils/chance.js';

const inspirationCard = CARD_DEFINITIONS.find((card) => card.id === 'inspiration');
const judgmentCard = CARD_DEFINITIONS.find((card) => card.id === 'judgment-enchant');
const bodyForgingCard = CARD_DEFINITIONS.find((card) => card.id === 'body-forging-enchant');
const enchantResonanceCard = CARD_DEFINITIONS.find((card) => card.id === 'enchant-echo-ability');

assert.equal(inspirationCard?.effect?.abilityId, 'inspiration');
assert.equal(inspirationCard?.effect?.stacksBase, 1);
assert.equal(inspirationCard?.effect?.stacksPerLevel, 1);
assert.equal(judgmentCard?.enchantmentId, 'judgment');
assert.equal(bodyForgingCard?.enchantmentId, 'bodyForging');
assert.equal(BUFF_DEFINITIONS.judgment.effects[0].cooldown, 5);
assert.equal(BUFF_DEFINITIONS.judgment.effects[0].damagePerLevel, 2);
assert.equal(BUFF_DEFINITIONS.bodyForging.tickInterval, 5);
assert.match(enchantResonanceCard?.summary ?? '', /超过 100%/);

assert.equal(rollOverflowChance(0, () => 0), 0);
assert.equal(rollOverflowChance(0.3, () => 0.29), 1);
assert.equal(rollOverflowChance(0.3, () => 0.31), 0);
assert.equal(rollOverflowChance(1.3, () => 0.29), 2);
assert.equal(rollOverflowChance(1.3, () => 0.31), 1);
assert.equal(rollOverflowChance(2, () => { throw new Error('整数概率不应再随机判定'); }), 2);

const resonanceCalls = [];
const resonanceVisuals = [];
const resonanceGame = createAbilityGame();
resonanceGame.cardEffects = {
  resolve(drag) {
    resonanceCalls.push(drag);
    return true;
  }
};
resonanceGame.effects.spawnDamageNumber = (position, amount, options) => {
  resonanceVisuals.push({ position, amount, options });
};
const resonanceAbilities = new AbilitySystem(resonanceGame, { mountUi: false, playerSlot: 'p1' });
resonanceAbilities.acquire('enchantResonance', 30, { silent: true });
const resonanceRandom = Math.random;
Math.random = () => 0.59;
try {
  resonanceAbilities.onCardPlayed(
    { id: 'fire-enchant', kind: 'enchant', level: 1 },
    { targetUnit: { id: 7 } }
  );
} finally {
  Math.random = resonanceRandom;
}
assert.equal(resonanceCalls.length, 4, '30 层附魔共鸣应保证 3 次，并以 60% 概率追加第 4 次');
assert.ok(resonanceCalls.every((drag) => drag.skipAbilityTriggers === true));
assert.equal(resonanceVisuals.at(-1)?.options?.text, '附魔共鸣x4');

const holdResolveCalls = [];
const holdVisuals = [];
const holdGame = createAbilityGame();
holdGame.cardEffects = {
  resolve(drag) {
    holdResolveCalls.push(drag);
    return true;
  }
};
holdGame.effects.spawnDamageNumber = (position, amount, options) => {
  holdVisuals.push({ position, amount, options });
};
const holdAbilities = new AbilitySystem(holdGame, { mountUi: false, playerSlot: 'p1' });
holdGame.abilitiesFor = () => holdAbilities;
holdAbilities.acquire('enchantResonance', 30, { silent: true });
const holdCard = {
  id: 'fire-enchant',
  kind: 'enchant',
  target: 'friendly-unit',
  level: 1,
  energyCost: 0,
  maxUses: 3,
  remainingUses: 3
};
const holdTarget = { id: 9 };
const holdDrag = {
  card: holdCard,
  targetUnit: holdTarget,
  mode: 'play',
  valid: true
};
const holdCardSystem = {
  game: holdGame,
  playerSlot: 'p1',
  drag: holdDrag,
  enchantHold: {
    drag: holdDrag,
    target: holdTarget,
    cost: 0,
    remainingUses: 3,
    tickCount: 0
  },
  isCardOnCooldown: () => false,
  canSpend: () => true,
  resolveCard(drag) {
    return this.game.cardEffects.resolve(drag);
  },
  spendEnergy() {},
  consumeCardUse(card) {
    card.remainingUses = Math.max(0, card.remainingUses - 1);
    return 1;
  },
  renderHand() {},
  updateCardAffordability() {},
  updateEnchantHoldUi() {},
  stopEnchantHold() {
    throw new Error('有效的长按附魔不应提前停止');
  },
  setHint() {},
  playDraggedCard: CardSystem.prototype.playDraggedCard
};
const holdRandom = Math.random;
Math.random = () => 0.61;
try {
  CardSystem.prototype.tickEnchantHold.call(holdCardSystem);
} finally {
  Math.random = holdRandom;
}
assert.equal(holdResolveCalls.length, 4, '长按每跳应结算原附魔，并触发 30 层共鸣的 3 次保证追加');
assert.equal(holdCard.remainingUses, 2);
assert.equal(holdCardSystem.enchantHold.remainingUses, 2);
assert.equal(holdCardSystem.enchantHold.tickCount, 1);
assert.equal(holdVisuals.at(-1)?.options?.text, '附魔共鸣x3');

const abilityGame = createAbilityGame();
const abilities = new AbilitySystem(abilityGame, { mountUi: false, playerSlot: 'p1' });
abilityGame.abilitiesFor = () => abilities;
abilities.acquire('inspiration', 3, { silent: true });

const baseCard = { id: 'swordsmen', kind: 'summon', level: 2, energyCost: 3 };
const preparedCard = abilities.prepareCardForPlay(baseCard);
assert.notEqual(preparedCard, baseCard);
assert.equal(preparedCard.level, 3);
assert.equal(baseCard.level, 2);
assert.equal(abilities.consumePreparedCardPlay(baseCard, preparedCard), true);
assert.equal(abilities.getStacks('inspiration'), 2);

const inspirationPrepared = abilities.prepareCardForPlay(inspirationCard);
assert.equal(inspirationPrepared, inspirationCard, '灵感自身不能消耗或享受灵感临时升级');
assert.equal(abilities.getStacks('inspiration'), 2);

const cardPlayGame = {
  runCardsPlayedCount: 0,
  abilitiesFor: () => abilities
};
const cardSystem = {
  game: cardPlayGame,
  playerSlot: 'p1',
  isCardOnCooldown: () => false,
  canSpend: () => true,
  resolveCard(drag) {
    this.resolvedCard = drag.card;
    return true;
  },
  spendEnergy(cost) {
    this.spentEnergy = cost;
  },
  moveCardToDiscard(card) {
    this.discardedCard = card;
  }
};
assert.equal(CardSystem.prototype.playDraggedCard.call(cardSystem, { card: baseCard }), true);
assert.equal(cardSystem.resolvedCard.level, 3);
assert.equal(cardSystem.spentEnergy, 3);
assert.equal(cardSystem.discardedCard, baseCard);
assert.equal(abilities.getStacks('inspiration'), 1);

cardSystem.resolveCard = () => false;
assert.equal(CardSystem.prototype.playDraggedCard.call(cardSystem, { card: baseCard }), false);
assert.equal(abilities.getStacks('inspiration'), 1, '结算失败不应消耗灵感');

const bodySources = new Map();
const bodyUnit = {
  alive: true,
  health: 8,
  position: { x: 0, y: 0, z: 0 },
  projectileHitHeight: 1.5,
  attributes: {
    removeModifiersBySource(source) {
      bodySources.delete(source);
    },
    addModifier(modifier, source) {
      bodySources.set(source, modifier);
    }
  },
  get maxHealth() {
    return 10 + [...bodySources.values()].reduce((sum, modifier) => sum + (modifier.amount ?? 0), 0);
  },
  clampToAttributeCaps() {
    this.health = Math.min(this.health, this.maxHealth);
  }
};
const bodyGame = createBuffGame();
const bodyBuffs = new BuffSystem(bodyGame);
const bodyBuff = { id: 'bodyForging', level: 11 };
const originalRandom = Math.random;
Math.random = () => 0.29;
try {
  bodyBuffs.applyEffect(BUFF_DEFINITIONS.bodyForging.effects[0], {
    target: bodyUnit,
    buff: bodyBuff
  });
} finally {
  Math.random = originalRandom;
}
assert.equal(bodyBuff.bodyForgingBonus, 2, '130% 概率应成功一次并以 30% 再判定一次');
assert.equal(bodyUnit.maxHealth, 12);
assert.equal(bodyUnit.health, 10);

const judgmentCalls = [];
const judgmentGame = createBuffGame();
judgmentGame.elapsedTime = 0;
judgmentGame.effects.spawnJudgmentSword = (position, radius, onImpact) => {
  judgmentCalls.push({ position, radius });
  onImpact();
};
judgmentGame.combat = {
  applyAttack(source, target, override) {
    judgmentCalls.push({ source, target, override });
    return true;
  }
};
const judgmentBuffs = new BuffSystem(judgmentGame);
const defender = { id: 1, alive: true, team: 'player', position: { x: 0, y: 0, z: 0 } };
const secondDefender = { id: 3, alive: true, team: 'player', position: { x: -1, y: 0, z: 0 } };
const attacker = { id: 2, alive: true, team: 'enemy', position: { x: 2, y: 0, z: 0 } };
const judgmentBuff = { id: 'judgment', level: 3 };
const secondJudgmentBuff = { id: 'judgment', level: 2 };
const attackContext = {
  source: attacker,
  target: defender,
  buff: judgmentBuff,
  isAttack: true,
  damageTypes: new Set()
};
judgmentBuffs.applyEffect(BUFF_DEFINITIONS.judgment.effects[0], attackContext);
assert.equal(judgmentCalls.length, 2);
assert.equal(judgmentCalls[1].source, defender);
assert.equal(judgmentCalls[1].target, attacker);
assert.equal(judgmentCalls[1].override.damage, 6);
assert.equal(judgmentCalls[1].override.attackDamageType, 'magic');
assert.equal(judgmentCalls[1].override.damageTypes.has('judgment'), true);

judgmentBuffs.applyEffect(BUFF_DEFINITIONS.judgment.effects[0], {
  ...attackContext,
  target: secondDefender,
  buff: secondJudgmentBuff
});
assert.equal(judgmentCalls.length, 4, '不同审判持有者应各自拥有独立的5秒冷却');
assert.equal(judgmentCalls[3].source, secondDefender);
assert.equal(judgmentCalls[3].override.damage, 4);

judgmentGame.elapsedTime = 4.99;
judgmentBuffs.applyEffect(BUFF_DEFINITIONS.judgment.effects[0], attackContext);
assert.equal(judgmentCalls.length, 4, '同一持有者的5秒冷却内不能再次触发');
judgmentGame.elapsedTime = 5;
judgmentBuffs.applyEffect(BUFF_DEFINITIONS.judgment.effects[0], attackContext);
assert.equal(judgmentCalls.length, 6, '同一持有者在5秒时应重新就绪');

judgmentGame.elapsedTime = 10;
judgmentBuffs.applyEffect(BUFF_DEFINITIONS.judgment.effects[0], {
  ...attackContext,
  damageTypes: new Set(['judgment'])
});
assert.equal(judgmentCalls.length, 6, '审判伤害不能触发另一轮审判');

console.log('new card effect tests passed');

function createAbilityGame() {
  return {
    localPlayerSlot: 'p1',
    elapsedTime: 0,
    friendlyUnits: [],
    playerBase: { position: { x: 0, y: 0, z: 0 } },
    effects: {
      spawnDamageNumber() {}
    },
    networkBridge: {
      markPrivateStateDirty() {}
    }
  };
}

function createBuffGame() {
  return {
    elapsedTime: 0,
    effects: {
      spawnRing() {},
      spawnDamageNumber() {},
      spawnJudgmentSword() {}
    }
  };
}
