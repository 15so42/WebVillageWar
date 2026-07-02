import * as THREE from 'three';

const DEFAULT_CELL_SIZE = 0.72;
const CARDINAL_NEIGHBORS = [
  { dx: 1, dz: 0, cost: 1 },
  { dx: -1, dz: 0, cost: 1 },
  { dx: 0, dz: 1, cost: 1 },
  { dx: 0, dz: -1, cost: 1 }
];
const DIAGONAL_NEIGHBORS = [
  { dx: 1, dz: 1, cost: Math.SQRT2 },
  { dx: -1, dz: 1, cost: Math.SQRT2 },
  { dx: 1, dz: -1, cost: Math.SQRT2 },
  { dx: -1, dz: -1, cost: Math.SQRT2 }
];
const NEIGHBORS = [...CARDINAL_NEIGHBORS, ...DIAGONAL_NEIGHBORS];

export class NavigationGrid {
  constructor({
    minX,
    maxX,
    minZ,
    maxZ,
    cellSize = DEFAULT_CELL_SIZE,
    isWalkable,
    heightAt,
    canTraverse = null
  }) {
    this.minX = minX;
    this.maxX = maxX;
    this.minZ = minZ;
    this.maxZ = maxZ;
    this.cellSize = cellSize;
    this.isWalkablePoint = isWalkable;
    this.heightAt = heightAt;
    this.canTraversePoint = canTraverse;
    this.cols = Math.ceil((maxX - minX) / cellSize);
    this.rows = Math.ceil((maxZ - minZ) / cellSize);
    this.walkable = new Uint8Array(this.cols * this.rows);
    this.build();
    this.debugPoints = null;
    this.debugLines = null;
    this.cameFrom = new Int32Array(this.walkable.length);
    this.gScore = new Float32Array(this.walkable.length);
    this.closed = new Uint8Array(this.walkable.length);
    this.heap = new MinHeap();
    this.stats = {
      findPath: 0,
      pathDistance: 0,
      hasLine: 0,
      nearestWalkableCell: 0,
      expandedCells: 0
    };
  }

  ensureDebugGeometry() {
    this.debugPoints = this.debugPoints ?? this.buildDebugPoints();
    this.debugLines = this.debugLines ?? this.buildDebugLines();
  }

  build() {
    for (let z = 0; z < this.rows; z += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        const center = this.cellCenter(x, z);
        this.walkable[this.index(x, z)] = this.isWalkablePoint(center) ? 1 : 0;
      }
    }
  }

  index(x, z) {
    return z * this.cols + x;
  }

  inBounds(x, z) {
    return x >= 0 && x < this.cols && z >= 0 && z < this.rows;
  }

  pointToCell(point) {
    return {
      x: Math.floor((point.x - this.minX) / this.cellSize),
      z: Math.floor((point.z - this.minZ) / this.cellSize)
    };
  }

  isCellWalkable(x, z) {
    return this.inBounds(x, z) && this.walkable[this.index(x, z)] === 1;
  }

  cellCenter(x, z) {
    const px = this.minX + (x + 0.5) * this.cellSize;
    const pz = this.minZ + (z + 0.5) * this.cellSize;
    return new THREE.Vector3(px, 0, pz);
  }

  buildDebugPoints() {
    const points = [];
    for (let z = 0; z < this.rows; z += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        if (!this.isCellWalkable(x, z)) continue;
        if ((x + z) % 2 !== 0) continue;
        points.push(this.cellCenter(x, z));
      }
    }
    return points;
  }

  buildDebugLines() {
    const positions = [];
    const addLine = (ax, az, bx, bz, y) => {
      positions.push(ax, y, az, bx, y, bz);
    };

    for (let z = 0; z < this.rows; z += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        if (!this.isCellWalkable(x, z)) continue;
        const x0 = this.minX + x * this.cellSize;
        const z0 = this.minZ + z * this.cellSize;
        const x1 = Math.min(x0 + this.cellSize, this.maxX);
        const z1 = Math.min(z0 + this.cellSize, this.maxZ);
        const y = this.heightAt(this.cellCenter(x, z));
        if (!this.isCellWalkable(x - 1, z)) addLine(x0, z0, x0, z1, y);
        if (!this.isCellWalkable(x + 1, z)) addLine(x1, z0, x1, z1, y);
        if (!this.isCellWalkable(x, z - 1)) addLine(x0, z0, x1, z0, y);
        if (!this.isCellWalkable(x, z + 1)) addLine(x0, z1, x1, z1, y);
      }
    }
    return { positions };
  }

  hasLine(start, end, stepSize = this.cellSize * 0.55) {
    this.stats.hasLine += 1;
    if (!start || !end) return true;
    const distance = Math.hypot(end.x - start.x, end.z - start.z);
    const sampleCount = Math.max(1, Math.ceil(distance / Math.max(0.1, stepSize)));
    let previous = null;
    for (let i = 0; i <= sampleCount; i += 1) {
      const t = i / sampleCount;
      const x = start.x + (end.x - start.x) * t;
      const z = start.z + (end.z - start.z) * t;
      const point = { x, z };
      if (!this.isWalkablePoint(point)) return false;
      if (previous && !this.canTraverse(previous, point)) return false;
      previous = point;
    }
    return true;
  }

  nearestWalkableCell(point, maxRing = 14, options = {}) {
    this.stats.nearestWalkableCell += 1;
    const base = this.pointToCell(point);
    if (this.isReachableCellFromPoint(point, base.x, base.z, options)) return base;

    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let ring = 1; ring <= maxRing; ring += 1) {
      for (let dz = -ring; dz <= ring; dz += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const x = base.x + dx;
          const z = base.z + dz;
          if (!this.isReachableCellFromPoint(point, x, z, options)) continue;
          const center = this.cellCenter(x, z);
          const score = Math.hypot(center.x - point.x, center.z - point.z);
          if (score < bestScore) {
            best = { x, z };
            bestScore = score;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  isReachableCellFromPoint(point, x, z, options = {}) {
    if (!this.isCellWalkable(x, z)) return false;
    if (!options.requireLine) return true;
    return this.hasLine(point, this.cellCenter(x, z));
  }

  findPath(start, end, options = {}) {
    this.stats.findPath += 1;
    if (!start || !end) return [];
    const startRequireLine = options.startRequireLine ?? true;
    let startCell = this.nearestWalkableCell(start, options.startSearchRings ?? 14, {
      requireLine: startRequireLine
    });
    if (!startCell && startRequireLine && options.startAllowLooseFallback) {
      startCell = this.nearestWalkableCell(start, options.startSearchRings ?? 14, {
        requireLine: false
      });
    }
    const endCell = this.nearestWalkableCell(end, options.endSearchRings ?? 14, {
      requireLine: options.endRequireLine ?? false
    });
    if (!startCell || !endCell) return [];
    const startIndex = this.index(startCell.x, startCell.z);
    const endIndex = this.index(endCell.x, endCell.z);
    if (startIndex === endIndex) {
      const target = this.isWalkablePoint(end) ? cloneFlat(end) : this.cellCenter(endCell.x, endCell.z);
      return [target];
    }

    const cameFrom = this.cameFrom;
    cameFrom.fill(-1);
    const gScore = this.gScore;
    gScore.fill(Number.POSITIVE_INFINITY);
    const closed = this.closed;
    closed.fill(0);
    const heap = this.heap;
    heap.clear();

    gScore[startIndex] = 0;
    heap.push(startIndex, heuristic(startCell, endCell));
    const maxIterations = options.maxIterations ?? this.walkable.length;
    let iterations = 0;
    let reached = false;

    while (heap.length > 0 && iterations < maxIterations) {
      iterations += 1;
      const current = heap.pop();
      if (closed[current]) continue;
      if (current === endIndex) {
        reached = true;
        break;
      }
      closed[current] = 1;
      const cx = current % this.cols;
      const cz = Math.floor(current / this.cols);

      for (const neighbor of NEIGHBORS) {
        const nx = cx + neighbor.dx;
        const nz = cz + neighbor.dz;
        if (!this.canStep(cx, cz, nx, nz, neighbor)) continue;
        const next = this.index(nx, nz);
        if (closed[next]) continue;
        const tentative = gScore[current] + neighbor.cost * this.cellSize;
        if (tentative >= gScore[next]) continue;
        cameFrom[next] = current;
        gScore[next] = tentative;
        heap.push(next, tentative + Math.hypot(nx - endCell.x, nz - endCell.z) * this.cellSize);
      }
    }
    this.stats.expandedCells += iterations;

    if (!reached) return [];
    const cells = [];
    let current = endIndex;
    while (current >= 0) {
      cells.push(current);
      if (current === startIndex) break;
      current = cameFrom[current];
    }
    cells.reverse();

    const rawPoints = cells.map((index) => (
      this.cellCenter(index % this.cols, Math.floor(index / this.cols))
    ));
    if (rawPoints.length) {
      const exactEnd = cloneFlat(end);
      rawPoints[rawPoints.length - 1] = this.isWalkablePoint(end)
        ? exactEnd
        : this.cellCenter(endCell.x, endCell.z);
    }
    return options.smooth === false
      ? rawPoints
      : smoothPath(start, rawPoints, this);
  }

  pathDistance(start, end) {
    this.stats.pathDistance += 1;
    const path = this.findPath(start, end, {
      smooth: false,
      startAllowLooseFallback: true,
      endRequireLine: false
    });
    if (!path.length) return Infinity;
    let distance = Math.hypot(path[0].x - start.x, path[0].z - start.z);
    for (let i = 1; i < path.length; i += 1) {
      distance += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    }
    distance += Math.hypot(end.x - path[path.length - 1].x, end.z - path[path.length - 1].z);
    return distance;
  }

  takeStats() {
    const stats = { ...this.stats };
    this.stats.findPath = 0;
    this.stats.pathDistance = 0;
    this.stats.hasLine = 0;
    this.stats.nearestWalkableCell = 0;
    this.stats.expandedCells = 0;
    return stats;
  }

  toWorkerData() {
    return {
      minX: this.minX,
      maxX: this.maxX,
      minZ: this.minZ,
      maxZ: this.maxZ,
      cellSize: this.cellSize,
      cols: this.cols,
      rows: this.rows,
      walkable: new Uint8Array(this.walkable)
    };
  }

  canStep(cx, cz, nx, nz, neighbor) {
    if (!this.isCellWalkable(nx, nz)) return false;
    if (!this.isCellWalkable(cx + neighbor.dx, cz) || !this.isCellWalkable(cx, cz + neighbor.dz)) {
      return false;
    }
    const from = this.cellCenter(cx, cz);
    const to = this.cellCenter(nx, nz);
    return this.canTraverse(from, to);
  }

  canTraverse(start, end) {
    return this.canTraversePoint?.(start, end) ?? true;
  }
}

function smoothPath(start, points, grid) {
  if (points.length <= 1) return points.map((point) => point.clone());
  const smoothed = [];
  let anchor = start;
  let index = 0;
  while (index < points.length) {
    let farthest = index;
    while (
      farthest + 1 < points.length &&
      grid.hasLine(anchor, points[farthest + 1])
    ) {
      farthest += 1;
    }
    const waypoint = points[farthest].clone();
    waypoint.y = 0;
    smoothed.push(waypoint);
    anchor = waypoint;
    index = farthest + 1;
  }
  return smoothed;
}

function cloneFlat(point) {
  return new THREE.Vector3(point.x, 0, point.z);
}

function heuristic(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

class MinHeap {
  constructor() {
    this.indices = [];
    this.priorities = [];
  }

  get length() {
    return this.indices.length;
  }

  push(index, priority) {
    this.indices.push(index);
    this.priorities.push(priority);
    this.bubbleUp(this.indices.length - 1);
  }

  clear() {
    this.indices.length = 0;
    this.priorities.length = 0;
  }

  pop() {
    const root = this.indices[0];
    const lastIndex = this.indices.pop();
    const lastPriority = this.priorities.pop();
    if (this.indices.length > 0) {
      this.indices[0] = lastIndex;
      this.priorities[0] = lastPriority;
      this.sinkDown(0);
    }
    return root;
  }

  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.priorities[parent] <= this.priorities[index]) break;
      this.swap(parent, index);
      index = parent;
    }
  }

  sinkDown(index) {
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (
        left < this.indices.length &&
        this.priorities[left] < this.priorities[smallest]
      ) {
        smallest = left;
      }
      if (
        right < this.indices.length &&
        this.priorities[right] < this.priorities[smallest]
      ) {
        smallest = right;
      }
      if (smallest === index) break;
      this.swap(smallest, index);
      index = smallest;
    }
  }

  swap(a, b) {
    [this.indices[a], this.indices[b]] = [this.indices[b], this.indices[a]];
    [this.priorities[a], this.priorities[b]] = [this.priorities[b], this.priorities[a]];
  }
}
