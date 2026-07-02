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
    const current = unit.target?.alive !== false ? unit.target : null;
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
    const friendly = this.nearestUnit(unit, TEAMS.PLAYER, aggroRange);
    if (friendly) return friendly;
    return this.nearestStructure(unit, this.game.playerBase, aggroRange);
  }

  nearestUnit(source, team, range, predicate = null) {
    let best = null;
    let bestDistance = range;
    const candidates = this.query(team, source.position, range + TARGET_QUERY_PADDING);
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      if (!candidate.alive || candidate === source) continue;
      if (predicate && !predicate(candidate)) continue;
      const distance = Math.max(
        0,
        distance2D(source.position, candidate.position) - targetCombatRadius(candidate)
      );
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
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
