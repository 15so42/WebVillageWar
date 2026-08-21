// 仅调两处：山体比例（+高/-粗/-侵入）与道路弯曲幅度（减摆幅）。其余不动。CRLF/LF 兼容。
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');
let changes = 0;
function repAll(search, repl, expect = null) {
  // 同时容忍 CRLF/LF
  const variants = [search, search.replace(/\n/g, '\r\n')];
  let found = false;
  for (const v of variants) {
    const parts = txt.split(v);
    if (parts.length > 1) {
      const r = repl.replace(/\n/g, v.includes('\r\n') ? '\r\n' : '\n');
      txt = parts.join(r);
      changes += parts.length - 1;
      if (expect !== null && parts.length - 1 !== expect) {
        console.error(`COUNT MISMATCH ${expect} != ${parts.length - 1} :: ${search.slice(0, 40)}`);
        process.exit(1);
      }
      found = true;
      break;
    }
  }
  if (!found) {
    // 尝试只匹配素体（无换行）的行
    const lineSearch = search.split('\n').slice(-1)[0];
    console.error(`NOT FOUND :: ${lineSearch}`);
    process.exit(1);
  }
}

// ---- 山体比例：高 ×~1.45、深 ×0.7（更瘦更陡，少向中侵入）----
// 近层
repAll('heightMin: 3.5, heightMax: 5,', 'heightMin: 5, heightMax: 7.5,', 2);
repAll('depthMin: 5.4, depthMax: 7.2,', 'depthMin: 3.8, depthMax: 5.0,', 2);
// 中层
repAll('heightMin: 6, heightMax: 8,', 'heightMin: 8.5, heightMax: 11.5,', 2);
repAll('depthMin: 7.6, depthMax: 10.4,', 'depthMin: 5.3, depthMax: 7.3,', 2);
// 远层 + 横墙
repAll('heightMin: 10, heightMax: 14,', 'heightMin: 14, heightMax: 20,');
repAll('depthMin: 10, depthMax: 13,', 'depthMin: 7, depthMax: 9.1,');

// ---- 山体更陡：收分减弱（顶更窄、侧壁更立）----
repAll('{ y: height * 0.46, scale: 0.74, back: -depth * 0.12 },', '{ y: height * 0.46, scale: 0.84, back: -depth * 0.10 },', 1);
repAll('{ y: height, scale: 0.52, back: -depth * 0.24 }', '{ y: height, scale: 0.68, back: -depth * 0.20 }', 1);

// ---- 道路：减小横向摆动（12 锚点，仅 1-2 次轻微偏移）----
const oldPath = `    { x: 0, z: 30 },
      { x: -4, z: 27 },
      { x: -9, z: 23 },
      { x: -11, z: 18 },
      { x: -8, z: 13 },
      { x: -2, z: 8 },
      { x: 4, z: 3 },
      { x: 9, z: -3 },
      { x: 9, z: -9 },
      { x: 5, z: -15 },
      { x: -1, z: -23 },
      { x: 5, z: -35 }`;
const newPath = `    { x: 0, z: 30 },
      { x: -1, z: 26 },
      { x: -2, z: 21 },
      { x: -1, z: 16 },
      { x: 1, z: 11 },
      { x: 2, z: 6 },
      { x: 3, z: 1 },
      { x: 3, z: -5 },
      { x: 2, z: -11 },
      { x: 1, z: -17 },
      { x: 1, z: -25 },
      { x: 5, z: -35 }`;
repAll(oldPath, newPath, 1);

writeFileSync(file, txt, 'utf8');
console.log(`tuned: mountains taller/narrower/less intrusion, road gentler (${changes} edits)`);
