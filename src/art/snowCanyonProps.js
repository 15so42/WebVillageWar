import * as THREE from 'three';
import { createSoftParticleMaterial } from './vfxMaterials.js';

const UP = new THREE.Vector3(0, 1, 0);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const STONE = new THREE.DodecahedronGeometry(1, 0);
const LOG = new THREE.CylinderGeometry(0.105, 0.135, 1, 6, 1);
const GROUND_DISC = new THREE.CircleGeometry(1, 20);
// 地面辉光改用顶点 alpha 圆盘：边缘 alpha 精确归零，不依赖纹理采样，
// 任何管线下都不会露出方形面片边界（亮雪面上加法混合裁剪曾暴露方边）。
const WOOD = new THREE.MeshStandardMaterial({ color: '#795033', roughness: 0.96, flatShading: true });
const WOOD_LIGHT = new THREE.MeshStandardMaterial({ color: '#9b7048', roughness: 0.94, flatShading: true });
const IRON = new THREE.MeshStandardMaterial({ color: '#454849', roughness: 0.82, metalness: 0.15 });
const SNOW = new THREE.MeshStandardMaterial({ color: '#e8ebed', roughness: 0.97, flatShading: true });
SNOW.userData.worldMaterialKind = 'snow';
const STONE_MATERIALS = ['#777e84', '#929397', '#656f78'].map((color) => (
  new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true })
));
const CHARRED_WOOD = new THREE.MeshStandardMaterial({ color: '#3d3029', roughness: 1, flatShading: true });
const ASH = new THREE.MeshStandardMaterial({ color: '#514840', roughness: 1 });
let groundGlowMaterial = null;

function createGroundGlowDisc() {
  const geometry = new THREE.CircleGeometry(1, 28);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 4);
  for (let i = 0; i < position.count; i += 1) {
    const distance = Math.min(1, Math.hypot(position.getX(i), position.getY(i)));
    const radial = 1 - distance;
    colors[i * 4] = 1;
    colors[i * 4 + 1] = 1;
    colors[i * 4 + 2] = 1;
    colors[i * 4 + 3] = radial * radial * (3 - 2 * radial);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  return geometry;
}
const GLOW_DISC = createGroundGlowDisc();

function solid(group, geometry, material, x, y, z, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function beam(group, a, b, thickness, material = WOOD) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start);
  const center = start.add(end).multiplyScalar(0.5);
  const mesh = solid(group, BOX, material, center.x, center.y, center.z, thickness, direction.length(), thickness);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  return mesh;
}

function hippedRoof(eaveY, peakY, halfWidth, thickness = 0) {
  const corners = [
    [-halfWidth, eaveY, -halfWidth],
    [-halfWidth, eaveY, halfWidth],
    [halfWidth, eaveY, halfWidth],
    [halfWidth, eaveY, -halfWidth]
  ];
  const positions = [];
  for (let side = 0; side < 4; side += 1) {
    const a = corners[side];
    const b = corners[(side + 1) % 4];
    positions.push(0, peakY, 0, ...a, ...b);
    if (thickness > 0) {
      const lowA = [a[0], eaveY - thickness, a[2]];
      const lowB = [b[0], eaveY - thickness, b[2]];
      positions.push(...a, ...lowA, ...b, ...b, ...lowA, ...lowB);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const ROOF_HALF_WIDTH = 1.8 / Math.SQRT2;
const WOOD_ROOF = hippedRoof(3.59, 4.22, ROOF_HALF_WIDTH, 0.1);
const SNOW_ROOF = hippedRoof(3.76, 4.4, ROOF_HALF_WIDTH, 0.12);

/** Static timber lookout. Ground footprint radius 1.5; roof radius 1.8; height 4.4. */
export function createSnowCanyonWatchtower() {
  const group = new THREE.Group();
  group.name = 'SnowCanyonWatchtower';
  group.userData.visualFootprintRadius = 1.8;

  for (const x of [-0.9, 0.9]) {
    for (const z of [-0.9, 0.9]) {
      solid(group, BOX, WOOD, x, 1.815, z, 0.22, 3.63, 0.22);
      solid(group, BOX, IRON, x, 2.32, z, 0.245, 0.105, 0.245);
    }
  }
  // Side and rear cross braces carry the elevated platform; the ladder side stays open.
  for (const x of [-0.9, 0.9]) {
    beam(group, [x, 0.35, -0.9], [x, 2.35, 0.9], 0.12, WOOD_LIGHT);
    beam(group, [x, 0.35, 0.9], [x, 2.35, -0.9], 0.12, WOOD_LIGHT);
  }
  beam(group, [-0.9, 0.35, -0.9], [0.9, 2.35, -0.9], 0.12, WOOD_LIGHT);
  beam(group, [0.9, 0.35, -0.9], [-0.9, 2.35, -0.9], 0.12, WOOD_LIGHT);

  solid(group, BOX, WOOD, 0, 2.37, -0.9, 2.08, 0.2, 0.18);
  solid(group, BOX, WOOD, 0, 2.37, 0.9, 2.08, 0.2, 0.18);
  for (let plank = 0; plank < 8; plank += 1) {
    solid(group, BOX, plank % 3 === 0 ? WOOD : WOOD_LIGHT,
      -0.91 + plank * 0.26, 2.51, 0, 0.245, 0.14, 2.05);
  }

  for (const y of [2.8, 3.13]) {
    solid(group, BOX, WOOD_LIGHT, -0.94, y, 0, 0.12, 0.115, 1.96);
    solid(group, BOX, WOOD_LIGHT, 0.94, y, 0, 0.12, 0.115, 1.96);
    solid(group, BOX, WOOD_LIGHT, 0, y, -0.94, 1.96, 0.115, 0.12);
    // Front railing leaves a central opening directly above the ladder.
    solid(group, BOX, WOOD_LIGHT, -0.65, y, 0.94, 0.6, 0.115, 0.12);
    solid(group, BOX, WOOD_LIGHT, 0.65, y, 0.94, 0.6, 0.115, 0.12);
  }
  for (const x of [-0.34, 0.34]) {
    solid(group, BOX, WOOD, x, 2.86, 0.94, 0.105, 0.68, 0.105);
    beam(group, [x, 0.09, 1.3], [x, 2.59, 0.95], 0.09, WOOD_LIGHT);
  }
  for (let rung = 0; rung < 9; rung += 1) {
    const fraction = (rung + 0.5) / 9;
    solid(group, BOX, WOOD_LIGHT, 0, 0.09 + fraction * 2.5, 1.3 - fraction * 0.35, 0.74, 0.07, 0.09);
  }

  for (const z of [-0.91, 0.91]) {
    solid(group, BOX, WOOD_LIGHT, 0, 3.53, z, 2.14, 0.16, 0.16);
  }
  solid(group, WOOD_ROOF, WOOD, 0, 0, 0);
  solid(group, SNOW_ROOF, SNOW, 0, 0, 0);
  return group;
}

function sharedGroundGlow() {
  if (groundGlowMaterial) return groundGlowMaterial;
  groundGlowMaterial = new THREE.MeshBasicMaterial({
    color: '#ffa53a',
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    vertexColors: true,
    toneMapped: false
  });
  return groundGlowMaterial;
}

/** Decorative stone-ring fire with eight persistent, recycled soft particles. */
export function createSnowCanyonCampfire() {
  const group = new THREE.Group();
  group.name = 'SnowCanyonCampfire';
  group.userData.visualFootprintRadius = 1.1;
  group.userData.skipStaticBatch = true;

  const ash = solid(group, GROUND_DISC, ASH, 0, 0.018, 0, 0.79, 0.79, 0.79);
  ash.rotation.x = -Math.PI / 2;
  ash.castShadow = false;
  for (let index = 0; index < 10; index += 1) {
    const angle = index * Math.PI * 2 / 10;
    const radius = 0.82 + Math.sin(index * 2.3) * 0.025;
    const stone = solid(group, STONE, STONE_MATERIALS[index % 3],
      Math.cos(angle) * radius, 0.16, Math.sin(angle) * radius,
      0.235 + (index % 3) * 0.022, 0.19 + (index % 2) * 0.035, 0.23);
    stone.rotation.set(index * 0.17, angle, index * 0.31);
  }
  for (let index = 0; index < 4; index += 1) {
    const log = solid(group, LOG, CHARRED_WOOD, (index % 2 ? 1 : -1) * 0.19,
      0.16 + (index % 2) * 0.11, 0, 1, 1.22, 1);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = index * 0.9 + 0.3;
  }
  const groundGlow = new THREE.Mesh(GLOW_DISC, sharedGroundGlow());
  groundGlow.name = 'CampfireGroundGlow';
  groundGlow.rotation.x = -Math.PI / 2;
  groundGlow.position.y = 0.032;
  groundGlow.scale.set(2.5, 2.5, 1);
  group.add(groundGlow);

  const particles = [];
  for (let index = 0; index < 8; index += 1) {
    const spark = index >= 5;
    const material = createSoftParticleMaterial('#ffbf51', {
      depthTest: true,
      opacity: 0,
      // Orange tongues need coverage against bright snow; additive-only flames
      // wash out to white. Only the short-lived sparks use additive blending.
      blending: spark ? THREE.AdditiveBlending : THREE.NormalBlending,
      // tight 衰减在面片外圈 34% 处 alpha 已精确归零，亮雪面上不会露出方形裙边。
      falloff: 'tight',
      toneMapped: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.name = spark ? 'CampfireSpark' : 'CampfireFlame';
    sprite.userData.isSoftParticle = true;
    group.add(sprite);
    const life = spark ? 1.6 + (index - 5) * 0.23 : 0.76 + index * 0.087;
    particles.push({ sprite, material, spark, life, age: life * ((index * 0.193) % 1), index });
  }

  let elapsed = 0;
  function update(dt = 0) {
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    elapsed += step;
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      particle.age = (particle.age + step) % particle.life;
      const progress = particle.age / particle.life;
      const rise = 1 - (1 - progress) * (1 - progress);
      const fade = Math.min(1, progress / 0.14) * Math.pow(1 - progress, 1.2);
      const phase = index * 2.17;
      const drift = Math.sin(elapsed * (particle.spark ? 1.8 : 3.2) + phase);
      const sprite = particle.sprite;
      if (particle.spark) {
        sprite.position.set(Math.cos(phase) * (0.1 + progress * 0.22) + drift * 0.05,
          0.54 + rise * (1.14 + (index - 5) * 0.15), Math.sin(phase) * (0.12 + progress * 0.25));
        const size = (0.135 + (index - 5) * 0.018) * (1 - progress * 0.55);
        sprite.scale.set(size, size * 1.7, 1);
        particle.material.color.setRGB(2.3, 1.1 - progress * 0.75, 0.12);
        particle.material.opacity = fade * 0.85;
      } else {
        sprite.position.set(Math.cos(phase) * 0.13 + drift * (0.035 + progress * 0.065),
          0.38 + rise * (1.05 + index * 0.085), Math.sin(phase) * 0.13 + progress * 0.035);
        // 后半生快速收窄收淡：避免低不透明度薄纱在亮雪面上显出面片轮廓。
        const width = (0.73 + (index % 3) * 0.11) * (1 - progress * 0.72);
        sprite.scale.set(width, (1.75 + index * 0.13) * (1 - progress * 0.58), 1);
        particle.material.color.setRGB(1.9 - progress * 0.6,
          (index === 0 ? 0.95 : 0.43) * (1 - progress * 0.6), 0.045 * (1 - progress));
        particle.material.opacity = fade * (1 - progress * 0.45) * (0.84 + (index % 2) * 0.12);
      }
      particle.material.rotation = drift * 0.1;
    }
    const pulse = 1 + Math.sin(elapsed * 5.1) * 0.035 + Math.sin(elapsed * 8.7) * 0.02;
    groundGlow.scale.set(2.5 * pulse, 2.5 * pulse, 1);
  }
  update(0);
  return { group, update };
}
