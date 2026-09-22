// 死亡掉落回归测试。
// 计划第 7 节的四条硬要求，全部围绕「物品不能凭空多一份也不能凭空少一份」：
//   1. 死亡结算后原背包不再拥有这些物品（清空式转移，不是复制）
//   2. 实例类物品保持同一个 instanceId 与成长数据
//   3. 重复死亡通知不能重复掉落
//   4. 拾取是归属转移；装不完的部分必须留在掉落物里
import assert from 'node:assert/strict';
import { Inventory } from '../src/systems/Inventory.js';
import {
  DROP_STATE,
  advanceDrop,
  createDrop,
  dropInRange,
  dropIsEmpty,
  dropIsPickable,
  dropTotalCount,
  pickUpDrop,
  planDeathDrop,
  serializeDrop
} from '../src/systems/drops.js';

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

function makePack() {
  const inventory = new Inventory({ id: 'unit', capacity: 4 });
  inventory.add('wood', 60);
  inventory.add('stone', 12);
  inventory.add('pickaxe', 1);
  return inventory;
}

check('死亡掉落是清空式转移：东西进了掉落物，原背包不再拥有', () => {
  const inventory = makePack();
  const before = inventory.totalCount();
  const plan = planDeathDrop(inventory);
  assert.equal(plan.dropped, true);
  assert.equal(inventory.totalCount(), 0, '结算后原背包必须是空的');
  const carried = plan.stacks.reduce((sum, stack) => sum + stack.count, 0);
  assert.equal(carried, before, '掉落总量必须等于原背包总量');
});

check('重复死亡通知不能重复掉落', () => {
  const inventory = makePack();
  const first = planDeathDrop(inventory);
  assert.equal(first.dropped, true);
  const second = planDeathDrop(inventory, { alreadyDropped: true });
  assert.equal(second.dropped, false);
  assert.equal(second.reason, 'already_dropped');
  assert.deepEqual(second.stacks, []);
  // 即使没有外部标记，空背包也不该再产出任何东西
  const third = planDeathDrop(inventory);
  assert.equal(third.dropped, false);
  assert.equal(third.reason, 'empty_inventory');
});

check('实例类物品保持同一个 instanceId 与附加数据', () => {
  const inventory = new Inventory({ id: 'unit', capacity: 2 });
  inventory.add('pickaxe', 1, { data: { growth: 40 } });
  const originalId = inventory.instancesOf('pickaxe')[0].instanceId;
  const plan = planDeathDrop(inventory);
  const picked = plan.stacks.find((stack) => stack.itemId === 'pickaxe');
  assert.equal(picked.instanceId, originalId, '掉落必须带走原实例 ID');
  assert.equal(picked.data.growth, 40, '成长数据必须一起掉落');
});

check('拾取是归属转移，不是再生成一份副本', () => {
  const source = makePack();
  const originalInstanceId = source.instancesOf('pickaxe')[0].instanceId;
  const plan = planDeathDrop(source);
  const drop = createDrop(plan.stacks, { dropId: 'drop-1', x: 0, z: 0 });

  const target = new Inventory({ id: 'picker', capacity: 4 });
  const result = pickUpDrop(drop, target);
  assert.equal(result.ok, true);
  assert.equal(target.countOf('wood'), 60);
  assert.equal(target.countOf('stone'), 12);
  assert.equal(target.instancesOf('pickaxe')[0].instanceId, originalInstanceId, '还是同一件工具');
  assert.equal(dropIsEmpty(drop), true);
  assert.equal(drop.state, DROP_STATE.pickedUp);
  // 全局守恒
  assert.equal(source.totalCount() + target.totalCount() + dropTotalCount(drop), 73);
});

check('装不完的部分留在掉落物里，不会凭空消失', () => {
  const source = new Inventory({ id: 'unit', capacity: 4 });
  source.add('wood', 60);
  const plan = planDeathDrop(source);
  const drop = createDrop(plan.stacks, { dropId: 'drop-2' });

  // 目标只有一格，木材每格上限 200，所以这次能全装下；
  // 换成一格已经被别的堆占满的情况才能制造「装不下」
  const target = new Inventory({ id: 'picker', capacity: 1 });
  target.add('stone', 200);
  const result = pickUpDrop(drop, target);
  assert.equal(result.ok, false, '一点都装不下时应当失败');
  assert.equal(dropTotalCount(drop), 60, '货物必须原样留在掉落物里');
  assert.equal(dropIsPickable(drop), true, '还能再被捡');
});

check('拾取后掉落物不可再拾取', () => {
  const source = new Inventory({ id: 'unit', capacity: 2 });
  source.add('wood', 30);
  const drop = createDrop(planDeathDrop(source).stacks, { dropId: 'drop-3' });
  const target = new Inventory({ id: 'picker', capacity: 2 });
  assert.equal(pickUpDrop(drop, target).ok, true);
  const again = pickUpDrop(drop, target);
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'not_pickable');
  assert.equal(target.countOf('wood'), 30, '不能因为重复拾取而多出木材');
});

check('超出存留时间的掉落物会消失并清空内容', () => {
  const source = new Inventory({ id: 'unit', capacity: 2 });
  source.add('wood', 30);
  const drop = createDrop(planDeathDrop(source).stacks, { dropId: 'drop-4', rules: { lifetimeSeconds: 5 } });
  advanceDrop(drop, 3);
  assert.equal(drop.state, DROP_STATE.onGround);
  assert.equal(dropTotalCount(drop), 30);
  advanceDrop(drop, 3);
  assert.equal(drop.state, DROP_STATE.expired);
  assert.equal(dropTotalCount(drop), 0, '消失后不能还留着货物');
  assert.equal(dropIsPickable(drop), false);
});

check('空背包不产生掉落物', () => {
  const inventory = new Inventory({ id: 'unit', capacity: 2 });
  const plan = planDeathDrop(inventory);
  assert.equal(createDrop(plan.stacks, { dropId: 'drop-5' }), null);
});

check('拾取距离判定用的是掉落物位置', () => {
  const drop = createDrop([{ itemId: 'wood', count: 5 }], { dropId: 'drop-6', x: 10, z: 0 });
  assert.equal(dropInRange(drop, { x: 10.5, z: 0 }), true);
  assert.equal(dropInRange(drop, { x: 20, z: 0 }), false);
});

check('序列化往返保持实例身份与货物数量', () => {
  const source = new Inventory({ id: 'unit', capacity: 3 });
  source.add('pickaxe', 1, { data: { growth: 7 } });
  source.add('wood', 25);
  const drop = createDrop(planDeathDrop(source).stacks, { dropId: 'drop-7', x: 1, z: 2 });
  const raw = JSON.parse(JSON.stringify(serializeDrop(drop)));
  const restoredId = raw.stacks.find((stack) => stack.itemId === 'pickaxe').instanceId;
  assert.equal(restoredId, drop.stacks.find((stack) => stack.itemId === 'pickaxe').instanceId);
  assert.equal(dropTotalCount(raw), 26);
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
