import { TEAMS } from '../data/gameData.js';
import { distance2D } from '../utils/math.js';

export const SELF_DESTRUCT_RADIUS = 6;
export const SELF_DESTRUCT_DAMAGE_PER_LEVEL = 3;

export function selfDestructDamageForLevel(level = 1) {
  return Math.max(1, Math.floor(Number(level) || 1)) * SELF_DESTRUCT_DAMAGE_PER_LEVEL;
}

export function selfDestructTargets(unit, {
  enemyUnits = [],
  friendlyUnits = []
} = {}) {
  if (!unit?.position) return [];
  const candidates = unit.team === TEAMS.PLAYER ? enemyUnits : friendlyUnits;
  return candidates.filter((target) => (
    target?.alive &&
    target.position &&
    distance2D(unit.position, target.position) <= SELF_DESTRUCT_RADIUS
  ));
}

export function performSelfDestructAttacks(unit, {
  enemyUnits = [],
  friendlyUnits = []
} = {}, applyAttack) {
  if (typeof applyAttack !== 'function') return 0;
  let hitCount = 0;
  selfDestructTargets(unit, { enemyUnits, friendlyUnits }).forEach((target) => {
    if (applyAttack(unit, target, {
      isExplosionDamage: true,
      allowDeadSourceEffects: true
    })) hitCount += 1;
  });
  return hitCount;
}

export function performSelfDestructExplosion(unit, state, level, applyDamage) {
  if (typeof applyDamage !== 'function') return 0;
  const damage = selfDestructDamageForLevel(level);
  let hitCount = 0;
  selfDestructTargets(unit, state).forEach((target) => {
    if (applyDamage(unit, target, damage, {
      isExplosionDamage: true,
      allowDeadSourceEffects: true
    })) hitCount += 1;
  });
  return hitCount;
}
