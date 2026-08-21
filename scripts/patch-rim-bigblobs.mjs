// 边缘山改大块：合并小碎块为每侧大段（尺寸 5-9m、rz 加长覆盖全程 z、与道路边大山同量级）。CRLF 兼容。
import { readFileSync, writeFileSync } from 'node:fs';
const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');

const start = txt.indexOf('boulderClusters: [');
const endA = txt.indexOf('],', start);
if (start < 0 || endA < 0) { console.error('nof'); process.exit(1); }
const region = txt.slice(start, endA + 2);
const lines = region.split('\n');

const isRim = (line) => /\{ x: (-?45), /.test(line);
const rimLines = lines.filter(isRim);
if (rimLines.length === 0) { console.error('no rim'); process.exit(1); }
const firstNonRim = lines.findIndex((l) => !isRim(l));

function rimSet(side) {
  const zs = [-44, -27, -9, 9, 27, 42];
  const x = side < 0 ? -45 : 45;
  return zs.map((z, i) => {
    const rz = i === 0 || i === 5 ? 16 : 20;
    return `      { x: ${x}, z: ${z}, rx: 8.0, rz: ${rz}, count: 7, sizeMin: 5.0, sizeMax: 9.0 },`;
  }).join('\n');
}
const newRim = rimSet(-1) + '\n' + rimSet(1);

const kept = lines.filter((l) => !isRim(l));
const outLines = lines.slice(0, firstNonRim).concat(newRim.split('\n')).concat(kept);
txt = txt.slice(0, start) + outLines.join('\n') + txt.slice(endA + 2);
writeFileSync(file, txt, 'utf8');
console.log(`edge rim → big masses (6/side, size5-9, full-z)`);
