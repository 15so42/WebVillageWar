import * as THREE from 'three';
import {
  createProjectileModel,
  getAnimationDuration,
  getAnimationEventTime,
  playUnitAnimation
} from '../art/visualRegistry.js';
import { BALANCE, ENCHANTMENTS, TEAMS } from '../data/gameData.js';
import { clamp, direction2D, distance2D } from '../utils/math.js';

const scratch = new THREE.Vector3();
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
    activeUnits.forEach((unit) => this.updateStatuses(unit, dt));
    activeUnits.forEach((unit) => this.updateUnit(unit, dt));
    this.updatePendingAttacks(dt);
    this.updateProjectiles(dt);
    this.cleanupDead();
  }

  updateStatuses(unit, dt) {
    if (unit.status.burnTime > 0) {
      unit.status.burnTime -= dt;
      unit.status.burnTick -= dt;
      if (unit.status.burnTick <= 0) {
        unit.status.burnTick = 0.45;
        unit.takeRawDamage(unit.status.burnDamagePerSecond * 0.45);
        this.game.effects.spawnFire(unit.position);
      }
    }

    unit.enchantments.forEach((value, key) => {
      value.remaining -= dt;
      if (value.remaining <= 0) {
        unit.enchantments.delete(key);
      }
    });
  }

  updateUnit(unit, dt) {
    if (!unit.alive) return;
    unit.visualState = 'idle';
    unit.attackTimer -= dt;
    const target = this.acquireTarget(unit);
    unit.target = target;

    if (target) {
      const targetPosition = target.position ?? target;
      const distance = distance2D(unit.position, targetPosition);
      if (distance <= unit.definition.attackRange) {
        this.face(unit, targetPosition);
        this.tryAttack(unit, target);
      } else {
        this.moveToward(unit, targetPosition, dt);
      }
    } else {
      this.moveToward(unit, unit.moveGoal, dt);
    }

    unit.position.addScaledVector(unit.knockbackVelocity, dt);
    unit.knockbackVelocity.multiplyScalar(Math.pow(0.08, dt));
    unit.position.x = clamp(unit.position.x, -22, 22);
    unit.position.z = clamp(unit.position.z, -20, 20);
  }

  acquireTarget(unit) {
    if (unit.team === TEAMS.PLAYER) {
      return nearestUnit(unit, this.game.enemyUnits, unit.definition.aggroRange);
    }
    const friendly = nearestUnit(unit, this.game.friendlyUnits, unit.definition.aggroRange);
    if (friendly) return friendly;
    return this.game.playerBase;
  }

  moveToward(unit, targetPosition, dt) {
    const distance = distance2D(unit.position, targetPosition);
    if (distance < 0.18) return;
    const dir = direction2D(unit.position, targetPosition);
    unit.position.addScaledVector(dir, unit.definition.speed * dt);
    unit.visualState = 'walk';
    this.face(unit, targetPosition);
  }

  face(unit, targetPosition) {
    scratch.set(targetPosition.x - unit.position.x, 0, targetPosition.z - unit.position.z);
    if (scratch.lengthSq() < 0.0001) return;
    unit.mesh.rotation.y = Math.atan2(scratch.x, scratch.z);
  }

  tryAttack(unit, target) {
    if (unit.attackTimer > 0 || unit.weapon.durability <= 0) return;
    unit.attackTimer = 1 / unit.definition.attackRate;
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
    unit.spendDurability(unit.definition.weapon.durabilityCost);
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

  resolveAttackEvent(attack) {
    const { source, target } = attack;
    if (!source.alive) return;
    if (target?.alive === false) return;
    if (target?.position && source.definition.role === 'melee') {
      const allowedRange = source.definition.attackRange + 0.85;
      if (distance2D(source.position, target.position) > allowedRange) return;
    }

    if (source.definition.role === 'ranged' && target?.alive !== false) {
      this.spawnProjectile(source, target);
      return;
    }
    this.applyAttack(source, target);
  }

  spawnProjectile(source, target) {
    const arrow = createProjectileModel('arrow', {
      color: source.hasEnchantment('fire') ? '#ffb66c' : '#e7ddc0'
    });
    arrow.position.copy(source.position);
    arrow.position.y = 1.2;
    this.game.scene.add(arrow);
    this.projectiles.push({
      object: arrow,
      source,
      target,
      speed: source.definition.projectileSpeed,
      damage: source.definition.damage,
      knockback: source.definition.knockback,
      age: 0
    });
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      projectile.age += dt;
      if (!projectile.target?.alive || projectile.age > 2.5) {
        this.game.scene.remove(projectile.object);
        this.projectiles.splice(i, 1);
        continue;
      }
      const targetPosition = projectile.target.position.clone();
      targetPosition.y = 1;
      const dir = targetPosition.sub(projectile.object.position);
      const distance = dir.length();
      if (distance < 0.34) {
        this.applyAttack(projectile.source, projectile.target, {
          damage: projectile.damage,
          knockback: projectile.knockback
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
    if (target === this.game.playerBase) {
      this.game.damagePlayerBase(source.definition.damage);
      this.game.effects.spawnHit(source.position.clone().add(new THREE.Vector3(0, 0.8, 0)));
      return;
    }

    const fire = source.hasEnchantment('fire') ? ENCHANTMENTS.fire : null;
    const damage = (override.damage ?? source.definition.damage) + (fire?.bonusDamage ?? 0);
    const knockback = override.knockback ?? source.definition.knockback;
    this.applyDamage(target, damage, source, knockback);

    if (fire) {
      target.applyBurn(fire.burnSeconds, fire.burnDamagePerSecond);
      this.game.effects.spawnFire(target.position);
    }

    if (target.hasEnchantment('thorns') && source?.alive) {
      const thorns = ENCHANTMENTS.thorns;
      source.takeRawDamage(thorns.reflectDamage);
      this.game.effects.spawnThorns(target.position);
    }
  }

  applyDamage(target, amount, source = null, knockback = 0) {
    if (!target?.alive) return;
    target.takeRawDamage(amount);
    if (source && knockback > 0) {
      const dir = direction2D(source.position, target.position);
      target.knockbackVelocity.addScaledVector(dir, knockback);
    }
    playUnitAnimation(target, 'hit');
    this.game.effects.spawnHit(
      target.position.clone().add(new THREE.Vector3(0, 0.9, 0)),
      source?.hasEnchantment?.('fire') ? '#ff9a47' : '#f6e7a0'
    );
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
