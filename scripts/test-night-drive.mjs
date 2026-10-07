// 夜袭驱动：内圈按夜数加兵，外圈等对应内圈被拆掉才出兵，目标句只谈倒计时和最近缺口。
import assert from 'node:assert/strict';
import { BALANCE, ISLAND_SPAWN_POINTS } from '../src/data/gameData.js';
import { nightRaidModifiers } from '../src/systems/dayNight.js';
import { normalizeSpawnPoints, planSpawns } from '../src/systems/spawnPoints.js';
import { islandContains, islandOuterSpawnPoints } from '../src/systems/survivalExpansion.js';
import { nearestSpawningNest, survivalObjectiveText } from '../src/systems/fieldCamps.js';

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

const BASE = { x: 4, z: 40 };
const GATE = {
  'island-outer-north': 'island-camp-north',
  'island-outer-east': 'island-east-cape',
  'island-outer-northwest': 'island-west-ridge',
  'island-outer-southwest': 'island-south-woods'
};

check('海岛夜袭从第 2 夜加存活，每 3 夜多一批，默认规则不加人数', () => {
  const rules = BALANCE.world.dayNight;
  assert.equal(rules.extraAlivePerNight, 1);
  assert.equal(rules.extraPerTickEveryNights, 3);
  assert.equal(nightRaidModifiers(1, rules).extraAlive, 0);
  assert.equal(nightRaidModifiers(2, rules).extraAlive, 1);
  assert.equal(nightRaidModifiers(2, rules).extraPerTick, 0);
  assert.equal(nightRaidModifiers(4, rules).extraAlive, 3);
  assert.equal(nightRaidModifiers(4, rules).extraPerTick, 1);
  assert.equal(nightRaidModifiers(2).extraAlive, 0);
  assert.equal(nightRaidModifiers(2).extraPerTick, 0);
});

check('内圈有存活上限和通往基地的夜袭锚点，外圈挂在对应内圈上', () => {
  assert.equal(ISLAND_SPAWN_POINTS.length, 4);
  ISLAND_SPAWN_POINTS.forEach((point) => {
    assert.equal(point.maxAlive, 2, point.id);
    // 锚点只是敌军内部路线：有坐标、在岛上、位于巢穴与基地之间。
    // 它不再是"玩家的箭塔位"——没有 building、没有 built、没有吸附。
    assert.deepEqual(Object.keys(point.raidRally).sort(), ['x', 'z'], point.id);
    assert.equal(point.defenseSlot, undefined, `${point.id} 不该再有防守位字段`);
    assert.equal(islandContains(point.raidRally.x, point.raidRally.z), true, point.id);
    const nestDist = Math.hypot(point.x - BASE.x, point.z - BASE.z);
    const rallyDist = Math.hypot(point.raidRally.x - BASE.x, point.raidRally.z - BASE.z);
    assert.ok(rallyDist < nestDist, `${point.id} 夜袭锚点不在巢穴和基地之间`);
  });
  const outer = islandOuterSpawnPoints();
  assert.equal(outer.length, 4);
  outer.forEach((point) => {
    assert.equal(point.maxAlive, 2, point.id);
    assert.equal(point.gateNestId, GATE[point.id], point.id);
    assert.equal(islandContains(point.raidRally.x, point.raidRally.z), true, point.id);
  });
});

check('外圈在对应内圈被拆掉之前不出兵', () => {
  const points = normalizeSpawnPoints([...ISLAND_SPAWN_POINTS, ...islandOuterSpawnPoints()]);
  points.forEach((point) => { point.timer = 0; });
  const cleared = new Set();
  const allow = (point) => !point.gateNestId || cleared.has(point.gateNestId);
  const blocked = planSpawns(points, { dt: 1, allowSpawn: true, pointAllowed: allow });
  blocked.filter((result) => result.id.startsWith('island-outer')).forEach((result) => {
    assert.equal(result.spawnCount, 0, result.id);
  });
  assert.ok(blocked.find((result) => result.id === 'island-camp-north').spawnCount >= 1);
  cleared.add('island-camp-north');
  const opened = planSpawns(points, { dt: 0.05, allowSpawn: true, pointAllowed: allow });
  assert.ok(opened.find((result) => result.id === 'island-outer-north').spawnCount >= 1);
  opened.filter((result) => result.id.startsWith('island-outer') && result.id !== 'island-outer-north').forEach((result) => {
    assert.equal(result.spawnCount, 0, result.id);
  });
});

check('最近出兵的是没被封印的北岬，目标句按供养链往下说', () => {
  const nests = [
    ...ISLAND_SPAWN_POINTS.map((point) => ({ ...point })),
    ...islandOuterSpawnPoints().map((point) => ({ ...point }))
  ];
  const nearest = nearestSpawningNest(nests, BASE.x, BASE.z);
  assert.equal(nearest.id, 'island-camp-north');
  const opening = survivalObjectiveText({
    secondsRemaining: 240,
    nests,
    baseX: BASE.x,
    baseZ: BASE.z
  });
  assert.match(opening, /离入夜还有 4:00/);
  // 防线缺口只说"还没有防御塔"，不再把它绑到某一座巢穴的预设塔位。
  assert.match(opening, /先造防御塔/);
  assert.match(opening, /熔炉/);
  assert.doesNotMatch(opening, /与门/);
  const fueled = survivalObjectiveText({
    secondsRemaining: 120,
    nests,
    baseX: BASE.x,
    baseZ: BASE.z,
    hasFurnace: true,
    hasManaFurnace: true,
    manaFurnaceFueled: true,
    hasDefenseTower: true,
    transportLinkCount: 1
  });
  assert.match(fueled, /去拆北岬巢穴/);
  assert.doesNotMatch(fueled, /与门/);
  const gated = survivalObjectiveText({
    secondsRemaining: 120,
    nests,
    baseX: BASE.x,
    baseZ: BASE.z,
    hasFurnace: true,
    hasManaFurnace: true,
    manaFurnaceFueled: true,
    hasDefenseTower: true,
    transportLinkCount: 2
  });
  assert.match(gated, /与门/);
  assert.match(gated, /停掉继续送木炭/);
  const brownout = survivalObjectiveText({
    secondsRemaining: 30,
    isNight: true,
    nests,
    baseX: BASE.x,
    baseZ: BASE.z,
    hasFurnace: true,
    hasManaFurnace: true,
    manaFurnaceFueled: false,
    hasDefenseTower: true,
    towerPoweredDown: true
  });
  assert.match(brownout, /停火/);
  assert.match(brownout, /木炭/);
});

console.log(report.join('\n'));
if (process.exitCode) process.exit(process.exitCode);
console.log(`\n夜袭驱动：${report.length}/${report.length} 通过`);
