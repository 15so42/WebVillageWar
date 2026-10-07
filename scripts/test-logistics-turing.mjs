// 流水线寄存器机与外圈规划。不启动浏览器、不创建 Game。
import assert from 'node:assert/strict';
import { Inventory } from '../src/systems/Inventory.js';
import { craftRecipe } from '../src/systems/crafting.js';
import { workerHarvestSeconds } from '../src/systems/workOrders.js';
import { canEnchant } from '../src/systems/research.js';
import {
  gateIsActive,
  linkAllowedByGate,
  refreshLogicGates
} from '../src/systems/logisticsStations.js';
import { ITEM_DEFINITIONS, RECIPES, TEAMS, UNIT_DEFINITIONS, resourceNodeHarvestSeconds } from '../src/data/gameData.js';
import {
  additionProgram,
  runRegisterMachine
} from '../src/systems/logisticsComputer.js';
import { planOuterRing, islandContains, islandOuterSpawnPoints, islandOuterIronZones } from '../src/systems/survivalExpansion.js';
// 命名空间整块导入：用来断言"箭塔吸附/防守位枚举"这套 API 真的不存在了，
// 而不是只断言调用点没被引用（那样删掉函数体也能过）。
import * as survivalExpansion from '../src/systems/survivalExpansion.js';
import { normalizeSpawnPoint } from '../src/systems/spawnPoints.js';
import { ISLAND_SPAWN_POINTS } from '../src/data/gameData.js';
import { StationSystem } from '../src/systems/StationSystem.js';
import { TransportSystem } from '../src/systems/TransportSystem.js';
import { WorkSystem } from '../src/systems/WorkSystem.js';
import { SpawnPointSystem } from '../src/systems/SpawnPointSystem.js';

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

check('两寄存器加法会停机且结果正确', () => {
  const program = additionProgram();
  const result = runRegisterMachine(program, { r0: 4, r1: 3 }, { maxSteps: 40 });
  assert.equal(result.halted, true);
  assert.equal(result.exhausted, false);
  assert.equal(result.registers.r0, 7);
  assert.equal(result.registers.r1, 0);
  assert.ok(result.steps < 40);
});

check('加数为 0 时不改被加数', () => {
  const result = runRegisterMachine(additionProgram(), { r0: 5, r1: 0 });
  assert.equal(result.halted, true);
  assert.equal(result.registers.r0, 5);
  assert.equal(result.registers.r1, 0);
});

function chest(id, items = {}) {
  const inventory = new Inventory({ id, capacity: 8 });
  Object.entries(items).forEach(([itemId, count]) => inventory.add(itemId, count));
  return { id, kind: 'chest', inventory };
}

check('与门认不同物品，缺一路就不通', () => {
  const woodBox = chest('wood-box', { wood: 2 });
  const stoneBox = chest('stone-box');
  const gate = {
    id: 'and',
    kind: 'andGate',
    op: 'and',
    inputs: [
      { stationId: 'wood-box', itemId: 'wood' },
      { stationId: 'stone-box', itemId: 'stone' }
    ]
  };
  const stations = new Map([
    ['wood-box', woodBox],
    ['stone-box', stoneBox],
    ['and', gate]
  ]);
  refreshLogicGates(stations);
  assert.equal(gate.active, false);
  assert.equal(linkAllowedByGate({ gateStationId: 'and', gateBranch: 'then' }, stations), false);
  stoneBox.inventory.add('stone', 1);
  refreshLogicGates(stations);
  assert.equal(gate.active, true);
  assert.equal(linkAllowedByGate({ gateStationId: 'and', gateBranch: 'then' }, stations), true);
  assert.equal(linkAllowedByGate({ gateStationId: 'and', gateBranch: 'else' }, stations), false);
  woodBox.inventory.remove('wood', 2);
  woodBox.inventory.add('iron', 3);
  refreshLogicGates(stations);
  assert.equal(gate.active, false, '与门看的是木头，铁矿不能顶替');
});

check('或门有一路有货就通，非门在箱子空着时通', () => {
  const left = chest('left', { wood: 1 });
  const right = chest('right');
  const or = { id: 'or', kind: 'orGate', op: 'or', inputs: [{ stationId: 'left' }, { stationId: 'right' }] };
  const empty = chest('empty');
  const not = { id: 'not', kind: 'notGate', op: 'not', inputs: [{ stationId: 'empty' }] };
  const stations = new Map([
    ['left', left],
    ['right', right],
    ['or', or],
    ['empty', empty],
    ['not', not]
  ]);
  refreshLogicGates(stations);
  assert.equal(or.active, true);
  assert.equal(not.active, true);
  left.inventory.remove('wood', 1);
  empty.inventory.add('stone', 1);
  refreshLogicGates(stations);
  assert.equal(or.active, false);
  assert.equal(not.active, false);
  assert.equal(gateIsActive({ kind: 'andGate', op: 'and', inputs: [] }, stations), false);
});

check('不指定种类时，任何物品都算有货', () => {
  const box = chest('any', { fiber: 1 });
  const gate = { id: 'or-any', kind: 'orGate', op: 'or', inputs: [{ stationId: 'any', itemId: null }] };
  const stations = new Map([['any', box], ['or-any', gate]]);
  refreshLogicGates(stations);
  assert.equal(gate.active, true);
  const filtered = { kind: 'andGate', op: 'and', inputs: [{ stationId: 'any', itemId: 'iron' }] };
  assert.equal(gateIsActive(filtered, stations), false);
});

check('或门把一件货放进保持箱后，清掉置位仍然为通', () => {
  const set = chest('set', { wood: 1 });
  const hold = chest('hold');
  const gate = {
    id: 'latch',
    kind: 'orGate',
    op: 'or',
    inputs: [{ stationId: 'set' }, { stationId: 'hold' }]
  };
  const stations = new Map([['set', set], ['hold', hold], ['latch', gate]]);
  refreshLogicGates(stations);
  assert.equal(linkAllowedByGate({ gateStationId: 'latch', gateBranch: 'then' }, stations), true);
  set.inventory.remove('wood', 1);
  hold.inventory.add('wood', 1);
  refreshLogicGates(stations);
  assert.equal(gate.active, true, '保持箱里还有木头，或门不能掉下去');
  hold.inventory.remove('wood', 1);
  refreshLogicGates(stations);
  assert.equal(gate.active, false);
  assert.equal(linkAllowedByGate({ fromStationId: 'a' }, stations), true);
});

check('外圈比出生点更远，富铁矿出的是铁矿', () => {
  const ring = planOuterRing({ radius: 96, nests: 4, crystals: 6, ringIndex: 1 });
  assert.equal(ring.spawnPoints.length, 4);
  assert.equal(ring.resourceNodes.length, 6);
  const ids = new Set();
  ring.spawnPoints.forEach((point) => {
    assert.equal(ids.has(point.id), false);
    ids.add(point.id);
    const distance = Math.hypot(point.x, point.z);
    assert.ok(distance > 80, `nest too close: ${distance}`);
    assert.deepEqual(Object.keys(point.raidRally).sort(), ['x', 'z']);
    assert.ok(islandContains(point.raidRally.x, point.raidRally.z));
    assert.ok(point.drops.some((drop) => drop.itemId === 'iron'));
    assert.ok(point.drops.some((drop) => drop.itemId === 'deepCore'));
    assert.equal(point.drops.some((drop) => drop.itemId === 'logicToken'), false);
  });
  ring.resourceNodes.forEach((node) => {
    assert.equal(node.definitionId, 'richIron');
    assert.equal(node.resource, 'iron');
  });
});

check('与门、或门、非门都能用木头和石头合成', () => {
  for (const id of ['andGate', 'orGate', 'notGate']) {
    assert.equal(ITEM_DEFINITIONS[id]?.placeable.unitType, id);
    const bag = new Inventory({ id: `craft-${id}`, capacity: 8 });
    bag.add('stone', 8);
    bag.add('wood', 4);
    const made = craftRecipe(bag, RECIPES[id]);
    assert.equal(made.ok, true, id);
    assert.equal(bag.countOf(id), 1);
  }
});

check('力量附魔吃魔石，铁傀儡采集更快', () => {
  const blocked = canEnchant('fire', {
    countOf: (itemId) => (itemId === 'iron' ? 40 : itemId === 'charcoal' ? 16 : 0),
    tableReady: true
  });
  assert.equal(blocked.ok, false);
  const open = canEnchant('fire', {
    countOf: (itemId) => (itemId === 'iron' ? 40 : itemId === 'charcoal' ? 32 : 0),
    tableReady: true
  });
  assert.equal(open.ok, true);
  const power = canEnchant('power', {
    countOf: (itemId) => (itemId === 'magicStone' ? 8 : itemId === 'iron' ? 40 : itemId === 'charcoal' ? 24 : 0),
    tableReady: true
  });
  assert.equal(power.ok, true);

  const nodeSeconds = resourceNodeHarvestSeconds('richIron');
  const wood = workerHarvestSeconds(nodeSeconds, { definition: UNIT_DEFINITIONS.woodPuppet });
  const iron = workerHarvestSeconds(nodeSeconds, { definition: UNIT_DEFINITIONS.ironPuppet });
  assert.ok(iron < wood);
  assert.ok(UNIT_DEFINITIONS.ironPuppet.speed > UNIT_DEFINITIONS.woodPuppet.speed);
  assert.equal(RECIPES.ironPuppet.output.itemId, 'ironPuppetKit');
});

check('外圈巢穴和富铁矿落在岛上，且不贴着内圈', () => {
  const outer = islandOuterSpawnPoints();
  const innerIds = new Set(ISLAND_SPAWN_POINTS.map((point) => point.id));
  assert.equal(outer.length, 4);
  outer.forEach((point) => {
    assert.equal(innerIds.has(point.id), false);
    assert.equal(islandContains(point.x, point.z), true, point.id);
    assert.equal(islandContains(point.raidRally.x, point.raidRally.z), true, `${point.id} rally`);
    assert.deepEqual(Object.keys(point.raidRally).sort(), ['x', 'z'], point.id);
    const nearest = Math.min(...ISLAND_SPAWN_POINTS.map((inner) => (
      Math.hypot(inner.x - point.x, inner.z - point.z)
    )));
    assert.ok(nearest > 18, `${point.id} overlaps an inner nest (${nearest})`);
  });
  islandOuterIronZones().forEach((zone) => {
    assert.equal(zone.node, 'richIron');
    assert.equal(islandContains(zone.x, zone.z), true, zone.node);
    assert.ok(zone.count >= 3);
  });
});

check('与门可以绑到运输线上', () => {
  const stations = new StationSystem(null);
  stations.registerBuilding({ id: 'gate-1', type: 'andGate', alive: true });
  stations.registerBuilding({ id: 'chest-1', type: 'chest', alive: true });
  const configured = stations.configureLogicStation('gate-1', {
    toggleInput: { stationId: 'chest-1', itemId: null }
  });
  assert.equal(configured.ok, true);
  assert.equal(configured.station.op, 'and');
  assert.equal(configured.station.inputs[0].stationId, 'chest-1');
  const again = stations.configureLogicStation('gate-1', {
    toggleInput: { stationId: 'chest-1', itemId: null }
  });
  assert.equal(again.station.inputs.length, 0);
  stations.configureLogicStation('gate-1', { toggleInput: { stationId: 'chest-1', itemId: 'wood' } });
  const transport = new TransportSystem({ stations });
  transport.links.push({
    id: 'link:test',
    fromStationId: 'chest-1',
    toStationId: 'chest-1',
    filter: { mode: 'blacklist', itemIds: [] }
  });
  const bound = transport.setLinkGate('link:test', { gateStationId: 'gate-1', gateBranch: 'else' });
  assert.equal(bound.ok, true);
  assert.equal(bound.link.gateBranch, 'else');
  const rejected = transport.setLinkGate('link:test', { gateStationId: 'chest-1' });
  assert.equal(rejected.ok, false);
  assert.equal(transport.setLinkGate('link:test', { gateStationId: null }).link.gateStationId, null);
});

check('与门不通时不搬货，两路都有货才把木头送进信号箱', () => {
  const woodBox = chest('wood', { wood: 1 });
  const stoneBox = chest('stone');
  const supply = chest('supply', { wood: 1 });
  const signal = chest('signal');
  const and = {
    id: 'nand-and',
    kind: 'andGate',
    op: 'and',
    inputs: [
      { stationId: 'wood', itemId: 'wood' },
      { stationId: 'stone', itemId: 'stone' }
    ]
  };
  const not = { id: 'nand-not', kind: 'notGate', op: 'not', inputs: [{ stationId: 'signal' }] };
  const stations = new Map([
    ['wood', woodBox],
    ['stone', stoneBox],
    ['supply', supply],
    ['signal', signal],
    ['nand-and', and],
    ['nand-not', not]
  ]);
  refreshLogicGates(stations);
  assert.equal(linkAllowedByGate({ gateStationId: 'nand-and', gateBranch: 'then' }, stations), false);
  assert.equal(signal.inventory.countOf('wood'), 0);
  assert.equal(not.active, true);
  stoneBox.inventory.add('stone', 1);
  refreshLogicGates(stations);
  assert.equal(linkAllowedByGate({ gateStationId: 'nand-and', gateBranch: 'then' }, stations), true);
  supply.inventory.remove('wood', 1);
  signal.inventory.add('wood', 1);
  refreshLogicGates(stations);
  assert.equal(not.active, false, '与门送出货物后，非门应关掉');
});

check('防御塔自由选址：夜袭锚点只是敌军内部路线，不再吸附/占位', () => {
  const points = islandOuterSpawnPoints().map((point) => normalizeSpawnPoint(point, 0));
  points.forEach((point) => {
    assert.ok(point.raidRally, `${point.id} 缺少夜袭路线锚点`);
    assert.equal(islandContains(point.raidRally.x, point.raidRally.z), true, point.id);
    // 锚点只有坐标：没有"该建什么"，也没有"建成了没有"。
    assert.deepEqual(Object.keys(point.raidRally).sort(), ['x', 'z'], point.id);
  });
  // 吸附 API 与整块语义一起删除；它们存在就意味着玩家会被拽回预设塔位。
  assert.equal(survivalExpansion.nearestDefenseSite, undefined, '箭塔吸附必须彻底删除');
  assert.equal(survivalExpansion.defenseSitesFromPoints, undefined, '防守位枚举必须彻底删除');
  assert.equal(survivalExpansion.DEFENSE_SNAP_RADIUS, undefined, '吸附半径必须彻底删除');
});

check('只拆掉内圈不算通关，外圈也要拆完', () => {
  const game = { enemyUnits: [] };
  const spawns = new SpawnPointSystem(game);
  spawns.attach([...ISLAND_SPAWN_POINTS, ...islandOuterSpawnPoints()]);
  assert.equal(spawns.points.length, ISLAND_SPAWN_POINTS.length + islandOuterSpawnPoints().length);
  spawns.points.forEach((point) => {
    if (String(point.id).startsWith('island-outer-')) return;
    point.cleared = true;
  });
  assert.equal(spawns.checkVictory(), false);
  spawns.points.forEach((point) => { point.cleared = true; });
  const survivor = { alive: true, spawnPointId: spawns.points[0].id, isSpawnPointNest: false };
  game.enemyUnits.push(survivor);
  assert.equal(spawns.checkVictory(), false, '点位清完但还有残余敌人时不能通关');
  survivor.alive = false;
  assert.equal(spawns.checkVictory(), true);
});

check('木傀儡和铁傀儡采集时遇敌会停手，采集进度不往前走', () => {
  ['woodPuppet', 'ironPuppet'].forEach((unitType) => {
    const enemy = {
      id: `wolf-${unitType}`,
      type: 'wolf',
      alive: true,
      team: TEAMS.ENEMY,
      position: { x: 1, y: 0, z: 0 },
      definition: { attackRange: 2, collisionRadius: 0.4 }
    };
    const game = {
      elapsedTime: 12,
      enemyUnits: [enemy],
      playerBase: { position: { x: 20, y: 0, z: 0 } },
      threat: {
        threatsNear: () => [{ unit: enemy, distance: 1 }]
      }
    };
    const work = new WorkSystem(game);
    const puppet = {
      id: unitType,
      type: unitType,
      alive: true,
      team: TEAMS.PLAYER,
      definition: UNIT_DEFINITIONS[unitType],
      position: { x: 0, y: 0, z: 0 },
      workerCombatMode: 'fight',
      activityMana: 100,
      weapon: { durability: 30, maxDurability: 30, name: '斧' },
      attributes: { setBase() {}, get: () => 0 }
    };
    const record = work.registerWorker(puppet);
    record.inventory.add('pickaxe', 1);
    record.task = {
      nodeId: 'rich-1',
      node: { id: 'rich-1', definitionId: 'richIron', amount: 28, x: 6, z: 0, resource: 'iron' }
    };
    record.progress = 0.4;
    const owned = work.updateWorker(puppet, 0.2);
    assert.equal(owned, false, `${unitType} 交战帧应把身体交回战斗`);
    assert.equal(record.progress, 0.4);
    assert.equal(record.dangerAction, 'engage');
    assert.equal(record.task?.nodeId, 'rich-1');
  });
});

console.log(report.join('\n'));
if (process.exitCode) process.exit(process.exitCode);
