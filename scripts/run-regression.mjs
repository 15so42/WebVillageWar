// 全量回归：单元测试 + 五关启动 + 游戏内验收，一条命令跑完。
//
// 为什么要有这个脚本：这份清单此前只存在于每次敲的命令行里，容易漏项、也没记录。
// 现在它是仓库里的可复核事实。
//
// 关于重试：连续跑 21 个游戏内脚本时，先后出现过 3 次"批量里失败、单独跑必过"
// （verify-field-recruit 与 verify-rune-stone-play 各若干次），原因是负载下等待超时，
// 不是产品回归。所以这里**失败重试一次**，但会把"重试才过"打印成 PASS(retry)——
// 抖动人眼可见，不会被当成正常通过悄悄吞掉。重试后仍失败才算失败。
//
// 用法：
//   node scripts/run-regression.mjs                # 全部
//   node scripts/run-regression.mjs --skip-unit    # 只跑游戏内验收
//   node scripts/run-regression.mjs --only verify-island-opening
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const skipUnit = args.includes('--skip-unit');
const onlyIndex = args.indexOf('--only');
const only = onlyIndex >= 0 ? args[onlyIndex + 1] : null;

const CDP_ENV = {
  ISLAND_CDP_PORT: process.env.ISLAND_CDP_PORT ?? '9235',
  CHECK_CDP_PORT: process.env.CHECK_CDP_PORT ?? '9235'
};

const VERIFICATIONS = [
  // 开局链路（编制 / 威胁 / 逃跑 / 迎战 / 拆巢奖励）由这一条统一覆盖：
  // 它接管了已删除的 verify-island-opening，因为"开局可通关性"现在完全等于
  // "一支傀儡装上武器能不能拆掉起始巢穴"，那条链上的每一步都在这里断言。
  'verify-island-puppet-combat',
  'verify-island-ai-combat',
  'verify-island-base-laser',
  'verify-island-resources',
  'verify-island-power',
  'verify-island-worker',
  'verify-island-work-animation',
  'verify-island-spawn-points',
  'verify-island-day-night',
  'verify-island-drops',
  'verify-island-victory',
  'verify-island-rewards',
  'verify-island-production',
  'verify-island-fuel-power',
  'verify-island-research',
  'verify-island-planting',
  'verify-island-facilities',
  'verify-island-tech-effects',
  'verify-island-expedition',
  'verify-island-defense-survival',
  'verify-backpack-ui',
  'verify-backpack-transfer',
  'verify-backpack-craft-refund',
  'verify-item-transfer',
  'verify-item-hotbar',
  'verify-weapon-swap',
  'verify-field-recruit',
  'verify-island-recruit-source',
  'verify-rune-stone-play',
  'capture-island-preview'
];

function run(command, argv, { timeout = 900_000 } = {}) {
  return spawnSync(command, argv, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout,
    env: { ...process.env, ...CDP_ENV }
  });
}

const summary = [];

function record(name, status, detail = '') {
  summary.push({ name, status });
  const mark = status === 'pass' ? 'PASS' : status === 'retry' ? 'PASS(retry)' : 'FAIL';
  console.log(`${mark.padEnd(12)} ${name}${detail ? '  ' + detail : ''}`);
}

// ---- 1) 单元测试 ----
if (!skipUnit && !only) {
  const scripts = JSON.parse(
    spawnSync('node', ['-e', "console.log(JSON.stringify(require('./package.json').scripts))"], { encoding: 'utf8' }).stdout
  );
  const names = Object.keys(scripts).filter((key) => key.startsWith('test:')).sort();
  console.log(`--- 单元测试（${names.length} 个脚本）---`);
  for (const name of names) {
    // 直接解析出 "node scripts/xxx.mjs" 并运行 node，而不是走 npm：
    // Windows 上 npm 是 npm.cmd，spawnSync('npm', ...) 会 ENOENT（整个单元段一度全报失败）。
    const argv = String(scripts[name]).split(/\s+/).slice(1);
    const res = run(process.execPath, argv, { timeout: 300_000 });
    record(name, res.status === 0 ? 'pass' : 'fail');
  }
}

// ---- 2) 五关启动 + 游戏内验收 ----
const verifications = only
  ? VERIFICATIONS.filter((name) => name.includes(only))
  : VERIFICATIONS;

console.log('\n--- 启动检查 ---');
const boot = run('node', ['scripts/check-game-boot.mjs']);
record('check-game-boot', boot.status === 0 ? 'pass' : 'fail');

// 悬空调用静态检查：删掉方法之后，残留的调用点只会在那条路径真的跑到时才抛错，
// 单靠启动检查会漏（有些路径启动阶段根本不跑）。这个检查一次性列出全部。
console.log('\n--- 悬空调用静态检查 ---');
for (const target of ['src/systems/Game.js']) {
  const res = run('node', ['scripts/check-dangling-calls.mjs', target]);
  const clean = res.status === 0 && /疑似悬空调用 0 个名字/.test(res.stdout ?? '');
  record(`dangling-calls:${target}`, clean ? 'pass' : 'fail');
  if (!clean) {
    (res.stdout ?? '').split('\n').slice(0, 8).forEach((line) => console.log(`             ${line.trim()}`));
  }
}

console.log(`\n--- 游戏内验收（${verifications.length} 项）---`);
// 两项之间留一点间隔再开下一个。
//
// 原因不是"慢一点更稳"，而是一个具体机制：验收脚本会把截图写进 `outputs/`，
// 而 `outputs/` 在 Vite 的监听根目录里，写入会让 dev server 推一次 **整页重载**。
// 重载是防抖的，于是它经常落在**下一个**脚本的 `Runtime.evaluate` 执行期间，
// 浏览器回一句 `Inspected target navigated or closed`，那个脚本就无辜变红
// （实测：上一轮的 verify-island-facilities / verify-island-tech-effects /
// verify-island-puppet-combat 都轮流中过一次，重试必过）。
// 等防抖窗口过去再开始下一个，比事后重试更接近"真的没有回归"。
const VERIFICATION_SETTLE_MS = 1500;
// 同步睡眠：`Atomics.wait` 是 Node 里唯一干净的同步睡法
// （`await` 会把这个顺序执行的脚本改成异步流程，反而难读）。
const sleepMs = (ms) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, ms));
};
for (const name of verifications) {
  sleepMs(VERIFICATION_SETTLE_MS);
  const first = run('node', [`scripts/${name}.mjs`]);
  if (first.status === 0) {
    record(name, 'pass');
    continue;
  }
  // 失败重试一次：批量负载导致的超时与真回归要区分开，但不能悄悄吞掉
  sleepMs(VERIFICATION_SETTLE_MS);
  const second = run('node', [`scripts/${name}.mjs`]);
  if (second.status === 0) {
    record(name, 'retry', '(首次失败、重试通过——记为抖动，需要关注)');
    continue;
  }
  record(name, 'fail');
  const lines = `${first.stdout}${first.stderr}`.split('\n');
  const interesting = lines.filter((line) => /"false|Error|FAIL/.test(line)).slice(-6);
  interesting.forEach((line) => console.log(`             ${line.trim().slice(0, 140)}`));
}

const failed = summary.filter((entry) => entry.status === 'fail');
const retried = summary.filter((entry) => entry.status === 'retry');
console.log(`\n=== 合计 ${summary.length} 项：通过 ${summary.length - failed.length - retried.length}，抖动 ${retried.length}，失败 ${failed.length} ===`);
if (retried.length) console.log('抖动项：' + retried.map((entry) => entry.name).join(', '));
if (failed.length) console.log('失败项：' + failed.map((entry) => entry.name).join(', '));
process.exit(failed.length === 0 ? 0 : 1);
