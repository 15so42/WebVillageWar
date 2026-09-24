// 采集挥击的纯逻辑回归（本轮需求第 5 条的"对准时机"那一半）。
//
// 这一层要守的是一句很难在游戏里复现的话：**东西在哪一帧到手**。
// 算错的表现有两种，而且都是静默的：
//   - 挥一次却结算了两次货（或者一次都没结算）——物品守恒被破坏；
//   - 动作还没落到树上，木头已经进背包了——"反馈和动作对不上"。
// 所以这里的断言围绕三件事：命中只发生一次、产物次数严格守恒、命中时刻落在时间轴上。
import assert from 'node:assert/strict';
import { RESOURCE_NODE_DEFINITIONS, UNIT_DEFINITIONS } from '../src/data/gameData.js';
import {
  SWING_KIND,
  advanceSwing,
  cancelSwing,
  createWorkSwing,
  isSwingActive,
  queueSwingCompletions,
  startSwing,
  swingKindForTool,
  workSwingTiming
} from '../src/systems/workSwing.js';

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

const definition = UNIT_DEFINITIONS.woodPuppet;

/** 按固定步长把一次挥击跑完，返回每次 advance 的结果。 */
function runSwing(swing, dt = 1 / 60, maxSteps = 600) {
  const steps = [];
  for (let i = 0; i < maxSteps && isSwingActive(swing); i += 1) {
    steps.push({ dt, ...advanceSwing(swing, dt) });
  }
  return steps;
}

check('动作名按工具选：镐=挖，其余=砍', () => {
  assert.equal(swingKindForTool('pickaxe'), SWING_KIND.mine);
  assert.equal(swingKindForTool('axe'), SWING_KIND.chop);
  // 徒手采浆果/纤维草没有工具，走砍的动作（够用，且不会退化成一堆分支）
  assert.equal(swingKindForTool(null), SWING_KIND.chop);
  assert.equal(swingKindForTool(undefined), SWING_KIND.chop);
});

check('时长与命中时刻直接来自单位定义的时间轴', () => {
  const chop = workSwingTiming(definition, 'chop');
  assert.equal(chop.duration, definition.art.timelines.chop.duration);
  assert.ok(Math.abs(chop.strikeAt - chop.duration * 0.46) < 1e-9, '命中点应等于 duration × events.strike');
  const mine = workSwingTiming(definition, 'mine');
  assert.equal(mine.duration, definition.art.timelines.mine.duration);
  // 挖矿比砍树短促
  assert.ok(mine.duration < chop.duration);
});

check('定义里缺时间轴时用兜底值，且命中点被夹在动作内部', () => {
  const fallback = workSwingTiming(undefined, 'mine');
  assert.equal(fallback.duration, 0.75);
  assert.ok(fallback.strikeAt > 0 && fallback.strikeAt < fallback.duration);
  // 写坏成 0 或 1 也要被夹住：否则命中会落在动作的最边沿
  const brokenLow = workSwingTiming({ art: { timelines: { chop: { duration: 1, events: { strike: 0 } } } } }, 'chop');
  const brokenHigh = workSwingTiming({ art: { timelines: { chop: { duration: 1, events: { strike: 1 } } } } }, 'chop');
  assert.ok(brokenLow.strikeAt >= 0.05, `strike=0 应被夹到 0.05，实际 ${brokenLow.strikeAt}`);
  assert.ok(brokenHigh.strikeAt <= 0.95, `strike=1 应被夹到 0.95，实际 ${brokenHigh.strikeAt}`);
});

check('命中只发生一次，且落在命中时刻上', () => {
  const swing = createWorkSwing();
  const timing = workSwingTiming(definition, 'chop');
  startSwing(swing, { kind: 'chop', ...timing, completions: 1 });
  assert.equal(isSwingActive(swing), true);

  const dt = 1 / 240;
  let struckCount = 0;
  let struckAtElapsed = null;
  let elapsed = 0;
  for (let i = 0; i < 2000 && isSwingActive(swing); i += 1) {
    const step = advanceSwing(swing, dt);
    elapsed += dt;
    if (step.struck) {
      struckCount += 1;
      struckAtElapsed = elapsed;
    }
  }
  assert.equal(struckCount, 1, `一次挥击应当只命中一次，实际 ${struckCount} 次`);
  assert.ok(
    Math.abs(struckAtElapsed - timing.strikeAt) <= dt * 1.5,
    `命中发生在 ${struckAtElapsed.toFixed(4)}s，应接近 ${timing.strikeAt.toFixed(4)}s`
  );
});

check('产物次数严格守恒：喂进去几次就结算几次', () => {
  const timing = workSwingTiming(definition, 'chop');
  [[1], [3], [7]].forEach(([fed]) => {
    const swing = createWorkSwing();
    startSwing(swing, { kind: 'chop', ...timing, completions: fed });
    const total = runSwing(swing).reduce((sum, step) => sum + step.completions, 0);
    assert.equal(total, fed, `喂 ${fed} 次应当结算 ${fed} 次，实际 ${total} 次`);
    assert.equal(swing.pending, 0, '挥击结束后不得留下未结算的积压');
  });
});

check('挥击进行中攒到的次数会在下一次命中帧一起结算（不丢也不重复）', () => {
  const timing = workSwingTiming(definition, 'chop');
  const swing = createWorkSwing();
  startSwing(swing, { kind: 'chop', ...timing, completions: 1 });
  let total = 0;
  const dt = 1 / 120;
  // 命中帧之前塞两次进去
  for (let i = 0; i < Math.floor(timing.strikeAt * 120 * 0.5); i += 1) {
    total += advanceSwing(swing, dt).completions;
  }
  queueSwingCompletions(swing, 2);
  // 命中帧之前再塞一次
  queueSwingCompletions(swing, 1);
  total += runSwing(swing, dt).reduce((sum, step) => sum + step.completions, 0);
  assert.equal(total, 4, `1 + 2 + 1 共 4 次，实际结算 ${total} 次`);
});

check('一段超长 dt 同时跨过命中帧与结束帧时仍然结算', () => {
  const timing = workSwingTiming(definition, 'chop');
  const swing = createWorkSwing();
  startSwing(swing, { kind: 'chop', ...timing, completions: 5 });
  // 一次推进 10 秒：命中与结束发生在同一次 advance 里
  const step = advanceSwing(swing, 10);
  assert.equal(step.struck, true, '跨过命中帧必须报告命中');
  assert.equal(step.completions, 5, '必须把 5 次一起结算，不能因为"同时结束"而丢掉');
  assert.equal(step.finished, true);
  assert.equal(isSwingActive(swing), false);
  assert.equal(swing.pending, 0);
});

check('挥击进行中再次 startSwing 不打断动作，只累加次数', () => {
  const timing = workSwingTiming(definition, 'chop');
  const swing = createWorkSwing();
  startSwing(swing, { kind: 'chop', ...timing, completions: 1 });
  const elapsedBefore = (() => { advanceSwing(swing, 0.2); return swing.elapsed; })();
  startSwing(swing, { kind: 'chop', ...timing, completions: 2 });
  assert.ok(Math.abs(swing.elapsed - elapsedBefore) < 1e-9, '不该把已经播了的时间清零（那会让动作一顿）');
  assert.equal(swing.pending, 3, '应当累加成 3 次');
});

check('中断会把没结算的次数交回调用方，并彻底清空状态', () => {
  const timing = workSwingTiming(definition, 'chop');
  const swing = createWorkSwing();
  startSwing(swing, { kind: 'chop', ...timing, completions: 4 });
  const leftover = cancelSwing(swing);
  assert.equal(leftover, 4, '还没命中就中断，4 次应当原样交回');
  assert.equal(isSwingActive(swing), false);
  assert.equal(swing.pending, 0);
  assert.equal(swing.elapsed, 0);
  // 命中之后再中断：货已经结算过了，不该再交回一次（否则就是凭空多一份）
  const second = createWorkSwing();
  startSwing(second, { kind: 'chop', ...timing, completions: 2 });
  runSwing(second, 1 / 600, Math.floor(timing.strikeAt * 600) + 2);
  assert.equal(cancelSwing(second), 0, '已命中之后中断不得再交回次数');
});

check('进度从 0 单调走到 1，结束后回到空闲', () => {
  const timing = workSwingTiming(definition, 'chop');
  const swing = createWorkSwing();
  assert.equal(advanceSwing(swing, 0.1).active, false, '没开始时推进应当什么也不做');
  startSwing(swing, { kind: 'chop', ...timing, completions: 1 });
  const steps = runSwing(swing, 1 / 120);
  const progresses = steps.map((step) => step.progress);
  for (let i = 1; i < progresses.length; i += 1) {
    assert.ok(progresses[i] >= progresses[i - 1], '进度必须单调不减');
  }
  assert.ok(progresses[progresses.length - 1] >= 0.99, '最后一步应当接近 1');
  assert.equal(isSwingActive(swing), false);
});

check('岛上每一个采集节点都能映射到有效动作与有效时间轴', () => {
  // 这条守的是"没有一个节点会落进没有动作的分支"：包括没有工具的浆果与纤维草。
  const ids = Object.keys(RESOURCE_NODE_DEFINITIONS);
  assert.ok(ids.length >= 6, `夹具前提：至少 6 种资源节点，实际 ${ids.length}`);
  ids.forEach((id) => {
    const tool = RESOURCE_NODE_DEFINITIONS[id].tool ?? null;
    const kind = swingKindForTool(tool);
    assert.ok(
      kind === SWING_KIND.chop || kind === SWING_KIND.mine,
      `${id}（工具 ${tool}）应映射到 chop/mine，实际 ${kind}`
    );
    const timing = workSwingTiming(definition, kind);
    assert.ok(timing.duration > 0, `${id} 的动作时长为 ${timing.duration}`);
    assert.ok(timing.strikeAt > 0 && timing.strikeAt < timing.duration, `${id} 的命中点必须落在动作内部`);
  });
});

console.log(report.join('\n'));
const failed = report.filter((line) => line.startsWith('FAIL')).length;
console.log(`\n采集挥击：${report.length - failed}/${report.length} 通过`);
