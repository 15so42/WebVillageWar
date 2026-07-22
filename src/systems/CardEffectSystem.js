import { BUFF_DEFINITIONS, TEAMS } from '../data/gameData.js';
import { distance2D } from '../utils/math.js';

export class CardEffectSystem {
  constructor(game) {
    this.game = game;
    this.handlers = {
      'spawn-units': (context) => this.spawnUnits(context),
      'build-structure': (context) => this.buildStructure(context),
      'create-area-effect': (context) => this.createAreaEffect(context),
      'cast-spell': (context) => this.castSpell(context),
      'cast-meteor-barrage': (context) => this.castMeteorBarrage(context),
      'apply-buff': (context) => this.applyBuff(context),
      'apply-random-enchantments': (context) => this.applyRandomEnchantments(context),
      'acquire-ability': (context) => this.acquireAbility(context),
      'gain-energy': (context) => this.gainEnergy(context),
      'gain-energy-from-units': (context) => this.gainEnergyFromUnits(context),
      'draw-temporary-cards': (context) => this.drawTemporaryCards(context),
      'corrupt-hand-card': (context) => this.corruptHandCard(context),
      'mark-hunt-zone': (context) => this.markHuntZone(context),
      'gamble-silver': (context) => this.gambleSilver(context)
    };
  }

  resolve(drag) {
    const card = drag.card;
    const effect = card.effect ?? legacyEffectFor(card);
    const handler = this.handlers[effect.type];
    if (!handler) {
      console.warn(`No card effect handler for ${effect.type}`);
      return false;
    }

    const resolved = handler({
      card,
      effect,
      playerId: this.game.activeEconomySlot
        ?? this.game.cardSystem?.playerSlot
        ?? this.game.localPlayerSlot,
      point: drag.point?.clone(),
      targetUnit: drag.targetUnit,
      targetCard: drag.targetCard
    });
    if (resolved === false) return false;
    this.game.lastCardPlayed = card.id;
    return true;
  }

  spawnUnits({ card, effect, point }) {
    if (!point || this.game.canDeploySummonAt?.(point) === false) return false;
    const baseCount = effect.count ?? card.count;
    const abilityOwner = this.game.activeEconomySlot
      ?? this.game.cardSystem?.playerSlot
      ?? this.game.localPlayerSlot;
    const reinforcementBonus = this.game.abilitiesFor?.(abilityOwner)?.getSummonReinforcementBonus?.(card) ?? 0;
    this.game.summonUnits(
      effect.unitType ?? card.unitType,
      Math.max(1, Math.floor(baseCount ?? 1) + reinforcementBonus),
      point,
      card.radius,
      { sourceCard: card }
    );
    return true;
  }

  buildStructure({ card, effect, point }) {
    if (!point) return false;
    const unitType = effect.unitType ?? card.unitType;
    if (unitType === 'beacon' && this.game.canPlaceBeaconAt?.(point) === false) return false;
    this.game.buildStructureUnit(effect.unitType ?? card.unitType, point, {
      sourceCard: card,
      buildSeconds: effect.buildSeconds ?? card.buildSeconds
    });
    return true;
  }

  createAreaEffect({ card, effect, playerId, point }) {
    if (!point) return false;
    return Boolean(this.game.areaEffects.create(effect.areaEffect ?? effect, point, card, { playerId }));
  }

  castSpell({ card, effect, playerId, point }) {
    return this.game.spells.cast(effect.spellId, {
      card,
      effect,
      playerId,
      point
    });
  }

  castMeteorBarrage({ card, effect, playerId, point }) {
    if (!point) return false;
    const strikeCount = Math.max(0, Math.floor(this.game.runCardsPlayedCount ?? 0) + 1);
    if (strikeCount <= 0) return false;
    return this.game.spells.cast('meteor-barrage', {
      card,
      effect,
      playerId,
      point,
      count: strikeCount
    });
  }

  applyBuff({ card, effect, targetUnit }) {
    if (!targetUnit) return false;
    const buffId = effect.buffId ?? card.enchantmentId;
    const cardLevel = Math.max(1, Math.floor(card.level ?? 1));
    const definition = BUFF_DEFINITIONS[buffId];
    const isEnchantment = definition?.category === 'enchantment';
    const applyCount = isEnchantment ? cardLevel : 1;
    const applyLevel = isEnchantment ? 1 : cardLevel;
    let buff = null;
    for (let index = 0; index < applyCount; index += 1) {
      buff = this.game.buffs.applyBuff(targetUnit, buffId, null, {
        sourceCard: card.id,
        level: applyLevel
      }) ?? buff;
    }
    if (!buff) return false;
    const visualDefinition = buff ?? definition;
    this.game.effects.spawnRing(targetUnit.position, visualDefinition?.color ?? card.color, 0.85, 0.6);
    this.game.selectUnit(targetUnit);
    return true;
  }

  applyRandomEnchantments({ card, effect, targetUnit }) {
    if (!targetUnit) return false;
    const count = Math.max(1, Math.floor(resolveCardEffectNumber(card, effect, 'count', 1)));
    const enchantmentIds = Object.entries(BUFF_DEFINITIONS)
      .filter(([, definition]) => definition.category === 'enchantment')
      .map(([id]) => id);
    if (!enchantmentIds.length) return false;
    const cardLevel = Math.max(1, Math.floor(card.level ?? 1));
    let applied = 0;
    for (let index = 0; index < count; index += 1) {
      const buffId = enchantmentIds[Math.floor(Math.random() * enchantmentIds.length)];
      const buff = this.game.buffs.applyBuff(targetUnit, buffId, null, {
        sourceCard: card.id,
        level: cardLevel + 1
      });
      if (buff) applied += 1;
    }
    if (applied <= 0) return false;
    this.game.effects.spawnRing(targetUnit.position, card.color ?? '#b68cff', 1.1, 0.75);
    this.game.effects.spawnDamageNumber(targetUnit.position, 1, {
      text: `随机附魔x${applied}`,
      color: card.color ?? '#d8b7ff',
      stroke: '#21132f',
      height: targetUnit.projectileHitHeight ?? 1.55,
      duration: 0.8,
      fontSize: 72,
      baseHeight: 0.48
    });
    this.game.selectUnit(targetUnit);
    return true;
  }

  acquireAbility({ card, effect }) {
    const abilityId = effect.abilityId ?? card.abilityId;
    const stacks = resolveCardEffectNumber(card, effect, 'stacks', 1);
    const durationSeconds = resolveCardEffectNumber(card, effect, 'durationSeconds', effect.durationSeconds ?? 0);
    const abilityOwner = this.game.activeEconomySlot
      ?? this.game.cardSystem?.playerSlot
      ?? this.game.localPlayerSlot;
    return this.game.abilitiesFor?.(abilityOwner)?.acquire(abilityId, stacks, { durationSeconds }) === true;
  }

  gainEnergy({ card, effect }) {
    const amount = resolveCardEffectNumber(card, effect, 'amount', effect.amount ?? 0);
    this.game.cardSystem.addEnergy(amount);
    return true;
  }

  gambleSilver({ card }) {
    const before = Math.max(0, this.game.silver ?? 0);
    const doubled = Math.random() < 0.5;
    const after = doubled ? before * 2 : before * 0.5;
    this.game.silver = Math.max(0, after);
    const position = this.game.playerBase?.position ?? null;
    this.game.updateHud(0);
    if (this.game.runShopOpen) this.game.renderRunShop();
    if (position) {
      this.game.effects.spawnDamageNumber(position, 1, {
        text: doubled ? '银币翻倍' : '银币减半',
        color: doubled ? '#ffe08a' : '#d8a0a0',
        stroke: doubled ? '#4a3818' : '#3a2020',
        height: 3.05,
        duration: 0.88,
        fontSize: 82,
        baseHeight: 0.5
      });
      this.game.effects.spawnRing(position, card.color ?? '#d8b85a', 1.15, 0.48);
    }
    return true;
  }

  gainEnergyFromUnits({ card, effect, playerId }) {
    const perUnit = resolveCardEffectNumber(card, effect, 'amountPerUnit', 1);
    const friendlyCount = this.game.friendlyUnits.filter((unit) => (
      unit.alive &&
      unit.team === TEAMS.PLAYER &&
      (this.game.unitBelongsToPlayer?.(unit, playerId) ?? true) &&
      !unit.underConstruction
    )).length;
    const amount = friendlyCount * perUnit;
    if (amount <= 0) return false;
    const gained = this.game.cardSystem.addEnergy(amount);
    if (gained > 0) {
      this.game.effects.spawnEnergyNumber(this.game.playerBase.position, gained, {
        height: 3.05
      });
      this.game.effects.spawnDamageNumber(this.game.playerBase.position, 1, {
        text: `集结+${gained}`,
        color: card.color ?? '#7f8fc7',
        stroke: '#1a2240',
        height: 3.2,
        duration: 0.78,
        fontSize: 76,
        baseHeight: 0.5
      });
    }
    return gained > 0;
  }

  drawTemporaryCards({ card, effect }) {
    const amount = Math.max(1, Math.floor(resolveCardEffectNumber(card, effect, 'amount', 1)));
    let drawn = this.game.cardSystem.drawTemporaryCards(amount, {
      temporaryLimit: effect.temporaryLimit,
      overflowToDrawTop: true
    });
    if (drawn < amount && effect.fallbackPool === 'selected-deck') {
      drawn += this.game.cardSystem.addTemporaryCardsFromPool(
        this.game.selectedCardPool?.() ?? [],
        amount - drawn,
        {
          temporaryLimit: effect.temporaryLimit,
          overflowToDrawTop: true,
          prefix: `tactic-${card.id}-${Date.now()}`
        }
      );
    }
    return drawn > 0;
  }

  corruptHandCard({ card, effect, targetCard }) {
    void effect;
    if (!targetCard || targetCard === card) return false;
    targetCard.exhaust = true;
    targetCard.energyCost = 0;
    if (!Number.isFinite(targetCard.maxUses)) {
      targetCard.maxUses = 1;
      targetCard.remainingUses = 1;
    }
    this.game.cardSystem.renderHand?.();
    this.game.cardSystem.updateCardAffordability?.();
    this.game.effects.spawnDamageNumber(this.game.playerBase.position, 1, {
      text: '0费消耗',
      color: card.color ?? '#9f6b70',
      stroke: '#3a272c',
      height: 3,
      duration: 0.78,
      fontSize: 76,
      baseHeight: 0.48
    });
    return true;
  }

  markHuntZone({ card, effect, point }) {
    if (!point) return false;
    const radius = card.radius ?? effect.radius ?? 3;
    const buffId = effect.buffId ?? 'huntMarked';
    let marked = 0;
    this.game.enemyUnits.forEach((enemy) => {
      if (!enemy.alive || enemy.underConstruction) return;
      if (distance2D(enemy.position, point) > radius) return;
      const buff = this.game.buffs.applyBuff(enemy, buffId, null, {
        sourceCard: card.id
      });
      if (buff) marked += 1;
    });
    if (marked <= 0) return false;
    this.game.effects.spawnRing(point, card.color ?? '#ff8866', radius, 0.55);
    this.game.effects.spawnDamageNumber(point, 1, {
      text: `猎标x${marked}`,
      color: card.color ?? '#ff8866',
      stroke: '#4a2018',
      height: 1.2,
      duration: 0.82,
      fontSize: 74,
      baseHeight: 0.42
    });
    return true;
  }

}

function resolveCardEffectNumber(card, effect, field, fallback = 0) {
  if (Number.isFinite(effect[field])) return effect[field];
  const level = Math.max(1, Math.floor(card?.level ?? 1));
  const base = Number.isFinite(effect[`${field}Base`]) ? effect[`${field}Base`] : fallback;
  const perLevel = Number.isFinite(effect[`${field}PerLevel`])
    ? effect[`${field}PerLevel`]
    : 0;
  return base + perLevel * Math.max(0, level - 1);
}

function legacyEffectFor(card) {
  if (card.kind === 'summon') {
    return {
      type: 'spawn-units',
      unitType: card.unitType,
      count: card.count
    };
  }

  if (card.kind === 'spell') {
    return {
      type: 'cast-spell',
      spellId: card.id
    };
  }

  return {
    type: 'apply-buff',
    buffId: card.enchantmentId
  };
}
