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

let grid = null;
let cameFrom = null;
let gScore = null;
let closed = null;
let heap = null;

self.onmessage = (event) => {
  const message = event.data;
  if (message?.type === 'init') {
    initializeGrid(message.grid);
    return;
  }
  if (message?.type === 'findPath') {
    const result = findPath(message);
    self.postMessage({
      type: 'pathResult',
      id: message.id,
      route: result.route,
      stats: result.stats,
      target: message.end
    });
  }
};

function initializeGrid(data) {
  grid = {
    ...data,
    walkable: data.walkable instanceof Uint8Array
      ? data.walkable
      : new Uint8Array(data.walkable)
  };
  const length = grid.walkable.length;
  cameFrom = new Int32Array(length);
  gScore = new Float32Array(length);
  closed = new Uint8Array(length);
  heap = new MinHeap();
}

function findPath(message) {
  const stats = {
    findPath: 1,
    nearestWalkableCell: 0,
    hasLine: 0,
    expandedCells: 0
  };
  if (!grid || !message.start || !message.end) {
    return { route: [], stats };
  }

  const options = message.options ?? {};
  const startRequireLine = options.startRequireLine ?? true;
  let startCell = nearestWalkableCell(message.start, options.startSearchRings ?? 14, {
    requireLine: startRequireLine,
    stats
  });
  if (!startCell && startRequireLine && options.startAllowLooseFallback) {
    startCell = nearestWalkableCell(message.start, options.startSearchRings ?? 14, {
      requireLine: false,
      stats
    });
  }
  const endCell = nearestWalkableCell(message.end, options.endSearchRings ?? 14, {
    requireLine: options.endRequireLine ?? false,
    stats
  });
  if (!startCell || !endCell) return { route: [], stats };

  const startIndex = index(startCell.x, startCell.z);
  const endIndex = index(endCell.x, endCell.z);
  if (startIndex === endIndex) {
    const exactEnd = isWalkablePoint(message.end)
      ? cloneFlat(message.end)
      : cellCenter(endCell.x, endCell.z);
    const route = hasLine(message.start, exactEnd, stats)
      ? [exactEnd]
      : [cellCenter(startCell.x, startCell.z), exactEnd];
    return { route, stats };
  }

  cameFrom.fill(-1);
  gScore.fill(Number.POSITIVE_INFINITY);
  closed.fill(0);
  heap.clear();

  gScore[startIndex] = 0;
  heap.push(startIndex, heuristic(startCell, endCell));
  const maxIterations = options.maxIterations ?? grid.walkable.length;
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
    const cx = current % grid.cols;
    const cz = Math.floor(current / grid.cols);

    for (const neighbor of NEIGHBORS) {
      const nx = cx + neighbor.dx;
      const nz = cz + neighbor.dz;
      if (!canStep(cx, cz, nx, nz, neighbor)) continue;
      const next = index(nx, nz);
      if (closed[next]) continue;
      const tentative = gScore[current] + neighbor.cost * grid.cellSize;
      if (tentative >= gScore[next]) continue;
      cameFrom[next] = current;
      gScore[next] = tentative;
      heap.push(next, tentative + Math.hypot(nx - endCell.x, nz - endCell.z) * grid.cellSize);
    }
  }
  stats.expandedCells += iterations;

  if (!reached) return { route: [], stats };
  const cells = [];
  let current = endIndex;
  while (current >= 0) {
    cells.push(current);
    if (current === startIndex) break;
    current = cameFrom[current];
  }
  cells.reverse();

  const route = cells.map((cellIndex) => (
    cellCenter(cellIndex % grid.cols, Math.floor(cellIndex / grid.cols))
  ));
  if (route.length) {
    const exactEnd = cloneFlat(message.end);
    const previous = route.length > 1
      ? route[route.length - 2]
      : cloneFlat(message.start);
    route[route.length - 1] = isWalkablePoint(message.end) && hasLine(previous, exactEnd, stats)
      ? exactEnd
      : cellCenter(endCell.x, endCell.z);
  }
  return { route, stats };
}

function nearestWalkableCell(point, maxRing = 14, { requireLine = false, stats } = {}) {
  if (stats) stats.nearestWalkableCell += 1;
  const base = pointToCell(point);
  if (isReachableCellFromPoint(point, base.x, base.z, requireLine, stats)) return base;

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let ring = 1; ring <= maxRing; ring += 1) {
    for (let dz = -ring; dz <= ring; dz += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const x = base.x + dx;
        const z = base.z + dz;
        if (!isReachableCellFromPoint(point, x, z, requireLine, stats)) continue;
        const center = cellCenter(x, z);
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

function isReachableCellFromPoint(point, x, z, requireLine, stats) {
  if (!isCellWalkable(x, z)) return false;
  if (!requireLine) return true;
  return hasLine(point, cellCenter(x, z), stats);
}

function hasLine(start, end, stats = null, stepSize = grid.cellSize * 0.55) {
  if (stats) stats.hasLine += 1;
  if (!start || !end) return true;
  const distance = Math.hypot(end.x - start.x, end.z - start.z);
  const sampleCount = Math.max(1, Math.ceil(distance / Math.max(0.1, stepSize)));
  for (let i = 0; i <= sampleCount; i += 1) {
    const t = i / sampleCount;
    const point = {
      x: start.x + (end.x - start.x) * t,
      z: start.z + (end.z - start.z) * t
    };
    if (!isWalkablePoint(point)) return false;
  }
  return true;
}

function pointToCell(point) {
  return {
    x: Math.floor((point.x - grid.minX) / grid.cellSize),
    z: Math.floor((point.z - grid.minZ) / grid.cellSize)
  };
}

function cellCenter(x, z) {
  return {
    x: grid.minX + (x + 0.5) * grid.cellSize,
    y: 0,
    z: grid.minZ + (z + 0.5) * grid.cellSize
  };
}

function isWalkablePoint(point) {
  const cell = pointToCell(point);
  return isCellWalkable(cell.x, cell.z);
}

function isCellWalkable(x, z) {
  return inBounds(x, z) && grid.walkable[index(x, z)] === 1;
}

function canStep(cx, cz, nx, nz, neighbor) {
  if (!isCellWalkable(nx, nz)) return false;
  if (!isCellWalkable(cx + neighbor.dx, cz) || !isCellWalkable(cx, cz + neighbor.dz)) {
    return false;
  }
  return true;
}

function inBounds(x, z) {
  return x >= 0 && x < grid.cols && z >= 0 && z < grid.rows;
}

function index(x, z) {
  return z * grid.cols + x;
}

function cloneFlat(point) {
  return { x: point.x, y: 0, z: point.z };
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

  push(indexValue, priority) {
    this.indices.push(indexValue);
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

  bubbleUp(indexValue) {
    while (indexValue > 0) {
      const parent = Math.floor((indexValue - 1) / 2);
      if (this.priorities[parent] <= this.priorities[indexValue]) break;
      this.swap(parent, indexValue);
      indexValue = parent;
    }
  }

  sinkDown(indexValue) {
    while (true) {
      const left = indexValue * 2 + 1;
      const right = left + 1;
      let smallest = indexValue;
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
      if (smallest === indexValue) break;
      this.swap(smallest, indexValue);
      indexValue = smallest;
    }
  }

  swap(a, b) {
    [this.indices[a], this.indices[b]] = [this.indices[b], this.indices[a]];
    [this.priorities[a], this.priorities[b]] = [this.priorities[b], this.priorities[a]];
  }
}
