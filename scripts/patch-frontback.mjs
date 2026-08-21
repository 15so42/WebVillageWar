// 前后补山：在 boulderClusters 末尾追加南北横条大岩带（z≈±45，分左右两段留中口）。
import { readFileSync, writeFileSync } from 'node:fs';
const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');
const anchor = `      { x: 20, z: -21, rx: 5, rz: 6, count: 6, sizeMin: 0.75, sizeMax: 1.55 }`;
const add = `      { x: 20, z: -21, rx: 5, rz: 6, count: 6, sizeMin: 0.75, sizeMax: 1.55 },
      { x: -24, z: -45, rx: 15, rz: 9, count: 10, sizeMin: 5.0, sizeMax: 8.0 },
      { x: 24, z: -45, rx: 15, rz: 9, count: 10, sizeMin: 5.0, sizeMax: 8.0 },
      { x: -24, z: 45, rx: 15, rz: 9, count: 10, sizeMin: 5.0, sizeMax: 8.0 },
      { x: 24, z: 45, rx: 15, rz: 9, count: 10, sizeMin: 5.0, sizeMax: 8.0 }`;
let ok = false;
for (const v of [anchor, anchor.replace(/\n/g, '\r\n')]) {
  if (txt.includes(v)) { txt = txt.replace(v, add.replace(/\n/g, v.includes('\r\n') ? '\r\n' : '\n')); ok = true; break; }
}
if (!ok) { console.error('anchor not found'); process.exit(1); }
writeFileSync(file, txt, 'utf8');
console.log('front/back mountain bars added');
