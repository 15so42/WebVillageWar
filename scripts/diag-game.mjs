// 诊断正式游戏入口：加载 index.html，抓 console/异常/启动错误，报告菜单与画布状态
import WebSocket from 'ws';
const PORT = 9223;
const URL = 'http://127.0.0.1:3100/';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
let target = list.find((t) => t.type === 'page' && t.url.includes('127.0.0.1:3100'));
if (!target) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL)}`, { method: 'PUT' });
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
  else if (m.method === 'Runtime.consoleAPICalled') logs.push(`[console.${m.params.type}] ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  else if (m.method === 'Runtime.exceptionThrown') logs.push(`[exception] ${m.params.exceptionDetails?.text ?? ''} ${m.params.exceptionDetails?.exception?.description ?? ''}`);
  else if (m.method === 'Log.entryAdded') logs.push(`[log.${m.params.entry.level}] ${m.params.entry.text}`);
});
await new Promise((r, rej) => { ws.on('open', r); ws.on('error', rej); });
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__errs=[]; window.addEventListener('error',(e)=>window.__errs.push('err:'+(e.message||'')+' @ '+(e.filename||'')+':'+(e.lineno||''))); window.addEventListener('unhandledrejection',(e)=>window.__errs.push('rej:'+((e.reason&&(e.reason.message||String(e.reason)))||'')));`
});
await send('Page.navigate', { url: URL });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let report = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({ title: document.title, hasLaunchError: !!window.__VILLAGE_WAR_LAST_LAUNCH_ERROR__, launchError: window.__VILLAGE_WAR_LAST_LAUNCH_ERROR__, errs: window.__errs||[], canvas: !!document.querySelector('#game-canvas'), appKids: (document.querySelector('#app')?.children?.length)||0, menuButtons: document.querySelectorAll('button').length })`,
    returnByValue: true,
  });
  try { const v = JSON.parse(r.result.value); if (v.appKids > 0 || v.canvas) { report = v; if (v.hasLaunchError || (v.errs||[]).length) break; if (i >= 15) break; } } catch {}
}
console.log(JSON.stringify(report, null, 2));
console.log('--- page logs (first 25) ---');
console.log(logs.slice(0, 25).join('\n'));
ws.close();
process.exit(0);
