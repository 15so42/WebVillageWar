import assert from 'node:assert/strict';
import {
  DAY_NIGHT_PHASE,
  DAY_NIGHT_RULES,
  advanceDayNight,
  canRaidSpawn,
  createDayNightState,
  dayNightRules,
  nightBlend,
  nightRaidModifiers,
  phaseRemaining,
  skipToPhase
} from '../src/systems/dayNight.js';
import {
  SPAWN_BLOCK_REASON,
  advanceSpawnPoint,
  normalizeSpawnPoint
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

check('默认一天是白天 5 分钟 + 黑夜 3 分钟', () => {
  const rules = dayNightRules();
  assert.equal(rules.daySeconds, 300);
  assert.equal(rules.nightSeconds, 180);
});

check('开局是第 1 天白天，不能夜袭出兵', () => {
  const state = createDayNightState();
  assert.equal(state.dayNumber, 1);
  assert.equal(state.phase, DAY_NIGHT_PHASE.day);
  assert.equal(canRaidSpawn(state), false);
  assert.equal(phaseRemaining(state), 300);
});

check('白天走完进入黑夜，天数不变', () => {
  const state = createDayNightState();
  advanceDayNight(state, 299);
  assert.equal(state.phase, DAY_NIGHT_PHASE.day);
  const snap = advanceDayNight(state, 2);
  assert.equal(snap.phase, DAY_NIGHT_PHASE.night);
  assert.equal(snap.dayNumber, 1);
  assert.equal(snap.justChanged, true);
  assert.equal(canRaidSpawn(state), true);
  assert.ok(snap.phaseRemaining <= 180);
});

check('黑夜走完进入第 2 天白天', () => {
  const state = createDayNightState();
  skipToPhase(state, DAY_NIGHT_PHASE.night, { dayNumber: 1 });
  const snap = advanceDayNight(state, 180.4);
  assert.equal(snap.phase, DAY_NIGHT_PHASE.day);
  assert.equal(snap.dayNumber, 2);
  assert.equal(canRaidSpawn(state), false);
});

check('第 1 夜按原配置，之后每晚多 1 个存活上限、难度递增', () => {
  const first = nightRaidModifiers(1);
  assert.equal(first.extraAlive, 0);
  assert.equal(first.extraPerTick, 0);
  assert.equal(first.difficulty, 1);
  const second = nightRaidModifiers(2);
  assert.equal(second.extraAlive, 1);
  assert.equal(second.extraPerTick, 0);
  assert.equal(second.difficulty, 1.4);
  const third = nightRaidModifiers(3);
  assert.equal(third.extraAlive, 2);
  assert.equal(third.extraPerTick, 1);
  assert.equal(third.difficulty, 1.8);
});

check('夜袭加量会让同一个点当晚能多留敌人', () => {
  const point = normalizeSpawnPoint({ id: 'sp', intervalSeconds: 10, maxAlive: 3, maxPerTick: 2 });
  point.timer = 0;
  const night2 = nightRaidModifiers(2);
  const result = advanceSpawnPoint(point, {
    dt: 0.05,
    aliveCount: 3,
    extraAlive: night2.extraAlive,
    extraPerTick: night2.extraPerTick
  });
  assert.equal(result.reason, SPAWN_BLOCK_REASON.none);
  assert.equal(result.spawnCount, 1, '第 2 夜上限 3+1，满 3 个时还能再补 1');
});

check('第 1 夜满员时仍然不能超产', () => {
  const point = normalizeSpawnPoint({ id: 'sp', intervalSeconds: 10, maxAlive: 3, maxPerTick: 2 });
  point.timer = 0;
  const first = nightRaidModifiers(1);
  const result = advanceSpawnPoint(point, {
    dt: 0.05,
    aliveCount: 3,
    extraAlive: first.extraAlive
  });
  assert.equal(result.spawnCount, 0);
  assert.equal(result.reason, SPAWN_BLOCK_REASON.atCapacity);
});

check('交界处灯光混合在 0～1 之间，正午接近 0、深夜接近 1，黄昏会抬升', () => {
  const day = createDayNightState();
  assert.ok(nightBlend(day) < 0.05);
  skipToPhase(day, DAY_NIGHT_PHASE.night);
  advanceDayNight(day, 20);
  assert.ok(nightBlend(day) > 0.9);
  skipToPhase(day, DAY_NIGHT_PHASE.day);
  day.phaseElapsed = 300 - 4;
  assert.ok(nightBlend(day, 12) > 0.5);
});

check('非法配置会被夹成可用值，不会出现 0 秒一天', () => {
  const rules = dayNightRules({ daySeconds: 0, nightSeconds: -8, extraAlivePerNight: -2 });
  assert.ok(rules.daySeconds >= 1);
  assert.ok(rules.nightSeconds >= 1);
  assert.equal(rules.extraAlivePerNight, 0);
});

if (process.exitCode) {
  console.log(report.join('\n'));
  process.exit(1);
}
console.log(report.join('\n'));
console.log(`\n${report.length}/${report.length} 通过`);
