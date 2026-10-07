// 远征与区域成长：纯规则回归测试。
//
// 守住四件最容易写错的事：
//   1. 四条路线绑的必须是**真实点位与真实科技**（内巢/外巢 id 存在、tech.requiresNestId
//      就是那座内巢），敌名/掉落/图纸名都从数据现读而不是抄一份；
//   2. 路线阶段由点位真实 `cleared` 推导：内巢未清 → 外巢可进攻 → 全线清除，
//      清完后不能再给出"目标坐标 0,0"这种假点位；
//   3. 区域图纸是**真门槛**：拿不到权威来源时锁着（不能白送四项能力），
//      老科技（没有 requiresNestId）行为完全不变；
//   4. 目标句：追踪说清这一趟的真实收益，入夜/临夜走防线口径，
//      没有专用武器时先说装备（且**不能**说斧镐不能还手）。
import assert from 'node:assert/strict';
import {
  EXPEDITION_STATE,
  allExpeditionBriefs,
  allExpeditions,
  craftablePuppetWeapons,
  expeditionBrief,
  expeditionByInnerNest,
  expeditionObjectiveText,
  expeditionStage,
  isDefensePriority,
  loadoutDescriptorFor,
  loadoutReadiness,
  lootSummary,
  nativeWeaponDamage,
  pointMapOf,
  raidForecast,
  recruitLines,
  resolveTrackedExpedition,
  routeClearedNotice,
  trackedObjectiveText
} from '../src/systems/expedition.js';
import {
  RESEARCH_ERROR,
  allTechs,
  applyProductionPatch,
  canResearch,
  harvestPerActionBonus,
  normalizeTech,
  productionPatchFor,
  techById,
  unitTechModifiersFor
} from '../src/systems/research.js';
import { normalizeSpawnPoints } from '../src/systems/spawnPoints.js';
import { survivalObjectiveText } from '../src/systems/fieldCamps.js';
import { islandOuterSpawnPoints } from '../src/systems/survivalExpansion.js';
import {
  ISLAND_SPAWN_POINTS,
  ITEM_DEFINITIONS,
  PRODUCTION_RECIPES,
  RECIPES,
  SURVIVAL_EXPEDITIONS,
  TECH_DEFINITIONS,
  UNIT_DEFINITIONS
} from '../src/data/gameData.js';

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

const allPoints = normalizeSpawnPoints([...ISLAND_SPAWN_POINTS, ...islandOuterSpawnPoints()]);
const baseMap = () => pointMapOf(allPoints.map((point) => ({ ...point })));
const counts = (table) => (itemId) => table[itemId] ?? 0;
const NEW_TECH_IDS = ['towerCalibration', 'woodlandLogistics', 'armsMaintenance', 'charcoalBellows'];

check('四条路线的内巢/外巢/科技必须真实存在且互相对应', () => {
  const routes = allExpeditions();
  assert.equal(routes.length, 4, '应当正好四条远征路线');
  const ids = new Set(allPoints.map((point) => point.id));
  routes.forEach((route) => {
    assert.ok(ids.has(route.innerNestId), `${route.id} 的内巢 ${route.innerNestId} 必须是真实点位`);
    assert.ok(ids.has(route.outerNestId), `${route.id} 的外巢 ${route.outerNestId} 必须是真实点位`);
    const tech = TECH_DEFINITIONS[route.techId];
    assert.ok(tech, `${route.id} 的区域图纸科技 ${route.techId} 必须存在`);
    assert.equal(tech.requiresNestId, route.innerNestId, '科技的图纸门槛必须就是这条线的内巢');
    assert.ok(route.strategy.includes('图纸'), '策略句必须说清"先拿图纸再研究"，不能宣称拆掉即得效果');
    assert.equal(expeditionByInnerNest(route.innerNestId)?.id, route.id, '内巢→路线反查要一致');
  });
  // 外巢必须真的挂在那座内巢上（gateNestId），否则"外巢可进攻"没有封印语义
  routes.forEach((route) => {
    const outer = allPoints.find((point) => point.id === route.outerNestId);
    assert.equal(outer?.gateNestId, route.innerNestId, `${route.outerNestId} 应当由 ${route.innerNestId} 封印`);
  });
});

check('四条路线对应四种敌型，不是四段相同的流程', () => {
  const poolOf = (id) => (allPoints.find((point) => point.id === id)?.enemyPool ?? []).map((entry) => entry.type);
  assert.ok(poolOf('island-camp-north').includes('spider'), '北线内巢应当有蜘蛛');
  assert.ok(poolOf('island-west-ridge').includes('wolf'), '西线内巢应当有野狼');
  assert.ok(poolOf('island-east-cape').includes('shieldBearer'), '东线内巢应当有盾卫');
  assert.ok(poolOf('island-south-woods').includes('ogre'), '南线内巢应当有食人魔');
  const outerPools = allExpeditions().map((route) => poolOf(route.outerNestId).join(','));
  assert.equal(new Set(outerPools).size, 4, '四条外圈巢穴的敌群不该完全一样');
});

check('新增四项科技的消耗与效果形状正确（图纸门槛 + 统一 effects 入口）', () => {
  const expected = {
    towerCalibration: { cost: [['wood', 18], ['iron', 8], ['stone', 16]], nest: 'island-camp-north' },
    woodlandLogistics: { cost: [['wood', 24], ['fiber', 16], ['stone', 12]], nest: 'island-west-ridge' },
    armsMaintenance: { cost: [['iron', 12], ['charcoal', 8], ['fiber', 16]], nest: 'island-east-cape' },
    charcoalBellows: { cost: [['stone', 20], ['iron', 12], ['charcoal', 12]], nest: 'island-south-woods' }
  };
  NEW_TECH_IDS.forEach((id) => {
    const tech = techById(id);
    assert.ok(tech, `${id} 必须有定义`);
    assert.equal(tech.requiresNestId, expected[id].nest);
    assert.deepEqual(
      tech.cost.map((entry) => [entry.itemId, entry.count]),
      expected[id].cost,
      `${id} 的消耗必须与设计一致`
    );
    tech.cost.forEach((entry) => {
      assert.ok(ITEM_DEFINITIONS[entry.itemId], `成本 ${entry.itemId} 必须有物品定义`);
    });
  });
  assert.ok(techById('towerCalibration').effects.attributes.length === 1);
  assert.equal(techById('woodlandLogistics').effects.harvest.perActionBonus, 1);
  assert.ok(techById('armsMaintenance').effects.attributes.length === 1);
  assert.equal(techById('armsMaintenance').effects.attributes[0].percent, -0.2);
  assert.equal(techById('charcoalBellows').effects.production[0].patch.seconds, 6);
});

check('normalizeTech 显式保留图纸门槛与 attributes 效果（白名单漏登记等于静默失效）', () => {
  const normalized = normalizeTech(TECH_DEFINITIONS.towerCalibration);
  assert.equal(normalized.requiresNestId, 'island-camp-north');
  assert.deepEqual(normalized.effects.attributes[0].unitTypes, ['arrowTower', 'ballista']);
  assert.equal(normalized.effects.attributes[0].stat, 'attackRange');
  // 写坏的修正要被丢掉，而不是在运行时造出 NaN
  const broken = normalizeTech({
    id: 'broken',
    cost: [],
    effects: { attributes: [{ stat: 'attackRange', type: 'add' }, { type: 'add', amount: 1 }, null] }
  });
  assert.equal(broken.effects.attributes.length, 0);
  // 没有 requiresNestId 的老科技保持 null
  assert.equal(normalizeTech(TECH_DEFINITIONS.enchanting).requiresNestId, null);
});

check('区域图纸是真门槛：没有权威来源 / 内巢未清都锁着，且老科技不受影响', () => {
  const rich = counts({ wood: 999, iron: 999, stone: 999, fiber: 999, charcoal: 999 });
  // 完全没有 nestCleared（没有点位权威）→ 锁着，不能白送
  const noAuthority = canResearch('towerCalibration', {
    researched: new Set(),
    countOf: rich,
    stationReady: true
  });
  assert.equal(noAuthority.ok, false);
  assert.equal(noAuthority.reason, RESEARCH_ERROR.missingBlueprint);
  assert.equal(noAuthority.requiresNestId, 'island-camp-north');
  // 有权威但巢没拆 → 锁着
  const locked = canResearch('towerCalibration', {
    researched: new Set(),
    countOf: rich,
    stationReady: true,
    nestCleared: () => false
  });
  assert.equal(locked.reason, RESEARCH_ERROR.missingBlueprint);
  // 巢拆了 → 放行（科研站与材料都齐）
  const open = canResearch('towerCalibration', {
    researched: new Set(),
    countOf: rich,
    stationReady: true,
    nestCleared: (nestId) => nestId === 'island-camp-north'
  });
  assert.equal(open.ok, true);
  // 老科技不看图纸：同一个 context 下照常
  assert.equal(canResearch('enchanting', {
    researched: new Set(),
    countOf: counts({ stone: 40, iron: 12, deepCore: 1 }),
    stationReady: true
  }).ok, true);
  // 没有科研站仍然先报"需要科研站"
  assert.equal(canResearch('towerCalibration', {
    researched: new Set(), countOf: rich, stationReady: false, nestCleared: () => true
  }).reason, RESEARCH_ERROR.noStation);
});

check('炭窑鼓风把烧炭周期压到 6 秒，与高效烧炭的产量升级叠加', () => {
  const base = PRODUCTION_RECIPES.furnace;
  assert.equal(base.seconds, 8);
  assert.equal(productionPatchFor('furnace', new Set()), null);
  const bellow = applyProductionPatch(base, productionPatchFor('furnace', new Set(['charcoalBellows'])));
  assert.equal(bellow.seconds, 6);
  assert.equal(bellow.output.count, base.output.count, '周期改动不该动产量');
  assert.equal(bellow.input.count, base.input.count, '投入不变');
  const both = applyProductionPatch(base, productionPatchFor('furnace', new Set(['charcoalBellows', 'efficientFuel'])));
  assert.equal(both.seconds, 6, '两项科技必须同时生效');
  assert.equal(both.output.count, 3);
  // 纯函数：共享配方表不能被就地改
  assert.equal(base.seconds, 8);
  assert.equal(base.output.count, 2);
});

check('林地采运 +1 与采集效率 +2 叠加成 8，其它科技不影响采集', () => {
  assert.equal(harvestPerActionBonus(new Set()), 0);
  assert.equal(harvestPerActionBonus(new Set(['woodlandLogistics'])), 1);
  assert.equal(harvestPerActionBonus(new Set(['harvesting'])), 2);
  assert.equal(harvestPerActionBonus(new Set(['harvesting', 'woodlandLogistics'])), 3);
  assert.equal(5 + harvestPerActionBonus(new Set(['harvesting', 'woodlandLogistics'])), 8);
  assert.equal(harvestPerActionBonus(new Set(['towerCalibration'])), 0);
});

check('单位属性修正的作用域：只给己方、只给该类型、建筑吃不到耐久折扣', () => {
  const tower = unitTechModifiersFor(
    { team: 'player', type: 'arrowTower', canMove: false, isBuilding: true, hasWeapon: true },
    new Set(['towerCalibration'])
  );
  assert.equal(tower.length, 1);
  assert.equal(tower[0].stat, 'attackRange');
  assert.equal(tower[0].amount, 1.5);
  // 弩炮同样吃，其它建筑吃不到
  assert.equal(unitTechModifiersFor(
    { team: 'player', type: 'ballista', isBuilding: true, canMove: false }, new Set(['towerCalibration'])
  ).length, 1);
  assert.equal(unitTechModifiersFor(
    { team: 'player', type: 'furnace', isBuilding: true, canMove: false }, new Set(['towerCalibration'])
  ).length, 0);
  // 敌方不享受玩家科技
  assert.equal(unitTechModifiersFor(
    { team: 'enemy', type: 'arrowTower', isBuilding: true }, new Set(['towerCalibration'])
  ).length, 0);
  // 军械保养：只给己方移动战斗单位
  const raider = unitTechModifiersFor(
    { team: 'player', type: 'raider', canMove: true, isBuilding: false, hasWeapon: true },
    new Set(['armsMaintenance'])
  );
  assert.equal(raider.length, 1);
  assert.equal(raider[0].stat, 'durabilityCost');
  assert.equal(raider[0].type, 'multiply');
  assert.equal(raider[0].percent, -0.2);
  assert.equal(unitTechModifiersFor(
    { team: 'player', type: 'woodPuppet', canMove: true, isBuilding: false, hasWeapon: true },
    new Set(['armsMaintenance'])
  ).length, 1, '傀儡也是移动战斗单位');
  assert.equal(unitTechModifiersFor(
    { team: 'player', type: 'arrowTower', canMove: false, isBuilding: true, hasWeapon: true },
    new Set(['armsMaintenance'])
  ).length, 0, '建筑不该吃耐久折扣');
  assert.equal(unitTechModifiersFor(
    { team: 'enemy', type: 'raider', canMove: true, isBuilding: false, hasWeapon: true },
    new Set(['armsMaintenance'])
  ).length, 0);
  // 中立（既不是 player 也不是 enemy 的口径）同样拿不到玩家科技
  ['neutral', 'npc', 'alliance'].forEach((team) => {
    assert.equal(unitTechModifiersFor(
      { team, type: 'arrowTower', canMove: false, isBuilding: true, hasWeapon: true },
      new Set(['towerCalibration'])
    ).length, 0, `${team} 不该拿到哨站测距`);
    assert.equal(unitTechModifiersFor(
      { team, type: 'raider', canMove: true, isBuilding: false, hasWeapon: true },
      new Set(['armsMaintenance'])
    ).length, 0, `${team} 不该拿到军械保养`);
  });
  // 不适用建筑（不是箭塔/弩炮）也拿不到，即使它是己方建筑
  assert.equal(unitTechModifiersFor(
    { team: 'player', type: 'researchStation', canMove: false, isBuilding: true, hasWeapon: false },
    new Set(['towerCalibration'])
  ).length, 0);
  assert.equal(unitTechModifiersFor(
    { team: 'player', type: 'woodPuppet', canMove: true, isBuilding: false, hasWeapon: false },
    new Set(['armsMaintenance'])
  ).length, 0, '没有武器的单位不拿耐久折扣（weaponOnly）');
  assert.equal(unitTechModifiersFor(
    { team: 'player', type: 'raider', canMove: true }, new Set()
  ).length, 0, '没研究就没有修正');
});

check('路线阶段由点位真实 cleared 推导：内巢 → 外巢 → 全线清除', () => {
  const route = allExpeditions().find((entry) => entry.id === 'west');
  const map = baseMap();
  const inner = map.get('island-west-ridge');
  const outer = map.get('island-outer-northwest');
  let stage = expeditionStage(route, map);
  assert.equal(stage.state, EXPEDITION_STATE.inner);
  assert.equal(stage.targetPointId, route.innerNestId);
  assert.equal(stage.gateOpen, false);
  inner.cleared = true;
  stage = expeditionStage(route, map);
  assert.equal(stage.state, EXPEDITION_STATE.outer);
  assert.equal(stage.targetPointId, route.outerNestId);
  assert.equal(stage.gateOpen, true, '内巢清掉后外巢解除封印');
  outer.cleared = true;
  stage = expeditionStage(route, map);
  assert.equal(stage.state, EXPEDITION_STATE.cleared);
  assert.equal(stage.targetPointId, null);
  assert.equal(stage.target, null);
});

check('展示数据全部来自目标点位的真实事实（敌名/掉落数量/傀儡/待招募）', () => {
  const map = baseMap();
  const north = expeditionBrief(allExpeditions().find((entry) => entry.id === 'north'), { pointsById: map });
  const inner = map.get('island-camp-north');
  assert.equal(north.targetName, inner.name);
  assert.deepEqual(
    north.enemies.map((enemy) => [enemy.type, enemy.weight]),
    inner.enemyPool.map((entry) => [entry.type, entry.weight])
  );
  north.enemies.forEach((enemy) => {
    assert.equal(enemy.name, UNIT_DEFINITIONS[enemy.type]?.name, '敌名必须读 UNIT_DEFINITIONS');
  });
  assert.deepEqual(
    north.drops.map((drop) => [drop.itemId, drop.count]),
    inner.drops.map((entry) => [entry.itemId, entry.count])
  );
  north.drops.forEach((drop) => {
    assert.equal(drop.name, ITEM_DEFINITIONS[drop.itemId]?.name);
  });
  assert.equal(north.worker.type, inner.workerReward.type);
  assert.equal(north.blueprint.name, TECH_DEFINITIONS.towerCalibration.name);
  assert.equal(north.blueprint.ready, false, '内巢没清时图纸不该是"已到手"');
  // 内巢清掉 → 目标换成外巢，数据也跟着换
  inner.cleared = true;
  const northOuter = expeditionBrief(allExpeditions().find((entry) => entry.id === 'north'), { pointsById: map });
  assert.equal(northOuter.targetName, map.get('island-outer-north').name);
  assert.equal(northOuter.blueprint.ready, true);
  assert.deepEqual(
    northOuter.enemies.map((enemy) => enemy.type),
    map.get('island-outer-north').enemyPool.map((entry) => entry.type)
  );
});

check('待招募按真实循环分配口径聚合（含 count > types 的情况）', () => {
  const south = allPoints.find((point) => point.id === 'island-south-woods');
  const lines = recruitLines(south);
  assert.deepEqual(
    lines.map((line) => [line.type, line.count]),
    [['raider', 1], ['archer', 1]],
    '两种各一支时就是 1+1'
  );
  const cyclic = recruitLines({
    recruitReward: { types: ['raider', 'archer'], count: 3 }
  });
  assert.deepEqual(cyclic.map((line) => [line.type, line.count]), [['raider', 2], ['archer', 1]]);
  const unknown = recruitLines({ recruitReward: { types: ['nope'], count: 2 } });
  assert.deepEqual(unknown, [], '没有定义的类型不能凭空冒出来');
  assert.deepEqual(recruitLines({}), []);
});

check('整线清完后不再给出假坐标（查看位置必须没有可去的地方）', () => {
  const map = baseMap();
  map.get('island-east-cape').cleared = true;
  map.get('island-outer-east').cleared = true;
  const brief = expeditionBrief(allExpeditions().find((entry) => entry.id === 'east'), { pointsById: map });
  assert.equal(brief.stage, EXPEDITION_STATE.cleared);
  assert.equal(brief.targetPointId, null);
  assert.equal(brief.targetX, null);
  assert.equal(brief.targetZ, null);
  assert.equal(Number.isFinite(brief.targetX), false, '面板据此禁用"查看位置"');
  const notice = routeClearedNotice(brief);
  assert.match(notice, /不再出新兵/);
  assert.match(notice, /军械保养/);
});

check('追踪解析：目标随内巢清除自动换外巢，清完整线才报完成并给出下一条', () => {
  const map = baseMap();
  let briefs = allExpeditionBriefs({ pointsById: map });
  let resolved = resolveTrackedExpedition(briefs, 'west');
  assert.equal(resolved.tracked.targetName, map.get('island-west-ridge').name);
  assert.equal(resolved.completed, false);
  assert.equal(resolved.next, null, '没清完不该给"下一条"');
  map.get('island-west-ridge').cleared = true;
  briefs = allExpeditionBriefs({ pointsById: map });
  resolved = resolveTrackedExpedition(briefs, 'west');
  assert.equal(resolved.tracked.targetName, map.get('island-outer-northwest').name, '自动换到外巢');
  assert.equal(resolved.tracked.stage, EXPEDITION_STATE.outer);
  map.get('island-outer-northwest').cleared = true;
  briefs = allExpeditionBriefs({ pointsById: map });
  resolved = resolveTrackedExpedition(briefs, 'west');
  assert.equal(resolved.completed, true);
  assert.ok(resolved.next, '整线清完要给下一条未完成路线');
  assert.notEqual(resolved.next.id, 'west');
  // 追踪 id 只保存 id：未知 id 不炸，也不假装追踪
  assert.deepEqual(resolveTrackedExpedition(briefs, 'nope'), { tracked: null, completed: false, next: null });
  assert.deepEqual(resolveTrackedExpedition(briefs, null), { tracked: null, completed: false, next: null });
});

check('追踪目标句：内巢阶段说图纸，外巢阶段说真实战利品并停止出兵', () => {
  const map = baseMap();
  const south = () => allExpeditionBriefs({ pointsById: map }).find((brief) => brief.id === 'south');
  const innerText = trackedObjectiveText({ tracked: south(), completed: false, next: null });
  assert.match(innerText, /南林深处/);
  assert.match(innerText, /区域图纸「炭窑鼓风」/);
  assert.match(innerText, /科研站/);
  map.get('island-south-woods').cleared = true;
  const outerText = trackedObjectiveText({ tracked: south(), completed: false, next: null });
  assert.match(outerText, /西南巨巢/);
  assert.match(outerText, /深邃核心×2/, '外巢阶段要说这个点真实会掉什么');
  assert.match(outerText, /可招募/);
  assert.match(outerText, /停止出兵/);
  // 已经研究过图纸之后不该再让玩家"去研究"
  const researchedText = trackedObjectiveText({
    tracked: {
      ...south(),
      blueprint: { ...south().blueprint, researched: true }
    },
    completed: false,
    next: null
  });
  assert.equal(/去科研站研究/.test(researchedText), false);
  map.get('island-outer-southwest').cleared = true;
  const doneText = trackedObjectiveText({
    tracked: south(),
    completed: true,
    next: allExpeditionBriefs({ pointsById: map }).find((brief) => brief.id === 'north')
  });
  assert.match(doneText, /全线清除/);
  assert.match(doneText, /下一条可追/);
});

check('战利品摘要与点位数据一致', () => {
  const map = baseMap();
  const brief = allExpeditionBriefs({ pointsById: map }).find((entry) => entry.id === 'north');
  const text = lootSummary(brief);
  assert.match(text, /深邃核心×1/);
  assert.match(text, /木傀儡×1/);
  assert.match(text, /可招募 蛮兵×1/);
  assert.equal(lootSummary({ drops: [], worker: null, recruits: [] }), '清掉这里的敌人');
});

check('装备判断：开局唯一木傀儡要提示装备，天生带武器的战斗单位不算"没有武器"', () => {
  const puppet = () => loadoutDescriptorFor(
    { type: 'woodPuppet', isWorker: true, definition: UNIT_DEFINITIONS.woodPuppet },
    { toolIds: ['axe', 'pickaxe'] }
  );
  const opening = loadoutReadiness([puppet()]);
  assert.equal(opening.needsWeapon, true);
  assert.equal(opening.toolOnlyCount, 1);
  assert.equal(opening.canFightBack, true, '斧镐能自保');
  // 真实招募来的兵种（不是测试注入的正伤害）：有部队就不该再喊缺武器
  const realTroops = allPoints
    .flatMap((point) => recruitLines(point).map((line) => line.type))
    .filter((type, index, list) => list.indexOf(type) === index)
    .map((type) => loadoutDescriptorFor({ type }));
  assert.ok(realTroops.length >= 4, '岛上应当有多种可招募兵种');
  const withTroops = loadoutReadiness([puppet(), ...realTroops]);
  assert.equal(withTroops.needsWeapon, false, '有真实招募的部队就不该再喊缺武器');
  assert.equal(withTroops.nativeArmedCount, realTroops.length);
  assert.ok(withTroops.nativeArmedNames.includes(UNIT_DEFINITIONS.archer.name), '弓兵必须被算成有武器');
  // 真实傀儡武器：装上就不再提示
  assert.equal(loadoutReadiness([
    loadoutDescriptorFor({ type: 'woodPuppet', isWorker: true, weaponItemId: 'puppetCudgel' })
  ]).needsWeapon, false);
  assert.equal(loadoutReadiness([]).needsWeapon, false);
  // 建筑不算移动单位
  const withBuilding = loadoutReadiness([loadoutDescriptorFor({ type: 'arrowTower', isBuilding: true })]);
  assert.equal(withBuilding.mobileCount, 0);
  assert.equal(withBuilding.needsWeapon, false);
});

check('自带武器的判定必须读真实伤害字段（weapon.damage 会漏掉全部战斗兵种）', () => {
  const combatTypes = ['raider', 'archer', 'spearman', 'swordsman', 'towerShield', 'shieldBearer']
    .filter((type) => UNIT_DEFINITIONS[type]);
  assert.ok(combatTypes.length >= 5);
  // 旧写法：只读 definition.weapon.damage。它能把这些兵种全部误判成"没有武器"，
  // 所以这条断言不是在描述实现细节，而是在钉住被修掉的那个真实缺陷。
  const weaponDamageOnly = (definition) => Math.max(0, Number(definition?.weapon?.damage) || 0);
  const misjudged = combatTypes.filter((type) => weaponDamageOnly(UNIT_DEFINITIONS[type]) <= 0);
  assert.ok(misjudged.length >= 3, '旧写法应当至少误判三种自带武器的兵种');
  combatTypes.forEach((type) => {
    assert.ok(
      nativeWeaponDamage(UNIT_DEFINITIONS[type]) > 0,
      `${type}（${UNIT_DEFINITIONS[type].name}）自带武器，伤害必须 > 0`
    );
  });
  // 空手傀儡 / 缺定义都必须算出 0，否则"没有武器要逃跑"的前提就没了
  assert.equal(nativeWeaponDamage(UNIT_DEFINITIONS.woodPuppet), 0);
  assert.equal(nativeWeaponDamage(null), 0);
  assert.equal(nativeWeaponDamage(undefined), 0);
  // 映射器本身：类型引用也能现读定义，工具实例由调用方补
  const descriptor = loadoutDescriptorFor({ type: 'archer' }, { toolIds: ['axe'] });
  assert.equal(descriptor.nativeWeaponDamage, nativeWeaponDamage(UNIT_DEFINITIONS.archer));
  assert.deepEqual(descriptor.toolIds, ['axe']);
  assert.equal(descriptor.canMove, true);
  assert.equal(descriptor.isBuilding, false);
  const building = loadoutDescriptorFor({ type: 'arrowTower' });
  assert.equal(building.canMove, false);
  assert.equal(building.isBuilding, true);
});

check('目标句优先级：追踪 > 入夜/临夜防线 > 白天装备 > 既有提示', () => {
  const map = baseMap();
  const briefs = allExpeditionBriefs({ pointsById: map });
  const tracked = resolveTrackedExpedition(briefs, 'east');
  const base = {
    isNight: false,
    secondsRemaining: 240,
    camps: [],
    clearedIds: new Set(),
    nests: [{ id: 'island-camp-north', name: '北岬巢穴', x: -13, z: 65, cleared: false }],
    hasDefenseTower: true,
    hasFurnace: true,
    hasManaFurnace: true,
    manaFurnaceFueled: true,
    loadout: loadoutReadiness([{ isWorker: true, canMove: true, toolIds: ['axe'], nativeWeaponDamage: 0 }])
  };
  const trackedText = expeditionObjectiveText({ ...base, tracked, fallback: base });
  assert.match(trackedText, /追踪东岬线/);
  assert.match(trackedText, /离入夜还有 4:00/);
  // 入夜前 60 秒：走真实防线口径，不催着去推进。
  // 还没有防御塔（hasDefenseTower:false）→ 说"先造防御塔"，说清建在供能范围内。
  const dusk = expeditionObjectiveText({
    ...base,
    secondsRemaining: 45,
    hasDefenseTower: false,
    tracked: { tracked: null, completed: false, next: null },
    fallback: { ...base, secondsRemaining: 45, hasDefenseTower: false }
  });
  assert.match(dusk, /先造防御塔/);
  assert.match(dusk, /供能范围/);
  assert.doesNotMatch(dusk, /还没有箭塔/, '预设塔位的旧文案必须消失');
  assert.equal(/傀儡木棒/.test(dusk), false, '临夜不该先去造武器');
  // 白天且没有专用武器：先说装备（不催着去单挑营地）
  const day = expeditionObjectiveText({ ...base, tracked: { tracked: null, completed: false, next: null }, fallback: base });
  assert.match(day, /傀儡木棒/);
  assert.match(day, /木材×12/);
  assert.match(day, /斧镐能自保/, '文案不能说斧镐不能还手');
  assert.equal(/去清掉/.test(day), false, '没有武器时不该直接催去清营地');
  // 有专用武器 → 回到既有营地提示
  const armed = expeditionObjectiveText({
    ...base,
    camps: [{ id: 'west-wolves', name: '西坡狼窝', brief: '西坡有两只狼。' }],
    loadout: loadoutReadiness([{ isWorker: true, canMove: true, weaponItemId: 'puppetCudgel', toolIds: [], nativeWeaponDamage: 0 }]),
    tracked: { tracked: null, completed: false, next: null },
    fallback: { ...base, camps: [{ id: 'west-wolves', name: '西坡狼窝', brief: '西坡有两只狼。' }] }
  });
  assert.match(armed, /西坡有两只狼/);
});

check('入夜优先档的判定边界：入夜 / ≤60 秒 / 否则', () => {
  assert.equal(isDefensePriority({ isNight: true, secondsRemaining: 300 }), true);
  assert.equal(isDefensePriority({ isNight: false, secondsRemaining: 60 }), true);
  assert.equal(isDefensePriority({ isNight: false, secondsRemaining: 61 }), false);
  assert.equal(isDefensePriority({ isNight: false }), false);
});

check('防线文案不再把"拆内巢"说成整个方向安全', () => {
  const nests = [
    { id: 'island-camp-north', name: '北岬巢穴', x: -13, z: 65, cleared: false, gateNestId: null },
    { id: 'island-outer-north', name: '北岬盾巢', x: -14, z: 86, cleared: false, gateNestId: 'island-camp-north' }
  ];
  const inner = survivalObjectiveText({
    isNight: false,
    secondsRemaining: 120,
    hasFurnace: true,
    hasManaFurnace: true,
    manaFurnaceFueled: true,
    hasDefenseTower: true,
    nests
  });
  assert.match(inner, /北岬巢穴/);
  assert.match(inner, /外圈巢穴会解除封印开始出兵/);
  // 没有外圈的点保持原来的说法
  const plain = survivalObjectiveText({
    isNight: false,
    secondsRemaining: 120,
    hasFurnace: true,
    hasManaFurnace: true,
    manaFurnaceFueled: true,
    hasDefenseTower: true,
    nests: [{ id: 'island-outer-north', name: '北岬盾巢', x: -14, z: 86, cleared: false, gateNestId: null }]
  });
  assert.match(plain, /拆掉这条线就不再出兵/);
});

check('夜袭预报：数量与 gateNestId 真实状态吻合，区分正在生效与下一夜', () => {
  const map = baseMap();
  const points = [...map.values()];
  const routes = allExpeditions();
  const day = raidForecast({ points, routes, dayNumber: 3, isNight: false, aliveByPoint: {} });
  assert.equal(day.counts.total, 8);
  assert.equal(day.counts.threatening, 4, '四座内巢没有封印');
  assert.equal(day.counts.sealed, 4, '四座外巢被各自内巢封印');
  assert.equal(day.counts.cleared, 0);
  assert.equal(day.nextNightNumber, 3, '白天时下一夜就是当天编号');
  assert.equal(day.currentNightNumber, null);
  assert.equal(day.currentNightRaid, null);
  assert.equal(day.activeRoutes.length, 4);
  assert.equal(day.safeRoutes.length, 0);
  // 内巢拆掉 → 外巢从"封印"变成"正在威胁"，并开始出现在活动路线里
  map.get('island-camp-north').cleared = true;
  const afterInner = raidForecast({ points: [...map.values()], routes, dayNumber: 3, isNight: false });
  assert.equal(afterInner.counts.cleared, 1);
  assert.equal(afterInner.counts.sealed, 3);
  assert.equal(afterInner.counts.threatening, 4, '外巢解除封印后照样威胁基地');
  assert.ok(afterInner.threatening.some((point) => point.id === 'island-outer-north'));
  // 整条线清掉：不再有新来源，残兵照实报
  map.get('island-outer-north').cleared = true;
  const cleared = raidForecast({
    points: [...map.values()], routes, dayNumber: 3, isNight: false, aliveByPoint: { 'island-camp-north': 2 }
  });
  assert.equal(cleared.counts.cleared, 2);
  assert.equal(cleared.residual, 2, '残兵不会凭空消失');
  assert.deepEqual(cleared.safeRoutes.map((route) => route.id), ['north']);
  assert.equal(cleared.hasOpenSource, true, '还有别的点在出兵');
  // 夜里：当前这一夜与下一夜的强度都要给
  const night = raidForecast({ points, routes, dayNumber: 4, isNight: true });
  assert.equal(night.currentNightNumber, 4);
  assert.equal(night.nextNightNumber, 5);
  assert.ok(night.nextNightRaid.difficulty > night.currentNightRaid.difficulty);
});

check('可合成傀儡武器的材料来自真实配方', () => {
  const weapons = craftablePuppetWeapons();
  assert.equal(weapons[0].recipeId, 'puppetCudgel');
  assert.deepEqual(
    weapons[0].inputs.map((entry) => [entry.itemId, entry.count]),
    RECIPES.puppetCudgel.inputs.map((entry) => [entry.itemId, entry.count])
  );
  assert.equal(weapons[0].outputName, ITEM_DEFINITIONS.puppetCudgel.name);
});

check('数据表自检：所有新增科技仍在 allTechs() 里，且效果指向真实配方', () => {
  const techs = allTechs().map((tech) => tech.id);
  NEW_TECH_IDS.forEach((id) => assert.ok(techs.includes(id), `${id} 必须在 allTechs()`));
  assert.equal(SURVIVAL_EXPEDITIONS.length, 4);
  allExpeditions().forEach((route) => {
    assert.ok(route.name && route.direction, '路线必须有名字与方向');
  });
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
if (process.exitCode) process.exit(process.exitCode);
