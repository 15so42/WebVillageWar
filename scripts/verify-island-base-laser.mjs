// 玩家基地「激光自动开火」的端到端验收（用户第 5 轮报的那条：基地的激光攻击怎么没了）。
//
// 复现出来的根因不是"激光坏了"，而是**基地把自己的结构耐久当弹药**：
//   - `BALANCE.playerBase.attackDurabilityCost` 每发扣 1 点结构耐久，上限 49；
//   - 而结构耐久在生存模式里**没有任何自然回复**——只有「维修」类建筑的
//     `restoreDurability` 光环能补（`BuildingSystem.restoreNearbyStructures`）。
// 于是基地打满 37 发、约 25 秒之后 durability 卡在 0，`updatePlayerBaseAttack` 直接 return：
// 射程里还有敌人、`findPlayerBaseAttackTarget()` 照样返回目标，但**再也打不出一发**。
// 实测时间线（修复前）：每 5 秒 8/7/7/7/5 发 → durability 归零 → 之后 30 秒 0 发。
//
// 这个脚本守的就是那条时间线：**持续开火 60 秒，每一段都必须有输出**。
// 它刻意跑得比"打一只怪"长得多——只测一两发的话，修复前后都是绿的。
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';

const CDP_PORT = Number(process.env.ISLAND_CDP_PORT || 9235);
const BASE = process.env.ISLAND_URL || 'http://127.0.0.1:3000/';
const BLOCKS = Number(process.env.BASE_LASER_BLOCKS || 12);
const FRAMES_PER_BLOCK = Number(process.env.BASE_LASER_FRAMES || 100);

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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
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
const report = { page: BASE, started: false, result: null, problems };
report.started = await enterSurvivalGame(ev, sleep);

if (report.started) {
  await sleep(500);
  report.result = JSON.parse(await ev(`(async () => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const out = {};
    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    game.paused = false;
    game.pendingStrategyRewards = [];
    game.awaitingOpeningReward = false;
    if (game.strategyEvent) game.strategyEvent = null;
    if (game.strategyEventUi?.root) game.strategyEventUi.root.hidden = true;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
    const step = async (n) => {
      for (let i = 0; i < n; i += 1) {
        game.tick();
        if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
      }
    };
    await step(6);

    const base = game.playerBase;
    out.base = base ? {
      alive: base.alive === true,
      durability: base.structureDurability,
      maxDurability: base.maxStructureDurability,
      hasModel: Boolean(base.model),
      hasEmitter: Boolean(base.model?.userData?.attackEmitter),
      attackRange: game.constructor ? null : null
    } : null;
    out.baseAttackDurationCost = game.BALANCE?.playerBase?.attackDurabilityCost
      ?? window.__VILLAGE_WAR_DEBUG__.balance?.playerBase?.attackDurabilityCost
      ?? null;
    if (!base || !base.alive) return JSON.stringify({ ...out, error: 'no_player_base' });

    // 基地激光的光束入口就是 spawnEnemyCampBlast；数它等于数"打出去了几发"。
    // 只放一个**打不死**的靶子，否则第一发就把目标打死，后面量到的 0 发是"没敌人"
    // 而不是"开不了火"——两者必须分清楚。
    let blasts = 0;
    const originalBlast = game.effects.spawnEnemyCampBlast.bind(game.effects);
    game.effects.spawnEnemyCampBlast = function (...args) {
      blasts += 1;
      return originalBlast(...args);
    };

    const spot = game.resolveWalkablePoint(
      new (base.position.constructor)(base.position.x + 3, 0, base.position.z)
    );
    const foe = game.spawnEnemyAt('goblinSoldier', { x: spot.x, z: spot.z }, { radius: 0.2 });
    /**
     * 把靶子按住。
     *
     * 两件事都必须做，而且都是**实测踩出来的**：
     *   1. 打不死（takeRawDamage 换掉）：基地一发 7 点，靶子死了后面量到的 0 发
     *      就变成"没敌人"而不是"开不了火"，两者必须分得清；
     *   2. **每帧把位置摆回去**：基地激光带 1.35 的击退（attackKnockback），
     *      站桩靶子会被一路推出 8.5m 的射程——第一次跑这个脚本时
     *      28 秒之后 targetFound 就变 false 了，看起来像"激光又没了"。
     */
    const holdFoe = () => {
      if (!foe) return;
      foe.alive = true;
      foe.health = 1e9;
      foe.maxHealth = 1e9;
      foe.position.set(spot.x, game.groundHeightAt(spot), spot.z);
      foe.moveGoal = null;
      foe.commandMoveGoal = null;
      foe.wanderGoal = null;
      foe.target = null;
      foe.attributes?.setBase?.('moveSpeed', 0);
      foe.attributes?.setBase?.('aggroRange', 0);
      foe.attributes?.setBase?.('physicalAttack', 0);
    };
    if (foe) {
      foe.takeRawDamage = function () {};
      holdFoe();
    }
    await step(4);
    out.targetFound = Boolean(game.findPlayerBaseAttackTarget());
    out.foe = foe ? {
      alive: foe.alive === true,
      distance: Math.round(Math.hypot(foe.position.x - base.position.x, foe.position.z - base.position.z) * 100) / 100,
      isWildlife: foe.isWildlife === true,
      isRecruitable: foe.isRecruitable === true
    } : null;

    // 逐段量：每一段都必须有输出。修复前第 6 段开始就是 0。
    const timeline = [];
    const durabilityAtStart = base.structureDurability;
    for (let block = 0; block < ${BLOCKS}; block += 1) {
      const before = blasts;
      for (let i = 0; i < ${FRAMES_PER_BLOCK}; i += 1) {
        holdFoe();
        game.tick();
        if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      timeline.push({
        seconds: (block + 1) * ${FRAMES_PER_BLOCK} * 0.05,
        blasts: blasts - before,
        durability: Math.round(base.structureDurability * 100) / 100,
        targetFound: Boolean(game.findPlayerBaseAttackTarget()),
        foeDistance: foe ? Math.round(Math.hypot(
          foe.position.x - base.position.x, foe.position.z - base.position.z) * 100) / 100 : null
      });
    }
    out.timeline = timeline;
    out.totalBlasts = blasts;
    out.durabilityAtStart = durabilityAtStart;
    out.durabilityAtEnd = Math.round(base.structureDurability * 100) / 100;
    out.emptyBlocks = timeline.filter((entry) => entry.blasts === 0).length;
    // 基地被打破的耐久与"开火成本"是两条线：这里只断言开火不再吃耐久。
    // （靶子被压到 0 伤害，所以 durability 只会因为别的原因变化；记录它便于诊断。）
    game.effects.spawnEnemyCampBlast = originalBlast;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));
}

const r = report.result;
report.verdict = r && !r.error ? {
  booted: true,
  baseExistsAndAlive: r.base?.alive === true && r.base?.hasModel === true,
  // 玩家基地不再把结构耐久当弹药（这是"激光没了"的根因）
  laserCostsNoDurability: r.baseAttackDurationCost === 0 || r.baseAttackDurationCost === null,
  // 射程里有敌人时确实能锁定
  findsTargetInRange: r.targetFound === true && r.foe?.alive === true,
  // 连续 60 秒每一段都有输出（修复前第 6 段起全 0）
  firesContinuously: r.emptyBlocks === 0 && r.totalBlasts >= 30,
  // 不会因为耐久耗尽而哑火：开始与结束的耐久要么没变，要么只被"挨打"那条线扣
  neverBricksOnDurability: r.durabilityAtEnd > 0
} : null;
console.log(JSON.stringify(report, null, 2));
const failedChecks = Object.entries(report.verdict ?? {})
  .filter(([, passed]) => passed !== true)
  .map(([key]) => key);
if (failedChecks.length) console.log(`FAILED CHECKS: ${failedChecks.join(', ')}`);
const ok = failedChecks.length === 0 && problems.length === 0;
console.log(ok ? '\nISLAND BASE LASER: PASS' : '\nISLAND BASE LASER: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
