import { BUFF_DEFINITIONS } from '../data/gameData.js';

export class BuffSystem {
  constructor(game) {
    this.game = game;
  }

  update(dt, units = this.getActiveUnits()) {
    units.forEach((unit) => this.updateUnitBuffs(unit, dt));
  }

  applyBuff(target, buffId, source = null, overrides = {}) {
    if (!target?.addBuff || target.alive === false) return null;
    const definition = BUFF_DEFINITIONS[buffId];
    if (!definition) return null;
    return target.addBuff(buffId, definition, {
      ...overrides,
      source
    });
  }

  modifyAttack(context) {
    this.runBuffEffects(context.source, 'modifyAttack', context);
  }

  afterDamage(context) {
    if (context.target?.alive !== false) {
      this.runBuffEffects(context.source, 'afterDamage', context);
    }
    this.runBuffEffects(context.target, 'receiveDamage', context);
  }

  updateUnitBuffs(unit, dt) {
    if (!unit?.buffs || !unit.alive) return;
    unit.buffs.forEach((buff) => {
      if (Number.isFinite(buff.remaining)) {
        buff.remaining -= dt;
      }

      if (buff.id === 'burning') {
        buff.vfxTimer = (buff.vfxTimer ?? 0) - dt;
        while (buff.vfxTimer <= 0 && unit.alive) {
          this.game.effects.spawnBurningParticles(unit, 2);
          buff.vfxTimer += 0.07;
        }
      }

      if (buff.tickInterval > 0) {
        buff.tickTimer -= dt;
        while (buff.tickTimer <= 0 && unit.alive) {
          this.runEffectList(buff, 'tick', {
            source: buff.source,
            target: unit,
            buff
          });
          buff.tickTimer += buff.tickInterval;
        }
      }
    });

    [...unit.buffs.entries()].forEach(([id, buff]) => {
      if (Number.isFinite(buff.remaining) && buff.remaining <= 0) {
        unit.removeBuff(id);
      }
    });
  }

  runBuffEffects(owner, eventName, context) {
    if (!owner?.buffs) return;
    owner.buffs.forEach((buff) => this.runEffectList(buff, eventName, context));
  }

  runEffectList(buff, eventName, context) {
    const effects = buff.effects ?? [];
    effects.forEach((effect) => {
      if (effect.event !== eventName) return;
      this.applyEffect(effect, {
        ...context,
        buff
      });
    });
  }

  applyEffect(effect, context) {
    if (effect.op === 'addDamage') {
      context.damage += effect.amount ?? 0;
      if (effect.damageType === 'true') {
        context.damageTypes.add('true');
      }
      return;
    }

    if (effect.op === 'addDamageType') {
      if (effect.damageType === 'true') {
        context.damageTypes.add('true');
      }
      return;
    }

    if (effect.op === 'applyBuff') {
      const applied = this.applyBuff(context.target, effect.buffId, context.source, {
        duration: resolveEffectNumber(effect, 'duration', context, effect.duration),
        damagePerSecond: resolveEffectNumber(effect, 'damagePerSecond', context, 0),
        level: sourceBuffLevel(context)
      });
      if (applied && effect.vfx === 'fire') {
        this.game.effects.spawnBurningParticles(context.target, 6);
      }
      return;
    }

    if (effect.op === 'reflectDamage') {
      if (!context.source?.alive) return;
      const damage = effect.amount ?? 0;
      context.source.takeRawDamage(damage);
      this.game.effects.spawnDamageNumber(context.source.position, damage, {
        height: 1.24
      });
      if (effect.vfx === 'thorns') {
        this.game.effects.spawnThorns(context.target.position);
      }
      return;
    }

    if (effect.op === 'damageOverTime') {
      if (!context.target?.alive) return;
      const damagePerSecond = context.buff.damagePerSecond ?? effect.damagePerSecond ?? 0;
      const tickInterval = context.buff.tickInterval ?? effect.tickInterval ?? 0.45;
      const damage = damagePerSecond * tickInterval;
      context.target.takeRawDamage(damage);
      this.game.effects.spawnDamageNumber(context.target.position, damage, {
        height: 1.48,
        duration: 0.68
      });
      if (effect.vfx === 'fire') {
        this.game.effects.spawnBurningParticles(context.target, 4);
      }
    }
  }

  getActiveUnits() {
    return [...this.game.friendlyUnits, ...this.game.enemyUnits].filter((unit) => unit.alive);
  }
}

function resolveEffectNumber(effect, field, context, fallback = 0) {
  if (Number.isFinite(effect[field])) return effect[field];
  const base = Number.isFinite(effect[`${field}Base`]) ? effect[`${field}Base`] : 0;
  const perLevel = Number.isFinite(effect[`${field}PerLevel`])
    ? effect[`${field}PerLevel`]
    : null;
  if (perLevel !== null) {
    return base + perLevel * sourceBuffLevel(context);
  }
  return fallback;
}

function sourceBuffLevel(context) {
  const level = Number(context.buff?.level ?? 1);
  return Number.isFinite(level) ? Math.max(1, level) : 1;
}
