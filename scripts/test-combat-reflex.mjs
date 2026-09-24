// 自卫反射层的纯逻辑回归（combatReflex.js = Numen MobDefenseChain + SurvivalDecisions 的移植）。
//
// 这一层守的是**用户第 5 轮报的那条**「现在木傀儡和狼怎么互相拉扯啊」，以及
// Numen 那套"抢占 + 归还"必须成立的几条性质：
//
//   1. 触发是**布尔**，不是"我多想要身体"的浮点分；
//   2. 危险离开之后有 **2 秒冷静宽限**——一只跟傀儡几乎一样快的怪（狼 3.9 / 傀儡 2.85）
//      会在触发线上反复进出，没有宽限就会每进出一次重开一场仗；
//   3. 一场战斗开着的时候**无条件继续持有身体**（打完再说），不每帧重判；
//   4. **打完不设冷却**：冷却只会在那几秒里让新出现的危险白打；
//   5. 逃跑的终点只有"身边没有追兵"，而且追兵距离必须**远大于**危险半径；
//   6. 巢穴不算追兵（它是地点），否则逃跑永远跑不完。
//
// 第 2/3 条是可以用一个"抖动模拟"直接证明的：让触发信号逐帧开关，
// 断言身体持有者**不会**逐帧翻转。
import assert from 'node:assert/strict';
import {
  BODY_HOLDER,
  COMBAT_PHASE,
  corneredReached,
  defenseTriggered,
  fightResolved,
  fleeResolved,
  fleeTimedOut,
  isMobileThreat,
  selectBodyHolder,
  shouldHoldForDefense
} from '../src/systems/combatReflex.js';
import { COMBAT_PLAN_RULES, combatPlanRules } from '../src/systems/combatPlan.js';

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

const rules = combatPlanRules();
const foe = (overrides = {}) => ({
  id: 'foe',
  distance: 1.5,
  power: 5,
  engaging: false,
  tooClose: false,
  inMyReach: false,
  ...overrides
});

// ---------------------------------------------------------------- 触发（布尔）
check('触发线 ①：正在打我 且 够得着我 —— 两个条件缺一不可', () => {
  assert.equal(defenseTriggered({ foes: [] }), false);
  assert.equal(
    defenseTriggered({ foes: [foe({ engaging: true, tooClose: false, inMyReach: false })] }),
    false,
    '锁了我但还在 9m 外：够不着，不该打断手里的活'
  );
  assert.equal(
    defenseTriggered({ foes: [foe({ engaging: false, tooClose: true, inMyReach: false })] }),
    false,
    '够得着我但没动手：这一条要的是"已经挨打了"，不是"它站在那儿"'
  );
  assert.equal(
    defenseTriggered({ foes: [foe({ engaging: true, tooClose: true, inMyReach: false })] }),
    true
  );
  assert.equal(
    defenseTriggered({
      foes: [foe({ id: 'a' }), foe({ id: 'b', engaging: true, tooClose: true })]
    }),
    true,
    '一群里只要有一个真的在打我，就触发'
  );
});

check('触发线 ②：它已经进了我自己的攻击距离 → 遇上了就先打了', () => {
  // 需求原文：「在干其他活的时候遇到怪物也会先把怪物打了」。
  // 这一条刻意比 Numen 宽（那边由 LLM 决定要不要打路过的怪），
  // 但半径只有傀儡自己的一击之距，不会出现"8m 外的狼就丢下工作"。
  assert.equal(
    defenseTriggered({ foes: [foe({ inMyReach: true, engaging: false, tooClose: false })] }),
    true
  );
  // 反过来：远到打不着的敌人，无论它锁没锁我，都不该在这一条上触发
  assert.equal(
    defenseTriggered({ foes: [foe({ inMyReach: false, engaging: false, tooClose: false })] }),
    false
  );
});

check('触发线不该依赖"够得着它的半径"与"它够得着我的半径"是同一个数', () => {
  // 弓手在 9m 外就能打我（tooClose 为真），而我到不了它那儿（inMyReach 为假）：
  // 两条线必须分别成立，否则"被远程放风筝"时傀儡会一直站着不还手。
  const archer = foe({ engaging: true, tooClose: true, inMyReach: false });
  assert.equal(defenseTriggered({ foes: [archer] }), true);
  // 近战怪贴在我身上但还没锁我：inMyReach 成立，这时候也该动手
  const wolf = foe({ engaging: false, tooClose: false, inMyReach: true });
  assert.equal(defenseTriggered({ foes: [wolf] }), true);
});

check('触发是布尔，不是"我多想要身体"的浮点分（不产生需要维护的魔法数）', () => {
  const value = defenseTriggered({ foes: [foe({ engaging: true, tooClose: true })] });
  assert.equal(typeof value, 'boolean');
});

// ---------------------------------------------------------------- 谁拿身体
check('身体归属是固定顺序：战斗 > 触发 > 冷静宽限 > 作业', () => {
  // 已经开着一场：无条件持有，直到它自己收场
  assert.equal(
    selectBodyHolder({ session: { phase: COMBAT_PHASE.fight }, triggered: false, now: 100, rules }),
    BODY_HOLDER.selfDefense
  );
  // 没人打我、也没有未收场的战斗：身体还给作业
  assert.equal(
    selectBodyHolder({ session: null, triggered: false, now: 100, calmSince: null, rules }),
    BODY_HOLDER.workOrder
  );
  // 触发即接管
  assert.equal(
    selectBodyHolder({ session: null, triggered: true, now: 100, calmSince: null, rules }),
    BODY_HOLDER.selfDefense
  );
});

check('冷静宽限期：危险刚离开的 2 秒内身体不还回去', () => {
  const calmSince = 100;
  assert.equal(
    shouldHoldForDefense({ session: null, triggered: false, now: 100.5, calmSince, rules }),
    true
  );
  assert.equal(
    shouldHoldForDefense({ session: null, triggered: false, now: 101.5, calmSince, rules }),
    true,
    '1.5 秒还在宽限里'
  );
  assert.equal(
    shouldHoldForDefense({ session: null, triggered: false, now: 100 + rules.calmGraceSeconds + 0.1, calmSince, rules }),
    false,
    '过了宽限就该回去干活'
  );
});

check('打完不设冷却：战斗一收场，下一刻就能再开一场（只有宽限，没有冷却）', () => {
  // 逃跑收场时 calmSince = null（见 WorkSystem.closeCombatSession）：
  // 身边已经没有追兵，再触发是不可能的，所以不该白站两秒。
  assert.equal(
    shouldHoldForDefense({ session: null, triggered: false, now: 100, calmSince: null, rules }),
    false
  );
  // 而且没有任何"刚打完所以这段时间不接战"的字段：触发立刻就能接管
  assert.equal(
    shouldHoldForDefense({ session: null, triggered: true, now: 100, calmSince: 99.9, rules }),
    true
  );
});

check('抖动模拟：触发信号逐帧开关时，身体持有者不会逐帧翻转（"互相拉扯"的回归）', () => {
  // 复现旧实现翻面的场景：狼（3.9）和傀儡（2.85）速度接近，
  // 距离在触发线上反复穿越 → `triggered` 一帧 true 一帧 false。
  let session = null;
  let calmSince = null;
  let holder = BODY_HOLDER.workOrder;
  let transitions = 0;
  const frames = 120;      // 6 秒 @ 20Hz
  const dt = 0.05;
  for (let frame = 0; frame < frames; frame += 1) {
    const now = frame * dt;
    // 前 40 帧（2 秒）怪真的在咬我，之后开始抖：隔帧一次
    const triggered = frame < 40 ? true : frame % 2 === 0;
    if (triggered && !session) {
      session = { phase: COMBAT_PHASE.fight, startedAt: now };
    }
    const next = selectBodyHolder({ session, triggered, now, calmSince, rules });
    if (next !== holder) transitions += 1;
    holder = next;
    // 战斗中：只要还有东西在追我，这一场就继续
    if (session && fightResolved({ foes: [{ engaging: triggered }], lastFoeSeenAt: triggered ? now : session.lastFoeSeenAt ?? now, now, rules })) {
      session = null;
      calmSince = now;
    }
  }
  // 旧实现会在每一帧的触发线上翻面（几十次）；这里应该只有极少数几次。
  assert.ok(
    transitions <= 2,
    `身体持有者的翻转次数必须接近 0，实际 ${transitions} 次`
  );
  assert.equal(holder, BODY_HOLDER.selfDefense, '抖到最后一帧仍然归反射：战斗还没收场');
});

// ---------------------------------------------------------------- 战斗终点
check('战斗终点是"这一刻没人再追我"（宽限只有一处，挂在身体归属那一边）', () => {
  const engagingFoe = foe({ engaging: true, tooClose: true });
  assert.equal(fightResolved({ foes: [engagingFoe] }), false, '还有人锁着我，这场就没结束');
  assert.equal(
    fightResolved({ foes: [foe({ inMyReach: true })] }),
    false,
    '贴在我攻击距离里的也算对手（与触发线 ② 用同一个判据）'
  );
  assert.equal(fightResolved({ foes: [] }), true);
  assert.equal(fightResolved({ foes: [foe({ engaging: false, inMyReach: false })] }), true);
  // 宽限只有一处：收场之后由 shouldHoldForDefense 的 calmSince 负责，不在这里再等一次。
  // 两处都加会变成 2+2 秒（实测"狼死后 3.95 秒才回去干活"）。
  assert.equal(typeof fightResolved({ foes: [] }), 'boolean');
  assert.equal(
    shouldHoldForDefense({ session: null, triggered: false, now: 100, calmSince: 99, rules }),
    true,
    '收场那一刻要把 calmSince 写上，宽限由这里生效'
  );
});

// ---------------------------------------------------------------- 逃跑终点
check('逃跑终点只有"身边没有追兵"——不接受"压力降下来了"这类判据', () => {
  assert.equal(fleeResolved({ pursuers: [] }), true);
  assert.equal(fleeResolved({ pursuers: [{ distance: 3, unit: {} }] }), false);
  assert.equal(fleeResolved({ pursuers: [{ distance: 13.9, unit: {} }] }), false, '还在逃跑距离内就不算甩掉');
});

check('逃跑距离必须远大于危险半径（"退两格就判跑掉了"就是这一条）', () => {
  // 危险半径的典型值是 2~10（近战 2、弓手 9.7），逃跑距离 14：
  // 两件事共用一个数的时候，傀儡退两格就判"跑掉了"、站住、被追上，于是走走停停。
  assert.ok(rules.fleeDistance >= 12, `逃跑距离 ${rules.fleeDistance} 太短`);
  assert.ok(rules.fleeDistance > rules.engageAggroRange, '逃跑距离要超过索敌半径');
});

check('逃跑兜底阀门：追兵比傀儡快时不能永远在跑', () => {
  assert.equal(fleeTimedOut({ startedAt: 10, now: 10 + rules.fleeMaxSeconds - 0.1, rules }), false);
  assert.equal(fleeTimedOut({ startedAt: 10, now: 10 + rules.fleeMaxSeconds, rules }), true);
  assert.ok(rules.fleeMaxSeconds > 0 && Number.isFinite(rules.fleeMaxSeconds));
});

check('退无可退：挪不动够久就算（转身打的入口）', () => {
  assert.equal(corneredReached({ stuckSeconds: 0, rules }), false);
  assert.equal(corneredReached({ stuckSeconds: rules.corneredSeconds, rules }), true);
  assert.ok(rules.corneredSeconds < rules.fleeMaxSeconds, '"被堵住"必须比"跑太久"先判出来');
});

// ---------------------------------------------------------------- 追兵的定义
check('巢穴不算追兵（它是地点，不是追兵）', () => {
  assert.equal(isMobileThreat({ isSpawnPointNest: true }), false);
  assert.equal(isMobileThreat({ type: 'wolf' }), true);
  assert.equal(isMobileThreat(null), false);
});

check('规则常量集中在 combatPlan（反射层不另立一份数值）', () => {
  assert.equal(COMBAT_PLAN_RULES.calmGraceSeconds, 2);
  assert.equal(COMBAT_PLAN_RULES.fleeDistance, 14);
  // combatReflex 只消费 combatPlanRules 的结果，不自己定义数值
  const custom = combatPlanRules({ calmGraceSeconds: 5 });
  assert.equal(
    shouldHoldForDefense({ session: null, triggered: false, now: 2, calmSince: 0, rules: custom }),
    true,
    '换一份规则必须真的生效'
  );
  assert.equal(
    shouldHoldForDefense({ session: null, triggered: false, now: 2, calmSince: 0, rules }),
    false,
    '默认 2 秒宽限在 t=2 时已经过期'
  );
});

console.log(report.join('\n'));
console.log(process.exitCode ? '\nCOMBAT REFLEX: FAIL' : '\nCOMBAT REFLEX: PASS');
