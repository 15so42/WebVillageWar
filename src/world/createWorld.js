import * as THREE from 'three';
import { BALANCE } from '../data/gameData.js';
import {
  createBaseModel,
  createBush,
  createCloudModel,
  createCottageModel,
  createEnemyCampModel,
  createGrassTuft,
  createMonsterCampModel,
  createMountainPeak,
  createRock,
  createSnowPine,
  mat
} from '../art/lowpoly.js';
import { clamp, seededRandom } from '../utils/math.js';

const FOREST_ZONES = [
  { x: -31, z: 19, rx: 11, rz: 17, count: 82, tone: 'deep' },
  { x: 31, z: 13, rx: 10, rz: 15, count: 78, tone: 'warm' },
  { x: -30, z: -10, rx: 12, rz: 18, count: 92, tone: 'deep' },
  { x: 30, z: -18, rx: 12, rz: 17, count: 88, tone: 'cool' },
  { x: -10, z: -32, rx: 18, rz: 9, count: 64, tone: 'snow' },
  { x: 15, z: -33, rx: 16, rz: 8, count: 58, tone: 'snow' }
];

const FOREST_PASSAGES = [
  [new THREE.Vector3(-38, 0, 23), new THREE.Vector3(-18, 0, 22), new THREE.Vector3(-6, 0, 16)],
  [new THREE.Vector3(38, 0, 14), new THREE.Vector3(20, 0, 10), new THREE.Vector3(10, 0, 4)],
  [new THREE.Vector3(-38, 0, -7), new THREE.Vector3(-23, 0, -13), new THREE.Vector3(-7, 0, -18)],
  [new THREE.Vector3(38, 0, -21), new THREE.Vector3(19, 0, -19), new THREE.Vector3(4, 0, -12)]
];

const CLEARINGS = [
  { x: 0, z: 30, r: 11 },
  { x: 0, z: -30, r: 8 },
  { x: 30, z: 12, r: 5.4 },
  { x: 27, z: -18, r: 5.8 },
  { x: -31, z: -10, r: 5.6 }
];

const BOULDER_CLUSTERS = [
  { x: -39, z: 5, rx: 3.2, rz: 9.2, count: 5, sizeMin: 1.35, sizeMax: 2.35 },
  { x: 38, z: -5, rx: 3.4, rz: 9.4, count: 5, sizeMin: 1.35, sizeMax: 2.45 },
  { x: -25, z: -31, rx: 7.6, rz: 3.2, count: 6, sizeMin: 1.2, sizeMax: 2.25 },
  { x: 24, z: -31, rx: 7.2, rz: 3, count: 6, sizeMin: 1.2, sizeMax: 2.35 },
  { x: -25, z: 15, rx: 4.6, rz: 5.8, count: 4, sizeMin: 1.1, sizeMax: 1.9 },
  { x: 26, z: 18, rx: 4.8, rz: 5.4, count: 4, sizeMin: 1.1, sizeMax: 1.85 }
];

const LANDMARK_BOULDERS = [
  { x: -18, z: 5, size: 2.7, sx: 1.28, sy: 0.82, sz: 0.92, rot: 0.35 },
  { x: 18, z: -10, size: 2.85, sx: 1.12, sy: 0.9, sz: 1.08, rot: -0.48 },
  { x: -14, z: -24, size: 2.35, sx: 1.18, sy: 0.86, sz: 0.9, rot: 0.9 },
  { x: 24, z: 8, size: 2.2, sx: 1.08, sy: 0.78, sz: 1.22, rot: -0.18 },
  { x: -27, z: 28, size: 2.25, sx: 1.2, sy: 0.82, sz: 0.86, rot: 0.62 }
];

const SNOW_CENTER = { x: 2, z: -33 };
const SURFACE_OFFSET = 0.42;
const PATH_SURFACE_OFFSET = 0.035;
const SNOWFALL_CENTER = new THREE.Vector3();

const DEFAULT_TERRAIN_PROFILE = {
  baseHeight: 0.25,
  northRise: 2.15,
  sideRise: 1.25,
  sideNorthRise: 2.2,
  roughnessScale: 1,
  valleyFloorBase: 0.32,
  valleyNorthRise: 1.25,
  valleySideRise: 0.45,
  campTerrace: 2.55,
  campTerraceOutward: 0.55,
  campShelfInner: 4.5,
  campShelfOuter: 14,
  snowCenter: SNOW_CENTER,
  hills: [
    { x: -30, z: 20, rx: 18, rz: 24, height: 2.4 },
    { x: 30, z: 12, rx: 16, rz: 22, height: 2.2 },
    { x: -31, z: -10, rx: 18, rz: 24, height: 3.1 },
    { x: 29, z: -19, rx: 18, rz: 23, height: 3.3 }
  ],
  ridges: [
    { x: 0, z: -39, rx: 35, rz: 9, height: 4.6 },
    { x: -40, z: -10, rx: 8, rz: 46, height: 2.4 },
    { x: 40, z: -5, rx: 8, rz: 45, height: 2.2 }
  ]
};

const WORLD_PRESETS = {
  'snow-valley': {
    sceneKey: 'snow-valley',
    seed: 42,
    sky: {
      background: '#91cbef',
      fog: '#b6d8e9',
      fogNear: 82,
      fogFar: 230,
      sun: '#fff1c3',
      hemiSky: '#cdefff',
      hemiGround: '#45653d'
    },
    palette: {
      base: '#e9eddc',
      side: '#d4d8c8',
      north: '#dce4e4',
      valley: '#e4e3cf',
      forest: '#b7c8b8',
      high: '#c6c7bf',
      snow: '#f1f4e8',
      path: '#d9d8c8',
      puddle: '#9bc7d1'
    },
    terrain: DEFAULT_TERRAIN_PROFILE
    ,
    snowfall: {
      seed: 309,
      countScale: 1,
      gustScale: 1,
      windScale: 1
    }
  },
  'pine-pass': {
    sceneKey: 'pine-pass',
    seed: 119,
    sky: {
      background: '#89c7e8',
      fog: '#b8d9e5',
      fogNear: 68,
      fogFar: 205,
      sun: '#ffe7b7',
      hemiSky: '#ccefff',
      hemiGround: '#334f3e'
    },
    palette: {
      base: '#edf1e6',
      side: '#d9dfd1',
      north: '#e4ecec',
      valley: '#e6e9d9',
      forest: '#a7bdac',
      high: '#ccd1c8',
      snow: '#f4f7ed',
      path: '#d0d3c5',
      puddle: '#8fbcc7'
    },
    pathWidth: 2.85,
    pathPoints: [
      { x: -4, z: 30 },
      { x: -9, z: 24 },
      { x: -12, z: 17 },
      { x: -7, z: 10 },
      { x: 0, z: 4 },
      { x: 8, z: -2 },
      { x: 7, z: -10 },
      { x: 0, z: -16 },
      { x: -7, z: -23 },
      { x: -2, z: -30 }
    ],
    puddles: [
      { x: -20, z: 13, rx: 1.9, rz: 0.72, rot: 0.32 },
      { x: 17, z: -2, rx: 2.2, rz: 0.86, rot: -0.45 },
      { x: 21, z: 20, rx: 1.55, rz: 0.62, rot: 0.15 }
    ],
    altars: [
      { id: 'energy-altar-pine-west', type: 'energy', position: { x: -18, z: 14 }, rotation: -0.4, clearingRadius: 6 },
      { id: 'shield-altar-pine-east', type: 'shield', position: { x: 17, z: -11 }, rotation: 0.4, clearingRadius: 6.2 },
      { id: 'respite-altar-pine-north', type: 'respite', position: { x: -12, z: -24 }, rotation: 0.1, clearingRadius: 5.8 }
    ],
    wildlife: [
      { type: 'wolf', x: 26, z: 12, radius: 5 },
      { type: 'wolf', x: 31, z: 7, radius: 5.3 },
      { type: 'bear', x: -30, z: -9, radius: 6 },
      { type: 'wolf', x: -34, z: -15, radius: 5 },
      { type: 'bear', x: 28, z: -21, radius: 5.8 }
    ],
    forestZones: [
      { x: -31, z: 20, rx: 12, rz: 18, count: 105, tone: 'deep' },
      { x: 29, z: 15, rx: 11, rz: 16, count: 96, tone: 'warm' },
      { x: -30, z: -9, rx: 13, rz: 19, count: 116, tone: 'deep' },
      { x: 31, z: -17, rx: 12, rz: 18, count: 108, tone: 'cool' },
      { x: -7, z: -33, rx: 17, rz: 8, count: 74, tone: 'snow' },
      { x: 18, z: -31, rx: 15, rz: 8, count: 68, tone: 'snow' }
    ],
    forestPassages: [
      [new THREE.Vector3(-39, 0, 25), new THREE.Vector3(-19, 0, 22), new THREE.Vector3(-10, 0, 17)],
      [new THREE.Vector3(37, 0, 14), new THREE.Vector3(19, 0, 11), new THREE.Vector3(7, 0, 1)],
      [new THREE.Vector3(-39, 0, -8), new THREE.Vector3(-22, 0, -14), new THREE.Vector3(-7, 0, -23)],
      [new THREE.Vector3(38, 0, -22), new THREE.Vector3(19, 0, -20), new THREE.Vector3(4, 0, -14)]
    ],
    boulderClusters: [
      { x: -38, z: 3, rx: 3, rz: 8, count: 4, sizeMin: 1.25, sizeMax: 2.1 },
      { x: 37, z: -8, rx: 3.2, rz: 9, count: 5, sizeMin: 1.25, sizeMax: 2.2 },
      { x: -23, z: -31, rx: 7, rz: 3, count: 5, sizeMin: 1.2, sizeMax: 2.05 },
      { x: 24, z: -29, rx: 6.4, rz: 3, count: 5, sizeMin: 1.25, sizeMax: 2.2 }
    ],
    landmarkBoulders: [
      { x: -20, z: 6, size: 2.45, sx: 1.18, sy: 0.76, sz: 0.92, rot: 0.35 },
      { x: 18, z: -13, size: 2.7, sx: 1.08, sy: 0.86, sz: 1.12, rot: -0.48 },
      { x: 25, z: 8, size: 2.15, sx: 1.02, sy: 0.72, sz: 1.15, rot: -0.18 }
    ],
    cottages: [
      { x: -7.8, z: 34, rot: 0.68, scale: 0.94, roof: '#b64a3d' },
      { x: 6.6, z: 32.8, rot: -0.58, scale: 0.88, roof: '#a84f39' },
      { x: -27.5, z: 5.5, rot: 1.12, scale: 0.72, wall: '#a77750', roof: '#744230' },
      { x: 25.6, z: -5.7, rot: -0.5, scale: 0.72, wall: '#a77750', roof: '#744230' }
    ],
    terrain: {
      ...DEFAULT_TERRAIN_PROFILE,
      roughnessScale: 0.85,
      hills: [
        { x: -31, z: 22, rx: 18, rz: 25, height: 2.1 },
        { x: 29, z: 13, rx: 17, rz: 22, height: 2 },
        { x: -31, z: -10, rx: 18, rz: 25, height: 2.75 },
        { x: 30, z: -19, rx: 18, rz: 24, height: 2.9 }
      ]
    },
    monsterCamp: { x: -3, z: -34, rot: 0.22, scale: 1.12 },
    snowfall: {
      seed: 417,
      countScale: 0.82,
      gustScale: 0.72,
      windScale: 0.86
    }
  },
  'frozen-ridge': {
    sceneKey: 'frozen-ridge',
    seed: 207,
    sky: {
      background: '#83bfe4',
      fog: '#c6dce7',
      fogNear: 58,
      fogFar: 190,
      sun: '#fff1d6',
      hemiSky: '#d8f2ff',
      hemiGround: '#3d5361'
    },
    palette: {
      base: '#eef3ee',
      side: '#d8e0de',
      north: '#e8f1f3',
      valley: '#e5ebdf',
      forest: '#b4c4bc',
      high: '#c7d0d0',
      snow: '#f7faf5',
      path: '#cfd7d4',
      puddle: '#8db9ca'
    },
    pathWidth: 3.1,
    pathPoints: [
      { x: 3, z: 30 },
      { x: 7, z: 24 },
      { x: 4, z: 17 },
      { x: -5, z: 11 },
      { x: -11, z: 4 },
      { x: -7, z: -4 },
      { x: 3, z: -10 },
      { x: 10, z: -17 },
      { x: 6, z: -24 },
      { x: 0, z: -30 }
    ],
    puddles: [
      { x: -17, z: 12, rx: 1.55, rz: 0.58, rot: 0.38 },
      { x: 15, z: -2, rx: 1.8, rz: 0.68, rot: -0.25 },
      { x: -25, z: -21, rx: 1.6, rz: 0.62, rot: 0.58 }
    ],
    altars: [
      { id: 'energy-altar-ridge-south', type: 'energy', position: { x: -16, z: 17 }, rotation: -0.18, clearingRadius: 6 },
      { id: 'shield-altar-ridge-east', type: 'shield', position: { x: 20, z: -9 }, rotation: 0.55, clearingRadius: 6.2 },
      { id: 'respite-altar-ridge-west', type: 'respite', position: { x: -18, z: -18 }, rotation: -0.15, clearingRadius: 6 }
    ],
    wildlife: [
      { type: 'bear', x: -30, z: -12, radius: 6.2 },
      { type: 'wolf', x: -34, z: -18, radius: 5.5 },
      { type: 'bear', x: 30, z: -17, radius: 6.4 },
      { type: 'wolf', x: 34, z: -24, radius: 5.6 },
      { type: 'wolf', x: 28, z: 10, radius: 5.1 }
    ],
    forestZones: [
      { x: -32, z: 18, rx: 10, rz: 15, count: 62, tone: 'cool' },
      { x: 31, z: 14, rx: 10, rz: 14, count: 58, tone: 'cool' },
      { x: -30, z: -11, rx: 12, rz: 18, count: 76, tone: 'snow' },
      { x: 31, z: -18, rx: 12, rz: 17, count: 74, tone: 'snow' },
      { x: -8, z: -33, rx: 18, rz: 8, count: 48, tone: 'snow' },
      { x: 18, z: -32, rx: 16, rz: 8, count: 42, tone: 'snow' }
    ],
    forestPassages: [
      [new THREE.Vector3(-39, 0, 19), new THREE.Vector3(-21, 0, 18), new THREE.Vector3(-6, 0, 11)],
      [new THREE.Vector3(38, 0, 12), new THREE.Vector3(20, 0, 9), new THREE.Vector3(2, 0, -2)],
      [new THREE.Vector3(-38, 0, -13), new THREE.Vector3(-22, 0, -18), new THREE.Vector3(-6, 0, -22)],
      [new THREE.Vector3(39, 0, -22), new THREE.Vector3(20, 0, -20), new THREE.Vector3(8, 0, -15)]
    ],
    boulderClusters: [
      { x: -39, z: 4, rx: 3.4, rz: 10, count: 8, sizeMin: 1.45, sizeMax: 2.8 },
      { x: 38, z: -6, rx: 3.6, rz: 10.4, count: 8, sizeMin: 1.5, sizeMax: 2.95 },
      { x: -24, z: -31, rx: 8, rz: 3.4, count: 8, sizeMin: 1.35, sizeMax: 2.65 },
      { x: 25, z: -31, rx: 8, rz: 3.2, count: 8, sizeMin: 1.4, sizeMax: 2.85 },
      { x: -23, z: 14, rx: 5, rz: 5.2, count: 6, sizeMin: 1.25, sizeMax: 2.3 }
    ],
    landmarkBoulders: [
      { x: -18, z: 7, size: 3.2, sx: 1.28, sy: 0.92, sz: 0.98, rot: 0.34 },
      { x: 18, z: -11, size: 3.1, sx: 1.14, sy: 0.94, sz: 1.12, rot: -0.5 },
      { x: -15, z: -24, size: 2.8, sx: 1.22, sy: 0.9, sz: 0.98, rot: 0.9 },
      { x: 26, z: 6, size: 2.65, sx: 1.1, sy: 0.82, sz: 1.22, rot: -0.18 }
    ],
    cottages: [
      { x: -8.2, z: 34, rot: 0.68, scale: 0.86, roof: '#a84f39' },
      { x: 7.6, z: 33.1, rot: -0.58, scale: 0.82, roof: '#92533b' }
    ],
    mountainRidge: [
      { x: -38, z: -42, width: 6, height: 12, rot: -0.18, color: '#7c6258' },
      { x: -26, z: -44, width: 8, height: 18, rot: 0.14, color: '#76584f' },
      { x: -11, z: -44, width: 7, height: 16, rot: -0.06, color: '#8c7060' },
      { x: 3, z: -45, width: 9, height: 21, rot: 0.08, color: '#756057' },
      { x: 18, z: -44, width: 7.5, height: 17, rot: -0.1, color: '#856856' },
      { x: 32, z: -42, width: 6.8, height: 14, rot: 0.16, color: '#735a50' }
    ],
    snowPeaks: [
      { x: -18, z: -40, width: 6.6, height: 13 },
      { x: 17, z: -40, width: 7.2, height: 15 },
      { x: 4, z: -42, width: 8.4, height: 18 },
      { x: -3, z: -39, width: 6.4, height: 14 }
    ],
    terrain: {
      ...DEFAULT_TERRAIN_PROFILE,
      northRise: 2.85,
      sideRise: 1.45,
      sideNorthRise: 2.8,
      roughnessScale: 1.08,
      campTerrace: 3.15,
      campTerraceOutward: 0.68,
      snowCenter: { x: 0, z: -31 },
      hills: [
        { x: -31, z: 19, rx: 17, rz: 23, height: 2.8 },
        { x: 30, z: 12, rx: 16, rz: 21, height: 2.6 },
        { x: -31, z: -10, rx: 18, rz: 23, height: 3.6 },
        { x: 29, z: -19, rx: 17, rz: 22, height: 3.8 }
      ],
      ridges: [
        { x: 0, z: -39, rx: 35, rz: 9, height: 6.2 },
        { x: -40, z: -10, rx: 8, rz: 46, height: 3.2 },
        { x: 40, z: -5, rx: 8, rz: 45, height: 3.1 }
      ]
    },
    monsterCamp: { x: 5, z: -35, rot: -0.52, scale: 1.28 },
    snowfall: {
      seed: 811,
      countScale: 1.28,
      gustScale: 1.34,
      windScale: 1.18
    }
  }
};

let activeWorldConfig = resolveWorldConfig();

export function createWorld(scene, worldOptions = {}) {
  activeWorldConfig = resolveWorldConfig(worldOptions);
  const config = activeWorldConfig;
  scene.background = new THREE.Color(config.sky.background);
  scene.fog = new THREE.Fog(config.sky.fog, config.sky.fogNear, config.sky.fogFar);

  const sun = new THREE.DirectionalLight(config.sky.sun, 3.55);
  sun.position.set(-44, 82, 46);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -86;
  sun.shadow.camera.right = 86;
  sun.shadow.camera.top = 86;
  sun.shadow.camera.bottom = -86;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(config.sky.hemiSky, config.sky.hemiGround, 1.85));

  const ground = createGroundMesh();
  scene.add(ground);

  const pathPoints = pathVectors();
  createSky(scene);
  createMountainRidge(scene);
  createSnowMountain(scene);
  createPath(scene, pathPoints);
  createPuddles(scene);
  const snowfall = createSnowfall(scene);

  const basePosition = config.playerBasePosition;
  const enemyCampPosition = config.enemyCampPosition;
  const base = createBaseModel();
  placeOnTerrain(base, basePosition.x, basePosition.z);
  base.userData.aura.scale.setScalar(BALANCE.playerBase.recoveryRadius / 5.75);
  scene.add(base);

  const enemyCamp = createEnemyCampModel();
  placeOnTerrain(enemyCamp, enemyCampPosition.x, enemyCampPosition.z);
  enemyCamp.scale.setScalar(1.35);
  scene.add(enemyCamp);

  decorate(scene, pathPoints);
  createSnowMonsterCamp(scene);

  return {
    config,
    ground,
    heightAt: terrainHeightAt,
    pathPoints,
    playerBaseModel: base,
    enemyCampModel: enemyCamp,
    recoveryAura: base.userData.aura,
    update: (dt, cameraTarget) => {
      snowfall.update(dt, cameraTarget);
    }
  };
}

function resolveWorldConfig(worldOptions = {}) {
  const preset = WORLD_PRESETS[worldOptions.sceneKey] ?? WORLD_PRESETS['snow-valley'];
  const merged = mergeWorldPreset(preset, worldOptions);
  const rawPathPoints = (merged.pathPoints ?? BALANCE.world.pathPoints).map(
    (point) => new THREE.Vector3(point.x, 0, point.z)
  );
  return {
    ...merged,
    rawPathPoints,
    playerBasePosition: merged.playerBasePosition ?? BALANCE.playerBase.position,
    enemyCampPosition: merged.enemyCampPosition ?? BALANCE.enemyCamp.position
  };
}

function mergeWorldPreset(preset, worldOptions) {
  return {
    ...BALANCE.world,
    ...preset,
    ...worldOptions,
    ground: {
      ...BALANCE.world.ground,
      ...(preset.ground ?? {}),
      ...(worldOptions.ground ?? {})
    },
    sky: {
      ...WORLD_PRESETS['snow-valley'].sky,
      ...(preset.sky ?? {}),
      ...(worldOptions.sky ?? {})
    },
    palette: {
      ...WORLD_PRESETS['snow-valley'].palette,
      ...(preset.palette ?? {}),
      ...(worldOptions.palette ?? {})
    },
    terrain: {
      ...DEFAULT_TERRAIN_PROFILE,
      ...(preset.terrain ?? {}),
      ...(worldOptions.terrain ?? {})
    },
    snowfall: {
      seed: 309,
      countScale: 1,
      gustScale: 1,
      windScale: 1,
      ...(preset.snowfall ?? {}),
      ...(worldOptions.snowfall ?? {})
    },
    forestZones: worldOptions.forestZones ?? preset.forestZones ?? FOREST_ZONES,
    forestPassages: worldOptions.forestPassages ?? preset.forestPassages ?? FOREST_PASSAGES,
    clearings: worldOptions.clearings ?? preset.clearings ?? CLEARINGS,
    boulderClusters: worldOptions.boulderClusters ?? preset.boulderClusters ?? BOULDER_CLUSTERS,
    landmarkBoulders: worldOptions.landmarkBoulders ?? preset.landmarkBoulders ?? LANDMARK_BOULDERS,
    puddles: worldOptions.puddles ?? preset.puddles ?? BALANCE.world.puddles,
    altars: worldOptions.altars ?? preset.altars ?? BALANCE.world.altars,
    wildlife: worldOptions.wildlife ?? preset.wildlife ?? BALANCE.world.wildlife,
    pathPoints: worldOptions.pathPoints ?? preset.pathPoints ?? BALANCE.world.pathPoints,
    pathWidth: worldOptions.pathWidth ?? preset.pathWidth ?? BALANCE.world.pathWidth
  };
}

function worldConfig() {
  return activeWorldConfig;
}

function rawPathPoints() {
  return worldConfig().rawPathPoints;
}

export function terrainHeightAt(x, z) {
  const config = worldConfig();
  const terrain = config.terrain;
  const pathDistance = distanceToPath(x, z, rawPathPoints());
  const northMask = northMaskAt(z);
  const sideRise = smoothstep(12, 39, Math.abs(x));
  const valleyMask = 1 - smoothstep(6, 22, pathDistance);
  let height = terrain.baseHeight +
    northMask * terrain.northRise +
    sideRise * (terrain.sideRise + northMask * terrain.sideNorthRise);

  terrain.hills.forEach((hill) => {
    height += hillHeight(x, z, hill.x, hill.z, hill.rx, hill.rz, hill.height);
  });
  terrain.ridges.forEach((ridge) => {
    height += ridgeHeight(x, z, ridge.x, ridge.z, ridge.rx, ridge.rz, ridge.height);
  });

  const roughness = (
    Math.sin(x * 0.18 + z * 0.09) * 0.24 +
    Math.cos(x * 0.11 - z * 0.15) * 0.2 +
    Math.sin((x + z) * 0.07) * 0.18
  ) * terrain.roughnessScale;
  height += roughness * mix(0.42, 1, smoothstep(5, 18, pathDistance));

  const valleyFloor = terrain.valleyFloorBase +
    northMask * terrain.valleyNorthRise +
    smoothstep(0, 32, Math.abs(x)) * terrain.valleySideRise;
  height = mix(height, Math.min(height, valleyFloor), valleyMask * 0.68);

  const playerBase = config.playerBasePosition;
  const enemyCamp = config.enemyCampPosition;
  const playerDistance = Math.hypot(x - playerBase.x, z - playerBase.z);
  height = mix(height, 0.22, 1 - smoothstep(5, 12, playerDistance));

  const campDistance = Math.hypot(x - enemyCamp.x, z - enemyCamp.z);
  const campShelf = 1 - smoothstep(terrain.campShelfInner, terrain.campShelfOuter, campDistance);
  const campTerrace = terrain.campTerrace +
    smoothstep(0, terrain.campShelfOuter, campDistance) * terrain.campTerraceOutward;
  height = mix(height, campTerrace, campShelf * 0.78);

  return Math.max(0, height);
}

function createGroundMesh() {
  const config = worldConfig();
  const geometry = new THREE.PlaneGeometry(
    config.ground.width,
    config.ground.depth,
    106,
    102
  );
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = -position.getY(i);
    position.setZ(i, terrainHeightAt(x, z));
  }
  position.needsUpdate = true;
  colorGroundGeometry(geometry);
  geometry.computeVertexNormals();

  const ground = new THREE.Mesh(geometry, createGroundMaterial());
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}

function createGroundMaterial() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.03,
    flatShading: false
  });
}

function colorGroundGeometry(geometry) {
  const position = geometry.attributes.position;
  const colors = new Array(position.count * 3);

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = -position.getY(i);
    const h = position.getZ(i);
    const color = terrainColorAt(x, z, h);
    const offset = i * 3;
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function terrainColorAt(x, z, height) {
  const config = worldConfig();
  const palette = config.palette;
  const color = new THREE.Color(palette.base);
  const northMask = northMaskAt(z);
  const sideRise = smoothstep(10, 39, Math.abs(x));
  const snowMask = snowMaskAt(x, z, height);
  const pathDistance = distanceToPath(x, z, rawPathPoints());
  const valleyMask = 1 - smoothstep(7, 22, pathDistance);
  const forestFloor = forestFloorMask(x, z);
  const facet = hash2(x * 0.14, z * 0.14) - 0.5;

  color.lerp(new THREE.Color(palette.side), sideRise * 0.28);
  color.lerp(new THREE.Color(palette.north), northMask * 0.22);
  color.lerp(new THREE.Color(palette.valley), valleyMask * 0.12);
  color.lerp(new THREE.Color(palette.forest), forestFloor * 0.18);
  color.lerp(new THREE.Color(palette.high), smoothstep(4.8, 8.8, height) * 0.24);
  color.lerp(new THREE.Color(palette.snow), 0.48 + snowMask * 0.38);
  color.offsetHSL(0, 0.006 * facet, 0.018 * facet);
  return color;
}

function pathVectors() {
  return worldConfig().pathPoints.map((point) => {
    const y = terrainHeightAt(point.x, point.z) + SURFACE_OFFSET;
    return new THREE.Vector3(point.x, y, point.z);
  });
}

function createPath(scene, points) {
  const material = overlayMat(worldConfig().palette.path, { roughness: 0.94 });
  const curve = new THREE.CatmullRomCurve3(points);
  const samples = curve.getPoints(112);
  let ribbonPoints = [];

  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    if (ribbonPoints.length === 0) {
      ribbonPoints.push(a);
    }
    ribbonPoints.push(b);
  }
  buildPathRibbon(scene, ribbonPoints, material);

  for (let i = 0; i < points.length; i += 1) {
    if (![1, 3, 6, 8].includes(i)) continue;
    const marker = createRock(0.42 + (i % 2) * 0.16, {
      color: '#7d8788',
      snowCap: true
    });
    const side = i % 2 === 0 ? 1 : -1;
    const x = points[i].x + side * 2.9;
    const z = points[i].z;
    marker.position.set(x, terrainHeightAt(x, z), z);
    marker.rotation.y = i * 0.7;
    scene.add(marker);
  }
}

function buildPathRibbon(scene, points, material) {
  if (points.length < 2) return;

  const positions = [];
  const indices = [];
  const halfWidth = worldConfig().pathWidth / 2;

  points.forEach((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    let dx = next.x - previous.x;
    let dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    const nx = -dz;
    const nz = dx;
    const left = { x: point.x + nx * halfWidth, z: point.z + nz * halfWidth };
    const right = { x: point.x - nx * halfWidth, z: point.z - nz * halfWidth };
    positions.push(left.x, terrainHeightAt(left.x, left.z) + PATH_SURFACE_OFFSET, left.z);
    positions.push(right.x, terrainHeightAt(right.x, right.z) + PATH_SURFACE_OFFSET, right.z);

    if (index < points.length - 1) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const path = new THREE.Mesh(geometry, material);
  path.receiveShadow = true;
  path.renderOrder = 2;
  scene.add(path);
}

function createPuddles(scene) {
  const material = overlayMat(worldConfig().palette.puddle, {
    roughness: 0.28,
    metalness: 0.05,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  worldConfig().puddles.forEach((puddle, index) => {
    const mesh = createPuddleMesh(puddle, material);
    mesh.renderOrder = 3 + index;
    scene.add(mesh);
  });
}

function createPuddleMesh(puddle, material) {
  const segments = 12;
  const positions = [
    puddle.x,
    terrainHeightAt(puddle.x, puddle.z) + 0.055,
    puddle.z
  ];
  const indices = [];
  const cos = Math.cos(puddle.rot);
  const sin = Math.sin(puddle.rot);

  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const wobble = 0.88 + Math.sin(angle * 2.7 + puddle.x) * 0.08 + Math.cos(angle * 4.3) * 0.04;
    const localX = Math.cos(angle) * puddle.rx * wobble;
    const localZ = Math.sin(angle) * puddle.rz * wobble;
    const x = puddle.x + localX * cos - localZ * sin;
    const z = puddle.z + localX * sin + localZ * cos;
    positions.push(x, terrainHeightAt(x, z) + 0.06, z);
  }

  for (let i = 1; i <= segments; i += 1) {
    indices.push(0, i, i + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = false;
  return mesh;
}

function createSky(scene) {
  const clouds = worldConfig().clouds ?? [
    { x: -32, y: 62, z: -38, scale: 3.5, rot: 0.08 },
    { x: -12, y: 69, z: -44, scale: 2.6, rot: -0.18 },
    { x: 24, y: 66, z: -43, scale: 3.2, rot: 0.22 },
    { x: 39, y: 76, z: -52, scale: 2.4, rot: -0.1 },
    { x: -43, y: 78, z: -54, scale: 4.4, rot: 0.12 }
  ];

  clouds.forEach((item) => {
    const cloud = createCloudModel(item.scale);
    cloud.position.set(item.x, item.y, item.z);
    cloud.rotation.y = item.rot;
    scene.add(cloud);
  });
}

function createSnowfall(scene) {
  const snowfallConfig = worldConfig().snowfall;
  const countScale = snowfallConfig.countScale ?? 1;
  const gustScale = snowfallConfig.gustScale ?? 1;
  const windScale = snowfallConfig.windScale ?? 1;
  const random = seededRandom(snowfallConfig.seed ?? 309);
  const snowTexture = createSnowflakeTexture();
  const layers = [
    createSnowLayer({
      count: Math.round(330 * countScale),
      radiusX: 58,
      radiusZ: 46,
      minY: 3.8,
      maxY: 31,
      size: 0.23,
      opacity: 0.86,
      fallSpeed: 6.6,
      windX: -4.9 * windScale,
      windZ: 2.15 * windScale,
      random
    }),
    createSnowLayer({
      count: Math.round(230 * countScale),
      radiusX: 76,
      radiusZ: 58,
      minY: 5.5,
      maxY: 39,
      size: 0.13,
      opacity: 0.58,
      fallSpeed: 3.8,
      windX: -6.4 * windScale,
      windZ: 2.7 * windScale,
      random
    })
  ];
  const gusts = createSnowGustLayer(random, gustScale, windScale);

  layers.forEach((layer) => {
    layer.points.material.map = snowTexture;
    scene.add(layer.points);
  });
  scene.add(gusts.lines);

  return {
    update(dt, cameraTarget) {
      SNOWFALL_CENTER.copy(cameraTarget ?? SNOWFALL_CENTER);
      layers.forEach((layer) => updateSnowLayer(layer, dt, SNOWFALL_CENTER, random));
      updateSnowGustLayer(gusts, dt, SNOWFALL_CENTER, random);
    }
  };
}

function createSnowLayer({
  count,
  radiusX,
  radiusZ,
  minY,
  maxY,
  size,
  opacity,
  fallSpeed,
  windX,
  windZ,
  random
}) {
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    resetSnowflake(positions, i, new THREE.Vector3(), radiusX, radiusZ, minY, maxY, random);
    speeds[i] = 0.65 + random() * 0.9;
    phases[i] = random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: '#dff2ff',
    size,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    sizeAttenuation: true
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 18;

  return {
    points,
    positions,
    speeds,
    phases,
    radiusX,
    radiusZ,
    minY,
    maxY,
    fallSpeed,
    windX,
    windZ,
    time: random() * 10
  };
}

function updateSnowLayer(layer, dt, center, random) {
  layer.time += dt;
  const position = layer.points.geometry.attributes.position;

  for (let i = 0; i < layer.speeds.length; i += 1) {
    const offset = i * 3;
    const speed = layer.speeds[i];
    layer.positions[offset] += layer.windX * dt * speed + Math.sin(layer.time * 2.2 + layer.phases[i]) * dt * 0.35;
    layer.positions[offset + 1] -= layer.fallSpeed * dt * speed;
    layer.positions[offset + 2] += layer.windZ * dt * speed;

    const x = layer.positions[offset];
    const y = layer.positions[offset + 1];
    const z = layer.positions[offset + 2];
    const groundY = terrainHeightAt(x, z) + layer.minY;
    if (
      y < groundY ||
      x < center.x - layer.radiusX * 0.5 ||
      x > center.x + layer.radiusX * 0.5 ||
      z < center.z - layer.radiusZ * 0.5 ||
      z > center.z + layer.radiusZ * 0.5
    ) {
      resetSnowflake(layer.positions, i, center, layer.radiusX, layer.radiusZ, layer.maxY * 0.62, layer.maxY, random);
    }
  }

  position.needsUpdate = true;
}

function createSnowGustLayer(random, gustScale = 1, windScale = 1) {
  const count = Math.round(68 * gustScale);
  const radiusX = 62;
  const radiusZ = 46;
  const minY = 5.5;
  const maxY = 22;
  const positions = new Float32Array(count * 2 * 3);
  const speeds = new Float32Array(count);
  const lengths = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    speeds[i] = 0.8 + random() * 1.3;
    lengths[i] = 1.2 + random() * 1.9;
    resetSnowGust(positions, i, new THREE.Vector3(), radiusX, radiusZ, minY, maxY, lengths[i], random);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: '#d7eef7',
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      depthTest: false
    })
  );
  lines.frustumCulled = false;
  lines.renderOrder = 17;

  return {
    lines,
    positions,
    speeds,
    lengths,
    radiusX,
    radiusZ,
    minY,
    maxY,
    windX: -9.8 * windScale,
    windZ: 4.2 * windScale,
    fallSpeed: 2.15
  };
}

function updateSnowGustLayer(layer, dt, center, random) {
  const position = layer.lines.geometry.attributes.position;
  for (let i = 0; i < layer.speeds.length; i += 1) {
    const offset = i * 6;
    const speed = layer.speeds[i];
    const dx = layer.windX * dt * speed;
    const dy = -layer.fallSpeed * dt * speed;
    const dz = layer.windZ * dt * speed;

    for (let j = 0; j < 2; j += 1) {
      const vertex = offset + j * 3;
      layer.positions[vertex] += dx;
      layer.positions[vertex + 1] += dy;
      layer.positions[vertex + 2] += dz;
    }

    const x = layer.positions[offset];
    const y = layer.positions[offset + 1];
    const z = layer.positions[offset + 2];
    if (
      y < terrainHeightAt(x, z) + layer.minY ||
      x < center.x - layer.radiusX * 0.5 ||
      x > center.x + layer.radiusX * 0.5 ||
      z < center.z - layer.radiusZ * 0.5 ||
      z > center.z + layer.radiusZ * 0.5
    ) {
      resetSnowGust(layer.positions, i, center, layer.radiusX, layer.radiusZ, layer.maxY * 0.68, layer.maxY, layer.lengths[i], random);
    }
  }
  position.needsUpdate = true;
}

function resetSnowflake(positions, index, center, radiusX, radiusZ, minY, maxY, random) {
  const offset = index * 3;
  positions[offset] = center.x + (random() - 0.5) * radiusX;
  positions[offset + 1] = minY + random() * (maxY - minY);
  positions[offset + 2] = center.z + (random() - 0.5) * radiusZ;
}

function resetSnowGust(positions, index, center, radiusX, radiusZ, minY, maxY, length, random) {
  const offset = index * 6;
  const x = center.x + (random() - 0.5) * radiusX;
  const y = minY + random() * (maxY - minY);
  const z = center.z + (random() - 0.5) * radiusZ;
  const windX = -length * (0.86 + random() * 0.22);
  const windZ = length * (0.28 + random() * 0.24);
  positions[offset] = x;
  positions[offset + 1] = y;
  positions[offset + 2] = z;
  positions[offset + 3] = x + windX;
  positions[offset + 4] = y - length * 0.18;
  positions[offset + 5] = z + windZ;
}

function createSnowflakeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(16, 16, 1, 16, 16, 15);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.42, 'rgba(255,255,255,0.68)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createMountainRidge(scene) {
  const peaks = worldConfig().mountainRidge ?? [
    { x: -36, z: -43, width: 5.4, height: 10, rot: -0.18, color: '#8a6956' },
    { x: -24, z: -44, width: 7, height: 15, rot: 0.14, color: '#7b5646' },
    { x: -12, z: -44, width: 5.8, height: 13, rot: -0.06, color: '#92715c' },
    { x: 1, z: -45, width: 7.6, height: 17, rot: 0.08, color: '#806050' },
    { x: 15, z: -44, width: 6.4, height: 14, rot: -0.1, color: '#8c684f' },
    { x: 29, z: -43, width: 6.2, height: 12, rot: 0.16, color: '#7a5748' },
    { x: 40, z: -42, width: 5.2, height: 10.5, rot: -0.08, color: '#8f6d54' }
  ];

  peaks.forEach((item) => {
    const peak = createMountainPeak(item.width, item.height, item.color);
    placeOnTerrain(peak, item.x, item.z, -0.2);
    peak.rotation.y = item.rot;
    scene.add(peak);
  });
}

function createSnowMountain(scene) {
  (worldConfig().snowPeaks ?? [
    { x: -15, z: -40, width: 5.8, height: 10 },
    { x: 16, z: -40, width: 6.4, height: 12 },
    { x: 4, z: -42, width: 7.4, height: 14 }
  ]).forEach((peakData) => {
    const peak = createMountainPeak(peakData.width, peakData.height);
    placeOnTerrain(peak, peakData.x, peakData.z, -0.1);
    scene.add(peak);
  });
}

function decorate(scene, pathPoints) {
  const random = seededRandom(worldConfig().seed ?? 42);
  placeCottages(scene);
  placeForests(scene, pathPoints, random);
  placeRocks(scene, pathPoints, random);
  placeBoulderClusters(scene, pathPoints, random);
  placeLandmarkBoulders(scene, pathPoints);
  placeBushes(scene, pathPoints, random);
  placeGrass(scene, pathPoints, random);
}

function placeForests(scene, pathPoints, random) {
  worldConfig().forestZones.forEach((zone) => {
    for (let i = 0; i < zone.count; i += 1) {
      const point = randomPointInEllipse(zone, random);
      if (!point) continue;
      const { x, z } = point;
      if (!isDecorationClear(x, z, pathPoints, zone.tone === 'snow' ? 3.8 : 3.5)) continue;
      if (isForestPassage(x, z, pathPoints)) continue;

      const height = zone.tone === 'snow'
        ? 0.76 + random() * 0.9
        : 0.78 + random() * 1.65;
      const tree = createSnowPine(height);
      placeOnTerrain(tree, x, z);
      tree.rotation.y = random() * Math.PI * 2;
      scene.add(tree);
    }
  });
}

function placeRocks(scene, pathPoints, random) {
  const config = worldConfig();
  const halfWidth = config.ground.width / 2 - 5;
  const halfDepth = config.ground.depth / 2 - 5;
  for (let i = 0; i < 96; i += 1) {
    const ridgeBias = random() > 0.48;
    const x = ridgeBias
      ? (random() > 0.5 ? 24 + random() * 16 : -40 + random() * 16)
      : -halfWidth + random() * halfWidth * 2;
    const z = ridgeBias
      ? -34 + random() * 54
      : -halfDepth + random() * halfDepth * 2;
    if (!isDecorationClear(x, z, pathPoints, 3.4)) continue;
    const elevation = terrainHeightAt(x, z);
    if (!ridgeBias && elevation < 2.6 && random() > 0.35) continue;
    const rock = createRock(0.42 + random() * (z < -22 ? 1.28 : 0.88), {
      color: random() > 0.45 ? '#748083' : '#858b84',
      snowCap: random() > 0.35
    });
    placeOnTerrain(rock, x, z);
    rock.rotation.y = random() * Math.PI * 2;
    if (z < -24) {
      rock.scale.y *= 1.2;
    }
    scene.add(rock);
  }
}

function placeBoulderClusters(scene, pathPoints, random) {
  worldConfig().boulderClusters.forEach((cluster) => {
    for (let i = 0; i < cluster.count; i += 1) {
      const { x, z } = randomPointInEllipse(cluster, random);
      if (!isDecorationClear(x, z, pathPoints, 5.2)) continue;
      if (distanceToPath(x, z, pathPoints) < 7.4) continue;

      const size = cluster.sizeMin + random() * (cluster.sizeMax - cluster.sizeMin);
      const rock = createRock(size, {
        color: random() > 0.5 ? '#6e777b' : '#838984',
        snowCap: true
      });
      rock.scale.x *= 0.9 + random() * 0.48;
      rock.scale.y *= 0.82 + random() * 0.42;
      rock.scale.z *= 0.78 + random() * 0.58;
      placeOnTerrain(rock, x, z, 0.02);
      rock.rotation.set(
        random() * 0.08,
        random() * Math.PI * 2,
        (random() - 0.5) * 0.1
      );
      scene.add(rock);
    }
  });
}

function placeLandmarkBoulders(scene, pathPoints) {
  worldConfig().landmarkBoulders.forEach((item) => {
    if (!isDecorationClear(item.x, item.z, pathPoints, 5.8)) return;
    if (distanceToPath(item.x, item.z, pathPoints) < 7.2) return;
    const rock = createRock(item.size, {
      color: '#747d7f',
      snowCap: true
    });
    rock.scale.set(item.sx, item.sy, item.sz);
    placeOnTerrain(rock, item.x, item.z, 0.02);
    rock.rotation.y = item.rot;
    scene.add(rock);
  });
}

function placeBushes(scene, pathPoints, random) {
  const clusters = [
    { x: -37, z: 22, rx: 3.8, rz: 7.2, count: 12 },
    { x: 37, z: 13, rx: 3.2, rz: 6.4, count: 10 },
    { x: -36, z: -9, rx: 3.2, rz: 7.5, count: 12 },
    { x: 35, z: -19, rx: 3.8, rz: 6.6, count: 11 },
    { x: -15, z: -31, rx: 5.4, rz: 2.4, count: 8 },
    { x: 14, z: -31, rx: 5.2, rz: 2.2, count: 8 },
    ...worldConfig().puddles.map((puddle) => ({
      x: puddle.x,
      z: puddle.z,
      rx: puddle.rx + 1.1,
      rz: puddle.rz + 0.9,
      count: 5
    }))
  ];

  clusters.forEach((cluster) => {
    for (let i = 0; i < cluster.count; i += 1) {
      const { x, z } = randomPointInEllipse(cluster, random);
      if (!isDecorationClear(x, z, pathPoints, 2.2)) continue;
      if (distanceToPath(x, z, pathPoints) < 5.4 && random() > 0.25) continue;
      const bush = createBush(0.42 + random() * 0.48, {
        leafColor: random() > 0.5 ? '#526f5e' : '#647960',
        berryColor: '#8e6f60',
        snowCap: true
      });
      bush.scale.y *= 0.72;
      placeOnTerrain(bush, x, z);
      bush.rotation.y = random() * Math.PI * 2;
      scene.add(bush);
    }
  });
}

function placeGrass(scene, pathPoints, random) {
  const grassColors = ['#d8d5bd', '#c9cbb4', '#c4c0a4', '#e4e5d7'];
  const clusters = [
    { x: -34, z: 19, rx: 4.2, rz: 5.8, count: 10 },
    { x: 33, z: 12, rx: 4, rz: 5.2, count: 9 },
    { x: -32, z: -11, rx: 4.4, rz: 5.8, count: 10 },
    { x: 31, z: -17, rx: 4.2, rz: 5.6, count: 10 },
    { x: -12, z: 27, rx: 2.8, rz: 2.2, count: 6 },
    { x: 12, z: 27, rx: 2.8, rz: 2.2, count: 6 },
    ...worldConfig().puddles.map((puddle) => ({
      x: puddle.x,
      z: puddle.z,
      rx: puddle.rx + 1.6,
      rz: puddle.rz + 1.1,
      count: 6
    }))
  ];

  clusters.forEach((cluster) => {
    for (let i = 0; i < cluster.count; i += 1) {
      const { x, z } = randomPointInEllipse(cluster, random);
      if (!isDecorationClear(x, z, pathPoints, 1.6)) continue;
      if (terrainHeightAt(x, z) > 5.8 && random() > 0.2) continue;
      const grass = createGrassTuft(
        0.34 + random() * 0.46,
        grassColors[Math.floor(random() * grassColors.length)]
      );
      placeOnTerrain(grass, x, z, 0.15);
      grass.rotation.y = random() * Math.PI * 2;
      scene.add(grass);
    }
  });
}

function placeCottages(scene) {
  const cottages = worldConfig().cottages ?? [
    { x: -7.8, z: 34, rot: 0.68, scale: 0.94, roof: '#b64a3d' },
    { x: 7.2, z: 33.2, rot: -0.58, scale: 0.88, roof: '#a84f39' },
    { x: -11.5, z: 27.6, rot: 1.92, scale: 0.76, roof: '#91513a' },
    { x: 10.8, z: 26.7, rot: -1.22, scale: 0.78, roof: '#92533b' },
    { x: -27.5, z: 5.5, rot: 1.12, scale: 0.72, wall: '#a77750', roof: '#744230' },
    { x: 25.6, z: -5.7, rot: -0.5, scale: 0.72, wall: '#a77750', roof: '#744230' },
    { x: -12.5, z: -25.8, rot: -2.55, scale: 0.7, wall: '#9f6b45', roof: '#6f3d31' },
    { x: 9.4, z: -25.4, rot: 2.25, scale: 0.74, wall: '#9f6b45', roof: '#6f3d31' }
  ];

  cottages.forEach((item) => {
    const cottage = createCottageModel(item);
    placeOnTerrain(cottage, item.x, item.z);
    cottage.rotation.y = item.rot;
    cottage.scale.setScalar(item.scale);
    scene.add(cottage);
  });
}

function createSnowMonsterCamp(scene) {
  const camp = createMonsterCampModel();
  const config = worldConfig().monsterCamp ?? { x: 4, z: -34, rot: -0.34, scale: 1.18 };
  placeOnTerrain(camp, config.x, config.z, config.offset ?? 0.28);
  camp.rotation.y = config.rot ?? -0.34;
  camp.scale.setScalar(config.scale ?? 1.18);
  scene.add(camp);
}

function placeOnTerrain(object, x, z, offset = 0) {
  object.position.set(x, terrainHeightAt(x, z) + offset, z);
}

function randomPointInEllipse(zone, random) {
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(random());
  return {
    x: zone.x + Math.cos(angle) * zone.rx * radius,
    z: zone.z + Math.sin(angle) * zone.rz * radius
  };
}

function isDecorationClear(x, z, pathPoints, clearance) {
  const config = worldConfig();
  if (distanceToPath(x, z, pathPoints) < clearance) return false;
  if (config.clearings.some((clearing) => Math.hypot(x - clearing.x, z - clearing.z) < clearing.r)) {
    return false;
  }
  if (isAltarClearing(x, z)) {
    return false;
  }
  if (Math.hypot(x - config.playerBasePosition.x, z - config.playerBasePosition.z) < 9) {
    return false;
  }
  if (Math.hypot(x - config.enemyCampPosition.x, z - config.enemyCampPosition.z) < 6) {
    return false;
  }
  return true;
}

function isAltarClearing(x, z) {
  return (worldConfig().altars ?? []).some((altar) => {
    const position = altar.position ?? altar;
    return Math.hypot(x - position.x, z - position.z) < (altar.clearingRadius ?? 5.4);
  });
}

function isForestPassage(x, z, pathPoints) {
  if (distanceToPath(x, z, pathPoints) < 5.8) return true;
  return worldConfig().forestPassages.some((passage) => distanceToPath(x, z, passage) < 3.3);
}

function isSnowRegion(x, z) {
  return snowMaskAt(x, z, terrainHeightAt(x, z)) > 0.48;
}

function hillHeight(x, z, cx, cz, rx, rz, height) {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  const distance = Math.sqrt(dx * dx + dz * dz);
  const falloff = 1 - smoothstep(0, 1, distance);
  return Math.max(0, falloff) * height;
}

function ridgeHeight(x, z, cx, cz, rx, rz, height) {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  const distance = Math.sqrt(dx * dx + dz * dz);
  const falloff = 1 - smoothstep(0.08, 1.05, distance);
  return Math.max(0, falloff) * height;
}

function northMaskAt(z) {
  return 1 - smoothstep(-38, -2, z);
}

function snowMaskAt(x, z, height = 0) {
  const snowCenter = worldConfig().terrain.snowCenter ?? SNOW_CENTER;
  const latitude = 1 - smoothstep(-36, -17, z);
  const altitude = smoothstep(2.5, 7.5, height);
  const snowBasin = 1 - smoothstep(12, 28, Math.hypot(x - snowCenter.x, (z - snowCenter.z) * 1.15));
  return clamp(latitude * (0.28 + altitude * 0.42) + snowBasin * 0.16 + altitude * northMaskAt(z) * 0.12, 0, 1);
}

function forestFloorMask(x, z) {
  return worldConfig().forestZones.reduce((best, zone) => {
    const dx = (x - zone.x) / zone.rx;
    const dz = (z - zone.z) / zone.rz;
    const distance = Math.sqrt(dx * dx + dz * dz);
    return Math.max(best, 1 - smoothstep(0.45, 1.1, distance));
  }, 0);
}

function overlayMat(color, options = {}) {
  return mat(color, {
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    ...options
  });
}

function distanceToPath(x, z, points) {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length - 1; i += 1) {
    best = Math.min(best, distanceToSegment2D(x, z, points[i], points[i + 1]));
  }
  return best;
}

function distanceToSegment2D(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 0.0001) {
    return Math.hypot(x - a.x, z - a.z);
  }
  const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1);
  const px = a.x + dx * t;
  const pz = a.z + dz * t;
  return Math.hypot(x - px, z - pz);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mix(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

function hash2(x, z) {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}
