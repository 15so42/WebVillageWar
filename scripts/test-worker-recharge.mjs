// 傀儡「补魔迟滞」与「回到任务转向」的回归。
//
// 对应两条用户实测反馈：
//
//   1. 砍树途中遇到敌人会先把敌人打了，但**杀掉敌人回到任务时不转向**：
//      朝停在刚才那只敌人的方向，举着斧子朝空地砍。
//      根因是傀儡只靠 `moveToward` 转向（按实际移动方向摆姿势），进了采集距离之后
//      就不再移动，`moveToward` 直接早退，于是一帧都不转向。
//      修法：采集时显式 `movement.face(node, dt)`。
//
//   2. 魔力不足会回基地，但**刚到基地就立刻又去采矿**。
//      根因是"低于多少回去补"和"补到多少算够"共用同一个阈值（lowPowerRatio）：
//      一旦补到刚过 25% 就被判"够用了"，立刻被派回矿点。
//      修法：两个阈值的迟滞 —— 进入看 lowPowerRatio，退出看 rechargeRatio（默认充满），
//      跨帧记忆放在作业记录的 `recharging` 上（状态机本身是纯函数）。
import assert from 'node:assert/strict';
import { TEAMS } from '../src/data/gameData.js';
import { Inventory } from '../src/systems/Inventory.js';
import { WorkSystem } from '../src/systems/WorkSystem.js';
import {
  WORK_ACTION,
  WORK_REASON,
  WORK_STATE,
  planWorkerStep,
  workRules
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

// ---------------------------------------------------------------------------
// 1) 纯状态机：补魔是迟滞的（进入 25% / 退出充满）
// ---------------------------------------------------------------------------
function makeWorker(overrides = {}) {
  return {
    id: 'w1',
    x: 2, z: 0,
    inventoryUsed: 0,
    inventoryCapacity: 8,
    activityMana: 60,
    manaCapacity: 60,
    ...overrides
  };
}

function makeTask() {
  return {
    nodeId: 'oak-0',
    node: { id: 'oak-0', definitionId: 'oak', resource: 'wood', x: 2, z: 0, amount: 45 },
    toolSatisfied: true,
    reachable: true
  };
}

check('进入补魔的阈值没被改动：刚好高于 25% 仍然可以出发干活', () => {
  // 16/60 ≈ 0.267 > 0.25 —— 没在补魔、也没低于阈值，就该去干活
  const working = planWorkerStep({
    worker: makeWorker({ activityMana: 16 }),
    task: makeTask(),
    base: { x: 0, z: 0 },
    recharging: false
  });
  assert.notEqual(working.state, WORK_STATE.lowPower);
  assert.equal(working.action, WORK_ACTION.harvest);

  const entering = planWorkerStep({
    worker: makeWorker({ activityMana: 15 }),
    task: makeTask(),
    base: { x: 0, z: 0 },
    recharging: false
  });
  assert.equal(entering.state, WORK_STATE.lowPower, '15/60 = 0.25 应当触发返程补魔');
});

check('一旦进了补魔就必须补到满：半电也不许出发（用户报的「刚回基地就走」）', () => {
  const half = makeWorker({ activityMana: 30 });
  const stillCharging = planWorkerStep({
    worker: half,
    task: makeTask(),
    base: { x: 0, z: 0 },
    recharging: true
  });
  assert.equal(stillCharging.state, WORK_STATE.lowPower, '补魔中只补到一半不能算够');
  assert.equal(stillCharging.reason, WORK_REASON.recharging);
  assert.equal(stillCharging.action, WORK_ACTION.none);

  // 90% 也还不行：退出水位默认是"充满"
  const nearlyFull = planWorkerStep({
    worker: { ...half, activityMana: 54 },
    task: makeTask(),
    base: { x: 0, z: 0 },
    recharging: true
  });
  assert.equal(nearlyFull.state, WORK_STATE.lowPower);

  // 充满 → 这一轮补魔结束，回任务
  const full = planWorkerStep({
    worker: { ...half, activityMana: 60 },
    task: makeTask(),
    base: { x: 0, z: 0 },
    recharging: true
  });
  assert.notEqual(full.state, WORK_STATE.lowPower);
  assert.equal(full.action, WORK_ACTION.harvest);
});

check('退出水位可配置，不是写死的"必须 100%"', () => {
  const rules = workRules({ rechargeRatio: 0.5 });
  const half = makeWorker({ activityMana: 30 });
  const released = planWorkerStep({
    worker: half,
    task: makeTask(),
    base: { x: 0, z: 0 },
    rules,
    recharging: true
  });
  assert.notEqual(released.state, WORK_STATE.lowPower, '把退出水位配成 0.5 就应当在半电时放行');
});

// ---------------------------------------------------------------------------
// 2) 帧驱动集成：跨帧记住补魔会话 + 回到任务时面向资源点
// ---------------------------------------------------------------------------
/**
 * 只搭 WorkSystem 真正会碰到的那几样东西。威胁列表是**可替换的**，
 * 这样同一个傀儡可以"先被狼追、再回到砍树"，不必启动整个游戏。
 */
function makeHarness({ mana = 60, nodeX = 2, nodeZ = 0, fullLoad = false } = {}) {
  const node = { id: 'oak-a', x: nodeX, z: nodeZ, amount: 45, resource: 'wood', definitionId: 'oak' };
  const nodes = { 'oak-a': node };
  let threats = [];
  // 基地库存是可写的：满包卸载那一条要把货真的搬进去，卸不掉的话
  // 傀儡会一直停在"容器已满"，测不出它随后有没有被放行去干活。
  // 容量给足：傀儡背包是 16 格，装满后基地装不下的话这条路永远走不到"卸完"。
  const base = new Inventory({ id: 'base', capacity: 32 });
  const game = {
    elapsedTime: 0,
    playerBase: { position: { x: 0, y: 0, z: 0 } },
    baseInventory: base,
    resourceNodes: {
      nodeById: (id) => nodes[id] ?? null,
      // 采集结算不参与这两条断言（够不着就算没采到）
      harvest: () => ({ ok: false, error: 'out_of_range' })
    },
    power: null,
    modifiers: null,
    threat: {
      threatsNear: () => threats,
      pursuersNear: () => threats,
      threatAt: () => 0,
      escapeTargetFor: () => null,
      fleeTargetFor: () => null
    }
  };
  const system = new WorkSystem(game);
  const faced = [];
  const unit = {
    id: 'puppet-1',
    alive: true,
    isBuilding: false,
    health: 30,
    maxHealth: 30,
    position: { x: 0, y: 0, z: 0 },
    definition: { maxHealth: 30, canMove: true, canRotate: true, attackRange: 1.5 },
    attributes: { setBase() {} },
    activityMana: mana,
    mesh: { rotation: { y: 0 } },
    movement: {
      face(target, dt) { faced.push({ x: target.x, z: target.z, dt }); },
      moveToward() { return false; }
    }
  };
  const record = system.registerWorker(unit);
  // 树要斧子：背包里没有工具的话傀儡会停在「缺少工具」，采不到也转不了向
  record.inventory.add('axe', 1);
  if (fullLoad) {
    // 再塞满一堆货，让它一上来就是"满包 + 缺魔"
    while (record.inventory.freeSlots() > 0) record.inventory.add('wood', 200);
  }
  system.notifyInventoryChanged(unit);
  system.assignNode(unit, 'oak-a');
  const wolf = {
    id: 'wolf-1',
    team: TEAMS.ENEMY,
    alive: true,
    position: { x: 1, z: 0 },
    target: unit,
    definition: { maxHealth: 12, physicalAttack: 3, attackRate: 1, attackRange: 1.5 }
  };
  return {
    system, unit, record, game, faced,
    node,
    /** 让狼出现/消失：威胁数组就是这个世界的全部敌人 */
    setThreats: (list) => { threats = list; },
    wolf: () => [{ unit: wolf, distance: Math.hypot(wolf.position.x - unit.position.x, wolf.position.z - unit.position.z) }],
    /** 推一帧真实主循环（dt 与游戏内一致） */
    step(dt = 0.05) {
      game.elapsedTime += dt;
      return system.updateWorker(unit, dt);
    }
  };
}

check('补魔跨帧记忆：补到一半不会被派回矿点，充满才回任务', () => {
  const h = makeHarness({ mana: 5 });

  h.step();
  let state = h.system.workerState(h.unit);
  assert.equal(state.state, WORK_STATE.lowPower, '5/60 低于阈值，应当回基地补魔');
  assert.equal(state.recharging, true, '这一轮补魔已经被记住');

  // 补到一半 —— 修复前这里就被判"够用了"，立刻返回矿点
  h.unit.activityMana = 30;
  h.step();
  state = h.system.workerState(h.unit);
  assert.equal(state.state, WORK_STATE.lowPower, '半电不算补好，必须继续等');
  assert.equal(state.recharging, true, '补魔会话还没结束');

  // 差一点满也还不行
  h.unit.activityMana = 59;
  h.step();
  assert.equal(h.system.workerState(h.unit).state, WORK_STATE.lowPower);

  // 充满 → 立刻回任务
  h.unit.activityMana = 60;
  h.step();
  state = h.system.workerState(h.unit);
  assert.notEqual(state.state, WORK_STATE.lowPower, '充满后就该回去干活');
  assert.equal(state.recharging, false, '补魔会话结束');
});

check('迎战打断补魔不算结束：打完还要接着把电补满', () => {
  const h = makeHarness({ mana: 5 });
  h.step();
  assert.equal(h.system.workerState(h.unit).recharging, true);

  // 狼来了：身体交给自卫反射
  h.setThreats(h.wolf());
  h.step();
  assert.equal(h.system.workerState(h.unit).state, WORK_STATE.engaging);

  // 狼被清掉、冷静宽限过去，身体交回作业层
  h.setThreats([]);
  h.step();
  h.game.elapsedTime += 3;
  h.unit.activityMana = 30;
  h.step();
  const state = h.system.workerState(h.unit);
  assert.equal(state.state, WORK_STATE.lowPower, '魔力还是半电，回来继续补，而不是直接去砍树');
});

check('满包回程排在最前面，也不能把补魔会话冲掉（顺路卸货后仍要补满）', () => {
  // 满包 + 缺魔：planWorkerStep 里满包优先级更高，走回来的那几帧 state 是 hauling_home
  const h = makeHarness({ mana: 5, fullLoad: true, nodeX: 10, nodeZ: 0 });
  // 先把它放到离基地一段距离的地方，否则一上来就在卸货范围内
  h.unit.position.x = 10;
  h.unit.position.z = 10;

  h.step();
  let state = h.system.workerState(h.unit);
  assert.equal(state.state, WORK_STATE.haulingHome, '满包的优先级在补魔之前');
  assert.equal(state.recharging, true, '顺路回基地卸货同样属于"这一轮补魔还没走完"');

  // 走到基地门口并卸完货：货清空了，但魔力还是见底
  h.unit.position.x = 0;
  h.unit.position.z = 0;
  h.step();
  assert.ok(h.record.inventory.usedSlots() <= 1, '这一趟的货应当已经卸进基地（只剩那把斧子）');
  assert.ok(h.game.baseInventory.countOf('wood') > 0, '货必须真的落到基地库存里');

  h.unit.activityMana = 30;
  h.step();
  state = h.system.workerState(h.unit);
  assert.equal(
    state.state,
    WORK_STATE.lowPower,
    '修复前这里会把补魔会话清掉，于是它带着半电就去挖矿了'
  );
  assert.equal(state.recharging, true);
});

check('补魔会话结束后不会赖着：充满回任务时立刻复位', () => {
  const h = makeHarness({ mana: 5 });
  h.step();
  assert.equal(h.system.workerState(h.unit).recharging, true);
  h.unit.activityMana = 60;
  h.step();
  const state = h.system.workerState(h.unit);
  assert.equal(state.recharging, false);
  assert.equal(state.state, WORK_STATE.harvesting, '满电就该在树前干活');
});

check('杀掉敌人回到任务时会转向资源点（修复前朝向停在敌人那一侧）', () => {
  const h = makeHarness({ mana: 60, nodeX: 2, nodeZ: 0 });

  // ① 迎战期间：工作层不接管，一帧都不该去转朝资源点
  h.setThreats(h.wolf());
  h.step();
  assert.equal(h.system.workerState(h.unit).state, WORK_STATE.engaging);
  assert.equal(h.faced.length, 0, '迎战时身体归战斗 AI，工作层不许插手朝向');

  // ② 敌人没了 → 冷静宽限 → 回到作业层，站进采集距离内开始砍
  h.setThreats([]);
  h.step();
  h.game.elapsedTime += 3;
  h.step();
  const state = h.system.workerState(h.unit);
  assert.equal(state.state, WORK_STATE.harvesting, '回到树前应当立刻接着砍');

  const last = h.faced[h.faced.length - 1];
  assert.ok(last, '采集时必须显式转向资源点');
  assert.equal(last.x, h.node.x);
  assert.equal(last.z, h.node.z);
  assert.ok(last.dt > 0, '转向要走平滑插值（dt > 0），不是每帧瞬移');
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
