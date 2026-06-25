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

const RAW_PATH_POINTS = BALANCE.world.pathPoints.map(
  (point) => new THREE.Vector3(point.x, 0, point.z)
);

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

export function createWorld(scene) {
  scene.background = new THREE.Color('#91cbef');
  scene.fog = new THREE.Fog('#b6d8e9', 82, 230);

  const sun = new THREE.DirectionalLight('#fff1c3', 3.55);
  sun.position.set(-44, 82, 46);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -86;
  sun.shadow.camera.right = 86;
  sun.shadow.camera.top = 86;
  sun.shadow.camera.bottom = -86;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight('#cdefff', '#45653d', 1.85));

  const ground = createGroundMesh();
  scene.add(ground);

  const pathPoints = pathVectors();
  createSky(scene);
  createMountainRidge(scene);
  createSnowMountain(scene);
  createPath(scene, pathPoints);
  createPuddles(scene);
  const snowfall = createSnowfall(scene);

  const base = createBaseModel();
  placeOnTerrain(base, BALANCE.playerBase.position.x, BALANCE.playerBase.position.z);
  base.userData.aura.scale.setScalar(BALANCE.playerBase.recoveryRadius / 5.75);
  scene.add(base);

  const enemyCamp = createEnemyCampModel();
  placeOnTerrain(enemyCamp, BALANCE.enemyCamp.position.x, BALANCE.enemyCamp.position.z);
  enemyCamp.scale.setScalar(1.35);
  scene.add(enemyCamp);

  decorate(scene, pathPoints);
  createSnowMonsterCamp(scene);

  return {
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

export function terrainHeightAt(x, z) {
  const pathDistance = distanceToPath(x, z, RAW_PATH_POINTS);
  const northMask = northMaskAt(z);
  const sideRise = smoothstep(12, 39, Math.abs(x));
  const valleyMask = 1 - smoothstep(6, 22, pathDistance);
  let height = 0.25 + northMask * 2.15 + sideRise * (1.25 + northMask * 2.2);

  height += hillHeight(x, z, -30, 20, 18, 24, 2.4);
  height += hillHeight(x, z, 30, 12, 16, 22, 2.2);
  height += hillHeight(x, z, -31, -10, 18, 24, 3.1);
  height += hillHeight(x, z, 29, -19, 18, 23, 3.3);
  height += ridgeHeight(x, z, 0, -39, 35, 9, 4.6);
  height += ridgeHeight(x, z, -40, -10, 8, 46, 2.4);
  height += ridgeHeight(x, z, 40, -5, 8, 45, 2.2);

  const roughness = (
    Math.sin(x * 0.18 + z * 0.09) * 0.24 +
    Math.cos(x * 0.11 - z * 0.15) * 0.2 +
    Math.sin((x + z) * 0.07) * 0.18
  );
  height += roughness * mix(0.42, 1, smoothstep(5, 18, pathDistance));

  const valleyFloor = 0.32 + northMask * 1.25 + smoothstep(0, 32, Math.abs(x)) * 0.45;
  height = mix(height, Math.min(height, valleyFloor), valleyMask * 0.68);

  const playerDistance = Math.hypot(x - BALANCE.playerBase.position.x, z - BALANCE.playerBase.position.z);
  height = mix(height, 0.22, 1 - smoothstep(5, 12, playerDistance));

  const campDistance = Math.hypot(x - BALANCE.enemyCamp.position.x, z - BALANCE.enemyCamp.position.z);
  const campShelf = 1 - smoothstep(4.5, 14, campDistance);
  const campTerrace = 2.55 + smoothstep(0, 14, campDistance) * 0.55;
  height = mix(height, campTerrace, campShelf * 0.78);

  return Math.max(0, height);
}

function createGroundMesh() {
  const geometry = new THREE.PlaneGeometry(
    BALANCE.world.ground.width,
    BALANCE.world.ground.depth,
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
  const color = new THREE.Color('#e9eddc');
  const northMask = northMaskAt(z);
  const sideRise = smoothstep(10, 39, Math.abs(x));
  const snowMask = snowMaskAt(x, z, height);
  const pathDistance = distanceToPath(x, z, RAW_PATH_POINTS);
  const valleyMask = 1 - smoothstep(7, 22, pathDistance);
  const forestFloor = forestFloorMask(x, z);
  const facet = hash2(x * 0.14, z * 0.14) - 0.5;

  color.lerp(new THREE.Color('#d4d8c8'), sideRise * 0.28);
  color.lerp(new THREE.Color('#dce4e4'), northMask * 0.22);
  color.lerp(new THREE.Color('#e4e3cf'), valleyMask * 0.12);
  color.lerp(new THREE.Color('#b7c8b8'), forestFloor * 0.18);
  color.lerp(new THREE.Color('#c6c7bf'), smoothstep(4.8, 8.8, height) * 0.24);
  color.lerp(new THREE.Color('#f1f4e8'), 0.48 + snowMask * 0.38);
  color.offsetHSL(0, 0.006 * facet, 0.018 * facet);
  return color;
}

function pathVectors() {
  return BALANCE.world.pathPoints.map((point) => {
    const y = terrainHeightAt(point.x, point.z) + SURFACE_OFFSET;
    return new THREE.Vector3(point.x, y, point.z);
  });
}

function createPath(scene, points) {
  const material = overlayMat('#d9d8c8', { roughness: 0.94 });
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
  const halfWidth = BALANCE.world.pathWidth / 2;

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
  const material = overlayMat('#9bc7d1', {
    roughness: 0.28,
    metalness: 0.05,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  BALANCE.world.puddles.forEach((puddle, index) => {
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
  const clouds = [
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
  const random = seededRandom(309);
  const snowTexture = createSnowflakeTexture();
  const layers = [
    createSnowLayer({
      count: 330,
      radiusX: 58,
      radiusZ: 46,
      minY: 3.8,
      maxY: 31,
      size: 0.23,
      opacity: 0.86,
      fallSpeed: 6.6,
      windX: -4.9,
      windZ: 2.15,
      random
    }),
    createSnowLayer({
      count: 230,
      radiusX: 76,
      radiusZ: 58,
      minY: 5.5,
      maxY: 39,
      size: 0.13,
      opacity: 0.58,
      fallSpeed: 3.8,
      windX: -6.4,
      windZ: 2.7,
      random
    })
  ];
  const gusts = createSnowGustLayer(random);

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

function createSnowGustLayer(random) {
  const count = 68;
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
    windX: -9.8,
    windZ: 4.2,
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
  const peaks = [
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
  [
    { x: -15, z: -40, width: 5.8, height: 10 },
    { x: 16, z: -40, width: 6.4, height: 12 },
    { x: 4, z: -42, width: 7.4, height: 14 }
  ].forEach((peakData) => {
    const peak = createMountainPeak(peakData.width, peakData.height);
    placeOnTerrain(peak, peakData.x, peakData.z, -0.1);
    scene.add(peak);
  });
}

function decorate(scene, pathPoints) {
  const random = seededRandom(42);
  placeCottages(scene);
  placeForests(scene, pathPoints, random);
  placeRocks(scene, pathPoints, random);
  placeBoulderClusters(scene, pathPoints, random);
  placeLandmarkBoulders(scene, pathPoints);
  placeBushes(scene, pathPoints, random);
  placeGrass(scene, pathPoints, random);
}

function placeForests(scene, pathPoints, random) {
  FOREST_ZONES.forEach((zone, zoneIndex) => {
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
  const halfWidth = BALANCE.world.ground.width / 2 - 5;
  const halfDepth = BALANCE.world.ground.depth / 2 - 5;
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
  BOULDER_CLUSTERS.forEach((cluster) => {
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
  LANDMARK_BOULDERS.forEach((item) => {
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
    ...BALANCE.world.puddles.map((puddle) => ({
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
    ...BALANCE.world.puddles.map((puddle) => ({
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
  const cottages = [
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
  placeOnTerrain(camp, 4, -34, 0.28);
  camp.rotation.y = -0.34;
  camp.scale.setScalar(1.18);
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
  if (distanceToPath(x, z, pathPoints) < clearance) return false;
  if (CLEARINGS.some((clearing) => Math.hypot(x - clearing.x, z - clearing.z) < clearing.r)) {
    return false;
  }
  if (Math.hypot(x - BALANCE.playerBase.position.x, z - BALANCE.playerBase.position.z) < 9) {
    return false;
  }
  if (Math.hypot(x - BALANCE.enemyCamp.position.x, z - BALANCE.enemyCamp.position.z) < 6) {
    return false;
  }
  return true;
}

function isForestPassage(x, z, pathPoints) {
  if (distanceToPath(x, z, pathPoints) < 5.8) return true;
  return FOREST_PASSAGES.some((passage) => distanceToPath(x, z, passage) < 3.3);
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
  const latitude = 1 - smoothstep(-36, -17, z);
  const altitude = smoothstep(2.5, 7.5, height);
  const snowBasin = 1 - smoothstep(12, 28, Math.hypot(x - SNOW_CENTER.x, (z - SNOW_CENTER.z) * 1.15));
  return clamp(latitude * (0.28 + altitude * 0.42) + snowBasin * 0.16 + altitude * northMaskAt(z) * 0.12, 0, 1);
}

function forestFloorMask(x, z) {
  return FOREST_ZONES.reduce((best, zone) => {
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
