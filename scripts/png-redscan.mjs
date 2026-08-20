// PNG 强红像素扫描：自实现 8-bit RGB/RGBA 解码，找出"非火光"的强红圆标（r 高、g/b 低）。
// 用法: node scripts/png-redscan.mjs <png> [--json out]
import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

function decodePng(buf) {
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const dataStart = off + 8;
    if (type === 'IHDR') {
      width = buf.readUInt32BE(dataStart); height = buf.readUInt32BE(dataStart + 4);
      bitDepth = buf[dataStart + 8]; colorType = buf[dataStart + 9]; interlace = buf[dataStart + 12];
    } else if (type === 'IDAT') idat.push(buf.subarray(dataStart, dataStart + len));
    else if (type === 'IEND') break;
    off = dataStart + len + 4;
  }
  const ch = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const out = new Uint8ClampedArray(width * height * 4);
  const prev = new Uint8ClampedArray(stride);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8ClampedArray(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = row[i];
      if (filter === 1) v += a; else if (filter === 2) v += b; else if (filter === 3) v += (a + b) >> 1; else if (filter === 4) v += paeth(a, b, c);
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      out[di] = cur[x * ch]; out[di + 1] = cur[x * ch + 1]; out[di + 2] = cur[x * ch + 2];
      out[di + 3] = ch === 4 ? cur[x * ch + 3] : 255;
    }
    prev.set(cur);
  }
  return { width, height, data: out };
}

const file = process.argv[2];
if (!file) { console.error('missing png'); process.exit(1); }
const { width, height, data } = decodePng(readFileSync(file));
const pts = [];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // 强红（与火光橙区分：g 很低、b 更低）
    if (r > 130 && g < 95 && b < 95 && r > g * 1.7 && r > b * 1.7) pts.push([x, y, r, g, b]);
  }
}
if (pts.length === 0) {
  console.log(`no strong-red pixels in ${file} (${width}x${height})`);
  process.exit(0);
}
let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, total = 0;
pts.forEach(([x, y]) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; total += 1; });
console.log(`strong-red pixels: ${total}`);
console.log(`bbox x[${minX}..${maxX}] y[${minY}..${maxY}]  (w=${maxX - minX + 1}, h=${maxY - minY + 1})`);
console.log(`normalized: x[${(minX / width).toFixed(3)}..${(maxX / width).toFixed(3)}] y[${(minY / height).toFixed(3)}..${(maxY / height).toFixed(3)}]`);
// 列出若干代表点颜色
for (let k = 0; k < Math.min(6, pts.length); k++) {
  const [x, y, r, g, b] = pts[k];
  console.log(`  sample (${x},${y}) rgb=(${r},${g},${b})`);
}
