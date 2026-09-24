// 海岛地形验收：**放大一倍 + 平坦**（本轮需求第 4 条）。
//
// 为什么用单元测试而不是浏览器验收：`createWorld()` 在 Node 里就能跑
// （`test-marsh-world-layout.mjs` 就是这么做的），而地形是纯几何——
// 在 Node 里可以把**整个可走区域**逐格扫一遍，比在浏览器里抽几个点强得多，
// 也快得多（这个文件不到一秒，浏览器验收要一分钟）。
//
// 这一条守的四个不变量：
//   1. 陆地**逐点等高**：可走区域里任意两点的高度差必须是 0。
//      这是"平坦"唯一诚实的判据——把 hills/ridges 清空只是没有丘陵，
//      沙滩混合与基地平台混合仍然会留下可感知的起伏。
//   2. 场景确实是两倍：海岸线跨度、导航边界、相机最远距离都翻倍。
//   3. 放大的同时**没有一个关键点掉进海里**：基地、敌营、刷怪点、资源区、
//      祭坛、野生动物、野外招募点都必须在水面之上。这是缩放坐标最大的风险。
//   4. 密度是有意调过的：节点总数恰好翻倍（面积翻了 4 倍，所以密度减半），
//      并且有一个上限，避免"顺手按面积放大"把节点数推到影响性能的量级。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWorld } from '../src/world/createWorld.js';
import { ISLAND_SPAWN_POINTS } from '../src/data/gameData.js';

const report = [];
function check(name, fn) {
  try {
    fn();
    report.push(`ok   ${name}`);
  } catch (error) {
    report.push(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

const scene = new THREE.Scene();
const world = createWorld(scene, { sceneKey: 'island-survival' });
const config = world.config;
const terrain = config.terrain;
const waterHeight = config.landmass?.waterHeight ?? 0;

/** 关键点集合：缩放出错时最先掉进海里的就是这些。 */
const keyPoints = [];
keyPoints.push({ label: '基地', x: config.playerBasePosition.x, z: config.playerBasePosition.z });
keyPoints.push({ label: '敌营', x: config.enemyCampPosition.x, z: config.enemyCampPosition.z });
config.pathPoints.forEach((p, i) => keyPoints.push({ label: `主路#${i}`, x: p.x, z: p.z }));
(config.clearings ?? []).forEach((c, i) => keyPoints.push({ label: `空地#${i}`, x: c.x, z: c.z }));
(config.altars ?? []).forEach((a) => keyPoints.push({ label: `祭坛${a.id}`, x: a.position.x, z: a.position.z }));
(config.wildlife ?? []).forEach((w, i) => keyPoints.push({ label: `野生#${i}`, x: w.x, z: w.z }));
(config.resourceZones ?? []).forEach((z2, i) => keyPoints.push({ label: `资源区#${i}(${z2.node})`, x: z2.x, z: z2.z }));
ISLAND_SPAWN_POINTS.forEach((p) => keyPoints.push({ label: `刷怪点${p.id}`, x: p.x, z: p.z }));
// 可招募单位不再在地图生成时摆出来（它们的来源是清点奖励），所以这里没有"招募点"这一类。
if (config.monsterCamp) keyPoints.push({ label: '怪物营地', x: config.monsterCamp.x, z: config.monsterCamp.z });

// ---- 1) 配置：两倍 + 平坦 ----

check('海岛配置开启了平坦地形', () => {
  assert.equal(config.sceneKey, 'island-survival');
  assert.equal(terrain.flat, true, 'terrain.flat 必须为 true，否则会走回起伏那条分支');
  assert.ok(Number.isFinite(terrain.baseHeight), 'baseHeight 必须是数值（平地的唯一高度）');
});

check('水平尺寸翻倍：地面网格、导航边界、主岛半径、相机最远距离', () => {
  assert.equal(config.ground.width, 400, '地面网格宽 200 → 400');
  assert.equal(config.ground.depth, 368, '地面网格深 184 → 368');
  assert.deepEqual(
    config.navigationBounds,
    { minX: -116, maxX: 116, minZ: -108, maxZ: 108 },
    '导航边界必须跟着翻倍，否则寻路与镜头仍然按旧范围裁剪'
  );
  assert.equal(config.landmass.lobes[0].rx, 92, '主岛半轴 46 → 92');
  assert.equal(config.landmass.lobes[0].rz, 80, '主岛半轴 40 → 80');
  assert.equal(config.camera?.maxDistance, 160, '相机最远 78 → 160（否则看不到放大后的岛）');
  assert.equal(config.camera?.distance, 57, '默认距离 28.7 → 57');
});

// ---- 2) 陆地逐点等高 ----

const navGrid = world.navGrid;
let minLand = Infinity;
let maxLand = -Infinity;
let landCells = 0;
// 平地判据的两个统计：精确等于 baseHeight 的格子数，以及水线边那一圈的最大偏差。
let exactFlatCells = 0;
let worstShoreRamp = 0;
let walkMinX = Infinity;
let walkMaxX = -Infinity;
let walkMinZ = Infinity;
let walkMaxZ = -Infinity;
for (let cz = 0; cz < navGrid.rows; cz += 1) {
  for (let cx = 0; cx < navGrid.cols; cx += 1) {
    if (!navGrid.isCellWalkable(cx, cz)) continue;
    const wx = navGrid.minX + (cx + 0.5) * navGrid.cellSize;
    const wz = navGrid.minZ + (cz + 0.5) * navGrid.cellSize;
    const h = world.heightAt(wx, wz);
    landCells += 1;
    if (h < minLand) minLand = h;
    if (h > maxLand) maxLand = h;
    if (Math.abs(h - terrain.baseHeight) <= 1e-9) {
      exactFlatCells += 1;
    } else {
      worstShoreRamp = Math.max(worstShoreRamp, terrain.baseHeight - h);
    }
    if (wx < walkMinX) walkMinX = wx;
    if (wx > walkMaxX) walkMaxX = wx;
    if (wz < walkMinZ) walkMinZ = wz;
    if (wz > walkMaxZ) walkMaxZ = wz;
  }
}

check('可走区域不是空的（扫到了陆地）', () => {
  assert.ok(landCells > 5000, `可走格数只有 ${landCells}，地形或导航网格可能整体坏了`);
});

check('陆地是平地：可走区域里没有任何可感知的坡度', () => {
  // 唯一允许不为 0 的地方是**水线边那一圈**：导航的可走阈值（掩码 0.5）与水线
  // （归一化距离 0.75）在格心采样下会错开不到一格，于是最外圈几百个格子里
  // 有几个拿到的是一段毫米级的过渡高度。那是海岸，不是丘陵。
  assert.ok(
    worstShoreRamp < 0.05,
    `水线边最大偏差 ${worstShoreRamp.toFixed(4)} 过大，说明还有真实起伏`
  );
  assert.ok(
    exactFlatCells / landCells > 0.95,
    `精确等高的格子只占 ${((exactFlatCells / landCells) * 100).toFixed(1)}%，陆地不是平的`
  );
  assert.ok(
    Math.abs(maxLand - terrain.baseHeight) <= 1e-9,
    `陆地最高点应精确等于 baseHeight ${terrain.baseHeight}，实际 ${maxLand}`
  );
});

check('内陆（离水线 10m 以上）逐点等高 —— 抽样的第二条独立证据', () => {
  // 注意别把海岸坡算进来：岛外缘有一条从 baseHeight 降到海床的过渡带，
  // 那是**海**不是"起伏"。所以这里只取"四周 10m 内都没有水面"的点。
  const off = [];
  let tested = 0;
  for (let x = -100; x <= 100; x += 5) {
    for (let z = -100; z <= 100; z += 5) {
      const h = world.heightAt(x, z);
      if (h <= 0.5) continue;
      let inland = true;
      for (let a = 0; a < 12 && inland; a += 1) {
        const angle = (a / 12) * Math.PI * 2;
        const hx = x + Math.cos(angle) * 10;
        const hz = z + Math.sin(angle) * 10;
        if (world.heightAt(hx, hz) <= waterHeight) inland = false;
      }
      if (!inland) continue;
      tested += 1;
      if (Math.abs(h - terrain.baseHeight) > 1e-9) off.push(`(${x},${z})=${h.toFixed(4)}`);
    }
  }
  assert.ok(tested > 300, `只测到 ${tested} 个内陆采样点，抽样窗口可能不对`);
  assert.equal(off.length, 0, `内陆出现非等高采样点：${off.slice(0, 5).join('、')}`);
});

check('海岸线之外仍然是海（下沉到水面以下）', () => {
  // 岛的水平半跨度约 100/94，所以 (±160, ±160) 一定在外海，且仍在 400×368 的网格内。
  [[0, 160], [0, -160], [160, 0], [-160, 0], [150, 150]].forEach(([x, z]) => {
    const h = world.heightAt(x, z);
    assert.ok(h < waterHeight - 1, `外海 (${x},${z}) 高度 ${h.toFixed(3)} 应明显低于水面 ${waterHeight}`);
  });
});

check('岛确实变大了：可走区域跨度约为原来的两倍', () => {
  const spanX = walkMaxX - walkMinX;
  const spanZ = walkMaxZ - walkMinZ;
  // 放大前海岸线约 ±51 / ±47（跨度约 102 / 94）。
  assert.ok(spanX > 170, `可走区域 x 跨度只有 ${spanX.toFixed(1)}，没有随着岛一起放大`);
  assert.ok(spanZ > 150, `可走区域 z 跨度只有 ${spanZ.toFixed(1)}，没有随着岛一起放大`);
  // 不能超出导航边界（否则寻路到不了边上的陆地）
  assert.ok(spanX <= 232 && spanZ <= 216, `可走区域超出导航边界：${spanX.toFixed(1)} × ${spanZ.toFixed(1)}`);
});

// ---- 3) 没有一个关键点掉进海里 ----

check(`全部 ${keyPoints.length} 个关键点都在水面之上（缩放没有把内容推进海里）`, () => {
  const drowned = keyPoints.filter((p) => world.heightAt(p.x, p.z) <= waterHeight + 0.05);
  assert.equal(
    drowned.length,
    0,
    `这些点落到水里了：${drowned.map((p) => `${p.label}(${p.x},${p.z})`).join('、')}`
  );
});

check('四个刷怪点落在干净的可走地面上（不压在资源节点里）', () => {
  const nodes = world.resourceNodes ?? [];
  const nearestNode = (x, z) => nodes.reduce(
    (best, node) => Math.min(best, Math.hypot((node.x ?? 0) - x, (node.z ?? 0) - z)),
    Infinity
  );
  const problems = [];
  ISLAND_SPAWN_POINTS.forEach((point) => {
    if (!world.isWalkable({ x: point.x, z: point.z })) {
      problems.push(`${point.id} 不可走`);
      return;
    }
    // 巢穴会长在这个点上，压在树上或矿脉上会显得像穿模，也会和节点争夺那块格子。
    const clearance = nearestNode(point.x, point.z);
    if (clearance < 4) problems.push(`${point.id} 离资源节点只有 ${clearance.toFixed(1)}m`);
  });
  assert.equal(problems.length, 0, problems.join('、'));
});

check('基地与敌营：中心是故意登记的寻路阻挡，但四周必须有可走地面', () => {
  // 这两个点自己登记了半径 2.25 / 2.65 的阻挡（建筑不能站进自己的地基里），
  // 所以"中心不可走"是**预期行为**，不能当成错误；真正要守的是四周能走、
  // 否则单位、傀儡、刷怪点生成的落点全都会被 resolveWalkablePoint 甩到很远的地方。
  const entries = [
    { label: '基地', ...config.playerBasePosition },
    { label: '敌营', ...config.enemyCampPosition }
  ];
  entries.forEach((entry) => {
    let reachable = 0;
    for (let a = 0; a < 32; a += 1) {
      const angle = (a / 32) * Math.PI * 2;
      for (const radius of [3, 4, 5]) {
        const x = entry.x + Math.cos(angle) * radius;
        const z = entry.z + Math.sin(angle) * radius;
        if (world.isWalkable({ x, z })) {
          reachable += 1;
          break;
        }
      }
    }
    assert.equal(reachable, 32, `${entry.label} 周围只有 ${reachable}/32 个方向可走`);
  });
});

check('资源区中心在水面之上，且紧邻就有可走地面', () => {
  // 资源区中心**允许**站着一个节点（节点本来就是在椭圆里撒的），
  // 所以这里不能要求"中心可走"；要守的是它没掉进海里、且旁边有地方站人。
  const problems = [];
  (config.resourceZones ?? []).forEach((zone) => {
    if (world.heightAt(zone.x, zone.z) <= waterHeight + 0.05) {
      problems.push(`${zone.node}(${zone.x},${zone.z}) 在水里`);
      return;
    }
    let free = false;
    for (const [dx, dz] of [[0, 0], [1, 1], [-1, -1], [2, 0], [0, 2], [-2, 0], [0, -2]]) {
      if (world.isWalkable({ x: zone.x + dx, z: zone.z + dz })) { free = true; break; }
    }
    if (!free) problems.push(`${zone.node}(${zone.x},${zone.z}) 附近没有可走地面`);
  });
  assert.equal(problems.length, 0, problems.join('、'));
});

// ---- 4) 密度是有意调过的，且没有失控 ----

check('资源节点总数恰好翻倍，并且有上限', () => {
  const total = (config.resourceZones ?? []).reduce((sum, zone) => sum + (zone.count ?? 0), 0);
  assert.equal(total, 282, `节点总数应为 141 的两倍（282），实际 ${total}`);
  assert.ok(total <= 320, `节点总数 ${total} 超出预算上限，放大后同屏网格与寻路阻挡会顶不住`);
});

// ---- 5) 平坦必须同时落在地形与着色器两处 ----

check('着色器里的顶点位移也随平坦地形关掉', () => {
  const source = readFileSync(new URL('../src/world/createWorld.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /const heightDisplacementChunk = \(storybookSnow \|\| flatTerrain\)/,
    '顶点位移必须在 flatTerrain 时也关掉：只改 CPU 高度会让画面仍然起伏，玩法与视觉对不上'
  );
  assert.match(
    source,
    /flatTerrain: config\.terrain\?\.flat === true/,
    'createGroundMaterial 必须把 terrain.flat 传给着色器开关'
  );
  assert.match(
    source,
    /if \(terrain\.flat === true\) \{/,
    'islandSurvivalHeightAt 必须有平坦分支（清空 hills/ridges 是不够的）'
  );
});

// ---- 6) 去掉旧玩法的地图装饰：通往敌营的路 + 小房子 ----

check('岛上不铺「基地→敌营」的路，也没有小房子装饰（本轮需求 4 / 5）', () => {
  // 用户原话：
  //   「地图上不应该有连接到敌营的道路，那是之前的玩法了」
  //   「地图上去掉小房子装饰物，令人疑惑，之后会添加真的可修缮的功能性建筑」
  //
  // 判据用**材质颜色**而不是网格名字：路面 ribbon 与 `createRock` 路标都没有名字，
  // 而小房子会被并进静态合批（世界坐标烤进几何），事后按名字或坐标都找不到。
  // 两个颜色都是各自唯一的用途：
  //   palette.path('#a98f66') —— 只被 buildPathRibbon 里 clone 出来的路面材质用到；
  //   '#baa58b'              —— 只在 placeLegacyPathDecor 里作为小屋墙色出现（全仓库仅此一处）。
  const pathColor = new THREE.Color(config.palette.path).getHexString();
  const cottageWall = 'baa58b';
  const found = { path: 0, cottage: 0 };
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!material?.color?.getHexString) return;
      const hex = material.color.getHexString();
      if (hex === pathColor) found.path += 1;
      if (hex === cottageWall) found.cottage += 1;
    });
  });
  assert.equal(config.paths, false, '海岛预设必须显式关掉路网（paths: false）');
  assert.deepEqual(config.legacyPathDecor, [], '海岛预设必须显式关掉旧关卡小屋（legacyPathDecor: []）');
  assert.equal(found.path, 0, `场景里还有 ${found.path} 个路面网格（颜色 #${pathColor}）`);
  assert.equal(found.cottage, 0, `场景里还有 ${found.cottage} 个小屋墙网格（颜色 #${cottageWall}）`);
  // pathPoints 必须**留着**：landmassMaskAt 的 roadReserve 与资源点让位都读它，
  // 删掉会改变可走区域并让 test-island-terrain 的关键点结论失效。
  assert.ok((config.pathPoints ?? []).length >= 2, 'pathPoints 必须保留（可走性与资源点让位依赖它）');
});

check('关掉路网后，沿路那圈「强制成陆」的可走区域没有被改变', () => {
  // paths: false 只关视觉路面，landmassMaskAt 仍然读 pathPoints。
  // 这条断言守的是"别哪天顺手把 pathPoints 也清了"——那会让路两侧的陆地一起消失。
  const source = readFileSync(new URL('../src/world/createWorld.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /const pathDistance = distanceToPath\(x, z, rawPathPoints\(\)\);/,
    'landmassMaskAt 必须继续用 pathPoints 算 roadReserve'
  );
  const walkableOnPath = config.pathPoints.every((point) => world.isWalkable({ x: point.x, z: point.z })
    || Math.hypot(point.x - config.playerBasePosition.x, point.z - config.playerBasePosition.z) < 3
    || Math.hypot(point.x - config.enemyCampPosition.x, point.z - config.enemyCampPosition.z) < 3);
  assert.equal(walkableOnPath, true, '主路沿线（基地/敌营地基除外）必须仍然可走');
});

console.log(report.join('\n'));
const failed = report.filter((line) => line.startsWith('FAIL')).length;
console.log(`\n海岛地形（放大一倍 + 平坦）：${report.length - failed}/${report.length} 通过`);
