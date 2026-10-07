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
    // 野外可招募单位是中立的：既不主动打人，也不该被人自动打。
    // 招募之后 isRecruitable 会被清掉，它就以普通战斗单位身份正常索敌。
    if (unit.isRecruitable) return null;
    if (unit.team === TEAMS.PLAYER) {
      return this.nearestUnit(unit, TEAMS.ENEMY, aggroRange)
        ?? this.nearestStructure(unit, this.game.enemyCamp, aggroRange);
    }
    // 有领地的敌方单位（路边营地 / 野生动物）只索敌**进入自己地盘**的目标。
    // 没有领地的巢穴夜袭单位照旧：先扑最近的玩家单位，再扑基地。
    const inZone = (candidate) => this.isInsideGuardZone(unit, candidate);
    const friendly = this.nearestUnit(unit, TEAMS.PLAYER, aggroRange, inZone);
    if (friendly) return friendly;
    return this.nearestStructure(unit, this.game.playerBase, aggroRange, inZone);
  }

  /**
   * 目标是否在单位的守卫领地内。
   *
   * 领地半径来自 `unit.guardRadius`（路边营地 / 野生动物），圆心是 `homePoint`。
   * 判定用的是**目标**的位置而不是单位自己的位置：这样单位不会因为追出去一点就
   * 脱战-重锁-再脱战来回抖，语义也清楚——"我的地盘里有人我才动手"。
   * 半径 ≤0 或没有 homePoint 一律视为不限制。
   */
  isInsideGuardZone(unit, target) {
    const radius = Number(unit?.guardRadius) || 0;
    if (radius <= 0) return true;
    const home = unit.homePoint;
    if (!home) return true;
    const position = getTargetPosition(target);
    if (!position) return false;
    return distance2D(position, home) <= radius;
  }

  isCurrentTargetValid(unit, target) {
    if (!target?.alive || !unit?.position) return false;
    const targetPosition = getTargetPosition(target);
    if (!targetPosition) return false;
    // 有领地的敌方单位：目标走出领地就脱离（回自己的地盘）。
    if (unit.team === TEAMS.ENEMY && unit.isRecruitable !== true) {
      return this.isInsideGuardZone(unit, target);
    }
    const distance = Math.max(
      0,
      distance2D(unit.position, targetPosition) - targetCombatRadius(target)
    );
    return distance <= this.game.modifiers.getAggroRange(unit);
  }

  nearestUnit(source, team, range, predicate = null) {
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const candidates = this.query(team, source.position, range + TARGET_QUERY_PADDING);
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      if (!candidate.alive || candidate === source) continue;
      // 没被招募的野外单位不是敌人：不进入任何自动索敌结果。
      // 放在索敌这一层而不是各调用点，是为了避免"某个技能忘了过滤"。
      if (candidate.isRecruitable) continue;
      if (predicate && !predicate(candidate)) continue;
      const distance = Math.max(
        0,
        distance2D(source.position, candidate.position) - targetCombatRadius(candidate)
      );
      if (distance > range) continue;
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
