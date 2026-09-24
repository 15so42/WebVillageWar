// 作业记录解析的回归（用户报的「砍完树后就在原地不动了」）。
//
// 这是一个**静默失败**的 bug，值得单独钉住：
//
//   `assignNode` / `clearTask` / `taskFor` / `isWorker` / `inventoryFor` / `lastError` /
//   `workerState` 这些入口以前的第一行都是
//       `const unitId = typeof x === 'object' ? x?.id : x;`
//   而**作业记录上没有 `id`**（它叫 `unitId`）。于是内部代码一旦顺手写成
//   `this.clearTask(record)`，`unitId` 就是 `undefined`、`records.get(undefined)` 是
//   `undefined`、方法静默 `return false`——**不报错、日志里也看不出来**。
//
//   实测后果（端到端探针）：树采空之后，`updateWorker` 每帧判一次"已采空"并调用
//   `clearTask(record)`，每帧都无效 → `record.task` 永远指着那棵空树；而
//   `updateAutoAssign` 只挑"手上没活"（`!record.task`）的傀儡 →
//   它**再也不会被派活**，站在原地待命到天荒地老，
//   `stats.depletedTasks` 每帧 +1（实测 1500 帧 +1500）。
//   同一个坑还让 `releaseTaskInDanger` 一直是空操作。
//
// 修法是 `WorkSystem.recordFor()`：把「单位 / 单位 id / 作业记录」统一解析成记录。
// 这个脚本就用**三种入参形式**把这条钉死，再复现一次那个每帧循环。
import assert from 'node:assert/strict';
import { WorkSystem } from '../src/systems/WorkSystem.js';

const report = [];
function check(name, fn) {
  try {
    fn();
    report.push(`ok   ${name}`);
  } catch (error) {
    report.push(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

/**
 * 只喂 WorkSystem 真正会碰到的那几样东西，不搭整个游戏。
 *
 * 节点**每个用例现建一份**：它是会被采空的活对象，共用一个模块级表的话，
 * 前一个用例把 oak-a 掏空会让后一个用例的 `assignNode` 直接失败——
 * 那是测试自己的串味，不是被测代码的问题（第一次写就是这么红了一次）。
 */
function makeSystem() {
  const nodes = {
    'oak-a': { id: 'oak-a', x: 0, z: 0, amount: 5, resource: 'wood', definitionId: 'oak' },
    'oak-b': { id: 'oak-b', x: 10, z: 0, amount: 5, resource: 'wood', definitionId: 'oak' }
  };
  const game = {
    elapsedTime: 0,
    resourceNodes: { nodeById: (id) => nodes[id] ?? null },
    power: null,
    threat: null
  };
  const system = new WorkSystem(game);
  const unit = {
    id: 'puppet-1',
    alive: true,
    position: { x: 0, y: 0, z: 0 },
    definition: { maxHealth: 30, canMove: true },
    attributes: { setBase() {} }
  };
  const record = system.registerWorker(unit);
  return { system, unit, record, nodes };
}

check('注册出来的记录认得出「记录 / 单位 / 单位 id」三种入参', () => {
  const { system, unit, record } = makeSystem();
  assert.equal(system.recordFor(record), record, '传记录本身');
  assert.equal(system.recordFor(unit), record, '传单位');
  assert.equal(system.recordFor('puppet-1'), record, '传单位 id');
  assert.equal(system.recordFor({ id: 'nobody' }), null, '不认识的对象必须是 null');
  assert.equal(system.recordFor(null), null);
  assert.equal(system.recordFor(undefined), null);
});

check('clearTask(record) 必须真的交掉任务（这就是"原地不动"的根因）', () => {
  const { system, unit, record } = makeSystem();
  assert.equal(system.assignNode(record, 'oak-a'), true, '派活入口也要能吃记录');
  assert.equal(record.task?.nodeId, 'oak-a');
  assert.equal(system.taskFor(record)?.nodeId, 'oak-a');
  // 修复前这一行返回 false、record.task 原封不动
  assert.equal(system.clearTask(record), true, '传记录必须被解析成记录，而不是静默 no-op');
  assert.equal(record.task, null);
  // Map.delete 之后 get 是 undefined（不是 null）——这里断言的是"表里没有这条"
  assert.equal(system.tasks.get('puppet-1'), undefined);
  assert.equal(record.progress, 0);
  // 单位与 id 两种形式同样有效（外部调用走的是这两条）
  assert.equal(system.assignNode(unit, 'oak-b'), true);
  assert.equal(system.clearTask(unit), true);
  assert.equal(record.task, null);
  assert.equal(system.assignNode('puppet-1', 'oak-b'), true);
  assert.equal(system.clearTask('puppet-1'), true);
  assert.equal(record.task, null);
});

check('采空之后不会留下"幽灵任务"：连续判 N 帧，第一帧就该清掉', () => {
  const { system, record, nodes } = makeSystem();
  assert.equal(system.assignNode(record, 'oak-a'), true);
  nodes['oak-a'].amount = 0;
  // 与 updateWorker 里同一段逻辑（节点空了就交掉任务）
  for (let frame = 0; frame < 5; frame += 1) {
    const task = record.task;
    if (task && (task.node?.amount ?? 0) <= 0) system.clearTask(record);
  }
  assert.equal(record.task, null, '留下就是"砍完树后原地不动"');
  // 自动派活只认"手上没活"的傀儡——所以这条 null 才是它能不能被重新派活的开关
  assert.equal(record.task, null);
  assert.equal(system.taskFor(record), null);
  assert.equal(system.isWorker(record), true, '交掉任务不等于注销傀儡');
});

check('清掉一个已经不存在的任务不会抛错，也不会把记录弄丢', () => {
  const { system, record } = makeSystem();
  assert.equal(system.clearTask(record), true, '本来就没任务，也应当安全');
  assert.equal(record.task, null);
  assert.equal(system.isWorker(record), true);
});

check('查询入口对三种入参给同一个答案', () => {
  const { system, unit, record } = makeSystem();
  system.assignNode(record, 'oak-a');
  assert.equal(system.taskFor(record)?.nodeId, 'oak-a');
  assert.equal(system.taskFor(unit)?.nodeId, 'oak-a');
  assert.equal(system.taskFor('puppet-1')?.nodeId, 'oak-a');
  for (const key of [record, unit, 'puppet-1']) {
    const state = system.workerState(key);
    assert.equal(state.nodeId, 'oak-a', 'workerState 也要认这三种入参');
    assert.ok(system.inventoryFor(key), 'inventoryFor 同上');
  }
  assert.equal(system.lastError(record), null);
  assert.equal(system.lastError(unit), null);
});

check('采空的节点派不了活（assignNode 的门槛没被解析改动破坏）', () => {
  const { system, unit, record, nodes } = makeSystem();
  nodes['oak-a'].amount = 0;
  assert.equal(system.assignNode(unit, 'oak-a'), false, '空气节点必须派不动');
  assert.equal(record.task, null);
  assert.equal(system.assignNode(record, '不存在'), false);
  assert.equal(system.assignNode(record, 'oak-b'), true, '有货的节点照常能派');
});

console.log(report.join('\n'));
console.log(process.exitCode ? '\nWORK RECORDS: FAIL' : '\nWORK RECORDS: PASS');
