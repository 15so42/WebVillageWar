import { TEAMS } from '../data/gameData.js';
import { distance2D } from '../utils/math.js';
import {
  getTargetPosition,
  targetCombatRadius,
  targetSearchDelay,
  roundProfile
} from './combatHelpers.js';

const TARGET_RESCAN_INTERVAL = 0.5;
const TARGET_IDLE_RESCAN_INTERVAL = 0.5;
const TARGET_RESCAN_JITTER = 0.14;
const TARGET_INDEX_INTERVAL = 0.5;
const TARGET_QUERY_PADDING = 3.2;
const TARGET_GRID_CELL_SIZE = 5.5;

const DEFAULT_ENEMY_TARGET_PRIORITY = {
  distanceWeight: 1.15,
  supportWeight: 2.5,
  buildingWeight: 2.2,
  backlineWeight: 1.7,
  backlineAttackRange: 5,
  woundedWeight: 1.3,
  woundedHealthRatio: 0.45,
  roleWeights: { ranged: 1.35, support: 1.5 }
};

export class TargetingSystem {
  constructor(game) {
    this.game = game;
    this.indexTimer = 0;
    this.indices = new Map();
    this.scratch = [];
    this.stats = createTargetingStats();
  }

  register(unit) {
    unit.targetSearchTimer = unit.targetSearchTimer ?? targetSearchDelay(unit, 0, TARGET_RESCAN_JITTER);
  }

  unregister(unit) {
    if (!unit) return;
    unit.target = null;
  }

  handleKill(deadUnit, source = null) {
    if (!deadUnit?.position || !source?.alive || source === deadUnit) return;
    if (!source.definition || !source.registry) return;
    this.rebuild();
    source.target = this.acquireTarget(source);
    source.targetSearchTimer = source.target
      ? targetSearchDelay(source, TARGET_RESCAN_INTERVAL, TARGET_RESCAN_JITTER)
      : 0;
  }

  update(dt) {
    this.indexTimer -= dt;
    if (this.indexTimer > 0 && this.indices.size > 0) return;
    this.indexTimer = TARGET_INDEX_INTERVAL;
    this.rebuild();
  }

  rebuild() {
    this.indices.clear();
    const units = this.game.unitRegistry?.allUnits ?? [];
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      if (!unit.alive) continue;
      let index = this.indices.get(unit.team);
      if (!index) {
        index = new SpatialHash(TARGET_GRID_CELL_SIZE);
        this.indices.set(unit.team, index);
      }
      index.insert(unit);
    }
  }

  targetForUnit(unit, dt, profile = null) {
    unit.targetSearchTimer = Math.max(0, (unit.targetSearchTimer ?? targetSearchDelay(unit, 0, TARGET_RESCAN_JITTER)) - dt);
    let current = unit.target?.alive !== false ? unit.target : null;
    if (current && !this.isCurrentTargetValid(unit, current)) {
      unit.target = null;
      current = null;
      unit.targetSearchTimer = 0;
      this.game.attacks?.cancelPendingAttacksFor?.([unit]);
    }
    if (unit.targetSearchTimer > 0) {
      return current;
    }

    const startedAt = profile ? performance.now() : 0;
    const target = this.acquireTarget(unit);
    if (profile) {
      profile.targetSearches += 1;
      profile.targetingMs += roundProfile(performance.now() - startedAt);
      profile.targetQueries += this.stats.queries;
      profile.targetCandidates += this.stats.candidates;
    }
    unit.target = target;
    unit.targetSearchTimer = target
      ? targetSearchDelay(unit, TARGET_RESCAN_INTERVAL, TARGET_RESCAN_JITTER)
      : targetSearchDelay(unit, TARGET_IDLE_RESCAN_INTERVAL, TARGET_RESCAN_JITTER);
    return target;
  }

  acquireTarget(unit) {
    const aggroRange = this.game.modifiers.getAggroRange(unit);
    if (unit.team === TEAMS.PLAYER) {
      const guardAttacker = this.acquireGuardAttacker(unit);
      if (guardAttacker) return guardAttacker;
      const guardFilter = unit.controlMode === 'guard'
        ? (target) => this.isInsideGuardRadius(unit, target)
        : null;
      return this.nearestUnit(unit, TEAMS.ENEMY, aggroRange, guardFilter)
        ?? this.nearestStructure(unit, this.game.enemyCamp, aggroRange, guardFilter);
    }
    if (unit.isWildlife) {
      const friendly = this.nearestUnit(unit, TEAMS.PLAYER, aggroRange);
      if (
        friendly &&
        distance2D(unit.spawnPoint, friendly.position) <= unit.leashRadius + aggroRange
      ) {
        return friendly;
      }
      return null;
    }
    const guardFilter = unit.controlMode === 'guard'
      ? (target) => this.isInsideGuardRadius(unit, target)
      : null;
    const friendly = this.nearestUnit(unit, TEAMS.PLAYER, aggroRange, guardFilter);
    if (friendly) return friendly;
    return this.nearestStructure(unit, this.game.playerBase, aggroRange, guardFilter);
  }

  isCurrentTargetValid(unit, target) {
    if (!target?.alive || !unit?.position) return false;
    if (unit.controlMode === 'guard' && !this.isInsideGuardRadius(unit, target)) {
      return false;
    }
    if (
      unit.controlMode === 'guard' &&
      target === unit.lastAttacker &&
      this.isInsideGuardRadius(unit, target)
    ) {
      return true;
    }
    if (unit.isWildlife && target.position && unit.spawnPoint) {
      const aggroRange = this.game.modifiers.getAggroRange(unit);
      if (distance2D(unit.spawnPoint, target.position) > unit.leashRadius + aggroRange) {
        return false;
      }
    }
    const targetPosition = getTargetPosition(target);
    if (!targetPosition) return false;
    const distance = Math.max(
      0,
      distance2D(unit.position, targetPosition) - targetCombatRadius(target)
    );
    return distance <= this.game.modifiers.getAggroRange(unit);
  }

  nearestUnit(source, team, range, predicate = null) {
    let best = null;
    let bestScore = -Infinity;
    const candidates = this.query(team, source.position, range + TARGET_QUERY_PADDING);
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      if (!candidate.alive || candidate === source) continue;
      if (predicate && !predicate(candidate)) continue;
      const distance = Math.max(
        0,
        distance2D(source.position, candidate.position) - targetCombatRadius(candidate)
      );
      if (distance > range) continue;
      const score = targetPriorityScore(source, candidate, distance);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  query(team, position, range) {
    const index = this.indices.get(team);
    if (!index || !position) return [];
    this.scratch.length = 0;
    index.query(position, range, this.scratch);
    this.stats.queries += 1;
    this.stats.candidates += this.scratch.length;
    return this.scratch;
  }

  countAlliesInRadius(source, radius, predicate = null) {
    if (!source?.position || !Number.isFinite(radius) || radius <= 0) return 0;
    const candidates = this.query(source.team, source.position, radius);
    let count = 0;
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      if (!candidate.alive || candidate === source) continue;
      if (candidate.underConstruction) continue;
      if (predicate && !predicate(candidate)) continue;
      if (distance2D(source.position, candidate.position) > radius) continue;
      count += 1;
    }
    return count;
  }

  nearestStructure(source, structure, range, predicate = null) {
    if (!structure?.alive) return null;
    if (predicate && !predicate(structure)) return null;
    return distance2D(source.position, structure.position) <= range ? structure : null;
  }

  isInsideGuardRadius(unit, target) {
    if (!unit.guardPoint || !Number.isFinite(unit.guardRadius)) return true;
    const targetPosition = getTargetPosition(target);
    if (!targetPosition) return false;
    return distance2D(unit.guardPoint, targetPosition) <= unit.guardRadius + targetCombatRadius(target);
  }

  acquireGuardAttacker(unit) {
    if (unit.controlMode !== 'guard' || unit.team !== TEAMS.PLAYER) return null;
    const attacker = unit.lastAttacker;
    if (!attacker?.alive || attacker.team === unit.team) return null;
    if (!this.isInsideGuardRadius(unit, attacker)) return null;
    const elapsed = this.game.elapsedTime ?? 0;
    const seenAt = unit.lastAttackerTime ?? 0;
    if (elapsed - seenAt > 6) return null;
    return attacker;
  }

  beginFrame() {
    this.stats = createTargetingStats();
  }
}

class SpatialHash {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.buckets = new Map();
  }

  insert(unit) {
    const key = this.keyFor(unit.position.x, unit.position.z);
    const bucket = this.buckets.get(key) ?? [];
    if (!this.buckets.has(key)) {
      this.buckets.set(key, bucket);
    }
    bucket.push(unit);
  }

  query(position, range, output) {
    const minX = Math.floor((position.x - range) / this.cellSize);
    const maxX = Math.floor((position.x + range) / this.cellSize);
    const minZ = Math.floor((position.z - range) / this.cellSize);
    const maxZ = Math.floor((position.z + range) / this.cellSize);
    const rangeSq = range * range;
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const bucket = this.buckets.get(`${x}:${z}`);
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i += 1) {
          const unit = bucket[i];
          const dx = unit.position.x - position.x;
          const dz = unit.position.z - position.z;
          if (dx * dx + dz * dz <= rangeSq) {
            output.push(unit);
          }
        }
      }
    }
    return output;
  }

  keyFor(x, z) {
    return `${Math.floor(x / this.cellSize)}:${Math.floor(z / this.cellSize)}`;
  }
}

function createTargetingStats() {
  return {
    queries: 0,
    candidates: 0
  };
}

function targetPriorityScore(source, candidate, distance) {
  let priority = source?.definition?.targetPriority;
  if (!priority && source?.team === TEAMS.ENEMY) {
    priority = DEFAULT_ENEMY_TARGET_PRIORITY;
  }
  if (!priority) return -distance;
  const distanceWeight = Math.max(0.05, priority.distanceWeight ?? 1);
  let score = -distance * distanceWeight;
  const roleWeights = priority.roleWeights ?? {};
  score += roleWeights[candidate.definition?.role] ?? 0;
  if (candidate.definition?.support) {
    score += priority.supportWeight ?? 0;
  }
  if (candidate.isBuilding) {
    score += priority.buildingWeight ?? 0;
  }
  if (candidate.definition?.attackDamageType === 'magic') {
    score += priority.magicUserWeight ?? 0;
  }
  const attackRange = candidate.definition?.attackRange ?? 0;
  if (attackRange >= (priority.backlineAttackRange ?? 5.5)) {
    score += priority.backlineWeight ?? 0;
  }
  const healthRatio = candidate.health / Math.max(1, candidate.maxHealth);
  if (healthRatio <= (priority.woundedHealthRatio ?? 0)) {
    score += priority.woundedWeight ?? 0;
  }
  return score;
}
