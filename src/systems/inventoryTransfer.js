// 背包之间搬运物品的纯逻辑（Minecraft 式拖拽的规则层）。
//
// 为什么单独一层：搬运同时涉及四条容易写错的规则——
//   1. 堆叠类物品可以并进已有的半堆，实例类（符文石、魔力石、武器）永远一格一件；
//   2. 目标格子被占用时"同类且没满 → 合并，否则 → 交换"，不能把原来那件丢掉；
//   3. 目标是空格时按物品自己的堆叠上限放，超出的部分留在原格（不许凭空多出来）；
//   4. 任何一步失败都必须保持两个背包与操作前完全一致。
//
// 和 resources.js / items.js / crafting.js 一样刻意不依赖 THREE / DOM / Game：
// 物品守恒必须能单独断言。
import { itemStackLimit, itemStacksByMerging } from './items.js';

export const TRANSFER_ERROR = {
  none: 'none',
  unknownItem: 'unknown_item',
  emptySource: 'empty_source',
  noSpace: 'no_space',
  invalidIndex: 'invalid_index'
};

export const TRANSFER_ERROR_LABELS = {
  [TRANSFER_ERROR.unknownItem]: '没有这种物品',
  [TRANSFER_ERROR.emptySource]: '原格子是空的',
  [TRANSFER_ERROR.noSpace]: '目标背包没有空位',
  [TRANSFER_ERROR.invalidIndex]: '格子编号不合法'
};

export function slotIsEmpty(slot) {
  return !slot?.itemId || Math.max(0, Number(slot.count) || 0) <= 0;
}

function cloneSlot(slot) {
  if (!slot) return null;
  return { ...slot, data: slot.data ? { ...slot.data } : null };
}

function sameKind(a, b) {
  return Boolean(a?.itemId) && a.itemId === b?.itemId;
}

/**
 * 两个格子是否属于同一种"可以并堆"的东西。
 * 实例类即使 itemId 相同也不能并——它们各自带着耐久/等级/成长数据。
 */
export function canMergeSlots(a, b) {
  if (slotIsEmpty(a) || slotIsEmpty(b)) return false;
  if (!sameKind(a, b)) return false;
  return itemStacksByMerging(a.itemId);
}

/** 搬运一格。`toIndex` 为 null 时自动找位置（先填半堆，再找空格）。 */
export function moveSlot(from, to, { fromIndex, toIndex = null } = {}) {
  const fail = (reason) => ({
    ok: false,
    reason,
    moved: 0,
    mode: 'none',
    itemId: null,
    fromIndex,
    toIndex: null
  });
  if (!from?.slots || !to?.slots) return fail(TRANSFER_ERROR.invalidIndex);
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= from.slots.length) {
    return fail(TRANSFER_ERROR.invalidIndex);
  }
  const source = from.slots[fromIndex] ?? null;
  if (slotIsEmpty(source)) return fail(TRANSFER_ERROR.emptySource);

  if (toIndex != null) {
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= to.slots.length) {
      return fail(TRANSFER_ERROR.invalidIndex);
    }
    if (from === to && toIndex === fromIndex) {
      return { ok: true, reason: TRANSFER_ERROR.none, moved: 0, mode: 'none', itemId: source.itemId, fromIndex, toIndex };
    }
    return placeAt(from, fromIndex, to, toIndex);
  }
  return placeAuto(from, fromIndex, to);
}

/** 指定目标格子：空 → 放入；同类未满 → 合并；否则 → 交换。 */
function placeAt(from, fromIndex, to, toIndex) {
  const source = from.slots[fromIndex];
  const target = to.slots[toIndex] ?? null;
  const base = { reason: TRANSFER_ERROR.none, itemId: source.itemId, fromIndex, toIndex };

  if (slotIsEmpty(target)) {
    const limit = itemStacksByMerging(source.itemId) ? itemStackLimit(source.itemId) : 1;
    const moved = Math.min(Math.max(1, Math.floor(source.count ?? 1)), limit);
    const remainder = Math.max(0, (source.count ?? 1) - moved);
    const placed = cloneSlot(source);
    placed.count = moved;
    to.slots[toIndex] = placed;
    if (remainder > 0) {
      // 堆叠上限比这一堆还小：余量留在原格，不去别处，避免"搬一格变成搬两格"。
      from.slots[fromIndex] = { ...source, count: remainder };
    } else {
      from.slots[fromIndex] = null;
    }
    return { ok: true, ...base, moved, mode: 'move' };
  }

  if (canMergeSlots(source, target)) {
    const limit = itemStackLimit(target.itemId);
    const room = Math.max(0, limit - (target.count ?? 0));
    if (room > 0) {
      const moved = Math.min(room, Math.max(1, Math.floor(source.count ?? 1)));
      const remainder = Math.max(0, (source.count ?? 1) - moved);
      target.count = (target.count ?? 0) + moved;
      if (remainder > 0) {
        from.slots[fromIndex] = { ...source, count: remainder };
      } else {
        from.slots[fromIndex] = null;
      }
      return { ok: true, ...base, moved, mode: 'merge' };
    }
  }

  // 交换：两边的实例身份与数据都跟着走，不会丢成长数据。
  const movedSource = cloneSlot(source);
  to.slots[toIndex] = movedSource;
  from.slots[fromIndex] = cloneSlot(target);
  return { ok: true, ...base, moved: movedSource.count ?? 1, mode: 'swap' };
}

/** 未指定目标格子：先并入同类半堆，再找空格。 */
function placeAuto(from, fromIndex, to) {
  const source = from.slots[fromIndex];
  const base = { reason: TRANSFER_ERROR.none, itemId: source.itemId, fromIndex };
  const stackable = itemStacksByMerging(source.itemId);

  if (stackable) {
    const limit = itemStackLimit(source.itemId);
    let remaining = Math.max(1, Math.floor(source.count ?? 1));
    for (let i = 0; i < to.slots.length && remaining > 0; i += 1) {
      if (from === to && i === fromIndex) continue;
      const slot = to.slots[i];
      if (!slot || slot.itemId !== source.itemId) continue;
      const room = Math.max(0, limit - (slot.count ?? 0));
      if (room <= 0) continue;
      const moved = Math.min(room, remaining);
      slot.count = (slot.count ?? 0) + moved;
      remaining -= moved;
    }
    for (let i = 0; i < to.slots.length && remaining > 0; i += 1) {
      if (from === to && i === fromIndex) continue;
      if (!slotIsEmpty(to.slots[i])) continue;
      const moved = Math.min(limit, remaining);
      const placed = cloneSlot(source);
      placed.count = moved;
      to.slots[i] = placed;
      remaining -= moved;
    }
    if (remaining === Math.max(1, Math.floor(source.count ?? 1))) {
      return { ok: false, ...base, moved: 0, mode: 'none', toIndex: null, reason: TRANSFER_ERROR.noSpace };
    }
    if (remaining > 0) {
      from.slots[fromIndex] = { ...source, count: remaining };
    } else {
      from.slots[fromIndex] = null;
    }
    return { ok: true, ...base, moved: (source.count ?? 1) - remaining, mode: 'move', toIndex: null };
  }

  const free = to.slots.findIndex((slot, index) => !(from === to && index === fromIndex) && slotIsEmpty(slot));
  if (free < 0) {
    return { ok: false, ...base, moved: 0, mode: 'none', toIndex: null, reason: TRANSFER_ERROR.noSpace };
  }
  to.slots[free] = cloneSlot(source);
  from.slots[fromIndex] = null;
  return { ok: true, ...base, moved: source.count ?? 1, mode: 'move', toIndex: free };
}

/**
 * 从一堆里拿 `count` 个放到目标格子（右键拖拽"放一个"）。
 * 目标必须是空格或同类未满；装不下的部分留在原格。
 */
export function moveSlotCount(from, to, { fromIndex, toIndex = null, count = 1 } = {}) {
  if (!from?.slots || !to?.slots) {
    return { ok: false, reason: TRANSFER_ERROR.invalidIndex, moved: 0, mode: 'none', itemId: null, fromIndex, toIndex };
  }
  const source = from.slots?.[fromIndex] ?? null;
  if (slotIsEmpty(source)) {
    return { ok: false, reason: TRANSFER_ERROR.emptySource, moved: 0, mode: 'none', itemId: null, fromIndex, toIndex };
  }
  const wanted = Math.max(1, Math.floor(Number(count) || 1));
  if (!itemStacksByMerging(source.itemId)) {
    // 实例类不可拆分：退化成整件搬运
    return moveSlot(from, to, { fromIndex, toIndex });
  }
  const limit = itemStackLimit(source.itemId);
  const targetIndex = toIndex ?? to.slots.findIndex(
    (slot, index) => !(from === to && index === fromIndex) && (slotIsEmpty(slot) || (slot.itemId === source.itemId && (slot.count ?? 0) < limit))
  );
  if (targetIndex == null || targetIndex < 0) {
    return { ok: false, reason: TRANSFER_ERROR.noSpace, moved: 0, mode: 'none', itemId: source.itemId, fromIndex, toIndex: null };
  }
  if (from === to && targetIndex === fromIndex) {
    return { ok: true, reason: TRANSFER_ERROR.none, moved: 0, mode: 'none', itemId: source.itemId, fromIndex, toIndex: targetIndex };
  }
  const target = to.slots[targetIndex] ?? null;
  const room = slotIsEmpty(target)
    ? limit
    : (canMergeSlots(source, target) ? Math.max(0, limit - (target.count ?? 0)) : 0);
  const moved = Math.min(wanted, room, Math.max(1, Math.floor(source.count ?? 1)));
  if (moved <= 0) {
    return { ok: false, reason: TRANSFER_ERROR.noSpace, moved: 0, mode: 'none', itemId: source.itemId, fromIndex, toIndex: targetIndex };
  }
  if (slotIsEmpty(target)) {
    const placed = cloneSlot(source);
    placed.count = moved;
    to.slots[targetIndex] = placed;
  } else {
    target.count = (target.count ?? 0) + moved;
  }
  const remainder = Math.max(0, (source.count ?? 1) - moved);
  from.slots[fromIndex] = remainder > 0 ? { ...source, count: remainder } : null;
  return { ok: true, reason: TRANSFER_ERROR.none, moved, mode: 'move', itemId: source.itemId, fromIndex, toIndex: targetIndex };
}

/**
 * 从别处"塞进"某个背包（合成产物跟随鼠标后落到空格、拾取掉落物）。
 * 返回 `{ ok, added, remainder }`，余量必须由调用方保留，不许销毁。
 */
export function insertIntoInventory(inventory, stack, { toIndex = null } = {}) {
  const itemId = stack?.itemId ?? null;
  const count = Math.max(0, Math.floor(Number(stack?.count) || 0));
  if (!itemId || count <= 0) return { ok: false, added: 0, remainder: count, reason: TRANSFER_ERROR.unknownItem };
  if (!inventory?.slots) return { ok: false, added: 0, remainder: count, reason: TRANSFER_ERROR.noSpace };

  if (toIndex != null) {
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= inventory.slots.length) {
      return { ok: false, added: 0, remainder: count, reason: TRANSFER_ERROR.invalidIndex };
    }
    const target = inventory.slots[toIndex] ?? null;
    const limit = itemStacksByMerging(itemId) ? itemStackLimit(itemId) : 1;
    const room = slotIsEmpty(target)
      ? limit
      : (target.itemId === itemId && itemStacksByMerging(itemId) ? Math.max(0, limit - (target.count ?? 0)) : 0);
    const added = Math.min(room, count);
    if (added <= 0) return { ok: false, added: 0, remainder: count, reason: TRANSFER_ERROR.noSpace };
    if (slotIsEmpty(target)) {
      inventory.slots[toIndex] = {
        itemId,
        count: added,
        instanceId: stack.instanceId ?? null,
        data: stack.data ? { ...stack.data } : null
      };
    } else {
      target.count = (target.count ?? 0) + added;
    }
    return { ok: true, added, remainder: count - added, reason: TRANSFER_ERROR.none };
  }

  const result = inventory.add(itemId, count, {
    allowPartial: true,
    instanceIds: stack.instanceId ? [stack.instanceId] : null,
    data: stack.data ?? null
  });
  return {
    ok: (result?.added ?? 0) > 0,
    added: result?.added ?? 0,
    remainder: count - (result?.added ?? 0),
    reason: (result?.added ?? 0) > 0 ? TRANSFER_ERROR.none : (result?.error ?? TRANSFER_ERROR.noSpace)
  };
}
