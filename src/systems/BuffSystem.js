import { BUFF_DEFINITIONS } from '../data/gameData.js';

export class BuffSystem {
  constructor(game) {
    this.game = game;
    this.expiredBuffIds = [];
  }

  update(dt, units = this.getActiveUnits()) {
    units.forEach((unit) => this.updateUnitBuffs(unit, dt));
  }

  applyBuff(target, buffId, source = null, overrides = {}) {
    if (!target?.addBuff || target.alive === false) return null;
    if (target.canReceiveBuffs === false || target.immuneToStatusEffects === true) return null;
    const definition = BUFF_DEFINITIONS[buffId];
    if (!definition) return null;
    if (isStatusImmune(target, buffId)) return null;
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
    if (context.source?.alive !== false && (context.damageDealt ?? context.damage ?? 0) > 0) {
      this.runBuffEffects(context.source, 'afterDamage', context);
    }
    if (context.target?.alive !== false) {
      this.runBuffEffects(context.target, 'receiveDamage', context);
    }
  }

  unitDeath(deadUnit) {
    this.getActiveUnits().forEach((unit) => {
      this.runBuffEffects(unit, 'unitDeath', {
        source: unit,
        target: deadUnit,
        deadUnit
      });
    });
  }

  updateUnitBuffs(unit, dt) {
    if (!unit?.buffs || !unit.alive) return;
    const expired = this.expiredBuffIds;
    expired.length = 0;
    for (const buff of unit.buffs.values()) {
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

      if (buff.id === 'drained') {
        buff.vfxTimer = (buff.vfxTimer ?? 0) - dt;
        while (buff.vfxTimer <= 0 && unit.alive) {
          this.game.effects.spawnDrainParticles(unit, 1);
          buff.vfxTimer += 0.16;
        }
      }

      if (buff.id === 'bleeding') {
        buff.vfxTimer = (buff.vfxTimer ?? 0) - dt;
        while (buff.vfxTimer <= 0 && unit.alive) {
          this.game.effects.spawnBleedParticles(unit, 1);
          buff.vfxTimer += 0.26;
        }
      }

      if (buff.id === 'cursed') {
        buff.vfxTimer = (buff.vfxTimer ?? 0) - dt;
        while (buff.vfxTimer <= 0 && unit.alive) {
          this.game.effects.spawnCurseParticles(unit, 1);
          buff.vfxTimer += 0.22;
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

      if (Number.isFinite(buff.remaining) && buff.remaining <= 0) {
        expired.push(buff.id);
      }
    }

    for (let i = 0; i < expired.length; i += 1) {
      unit.removeBuff(expired[i]);
    }
  }

  runBuffEffects(owner, eventName, context) {
    if (!owner?.buffs) return;
    orderedBuffsForEvent(owner, eventName).forEach((buff) => {
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

    if (effect.op === 'criticalHit') {
      if (!context.source?.alive || !context.isAttack || context.damage <= 0) return;
      const rawChance = Math.max(0, resolveEffectNumber(effect, 'chance', context, 0));
      if (rawChance <= 0) return;
      const chance = clamp01(rawChance);
      if (Math.random() >= chance) return;
      const baseMultiplier = Math.max(1, effect.multiplier ?? 3);
      const overflowChance = Math.max(0, rawChance - 1);
      const multiplier = baseMultiplier + overflowChance * Math.max(0, baseMultiplier - 1);
      context.damage *= multiplier;
      context.criticalMultiplier = multiplier;
      this.game.effects.spawnDamageNumber(context.source.position, 1, {
        text: `暴击x${formatEffectAmount(multiplier)}`,
        color: effect.color ?? '#ffd166',
        stroke: '#3a2410',
        height: context.source.projectileHitHeight ?? 1.55,
        duration: 0.66,
        fontSize: 78,
        baseHeight: 0.48
      });
      return;
    }

    if (effect.op === 'consumeFocusedRange') {
      if (!context.source?.alive || !context.isAttack) return;
      const bonus = Math.max(0, context.buff?.focusRangeBonus ?? 0);
      if (bonus <= 0.001) return;
      context.damage += bonus;
      clearFocusedRange(context.source, context.buff);
      this.game.effects.spawnRing(context.source.position, effect.color ?? '#b7e8ff', 0.62, 0.38);
      this.game.effects.spawnDamageNumber(context.source.position, 1, {
        text: `凝神+${formatEffectAmount(bonus)}`,
        color: effect.color ?? '#b7e8ff',
        stroke: '#183146',
        height: context.source.projectileHitHeight ?? 1.58,
        duration: 0.7,
        fontSize: 76,
        baseHeight: 0.48
      });
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
      if (isTrueDamage(context)) return;
      const reduction = resolveReductionPercent(effect, context);
      context.damage = Math.max(0, context.damage * (1 - reduction));
      return;
    }

    if (effect.op === 'absorbDamageWithDurability') {
      if (!context.isAttack || context.damageTypes?.has?.('true')) return;
      if (!context.target?.weapon || context.damage <= 0) return;
      const absorbPerDurability = resolveBlockAbsorbPerDurability(effect, context);
      const durability = Math.max(0, context.target.weapon.durability ?? 0);
      const maxDurability = Math.max(0.01, context.target.weapon.maxDurability ?? durability);
      const durabilityRatio = clamp01(durability / maxDurability);
      if (durability <= 0 || durabilityRatio <= 0) return;
      const maxAbsorbByRatio = context.damage * durabilityRatio;
      const absorbed = Math.min(context.damage, maxAbsorbByRatio, durability * absorbPerDurability);
      const spentDurability = absorbed / absorbPerDurability;
      context.target.spendDurability?.(spentDurability);
      context.damage = Math.max(0, context.damage - absorbed);
      if (absorbed > 0.01 && effect.vfx === 'block') {
        this.game.effects.spawnRing(context.target.position, '#d8dde0', 0.58, 0.32);
        this.game.effects.spawnDamageNumber(context.target.position, 1, {
          text: '格挡',
          color: '#eef7ff',
          stroke: '#24323a',
          height: context.target.projectileHitHeight ?? 1.45,
          duration: 0.58,
          fontSize: 84,
          baseHeight: 0.48
        });
      }
      return;
    }

    if (effect.op === 'applyBuff') {
      const applied = this.applyBuff(context.target, effect.buffId, context.source, {
        duration: resolveEffectNumber(effect, 'duration', context, effect.duration),
        damagePerSecond: resolveEffectNumber(effect, 'damagePerSecond', context, 0),
        healPerSecond: resolveEffectNumber(effect, 'healPerSecond', context, null),
        damageType: effect.damageType,
        level: sourceBuffLevel(context)
      });
      if (applied && effect.vfx === 'fire') {
        this.game.effects.spawnBurningParticles(context.target, 6);
      }
      if (applied && effect.vfx === 'poison') {
        this.game.effects.spawnPoisonParticles(context.target, 6);
      }
      if (applied && effect.vfx === 'drain') {
        this.game.effects.spawnDrainParticles(context.target, 6);
      }
      if (applied && effect.vfx === 'bleed') {
        this.game.effects.spawnBleedParticles(context.target, 6);
      }
      if (applied && effect.vfx === 'curse') {
        this.game.effects.spawnCurseParticles(context.target, 6);
      }
      return;
    }

    if (effect.op === 'explodeOnHit') {
      if (!context.source?.alive || !context.target?.position || !context.isAttack) return;
      const damage = resolveEffectNumber(effect, 'damage', context, 0);
      const radius = Math.max(0, resolveEffectNumber(effect, 'radius', context, effect.radius ?? 2.4));
      if (damage <= 0 || radius <= 0) return;
      const center = context.target.position;
      const enemies = getEnemiesOf(this.game, context.source);
      let hitCount = 0;
      enemies.forEach((unit) => {
        if (!unit.alive || unit === context.source || !unit.position) return;
        if (distance2D(center, unit.position) > radius) return;
        hitCount += 1;
        this.game.combat.applyDamage(unit, damage, context.source, effect.knockback ?? 0, {
          damage,
          source: context.source,
          target: unit,
          damageTypes: new Set(effect.damageTypes ?? []),
          isAttack: false,
          isExplosionDamage: true,
          damageNumberHeight: unit.projectileHitHeight ?? 1.45,
          damageNumberDuration: 0.66
        });
      });
      if (hitCount > 0) {
        this.game.effects.spawnRing(center, effect.color ?? '#ffb45c', radius, 0.46);
        this.game.effects.spawnHit({
          x: center.x,
          y: (center.y ?? 0) + 0.82,
          z: center.z
        }, effect.color ?? '#ffb45c');
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

    if (effect.op === 'restoreHealthMissingChance') {
      if (!context.target?.alive) return;
      const maxHealth = Math.max(1, context.target.maxHealth ?? 1);
      const missingRatio = clamp01(1 - (context.target.health ?? 0) / maxHealth);
      if (Math.random() >= missingRatio) return;
      const amount = resolveEffectNumber(effect, 'amount', context, 0);
      const healed = context.target.restoreHealth?.(amount) ?? 0;
      this.game.effects.spawnRing(context.target.position, effect.color ?? '#ffb66c', 0.62, 0.42);
      this.game.effects.spawnHealNumber(context.target.position, healed, {
        displayAmount: amount,
        color: effect.color ?? '#ffb66c',
        height: context.target.projectileHitHeight ?? 1.55
      });
      return;
    }

    if (effect.op === 'restoreDurability') {
      if (!context.target?.alive) return;
      const amount = resolveEffectNumber(effect, 'amount', context, 0);
      const restored = context.target.restoreDurability?.(amount) ?? 0;
      if (restored > 0.01) {
        this.game.effects.spawnRing(context.target.position, effect.color ?? '#dff8ff', 0.48, 0.32);
        this.game.effects.spawnDamageNumber(context.target.position, 1, {
          text: `耐久+${formatEffectAmount(restored)}`,
          color: effect.color ?? '#dff8ff',
          stroke: '#12303a',
          height: context.target.projectileHitHeight ?? 1.55,
          duration: 0.62,
          fontSize: 78,
          baseHeight: 0.46
        });
      }
      return;
    }

    if (effect.op === 'lifestealFromDamage') {
      const dealt = context.damageDealt ?? context.damage ?? 0;
      if (!context.source?.alive || !context.isAttack || dealt <= 0) return;
      const percent = resolveEffectNumber(effect, 'percent', context, 0);
      const amount = dealt * percent;
      const healed = context.source.restoreHealth?.(amount) ?? 0;
      this.game.effects.spawnRing(context.source.position, effect.color ?? '#b54848', 0.54, 0.34);
      this.game.effects.spawnHealNumber(context.source.position, healed, {
        displayAmount: amount,
        color: effect.color ?? '#ff9b9b',
        height: context.source.projectileHitHeight ?? 1.55
      });
      return;
    }

    if (effect.op === 'gainMaxHealthOnDeathNearby') {
      const owner = context.source;
      const deadUnit = context.deadUnit ?? context.target;
      if (!owner?.alive || !deadUnit || owner === deadUnit) return;
      const radius = Math.max(0, effect.radius ?? 6);
      if (!owner.position || !deadUnit.position) return;
      const dx = owner.position.x - deadUnit.position.x;
      const dz = owner.position.z - deadUnit.position.z;
      if (Math.hypot(dx, dz) > radius) return;
      const now = this.game.elapsedTime ?? 0;
      const cooldown = Math.max(0, effect.cooldown ?? 3);
      const key = `deathCooldown:${context.buff?.id ?? 'soul'}`;
      if ((context.buff[key] ?? -Infinity) + cooldown > now) return;
      context.buff[key] = now;
      const amount = resolveEffectNumber(effect, 'amount', context, 0);
      if (amount <= 0) return;
      context.buff.soulBonus = (context.buff.soulBonus ?? 0) + amount;
      const source = `buff:${context.buff.id}:soul-bonus`;
      owner.attributes.removeModifiersBySource(source);
      owner.attributes.addModifier({
        stat: 'maxHealth',
        type: 'add',
        amount: context.buff.soulBonus
      }, source);
      owner.health += amount;
      owner.clampToAttributeCaps?.();
      this.game.effects.spawnRing(owner.position, effect.color ?? '#9f6bff', 0.7, 0.46);
      this.game.effects.spawnDamageNumber(owner.position, 1, {
        text: `魂+${formatEffectAmount(amount)}`,
        color: effect.color ?? '#d8b7ff',
        stroke: '#2a1740',
        height: owner.projectileHitHeight ?? 1.55,
        duration: 0.78,
        fontSize: 82,
        baseHeight: 0.5
      });
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
      if (context.buff.bypassShield || effect.bypassShield) {
        damageTypes.add('directHealth');
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
      if (effect.vfx === 'bleed') {
        this.game.effects.spawnBleedParticles(context.target, 4);
      }
      if (effect.vfx === 'curse') {
        this.game.effects.spawnCurseParticles(context.target, 4);
      }
      return;
    }

    if (effect.op === 'damageOverTimeAndHealSource') {
      if (!context.target?.alive) return;
      const damagePerSecond = context.buff.damagePerSecond ?? effect.damagePerSecond ?? 0;
      const healPerSecond = context.buff.healPerSecond ?? effect.healPerSecond ?? damagePerSecond;
      const tickInterval = context.buff.tickInterval ?? effect.tickInterval ?? 1;
      const damage = damagePerSecond * tickInterval;
      const healedAmount = healPerSecond * tickInterval;
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
      if (context.source?.alive && healedAmount > 0) {
        const healed = context.source.restoreHealth?.(healedAmount) ?? 0;
        this.game.effects.spawnHealNumber(context.source.position, healed, {
          displayAmount: healedAmount,
          color: effect.healColor ?? '#b7f3dd',
          height: context.source.projectileHitHeight ?? 1.55
        });
      }
      if (effect.vfx === 'drain') {
        this.game.effects.spawnDrainParticles(context.target, 3);
        if (context.source?.alive) {
          this.game.effects.spawnRing(context.source.position, effect.healColor ?? '#b7f3dd', 0.42, 0.28);
        }
      }
      return;
    }

    if (effect.op === 'accumulateFocusedRange') {
      const unit = context.target;
      if (!unit?.alive || !context.buff) return;
      if (!isUnitIdleForFocus(unit)) return;
      const amount = resolveEffectNumber(effect, 'amount', context, 0);
      if (amount <= 0) return;
      context.buff.focusRangeBonus = Math.max(0, (context.buff.focusRangeBonus ?? 0) + amount);
      unit.attributes.removeModifiersBySource(focusedRangeModifierSource(context.buff.id));
      unit.attributes.addModifier({
        stat: 'attackRange',
        type: 'add',
        amount: context.buff.focusRangeBonus
      }, focusedRangeModifierSource(context.buff.id));
      this.game.effects.spawnRing(unit.position, effect.color ?? '#b7e8ff', 0.44, 0.28);
      return;
    }

    if (effect.op === 'restoreHealth') {
      if (!context.target?.alive) return;
      const amount = resolveEffectNumber(effect, 'amount', context, 0);
      const healed = context.target.restoreHealth?.(amount) ?? 0;
      this.game.effects.spawnHealNumber(context.target.position, healed, {
        displayAmount: amount,
        height: context.target.projectileHitHeight ?? 1.45
      });
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

function resolveBlockAbsorbPerDurability(effect, context) {
  const level = sourceBuffLevel(context);
  const base = Number.isFinite(effect.absorbPerDurability) ? effect.absorbPerDurability : 2;
  const perLevel = Number.isFinite(effect.absorbPerDurabilityPerLevel)
    ? effect.absorbPerDurabilityPerLevel
    : 0;
  return Math.max(0.01, base + perLevel * Math.max(0, level - 1));
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

function formatEffectAmount(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function isTrueDamage(context) {
  return context.damageTypes?.has?.('true') === true;
}

function isStatusImmune(unit, buffId) {
  return (unit?.definition?.traits ?? []).some((trait) => (
    trait.type === 'statusImmune' && (trait.statuses ?? []).includes(buffId)
  ));
}

function orderedBuffsForEvent(owner, eventName) {
  const buffs = [...owner.buffs.values()];
  if (eventName === 'modifyAttack') {
    return buffs.sort((a, b) => modifyAttackPriority(a) - modifyAttackPriority(b));
  }
  if (eventName !== 'beforeDamage') return buffs;
  return buffs.sort((a, b) => beforeDamagePriority(a) - beforeDamagePriority(b));
}

function modifyAttackPriority(buff) {
  if (buff.id === 'focus') return -50;
  if (buff.id === 'critical') return 50;
  return 0;
}

function beforeDamagePriority(buff) {
  if (buff.id === 'block') return -100;
  return 0;
}

function clearFocusedRange(unit, buff) {
  if (!unit?.attributes || !buff) return;
  buff.focusRangeBonus = 0;
  unit.attributes.removeModifiersBySource(focusedRangeModifierSource(buff.id));
}

function focusedRangeModifierSource(id) {
  return `buff:${id}:focus-range`;
}

function isUnitIdleForFocus(unit) {
  if (unit.target?.alive !== false && unit.target) return false;
  if (unit.moveGoal || unit.commandMoveGoal) return false;
  if (unit.hitStunTimer > 0) return false;
  if ((unit.knockbackVelocity?.lengthSq?.() ?? 0) > 0.0004) return false;
  return unit.visualState === 'idle' || !unit.visualState;
}

function getEnemiesOf(game, source) {
  return [...(game.friendlyUnits ?? []), ...(game.enemyUnits ?? [])].filter((unit) => (
    unit?.alive && unit.team !== source.team
  ));
}

function distance2D(a, b) {
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.z ?? 0) - (b.z ?? 0));
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
