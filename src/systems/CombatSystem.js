import * as THREE from 'three';
import { playUnitAnimation } from '../art/visualRegistry.js';
import { direction2D, distance2D } from '../utils/math.js';
import {
  hitStunDuration,
  isStaticUnit,
  maxKnockbackVelocity
} from './combatHelpers.js';

const scratch = new THREE.Vector3();
const NAV_DISTANCE_CACHE_LIMIT = 2048;

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.navDistanceCache = new Map();
    this.lastProfile = null;
  }

  update() {
    if (this.navDistanceCache.size > NAV_DISTANCE_CACHE_LIMIT) {
      this.navDistanceCache.clear();
    }
    this.lastProfile = null;
  }

  getActiveAttackFor(unit) {
    return this.game.attacks?.getActiveAttackFor?.(unit) ?? null;
  }

  cancelPendingAttacksFor(units) {
    this.game.attacks?.cancelPendingAttacksFor?.(units);
  }

  destroy() {
    this.navDistanceCache.clear();
  }

  applyAttack(source, target, override = {}) {
    const context = this.game.modifiers.createAttackContext(source, target, override);
    this.game.buffs.modifyAttack(context);
    this.applySourceAttackTraits(context);

    if (target === this.game.playerBase) {
      this.game.damagePlayerBase(context.damage);
      scratch.copy(source.position);
      scratch.y += 0.8;
      this.game.effects.spawnHit(scratch);
      return;
    }
    if (target === this.game.enemyCamp) {
      this.game.damageEnemyCamp(context.damage);
      scratch.copy(target.position);
      scratch.y += 1.6;
      this.game.effects.spawnHit(scratch);
      return;
    }

    if (this.applyDamage(target, context.damage, source, context.knockback, context)) {
      this.game.buffs.afterDamage(context);
      this.applyPostAttackRuntimeTraits(context);
    }
  }

  applyDamage(target, amount, source = null, knockback = 0, context = {}) {
    if (!target?.alive) return false;
    const damageContext = context;
    damageContext.game = damageContext.game ?? this.game;
    damageContext.source = damageContext.source ?? source;
    damageContext.target = damageContext.target ?? target;
    damageContext.damage = Number.isFinite(damageContext.damage) ? damageContext.damage : amount;
    damageContext.knockback = Number.isFinite(damageContext.knockback)
      ? damageContext.knockback
      : knockback;
    damageContext.damageTypes = damageContext.damageTypes instanceof Set
      ? damageContext.damageTypes
      : new Set(damageContext.damageTypes ?? []);

    if (this.tryDodgeDamage(damageContext)) {
      return false;
    }

    this.applyDefenseReduction(damageContext);
    this.game.buffs.beforeDamage(damageContext);
    this.applyDefenderRuntimeTraits(damageContext);
    const finalDamage = Math.max(0, damageContext.damage);
    const isTrueDamage = damageContext.damageTypes.has('true');
    const isDirectHealthDamage = damageContext.damageTypes.has('directHealth');
    target.takeRawDamage(finalDamage, {
      bypassShield: isTrueDamage || isDirectHealthDamage
    });
    this.game.effects.spawnDamageNumber(target.position, finalDamage, {
      damageType: damageNumberType(damageContext, isTrueDamage),
      height: damageContext.damageNumberHeight,
      duration: damageContext.damageNumberDuration
    });

    const knockbackResistance = this.game.modifiers.getKnockbackResistance(target);
    const finalKnockback = Math.max(0, damageContext.knockback * (1 - knockbackResistance));
    damageContext.damageDealt = finalDamage;
    damageContext.knockbackApplied = finalKnockback;

    if (source && finalKnockback > 0 && !isStaticUnit(target)) {
      const dir = direction2D(source.position, target.position);
      target.knockbackVelocity.addScaledVector(dir, finalKnockback);
      target.knockbackVelocity.clampLength(0, maxKnockbackVelocity(target));
      target.hitStunTimer = Math.max(target.hitStunTimer, hitStunDuration(finalKnockback));
      this.game.pathfinding?.clear?.(target);
    }
    if (!damageContext.skipHitAnimation) {
      playUnitAnimation(target, 'hit');
    }
    if (!damageContext.skipHitEffect) {
      scratch.copy(target.position);
      scratch.y += 0.9;
      this.game.effects.spawnHit(
        scratch,
        source?.hasEnchantment?.('fire') ? '#ff9a47' : '#f6e7a0'
      );
    }
    if (target.alive === false) {
      this.game.handleUnitDeath?.(target, source);
    }
    return true;
  }

  tryDodgeDamage(context) {
    if (!context.isAttack || context.damageTypes?.has?.('true')) return false;
    if (context.damageTypes?.has?.('undodgeable')) return false;
    if (!context.source || !context.target?.attributes || context.target.isBuilding) return false;
    const chance = this.game.modifiers.getDodgeChance(context.target);
    if (chance <= 0 || Math.random() >= chance) return false;
    this.spawnDodgeFeedback(context.target);
    return true;
  }

  spawnDodgeFeedback(target) {
    this.game.effects.spawnDamageNumber(target.position, 1, {
      text: '闪避',
      color: '#dff8ff',
      stroke: '#12303a',
      height: (target.projectileHitHeight ?? 1.45) + 0.18,
      duration: 0.78,
      fontSize: 108,
      strokeWidth: 18,
      baseHeight: 0.62,
      fadeStart: 0.64
    });
    this.game.effects.spawnRing(target.position, '#dff8ff', 0.55, 0.34);
  }

  applyDefenseReduction(context) {
    if (context.damageTypes?.has?.('true')) return;
    if (!context.target?.attributes) return;
    const defenseType = defenseDamageType(context);
    if (!defenseType) return;
    const defense = defenseType === 'magic'
      ? this.game.modifiers.getMagicResistance(context.target)
      : this.game.modifiers.getArmor(context.target);
    if (!Number.isFinite(defense) || Math.abs(defense) <= 0.001) return;
    const pierce = Math.min(0.85, Math.max(0, context.defensePierce ?? 0));
    const effectiveDefense = defense * (1 - pierce);
    context.damage = Math.max(0, context.damage - effectiveDefense);
    context.defenseApplied = effectiveDefense;
  }

  applySourceAttackTraits(context) {
    if (!context.isAttack || context.damageTypes?.has?.('true')) return;
    (context.source?.definition?.traits ?? []).forEach((trait) => {
      if (trait.type !== 'damageMultiplierVsFamily') return;
      if (context.target?.definition?.family !== trait.family) return;
      context.damage *= trait.multiplier ?? 1;
    });
    this.applyRuntimeSourceAttackTraits(context);
  }

  applyRuntimeSourceAttackTraits(context) {
    const source = context.source;
    const target = context.target;
    if (!source?.runtimeTraits?.size || !target?.position) return;
    if (hasRuntimeTrait(source, 'armorPierce')) {
      context.defensePierce = Math.max(context.defensePierce ?? 0, 0.35);
    }
    if (hasRuntimeTrait(source, 'heavyBolt') && Math.random() < 0.28) {
      context.damage *= 1.5;
      context.knockback *= 1.35;
      this.spawnTraitText(source, '重矢', '#dff8ff');
    }
    if (hasRuntimeTrait(source, 'warcryDamage')) {
      const enemies = source.team === 'player' ? this.game.enemyUnits : this.game.friendlyUnits;
      const count = enemies.filter((unit) => (
        unit.alive && unit.position && distance2D(unit.position, source.position) <= 3.2
      )).length;
      context.damage += Math.min(4, count);
    }
    if (hasRuntimeTrait(source, 'backstab') && isTargetEngagedByOtherAlly(this.game, source, target)) {
      context.damage *= 1.35;
    }
  }

  applyDefenderRuntimeTraits(context) {
    const target = context.target;
    if (!context.isAttack || !hasRuntimeTrait(target, 'holyShield')) return;
    if (Math.random() >= 0.1) return;
    const restored = target.restoreShield?.(10) ?? 0;
    if (restored <= 0.01) return;
    this.game.effects.spawnRing(target.position, '#ffe0a3', 0.68, 0.42);
    this.game.effects.spawnDamageNumber(target.position, 1, {
      text: `圣盾+${Math.round(restored)}`,
      color: '#ffe0a3',
      stroke: '#4a2506',
      height: (target.projectileHitHeight ?? 1.45) + 0.12,
      duration: 0.72,
      fontSize: 76,
      baseHeight: 0.48
    });
  }

  applyPostAttackRuntimeTraits(context) {
    const source = context.source;
    const target = context.target;
    const dealt = context.damageDealt ?? 0;
    if (!context.isAttack || dealt <= 0 || !source?.alive || !target?.position) return;
    if (hasRuntimeTrait(source, 'shieldBash') && target.alive && Math.random() < 0.3) {
      this.game.buffs.applyBuff(target, 'stunned', source, { duration: 0.7 });
      this.spawnTraitText(target, '眩晕', '#ffd166');
    }
    if (hasRuntimeTrait(source, 'sunderArmor') && target.alive) {
      this.game.buffs.applyBuff(target, 'armorShredded', source, { duration: 3 });
    }
    if (hasRuntimeTrait(source, 'flurryStrike') && target.alive && Math.random() < 0.22) {
      this.game.combat.applyDamage(target, dealt * 0.45, source, 0, {
        damage: dealt * 0.45,
        source,
        target,
        defenseDamageType: context.attackDamageType ?? 'physical',
        isAttack: false,
        skipHitAnimation: true,
        damageNumberHeight: target.projectileHitHeight ?? 1.45,
        damageNumberDuration: 0.58
      });
      this.spawnTraitText(source, '连击', '#ffd166');
    }
    if (hasRuntimeTrait(source, 'intimidate') && target.alive && Math.random() < 0.3) {
      this.game.buffs.applyBuff(target, 'weakenedAttack', source, { duration: 3.5 });
    }
    if (hasRuntimeTrait(source, 'bloodthirst')) {
      const healed = source.restoreHealth?.(dealt * 0.18) ?? 0;
      if (healed > 0.01) {
        this.game.effects.spawnHealNumber(source.position, healed, {
          displayAmount: dealt * 0.18,
          color: '#ff9b9b',
          height: source.projectileHitHeight ?? 1.55
        });
      }
    }
    if (hasRuntimeTrait(source, 'cleave') && Math.random() < 0.35) {
      this.applyCleaveDamage(source, target, dealt * 0.35);
    }
    if (hasRuntimeTrait(source, 'markTarget') && target.alive) {
      this.game.buffs.applyBuff(target, 'marked', source, { duration: 3.5 });
    }
    if (hasRuntimeTrait(source, 'waterSnare') && target.alive) {
      this.game.buffs.applyBuff(target, 'waterSnared', source, { duration: 2.4 });
    }
    if (hasRuntimeTrait(source, 'smokeStep')) {
      this.game.buffs.applyBuff(source, 'smokeDodge', source, { duration: 1.2, level: 1 });
    }
  }

  applyCleaveDamage(source, centerTarget, damage) {
    const enemies = source.team === 'player' ? this.game.enemyUnits : this.game.friendlyUnits;
    let hit = 0;
    enemies.forEach((unit) => {
      if (!unit.alive || unit === centerTarget || distance2D(unit.position, centerTarget.position) > 2.1) return;
      hit += 1;
      this.game.combat.applyDamage(unit, damage, source, 0.35, {
        damage,
        source,
        target: unit,
        defenseDamageType: 'physical',
        isAttack: false,
        skipHitAnimation: true,
        damageNumberHeight: unit.projectileHitHeight ?? 1.45,
        damageNumberDuration: 0.58
      });
    });
    if (hit > 0) {
      this.game.effects.spawnRing(centerTarget.position, '#ffb45c', 2.1, 0.36);
    }
  }

  spawnTraitText(unit, text, color) {
    this.game.effects.spawnDamageNumber(unit.position, 1, {
      text,
      color,
      stroke: '#17201f',
      height: unit.projectileHitHeight ?? 1.55,
      duration: 0.62,
      fontSize: 76,
      baseHeight: 0.46
    });
  }
}

function damageNumberType(context, isTrueDamage) {
  if (isTrueDamage) return 'true';
  return defenseDamageType(context) === 'magic' ? 'magic' : 'normal';
}

function defenseDamageType(context) {
  const type = context.defenseDamageType ?? (context.isAttack ? context.attackDamageType : null);
  if (type === 'magic') return 'magic';
  if (type === 'physical') return 'physical';
  return null;
}

function hasRuntimeTrait(unit, trait) {
  return unit?.runtimeTraits?.has?.(trait) === true;
}

function isTargetEngagedByOtherAlly(game, source, target) {
  const allies = source.team === 'player' ? game.friendlyUnits : game.enemyUnits;
  return allies.some((unit) => (
    unit.alive &&
    unit !== source &&
    unit.target === target &&
    distance2D(unit.position, target.position) <= 2.2
  ));
}
