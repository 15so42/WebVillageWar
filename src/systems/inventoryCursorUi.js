// 背包 / 建筑面板共用的「手上那一叠」DOM 幽灵与 MC 式点格逻辑。
import { itemStackLimit, itemStacksByMerging } from './items.js';
import { itemArtForSlot } from './itemArt.js';
import { RUNE_STONE_ITEM_ID } from './runeStones.js';

export function createInventoryCursorState() {
  return {
    cursor: null,
    cursorGhost: null,
    lastPointerX: null,
    lastPointerY: null
  };
}

export function pickUpInventorySlot(state, container, index, count) {
  const slot = container.slots[index];
  if (!slot?.itemId) return false;
  const take = Math.max(1, Math.min(Math.floor(count) || 1, slot.count ?? 1));
  state.cursor = {
    itemId: slot.itemId,
    count: take,
    instanceId: slot.instanceId ?? null,
    data: slot.data ? { ...slot.data } : null,
    from: { inventory: container, index, containerKey: null }
  };
  if (take >= (slot.count ?? 1)) {
    container.slots[index] = null;
  } else {
    slot.count = (slot.count ?? 1) - take;
  }
  return true;
}

export function handleInventorySlotClick(state, container, index, { right = false } = {}) {
  if (!container) return;
  const slot = container.slots[index] ?? null;

  if (!state.cursor) {
    if (!slot?.itemId) return;
    const take = right && itemStacksByMerging(slot.itemId)
      ? Math.max(1, Math.floor((slot.count ?? 1) / 2))
      : (slot.count ?? 1);
    pickUpInventorySlot(state, container, index, take);
    return;
  }

  if (!slot?.itemId) {
    if (right) placeOneCursorAt(state, container, index);
    else placeCursorAt(state, container, index);
    return;
  }

  const mergeable = slot.itemId === state.cursor.itemId && itemStacksByMerging(slot.itemId);
  if (right) {
    if (mergeable) {
      const limit = itemStackLimit(slot.itemId);
      if ((slot.count ?? 0) < limit) {
        slot.count = (slot.count ?? 0) + 1;
        state.cursor.count -= 1;
        if (state.cursor.count <= 0) state.cursor = null;
        return;
      }
    }
    swapCursorWith(state, container, index);
    return;
  }
  if (mergeable) {
    const limit = itemStackLimit(slot.itemId);
    const room = Math.max(0, limit - (slot.count ?? 0));
    const moved = Math.min(room, state.cursor.count);
    if (moved > 0) {
      slot.count = (slot.count ?? 0) + moved;
      state.cursor.count -= moved;
      if (state.cursor.count <= 0) state.cursor = null;
      return;
    }
  }
  swapCursorWith(state, container, index);
}

function placeCursorAt(state, container, index) {
  const cursor = state.cursor;
  if (!cursor) return;
  container.slots[index] = {
    itemId: cursor.itemId,
    count: cursor.count,
    instanceId: cursor.instanceId ?? undefined,
    data: cursor.data ? { ...cursor.data } : null
  };
  if (container.slots[index].instanceId === undefined) delete container.slots[index].instanceId;
  state.cursor = null;
}

function placeOneCursorAt(state, container, index) {
  const cursor = state.cursor;
  if (!cursor) return;
  if (!itemStacksByMerging(cursor.itemId) || (cursor.count ?? 1) <= 1) {
    placeCursorAt(state, container, index);
    return;
  }
  container.slots[index] = {
    itemId: cursor.itemId,
    count: 1,
    data: cursor.data ? { ...cursor.data } : null
  };
  cursor.count -= 1;
}

function swapCursorWith(state, container, index) {
  const cursor = state.cursor;
  if (!cursor) return;
  const target = container.slots[index] ?? null;
  container.slots[index] = {
    itemId: cursor.itemId,
    count: cursor.count,
    data: cursor.data ? { ...cursor.data } : null
  };
  if (cursor.instanceId != null) container.slots[index].instanceId = cursor.instanceId;
  if (target?.itemId) {
    state.cursor = {
      itemId: target.itemId,
      count: target.count ?? 1,
      instanceId: target.instanceId ?? null,
      data: target.data ? { ...target.data } : null,
      from: cursor.from
    };
  } else {
    state.cursor = null;
  }
}

export function returnInventoryCursor(state, { insertIntoInventory, fallbackInventories = [] } = {}) {
  const cursor = state.cursor;
  if (!cursor) {
    removeInventoryCursorGhost(state);
    return false;
  }
  const stack = {
    itemId: cursor.itemId,
    count: cursor.count,
    instanceId: cursor.instanceId ?? null,
    data: cursor.data ? { ...cursor.data } : null
  };
  const from = cursor.from ?? null;
  let remaining = stack.count;

  if (from?.inventory?.slots && Number.isInteger(from.index) && !from.inventory.slots[from.index]) {
    const result = insertIntoInventory(from.inventory, stack, { toIndex: from.index });
    remaining = result.remainder;
    if (remaining <= 0) {
      state.cursor = null;
      removeInventoryCursorGhost(state);
      return true;
    }
  }

  const targets = [from?.inventory, ...fallbackInventories].filter(Boolean);
  for (const target of targets) {
    if (remaining <= 0) break;
    const result = insertIntoInventory(target, { ...stack, count: remaining });
    remaining = result.remainder;
  }

  if (remaining <= 0) {
    state.cursor = null;
    removeInventoryCursorGhost(state);
    return true;
  }
  state.cursor = { ...cursor, count: remaining };
  updateInventoryCursorGhost(state);
  return false;
}

export function updateInventoryCursorGhost(state) {
  if (!state.cursor) {
    removeInventoryCursorGhost(state);
    return null;
  }
  if (typeof document === 'undefined') return null;
  if (!state.cursorGhost) {
    const ghost = document.createElement('div');
    ghost.className = 'backpack-cursor-ghost';
    ghost.dataset.inventoryCursorGhost = 'true';
    document.body.appendChild(ghost);
    state.cursorGhost = ghost;
  }
  state.cursorGhost.innerHTML = itemArtForSlot({
    itemId: state.cursor.itemId,
    data: state.cursor.data
  });
  if (state.cursor.count > 1) {
    const count = document.createElement('span');
    count.className = 'backpack-cursor-count';
    count.textContent = String(state.cursor.count);
    state.cursorGhost.appendChild(count);
  }
  if (state.cursor.itemId === RUNE_STONE_ITEM_ID) {
    const level = document.createElement('span');
    level.className = 'backpack-cursor-level';
    level.textContent = String(Math.max(1, Math.floor(Number(state.cursor.data?.level) || 1)));
    state.cursorGhost.appendChild(level);
  }
  syncInventoryCursorGhostPosition(state);
  return state.cursorGhost;
}

export function syncInventoryCursorGhostPosition(state, clientX, clientY) {
  if (Number.isFinite(clientX)) state.lastPointerX = clientX;
  if (Number.isFinite(clientY)) state.lastPointerY = clientY;
  if (!state.cursor && !state.cursorGhost) return;
  if (state.cursor && !state.cursorGhost) {
    updateInventoryCursorGhost(state);
  }
  if (!state.cursorGhost) return;
  const x = state.lastPointerX ?? window.innerWidth * 0.5;
  const y = state.lastPointerY ?? window.innerHeight * 0.5;
  state.cursorGhost.style.left = `${x}px`;
  state.cursorGhost.style.top = `${y}px`;
}

export function removeInventoryCursorGhost(state) {
  state.cursorGhost?.remove();
  state.cursorGhost = null;
}
