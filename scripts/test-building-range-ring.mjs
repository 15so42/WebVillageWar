import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAttackRangeDashedRing } from '../src/art/lowpoly.js';
import { BuildingSystem } from '../src/systems/BuildingSystem.js';

const dashedRange = createAttackRangeDashedRing('#62d56f');
assert.equal(dashedRange.userData.isAttackRangeDashedRing, true);
assert.equal(dashedRange.userData.dashCount, 24);
assert.equal(dashedRange.userData.colorMeshes.length, 24);
assert.ok(dashedRange.userData.colorMeshes.every((arc) => (
  arc.geometry?.type === 'RingGeometry'
  && arc.material.transparent === true
  && arc.material.side === THREE.DoubleSide
  && arc.material.depthTest === true
  && arc.material.depthWrite === false
  && arc.renderOrder === 0
)), '虚线弧段保持正常渲染层纪律');
assert.equal(
  dashedRange.userData.colorMeshes[0].geometry,
  dashedRange.userData.colorMeshes[1].geometry,
  '全部虚线弧共享同一段几何体'
);
dashedRange.traverse((node) => assert.equal(node.layers.mask, 1, '虚线范围环位于主世界层'));

const scene = new THREE.Scene();
const game = {
  scene,
  friendlyUnits: [],
  enemyUnits: [],
  modifiers: { getAttackRange: () => 9.2 },
  groundHeightAt: () => 0,
  playerVisualColor: () => '#62d56f'
};
const system = new BuildingSystem(game);
const tower = {
  isBuilding: true,
  alive: true,
  underConstruction: false,
  definition: { attackRange: 9.2 },
  position: new THREE.Vector3(1, 0, 2)
};
system.buildings.add(tower);
system.update(0.016);
assert.ok(system.buildingRangeVisuals.has(tower), '建成后应创建范围环');
const visuals = system.buildingRangeVisuals.get(tower);
assert.equal(visuals.visible, true);
assert.equal(visuals.position.x, 1);
assert.equal(visuals.position.z, 2);
assert.ok(Math.abs(visuals.scale.x - 9.2) < 1e-6, '箭塔范围环半径取射程');
assert.ok(scene.children.includes(visuals), '范围环加入场景');

const underConstruction = {
  isBuilding: true,
  alive: true,
  underConstruction: true,
  definition: { buildingAura: { radius: 4.1 } },
  position: new THREE.Vector3()
};
system.buildings.add(underConstruction);
system.update(0.016);
assert.ok(!system.buildingRangeVisuals.has(underConstruction), '施工中不显示范围环');
underConstruction.underConstruction = false;
system.update(0.016);
assert.ok(system.buildingRangeVisuals.has(underConstruction), '建成后显示范围环');
assert.ok(
  Math.abs(system.buildingRangeVisuals.get(underConstruction).scale.x - 4.1) < 1e-6,
  '维修站范围环半径取光环半径'
);

const beacon = {
  isBuilding: true,
  alive: true,
  underConstruction: false,
  definition: { deploymentRadius: 7.5 },
  position: new THREE.Vector3()
};
system.buildings.add(beacon);
system.update(0.016);
assert.ok(
  Math.abs(system.buildingRangeVisuals.get(beacon).scale.x - 7.5) < 1e-6,
  '信标范围环半径取部署半径'
);

// 无有效范围的建筑不显示范围环
const plainBuilding = {
  isBuilding: true,
  alive: true,
  underConstruction: false,
  definition: {},
  position: new THREE.Vector3()
};
system.buildings.add(plainBuilding);
system.update(0.016);
assert.ok(!system.buildingRangeVisuals.has(plainBuilding), '无范围建筑不显示环');

// 死亡后销毁
tower.alive = false;
system.update(0.016);
assert.ok(!system.buildingRangeVisuals.has(tower), '死亡建筑的范围环被移除');
system.destroy();
assert.equal(scene.children.length, 0, '系统销毁后不残留范围环');

console.log('building range ring checks passed');