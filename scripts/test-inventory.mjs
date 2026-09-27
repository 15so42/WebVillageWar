// 物品与库存回归测试。
// 重点是守恒与原子性，而不是 UI 是否存在：
//   - 装不下必须整笔失败或明确返回余量，绝不静默吞物品
//   - 取出不够时必须整笔失败，不能出现「扣了一半材料但东西没做出来」
//   - 跨容器转移不能出现「两边都没有」的瞬间丢件
//   - 实例类物品不合并，转移的是同一件（instanceId 不变）
//   - 库存装不下时，资源节点上的量不能被扣掉
import assert from 'node:assert/strict';
import { ITEM_DEFINITIONS, RESOURCE_TYPES } from '../src/data/gameData.js';
import { itemStackLimit, resourceItemId } from '../src/systems/items.js';
import { INVENTORY_ERROR, Inventory } from '../src/systems/Inventory.js';
import { RESOURCE_ERROR, ResourceNodeSystem } from '../src/systems/ResourceNodeSystem.js';

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

function makeNode(definitionId, id, x = 0, z = 0, amount = null) {
  const base = { oak: 45, stonePile: 40, berryBush: 14 }[definitionId] ?? 20;
  return {
    id,
    definitionId,
    resource: { oak: 'wood', stonePile: 'stone', berryBush: 'food' }[definitionId] ?? 'wood',
    x,
    z,
    y: 0,
    amount: amount ?? base,
    maxAmount: amount ?? base,
    navRadius: 1,
    object: { visible: true }
  };
}

function makeWorld(nodes) {
  return {
    resourceNodes: nodes,
    released: [],
    releaseResourceNode(id) {
      this.released.push(id);
      const node = nodes.find((entry) => entry.id === id);
      if (node?.object) node.object.visible = false;
      return true;
    }
  };
}

check('每种资源都有同名物品，堆叠上限一致', () => {
  Object.keys(RESOURCE_TYPES).forEach((resourceId) => {
    const itemId = resourceItemId(resourceId);
    assert.ok(itemId, `${resourceId} 没有对应物品`);
    assert.equal(ITEM_DEFINITIONS[itemId].kind, 'stack', `${itemId} 应当是堆叠类物品`);
    assert.ok(itemStackLimit(itemId) > 0);
  });
});

check('未知物品与非法数量被拒绝', () => {
  const inventory = new Inventory({ capacity: 2 });
  assert.equal(inventory.add('unobtainium', 1).error, INVENTORY_ERROR.unknownItem);
  assert.equal(inventory.add('wood', 0).error, INVENTORY_ERROR.invalidCount);
  assert.equal(inventory.add('wood', -5).error, INVENTORY_ERROR.invalidCount);
  assert.equal(inventory.totalCount(), 0);
});

check('堆叠按上限合并，不够时开新格', () => {
  const inventory = new Inventory({ capacity: 3 });
  assert.equal(inventory.add('wood', 450).added, 450);
  assert.equal(inventory.countOf('wood'), 450);
  assert.equal(inventory.usedSlots(), 3, '450 木材应当占满 200+200+50 三格');
  // 第三格还有 150 的空隙，此时应当能继续塞进去
  assert.equal(inventory.add('wood', 150).added, 150);
  assert.equal(inventory.countOf('wood'), 600);
  assert.equal(inventory.add('wood', 1).error, INVENTORY_ERROR.noSpace);
  assert.equal(inventory.countOf('wood'), 600);
});

check('默认整笔失败，allowPartial 才返回余量，任何情况都不静默丢件', () => {
  const strict = new Inventory({ capacity: 2 });
  const rejected = strict.add('wood', 500);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, INVENTORY_ERROR.noSpace);
  assert.equal(strict.totalCount(), 0, '整笔失败时不能留下半批货');

  const loose = new Inventory({ capacity: 2 });
  const partial = loose.add('wood', 500, { allowPartial: true });
  assert.equal(partial.ok, true);
  assert.equal(partial.added, 400);
  assert.equal(partial.remainder, 100, '装不下的部分必须报出来');
  assert.equal(loose.totalCount(), 400);
});

check('取出不够时整笔失败，不会扣掉一部分', () => {
  const inventory = new Inventory({ capacity: 2 });
  inventory.add('wood', 60);
  const failed = inventory.remove('wood', 100);
  assert.equal(failed.ok, false);
  assert.equal(failed.error, INVENTORY_ERROR.notEnough);
  assert.equal(inventory.countOf('wood'), 60, '失败后数量必须原样');
  assert.equal(inventory.remove('wood', 60).ok, true);
  assert.equal(inventory.countOf('wood'), 0);
  assert.equal(inventory.usedSlots(), 0, '取空的格子必须回收');
});

check('实例类物品不合并，各自拿到唯一 ID', () => {
  const inventory = new Inventory({ capacity: 4 });
  inventory.add('axe', 1);
  inventory.add('axe', 1);
  const axes = inventory.instancesOf('axe');
  assert.equal(axes.length, 2, '两把斧子必须是两件实例');
  assert.equal(new Set(axes.map((slot) => slot.instanceId)).size, 2, '实例 ID 必须唯一');
  assert.equal(inventory.countOf('axe'), 2);
  // 一件实例只占一格，剩下 2 格时一次放 3 把应当整笔失败
  const blocked = inventory.add('axe', 3);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.added, 0);
  assert.equal(inventory.countOf('axe'), 2);
  // 显式允许部分放入时才能放进 2 把
  assert.equal(inventory.add('axe', 3, { allowPartial: true }).added, 2);
  assert.equal(inventory.usedSlots(), 4);
});

check('实例转移保留身份，不产生副本', () => {
  const source = new Inventory({ id: 'unit', capacity: 2 });
  const target = new Inventory({ id: 'base', capacity: 2 });
  source.add('pickaxe', 1);
  const originalId = source.instancesOf('pickaxe')[0].instanceId;
  const moved = source.transferInstanceTo(target, originalId);
  assert.equal(moved.ok, true);
  assert.equal(source.countOf('pickaxe'), 0);
  assert.equal(target.countOf('pickaxe'), 1);
  assert.equal(target.instancesOf('pickaxe')[0].instanceId, originalId, '转移后必须还是同一件');
});

check('跨容器转移是原子的：目标满了就一点都不动', () => {
  const source = new Inventory({ id: 'unit', capacity: 4 });
  const target = new Inventory({ id: 'base', capacity: 1 });
  source.add('wood', 300);
  target.add('stone', 40);
  const beforeSource = source.totalCount();
  const beforeTarget = target.totalCount();

  const blocked = source.transferTo(target, 'wood', 100);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, INVENTORY_ERROR.noSpace);
  assert.equal(source.totalCount(), beforeSource, '源容器不能被扣');
  assert.equal(target.totalCount(), beforeTarget, '目标容器不能被塞');
});

check('跨容器转移整体守恒', () => {
  const source = new Inventory({ id: 'unit', capacity: 4 });
  const target = new Inventory({ id: 'base', capacity: 4 });
  source.add('wood', 120);
  source.add('stone', 60);
  const total = source.totalCount() + target.totalCount();

  assert.equal(source.transferTo(target, 'wood', 120).moved, 120);
  assert.equal(source.transferTo(target, 'stone', 60).moved, 60);
  assert.equal(source.totalCount(), 0);
  assert.equal(target.countOf('wood'), 120);
  assert.equal(target.countOf('stone'), 60);
  assert.equal(source.totalCount() + target.totalCount(), total, '转移过程中总量必须不变');
});

check('序列化往返保留格位、数量与实例 ID', () => {
  const inventory = new Inventory({ id: 'base', capacity: 6 });
  inventory.add('wood', 250);
  inventory.add('axe', 1);
  inventory.add('iron', 33);
  const raw = JSON.parse(JSON.stringify(inventory.serialize()));
  const restored = Inventory.deserialize(raw);
  assert.equal(restored.id, 'base');
  assert.equal(restored.capacity, 6);
  assert.equal(restored.countOf('wood'), 250);
  assert.equal(restored.countOf('iron'), 33);
  assert.equal(restored.instancesOf('axe')[0].instanceId, inventory.instancesOf('axe')[0].instanceId);
  assert.deepEqual(restored.snapshot(), inventory.snapshot());
});

check('库存装不下时，资源节点上的量不能被扣掉', () => {
  // 一格 200 上限的库存，先塞满，再采需要 45 的橡树
  const inventory = new Inventory({ id: 'base', capacity: 1 });
  inventory.add('wood', 200);
  const world = makeWorld([makeNode('oak', 'oak-0')]);
  const system = new ResourceNodeSystem(null, { depositTarget: inventory }).attach(world);

  const blocked = system.harvest('oak-0', { toolIds: ['axe'], position: { x: 0, z: 0 } });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, RESOURCE_ERROR.noCapacity);
  assert.equal(system.nodeById('oak-0').amount, 45, '装不下时节点剩余量必须原样');
  assert.equal(inventory.totalCount(), 200);

  // 腾出空间后应当能采，而且采到的量等于库存实际收到的量
  inventory.remove('wood', 5);
  const ok = system.harvest('oak-0', { toolIds: ['axe'], position: { x: 0, z: 0 } });
  assert.equal(ok.ok, true);
  assert.equal(ok.taken, 5, '库存只剩 5 格空间，本次只能采 5');
  assert.equal(system.nodeById('oak-0').amount, 40);
  assert.equal(inventory.countOf('wood'), 200);
});

check('傀儡采集时产物进傀儡背包，背包装满则不扣节点', () => {
  const base = new Inventory({ id: 'base', capacity: 4 });
  const worker = new Inventory({ id: 'worker', capacity: 1 });
  const world = makeWorld([makeNode('oak', 'oak-0'), makeNode('oak', 'oak-1', 1, 1)]);
  const system = new ResourceNodeSystem(null, { depositTarget: base }).attach(world);

  // 指定落点为傀儡背包：产物不该直接出现在基地
  const first = system.harvest('oak-0', { toolIds: ['axe'], position: { x: 0, z: 0 }, depositTarget: worker });
  assert.equal(first.ok, true);
  assert.equal(first.taken, 5);
  assert.equal(worker.countOf('wood'), 5);
  assert.equal(base.countOf('wood'), 0, '傀儡没回基地之前，基地不该凭空多出木材');

  // 一格背包装满 200 之后，采集必须失败且不扣节点
  worker.add('wood', 195);
  assert.equal(worker.countOf('wood'), 200);
  const before = system.nodeById('oak-1').amount;
  const blocked = system.harvest('oak-1', { toolIds: ['axe'], position: { x: 1, z: 1 }, depositTarget: worker });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, RESOURCE_ERROR.noCapacity);
  assert.equal(system.nodeById('oak-1').amount, before, '装不下时节点剩余量必须原样');
  assert.equal(worker.countOf('wood') + base.countOf('wood'), 200, '总量必须守恒');

  // 运回基地：转移之后背包空了，基地拿到货
  const moved = worker.transferTo(base, 'wood', 200);
  assert.equal(moved.moved, 200);
  assert.equal(worker.totalCount(), 0);
  assert.equal(base.countOf('wood'), 200);
});

check('接上库存后，资源系统的账本不再持有第二份所有权', () => {
  const inventory = new Inventory({ id: 'base', capacity: 4 });
  const world = makeWorld([makeNode('oak', 'oak-0')]);
  const system = new ResourceNodeSystem(null, { depositTarget: inventory }).attach(world);
  system.harvest('oak-0', { toolIds: ['axe'], position: { x: 0, z: 0 } });

  assert.equal(system.usesInternalBank(), false);
  assert.equal(system.bankAmount('wood'), 5, '汇报的数量应当来自真正的库存');
  assert.equal(inventory.countOf('wood'), 5);
  const payload = system.serializeForSlot();
  assert.equal(payload.bank, undefined, '库存接管后资源系统不应再序列化自己的账本');
});

// ---- removeAt：按格取走（快捷栏 / 放置流程要"扣的就是你点的那一格"）----

check('removeAt 只动指定的那一格', () => {
  const inventory = new Inventory({ id: 'hotbar', capacity: 4 });
  inventory.add('furnace', 5);          // 第 0 格：5 个熔炉
  inventory.add('furnace', 5);          // 第 1 格：又是 5 个（故意同一种物品占两格）
  inventory.add('wood', 50);            // 第 2 格

  const first = inventory.removeAt(0, 1);
  assert.equal(first.ok, true);
  assert.equal(first.itemId, 'furnace');
  assert.equal(inventory.slots[0].count, 4, '扣的是第 0 格');
  assert.equal(inventory.slots[1].count, 5, '第 1 格必须原封不动');
  assert.equal(inventory.countOf('furnace'), 9);

  // 取空那一格 → 格子真的空掉，而不是留一个 count 0 的残格
  assert.equal(inventory.removeAt(0, 4).ok, true);
  assert.equal(inventory.slots[0], null, '取空后必须是 null，不能留 count 0');
  assert.equal(inventory.countOf('furnace'), 5, '剩下的还是第 1 格那 5 个');
});

check('removeAt 数量不够时只报到手多少，并说明不完整', () => {
  const inventory = new Inventory({ id: 'hotbar', capacity: 2 });
  inventory.add('wood', 3);
  const partial = inventory.removeAt(0, 10);
  assert.equal(partial.ok, false, '要 10 只有 3：必须报失败，不能假装成功');
  assert.equal(partial.removed, 3);
  assert.equal(partial.error, INVENTORY_ERROR.notEnough);
  assert.equal(inventory.slots[0], null, '能拿走的都拿走了');
});

check('removeAt 对空格子与非法下标是安全的', () => {
  const inventory = new Inventory({ id: 'hotbar', capacity: 2 });
  inventory.add('axe', 1);
  const empty = inventory.removeAt(1);
  assert.equal(empty.ok, false);
  assert.equal(empty.removed, 0);
  assert.equal(inventory.removeAt(99).ok, false);
  assert.equal(inventory.removeAt(-1).ok, false);
  assert.equal(inventory.countOf('axe'), 1, '失败的调用不许动到别的格子');
});

check('removeAt 也适用于实例物品（一格一件）', () => {
  const inventory = new Inventory({ id: 'hotbar', capacity: 3 });
  inventory.add('axe', 1);
  inventory.add('pickaxe', 1);
  const instanceId = inventory.slots[0].instanceId;
  assert.equal(inventory.removeAt(0, 1).ok, true);
  assert.equal(inventory.slots[0], null);
  assert.equal(inventory.findInstance(instanceId), null, '实例必须真的离开库存');
  assert.equal(inventory.slots[1].itemId, 'pickaxe', '另一格不受影响');
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
