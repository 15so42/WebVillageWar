// 通用库存容器。
//
// 设计上守住三条规则（对应实施计划第 11 节）：
//   1. 每个物品实例同时只存在于一个位置——转移是「取出 + 放入」，不是复制。
//   2. 装不下就明确失败，绝不静默吞掉物品。默认整笔成功或整笔失败，
//      需要「能装多少装多少」的采集场景显式传 allowPartial。
//   3. 实例类物品不合并，堆叠类按 itemId 合并到 stackLimit。
import {
  ITEM_KIND,
  isKnownItem,
  itemRules,
  itemStackLimit,
  itemStacksByMerging,
  nextItemInstanceId
} from './items.js';

export const INVENTORY_ERROR = {
  none: 'none',
  unknownItem: 'unknown_item',
  noSpace: 'no_space',
  notEnough: 'not_enough',
  unknownInstance: 'unknown_instance',
  invalidCount: 'invalid_count'
};

export const INVENTORY_ERROR_LABELS = {
  [INVENTORY_ERROR.unknownItem]: '没有这种物品',
  [INVENTORY_ERROR.noSpace]: '库存空间不足',
  [INVENTORY_ERROR.notEnough]: '数量不够',
  [INVENTORY_ERROR.unknownInstance]: '找不到这件物品',
  [INVENTORY_ERROR.invalidCount]: '数量不合法'
};

export class Inventory {
  constructor({ id = 'inventory', capacity = 20, slots = null } = {}) {
    this.id = id;
    this.capacity = Math.max(0, Math.round(capacity));
    this.slots = new Array(this.capacity).fill(null);
    if (Array.isArray(slots)) this.loadSlots(slots);
  }

  loadSlots(slots) {
    this.slots = new Array(this.capacity).fill(null);
    slots.forEach((slot, index) => {
      if (index >= this.capacity || !slot || !isKnownItem(slot.itemId)) return;
      const count = Math.max(0, Math.round(slot.count ?? 0));
      if (count <= 0) return;
      if (itemStacksByMerging(slot.itemId)) {
        this.slots[index] = { itemId: slot.itemId, count: Math.min(count, itemStackLimit(slot.itemId)) };
        return;
      }
      this.slots[index] = {
        itemId: slot.itemId,
        instanceId: slot.instanceId ?? nextItemInstanceId(slot.itemId),
        count: 1,
        data: slot.data ?? null
      };
    });
  }

  usedSlots() {
    return this.slots.filter(Boolean).length;
  }

  freeSlots() {
    return this.capacity - this.usedSlots();
  }

  isEmpty() {
    return this.usedSlots() === 0;
  }

  countOf(itemId) {
    return this.slots.reduce((sum, slot) => (slot?.itemId === itemId ? sum + slot.count : sum), 0);
  }

  instancesOf(itemId = null) {
    return this.slots.filter((slot) => (
      slot && slot.instanceId && (itemId === null || slot.itemId === itemId)
    ));
  }

  findInstance(instanceId) {
    if (!instanceId) return null;
    return this.slots.find((slot) => slot?.instanceId === instanceId) ?? null;
  }

  countOfInstance(instanceId) {
    return this.findInstance(instanceId)?.count ?? 0;
  }

  // 能再装下多少个：不修改状态，供合成、搬运、拾取提前判断。
  // 返回的是「还能装多少」，调用方自己决定够不够。
  canAccept(itemId, count) {
    const wanted = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
    if (!isKnownItem(itemId) || wanted <= 0) return 0;
    if (!itemStacksByMerging(itemId)) {
      // 实例类：一格一件，能装的数量就是空格数
      return Math.min(wanted, this.freeSlots());
    }
    const limit = itemStackLimit(itemId);
    let room = 0;
    this.slots.forEach((slot) => {
      if (!slot || slot.itemId !== itemId) return;
      room += Math.max(0, limit - slot.count);
    });
    room += this.freeSlots() * limit;
    return Math.min(wanted, room);
  }

  hasSpaceFor(itemId, count) {
    return this.canAccept(itemId, count) >= Math.max(0, Math.floor(count ?? 0));
  }

  // 放入物品。默认整笔成功或整笔失败（合成/转移用），
  // 采集这类「能装多少装多少」的场景传 allowPartial。
  add(itemId, count, { allowPartial = false, instanceIds = null, data = null } = {}) {
    const wanted = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
    if (!isKnownItem(itemId)) {
      return { ok: false, added: 0, remainder: wanted, error: INVENTORY_ERROR.unknownItem };
    }
    if (wanted <= 0) {
      return { ok: false, added: 0, remainder: 0, error: INVENTORY_ERROR.invalidCount };
    }
    const accepted = this.canAccept(itemId, wanted);
    if (accepted <= 0) {
      return { ok: false, added: 0, remainder: wanted, error: INVENTORY_ERROR.noSpace };
    }
    if (accepted < wanted && !allowPartial) {
      return { ok: false, added: 0, remainder: wanted, error: INVENTORY_ERROR.noSpace };
    }
    const added = itemStacksByMerging(itemId)
      ? this.mergeStack(itemId, accepted)
      : this.placeInstances(itemId, accepted, instanceIds, data);
    return {
      ok: true,
      added,
      remainder: wanted - added,
      error: INVENTORY_ERROR.none
    };
  }

  mergeStack(itemId, count) {
    const limit = itemStackLimit(itemId);
    let remaining = count;
    // 先填已有的半堆，再开新格子：这样不会在还有空隙时白占格子
    for (let i = 0; i < this.slots.length && remaining > 0; i += 1) {
      const slot = this.slots[i];
      if (!slot || slot.itemId !== itemId || slot.count >= limit) continue;
      const room = Math.min(limit - slot.count, remaining);
      slot.count += room;
      remaining -= room;
    }
    for (let i = 0; i < this.slots.length && remaining > 0; i += 1) {
      if (this.slots[i]) continue;
      const room = Math.min(limit, remaining);
      this.slots[i] = { itemId, count: room };
      remaining -= room;
    }
    return count - remaining;
  }

  placeInstances(itemId, count, instanceIds = null, data = null) {
    let placed = 0;
    for (let i = 0; i < this.slots.length && placed < count; i += 1) {
      if (this.slots[i]) continue;
      const provided = Array.isArray(instanceIds) ? instanceIds[placed] : null;
      this.slots[i] = {
        itemId,
        instanceId: provided ?? nextItemInstanceId(itemId),
        count: 1,
        data: data ? { ...data } : null
      };
      placed += 1;
    }
    return placed;
  }

  // 取出一定数量。整笔成功或整笔失败：宁可报「不够」，
  // 也不要出现「扣了一半材料但合成没做成」。
  remove(itemId, count) {
    const wanted = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
    if (wanted <= 0) return { ok: false, removed: 0, error: INVENTORY_ERROR.invalidCount };
    if (this.countOf(itemId) < wanted) {
      return { ok: false, removed: 0, error: INVENTORY_ERROR.notEnough };
    }
    if (!itemStacksByMerging(itemId)) {
      return { ok: false, removed: 0, error: INVENTORY_ERROR.notEnough };
    }
    let remaining = wanted;
    for (let i = 0; i < this.slots.length && remaining > 0; i += 1) {
      const slot = this.slots[i];
      if (!slot || slot.itemId !== itemId) continue;
      const take = Math.min(slot.count, remaining);
      slot.count -= take;
      remaining -= take;
      if (slot.count <= 0) this.slots[i] = null;
    }
    return { ok: true, removed: wanted, error: INVENTORY_ERROR.none };
  }

  removeInstance(instanceId) {
    const index = this.slots.findIndex((slot) => slot?.instanceId === instanceId);
    if (index < 0) return { ok: false, error: INVENTORY_ERROR.unknownInstance };
    const slot = this.slots[index];
    this.slots[index] = null;
    return { ok: true, itemId: slot.itemId, data: slot.data ?? null, error: INVENTORY_ERROR.none };
  }

  /**
   * 从**指定的那一格**取走东西。
   *
   * `remove(itemId, n)` 取的是"这种物品在库存里的总量"，落点由它自己挑（第一个匹配的格子）。
   * 但"玩家点的是哪一格，就花哪一格"的场景不能这么算：同一种建筑分两格放时，
   * 扣错了格子会让另一格凭空少一件——快捷栏与放置流程都是按格操作的。
   * 实例类物品（count 恒为 1）走这里也天然正确：扣完那一格就空了。
   */
  removeAt(index, count = 1) {
    const slot = this.slots[index];
    if (!slot?.itemId) return { ok: false, removed: 0, error: INVENTORY_ERROR.notEnough };
    const wanted = Math.max(1, Math.floor(Number(count) || 1));
    const available = Math.max(1, Math.round(slot.count ?? 1));
    const taken = Math.min(wanted, available);
    const itemId = slot.itemId;
    if (taken >= available) {
      this.slots[index] = null;
    } else {
      slot.count = available - taken;
    }
    return {
      ok: taken === wanted,
      removed: taken,
      itemId,
      error: taken === wanted ? INVENTORY_ERROR.none : INVENTORY_ERROR.notEnough
    };
  }

  // 跨容器转移。先确认目标装得下再动手；万一中途失败会把东西放回原处，
  // 保证不会出现「两边都没有」的瞬间丢件。
  transferTo(target, itemId, count = null) {
    if (!target) return { ok: false, moved: 0, error: INVENTORY_ERROR.unknownItem };
    const available = this.countOf(itemId);
    const wanted = count === null ? available : Math.max(0, Math.floor(count));
    if (available < wanted || wanted <= 0 || !itemStacksByMerging(itemId)) {
      return { ok: false, moved: 0, error: INVENTORY_ERROR.notEnough };
    }
    if (target.canAccept(itemId, wanted) < wanted) {
      return { ok: false, moved: 0, error: INVENTORY_ERROR.noSpace };
    }
    const removed = this.remove(itemId, wanted);
    if (!removed.ok) return { ok: false, moved: 0, error: removed.error };
    const added = target.add(itemId, wanted);
    if (!added.ok) {
      this.add(itemId, wanted);
      return { ok: false, moved: 0, error: added.error };
    }
    return { ok: true, moved: wanted, error: INVENTORY_ERROR.none };
  }

  transferInstanceTo(target, instanceId) {
    if (!target) return { ok: false, error: INVENTORY_ERROR.unknownInstance };
    if (target.freeSlots() <= 0) return { ok: false, error: INVENTORY_ERROR.noSpace };
    const removed = this.removeInstance(instanceId);
    if (!removed.ok) return { ok: false, error: removed.error };
    // 必须把原 instanceId 传下去：让它重新发一个 ID 就等于凭空复制了一件新物品，
    // 附魔石这类带成长数据的实例会直接丢失成长。
    const added = target.add(removed.itemId, 1, { instanceIds: [instanceId], data: removed.data });
    if (!added.ok) {
      this.add(removed.itemId, 1, { instanceIds: [instanceId], data: removed.data });
      return { ok: false, error: added.error };
    }
    return { ok: true, itemId: removed.itemId, error: INVENTORY_ERROR.none };
  }

  totalCount() {
    return this.slots.reduce((sum, slot) => sum + (slot?.count ?? 0), 0);
  }

  // 按物品 ID 汇总数量。资源节点用它汇报「采到的资源现在在哪」，
  // 这样库存接管之后就不需要再单独维护一份账本。
  countsByItem() {
    const counts = {};
    this.slots.forEach((slot) => {
      if (!slot) return;
      counts[slot.itemId] = (counts[slot.itemId] ?? 0) + slot.count;
    });
    return counts;
  }

  snapshot() {
    return this.slots.map((slot) => (slot ? { ...slot, data: slot.data ? { ...slot.data } : null } : null));
  }

  serialize() {
    return {
      id: this.id,
      capacity: this.capacity,
      slots: this.slots
        .map((slot, index) => (slot ? { index, ...slot, data: slot.data ? { ...slot.data } : null } : null))
        .filter(Boolean)
    };
  }

  static deserialize(raw, { id = null, capacity = null } = {}) {
    const resolvedCapacity = capacity ?? raw?.capacity ?? itemRules().baseInventorySlots;
    const inventory = new Inventory({ id: id ?? raw?.id ?? 'inventory', capacity: resolvedCapacity });
    inventory.loadSlots(raw?.slots ?? []);
    return inventory;
  }
}

export { ITEM_KIND };
