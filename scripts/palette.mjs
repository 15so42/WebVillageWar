// 像素调色板分析：对 world-preview 各视角采样网格像素，输出色彩统计 JSON。
// 用法: node scripts/palette.mjs --out outputs/iter/palette.json [--views overview,player,ridge,horizon]
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
const BASE = args.base || 'http://127.0.0.1:3100';
const views = String(args.views || 'overview,player,ridge,horizon').split(',').filter(Boolean);
const outPath = resolve(args.out || 'outputs/iter/palette.json');
const GRID_W = 36;
const GRID_H = 20;

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s: s * 100, v: v * 100 };
}

async function connectTarget(url) {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  let target = list.find((t) => t.type === 'page' && t.url.includes('world-preview'));
  if (!target) {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    target = await res.json();
  }
  return target;
}

async function main() {
  const target = await connectTarget(`${BASE}/world-preview.html?view=overview`);
  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0;
  const pending = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  });
  await new Promise((r, rej) => { ws.on('open', r); ws.on('error', rej); });
  await send('Runtime.enable');
  await send('Page.enable');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // wait ready
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const r = await send('Runtime.evaluate', { expression: `typeof window.worldPreview !== 'undefined'`, returnByValue: true });
    if (r.result.value === true) break;
  }

  const result = {};
  for (const view of views) {
    await send('Runtime.evaluate', { expression: `window.worldPreview.setView(${JSON.stringify(view)}); 0` });
    await sleep(900);
    const points = [];
    for (let yi = 0; yi < GRID_H; yi++) {
      for (let xi = 0; xi < GRID_W; xi++) {
        points.push({ x: xi / (GRID_W - 1), y: yi / (GRID_H - 1) });
      }
    }
    const ev = await send('Runtime.evaluate', {
      expression: `window.worldPreview.samplePixels(${JSON.stringify(points)})`,
      returnByValue: true,
    });
    const pixels = ev.result.value || [];
    const hueBuckets = {};
    let satTotal = 0, satN = 0, lumTotal = 0, lumN = 0;
    let rSum = 0, gSum = 0, bSum = 0;
    let dark = 0, mid = 0, bright = 0;
    let nearWhite = 0, deepShade = 0;
    const colorCount = {};
    for (const p of pixels) {
      rSum += p.r; gSum += p.g; bSum += p.b;
      const hsv = rgbToHsv(p.r, p.g, p.b);
      const lum = hsv.v;
      lumTotal += lum; lumN++;
      satTotal += hsv.s; satN++;
      if (lum < 25) dark++; else if (lum < 70) mid++; else bright++;
      if (p.r >= 236 && p.g >= 236 && p.b >= 236) nearWhite++;
      if (hsv.v < 42) deepShade++;
      if (hsv.s > 8) {
        const bucket = Math.floor(hsv.h / 30) * 30;
        hueBuckets[bucket] = (hueBuckets[bucket] || 0) + 1;
      }
      // 粗量化色相-饱和-明度做主色统计
      const q = `${Math.round(hsv.h / 20) * 20},${Math.round(hsv.s / 12) * 12},${Math.round(hsv.v / 14) * 14}`;
      colorCount[q] = (colorCount[q] || 0) + 1;
    }
    const n = pixels.length || 1;
    const dominant = Object.entries(colorCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, c]) => ({ hsv: k, share: Math.round((c / n) * 1000) / 10 }));
    result[view] = {
      pixels: n,
      meanRGB: { r: Math.round(rSum / n), g: Math.round(gSum / n), b: Math.round(bSum / n) },
      meanSaturationPct: Math.round((satTotal / satN) * 10) / 10,
      meanLuminancePct: Math.round((lumTotal / lumN) * 10) / 10,
      luminanceBucketsPct: { dark: Math.round((dark / n) * 1000) / 10, mid: Math.round((mid / n) * 1000) / 10, bright: Math.round((bright / n) * 1000) / 10 },
      nearWhitePct: Math.round((nearWhite / n) * 1000) / 10,
      deepShadePct: Math.round((deepShade / n) * 1000) / 10,
      hueBuckets: Object.fromEntries(Object.entries(hueBuckets).map(([k, v]) => [k, Math.round((v / n) * 1000) / 10])),
      dominantColors: dominant
    };
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`saved ${outPath}`);
  ws.close();
}
main().catch((e) => { console.error('palette failed:', e); process.exit(1); });
