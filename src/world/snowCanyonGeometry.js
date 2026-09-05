import * as THREE from 'three';

// Shared cross-section: the rendered cliff, its snow lip, and prop placement use
// the same surface. Small folds change the silhouette without making loose pillars.
export function canyonSnowHeight(x, z, baseHeight) {
  return baseHeight + Math.sin(x * 0.49 + z * 0.21) * 0.13
    + Math.sin(x * 0.23 - z * 0.38) * 0.09;
}

function noise(a, b) {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function makeBuffer() { return { position: [], color: [] }; }

function triangle(buffer, a, b, c, facing, shade) {
  const ab = new THREE.Vector3().fromArray(b).sub(new THREE.Vector3().fromArray(a));
  const ac = new THREE.Vector3().fromArray(c).sub(new THREE.Vector3().fromArray(a));
  if (ab.cross(ac).dot(facing) < 0) [b, c] = [c, b];
  buffer.position.push(...a, ...b, ...c);
  for (let i = 0; i < 3; i += 1) buffer.color.push(shade, shade, shade);
}

function quad(buffer, a, b, c, d, facing, shade, flip) {
  if (flip) {
    triangle(buffer, a, b, d, facing, shade);
    triangle(buffer, b, c, d, facing, shade * 0.98);
  } else {
    triangle(buffer, a, b, c, facing, shade);
    triangle(buffer, a, c, d, facing, shade * 0.98);
  }
}

function finish(buffer) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffer.position, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffer.color, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createSnowCanyonLayer({ mass, layer, nextLayer, layerIndex, edgeXAt, waveAt }) {
  const rock = makeBuffer();
  const snow = makeBuffer();
  const up = new THREE.Vector3(0, 1, 0);
  const outward = new THREE.Vector3(-mass.side, 0, 0);
  const samples = [];
  // Shared z samples keep adjoining facets watertight. Broad sections are broken
  // into 2–3 m rock planes rather than the old uninterrupted extruded wall.
  // Keep every outline bend in the rendered face. Resampling at an unrelated
  // spacing would cut across corners beyond the placement guard's fold margin.
  const zSamples = [...new Set([mass.zMin, ...layer.innerEdge.map(point => point.z), mass.zMax])].sort((a, b) => a - b);
  for (let i = 0; i < zSamples.length; i += 1) {
    const z = zSamples[i];
    const edge = edgeXAt(layer.innerEdge, z);
    const fold = (noise(i + layerIndex * 17, mass.side) - 0.5) * 0.9;
    const innerX = edge + mass.side * fold;
    const top = layer.topY + layer.bevelThickness + waveAt(mass, layer, layerIndex, z);
    const outerX = nextLayer
      ? edgeXAt(nextLayer.innerEdge, z) + mass.side * 1.1
      : mass.outerX;
    const topY = canyonSnowHeight(innerX, z, top);
    const face = [0, 0.36, 0.7, 1].map((t, row) => {
      const protrusion = row === 0 ? 0.1 : row === 3 ? -0.08 :
        (noise(i * 0.77 + row * 11, layerIndex + mass.side * 7) - 0.35) * 0.95;
      return [innerX - mass.side * protrusion,
        THREE.MathUtils.lerp(layer.baseY, topY - 0.3, t), z];
    });
    const lip = [innerX - mass.side * 0.16, topY - 0.08, z];
    const span = mass.side * (outerX - innerX);
    const shoulderX = innerX + mass.side * Math.min(0.65 + noise(i, layerIndex) * 0.45, span * 0.55);
    const shoulder = [shoulderX, canyonSnowHeight(shoulderX, z, top) + 0.1, z];
    const surface = [shoulder, ...[0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((t) => {
      const x = THREE.MathUtils.lerp(shoulderX, outerX, t);
      return [x, canyonSnowHeight(x, z, top), z];
    })];
    samples.push({ face, lip, surface });
  }
  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i]; const b = samples[i + 1];
    for (let row = 0; row < a.face.length - 1; row += 1) {
      const shade = 0.88 + noise(i, row + layerIndex * 5) * 0.15;
      quad(rock, a.face[row], b.face[row], b.face[row + 1], a.face[row + 1], outward, shade, (i + row) % 2);
    }
    quad(snow, a.face[3], b.face[3], b.lip, a.lip, outward, 0.86, i % 2);
    quad(snow, a.lip, b.lip, b.surface[0], a.surface[0], up, 0.98, i % 2);
    for (let row = 0; row < a.surface.length - 1; row += 1) {
      const shade = 0.94 + noise(i + layerIndex * 7, row) * 0.065;
      quad(snow, a.surface[row], b.surface[row], b.surface[row + 1], a.surface[row + 1], up, shade, (i + row) % 2);
    }
  }
  // End walls close the canyon outside the playable area as well as in far views.
  for (const [index, direction] of [[0, -1], [samples.length - 1, 1]]) {
    const s = samples[index];
    const back = s.surface[s.surface.length - 1];
    quad(rock, s.face[0], [back[0], layer.baseY, back[2]], back, s.lip,
      new THREE.Vector3(0, 0, direction), 0.92, false);
  }
  return { rock: finish(rock), snow: finish(snow) };
}
