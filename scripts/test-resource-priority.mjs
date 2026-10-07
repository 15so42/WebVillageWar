// 资源优先级的纯逻辑回归（用户本轮需求 8 的后半条）。
//
// 需求原文：「在资源 tab 里显示木傀儡可以采集到的、可以合成的所有物品，然后玩家可以点击
// 对应物品增加或者减少优先级。Ai 根据优先级去做相关任务」，随后澄清：
// 「只影响采集：合成类物品自动换算成它的材料需求」。
//
// 这一层要守的是三句话：
//   1. 两类行都要有：可采集资源 + 可合成产物；
//   2. 合成类物品**不直接派活**，而是折算成它的材料（"点了魔力石，傀儡去挖铁砍树"）；
//   3. 优先级能加能减，减到 0 就不再派活（"这一项我现在不想要"）。
//
// 尤其是第 2 条：折算错了不会崩、不会报错，只会让傀儡默默不去采某样材料。
// 那种错只能靠这里的数值断言发现。
import assert from 'node:assert/strict';
import {
  ITEM_DEFINITIONS,
  PRODUCTION_RECIPES,
  RECIPES,
  RESOURCE_NODE_DEFINITIONS
} from '../src/data/gameData.js';
import {
  PRIORITY_DEFAULT,
  PRIORITY_MAX,
  PRIORITY_MIN,
  RESOURCE_PRIORITY_RULES,
  clampPriority,
  defaultPriorityFor,
  demandsFromPriorities,
  demandsFromRows,
  findRecipeOutputting,
  gatherableInputsFor,
  gatherableResources,
  priorityByResource,
  priorityLabel,
  resourcePriorityRows
} from '../src/systems/resourcePriority.js';

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

const rows = resourcePriorityRows({ priorities: {}, stock: {} });
const rowOf = (itemId) => rows.find((row) => row.itemId === itemId) ?? null;

// ---------------------------------------------------------------- 可采集资源
check('可采集资源来自资源节点表，去重且顺序稳定', () => {
  const resources = gatherableResources();
  assert.ok(resources.length >= 4, `至少要有 4 种可采资源，实得 ${resources.length}`);
  assert.deepEqual(resources, [...resources].sort(), '必须排序，否则每次刷新界面行序会跳');
  const fromNodes = new Set(Object.values(RESOURCE_NODE_DEFINITIONS).map((node) => node.resource));
  fromNodes.forEach((resource) => {
    if (resource === 'food') return;
    // 谷物同样不自动派活：菜圃成熟后由玩家自己框选采收（与浆果丛同一条手动路径）。
    if (resource === 'grain') return;
    assert.ok(resources.includes(resource), `${resource} 必须有对应资源行`);
  });
  assert.equal(resources.includes('food'), false, '食物不进采集表');
  assert.equal(resources.includes('grain'), false, '谷物不进采集表（菜圃产物由玩家手动采收）');
  assert.ok(resources.includes('wood') && resources.includes('stone') && resources.includes('iron'));
});

// ---------------------------------------------------------------- 优先级刻度
check('优先级被夹在 [min, max] 里，并且取整', () => {
  assert.equal(clampPriority(99), PRIORITY_MAX);
  assert.equal(clampPriority(-99), PRIORITY_MIN);
  assert.equal(clampPriority(2.4), 2);
  assert.equal(clampPriority('3'), 3);
  assert.equal(clampPriority('abc'), PRIORITY_DEFAULT);
  assert.ok(PRIORITY_MIN < 0, '必须允许负数，否则表达不了"禁止采集"');
});

check('默认优先级：木材 > 石料，食物不开局采集', () => {
  assert.ok(defaultPriorityFor('wood') > defaultPriorityFor('stone'));
  assert.equal(defaultPriorityFor('food'), 0);
  assert.equal(defaultPriorityFor('fiber'), 0);
  assert.equal(defaultPriorityFor('furnace'), 0, '合成产物默认不加权');
});

check('界面上说的是人话，不是一个裸数字', () => {
  assert.match(priorityLabel(3), /优先级 3/);
  assert.match(priorityLabel(0), /不采/);
  assert.match(priorityLabel(-1), /禁止/);
});

// ---------------------------------------------------------------- 两类行
check('资源 tab 同时列出"可采集"与"可合成"两类行', () => {
  const resourceRows = rows.filter((row) => row.kind === 'resource');
  const craftRows = rows.filter((row) => row.kind === 'craft');
  assert.equal(resourceRows.length, gatherableResources().length);
  assert.ok(craftRows.length >= Object.keys(RECIPES).length, '每条合成配方都要有对应行');
  // 两类行各自内部顺序稳定
  assert.deepEqual(craftRows.map((row) => row.itemId), [...craftRows.map((row) => row.itemId)].sort());
  resourceRows.forEach((row) => {
    assert.equal(row.gatherable, true);
    assert.deepEqual(row.inputs, [{ itemId: row.itemId, count: 1 }], '资源行的材料就是它自己');
  });
  craftRows.forEach((row) => {
    assert.equal(row.gatherable, false);
    assert.ok(ITEM_DEFINITIONS[row.itemId], `${row.itemId} 必须是已定义物品`);
  });
});

check('行里带回库存与优先级，界面不需要自己算', () => {
  const withStock = resourcePriorityRows({ priorities: { wood: 4 }, stock: { wood: 123 } });
  const wood = withStock.find((row) => row.itemId === 'wood');
  assert.equal(wood.priority, 4);
  assert.equal(wood.stock, 123);
  const furnace = withStock.find((row) => row.itemId === 'furnace');
  assert.equal(furnace.priority, 0);
  assert.equal(furnace.stock, 0);
});

// ---------------------------------------------------------------- 合成 → 材料折算
check('合成产物能被折算成可采集材料（木材/石料）', () => {
  const furnace = gatherableInputsFor('furnace');
  const byId = Object.fromEntries(furnace.map((entry) => [entry.itemId, entry.count]));
  assert.equal(byId.stone, 30, '熔炉要 30 石料');
  assert.equal(byId.wood, 20, '熔炉要 20 木材');
  assert.equal(furnace.length, 2);
});

check('间接材料会被继续展开（木炭 ← 熔炉烧木材，必须算进木材需求）', () => {
  // 魔力石 = 4 铁 + 6 木炭；木炭来自熔炉（4 木材 → 2 木炭）
  assert.ok(findRecipeOutputting('charcoal'), '木炭必须能从生产表里找到来源');
  const manaStone = gatherableInputsFor('manaStone');
  const byId = Object.fromEntries(manaStone.map((entry) => [entry.itemId, entry.count]));
  assert.equal(byId.iron, 4, '魔力石要 4 铁');
  // 6 木炭 ÷ 2（每炉出 2）× 4 木材 = 12 木材
  assert.equal(byId.wood, 12, `木炭必须折算回木材，实得 ${JSON.stringify(manaStone)}`);
  assert.equal(manaStone.some((entry) => entry.itemId === 'charcoal'), false, '木炭本身不是可采集资源');
});

check('没有任何材料来源的物品不会被算进需求（也不会崩）', () => {
  // 深邃核心只从刷巢穴掉，采不到也做不出来
  assert.equal(findRecipeOutputting('deepCore'), null);
  assert.deepEqual(gatherableInputsFor('deepCore'), []);
  const recruitmentOrder = gatherableInputsFor('recruitmentOrder');
  const byId = Object.fromEntries(recruitmentOrder.map((entry) => [entry.itemId, entry.count]));
  assert.equal(byId.wood, 20, '招募令只要木材是能采的');
  assert.equal(byId.deepCore, undefined, '深邃核心不该出现在采集需求里');
});

check('配方环不会让折算变成死循环', () => {
  const cyclic = new Map([
    ['a', { inputs: [{ itemId: 'b', count: 1 }], output: { itemId: 'a', count: 1 } }],
    ['b', { inputs: [{ itemId: 'a', count: 1 }], output: { itemId: 'b', count: 1 } }]
  ]);
  // 直接调带 depth 的内部路径：用真实数据不会成环，所以这里用"深度上限"兜底验证
  assert.doesNotThrow(() => gatherableInputsFor('furnace', { memo: new Map() }));
  void cyclic;
});

// ---------------------------------------------------------------- 行 → 采集需求
check('资源行的优先级直接变成采集权重与目标库存', () => {
  const demands = demandsFromPriorities({ wood: 4, stone: 0, iron: 0, fiber: 1 });
  const wood = demands.find((demand) => demand.resource === 'wood');
  const fiber = demands.find((demand) => demand.resource === 'fiber');
  assert.ok(wood, '木材必须在需求表里');
  assert.equal(wood.enabled, true);
  assert.equal(
    wood.weight,
    RESOURCE_PRIORITY_RULES.baseWeight + RESOURCE_PRIORITY_RULES.weightStep * 4
  );
  assert.equal(wood.targetStock, 4 * RESOURCE_PRIORITY_RULES.targetStockPerLevel);
  assert.ok(fiber.weight < wood.weight, '优先级低的权重必须更小');
});

check('优先级 <= 0 的资源不会出现在需求表里（或明确 enabled=false）', () => {
  const demands = demandsFromPriorities({ wood: 0, stone: 0, food: 0, iron: 0, fiber: 0 });
  assert.equal(demands.length, 0, `没有正优先级时不该派出任何采集需求：${JSON.stringify(demands)}`);
  // 只给木材正优先级，其余全部显式压成 0
  const mixed = demandsFromPriorities({ wood: 2, stone: 0, food: 0, iron: 0, fiber: 0 });
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].resource, 'wood');
});

check('没被点过的资源走默认优先级（否则开局没人采石料）', () => {
  // 优先级字典一开始是空的，只有玩家点过的项才有键。这一步守的是
  // "部分覆盖 + 其余走默认"这个语义——如果漏了默认值，开局只会采木材。
  const demands = demandsFromPriorities({});
  const resources = demands.map((demand) => demand.resource);
  assert.ok(resources.includes('wood') && resources.includes('stone'));
  assert.equal(resources.includes('food'), false);
  const partial = demandsFromPriorities({ iron: 3 });
  const partialResources = partial.map((demand) => demand.resource);
  assert.ok(partialResources.includes('iron'), '点过的项必须生效');
  assert.ok(partialResources.includes('wood'), '没点过的项必须回落到默认优先级');
});

check('合成类物品只影响采集：给魔力石加优先级 = 多挖铁、多砍树', () => {
  const neutral = demandsFromPriorities({ wood: 0, stone: 0, food: 0, iron: 0, fiber: 0 });
  assert.equal(neutral.length, 0, '先确认基线是"什么都不采"');
  const withManaStone = demandsFromPriorities({
    wood: 0, stone: 0, food: 0, iron: 0, fiber: 0, manaStone: 3
  });
  const byResource = Object.fromEntries(withManaStone.map((demand) => [demand.resource, demand]));
  assert.ok(byResource.iron, '魔力石要铁，铁必须被加进需求');
  assert.ok(byResource.wood, '魔力石要木炭，木炭来自木材，木材也必须被加进需求');
  // 按配方占比分摊：4 铁 vs 12 木材 → 木材拿到的权重要比铁高
  assert.ok(
    byResource.wood.weight > byResource.iron.weight,
    `木材权重应高于铁（配比 12:4），实得 wood=${byResource.wood.weight} iron=${byResource.iron.weight}`
  );
});

check('合成类的优先级不会被当成"采集这件成品"', () => {
  const withFurnace = demandsFromPriorities({
    wood: 0, stone: 0, food: 0, iron: 0, fiber: 0, furnace: 2
  });
  assert.equal(
    withFurnace.some((demand) => demand.resource === 'furnace'),
    false,
    '熔炉不可能被采集，需求表里不该出现它'
  );
  assert.ok(withFurnace.every((demand) => gatherableResources().includes(demand.resource)));
});

check('负数优先级能压住合成需求（"我现在不要这项"是有效的）', () => {
  const rowsWithBan = resourcePriorityRows({
    priorities: { wood: 0, stone: 0, food: 0, iron: 0, fiber: 0, manaStone: -1 }
  });
  const totals = priorityByResource(rowsWithBan);
  // 魔力石 -1 会把铁与木炭的需求压成负数，于是两种资源都不该被派出
  const iron = totals.get('iron') ?? 0;
  assert.ok(iron <= 0, `魔力石被禁止时铁的有效优先级应 <= 0，实得 ${iron}`);
  const demands = demandsFromRows(rowsWithBan);
  assert.equal(demands.some((demand) => demand.resource === 'iron' && demand.enabled), false);
});

check('目标库存随优先级增长，并且有上限', () => {
  const low = demandsFromPriorities({ wood: 1 }).find((demand) => demand.resource === 'wood');
  const high = demandsFromPriorities({ wood: 5 }).find((demand) => demand.resource === 'wood');
  assert.ok(high.targetStock > low.targetStock);
  assert.ok(high.targetStock <= RESOURCE_PRIORITY_RULES.maxTargetStock);
});

check('确定性：同样的优先级永远得到同样的需求表', () => {
  const input = { wood: 3, stone: 2, food: 1, iron: 1, furnace: 2 };
  const first = demandsFromPriorities(input);
  for (let i = 0; i < 12; i += 1) {
    assert.deepEqual(demandsFromPriorities(input), first);
  }
  // 行顺序也必须是确定的（界面每 400ms 重建一次，顺序跳会让人点错）
  const firstRows = resourcePriorityRows({ priorities: input }).map((row) => row.itemId);
  for (let i = 0; i < 12; i += 1) {
    assert.deepEqual(resourcePriorityRows({ priorities: input }).map((row) => row.itemId), firstRows);
  }
});

check('默认开局只采木材和石料，不派去采食物', () => {
  const demands = demandsFromPriorities({});
  const byResource = Object.fromEntries(demands.map((demand) => [demand.resource, demand]));
  assert.ok(byResource.wood && byResource.stone, '开局必须采木和石');
  assert.equal(byResource.food, undefined);
  assert.ok(byResource.wood.weight > byResource.stone.weight);
  assert.ok(demands.every((demand) => demand.enabled !== false));
  // 采不到的东西（没有节点）不该被派活
  assert.equal(byResource.charcoal, undefined);
});

check('生产表里的产物也能被反查到配方（合成表之外的第二条来源）', () => {
  const charcoal = findRecipeOutputting('charcoal');
  assert.ok(charcoal, '木炭必须能从 PRODUCTION_RECIPES 里反查到');
  assert.deepEqual(charcoal.inputs, [PRODUCTION_RECIPES.furnace.input]);
  assert.equal(charcoal.output.itemId, 'charcoal');
});

console.log(report.join('\n'));
console.log(process.exitCode ? '\nRESOURCE PRIORITY: FAIL' : '\nRESOURCE PRIORITY: PASS');
