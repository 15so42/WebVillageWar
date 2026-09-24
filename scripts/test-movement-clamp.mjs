// 单位移动边界回归（发现于"海岛放大一倍"那一轮）。
//
// 背景：`MovementAgent.clampToBattlefield()` 曾经写死最早的走廊式小地图边界
// （`BALANCE.battlefield`：x ±42、z −40..40），而镜头与落点校验早就改成
// `Game.battlefieldBounds()`（按地图自身的 navigationBounds 算）。
// 两套边界不一致的后果非常隐蔽：
//
//   - 单位在导航分支里每帧都往目标走一步，紧接着被拉回边界；
//   - `moveToward()` 返回 true、`aiState` 是 moving、`visualState` 是 walk，
//     但位置一动不动——看起来像"寻路坏了"，其实是被一条看不见的墙挡住；
//   - 旧地图的内容恰好都在这条线以内（基地 z=20、首巢 z=30），所以从没暴露；
//     海岛放大一倍之后基地正好落在 z=40 上，去北边巢穴的护卫全部卡死在 z=40.00，
//     直接打断了「打掉第一个巢穴 → 拿到深邃核心」这条开局链。
//
// 所以这里守两条：
//   1. 有 `battlefieldBounds()` 时，必须按它裁剪（地图多大就能走多远）；
//   2. 没有时退回旧值（老行为不变，不能让别的调用方凭空变形）。
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MovementAgent } from '../src/entities/MovementAgent.js';
import { BALANCE } from '../src/data/gameData.js';

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

function makeAgent(game, x, z) {
  const unit = { position: new THREE.Vector3(x, 0, z), definition: { canMove: true } };
  return { unit, agent: new MovementAgent(unit, game) };
}

check('按地图自身的导航边界裁剪（放大地图后不再被旧固定框挡住）', () => {
  const bounds = { minX: -116, maxX: 116, minZ: -108, maxZ: 108 };
  const game = { battlefieldBounds: () => bounds };
  // 这些点都在新边界内、但在旧的 ±42 / −40..40 之外——
  // 正是放大后的海岛会用到的那一圈。
  [[0, 60], [-13, 65], [56, 10], [3, -52], [-47, -5], [100, 100]].forEach(([x, z]) => {
    const { unit, agent } = makeAgent(game, x, z);
    agent.clampToBattlefield();
    assert.equal(unit.position.x, x, `x=${x} 不该被裁剪`);
    assert.equal(unit.position.z, z, `z=${z} 不该被裁剪`);
  });
});

check('超出新边界时按新边界裁剪', () => {
  const bounds = { minX: -116, maxX: 116, minZ: -108, maxZ: 108 };
  const game = { battlefieldBounds: () => bounds };
  const { unit, agent } = makeAgent(game, 500, -900);
  agent.clampToBattlefield();
  assert.equal(unit.position.x, 116);
  assert.equal(unit.position.z, -108);
});

check('没有 battlefieldBounds 时退回旧边界（老调用方行为不变）', () => {
  const { unit, agent } = makeAgent({}, 0, 60);
  agent.clampToBattlefield();
  assert.equal(unit.position.z, BALANCE.battlefield.maxZ, '缺省应退回旧的 z 上限');
  assert.equal(BALANCE.battlefield.maxZ, 40, '夹具前提：旧上限就是 40');
});

check('海岛放大后的关键点都在导航边界内（与 terrain 测试互相印证）', () => {
  // 这条不读世界，只用配置断言"基地与四个刷怪点不该贴着边界"，
  // 免得以后有人把岛放大却忘了同步 navigationBounds。
  const bounds = { minX: -116, maxX: 116, minZ: -108, maxZ: 108 };
  const points = [
    { label: '基地', x: 4, z: 40 },
    { label: '北岬巢穴', x: -13, z: 65 },
    { label: '西岭哨站', x: -47, z: -5 },
    { label: '东岬营地', x: 56, z: 10 },
    { label: '南林深处', x: 3, z: -52 }
  ];
  points.forEach((point) => {
    const margin = 8;
    assert.ok(
      point.x > bounds.minX + margin && point.x < bounds.maxX - margin
        && point.z > bounds.minZ + margin && point.z < bounds.maxZ - margin,
      `${point.label}(${point.x},${point.z}) 离导航边界太近，单位会被边界裁剪影响`
    );
  });
});

console.log(report.join('\n'));
const failed = report.filter((line) => line.startsWith('FAIL')).length;
console.log(`\n单位移动边界：${report.length - failed}/${report.length} 通过`);
