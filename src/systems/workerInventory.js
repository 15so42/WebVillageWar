// 木傀儡背包分区：前 N 格为工具区，不参与存放/卸货/采集落点；其余为物资区。
import { INVENTORY_ERROR } from './Inventory.js';
import { ITEM_DEFINITIONS, ITEM_RULES } from '../data/gameData.js';
import {
  isKnownItem,
  itemStackLimit,
  itemStacksByMerging,
  nextItemInstanceId,
  slotDurability
} from './items.js';
import { isPuppetWeaponItem } from './puppetArms.js';
import { chestAcceptsItem } from './workTasks.js';

export function workerToolZoneSlots(rules = ITEM_RULES) {
  return Math.max(0, Math.min(rules.workerInventorySlots ?? 16, rules.workerToolZoneSlots ?? 12));
}

export function workerCargoSlotStart(rules = ITEM_RULES) {
  return workerToolZoneSlots(rules);
}

export function workerCargoSlotCount(inventory, rules = ITEM_RULES) {
  const cap = inventory?.capacity ?? rules.workerInventorySlots ?? 16;
  return Math.max(0, cap - workerToolZoneSlots(rules));
}

export function isWorkerToolSlotIndex(index, rules = ITEM_RULES) {
  return index < workerToolZoneSlots(rules);
}

export function isWorkerInventory(inventory) {
  return Boolean(inventory?.id && String(inventory.id).startsWith('worker:'));
}

export function workerCargoUsedSlots(inventory, rules = ITEM_RULES) {
  if (!inventory?.slots) return 0;
  const start = workerCargoSlotStart(rules);
  let used = 0;
  for (let i = start; i < inventory.slots.length; i += 1) {
    if (inventory.slots[i]) used += 1;
  }
  return used;
}

export function canAcceptInWorkerCargo(inventory, itemId, count, rules = ITEM_RULES) {
  const wanted = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  if (!inventory || !isKnownItem(itemId) || wanted <= 0) return 0;
  const start = workerCargoSlotStart(rules);
  const end = inventory.capacity ?? inventory.slots.length;
  if (!itemStacksByMerging(itemId)) {
    let free = 0;
    for (let i = start; i < end; i += 1) {
      if (!inventory.slots[i]) free += 1;
    }
    return Math.min(wanted, free);
  }
  const limit = itemStackLimit(itemId);
  let room = 0;
  for (let i = start; i < end; i += 1) {
    const slot = inventory.slots[i];
    if (!slot || slot.itemId !== itemId) continue;
    room += Math.max(0, limit - slot.count);
  }
  let freeSlots = 0;
  for (let i = start; i < end; i += 1) {
    if (!inventory.slots[i]) freeSlots += 1;
  }
  room += freeSlots * limit;
  return Math.min(wanted, room);
}

function mergeStackInRange(inventory, itemId, count, start, end) {
  const limit = itemStackLimit(itemId);
  let remaining = count;
  for (let i = start; i < end && remaining > 0; i += 1) {
    const slot = inventory.slots[i];
    if (!slot || slot.itemId !== itemId || slot.count >= limit) continue;
    const room = Math.min(limit - slot.count, remaining);
    slot.count += room;
    remaining -= room;
  }
  for (let i = start; i < end && remaining > 0; i += 1) {
    if (inventory.slots[i]) continue;
    const room = Math.min(limit, remaining);
    inventory.slots[i] = { itemId, count: room };
    remaining -= room;
  }
  return count - remaining;
}

function placeInstancesInRange(inventory, itemId, count, start, end, instanceIds = null, data = null) {
  let placed = 0;
  for (let i = start; i < end && placed < count; i += 1) {
    if (inventory.slots[i]) continue;
    const provided = Array.isArray(instanceIds) ? instanceIds[placed] : null;
    inventory.slots[i] = {
      itemId,
      instanceId: provided ?? nextItemInstanceId(itemId),
      count: 1,
      data: data ? { ...data } : null
    };
    placed += 1;
  }
  return placed;
}

export function addToWorkerCargo(inventory, itemId, count, options = {}, rules = ITEM_RULES) {
  const wanted = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  const { allowPartial = false, instanceIds = null, data = null } = options;
  if (!inventory || !isKnownItem(itemId) || wanted <= 0) {
    return { ok: false, added: 0, remainder: wanted, error: INVENTORY_ERROR.invalidCount };
  }
  const accepted = canAcceptInWorkerCargo(inventory, itemId, wanted, rules);
  if (accepted <= 0) {
    return { ok: false, added: 0, remainder: wanted, error: INVENTORY_ERROR.noSpace };
  }
  if (accepted < wanted && !allowPartial) {
    return { ok: false, added: 0, remainder: wanted, error: INVENTORY_ERROR.noSpace };
  }
  const start = workerCargoSlotStart(rules);
  const end = inventory.capacity ?? inventory.slots.length;
  const added = itemStacksByMerging(itemId)
    ? mergeStackInRange(inventory, itemId, accepted, start, end)
    : placeInstancesInRange(inventory, itemId, accepted, start, end, instanceIds, data);
  return {
    ok: true,
    added,
    remainder: wanted - added,
    error: INVENTORY_ERROR.none
  };
}

export function countOfInWorkerCargo(inventory, itemId, rules = ITEM_RULES) {
  if (!inventory?.slots || !itemId) return 0;
  const start = workerCargoSlotStart(rules);
  let sum = 0;
  for (let i = start; i < inventory.slots.length; i += 1) {
    const slot = inventory.slots[i];
    if (slot?.itemId === itemId) sum += slot.count ?? 0;
  }
  return sum;
}

export function findStoreOfferInWorkerCargo(source, target, filter, meta = {}, rules = ITEM_RULES) {
  if (!source || !target) return null;
  const start = workerCargoSlotStart(rules);
  for (let index = start; index < source.slots.length; index += 1) {
    const slot = source.slots[index];
    if (!slot?.itemId) continue;
    if (!chestAcceptsItem(filter, slot.itemId)) continue;
    if ((target.canAccept(slot.itemId, 1) ?? 0) <= 0) continue;
    return {
      itemId: slot.itemId,
      count: slot.count,
      instanceId: slot.instanceId ?? null,
      slotIndex: index,
      ...meta
    };
  }
  return null;
}

export function moveWorkerCargoSlotTo(source, slotIndex, target, rules = ITEM_RULES) {
  if (!source || !target || isWorkerToolSlotIndex(slotIndex, rules)) {
    return { ok: false, moved: 0 };
  }
  const slot = source.slots?.[slotIndex];
  if (!slot?.itemId) return { ok: false, moved: 0 };
  if (slot.instanceId) {
    const moved = source.transferInstanceTo(target, slot.instanceId);
    return moved.ok ? { ok: true, moved: 1 } : { ok: false, moved: 0 };
  }
  const room = Math.min(slot.count, target.canAccept(slot.itemId, slot.count));
  if (room <= 0) return { ok: false, moved: 0 };
  const added = target.add(slot.itemId, room, { allowPartial: true });
  if (!added.ok || (added.added ?? 0) <= 0) return { ok: false, moved: 0 };
  slot.count -= added.added;
  if (slot.count <= 0) source.slots[slotIndex] = null;
  return { ok: true, moved: added.added };
}

/** 工具区里伤害最高的傀儡武器（供自动装备）。 */
export function findBestPuppetWeaponSlotInToolZone(inventory, rules = ITEM_RULES) {
  const end = workerToolZoneSlots(rules);
  let best = null;
  for (let i = 0; i < end; i += 1) {
    const slot = inventory?.slots?.[i];
    if (!slot || !isPuppetWeaponItem(slot.itemId)) continue;
    if (slotDurability(slot) <= 0) continue;
    const damage = Number(ITEM_DEFINITIONS[slot.itemId]?.weapon?.damage) || 0;
    if (!best || damage > best.damage) {
      best = { index: i, slot, damage };
    }
  }
  return best;
}

export function giveCarriedFromWorkerCargo(carrier, targetInventory, itemId, rules = ITEM_RULES) {
  if (!carrier || !targetInventory || !itemId) return { ok: false, moved: 0 };
  const start = workerCargoSlotStart(rules);
  for (let i = start; i < carrier.slots.length; i += 1) {
    const slot = carrier.slots[i];
    if (!slot || slot.itemId !== itemId) continue;
    return moveWorkerCargoSlotTo(carrier, i, targetInventory, rules);
  }
  return { ok: false, moved: 0 };
}
