import * as THREE from 'three';

const MATERIALS = new Map();
const ACROSS_SEGMENTS = 6;
const MAX_LENGTH_SEGMENTS = 350;
const SURFACE_OFFSET = 0.022;
const TEXTURE_WORLD_SIZE = 4;
let sharedSoilTexture;

function hash(x, z) {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function smoothNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), sx),
    THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), sx),
    sz
  );
}

function makePath(points) {
  const path = [];
  for (const point of points ?? []) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) continue;
    const previous = path[path.length - 1];
    if (previous && Math.hypot(point.x - previous.x, point.z - previous.z) < 0.001) continue;
    path.push({ x: point.x, z: point.z, distance: 0 });
  }
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    path[index].distance = previous.distance + Math.hypot(path[index].x - previous.x, path[index].z - previous.z);
  }
  return path;
}

function samplePath(path, distance) {
  const target = THREE.MathUtils.clamp(distance, 0, path[path.length - 1].distance);
  let lower = 0;
  let upper = path.length - 1;
  while (upper - lower > 1) {
    const middle = (lower + upper) >> 1;
    if (path[middle].distance <= target) lower = middle;
    else upper = middle;
  }
  const start = path[lower];
  const end = path[upper];
  const weight = (target - start.distance) / Math.max(0.001, end.distance - start.distance);
  return {
    x: THREE.MathUtils.lerp(start.x, end.x, weight),
    z: THREE.MathUtils.lerp(start.z, end.z, weight)
  };
}

function frameAt(path, distance) {
  const point = samplePath(path, distance);
  const before = samplePath(path, distance - 0.48);
  const after = samplePath(path, distance + 0.48);
  const length = Math.max(0.001, Math.hypot(after.x - before.x, after.z - before.z));
  return { ...point, nx: -(after.z - before.z) / length, nz: (after.x - before.x) / length };
}

function edgeOffset(distance, side) {
  const broad = (smoothNoise(distance * 0.27, side * 9.3) - 0.5) * 0.58;
  const broken = (smoothNoise(distance * 1.15, side * 17.1 + 5) - 0.5) * 0.28;
  return broad + broken + Math.sin(distance * 0.77 + side * 3.6) * 0.1;
}

function soilTexture() {
  if (sharedSoilTexture !== undefined) return sharedSoilTexture;
  // Geometry-only imports and checks run in Node without a canvas implementation.
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) {
    sharedSoilTexture = null;
    return null;
  }
  const size = canvas.width;
  context.fillStyle = '#f7f7f7';
  context.fillRect(0, 0, size, size);

  const polygon = (x, y, radius, aspect, corners, seed, gray, opacity) => {
    const rotation = hash(seed, 93.1) * Math.PI * 2;
    const points = Array.from({ length: corners }, (_, index) => {
      const angle = rotation + index / corners * Math.PI * 2;
      const reach = radius * (0.64 + hash(seed * 3.1, index + 2.7) * 0.36);
      return [x + Math.cos(angle) * reach, y + Math.sin(angle) * reach * aspect];
    });
    const minX = Math.min(...points.map((point) => point[0]));
    const maxX = Math.max(...points.map((point) => point[0]));
    const minY = Math.min(...points.map((point) => point[1]));
    const maxY = Math.max(...points.map((point) => point[1]));
    const offsetsX = [0];
    const offsetsY = [0];
    if (minX < 0) offsetsX.push(size);
    if (maxX > size) offsetsX.push(-size);
    if (minY < 0) offsetsY.push(size);
    if (maxY > size) offsetsY.push(-size);
    context.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
    context.globalAlpha = opacity;
    // Paint each edge-crossing fragment on the opposite edge of the tile too.
    for (const offsetX of offsetsX) {
      for (const offsetY of offsetsY) {
        context.beginPath();
        points.forEach(([px, py], index) => {
          if (index === 0) context.moveTo(px + offsetX, py + offsetY);
          else context.lineTo(px + offsetX, py + offsetY);
        });
        context.closePath();
        context.fill();
      }
    }
  };

  // Low-contrast patches break up the base without large identifiable motifs.
  for (let index = 0; index < 92; index += 1) {
    polygon(
      hash(index, 11) * size, hash(index, 29) * size,
      15 + hash(index, 43) * 39, 0.55 + hash(index, 61) * 0.55,
      5 + index % 3, index + 19,
      Math.round(236 + hash(index, 71) * 19), 0.46
    );
  }
  // Compact mud flakes and small flat stone chips provide readable detail.
  for (let index = 0; index < 260; index += 1) {
    const lightChip = hash(index, 117) > 0.72;
    polygon(
      hash(index + 9.3, 121) * size, hash(index + 4.8, 143) * size,
      3.5 + hash(index, 153) * 16, 0.4 + hash(index, 173) * 0.54,
      4 + index % 3, index + 211,
      lightChip ? 255 : Math.round(218 + hash(index, 197) * 23),
      lightChip ? 0.88 : 0.63
    );
  }
  for (let index = 0; index < 1900; index += 1) {
    const x = hash(index, 251) * size;
    const y = hash(index, 277) * size;
    const grain = 0.6 + hash(index, 293) * 1.65;
    const gray = hash(index, 311) > 0.45 ? 224 : 255;
    context.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
    context.globalAlpha = 0.32 + hash(index, 337) * 0.2;
    context.fillRect(x, y, grain, grain * 0.7);
    if (x + grain > size) context.fillRect(x - size, y, grain, grain * 0.7);
    if (y + grain * 0.7 > size) context.fillRect(x, y - size, grain, grain * 0.7);
    if (x + grain > size && y + grain * 0.7 > size) context.fillRect(x - size, y - size, grain, grain * 0.7);
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'SnowCanyonRoadSoil';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  sharedSoilTexture = texture;
  return texture;
}

function materialFor(color) {
  const resolved = new THREE.Color(color);
  const key = resolved.getHexString();
  const map = soilTexture();
  if (MATERIALS.has(key)) {
    const material = MATERIALS.get(key);
    material.color.copy(resolved);
    if (map && material.map !== map) {
      material.map = map;
      material.needsUpdate = true;
    }
    return material;
  }
  const material = new THREE.MeshStandardMaterial({
    color: resolved,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
    map
  });
  // Break the boundary into small melting snow pockets while retaining opaque
  // depth/shadow behaviour. The snow showing through is the real ground below.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float roadCoverage; varying float vRoadCoverage; varying vec2 vRoadUV;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoadCoverage = roadCoverage; vRoadUV = uv;');
    shader.fragmentShader = `varying float vRoadCoverage; varying vec2 vRoadUV;
      float roadHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float roadNoise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(roadHash(i),roadHash(i+vec2(1,0)),f.x),mix(roadHash(i+vec2(0,1)),roadHash(i+vec2(1,1)),f.x),f.y);
      }\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      if (vRoadCoverage < 0.98 && vRoadCoverage < roadNoise(vRoadUV * 16.0) * 0.72 + 0.12) discard;`);
  };
  material.customProgramCacheKey = () => 'snow-road-broken-edge-v1';
  MATERIALS.set(key, material);
  return material;
}

/**
 * A static, opaque dirt ribbon following visual points without changing navigation.
 * Vertices follow terrainHeightAt(x, z) + 0.022. Width is the full road width.
 * At most 4,410 triangles and one material with a shared procedural soil texture.
 * Headless environments keep the geometry-only fallback; no per-frame updates.
 */
export function createSnowCanyonRoad({ points, terrainHeightAt = () => 0, width = 8.4, color = '#ad9473', startCapLength = 0 } = {}) {
  const path = makePath(points);
  if (path.length < 2) throw new Error('createSnowCanyonRoad requires two distinct finite { x, z } points.');
  if (typeof terrainHeightAt !== 'function') throw new TypeError('terrainHeightAt must be a function.');
  const roadWidth = Number.isFinite(width) ? Math.max(1.2, width) : 8.4;
  const totalLength = path[path.length - 1].distance;
  const lengthSegments = Math.min(MAX_LENGTH_SEGMENTS, Math.max(1, Math.ceil(totalLength / 0.6)));
  const step = totalLength / lengthSegments;
  const rows = [];
  const positions = [];
  const colors = [];
  const uvs = [];
  const coverage = [];

  const onGround = (x, z, offset = SURFACE_OFFSET) => [x, terrainHeightAt(x, z) + offset, z];
  const appendTriangle = (a, b, c, shade) => {
    // Keep winding upward even if the caller supplies points in reverse order.
    const normalY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (normalY < 0) [b, c] = [c, b];
    positions.push(...a.slice(0, 3), ...b.slice(0, 3), ...c.slice(0, 3));
    for (const point of [a, b, c]) {
      coverage.push(point[3] ?? 1);
      colors.push(shade, shade, shade);
      // A rotated world projection avoids texture repeats lining up down the road.
      uvs.push(
        (point[0] * 0.956305 + point[2] * 0.292372) / TEXTURE_WORLD_SIZE,
        (-point[0] * 0.292372 + point[2] * 0.956305) / TEXTURE_WORLD_SIZE
      );
    }
  };

  for (let row = 0; row <= lengthSegments; row += 1) {
    const terminal = row === 0 || row === lengthSegments;
    const distance = row * step + (terminal ? 0 : (hash(row, 8.7) - 0.5) * step * 0.32);
    const capT = startCapLength > 0 ? THREE.MathUtils.clamp(distance / startCapLength, 0, 1) : 1;
    const capWidth = Math.sqrt(Math.max(0.003, 1 - (1 - capT) ** 2));
    const left = (-roadWidth / 2 + edgeOffset(distance, -1)) * capWidth;
    const right = (roadWidth / 2 + edgeOffset(distance, 1)) * capWidth;
    const vertices = [];
    for (let column = 0; column <= ACROSS_SEGMENTS; column += 1) {
      const edge = column === 0 || column === ACROSS_SEGMENTS;
      const along = distance + (edge || terminal ? 0 : (hash(row * 3.1, column) - 0.5) * step * 0.45);
      const frame = frameAt(path, along);
      const across = column / ACROSS_SEGMENTS + (edge ? 0 : (hash(row + 11, column * 3.7) - 0.5) * 0.105);
      const offset = THREE.MathUtils.lerp(left, right, across);
      const vertex = onGround(frame.x + frame.nx * offset, frame.z + frame.nz * offset);
      vertex.push(edge || terminal ? 0 : 1);
      vertices.push(vertex);
    }
    rows.push(vertices);
  }

  const soilTriangle = (a, b, c, seed) => {
    const x = (a[0] + b[0] + c[0]) / 3;
    const z = (a[2] + b[2] + c[2]) / 3;
    const broad = (smoothNoise(x * 0.28, z * 0.24) - 0.5) * 0.095;
    const mottling = (smoothNoise(x * 0.76 + 9.2, z * 0.61) - 0.5) * 0.056;
    const facet = (hash(seed * 1.7, seed * 0.41) - 0.5) * 0.033;
    appendTriangle(a, b, c, 0.985 + broad + mottling + facet);
  };
  for (let row = 0; row < lengthSegments; row += 1) {
    for (let column = 0; column < ACROSS_SEGMENTS; column += 1) {
      const a = rows[row][column];
      const b = rows[row][column + 1];
      const c = rows[row + 1][column];
      const d = rows[row + 1][column + 1];
      const seed = row * ACROSS_SEGMENTS + column;
      // Mixed diagonals and offset interior vertices avoid a repeating grid.
      if (hash(row + 6.1, column + 3.4) > 0.5) {
        soilTriangle(a, b, d, seed * 2);
        soilTriangle(a, d, c, seed * 2 + 1);
      } else {
        soilTriangle(a, b, c, seed * 2);
        soilTriangle(b, d, c, seed * 2 + 1);
      }
    }
  }

  const pebbleCount = Math.min(42, Math.floor(totalLength * 0.23));
  for (let index = 0; index < pebbleCount; index += 1) {
    const distance = (index + 0.2 + hash(index, 73) * 0.6) / Math.max(1, pebbleCount) * totalLength;
    const frame = frameAt(path, distance);
    const offset = (hash(index, 92) - 0.5) * roadWidth * 0.85;
    const x = frame.x + frame.nx * offset;
    const z = frame.z + frame.nz * offset;
    const radius = 0.065 + hash(index, 47) * 0.075;
    const rotation = hash(index, 17) * Math.PI * 2;
    const top = onGround(x, z, SURFACE_OFFSET + 0.025 + hash(index, 69) * 0.022);
    const ring = Array.from({ length: 5 }, (_, corner) => {
      const angle = rotation + corner / 5 * Math.PI * 2;
      return onGround(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius * 0.67, SURFACE_OFFSET + 0.002);
    });
    for (let corner = 0; corner < 5; corner += 1) {
      appendTriangle(top, ring[corner], ring[(corner + 1) % 5], 0.91 + hash(index * 3, corner) * 0.14);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('roadCoverage', new THREE.Float32BufferAttribute(coverage, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const road = new THREE.Mesh(geometry, materialFor(color));
  road.name = 'SnowCanyonRoad';
  road.receiveShadow = true;
  road.castShadow = false;
  road.userData.snowCanyonRoad = true;
  road.userData.visualPathLength = totalLength;
  road.userData.visualPathWidth = roadWidth;
  road.userData.roadSurfaceVertexCount = lengthSegments * ACROSS_SEGMENTS * 6;
  return road;
}
