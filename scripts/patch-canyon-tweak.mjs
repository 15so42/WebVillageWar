// 按 qoder 评分修 canyon 岩壁：台地抬高/冷暖加强/近台加高加密（CRLF 兼容）
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');
let changes = 0;

function repAll(search, replacement, expect = null) {
  const s = search.replace(/\n/g, '\r\n');
  const r = replacement.replace(/\n/g, '\r\n');
  const parts = txt.split(s);
  if (parts.length === 1) {
    console.error(`NOT FOUND: ${search.slice(0, 60)}`);
    process.exit(1);
  }
  if (expect !== null && parts.length - 1 !== expect) {
    console.error(`COUNT MISMATCH for ${search.slice(0, 60)}: expected ${expect}, got ${parts.length - 1}`);
    process.exit(1);
  }
  txt = parts.join(r);
  changes += parts.length - 1;
}

// 1) 近层岩台加高 + 豁口收紧（近左/近右 band 配置各 1 处 => 2）
repAll('heightMin: 4.5, heightMax: 7.5,', 'heightMin: 6, heightMax: 9,', 2);
repAll('gapChance: 0.35,', 'gapChance: 0.22,', 2);
// 2) 暖冷分层加强（函数体内各 1 处）
repAll("tintGeometryColors(geometry, '#a68f7d', 0.15);", "tintGeometryColors(geometry, '#a68f7d', 0.28);", 1);
repAll("tintGeometryColors(geometry, '#7a8a9a', 0.22);", "tintGeometryColors(geometry, '#6f82a0', 0.32);", 1);
repAll("tintGeometryColors(upperGeom, '#7a8a9a', 0.25);", "tintGeometryColors(upperGeom, '#6f82a0', 0.3);", 1);
// 3) 上层台地架高，露出垂直崖面；backShift 外移（函数体内各 1 处）
repAll('groundY - 0.3 + height * (0.42 + random() * 0.12),', 'groundY - 0.3 + height * (0.72 + random() * 0.10),', 1);
repAll('band.side * (depth * 0.22 + 0.5 + random())', 'band.side * (depth * 0.30 + 0.5 + random())', 1);

writeFileSync(file, txt, 'utf8');
console.log(`canyon tweaks applied (${changes} replacements)`);
