// 供能与活动魔力回归测试。
//
// 最核心的一条是计划文档第 3 节的能量守恒约束：
//   在 dt 内分配给所有接收者的魔力之和，不能超过供能源当段可提供的 supplyPerSecond × dt。
// 这里除了逐条断言，还做了一轮确定性随机的批量对拍，覆盖「多供能源重叠、
// 大量接收者、预算远小于需求」这些容易写出「每个单位各发一份完整功率」的场景。
import assert from 'node:assert/strict';
import { POWER_RULES } from '../src/data/gameData.js';
import {
  POWER_STRATEGY,
  allocatePower,
  powerReturnReserve,
  powerSupplierBudget
} from '../src/systems/power.js';
import { POWER_STATE, PowerSystem } from '../src/systems/PowerSystem.js';

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

function makeSupplier(id, x, z, supplyPerSecond, supplyRadius = 20) {
  return { id, kind: 'base', x, z, supplyPerSecond, supplyRadius, manaStored: null };
}

function makeReceiver(id, x, z, demand, extra = {}) {
  return { id, kind: 'unit', x, z, demand, manaCapacity: 60, manaStored: 0, priority: 0, ...extra };
}

// 确定性 LCG，保证失败可复现
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

check('预算就是 supplyPerSecond × dt，并且受供能源自身储备限制', () => {
  assert.equal(powerSupplierBudget({ supplyPerSecond: 10 }, 1), 10);
  assert.equal(powerSupplierBudget({ supplyPerSecond: 10 }, 0.5), 5);
  assert.equal(powerSupplierBudget({ supplyPerSecond: 10, manaStored: 3 }, 1), 3);
  assert.equal(powerSupplierBudget({ supplyPerSecond: 0 }, 1), 0);
  assert.equal(powerSupplierBudget({ supplyPerSecond: -5 }, 1), 0);
});

check('文档里的供需举例：供 10/秒、消耗 9/秒，余量 1/秒', () => {
  const result = allocatePower({
    suppliers: [makeSupplier('base', 0, 0, 10)],
    receivers: [
      makeReceiver('puppet-a', 3, 0, 3),
      makeReceiver('puppet-b', -3, 0, 3),
      makeReceiver('tower', 0, 4, 3)
    ],
    dt: 1
  });
  assert.equal(result.totalBudget, 10);
  assert.equal(result.totalDemand, 9);
  assert.equal(result.totalGranted, 9);
  assert.equal(result.surplus, 1);
  assert.deepEqual(result.starved, []);
});

check('范围内每个单位各发一份完整功率是错的：总量不能超过预算', () => {
  // 一个供能 6/秒的源，10 个各要 3/秒的接收者
  const receivers = Array.from({ length: 10 }, (_, i) => makeReceiver(`u${i}`, i * 0.5, 0, 3));
  const result = allocatePower({ suppliers: [makeSupplier('base', 0, 0, 6)], receivers, dt: 1 });
  assert.equal(result.totalGranted, 6, '实发量必须正好等于预算，而不是 30');
  assert.ok(result.totalGranted <= result.totalBudget + 1e-9);
  // 预算 6 恰好够前两个各 3，剩下 8 个一点都拿不到
  const fulfilled = result.grants.filter((grant) => grant.shortfall <= 1e-9);
  assert.equal(fulfilled.length, 2, '只有前两个接收者被喂满');
  assert.equal(result.starved.length, 8, '没吃满的应当被记为缺口');
});

check('供能源重叠不会让同一个接收者拿到两份', () => {
  const suppliers = [makeSupplier('a', 0, 0, 4), makeSupplier('b', 2, 0, 4)];
  const receivers = [makeReceiver('u', 1, 0, 100)];
  const result = allocatePower({ suppliers, receivers, dt: 1 });
  assert.equal(result.grants[0].granted, 8, '最多只能拿到两个源各自的预算之和');
  assert.equal(result.grants[0].sourceCount, 2);
  // 第一个源被抢空后应当顺延到第二个
  const nearer = allocatePower({
    suppliers,
    receivers: [makeReceiver('u', 0.2, 0, 3)],
    dt: 1
  });
  assert.equal(nearer.grants[0].granted, 3);
});

check('超出供能半径的接收者一点都拿不到', () => {
  const result = allocatePower({
    suppliers: [makeSupplier('base', 0, 0, 50, 20)],
    receivers: [makeReceiver('far', 100, 0, 10)],
    dt: 1
  });
  assert.equal(result.grants[0].granted, 0);
  assert.equal(result.grants[0].sourceCount, 0);
  assert.equal(result.surplus, 50, '没人可用时预算应当留成余量');
});

check('负载不足时高优先级先拿到', () => {
  const result = allocatePower({
    suppliers: [makeSupplier('base', 0, 0, 4)],
    receivers: [
      makeReceiver('low', 1, 0, 4, { priority: 0 }),
      makeReceiver('high', -1, 0, 4, { priority: 10 })
    ],
    dt: 1
  });
  const byId = Object.fromEntries(result.grants.map((grant) => [grant.id, grant]));
  assert.equal(byId.high.granted, 4);
  assert.equal(byId.low.granted, 0);
  assert.deepEqual(result.starved, ['low']);
});

check('均衡策略在同一预算下把魔力摊给多个人', () => {
  const suppliers = [makeSupplier('base', 0, 0, 6)];
  const receivers = [
    makeReceiver('a', 1, 0, 10),
    makeReceiver('b', 2, 0, 10),
    makeReceiver('c', 3, 0, 10)
  ];
  const result = allocatePower({ suppliers, receivers, dt: 1, strategy: POWER_STRATEGY.evenSplit });
  assert.equal(result.totalGranted, 6);
  // 每个源平均分给 3 人 → 每人 2；拿走之后没有余量再补
  result.grants.forEach((grant) => assert.equal(grant.granted, 2));
});

check('确定性随机批量对拍：任何配置下实发量都不超过预算', () => {
  const random = makeRandom(20260921);
  let worst = 0;
  let overBudgetCases = 0;
  for (let round = 0; round < 400; round += 1) {
    const supplierCount = 1 + Math.floor(random() * 3);
    const suppliers = Array.from({ length: supplierCount }, (_, i) => makeSupplier(
      `s${i}`,
      (random() - 0.5) * 60,
      (random() - 0.5) * 60,
      random() * 20,
      5 + random() * 30
    ));
    const receiverCount = 1 + Math.floor(random() * 12);
    const receivers = Array.from({ length: receiverCount }, (_, i) => makeReceiver(
      `r${i}`,
      (random() - 0.5) * 90,
      (random() - 0.5) * 90,
      random() * 12,
      { manaStored: random() * 60, priority: Math.floor(random() * 4) }
    ));
    const dt = 0.016 + random() * 0.5;
    const result = allocatePower({ suppliers, receivers, dt });
    if (result.totalGranted > result.totalBudget + 1e-9) overBudgetCases += 1;
    // 单个接收者也不可能拿到超过自己需求的量
    result.grants.forEach((grant) => {
      assert.ok(grant.granted <= grant.demand + 1e-9, '不应超过自身需求');
      assert.ok(grant.granted >= 0);
    });
    worst = Math.max(worst, result.totalGranted - result.totalBudget);
  }
  assert.equal(overBudgetCases, 0, `有 ${overBudgetCases} 组超预算，最大超出 ${worst}`);
});

check('返程储备估算随距离与耗魔增长', () => {
  const near = powerReturnReserve({ drainPerSecond: 1, distance: 10, moveSpeed: 4, extraSeconds: 0 });
  const far = powerReturnReserve({ drainPerSecond: 1, distance: 40, moveSpeed: 4, extraSeconds: 0 });
  assert.equal(near, 2.5);
  assert.equal(far, 10);
  assert.equal(powerReturnReserve({ drainPerSecond: 0, distance: 40 }), 0);
  assert.ok(powerReturnReserve({ drainPerSecond: 1, distance: 10, moveSpeed: 4, extraSeconds: 3 }) > near);
});

check('傀儡用自己的储备干活：供给充足时储备回满', () => {
  const system = new PowerSystem(null, { rules: { ...POWER_RULES, workerManaCapacity: 60 } });
  system.registerSupplier({ id: 'base', x: 0, z: 0, supplyPerSecond: 12, supplyRadius: 20 });
  const worker = {
    id: 'w1', kind: 'unit', x: 5, z: 0,
    activityMana: 20, manaCapacity: 60, drainPerSecond: 0
  };
  system.registerReceiver(worker);

  const first = system.tick(1);
  assert.equal(first.consumed, 0, '本用例不模拟行为耗魔');
  // 基地供给功率是 2.2/s（POWER_RULES.baseSupplyPerSecond），单接收者的补魔上限
  // 与它同源（maxRechargePerSecond），所以这里读规则而不是写死 2——
  // 写死数字会在"起步可玩、扩张要供给"那一轮调参之后变成假失败。
  assert.equal(
    first.supplied,
    POWER_RULES.maxRechargePerSecond,
    '补魔受最大充能速率限制'
  );
  assert.equal(worker.activityMana, 20 + POWER_RULES.maxRechargePerSecond);
  assert.equal(first.overBudget, false);

  // 连续跑够久，储备应当回满且不溢出
  for (let i = 0; i < 30; i += 1) system.tick(1);
  assert.equal(worker.activityMana, 60, '储备不得超过容量');
  assert.equal(system.stats.supplied > 0, true);
});

check('基地魔力池：充能会扣储备，见底后不再对外供能', () => {
  const rules = { ...POWER_RULES, baseManaCapacity: 10, baseManaRegenPerSecond: 0, maxRechargePerSecond: 10 };
  const system = new PowerSystem(null, { rules });
  const supplier = system.registerSupplier({
    id: 'base',
    kind: 'base',
    x: 0,
    z: 0,
    supplyPerSecond: 5,
    supplyRadius: 20,
    manaStored: 3,
    manaCapacity: 10
  });
  const worker = {
    id: 'w1', kind: 'unit', x: 2, z: 0,
    activityMana: 0, manaCapacity: 60, drainPerSecond: 0
  };
  system.registerReceiver(worker);
  const first = system.tick(1);
  assert.equal(first.supplied, 3);
  assert.equal(worker.activityMana, 3);
  assert.equal(supplier.manaStored, 0);
  const second = system.tick(1);
  assert.equal(second.supplied, 0);
  assert.equal(worker.activityMana, 3);
});

check('离开供能范围仍能活动，只是不再补魔，储备见底才停机', () => {
  const system = new PowerSystem(null);
  system.registerSupplier({ id: 'base', x: 0, z: 0, supplyPerSecond: 12, supplyRadius: 20 });
  const worker = {
    id: 'w1', kind: 'unit', x: 500, z: 0,
    activityMana: 5, manaCapacity: 60, drainPerSecond: 2
  };
  system.registerReceiver(worker);

  const first = system.tick(1);
  assert.equal(first.supplied, 0, '范围外拿不到补魔');
  assert.equal(worker.activityMana, 3, '但仍然能继续活动');
  assert.equal(system.receiverState(worker), POWER_STATE.low, '储备低应当能被查询出来');

  system.tick(1);
  assert.equal(worker.activityMana, 1);
  const third = system.tick(1);
  assert.equal(worker.activityMana, 0, '储备见底');
  assert.equal(third.starved.length, 1, '储备不够支付本段消耗时应当被记为停机');
  assert.equal(system.receiverState(worker), POWER_STATE.starved);
});

check('供给不足时储备单调下降，供需余量如实反映', () => {
  const system = new PowerSystem(null);
  // 供能只有 2/秒，但接收者要消耗 5/秒（非基地供能源，避免基地池自动回满）
  system.registerSupplier({ id: 'furnace', kind: 'manaFurnace', x: 0, z: 0, supplyPerSecond: 2, supplyRadius: 20 });
  const worker = {
    id: 'w1', kind: 'unit', x: 3, z: 0,
    activityMana: 30, manaCapacity: 60, drainPerSecond: 5
  };
  system.registerReceiver(worker);

  const before = worker.activityMana;
  for (let i = 0; i < 5; i += 1) system.tick(1);
  assert.equal(worker.activityMana, before - 15, '净消耗应当是 5 - 2 = 3/秒');
  assert.equal(system.summary().receivers, 1);
});

check('每段的实发量都不超过该段预算（PowerSystem 层）', () => {
  const system = new PowerSystem(null);
  system.registerSupplier({ id: 'base', x: 0, z: 0, supplyPerSecond: 6, supplyRadius: 20 });
  const workers = Array.from({ length: 8 }, (_, i) => {
    const worker = {
      id: `w${i}`, kind: 'unit', x: i * 0.4, z: 0,
      activityMana: 0, manaCapacity: 60, drainPerSecond: 3
    };
    system.registerReceiver(worker);
    return worker;
  });
  for (let i = 0; i < 40; i += 1) {
    const tickReport = system.tick(1);
    assert.equal(tickReport.overBudget, false, `第 ${i} 段超预算`);
    assert.ok(tickReport.supplied <= tickReport.capacity + 1e-9);
    workers.forEach((worker) => {
      assert.ok(worker.activityMana <= worker.manaCapacity, '储备不得超过容量');
      assert.ok(worker.activityMana >= 0);
    });
  }
});

check('没有接收者时不产生任何流动', () => {
  const system = new PowerSystem(null);
  system.registerSupplier({ id: 'base', x: 0, z: 0, supplyPerSecond: 12 });
  const tickReport = system.tick(1);
  assert.equal(tickReport.supplied, 0);
  assert.equal(tickReport.consumed, 0);
  assert.equal(tickReport.surplus, 12);
});

check('供能系统不碰符文石上的 mana 字段', () => {
  const system = new PowerSystem(null);
  system.registerSupplier({ id: 'base', x: 0, z: 0, supplyPerSecond: 12 });
  // 这是符文石的字段命名，活动魔力必须用 activityMana 系列，不能被误写
  const stoneLike = { id: 'stone', kind: 'stone', x: 0, z: 0, mana: 999, level: 3 };
  system.registerReceiver(stoneLike);
  system.tick(1);
  assert.equal(stoneLike.mana, 999, '符文资源的字段不能被供能系统改写');
  assert.ok(!('activityMana' in stoneLike) || stoneLike.activityMana === 0);
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
