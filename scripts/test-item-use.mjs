// 快捷栏"用一下"的用途判定（items.itemUseKind）。
//
// 这是快捷栏**唯一**的分发依据：鼠标点一下、按数字键、从槽位拖出去松手，
// 三条路径读的都是它。所以它必须对每一种物品都给出确定的答案——
// 把材料当成"能用"会让玩家按下去什么都不发生（以为界面坏了），
// 把装备当成消耗品会直接把一件武器吃掉。这两类错误都只在真人玩的时候才暴露。
//
// 这里刻意用**规则**去校验（每个类别应有的用途），而不是把物品清单抄一遍：
// 以后新增一栋建筑或一种消耗品，只要数据带上了正确的字段就自动被覆盖到。
import assert from 'node:assert/strict';
import { ITEM_DEFINITIONS } from '../src/data/gameData.js';
import { ITEM_USE, itemIsGivable, itemUseKind } from '../src/systems/items.js';

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

const items = Object.values(ITEM_DEFINITIONS);
const byCategory = (category) => items.filter((item) => item.category === category);
const placeables = items.filter((item) => item.placeable?.unitType);

check('每一种物品都有确定的用途判定（不返回 undefined）', () => {
  assert.ok(items.length > 0);
  items.forEach((item) => {
    const kind = itemUseKind(item.id);
    assert.ok(
      kind === null || Object.values(ITEM_USE).includes(kind),
      `${item.id} 的用途判定落到了预期之外：${String(kind)}`
    );
  });
  assert.equal(itemUseKind('notARealItem'), null, '未定义的物品不能崩，要明确返回 null');
  assert.equal(itemUseKind(null), null);
});

check('建筑 → 进入放置模式', () => {
  assert.ok(placeables.length >= 7, `可放置建筑应当有一批（实际 ${placeables.length}）`);
  placeables.forEach((item) => {
    assert.equal(itemUseKind(item.id), ITEM_USE.place, `${item.id} 是建筑，必须走放置`);
  });
  assert.equal(itemUseKind('furnace'), ITEM_USE.place);
  assert.equal(itemUseKind('manaFurnace'), ITEM_USE.place);
});

check('消耗品 → 直接使用', () => {
  const consumables = byCategory('consumable');
  assert.ok(consumables.length > 0, '至少要有招募令这一种消耗品');
  consumables.forEach((item) => {
    assert.equal(itemUseKind(item.id), ITEM_USE.consume, `${item.id} 是消耗品，必须能直接用掉`);
  });
  assert.equal(itemUseKind('recruitmentOrder'), ITEM_USE.consume);
});

check('装备（工具 / 武器 / 符文石 / 魔力石）→ 交给单位', () => {
  const equipments = items.filter((item) => itemIsGivable(item.id));
  assert.ok(equipments.length > 0);
  equipments.forEach((item) => {
    assert.equal(itemUseKind(item.id), ITEM_USE.give, `${item.id} 能交给单位，用法就应当是"交出"`);
  });
  ['axe', 'pickaxe', 'steelSword', 'runeStone', 'manaStone'].forEach((itemId) => {
    assert.equal(itemUseKind(itemId), ITEM_USE.give, `${itemId} 应当交给单位`);
  });
});

check('材料与资源 → 没有"用"这个动作（但照样能放进快捷栏）', () => {
  [...byCategory('resource'), ...byCategory('material')].forEach((item) => {
    assert.equal(itemUseKind(item.id), null, `${item.id} 是材料，不该有直接使用`);
  });
  ['wood', 'stone', 'deepCore', 'food', 'sapling'].forEach((itemId) => {
    assert.equal(itemUseKind(itemId), null, `${itemId} 不该被判成可用`);
  });
});

check('放置与交给单位互斥：不能有一件东西两种用法', () => {
  placeables.forEach((item) => {
    assert.equal(itemIsGivable(item.id), false, `${item.id} 是建筑，不该同时能"交给单位"`);
  });
  items.forEach((item) => {
    if (!item.placeable?.unitType) return;
    assert.notEqual(itemUseKind(item.id), ITEM_USE.give);
  });
});

check('三种用途的覆盖与物品类别完全对应（不重不漏）', () => {
  const expected = new Map();
  items.forEach((item) => {
    if (item.placeable?.unitType) expected.set(item.id, ITEM_USE.place);
    else if (item.category === 'consumable') expected.set(item.id, ITEM_USE.consume);
    else if (itemIsGivable(item.id)) expected.set(item.id, ITEM_USE.give);
    else expected.set(item.id, null);
  });
  items.forEach((item) => {
    assert.equal(itemUseKind(item.id), expected.get(item.id), `${item.id} 的用途与类别不一致`);
  });
  const usable = [...expected.values()].filter(Boolean).length;
  assert.ok(usable > 0, '至少要有一些能用的东西，否则快捷栏没有意义');
  // 材料占多数是正常的：快捷栏是容器，能装不等于能用。
  assert.ok(usable < items.length, '不该每种东西都能"用"');
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
