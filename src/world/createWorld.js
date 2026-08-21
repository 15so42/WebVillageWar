import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';


function applyGroundShader(material, { storybookSnow = false } = {}) {
  // 雪谷地面不做全局暖色染：冷暖对比交给方向光（暖）与半球光（冷），
  // 全场乘暖色会让阴影面也变橙，丢失参考图的向阳/背光层次
  const warmTintChunk = '';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `
      varying vec3 vWorldPos;
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
      float snoise(vec3 v) {
        const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy) );
        vec3 x0 = v - i + dot(i, C.xxx) ;
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute( permute( permute(
                   i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                 + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                 + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
        float n_ = 0.142857142857;
        vec3  ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;
        vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
      }
      ${shader.vertexShader}
    `.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      // In local coordinates before rotation, Z is height. 
      // After -PI/2 X rotation, Z points up in world space.
      // So modifying transformed.z alters height.
      float noiseHeight = snoise(vWorldPos * 0.08);
      transformed.z += noiseHeight * 0.12; // Height variation <= 3%
      `
    );

    shader.fragmentShader = `
      varying vec3 vWorldPos;
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
      float snoise(vec3 v) {
        const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy) );
        vec3 x0 = v - i + dot(i, C.xxx) ;
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute( permute( permute(
                   i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                 + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                 + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
        float n_ = 0.142857142857;
        vec3  ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;
        vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
      }
      ${shader.fragmentShader}
    `.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float noiseColor = snoise(vWorldPos * 0.08);
      diffuseColor.rgb *= 1.0;
      ${warmTintChunk}
      `
    ).replace(
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(0.86, 0.98, noiseColor * 0.5 + 0.5);
      `
    );
  };
  return material;
}

function applyCliffShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `
      varying float vNoiseVal;
      varying vec3 vWorldNormal;

      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
      float snoise(vec3 v) {
        const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy) );
        vec3 x0 = v - i + dot(i, C.xxx) ;
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute( permute( permute(
                   i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                 + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                 + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
        float n_ = 0.142857142857;
        vec3  ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;
        vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
      }
      ${shader.vertexShader}
    `.replace(
      '#include <worldpos_vertex>',
      `
      #include <worldpos_vertex>
      vec3 wPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      // Low-frequency noise with discrete jump between polygons due to world normal term
      vNoiseVal = snoise(wPos * 0.015 + vWorldNormal * 0.25);
      `
    );

    shader.fragmentShader = `
      varying float vNoiseVal;
      varying vec3 vWorldNormal;
      ${shader.fragmentShader}
    `.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      diffuseColor.rgb *= 1.0 + vNoiseVal * 0.05;

      // Facing-color adjustment based on world normal
      vec3 normalForFacing = normalize(vWorldNormal);
      float facingUp = normalForFacing.y;
      vec3 facingModifier = vec3(1.0);
      if (facingUp > 0.0) {
        // Top faces: increase warm color and brightness slightly
        facingModifier += vec3(0.08, 0.05, 0.02) * facingUp;
      } else {
        // Bottom/backlit faces: decrease brightness, increase cold color (blue/purple)
        float facingDown = -facingUp;
        facingModifier -= vec3(0.12, 0.10, 0.04) * facingDown;
      }
      diffuseColor.rgb *= facingModifier;
      `
    );
  };
  return material;
}

import { BALANCE } from '../data/gameData.js';
import {
  bakeWarmLighting,
  basicMat,
  createBaseModel,
  createBannerTotemModel,
  createBush,
  createCloudModel,
  createCottageModel,
  createEnemyCampModel,
  createGrassTuft,
  createMonsterCampModel,
  createMountainPeak,
  createRock,
  createGuardFlag,
  createSnowPine,
  mat
} from '../art/lowpoly.js';
import { clamp, seededRandom } from '../utils/math.js';
import { NavigationGrid } from './NavigationGrid.js';

const FOREST_ZONES = [
  { x: -31, z: 19, rx: 11, rz: 17, count: 90, tone: 'deep', raggedness: 0.6 },
  { x: 31, z: 13, rx: 10, rz: 15, count: 80, tone: 'warm', raggedness: 0.5 },
  { x: -30, z: -10, rx: 12, rz: 18, count: 90, tone: 'deep', raggedness: 0.7 },
  { x: 30, z: -18, rx: 12, rz: 17, count: 80, tone: 'cool', raggedness: 0.5 },
  { x: -10, z: -32, rx: 18, rz: 9, count: 60, tone: 'snow', raggedness: 0.8 },
  { x: 15, z: -33, rx: 16, rz: 8, count: 50, tone: 'snow', raggedness: 0.8 }
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
const WORLD_NAV_LAND_WALK_THRESHOLD = 0.5;
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
let activeAnimatedDecorations = null;

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

// 第一关只容纳雪山山谷的一小段，边界因此表现为被镜头裁切的山腰与断崖，
// 而不是一圈缩小后的完整山峰。相邻段沿 Z 轴互相压叠，顶部继续向地图外侧抬升。
const SNOW_VALLEY_CLIFF_SECTIONS = [
  // 左壁较高、较暗；三段在纵向交叠，但朝谷内的边缘前后错开。
  { side: 'left', faceX: -21.5, z: 26, length: 33, depth: 25, height: 17.5, rot: 0.025, profile: 'overhang', foothill: { inset: 8.0, along: 7.2, length: 18, depth: 10.0, height: 3.8 } },
  { side: 'left', faceX: -24.5, z: 1, length: 34, depth: 24, height: 15.4, rot: -0.035, profile: 'sheer' },
  { side: 'left', faceX: -24.0, z: -28, length: 31, depth: 24, height: 16.2, rot: 0.04, profile: 'terraced', foothill: { inset: 5.2, along: 7.0, length: 14, depth: 9.0, height: 3.6 } },
  // 右壁略低且更破碎，给护盾祭坛留出完整前庭；远端重新抬高以框住敌营。
  { side: 'right', faceX: 21.5, z: 27, length: 32, depth: 23, height: 14.0, rot: -0.035, profile: 'terraced', foothill: { inset: 8.0, along: -7.5, length: 17, depth: 9.5, height: 3.5 } },
  { side: 'right', faceX: 24.5, z: 3, length: 33, depth: 24, height: 13.2, rot: 0.03, profile: 'sheer' },
  { side: 'right', faceX: 24.0, z: -28, length: 32, depth: 24, height: 15.2, rot: -0.045, profile: 'overhang', foothill: { inset: 5.4, along: -7.0, length: 14, depth: 9.2, height: 3.5 } }
];

// 雪谷重设计：战场内不再有山体台地，只留低矮雪覆岩堆作掩体与视线锚点；
// 大雪山退到地图边缘当远景轮廓（见 createDistantSnowMountains）。
// coreHeight 这里表示岩堆主石尺寸，半径控制散布范围与阻挡区
const SNOW_VALLEY_ROCK_CLUSTERS = [
  // 左翼
  { x: -26, z: 26, radius: 4.8, coreHeight: 2.4, cluster: true, watchtower: true },
  { x: -24, z: 10, radius: 4.2, coreHeight: 1.9, cluster: true },
  { x: -28, z: -12, radius: 5.2, coreHeight: 2.2, cluster: true },
  { x: -20, z: -30, radius: 4.0, coreHeight: 1.8, cluster: true },
  // 右翼（与左翼错位，不做镜像）
  { x: 24, z: 18, radius: 4.4, coreHeight: 2.0, cluster: true },
  { x: 30, z: 2, radius: 5.0, coreHeight: 2.3, cluster: true, watchtower: true },
  { x: 20, z: -13, radius: 3.8, coreHeight: 1.7, cluster: true },
  { x: 27, z: -33, radius: 4.6, coreHeight: 2.1, cluster: true },
  // 内侧小岩堆：压出战斗口袋，大小不均避免等距感
  { x: -17, z: 12, radius: 3.4, coreHeight: 1.5, cluster: true },
  { x: 14, z: 22, radius: 3.2, coreHeight: 1.4, cluster: true },
  { x: -13, z: -24, radius: 3.5, coreHeight: 1.6, cluster: true }
];

// 雪主题三张地图共用山地区数据：雪谷走低岩堆方案，其余地图保留原山体台地
function snowHillZones(sceneKey = worldConfig().sceneKey) {
  return sceneKey === 'snow-valley' ? SNOW_VALLEY_CLIFF_SECTIONS : SNOW_VALLEY_HILL_ZONES;
}

const WORLD_PRESETS = {
  'snow-valley': {
    sceneKey: 'snow-valley',
    seed: 42,
    // 第一关保留原有规则与坐标，但场景重构为“林海上的悬崖山城”。
    // 战斗发生在高架山脊，低处林海与崖边建筑共同取代旧雪谷边墙。
    ridgeVillage: {
      plateauTop: 6.1,
      forestFloor: -12.4,
      pathHalfWidth: 10.6,
      edgeBlend: 2.7,
      cliffColor: '#f3f1ea',
      cliffShade: '#d6d2c8',
      cliffDeep: '#9ca29f',
      grass: '#78ad46',
      grassLight: '#a4c95d',
      forestDark: '#123f3c',
      forestMid: '#1f6557',
      forestLight: '#4f8f68',
      spurs: [
        { from: { x: -19, z: 2 }, to: { x: 3, z: 2 }, halfWidth: 3.8 }
      ]
    },
    // 俯视纵向观察整条悬崖聚落，略抬高目标以保留山体落差。
    camera: {
      target: { x: 0, y: 6.0, z: 14 },
      initialPosition: { x: -2.8, y: 42.5, z: 82.5 },
      minDistance: 12,
      maxDistance: 78
    },
    sky: {
      toneMapping: 'aces',
      exposure: 0.96,
      background: '#9fcfc5',
      skyGradient: {
        top: '#65aeba',
        middle: '#9fcfc5',
        horizon: '#efd7ad'
      },
      fog: '#b7d5c8',
      fogNear: 54,
      fogFar: 220,
      sun: '#fff0bd',
      sunIntensity: 3.25,
      shadowIntensity: 1,
      sunPosition: { x: -86, y: 72, z: 74 },
      sunTarget: { x: 0, y: 3, z: 0 },
      hemiSky: '#d2eff0',
      hemiGround: '#426757',
      hemiIntensity: 0.82,
      ambientColor: '#a8c9b9',
      ambientIntensity: 0.54,
      shadowMapSize: 4096,
      shadowRadius: 8,
      shadowBias: -0.0005,
      shadowNormalBias: 0.02,
      realtimeShadows: false,
      bakedShadows: true
    },
    palette: {
      base: '#efeee8',
      side: '#c9d1d0',
      north: '#f7f5ef',
      valley: '#1f6557',
      forest: '#123f3c',
      high: '#f7f5ef',
      snow: '#f3f1ea',
      path: '#48a987',
      puddle: '#4e9088'
    },
    materials: {
      snow: '#f3f1ea',
      rock: '#c9d1d0',
      tree: '#347a55'
    },
    // 雪谷单一配色源：暖橙暮色 + 红棕秋树。
    // 所有场景物体（树/岩石/山体）从 art 取三段光照色阶，
    // 光照直接烘焙进顶点色，sunDirection 为统一光源方向
    art: {
      sunDirection: { x: -0.6, y: 0.4, z: 0.5 },
      tree: {
        trunk: '#4c3528',
        mid: '#347a55',
        snowCap: false
      },
      rock: {
        sunlit: '#f3f1ea',
        mid: '#c9d1d0',
        shadow: '#879496',
        snowCap: '#74c8a0'
      },
      cliff: {
        sunlit: '#fbfaf6',
        mid: '#d8dddd',
        shadow: '#879496',
        snow: '#58b38e'
      }
    },
    ground: {
      width: 240,
      depth: 204,
      flatShading: true
    },
    navigationBounds: {
      minX: -50,
      maxX: 50,
      minZ: -42,
      maxZ: 42
    },
    // 远景只在敌营方向收束成山口；不再用一圈连续山环把谷地围成槽。
    distantMountains: false,
    pathWidth: 7.2,
    pathOrganic: {
      widthJitter: 0.25,
      edgeJitter: 0.42
    },
    // 仅控制雪面染色的道路轮廓；寻路主轴与 pathWidth 保持不变。
    roadVisual: {
      widenings: [
        { x: -10.5, z: 26, radius: 5.4, amount: 0.34 },
        { x: -19, z: 2, radius: 6.8, amount: 0.32 },
        { x: 16, z: -6, radius: 6.8, amount: 0.36 },
        { x: -8, z: 15, radius: 6.6, amount: 0.38 }
      ],
      pinches: [
        { x: -1.2, z: 9.0, radius: 4.8, amount: 0.28 },
        { x: 1.5, z: -20.5, radius: 5.0, amount: 0.3 }
      ]
    },
    // 明显 S 形主路：两次横向推进后再回到敌营前庭，低机位仍能读出推进方向。
    // 起止点保持不变，12 个锚点继续作为现有寻路与关卡逻辑的同一条主轴。
    pathPoints: [
      { x: 0, z: 30 },
      { x: -1, z: 26 },
      { x: -2, z: 21 },
      { x: -1, z: 16 },
      { x: 1, z: 11 },
      { x: 2, z: 6 },
      { x: 3, z: 1 },
      { x: 3, z: -5 },
      { x: 2, z: -11 },
      { x: 1, z: -17 },
      { x: 1, z: -25 },
      { x: 5, z: -35 }
    ],
    // 纯雪原地貌：不设冰河/冰潭，谷地保持连续开阔的雪面
    puddles: [],
    iceFloes: [],
    altars: [
      { id: 'energy-altar-west', type: 'energy', position: { x: -19, z: 2 }, rotation: 0.4, clearingRadius: 6.5 },
      { id: 'shield-altar-east', type: 'shield', position: { x: 16, z: -6 }, rotation: -0.55, clearingRadius: 6.5 },
      { id: 'respite-altar-northwest', type: 'respite', position: { x: -8, z: 15 }, rotation: 0.35, clearingRadius: 6.2 }
    ],
    wildlife: [
      { type: 'wolf', x: 28, z: -6, radius: 5.4 },
      { type: 'wolf', x: 36, z: 16, radius: 5.2 },
      { type: 'bear', x: -34, z: 12, radius: 6.2 },
      { type: 'wolf', x: -38, z: 28, radius: 5.4 },
      { type: 'bear', x: 28, z: 28, radius: 6.1 },
      { type: 'wolf', x: -28, z: -28, radius: 5.3 }
    ],
    // 开阔地：基地广场、西岸平台、雪桥隘口、东岸旷地、台地前庭
    clearings: [
      { x: 0, z: 30, r: 12.2 },
      { x: -12, z: 15, r: 7.2 },
      { x: -1, z: 2, r: 8.2 },
      { x: 7, z: -12, r: 7.4 },
      { x: 3, z: -31, r: 9.4 }
    ],
    forestZones: [
      // 树只依附台地和坡脚成簇，入口与战斗中心留下大片雪地。
      { x: -28, z: 24, rx: 8, rz: 6, count: 30, tone: 'deep', rot: 0.24, raggedness: 0.30, edgeDrop: 0.42 },
      { x: -33, z: 2, rx: 7, rz: 11, count: 42, tone: 'cool', rot: -0.14, raggedness: 0.28, edgeDrop: 0.42 },
      { x: -30, z: -22, rx: 9, rz: 8, count: 34, tone: 'warm', rot: -0.24, raggedness: 0.30, edgeDrop: 0.44 },
      { x: 27, z: 25, rx: 7, rz: 6, count: 23, tone: 'warm', rot: 0.22, raggedness: 0.32, edgeDrop: 0.46 },
      { x: 33, z: 7, rx: 7, rz: 9, count: 29, tone: 'cool', rot: -0.18, raggedness: 0.30, edgeDrop: 0.44 },
      { x: 29, z: -24, rx: 8, rz: 7, count: 26, tone: 'deep', rot: 0.18, raggedness: 0.32, edgeDrop: 0.46 },
      // 远端只用两小簇引向营地，不把视线终点堵死。
      { x: -13, z: -31, rx: 6, rz: 4, count: 16, tone: 'cool', rot: 0.08, raggedness: 0.26, edgeDrop: 0.48 },
      { x: 17, z: -31, rx: 6, rz: 4, count: 15, tone: 'warm', rot: -0.12, raggedness: 0.26, edgeDrop: 0.48 }
    ],
    deadGrassScale: 2.62,
    // 枯草甸：散布在各段开阔地边缘，避免压上主路
    deadGrassFields: [
      { x: -12, z: 26, rx: 8, rz: 4, count: 16, clumps: 2, clumpRadius: 1.1, rot: -0.2 },
      { x: 8, z: 24, rx: 9, rz: 4.5, count: 16, clumps: 2, clumpRadius: 1.05, rot: 0.24 },
      { x: -24, z: 4, rx: 8, rz: 5, count: 16, clumps: 2, clumpRadius: 1.05, rot: 0.14 },
      { x: -8, z: 14, rx: 7, rz: 4, count: 14, clumps: 2, clumpRadius: 1.0, rot: -0.3 },
      { x: 20, z: 2, rx: 7.5, rz: 4.5, count: 14, clumps: 2, clumpRadius: 1.0, rot: -0.3 },
      { x: 16, z: -12, rx: 7, rz: 4, count: 14, clumps: 2, clumpRadius: 0.95, rot: -0.26, clearance: 1.45 },
      { x: -10, z: -22, rx: 8, rz: 4.5, count: 16, clumps: 2, clumpRadius: 1.0, rot: 0.3, clearance: 1.45 },
      { x: 26, z: -24, rx: 7, rz: 4, count: 12, clumps: 2, clumpRadius: 0.95, rot: -0.36 },
      { x: -32, z: 24, rx: 7, rz: 3.8, count: 12, clumps: 2, clumpRadius: 0.95, rot: -0.22 },
      { x: 34, z: 4, rx: 7, rz: 4.4, count: 12, clumps: 2, clumpRadius: 1.0, rot: 0.18 },
      { x: -24, z: -34, rx: 7.6, rz: 3.8, count: 12, clumps: 2, clumpRadius: 0.9, rot: -0.12 },
      { x: 28, z: -33, rx: 7, rz: 3.6, count: 10, clumps: 2, clumpRadius: 0.9, rot: -0.08 }
    ],
    forestPassages: [
      [new THREE.Vector3(-43, 0, 28), new THREE.Vector3(-32, 0, 18), new THREE.Vector3(-24, 0, 9), new THREE.Vector3(-16, 0, 4)],
      [new THREE.Vector3(43, 0, 22), new THREE.Vector3(32, 0, 14), new THREE.Vector3(22, 0, 6), new THREE.Vector3(14, 0, 0)],
      [new THREE.Vector3(-44, 0, -14), new THREE.Vector3(-30, 0, -20), new THREE.Vector3(-18, 0, -25), new THREE.Vector3(-6, 0, -27)],
      [new THREE.Vector3(44, 0, -26), new THREE.Vector3(30, 0, -24), new THREE.Vector3(18, 0, -20), new THREE.Vector3(10, 0, -13)]
    ],
boulderClusters: [
      // 旧版用巨型完整岩石围边；连续山腰已接管边界，只保留场内中小型落石。
      { x: -30, z: 18, rx: 7, rz: 7, count: 10, sizeMin: 1.45, sizeMax: 2.5 },
      { x: -24, z: -41, rx: 14, rz: 3.6, count: 10, sizeMin: 1.45, sizeMax: 2.8 },
      { x: 18, z: -42, rx: 17, rz: 3.4, count: 9, sizeMin: 1.45, sizeMax: 2.85 },
      { x: 6, z: 40, rx: 22, rz: 3.6, count: 13, sizeMin: 1.35, sizeMax: 2.5 },
      { x: -19, z: 18, rx: 5, rz: 6, count: 6, sizeMin: 0.75, sizeMax: 1.55 },
      { x: 20, z: 9, rx: 5, rz: 6, count: 6, sizeMin: 0.7, sizeMax: 1.5 },
      { x: -21, z: -7, rx: 5, rz: 6, count: 6, sizeMin: 0.8, sizeMax: 1.6 },
      { x: 20, z: -21, rx: 5, rz: 6, count: 6, sizeMin: 0.75, sizeMax: 1.55 }
    ],
    // 地标巨石：谷地渡口两岸各立一根独石，其余锚点点缀开阔地两端
    landmarkBoulders: [
      { x: -7, z: 7, size: 3.2, sx: 1.28, sy: 0.9, sz: 0.96, rot: 0.42 },
      { x: 6, z: 8, size: 2.9, sx: 1.04, sy: 0.98, sz: 1.1, rot: -0.55 },
      { x: -15, z: 27, size: 2.65, sx: 1.24, sy: 0.88, sz: 0.94, rot: 0.82 },
      { x: 12, z: 22, size: 2.6, sx: 1.08, sy: 0.78, sz: 1.24, rot: -0.22 },
      { x: -10, z: -26, size: 2.5, sx: 1.16, sy: 0.84, sz: 1.02, rot: 0.2 }
    ],
    // 主路边缘的成组小景：每组都有不同主角；路中心、基地前庭与祭坛操作圈始终留空。
    roadsideClusters: [
      // 左前保持低矮，右前只留雪壳与冻土：不在基地正前或右前堆放树木、栅栏和倒木。
      { x: -8.4, z: 23.2, kind: 'low-rock-face', radius: 2.15 },
      { x: -9.1, z: 8.9, kind: 'rock-pines-snow', radius: 2.35 },
      // 右中景是一组明显的枯桩/灌木/雪帽石，和左侧密林不构成镜像。
      { x: 11.2, z: 2.1, kind: 'stump-shrub-rock', radius: 2.1 },
      // 越往敌营，木制残骸渐多；倒木与破栅分别落在道路两侧，保持不对称。
      { x: -11.5, z: -9.5, kind: 'fallen-log-stake', radius: 2.4 },
      { x: 16.0, z: -14.0, kind: 'low-rock-face', radius: 2.1 },
      { x: -10.1, z: -25.7, kind: 'half-boulder-snow', radius: 2.25 },
      // 两侧各一簇不等距的山脚小树林：主树带中树/矮树，右侧岩堆中保留缺口。
      { x: -14.8, z: -17.8, kind: 'foothill-pine-copse', radius: 2.8 },
      { x: 16.8, z: 11.5, kind: 'foothill-pine-copse', radius: 2.8 }
    ],
    snowValleyScenery: {
      // 低对比、软边的大地面层：亮度只拉开约 5–10%，不读成道路、水坑或深色贴花。
      groundPatches: [
        // 基地右前的浅雪壳/冻土，保持开阔而不是加木制物。
        { x: 6.2, z: 26.4, rx: 4.6, rz: 2.35, rot: 0.18, color: '#d7dde0', opacity: 0.14 },
        // 路肩风积雪：明度稍高，形状断续，不描出两条平行边线。
        { x: -7.0, z: 19.8, rx: 3.4, rz: 1.35, rot: -0.34, color: '#e5e9e9', opacity: 0.16 },
        { x: 8.6, z: 10.7, rx: 3.1, rz: 1.25, rot: 0.42, color: '#e7ebeb', opacity: 0.15 },
        { x: -7.8, z: -3.0, rx: 2.8, rz: 1.2, rot: 0.16, color: '#e5e9e8', opacity: 0.15 },
        { x: 9.2, z: -14.0, rx: 3.5, rz: 1.4, rot: -0.42, color: '#e6eaeb', opacity: 0.16 },
        // 背风雪窝：小而冷灰蓝，作为雪面体积，不伪装成水面。
        { x: -13.0, z: 6.8, rx: 1.45, rz: 0.95, rot: -0.18, color: '#cbd4da', opacity: 0.13 },
        { x: 13.4, z: -11.6, rx: 1.6, rz: 1.0, rot: 0.30, color: '#cbd4da', opacity: 0.13 },
        // 基地、旗杆和祭坛外缘的压实雪斑；透明度低，供踏雪痕迹读作地面历史。
        { x: -4.7, z: 27.1, rx: 2.4, rz: 1.15, rot: -0.12, color: '#cfd7d9', opacity: 0.12 },
        { x: -12.1, z: 2.4, rx: 1.8, rz: 0.9, rot: 0.28, color: '#ced6d8', opacity: 0.12 },
        { x: 8.7, z: -6.0, rx: 1.9, rz: 0.92, rot: -0.34, color: '#ced6d8', opacity: 0.12 }
      ],
      // 中央战斗雪地不放倒木或路标，保持单位与祭坛视线干净。
      centerAnchor: null
    },
    cottages: [],
    landmass: {
      waterHeight: -1.28,
      oceanColor: '#4e9fb4',
      cliffColor: '#969487',
      cliffDarkColor: '#7f8580',
      shoreInner: 0.72,
      shoreOuter: 1.08,
      lobes: [
        { x: 0, z: 0, rx: 260, rz: 230, rot: -0.04, irregularity: 0.04 }
      ],
      bays: []
    },
    terrain: {
      ...DEFAULT_TERRAIN_PROFILE,
      roughnessScale: 0.72,
      northRise: 2.05,
      sideRise: 1.12,
      sideNorthRise: 2.25,
      valleyFloorBase: 0.28,
      valleyNorthRise: 1.06,
      valleySideRise: 0.25,
      campTerrace: 2.45,
      campTerraceOutward: 0.54,
      waterHeight: -1.28,
      coastRimHeight: 0.58,
      landLift: 1.48,
      coastBlendStart: 0.38,
      coastBlendEnd: 0.54,
      snowCenter: { x: 8, z: -32 },
      // 主路纵向剖面：起点台地缓降至浅盆地，敌营前再轻轻回升；只影响地形高度层。
      routeProgression: {
        sourceShelf: 0.72,
        basinCenter: { x: 4, z: -5 },
        basinRadius: 13,
        basinDepth: 0.46,
        endpointRise: 0.76
      },
      hills: [
      { x: -34, z: 20, rx: 15.2, rz: 12.4, height: 4.7 },
      { x: -32, z: -8, rx: 14.6, rz: 17.0, height: 5.5 },
      { x: -28, z: -28, rx: 12.6, rz: 10.2, height: 3.9 },
      { x: 31, z: 23, rx: 11.0, rz: 9.6, height: 3.0 },
      { x: 33, z: 4, rx: 11.3, rz: 13.8, height: 3.7 },
      { x: 30, z: -25, rx: 11.2, rz: 9.8, height: 3.3 }
      ],
      ridges: [
        { x: -45, z: 6, rx: 7, rz: 32, height: 2.7 },
        { x: 45, z: -12, rx: 7, rz: 27, height: 2.3 },
        { x: 5, z: -43, rx: 34, rz: 7, height: 3.2 }
      ]
    },
    mountainRidge: [
      { x: -20.8, z: 30.5, width: 5.2, height: 5.2, rot: 0.05, color: '#8a786e' },
      { x: -23.2, z: 16.5, width: 4.8, height: 7.8, rot: -0.12, color: '#948076' },
      { x: -21.5, z: 8.3, width: 5.7, height: 6.3, rot: 0.08, color: '#8f7a6f' },
      { x: -22.7, z: -16.2, width: 4.6, height: 8.1, rot: -0.06, color: '#8a786e' },
      { x: -20.6, z: -31.7, width: 5.5, height: 4.9, rot: 0.10, color: '#948076' },
      { x: -38.7, z: 36.8, width: 7.5, height: 13.5, rot: 0, color: '#8b8391' },
      { x: -41.2, z: 25.5, width: 8.0, height: 10.2, rot: 0.1, color: '#948b98' },
      { x: -39.5, z: 13.2, width: 7.5, height: 16.8, rot: -0.1, color: '#776d84' },
      { x: -40.3, z: -2.1, width: 8.0, height: 18.5, rot: 0, color: '#8b8391' },
      { x: -41.5, z: -10.3, width: 7.5, height: 12.1, rot: 0.1, color: '#948b98' },
      { x: -38.9, z: -26.4, width: 8.0, height: 14.7, rot: -0.1, color: '#776d84' },
      { x: -40.1, z: -34.7, width: 7.5, height: 11.3, rot: 0, color: '#8b8391' },
      { x: 20.7, z: 29.3, width: 5.8, height: 6.1, rot: -0.05, color: '#948076' },
      { x: 22.4, z: 13.7, width: 4.7, height: 4.9, rot: 0.12, color: '#8a786e' },
      { x: 23.1, z: -7.4, width: 5.3, height: 7.7, rot: -0.08, color: '#8f7a6f' },
      { x: 21.3, z: -23.5, width: 5.1, height: 5.4, rot: 0.06, color: '#948076' },
      { x: 22.8, z: -34.2, width: 4.9, height: 8.2, rot: -0.10, color: '#8a786e' },
      { x: 41.3, z: 34.4, width: 7.5, height: 15.2, rot: 0, color: '#776d84' },
      { x: 39.7, z: 20.7, width: 8.0, height: 11.8, rot: -0.1, color: '#8b8391' },
      { x: 40.8, z: 11.5, width: 7.5, height: 17.3, rot: 0.1, color: '#948b98' },
      { x: 38.9, z: -4.2, width: 8.0, height: 10.5, rot: 0, color: '#776d84' },
      { x: 41.5, z: -12.5, width: 7.5, height: 13.9, rot: -0.1, color: '#8b8391' },
      { x: 39.6, z: -27.8, width: 8.0, height: 16.2, rot: 0.1, color: '#948b98' },
      { x: 40.4, z: -37.2, width: 7.5, height: 12.7, rot: 0, color: '#776d84' }
    ],
    snowPeaks: [
      { x: -25, z: -45, width: 7.0, height: 12.0, color: '#eef2f6' },
      { x: -12, z: -47, width: 8.0, height: 14.0, color: '#dbe4ec' },
      { x: 2, z: -46, width: 9.0, height: 16.0, color: '#eef2f6' },
      { x: 18, z: -44, width: 7.0, height: 13.0, color: '#dbe4ec' },
      { x: 30, z: -42, width: 6.0, height: 11.0, color: '#eef2f6' },
      { x: -56, z: 10, width: 6.5, height: 9.0, color: '#eef2f6' },
      { x: -59, z: -8, width: 6.0, height: 8.5, color: '#dbe4ec' },
      { x: 57, z: 12, width: 6.8, height: 9.5, color: '#eef2f6' },
      { x: 61, z: -5, width: 6.2, height: 8.0, color: '#dbe4ec' }
    ],
    backdropRocks: [
      { x: -35.15, z: -39.43, size: 4.1, sx: 1.45, sy: 0.7, sz: 0.92, rot: -0.32, color: '#74848a' },
      { x: -27.55, z: -41.04, size: 5.8, sx: 1.28, sy: 0.95, sz: 1.08, rot: 0.14, color: '#6d7d84' },
      { x: -18.05, z: -39.52, size: 4.7, sx: 1.42, sy: 0.78, sz: 0.96, rot: -0.08, color: '#849097' },
      { x: -7.6, z: -41.23, size: 4.4, sx: 1.22, sy: 0.76, sz: 1.14, rot: 0.38, color: '#75838a' },
      { x: 10.45, z: -40.09, size: 5.2, sx: 1.36, sy: 0.86, sz: 1.06, rot: -0.2, color: '#7a878d' },
      { x: 22.8, z: -40.85, size: 4.8, sx: 1.32, sy: 0.8, sz: 1.1, rot: 0.22, color: '#879096' },
      { x: 33.25, z: -38.76, size: 3.9, sx: 1.22, sy: 0.68, sz: 0.94, rot: -0.38, color: '#6f7e85' },
      { x: -12.35, z: -34.96, size: 2.55, sx: 1.22, sy: 0.62, sz: 0.9, rot: 0.24, color: '#8a9498' },
      { x: 18.05, z: -35.53, size: 2.8, sx: 1.18, sy: 0.58, sz: 1.0, rot: -0.16, color: '#7f8a90' }
    ],
    monsterCamp: { x: 5, z: -35, rot: -0.36, scale: 1.2 },
    snowfall: {
      enabled: false,
      seed: 309,
      countScale: 0,
      gustScale: 0,
      windScale: 0
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
      { id: 'energy-altar-pine-west', type: 'energy', position: { x: -6.8, z: 16.5 }, rotation: -0.4, clearingRadius: 6 },
      { id: 'shield-altar-pine-east', type: 'shield', position: { x: 3.5, z: -10 }, rotation: 0.4, clearingRadius: 6.2 },
      { id: 'respite-altar-pine-north', type: 'respite', position: { x: -2, z: -23 }, rotation: 0.1, clearingRadius: 5.8 }
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
      { id: 'energy-altar-ridge-south', type: 'energy', position: { x: -0.5, z: 17 }, rotation: -0.18, clearingRadius: 6 },
      { id: 'shield-altar-ridge-east', type: 'shield', position: { x: 7, z: -9 }, rotation: 0.55, clearingRadius: 6.2 },
      { id: 'respite-altar-ridge-west', type: 'respite', position: { x: 4, z: -18 }, rotation: -0.15, clearingRadius: 6 }
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
      shadowIntensity: 1,
      hemiSky: '#ac6262',
      hemiGround: '#ff8080',
      hemiIntensity: 1.52,
      realtimeShadows: false,
      bakedShadows: true
    },
    camera: {
      initialPosition: { x: -1.571, y: 28.608, z: 59.673 }
    },
    materials: {
      snow: '#eee8d8',
      rock: '#969487',
      tree: '#356747'
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
      { id: 'energy-altar-dungeon-west', type: 'energy', position: { x: -10, z: 15 }, rotation: -0.35, clearingRadius: 6 },
      { id: 'shield-altar-dungeon-east', type: 'shield', position: { x: 10, z: -4 }, rotation: 0.35, clearingRadius: 6 },
      { id: 'respite-altar-dungeon-north', type: 'respite', position: { x: -1, z: -18 }, rotation: 0.15, clearingRadius: 5.8 }
    ],
    wildlife: [],
    forestZones: [],
    forestPassages: [],
    clearings: [
      { x: 0, z: 30, r: 11 },
      { x: 0, z: -33, r: 9 },
      { x: -10, z: 15, r: 6 },
      { x: 10, z: -4, r: 6 },
      { x: -1, z: -18, r: 5.8 }
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
    playerBasePosition: { x: 0, z: 31 },
    enemyCampPosition: { x: -2, z: -33 },
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
      exposure: 0.89,
      background: '#ff8847',
      skyGradient: {
        top: '#ff8847',
        middle: '#ff8847',
        horizon: '#ff8847'
      },
      fog: '#ffa27a',
      fogNear: 20,
      fogFar: 245,
      sun: '#ffdbcc',
      sunIntensity: 8,
      sunPosition: { x: -88, y: 48, z: 48 },
      shadowIntensity: 1,
      hemiSky: '#ffd79e',
      hemiGround: '#902c2c',
      hemiIntensity: 0.77,
      realtimeShadows: false,
      bakedShadows: true,
      shadowMapSize: 2048
    },
    camera: {
      initialPosition: { x: -1.599, y: 33.002, z: 63.424 }
    },
    materials: {
      snow: '#eee8d8',
      rock: '#969487',
      tree: '#356747'
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
      { id: 'energy-altar-desert-west', type: 'energy', position: { x: 9, z: 20 }, rotation: -0.2, clearingRadius: 6 },
      { id: 'shield-altar-desert-east', type: 'shield', position: { x: -4, z: 6.5 }, rotation: 0.35, clearingRadius: 6.2 },
      { id: 'respite-altar-desert-south', type: 'respite', position: { x: 2.2, z: -13 }, rotation: 0.1, clearingRadius: 5.8 }
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
      { x: 9, z: 20, r: 6 },
      { x: -4, z: 6.5, r: 6.2 },
      { x: 2.2, z: -13, r: 5.8 }
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
  },
  'emerald-marsh': {
    sceneKey: 'emerald-marsh',
    theme: 'emerald-marsh',
    seed: 1409,
    camera: {
      initialPosition: { x: 0, y: 32, z: 65 },
      minDistance: 12,
      maxDistance: 78
    },
    sky: {
      toneMapping: 'aces',
      exposure: 0.97,
      background: '#93a893',
      skyGradient: {
        top: '#5c7a74',
        middle: '#93a893',
        horizon: '#c8cba9'
      },
      fog: '#9cb2a0',
      fogNear: 38,
      fogFar: 152,
      sun: '#ffd9a6',
      sunIntensity: 3.5,
      sunPosition: { x: -62, y: 54, z: 40 },
      shadowIntensity: 0.82,
      hemiSky: '#b8d0c6',
      hemiGround: '#2f4638',
      hemiIntensity: 0.92,
      ambientColor: '#7d98a0',
      ambientIntensity: 0.5,
      realtimeShadows: false,
      bakedShadows: true,
      shadowMapSize: 2048
    },
    materials: {
      snow: '#5f7050',
      rock: '#5a655b',
      tree: '#3f6849'
    },
    palette: {
      base: '#5f7050',
      side: '#4c5a45',
      north: '#5a6c4f',
      valley: '#57694d',
      forest: '#3f5340',
      high: '#7a8a6b',
      snow: '#5f7050',
      path: '#7d7154',
      pathCenter: '#8d8163',
      moss: '#6d7f52',
      mud: '#57503c',
      bank: '#46523f',
      puddle: '#31615a',
      waterShallow: '#71906f',
      waterDeep: '#2c5450'
    },
    ground: {
      width: 180,
      depth: 180,
      flatShading: false
    },
    navigationBounds: {
      minX: -43,
      maxX: 43,
      minZ: -43,
      maxZ: 43
    },
    playerBasePosition: { x: 0, z: 31 },
    enemyCampPosition: { x: -1, z: -32 },
    pathWidth: 3.3,
    pathOrganic: {
      widthJitter: 0.22,
      edgeJitter: 0.26
    },
    pathPoints: [
      { x: 0, z: 31 },
      { x: -4.5, z: 26 },
      { x: -10.5, z: 20 },
      { x: -11, z: 12.5 },
      { x: -4, z: 6.5 },
      { x: 3.5, z: 2.5 },
      { x: 10, z: -3.5 },
      { x: 9.5, z: -10.5 },
      { x: 3.5, z: -16 },
      { x: -3.5, z: -21.5 },
      { x: -2.5, z: -27 },
      { x: -1, z: -32 }
    ],
    altars: [
      { id: 'energy-altar-marsh-west', type: 'energy', position: { x: -18.5, z: 17 }, rotation: -0.42, clearingRadius: 6.2 },
      { id: 'shield-altar-marsh-east', type: 'shield', position: { x: 15.5, z: -6.5 }, rotation: 0.38, clearingRadius: 6.2 },
      { id: 'respite-altar-marsh-south', type: 'respite', position: { x: -10.5, z: -25 }, rotation: 0.12, clearingRadius: 6.1 }
    ],
    wildlife: [],
    clearings: [
      { x: 0, z: 31, r: 11.5 },
      { x: -10.5, z: 20, r: 7.4 },
      { x: -11, z: 12.5, r: 5.8 },
      { x: -4, z: 6.5, r: 5.4 },
      { x: 3.5, z: 2.5, r: 5.2 },
      { x: 10, z: -3.5, r: 5.8 },
      { x: 9.5, z: -10.5, r: 7.2 },
      { x: 3.5, z: -16, r: 5.6 },
      { x: -3.5, z: -21.5, r: 7.2 },
      { x: -2.5, z: -27, r: 5.6 },
      { x: -1, z: -32, r: 9.6 },
      { x: -18.5, z: 17, r: 6.2 },
      { x: 15.5, z: -6.5, r: 6.2 },
      { x: -10.5, z: -25, r: 6.1 }
    ],
    forestZones: [],
    forestPassages: [],
    boulderClusters: [],
    landmarkBoulders: [],
    marshTreeZones: [
      // 西岸镜湖林：沿湖东岸弧线列植，倒映湖面
      { x: -14, z: 22, rx: 4.5, rz: 8, rot: 0.24, count: 7, clusters: 3 },
      { x: -36, z: 27, rx: 5.5, rz: 6, count: 7, clusters: 2 },
      // 镜湖北岸与西北边缘
      { x: -30, z: 29.5, rx: 8, rz: 4, count: 6, clusters: 2 },
      // 西湖与北塘之间的西侧密林
      { x: -38.5, z: 4, rx: 4.5, rz: 13, count: 9, clusters: 3 },
      // 西湖西南岸林，衔接西南死水
      { x: -33, z: -13, rx: 6.5, rz: 8, count: 10, clusters: 3 },
      { x: -30, z: -34, rx: 7, rz: 4.5, count: 6, clusters: 2 },
      // 东北高地林：框住主路第一个弯
      { x: 20, z: 26, rx: 9, rz: 6.5, rot: -0.2, count: 9, clusters: 3 },
      { x: 36.5, z: 12, rx: 5, rz: 11, count: 8, clusters: 3 },
      // 东部腐湖东侧林带，把视线收向湖面
      { x: 37, z: -6, rx: 4.5, rz: 11, count: 8, clusters: 3 },
      { x: 31, z: -18, rx: 7, rz: 7, count: 9, clusters: 3 },
      // 东南至敌营方向的暗林，强化纵深压迫感
      { x: 23, z: -33.5, rx: 12, rz: 5, count: 10, clusters: 3 },
      // 堤道东侧小丛，与草丘呼应
      { x: 17.5, z: 6.5, rx: 3.2, rz: 3.6, count: 3, clusters: 1 },
      // 基地西北入口两侧夹道林
      { x: -16.5, z: 25.5, rx: 4.5, rz: 3.5, rot: 0.4, count: 5, clusters: 2 },
      // 敌营后方两侧暗林，框住终点
      { x: -13, z: -36.5, rx: 5.5, rz: 3.5, rot: -0.2, count: 5, clusters: 2 }
    ],
    marshReedZones: [
      { x: -15, z: 13, rx: 5, rz: 11, count: 26 },
      { x: 17, z: -1, rx: 5, rz: 10, count: 24 },
      { x: -20, z: 31, rx: 7, rz: 4, count: 16 },
      { x: -18, z: -27, rx: 6, rz: 5, count: 16 },
      { x: 27, z: -24, rx: 5, rz: 4, count: 12 },
      { x: -7, z: -1, rx: 4, rz: 4, count: 10 },
      { x: 12, z: 5, rx: 4, rz: 4, count: 10 },
      { x: 2, z: -41, rx: 9, rz: 2.5, count: 12 }
    ],
    marshLandmarks: [
      { kind: 'watchtower', x: -19.5, z: 8.5, rot: -0.5, scale: 1.2 },
      { kind: 'watchtower', x: 23.5, z: 8, rot: 0.62, scale: 0.95 },
      { kind: 'rootArch', x: -14.5, z: 5.5, rot: 0.5, scale: 1.15 },
      { kind: 'rootWall', x: -1, z: -39.5, rot: 0.04, scale: 1.4 }
    ],
    marshBoardwalks: [
      { from: { x: -14.2, z: 18.4 }, to: { x: -17.5, z: 17.6 }, width: 1.65 },
      { from: { x: 11.6, z: -5.6 }, to: { x: 14.8, z: -6.2 }, width: 1.65 },
      { from: { x: -5.6, z: -22.6 }, to: { x: -9.6, z: -24.4 }, width: 1.65 },
      { from: { x: -14.5, z: 13.2 }, to: { x: -19, z: 11.6 }, width: 1.5 }
    ],
    marshHummocks: [
      { x: -0.5, z: 10.5, rx: 4.4, rz: 3, rot: -0.2, trees: 3, log: true },
      { x: 12.5, z: 7.5, rx: 3.6, rz: 2.5, rot: 0.3, trees: 2, log: true },
      { x: -8, z: -12.5, rx: 4, rz: 2.7, rot: -0.3, trees: 3 },
      { x: 15, z: -18, rx: 3.6, rz: 2.4, rot: 0.2, trees: 2, log: true },
      { x: -14, z: 26.5, rx: 3.2, rz: 2.3, rot: 0.5, trees: 2 }
    ],
    marshWaterHeight: 0.055,
    marshPools: [
      { x: -27, z: 12, rx: 16, rz: 19, rot: -0.22, irregularity: 0.14 },
      { x: 26, z: -2, rx: 14, rz: 15.5, rot: 0.24, irregularity: 0.15 },
      { x: -9, z: 2, rx: 8, rz: 6.5, rot: -0.3, irregularity: 0.12 },
      { x: 13.5, z: 0.5, rx: 8, rz: 6.5, rot: 0.3, irregularity: 0.11 },
      { x: -24, z: 31, rx: 11.5, rz: 7.5, rot: -0.16, irregularity: 0.13 },
      { x: -22, z: -27, rx: 11, rz: 8.5, rot: 0.18, irregularity: 0.13 },
      { x: 29, z: -24, rx: 8.5, rz: 7, rot: 0.28, irregularity: 0.1 },
      { x: 0, z: -40, rx: 15, rz: 4.8, rot: -0.04, irregularity: 0.12 }
    ],
    terrain: {
      ...DEFAULT_TERRAIN_PROFILE,
      baseHeight: 0.34,
      northRise: 0.32,
      sideRise: 0.62,
      sideNorthRise: 0.5,
      roughnessScale: 0.3,
      valleyFloorBase: 0.3,
      valleyNorthRise: 0.12,
      valleySideRise: 0.1,
      campTerrace: 0.58,
      campTerraceOutward: 0.1,
      campShelfInner: 5.5,
      campShelfOuter: 11,
      waterHeight: -0.18,
      hills: [
        { x: -21, z: 25, rx: 11, rz: 8, height: 0.8 },
        { x: 19, z: 15, rx: 12, rz: 9, height: 0.72 },
        { x: -24, z: -6, rx: 10, rz: 12, height: 0.88 },
        { x: 23, z: -19, rx: 11, rz: 10, height: 0.78 },
        { x: 0, z: -38.5, rx: 17, rz: 7, height: 0.66 }
      ],
      ridges: [
        { x: -45, z: 0, rx: 5, rz: 47, height: 1.6 },
        { x: 45, z: 0, rx: 5, rz: 47, height: 1.6 },
        { x: 0, z: -45.5, rx: 40, rz: 5, height: 1.35 },
        { x: 0, z: 46, rx: 40, rz: 5, height: 1.05 }
      ]
    },
    monsterCamp: { x: -1, z: -35.5, rot: -0.18, scale: 1.2, offset: 0.18 },
    snowfall: {
      enabled: false,
      countScale: 0,
      gustScale: 0,
      windScale: 0
    }
  }
};

let activeWorldConfig = resolveWorldConfig();

export function createWorld(scene, worldOptions = {}) {
  activeWorldConfig = resolveWorldConfig(worldOptions);
  const config = activeWorldConfig;
  const initialMaterialColors = { ...(config.materials ?? {}) };
  const initialSnowPalette = { ...(config.palette ?? {}) };
  const initialLandmassColors = config.landmass
    ? {
        cliffColor: config.landmass.cliffColor,
        cliffDarkColor: config.landmass.cliffDarkColor
      }
    : null;
  updateBakedShadowLightRay(config);
  config.navigationBlockers = [];
  activeStaticCullables = [];
  activeStaticDecorationBatch = createStaticDecorationBatch();
  activeAnimatedDecorations = [];
  scene.background = new THREE.Color(config.sky.skyGradient?.middle ?? config.sky.background);
  scene.fog = new THREE.Fog(config.sky.fog, config.sky.fogNear, config.sky.fogFar);

  const sun = new THREE.DirectionalLight(config.sky.sun, config.sky.sunIntensity ?? 3.55);
  const sunPosition = config.sky.sunPosition ?? DEFAULT_SUN_POSITION;
  sun.position.set(sunPosition.x, sunPosition.y, sunPosition.z);
  const sunTarget = config.sky.sunTarget ?? { x: 0, y: 0, z: 0 };
  sun.target.position.set(sunTarget.x, sunTarget.y, sunTarget.z);
  sun.castShadow = config.sky.realtimeShadows !== false;
  if (sun.castShadow) {
    if (config.sky.shadowIntensity !== undefined) {
      sun.shadow.intensity = config.sky.shadowIntensity;
    }
    const shadowMapSize = config.sky.shadowMapSize ?? 1024;
    sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
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

  const ambient = new THREE.AmbientLight(config.sky.ambientColor || '#8FAFD0', config.sky.ambientIntensity || 0.4);
  scene.add(ambient);

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
    if (config.ridgeVillage) {
      createRidgeVillageCliffs(scene);
    } else {
      createIslandCliffs(scene);
      if (config.distantMountains) createDistantSnowMountains(scene);
    }
  }
  if (theme === 'dungeon') {
    createDungeonPath(scene, pathPoints);
  } else {
    createPath(scene, pathPoints);
  }
  if (theme === 'snow' && !config.ridgeVillage) {
    createPuddles(scene);
    createShoreIceFloes(scene);
    // createVolumeMist(scene);
    createCentralDecorations(scene);
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
  } else if (theme === 'emerald-marsh') {
    createMarshDecor(scene, pathPoints);
  } else {
    decorate(scene, pathPoints);
  }
  createSnowMonsterCamp(scene);
  const staticDecorationResult = flushStaticDecorationBatch(scene);
  const bakedShadowResult = flushBakedGroundShadows(ground);
  const staticCullables = activeStaticCullables;
  const animatedDecorations = activeAnimatedDecorations;
  activeStaticCullables = null;
  activeAnimatedDecorations = null;
  const staticCulling = createStaticWorldCulling(staticCullables);
  const navGrid = createNavigationGrid();
  let decorationElapsed = 0;
  const setMaterialColors = (colors = {}) => {
    let recolorGround = false;
    ['snow', 'rock', 'tree'].forEach((kind) => {
      if (typeof colors[kind] !== 'string' || !colors[kind]) return;
      if (!initialMaterialColors[kind]) return;
      const nextHex = `#${new THREE.Color(colors[kind]).getHexString()}`;
      config.materials[kind] = nextHex;
      updateTaggedWorldMaterials(scene, kind, nextHex);

      if (kind === 'snow') {
        ['base', 'side', 'north', 'valley', 'forest', 'high', 'snow'].forEach((key) => {
          if (!initialSnowPalette[key]) return;
          config.palette[key] = relativeMaterialHex(
            initialSnowPalette[key],
            initialMaterialColors.snow,
            nextHex
          );
        });
        recolorGround = true;
      }
      if (kind === 'rock' && config.landmass && initialLandmassColors) {
        config.landmass.cliffColor = relativeMaterialHex(
          initialLandmassColors.cliffColor,
          initialMaterialColors.rock,
          nextHex
        );
        config.landmass.cliffDarkColor = relativeMaterialHex(
          initialLandmassColors.cliffDarkColor,
          initialMaterialColors.rock,
          nextHex
        );
        recolorGround = true;
      }
    });
    if (recolorGround) {
      colorGroundGeometry(ground.geometry);
      ground.geometry.attributes.color.needsUpdate = true;
    }
  };

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
      hemisphere,
      ambient
    },
    setMaterialColors,
    staticCullables,
    staticCulling,
    staticDecorationMeshes: staticDecorationResult.meshes,
    update: (dt, cameraTarget, camera, options = {}) => {
      updateSkyGradientPosition(skyGradient, camera);
      snowfall.update(dt, cameraTarget);
      staticCulling.update(dt, camera, options);
      decorationElapsed += Math.max(0, dt);
      animatedDecorations.forEach((decoration) => {
        if (decoration.visible !== false) {
          decoration.userData.updateWorldDecoration?.(decorationElapsed);
        }
      });
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
    materials: {
      ...(preset.materials ?? {}),
      ...(worldOptions.materials ?? {})
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

function worldMaterialColor(name, fallback) {
  return worldConfig().materials?.[name] ?? fallback;
}

function worldMaterialSurfaceOptions(kind) {
  if (worldConfig().sceneKey !== 'snow-valley') {
    return kind === 'rock'
      ? { roughness: 0.95, metalness: 0, emissive: '#14181a' }
      : { roughness: 1, metalness: 0, emissive: '#0a0b0c' };
  }
  return kind === 'rock'
    ? { roughness: 0.96, metalness: 0 }
    : { roughness: 0.95, metalness: 0 };
}

function markWorldMaterial(material, kind) {
  if (!material?.isMaterial || !material.color || !kind) return material;
  material.userData.worldMaterialKind = kind;
  if (!material.userData.worldMaterialOriginalColor) {
    material.userData.worldMaterialOriginalColor = material.color.clone();
    material.userData.worldMaterialReferenceColor = new THREE.Color(worldMaterialColor(kind, '#ffffff'));
  }
  return material;
}

function relativeMaterialColor(originalValue, referenceValue, nextValue) {
  const original = originalValue?.isColor ? originalValue : new THREE.Color(originalValue);
  const reference = referenceValue?.isColor ? referenceValue : new THREE.Color(referenceValue);
  const next = nextValue?.isColor ? nextValue : new THREE.Color(nextValue);
  return new THREE.Color().setRGB(
    clamp(original.r * next.r / Math.max(0.001, reference.r), 0, 1),
    clamp(original.g * next.g / Math.max(0.001, reference.g), 0, 1),
    clamp(original.b * next.b / Math.max(0.001, reference.b), 0, 1)
  );
}

function relativeMaterialHex(originalValue, referenceValue, nextValue) {
  return `#${relativeMaterialColor(originalValue, referenceValue, nextValue).getHexString()}`;
}

function updateTaggedWorldMaterials(scene, kind, colorValue) {
  const updated = new Set();
  const next = new THREE.Color(colorValue);
  scene.traverse((node) => {
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      if (!material?.isMaterial || updated.has(material)) return;
      if (material.userData?.worldMaterialKind !== kind) return;
      const original = material.userData.worldMaterialOriginalColor;
      const reference = material.userData.worldMaterialReferenceColor;
      if (!original?.isColor || !reference?.isColor || !material.color) return;
      material.color.copy(relativeMaterialColor(original, reference, next));
      updated.add(material);
    });
  });
}

function createWorldSnowPine(height) {
  const storybookSnow = worldConfig().sceneKey === 'snow-valley';
  // 树冠光照交给场景光源：只传基础色与雪帽开关，不做顶点色烘焙
  const treeArt = worldConfig().art?.tree;
  const tree = createSnowPine(height, {
    leafColor: treeArt?.mid ?? worldConfig().materials?.tree,
    trunkColor: treeArt?.trunk,
    snowColor: worldConfig().materials?.snow,
    snowCap: treeArt ? treeArt.snowCap !== false : true,
    snowRoughness: storybookSnow ? 0.95 : undefined,
    leafRoughness: storybookSnow ? 0.92 : undefined,
    treeShader: storybookSnow
      ? { bottomBrightness: 0.9, topBrightness: 1.1, grayMixMax: 0 }
      : undefined
  });
  tree.traverse((node) => {
    const kind = node.material?.userData?.worldMaterialKind;
    if (kind) markWorldMaterial(node.material, kind);
  });
  return tree;
}

function rawPathPoints() {
  return worldConfig().rawPathPoints;
}

function ridgeVillagePlatformMaskAt(x, z, config = worldConfig()) {
  const ridge = config.ridgeVillage;
  if (!ridge) return 0;

  const pathDistance = distanceToPath(x, z, rawPathPoints());
  const halfWidth = ridge.pathHalfWidth ?? 14;
  const edgeBlend = ridge.edgeBlend ?? 3;
  let mask = 1 - smoothstep(halfWidth - edgeBlend, halfWidth + edgeBlend, pathDistance);

  const circleMask = (cx, cz, radius) => (
    1 - smoothstep(radius - edgeBlend * 0.55, radius + edgeBlend, Math.hypot(x - cx, z - cz))
  );

  (config.clearings ?? []).forEach((clearing) => {
    mask = Math.max(mask, circleMask(clearing.x, clearing.z, clearing.r + 0.6));
  });
  (config.altars ?? []).forEach((altar) => {
    const position = altar.position ?? altar;
    // 已落在主山脊上的祭坛不再额外鼓出圆台，避免崖线出现不必要的巨大折角。
    if (distanceToPath(position.x, position.z, rawPathPoints()) < halfWidth - 1.2) return;
    mask = Math.max(mask, circleMask(
      position.x,
      position.z,
      (altar.clearingRadius ?? 6) + 2.6
    ));
  });
  mask = Math.max(
    mask,
    circleMask(config.playerBasePosition.x, config.playerBasePosition.z, 12.4),
    circleMask(config.enemyCampPosition.x, config.enemyCampPosition.z, 10.8)
  );
  (ridge.spurs ?? []).forEach((spur) => {
    const spurDistance = distanceToSegment2D(x, z, spur.from, spur.to);
    mask = Math.max(mask, 1 - smoothstep(
      (spur.halfWidth ?? 3.6) - edgeBlend * 0.45,
      (spur.halfWidth ?? 3.6) + edgeBlend,
      spurDistance
    ));
  });
  return clamp(mask, 0, 1);
}

function ridgeVillageTerrainHeightAt(x, z, config = worldConfig()) {
  const ridge = config.ridgeVillage;
  const mask = ridgeVillagePlatformMaskAt(x, z, config);
  const topRipple =
    Math.sin(x * 0.11 + z * 0.045) * 0.08 +
    Math.cos(x * 0.055 - z * 0.09) * 0.06;
  const forestRipple =
    Math.sin(x * 0.08 + z * 0.06) * 0.34 +
    Math.cos(x * 0.045 - z * 0.075) * 0.28;
  const top = (ridge.plateauTop ?? 5.2) + topRipple;
  const forestFloor = (ridge.forestFloor ?? -7) + forestRipple;
  // 将窄过渡压成近乎垂直的崖缘；显式崖壁会覆盖这段地表连接。
  return mix(forestFloor, top, smoothstep(0.28, 0.72, mask));
}

function updateBakedShadowLightRay(config = worldConfig()) {
  const sunPosition = config.sky?.sunPosition ?? DEFAULT_SUN_POSITION;
  BAKED_SHADOW_TO_SUN.set(sunPosition.x, sunPosition.y, sunPosition.z).normalize();
  BAKED_SHADOW_LIGHT_RAY.copy(BAKED_SHADOW_TO_SUN).multiplyScalar(-1);
}

export function terrainHeightAt(x, z) {
  const config = worldConfig();
  if (config.sceneKey === 'snow-valley' && config.ridgeVillage) {
    return ridgeVillageTerrainHeightAt(x, z, config);
  }
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

  // 雪原起伏：低频雪浪 + 定向垄脊，让开阔地有明确的坡向与光影；
  // 在主路、基地、敌营与冰湖附近淡出，保证通行与广场、湖面平整
  if (config.sceneKey === 'snow-valley') {
    // 基础雪浪：中低频大形体起伏
    const baseSwell =
      Math.sin(x * 0.078 + z * 0.049 + 1.7) * 0.9 +
      Math.cos(x * 0.052 - z * 0.074 + 0.4) * 0.7 +
      Math.sin((x * 0.5 - z) * 0.062 + 2.3) * 0.35;
    // 风蚀纹理：高频噪声模拟风吹雪面形成的波纹与雪脊
    const windFreq = 0.38;
    const windRipple =
      Math.sin(x * windFreq + z * 0.18 + Math.sin(x * 0.09) * 2.1) * 0.22 +
      Math.cos(z * windFreq * 0.8 - x * 0.12 + Math.cos(z * 0.11) * 1.8) * 0.18 +
      Math.sin((x + z) * 0.21 + 3.7) * 0.12;
    // 雪堆隆起：中频团块噪声，形成蓬松雪丘
    const driftFreq = 0.14;
    const driftU = x * driftFreq + 9.3;
    const driftV = z * driftFreq - 4.1;
    const driftX = Math.floor(driftU);
    const driftZ = Math.floor(driftV);
    const driftFx = driftU - driftX;
    const driftFz = driftV - driftZ;
    const smoothDriftFx = driftFx * driftFx * (3 - 2 * driftFx);
    const smoothDriftFz = driftFz * driftFz * (3 - 2 * driftFz);
    const driftNoise =
      (hash2(driftX, driftZ) * (1 - smoothDriftFx) + hash2(driftX + 1, driftZ) * smoothDriftFx) * (1 - smoothDriftFz) +
      (hash2(driftX, driftZ + 1) * (1 - smoothDriftFx) + hash2(driftX + 1, driftZ + 1) * smoothDriftFx) * smoothDriftFz;
    const snowDrift = smoothstep(0.55, 0.92, driftNoise) * 0.45;
    const swell = baseSwell + windRipple + snowDrift;
    let swellKeep =
      smoothstep(3.5, 9, pathDistance) *
      smoothstep(12, 20, Math.hypot(x - config.playerBasePosition.x, z - config.playerBasePosition.z)) *
      smoothstep(10, 18, Math.hypot(x - config.enemyCampPosition.x, z - config.enemyCampPosition.z));
    (config.puddles ?? []).forEach((puddle) => {
      const puddleDistance = Math.hypot(
        (x - puddle.x) / (puddle.rx + 2),
        (z - puddle.z) / (puddle.rz + 2)
      );
      swellKeep *= smoothstep(0.72, 1.3, puddleDistance);
    });
    height += swell * swellKeep;
    // 中央浅谷：谷底略低、两侧山脚略高、温柔起伏；
    // 主路/基地/敌营/祭坛与战斗平台附近淡出，保持平坦可走（量级小，不成碗、不成坡）
    const valleyFeet = smoothstep(14, 30, Math.abs(x)) * 0.7;
    const valleyLow = (1 - smoothstep(0, 14, Math.abs(x))) * -0.35;
    const valleyWave =
      Math.sin(x * 0.05 + z * 0.042) * 0.22 +
      Math.cos(x * 0.068 - z * 0.03) * 0.17 +
      Math.sin((x - z) * 0.037) * 0.14;
    let reliefKeep =
      (1 - smoothstep(5, 11, pathDistance)) +
      (1 - smoothstep(9, 17, Math.hypot(x - (config.playerBasePosition?.x ?? 0), z - (config.playerBasePosition?.z ?? 0)))) +
      (1 - smoothstep(9, 17, Math.hypot(x - (config.enemyCampPosition?.x ?? 0), z - (config.enemyCampPosition?.z ?? 0))));
    (config.clearings ?? []).forEach((c) => {
      reliefKeep = Math.max(reliefKeep, (1 - smoothstep(2.5, 9, Math.hypot(x - c.x, z - c.z))) * 0.9);
    });
    reliefKeep = 1 - Math.min(1, reliefKeep);
    height += (valleyFeet + valleyLow + valleyWave) * Math.max(0.08, reliefKeep);
    // 路径边缘雪檐：主路两侧堆积蓬松积雪，形成自然的雪堤过渡
    const pathEdgeSnow = smoothstep(2.2, 5.5, pathDistance) * (1 - smoothstep(5.5, 11, pathDistance));
    const pathSnowDrift = smoothstep(0.4, 0.85, driftNoise) * 0.35 + 0.15;
    height += pathEdgeSnow * pathSnowDrift * swellKeep * 0.8;
    // 山脚隆起：岩堆/山体下方地形先鼓起成丘，让岩石从雪地里长出来，
    // 而不是硬插在平滑雪原上；与 swell 共用淡出因子，冰面与主路保持平整
    snowHillZones(config.sceneKey).forEach((zone) => {
      if (Number.isFinite(zone.faceX) && Number.isFinite(zone.length)) {
        const rotation = (zone.side === 'left' ? -Math.PI * 0.5 : Math.PI * 0.5) + (zone.rot ?? 0);
        const tangentX = Math.cos(rotation);
        const tangentZ = -Math.sin(rotation);
        const frontX = -Math.sin(rotation);
        const frontZ = -Math.cos(rotation);
        const dx = x - zone.faceX;
        const dz = z - zone.z;
        const along = Math.abs(dx * tangentX + dz * tangentZ);
        const across = Math.abs(dx * frontX + dz * frontZ);
        const alongFade = 1 - smoothstep(zone.length * 0.40, zone.length * 0.56, along);
        const acrossFade = 1 - smoothstep(1.2, 8.5, across);
        height += zone.height * 0.075 * alongFade * acrossFade * swellKeep;
        return;
      }
      const zoneDistance = Math.hypot(x - zone.x, z - zone.z);
      const foothill = 1 - smoothstep(zone.radius * 0.4, zone.radius * 1.55, zoneDistance);
      height += zone.coreHeight * 0.16 * foothill * swellKeep;
    });

    // 只在主路及其交战面上塑形，形成台地→缓坡→浅盆地→目标前坡的推进读法，
    // 且始终保持为可跨越的缓高差，而不是挖出会切断寻路的壕沟。
    const route = terrain.routeProgression;
    if (route) {
      const routeMask = 1 - smoothstep(5.5, 11, pathDistance);
      const sourceShelf = smoothstep(17, 29, z) * route.sourceShelf;
      const basinDistance = Math.hypot(x - route.basinCenter.x, (z - route.basinCenter.z) * 0.82);
      const basin = (1 - smoothstep(route.basinRadius * 0.38, route.basinRadius, basinDistance)) * route.basinDepth;
      const endpointRise = (1 - smoothstep(17, 31, Math.hypot(x - 2.5, z + 31))) * route.endpointRise;
      height += (sourceShelf - basin + endpointRise) * routeMask;
    }
  }

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

  if (config.theme === 'emerald-marsh') {
    const waterMask = marshWaterMaskAt(x, z);
    const waterBed = terrain.waterHeight ?? -0.18;
    return mix(height, waterBed, smoothstep(0.18, 0.76, waterMask));
  }

  if (config.landmass) {
    const landMask = landmassMaskAt(x, z);
    const coastRim = smoothstep(0.48, 0.82, landMask) *
      (1 - smoothstep(0.82, 1, landMask)) *
      (terrain.coastRimHeight ?? 0.48);
    const waterHeight = config.landmass.waterHeight ?? terrain.waterHeight ?? -1.2;
    const landHeight = height + (terrain.landLift ?? 0) + coastRim;

    // 可走陆地 (mask>=0.5) 必须保持陆地高度；此前海岸混合阈值过高会把内陆挖成水坑。
    if (landMask >= WORLD_NAV_LAND_WALK_THRESHOLD) {
      return landHeight;
    }

    const blend = smoothstep(
      terrain.coastBlendStart ?? 0.38,
      terrain.coastBlendEnd ?? 0.54,
      landMask
    );
    return mix(waterHeight, landHeight, blend);
  }

  return Math.max(0, height);
}

function worldSurfaceHeightAt(x, z) {
  if (worldConfig().theme === 'dungeon') {
    return dungeonWalkableHeightAt(x, z);
  }
  if (worldConfig().theme === 'emerald-marsh') {
    const deckHeight = marshBoardwalkDeckHeightAt(x, z, 0.22);
    if (deckHeight != null) return deckHeight;
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
  const isBroadMarsh = config.theme === 'emerald-marsh';
  // 雪地大平面需要更密的网格：约 1.5m 一个面，避免大网格把起伏读成粗糙方块
  const segmentsX = isBroadMarsh ? 192 : Math.max(128, Math.round(config.ground.width / 1.5));
  const segmentsZ = isBroadMarsh ? 188 : Math.max(124, Math.round(config.ground.depth / 1.5));
  const geometry = new THREE.PlaneGeometry(
    config.ground.width,
    config.ground.depth,
    segmentsX,
    segmentsZ
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
  const storybookSnow = worldConfig().sceneKey === 'snow-valley' && !worldConfig().ridgeVillage;
  return applyGroundShader(new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: storybookSnow ? 0.95 : 0.9,
    metalness: 0.0,
    flatShading: worldConfig().ground?.flatShading === true
  }), { storybookSnow });
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

// 只在初始化烘焙地表颜色时使用：让路缘左右轻偏，祭坛/旗帜略放开、两段中景略收，
// 不修改 pathPoints、pathWidth 或任何导航数据。
function snowValleyRoadVisualOffsetAt(x, z) {
  const visual = worldConfig().roadVisual;
  if (!visual) return 0;
  let widening = 0;
  (visual.widenings ?? []).forEach((area) => {
    const fade = 1 - smoothstep(area.radius * 0.42, area.radius, Math.hypot(x - area.x, z - area.z));
    widening = Math.max(widening, area.amount * fade);
  });
  let pinch = 0;
  (visual.pinches ?? []).forEach((area) => {
    const fade = 1 - smoothstep(area.radius * 0.36, area.radius, Math.hypot(x - area.x, z - area.z));
    pinch = Math.max(pinch, area.amount * fade);
  });
  return widening - pinch;
}

function terrainColorAt(x, z, height) {
  const config = worldConfig();
  const palette = config.palette;
  if (config.sceneKey === 'snow-valley' && config.ridgeVillage) {
    const ridge = config.ridgeVillage;
    const platformMask = ridgeVillagePlatformMaskAt(x, z, config);
    const groundNoise = hash2(Math.floor(x * 0.32), Math.floor(z * 0.32));
    const forestColor = new THREE.Color(ridge.forestDark ?? '#123f3c')
      .lerp(new THREE.Color(ridge.forestMid ?? '#1f6557'), groundNoise * 0.34);
    const grassColor = new THREE.Color(ridge.grass ?? '#78ad46')
      .lerp(new THREE.Color(ridge.grassLight ?? '#a4c95d'), groundNoise * 0.3);
    const mountainTop = new THREE.Color(ridge.cliffColor ?? '#f3f1ea')
      .lerp(new THREE.Color('#ffffff'), 0.06 + groundNoise * 0.08);
    const color = forestColor.clone();
    const cliffBand = 1 - smoothstep(0.12, 0.34, Math.abs(platformMask - 0.5));
    color.lerp(new THREE.Color(ridge.cliffColor ?? '#eadfbf'), cliffBand * 0.94);
    const grassRim = smoothstep(0.5, 0.68, platformMask) *
      (1 - smoothstep(0.76, 0.93, platformMask));
    color.lerp(grassColor, grassRim * 0.96);
    const stoneInterior = smoothstep(0.74, 0.94, platformMask);
    color.lerp(mountainTop, stoneInterior * 0.98);
    return color;
  }
  if (config.theme === 'dungeon') {
    return dungeonTerrainColorAt(x, z, height, palette);
  }
  if (config.theme === 'red-desert') {
    return desertTerrainColorAt(x, z, height, palette);
  }
  if (config.theme === 'emerald-marsh') {
    return marshTerrainColorAt(x, z, height, palette);
  }
  const storybookSnow = config.sceneKey === 'snow-valley';
  const color = new THREE.Color(
    storybookSnow
      ? worldMaterialColor('snow', palette.snow)
      : palette.base
  );
  const northMask = northMaskAt(z);
  const sideRise = smoothstep(10, 39, Math.abs(x));
  const snowMask = snowMaskAt(x, z, height);
  const pathDistance = distanceToPath(x, z, rawPathPoints());
  const valleyMask = 1 - smoothstep(7, 22, pathDistance);
  const forestFloor = forestFloorMask(x, z);
  const facet = hash2(x * 0.14, z * 0.14) - 0.5;
  const landMask = landmassMaskAt(x, z);

  if (!storybookSnow) {
    color.lerp(new THREE.Color(palette.side), sideRise * 0.28);
    color.lerp(new THREE.Color(palette.north), northMask * 0.22);
    color.lerp(new THREE.Color(palette.valley), valleyMask * 0.12);
    color.lerp(new THREE.Color(palette.forest), forestFloor * 0.18);
    color.lerp(new THREE.Color(palette.high), smoothstep(4.8, 8.8, height) * 0.24);
    color.lerp(new THREE.Color(palette.snow), 0.48 + snowMask * 0.38);
  } else {
    // 暮色冰河着色：太阳在西南低空，受光雪面镀一层薄金、背光坡面沉入青紫，
    // 但雪地本体必须读作冷调白雪——暖色只作点缀，不能把整片雪原染成沙土色
    const shadeMask = northMask * 0.6 + smoothstep(14, 40, x) * 0.6;
    const litMask = smoothstep(8, 38, -x);
    // 加强冷暖对比：受光面暖金更明显，背光面青紫更深邃
    color.lerp(new THREE.Color('#7d92c4'), shadeMask * 0.52);
    color.lerp(new THREE.Color('#ffe4c0'), litMask * 0.14);
    color.lerp(new THREE.Color('#aebfd0'), forestFloor * 0.16);
    // 雪垄：中频值噪声画出蓬松雪脊（更亮偏暖）与背风雪窝（偏青紫）
    const driftU = x * 0.11 + 9.3;
    const driftV = z * 0.11 - 4.1;
    const driftX = Math.floor(driftU);
    const driftZ = Math.floor(driftV);
    const driftFx = driftU - driftX;
    const driftFz = driftV - driftZ;
    const smoothDriftFx = driftFx * driftFx * (3 - 2 * driftFx);
    const smoothDriftFz = driftFz * driftFz * (3 - 2 * driftFz);
    const driftNoise =
      (hash2(driftX, driftZ) * (1 - smoothDriftFx) + hash2(driftX + 1, driftZ) * smoothDriftFx) * (1 - smoothDriftFz) +
      (hash2(driftX, driftZ + 1) * (1 - smoothDriftFx) + hash2(driftX + 1, driftZ + 1) * smoothDriftFx) * smoothDriftFz;
    // 雪脊高光：更亮的暖白色，模拟蓬松积雪的受光面
    const snowRidgeHighlight = smoothstep(0.58, 0.92, driftNoise);
    color.lerp(new THREE.Color('#f8faff'), snowRidgeHighlight * 0.26);
    // 雪窝阴影：更深的青紫色，增强立体感
    const snowHollowShadow = smoothstep(0.38, 0.08, driftNoise);
    color.lerp(new THREE.Color('#9aaed0'), snowHollowShadow * 0.2);
    // 高度提亮：高处雪面更白更纯净
    color.lerp(new THREE.Color('#f5f8fd'), smoothstep(3.2, 7.5, height) * 0.12);
    // 风蚀纹理着色：高频噪声让雪面呈现风吹过的痕迹
    const windPattern = Math.sin(x * 0.32 + z * 0.18 + Math.sin(x * 0.08) * 1.5) * 0.5 + 0.5;
    const windStreak = smoothstep(0.65, 0.95, windPattern) * 0.08;
    color.lerp(new THREE.Color('#e8edf5'), windStreak);
    // 路径边缘雪堤：主路两侧积雪更白更蓬松
    const pathEdgeMask = smoothstep(2.5, 6, pathDistance) * (1 - smoothstep(6, 12, pathDistance));
    const pathSnowPuff = smoothstep(0.5, 0.88, driftNoise) * pathEdgeMask;
    color.lerp(new THREE.Color('#f2f6fb'), pathSnowPuff * 0.35);
  }

  // Blend path directly into terrain
  if (palette.path) {
    const pathWidthBase = config.pathWidth ?? 3;
    const pathNoise = storybookSnow
      ? (hash2(x * 0.12, z * 0.12) - 0.5) * pathWidthBase * 0.14
      : hash2(x * 0.12, z * 0.12) * 1.5;
    const visualOffset = storybookSnow ? snowValleyRoadVisualOffsetAt(x, z) : 0;
    const pathEdge = smoothstep(
      pathWidthBase * 0.5 + pathNoise + visualOffset,
      pathWidthBase * 0.5 - 1.0 + pathNoise + visualOffset,
      pathDistance
    );
    const pathColor = new THREE.Color(palette.path);
    if (storybookSnow) {
      const camp = config.enemyCampPosition;
      const campApproach = 1 - smoothstep(14, 31, Math.hypot(x - camp.x, z - camp.z));
      pathColor.lerp(new THREE.Color('#8e8780'), campApproach * 0.28);
    }
    color.lerp(pathColor, pathEdge * 0.85);
  }

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
  if (!storybookSnow) {
    color.offsetHSL(0, 0.006 * facet, 0.018 * facet);
  } else {
    // 只留极轻微颗粒防止大面积雪面色带；亮度变化交给平滑的雪垄噪声，
    // 避免逐三角面随机闪变在平地上读成棋盘格
    color.offsetHSL(0, 0.0015 * facet, 0.004 * facet);
  }
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

function marshWaterMaskAt(x, z) {
  const config = worldConfig();
  if (config.theme !== 'emerald-marsh') return 0;

  let poolMask = 0;
  (config.marshPools ?? []).forEach((pool) => {
    const distance = landmassNormalizedDistanceAt(x, z, pool);
    poolMask = Math.max(poolMask, 1 - smoothstep(0.7, 1.03, distance));
  });
  if (poolMask <= 0) return 0;

  const pathDistance = distanceToPath(x, z, rawPathPoints());
  const pathWidth = config.pathWidth ?? 3.15;
  const pathReserve = 1 - smoothstep(pathWidth * 0.48, pathWidth * 0.82 + 0.9, pathDistance);
  const base = config.playerBasePosition;
  const camp = config.enemyCampPosition;
  const baseReserve = 1 - smoothstep(6.8, 9.5, Math.hypot(x - base.x, z - base.z));
  const campReserve = 1 - smoothstep(6.4, 8.8, Math.hypot(x - camp.x, z - camp.z));
  const clearingReserve = (config.clearings ?? []).reduce((best, clearing) => {
    const dryRadius = Math.min(clearing.r * 0.68, 4.4);
    const distance = Math.hypot(x - clearing.x, z - clearing.z);
    return Math.max(best, 1 - smoothstep(dryRadius, dryRadius + 1.5, distance));
  }, 0);
  const dryReserve = Math.max(pathReserve, baseReserve, campReserve, clearingReserve);
  return clamp(poolMask * (1 - dryReserve), 0, 1);
}

function marshBoardwalkDeckHeightAt(x, z, margin = 0) {
  const config = worldConfig();
  if (config.theme !== 'emerald-marsh') return null;
  const boardwalk = (config.marshBoardwalks ?? []).find((item) => (
    distanceToSegment2D(x, z, item.from, item.to) <= (item.width ?? 1.65) * 0.5 + 0.08 + margin
  ));
  return boardwalk ? (config.marshWaterHeight ?? 0.055) + 0.18 : null;
}

function isMarshBoardwalkAt(x, z, margin = 0) {
  return marshBoardwalkDeckHeightAt(x, z, margin) != null;
}

function marshTerrainColorAt(x, z, height, palette) {
  const waterMask = marshWaterMaskAt(x, z);
  const pathDistance = distanceToPath(x, z, rawPathPoints());
  const facet = hash2(Math.floor(x * 0.3), Math.floor(z * 0.3)) - 0.5;
  const broadPatch = hash2(Math.floor(x * 0.085), Math.floor(z * 0.085));
  const color = new THREE.Color(palette.base);
  const wetBank = smoothstep(0.05, 0.4, waterMask) * (1 - smoothstep(0.52, 0.9, waterMask));
  const sideShade = smoothstep(14, 39, Math.abs(x));
  color.lerp(new THREE.Color(palette.side), sideShade * 0.14);
  color.lerp(new THREE.Color(palette.valley), smoothstep(0.56, 0.92, broadPatch) * 0.12);

  // 低频苔藓斑块：双线性插值的值噪声，让大片草地出现柔和的深绿/亮绿分区
  const mossU = x * 0.045 + 31.7;
  const mossV = z * 0.045 - 12.3;
  const mossX = Math.floor(mossU);
  const mossZ = Math.floor(mossV);
  const mossFx = mossU - mossX;
  const mossFz = mossV - mossZ;
  const mossNoise =
    (hash2(mossX, mossZ) * (1 - mossFx) + hash2(mossX + 1, mossZ) * mossFx) * (1 - mossFz) +
    (hash2(mossX, mossZ + 1) * (1 - mossFx) + hash2(mossX + 1, mossZ + 1) * mossFx) * mossFz;
  color.lerp(new THREE.Color(palette.moss ?? '#6d7f52'), smoothstep(0.6, 0.9, mossNoise) * 0.26 * (1 - wetBank * 0.7));

  // 草地色斑：中频值噪声在地面"画"出疏草区（偏黄亮）与密草区（偏暗绿），
  // 代替 3D 草丛物件，俯视角自然且零几何成本
  const grassU = x * 0.13 - 7.4;
  const grassV = z * 0.13 + 19.2;
  const grassX = Math.floor(grassU);
  const grassZ = Math.floor(grassV);
  const grassFx = grassU - grassX;
  const grassFz = grassV - grassZ;
  const smoothFx = grassFx * grassFx * (3 - 2 * grassFx);
  const smoothFz = grassFz * grassFz * (3 - 2 * grassFz);
  const grassNoise =
    (hash2(grassX, grassZ) * (1 - smoothFx) + hash2(grassX + 1, grassZ) * smoothFx) * (1 - smoothFz) +
    (hash2(grassX, grassZ + 1) * (1 - smoothFx) + hash2(grassX + 1, grassZ + 1) * smoothFx) * smoothFz;
  const grassKeep = (1 - wetBank) * smoothstep(1.2, 2.8, pathDistance);
  color.lerp(new THREE.Color('#7c8d58'), smoothstep(0.62, 0.92, grassNoise) * 0.2 * grassKeep);
  color.lerp(new THREE.Color('#4e6247'), smoothstep(0.34, 0.08, grassNoise) * 0.16 * grassKeep);

  color.lerp(new THREE.Color(palette.forest), wetBank * 0.48);
  color.lerp(new THREE.Color(palette.bank ?? '#3f4939'), smoothstep(0.42, 0.82, waterMask) * 0.72);
  color.lerp(new THREE.Color(palette.puddle), smoothstep(0.72, 0.98, waterMask) * 0.42);
  color.lerp(new THREE.Color(palette.high), smoothstep(0.4, 1.3, height) * 0.2);
  color.offsetHSL((broadPatch - 0.5) * 0.01, 0.012 * facet, 0.024 * facet);

  const pathNoise = hash2(x * 0.13, z * 0.13) * 1.2;
  const pathWidth = worldConfig().pathWidth ?? 3.15;
  const pathEdge = smoothstep(pathWidth * 0.5 + pathNoise, pathWidth * 0.5 - 0.72 + pathNoise, pathDistance);
  color.lerp(new THREE.Color(palette.path), pathEdge * 0.74);
  // 主路中线提亮：踩实的路芯比路缘更干、更亮，强化行军引导
  color.lerp(new THREE.Color(palette.pathCenter ?? palette.path), pathEdge * (1 - smoothstep(0.32, 1.1, pathDistance)) * 0.55);
  return color;
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
  if (
    config.sceneKey === 'snow-valley' &&
    config.ridgeVillage &&
    ridgeVillagePlatformMaskAt(x, z, config) < 0.58
  ) return false;
  if (config.landmass && landmassMaskAt(x, z) < WORLD_NAV_LAND_WALK_THRESHOLD) return false;
  if (
    config.theme === 'emerald-marsh' &&
    marshWaterMaskAt(x, z) > 0.36 &&
    !isMarshBoardwalkAt(x, z, 0.22)
  ) return false;
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

function registerRockNavigationBlocker(x, z, size, scale = null) {
  const scaleX = scale?.x ?? 1;
  const scaleZ = scale?.z ?? 1;
  const footprint = Math.max(0.42, size * 0.54 * Math.max(scaleX, scaleZ, 0.72));
  registerWorldNavigationBlocker(x, z, footprint, 'rock');
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
  
  const ridgeVillage = worldConfig().sceneKey === 'snow-valley' && worldConfig().ridgeVillage;
  if (worldConfig().theme !== 'snow' && !ridgeVillage) {
    buildPathRibbon(scene, ribbonPoints, material);
  }

  const theme = worldConfig().theme ?? 'snow';
  const random = seededRandom(worldConfig().seed ?? 8899);
  if (theme === 'snow' && worldConfig().sceneKey === 'snow-valley' && !ridgeVillage) {
    createSnowPathStones(scene, curve, random);
  }
  // 雪谷的道路石已由分组碎石承担，不再额外在中段插入均匀路标石。
  const markerIndices = worldConfig().sceneKey === 'snow-valley'
    ? []
    : theme === 'emerald-marsh' ? [2, 5, 8, 10] : [1, 3, 6, 8];

  for (let i = 0; i < points.length; i += 1) {
    if (!markerIndices.includes(i)) continue;
    const size = 0.42 + (i % 2) * 0.16;
    const marker = (theme === 'snow')
      ? createLowpolySnowRock(size, random, {
          color: worldMaterialColor('rock', '#687378'),
          snowCap: true
        })
      : theme === 'emerald-marsh'
        ? createRock(size, {
            color: '#5f6d5c',
            snowCap: false
          })
        : createRock(size, {
            color: '#7d8788',
            snowCap: true
          });
    const side = i % 2 === 0 ? 1 : -1;
    let x = points[i].x + side * 2.9;
    const z = points[i].z;
    if (theme === 'emerald-marsh' && marshWaterMaskAt(x, z) > 0.3) {
      x = points[i].x - side * 2.9;
    }
    const offset = (theme === 'snow' ? -0.06 * size : 0);
    marker.position.set(x, terrainHeightAt(x, z) + offset, z);
    marker.rotation.y = i * 0.7;
    addStaticCulledObject(scene, marker);
  }
}

function createSnowPathStones(scene, curve, random) {
  const pathWidth = worldConfig().pathWidth ?? 6;
  const batches = [[], [], []];
  // 五组 3–5 块：总量由 36 降至 21，主路中间约 60% 不再有碎石。
  // 每组先读到一颗主石，再由细石收边，组间留出完整雪面而非两条虚线。
  const groups = [
    { t: 0.09, side: -1, count: 4, edgeCount: 3 },
    { t: 0.27, side: 1, count: 4, edgeCount: 3 },
    { t: 0.46, side: -1, count: 5, edgeCount: 4 },
    { t: 0.67, side: 1, count: 4, edgeCount: 3 },
    { t: 0.85, side: -1, count: 4, edgeCount: 4 }
  ];
  const stoneCount = groups.reduce((total, group) => total + group.count, 0);
  const palette = ['#9a9188', '#a89d92', '#8f867e'];
  let stoneIndex = 0;

  groups.forEach((group, groupIndex) => {
    for (let localIndex = 0; localIndex < group.count; localIndex += 1) {
      const t = clamp(group.t + (random() - 0.5) * 0.032, 0.01, 0.99);
      const point = curve.getPoint(t);
      const tangent = curve.getTangent(t).normalize();
      const normalX = -tangent.z;
      const normalZ = tangent.x;
      // 80% 压向外路缘；剩余石头也不跨进中间 60% 的干净通行带。
      const edgeBias = localIndex < group.edgeCount;
      const lateral = group.side * pathWidth * (
        edgeBias ? 0.34 + random() * 0.105 : 0.305 + random() * 0.035
      );
      const along = (random() - 0.5) * (edgeBias ? 1.35 : 0.85);
      const x = point.x + normalX * lateral + tangent.x * along;
      const z = point.z + normalZ * lateral + tangent.z * along;

      const isMainStone = localIndex === 0;
      const size = isMainStone ? 0.4 + random() * 0.3 : 0.15 + random() * 0.15;
      const height = isMainStone ? 0.22 + random() * 0.16 : 0.09 + random() * 0.10;
      const radialSegments = 5 + Math.floor(random() * 2);
      const geometry = new THREE.CylinderGeometry(size * 0.72, size, height, radialSegments, 1, false);
      geometry.translate(0, height * 0.5, 0);

      const baseColor = new THREE.Color(palette[(groupIndex + localIndex) % palette.length]);
      const positions = geometry.attributes.position.array;
      const colors = new Float32Array(positions.length);
      const topThreshold = height * 0.96;
      for (let v = 0; v < positions.length / 3; v += 1) {
        const y = positions[v * 3 + 1];
        if (y >= topThreshold) {
          colors[v * 3] = 0.95;
          colors[v * 3 + 1] = 0.93;
          colors[v * 3 + 2] = 0.90;
        } else {
          colors[v * 3] = baseColor.r;
          colors[v * 3 + 1] = baseColor.g;
          colors[v * 3 + 2] = baseColor.b;
        }
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      geometry.rotateY(Math.atan2(tangent.x, tangent.z) + (random() - 0.5) * 0.28);
      geometry.rotateX((random() - 0.5) * 0.25);
      geometry.rotateZ((random() - 0.5) * 0.20);
      geometry.translate(x, terrainHeightAt(x, z) + 0.02, z);

      batches[stoneIndex % batches.length].push(geometry);
      stoneIndex += 1;
    }
  });

  const stoneMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    flatShading: true
  });

  batches.forEach((geometries) => {
    const merged = mergeGeometries(geometries);
    geometries.forEach((geometry) => geometry.dispose());
    if (!merged) return;
    const stones = new THREE.Mesh(merged, stoneMaterial);
    stones.name = 'SnowValleyPathStones';
    stones.renderOrder = 2;
    addStaticCulledObject(scene, stones);
  });
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
  bakeObjectGroundShadow(group);
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
  const material = markWorldMaterial(overlayMat(worldConfig().palette.snow, {
    roughness: 0.86,
    metalness: 0.02,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    side: THREE.DoubleSide
  }), 'snow');
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
    registerWorldNavigationBlocker(item.x, item.z, item.width * 0.5, 'mountain');
  });
}

function createSnowMountain(scene) {
  (worldConfig().snowPeaks ?? [
    { x: -15, z: -40, width: 5.8, height: 10 },
    { x: 16, z: -40, width: 6.4, height: 12 },
    { x: 4, z: -42, width: 7.4, height: 14 }
  ]).forEach((peakData) => {
    const peak = createMountainPeak(peakData.width, peakData.height, peakData.color);
    placeOnTerrain(peak, peakData.x, peakData.z, -0.1);
    scene.add(peak);
    registerWorldNavigationBlocker(peakData.x, peakData.z, peakData.width * 0.5, 'snow-peak');
  });
}

function createSnowBackdropRocks(scene) {
  const config = worldConfig();
  const random = seededRandom(config.seed ?? 8899);
  
  (worldConfig().backdropRocks ?? []).forEach((item) => {
    const size = item.size ?? 3.6;
    const rock = createLowpolySnowRock(size, random, {
      color: worldMaterialColor('rock', item.color ?? '#687378'),
      snowCap: true,
      snowColor: worldMaterialColor('snow', item.snowColor ?? '#e4e9ed')
    });
    rock.scale.set(item.sx ?? 1, item.sy ?? 1, item.sz ?? 1);
    rock.rotation.y = item.rot ?? 0;
    const brPos = { x: item.x, z: item.z };
    placeOnTerrainOrWall(rock, brPos, (item.offset ?? -0.12) - 0.06 * size, size * 0.5);
    enableDecorationShadows(rock);
    bakeObjectGroundShadow(rock);
    scene.add(rock);
  });
}

// 雪山/山岭/悬崖共用的暮色配色剧本：与地面雪原同一套暖冷关系——
// 西南低空暖阳下受光雪面镀薄金、背阴面沉青紫，岩面低饱和不抢雪原主体。
// 太阳方向与岩石/雪基础色都从世界预设读取，山体与地面永远处于同一光照系统
const SNOW_MOUNTAIN_TINTS = {
  // 受光岩面：低饱和暖灰，与岛内山岭的岩面色族拉近，呼应暮色金光但不发黄棕
  rockLit: '#948c7e',
  rockShade: '#5d5c70', // 背阴岩面：深灰紫，不落成纯黑大片
  snowLit: '#ffdfb0',   // 受光雪面：与地面 lit 色一致
  snowShade: '#8fa2cf'  // 背阴雪面：与地面 shade 色一致
};

function mountainSunDirection() {
  const position = worldConfig().sky?.sunPosition ?? DEFAULT_SUN_POSITION;
  return new THREE.Vector3(position.x, position.y, position.z).normalize();
}

// Flat-shading 山体几何体的逐面着色（几何需已 toNonIndexed 并计算法线）：
// 缓坡与高处积雪、陡壁露岩，受光镀金、背阴青紫，逐面亮度噪声压到极轻，
// 避免斑驳碎噪与平滑雪原地面打架
function paintSnowMountainFaces(geometry, random, options = {}) {
  const {
    sun = mountainSunDirection(),
    heightScale = 1,
    slopeSnowRange = [0.34, 0.55],
    heightSnowRange = [0.5, 0.85],
    heightJitter = 0.16,
    heightWeight = 1,
    patchChance = 0,
    upWeight = 0
  } = options;
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const rock = new THREE.Color(worldMaterialColor('rock', '#7c7f85'));
  const rockLit = new THREE.Color(SNOW_MOUNTAIN_TINTS.rockLit);
  const rockShade = new THREE.Color(SNOW_MOUNTAIN_TINTS.rockShade);
  const snow = new THREE.Color(worldMaterialColor('snow', '#e9eef6'));
  const snowLit = new THREE.Color(SNOW_MOUNTAIN_TINTS.snowLit);
  const snowShade = new THREE.Color(SNOW_MOUNTAIN_TINTS.snowShade);
  const faceColor = new THREE.Color();
  const snowColor = new THREE.Color();
  for (let f = 0; f < pos.count; f += 3) {
    const nx = norm.getX(f);
    const ny = norm.getY(f);
    const nz = norm.getZ(f);
    const dot = nx * sun.x + ny * sun.y * upWeight + nz * sun.z;
    const heightT = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3 / heightScale;
    const face = random();
    if (dot > 0) {
      faceColor.copy(rock).lerp(rockLit, Math.min(1, dot) * 0.7);
    } else {
      faceColor.copy(rock).lerp(rockShade, Math.min(1, -dot) * 0.85);
    }
    const slopeSnow = smoothstep(slopeSnowRange[0], slopeSnowRange[1], ny);
    const heightSnow = smoothstep(heightSnowRange[0], heightSnowRange[1], heightT + (face - 0.5) * heightJitter);
    const patch = patchChance > 0 && face < patchChance && ny < 0.75 ? 0.55 : 1;
    const snowAmount = clamp(Math.max(slopeSnow, heightSnow * heightWeight) * patch, 0, 1);
    snowColor.copy(snow);
    snowColor.lerp(snowLit, clamp(dot + 0.4, 0, 1) * 0.45);
    snowColor.lerp(snowShade, clamp(-dot + 0.1, 0, 1) * 0.45);
    faceColor.lerp(snowColor, snowAmount);
    faceColor.multiplyScalar(0.97 + face * 0.05);
    for (let v = 0; v < 3; v += 1) {
      colors[(f + v) * 3] = faceColor.r;
      colors[(f + v) * 3 + 1] = faceColor.g;
      colors[(f + v) * 3 + 2] = faceColor.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// 对已有逐面着色的山体几何做整体色调晕染，用于区分峡谷近层（暖）与远层（冷）。
function tintGeometryColors(geometry, tintHex, strength = 0.35) {
  if (!geometry.attributes.color) return;
  const tint = new THREE.Color(tintHex);
  const colors = geometry.attributes.color.array;
  const c = new THREE.Color();
  for (let i = 0; i < colors.length; i += 3) {
    c.setRGB(colors[i], colors[i + 1], colors[i + 2]);
    c.lerp(tint, strength);
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }
  geometry.attributes.color.needsUpdate = true;
}

// 低模雪峰几何：不规则脊线 + 山尖偏置 + 逐面着色（向阳暖岩/背阴冷岩/雪线积雪）。
// 雪谷远景环已改用连续雪岭带（createSnowRidgeGeometry）统一造型语言，
// 本函数保留作为孤立尖峰类山体的备用生成器。
// 几何归一化：底面半径 1、高度 1，用 mesh.scale 控制实际尺寸
function createSnowPeakGeometry(random, options = {}) {
  const radialSegments = options.radialSegments ?? (7 + Math.floor(random() * 3));
  const ridges = [];
  for (let i = 0; i < radialSegments; i += 1) {
    ridges.push(0.66 + random() * 0.55);
  }
  // 支棱：1~2 条脊线在底部向外探出，打破圆锥式的对称轮廓
  const buttresses = 1 + Math.floor(random() * 2);
  for (let b = 0; b < buttresses; b += 1) {
    ridges[Math.floor(random() * radialSegments)] *= 1.3 + random() * 0.18;
  }
  const geometry = new THREE.CylinderGeometry(0.12, 1, 1, radialSegments, options.heightSegments ?? 7, false);
  geometry.translate(0, 0.5, 0);
  const apexX = (random() - 0.5) * 0.5;
  const apexZ = (random() - 0.5) * 0.5;
  const twist = (random() - 0.5) * 1.3;
  const ringSeed = random() * 10;
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    let x = position.getX(i);
    const y = position.getY(i);
    let z = position.getZ(i);
    const t = clamp(y, 0, 1);
    const radius = Math.hypot(x, z);
    if (radius < 0.02) {
      if (y > 0.4) {
        x = apexX;
        z = apexZ;
      }
      position.setXYZ(i, x, y, z);
      continue;
    }
    const angle = Math.atan2(z, x) + twist * t;
    const ridgeFloat = ((angle / (Math.PI * 2)) * radialSegments + radialSegments * 8) % radialSegments;
    const indexA = Math.floor(ridgeFloat) % radialSegments;
    const indexB = (indexA + 1) % radialSegments;
    const blend = ridgeFloat - Math.floor(ridgeFloat);
    const ridge = ridges[indexA] * (1 - blend) + ridges[indexB] * blend;
    // 多频沟壑：山腰凹陷 + 随高度收窄，支棱在低处保留、高处收敛
    const buttressFade = ridge > 1 ? (1 - t * 0.55) : 1;
    const ringCarve = 1 - Math.sin(t * Math.PI) * 0.05 +
      Math.sin(t * 8.7 + ringSeed) * 0.045 +
      Math.sin(t * 3.1 + ringSeed * 1.7) * 0.03;
    const taper = 1 - smoothstep(0.5, 1, t) * 0.2;
    const nextRadius = radius * ridge * buttressFade * ringCarve * taper;
    x = Math.cos(angle) * nextRadius + apexX * t * t;
    z = Math.sin(angle) * nextRadius + apexZ * t * t;
    position.setXYZ(i, x, y, z);
  }

  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  if (options.skipColors) return flat;

  // 归一化雪峰：高度坐标即 0..1，平台顶面朝向也计入受光判断
  paintSnowMountainFaces(flat, random, {
    slopeSnowRange: [0.3, 0.52],
    heightSnowRange: [0.34, 0.62],
    upWeight: 0.4
  });
  return flat;
}

// 连续山脉：用一条「高度带」生成山脊连续的雪岭，替代方块台阶堆叠：
// 山脊线峰谷交替、两端渐收埋入雪原，剖面为圆润的雪山馒头形，
// 与地面雪垄的柔和起伏同语言；逐面着色沿用暮色剧本——山顶与缓坡厚雪，
// 只在山脚陡壁露少量冷青岩，向阳雪面镀金、背阴雪面沉入青紫。
// 几何为实际尺寸（length 沿局部 X 轴），mesh 不再缩放
function createSnowRidgeGeometry(random, options = {}) {
  const length = options.length ?? 24;
  const height = options.height ?? 12;
  const depth = options.depth ?? 10;
  const stations = options.stations ?? 8;
  // crestSharp：山脊棱感（0 圆润馒头 → 1 明显山脊切面），近山保留低模棱线，远山更圆
  const crestSharp = options.crestSharp ?? 0.45;
  const halfLength = length / 2;
  const halfDepth = depth / 2;
  const jitterAt = (a, b, scale) => (hash2(a * 12.9 + b * 3.1, b * 9.7 - a * 5.3) - 0.5) * scale;

  // 沿山脊的高度包络：峰谷交替、两端圆润收为零（指数>1 让端点像雪坡沉入地面）
  const phase = random() * Math.PI * 2;
  const waveFreq = 2.1 + random() * 1.2;
  const envelope = [];
  for (let i = 0; i < stations; i += 1) {
    const t = stations === 1 ? 0.5 : i / (stations - 1);
    const endTaper = Math.pow(Math.sin(Math.PI * t), 1.15);
    // 峰谷起伏压低随机锯齿感，读作连绵雪岭而非锯齿石墙
    const jag = 0.72 + Math.sin(t * Math.PI * waveFreq + phase) * 0.18 + (random() - 0.5) * 0.16;
    envelope.push(clamp(jag, 0.42, 1.05) * endTaper);
  }

  // 顶点网格：stations 排 × (2*profile+1) 列，中轴为山脊，两侧向山脚展开
  const profile = 5;
  const cols = profile * 2 + 1;
  const positions = [];
  for (let i = 0; i < stations; i += 1) {
    const t = stations === 1 ? 0.5 : i / (stations - 1);
    const stationH = height * envelope[i];
    const widthK = 0.82 + envelope[i] * 0.34; // 高峰剖面更宽，矮丘收窄
    const crestShift = jitterAt(i, 3.3, 1) * depth * 0.14; // 山脊线左右蛇行（幅度收敛）
    for (let j = 0; j < cols; j += 1) {
      const u = (j / (cols - 1)) * 2 - 1; // -1..1 横剖面
      const absU = Math.abs(u);
      // 山体剖面：cos 馒头形混入脊线切面——山脚缓起、山顶圆润，近山保留低模棱线
      const shape = Math.cos(absU * Math.PI * 0.5) * (1 - crestSharp * 0.45 * absU * absU);
      let x = (t - 0.5) * length + jitterAt(i, j, length * 0.016);
      let z = crestShift + u * halfDepth * widthK + jitterAt(j, i, depth * 0.035);
      let y = stationH * shape;
      // 顶点噪声减半：保留低模趣味但不再产生尖锐棱角
      y += Math.abs(jitterAt(i * 7.7 + j, t * 31, stationH * 0.07)) * (0.3 + shape * 0.7);
      // 山脚裙边沉入地下，避免山体外缘悬空露缝
      if (absU > 0.8) {
        y -= ((absU - 0.8) / 0.2) * height * 0.09;
      }
      positions.push(x, Math.max(y, -height * 0.09), z);
    }
  }

  const indices = [];
  for (let i = 0; i < stations - 1; i += 1) {
    for (let j = 0; j < cols - 1; j += 1) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();

  // 连续山岭：雪线更低、厚雪盖顶，只在山脚陡壁露少量冷青岩，
  // 让山体读作「大雪堆」而不是露岩石山
  paintSnowMountainFaces(flat, random, {
    heightScale: height,
    slopeSnowRange: [0.5, 0.72],
    heightSnowRange: [0.78, 0.98],
    heightJitter: 0.14,
    heightWeight: 1.3,
    patchChance: 0.06
  });
  return flat;
}

// 雪谷远景：沿敌营方向布置错落的三层脊线，而非四周连续围墙。
// 近层只在两翼露角，中层让道路消失在山口，最远层压低并融入雾色。
function createSnowValleyBackdrop(scene, random) {
  const waterY = worldConfig().terrain?.waterHeight ?? -1.28;
  const bands = [
    {
      layer: 'near',
      ridges: [
        { x: -58, z: -4, length: 26, height: 13, depth: 10, rot: 0.22 },
        { x: 55, z: -22, length: 23, height: 11, depth: 9, rot: -0.18 }
      ]
    },
    {
      layer: 'mid',
      ridges: [
        { x: -34, z: -58, length: 30, height: 18, depth: 12, rot: -0.10 },
        { x: 12, z: -61, length: 34, height: 16, depth: 11, rot: 0.08 },
        { x: 47, z: -55, length: 22, height: 14, depth: 10, rot: 0.28 }
      ]
    },
    {
      layer: 'far',
      ridges: [
        { x: -43, z: -84, length: 38, height: 22, depth: 14, rot: -0.06 },
        { x: 1, z: -88, length: 42, height: 19, depth: 13, rot: 0.04 },
        { x: 42, z: -82, length: 33, height: 21, depth: 14, rot: 0.14 }
      ]
    }
  ];
  const nearGeometries = [];
  const midGeometries = [];
  const farGeometries = [];
  bands.forEach((band) => {
    band.ridges.forEach((ridge) => {
      const geometry = createSnowRidgeGeometry(random, {
        length: ridge.length,
        height: ridge.height,
        depth: ridge.depth,
        stations: clamp(Math.round(ridge.length / 4), 6, 10),
        crestSharp: band.layer === 'near' ? 0.5 : (band.layer === 'mid' ? 0.3 : 0.12)
      });
      if (band.layer !== 'near') geometry.deleteAttribute('color');
      geometry.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(ridge.x, waterY - 3.4, ridge.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ridge.rot, 0)),
        new THREE.Vector3(1, 1, 1)
      ));
      (band.layer === 'near' ? nearGeometries : (band.layer === 'mid' ? midGeometries : farGeometries)).push(geometry);
    });
  });
  const addLayer = (geometries, material) => {
    if (geometries.length === 0) return;
    const merged = mergeGeometries(geometries);
    geometries.forEach((geometry) => geometry.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, material);
    mesh.renderOrder = -2;
    scene.add(mesh);
  };
  addLayer(nearGeometries, new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    flatShading: true,
    side: THREE.DoubleSide
  }));
  // 中层：提亮简化，开始融入大气
  addLayer(midGeometries, mat('#c4d0e2', { roughness: 1, flatShading: true }));
  // 远层：更亮更蓝，与天空融合形成大气透视
  addLayer(farGeometries, mat('#d4dce8', { roughness: 1, flatShading: true }));
}

// 低模切面峡谷岩台：由三圈收进、后退的斜面和斜切顶面组成。
// 这是贴地的宽矮 berm，不是垂直 Box；每圈共用轮廓点，所以边角连续无裂缝。
// 把几何体内指向的三角面翻正：法线统一朝体心外侧（否则俯视下背面被剔除/发黑）。
function fixOutwardNormals(geometry, approxHeight) {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  if (!index) return;
  const cx = 0;
  const cy = approxHeight * 0.5;
  const cz = 0;
  const countT = index.count;
  const p = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
  for (let t = 0; t < countT; t += 3) {
    const ia = index.getX(t);
    const ib = index.getX(t + 1);
    const ic = index.getX(t + 2);
    const [ax, ay, az] = p(ia);
    const [bx, by, bz] = p(ib);
    const [dx, dy, dz] = p(ic);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = dx - ax, vy = dy - ay, vz = dz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const fx = (ax + bx + dx) / 3 - cx;
    const fy = (ay + by + dy) / 3 - cy;
    const fz = (az + bz + dz) / 3 - cz;
    if (nx * fx + ny * fy + nz * fz < 0) {
      index.setX(t, ib);
      index.setX(t + 1, ia);
    }
  }
  geometry.computeVertexNormals();
}

// 梯田山体干净配色：平顶（法线朝上）覆雪，陡壁露岩三类，无斑点噪声。
function paintCleanTerraceFaces(geometry, height) {
  const pos = geometry.attributes.position;
  const count = pos.count;
  let color = geometry.attributes.color;
  if (!color) {
    color = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    geometry.setAttribute('color', color);
  }
  const sunDir = worldConfig().art?.sunDirection ?? { x: -0.6, y: 0.4, z: 0.5 };
  const sd = new THREE.Vector3(sunDir.x, sunDir.y, sunDir.z).normalize();
  const snowLit = new THREE.Color('#f2f6fb');
  const snowDark = new THREE.Color('#c2cfdf');
  const rockLit = new THREE.Color('#b7b5af');
  const rockMid = new THREE.Color('#959891');
  const rockDark = new THREE.Color('#5b6774');
  const c = new THREE.Color();
  for (let f = 0; f < count; f += 3) {
    const ax = pos.getX(f), ay = pos.getY(f), az = pos.getZ(f);
    const bx = pos.getX(f + 1), by = pos.getY(f + 1), bz = pos.getZ(f + 1);
    const dx = pos.getX(f + 2), dy = pos.getY(f + 2), dz = pos.getZ(f + 2);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = dx - ax, vy = dy - ay, vz = dz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const cy = (ay + by + dy) / 3;
    const faceYUp = Math.abs(ny);
    const ndl = nx * sd.x + ny * sd.y + nz * sd.z;
    if (faceYUp > 0.6 || cy > height * 0.72) {
      const t = 0.5 + 0.5 * Math.max(-0.4, Math.min(0.6, ndl));
      c.copy(snowDark).lerp(snowLit, t);
    } else if (ndl > 0.12) {
      c.copy(rockLit);
    } else if (ndl > -0.12) {
      c.copy(rockMid);
    } else {
      c.copy(rockDark);
    }
    for (let k = 0; k < 3; k += 1) color.setXYZ(f + k, c.r, c.g, c.b);
  }
  color.needsUpdate = true;
}

const CANYON_WALL_SEGMENTS = [];





function getWallLiftAt(x, z, radius = 0) {
  for (const segment of CANYON_WALL_SEGMENTS) {
    const { band, height, depth, groundY, seg } = segment;
    const isX = band.axis === 'x';
    const halfDepth = depth * 0.5;
    const halfLen = seg.length * 0.5;
    const pad = radius + 0.3;

    let surfaceX = x;
    let surfaceZ = z;
    let inside = false;

    if (isX) {
      const xMin = seg.center - halfLen - radius;
      const xMax = seg.center + halfLen + radius;
      const zMin = band.z - halfDepth - radius;
      const zMax = band.z + halfDepth + radius;
      if (x >= xMin && x <= xMax && z >= zMin && z <= zMax) {
        const valleySide = (z - band.z) * band.side > 0;
        if (valleySide) {
          surfaceZ = band.z + band.side * (halfDepth + pad);
          inside = true;
        }
      }
    } else {
      const xMin = band.x - halfDepth - radius;
      const xMax = band.x + halfDepth + radius;
      const zMin = seg.center - halfLen - radius;
      const zMax = seg.center + halfLen + radius;
      if (x >= xMin && x <= xMax && z >= zMin && z <= zMax) {
        const valleySide = (x - band.x) * band.side < 0;
        if (valleySide) {
          surfaceX = band.x - band.side * (halfDepth + pad);
          inside = true;
        }
      }
    }

    if (inside) {
      return { x: surfaceX, z: surfaceZ, y: groundY + height * 0.5 };
    }
  }
  return null;
}

function placeOnTerrainOrWall(object, pos, offset = 0, radius = 0) {
  const lift = getWallLiftAt(pos.x, pos.z, radius);
  if (lift) {
    object.position.set(lift.x, lift.y + offset, lift.z);
    pos.x = lift.x;
    pos.z = lift.z;
    return;
  }
  placeOnTerrain(object, pos.x, pos.z, offset);
}

// 收集峡谷岩壁需要避让的玩法关键物件（基地、敌营、祭坛、清场区、怪物营地等）。
// 装饰物（岩堆、路边簇、地标石、远景石、散树）不再作为避让对象：岩壁保持完整连续，
// 穿插的装饰物会在放置时被抬升到岩壁表面之上。


// 判断一段峡谷岩壁（沿 Z 轴或 X 轴的长条）是否会与场景物件或主路冲突。




// 雪谷分层岩台：所有山体留在战场外缘，以低矮、宽深的近/中/远三层围出谷地。
// 连续段仍保留端部重叠、明确谷口与四角咬合，并自动避让主路/祭坛/基地/敌营。








function decorate(scene, pathPoints) {
  const random = seededRandom(worldConfig().seed ?? 42);
  if (worldConfig().sceneKey === 'snow-valley' && worldConfig().ridgeVillage) {
    createRidgeVillageEnvironment(scene, pathPoints, random);
    return;
  }
  placeCottages(scene);
  if (worldConfig().sceneKey === 'snow-valley') {
    placePathTotems(scene);
// 路缘积雪：沿主路两侧边缘撒低矮雪堆，模拟长期踩踏形成的雪地道路、边缘被雪侵。
function placeSnowRoadOverlap(scene, pathPoints) {
  const config = worldConfig();
  const random = seededRandom((config.seed ?? 42) + 432);
  const width = config.pathWidth ?? 5.8;
  const pts = (pathPoints && pathPoints.length ? pathPoints : rawPathPoints());
  const n = pts.length;
  if (n < 3) return;
  const count = 20;
  for (let i = 0; i < count; i += 1) {
    const idx = 1 + Math.floor(random() * (n - 2));
    const a = pts[idx - 1];
    const b = pts[idx];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const side = random() < 0.5 ? 1 : -1;
    const lateral = (width * 0.5) * (0.55 + random() * 0.5);
    const tx = a.x + dx * random() - nx * side * lateral + (random() - 0.5) * 0.8;
    const tz = a.z + dz * random() - nz * side * lateral + (random() - 0.5) * 0.8;
    const size = 0.5 + random() * 0.7;
    const mound = createLowpolySnowRock(size, random, {
      color: worldMaterialColor('snow', '#dce3ec'),
      snowCap: true,
      snowColor: worldMaterialColor('snow', '#eef2f6')
    });
    const gy = terrainHeightAt(tx, tz);
    mound.position.set(tx, gy - 0.15 * size, tz);
    mound.rotation.y = random() * Math.PI * 2;
    mound.scale.set(1, 0.55, 1); // 压扁，更像雪堆
    enableDecorationShadows(mound);
    bakeObjectGroundShadow(mound);
    addStaticCulledObject(scene, mound);
  }
}

    createSnowValleyBackdrop(scene, seededRandom((worldConfig().seed ?? 42) + 977));
    placeSnowValleyGroundPatches(scene);
    placeSnowValleyRoadEdges(scene, pathPoints);
    placeSnowValleyRoadsideClusters(scene, pathPoints);
    placeSnowValleyAltarLandings(scene);
    placeSnowValleyCenterAnchor(scene);
  } else {
    placeLegacyPathDecor(scene);
  }
  placeForests(scene, pathPoints, random);
  placeRocks(scene, pathPoints, random);
  placeBoulderClusters(scene, pathPoints, random);
  placeLandmarkBoulders(scene, pathPoints);
  placeBushes(scene, pathPoints, random);
  // placeGrass(scene, pathPoints, random);
  // placeSnowDeadGrass(scene, pathPoints, random);
}

function placeSnowValleyRoadsideClusters(scene, pathPoints) {
  const config = worldConfig();
  const random = seededRandom((config.seed ?? 42) + 521);
  const clusters = config.roadsideClusters ?? [];

  clusters.forEach((cluster) => {
    const pathDistance = distanceToPath(cluster.x, cluster.z, pathPoints);
    if (pathDistance < 5.8 || pathDistance > 18) return;
    if (isAltarClearing(cluster.x, cluster.z)) return;
    const baseClearance = cluster.kind === 'low-rock-face' ? 8.5 : 11;
    if (Math.hypot(cluster.x - config.playerBasePosition.x, cluster.z - config.playerBasePosition.z) < baseClearance) return;
    if (Math.hypot(cluster.x - config.enemyCampPosition.x, cluster.z - config.enemyCampPosition.z) < 8) return;

    const at = (offsetX, offsetZ) => ({ x: cluster.x + offsetX, z: cluster.z + offsetZ });
    const addRock = (offsetX, offsetZ, size, scale = [1, 0.65, 1]) => {
      const point = at(offsetX, offsetZ);
      const rock = createLowpolySnowRock(size, random, {
        color: worldMaterialColor('rock', '#687378'),
        snowCap: true
      });
      rock.scale.set(...scale);
      rock.rotation.y = random() * Math.PI * 2;
      placeOnTerrainOrWall(rock, point, -0.09 * size, size * 0.5);
      addStaticCulledObject(scene, rock, 0.7);
    };
    const addMound = (offsetX, offsetZ, scale = [1, 0.4, 0.8]) => {
      const point = at(offsetX, offsetZ);
      const mound = createLowpolySnowRock(0.82 + random() * 0.18, random, {
        color: worldMaterialColor('snow', '#e6e6dc'),
        snowCap: true,
        snowColor: worldMaterialColor('snow', '#eff2ef')
      });
      mound.scale.set(...scale);
      mound.rotation.y = random() * Math.PI * 2;
      placeOnTerrain(mound, point.x, point.z, -0.1);
      addStaticCulledObject(scene, mound, 0.6);
    };
    const addPine = (offsetX, offsetZ, height, rotation) => {
      const point = at(offsetX, offsetZ);
      const tree = createWorldSnowPine(height);
      tree.rotation.y = rotation;
      placeOnTerrainOrWall(tree, point, 0, 0.42 + height * 0.24);
      addStaticCulledObject(scene, tree, 0.9);
    };

    // 只做 2–4m 的中等组景；不注册导航阻挡，主路和祭坛仍由已有清场规则保证可走。
    switch (cluster.kind) {
      case 'rock-pines-snow':
        addRock(-0.32, 0.1, 1.1, [1.16, 0.6, 0.9]);
        addPine(0.85, 0.55, 1.18, 0.65);
        addPine(1.22, -0.72, 0.92, 2.1);
        addMound(-0.95, -0.75, [1.15, 0.34, 0.8]);
        break;
      case 'fallen-log-stake': {
        const log = createSnowValleyFallenTree(2.8);
        log.rotation.y = -0.52;
        placeOnTerrain(log, cluster.x - 0.15, cluster.z, -0.04);
        addStaticCulledObject(scene, log, 1.1);
        const stake = createSnowValleyOldStake(0.84, random);
        stake.rotation.y = 0.72;
        placeOnTerrain(stake, cluster.x + 1.25, cluster.z + 0.72, -0.02);
        addStaticCulledObject(scene, stake, 0.55);
        addMound(-1.0, 0.72, [1.35, 0.32, 0.72]);
        placeSnowValleyTrackPatch(scene, cluster.x - 0.55, cluster.z - 0.88, -0.16, 1.55, 0.4);
        break;
      }
      case 'broken-fence-drift': {
        const fenceA = createSnowValleyBrokenFence(1.45, random);
        fenceA.rotation.y = -0.24;
        placeOnTerrain(fenceA, cluster.x - 0.65, cluster.z + 0.56, -0.02);
        addStaticCulledObject(scene, fenceA, 0.8);
        const fenceB = createSnowValleyBrokenFence(1.1, random);
        fenceB.rotation.y = 0.64;
        placeOnTerrain(fenceB, cluster.x + 0.92, cluster.z - 0.62, -0.02);
        addStaticCulledObject(scene, fenceB, 0.75);
        addMound(0.05, -0.12, [1.55, 0.34, 0.9]);
        break;
      }
      case 'low-rock-face':
        addRock(-0.1, 0.08, 1.12, [1.42, 0.5, 0.98]);
        addRock(-1.0, -0.54, 0.26, [1.15, 0.48, 0.86]);
        addRock(0.92, -0.64, 0.19, [1, 0.42, 0.82]);
        addRock(0.72, 0.68, 0.28, [0.92, 0.45, 1.08]);
        addMound(-0.82, 0.74, [1.12, 0.3, 0.76]);
        break;
      case 'half-boulder-snow':
        // 中后段道路左侧：半埋主石压住雪堆，两颗碎石收边，不再散放木牌和箱子。
        addRock(-0.16, 0.12, 1.24, [1.34, 0.52, 0.88]);
        addRock(-0.94, -0.58, 0.3, [1.0, 0.4, 0.74]);
        addMound(0.7, 0.58, [1.42, 0.32, 0.86]);
        break;
      case 'foothill-pine-copse':
        // 1 主树 + 2 中树 + 1 矮树：两组的间距/朝向不同，读作依附山脚而非等距绿篱。
        addPine(-0.22, 0.18, 2.08, 0.46);
        addPine(1.14, 0.78, 1.24, 2.28);
        addPine(-1.08, -0.68, 1.08, 5.46);
        addPine(0.58, -1.14, 0.62, 1.48);
        addMound(-0.82, 0.88, [1.02, 0.3, 0.7]);
        break;
      case 'abandoned-sign-crate': {
        const sign = createSnowValleyRoadSign();
        sign.rotation.y = 0.42;
        placeOnTerrain(sign, cluster.x - 0.56, cluster.z + 0.18, -0.02);
        addStaticCulledObject(scene, sign, 0.7);
        const crate = createSnowValleyHalfBuriedCrate();
        crate.rotation.y = -0.3;
        placeOnTerrain(crate, cluster.x + 0.83, cluster.z - 0.52, -0.06);
        addStaticCulledObject(scene, crate, 0.72);
        addMound(0.15, 0.7, [1.25, 0.3, 0.72]);
        break;
      }
      case 'stump-shrub-rock': {
        const stump = createSnowValleyOldStake(1.18, random);
        stump.rotation.y = -0.36;
        placeOnTerrain(stump, cluster.x - 0.45, cluster.z + 0.18, -0.02);
        addStaticCulledObject(scene, stump, 0.6);
        const shrub = createBush(0.54, { leafColor: '#617263', trunkColor: '#4b4033' });
        shrub.rotation.y = 0.72;
        placeOnTerrain(shrub, cluster.x + 0.74, cluster.z + 0.52, 0.02);
        addStaticCulledObject(scene, shrub, 0.62);
        addRock(0.7, -0.72, 0.92, [1.1, 0.56, 0.9]);
        addMound(-0.92, -0.62, [1.08, 0.3, 0.72]);
        break;
      }
      default:
        break;
    }
  });
}

function placeSnowValleyGroundPatches(scene) {
  const patches = worldConfig().snowValleyScenery?.groundPatches ?? [];
  patches.forEach((patch) => {
    const geometry = new THREE.CircleGeometry(1, 10);
    geometry.rotateX(-Math.PI / 2);
    const material = overlayMat(patch.color ?? worldMaterialColor('snow', '#e6e6dc'), {
      transparent: true,
      opacity: patch.opacity ?? 0.18,
      depthWrite: false,
      roughness: 1
    });
    const snowPatch = new THREE.Mesh(geometry, material);
    snowPatch.position.set(patch.x, terrainHeightAt(patch.x, patch.z) + 0.018, patch.z);
    snowPatch.rotation.y = patch.rot ?? 0;
    snowPatch.scale.set(patch.rx, 1, patch.rz);
    snowPatch.receiveShadow = true;
    addStaticCulledObject(scene, snowPatch, 1.2);
  });
}

// Broken low road shoulders have volume, but deliberately never connect into a guardrail.
function placeSnowValleyRoadEdges(scene, pathPoints) {
  const config = worldConfig();
  const random = seededRandom((config.seed ?? 42) + 432);
  const points = pathPoints?.length ? pathPoints : rawPathPoints();
  const edgeProfiles = [
    // 断续侵雪、泥土露头与半埋石交替出现；刻意不在每段两侧各放一枚。
    { segment: 1, t: 0.42, side: -1, length: 1.7, width: 0.78, snow: true },
    { segment: 3, t: 0.34, side: -1, length: 1.28, width: 0.68, soil: true },
    { segment: 4, t: 0.72, side: 1, length: 2.0, width: 0.82, snow: true },
    { segment: 6, t: 0.74, side: 1, length: 1.3, width: 0.72, soil: true },
    { segment: 8, t: 0.68, side: -1, length: 2.05, width: 0.88, snow: true },
    { segment: 9, t: 0.31, side: 1, length: 1.5, width: 0.75, snow: true },
    { segment: 10, t: 0.64, side: -1, length: 1.15, width: 0.78, stone: true }
  ];

  edgeProfiles.forEach((profile) => {
    const a = points[profile.segment];
    const b = points[profile.segment + 1];
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    const edgeOffset = (config.pathWidth ?? 7.2) * 0.5 + 0.78 + random() * 0.42;
    const x = a.x + dx * profile.t + nx * profile.side * edgeOffset;
    const z = a.z + dz * profile.t + nz * profile.side * edgeOffset;
    if (isAltarClearing(x, z)) return;

    const berm = createLowpolySnowRock(profile.stone ? 0.9 + random() * 0.35 : 0.94 + random() * 0.16, random, {
      color: profile.soil ? '#8d9695' : worldMaterialColor('snow', '#e6e6dc'),
      snowCap: profile.snow || profile.stone,
      snowColor: worldMaterialColor('snow', '#eff2ef')
    });
    berm.position.set(x, terrainHeightAt(x, z) - 0.18, z);
    berm.rotation.set((random() - 0.5) * 0.08, Math.atan2(dx, dz), (random() - 0.5) * 0.08);
    berm.scale.set(profile.width, profile.stone ? 0.5 + random() * 0.1 : 0.3 + random() * 0.1, profile.length);
    enableDecorationShadows(berm);
    addStaticCulledObject(scene, berm, 0.7);
  });
}

function placeSnowValleyAltarLandings(scene) {
  const random = seededRandom((worldConfig().seed ?? 42) + 684);
  (worldConfig().altars ?? []).forEach((altar, altarIndex) => {
    const position = altar.position ?? altar;
    const radius = (altar.clearingRadius ?? 5.4) + 0.65;
    const isCentralAltar = altar.type === 'respite';
    const ringCount = isCentralAltar ? 4 : 3;
    const arc = (isCentralAltar ? 142 : 112) * Math.PI / 180;
    // 只占外圈一段 120–160 度的半埋石弧，至少三个方向仍能直接接近祭坛。
    const arcCenter = altar.rotation + (isCentralAltar ? Math.PI * 0.82 : Math.PI * (0.72 + altarIndex * 0.21));
    for (let index = 0; index < ringCount; index += 1) {
      const ratio = ringCount === 1 ? 0.5 : index / (ringCount - 1);
      const angle = arcCenter - arc * 0.5 + ratio * arc + (random() - 0.5) * 0.12;
      const distance = radius + (random() - 0.5) * 0.45;
      const x = position.x + Math.cos(angle) * distance;
      const z = position.z + Math.sin(angle) * distance;
      const stone = createLowpolySnowRock(0.24 + random() * 0.18, random, {
        color: worldMaterialColor('rock', '#687378'),
        snowCap: true
      });
      stone.scale.set(1.05 + random() * 0.22, 0.28 + random() * 0.1, 0.7 + random() * 0.2);
      stone.rotation.y = angle + Math.PI * 0.5 + (random() - 0.5) * 0.45;
      stone.position.set(x, terrainHeightAt(x, z) - 0.12, z);
      addStaticCulledObject(scene, stone, 0.42);
    }

    const accessAngle = arcCenter + Math.PI;
    const steppingCount = isCentralAltar ? 3 : 2;
    for (let index = 0; index < steppingCount; index += 1) {
      const distance = radius + 0.2 + index * 0.62;
      const x = position.x + Math.cos(accessAngle) * distance;
      const z = position.z + Math.sin(accessAngle) * distance;
      const step = createLowpolySnowRock(0.2 + random() * 0.1, random, {
        color: '#879094',
        snowCap: true
      });
      step.scale.set(1.12, 0.22, 0.78);
      step.rotation.y = accessAngle + Math.PI * 0.5;
      step.position.set(x, terrainHeightAt(x, z) - 0.1, z);
      addStaticCulledObject(scene, step, 0.38);
    }

    const stake = createSnowValleyOldStake(0.68 + altarIndex * 0.07, random);
    const stakeAngle = arcCenter + arc * 0.55;
    placeOnTerrain(stake, position.x + Math.cos(stakeAngle) * (radius + 0.65), position.z + Math.sin(stakeAngle) * (radius + 0.65), -0.02);
    stake.rotation.y = stakeAngle;
    addStaticCulledObject(scene, stake, 0.55);
    placeSnowValleyTrackPatch(scene, position.x + Math.cos(accessAngle) * (radius + 0.75), position.z + Math.sin(accessAngle) * (radius + 0.75), accessAngle, 1.35, 0.42);
  });
}

function placeSnowValleyCenterAnchor(scene) {
  const anchor = worldConfig().snowValleyScenery?.centerAnchor;
  if (!anchor) return;
  const log = createSnowValleyFallenTree(anchor.length ?? 3.8);
  log.rotation.y = anchor.rot ?? 0;
  placeOnTerrain(log, anchor.x, anchor.z, -0.04);
  addStaticCulledObject(scene, log, 1.25);
  placeSnowValleyTrackPatch(scene, anchor.x - 0.72, anchor.z + 0.85, (anchor.rot ?? 0) + 0.36, 2.15, 0.42);
}

function placeSnowValleyTrackPatch(scene, x, z, rotation, length, width) {
  const geometry = new THREE.CircleGeometry(1, 8);
  geometry.rotateX(-Math.PI / 2);
  const track = new THREE.Mesh(geometry, overlayMat('#b8c3c5', {
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    roughness: 1
  }));
  track.position.set(x, terrainHeightAt(x, z) + 0.025, z);
  track.rotation.y = rotation;
  track.scale.set(width, 1, length);
  addStaticCulledObject(scene, track, 0.45);
}

function createSnowValleyOldStake(height, random) {
  const group = new THREE.Group();
  const wood = mat('#5a4837', { roughness: 1, flatShading: true });
  const cap = mat(worldMaterialColor('snow', '#e6e6dc'), { roughness: 0.96, flatShading: true });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, height, 5), wood);
  post.position.y = height * 0.5;
  post.rotation.z = (random() - 0.5) * 0.22;
  const snowCap = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.12, 5), cap);
  snowCap.position.set(0, height + 0.025, 0);
  snowCap.rotation.z = post.rotation.z;
  group.add(post, snowCap);
  enableDecorationShadows(group);
  return group;
}

function createSnowValleyBrokenFence(width, random) {
  const group = new THREE.Group();
  const wood = mat('#584332', { roughness: 1, flatShading: true });
  const darkWood = mat('#3f3028', { roughness: 1, flatShading: true });
  const snow = mat(worldMaterialColor('snow', '#e6e6dc'), { roughness: 0.96, flatShading: true });
  [-width * 0.43, width * 0.4].forEach((x, index) => {
    const height = 0.68 + index * 0.13;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.1, height, 5), index ? wood : darkWood);
    post.position.set(x, height * 0.5, 0);
    post.rotation.z = (index ? -1 : 1) * (0.12 + random() * 0.08);
    group.add(post);
  });
  const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, 0.1), wood);
  rail.position.set(0, 0.43, 0.02);
  rail.rotation.z = -0.1;
  const snappedRail = new THREE.Mesh(new THREE.BoxGeometry(width * 0.42, 0.075, 0.075), darkWood);
  snappedRail.position.set(-width * 0.14, 0.74, -0.03);
  snappedRail.rotation.z = 0.17;
  const snowCap = new THREE.Mesh(new THREE.BoxGeometry(width * 0.56, 0.06, 0.14), snow);
  snowCap.position.set(width * 0.14, 0.52, 0.01);
  snowCap.rotation.z = -0.1;
  group.add(rail, snappedRail, snowCap);
  enableDecorationShadows(group);
  return group;
}

function createSnowValleyRoadSign() {
  const group = new THREE.Group();
  const wood = mat('#594333', { roughness: 1, flatShading: true });
  const fadedPaint = mat('#899497', { roughness: 1, flatShading: true });
  const snow = mat(worldMaterialColor('snow', '#e6e6dc'), { roughness: 0.96, flatShading: true });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 1.05, 5), wood);
  post.position.set(0, 0.51, 0);
  post.rotation.z = -0.12;
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.38, 0.09), fadedPaint);
  board.position.set(0.14, 0.91, 0);
  board.rotation.z = 0.08;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.055, 0.13), snow);
  cap.position.set(0.22, 1.13, 0);
  cap.rotation.z = 0.08;
  group.add(post, board, cap);
  enableDecorationShadows(group);
  return group;
}

function createSnowValleyHalfBuriedCrate() {
  const group = new THREE.Group();
  const wood = mat('#65503a', { roughness: 1, flatShading: true });
  const darkWood = mat('#49382c', { roughness: 1, flatShading: true });
  const snow = mat(worldMaterialColor('snow', '#e6e6dc'), { roughness: 0.96, flatShading: true });
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.56, 0.68), wood);
  crate.position.y = 0.16;
  crate.rotation.z = -0.05;
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.59, 0.71), darkWood);
  strap.position.set(0.12, 0.17, 0);
  strap.rotation.z = -0.05;
  const snowCap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.09, 0.48), snow);
  snowCap.position.set(-0.08, 0.47, 0.02);
  snowCap.rotation.z = -0.05;
  group.add(crate, strap, snowCap);
  enableDecorationShadows(group);
  return group;
}

function createSnowValleyFallenTree(length) {
  const group = new THREE.Group();
  const wood = mat('#554232', { roughness: 1, flatShading: true });
  const darkWood = mat('#403128', { roughness: 1, flatShading: true });
  const snow = mat(worldMaterialColor('snow', '#e6e6dc'), { roughness: 0.96, flatShading: true });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, length, 6), wood);
  trunk.rotation.z = Math.PI * 0.5;
  trunk.position.set(0, 0.27, 0);
  const snappedEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.18, 0.18, 6), darkWood);
  snappedEnd.rotation.z = Math.PI * 0.5;
  snappedEnd.position.set(-length * 0.5 - 0.03, 0.27, 0);
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.12, length * 0.46, 5), wood);
  branch.rotation.set(0.52, 0.14, -0.72);
  branch.position.set(length * 0.04, 0.52, 0.26);
  const snowCap = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, length * 0.46, 4, 6), snow);
  snowCap.rotation.z = Math.PI * 0.5;
  snowCap.position.set(0.12, 0.48, 0);
  snowCap.scale.set(1, 0.32, 1);
  group.add(trunk, snappedEnd, branch, snowCap);
  enableDecorationShadows(group);
  return group;
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
    addStaticCulledObject(scene, rubble);
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
    addStaticCulledObject(scene, peak);
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
    addStaticCulledObject(scene, rock);
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
      addStaticCulledObject(scene, rock);
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
    addStaticCulledObject(scene, group);
  });
}

function createDungeonTraps(scene) {
  (worldConfig().mechanics?.traps ?? []).forEach((trap) => {
    const model = trap.type === 'fireVent'
      ? createFireVentModel(trap)
      : createSpikeTrapModel(trap);
    placeOnTerrain(model, trap.x, trap.z, 0.045);
    model.rotation.y = trap.rotation ?? 0;
    addStaticCulledObject(scene, model);
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
    bakeObjectGroundShadow(torch);
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
    bakeObjectGroundShadow(cluster);
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
    addStaticCulledObject(scene, bones);
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
    bakeObjectGroundShadow(campfire);
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

function createMarshDecor(scene, pathPoints) {
  const seed = worldConfig().seed ?? 1409;
  const random = seededRandom(seed);
  createMarshBackdrop(scene, seededRandom(seed + 191));
  createMarshWaterSurface(scene);
  placeMarshMudPatches(scene, pathPoints, random);
  placeMarshHummocks(scene, seededRandom(seed + 71));
  createMarshBoardwalks(scene);
  placeMarshTrees(scene, pathPoints, random);
  placeMarshReeds(scene, pathPoints, random);
  placeMarshLilyPads(scene, random);
  placeMarshLandmarks(scene);
  placeMarshStumps(scene, pathPoints, random);
  placeMarshGroundScatter(scene, pathPoints, seededRandom(seed + 313));
}

// 远景剪影环：场外两层枯林 + 低丘，合并成 3 个 mesh，
// 靠雾效与逐层提亮形成大气透视的远景层次
function createMarshBackdrop(scene, random) {
  const cone = new THREE.ConeGeometry(1, 1, 5);
  cone.translate(0, 0.5, 0);
  const nearGeometries = [];
  const farGeometries = [];
  const hillGeometries = [];

  const treeCount = 96;
  for (let index = 0; index < treeCount; index += 1) {
    const angle = (index / treeCount) * Math.PI * 2 + (random() - 0.5) * 0.14;
    const radius = 54 + random() * 26;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const height = 6.5 + random() * 7;
    const girth = 1.7 + random() * 1.6;
    const geometry = cone.clone();
    geometry.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x, terrainHeightAt(x, z) - 0.4, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, random() * Math.PI * 2, 0)),
      new THREE.Vector3(girth, height, girth)
    ));
    (radius < 68 ? nearGeometries : farGeometries).push(geometry);
  }

  for (let index = 0; index < 9; index += 1) {
    const angle = (index / 9) * Math.PI * 2 + (random() - 0.5) * 0.42;
    const radius = 62 + random() * 20;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const spread = 16 + random() * 14;
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    geometry.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x, terrainHeightAt(x, z) - 1.4, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, random() * Math.PI, 0)),
      new THREE.Vector3(spread, 5 + random() * 4.5, spread * (0.7 + random() * 0.3))
    ));
    hillGeometries.push(geometry);
  }
  cone.dispose();

  const addLayer = (geometries, color) => {
    if (geometries.length === 0) return;
    const merged = mergeGeometries(geometries);
    geometries.forEach((geometry) => geometry.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat(color, { roughness: 1 }));
    mesh.renderOrder = -1;
    scene.add(mesh);
  };
  addLayer(hillGeometries, '#4a5f52');
  addLayer(nearGeometries, '#2f4a40');
  addLayer(farGeometries, '#415a50');
}

function createMarshWaterSurface(scene) {
  const config = worldConfig();
  const bounds = worldNavigationBounds(config);
  const step = 0.92;
  const waterHeight = config.marshWaterHeight ?? 0.055;
  const shallowColor = new THREE.Color(config.palette?.waterShallow ?? '#71906f');
  const deepColor = new THREE.Color(config.palette?.waterDeep ?? '#2c5450');
  const foamColor = new THREE.Color('#96a37e');
  const positions = [];
  const colors = [];
  const indices = [];
  const scratch = new THREE.Color();

  // 顶点色随水深过渡：浅岸绿 → 深潭青，岸缘叠一圈浮沫亮边
  const pushVertexColor = (x, z) => {
    const mask = marshWaterMaskAt(x, z);
    scratch.copy(shallowColor).lerp(deepColor, smoothstep(0.34, 0.94, mask));
    const foam = smoothstep(0.3, 0.46, mask) * (1 - smoothstep(0.52, 0.66, mask));
    scratch.lerp(foamColor, foam * 0.4);
    colors.push(scratch.r, scratch.g, scratch.b);
  };

  for (let x = bounds.minX; x < bounds.maxX; x += step) {
    for (let z = bounds.minZ; z < bounds.maxZ; z += step) {
      const centerX = x + step * 0.5;
      const centerZ = z + step * 0.5;
      if (marshWaterMaskAt(centerX, centerZ) < 0.34) continue;
      const vertexStart = positions.length / 3;
      positions.push(x, waterHeight, z);
      pushVertexColor(x, z);
      positions.push(x + step, waterHeight, z);
      pushVertexColor(x + step, z);
      positions.push(x + step, waterHeight, z + step);
      pushVertexColor(x + step, z + step);
      positions.push(x, waterHeight, z + step);
      pushVertexColor(x, z + step);
      indices.push(
        vertexStart, vertexStart + 2, vertexStart + 1,
        vertexStart, vertexStart + 3, vertexStart + 2
      );
    }
  }

  if (positions.length === 0) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const timeUniform = { value: 0 };
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.34,
    metalness: 0,
    transparent: true,
    opacity: 0.86,
    depthWrite: true
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMarshTime = timeUniform;
    shader.vertexShader = `
      uniform float uMarshTime;
      varying vec3 vMarshWorldPos;
      ${shader.vertexShader}
    `.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vMarshWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      transformed.y += sin(vMarshWorldPos.x * 0.5 + uMarshTime * 0.85 + vMarshWorldPos.z * 0.34) * 0.011
        + sin(vMarshWorldPos.z * 0.66 - uMarshTime * 0.6 + vMarshWorldPos.x * 0.21) * 0.009;
      `
    );
    shader.fragmentShader = `
      uniform float uMarshTime;
      varying vec3 vMarshWorldPos;
      ${shader.fragmentShader}
    `.replace(
      '#include <normal_fragment_begin>',
      `
      #include <normal_fragment_begin>
      {
        float marshWaveDX = cos(vMarshWorldPos.x * 0.5 + uMarshTime * 0.85 + vMarshWorldPos.z * 0.34) * 0.0055
          + cos(vMarshWorldPos.z * 0.66 - uMarshTime * 0.6 + vMarshWorldPos.x * 0.21) * 0.00189;
        float marshWaveDZ = cos(vMarshWorldPos.x * 0.5 + uMarshTime * 0.85 + vMarshWorldPos.z * 0.34) * 0.00374
          + cos(vMarshWorldPos.z * 0.66 - uMarshTime * 0.6 + vMarshWorldPos.x * 0.21) * 0.00594;
        // 放大坡度让高光随波面流动，但不破坏整体平滑感
        vec3 marshWaveNormal = vec3(-marshWaveDX * 26.0, 1.0, -marshWaveDZ * 26.0);
        normal = normalize((viewMatrix * vec4(marshWaveNormal, 0.0)).xyz);
      }
      `
    );
  };
  const water = new THREE.Mesh(geometry, material);
  water.receiveShadow = true;
  water.renderOrder = 2;
  water.userData.updateWorldDecoration = (elapsed) => {
    timeUniform.value = elapsed;
  };
  scene.add(water);
  activeAnimatedDecorations?.push(water);
}

function placeMarshHummocks(scene, random) {
  const mossMaterial = mat('#6b7954', { roughness: 1 });
  const rimMaterial = mat('#4d573f', { roughness: 1 });
  const stoneMaterials = [
    mat('#59645a', { roughness: 1 }),
    mat('#667067', { roughness: 1 })
  ];

  (worldConfig().marshHummocks ?? []).forEach((hummock, hummockIndex) => {
    const rim = createTerrainEllipseMesh(
      { ...hummock, rx: hummock.rx * 1.06, rz: hummock.rz * 1.06 },
      rimMaterial,
      0.027,
      14
    );
    const moss = createTerrainEllipseMesh(hummock, mossMaterial, 0.045, 14);
    rim.renderOrder = 1;
    moss.renderOrder = 2;
    scene.add(rim, moss);

    const treeLayout = [
      { x: -0.24, z: 0.08 },
      { x: 0.12, z: -0.22 },
      { x: 0.27, z: 0.24 }
    ];
    for (let treeIndex = 0; treeIndex < (hummock.trees ?? 1); treeIndex += 1) {
      const local = treeLayout[treeIndex % treeLayout.length];
      const cos = Math.cos(hummock.rot ?? 0);
      const sin = Math.sin(hummock.rot ?? 0);
      const localX = local.x * hummock.rx;
      const localZ = local.z * hummock.rz;
      const x = hummock.x + localX * cos - localZ * sin;
      const z = hummock.z + localX * sin + localZ * cos;
      const tree = createMarshWillow(4.7 + random() * 0.75, false);
      placeOnTerrain(tree, x, z, -0.07);
      tree.rotation.y = random() * Math.PI * 2;
      tree.scale.x *= 0.82 + random() * 0.12;
      tree.scale.z *= 0.82 + random() * 0.12;
      registerWorldNavigationBlocker(x, z, 0.62, `marsh-hummock-tree-${hummockIndex}-${treeIndex}`);
      addStaticCulledObject(scene, tree, 2.8);
    }

    if (hummock.log) {
      const logLength = hummock.rx * 0.72;
      const logAngle = hummock.rot + 0.8;
      const edgeOffset = new THREE.Vector3(-Math.sin(logAngle), 0, Math.cos(logAngle))
        .multiplyScalar(hummock.rz * 0.52);
      const center = new THREE.Vector3(hummock.x, 0, hummock.z).add(edgeOffset);
      const direction = new THREE.Vector3(Math.cos(logAngle), 0.12, Math.sin(logAngle)).multiplyScalar(logLength * 0.5);
      const log = createMarshBeam(
        center.clone().sub(direction),
        center.clone().add(direction),
        0.2,
        mat('#493d30', { roughness: 1 })
      );
      log.position.y += terrainHeightAt(hummock.x, hummock.z) + 0.2;
      addStaticCulledObject(scene, log, 1.8);
    }

    for (let shrubIndex = 0; shrubIndex < 3; shrubIndex += 1) {
      const angle = hummock.rot + shrubIndex * 2.15 + 0.35;
      const x = hummock.x + Math.cos(angle) * hummock.rx * (0.38 + shrubIndex * 0.05);
      const z = hummock.z + Math.sin(angle) * hummock.rz * (0.34 + shrubIndex * 0.05);
      const shrub = createMarshShrub(0.72 + random() * 0.28);
      placeOnTerrain(shrub, x, z, 0.01);
      shrub.rotation.y = random() * Math.PI * 2;
      addStaticCulledObject(scene, shrub, 0.9);
    }

    const detailCount = 7 + (hummockIndex % 3);
    for (let detailIndex = 0; detailIndex < detailCount; detailIndex += 1) {
      const point = randomPointInEllipse({
        ...hummock,
        rx: hummock.rx * 0.78,
        rz: hummock.rz * 0.74
      }, random);
      if (detailIndex % 4 === 0) {
        const size = 0.18 + random() * 0.2;
        const stone = new THREE.Mesh(
          new THREE.DodecahedronGeometry(size, 0),
          stoneMaterials[(detailIndex + hummockIndex) % stoneMaterials.length]
        );
        stone.scale.set(1.25, 0.62, 0.95);
        placeOnTerrain(stone, point.x, point.z, size * 0.18);
        stone.rotation.y = random() * Math.PI * 2;
        addStaticCulledObject(scene, stone, 0.65);
      } else {
        const tussock = createMarshGrassTussock(0.42 + random() * 0.34);
        placeOnTerrain(tussock, point.x, point.z, 0.02);
        tussock.rotation.y = random() * Math.PI * 2;
        addStaticCulledObject(scene, tussock, 0.7);
      }
    }
  });
}

function createMarshShrub(size) {
  const group = new THREE.Group();
  const materials = [
    mat('#426046', { roughness: 0.98 }),
    mat('#527052', { roughness: 0.98 })
  ];
  const layout = [
    [-0.26, 0.22, 0],
    [0.22, 0.27, -0.06],
    [0.02, 0.34, 0.2]
  ];
  layout.forEach(([x, y, z], index) => {
    const leaf = new THREE.Mesh(new THREE.DodecahedronGeometry(size * 0.42, 0), materials[index % materials.length]);
    leaf.position.set(x * size, y * size, z * size);
    leaf.scale.set(1.2, 0.72, 1.05);
    leaf.rotation.y = index * 0.8;
    group.add(leaf);
  });
  return group;
}

function createMarshGrassTussock(height) {
  const group = new THREE.Group();
  const materials = [
    mat('#718054', { roughness: 1 }),
    mat('#84905b', { roughness: 1 }),
    mat('#5d714b', { roughness: 1 })
  ];
  for (let index = 0; index < 5; index += 1) {
    const bladeHeight = height * (0.72 + (index % 3) * 0.14);
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.055, bladeHeight, 4),
      materials[index % materials.length]
    );
    const angle = index * 2.18;
    blade.position.set(Math.cos(angle) * 0.12, bladeHeight * 0.5, Math.sin(angle) * 0.12);
    blade.rotation.z = Math.cos(angle) * 0.16;
    group.add(blade);
  }
  return group;
}

function placeMarshMudPatches(scene, pathPoints, random) {
  const material = mat(worldConfig().palette?.mud ?? '#4b4636', { roughness: 1 });
  let placed = 0;
  for (let attempt = 0; attempt < 120 && placed < 28; attempt += 1) {
    const x = -39 + random() * 78;
    const z = -39 + random() * 78;
    const waterMask = marshWaterMaskAt(x, z);
    if (waterMask < 0.08 || waterMask > 0.42) continue;
    if (distanceToPath(x, z, pathPoints) < 2.5) continue;
    const patch = {
      x,
      z,
      rx: 1.2 + random() * 2.2,
      rz: 0.7 + random() * 1.35,
      rot: random() * Math.PI,
      irregularity: 0.12
    };
    const mesh = createTerrainEllipseMesh(patch, material, 0.035, 12);
    mesh.renderOrder = 1;
    scene.add(mesh);
    placed += 1;
  }
}

function createMarshBoardwalks(scene) {
  const plankMaterial = mat('#66523a', { roughness: 0.96 });
  const darkWood = mat('#3d352a', { roughness: 1 });
  (worldConfig().marshBoardwalks ?? []).forEach((boardwalk) => {
    const from = boardwalk.from;
    const to = boardwalk.to;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz);
    const steps = Math.max(2, Math.ceil(length / 0.62));
    const rotation = Math.atan2(dx, dz);
    const group = new THREE.Group();
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const x = from.x + dx * t;
      const z = from.z + dz * t;
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry((boardwalk.width ?? 1.65) * (0.94 + (index % 3) * 0.025), 0.12, 0.56),
        index % 4 === 0 ? darkWood : plankMaterial
      );
      const deckHeight = marshBoardwalkDeckHeightAt(x, z) ?? worldSurfaceHeightAt(x, z) + 0.12;
      plank.position.set(x, deckHeight - 0.06 + (index % 2) * 0.012, z);
      plank.rotation.y = rotation + ((index % 3) - 1) * 0.018;
      group.add(plank);
    }
    addStaticCulledObject(scene, group, 2.2);
  });
}

function placeMarshTrees(scene, pathPoints, random) {
  (worldConfig().marshTreeZones ?? []).forEach((zone) => {
    // 组团式种植：先选若干丛锚点，树贴着锚点落位，形成有体积感的树丛而非均匀噪声
    const clusterCount = zone.clusters ?? 2;
    const anchors = [];
    for (let cluster = 0; cluster < clusterCount; cluster += 1) {
      // 每丛由一株主树带头、周围伴生小树，形成高低错落的轮廓节奏，避免齐高的"树墙"
      const lead = cluster === 0 || random() < 0.4;
      anchors.push({
        point: randomPointInEllipse(zone, random),
        scale: lead ? 1.02 + random() * 0.2 : 0.76 + random() * 0.24,
        heightBase: lead ? 5.5 + random() * 1.4 : 3.7 + random() * 1.2
      });
    }
    let placed = 0;
    for (let attempt = 0; attempt < zone.count * 5 && placed < zone.count; attempt += 1) {
      const anchor = anchors[Math.floor(random() * anchors.length)];
      const spreadAngle = random() * Math.PI * 2;
      const spreadRadius = random() * random() * 3.2;
      const x = anchor.point.x + Math.cos(spreadAngle) * spreadRadius;
      const z = anchor.point.z + Math.sin(spreadAngle) * spreadRadius;
      if (!isDecorationClear(x, z, pathPoints, 4.2)) continue;
      if (marshWaterMaskAt(x, z) > 0.78) continue;
      const height = (anchor.heightBase + random() * 1.1) * anchor.scale;
      // 小树更容易以疏林形态出现，大树保持饱满冠幅
      const tree = createMarshWillow(height, height < 4.5 && random() > 0.5);
      placeOnTerrain(tree, x, z, -0.08);
      tree.rotation.y = random() * Math.PI * 2;
      tree.scale.x *= (0.9 + random() * 0.22) * anchor.scale;
      tree.scale.z *= (0.9 + random() * 0.2) * anchor.scale;
      addStaticCulledObject(scene, tree, 3.4);
      placed += 1;
    }
    // 林缘游离树：贴树丛外沿零星落一两棵小树，软化林地与空地的边界
    const satellites = zone.count >= 6 ? 2 : 1;
    for (let index = 0; index < satellites; index += 1) {
      const angle = random() * Math.PI * 2;
      const edge = ellipseBoundaryPoint(zone, angle);
      const reach = 0.98 + random() * 0.18;
      const x = zone.x + (edge.x - zone.x) * reach;
      const z = zone.z + (edge.z - zone.z) * reach;
      if (!isDecorationClear(x, z, pathPoints, 4.2)) continue;
      if (marshWaterMaskAt(x, z) > 0.78) continue;
      const tree = createMarshWillow(3.5 + random() * 1.3, random() > 0.45);
      placeOnTerrain(tree, x, z, -0.08);
      tree.rotation.y = random() * Math.PI * 2;
      addStaticCulledObject(scene, tree, 3);
    }
  });
}

function createMarshWillow(height, sparse = false) {
  const group = new THREE.Group();
  const trunkMaterial = mat('#514332', { roughness: 1 });
  const trunkDark = mat('#352f27', { roughness: 1 });
  const leafMaterial = markWorldMaterial(mat(worldMaterialColor('tree', '#3b6045'), { roughness: 0.96 }), 'tree');
  const leafLight = mat('#527353', { roughness: 0.96 });
  const leafDark = mat('#33513a', { roughness: 0.98 });
  const vineMaterial = mat('#426044', { roughness: 1 });
  const vineLight = mat('#58704a', { roughness: 1 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.5, height * 0.56, 7), trunkMaterial);
  trunk.position.y = height * 0.28;
  group.add(trunk);
  for (let rootIndex = 0; rootIndex < 5; rootIndex += 1) {
    const angle = rootIndex * Math.PI * 0.4 + 0.18;
    const buttress = createMarshBeam(
      new THREE.Vector3(0, 0.45, 0),
      new THREE.Vector3(Math.cos(angle) * 0.86, 0.03, Math.sin(angle) * 0.86),
      0.13,
      trunkDark
    );
    group.add(buttress);
  }

  const branchY = height * 0.39;
  const branchPaths = [
    [
      new THREE.Vector3(-height * 0.17, height * 0.56, height * 0.02),
      new THREE.Vector3(-height * 0.34, height * 0.5, height * 0.12)
    ],
    [
      new THREE.Vector3(height * 0.18, height * 0.58, -height * 0.04),
      new THREE.Vector3(height * 0.35, height * 0.51, -height * 0.12)
    ],
    [
      new THREE.Vector3(height * 0.03, height * 0.55, height * 0.17),
      new THREE.Vector3(-height * 0.08, height * 0.48, height * 0.34)
    ]
  ];
  branchPaths.slice(0, sparse ? 2 : 3).forEach(([elbow, tip], index) => {
    const branchMaterial = index === 1 ? trunkDark : trunkMaterial;
    group.add(
      createMarshBeam(
        new THREE.Vector3(0, branchY + index * 0.07, 0),
        elbow,
        0.145 - index * 0.012,
        branchMaterial
      ),
      createMarshBeam(elbow, tip, 0.105 - index * 0.01, branchMaterial)
    );
  });

  const crownLayout = [
    [0, 0.64, 0, 1.28, 0.52, 1.14],
    [-0.24, 0.61, 0.03, 1.2, 0.46, 1.02],
    [0.24, 0.63, -0.04, 1.18, 0.48, 1.02],
    [-0.08, 0.58, 0.22, 1.04, 0.43, 0.98],
    [0.1, 0.67, -0.2, 1, 0.44, 0.94],
    [-0.3, 0.53, 0.14, 0.7, 0.42, 0.72],
    [0.31, 0.54, -0.1, 0.72, 0.42, 0.7]
  ];
  const crownCount = sparse ? 4 : crownLayout.length;
  for (let crownIndex = 0; crownIndex < crownCount; crownIndex += 1) {
    const [x, y, z, sx, sy, sz] = crownLayout[crownIndex];
    const crown = new THREE.Mesh(
      crownIndex % 2 === 0
        ? new THREE.DodecahedronGeometry(1, 0)
        : new THREE.BoxGeometry(1.65, 1.2, 1.55),
      crownIndex === 1 ? leafLight : crownIndex === 4 ? leafDark : leafMaterial
    );
    crown.position.set(x * height, y * height, z * height);
    crown.scale.set(sx * height * 0.175, sy * height * 0.175, sz * height * 0.175);
    crown.rotation.y = crownIndex * 0.73;
    crown.rotation.z = (crownIndex % 2 ? 1 : -1) * 0.045;
    group.add(crown);
  }

  const vineAnchors = [
    [-0.36, 0.61, 0.13, 0.32],
    [0.36, 0.62, -0.1, 0.4],
    [-0.2, 0.64, -0.3, 0.27],
    [0.14, 0.66, 0.31, 0.37],
    [0.4, 0.57, 0.18, 0.29],
    [-0.39, 0.56, -0.12, 0.23],
    [0.04, 0.6, -0.36, 0.34]
  ];
  vineAnchors.slice(0, sparse ? 4 : vineAnchors.length).forEach(([x, y, z, lengthScale], index) => {
    const vineLength = height * lengthScale;
    const vine = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, vineLength, 0.05),
      index % 3 === 0 ? vineLight : vineMaterial
    );
    vine.position.set(x * height, y * height - vineLength * 0.5, z * height);
    vine.rotation.z = (index % 2 ? -1 : 1) * 0.035;
    group.add(vine);
  });
  return group;
}

function placeMarshReeds(scene, pathPoints, random) {
  (worldConfig().marshReedZones ?? []).forEach((zone) => {
    for (let index = 0; index < zone.count; index += 1) {
      // 整体降三成密度：芦苇丛更稀、每丛更壮，读起来是"一丛丛"而不是碎杆噪声
      if (random() < 0.3) continue;
      const { x, z } = randomPointInEllipse(zone, random);
      const waterMask = marshWaterMaskAt(x, z);
      if (waterMask < 0.18 || waterMask > 0.82) continue;
      if (distanceToPath(x, z, pathPoints) < 3.6) continue;
      if (worldConfig().clearings.some((clearing) => Math.hypot(x - clearing.x, z - clearing.z) < clearing.r)) continue;
      const reeds = createMarshReedClump(0.9 + random() * 0.9);
      placeOnTerrain(reeds, x, z, 0.02);
      reeds.rotation.y = random() * Math.PI * 2;
      addStaticCulledObject(scene, reeds, 1.1);
    }
  });
}

function placeMarshLilyPads(scene, random) {
  const waterHeight = worldConfig().marshWaterHeight ?? 0.055;
  const padMaterials = [
    mat('#557544', { roughness: 0.92 }),
    mat('#66844c', { roughness: 0.92 }),
    mat('#45683f', { roughness: 0.94 })
  ];
  (worldConfig().marshPools ?? []).forEach((pool, poolIndex) => {
    const targetCount = Math.max(5, Math.min(12, Math.round((pool.rx + pool.rz) * 0.45)));
    let placed = 0;
    for (let attempt = 0; attempt < targetCount * 5 && placed < targetCount; attempt += 1) {
      const { x, z } = randomPointInEllipse(pool, random);
      if (marshWaterMaskAt(x, z) < 0.62 || isMarshBoardwalkAt(x, z, 0.55)) continue;
      const radius = 0.22 + random() * 0.24;
      const shape = new THREE.Shape();
      const gap = 0.32;
      shape.moveTo(0, 0);
      for (let segment = 0; segment <= 10; segment += 1) {
        const angle = gap + ((Math.PI * 2 - gap * 2) * segment) / 10;
        shape.lineTo(Math.cos(angle), Math.sin(angle));
      }
      shape.lineTo(0, 0);
      const pad = new THREE.Mesh(new THREE.ShapeGeometry(shape), padMaterials[(poolIndex + placed) % padMaterials.length]);
      pad.rotation.x = -Math.PI * 0.5;
      pad.rotation.z = random() * Math.PI * 2;
      pad.scale.setScalar(radius);
      pad.position.set(x, waterHeight + 0.018 + (placed % 3) * 0.002, z);
      pad.renderOrder = 3;
      addStaticCulledObject(scene, pad, 0.55);
      placed += 1;
    }
  });
}

function createMarshReedClump(height) {
  const group = new THREE.Group();
  const stemMaterial = mat('#718251', { roughness: 1 });
  const tipMaterial = mat('#594b35', { roughness: 1 });
  for (let index = 0; index < 5; index += 1) {
    const angle = index * 2.1;
    const offset = 0.09 + (index % 2) * 0.08;
    const stemHeight = height * (0.78 + (index % 3) * 0.11);
    // 茎秆加粗，中远景不再糊成细针噪点
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, stemHeight, 5), stemMaterial);
    stem.position.set(Math.cos(angle) * offset, stemHeight * 0.5, Math.sin(angle) * offset);
    stem.rotation.z = Math.cos(angle) * 0.08;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.24, 5), tipMaterial);
    tip.position.set(stem.position.x, stemHeight + 0.05, stem.position.z);
    tip.rotation.z = stem.rotation.z;
    group.add(stem, tip);
  }
  return group;
}

function placeMarshLandmarks(scene) {
  (worldConfig().marshLandmarks ?? []).forEach((item) => {
    const landmark = item.kind === 'watchtower'
      ? createDrownedWatchtower()
      : item.kind === 'rootArch'
        ? createMarshRootArch()
        : createMarshRootWall();
    placeOnTerrain(landmark, item.x, item.z, 0.02);
    landmark.rotation.y = item.rot ?? 0;
    landmark.scale.setScalar(item.scale ?? 1);
    registerWorldNavigationBlocker(
      item.x,
      item.z,
      (item.kind === 'rootWall' ? 3.2 : item.kind === 'watchtower' ? 2.2 : 1.7) * (item.scale ?? 1),
      `marsh-${item.kind}`
    );
    addStaticCulledObject(scene, landmark, 3.4);
  });
}

function createDrownedWatchtower() {
  const group = new THREE.Group();
  const wood = mat('#514334', { roughness: 1 });
  const darkWood = mat('#312d27', { roughness: 1 });
  const moss = mat('#6f8050', { roughness: 0.98 });
  const posts = [
    [-0.72, -0.62, 2.7],
    [0.72, -0.62, 2.45],
    [-0.72, 0.62, 2.5],
    [0.72, 0.62, 2.8]
  ];
  posts.forEach(([x, z, height], index) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, height, 6), index % 2 ? darkWood : wood);
    post.position.set(x, height * 0.5, z);
    post.rotation.z = (index - 1.5) * 0.025;
    group.add(post);
  });
  const platform = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.2, 1.85), wood);
  platform.position.y = 2.05;
  platform.rotation.z = -0.04;
  const rail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 0.15), darkWood);
  rail.position.set(0, 2.78, -0.82);
  rail.rotation.z = 0.08;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.72, 4), moss);
  roof.position.set(-0.15, 3.36, 0);
  roof.rotation.y = Math.PI * 0.25;
  roof.rotation.z = 0.12;
  group.add(platform, rail, roof);
  return group;
}

function createMarshRootArch() {
  const group = new THREE.Group();
  const rootMaterial = mat('#3b352c', { roughness: 1 });
  const mossMaterial = mat('#66794b', { roughness: 0.96 });
  group.add(
    createMarshBeam(new THREE.Vector3(-1.45, 0, 0), new THREE.Vector3(-0.95, 2.8, 0.06), 0.24, rootMaterial),
    createMarshBeam(new THREE.Vector3(1.35, 0, 0.1), new THREE.Vector3(0.86, 2.65, 0), 0.22, rootMaterial),
    createMarshBeam(new THREE.Vector3(-1.02, 2.72, 0.03), new THREE.Vector3(0.9, 2.62, 0), 0.2, mossMaterial),
    createMarshBeam(new THREE.Vector3(-0.62, 2.64, 0), new THREE.Vector3(0.12, 3.36, -0.04), 0.13, rootMaterial)
  );
  return group;
}

function createMarshRootWall() {
  const group = new THREE.Group();
  const rootMaterial = mat('#302f28', { roughness: 1 });
  const mossMaterial = mat('#596c45', { roughness: 0.98 });
  for (let index = 0; index < 9; index += 1) {
    const x = -4.3 + index * 1.05;
    const height = 2.4 + ((index * 5) % 6) * 0.42;
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, height, 6), index % 3 === 0 ? mossMaterial : rootMaterial);
    root.position.set(x, height * 0.5, (index % 2) * 0.3);
    root.rotation.z = (index % 2 ? -1 : 1) * (0.08 + (index % 3) * 0.035);
    group.add(root);
  }
  group.add(createMarshBeam(new THREE.Vector3(-4, 2.1, 0), new THREE.Vector3(4.1, 2.7, 0.2), 0.18, rootMaterial));
  return group;
}

function placeMarshStumps(scene, pathPoints, random) {
  for (let index = 0; index < 26; index += 1) {
    const x = -36 + random() * 72;
    const z = -36 + random() * 72;
    if (!isDecorationClear(x, z, pathPoints, 4.8)) continue;
    if (marshWaterMaskAt(x, z) > 0.44) continue;
    const height = 0.45 + random() * 0.75;
    const stump = new THREE.Group();
    const wood = mat(index % 3 === 0 ? '#4b4233' : '#3a352c', { roughness: 1 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, height, 6), wood);
    trunk.position.y = height * 0.5;
    trunk.rotation.z = (random() - 0.5) * 0.16;
    stump.add(trunk);
    if (index % 2 === 0) {
      stump.add(createMarshBeam(new THREE.Vector3(0, height * 0.7, 0), new THREE.Vector3(0.55, height + 0.38, 0.08), 0.08, wood));
    }
    placeOnTerrain(stump, x, z, -0.02);
    stump.rotation.y = random() * Math.PI * 2;
    addStaticCulledObject(scene, stump, 1.2);
  }
}

// 地面散布：色斑、碎石、倒木与低灌木覆盖干燥地面；
// 草地本身由地形顶点色的草斑噪声表现，不再摆放 3D 草丛（俯视角会读成碎块）
function placeMarshGroundScatter(scene, pathPoints, random) {
  const config = worldConfig();
  const stoneMaterial = mat('#5d675c', { roughness: 1 });
  const branchMaterial = mat('#4a3d2e', { roughness: 1 });
  // 共享几何体 + 缓存材质，静态批处理能按签名合批
  const stoneGeometry = new THREE.DodecahedronGeometry(0.16, 0);

  const canScatterAt = (x, z, pathClearance) => {
    if (marshWaterMaskAt(x, z) > 0.3) return false;
    if (isMarshBoardwalkAt(x, z, 0.5)) return false;
    if (distanceToPath(x, z, pathPoints) < pathClearance) return false;
    if (Math.hypot(x - config.playerBasePosition.x, z - config.playerBasePosition.z) < 5.5) return false;
    if (Math.hypot(x - config.enemyCampPosition.x, z - config.enemyCampPosition.z) < 6) return false;
    return true;
  };

  const placeStone = (x, z) => {
    const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
    const size = 0.5 + random() * 1.25;
    stone.scale.set(size * 1.25, size * 0.5, size * 0.9);
    placeOnTerrain(stone, x, z, size * 0.1);
    stone.rotation.y = random() * Math.PI * 2;
    addStaticCulledObject(scene, stone, 0.7);
  };

  const placeFallenBranch = (x, z) => {
    const branch = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.08, 1.2 + random() * 1.5),
      branchMaterial
    );
    placeOnTerrain(branch, x, z, 0.03);
    branch.rotation.y = random() * Math.PI * 2;
    branch.rotation.x = (random() - 0.5) * 0.1;
    addStaticCulledObject(scene, branch, 1);
  };

  // 1) 地被色斑：低饱和的苔绿/枯黄色块打破大面积单调草地，中远景也能读出来
  const coverMaterials = [
    mat('#74855b', { roughness: 1 }),
    mat('#57684a', { roughness: 1 }),
    mat('#7a7a52', { roughness: 1 })
  ];
  let coverPlaced = 0;
  for (let attempt = 0; attempt < 240 && coverPlaced < 30; attempt += 1) {
    const x = -39 + random() * 78;
    const z = -39 + random() * 78;
    if (!canScatterAt(x, z, 2.6)) continue;
    const patch = {
      x,
      z,
      rx: 1.4 + random() * 2.6,
      rz: 0.9 + random() * 1.7,
      rot: random() * Math.PI,
      irregularity: 0.16
    };
    const mesh = createTerrainEllipseMesh(patch, coverMaterials[Math.floor(random() * coverMaterials.length)], 0.03, 12);
    mesh.renderOrder = 1;
    scene.add(mesh);
    coverPlaced += 1;
  }

  // 2) 碎石与倒木：点状细节填充中景空地
  let stonePlaced = 0;
  for (let attempt = 0; attempt < 420 && stonePlaced < 72; attempt += 1) {
    const x = -40 + random() * 80;
    const z = -40 + random() * 80;
    if (!canScatterAt(x, z, 2.6)) continue;
    placeStone(x, z);
    stonePlaced += 1;
  }
  let branchPlaced = 0;
  for (let attempt = 0; attempt < 190 && branchPlaced < 30; attempt += 1) {
    const x = -38 + random() * 76;
    const z = -38 + random() * 76;
    if (!canScatterAt(x, z, 2.8)) continue;
    placeFallenBranch(x, z);
    branchPlaced += 1;
  }

  // 3) 低灌木：填补树丛边缘与中景空白
  let shrubPlaced = 0;
  for (let attempt = 0; attempt < 400 && shrubPlaced < 50; attempt += 1) {
    const x = -38 + random() * 76;
    const z = -38 + random() * 76;
    if (!canScatterAt(x, z, 3.4)) continue;
    const shrub = createMarshShrub(0.6 + random() * 0.45);
    placeOnTerrain(shrub, x, z, 0.01);
    shrub.rotation.y = random() * Math.PI * 2;
    addStaticCulledObject(scene, shrub, 1);
    shrubPlaced += 1;
  }
}

function createMarshBeam(start, end, radius, material) {
  const direction = end.clone().sub(start);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.82, radius, direction.length(), 6),
    material
  );
  beam.position.copy(start).lerp(end, 0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return beam;
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
    addStaticCulledObject(scene, rock);
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
      addStaticCulledObject(scene, rock);
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
    addStaticCulledObject(scene, landmark);
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
      addStaticCulledObject(scene, pillar);
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
    addStaticCulledObject(scene, column);
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
      addStaticCulledObject(scene, pebble);
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
      addStaticCulledObject(scene, cactus);
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
    addStaticCulledObject(scene, scrub);
  }
}

function placeForests(scene, pathPoints, random) {
  const hillZones = snowHillZones();

  worldConfig().forestZones.forEach((zone) => {
    const maxIterations = Math.floor(
      zone.count * (worldConfig().sceneKey === 'snow-valley' ? 2.2 : 1.4)
    );
    let successfullyPlaced = 0;

    for (let i = 0; i < maxIterations; i += 1) {
      if (successfullyPlaced >= zone.count) break;

      const point = randomPointInEllipse(zone, random);
      if (!point) continue;
      let { x, z } = point;

      // Push point if it falls inside any of the rocky mountain / hill zones
      for (const hill of hillZones) {
        const dx = x - hill.x;
        const dz = z - hill.z;
        const dist = Math.hypot(dx, dz);
        const minAllowedRadius = hill.radius + 1.2;
        if (dist < minAllowedRadius) {
          // Push it out to the surrounding belt
          const pushDist = minAllowedRadius + 0.5 + random() * 3.5;
          if (dist > 0.01) {
            x = hill.x + (dx / dist) * pushDist;
            z = hill.z + (dz / dist) * pushDist;
          } else {
            const angle = random() * Math.PI * 2;
            x = hill.x + Math.cos(angle) * pushDist;
            z = hill.z + Math.sin(angle) * pushDist;
          }
        }
      }

      // Ensure within map boundaries after push
      if (Math.abs(x) > 44 || Math.abs(z) > 44) continue;

      if (!isDecorationClear(x, z, pathPoints, zone.tone === 'snow' ? 3.8 : 3.5)) continue;
      if (isForestPassage(x, z, pathPoints)) continue;
      if (!isForestZonePointKept(zone, x, z, random)) continue;

      // 高树带头、矮树伴生的高低错落，避免齐高的树墙
      const leader = zone.tone !== 'snow' && random() < 0.24;
      const height = zone.tone === 'snow'
        ? 0.76 + random() * 0.9
        : leader
          ? 2.0 + random() * 0.7
          : 0.72 + random() * 1.15;
      const tree = createWorldSnowPine(height);
      const pos = { x, z };
      placeOnTerrainOrWall(tree, pos, 0, 0.42 + height * 0.24);
      tree.rotation.y = random() * Math.PI * 2;
      addStaticCulledObject(scene, tree);
      registerWorldNavigationBlocker(pos.x, pos.z, 0.42 + height * 0.24, 'snow-tree');
      successfullyPlaced += 1;
    }
  });
}

function isForestZonePointKept(zone, x, z, random) {
  // If the point is in the foothills belt of any hill/cliff, highly prefer keeping it!
  const hillZones = snowHillZones();
  
  let inFoothill = false;
  let foothillDensityFactor = 1.0;
  
  for (const hill of hillZones) {
    const dist = Math.hypot(x - hill.x, z - hill.z);
    
    // Very close to rock edge: keep sparse/scattered trees
    if (dist >= hill.radius + 0.8 && dist < hill.radius + 2.2) {
      return random() < 0.28; // scattered trees at rock edge
    }
    
    // Middle foothill zone: natural clusters
    if (dist >= hill.radius + 2.2 && dist < hill.radius + 5.5) {
      inFoothill = true;
      foothillDensityFactor = 0.55; // reduce wall effect, make it clustered and open
      break;
    }
  }

  const raggedness = zone.raggedness ?? 0;
  const effectiveRaggedness = inFoothill ? 0.5 : raggedness;
  
  const distance = normalizedEllipseDistanceAt(x, z, zone);
  const edgeMask = smoothstep(zone.edgeStart ?? 0.4, 1, distance);
  
  // Larger noise scale for clustering
  const clusterNoise = hash2(
    Math.floor(x * 0.35),
    Math.floor(z * 0.35)
  );
  
  // Ragged outer edge
  const cellNoise = hash2(
    Math.floor((x + (zone.x ?? 0)) * 0.22),
    Math.floor((z - (zone.z ?? 0)) * 0.22)
  );
  
  if (!inFoothill && distance + (cellNoise - 0.5) * effectiveRaggedness > 1) return false;
  
  // Cluster probability: lower near edges, modified by noise
  const densityThreshold = inFoothill ? 0.35 : (distance * 0.7);
  if (clusterNoise < densityThreshold) return false;
  
  // Extra edge drop
  if (!inFoothill && edgeMask > 0 && random() < edgeMask * (zone.edgeDrop ?? 0.6)) return false;
  
  // Apply our foothill density scaling for beautiful clustering
  if (inFoothill && random() > foothillDensityFactor) return false;
  
  return true;
}

function isNearCliff(x, z, padding = 2.0) {
  const hillZones = snowHillZones();
  for (const zone of hillZones) {
    const dist = Math.hypot(x - zone.x, z - zone.z);
    if (dist < (zone.radius + padding)) {
      return true;
    }
  }
  return false;
}

function createLowpolySnowRock(size = 1, random, options = {}) {
  const group = new THREE.Group();
  
  // 冰川漂磈式轮廓：不对称、带中段棱面与顶部剪切，避免圆桶感
  const h = size * (0.75 + random() * 0.5); 
  const numSides = 5 + Math.floor(random() * 3); 
  
  const topR = size * 0.28; 
  const botR = size * 0.6;
  
  const rockRatio = options.snowCap ? 0.84 : 1.0;
  const rockH = h * rockRatio;
  const snowH = h * (1 - rockRatio);
  const midR = botR + (topR - botR) * rockRatio;
  
  const bottomSegmentOffsets = [];
  const midSegmentOffsets = [];
  const middleSegmentOffsets = [];
  const topSegmentOffsets = [];
  const segmentBreaks = [];
  const topTiltAngle = random() * Math.PI * 2;
  const shear = (random() - 0.5) * 0.34;
  const shearX = Math.cos(topTiltAngle) * shear;
  const shearZ = Math.sin(topTiltAngle) * shear;
  
  for (let s = 0; s <= numSides; s++) {
    const baseOffset = 0.78 + random() * 0.44;
    bottomSegmentOffsets.push(baseOffset * (0.92 + random() * 0.16));
    midSegmentOffsets.push(baseOffset * (0.96 + random() * 0.12));
    middleSegmentOffsets.push(baseOffset * (0.9 + random() * 0.2));
    topSegmentOffsets.push(baseOffset * (0.88 + random() * 0.24));
    segmentBreaks.push(random() < 0.25 ? (0.15 + random() * 0.5) : 0);
  }
  
  const deformGeo = (geo, isSnow) => {
    geo = geo.toNonIndexed();
    const pos = geo.attributes.position;
    const geoH = geo.parameters?.height ?? h;
    for (let v = 0; v < pos.count; v++) {
      let vx = pos.getX(v);
      let vy = pos.getY(v);
      let vz = pos.getZ(v);
      const heightT = clamp((vy + geoH * 0.5) / geoH, 0, 1);
      
      if (Math.abs(vx) < 0.001 && Math.abs(vz) < 0.001) {
        if (isSnow && vy > 0.001) {
          const tiltVal = (vx * Math.cos(topTiltAngle) + vz * Math.sin(topTiltAngle)) * 0.12;
          pos.setY(v, vy + tiltVal);
        }
        continue;
      }
      
      const angle = Math.atan2(vz, vx);
      const angleNormalized = (angle + Math.PI) / (Math.PI * 2);
      const segment = Math.round(angleNormalized * numSides) % numSides;
      
      let offset;
      if (isSnow) {
        if (vy > 0.001) {
          offset = topSegmentOffsets[segment];
          const tiltVal = (vx * Math.cos(topTiltAngle) + vz * Math.sin(topTiltAngle)) * 0.12;
          vy += tiltVal;
          if (segmentBreaks[segment] > 0) {
            vy -= snowH * segmentBreaks[segment];
          }
          pos.setY(v, vy);
        } else {
          offset = midSegmentOffsets[segment];
        }
      } else if (heightT > 0.72) {
        offset = midSegmentOffsets[segment];
        vx += shearX * geoH * 0.5;
        vz += shearZ * geoH * 0.5;
      } else if (heightT > 0.28) {
        offset = middleSegmentOffsets[segment];
        vx += shearX * geoH * 0.22;
        vz += shearZ * geoH * 0.22;
      } else {
        offset = bottomSegmentOffsets[segment];
      }
      
      pos.setX(v, vx * offset);
      pos.setZ(v, vz * offset);
    }
    geo.computeVertexNormals();
    return geo;
  };

  // 岩石三段光照色阶从统一 art 色板读取，光照烘焙进顶点色
  const rockArt = worldConfig().art?.rock;
  const rockSunlit = rockArt?.sunlit ?? '#a87868';
  const rockMid = rockArt?.mid ?? '#8a6858';
  const rockShadow = rockArt?.shadow ?? '#5a4848';
  
  let rockGeo = new THREE.CylinderGeometry(midR, botR, rockH, numSides, 2);
  rockGeo = deformGeo(rockGeo, false);
  bakeWarmLighting(rockGeo, rockSunlit, rockMid, rockShadow, worldConfig().art?.sunDirection);
  const rockMat = markWorldMaterial(mat(0xffffff, { vertexColors: true }), 'rock');
  const rockMesh = new THREE.Mesh(rockGeo, rockMat);
  rockMesh.position.y = rockH * 0.5;
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  group.add(rockMesh);
  
  if (options.snowCap) {
    let snowGeo = new THREE.CylinderGeometry(topR, midR * 1.08, snowH, numSides, 1);
    snowGeo = deformGeo(snowGeo, true);
    const snowColor = options.snowColor ?? rockArt?.snowCap ?? worldMaterialColor('snow', '#f2e8de');
    const snowMesh = new THREE.Mesh(snowGeo, markWorldMaterial(mat(snowColor), 'snow'));
    snowMesh.position.y = rockH + snowH * 0.5;
    snowMesh.castShadow = true;
    snowMesh.receiveShadow = true;
    group.add(snowMesh);
  }
  
  group.rotation.x = (random() - 0.5) * 0.18;
  group.rotation.z = (random() - 0.5) * 0.18;
  
  return group;
}

// 路标石阵锚点：主路转折外侧各立一组巨石，标记路线节奏、引导视线；
// 坐标都落在离主路 3~8m 的路肩带，避开开阔地圆与祭坛清场
const SNOW_VALLEY_ROCK_WAYPOINTS = [
  { x: -12.5, z: 28, size: 1.9 },   // 基地出口西翼
  { x: -20.5, z: 15, size: 2.1 },   // 西岸转折外侧
  { x: -18.5, z: 0.5, size: 1.8 },  // 隘口前西侧
  { x: -8, z: 3.5, size: 1.6 },     // 雪桥隘口南岸锚点
  { x: 15.5, z: -13.5, size: 2.0 }, // 东岸直道外侧
  { x: 4, z: -20.5, size: 1.5 },    // 渡河北岸
  { x: 13.5, z: -26.5, size: 1.8 }  // 敌营前庭外侧东
];

// 雪谷重制的岩石布局：废除全场均匀随机撒石，改用构图锚点——
// 转折路标石阵引导视线，冰川河沿岸漂石勾勒河岸，每块石头都有存在理由
function placeSnowValleyWaypointRocks(scene, pathPoints, random) {
  SNOW_VALLEY_ROCK_WAYPOINTS.forEach((anchor) => {
    const pathDist = distanceToPath(anchor.x, anchor.z, pathPoints);
    if (pathDist < 3 || pathDist > 8) return;
    const main = createLowpolySnowRock(anchor.size, random, {
      color: worldMaterialColor('rock', random() > 0.45 ? '#687378' : '#748083'),
      snowCap: true
    });
    const anchorPos = { x: anchor.x, z: anchor.z };
    placeOnTerrainOrWall(main, anchorPos, -0.06 * anchor.size, anchor.size * 0.5);
    main.rotation.y = random() * Math.PI * 2;
    main.scale.y *= 0.82 + random() * 0.3;
    registerRockNavigationBlocker(anchorPos.x, anchorPos.z, anchor.size, main.scale);
    addStaticCulledObject(scene, main);
    // 1~2 块伴石呼应主石，读作一组而非孤石
    const companions = 1 + Math.floor(random() * 2);
    for (let i = 0; i < companions; i += 1) {
      const angle = random() * Math.PI * 2;
      const dist = anchor.size * (0.9 + random() * 0.7);
      const x = anchor.x + Math.cos(angle) * dist;
      const z = anchor.z + Math.sin(angle) * dist;
      if (!isDecorationClear(x, z, pathPoints, 2.4)) continue;
      const size = anchor.size * (0.32 + random() * 0.3);
      const rock = createLowpolySnowRock(size, random, {
        color: worldMaterialColor('rock', '#687378'),
        snowCap: random() > 0.3
      });
      const cPos = { x, z };
      placeOnTerrainOrWall(rock, cPos, -0.05 * size, size * 0.5);
      rock.rotation.y = random() * Math.PI * 2;
      addStaticCulledObject(scene, rock);
    }
  });
  // 冰川河岸漂石：沿每段冰面外缘摆一圈低矮石块，读作河水冲刷的岸石
  (worldConfig().puddles ?? []).forEach((puddle) => {
    const count = 4 + Math.floor(random() * 2);
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const k = 1.12 + random() * 0.26;
      const cos = Math.cos(puddle.rot ?? 0);
      const sin = Math.sin(puddle.rot ?? 0);
      const lx = Math.cos(angle) * puddle.rx * k;
      const lz = Math.sin(angle) * puddle.rz * k;
      const x = puddle.x + lx * cos - lz * sin;
      const z = puddle.z + lx * sin + lz * cos;
      if (!isDecorationClear(x, z, pathPoints, 2.4)) continue;
      if (isAltarClearing(x, z)) continue;
      const size = 0.8 + random() * 0.9;
      const rock = createLowpolySnowRock(size, random, {
        color: worldMaterialColor('rock', random() > 0.5 ? '#687378' : '#748083'),
        snowCap: random() > 0.45
      });
      const pPos = { x, z };
      placeOnTerrainOrWall(rock, pPos, -0.1 * size, size * 0.5);
      rock.rotation.y = random() * Math.PI * 2;
      rock.scale.y *= 0.5 + random() * 0.22; // 压扁：岸石感
      addStaticCulledObject(scene, rock);
    }
  });
}

function placeRocks(scene, pathPoints, random) {
  const config = worldConfig();
  const theme = config.theme ?? 'snow';
  if (config.sceneKey === 'snow-valley') {
    placeSnowValleyWaypointRocks(scene, pathPoints, random);
    return;
  }
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
    if (theme === 'snow' && isNearCliff(x, z, 3.5)) continue;
    const elevation = terrainHeightAt(x, z);
    if (!ridgeBias && elevation < 2.6 && random() > 0.35) continue;
    const size = 0.42 + random() * (z < -22 ? 1.28 : 0.88);
    
    const rock = (theme === 'snow')
      ? createLowpolySnowRock(size, random, {
          color: worldMaterialColor('rock', random() > 0.45 ? '#687378' : '#748083'),
          snowCap: random() > 0.35
        })
      : createRock(size, {
          color: random() > 0.45 ? '#748083' : '#858b84',
          snowCap: random() > 0.35
        });
        
    const rPos = { x, z };
    placeOnTerrainOrWall(rock, rPos, (theme === 'snow' ? -0.06 * size : 0), size * 0.5);
    rock.rotation.y = random() * Math.PI * 2;
    if (z < -24) {
      rock.scale.y *= 1.2;
    }
    registerRockNavigationBlocker(rPos.x, rPos.z, size, rock.scale);
    addStaticCulledObject(scene, rock);
  }
}

function placeBoulderClusters(scene, pathPoints, random) {
  const config = worldConfig();
  const theme = config.theme ?? 'snow';
  worldConfig().boulderClusters.forEach((cluster) => {
    for (let i = 0; i < cluster.count; i += 1) {
      const { x, z } = randomPointInEllipse(cluster, random);
      if (!isDecorationClear(x, z, pathPoints, 5.2)) continue;
      if (distanceToPath(x, z, pathPoints) < 7.4) continue;
      if (theme === 'snow' && isNearCliff(x, z, 4.0)) continue;

      const size = cluster.sizeMin + random() * (cluster.sizeMax - cluster.sizeMin);
      
      const rock = (theme === 'snow')
        ? createLowpolySnowRock(size, random, {
            color: worldMaterialColor('rock', random() > 0.5 ? '#687378' : '#748083'),
            snowCap: true
          })
        : createRock(size, {
            color: random() > 0.5 ? '#6e777b' : '#838984',
            snowCap: true
          });
          
      rock.scale.x *= 0.9 + random() * 0.48;
      rock.scale.y *= 0.82 + random() * 0.42;
      rock.scale.z *= 0.78 + random() * 0.58;
      const pos = { x, z };
      placeOnTerrainOrWall(rock, pos, (theme === 'snow' ? -0.06 * size : 0.02), size * 0.5);
      rock.rotation.set(
        (theme === 'snow' ? rock.rotation.x : random() * 0.08),
        random() * Math.PI * 2,
        (theme === 'snow' ? rock.rotation.z : (random() - 0.5) * 0.1)
      );
      registerRockNavigationBlocker(pos.x, pos.z, size, rock.scale);
      addStaticCulledObject(scene, rock);
    }
  });
}

function placeLandmarkBoulders(scene, pathPoints) {
  const config = worldConfig();
  const theme = config.theme ?? 'snow';
  const random = seededRandom(config.seed ?? 8899);
  
  worldConfig().landmarkBoulders.forEach((item) => {
    if (!isDecorationClear(item.x, item.z, pathPoints, 5.8)) return;
    if (distanceToPath(item.x, item.z, pathPoints) < 7.2) return;
    if (theme === 'snow' && isNearCliff(item.x, item.z, 5.0)) return;
    
    const rock = (theme === 'snow')
      ? createLowpolySnowRock(item.size, random, {
          color: worldMaterialColor('rock', '#687378'),
          snowCap: true
        })
      : createRock(item.size, {
          color: '#747d7f',
          snowCap: true
        });
        
    rock.scale.set(item.sx, item.sy, item.sz);
    const lPos = { x: item.x, z: item.z };
    placeOnTerrainOrWall(rock, lPos, (theme === 'snow' ? -0.06 * item.size : 0.02), item.size * 0.5);
    rock.rotation.y = item.rot;
    registerRockNavigationBlocker(lPos.x, lPos.z, item.size, rock.scale);
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
      const bPos = { x, z };
      placeOnTerrainOrWall(bush, bPos, 0, 0.42);
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


function placePathTotems(scene) {
  const points = [
    { x: -10.5, z: 26, rot: 0.38, scale: 1.08, bannerColor: '#a84635' },
    { x: -6, z: 7, rot: 0.2, scale: 0.98, bannerColor: '#9f4938' },
    { x: -4, z: -31, rot: 0.9, scale: 1.12, bannerColor: '#934332' }
  ];

  points.forEach((item) => {
    const totem = createBannerTotemModel(item);
    placeOnTerrain(totem, item.x, item.z);
    totem.rotation.y = item.rot;
    totem.scale.setScalar(item.scale);
    totem.userData.skipStaticBatch = true;
    addStaticCulledObject(scene, totem);
    activeAnimatedDecorations?.push(totem);
    registerWorldNavigationBlocker(item.x, item.z, 0.85 * item.scale, 'banner-totem');
  });
}

function placeLegacyPathDecor(scene) {
  const points = [
    { x: -5, z: 28, rot: 0.5, type: 'cottage', scale: 1.1, roof: '#d84b33' },
    { x: 8, z: 22, rot: -0.6, type: 'flag' },
    { x: -6, z: 7, rot: 0.2, type: 'cottage', scale: 0.9, roof: '#cc5030' },
    { x: 6, z: -15, rot: -0.8, type: 'flag' },
    { x: -4, z: -31, rot: 0.9, type: 'cottage', scale: 1.2, roof: '#c44225' },
    { x: 5, z: -30, rot: -0.4, type: 'flag' }
  ];

  points.forEach((item) => {
    if (item.type === 'cottage') {
      const cottage = createCottageModel({ ...item, wall: '#baa58b' });
      placeOnTerrain(cottage, item.x, item.z);
      cottage.rotation.y = item.rot;
      cottage.scale.setScalar(item.scale);
      addStaticCulledObject(scene, cottage);
      registerWorldNavigationBlocker(item.x, item.z, 2.0 * item.scale, 'cottage');
      return;
    }

    const flag = createGuardFlag();
    placeOnTerrain(flag, item.x, item.z);
    flag.rotation.y = item.rot;
    flag.scale.setScalar(1.5);
    addStaticCulledObject(scene, flag);
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
  bakeObjectGroundShadow(group);
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
    sourceEntries: []
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
    return { meshes: [] };
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
    return { meshes: [] };
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
  return { meshes };
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
    if (!node.isMesh || node.userData?.skipBakedShadow || node.castShadow === false) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const hasOpaqueShadowMaterial = materials.some((material) => (
      material
      && material.visible !== false
      && material.transparent !== true
      && (material.opacity ?? 1) >= 0.999
    ));
    if (!hasOpaqueShadowMaterial) return;
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
      : theme === 'emerald-marsh'
        ? '#24343d'
        : '#263233';
  const opacity = theme === 'dungeon'
    ? 0.24
    : theme === 'red-desert'
      ? 0.2
      : theme === 'emerald-marsh'
        ? 0.22
        : 0.17;
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
  const boardwalkReserve = (config.marshBoardwalks ?? []).reduce((best, boardwalk) => {
    const distance = distanceToSegment2D(x, z, boardwalk.from, boardwalk.to);
    return Math.max(best, 1 - smoothstep((boardwalk.width ?? 1.6) * 0.5, (boardwalk.width ?? 1.6) * 0.5 + 2.2, distance));
  }, 0);

  return clamp(Math.max(
    mask,
    roadReserve * 0.9,
    baseReserve,
    campReserve,
    clearingReserve * 0.72,
    boardwalkReserve * 0.88
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

// 一段山腰切片由谷内立面、两级断层和向地图外侧继续抬升的坡顶构成。
// 几何没有“山峰中心”，因此在当前小地图尺度中不会读成完整圆锥或放大石块。
function createSnowValleyCliffSliceGeometry(random, options = {}) {
  const length = options.length ?? 28;
  const depth = options.depth ?? 22;
  const height = options.height ?? 14;
  const profileName = options.profile ?? 'terraced';
  const stationCount = Math.max(6, Math.round(length / 4.5));
  const levels = [0, 0.30, 0.335, 0.62, 0.655, 1];
  const profiles = {
    sheer: [0.025, 0, 0.075, 0.055, 0.135, 0.105],
    terraced: [0.055, 0.01, 0.145, 0.105, 0.255, 0.205],
    overhang: [0.07, -0.025, 0.095, 0.035, 0.18, 0.12]
  };
  const profile = profiles[profileName] ?? profiles.terraced;
  const front = [];
  const backBottom = [];
  const backTop = [];
  const positions = [];
  const addTriangle = (a, b, c) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  for (let station = 0; station < stationCount; station += 1) {
    const t = station / (stationCount - 1);
    const endpointFade = Math.sin(t * Math.PI);
    const u = mix(-length * 0.5, length * 0.5, t)
      + (random() - 0.5) * (length / stationCount) * 0.22 * endpointFade;
    const ridgeScale = 0.88 + random() * 0.20;
    const frontNoise = (random() - 0.5) * depth * 0.055;
    const stationFront = [];
    levels.forEach((level, levelIndex) => {
      const ledgeNoise = (random() - 0.5) * depth * (levelIndex === 0 ? 0.012 : 0.022);
      stationFront.push(new THREE.Vector3(
        u,
        height * level * ridgeScale + (level > 0 && level < 1 ? (random() - 0.5) * height * 0.012 : 0),
        -depth * 0.5 + depth * profile[levelIndex] + frontNoise + ledgeNoise
      ));
    });
    front.push(stationFront);
    backBottom.push(new THREE.Vector3(u, 0, depth * 0.5));
    backTop.push(new THREE.Vector3(
      u,
      stationFront[stationFront.length - 1].y + height * (0.14 + random() * 0.10),
      depth * (0.47 + random() * 0.025)
    ));
  }

  // 朝谷内的断崖面。两个极短的高度区间会形成真正可积雪的横向岩台。
  for (let station = 0; station < stationCount - 1; station += 1) {
    for (let level = 0; level < levels.length - 1; level += 1) {
      const a = front[station][level];
      const b = front[station + 1][level];
      const c = front[station][level + 1];
      const d = front[station + 1][level + 1];
      addTriangle(a, c, b);
      addTriangle(b, c, d);
    }
  }

  // 山腰顶部向地图外侧继续抬升，镜头看到的是坡面的截段，而不是完整白色山帽。
  for (let station = 0; station < stationCount - 1; station += 1) {
    const a = front[station][levels.length - 1];
    const b = front[station + 1][levels.length - 1];
    const c = backTop[station];
    const d = backTop[station + 1];
    addTriangle(a, c, b);
    addTriangle(b, c, d);
    addTriangle(backBottom[station], backBottom[station + 1], c);
    addTriangle(backBottom[station + 1], d, c);
  }

  // 封闭两端，避免相邻段错位时露出空洞；两端通常被下一段山壁遮住。
  const lastStation = stationCount - 1;
  for (let level = 0; level < levels.length - 1; level += 1) {
    addTriangle(backBottom[0], front[0][level + 1], front[0][level]);
    addTriangle(backBottom[lastStation], front[lastStation][level], front[lastStation][level + 1]);
  }
  addTriangle(backBottom[0], backTop[0], front[0][levels.length - 1]);
  addTriangle(backBottom[lastStation], front[lastStation][levels.length - 1], backTop[lastStation]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  paintSnowMountainFaces(geometry, random, {
    heightScale: height,
    slopeSnowRange: [0.48, 0.74],
    heightSnowRange: [0.82, 0.98],
    heightJitter: 0.12,
    heightWeight: 0.08,
    patchChance: 0.04,
    upWeight: 0.28
  });
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSnowValleyCliffSection(scene, zone, random, material) {
  const group = new THREE.Group();
  group.userData.skipStaticBatch = true;
  const baseRotation = (zone.side === 'left' ? -Math.PI * 0.5 : Math.PI * 0.5) + (zone.rot ?? 0);
  const frontNormal = new THREE.Vector3(-Math.sin(baseRotation), 0, -Math.cos(baseRotation));
  const tangent = new THREE.Vector3(Math.cos(baseRotation), 0, -Math.sin(baseRotation));

  const addSlice = ({ faceX, z, length, depth, height, profile, tint, rotation = baseRotation }) => {
    const geometry = createSnowValleyCliffSliceGeometry(random, { length, depth, height, profile });
    if (tint) tintGeometryColors(geometry, tint, 0.16);
    const mesh = new THREE.Mesh(geometry, material);
    const localFrontNormal = new THREE.Vector3(-Math.sin(rotation), 0, -Math.cos(rotation));
    const centerX = faceX - localFrontNormal.x * depth * 0.5;
    const centerZ = z - localFrontNormal.z * depth * 0.5;
    mesh.position.set(centerX, terrainHeightAt(faceX, z) - 0.42, centerZ);
    mesh.rotation.y = rotation;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  addSlice({
    faceX: zone.faceX,
    z: zone.z,
    length: zone.length,
    depth: zone.depth,
    height: zone.height,
    profile: zone.profile,
    tint: zone.side === 'left' ? '#746d74' : null
  });

  // 少量低山脚从主壁伸向谷内，但始终与后方山腰相交，不再成为独立完整石块。
  if (zone.foothill) {
    const foot = zone.foothill;
    const facePoint = new THREE.Vector3(zone.faceX, 0, zone.z)
      .addScaledVector(frontNormal, foot.inset)
      .addScaledVector(tangent, foot.along);
    addSlice({
      faceX: facePoint.x,
      z: facePoint.z,
      length: foot.length,
      depth: foot.depth,
      height: foot.height,
      profile: 'terraced',
      tint: zone.side === 'left' ? '#7b7378' : null
    });
  }

  addStaticCulledObject(scene, group, 7);

  // 阻挡沿山壁内侧分段注册，保持道路、基地、营地和祭坛操作圈不变。
  const blockerCount = Math.max(3, Math.round(zone.length / 7));
  for (let index = 0; index < blockerCount; index += 1) {
    const along = mix(-zone.length * 0.42, zone.length * 0.42, blockerCount === 1 ? 0.5 : index / (blockerCount - 1));
    const point = new THREE.Vector3(zone.faceX, 0, zone.z)
      .addScaledVector(tangent, along)
      .addScaledVector(frontNormal, -1.6);
    if (distanceToPath(point.x, point.z, rawPathPoints()) < 9) continue;
    if (isAltarClearing(point.x, point.z)) continue;
    if (Math.hypot(point.x - worldConfig().playerBasePosition.x, point.z - worldConfig().playerBasePosition.z) < 14) continue;
    if (Math.hypot(point.x - worldConfig().enemyCampPosition.x, point.z - worldConfig().enemyCampPosition.z) < 14) continue;
    registerWorldNavigationBlocker(point.x, point.z, 3.2, 'snow-valley-cliff-wall');
  }
}

function createRidgeVillageCenterCurve() {
  const source = rawPathPoints().map((point) => point.clone());
  if (source.length < 2) return new THREE.CatmullRomCurve3(source);
  const first = source[0];
  const second = source[1];
  const last = source[source.length - 1];
  const beforeLast = source[source.length - 2];
  const frontDirection = first.clone().sub(second).setY(0).normalize();
  const rearDirection = last.clone().sub(beforeLast).setY(0).normalize();
  source.unshift(first.clone().addScaledVector(frontDirection, 13));
  source.push(last.clone().addScaledVector(rearDirection, 11));
  return new THREE.CatmullRomCurve3(source, false, 'catmullrom', 0.22);
}

function ridgeVillageBoundarySample(curve, t, side) {
  const config = worldConfig();
  const ridge = config.ridgeVillage;
  const center = curve.getPoint(clamp(t, 0, 1));
  const tangent = curve.getTangent(clamp(t, 0, 1)).setY(0).normalize();
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(side);
  const baseWidth = ridge.pathHalfWidth ?? 14;
  let boundaryWidth = baseWidth;
  let outsideRun = 0;
  for (let distance = Math.max(7, baseWidth - 5); distance <= 29; distance += 0.6) {
    const x = center.x + normal.x * distance;
    const z = center.z + normal.z * distance;
    if (ridgeVillagePlatformMaskAt(x, z, config) >= 0.5) {
      boundaryWidth = distance;
      outsideRun = 0;
    } else if (distance > baseWidth) {
      outsideRun += 1;
      if (outsideRun >= 4) break;
    }
  }
  const edgeWobble = Math.sin(t * Math.PI * 7 + side * 1.6) * 1.18 +
    Math.sin(t * Math.PI * 17 - side * 0.8) * 0.62 +
    Math.sin(t * Math.PI * 31 + side * 0.35) * 0.24;
  boundaryWidth += edgeWobble;
  const point = center.clone().addScaledVector(normal, boundaryWidth);
  point.y = (ridge.plateauTop ?? 5.2) +
    Math.sin(point.x * 0.11 + point.z * 0.045) * 0.18 +
    Math.cos(point.x * 0.055 - point.z * 0.09) * 0.12;
  return { point, center, tangent, normal, width: boundaryWidth };
}

function createRidgeVillageCliffSideGeometry(curve, side, random) {
  const config = worldConfig();
  const ridge = config.ridgeVillage;
  const samples = [];
  const segmentCount = 72;
  for (let i = 0; i <= segmentCount; i += 1) {
    const t = i / segmentCount;
    const sample = ridgeVillageBoundarySample(curve, t, side);
    samples.push({
      ...sample,
      bottomOutset: 1.0 + random() * 2.35,
      upperOffset: Math.sin(t * Math.PI * 11 + side * 0.7) * 1.05 + (random() - 0.5) * 0.72,
      middleOffset: Math.sin(t * Math.PI * 7 - side * 0.55) * 1.42 + (random() - 0.5) * 0.9,
      t
    });
  }
  // 平滑祭坛外凸台与主山脊之间的边界宽度，避免相邻顶点跨度过大形成巨型三角面。
  for (let i = 1; i < samples.length; i += 1) {
    samples[i].width = clamp(samples[i].width, samples[i - 1].width - 1.55, samples[i - 1].width + 1.55);
  }
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    samples[i].width = clamp(samples[i].width, samples[i + 1].width - 1.55, samples[i + 1].width + 1.55);
  }
  samples.forEach((sample) => {
    sample.point.copy(sample.center).addScaledVector(sample.normal, sample.width);
    sample.point.y = (ridge.plateauTop ?? 5.2) +
      Math.sin(sample.point.x * 0.11 + sample.point.z * 0.045) * 0.18 +
      Math.cos(sample.point.x * 0.055 - sample.point.z * 0.09) * 0.12;
    sample.bottom = sample.point.clone().addScaledVector(sample.normal, sample.bottomOutset);
    sample.bottom.y = (ridge.forestFloor ?? -7.2) + 0.15 +
      Math.sin(sample.t * Math.PI * 5 + side) * 0.82 +
      Math.cos(sample.t * Math.PI * 13 - side) * 0.46;
    sample.upper = sample.point.clone().lerp(
      sample.bottom,
      0.28 + Math.sin(sample.t * Math.PI * 9 + side) * 0.035
    )
      .addScaledVector(sample.normal, sample.upperOffset);
    sample.middle = sample.point.clone().lerp(
      sample.bottom,
      0.63 + Math.cos(sample.t * Math.PI * 7 - side) * 0.045
    )
      .addScaledVector(sample.normal, sample.middleOffset);
    sample.upper.y += Math.sin(sample.t * Math.PI * 19 + side) * 0.34;
    sample.middle.y += Math.cos(sample.t * Math.PI * 15 - side) * 0.46;
  });

  const positions = [];
  const colors = [];
  const sunlit = new THREE.Color(ridge.cliffColor ?? '#eadfbf');
  const shaded = new THREE.Color(ridge.cliffShade ?? '#b7ad99');
  const deep = new THREE.Color(ridge.cliffDeep ?? '#7d7e78');
  const pushTriangle = (a, b, c, color) => {
    [a, b, c].forEach((point) => {
      positions.push(point.x, point.y, point.z);
      colors.push(color.r, color.g, color.b);
    });
  };
  const pushQuad = (topA, bottomA, topB, bottomB, colorA, colorB, flip = false) => {
    if (flip) {
      pushTriangle(topA, bottomA, bottomB, colorA);
      pushTriangle(topA, bottomB, topB, colorB);
      return;
    }
    pushTriangle(topA, bottomA, topB, colorA);
    pushTriangle(topB, bottomA, bottomB, colorB);
  };

  for (let i = 0; i < segmentCount; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    const lightMix = 0.2 + random() * 0.64;
    const topColor = shaded.clone().lerp(sunlit, lightMix);
    const upperColor = shaded.clone().lerp(sunlit, 0.28 + random() * 0.4);
    const middleColor = deep.clone().lerp(shaded, 0.45 + random() * 0.38);
    const lowerColor = deep.clone().lerp(shaded, 0.18 + random() * 0.28);
    const flip = (i + (side > 0 ? 1 : 0)) % 2 === 0;
    pushQuad(a.point, a.upper, b.point, b.upper, topColor, upperColor, flip);
    pushQuad(a.upper, a.middle, b.upper, b.middle, upperColor, middleColor, !flip);
    pushQuad(a.middle, a.bottom, b.middle, b.bottom, middleColor, lowerColor, flip);

    // 每隔几段伸出一小块不规则岩台，打断从顶到底的一整张平面。
    if (i % 9 === 4 || i % 13 === 7) {
      const shelfA = a.upper.clone().addScaledVector(a.normal, 0.48 + random() * 0.45);
      const shelfB = b.upper.clone().addScaledVector(b.normal, 0.48 + random() * 0.45);
      shelfA.y -= 0.08;
      shelfB.y += 0.06;
      pushQuad(a.upper, shelfA, b.upper, shelfB, sunlit, topColor, i % 2 === 0);
    }

    // 细窄深色裂缝贴在岩面外侧，长度与方向均不一致。
    if (i % 7 === 2) {
      const crackTop = a.point.clone().lerp(b.point, 0.38).addScaledVector(a.normal, 0.08);
      const crackUpper = a.upper.clone().lerp(b.upper, 0.5).addScaledVector(a.normal, 0.1);
      const crackLower = a.middle.clone().lerp(b.middle, 0.42).addScaledVector(a.normal, 0.1);
      const tangentInset = b.tangent.clone().multiplyScalar(0.12 + random() * 0.08);
      pushTriangle(
        crackTop.clone().add(tangentInset),
        crackUpper,
        crackTop.clone().sub(tangentInset),
        deep.clone().lerp(shaded, 0.14)
      );
      if (i % 14 === 2) {
        pushTriangle(
          crackUpper.clone().add(tangentInset),
          crackLower,
          crackUpper.clone().sub(tangentInset),
          deep.clone().lerp(shaded, 0.08)
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, samples };
}

function createRidgeVillageGrassLipGeometry(samples, side, random) {
  const positions = [];
  const colors = [];
  const ridge = worldConfig().ridgeVillage;
  const grass = new THREE.Color(ridge.grass ?? '#82bf38');
  const grassLight = new THREE.Color(ridge.grassLight ?? '#a6d94b');
  const push = (point, color) => {
    positions.push(point.x, point.y, point.z);
    colors.push(color.r, color.g, color.b);
  };

  for (let i = 5; i < samples.length - 6; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    const innerA = a.point.clone().addScaledVector(a.normal, -1.7);
    const innerB = b.point.clone().addScaledVector(b.normal, -1.7);
    innerA.y += 0.08;
    innerB.y += 0.08;
    const outerA = a.point.clone();
    const outerB = b.point.clone();
    outerA.y += 0.1;
    outerB.y += 0.1;
    const color = grass.clone().lerp(grassLight, 0.12 + random() * 0.34);
    [innerA, outerA, innerB, innerB, outerA, outerB].forEach((point) => push(point, color));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createRidgeVillageGrassDrips(samples, random) {
  const positions = [];
  // 前后景端点受透视放大，不挂草楔；只在中段崖壁留下参考图里的绿色垂片。
  for (let i = 8; i < samples.length - 8; i += 3 + Math.floor(random() * 3)) {
    const a = samples[i];
    const b = samples[Math.min(samples.length - 1, i + 1)];
    const topA = a.point.clone().addScaledVector(a.normal, 0.06);
    const topB = b.point.clone().addScaledVector(b.normal, 0.06);
    topA.y += 0.06;
    topB.y += 0.06;
    const tip = topA.clone().lerp(topB, 0.35 + random() * 0.3);
    tip.y -= 1.2 + random() * 3.1;
    tip.addScaledVector(a.normal, 0.08);
    [topA, tip, topB].forEach((point) => positions.push(point.x, point.y, point.z));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createRidgeVillageCliffOutcrops(group, samples, random) {
  const ridge = worldConfig().ridgeVillage;
  const materials = [
    mat(ridge.cliffColor ?? '#f3f1ea', { roughness: 0.99, flatShading: true }),
    mat(ridge.cliffShade ?? '#d6d2c8', { roughness: 0.99, flatShading: true }),
    mat(ridge.cliffDeep ?? '#9ca29f', { roughness: 0.99, flatShading: true })
  ];
  const geometry = new THREE.DodecahedronGeometry(1, 0);

  // 岩块不是散落装饰，而是嵌进山壁的转折节点。它们沿高度错开，
  // 将原本连续的竖直崖面拆成前后不同的岩层轮廓。
  for (let i = 7; i < samples.length - 7; i += 5 + Math.floor(random() * 3)) {
    const sample = samples[i];
    const verticalMix = 0.24 + random() * 0.58;
    const center = sample.point.clone().lerp(sample.bottom, verticalMix);
    center.addScaledVector(sample.normal, 0.78 + random() * 0.92);
    center.y += (random() - 0.5) * 0.9;

    const outcrop = new THREE.Mesh(geometry, materials[Math.floor(random() * materials.length)]);
    outcrop.position.copy(center);
    outcrop.rotation.set(
      (random() - 0.5) * 0.32,
      Math.atan2(sample.tangent.x, sample.tangent.z) + (random() - 0.5) * 0.28,
      (random() - 0.5) * 0.24
    );
    const along = 1.55 + random() * 1.55;
    const height = 0.9 + random() * 1.35;
    const outward = 0.78 + random() * 0.72;
    outcrop.scale.set(along, height, outward);
    outcrop.castShadow = true;
    outcrop.receiveShadow = true;
    group.add(outcrop);

    // 少量双层节点让岩层产生折返，不形成规律的点状排列。
    if (random() < 0.34) {
      const secondary = new THREE.Mesh(geometry, materials[1 + Math.floor(random() * 2)]);
      secondary.position.copy(center)
        .addScaledVector(sample.tangent, (random() - 0.5) * along * 1.2)
        .addScaledVector(sample.normal, 0.18 + random() * 0.3);
      secondary.position.y -= 0.75 + random() * 0.8;
      secondary.rotation.copy(outcrop.rotation);
      secondary.rotation.y += (random() - 0.5) * 0.45;
      secondary.scale.set(along * (0.5 + random() * 0.25), height * 0.58, outward * 0.8);
      secondary.castShadow = true;
      secondary.receiveShadow = true;
      group.add(secondary);
    }
  }
}

function createRidgeVillageEndCap(scene, curve, t, random) {
  const ridge = worldConfig().ridgeVillage;
  const left = ridgeVillageBoundarySample(curve, t, -1);
  const right = ridgeVillageBoundarySample(curve, t, 1);
  const bottomY = (ridge.forestFloor ?? -7.2) + 0.25;
  const leftBottom = left.point.clone();
  const rightBottom = right.point.clone();
  leftBottom.y = bottomY;
  rightBottom.y = bottomY + (random() - 0.5) * 0.4;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    left.point.x, left.point.y, left.point.z,
    leftBottom.x, leftBottom.y, leftBottom.z,
    right.point.x, right.point.y, right.point.z,
    right.point.x, right.point.y, right.point.z,
    leftBottom.x, leftBottom.y, leftBottom.z,
    rightBottom.x, rightBottom.y, rightBottom.z
  ], 3));
  geometry.computeVertexNormals();
  const cap = new THREE.Mesh(
    geometry,
    mat(ridge.cliffShade ?? '#b7ad99', { roughness: 0.98, flatShading: true })
  );
  cap.castShadow = true;
  cap.receiveShadow = true;
  cap.userData.skipStaticBatch = true;
  addStaticCulledObject(scene, cap, 8);
}

function createRidgeVillageCliffs(scene) {
  const config = worldConfig();
  const ridge = config.ridgeVillage;
  const curve = createRidgeVillageCenterCurve();
  const random = seededRandom((config.seed ?? 42) + 4041);
  const cliffMaterial = mat(0xffffff, {
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
    flatShading: true
  });
  const grassMaterial = mat(0xffffff, {
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide
  });
  const dripMaterial = mat(ridge.grass ?? '#82bf38', {
    roughness: 0.96,
    side: THREE.DoubleSide
  });

  [-1, 1].forEach((side) => {
    const { geometry, samples } = createRidgeVillageCliffSideGeometry(curve, side, random);
    const group = new THREE.Group();
    group.userData.skipStaticBatch = true;
    const cliff = new THREE.Mesh(geometry, cliffMaterial);
    cliff.castShadow = true;
    cliff.receiveShadow = true;
    const lip = new THREE.Mesh(createRidgeVillageGrassLipGeometry(samples, side, random), grassMaterial);
    lip.castShadow = true;
    lip.receiveShadow = true;
    const drips = new THREE.Mesh(createRidgeVillageGrassDrips(samples, random), dripMaterial);
    drips.castShadow = true;
    group.add(cliff, lip, drips);
    createRidgeVillageCliffOutcrops(group, samples, random);
    addStaticCulledObject(scene, group, 12);
  });

  // 两端由林冠与延伸出的侧崖自然遮蔽，不再加整面封口墙，
  // 避免低机位下出现跨越半个屏幕的浅色三角形。
}

function createRidgeVillageForestSea(scene, random) {
  const config = worldConfig();
  const ridge = config.ridgeVillage;
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const colors = [
    ridge.forestDark ?? '#123f3c',
    ridge.forestMid ?? '#1f6557',
    ridge.forestLight ?? '#4f9848'
  ];
  const transforms = colors.map(() => []);
  const dummy = new THREE.Object3D();
  let accepted = 0;

  for (let attempt = 0; attempt < 3000 && accepted < 760; attempt += 1) {
    const x = -68 + random() * 136;
    const z = -78 + random() * 138;
    if (ridgeVillagePlatformMaskAt(x, z, config) > 0.13) continue;
    const size = 1.15 + random() * 2.15;
    const heightScale = 0.72 + random() * 0.75;
    const y = ridgeVillageTerrainHeightAt(x, z, config) + size * heightScale * 0.58;
    dummy.position.set(x, y, z);
    dummy.rotation.set((random() - 0.5) * 0.16, random() * Math.PI * 2, (random() - 0.5) * 0.16);
    dummy.scale.set(size * (0.8 + random() * 0.42), size * heightScale, size * (0.82 + random() * 0.4));
    dummy.updateMatrix();
    const lightBias = clamp((z + 50) / 100 * 0.22 + random(), 0, 0.999);
    const bucket = lightBias > 0.86 ? 2 : lightBias > 0.38 ? 1 : 0;
    transforms[bucket].push(dummy.matrix.clone());
    accepted += 1;
  }

  transforms.forEach((matrices, index) => {
    if (!matrices.length) return;
    const mesh = new THREE.InstancedMesh(
      geometry,
      mat(colors[index], { roughness: 0.98, flatShading: true }),
      matrices.length
    );
    matrices.forEach((matrix, matrixIndex) => mesh.setMatrixAt(matrixIndex, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    mesh.name = `RidgeVillageForestCanopy${index}`;
    scene.add(mesh);
  });
}

function createRidgeVillageHouseAssets() {
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    roof: new THREE.ConeGeometry(1, 1, 4),
    wall: mat('#f4f1eb', { roughness: 0.96 }),
    wallShade: mat('#d9dedb', { roughness: 0.97 }),
    roofs: [
      mat('#c98272', { roughness: 0.94 }),
      mat('#d9957f', { roughness: 0.94 }),
      mat('#b96f63', { roughness: 0.95 }),
      mat('#e1a18a', { roughness: 0.94 })
    ],
    wood: mat('#654331', { roughness: 0.96 }),
    window: mat('#31515a', { roughness: 0.88 }),
    stone: mat('#c8cfcc', { roughness: 0.98 })
  };
}

function createRidgeVillageHouse(random, assets, options = {}) {
  const group = new THREE.Group();
  const width = options.width ?? (2.0 + random() * 1.55);
  const depth = options.depth ?? (1.45 + random() * 0.9);
  const height = options.height ?? (1.25 + random() * 1.75);
  const wallMaterial = random() < 0.22 ? assets.wallShade : assets.wall;
  const roofMaterial = assets.roofs[options.roofIndex ?? Math.floor(random() * assets.roofs.length)];

  const foundation = new THREE.Mesh(assets.box, assets.stone);
  foundation.position.y = 0.14;
  foundation.scale.set(width * 1.08, 0.28, depth * 1.12);
  const wall = new THREE.Mesh(assets.box, wallMaterial);
  wall.position.y = 0.28 + height * 0.5;
  wall.scale.set(width, height, depth);
  const roof = new THREE.Mesh(assets.roof, roofMaterial);
  roof.position.y = 0.28 + height + 0.46;
  roof.scale.set(width * 0.74, 0.9, depth * 0.78);
  roof.rotation.y = Math.PI * 0.25;
  const door = new THREE.Mesh(assets.box, assets.wood);
  door.position.set(0, 0.72, depth * 0.51);
  door.scale.set(0.44, 0.9, 0.08);
  const windowLeft = new THREE.Mesh(assets.box, assets.window);
  windowLeft.position.set(-width * 0.28, 1.05, depth * 0.515);
  windowLeft.scale.set(0.32, 0.34, 0.06);
  const windowRight = windowLeft.clone();
  windowRight.position.x = width * 0.28;
  const chimney = new THREE.Mesh(assets.box, assets.wood);
  chimney.position.set(width * 0.28, height + 0.9, -depth * 0.12);
  chimney.scale.set(0.24, 0.85, 0.24);
  group.add(foundation, wall, roof, door, windowLeft, windowRight, chimney);

  if (options.tower) {
    const tower = new THREE.Mesh(assets.box, wallMaterial);
    tower.position.set(-width * 0.3, height + 0.92, -depth * 0.08);
    tower.scale.set(width * 0.42, 1.45, depth * 0.62);
    const towerRoof = new THREE.Mesh(assets.roof, roofMaterial);
    towerRoof.position.set(-width * 0.3, height + 1.9, -depth * 0.08);
    towerRoof.scale.set(width * 0.38, 0.7, depth * 0.48);
    towerRoof.rotation.y = Math.PI * 0.25;
    group.add(tower, towerRoof);
  }
  return enableDecorationShadows(group);
}

function createRidgeVillageCypress(height = 2) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.14, height * 0.72, 6),
    mat('#4c3528', { roughness: 0.96 })
  );
  trunk.position.y = height * 0.36;
  const foliageMaterial = markWorldMaterial(
    mat(worldMaterialColor('tree', '#1f6557'), { roughness: 0.96, flatShading: true }),
    'tree'
  );
  const lower = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), foliageMaterial);
  lower.position.y = height * 0.78;
  lower.scale.set(height * 0.22, height * 0.48, height * 0.22);
  const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), foliageMaterial);
  crown.position.y = height * 1.16;
  crown.scale.set(height * 0.15, height * 0.38, height * 0.15);
  group.add(trunk, lower, crown);
  return enableDecorationShadows(group);
}

function createRidgeVillageGuardrail(scene, pathPoints, random) {
  const config = worldConfig();
  const curve = createRidgeVillageCenterCurve();
  const assets = createRidgeVillageHouseAssets();
  const ridge = config.ridgeVillage;

  for (let row = 0; row < 20; row += 1) {
    const baseT = 0.035 + row * 0.049;
    [-1, 1].forEach((side) => {
      if ((row * 2 + (side > 0 ? 1 : 0)) % 11 === 0) return;
      const t = clamp(baseT + (random() - 0.5) * 0.022, 0.025, 0.975);
      const sample = ridgeVillageBoundarySample(curve, t, side);
      const inward = sample.normal.clone().multiplyScalar(-1);
      const along = (random() - 0.5) * 2.4;
      const inset = 0.65 + random() * 2.85;
      const x = sample.point.x + inward.x * inset + sample.tangent.x * along;
      const z = sample.point.z + inward.z * inset + sample.tangent.z * along;
      if (isAltarClearing(x, z)) return;
      if (Math.hypot(x - config.playerBasePosition.x, z - config.playerBasePosition.z) < 6.8) return;
      if (Math.hypot(x - config.enemyCampPosition.x, z - config.enemyCampPosition.z) < 6.9) return;

      const scale = 0.9 + random() * 0.34;
      const tallHouse = (row + (side > 0 ? 2 : 0)) % 5 === 1;
      const house = createRidgeVillageHouse(random, assets, {
        height: tallHouse ? 2.65 + random() * 0.8 : 1.25 + random() * 1.25,
        width: tallHouse ? 2.0 + random() * 0.65 : 2.0 + random() * 1.55,
        tower: row % 7 === 2 && side === (row % 2 ? -1 : 1),
        roofIndex: (row + (side > 0 ? 1 : 0)) % assets.roofs.length
      });
      house.position.set(x, terrainHeightAt(x, z) - 0.02, z);
      house.rotation.y = Math.atan2(inward.x, inward.z) + (random() - 0.5) * 0.2;
      house.scale.setScalar(scale);
      addStaticCulledObject(scene, house, 2.5);
      registerWorldNavigationBlocker(x, z, 1.45 * scale, 'ridge-village-house');
    });
  }

  // 房屋之间以低矮白墙续接，形成参考图中的聚落护栏轮廓。
  for (let row = 0; row < 19; row += 1) {
    const t = 0.035 + row * 0.052;
    [-1, 1].forEach((side) => {
      const sample = ridgeVillageBoundarySample(curve, t, side);
      const inward = sample.normal.clone().multiplyScalar(-1);
      const x = sample.point.x + inward.x * 0.72;
      const z = sample.point.z + inward.z * 0.72;
      if (isAltarClearing(x, z)) return;
      const wall = new THREE.Mesh(assets.box, assets.wallShade);
      wall.position.set(x, terrainHeightAt(x, z) + 0.36, z);
      wall.scale.set(0.38, 0.72, 2.2 + random() * 0.75);
      wall.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      addStaticCulledObject(scene, wall, 1.5);
    });
  }
}

function createRidgeVillageEnvironment(scene, pathPoints, random) {
  createRidgeVillageForestSea(scene, random);
  createRidgeVillageGuardrail(scene, pathPoints, random);

  // 山脊内部只留下少量柏树式竖向点景；主战场不再均匀撒树或石头。
  const accents = [
    { x: -10.8, z: 25.5, h: 2.1 },
    { x: 10.5, z: 20.2, h: 1.8 },
    { x: -10.2, z: 8.2, h: 2.35 },
    { x: 11.6, z: 2.5, h: 2.0 },
    { x: -9.8, z: -14.2, h: 1.9 },
    { x: 10.4, z: -23.8, h: 2.25 }
  ];
  accents.forEach((accent) => {
    if (isAltarClearing(accent.x, accent.z)) return;
    const tree = createRidgeVillageCypress(accent.h);
    tree.position.set(accent.x, terrainHeightAt(accent.x, accent.z), accent.z);
    tree.rotation.y = random() * Math.PI * 2;
    addStaticCulledObject(scene, tree, 1.2);
    registerWorldNavigationBlocker(accent.x, accent.z, 0.65, 'ridge-village-cypress');
  });
}

function createVolumeMist(scene) {
  const config = worldConfig();
  const mistMat = new THREE.MeshBasicMaterial({
    color: config.sky.fog,
    transparent: true,
    opacity: 0.18,
    depthWrite: false
  });
  for (let i = 0; i < 5; i++) {
    const mist = new THREE.Mesh(new THREE.PlaneGeometry(config.ground.width * 1.5, config.ground.depth * 1.5), mistMat);
    mist.rotation.x = -Math.PI / 2;
    mist.position.y = -1.2 + (i * 0.9);
    scene.add(mist);
  }
}

function createIslandCliffs(scene) {
  const points = rawPathPoints();
  const config = worldConfig();
  const random = seededRandom(config.seed ?? 8899);
  
  // Heights & scale: A balanced mix of large main cliffs and supporting rock clusters
  const hillZones = snowHillZones();
  
  const createTerrace = (w, h, d) => {
    const group = new THREE.Group();
    const compactSnowValley = config.sceneKey === 'snow-valley';
    // 雪谷改为一座主岩体加至多两座错位侧台：轮廓有层次，但不再像同心蛋糕堆。
    const numColumns = compactSnowValley ? 2 + Math.floor(random() * 2) : 3 + Math.floor(random() * 2);
    
    const sharedHeight = h * (0.85 + random() * 0.15);
    let topYApproximation = sharedHeight;
    let mainTiltX = 0;
    let mainTiltZ = 0;
    let mainTopTiltAngle = 0;
    let mainCw = w;
    let mainCd = d;

    for (let i = 0; i < numColumns; i++) {
      const isMain = (i === 0);
      
      const stretchX = 0.84 + random() * 0.32;
      const stretchZ = 0.84 + random() * 0.32;
      
      const sizeMult = isMain
        ? 1.0
        : compactSnowValley
          ? (i === 1 ? 0.72 + random() * 0.06 : 0.48 + random() * 0.08)
          : (0.58 + random() * 0.34);
      const cw = w * stretchX * sizeMult;
      const cd = d * stretchZ * sizeMult;
      if (isMain) {
        mainCw = cw;
        mainCd = cd;
      }
      
      // Heights vary to create distinct steps or jagged peaks, but not wildly different
      const ch = sharedHeight * (isMain ? 1.0 : (0.5 + random() * 0.3));
      if (isMain) topYApproximation = ch;
      
      // More outline facets keep the mesa irregular without reading as an octagonal tower.
      const numSides = 9 + Math.floor(random() * 4);
      
      // Vertical walls with natural slight taper
      const topR = compactSnowValley ? 0.25 + random() * 0.06 : 0.4 + random() * 0.1;
      const botR = 0.5 + random() * 0.1;
      
      // Perfectly split the cylinder into a Rock bottom and Snow top
      // 90% rock, 10% snow cap for lovely chunky 3D feel to display natural fractured edges
      const rockRatio = compactSnowValley ? 0.90 : 0.86;
      const rockH = ch * rockRatio;
      const snowH = ch * (1 - rockRatio);
      
      // Interpolate radius at the boundary
      const midR = botR + (topR - botR) * rockRatio;
      
      // Pre-generate random radial multipliers for each segment to give it an organic convex/faceted look
      const bottomSegmentOffsets = [];
      const midSegmentOffsets = [];
      const topSegmentOffsets = [];
      const segmentBreaks = [];
      const topTiltAngle = random() * Math.PI * 2;
      if (isMain) {
        mainTopTiltAngle = topTiltAngle;
      }
      
      for (let s = 0; s <= numSides; s++) {
        // Base outline: large low-poly shapes
        const baseOffset = 0.88 + random() * 0.24; // Between 0.88 and 1.12
        
        // Let bottom vary from middle for non-vertical, slanted facets (reduces straight cylinder extruded feel)
        bottomSegmentOffsets.push(baseOffset * (0.94 + random() * 0.12)); 
        midSegmentOffsets.push(baseOffset);
        
        // Let top vary for natural overhangs/tapering at the snow cap
        topSegmentOffsets.push(baseOffset * (0.90 + random() * 0.20));
        
        // 20% chance for a natural chipped edge / break on this segment
        segmentBreaks.push(random() < 0.20 ? (0.2 + random() * 0.6) : 0);
      }
      
      const deformGeo = (geo, isSnow) => {
        geo = geo.toNonIndexed();
        const pos = geo.attributes.position;
        for (let v = 0; v < pos.count; v++) {
          let vx = pos.getX(v);
          let vy = pos.getY(v);
          let vz = pos.getZ(v);
          
          if (Math.abs(vx) < 0.001 && Math.abs(vz) < 0.001) {
            if (isSnow && vy > 0.001) {
              const tiltVal = (vx * Math.cos(topTiltAngle) + vz * Math.sin(topTiltAngle)) * 0.12;
              pos.setY(v, vy + tiltVal);
            }
            continue; 
          }
          
          const angle = Math.atan2(vz, vx);
          const angleNormalized = (angle + Math.PI) / (Math.PI * 2);
          const segment = Math.round(angleNormalized * numSides) % numSides;
          
          let offset;
          const hSize = isSnow ? snowH : rockH;
          const normY = (vy / hSize) + 0.5;
          
          if (isSnow) {
            offset = midSegmentOffsets[segment] * (1 - normY) + topSegmentOffsets[segment] * normY;
            if (normY > 0.99) {
              const tiltVal = (vx * Math.cos(topTiltAngle) + vz * Math.sin(topTiltAngle)) * 0.12;
              vy += tiltVal;
              if (segmentBreaks[segment] > 0) {
                vy -= snowH * segmentBreaks[segment];
              }
            }
          } else {
            offset = bottomSegmentOffsets[segment] * (1 - normY) + midSegmentOffsets[segment] * normY;
          }
          
          const isMiddle = normY > 0.01 && normY < 0.99;
          let jitterX = 0;
          let jitterZ = 0;
          if (isMiddle) {
              const jHashX = hash2(vx * 15.3, vy * 15.3 + vz * 11.2);
              const jHashZ = hash2(vz * 14.5, vx * 13.2 + vy * 9.8);
              // Since 'cw' is the scaled width, we jitter based on cw to make it proportional
              jitterX = (jHashX - 0.5) * 0.045;
              jitterZ = (jHashZ - 0.5) * 0.045;
          }
          
          pos.setX(v, vx * offset + jitterX);
          pos.setY(v, vy);
          pos.setZ(v, vz * offset + jitterZ);
        }
        geo.computeVertexNormals();
        return geo;
      };

      let rockGeo = new THREE.CylinderGeometry(midR, botR, rockH, numSides, 4);
      rockGeo = deformGeo(rockGeo, false);

      
      const applyCliffColors = (geo, rGen) => {
        geo.computeVertexNormals();
        const pos = geo.attributes.position;
        const norm = geo.attributes.normal;
        const colors = new Float32Array(pos.count * 3);
        const colorAttr = new THREE.BufferAttribute(colors, 3);
        geo.setAttribute('color', colorAttr);

        geo.clearGroups();

        // 山体三段色阶从统一 art.cliff 色板读取，光照方向与全场统一
        const cliffArt = worldConfig().art?.cliff;
        const cMid = new THREE.Color(cliffArt?.mid ?? worldMaterialColor('rock', '#6b7a88'));
        const cTop = worldConfig().sceneKey === 'snow-valley'
          ? new THREE.Color(cliffArt?.snow ?? '#82909a')
          : cMid.clone().offsetHSL(0, -0.04, 0.16);
        const cDark = worldConfig().sceneKey === 'snow-valley'
          ? new THREE.Color(cliffArt?.shadow ?? '#465462')
          : cMid.clone().offsetHSL(0, 0.02, -0.13);
        const cSunlit = new THREE.Color(cliffArt?.sunlit ?? cMid.clone().offsetHSL(0, -0.02, 0.1));

        const sunDirCfg = worldConfig().art?.sunDirection ?? { x: -1.0, y: 0.0, z: 0.7 };
        const sunDir = new THREE.Vector3(sunDirCfg.x, sunDirCfg.y, sunDirCfg.z).normalize();
        
        let minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        const hRange = Math.max(0.1, maxY - minY);

        for (let i = 0; i < pos.count; i += 3) {
          const faceRandom = (rGen() - 0.5) * 0.16; // 8% up or down
          const matIndex = Math.floor(rGen() * 5); // 0 to 4
          geo.addGroup(i, 3, matIndex);
          
          for (let v = 0; v < 3; v++) {
            const idx = i + v;
            const ny = norm.getY(idx);
            const nx = norm.getX(idx);
            const nz = norm.getZ(idx);
            
            const dot = nx * sunDir.x + ny * sunDir.y + nz * sunDir.z;
            const y = pos.getY(idx);
            const heightRatio = (y - minY) / hRange;
            const heightGradient = 0.94 + heightRatio * 0.12;
            
            let baseColor = new THREE.Color();
            if (ny > 0.8) {
               baseColor.copy(cTop);
            } else if (dot > 0.3) {
               baseColor.copy(cSunlit);
            } else if (dot > -0.05) {
               baseColor.copy(cMid);
            } else {
               baseColor.copy(cMid).lerp(cDark, Math.min(1, (-dot - 0.05) / 0.6));
            }
            
            baseColor.multiplyScalar(heightGradient + faceRandom);
            
            colors[idx * 3] = baseColor.r;
            colors[idx * 3 + 1] = baseColor.g;
            colors[idx * 3 + 2] = baseColor.b;
          }
        }
      };
      
      applyCliffColors(rockGeo, random);
      const cliffMats = [];
      for (let i = 0; i < 5; i++) {
        const m = markWorldMaterial(mat(0xffffff, {
          ...worldMaterialSurfaceOptions('rock'),
          vertexColors: true, 
        }), 'rock');
        applyCliffShader(m);
        cliffMats.push(m);
      }
      const rock = new THREE.Mesh(rockGeo, cliffMats);

      rock.scale.set(cw, 1, cd); // Height is pre-scaled into geometry
      rock.castShadow = true;
      rock.receiveShadow = true;

      let snowGeo = new THREE.CylinderGeometry(topR, midR, snowH, numSides, 2);
      snowGeo = deformGeo(snowGeo, true);
      
      const snow = new THREE.Mesh(snowGeo, markWorldMaterial(mat(worldMaterialColor('snow', '#e4e9ed'), worldMaterialSurfaceOptions('snow')), 'snow'));
      snow.scale.set(cw, 1, cd);
      snow.castShadow = true;
      snow.receiveShadow = true;
      
      const columnGroup = new THREE.Group();
      // Overlap columns tightly to fuse them into one mountain, but offset enough for varied silhouette
      const ox = isMain ? 0 : (random() - 0.5) * w * 0.72;
      const oz = isMain ? 0 : (random() - 0.5) * d * 0.72;
      
      columnGroup.position.set(ox, ch * 0.5, oz);
      columnGroup.rotation.y = random() * Math.PI * 2;
      // Slight natural tilt, not perfectly robotic
      columnGroup.rotation.x = (random() - 0.5) * 0.05;
      columnGroup.rotation.z = (random() - 0.5) * 0.05;
      if (isMain) {
        mainTiltX = columnGroup.rotation.x;
        mainTiltZ = columnGroup.rotation.z;
      }
      
      // Stack them perfectly: bottom at -ch/2, seam at -ch/2 + rockH, top at ch/2
      rock.position.set(0, -ch * 0.5 + rockH * 0.5, 0);
      snow.position.set(0, -ch * 0.5 + rockH + snowH * 0.5, 0); 
      
      // Prevent Z-fighting if heights happen to be identical
      if (!isMain) snow.position.y -= 0.01;
      
      columnGroup.add(rock);
      columnGroup.add(snow);
      group.add(columnGroup);
      
      // Edge transition rocks at the base
      if (random() < 0.6) {
          const brSize = cw * (0.15 + random() * 0.2);
          const baseRock = createLowpolySnowRock(brSize, random, {
            color: worldMaterialColor('rock', '#687378'),
            snowCap: random() > 0.4
          });
          baseRock.position.set(
             ox + (random() - 0.5) * cw * 0.6,
             -0.03 * brSize,
             oz + (random() - 0.5) * cd * 0.6
          );
          baseRock.rotation.y = random() * Math.PI * 2;
          group.add(baseRock);
      }
    }

    group.userData.topYApproximation = topYApproximation;
    group.userData.mainTiltX = mainTiltX;
    group.userData.mainTiltZ = mainTiltZ;
    group.userData.topTiltAngle = mainTopTiltAngle;
    group.userData.cw = mainCw;
    group.userData.cd = mainCd;
    return group;
  };

  // 雪谷只生成作者指定的连续山腰切片。共享材质避免为六段静态崖壁重复创建着色器。
  if (config.sceneKey === 'snow-valley') {
    const createCliffMaterial = (emissive, emissiveIntensity) => {
      const material = markWorldMaterial(mat(0xffffff, {
        ...worldMaterialSurfaceOptions('rock'),
        vertexColors: true,
        emissive,
        emissiveIntensity
      }), 'rock');
      applyCliffShader(material);
      return material;
    };
    const cliffMaterials = {
      left: createCliffMaterial('#332d37', 0.22),
      right: createCliffMaterial('#211d24', 0.1)
    };
    hillZones.forEach((zone) => {
      createSnowValleyCliffSection(scene, zone, random, cliffMaterials[zone.side] ?? cliffMaterials.right);
    });
    return;
  }

  hillZones.forEach((zone) => {
    // 雪谷方案：低矮雪覆岩堆代替山体台地，战场保持开阔
    if (zone.cluster) {
      placeSnowRockCluster(scene, zone, points, random);
      return;
    }
    // Each authored zone owns one broad main mesa plus one or two lower shelves.
    const numRocks = zone.terraces ?? 2;
    
    for (let i = 0; i < numRocks; i++) {
      const distRatio = i === 0 ? 0 : 0.48 + random() * 0.38;
      const r = distRatio * zone.radius;
      const angle = random() * Math.PI * 2;
      
      const x = zone.x + Math.cos(angle) * r;
      const z = zone.z + Math.sin(angle) * r;
      
      const pathDist = distanceToPath(x, z, points);
      if (pathDist < 7) continue;
      
      const pDist = Math.hypot(x - config.playerBasePosition.x, z - config.playerBasePosition.z);
      if (pDist < 16) continue;
      const eDist = Math.hypot(x - config.enemyCampPosition.x, z - config.enemyCampPosition.z);
      if (eDist < 16) continue;
      // 不把山体插进水面/冰面里（雪谷已无水面，其他主题保留）
      let inPuddle = false;
      (config.puddles ?? []).forEach((puddle) => {
        if (Math.hypot((x - puddle.x) / (puddle.rx + 4), (z - puddle.z) / (puddle.rz + 4)) < 1) inPuddle = true;
      });
      if (inPuddle) continue;
      // 山体必须站在稳定陆块上：岸带（landmask 过低）处山脚会沉进海里，直接跳过
      if (landmassMaskAt(x, z) < 0.62) continue;
      
      let type;
      if (i === 0 || distRatio < 0.4) type = 'core';
      else if (distRatio < 0.75) type = 'slope';
      else type = 'edge';
      
      let baseW, baseH, baseD;
      
      // Sizes that are large, but not monolithic. They combine to form a jagged mountain.
      if (type === 'core') {
        baseW = (zone.width ?? 16) * (0.94 + random() * 0.12);
        baseH = zone.coreHeight * (0.92 + random() * 0.16);
        baseD = (zone.depth ?? 16) * (0.94 + random() * 0.12);
      } else if (type === 'slope') {
        baseW = (zone.width ?? 16) * (0.48 + random() * 0.14);
        baseH = zone.coreHeight * (0.42 + random() * 0.16);
        baseD = (zone.depth ?? 16) * (0.5 + random() * 0.14);
      } else {
        baseW = (zone.width ?? 16) * (0.34 + random() * 0.12);
        baseH = zone.coreHeight * (0.24 + random() * 0.12);
        baseD = (zone.depth ?? 16) * (0.36 + random() * 0.12);
      }

      const cliff = createTerrace(baseW, baseH, baseD);
      cliff.rotation.y = (zone.rot ?? 0) + (random() - 0.5) * 0.28;
      
      const embedDepth = baseH * 0.05; 
      const rockY = terrainHeightAt(x, z) - embedDepth;
      cliff.position.set(x, rockY, z);
      
      addStaticCulledObject(scene, cliff);
      registerWorldNavigationBlocker(x, z, Math.max(baseW, baseD) * 0.4, 'inner-cliff');

      if (i === 0 && zone.watchtower) {
        const tower = createSnowWatchtower();
        tower.scale.setScalar(0.88);
        tower.rotation.y = (zone.rot ?? 0) + Math.PI * 0.35;
        tower.position.set(x, rockY + cliff.userData.topYApproximation + 0.04, z);
        addStaticCulledObject(scene, tower);
      }
      
      // Top ecology
      if (baseH > 2.0 && random() < 0.8) { 
        const decoSpread = 0.58; 
        
        const getTopY = (tx, tz) => {
          const rx = cliff.userData.mainTiltX || 0;
          const rz = cliff.userData.mainTiltZ || 0;
          const lx = tx - x;
          const lz = tz - z;
          
          let y = rockY + cliff.userData.topYApproximation - lz * Math.sin(rx) + lx * Math.sin(rz);
          
          // Add the subtle top surface tilt for exact placement on the faceted snow cap
          const topTiltAngle = cliff.userData.topTiltAngle || 0;
          const ccw = cliff.userData.cw || 1;
          const ccd = cliff.userData.cd || 1;
          if (ccw > 0 && ccd > 0) {
            y += ((lx / ccw) * Math.cos(topTiltAngle) + (lz / ccd) * Math.sin(topTiltAngle)) * 0.12;
          }
          return y;
        };
        
        // Mountain-top small tree clusters
        if (baseH > 2.5 && random() < 0.88) {
          const numTopTrees = 3 + Math.floor(random() * 5);
          // Group them together as a natural cluster instead of scattered uniformly
          const ccx = x + (random() - 0.5) * baseW * 0.22;
          const ccz = z + (random() - 0.5) * baseD * 0.22;
          
          for (let t = 0; t < numTopTrees; t++) {
            const angle = random() * Math.PI * 2;
            const r = random() * Math.min(baseW, baseD) * 0.28;
            const tx = ccx + Math.cos(angle) * r;
            const tz = ccz + Math.sin(angle) * r;
            
            if (distanceToPath(tx, tz, points) < 8) continue;
            
            const treeHeight = 0.65 + random() * 0.95;
            const tree = createWorldSnowPine(treeHeight);
            
            // Sat on tilted surface precisely + 0.05 safety margin
            const topY = getTopY(tx, tz) + 0.05;
            tree.position.set(tx, topY, tz);
            tree.rotation.y = random() * Math.PI * 2;
            tree.rotation.x = (random() - 0.5) * 0.1;
            tree.rotation.z = (random() - 0.5) * 0.1;
            
            addStaticCulledObject(scene, tree);
          }
        }
        
        // Top rocks
        if (random() < 0.6) {
           const numTopRocks = 2 + Math.floor(random() * 3);
           for (let tr = 0; tr < numTopRocks; tr++) {
             const trSize = 0.4 + random() * 0.5;
             const topRock = createLowpolySnowRock(trSize, random, {
               color: worldMaterialColor('rock', '#687378'),
               snowCap: random() > 0.4
             });
             
             const tx = x + (random() - 0.5) * baseW * decoSpread;
             const tz = z + (random() - 0.5) * baseD * decoSpread;
             
             const topY = getTopY(tx, tz);
             topRock.position.set(tx, topY - 0.03 * trSize, tz);
             topRock.rotation.y = random() * Math.PI * 2;
             addStaticCulledObject(scene, topRock);
           }
        }
        
      }
    }
  });
}

function createPathCliffs() {} // dummy

// 远山轮廓：战场边界（|x|>50）外一圈雪山环抱谷地天际线，纯视觉不注册阻挡；
// 基座埋到地形下方，色彩向雾色靠拢做远景大气透视
function createDistantSnowMountains(scene) {
  const config = worldConfig();
  const random = seededRandom((config.seed ?? 42) + 77001);
  const cliffArt = config.art?.cliff ?? {};
  const sunDir = config.art?.sunDirection ?? { x: -0.6, y: 0.4, z: 0.5 };
  const fogColor = new THREE.Color(config.sky.fog ?? '#c8b0ac');
  const peakMat = mat(0xffffff, { vertexColors: true });
  const peakCount = 26;

  for (let i = 0; i < peakCount; i += 1) {
    const angle = (i / peakCount) * Math.PI * 2 + (random() - 0.5) * 0.16;
    // 椭圆环：东西略宽，南北收在地面深度内，避免超出地面板
    const ringRX = 94 + random() * 22;
    const ringRZ = 82 + random() * 16;
    const x = Math.cos(angle) * ringRX;
    const z = Math.sin(angle) * ringRZ;

    const height = 16 + random() * 20;
    const radius = height * (0.55 + random() * 0.3);
    const geo = new THREE.ConeGeometry(radius, height, 5 + Math.floor(random() * 3));

    // 越远的山越亮、越低对比，向雾色靠拢
    const haze = 0.4 + random() * 0.22;
    const sunlit = new THREE.Color(cliffArt.snow ?? '#eeeaea').lerp(fogColor, haze * 0.72);
    const mid = new THREE.Color(cliffArt.mid ?? '#766264').lerp(fogColor, haze);
    const shadow = new THREE.Color(cliffArt.shadow ?? '#403a4e').lerp(fogColor, haze);
    bakeWarmLighting(geo, sunlit, mid, shadow, sunDir);

    const peak = new THREE.Mesh(geo, peakMat);
    peak.position.set(x, height * 0.5 - 7 - random() * 3, z);
    peak.rotation.y = random() * Math.PI * 2;
    scene.add(peak);
  }

  // 中景山脚环：远山内圈再立一层较低山脊，远/中/近三层纵深
  const midCount = 18;
  for (let i = 0; i < midCount; i += 1) {
    const angle = (i / midCount) * Math.PI * 2 + (random() - 0.5) * 0.2;
    const ringRX = 64 + random() * 14;
    const ringRZ = 56 + random() * 12;
    const x = Math.cos(angle) * ringRX;
    const z = Math.sin(angle) * ringRZ;
    const height = 9 + random() * 9;
    const radius = height * (0.6 + random() * 0.28);
    const geo = new THREE.ConeGeometry(radius, height, 5 + Math.floor(random() * 2));
    const haze = 0.26 + random() * 0.16;
    const sunlit = new THREE.Color(cliffArt.snow ?? '#eeeaea').lerp(fogColor, haze * 0.7);
    const mid = new THREE.Color(cliffArt.mid ?? '#766264').lerp(fogColor, haze);
    const shadow = new THREE.Color(cliffArt.shadow ?? '#403a4e').lerp(fogColor, haze);
    bakeWarmLighting(geo, sunlit, mid, shadow, sunDir);
    const peak = new THREE.Mesh(geo, peakMat);
    peak.position.set(x, height * 0.5 - 6 - random() * 2, z);
    peak.rotation.y = random() * Math.PI * 2;
    scene.add(peak);
  }
}

// 雪覆岩堆：每组 3-5 块冰川漂磈式岩石簇拥成堆，主石居中、副石环绕，
// 高 1.4-2.4m 只作掩体与视线锚点，不遮战场；带 watchtower 的堆顶立瞭望塔
function placeSnowRockCluster(scene, zone, points, random) {
  const config = worldConfig();
  const rockCount = 3 + Math.floor(random() * 3);
  let mainRockTop = 0;

  for (let i = 0; i < rockCount; i += 1) {
    const angle = random() * Math.PI * 2;
    const spread = i === 0 ? 0 : (0.35 + random() * 0.65) * zone.radius;
    const x = zone.x + Math.cos(angle) * spread;
    const z = zone.z + Math.sin(angle) * spread;

    if (distanceToPath(x, z, points) < 6.5) continue;
    const pDist = Math.hypot(x - config.playerBasePosition.x, z - config.playerBasePosition.z);
    if (pDist < 16) continue;
    const eDist = Math.hypot(x - config.enemyCampPosition.x, z - config.enemyCampPosition.z);
    if (eDist < 16) continue;
    if (landmassMaskAt(x, z) < 0.62) continue;

    const size = i === 0 ? zone.coreHeight : zone.coreHeight * (0.42 + random() * 0.38);
    const rock = createLowpolySnowRock(size, random, {
      snowCap: random() > 0.35
    });
    rock.rotation.y = random() * Math.PI * 2;
    placeOnTerrain(rock, x, z, -0.12);
    addStaticCulledObject(scene, rock);
    if (i === 0) mainRockTop = terrainHeightAt(x, z) + size * 0.92;
  }

  if (mainRockTop <= 0) return;
  registerWorldNavigationBlocker(zone.x, zone.z, zone.radius * 0.75, 'rock-cluster');

  if (zone.watchtower) {
    const tower = createSnowWatchtower();
    tower.scale.setScalar(0.8);
    tower.rotation.y = random() * Math.PI * 2;
    tower.position.set(zone.x, mainRockTop - 0.22, zone.z);
    addStaticCulledObject(scene, tower);
  }
}
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy
 // dummy

// 雪谷瞭望塔：四根立柱抬起木平台，顶覆雪帽，角落立小旗，守望整片谷地
function createSnowWatchtower() {
  const group = new THREE.Group();
  const wood = mat('#6b5138', { roughness: 1 });
  const darkWood = mat('#463829', { roughness: 1 });
  const snowMat = mat('#eef2f8', { roughness: 0.9 });
  const posts = [
    [-0.75, -0.65, 2.9],
    [0.75, -0.65, 2.65],
    [-0.75, 0.65, 2.7],
    [0.75, 0.65, 2.95]
  ];
  posts.forEach(([x, z, height], index) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, height, 6), index % 2 ? darkWood : wood);
    post.position.set(x, height * 0.5, z);
    post.rotation.z = (index - 1.5) * 0.02;
    post.castShadow = true;
    group.add(post);
  });
  const platform = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.22, 2.0), wood);
  platform.position.y = 2.2;
  platform.castShadow = true;
  group.add(platform);
  [
    [0, 2.95, -0.95, 2.4, 0.16, 0.14],
    [0, 2.95, 0.95, 2.4, 0.16, 0.14],
    [-1.12, 2.95, 0, 0.14, 0.16, 2.0],
    [1.12, 2.95, 0, 0.14, 0.16, 2.0]
  ].forEach(([x, y, z, w, h, d]) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), darkWood);
    rail.position.set(x, y, z);
    rail.castShadow = true;
    group.add(rail);
  });
  // 雪帽顶：四棱锥雪盖压住平台
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.9, 4), snowMat);
  roof.position.set(0, 3.75, 0);
  roof.rotation.y = Math.PI * 0.25;
  roof.castShadow = true;
  group.add(roof);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 1.3, 5), darkWood);
  pole.position.set(0.9, 3.6, 0.72);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.3, 0.04), mat('#b34a3c', { roughness: 1 }));
  flag.position.set(1.16, 4.05, 0.72);
  group.add(pole, flag);
  return group;
}

// 雪谷帐篷：四棱锥帆布帐，顶上压一层积雪，与火堆搭配成小营地
function createSnowTent() {
  const group = new THREE.Group();
  const canvasMat = mat('#b9a17e', { roughness: 1 });
  const snowMat = mat('#eef2f8', { roughness: 0.92 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.5, 4), canvasMat);
  body.position.y = 0.75;
  body.rotation.y = Math.PI * 0.25;
  body.scale.set(1, 1, 1.35);
  body.castShadow = true;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.44, 4), snowMat);
  cap.position.y = 1.34;
  cap.rotation.y = Math.PI * 0.25;
  cap.scale.set(1, 1, 1.35);
  cap.castShadow = true;
  group.add(body, cap);
  return group;
}

function createSnowValleySignalFlag(color = '#b34a3c', height = 3.6) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.055, height, 5),
    mat('#45372b', { roughness: 1 })
  );
  pole.position.y = height * 0.5;
  const pennant = new THREE.Mesh(
    new THREE.ConeGeometry(0.48, 1.18, 3),
    mat(color, { roughness: 1, flatShading: true })
  );
  pennant.position.set(0.34, height - 0.46, 0);
  pennant.rotation.set(0, 0, -Math.PI * 0.5);
  group.add(pole, pennant);
  enableDecorationShadows(group);
  return group;
}

function createSnowValleyCommandLodge() {
  const group = new THREE.Group();
  const wood = mat('#6f5137', { roughness: 1 });
  const darkWood = mat('#45352a', { roughness: 1 });
  const canvas = mat('#9b805f', { roughness: 1 });
  const snow = mat('#eef2f8', { roughness: 0.9 });
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.28, 3.8), darkWood);
  foundation.position.y = 0.14;
  const hall = new THREE.Mesh(new THREE.BoxGeometry(4.9, 2.25, 3.18), wood);
  hall.position.y = 1.27;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.45, 1.48, 4), canvas);
  roof.position.y = 3.12;
  roof.rotation.y = Math.PI * 0.25;
  roof.scale.z = 0.76;
  const roofSnow = new THREE.Mesh(new THREE.ConeGeometry(2.72, 0.42, 4), snow);
  roofSnow.position.y = 3.64;
  roofSnow.rotation.y = Math.PI * 0.25;
  roofSnow.scale.z = 0.78;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.88, 1.32, 0.08), darkWood);
  door.position.set(0.78, 0.8, 1.64);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.16, 0.72), darkWood);
  awning.position.set(0.78, 1.62, 1.88);
  const flag = createSnowValleySignalFlag('#c94d3d', 5.1);
  flag.position.set(2.45, 0, 0.84);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.1, 5, 8), darkWood);
  wheel.position.set(-2.82, 0.64, 1.18);
  wheel.rotation.y = Math.PI * 0.5;
  const fire = createCampfireModel(1.1);
  fire.position.set(-2.35, 0, -1.1);
  [-2.65, 2.65].forEach((x) => {
    const fencePost = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.15, 5), darkWood);
    fencePost.position.set(x, 0.58, -1.78);
    const fenceRail = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.12), darkWood);
    fenceRail.position.set(x * 0.55, 0.72, -1.78);
    group.add(fencePost, fenceRail);
  });
  group.add(foundation, hall, roof, roofSnow, door, awning, flag, wheel, fire);
  enableDecorationShadows(group);
  return group;
}

function createSnowValleyEndpointOutpost() {
  const group = new THREE.Group();
  const wood = mat('#684a31', { roughness: 1 });
  const darkWood = mat('#403128', { roughness: 1 });
  const canvas = mat('#b28d5b', { roughness: 1 });
  const snow = mat('#eef2f8', { roughness: 0.92 });
  const fireMat = basicMat('#ffa03d', { transparent: true, opacity: 0.9, depthWrite: false });
  const addPalisade = (x, z, width, height, rotation = 0) => {
    const wall = new THREE.Group();
    const count = Math.max(3, Math.ceil(width / 0.55));
    for (let index = 0; index < count; index += 1) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, height, 5), index % 3 === 0 ? darkWood : wood);
      log.position.set(-width * 0.5 + (index / (count - 1)) * width, height * 0.5, 0);
      log.rotation.z = (index % 2 ? -1 : 1) * 0.025;
      wall.add(log);
    }
    const snowLine = new THREE.Mesh(new THREE.BoxGeometry(width + 0.18, 0.11, 0.26), snow);
    snowLine.position.y = height + 0.02;
    wall.add(snowLine);
    wall.position.set(x, 0, z);
    wall.rotation.y = rotation;
    group.add(wall);
  };
  const addBrazier = (x, z) => {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.3, 0.34, 6), darkWood);
    bowl.position.set(x, 1.0, z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.78, 5), wood);
    stem.position.set(x, 0.4, z);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 5), fireMat);
    flame.position.set(x, 1.42, z);
    group.add(bowl, stem, flame);
  };

  // 两段前栅留出正门，左右翼与后墙把帐篷收成一个完整木寨剪影。
  addPalisade(-4.25, 1.15, 3.4, 3.25);
  addPalisade(4.25, 1.15, 3.4, 3.25);
  addPalisade(-6.0, -1.25, 4.8, 3.05, Math.PI * 0.5);
  addPalisade(6.0, -1.25, 4.8, 3.05, Math.PI * 0.5);
  addPalisade(0, -3.55, 11.4, 3.35);
  [-2.25, 2.25].forEach((x) => {
    const gatePost = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 4.5, 6), darkWood);
    gatePost.position.set(x, 2.25, 1.15);
    group.add(gatePost);
  });
  const gateBeam = new THREE.Mesh(new THREE.BoxGeometry(5.25, 0.32, 0.38), darkWood);
  gateBeam.position.set(0, 4.05, 1.15);
  const gateSnow = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.1, 0.44), snow);
  gateSnow.position.set(0, 4.25, 1.15);
  group.add(gateBeam, gateSnow);
  const mainPole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 7.5, 6), darkWood);
  mainPole.position.set(0, 3.75, -2.4);
  const mainFlag = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.02, 0.09), mat('#b94437', { roughness: 1 }));
  mainFlag.position.set(0.9, 6.58, -2.4);
  addBrazier(-3.15, 0.18);
  addBrazier(3.15, 0.18);
  const rearTent = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.75, 4), canvas);
  rearTent.position.set(0, 1.38, -1.95);
  rearTent.rotation.y = Math.PI * 0.25;
  const rearSnow = new THREE.Mesh(new THREE.ConeGeometry(1.76, 0.38, 4), snow);
  rearSnow.position.set(0, 2.68, -1.95);
  rearSnow.rotation.y = Math.PI * 0.25;
  group.add(mainPole, mainFlag, rearTent, rearSnow);
  enableDecorationShadows(group);
  return group;
}

function placeSnowValleyLandmark(scene, object, spot, radius, kind) {
  object.rotation.y = spot.rot ?? 0;
  if (spot.scale) object.scale.setScalar(spot.scale);
  placeOnTerrain(object, spot.x, spot.z, spot.offset ?? 0);
  addStaticCulledObject(scene, object);
  registerWorldNavigationBlocker(spot.x, spot.z, radius * (spot.scale ?? 1), kind);
}

// 雪谷地标：左高台瞭望塔、右中景指挥营、推进节点与敌营远端木寨。
function placeSnowValleyLandmarks(scene) {
  const points = rawPathPoints();
  // 固定在左断崖台地的内缘顶面：完整塔身、屋顶与旗帜都压过远山天际线。
  const towerSpot = { x: -25.6, z: 19.4, rot: 1.1, scale: 1.48, offset: 10.15 };
  if (distanceToPath(towerSpot.x, towerSpot.z, points) >= 6.8) {
    placeSnowValleyLandmark(scene, createSnowWatchtower(), towerSpot, 1.35, 'snow-watchtower');
  }

  const commandCampSpot = { x: 26, z: 8, rot: -0.42, scale: 1.04 };
  if (distanceToPath(commandCampSpot.x, commandCampSpot.z, points) >= 8) {
    placeSnowValleyLandmark(scene, createSnowValleyCommandLodge(), commandCampSpot, 2.5, 'snow-command-lodge');
  }

  // The endpoint stays beyond the existing enemy camp / monster-camp logic:
  // its two side palisades are blockers, while the road-facing gate remains open.
  const endpointSpot = { x: 0, z: -40.1, rot: 0.04 };
  const endpoint = createSnowValleyEndpointOutpost();
  endpoint.rotation.y = endpointSpot.rot;
  placeOnTerrain(endpoint, endpointSpot.x, endpointSpot.z);
  addStaticCulledObject(scene, endpoint);
  registerWorldNavigationBlocker(-5.8, -40.1, 1.3, 'snow-endpoint-palisade-west');
  registerWorldNavigationBlocker(5.8, -40.1, 1.3, 'snow-endpoint-palisade-east');
  registerWorldNavigationBlocker(-4.25, -38.95, 1.45, 'snow-endpoint-palisade-front-west');
  registerWorldNavigationBlocker(4.25, -38.95, 1.45, 'snow-endpoint-palisade-front-east');
  registerWorldNavigationBlocker(0, -43.65, 4.9, 'snow-endpoint-palisade-rear');
}

// 开阔地边缘点缀：每个开阔地（广场/隘口/前庭）边缘立一块漂石、伴一株孤松，
// 标记空间边界、丰富轮廓，开阔地中心保持留白供布阵与机动
function decorateSnowValleyClearings(scene, pathPoints) {
  const random = seededRandom((worldConfig().seed ?? 42) + 133);
  worldConfig().clearings.forEach((clearing) => {
    const accents = clearing.r > 10 ? 2 : 1;
    for (let i = 0; i < accents; i += 1) {
      const angle = random() * Math.PI * 2;
      const x = clearing.x + Math.cos(angle) * clearing.r * 1.08;
      const z = clearing.z + Math.sin(angle) * clearing.r * 1.08;
      if (!isDecorationClear(x, z, pathPoints, 3.2)) continue;
      if (distanceToPath(x, z, pathPoints) < 5) continue;
      if (isNearCliff(x, z, 3)) continue;
      const size = 1.1 + random() * 0.7;
      const rock = createLowpolySnowRock(size, random, {
        color: worldMaterialColor('rock', '#687378'),
        snowCap: true
      });
      placeOnTerrain(rock, x, z, -0.06 * size);
      rock.rotation.y = random() * Math.PI * 2;
      rock.scale.y *= 0.7 + random() * 0.25;
      registerRockNavigationBlocker(x, z, size, rock.scale);
      addStaticCulledObject(scene, rock);
      // 孤松伴漂石，拉开开阔地边缘的剪影层次
      if (random() < 0.7) {
        const treeAngle = angle + (random() - 0.5) * 0.9;
        const treeX = clearing.x + Math.cos(treeAngle) * clearing.r * 1.2;
        const treeZ = clearing.z + Math.sin(treeAngle) * clearing.r * 1.2;
        if (isDecorationClear(treeX, treeZ, pathPoints, 3) && !isNearCliff(treeX, treeZ, 2.5)) {
          const height = 1.6 + random() * 0.8;
          const tree = createWorldSnowPine(height);
          placeOnTerrain(tree, treeX, treeZ);
          tree.rotation.y = random() * Math.PI * 2;
          registerWorldNavigationBlocker(treeX, treeZ, 0.42 + height * 0.24, 'snow-tree');
          addStaticCulledObject(scene, tree);
        }
      }
    }
  });
}

function createCentralDecorations(scene) {
  const config = worldConfig();
  const pathPoints = rawPathPoints();
  // 雪谷重制：不再在主路两侧均匀撒 60 块碎石，改用开阔地边缘点缀
  if (config.sceneKey === 'snow-valley') {
    decorateSnowValleyClearings(scene, pathPoints);
    placeSnowValleyLandmarks(scene);
    return;
  }
  const numDecos = 60;
  const random = seededRandom(config.seed ?? 8899);
  const theme = config.theme ?? 'snow';
  const isSnow = (theme === 'snow');
  
  for (let i = 0; i < numDecos; i++) {
    const r = random() * 45; 
    const theta = random() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    
    const h = terrainHeightAt(x, z);
    if (h > 7) continue; 
    
    const pathDist = distanceToPath(x, z, pathPoints);
    if (pathDist < 10 || pathDist > 25) continue; // Keep rocks on the sides of the road near the mountains
    
    if (isSnow) {
      const s = 0.42 + random() * 0.96; 
      const rock = createLowpolySnowRock(s, random, {
        color: worldMaterialColor('rock', random() > 0.45 ? '#687378' : '#748083'),
        snowCap: random() > 0.35
      });
      placeOnTerrain(rock, x, z, -0.05 * s);
      rock.rotation.y = random() * Math.PI * 2;
      
      addStaticCulledObject(scene, rock);
    } else {
      const s = 0.4 + random() * 0.6;
      const rock = createRock(s, {
        color: random() > 0.45 ? '#748083' : '#858b84',
        snowCap: false
      });
      placeOnTerrain(rock, x, z, 0.02);
      rock.rotation.y = random() * Math.PI * 2;
      addStaticCulledObject(scene, rock);
    }
  }
}
