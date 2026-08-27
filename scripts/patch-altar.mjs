// 祭坛不压路：respite (0,14) → (-8,15)，其余不动。
import { readFileSync, writeFileSync } from 'node:fs';
const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');
const oldS = `{ id: 'respite-altar-northwest', type: 'respite', position: { x: 0, z: 14 }, rotation: 0.15, clearingRadius: 6.2 }`;
const newS = `{ id: 'respite-altar-northwest', type: 'respite', position: { x: -8, z: 15 }, rotation: 0.35, clearingRadius: 6.2 }`;
let ok = false;
for (const v of [oldS, oldS.replace(/\n/g, '\r\n')]) {
  if (txt.includes(v)) { txt = txt.replace(v, newS.replace(/\n/g, v.includes('\r\n') ? '\r\n' : '\n')); ok = true; break; }
}
if (!ok) { console.error('altar line not found'); process.exit(1); }
writeFileSync(file, txt, 'utf8');
console.log('respite altar moved off the road');
