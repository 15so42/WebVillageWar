import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorld } from '../src/world/createWorld.js';

// 第一关「雪原谷地」黄昏重制后的布局与导航验证：
// 主路可走、基地→敌营贯通、三祭坛可达、雪山远景环就位、渲染预设生效。

const scene = new THREE.Scene();
// Node 环境无 DOM，关闭烘焙阴影遮罩（需要 canvas）；浏览器内仍按预设启用
const world = createWorld(scene, { sceneKey: 'snow-valley', sky: { bakedShadows: false } });
const config = world.config;

assert.equal(config.sceneKey, 'snow-valley');
assert.equal(config.pathPoints.length, 12, '主路应为 12 个锚点的 S 形路线');
assert.equal(config.altars.length, 3, '应包含 3 座祭坛');

// 1. 主路可走；首锚点位于基地阻挡圈内改用外移采样，末两锚点深入敌营阻挡圈不验证
const base = config.playerBasePosition;
const camp = config.enemyCampPosition;
config.pathPoints.forEach((point, index) => {
  if (index >= config.pathPoints.length - 2) return;
  let sample = point;
  if (index === 0) {
    const next = config.pathPoints[1];
    const length = Math.hypot(next.x - point.x, next.z - point.z);
    sample = {
      x: point.x + ((next.x - point.x) / length) * 3.4,
      z: point.z + ((next.z - point.z) / length) * 3.4
    };
  }
  assert.ok(
    world.isWalkable(sample),
    `主路锚点 ${index} (${sample.x.toFixed(1)}, ${sample.z.toFixed(1)}) 应可走`
  );
});

// 2. 基地外围出发点可走，且主路贯通敌营
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
assert.ok(routeDistance > 50 && routeDistance < 170, `主路长度应合理（实际 ${routeDistance.toFixed(1)}）`);

// 3. 三座祭坛均可从基地抵达
config.altars.forEach((altar) => {
  const position = altar.position;
  assert.ok(world.isWalkable(position), `祭坛 ${altar.id} 位置应可走`);
  const route = world.findPath(spawn, position);
  assert.ok(route.length > 0, `祭坛 ${altar.id} 应从基地可达`);
});

// 4. 雪山远景环：岛外海面两层合并 mesh（renderOrder -2），近远各至少一层
const backdropLayers = scene.children.filter((child) => child.isMesh && child.renderOrder === -2);
assert.ok(backdropLayers.length >= 1, '应生成雪山远景环层');

// 5. 渲染预设：Toon 暖橙暮色光照与雾效参数
assert.ok(scene.fog && scene.fog.near === 48 && scene.fog.far === 215, '雾效参数应为 Toon 暖橙暮色预设');
const sun = world.lights.sun;
assert.equal(`#${sun.color.getHexString()}`, '#ffaa66', '主光应为 Toon 暖橙色');

// 6. update 循环不抛错（降雪粒子与装饰驱动）
world.update(0.016, new THREE.Vector3(0, 0, 0), new THREE.Camera(), {});
world.update(0.016, new THREE.Vector3(0, 0, 0), new THREE.Camera(), {});

// 7. 地形高度合理：主路与基地高于海平面
const waterHeight = config.terrain.waterHeight ?? -1.28;
config.pathPoints.forEach((point, index) => {
  const height = world.heightAt(point.x, point.z);
  assert.ok(height > waterHeight, `主路锚点 ${index} 高度 ${height.toFixed(3)} 应高于海平面`);
});
assert.ok(world.heightAt(base.x, base.z) > waterHeight + 0.5, '基地应坐落在岛面上');

console.log('snow valley world layout tests passed');
