// 傀儡作业状态机回归测试。
// 重点是「为什么这个傀儡不动」必须能从状态里读出来，而不是只有站桩一个现象：
// 缺工具、资源耗尽、没有任务、背包满、容器满、路线不可达、供能不足、
// 正在采集、正在运输，每一种都要有明确的状态与原因。
import assert from 'node:assert/strict';
import {
  WORK_ACTION,
  WORK_REASON,
  WORK_STATE,
  WorkTaskBoard,
  advanceHarvestProgress,
  planWorkerStep,
  workRules,
  workStateLabel,
  workerInventoryFull,
  workerManaRatio,
  workerManaDepleted
} from '../src/systems/workOrders.js';

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

const fullMana = { activityMana: 60, manaCapacity: 60 };

function makeWorker(overrides = {}) {
  return {
    id: 'w1',
    x: 0, z: 0,
    inventoryUsed: 0,
    inventoryCapacity: 8,
    toolIds: ['axe'],
    ...fullMana,
    ...overrides
  };
}

function makeTask(overrides = {}) {
  return {
    nodeId: 'oak-0',
    node: { id: 'oak-0', definitionId: 'oak', resource: 'wood', x: 10, z: 0, amount: 45 },
    toolSatisfied: true,
    ...overrides
  };
}

check('没有任务时明确报「没有有效任务」，而不是悄悄站着', () => {
  const step = planWorkerStep({ worker: makeWorker(), task: null });
  assert.equal(step.state, WORK_STATE.idle);
  assert.equal(step.reason, WORK_REASON.noTask);
  assert.equal(step.action, WORK_ACTION.none);
  assert.equal(step.note, '待命（没有有效任务）');
});

check('距离不够时先走过去，到位后才开始采集', () => {
  const task = makeTask();
  const far = planWorkerStep({ worker: makeWorker({ x: 0, z: 0 }), task });
  assert.equal(far.state, WORK_STATE.movingToNode);
  assert.equal(far.action, WORK_ACTION.moveToNode);
  assert.deepEqual(far.target, { x: 10, z: 0, id: 'oak-0', definitionId: 'oak', resource: 'wood', amount: 45 });

  const near = planWorkerStep({ worker: makeWorker({ x: 8.5, z: 0 }), task });
  assert.equal(near.state, WORK_STATE.harvesting);
  assert.equal(near.action, WORK_ACTION.harvest);
  assert.equal(near.note, '正在采集');
});

check('缺工具时停在原地并报出原因', () => {
  const task = makeTask({ toolSatisfied: false });
  const step = planWorkerStep({ worker: makeWorker({ x: 9, z: 0 }), task });
  assert.equal(step.state, WORK_STATE.blocked);
  assert.equal(step.reason, WORK_REASON.missingTool);
  assert.equal(step.action, WORK_ACTION.none);
  assert.equal(step.note, '无法继续（缺少工具）');
});

check('资源耗尽与路线不可达都能分辨出来', () => {
  const depleted = planWorkerStep({
    worker: makeWorker({ x: 9, z: 0 }),
    task: makeTask({ node: { id: 'oak-0', x: 10, z: 0, amount: 0 } })
  });
  assert.equal(depleted.reason, WORK_REASON.nodeDepleted);

  const unreachable = planWorkerStep({
    worker: makeWorker({ x: 0, z: 0 }),
    task: makeTask({ reachable: false })
  });
  assert.equal(unreachable.state, WORK_STATE.blocked);
  assert.equal(unreachable.reason, WORK_REASON.unreachable);
});

check('背包满了先回基地卸货，任务不会被丢掉', () => {
  const task = makeTask();
  const hauling = planWorkerStep({
    worker: makeWorker({ x: 9, z: 0, inventoryUsed: 8 }),
    task,
    base: { x: 0, z: 0 }
  });
  assert.equal(hauling.state, WORK_STATE.haulingHome);
  assert.equal(hauling.reason, WORK_REASON.inventoryFull);
  assert.equal(hauling.action, WORK_ACTION.moveToBase);
  assert.equal(hauling.note, '正在运输（背包已满）');

  const arrived = planWorkerStep({
    worker: makeWorker({ x: 1, z: 1, inventoryUsed: 8 }),
    task,
    base: { x: 0, z: 0 }
  });
  assert.equal(arrived.state, WORK_STATE.depositing);
  assert.equal(arrived.action, WORK_ACTION.deposit);
});

check('容器满了就停下报「容器已满」，而不是把货吞掉', () => {
  const step = planWorkerStep({
    worker: makeWorker({ x: 0, z: 0, inventoryUsed: 8 }),
    task: makeTask(),
    base: { x: 0, z: 0 },
    baseHasRoom: false
  });
  assert.equal(step.state, WORK_STATE.blocked);
  assert.equal(step.reason, WORK_REASON.containerFull);
  assert.equal(step.action, WORK_ACTION.none, '装不下就不该往基地走一趟');
});

check('魔力低且不在供能范围时主动返程，在供能点旁则原地补魔', () => {
  const lowMana = { activityMana: 5, manaCapacity: 60 };
  const outOfRange = planWorkerStep({
    worker: makeWorker({ x: 40, z: 0, ...lowMana }),
    task: makeTask(),
    base: { x: 0, z: 0 },
    inSupplyRange: false
  });
  assert.equal(outOfRange.state, WORK_STATE.lowPower);
  assert.equal(outOfRange.reason, WORK_REASON.lowPower);
  assert.equal(outOfRange.action, WORK_ACTION.moveToBase);
  assert.equal(outOfRange.note, '魔力不足（供能不足）');

  const atSupply = planWorkerStep({
    worker: makeWorker({ x: 2, z: 0, ...lowMana }),
    task: makeTask(),
    base: { x: 0, z: 0 },
    inSupplyRange: true
  });
  assert.equal(atSupply.reason, WORK_REASON.recharging);
  assert.equal(atSupply.note, '魔力不足（正在补魔）');
  assert.equal(atSupply.action, WORK_ACTION.none, '在供能点旁就该等着补，不要来回乱跑');

  // 在供能半径内但离供能点很远时，也不能带着见底的魔力出发
  const inRangeButFar = planWorkerStep({
    worker: makeWorker({ x: 15, z: 0, ...lowMana }),
    task: makeTask({ node: { id: 'oak-0', x: 16, z: 0, amount: 45 } }),
    base: { x: 0, z: 0 },
    inSupplyRange: true
  });
  assert.equal(inRangeButFar.state, WORK_STATE.lowPower);
  assert.equal(inRangeButFar.action, WORK_ACTION.moveToBase, '应当先回供能点补魔');
});

check('魔力见底时不会硬撑着干活，而是回去补魔', () => {
  const step = planWorkerStep({
    worker: makeWorker({ x: 9, z: 0, activityMana: 0 }),
    task: makeTask(),
    base: { x: 0, z: 0 },
    inSupplyRange: true
  });
  assert.equal(step.state, WORK_STATE.lowPower);
  assert.equal(step.reason, WORK_REASON.lowPower);
  assert.equal(step.action, WORK_ACTION.moveToBase);
});

check('满包优先于缺魔力：手上的货必须先送回去', () => {
  const step = planWorkerStep({
    worker: makeWorker({ x: 20, z: 0, inventoryUsed: 8, activityMana: 1 }),
    task: makeTask(),
    base: { x: 0, z: 0 },
    inSupplyRange: false
  });
  assert.equal(step.state, WORK_STATE.haulingHome, '满包回程的优先级更高');
});

check('采集进度按时间推进，结算后把溢出时间带进下一轮', () => {
  let progress = 0;
  let completions = 0;
  for (let i = 0; i < 30; i += 1) {
    const step = advanceHarvestProgress(progress, 0.1, 1.0);
    progress = step.progress;
    completions += step.completions;
  }
  // 3 秒 / 每次 1 秒 = 3 次；清零式实现会因为浮点误差少算一次
  assert.equal(completions, 3);
  assert.ok(progress >= 0 && progress < 1);

  // 一段 dt 跨过多个结算周期时不能只算一次
  const long = advanceHarvestProgress(0, 3.5, 1.0);
  assert.equal(long.completions, 3);
  assert.ok(Math.abs(long.progress - 0.5) < 1e-9, '溢出的 0.5 秒要带下去');
});

check('活动魔力见底时只回供能点，不迎战也不采集', () => {
  const worker = makeWorker({ activityMana: 0, x: 10, z: 0 });
  const node = { id: 'oak-0', amount: 40, x: 12, z: 0 };
  const engage = planWorkerStep({
    worker,
    task: { node, toolSatisfied: true },
    base: { x: 0, z: 0 },
    danger: { action: 'engage' }
  });
  assert.equal(engage.state, WORK_STATE.lowPower);
  assert.equal(engage.action, WORK_ACTION.moveToBase);
  const harvest = planWorkerStep({
    worker: makeWorker({ activityMana: 0, x: 12, z: 0 }),
    task: { node, toolSatisfied: true },
    base: { x: 0, z: 0 }
  });
  assert.equal(harvest.action, WORK_ACTION.moveToBase);
  assert.equal(workerManaDepleted(worker), true);
});

check('容量与魔力比例的边界不会算错', () => {
  assert.equal(workerInventoryFull({ inventoryUsed: 8, inventoryCapacity: 8 }), true);
  assert.equal(workerInventoryFull({ inventoryUsed: 7, inventoryCapacity: 8 }), false);
  assert.equal(workerInventoryFull({ inventoryUsed: 99, inventoryCapacity: 0 }), false, '没有背包的实体不算满');
  assert.equal(workerManaRatio({ activityMana: 30, manaCapacity: 60 }), 0.5);
  assert.equal(workerManaRatio({ activityMana: 999, manaCapacity: 60 }), 1, '比例不得超过 1');
  assert.equal(workerManaRatio({ activityMana: 0, manaCapacity: 0 }), 1, '没有魔力概念的实体视为满');
});

check('任务预留避免多个傀儡挤在同一个资源点上', () => {
  const board = new WorkTaskBoard();
  const node = { id: 'oak-0', amount: 45 };
  assert.equal(board.availableFor('oak-0', node), 45);
  board.claim('w1', 'oak-0', 8);
  assert.equal(board.availableFor('oak-0', node), 37);
  assert.equal(board.ownerOf('oak-0'), 'w1');
  board.claim('w2', 'oak-0', 8);
  assert.equal(board.availableFor('oak-0', node), 29);
  // 排除自己时不该把自己算进预留
  assert.equal(board.availableFor('oak-0', node, 'w1'), 37);
  assert.equal(board.release('w1'), true);
  assert.equal(board.availableFor('oak-0', node), 37);
  assert.equal(board.releaseNode('oak-0'), 1);
  assert.equal(board.availableFor('oak-0', node), 45);
  assert.deepEqual(board.snapshot(), []);
});

check('状态文案覆盖文档要求的全部可见状态', () => {
  const notes = [
    workStateLabel(WORK_STATE.harvesting),
    workStateLabel(WORK_STATE.haulingHome),
    workStateLabel(WORK_STATE.blocked, WORK_REASON.missingTool),
    workStateLabel(WORK_STATE.idle, WORK_REASON.nodeDepleted),
    workStateLabel(WORK_STATE.idle, WORK_REASON.noTask),
    workStateLabel(WORK_STATE.blocked, WORK_REASON.containerFull),
    workStateLabel(WORK_STATE.blocked, WORK_REASON.unreachable),
    workStateLabel(WORK_STATE.lowPower, WORK_REASON.lowPower),
    workStateLabel(WORK_STATE.lowPower, WORK_REASON.recharging)
  ];
  notes.forEach((note) => assert.ok(note && note.length > 0, '状态文案不能为空'));
  assert.equal(new Set(notes).size, notes.length, '每种状态都应当是不同文案');
});

check('规则可覆盖，不写死', () => {
  const rules = workRules({ harvestRange: 10 });
  const step = planWorkerStep({ worker: makeWorker({ x: 0, z: 0 }), task: makeTask(), rules });
  assert.equal(step.state, WORK_STATE.harvesting, '把采集距离放大到 10 后应当直接开工');
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
