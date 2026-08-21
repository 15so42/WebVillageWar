// 修复：删除 boulderClusters 数组外游离的 x=±45 行，并在数组内重新插入大块外环。
import { readFileSync, writeFileSync } from 'node:fs';
const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');
let lines = txt.split('\n');

const H = lines.findIndex((l) => l.includes('boulderClusters: ['));
if (H < 0) { console.error('no header'); process.exit(1); }
// 闭合行：header 之后第一个 /^\s*],\s*$/
let C = -1;
for (let i = H + 1; i < lines.length; i++) { if (/^\s*\],\s*$/.test(lines[i])) { C = i; break; } }
if (C < 0) { console.error('no close'); process.exit(1); }

// 1) 删除 H 之前所有游离的 x=±45 行
const before = lines.slice(0, H).filter((l) => !/^\s*\{\s*x:\s*-?45,/.test(l));
// 2) 外环（放在头后）：每侧 6 段大块，z -44..42，尺寸5-9，覆盖全程
function rim(side) {
  const zs = [-44, -27, -9, 9, 27, 42];
  const x = side < 0 ? -45 : 45;
  return zs.map((z, i) => {
    const rz = (i === 0 || i === 5) ? 16 : 20;
    return `      { x: ${x}, z: ${z}, rx: 8.0, rz: ${rz}, count: 7, sizeMin: 5.0, sizeMax: 9.0 },`;
  }).join('\n');
}
// 3) H..C 之间是原数组内容（内部岩群）；去掉其中也可能残留的 x±45 行
const inner = lines.slice(H + 1, C).filter((l) => !/^\s*\{\s*x:\s*-?45,/.test(l));
const rebuilt = before
  .concat(['boulderClusters: ['])
  .concat(rim(-1).split('\n'))
  .concat(rim(1).split('\n'))
  .concat(inner)
  .concat(['    ]']);
// 4) C 之后原样
const after = lines.slice(C + 1);
txt = rebuilt.concat(after).join('\n');
writeFileSync(file, txt, 'utf8');
console.log('repaired: big rim inside array, interior kept');
