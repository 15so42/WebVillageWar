// 木傀儡采集动画与打击反馈的端到端验收（本轮需求第 5 条）。
//
// 单元测试能证明"动作曲线是对的""时机计算是对的"，但证明不了**它们接上了**：
// 关节存在不等于游戏里会动，特效存在不等于真的在命中帧冒出来。
// 这个脚本在真实一局里逐帧观察，守四条：
//   1. 傀儡真的播了 chop / mine（而不是站着摇摆）；
//   2. 拿着斧子砍树、拿着镐挖矿时，手掌上挂的**对应**工具是可见的；
//   3. 打击特效出现的帧与产物到手的帧**是同一帧**——这是"对准时机"的定义；
//   4. 加了动作之后采集吞吐没有变慢（挥击不能把进度累积挡住）。
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const CDP_PORT = Number(process.env.ISLAND_CDP_PORT || 9235);
const BASE = process.env.ISLAND_URL || 'http://127.0.0.1:3000/';
const LEVEL_ID = process.env.ISLAND_LEVEL_ID || 'island-survival';

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
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const res = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
    timeout: 300000
  });
  if (res.exceptionDetails) {
    throw new Error('page eval failed: ' + (res.exceptionDetails.exception?.description ?? res.exceptionDetails.text));
  }
  return res.result.value;
};

await send('Page.navigate', { url: BASE });
const report = { page: BASE, levelId: LEVEL_ID, started: false, result: null, problems };
report.started = await enterSurvivalGame(ev, sleep);

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
        if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    await step(8);
    game.pendingStrategyRewards = [];
    game.awaitingOpeningReward = false;
    if (game.strategyEvent) game.strategyEvent = null;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
    await step(4);

    const worker = (game.friendlyUnits ?? []).find((u) => u?.alive && u.isWorker) ?? null;
    out.workerFound = Boolean(worker);
    if (!worker) return JSON.stringify({ ...out, error: 'no_worker' });

    // ---- 隔离威胁 ----
    // 这一段要量的是「砍树/挖矿的动作时机与吞吐」，而木傀儡现在会为了避险放下工作
    // （需求 1：非战斗任务挑威胁度低的地方）。岛上 4 处野生动物会游荡到基地附近，
    // 不隔离的话总量到的"两次产物之间的间隔"会被"跑开又跑回来"污染，
    // 表现就是这条验收偶发变红。威胁规避本身由 verify-island-puppet-combat 覆盖。
    let clearedThreats = 0;
    (game.enemyUnits ?? []).slice().forEach((unit) => {
      if (!unit?.alive || unit.isSpawnPointNest) return;
      unit.alive = false;
      unit.health = 0;
      clearedThreats += 1;
    });
    (game.spawnPoints?.points ?? []).forEach((point) => { point.timer = 9999; });
    out.clearedThreats = clearedThreats;

    // ---- 1) 局内模型确实带着新骨架 ----
    const parts = worker.visualRoot?.userData?.parts ?? {};
    out.rigParts = ['leftElbowPivot', 'rightElbowPivot', 'leftKneePivot', 'rightKneePivot', 'toolSocket']
      .filter((key) => parts[key]?.isObject3D);
    out.rigComplete = out.rigParts.length === 5;

    const effectsList = () => (game.effects?.effects ?? []);
    const countStrikes = () => effectsList()
      .filter((entry) => entry?.object?.userData?.isWorkStrike === true).length;
    const heldTool = () => parts.toolSocket?.userData?.heldTool ?? null;
    const toolVisible = (kind) => parts.toolSocket?.getObjectByName('unitTool:' + kind)?.visible
      ?? parts.toolSocket?.getObjectByName('unitHeldTool:' + kind)?.visible
      ?? null;

    /**
     * 把傀儡放到节点旁边并派活，然后逐帧观察。
     * 位置是刻意贴上去的：这里要量的是"采集本身"的动作与吞吐，不是走路。
     */
    const observeGather = async (node, seconds) => {
      if (!node) return null;
      const record = game.work?.records?.get?.(worker.id) ?? null;
      game.work.clearTask(worker.id);
      game.work.assignNode(worker, node.id);
      worker.position.set(node.x + 1.2, worker.position.y, node.z + 1.2);
      worker.moveGoal = null;
      worker.commandMoveGoal = null;
      worker.target = null;
      const before = node.amount;
      const elapsedBefore = game.elapsedTime;
      const result = {
        before,
        definitionId: node.definitionId ?? null,
        elapsedBefore,
        yieldFrames: [],
        yieldTimes: [],
        vfxFrames: [],
        animNames: [],
        swingKinds: [],
        toolKinds: [],
        toolVisibleDuringSwing: [],
        frames: Math.round(seconds / 0.05)
      };
      let lastAmount = before;
      let lastStrikes = countStrikes();
      for (let i = 0; i < result.frames; i += 1) {
        game.tick();
        if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
        const swingKind = record?.swing?.kind ?? null;
        if (swingKind && !result.swingKinds.includes(swingKind)) result.swingKinds.push(swingKind);
        const animName = worker.visualRoot?.userData?.animation?.name ?? null;
        if (animName && !result.animNames.includes(animName)) result.animNames.push(animName);
        if (swingKind && !result.toolKinds.includes(heldTool())) result.toolKinds.push(heldTool());
        if (swingKind) {
          result.toolVisibleDuringSwing.push({
            tool: heldTool(),
            axe: toolVisible('axe'),
            pickaxe: toolVisible('pickaxe')
          });
        }
        if (node.amount !== lastAmount) {
          result.yieldFrames.push(i);
          // 记录每次产物的**模拟时刻**：帧号不可靠（页面 rAF 也在推进游戏），
          // 而"两次产物之间隔了多少秒"才是"采集有没有被动作拖慢"的直接证据。
          result.yieldTimes.push(Math.round(game.elapsedTime * 1000) / 1000);
          lastAmount = node.amount;
        }
        const strikes = countStrikes();
        if (strikes > lastStrikes) result.vfxFrames.push(i);
        lastStrikes = strikes;
      }
      result.harvested = before - node.amount;
      // 吞吐必须按**模拟时间增量**算，不能按"我手动 tick 了几次"：
      // 页面的 rAF 循环也在推进游戏（headless=new 下它是活的），
      // 按手动帧数算会把额外那些 tick 漏掉，吞吐断言就形同虚设。
      result.simSeconds = game.elapsedTime - elapsedBefore;
      result.seconds = seconds;
      return result;
    };

    const nodes = game.resourceNodes?.activeNodes?.() ?? [];
    const tree = nodes.find((n) => n.definitionId === 'oak') ?? nodes.find((n) => n.resource === 'wood') ?? null;
    const rock = nodes.find((n) => n.definitionId === 'stonePile') ?? nodes.find((n) => n.resource === 'stone') ?? null;
    out.treeFound = Boolean(tree);
    out.rockFound = Boolean(rock);

    // ---- 2) 砍树 ----
    const treeRun = await observeGather(tree, 12);
    out.treeRun = treeRun ? {
      harvested: treeRun.harvested,
      definitionId: treeRun.definitionId,
      simSeconds: Math.round(treeRun.simSeconds * 100) / 100,
      animNames: treeRun.animNames,
      swingKinds: treeRun.swingKinds,
      toolKinds: treeRun.toolKinds,
      yields: treeRun.yieldFrames.length,
      vfx: treeRun.vfxFrames.length,
      yieldTimes: treeRun.yieldTimes,
      firstYieldFrame: treeRun.yieldFrames[0] ?? null,
      firstVfxFrame: treeRun.vfxFrames[0] ?? null,
      axeAlwaysVisible: treeRun.toolVisibleDuringSwing.length > 0
        && treeRun.toolVisibleDuringSwing.every((row) => row.tool === 'axe' && row.axe === true && row.pickaxe !== true)
    } : null;

    // ---- 3) 挖矿 ----
    const rockRun = await observeGather(rock, 8);
    out.rockRun = rockRun ? {
      harvested: rockRun.harvested,
      animNames: rockRun.animNames,
      swingKinds: rockRun.swingKinds,
      toolKinds: rockRun.toolKinds,
      yields: rockRun.yieldFrames.length,
      vfx: rockRun.vfxFrames.length,
      firstYieldFrame: rockRun.yieldFrames[0] ?? null,
      firstVfxFrame: rockRun.vfxFrames[0] ?? null,
      pickaxeAlwaysVisible: rockRun.toolVisibleDuringSwing.length > 0
        && rockRun.toolVisibleDuringSwing.every((row) => row.tool === 'pickaxe' && row.pickaxe === true && row.axe !== true)
    } : null;

    // ---- 4) 吞吐：不准因为加了动作而变慢 ----
    // 判据用**两次产物之间的间隔**，而不是"总产出 / 总时长"：
    // 节点是有存量的（橡树一共 45 木材 = 9 次），采空之后总产出天然封顶，
    // 拿总量去比会把"节点采空了"误读成"采得慢"。
    // 间隔才是直接证据：如果挥击把进度累积挡住了，间隔会从 1.6 秒变成
    // 1.6 + 动作时长（≈2.5 秒），一眼就能看出来。
    const harvestSecondsByNode = { oak: 1.6, pine: 1.3, stonePile: 1.5, ironVein: 2.2, berryBush: 0.9, fiberPlant: 0.7 };
    const perAction = Math.max(1, Math.floor(game.work?.rules?.harvestPerAction ?? 5)
      + (game.research?.harvestBonus?.() ?? 0));
    out.perAction = perAction;
    const treeSeconds = harvestSecondsByNode[out.treeRun?.definitionId] ?? 1.6;
    out.treeHarvestSeconds = treeSeconds;
    out.treeSimSeconds = out.treeRun ? Math.round(out.treeRun.simSeconds * 100) / 100 : null;
    out.actualWood = out.treeRun?.harvested ?? 0;
    // 第一次产物的时刻里含着"接任务 + 走到节点"的开销，不参与间隔统计。
    const intervals = [];
    const times = out.treeRun?.yieldTimes ?? [];
    for (let i = 2; i < times.length; i += 1) intervals.push(times[i] - times[i - 1]);
    intervals.sort((a, b) => a - b);
    out.yieldIntervals = intervals.map((value) => Math.round(value * 100) / 100);
    out.medianYieldInterval = intervals.length ? intervals[Math.floor(intervals.length / 2)] : null;
    out.throughputOk = out.treeRun
      && out.treeRun.simSeconds > 3
      && out.medianYieldInterval !== null
      && out.medianYieldInterval <= treeSeconds * 1.35;

    game.work.clearTask(worker.id);
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));
}

mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
if (report.started) {
  // 截图留档：让傀儡砍树，停在挥砍中段，能同时看到斧子与木屑。
  await ev(`(async () => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const worker = (game.friendlyUnits ?? []).find((u) => u?.alive && u.isWorker) ?? null;
    if (!worker) return false;
    const nodes = game.resourceNodes?.activeNodes?.() ?? [];
    const tree = nodes.find((n) => n.definitionId === 'oak') ?? null;
    if (!tree) return false;
    game.work.clearTask(worker.id);
    game.work.assignNode(worker, tree.id);
    worker.position.set(tree.x + 1.2, worker.position.y, tree.z + 1.2);
    worker.moveGoal = null;
    worker.commandMoveGoal = null;
    game.paused = false;
    game.cameraTarget.set(tree.x, 4, tree.z);
    for (let i = 0; i < 90; i += 1) {
      game.tick();
      if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 16));
    }
    return true;
  })()`);
  await sleep(300);
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync('C:/WebProjects/WebVillageWar/outputs/verify-work-animation.png', Buffer.from(shot.data, 'base64'));
}

const r = report.result;
const aligned = (run) => Boolean(run)
  && run.yields > 0
  && run.vfx > 0
  && run.firstYieldFrame !== null
  && run.firstVfxFrame !== null
  && Math.abs(run.firstYieldFrame - run.firstVfxFrame) <= 1;

report.verdict = r && !r.error ? {
  booted: true,
  workerFound: r.workerFound === true,
  rigComplete: r.rigComplete === true,
  treeAndRockFound: r.treeFound === true && r.rockFound === true,
  // 砍树：播的是 chop、握的是斧、产物与木屑同一帧
  chopAnimationPlayed: Boolean(r.treeRun) && r.treeRun.animNames.includes('chop'),
  chopSwingKind: Boolean(r.treeRun) && r.treeRun.swingKinds.includes('chop'),
  chopToolVisible: Boolean(r.treeRun) && r.treeRun.axeAlwaysVisible === true,
  chopFeedbackAligned: aligned(r.treeRun),
  // 挖矿：播的是 mine、握的是镐、产物与碎石同一帧
  mineAnimationPlayed: Boolean(r.rockRun) && r.rockRun.animNames.includes('mine'),
  mineSwingKind: Boolean(r.rockRun) && r.rockRun.swingKinds.includes('mine'),
  mineToolVisible: Boolean(r.rockRun) && r.rockRun.pickaxeAlwaysVisible === true,
  mineFeedbackAligned: aligned(r.rockRun),
  // 加了动作之后吞吐没变慢
  throughputNotBlocked: r.throughputOk === true,
  noErrors: problems.length === 0
} : null;

console.log(JSON.stringify(report, null, 2));
const ok = Object.values(report.verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nWORK ANIMATION: PASS' : '\nWORK ANIMATION: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
