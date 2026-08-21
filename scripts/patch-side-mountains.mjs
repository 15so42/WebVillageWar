// 延长并加密两侧外圈山：boulderClusters 覆盖全 z（相机平移不再露缺山）。CRLF/LF 兼容。
import { readFileSync, writeFileSync } from 'node:fs';
const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');

const oldBlock = `      { x: -44, z: 8, rx: 4.6, rz: 17, count: 13, sizeMin: 1.5, sizeMax: 2.5 },
      { x: 42, z: 22, rx: 6, rz: 13, count: 15, sizeMin: 1.6, sizeMax: 2.7 },
      { x: 45, z: -14, rx: 4.5, rz: 15, count: 12, sizeMin: 1.5, sizeMax: 2.5 },`;

const newBlock = `      { x: -44, z: 6, rx: 4.6, rz: 26, count: 15, sizeMin: 1.5, sizeMax: 2.5 },
      { x: -45, z: -28, rx: 5.0, rz: 18, count: 13, sizeMin: 1.5, sizeMax: 2.6 },
      { x: -46, z: 38, rx: 4.6, rz: 10, count: 11, sizeMin: 1.45, sizeMax: 2.4 },
      { x: 42, z: 22, rx: 6.0, rz: 22, count: 16, sizeMin: 1.6, sizeMax: 2.7 },
      { x: 45, z: -14, rx: 4.5, rz: 24, count: 14, sizeMin: 1.5, sizeMax: 2.5 },
      { x: 46, z: -38, rx: 5.0, rz: 13, count: 12, sizeMin: 1.5, sizeMax: 2.6 },
      { x: 45, z: 36, rx: 4.6, rz: 10, count: 11, sizeMin: 1.45, sizeMax: 2.4 },`;

let ok = false;
for (const v of [oldBlock, oldBlock.replace(/\n/g, '\r\n')]) {
  if (txt.includes(v)) { txt = txt.replace(v, newBlock.replace(/\n/g, v.includes('\r\n') ? '\r\n' : '\n')); ok = true; break; }
}
if (!ok) { console.error('boulder head not found'); process.exit(1); }
writeFileSync(file, txt, 'utf8');
console.log('side mountains extended + densified');
