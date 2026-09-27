import * as THREE from 'three';
import { createSoftParticleSprite } from './vfxMaterials.js';
import { markOutlineExempt } from './outlineMask.js';

// 海岛生存的美术资产：资源节点、地表散布与主基地。
//
// 资源节点每种只生成少量几何变体并全局缓存，每个节点只是一个共享几何 + 共享
// 材质的 Mesh（铁矿多一个矿晶 Mesh），颜色烘进顶点色。节点仍然是独立对象，
// 采空时照旧 visible = false 即可。
// 变体由世界坐标哈希决定，不消耗布点用的随机流，布点结果与模型外观互不牵连。

const GEOMETRIES = new Map();
const MATERIALS = new Map();

const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();
const tmpCentroid = new THREE.Vector3();
const tmpEdgeA = new THREE.Vector3();
const tmpEdgeB = new THREE.Vector3();

function hashUnit(a, b = 0, c = 0) {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453123;
  return value - Math.floor(value);
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function color(hex) {
  return new THREE.Color(hex);
}

function mixColor(a, b, t) {
  return a.clone().lerp(b, THREE.MathUtils.clamp(t, 0, 1));
}

function varyColor(base, amount, seed) {
  return base.clone().multiplyScalar(1 + (hashUnit(seed, 3.1) - 0.5) * amount);
}

/** Non-indexed triangle soup with per-vertex colors; normals become facet normals. */
class FacetBuilder {
  constructor() {
    this.positions = [];
    this.colors = [];
  }

  triangle(a, b, c, ca, cb = ca, cc = ca) {
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.colors.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  }

  doubleTriangle(a, b, c, ca, cb = ca, cc = ca) {
    this.triangle(a, b, c, ca, cb, cc);
    this.triangle(a, c, b, ca, cc, cb);
  }

  // deform 作用在变换前的局部坐标上，同一位置的顶点位移一致，面片不会裂开。
  append(source, matrix, paint, deform = null) {
    const geometry = source.index ? source.toNonIndexed() : source;
    const position = geometry.getAttribute('position');
    const corners = [tmpA, tmpB, tmpC];
    for (let index = 0; index < position.count; index += 3) {
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = corners[corner].fromBufferAttribute(position, index + corner);
        if (deform) deform(vertex);
        vertex.applyMatrix4(matrix);
      }
      tmpEdgeA.subVectors(tmpB, tmpA);
      tmpEdgeB.subVectors(tmpC, tmpA);
      tmpNormal.crossVectors(tmpEdgeA, tmpEdgeB).normalize();
      tmpCentroid.copy(tmpA).add(tmpB).add(tmpC).multiplyScalar(1 / 3);
      const faceColor = paint(tmpNormal, tmpCentroid, index / 3);
      this.triangle(tmpA, tmpB, tmpC, faceColor);
    }
    if (geometry !== source) geometry.dispose();
    source.dispose();
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function jitterDeform(amount, seed, { yScale = 1, keepBottom = null } = {}) {
  return (vertex) => {
    if (keepBottom !== null && vertex.y <= keepBottom) return;
    const kx = Math.round(vertex.x * 1000);
    const ky = Math.round(vertex.y * 1000);
    const kz = Math.round(vertex.z * 1000);
    vertex.x += (hashUnit(kx, ky, kz + seed) - 0.5) * 2 * amount;
    vertex.y += (hashUnit(ky + seed, kz, kx) - 0.5) * 2 * amount * yScale;
    vertex.z += (hashUnit(kz, kx + seed, ky) - 0.5) * 2 * amount;
  };
}

function composeMatrix(x, y, z, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz)
  );
}

// 从 start 指向 end 的圆柱（树枝、原木）
function segmentMatrix(start, end, radiusScale = 1) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize());
  const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  return {
    length,
    matrix: new THREE.Matrix4().compose(center, quaternion, new THREE.Vector3(radiusScale, 1, radiusScale))
  };
}

function cachedGeometry(key, build) {
  if (!GEOMETRIES.has(key)) GEOMETRIES.set(key, build());
  return GEOMETRIES.get(key);
}

function vertexColorMaterial(key, options = {}) {
  if (MATERIALS.has(key)) return MATERIALS.get(key);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: true,
    roughness: 0.9,
    metalness: 0,
    ...options
  });
  MATERIALS.set(key, material);
  return material;
}

// 只适用于不透明（NoBlending）材质，alpha 会原样写进后处理缓冲。
function outlineExemptMaterial(key, options = {}) {
  if (MATERIALS.has(key)) return MATERIALS.get(key);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: true,
    roughness: 0.9,
    metalness: 0,
    ...options
  });
  material.onBeforeCompile = markOutlineExempt;
  material.customProgramCacheKey = () => 'island-outline-exempt';
  MATERIALS.set(key, material);
  return material;
}

function flatMaterial(hex, options = {}) {
  const key = `flat:${hex}:${JSON.stringify(options)}`;
  if (MATERIALS.has(key)) return MATERIALS.get(key);
  const material = new THREE.MeshStandardMaterial({
    color: hex,
    flatShading: true,
    roughness: 0.88,
    metalness: 0,
    ...options
  });
  MATERIALS.set(key, material);
  return material;
}

function pickVariant(x, z, count, salt = 0) {
  return Math.min(count - 1, Math.floor(hashUnit(x * 0.731 + salt, z * 0.593 - salt) * count));
}

// ---------------------------------------------------------------------------
// 橡树：圆润的阔叶树冠团块 + 分叉树干。和松树的尖塔轮廓一眼能分开。
// ---------------------------------------------------------------------------
const OAK_PALETTES = [
  { low: '#315b2a', mid: '#4d8a36', top: '#86ba4b' },
  { low: '#355f2c', mid: '#57923d', top: '#98c656' },
  { low: '#2c5530', mid: '#437d3c', top: '#74aa4c' },
  { low: '#46652a', mid: '#6a9934', top: '#a8c64e' },
  { low: '#315b2a', mid: '#4f8c38', top: '#8cbc4c' },
  { low: '#2f5a2c', mid: '#4a8738', top: '#7fb44a' },
  { low: '#355f2c', mid: '#5a943e', top: '#9ac858' },
  // 秋色点缀：整片林子里偶尔一棵，打破单一绿色（必须是最后一项）
  { low: '#7a4a1c', mid: '#b8742a', top: '#e6ad45' }
];
const AUTUMN_OAK_CHANCE = 0.07;
const TRUNK_LIGHT = color('#7a5638');
const TRUNK_DARK = color('#4b3322');

function paintWood(normal, centroid, face) {
  const lit = THREE.MathUtils.clamp(normal.x * 0.4 + normal.z * 0.3 + 0.5, 0, 1);
  return varyColor(mixColor(TRUNK_DARK, TRUNK_LIGHT, lit), 0.14, face * 1.7);
}

function buildOakGeometry(variant) {
  const random = createRandom(9100 + variant * 131);
  const palette = OAK_PALETTES[variant];
  const low = color(palette.low);
  const mid = color(palette.mid);
  const top = color(palette.top);
  const builder = new FacetBuilder();

  const trunkHeight = 1.02 + random() * 0.16;
  builder.append(
    new THREE.CylinderGeometry(0.1, 0.16, trunkHeight, 6, 2),
    composeMatrix(0, trunkHeight / 2, 0),
    paintWood,
    jitterDeform(0.02, variant)
  );
  builder.append(
    new THREE.CylinderGeometry(0.16, 0.27, 0.2, 6),
    composeMatrix(0, 0.1, 0, 1, 1, 1, 0, 0.4),
    paintWood
  );
  for (let branch = 0; branch < 2; branch += 1) {
    const angle = random() * Math.PI * 2 + branch * Math.PI;
    const start = new THREE.Vector3(0, trunkHeight * 0.66, 0);
    const end = new THREE.Vector3(Math.cos(angle) * 0.46, trunkHeight + 0.2, Math.sin(angle) * 0.46);
    const segment = segmentMatrix(start, end);
    builder.append(new THREE.CylinderGeometry(0.035, 0.06, segment.length, 5), segment.matrix, paintWood);
  }

  const blobs = [{ x: 0, y: 1.62, z: 0, r: 0.78 }];
  const ring = 4 + Math.floor(random() * 2);
  for (let index = 0; index < ring; index += 1) {
    const angle = (index / ring) * Math.PI * 2 + random() * 0.6;
    const distance = 0.46 + random() * 0.22;
    blobs.push({
      x: Math.cos(angle) * distance,
      y: 1.34 + random() * 0.42,
      z: Math.sin(angle) * distance,
      r: 0.44 + random() * 0.18
    });
  }
  blobs.push({ x: (random() - 0.5) * 0.24, y: 2.08 + random() * 0.1, z: (random() - 0.5) * 0.24, r: 0.46 });

  blobs.forEach((blob, blobIndex) => {
    builder.append(
      new THREE.IcosahedronGeometry(blob.r, 1),
      composeMatrix(blob.x, blob.y, blob.z, 1, 0.86, 1, 0, random() * Math.PI),
      (normal, centroid, face) => {
        const height = THREE.MathUtils.clamp((centroid.y - 0.95) / 1.55, 0, 1);
        let shade = mixColor(low, mid, height * 1.4);
        shade = mixColor(shade, top, Math.max(0, normal.y) * 0.62 + height * 0.18);
        if (normal.y < -0.35) shade = mixColor(shade, low, 0.55);
        return varyColor(shade, 0.12, face * 2.3 + blobIndex * 17 + variant);
      },
      jitterDeform(blob.r * 0.13, variant * 7 + blobIndex)
    );
  });
  return builder.build();
}

// ---------------------------------------------------------------------------
// 松树：四层下垂的锯齿锥冠，冷调深绿，和橡树的暖绿团块区分。
// ---------------------------------------------------------------------------
const PINE_PALETTES = [
  { low: '#1d4430', mid: '#2e6442', top: '#5a9a56' },
  { low: '#1c4238', mid: '#2b5e4f', top: '#579a78' },
  { low: '#214a31', mid: '#356d46', top: '#67a45c' },
  { low: '#1b402f', mid: '#2a5c40', top: '#4f8d52' }
];
const PINE_TIERS = [
  { base: 0.42, height: 1.02, radius: 0.86 },
  { base: 0.9, height: 0.9, radius: 0.68 },
  { base: 1.34, height: 0.8, radius: 0.5 },
  { base: 1.74, height: 0.74, radius: 0.31 }
];

function buildPineGeometry(variant) {
  const palette = PINE_PALETTES[variant];
  const low = color(palette.low);
  const mid = color(palette.mid);
  const top = color(palette.top);
  const builder = new FacetBuilder();
  builder.append(
    new THREE.CylinderGeometry(0.07, 0.13, 0.95, 6),
    composeMatrix(0, 0.475, 0),
    paintWood
  );
  PINE_TIERS.forEach((tier, level) => {
    const segments = 9;
    const cone = new THREE.ConeGeometry(tier.radius, tier.height, segments, 1);
    const halfHeight = tier.height / 2;
    builder.append(
      cone,
      composeMatrix(0, tier.base + halfHeight, 0, 1, 1, 1, 0, level * 0.61 + variant * 0.37),
      (normal, centroid, face) => {
        const height = THREE.MathUtils.clamp((centroid.y - 0.4) / 2.1, 0, 1);
        let shade = mixColor(low, mid, height * 1.5);
        shade = mixColor(shade, top, Math.max(0, normal.y) * 0.55 + height * 0.2);
        if (normal.y < -0.2) shade = mixColor(low, low.clone().multiplyScalar(0.7), 0.5);
        return varyColor(shade, 0.1, face * 3.1 + level * 11 + variant);
      },
      (vertex) => {
        if (vertex.y > -halfHeight + 0.001) return;
        // 锥底一圈：尖端外伸并下垂，凹口内收，形成锯齿枝层
        const angle = Math.atan2(vertex.z, vertex.x);
        const tip = Math.round((angle / (Math.PI * 2)) * segments) % 2 === 0;
        const scale = tip ? 1.08 : 0.8;
        vertex.x *= scale;
        vertex.z *= scale;
        vertex.y -= tip ? 0.08 : -0.03;
      }
    );
  });
  return builder.build();
}

// ---------------------------------------------------------------------------
// 石堆：几块大小不一的暖灰巨石 + 碎石，顶面带苔藓，读作「可开采的石料」。
// ---------------------------------------------------------------------------
const STONE_TONES = ['#a19a8d', '#9b968c', '#aaa292', '#948f86'];
const MOSS = color('#6f9043');

function buildStonePileGeometry(variant) {
  const random = createRandom(7300 + variant * 71);
  const builder = new FacetBuilder();
  const boulders = [{ x: 0, z: 0, r: 0.52, squash: 0.72 }];
  const extra = 2 + Math.floor(random() * 2);
  for (let index = 0; index < extra; index += 1) {
    const angle = (index / extra) * Math.PI * 2 + random() * 0.9;
    const distance = 0.42 + random() * 0.2;
    boulders.push({
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      r: 0.26 + random() * 0.14,
      squash: 0.62 + random() * 0.2
    });
  }
  for (let index = 0; index < 4; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = 0.62 + random() * 0.28;
    boulders.push({
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      r: 0.09 + random() * 0.07,
      squash: 0.6
    });
  }
  boulders.forEach((boulder, index) => {
    const tone = color(STONE_TONES[(variant + index) % STONE_TONES.length]);
    const light = tone.clone().multiplyScalar(1.22);
    const dark = tone.clone().multiplyScalar(0.62);
    const mossy = boulder.r > 0.2 && random() < 0.7;
    builder.append(
      new THREE.DodecahedronGeometry(boulder.r, 0),
      composeMatrix(
        boulder.x,
        boulder.r * boulder.squash * 0.62,
        boulder.z,
        1,
        boulder.squash,
        0.88 + random() * 0.2,
        (random() - 0.5) * 0.4,
        random() * Math.PI,
        (random() - 0.5) * 0.4
      ),
      (normal, centroid, face) => {
        let shade = mixColor(dark, light, normal.y * 0.5 + 0.5);
        if (mossy && normal.y > 0.72 && hashUnit(face, index, variant) < 0.55) {
          shade = mixColor(shade, MOSS, 0.78);
        }
        return varyColor(shade, 0.1, face * 1.9 + index * 13);
      },
      jitterDeform(boulder.r * 0.16, variant * 5 + index)
    );
  });
  return builder.build();
}

// ---------------------------------------------------------------------------
// 铁矿脉：深青灰岩体、锈红矿面，外加一簇金属矿晶（单独的金属材质）。
// ---------------------------------------------------------------------------
const IRON_ROCK_LIGHT = color('#6c727b');
const IRON_ROCK_DARK = color('#33363c');
const RUST_A = color('#9a5230');
const RUST_B = color('#c0743c');

function buildIronRockGeometry(variant) {
  const random = createRandom(8200 + variant * 53);
  const builder = new FacetBuilder();
  const rocks = [
    { x: 0, z: 0, r: 0.62, squash: 0.82 },
    { x: 0.52, z: 0.18, r: 0.32, squash: 0.7 },
    { x: -0.38, z: 0.42, r: 0.26, squash: 0.66 }
  ];
  if (variant % 2) rocks.push({ x: -0.3, z: -0.48, r: 0.3, squash: 0.72 });
  rocks.forEach((rock, index) => {
    builder.append(
      new THREE.DodecahedronGeometry(rock.r, 0),
      composeMatrix(
        rock.x,
        rock.r * rock.squash * 0.6,
        rock.z,
        1,
        rock.squash,
        1,
        (random() - 0.5) * 0.5,
        random() * Math.PI,
        (random() - 0.5) * 0.5
      ),
      (normal, centroid, face) => {
        const roll = hashUnit(face, index * 7, variant);
        if (roll < 0.3) return varyColor(mixColor(RUST_A, RUST_B, normal.y * 0.5 + 0.5), 0.12, face);
        return varyColor(mixColor(IRON_ROCK_DARK, IRON_ROCK_LIGHT, normal.y * 0.5 + 0.5), 0.1, face * 2.7 + index);
      },
      jitterDeform(rock.r * 0.18, variant * 3 + index)
    );
  });
  return builder.build();
}

const ORE_LIGHT = color('#dfe8f0');
const ORE_DARK = color('#7c8a99');

function buildIronOreGeometry(variant) {
  const random = createRandom(8600 + variant * 29);
  const builder = new FacetBuilder();
  const shards = 5 + (variant % 2);
  for (let index = 0; index < shards; index += 1) {
    const angle = (index / shards) * Math.PI * 2 + random() * 0.7;
    const distance = 0.12 + random() * 0.3;
    const length = 0.26 + random() * 0.22;
    const tilt = 0.35 + random() * 0.45;
    builder.append(
      new THREE.OctahedronGeometry(0.1 + random() * 0.04, 0),
      composeMatrix(
        Math.cos(angle) * distance,
        0.62 + random() * 0.14,
        Math.sin(angle) * distance,
        0.8,
        length / 0.12,
        0.8,
        Math.sin(angle) * tilt,
        random() * Math.PI,
        -Math.cos(angle) * tilt
      ),
      (normal, centroid, face) => varyColor(mixColor(ORE_DARK, ORE_LIGHT, normal.y * 0.6 + 0.4), 0.08, face + index * 5)
    );
  }
  return builder.build();
}

// ---------------------------------------------------------------------------
// 浆果丛：低矮叶团 + 醒目的红果。
// ---------------------------------------------------------------------------
const BERRY_COLORS = [color('#e2334f'), color('#c81f3d'), color('#f0564a')];

function buildBerryBushGeometry(variant) {
  const random = createRandom(6400 + variant * 37);
  const low = color('#2a5a2c');
  const top = color('#5f9f46');
  const builder = new FacetBuilder();
  const blobs = [{ x: 0, y: 0.38, z: 0, r: 0.44 }];
  const extra = 3;
  for (let index = 0; index < extra; index += 1) {
    const angle = (index / extra) * Math.PI * 2 + random() * 0.8;
    blobs.push({
      x: Math.cos(angle) * 0.34,
      y: 0.28 + random() * 0.08,
      z: Math.sin(angle) * 0.34,
      r: 0.3 + random() * 0.08
    });
  }
  blobs.forEach((blob, index) => {
    builder.append(
      new THREE.IcosahedronGeometry(blob.r, 1),
      composeMatrix(blob.x, blob.y, blob.z, 1, 0.82, 1),
      (normal, centroid, face) => {
        const shade = mixColor(low, top, normal.y * 0.55 + 0.45);
        return varyColor(shade, 0.12, face * 1.3 + index * 9 + variant);
      },
      jitterDeform(blob.r * 0.14, variant * 11 + index)
    );
  });
  const berryGeometry = new THREE.IcosahedronGeometry(0.062, 0);
  const berries = 12 + (variant % 3) * 2;
  for (let index = 0; index < berries; index += 1) {
    const blob = blobs[index % blobs.length];
    const theta = random() * Math.PI * 2;
    const phi = random() * 1.25;
    const direction = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi) * 0.82, Math.sin(phi) * Math.sin(theta));
    const berryColor = BERRY_COLORS[index % BERRY_COLORS.length];
    builder.append(
      berryGeometry.clone(),
      composeMatrix(
        blob.x + direction.x * blob.r * 1.02,
        blob.y + direction.y * blob.r * 1.02,
        blob.z + direction.z * blob.r * 1.02
      ),
      (normal) => berryColor.clone().multiplyScalar(0.72 + Math.max(0, normal.y) * 0.5)
    );
  }
  berryGeometry.dispose();
  return builder.build();
}

// ---------------------------------------------------------------------------
// 纤维草：高挑的淡黄绿草丛，顶端带奶白色穗子，和地面的矮草装饰明显不同。
// ---------------------------------------------------------------------------
function appendBlade(builder, { angle, lean, height, width, baseColor, tipColor, offsetX = 0, offsetZ = 0, segments = 3 }) {
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);
  const perpX = -dirZ;
  const perpZ = dirX;
  const point = (t, side) => {
    const bend = lean * height * t * t;
    const halfWidth = width * 0.5 * (1 - t);
    return new THREE.Vector3(
      offsetX + dirX * bend + perpX * halfWidth * side,
      height * t * (1 - lean * 0.18 * t),
      offsetZ + dirZ * bend + perpZ * halfWidth * side
    );
  };
  for (let segment = 0; segment < segments; segment += 1) {
    const t0 = segment / segments;
    const t1 = (segment + 1) / segments;
    const c0 = mixColor(baseColor, tipColor, t0);
    const c1 = mixColor(baseColor, tipColor, t1);
    const l0 = point(t0, -1);
    const r0 = point(t0, 1);
    const l1 = point(t1, -1);
    const r1 = point(t1, 1);
    if (segment === segments - 1) {
      builder.doubleTriangle(l0, r0, point(1, 0), c0, c0, c1);
    } else {
      builder.doubleTriangle(l0, r0, r1, c0, c0, c1);
      builder.doubleTriangle(l0, r1, l1, c0, c1, c1);
    }
  }
  return point(1, 0);
}

function buildFiberPlantGeometry(variant) {
  const random = createRandom(5100 + variant * 43);
  const builder = new FacetBuilder();
  const baseColor = color('#5f7f33');
  const tipColor = color('#d6dc88');
  const seedColor = color('#f1e7c6');
  const blades = 11 + variant;
  const seedGeometry = new THREE.OctahedronGeometry(0.045, 0);
  for (let index = 0; index < blades; index += 1) {
    const angle = (index / blades) * Math.PI * 2 + random() * 0.5;
    const tip = appendBlade(builder, {
      angle,
      lean: 0.18 + random() * 0.32,
      height: 0.68 + random() * 0.38,
      width: 0.07 + random() * 0.025,
      baseColor,
      tipColor,
      offsetX: Math.cos(angle) * 0.06,
      offsetZ: Math.sin(angle) * 0.06
    });
    if (index % 3 === 0) {
      builder.append(
        seedGeometry.clone(),
        composeMatrix(tip.x, tip.y + 0.05, tip.z, 1, 2.4, 1),
        (normal) => seedColor.clone().multiplyScalar(0.8 + Math.max(0, normal.y) * 0.3)
      );
    }
  }
  seedGeometry.dispose();
  return builder.build();
}

// ---------------------------------------------------------------------------
// 资源节点工厂
// ---------------------------------------------------------------------------
const NODE_BUILDERS = {
  tree: { variants: OAK_PALETTES.length, build: buildOakGeometry },
  pine: { variants: PINE_PALETTES.length, build: buildPineGeometry },
  rock: { variants: 4, build: buildStonePileGeometry },
  ore: { variants: 4, build: buildIronRockGeometry },
  bush: { variants: 3, build: buildBerryBushGeometry },
  grass: { variants: 3, build: buildFiberPlantGeometry }
};

function nodeMaterial() {
  return vertexColorMaterial('island-node', { roughness: 0.9 });
}

function oreMaterial() {
  return vertexColorMaterial('island-ore', {
    roughness: 0.34,
    metalness: 0.62,
    emissive: '#18222e',
    emissiveIntensity: 1
  });
}

/**
 * definition 是 RESOURCE_NODE_DEFINITIONS 的条目；返回 null 表示不认识这个模型类型。
 * 松树与橡树共用 `model: 'tree'`，按 definition.id 区分轮廓。
 */
export function createIslandResourceModel(definition, size, x = 0, z = 0) {
  const kind = definition.model === 'tree' && definition.id === 'pine' ? 'pine' : definition.model;
  const entry = NODE_BUILDERS[kind];
  if (!entry) return null;
  let variant = pickVariant(x, z, entry.variants - (kind === 'tree' ? 1 : 0), kind.length);
  if (kind === 'tree' && hashUnit(x * 1.37 - 4.1, z * 0.91 + 8.3) < AUTUMN_OAK_CHANCE) variant = OAK_PALETTES.length - 1;
  const geometry = cachedGeometry(`${kind}:${variant}`, () => entry.build(variant));
  const material = kind === 'grass' ? outlineExemptMaterial('island-node-foliage') : nodeMaterial();
  const object = new THREE.Mesh(geometry, material);
  object.name = `IslandResource:${definition.id}`;
  object.scale.setScalar(size);
  if (kind === 'ore') {
    const group = new THREE.Group();
    group.name = object.name;
    object.name = 'IslandIronRock';
    object.scale.setScalar(1);
    const ore = new THREE.Mesh(cachedGeometry(`ore-crystal:${variant}`, () => buildIronOreGeometry(variant)), oreMaterial());
    ore.name = 'IslandIronOre';
    group.add(object, ore);
    group.scale.setScalar(size);
    return group;
  }
  return object;
}

// ---------------------------------------------------------------------------
// 地表散布（实例化）：矮草、野花、碎石、海岸礁石
// ---------------------------------------------------------------------------
function buildGrassTuftGeometry() {
  const random = createRandom(4401);
  const builder = new FacetBuilder();
  // 实例色取自脚下地表，草叶按朝上法线受光，根部略暗、叶尖偏黄绿提亮
  const base = new THREE.Color(0.84, 0.9, 0.72);
  const tip = new THREE.Color(1.28, 1.4, 0.96);
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2 + random() * 0.6;
    appendBlade(builder, {
      angle,
      lean: 0.25 + random() * 0.35,
      height: 0.22 + random() * 0.16,
      width: 0.06,
      baseColor: base,
      tipColor: tip,
      offsetX: Math.cos(angle) * 0.04,
      offsetZ: Math.sin(angle) * 0.04,
      segments: 2
    });
  }
  return builder.build();
}

function buildFlowerPetalGeometry() {
  const builder = new FacetBuilder();
  const height = 0.16;
  const center = new THREE.Vector3(0, height, 0);
  const white = new THREE.Color(1, 1, 1);
  const inner = new THREE.Color(0.8, 0.8, 0.8);
  for (let petal = 0; petal < 5; petal += 1) {
    const angle = (petal / 5) * Math.PI * 2;
    const left = new THREE.Vector3(Math.cos(angle - 0.42) * 0.055, height + 0.008, Math.sin(angle - 0.42) * 0.055);
    const right = new THREE.Vector3(Math.cos(angle + 0.42) * 0.055, height + 0.008, Math.sin(angle + 0.42) * 0.055);
    const tip = new THREE.Vector3(Math.cos(angle) * 0.13, height + 0.03, Math.sin(angle) * 0.13);
    builder.doubleTriangle(center, left, tip, inner, white, white);
    builder.doubleTriangle(center, tip, right, inner, white, white);
  }
  return builder.build();
}

function buildFlowerStemGeometry() {
  const builder = new FacetBuilder();
  const stem = new THREE.Color('#4d7a30');
  const leaf = new THREE.Color('#5f9138');
  const heart = new THREE.Color('#f3c640');
  builder.doubleTriangle(new THREE.Vector3(-0.012, 0, 0), new THREE.Vector3(0.012, 0, 0), new THREE.Vector3(0, 0.165, 0), stem);
  builder.doubleTriangle(new THREE.Vector3(0, 0.04, 0), new THREE.Vector3(0.1, 0.07, 0.03), new THREE.Vector3(0.02, 0.09, 0), leaf);
  builder.doubleTriangle(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(-0.09, 0.08, -0.03), new THREE.Vector3(-0.015, 0.1, 0), leaf);
  const cap = new THREE.Vector3(0, 0.185, 0);
  for (let side = 0; side < 5; side += 1) {
    const a0 = (side / 5) * Math.PI * 2;
    const a1 = ((side + 1) / 5) * Math.PI * 2;
    builder.doubleTriangle(
      cap,
      new THREE.Vector3(Math.cos(a0) * 0.035, 0.172, Math.sin(a0) * 0.035),
      new THREE.Vector3(Math.cos(a1) * 0.035, 0.172, Math.sin(a1) * 0.035),
      heart
    );
  }
  return builder.build();
}

function buildPebbleGeometry() {
  const builder = new FacetBuilder();
  const light = new THREE.Color(1.12, 1.12, 1.1);
  const dark = new THREE.Color(0.62, 0.62, 0.62);
  builder.append(
    new THREE.IcosahedronGeometry(0.12, 0),
    composeMatrix(0, 0.035, 0, 1, 0.5, 0.8),
    (normal) => mixColor(dark, light, normal.y * 0.5 + 0.5),
    jitterDeform(0.025, 17)
  );
  return builder.build();
}

function buildShoreRockGeometry(variant) {
  const builder = new FacetBuilder();
  const light = new THREE.Color(1.15, 1.13, 1.08);
  const dark = new THREE.Color(0.5, 0.5, 0.52);
  const wet = new THREE.Color(0.36, 0.38, 0.4);
  builder.append(
    new THREE.DodecahedronGeometry(1, 0),
    composeMatrix(0, 0.3, 0, 1, 0.74, 0.9, 0, variant * 0.9),
    (normal, centroid, face) => {
      let shade = mixColor(dark, light, normal.y * 0.55 + 0.45);
      // 吃水线以下的面偏暗偏冷，像被海水打湿
      if (centroid.y < 0.12) shade = mixColor(shade, wet, 0.6);
      return varyColor(shade, 0.12, face * 2.1 + variant * 7);
    },
    jitterDeform(0.2, 40 + variant)
  );
  return builder.build();
}

// 草叶与花用「朝上」法线受光：和脚下地面一致地明暗，不会因为竖直叶面背光而发灰发蓝。
function createWindMaterial(key, windUniforms, options = {}) {
  if (MATERIALS.has(key)) return MATERIALS.get(key);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    side: THREE.FrontSide,
    ...options
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uIslandWindTime = windUniforms.uIslandWindTime;
    shader.vertexShader = `
      uniform float uIslandWindTime;
      ${shader.vertexShader}
    `.replace(
      '#include <beginnormal_vertex>',
      'vec3 objectNormal = vec3(0.0, 1.0, 0.0);'
    ).replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 islandWindRoot = instanceMatrix[3].xyz;
      #else
        vec3 islandWindRoot = vec3(0.0);
      #endif
      float islandGust = sin(uIslandWindTime * 1.6 + islandWindRoot.x * 0.21 + islandWindRoot.z * 0.17)
        + 0.45 * sin(uIslandWindTime * 2.9 + islandWindRoot.x * 0.53);
      float islandBend = max(0.0, position.y) * max(0.0, position.y);
      transformed.x += islandGust * islandBend * 0.55;
      transformed.z += islandGust * islandBend * 0.28;
      `
    );
    markOutlineExempt(shader);
  };
  material.customProgramCacheKey = () => `island-wind:${key}`;
  MATERIALS.set(key, material);
  return material;
}

const WIND_UNIFORMS = { uIslandWindTime: { value: 0 } };

export function updateIslandWind(elapsed) {
  WIND_UNIFORMS.uIslandWindTime.value = elapsed;
}

function instanced(geometry, material, placements, { castShadow = false, colors = true } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, placements.length));
  mesh.count = placements.length;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  placements.forEach((placement, index) => {
    euler.set(placement.tiltX ?? 0, placement.rotation ?? 0, placement.tiltZ ?? 0);
    quaternion.setFromEuler(euler);
    position.set(placement.x, placement.y, placement.z);
    scale.set(placement.scaleX ?? placement.scale, placement.scaleY ?? placement.scale, placement.scaleZ ?? placement.scale);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    if (colors && placement.color) mesh.setColorAt(index, placement.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * placements: { grass, flowers, pebbles, shoreRocks }，每项是
 * { x, y, z, rotation, scale, color? } 数组。返回需要加进场景的对象列表。
 */
export function createIslandScatterMeshes(placements) {
  const objects = [];
  if (placements.grass?.length) {
    const mesh = instanced(
      cachedGeometry('scatter-grass', buildGrassTuftGeometry),
      createWindMaterial('scatter-grass', WIND_UNIFORMS),
      placements.grass
    );
    mesh.name = 'IslandGrassScatter';
    objects.push(mesh);
  }
  if (placements.flowers?.length) {
    const petals = instanced(
      cachedGeometry('scatter-flower-petals', buildFlowerPetalGeometry),
      createWindMaterial('scatter-flower-petals', WIND_UNIFORMS, { roughness: 0.7 }),
      placements.flowers
    );
    petals.name = 'IslandFlowerPetals';
    const stems = instanced(
      cachedGeometry('scatter-flower-stems', buildFlowerStemGeometry),
      createWindMaterial('scatter-flower-stems', WIND_UNIFORMS),
      placements.flowers,
      { colors: false }
    );
    stems.name = 'IslandFlowerStems';
    objects.push(petals, stems);
  }
  if (placements.pebbles?.length) {
    const mesh = instanced(
      cachedGeometry('scatter-pebble', buildPebbleGeometry),
      vertexColorMaterial('scatter-rock'),
      placements.pebbles
    );
    mesh.name = 'IslandPebbles';
    objects.push(mesh);
  }
  if (placements.shoreRocks?.length) {
    const groups = [[], [], []];
    placements.shoreRocks.forEach((rock, index) => groups[index % groups.length].push(rock));
    groups.forEach((group, variant) => {
      if (!group.length) return;
      const mesh = instanced(
        cachedGeometry(`scatter-shore-rock:${variant}`, () => buildShoreRockGeometry(variant)),
        vertexColorMaterial('scatter-rock'),
        group,
        { castShadow: true }
      );
      mesh.name = 'IslandShoreRocks';
      objects.push(mesh);
    });
  }
  return objects;
}

// ---------------------------------------------------------------------------
// 主基地：石基木构的海岛要塞。正门朝 +Z（默认镜头所在一侧），
// 占地半径不超过约 2.5m，与 collisionRadius 2.35 对齐。
// ---------------------------------------------------------------------------
const OCTAGON_TWIST = Math.PI / 8;

function part(group, geometry, material, x, y, z, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.rotation.set(rx, ry, rz);
  object.scale.set(sx, sy, sz);
  group.add(object);
  return object;
}

function beam(group, start, end, thickness, material) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const object = new THREE.Mesh(new THREE.BoxGeometry(thickness, length, thickness), material);
  object.position.addVectors(start, end).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(UP, direction.normalize());
  group.add(object);
  return object;
}

// CylinderGeometry 的顶点角 θ 满足 x = r·sinθ, z = r·cosθ；整体再转 OCTAGON_TWIST。
function octagonCorner(index, radius) {
  const angle = (index / 8) * Math.PI * 2 + OCTAGON_TWIST;
  return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius, angle };
}

function octagonFace(index, radius) {
  const angle = (index / 8) * Math.PI * 2;
  return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius, angle };
}

function createPennantGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0.16, 0, 0, -0.16, 0, 0.5, 0.02, 0
  ], 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createIslandKeepBaseModel() {
  const group = new THREE.Group();
  group.name = 'IslandKeepBase';
  group.userData.baseTheme = 'island';
  group.userData.baseStyle = 'island-keep';

  const M = {
    stoneDark: flatMaterial('#6d665c', { roughness: 0.95 }),
    stone: flatMaterial('#a89f8e', { roughness: 0.92 }),
    stoneLight: flatMaterial('#c8bea8', { roughness: 0.9 }),
    plaster: flatMaterial('#efe3c7', { roughness: 0.94 }),
    beam: flatMaterial('#5a3c29', { roughness: 0.92 }),
    wood: flatMaterial('#8b5e3b', { roughness: 0.9 }),
    woodDark: flatMaterial('#3f2b1d', { roughness: 0.96 }),
    roof: flatMaterial('#b9523b', { roughness: 0.78 }),
    roofDark: flatMaterial('#873728', { roughness: 0.82 }),
    metal: flatMaterial('#4b525a', { roughness: 0.46, metalness: 0.5 }),
    gold: flatMaterial('#e0ae48', { roughness: 0.4, metalness: 0.45 }),
    banner: flatMaterial('#2e5ea4', { roughness: 0.86, side: THREE.DoubleSide }),
    bannerTrim: flatMaterial('#e8c25a', { roughness: 0.6 }),
    foliage: flatMaterial('#4f8a3a', { roughness: 0.9 }),
    window: flatMaterial('#ffd08a', { roughness: 0.5, emissive: '#ff9a3d', emissiveIntensity: 0.95 }),
    energy: flatMaterial('#baf4ff', { roughness: 0.22, metalness: 0.08, emissive: '#4fcbe9', emissiveIntensity: 1.7 })
  };

  // 地面：石板散铺成一圈前庭，外沿参差，交代「基地占地」
  const flagstone = new THREE.CylinderGeometry(1, 1, 0.07, 6);
  const apron = createRandom(4242);
  for (let index = 0; index < 22; index += 1) {
    const angle = (index / 22) * Math.PI * 2 + apron() * 0.2;
    const radius = 2.32 + apron() * 0.5;
    const size = 0.2 + apron() * 0.12;
    part(group, flagstone, apron() > 0.5 ? M.stone : M.stoneLight,
      Math.sin(angle) * radius, 0.035, Math.cos(angle) * radius,
      { ry: apron() * Math.PI, sx: size, sz: size * (0.75 + apron() * 0.4) });
  }

  // 石基座
  part(group, new THREE.CylinderGeometry(2.02, 2.22, 0.38, 8), M.stoneDark, 0, 0.19, 0, { ry: OCTAGON_TWIST });
  part(group, new THREE.CylinderGeometry(1.9, 2.0, 0.1, 8), M.stone, 0, 0.43, 0, { ry: OCTAGON_TWIST });
  // 石阶：从基座前沿下到地面
  part(group, new THREE.BoxGeometry(1.12, 0.14, 0.34), M.stone, 0, 0.3, 2.12);
  part(group, new THREE.BoxGeometry(1.3, 0.14, 0.34), M.stoneDark, 0, 0.1, 2.38);

  // 主楼下层：砂岩石墙 + 凸出的错缝石块
  const stoneBase = 0.48;
  const stoneHeight = 1.2;
  part(group, new THREE.CylinderGeometry(1.3, 1.42, stoneHeight, 8), M.stone, 0, stoneBase + stoneHeight / 2, 0, { ry: OCTAGON_TWIST });
  const brick = new THREE.BoxGeometry(0.3, 0.14, 0.08);
  const bricks = createRandom(777);
  for (let index = 0; index < 26; index += 1) {
    const angle = bricks() * Math.PI * 2;
    const y = stoneBase + 0.12 + bricks() * (stoneHeight - 0.24);
    const t = (y - stoneBase) / stoneHeight;
    const radius = (1.42 - 0.12 * t) * 0.93 + 0.02;
    // 正门前面不放，免得石块压在门框上
    if (Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < 0.42 && y < 1.5) continue;
    part(group, brick, bricks() > 0.45 ? M.stoneLight : M.stoneDark,
      Math.sin(angle) * radius, y, Math.cos(angle) * radius, { ry: angle });
  }

  // 主楼上层：木构白墙（外挑一圈），8 根立柱 + 腰梁
  const timberBase = stoneBase + stoneHeight;
  const timberHeight = 0.78;
  part(group, new THREE.CylinderGeometry(1.36, 1.36, 0.12, 8), M.beam, 0, timberBase + 0.04, 0, { ry: OCTAGON_TWIST });
  part(group, new THREE.CylinderGeometry(1.22, 1.27, timberHeight, 8), M.plaster, 0, timberBase + timberHeight / 2 + 0.08, 0, { ry: OCTAGON_TWIST });
  part(group, new THREE.CylinderGeometry(1.26, 1.26, 0.08, 8), M.beam, 0, timberBase + timberHeight + 0.06, 0, { ry: OCTAGON_TWIST });
  const post = new THREE.BoxGeometry(0.09, timberHeight, 0.09);
  for (let index = 0; index < 8; index += 1) {
    const corner = octagonCorner(index, 1.265);
    part(group, post, M.beam, corner.x, timberBase + timberHeight / 2 + 0.08, corner.z, { ry: corner.angle });
  }
  // 窗：暖色自发光，夜里整座要塞会亮起来
  const windowGlass = new THREE.BoxGeometry(0.26, 0.32, 0.05);
  const windowFrame = new THREE.BoxGeometry(0.36, 0.42, 0.04);
  const windowSill = new THREE.BoxGeometry(0.42, 0.05, 0.1);
  [0, 1, 2, 6, 7, 4].forEach((faceIndex) => {
    const face = octagonFace(faceIndex, 1.155);
    const frame = octagonFace(faceIndex, 1.14);
    const y = timberBase + 0.48;
    part(group, windowFrame, M.beam, frame.x, y, frame.z, { ry: face.angle });
    part(group, windowGlass, M.window, face.x, y, face.z, { ry: face.angle });
    const sill = octagonFace(faceIndex, 1.19);
    part(group, windowSill, M.beam, sill.x, y - 0.22, sill.z, { ry: face.angle });
  });

  // 屋顶：陶红八角锥顶 + 深色脊线 + 檐口
  const roofBase = timberBase + timberHeight + 0.1;
  const roofHeight = 1.28;
  const roofRadius = 1.64;
  part(group, new THREE.CylinderGeometry(roofRadius + 0.03, roofRadius + 0.03, 0.08, 8), M.roofDark, 0, roofBase, 0, { ry: OCTAGON_TWIST });
  part(group, new THREE.ConeGeometry(roofRadius, roofHeight, 8), M.roof, 0, roofBase + roofHeight / 2 + 0.04, 0, { ry: OCTAGON_TWIST });
  // 瓦垄：一圈略小的深色锥带，读出分层瓦片
  part(group, new THREE.CylinderGeometry(roofRadius * 0.64, roofRadius * 0.68, 0.06, 8), M.roofDark,
    0, roofBase + roofHeight * 0.36 + 0.04, 0, { ry: OCTAGON_TWIST });
  const apex = new THREE.Vector3(0, roofBase + roofHeight + 0.04, 0);
  for (let index = 0; index < 8; index += 1) {
    const corner = octagonCorner(index, roofRadius + 0.02);
    beam(group, new THREE.Vector3(corner.x, roofBase + 0.06, corner.z), apex, 0.07, M.roofDark);
  }

  // 尖塔与能量核心
  part(group, new THREE.CylinderGeometry(0.07, 0.12, 0.42, 6), M.metal, 0, apex.y + 0.12, 0);
  part(group, new THREE.CylinderGeometry(0.24, 0.15, 0.12, 6), M.gold, 0, apex.y + 0.3, 0);
  const crystalY = apex.y + 0.66;
  const focusCrystal = part(group, new THREE.OctahedronGeometry(0.27, 0), M.energy, 0, crystalY, 0, { sx: 0.8, sy: 1.5, sz: 0.8, ry: Math.PI / 4 });
  const focusRing = part(group, new THREE.TorusGeometry(0.4, 0.026, 6, 28), M.energy, 0, crystalY - 0.08, 0, { rx: Math.PI / 2 });
  const focusGlow = createSoftParticleSprite('#8fe9ff', {
    opacity: 0.5,
    depthTest: true,
    blending: THREE.AdditiveBlending
  });
  focusGlow.position.set(0, crystalY, 0);
  focusGlow.scale.setScalar(1.5);
  group.add(focusGlow);

  // 正门：门洞、木门、拱石、铁环
  const doorZ = 1.27;
  part(group, new THREE.BoxGeometry(0.72, 0.96, 0.12), M.woodDark, 0, stoneBase + 0.48, doorZ);
  part(group, new THREE.BoxGeometry(0.58, 0.86, 0.06), M.wood, 0, stoneBase + 0.43, doorZ + 0.06);
  const plank = new THREE.BoxGeometry(0.03, 0.84, 0.02);
  [-0.15, 0, 0.15].forEach((x) => part(group, plank, M.woodDark, x, stoneBase + 0.43, doorZ + 0.095));
  part(group, new THREE.BoxGeometry(0.6, 0.05, 0.03), M.metal, 0, stoneBase + 0.66, doorZ + 0.1);
  part(group, new THREE.BoxGeometry(0.6, 0.05, 0.03), M.metal, 0, stoneBase + 0.22, doorZ + 0.1);
  const archStone = new THREE.BoxGeometry(0.2, 0.16, 0.16);
  for (let index = 0; index <= 6; index += 1) {
    const angle = (index / 6) * Math.PI;
    part(group, archStone, index % 2 ? M.stoneLight : M.stone,
      Math.cos(angle) * 0.44, stoneBase + 0.92 + Math.sin(angle) * 0.2, doorZ + 0.06,
      { rz: angle - Math.PI / 2 });
  }
  [-0.44, 0.44].forEach((x) => part(group, new THREE.BoxGeometry(0.18, 0.92, 0.16), M.stoneLight, x, stoneBase + 0.46, doorZ + 0.05));
  part(group, new THREE.TorusGeometry(0.05, 0.012, 4, 10), M.gold, 0.14, stoneBase + 0.45, doorZ + 0.11);

  // 门两侧挂旗
  [-1, 1].forEach((side) => {
    const face = octagonFace(side < 0 ? 7 : 1, 1.27);
    const y = stoneBase + 0.72;
    part(group, new THREE.BoxGeometry(0.4, 0.035, 0.035), M.gold, face.x, y + 0.4, face.z, { ry: face.angle });
    part(group, new THREE.BoxGeometry(0.34, 0.74, 0.03), M.banner, face.x, y, face.z, { ry: face.angle });
    part(group, new THREE.BoxGeometry(0.34, 0.05, 0.035), M.bannerTrim, face.x, y - 0.34, face.z, { ry: face.angle });
    const emblem = octagonFace(side < 0 ? 7 : 1, 1.29);
    part(group, new THREE.OctahedronGeometry(0.08, 0), M.bannerTrim, emblem.x, y + 0.08, emblem.z, { ry: face.angle, sy: 1.3 });
  });

  // 两座侧塔：嵌在主楼两侧，尖顶上插三角旗
  const pennantGeometry = createPennantGeometry();
  const pennants = [];
  [-1, 1].forEach((side) => {
    const x = side * 1.52;
    const z = -0.28;
    const towerHeight = 2.36;
    part(group, new THREE.CylinderGeometry(0.4, 0.47, towerHeight, 6), M.stone, x, stoneBase + towerHeight / 2, z, { ry: 0.3 });
    part(group, new THREE.CylinderGeometry(0.5, 0.5, 0.1, 6), M.stoneLight, x, stoneBase + towerHeight + 0.02, z, { ry: 0.3 });
    part(group, new THREE.BoxGeometry(0.06, 0.26, 0.05), M.woodDark, x + side * 0.02, stoneBase + 1.3, z + 0.44);
    part(group, new THREE.BoxGeometry(0.06, 0.2, 0.05), M.woodDark, x + side * 0.43, stoneBase + 0.8, z + 0.12, { ry: side * Math.PI / 2 });
    part(group, new THREE.ConeGeometry(0.56, 0.9, 6), M.roof, x, stoneBase + towerHeight + 0.5, z, { ry: 0.3 });
    const topY = stoneBase + towerHeight + 0.95;
    part(group, new THREE.CylinderGeometry(0.018, 0.022, 0.55, 5), M.woodDark, x, topY + 0.24, z);
    const pennant = new THREE.Mesh(pennantGeometry, M.banner);
    pennant.position.set(x, topY + 0.4, z);
    pennant.rotation.y = side < 0 ? Math.PI : 0;
    pennant.userData.baseRotation = pennant.rotation.y;
    pennant.userData.phase = side * 1.3;
    group.add(pennant);
    pennants.push(pennant);
  });

  // 周边生活感道具：木箱、木桶、柴堆、灯柱、花槽
  const crate = new THREE.BoxGeometry(0.42, 0.4, 0.42);
  const crateBand = new THREE.BoxGeometry(0.44, 0.05, 0.44);
  [[-2.05, 0.2, 1.35, 0.2], [-1.6, 0.2, 1.86, -0.3], [-2.03, 0.6, 1.37, 0.55]].forEach(([x, y, z, ry]) => {
    part(group, crate, M.wood, x, y, z, { ry });
    part(group, crateBand, M.woodDark, x, y + 0.12, z, { ry });
  });
  const barrel = new THREE.CylinderGeometry(0.2, 0.2, 0.46, 8);
  const hoop = new THREE.CylinderGeometry(0.215, 0.215, 0.04, 8);
  [[2.15, 1.2], [2.42, 0.72], [1.85, 1.62]].forEach(([x, z], index) => {
    const scale = index === 2 ? 0.85 : 1;
    part(group, barrel, M.wood, x, 0.23 * scale, z, { sx: scale, sy: scale, sz: scale });
    part(group, hoop, M.metal, x, 0.1 * scale, z, { sx: scale, sy: scale, sz: scale });
    part(group, hoop, M.metal, x, 0.36 * scale, z, { sx: scale, sy: scale, sz: scale });
  });
  const log = new THREE.CylinderGeometry(0.09, 0.09, 0.86, 6);
  const logYaw = 0.55;
  [[0, 0.09], [0.19, 0.09], [-0.19, 0.09], [0.095, 0.25], [-0.095, 0.25], [0, 0.41]].forEach(([offset, y]) => {
    part(group, log, M.wood, -2.2 + offset * Math.sin(logYaw), y, -1.25 + offset * Math.cos(logYaw), { rz: Math.PI / 2, ry: logYaw });
  });
  // 灯柱
  const lampX = 1.02;
  const lampZ = 2.3;
  part(group, new THREE.CylinderGeometry(0.035, 0.05, 1.4, 5), M.woodDark, lampX, 0.7, lampZ);
  part(group, new THREE.BoxGeometry(0.28, 0.035, 0.035), M.woodDark, lampX - 0.12, 1.36, lampZ);
  part(group, new THREE.BoxGeometry(0.13, 0.17, 0.13), M.window, lampX - 0.24, 1.22, lampZ);
  part(group, new THREE.ConeGeometry(0.11, 0.1, 4), M.metal, lampX - 0.24, 1.35, lampZ, { ry: Math.PI / 4 });
  const lampGlow = createSoftParticleSprite('#ffc27a', {
    opacity: 0.38,
    depthTest: true,
    blending: THREE.AdditiveBlending
  });
  lampGlow.position.set(lampX - 0.24, 1.22, lampZ);
  lampGlow.scale.setScalar(0.7);
  group.add(lampGlow);
  // 基座两侧花槽
  [-1, 1].forEach((side) => {
    const x = side * 0.9;
    const z = 1.58;
    part(group, new THREE.BoxGeometry(0.5, 0.16, 0.24), M.wood, x, 0.56, z);
    part(group, new THREE.IcosahedronGeometry(0.17, 0), M.foliage, x - 0.1, 0.7, z, { sy: 0.7 });
    part(group, new THREE.IcosahedronGeometry(0.14, 0), M.foliage, x + 0.12, 0.69, z + 0.02, { sy: 0.7 });
    part(group, new THREE.OctahedronGeometry(0.05, 0), M.bannerTrim, x + 0.02, 0.8, z + 0.06);
    part(group, new THREE.OctahedronGeometry(0.045, 0), flatMaterial('#e8566a'), x - 0.16, 0.78, z + 0.08);
  });

  const attackEmitter = new THREE.Object3D();
  attackEmitter.position.set(0, crystalY, 0);
  attackEmitter.name = 'PlayerBaseAttackEmitter';
  group.add(attackEmitter);

  group.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  group.userData.attackEmitter = attackEmitter;
  group.userData.energyMeshes = [focusCrystal, focusGlow, focusRing];
  group.userData.statusHeight = crystalY + 0.95;
  group.userData.updateWorldDecoration = (elapsed) => {
    focusCrystal.rotation.y = Math.PI / 4 + elapsed * 0.7;
    focusCrystal.position.y = crystalY + Math.sin(elapsed * 1.7) * 0.05;
    focusRing.rotation.z = elapsed * 0.9;
    focusGlow.material.opacity = 0.42 + Math.sin(elapsed * 2.1) * 0.1;
    pennants.forEach((pennant) => {
      pennant.rotation.y = pennant.userData.baseRotation + Math.sin(elapsed * 2.4 + pennant.userData.phase) * 0.28;
    });
  };
  return group;
}
