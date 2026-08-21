// 边缘山加大：外环 x=±45 的岩体 sizeMin/sizeMax 提升、带加宽、数量略增。其余不动。CRLF 兼容。
import { readFileSync, writeFileSync } from 'node:fs';
const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');

// 定位 boulderClusters 数组并只改 x: -45 / x: 45 的行
const start = txt.indexOf('boulderClusters: [');
const endA = txt.indexOf('],', start);
if (start < 0 || endA < 0) { console.error('boulderClusters not found'); process.exit(1); }
const region = txt.slice(start, endA + 2);
const lines = region.split('\n');
let n = 0;
const out = lines.map((line) => {
  const m = line.match(/\{ x: (-?45|45), /);
  if (!m) return line;
  const replaced = line
    .replace(/count: \d+/, 'count: 14')
    .replace(/rx: [\d.]+/, 'rx: 6.5')
    .replace(/sizeMin: [\d.]+/, 'sizeMin: 2.4')
    .replace(/sizeMax: [\d.]+/, 'sizeMax: 5.0');
  n++;
  return replaced;
});
if (n === 0) { console.error('no x=±45 rim rows found'); process.exit(1); }
txt = txt.slice(0, start) + out.join('\n') + txt.slice(endA + 2);
writeFileSync(file, txt, 'utf8');
console.log(`edge mountains enlarged (${n} rim rows)`);
