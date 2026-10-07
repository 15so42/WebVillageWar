// 资源节点回归测试：
// 1) 数据一致性（节点定义引用的资源种类、工具、数量都要存在且合法）
// 2) 采集结算与工具校验（缺工具/太远/已采空都必须是明确错误，不能静默产 0）
// 3) 采空后释放模型与寻路阻挡，且绝不重复掉落
// 4) 物品守恒：采走的量 + 剩下的量 = 初始量
// 5) 存档/联机快照往返不改变剩余量与采空状态
import assert from 'node:assert/strict';
import {
  ITEM_DEFINITIONS,
  PRODUCTION_RECIPES,
  RECIPES,
  RESOURCE_NODE_DEFINITIONS,
  RESOURCE_NODE_RULES,
  RESOURCE_TYPES,
  SALVAGE_RULES,
  TOOL_DEFINITIONS,
  UNIT_DEFINITIONS
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
    object: { visible: true, userData: {} }
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

check('富铁矿要用镐，挖出来的是铁矿', () => {
  const world = makeWorld([makeNode('richIron', { id: 'rich-0', x: 2, z: 2 })]);
  const system = new ResourceNodeSystem(null).attach(world);
  const bare = system.harvest('rich-0', { toolIds: ['axe'], position: { x: 2, z: 2 } });
  assert.equal(bare.ok, false);
  assert.equal(bare.error, RESOURCE_ERROR.needsTool);
  assert.equal(system.nodeById('rich-0').amount, RESOURCE_NODE_DEFINITIONS.richIron.amount);

  const dug = system.harvest('rich-0', { toolIds: ['pickaxe'], position: { x: 2, z: 2 } });
  assert.equal(dug.ok, true);
  assert.equal(dug.resource, 'iron');
  assert.equal(system.bankAmount('iron'), dug.taken);
  assert.equal(
    system.nodeById('rich-0').amount,
    RESOURCE_NODE_DEFINITIONS.richIron.amount - dug.taken
  );
});

check('工具校验：橡树需要斧，浆果丛徒手可采', () => {
  assert.equal(resourceNodeToolSatisfied('oak', []), false);
  assert.equal(resourceNodeToolSatisfied('oak', ['axe']), true);
  assert.equal(resourceNodeToolSatisfied('berryBush', []), true);
  assert.equal(resourceNodeToolSatisfied('ironVein', ['axe']), false);
  assert.equal(resourceNodeToolSatisfied('richIron', ['pickaxe']), true);
  assert.equal(resourceNodeToolSatisfied('richIron', []), false);
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

// ---------------------------------------------------------------------------
// 贫矿址（docs/DSH_RESOURCE_SUSTAINABILITY.md「采完地表资源，转向建设与深采」）
//
// 「地表石料/铁矿耗尽是富集层采完，不是整片地质资源永远消失。」
// 这一组断言就是这个设计意图的可验证形式。
// ---------------------------------------------------------------------------
check('石料/铁矿采空后登记为贫矿址，位置与 id 稳定且只登记一次', () => {
  const world = makeWorld([
    makeNode('stonePile', { id: 'stone-0', x: 4, z: 4 }),
    makeNode('ironVein', { id: 'iron-0', x: -6, z: 2 })
  ]);
  const system = new ResourceNodeSystem(null).attach(world);
  // 采空石堆
  let last = null;
  for (let i = 0; i < 64; i += 1) {
    last = system.harvest('stone-0', { toolIds: ['pickaxe'], position: { x: 4, z: 4 } });
    if (!last.ok || last.depleted) break;
  }
  assert.equal(last.depleted, true);
  const site = system.depletedOreSiteByNodeId('stone-0');
  assert.ok(site, '石堆采空必须留下贫矿址');
  assert.equal(site.resource, 'stone');
  assert.equal(site.x, 4);
  assert.equal(site.z, 4);
  assert.ok(site.siteRadius >= 3);
  // 重复 release 不重复登记
  const before = system.stats.oreSitesMarked;
  system.release('stone-0');
  assert.equal(system.stats.oreSitesMarked, before, '重复释放不该再登记一次');
  // 铁矿同理
  for (let i = 0; i < 64; i += 1) {
    last = system.harvest('iron-0', { toolIds: ['pickaxe'], position: { x: -6, z: 2 } });
    if (!last.ok || last.depleted) break;
  }
  assert.ok(system.depletedOreSiteByNodeId('iron-0'));
  assert.equal(system.depletedOreSitesFor('stone').length, 1);
  assert.equal(system.depletedOreSitesFor('iron').length, 1);
  // 贫矿址必须能被"半径内查找"找到（深采设施选址用）
  const near = system.depletedOreSiteNear('stone', { x: 5, z: 4.5 }, 8);
  assert.ok(near);
  assert.equal(near.site.nodeId, 'stone-0');
  assert.equal(system.depletedOreSiteNear('stone', { x: 500, z: 500 }, 8), null);
  assert.equal(system.depletedOreSiteNear('wood', { x: 4, z: 4 }, 8), null);
});

check('木材/纤维/食物采空不留矿址，也不参与深采选址', () => {
  const world = makeWorld([
    makeNode('oak', { id: 'oak-0', x: 0, z: 0 }),
    makeNode('berryBush', { id: 'berry-0', x: 2, z: 0 })
  ]);
  const system = new ResourceNodeSystem(null).attach(world);
  for (let i = 0; i < 64; i += 1) {
    const result = system.harvest('oak-0', { toolIds: ['axe'], position: { x: 0, z: 0 } });
    if (!result.ok || result.depleted) break;
  }
  for (let i = 0; i < 64; i += 1) {
    const result = system.harvest('berry-0', { toolIds: [], position: { x: 2, z: 0 } });
    if (!result.ok || result.depleted) break;
  }
  assert.equal(system.depletedOreSites.size, 0, '木材与食物不该留下矿址');
  assert.equal(system.stats.oreSitesMarked, 0);
});

check('贫矿址随存档往返：重载后深采选址资格不丢', () => {
  const world = makeWorld([makeNode('stonePile', { id: 'stone-0', x: 4, z: 4 })]);
  const system = new ResourceNodeSystem(null).attach(world);
  for (let i = 0; i < 64; i += 1) {
    const result = system.harvest('stone-0', { toolIds: ['pickaxe'], position: { x: 4, z: 4 } });
    if (!result.ok || result.depleted) break;
  }
  const snapshot = JSON.parse(JSON.stringify(system.serializeForSlot()));
  assert.equal(snapshot.depletedOreSites.length, 1);
  const restored = new ResourceNodeSystem(null).attach(
    makeWorld([makeNode('stonePile', { id: 'stone-0', x: 4, z: 4 })])
  );
  restored.applySnapshot(snapshot);
  const site = restored.depletedOreSiteByNodeId('stone-0');
  assert.ok(site, '快照恢复后矿址必须还在');
  assert.equal(site.resource, 'stone');
  assert.equal(restored.depletedOreSiteNear('stone', { x: 4.5, z: 4 }, 8)?.site?.nodeId, 'stone-0');
  // 快照里没有的矿址要被清掉，不留幽灵
  restored.applySnapshot({ nodes: [], depletedOreSites: [] });
  assert.equal(restored.depletedOreSites.size, 0);
});

check('深采设施的定义与配方自洽：分工、慢速、吃燃料、产物是真实物品', () => {
  ['quarry', 'deepMine'].forEach((facilityId) => {
    const definition = UNIT_DEFINITIONS[facilityId];
    assert.ok(definition, `${facilityId} 必须有单位定义`);
    assert.equal(definition.resourceSiteRequired, true, '必须在矿址旁');
    assert.ok(definition.resourceSiteRadius >= 3);
    const recipe = PRODUCTION_RECIPES[facilityId];
    assert.ok(recipe, `${facilityId} 必须有生产配方`);
    assert.ok(recipe.seconds >= 30, '深采必须是慢速（不能变成第二个富矿采集）');
    assert.equal(recipe.input.itemId, 'charcoal', '深采必须吃真实燃料');
    assert.ok(recipe.output.count <= 4, '深采单周期产量必须明显低于地表采集');
    assert.ok(ITEM_DEFINITIONS[recipe.output.itemId], '产物必须是一件真实物品');
  });
  // 两类设施分工不同矿种
  assert.equal(PRODUCTION_RECIPES.quarry.output.itemId, 'stone');
  assert.equal(PRODUCTION_RECIPES.deepMine.output.itemId, 'iron');
  // 初始建设不能依赖自己的产物（石场不能要石料、深矿不能要铁矿）
  const quarryRecipe = RECIPES.quarry ?? null;
  const deepMineRecipe = RECIPES.deepMine ?? null;
  assert.ok(quarryRecipe && deepMineRecipe, '两类深采设施都要有建造配方');
  const inputsOf = (recipe) => {
    if (!recipe) return [];
    if (Array.isArray(recipe.cost)) return recipe.cost.map((entry) => entry.itemId);
    return Object.keys(recipe.inputs ?? recipe.cost ?? {});
  };
  assert.ok(!inputsOf(quarryRecipe).includes('stone'), '采石场不能要求石料才能建');
  assert.ok(!inputsOf(deepMineRecipe).includes('iron'), '深矿井不能要求铁矿才能建');
});

check('基础拾荒点：产量压到正规链十分之一以下、有地上上限、不给铁矿/口粮', () => {
  assert.ok(SALVAGE_RULES.enabled);
  assert.ok(SALVAGE_RULES.points.length >= 1);
  const kinds = new Set(SALVAGE_RULES.points.map((point) => point.kind));
  assert.ok(kinds.has('wood'), '必须有木材兜底（重做工具/补种）');
  kinds.forEach((kind) => {
    assert.ok(['wood', 'stone'].includes(kind), `拾荒点不该产出 ${kind}`);
  });
  // 十分之一口径：一次采集动作 5 份，拾荒每次 3 份但间隔 90 秒
  const normalPerSecond = 5 / 1.5;                 // 约 3.33 份/秒
  const salvagePerSecond = SALVAGE_RULES.producePerEvent / SALVAGE_RULES.secondsPerEvent;
  assert.ok(
    salvagePerSecond < normalPerSecond / 10,
    `拾荒 ${salvagePerSecond.toFixed(3)}/秒 必须低于正规采集 ${(normalPerSecond / 10).toFixed(3)}/秒`
  );
  assert.ok(SALVAGE_RULES.maxOnGround > 0, '场上存量必须有上限，不能无限积累');
  assert.ok(SALVAGE_RULES.producePerEvent <= SALVAGE_RULES.maxOnGround);
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
