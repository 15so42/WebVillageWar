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
  createTree,
  mat
} from '../art/lowpoly.js';
import { clamp, seededRandom } from '../utils/math.js';

const RAW_PATH_POINTS = BALANCE.world.pathPoints.map(
  (point) => new THREE.Vector3(point.x, 0, point.z)
);

const FOREST_ZONES = [
  { x: -25, z: 22, rx: 14, rz: 11, count: 68, tone: 'deep' },
  { x: 25, z: 12, rx: 13, rz: 10, count: 62, tone: 'warm' },
  { x: -25, z: -14, rx: 15, rz: 11, count: 72, tone: 'deep' },
  { x: 25, z: -22, rx: 13, rz: 10, count: 58, tone: 'cool' },
  { x: 3, z: -34, rx: 17, rz: 10, count: 48, tone: 'snow' }
];

const FOREST_PASSAGES = [
  [new THREE.Vector3(-38, 0, 24), new THREE.Vector3(-16, 0, 23), new THREE.Vector3(-5, 0, 17)],
  [new THREE.Vector3(37, 0, 16), new THREE.Vector3(20, 0, 12), new THREE.Vector3(10, 0, 10)],
  [new THREE.Vector3(-38, 0, -10), new THREE.Vector3(-21, 0, -14), new THREE.Vector3(-12, 0, -17)],
  [new THREE.Vector3(38, 0, -22), new THREE.Vector3(17, 0, -20), new THREE.Vector3(-3, 0, -8)]
];

const SNOW_CENTER = { x: 2, z: -33 };
const SURFACE_OFFSET = 0.42;

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
    recoveryAura: base.userData.aura
  };
}

export function terrainHeightAt(x, z) {
  let height = 0;
  height += hillHeight(x, z, -25, 22, 22, 17, 5.3);
  height += hillHeight(x, z, 27, 13, 20, 15, 4.8);
  height += hillHeight(x, z, -25, -14, 24, 17, 5.7);
  height += hillHeight(x, z, 24, -22, 21, 15, 5.2);
  height += hillHeight(x, z, SNOW_CENTER.x, SNOW_CENTER.z, 34, 28, 6.8);
  height += Math.sin(x * 0.15 + z * 0.07) * 0.28 + Math.cos(z * 0.17) * 0.22;

  const pathDistance = distanceToPath(x, z, RAW_PATH_POINTS);
  if (z > -34) {
    height *= mix(0.46, 1, smoothstep(3.8, 11, pathDistance));
  }

  const playerDistance = Math.hypot(x - BALANCE.playerBase.position.x, z - BALANCE.playerBase.position.z);
  height *= smoothstep(5, 10, playerDistance);

  const campDistance = Math.hypot(x - BALANCE.enemyCamp.position.x, z - BALANCE.enemyCamp.position.z);
  const campShelf = 1 - smoothstep(6, 25, campDistance);
  const campTerrace = 4.8 + smoothstep(0, 25, campDistance) * 1.4;
  height = mix(height, campTerrace, campShelf * 0.58);

  return Math.max(0, height);
}

function createGroundMesh() {
  const geometry = new THREE.PlaneGeometry(
    BALANCE.world.ground.width,
    BALANCE.world.ground.depth,
    56,
    52
  );
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = -position.getY(i);
    position.setZ(i, terrainHeightAt(x, z));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();

  const ground = new THREE.Mesh(geometry, mat('#eadfcf', { roughness: 0.92 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}

function pathVectors() {
  return BALANCE.world.pathPoints.map((point) => {
    const y = terrainHeightAt(point.x, point.z) + SURFACE_OFFSET;
    return new THREE.Vector3(point.x, y, point.z);
  });
}

function createPath(scene, points) {
  const material = overlayMat('#c6aa73', { roughness: 0.88 });
  const edgeMaterial = mat('#a68455');
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
    const marker = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.32, 0),
      edgeMaterial
    );
    const side = i % 2 === 0 ? 1 : -1;
    const x = points[i].x + side * 2.4;
    const z = points[i].z;
    marker.position.set(x, terrainHeightAt(x, z) + 0.58, z);
    marker.scale.set(1.2, 0.35, 0.75);
    marker.castShadow = true;
    marker.receiveShadow = true;
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
    positions.push(left.x, terrainHeightAt(left.x, left.z) + 0.12, left.z);
    positions.push(right.x, terrainHeightAt(right.x, right.z) + 0.12, right.z);

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
  const material = overlayMat('#6fa8bc', {
    roughness: 0.28,
    metalness: 0.05,
    transparent: true,
    opacity: 0.78,
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
        ? 0.72 + random() * 0.7
        : 0.72 + random() * 1.42;
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
  for (let i = 0; i < 72; i += 1) {
    const snowBias = random() > 0.58;
    const x = snowBias ? -11 + random() * 28 : -halfWidth + random() * halfWidth * 2;
    const z = snowBias ? -40 + random() * 14 : -halfDepth + random() * halfDepth * 2;
    if (!isDecorationClear(x, z, pathPoints, 3.4)) continue;
    const rock = createRock(0.45 + random() * (snowBias ? 1.3 : 0.95));
    placeOnTerrain(rock, x, z);
    rock.rotation.y = random() * Math.PI * 2;
    if (snowBias) {
      rock.scale.y *= 1.2;
    }
    scene.add(rock);
  }
}

function placeBushes(scene, pathPoints, random) {
  const halfWidth = BALANCE.world.ground.width / 2 - 5;
  const halfDepth = BALANCE.world.ground.depth / 2 - 5;
  for (let i = 0; i < 80; i += 1) {
    const x = -halfWidth + random() * halfWidth * 2;
    const z = -halfDepth + random() * halfDepth * 2;
    if (!isDecorationClear(x, z, pathPoints, 2.7)) continue;
    if (isSnowRegion(x, z) && random() > 0.25) continue;
    const bush = createBush(0.62 + random() * 0.82);
    placeOnTerrain(bush, x, z);
    bush.rotation.y = random() * Math.PI * 2;
    scene.add(bush);
  }
}

function placeGrass(scene, pathPoints, random) {
  const grassColors = ['#d5c59a', '#bfc284', '#e0d1a6', '#c8b985'];
  const halfWidth = BALANCE.world.ground.width / 2 - 5;
  const halfDepth = BALANCE.world.ground.depth / 2 - 5;
  for (let i = 0; i < 150; i += 1) {
    const x = -halfWidth + random() * halfWidth * 2;
    const z = -halfDepth + random() * halfDepth * 2;
    if (isSnowRegion(x, z)) continue;
    const pathDistance = distanceToPath(x, z, pathPoints);
    if (pathDistance < 3.2 || pathDistance > 21) continue;
    const grass = createGrassTuft(
      0.55 + random() * 1.05,
      grassColors[Math.floor(random() * grassColors.length)]
    );
    placeOnTerrain(grass, x, z, 0.22);
    grass.rotation.y = random() * Math.PI * 2;
    scene.add(grass);
  }
}

function placeCottages(scene) {
  const cottages = [
    { x: -5, z: 28, rot: 0.6, scale: 0.96, roof: '#b64a3d' },
    { x: 5, z: 26, rot: -0.5, scale: 0.86, roof: '#a84f39' },
    { x: -10, z: 31, rot: 1.9, scale: 0.78, roof: '#91513a' },
    { x: 17, z: 14, rot: -1.1, scale: 0.78, roof: '#7d4d34' },
    { x: 22, z: 7, rot: -0.2, scale: 0.72, roof: '#92533b' },
    { x: -20, z: -16, rot: 1.2, scale: 0.78, wall: '#a77750', roof: '#744230' },
    { x: -8, z: -29, rot: -2.6, scale: 0.7, wall: '#9f6b45', roof: '#6f3d31' },
    { x: 7, z: -27, rot: 2.3, scale: 0.76, wall: '#9f6b45', roof: '#6f3d31' }
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

function treeColor(tone, zoneIndex, random) {
  if (tone === 'cool') {
    return random() > 0.5 ? '#2b725f' : '#3c875a';
  }
  if (tone === 'warm') {
    return random() > 0.5 ? '#3d8c54' : '#4f914c';
  }
  return random() > 0.42 || zoneIndex % 2 === 0 ? '#2f7d55' : '#245f46';
}

function isDecorationClear(x, z, pathPoints, clearance) {
  if (distanceToPath(x, z, pathPoints) < clearance) return false;
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
  return Math.hypot(x - SNOW_CENTER.x, (z - SNOW_CENTER.z) * 1.2) < 19;
}

function hillHeight(x, z, cx, cz, rx, rz, height) {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  const distance = Math.sqrt(dx * dx + dz * dz);
  const falloff = 1 - smoothstep(0, 1, distance);
  return Math.max(0, falloff) * height;
}

function overlayMat(color, options = {}) {
  return mat(color, {
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
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
