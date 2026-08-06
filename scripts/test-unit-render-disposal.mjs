import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSelectionRing } from '../src/art/lowpoly.js';
import { UnitRegistry } from '../src/systems/UnitRegistry.js';

const scene = new THREE.Scene();
let detachedMovement = 0;
let cancelledAttacks = 0;
const game = {
  scene,
  movement: { attach() { detachedMovement += 1; } },
  targeting: { register() {}, unregister() {} },
  attacks: { cancelPendingAttacksFor() { cancelledAttacks += 1; } }
};
const registry = new UnitRegistry(game);

const firstSelectionRing = createSelectionRing('#62d56f');
const secondSelectionRing = createSelectionRing('#62d56f');
assert.notEqual(
  firstSelectionRing.userData.ring.material,
  secondSelectionRing.userData.ring.material,
  '单位选择环材质必须独立，防止释放阵亡单位时破坏其他单位的选择环'
);

function createUnit(id) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  let geometryDisposals = 0;
  let materialDisposals = 0;
  let statusRemovals = 0;
  geometry.addEventListener('dispose', () => { geometryDisposals += 1; });
  material.addEventListener('dispose', () => { materialDisposals += 1; });
  const visualRoot = new THREE.Group();
  visualRoot.add(new THREE.Mesh(geometry, material));
  const mesh = new THREE.Group();
  mesh.add(visualRoot);
  return {
    id,
    team: 'enemy',
    alive: true,
    mesh,
    visualRoot,
    statusElement: { remove() { statusRemovals += 1; } },
    counters: () => ({ geometryDisposals, materialDisposals, statusRemovals })
  };
}

const first = createUnit(1);
registry.register(first);
assert.equal(scene.children.includes(first.mesh), true);
registry.unregister(first);
assert.equal(scene.children.includes(first.mesh), false);
assert.deepEqual(first.counters(), {
  geometryDisposals: 1,
  materialDisposals: 1,
  statusRemovals: 1
});
assert.equal(first.renderResourcesDisposed, true);
assert.equal(cancelledAttacks, 1);

const second = createUnit(2);
const third = createUnit(3);
registry.register(second);
registry.register(third);
registry.destroy();
assert.equal(registry.allUnits.length, 0);
assert.equal(registry.enemyUnits.length, 0);
assert.equal(registry.byId.size, 0);
assert.equal(second.counters().geometryDisposals, 1);
assert.equal(third.counters().materialDisposals, 1);
assert.equal(detachedMovement, 3);

console.log('unit render resource disposal checks passed');
