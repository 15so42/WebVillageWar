import * as THREE from 'three';
import {
  createProjectileModel,
  getAnimationDuration,
  getAnimationEventTime,
  playUnitAnimation,
  stopUnitAnimation,
  updateUnitAnimation
} from '../art/visualRegistry.js';
import { TEAMS } from '../data/gameData.js';
import { disposeObject3D } from '../utils/dispose.js';
import { clamp, distance2D } from '../utils/math.js';
import {
  getTargetPosition,
  roundProfile,
  resolveProjectileColor,
  targetCombatRadius
} from './combatHelpers.js';

const projectileLaunchPosition = new THREE.Vector3();
const projectileTargetPosition = new THREE.Vector3();
const projectileTrailTargetPosition = new THREE.Vector3();
const projectileForward = new THREE.Vector3(0, 0, 1);
const linearProjectileDirection = new THREE.Vector3();
const PROJECTILE_TARGET_QUERY_PADDING = 3.2;

export class AttackSystem {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    this.pendingAttacks = [];
    this.activeAttackBySourceId = new Map();
    this.projectilePools = new Map();
    this.profile = null;
  }

  update(dt, profile = null) {
    this.profile = profile;
    this.updatePendingAttacks(dt);
    this.updateProjectiles(dt);
    this.profile = null;
  }

  tryRangedWeaponAbility(unit, target, targetDistance, targetRadius = 0) {
    const ability = unit.definition.weaponAbility?.rangedProjectile;
    if (!ability || unit.attackTimer > 0 || unit.weapon.durability <= 0) return false;
    const key = ability.key ?? 'rangedProjectile';
    if ((unit.abilityCooldowns.get(key) ?? 0) > 0) return false;
    const range = Math.max(0, ability.range ?? unit.definition.attackRange ?? 0);
    if (targetDistance > range + targetRadius) return false;
    const targetPosition = getTargetPosition(target);
    if (!targetPosition || !this.game.hasSafeSurfaceLine(unit.position, targetPosition)) return false;

    const cooldown = Math.max(0.1, ability.cooldown ?? 7);
    unit.abilityCooldowns.set(key, cooldown);
    unit.attackTimer = Math.max(unit.attackTimer, ability.attackLockSeconds ?? 0.35);
    unit.visualState = 'idle';
    const duration = getAnimationDuration(unit, 'attack');
    playUnitAnimation(unit, 'attack', duration, {
      variant: ability.animationVariant ?? 'rangedAbility'
    });
    this.queuePendingAttack({
      source: unit,
      target,
      role: 'rangedAbility',
      eventName: 'release',
      elapsed: 0,
      fired: false,
      fireAt: getAnimationEventTime(unit, 'attack', 'release'),
      duration,
      projectileOverride: {
        projectileType: ability.projectileType ?? 'dagger',
        projectileColor: ability.projectileColor,
        projectileSpeed: ability.projectileSpeed ?? unit.definition.projectileSpeed ?? 13,
        damage: this.game.modifiers.getAttackDamage(unit) * (ability.damageMultiplier ?? 1),
        attackDamageType: ability.attackDamageType ?? unit.definition.attackDamageType,
        knockback: ability.knockback ?? this.game.modifiers.getKnockback(unit),
        damageTypes: ability.damageTypes
      }
    });
    unit.spendDurability(ability.durabilityCost ?? this.game.modifiers.getDurabilityCost(unit));
    return true;
  }

  tryAttack(unit, target) {
    if (unit.attackTimer > 0 || unit.weapon.durability <= 0) return false;
    unit.attackTimer = 1 / this.game.modifiers.getAttackRate(unit);
    unit.visualState = 'idle';
    const eventName = unit.definition.role === 'ranged' ? 'release' : 'impact';
    const duration = getAnimationDuration(unit, 'attack');
    playUnitAnimation(unit, 'attack', duration, {
      variant: unit.definition.attackAnimationVariant ?? null
    });
    this.queuePendingAttack({
      source: unit,
      target,
      role: unit.definition.role,
      eventName,
      elapsed: 0,
      fired: false,
      fireAt: getAnimationEventTime(unit, 'attack', eventName),
      duration
    });
    unit.spendDurability(this.game.modifiers.getDurabilityCost(unit));
    return true;
  }

  queuePendingAttack(attack) {
    this.pendingAttacks.push(attack);
    if (attack.source?.id != null) {
      this.activeAttackBySourceId.set(attack.source.id, attack);
    }
  }

  rebuildActiveAttackIndex() {
    this.activeAttackBySourceId.clear();
    for (let i = 0; i < this.pendingAttacks.length; i += 1) {
      const attack = this.pendingAttacks[i];
      if (!isPendingAttackActive(attack)) continue;
      const sourceId = attack.source?.id;
      if (sourceId != null && !this.activeAttackBySourceId.has(sourceId)) {
        this.activeAttackBySourceId.set(sourceId, attack);
      }
    }
  }

  getActiveAttackFor(unit) {
    if (this.profile) {
      this.profile.activeAttackLookups += 1;
    }
    const attack = this.activeAttackBySourceId.get(unit.id);
    if (!isPendingAttackActive(attack) || attack.source !== unit) {
      this.activeAttackBySourceId.delete(unit.id);
      return null;
    }
    return attack;
  }

  updatePendingAttacks(dt) {
    for (let i = this.pendingAttacks.length - 1; i >= 0; i -= 1) {
      const attack = this.pendingAttacks[i];
      attack.elapsed += dt;

      if (!attack.fired && attack.elapsed >= attack.fireAt) {
        attack.fired = true;
        this.resolveAttackEvent(attack);
      }

      if (attack.elapsed >= attack.duration) {
        if (attack.source?.id != null && this.activeAttackBySourceId.get(attack.source.id) === attack) {
          this.activeAttackBySourceId.delete(attack.source.id);
        }
        this.pendingAttacks.splice(i, 1);
      }
    }
  }

  cancelPendingAttacksFor(units) {
    const ids = new Set(units.map((unit) => unit.id));
    this.pendingAttacks = this.pendingAttacks.filter((attack) => !ids.has(attack.source.id));
    ids.forEach((id) => this.activeAttackBySourceId.delete(id));
    units.forEach((unit) => stopUnitAnimation(unit, 'attack'));
  }

  resolveAttackEvent(attack) {
    const { source, target } = attack;
    if (!source.alive) return;
    if (target?.alive === false) return;
    if (!attack.projectileOverride && target?.position && source.definition.role === 'melee') {
      const allowedRange =
        this.game.modifiers.getAttackRange(source) + targetCombatRadius(target) + 0.85;
      if (distance2D(source.position, target.position) > allowedRange) return;
    }

    if (attack.projectileOverride || (source.definition.role === 'ranged' && target?.alive !== false)) {
      this.syncSourcePoseForAttackEvent(attack);
      this.spawnProjectile(source, target, attack.projectileOverride);
      return;
    }
    this.game.combat.applyAttack(source, target);
  }

  syncSourcePoseForAttackEvent(attack) {
    const animation = attack.source.visualRoot?.userData.animation;
    if (!animation || animation.name !== 'attack') return;
    animation.time = clamp(attack.fireAt, 0, attack.duration);
    updateUnitAnimation(attack.source, 0);
    attack.source.mesh.updateMatrixWorld(true);
  }

  getProjectileLaunchPosition(source) {
    const parts = source.visualRoot?.userData.parts;
    const launchPart = parts?.projectileSocket ?? parts?.heldArrow ?? parts?.rightHand;
    if (launchPart) {
      source.mesh.updateMatrixWorld(true);
      launchPart.getWorldPosition(projectileLaunchPosition);
      return projectileLaunchPosition;
    }
    projectileLaunchPosition.copy(source.position);
    projectileLaunchPosition.y = source.position.y + 1.18;
    return projectileLaunchPosition;
  }

  spawnProjectile(source, target, override = {}) {
    const projectileType = override.projectileType ?? source.definition.projectileType ?? 'arrow';
    const projectileColor = override.projectileColor ?? resolveProjectileColor(source, projectileType);
    const projectileObject = this.acquireProjectileObject(projectileType, projectileColor);
    const isGreatWaterOrb =
      projectileType === 'waterOrb' &&
      hasRuntimeTrait(source, 'greatWaterOrb') &&
      Math.random() < 0.3;
    projectileObject.scale.setScalar(isGreatWaterOrb ? 1.38 : 1);
    const launchPosition = this.getProjectileLaunchPosition(source);
    projectileObject.position.copy(launchPosition);
    projectileTrailTargetPosition.copy(target.position);
    projectileTrailTargetPosition.y = target.position.y + (target.projectileHitHeight ?? 1);
    projectileTargetPosition.copy(projectileTrailTargetPosition).sub(launchPosition);
    if (projectileTargetPosition.lengthSq() > 0.0001) {
      projectileTargetPosition.normalize();
      projectileObject.quaternion.setFromUnitVectors(projectileForward, projectileTargetPosition);
    }
    this.game.scene.add(projectileObject);

    const pierce = override.projectilePierce ?? source.definition.projectilePierce;
    const projectile = {
      object: projectileObject,
      source,
      target,
      type: projectileType,
      speed: override.projectileSpeed ?? this.game.modifiers.getProjectileSpeed(source),
      damage: (override.damage ?? this.game.modifiers.getAttackDamage(source)) * (isGreatWaterOrb ? 1.55 : 1),
      attackDamageType: override.attackDamageType ?? source.definition.attackDamageType,
      knockback: (override.knockback ?? this.game.modifiers.getKnockback(source)) * (isGreatWaterOrb ? 1.25 : 1),
      damageTypes: override.damageTypes,
      age: 0
    };

    if (pierce) {
      linearProjectileDirection.copy(target.position).sub(launchPosition);
      linearProjectileDirection.y = 0;
      if (linearProjectileDirection.lengthSq() < 0.0001) {
        linearProjectileDirection.set(Math.sin(source.mesh.rotation.y), 0, Math.cos(source.mesh.rotation.y));
      }
      linearProjectileDirection.normalize();
      projectile.mode = 'linearPierce';
      projectile.direction = linearProjectileDirection.clone();
      projectile.origin = launchPosition.clone();
      projectile.radius = pierce.radius ?? 0.75;
      projectile.maxDistance = pierce.maxDistance ?? this.game.modifiers.getAttackRange(source);
      projectile.maxAge = pierce.maxAge ?? projectile.maxDistance / Math.max(0.1, projectile.speed) + 0.6;
      projectile.hitIds = new Set();
      projectile.object.quaternion.setFromUnitVectors(projectileForward, projectile.direction);
    }

    this.projectiles.push(projectile);
    if (isGreatWaterOrb) {
      this.game.effects.spawnDamageNumber(source.position, 1, {
        text: '大水弹',
        color: '#9bdcff',
        stroke: '#183146',
        height: source.projectileHitHeight ?? 1.55,
        duration: 0.6,
        fontSize: 72,
        baseHeight: 0.44
      });
    }
  }

  updateProjectiles(dt, profile = null) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      projectile.age += dt;
      if (projectile.mode === 'linearPierce') {
        this.updateLinearPiercingProjectile(projectile, i, dt, profile);
        continue;
      }
      if (projectile.target?.alive === false || projectile.age > 2.5) {
        const removeStartedAt = profile ? performance.now() : 0;
        this.removeProjectileAt(i);
        recordProjectileProfile(profile, 'projectileRecycleMs', removeStartedAt);
        continue;
      }

      const flightStartedAt = profile ? performance.now() : 0;
      const objectPosition = projectile.object.position;
      const targetPosition = projectile.target.position;
      const dx = targetPosition.x - objectPosition.x;
      const dy = (targetPosition.y + (projectile.target.projectileHitHeight ?? 1)) - objectPosition.y;
      const dz = targetPosition.z - objectPosition.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      recordProjectileProfile(profile, 'projectileFlightMs', flightStartedAt);

      if (distanceSq < 0.1156) {
        const hitStartedAt = profile ? performance.now() : 0;
        this.game.combat.applyAttack(projectile.source, projectile.target, {
          damage: projectile.damage,
          attackDamageType: projectile.attackDamageType,
          knockback: projectile.knockback,
          damageTypes: projectile.damageTypes,
          isProjectile: true
        });
        recordProjectileProfile(profile, 'projectileHitMs', hitStartedAt);
        const removeStartedAt = profile ? performance.now() : 0;
        this.removeProjectileAt(i);
        recordProjectileProfile(profile, 'projectileRecycleMs', removeStartedAt);
        continue;
      }

      const moveStartedAt = profile ? performance.now() : 0;
      const distance = Math.sqrt(distanceSq);
      const step = projectile.speed * dt / Math.max(0.0001, distance);
      objectPosition.x += dx * step;
      objectPosition.y += dy * step;
      objectPosition.z += dz * step;
      projectileTargetPosition.set(dx / distance, dy / distance, dz / distance);
      projectile.object.quaternion.setFromUnitVectors(projectileForward, projectileTargetPosition);
      recordProjectileProfile(profile, 'projectileMoveApplyMs', moveStartedAt);
    }
  }

  updateLinearPiercingProjectile(projectile, index, dt, profile = null) {
    const flightStartedAt = profile ? performance.now() : 0;
    projectile.object.position.addScaledVector(projectile.direction, projectile.speed * dt);
    projectile.object.quaternion.setFromUnitVectors(projectileForward, projectile.direction);
    recordProjectileProfile(profile, 'projectileFlightMs', flightStartedAt);

    const traveled = distance2D(projectile.origin, projectile.object.position);
    if (traveled > projectile.maxDistance || projectile.age > projectile.maxAge) {
      const removeStartedAt = profile ? performance.now() : 0;
      this.removeProjectileAt(index);
      recordProjectileProfile(profile, 'projectileRecycleMs', removeStartedAt);
      return;
    }

    const queryStartedAt = profile ? performance.now() : 0;
    const targetTeam = projectile.source.team === TEAMS.PLAYER ? TEAMS.ENEMY : TEAMS.PLAYER;
    const targets = this.game.targeting?.query(
      targetTeam,
      projectile.object.position,
      projectile.radius + PROJECTILE_TARGET_QUERY_PADDING
    ) ?? (targetTeam === TEAMS.ENEMY ? this.game.enemyUnits : this.game.friendlyUnits);
    recordProjectileProfile(profile, 'projectileQueryMs', queryStartedAt);
    for (const target of targets) {
      if (!target.alive) continue;
      const hitKey = target.id ?? target;
      if (projectile.hitIds.has(hitKey)) continue;
      const hitRadius = projectile.radius + targetCombatRadius(target);
      if (distance2D(projectile.object.position, target.position) > hitRadius) continue;
      projectile.hitIds.add(hitKey);
      const hitStartedAt = profile ? performance.now() : 0;
      this.game.combat.applyAttack(projectile.source, target, {
        damage: projectile.damage,
        attackDamageType: projectile.attackDamageType,
        knockback: projectile.knockback,
        damageTypes: projectile.damageTypes,
        isProjectile: true
      });
      recordProjectileProfile(profile, 'projectileHitMs', hitStartedAt);
    }
  }

  removeProjectileAt(index) {
    const projectile = this.projectiles[index];
    if (!projectile) return;
    this.releaseProjectileObject(projectile.object);
    this.projectiles.splice(index, 1);
  }

  acquireProjectileObject(type, color) {
    const key = projectilePoolKey(type, color);
    const pool = this.projectilePools.get(key);
    const object = pool?.pop() ?? createProjectileModel(type, { color });
    object.userData.projectilePoolKey = key;
    object.visible = true;
    object.scale.set(1, 1, 1);
    object.rotation.set(0, 0, 0);
    object.quaternion.identity();
    return object;
  }

  releaseProjectileObject(object) {
    if (!object) return;
    this.game.scene.remove(object);
    object.visible = false;
    const key = object.userData.projectilePoolKey;
    if (!key) {
      disposeObject3D(object);
      return;
    }
    const pool = this.projectilePools.get(key) ?? [];
    this.projectilePools.set(key, pool);
    if (pool.length >= 40) {
      disposeObject3D(object);
      return;
    }
    pool.push(object);
  }

  destroy() {
    this.projectiles.forEach((projectile) => {
      this.game.scene.remove(projectile.object);
      disposeObject3D(projectile.object);
    });
    this.projectiles.length = 0;
    this.projectilePools.forEach((pool) => {
      pool.forEach((object) => disposeObject3D(object));
    });
    this.projectilePools.clear();
    this.pendingAttacks.length = 0;
    this.activeAttackBySourceId.clear();
  }
}

function projectilePoolKey(type, color) {
  return `${type}:${color}`;
}

function isPendingAttackActive(attack) {
  return Boolean(
    attack &&
    attack.source?.alive !== false &&
    attack.target?.alive !== false &&
    attack.elapsed < attack.duration
  );
}

function hasRuntimeTrait(unit, trait) {
  return unit?.runtimeTraits?.has?.(trait) === true;
}

function recordProjectileProfile(profile, key, mark) {
  if (!profile) return;
  profile[key] += roundProfile(performance.now() - mark);
}
