// 威胁度二维数组的纯逻辑回归（用户本轮需求 1 的前半段）。
//
// 需求原文：「可以单独维护一个二维数组，覆盖场景，敌人判断自己位置并根据自己的
// 半径叠加威胁度在数组中。木傀儡就可以判断哪里危险。」
//
// 这四点如果只靠"在游戏里看傀儡跑不跑"，出错时根本分不清是数组写错了、
// 衰减算错了，还是逃跑落点选错了。所以这里逐项锁住：
//   覆盖范围 = 关卡边界；半径之外必须是 0；叠加是相加不是覆盖；
//   逃跑落点必须可走、必须更安全、必须在更近的环上。
import assert from 'node:assert/strict';
import {
  THREAT_BAND,
  THREAT_RULES,
  addThreatCircle,
  cellOfX,
  cellOfZ,
  chooseEscapeTarget,
  chooseFleeTarget,
  clearThreatField,
  createThreatField,
  threatAt,
  threatBandAt,
  threatBandFor,
  threatRatio
} from '../src/systems/threatField.js';

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

// 用一个小场地做断言：±20m、2m 一格 → 20×20 格、400 个 float。
const BOUNDS = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
const makeField = () => createThreatField(BOUNDS);
const round = (value) => Math.round(value * 1000) / 1000;

// 线性衰减的解析值：`amount * (1 - 距离/半径)`。
// 断言用解析值而不是"差不多"，因为坐标是精确落在格中心上的：
// 场地从 -20 起、格边长 2，所以 (-1,-1) 正好是一个格中心，离圆心 √2。
const expectAt = (amount, radius, distance) => amount * (1 - distance / radius);

check('数组覆盖整个关卡边界，格边长取自配置', () => {
  const field = makeField();
  assert.equal(field.cellSize, THREAT_RULES.cellSize);
  assert.equal(field.cols, 20);
  assert.equal(field.rows, 20);
  assert.equal(field.data.length, 400);
  // 边界内的极值点必须落在数组里（离线一格就是"漏了一块地图"）
  assert.equal(cellOfX(field, -20), 0);
  assert.equal(cellOfX(field, 19.999), 19);
  assert.equal(cellOfZ(field, -20), 0);
  assert.equal(cellOfZ(field, 19.999), 19);
  // 界外
  assert.equal(cellOfX(field, -20.001), -1);
  assert.equal(cellOfX(field, 20), 20);
});

check('新建的数组全是 0；越界读数返回 0', () => {
  const field = makeField();
  assert.ok(field.data.every((value) => value === 0));
  assert.equal(threatAt(field, 0, 0), 0);
  assert.equal(threatAt(field, 999, 0), 0);
  assert.equal(threatAt(field, 0, -999), 0);
});

check('叠加一个威胁圆：圆心最强、半径内线性衰减、半径外为 0', () => {
  const field = makeField();
  const writes = addThreatCircle(field, 0, 0, 8, 10);
  assert.ok(writes > 0, '必须真的写进格子');
  // 离圆心最近的格中心是 (-1,-1)（距离 √2），不是圆心本身——
  // 所以"圆心强度"要用解析值比，不能直接拿 amount 比。
  const center = threatAt(field, -1, -1);
  assert.ok(
    Math.abs(center - expectAt(10, 8, Math.SQRT2)) < 1e-4,
    `圆心最近格必须等于解析值，实得 ${center}`
  );
  const half = threatAt(field, -5, -1);
  assert.ok(half > 3 && half < 6, `半半径处约一半强度，实得 ${half}`);
  assert.equal(threatAt(field, 9, 9), 0, '半径外必须是 0');
  // peak 必须等于数组里的真实最大值，不能是"写进去的 amount"
  const max = field.data.reduce((best, value) => Math.max(best, value), 0);
  assert.equal(round(field.peak), round(max));
  assert.ok(field.peak <= 10, '峰值不可能超过强度本身');
});

check('两个威胁圆是相加而不是后者覆盖前者', () => {
  const single = makeField();
  addThreatCircle(single, 0, 0, 8, 10);
  const before = threatAt(single, -1, -1);
  addThreatCircle(single, 0, 0, 8, 6);
  const after = threatAt(single, -1, -1);
  const expected = before + expectAt(6, 8, Math.SQRT2);
  assert.ok(Math.abs(after - expected) < 1e-4, `叠加应等于 ${expected}，实得 ${after}`);
});

check('两个不同的圆心各自贡献，重叠处更高', () => {
  const field = makeField();
  addThreatCircle(field, -6, 0, 8, 10);
  addThreatCircle(field, 6, 0, 8, 10);
  const left = threatAt(field, -6, 0);
  const middle = threatAt(field, 0, 0);
  assert.ok(middle > 0 && middle > left * 0.5);
});

check('清空之后必须一点残留都没有（每帧清空后重写的语义）', () => {
  const field = makeField();
  addThreatCircle(field, 0, 0, 8, 10);
  addThreatCircle(field, 5, 5, 6, 4);
  clearThreatField(field);
  assert.ok(field.data.every((value) => value === 0));
  assert.equal(field.peak, 0);
  assert.equal(field.written, 0);
  assert.equal(threatAt(field, -1, -1), 0);
});

check('强度或半径非正时不写入，避免出现"看不见的威胁"', () => {
  const field = makeField();
  assert.equal(addThreatCircle(field, 0, 0, 8, 0), 0);
  assert.equal(addThreatCircle(field, 0, 0, 0, 5), 0);
  assert.equal(addThreatCircle(field, 0, 0, -3, 5), 0);
  assert.ok(field.data.every((value) => value === 0));
});

check('半径贴到地图边界时不会越界写坏数组', () => {
  const field = makeField();
  addThreatCircle(field, -19.5, -19.5, 12, 8);
  addThreatCircle(field, 19.5, 19.5, 12, 8);
  assert.equal(field.data.length, 400);
  assert.ok(field.data.every((value) => Number.isFinite(value) && value >= 0));
});

check('归一化与色带：相对这一帧的峰值分档', () => {
  const field = makeField();
  addThreatCircle(field, 0, 0, 8, 10);
  const peak = field.peak;
  assert.ok(threatRatio(field, -1, -1, peak) > 0.9);
  assert.equal(threatRatio(field, 19, 19, peak), 0);
  assert.equal(threatBandFor(0, peak), THREAT_BAND.none);
  assert.equal(threatBandFor(peak * 0.1, peak), THREAT_BAND.low);
  assert.equal(threatBandFor(peak * 0.4, peak), THREAT_BAND.medium);
  assert.equal(threatBandFor(peak * 0.6, peak), THREAT_BAND.high);
  assert.equal(threatBandFor(peak, peak), THREAT_BAND.extreme);
  assert.equal(threatBandAt(field, 19, 19), THREAT_BAND.none);
});

check('逃跑落点：在所有环里取**威胁最小**的那个方向，而不是最近那一环', () => {
  // 用户原话：「逃跑要朝威胁小的方向跑」。
  // 早先的写法是"找到第一个有安全格的环就停"，于是"左边 3m 处威胁 6"会胜过
  // "右边 9m 处威胁 0"，傀儡贴着威胁边缘横着挪而不是真的跑开。
  const field = makeField();
  // 威胁只压在正东（右侧）：越往西越安全
  addThreatCircle(field, 12, 0, 14, 10);
  // 只允许东西两个方向可走，排除掉"从北边绕过去威胁更小"这种干扰
  const walkable = (x, z) => Math.abs(z) < 0.6 || Math.abs(x) > 100;
  const target = chooseFleeTarget(field, { x: -2, z: 0 }, {
    isWalkable: walkable,
    hasLine: () => true
  });
  assert.ok(target, '必须找到落点');
  assert.ok(target.x < -2, `必须朝威胁更小的西侧逃，实得 x=${target.x}`);
  // 西侧同一方向上，远处的威胁必须比近处低，且选中的是全局最小
  const nearWest = threatAt(field, -4, 0);
  const farWest = threatAt(field, target.x, target.z);
  assert.ok(farWest <= nearWest + 1e-6, `选中方向必须是威胁最小：near=${nearWest} chosen=${farWest}`);
});

check('逃跑落点：有直线可达的落点时优先它（不容易卡在墙角）', () => {
  const field = makeField();
  addThreatCircle(field, 12, 0, 14, 10);
  const walkable = (x, z) => Math.abs(z) < 0.6 || Math.abs(x) > 100;
  // 让"正西"没有直线（模拟被墙挡住），但其它方向有
  const blockedLine = (from, to) => to.x < from.x - 6 && Math.abs(to.z) < 0.5 ? false : true;
  const pick = chooseFleeTarget(field, { x: -2, z: 0 }, {
    isWalkable: walkable,
    hasLine: blockedLine
  });
  assert.ok(pick, '必须仍然给出落点');
  assert.equal(pick.hasLine, true, '优先选有直线的落点');
  assert.ok(!(pick.x < -8 && Math.abs(pick.z) < 0.5), '不该选那个没直线的方向');
});

check('逃跑落点：所有方向都没直线时仍要给出可走的落点（交给寻路绕）', () => {
  // 这是"撞墙卡死"那条需求的关键兜底：如果一条直线都没有就返回 null，
  // 傀儡就会原地不动等着被咬死，而它其实完全可以绕过去。
  const field = makeField();
  addThreatCircle(field, 12, 0, 14, 10);
  const target = chooseFleeTarget(field, { x: -2, z: 0 }, {
    isWalkable: (x) => x <= 0,
    hasLine: () => false
  });
  assert.ok(target, '没有直线也必须给出可走的落点');
  assert.equal(target.hasLine, false);
  assert.ok(threatAt(field, target.x, target.z) < threatAt(field, -2, 0), '落点仍必须更安全');
});


check('逃跑落点：必须更安全、必须可走，且不超出搜索范围', () => {
  const field = makeField();
  // 圆心放在 (0,0)，半径 8：站在圆心的傀儡必须往外跑
  addThreatCircle(field, 0, 0, 8, 10);
  const blocked = new Set();
  const walkable = (x, z) => Math.abs(x) <= 20 && Math.abs(z) <= 20 && !blocked.has(`${Math.round(x)},${Math.round(z)}`);
  const target = chooseFleeTarget(field, { x: -1, z: -1 }, { isWalkable: walkable });
  assert.ok(target, '必须找到一个落点');
  assert.equal(walkable(target.x, target.z), true, '落点必须可走');
  assert.ok(
    threatAt(field, target.x, target.z) < threatAt(field, -1, -1),
    '落点必须比原地安全'
  );
  assert.ok(target.distance <= field.cellSize * 1.5 * THREAT_RULES.fleeRings + 1e-6, '不该跑到搜索范围之外');
});

check('逃跑落点：所有格都不可走时返回 null（调用方原地不动，不要乱跑）', () => {
  const field = makeField();
  addThreatCircle(field, 0, 0, 8, 10);
  assert.equal(chooseFleeTarget(field, { x: -1, z: -1 }, { isWalkable: () => false }), null);
});

check('逃跑落点：本来就安全的地方不动（不产生无意义的抖动）', () => {
  const field = makeField();
  // 威胁在很远的角落，傀儡站在 (14,14) 这种完全没受影响的格子上
  addThreatCircle(field, -18, -18, 4, 10);
  const target = chooseFleeTarget(field, { x: 14, z: 14 }, { isWalkable: () => true });
  assert.equal(target, null);
});

check('逃跑落点：避开被堵住的那一侧，选可走的另一侧', () => {
  const field = makeField();
  addThreatCircle(field, 0, 0, 8, 10);
  // 只允许 x >= 0 的一侧可走（也就是只能往东逃）
  const walkable = (x) => x >= 0;
  const target = chooseFleeTarget(field, { x: -1, z: -1 }, { isWalkable: walkable });
  assert.ok(target, '东侧必须能找到落点');
  assert.ok(target.x >= 0, `落点必须落在可走的东侧，实得 x=${target.x}`);
});

check('同一输入永远得到同一落点（傀儡不会在两个点之间来回横跳）', () => {
  const field = makeField();
  addThreatCircle(field, 0, 0, 8, 10);
  const first = chooseFleeTarget(field, { x: -1, z: -1 }, { isWalkable: () => true });
  for (let i = 0; i < 20; i += 1) {
    assert.deepEqual(chooseFleeTarget(field, { x: -1, z: -1 }, { isWalkable: () => true }), first);
  }
});

// ---------------------------------------------------------------- 逃命落点
// 与 `chooseFleeTarget`（按威胁值排）的分工见函数注释：一个是"这一片哪里威胁最低"，
// 一个是"怎么才能真的甩掉它"。威胁值在威胁圈外一律是 0，排不出"3 米外"和"14 米外"，
// 而用户报的「互相拉扯」正是"退两格就判跑掉了"。所以这里逐条锁死"按离追兵的距离排"。
check('逃命落点：在追兵的另一侧、且尽量远（按离追兵的距离排，不是按威胁值排）', () => {
  const field = makeField();
  const pursuer = { x: 0, z: 0, radius: 6 };
  addThreatCircle(field, pursuer.x, pursuer.z, pursuer.radius, 10);
  const me = { x: 1, z: 0 };
  const target = chooseEscapeTarget(field, me, [pursuer], {
    reach: 16,
    rings: 4,
    isWalkable: () => true
  });
  assert.ok(target, '必须给出一个逃命落点');
  const here = Math.hypot(pursuer.x - me.x, pursuer.z - me.z);
  const there = Math.hypot(pursuer.x - target.x, pursuer.z - target.z);
  assert.ok(there > here, `落点必须离追兵更远：${there} 应大于 ${here}`);
  assert.ok(target.x > 0, '应当在背离追兵的那一侧（+x）');
  assert.ok(target.clearance >= there - 1e-9, 'clearance 就是离最近追兵的距离');
});

check('逃命落点：追兵不止一只时，按"离最近那只的距离"排', () => {
  const field = makeField();
  const me = { x: 0, z: 0 };
  // 西边一只近的（3m）、东边一只远的（6m）：往东会撞上东边那只，
  // 所以最优方向是**垂直于两只连线的两侧**（那里离最近的一只最远）。
  const west = { x: -3, z: 0, radius: 4 };
  const east = { x: 6, z: 0, radius: 4 };
  addThreatCircle(field, west.x, west.z, west.radius, 10);
  addThreatCircle(field, east.x, east.z, east.radius, 10);
  const target = chooseEscapeTarget(field, me, [west, east], {
    reach: 16,
    rings: 4,
    isWalkable: () => true
  });
  assert.ok(target, '必须给出落点');
  const clearanceOf = (point) => Math.min(
    Math.hypot(point.x - west.x, point.z - west.z),
    Math.hypot(point.x - east.x, point.z - east.z)
  );
  assert.ok(
    Math.abs(target.z) > Math.abs(target.x),
    `应当沿垂直于两只追兵的方向逃，实得 (${round(target.x)}, ${round(target.z)})`
  );
  // 而且必须是"能拉开的最大距离"那一档：垂直方向 16m 处离最近一只有 ≈16.3
  assert.ok(
    clearanceOf(target) > 15,
    `必须挑离最近追兵最远的落点，实得 clearance=${round(clearanceOf(target))}`
  );
});

check('逃命落点：拉开不了距离时返回 null（交给"退无可退"那一条接手）', () => {
  const field = makeField();
  const me = { x: 0, z: 0 };
  // 追兵贴在身边，而所有方向都不可走：没有能拉开距离的落点
  const pursuer = { x: 1, z: 0, radius: 6 };
  addThreatCircle(field, pursuer.x, pursuer.z, pursuer.radius, 10);
  assert.equal(
    chooseEscapeTarget(field, me, [pursuer], { reach: 16, rings: 4, isWalkable: () => false }),
    null
  );
});

check('逃命落点的可达性：有直线可达的优先（不容易卡在墙角）', () => {
  const field = makeField();
  const me = { x: 0, z: 0 };
  const pursuer = { x: 0, z: 0, radius: 6 };
  addThreatCircle(field, pursuer.x, pursuer.z, pursuer.radius, 10);
  const target = chooseEscapeTarget(field, me, [pursuer], {
    reach: 16,
    rings: 4,
    isWalkable: () => true,
    // 只有 +x 半轴有直线可达
    hasLine: (_from, to) => to.x > 0
  });
  assert.ok(target, '必须给出落点');
  assert.equal(target.hasLine, true);
  assert.ok(target.x > 0, '必须选有直线的那一侧');
});

check('没有追兵时不乱跑（clearance 是 Infinity，退化为"选最近的可走点"）', () => {
  const field = makeField();
  const target = chooseEscapeTarget(field, { x: 0, z: 0 }, [], {
    reach: 16,
    rings: 4,
    isWalkable: () => true
  });
  assert.ok(target, '没有追兵时也要给出落点（调用方只在逃跑阶段才用它）');
  assert.equal(target.clearance, Number.POSITIVE_INFINITY);
});

check('兜底逃跑步长的默认值存在（曾经是 undefined 导致落点算成 NaN）', () => {
  // `retreatAwayFromThreat` 在没有 stepSize 时读 `rules.fleeDistance`：
  // 这个键一度不存在，于是 `Number(undefined) * 2 || undefined` → undefined → 落点 NaN。
  assert.ok(Number.isFinite(THREAT_RULES.fleeDistance) && THREAT_RULES.fleeDistance > 0);
});

console.log(report.join('\n'));
console.log(process.exitCode ? '\nTHREAT FIELD: FAIL' : '\nTHREAT FIELD: PASS');
