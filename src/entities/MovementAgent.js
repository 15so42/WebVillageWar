import { BALANCE } from '../data/gameData.js';
import { clamp, direction2D, distance2D } from '../utils/math.js';
import {
  isImmobileUnit,
  isStationaryCombatUnit,
  isStaticUnit,
  KNOCKBACK_AIRBORNE_VELOCITY_RETAIN_PER_SECOND,
  KNOCKBACK_MOTION_TIME_SCALE,
  KNOCKBACK_STOP_SPEED_SQ,
  KNOCKBACK_VELOCITY_RETAIN_PER_SECOND,
  maxKnockbackVelocity,
  setReusableVector,
  shortestAngle
} from '../systems/combatHelpers.js';

const NAVIGATION_TARGET_EPSILON = 0.04;
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
      this.faceDirection(movementDirection, dt);
      return true;
    }

    if (usesNavigationSteering) {
      unit.position.addScaledVector(movementDirection, step);
      this.clampToBattlefield();
      unit.visualState = 'walk';
      this.faceDirection(movementDirection, dt);
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
    this.faceDirection(movementDirection, dt);
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

    const finishKnockback = () => {
      this.game.combat?.onKnockbackEnded?.(unit, unit.knockbackSessionDistance ?? 0);
      unit.knockbackSessionDistance = 0;
      unit.knockbackVelocity.set(0, 0, 0);
      this.game.clearUnitRoute?.(unit);
    };
    const knockbackSpeedSq = unit.knockbackVelocity.lengthSq();
    if (knockbackSpeedSq <= KNOCKBACK_STOP_SPEED_SQ) {
      if (knockbackSpeedSq > 0) finishKnockback();
      return;
    }

    const previousX = unit.position.x;
    const previousZ = unit.position.z;
    const motionDt = dt * KNOCKBACK_MOTION_TIME_SCALE;
    unit.knockbackVelocity.clampLength(0, maxKnockbackVelocity(unit));
    unit.position.addScaledVector(unit.knockbackVelocity, motionDt);
    const velocityRetention = unit.grounded === false
      ? KNOCKBACK_AIRBORNE_VELOCITY_RETAIN_PER_SECOND
      : KNOCKBACK_VELOCITY_RETAIN_PER_SECOND;
    unit.knockbackVelocity.multiplyScalar(Math.pow(velocityRetention, motionDt));
    unit.knockbackSessionDistance = (unit.knockbackSessionDistance ?? 0)
      + Math.hypot(unit.position.x - previousX, unit.position.z - previousZ);

    this.clampToBattlefield();
    if (!this.game.isPointWalkable(unit.position)) {
      unit.position.x = previousX;
      unit.position.z = previousZ;
      finishKnockback();
      return;
    }

    if (unit.knockbackVelocity.lengthSq() <= KNOCKBACK_STOP_SPEED_SQ) {
      finishKnockback();
    }
  }

  clampToBattlefield() {
    const unit = this.unit;
    // **必须用与镜头、落点校验同一套边界**（Game.battlefieldBounds 按地图自身的
    // navigationBounds 算，没有时才退回写死的旧值）。
    //
    // 这里曾经直接写死 BALANCE.battlefield（x ±42、z −40..40）。那是一条为最早那几张
    // 走廊式小地图定的固定框，比它大的地图会被裁掉一圈，而且症状极其隐蔽：
    // 单位每帧都往目标走一步、又立刻被拉回边界，于是表现为「st=walk / ai=moving、
    // 却一步不动」的原地踏步（海岛放大一倍之后，基地就在 z=40 这条线上，
    // 去北边巢穴的护卫全部卡死在 z=40.00）。
    // Game.clampCameraTarget 早就改成 battlefieldBounds 了，这一处当时漏了。
    const bounds = typeof this.game?.battlefieldBounds === 'function'
      ? this.game.battlefieldBounds()
      : {
        minX: -BALANCE.battlefield.halfWidth,
        maxX: BALANCE.battlefield.halfWidth,
        minZ: BALANCE.battlefield.minZ,
        maxZ: BALANCE.battlefield.maxZ
      };
    unit.position.x = clamp(unit.position.x, bounds.minX, bounds.maxX);
    unit.position.z = clamp(unit.position.z, bounds.minZ, bounds.maxZ);
  }

  face(targetPosition, dt = 0) {
    const unit = this.unit;
    if (unit.definition?.canRotate === false) return;
    if ((unit.isBuilding || unit.definition?.canMove === false) && !isStationaryCombatUnit(unit)) return;
    const dx = targetPosition.x - unit.position.x;
    const dz = targetPosition.z - unit.position.z;
    if (dx * dx + dz * dz < 0.0001) return;
    this.faceDirection({ x: dx, z: dz }, dt);
  }

  // 按实际移动方向转向：移动朝向与模型朝向严格一致，
  // 避免寻路转向中间点时模型朝向与脚下移动方向出现偏差
  faceDirection(direction, dt = 0) {
    const unit = this.unit;
    if (unit.definition?.canRotate === false) return;
    if ((unit.isBuilding || unit.definition?.canMove === false) && !isStationaryCombatUnit(unit)) return;
    const dx = direction?.x ?? 0;
    const dz = direction?.z ?? 0;
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
