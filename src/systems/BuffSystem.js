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

  beforeDamage(context) {
    this.runBuffEffects(context.target, 'beforeDamage', context);
  }

  afterDamage(context) {
    if (context.target?.alive !== false) {
      this.runBuffEffects(context.source, 'afterDamage', context);
    }
    this.runBuffEffects(context.target, 'receiveDamage', context);
  }

  updateUnitBuffs(unit, dt) {
    if (!unit?.buffs || !unit.alive) return;
    [...unit.buffs.values()].forEach((buff) => {
      if (!unit.buffs.has(buff.id)) return;
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

      if (buff.id === 'poisoned') {
        buff.vfxTimer = (buff.vfxTimer ?? 0) - dt;
        while (buff.vfxTimer <= 0 && unit.alive) {
          this.game.effects.spawnPoisonParticles(unit, 1);
          buff.vfxTimer += 0.18;
        }
      }

      if (buff.tickInterval > 0) {
        buff.tickTimer -= dt;
        let tickCount = 0;
        while (buff.tickTimer <= 0 && unit.alive && tickCount < 4) {
          this.runEffectList(buff, 'tick', {
            source: buff.source,
            target: unit,
            buff
          });
          buff.tickTimer += buff.tickInterval;
          tickCount += 1;
        }
        if (buff.tickTimer <= 0) {
          buff.tickTimer = buff.tickInterval;
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
    [...owner.buffs.values()].forEach((buff) => {
      if (!owner.buffs.has(buff.id)) return;
      this.runEffectList(buff, eventName, context);
    });
  }

  runEffectList(buff, eventName, context) {
    const effects = buff.effects ?? [];
    effects.forEach((effect) => {
      if (effect.event !== eventName) return;
      const previousBuff = context.buff;
      context.buff = buff;
      try {
        this.applyEffect(effect, context);
      } finally {
        context.buff = previousBuff;
      }
    });
  }

  applyEffect(effect, context) {
    if (effect.op === 'addDamage') {
      context.damage += resolveEffectNumber(effect, 'amount', context, effect.amount ?? 0);
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

    if (effect.op === 'reduceDamageFlat') {
      const reduction = resolveEffectNumber(effect, 'amount', context, 0);
      context.damage = Math.max(0, context.damage - reduction);
      return;
    }

    if (effect.op === 'reduceDamagePercent') {
      const reduction = resolveReductionPercent(effect, context);
      context.damage = Math.max(0, context.damage * (1 - reduction));
      return;
    }

    if (effect.op === 'applyBuff') {
      const applied = this.applyBuff(context.target, effect.buffId, context.source, {
        duration: resolveEffectNumber(effect, 'duration', context, effect.duration),
        damagePerSecond: resolveEffectNumber(effect, 'damagePerSecond', context, 0),
        damageType: effect.damageType,
        level: sourceBuffLevel(context)
      });
      if (applied && effect.vfx === 'fire') {
        this.game.effects.spawnBurningParticles(context.target, 6);
      }
      if (applied && effect.vfx === 'poison') {
        this.game.effects.spawnPoisonParticles(context.target, 6);
      }
      return;
    }

    if (effect.op === 'reflectDamage') {
      if (!context.source?.alive) return;
      const damage = resolveEffectNumber(effect, 'amount', context, effect.amount ?? 0);
      this.game.combat.applyDamage(context.source, damage, context.target, 0, {
        damage,
        source: context.target,
        target: context.source,
        isAttack: false,
        skipHitAnimation: true,
        skipHitEffect: true,
        damageNumberHeight: 1.24
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
      const damageTypes = new Set();
      if (context.buff.damageType === 'true' || effect.damageType === 'true') {
        damageTypes.add('true');
      }
      this.game.combat.applyDamage(context.target, damage, context.source, 0, {
        damage,
        source: context.source,
        target: context.target,
        damageTypes,
        isAttack: false,
        isDamageOverTime: true,
        skipHitAnimation: true,
        skipHitEffect: true,
        damageNumberHeight: 1.48,
        damageNumberDuration: 0.68
      });
      if (effect.vfx === 'fire') {
        this.game.effects.spawnBurningParticles(context.target, 4);
      }
      if (effect.vfx === 'poison') {
        this.game.effects.spawnPoisonParticles(context.target, 4);
      }
      return;
    }

    if (effect.op === 'restoreHealth') {
      if (!context.target?.alive) return;
      const amount = resolveEffectNumber(effect, 'amount', context, 0);
      context.target.restoreHealth?.(amount);
      return;
    }

    if (effect.op === 'restoreShield') {
      if (!context.target?.alive) return;
      const amount = resolveEffectNumber(effect, 'amount', context, 0);
      context.target.restoreShield?.(amount);
    }
  }

  getActiveUnits() {
    return [...this.game.friendlyUnits, ...this.game.enemyUnits].filter((unit) => unit.alive);
  }
}

function resolveReductionPercent(effect, context) {
  if (effect.formula === 'levelOverLevelPlus') {
    const level = sourceBuffLevel(context);
    return clamp01(level / (level + (effect.denominator ?? 5)));
  }
  return clamp01(resolveEffectNumber(effect, 'percent', context, effect.percent ?? 0));
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

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
