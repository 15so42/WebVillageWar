import * as THREE from 'three';
import {
  createProjectileModel,
  getAnimationDuration,
  getAnimationEventTime,
  playUnitAnimation,
  stopUnitAnimation,
  updateUnitAnimation
} from '../art/visualRegistry.js';
import { BALANCE, TEAMS } from '../data/gameData.js';
import { clamp, direction2D, distance2D } from '../utils/math.js';

const scratch = new THREE.Vector3();
const projectileLaunchPosition = new THREE.Vector3();
const projectileForward = new THREE.Vector3(0, 0, 1);

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    this.pendingAttacks = [];
  }

  update(dt) {
    const activeUnits = [...this.game.friendlyUnits, ...this.game.enemyUnits].filter(
      (unit) => unit.alive
    );
    this.game.buffs.update(dt, activeUnits);
    activeUnits.forEach((unit) => this.updateUnit(unit, dt));
    this.applyCrowdSeparation(activeUnits, dt);
    this.updatePendingAttacks(dt);
    this.updateProjectiles(dt);
    this.cleanupDead();
  }

  updateUnit(unit, dt) {
    if (!unit.alive) return;
    unit.visualState = 'idle';
    unit.attackTimer -= dt;
    unit.hitStunTimer = Math.max(0, unit.hitStunTimer - dt);

    if (unit.hitStunTimer > 0) {
      this.applyMotion(unit, dt);
      return;
    }

    if (unit.controlMode === 'hold') {
      unit.target = null;
      unit.moveGoal = null;
      unit.commandMoveGoal = null;
      this.applyMotion(unit, dt);
      return;
    }

    if (unit.controlMode === 'guard') {
      this.ensureGuardState(unit);
    }

    this.updateSupportAbilities(unit, dt);

    if (unit.commandMoveGoal) {
      if (distance2D(unit.position, unit.commandMoveGoal) > 0.65) {
        unit.target = null;
        this.moveToward(unit, unit.commandMoveGoal, dt, 0.48);
        this.applyMotion(unit, dt);
        return;
      }
      unit.commandMoveGoal = null;
    }

    const activeAttack = this.getActiveAttackFor(unit);
    if (activeAttack) {
      const targetPosition = getTargetPosition(activeAttack.target);
      if (targetPosition) {
        this.face(unit, targetPosition, dt);
      }
      this.applyMotion(unit, dt);
      return;
    }

    const target = this.acquireTarget(unit);
    unit.target = target;

    if (target) {
      if (this.shouldBreakGuardChase(unit, target)) {
        unit.target = null;
        this.returnToGuardPoint(unit, dt);
        this.applyMotion(unit, dt);
        return;
      }
      const targetPosition = getTargetPosition(target);
      const targetDistance = distance2D(unit.position, targetPosition);
      const targetRadius = targetCombatRadius(target);
      const attackRange = this.game.modifiers.getAttackRange(unit);
      if (targetDistance <= attackRange + targetRadius) {
        this.face(unit, targetPosition, dt);
        this.tryAttack(unit, target);
      } else {
        this.moveToward(
          unit,
          targetPosition,
          dt,
          target.position ? targetRadius + stopDistance(unit, this.game.modifiers) : 0.2
        );
      }
    } else if (unit.isWildlife) {
      this.updateWildlifeWander(unit, dt);
      this.moveToward(unit, unit.wanderGoal, dt, 0.55);
    } else if (unit.controlMode === 'guard') {
      this.returnToGuardPoint(unit, dt);
    } else if (unit.moveGoal) {
      this.moveToward(unit, unit.moveGoal, dt);
    }

    this.applyMotion(unit, dt);
  }

  applyMotion(unit, dt) {
    const previousX = unit.position.x;
    const previousZ = unit.position.z;
    unit.knockbackVelocity.clampLength(0, maxKnockbackVelocity(unit));
    unit.position.addScaledVector(unit.knockbackVelocity, dt);
    unit.knockbackVelocity.multiplyScalar(Math.pow(0.08, dt));
    this.clampToBattlefield(unit);
    if (!this.game.isPointWalkable(unit.position)) {
      unit.position.x = previousX;
      unit.position.z = previousZ;
      unit.knockbackVelocity.set(0, 0, 0);
    }
    this.game.placeUnitOnGround(unit, dt);
  }

  clampToBattlefield(unit) {
    unit.position.x = clamp(
      unit.position.x,
      -BALANCE.battlefield.halfWidth,
      BALANCE.battlefield.halfWidth
    );
    unit.position.z = clamp(unit.position.z, BALANCE.battlefield.minZ, BALANCE.battlefield.maxZ);
  }

  applyCrowdSeparation(units, dt) {
    const maxPush = 1.35 * dt;
    for (let i = 0; i < units.length; i += 1) {
      const a = units[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < units.length; j += 1) {
        const b = units[j];
        if (!b.alive || a.team !== b.team) continue;

        const minDistance = crowdRadius(a) + crowdRadius(b);
        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        let distance = Math.hypot(dx, dz);
        if (distance >= minDistance) continue;

        let nx = dx;
        let nz = dz;
        if (distance < 0.001) {
          const angle = deterministicPairAngle(a, b);
          nx = Math.cos(angle);
          nz = Math.sin(angle);
          distance = 0.001;
        } else {
          nx /= distance;
          nz /= distance;
        }

        const overlap = minDistance - distance;
        const push = Math.min(overlap * 0.5, maxPush);
        const ax = a.position.x;
        const az = a.position.z;
        const bx = b.position.x;
        const bz = b.position.z;
        a.position.x += nx * push;
        a.position.z += nz * push;
        b.position.x -= nx * push;
        b.position.z -= nz * push;
        this.clampToBattlefield(a);
        this.clampToBattlefield(b);
        if (!this.game.isPointWalkable(a.position)) {
          a.position.x = ax;
          a.position.z = az;
        }
        if (!this.game.isPointWalkable(b.position)) {
          b.position.x = bx;
          b.position.z = bz;
        }
        this.game.placeUnitOnGround(a, dt);
        this.game.placeUnitOnGround(b, dt);
      }
    }
  }

  updateSupportAbilities(unit, dt) {
    const support = unit.definition.support ?? {};
    if (support.heal) {
      this.updateHealAbility(unit, support.heal, dt);
    }
    if (support.cleanse) {
      this.updateCleanseAbility(unit, support.cleanse, dt);
    }
    if (support.shield) {
      this.updateShieldAbility(unit, support.shield, dt);
    }
  }

  updateHealAbility(unit, ability, dt) {
    const key = 'heal';
    const cooldown = Math.max(0.1, ability.cooldown ?? 5.5);
    const remaining = this.tickSupportCooldown(unit, key, ability, cooldown, dt);
    if (remaining > 0) return;

    const target = this.findHealTarget(unit, ability);
    if (!target) {
      unit.supportCooldowns.set(key, Math.min(0.85, cooldown));
      return;
    }

    const amount = Math.max(0, ability.amount ?? 0);
    const healed = target.restoreHealth?.(amount) ?? 0;
    if (healed <= 0) {
      unit.supportCooldowns.set(key, 0.25);
      return;
    }

    unit.supportCooldowns.set(key, cooldown);
    this.game.effects.spawnRing(target.position, '#9dffb0', 0.62, 0.5);
    this.game.effects.spawnHealNumber(target.position, healed, {
      height: target.projectileHitHeight ?? 1.55,
      duration: 0.72
    });
  }

  updateCleanseAbility(unit, ability, dt) {
    const key = 'cleanse';
    const cooldown = Math.max(0.1, ability.cooldown ?? 14);
    const remaining = this.tickSupportCooldown(unit, key, ability, cooldown, dt);
    if (remaining > 0) return;

    const target = this.findCleanseTarget(unit, ability);
    if (!target) {
      unit.supportCooldowns.set(key, Math.min(1.2, cooldown));
      return;
    }

    const count = Math.max(1, Math.floor(ability.count ?? 1));
    let removed = 0;
    for (const buff of [...target.buffs.values()]) {
      if (!isNegativeBuff(buff)) continue;
      target.removeBuff(buff.id);
      removed += 1;
      if (removed >= count) break;
    }

    if (removed > 0) {
      unit.supportCooldowns.set(key, cooldown);
      this.game.effects.spawnRing(target.position, '#dcefff', 0.7, 0.58);
      this.game.effects.spawnDamageNumber(target.position, 1, {
        text: '净化',
        color: '#e9fbff',
        stroke: '#16435a',
        height: target.projectileHitHeight ?? 1.55,
        duration: 0.78,
        fontSize: 88,
        baseHeight: 0.5,
        fadeStart: 0.62
      });
    } else {
      unit.supportCooldowns.set(key, 0.25);
    }
  }

  updateShieldAbility(unit, ability, dt) {
    const key = 'shield';
    const cooldown = Math.max(0.1, ability.cooldown ?? 5.5);
    const remaining = this.tickSupportCooldown(unit, key, ability, cooldown, dt);
    if (remaining > 0) return;

    const target = this.findShieldTarget(unit, ability);
    if (!target) {
      unit.supportCooldowns.set(key, Math.min(0.85, cooldown));
      return;
    }

    const amount = Math.max(0, ability.amount ?? 0);
    const restored = target.restoreShield?.(amount) ?? 0;
    if (restored <= 0) {
      unit.supportCooldowns.set(key, 0.25);
      return;
    }

    unit.supportCooldowns.set(key, cooldown);
    this.game.effects.spawnRing(target.position, '#b7eaff', 0.66, 0.5);
    this.game.effects.spawnDamageNumber(target.position, restored, {
      text: `护盾+${formatSupportAmount(restored)}`,
      color: '#dff8ff',
      stroke: '#12303a',
      height: target.projectileHitHeight ?? 1.55,
      duration: 0.74,
      fontSize: 82,
      baseHeight: 0.5,
      fadeStart: 0.62
    });
  }

  tickSupportCooldown(unit, key, ability, cooldown, dt) {
    let remaining = unit.supportCooldowns.get(key);
    if (!Number.isFinite(remaining)) {
      remaining = ability.initialCooldown ?? cooldown;
    }
    remaining -= dt;
    if (remaining > 0) {
      unit.supportCooldowns.set(key, remaining);
    }
    return remaining;
  }

  findHealTarget(unit, ability) {
    return this.findSupportTarget(
      unit,
      ability,
      (candidate) => candidate.health < candidate.maxHealth - 0.01,
      (candidate, distance) => {
        const missingRatio = 1 - candidate.health / Math.max(1, candidate.maxHealth);
        return missingRatio * 140 - distance;
      }
    );
  }

  findCleanseTarget(unit, ability) {
    return this.findSupportTarget(
      unit,
      ability,
      (candidate) => [...candidate.buffs.values()].some(isNegativeBuff),
      (candidate, distance) => {
        const negativeCount = [...candidate.buffs.values()].filter(isNegativeBuff).length;
        return negativeCount * 100 - distance;
      }
    );
  }

  findShieldTarget(unit, ability) {
    return this.findSupportTarget(
      unit,
      ability,
      (candidate) => candidate.maxShield > 0 && candidate.shield < candidate.maxShield - 0.01,
      (candidate, distance) => {
        const shieldRatio = candidate.shield / Math.max(1, candidate.maxShield);
        return (1 - shieldRatio) * 120 - distance;
      }
    );
  }

  findSupportTarget(unit, ability, predicate, scoreFn) {
    const candidates = unit.team === TEAMS.PLAYER ? this.game.friendlyUnits : this.game.enemyUnits;
    const range = Math.max(0, ability.range ?? 7);
    let best = null;
    let bestScore = -Infinity;
    candidates.forEach((candidate) => {
      if (!candidate.alive || !predicate(candidate)) return;
      const distance = distance2D(unit.position, candidate.position);
      if (distance > range) return;
      const score = scoreFn(candidate, distance);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    });
    return best;
  }

  acquireTarget(unit) {
    const aggroRange = this.game.modifiers.getAggroRange(unit);
    if (unit.team === TEAMS.PLAYER) {
      const guardFilter = unit.controlMode === 'guard'
        ? (target) => this.isInsideGuardRadius(unit, target)
        : null;
      return nearestUnit(unit, this.game.enemyUnits, aggroRange, guardFilter)
        ?? nearestStructure(unit, this.game.enemyCamp, aggroRange, guardFilter);
    }
    if (unit.isWildlife) {
      const friendly = nearestUnit(unit, this.game.friendlyUnits, aggroRange);
      if (
        friendly &&
        distance2D(unit.spawnPoint, friendly.position) <= unit.leashRadius + aggroRange
      ) {
        return friendly;
      }
      return null;
    }
    const friendly = nearestUnit(unit, this.game.friendlyUnits, aggroRange);
    if (friendly) return friendly;
    return nearestStructure(unit, this.game.playerBase, aggroRange);
  }

  ensureGuardState(unit) {
    if (!unit.guardPoint) {
      unit.guardPoint = unit.position.clone();
      unit.guardPoint.y = this.game.groundHeightAt(unit.guardPoint);
    }
    if (!Number.isFinite(unit.guardRadius)) {
      unit.guardRadius = Math.max(
        this.game.modifiers.getAttackRange(unit) + 0.9,
        this.game.modifiers.getAggroRange(unit)
      );
    }
  }

  shouldBreakGuardChase(unit, target) {
    if (unit.controlMode !== 'guard') return false;
    if (!unit.guardPoint || !Number.isFinite(unit.guardRadius)) return false;
    const targetPosition = getTargetPosition(target);
    if (!targetPosition) return false;
    const targetRadius = targetCombatRadius(target);
    return distance2D(unit.guardPoint, targetPosition) > unit.guardRadius + targetRadius ||
      distance2D(unit.guardPoint, unit.position) > unit.guardRadius + 0.35;
  }

  isInsideGuardRadius(unit, target) {
    if (!unit.guardPoint || !Number.isFinite(unit.guardRadius)) return true;
    const targetPosition = getTargetPosition(target);
    if (!targetPosition) return false;
    return distance2D(unit.guardPoint, targetPosition) <= unit.guardRadius + targetCombatRadius(target);
  }

  returnToGuardPoint(unit, dt) {
    if (!unit.guardPoint) return;
    if (distance2D(unit.position, unit.guardPoint) <= 0.42) return;
    this.moveToward(unit, unit.guardPoint, dt, 0.26);
  }

  moveToward(unit, targetPosition, dt, desiredDistance = 0.18) {
    if (!targetPosition) return;
    const distance = distance2D(unit.position, targetPosition);
    if (distance <= desiredDistance) return;
    const dir = direction2D(unit.position, targetPosition);
    const step = Math.min(this.game.modifiers.getMoveSpeed(unit) * dt, distance - desiredDistance);
    if (step <= 0) return;
    stopUnitAnimation(unit, 'attack');
    const previousX = unit.position.x;
    const previousZ = unit.position.z;
    unit.position.addScaledVector(dir, step);
    this.clampToBattlefield(unit);
    if (!this.game.isPointWalkable(unit.position)) {
      unit.position.x = previousX;
      unit.position.z = previousZ;
      this.game.placeUnitOnGround(unit, dt);
      return;
    }
    this.game.placeUnitOnGround(unit, dt);
    unit.visualState = 'walk';
    this.face(unit, targetPosition, dt);
  }

  updateWildlifeWander(unit, dt) {
    unit.wanderTimer = Math.max(0, (unit.wanderTimer ?? 0) - dt);
    const tooFar = distance2D(unit.position, unit.spawnPoint) > unit.leashRadius * 1.08;
    const reached = !unit.wanderGoal || distance2D(unit.position, unit.wanderGoal) < 0.85;
    if (!tooFar && !reached && unit.wanderTimer > 0) return;

    if (tooFar) {
      unit.wanderGoal = unit.spawnPoint.clone();
      unit.wanderTimer = 0.8;
      return;
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = unit.leashRadius * (0.25 + Math.random() * 0.7);
      const candidate = unit.spawnPoint.clone();
      candidate.x += Math.cos(angle) * radius;
      candidate.z += Math.sin(angle) * radius;
      if (!this.game.isPointWalkable(candidate)) continue;
      candidate.y = this.game.groundHeightAt(candidate);
      unit.wanderGoal = candidate;
      unit.wanderTimer = 1.8 + Math.random() * 2.6;
      return;
    }

    unit.wanderGoal = unit.spawnPoint.clone();
    unit.wanderTimer = 1.2;
  }

  face(unit, targetPosition, dt = 0) {
    scratch.set(targetPosition.x - unit.position.x, 0, targetPosition.z - unit.position.z);
    if (scratch.lengthSq() < 0.0001) return;
    const desired = Math.atan2(scratch.x, scratch.z);
    if (dt <= 0) {
      unit.mesh.rotation.y = desired;
      return;
    }
    const delta = shortestAngle(unit.mesh.rotation.y, desired);
    unit.mesh.rotation.y += delta * clamp(dt * 7.5, 0, 1);
  }

  tryAttack(unit, target) {
    if (unit.attackTimer > 0 || unit.weapon.durability <= 0) return;
    unit.attackTimer = 1 / this.game.modifiers.getAttackRate(unit);
    unit.visualState = 'idle';
    const eventName = unit.definition.role === 'ranged' ? 'release' : 'impact';
    const duration = getAnimationDuration(unit, 'attack');
    playUnitAnimation(unit, 'attack', duration);
    this.pendingAttacks.push({
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
  }

  getActiveAttackFor(unit) {
    return this.pendingAttacks.find((attack) => (
      attack.source === unit &&
      attack.elapsed < attack.duration &&
      attack.target?.alive !== false
    )) ?? null;
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
        this.pendingAttacks.splice(i, 1);
      }
    }
  }

  cancelPendingAttacksFor(units) {
    const ids = new Set(units.map((unit) => unit.id));
    this.pendingAttacks = this.pendingAttacks.filter((attack) => !ids.has(attack.source.id));
    units.forEach((unit) => stopUnitAnimation(unit, 'attack'));
  }

  resolveAttackEvent(attack) {
    const { source, target } = attack;
    if (!source.alive) return;
    if (target?.alive === false) return;
    if (target?.position && source.definition.role === 'melee') {
      const allowedRange =
        this.game.modifiers.getAttackRange(source) + targetCombatRadius(target) + 0.85;
      if (distance2D(source.position, target.position) > allowedRange) return;
    }

    if (source.definition.role === 'ranged' && target?.alive !== false) {
      this.syncSourcePoseForAttackEvent(attack);
      this.spawnProjectile(source, target);
      return;
    }
    this.applyAttack(source, target);
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

  spawnProjectile(source, target) {
    const projectileType = source.definition.projectileType ?? 'arrow';
    const arrow = createProjectileModel(projectileType, {
      color: resolveProjectileColor(source, projectileType)
    });
    arrow.position.copy(this.getProjectileLaunchPosition(source));
    this.game.scene.add(arrow);
    this.projectiles.push({
      object: arrow,
      source,
      target,
      speed: this.game.modifiers.getProjectileSpeed(source),
      damage: this.game.modifiers.getAttackDamage(source),
      knockback: this.game.modifiers.getKnockback(source),
      age: 0
    });
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      projectile.age += dt;
      if (projectile.target?.alive === false || projectile.age > 2.5) {
        this.game.scene.remove(projectile.object);
        this.projectiles.splice(i, 1);
        continue;
      }
      const targetPosition = projectile.target.position.clone();
      targetPosition.y += projectile.target.projectileHitHeight ?? 1;
      const dir = targetPosition.sub(projectile.object.position);
      const distance = dir.length();
      if (distance < 0.34) {
        this.applyAttack(projectile.source, projectile.target, {
          damage: projectile.damage,
          knockback: projectile.knockback,
          isProjectile: true
        });
        this.game.scene.remove(projectile.object);
        this.projectiles.splice(i, 1);
        continue;
      }
      dir.normalize();
      projectile.object.position.addScaledVector(dir, projectile.speed * dt);
      projectile.object.quaternion.setFromUnitVectors(projectileForward, dir);
    }
  }

  applyAttack(source, target, override = {}) {
    const context = this.game.modifiers.createAttackContext(source, target, override);
    this.game.buffs.modifyAttack(context);

    if (target === this.game.playerBase) {
      this.game.damagePlayerBase(context.damage);
      this.game.effects.spawnHit(source.position.clone().add(new THREE.Vector3(0, 0.8, 0)));
      return;
    }
    if (target === this.game.enemyCamp) {
      this.game.damageEnemyCamp(context.damage);
      this.game.effects.spawnHit(target.position.clone().add(new THREE.Vector3(0, 1.6, 0)));
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
    if (source && finalKnockback > 0) {
      const dir = direction2D(source.position, target.position);
      target.knockbackVelocity.addScaledVector(dir, finalKnockback);
      target.knockbackVelocity.clampLength(0, maxKnockbackVelocity(target));
      target.hitStunTimer = Math.max(target.hitStunTimer, hitStunDuration(finalKnockback));
    }
    if (!damageContext.skipHitAnimation) {
      playUnitAnimation(target, 'hit');
    }
    if (!damageContext.skipHitEffect) {
      this.game.effects.spawnHit(
        target.position.clone().add(new THREE.Vector3(0, 0.9, 0)),
        source?.hasEnchantment?.('fire') ? '#ff9a47' : '#f6e7a0'
      );
    }
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

  cleanupDead() {
    this.game.friendlyUnits = this.game.friendlyUnits.filter((unit) => {
      if (unit.alive) return true;
      this.removeDeadUnit(unit);
      return false;
    });
    this.game.enemyUnits = this.game.enemyUnits.filter((unit) => {
      if (unit.alive) return true;
      this.removeDeadUnit(unit);
      this.game.score += 1;
      return false;
    });
  }

  removeDeadUnit(unit) {
    this.game.effects.spawnDeathBurst(
      unit.position.clone(),
      Math.max(0.68, crowdRadius(unit) * 1.35)
    );
    this.game.scene.remove(unit.mesh);
    unit.statusElement?.remove();
  }
}

function nearestUnit(source, candidates, range, predicate = null) {
  let best = null;
  let bestDistance = range;
  candidates.forEach((candidate) => {
    if (!candidate.alive) return;
    if (predicate && !predicate(candidate)) return;
    const distance = Math.max(0, distance2D(source.position, candidate.position) - targetCombatRadius(candidate));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });
  return best;
}

function nearestStructure(source, structure, range, predicate = null) {
  if (!structure?.alive) return null;
  if (predicate && !predicate(structure)) return null;
  return distance2D(source.position, structure.position) <= range + targetCombatRadius(structure)
    ? structure
    : null;
}

function getTargetPosition(target) {
  if (!target) return null;
  return target.position ?? target;
}

function targetCombatRadius(target) {
  if (!target?.position) return 0;
  if (Number.isFinite(target.attackRadius)) return target.attackRadius;
  if (Number.isFinite(target.collisionRadius)) return target.collisionRadius;
  if (target.type) return crowdRadius(target);
  return 0;
}

function stopDistance(unit, modifiers) {
  const attackRange = modifiers.getAttackRange(unit);
  if (unit.definition.role === 'ranged') {
    return attackRange * 0.92;
  }
  return Math.max(0.75, attackRange * 0.88);
}

function crowdRadius(unit) {
  if (unit.type === 'ogre') return 0.78;
  if (unit.type === 'bear') return 0.72;
  if (unit.type === 'wolf') return 0.48;
  return unit.definition.role === 'ranged' ? 0.36 : 0.42;
}

function deterministicPairAngle(a, b) {
  const seed = (Math.min(a.id, b.id) * 37 + Math.max(a.id, b.id) * 61) % 360;
  return (seed / 360) * Math.PI * 2;
}

function hitStunDuration(knockback) {
  return clamp(0.08 + knockback * 0.024, 0.1, 0.24);
}

function maxKnockbackVelocity(unit) {
  if (unit.type === 'ogre') return 7;
  if (unit.type === 'bear') return 8;
  if (unit.type === 'wolf') return 9;
  return 10;
}

function isNegativeBuff(buff) {
  return buff?.negative === true;
}

function resolveProjectileColor(source, projectileType) {
  if (source.hasEnchantment?.('fire')) return '#ffb66c';
  if (source.definition?.projectileColor) return source.definition.projectileColor;
  if (projectileType === 'holyBolt') return '#e9fbff';
  return '#e7ddc0';
}

function formatSupportAmount(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function isAttackFromFront(target, source, angleDegrees = 120) {
  if (!target?.position || !source?.position || !target.mesh) return false;
  const dx = source.position.x - target.position.x;
  const dz = source.position.z - target.position.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return true;
  const forwardX = Math.sin(target.mesh.rotation.y);
  const forwardZ = Math.cos(target.mesh.rotation.y);
  const dot = (dx / length) * forwardX + (dz / length) * forwardZ;
  const threshold = Math.cos(THREE.MathUtils.degToRad(angleDegrees * 0.5));
  return dot >= threshold;
}

function shortestAngle(from, to) {
  let delta = (to - from + Math.PI) % (Math.PI * 2) - Math.PI;
  if (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
}
