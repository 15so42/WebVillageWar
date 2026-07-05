import { MovementAgent } from '../entities/MovementAgent.js';
import { crowdRadius, isImmobileUnit } from './combatHelpers.js';

const SEPARATION_QUERY_RADIUS = 1.9;
const SEPARATION_CELL_SIZE = 2.25;
const SEPARATION_MAX_PUSH_PER_SECOND = 0.85;
const DIRECT_MOVE_SEPARATION_SCALE = 0.36;

export class MovementSystem {
  constructor(game) {
    this.game = game;
    this.index = new Map();
    this.candidates = [];
    this.stats = createSeparationStats();
  }

  attach(unit) {
    unit.movement = new MovementAgent(unit, this.game);
    return unit.movement;
  }

  updateSeparation(units, dt) {
    const maxPush = SEPARATION_MAX_PUSH_PER_SECOND * dt;
    const stats = createSeparationStats();
    this.rebuildIndex(units);
    this.index.forEach((bucket) => {
      if (bucket.length) stats.buckets += 1;
    });
    for (let i = 0; i < units.length; i += 1) {
      const a = units[i];
      if (!a.alive) continue;
      const candidates = this.queryNearby(a, SEPARATION_QUERY_RADIUS);
      for (let j = 0; j < candidates.length; j += 1) {
        const b = candidates[j];
        if (!b.alive || a.id >= b.id || a.team !== b.team) continue;
        stats.checks += 1;
        if (this.separatePair(a, b, maxPush)) {
          stats.pushes += 1;
        }
      }
    }
    this.stats = stats;
  }

  rebuildIndex(units) {
    this.index.clear();
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      if (!unit.alive) continue;
      const key = this.keyFor(unit.position.x, unit.position.z);
      const bucket = this.index.get(key) ?? [];
      if (!this.index.has(key)) this.index.set(key, bucket);
      bucket.push(unit);
    }
  }

  queryNearby(unit, range) {
    const output = this.candidates;
    output.length = 0;
    const minX = Math.floor((unit.position.x - range) / SEPARATION_CELL_SIZE);
    const maxX = Math.floor((unit.position.x + range) / SEPARATION_CELL_SIZE);
    const minZ = Math.floor((unit.position.z - range) / SEPARATION_CELL_SIZE);
    const maxZ = Math.floor((unit.position.z + range) / SEPARATION_CELL_SIZE);
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const bucket = this.index.get(`${x}:${z}`);
        if (!bucket) continue;
        output.push(...bucket);
      }
    }
    return output;
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
    const directMoveScale = a.moveGoalUsesDirectSteering || b.moveGoalUsesDirectSteering
      ? DIRECT_MOVE_SEPARATION_SCALE
      : 1;
    const push = Math.min(
      overlap * (aStatic || bStatic ? 1 : 0.5) * directMoveScale,
      maxPush * directMoveScale
    );
    const ax = a.position.x;
    const az = a.position.z;
    const bx = b.position.x;
    const bz = b.position.z;
    if (!aStatic) {
      a.position.x += nx * push;
      a.position.z += nz * push;
      a.movement?.clampToBattlefield();
    }
    if (!bStatic) {
      b.position.x -= nx * push;
      b.position.z -= nz * push;
      b.movement?.clampToBattlefield();
    }
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

  crowdRadius(unit) {
    return crowdRadius(unit);
  }

  keyFor(x, z) {
    return `${Math.floor(x / SEPARATION_CELL_SIZE)}:${Math.floor(z / SEPARATION_CELL_SIZE)}`;
  }
}

function deterministicPairAngle(a, b) {
  const seed = (Math.min(a.id, b.id) * 37 + Math.max(a.id, b.id) * 61) % 360;
  return (seed / 360) * Math.PI * 2;
}

function createSeparationStats() {
  return {
    checks: 0,
    pushes: 0,
    buckets: 0
  };
}
