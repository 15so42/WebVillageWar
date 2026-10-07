// 人类部队的口粮与供餐（运行时 + 纯规则回归）。
//
// 对应 docs/DSH_DEFENSE_SURVIVAL_DESIGN.md 第三节 B 的每一条可断言要求：
//   1. 傀儡 / 敌人 / 野生动物 / 中立 / 建筑都不吃玩家的口粮；
//   2. 饱食度 0–100、初始 100、每分钟 -12，按模拟时间推进；
//   3. ≤60 且背包有口粮 → 自动吃一份、+40、不超上限、不重复扣费；
//   4. 歼饿 / 力竭两档**互斥**，吃饭后立刻撤掉，反复刷新不叠乘；
//   5. 食堂供餐只拉空闲单位，**前线不会有隔空吃基地库存**这回事；
//   6. HUD 汇总按真实消耗率算，零消耗显示"稳定"而不是除零/无穷。
import assert from 'node:assert/strict';
import {
  ARMY_NEEDS_RULES,
  SATIETY_INITIAL,
  SATIETY_MAX,
  SATIETY_MODIFIER_SOURCE,
  SATIETY_TIER,
  advanceSatiety,
  armyNeedsRules,
  armySupplySummary,
  isFoodConsumer,
  planAutoEat,
  satietyAfterEating,
  satietyModifiers,
  satietyTier,
  starvingSoldierCount
} from '../src/systems/armyNeeds.js';
import { ArmyNeedsSystem, RATION_ITEM_ID, GRAIN_ITEM_ID } from '../src/systems/ArmyNeedsSystem.js';
import { AttributeSet } from '../src/systems/AttributeSet.js';
import { Inventory } from '../src/systems/Inventory.js';
import { UNIT_DEFINITIONS } from '../src/data/gameData.js';

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

// --------------------------------------------------------------------- 夹具
function makeUnit(id, { type = 'swordsman', x = 0, z = 0, foodConsumer = null } = {}) {
  const definition = foodConsumer === null
    ? (UNIT_DEFINITIONS[type] ?? {})
    : { ...(UNIT_DEFINITIONS[type] ?? {}), foodConsumer };
  const unit = {
    id,
    type,
    name: id,
    team: 'player',
    alive: true,
    isBuilding: false,
    isWorker: false,
    definition,
    position: { x, y: 0, z },
    attributes: new AttributeSet({
      attackRate: definition.attackRate ?? 1,
      naturalRecoveryScale: 1
    }),
    itemBag: new Inventory({ id: `bag:${id}`, capacity: 8 }),
    itemBagFor: null
  };
  return unit;
}

function makeCanteen(id, { x = 0, z = 0, rations = 6 } = {}) {
  const output = new Inventory({ id: `out:${id}`, capacity: 8 });
  if (rations > 0) output.add(RATION_ITEM_ID, rations);
  const unit = {
    id,
    type: 'canteen',
    name: id,
    team: 'player',
    alive: true,
    isBuilding: true,
    underConstruction: false,
    poweredDown: false,
    position: { x, y: 0, z },
    output
  };
  unit.station = { id: `station:${id}`, outputInventory: output };
  return unit;
}

function makeGame({ units = [], canteens = [], rations = 0, grain = 0 } = {}) {
  const baseInventory = new Inventory({ id: 'base', capacity: 64 });
  if (rations > 0) baseInventory.add(RATION_ITEM_ID, rations);
  if (grain > 0) baseInventory.add(GRAIN_ITEM_ID, grain);
  const all = [...units, ...canteens];
  const game = {
    elapsedTime: 0,
    baseInventory,
    friendlyUnits: all,
    effects: { rings: [], spawnRing(position, color, radius, life) { this.rings.push({ position, color, radius, life }); } },
    backpack: { dirty: 0, markDirty() { this.dirty += 1; } },
    onUnitBackpackChanged() {},
    stationPanel: { dirty: 0, markDirty() { this.dirty += 1; } },
    stations: {
      stationFor(unit) {
        return unit?.station ?? null;
      }
    },
    itemBagFor(unit) {
      return unit?.itemBag ?? null;
    },
    // 单位移动：真实移动系统会推进 position，这里只记录目标并直接落位，
    // 保证"必须实际走过去"这件事在不引入寻路的前提下仍可断言。
    moveUnit(unit, dt) {
      if (!unit.moveGoal) return;
      const distance = Math.hypot(unit.moveGoal.x - unit.position.x, unit.moveGoal.z - unit.position.z);
      const step = Math.min(distance, 4 * dt);
      if (distance <= 0.001) return;
      unit.position.x += ((unit.moveGoal.x - unit.position.x) / distance) * step;
      unit.position.z += ((unit.moveGoal.z - unit.position.z) / distance) * step;
    }
  };
  all.forEach((unit) => {
    if (unit.isBuilding) return;
    unit.movement = {
      moveToward(goal, dt) {
        game.moveUnit(unit, dt);
        void goal;
      }
    };
  });
  return game;
}

function tick(system, game, dt, total) {
  let elapsed = 0;
  while (elapsed < total) {
    const step = Math.min(dt, total - elapsed);
    elapsed += step;
    game.elapsedTime += step;
    system.update(step);
  }
}

// --------------------------------------------------------------------- 纯规则
check('只有带 foodConsumer 标记的单位吃饭：傀儡/敌人/中立/建筑都不吃', () => {
  assert.equal(isFoodConsumer({ definition: { foodConsumer: true } }), true);
  assert.equal(isFoodConsumer({ definition: {} }), false);
  assert.equal(isFoodConsumer({ type: 'woodPuppet', definition: { foodConsumer: false } }), false);
  // 真实数据：兵种带标记，傀儡没有
  assert.equal(isFoodConsumer({ definition: UNIT_DEFINITIONS.swordsman }), true);
  assert.equal(isFoodConsumer({ definition: UNIT_DEFINITIONS.woodPuppet ?? {} }), false);
  assert.equal(isFoodConsumer({ definition: UNIT_DEFINITIONS.goblinSoldier ?? {} }), false);
  assert.equal(isFoodConsumer({ definition: UNIT_DEFINITIONS.wolf ?? {} }), false);
  assert.equal(isFoodConsumer({ definition: UNIT_DEFINITIONS.arrowTower ?? {} }), false);
  // 不能拿 canMove 当判据
  assert.equal(UNIT_DEFINITIONS.woodPuppet?.canMove, true, '傀儡能移动但不是食物消费者');
});

check('饱食度按模拟时间每分钟 -12，且夹在 0–100', () => {
  const rules = armyNeedsRules();
  assert.equal(rules.satietyPerMinute, 12);
  assert.ok(Math.abs(advanceSatiety(100, 60) - 88) < 1e-9, '一分钟应当掉 12');
  assert.equal(advanceSatiety(100, 0), 100);
  assert.equal(advanceSatiety(5, 3600), 0, '不会掉成负数');
  assert.equal(advanceSatiety(50, -10), 50, '负时间不产生回血');
  assert.equal(advanceSatiety(120, 0), 100, '超过上限的输入被夹回 100');
});

check('自动吃：≤60 且有随身口粮才吃，一次一份、+40、不超上限', () => {
  assert.equal(planAutoEat({ satiety: 61, rations: 3 }), null, '高于阈值不吃');
  assert.equal(planAutoEat({ satiety: 60, rations: 0 }), null, '没口粮不吃');
  const plan = planAutoEat({ satiety: 60, rations: 1 });
  assert.equal(plan.restore, 40);
  assert.equal(plan.satietyAfter, 100);
  assert.equal(planAutoEat({ satiety: 10, rations: 5 }).satietyAfter, 50);
  assert.equal(satietyAfterEating(90), SATIETY_MAX, '不能超过上限');
});

check('两档减益互斥：饥饿 ×0.85 与半恢复，力竭 ×0.70 与停止恢复', () => {
  const fed = satietyModifiers(80);
  assert.deepEqual(fed, [], '饱食没有任何减益');
  const hungry = satietyModifiers(25);
  assert.equal(satietyTier(25), SATIETY_TIER.hungry);
  assert.deepEqual(hungry.map((entry) => entry.stat).sort(), ['attackRate', 'naturalRecoveryScale']);
  assert.ok(Math.abs(hungry[0].percent - (0.85 - 1)) < 1e-9);
  assert.ok(Math.abs(hungry[1].percent - (0.5 - 1)) < 1e-9, '饥饿时自然恢复减半');
  const exhausted = satietyModifiers(0);
  assert.equal(satietyTier(0), SATIETY_TIER.exhausted);
  assert.deepEqual(exhausted.map((entry) => entry.stat), ['attackRate'], '力竭档不叠饥饿档');
  assert.ok(Math.abs(exhausted[0].percent - (0.7 - 1)) < 1e-9);
  // 26 分到饱食档，25 分到饥饿档——边界不能飘
  assert.equal(satietyTier(26), SATIETY_TIER.fed);
  assert.equal(satietyTier(25), SATIETY_TIER.hungry);
});

check('HUD 汇总按真实消耗率算；零消耗显示稳定而不是无穷/除零', () => {
  const none = armySupplySummary({ rations: 12, soldiers: 0 });
  assert.equal(none.secondsOfSupply, null);
  assert.equal(none.label, '没有需要口粮的部队');
  const four = armySupplySummary({ rations: 12, soldiers: 4 });
  // 每人每秒消耗 = 12/60/40 = 0.005；4 人 = 0.02/秒；12 份 → 600 秒
  assert.ok(Math.abs(four.secondsOfSupply - 600) < 1e-6, `实际 ${four.secondsOfSupply}`);
  const more = armySupplySummary({ rations: 12, soldiers: 8 });
  assert.ok(more.secondsOfSupply < four.secondsOfSupply, '人越多能撑的时间越短');
  // 零消耗规则（把每分钟消耗设成 0）不能变成除零
  const stable = armySupplySummary({
    rations: 12,
    soldiers: 3,
    rules: armyNeedsRules({ satietyPerMinute: 0 })
  });
  assert.equal(stable.secondsOfSupply, null);
  assert.ok(Number.isFinite(stable.rationSecondsPerSoldier) === false || stable.rationSecondsPerSoldier === null);
});

// --------------------------------------------------------------------- 运行时
check('归队初始化 100，且只初始化一次（不会每次刷新都喂饱）', () => {
  const soldier = makeUnit('s1');
  const game = makeGame({ units: [soldier] });
  const needs = new ArmyNeedsSystem(game);
  assert.equal(needs.initializeFor(soldier), true);
  assert.equal(soldier.satiety, SATIETY_INITIAL);
  soldier.satiety = 12;
  assert.equal(needs.initializeFor(soldier), false, '第二次不能重设');
  assert.equal(soldier.satiety, 12, '重设会把打残的部队瞬间喂饱');
});

check('随模拟时间掉饱食度：60 秒后 100 → 88', () => {
  const soldier = makeUnit('s1');
  const game = makeGame({ units: [soldier] });
  const needs = new ArmyNeedsSystem(game);
  tick(needs, game, 1 / 60, 60);
  assert.ok(soldier.satiety > 87.5 && soldier.satiety < 88.5, `实际 ${soldier.satiety}`);
});

check('采样频率不影响消耗速度：60fps 与 144fps 掉得一样', () => {
  const a = makeUnit('a');
  const gameA = makeGame({ units: [a] });
  const needsA = new ArmyNeedsSystem(gameA);
  tick(needsA, gameA, 1 / 60, 30);

  const b = makeUnit('b');
  const gameB = makeGame({ units: [b] });
  const needsB = new ArmyNeedsSystem(gameB);
  tick(needsB, gameB, 1 / 144, 30);

  assert.ok(Math.abs(a.satiety - b.satiety) < 0.05, `60fps=${a.satiety} 144fps=${b.satiety}`);
  assert.ok(Math.abs(a.satiety - 94) < 0.05, `30 秒应当掉 6，实际 ${a.satiety}`);
});

check('随身口粮自动吃：扣一份、回到上限、战斗中也不打断指令', () => {
  const soldier = makeUnit('s1');
  soldier.itemBag.add(RATION_ITEM_ID, 2);
  soldier.target = { id: 'enemy' };
  soldier.controlMode = 'attack';
  const game = makeGame({ units: [soldier] });
  const needs = new ArmyNeedsSystem(game);
  needs.initializeFor(soldier);
  soldier.satiety = 55;
  tick(needs, game, 1 / 60, 1);
  assert.equal(soldier.itemBag.countOf(RATION_ITEM_ID), 1, '只吃一份');
  assert.ok(soldier.satiety > 93 && soldier.satiety <= 100, `55 + 40 只受上限约束，实际 ${soldier.satiety}`);
  assert.equal(soldier.target?.id, 'enemy', '吃饭不该清掉攻击目标');
  assert.equal(soldier.controlMode, 'attack', '吃饭不该改指令');
  // 第二次采样不应再吃（已经 >60）
  tick(needs, game, 1 / 60, 0.5);
  assert.equal(soldier.itemBag.countOf(RATION_ITEM_ID), 1, '不重复扣费');
});

check('减益幂等：反复刷新 / 快照往返不会叠乘，吃饱立刻撤掉', () => {
  const soldier = makeUnit('s1');
  const game = makeGame({ units: [soldier] });
  const needs = new ArmyNeedsSystem(game);
  needs.initializeFor(soldier);
  soldier.satiety = 0;
  // 模拟"反复刷新"：连续多次强制重挂
  for (let i = 0; i < 5; i += 1) needs.applyModifiers(soldier, { force: true });
  const starvedRate = soldier.attributes.get('attackRate');
  const base = UNIT_DEFINITIONS.swordsman.attackRate ?? 1;
  assert.ok(Math.abs(starvedRate - base * 0.7) < 1e-6, `力竭攻速应是一次 ×0.7，实际 ${starvedRate}`);
  // 快照往返（单位属性集原样保留）后仍只有一条修正
  const modifiers = soldier.attributes.values.get('attackRate').multiply;
  assert.equal(modifiers.filter((entry) => entry.source === SATIETY_MODIFIER_SOURCE).length, 1);
  // 吃饱：立刻撤掉
  soldier.satiety = 80;
  needs.applyModifiers(soldier);
  assert.ok(Math.abs(soldier.attributes.get('attackRate') - base) < 1e-6, '吃饱后攻速回到基础值');
  assert.equal(
    soldier.attributes.values.get('attackRate').multiply.filter((entry) => entry.source === SATIETY_MODIFIER_SOURCE).length,
    0
  );
});

check('食堂供餐：空闲单位实际走过去、从食堂产物格扣一份、恢复饱食', () => {
  const soldier = makeUnit('s1', { x: 12, z: 0 });
  const canteen = makeCanteen('c1', { x: 0, z: 0, rations: 4 });
  const game = makeGame({ units: [soldier], canteens: [canteen] });
  const needs = new ArmyNeedsSystem(game);
  needs.initializeFor(soldier);
  soldier.satiety = 50;
  assert.equal(game.baseInventory.countOf(RATION_ITEM_ID), 0, '基地一开始没有口粮');
  tick(needs, game, 1 / 30, 10);
  // 走 12 米、mealRange 3.2：6 秒足够走到（4 m/s）并吃上
  assert.ok(soldier.satiety > 80, `吃到饭应当恢复，实际 ${soldier.satiety}`);
  assert.ok(canteen.output.countOf(RATION_ITEM_ID) <= 3, `食堂应当被扣掉一份，实际剩 ${canteen.output.countOf(RATION_ITEM_ID)}`);
  assert.equal(game.baseInventory.countOf(RATION_ITEM_ID), 0, '隔空吃基地库存是不允许的');
});

check('食堂不抢玩家命令：正在攻击/驻守的部队不会被叫去吃饭', () => {
  const soldier = makeUnit('s1', { x: 12, z: 0 });
  const canteen = makeCanteen('c1', { rations: 4 });
  const game = makeGame({ units: [soldier], canteens: [canteen] });
  const needs = new ArmyNeedsSystem(game);
  needs.initializeFor(soldier);
  soldier.satiety = 40;
  soldier.commandMoveGoal = { x: 30, z: 30 };
  soldier.moveGoal = { x: 30, z: 30 };
  const before = { ...soldier.moveGoal };
  tick(needs, game, 1 / 30, 4);
  assert.deepEqual(soldier.moveGoal, before, '远征/移动命令的目标不能被吃饭改掉');
  assert.equal(canteen.output.countOf(RATION_ITEM_ID), 4, '没吃上，食堂不该被扣');
  // 驻守（controlMode=hold）同理
  soldier.moveGoal = null;
  soldier.commandMoveGoal = null;
  soldier.controlMode = 'hold';
  tick(needs, game, 1 / 30, 2);
  assert.equal(canteen.output.countOf(RATION_ITEM_ID), 4, '驻守单位不该被拉去吃饭');
});

check('傀儡 / 敌人 / 中立不吃：consumers() 只返回带标记的己方存活单位', () => {
  const soldier = makeUnit('s1');
  const puppet = makeUnit('w1', { type: 'woodPuppet', foodConsumer: false });
  puppet.isWorker = true;
  const wolf = makeUnit('wolf-1', { type: 'wolf', foodConsumer: false });
  wolf.team = 'enemy';
  const neutral = makeUnit('raider-1', { type: 'raider', foodConsumer: false });
  neutral.team = 'neutral';
  const dead = makeUnit('s2');
  dead.alive = false;
  const game = makeGame({ units: [soldier, puppet, wolf, neutral, dead] });
  const needs = new ArmyNeedsSystem(game);
  const list = needs.consumers().map((unit) => unit.id);
  assert.deepEqual(list, ['s1']);
  assert.equal(starvingSoldierCount([soldier, wolf, neutral]), 0);
});

check('reset 清掉属性来源与预约，不留残留修正', () => {
  const soldier = makeUnit('s1');
  const canteen = makeCanteen('c1', { rations: 3 });
  const game = makeGame({ units: [soldier], canteens: [canteen] });
  const needs = new ArmyNeedsSystem(game);
  needs.initializeFor(soldier);
  soldier.satiety = 0;
  needs.applyModifiers(soldier, { force: true });
  needs.seatsFor('c1').add(soldier.id);
  needs.reset();
  assert.equal(
    soldier.attributes.values.get('attackRate').multiply.filter((entry) => entry.source === SATIETY_MODIFIER_SOURCE).length,
    0
  );
  assert.equal(needs.seats.size, 0);
  assert.equal(needs.initialized.size, 0);
  assert.equal(soldier.mealCanteenId, null);
});

check('规则可配置：改阈值与每分钟消耗后行为跟着变（不是写死的常量）', () => {
  const soldier = makeUnit('s1');
  const game = makeGame({ units: [soldier] });
  const needs = new ArmyNeedsSystem(game, { rules: { satietyPerMinute: 60, autoEatAtOrBelow: 90 } });
  needs.initializeFor(soldier);
  soldier.itemBag.add(RATION_ITEM_ID, 1);
  tick(needs, game, 1 / 60, 20);
  assert.ok(soldier.satiety > 60, '阈值 90 时更早开吃');
  assert.equal(soldier.itemBag.countOf(RATION_ITEM_ID), 0, '应当已经吃掉那份口粮');
  assert.ok(ARMY_NEEDS_RULES.autoEatAtOrBelow === 60, '默认值没被就地改写');
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
