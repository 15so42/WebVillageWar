import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { createWorld } from '../src/world/createWorld.js';

// 第一关「雪原谷地」参考图重制后的布局与导航验证：
// 主路可走、基地→敌营贯通、三祭坛可达、雪山远景环就位、渲染预设生效。
// 加 --compare-head 可额外核对本次工作区改动未影响其他关卡配置。

const scene = new THREE.Scene();
// Node 环境无 DOM，关闭烘焙阴影遮罩（需要 canvas）；浏览器内仍按预设启用
const world = createWorld(scene, { sceneKey: 'snow-valley', sky: { bakedShadows: false } });
const config = world.config;

assert.equal(config.sceneKey, 'snow-valley');
assert.equal(config.pathPoints.length, 12, '主路应为 12 个锚点的 S 形路线');
assert.equal(config.altars.length, 3, '应包含 3 座祭坛');
assert.deepEqual(config.camera, {
  target: { x: 0.654, y: 4, z: 31.636 },
  initialPosition: { x: 2.1, y: 30.5, z: 66.8 },
  minDistance: 12,
  maxDistance: 78
}, '第一关视觉重制必须保留开局相机位置、观察点与缩放范围');
const root = fileURLToPath(new URL('../', import.meta.url));
const gameSource = readFileSync(resolve(root, 'src/systems/Game.js'), 'utf8');
assert.match(gameSource, /new THREE\.PerspectiveCamera\(35,\s*1,\s*0\.1,\s*240\)/,
  '真实游戏相机必须保留 35 度视场角与现有裁剪范围');
assert.match(gameSource, /this\.camera\.lookAt\(this\.cameraTarget\)/,
  '相机观察方向必须仍由现有观察点决定');

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

// 5. 渲染预设：暖阳、蓝灰阴影与清晰的作战近景
assert.ok(scene.fog && scene.fog.near === 64 && scene.fog.far === 214, '雾效应保留清晰近景并柔化远景');
const sun = world.lights.sun;
assert.equal(`#${sun.color.getHexString()}`, '#ffe0bb', '主光应为参考图的暖金色');

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

if (process.argv.includes('--compare-head')) {
  const relativeWorldPath = 'src/world/createWorld.js';
  const worldPath = resolve(root, relativeWorldPath);
  const currentWorldSource = readFileSync(worldPath, 'utf8');
  const headSource = (path) => execFileSync('git', ['show', `HEAD:${path}`], { cwd: root, encoding: 'utf8' });
  // Expose only configuration resolution from an in-memory copy. Relative and
  // package imports resolve to the same real dependencies; no scene or temp file
  // is created and Git remains read-only.
  const loadConfigResolver = async (source) => {
    const rewritten = source.replace(/from\s*(['"])([^'"]+)\1/g, (_, quote, specifier) => {
      const url = specifier.startsWith('.')
        ? pathToFileURL(resolve(dirname(worldPath), specifier)).href
        : import.meta.resolve(specifier);
      return `from ${quote}${url}${quote}`;
    });
    const diagnosticSource = `${rewritten}\nexport { resolveWorldConfig as testResolveConfig };\nexport const testPresetKeys = Object.keys(WORLD_PRESETS);`;
    return import(`data:text/javascript;base64,${Buffer.from(diagnosticSource).toString('base64')}`);
  };
  const [headWorld, currentWorld] = await Promise.all([
    loadConfigResolver(headSource(relativeWorldPath)), loadConfigResolver(currentWorldSource)
  ]);
  const otherSceneKeys = headWorld.testPresetKeys.filter((key) => key !== 'snow-valley');
  assert.deepEqual(currentWorld.testPresetKeys, headWorld.testPresetKeys, '本次视觉修改不应增删关卡');
  for (const sceneKey of otherSceneKeys) {
    assert.deepEqual(currentWorld.testResolveConfig({ sceneKey }), headWorld.testResolveConfig({ sceneKey }),
      `${sceneKey} 的完整解析配置（含默认继承）不得随第一关改变`);
  }
  const headGame = headSource('src/systems/Game.js');
  for (const preset of ['DUNGEON_HALLS', 'RED_DESERT', 'EMERALD_MARSH']) {
    const pattern = new RegExp(`const ${preset}_HEAD_RENDER_TUNING = Object\\.freeze\\((\\{[\\s\\S]*?\\})\\);`);
    const before = headGame.match(pattern)?.[1];
    const after = gameSource.match(pattern)?.[1];
    assert.ok(before && after, `${preset} 渲染预设必须存在`);
    assert.equal(after.replace(/\r\n/g, '\n'), before.replace(/\r\n/g, '\n'),
      `${preset} 的真实游戏渲染预设不得改变`);
  }
  console.log(`other-level config comparison against HEAD passed (${otherSceneKeys.length} worlds, 3 renderer presets)`);
}

console.log('snow valley world layout tests passed');
