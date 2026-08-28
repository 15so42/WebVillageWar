import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAltarModel } from '../src/art/lowpoly.js';
import { AltarSystem, createTerrainProjectedRangeRingGeometry } from '../src/systems/AltarSystem.js';

const center = new THREE.Vector3(2, 10.12, 3);
const radius = 4;
const geometry = createTerrainProjectedRangeRingGeometry(
  center,
  radius,
  (x, z) => 10 + x * 0.08 - z * 0.04,
  { rotationY: Math.PI / 5 }
);
const positions = geometry.getAttribute('position');
assert.equal(positions.count, 96 * 6);
assert.equal(geometry.userData.terrainProjected, true);
assert.equal(geometry.userData.radius, radius);
assert.equal(geometry.userData.terrainOffset, 0.09);
let minY = Infinity;
let maxY = -Infinity;
for (let index = 0; index < positions.count; index += 1) {
  minY = Math.min(minY, positions.getY(index));
  maxY = Math.max(maxY, positions.getY(index));
}
assert.ok(maxY - minY > 0.4, 'projected ring should follow uneven terrain heights');
geometry.dispose();

const altarModel = createAltarModel({ color: '#6ef0c4' });
const rangeRing = altarModel.userData.parts.areaRing;
assert.equal(rangeRing.material.depthTest, true);
assert.equal(rangeRing.material.depthWrite, false);
assert.equal(rangeRing.material.polygonOffset, true);
assert.ok(rangeRing.material.polygonOffsetFactor < 0);
assert.ok(rangeRing.material.polygonOffsetUnits < 0);
assert.equal(rangeRing.layers.mask, 1, 'altar range ring renders in the main depth layer');

const scene = new THREE.Scene();
const altarSystem = new AltarSystem({
  scene,
  groundHeightAt: () => 0,
  friendlyUnits: [],
  enemyUnits: []
}, [{
  id: 'capture-layer-test',
  type: 'energy',
  position: { x: 0, z: 0 }
}]);
const captureRing = altarSystem.altars[0].model.userData.parts.progressRing;
assert.equal(captureRing.layers.mask, 1, 'altar capture ring renders on Three.js layer 0');
assert.equal(captureRing.material.depthTest, true, 'altar capture ring must respect normal scene depth');
assert.equal(captureRing.material.depthWrite, false);
assert.equal(captureRing.renderOrder, 0, 'altar capture ring must not force overlay rendering');

console.log('Altar projected range ring tests passed.');
