// 山体往里靠：近/中/远 x 收近 + 横墙端点同步（CRLF 兼容）
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');
let changes = 0;
function rep(expected, search, repl) {
  const s = search.replace(/\n/g, '\r\n');
  const r = repl.replace(/\n/g, '\r\n');
  const parts = txt.split(s);
  if (parts.length - 1 !== expected) {
    console.error(`COUNT ${parts.length - 1} != ${expected} :: ${search.slice(0, 50)}`);
    process.exit(1);
  }
  txt = parts.join(r);
  changes += parts.length - 1;
}

// 近层
rep(1, "name: 'near-left', side: -1, x: -15,", "name: 'near-left', side: -1, x: -11,");
rep(1, "name: 'near-right', side: 1, x: 15,", "name: 'near-right', side: 1, x: 11,");
// 中层
rep(1, "name: 'mid-left', side: -1, x: -32,", "name: 'mid-left', side: -1, x: -22,");
rep(1, "name: 'mid-right', side: 1, x: 32,", "name: 'mid-right', side: 1, x: 22,");
// 远层
rep(1, "name: 'far-left', side: -1, x: -42,", "name: 'far-left', side: -1, x: -32,");
rep(1, "name: 'far-right', side: 1, x: 42,", "name: 'far-right', side: 1, x: 32,");
// 南北横墙端点（2 处）→ 缩到 ±34 与远壁咬合
rep(2, "xMin: -42, xMax: 42,", "xMin: -34, xMax: 34,");

writeFileSync(file, txt, 'utf8');
console.log(`walls moved inward (${changes} edits)`);
