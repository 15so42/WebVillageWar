import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BALANCE } from '../data/gameData.js';
import {
  basicMat,
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
import { NavigationGrid } from './NavigationGrid.js';

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
const DUNGEON_BRIDGE_OVERHANG = 2.8;
const DUNGEON_SAFE_PLATFORM_INSET = 0.94;
const DUNGEON_NAV_PLATFORM_INSET = 0.62;
const DUNGEON_NAV_BRIDGE_ENTRY_PLATFORM_INSET = 0.78;
const DUNGEON_SAFE_BRIDGE_HALF_WIDTH = 1.18;
const DUNGEON_NAV_BRIDGE_HALF_WIDTH = 0.55;
const DUNGEON_NAV_BRIDGE_OVERHANG = DUNGEON_BRIDGE_OVERHANG;
const DUNGEON_NAV_MESH_STEP = 0.8;
const DUNGEON_NAV_BRIDGE_ENTRY_DEPTH = DUNGEON_NAV_BRIDGE_OVERHANG + DUNGEON_NAV_MESH_STEP * 1.5;
const DUNGEON_NAV_BRIDGE_ENTRY_APPROACH_DEPTH = 6.2;
const DUNGEON_NAV_BRIDGE_ENTRY_BACKTRACK = 0.5;
const DUNGEON_BRIDGEHEAD_CLEAR_HALF_WIDTH = 0.72;
const DUNGEON_BRIDGEHEAD_BLOCK_HALF_WIDTH = 2.35;
const DUNGEON_BRIDGEHEAD_BLOCK_INWARD = 1.8;
const DUNGEON_BRIDGEHEAD_BLOCK_BACK = 1.15;
const DUNGEON_BRIDGE_HEIGHT_BLEND_START = DUNGEON_BRIDGE_OVERHANG + DUNGEON_SAFE_BRIDGE_HALF_WIDTH;
const DUNGEON_BRIDGE_HEIGHT_BLEND_DEPTH = 2.8;
const WORLD_NAV_MESH_STEP = 0.8;
const WORLD_NAV_EDGE_MARGIN = 0.35;
const WORLD_NAV_PLAYER_BASE_RADIUS = 2.25;
const WORLD_NAV_ENEMY_CAMP_RADIUS = 2.65;
const WORLD_NAV_COTTAGE_RADIUS = 1.35;
const WORLD_NAV_MONSTER_CAMP_RADIUS = 2.8;
const DESERT_SHADOW_X_PER_HEIGHT = 0.34;
const DESERT_SHADOW_Z_PER_HEIGHT = -0.36;
const SNOWFALL_CENTER = new THREE.Vector3();
const BAKED_SHADOW_CHUNK_SIZE = 18;
const BAKED_SHADOW_SURFACE_OFFSET = 0.055;
const BAKED_SHADOW_MIN_TRIANGLE_AREA = 0.0008;
const SHADOW_MASK_SCENE_KEYS = new Set([
  'snow-valley',
  'pine-pass',
  'frozen-ridge',
  'dungeon-halls',
  'red-desert'
]);
const SHADOW_MASK_WIDTH = 1536;
const SHADOW_MASK_MAX_HEIGHT = 1536;
const SHADOW_MASK_COLOR = '#68717d';
const SHADOW_MASK_BLUR_PX = 0;
const SHADOW_MASK_SOFT_ALPHA = 0;
const SHADOW_MASK_CONTACT_ALPHA = 0.28;
const DEFAULT_SUN_POSITION = { x: -44, y: 82, z: 46 };
const BAKED_SHADOW_LIGHT_RAY = new THREE.Vector3();
const BAKED_SHADOW_TO_SUN = new THREE.Vector3();
const BAKED_SHADOW_BOX = new THREE.Box3();
const BAKED_SHADOW_CENTER = new THREE.Vector3();
const BAKED_SHADOW_WORLD_A = new THREE.Vector3();
const BAKED_SHADOW_WORLD_B = new THREE.Vector3();
const BAKED_SHADOW_WORLD_C = new THREE.Vector3();
const BAKED_SHADOW_PROJECTED_A = new THREE.Vector3();
const BAKED_SHADOW_PROJECTED_B = new THREE.Vector3();
const BAKED_SHADOW_PROJECTED_C = new THREE.Vector3();
const BAKED_SHADOW_EDGE_A = new THREE.Vector3();
const BAKED_SHADOW_EDGE_B = new THREE.Vector3();
const BAKED_SHADOW_NORMAL = new THREE.Vector3();
const STATIC_WORLD_CULL_UPDATE_SECONDS = 0.16;
const STATIC_WORLD_CULL_RADIUS_PADDING = 8;
const STATIC_WORLD_CULL_MIN_RADIUS = 0.8;
const STATIC_DECORATION_BATCH_CHUNK_SIZE = 24;
const STATIC_CULL_BOX = new THREE.Box3();
const STATIC_CULL_CENTER = new THREE.Vector3();
const STATIC_CULL_SIZE = new THREE.Vector3();
const STATIC_CULL_MATRIX = new THREE.Matrix4();
const STATIC_CULL_FRUSTUM = new THREE.Frustum();
const STATIC_CULL_SPHERE = new THREE.Sphere();
const STATIC_BATCH_BOX = new THREE.Box3();
const STATIC_BATCH_CENTER = new THREE.Vector3();
let activeBakedShadowBatch = null;
let activeStaticCullables = null;
let activeStaticDecorationBatch = null;

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
      toneMapping: 'linear',
      exposure: 1.1,
      background: '#f0f8fc',
      skyGradient: {
        top: '#7fc5f7',
        middle: '#f0f8fc',
        horizon: '#f9ead8'
      },
      fog: '#f7f8f2',
      fogNear: 110,
      fogFar: 282,
      sun: '#fde2e2',
      sunIntensity: 2.12,
      sunPosition: { x: -88, y: 48, z: 48 },
      sunTarget: { x: 0, y: 0, z: -4 },
      hemiSky: '#e8f4ff',
      hemiGround: '#bebbc5',
      hemiIntensity: 1.52,
      shadowMapSize: 2048,
      shadowRadius: 2,
      shadowBias: -0.0006,
      shadowNormalBias: 0.018,
      realtimeShadows: false,
      bakedShadows: true,
      toneMapping: 'neutral',
      exposure: 1.1
    },
    palette: {
      base: '#fffef8',
      side: '#efeee8',
      north: '#f3f7f4',
      valley: '#f6f1e9',
      forest: '#b9c4b9',
      high: '#f1f0e9',
      snow: '#fffef9',
      path: '#e8e1d6',
      puddle: '#d2eef5'
    },
    ground: {
      width: 344,
      depth: 264
    },
    navigationBounds: {
      minX: -50,
      maxX: 50,
      minZ: -42,
      maxZ: 42
    },
    pathWidth: 3.9,
    pathOrganic: {
      widthJitter: 0.22,
      edgeJitter: 0.28
    },
    pathPoints: [
      { x: 0, z: 30 },
      { x: 5, z: 24 },
      { x: 10, z: 18 },
      { x: 7, z: 12 },
      { x: -2, z: 7 },
      { x: -9, z: 1 },
      { x: -8, z: -7 },
      { x: -1, z: -13 },
      { x: 8, z: -20 },
      { x: 9, z: -27 },
      { x: 5, z: -33 },
      { x: 5, z: -35 }
    ],
    puddles: [
      { x: -14, z: 9, rx: 4.8, rz: 2.3, rot: -0.18 },
      { x: 17, z: 7, rx: 5.6, rz: 2.15, rot: -0.44 },
      { x: -17, z: 25, rx: 4.2, rz: 1.65, rot: 0.2 },
      { x: 29, z: -18, rx: 3.1, rz: 1.25, rot: 0.38 }
    ],
    iceFloes: [
      { x: -56, z: 23, rx: 3.8, rz: 1.35, rot: -0.28, irregularity: 0.34 },
      { x: -51, z: -18, rx: 3.1, rz: 1.1, rot: 0.46, irregularity: 0.36 },
      { x: 57, z: 8, rx: 3.6, rz: 1.25, rot: 0.2, irregularity: 0.32 },
      { x: 52, z: -27, rx: 3.2, rz: 1.05, rot: -0.48, irregularity: 0.34 },
      { x: -28, z: 50, rx: 3.5, rz: 1.2, rot: 0.5, irregularity: 0.34 },
      { x: 26, z: 50, rx: 3.7, rz: 1.22, rot: -0.34, irregularity: 0.32 }
    ],
    altars: [
      { id: 'energy-altar-west', type: 'energy', position: { x: -31, z: 14 }, rotation: -0.38, clearingRadius: 6.5 },
      { id: 'shield-altar-east', type: 'shield', position: { x: 28, z: -7 }, rotation: 0.46, clearingRadius: 6.5 },
      { id: 'respite-altar-northwest', type: 'respite', position: { x: -17, z: -6 }, rotation: 0.16, clearingRadius: 6.2 }
    ],
    wildlife: [
      { type: 'wolf', x: 31, z: -16, radius: 5.4 },
      { type: 'wolf', x: 37, z: -5, radius: 5.2 },
      { type: 'bear', x: -34, z: 6, radius: 6.2 },
      { type: 'wolf', x: -39, z: 18, radius: 5.4 },
      { type: 'bear', x: 33, z: 21, radius: 6.1 },
      { type: 'wolf', x: -27, z: -28, radius: 5.3 }
    ],
    clearings: [
      { x: 0, z: 30, r: 12.2 },
      { x: 9, z: 18, r: 6.7 },
      { x: 0, z: 1, r: 6.4 },
      { x: 18, z: -15, r: 6.5 },
      { x: -25, z: -34, r: 10.2 },
      { x: 0, z: -30, r: 9.6 }
    ],
    forestZones: [
      { x: -33, z: 7, rx: 15, rz: 17, count: 116, tone: 'deep', rot: -0.2, raggedness: 0.28, edgeDrop: 0.42 },
      { x: -36, z: 23, rx: 13, rz: 10, count: 62, tone: 'deep', rot: 0.16, raggedness: 0.32, edgeDrop: 0.48 },
      { x: -17, z: 14, rx: 8, rz: 8, count: 34, tone: 'cool', rot: -0.38, raggedness: 0.34, edgeDrop: 0.46 },
      { x: -17, z: -12, rx: 8.5, rz: 8, count: 32, tone: 'deep', rot: 0.34, raggedness: 0.34, edgeDrop: 0.44 },
      { x: 34, z: -8, rx: 12, rz: 20, count: 102, tone: 'cool', rot: 0.12, raggedness: 0.32, edgeDrop: 0.46 },
      { x: 31, z: 23, rx: 13, rz: 11, count: 66, tone: 'warm', rot: -0.3, raggedness: 0.34, edgeDrop: 0.48 },
      { x: 20, z: 8, rx: 7, rz: 8.5, count: 32, tone: 'warm', rot: 0.36, raggedness: 0.34, edgeDrop: 0.46 },
      { x: 22, z: -25, rx: 10, rz: 6, count: 34, tone: 'snow', rot: -0.22, raggedness: 0.36, edgeDrop: 0.5 },
      { x: 36, z: 32, rx: 10, rz: 7, count: 36, tone: 'cool', rot: 0.2, raggedness: 0.36, edgeDrop: 0.5 },
      { x: -19, z: -35, rx: 17, rz: 6.5, count: 46, tone: 'snow', rot: -0.06, raggedness: 0.28, edgeDrop: 0.42 },
      { x: 17, z: -36, rx: 16, rz: 6.5, count: 42, tone: 'snow', rot: 0.1, raggedness: 0.3, edgeDrop: 0.44 }
    ],
    deadGrassScale: 2.62,
    deadGrassFields: [
      { x: -11, z: 19, rx: 9.5, rz: 4.8, count: 18, clumps: 2, clumpRadius: 1.15, rot: -0.18 },
      { x: 12, z: 11, rx: 9, rz: 5, count: 18, clumps: 2, clumpRadius: 1.1, rot: 0.28 },
      { x: -20, z: 1, rx: 8, rz: 5.6, count: 16, clumps: 2, clumpRadius: 1.05, rot: 0.12 },
      { x: 23, z: -2, rx: 8.2, rz: 5.4, count: 16, clumps: 2, clumpRadius: 1.05, rot: -0.34 },
      { x: -25, z: -24, rx: 9.5, rz: 5, count: 18, clumps: 2, clumpRadius: 1.15, rot: 0.18 },
      { x: 28, z: -23, rx: 7.2, rz: 4.2, count: 14, clumps: 2, clumpRadius: 0.95, rot: -0.3 },
      { x: 1, z: 3, rx: 11, rz: 6.2, count: 20, clumps: 2, clumpRadius: 1.05, rot: -0.14, clearance: 1.45 },
      { x: 10, z: -11, rx: 10, rz: 5.4, count: 18, clumps: 2, clumpRadius: 1.0, rot: 0.32, clearance: 1.45 },
      { x: -8, z: -19, rx: 8.5, rz: 4.8, count: 16, clumps: 2, clumpRadius: 0.95, rot: -0.28, clearance: 1.45 },
      { x: 2, z: 18, rx: 9.5, rz: 4.4, count: 16, clumps: 2, clumpRadius: 1.05, rot: -0.4 },
      { x: 5, z: 31, rx: 12, rz: 4.2, count: 16, clumps: 2, clumpRadius: 1.1, rot: 0.08 },
      { x: -38, z: 30, rx: 7.2, rz: 4, count: 12, clumps: 2, clumpRadius: 0.95, rot: -0.24 },
      { x: 38, z: 15, rx: 7.6, rz: 4.8, count: 14, clumps: 2, clumpRadius: 1.0, rot: 0.2 },
      { x: 35, z: -34, rx: 7.8, rz: 3.8, count: 10, clumps: 2, clumpRadius: 0.9, rot: -0.1 }
    ],
    forestPassages: [
      [new THREE.Vector3(-43, 0, 32), new THREE.Vector3(-24, 0, 28), new THREE.Vector3(-10, 0, 20), new THREE.Vector3(8, 0, 12)],
      [new THREE.Vector3(43, 0, 26), new THREE.Vector3(30, 0, 18), new THREE.Vector3(20, 0, 9), new THREE.Vector3(9, 0, 1)],
      [new THREE.Vector3(-44, 0, -21), new THREE.Vector3(-29, 0, -26), new THREE.Vector3(-14, 0, -31), new THREE.Vector3(2, 0, -31)],
      [new THREE.Vector3(45, 0, -26), new THREE.Vector3(29, 0, -25), new THREE.Vector3(18, 0, -21), new THREE.Vector3(7, 0, -15)]
    ],
    boulderClusters: [
      { x: -44, z: 10, rx: 4.6, rz: 18, count: 13, sizeMin: 1.55, sizeMax: 3.2 },
      { x: 42, z: 25, rx: 6, rz: 13, count: 16, sizeMin: 1.7, sizeMax: 3.7 },
      { x: 45, z: -18, rx: 4.5, rz: 16, count: 13, sizeMin: 1.55, sizeMax: 3.05 },
      { x: -27, z: -41, rx: 15, rz: 3.6, count: 10, sizeMin: 1.45, sizeMax: 2.8 },
      { x: 20, z: -42, rx: 18, rz: 3.4, count: 9, sizeMin: 1.45, sizeMax: 2.85 },
      { x: 9, z: 39, rx: 24, rz: 3.6, count: 14, sizeMin: 1.35, sizeMax: 3.15 }
    ],
    landmarkBoulders: [
      { x: -21, z: 11, size: 3.1, sx: 1.3, sy: 0.88, sz: 0.96, rot: 0.42 },
      { x: 23, z: 10, size: 3, sx: 1.12, sy: 0.92, sz: 1.16, rot: -0.55 },
      { x: -12, z: 23, size: 2.65, sx: 1.24, sy: 0.88, sz: 0.94, rot: 0.82 },
      { x: 35, z: -26, size: 2.6, sx: 1.08, sy: 0.78, sz: 1.24, rot: -0.22 },
      { x: -35, z: -29, size: 2.5, sx: 1.16, sy: 0.84, sz: 1.02, rot: 0.2 }
    ],
    cottages: [
      { x: -40.5, z: -36.2, rot: 0.55, scale: 1.86, roof: '#b86649' },
      { x: -35.1, z: -40.1, rot: -0.18, scale: 1.72, roof: '#ad6449' },
      { x: -30.2, z: -33.4, rot: 0.86, scale: 1.58, wall: '#b88a64', roof: '#80523e' },
      { x: -25.6, z: -39.4, rot: -0.54, scale: 1.52, wall: '#b88a64', roof: '#80523e' },
      { x: -20.6, z: -34.9, rot: 0.38, scale: 1.42, wall: '#ac7d5a', roof: '#7a4d3e' },
      { x: -15.1, z: -39.2, rot: -0.75, scale: 1.34, wall: '#ac7d5a', roof: '#7a4d3e' },
      { x: -9.4, z: -35.6, rot: 0.44, scale: 1.26, wall: '#ac7d5a', roof: '#7a4d3e' },
      { x: -34.1, z: -30.5, rot: 1.18, scale: 1.38, wall: '#b88a64', roof: '#85543e' },
      { x: -27.6, z: -29.8, rot: -1.1, scale: 1.24, wall: '#ac7d5a', roof: '#7a4d3e' },
      { x: 12.4, z: 34.5, rot: -0.64, scale: 1.42, wall: '#ac7d5a', roof: '#7a4d3e' },
      { x: 31.4, z: 28.4, rot: -0.48, scale: 1.28, wall: '#ac7d5a', roof: '#7a4d3e' }
    ],
    landmass: {
      waterHeight: -1.28,
      oceanColor: '#4e9fb4',
      cliffColor: '#b6c0ba',
      cliffDarkColor: '#849490',
      cliffSkirt: {
        segments: 136,
        threshold: 0.82,
        overhang: 2.38,
        drop: 1.5,
        jitter: 0.48
      },
      shoreInner: 0.72,
      shoreOuter: 1.08,
      lobes: [
        { x: -2, z: -1, rx: 41, rz: 34, rot: -0.12, irregularity: 0.16 },
        { x: -31, z: 8, rx: 23, rz: 24, rot: 0.24, irregularity: 0.2 },
        { x: -31, z: 27, rx: 24, rz: 15, rot: -0.12, irregularity: 0.18 },
        { x: 31, z: 21, rx: 22, rz: 18, rot: -0.24, irregularity: 0.2 },
        { x: 35, z: -8, rx: 17, rz: 28, rot: -0.1, irregularity: 0.18 },
        { x: -24, z: -34, rx: 28, rz: 13, rot: -0.12, irregularity: 0.14 },
        { x: 16, z: -36, rx: 31, rz: 11, rot: 0.08, irregularity: 0.12 },
        { x: 4, z: 38, rx: 34, rz: 10, rot: 0.06, irregularity: 0.12 }
      ],
      bays: [
        { x: -48, z: 34, rx: 14, rz: 9, rot: -0.16, carve: 0.82 },
        { x: -52, z: -11, rx: 13, rz: 15, rot: 0.22, carve: 0.86 },
        { x: -3, z: 47, rx: 20, rz: 8, rot: 0.06, carve: 0.72 },
        { x: 43, z: 35, rx: 13, rz: 9, rot: 0.12, carve: 0.66 },
        { x: 51, z: 8, rx: 13, rz: 17, rot: -0.2, carve: 0.88 },
        { x: 47, z: -31, rx: 14, rz: 9, rot: -0.34, carve: 0.78 },
        { x: 3, z: -47, rx: 21, rz: 8, rot: -0.04, carve: 0.64 }
      ]
    },
    terrain: {
      ...DEFAULT_TERRAIN_PROFILE,
      roughnessScale: 0.72,
      northRise: 1.72,
      sideRise: 0.74,
      sideNorthRise: 2.25,
      valleyFloorBase: 0.28,
      valleyNorthRise: 1.06,
      valleySideRise: 0.25,
      campTerrace: 2.45,
      campTerraceOutward: 0.54,
      waterHeight: -1.28,
      coastRimHeight: 0.58,
      landLift: 1.48,
      coastBlendStart: 0.72,
      coastBlendEnd: 0.84,
      snowCenter: { x: 8, z: -32 },
      hills: [
        { x: -31, z: 9, rx: 22, rz: 27, height: 2.2 },
        { x: 33, z: -8, rx: 19, rz: 31, height: 2.95 },
        { x: 31, z: 25, rx: 18, rz: 18, height: 3.25 },
        { x: -24, z: -34, rx: 23, rz: 12, height: 2.45 },
        { x: 16, z: -36, rx: 25, rz: 11, height: 2.15 },
        { x: -18, z: 27, rx: 18, rz: 13, height: 1.4 }
      ],
      ridges: [
        { x: 41, z: 25, rx: 7, rz: 16, height: 4.1 },
        { x: 45, z: -13, rx: 7, rz: 29, height: 2.9 },
        { x: -44, z: 3, rx: 7, rz: 33, height: 2.25 },
        { x: -25, z: -42, rx: 22, rz: 7, height: 3.6 },
        { x: 20, z: -43, rx: 27, rz: 7, height: 4.25 },
        { x: 3, z: 41, rx: 31, rz: 5, height: 2.8 }
      ]
    },
    mountainRidge: [],
    snowPeaks: [],
    backdropRocks: [
      { x: -37, z: -41.5, size: 4.1, sx: 1.45, sy: 0.7, sz: 0.92, rot: -0.32, color: '#74848a' },
      { x: -29, z: -43.2, size: 5.8, sx: 1.28, sy: 0.95, sz: 1.08, rot: 0.14, color: '#6d7d84' },
      { x: -19, z: -41.6, size: 4.7, sx: 1.42, sy: 0.78, sz: 0.96, rot: -0.08, color: '#849097' },
      { x: -8, z: -43.4, size: 4.4, sx: 1.22, sy: 0.76, sz: 1.14, rot: 0.38, color: '#75838a' },
      { x: 11, z: -42.2, size: 5.2, sx: 1.36, sy: 0.86, sz: 1.06, rot: -0.2, color: '#7a878d' },
      { x: 24, z: -43, size: 4.8, sx: 1.32, sy: 0.8, sz: 1.1, rot: 0.22, color: '#879096' },
      { x: 35, z: -40.8, size: 3.9, sx: 1.22, sy: 0.68, sz: 0.94, rot: -0.38, color: '#6f7e85' },
      { x: -13, z: -36.8, size: 2.55, sx: 1.22, sy: 0.62, sz: 0.9, rot: 0.24, color: '#8a9498' },
      { x: 19, z: -37.4, size: 2.8, sx: 1.18, sy: 0.58, sz: 1.0, rot: -0.16, color: '#7f8a90' }
    ],
    monsterCamp: { x: 5, z: -35, rot: -0.36, scale: 1.2 },
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
      hemiGround: '#334f3e',
      realtimeShadows: false,
      bakedShadows: true
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
      hemiGround: '#3d5361',
      realtimeShadows: false,
      bakedShadows: true
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
  },
  'dungeon-halls': {
    sceneKey: 'dungeon-halls',
    theme: 'dungeon',
    seed: 611,
    sky: {
      toneMapping: 'linear',
      exposure: 1.1,
      background: '#d1d1d1',
      skyGradient: {
        top: '#d1d1d1',
        middle: '#d1d1d1',
        horizon: '#d1d1d1'
      },
      fog: '#c05454',
      fogNear: 20,
      fogFar: 127,
      sun: '#ffa852',
      sunIntensity: 2.12,
      sunPosition: { x: -88, y: 48, z: 48 },
      hemiSky: '#ac6262',
      hemiGround: '#ff8080',
      hemiIntensity: 1.52,
      realtimeShadows: false,
      bakedShadows: true
    },
    palette: {
      base: '#443e46',
      side: '#08070c',
      north: '#3d3444',
      valley: '#62585e',
      forest: '#2b3133',
      high: '#7a7074',
      snow: '#6e686c',
      path: '#8a6743',
      puddle: '#16121a'
    },
    ground: {
      width: 84,
      depth: 84
    },
    pathWidth: 3.6,
    pathPoints: [
      { x: 0, z: 31 },
      { x: -5, z: 13 },
      { x: 4, z: -4 },
      { x: 4, z: -20 },
      { x: 0, z: -33 }
    ],
    dungeonBridges: [
      { from: { x: -3.2, z: 22.5 }, to: { x: -4.0, z: 20.2 } },
      { from: { x: -2.2, z: 9.1 }, to: { x: 0.1, z: 5.6 } },
      { from: { x: 3.9, z: -10.7 }, to: { x: 3.6, z: -13.0 } },
      { from: { x: 1.8, z: -24.1 }, to: { x: 1.5, z: -25.7 } },
      { from: { x: 17.6, z: 0.6 }, to: { x: 27.0, z: 6.2 } },
      { from: { x: -9.4, z: -3.6 }, to: { x: -23.4, z: -5.4 } },
      { from: { x: -8.8, z: -30.1 }, to: { x: -22.8, z: -25.2 } }
    ],
    puddles: [],
    altars: [
      { id: 'energy-altar-dungeon-west', type: 'energy', position: { x: -31, z: -6 }, rotation: -0.35, clearingRadius: 6 },
      { id: 'shield-altar-dungeon-east', type: 'shield', position: { x: 34, z: 8 }, rotation: 0.35, clearingRadius: 6 },
      { id: 'respite-altar-dungeon-north', type: 'respite', position: { x: -30, z: -25 }, rotation: 0.15, clearingRadius: 5.8 }
    ],
    wildlife: [],
    forestZones: [],
    forestPassages: [],
    clearings: [
      { x: 0, z: 30, r: 11 },
      { x: 0, z: -33, r: 9 },
      { x: -31, z: -6, r: 6 },
      { x: 34, z: 8, r: 6 },
      { x: -30, z: -25, r: 5.8 }
    ],
    dungeonPlatforms: [
      { x: 0, z: 31, rx: 13.4, rz: 8.3, rot: 0.04, tone: 'large', irregularity: 0.1 },
      { x: -6, z: 15, rx: 8.6, rz: 5.7, rot: -0.34, tone: 'medium', irregularity: 0.13 },
      { x: 5, z: -2, rx: 15.2, rz: 8.2, rot: 0.18, tone: 'grand', irregularity: 0.11 },
      { x: 3, z: -18.4, rx: 8.4, rz: 5.4, rot: -0.18, tone: 'medium', irregularity: 0.12 },
      { x: 0, z: -33, rx: 15.4, rz: 9.3, rot: -0.06, tone: 'large', irregularity: 0.1 },
      { x: 34, z: 8, rx: 7.4, rz: 5.2, rot: 0.26, tone: 'small', irregularity: 0.14 },
      { x: -31, z: -6, rx: 8.2, rz: 5.7, rot: -0.24, tone: 'small', irregularity: 0.14 },
      { x: -30, z: -25, rx: 7.3, rz: 4.9, rot: 0.18, tone: 'small', irregularity: 0.15 }
    ],
    dungeonCrystals: [
      { x: -35, z: -1, scale: 0.9, color: '#8cff5f' },
      { x: 30, z: 13, scale: 0.82, color: '#9cff69' },
      { x: -35, z: -28, scale: 0.74, color: '#89ff68' },
      { x: 15, z: -8, scale: 0.72, color: '#7eff5c' }
    ],
    boulderClusters: [],
    landmarkBoulders: [],
    terrain: {
      ...DEFAULT_TERRAIN_PROFILE,
      baseHeight: 0.06,
      northRise: 0.18,
      sideRise: 0.08,
      sideNorthRise: 0.1,
      roughnessScale: 0.18,
      valleyFloorBase: 0.08,
      valleyNorthRise: 0.08,
      valleySideRise: 0.05,
      campTerrace: 0.08,
      campTerraceOutward: 0.02,
      campShelfInner: 6,
      campShelfOuter: 12,
      hills: [],
      ridges: []
    },
    monsterCamp: { x: -2, z: -33, rot: -0.2, scale: 1.12, offset: 0.18 },
    snowfall: {
      enabled: false,
      countScale: 0,
      gustScale: 0,
      windScale: 0
    },
    mechanics: {
      lava: {
        enabled: true,
        damageMaxHealthPercentPerSecond: 0.18,
        bypassShield: true,
        tickSeconds: 0.35
      },
      traps: []
    }
  },
  'red-desert': {
    sceneKey: 'red-desert',
    theme: 'red-desert',
    seed: 904,
    sky: {
      toneMapping: 'linear',
      exposure: 1.1,
      background: '#ff8847',
      skyGradient: {
        top: '#ff8847',
        middle: '#ff8847',
        horizon: '#ff8847'
      },
      fog: '#ffc87a',
      fogNear: 20,
      fogFar: 117,
      sun: '#fbb99d',
      sunIntensity: 3.3,
      sunPosition: { x: -88, y: 48, z: 48 },
      hemiSky: '#ffd79e',
      hemiGround: '#902c2c',
      hemiIntensity: 0.77,
      realtimeShadows: false,
      bakedShadows: true,
      shadowMapSize: 2048
    },
    palette: {
      base: '#b76245',
      side: '#9f513d',
      north: '#c96f48',
      valley: '#b56a4d',
      forest: '#8f6048',
      high: '#e0a852',
      snow: '#d99458',
      path: '#dda16a',
      puddle: '#6c514a'
    },
    ground: {
      width: 84,
      depth: 84
    },
    pathWidth: 3.6,
    pathPoints: [
      { x: -3, z: 30 },
      { x: 6, z: 23 },
      { x: 1, z: 15 },
      { x: -10, z: 7 },
      { x: -4, z: -2 },
      { x: 9, z: -10 },
      { x: 4, z: -20 },
      { x: 0, z: -30 }
    ],
    puddles: [],
    altars: [
      { id: 'energy-altar-desert-west', type: 'energy', position: { x: -20, z: 12 }, rotation: -0.2, clearingRadius: 6 },
      { id: 'shield-altar-desert-east', type: 'shield', position: { x: 18, z: -7 }, rotation: 0.35, clearingRadius: 6.2 },
      { id: 'respite-altar-desert-south', type: 'respite', position: { x: 12, z: 20 }, rotation: 0.1, clearingRadius: 5.8 }
    ],
    wildlife: [
      { type: 'scorpion', x: -27, z: 7, radius: 5.4 },
      { type: 'scorpion', x: 25, z: -13, radius: 5.4 },
      { type: 'scorpion', x: 22, z: 14, radius: 5 }
    ],
    forestZones: [],
    forestPassages: [],
    clearings: [
      { x: 0, z: 30, r: 11 },
      { x: 0, z: -30, r: 9 },
      { x: -20, z: 12, r: 6 },
      { x: 18, z: -7, r: 6 }
    ],
    boulderClusters: [
      { x: -30, z: 8, rx: 7.2, rz: 9.4, count: 8, sizeMin: 1.35, sizeMax: 2.75 },
      { x: 28, z: -12, rx: 7.8, rz: 9.6, count: 9, sizeMin: 1.45, sizeMax: 3 },
      { x: 21, z: 18, rx: 6.6, rz: 6.8, count: 7, sizeMin: 1.25, sizeMax: 2.45 },
      { x: -21, z: -21, rx: 6.8, rz: 7.2, count: 7, sizeMin: 1.2, sizeMax: 2.35 }
    ],
    landmarkBoulders: [
      { x: -25, z: 9, size: 4.2, sx: 1.35, sy: 1.35, sz: 1.05, rot: 0.35, shade: { rx: 6.4, rz: 3.4, ox: 2.8, oz: 1.4 } },
      { x: 24, z: -10, size: 4.5, sx: 1.15, sy: 1.5, sz: 1.18, rot: -0.52, shade: { rx: 6.8, rz: 3.6, ox: 2.9, oz: 1.3 } },
      { x: -13, z: -22, size: 3.5, sx: 1.28, sy: 1.15, sz: 1.04, rot: 0.88, shade: { rx: 5.6, rz: 3.1, ox: 2.4, oz: 1.1 } },
      { x: 16, z: 16, size: 3.3, sx: 1.1, sy: 1.2, sz: 1.18, rot: -0.2, shade: { rx: 5.4, rz: 3, ox: 2.3, oz: 1.2 } }
    ],
    terrain: {
      ...DEFAULT_TERRAIN_PROFILE,
      baseHeight: 0.24,
      northRise: 0.95,
      sideRise: 0.78,
      sideNorthRise: 1.12,
      roughnessScale: 0.94,
      valleyFloorBase: 0.22,
      valleyNorthRise: 0.42,
      valleySideRise: 0.36,
      campTerrace: 0.42,
      campTerraceOutward: 0.18,
      hills: [
        { x: -30, z: 9, rx: 14, rz: 16, height: 1.65 },
        { x: 29, z: -12, rx: 15, rz: 17, height: 1.78 },
        { x: -21, z: -22, rx: 13, rz: 13, height: 1.42 },
        { x: 22, z: 18, rx: 13, rz: 13, height: 1.38 },
        { x: 0, z: 4, rx: 24, rz: 18, height: 0.38 }
      ],
      ridges: [
        { x: -40, z: -2, rx: 7, rz: 42, height: 1.55 },
        { x: 40, z: -4, rx: 7, rz: 42, height: 1.7 },
        { x: 0, z: -39, rx: 34, rz: 8, height: 1.55 }
      ]
    },
    sandstoneFields: [
      { x: 0, z: 0, rx: 38, rz: 35, count: 28, minHeight: 4.2, maxHeight: 11.6, mesaChance: 0.2, clearance: 1.4 },
      { x: -4, z: 4, rx: 29, rz: 26, count: 9, minHeight: 2.8, maxHeight: 6.2, mesaChance: 0.36, clearance: 1.1 },
      { x: 2, z: -8, rx: 34, rz: 24, count: 10, minHeight: 4.8, maxHeight: 10.4, mesaChance: 0.16, clearance: 1.2 }
    ],
    sandstoneLandmarks: [
      { kind: 'mushroom', x: -35, z: 21, radius: 1.55, height: 11.2, rot: 0.24, sx: 1.08, sz: 0.86 },
      { kind: 'mesa', x: 34, z: 12, radius: 3.6, height: 5.4, rot: -0.38, sx: 1.18, sz: 0.78 },
      { kind: 'arch', x: -29, z: -12, radius: 1.18, height: 5.8, span: 5.8, rot: 0.64, sx: 1, sz: 0.9 },
      { kind: 'mushroom', x: 31, z: -27, radius: 1.35, height: 9.4, rot: -0.48, sx: 0.92, sz: 1.12 },
      { kind: 'mesa', x: -19, z: 24, radius: 3.1, height: 4.8, rot: 0.92, sx: 1.25, sz: 0.72 }
    ],
    canyonWalls: [
      { x: -43, z: -31, width: 8.8, depth: 14.2, height: 10.8, rot: -0.06 },
      { x: -44, z: -17, width: 9.4, depth: 15.8, height: 12.6, rot: 0.08 },
      { x: -43, z: -2, width: 8.2, depth: 14.6, height: 9.8, rot: -0.11 },
      { x: -43.5, z: 14, width: 9.8, depth: 15.2, height: 12.2, rot: 0.04 },
      { x: -42.5, z: 31, width: 9.2, depth: 13.4, height: 10.4, rot: -0.16 },
      { x: 43, z: -32, width: 9.6, depth: 14.8, height: 12.4, rot: 0.18 },
      { x: 44, z: -18, width: 8.6, depth: 15.4, height: 10.6, rot: -0.07 },
      { x: 43.5, z: -3, width: 9.2, depth: 14.4, height: 11.7, rot: 0.1 },
      { x: 43, z: 13, width: 8.4, depth: 15.2, height: 9.9, rot: -0.14 },
      { x: 44, z: 29, width: 9.8, depth: 13.8, height: 12.8, rot: 0.13 },
      { x: -30, z: -43, width: 13.4, depth: 8.4, height: 9.8, rot: 0.12 },
      { x: -15, z: -44, width: 15.6, depth: 9.2, height: 12.1, rot: -0.04 },
      { x: 2, z: -43.5, width: 14.8, depth: 8.6, height: 10.7, rot: 0.07 },
      { x: 19, z: -44, width: 15.2, depth: 9, height: 12.5, rot: -0.12 },
      { x: 34, z: -42.5, width: 12.8, depth: 8.2, height: 9.6, rot: 0.15 },
      { x: -32, z: 42.5, width: 13, depth: 7.8, height: 8.2, rot: -0.1 },
      { x: 31, z: 42.5, width: 13.8, depth: 7.8, height: 8.6, rot: 0.09 }
    ],
    desertPebbleFields: [
      { x: -18, z: 4, rx: 13, rz: 17, count: 42 },
      { x: 17, z: -12, rx: 14, rz: 18, count: 46 },
      { x: -4, z: -24, rx: 17, rz: 8, count: 34 },
      { x: 23, z: 18, rx: 11, rz: 9, count: 34 },
      { x: -26, z: 23, rx: 10, rz: 9, count: 26 }
    ],
    cactusZones: [
      { x: -34, z: 18, rx: 7, rz: 11, count: 14 },
      { x: 34, z: 8, rx: 6, rz: 12, count: 13 },
      { x: -30, z: -19, rx: 7, rz: 9, count: 11 },
      { x: 31, z: -24, rx: 7, rz: 8, count: 11 },
      { x: 10, z: 13, rx: 6, rz: 6, count: 7 },
      { x: -8, z: -8, rx: 8, rz: 7, count: 6 }
    ],
    desertScrubCount: 72,
    shadeZones: [
      { x: -22.2, z: 10.4, rx: 6.4, rz: 3.4 },
      { x: 26.9, z: -8.7, rx: 6.8, rz: 3.6 },
      { x: -10.6, z: -20.9, rx: 5.6, rz: 3.1 },
      { x: 18.3, z: 17.2, rx: 5.4, rz: 3 }
    ],
    monsterCamp: { x: 0, z: -33, rot: -0.38, scale: 1.18, offset: 0.22 },
    snowfall: {
      enabled: false,
      countScale: 0,
      gustScale: 0,
      windScale: 0
    },
    mechanics: {
      sunlight: {
        enabled: true,
        tickSeconds: 1,
        damagePerTick: 0.36
      }
    }
  }
};

let activeWorldConfig = resolveWorldConfig();

export function createWorld(scene, worldOptions = {}) {
  activeWorldConfig = resolveWorldConfig(worldOptions);
  const config = activeWorldConfig;
  updateBakedShadowLightRay(config);
  config.navigationBlockers = [];
  activeStaticCullables = [];
  activeStaticDecorationBatch = createStaticDecorationBatch();
  scene.background = new THREE.Color(config.sky.skyGradient?.middle ?? config.sky.background);
  scene.fog = new THREE.Fog(config.sky.fog, config.sky.fogNear, config.sky.fogFar);

  const sun = new THREE.DirectionalLight(config.sky.sun, config.sky.sunIntensity ?? 3.55);
  const sunPosition = config.sky.sunPosition ?? DEFAULT_SUN_POSITION;
  sun.position.set(sunPosition.x, sunPosition.y, sunPosition.z);
  const sunTarget = config.sky.sunTarget ?? { x: 0, y: 0, z: 0 };
  sun.target.position.set(sunTarget.x, sunTarget.y, sunTarget.z);
  sun.castShadow = config.sky.realtimeShadows !== false;
  if (sun.castShadow) {
    const shadowMapSize = config.sky.shadowMapSize ?? 1024;
    sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    sun.shadow.camera.left = -86;
    sun.shadow.camera.right = 86;
    sun.shadow.camera.top = 86;
    sun.shadow.camera.bottom = -86;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 190;
    sun.shadow.radius = config.sky.shadowRadius ?? 1;
    sun.shadow.bias = config.sky.shadowBias ?? -0.0004;
    sun.shadow.normalBias = config.sky.shadowNormalBias ?? 0.012;
  }
  scene.add(sun);
  scene.add(sun.target);
  const hemisphere = new THREE.HemisphereLight(config.sky.hemiSky, config.sky.hemiGround, config.sky.hemiIntensity ?? 1.85);
  scene.add(hemisphere);

  const ground = createGroundMesh();
  scene.add(ground);
  beginBakedGroundShadows(scene);

  const pathPoints = pathVectors();
  const pathGraph = config.theme === 'dungeon' ? createDungeonNavigationGraph() : null;
  const theme = config.theme ?? 'snow';
  let skyGradient = null;
  if (config.sky?.skyGradient) {
    skyGradient = createSky(scene, { includeClouds: theme === 'snow' });
  }
  if (theme === 'snow') {
    createMountainRidge(scene);
    createSnowMountain(scene);
    createSnowBackdropRocks(scene);
    createSnowCliffSkirt(scene);
  }
  if (theme === 'dungeon') {
    createDungeonPath(scene, pathPoints);
  } else {
    createPath(scene, pathPoints);
  }
  if (theme === 'snow') {
    createPuddles(scene);
    createShoreIceFloes(scene);
  }
  const snowfall = createSnowfall(scene);

  const basePosition = config.playerBasePosition;
  const enemyCampPosition = config.enemyCampPosition;
  const base = createBaseModel();
  placeOnTerrain(base, basePosition.x, basePosition.z);
  base.userData.aura.scale.setScalar(BALANCE.playerBase.recoveryRadius / 5.75);
  bakeObjectGroundShadow(base);
  scene.add(base);

  const enemyCamp = createEnemyCampModel();
  placeOnTerrain(enemyCamp, enemyCampPosition.x, enemyCampPosition.z);
  enemyCamp.scale.setScalar(1.35);
  bakeObjectGroundShadow(enemyCamp);
  scene.add(enemyCamp);

  if (theme === 'dungeon') {
    createDungeonDecor(scene, pathPoints);
  } else if (theme === 'red-desert') {
    createDesertDecor(scene, pathPoints);
  } else {
    decorate(scene, pathPoints);
  }
  createSnowMonsterCamp(scene);
  const staticDecorationResult = flushStaticDecorationBatch(scene);
  const bakedShadowResult = flushBakedGroundShadows(ground);
  const staticCullables = activeStaticCullables;
  activeStaticCullables = null;
  const staticCulling = createStaticWorldCulling(staticCullables);
  const navGrid = createNavigationGrid();

  return {
    config,
    ground,
    heightAt: worldSurfaceHeightAt,
    isSafeSurface: (pointOrX, maybeZ = null) => {
      const x = typeof pointOrX === 'number' ? pointOrX : pointOrX.x;
      const z = typeof pointOrX === 'number' ? maybeZ : pointOrX.z;
      if (config.theme !== 'dungeon') return true;
      return isDungeonSafeSurfaceAt(x, z);
    },
    isWalkable: (pointOrX, maybeZ = null) => {
      const x = typeof pointOrX === 'number' ? pointOrX : pointOrX.x;
      const z = typeof pointOrX === 'number' ? maybeZ : pointOrX.z;
      return isWorldNavigationWalkableAt(x, z);
    },
    pathPoints,
    pathGraph,
    navGrid,
    playerBaseModel: base,
    enemyCampModel: enemyCamp,
    recoveryAura: base.userData.aura,
    bakedShadowMeshes: bakedShadowResult.meshes,
    shadowMaskTexture: bakedShadowResult.texture,
    shadowMaskTriangleCount: bakedShadowResult.triangleCount,
    lights: {
      sun,
      hemisphere
    },
    staticCullables,
    staticCulling,
    staticDecorationMeshes: staticDecorationResult.meshes,
    staticDecorationBounceSources: staticDecorationResult.bounceSources,
    update: (dt, cameraTarget, camera, options = {}) => {
      updateSkyGradientPosition(skyGradient, camera);
      snowfall.update(dt, cameraTarget);
      staticCulling.update(dt, camera, options);
    },
    findPath: (start, end, options = {}) => navGrid?.findPath(start, end, options) ?? [],
    hasNavigationLine: (start, end) => navGrid?.hasLine(start, end) ?? true,
    navigationDistance: (start, end) => navGrid?.pathDistance(start, end) ?? Infinity
  };
}

function resolveWorldConfig(worldOptions = {}) {
  const preset = WORLD_PRESETS[worldOptions.sceneKey] ?? WORLD_PRESETS['snow-valley'];
  const merged = mergeWorldPreset(preset, worldOptions);
  const rawPathPoints = (merged.pathPoints ?? BALANCE.world.pathPoints).map(
    (point) => new THREE.Vector3(point.x, 0, point.z)
  );
  const dungeonBridgeSegmentsCache = buildDungeonBridgeSegments(merged, rawPathPoints);
  return {
    ...merged,
    rawPathPoints,
    dungeonBridgeSegmentsCache,
    playerBasePosition: merged.playerBasePosition ?? BALANCE.playerBase.position,
    enemyCampPosition: merged.enemyCampPosition ?? BALANCE.enemyCamp.position
  };
}

function mergeWorldPreset(preset, worldOptions) {
  const sky = {
    ...WORLD_PRESETS['snow-valley'].sky,
    ...(preset.sky ?? {}),
    ...(worldOptions.sky ?? {})
  };
  const presetHasSkyGradient = Object.hasOwn(preset.sky ?? {}, 'skyGradient');
  const optionsHasSkyGradient = Object.hasOwn(worldOptions.sky ?? {}, 'skyGradient');
  if (preset.sceneKey !== 'snow-valley' && !presetHasSkyGradient && !optionsHasSkyGradient) {
    delete sky.skyGradient;
  }
  return {
    ...BALANCE.world,
    ...preset,
    ...worldOptions,
    ground: {
      ...BALANCE.world.ground,
      ...(preset.ground ?? {}),
      ...(worldOptions.ground ?? {})
    },
    sky,
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
      enabled: false,
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

function updateBakedShadowLightRay(config = worldConfig()) {
  const sunPosition = config.sky?.sunPosition ?? DEFAULT_SUN_POSITION;
  BAKED_SHADOW_TO_SUN.set(sunPosition.x, sunPosition.y, sunPosition.z).normalize();
  BAKED_SHADOW_LIGHT_RAY.copy(BAKED_SHADOW_TO_SUN).multiplyScalar(-1);
}

export function terrainHeightAt(x, z) {
  const config = worldConfig();
  if (config.theme === 'dungeon') {
    return dungeonTerrainHeightAt(x, z);
  }
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
  if (config.theme === 'red-desert') {
    height += desertSandstoneTerrainHeightAt(x, z, pathDistance);
  }

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
  if (config.theme === 'red-desert') {
    height += desertValleySurfaceRippleAt(x, z, pathDistance);
  }

  if (config.landmass) {
    const landMask = landmassMaskAt(x, z);
    const coastRim = smoothstep(0.48, 0.82, landMask) *
      (1 - smoothstep(0.82, 1, landMask)) *
      (terrain.coastRimHeight ?? 0.48);
    const waterHeight = config.landmass.waterHeight ?? terrain.waterHeight ?? -1.2;
    const landLift = terrain.landLift ?? 0;
    return mix(
      waterHeight,
      height + landLift + coastRim,
      smoothstep(terrain.coastBlendStart ?? 0.38, terrain.coastBlendEnd ?? 0.94, landMask)
    );
  }

  return Math.max(0, height);
}

function worldSurfaceHeightAt(x, z) {
  if (worldConfig().theme === 'dungeon') {
    return dungeonWalkableHeightAt(x, z);
  }
  return terrainHeightAt(x, z);
}

function dungeonLavaHeightAt(x, z) {
  return -1.2 +
    Math.sin(x * 0.23 + z * 0.11) * 0.08 +
    Math.cos(x * 0.13 - z * 0.19) * 0.05;
}

function dungeonPlatformHeightAt(x, z) {
  return 1.5 + (
    Math.sin(x * 0.14 + z * 0.06) * 0.045 +
    Math.cos(x * 0.07 - z * 0.12) * 0.038 +
    (hash2(Math.floor(x * 0.28), Math.floor(z * 0.28)) - 0.5) * 0.022
  );
}

function dungeonBridgeDeckHeightAt(x, z) {
  return 1.26 + Math.sin((x + z) * 0.08) * 0.018;
}

function dungeonTerrainHeightAt(x, z) {
  const platformMask = dungeonPlatformMaskAt(x, z);
  const platformHeight = dungeonPlatformSurfaceHeightAt(x, z);
  return mix(
    dungeonLavaHeightAt(x, z),
    platformHeight,
    smoothstep(0.05, 0.72, platformMask)
  );
}

function dungeonWalkableHeightAt(x, z) {
  if (isInsideDungeonBridge(x, z)) {
    return dungeonBridgeDeckHeightAt(x, z);
  }
  if (
    isInsideDungeonPlatform(x, z, DUNGEON_SAFE_PLATFORM_INSET) ||
    isInsideDungeonBridgeEntryPlatform(x, z)
  ) {
    return dungeonPlatformSurfaceHeightAt(x, z);
  }
  return dungeonLavaHeightAt(x, z);
}

function dungeonPlatformSurfaceHeightAt(x, z) {
  const platformHeight = dungeonPlatformHeightAt(x, z);
  const bridgeBlend = dungeonBridgeEntryHeightBlendAt(x, z);
  if (bridgeBlend == null) return platformHeight;
  return mix(dungeonBridgeDeckHeightAt(x, z), platformHeight, bridgeBlend);
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
  setGroundUvFromWorldXZ(geometry, config.ground.width, config.ground.depth);
  colorGroundGeometry(geometry);
  geometry.computeVertexNormals();

  const ground = new THREE.Mesh(geometry, createGroundMaterial());
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = worldConfig().sky?.realtimeShadows !== false;
  return ground;
}

function setGroundUvFromWorldXZ(geometry, width, depth) {
  const position = geometry.attributes.position;
  const uvs = new Array(position.count * 2);
  const halfWidth = width / 2;
  const halfDepth = depth / 2;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = -position.getY(i);
    const offset = i * 2;
    uvs[offset] = clamp((x + halfWidth) / width, 0, 1);
    uvs[offset + 1] = clamp((z + halfDepth) / depth, 0, 1);
  }

  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
}

function setRibbonUvFromWorldXZ(geometry, width, depth) {
  const position = geometry.attributes.position;
  const uvs = new Array(position.count * 2);
  const halfWidth = width / 2;
  const halfDepth = depth / 2;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const offset = i * 2;
    uvs[offset] = clamp((x + halfWidth) / width, 0, 1);
    uvs[offset + 1] = clamp((z + halfDepth) / depth, 0, 1);
  }

  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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
  if (config.theme === 'dungeon') {
    return dungeonTerrainColorAt(x, z, height, palette);
  }
  if (config.theme === 'red-desert') {
    return desertTerrainColorAt(x, z, height, palette);
  }
  const color = new THREE.Color(palette.base);
  const northMask = northMaskAt(z);
  const sideRise = smoothstep(10, 39, Math.abs(x));
  const snowMask = snowMaskAt(x, z, height);
  const pathDistance = distanceToPath(x, z, rawPathPoints());
  const valleyMask = 1 - smoothstep(7, 22, pathDistance);
  const forestFloor = forestFloorMask(x, z);
  const facet = hash2(x * 0.14, z * 0.14) - 0.5;
  const landMask = landmassMaskAt(x, z);

  color.lerp(new THREE.Color(palette.side), sideRise * 0.28);
  color.lerp(new THREE.Color(palette.north), northMask * 0.22);
  color.lerp(new THREE.Color(palette.valley), valleyMask * 0.12);
  color.lerp(new THREE.Color(palette.forest), forestFloor * 0.18);
  color.lerp(new THREE.Color(palette.high), smoothstep(4.8, 8.8, height) * 0.24);
  color.lerp(new THREE.Color(palette.snow), 0.48 + snowMask * 0.38);
  if (worldConfig().landmass) {
    const water = new THREE.Color(worldConfig().landmass.oceanColor ?? '#2b6b8c');
    const rock = new THREE.Color(worldConfig().landmass.cliffColor ?? '#7e8785');
    const darkRock = new THREE.Color(worldConfig().landmass.cliffDarkColor ?? '#667271');
    const waterBlend = 1 - smoothstep(0.025, 0.12, landMask);
    const cliffBand = smoothstep(0.46, 0.62, landMask) * (1 - smoothstep(0.84, 0.98, landMask));
    const cliffFacet = hash2(Math.floor(x * 0.42), Math.floor(z * 0.42));
    rock.lerp(darkRock, cliffFacet * 0.08);
    color.lerp(water, waterBlend);
    color.lerp(rock, cliffBand * 0.28);
  }
  color.offsetHSL(0, 0.006 * facet, 0.018 * facet);
  return color;
}

function dungeonTerrainColorAt(x, z, height, palette) {
  const platformMask = dungeonPlatformMaskAt(x, z);
  const safeMask = platformMask;
  const edgeMask = dungeonPlatformEdgeMaskAt(x, z);
  const color = new THREE.Color('#050408');
  const wallMask = smoothstep(28, 41, Math.max(Math.abs(x), Math.abs(z)));
  const slab = Math.abs(Math.sin((x + 42) * 0.16) * Math.cos((z + 42) * 0.14));
  const facet = hash2(Math.floor(x * 0.22), Math.floor(z * 0.22)) - 0.5;
  const lavaPulse = 0.5 + Math.sin(x * 0.22 + z * 0.17) * 0.28 + Math.cos(x * 0.11 - z * 0.25) * 0.22;
  color.lerp(new THREE.Color('#58120d'), 1 - safeMask);
  color.lerp(new THREE.Color('#ff6c24'), clamp(lavaPulse, 0, 1) * (1 - safeMask) * 0.78);
  color.lerp(new THREE.Color(palette.base), safeMask * 0.98);
  color.lerp(new THREE.Color(palette.valley), safeMask * (0.12 + slab * 0.035));
  color.lerp(new THREE.Color(palette.high), smoothstep(0.12, 1.4, height) * 0.08 * safeMask);
  color.lerp(new THREE.Color('#100d15'), edgeMask * 0.58 + wallMask * 0.18);
  color.offsetHSL(0.002 * facet, -0.004 * slab, (0.012 * facet - 0.004 * slab) * (0.32 + safeMask));
  return color;
}

function dungeonPlatformMaskAt(x, z) {
  return (worldConfig().dungeonPlatforms ?? []).reduce((best, platform) => {
    const mask = dungeonPlatformFalloffAt(x, z, platform, 0.62, 1.08);
    return Math.max(best, mask);
  }, 0);
}

function dungeonRoadMaskAt(x, z) {
  const halfWidth = Math.max(2.8, (worldConfig().dungeonRoadWidth ?? 12) * 0.5);
  const distance = distanceToPath(x, z, rawPathPoints());
  const widthWobble = (
    Math.sin(x * 0.08 + z * 0.17) * 1.15 +
    Math.cos(x * 0.16 - z * 0.06) * 0.82 +
    (hash2(Math.floor(x * 0.16), Math.floor(z * 0.16)) - 0.5) * 1.3
  );
  const erodedBites = Math.max(0,
    Math.sin(x * 0.29 - z * 0.13) * 0.55 +
    Math.cos(x * 0.11 + z * 0.31) * 0.45
  ) * 1.85;
  const chippedEdge = (
    Math.sin(x * 0.53 + z * 0.19) * 0.42 +
    (hash2(Math.floor(x * 0.62), Math.floor(z * 0.62)) - 0.5) * 0.7
  );
  const naturalHalfWidth = halfWidth + widthWobble - erodedBites;
  return 1 - smoothstep(
    naturalHalfWidth * 0.86,
    naturalHalfWidth * 1.24,
    Math.max(0, distance + chippedEdge)
  );
}

function dungeonBridgeMaskAt(x, z) {
  const halfWidth = Math.max(0.6, (worldConfig().pathWidth ?? 3.2) * 0.5);
  let best = 0;
  dungeonBridgeSegments().forEach((segment) => {
    const distance = distanceToSegment2D(x, z, segment.extendedStart, segment.extendedEnd);
    best = Math.max(best, 1 - smoothstep(halfWidth * 0.74, halfWidth * 1.06, distance));
  });
  return best;
}

function isDungeonSafeSurfaceAt(x, z) {
  return isInsideDungeonPlatform(x, z, DUNGEON_SAFE_PLATFORM_INSET) || isInsideDungeonBridge(x, z);
}

function isDungeonNavigationWalkableAt(x, z) {
  if (dungeonBridgeHitAt(x, z, DUNGEON_NAV_BRIDGE_HALF_WIDTH, DUNGEON_NAV_BRIDGE_OVERHANG)) return true;
  return (
    isInsideDungeonPlatform(x, z) ||
    isInsideDungeonBridgeEntryPlatform(x, z)
  ) && !isDungeonBridgeheadSideBlockedAt(x, z);
}

function dungeonPlatformEdgeMaskAt(x, z) {
  return (worldConfig().dungeonPlatforms ?? []).reduce((best, platform) => {
    const outer = dungeonPlatformFalloffAt(x, z, platform, 0.88, 1.16);
    const inner = dungeonPlatformFalloffAt(x, z, platform, 0.58, 0.9);
    return Math.max(best, Math.max(0, outer - inner));
  }, 0);
}

function dungeonBridgeSegments() {
  return worldConfig().dungeonBridgeSegmentsCache ?? [];
}

function buildDungeonBridgeSegments(config, rawPathPoints) {
  const bridges = config.dungeonBridges;
  const rawSegments = [];
  if (Array.isArray(bridges) && bridges.length) {
    bridges
      .filter((bridge) => bridge?.from && bridge?.to)
      .forEach((bridge) => rawSegments.push([
        new THREE.Vector3(bridge.from.x, 0, bridge.from.z),
        new THREE.Vector3(bridge.to.x, 0, bridge.to.z)
      ]));
  } else {
    rawPathPoints.slice(0, -1).forEach((point, index) => {
      rawSegments.push([point, rawPathPoints[index + 1]]);
    });
  }

  return rawSegments.map(([a, b]) => {
    const segment = [a, b];
    const [extendedStart, extendedEnd] = extendDungeonBridgeSegment(a, b);
    segment.extendedStart = extendedStart;
    segment.extendedEnd = extendedEnd;
    return segment;
  });
}

function extendDungeonBridgeSegment(a, b, overhang = DUNGEON_BRIDGE_OVERHANG) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return [a.clone(), b.clone()];
  const ux = dx / length;
  const uz = dz / length;
  return [
    new THREE.Vector3(a.x - ux * overhang, 0, a.z - uz * overhang),
    new THREE.Vector3(b.x + ux * overhang, 0, b.z + uz * overhang)
  ];
}

function dungeonPlatformFalloffAt(x, z, platform, inner = 0, outer = 1) {
  const distance = dungeonPlatformNormalizedDistanceAt(x, z, platform);
  return 1 - smoothstep(inner, outer, distance);
}

function isInsideDungeonPlatform(x, z, inset = DUNGEON_NAV_PLATFORM_INSET) {
  return (worldConfig().dungeonPlatforms ?? []).some((platform) => (
    dungeonPlatformNormalizedDistanceAt(x, z, platform) <= inset
  ));
}

function isInsideDungeonBridgeEntryPlatform(x, z) {
  if (!isInsideDungeonPlatform(x, z, DUNGEON_NAV_BRIDGE_ENTRY_PLATFORM_INSET)) return false;
  return dungeonBridgeSegments().some(([a, b]) => (
    isInsideDungeonBridgeEntryPlatformFromEnd(x, z, a, b) ||
    isInsideDungeonBridgeEntryPlatformFromEnd(x, z, b, a)
  ));
}

function isInsideDungeonBridgeEntryPlatformFromEnd(x, z, entry, opposite) {
  const dx = opposite.x - entry.x;
  const dz = opposite.z - entry.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return false;

  const ux = dx / length;
  const uz = dz / length;
  const relX = x - entry.x;
  const relZ = z - entry.z;
  const awayFromBridge = -(relX * ux + relZ * uz);
  const lateral = Math.abs(relX * -uz + relZ * ux);

  return awayFromBridge >= -DUNGEON_NAV_BRIDGE_ENTRY_BACKTRACK &&
    awayFromBridge <= DUNGEON_NAV_BRIDGE_ENTRY_APPROACH_DEPTH &&
    lateral <= DUNGEON_BRIDGEHEAD_CLEAR_HALF_WIDTH;
}

function dungeonBridgeEntryHeightBlendAt(x, z) {
  let best = null;
  dungeonBridgeSegments().forEach(([a, b]) => {
    const startBlend = dungeonBridgeEntryHeightBlendFromEnd(x, z, a, b);
    const endBlend = dungeonBridgeEntryHeightBlendFromEnd(x, z, b, a);
    if (startBlend != null) best = best == null ? startBlend : Math.min(best, startBlend);
    if (endBlend != null) best = best == null ? endBlend : Math.min(best, endBlend);
  });
  return best;
}

function dungeonBridgeEntryHeightBlendFromEnd(x, z, entry, opposite) {
  const dx = opposite.x - entry.x;
  const dz = opposite.z - entry.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return null;

  const ux = dx / length;
  const uz = dz / length;
  const relX = x - entry.x;
  const relZ = z - entry.z;
  const awayFromBridge = -(relX * ux + relZ * uz);
  const lateral = Math.abs(relX * -uz + relZ * ux);

  const rampDistance = Math.max(0, awayFromBridge - DUNGEON_BRIDGE_HEIGHT_BLEND_START);
  if (
    awayFromBridge < -DUNGEON_NAV_BRIDGE_ENTRY_BACKTRACK ||
    awayFromBridge > DUNGEON_BRIDGE_HEIGHT_BLEND_START + DUNGEON_BRIDGE_HEIGHT_BLEND_DEPTH ||
    lateral > DUNGEON_BRIDGEHEAD_CLEAR_HALF_WIDTH
  ) {
    return null;
  }

  return smoothstep(0, DUNGEON_BRIDGE_HEIGHT_BLEND_DEPTH, rampDistance);
}

function isInsideDungeonBridge(x, z) {
  return Boolean(dungeonBridgeHitAt(x, z, DUNGEON_SAFE_BRIDGE_HALF_WIDTH));
}

function canTraverseDungeonNavigation(start, end) {
  const startSurface = dungeonNavigationSurfaceAt(start.x, start.z);
  const endSurface = dungeonNavigationSurfaceAt(end.x, end.z);
  if (startSurface.isVoid || endSurface.isVoid) return false;
  const isDiagonalStep =
    Math.abs(start.x - end.x) > 0.001 &&
    Math.abs(start.z - end.z) > 0.001 &&
    Math.hypot(start.x - end.x, start.z - end.z) < 1.1;
  const sharePlatform = startSurface.platform && endSurface.platform;
  if (isDiagonalStep && (startSurface.bridge || endSurface.bridge) && !sharePlatform) {
    return false;
  }
  if (sharePlatform) return true;
  if (startSurface.bridge && endSurface.bridge) {
    return startSurface.bridge.index === endSurface.bridge.index;
  }
  if (startSurface.bridge && endSurface.platform) {
    return isDungeonBridgeLandingTransition(startSurface.bridge, end);
  }
  if (endSurface.bridge && startSurface.platform) {
    return isDungeonBridgeLandingTransition(endSurface.bridge, start);
  }
  return false;
}

function dungeonNavigationSurfaceAt(x, z) {
  const bridge = dungeonBridgeHitAt(x, z, DUNGEON_NAV_BRIDGE_HALF_WIDTH, DUNGEON_NAV_BRIDGE_OVERHANG);
  const platform = (
    isInsideDungeonPlatform(x, z) ||
    isInsideDungeonBridgeEntryPlatform(x, z)
  ) && !isDungeonBridgeheadSideBlockedAt(x, z);
  return {
    bridge,
    platform,
    isVoid: !bridge && !platform
  };
}

function isDungeonBridgeLandingTransition(bridgeHit, platformPoint) {
  if (!bridgeHit) return false;
  const entryStart = bridgeHit.entryStart ?? bridgeHit.start;
  const entryEnd = bridgeHit.entryEnd ?? bridgeHit.end;
  const dx = entryEnd.x - entryStart.x;
  const dz = entryEnd.z - entryStart.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return false;

  const bridgeX = bridgeHit.x ?? bridgeHit.start.x;
  const bridgeZ = bridgeHit.z ?? bridgeHit.start.z;
  const atStart = Math.hypot(bridgeX - entryStart.x, bridgeZ - entryStart.z) <=
    DUNGEON_NAV_BRIDGE_ENTRY_DEPTH;
  const atEnd = Math.hypot(bridgeX - entryEnd.x, bridgeZ - entryEnd.z) <=
    DUNGEON_NAV_BRIDGE_ENTRY_DEPTH;
  if (!atStart && !atEnd) return false;

  const ux = dx / length;
  const uz = dz / length;
  const entry = atStart ? entryStart : entryEnd;
  const relX = platformPoint.x - entry.x;
  const relZ = platformPoint.z - entry.z;
  const awayFromBridge = (relX * ux + relZ * uz) * (atStart ? -1 : 1);
  const lateral = Math.abs(relX * -uz + relZ * ux);

  return awayFromBridge >= -DUNGEON_NAV_BRIDGE_ENTRY_BACKTRACK &&
    awayFromBridge <= DUNGEON_NAV_BRIDGE_ENTRY_APPROACH_DEPTH &&
    lateral <= DUNGEON_BRIDGEHEAD_CLEAR_HALF_WIDTH;
}

function dungeonBridgeHitAt(
  x,
  z,
  halfWidth = DUNGEON_NAV_BRIDGE_HALF_WIDTH,
  overhang = DUNGEON_BRIDGE_OVERHANG
) {
  let best = null;
  dungeonBridgeSegments().forEach((segment, index) => {
    const [a, b] = segment;
    const useCachedOverhang = overhang === DUNGEON_BRIDGE_OVERHANG;
    const extendedA = useCachedOverhang ? segment.extendedStart : extendDungeonBridgeSegment(a, b, overhang)[0];
    const extendedB = useCachedOverhang ? segment.extendedEnd : extendDungeonBridgeSegment(a, b, overhang)[1];
    const projection = projectToSegment2D(x, z, extendedA, extendedB);
    if (projection.distance > halfWidth) return;
    if (best && projection.distance >= best.distance) return;
    const entryStartT = projectToSegment2D(a.x, a.z, extendedA, extendedB).t;
    const entryEndT = projectToSegment2D(b.x, b.z, extendedA, extendedB).t;
    best = {
      index,
      t: projection.t,
      x: projection.x,
      z: projection.z,
      distance: projection.distance,
      start: extendedA,
      end: extendedB,
      entryStart: a,
      entryEnd: b,
      entryStartT,
      entryEndT
    };
  });
  return best;
}

function isDungeonBridgeheadSideBlockedAt(x, z) {
  return dungeonBridgeSegments().some(([a, b]) => (
    isDungeonBridgeheadSideBlockedFromEnd(x, z, a, b) ||
    isDungeonBridgeheadSideBlockedFromEnd(x, z, b, a)
  ));
}

function isDungeonBridgeheadSideBlockedFromEnd(x, z, landing, opposite) {
  const dx = opposite.x - landing.x;
  const dz = opposite.z - landing.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return false;

  const ux = dx / length;
  const uz = dz / length;
  const relX = x - landing.x;
  const relZ = z - landing.z;
  const along = relX * ux + relZ * uz;
  const lateral = Math.abs(relX * -uz + relZ * ux);

  if (
    along < -DUNGEON_BRIDGEHEAD_BLOCK_BACK ||
    along > DUNGEON_BRIDGEHEAD_BLOCK_INWARD
  ) {
    return false;
  }

  return lateral > DUNGEON_BRIDGEHEAD_CLEAR_HALF_WIDTH &&
    lateral <= DUNGEON_BRIDGEHEAD_BLOCK_HALF_WIDTH;
}

function dungeonPlatformNormalizedDistanceAt(x, z, platform) {
  const rot = platform.rot ?? 0;
  const cos = Math.cos(-rot);
  const sin = Math.sin(-rot);
  const dx = x - platform.x;
  const dz = z - platform.z;
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const angle = Math.atan2(localZ / (platform.rz ?? platform.radius ?? 1), localX / (platform.rx ?? platform.radius ?? 1));
  const scale = irregularEllipseScaleAt(platform, angle);
  const rx = (platform.rx ?? platform.radius ?? 1) * scale;
  const rz = (platform.rz ?? platform.radius ?? rx) * scale;
  return Math.hypot(localX / rx, localZ / rz);
}

function irregularEllipseScaleAt(zone, angle) {
  const irregularity = zone.irregularity ?? 0;
  if (irregularity <= 0) return 1;
  const seed = (zone.x * 0.37 + zone.z * 0.29 + (zone.rx ?? 1) * 0.17) * 0.63;
  const wobble =
    Math.sin(angle * 3 + seed) * 0.52 +
    Math.sin(angle * 5 - seed * 1.7) * 0.31 +
    Math.sin(angle * 7 + seed * 0.6) * 0.17;
  return clamp(1 + wobble * irregularity, 0.72, 1.24);
}

function ellipseBoundaryPoint(zone, angle, scaleFactor = 1) {
  const rot = zone.rot ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const rx = zone.rx ?? zone.radius ?? 1;
  const rz = zone.rz ?? zone.radius ?? rx;
  const edgeScale = irregularEllipseScaleAt(zone, angle) * scaleFactor;
  const localX = Math.cos(angle) * rx * edgeScale;
  const localZ = Math.sin(angle) * rz * edgeScale;
  return {
    x: zone.x + localX * cos - localZ * sin,
    z: zone.z + localX * sin + localZ * cos
  };
}

function ellipseFalloffAt(x, z, ellipse, inner = 0, outer = 1) {
  const rot = ellipse.rot ?? 0;
  const cos = Math.cos(-rot);
  const sin = Math.sin(-rot);
  const dx = x - ellipse.x;
  const dz = z - ellipse.z;
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const rx = Math.max(0.1, ellipse.rx ?? ellipse.radius ?? 1);
  const rz = Math.max(0.1, ellipse.rz ?? ellipse.radius ?? rx);
  const distance = Math.sqrt((localX * localX) / (rx * rx) + (localZ * localZ) / (rz * rz));
  return 1 - smoothstep(inner, outer, distance);
}

function desertTerrainColorAt(x, z, height, palette) {
  const color = new THREE.Color(palette.base);
  const pathDistance = distanceToPath(x, z, rawPathPoints());
  const pathMask = 1 - smoothstep(0, worldConfig().pathWidth * 0.95, pathDistance);
  const sideRise = smoothstep(14, 40, Math.abs(x));
  const ridgeMask = northMaskAt(z) * 0.42 + sideRise * 0.28;
  const lowFloor = 1 - smoothstep(0.32, 1.1, height);
  const highShelf = smoothstep(0.88, 3.4, height);
  const dune = Math.sin(x * 0.15 + z * 0.09) * 0.5 + Math.cos(x * 0.09 - z * 0.17) * 0.5;
  const strata = Math.sin(height * 5.8 + x * 0.08 - z * 0.035);
  const facet = hash2(x * 0.08, z * 0.08) - 0.5;
  color.lerp(new THREE.Color('#f2d8a8'), lowFloor * 0.34);
  color.lerp(new THREE.Color(palette.side), sideRise * 0.28);
  color.lerp(new THREE.Color(palette.north), ridgeMask * 0.22);
  color.lerp(new THREE.Color(palette.high), highShelf * 0.3);
  color.lerp(new THREE.Color('#f1c268'), highShelf * 0.12);
  color.lerp(new THREE.Color('#f0a05d'), Math.max(0, strata) * 0.045);
  color.lerp(new THREE.Color('#833a30'), Math.max(0, -strata) * 0.035);
  color.lerp(new THREE.Color(palette.path), pathMask * 0.36);
  color.offsetHSL(0.004 * dune, 0.012 * dune, 0.024 * facet + 0.018 * dune);
  return color;
}

function desertValleySurfaceRippleAt(x, z, pathDistance) {
  const config = worldConfig();
  const routeKeepFlat = smoothstep(3.6, 11.5, pathDistance);
  const baseKeepFlat = smoothstep(6.5, 13, Math.hypot(x - config.playerBasePosition.x, z - config.playerBasePosition.z));
  const campKeepFlat = smoothstep(5.8, 12, Math.hypot(x - config.enemyCampPosition.x, z - config.enemyCampPosition.z));
  const altarKeepFlat = 1 - (config.altars ?? []).reduce((best, altar) => {
    const position = altar.position ?? altar;
    return Math.max(best, 1 - smoothstep(altar.clearingRadius ?? 5.4, (altar.clearingRadius ?? 5.4) + 4, Math.hypot(x - position.x, z - position.z)));
  }, 0);
  const edgeLift = smoothstep(25, 43, Math.max(Math.abs(x), Math.abs(z)));
  const broadDune = (
    Math.sin(x * 0.075 - z * 0.055) * 0.18 +
    Math.cos(x * 0.052 + z * 0.082) * 0.16
  );
  const crossRipple = (
    Math.sin(x * 0.23 + z * 0.14) * 0.08 +
    Math.cos(x * 0.17 - z * 0.2) * 0.07
  );
  const terrace = Math.max(0, Math.sin((x - z) * 0.055 + 1.2)) * 0.12;
  const mask = (0.35 + routeKeepFlat * 0.65) * baseKeepFlat * campKeepFlat * altarKeepFlat;
  return clamp(broadDune + crossRipple + terrace, -0.16, 0.5) * mask * (0.72 + edgeLift * 0.38);
}

function desertSandstoneTerrainHeightAt(x, z, pathDistance) {
  const config = worldConfig();
  let height = 0;
  (config.sandstoneFields ?? []).forEach((field, index) => {
    const broad = ellipseFalloffAt(x, z, {
      ...field,
      rx: field.rx * 1.18,
      rz: field.rz * 1.18
    }, 0, 1);
    const core = ellipseFalloffAt(x, z, {
      ...field,
      rx: field.rx * 0.74,
      rz: field.rz * 0.74
    }, 0, 1);
    const fractured = (
      Math.sin(x * 0.34 + z * 0.18 + index) * 0.055 +
      Math.cos(x * 0.21 - z * 0.29 - index * 0.7) * 0.045
    );
    height += broad * 0.22 + core * 0.16 + Math.max(0, broad - core * 0.72) * 0.18 + fractured * broad;
  });
  (config.sandstoneLandmarks ?? []).forEach((item, index) => {
    const radius = item.kind === 'arch'
      ? (item.span ?? 5) * 0.7
      : (item.radius ?? 2) * (item.kind === 'mesa' ? 2.2 : 1.8);
    const mound = ellipseFalloffAt(x, z, {
      x: item.x,
      z: item.z,
      rx: radius * (item.sx ?? 1),
      rz: radius * 0.72 * (item.sz ?? 1),
      rot: item.rot ?? 0
    }, 0, 1);
    const steps = Math.max(0, Math.sin(mound * Math.PI * 5 + index * 0.6)) * 0.06;
    height += mound * (item.kind === 'mesa' ? 0.42 : 0.28) + steps * mound;
  });

  const pathMask = smoothstep(5.2, 11.5, pathDistance);
  const clearingMask = Math.max(
    ...config.clearings.map((clearing) => (
      1 - smoothstep(clearing.r * 0.72, clearing.r + 2.2, Math.hypot(x - clearing.x, z - clearing.z))
    )),
    0
  );
  return height * pathMask * (1 - clearingMask * 0.82);
}

function pathVectors() {
  return worldConfig().pathPoints.map((point) => {
    const y = worldSurfaceHeightAt(point.x, point.z) + SURFACE_OFFSET;
    return new THREE.Vector3(point.x, y, point.z);
  });
}

function createNavigationGrid() {
  const config = worldConfig();
  const bounds = worldNavigationBounds(config);
  return new NavigationGrid({
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
    cellSize: config.navigationStep ?? config.dungeonNavigationStep ?? (
      config.theme === 'dungeon' ? DUNGEON_NAV_MESH_STEP : WORLD_NAV_MESH_STEP
    ),
    isWalkable: (point) => isWorldNavigationWalkableAt(point.x, point.z),
    heightAt: (point) => worldSurfaceHeightAt(point.x, point.z),
    canTraverse: canTraverseWorldNavigation
  });
}

function isWorldNavigationWalkableAt(x, z) {
  const config = worldConfig();
  if (config.theme === 'dungeon') {
    return isDungeonNavigationWalkableAt(x, z) &&
      !isInsideWorldNavigationBlocker(x, z);
  }

  const bounds = worldNavigationBounds(config);
  if (
    x < bounds.minX + WORLD_NAV_EDGE_MARGIN ||
    x > bounds.maxX - WORLD_NAV_EDGE_MARGIN ||
    z < bounds.minZ + WORLD_NAV_EDGE_MARGIN ||
    z > bounds.maxZ - WORLD_NAV_EDGE_MARGIN
  ) return false;
  if (config.landmass && landmassMaskAt(x, z) < 0.5) return false;
  return !isInsideWorldNavigationBlocker(x, z);
}

function worldNavigationBounds(config = worldConfig()) {
  const bounds = config.navigationBounds;
  if (bounds) {
    const halfWidth = bounds.halfWidth ?? (config.ground.width ?? BALANCE.world.ground.width) * 0.5;
    const halfDepth = bounds.halfDepth ?? (config.ground.depth ?? BALANCE.world.ground.depth) * 0.5;
    return {
      minX: bounds.minX ?? -halfWidth,
      maxX: bounds.maxX ?? halfWidth,
      minZ: bounds.minZ ?? -halfDepth,
      maxZ: bounds.maxZ ?? halfDepth
    };
  }
  const halfWidth = (config.ground.width ?? BALANCE.world.ground.width) * 0.5;
  const halfDepth = (config.ground.depth ?? BALANCE.world.ground.depth) * 0.5;
  return {
    minX: -halfWidth,
    maxX: halfWidth,
    minZ: -halfDepth,
    maxZ: halfDepth
  };
}

function canTraverseWorldNavigation(start, end) {
  if (worldConfig().theme === 'dungeon') {
    return canTraverseDungeonNavigation(start, end) &&
      !doesWorldNavigationSegmentHitBlocker(start, end);
  }
  return isWorldNavigationWalkableAt(start.x, start.z) &&
    isWorldNavigationWalkableAt(end.x, end.z) &&
    !doesWorldNavigationSegmentHitBlocker(start, end);
}

function isInsideWorldNavigationBlocker(x, z) {
  return worldNavigationBlockers().some((blocker) => (
    Math.hypot(x - blocker.x, z - blocker.z) <= blocker.radius
  ));
}

function doesWorldNavigationSegmentHitBlocker(start, end) {
  return worldNavigationBlockers().some((blocker) => (
    distanceToSegment2D(blocker.x, blocker.z, start, end) <= blocker.radius
  ));
}

function worldNavigationBlockers() {
  const config = worldConfig();
  const blockers = [
    {
      x: config.playerBasePosition.x,
      z: config.playerBasePosition.z,
      radius: WORLD_NAV_PLAYER_BASE_RADIUS
    }
  ];
  if (config.theme !== 'dungeon') {
    blockers.push({
      x: config.enemyCampPosition.x,
      z: config.enemyCampPosition.z,
      radius: WORLD_NAV_ENEMY_CAMP_RADIUS
    });
  }
  blockers.push(
    ...(config.navigationBlockers ?? [])
  );
  return blockers;
}

function registerWorldNavigationBlocker(x, z, radius, kind = 'decor') {
  const config = worldConfig();
  const blockers = config.navigationBlockers;
  if (!Array.isArray(blockers)) return;
  blockers.push({
    x,
    z,
    radius: Math.max(0.16, radius),
    kind
  });
}

function createDungeonNavigationGraph() {
  const nodes = [];
  const keyToIndex = new Map();
  const edges = [];
  const edgeKeys = new Set();
  const addNode = (point) => {
    const key = `${point.x.toFixed(2)}:${point.z.toFixed(2)}`;
    if (keyToIndex.has(key)) return keyToIndex.get(key);
    const node = new THREE.Vector3(
      point.x,
      worldSurfaceHeightAt(point.x, point.z) + SURFACE_OFFSET,
      point.z
    );
    const index = nodes.length;
    nodes.push(node);
    keyToIndex.set(key, index);
    return index;
  };
  const addEdge = (a, b) => {
    if (a === b) return;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push([a, b]);
  };

  rawPathPoints().forEach(addNode);
  dungeonBridgeSegments().forEach(([a, b]) => {
    addEdge(addNode(a), addNode(b));
  });

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z) > 26) continue;
      if (isDungeonSafeSegment(nodes[i], nodes[j])) {
        addEdge(i, j);
      }
    }
  }

  return { nodes, edges };
}

function isDungeonSafeSegment(a, b) {
  const sampleCount = Math.max(6, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 1.15));
  for (let i = 0; i <= sampleCount; i += 1) {
    const t = i / sampleCount;
    const x = mix(a.x, b.x, t);
    const z = mix(a.z, b.z, t);
    if (!isDungeonSafeSurfaceAt(x, z)) return false;
  }
  return true;
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

function createDungeonPath(scene) {
  createDungeonPlatformOverlays(scene);
  dungeonBridgeSegments().forEach(([a, b], index) => {
    if (!shouldBuildDungeonBridge(a, b)) return;
    const [extendedA, extendedB] = extendDungeonBridgeSegment(a, b);
    createDungeonBridge(
      scene,
      new THREE.Vector3(
        extendedA.x,
        dungeonBridgeDeckHeightAt(extendedA.x, extendedA.z) + SURFACE_OFFSET - 0.18,
        extendedA.z
      ),
      new THREE.Vector3(
        extendedB.x,
        dungeonBridgeDeckHeightAt(extendedB.x, extendedB.z) + SURFACE_OFFSET - 0.18,
        extendedB.z
      ),
      index
    );
  });
}

function shouldBuildDungeonBridge(a, b) {
  for (let i = 1; i < 8; i += 1) {
    const t = i / 8;
    const x = mix(a.x, b.x, t);
    const z = mix(a.z, b.z, t);
    if (dungeonPlatformMaskAt(x, z) < 0.36) return true;
  }
  return false;
}

function createDungeonPlatformOverlays(scene) {
  const topMaterial = mat('#5a5258', {
    roughness: 0.94,
    metalness: 0.02,
    transparent: true,
    opacity: 0.76,
    depthWrite: false
  }).clone();
  const rimMaterial = mat('#120f17', {
    roughness: 0.98,
    transparent: true,
    opacity: 0.94,
    depthWrite: false
  }).clone();

  (worldConfig().dungeonPlatforms ?? []).forEach((platform, index) => {
    const rim = createTerrainEllipseMesh(
      {
        ...platform,
        rx: platform.rx * 1.04,
        rz: platform.rz * 1.04
      },
      rimMaterial,
      0.052,
      28
    );
    const top = createTerrainEllipseMesh(platform, topMaterial, 0.052, 34);
    rim.renderOrder = 3 + index * 2;
    top.renderOrder = 4 + index * 2;
    scene.add(rim, top);
  });
}

function createDungeonBridge(scene, a, b, index = 0) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.01) return;

  const angle = Math.atan2(dx, dz);
  const group = new THREE.Group();
  const plankMaterial = mat(index % 2 === 0 ? '#6f4b31' : '#735032', { roughness: 0.88 });
  const railMaterial = mat('#4a2f20', { roughness: 0.9 });
  const shadowMaterial = basicMat('#050407', {
    transparent: true,
    opacity: 0.36,
    side: THREE.DoubleSide,
    depthWrite: false
  }).clone();

  const plankCount = Math.max(4, Math.floor(length / 0.58));
  for (let i = 0; i < plankCount; i += 1) {
    const t = plankCount <= 1 ? 0.5 : i / (plankCount - 1);
    const localZ = -length * 0.5 + t * length;
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(2.9 + ((i + index) % 3) * 0.12, 0.14, 0.42),
      plankMaterial
    );
    plank.position.set(
      ((i % 2) - 0.5) * 0.08,
      0.1 + ((i + index) % 2) * 0.015,
      localZ
    );
    plank.rotation.y = ((i + index) % 2 === 0 ? 1 : -1) * 0.025;
    group.add(plank);
  }

  [-1, 1].forEach((side) => {
    const landing = new THREE.Mesh(
      new THREE.BoxGeometry(3.18, 0.16, 1.25),
      plankMaterial
    );
    landing.position.set(0, 0.095, side * (length * 0.5 - 0.35));
    landing.rotation.y = side * 0.018;
    group.add(landing);
  });

  [-1, 1].forEach((side) => {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.18, length + 0.7),
      railMaterial
    );
    rail.position.set(side * 1.58, 0.22, 0);
    group.add(rail);
  });

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, length + 1.8, 1, 1),
    shadowMaterial
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.06;
  shadow.renderOrder = 2;
  group.add(shadow);

  const midX = (a.x + b.x) * 0.5;
  const midZ = (a.z + b.z) * 0.5;
  group.position.set(midX, (a.y + b.y) * 0.5 - 0.24, midZ);
  group.rotation.y = angle;
  enableDecorationShadows(group);
  scene.add(group);
}

function buildPathRibbon(scene, points, material, width = worldConfig().pathWidth, heightOffset = PATH_SURFACE_OFFSET, renderOrder = 2) {
  if (points.length < 2) return;

  const positions = [];
  const indices = [];
  const halfWidth = width / 2;
  const organic = worldConfig().pathOrganic ?? null;

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
    const widthNoise = organic
      ? (
        Math.sin(point.x * 0.12 + point.z * 0.19 + index * 0.07) * 0.52 +
        Math.cos(point.x * 0.2 - point.z * 0.11) * 0.34
      ) * (organic.widthJitter ?? 0)
      : 0;
    const edgeNoiseLeft = organic
      ? ((hash2(index * 0.71, 2.1) - 0.5) * 2) * (organic.edgeJitter ?? 0)
      : 0;
    const edgeNoiseRight = organic
      ? ((hash2(index * 0.71, 7.7) - 0.5) * 2) * (organic.edgeJitter ?? 0)
      : 0;
    const leftHalfWidth = Math.max(0.9, halfWidth + widthNoise + edgeNoiseLeft);
    const rightHalfWidth = Math.max(0.9, halfWidth + widthNoise + edgeNoiseRight);
    const left = { x: point.x + nx * leftHalfWidth, z: point.z + nz * leftHalfWidth };
    const right = { x: point.x - nx * rightHalfWidth, z: point.z - nz * rightHalfWidth };
    positions.push(left.x, terrainHeightAt(left.x, left.z) + heightOffset, left.z);
    positions.push(right.x, terrainHeightAt(right.x, right.z) + heightOffset, right.z);

    if (index < points.length - 1) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  setRibbonUvFromWorldXZ(geometry, worldConfig().ground.width, worldConfig().ground.depth);
  geometry.computeVertexNormals();
  const path = new THREE.Mesh(geometry, material.clone());
  path.receiveShadow = true;
  path.renderOrder = renderOrder;
  registerShadowMaskReceiver(path);
  scene.add(path);
}

function createPuddles(scene) {
  const material = overlayMat(worldConfig().palette.puddle, {
    roughness: 0.16,
    metalness: 0.02,
    transparent: true,
    opacity: 0.88,
    emissive: '#9deeff',
    emissiveIntensity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  worldConfig().puddles.forEach((puddle, index) => {
    const mesh = createPuddleMesh(puddle, material);
    mesh.renderOrder = 3 + index;
    scene.add(mesh);
  });
}

function createShoreIceFloes(scene) {
  const floes = worldConfig().iceFloes ?? [];
  if (!floes.length) return;
  const material = overlayMat(worldConfig().palette.snow, {
    roughness: 0.86,
    metalness: 0.02,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  floes.forEach((floe, index) => {
    const mesh = createTerrainEllipseMesh(floe, material, 0.09, 16);
    mesh.renderOrder = 3 + index * 0.01;
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

function createSky(scene, { includeClouds = true } = {}) {
  const skyGradient = createSkyGradient(scene);
  if (!includeClouds) return skyGradient;
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
  return skyGradient;
}

function createSkyGradient(scene) {
  const gradient = worldConfig().sky?.skyGradient;
  if (!gradient) return null;
  const geometry = new THREE.SphereGeometry(190, 24, 12);
  const position = geometry.attributes.position;
  const colors = [];
  const top = new THREE.Color(gradient.top);
  const middle = new THREE.Color(gradient.middle);
  const horizon = new THREE.Color(gradient.horizon);

  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i) / 190;
    const color = new THREE.Color();
    if (y < 0.18) {
      color.copy(horizon).lerp(middle, clamp((y + 0.18) / 0.36, 0, 1));
    } else {
      color.copy(middle).lerp(top, clamp((y - 0.18) / 0.82, 0, 1));
    }
    colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.name = 'StylizedSunsetSky';
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}

function updateSkyGradientPosition(sky, camera) {
  if (!sky || !camera) return;
  sky.position.copy(camera.position);
  sky.updateMatrixWorld(true);
}

function createSnowfall(scene) {
  const snowfallConfig = worldConfig().snowfall;
  if (snowfallConfig.enabled === false || (snowfallConfig.countScale ?? 1) <= 0) {
    return {
      update() {}
    };
  }
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
  geometry.setDrawRange(0, count);
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
    if (
      y < layer.minY ||
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
      y < layer.minY ||
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

function createSnowBackdropRocks(scene) {
  (worldConfig().backdropRocks ?? []).forEach((item) => {
    const rock = createRock(item.size ?? 3.6, {
      color: item.color ?? '#7b878c',
      snowCap: true,
      snowColor: item.snowColor ?? '#f0f4ea'
    });
    rock.scale.set(item.sx ?? 1, item.sy ?? 1, item.sz ?? 1);
    rock.rotation.y = item.rot ?? 0;
    placeOnTerrain(rock, item.x, item.z, item.offset ?? -0.12);
    enableDecorationShadows(rock);
    bakeObjectGroundShadow(rock);
    scene.add(rock);
  });
}

function createSnowCliffSkirt(scene) {
  const config = worldConfig();
  const landmass = config.landmass;
  if (!landmass) return;
  const skirt = landmass.cliffSkirt ?? {};
  const segments = skirt.segments ?? 112;
  const threshold = skirt.threshold ?? 0.64;
  const maxRadius = skirt.maxRadius ?? Math.max(config.ground.width, config.ground.depth) * 0.24;
  const minRadius = skirt.minRadius ?? 16;
  const waterHeight = landmass.waterHeight ?? config.terrain.waterHeight ?? -1.2;
  const ring = [];

  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const point = coastBoundaryPointAt(angle, threshold, minRadius, maxRadius);
    if (!point) continue;

    const normalX = Math.cos(angle);
    const normalZ = Math.sin(angle);
    const noise = hash2(normalX * 9.7, normalZ * 9.7);
    const overhang = (skirt.overhang ?? 1.7) + (noise - 0.5) * (skirt.jitter ?? 0.4);
    const drop = (skirt.drop ?? 0.45) + noise * 0.34;
    const topY = terrainHeightAt(point.x, point.z) + 0.04;
    const bottomY = waterHeight - drop;
    const shade = cliffLightAt(normalX, normalZ, noise);

    ring.push({
      normalX,
      normalZ,
      noise,
      shade,
      top: { x: point.x, y: topY, z: point.z },
      bottom: {
        x: point.x + normalX * overhang,
        y: bottomY,
        z: point.z + normalZ * overhang
      }
    });
  }

  if (ring.length < 3) return;
  const group = new THREE.Group();
  group.name = 'SnowCliffPillarSkirt';

  for (let i = 0; i < ring.length; i += 1) {
    const next = (i + 1) % ring.length;
    if (Math.hypot(ring[i].top.x - ring[next].top.x, ring[i].top.z - ring[next].top.z) > 16) {
      continue;
    }
    const pillar = createCliffPillar(ring[i], ring[next], i);
    if (pillar) group.add(pillar);
  }

  if (!group.children.length) return;
  scene.add(group);
}

function createCliffPillar(a, b, index) {
  const primaryNoise = hash2(index * 0.53, 12.7);
  const stagger = index % 2 === 0 ? -1 : 1;
  const topY = Math.min(a.top.y, b.top.y) + 0.06 + primaryNoise * 0.07;
  const rawBottomY = Math.max(a.bottom.y, b.bottom.y);
  const height = clamp(topY - rawBottomY, 1.35, 3.25);
  const bottomY = topY - height;
  const tangentX = b.top.x - a.top.x;
  const tangentZ = b.top.z - a.top.z;
  const span = Math.max(1, Math.hypot(tangentX, tangentZ));
  const centerX = (a.top.x + b.top.x + a.bottom.x + b.bottom.x) * 0.25;
  const centerZ = (a.top.z + b.top.z + a.bottom.z + b.bottom.z) * 0.25;
  const normalX = (a.normalX + b.normalX) * 0.5;
  const normalZ = (a.normalZ + b.normalZ) * 0.5;
  const tangentLength = Math.max(0.001, Math.hypot(tangentX, tangentZ));
  const tangentUnitX = tangentX / tangentLength;
  const tangentUnitZ = tangentZ / tangentLength;
  const width = span * (1.04 + primaryNoise * 0.46);
  const depth = 1.52 + primaryNoise * 0.78;
  const shade = (a.shade + b.shade) * 0.5;
  const radialSegments = 5 + Math.floor(hash2(index * 0.61, 4.4) * 3);
  const tangentOffset = (hash2(index * 0.77, 5.9) - 0.5) * span * 0.22;
  const normalOffset = 0.22 + primaryNoise * 0.24 + stagger * (0.1 + hash2(index * 0.43, 8.2) * 0.12);
  const group = new THREE.Group();
  const rock = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1.06 + primaryNoise * 0.12, 1, radialSegments, 1, false),
    mat(cliffRockHex('#666d6b', shade - 0.24, primaryNoise, -0.09), {
      roughness: 0.9,
      metalness: 0.02,
      flatShading: true
    })
  );
  rock.name = 'SnowCliffPillar';
  rock.position.set(
    centerX + normalX * normalOffset + tangentUnitX * tangentOffset,
    bottomY + height * 0.5,
    centerZ + normalZ * normalOffset + tangentUnitZ * tangentOffset
  );
  rock.rotation.y = Math.atan2(-tangentZ, tangentX) + (primaryNoise - 0.5) * 0.32;
  rock.scale.set(width * 0.58, height * (0.96 + hash2(index * 0.8, 2.1) * 0.08), depth * 0.52);
  rock.castShadow = true;
  rock.receiveShadow = false;
  group.add(rock);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, radialSegments, 1, false),
    mat(cliffRockHex('#fffef9', shade - 0.02, primaryNoise, 0.02), {
      roughness: 0.92,
      metalness: 0.01,
      flatShading: true
    })
  );
  cap.name = 'SnowCliffCap';
  cap.position.set(
    rock.position.x - normalX * (0.05 + primaryNoise * 0.1),
    topY + 0.04 + hash2(index * 0.92, 3.6) * 0.05,
    rock.position.z - normalZ * (0.05 + primaryNoise * 0.1)
  );
  cap.rotation.y = rock.rotation.y + (hash2(index * 0.29, 10.1) - 0.5) * 0.24;
  cap.scale.set(width * (0.58 + hash2(index * 0.35, 12.2) * 0.1), 0.14, depth * (0.5 + hash2(index * 0.39, 14.2) * 0.08));
  cap.castShadow = false;
  cap.receiveShadow = false;
  group.add(cap);

  return group;
}

function cliffLightAt(normalX, normalZ, noise) {
  const sun = new THREE.Vector3(-44, 82, 46).normalize();
  const normal = new THREE.Vector3(normalX * 0.88, 0.28, normalZ * 0.88).normalize();
  return clamp(0.72 + normal.dot(sun) * 0.34 + (noise - 0.5) * 0.16, 0.48, 1.08);
}

function cliffRockHex(hex, shade, variation, lift = 0) {
  const color = new THREE.Color(hex);
  const shadow = new THREE.Color('#667c7f');
  const snowLight = new THREE.Color('#f3f7ef');
  const shadeDelta = shade - 1;
  if (shadeDelta < 0) {
    color.lerp(shadow, Math.min(0.58, -shadeDelta * 0.9));
  } else {
    color.lerp(snowLight, Math.min(0.34, shadeDelta * 0.65));
  }
  color.offsetHSL(
    (variation - 0.5) * 0.012,
    -0.012,
    lift + (variation - 0.5) * 0.035
  );
  return `#${color.getHexString()}`;
}

function coastBoundaryPointAt(angle, threshold, minRadius, maxRadius) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let insideRadius = null;
  let outsideRadius = maxRadius;
  for (let radius = maxRadius; radius >= minRadius; radius -= 1) {
    const x = cos * radius;
    const z = sin * radius;
    if (landmassMaskAt(x, z) >= threshold) {
      insideRadius = radius;
      outsideRadius = Math.min(maxRadius, radius + 1);
      break;
    }
  }
  if (insideRadius == null) return null;
  let low = insideRadius;
  let high = outsideRadius;
  for (let i = 0; i < 8; i += 1) {
    const mid = (low + high) * 0.5;
    if (landmassMaskAt(cos * mid, sin * mid) >= threshold) {
      low = mid;
    } else {
      high = mid;
    }
  }
  const radius = (low + high) * 0.5;
  return {
    x: cos * radius,
    z: sin * radius
  };
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
  placeSnowDeadGrass(scene, pathPoints, random);
}

function createDungeonDecor(scene, pathPoints) {
  createLavaSurface(scene);
  createLavaEmbers(scene);
  createDungeonWalls(scene);
  createDungeonPlatformWalls(scene);
  createDungeonPillars(scene);
  createDungeonTraps(scene);
  createDungeonCrystals(scene);
  createDungeonBoneFields(scene);
  createDungeonTorches(scene);
  createDungeonCampfires(scene);

  const random = seededRandom(worldConfig().seed ?? 611);
  for (let i = 0; i < 52; i += 1) {
    const x = -34 + random() * 68;
    const z = -34 + random() * 68;
    if (!isDungeonSafeSurfaceAt(x, z)) continue;
    if (distanceToPath(x, z, pathPoints) < 3.8 && random() > 0.18) continue;
    if (Math.hypot(x - worldConfig().playerBasePosition.x, z - worldConfig().playerBasePosition.z) < 8) continue;
    if (Math.hypot(x - worldConfig().enemyCampPosition.x, z - worldConfig().enemyCampPosition.z) < 7) continue;
    const rubble = createRock(0.42 + random() * 0.68, {
      color: random() > 0.5 ? '#3c3940' : '#555059',
      snowCap: false
    });
    placeOnTerrain(rubble, x, z, 0.02);
    rubble.rotation.y = random() * Math.PI * 2;
    scene.add(rubble);
  }
}

function createLavaSurface(scene) {
  const geometry = new THREE.PlaneGeometry(86, 86, 76, 76);
  const position = geometry.attributes.position;
  const colors = new Array(position.count * 3);
  const deep = new THREE.Color('#360908');
  const hot = new THREE.Color('#f05a1e');
  const bright = new THREE.Color('#ffd25f');

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = -position.getY(i);
    const wave = Math.sin(x * 0.22 + z * 0.17) * 0.055 +
      Math.cos(x * 0.1 - z * 0.28) * 0.038;
    const pulse = clamp(
      0.45 +
      Math.sin(x * 0.19 + z * 0.13) * 0.27 +
      Math.cos(x * 0.07 - z * 0.31) * 0.2 +
      (hash2(Math.floor(x * 0.42), Math.floor(z * 0.42)) - 0.5) * 0.2,
      0,
      1
    );
    const color = deep.clone()
      .lerp(hot, 0.58 + pulse * 0.32)
      .lerp(bright, Math.max(0, pulse - 0.74) * 0.48);
    const offset = i * 3;
    position.setZ(i, -0.92 + wave);
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }

  position.needsUpdate = true;
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const lava = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  lava.rotation.x = -Math.PI / 2;
  lava.renderOrder = 2;
  scene.add(lava);
}

function createLavaEmbers(scene) {
  const random = seededRandom(9812);
  const count = 120;
  const positions = new Float32Array(count * 3);
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 8) {
    attempts += 1;
    const x = -39 + random() * 78;
    const z = -39 + random() * 78;
    if (isDungeonSafeSurfaceAt(x, z)) continue;
    const offset = placed * 3;
    positions[offset] = x;
    positions[offset + 1] = terrainHeightAt(x, z) + 0.2 + random() * 0.48;
    positions[offset + 2] = z;
    placed += 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: '#ff8b35',
    size: 0.22,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    sizeAttenuation: true
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 6;
  scene.add(points);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(86, 86, 1, 1),
    basicMat('#ff4b18', {
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone()
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.92;
  glow.renderOrder = 1;
  scene.add(glow);
}

function createDungeonWalls(scene) {
  const random = seededRandom(7701);
  const rim = [
    { x: -42, z: -32, width: 7, height: 14, rot: -0.34 },
    { x: -43, z: -24, width: 6.2, height: 11, rot: 0.18 },
    { x: -39, z: -16, width: 6, height: 10, rot: 0.12 },
    { x: -43, z: -6, width: 7.4, height: 12.5, rot: -0.08 },
    { x: -42, z: 4, width: 7.5, height: 13, rot: -0.2 },
    { x: -41, z: 14, width: 6.6, height: 11.2, rot: 0.22 },
    { x: -39, z: 24, width: 6.5, height: 11, rot: 0.28 },
    { x: -38, z: 34, width: 7.1, height: 13.5, rot: -0.12 },
    { x: -30, z: 40, width: 8, height: 12, rot: -0.44 },
    { x: -20, z: 42, width: 6.7, height: 10.5, rot: 0.34 },
    { x: -10, z: 43, width: 7, height: 10, rot: 0.1 },
    { x: 1, z: 43, width: 6.1, height: 9.6, rot: -0.24 },
    { x: 12, z: 42, width: 8, height: 13, rot: -0.08 },
    { x: 23, z: 41, width: 6.9, height: 11.4, rot: 0.18 },
    { x: 34, z: 38, width: 7, height: 11, rot: 0.34 },
    { x: 41, z: 31, width: 7.4, height: 13.8, rot: -0.32 },
    { x: 42, z: 20, width: 6.4, height: 12, rot: -0.16 },
    { x: 43, z: 9, width: 6.7, height: 11.2, rot: 0.28 },
    { x: 41, z: -2, width: 7.5, height: 14, rot: 0.12 },
    { x: 43, z: -13, width: 6.6, height: 12, rot: -0.18 },
    { x: 40, z: -24, width: 8, height: 15, rot: -0.28 },
    { x: 36, z: -34, width: 7.1, height: 12.4, rot: 0.16 },
    { x: 24, z: -42, width: 8.5, height: 13, rot: 0.22 },
    { x: 14, z: -43, width: 6.4, height: 10.8, rot: -0.2 },
    { x: 4, z: -43, width: 7.2, height: 11, rot: -0.18 },
    { x: -8, z: -43, width: 6.6, height: 10.2, rot: 0.26 },
    { x: -18, z: -42, width: 8, height: 13, rot: 0.08 }
  ];

  rim.forEach((item) => {
    const peak = createDungeonWallPeak(item.width, item.height, item.color ?? '#1b1824');
    placeOnTerrain(peak, item.x, item.z, -0.62);
    peak.rotation.y = item.rot;
    peak.scale.z *= 1.35;
    scene.add(peak);
  });

  for (let i = 0; i < 108; i += 1) {
    const edge = i % 4;
    const x = edge === 0 ? -39 + random() * 4 : edge === 1 ? 35 + random() * 5 : -38 + random() * 76;
    const z = edge === 2 ? -39 + random() * 4 : edge === 3 ? 35 + random() * 5 : -38 + random() * 76;
    const rock = createRock(1.35 + random() * 2.9, {
      color: random() > 0.5 ? '#211d2a' : '#2b2632',
      snowCap: false
    });
    rock.scale.x *= 0.8 + random() * 0.9;
    rock.scale.y *= 1.1 + random() * 1.5;
    rock.scale.z *= 0.8 + random() * 0.8;
    placeOnTerrain(rock, x, z, -0.16);
    rock.rotation.y = random() * Math.PI * 2;
    scene.add(rock);
  }
}

function createDungeonWallPeak(width, height, color = '#1b1824') {
  const group = new THREE.Group();
  const baseMat = mat(color, { roughness: 0.96 });
  const shadeMat = mat('#100c15', { roughness: 0.98 });
  const warmMat = mat('#2a1b18', { roughness: 0.96 });
  const base = new THREE.Mesh(
    new THREE.ConeGeometry(width, height, 7),
    baseMat
  );
  const shoulder = new THREE.Mesh(
    new THREE.ConeGeometry(width * 0.7, height * 0.48, 6),
    shadeMat
  );
  const warmFace = new THREE.Mesh(
    new THREE.ConeGeometry(width * 0.36, height * 0.38, 5),
    warmMat
  );
  base.position.y = height * 0.5;
  shoulder.position.set(width * 0.08, height * 0.76, -width * 0.08);
  shoulder.rotation.z = 0.12;
  warmFace.position.set(-width * 0.16, height * 0.54, width * 0.22);
  warmFace.rotation.z = -0.2;
  warmFace.scale.z = 0.58;
  group.add(base, shoulder, warmFace);
  return enableDecorationShadows(group);
}

function createDungeonPlatformWalls(scene) {
  const random = seededRandom(9147);
  (worldConfig().dungeonPlatforms ?? []).forEach((platform, platformIndex) => {
    const count = platform.tone === 'small'
      ? 8
      : Math.max(14, Math.round((platform.rx + platform.rz) * 0.72));
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + (platformIndex % 2) * 0.12;
      if (isNearDungeonBridgeEntry(platform, angle)) continue;
      const wobble = 0.92 + random() * 0.18;
      const edge = ellipseBoundaryPoint(platform, angle, wobble);
      const x = edge.x;
      const z = edge.z;
      const rock = createRock(0.78 + random() * 1.45, {
        color: random() > 0.45 ? '#241f2a' : '#342d38',
        snowCap: false
      });
      rock.scale.x *= 0.65 + random() * 0.55;
      rock.scale.y *= 1.15 + random() * 1.1;
      rock.scale.z *= 0.62 + random() * 0.6;
      placeOnTerrain(rock, x, z, -0.08);
      rock.rotation.y = angle + Math.PI * 0.5 + (random() - 0.5) * 0.45;
      scene.add(rock);
    }
  });
}

function isNearDungeonBridgeEntry(platform, angle) {
  const entry = ellipseBoundaryPoint(platform, angle);
  return distanceToDungeonBridgeNetwork(entry.x, entry.z) < (worldConfig().pathWidth ?? 3.4) * 1.2;
}

function distanceToDungeonBridgeNetwork(x, z) {
  return dungeonBridgeSegments().reduce((best, [a, b]) => (
    Math.min(best, distanceToSegment2D(x, z, a, b))
  ), Number.POSITIVE_INFINITY);
}

function createDungeonPillars(scene) {
  const pillarPositions = [
    { x: -15, z: 18, h: 2.2, broken: true },
    { x: 14, z: 15, h: 1.6, broken: true },
    { x: 22, z: -18, h: 2.1, broken: true },
    { x: 7, z: -23, h: 2.4, broken: true }
  ];
  pillarPositions.forEach((item) => {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.88, 1.02, 0.32, 6),
      mat('#474149')
    );
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.62, item.h, 6),
      mat('#56505a')
    );
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 0.66, 0.28, 6),
      mat('#39343d')
    );
    base.position.y = 0.16;
    shaft.position.y = 0.34 + item.h * 0.5;
    cap.position.y = 0.46 + item.h;
    if (item.broken) {
      shaft.rotation.z = 0.08;
      cap.rotation.z = -0.14;
      cap.position.x = 0.08;
    }
    group.add(base, shaft, cap);
    placeOnTerrain(group, item.x, item.z);
    group.rotation.y = item.x * 0.08;
    enableDecorationShadows(group);
    scene.add(group);
  });
}

function createDungeonTraps(scene) {
  (worldConfig().mechanics?.traps ?? []).forEach((trap) => {
    const model = trap.type === 'fireVent'
      ? createFireVentModel(trap)
      : createSpikeTrapModel(trap);
    placeOnTerrain(model, trap.x, trap.z, 0.045);
    model.rotation.y = trap.rotation ?? 0;
    scene.add(model);
  });
}

function createDungeonTorches(scene) {
  [
    { x: -8, z: 25 },
    { x: -22, z: 4 },
    { x: 6, z: 3 },
    { x: 15, z: -9 },
    { x: -3, z: -23 },
    { x: 2, z: -32 }
  ].forEach((item) => {
    const torch = createTorchModel();
    placeOnTerrain(torch, item.x, item.z, 0.04);
    torch.rotation.y = item.x < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    scene.add(torch);

    const light = new THREE.PointLight('#ff9c45', 1.6, 15, 2);
    light.position.set(item.x, terrainHeightAt(item.x, item.z) + 2.4, item.z);
    scene.add(light);
  });
}

function createDungeonCrystals(scene) {
  (worldConfig().dungeonCrystals ?? []).forEach((item) => {
    const cluster = createCrystalClusterModel(item.scale ?? 1, item.color ?? '#8cff5f');
    placeOnTerrain(cluster, item.x, item.z, 0.05);
    cluster.rotation.y = (item.x + item.z) * 0.08;
    scene.add(cluster);

    const light = new THREE.PointLight(item.color ?? '#8cff5f', 1.05, 10, 2);
    light.position.set(item.x, terrainHeightAt(item.x, item.z) + 1.3, item.z);
    scene.add(light);
  });
}

function createDungeonBoneFields(scene) {
  [
    { x: -31, z: -14, rot: 0.4, scale: 1.25, giant: true },
    { x: 28, z: 8, rot: -0.55, scale: 1.08, giant: true },
    { x: 12, z: -27, rot: 0.12, scale: 0.9, giant: false }
  ].forEach((item) => {
    const bones = item.giant
      ? createGiantBeastSkeletonModel(item.scale)
      : createRibBonesModel(item.scale);
    placeOnTerrain(bones, item.x, item.z, 0.08);
    bones.rotation.y = item.rot;
    scene.add(bones);
  });
}

function createDungeonCampfires(scene) {
  [
    { x: -17, z: 9, scale: 0.9 },
    { x: 8, z: -4, scale: 1 },
    { x: 2, z: -30, scale: 0.86 }
  ].forEach((item) => {
    const campfire = createCampfireModel(item.scale);
    placeOnTerrain(campfire, item.x, item.z, 0.06);
    scene.add(campfire);

    const light = new THREE.PointLight('#ffb05a', 1.45 * item.scale, 12, 2);
    light.position.set(item.x, terrainHeightAt(item.x, item.z) + 1.1, item.z);
    scene.add(light);
  });
}

function createDesertDecor(scene, pathPoints) {
  const random = seededRandom(worldConfig().seed ?? 904);
  worldConfig().sunlightShadeZones = [];
  placeDesertCanyonWalls(scene, random);
  placeDesertSandstoneLandmarks(scene, pathPoints, random);
  placeDesertSandstoneFields(scene, pathPoints, random);
  placeDesertLandmarkBoulders(scene, pathPoints);
  placeDesertBoulderClusters(scene, pathPoints, random);
  placeDesertPebbles(scene, pathPoints, random);
  placeCacti(scene, pathPoints, random);
  placeDesertScrub(scene, pathPoints, random);
}

function createDesertShadeDiscs(scene) {
  const material = basicMat('#3b241d', {
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true
  }).clone();
  (worldConfig().shadeZones ?? []).forEach((zone, index) => {
    const meshShade = createTerrainEllipseMesh(zone, material, 0.068, 24);
    meshShade.renderOrder = 4 + index;
    scene.add(meshShade);
  });
}

function placeDesertLandmarkBoulders(scene, pathPoints) {
  worldConfig().landmarkBoulders.forEach((item) => {
    if (distanceToPath(item.x, item.z, pathPoints) < 5.4) return;
    if (Math.hypot(item.x - worldConfig().playerBasePosition.x, item.z - worldConfig().playerBasePosition.z) < 8) return;
    if (Math.hypot(item.x - worldConfig().enemyCampPosition.x, item.z - worldConfig().enemyCampPosition.z) < 7) return;
    const rock = createRock(item.size, {
      color: item.color ?? '#974b38',
      snowCap: false
    });
    rock.scale.set(item.sx, item.sy, item.sz);
    placeOnTerrain(rock, item.x, item.z, 0.02);
    rock.rotation.y = item.rot;
    bakeObjectGroundShadow(rock);
    scene.add(rock);
  });
}

function placeDesertBoulderClusters(scene, pathPoints, random) {
  worldConfig().boulderClusters.forEach((cluster) => {
    for (let i = 0; i < cluster.count; i += 1) {
      const { x, z } = randomPointInEllipse(cluster, random);
      if (!isDecorationClear(x, z, pathPoints, 5)) continue;
      const size = cluster.sizeMin + random() * (cluster.sizeMax - cluster.sizeMin);
      const rock = createRock(size, {
        color: random() > 0.45 ? '#8e4434' : '#b45a3e',
        snowCap: false
      });
      rock.scale.x *= 0.9 + random() * 0.5;
      rock.scale.y *= 0.95 + random() * 0.65;
      rock.scale.z *= 0.8 + random() * 0.56;
      placeOnTerrain(rock, x, z, 0.02);
      rock.rotation.y = random() * Math.PI * 2;
      bakeObjectGroundShadow(rock);
      scene.add(rock);
    }
  });
}

function placeDesertSandstoneLandmarks(scene, pathPoints, random) {
  (worldConfig().sandstoneLandmarks ?? []).forEach((item) => {
    if (!isDesertSandstoneClear(item.x, item.z, 2.8)) return;
    const landmark = item.kind === 'arch'
      ? createLayeredSandstoneArch(item.span ?? 4.8, item.height ?? 4, item.radius ?? 1, random)
      : item.kind === 'mesa'
        ? createLayeredSandstoneMesa(item.radius ?? 3, item.height ?? 3.4, random)
        : createLayeredSandstonePillar(item.radius ?? 1.1, item.height ?? 6, random);
    registerDesertSunlightShade(
      item.x,
      item.z,
      item.kind === 'arch' ? (item.span ?? 4.8) * 0.42 : item.radius ?? 1.4,
      item.height ?? 4.8,
      item.kind === 'mesa' ? 1.15 : 1
    );
    placeOnTerrain(landmark, item.x, item.z, -0.04);
    landmark.rotation.y = item.rot ?? 0;
    landmark.scale.x *= item.sx ?? 1;
    landmark.scale.z *= item.sz ?? 1;
    bakeObjectGroundShadow(landmark);
    scene.add(landmark);
    registerDesertSandstoneNavigationBlockers(item);
  });
}

function placeDesertSandstoneFields(scene, pathPoints, random) {
  (worldConfig().sandstoneFields ?? []).forEach((field) => {
    for (let i = 0; i < field.count; i += 1) {
      const point = randomPointInEllipse(field, random);
      if (!isDesertSandstoneClear(point.x, point.z, field.clearance ?? 1.2)) continue;

      const height = (field.minHeight ?? 2.2) +
        random() * ((field.maxHeight ?? 6) - (field.minHeight ?? 2.2));
      const radius = 0.62 + random() * 0.82 + height * 0.06;
      const isMesa = random() < (field.mesaChance ?? 0.24);
      const pillar = isMesa
        ? createLayeredSandstoneMesa(radius * (1.35 + random() * 0.75), height * (0.55 + random() * 0.22), random)
        : createLayeredSandstonePillar(radius, height, random);
      registerDesertSunlightShade(
        point.x,
        point.z,
        isMesa ? radius * 1.7 : radius,
        height,
        isMesa ? 1.12 : 1
      );
      placeOnTerrain(pillar, point.x, point.z, -0.04);
      pillar.rotation.y = random() * Math.PI * 2;
      pillar.scale.x *= 0.86 + random() * 0.34;
      pillar.scale.z *= 0.82 + random() * 0.4;
      bakeObjectGroundShadow(pillar);
      scene.add(pillar);
      registerWorldNavigationBlocker(
        point.x,
        point.z,
        isMesa ? radius * 1.45 : radius * 0.82,
        isMesa ? 'desert-mesa' : 'desert-pillar'
      );
    }
  });
}

function registerDesertSandstoneNavigationBlockers(item) {
  if (worldConfig().theme !== 'red-desert') return;
  if (item.kind === 'arch') {
    const span = item.span ?? 4.8;
    const thickness = item.radius ?? 1;
    const rotation = item.rot ?? 0;
    const supportRadius = thickness * 0.72 * Math.max(item.sx ?? 1, item.sz ?? 1);
    [-span * 0.5, span * 0.5].forEach((localX) => {
      const point = rotateLocalPoint(localX, 0, rotation);
      registerWorldNavigationBlocker(
        item.x + point.x,
        item.z + point.z,
        supportRadius,
        'desert-arch-pillar'
      );
    });
    return;
  }

  const baseRadius = item.kind === 'mesa'
    ? (item.radius ?? 3) * 1.28
    : (item.radius ?? 1.1) * 0.88;
  registerWorldNavigationBlocker(
    item.x,
    item.z,
    baseRadius * Math.max(item.sx ?? 1, item.sz ?? 1),
    item.kind === 'mesa' ? 'desert-mesa' : 'desert-pillar'
  );
}

function rotateLocalPoint(x, z, rotation) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: x * cos - z * sin,
    z: x * sin + z * cos
  };
}

function registerDesertSunlightShade(x, z, radius, height, scale = 1) {
  const zones = worldConfig().sunlightShadeZones;
  if (!Array.isArray(zones)) return;
  const offsetX = DESERT_SHADOW_X_PER_HEIGHT * height;
  const offsetZ = DESERT_SHADOW_Z_PER_HEIGHT * height;
  zones.push({
    x: x + offsetX * 0.42,
    z: z + offsetZ * 0.42,
    rx: Math.max(1.4, radius * 1.2 + height * 0.38) * scale,
    rz: Math.max(0.65, radius * 0.72 + height * 0.12) * scale,
    rot: Math.atan2(offsetZ, offsetX)
  });
}

function isDesertSandstoneClear(x, z, clearance = 1.2) {
  const config = worldConfig();
  if (config.clearings.some((clearing) => Math.hypot(x - clearing.x, z - clearing.z) < clearing.r * 0.72)) {
    return false;
  }
  if (isAltarClearing(x, z)) return false;
  if (Math.hypot(x - config.playerBasePosition.x, z - config.playerBasePosition.z) < 8.8 + clearance) {
    return false;
  }
  if (Math.hypot(x - config.enemyCampPosition.x, z - config.enemyCampPosition.z) < 7.2 + clearance) {
    return false;
  }
  return true;
}

function createLayeredSandstonePillar(radius, height, random) {
  const group = new THREE.Group();
  const colors = ['#b95d3e', '#d27a4e', '#ecaa6b', '#8f4234', '#c76846'];
  const bands = Math.max(8, Math.round(height * 2.2));
  let y = 0;
  for (let i = 0; i < bands; i += 1) {
    const t = i / Math.max(1, bands - 1);
    const bandHeight = height * (0.055 + random() * 0.045);
    const waist = 0.48 + Math.sin(t * Math.PI * 2.35 + radius) * 0.12 + (random() - 0.5) * 0.16;
    const capBias = Math.max(
      0,
      smoothstep(0.72, 1, t) * 0.68 +
      smoothstep(0.08, 0, t) * 0.42
    );
    const bandRadius = radius * clamp(waist + capBias + random() * 0.1, 0.34, 1.75);
    const meshBand = new THREE.Mesh(
      new THREE.CylinderGeometry(
        bandRadius * (0.92 + random() * 0.22),
        bandRadius * (0.9 + random() * 0.24),
        bandHeight,
        8
      ),
      mat(colors[i % colors.length], { roughness: 0.98 })
    );
    meshBand.position.set(
      (random() - 0.5) * radius * 0.18,
      y + bandHeight * 0.5,
      (random() - 0.5) * radius * 0.18
    );
    meshBand.rotation.y = random() * Math.PI * 2;
    group.add(meshBand);
    y += bandHeight * (0.82 + random() * 0.16);
  }

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.65, radius * 1.15, height * 0.16, 9),
    mat('#f1b875', { roughness: 0.98 })
  );
  cap.position.y = y + height * 0.06;
  cap.scale.z = 0.72 + random() * 0.22;
  cap.rotation.y = random() * Math.PI * 2;
  group.add(cap);

  return enableDecorationShadows(group);
}

function createLayeredSandstoneArch(span, height, thickness, random) {
  const group = new THREE.Group();
  const left = createLayeredSandstonePillar(thickness * 0.68, height * 0.78, random);
  const right = createLayeredSandstonePillar(thickness * 0.72, height * 0.74, random);
  left.position.set(-span * 0.5, 0, 0);
  right.position.set(span * 0.5, 0, 0.12);
  left.scale.z = 0.78;
  right.scale.z = 0.82;
  group.add(left, right);

  const colors = ['#9b4635', '#c56542', '#e18a54', '#efb06f'];
  const slabCount = 5;
  for (let i = 0; i < slabCount; i += 1) {
    const t = i / Math.max(1, slabCount - 1);
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(
        span + thickness * (1.15 + t * 0.32),
        thickness * (0.18 + random() * 0.04),
        thickness * (1.05 - t * 0.08)
      ),
      mat(colors[i % colors.length], { roughness: 0.98 })
    );
    slab.position.set(
      (random() - 0.5) * thickness * 0.18,
      height * (0.72 + t * 0.065),
      (random() - 0.5) * thickness * 0.16
    );
    slab.rotation.y = (random() - 0.5) * 0.16;
    slab.rotation.z = (random() - 0.5) * 0.06;
    group.add(slab);
  }

  return enableDecorationShadows(group);
}

function createLayeredSandstoneMesa(radius, height, random) {
  const group = new THREE.Group();
  const colors = ['#9e4937', '#bd6242', '#e08a55', '#f0b775', '#c96b47'];
  const layers = Math.max(5, Math.round(height * 1.7));
  let y = 0;
  for (let i = 0; i < layers; i += 1) {
    const t = i / Math.max(1, layers - 1);
    const layerHeight = height * (0.09 + random() * 0.055);
    const layerRadius = radius * (1.08 - t * 0.34 + Math.sin(t * Math.PI * 3) * 0.08 + random() * 0.08);
    const mesaLayer = new THREE.Mesh(
      new THREE.CylinderGeometry(
        layerRadius * (0.92 + random() * 0.16),
        layerRadius * (0.96 + random() * 0.16),
        layerHeight,
        10
      ),
      mat(colors[i % colors.length], { roughness: 0.98 })
    );
    mesaLayer.position.y = y + layerHeight * 0.5;
    mesaLayer.scale.z = 0.6 + random() * 0.24;
    mesaLayer.rotation.y = random() * Math.PI * 2;
    group.add(mesaLayer);
    y += layerHeight * (0.84 + random() * 0.12);
  }

  return enableDecorationShadows(group);
}

function placeDesertCanyonWalls(scene, random) {
  (worldConfig().canyonWalls ?? []).forEach((wall, index) => {
    const width = wall.width ?? 9;
    const depth = wall.depth ?? 10;
    const height = wall.height ?? 8;
    const column = createLayeredDesertCanyonColumn(width, depth, height, random);
    column.name = 'DesertCanyonWall';
    placeOnTerrain(column, wall.x, wall.z, -0.08);
    column.rotation.y = (wall.rot ?? 0) + (hash2(index * 0.61, 18.4) - 0.5) * 0.08;
    bakeObjectGroundShadow(column);
    scene.add(column);
    registerWorldNavigationBlocker(
      wall.x,
      wall.z,
      Math.max(width, depth) * 0.38,
      'desert-canyon-wall'
    );
  });
}

function createLayeredDesertCanyonColumn(width, depth, height, random) {
  const group = new THREE.Group();
  const colors = ['#994735', '#b95b3c', '#d97948', '#e79b58', '#c86942'];
  const topMat = mat('#f0b762', { roughness: 0.98 });
  const layers = Math.max(7, Math.round(height * 1.15));
  let y = 0;

  for (let i = 0; i < layers; i += 1) {
    const t = i / Math.max(1, layers - 1);
    const layerHeight = height * (0.055 + random() * 0.04);
    const taper = 1.05 - t * 0.28 + Math.sin(t * Math.PI * 3.2) * 0.08 + (random() - 0.5) * 0.08;
    const shelf = i % 3 === 0 ? 1.08 + random() * 0.1 : 0.92 + random() * 0.1;
    const layer = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 10),
      mat(colors[i % colors.length], { roughness: 0.98 })
    );
    layer.name = 'DesertCanyonWallLayer';
    layer.position.set(
      (random() - 0.5) * width * 0.08,
      y + layerHeight * 0.5,
      (random() - 0.5) * depth * 0.08
    );
    layer.scale.set(
      width * taper * shelf * (0.48 + random() * 0.08),
      layerHeight,
      depth * taper * (0.42 + random() * 0.1)
    );
    layer.rotation.y = random() * Math.PI * 2;
    group.add(layer);
    y += layerHeight * (0.78 + random() * 0.14);
  }

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 0.46, 10),
    topMat
  );
  cap.name = 'DesertCanyonWallCap';
  cap.position.y = y + 0.12;
  cap.scale.set(width * 0.48, 1, depth * 0.42);
  cap.rotation.y = random() * Math.PI * 2;
  group.add(cap);

  return enableDecorationShadows(group);
}

function placeDesertPebbles(scene, pathPoints, random) {
  const colors = ['#7b3f34', '#9f5138', '#b96542', '#d0834f', '#ecd099'];
  (worldConfig().desertPebbleFields ?? []).forEach((field) => {
    for (let i = 0; i < field.count; i += 1) {
      const { x, z } = randomPointInEllipse(field, random);
      if (!isDecorationClear(x, z, pathPoints, 2.1)) continue;
      if (distanceToPath(x, z, pathPoints) < 4.6 && random() > 0.18) continue;
      const size = 0.14 + random() * 0.42;
      const pebble = new THREE.Mesh(
        new THREE.DodecahedronGeometry(size, 0),
        mat(colors[Math.floor(random() * colors.length)], { roughness: 0.96 })
      );
      pebble.name = 'DesertPebble';
      pebble.scale.set(1.1 + random() * 1.2, 0.45 + random() * 0.55, 0.9 + random() * 1.1);
      pebble.rotation.set((random() - 0.5) * 0.38, random() * Math.PI * 2, (random() - 0.5) * 0.28);
      placeOnTerrain(pebble, x, z, 0.045);
      pebble.castShadow = true;
      pebble.receiveShadow = true;
      scene.add(pebble);
    }
  });
}

function placeCacti(scene, pathPoints, random) {
  const zones = worldConfig().cactusZones ?? [
    { x: -33, z: 18, rx: 6, rz: 10, count: 10 },
    { x: 33, z: 6, rx: 5, rz: 11, count: 9 },
    { x: -29, z: -19, rx: 6, rz: 8, count: 8 },
    { x: 30, z: -24, rx: 6, rz: 7, count: 7 },
    { x: 8, z: 11, rx: 5, rz: 5, count: 5 }
  ];
  zones.forEach((zone) => {
    for (let i = 0; i < zone.count; i += 1) {
      const { x, z } = randomPointInEllipse(zone, random);
      if (!isDecorationClear(x, z, pathPoints, 3.2)) continue;
      const cactus = createCactusModel(0.75 + random() * 0.95);
      cactus.name = 'DesertCactus';
      placeOnTerrain(cactus, x, z);
      cactus.rotation.y = random() * Math.PI * 2;
      bakeObjectGroundShadow(cactus);
      scene.add(cactus);
    }
  });
}

function placeDesertScrub(scene, pathPoints, random) {
  const scrubColors = ['#75683f', '#877048', '#6b6038'];
  for (let i = 0; i < (worldConfig().desertScrubCount ?? 42); i += 1) {
    const x = -36 + random() * 72;
    const z = -34 + random() * 68;
    if (!isDecorationClear(x, z, pathPoints, 2.3)) continue;
    if (distanceToPath(x, z, pathPoints) < 5 && random() > 0.25) continue;
    const scrub = createGrassTuft(
      0.28 + random() * 0.34,
      scrubColors[Math.floor(random() * scrubColors.length)]
    );
    placeOnTerrain(scrub, x, z, 0.12);
    scrub.rotation.y = random() * Math.PI * 2;
    scene.add(scrub);
  }
}

function placeForests(scene, pathPoints, random) {
  worldConfig().forestZones.forEach((zone) => {
    for (let i = 0; i < zone.count; i += 1) {
      const point = randomPointInEllipse(zone, random);
      if (!point) continue;
      const { x, z } = point;
      if (!isDecorationClear(x, z, pathPoints, zone.tone === 'snow' ? 3.8 : 3.5)) continue;
      if (isForestPassage(x, z, pathPoints)) continue;
      if (!isForestZonePointKept(zone, x, z, random)) continue;

      const height = zone.tone === 'snow'
        ? 0.76 + random() * 0.9
        : 0.78 + random() * 1.65;
      const tree = createSnowPine(height);
      placeOnTerrain(tree, x, z);
      tree.rotation.y = random() * Math.PI * 2;
      addStaticCulledObject(scene, tree);
      registerWorldNavigationBlocker(x, z, 0.42 + height * 0.24, 'snow-tree');
    }
  });
}

function isForestZonePointKept(zone, x, z, random) {
  const raggedness = zone.raggedness ?? 0;
  if (raggedness <= 0) return true;
  const distance = normalizedEllipseDistanceAt(x, z, zone);
  const edgeMask = smoothstep(zone.edgeStart ?? 0.62, 1, distance);
  const cellNoise = hash2(
    Math.floor((x + (zone.x ?? 0)) * 0.22),
    Math.floor((z - (zone.z ?? 0)) * 0.22)
  );
  if (distance + (cellNoise - 0.5) * raggedness > 1) return false;
  if (edgeMask > 0 && random() < edgeMask * (zone.edgeDrop ?? 0.4)) return false;
  return true;
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
    addStaticCulledObject(scene, rock);
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
      addStaticCulledObject(scene, rock);
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
    addStaticCulledObject(scene, rock);
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
      addStaticCulledObject(scene, bush);
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
      addStaticCulledObject(scene, grass);
    }
  });
}

function placeSnowDeadGrass(scene, pathPoints, random) {
  const colors = ['#c6bea0', '#b4aa86', '#d6d1bb', '#aaa17e'];
  const scale = worldConfig().deadGrassScale ?? 1;
  const fields = worldConfig().deadGrassFields ?? [
    { x: -24, z: 13, rx: 8, rz: 5, count: 16 },
    { x: 23, z: 1, rx: 8, rz: 5, count: 16 },
    { x: -21, z: -23, rx: 8, rz: 4.5, count: 16 },
    { x: 21, z: -23, rx: 8, rz: 4.5, count: 16 }
  ];

  fields.forEach((field) => {
    const clumpCount = field.clumps ?? Math.max(2, Math.ceil(field.count / 7));
    const tuftsPerClump = Math.max(3, Math.round(field.count / clumpCount));

    for (let clump = 0; clump < clumpCount; clump += 1) {
      const center = randomPointInEllipse(field, random);
      if (!isSnowDeadGrassClear(center.x, center.z, pathPoints, (field.clearance ?? 1.05) + 0.25)) continue;
      const localCount = Math.max(3, Math.round(tuftsPerClump * (0.72 + random() * 0.55)));
      const clumpRadius = field.clumpRadius ?? (0.95 + random() * 0.85);

      for (let i = 0; i < localCount; i += 1) {
        const angle = random() * Math.PI * 2;
        const radius = Math.sqrt(random()) * clumpRadius;
        const x = center.x + Math.cos(angle) * radius;
        const z = center.z + Math.sin(angle) * radius * (0.62 + random() * 0.36);
        if (!isSnowDeadGrassClear(x, z, pathPoints, field.clearance ?? 1.05)) continue;
        if (distanceToPath(x, z, pathPoints) < 2.6 && random() > 0.42) continue;
        if (terrainHeightAt(x, z) > 8.2 && random() > 0.24) continue;

        const size = (0.24 + random() * 0.34) * scale;
        const grass = createSnowDeadGrassTuft(
          size,
          colors[Math.floor(random() * colors.length)],
          random
        );
        placeOnTerrain(grass, x, z, 0.1 + 0.02 * scale);
        grass.rotation.y = random() * Math.PI * 2;
        addStaticCulledObject(scene, grass);
      }
    }
  });
}

function createSnowDeadGrassTuft(size, color, random) {
  const group = createGrassTuft(size, color);
  const snowMaterial = mat('#edf3e9', { roughness: 0.92 });
  const capCount = random() > 0.58 ? 2 : 1;

  for (let i = 0; i < capCount; i += 1) {
    const capSize = size * (0.085 + random() * 0.045);
    const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(capSize, 0), snowMaterial);
    cap.position.set(
      (random() - 0.5) * size * 0.22,
      size * (0.34 + random() * 0.12),
      (random() - 0.5) * size * 0.22
    );
    cap.scale.set(1.55 + random() * 0.35, 0.45, 1.05 + random() * 0.4);
    cap.rotation.y = random() * Math.PI * 2;
    cap.castShadow = true;
    cap.receiveShadow = true;
    group.add(cap);
  }

  return enableDecorationShadows(group);
}

function isSnowDeadGrassClear(x, z, pathPoints, clearance) {
  const config = worldConfig();
  if (config.landmass && landmassMaskAt(x, z) < 0.72) return false;
  if (distanceToPath(x, z, pathPoints) < clearance) return false;
  if (isAltarClearing(x, z)) return false;
  if (Math.hypot(x - config.playerBasePosition.x, z - config.playerBasePosition.z) < 7.8) {
    return false;
  }
  if (Math.hypot(x - config.enemyCampPosition.x, z - config.enemyCampPosition.z) < 5.8) {
    return false;
  }
  return true;
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
    registerWorldNavigationBlocker(
      item.x,
      item.z,
      (item.navRadius ?? WORLD_NAV_COTTAGE_RADIUS) * (item.scale ?? 1),
      'cottage'
    );
    addStaticCulledObject(scene, cottage);
  });
}

function createSnowMonsterCamp(scene) {
  const config = worldConfig().monsterCamp ?? { x: 4, z: -34, rot: -0.34, scale: 1.18 };
  const theme = worldConfig().theme;
  if (theme !== 'dungeon') {
    registerWorldNavigationBlocker(
      config.x,
      config.z,
      WORLD_NAV_MONSTER_CAMP_RADIUS * (config.scale ?? 1),
      'monster-camp'
    );
  }
  if (theme === 'dungeon') {
    createDungeonEnemyGate(scene);
    return;
  }
  const camp = createMonsterCampModel();
  placeOnTerrain(camp, config.x, config.z, config.offset ?? 0.28);
  camp.rotation.y = config.rot ?? -0.34;
  camp.scale.setScalar(config.scale ?? 1.18);
  addStaticCulledObject(scene, camp);
}

function createDungeonEnemyGate(scene) {
  const config = worldConfig().monsterCamp ?? { x: 0, z: -33, rot: 0, scale: 1 };
  const group = new THREE.Group();
  const stone = mat('#3f4648', { roughness: 0.96 });
  const glowMat = basicMat('#bd4a35', {
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false
  }).clone();
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 0.8), stone);
  const right = left.clone();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.82), stone);
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.8, 1, 1), glowMat);
  left.position.set(-0.82, 1.3, 0);
  right.position.set(0.82, 1.3, 0);
  top.position.set(0, 2.58, 0);
  portal.position.set(0, 1.28, 0.03);
  group.add(left, right, top, portal);
  group.scale.setScalar(config.scale ?? 1);
  group.rotation.y = config.rot ?? 0;
  placeOnTerrain(group, config.x, config.z, config.offset ?? 0.08);
  enableDecorationShadows(group);
  scene.add(group);
}

function addStaticCulledObject(scene, object, radiusPadding = STATIC_WORLD_CULL_RADIUS_PADDING) {
  bakeObjectGroundShadow(object);
  if (queueStaticDecoration(object, radiusPadding)) {
    return object;
  }
  scene.add(object);
  registerStaticCullable(object, radiusPadding);
  return object;
}

function createStaticDecorationBatch() {
  return {
    buckets: new Map(),
    sourceEntries: [],
    bounceSources: []
  };
}

function queueStaticDecoration(object, radiusPadding = STATIC_WORLD_CULL_RADIUS_PADDING) {
  const batch = activeStaticDecorationBatch;
  if (!batch || !object || object.userData?.skipStaticBatch) return false;

  object.updateWorldMatrix(true, true);
  if (!canBatchStaticDecoration(object)) return false;

  STATIC_BATCH_BOX.setFromObject(object);
  if (STATIC_BATCH_BOX.isEmpty()) return false;
  STATIC_BATCH_BOX.getCenter(STATIC_BATCH_CENTER);
  const chunkX = Math.floor(STATIC_BATCH_CENTER.x / STATIC_DECORATION_BATCH_CHUNK_SIZE);
  const chunkZ = Math.floor(STATIC_BATCH_CENTER.z / STATIC_DECORATION_BATCH_CHUNK_SIZE);

  const queued = [];
  object.traverse((node) => {
    if (!node.isMesh) return;
    const geometry = node.geometry.clone();
    geometry.clearGroups();
    geometry.applyMatrix4(node.matrixWorld);
    const key = [
      chunkX,
      chunkZ,
      node.material.uuid,
      staticGeometrySignature(node.geometry),
      node.castShadow ? 1 : 0,
      node.receiveShadow ? 1 : 0,
      node.renderOrder,
      node.layers.mask
    ].join(':');
    queued.push({ key, geometry, node });
  });

  if (queued.length === 0) return false;
  queued.forEach(({ key, geometry, node }) => {
    let bucket = batch.buckets.get(key);
    if (!bucket) {
      bucket = {
        chunkX,
        chunkZ,
        material: node.material,
        geometries: [],
        castShadow: node.castShadow,
        receiveShadow: node.receiveShadow,
        renderOrder: node.renderOrder,
        layersMask: node.layers.mask,
        radiusPadding,
        sourceMeshCount: 0,
        sourceObjects: new Set()
      };
      batch.buckets.set(key, bucket);
    }
    bucket.geometries.push(geometry);
    bucket.radiusPadding = Math.max(bucket.radiusPadding, radiusPadding);
    bucket.sourceMeshCount += 1;
    bucket.sourceObjects.add(object);
  });
  batch.sourceEntries.push({ object, radiusPadding });
  batch.bounceSources.push(createStaticDecorationBounceSource(object));
  return true;
}

function canBatchStaticDecoration(object) {
  if (!object.visible) return false;
  let meshCount = 0;
  let batchable = true;
  object.traverse((node) => {
    if (!batchable) return;
    if (
      !node.visible
      || node.userData?.skipBakedShadow
      || node.isLight
      || node.isSprite
      || node.isLine
      || node.isPoints
      || node.isLOD
      || (!node.isMesh && node.renderOrder !== 0)
    ) {
      batchable = false;
      return;
    }
    if (!node.isMesh) return;
    meshCount += 1;
    const geometry = node.geometry;
    const material = node.material;
    const morphAttributes = geometry?.morphAttributes ?? {};
    const hasMorphTargets = Object.values(morphAttributes).some((attributes) => attributes?.length > 0);
    const hasInterleavedAttributes = Object.values(geometry?.attributes ?? {}).some(
      (attribute) => attribute?.isInterleavedBufferAttribute
    );
    if (
      node.isSkinnedMesh
      || node.isInstancedMesh
      || !geometry?.attributes?.position
      || !material
      || Array.isArray(material)
      || material.visible === false
      || material.transparent
      || material.opacity < 1
      || material.alphaTest > 0
      || hasMorphTargets
      || hasInterleavedAttributes
      || geometry.drawRange.start !== 0
      || Number.isFinite(geometry.drawRange.count)
      || node.frustumCulled === false
      || node.matrixWorld.determinant() <= 0
      || node.customDepthMaterial
      || node.customDistanceMaterial
      || node.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender
      || node.onAfterRender !== THREE.Object3D.prototype.onAfterRender
      || node.onBeforeShadow !== THREE.Object3D.prototype.onBeforeShadow
      || node.onAfterShadow !== THREE.Object3D.prototype.onAfterShadow
    ) {
      batchable = false;
    }
  });
  return batchable && meshCount > 0;
}

function createStaticDecorationBounceSource(object) {
  const size = new THREE.Vector3();
  STATIC_BATCH_BOX.getSize(size);
  const color = new THREE.Color(0, 0, 0);
  let materialCount = 0;
  object.traverse((node) => {
    if (!node.isMesh || node.userData?.skipBakedShadow) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      if (!material?.color) return;
      color.add(material.color);
      materialCount += 1;
    });
  });
  if (materialCount > 0) color.multiplyScalar(1 / materialCount);
  return {
    center: STATIC_BATCH_CENTER.clone(),
    size,
    color: materialCount > 0 ? color : null
  };
}

function staticGeometrySignature(geometry) {
  const index = geometry.index;
  const indexSignature = index
    ? `${index.array.constructor.name},${index.itemSize},${index.normalized ? 1 : 0}`
    : 'none';
  const attributeSignature = Object.entries(geometry.attributes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, attribute]) => [
      name,
      attribute.array.constructor.name,
      attribute.itemSize,
      attribute.normalized ? 1 : 0,
      attribute.gpuType ?? 0
    ].join(','))
    .join('|');
  return `${indexSignature}/${attributeSignature}`;
}

function flushStaticDecorationBatch(scene) {
  const batch = activeStaticDecorationBatch;
  activeStaticDecorationBatch = null;
  if (!batch || batch.buckets.size === 0) {
    return { meshes: [], bounceSources: [] };
  }

  const prepared = [];
  let mergeFailed = false;
  batch.buckets.forEach((bucket) => {
    if (mergeFailed) return;
    let geometry = null;
    try {
      geometry = bucket.geometries.length === 1
        ? bucket.geometries[0]
        : mergeGeometries(bucket.geometries, false);
    } catch {
      geometry = null;
    }
    if (!geometry) {
      mergeFailed = true;
      return;
    }
    prepared.push({ bucket, geometry });
  });

  if (mergeFailed) {
    prepared.forEach(({ bucket, geometry }) => {
      if (bucket.geometries.length > 1) geometry.dispose();
    });
    batch.buckets.forEach((bucket) => {
      bucket.geometries.forEach((geometry) => geometry.dispose());
    });
    batch.sourceEntries.forEach(({ object, radiusPadding }) => {
      scene.add(object);
      registerStaticCullable(object, radiusPadding);
    });
    return { meshes: [], bounceSources: [] };
  }

  const meshes = [];
  let meshIndex = 0;
  prepared.forEach(({ bucket, geometry }) => {
    if (bucket.geometries.length > 1) {
      bucket.geometries.forEach((sourceGeometry) => sourceGeometry.dispose());
    }
    const mesh = createStaticDecorationBatchMesh(geometry, bucket, meshIndex);
    scene.add(mesh);
    registerStaticCullable(mesh, bucket.radiusPadding);
    meshes.push(mesh);
    meshIndex += 1;
  });
  return {
    meshes,
    bounceSources: batch.bounceSources
  };
}

function createStaticDecorationBatchMesh(geometry, bucket, index) {
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, bucket.material);
  mesh.name = `StaticDecorationBatch:${bucket.chunkX}:${bucket.chunkZ}:${index}`;
  mesh.castShadow = bucket.castShadow;
  mesh.receiveShadow = bucket.receiveShadow;
  mesh.renderOrder = bucket.renderOrder;
  mesh.layers.mask = bucket.layersMask;
  mesh.userData.isStaticDecorationBatch = true;
  mesh.userData.sourceMeshCount = bucket.sourceMeshCount;
  mesh.userData.sourceObjectCount = bucket.sourceObjects.size;
  return mesh;
}

function registerStaticCullable(object, radiusPadding = STATIC_WORLD_CULL_RADIUS_PADDING) {
  const list = activeStaticCullables;
  if (!list || !object) return;

  object.updateWorldMatrix(true, true);
  STATIC_CULL_BOX.setFromObject(object);
  if (STATIC_CULL_BOX.isEmpty()) return;

  STATIC_CULL_BOX.getCenter(STATIC_CULL_CENTER);
  STATIC_CULL_BOX.getSize(STATIC_CULL_SIZE);
  const radius = Math.max(
    STATIC_WORLD_CULL_MIN_RADIUS,
    STATIC_CULL_SIZE.length() * 0.5 + radiusPadding
  );
  list.push({
    object,
    center: STATIC_CULL_CENTER.clone(),
    radius,
    visible: true
  });
}

function createStaticWorldCulling(cullables = []) {
  return {
    cullables,
    visibleCount: cullables.length,
    timer: 0,
    update(dt = 0, camera = null, { forceStaticCulling = false } = {}) {
      if (!camera || cullables.length === 0) return;
      this.timer -= dt;
      if (!forceStaticCulling && this.timer > 0) return;
      this.timer = STATIC_WORLD_CULL_UPDATE_SECONDS;

      camera.updateMatrixWorld();
      STATIC_CULL_MATRIX.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      STATIC_CULL_FRUSTUM.setFromProjectionMatrix(STATIC_CULL_MATRIX);

      let visibleCount = 0;
      for (let i = 0; i < cullables.length; i += 1) {
        const item = cullables[i];
        STATIC_CULL_SPHERE.center.copy(item.center);
        STATIC_CULL_SPHERE.radius = item.radius;
        const visible = STATIC_CULL_FRUSTUM.intersectsSphere(STATIC_CULL_SPHERE);
        if (item.visible !== visible) {
          item.object.visible = visible;
          item.visible = visible;
        }
        if (visible) visibleCount += 1;
      }
      this.visibleCount = visibleCount;
    }
  };
}

function createSpikeTrapModel(trap) {
  const group = new THREE.Group();
  const radius = trap.radius ?? 1.25;
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.05, 0.08, 8),
    mat('#343534', { roughness: 0.96 })
  );
  plate.position.y = 0.04;
  group.add(plate);

  const spikeMat = mat('#9aa09a', { metalness: 0.12, roughness: 0.72 });
  for (let i = 0; i < 9; i += 1) {
    const ring = i === 0 ? 0 : radius * (i < 5 ? 0.36 : 0.68);
    const angle = i === 0 ? 0 : (i / 8) * Math.PI * 2;
    const spike = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.42, 5),
      spikeMat
    );
    spike.position.set(Math.cos(angle) * ring, 0.28, Math.sin(angle) * ring);
    spike.rotation.y = angle;
    group.add(spike);
  }

  enableDecorationShadows(group);
  return group;
}

function createFireVentModel(trap) {
  const group = new THREE.Group();
  const radius = trap.radius ?? 1.2;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.08, 0.1, 10),
    mat('#2f3030', { roughness: 0.95 })
  );
  const grate = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.58, radius * 0.65, 0.045, 8),
    mat('#12110f', { roughness: 0.85 })
  );
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.52, 24),
    basicMat('#ff7a26', {
      transparent: true,
      opacity: 0.46,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone()
  );
  base.position.y = 0.05;
  grate.position.y = 0.12;
  glow.position.y = 0.145;
  glow.rotation.x = -Math.PI / 2;
  group.add(base, grate, glow);
  enableDecorationShadows(group);
  return group;
}

function createTorchModel() {
  const group = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.075, 1.6, 6),
    mat('#4f3322')
  );
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.12, 0.18, 6),
    mat('#2b2520')
  );
  const flameOuter = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.48, 6),
    basicMat('#ff7b2e', {
      transparent: true,
      opacity: 0.86
    }).clone()
  );
  const flameInner = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.36, 6),
    basicMat('#ffd35a', {
      transparent: true,
      opacity: 0.92
    }).clone()
  );
  post.position.y = 0.8;
  bowl.position.y = 1.66;
  flameOuter.position.y = 2.02;
  flameInner.position.y = 2.04;
  group.add(post, bowl, flameOuter, flameInner);
  enableDecorationShadows(group);
  return group;
}

function createCrystalClusterModel(scale = 1, color = '#8cff5f') {
  const group = new THREE.Group();
  const crystalMat = mat(color, {
    roughness: 0.42,
    emissive: color,
    emissiveIntensity: 0.65,
    transparent: true,
    opacity: 0.92
  }).clone();
  const baseMat = mat('#2d3032', { roughness: 0.95 });
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.58 * scale, 0.68 * scale, 0.18 * scale, 7),
    baseMat
  );
  base.position.y = 0.09 * scale;
  group.add(base);

  const crystals = [
    { x: 0, z: 0, h: 1.15, r: 0.18, rot: 0.1 },
    { x: -0.28, z: 0.08, h: 0.78, r: 0.13, rot: -0.28 },
    { x: 0.26, z: -0.12, h: 0.72, r: 0.12, rot: 0.36 },
    { x: 0.12, z: 0.28, h: 0.52, r: 0.1, rot: -0.12 }
  ];
  crystals.forEach((item) => {
    const crystal = new THREE.Mesh(
      new THREE.ConeGeometry(item.r * scale, item.h * scale, 5),
      crystalMat
    );
    crystal.position.set(item.x * scale, 0.18 * scale + item.h * scale * 0.5, item.z * scale);
    crystal.rotation.z = item.rot;
    crystal.rotation.y = item.rot * 2.4;
    group.add(crystal);
  });

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.15 * scale, 30),
    basicMat(color, {
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone()
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.035;
  glow.renderOrder = 8;
  group.add(glow);
  enableDecorationShadows(group);
  return group;
}

function createRibBonesModel(scale = 1) {
  const group = new THREE.Group();
  const boneMat = mat('#c5bda4', { roughness: 0.86 });
  const darkBone = mat('#8f876f', { roughness: 0.9 });
  for (let i = 0; i < 5; i += 1) {
    const z = (-0.75 + i * 0.36) * scale;
    const left = cylinderBetween(
      new THREE.Vector3(-0.08 * scale, 0.12 * scale, z),
      new THREE.Vector3(-0.72 * scale, 0.42 * scale, z + 0.08 * scale),
      0.04 * scale,
      0.03 * scale,
      boneMat
    );
    const right = cylinderBetween(
      new THREE.Vector3(0.08 * scale, 0.12 * scale, z),
      new THREE.Vector3(0.72 * scale, 0.42 * scale, z + 0.08 * scale),
      0.04 * scale,
      0.03 * scale,
      boneMat
    );
    group.add(left, right);
  }
  const spine = cylinderBetween(
    new THREE.Vector3(0, 0.11 * scale, -0.98 * scale),
    new THREE.Vector3(0, 0.13 * scale, 0.98 * scale),
    0.055 * scale,
    0.05 * scale,
    darkBone
  );
  group.add(spine);
  enableDecorationShadows(group);
  return group;
}

function createGiantBeastSkeletonModel(scale = 1) {
  const group = new THREE.Group();
  const boneMat = mat('#cbbf9d', { roughness: 0.9 });
  const oldBone = mat('#8d8065', { roughness: 0.94 });

  const spine = cylinderBetween(
    new THREE.Vector3(0, 0.18 * scale, -1.65 * scale),
    new THREE.Vector3(0, 0.18 * scale, 1.55 * scale),
    0.07 * scale,
    0.06 * scale,
    oldBone
  );
  group.add(spine);

  for (let i = 0; i < 7; i += 1) {
    const z = (-1.1 + i * 0.34) * scale;
    const width = (0.62 + Math.sin((i / 6) * Math.PI) * 0.62) * scale;
    const height = (0.28 + Math.sin((i / 6) * Math.PI) * 0.34) * scale;
    group.add(
      cylinderBetween(
        new THREE.Vector3(-0.04 * scale, 0.2 * scale, z),
        new THREE.Vector3(-width, height, z + 0.08 * scale),
        0.045 * scale,
        0.028 * scale,
        boneMat
      ),
      cylinderBetween(
        new THREE.Vector3(0.04 * scale, 0.2 * scale, z),
        new THREE.Vector3(width, height, z + 0.08 * scale),
        0.045 * scale,
        0.028 * scale,
        boneMat
      )
    );
  }

  const skull = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.34 * scale, 0),
    boneMat
  );
  skull.position.set(0, 0.26 * scale, 1.92 * scale);
  skull.scale.set(1.15, 0.72, 1.38);
  const jaw = new THREE.Mesh(
    new THREE.BoxGeometry(0.46 * scale, 0.12 * scale, 0.34 * scale),
    oldBone
  );
  jaw.position.set(0, 0.15 * scale, 2.18 * scale);
  const hornLeft = cylinderBetween(
    new THREE.Vector3(-0.24 * scale, 0.38 * scale, 1.88 * scale),
    new THREE.Vector3(-0.72 * scale, 0.58 * scale, 2.2 * scale),
    0.045 * scale,
    0.018 * scale,
    boneMat
  );
  const hornRight = cylinderBetween(
    new THREE.Vector3(0.24 * scale, 0.38 * scale, 1.88 * scale),
    new THREE.Vector3(0.72 * scale, 0.58 * scale, 2.2 * scale),
    0.045 * scale,
    0.018 * scale,
    boneMat
  );
  group.add(skull, jaw, hornLeft, hornRight);

  [
    [-0.9, -1.28, -1.4, -2.05],
    [0.9, -1.28, 1.4, -2.05],
    [-0.88, 1.12, -1.34, 1.72],
    [0.88, 1.12, 1.34, 1.72]
  ].forEach(([x0, z0, x1, z1]) => {
    group.add(cylinderBetween(
      new THREE.Vector3(x0 * scale, 0.14 * scale, z0 * scale),
      new THREE.Vector3(x1 * scale, 0.2 * scale, z1 * scale),
      0.065 * scale,
      0.05 * scale,
      oldBone
    ));
  });

  group.scale.y = 0.92;
  enableDecorationShadows(group);
  return group;
}

function createCampfireModel(scale = 1) {
  const group = new THREE.Group();
  const stoneMat = mat('#4a4542', { roughness: 0.95 });
  const logMat = mat('#5a3928', { roughness: 0.86 });
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.11 * scale, 0),
      stoneMat
    );
    stone.position.set(
      Math.cos(angle) * 0.58 * scale,
      0.08 * scale,
      Math.sin(angle) * 0.58 * scale
    );
    group.add(stone);
  }
  for (let i = 0; i < 3; i += 1) {
    const log = new THREE.Mesh(
      new THREE.BoxGeometry(0.18 * scale, 0.16 * scale, 0.9 * scale),
      logMat
    );
    log.position.y = 0.16 * scale;
    log.rotation.y = (i / 3) * Math.PI;
    group.add(log);
  }
  const fireOuter = new THREE.Mesh(
    new THREE.ConeGeometry(0.28 * scale, 0.78 * scale, 6),
    basicMat('#ff7336', {
      transparent: true,
      opacity: 0.82,
      depthWrite: false
    }).clone()
  );
  const fireInner = new THREE.Mesh(
    new THREE.ConeGeometry(0.16 * scale, 0.58 * scale, 6),
    basicMat('#ffd55f', {
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    }).clone()
  );
  fireOuter.position.y = 0.58 * scale;
  fireInner.position.y = 0.56 * scale;
  fireInner.rotation.y = 0.3;
  group.add(fireOuter, fireInner);
  enableDecorationShadows(group);
  return group;
}

function createCactusModel(scale = 1) {
  const group = new THREE.Group();
  const cactusMat = mat('#3f7b55', { roughness: 0.88 });
  const darkMat = mat('#2e5f43', { roughness: 0.9 });
  const height = 1.4 * scale;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16 * scale, 0.18 * scale, height, 7),
    cactusMat
  );
  trunk.position.y = height * 0.5;
  const crown = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.18 * scale, 0),
    cactusMat
  );
  crown.position.y = height + 0.06 * scale;
  group.add(trunk, crown);

  const leftArm = cylinderBetween(
    new THREE.Vector3(-0.12 * scale, height * 0.52, 0),
    new THREE.Vector3(-0.52 * scale, height * 0.68, 0),
    0.07 * scale,
    0.065 * scale,
    darkMat
  );
  const leftTop = cylinderBetween(
    new THREE.Vector3(-0.52 * scale, height * 0.68, 0),
    new THREE.Vector3(-0.52 * scale, height * 0.9, 0),
    0.065 * scale,
    0.058 * scale,
    darkMat
  );
  const rightArm = cylinderBetween(
    new THREE.Vector3(0.12 * scale, height * 0.62, 0),
    new THREE.Vector3(0.48 * scale, height * 0.76, 0),
    0.065 * scale,
    0.06 * scale,
    cactusMat
  );
  const rightTop = cylinderBetween(
    new THREE.Vector3(0.48 * scale, height * 0.76, 0),
    new THREE.Vector3(0.48 * scale, height * 0.98, 0),
    0.06 * scale,
    0.052 * scale,
    cactusMat
  );
  group.add(leftArm, leftTop, rightArm, rightTop);
  enableDecorationShadows(group);
  return group;
}

function createTerrainEllipseMesh(zone, material, offset = 0.06, segments = 18) {
  const positions = [
    zone.x,
    terrainHeightAt(zone.x, zone.z) + offset,
    zone.z
  ];
  const indices = [];

  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const point = ellipseBoundaryPoint(zone, angle);
    const x = point.x;
    const z = point.z;
    positions.push(x, terrainHeightAt(x, z) + offset, z);
  }

  for (let i = 1; i <= segments; i += 1) {
    indices.push(0, i, i + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function enableDecorationShadows(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return root;
}

function beginBakedGroundShadows(scene) {
  activeBakedShadowBatch = {
    scene,
    enabled: worldConfig().sky?.bakedShadows === true,
    shadowMaskEnabled: shouldUseGroundShadowMask(),
    shadowMaskTexture: null,
    shadowMaskReceivers: [],
    chunks: new Map()
  };
}

function registerShadowMaskReceiver(object) {
  const batch = activeBakedShadowBatch;
  if (!batch?.enabled || !batch.shadowMaskEnabled || !object) return;
  batch.shadowMaskReceivers.push(object);
}

function bakeObjectGroundShadow(object) {
  const batch = activeBakedShadowBatch;
  if (!batch?.enabled || !object) return null;

  object.updateWorldMatrix(true, true);
  BAKED_SHADOW_BOX.setFromObject(object);
  if (BAKED_SHADOW_BOX.isEmpty()) return null;
  BAKED_SHADOW_BOX.getCenter(BAKED_SHADOW_CENTER);
  const chunk = bakedShadowChunkFor(BAKED_SHADOW_CENTER.x, BAKED_SHADOW_CENTER.z);

  object.traverse((node) => {
    if (!node.isMesh || node.userData?.skipBakedShadow) return;
    const geometry = node.geometry;
    const position = geometry?.attributes?.position;
    if (!position) return;
    const index = geometry.index;
    const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(position.count / 3);
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const ia = index ? index.getX(triangle * 3) : triangle * 3;
      const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
      const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
      addBakedShadowTriangle(chunk, node, position, ia, ib, ic);
    }
  });

  return batch;
}

function flushBakedGroundShadows(ground = null) {
  const batch = activeBakedShadowBatch;
  activeBakedShadowBatch = null;
  const triangleCount = countBakedShadowTriangles(batch);
  if (!batch?.enabled || batch.chunks.size === 0) {
    return { meshes: [], texture: null, triangleCount };
  }
  if (batch.shadowMaskEnabled && ground) {
    const texture = createGroundShadowMaskTexture(batch);
    if (texture) {
      applyShadowMaskTexture(ground, texture);
      batch.shadowMaskReceivers.forEach((receiver) => {
        applyShadowMaskTexture(receiver, texture);
      });
      return { meshes: [], texture, triangleCount };
    }
  }
  const theme = worldConfig().theme ?? 'snow';
  const color = theme === 'red-desert'
    ? '#2a1412'
    : theme === 'dungeon'
      ? '#050407'
      : '#263233';
  const opacity = theme === 'dungeon' ? 0.24 : theme === 'red-desert' ? 0.2 : 0.17;
  const material = basicMat(color, {
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const meshes = [];
  batch.chunks.forEach((chunk, key) => {
    if (chunk.positions.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(chunk.positions, 3));
    geometry.setIndex(chunk.indices);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `BakedProjectedShadows:${key}`;
    mesh.renderOrder = 1;
    batch.scene.add(mesh);
    meshes.push(mesh);
  });
  return { meshes, texture: null, triangleCount };
}

function applyShadowMaskTexture(object, texture) {
  if (!object?.material || !texture) return;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  const nextMaterials = materials.map((material) => {
    if (!material) return material;
    const next = material.clone();
    next.map = texture;
    next.needsUpdate = true;
    return next;
  });
  object.material = Array.isArray(object.material) ? nextMaterials : nextMaterials[0];
}

function countBakedShadowTriangles(batch) {
  if (!batch?.enabled) return 0;
  let count = 0;
  batch.chunks.forEach((chunk) => {
    count += chunk.triangles?.length ?? 0;
  });
  return count;
}

function shouldUseGroundShadowMask() {
  const config = worldConfig();
  return SHADOW_MASK_SCENE_KEYS.has(config.sceneKey);
}

function createGroundShadowMaskTexture(batch) {
  const config = worldConfig();
  const width = SHADOW_MASK_WIDTH;
  const height = Math.min(
    SHADOW_MASK_MAX_HEIGHT,
    Math.max(256, Math.round(width * (config.ground.depth / Math.max(1, config.ground.width))))
  );
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d');
  if (!maskCtx) return null;

  maskCtx.clearRect(0, 0, width, height);
  maskCtx.fillStyle = SHADOW_MASK_COLOR;
  maskCtx.globalAlpha = 1;
  batch.chunks.forEach((chunk) => {
    for (let i = 0; i < chunk.triangles.length; i += 1) {
      drawShadowMaskTriangle(maskCtx, chunk.triangles[i], width, height, config);
    }
  });

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = width;
  finalCanvas.height = height;
  const finalCtx = finalCanvas.getContext('2d');
  if (!finalCtx) return null;

  finalCtx.fillStyle = '#fff';
  finalCtx.fillRect(0, 0, width, height);
  finalCtx.save();
  finalCtx.globalAlpha = SHADOW_MASK_SOFT_ALPHA;
  finalCtx.filter = `blur(${SHADOW_MASK_BLUR_PX}px)`;
  finalCtx.drawImage(maskCanvas, 0, 0);
  finalCtx.restore();
  finalCtx.globalAlpha = SHADOW_MASK_CONTACT_ALPHA;
  finalCtx.drawImage(maskCanvas, 0, 0);
  finalCtx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(finalCanvas);
  texture.name = `${config.sceneKey}-shadow-mask`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function drawShadowMaskTriangle(ctx, triangle, width, height, config) {
  const a = shadowMaskCanvasPoint(triangle.ax, triangle.az, width, height, config);
  const b = shadowMaskCanvasPoint(triangle.bx, triangle.bz, width, height, config);
  const c = shadowMaskCanvasPoint(triangle.cx, triangle.cz, width, height, config);
  if (
    (a.x < -2 && b.x < -2 && c.x < -2) ||
    (a.x > width + 2 && b.x > width + 2 && c.x > width + 2) ||
    (a.y < -2 && b.y < -2 && c.y < -2) ||
    (a.y > height + 2 && b.y > height + 2 && c.y > height + 2)
  ) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.closePath();
  ctx.fill();
}

function shadowMaskCanvasPoint(x, z, width, height, config) {
  const u = clamp((x + config.ground.width * 0.5) / config.ground.width, 0, 1);
  const v = clamp((z + config.ground.depth * 0.5) / config.ground.depth, 0, 1);
  return {
    x: u * width,
    y: (1 - v) * height
  };
}

function bakedShadowChunkFor(x, z) {
  const batch = activeBakedShadowBatch;
  const cx = Math.floor(x / BAKED_SHADOW_CHUNK_SIZE);
  const cz = Math.floor(z / BAKED_SHADOW_CHUNK_SIZE);
  const key = `${cx}:${cz}`;
  let chunk = batch.chunks.get(key);
  if (!chunk) {
    chunk = {
      positions: [],
      indices: [],
      triangles: []
    };
    batch.chunks.set(key, chunk);
  }
  return chunk;
}

function addBakedShadowTriangle(chunk, node, position, ia, ib, ic) {
  BAKED_SHADOW_WORLD_A.fromBufferAttribute(position, ia).applyMatrix4(node.matrixWorld);
  BAKED_SHADOW_WORLD_B.fromBufferAttribute(position, ib).applyMatrix4(node.matrixWorld);
  BAKED_SHADOW_WORLD_C.fromBufferAttribute(position, ic).applyMatrix4(node.matrixWorld);

  BAKED_SHADOW_EDGE_A.subVectors(BAKED_SHADOW_WORLD_B, BAKED_SHADOW_WORLD_A);
  BAKED_SHADOW_EDGE_B.subVectors(BAKED_SHADOW_WORLD_C, BAKED_SHADOW_WORLD_A);
  BAKED_SHADOW_NORMAL.crossVectors(BAKED_SHADOW_EDGE_A, BAKED_SHADOW_EDGE_B);
  if (BAKED_SHADOW_NORMAL.lengthSq() <= 0.000001) return;
  BAKED_SHADOW_NORMAL.normalize();
  if (BAKED_SHADOW_NORMAL.dot(BAKED_SHADOW_TO_SUN) <= 0.05) return;

  projectBakedShadowPoint(BAKED_SHADOW_WORLD_A, BAKED_SHADOW_PROJECTED_A);
  projectBakedShadowPoint(BAKED_SHADOW_WORLD_B, BAKED_SHADOW_PROJECTED_B);
  projectBakedShadowPoint(BAKED_SHADOW_WORLD_C, BAKED_SHADOW_PROJECTED_C);

  BAKED_SHADOW_EDGE_A.subVectors(BAKED_SHADOW_PROJECTED_B, BAKED_SHADOW_PROJECTED_A);
  BAKED_SHADOW_EDGE_B.subVectors(BAKED_SHADOW_PROJECTED_C, BAKED_SHADOW_PROJECTED_A);
  if (BAKED_SHADOW_EDGE_A.cross(BAKED_SHADOW_EDGE_B).lengthSq() < BAKED_SHADOW_MIN_TRIANGLE_AREA) return;

  const baseIndex = chunk.positions.length / 3;
  chunk.positions.push(
    BAKED_SHADOW_PROJECTED_A.x,
    BAKED_SHADOW_PROJECTED_A.y,
    BAKED_SHADOW_PROJECTED_A.z,
    BAKED_SHADOW_PROJECTED_B.x,
    BAKED_SHADOW_PROJECTED_B.y,
    BAKED_SHADOW_PROJECTED_B.z,
    BAKED_SHADOW_PROJECTED_C.x,
    BAKED_SHADOW_PROJECTED_C.y,
    BAKED_SHADOW_PROJECTED_C.z
  );
  chunk.indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
  chunk.triangles.push({
    ax: BAKED_SHADOW_PROJECTED_A.x,
    az: BAKED_SHADOW_PROJECTED_A.z,
    bx: BAKED_SHADOW_PROJECTED_B.x,
    bz: BAKED_SHADOW_PROJECTED_B.z,
    cx: BAKED_SHADOW_PROJECTED_C.x,
    cz: BAKED_SHADOW_PROJECTED_C.z
  });
}

function projectBakedShadowPoint(source, target) {
  target.copy(source);
  for (let i = 0; i < 3; i += 1) {
    const groundY = terrainHeightAt(target.x, target.z) + BAKED_SHADOW_SURFACE_OFFSET;
    const t = Math.max(0, (groundY - source.y) / BAKED_SHADOW_LIGHT_RAY.y);
    target.copy(source).addScaledVector(BAKED_SHADOW_LIGHT_RAY, t);
  }
  target.y = terrainHeightAt(target.x, target.z) + BAKED_SHADOW_SURFACE_OFFSET;
  return target;
}

function cylinderBetween(start, end, radiusStart, radiusEnd, material) {
  const center = start.clone().lerp(end, 0.5);
  const direction = end.clone().sub(start);
  const object = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusEnd, radiusStart, direction.length(), 6),
    material
  );
  object.position.copy(center);
  object.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize()
  );
  return object;
}

function placeOnTerrain(object, x, z, offset = 0) {
  object.position.set(x, terrainHeightAt(x, z) + offset, z);
}

function normalizedEllipseDistanceAt(x, z, ellipse) {
  const rot = ellipse.rot ?? 0;
  const cos = Math.cos(-rot);
  const sin = Math.sin(-rot);
  const dx = x - ellipse.x;
  const dz = z - ellipse.z;
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const rx = Math.max(0.1, ellipse.rx ?? ellipse.radius ?? 1);
  const rz = Math.max(0.1, ellipse.rz ?? ellipse.radius ?? rx);
  return Math.sqrt((localX * localX) / (rx * rx) + (localZ * localZ) / (rz * rz));
}

function randomPointInEllipse(zone, random) {
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(random());
  const localX = Math.cos(angle) * zone.rx * radius;
  const localZ = Math.sin(angle) * zone.rz * radius;
  const rot = zone.rot ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return {
    x: zone.x + localX * cos - localZ * sin,
    z: zone.z + localX * sin + localZ * cos
  };
}

function isDecorationClear(x, z, pathPoints, clearance) {
  const config = worldConfig();
  if (config.landmass && landmassMaskAt(x, z) < 0.68) return false;
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

function landmassMaskAt(x, z) {
  const config = worldConfig();
  const landmass = config.landmass;
  if (!landmass) return 1;
  const inner = landmass.shoreInner ?? 0.78;
  const outer = landmass.shoreOuter ?? 1.04;
  let mask = 0;
  (landmass.lobes ?? []).forEach((lobe) => {
    const distance = landmassNormalizedDistanceAt(x, z, lobe);
    mask = Math.max(mask, 1 - smoothstep(inner, outer, distance));
  });
  (landmass.bays ?? []).forEach((bay) => {
    mask -= ellipseFalloffAt(x, z, bay, 0, 1) * (bay.carve ?? 0.72);
  });

  const pathDistance = distanceToPath(x, z, rawPathPoints());
  const roadReserve = 1 - smoothstep(
    (config.pathWidth ?? BALANCE.world.pathWidth) + 1.7,
    (config.pathWidth ?? BALANCE.world.pathWidth) + 7.6,
    pathDistance
  );
  const base = config.playerBasePosition;
  const camp = config.enemyCampPosition;
  const baseReserve = 1 - smoothstep(9, 16, Math.hypot(x - base.x, z - base.z));
  const campReserve = 1 - smoothstep(7, 14, Math.hypot(x - camp.x, z - camp.z));
  const clearingReserve = (config.clearings ?? []).reduce((best, clearing) => (
    Math.max(best, 1 - smoothstep(clearing.r * 0.72, clearing.r + 3, Math.hypot(x - clearing.x, z - clearing.z)))
  ), 0);

  return clamp(Math.max(
    mask,
    roadReserve * 0.9,
    baseReserve,
    campReserve,
    clearingReserve * 0.72
  ), 0, 1);
}

function landmassNormalizedDistanceAt(x, z, ellipse) {
  const rot = ellipse.rot ?? 0;
  const cos = Math.cos(-rot);
  const sin = Math.sin(-rot);
  const dx = x - ellipse.x;
  const dz = z - ellipse.z;
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const rx = Math.max(0.1, ellipse.rx ?? ellipse.radius ?? 1);
  const rz = Math.max(0.1, ellipse.rz ?? ellipse.radius ?? rx);
  const angle = Math.atan2(localZ / rz, localX / rx);
  const edgeScale = irregularEllipseScaleAt(ellipse, angle);
  return Math.sqrt(
    (localX * localX) / ((rx * edgeScale) * (rx * edgeScale)) +
    (localZ * localZ) / ((rz * edgeScale) * (rz * edgeScale))
  );
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
  return projectToSegment2D(x, z, a, b).distance;
}

function projectToSegment2D(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 0.0001) {
    return {
      t: 0,
      x: a.x,
      z: a.z,
      distance: Math.hypot(x - a.x, z - a.z)
    };
  }
  const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1);
  const px = a.x + dx * t;
  const pz = a.z + dz * t;
  return {
    t,
    x: px,
    z: pz,
    distance: Math.hypot(x - px, z - pz)
  };
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
