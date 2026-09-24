// 静态检查：Game.js 里 `this.xxx(` 调用了但文件里**没有定义**的方法名。
//
// 为什么需要它：删掉方法之后，残留的调用点只会在"那条路径真的跑到"时才抛错。
// 靠启动一次报一个太慢（而且有些路径启动阶段根本不跑，会漏到很晚）。
// 这个检查一次性把全部悬空调用列出来。
//
// 排除项：JS 内置/宿主方法、以及运行时动态挂上去的名字（在文件里以 `this.x = `
// 或 `Object.assign(this...` 形式出现）。
import { readFileSync } from 'node:fs';

const PATH = process.argv[2] ?? 'src/systems/Game.js';
const source = readFileSync(PATH, 'utf8');
const lines = source.split('\n');

// 1) 已定义的方法名（两空格缩进的类方法）
const defined = new Set();
lines.forEach((line) => {
  const m = /^ {2}(?:async )?([A-Za-z_$][\w$]*)\s*\(/.exec(line);
  if (m) defined.add(m[1]);
});
// 2) 运行时赋值的方法名（this.x = ... / this.x = function / Object.assign(this, {...})）
for (const m of source.matchAll(/this\.([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
for (const block of source.matchAll(/Object\.assign\(\s*this\s*,\s*\{([\s\S]*?)\}\s*\)/g)) {
  for (const m of block[1].matchAll(/([A-Za-z_$][\w$]*)\s*[:,]/g)) defined.add(m[1]);
}
// 3) 继承/宿主/内置：这些不是本文件定义的
const EXTERNAL = new Set([
  // 常见内置
  'toString', 'constructor', 'hasOwnProperty', 'valueOf', 'bind', 'call', 'apply',
  // 浏览器 / three
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'getContext', 'toDataURL',
  // 本项目里由其它系统在构造期挂上去的（在别的文件里赋值）
  'tick', 'update', 'render', 'resize', 'start', 'stop', 'destroy', 'dispose'
]);

// 4) 收集所有 this.x( 调用
const calls = new Map();
lines.forEach((line, i) => {
  for (const m of line.matchAll(/this\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[1];
    if (defined.has(name) || EXTERNAL.has(name)) continue;
    if (!calls.has(name)) calls.set(name, []);
    calls.get(name).push(i + 1);
  }
});

const entries = [...calls.entries()].sort((a, b) => b[1].length - a[1].length);
console.log(`疑似悬空调用 ${entries.length} 个名字（共 ${entries.reduce((s, [, v]) => s + v.length, 0)} 处）：\n`);
for (const [name, at] of entries) {
  console.log(`  ${String(at.length).padStart(3)} 处  this.${name}()  行 ${at.slice(0, 6).join(', ')}${at.length > 6 ? ' …' : ''}`);
}
// 非零退出：回归套件靠退出码判定（没有悬空调用才算通过）
process.exit(entries.length === 0 ? 0 : 1);
