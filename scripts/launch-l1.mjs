// 驱动真实游戏进入第一关，截取"开局初始相机"帧：
// 菜单 → 踏上征途 → 第一关(雪原) → 等待游戏启动 → Page.captureScreenshot
import { writeFileSync } from 'node:fs';
import WebSocket from 'ws';

const PORT = 9223;
const BASE = 'http://127.0.0.1:3100/';
const OUT = 'C:/WebProjects/WebVillageWar/outputs/iter/l1-initial.png';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
let target = list.find((t) => t.type === 'page' && String(t.url).includes('127.0.0.1:3100'));
if (!target) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' });
  target = await res.json();
}
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 0;
const pending = new Map();
const logs = [];
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails?.text ?? '') + ' ' + (m.params.exceptionDetails?.exception?.description ?? ''));
  else if (m.method === 'Runtime.consoleAPICalled') { const t = m.params.args.map((a) => a.value ?? a.description ?? '').join(' '); if (/error|fail|exception/i.test(t + (m.params.type || ''))) logs.push('[console.' + m.params.type + '] ' + t); }
});
await new Promise((r, rej) => { ws.on('open', r); ws.on('error', rej); });
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr, byVal = true) => (await send('Runtime.evaluate', { expression: expr, returnByValue: byVal })).result.value;

// 1) 等主菜单
for (let i = 0; i < 40; i++) { await sleep(500); if (await ev(`!!document.querySelector('[data-action="levels"]')`)) break; }
// 2) 点"踏上征途"
await sleep(600); await ev(`document.querySelector('[data-action="levels"]')?.click(); true`);
await sleep(1200);
// 3) 雪谷营地默认已选中；保险起见点第一个 select-level（雪谷），再点开始战斗
const lvl = await ev(`(()=>{const s=[...document.querySelectorAll('[data-action="select-level"]')].find(e=>e.offsetParent!==null);if(s){s.click();return (s.textContent||'').trim().replace(/\\s+/g,' ').slice(0,18);}return 'no-level';})()`);
console.log('LVL:', lvl);
await sleep(600);
const start = await ev(`(()=>{const b=[...document.querySelectorAll('[data-action="start-level"]')].find(e=>e.offsetParent!==null);if(b){b.click();return 'clicked';}return 'no-start';})()`);
console.log('START:', start);

// 5) 等待游戏启动（canvas 变大 / HUD 出现 / 无启动错误）
let started = false, err = null;
for (let i = 0; i < 60; i++) {
  await sleep(500);
  const s = await ev(`JSON.stringify({err: window.__VILLAGE_WAR_LAST_LAUNCH_ERROR__||null, wave: (document.querySelector('#wave-label')?.offsetParent !== null), canvasW: document.querySelector('#game-canvas')?.width||0, fps: !!document.querySelector('#fps-meter')})`);
  const v = JSON.parse(s);
  if (v.err) { err = v.err.message; break; }
  if (v.wave && v.canvasW > 400) { started = true; break; }
}
console.log('STARTED:', started, 'ERR:', err);
await sleep(2500); // 让首帧渲染稳定
const cap = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
writeFileSync(OUT, Buffer.from(cap.data, 'base64'));
console.log('SAVED', OUT);
console.log('--- errors logged ', logs.length, logs.slice(0,12).join(' | '));
ws.close();
process.exit(0);
