// 背包搬运规则的纯逻辑回归（《我的世界》式拖拽）。
//
// 这一层的全部风险都集中在「物品守恒」上，所以每条断言除了结果对不对，
// 还要检查两个背包里各物品的总量没有变化（交换、合并、失败回滚都不能丢件）。
import assert from 'node:assert/strict';
import { Inventory } from '../src/systems/Inventory.js';
import {
  TRANSFER_ERROR,
  canMergeSlots,
  insertIntoInventory,
  moveSlot,
  moveSlotCount,
  slotIsEmpty
} from '../src/systems/inventoryTransfer.js';

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

/** 两个背包里每种物品的总数，用来断言守恒。 */
function census(...inventories) {
  const counts = {};
  inventories.forEach((inventory) => {
    inventory.slots.forEach((slot) => {
      if (!slot?.itemId) return;
      counts[slot.itemId] = (counts[slot.itemId] ?? 0) + (slot.count ?? 0);
    });
  });
  return counts;
}

function assertConserved(before, after, label) {
  assert.deepEqual(after, before, `${label}：物品必须守恒（前后总量一致）`);
}

// ---- 格子判空 ----

check('空格子判定覆盖 null 与 0 数量', () => {
  assert.equal(slotIsEmpty(null), true);
  assert.equal(slotIsEmpty({ itemId: 'wood', count: 0 }), true);
  assert.equal(slotIsEmpty({ itemId: 'wood', count: 3 }), false);
});

check('实例类物品不能互相合并（符文石/魔力石/武器各有身份）', () => {
  assert.equal(canMergeSlots({ itemId: 'runeStone', count: 1 }, { itemId: 'runeStone', count: 1 }), false);
  assert.equal(canMergeSlots({ itemId: 'manaStone', count: 1 }, { itemId: 'manaStone', count: 1 }), false);
  assert.equal(canMergeSlots({ itemId: 'wood', count: 1 }, { itemId: 'wood', count: 1 }), true);
  assert.equal(canMergeSlots({ itemId: 'wood', count: 1 }, { itemId: 'stone', count: 1 }), false);
});

// ---- 移到指定格子 ----

check('移到空格：整叠搬过去，原格清空', () => {
  const from = new Inventory({ id: 'a', capacity: 3 });
  const to = new Inventory({ id: 'b', capacity: 3 });
  from.add('wood', 40);
  const before = census(from, to);
  const result = moveSlot(from, to, { fromIndex: 0, toIndex: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'move');
  assert.equal(to.slots[1].itemId, 'wood');
  assert.equal(to.slots[1].count, 40);
  assert.equal(from.slots[0], null);
  assertConserved(before, census(from, to), '移到空格');
});

check('移到同类半堆：合并而不是占新格', () => {
  const from = new Inventory({ id: 'a', capacity: 3 });
  const to = new Inventory({ id: 'b', capacity: 3 });
  from.add('wood', 30);
  to.slots[2] = { itemId: 'wood', count: 10 };
  const before = census(from, to);
  const result = moveSlot(from, to, { fromIndex: 0, toIndex: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'merge');
  assert.equal(to.slots[2].count, 40);
  assert.equal(from.slots[0], null);
  assertConserved(before, census(from, to), '同类合并');
});

check('实例类移到空格：instanceId 与 data 原样跟着走', () => {
  const from = new Inventory({ id: 'a', capacity: 3 });
  const to = new Inventory({ id: 'b', capacity: 3 });
  from.slots[0] = { itemId: 'runeStone', instanceId: 'rune-7', count: 1, data: { enchantmentId: 'fire', level: 4 } };
  const result = moveSlot(from, to, { fromIndex: 0, toIndex: 0 });
  assert.equal(result.ok, true);
  assert.equal(to.slots[0].instanceId, 'rune-7');
  assert.equal(to.slots[0].data.level, 4);
  assert.equal(from.slots[0], null);
});

check('移到异类格：交换，两边的东西都还在', () => {
  const from = new Inventory({ id: 'a', capacity: 3 });
  const to = new Inventory({ id: 'b', capacity: 3 });
  from.add('wood', 12);
  to.slots[1] = { itemId: 'stone', count: 5 };
  const before = census(from, to);
  const result = moveSlot(from, to, { fromIndex: 0, toIndex: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'swap');
  assert.equal(to.slots[1].itemId, 'wood');
  assert.equal(from.slots[0].itemId, 'stone');
  assert.equal(from.slots[0].count, 5);
  assertConserved(before, census(from, to), '交换');
});

check('实例类对实例类也是交换，不合并成一件', () => {
  const from = new Inventory({ id: 'a', capacity: 3 });
  const to = new Inventory({ id: 'b', capacity: 3 });
  from.slots[0] = { itemId: 'manaStone', instanceId: 'mana-1', count: 1, data: null };
  to.slots[0] = { itemId: 'manaStone', instanceId: 'mana-2', count: 1, data: null };
  const result = moveSlot(from, to, { fromIndex: 0, toIndex: 0 });
  assert.equal(result.ok, true);
  assert.equal(to.slots[0].instanceId, 'mana-1');
  assert.equal(from.slots[0].instanceId, 'mana-2');
});

// ---- 自动找位置 ----

check('不指定格子：实例类去第一个空格', () => {
  const from = new Inventory({ id: 'a', capacity: 3 });
  const to = new Inventory({ id: 'b', capacity: 3 });
  to.slots[0] = { itemId: 'wood', count: 1 };
  from.slots[0] = { itemId: 'pickaxe', instanceId: 'tool-1', count: 1, data: null };
  const result = moveSlot(from, to, { fromIndex: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.toIndex, 1);
  assert.equal(to.slots[1].instanceId, 'tool-1');
});

check('不指定格子：堆叠物先补半堆，再开新格', () => {
  const from = new Inventory({ id: 'a', capacity: 3 });
  const to = new Inventory({ id: 'b', capacity: 3 });
  to.slots[0] = { itemId: 'wood', count: 190 };
  from.slots[2] = { itemId: 'wood', count: 30 };
  const result = moveSlot(from, to, { fromIndex: 2 });
  assert.equal(result.ok, true);
  // 上限 200：先补 10 进第 0 格，剩下 20 开新格
  assert.equal(to.slots[0].count, 200);
  assert.equal(to.slots[1].count, 20);
  assert.equal(from.slots[2], null);
});

check('装不下时整笔失败，两个背包一个字节都不变', () => {
  const from = new Inventory({ id: 'a', capacity: 2 });
  const to = new Inventory({ id: 'b', capacity: 1 });
  to.slots[0] = { itemId: 'stone', count: 4 };
  from.slots[0] = { itemId: 'pickaxe', instanceId: 'tool-9', count: 1, data: null };
  const beforeFrom = from.snapshot();
  const beforeTo = to.snapshot();
  const result = moveSlot(from, to, { fromIndex: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, TRANSFER_ERROR.noSpace);
  assert.deepEqual(from.snapshot(), beforeFrom, '失败时源背包必须原样');
  assert.deepEqual(to.snapshot(), beforeTo, '失败时目标背包必须原样');
});

check('空源格与非法下标都明确失败', () => {
  const from = new Inventory({ id: 'a', capacity: 2 });
  const to = new Inventory({ id: 'b', capacity: 2 });
  // 空源格：先判"没东西可搬"，这是最常见的一种误点
  assert.equal(moveSlot(from, to, { fromIndex: 0 }).reason, TRANSFER_ERROR.emptySource);
  assert.equal(moveSlot(from, to, { fromIndex: 9 }).reason, TRANSFER_ERROR.invalidIndex);
  // 有东西但目标下标越界：必须是 invalidIndex，而不是静默丢弃
  from.add('wood', 5);
  assert.equal(moveSlot(from, to, { fromIndex: 0, toIndex: 9 }).reason, TRANSFER_ERROR.invalidIndex);
  assert.equal(from.slots[0].count, 5, '非法下标不能让原格少东西');
});

// ---- 右键：拿一半 / 放一个 ----

check('右键放一个：只移动 1 个，剩下的留在原格', () => {
  const from = new Inventory({ id: 'a', capacity: 3 });
  const to = new Inventory({ id: 'b', capacity: 3 });
  from.add('wood', 20);
  const before = census(from, to);
  const result = moveSlotCount(from, to, { fromIndex: 0, toIndex: 0, count: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.moved, 1);
  assert.equal(to.slots[0].count, 1);
  assert.equal(from.slots[0].count, 19);
  assertConserved(before, census(from, to), '放一个');
});

check('右键拿一半：从原格拆出 1 个', () => {
  const from = new Inventory({ id: 'a', capacity: 3 });
  const to = new Inventory({ id: 'b', capacity: 3 });
  from.add('wood', 20);
  const result = moveSlotCount(from, to, { fromIndex: 0, toIndex: 0, count: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.moved, 5);
  assert.equal(to.slots[0].count, 5);
  assert.equal(from.slots[0].count, 15);
});

check('实例类不可拆分：右键退化成整件搬运', () => {
  const from = new Inventory({ id: 'a', capacity: 3 });
  const to = new Inventory({ id: 'b', capacity: 3 });
  from.slots[0] = { itemId: 'manaStone', instanceId: 'mana-3', count: 1, data: null };
  const result = moveSlotCount(from, to, { fromIndex: 0, toIndex: 0, count: 1 });
  assert.equal(result.ok, true);
  assert.equal(to.slots[0].instanceId, 'mana-3');
  assert.equal(from.slots[0], null);
});

// ---- 塞入（合成产物落格 / 拾取） ----

check('塞进指定空格：按堆叠上限放，余量原样返回', () => {
  const inventory = new Inventory({ id: 'a', capacity: 2 });
  const result = insertIntoInventory(inventory, { itemId: 'wood', count: 250 }, { toIndex: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.added, 200);
  assert.equal(result.remainder, 50, '放不下的余量必须返回给调用方，不能被销毁');
  assert.equal(inventory.slots[0].count, 200);
});

check('塞进被占用的异类格：失败且不改动', () => {
  const inventory = new Inventory({ id: 'a', capacity: 2 });
  inventory.slots[0] = { itemId: 'stone', count: 3 };
  const result = insertIntoInventory(inventory, { itemId: 'wood', count: 5 }, { toIndex: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.added, 0);
  assert.equal(result.remainder, 5);
  assert.equal(inventory.slots[0].itemId, 'stone');
});

check('塞进实例：instanceId 与 data 一起落格', () => {
  const inventory = new Inventory({ id: 'a', capacity: 2 });
  const result = insertIntoInventory(
    inventory,
    { itemId: 'runeStone', count: 1, instanceId: 'rune-42', data: { enchantmentId: 'ice', level: 3 } },
    { toIndex: 1 }
  );
  assert.equal(result.ok, true);
  assert.equal(inventory.slots[1].instanceId, 'rune-42');
  assert.equal(inventory.slots[1].data.level, 3);
});

check('不指定格子：自动找空位，装不下返回余量', () => {
  const inventory = new Inventory({ id: 'a', capacity: 1 });
  inventory.slots[0] = { itemId: 'stone', count: 1 };
  const result = insertIntoInventory(inventory, { itemId: 'wood', count: 3 });
  assert.equal(result.ok, false);
  assert.equal(result.remainder, 3, '没有空位时余量必须完整返回');
});

console.log(report.join('\n'));
const failed = report.filter((line) => line.startsWith('FAIL')).length;
console.log(`\n背包搬运：${report.length - failed}/${report.length} 通过`);
