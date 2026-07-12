import { BALANCE } from '../data/gameData.js';
import { clamp, direction2D, distance2D } from '../utils/math.js';
import {
  isImmobileUnit,
  isStationaryCombatUnit,
  isStaticUnit,
  maxKnockbackVelocity,
  setReusableVector,
  shortestAngle
} from '../systems/combatHelpers.js';

const NAVIGATION_TARGET_EPSILON = 0.04;
const KNOCKBACK_EPSILON_SQ = 0.0004;
const DIRECT_MOVE_BLOCKED_SECONDS = 0.26;

export class MovementAgent {
  constructor(unit, game) {
    this.unit = unit;
    this.game = game;
    this.destination = null;
    this.desiredDistance = 0.18;
  }

  setDestination(point, desiredDistance = 0.18) {
    if (!point) {
      this.destination = null;
      this.unit.moveGoal = null;
      this.game.clearUnitRoute?.(this.unit);
      return;
    }
    this.destination = setReusableVector(this.destination, point);
    this.desiredDistance = desiredDistance;
    this.unit.moveGoal = setReusableVector(this.unit.moveGoal, point);
    this.unit.moveGoalUsesDirectSteering = false;
  }

  clearDestination() {
    this.destination = null;
    this.unit.moveGoal = null;
    this.unit.moveGoalUsesDirectSteering = false;
    this.game.clearUnitRoute?.(this.unit);
  }

  moveToward(targetPosition, dt, desiredDistance = this.desiredDistance, options = {}) {
    const unit = this.unit;
    if (!targetPosition) return false;
    if (unit.isBuilding || unit.definition.canMove === false || isImmobileUnit(unit)) return false;
    const targetDistance = distance2D(unit.position, targetPosition);
    if (targetDistance <= desiredDistance) {
      unit.navSteeringTarget = null;
      unit.directMoveBlockedTime = 0;
      unit.directMoveBlocked = false;
      return false;
    }

    const usesDirectSteering = options.direct === true;
    const usesNavigationSteering = Boolean(this.game.world?.navGrid) && !usesDirectSteering;
    const safeSteering = usesNavigationSteering
      ? this.game.safeSurfaceSteeringToward(unit.position, targetPosition, unit, NAVIGATION_TARGET_EPSILON)
      : null;

    if (usesNavigationSteering && !safeSteering) {
      unit.navMoveTarget = setReusableVector(unit.navMoveTarget, targetPosition);
      unit.navSteeringTarget = null;
      return false;
    }

    let movementTarget = safeSteering?.debugTarget ?? targetPosition;
    let movementDirection = safeSteering?.direction ?? direction2D(unit.position, targetPosition);
    unit.navMoveTarget = setReusableVector(unit.navMoveTarget, targetPosition);
    unit.navSteeringTarget = setReusableVector(unit.navSteeringTarget, movementTarget);
    const maxStep = this.game.modifiers.getMoveSpeed(unit) * dt;
    let step = usesNavigationSteering ? maxStep : Math.min(maxStep, targetDistance - desiredDistance);
    if (usesNavigationSteering && targetDistance <= desiredDistance + maxStep) {
      movementTarget = targetPosition;
      movementDirection = direction2D(unit.position, targetPosition);
      step = Math.min(maxStep, Math.max(0, targetDistance - desiredDistance));
    }
    if (usesNavigationSteering) {
      const waypointDistance = distance2D(unit.position, movementTarget);
      step = Math.min(step, waypointDistance);
    }
    if (step <= 0) return false;

    if (usesDirectSteering) {
      if (!this.tryApplyWalkableStep(movementDirection, step, false)) {
        unit.directMoveBlockedTime = (unit.directMoveBlockedTime ?? 0) + dt;
        unit.directMoveBlocked = unit.directMoveBlockedTime >= DIRECT_MOVE_BLOCKED_SECONDS;
        return false;
      }
      unit.directMoveBlockedTime = 0;
      unit.directMoveBlocked = false;
      unit.visualState = 'walk';
      this.face(movementTarget, dt);
      return true;
    }

    if (usesNavigationSteering) {
      unit.position.addScaledVector(movementDirection, step);
      this.clampToBattlefield();
      unit.visualState = 'walk';
      this.face(movementTarget, dt);
      return true;
    }

    let moved = false;
    for (const scale of [1, 0.5, 0.25]) {
      if (this.tryApplyWalkableStep(movementDirection, step * scale, false)) {
        moved = true;
        break;
      }
    }
    if (!moved) {
      this.game.clearUnitRoute?.(unit);
      return false;
    }
    unit.visualState = 'walk';
    this.face(movementTarget, dt);
    return true;
  }

  tryApplyWalkableStep(direction, step, allowSlide = false) {
    const unit = this.unit;
    const previousX = unit.position.x;
    const previousZ = unit.position.z;
    const attempt = (xFactor, zFactor, scale = 1) => {
      if (Math.abs(xFactor) + Math.abs(zFactor) < 0.0001) return false;
      unit.position.x = previousX + xFactor * step * scale;
      unit.position.z = previousZ + zFactor * step * scale;
      this.clampToBattlefield();
      if (this.game.isPointWalkable(unit.position)) return true;
      unit.position.x = previousX;
      unit.position.z = previousZ;
      return false;
    };

    for (const scale of [1, 0.65, 0.35]) {
      if (attempt(direction.x, direction.z, scale)) return true;
    }
    if (allowSlide) {
      const primaryFirst = Math.abs(direction.x) >= Math.abs(direction.z);
      const primary = primaryFirst
        ? { x: direction.x, z: 0 }
        : { x: 0, z: direction.z };
      const secondary = primaryFirst
        ? { x: 0, z: direction.z }
        : { x: direction.x, z: 0 };
      for (const scale of [1, 0.65, 0.35]) {
        if (attempt(primary.x, primary.z, scale)) return true;
        if (attempt(secondary.x, secondary.z, scale)) return true;
      }
    }

    unit.position.x = previousX;
    unit.position.z = previousZ;
    return false;
  }

  applyMotion(dt) {
    const unit = this.unit;
    if (isStaticUnit(unit)) {
      unit.knockbackVelocity.set(0, 0, 0);
      return;
    }
    if (unit.knockbackVelocity.lengthSq() <= KNOCKBACK_EPSILON_SQ) {
      return;
    }

    const previousX = unit.position.x;
    const previousZ = unit.position.z;
    unit.knockbackVelocity.clampLength(0, maxKnockbackVelocity(unit));
    unit.position.addScaledVector(unit.knockbackVelocity, dt);
    unit.knockbackVelocity.multiplyScalar(Math.pow(0.08, dt));
    unit.knockbackSessionDistance = (unit.knockbackSessionDistance ?? 0)
      + Math.hypot(unit.position.x - previousX, unit.position.z - previousZ);

    const finishKnockback = () => {
      this.game.combat?.onKnockbackEnded?.(unit, unit.knockbackSessionDistance ?? 0);
      unit.knockbackSessionDistance = 0;
      unit.knockbackVelocity.set(0, 0, 0);
      this.game.clearUnitRoute?.(unit);
    };

    this.clampToBattlefield();
    if (!this.game.isPointWalkable(unit.position)) {
      unit.position.x = previousX;
      unit.position.z = previousZ;
      finishKnockback();
      return;
    }

    if (unit.knockbackVelocity.lengthSq() <= KNOCKBACK_EPSILON_SQ) {
      finishKnockback();
    }
  }

  clampToBattlefield() {
    const unit = this.unit;
    unit.position.x = clamp(
      unit.position.x,
      -BALANCE.battlefield.halfWidth,
      BALANCE.battlefield.halfWidth
    );
    unit.position.z = clamp(unit.position.z, BALANCE.battlefield.minZ, BALANCE.battlefield.maxZ);
  }

  face(targetPosition, dt = 0) {
    const unit = this.unit;
    if (unit.definition?.canRotate === false) return;
    if ((unit.isBuilding || unit.definition?.canMove === false) && !isStationaryCombatUnit(unit)) return;
    const dx = targetPosition.x - unit.position.x;
    const dz = targetPosition.z - unit.position.z;
    if (dx * dx + dz * dz < 0.0001) return;
    const desired = Math.atan2(dx, dz);
    if (dt <= 0) {
      unit.mesh.rotation.y = desired;
      return;
    }
    const delta = shortestAngle(unit.mesh.rotation.y, desired);
    unit.mesh.rotation.y += delta * clamp(dt * 7.5, 0, 1);
  }
}
