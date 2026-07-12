import * as THREE from 'three';
import { clamp } from '../utils/math.js';

export function getTargetPosition(target) {
  if (!target) return null;
  return target.position ?? target;
}

export function targetCombatRadius(target) {
  if (!target?.position) return 0;
  if (Number.isFinite(target.attackRadius)) return target.attackRadius;
  if (Number.isFinite(target.collisionRadius)) return target.collisionRadius;
  if (target.type) return crowdRadius(target);
  return 0;
}

export function stopDistance(unit, modifiers) {
  const attackRange = modifiers.getAttackRange(unit);
  if (unit.definition.role === 'ranged') {
    return attackRange * 0.92;
  }
  return Math.max(0.75, attackRange * 0.88);
}

export function crowdRadius(unit) {
  if (unit.type === 'goblinTroll' || unit.type === 'shieldBearer') return 0.64;
  if (unit.type === 'ogre') return 1.17;
  if (unit.type === 'scorpion') return 0.45;
  if (unit.type === 'spider') return 0.42;
  if (unit.type === 'spiderEgg') return 0.34;
  if (unit.type === 'bear') return 0.72;
  if (unit.type === 'wolf') return 0.48;
  return unit.definition.role === 'ranged' ? 0.36 : 0.42;
}

export function isImmobileUnit(unit) {
  return unit.type === 'spiderEgg';
}

export function isStationaryCombatUnit(unit) {
  if (!unit?.definition || !unit.alive || unit.underConstruction) return false;
  const definition = unit.definition;
  if (!(unit.isBuilding || definition.canMove === false)) return false;
  return (definition.attackRange ?? 0) > 0 && (definition.damage ?? 0) > 0;
}

export function isStaticUnit(unit) {
  return unit.isBuilding || unit.definition?.canMove === false || isImmobileUnit(unit);
}

export function hitStunDuration(knockback) {
  return clamp(0.08 + knockback * 0.024, 0.1, 0.24);
}

export function maxKnockbackVelocity(unit) {
  if (unit.type === 'goblinTroll' || unit.type === 'shieldBearer') return 6.8;
  if (unit.type === 'ogre') return 7;
  if (unit.type === 'bear') return 8;
  if (unit.type === 'scorpion') return 8.8;
  if (unit.type === 'spider') return 8.6;
  if (unit.type === 'spiderEgg') return 0;
  if (unit.type === 'wolf') return 9;
  return 10;
}

export function isNegativeBuff(buff) {
  return buff?.negative === true;
}

export function hasNegativeBuff(unit) {
  if (!unit?.buffs?.size) return false;
  for (const buff of unit.buffs.values()) {
    if (isNegativeBuff(buff)) return true;
  }
  return false;
}

export function countNegativeBuffs(unit) {
  if (!unit?.buffs?.size) return 0;
  let count = 0;
  for (const buff of unit.buffs.values()) {
    if (isNegativeBuff(buff)) count += 1;
  }
  return count;
}

export function resolveProjectileColor(source, projectileType) {
  if (source.hasEnchantment?.('fire')) return '#ffb66c';
  if (source.definition?.projectileColor) return source.definition.projectileColor;
  if (projectileType === 'holyBolt') return '#e9fbff';
  if (projectileType === 'bolt') return '#d8dde0';
  if (projectileType === 'waterOrb') return '#65d8ff';
  return '#e7ddc0';
}

export function formatSupportAmount(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function isAttackFromFront(target, source, angleDegrees = 120) {
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

export function shortestAngle(from, to) {
  let delta = (to - from + Math.PI) % (Math.PI * 2) - Math.PI;
  if (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
}

export function setReusableVector(current, point) {
  if (!point) return null;
  const vector = current ?? new THREE.Vector3();
  vector.set(point.x, point.y ?? 0, point.z);
  return vector;
}

export function targetSearchDelay(unit, baseDelay, jitter = 0.14) {
  const phase = ((unit.id * 47) % 100) / 100;
  return baseDelay + phase * jitter;
}

export function roundProfile(value) {
  return Number(value.toFixed(2));
}
