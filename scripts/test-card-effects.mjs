import assert from 'node:assert/strict';
import { BUFF_DEFINITIONS, CARD_DEFINITIONS } from '../src/data/gameData.js';
import { CardEffectSystem } from '../src/systems/CardEffectSystem.js';
import { AttributeSet } from '../src/systems/AttributeSet.js';
import { BuffSystem } from '../src/systems/BuffSystem.js';
import { CombatSystem } from '../src/systems/CombatSystem.js';
import {
  CardSystem,
  cardMaxUses,
  isCardDiscardDragIntent
} from '../src/systems/CardSystem.js';
import { UnitEntity } from '../src/entities/UnitEntity.js';

assert(CARD_DEFINITIONS.filter((card) => card.kind === 'summon').every((card) => cardMaxUses(card) === 1));
assert.equal(CARD_DEFINITIONS.find((card) => card.id === 'field-upgrade')?.energyCost, 3);
assert.equal(cardMaxUses({ kind: 'summon', uses: 9 }), 1);
assert.equal(CARD_DEFINITIONS.find((card) => card.id === 'rebirth-totem-enchant')?.retired, true);
assert.equal(CARD_DEFINITIONS.find((card) => card.id === 'self-destruct-enchant')?.enchantmentId, 'selfDestruct');
assert.equal(BUFF_DEFINITIONS.rebirthTotem.retired, true);
assert.match(CARD_DEFINITIONS.find((card) => card.id === 'self-destruct-enchant')?.summary ?? '', /等级 ×4/);
assert.equal(CARD_DEFINITIONS.find((card) => card.id === 'high-explosive-ability')?.effect?.abilityId, 'highExplosive');
const silverGambleCard = CARD_DEFINITIONS.find((card) => card.id === 'silver-gamble');
assert.equal(silverGambleCard?.energyCost, 0);
assert.match(silverGambleCard?.summary ?? '', /银币清空/);

const silverMessages = [];
const silverGame = {
  activeEconomySlot: 'p2',
  localPlayerSlot: 'p1',
  silverByPlayer: { p2: 80 },
  getSilver(playerId) {
    return this.silverByPlayer[playerId];
  },
  setSilver(value, playerId) {
    this.silverByPlayer[playerId] = value;
  },
  playerBase: { position: { x: 0, y: 0, z: 0 } },
  effects: {
    spawnDamageNumber(position, amount, options) {
      silverMessages.push(options.text);
    },
    spawnRing() {}
  },
  updateHud() {}
};
const silverEffects = new CardEffectSystem(silverGame);
const silverRandom = Math.random;
Math.random = () => 0.49;
try {
  assert.equal(silverEffects.gambleSilver({ card: silverGambleCard }), true);
} finally {
  Math.random = silverRandom;
}
assert.equal(silverGame.silverByPlayer.p2, 160);
assert.equal(silverMessages.at(-1), '银币翻倍');
silverGame.silverByPlayer.p2 = 80;
Math.random = () => 0.5;
try {
  assert.equal(silverEffects.gambleSilver({ card: silverGambleCard }), true);
} finally {
  Math.random = silverRandom;
}
assert.equal(silverGame.silverByPlayer.p2, 0);
assert.equal(silverMessages.at(-1), '银币清空');

const highExplosiveCombat = new CombatSystem({
  getAbilityStacks: (abilityId) => abilityId === 'highExplosive' ? 1 : 0
});
const highExplosiveContext = {
  source: { alive: false, team: 'player' },
  damage: 4,
  isExplosionDamage: true
};
highExplosiveCombat.applyAbilityOffense(highExplosiveContext);
assert.equal(highExplosiveContext.damage, 6);

const applied = [];
const targetUnit = {
  position: { x: 0, y: 0, z: 0 },
  projectileHitHeight: 1.5,
  enchantments: new Map(),
  maxEnchantmentSlots: 12
};
const game = {
  buffs: {
    applyBuff(target, buffId, source, overrides = {}) {
      applied.push({ buffId, level: overrides.level });
      target.enchantments.set(`${buffId}:${applied.length}`, {
        id: buffId,
        level: overrides.level
      });
      return { id: buffId, color: '#b68cff' };
    }
  },
  effects: {
    spawnRing() {},
    spawnDamageNumber() {}
  },
  selectUnit() {}
};
const effects = new CardEffectSystem(game);
const previousRandom = Math.random;
Math.random = () => 0;
try {
  const result = effects.applyRandomEnchantments({
    card: {
      id: 'temporary-mana-surge-enchant',
      level: 8,
      color: '#b68cff'
    },
    effect: {
      type: 'apply-random-enchantments',
      count: 5,
      level: 1
    },
    targetUnit
  });
  assert.equal(result, true);
  assert.equal(applied.length, 5);
  assert.ok(applied.every((entry) => entry.level === 1));
} finally {
  Math.random = previousRandom;
}

const tacticalRewardPool = [
  { id: 'once-only-ability', kind: 'ability' },
  { id: 'once-only-summon', kind: 'summon' }
];
const consumedWaveRewardCards = [];
const tacticalFallback = new CardEffectSystem({
  cardSystem: {
    drawTemporaryCards(count, options) {
      assert.equal(count, 2);
      assert.equal(options.preferHandSlots, true);
      return 0;
    },
    addTemporaryCardsFromPool(pool, count, options) {
      assert.equal(count, 2);
      assert.equal(options.preferHandSlots, true);
      assert.deepEqual(
        pool.map((entry) => entry.id),
        ['once-only-ability', 'once-only-summon']
      );
      const createdDefinitions = pool.slice(0, count);
      createdDefinitions.forEach((definition) => {
        options.onCardCreated(definition, { ...definition });
      });
      return createdDefinitions.length;
    }
  },
  waveRewardCardPool: () => tacticalRewardPool,
  consumeWaveRewardCard(card) {
    const index = tacticalRewardPool.findIndex((entry) => entry.id === card.id);
    if (index < 0) return false;
    tacticalRewardPool.splice(index, 1);
    consumedWaveRewardCards.push(card.id);
    return true;
  }
});
assert.equal(tacticalFallback.drawTemporaryCards({
  card: { id: 'field-upgrade' },
  effect: { amount: 2, fallbackPool: 'wave-reward-pool' }
}), true);
assert.deepEqual(consumedWaveRewardCards, ['once-only-ability', 'once-only-summon']);
assert.deepEqual(tacticalRewardPool, []);

const dispatchedDrawCards = [
  { id: 'drawn-unit-a', kind: 'summon' },
  { id: 'drawn-unit-b', kind: 'summon' },
  { id: 'still-in-draw-pile', kind: 'spell' }
];
const [firstDispatchedCard, secondDispatchedCard, remainingDrawCard] = dispatchedDrawCards;
const dispatchDrawSystem = {
  temporaryCards: [],
  drawPile: dispatchedDrawCards,
  drawCard() {
    return this.drawPile.shift() ?? null;
  },
  pendingDrawAnimations: new Set(),
  renderTemporaryCards() {},
  updatePileUi() {}
};
assert.equal(CardSystem.prototype.drawTemporaryCards.call(dispatchDrawSystem, 2), 2);
assert.deepEqual(dispatchDrawSystem.temporaryCards, [firstDispatchedCard, secondDispatchedCard]);
assert.deepEqual(dispatchDrawSystem.drawPile, [remainingDrawCard]);

const occupiedHandCards = [
  { id: 'occupied-left' },
  null,
  { id: 'occupied-middle' },
  { id: 'occupied-right' },
  { id: 'occupied-far-right' }
];
const handFirstDrawCards = [
  { id: 'hand-first-card', kind: 'summon' },
  { id: 'temporary-second-card', kind: 'spell' }
];
let handFirstRenderCount = 0;
let handFirstTemporaryRenderCount = 0;
const handFirstDispatchSystem = {
  handCards: [...occupiedHandCards],
  temporaryCards: [],
  drawPile: [...handFirstDrawCards],
  pendingDrawAnimations: new Set(),
  findEmptyHandSlotIndex: CardSystem.prototype.findEmptyHandSlotIndex,
  drawCard() {
    return this.drawPile.shift() ?? null;
  },
  renderHand() {
    handFirstRenderCount += 1;
    this.pendingDrawAnimations.clear();
  },
  renderTemporaryCards() {
    handFirstTemporaryRenderCount += 1;
  },
  updatePileUi() {}
};
assert.equal(
  CardSystem.prototype.drawTemporaryCards.call(handFirstDispatchSystem, 2, {
    preferHandSlots: true
  }),
  2
);
assert.equal(handFirstDispatchSystem.handCards[1], handFirstDrawCards[0]);
assert.deepEqual(handFirstDispatchSystem.temporaryCards, [handFirstDrawCards[1]]);
assert.equal(handFirstRenderCount, 1);
assert.equal(handFirstTemporaryRenderCount, 1);

const poolHandFirstSystem = {
  handCards: [...occupiedHandCards],
  temporaryCards: [],
  drawPile: [],
  pendingDrawAnimations: new Set(),
  playerSlot: 'p1',
  game: { recordAcquiredUnitCard() {} },
  findEmptyHandSlotIndex: CardSystem.prototype.findEmptyHandSlotIndex,
  applyRuntimeCardLevel: (definition) => definition,
  renderHand() {
    this.pendingDrawAnimations.clear();
  },
  renderTemporaryCards() {},
  updatePileUi() {}
};
assert.equal(
  CardSystem.prototype.addTemporaryCardsFromPool.call(
    poolHandFirstSystem,
    [
      { id: 'pool-card-a', kind: 'summon' },
      { id: 'pool-card-b', kind: 'ability' }
    ],
    2,
    { preferHandSlots: true }
  ),
  2
);
assert.ok(poolHandFirstSystem.handCards[1]);
assert.equal(poolHandFirstSystem.temporaryCards.length, 1);
assert.notEqual(poolHandFirstSystem.handCards[1], poolHandFirstSystem.temporaryCards[0]);

const discardDrag = {
  startY: 100,
  discardThreshold: 50,
  sourceLeft: 200,
  sourceRight: 300
};
assert.equal(isCardDiscardDragIntent(discardDrag, { clientX: 250, clientY: 150 }), true);
assert.equal(isCardDiscardDragIntent(discardDrag, { clientX: 199, clientY: 190 }), false);
assert.equal(isCardDiscardDragIntent(discardDrag, { clientX: 301, clientY: 190 }), false);
assert.equal(isCardDiscardDragIntent(discardDrag, { clientX: 250, clientY: 149 }), false);
const lateralDragModeSystem = {
  drag: {
    ...discardDrag,
    startX: 250,
    sourceHeight: 200,
    playThreshold: 100,
    card: { target: 'ground' }
  },
  isPointerBlockedByCardUi: () => true
};
assert.equal(
  CardSystem.prototype.resolveDragMode.call(lateralDragModeSystem, {
    clientX: 199,
    clientY: 190
  }),
  'play'
);
assert.equal(
  CardSystem.prototype.resolveDragMode.call(lateralDragModeSystem, {
    clientX: 301,
    clientY: 190
  }),
  'play'
);
assert.equal(
  CardSystem.prototype.resolveDragMode.call(lateralDragModeSystem, {
    clientX: 250,
    clientY: 190
  }),
  'discard'
);

const dispatchedUnitCard = {
  id: 'dispatched-unit',
  kind: 'summon',
  maxUses: 1,
  remainingUses: 1
};
let dispatchedUnitExhausted = 0;
const dispatchedCardSystem = {
  temporaryCards: [dispatchedUnitCard],
  discardPile: [],
  handCards: [],
  game: { abilitiesFor: () => ({ onCardExhausted: () => { dispatchedUnitExhausted += 1; } }) },
  consumeCardUse: CardSystem.prototype.consumeCardUse,
  isCardSpent: CardSystem.prototype.isCardSpent,
  moveTemporaryCardToDiscard: CardSystem.prototype.moveTemporaryCardToDiscard,
  refillDrawPileFromDiscardIfNeeded: () => false,
  renderTemporaryCards() {},
  updatePileUi() {}
};
assert.equal(CardSystem.prototype.moveCardToDiscard.call(dispatchedCardSystem, dispatchedUnitCard), true);
assert.deepEqual(dispatchedCardSystem.temporaryCards, []);
assert.deepEqual(dispatchedCardSystem.discardPile, []);
assert.equal(dispatchedUnitCard.remainingUses, 0);
assert.equal(dispatchedUnitExhausted, 1);

const leftHandCard = { id: 'left-card', kind: 'spell' };
const middleHandCard = {
  id: 'middle-card',
  kind: 'summon',
  maxUses: 1,
  remainingUses: 1
};
const rightHandCard = { id: 'right-card', kind: 'spell' };
let middleHandCardExhausted = 0;
const emptyDeckHandSystem = {
  temporaryCards: [],
  handCards: [leftHandCard, middleHandCard, rightHandCard],
  drawPile: [],
  discardPile: [],
  pendingDrawAnimations: new Set(),
  game: { abilitiesFor: () => ({ onCardExhausted: () => { middleHandCardExhausted += 1; } }) },
  consumeCardUse: CardSystem.prototype.consumeCardUse,
  isCardSpent: CardSystem.prototype.isCardSpent,
  findHandCardIndex: CardSystem.prototype.findHandCardIndex,
  refillDrawPileFromDiscardIfNeeded: CardSystem.prototype.refillDrawPileFromDiscardIfNeeded,
  drawCard: CardSystem.prototype.drawCard,
  refillHandSlot: CardSystem.prototype.refillHandSlot,
  renderHand() {},
  updatePileUi() {}
};
assert.equal(CardSystem.prototype.moveCardToDiscard.call(emptyDeckHandSystem, middleHandCard), true);
assert.deepEqual(emptyDeckHandSystem.handCards, [leftHandCard, null, rightHandCard]);
assert.deepEqual(emptyDeckHandSystem.discardPile, []);
assert.equal(middleHandCardExhausted, 1);

const recyclableHandCard = { id: 'recyclable-card', kind: 'tactic' };
const recyclableHandSystem = {
  temporaryCards: [],
  handCards: [leftHandCard, recyclableHandCard, rightHandCard],
  drawPile: [],
  discardPile: [],
  pendingDrawAnimations: new Set(),
  game: { abilitiesFor: () => ({ onCardExhausted: () => assert.fail('recyclable card must not exhaust') }) },
  consumeCardUse: CardSystem.prototype.consumeCardUse,
  isCardSpent: CardSystem.prototype.isCardSpent,
  findHandCardIndex: CardSystem.prototype.findHandCardIndex,
  refillDrawPileFromDiscardIfNeeded: CardSystem.prototype.refillDrawPileFromDiscardIfNeeded,
  drawCard: CardSystem.prototype.drawCard,
  refillHandSlot: CardSystem.prototype.refillHandSlot,
  renderHand() {},
  updatePileUi() {}
};
assert.equal(CardSystem.prototype.moveCardToDiscard.call(recyclableHandSystem, recyclableHandCard), true);
assert.deepEqual(recyclableHandSystem.handCards, [leftHandCard, recyclableHandCard, rightHandCard]);
assert.deepEqual(recyclableHandSystem.drawPile, []);
assert.deepEqual(recyclableHandSystem.discardPile, []);

const manuallyDiscardedTemporaryCard = { id: 'temporary-enchant', kind: 'enchant' };
const temporaryDiscardSystem = {
  temporaryCards: [manuallyDiscardedTemporaryCard],
  discardPile: [],
  refillDrawPileFromDiscardIfNeeded: () => false
};
assert.equal(
  CardSystem.prototype.moveTemporaryCardToDiscard.call(temporaryDiscardSystem, manuallyDiscardedTemporaryCard),
  true
);
assert.deepEqual(temporaryDiscardSystem.discardPile, [manuallyDiscardedTemporaryCard]);

const buffGame = {
  friendlyUnits: [],
  enemyUnits: [],
  effects: {
    spawnRing() {},
    spawnDamageNumber() {},
    spawnPoisonParticles() {}
  }
};
buffGame.buffs = new BuffSystem(buffGame);

const supportTarget = createBuffUnit({
  armor: 3,
  magicResistance: 2,
  maxHealth: 40,
  maxShield: 0
});
buffGame.buffs.applyBuff(supportTarget, 'overhealShield', null, { level: 2 });
assert.equal(supportTarget.maxShield, 4);
buffGame.buffs.onOverheal(supportTarget, 6);
assert.equal(supportTarget.shield, 4);

buffGame.buffs.applyBuff(supportTarget, 'shieldWard', null, { level: 3 });
supportTarget.shield = 10;
const shieldDamageContext = {
  target: supportTarget,
  damage: 5,
  bypassShield: false,
  damageTypes: new Set()
};
buffGame.buffs.beforeShieldDamage(shieldDamageContext);
assert.equal(shieldDamageContext.damage, 2.75);

const plagueTarget = createBuffUnit({
  armor: 5,
  magicResistance: 4,
  maxHealth: 50,
  maxShield: 0
});
buffGame.buffs.applyBuff(plagueTarget, 'plague', null, { level: 3, duration: 3 });
assert.equal(plagueTarget.armor, 3);
assert.equal(plagueTarget.magicResistance, 2);

const upgradeTarget = createEnchantmentUpgradeUnit();
const initialSoulEater = upgradeTarget.addBuff('soulEater');
initialSoulEater.soulBonus = 7;
initialSoulEater['deathCooldown:soulEater'] = 12;
upgradeTarget.attributes.addModifier({ stat: 'maxHealth', type: 'add', amount: 7 }, 'buff:soulEater:soul-bonus');
upgradeTarget.health = 47;
const upgradedSoulEater = upgradeTarget.addBuff('soulEater');
assert.equal(upgradedSoulEater.level, 2);
assert.equal(upgradedSoulEater.soulBonus, 7);
assert.equal(upgradedSoulEater['deathCooldown:soulEater'], 12);
assert.equal(upgradeTarget.maxHealth, 47);
assert.equal(upgradeTarget.health, 47);

const initialFocus = upgradeTarget.addBuff('focus');
initialFocus.focusRangeBonus = 1.2;
upgradeTarget.attributes.addModifier({ stat: 'attackRange', type: 'add', amount: 1.2 }, 'buff:focus:focus-range');
const upgradedFocus = upgradeTarget.addBuff('focus');
assert.equal(upgradedFocus.level, 2);
assert.equal(upgradedFocus.focusRangeBonus, 1.2);
assert.equal(upgradeTarget.attributes.get('attackRange'), 5.2);

const spiritWeapon = upgradeTarget.addBuff('spiritWeapon');
assert.equal(spiritWeapon.level, 1);
assert.equal(upgradeTarget.weapon.maxDurability, 3);
assert.equal(upgradeTarget.weapon.durability, 3);
const upgradedSpiritWeapon = upgradeTarget.addBuff('spiritWeapon');
assert.equal(upgradedSpiritWeapon.level, 2);
assert.equal(upgradeTarget.weapon.maxDurability, 5);
assert.equal(upgradeTarget.weapon.durability, 5);

const swordSaintSource = createEnchantmentUpgradeUnit({ maxDurability: 40 });
const swordSaint = swordSaintSource.addBuff('swordSaint');
const swordSaintEffects = new BuffSystem({
  effects: {
    spawnRing() {},
    spawnDamageNumber() {}
  }
});
const swordSaintContext = {
  isAttack: true,
  source: swordSaintSource,
  target: { alive: true },
  damage: 6,
  damageTypes: new Set()
};
swordSaintEffects.modifyAttack(swordSaintContext);
assert.equal(swordSaintContext.swordSaintBuffId, swordSaint.id);
assert.equal(swordSaintContext.damage, 34);
assert.equal(swordSaintSource.weapon.durability, 12);
swordSaintEffects.afterAttack(swordSaintContext);
assert.equal(swordSaintSource.weapon.durability, 12.8);

console.log('card effect tests passed');

function createEnchantmentUpgradeUnit({ maxDurability = 1 } = {}) {
  const attributes = new AttributeSet({
    maxHealth: 40,
    maxShield: 0,
    attackRange: 4,
    physicalAttack: 0,
    magicAttack: 0,
    maxDurability,
    durabilityCost: 0
  });
  const unit = {
    attributes,
    buffs: new Map(),
    enchantments: new Map(),
    enchantHalo: { children: [] },
    maxEnchantmentSlots: 5,
    alive: true,
    health: 40,
    shield: 0,
    weapon: { durability: maxDurability },
    statusUiDirty: false,
    get maxHealth() {
      return this.attributes.get('maxHealth');
    },
    get maxShield() {
      return this.attributes.get('maxShield');
    },
    addBuff: UnitEntity.prototype.addBuff,
    clampToAttributeCaps: UnitEntity.prototype.clampToAttributeCaps,
    restoreDurability: UnitEntity.prototype.restoreDurability,
    spendDurability: UnitEntity.prototype.spendDurability
  };
  Object.defineProperty(unit.weapon, 'maxDurability', {
    get() {
      return attributes.get('maxDurability');
    }
  });
  return unit;
}

function createBuffUnit({
  armor,
  magicResistance,
  maxHealth,
  maxShield
}) {
  const attributes = new AttributeSet({
    maxHealth,
    maxShield,
    physicalAttack: 0,
    magicAttack: 0,
    knockback: 0,
    maxDurability: 1,
    durabilityCost: 0
  });
  attributes.setBase('armor', armor, { min: -99 });
  attributes.setBase('magicResistance', magicResistance, { min: -99 });
  const unit = {
    alive: true,
    canReceiveBuffs: true,
    immuneToStatusEffects: false,
    position: { x: 0, y: 0, z: 0 },
    projectileHitHeight: 1.45,
    definition: { traits: [] },
    attributes,
    buffs: new Map(),
    enchantments: new Map(),
    shield: 0,
    game: buffGame,
    get maxHealth() {
      return this.attributes.get('maxHealth');
    },
    get maxShield() {
      return this.attributes.get('maxShield');
    },
    get armor() {
      return this.attributes.get('armor');
    },
    get magicResistance() {
      return this.attributes.get('magicResistance');
    },
    addBuff(buffId, definition = BUFF_DEFINITIONS[buffId], overrides = {}) {
      if (!definition) return null;
      const source = `buff:${buffId}`;
      const instance = {
        ...definition,
        ...overrides,
        id: buffId,
        level: Math.max(1, Math.floor(overrides.level ?? definition.level ?? 1)),
        remaining: overrides.duration ?? definition.duration ?? 0
      };
      this.attributes.removeModifiersBySource(source);
      this.buffs.set(buffId, instance);
      this.attributes.addModifiers(instance.modifiers, source, {
        level: instance.level,
        buff: instance,
        owner: this
      });
      if (definition.category === 'enchantment') {
        this.enchantments.set(buffId, instance);
      }
      return instance;
    },
    restoreShield(amount) {
      const previousShield = this.shield;
      this.shield = Math.min(this.maxShield, Math.max(0, this.shield + amount));
      return this.shield - previousShield;
    }
  };
  return unit;
}
