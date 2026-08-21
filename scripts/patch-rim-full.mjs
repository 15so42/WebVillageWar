// 把左右外侧山铺成覆盖全程 z(−44..+44) 的连续外环（互相重叠、贴图边）。其余不动。CRLF/LF 兼容。
import { readFileSync, writeFileSync } from 'node:fs';
const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');

const oldBlock = `      { x: -44, z: 6, rx: 4.6, rz: 26, count: 15, sizeMin: 1.5, sizeMax: 2.5 },
      { x: -45, z: -28, rx: 5.0, rz: 18, count: 13, sizeMin: 1.5, sizeMax: 2.6 },
      { x: -46, z: 38, rx: 4.6, rz: 10, count: 11, sizeMin: 1.45, sizeMax: 2.4 },
      { x: 42, z: 22, rx: 6.0, rz: 22, count: 16, sizeMin: 1.6, sizeMax: 2.7 },
      { x: 45, z: -14, rx: 4.5, rz: 24, count: 14, sizeMin: 1.5, sizeMax: 2.5 },
      { x: 46, z: -38, rx: 5.0, rz: 13, count: 12, sizeMin: 1.5, sizeMax: 2.6 },
      { x: 45, z: 36, rx: 4.6, rz: 10, count: 11, sizeMin: 1.45, sizeMax: 2.4 },`;

function rim(side) {
  const zs = [-40, -29, -18, -7, 4, 15, 26, 37, 42];
  const x = side < 0 ? -45 : 45;
  return zs.map((z, i) => {
    const rz = i === 8 ? 7 : 13;
    const count = 11 + (i % 3);
    const sizeMin = 1.4 + (i % 3) * 0.05;
    const sizeMax = 2.5 + (i % 2) * 0.1;
    return `      { x: ${x}, z: ${z}, rx: 5.0, rz: ${rz}, count: ${count}, sizeMin: ${sizeMin.toFixed(2)}, sizeMax: ${sizeMax.toFixed(2)} },`;
  }).join('\n');
}
const newBlock = rim(-1) + '\n' + rim(1);

let ok = false;
for (const v of [oldBlock, oldBlock.replace(/\n/g, '\r\n')]) {
  if (txt.includes(v)) { txt = txt.replace(v, newBlock.replace(/\n/g, v.includes('\r\n') ? '\r\n' : '\n')); ok = true; break; }
}
if (!ok) { console.error('outer boulder block not found'); process.exit(1); }
writeFileSync(file, txt, 'utf8');
console.log('full-map side mountain rim laid (9 bands/side)');
