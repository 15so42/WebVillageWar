// 海岛昼夜循环验收。
// 白天 5 分钟 / 黑夜 3 分钟；白天刷怪点不出兵，入夜后才出，第 2 夜比第 1 夜更强。
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';

const CDP_PORT = Number(process.env.ISLAND_CDP_PORT || 9235);
const BASE = process.env.ISLAND_URL || 'http://127.0.0.1:3000/';

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
    timeout: 180000
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
  report.result = JSON.parse(await ev(`(() => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const spawnEnemies = () => (game.enemyUnits ?? []).filter((u) => (
      u?.alive && u.isHostileEnemy === true && u.isSpawnPointNest !== true && u.isWildlife !== true
    ));
    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    game.paused = false;

    const clock = game.dayNight;
    const hudAtBoot = {
      label: document.querySelector('#battle-time-label')?.textContent ?? '',
      time: document.querySelector('#battle-time')?.textContent ?? ''
    };
    const dayRules = {
      daySeconds: clock?.rules?.daySeconds ?? null,
      nightSeconds: clock?.rules?.nightSeconds ?? null,
      phase: clock?.phase ?? null,
      dayNumber: clock?.dayNumber ?? null,
      canSpawnAtBoot: game.canRaidSpawn?.()
    };

    const beforeDay = spawnEnemies().length;
    // "白天不出兵"要量的是**有没有新刷出来**，不是"场上数量有没有变"：
    // 白天一只开局驻军被打死，数量就会掉，旧写法（afterDay === beforeDay）会把它
    // 误判成"白天刷怪了"。所以这里同时看新 id 与刷怪点的真实出兵计数。
    const dayIdsBefore = new Set(spawnEnemies().map((u) => u.id));
    const daySpawnedStatsBefore = game.spawnPoints?.stats?.spawned ?? 0;
    for (let i = 0; i < 400; i += 1) game.tick();
    const dayEnemiesAfter = spawnEnemies();
    const afterDay = dayEnemiesAfter.length;
    const dayNew = dayEnemiesAfter.filter((u) => !dayIdsBefore.has(u.id)).length;
    const daySpawnedStatsDelta = (game.spawnPoints?.stats?.spawned ?? 0) - daySpawnedStatsBefore;

    if (clock) {
      clock.phase = 'night';
      clock.phaseElapsed = 0;
      clock.dayNumber = 1;
      game.prepareNightRaid?.();
    }
    const hudAtNight = {
      label: document.querySelector('#battle-time-label')?.textContent ?? '',
      time: document.querySelector('#battle-time')?.textContent ?? ''
    };
    // 量的必须是"这一夜**新刷出来**几个"，不是"场上总共活着几个"：
    // 开局本来就有中立/营地驻军（实测白天有 6 个 isHostileEnemy），
    // 第 1 夜从 6 涨到 10、第 2 夜从 0 涨到 4，两者的基线根本不同——
    // 旧写法拿总数比大小（10 >= 4 过、4 >= 10 挂），量到的其实是基线差，不是刷新量。
    const night1IdsBefore = new Set(spawnEnemies().map((u) => u.id));
    for (let i = 0; i < 8; i += 1) game.tick();
    const hudAfterNightTick = {
      label: document.querySelector('#battle-time-label')?.textContent ?? '',
      time: document.querySelector('#battle-time')?.textContent ?? ''
    };
    for (let i = 0; i < 392; i += 1) game.tick();
    const night1 = spawnEnemies();
    const night1Health = night1[0]?.maxHealth ?? 0;
    const night1Count = night1.length;
    const night1New = night1.filter((u) => !night1IdsBefore.has(u.id)).length;

    spawnEnemies().forEach((u) => { u.alive = false; });
    if (clock) {
      clock.phase = 'night';
      clock.phaseElapsed = 0;
      clock.dayNumber = 2;
      game.prepareNightRaid?.();
    }
    const night2IdsBefore = new Set(spawnEnemies().map((u) => u.id));
    for (let i = 0; i < 400; i += 1) game.tick();
    const night2 = spawnEnemies();
    const night2Health = night2[0]?.maxHealth ?? 0;
    const night2New = night2.filter((u) => !night2IdsBefore.has(u.id)).length;

    game.clock.getDelta = originalDelta;
    return JSON.stringify({
      dayRules,
      hudAtBoot,
      hudAtNight,
      hudAfterNightTick,
      beforeDay,
      afterDay,
      dayNew,
      daySpawnedStatsDelta,
      night1Count,
      night1New,
      night2Count: night2.length,
      night2New,
      night1Health,
      night2Health,
      bodyNightClass: document.body.classList.contains('is-survival-night'),
      sunIntensity: game.world?.lights?.sun?.intensity ?? null
    });
  })()`));
}

const r = report.result;
report.verdict = r ? {
  booted: report.started === true,
  clockPresent: r.dayRules?.phase === 'day' && r.dayRules?.daySeconds === 300 && r.dayRules?.nightSeconds === 180,
  dayHud: String(r.hudAtBoot?.label ?? '').includes('天'),
  noSpawnByDay: r.dayNew === 0 && r.daySpawnedStatsDelta === 0,
  nightHud: String(r.hudAfterNightTick?.label ?? '').includes('夜'),
  nightSpawns: r.night1New > 0,
  laterNightStronger: r.night2Health > r.night1Health,
  // 后一夜的**新刷出量**不能比前一夜少（当前设计只抬难度、不抬数量，所以允许相等）
  laterNightMore: r.night2New >= r.night1New,
  lightingDarkens: Number(r.sunIntensity) > 0 && Number(r.sunIntensity) < 3
} : null;
console.log(JSON.stringify(report, null, 2));
const ok = Boolean(report.verdict) && Object.values(report.verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nISLAND DAY NIGHT: PASS' : '\nISLAND DAY NIGHT: FAIL');
if (!ok && report.verdict) {
  Object.entries(report.verdict).forEach(([key, value]) => {
    if (!value) console.log('  fail', key);
  });
}
ws.close();
process.exit(ok ? 0 : 1);
