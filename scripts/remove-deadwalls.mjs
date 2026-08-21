// 删除未接线的峡谷墙系统死代码（按函数名 brace 匹配），随后校验无残留。
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');

const deadFns = [
  'createSnowCanyonWalls',
  'buildCanyonWallSegments',
  'addCanyonWallSegment',
  'addCanyonWallDetail',
  'createFacetedWallGeometry',
  'collectCanyonWallObstacles',
  'fitCanyonSegment',
  'resetCanyonWallSegments',
  'registerCanyonWallSegment',
  'canyonWallInsetAt'
];
// 注意：getWallLiftAt / CANYON_WALL_SEGMENTS 被活函数 placeOnTerrainOrWall 引用，必须保留。
// paintCleanTerraceFaces / fixOutwardNormals 为无引用小孤儿，暂保留（无害）。

function removeFunction(text, name) {
  const re = new RegExp('function ' + name + '\\s*\\(', 'g');
  let out = text;
  while (true) {
    const m = re.exec(out);
    if (!m) break;
    const start = m.index;
    // 向前吃掉接在前面的注释与空行（至少一个函数体）
    let s = start;
    const prefix = out.slice(0, start);
    const nl = prefix.lastIndexOf('\n');
    let preComment = prefix.slice(Math.max(0, nl + 1), start);
    // 吃掉紧邻的 // 注释行
    let lineStart = start;
    while (lineStart > 0) {
      const prev = out.lastIndexOf('\n', lineStart - 1);
      const line = out.slice(prev + 1, lineStart).trim();
      if (line.startsWith('//')) { lineStart = prev + 1; continue; }
      break;
    }
    // 找开括号
    const open = out.indexOf('{', m.index + m[0].length);
    if (open < 0) { console.error('no brace for ' + name); break; }
    // 从 open 起匹配花括号（粗略字符串/注释忽略）
    let depth = 0;
    let i = open;
    let inStr = null;
    for (; i < out.length; i++) {
      const ch = out[i];
      if (inStr) {
        if (ch === '\\') { i++; continue; }
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
      if (ch === '/') {
        const nx = out[i + 1];
        if (nx === '/') { while (i < out.length && out[i] !== '\n') i++; continue; }
        if (nx === '*') { i += 2; while (i < out.length && !(out[i] === '*' && out[i + 1] === '/')) i++; i++; continue; }
      }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) break; }
    }
    const end = i + 1;
    out = out.slice(0, lineStart) + out.slice(end);
    re.lastIndex = 0;
  }
  return out;
}

let removed = 0;
for (const name of deadFns) {
  if (txt.includes('function ' + name + '(')) {
    txt = removeFunction(txt, name);
    removed += 1;
  }
}
// 删除 CANYON_WALL_SEGMENTS 常量（保留 getWallLiftAt/CANYON_WALL_SEGMENTS 供 placeOnTerrainOrWall）
const constRe = /const CANYON_WALL_SEGMENTS\s*=\s*\[\s*\];/;
if (constRe.test(txt)) { /* 保留 */ }

// 校验：在去除注释后的代码里不应再有引用
const codeOnly = txt
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ')
  .replace(/`[^`]*`|"[^"]*"|'[^']*'/g, ' ');
const names = deadFns; // getWallLiftAt/CANYON_WALL_SEGMENTS 保留
const leftover = names.filter((n) => new RegExp('\\b' + n + '\\b').test(codeOnly));
if (leftover.length) {
  console.error('STILL REFERENCED (code):', leftover.join(', '));
  process.exit(1);
}

writeFileSync(file, txt, 'utf8');
console.log(`dead canyon-wall code removed (${removed} blocks)`);
