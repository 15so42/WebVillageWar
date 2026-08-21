// 只改四样：山体高度/宽高比/陡峭度、山色（冷灰褐）、道路色（浅灰卡其）、冷色关系。其余不动。CRLF/LF 兼容。
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');
let changes = 0;
function repAll(search, repl, expect = null) {
  for (const v of [search, search.replace(/\n/g, '\r\n')]) {
    const parts = txt.split(v);
    if (parts.length > 1) {
      const r = repl.replace(/\n/g, v.includes('\r\n') ? '\r\n' : '\n');
      txt = parts.join(r);
      changes += parts.length - 1;
      if (expect !== null && parts.length - 1 !== expect) {
        console.error(`COUNT MISMATCH ${expect} != ${parts.length - 1} :: ${search.slice(0, 40)}`);
        process.exit(1);
      }
      return;
    }
  }
  console.error('NOT FOUND :: ' + search.split('\n').pop().slice(0, 60));
  process.exit(1);
}

// ---- 1) 山体比例：更高（×~1.7）、更窄（深×~0.55） ----
repAll('heightMin: 5, heightMax: 7.5,', 'heightMin: 8, heightMax: 12,', 2);
repAll('depthMin: 3.8, depthMax: 5.0,', 'depthMin: 2.2, depthMax: 3.2,', 2);
repAll('heightMin: 8.5, heightMax: 11.5,', 'heightMin: 14, heightMax: 19,', 2);
repAll('depthMin: 5.3, depthMax: 7.3,', 'depthMin: 3.0, depthMax: 4.2,', 2);
repAll('heightMin: 14, heightMax: 20,', 'heightMin: 22, heightMax: 32,', 4);
repAll('depthMin: 7, depthMax: 9.1,', 'depthMin: 4.2, depthMax: 6.0,', 4);

// ---- 2) 山体更陡、顶部更窄 ----
repAll('{ y: height * 0.46, scale: 0.84, back: -depth * 0.10 },', '{ y: height * 0.52, scale: 0.88, back: -depth * 0.10 },', 1);
repAll('{ y: height, scale: 0.68, back: -depth * 0.20 }', '{ y: height, scale: 0.60, back: -depth * 0.20 }', 1);

// ---- 3) 山体颜色：低饱和冷灰褐（去橙/红/紫）----
repAll("const rockLit = new THREE.Color('#d9cfc0');", "const rockLit = new THREE.Color('#b7b5af');", 1);
repAll("const rockMid = new THREE.Color('#aaa291');", "const rockMid = new THREE.Color('#959891');", 1);
repAll("const rockDark = new THREE.Color('#55627c');", "const rockDark = new THREE.Color('#52606d');", 1);
// 山带 tint 中性化 + 降强度
repAll("tint: '#b89a82', tintStrength: 0.35,", "tint: '#a5a39b', tintStrength: 0.20,", 2);
repAll("tint: '#7a8a8c', tintStrength: 0.28,", "tint: '#8b9497', tintStrength: 0.20,", 2);
repAll("tint: '#6f82a0', tintStrength: 0.52,", "tint: '#7c8592', tintStrength: 0.30,", 4);

// ---- 4) 道路颜色：浅灰卡其/冻土，去橙黄 ----
repAll("path: '#c2a888',", "path: '#b3ab9e',", 1);

writeFileSync(file, txt, 'utf8');
console.log(`tuned mountains (taller/narrower) + cool rock/road colors (${changes} edits)`);
