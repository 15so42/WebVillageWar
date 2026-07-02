import { BUFF_DEFINITIONS } from '../data/gameData.js';

export class CardEffectSystem {
  constructor(game) {
    this.game = game;
    this.handlers = {
      'spawn-units': (context) => this.spawnUnits(context),
      'build-structure': (context) => this.buildStructure(context),
      'create-area-effect': (context) => this.createAreaEffect(context),
      'cast-spell': (context) => this.castSpell(context),
      'apply-buff': (context) => this.applyBuff(context),
      'acquire-ability': (context) => this.acquireAbility(context),
      'gain-energy': (context) => this.gainEnergy(context),
      'upgrade-hand-card': (context) => this.upgradeHandCard(context),
      'exhaust-hand-card': (context) => this.exhaustHandCard(context)
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
    this.game.summonUnits(
      effect.unitType ?? card.unitType,
      effect.count ?? card.count,
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

  createAreaEffect({ card, effect, point }) {
    if (!point) return false;
    this.game.areaEffects.create(effect.areaEffect ?? effect, point, card);
    return true;
  }

  castSpell({ card, effect, point }) {
    return this.game.spells.cast(effect.spellId, {
      card,
      effect,
      point
    });
  }

  applyBuff({ card, effect, targetUnit }) {
    if (!targetUnit) return false;
    const buffId = effect.buffId ?? card.enchantmentId;
    const cardLevel = Math.max(1, Math.floor(card.level ?? 1));
    const applyLevel = card.kind === 'enchant' ? cardLevel + 1 : cardLevel;
    const buff = this.game.buffs.applyBuff(targetUnit, buffId, null, {
      sourceCard: card.id,
      level: applyLevel,
      levelIncrement: applyLevel
    });
    const definition = buff ?? BUFF_DEFINITIONS[buffId];
    this.game.effects.spawnRing(targetUnit.position, definition?.color ?? card.color, 0.85, 0.6);
    this.game.selectUnit(targetUnit);
    return Boolean(buff);
  }

  acquireAbility({ card, effect }) {
    const abilityId = effect.abilityId ?? card.abilityId;
    const stacks = resolveCardEffectNumber(card, effect, 'stacks', 1);
    return this.game.abilities?.acquire(abilityId, stacks) === true;
  }

  gainEnergy({ card, effect }) {
    const amount = resolveCardEffectNumber(card, effect, 'amount', effect.amount ?? 0);
    this.game.cardSystem.addEnergy(amount);
    return true;
  }

  upgradeHandCard({ card, effect, targetCard }) {
    if (!targetCard || targetCard === card) return false;
    const amount = resolveCardEffectNumber(card, effect, 'amount', effect.amount ?? 1);
    return this.game.cardSystem.upgradeHandCard(targetCard, amount);
  }

  exhaustHandCard({ card, effect, targetCard }) {
    if (!targetCard || targetCard === card) return false;
    const amount = resolveCardEffectNumber(card, effect, 'amount', effect.amount ?? 1);
    return this.game.cardSystem.exhaustHandCard(targetCard, amount, {
      excludeCards: [card]
    }) > 0;
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
