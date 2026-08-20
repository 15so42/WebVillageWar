// CDP 像素采样：连 headless Edge，找 world-preview 页，用 window.worldPreview.samplePixels
// 采样若干屏幕点（WebGL 帧缓冲颜色，不含 DOM 叠层），打印 RGBA。
// 用法: node scripts/peek-pixels.mjs [--port 9223]
import WebSocket from 'ws';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = process.argv[i + 1];
    args[key] = next && !next.startsWith('--') ? next : true;
    if (args[key] !== true) i++;
  }
}
const PORT = Number(args.port || 9223);

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const target = list.find((t) => t.type === 'page' && t.url.includes('world-preview'));
  if (!target) {
    console.error('no world-preview tab');
    process.exit(2);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
  let msgId = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolveFn, rejectFn) => {
      const id = ++msgId;
      pending.set(id, { resolveFn, rejectFn });
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.rejectFn(new Error(msg.error.message));
      else p.resolveFn(msg.result);
    }
  });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  await send('Runtime.enable');

  // 采样网格：右下角条带（samplePixels y 自下而上，所以底部= y 小值）+ 参照点
  const points = [];
  for (let gx = 0.70; gx <= 1.0; gx += 0.05) {
    for (let gy = 0.0; gy <= 0.14; gy += 0.035) {
      points.push({ x: +gx.toFixed(2), y: +gy.toFixed(2) });
    }
  }
  points.push({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.3 }, { x: 0.1, y: 0.9 });
  const res = await send('Runtime.evaluate', {
    expression: `JSON.stringify(window.worldPreview.samplePixels(${JSON.stringify(points)}))`,
    returnByValue: true,
  });
  const arr = JSON.parse(res?.result?.value || '[]');
  arr.forEach((p) => {
    const redish = p.r > 90 && p.r > p.b * 1.5 && p.r > p.g * 1.35;
    console.log(`x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} rgba=(${p.r},${p.g},${p.b})${redish ? '  <== REDDISH' : ''}`);
  });
  ws.close();
}
main().catch((e) => { console.error('peek failed:', e); process.exit(4); });
