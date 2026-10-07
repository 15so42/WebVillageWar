// 死亡掉落与拾取的纯逻辑（计划第 7 节）。
//
// 这一节的全部要求都围绕一件事：**物品不能凭空多一份，也不能凭空少一份**。
//   - 死亡结算后原背包不再拥有这些物品；
//   - 掉落的是原物品及数量，附魔石保持原实例 ID 与成长；
//   - 拾取是位置/归属转移，不是再生成一份副本；
//   - 单位重复死亡通知、对象回收、重生或加载都不能重复掉落。
//
// 所以这里不碰 THREE / DOM / Game：守恒与幂等必须能单独断言。
import { itemStacksByMerging } from './items.js';

export const DROP_STATE = {
  onGround: 'on_ground',
  pickedUp: 'picked_up',
  expired: 'expired'
};

export const DROP_RULES = {
  // 掉落物在地面上的存留时间；0 表示不自动消失
  lifetimeSeconds: 180,
  // 拾取判定距离
  pickUpRange: 2.4
};

export function dropRules(overrides = {}) {
  return { ...DROP_RULES, ...(overrides ?? {}) };
}

// 从背包里结算一次死亡掉落。
//
// 关键点：这是**清空式转移**——返回的 stacks 是原物（保持 instanceId 与 data），
// 同时把源背包对应格子清空。调用方不需要、也不应该再复制一份。
// alreadyDropped 用来挡住重复死亡通知：同一个单位死两次只能掉一次。
export function planDeathDrop(inventory, { dropId = null, alreadyDropped = false } = {}) {
  if (!inventory) return { dropped: false, reason: 'no_inventory', stacks: [] };
  if (alreadyDropped) return { dropped: false, reason: 'already_dropped', stacks: [] };
  const stacks = [];
  inventory.slots.forEach((slot, index) => {
    if (!slot || !slot.itemId) return;
    stacks.push({
      itemId: slot.itemId,
      count: slot.count,
      // 实例类物品的 ID 与附加数据必须原样带走
      instanceId: slot.instanceId ?? null,
      data: slot.data ? { ...slot.data } : null,
      fromSlot: index
    });
    inventory.slots[index] = null;
  });
  if (!stacks.length) return { dropped: false, reason: 'empty_inventory', stacks: [] };
  return { dropped: true, reason: 'none', dropId, stacks };
}

// 打包成一个地面掉落物。多个格子合成一个遗物包，避免场景里撒一地。
export function createDrop(nodes, { dropId, x = 0, z = 0, ownerId = null, rules = DROP_RULES } = {}) {
  const resolved = dropRules(rules);
  const stacks = (nodes ?? []).filter((node) => node && node.itemId && node.count > 0);
  if (!stacks.length) return null;
  return {
    id: dropId,
    x,
    z,
    ownerId,
    state: DROP_STATE.onGround,
    remainingSeconds: resolved.lifetimeSeconds,
    stacks: stacks.map((node) => ({ ...node }))
  };
}

export function dropTotalCount(drop) {
  return (drop?.stacks ?? []).reduce((sum, stack) => sum + Math.max(0, stack.count ?? 0), 0);
}

export function dropIsEmpty(drop) {
  return dropTotalCount(drop) <= 0;
}

export function dropIsPickable(drop) {
  return Boolean(drop) && drop.state === DROP_STATE.onGround && !dropIsEmpty(drop);
}

/** 怪物死亡掉落的魔石。玩家单位和建筑不掉。体型越大掉得越多。 */
export function magicStoneDropFor(unit) {
  if (!unit || unit.isBuilding === true || unit.team === 'player') return null;
  const hostile = unit.team === 'enemy' || unit.isWildlife === true;
  if (!hostile) return null;
  const health = Number(unit.definition?.maxHealth ?? unit.maxHealth) || 0;
  const count = health >= 80 ? 3 : health >= 40 ? 2 : 1;
  return { itemId: 'magicStone', count };
}

export function dropInRange(drop, point, rules = DROP_RULES) {
  if (!drop || !point) return false;
  const range = dropRules(rules).pickUpRange;
  return Math.hypot((drop.x ?? 0) - (point.x ?? 0), (drop.z ?? 0) - (point.z ?? 0)) <= range;
}

// 推进存留时间。到点后标记为已消失，并把剩余内容一并清掉——
// 不然「已经消失的掉落物」还会留在列表里被重复处理。
export function advanceDrop(drop, dt) {
  if (!drop || drop.state !== DROP_STATE.onGround) return drop;
  if (!Number.isFinite(drop.remainingSeconds) || drop.remainingSeconds <= 0) return drop;
  drop.remainingSeconds = Math.max(0, drop.remainingSeconds - Math.max(0, dt));
  if (drop.remainingSeconds <= 0) {
    drop.state = DROP_STATE.expired;
    drop.stacks = [];
  }
  return drop;
}

// 拾取：把掉落物里的东西搬进背包。
//
// 沿用库存那套「能装多少装多少 + 返回余量」的语义：
// 装不完的部分**留在掉落物里**，绝不凭空消失；装完之后掉落物即消失。
// 实例类物品走 instanceIds 传下去，保证拾取的是同一件而不是新造一件。
export function pickUpDrop(drop, inventory) {
  if (!dropIsPickable(drop)) return { ok: false, taken: 0, reason: 'not_pickable' };
  if (!inventory) return { ok: false, taken: 0, reason: 'no_inventory' };
  let taken = 0;
  const leftovers = [];
  drop.stacks.forEach((stack) => {
    const count = Math.max(0, stack.count ?? 0);
    if (count <= 0) return;
    const options = { allowPartial: true };
    if (!itemStacksByMerging(stack.itemId)) {
      options.instanceIds = [stack.instanceId];
      options.data = stack.data ?? null;
    }
    const result = inventory.add(stack.itemId, count, options);
    const accepted = Math.max(0, result?.added ?? 0);
    taken += accepted;
    const remainder = count - accepted;
    if (remainder > 0) leftovers.push({ ...stack, count: remainder });
  });
  drop.stacks = leftovers;
  if (dropIsEmpty(drop)) drop.state = DROP_STATE.pickedUp;
  return { ok: taken > 0, taken, reason: taken > 0 ? 'none' : 'no_space' };
}

export function serializeDrop(drop) {
  return {
    id: drop.id,
    x: drop.x,
    z: drop.z,
    ownerId: drop.ownerId ?? null,
    state: drop.state,
    remainingSeconds: drop.remainingSeconds ?? 0,
    stacks: (drop.stacks ?? []).map((stack) => ({
      itemId: stack.itemId,
      count: stack.count,
      instanceId: stack.instanceId ?? null,
      data: stack.data ? { ...stack.data } : null
    }))
  };
}

export function normalizeDrop(raw) {
  if (!raw || !raw.id) return null;
  return {
    id: raw.id,
    x: Number(raw.x) || 0,
    z: Number(raw.z) || 0,
    ownerId: raw.ownerId ?? null,
    state: Object.values(DROP_STATE).includes(raw.state) ? raw.state : DROP_STATE.onGround,
    remainingSeconds: Number.isFinite(raw.remainingSeconds) ? raw.remainingSeconds : 0,
    stacks: (raw.stacks ?? [])
      .filter((stack) => stack?.itemId && stack.count > 0)
      .map((stack) => ({
        itemId: stack.itemId,
        count: stack.count,
        instanceId: stack.instanceId ?? null,
        data: stack.data ? { ...stack.data } : null
      }))
  };
}
