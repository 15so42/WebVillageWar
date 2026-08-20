// 列出主菜单按钮的 text/attr，用于定位"进入第一关"的点击目标
import WebSocket from 'ws';
const PORT = 9223;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && String(t.url).includes('127.0.0.1:3100'));
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
await new Promise((r, rej) => { ws.on('open', r); ws.on('error', rej); });
await send('Runtime.enable');
const r = await send('Runtime.evaluate', {
  expression: `JSON.stringify([...document.querySelectorAll('button, [role=button], .level-item, .menu-item')].map(e=>({t:(e.textContent||'').trim().slice(0,24), cls:(e.className||'').toString().slice(0,40), act:e.getAttribute&&e.getAttribute('data-action'), id:e.id})).slice(0,60))`,
  returnByValue: true,
});
console.log(r.result.value);
ws.close(); process.exit(0);
