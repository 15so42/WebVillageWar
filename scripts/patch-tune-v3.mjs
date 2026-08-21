// 极小幅度收尾（仅 4 项）：山瘦陡/去紫、路缘略自然、左下树群稍疏。CRLF/LF 兼容。
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');
let changes = 0;
function repAll(search, repl, expect = null) {
  for (const v of [search, search.replace(/\n/g, '\r\n')]) {
    const parts = txt.split(v);
    if (parts.length > 1) {
      txt = parts.join(repl.replace(/\n/g, v.includes('\r\n') ? '\r\n' : '\n'));
      changes += parts.length - 1;
      if (expect !== null && parts.length - 1 !== expect) { console.error('COUNT', expect, parts.length - 1, search.slice(0, 30)); process.exit(1); }
      return;
    }
  }
  console.error('NOT FOUND :: ' + search.split('\n').pop().slice(0, 60));
  process.exit(1);
}

// 1) 山体形态：向中突出减少（深度×0.8）、更陡、顶更小、山脚略收
repAll('depthMin: 2.2, depthMax: 3.2,', 'depthMin: 1.8, depthMax: 2.6,', 2);
repAll('depthMin: 3.0, depthMax: 4.2,', 'depthMin: 2.4, depthMax: 3.4,', 2);
repAll('depthMin: 4.2, depthMax: 6.0,', 'depthMin: 3.4, depthMax: 4.8,', 4);
repAll('{ y: height * 0.52, scale: 0.82, back: -depth * 0.10 },', '{ y: height * 0.58, scale: 0.76, back: -depth * 0.08 },', 1);
repAll('{ y: height, scale: 0.50, back: -depth * 0.20 }', '{ y: height, scale: 0.44, back: -depth * 0.18 }', 1);

// 2) 山色：最深岩去紫、略提亮（保对比）
repAll("const rockDark = new THREE.Color('#52606d');", "const rockDark = new THREE.Color('#5b6774');", 1);

// 3) 道路：不动 pathPoints，仅路缘边缘略自然
repAll('      widthJitter: 0.22,\n      edgeJitter: 0.28', '      widthJitter: 0.25,\n      edgeJitter: 0.34', 1);

// 4) 左下重树群稍疏（count 38→30），右侧不动
repAll("{ x: -28, z: 24, rx: 9, rz: 7, count: 38,", "{ x: -28, z: 24, rx: 8, rz: 6, count: 30,", 1);

writeFileSync(file, txt, 'utf8');
console.log(`final micro-tune applied (${changes} edits)`);
