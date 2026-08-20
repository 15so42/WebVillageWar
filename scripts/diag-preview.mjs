// 诊断：打开 world-preview 页并打印控制台/异常/就绪状态，用于排查 headless 渲染失败
import WebSocket from 'ws';
import process from 'node:process';

const PORT = 9223;
const URL = 'http://127.0.0.1:3100/world-preview.html?view=overview';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
let target = list.find((t) => t.type === 'page' && t.url.includes('world-preview'));
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
  else if (m.method === 'Runtime.consoleAPICalled') {
    logs.push(`[console.${m.params.type}] ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  } else if (m.method === 'Runtime.exceptionThrown') {
    logs.push(`[exception] ${m.params.exceptionDetails?.text ?? ''} ${m.params.exceptionDetails?.exception?.description ?? ''}`);
  } else if (m.method === 'Log.entryAdded') {
    logs.push(`[log.${m.params.entry.level}] ${m.params.entry.text}`);
  }
});
await new Promise((r, rej) => { ws.on('open', r); ws.on('error', rej); });
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.navigate', { url: URL });

// 同时捕获模块加载错误（window.onerror / unhandledrejection 注入在导航前需要 page.addScriptToEvaluateOnNewDocument）
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__errs = [];
    window.addEventListener('error', (e) => window.__errs.push('error: ' + (e.message||'') + ' @ ' + (e.filename||'') + ':' + (e.lineno||'')));
    window.addEventListener('unhandledrejection', (e) => window.__errs.push('unhandledrejection: ' + (e.reason ? (e.reason.message || String(e.reason)) : '')));
  `,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 24; i++) {
  await sleep(500);
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({ ready: typeof window.worldPreview !== 'undefined', errs: window.__errs || [], title: document.title, webgl: (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch(e){ return 'err:'+e.message; } })() })`,
    returnByValue: true,
  });
  const v = JSON.parse(r.result.value);
  if (v.ready || i === 23) {
    console.log(JSON.stringify(v, null, 2));
    if (!v.ready) { console.log('--- page logs ---'); console.log(logs.join('\n')); }
    break;
  }
}
ws.close();
process.exit(0);
