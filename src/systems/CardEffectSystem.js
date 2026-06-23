import { BUFF_DEFINITIONS } from '../data/gameData.js';

export class CardEffectSystem {
  constructor(game) {
    this.game = game;
    this.handlers = {
      'spawn-units': (context) => this.spawnUnits(context),
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

    handler({
      card,
      effect,
      point: drag.point?.clone(),
      targetUnit: drag.targetUnit
    });
    this.game.lastCardPlayed = card.id;
    return true;
  }

  spawnUnits({ card, effect, point }) {
    this.game.summonUnits(
      effect.unitType ?? card.unitType,
      effect.count ?? card.count,
      point,
      card.radius
    );
  }

  castSpell({ card, effect, point }) {
    this.game.spells.cast(effect.spellId, {
      card,
      effect,
      point
    });
  }

  applyBuff({ card, effect, targetUnit }) {
    if (!targetUnit) return;
    const buffId = effect.buffId ?? card.enchantmentId;
    const buff = this.game.buffs.applyBuff(targetUnit, buffId, null, {
      sourceCard: card.id
    });
    const definition = buff ?? BUFF_DEFINITIONS[buffId];
    this.game.effects.spawnRing(targetUnit.position, definition?.color ?? card.color, 0.85, 0.6);
    this.game.selectUnit(targetUnit);
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
