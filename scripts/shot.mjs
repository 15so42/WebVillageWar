// CDP 截图管线：连接 headless Edge(remote-debugging) → 打开指定 URL →
// 等待 window.worldPreview 就绪 → 切相机视角 → 等渲染帧 → Page.captureScreenshot 落盘。
// 用法: node scripts/shot.mjs --url <url> --out <path.png> [--view overview|player|ridge|horizon]
//       [--port 9223] [--target <x,y,z> --yaw <r> --pitch <r> --distance <n>] [--wait <ms>]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
const url = args.url;
const outPath = resolve(args.out || 'outputs/shot.png');
const view = args.view || null;
const waitMs = Number(args.wait || 1600);

if (!url) {
  console.error('missing --url');
  process.exit(1);
}

function parseVec(str) {
  return String(str).split(',').map((s) => parseFloat(s));
}

async function main() {
  // 新建 or 复用 world-preview 标签页
  let target;
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page' && t.url.includes('world-preview'));
  } catch (e) {
    console.error('CDP list failed:', e.message);
    process.exit(2);
  }
  if (!target) {
    const res = await fetch(
      `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`,
      { method: 'PUT' }
    );
    target = await res.json();
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

  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url });

  // 等 worldPreview 就绪（最多 ~60s，headless swiftshader 首次编译 shader 较慢）
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let ready = false;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const res = await send('Runtime.evaluate', {
      expression: `typeof window.worldPreview !== 'undefined' && window.worldPreview.renderer !== undefined`,
      returnByValue: true,
    });
    if (res?.result?.value === true) { ready = true; break; }
  }
  if (!ready) {
    console.error('worldPreview not ready');
    ws.close();
    process.exit(3);
  }

  // 切视角
  if (view) {
    await send('Runtime.evaluate', {
      expression: `window.worldPreview.setView(${JSON.stringify(view)})`,
    });
  }
  if (args.target) {
    const t = parseVec(args.target);
    const expr = `window.worldPreview.setCamera(${JSON.stringify({
      target: t, yaw: Number(args.yaw || 0), pitch: Number(args.pitch || 0), distance: Number(args.distance || 90),
    })})`;
    await send('Runtime.evaluate', { expression: expr });
  }

  // 等渲染帧稳定
  await sleep(waitMs);
  const cap = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, Buffer.from(cap.data, 'base64'));
  const stat = (await import('node:fs')).statSync(outPath);
  console.log(`saved ${outPath} (${stat.size} bytes)`);
  ws.close();
}

main().catch((e) => {
  console.error('shot failed:', e);
  process.exit(4);
});
