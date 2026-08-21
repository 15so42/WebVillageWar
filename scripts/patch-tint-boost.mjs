// 按 qoder 评分：冷暖分层再压一档（CRLF 兼容）
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');
let changes = 0;

function repOne(search, replacement) {
  const s = search.replace(/\n/g, '\r\n');
  const r = replacement.replace(/\n/g, '\r\n');
  const parts = txt.split(s);
  if (parts.length !== 2) {
    console.error(`EXPECT 1 occurrence: ${search.slice(0, 60)} (got ${parts.length - 1})`);
    process.exit(1);
  }
  txt = parts.join(r);
  changes += 1;
}

repOne("tintGeometryColors(geometry, '#a68f7d', 0.28);", "tintGeometryColors(geometry, '#a68f7d', 0.33);");
repOne("tintGeometryColors(geometry, '#6f82a0', 0.32);", "tintGeometryColors(geometry, '#6f82a0', 0.40);");
repOne("tintGeometryColors(upperGeom, '#6f82a0', 0.3);", "tintGeometryColors(upperGeom, '#6f82a0', 0.38);");

writeFileSync(file, txt, 'utf8');
console.log(`tint tier boosted (${changes} replacements)`);
