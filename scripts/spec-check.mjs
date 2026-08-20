// 月夜营地量化验收：直接解码 PNG（自实现最小解码器，无外部依赖），
// 全像素计算 spec（night-camp-spec.md §1）各项指标并与目标区间对照，输出 PASS/FAIL。
// 用法: node scripts/spec-check.mjs <png...> [--json <out.json>]
import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

// ---------- 最小 PNG 解码器（8-bit truecolor: colorType 2=RGB / 6=RGBA，含滤波） ----------
function decodePng(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('not a png');
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const dataStart = off + 8;
    if (type === 'IHDR') {
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
      bitDepth = buf[dataStart + 8];
      colorType = buf[dataStart + 9];
      interlace = buf[dataStart + 12];
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(dataStart, dataStart + len));
    } else if (type === 'IEND') {
      break;
    }
    off = dataStart + len + 4; // skip crc
  }
  if (bitDepth !== 8) throw new Error(`only 8-bit png supported, got ${bitDepth}`);
  if (colorType !== 2 && colorType !== 6) throw new Error(`only RGB/RGBA png supported, got ${colorType}`);
  if (interlace !== 0) throw new Error('interlaced png not supported');
  const ch = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const out = new Uint8ClampedArray(width * height * 4);
  const prev = new Uint8ClampedArray(stride);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * stride;
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = new Uint8ClampedArray(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      cur[x] = v & 0xff;
    }
    for (let x = 0; x < stride; x++) prev[x] = cur[x];
    for (let x = 0; x < width; x++) {
      const k = x * ch;
      const o = (y * width + x) * 4;
      out[o] = cur[k];
      out[o + 1] = cur[k + 1];
      out[o + 2] = cur[k + 2];
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

// ---------- 指标 ----------
function analyze(png) {
  const { width, height, data } = png;
  const n = width * height;
  let sumL = 0, sumSat = 0, satN = 0, clip = 0, dark = 0, mid = 0, deep = 0;
  let warm = 0, coolEnv = 0, dirtyGY = 0;
  const hueBuckets = {};
  // 暖光离散点：以 1/16 下采样 warm mask 做连通块统计
  const gw = 16, gh = 16;
  const cellW = Math.floor(width / gw), cellH = Math.floor(height / gh);
  const warmCells = new Uint8Array(gw * gh);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = (y * width + x) * 4;
      const r = data[k], g = data[k + 1], b = data[k + 2];
      if (r >= 250 && g >= 250 && b >= 250) clip++;
      const hsv = rgbToHsv(r, g, b);
      const v = hsv.v * 100, s = hsv.s * 100;
      sumL += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (hsv.v > 0.10) { sumSat += s; satN++; }
      if (v < 22) dark++;
      if (v >= 40 && v < 75) mid++;
      if (v < 42) deep++;
      if (s > 8 && v > 10) {
        const h = hsv.h;
        hueBuckets[Math.floor(h / 15) * 15] = (hueBuckets[Math.floor(h / 15) * 15] || 0) + 1;
        if (h >= 15 && h < 45) warm++;
        if (h >= 195 && h < 235) coolEnv++;
        if (h >= 80 && h < 120 && v < 55 && s < 35) dirtyGY++;
      }
      // warm mask（高亮火光）
      if (hsv.h >= 10 && hsv.h < 55 && hsv.s > 0.35 && hsv.v > 0.45) {
        warmCells[Math.floor(y / cellH) * gw + Math.floor(x / cellW)] = 1;
      }
    }
  }
  // 连通块计数（4邻域），面积>=2 的算一个离散暖点
  const seen = new Uint8Array(gw * gh);
  let warmSpots = 0;
  for (let i = 0; i < gw * gh; i++) {
    if (!warmCells[i] || seen[i]) continue;
    let area = 0;
    const stack = [i]; seen[i] = 1;
    while (stack.length) {
      const c = stack.pop(); area++;
      const cx = c % gw, cy = Math.floor(c / gw);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const ni = ny * gw + nx;
        if (!seen[ni] && warmCells[ni]) { seen[ni] = 1; stack.push(ni); }
      }
    }
    if (area >= 2) warmSpots++;
  }
  const pct = (v) => Math.round((v / n) * 1000) / 10;
  return {
    pixels: n, width, height,
    meanLuminancePct: Math.round((sumL / 255 / n) * 1000) / 10,
    meanSaturationPct: Math.round((sumSat / Math.max(1, satN)) * 10) / 10,
    clip250Pct: pct(clip),
    darkV22Pct: pct(dark),
    midV40_75Pct: pct(mid),
    deepV42Pct: pct(deep),
    warmH15_45Pct: pct(warm),
    coolEnvH195_235Pct: pct(coolEnv),
    dirtyGY: pct(dirtyGY),
    warmSpots: warmSpots,
    hueBuckets: hueBuckets
  };
}

const SPEC = [
  ['meanLuminancePct', [30, 55], '平均亮度'],
  ['clip250Pct', [0, 3], 'clip(≥250)占比'],
  ['darkV22Pct', [28, 58], '暗部(V<22)'],
  ['midV40_75Pct', [18, 42], '中调(40-75)'],
  ['deepV42Pct', [35, 65], '深色锚点(V<42)'],
  ['warmH15_45Pct', [4, 16], '暖色(15-45°)'],
  ['coolEnvH195_235Pct', [10, 100], '冷蓝环境(195-235°)'],
  ['meanSaturationPct', [18, 38], '平均饱和'],
  ['clip250Pct', [0, 3], 'clip 上限']
];

const args = process.argv.slice(2);
const pngs = args.filter((a) => a.endsWith('.png'));
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : null;

const results = {};
for (const path of pngs) {
  const buf = readFileSync(path);
  const png = decodePng(buf);
  const m = analyze(png);
  results[path] = m;
  console.log(`\n== ${path} (${png.width}x${png.height}) ==`);
  console.log(`  亮度 ${m.meanLuminancePct}% | clip ${m.clip250Pct}% | 暗部 ${m.darkV22Pct}% | 中调 ${m.midV40_75Pct}% | 深锚 ${m.deepV42Pct}%`);
  console.log(`  暖色 ${m.warmH15_45Pct}% | 冷蓝 ${m.coolEnvH195_235Pct}% | 饱和 ${m.meanSaturationPct}% | 脏GY ${m.dirtyGY}% | 暖光离散点 ${m.warmSpots}`);
  const fails = [];
  for (const [key, range, label] of SPEC) {
    if (!(key in m)) continue;
    const hit = m[key] >= range[0] && m[key] <= range[1];
    console.log(`  ${hit ? 'PASS' : 'FAIL'}  ${label}: ${m[key]}  目标 [${range[0]}-${range[1]}]`);
    if (!hit) fails.push(`${label}=${m[key]}`);
  }
  if (m.warmSpots < 6) { console.log(`  WARN 暖光离散点 ${m.warmSpots} < 6（光之路未成形属预期，待火把上线）`); }
}
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(results, null, 2)); console.log(`\njson -> ${jsonOut}`); }
