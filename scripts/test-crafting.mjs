// 合成规则回归测试。
//
// 这一块的核心不是"能不能做出来"，而是**失败时库存一个字节都不能变**：
// 材料不够、产物放不下、配方非法、次数非法，都不许留下半成品状态。
// 另外单独守一条容易被写错的：材料腾出来的格子要能算进产物的空间。
import assert from 'node:assert/strict';
import { Inventory } from '../src/systems/Inventory.js';
import {
  CRAFT_ERROR,
  allRecipes,
  canCraft,
  craftRecipe,
  maxCraftableTimes,
  missingInputs,
  normalizeRecipe,
  recipeById,
  recipeInputsFor,
  refundCraft
} from '../src/systems/crafting.js';
import { ITEM_DEFINITIONS, RECIPES } from '../src/data/gameData.js';

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

function makeInventory(capacity = 24) {
  return new Inventory({ id: 'test', capacity });
}

const RECRUIT = RECIPES.recruitmentOrder;

check('配方数据健全：每个材料与产物都有物品定义', () => {
  assert.ok(allRecipes().length > 0);
  allRecipes().forEach((recipe) => {
    const normalized = normalizeRecipe(recipe);
    assert.ok(normalized, `配方 ${recipe.id} 必须可规范化`);
    normalized.inputs.forEach((entry) => {
      assert.ok(ITEM_DEFINITIONS[entry.itemId], `材料 ${entry.itemId} 必须有物品定义`);
      assert.ok(entry.count > 0);
    });
    assert.ok(ITEM_DEFINITIONS[normalized.output.itemId], `产物 ${normalized.output.itemId} 必须有物品定义`);
  });
  assert.equal(recipeById('recruitmentOrder')?.id, 'recruitmentOrder');
  assert.equal(recipeById('missing-recipe'), null);
});

check('材料齐备时合成成功，材料按量扣除、产物按量加入', () => {
  const inventory = makeInventory();
  inventory.add('deepCore', 2);
  inventory.add('wood', 100);
  const before = inventory.countsByItem();
  const result = craftRecipe(inventory, 'recruitmentOrder');
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.crafted, 1);
  assert.equal(inventory.countOf('deepCore'), before.deepCore - 1);
  assert.equal(inventory.countOf('wood'), before.wood - 20);
  assert.equal(inventory.countOf('recruitmentOrder'), 1);
});

check('材料不够时整笔失败，且库存完全不变', () => {
  const inventory = makeInventory();
  inventory.add('deepCore', 1);
  inventory.add('wood', 19);
  const before = JSON.stringify(inventory.serialize());
  const result = craftRecipe(inventory, 'recruitmentOrder');
  assert.equal(result.ok, false);
  assert.equal(result.reason, CRAFT_ERROR.missingInputs);
  assert.equal(result.crafted, 0);
  assert.equal(JSON.stringify(inventory.serialize()), before, '失败时库存必须一个字节都不变');
  assert.deepEqual(
    result.missing.map((entry) => entry.itemId),
    ['wood'],
    '缺什么要报清楚，UI 才能直接显示'
  );
  assert.equal(result.missing[0].missing, 1);
});

check('产物放不下时整笔失败，材料不会被白扣', () => {
  // 用招募令测不出这一条：它的材料正好占满格子，扣完就腾出空间，产物一定放得下。
  // 必须构造一个"材料从已有堆里扣、产物又塞不进同一个堆"的场景。
  // 1 格装满 200 木材，配方是 1 木材 → 200 木材：
  // 扣掉 1 之后剩 199，只能再塞 1 个，离 200 差得远 → 必须整笔失败。
  const bulk = {
    id: 'testBulk',
    name: '堆叠压力测试',
    inputs: [{ itemId: 'wood', count: 1 }],
    output: { itemId: 'wood', count: 200 }
  };
  const inventory = makeInventory(1);
  inventory.add('wood', 200);
  const before = JSON.stringify(inventory.serialize());
  const result = craftRecipe(inventory, bulk);
  assert.equal(result.ok, false, '产物放不下时必须失败');
  assert.equal(result.reason, CRAFT_ERROR.noSpace);
  assert.equal(JSON.stringify(inventory.serialize()), before, '失败时材料必须原样留着');
  assert.equal(inventory.countOf('wood'), 200);
  assert.equal(inventory.countOf('deepCore'), 0);
});

check('材料腾出来的格子可以算进产物的空间（不能先查空位再扣材料）', () => {
  // 场景：2 格，第 1 格 1 个深邃核心，第 2 格 20 木材。
  // 合成会吃掉这一整格核心与整格木材 → 空出 2 格 → 产物完全放得下。
  // 如果实现是"先看 freeSlots() 有没有空位"，这里会被误判成放不下。
  const inventory = makeInventory(2);
  inventory.add('deepCore', 1);
  inventory.add('wood', 20);
  const result = craftRecipe(inventory, 'recruitmentOrder');
  assert.equal(result.ok, true, `材料刚好占满两格时也必须做得出来（实际：${result.reason}）`);
  assert.equal(inventory.countOf('recruitmentOrder'), 1);
  assert.equal(inventory.countOf('deepCore'), 0);
  assert.equal(inventory.countOf('wood'), 0);
});

check('多批合成按倍数扣料与产出', () => {
  const inventory = makeInventory();
  inventory.add('deepCore', 3);
  inventory.add('wood', 200);
  const result = craftRecipe(inventory, 'recruitmentOrder', { times: 3 });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.crafted, 3);
  assert.equal(inventory.countOf('deepCore'), 0);
  assert.equal(inventory.countOf('wood'), 200 - 60);
  assert.equal(inventory.countOf('recruitmentOrder'), 3);
});

check('多批合成里只要有一批材料不够，整笔都不做', () => {
  const inventory = makeInventory();
  inventory.add('deepCore', 2);
  inventory.add('wood', 200);
  const before = JSON.stringify(inventory.serialize());
  const result = craftRecipe(inventory, 'recruitmentOrder', { times: 3 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, CRAFT_ERROR.missingInputs);
  assert.equal(result.missing[0].itemId, 'deepCore');
  assert.equal(result.missing[0].missing, 1);
  assert.equal(JSON.stringify(inventory.serialize()), before);
});

check('canCraft 只看不改：连续调用不会影响库存', () => {
  const inventory = makeInventory();
  inventory.add('deepCore', 1);
  inventory.add('wood', 20);
  const before = JSON.stringify(inventory.serialize());
  assert.equal(canCraft(inventory, 'recruitmentOrder').ok, true);
  assert.equal(canCraft(inventory, 'recruitmentOrder').ok, true);
  assert.equal(JSON.stringify(inventory.serialize()), before, 'canCraft 不得修改库存');
  assert.equal(inventory.countOf('recruitmentOrder'), 0);
});

check('非法配方与非法次数都被挡下，且不动库存', () => {
  const inventory = makeInventory();
  inventory.add('deepCore', 1);
  inventory.add('wood', 20);
  const before = JSON.stringify(inventory.serialize());
  assert.equal(craftRecipe(inventory, 'nope').reason, CRAFT_ERROR.unknownRecipe);
  assert.equal(craftRecipe(inventory, null).reason, CRAFT_ERROR.unknownRecipe);
  assert.equal(craftRecipe(inventory, 'recruitmentOrder', { times: 0 }).reason, CRAFT_ERROR.invalidTimes);
  assert.equal(craftRecipe(inventory, 'recruitmentOrder', { times: -2 }).reason, CRAFT_ERROR.invalidTimes);
  assert.equal(craftRecipe(inventory, 'recruitmentOrder', { times: 1.5 }).reason, CRAFT_ERROR.invalidTimes);
  assert.equal(JSON.stringify(inventory.serialize()), before);
});

check('配方里的物品必须有定义，否则拒绝而不是当作空气', () => {
  const broken = { id: 'broken', inputs: [{ itemId: 'notARealItem', count: 1 }], output: { itemId: 'wood', count: 1 } };
  const inventory = makeInventory();
  inventory.add('wood', 10);
  const before = JSON.stringify(inventory.serialize());
  const result = craftRecipe(inventory, broken);
  assert.equal(result.ok, false);
  assert.equal(result.reason, CRAFT_ERROR.unknownItem);
  assert.equal(JSON.stringify(inventory.serialize()), before);
});

check('maxCraftableTimes 反映真实上限，且不会越界改库存', () => {
  const inventory = makeInventory();
  inventory.add('deepCore', 2);
  inventory.add('wood', 100);
  const before = JSON.stringify(inventory.serialize());
  assert.equal(maxCraftableTimes(inventory, 'recruitmentOrder'), 2);
  assert.equal(JSON.stringify(inventory.serialize()), before);
  inventory.add('deepCore', 10);
  assert.equal(maxCraftableTimes(inventory, 'recruitmentOrder', { limit: 5 }), 5, '上限参数要生效');
});

check('recipeInputsFor 按次数放大，缺料查询与之一致', () => {
  assert.deepEqual(
    recipeInputsFor(RECRUIT, 2),
    RECRUIT.inputs.map((entry) => ({ itemId: entry.itemId, count: entry.count * 2 }))
  );
  const inventory = makeInventory();
  inventory.add('deepCore', 1);
  inventory.add('wood', 100);
  const missing = missingInputs(inventory, RECRUIT, 2);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].itemId, 'deepCore');
  assert.equal(missing[0].need, 2);
  assert.equal(missing[0].have, 1);
});

check('合成产物是堆叠物时按 stackLimit 合并，不会被当成实例', () => {
  const inventory = makeInventory();
  // 20 张令需要 20 核心 + 400 木材（每张 20）。
  // 第一版这里只给了 200 木材，第 11 次失败其实是"没木材了"，不是堆叠出问题。
  inventory.add('deepCore', 20);
  inventory.add('wood', 200);
  inventory.add('wood', 200);
  assert.equal(inventory.countOf('wood'), 400);
  for (let i = 0; i < 20; i += 1) {
    const result = craftRecipe(inventory, 'recruitmentOrder');
    assert.equal(result.ok, true, `第 ${i + 1} 次合成应当成功（${result.reason}）`);
  }
  assert.equal(inventory.countOf('recruitmentOrder'), 20);
  // 20 张令只需要 1 格（stackLimit 20），不能因为不会合占掉二十格
  const orderSlots = inventory.slots.filter((slot) => slot?.itemId === 'recruitmentOrder').length;
  assert.equal(orderSlots, 1, '同类产物必须合并到一格');
});

check('合成实例类产物（工具）每次发一件新实例，绝不合并', () => {
  const inventory = makeInventory();
  inventory.add('wood', 40);
  inventory.add('stone', 40);
  const first = craftRecipe(inventory, 'axe');
  assert.equal(first.ok, true, first.reason);
  const one = inventory.instancesOf('axe');
  assert.equal(one.length, 1);
  assert.ok(one[0].instanceId, '工具必须有 instanceId');
  assert.equal(inventory.countOf('wood'), 40 - 5, '木斧配方扣 5 木材');
  assert.equal(inventory.countOf('stone'), 40 - 5, '木斧配方扣 5 石料');

  const second = craftRecipe(inventory, 'axe');
  assert.equal(second.ok, true, second.reason);
  const two = inventory.instancesOf('axe');
  assert.equal(two.length, 2, '两把斧头必须是两格，不能按名字合并');
  assert.notEqual(two[0].instanceId, two[1].instanceId, '两把工具必须是两个不同实例');
});

check('实例产物放不下时整笔失败（空格数就是实例类产物的容量）', () => {
  const inventory = makeInventory(1);
  inventory.add('wood', 5);   // 占掉唯一一格
  // 石料放不进来 → 材料不齐
  assert.equal(craftRecipe(inventory, 'axe').reason, CRAFT_ERROR.missingInputs);
  const roomy = makeInventory(2);
  roomy.add('wood', 5);
  roomy.add('stone', 5);
  const result = craftRecipe(roomy, 'axe');
  assert.equal(result.ok, true, '两格刚好放材料，扣完腾出格子后产物放得下');
  assert.equal(roomy.instancesOf('axe').length, 1);
});

// ---- 撤销合成（背包界面里右键）：材料原样退回 ----
//
// 界面上的流程是"点配方 → 扣材料 → 产物跟鼠标 → 右键撤销"，产物全程不进库存，
// 所以这里模拟的是：合成 → 把产物从库存取走（相当于拿到鼠标上）→ 退款。

check('撤销合成：材料原样退回，库存回到点击之前', () => {
  const inventory = makeInventory();
  inventory.add('deepCore', 2);
  inventory.add('wood', 100);
  const before = inventory.countsByItem();

  const crafted = craftRecipe(inventory, 'recruitmentOrder');
  assert.equal(crafted.ok, true, crafted.reason);
  assert.equal(inventory.countOf('deepCore'), 1, '合成先扣掉材料');
  assert.ok(crafted.consumed.length > 0, '合成结果必须带回扣了什么材料，界面才有得退');

  // 界面把产物取到鼠标上
  assert.equal(inventory.remove('recruitmentOrder', 1).ok, true);
  const refunded = refundCraft(inventory, crafted.consumed);
  assert.equal(refunded.ok, true, refunded.reason);
  assert.deepEqual(inventory.countsByItem(), before, '撤销后库存必须与合成之前逐项一致');
});

check('撤销实例类产物（工具）之后同样回到原点', () => {
  const inventory = makeInventory();
  inventory.add('wood', 40);
  inventory.add('stone', 40);
  const before = JSON.stringify(inventory.serialize());

  const crafted = craftRecipe(inventory, 'axe');
  assert.equal(crafted.ok, true, crafted.reason);
  const axe = inventory.instancesOf('axe')[0];
  assert.ok(axe, '产物必须是一件实例');
  assert.equal(inventory.removeInstance(axe.instanceId).ok, true, '界面把产物拿到鼠标上');

  assert.equal(refundCraft(inventory, crafted.consumed).ok, true);
  assert.equal(JSON.stringify(inventory.serialize()), before, '撤销后连格子布局都要和原来一样');
});

check('撤销放不下时整笔失败，库存一个字节都不变', () => {
  // 3 格：合成木斧吃掉 5 木材 + 5 石料并腾空这两格。
  // 之后玩家把三格都顶到堆叠上限塞满，材料就没地方回去了——
  // 这时必须整笔拒绝，不能退一半、更不能把产物也吞掉。
  const inventory = makeInventory(3);
  inventory.add('wood', 5);
  inventory.add('stone', 5);
  const crafted = craftRecipe(inventory, 'axe');
  assert.equal(crafted.ok, true, crafted.reason);
  assert.equal(inventory.removeInstance(inventory.instancesOf('axe')[0].instanceId).ok, true);

  inventory.add('wood', 200);
  inventory.add('wood', 200);
  inventory.add('stone', 200);
  assert.equal(inventory.freeSlots(), 0, '前提：背包已经塞满');
  const before = JSON.stringify(inventory.serialize());

  const refunded = refundCraft(inventory, crafted.consumed);
  assert.equal(refunded.ok, false);
  assert.equal(refunded.reason, CRAFT_ERROR.noSpace);
  assert.equal(JSON.stringify(inventory.serialize()), before, '撤销失败时库存必须一个字节都不变');
});

check('撤销的入参不合法时拒绝，且不动库存', () => {
  const inventory = makeInventory();
  inventory.add('wood', 10);
  const before = JSON.stringify(inventory.serialize());
  assert.equal(refundCraft(inventory, []).ok, false);
  assert.equal(refundCraft(inventory, null).ok, false);
  assert.equal(refundCraft(inventory, [{ itemId: 'notARealItem', count: 1 }]).reason, CRAFT_ERROR.unknownItem);
  assert.equal(refundCraft(null, [{ itemId: 'wood', count: 1 }]).ok, false);
  assert.equal(JSON.stringify(inventory.serialize()), before);
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
