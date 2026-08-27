import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CardEffectSystem } from '../src/systems/CardEffectSystem.js';
import { CardSystem } from '../src/systems/CardSystem.js';
import { ClientMirror } from '../src/network/client/ClientMirror.js';
import { SnapshotBuilder } from '../src/network/host/SnapshotBuilder.js';
import { UnitLogicSystem } from '../src/systems/UnitLogicSystem.js';
import {
  FREE_ENCHANTMENT_HINT_INTERVAL_SECONDS,
  FREE_ENCHANTMENT_INTERVAL_SECONDS,
  FREE_ENCHANTMENT_MAX_CHARGES,
  advanceFreeEnchantmentState,
  consumeFreeEnchantmentCharge
} from '../src/systems/freeEnchantmentCharges.js';

assert.equal(FREE_ENCHANTMENT_INTERVAL_SECONDS, 60);
assert.equal(FREE_ENCHANTMENT_MAX_CHARGES, 4);
assert.equal(FREE_ENCHANTMENT_HINT_INTERVAL_SECONDS, 5);

let timedState = advanceFreeEnchantmentState(0, 0, 59.9);
assert.equal(timedState.charges, 0);
assert.equal(timedState.progress, 59.9);

timedState = advanceFreeEnchantmentState(timedState.charges, timedState.progress, 0.1);
assert.equal(timedState.charges, 1);
assert.equal(timedState.progress, 0);
assert.equal(timedState.gained, 1);

timedState = advanceFreeEnchantmentState(timedState.charges, timedState.progress, 180);
assert.equal(timedState.charges, 4);
assert.equal(timedState.progress, 0);
assert.equal(timedState.gained, 3);

timedState = advanceFreeEnchantmentState(timedState.charges, 50, 60);
assert.deepEqual(timedState, { charges: 4, progress: 0, gained: 0 });

const chargedUnit = { freeEnchantmentCharges: 4, statusUiDirty: false };
assert.equal(consumeFreeEnchantmentCharge({ kind: 'enchant' }, chargedUnit), true);
assert.equal(chargedUnit.freeEnchantmentCharges, 3);
assert.equal(chargedUnit.statusUiDirty, true);

const levelThreeCard = {
  id: 'free-enchantment-level-three-test',
  instanceId: 'free-enchantment-level-three-test-instance',
  kind: 'enchant',
  target: 'friendly-unit',
  energyCost: 2,
  level: 3,
  enchantmentId: 'selfDestruct',
  effect: { type: 'apply-buff', buffId: 'selfDestruct' }
};

function createPlayHarness({ charges, energy }) {
  const appliedLevels = [];
  const abilityPlays = [];
  const targetUnit = {
    alive: true,
    canReceiveBuffs: true,
    freeEnchantmentCharges: charges,
    statusUiDirty: false,
    enchantments: new Map(),
    maxEnchantmentSlots: 5,
    position: { x: 0, y: 0, z: 0 }
  };
  const game = {
    runCardsPlayedCount: 0,
    networkBridge: { shouldRouteLocalCommands: () => false },
    buffs: {
      applyBuff(target, buffId, source, options) {
        appliedLevels.push(options.level);
        return { id: buffId, color: '#a970ff' };
      }
    },
    effects: { spawnRing() {} },
    selectUnit() {},
    abilitiesFor() {
      return {
        prepareCardForPlay: (card) => card,
        consumePreparedCardPlay() {},
        onCardPlayed(card, drag) {
          abilityPlays.push({ energyCost: card.energyCost, usedFreeEnchantment: drag.usedFreeEnchantment });
        }
      };
    }
  };
  game.cardEffects = new CardEffectSystem(game);
  const cardSystem = {
    game,
    playerSlot: 'p1',
    energy,
    discarded: null,
    rejectFullEnchantmentTarget: () => false,
    isCardOnCooldown: () => false,
    canSpend(cost) {
      return this.energy >= cost;
    },
    resolveCard: CardSystem.prototype.resolveCard,
    spendEnergy(cost) {
      this.energy -= cost;
    },
    moveCardToDiscard(card) {
      this.discarded = card;
      return true;
    }
  };
  return { cardSystem, targetUnit, appliedLevels, abilityPlays };
}

const freePlay = createPlayHarness({ charges: 2, energy: 0 });
assert.equal(CardSystem.prototype.playDraggedCard.call(freePlay.cardSystem, {
  card: levelThreeCard,
  targetUnit: freePlay.targetUnit
}), true);
assert.equal(freePlay.cardSystem.energy, 0);
assert.equal(freePlay.targetUnit.freeEnchantmentCharges, 1);
assert.deepEqual(freePlay.appliedLevels, [1, 1, 1]);
assert.deepEqual(freePlay.abilityPlays, [{ energyCost: 0, usedFreeEnchantment: true }]);

const paidPlay = createPlayHarness({ charges: 0, energy: 2 });
assert.equal(CardSystem.prototype.playDraggedCard.call(paidPlay.cardSystem, {
  card: levelThreeCard,
  targetUnit: paidPlay.targetUnit
}), true);
assert.equal(paidPlay.cardSystem.energy, 0);
assert.equal(paidPlay.targetUnit.freeEnchantmentCharges, 0);
assert.deepEqual(paidPlay.appliedLevels, [1, 1, 1]);
assert.deepEqual(paidPlay.abilityPlays, [{ energyCost: 2, usedFreeEnchantment: false }]);

const failedPlay = createPlayHarness({ charges: 1, energy: 0 });
failedPlay.cardSystem.resolveCard = () => false;
assert.equal(CardSystem.prototype.playDraggedCard.call(failedPlay.cardSystem, {
  card: levelThreeCard,
  targetUnit: failedPlay.targetUnit
}), false);
assert.equal(failedPlay.targetUnit.freeEnchantmentCharges, 1);
assert.equal(failedPlay.cardSystem.energy, 0);

const hostNetworkPlay = createPlayHarness({ charges: 1, energy: 0 });
Object.assign(hostNetworkPlay.cardSystem, {
  handCards: [levelThreeCard],
  temporaryCards: [],
  findCardByInstanceId: CardSystem.prototype.findCardByInstanceId,
  buildDragFromNetworkPayload() {
    return { card: levelThreeCard, targetUnit: hostNetworkPlay.targetUnit };
  },
  cardPlayEnergyCost: CardSystem.prototype.cardPlayEnergyCost,
  playDraggedCard: CardSystem.prototype.playDraggedCard
});
hostNetworkPlay.cardSystem.game.withPlayerContext = (playerSlot, callback) => callback();
assert.equal(CardSystem.prototype.playFromNetworkPayload.call(hostNetworkPlay.cardSystem, {
  cardInstanceId: levelThreeCard.instanceId,
  targetUnitId: 'network-target'
}), true);
assert.equal(hostNetworkPlay.targetUnit.freeEnchantmentCharges, 0);
assert.equal(hostNetworkPlay.cardSystem.energy, 0);
assert.deepEqual(hostNetworkPlay.appliedLevels, [1, 1, 1]);

const snapshotBuilder = new SnapshotBuilder({
  modifiers: {},
  playerColorIndexFor: () => 1
});
const serializedUnit = snapshotBuilder.serializeUnitState({
  id: 'unit-free-enchantment-sync',
  team: 'player',
  type: 'swordsman',
  health: 100,
  maxHealth: 100,
  freeEnchantmentCharges: 3,
  enchantments: new Map(),
  buffs: new Map()
});
assert.equal(serializedUnit.freeEnchantmentCharges, 3);

let mirroredAffordabilityUpdates = 0;
const mirroredUnit = { health: 100, alive: true, ownerPlayerId: 'p1' };
ClientMirror.prototype.applyUnitState.call({
  game: {
    localPlayerId: 'p1',
    cardSystem: {
      updateCardAffordability() {
        mirroredAffordabilityUpdates += 1;
      }
    }
  }
}, mirroredUnit, {
  health: 100,
  freeEnchantmentCharges: serializedUnit.freeEnchantmentCharges
});
assert.equal(mirroredUnit.freeEnchantmentCharges, 3);
assert.equal(mirroredUnit.statusUiDirty, true);
assert.equal(mirroredAffordabilityUpdates, 1);

const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
assert.match(styles, /\.world-free-enchantment-charges[\s\S]*background:\s*var\(--hp-color\)/);
const unitEntitySource = await readFile(new URL('../src/entities/UnitEntity.js', import.meta.url), 'utf8');
assert.ok(
  unitEntitySource.indexOf('world-durability-bar') < unitEntitySource.indexOf('world-free-enchantment-charges'),
  'free enchantment diamonds render below the durability bar'
);

const hintEvents = [];
const hintLogic = new UnitLogicSystem({
  effects: {
    spawnDamageNumber(position, amount, options) {
      hintEvents.push({ position, amount, options });
    }
  },
  playerVisualColor: () => '#f2c94c'
});
const hintUnit = {
  team: 'player',
  freeEnchantmentCharges: 1,
  freeEnchantmentHintTimer: FREE_ENCHANTMENT_HINT_INTERVAL_SECONDS,
  projectileHitHeight: 1.6,
  position: { x: 2, y: 0, z: 3 }
};
assert.equal(hintLogic.updateFreeEnchantmentHint(hintUnit, 4.9), false);
assert.equal(hintEvents.length, 0);
assert.equal(hintLogic.updateFreeEnchantmentHint(hintUnit, 0.1), true);
assert.equal(hintEvents.length, 1);
assert.equal(hintEvents[0].options.text, '有免费附魔次数');
assert.equal(hintEvents[0].options.color, '#f2c94c');
assert.equal(hintUnit.freeEnchantmentHintTimer, FREE_ENCHANTMENT_HINT_INTERVAL_SECONDS);
hintUnit.freeEnchantmentCharges = 0;
assert.equal(hintLogic.updateFreeEnchantmentHint(hintUnit, 5), false);
assert.equal(hintEvents.length, 1);
assert.equal(hintUnit.freeEnchantmentHintTimer, FREE_ENCHANTMENT_HINT_INTERVAL_SECONDS);

console.log('Free enchantment charge tests passed.');
