import { BUFF_DEFINITIONS } from '../data/gameData.js';

export class CardEffectSystem {
  constructor(game) {
    this.game = game;
    this.handlers = {
      'spawn-units': (context) => this.spawnUnits(context),
      'build-structure': (context) => this.buildStructure(context),
      'create-area-effect': (context) => this.createAreaEffect(context),
      'cast-spell': (context) => this.castSpell(context),
      'apply-buff': (context) => this.applyBuff(context)
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
      targetUnit: drag.targetUnit
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
    const buff = this.game.buffs.applyBuff(targetUnit, buffId, null, {
      sourceCard: card.id,
      level: card.level ?? 1,
      levelIncrement: card.level ?? 1
    });
    const definition = buff ?? BUFF_DEFINITIONS[buffId];
    this.game.effects.spawnRing(targetUnit.position, definition?.color ?? card.color, 0.85, 0.6);
    this.game.selectUnit(targetUnit);
    return Boolean(buff);
  }
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
