// 海岛生存胜负条件端到端验收（方案第 6 节）。
//
// 这一关此前**永远不会结束**：规则早就算出来了（SpawnPointSystem.checkVictory），
// 但没有任何地方读它的结果。所以这里验的是三件事：
//   1) 点位全清 + 残敌清空 → 真的判胜；
//   2) 点位全清但还有该点产出的敌人 → **不**判胜（野生动物不算）；
//   3) 基地被毁、以及单位全灭且无补充途径 → 真的判负，而不是永远僵着。
// 另外验一条容易搞错的边界：海岛关打掉敌营**不算通关**。
//
// headless 里 requestAnimationFrame 不推进，全部靠手动 game.tick()，并断言
// elapsedTime 真的增长了。三个场景会各自重新加载一次关卡——一次 level 结束后
// levelFinished 会把后续判定全部锁死，同一条会话里接着测等于测了个假的。
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';

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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    const detail = res.exceptionDetails.exception?.description ?? res.exceptionDetails.text ?? 'unknown';
    throw new Error('page eval failed: ' + detail);
  }
  return res.result.value;
};

const report = { page: BASE, levelId: LEVEL_ID, scenarios: {}, problems };

/** 重新加载并进入海岛关。
 *  判定"新文档已就绪"用的是「菜单在、且还没有 game」——
 *  重载前的旧文档同时有 game 和菜单按钮，靠它区分不会误判成已就绪。 */
async function startLevel() {
  await send('Page.navigate', { url: BASE });
  for (let i = 0; i < 40; i += 1) {
    await sleep(300);
    const state = await ev(`JSON.stringify({
      menu: !!document.querySelector('[data-action="start-game"]'),
      game: !!window.__VILLAGE_WAR_DEBUG__?.game
    })`);
    const v = JSON.parse(state);
    if (v.menu && !v.game) break;
  }
  return enterSurvivalGame(ev, sleep);
}

// 每个场景都要走一遍真实 tick，所以先把公共的页内前置代码拼出来。
const PRELUDE = `
  const game = window.__VILLAGE_WAR_DEBUG__.game;
  const out = {};
  if (!game.spawnPoints?.points?.length) return JSON.stringify({ error: 'no_spawn_points' });
  const originalDelta = game.clock.getDelta.bind(game.clock);
  game.clock.getDelta = () => 0.05;
  const wasPaused = game.paused;
  game.paused = false;
  const elapsedBefore = game.elapsedTime;
  const tick = (n) => { for (let i = 0; i < n; i += 1) game.tick(); };
  // 胜利/失败判定挂在刷怪点的**规划节拍**上（SpawnPointSystem.PLAN_INTERVAL_SECONDS
  // = 0.25 秒一次）。"死 4 帧"只有 0.2 秒，**永远不够**触发一次判定——
  // 之前它只在页面 rAF 恰好补了一帧时才通过，是这个脚本最主要的抖动来源
  // （实测单独跑 3 次只过 1 次）。所以下面统一用 waitForFinish()：
  // 一直 tick 到判定真的发生，或者明确等到 2 秒（足够跨过 8 个节拍）为止。
  const waitForFinish = () => {
    for (let i = 0; i < 40 && game.levelFinished !== true; i += 1) tick(1);
    return game.levelFinished === true;
  };
  tick(4);
  // 收掉开局三选一，否则 awaitingOpeningReward 会挡住判负逻辑
  game.pendingStrategyRewards = [];
  game.awaitingOpeningReward = false;
  if (game.strategyEvent) game.strategyEvent = null;
  if (game.strategyEventUi?.root) game.strategyEventUi.root.hidden = true;
  document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
  // 抓住关卡结算结果：finishLevel 只通过 onLevelComplete 往外传
  let captured = null;
  let callbackError = null;
  const originalComplete = game.onLevelComplete;
  game.onLevelComplete = (result) => {
    captured = result ? JSON.parse(JSON.stringify(result)) : null;
    if (typeof originalComplete === 'function') {
      try { originalComplete.call(game, result); } catch (error) { callbackError = String(error && error.message ? error.message : error); }
    }
  };
`;

const TEARDOWN = `
  out.finished = game.levelFinished === true;
  out.endReason = game.levelEndReason ?? null;
  out.victory = captured ? captured.victory : null;
  out.resultEndReason = captured ? captured.endReason : null;
  out.callbackError = callbackError;
  out.elapsedAdvanced = game.elapsedTime > elapsedBefore;
  game.paused = wasPaused;
  game.clock.getDelta = originalDelta;
  return JSON.stringify(out);
`;

// ---- 场景 1：点位全清 + 残敌清空 → 判胜；野生动物不阻塞 ----
if (await startLevel()) {
  report.scenarios.victory = JSON.parse(await ev(`(() => {
    ${PRELUDE}
    const system = game.spawnPoints;
    const taggedEnemies = () => (game.enemyUnits ?? [])
      .filter((u) => u?.alive && typeof u.spawnPointId === 'string' && !u.isSpawnPointNest);
    const wildlife = (game.enemyUnits ?? []).filter((u) => u?.alive && u.isWildlife);

    // 先彻底清掉所有点位，但**留着**它们已经放出来的敌人
    tick(60);                       // 3 秒：让点位先产出一些敌人
    let spawned = taggedEnemies().length;
    if (!spawned) {
      // 还没到首批生成时间：手动放一个带归属的敌人，把"残敌阻塞"这条路径跑出来
      const point = system.points[0];
      const made = game.spawnEnemyAt?.('goblinSoldier', { x: point.x, z: point.z }, { spawnPointId: point.id });
      spawned = made ? taggedEnemies().length : 0;
    }
    system.points.slice().forEach((point) => system.destroyPoint(point.id));
    // 给判定足够的时间（见 waitForFinish 的注释）。这一步很关键：
    // "残敌会阻止通关"这条断言只有在判定**确实有机会跑过**的时候才有意义，
    // 否则它只是在测"时间还不够"。
    waitForFinish();
    out.allPointsDestroyed = system.progress().allCleared === true;
    out.taggedAliveBeforeKill = taggedEnemies().length;
    out.wildlifeAlive = wildlife.length;
    out.finishedWithLeftover = game.levelFinished === true;

    // 清掉残余敌人（野生动物保留）。
    //
    // 为什么是循环而不是"清一次"：蜘蛛卵会在点位被摧毁之后继续孵化，
    // 孵出来的蜘蛛**带着原点位的归属**，于是"刚清完又冒出一只"。
    // 单次清理会让通关判定时有时无——这个脚本此前 1/3 的通过率就是它。
    // 循环里每轮之间留两帧，让孵化、生成与判定都有机会发生。
    const clearTaggedEnemies = () => {
      for (let round = 0; round < 30; round += 1) {
        const alive = taggedEnemies();
        if (!alive.length) return 0;
        alive.forEach((unit) => {
          unit.alive = false;
          game.handleUnitDeath(unit, null);
        });
        tick(2);
      }
      return taggedEnemies().length;
    };
    out.taggedAliveAfterKill = clearTaggedEnemies();
    const plansBefore = system.stats.plans;
    waitForFinish();
    out.plansDuringWait = system.stats.plans - plansBefore;
    // 失败时能直接看出卡在哪一条上，而不是只知道"没判胜"。
    out.finalTaggedAlive = taggedEnemies().length;
    out.finalTaggedTypes = taggedEnemies().map((unit) => unit.type).slice(0, 8);
    out.finalWildlifeAlive = (game.enemyUnits ?? []).filter((u) => u?.alive && u.isWildlife).length;
    out.finalCleared = system.progress().allCleared === true;
    out.finalAliveByPoint = system.aliveByPoint();
    out.finalNestsAlive = (game.enemyUnits ?? []).filter((u) => u?.alive && u.isSpawnPointNest).length;
    out.finalLevelFinished = game.levelFinished === true;
    out.finalEndReason = game.levelEndReason ?? null;
    // 通关判定必须是**纯判定、可重复调用**：它在同一帧会被调用两次
    // （SpawnPointSystem.update() 一次、Game.checkSurvivalLevelEnd() 一次）。
    // 这条断言直接钉住那个"带锁存就会把通关吞掉"的回归。
    out.victoryIsNotLatched = system.checkVictory() === true && system.checkVictory() === true;
    out.hudText = document.querySelector('#spawn-point-count')?.textContent ?? null;
    ${TEARDOWN}
  })()`));
}

// ---- 场景 2：敌营被毁不算通关；基地被毁判负 ----
if (await startLevel()) {
  report.scenarios.baseDestruction = JSON.parse(await ev(`(() => {
    ${PRELUDE}
    // 注意：isAttack: true 时 resolveStructureDamage 会**忽略传入的 amount**，
    // 改用攻击方攻击力（BALANCE.*.damagePerAttack）。要打致死就得走非攻击形式。
    out.baseInvincible = game.playerBase.invincible === true;
    out.campInvincible = game.enemyCamp.invincible === true;

    // 敌营：打爆它，海岛关不该因此结束
    game.enemyCamp.alive = true;
    game.enemyCamp.structureDurability = Math.max(9, game.enemyCamp.structureDurability ?? 0);
    game.damageEnemyCamp(game.enemyCamp.maxHealth + 1);
    tick(4);
    out.enemyCampAlive = game.enemyCamp.alive === true;
    out.campHealth = game.enemyCamp.health;
    out.finishedAfterCampDestroyed = game.levelFinished === true;

    // 基地：打爆它 → 判负
    game.playerBase.structureDurability = Math.max(9, game.playerBase.structureDurability ?? 0);
    game.damagePlayerBase(game.playerBase.maxHealth + 1);
    out.baseAlive = game.playerBase.alive === true;
    out.baseHealth = game.playerBase.health;
    tick(4);
    ${TEARDOWN}
  })()`));
}

// ---- 场景 3：单位全灭且无补充途径 → 宽限期后判负 ----
if (await startLevel()) {
  report.scenarios.stranded = JSON.parse(await ev(`(() => {
    ${PRELUDE}
    out.unitsBefore = (game.friendlyUnits ?? []).filter((u) => u?.alive).length;
    out.canStillGetUnits = game.survivalCanStillGetUnits();
    // 杀掉所有己方单位（基地不在 friendlyUnits 里，所以基地还活着）
    (game.friendlyUnits ?? []).slice().forEach((unit) => {
      if (!unit?.alive) return;
      unit.alive = false;
      game.handleUnitDeath(unit, null);
    });
    // 保证重生产生的延迟不会被误当成"还有救"
    game.rebirthQueue = [];
    out.unitsAfter = (game.friendlyUnits ?? []).filter((u) => u?.alive).length;
    out.baseStillAlive = game.playerBase.alive === true;

    tick(2);
    out.finishedImmediately = game.levelFinished === true;   // 宽限期内不得判负
    // 走过宽限期（5 秒）：20 秒模拟时间足够
    tick(400);
    ${TEARDOWN}
  })()`));
}

// ---- 汇总 ----
const s1 = report.scenarios.victory;
const s2 = report.scenarios.baseDestruction;
const s3 = report.scenarios.stranded;
report.verdict = {
  victoryScenarioRan: Boolean(s1) && !s1.error,
  baseScenarioRan: Boolean(s2) && !s2.error,
  strandedScenarioRan: Boolean(s3) && !s3.error,
  // 1) 点位全清但还有残敌 → 不许赢
  leftoverBlocksVictory: s1?.allPointsDestroyed === true
    && s1?.taggedAliveBeforeKill > 0
    && s1?.finishedWithLeftover === false,
  // 清掉残敌后判胜；野生动物活着不影响。最后一条顺带钉住"判定不带锁存"：
  // 同一帧会被调用两次，带锁存就会把通关吞掉（详见 SpawnPointSystem.checkVictory 的注释）。
  victoryOnClearance: s1?.finished === true
    && s1?.victory === true
    && s1?.resultEndReason === 'spawn_points_cleared'
    && s1?.victoryIsNotLatched === true,
  wildlifeDoesNotBlock: s1?.wildlifeAlive > 0,
  // 2) 敌营被毁不算通关，基地被毁判负
  campDestroyedIsNotVictory: s2?.enemyCampAlive === false
    && s2?.baseInvincible === false
    && s2?.finishedAfterCampDestroyed === false,
  defeatOnBaseDestroyed: s2?.baseAlive === false
    && s2?.finished === true
    && s2?.victory === false
    && s2?.resultEndReason === 'player_base_destroyed',
  // 3) 全灭先有宽限期，之后判负
  graceBeforeDefeat: s3?.unitsAfter === 0
    && s3?.baseStillAlive === true
    && s3?.finishedImmediately === false,
  defeatWhenStranded: s3?.finished === true
    && s3?.victory === false
    && s3?.resultEndReason === 'no_units_left',
  // 帧真的推进了（三个场景都要）
  elapsedAdvanced: s1?.elapsedAdvanced === true
    && s2?.elapsedAdvanced === true
    && s3?.elapsedAdvanced === true,
  noCallbackErrors: !s1?.callbackError && !s2?.callbackError && !s3?.callbackError
};
console.log(JSON.stringify(report, null, 2));
const ok = Object.values(report.verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nISLAND VICTORY CONDITIONS: PASS' : '\nISLAND VICTORY CONDITIONS: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
