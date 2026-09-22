// 所有脚本的语法自检。
//
// 为什么值得单独一条测试：验收脚本的页内代码写在模板字符串里，
// **注释里出现一个反引号就会提前结束模板**，整个文件变成语法错误。
// 这类错在改动时很容易带进来（本项目已经踩过两次），而它不会在运行时"失败"，
// 而是让脚本直接崩掉——如果只在需要时才跑那个脚本，就会拖到很晚才发现。
// 这里把 scripts/ 下所有 .mjs 过一遍 node --check，让全量测试循环顺带守住它。
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here)
  .filter((name) => name.endsWith('.mjs'))
  .sort();

const failures = [];
files.forEach((name) => {
  const target = join(here, name);
  try {
    execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' });
  } catch (error) {
    const detail = String(error?.stderr ?? error?.message ?? '').trim().split('\n').slice(0, 3).join(' | ');
    failures.push(`${name}: ${detail}`);
  }
});

// 至少要有几个脚本，避免"目录读不到"被当成全部通过
if (files.length < 10) {
  console.log(`FAIL 只找到 ${files.length} 个脚本，目录读取可能有问题`);
  process.exit(1);
}

if (failures.length) {
  console.log(`FAIL ${failures.length}/${files.length} 个脚本语法错误：`);
  failures.forEach((line) => console.log(`  - ${line}`));
  process.exit(1);
}

console.log(`ok   ${files.length} 个脚本语法全部通过`);
console.log(`\n1/1 通过`);
