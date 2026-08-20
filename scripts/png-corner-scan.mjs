// 专门扫描 PNG 右下角区域（x 0.85..1.0, y 0.78..1.0 顶部原点），看是否有"红主导"像素（r>b 且 r>g）。
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

function decodePng(buf) {
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const dataStart = off + 8;
    if (type === 'IHDR') { width = buf.readUInt32BE(dataStart); height = buf.readUInt32BE(dataStart + 4); bitDepth = buf[dataStart + 8]; colorType = buf[dataStart + 9]; interlace = buf[dataStart + 12]; }
    else if (type === 'IDAT') idat.push(buf.subarray(dataStart, dataStart + len));
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
    const filter = raw[y * (stride + 1)]; const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)); const cur = new Uint8ClampedArray(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
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
const { width, height, data } = decodePng(readFileSync(file));
function scanCorner(label, x0, x1, y0, y1) {
  let redDominant = 0, maxRed = 0, maxPt = null;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > b && r > g) redDominant += 1;
      if (r > maxRed) { maxRed = r; maxPt = [x, y, r, g, b]; }
    }
  }
  console.log(`[${label}] x[${x0}..${x1}] y[${y0}..${y1}]  red-dominant=${redDominant}  maxr=${maxPt}`);
}
const qx = Math.floor(width * 0.2), qy = Math.floor(height * 0.28);
scanCorner('bottom-right', width - qx, width - 1, height - qy, height - 1);
scanCorner('bottom-left', 0, qx, height - qy, height - 1);
scanCorner('top-right', width - qx, width - 1, 0, qy);
scanCorner('top-left', 0, qx, 0, qy);
