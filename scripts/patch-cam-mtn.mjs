// 相机更新 + 山体外移（正则全局）。CRLF 兼容（按行级操作，避开 EOL 问题）。
import { readFileSync, writeFileSync } from 'node:fs';
const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');
let n = 0;

// ① 相机
let ok = false;
for (const rep of [
  txt.replace('initialPosition: { x: 0.847, y: 37.396, z: 73.57 }', 'initialPosition: { x: -0.313, y: 37.396, z: 83.759 }')
]) {
  if (rep !== txt) { txt = rep; n++; ok = true; break; }
}
if (!ok) { console.error('camera line not found'); process.exit(1); }

// ② 外圈山：x -45→-48、x 45→48（仅限 boulderClusters 区段）
const start = txt.indexOf('boulderClusters: [');
const endA = txt.indexOf('landmarkBoulders:', start);
if (start < 0 || endA < 0) { console.error('region nf'); process.exit(1); }
let region = txt.slice(start, endA);
let cnt = 0;
region = region.replace(/\{ x: -45, /g, (m) => { cnt++; return '{ x: -48, '; });
region = region.replace(/\{ x: 45, /g, (m) => { cnt++; return '{ x: 48, '; });
region = region.replace(/\{ x: -24, z: -45,/g, (m) => { cnt++; return '{ x: -24, z: -48,'; });
region = region.replace(/\{ x: 24, z: -45,/g, (m) => { cnt++; return '{ x: 24, z: -48,'; });
region = region.replace(/\{ x: -24, z: 45,/g, (m) => { cnt++; return '{ x: -24, z: 48,'; });
region = region.replace(/\{ x: 24, z: 45,/g, (m) => { cnt++; return '{ x: 24, z: 48,'; });
if (cnt < 6) { console.error('too few rim shifts', cnt); process.exit(1); }
txt = txt.slice(0, start) + region + txt.slice(endA);
n += cnt;

writeFileSync(file, txt, 'utf8');
console.log(`camera updated + mountains moved outward (${n} edits)`);
