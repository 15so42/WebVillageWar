import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorld } from '../src/world/createWorld.js';

// 第四章「翡翠沼泽」重构后的布局与导航验证：
// 主路干燥可走、基地→敌营贯通、三祭坛可达、栈道可走、水面存在、氛围层就位。

const scene = new THREE.Scene();
const world = createWorld(scene, { sceneKey: 'emerald-marsh' });
const config = world.config;

assert.equal(config.theme, 'emerald-marsh');
assert.equal(config.pathPoints.length, 12, '新主路应为 12 个锚点的 S 形路线');
assert.equal(config.marshPools.length, 8, '应包含 8 个水塘');
assert.equal(config.marshBoardwalks.length, 4, '应包含 4 条栈道');
assert.equal(config.altars.length, 3, '应包含 3 座祭坛');

// 1. 主路全线干燥可走（dryReserve 保护）；
// 首末锚点位于基地/敌营内置圆形阻挡区内（所有地图的既有机制），改用外移采样点验证
const base = config.playerBasePosition;
const camp = config.enemyCampPosition;
config.pathPoints.forEach((point, index) => {
  let sample = point;
  if (index === 0) {
    const next = config.pathPoints[1];
    const length = Math.hypot(next.x - point.x, next.z - point.z);
    sample = {
      x: point.x + ((next.x - point.x) / length) * 3.4,
      z: point.z + ((next.z - point.z) / length) * 3.4
    };
  } else if (index === config.pathPoints.length - 1) {
    const prev = config.pathPoints[index - 1];
    const length = Math.hypot(prev.x - point.x, prev.z - point.z);
    sample = {
      x: point.x + ((prev.x - point.x) / length) * 4.2,
      z: point.z + ((prev.z - point.z) / length) * 4.2
    };
  }
  assert.ok(
    world.isWalkable(sample),
    `主路锚点 ${index} (${sample.x.toFixed(1)}, ${sample.z.toFixed(1)}) 应可走`
  );
});

// 2. 基地与敌营周边可走，且主路贯通（findPath 会自动吸附最近可走格）；
// 实战中单位从基地阻挡圈外出发，寻路起点同样取圈外采样点
const spawn = (() => {
  const next = config.pathPoints[1];
  const length = Math.hypot(next.x - base.x, next.z - base.z);
  return {
    x: base.x + ((next.x - base.x) / length) * 3.4,
    z: base.z + ((next.z - base.z) / length) * 3.4
  };
})();
assert.ok(world.isWalkable(spawn), '基地外围出发点应可走');
const mainRoute = world.findPath(spawn, camp);
assert.ok(mainRoute.length > 2, '基地→敌营应存在贯通路径');
const routeDistance = world.navigationDistance(spawn, camp);
assert.ok(routeDistance > 50 && routeDistance < 160, `主路长度应合理（实际 ${routeDistance.toFixed(1)}）`);

// 3. 三座祭坛均可从基地抵达
config.altars.forEach((altar) => {
  const position = altar.position;
  assert.ok(world.isWalkable(position), `祭坛 ${altar.id} 位置应可走`);
  const route = world.findPath(spawn, position);
  assert.ok(route.length > 0, `祭坛 ${altar.id} 应从基地可达`);
});

// 4. 栈道可走：栈桥中线每一步都落在干燥面上
config.marshBoardwalks.forEach((boardwalk, index) => {
  const steps = 6;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = boardwalk.from.x + (boardwalk.to.x - boardwalk.from.x) * t;
    const z = boardwalk.from.z + (boardwalk.to.z - boardwalk.from.z) * t;
    assert.ok(world.isWalkable({ x, z }), `栈道 ${index} 在 t=${t.toFixed(2)} 处应可走`);
  }
});

// 5. 水面存在性：大湖中心必须被水淹没（不可走），且湖面位于预期区域
const deepWaterSpots = [
  { x: -27, z: 12, label: '西部镜湖' },
  { x: 26, z: -2, label: '东部腐湖' },
  { x: -22, z: -27, label: '西南死水' },
  { x: 0, z: -40, label: '敌营后水带' }
];
deepWaterSpots.forEach((spot) => {
  assert.ok(!world.isWalkable(spot), `${spot.label} (${spot.x}, ${spot.z}) 应为深水不可走`);
});

// 6. 场景对象与氛围层
const waterMesh = scene.children.find(
  (child) => child.isMesh &&
    child.material?.vertexColors &&
    child.geometry?.getAttribute('color') &&
    typeof child.userData.updateWorldDecoration === 'function'
);
assert.ok(waterMesh, '应生成带深度顶点色且注册动画更新的动态水面');
const pointsLayer = scene.children.find((child) => child.isPoints);
assert.ok(!pointsLayer, '不应存在悬浮粒子层（白天的沼泽不放萤火，避免俯视角水面光斑）');
assert.ok(scene.fog && scene.fog.near === 38 && scene.fog.far === 152, '雾效参数应为新预设');

// 7. update 循环不抛错（动画装饰驱动）
world.update(0.016, new THREE.Vector3(0, 0, 0), new THREE.Camera(), {});
world.update(0.016, new THREE.Vector3(0, 0, 0), new THREE.Camera(), {});

// 8. 地形高度合理：主路点高于水面，营地台地高于主路
const waterHeight = config.marshWaterHeight ?? 0.055;
config.pathPoints.forEach((point, index) => {
  const height = world.heightAt(point.x, point.z);
  assert.ok(height > waterHeight, `主路锚点 ${index} 高度 ${height.toFixed(3)} 应高于水面`);
});
assert.ok(world.heightAt(base.x, base.z) > waterHeight + 0.1, '基地应坐落在干燥台地上');

console.log('marsh world layout tests passed');
