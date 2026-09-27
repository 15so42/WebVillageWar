import { normalizeTerrainLayout } from './terrainEditorAssets.js';

const DIRECTIONS = Object.freeze([
  { key: 'north', dx: 0, dz: -1, bit: 1, opposite: 2 },
  { key: 'east', dx: 1, dz: 0, bit: 2, opposite: 3 },
  { key: 'south', dx: 0, dz: 1, bit: 4, opposite: 0 },
  { key: 'west', dx: -1, dz: 0, bit: 8, opposite: 1 }
]);

const STYLE_WEIGHTS = Object.freeze({
  mixed: { open: 1, forest: 1, rock: 1 },
  forest: { open: 0.82, forest: 1.5, rock: 0.66 },
  fortress: { open: 0.72, forest: 0.62, rock: 1.65 }
});

function seededRandom(seed = 1) {
  let state = Math.max(1, Math.floor(Math.abs(seed))) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function popcount(mask) {
  let count = 0;
  for (let value = mask; value; value >>= 1) count += value & 1;
  return count;
}

function socketsFor(family, mask) {
  return DIRECTIONS.map((direction) => ((mask & direction.bit) ? family : 'open'));
}

function createTileCatalog(style = 'mixed') {
  const styleWeights = STYLE_WEIGHTS[style] ?? STYLE_WEIGHTS.mixed;
  const tiles = [
    {
      id: 'open-empty',
      family: 'open',
      mask: 0,
      sockets: ['open', 'open', 'open', 'open'],
      weight: 5.4 * styleWeights.open,
      assetType: null
    },
    {
      id: 'open-pine',
      family: 'open',
      mask: 0,
      sockets: ['open', 'open', 'open', 'open'],
      weight: 0.62 * styleWeights.forest,
      assetType: 'pine-small'
    },
    {
      id: 'open-boulder',
      family: 'open',
      mask: 0,
      sockets: ['open', 'open', 'open', 'open'],
      weight: 0.34 * styleWeights.rock,
      assetType: 'boulder-large'
    },
    {
      id: 'open-cottage',
      family: 'open',
      mask: 0,
      sockets: ['open', 'open', 'open', 'open'],
      weight: 0.075,
      assetType: 'cottage'
    },
    {
      id: 'open-camp',
      family: 'open',
      mask: 0,
      sockets: ['open', 'open', 'open', 'open'],
      weight: 0.035,
      assetType: 'monster-camp'
    },
    {
      id: 'open-flag',
      family: 'open',
      mask: 0,
      sockets: ['open', 'open', 'open', 'open'],
      weight: 0.16,
      assetType: 'banner-totem'
    }
  ];

  ['forest', 'rock'].forEach((family) => {
    for (let mask = 0; mask < 16; mask += 1) {
      const connections = popcount(mask);
      const familyWeight = family === 'forest' ? styleWeights.forest : styleWeights.rock;
      tiles.push({
        id: `${family}-${mask.toString(2).padStart(4, '0')}`,
        family,
        mask,
        sockets: socketsFor(family, mask),
        weight: familyWeight * (0.68 + connections * 0.36),
        assetType: null
      });
    }
  });

  return tiles;
}

function createCompatibility(tiles) {
  return DIRECTIONS.map((direction, directionIndex) => tiles.map((tile) => {
    const compatible = new Set();
    tiles.forEach((neighbor, neighborIndex) => {
      if (tile.sockets[directionIndex] === neighbor.sockets[direction.opposite]) {
        compatible.add(neighborIndex);
      }
    });
    return compatible;
  }));
}

function createHeightTileCatalog() {
  const tiles = [];
  for (let nw = 0; nw <= 2; nw += 1) {
    for (let ne = 0; ne <= 2; ne += 1) {
      for (let se = 0; se <= 2; se += 1) {
        for (let sw = 0; sw <= 2; sw += 1) {
          const corners = [nw, ne, se, sw];
          const min = Math.min(...corners);
          const max = Math.max(...corners);
          const range = max - min;
          const flat = min === max;
          tiles.push({
            id: `height-${corners.join('')}`,
            corners,
            min,
            max,
            flat,
            sockets: [
              `${nw}:${ne}`,
              `${ne}:${se}`,
              `${sw}:${se}`,
              `${nw}:${sw}`
            ],
            weight: flat
              ? (min === 0 ? 5.2 : min === 1 ? 1.5 : 0.28)
              : (range === 1 ? (min === 0 ? 0.42 : 0.18) : 0.025)
          });
        }
      }
    }
  }
  return tiles;
}

function distanceToSegment(x, z, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 0.0001) return Math.hypot(x - start.x, z - start.z);
  const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (z - start.z) * dz) / lengthSquared));
  return Math.hypot(x - (start.x + dx * t), z - (start.z + dz * t));
}

function distanceToPath(x, z, pathPoints) {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < pathPoints.length - 1; index += 1) {
    nearest = Math.min(nearest, distanceToSegment(x, z, pathPoints[index], pathPoints[index + 1]));
  }
  return nearest;
}

function isReservedCell(x, z, config) {
  const pathClearance = (config.pathWidth ?? 8.2) * 0.5 + 4.4;
  if (distanceToPath(x, z, config.pathPoints) < pathClearance) return true;
  if (config.playerBasePosition && Math.hypot(x - config.playerBasePosition.x, z - config.playerBasePosition.z) < 10) {
    return true;
  }
  if (config.enemyCampPosition && Math.hypot(x - config.enemyCampPosition.x, z - config.enemyCampPosition.z) < 9) {
    return true;
  }
  return (config.altars ?? []).some((altar) => (
    Math.hypot(x - altar.position.x, z - altar.position.z) < (altar.clearingRadius ?? 6) + 2.8
  ));
}

function initialDomainForCell(cell, tiles, emptyIndex, columns) {
  if (cell.reserved) return new Set([emptyIndex]);
  const all = tiles.map((_, index) => index);
  const sideBorder = cell.column === 0 || cell.column === columns - 1;
  if (sideBorder) {
    return new Set(all.filter((index) => tiles[index].family === 'rock'));
  }
  const sideShoulder = cell.column === 1 || cell.column === columns - 2;
  if (sideShoulder) {
    return new Set(all.filter((index) => (
      tiles[index].family === 'rock'
      || tiles[index].family === 'forest'
      || tiles[index].id === 'open-empty'
    )));
  }
  return new Set(all);
}

function propagate(domains, startIndices, grid, tiles, compatibility) {
  const queue = [...startIndices];
  const queued = new Set(queue);
  while (queue.length) {
    const cellIndex = queue.shift();
    queued.delete(cellIndex);
    const cell = grid.cells[cellIndex];
    const domain = domains[cellIndex];
    for (let directionIndex = 0; directionIndex < DIRECTIONS.length; directionIndex += 1) {
      const direction = DIRECTIONS[directionIndex];
      const neighborColumn = cell.column + direction.dx;
      const neighborRow = cell.row + direction.dz;
      if (
        neighborColumn < 0
        || neighborColumn >= grid.columns
        || neighborRow < 0
        || neighborRow >= grid.rows
      ) continue;
      const neighborIndex = neighborRow * grid.columns + neighborColumn;
      const allowed = new Set();
      domain.forEach((tileIndex) => {
        compatibility[directionIndex][tileIndex].forEach((candidate) => allowed.add(candidate));
      });
      const neighborDomain = domains[neighborIndex];
      let changed = false;
      [...neighborDomain].forEach((candidate) => {
        if (allowed.has(candidate)) return;
        neighborDomain.delete(candidate);
        changed = true;
      });
      if (neighborDomain.size === 0) return false;
      if (changed && !queued.has(neighborIndex)) {
        queue.push(neighborIndex);
        queued.add(neighborIndex);
      }
    }
  }
  return true;
}

function entropy(domain, tiles) {
  let weightSum = 0;
  let weightedLogSum = 0;
  domain.forEach((tileIndex) => {
    const weight = Math.max(0.0001, tiles[tileIndex].weight);
    weightSum += weight;
    weightedLogSum += weight * Math.log(weight);
  });
  return Math.log(weightSum) - weightedLogSum / weightSum;
}

function chooseWeighted(domain, tiles, random) {
  let total = 0;
  domain.forEach((tileIndex) => { total += tiles[tileIndex].weight; });
  let value = random() * total;
  for (const tileIndex of domain) {
    value -= tiles[tileIndex].weight;
    if (value <= 0) return tileIndex;
  }
  return domain.values().next().value;
}

function collapseGrid(grid, tiles, compatibility, seed) {
  const emptyIndex = tiles.findIndex((tile) => tile.id === 'open-empty');
  const random = seededRandom(seed);
  const domains = grid.cells.map((cell) => initialDomainForCell(cell, tiles, emptyIndex, grid.columns));
  const constrained = domains
    .map((domain, index) => (domain.size < tiles.length ? index : -1))
    .filter((index) => index >= 0);
  if (!propagate(domains, constrained, grid, tiles, compatibility)) return null;

  while (true) {
    let bestIndex = -1;
    let bestEntropy = Number.POSITIVE_INFINITY;
    domains.forEach((domain, index) => {
      if (domain.size <= 1) return;
      const value = entropy(domain, tiles) + random() * 0.00001;
      if (value < bestEntropy) {
        bestEntropy = value;
        bestIndex = index;
      }
    });
    if (bestIndex < 0) break;
    const chosen = chooseWeighted(domains[bestIndex], tiles, random);
    domains[bestIndex] = new Set([chosen]);
    if (!propagate(domains, [bestIndex], grid, tiles, compatibility)) return null;
  }

  return domains.map((domain) => domain.values().next().value);
}

function initialHeightDomainForCell(cell, tiles, grid) {
  const all = tiles.map((_, index) => index);
  const perimeter = (
    cell.column === 0
    || cell.column === grid.columns - 1
    || cell.row === 0
    || cell.row === grid.rows - 1
  );
  if (cell.reserved || perimeter) {
    return new Set(all.filter((index) => tiles[index].flat && tiles[index].min === 0));
  }
  return new Set(all);
}

function collapseHeightGrid(grid, heightTiles, compatibility, seed) {
  const random = seededRandom(seed);
  const domains = grid.cells.map((cell) => (
    initialHeightDomainForCell(cell, heightTiles, grid)
  ));
  const constrained = domains
    .map((domain, index) => (domain.size < heightTiles.length ? index : -1))
    .filter((index) => index >= 0);
  if (!propagate(domains, constrained, grid, heightTiles, compatibility)) return null;

  while (true) {
    let bestIndex = -1;
    let bestEntropy = Number.POSITIVE_INFINITY;
    domains.forEach((domain, index) => {
      if (domain.size <= 1) return;
      const value = entropy(domain, heightTiles) + random() * 0.00001;
      if (value < bestEntropy) {
        bestEntropy = value;
        bestIndex = index;
      }
    });
    if (bestIndex < 0) break;
    const chosen = chooseWeighted(domains[bestIndex], heightTiles, random);
    domains[bestIndex] = new Set([chosen]);
    if (!propagate(domains, [bestIndex], grid, heightTiles, compatibility)) return null;
  }
  return domains.map((domain) => domain.values().next().value);
}

function createGrid(bounds, cellSize, config) {
  const columns = Math.max(4, Math.floor((bounds.maxX - bounds.minX) / cellSize));
  const rows = Math.max(4, Math.floor((bounds.maxZ - bounds.minZ) / cellSize));
  const usedWidth = columns * cellSize;
  const usedDepth = rows * cellSize;
  const startX = (bounds.minX + bounds.maxX - usedWidth) * 0.5;
  const startZ = (bounds.minZ + bounds.maxZ - usedDepth) * 0.5;
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = startX + (column + 0.5) * cellSize;
      const z = startZ + (row + 0.5) * cellSize;
      cells.push({
        row,
        column,
        x,
        z,
        reserved: isReservedCell(x, z, config)
      });
    }
  }
  return { columns, rows, cellSize, cells };
}

function connectedRotation(mask) {
  if ((mask & 5) === 5 && (mask & 10) === 0) return Math.PI * 0.5;
  if ((mask & 10) === 10 && (mask & 5) === 0) return 0;
  for (let index = 0; index < DIRECTIONS.length; index += 1) {
    if (mask & DIRECTIONS[index].bit) return index * Math.PI * 0.5;
  }
  return 0;
}

function tileAsset(tile, random) {
  if (tile.assetType) return { type: tile.assetType, rotation: Math.floor(random() * 4) * Math.PI * 0.5 };
  const connections = popcount(tile.mask);
  const rotation = connectedRotation(tile.mask);
  if (tile.family === 'forest') {
    if (random() > 0.68) return null;
    if (connections >= 2 && random() < 0.72) return { type: 'pine-cluster', rotation };
    if (connections === 1) return { type: 'pine-tall', rotation };
    return { type: 'pine-small', rotation };
  }
  if (tile.family === 'rock') {
    if (random() > 0.28) return null;
    if (connections >= 2) return { type: 'boulder-cluster', rotation };
    return { type: 'boulder-large', rotation };
  }
  return null;
}

function assetScale(type, random) {
  const jitter = 0.92 + random() * 0.16;
  if (type === 'cliff-wide') return { x: 1.08 * jitter, y: 0.94 * jitter, z: 1.03 * jitter };
  if (type === 'cliff-tall') return { x: 0.98 * jitter, y: 1.05 * jitter, z: 0.98 * jitter };
  if (type === 'ridge') return { x: 1.02 * jitter, y: 0.96 * jitter, z: 1.02 * jitter };
  if (type === 'pine-cluster') return { x: 1.08 * jitter, y: 1.08 * jitter, z: 1.08 * jitter };
  if (type === 'mountain') return { x: 1.12 * jitter, y: 1.12 * jitter, z: 1.12 * jitter };
  return { x: jitter, y: jitter, z: jitter };
}

function terrainTileType(tile, cell, config) {
  const pathDistance = distanceToPath(cell.x, cell.z, config.pathPoints);
  if (pathDistance < (config.pathWidth ?? 8.2) * 0.5 + 0.45) return 'terrain-path';
  if (tile.family === 'forest') return 'terrain-forest';
  if (tile.family === 'rock') return 'terrain-rock';
  return 'terrain-open';
}

function isIslandCellVisible(cell, grid, seed) {
  if (cell.reserved) return true;
  const halfWidth = grid.columns * grid.cellSize * 0.5;
  const halfDepth = grid.rows * grid.cellSize * 0.5;
  const nx = Math.abs(cell.x) / Math.max(1, halfWidth);
  const nz = Math.abs(cell.z) / Math.max(1, halfDepth);
  const contourNoise = (
    Math.sin(cell.row * 2.17 + cell.column * 1.31 + seed * 0.013) * 0.045
    + Math.cos(cell.row * 1.19 - cell.column * 2.03 + seed * 0.021) * 0.035
  );
  return nx ** 3 + nz ** 3 < 1.02 + contourNoise;
}

function layoutFromSolution(solution, heightSolution, grid, tiles, heightTiles, seed, sceneKey, config) {
  const random = seededRandom(seed * 17 + 301);
  const terrainItems = [];
  const decorationItems = [];
  const visibleCells = new Set(
    grid.cells
      .filter((cell) => isIslandCellVisible(cell, grid, seed))
      .map((cell) => `${cell.row}:${cell.column}`)
  );
  solution.forEach((tileIndex, cellIndex) => {
    const tile = tiles[tileIndex];
    const cell = grid.cells[cellIndex];
    if (!visibleCells.has(`${cell.row}:${cell.column}`)) return;
    const terrainType = terrainTileType(tile, cell, config);
    const heightTile = heightTiles[heightSolution[cellIndex]];
    let exposedEdges = 0;
    DIRECTIONS.forEach((direction, directionIndex) => {
      const neighborKey = `${cell.row + direction.dz}:${cell.column + direction.dx}`;
      if (!visibleCells.has(neighborKey)) exposedEdges |= 1 << directionIndex;
    });
    terrainItems.push({
      id: `wfc-tile-${seed}-${cell.row}-${cell.column}`,
      type: terrainType,
      seed: Math.max(1, Math.floor(seed + cellIndex * 131 + random() * 97)),
      position: { x: cell.x, z: cell.z },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      groundOffset: 0,
      tile: {
        corners: [...heightTile.corners],
        exposedEdges,
        edgeWfc: true
      },
      blocking: false
    });

    if (cell.reserved) return;
    const asset = tileAsset(tile, random);
    if (!asset) return;
    const scale = assetScale(asset.type, random);
    decorationItems.push({
      id: `wfc-decor-${seed}-${cell.row}-${cell.column}`,
      type: asset.type,
      seed: Math.max(1, Math.floor(seed + cellIndex * 97 + random() * 89)),
      position: { x: cell.x, z: cell.z },
      rotation: { x: 0, y: asset.rotation, z: 0 },
      scale,
      groundOffset: 0,
      blocking: asset.type !== 'guard-flag'
    });
  });
  return normalizeTerrainLayout({
    sceneKey,
    manual: true,
    items: [...terrainItems, ...decorationItems]
  }, sceneKey);
}

export function generateTerrainWfcLayout(options = {}) {
  const sceneKey = options.sceneKey ?? 'snow-valley';
  const seed = Math.max(1, Math.floor(Number(options.seed) || 1));
  const style = STYLE_WEIGHTS[options.style] ? options.style : 'mixed';
  const bounds = options.bounds ?? { minX: -39, maxX: 39, minZ: -39, maxZ: 39 };
  const cellSize = Math.max(4, Number(options.cellSize) || 6.5);
  const config = {
    pathPoints: options.pathPoints ?? [{ x: 0, z: 30 }, { x: 5, z: -35 }],
    pathWidth: options.pathWidth ?? 8.2,
    altars: options.altars ?? [],
    playerBasePosition: options.playerBasePosition ?? { x: 0, z: 31 },
    enemyCampPosition: options.enemyCampPosition ?? { x: 5, z: -35 }
  };
  const grid = createGrid(bounds, cellSize, config);
  const tiles = createTileCatalog(style);
  const compatibility = createCompatibility(tiles);
  const heightTiles = createHeightTileCatalog();
  const heightCompatibility = createCompatibility(heightTiles);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const attemptSeed = seed + attempt * 7919;
    const solution = collapseGrid(grid, tiles, compatibility, attemptSeed);
    if (!solution) continue;
    const heightSolution = collapseHeightGrid(
      grid,
      heightTiles,
      heightCompatibility,
      attemptSeed + 3907
    );
    if (!heightSolution) continue;
    const layout = layoutFromSolution(
      solution,
      heightSolution,
      grid,
      tiles,
      heightTiles,
      seed,
      sceneKey,
      config
    );
    const terrainTileCount = layout.items.filter((item) => item.type.startsWith('terrain-')).length;
    return {
      layout,
      seed,
      style,
      attempts: attempt + 1,
      columns: grid.columns,
      rows: grid.rows,
      collapsedCells: solution.length,
      terrainTileCount,
      decorationCount: layout.items.length - terrainTileCount
    };
  }

  throw new Error(`WFC failed after 10 attempts for seed ${seed}`);
}
