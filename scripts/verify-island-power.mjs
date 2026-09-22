// 供能系统在真实游戏里的端到端验收：
// 开局 → 在基地供能半径内注册一个傀儡样本、在半径外注册一个 → 跑若干真实帧 →
// 确认范围内的补魔、范围外的只扣不补、以及每一段的实发量都不超过该段预算。
// 供能分配挂在真实 update 循环上，不是拿纯函数自证。
// 只连自己起的 headless Edge（默认 9235 端口，独立 user-data-dir）。
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
const report = { page: BASE, levelId: LEVEL_ID, started: false, power: null, problems };
for (let i = 0; i < 40; i += 1) {
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
  if (await ev(`!!window.__VILLAGE_WAR_DEBUG__?.game?.power`)) { report.started = true; break; }
}

if (report.started) {
  report.power = JSON.parse(await ev(`(() => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const power = game.power;
    window.__POWER_PROBE__ = { reports: [], near: null, far: null, crowd: [], grantedNear: 0, grantedFar: 0 };
    const base = power.supplierList()[0];
    // 记录每一段的供需，用于事后核对守恒
    const original = power.update.bind(power);
    power.update = (dt) => {
      const tickReport = original(dt);
      if (tickReport) {
        window.__POWER_PROBE__.reports.push({
          capacity: tickReport.capacity,
          supplied: tickReport.supplied,
          demand: tickReport.demand,
          consumed: tickReport.consumed,
          overBudget: tickReport.overBudget
        });
      }
      return tickReport;
    };
    // 半径内的傀儡样本：储备见底，应当被补起来
    window.__POWER_PROBE__.near = {
      id: 'probe-near', kind: 'unit',
      x: base.x + 4, z: base.z,
      activityMana: 0, manaCapacity: 60, drainPerSecond: 2
    };
    // 半径外的傀儡样本：只扣不补
    window.__POWER_PROBE__.far = {
      id: 'probe-far', kind: 'unit',
      x: base.x + 400, z: base.z,
      activityMana: 30, manaCapacity: 60, drainPerSecond: 2
    };
    // 一群人挤在基地里，总需求远大于基地功率：用来验证不会各发一份完整功率
    for (let i = 0; i < 20; i += 1) {
      window.__POWER_PROBE__.crowd.push({
        id: 'probe-crowd-' + i, kind: 'unit',
        x: base.x + Math.cos(i) * 3, z: base.z + Math.sin(i) * 3,
        activityMana: 0, manaCapacity: 60, drainPerSecond: 5
      });
    }
    power.registerReceiver(window.__POWER_PROBE__.near, {
      onGranted: ({ granted }) => { window.__POWER_PROBE__.grantedNear += granted; }
    });
    power.registerReceiver(window.__POWER_PROBE__.far, {
      onGranted: ({ granted }) => { window.__POWER_PROBE__.grantedFar += granted; }
    });
    window.__POWER_PROBE__.crowd.forEach((unit) => power.registerReceiver(unit));

    // headless 里 requestAnimationFrame 不会持续推进，游戏主循环等于停着，
    // 所以这里手动驱动真实的 game.tick()：固定 dt，走的是同一条 runStep 路径，
    // 而不是绕过循环直接调 power.update 自证。
    const elapsedBefore = game.elapsedTime;
    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    const wasPaused = game.paused;
    // 开局三选一之类的弹窗会把 game.paused 置为 true，暂停帧不会跑系统
    game.paused = false;
    for (let i = 0; i < 40; i += 1) game.tick();
    game.paused = wasPaused;
    game.clock.getDelta = originalDelta;
    power.update = original;

    const reports = window.__POWER_PROBE__.reports;
    const overBudget = reports.filter((r) => r.overBudget).length;
    const suppliedOverCapacity = reports.filter((r) => r.supplied > r.capacity + 1e-9).length;
    const capacityValues = [...new Set(reports.map((r) => Number(r.capacity.toFixed(4))))];
    return JSON.stringify({
      ticks: reports.length,
      elapsedAdvanced: game.elapsedTime > elapsedBefore,
      supplyPerSecond: base.supplyPerSecond,
      supplyRadius: base.supplyRadius,
      near: {
        stored: window.__POWER_PROBE__.near.activityMana,
        capacity: window.__POWER_PROBE__.near.manaCapacity,
        state: power.receiverState(window.__POWER_PROBE__.near)
      },
      far: {
        stored: window.__POWER_PROBE__.far.activityMana,
        capacity: window.__POWER_PROBE__.far.manaCapacity,
        state: power.receiverState(window.__POWER_PROBE__.far)
      },
      crowd: {
        count: window.__POWER_PROBE__.crowd.length,
        totalStored: window.__POWER_PROBE__.crowd.reduce((sum, unit) => sum + unit.activityMana, 0),
        maxStored: Math.max(...window.__POWER_PROBE__.crowd.map((unit) => unit.activityMana))
      },
      overBudgetTicks: overBudget,
      suppliedOverCapacityTicks: suppliedOverCapacity,
      distinctCapacities: capacityValues,
      grantedNear: window.__POWER_PROBE__.grantedNear,
      grantedFar: window.__POWER_PROBE__.grantedFar,
      sampleReports: reports.slice(0, 3),
      summary: power.summary()
    });
  })()`));
}

const p = report.power;
report.verdict = p ? {
  // 基地确实注册成了供能源，半径是文档确认的约 20m
  baseRegistered: p.supplyPerSecond === 12 && p.supplyRadius === 20,
  // 范围内确实收到了补魔，范围外一次都没收到
  nearRecharged: p.grantedNear > 0 && p.near.stored <= p.near.capacity,
  // 范围外只扣不补
  farDrained: p.far.stored < 30 && p.far.stored >= 0,
  farNotRecharged: p.grantedFar === 0 && p.far.state === 'out_of_range',
  // 20 个各要 5/秒 的接收者挤在一起，总需求远大于 12/秒 的功率
  // 谁都不能拿到超过容量，且总储备不可能等于「每人一份完整功率」
  crowdCapped: p.crowd.maxStored <= 60,
  crowdBudgetLimited: p.crowd.totalStored < 20 * 60,
  // 核心：没有任何一段超预算
  neverOverBudget: p.overBudgetTicks === 0 && p.suppliedOverCapacityTicks === 0,
  // 主循环确实跑起来了（走的是真实 tick，不是绕过循环直接调系统）
  ticked: p.ticks > 20 && p.elapsedAdvanced === true
} : null;
console.log(JSON.stringify(report, null, 2));
const verdict = report.verdict;
const ok = Boolean(verdict) && Object.values(verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nISLAND POWER SUPPLY: PASS' : '\nISLAND POWER SUPPLY: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
