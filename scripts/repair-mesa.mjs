// 修复：切掉删除脚本留下/吞掉的孤儿段（从 stray ")"到下一个顶层 function/const）
import { readFileSync, writeFileSync } from 'node:fs';
const t = readFileSync('src/world/createWorld.js', 'utf8');
let lines = t.split('\n');
let ops = 0;
// 优先处理熔掉函数的"无头体"：找到 ")" 且之后紧跟 "// 低模梯田式断块" 的孤儿
for (let i = 0; i < lines.length - 1; i++) {
  if ((lines[i].trim() === ') {') && /低模梯田式断块/.test(lines[i + 1] || '')) {
    let end = i + 1;
    while (end < lines.length && !/^(function |const |let )/.test(lines[end])) end++;
    // 顺便把后面可能还跟着的无头尾随也一起考虑：保持简单，切到下一个顶层定义
    console.log('cut', i + 1, '->', end, '::', (lines[i] || '').trim());
    lines = lines.slice(0, i).concat(lines.slice(end));
    ops++;
    break;
  }
}
writeFileSync('src/world/createWorld.js', lines.join('\n'), 'utf8');
console.log('repair ops:', ops);
