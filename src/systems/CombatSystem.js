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
import { disposeObject3D } from '../utils/dispose.js';
import { clamp, direction2D, distance2D } from '../utils/math.js';

const scratch = new THREE.Vector3();
const projectileLaunchPosition = new THREE.Vector3();
const projectileForward = new THREE.Vector3(0, 0, 1);
const linearProjectileDirection = new THREE.Vector3();
const NAV_DISTANCE_CACHE_CELL = 0.75;
const NAV_DISTANCE_CACHE_LIMIT = 2048;
const TARGET_RESCAN_INTERVAL = 0.24;
const TARGET_IDLE_RESCAN_INTERVAL = 0.42;
const TARGET_RESCAN_JITTER = 0.14;
const NAVIGATION_TARGET_EPSILON = 0.04;
const SEPARATION_QUERY_RADIUS = 1.9;
const SEPARATION_QUADTREE_CAPACITY = 8;
const SEPARATION_QUADTREE_MAX_DEPTH = 7;

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    this.pendingAttacks = [];
    this.navDistanceCache = new Map();
    this.lastProfile = null;
    this.separationStats = createSeparationStats();
    this.separationBounds = separationWorldBounds();
    this.separationTrees = new Map();
    this.separationCandidates = [];
  }

  update(dt) {
    const profile = this.game.perfDebugEnabled ? createCombatProfile() : null;
    this.frameProfile = profile;
    let profileMark = profile ? performance.now() : 0;
    if (this.navDistanceCache.size > NAV_DISTANCE_CACHE_LIMIT) {
      this.navDistanceCache.clear();
    }
    const activeUnits = [];
    this.game.friendlyUnits.forEach((unit) => {
      if (unit.alive) activeUnits.push(unit);
    });
    this.game.enemyUnits.forEach((unit) => {
      if (unit.alive) activeUnits.push(unit);
    });
    profileMark = recordCombatProfile(profile, 'collectMs', profileMark);
    this.game.buffs.update(dt, activeUnits);
    profileMark = recordCombatProfile(profile, 'buffsMs', profileMark);
    activeUnits.forEach((unit) => this.updateUnit(unit, dt));
    profileMark = recordCombatProfile(profile, 'unitsMs', profileMark);
    this.applyCrowdSeparation(activeUnits, dt);
    profileMark = recordCombatProfile(profile, 'separationMs', profileMark);
    this.updatePendingAttacks(dt);
    profileMark = recordCombatProfile(profile, 'pendingMs', profileMark);
    this.updateProjectiles(dt);
    profileMark = recordCombatProfile(profile, 'projectilesMs', profileMark);
    this.cleanupDead();
    recordCombatProfile(profile, 'cleanupMs', profileMark);
    if (profile) {
      profile.units = activeUnits.length;
      profile.separationChecks = this.separationStats.checks;
      profile.separationPushes = this.separationStats.pushes;
      profile.separationBuckets = this.separationStats.buckets;
      this.lastProfile = profile;
    }
    this.frameProfile = null;
  }

  updateUnit(unit, dt) {
    if (!unit.alive) return;
    unit.visualState = 'idle';
    unit.attackTimer -= dt;
    this.tickAbilityCooldowns(unit, dt);
    unit.hitStunTimer = Math.max(0, unit.hitStunTimer - dt);

    if (unit.underConstruction) {
      this.applyMotion(unit, dt);
      return;
    }

    if (isImmobileUnit(unit)) {
      unit.target = null;
      unit.moveGoal = null;
      unit.commandMoveGoal = null;
      unit.knockbackVelocity.set(0, 0, 0);
      return;
    }

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

    const target = this.targetForUnit(unit, dt);

    if (target) {
      if (this.shouldBreakGuardChase(unit, target)) {
        unit.target = null;
        this.returnToGuardPoint(unit, dt);
        this.applyMotion(unit, dt);
        return;
      }
      const targetPosition = getTargetPosition(target);
      const targetDistance = this.attackDistance(unit, targetPosition);
      const targetRadius = targetCombatRadius(target);
      const attackRange = this.game.modifiers.getAttackRange(unit);
      if (this.tryRangedWeaponAbility(unit, target, targetDistance, targetRadius)) {
        this.applyMotion(unit, dt);
        return;
      }
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
    if (unit.isBuilding || unit.definition.canMove === false) {
      unit.knockbackVelocity.set(0, 0, 0);
      return;
    }
    const previousX = unit.position.x;
    const previousZ = unit.position.z;
    const knockbackBeforeMove = unit.knockbackVelocity.lengthSq();
    unit.knockbackVelocity.clampLength(0, maxKnockbackVelocity(unit));
    unit.position.addScaledVector(unit.knockbackVelocity, dt);
    unit.knockbackVelocity.multiplyScalar(Math.pow(0.08, dt));
    this.clampToBattlefield(unit);
    if (!this.game.isPointWalkable(unit.position, {
      allowUnsafeSurface: knockbackBeforeMove > 0.0004
    })) {
      unit.position.x = previousX;
      unit.position.z = previousZ;
      unit.knockbackVelocity.set(0, 0, 0);
    }
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
    const trees = this.separationTrees;
    const stats = createSeparationStats();
    trees.forEach((tree) => tree.clear(this.separationBounds));
    units.forEach((unit) => {
      if (!unit.alive) return;
      let tree = trees.get(unit.team);
      if (!tree) {
        tree = new SeparationQuadtree(this.separationBounds);
        trees.set(unit.team, tree);
      }
      tree.insert(unit);
    });
    trees.forEach((tree) => {
      stats.buckets += tree.countNodes();
    });

    for (let i = 0; i < units.length; i += 1) {
      const a = units[i];
      if (!a.alive) continue;
      const tree = trees.get(a.team);
      if (!tree) continue;
      const candidates = this.separationCandidates;
      candidates.length = 0;
      tree.query(
        a.position.x - SEPARATION_QUERY_RADIUS,
        a.position.z - SEPARATION_QUERY_RADIUS,
        SEPARATION_QUERY_RADIUS * 2,
        SEPARATION_QUERY_RADIUS * 2,
        candidates
      );
      for (let j = 0; j < candidates.length; j += 1) {
        const b = candidates[j];
        if (!b.alive || a.id >= b.id) continue;
        stats.checks += 1;
        if (this.separatePair(a, b, maxPush)) {
          stats.pushes += 1;
        }
      }
    }
    this.separationStats = stats;
  }

  separatePair(a, b, maxPush) {
    const minDistance = crowdRadius(a) + crowdRadius(b);
    const dx = a.position.x - b.position.x;
    const dz = a.position.z - b.position.z;
    let distanceSq = dx * dx + dz * dz;
    if (distanceSq >= minDistance * minDistance) return false;

    let distance = Math.sqrt(distanceSq);
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
    const aStatic = a.isBuilding || a.definition.canMove === false || isImmobileUnit(a);
    const bStatic = b.isBuilding || b.definition.canMove === false || isImmobileUnit(b);
    if (aStatic && bStatic) return false;
    const push = Math.min(overlap * (aStatic || bStatic ? 1 : 0.5), maxPush);
    const ax = a.position.x;
    const az = a.position.z;
    const bx = b.position.x;
    const bz = b.position.z;
    if (!aStatic) {
      a.position.x += nx * push;
      a.position.z += nz * push;
    }
    if (!bStatic) {
      b.position.x -= nx * push;
      b.position.z -= nz * push;
    }
    this.clampToBattlefield(a);
    this.clampToBattlefield(b);
    if (!aStatic && !this.game.isPointWalkable(a.position)) {
      a.position.x = ax;
      a.position.z = az;
    }
    if (!bStatic && !this.game.isPointWalkable(b.position)) {
      b.position.x = bx;
      b.position.z = bz;
    }
    return true;
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
    if (support.repairAura) {
      this.updateRepairAura(unit, support.repairAura, dt);
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
    if (amount <= 0) {
      unit.supportCooldowns.set(key, 0.25);
      return;
    }

    unit.supportCooldowns.set(key, cooldown);
    this.game.effects.spawnRing(target.position, '#9dffb0', 0.62, 0.5);
    this.game.effects.spawnHealNumber(target.position, healed, {
      displayAmount: amount,
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

  tickAbilityCooldowns(unit, dt) {
    if (!unit.abilityCooldowns?.size) return;
    unit.abilityCooldowns.forEach((remaining, key) => {
      unit.abilityCooldowns.set(key, Math.max(0, remaining - dt));
    });
  }

  updateRepairAura(unit, ability, dt) {
    const key = 'repairAura';
    const cooldown = Math.max(0.1, ability.tickInterval ?? 1);
    const remaining = this.tickSupportCooldown(unit, key, ability, cooldown, dt);
    if (remaining > 0) return;

    const targets = this.findRepairAuraTargets(unit, ability);
    if (!targets.length) {
      unit.supportCooldowns.set(key, Math.min(0.5, cooldown));
      return;
    }

    const amount = Math.max(0, ability.amount ?? 0);
    let restoredTotal = 0;
    targets.forEach((target) => {
      const restored = target.restoreDurability?.(amount) ?? 0;
      restoredTotal += restored;
      if (restored > 0.01) {
        this.game.effects.spawnRing(target.position, '#9dd8ff', 0.42, 0.28);
      }
    });

    if (restoredTotal > 0.01) {
      unit.supportCooldowns.set(key, cooldown);
      this.game.effects.spawnRing(unit.position, '#9dd8ff', 0.66, 0.44);
      this.game.effects.spawnDamageNumber(unit.position, 1, {
        text: `修缮+${formatSupportAmount(restoredTotal)}`,
        color: '#dff8ff',
        stroke: '#12303a',
        height: unit.projectileHitHeight ?? 1.55,
        duration: 0.72,
        fontSize: 78,
        baseHeight: 0.48,
        fadeStart: 0.62
      });
    } else {
      unit.supportCooldowns.set(key, 0.25);
    }
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
    playUnitAnimation(unit, 'attack', duration);
    this.pendingAttacks.push({
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
        projectileSpeed: ability.projectileSpeed ?? unit.definition.projectileSpeed ?? 13,
        damage: this.game.modifiers.getAttackDamage(unit) * (ability.damageMultiplier ?? 1),
        knockback: ability.knockback ?? this.game.modifiers.getKnockback(unit),
        damageTypes: ability.damageTypes
      }
    });
    unit.spendDurability(ability.durabilityCost ?? this.game.modifiers.getDurabilityCost(unit));
    return true;
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
      (candidate) => candidate.alive && !candidate.isBuilding && !candidate.underConstruction,
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

  findRepairAuraTargets(unit, ability) {
    const candidates = unit.team === TEAMS.PLAYER ? this.game.friendlyUnits : this.game.enemyUnits;
    const range = Math.max(0, ability.range ?? 5.4);
    const maxTargets = Math.max(1, Math.floor(ability.maxTargets ?? 4));
    return candidates
      .filter((candidate) => {
        if (!candidate.alive || candidate === unit || candidate.underConstruction) return false;
        if (!candidate.weapon || candidate.weapon.durability >= candidate.weapon.maxDurability - 0.01) return false;
        return distance2D(unit.position, candidate.position) <= range;
      })
      .sort((a, b) => {
        const missingA = a.weapon.maxDurability - a.weapon.durability;
        const missingB = b.weapon.maxDurability - b.weapon.durability;
        return missingB - missingA;
      })
      .slice(0, maxTargets);
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
      return this.nearestReachableUnit(unit, this.game.enemyUnits, aggroRange, guardFilter)
        ?? this.nearestReachableStructure(unit, this.game.enemyCamp, aggroRange, guardFilter);
    }
    if (unit.isWildlife) {
      const friendly = this.nearestReachableUnit(unit, this.game.friendlyUnits, aggroRange);
      if (
        friendly &&
        distance2D(unit.spawnPoint, friendly.position) <= unit.leashRadius + aggroRange
      ) {
        return friendly;
      }
      return null;
    }
    const friendly = this.nearestReachableUnit(unit, this.game.friendlyUnits, aggroRange);
    if (friendly) return friendly;
    return this.nearestReachableStructure(unit, this.game.playerBase, aggroRange);
  }

  targetForUnit(unit, dt) {
    unit.targetSearchTimer = Math.max(0, (unit.targetSearchTimer ?? targetSearchDelay(unit, 0)) - dt);
    const current = unit.target?.alive !== false ? unit.target : null;
    if (unit.targetSearchTimer > 0) {
      return current;
    }

    const startedAt = this.frameProfile ? performance.now() : 0;
    const target = this.acquireTarget(unit);
    if (this.frameProfile) {
      this.frameProfile.targetSearches += 1;
      this.frameProfile.targetingMs += roundCombatProfile(performance.now() - startedAt);
    }
    unit.target = target;
    unit.targetSearchTimer = target
      ? targetSearchDelay(unit, TARGET_RESCAN_INTERVAL)
      : targetSearchDelay(unit, TARGET_IDLE_RESCAN_INTERVAL);
    return target;
  }

  navigationDistance(from, to) {
    if (!from || !to) return Infinity;
    if (this.game.world?.config?.theme === 'dungeon' && this.game.world?.navigationDistance) {
      const key = navigationDistanceCacheKey(from, to);
      const cached = this.navDistanceCache.get(key);
      if (cached != null) return cached;
      const distance = this.game.world.navigationDistance(from, to);
      this.navDistanceCache.set(key, distance);
      return distance;
    }
    return distance2D(from, to);
  }

  attackDistance(source, targetPosition) {
    if (!source || !targetPosition) return Infinity;
    const directDistance = distance2D(source.position, targetPosition);
    if (source.definition.role === 'ranged') {
      return directDistance;
    }
    if (this.game.hasSafeSurfaceLine(source.position, targetPosition)) {
      return directDistance;
    }
    return this.navigationDistance(source.position, targetPosition);
  }

  targetingDistance(source, target) {
    const targetPosition = getTargetPosition(target);
    if (!source || !targetPosition) return Infinity;
    const directDistance = distance2D(source.position, targetPosition);
    if (source.definition.role !== 'ranged') {
      return this.game.hasSafeSurfaceLine(source.position, targetPosition)
        ? directDistance
        : this.navigationDistance(source.position, targetPosition);
    }

    const attackRange = this.game.modifiers.getAttackRange(source) + targetCombatRadius(target);
    if (directDistance <= attackRange) {
      return directDistance;
    }

    return this.navigationDistance(source.position, targetPosition);
  }

  nearestReachableUnit(source, candidates, range, predicate = null) {
    let best = null;
    let bestDistance = range;
    candidates.forEach((candidate) => {
      if (!candidate.alive) return;
      if (predicate && !predicate(candidate)) return;
      const distance = Math.max(
        0,
        distance2D(source.position, candidate.position) - targetCombatRadius(candidate)
      );
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    });
    return best;
  }

  nearestReachableStructure(source, structure, range, predicate = null) {
    if (!structure?.alive) return null;
    if (predicate && !predicate(structure)) return null;
    const directDistance = distance2D(source.position, structure.position);
    if (directDistance > range) return null;
    const distance = this.targetingDistance(source, structure);
    return distance <= range ? structure : null;
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
    if (unit.isBuilding || unit.definition.canMove === false) return;
    if (this.frameProfile) {
      this.frameProfile.moveCalls += 1;
    }
    const usesNavigationSteering = Boolean(this.game.world?.navGrid);
    const usesLooseNavigationMotion = usesNavigationSteering;
    const steeringStartedAt = this.frameProfile && usesNavigationSteering ? performance.now() : 0;
    const safeSteering = usesNavigationSteering
      ? this.game.safeSurfaceSteeringToward(unit.position, targetPosition, unit, NAVIGATION_TARGET_EPSILON)
      : null;
    if (this.frameProfile && usesNavigationSteering) {
      this.frameProfile.steeringMs += roundCombatProfile(performance.now() - steeringStartedAt);
    }

    if (usesNavigationSteering && !safeSteering) {
      unit.navMoveTarget = setReusableVector(unit.navMoveTarget, targetPosition);
      unit.navSteeringTarget = null;
      return;
    }

    const movementTarget = safeSteering?.debugTarget ?? targetPosition;
    const movementDirection = safeSteering?.direction ?? direction2D(unit.position, targetPosition);
    unit.navMoveTarget = setReusableVector(unit.navMoveTarget, targetPosition);
    unit.navSteeringTarget = setReusableVector(unit.navSteeringTarget, movementTarget);
    const targetDistance = distance2D(unit.position, targetPosition);
    if (targetDistance <= desiredDistance) return;
    const maxStep = this.game.modifiers.getMoveSpeed(unit) * dt;
    const step = usesNavigationSteering && usesLooseNavigationMotion
      ? maxStep
      : Math.min(maxStep, targetDistance - desiredDistance);
    if (step <= 0) return;
    stopUnitAnimation(unit, 'attack');
    const previousX = unit.position.x;
    const previousZ = unit.position.z;

    if (usesNavigationSteering && usesLooseNavigationMotion) {
      unit.position.addScaledVector(movementDirection, step);
      this.clampToBattlefield(unit);
      unit.visualState = 'walk';
      this.face(unit, movementTarget, dt);
      return;
    }

    const startedUnsafe = !this.game.isPointOnSafeSurface(unit.position);
    let moved = false;
    for (const scale of [1, 0.5, 0.25]) {
      unit.position.x = previousX;
      unit.position.z = previousZ;
      unit.position.addScaledVector(movementDirection, step * scale);
      this.clampToBattlefield(unit);
      if (this.game.isPointWalkable(unit.position, {
        allowUnsafeSurface: startedUnsafe
      })) {
        moved = true;
        break;
      }
    }
    if (!moved) {
      unit.position.x = previousX;
      unit.position.z = previousZ;
      this.game.clearUnitRoute?.(unit);
      return;
    }
    unit.visualState = 'walk';
    this.face(unit, movementTarget, dt);
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
    if (unit.isBuilding || unit.definition?.canMove === false) return;
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
      if (this.attackDistance(source, target.position) > allowedRange) return;
    }

    if (attack.projectileOverride || (source.definition.role === 'ranged' && target?.alive !== false)) {
      this.syncSourcePoseForAttackEvent(attack);
      this.spawnProjectile(source, target, attack.projectileOverride);
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

  spawnProjectile(source, target, override = {}) {
    const projectileType = override.projectileType ?? source.definition.projectileType ?? 'arrow';
    const projectileObject = createProjectileModel(projectileType, {
      color: resolveProjectileColor(source, projectileType)
    });
    const launchPosition = this.getProjectileLaunchPosition(source).clone();
    projectileObject.position.copy(launchPosition);
    this.game.scene.add(projectileObject);

    const pierce = override.projectilePierce ?? source.definition.projectilePierce;
    const projectile = {
      object: projectileObject,
      source,
      target,
      speed: override.projectileSpeed ?? this.game.modifiers.getProjectileSpeed(source),
      damage: override.damage ?? this.game.modifiers.getAttackDamage(source),
      knockback: override.knockback ?? this.game.modifiers.getKnockback(source),
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
      projectile.origin = launchPosition;
      projectile.radius = pierce.radius ?? 0.75;
      projectile.maxDistance = pierce.maxDistance ?? this.game.modifiers.getAttackRange(source);
      projectile.maxAge = pierce.maxAge ?? projectile.maxDistance / Math.max(0.1, projectile.speed) + 0.6;
      projectile.hitIds = new Set();
      projectile.object.quaternion.setFromUnitVectors(projectileForward, projectile.direction);
    }

    this.projectiles.push(projectile);
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      projectile.age += dt;
      if (projectile.mode === 'linearPierce') {
        this.updateLinearPiercingProjectile(projectile, i, dt);
        continue;
      }
      if (projectile.target?.alive === false || projectile.age > 2.5) {
        this.removeProjectileAt(i);
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
          damageTypes: projectile.damageTypes,
          isProjectile: true
        });
        this.removeProjectileAt(i);
        continue;
      }
      dir.normalize();
      projectile.object.position.addScaledVector(dir, projectile.speed * dt);
      projectile.object.quaternion.setFromUnitVectors(projectileForward, dir);
    }
  }

  updateLinearPiercingProjectile(projectile, index, dt) {
    projectile.object.position.addScaledVector(projectile.direction, projectile.speed * dt);
    projectile.object.quaternion.setFromUnitVectors(projectileForward, projectile.direction);

    const traveled = distance2D(projectile.origin, projectile.object.position);
    if (traveled > projectile.maxDistance || projectile.age > projectile.maxAge) {
      this.removeProjectileAt(index);
      return;
    }

    const targets = projectile.source.team === TEAMS.PLAYER ? this.game.enemyUnits : this.game.friendlyUnits;
    for (const target of targets) {
      if (!target.alive) continue;
      const hitKey = target.id ?? target;
      if (projectile.hitIds.has(hitKey)) continue;
      const hitRadius = projectile.radius + targetCombatRadius(target);
      if (distance2D(projectile.object.position, target.position) > hitRadius) continue;
      projectile.hitIds.add(hitKey);
      this.applyAttack(projectile.source, target, {
        damage: projectile.damage,
        knockback: projectile.knockback,
        damageTypes: projectile.damageTypes,
        isProjectile: true
      });
    }
  }

  removeProjectileAt(index) {
    const projectile = this.projectiles[index];
    if (!projectile) return;
    this.game.scene.remove(projectile.object);
    disposeObject3D(projectile.object);
    this.projectiles.splice(index, 1);
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

  cleanupDead() {
    this.game.friendlyUnits = this.game.friendlyUnits.filter((unit) => {
      if (unit.alive) return true;
      this.removeDeadUnit(unit);
      return false;
    });
    this.game.enemyUnits = this.game.enemyUnits.filter((unit) => {
      if (unit.alive) return true;
      this.game.lootDrops?.handleUnitDeath(unit);
      this.removeDeadUnit(unit);
      this.game.score += 1;
      return false;
    });
  }

  removeDeadUnit(unit) {
    if (unit.team === 'player') {
      this.game.abilities?.onFriendlyUnitDeath(unit);
    }
    this.game.buffs.unitDeath(unit);
    this.game.effects.spawnDeathBurst(
      unit.position.clone(),
      Math.max(0.68, crowdRadius(unit) * 1.35)
    );
    this.game.scene.remove(unit.mesh);
    disposeObject3D(unit.mesh);
    unit.statusElement?.remove();
  }
}

function getTargetPosition(target) {
  if (!target) return null;
  return target.position ?? target;
}

function navigationDistanceCacheKey(a, b) {
  const ax = Math.round(a.x / NAV_DISTANCE_CACHE_CELL);
  const az = Math.round(a.z / NAV_DISTANCE_CACHE_CELL);
  const bx = Math.round(b.x / NAV_DISTANCE_CACHE_CELL);
  const bz = Math.round(b.z / NAV_DISTANCE_CACHE_CELL);
  const first = `${ax}:${az}`;
  const second = `${bx}:${bz}`;
  return first <= second ? `${first}|${second}` : `${second}|${first}`;
}

function separationWorldBounds() {
  const padding = 4;
  return {
    x: -BALANCE.battlefield.halfWidth - padding,
    z: BALANCE.battlefield.minZ - padding,
    width: BALANCE.battlefield.halfWidth * 2 + padding * 2,
    height: BALANCE.battlefield.maxZ - BALANCE.battlefield.minZ + padding * 2
  };
}

class SeparationQuadtree {
  constructor(bounds, depth = 0) {
    this.bounds = bounds;
    this.depth = depth;
    this.items = [];
    this.children = null;
    this.nodeCount = 1;
  }

  clear(bounds = this.bounds) {
    this.bounds = bounds;
    this.items.length = 0;
    if (!this.children) return;
    for (let i = 0; i < this.children.length; i += 1) {
      this.children[i].clear(this.children[i].bounds);
    }
  }

  insert(unit) {
    if (!rectContainsPoint(this.bounds, unit.position.x, unit.position.z)) return false;
    if (this.children) {
      const child = this.childForPoint(unit.position.x, unit.position.z);
      if (child?.insert(unit)) return true;
    }
    this.items.push(unit);
    if (
      !this.children &&
      this.items.length > SEPARATION_QUADTREE_CAPACITY &&
      this.depth < SEPARATION_QUADTREE_MAX_DEPTH
    ) {
      this.subdivide();
    }
    return true;
  }

  query(x, z, width, height, output) {
    if (!rectsOverlapValues(this.bounds, x, z, width, height)) return output;
    for (let i = 0; i < this.items.length; i += 1) {
      const unit = this.items[i];
      if (rectContainsPointValues(x, z, width, height, unit.position.x, unit.position.z)) {
        output.push(unit);
      }
    }
    if (this.children) {
      for (let i = 0; i < this.children.length; i += 1) {
        this.children[i].query(x, z, width, height, output);
      }
    }
    return output;
  }

  countNodes() {
    if (!this.children) return 1;
    let count = 1;
    for (let i = 0; i < this.children.length; i += 1) {
      count += this.children[i].countNodes();
    }
    return count;
  }

  childForPoint(x, z) {
    if (!this.children) return null;
    for (let i = 0; i < this.children.length; i += 1) {
      const child = this.children[i];
      if (rectContainsPoint(child.bounds, x, z)) return child;
    }
    return null;
  }

  subdivide() {
    const { x, z, width, height } = this.bounds;
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;
    this.children = [
      new SeparationQuadtree({ x, z, width: halfWidth, height: halfHeight }, this.depth + 1),
      new SeparationQuadtree({ x: x + halfWidth, z, width: halfWidth, height: halfHeight }, this.depth + 1),
      new SeparationQuadtree({ x, z: z + halfHeight, width: halfWidth, height: halfHeight }, this.depth + 1),
      new SeparationQuadtree({ x: x + halfWidth, z: z + halfHeight, width: halfWidth, height: halfHeight }, this.depth + 1)
    ];
    const items = this.items;
    this.items = [];
    items.forEach((unit) => {
      if (!this.childForPoint(unit.position.x, unit.position.z)?.insert(unit)) {
        this.items.push(unit);
      }
    });
  }
}

function rectContainsPoint(rect, x, z) {
  return x >= rect.x &&
    x <= rect.x + rect.width &&
    z >= rect.z &&
    z <= rect.z + rect.height;
}

function rectContainsPointValues(rectX, rectZ, width, height, x, z) {
  return x >= rectX &&
    x <= rectX + width &&
    z >= rectZ &&
    z <= rectZ + height;
}

function rectsOverlapValues(a, x, z, width, height) {
  return a.x <= x + width &&
    a.x + a.width >= x &&
    a.z <= z + height &&
    a.z + a.height >= z;
}

function createSeparationStats() {
  return {
    checks: 0,
    pushes: 0,
    buckets: 0
  };
}

function createCombatProfile() {
  return {
    collectMs: 0,
    buffsMs: 0,
    unitsMs: 0,
    separationMs: 0,
    pendingMs: 0,
    projectilesMs: 0,
    cleanupMs: 0,
    targetingMs: 0,
    steeringMs: 0,
    units: 0,
    targetSearches: 0,
    moveCalls: 0,
    separationChecks: 0,
    separationPushes: 0,
    separationBuckets: 0
  };
}

function recordCombatProfile(profile, key, mark) {
  if (!profile) return mark;
  const now = performance.now();
  profile[key] = roundCombatProfile(now - mark);
  return now;
}

function roundCombatProfile(value) {
  return Number(value.toFixed(2));
}

function targetSearchDelay(unit, baseDelay) {
  const phase = ((unit.id * 47) % 100) / 100;
  return baseDelay + phase * TARGET_RESCAN_JITTER;
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
  if (unit.type === 'goblinTroll') return 0.64;
  if (unit.type === 'ogre') return 0.78;
  if (unit.type === 'scorpion') return 0.45;
  if (unit.type === 'spider') return 0.42;
  if (unit.type === 'spiderEgg') return 0.34;
  if (unit.type === 'bear') return 0.72;
  if (unit.type === 'wolf') return 0.48;
  return unit.definition.role === 'ranged' ? 0.36 : 0.42;
}

function isImmobileUnit(unit) {
  return unit.type === 'spiderEgg';
}

function isStaticUnit(unit) {
  return unit.isBuilding || unit.definition?.canMove === false || isImmobileUnit(unit);
}

function setReusableVector(current, point) {
  if (!point) return null;
  const vector = current ?? new THREE.Vector3();
  vector.set(point.x, point.y ?? 0, point.z);
  return vector;
}

function deterministicPairAngle(a, b) {
  const seed = (Math.min(a.id, b.id) * 37 + Math.max(a.id, b.id) * 61) % 360;
  return (seed / 360) * Math.PI * 2;
}

function hitStunDuration(knockback) {
  return clamp(0.08 + knockback * 0.024, 0.1, 0.24);
}

function maxKnockbackVelocity(unit) {
  if (unit.type === 'goblinTroll') return 6.8;
  if (unit.type === 'ogre') return 7;
  if (unit.type === 'bear') return 8;
  if (unit.type === 'scorpion') return 8.8;
  if (unit.type === 'spider') return 8.6;
  if (unit.type === 'spiderEgg') return 0;
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
  if (projectileType === 'bolt') return '#d8dde0';
  if (projectileType === 'waterOrb') return '#65d8ff';
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
