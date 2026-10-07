// 需要魔力的功能设施规则回归测试（方案第 9 节的箭塔 / 食堂）。
//
// 核心是**滞回**：魔力耗尽停机之后，要充到重启门槛才重新开工。
// 没有它设施会在 0 附近一帧开一帧停（箭塔抽搐式射击、食堂治疗一顿一顿）。
import assert from 'node:assert/strict';
import {
  allFacilityConfigs,
  facilityConfigForUnitType,
  facilityPowerState,
  normalizeFacilityConfig
} from '../src/systems/facilities.js';
import { FACILITY_CONFIGS, ITEM_DEFINITIONS, RECIPES, UNIT_DEFINITIONS } from '../src/data/gameData.js';
import { towerIdentityFor } from '../src/data/defenseTiers.js';

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

const tower = () => normalizeFacilityConfig(FACILITY_CONFIGS.arrowTower);

check('数据健全：设施都有对应的建筑定义、可放置物品与配方', () => {
  assert.ok(allFacilityConfigs().length > 0);
  allFacilityConfigs().forEach((config) => {
    const definition = UNIT_DEFINITIONS[config.unitType];
    assert.ok(definition, `${config.unitType} 必须有建筑定义`);
    assert.equal(definition.isBuilding, true, '要魔力的设施必须是建筑');
    assert.ok(config.manaCapacity > 0 && config.drainPerSecond >= 0);
    assert.ok(config.restartRatio > 0 && config.restartRatio < 1, '重启门槛要在 (0,1) 之间，否则要么起不来要么没有滞回');
    // 二三级防御终端是**同一栋建筑的等级**，不各自做成一件可放置物品。
    // 它们的可放置性来自那一类塔的一级物品（放置后再原地升级），所以这里
    // 按 defenseTiers 的等级口径回查一级 id，而不是给每级再发一件物品。
    const identity = towerIdentityFor(config.unitType);
    const baseUnitType = identity ? identity.towerId : config.unitType;
    assert.equal(
      ITEM_DEFINITIONS[baseUnitType]?.placeable?.unitType,
      baseUnitType,
      `${config.unitType}（一级 ${baseUnitType}）必须能放置`
    );
    if (identity) {
      assert.ok(RECIPES[baseUnitType], `${baseUnitType} 必须有合成配方`);
      assert.ok(definition.defenseTowerTier === identity.tier, '等级字段必须与类型名一致');
    } else if (config.unitType === 'canteen' || config.unitType === 'shockTower') {
      // 本轮把食堂接回合成表（口粮加工），并新增震荡塔。两者都是真实可放置建筑。
      assert.ok(RECIPES[config.unitType], `${config.unitType} 必须有合成配方`);
    } else {
      assert.ok(RECIPES[config.unitType], `${config.unitType} 必须有合成配方`);
    }
  });
  assert.equal(facilityConfigForUnitType('furnace'), null, '熔炉是生产设施，不该被当成要魔力的设施');
});

check('魔力充足时开工，并按配置吃魔', () => {
  const config = tower();
  const state = facilityPowerState({
    mana: config.manaCapacity,
    capacity: config.manaCapacity,
    restartRatio: config.restartRatio,
    wasDown: false,
    drainPerSecond: config.drainPerSecond
  });
  assert.equal(state.poweredDown, false);
  assert.equal(state.drainPerSecond, config.drainPerSecond);
  assert.equal(state.reason, 'powered');
});

check('魔力见底 → 停机，并且不再吃魔（否则永远充不起来）', () => {
  const config = tower();
  const state = facilityPowerState({
    mana: 0,
    capacity: config.manaCapacity,
    restartRatio: config.restartRatio,
    wasDown: false,
    drainPerSecond: config.drainPerSecond
  });
  assert.equal(state.poweredDown, true);
  assert.equal(state.reason, 'no_mana');
  assert.equal(state.drainPerSecond, 0, '停机期间必须停止吃魔');
});

check('滞回：停机后要充到重启门槛才复工，门槛以下仍然停着', () => {
  const config = tower();
  const threshold = config.manaCapacity * config.restartRatio;
  // 充到门槛以下 → 仍然停
  const below = facilityPowerState({
    mana: threshold - 0.1,
    capacity: config.manaCapacity,
    restartRatio: config.restartRatio,
    wasDown: true,
    drainPerSecond: config.drainPerSecond
  });
  assert.equal(below.poweredDown, true);
  assert.equal(below.reason, 'recharging');
  // 到门槛 → 复工
  const at = facilityPowerState({
    mana: threshold,
    capacity: config.manaCapacity,
    restartRatio: config.restartRatio,
    wasDown: true,
    drainPerSecond: config.drainPerSecond
  });
  assert.equal(at.poweredDown, false);
  assert.equal(at.drainPerSecond, config.drainPerSecond);
});

check('没有魔力容量的单位不受这套规则约束（非生存关的箭塔不能因此停机）', () => {
  const state = facilityPowerState({ mana: 0, capacity: 0, drainPerSecond: 5 });
  assert.equal(state.poweredDown, false);
  assert.equal(state.drainPerSecond, 0);
  assert.equal(state.reason, 'no_capacity');
});

check('数值越界会被夹住：魔力不会超过容量，也不会是负数', () => {
  const config = tower();
  const over = facilityPowerState({
    mana: config.manaCapacity * 10,
    capacity: config.manaCapacity,
    restartRatio: config.restartRatio
  });
  assert.equal(over.poweredDown, false);
  const negative = facilityPowerState({
    mana: -50,
    capacity: config.manaCapacity,
    restartRatio: config.restartRatio,
    wasDown: false
  });
  assert.equal(negative.poweredDown, true, '负魔力按 0 处理，也就是停机');
});

check('非法配置返回 null，不产生 NaN', () => {
  assert.equal(normalizeFacilityConfig(null), null);
  assert.equal(normalizeFacilityConfig({ id: 'x' }), null);
  assert.equal(normalizeFacilityConfig({ id: 'x', unitType: 'arrowTower', manaCapacity: 0 }), null);
  assert.equal(normalizeFacilityConfig({ id: 'x', unitType: 'arrowTower', drainPerSecond: -1, manaCapacity: 10 }), null);
  assert.equal(facilityConfigForUnitType(null), null);
});

check('供需不足时必然出现停机的可能：吃魔速度大于基地供给时迟早会耗尽', () => {
  // 这一条是数值上的把关，不是模拟：基地供给是有限的（POWER_RULES.baseSupplyPerSecond），
  // 如果单座设施的耗魔就已经超过总供给，那它永远撑不起来。
  //
  // 箭塔/弩炮/震荡塔是**按发扣魔**（manaPerShot），不是每秒持续 drain：
  // 塔只在真的开火时吃这一份。所以"必须真的耗魔"的判据是"两种扣费方式至少有一种为正"，
  // 而不是死盯 drainPerSecond —— 那一条是"每帧持续吃魔"时代的断言。
  const config = tower();
  const perSecond = Number(config.drainPerSecond) || 0;
  const perShot = Number(FACILITY_CONFIGS.arrowTower.manaPerShot) || 0;
  assert.ok(perSecond > 0 || perShot > 0, '设施必须真的耗魔（持续 drain 或每发扣魔）');
  assert.ok(
    config.manaCapacity >= Math.max(perSecond, perShot),
    '容量至少要让设施能撑过一次扣费，否则它一开工就掉线'
  );
  // 每发扣魔必须能在容量里出现有限次，不能是"一炮把池子打空"
  assert.ok(
    config.manaCapacity / Math.max(1, perShot) >= 4,
    '一座塔至少能连打 4 发，否则"有电"和"断电"之间没有可玩的区间'
  );
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
