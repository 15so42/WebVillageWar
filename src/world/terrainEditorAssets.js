import * as THREE from 'three';
import {
  createBannerTotemModel,
  createCottageModel,
  createGuardFlag,
  createMonsterCampModel,
  mat
} from '../art/lowpoly.js';

export const TERRAIN_LAYOUT_VERSION = 1;
export const TERRAIN_LAYOUT_STORAGE_PREFIX = 'villageWar.terrainLayout.v1';
export const TERRAIN_WFC_TILE_SIZE = 6.5;
export const TERRAIN_WFC_BOARD_BASE_HEIGHT = 4.8;
export const TERRAIN_WFC_HEIGHT_STEP = 0.82;

const TERRAIN_TILE_TYPES = new Set([
  'terrain-open',
  'terrain-path',
  'terrain-forest',
  'terrain-rock'
]);

const CATALOG = [
  {
    type: 'terrain-open',
    name: '草甸地块',
    category: 'WFC 地块',
    description: '低饱和草地与开阔交战区模块',
    footprint: 0,
    defaultBlocking: false,
    icon: '□'
  },
  {
    type: 'terrain-path',
    name: '道路地块',
    category: 'WFC 地块',
    description: '连续主路与交战区模块',
    footprint: 0,
    defaultBlocking: false,
    icon: '路'
  },
  {
    type: 'terrain-forest',
    name: '林地地块',
    category: 'WFC 地块',
    description: '承载紧凑林团的深色地块',
    footprint: 0,
    defaultBlocking: false,
    icon: '森'
  },
  {
    type: 'terrain-rock',
    name: '岩台地块',
    category: 'WFC 地块',
    description: '裸岩与岛缘断崖过渡模块',
    footprint: 0,
    defaultBlocking: false,
    icon: '▣'
  },
  {
    type: 'cliff-wide',
    name: '宽岩台',
    category: '地形大形体',
    description: '宽而低的主框景岩台',
    footprint: 5.4,
    icon: '岩'
  },
  {
    type: 'cliff-tall',
    name: '高岩台',
    category: '地形大形体',
    description: '用于侧翼和远景的高台',
    footprint: 4.2,
    icon: '崖'
  },
  {
    type: 'ridge',
    name: '横向岩脊',
    category: '地形大形体',
    description: '横向收边，不产生碎石感',
    footprint: 4.8,
    icon: '脊'
  },
  {
    type: 'mountain',
    name: '孤立岩柱',
    category: '地形大形体',
    description: '远景与岛缘的竖向剪影',
    footprint: 4.5,
    icon: '峰'
  },
  {
    type: 'boulder-large',
    name: '地标巨石',
    category: '岩石',
    description: '单块视觉锚点',
    footprint: 1.7,
    icon: '石'
  },
  {
    type: 'boulder-cluster',
    name: '成组巨石',
    category: '岩石',
    description: '三块相连的大轮廓岩组',
    footprint: 2.8,
    icon: '磊'
  },
  {
    type: 'pine-tall',
    name: '高冠树',
    category: '林木',
    description: '单株圆钝高冠树',
    footprint: 0.85,
    icon: '冠'
  },
  {
    type: 'pine-small',
    name: '矮冠树',
    category: '林木',
    description: '林带边缘和道路转角过渡',
    footprint: 0.58,
    icon: '树'
  },
  {
    type: 'pine-cluster',
    name: '岛屿林团',
    category: '林木',
    description: '四株树合成一个清楚的大轮廓',
    footprint: 2.8,
    icon: '林'
  },
  {
    type: 'cottage',
    name: '边境小屋',
    category: '建筑与地标',
    description: '道路或营地视觉锚点',
    footprint: 1.65,
    icon: '屋'
  },
  {
    type: 'banner-totem',
    name: '战旗图腾',
    category: '建筑与地标',
    description: '推进节点标记',
    footprint: 0.85,
    icon: '旗'
  },
  {
    type: 'guard-flag',
    name: '守卫旗',
    category: '建筑与地标',
    description: '轻量阵营标志',
    footprint: 0.35,
    defaultBlocking: false,
    icon: '帜'
  },
  {
    type: 'monster-camp',
    name: '前哨营地',
    category: '建筑与地标',
    description: '帐篷、火堆与拒马组合',
    footprint: 2.3,
    icon: '营'
  }
];

export const TERRAIN_EDITOR_ASSET_CATALOG = Object.freeze(
  CATALOG.map((item) => Object.freeze({
    ...item,
    defaultBlocking: item.defaultBlocking !== false,
    groundOffset: item.groundOffset ?? 0
  }))
);

const CATALOG_BY_TYPE = new Map(TERRAIN_EDITOR_ASSET_CATALOG.map((item) => [item.type, item]));
const TERRAIN_LAYOUT_TILE_INDEX = new WeakMap();
const TERRAIN_TILE_GEOMETRIES = new Map();
const TERRAIN_TILE_MATERIALS = new Map();
const TERRAIN_FEATURE_GEOMETRIES = new Map();
const TERRAIN_FEATURE_MATERIALS = new Map();

function seededRandom(seed = 1) {
  let state = Math.max(1, Math.floor(Math.abs(seed))) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function applyMeshDefaults(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return root;
}

function terrainTileMaterials(type) {
  if (TERRAIN_TILE_MATERIALS.has(type)) return TERRAIN_TILE_MATERIALS.get(type);
  const colors = {
    'terrain-open': '#8fa177',
    'terrain-path': '#8fa177',
    'terrain-forest': '#84976f',
    'terrain-rock': '#8d947c'
  };
  const sideColors = {
    'terrain-open': '#5e655e',
    'terrain-path': '#5e655e',
    'terrain-forest': '#586159',
    'terrain-rock': '#60645d'
  };
  const top = mat(colors[type] ?? '#8fa177', {
    roughness: 0.98,
    metalness: 0,
    flatShading: true
  });
  applyTerrainSurfaceShader(top, type);
  const side = mat(sideColors[type] ?? '#626660', {
    roughness: 1,
    metalness: 0,
    flatShading: true
  });
  const materials = [top, side];
  TERRAIN_TILE_MATERIALS.set(type, materials);
  return materials;
}

function applyTerrainSurfaceShader(material, type) {
  const variationStrength = type === 'terrain-rock' ? 0.045 : 0.065;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `
      varying vec3 vTerrainWorldPosition;
      ${shader.vertexShader}
    `.replace(
      '#include <worldpos_vertex>',
      `
      #include <worldpos_vertex>
      vTerrainWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      `
    );
    shader.fragmentShader = `
      varying vec3 vTerrainWorldPosition;
      float terrainHash(vec2 point) {
        return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float terrainNoise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        float a = terrainHash(cell);
        float b = terrainHash(cell + vec2(1.0, 0.0));
        float c = terrainHash(cell + vec2(0.0, 1.0));
        float d = terrainHash(cell + vec2(1.0, 1.0));
        return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
      }
      ${shader.fragmentShader}
    `.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float broadMottle = terrainNoise(vTerrainWorldPosition.xz * 0.16 + vec2(4.7, -2.1));
      float fineMottle = terrainNoise(vTerrainWorldPosition.xz * 0.58 + vec2(-8.3, 6.4));
      float terrainMottle = (broadMottle - 0.5) * ${variationStrength.toFixed(3)}
        + (fineMottle - 0.5) * ${(variationStrength * 0.32).toFixed(3)};
      diffuseColor.rgb *= 1.0 + terrainMottle;
      `
    );
  };
  material.customProgramCacheKey = () => `terrain-editor-surface-${type}-v1`;
  material.needsUpdate = true;
}

function createTerrainTileGeometry(tileData) {
  const tile = normalizeTerrainTileData(tileData);
  const key = `${tile.corners.join('')}:${tile.exposedEdges}`;
  if (TERRAIN_TILE_GEOMETRIES.has(key)) return TERRAIN_TILE_GEOMETRIES.get(key);

  const half = TERRAIN_WFC_TILE_SIZE * 0.5;
  const heights = tile.corners.map((level) => level * TERRAIN_WFC_HEIGHT_STEP);
  const topCorners = [
    [-half, heights[0], -half],
    [half, heights[1], -half],
    [half, heights[2], half],
    [-half, heights[3], half]
  ];
  const positions = [];
  const pushTriangle = (a, b, c) => positions.push(...a, ...b, ...c);
  pushTriangle(topCorners[0], topCorners[3], topCorners[1]);
  pushTriangle(topCorners[1], topCorners[3], topCorners[2]);
  const topVertexCount = 6;
  const bottom = -6.2;
  const edgeCorners = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0]
  ];
  edgeCorners.forEach(([startIndex, endIndex], directionIndex) => {
    if ((tile.exposedEdges & (1 << directionIndex)) === 0) return;
    const start = topCorners[startIndex];
    const end = topCorners[endIndex];
    const bottomStart = [start[0], bottom, start[2]];
    const bottomEnd = [end[0], bottom, end[2]];
    pushTriangle(start, end, bottomStart);
    pushTriangle(end, bottomEnd, bottomStart);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.addGroup(0, topVertexCount, 0);
  if (positions.length / 3 > topVertexCount) {
    geometry.addGroup(topVertexCount, positions.length / 3 - topVertexCount, 1);
  }
  geometry.computeVertexNormals();
  TERRAIN_TILE_GEOMETRIES.set(key, geometry);
  return geometry;
}

function createTerrainTile(type, tileData) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(createTerrainTileGeometry(tileData), terrainTileMaterials(type));
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  return group;
}

function featureGeometry(key, create) {
  if (!TERRAIN_FEATURE_GEOMETRIES.has(key)) {
    TERRAIN_FEATURE_GEOMETRIES.set(key, create());
  }
  return TERRAIN_FEATURE_GEOMETRIES.get(key);
}

function featureMaterial(key, color) {
  if (!TERRAIN_FEATURE_MATERIALS.has(key)) {
    TERRAIN_FEATURE_MATERIALS.set(key, mat(color, {
      roughness: 1,
      metalness: 0,
      flatShading: true
    }));
  }
  return TERRAIN_FEATURE_MATERIALS.get(key);
}

function createFacetedCliff({ width, depth, height, surfaceCap = true, seed = 1 }) {
  const random = seededRandom(seed);
  const group = new THREE.Group();
  const sides = 7 + Math.floor(random() * 3);
  const capHeight = Math.min(0.48, height * 0.1);
  const rockHeight = height - capHeight * 0.72;
  const rockGeometry = new THREE.CylinderGeometry(0.45, 0.5, rockHeight, sides, 2, false);
  const position = rockGeometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const yRatio = position.getY(index) / Math.max(0.01, rockHeight) + 0.5;
    const angle = Math.atan2(position.getZ(index), position.getX(index));
    const facet = 0.95 + Math.sin(angle * sides + seed * 0.17) * 0.05;
    const taper = 1 - yRatio * (0.06 + random() * 0.025);
    position.setX(index, position.getX(index) * facet * taper);
    position.setZ(index, position.getZ(index) * facet * taper);
  }
  rockGeometry.computeVertexNormals();
  const rock = new THREE.Mesh(rockGeometry, featureMaterial('cliff-side', '#646862'));
  rock.position.y = rockHeight * 0.5;
  rock.scale.set(width, 1, depth);
  group.add(rock);

  if (surfaceCap) {
    const capGeometry = new THREE.CylinderGeometry(0.44, 0.47, capHeight, sides, 1, false);
    const cap = new THREE.Mesh(capGeometry, featureMaterial('cliff-cap', '#879973'));
    cap.position.y = rockHeight + capHeight * 0.5 - 0.02;
    cap.scale.set(width, 1, depth);
    group.add(cap);
  }

  return applyMeshDefaults(group);
}

function createIslandRock(size, seed, tone = 0) {
  const random = seededRandom(seed);
  const group = new THREE.Group();
  const geometry = featureGeometry('island-rock', () => new THREE.DodecahedronGeometry(1, 0));
  const colors = ['#747970', '#85877d', '#666c67'];
  const rock = new THREE.Mesh(
    geometry,
    featureMaterial(`island-rock-${tone}`, colors[tone % colors.length])
  );
  const width = size * (0.52 + random() * 0.1);
  const depth = size * (0.43 + random() * 0.1);
  const rockHeight = size * (0.34 + random() * 0.08);
  rock.scale.set(width, rockHeight, depth);
  rock.position.y = rockHeight * 0.84;
  rock.rotation.set((random() - 0.5) * 0.12, random() * Math.PI * 2, (random() - 0.5) * 0.12);
  group.add(rock);
  return applyMeshDefaults(group);
}

function createRidge(seed) {
  const random = seededRandom(seed);
  const group = new THREE.Group();
  const pieces = [
    { x: -2.25, z: 0.12, size: 3.35, sx: 1.25, sy: 1.02, sz: 0.9 },
    { x: 0.15, z: -0.12, size: 3.8, sx: 1.35, sy: 1.12, sz: 0.96 },
    { x: 2.7, z: 0.18, size: 3.05, sx: 1.22, sy: 0.9, sz: 0.88 }
  ];
  pieces.forEach((piece, index) => {
    const rock = createIslandRock(piece.size, seed + index * 47, index % 3);
    rock.position.set(piece.x, 0, piece.z);
    rock.rotation.y = (random() - 0.5) * 0.65;
    rock.scale.set(piece.sx, piece.sy, piece.sz);
    group.add(rock);
  });
  return applyMeshDefaults(group);
}

function createBoulderCluster(seed) {
  const group = new THREE.Group();
  [
    { x: 0, z: 0, size: 3.0, tone: 0 },
    { x: 1.35, z: 0.42, size: 2.0, tone: 1 },
    { x: -1.25, z: -0.36, size: 1.8, tone: 2 }
  ].forEach((piece, index) => {
    const rock = createIslandRock(piece.size, seed + index * 53, piece.tone);
    rock.position.set(piece.x, 0, piece.z);
    group.add(rock);
  });
  return applyMeshDefaults(group);
}

function createIslandTree(height, seed) {
  const random = seededRandom(seed);
  const group = new THREE.Group();
  const trunkGeometry = featureGeometry(
    'island-tree-trunk',
    () => new THREE.CylinderGeometry(0.62, 0.9, 1, 5, 1, false)
  );
  const crownGeometry = featureGeometry(
    'island-tree-crown',
    () => new THREE.DodecahedronGeometry(1, 0)
  );
  const trunkHeight = height * 0.52;
  const trunk = new THREE.Mesh(trunkGeometry, featureMaterial('island-tree-trunk', '#574234'));
  trunk.scale.set(height * 0.14, trunkHeight, height * 0.14);
  trunk.position.y = trunkHeight * 0.5;
  trunk.rotation.y = random() * Math.PI;
  group.add(trunk);

  const crowns = [
    {
      x: 0,
      y: height * 0.67,
      z: 0,
      scale: [height * 0.37, height * 0.27, height * 0.35],
      material: featureMaterial('island-tree-leaf-shadow', '#334c3c')
    },
    {
      x: (random() - 0.5) * height * 0.16,
      y: height * 0.88,
      z: (random() - 0.5) * height * 0.12,
      scale: [height * 0.27, height * 0.2, height * 0.27],
      material: featureMaterial('island-tree-leaf-mid', '#496448')
    },
    {
      x: (random() > 0.5 ? 1 : -1) * height * 0.2,
      y: height * 0.68,
      z: (random() - 0.5) * height * 0.18,
      scale: [height * 0.2, height * 0.18, height * 0.2],
      material: featureMaterial('island-tree-leaf-light', '#607958')
    }
  ];
  crowns.forEach((part) => {
    const crown = new THREE.Mesh(crownGeometry, part.material);
    crown.position.set(part.x, part.y, part.z);
    crown.scale.set(...part.scale);
    crown.rotation.set(random() * 0.18, random() * Math.PI * 2, random() * 0.14);
    group.add(crown);
  });
  return applyMeshDefaults(group);
}

function createIslandTreeCluster(seed) {
  const random = seededRandom(seed);
  const group = new THREE.Group();
  [
    { x: 0, z: 0.2, h: 4.9 },
    { x: 1.55, z: 0.62, h: 4.0 },
    { x: -1.55, z: 0.5, h: 3.75 },
    { x: 0.25, z: -1.45, h: 3.45 }
  ].forEach((item, index) => {
    const tree = createIslandTree(item.h * (0.94 + random() * 0.12), seed + index * 71);
    tree.position.set(item.x, 0, item.z);
    tree.rotation.y = random() * Math.PI * 2;
    group.add(tree);
  });
  return applyMeshDefaults(group);
}

function createIslandRockPillar(seed) {
  const pillar = createFacetedCliff({
    width: 4.4,
    depth: 3.8,
    height: 6.8,
    surfaceCap: true,
    seed
  });
  const crownRock = createIslandRock(2.5, seed + 97, 1);
  crownRock.position.set(0.45, 6.72, -0.25);
  crownRock.scale.set(0.82, 0.72, 0.82);
  pillar.add(crownRock);
  return applyMeshDefaults(pillar);
}

export function getTerrainEditorAssetDefinition(type) {
  return CATALOG_BY_TYPE.get(type) ?? null;
}

export function isTerrainEditorTileType(type) {
  return TERRAIN_TILE_TYPES.has(type);
}

export function createTerrainEditorAsset(type, options = {}) {
  const definition = getTerrainEditorAssetDefinition(type);
  if (!definition) return null;
  const seed = Number.isFinite(options.seed) ? options.seed : 1;
  let object = null;

  switch (type) {
    case 'terrain-open':
    case 'terrain-path':
    case 'terrain-forest':
    case 'terrain-rock':
      object = createTerrainTile(type, options.tile);
      break;
    case 'cliff-wide':
      object = createFacetedCliff({ width: 5.8, depth: 3.8, height: 4.8, seed });
      break;
    case 'cliff-tall':
      object = createFacetedCliff({ width: 3.8, depth: 3.4, height: 7.2, seed });
      break;
    case 'ridge':
      object = createRidge(seed);
      break;
    case 'mountain':
      object = createIslandRockPillar(seed);
      break;
    case 'boulder-large':
      object = createIslandRock(3.4, seed, 0);
      break;
    case 'boulder-cluster':
      object = createBoulderCluster(seed);
      break;
    case 'pine-tall':
      object = createIslandTree(5.1, seed);
      break;
    case 'pine-small':
      object = createIslandTree(3.45, seed);
      break;
    case 'pine-cluster':
      object = createIslandTreeCluster(seed);
      break;
    case 'cottage':
      object = createCottageModel({ wall: '#b68f6f', roof: '#684a45' });
      break;
    case 'banner-totem':
      object = createBannerTotemModel({ bannerColor: '#a84635' });
      break;
    case 'guard-flag':
      object = createGuardFlag('#a84635');
      break;
    case 'monster-camp':
      object = createMonsterCampModel();
      break;
    default:
      return null;
  }

  object.name = `TerrainEditorAsset:${type}`;
  object.userData.terrainEditorType = type;
  object.userData.terrainEditorSeed = seed;
  object.userData.terrainEditorTile = isTerrainEditorTileType(type);
  if (object.userData.terrainEditorTile) {
    object.userData.terrainEditorTileData = normalizeTerrainTileData(options.tile);
  }
  return applyMeshDefaults(object);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeTerrainTileData(tile) {
  const source = tile && typeof tile === 'object' ? tile : {};
  const sourceCorners = Array.isArray(source.corners) ? source.corners : [];
  return {
    corners: [0, 1, 2, 3].map((index) => (
      Math.max(0, Math.min(2, Math.round(finite(sourceCorners[index], 0))))
    )),
    exposedEdges: Math.max(0, Math.min(15, Math.floor(finite(source.exposedEdges, 15)))),
    edgeWfc: source.edgeWfc === true
  };
}

function makeId(index = 0) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `terrain-${Date.now().toString(36)}-${index.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeTerrainLayout(layout, sceneKey = 'snow-valley') {
  const source = layout && typeof layout === 'object' ? layout : {};
  const items = Array.isArray(source.items) ? source.items : [];
  return {
    version: TERRAIN_LAYOUT_VERSION,
    sceneKey: typeof source.sceneKey === 'string' ? source.sceneKey : sceneKey,
    manual: source.manual !== false,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
    items: items
      .filter((item) => getTerrainEditorAssetDefinition(item?.type))
      .map((item, index) => {
        const definition = getTerrainEditorAssetDefinition(item.type);
        const normalizedItem = {
          id: typeof item.id === 'string' && item.id ? item.id : makeId(index),
          type: item.type,
          seed: Math.max(1, Math.floor(finite(item.seed, index + 1))),
          position: {
            x: finite(item.position?.x),
            z: finite(item.position?.z)
          },
          rotation: {
            x: finite(item.rotation?.x),
            y: finite(item.rotation?.y),
            z: finite(item.rotation?.z)
          },
          scale: {
            x: Math.max(0.05, finite(item.scale?.x, 1)),
            y: Math.max(0.05, finite(item.scale?.y, 1)),
            z: Math.max(0.05, finite(item.scale?.z, 1))
          },
          groundOffset: finite(item.groundOffset, definition.groundOffset),
          blocking: item.blocking ?? definition.defaultBlocking
        };
        if (isTerrainEditorTileType(item.type)) {
          normalizedItem.tile = normalizeTerrainTileData(item.tile);
        }
        return normalizedItem;
      })
  };
}

export function terrainLayoutStorageKey(sceneKey = 'snow-valley', channel = 'draft') {
  return `${TERRAIN_LAYOUT_STORAGE_PREFIX}.${sceneKey}.${channel}`;
}

export function readStoredTerrainLayout(sceneKey = 'snow-valley', channel = 'draft') {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(terrainLayoutStorageKey(sceneKey, channel));
    if (!raw) return null;
    return normalizeTerrainLayout(JSON.parse(raw), sceneKey);
  } catch (error) {
    console.warn('terrain layout read failed', error);
    return null;
  }
}

export function writeStoredTerrainLayout(layout, channel = 'draft') {
  const normalized = normalizeTerrainLayout(layout, layout?.sceneKey);
  normalized.updatedAt = new Date().toISOString();
  try {
    globalThis.localStorage?.setItem(
      terrainLayoutStorageKey(normalized.sceneKey, channel),
      JSON.stringify(normalized)
    );
  } catch (error) {
    console.warn('terrain layout write failed', error);
  }
  return normalized;
}

export function removeStoredTerrainLayout(sceneKey = 'snow-valley', channel = 'draft') {
  try {
    globalThis.localStorage?.removeItem(terrainLayoutStorageKey(sceneKey, channel));
  } catch (error) {
    console.warn('terrain layout removal failed', error);
  }
}

export function terrainLayoutTileAt(layout, x, z) {
  if (!layout || typeof layout !== 'object') return null;
  let index = TERRAIN_LAYOUT_TILE_INDEX.get(layout);
  if (!index) {
    index = new Map();
    const items = Array.isArray(layout.items) ? layout.items : [];
    items.forEach((item) => {
      if (!isTerrainEditorTileType(item?.type)) return;
      const key = `${Math.floor(finite(item.position?.x) / TERRAIN_WFC_TILE_SIZE)}:${Math.floor(finite(item.position?.z) / TERRAIN_WFC_TILE_SIZE)}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(item);
    });
    TERRAIN_LAYOUT_TILE_INDEX.set(layout, index);
  }
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const cellX = Math.floor(x / TERRAIN_WFC_TILE_SIZE);
  const cellZ = Math.floor(z / TERRAIN_WFC_TILE_SIZE);
  for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
      const candidates = index.get(`${cellX + offsetX}:${cellZ + offsetZ}`) ?? [];
      candidates.forEach((item) => {
        const scaleX = Math.max(0.05, finite(item.scale?.x, 1));
        const scaleZ = Math.max(0.05, finite(item.scale?.z, 1));
        const dx = Math.abs(x - finite(item.position?.x));
        const dz = Math.abs(z - finite(item.position?.z));
        if (dx > TERRAIN_WFC_TILE_SIZE * scaleX * 0.5 || dz > TERRAIN_WFC_TILE_SIZE * scaleZ * 0.5) return;
        const distance = dx * dx + dz * dz;
        if (distance >= nearestDistance) return;
        nearest = item;
        nearestDistance = distance;
      });
    }
  }
  return nearest;
}

export function terrainLayoutSurfaceHeightAt(layout, x, z, fallback = 0) {
  const tile = terrainLayoutTileAt(layout, x, z);
  if (!tile) return fallback;
  const tileData = normalizeTerrainTileData(tile.tile);
  const scaleX = Math.max(0.05, finite(tile.scale?.x, 1));
  const scaleZ = Math.max(0.05, finite(tile.scale?.z, 1));
  const width = TERRAIN_WFC_TILE_SIZE * scaleX;
  const depth = TERRAIN_WFC_TILE_SIZE * scaleZ;
  const fx = Math.max(0, Math.min(1, (x - finite(tile.position?.x) + width * 0.5) / width));
  const fz = Math.max(0, Math.min(1, (z - finite(tile.position?.z) + depth * 0.5) / depth));
  const scaleY = Math.max(0.05, finite(tile.scale?.y, 1));
  const [nw, ne, se, sw] = tileData.corners.map((level) => level * TERRAIN_WFC_HEIGHT_STEP * scaleY);
  const localHeight = fx + fz <= 1
    ? nw + (ne - nw) * fx + (sw - nw) * fz
    : se + (sw - se) * (1 - fx) + (ne - se) * (1 - fz);
  return TERRAIN_WFC_BOARD_BASE_HEIGHT + finite(tile.groundOffset) + localHeight;
}

export function placeTerrainEditorLayout(parent, layout, heightAt) {
  const normalized = normalizeTerrainLayout(layout, layout?.sceneKey);
  const placements = [];
  normalized.items.forEach((item) => {
    const definition = getTerrainEditorAssetDefinition(item.type);
    const object = createTerrainEditorAsset(item.type, { seed: item.seed, tile: item.tile });
    if (!definition || !object) return;
    object.userData.terrainEditorAssetId = item.id;
    object.userData.terrainEditorBlocking = item.blocking;
    const isTerrainTile = isTerrainEditorTileType(item.type);
    const y = isTerrainTile
      ? TERRAIN_WFC_BOARD_BASE_HEIGHT + item.groundOffset
      : finite(heightAt?.(item.position.x, item.position.z)) + item.groundOffset;
    object.position.set(item.position.x, y, item.position.z);
    object.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z);
    object.scale.set(item.scale.x, item.scale.y, item.scale.z);
    parent.add(object);
    placements.push({ object, item, definition });
  });
  return placements;
}
