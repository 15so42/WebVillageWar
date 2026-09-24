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
    for (let i = 0; i < 400; i += 1) game.tick();
    const afterDay = spawnEnemies().length;

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
    for (let i = 0; i < 8; i += 1) game.tick();
    const hudAfterNightTick = {
      label: document.querySelector('#battle-time-label')?.textContent ?? '',
      time: document.querySelector('#battle-time')?.textContent ?? ''
    };
    for (let i = 0; i < 392; i += 1) game.tick();
    const night1 = spawnEnemies();
    const night1Health = night1[0]?.maxHealth ?? 0;
    const night1Count = night1.length;

    spawnEnemies().forEach((u) => { u.alive = false; });
    if (clock) {
      clock.phase = 'night';
      clock.phaseElapsed = 0;
      clock.dayNumber = 2;
      game.prepareNightRaid?.();
    }
    for (let i = 0; i < 400; i += 1) game.tick();
    const night2 = spawnEnemies();
    const night2Health = night2[0]?.maxHealth ?? 0;

    game.clock.getDelta = originalDelta;
    return JSON.stringify({
      dayRules,
      hudAtBoot,
      hudAtNight,
      hudAfterNightTick,
      beforeDay,
      afterDay,
      night1Count,
      night2Count: night2.length,
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
  noSpawnByDay: r.afterDay === r.beforeDay,
  nightHud: String(r.hudAfterNightTick?.label ?? '').includes('夜'),
  nightSpawns: r.night1Count > 0,
  laterNightStronger: r.night2Health > r.night1Health,
  laterNightMore: r.night2Count >= r.night1Count,
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
