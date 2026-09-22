// 启动自检：确认 3000 端口上的游戏能正常进主菜单并开局，页面无异常。
// 只连自己起的 headless Edge（默认 9233 端口，独立 user-data-dir）。
// CHECK_LEVEL_ID=<id> 可以指定要开的关卡，默认开选关列表里的第一项。
import WebSocket from 'ws';

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
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

const report = { url: BASE, levelId: LEVEL_ID, menuReached: false, levelSelected: null, canvas: false, launchError: null, gameStarted: false, sceneKey: null, version: null };
for (let i = 0; i < 40; i += 1) {
  await sleep(500);
  report.menuReached = await ev(`!!document.querySelector('[data-action="levels"]')`);
  if (report.menuReached) break;
}
report.version = await ev(`document.querySelector('.meta-version')?.textContent ?? null`);

if (report.menuReached) {
  await sleep(500);
  await ev(`document.querySelector('[data-action="levels"]')?.click(); true`);
  await sleep(1200);
  if (LEVEL_ID) {
    const clicked = await ev(`(() => {
      const btn = [...document.querySelectorAll('[data-action="select-level"]')]
        .find((e) => e.offsetParent !== null && (e.dataset.levelId || '').includes(${JSON.stringify(LEVEL_ID)}));
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    report.levelSelected = clicked;
    await sleep(500);
  }
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-action="start-level"]')].find(e=>e.offsetParent!==null);if(b)b.click();return true;})()`);
  for (let i = 0; i < 50; i += 1) {
    await sleep(500);
    const raw = await ev(`JSON.stringify({err: window.__VILLAGE_WAR_LAST_LAUNCH_ERROR__?.message||null, game: !!window.__VILLAGE_WAR_DEBUG__?.game})`);
    const v = JSON.parse(raw);
    if (v.err) { report.launchError = v.err; break; }
    if (v.game) { report.gameStarted = true; break; }
  }
  report.canvas = await ev(`(document.querySelector('#game-canvas')?.width ?? 0) > 400`);
  report.sceneKey = await ev(`window.__VILLAGE_WAR_DEBUG__?.game?.world?.config?.sceneKey ?? null`);
}

console.log(JSON.stringify(report, null, 2));
console.log('--- page problems:', problems.length);
console.log(problems.slice(0, 8).join('\n'));
ws.close();
process.exit(problems.length === 0 && report.gameStarted ? 0 : 1);
