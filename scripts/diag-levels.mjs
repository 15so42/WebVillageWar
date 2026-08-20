// 诊断关卡列表菜单：点击"踏上征途"后 dump 可见文本 + 候选元素，找到第一关选择器
import WebSocket from 'ws';
const PORT = 9223;
const BASE = 'http://127.0.0.1:3100/';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
let target = list.find((t) => t.type === 'page' && String(t.url).includes('127.0.0.1:3100'));
if (!target) { const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' }); target = await res.json(); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
await new Promise((r, rej) => { ws.on('open', r); ws.on('error', rej); });
await send('Runtime.enable');
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { await sleep(500); if (await ev(`!!document.querySelector('[data-action="levels"]')`)) break; }
await ev(`document.querySelector('[data-action="levels"]')?.click(); true`);
await sleep(1500);
console.log('=== BODY TEXT (前 800) ===');
console.log(await ev(`document.body.innerText.slice(0,800)`));
console.log('=== 带 level/data-id 的元素 ===');
console.log(await ev(`JSON.stringify([...document.querySelectorAll('[id],[data-id],[data-action],[data-level-id],.level-card,.level-item,[class*=level]')].map(e=>({tag:e.tagName,id:e.id,dataId:e.getAttribute('data-id'),act:e.getAttribute('data-action'),txt:(e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,28),vis:e.offsetParent!==null})).slice(0,80))`));
ws.close(); process.exit(0);
