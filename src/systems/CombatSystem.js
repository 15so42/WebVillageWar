import * as THREE from 'three';
import { playUnitAnimation } from '../art/visualRegistry.js';
import { direction2D } from '../utils/math.js';
import {
  hitStunDuration,
  isAttackFromFront,
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

    this.game.buffs.beforeDamage(damageContext);
    this.applyInnateDamageTraits(damageContext);
    const finalDamage = Math.max(0, damageContext.damage);
    const isTrueDamage = damageContext.damageTypes.has('true');
    const isDirectHealthDamage = damageContext.damageTypes.has('directHealth');
    target.takeRawDamage(finalDamage, {
      bypassShield: isTrueDamage || isDirectHealthDamage
    });
    this.game.effects.spawnDamageNumber(target.position, finalDamage, {
      damageType: isTrueDamage ? 'true' : 'normal',
      height: damageContext.damageNumberHeight,
      duration: damageContext.damageNumberDuration
    });

    const finalKnockback = damageContext.knockback;
    damageContext.damageDealt = finalDamage;

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
    this.game.effects.spawnDamageNumber(context.target.position, 1, {
      text: '闪避',
      color: '#dff8ff',
      stroke: '#12303a',
      height: context.target.projectileHitHeight ?? 1.45,
      duration: 0.62,
      fontSize: 92,
      baseHeight: 0.5,
      fadeStart: 0.58
    });
    this.game.effects.spawnRing(context.target.position, '#dff8ff', 0.55, 0.34);
    return true;
  }

  applyInnateDamageTraits(context) {
    if (!context.target?.definition?.traits?.length) return;
    if (!context.isAttack || context.damageTypes?.has?.('true')) return;
    context.target.definition.traits.forEach((trait) => {
      if (trait.type !== 'frontGuard') return;
      if (!isAttackFromFront(context.target, context.source, trait.angleDegrees ?? 120)) return;
      const reduction = Math.max(0, trait.reduction ?? 0);
      if (reduction <= 0 || context.damage <= 0) return;
      context.damage = Math.max(0, context.damage - reduction);
      this.game.effects.spawnRing(context.target.position, '#d9d2a2', 0.48, 0.32);
    });
  }

  applySourceAttackTraits(context) {
    if (!context.source?.definition?.traits?.length) return;
    if (!context.isAttack || context.damageTypes?.has?.('true')) return;
    context.source.definition.traits.forEach((trait) => {
      if (trait.type !== 'damageMultiplierVsFamily') return;
      if (context.target?.definition?.family !== trait.family) return;
      context.damage *= trait.multiplier ?? 1;
    });
  }
}
