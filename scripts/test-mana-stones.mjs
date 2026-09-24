// 魔力石规则的纯逻辑回归（本轮需求第 2 条）。
//
// 需求原文：「魔力石可以增加单位的最大魔力值，类似于电池。不可堆叠，需要占用多个背包，
// 但效果可以堆叠。」所以四条硬要求：
//   1. 它是**实例**物品：一格一块，绝不合并；
//   2. 放在单位背包里就生效；
//   3. 多块效果**线性叠加**（像电池串联），不是"只算一块"；
//   4. 有效上限必须从**基础**上限现算，反复刷新不能越堆越高。
import assert from 'node:assert/strict';
import { Inventory } from '../src/systems/Inventory.js';
import { ITEM_DEFINITIONS, ITEM_RULES } from '../src/data/gameData.js';
import { itemStacksByMerging } from '../src/systems/items.js';
import {
  MANA_STONE_ITEM_ID,
  effectiveManaCapacity,
  isManaStoneItem,
  manaStoneBonus,
  manaStoneCapacityBonus,
  manaStoneCount,
  manaStoneRules
} from '../src/systems/manaStones.js';

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

function bagWith(...itemIds) {
  const inventory = new Inventory({ id: 'unit', capacity: 16 });
  itemIds.forEach((itemId) => inventory.add(itemId, 1));
  return inventory;
}

check('魔力石是已登记的实例物品，且不可堆叠', () => {
  const definition = ITEM_DEFINITIONS[MANA_STONE_ITEM_ID];
  assert.ok(definition, '魔力石必须出现在 ITEM_DEFINITIONS 里，否则掉落/合成都认不出来');
  assert.equal(definition.kind, 'instance');
  assert.equal(definition.stackLimit, 1);
  assert.equal(itemStacksByMerging(MANA_STONE_ITEM_ID), false, '实例物品绝不合并');
  assert.equal(isManaStoneItem(MANA_STONE_ITEM_ID), true);
  assert.equal(isManaStoneItem('runeStone'), false);
});

check('每块魔力石提供固定的上限加成', () => {
  assert.equal(manaStoneBonus(MANA_STONE_ITEM_ID), 15);
  assert.equal(manaStoneBonus('wood'), 0, '非魔力石不提供魔力加成');
  assert.equal(manaStoneRules().manaBonus, 15);
});

check('两格同步：不可堆叠意味着放两块要占两格', () => {
  const inventory = new Inventory({ id: 'unit', capacity: 4 });
  inventory.add(MANA_STONE_ITEM_ID, 1);
  inventory.add(MANA_STONE_ITEM_ID, 1);
  const filled = inventory.slots.filter((slot) => slot?.itemId === MANA_STONE_ITEM_ID);
  assert.equal(filled.length, 2, '两块魔力石必须占两个格子');
  assert.equal(filled[0].count, 1);
  assert.equal(inventory.usedSlots(), 2);
});

check('加成随数量线性叠加（电池串联）', () => {
  assert.equal(manaStoneCount(bagWith()), 0);
  assert.equal(manaStoneCapacityBonus(bagWith()), 0);
  assert.equal(manaStoneCapacityBonus(bagWith(MANA_STONE_ITEM_ID)), 15);
  assert.equal(manaStoneCapacityBonus(bagWith(MANA_STONE_ITEM_ID, MANA_STONE_ITEM_ID)), 30);
  assert.equal(
    manaStoneCapacityBonus(bagWith(MANA_STONE_ITEM_ID, MANA_STONE_ITEM_ID, MANA_STONE_ITEM_ID)),
    45
  );
});

check('有效上限 = 基础上限 + 魔力石加成', () => {
  assert.equal(effectiveManaCapacity(60, null), 60, '没有背包时就是基础上限');
  assert.equal(effectiveManaCapacity(60, bagWith()), 60);
  assert.equal(effectiveManaCapacity(60, bagWith(MANA_STONE_ITEM_ID)), 75);
  assert.equal(effectiveManaCapacity(60, bagWith(MANA_STONE_ITEM_ID, MANA_STONE_ITEM_ID)), 90);
  assert.equal(effectiveManaCapacity(24, bagWith(MANA_STONE_ITEM_ID)), 39, '设施的基础值同样适用');
});

check('符文石与普通材料都不提供魔力上限', () => {
  const inventory = bagWith('runeStone', 'wood', 'axe');
  assert.equal(manaStoneCount(inventory), 0);
  assert.equal(effectiveManaCapacity(60, inventory), 60);
});

check('反复重算不会把加成越堆越高（基础值必须单独记）', () => {
  const inventory = bagWith(MANA_STONE_ITEM_ID, MANA_STONE_ITEM_ID);
  const base = 60;
  let capacity = effectiveManaCapacity(base, inventory);
  for (let i = 0; i < 5; i += 1) {
    // 模拟 Game.refreshUnitManaCapacity：每次都从 base 现算，而不是拿上一次的结果再加
    capacity = effectiveManaCapacity(base, inventory);
  }
  assert.equal(capacity, 90, '重复刷新必须稳定在 90，不能变成 60+15×N');
});

check('移走魔力石之后加成消失', () => {
  const inventory = bagWith(MANA_STONE_ITEM_ID, MANA_STONE_ITEM_ID);
  assert.equal(effectiveManaCapacity(60, inventory), 90);
  const index = inventory.slots.findIndex((slot) => slot?.itemId === MANA_STONE_ITEM_ID);
  inventory.slots[index] = null;
  assert.equal(effectiveManaCapacity(60, inventory), 75);
});

check('基地背包格数按需求是 48（6 行 × 8 列）', () => {
  assert.equal(ITEM_RULES.baseInventorySlots, 48);
});

check('maxPerUnit 可配置：设上限时只结算到上限为止', () => {
  const rules = manaStoneRules({ maxPerUnit: 2 });
  const inventory = bagWith(MANA_STONE_ITEM_ID, MANA_STONE_ITEM_ID, MANA_STONE_ITEM_ID);
  assert.equal(manaStoneCapacityBonus(inventory, { rules }), 30, '三块石头在 maxPerUnit=2 时只算两块');
  assert.equal(manaStoneCapacityBonus(inventory), 45, '默认不限制数量');
});

console.log(report.join('\n'));
const failed = report.filter((line) => line.startsWith('FAIL')).length;
console.log(`\n魔力石：${report.length - failed}/${report.length} 通过`);
