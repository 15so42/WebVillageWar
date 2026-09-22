// 海岛开局可通关性验收。
//
// 为什么需要这个脚本：用户定稿的招募链是「招募令 ← 深邃核心 ← 摧毁巢穴」，
// 也就是**战斗单位本身来自巢穴**。如果出生部队打不掉第一座巢穴，整条链就是死循环，
// 整个模式不可通关。这不是"平衡好不好"的问题，是"能不能玩"的问题。
//
// 实测（改之前，见提交记录里的探针数据）：
//   只有 1 支木傀儡 → 巢穴 0 伤害，傀儡阵亡 → 判负 no_units_left
//   加 1 蛮兵       → 巢穴 0 伤害，全灭 → 基地被拆
//   加 4 个战斗单位 → 巢穴打到 236/252，全灭 → 基地被拆（差一点，但仍输）
//   4 个战斗单位 + 起始巢穴 120 血/存活上限 2 → 巢穴被拆，零损失
//
// **必须在 tick 之间让出事件循环。** 单位寻路走 Web Worker
// （PathfindingSystem → postMessage → onmessage），一次性死循环里 worker 回包永远送不到，
// 战斗单位会停在原地"追着目标一步不动"；只有傀儡那种走直线转向的单位会动。
// 这个坑会让脚本得出"全场景 0 伤害"的假结论。
import WebSocket from 'ws';

const CDP_PORT = Number(process.env.ISLAND_CDP_PORT || 9235);
const BASE = process.env.ISLAND_URL || 'http://127.0.0.1:3000/';
const LEVEL_ID = process.env.ISLAND_LEVEL_ID || 'island-survival';
const SIM_SECONDS = 150;

const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page')
  ?? await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 0;
const pending = new Map();
const problems = [];
const send = (m, p = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method: m, params: p }));
});
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    problems.push('[exception] ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? ''));
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    problems.push('[console.error] ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
});
await new Promise((r, rej) => { ws.on('open', r); ws.on('error', rej); });
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 640, deviceScaleFactor: 1, mobile: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const res = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
    timeout: 600000
  });
  if (res.exceptionDetails) {
    throw new Error('page eval failed: ' + (res.exceptionDetails.exception?.description ?? res.exceptionDetails.text));
  }
  return res.result.value;
};

await send('Page.navigate', { url: BASE });
const report = { page: BASE, levelId: LEVEL_ID, simSeconds: SIM_SECONDS, started: false, result: null, problems };
for (let i = 0; i < 60; i += 1) {
  await sleep(400);
  if (await ev(`!!document.querySelector('[data-action="levels"]')`)) break;
}
await ev(`document.querySelector('[data-action="levels"]')?.click(); true`);
await sleep(1200);
await ev(`(() => {
  const btn = [...document.querySelectorAll('[data-action="select-level"]')]
    .find((e) => e.offsetParent !== null && (e.dataset.levelId || '').includes(${JSON.stringify(LEVEL_ID)}));
  if (btn) btn.click();
  return true;
})()`);
await sleep(500);
await ev(`(()=>{const b=[...document.querySelectorAll('[data-action="start-level"]')].find(e=>e.offsetParent!==null);if(b)b.click();return true;})()`);
for (let i = 0; i < 60; i += 1) {
  await sleep(400);
  if (await ev(`!!window.__VILLAGE_WAR_DEBUG__?.game`)) { report.started = true; break; }
}

if (report.started) {
  await sleep(500);
  report.result = JSON.parse(await ev(`(async () => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const out = {};
    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    game.paused = false;
    const step = async (n) => {
      for (let i = 0; i < n; i += 1) {
        game.tick();
        // 每 4 tick 让出一次事件循环，寻路 worker 才有机会回包
        if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
      }
    };
    await step(8);
    game.pendingStrategyRewards = [];
    game.awaitingOpeningReward = false;
    if (game.strategyEvent) game.strategyEvent = null;
    if (game.strategyEventUi?.root) game.strategyEventUi.root.hidden = true;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
    await step(4);

    out.pathWorkerReady = game.pathWorkerReady === true;
    out.openingForce = (game.friendlyUnits ?? [])
      .filter((u) => u?.alive)
      .map((u) => u.type);
    out.escortConfig = (game.world?.config?.survivalOpening ?? game.worldConfig?.survivalOpening ?? null);

    // 奖励发放的观测点：**必须挂在这里，不能靠"后来数一数场上多没多一支傀儡"**。
    // 奖励的傀儡就刷在巢穴旁边，而巢穴旁边正在打仗——它完全可能在同一帧里出生又阵亡，
    // 事后去数只能得到"没发奖励"这个错误结论。
    let rewardWorkers = 0;
    let rewardCores = 0;
    const originalCleared = game.onSpawnPointCleared?.bind(game) ?? null;
    game.onSpawnPointCleared = (point) => {
      const result = originalCleared ? originalCleared(point) : null;
      rewardWorkers += result?.workers ?? 0;
      if (result?.drop) {
        rewardCores += result.drop.stacks
          .filter((stack) => stack.itemId === 'deepCore')
          .reduce((sum, stack) => sum + stack.count, 0);
      }
      return result;
    };

    const nest = (game.enemyUnits ?? []).find((u) => u?.isSpawnPointNest
      && u.spawnPointId === 'island-camp-north') ?? null;
    out.nestFound = Boolean(nest);
    if (!nest) return JSON.stringify({ ...out, error: 'no_starter_nest' });
    out.nestMaxHealth = Math.round(nest.maxHealth);
    out.nestHealth0 = Math.round(nest.health);
    out.nestIsWeakest = (game.spawnPoints?.points ?? [])
      .slice()
      .sort((a, b) => (a.nestHealth || 9999) - (b.nestHealth || 9999))[0]?.id ?? null;
    out.starterPoint = (() => {
      const point = game.spawnPoints?.pointById?.('island-camp-north');
      return point ? { maxAlive: point.maxAlive, nestHealth: point.nestHealth } : null;
    })();

    // 把出生护卫（非傀儡、可移动的单位）派向起始巢穴，走真实指令路径。
    const nestPos = nest.position.clone();
    const escorts = (game.friendlyUnits ?? []).filter((u) => (
      u?.alive && u.isWorker !== true && u.definition?.canMove !== false
    ));
    out.escortCount = escorts.length;
    escorts.forEach((unit) => {
      const goal = nestPos.clone();
      goal.y = game.groundHeightAt(goal);
      unit.moveGoal = goal;
      unit.moveGoalUsesDirectSteering = false;
      unit.commandMoveGoal = null;
      unit.homePoint = null;
      unit.target = null;
    });

    const ticks = Math.round(${SIM_SECONDS} / 0.05);
    let workersAtDestruction = null;
    for (let i = 0; i < ticks; i += 1) {
      game.tick();
      if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
      if (nest.alive === false && workersAtDestruction === null) {
        // 清点奖励是在巢穴被摧毁的那一刻发的。奖励的那支傀儡之后再被打死
        // 属于战损，不该让"奖励有没有发"这条断言变红——所以在销毁当帧记一次。
        workersAtDestruction = (game.friendlyUnits ?? []).filter((u) => u?.alive && u.isWorker).length;
      }
      if (nest.alive === false || game.levelFinished) break;
    }

    out.nestHealthEnd = nest.alive ? Math.round(nest.health) : 0;
    out.nestDamageTaken = Math.round(out.nestHealth0 - out.nestHealthEnd);
    out.nestDestroyed = nest.alive === false;
    out.baseAlive = game.playerBase.alive === true;
    out.baseHealthRatio = Math.round((game.playerBase.health / Math.max(1, game.playerBase.maxHealth)) * 100) / 100;
    out.workersAlive = (game.friendlyUnits ?? []).filter((u) => u?.alive && u.isWorker).length;
    out.friendlyAlive = (game.friendlyUnits ?? []).filter((u) => u?.alive).length;
    out.levelFinished = game.levelFinished === true;
    out.endReason = game.levelEndReason ?? null;
    out.workersGained = out.workersAlive - (out.escortConfig?.workers ?? 1);
    out.workersAtDestruction = workersAtDestruction;
    out.rewardWorkers = rewardWorkers;
    out.rewardCores = rewardCores;
    // 深邃核心可能已经被旁边的人捡走了，所以地上和背包里都要看
    out.deepCoreOnGround = (game.drops?.drops?.() ?? []).some((entry) => (
      entry.stacks.some((stack) => stack.itemId === 'deepCore')
    ));
    out.deepCoreInBags = (game.friendlyUnits ?? []).some((unit) => (
      (unit?.workerInventory?.countOf?.('deepCore') ?? 0) > 0
    ));
    // 打掉巢穴会掉深邃核心——这是招募链的起点，必须真的掉出来
    out.deepCoreOnGround = (game.drops?.drops?.() ?? []).some((entry) => (
      entry.stacks.some((stack) => stack.itemId === 'deepCore')
    ));
    out.elapsedSeconds = Math.round(game.elapsedTime);
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));
}

const r = report.result;
report.verdict = r && !r.error ? {
  booted: true,
  pathWorkerReady: r.pathWorkerReady === true,
  // 开局必须带护卫：只给傀儡的话招募链是死循环
  openingHasEscorts: (r.escortCount ?? 0) >= 4
    && (r.openingForce ?? []).includes('woodPuppet'),
  // 起始巢穴必须是全场最弱的那个点
  starterNestIsWeakest: r.nestIsWeakest === 'island-camp-north'
    && r.starterPoint?.nestHealth > 0
    && r.starterPoint?.nestHealth < r.nestMaxHealth,
  // 核心结论：出生部队打得掉第一座巢穴
  starterNestDestroyed: r.nestDestroyed === true,
  // 而且不是惨胜：基地活着，傀儡还在
  baseSurvived: r.baseAlive === true && r.baseHealthRatio > 0,
  workerSurvived: r.workersAlive >= 1,
  levelNotLost: r.levelFinished === false && r.endReason === null,
  // 巢穴奖励：销毁时**确实发出去**了一支傀儡，以及一个深邃核心（招募链的起点）。
  // 判据用发放记录而不是"事后场上还剩几支"——奖励的傀儡可能在同帧阵亡。
  workerRewardGranted: r.rewardWorkers >= 1,
  deepCoreDropped: r.rewardCores >= 1
    && (r.deepCoreOnGround === true || r.deepCoreInBags === true)
} : null;
console.log(JSON.stringify(report, null, 2));
const ok = Object.values(report.verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nISLAND OPENING VIABILITY: PASS' : '\nISLAND OPENING VIABILITY: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
