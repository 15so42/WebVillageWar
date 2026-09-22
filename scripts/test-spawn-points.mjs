// 刷怪点回归测试。
// 计划第 6 节明确：移除波次不等于每帧无上限生成。这里锁住三条：
//   1. 摧毁是永久的——清掉的点再也不会产怪，且不需要额外标记
//   2. 有存活上限与生成间隔，冷却到点也不会一口气补齐历史欠账
//   3. 全部清除才判胜利，进度算得出来
import assert from 'node:assert/strict';
import {
  SPAWN_BLOCK_REASON,
  SPAWN_POINT_STATE,
  advanceSpawnPoint,
  clearSpawnPoint,
  clearedProgress,
  normalizeSpawnPoint,
  normalizeSpawnPoints,
  planSpawns,
  spawnBlockReason,
  spawnPointRules,
  spawnPointState
} from '../src/systems/spawnPoints.js';

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

function makePoint(overrides = {}) {
  return normalizeSpawnPoint({ id: 'sp-0', x: 10, z: -4, intervalSeconds: 10, maxAlive: 3, ...overrides }, 0);
}

check('缺字段的配置会被补成可用默认值，不会出现 undefined 参与计算', () => {
  const point = normalizeSpawnPoint({}, 7);
  assert.equal(point.id, 'spawn-7');
  assert.equal(point.x, 0);
  assert.ok(point.intervalSeconds > 0);
  assert.ok(point.maxAlive >= 1);
  assert.ok(point.timer >= 0, '首次生成要有初始延迟，不能刚进关就贴脸刷怪');
  assert.deepEqual(point.enemyPool, []);
});

check('生成间隔有下限，防止被配成 0 导致每帧刷怪', () => {
  const rules = spawnPointRules();
  const point = normalizeSpawnPoint({ intervalSeconds: 0 }, 0, rules);
  assert.equal(point.intervalSeconds, rules.minimumIntervalSeconds);
});

check('冷却未到不生怪，到点后一次最多生 maxPerTick 个', () => {
  const point = makePoint({ maxPerTick: 2, intervalSeconds: 10 });
  point.timer = 0;
  const first = advanceSpawnPoint(point, { dt: 0.05, aliveCount: 0 });
  assert.equal(first.spawnCount, 2, '一次最多补 maxPerTick，而不是把欠的账一次性补齐');
  // 刚生完进入冷却
  const during = advanceSpawnPoint(point, { dt: 1, aliveCount: 2 });
  assert.equal(during.spawnCount, 0);
  assert.equal(during.reason, SPAWN_BLOCK_REASON.coolingDown);
});

check('存活数达到上限就不再生成，且不会靠重置计时器「杀一个补一个」', () => {
  const point = makePoint({ maxAlive: 3 });
  point.timer = 0;
  const full = advanceSpawnPoint(point, { dt: 5, aliveCount: 3 });
  assert.equal(full.spawnCount, 0);
  assert.equal(full.reason, SPAWN_BLOCK_REASON.atCapacity);
  // 满员期间计时器不应被重置成间隔值，否则一死就立刻补位
  assert.equal(point.timer, 0);

  // 死掉一个之后才允许再生成
  const room = advanceSpawnPoint(point, { dt: 0.05, aliveCount: 2 });
  assert.equal(room.spawnCount, 1);
});

check('摧毁是永久的：清掉之后无论过多久、死多少人都不再产怪', () => {
  const point = makePoint();
  assert.equal(spawnPointState(point), SPAWN_POINT_STATE.active);
  assert.equal(clearSpawnPoint(point), true);
  assert.equal(clearSpawnPoint(point), false, '重复摧毁不该重复计数');
  assert.equal(spawnPointState(point), SPAWN_POINT_STATE.cleared);

  for (let i = 0; i < 50; i += 1) {
    const result = advanceSpawnPoint(point, { dt: 10, aliveCount: 0 });
    assert.equal(result.spawnCount, 0, '已摧毁的点不能再产怪');
    assert.equal(result.reason, SPAWN_BLOCK_REASON.cleared);
  }
});

check('阻断原因的判定顺序固定，原因唯一', () => {
  const point = makePoint({ maxAlive: 2 });
  point.cleared = true;
  // 同时满足「已摧毁」和「满员」时，报的是已摧毁
  assert.equal(spawnBlockReason(point, 99), SPAWN_BLOCK_REASON.cleared);
  point.cleared = false;
  point.timer = 5;
  assert.equal(spawnBlockReason(point, 99), SPAWN_BLOCK_REASON.atCapacity);
  assert.equal(spawnBlockReason(point, 0), SPAWN_BLOCK_REASON.coolingDown);
  point.timer = 0;
  assert.equal(spawnBlockReason(point, 0), SPAWN_BLOCK_REASON.none);
});

check('批量推进不会让某个点超产', () => {
  const points = normalizeSpawnPoints([
    { id: 'a', intervalSeconds: 5, maxAlive: 2, maxPerTick: 1 },
    { id: 'b', intervalSeconds: 5, maxAlive: 4, maxPerTick: 3 }
  ]);
  points.forEach((point) => { point.timer = 0; });
  const results = planSpawns(points, { dt: 0.05, aliveByPoint: { a: 1, b: 4 } });
  const byId = Object.fromEntries(results.map((entry) => [entry.id, entry]));
  assert.equal(byId.a.spawnCount, 1);
  assert.equal(byId.b.spawnCount, 0, 'b 已满员');
  assert.equal(byId.b.reason, SPAWN_BLOCK_REASON.atCapacity);
  assert.ok(byId.b.reasonLabel.length > 0, '阻断原因要有人话文案，便于 HUD 显示');
});

check('长时间运行不会无限堆怪（存活数始终受上限约束）', () => {
  const point = makePoint({ maxAlive: 3, maxPerTick: 2, intervalSeconds: 4 });
  point.timer = 0;
  let alive = 0;
  let totalSpawned = 0;
  // 3 分钟，全程不击杀
  for (let i = 0; i < 3600; i += 1) {
    const result = advanceSpawnPoint(point, { dt: 0.05, aliveCount: alive });
    alive += result.spawnCount;
    totalSpawned += result.spawnCount;
    assert.ok(alive <= point.maxAlive, `第 ${i} 帧存活数 ${alive} 超过上限`);
  }
  assert.equal(alive, 3, '不击杀时应当停在存活上限');
  assert.equal(totalSpawned, 3, '到上限后不该继续生成');
});

check('清除进度算得对，且必须全部清除才算完成', () => {
  const points = normalizeSpawnPoints([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  assert.equal(clearedProgress(points).ratio, 0);
  assert.equal(clearedProgress(points).allCleared, false);
  clearSpawnPoint(points[0]);
  const half = clearedProgress(points);
  assert.equal(half.cleared, 1);
  assert.equal(half.remaining, 2);
  assert.ok(Math.abs(half.ratio - 1 / 3) < 1e-9);
  clearSpawnPoint(points[1]);
  clearSpawnPoint(points[2]);
  assert.equal(clearedProgress(points).allCleared, true);
  assert.equal(clearedProgress(points).ratio, 1);
  // 没有刷怪点的地图不该被判成「已通关」
  assert.equal(clearedProgress([]).allCleared, false);
});

check('每个点可以有自己的节奏，不被全局默认抹平', () => {
  const points = normalizeSpawnPoints([
    { id: 'slow', intervalSeconds: 30, maxAlive: 8 },
    { id: 'fast', intervalSeconds: 5, maxAlive: 2 }
  ]);
  assert.equal(points[0].intervalSeconds, 30);
  assert.equal(points[1].intervalSeconds, 5);
  assert.equal(points[0].maxAlive, 8);
  assert.equal(points[1].maxAlive, 2);
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
