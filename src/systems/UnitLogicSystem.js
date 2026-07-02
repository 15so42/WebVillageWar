import * as THREE from 'three';
import { TEAMS } from '../data/gameData.js';
import { distance2D } from '../utils/math.js';
import {
  countNegativeBuffs,
  formatSupportAmount,
  getTargetPosition,
  hasNegativeBuff,
  isImmobileUnit,
  isNegativeBuff,
  roundProfile,
  stopDistance,
  targetCombatRadius
} from './combatHelpers.js';

export class UnitLogicSystem {
  constructor(game) {
    this.game = game;
    this.lastProfile = null;
    this.frameProfile = null;
  }

  update(dt) {
    const profile = this.game.perfDebugEnabled ? createUnitProfile() : null;
    this.frameProfile = profile;
    let mark = profile ? performance.now() : 0;
    this.game.targeting.beginFrame();
    this.game.targeting.update(dt);
    mark = recordStep(profile, 'targetIndexMs', mark);
    const units = this.game.unitRegistry.activeUnits();
    mark = recordStep(profile, 'collectMs', mark);
    this.game.attacks.rebuildActiveAttackIndex();
    mark = recordStep(profile, 'attackIndexMs', mark);
    for (let i = 0; i < units.length; i += 1) {
      this.updateUnit(units[i], dt);
    }
    mark = recordStep(profile, 'unitsMs', mark);
    this.game.movement.updateSeparation(units, dt);
    mark = recordStep(profile, 'separationMs', mark);
    this.game.attacks.updatePendingAttacks(dt);
    mark = recordStep(profile, 'pendingMs', mark);
    this.game.attacks.updateProjectiles(dt, profile);
    mark = recordStep(profile, 'projectilesMs', mark);
    if (profile) {
      profile.units = units.length;
      profile.separationChecks = this.game.movement.stats.checks;
      profile.separationPushes = this.game.movement.stats.pushes;
      profile.separationBuckets = this.game.movement.stats.buckets;
      this.lastProfile = profile;
    }
    this.frameProfile = null;
  }

  updateUnit(unit, dt) {
    if (!unit.alive) return;
    const profile = this.frameProfile;
    let mark = profile ? performance.now() : 0;
    unit.visualState = 'idle';
    unit.aiState = unit.aiState ?? 'idle';
    unit.attackTimer -= dt;
    this.tickAbilityCooldowns(unit, dt);
    unit.hitStunTimer = Math.max(0, unit.hitStunTimer - dt);
    this.game.buffs.updateUnitBuffs(unit, dt);
    mark = recordUnitStep(profile, 'unitBookkeepingMs', mark);
    if (!unit.alive) return;

    if (unit.underConstruction) {
      unit.aiState = 'idle';
      unit.movement?.applyMotion(dt);
      recordUnitStep(profile, 'motionMs', mark);
      return;
    }

    if (isImmobileUnit(unit) || unit.isBuilding || unit.definition.canMove === false) {
      unit.target = null;
      unit.moveGoal = null;
      unit.commandMoveGoal = null;
      unit.knockbackVelocity.set(0, 0, 0);
      unit.aiState = 'idle';
      recordUnitStep(profile, 'immobileMs', mark);
      return;
    }

    if (unit.hitStunTimer > 0) {
      unit.aiState = 'stunned';
      unit.movement?.applyMotion(dt);
      recordUnitStep(profile, 'motionMs', mark);
      return;
    }

    if (unit.controlMode === 'hold') {
      unit.target = null;
      unit.moveGoal = null;
      unit.commandMoveGoal = null;
      unit.aiState = 'idle';
      unit.movement?.applyMotion(dt);
      recordUnitStep(profile, 'motionMs', mark);
      return;
    }

    if (unit.controlMode === 'guard') {
      this.ensureGuardState(unit);
    }
    mark = recordUnitStep(profile, 'guardMs', mark);

    this.updateSupportAbilities(unit, dt);
    mark = recordUnitStep(profile, 'supportMs', mark);

    if (unit.commandMoveGoal) {
      if (distance2D(unit.position, unit.commandMoveGoal) > 0.65) {
        unit.target = null;
        unit.aiState = 'moving';
        unit.movement?.moveToward(unit.commandMoveGoal, dt, 0.48);
        mark = recordUnitStep(profile, 'commandMs', mark);
        unit.movement?.applyMotion(dt);
        recordUnitStep(profile, 'motionMs', mark);
        return;
      }
      unit.commandMoveGoal = null;
    }
    mark = recordUnitStep(profile, 'commandMs', mark);

    const activeAttack = this.game.attacks.getActiveAttackFor(unit);
    mark = recordUnitStep(profile, 'activeAttackMs', mark);
    if (activeAttack) {
      unit.aiState = 'attacking';
      const targetPosition = getTargetPosition(activeAttack.target);
      if (targetPosition) {
        unit.movement?.face(targetPosition, dt);
      }
      unit.movement?.applyMotion(dt);
      recordUnitStep(profile, 'motionMs', mark);
      return;
    }

    const target = this.game.targeting.targetForUnit(unit, dt, profile);
    mark = recordUnitStep(profile, 'targetDecisionMs', mark);

    if (target) {
      if (this.shouldBreakGuardChase(unit, target)) {
        unit.target = null;
        unit.aiState = 'moving';
        this.returnToGuardPoint(unit, dt);
        mark = recordUnitStep(profile, 'attackDecisionMs', mark);
        unit.movement?.applyMotion(dt);
        recordUnitStep(profile, 'motionMs', mark);
        return;
      }
      const targetPosition = getTargetPosition(target);
      const targetDistance = distance2D(unit.position, targetPosition);
      const targetRadius = targetCombatRadius(target);
      const attackRange = this.game.modifiers.getAttackRange(unit);
      if (this.game.attacks.tryRangedWeaponAbility(unit, target, targetDistance, targetRadius)) {
        unit.aiState = 'attacking';
        mark = recordUnitStep(profile, 'attackDecisionMs', mark);
        unit.movement?.applyMotion(dt);
        recordUnitStep(profile, 'motionMs', mark);
        return;
      }
      if (targetDistance <= attackRange + targetRadius) {
        unit.aiState = 'attacking';
        unit.movement?.face(targetPosition, dt);
        this.game.attacks.tryAttack(unit, target);
      } else {
        unit.aiState = 'chasing';
        unit.movement?.moveToward(
          targetPosition,
          dt,
          target.position ? targetRadius + stopDistance(unit, this.game.modifiers) : 0.2
        );
      }
    } else if (unit.isWildlife) {
      unit.aiState = 'moving';
      this.updateWildlifeWander(unit, dt);
      unit.movement?.moveToward(unit.wanderGoal, dt, 0.55);
    } else if (unit.controlMode === 'guard') {
      unit.aiState = 'moving';
      this.returnToGuardPoint(unit, dt);
    } else if (unit.moveGoal) {
      unit.aiState = 'moving';
      unit.movement?.moveToward(unit.moveGoal, dt);
    } else {
      unit.aiState = 'idle';
    }
    mark = recordUnitStep(profile, 'attackDecisionMs', mark);

    unit.movement?.applyMotion(dt);
    recordUnitStep(profile, 'motionMs', mark);
  }

  tickAbilityCooldowns(unit, dt) {
    if (!unit.abilityCooldowns?.size) return;
    unit.abilityCooldowns.forEach((remaining, key) => {
      unit.abilityCooldowns.set(key, Math.max(0, remaining - dt));
    });
  }

  updateSupportAbilities(unit, dt) {
    const support = unit.definition.support ?? {};
    if (support.heal) this.updateHealAbility(unit, support.heal, dt);
    if (support.cleanse) this.updateCleanseAbility(unit, support.cleanse, dt);
    if (support.shield) this.updateShieldAbility(unit, support.shield, dt);
    if (support.repairAura) this.updateRepairAura(unit, support.repairAura, dt);
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
      (candidate) => hasNegativeBuff(candidate),
      (candidate, distance) => countNegativeBuffs(candidate) * 100 - distance
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
    const selected = [];
    const selectedMissing = [];
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      if (!candidate.alive || candidate === unit || candidate.underConstruction) continue;
      if (!candidate.weapon || candidate.weapon.durability >= candidate.weapon.maxDurability - 0.01) continue;
      if (distance2D(unit.position, candidate.position) > range) continue;
      insertRepairTarget(
        selected,
        selectedMissing,
        candidate,
        candidate.weapon.maxDurability - candidate.weapon.durability,
        maxTargets
      );
    }
    return selected;
  }

  findSupportTarget(unit, ability, predicate, scoreFn) {
    const candidates = unit.team === TEAMS.PLAYER ? this.game.friendlyUnits : this.game.enemyUnits;
    const range = Math.max(0, ability.range ?? 7);
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      if (!candidate.alive || !predicate(candidate)) continue;
      const distance = distance2D(unit.position, candidate.position);
      if (distance > range) continue;
      const score = scoreFn(candidate, distance);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
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

  returnToGuardPoint(unit, dt) {
    if (!unit.guardPoint) return;
    if (distance2D(unit.position, unit.guardPoint) <= 0.42) return;
    unit.movement?.moveToward(unit.guardPoint, dt, 0.26);
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
}

function insertRepairTarget(selected, selectedMissing, unit, missing, maxTargets) {
  let insertAt = selected.length;
  while (insertAt > 0 && selectedMissing[insertAt - 1] < missing) {
    insertAt -= 1;
  }
  if (insertAt >= maxTargets) return;
  selected.splice(insertAt, 0, unit);
  selectedMissing.splice(insertAt, 0, missing);
  if (selected.length > maxTargets) {
    selected.length = maxTargets;
    selectedMissing.length = maxTargets;
  }
}

function createUnitProfile() {
  return {
    activeAttackMs: 0,
    attackDecisionMs: 0,
    attackIndexMs: 0,
    collectMs: 0,
    commandMs: 0,
    buffsMs: 0,
    guardMs: 0,
    immobileMs: 0,
    motionMs: 0,
    unitsMs: 0,
    separationMs: 0,
    pendingMs: 0,
    projectilesMs: 0,
    projectileFlightMs: 0,
    projectileMoveApplyMs: 0,
    projectileQueryMs: 0,
    projectileHitMs: 0,
    projectileRecycleMs: 0,
    cleanupMs: 0,
    supportMs: 0,
    targetIndexMs: 0,
    targetDecisionMs: 0,
    targetingMs: 0,
    steeringMs: 0,
    unitBookkeepingMs: 0,
    units: 0,
    activeAttackLookups: 0,
    targetQueries: 0,
    targetCandidates: 0,
    targetSearches: 0,
    moveCalls: 0,
    separationChecks: 0,
    separationPushes: 0,
    separationBuckets: 0
  };
}

function recordUnitStep(profile, key, mark) {
  if (!profile) return mark;
  const now = performance.now();
  profile[key] += roundProfile(now - mark);
  return now;
}

function recordStep(profile, key, mark) {
  if (!profile) return mark;
  const now = performance.now();
  profile[key] = roundProfile(now - mark);
  return now;
}
