// 手动工作台 / 箱子 / 框选采集：都是任务，走同一条优先级队列。
import assert from 'node:assert/strict';
import { Inventory } from '../src/systems/Inventory.js';
import { StationSystem } from '../src/systems/StationSystem.js';
import { addToWorkerCargo } from '../src/systems/workerInventory.js';
import { RECIPES } from '../src/data/gameData.js';
import {
  CRAFT_IDLE_PRIORITY,
  CRAFT_READY_PRIORITY,
  STORE_PRIORITY,
  chestAcceptsItem,
  compareWorkTasks,
  gatherTaskPriority,
  resolveStorePriority,
  stationCraftPriority
} from '../src/systems/workTasks.js';

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

check('资源面板的优先级折进任务队列：数字越大越先做', () => {
  assert.equal(gatherTaskPriority(5), 1);
  assert.equal(gatherTaskPriority(3), 3);
  assert.equal(gatherTaskPriority(1), 5);
  assert.equal(gatherTaskPriority(0), null);
  assert.equal(gatherTaskPriority(-1), null);
});

check('工作台凑齐木斧材料时合成优先级是 5，不够时是 12', () => {
  const ready = new Inventory({ id: 'bench', capacity: 6 });
  ready.add('wood', 5);
  ready.add('stone', 5);
  assert.equal(stationCraftPriority(ready, [RECIPES.axe]), CRAFT_READY_PRIORITY);
  const short = new Inventory({ id: 'bench-short', capacity: 6 });
  short.add('wood', 5);
  assert.equal(stationCraftPriority(short, [RECIPES.axe]), CRAFT_IDLE_PRIORITY);
});

check('箱子白名单只收名单里的，黑名单不收名单里的', () => {
  const allow = { mode: 'whitelist', itemIds: ['wood'] };
  assert.equal(chestAcceptsItem(allow, 'wood'), true);
  assert.equal(chestAcceptsItem(allow, 'stone'), false);
  assert.equal(chestAcceptsItem({ mode: 'whitelist', itemIds: [] }, 'wood'), false);
  const deny = { mode: 'blacklist', itemIds: ['wood'] };
  assert.equal(chestAcceptsItem(deny, 'wood'), false);
  assert.equal(chestAcceptsItem(deny, 'stone'), true);
  assert.equal(chestAcceptsItem({ mode: 'blacklist', itemIds: [] }, 'stone'), true);
});

check('合成 5 排在存放 6 前面，做不了的 12 排最后', () => {
  const tasks = [
    { id: 'c', kind: 'store', priority: STORE_PRIORITY },
    { id: 'a', kind: 'craft', priority: CRAFT_IDLE_PRIORITY },
    { id: 'b', kind: 'craft', priority: CRAFT_READY_PRIORITY }
  ].sort(compareWorkTasks);
  assert.deepEqual(tasks.map((task) => task.id), ['b', 'c', 'a']);
});

function fakeGame() {
  const nodes = new Map();
  return {
    resourcePriorities: { wood: 3 },
    resourceNodes: {
      nodeById(id) { return nodes.get(id) ?? null; },
      remember(node) { nodes.set(node.id, node); }
    },
    baseInventory: new Inventory({ id: 'base', capacity: 48 }),
    craftCatalog: () => [RECIPES.axe],
    work: { demands: [], pokeAssign() {} },
    backpack: null,
    stationPanel: null
  };
}

check('每次框选各是一条采集任务，不会并成一条', () => {
  const game = fakeGame();
  const stations = new StationSystem(game);
  game.resourceNodes.remember({ id: 'tree-a', amount: 4, resource: 'wood' });
  game.resourceNodes.remember({ id: 'tree-b', amount: 4, resource: 'wood' });
  const first = stations.addGatherTask([{ id: 'tree-a', amount: 4, resource: 'wood' }]);
  const second = stations.addGatherTask([{ id: 'tree-b', amount: 4, resource: 'wood' }]);
  assert.notEqual(first.id, second.id);
  assert.equal(first.priority, 3);
  assert.equal(stations.gatherTasks.length, 2);
});

check('工作台能做时派出优先级 5 的合成任务，不够时任务不可执行', () => {
  const game = fakeGame();
  const stations = new StationSystem(game);
  const unit = { id: 'bench-1', type: 'manualWorkbench', alive: true, underConstruction: false };
  const station = stations.registerBuilding(unit);
  station.inventory.add('wood', 2);
  let craft = stations.openErrands().find((errand) => errand.kind === 'craft');
  assert.equal(craft.priority, CRAFT_IDLE_PRIORITY);
  assert.equal(craft.actionable, false);
  station.inventory.add('wood', 3);
  station.inventory.add('stone', 5);
  craft = stations.openErrands().find((errand) => errand.kind === 'craft');
  assert.equal(craft.priority, CRAFT_READY_PRIORITY);
  assert.equal(craft.actionable, true);
  const made = stations.performCraft(station);
  assert.equal(made.ok, true);
  assert.equal(station.inventory.countOf('axe'), 1);
  assert.equal(station.craftPriority, CRAFT_IDLE_PRIORITY);
});

check('箱子按白名单生成存放任务，从傀儡背包搬进箱', () => {
  const game = fakeGame();
  const stations = new StationSystem(game);
  const unit = { id: 'chest-1', type: 'chest', alive: true, underConstruction: false };
  const station = stations.registerBuilding(unit);
  stations.setFilterMode(station, 'whitelist');
  stations.addFilterItem(station, 'wood');
  const worker = {
    id: 'puppet-1',
    type: 'puppet',
    alive: true,
    isWorker: true,
    underConstruction: false
  };
  game.work = {
    records: new Map([
      ['puppet-1', { unitId: 'puppet-1', inventory: new Inventory({ id: 'worker:puppet-1', capacity: 16 }) }]
    ]),
    pokeAssign() {}
  };
  const pack = game.work.records.get('puppet-1').inventory;
  pack.add('axe', 1);
  addToWorkerCargo(pack, 'wood', 4);
  addToWorkerCargo(pack, 'stone', 2);
  station.inventory.add('stone', 1);
  const errands = stations.openErrands();
  const store = errands.find((errand) => errand.kind === 'store');
  assert.ok(store);
  assert.equal(store.priority, STORE_PRIORITY);
  assert.equal(stations.storeOffer(station, pack).itemId, 'wood');
  assert.notEqual(stations.storeOffer(station, pack)?.itemId, 'stone');
  assert.equal(errands.some((e) => e.kind === 'retrieve'), false);
});

check('存放任务优先级可在站点上调节', () => {
  const game = fakeGame();
  const stations = new StationSystem(game);
  const station = stations.registerBuilding({ id: 'chest-2', type: 'chest', alive: true, underConstruction: false });
  game.work = {
    records: new Map([
      ['puppet-1', { unitId: 'puppet-1', inventory: new Inventory({ id: 'worker:puppet-1', capacity: 16 }) }]
    ]),
    pokeAssign() {}
  };
  game.work.records.get('puppet-1').inventory;
  addToWorkerCargo(game.work.records.get('puppet-1').inventory, 'wood', 3);
  assert.equal(resolveStorePriority(station), STORE_PRIORITY);
  stations.setStorePriority(station, 2);
  assert.equal(resolveStorePriority(station), STORE_PRIORITY + 2);
  const store = stations.openErrands().find((e) => e.kind === 'store' && e.stationId === station.id);
  assert.equal(store?.priority, STORE_PRIORITY + 2);
});

check('基地默认黑名单为空时接受任意种类；切白名单后只收名单内', () => {
  const game = fakeGame();
  const stations = new StationSystem(game);
  const baseStation = stations.playerBaseStation();
  assert.equal(baseStation.filter.mode, 'blacklist');
  assert.equal(chestAcceptsItem(baseStation.filter, 'wood'), true);
  stations.setFilterMode(baseStation, 'whitelist');
  stations.addFilterItem(baseStation, 'wood');
  const worker = {
    id: 'puppet-1',
    type: 'puppet',
    alive: true,
    isWorker: true,
    underConstruction: false
  };
  game.work = {
    records: new Map([
      ['puppet-1', { unitId: 'puppet-1', inventory: new Inventory({ id: 'worker:puppet-1', capacity: 16 }) }]
    ]),
    pokeAssign() {}
  };
  const pack = game.work.records.get('puppet-1').inventory;
  addToWorkerCargo(pack, 'wood', 6);
  addToWorkerCargo(pack, 'stone', 3);
  const errands = stations.openErrands();
  const store = errands.find((errand) => errand.stationId === baseStation.id && errand.kind === 'store');
  assert.ok(store);
  const offer = stations.storeOffer(baseStation, pack);
  assert.equal(offer.itemId, 'wood');
  assert.equal(chestAcceptsItem(baseStation.filter, 'stone'), false);
});

console.log(report.join('\n'));
if (process.exitCode) {
  console.error('work tasks failed');
} else {
  console.log(`\n${report.length} checks passed`);
}
