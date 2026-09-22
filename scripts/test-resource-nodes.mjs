// 资源节点回归测试：
// 1) 数据一致性（节点定义引用的资源种类、工具、数量都要存在且合法）
// 2) 采集结算与工具校验（缺工具/太远/已采空都必须是明确错误，不能静默产 0）
// 3) 采空后释放模型与寻路阻挡，且绝不重复掉落
// 4) 物品守恒：采走的量 + 剩下的量 = 初始量
// 5) 存档/联机快照往返不改变剩余量与采空状态
import assert from 'node:assert/strict';
import {
  RESOURCE_NODE_DEFINITIONS,
  RESOURCE_NODE_RULES,
  RESOURCE_TYPES,
  TOOL_DEFINITIONS
} from '../src/data/gameData.js';
import {
  normalizeResourceNodeState,
  resolveHarvest,
  resourceAmountsByType,
  resourceNodeToolSatisfied,
  serializeResourceNodeState,
  totalResourceAmount
} from '../src/systems/resources.js';
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

function makeNode(definitionId, { id, x = 0, z = 0 } = {}) {
  const definition = RESOURCE_NODE_DEFINITIONS[definitionId];
  return {
    id: id ?? definitionId,
    definitionId,
    resource: definition.resource,
    x,
    z,
    y: 0,
    amount: definition.amount,
    maxAmount: definition.amount,
    navRadius: definition.navRadius,
    object: { visible: true }
  };
}

function makeWorld(nodes) {
  const released = [];
  return {
    resourceNodes: nodes,
    released,
    releaseResourceNode(id) {
      released.push(id);
      const node = nodes.find((entry) => entry.id === id);
      if (node?.object) node.object.visible = false;
      return true;
    }
  };
}

check('节点定义都指向存在的资源种类，且有正数产量', () => {
  Object.values(RESOURCE_NODE_DEFINITIONS).forEach((definition) => {
    assert.ok(RESOURCE_TYPES[definition.resource], `${definition.id} 的资源种类不存在`);
    assert.ok(definition.amount > 0, `${definition.id} 的产量必须为正`);
    if (definition.tool) {
      assert.ok(TOOL_DEFINITIONS[definition.tool], `${definition.id} 引用了不存在的工具`);
    }
  });
});

check('采集结算不会超出剩余量，并按剩余量判定采空', () => {
  const node = { amount: 7 };
  assert.deepEqual(resolveHarvest(node, 5), { taken: 5, remaining: 2, depleted: false });
  assert.deepEqual(resolveHarvest(node, 999), { taken: 7, remaining: 0, depleted: true });
  assert.deepEqual(resolveHarvest({ amount: 0 }, 5), { taken: 0, remaining: 0, depleted: true });
  const fallback = resolveHarvest(node, null);
  assert.equal(fallback.taken, RESOURCE_NODE_RULES.harvestPerAction);
});

check('工具校验：橡树需要斧，浆果丛徒手可采', () => {
  assert.equal(resourceNodeToolSatisfied('oak', []), false);
  assert.equal(resourceNodeToolSatisfied('oak', ['axe']), true);
  assert.equal(resourceNodeToolSatisfied('berryBush', []), true);
  assert.equal(resourceNodeToolSatisfied('ironVein', ['axe']), false);
});

check('状态规范化会夹住越界数值，不产生负剩余量', () => {
  const definition = RESOURCE_NODE_DEFINITIONS.stonePile;
  const clamped = normalizeResourceNodeState(
    { id: 'a', definitionId: 'stonePile', amount: -5, maxAmount: 999999 },
    { id: 'a', definitionId: 'stonePile', amount: definition.amount, maxAmount: definition.amount }
  );
  assert.equal(clamped.amount, 0);
  assert.equal(clamped.maxAmount, 999999);
  const overflow = normalizeResourceNodeState(
    { id: 'a', definitionId: 'stonePile', amount: 999, maxAmount: 40 },
    null
  );
  assert.equal(overflow.amount, 40);
});

check('缺工具 / 太远 / 已采空都返回明确错误且不产出资源', () => {
  const world = makeWorld([makeNode('oak', { id: 'oak-0', x: 0, z: 0 })]);
  const system = new ResourceNodeSystem(null).attach(world);

  const noTool = system.harvest('oak-0', { toolIds: [] });
  assert.equal(noTool.ok, false);
  assert.equal(noTool.error, RESOURCE_ERROR.needsTool);
  assert.equal(noTool.requiredTool, '木斧');
  assert.equal(system.nodeById('oak-0').amount, RESOURCE_NODE_DEFINITIONS.oak.amount);
  assert.equal(system.bankAmount('wood'), 0);

  const far = system.harvest('oak-0', { toolIds: ['axe'], position: { x: 999, z: 0 } });
  assert.equal(far.ok, false);
  assert.equal(far.error, RESOURCE_ERROR.outOfRange);

  const unknown = system.harvest('nope', { toolIds: ['axe'] });
  assert.equal(unknown.error, RESOURCE_ERROR.unknownNode);
});

check('采空后释放模型与寻路阻挡，并且只释放一次', () => {
  const world = makeWorld([makeNode('stonePile', { id: 'stone-0', x: 4, z: 4 })]);
  const system = new ResourceNodeSystem(null).attach(world);
  const initial = system.nodeById('stone-0').amount;
  const swings = Math.ceil(initial / RESOURCE_NODE_RULES.harvestPerAction);

  let last = null;
  for (let i = 0; i < swings; i += 1) {
    last = system.harvest('stone-0', { toolIds: ['pickaxe'], position: { x: 4, z: 4 } });
    assert.equal(last.ok, true, `第 ${i + 1} 次采集应当成功`);
  }
  assert.equal(last.depleted, true);
  assert.equal(system.nodeById('stone-0').amount, 0);
  assert.equal(system.nodeById('stone-0').released, true);
  assert.deepEqual(world.released, ['stone-0'], '采空只应释放一次');
  assert.equal(world.resourceNodes[0].object.visible, false);
  assert.equal(system.activeNodes().length, 0);

  const again = system.harvest('stone-0', { toolIds: ['pickaxe'] });
  assert.equal(again.ok, false);
  assert.equal(again.error, RESOURCE_ERROR.depleted);
  assert.deepEqual(world.released, ['stone-0'], '重复采集不得再次释放');
});

check('物品守恒：采走的总量 + 剩余总量 = 初始总量', () => {
  const definitions = ['oak', 'stonePile', 'berryBush', 'ironVein'];
  const world = makeWorld(definitions.map((id, index) => makeNode(id, { id: `${id}-${index}`, x: index, z: 0 })));
  const system = new ResourceNodeSystem(null).attach(world);
  const initialTotal = totalResourceAmount(world.resourceNodes);

  world.resourceNodes.forEach((node) => {
    const tools = node.definitionId === 'berryBush' ? [] : [RESOURCE_NODE_DEFINITIONS[node.definitionId].tool];
    // 每个节点采两次，留一部分不采，验证剩余量统计
    system.harvest(node.id, { toolIds: tools, position: { x: node.x, z: node.z } });
    system.harvest(node.id, { toolIds: tools, position: { x: node.x, z: node.z } });
  });

  const totals = system.totals();
  assert.equal(totals.harvestedTotal + totals.remainingTotal, initialTotal, '资源出现了凭空增加或丢失');
  const bankTotal = Object.values(system.bankSnapshot()).reduce((sum, value) => sum + value, 0);
  assert.equal(bankTotal, totals.harvestedTotal, '账本与采集统计不一致');
  const byType = resourceAmountsByType(system.allNodes());
  assert.equal(Object.values(byType).reduce((sum, value) => sum + value, 0), totals.remainingTotal);
  assert.ok(totals.remainingTotal > 0, '测例应当留下未采完的资源');
});

check('快照往返保持剩余量与采空状态', () => {
  const world = makeWorld([
    makeNode('oak', { id: 'oak-0', x: 0, z: 0 }),
    makeNode('pine', { id: 'pine-0', x: 5, z: 5 })
  ]);
  const system = new ResourceNodeSystem(null).attach(world);
  system.harvest('oak-0', { toolIds: ['axe'], position: { x: 0, z: 0 } });
  system.harvest('pine-0', { toolIds: ['axe'], position: { x: 5, z: 5 } });
  const snapshot = JSON.parse(JSON.stringify(system.serializeForSlot()));

  const restoredWorld = makeWorld([
    makeNode('oak', { id: 'oak-0', x: 0, z: 0 }),
    makeNode('pine', { id: 'pine-0', x: 5, z: 5 })
  ]);
  const restored = new ResourceNodeSystem(null).attach(restoredWorld);
  restored.applySnapshot(snapshot);

  assert.deepEqual(restored.serializeForSlot(), snapshot, '快照往返后状态不一致');
  assert.equal(restored.bankAmount('wood'), system.bankAmount('wood'));

  // 快照里已经采空、但本地还没释放的节点，恢复时必须补上释放
  const depletedSnapshot = {
    nodes: [
      serializeResourceNodeState({ id: 'oak-0', definitionId: 'oak', resource: 'wood', amount: 0, maxAmount: 45, released: true })
    ],
    bank: { wood: 45 }
  };
  const third = new ResourceNodeSystem(null).attach(makeWorld([makeNode('oak', { id: 'oak-0' })]));
  third.applySnapshot(depletedSnapshot);
  assert.equal(third.nodeById('oak-0').released, true);
  assert.deepEqual(third.world.released, ['oak-0']);
});

check('快照忽略未知节点，不会凭空造出资源', () => {
  const world = makeWorld([makeNode('oak', { id: 'oak-0' })]);
  const system = new ResourceNodeSystem(null).attach(world);
  system.applySnapshot({ nodes: [{ id: 'ghost', definitionId: 'oak', amount: 10, maxAmount: 45 }], bank: {} });
  assert.equal(system.allNodes().length, 1);
  assert.equal(system.nodeById('ghost'), null);
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
