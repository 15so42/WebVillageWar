import { stopUnitAnimation } from '../art/visualRegistry.js';
import { BALANCE } from '../data/gameData.js';
import { clamp, direction2D, distance2D } from '../utils/math.js';
import {
  isImmobileUnit,
  isStaticUnit,
  maxKnockbackVelocity,
  setReusableVector,
  shortestAngle
} from '../systems/combatHelpers.js';

const NAVIGATION_TARGET_EPSILON = 0.04;
const KNOCKBACK_EPSILON_SQ = 0.0004;

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
  }

  clearDestination() {
    this.destination = null;
    this.unit.moveGoal = null;
    this.game.clearUnitRoute?.(this.unit);
  }

  moveToward(targetPosition, dt, desiredDistance = this.desiredDistance) {
    const unit = this.unit;
    if (!targetPosition) return false;
    if (unit.isBuilding || unit.definition.canMove === false || isImmobileUnit(unit)) return false;
    const targetDistance = distance2D(unit.position, targetPosition);
    if (targetDistance <= desiredDistance) return false;

    const usesNavigationSteering = Boolean(this.game.world?.navGrid);
    const safeSteering = usesNavigationSteering
      ? this.game.safeSurfaceSteeringToward(unit.position, targetPosition, unit, NAVIGATION_TARGET_EPSILON)
      : null;

    if (usesNavigationSteering && !safeSteering) {
      unit.navMoveTarget = setReusableVector(unit.navMoveTarget, targetPosition);
      unit.navSteeringTarget = null;
      return false;
    }

    const movementTarget = safeSteering?.debugTarget ?? targetPosition;
    const movementDirection = safeSteering?.direction ?? direction2D(unit.position, targetPosition);
    unit.navMoveTarget = setReusableVector(unit.navMoveTarget, targetPosition);
    unit.navSteeringTarget = setReusableVector(unit.navSteeringTarget, movementTarget);
    const maxStep = this.game.modifiers.getMoveSpeed(unit) * dt;
    const step = usesNavigationSteering ? maxStep : Math.min(maxStep, targetDistance - desiredDistance);
    if (step <= 0) return false;
    stopUnitAnimation(unit, 'attack');

    const previousX = unit.position.x;
    const previousZ = unit.position.z;
    if (usesNavigationSteering) {
      unit.position.addScaledVector(movementDirection, step);
      this.clampToBattlefield();
      unit.visualState = 'walk';
      this.face(movementTarget, dt);
      return true;
    }

    let moved = false;
    for (const scale of [1, 0.5, 0.25]) {
      unit.position.x = previousX;
      unit.position.z = previousZ;
      unit.position.addScaledVector(movementDirection, step * scale);
      this.clampToBattlefield();
      if (this.game.isPointWalkable(unit.position)) {
        moved = true;
        break;
      }
    }
    if (!moved) {
      unit.position.x = previousX;
      unit.position.z = previousZ;
      this.game.clearUnitRoute?.(unit);
      return false;
    }
    unit.visualState = 'walk';
    this.face(movementTarget, dt);
    return true;
  }

  applyMotion(dt) {
    const unit = this.unit;
    if (isStaticUnit(unit)) {
      unit.knockbackVelocity.set(0, 0, 0);
      return;
    }
    if (unit.knockbackVelocity.lengthSq() <= KNOCKBACK_EPSILON_SQ) {
      unit.knockbackVelocity.set(0, 0, 0);
      return;
    }
    const previousX = unit.position.x;
    const previousZ = unit.position.z;
    unit.knockbackVelocity.clampLength(0, maxKnockbackVelocity(unit));
    unit.position.addScaledVector(unit.knockbackVelocity, dt);
    unit.knockbackVelocity.multiplyScalar(Math.pow(0.08, dt));
    if (unit.knockbackVelocity.lengthSq() <= KNOCKBACK_EPSILON_SQ) {
      unit.knockbackVelocity.set(0, 0, 0);
      this.game.clearUnitRoute?.(unit);
    }
    this.clampToBattlefield();
    if (!this.game.isPointWalkable(unit.position)) {
      unit.position.x = previousX;
      unit.position.z = previousZ;
      unit.knockbackVelocity.set(0, 0, 0);
      this.game.clearUnitRoute?.(unit);
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
    if (unit.isBuilding || unit.definition?.canMove === false) return;
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
