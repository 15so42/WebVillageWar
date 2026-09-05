import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { canyonSnowHeight, createSnowCanyonLayer } from '../src/world/snowCanyonGeometry.js';
import { createSnowCanyonPine } from '../src/art/snowCanyonPine.js';
import { createSnowCanyonSurfaceIndex } from '../src/world/snowCanyonSurface.js';

// Read the actual level layout without exporting test hooks from product code or
// creating a browser/world. Generated meshes below use the real geometry factory.
const worldPath = fileURLToPath(new URL('../src/world/createWorld.js', import.meta.url));
const source = readFileSync(worldPath, 'utf8').replace(/from\s*(['"])([^'"]+)\1/g, (_, quote, specifier) => {
  const url = specifier.startsWith('.')
    ? pathToFileURL(resolve(dirname(worldPath), specifier)).href
    : import.meta.resolve(specifier);
  return `from ${quote}${url}${quote}`;
});
const diagnosticSource = `${source}\nexport {
  SNOW_VALLEY_CANYON_MASSES as masses,
  snowValleyCanyonEdgeXAt as edgeXAt,
  snowValleyCanyonLayerWave as waveAt,
  snowValleyCanyonSurfaceHeightAt as surfaceAt
};\nactiveWorldConfig = resolveWorldConfig({ sceneKey: 'snow-valley' });`;
const { masses, edgeXAt, waveAt, surfaceAt } = await import(
  `data:text/javascript;base64,${Buffer.from(diagnosticSource).toString('base64')}`
);

const EPSILON = 1e-5;
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const ab = new THREE.Vector3();
const ac = new THREE.Vector3();
let triangles = 0;
let minimumNominalWidth = Infinity;
let minimumProjectedArea = Infinity;
let surfaceQueryCount = 0;
let surfaceEdgeChecks = 0;
let maximumSurfaceQueryError = 0;
const surfaces = [];

for (const mass of masses) {
  const sharedZ = mass.layers[0].innerEdge.map(point => point.z);
  for (let layerIndex = 0; layerIndex < mass.layers.length; layerIndex += 1) {
    const layer = mass.layers[layerIndex];
    const nextLayer = mass.layers[layerIndex + 1];
    const label = `${mass.id}:${layerIndex}`;
    assert.deepEqual(layer.innerEdge.map(point => point.z), sharedZ,
      `${label}: adjacent outlines must use common Z nodes to prevent crossings between bends`);
    for (const point of layer.innerEdge) {
      const outer = nextLayer ? edgeXAt(nextLayer.innerEdge, point.z) : mass.outerX;
      const width = mass.side * (outer - point.x);
      minimumNominalWidth = Math.min(minimumNominalWidth, width);
      assert.ok(width > EPSILON, `${label}: nominal shelf reverses at z=${point.z}, width=${width}`);
    }
    const result = createSnowCanyonLayer({ mass, layer, nextLayer, layerIndex, edgeXAt, waveAt });
    const surfaceIndex = createSnowCanyonSurfaceIndex();
    assert.ok(surfaceIndex.add(result.snow) > 0, `${label}: no supporting snow triangles were indexed`);
    const sharedEdges = new Map();
    const strips = new Map();
    const deviation = { layer: label, samples: 0, minimum: Infinity, maximum: -Infinity };
    const nominal = (x, z) => canyonSnowHeight(x, z,
      layer.topY + layer.bevelThickness + waveAt(mass, layer, layerIndex, z));
    for (const [kind, geometry] of Object.entries(result)) {
      const position = geometry.getAttribute('position');
      assert.equal(position.count % 3, 0, `${label}/${kind}: incomplete triangle`);
      for (const attribute of Object.values(geometry.attributes)) {
        assert.ok(attribute.array.every(Number.isFinite), `${label}/${kind}: nonfinite vertex attribute`);
      }
      for (let index = 0; index < position.count; index += 3) {
        a.fromBufferAttribute(position, index);
        b.fromBufferAttribute(position, index + 1);
        c.fromBufferAttribute(position, index + 2);
        const cross = ab.copy(b).sub(a).cross(ac.copy(c).sub(a));
        assert.ok(cross.lengthSq() > 1e-12, `${label}/${kind}: degenerate triangle at vertex ${index}`);
        triangles += 1;
        if (kind !== 'snow') continue;
        // The snow lip has an intentional underside. Classify the upper surface
        // by height relative to the shared support function, not buffer row order.
        if (![a, b, c].every(point => point.y >= nominal(point.x, point.z) - 0.13)) continue;
        assert.ok(cross.y > EPSILON, `${label}: upper snow face points down or is vertical at vertex ${index}`);
        minimumProjectedArea = Math.min(minimumProjectedArea, cross.y / 2);
        const zMin = Math.min(a.z, b.z, c.z);
        const zMax = Math.max(a.z, b.z, c.z);
        const key = `${zMin}:${zMax}`;
        if (!strips.has(key)) strips.set(key, { zMin, zMax, area: 0, start: [], end: [] });
        const strip = strips.get(key);
        strip.area += cross.y / 2;
        for (const point of [a, b, c]) {
          assert.ok(Math.abs(point.z - zMin) < EPSILON || Math.abs(point.z - zMax) < EPSILON,
            `${label}: snow strip has an unexpected interior Z node`);
          (Math.abs(point.z - zMin) < EPSILON ? strip.start : strip.end).push(point.x);
        }
        const x = (a.x + b.x + c.x) / 3;
        const z = (a.z + b.z + c.z) / 3;
        const center = { x, y: (a.y + b.y + c.y) / 3, z };
        const queriedHeight = surfaceIndex.heightAt(x, z);
        assert.ok(queriedHeight != null, `${label}: triangle centroid missing from surface index`);
        const queryError = Math.abs(queriedHeight - center.y);
        maximumSurfaceQueryError = Math.max(maximumSurfaceQueryError, queryError);
        assert.ok(queryError < EPSILON, `${label}: indexed height differs from the actual triangle by ${queryError}`);
        surfaceQueryCount += 1;
        const vertices = [a, b, c].map(point => ({ x: point.x, y: point.y, z: point.z }));
        for (let edge = 0; edge < 3; edge += 1) {
          const start = vertices[edge]; const end = vertices[(edge + 1) % 3];
          const key = [JSON.stringify(start), JSON.stringify(end)].sort().join('|');
          if (!sharedEdges.has(key)) sharedEdges.set(key, { start, end, centers: [] });
          sharedEdges.get(key).centers.push(center);
        }
        const innerX = edgeXAt(layer.innerEdge, z);
        const outerX = nextLayer ? edgeXAt(nextLayer.innerEdge, z) : mass.outerX;
        // Skip the intentional snow overhang and buried overlap under the next
        // cliff: only exposed platform samples can support props or trees.
        if (mass.side * (x - innerX) < 0.05 || mass.side * (outerX - x) < 0.05) continue;
        const support = surfaceAt(x, z);
        assert.ok(Number.isFinite(support), `${label}: visible snow has no nominal support height`);
        const delta = (a.y + b.y + c.y) / 3 - support;
        deviation.samples += 1;
        deviation.minimum = Math.min(deviation.minimum, delta);
        deviation.maximum = Math.max(deviation.maximum, delta);
      }
      geometry.dispose();
    }
    for (const { start, end, centers } of sharedEdges.values()) {
      if (centers.length !== 2) continue;
      const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, z: (start.z + end.z) / 2 };
      assert.ok(Math.abs(surfaceIndex.heightAt(midpoint.x, midpoint.z) - midpoint.y) < EPSILON,
        `${label}: height is discontinuous on a shared triangle edge`);
      for (const center of centers) {
        const weight = 1e-4;
        const x = midpoint.x + (center.x - midpoint.x) * weight;
        const z = midpoint.z + (center.z - midpoint.z) * weight;
        const y = midpoint.y + (center.y - midpoint.y) * weight;
        assert.ok(Math.abs(surfaceIndex.heightAt(x, z) - y) < EPSILON,
          `${label}: query loses continuity immediately beside a shared edge`);
      }
      surfaceEdgeChecks += 1;
    }
    // An unfolded surface tiles its projected trapezoid exactly. Winding repair
    // alone cannot pass this check: a folded row adds overlapping projected area.
    for (const strip of strips.values()) {
      const width = values => Math.max(...values) - Math.min(...values);
      const envelopeArea = (width(strip.start) + width(strip.end)) * (strip.zMax - strip.zMin) / 2;
      assert.ok(Math.abs(strip.area - envelopeArea) < 1e-4,
        `${label}: snow folds or overlaps in z=[${strip.zMin},${strip.zMax}], area=${strip.area}, envelope=${envelopeArea}`);
    }
    assert.ok(deviation.samples > 0, `${label}: no exposed platform was checked`);
    // Snow lips/shoulders deliberately rise by 0.1; the remaining budget covers
    // interpolation of the smooth support height across low-poly faces.
    assert.ok(deviation.minimum >= -0.25 && deviation.maximum <= 0.25,
      `${label}: visible snow differs from prop support by [${deviation.minimum}, ${deviation.maximum}]`);
    surfaces.push(deviation);
  }
}

function triangleGeometry(points, indexed = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  if (indexed) geometry.setIndex([0, 1, 2]);
  return geometry;
}
const overlapIndex = createSnowCanyonSurfaceIndex();
const sloped = triangleGeometry([[0, 1, 0], [0, 3, 4], [4, 5, 0]], true);
assert.equal(overlapIndex.add(sloped), 1);
assert.equal(overlapIndex.heightAt(1, 1), 2.5, 'indexed triangles must use barycentric height');
const upper = triangleGeometry([[0, 7, 0], [0, 7, 4], [4, 7, 0]]);
assert.equal(overlapIndex.add(upper), 1);
assert.equal(overlapIndex.heightAt(1, 1), 7, 'overlapping shelves must return the upper surface');
assert.equal(overlapIndex.heightAt(2, 2), 7, 'triangle boundaries remain queryable');
assert.equal(overlapIndex.heightAt(4, 0), 7, 'surface remains queryable at a 4 m hash-cell boundary');
assert.equal(overlapIndex.heightAt(5, 5), null);
assert.equal(overlapIndex.heightAt(NaN, 0), null);
const unsupportedIndex = createSnowCanyonSurfaceIndex();
const downward = triangleGeometry([[0, 9, 0], [4, 9, 0], [0, 9, 4]]);
const nearVertical = triangleGeometry([[0, 0, 0], [0, 4, 0.00001], [4, 0, 0]]);
assert.equal(unsupportedIndex.add(downward), 0, 'snow undersides are not supporting surfaces');
assert.equal(unsupportedIndex.add(nearVertical), 0, 'near-vertical edge skirts are not supporting surfaces');
assert.equal(unsupportedIndex.heightAt(1, 0.000001), null);
[sloped, upper, downward, nearVertical].forEach(geometry => geometry.dispose());

let treeCases = 0;
let smallestRadiusMargin = Infinity;
let smallestHeightMargin = Infinity;
for (const scale of [0.2, 0.75, 1, 2.5]) {
  for (const variant of [0, 1, 2]) {
    for (const options of [{}, { snowCap: false }, { pureSnowCap: true }]) {
      const tree = createSnowCanyonPine(scale, { variant, ...options });
      tree.updateMatrixWorld(true);
      const radius = tree.userData.visualFootprintRadius;
      const height = tree.userData.visualHeight;
      assert.ok(Number.isFinite(radius) && radius > 0 && Number.isFinite(height) && height > 0);
      tree.traverse(node => {
        if (!node.isMesh) return;
        const position = node.geometry.getAttribute('position');
        for (let index = 0; index < position.count; index += 1) {
          a.fromBufferAttribute(position, index).applyMatrix4(node.matrixWorld);
          const radialMargin = radius - Math.hypot(a.x, a.z);
          const heightMargin = height - a.y;
          smallestRadiusMargin = Math.min(smallestRadiusMargin, radialMargin);
          smallestHeightMargin = Math.min(smallestHeightMargin, heightMargin);
          assert.ok(radialMargin >= -EPSILON && heightMargin >= -EPSILON && a.y >= -EPSILON,
            `pine variant=${variant} scale=${scale}: metadata does not enclose vertex ${index}`);
        }
      });
      treeCases += 1;
    }
  }
}

console.log(JSON.stringify({ triangles, minimumNominalWidth, minimumProjectedArea, surfaces,
  surfaceQueryCount, surfaceEdgeChecks, maximumSurfaceQueryError,
  treeCases, smallestRadiusMargin, smallestHeightMargin }, null, 2));
console.log('snow canyon geometry and tree envelope tests passed');
