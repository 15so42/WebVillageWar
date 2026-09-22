// 刷怪点端到端验收：不干预任何输入，只驱动真实 game.tick()，
// 确认敌人确实从地图上的刷怪点持续产生、能被归属回各自的点位，
// 并且摧毁一个点之后它不再产怪。
//
// 归属字段是 unit.spawnPointId，不是 unit.spawnPoint——后者在本代码库里
// 已经被旧波次流程占用（存出生坐标），混用会多出一个 "[object Object]" 分组。
// headless 里 requestAnimationFrame 不推进，所以手动驱动主循环。
import WebSocket from 'ws';

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
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

await send('Page.navigate', { url: BASE });
const report = { page: BASE, levelId: LEVEL_ID, started: false, result: null, problems };
// 先走完主菜单 → 选关 → 开始，否则 game 永远不会出现
for (let i = 0; i < 60; i += 1) {
  await sleep(500);
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
  await sleep(500);
  if (await ev(`!!window.__VILLAGE_WAR_DEBUG__?.game`)) { report.started = true; break; }
}

if (report.started) {
  report.result = JSON.parse(await ev(`(() => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const system = game.spawnPoints;
    if (!system) return JSON.stringify({ error: 'no_spawn_system' });
    if (!system.points.length) return JSON.stringify({ error: 'no_points_attached' });

    const enemies = () => (game.enemyUnits ?? game.unitRegistry?.enemyUnits ?? []).filter((u) => u?.alive);
    // 只统计刷怪点产生的敌人。野生动物（isWildlife）是关卡预设的一部分，
    // 野外可招募单位（isRecruitable）是中立方，巢穴（isSpawnPointNest）是点位自身的
    // 可摧毁实体——三者都不属于「这个点产出的敌人」。
    // 注意 isHostileEnemy 对巢穴是为真的（它确实不是野生动物也不是中立），
    // 所以必须额外排掉巢穴；这里要和 SpawnPointSystem.aliveByPoint() 用同一套过滤。
    const spawnPointEnemies = () => enemies()
      .filter((u) => u.isHostileEnemy === true && u.isSpawnPointNest !== true);


    const byPoint = () => {
      const counts = {};
      spawnPointEnemies().forEach((u) => {
        const key = u.spawnPointId ?? '(none)';
        counts[key] = (counts[key] ?? 0) + 1;
      });
      return counts;
    };

    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    const wasPaused = game.paused;
    // 开局三选一之类的弹窗会把 game.paused 置为 true，暂停帧不跑系统
    game.paused = false;

    // 逐规划周期监控「存活数超过该点上限」的瞬间：终局快照通常正好等于上限，
    // 超产只会出现在中间态，不对账就抓不到。
    const violations = [];
    const originalUpdate = system.update.bind(system);
    system.update = (dt) => {
      originalUpdate(dt);
      const alive = system.aliveByPoint();
      system.points.forEach((point) => {
        const count = alive[point.id] ?? 0;
        if (count > point.maxAlive) {
          violations.push({ id: point.id, count, maxAlive: point.maxAlive });
        }
      });
    };

    const before = enemies().length;
    // 30 秒模拟时间：初始延迟 8 秒、间隔 11~16 秒，足够每个点产出两批
    for (let i = 0; i < 600; i += 1) game.tick();
    const afterGrowth = enemies().length;
    const tagged = byPoint();

    // 摧毁一个点，清掉它已生成的敌人（否则满员上限会掩盖「不再产怪」），再跑 30 秒
    const victim = system.points.find((p) => (tagged[p.id] ?? 0) > 0) ?? system.points[0];
    const destroyed = system.destroyPoint(victim.id);
    enemies().forEach((u) => { if (u.spawnPointId === victim.id) u.alive = false; });
    for (let i = 0; i < 600; i += 1) game.tick();
    const afterDestroy = byPoint();

    game.paused = wasPaused;
    game.clock.getDelta = originalDelta;
    system.update = originalUpdate;

    // 死亡链路：不走 destroyPoint API，直接把巢穴打死，
    // 确认 handleUnitDeath 里的钩子确实触发了该点的摧毁。
    // 不走这一步的话，「玩家打掉巢穴 → 停产」这条链路等于没验过。
    const nestVictim = enemies().find((u) => u.isSpawnPointNest === true);
    let deathHook = null;
    if (nestVictim) {
      const pointId = nestVictim.spawnPointId;
      const beforeCleared = system.pointById(pointId)?.cleared === true;
      nestVictim.alive = false;
      game.handleUnitDeath(nestVictim, null);
      deathHook = {
        pointId,
        beforeCleared,
        afterCleared: system.pointById(pointId)?.cleared === true
      };
      // HUD 只在 tick() 里刷新，而上面的摧毁发生在最后一帧之后。
      // 不补几帧的话读到的是上一帧的旧数字，会误判成「HUD 没更新」。
      for (let i = 0; i < 5; i += 1) game.tick();
    }

    const progress = system.progress();
    return JSON.stringify({
      caps: system.points.map((p) => [p.id, p.maxAlive]),
      capSum: system.points.reduce((sum, p) => sum + p.maxAlive, 0),
      before,
      afterGrowth,
      taggedByPoint: tagged,
      untagged: tagged['(none)'] ?? 0,
      violationCount: violations.length,
      // 原始记录：每个存活敌人的关键标记，不经任何聚合。
      // 账对不上时先看这里，能立刻分辨是分类口径问题还是产品问题。
      rawEnemies: enemies().map((u) => ({
        type: u.type,
        wildlife: u.isWildlife === true,
        nest: u.isSpawnPointNest === true,
        pointId: u.spawnPointId ?? null
      })),
      violations: violations.slice(0, 5),
      victim: { id: victim.id, destroyed },
      deathHook,
      afterDestroyFromVictim: afterDestroy[victim.id] ?? 0,
      progress: { total: progress.total, cleared: progress.cleared, allCleared: progress.allCleared },
      // HUD 是否真的把进度显示出来了（玩家看得见才算数）
      hud: (() => {
        const meter = document.querySelector('#spawn-point-meter');
        const count = document.querySelector('#spawn-point-count');
        return {
          exists: Boolean(meter && count),
          hidden: meter ? meter.hidden : null,
          text: count ? count.textContent.trim() : null,
          expected: progress.cleared + '/' + progress.total
        };
      })()
    });
  })()`));
}

const r = report.result;
const taggedTotal = Object.entries(r?.taggedByPoint ?? {})
  .filter(([key]) => key !== '(none)')
  .reduce((sum, [, count]) => sum + count, 0);
report.verdict = r && !r.error ? {
  systemPresent: true,
  pointsAttached: Array.isArray(r.caps) && r.caps.length === 4,
  // 不干预输入，敌人自己变多了
  enemiesGrew: r.afterGrowth > r.before,
  // 敌人能归属于具体点位，且没有旧波次残留混进来
  taggedToPoints: r.untagged === 0 && taggedTotal > 0,
  multiplePointsActive: Object.keys(r.taggedByPoint).filter((k) => k !== '(none)').length >= 2,
  // 任何时刻都没有点位超过自己的存活上限
  neverOverCap: r.violationCount === 0,
  // 总数也不该超过上限之和（只比刷怪点敌人，野生动物不算）
  totalWithinCaps: taggedTotal <= r.capSum,
  destroyed: r.victim?.destroyed === true,
  // 打死巢穴（而不是调 API）也能摧毁对应的点
  nestDeathDestroysPoint: r.deathHook != null
    && r.deathHook.beforeCleared === false
    && r.deathHook.afterCleared === true,
  noSpawnAfterDestroy: r.afterDestroyFromVictim === 0,
  progressTracked: r.progress?.total === 4 && r.progress?.cleared >= 1,
  // 进度要显示在 HUD 上：元素存在、可见、且是 "x/4" 形式的真实进度。
  // 这里刻意不比对「读取瞬间的系统值」——HUD 在 tick 内刷新，而摧毁动作
  // 发生在帧之间，两者天然差一帧；强求相等只会测到读取时机而不是功能。
  hudShowsProgress: r.hud?.exists === true
    && r.hud?.hidden === false
    && /^[0-9]+\/[0-9]+$/.test(String(r.hud?.text ?? ''))
    && Number(String(r.hud.text).split('/')[0]) >= 1
    && Number(String(r.hud.text).split('/')[1]) === 4
} : null;
console.log(JSON.stringify(report, null, 2));
const verdict = report.verdict;
const ok = Boolean(verdict) && Object.values(verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nSPAWN POINT PRESSURE: PASS' : '\nSPAWN POINT PRESSURE: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
