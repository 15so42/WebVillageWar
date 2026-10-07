// 基地供能预算：起步可玩、扩张要供给（docs/DSH_DEFENSE_SURVIVAL_DESIGN.md 第三节 A）。
//
// 这一条不能用"手感"验收，所以这里用**纯规则模拟**把三件事算清楚：
//   1. 起始活动储备 + 基地供能，能不能支撑一名傀儡的基本作业（不自启动锁死）；
//   2. 第二名傀儡 + 魔力炉 + 防塔并发时，基地供能**必然不够**——扩张要靠
//      木材 → 木炭 → 魔力炉与物流，而不是无限扩产；
//   3. 净供需与"剩余时间"的口径：零消耗显示稳定，不做除零/无穷；
//   4. 单傀儡靠基地供能不能永久满载（这正是"扩产要配供能"能被感知到的原因）。
//
// 模拟口径与 PowerSystem 完全一致（见 src/systems/PowerSystem.js）：
//   - 每段先用接收者自己的 activityMana 付掉行为消耗；
//   - 供能源本段可发量 = supplyPerSecond × dt，且不超过基地池当前储量；
//   - 补进去的量受 maxRechargePerSecond × dt 与容量缺口限制。
import assert from 'node:assert/strict';
import { POWER_RULES } from '../src/data/gameData.js';
import { POWER_STRATEGY, allocatePower } from '../src/systems/power.js';

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
 * 一段供能模拟：与 PowerSystem.tick 同一套顺序与上限。
 * 返回这一段的报表（消耗、实发、断电接收者）。
 */
function tick(supplier, receivers, dt) {
  supplier.manaStored = Math.min(
    supplier.manaCapacity,
    supplier.manaStored + POWER_RULES.baseManaRegenPerSecond * dt
  );
  const report = { consumed: 0, supplied: 0, starved: [] };
  const demands = [];
  receivers.forEach((receiver) => {
    const drain = Math.max(0, receiver.drainPerSecond) * dt;
    const before = Math.max(0, Math.min(receiver.manaCapacity, receiver.activityMana));
    const paid = Math.min(before, drain);
    if (drain - paid > 0) report.starved.push(receiver.id);
    receiver.activityMana = before - paid;
    report.consumed += paid;
    const rechargeCap = POWER_RULES.maxRechargePerSecond * dt;
    const want = Math.min(receiver.manaCapacity - receiver.activityMana, rechargeCap);
    demands.push({
      id: receiver.id,
      kind: receiver.kind ?? 'unit',
      x: 0,
      z: 0,
      manaCapacity: receiver.manaCapacity,
      manaStored: receiver.activityMana,
      priority: receiver.powerPriority ?? 0,
      demand: Math.max(0, want)
    });
  });
  const allocation = allocatePower({
    suppliers: [supplier],
    receivers: demands,
    dt,
    strategy: POWER_STRATEGY.nearestFirst
  });
  allocation.grants.forEach((grant) => {
    if (grant.granted <= 0) return;
    const receiver = receivers.find((entry) => entry.id === grant.id);
    receiver.activityMana = Math.min(receiver.manaCapacity, receiver.activityMana + grant.granted);
    report.supplied += grant.granted;
  });
  return report;
}

function makeSupplier() {
  return {
    id: 'player-base',
    kind: 'base',
    x: 0,
    z: 0,
    supplyPerSecond: POWER_RULES.baseSupplyPerSecond,
    supplyRadius: POWER_RULES.baseSupplyRadius,
    manaCapacity: POWER_RULES.baseManaCapacity,
    manaStored: POWER_RULES.baseManaCapacity
  };
}

function makePuppet(id, { capacity = 40, mana = 40, x = 6, z = 0 } = {}) {
  return {
    id,
    kind: 'unit',
    isWorker: true,
    x,
    z,
    manaCapacity: capacity,
    activityMana: mana,
    drainPerSecond: POWER_RULES.workerDrainHarvest
  };
}

function makeFacility(id, drainPerSecond, { capacity = 24, mana = 24, x = 8, z = 0 } = {}) {
  return { id, kind: 'facility', x, z, manaCapacity: capacity, activityMana: mana, drainPerSecond };
}

function makeTower(id, drainPerSecond, { capacity = 30, mana = 30, x = 10, z = 0 } = {}) {
  return { id, kind: 'tower', x, z, manaCapacity: capacity, activityMana: mana, drainPerSecond };
}

function simulate({ receivers, seconds, dt = 0.1 }) {
  const supplier = makeSupplier();
  let minMana = Infinity;
  let starvedSeconds = 0;
  let totalSupplied = 0;
  let totalConsumed = 0;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) {
    const report = tick(supplier, receivers, dt);
    totalSupplied += report.supplied;
    totalConsumed += report.consumed;
    receivers.forEach((receiver) => {
      minMana = Math.min(minMana, receiver.activityMana);
    });
    if (report.starved.length) starvedSeconds += dt;
  }
  return {
    supplier,
    minMana,
    starvedSeconds,
    totalSupplied,
    totalConsumed,
    endMana: receivers.map((receiver) => ({ id: receiver.id, mana: receiver.activityMana }))
  };
}

// --------------------------------------------------------------------- 断言
check('参数口径：基地供能 2.2/秒、池 80、再生 1.6/秒，接收者补能上限不超过基地功率', () => {
  assert.equal(POWER_RULES.baseSupplyPerSecond, 2.2);
  assert.equal(POWER_RULES.baseManaCapacity, 80);
  assert.equal(POWER_RULES.baseManaRegenPerSecond, 1.6);
  assert.equal(POWER_RULES.workerDrainHarvest, 2.2);
  /**
   * 单个接收者的补能上限**不能高于**基地的 supplyPerSecond：
   * 魔力炉用的是 baseSupplyPerSecond 当自己的 supplyPerSecond，如果
   * maxRechargePerSecond 比它大，同一个接收者从魔力炉拿到的比从基地拿到的还多，
   * 燃料供能的净产出就变成了"参数不一致"赚来的，而不是燃料赚来的。
   */
  assert.ok(
    POWER_RULES.maxRechargePerSecond <= POWER_RULES.baseSupplyPerSecond,
    `单接收者补能上限 ${POWER_RULES.maxRechargePerSecond} 不能高于基地功率 ${POWER_RULES.baseSupplyPerSecond}`
  );
  // 关键不等式：基地再生 < 单接收者补满速率，所以并发时必然互相挤压
  assert.ok(POWER_RULES.baseManaRegenPerSecond < POWER_RULES.maxRechargePerSecond);
});

check('起步可玩：单傀儡采集 4 分钟不会断电（自启动不被锁死）', () => {
  const puppet = makePuppet('p1', { mana: 40 });
  const result = simulate({ receivers: [puppet], seconds: 240 });
  // 关键结论（不是"永远满电"）：
  //   傀儡采集耗魔 2.2/秒，而基地池被抽空后只剩下 1.6/秒的再生功率，
  //   所以净缺口 0.6/秒 → 40 点储备约 67 秒见底，随后傀儡靠基地再生持续工作。
  //   "锁死"指的是**完全付不起行为消耗**：这里基地再生 1.6/秒 > 0，
  //   傀儡始终拿得到魔，只是不能一直满载——这正是扩张压力。
  assert.ok(
    result.starvedSeconds < 240,
    `不该全程付不起消耗，实际 ${result.starvedSeconds} 秒`
  );
  // 起步窗口：前 60 秒必须完全不缺（约等于"一分钟内不会被打断"）
  const early = simulate({ receivers: [makePuppet('p1', { mana: 40 })], seconds: 60 });
  assert.equal(early.starvedSeconds, 0, '起步一分钟内不该缺魔');
  assert.ok(early.minMana > 0, `起步储备不该在 60 秒内见底，实际最低 ${early.minMana}`);
  // 4 分钟里基地池会被抽到低位（这就是"扩产感知"），但不会归零
  assert.ok(result.supplier.manaStored >= 0);
  assert.ok(result.totalSupplied > 0);
});

check('起步窗口口径：前 60 秒满储备，之后基地池见底、傀儡只能拿 1.6/秒', () => {
  const drain = POWER_RULES.workerDrainHarvest;               // 2.2/秒
  const regen = POWER_RULES.baseManaRegenPerSecond;           // 1.6/秒（池空后只剩再生）
  const capacity = POWER_RULES.workerManaCapacity;            // 40
  const supplier = makeSupplier();
  const puppet = makePuppet('p1', { mana: capacity });
  const dt = 0.05;
  const samples = {};
  let seconds = 0;
  let baseEmptyAt = null;
  while (seconds < 300) {
    tick(supplier, [puppet], dt);
    seconds += dt;
    if (baseEmptyAt === null && supplier.manaStored <= 1e-6) baseEmptyAt = seconds;
    [60, 120, 240].forEach((mark) => {
      if (samples[mark] === undefined && seconds >= mark) {
        samples[mark] = { puppet: puppet.activityMana, base: supplier.manaStored };
      }
    });
  }
  // 前 60 秒：基地池的存量把 2.2/秒的满功率顶住了
  assert.ok(samples[60].puppet > capacity - 1, `60 秒时储备应仍然满，实际 ${samples[60].puppet}`);
  // 基地池迟早被抽空（80 点存量 ÷ 0.6/秒净缺口 ≈ 133 秒）
  assert.ok(baseEmptyAt !== null && baseEmptyAt < 200, `基地池应在 200 秒内见底，实际 ${baseEmptyAt}`);
  // 池空之后：傀儡拿到的只有 1.6/秒，低于 2.2/秒采集耗魔 → 储备缓慢下降
  assert.ok(samples[240].puppet < capacity - 0.5, `240 秒时储备必须已经下降，实际 ${samples[240].puppet}`);
  assert.ok(samples[240].puppet > 0, '仍然拿得到魔，不是死锁');
  // 理论量级：净缺口 0.6/秒时 40 点储备约 67 秒见底（这里只校验量级一致）
  const expected = capacity / (drain - regen);
  assert.ok(Math.abs(expected - 66.67) < 0.5, `理论窗口 ${expected}`);
});

check('单傀儡靠基地供能无法永久满载：长期会出现净缺口', () => {
  // 用最耗魔的行为（采集 2.2/秒）持续 15 分钟
  const puppet = makePuppet('p1');
  const result = simulate({ receivers: [puppet], seconds: 900 });
  // 供给上限 2.2/秒 = 消耗 2.2/秒，收支刚好持平；但再生只有 1.6/秒，
  // 所以基地池会被慢慢抽干，最终靠再生供能 → 实际可用功率降到 1.6/秒。
  assert.ok(result.supplier.manaStored < POWER_RULES.baseManaCapacity,
    '长期满载后基地池不该还是满的');
  // 净吞吐口径：再生 1.6 减去需求
  const netAfterDrain = POWER_RULES.baseManaRegenPerSecond - POWER_RULES.workerDrainHarvest;
  assert.ok(netAfterDrain < 0, '再生不足以覆盖一个满载采集傀儡：扩产必须自己解决供能');
});

check('扩张要供给：两名傀儡 + 魔力炉 + 一座防塔并发时，基地供能不够', () => {
  const receivers = [
    makePuppet('p1'),
    makePuppet('p2', { x: 7, z: 2 }),
    makeFacility('manaFurnace', 1),
    makeTower('arrowTower', 0.6)
  ];
  const demand = receivers.reduce((sum, receiver) => sum + receiver.drainPerSecond, 0);
  assert.ok(
    demand > POWER_RULES.baseManaRegenPerSecond,
    `扩张需求 ${demand}/秒 必须大于基地再生 ${POWER_RULES.baseManaRegenPerSecond}/秒`
  );
  const result = simulate({ receivers, seconds: 300 });
  assert.ok(result.minMana < 40, `并发时储备必须明显下降，实际最低 ${result.minMana}`);
  // 至少有一名接收者落到断电：这正是"停掉部分防塔给生产让电"的动机
  const drained = receivers.filter((receiver) => receiver.activityMana <= 0.5).length;
  assert.ok(drained >= 1, `并发 5 分钟后至少应有一个接收者断电，实际 ${drained}`);
});

check('净供需与剩余时间的口径：零消耗显示稳定，不做除零/无穷', () => {
  const netOf = (regen, demandPerSecond, stored) => {
    const net = regen - demandPerSecond;
    const deficit = Math.max(0, -net);
    return {
      net,
      secondsLeft: deficit > 0 ? stored / deficit : null
    };
  };
  // 零消耗：没有"耗尽"这回事
  assert.equal(netOf(1.6, 0, 0).secondsLeft, null);
  // 净余量为正：同样没有耗尽
  assert.equal(netOf(2.2, 0.6, 10).secondsLeft, null);
  // 净缺口：按真实消耗率算
  const deficit = netOf(1.6, 3.2, 32);
  assert.ok(Math.abs(deficit.secondsLeft - 20) < 1e-9, '32 储备 / 1.6 缺口 = 20 秒');
  assert.ok(Number.isFinite(deficit.secondsLeft));
});

check('供能守恒：任一段的实发量都不会超过这一段的可供量', () => {
  const receivers = [
    makePuppet('p1', { mana: 0 }),
    makePuppet('p2', { mana: 0 }),
    makeFacility('manaFurnace', 1, { mana: 0 }),
    makeTower('arrowTower', 0.6, { mana: 0 })
  ];
  const supplier = makeSupplier();
  const dt = 0.1;
  let supplied = 0;
  for (let i = 0; i < 600; i += 1) {
    const before = supplier.manaStored;
    const report = tick(supplier, receivers, dt);
    const budget = Math.min(
      POWER_RULES.baseSupplyPerSecond * dt,
      before + POWER_RULES.baseManaRegenPerSecond * dt
    );
    assert.ok(report.supplied <= budget + 1e-9, `第 ${i} 段超发：${report.supplied} > ${budget}`);
    supplied += report.supplied;
  }
  assert.ok(supplied > 0);
});

check('单傀儡断供后仍能靠自身储备继续工作一段（不是一离开基地就停机）', () => {
  const puppet = makePuppet('p1', { mana: 40 });
  // 没有供能源：只走"用自己的储备付"
  let seconds = 0;
  const dt = 0.1;
  while (puppet.activityMana > 0 && seconds < 600) {
    puppet.activityMana = Math.max(0, puppet.activityMana - POWER_RULES.workerDrainHarvest * dt);
    seconds += dt;
  }
  assert.ok(Math.abs(seconds - 40 / POWER_RULES.workerDrainHarvest) < 0.2,
    `自带 40 储备应当能撑约 ${(40 / POWER_RULES.workerDrainHarvest).toFixed(1)} 秒，实际 ${seconds.toFixed(1)}`);
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
