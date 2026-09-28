// 手动工作台与箱子的运行时。
//
// 库存、过滤、框选采集任务都在这里。傀儡怎么走、怎么挥斧仍由 WorkSystem 执行，
// 本文件只回答「现在有哪些任务、该派给谁、到了以后扣哪一份库存」。
import { ITEM_RULES } from '../data/gameData.js';
import { Inventory } from './Inventory.js';
import { craftRecipe } from './crafting.js';
import {
  findStoreOfferInWorkerCargo,
  giveCarriedFromWorkerCargo,
  isWorkerInventory,
  moveWorkerCargoSlotTo
} from './workerInventory.js';
import {
  CRAFT_IDLE_PRIORITY,
  CRAFT_READY_PRIORITY,
  MANUAL_BOX_GATHER_PRIORITY,
  STORE_PRIORITY,
  chestAcceptsItem,
  compareWorkTasks,
  errandBeatsAutoGather,
  firstCraftableRecipe,
  gatherTaskPriority,
  normalizeChestFilter,
  resolveStorePriority,
  stationCraftPriority,
  STORE_TASK_PRIORITY_MAX,
  STORE_TASK_PRIORITY_MIN
} from './workTasks.js';
import { defaultPriorityFor } from './resourcePriority.js';

export const PLAYER_BASE_STATION_ID = 'player-base';

export const STATION_KIND = {
  manualWorkbench: 'manualWorkbench',
  chest: 'chest',
  furnace: 'furnace',
  playerBase: 'playerBase'
};

const STATION_SLOTS = {
  [STATION_KIND.manualWorkbench]: () => ITEM_RULES.workbenchInventorySlots,
  [STATION_KIND.chest]: () => ITEM_RULES.chestInventorySlots,
  [STATION_KIND.furnace]: () => ITEM_RULES.furnaceInputSlots
};

export function stationKindOf(unitOrType) {
  const type = typeof unitOrType === 'string' ? unitOrType : unitOrType?.type;
  return STATION_SLOTS[type] ? type : null;
}

export class StationSystem {
  constructor(game) {
    this.game = game ?? null;
    this.stations = new Map();
    this.gatherTasks = [];
    this.gatherClaims = new Map();
    this.sequence = 0;
    this.ensurePlayerBaseStation();
  }

  ensurePlayerBaseStation() {
    const id = PLAYER_BASE_STATION_ID;
    if (this.stations.has(id)) return this.stations.get(id);
    const station = {
      id,
      unit: null,
      kind: STATION_KIND.playerBase,
      inventory: null,
      filter: normalizeChestFilter({ mode: 'blacklist', itemIds: [] }),
      storePriority: STORE_PRIORITY,
      claimedBy: null
    };
    this.stations.set(id, station);
    return station;
  }

  playerBaseStation() {
    return this.ensurePlayerBaseStation();
  }

  chestStations() {
    const list = [];
    this.stations.forEach((station) => {
      if (station.kind === STATION_KIND.chest) list.push(station);
    });
    return list;
  }

  stationById(stationId) {
    if (!stationId) return null;
    return this.stations.get(stationId) ?? null;
  }

  stationFor(unit) {
    if (!unit?.id) return null;
    return this.stations.get(unit.id) ?? null;
  }

  registerBuilding(unit) {
    const kind = stationKindOf(unit);
    if (!kind || !unit?.id) return null;
    if (this.stations.has(unit.id)) return this.stations.get(unit.id);
    const capacity = STATION_SLOTS[kind]();
    const station = {
      id: unit.id,
      unit,
      kind,
      inventory: new Inventory({ id: `station:${unit.id}`, capacity }),
      outputInventory: kind === STATION_KIND.furnace
        ? new Inventory({ id: `station:${unit.id}:out`, capacity: ITEM_RULES.furnaceOutputSlots ?? 1 })
        : null,
      filter: normalizeChestFilter({ mode: 'blacklist', itemIds: [] }),
      craftPriority: CRAFT_IDLE_PRIORITY,
      storePriority: STORE_PRIORITY,
      claimedBy: null
    };
    this.stations.set(unit.id, station);
    return station;
  }

  /**
   * 建筑拆掉：能塞回基地的塞回去，剩下的留在这份库存里交给调用方掉落。
   * 返回还没搬走的格子，方便死亡掉落；调用方也可以不管。
   */
  releaseBuilding(unit) {
    const station = this.stationFor(unit);
    if (!station) return null;
    this.game?.work?.clearErrandsForStation?.(station.id);
    this.game?.transport?.removeLinksForStation?.(station.id);
    this.dumpToBase(station.inventory);
    const leftover = station.inventory.slots.filter(Boolean).map((slot) => ({
      itemId: slot.itemId,
      count: slot.count,
      instanceId: slot.instanceId ?? null,
      data: slot.data ? { ...slot.data } : null
    }));
    if (leftover.length) {
      const position = station.unit?.position;
      this.game?.drops?.spawnFromStacks?.(leftover, {
        x: position?.x ?? 0,
        z: position?.z ?? 0,
        ownerId: station.unit?.controllerPlayerId ?? null
      });
      station.inventory.loadSlots([]);
    }
    this.stations.delete(station.id);
    this.game?.stationPanel?.closeIfUnit?.(unit);
    return { station, leftover };
  }

  dumpToBase(inventory) {
    const base = this.game?.baseInventory;
    if (!inventory) return [];
    if (base) {
      const slots = inventory.slots.map((slot, index) => ({ slot, index })).filter((entry) => entry.slot);
      slots.forEach(({ index }) => {
        this.moveSlot(inventory, index, base);
      });
    }
    return inventory.slots.filter(Boolean).map((slot) => ({ ...slot }));
  }

  panelPriority(resource) {
    const raw = this.game?.resourcePriorities?.[resource];
    return raw == null ? defaultPriorityFor(resource) : raw;
  }

  /** 一次框选 = 一条采集任务。节点列表是这一框里点中的那些，不和别的框合并。 */
  addGatherTask(nodes = []) {
    const nodeIds = [];
    const resources = new Set();
    nodes.forEach((node) => {
      if (!node?.id || (node.amount ?? 0) <= 0) return;
      if (nodeIds.includes(node.id)) return;
      nodeIds.push(node.id);
      if (node.resource) resources.add(node.resource);
    });
    if (!nodeIds.length) return null;
    const ranks = [...resources]
      .map((resource) => gatherTaskPriority(this.panelPriority(resource)))
      .filter((rank) => rank != null);
    const task = {
      id: `gather-${this.sequence += 1}`,
      kind: 'gather',
      explicit: true,
      priority: ranks.length ? Math.min(...ranks) : MANUAL_BOX_GATHER_PRIORITY,
      nodeIds
    };
    this.gatherTasks.push(task);
    this.game?.work?.pokeAssign?.();
    return task;
  }

  pruneGatherTasks() {
    const nodes = this.game?.resourceNodes;
    if (!nodes?.nodeById) return;
    this.gatherTasks.forEach((task) => {
      task.nodeIds = task.nodeIds.filter((nodeId) => {
        const node = nodes?.nodeById?.(nodeId);
        return Boolean(node && (node.amount ?? 0) > 0);
      });
    });
    this.gatherTasks = this.gatherTasks.filter((task) => task.nodeIds.length > 0);
    const live = new Set(this.gatherTasks.flatMap((task) => task.nodeIds));
    [...this.gatherClaims.keys()].forEach((nodeId) => {
      if (!live.has(nodeId)) this.gatherClaims.delete(nodeId);
    });
  }

  refreshCraftPriority(station) {
    if (!station || station.kind !== STATION_KIND.manualWorkbench) return CRAFT_IDLE_PRIORITY;
    const recipes = this.game?.craftCatalog?.() ?? [];
    station.craftPriority = stationCraftPriority(station.inventory, recipes);
    return station.craftPriority;
  }

  autoGatherRank() {
    const marks = this.game?.work?.markedNodes;
    if (!marks?.size) return Infinity;
    let best = Infinity;
    marks.forEach((priority) => {
      const value = Number(priority);
      if (Number.isFinite(value) && value < best) best = value;
    });
    return best;
  }

  openErrands() {
    this.pruneGatherTasks();
    const errands = [];
    this.gatherTasks.forEach((task) => {
      const openNode = task.nodeIds.some((nodeId) => !this.gatherClaims.has(nodeId));
      if (!openNode) return;
      errands.push({
        id: task.id,
        kind: 'gather',
        explicit: true,
        priority: task.priority,
        actionable: true
      });
    });
    this.stations.forEach((station) => {
      if (!this.stationUsable(station)) return;
      if (station.kind === STATION_KIND.playerBase) return;
      if (station.kind === STATION_KIND.furnace) return;
      if (station.kind === STATION_KIND.manualWorkbench) {
        const priority = this.refreshCraftPriority(station);
        errands.push({
          id: `craft:${station.id}`,
          kind: 'craft',
          stationId: station.id,
          priority,
          actionable: priority === CRAFT_READY_PRIORITY && !station.claimedBy
        });
      }
      if (this.storeOffer(station)) {
        errands.push({
          id: `store:${station.id}`,
          kind: 'store',
          stationId: station.id,
          priority: resolveStorePriority(station),
          actionable: !station.claimedBy
        });
      }
    });
    const baseStation = this.playerBaseStation();
    if (this.stationUsable(baseStation)) {
      if (this.storeOffer(baseStation)) {
        errands.push({
          id: `store:${baseStation.id}`,
          kind: 'store',
          stationId: baseStation.id,
          priority: resolveStorePriority(baseStation),
          actionable: !baseStation.claimedBy
        });
      }
    }
    errands.sort(compareWorkTasks);
    return errands;
  }

  stationUsable(station) {
    if (!station) return false;
    if (station.kind === STATION_KIND.playerBase) {
      return this.game?.playerBase?.alive !== false;
    }
    const unit = station.unit;
    return Boolean(unit && unit.alive !== false && unit.underConstruction !== true);
  }

  peekErrand({ betterThan = Infinity, ignoreStation = null } = {}) {
    return this.openErrands().find((errand) => (
      errand.actionable
      && errand.stationId !== ignoreStation
      && Number(errand.priority) < Number(betterThan)
    )) ?? null;
  }

  /**
   * 给空闲傀儡派差事。只动「手上没有采集任务、也没有差事」的人，
   * 不把正在砍的傀儡拽走——那会把已经背上的货丢掉。
   * 正在跑腿、而且还没抱上货的人，如果出现了更急的任务，会先把差事放下。
   */
  assignIdleWorkers(work) {
    if (!work?.records?.size) return 0;
    const autoRank = this.autoGatherRank();
    work.records.forEach((record) => {
      const errand = record.errand;
      if (!errand || errand.phase === 'dropoff' || record.rally) return;
      const crowded = Number.isFinite(autoRank) && autoRank < errand.priority;
      const better = this.peekErrand({ betterThan: errand.priority, ignoreStation: errand.stationId });
      if (crowded || better) work.clearErrand(record);
    });
    let assigned = 0;
    const idle = [...work.records.values()]
      .filter((record) => (
        record.unit?.alive !== false && !record.task && !record.errand && !record.rally
      ))
      .sort((a, b) => String(a.unitId).localeCompare(String(b.unitId)));
    idle.forEach((record) => {
      const taken = this.claimFor(record, work, autoRank);
      if (!taken) return;
      assigned += 1;
      if (taken.kind === 'gather') return;
      record.errand = taken;
      record.progress = 0;
      work.prepareErrand?.(record);
    });
    return assigned;
  }

  claimFor(record, work, autoRank) {
    const errand = this.openErrands().find((entry) => (
      entry.actionable && errandBeatsAutoGather(entry, autoRank)
    ));
    if (!errand) return null;
    if (errand.kind === 'gather') {
      const task = this.gatherTasks.find((entry) => entry.id === errand.id);
      const nodeId = task?.nodeIds.find((id) => !this.gatherClaims.has(id));
      if (!nodeId) return null;
      this.gatherClaims.set(nodeId, record.unitId);
      const ok = work.assignNode(record.unitId, nodeId);
      if (!ok) {
        this.gatherClaims.delete(nodeId);
        return null;
      }
      return { kind: 'gather', nodeId };
    }
    const station = this.stationById(errand.stationId);
    if (!station || station.claimedBy) return null;
    const offer = this.storeOffer(station, record.inventory);
    if (!offer?.itemId) return null;
    station.claimedBy = record.unitId;
    return {
      id: errand.id,
      kind: errand.kind,
      stationId: station.id,
      priority: errand.priority,
      phase: 'pickup',
      itemId: null,
      offer
    };
  }

  releaseGatherClaim(nodeId) {
    if (nodeId) this.gatherClaims.delete(nodeId);
  }

  releaseClaim(errand) {
    if (!errand?.stationId) return;
    const station = this.stationById(errand.stationId);
    if (!station) return;
    if (station.claimedBy) station.claimedBy = null;
  }

  storeOffer(station, carrier = null) {
    if (station?.kind === STATION_KIND.furnace) return null;
    if (!station) return null;
    const target = station.kind === STATION_KIND.playerBase
      ? this.game?.baseInventory
      : station.inventory;
    if (!target) return null;
    const acceptsStore = (
      station.kind === STATION_KIND.chest
      || station.kind === STATION_KIND.manualWorkbench
      || station.kind === STATION_KIND.playerBase
    );
    if (!acceptsStore) return null;
    if (carrier) {
      return this.storeOfferFromInventory(
        carrier,
        target,
        station.filter,
        { source: 'carrier' }
      );
    }
    const work = this.game?.work;
    if (work?.records?.size) {
      for (const record of work.records.values()) {
        const offer = this.storeOfferFromInventory(
          record.inventory,
          target,
          station.filter,
          { source: 'carrier' }
        );
        if (offer) return offer;
      }
    }
    return null;
  }

  storeOfferFromInventory(source, target, filter, meta = {}) {
    if (!source || !target) return null;
    if (isWorkerInventory(source)) {
      return findStoreOfferInWorkerCargo(source, target, filter, meta);
    }
    const counts = source.countsByItem?.() ?? {};
    const itemId = Object.keys(counts).find((id) => {
      if ((counts[id] ?? 0) <= 0) return false;
      if (!chestAcceptsItem(filter, id)) return false;
      if (target.canAccept(id, 1) <= 0) return false;
      if (source.canAccept && source === target) return false;
      return true;
    });
    if (!itemId) return null;
    return { itemId, count: counts[itemId], ...meta };
  }

  performCraft(station) {
    if (!station) return { ok: false, reason: 'no_station' };
    const recipes = this.game?.craftCatalog?.() ?? [];
    const recipe = firstCraftableRecipe(station.inventory, recipes);
    if (!recipe) {
      station.craftPriority = CRAFT_IDLE_PRIORITY;
      return { ok: false, reason: 'missing_inputs' };
    }
    const result = craftRecipe(station.inventory, recipe);
    this.refreshCraftPriority(station);
    if (result.ok && result.output?.itemId) {
      this.game?.backpack?.seenItemIds?.add(result.output.itemId);
      this.game?.backpack?.markDirty?.();
    }
    this.game?.stationPanel?.markDirty?.();
    return result;
  }

  takeFromBase(carrier, offer) {
    const base = this.game?.baseInventory;
    if (!base || !carrier || !offer?.itemId) return { ok: false };
    if (offer.instanceId) return base.transferInstanceTo(carrier, offer.instanceId);
    if (!itemStacksByMerging(offer.itemId)) {
      const instance = base.instancesOf(offer.itemId)[0];
      if (!instance) return { ok: false };
      return base.transferInstanceTo(carrier, instance.instanceId);
    }
    const room = Math.min(
      carrier.canAccept(offer.itemId, offer.count),
      base.countOf(offer.itemId)
    );
    if (room <= 0) return { ok: false };
    return base.transferTo(carrier, offer.itemId, room);
  }

  takeFromStation(carrier, station, offer) {
    if (!carrier || !station || !offer?.itemId) return { ok: false };
    if (offer.instanceId) return station.inventory.transferInstanceTo(carrier, offer.instanceId);
    if (!itemStacksByMerging(offer.itemId)) {
      const instance = station.inventory.instancesOf(offer.itemId)[0];
      if (!instance) return { ok: false };
      return station.inventory.transferInstanceTo(carrier, instance.instanceId);
    }
    const room = Math.min(
      carrier.canAccept(offer.itemId, offer.count),
      station.inventory.countOf(offer.itemId)
    );
    if (room <= 0) return { ok: false };
    return station.inventory.transferTo(carrier, offer.itemId, room);
  }

  giveCarried(carrier, targetInventory, itemId, offer = null) {
    if (!carrier || !targetInventory || !itemId) return { ok: false, moved: 0 };
    if (isWorkerInventory(carrier)) {
      if (Number.isFinite(offer?.slotIndex)) {
        return moveWorkerCargoSlotTo(carrier, offer.slotIndex, targetInventory);
      }
      return giveCarriedFromWorkerCargo(carrier, targetInventory, itemId);
    }
    if (!itemStacksByMerging(itemId)) {
      const instance = carrier.instancesOf(itemId)[0];
      if (!instance) return { ok: false, moved: 0 };
      const moved = carrier.transferInstanceTo(targetInventory, instance.instanceId);
      return moved.ok ? { ok: true, moved: 1 } : moved;
    }
    const count = carrier.countOf(itemId);
    const room = targetInventory.canAccept(itemId, count);
    if (room <= 0) return { ok: false, moved: 0 };
    return carrier.transferTo(targetInventory, itemId, room);
  }

  returnCarriedToBase(carrier, itemId) {
    return this.giveCarried(carrier, this.game?.baseInventory, itemId);
  }

  setStorePriority(station, delta) {
    if (!station || !Number.isFinite(Number(delta))) return null;
    const next = resolveStorePriority(station) + Math.round(Number(delta));
    station.storePriority = Math.max(
      STORE_TASK_PRIORITY_MIN,
      Math.min(STORE_TASK_PRIORITY_MAX, next)
    );
    this.game?.work?.pokeAssign?.();
    this.game?.stationPanel?.markDirty?.();
    this.game?.backpack?.markDirty?.();
    return station.storePriority;
  }

  setFilterMode(station, mode) {
    if (!station) return null;
    station.filter = normalizeChestFilter({
      mode: mode === 'blacklist' ? 'blacklist' : 'whitelist',
      itemIds: station.filter.itemIds
    });
    this.game?.work?.pokeAssign?.();
    this.game?.stationPanel?.markDirty?.();
    this.game?.backpack?.markDirty?.();
    return station.filter;
  }

  addFilterItem(station, itemId) {
    if (!station || !itemId) return null;
    const itemIds = station.filter.itemIds.includes(itemId)
      ? station.filter.itemIds
      : [...station.filter.itemIds, itemId];
    station.filter = normalizeChestFilter({ mode: station.filter.mode, itemIds });
    this.game?.work?.pokeAssign?.();
    this.game?.stationPanel?.markDirty?.();
    this.game?.backpack?.markDirty?.();
    return station.filter;
  }

  removeFilterItem(station, itemId) {
    if (!station) return null;
    station.filter = normalizeChestFilter({
      mode: station.filter.mode,
      itemIds: station.filter.itemIds.filter((id) => id !== itemId)
    });
    this.game?.work?.pokeAssign?.();
    this.game?.stationPanel?.markDirty?.();
    this.game?.backpack?.markDirty?.();
    return station.filter;
  }

  /**
   * 把一格搬到另一个容器。同种堆叠会合并，装不下就能搬多少搬多少。
   * 目标格被别的东西占着时不动，避免两件物品对换时丢实例。
   */
  moveSlot(source, slotIndex, target) {
    if (!source || !target || source === target) return { ok: false, reason: 'same_container' };
    const slot = source.slots?.[slotIndex];
    if (!slot) return { ok: false, reason: 'empty' };
    if (slot.instanceId) {
      const moved = source.transferInstanceTo(target, slot.instanceId);
      return moved.ok ? { ok: true, moved: 1 } : { ok: false, reason: moved.error };
    }
    const room = target.canAccept(slot.itemId, slot.count);
    if (room <= 0) return { ok: false, reason: 'no_space' };
    const moved = source.transferTo(target, slot.itemId, room);
    return moved.ok ? { ok: true, moved: moved.moved } : { ok: false, reason: moved.error };
  }

  transferBetween(station, fromKey, fromIndex, toKey) {
    const source = this.inventoryFor(station, fromKey);
    const target = this.inventoryFor(station, toKey);
    const result = this.moveSlot(source, fromIndex, target);
    if (result.ok) this.touch(station);
    return result;
  }

  inventoryFor(station, key) {
    if (key === 'base') return this.game?.baseInventory ?? null;
    if (key === 'station-out') {
      if (station?.kind === STATION_KIND.furnace) return station.outputInventory ?? null;
      return null;
    }
    if (key === 'station') {
      if (station?.kind === STATION_KIND.playerBase) return this.game?.baseInventory ?? null;
      return station?.inventory ?? null;
    }
    return null;
  }

  touch(station) {
    this.refreshCraftPriority(station);
    this.game?.work?.pokeAssign?.();
    this.game?.stationPanel?.markDirty?.();
    this.game?.backpack?.markDirty?.();
  }
}
