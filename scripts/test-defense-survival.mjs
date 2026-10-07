// 防御终端：三定位 × 三级投资（纯规则回归测试）。
//
// 覆盖设计文档第一节里每一条能被断言的硬要求：
//   1. 三种塔的定位差异（射程 / 伤害 / 功率 / 范围脉冲）真的在数据里；
//   2. 三级倍率**相对一级**，不在二级上再乘一次；
//   3. 材料逐级、原子、不跳级、不重复付费；资格（科研站 + 对应路线）齐全才放行；
//   4. 升级完成**保留绝对值**（生命/耐久/活动魔力），新增容量不自动填满；
//   5. 回收以真实投入为基准，免费对象返不出没付过的资源。
import assert from 'node:assert/strict';
import {
  DEFENSE_TOWER_BASE_STATS,
  DEFENSE_TOWER_TIER_STATS,
  FACILITY_CONFIGS,
  RECIPES,
  UNIT_DEFINITIONS
} from '../src/data/gameData.js';
import {
  DEFENSE_TOWER_IDS,
  TIER3_ROUTE_BY_TOWER,
  TOWER_TIER_MAX,
  UPGRADE_ERROR,
  applyTierStats,
  canUpgradeTower,
  investedCostFor,
  isDefenseTowerUnitType,
  missingUpgradeInputs,
  towerIdentityFor,
  towerUnitTypeFor,
  upgradeCarryOver,
  upgradeCostFor
} from '../src/data/defenseTiers.js';
import {
  REPAIR_MATERIAL_BY_BUILDING,
  recycleRatioFor,
  recycleRefundFor,
  repairMaterialFor,
  repairImportanceFor
} from '../src/systems/buildingRepair.js';
import { SalvageSystem } from '../src/systems/SalvageSystem.js';

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

// ------------------------------------------------------------------ 定位差异
check('三种塔真的有三种定位：箭塔高频、弩炮远重、震荡塔短距范围脉冲', () => {
  const arrow = DEFENSE_TOWER_BASE_STATS.arrowTower;
  const ballista = DEFENSE_TOWER_BASE_STATS.ballista;
  const shock = DEFENSE_TOWER_BASE_STATS.shockTower;
  assert.ok(arrow.attackRate > ballista.attackRate * 2, '箭塔射速必须明显高于弩炮');
  assert.ok(ballista.damage > arrow.damage * 2, '弩炮单击必须明显重于箭塔');
  assert.ok(ballista.attackRange > arrow.attackRange, '弩炮射程要远于箭塔');
  assert.ok(ballista.attackRange > shock.attackRange, '震荡塔射程必须短于弩炮');
  assert.ok(shock.attackRange <= 10.5, '震荡塔是短中距离');
  // 范围脉冲必须在数据里，而且主目标之外有明确的次级系数
  const shockDef = UNIT_DEFINITIONS.shockTower;
  assert.ok(shockDef.attackSplash, '震荡塔必须有范围脉冲定义');
  assert.equal(shockDef.attackSplash.radius, 2.2, '脉冲半径起始值 2.2 米');
  assert.ok(shockDef.attackSplash.secondaryDamageMultiplier > 0);
  assert.ok(shockDef.attackSplash.secondaryDamageMultiplier < 1, '次级目标伤害必须低于主目标');
  assert.ok(shockDef.attackSplash.slowSeconds <= 0.7, '减速不超过 0.7 秒，不做持续锁死');
  assert.ok(shockDef.attackSplash.slowMaxRatio <= 0.25, '减速上限不超过 25%');
  for (const towerId of ['arrowTower', 'ballista']) {
    assert.equal(UNIT_DEFINITIONS[towerId].attackSplash, undefined, `${towerId} 不该有范围伤害`);
  }
});

check('震荡塔功率约为同级箭塔 1.8 倍，且二三级按同一张倍率表继续', () => {
  const arrow = DEFENSE_TOWER_TIER_STATS.arrowTower;
  const shock = DEFENSE_TOWER_TIER_STATS.shockTower;
  assert.equal(arrow.length, 3);
  assert.equal(shock.length, 3);
  for (let i = 0; i < 3; i += 1) {
    const ratio = shock[i].power / arrow[i].power;
    assert.ok(Math.abs(ratio - 1.8) < 0.02, `第 ${i + 1} 级功率比应为 1.8，实际 ${ratio.toFixed(3)}`);
  }
  // 功率必须随等级上升（1 / 1.2 / 1.45），否则"级别越高越吃燃料吞吐"就不成立
  assert.ok(arrow[1].power > arrow[0].power && arrow[2].power > arrow[1].power);
});

// ------------------------------------------------------------------ 等级倍率
check('三级倍率相对一级（生命 1.3/1.6、伤害 1.2/1.45、射程 +0.4/+0.8）', () => {
  DEFENSE_TOWER_IDS.forEach((towerId) => {
    const stats = DEFENSE_TOWER_TIER_STATS[towerId];
    assert.equal(stats.length, TOWER_TIER_MAX);
    const [t1, t2, t3] = stats;
    assert.equal(t1.tier, 1);
    assert.equal(t1.unitType, towerId, '一级的 unitType 不带后缀（与既有存档/布点兼容）');
    assert.equal(t2.unitType, `${towerId}II`);
    assert.equal(t3.unitType, `${towerId}III`);
    const base = DEFENSE_TOWER_BASE_STATS[towerId];
    assert.ok(Math.abs(t2.maxHealth - Math.round(base.maxHealth * 1.3)) <= 1, '二级生命 ≈ 一级 ×1.3');
    assert.ok(Math.abs(t3.maxHealth - Math.round(base.maxHealth * 1.6)) <= 1, '三级生命 ≈ 一级 ×1.6');
    assert.ok(Math.abs(t2.damage - Math.round(base.damage * 1.2 * 10) / 10) < 0.05);
    assert.ok(Math.abs(t3.damage - Math.round(base.damage * 1.45 * 10) / 10) < 0.05);
    assert.ok(Math.abs(t2.attackRange - (base.attackRange + 0.4)) < 0.001);
    assert.ok(Math.abs(t3.attackRange - (base.attackRange + 0.8)) < 0.001);
    // 三级不是在二级上再乘一次：1.6 ≠ 1.3 × 1.3
    assert.ok(Math.abs(t3.maxHealth - Math.round(t2.maxHealth * 1.3)) > 1, '三级不能是二级再乘一次');
  });
});

check('生成出来的定义与级别表一致（属性来源唯一，不靠运行时叠加）', () => {
  DEFENSE_TOWER_IDS.forEach((towerId) => {
    DEFENSE_TOWER_TIER_STATS[towerId].forEach((entry) => {
      const definition = UNIT_DEFINITIONS[entry.unitType];
      assert.ok(definition, `${entry.unitType} 必须有单位定义`);
      assert.equal(definition.maxHealth, entry.maxHealth);
      assert.equal(definition.damage, entry.damage);
      assert.equal(definition.attackRange, entry.attackRange);
      assert.equal(definition.defenseTowerId, towerId);
      assert.equal(definition.defenseTowerTier, entry.tier);
      // 词条解析：伤害字段被折成 physicalAttack / magicAttack，二者不可重复
      const primary = definition.attackDamageType === 'magic' ? definition.magicAttack : definition.physicalAttack;
      assert.equal(primary, entry.damage, `${entry.unitType} 的主伤害字段必须等于表里的伤害`);
      const facility = FACILITY_CONFIGS[entry.unitType];
      assert.ok(facility, `${entry.unitType} 必须有设施配置`);
      assert.equal(facility.manaCapacity, entry.manaCapacity);
      assert.equal(facility.towerId, towerId);
      assert.equal(facility.tier, entry.tier);
      if (entry.tier > 1) {
        assert.equal(RECIPES[entry.unitType], undefined, '二三级不各自做成一件可放置物品');
      }
    });
  });
  // 一级仍然各有一件可放置物品与配方
  for (const towerId of DEFENSE_TOWER_IDS) {
    assert.ok(RECIPES[towerId], `${towerId} 必须有合成配方`);
  }
});

// ------------------------------------------------------------------ 升级规则
check('不能跳级、不能同级、不能倒退', () => {
  assert.equal(
    canUpgradeTower({ unitType: 'arrowTower', targetTier: 3, hasResearch: true, routeCleared: true }).reason,
    UPGRADE_ERROR.wrongTier
  );
  assert.equal(
    canUpgradeTower({ unitType: 'arrowTowerII', targetTier: 2, hasResearch: true, routeCleared: true }).reason,
    UPGRADE_ERROR.wrongTier
  );
  assert.equal(
    canUpgradeTower({ unitType: 'arrowTowerIII', targetTier: 4, hasResearch: true, routeCleared: true }).reason,
    UPGRADE_ERROR.wrongTier
  );
  assert.equal(
    canUpgradeTower({ unitType: 'furnace', targetTier: 2, hasResearch: true, routeCleared: true }).reason,
    UPGRADE_ERROR.notTower
  );
});

check('二级要科研站；三级还要对应路线全线清除', () => {
  const t2 = canUpgradeTower({ unitType: 'arrowTower', targetTier: 2, hasResearch: false, routeCleared: false });
  assert.equal(t2.reason, UPGRADE_ERROR.missingResearch);
  const t2ok = canUpgradeTower({ unitType: 'arrowTower', targetTier: 2, hasResearch: true, routeCleared: false });
  assert.equal(t2ok.ok, true, '二级不看路线');
  const t3 = canUpgradeTower({ unitType: 'arrowTowerII', targetTier: 3, hasResearch: true, routeCleared: false });
  assert.equal(t3.reason, UPGRADE_ERROR.missingRoute);
  const t3ok = canUpgradeTower({ unitType: 'arrowTowerII', targetTier: 3, hasResearch: true, routeCleared: true });
  assert.equal(t3ok.ok, true);
  // 三种塔各自绑一条路线，不能互相顶替
  assert.equal(TIER3_ROUTE_BY_TOWER.arrowTower, 'east');
  assert.equal(TIER3_ROUTE_BY_TOWER.ballista, 'north');
  assert.equal(TIER3_ROUTE_BY_TOWER.shockTower, 'south');
});

check('施工中、已升级中、已被摧毁都拒绝', () => {
  assert.equal(
    canUpgradeTower({ unitType: 'arrowTower', targetTier: 2, hasResearch: true, underConstruction: true }).reason,
    UPGRADE_ERROR.underConstruction
  );
  assert.equal(
    canUpgradeTower({ unitType: 'arrowTower', targetTier: 2, hasResearch: true, upgrading: true }).reason,
    UPGRADE_ERROR.upgrading
  );
  assert.equal(
    canUpgradeTower({ unitType: 'arrowTower', targetTier: 2, hasResearch: true, alive: false }).reason,
    UPGRADE_ERROR.dead
  );
});

check('升级材料是四种真实资源、逐级递增，不要求魔核', () => {
  DEFENSE_TOWER_IDS.forEach((towerId) => {
    const c2 = upgradeCostFor(towerId, 2);
    const c3 = upgradeCostFor(towerId, 3);
    assert.ok(c2.length > 0 && c3.length > 0);
    const allowed = new Set(['wood', 'stone', 'iron', 'charcoal']);
    const items2 = new Set(c2.map((entry) => entry.itemId));
    const items3 = new Set(c3.map((entry) => entry.itemId));
    [...c2, ...c3].forEach((entry) => {
      assert.ok(allowed.has(entry.itemId), `${towerId} 用了不该用的材料 ${entry.itemId}`);
      assert.ok(entry.count > 0);
    });
    // 二级要开始吃铁矿与木炭（"需要稳定铁矿与木炭生产"的至少一半）
    assert.ok(items2.has('iron'), `${towerId} 二级必须开始吃铁矿`);
    // 三级成本严格高于二级（同种材料更多，或多了新材料）
    const total2 = c2.reduce((sum, entry) => sum + entry.count, 0);
    const total3 = c3.reduce((sum, entry) => sum + entry.count, 0);
    assert.ok(total3 > total2, `${towerId} 三级总材料必须多于二级`);
    assert.ok(items3.has('charcoal'), `${towerId} 三级必须有木炭（持续后勤）`);
  });
  assert.equal(upgradeCostFor('arrowTower', 1).length, 0, '一级没有升级成本');
  assert.equal(upgradeCostFor('arrowTower', 4).length, 0, '超过三级没有成本表');
});

check('缺料清单按材料逐项给出缺多少（界面能直接说清）', () => {
  const cost = upgradeCostFor('arrowTower', 2);
  const none = missingUpgradeInputs(cost, () => 0);
  assert.equal(none.length, cost.length);
  assert.ok(none.every((entry) => entry.missing === entry.need));
  const full = missingUpgradeInputs(cost, () => 999);
  assert.equal(full.length, 0);
  const partial = missingUpgradeInputs(cost, (itemId) => (itemId === 'iron' ? 1 : 999));
  assert.equal(partial.length, 1);
  assert.equal(partial[0].itemId, 'iron');
  assert.equal(partial[0].missing, cost.find((entry) => entry.itemId === 'iron').count - 1);
});

// ------------------------------------------------------------------ 完成时的绝对值
check('升级完成保留绝对值并夹到新上限（不回满、不白送容量）', () => {
  // 满血升到三级：血量按新上限夹住，但绝不"回满"到超过实际值
  const carried = upgradeCarryOver({
    health: 54, durability: 100, activityMana: 10,
    nextMaxHealth: 86, nextMaxDurability: 130, nextManaCapacity: 43.5
  });
  assert.equal(carried.health, 54, '升级不该把血补到新上限');
  assert.equal(carried.durability, 100);
  assert.equal(carried.activityMana, 10, '新增容量不会自动填满');
  // 残血升级后仍然残血
  const hurt = upgradeCarryOver({
    health: 20, durability: 30, activityMana: 5,
    nextMaxHealth: 70, nextMaxDurability: 120, nextManaCapacity: 36
  });
  assert.equal(hurt.health, 20);
  assert.equal(hurt.durability, 30);
  // 旧值高于新上限时夹住（一级血比二级上限高的情况）
  const capped = upgradeCarryOver({
    health: 999, durability: 999, activityMana: 999,
    nextMaxHealth: 70, nextMaxDurability: 120, nextManaCapacity: 36
  });
  assert.equal(capped.health, 70);
  assert.equal(capped.durability, 120);
  assert.equal(capped.activityMana, 36);
  // 负值/NaN 一律归零，不产生 NaN
  const bad = upgradeCarryOver({ health: -5, durability: NaN, activityMana: undefined, nextMaxHealth: 70 });
  assert.equal(bad.health, 0);
  assert.equal(bad.durability, 0);
  assert.equal(bad.activityMana, 0);
});

check('等级倍率函数是纯函数：同样入参永远同样结果', () => {
  const base = { maxHealth: 54, damage: 7, attackRange: 9.2, power: 3.6, manaCapacity: 30 };
  const a = applyTierStats(base, 2);
  const b = applyTierStats(base, 2);
  assert.deepEqual(a, b);
  assert.deepEqual(base, { maxHealth: 54, damage: 7, attackRange: 9.2, power: 3.6, manaCapacity: 30 }, '入参不能被改写');
  assert.deepEqual(applyTierStats(base, 1), {
    maxHealth: 54, damage: 7, attackRange: 9.2, power: 3.6, manaCapacity: 30
  });
});

// ------------------------------------------------------------------ 类型解析
check('类型 ↔ 等级双向解析唯一，一级 id 不带后缀', () => {
  assert.equal(towerUnitTypeFor('arrowTower', 1), 'arrowTower');
  assert.equal(towerUnitTypeFor('arrowTower', 2), 'arrowTowerII');
  assert.equal(towerUnitTypeFor('arrowTower', 3), 'arrowTowerIII');
  assert.equal(towerUnitTypeFor('arrowTower', 99), 'arrowTowerIII', '越界夹到三级');
  assert.equal(towerUnitTypeFor('furnace', 2), null, '不是防御终端就没有等级类型');
  assert.deepEqual(towerIdentityFor('ballistaII'), { towerId: 'ballista', tier: 2 });
  assert.deepEqual(towerIdentityFor('shockTower'), { towerId: 'shockTower', tier: 1 });
  assert.equal(towerIdentityFor('furnace'), null);
  assert.equal(isDefenseTowerUnitType('arrowTowerIII'), true);
  assert.equal(isDefenseTowerUnitType('canteen'), false);
  // 别名不得混淆：不能把别的类型前缀匹配进来
  assert.equal(towerIdentityFor('arrowTowerIIIExtra'), null);
  assert.deepEqual(towerIdentityFor('shockTowerII'), { towerId: 'shockTower', tier: 2 });
});

// ------------------------------------------------------------------ 回收
check('回收以真实投入为基准：免费对象返不出没付过的资源', () => {
  assert.deepEqual(recycleRefundFor({ unitType: 'arrowTower', healthRatio: 1, paidInvestment: [] }), []);
  const invested = investedCostFor('arrowTower', 1);
  const intact = recycleRefundFor({ unitType: 'arrowTower', healthRatio: 1, paidInvestment: invested });
  const wreck = recycleRefundFor({ unitType: 'arrowTower', healthRatio: 0.1, paidInvestment: invested });
  const sum = (list) => list.reduce((acc, entry) => acc + entry.count, 0);
  assert.ok(sum(intact) > 0, '完好建筑必须能回收');
  assert.ok(sum(wreck) >= 0);
  assert.ok(sum(intact) > sum(wreck), '完好回收必须多于残骸');
  // 比例：完好 60%、残骸 20%（整数向下取整）
  const wood = invested.find((entry) => entry.itemId === 'wood').count;
  assert.equal(
    intact.find((entry) => entry.itemId === 'wood').count,
    Math.floor(wood * 0.6)
  );
});

check('升级投入会计入实际投入总量（三级回收不凭等级猜）', () => {
  const t1 = investedCostFor('arrowTower', 1);
  const t2 = investedCostFor('arrowTower', 2);
  const t3 = investedCostFor('arrowTower', 3);
  const totalOf = (list) => list.reduce((acc, entry) => acc + entry.count, 0);
  assert.ok(totalOf(t2) > totalOf(t1), '二级的累计投入必须包含升级材料');
  assert.ok(totalOf(t3) > totalOf(t2), '三级的累计投入必须包含两级升级材料');
  const names2 = new Set(t2.map((entry) => entry.itemId));
  assert.ok(names2.has('iron'), '二级累计投入里必须出现铁矿');
  assert.deepEqual(investedCostFor('furnace', 3), [], '不是防御终端就没有投入基准');
});

check('回收比例随生命线性过渡，且无损毁时不会超过 60%', () => {
  assert.ok(Math.abs(recycleRatioFor(1) - 0.6) < 1e-9);
  assert.ok(Math.abs(recycleRatioFor(0) - 0.2) < 1e-9);
  const mid = recycleRatioFor(0.68);
  assert.ok(mid > 0.2 && mid < 0.6, '中间生命值应当落在 20%~60% 之间');
  assert.ok(recycleRatioFor(1.5) <= 0.6, '生命比例超界也不能超过 60%');
});

// ------------------------------------------------------------------ 维修材料口径
check('维修材料随建筑材质决定，重要度顺序与设计文档一致', () => {
  assert.equal(repairMaterialFor('arrowTower'), 'wood');
  assert.equal(repairMaterialFor('ballista'), 'iron');
  assert.equal(repairMaterialFor('shockTower'), 'stone');
  assert.equal(repairMaterialFor('canteen'), 'wood');
  assert.equal(repairMaterialFor('playerBase'), 'iron');
  assert.equal(repairMaterialFor('unknownBuilding'), 'wood', '未登记的建筑有默认材质，不返回 undefined');
  // 基地 > 魔力炉 > 防塔 > 食堂 > 普通生产
  assert.ok(repairImportanceFor('playerBase') < repairImportanceFor('manaFurnace'));
  assert.ok(repairImportanceFor('manaFurnace') < repairImportanceFor('arrowTower'));
  assert.ok(repairImportanceFor('arrowTower') < repairImportanceFor('canteen'));
  assert.ok(repairImportanceFor('canteen') <= repairImportanceFor('chest'));
  // 每个材质都必须是一件真实存在的物品
  Object.values(REPAIR_MATERIAL_BY_BUILDING).forEach((material) => {
    assert.ok(['wood', 'stone', 'iron'].includes(material), `不认识的维修材料 ${material}`);
  });
});

// ------------------------------------------------------------------ 回收运行时
// 纯规则在上面的 check 里已经证明；这里证明**运行时落地**：
// 结算一次、产物落地成掉落物（不是直接进库存）、免费/初始对象与基地被拒。
function makeRecycleGame({ base = null } = {}) {
  const spawned = [];
  const game = {
    playerBase: base,
    localPlayerSlot: 0,
    drops: {
      spawned,
      spawnFromStacks(stacks, options = {}) {
        // 与 GroundDropSystem 同一条语义：同 id 只落地一次
        const existing = spawned.find((entry) => entry.dropId === options.dropId);
        if (existing) return existing;
        const drop = { id: options.dropId ?? `drop-${spawned.length}`, stacks, x: options.x, z: options.z };
        spawned.push({ ...drop, dropId: drop.id });
        return drop;
      }
    },
    handleUnitDeath(unit) {
      if (unit.deathHandled) return false;
      unit.deathHandled = true;
      unit.alive = false;
      return true;
    },
    hints: { setHintOnce() {} }
  };
  return { game, spawned };
}

function makeRecyclableBuilding(overrides = {}) {
  return {
    id: 7,
    type: 'arrowTower',
    name: '箭塔',
    team: 'player',
    isBuilding: true,
    alive: true,
    health: 100,
    maxHealth: 100,
    position: { x: 3, z: 4 },
    controllerPlayerId: 0,
    paidInvestment: investedCostFor('arrowTower', 1),
    ...overrides
  };
}

check('运行时回收：主动拆除按真实投入返还、落地成掉落物、只结算一次', () => {
  const { game, spawned } = makeRecycleGame();
  const salvage = new SalvageSystem(game);
  const tower = makeRecyclableBuilding();
  const preview = salvage.recyclePreview(tower);
  assert.equal(preview.ok, true);
  assert.ok(Math.abs(preview.ratio - 0.6) < 1e-9, '满血拆除应返还 60%');

  const result = salvage.demolishBuilding(tower);
  assert.equal(result.ok, true);
  assert.equal(result.drop.id, 'recycle:7');
  assert.equal(spawned.length, 1, '只落地一堆掉落物');
  assert.equal(tower.alive, false, '拆除后建筑死亡');
  // 返还的是**实际投入**的 60%，按整数向下取整
  const investedWood = tower.paidInvestment.find((entry) => entry.itemId === 'wood').count;
  const refundedWood = result.refunded.find((entry) => entry.itemId === 'wood').count;
  assert.equal(refundedWood, Math.floor(investedWood * 0.6));
  // 掉落物上就是这批材料：没有第二份偷偷进库存的路径
  assert.deepEqual(result.drop.stacks, result.refunded);
  // 重复拆除（以及随后的死亡通知）不能再结算
  const again = salvage.demolishBuilding(tower);
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'not_building', '拆掉的建筑已经不在了，不能二次结算');
  assert.equal(spawned.length, 1, '不能落地第二堆');
  assert.equal(salvage.settleWreck(tower), null, '死亡回调也要被挡住');
  // 活着的、已经结算过的对象：走"已结算"这条闸
  const live = makeRecyclableBuilding({ id: 12 });
  const liveSettle = salvage.settleRecycle(live, 1);
  assert.equal(liveSettle.ok, true);
  const second = salvage.settleRecycle(live, 1);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'already_settled', '同一个对象最多结算一次');
  assert.equal(spawned.filter((entry) => entry.dropId === 'recycle:12').length, 1);
  assert.equal(salvage.recycleStats.settled, 2, '吞吐统计按真实结算次数记');
  assert.equal(salvage.recycleStats.materials, result.materials + liveSettle.materials);
});

check('运行时回收：残骸 20%、免费/初始对象与基地一律拒绝', () => {
  const { game, spawned } = makeRecycleGame();
  const salvage = new SalvageSystem(game);
  // 残骸：生命归零 → wreckRatio
  const wreck = makeRecyclableBuilding({ id: 8, health: 0 });
  const settled = salvage.settleWreck(wreck);
  assert.equal(settled.ok, true);
  assert.ok(Math.abs(settled.ratio - 0.2) < 1e-9, '残骸比例 20%');
  assert.equal(spawned.length, 1);
  const investedWood = wreck.paidInvestment.find((entry) => entry.itemId === 'wood').count;
  assert.equal(
    settled.refunded.find((entry) => entry.itemId === 'wood').count,
    Math.floor(investedWood * 0.2)
  );

  // 免费/奖励/初始对象：没有 paidInvestment → 不产出无本资源
  const free = makeRecyclableBuilding({ id: 9, paidInvestment: [] });
  const refusedFree = salvage.settleRecycle(free, 1);
  assert.equal(refusedFree.ok, false);
  assert.equal(refusedFree.reason, 'no_paid_investment');
  assert.deepEqual(refusedFree.refunded, []);
  assert.equal(spawned.length, 1, '免费对象不落地任何东西');
  assert.equal(free.recycleSettled, undefined, '被拒的请求不该被打上已结算标记');

  // 基地：即使付过费用也不许拆（不能靠拆基地绕过败局规则）
  const base = makeRecyclableBuilding({ id: 10, type: 'playerBase', isPlayerBase: true });
  game.playerBase = base;
  const refusedBase = salvage.demolishBuilding(base);
  assert.equal(refusedBase.ok, false);
  assert.equal(refusedBase.reason, 'protected_structure');
  assert.equal(spawned.length, 1);

  // 敌方建筑同样不行
  const enemy = makeRecyclableBuilding({ id: 11, team: 'enemy' });
  assert.equal(salvage.canRecycle(enemy).reason, 'not_player');
  // 重置清掉回收吞吐与场上的回收物标记
  salvage.reset();
  assert.equal(salvage.recycleStats.settled, 0);
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
