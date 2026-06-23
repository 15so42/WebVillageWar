import * as THREE from 'three';
import {
  createProjectileModel,
  getAnimationDuration,
  getAnimationEventTime,
  playUnitAnimation,
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

    if (unit.commandMoveGoal) {
      if (distance2D(unit.position, unit.commandMoveGoal) > 0.65) {
        unit.target = null;
        this.moveToward(unit, unit.commandMoveGoal, dt, 0.48);
        this.applyMotion(unit, dt);
        return;
      }
      unit.commandMoveGoal = null;
    }

    const target = this.acquireTarget(unit);
    unit.target = target;

    if (target) {
      const targetPosition = target.position ?? target;
      const targetDistance = distance2D(unit.position, targetPosition);
      if (targetDistance <= unit.definition.attackRange) {
        this.face(unit, targetPosition, dt);
        this.tryAttack(unit, target);
      } else if (this.shouldHoldMeleeRecovery(unit, targetDistance)) {
        this.face(unit, targetPosition, dt);
      } else {
        this.moveToward(
          unit,
          targetPosition,
          dt,
          target.position ? stopDistance(unit) : 0.2
        );
      }
    } else if (unit.isWildlife) {
      this.updateWildlifeWander(unit, dt);
      this.moveToward(unit, unit.wanderGoal, dt, 0.55);
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

  acquireTarget(unit) {
    if (unit.team === TEAMS.PLAYER) {
      return nearestUnit(unit, this.game.enemyUnits, unit.definition.aggroRange)
        ?? nearestStructure(unit, this.game.enemyCamp, unit.definition.aggroRange);
    }
    if (unit.isWildlife) {
      const friendly = nearestUnit(unit, this.game.friendlyUnits, unit.definition.aggroRange);
      if (
        friendly &&
        distance2D(unit.spawnPoint, friendly.position) <= unit.leashRadius + unit.definition.aggroRange
      ) {
        return friendly;
      }
      return null;
    }
    const friendly = nearestUnit(unit, this.game.friendlyUnits, unit.definition.aggroRange);
    if (friendly) return friendly;
    return nearestStructure(unit, this.game.playerBase, unit.definition.aggroRange);
  }

  moveToward(unit, targetPosition, dt, desiredDistance = 0.18) {
    if (!targetPosition) return;
    const distance = distance2D(unit.position, targetPosition);
    if (distance <= desiredDistance) return;
    const dir = direction2D(unit.position, targetPosition);
    const step = Math.min(this.game.modifiers.getMoveSpeed(unit) * dt, distance - desiredDistance);
    if (step <= 0) return;
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

  shouldHoldMeleeRecovery(unit, distance) {
    return (
      unit.definition.role === 'melee' &&
      unit.attackTimer > 0 &&
      distance <= unit.definition.attackRange + 0.75
    );
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
  }

  resolveAttackEvent(attack) {
    const { source, target } = attack;
    if (!source.alive) return;
    if (target?.alive === false) return;
    if (target?.position && source.definition.role === 'melee') {
      const allowedRange = source.definition.attackRange + 0.85;
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
    const launchPart = parts?.heldArrow ?? parts?.rightHand;
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
    const arrow = createProjectileModel('arrow', {
      color: source.hasEnchantment('fire') ? '#ffb66c' : '#e7ddc0'
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

  applyDamage(target, amount, source = null, knockback = 0) {
    if (!target?.alive) return false;
    target.takeRawDamage(amount);
    if (source && knockback > 0) {
      const dir = direction2D(source.position, target.position);
      target.knockbackVelocity.addScaledVector(dir, knockback);
      target.knockbackVelocity.clampLength(0, maxKnockbackVelocity(target));
      target.hitStunTimer = Math.max(target.hitStunTimer, hitStunDuration(knockback));
    }
    playUnitAnimation(target, 'hit');
    this.game.effects.spawnHit(
      target.position.clone().add(new THREE.Vector3(0, 0.9, 0)),
      source?.hasEnchantment?.('fire') ? '#ff9a47' : '#f6e7a0'
    );
    return true;
  }

  cleanupDead() {
    this.game.friendlyUnits = this.game.friendlyUnits.filter((unit) => {
      if (unit.alive) return true;
      this.game.scene.remove(unit.mesh);
      return false;
    });
    this.game.enemyUnits = this.game.enemyUnits.filter((unit) => {
      if (unit.alive) return true;
      this.game.scene.remove(unit.mesh);
      this.game.score += 1;
      return false;
    });
  }
}

function nearestUnit(source, candidates, range) {
  let best = null;
  let bestDistance = range;
  candidates.forEach((candidate) => {
    if (!candidate.alive) return;
    const distance = distance2D(source.position, candidate.position);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });
  return best;
}

function nearestStructure(source, structure, range) {
  if (!structure?.alive) return null;
  return distance2D(source.position, structure.position) <= range ? structure : null;
}

function stopDistance(unit) {
  if (unit.definition.role === 'ranged') {
    return unit.definition.attackRange * 0.92;
  }
  return Math.max(0.75, unit.definition.attackRange * 0.88);
}

function crowdRadius(unit) {
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
  if (unit.type === 'bear') return 8;
  if (unit.type === 'wolf') return 9;
  return 10;
}

function shortestAngle(from, to) {
  let delta = (to - from + Math.PI) % (Math.PI * 2) - Math.PI;
  if (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
}
