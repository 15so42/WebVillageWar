// 启动自检：确认 3000 端口上的游戏能正常进主菜单并开局，页面无异常。
// 只连自己起的 headless Edge（默认 9233 端口，独立 user-data-dir）。
// CHECK_LEVEL_ID=<id> 可以指定要开的关卡，默认开选关列表里的第一项。
import WebSocket from 'ws';
import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = Number(process.env.CHECK_CDP_PORT || 9233);
const BASE = process.env.CHECK_URL || 'http://127.0.0.1:3000/';
const LEVEL_ID = process.env.CHECK_LEVEL_ID || null;

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
let target = list.find((t) => t.type === 'page');
if (!target) {
  target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' })).json();
}
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
await send('Page.navigate', { url: BASE });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 页内代码抛错时 Runtime.evaluate 只回一个 undefined，
// 不检查 exceptionDetails 的话失败会伪装成 '"undefined" is not valid JSON'。
const ev = async (expr) => {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, timeout: 120000 });
  if (res.exceptionDetails) {
    throw new Error('page eval failed: ' + (res.exceptionDetails.exception?.description ?? res.exceptionDetails.text));
  }
  return res.result.value;
};

const report = { url: BASE, menuReached: false, canvas: false, launchError: null, gameStarted: false, sceneKey: null, version: null, menuActions: [] };
for (let i = 0; i < 40; i += 1) {
  await sleep(500);
  report.menuReached = await ev(`!!document.querySelector('[data-action="start-game"]')`);
  if (report.menuReached) break;
}
report.version = await ev(`document.querySelector('.mw-menu-version')?.textContent ?? null`);
// 主菜单现在只该有这几个动作：开始游戏 / 更新日志 / 清档（联机入口保留但禁用）
report.menuActions = await ev(`[...document.querySelectorAll('[data-action]')].filter((e) => e.offsetParent !== null).map((e) => e.dataset.action)`);
// 菜单截图：菜单是这一版改动最大的界面，留一张图比断言更好复核
try {
  mkdirSync('outputs', { recursive: true });
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync('outputs/boot-menu.png', Buffer.from(shot.data, 'base64'));
} catch { /* 截图失败不影响启动判定 */ }

if (report.menuReached) {
  await ev(`document.querySelector('[data-action="start-game"]')?.click(); true`);
  for (let i = 0; i < 50; i += 1) {
    await sleep(500);
    const raw = await ev(`JSON.stringify({err: window.__VILLAGE_WAR_LAST_LAUNCH_ERROR__?.message||null, game: !!window.__VILLAGE_WAR_DEBUG__?.game})`);
    const v = JSON.parse(raw);
    if (v.err) { report.launchError = v.err; break; }
    if (v.game) { report.gameStarted = true; break; }
  }
  report.canvas = await ev(`(document.querySelector('#game-canvas')?.width ?? 0) > 400`);
  report.sceneKey = await ev(`window.__VILLAGE_WAR_DEBUG__?.game?.world?.config?.sceneKey ?? null`);
  // 进入场景之后：卡牌时代的流程与界面都不该出现。
  // 可见性判定**沿祖先链检查**——只读元素自身的 computed style 会把"父元素带 hidden"
  // 的节点误报成可见（银币就被这么误报过一次，害我顺着错线索改了一轮 CSS）。
  try {
    report.inGame = JSON.parse(await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    const visible = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return 'missing';
      let node = el;
      while (node && node !== document.documentElement) {
        const cs = getComputedStyle(node);
        if (node.hidden || cs.display === 'none' || cs.visibility === 'hidden') return 'hidden';
        node = node.parentElement;
      }
      return 'VISIBLE';
    };
    return JSON.stringify({
      bodyIsSurvival: document.body.classList.contains('is-survival-level'),
      awaitingOpeningReward: g.awaitingOpeningReward === true,
      pendingStrategyRewards: (g.pendingStrategyRewards ?? []).length,
      strategyEvent: Boolean(g.strategyEvent),
      paused: g.paused === true,
      cardSystemRemoved: g.cardSystem === null || g.cardSystem === undefined,
      dayNight: {
        phase: g.dayNight?.phase ?? null,
        daySeconds: g.dayNight?.rules?.daySeconds ?? null,
        nightSeconds: g.dayNight?.rules?.nightSeconds ?? null,
        canRaidSpawn: g.canRaidSpawn?.()
      },
      hudClock: document.querySelector('#battle-time-label')?.textContent ?? '',
      ui: {
        cardHand: visible('#card-hand'),
        silver: visible('.hud-resource-data'),
        waveCounter: visible('#wave-label'),
        spawnPointMeter: visible('#spawn-point-meter')
      }
    });
  })()`));
  } catch (error) {
    // 页面代码抛错（多半是构造函数挂了）：把错误记下来，别让脚本自己崩掉，
    // 否则下面的 problems 与判定结果都打印不出来，排查只能靠猜。
    report.inGameError = String(error?.message ?? error);
    report.launchError = report.launchError ?? await ev(`window.__VILLAGE_WAR_LAST_LAUNCH_ERROR__?.message ?? null`).catch(() => null);
  }
}

console.log(JSON.stringify(report, null, 2));
console.log('--- page problems:', problems.length);
console.log(problems.slice(0, 8).join('\n'));
ws.close();
// 判定标准：菜单出现、点开始游戏后进到生存地图、画布有尺寸、页面无报错；
// 主菜单**没有**残留的旧系统入口（选关/炼金/图鉴/附魔图鉴）；
// 进入场景之后**没有**任何卡牌时代的流程或界面（开局三选一、策略事件、手牌、银币），
// 而生存 HUD 该在的要在（刷怪点进度）。
const legacyActions = ['levels', 'upgrades', 'guide', 'encyclopedia', 'start-level'];
const lingeringLegacy = (report.menuActions ?? []).filter((a) => legacyActions.includes(a));
if (lingeringLegacy.length) console.log('--- 主菜单仍有旧入口:', lingeringLegacy.join(', '));
const g = report.inGame ?? null;
const survivalFlowClean = Boolean(g)
  && g.bodyIsSurvival === true
  && g.awaitingOpeningReward === false
  && g.pendingStrategyRewards === 0
  && g.strategyEvent === false
  && g.paused === false
  && g.cardSystemRemoved === true
  && g.dayNight?.phase === 'day'
  && g.dayNight?.daySeconds === 300
  && g.dayNight?.nightSeconds === 180
  && g.dayNight?.canRaidSpawn === false;
const survivalUiClean = Boolean(g)
  && g.ui.cardHand === 'hidden'
  && g.ui.silver === 'hidden'
  && g.ui.waveCounter === 'hidden'
  && g.ui.spawnPointMeter === 'VISIBLE';
if (!survivalFlowClean) console.log('--- 卡牌时代流程仍触发:', JSON.stringify(g));
if (!survivalUiClean) console.log('--- 界面状态不符:', JSON.stringify(g?.ui));
process.exit(
  problems.length === 0
  && report.gameStarted
  && report.sceneKey === 'island-survival'
  && lingeringLegacy.length === 0
  && survivalFlowClean
  && survivalUiClean
    ? 0
    : 1
);
