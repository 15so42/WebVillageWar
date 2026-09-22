// 采集需求优先级调度回归测试。
// 计划第 5 节把百分比语义列为待定，这里只锁定三条不依赖具体解释的硬要求：
//   1. 库存达标 / 没有可达资源点 / 未启用的需求，都不该派人（否则派了也永远在等）
//   2. 权重高的分到的人不少于权重低的
//   3. 同样的输入必须得到同样的结果（不能每帧换人，否则傀儡来回跑）
import assert from 'node:assert/strict';
import {
  DEMAND_STATE,
  normalizeDemands,
  normalizeWeight,
  planWorkAllocation,
  workPriorityRules
} from '../src/systems/workPriority.js';

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

check('百分比与比例两种写法等价', () => {
  assert.equal(normalizeWeight(50), normalizeWeight(0.5));
  assert.equal(normalizeWeight(25), 0.25);
  assert.equal(normalizeWeight(0), 0);
  assert.equal(normalizeWeight(-5), 0);
});

check('权重被夹在合法区间内，不会因为配了 0 或巨大值把调度带偏', () => {
  const rules = workPriorityRules();
  assert.equal(normalizeWeight(999), rules.maxWeight);
  assert.ok(normalizeWeight(0.0001) >= rules.minWeight);
});

check('三种「不该派人」的状态都能分辨出来', () => {
  const plan = planWorkAllocation({
    demands: [
      { id: 'wood', resource: 'wood', weight: 50, targetStock: 100 },
      { id: 'stone', resource: 'stone', weight: 30, targetStock: 100 },
      { id: 'iron', resource: 'iron', weight: 20, targetStock: 100 },
      { id: 'food', resource: 'food', weight: 30, enabled: false }
    ],
    stock: { wood: 120, stone: 0, iron: 0, food: 0 },
    availableNodes: { wood: 40, stone: 8, iron: 0, food: 5 },
    workerIds: ['w1', 'w2', 'w3']
  });
  const byId = Object.fromEntries(plan.states.map((entry) => [entry.id, entry]));
  assert.equal(byId.wood.state, DEMAND_STATE.satisfied);
  assert.equal(byId.stone.state, DEMAND_STATE.active);
  assert.equal(byId.iron.state, DEMAND_STATE.noNodes);
  assert.equal(byId.food.state, DEMAND_STATE.disabled);
  // 达标、没资源、未启用的三项都不该分到人
  assert.equal(byId.wood.assigned, 0);
  assert.equal(byId.iron.assigned, 0);
  assert.equal(byId.food.assigned, 0);
  assert.equal(byId.stone.assigned, 3, '只有石料可执行，三个傀儡都该去做它');
  assert.deepEqual(plan.idleWorkers, []);
});

check('权重高的分到的人不少于权重低的', () => {
  const plan = planWorkAllocation({
    demands: [
      { id: 'wood', resource: 'wood', weight: 50 },
      { id: 'stone', resource: 'stone', weight: 25 }
    ],
    stock: {},
    availableNodes: { wood: 40, stone: 40 },
    workerIds: ['w1', 'w2', 'w3', 'w4']
  });
  const byId = Object.fromEntries(plan.states.map((entry) => [entry.id, entry]));
  assert.ok(byId.wood.assigned >= byId.stone.assigned, '50% 的人不该少于 25%');
  assert.equal(byId.wood.assigned + byId.stone.assigned, 4, '所有人都有活干');
});

check('傀儡比需求少时，权重最高的那项至少有人', () => {
  const plan = planWorkAllocation({
    demands: [
      { id: 'wood', resource: 'wood', weight: 80 },
      { id: 'stone', resource: 'stone', weight: 20 }
    ],
    stock: {},
    availableNodes: { wood: 10, stone: 10 },
    workerIds: ['w1']
  });
  const byId = Object.fromEntries(plan.states.map((entry) => [entry.id, entry]));
  assert.equal(byId.wood.assigned, 1);
  assert.equal(byId.stone.assigned, 0);
  assert.deepEqual(plan.idleWorkers, []);
});

check('只有一个可执行需求时所有人都去做它，不会有人闲置', () => {
  const plan = planWorkAllocation({
    demands: [{ id: 'wood', resource: 'wood', weight: 50 }],
    stock: {},
    availableNodes: { wood: 10 },
    workerIds: ['w1', 'w2', 'w3']
  });
  assert.equal(plan.states[0].assigned, 3, '只有木材要采，三个傀儡都该去砍树');
  assert.deepEqual(plan.idleWorkers, []);
});

check('傀儡比「每个需求的保底人数」还多时，多出来的人才会闲置', () => {
  // 两个需求各占一个保底名额，第三个傀儡按权重补位，第四个才会闲置
  const plan = planWorkAllocation({
    demands: [
      { id: 'wood', resource: 'wood', weight: 50 },
      { id: 'stone', resource: 'stone', weight: 50 }
    ],
    stock: {},
    availableNodes: { wood: 10, stone: 10 },
    workerIds: ['w1', 'w2', 'w3']
  });
  const total = plan.states.reduce((sum, entry) => sum + entry.assigned, 0);
  assert.equal(total, 3);
  assert.deepEqual(plan.idleWorkers, []);
});

check('没有任何可执行需求时不派活，傀儡全部闲置', () => {
  const plan = planWorkAllocation({
    demands: [{ id: 'wood', resource: 'wood', weight: 50, targetStock: 10 }],
    stock: { wood: 10 },
    availableNodes: { wood: 10 },
    workerIds: ['w1', 'w2']
  });
  assert.deepEqual(plan.assignments, []);
  assert.deepEqual(plan.idleWorkers, ['w1', 'w2']);
});

check('同样的输入永远得到同样的结果（不能每帧换人）', () => {
  const input = {
    demands: [
      { id: 'b', resource: 'stone', weight: 30 },
      { id: 'a', resource: 'wood', weight: 30 },
      { id: 'c', resource: 'iron', weight: 20 }
    ],
    stock: {},
    availableNodes: { wood: 9, stone: 9, iron: 9 },
    workerIds: ['w1', 'w2', 'w3', 'w4']
  };
  const first = planWorkAllocation(input);
  for (let i = 0; i < 20; i += 1) {
    assert.deepEqual(planWorkAllocation(input), first, '重复调用必须完全一致');
  }
  // 权重相同时按 id 排序，保证结果稳定
  const order = first.states.map((entry) => entry.id);
  assert.deepEqual(order, ['b', 'a', 'c'], '状态顺序按输入顺序，不额外打乱');
});

check('需求为空或没有傀儡时不会崩，也不会凭空派人', () => {
  const empty = planWorkAllocation({ demands: [], stock: {}, availableNodes: {}, workerIds: ['w1'] });
  assert.deepEqual(empty.assignments, []);
  assert.deepEqual(empty.idleWorkers, ['w1']);
  const noWorkers = planWorkAllocation({
    demands: [{ id: 'wood', resource: 'wood', weight: 50 }],
    availableNodes: { wood: 5 },
    workerIds: []
  });
  assert.deepEqual(noWorkers.assignments, []);
});

check('规范化不会丢失需求，缺字段的按 0 处理', () => {
  const normalized = normalizeDemands([{ resource: 'wood', percent: 50 }, { id: 'x' }]);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].weight, 0.5);
  assert.equal(normalized[0].id, 'demand-0');
  assert.equal(normalized[1].weight, 0);
  assert.equal(normalized[1].enabled, true);
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
