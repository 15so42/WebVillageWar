// 容器间自动传输：有向连线 + 连线级白/黑名单，仅在魔力供给范围内运作。

import { POWER_RULES } from '../data/gameData.js';

import {

  TRANSPORT_LINK_ERROR_LABELS,

  resolveTransportLink

} from './transport.js';

import {

  chestAcceptsItem,

  normalizeChestFilter

} from './workTasks.js';

import { moveSlotCount } from './inventoryTransfer.js';

export { TRANSPORT_LINK_ERROR_LABELS };



export class TransportSystem {

  constructor(game) {

    this.game = game ?? null;

    /** @type {Array<object>} */

    this.links = [];

    this.rules = {

      secondsPerMove: POWER_RULES.transportSecondsPerMove ?? 1,

      moveManaCost: POWER_RULES.transportMoveManaCost ?? 0.5

    };

    /** @type {Array<{ linkId: string, itemId: string, progress: number }>} */

    this.inTransit = [];

  }



  linkIdFor(fromStationId, toStationId) {

    return `link:${fromStationId}:${toStationId}`;

  }



  linkById(linkId) {

    return this.links.find((link) => link.id === linkId) ?? null;

  }



  hasLink(fromStationId, toStationId) {

    return this.links.some((link) => (

      link.fromStationId === fromStationId && link.toStationId === toStationId

    ));

  }



  tryAddLink(origin, target) {

    const resolved = resolveTransportLink(origin, target);

    if (!resolved.ok) {

      return {

        ok: false,

        reason: resolved.reason,

        label: TRANSPORT_LINK_ERROR_LABELS[resolved.reason] ?? '无法连线'

      };

    }

    const fromStationId = resolved.from.stationId;

    const toStationId = resolved.to.stationId;

    if (this.hasLink(fromStationId, toStationId)) {

      return { ok: false, reason: 'duplicate', label: TRANSPORT_LINK_ERROR_LABELS.duplicate };

    }

    const link = {

      id: this.linkIdFor(fromStationId, toStationId),

      fromStationId,

      toStationId,

      filter: normalizeChestFilter({ mode: 'blacklist', itemIds: [] }),
      transferCooldown: 0
    };

    this.links.push(link);

    this.game?.transportVisual?.markDirty?.();

    return { ok: true, link };

  }



  removeLink(linkId) {

    const before = this.links.length;

    this.links = this.links.filter((link) => link.id !== linkId);

    if (this.links.length !== before) {

      this.game?.transportLinkPanel?.closeIfLink?.(linkId);

      this.game?.transportVisual?.markDirty?.();

    }

    return before !== this.links.length;

  }



  removeLinksForStation(stationId) {

    if (!stationId) return 0;

    const before = this.links.length;

    this.links = this.links.filter((link) => (

      link.fromStationId !== stationId && link.toStationId !== stationId

    ));

    const removed = before - this.links.length;

    if (removed) this.game?.transportVisual?.markDirty?.();

    return removed;

  }



  addFilterItem(linkOrId, itemId) {

    const link = typeof linkOrId === 'string' ? this.linkById(linkOrId) : linkOrId;

    if (!link || !itemId) return { ok: false, reason: 'invalid' };

    const id = String(itemId);

    if (link.filter.itemIds.includes(id)) return { ok: true, duplicate: true };

    link.filter.itemIds.push(id);

    this.game?.transportLinkPanel?.markDirty?.();

    return { ok: true };

  }



  removeFilterItem(linkOrId, itemId) {

    const link = typeof linkOrId === 'string' ? this.linkById(linkOrId) : linkOrId;

    if (!link || !itemId) return { ok: false, reason: 'invalid' };

    const id = String(itemId);

    link.filter.itemIds = link.filter.itemIds.filter((entry) => entry !== id);

    this.game?.transportLinkPanel?.markDirty?.();

    return { ok: true };

  }



  setFilterMode(linkOrId, mode) {

    const link = typeof linkOrId === 'string' ? this.linkById(linkOrId) : linkOrId;

    if (!link) return { ok: false, reason: 'no_link' };

    link.filter.mode = mode === 'blacklist' ? 'blacklist' : 'whitelist';

    this.game?.transportLinkPanel?.markDirty?.();

    return { ok: true };

  }



  stationRecord(stationId) {

    return this.game?.stations?.stationById?.(stationId) ?? null;

  }



  stationInventory(stationId) {

    const station = this.stationRecord(stationId);

    if (!station && stationId !== 'player-base') return null;

    if (stationId === 'player-base' || station?.kind === 'playerBase') {

      return this.game?.baseInventory ?? null;

    }

    return station?.inventory ?? null;

  }



  /** 运输线来源端库存（熔炉=产物输出格） */
  exportInventory(stationId) {
    const station = this.stationRecord(stationId);
    if (station?.kind === 'furnace') return station.outputInventory ?? null;
    return this.stationInventory(stationId);
  }



  /** 运输线目标端库存（熔炉=进料格） */
  importInventory(stationId) {
    const station = this.stationRecord(stationId);
    if (station?.kind === 'furnace') return station.inventory ?? null;
    return this.stationInventory(stationId);
  }



  outgoingLinksFrom(stationId) {
    if (!stationId) return [];
    return this.links.filter((link) => link.fromStationId === stationId);
  }



  furnaceHasOutputLine(stationId) {
    return this.outgoingLinksFrom(stationId).length > 0;
  }



  /** 至少有一条输出线现在能运走 1 个产物 */
  furnaceOutputPortCanDrain(stationId) {
    const fromInv = this.exportInventory(stationId);
    if (!fromInv) return false;
    for (const link of this.outgoingLinksFrom(stationId)) {
      if (!this.linkCanFlow(link)) continue;
      const index = this.findMovableSlot(fromInv, link.filter);
      if (index < 0) continue;
      const slot = fromInv.slots[index];
      const toInv = this.importInventory(link.toStationId);
      if (!toInv) continue;
      const destFilter = this.stationFilter(link.toStationId);
      if (!chestAcceptsItem(destFilter, slot.itemId)) continue;
      if ((toInv.canAccept(slot.itemId, 1) ?? 0) > 0) return true;
    }
    return false;
  }



  furnaceOutputReady(stationId, recipe) {
    if (!recipe?.output?.itemId) return false;
    if (!this.furnaceHasOutputLine(stationId)) return false;
    const outInv = this.exportInventory(stationId);
    const batch = Math.max(1, Math.floor(recipe.output.count));
    if ((outInv?.canAccept(recipe.output.itemId, batch) ?? 0) >= batch) return true;
    return this.furnaceOutputPortCanDrain(stationId);
  }



  stationFilter(stationId) {

    const station = this.stationRecord(stationId);

    return station?.filter ?? normalizeChestFilter({});

  }



  stationPosition(stationId) {

    const game = this.game;

    if (stationId === 'player-base') {

      const base = game?.playerBase?.position;

      if (!base) return null;

      return { x: base.x, z: base.z };

    }

    const unit = this.stationRecord(stationId)?.unit;

    if (!unit?.position) return null;

    return { x: unit.position.x, z: unit.position.z };

  }



  touchStation(stationId) {

    const station = this.stationRecord(stationId);

    if (station) this.game?.stations?.touch?.(station);

    else if (stationId === 'player-base') {

      this.game?.stations?.touch?.(this.game.stations.playerBaseStation?.());

    }

  }



  findMovableSlot(inventory, filter = null) {

    if (!inventory?.slots) return -1;

    for (let index = 0; index < inventory.slots.length; index += 1) {

      const slot = inventory.slots[index];

      if (!slot?.itemId) continue;

      if (filter && !chestAcceptsItem(filter, slot.itemId)) continue;

      return index;

    }

    return -1;

  }



  endpointInSupply(position) {

    const power = this.game?.power;

    if (!position || !power) return true;

    const nearest = power.nearestSupplier(position.x, position.z);

    if (!nearest) return false;

    return nearest.distance <= nearest.supplier.supplyRadius;

  }



  supplierHasManaForMove(position) {

    const power = this.game?.power;

    const cost = this.rules.moveManaCost;

    if (!power || cost <= 0) return true;

    const nearest = power.nearestSupplier(position.x, position.z);

    if (!nearest || nearest.distance > nearest.supplier.supplyRadius) return false;

    const supplier = nearest.supplier;

    if (supplier.kind === 'base') {

      const { stored } = power.baseSupplierMana?.() ?? { stored: 0 };

      return stored >= cost;

    }

    if (Number.isFinite(supplier.manaStored)) {

      return supplier.manaStored >= cost;

    }

    return true;

  }



  consumeMoveMana(position) {

    const power = this.game?.power;

    const cost = this.rules.moveManaCost;

    if (!power || cost <= 0) return true;

    const nearest = power.nearestSupplier(position.x, position.z);

    if (!nearest || nearest.distance > nearest.supplier.supplyRadius) return false;

    const supplier = nearest.supplier;

    if (supplier.kind === 'base') {

      const meta = power.baseSupplierMana();

      if (meta.stored < cost) return false;

      supplier.manaStored = meta.stored - cost;

      return true;

    }

    if (Number.isFinite(supplier.manaStored)) {

      if (supplier.manaStored < cost) return false;

      supplier.manaStored -= cost;

      return true;

    }

    return true;

  }



  linkMidpoint(link) {

    const a = this.stationPosition(link.fromStationId);

    const b = this.stationPosition(link.toStationId);

    if (!a || !b) return null;

    return { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };

  }



  linkHasPower(link) {

    if (!link) return false;

    const from = this.stationPosition(link.fromStationId);

    if (!from) return false;

    if (!this.endpointInSupply(from)) return false;

    return this.supplierHasManaForMove(from);

  }



  linkCanFlow(link) {

    if (!this.linkHasPower(link)) return false;

    const fromPos = this.stationPosition(link.fromStationId);

    const toPos = this.stationPosition(link.toStationId);

    if (!fromPos || !toPos) return false;

    if (link.fromStationId !== 'player-base') {

      const fromStation = this.stationRecord(link.fromStationId);

      if (!fromStation?.unit?.alive) return false;

    } else if (this.game?.playerBase?.alive === false) return false;

    if (link.toStationId !== 'player-base') {

      const toStation = this.stationRecord(link.toStationId);

      if (!toStation?.unit?.alive) return false;

    } else if (this.game?.playerBase?.alive === false) return false;

    return true;

  }



  transferAlongLink(link) {

    const fromInv = this.exportInventory(link.fromStationId);

    const toInv = this.importInventory(link.toStationId);

    if (!fromInv || !toInv) return null;

    const index = this.findMovableSlot(fromInv, link.filter);

    if (index < 0) return null;

    const slot = fromInv.slots[index];

    const destFilter = this.stationFilter(link.toStationId);

    if (!chestAcceptsItem(destFilter, slot.itemId)) return null;

    if ((toInv.canAccept(slot.itemId, 1) ?? 0) <= 0) return null;

    const fromPos = this.stationPosition(link.fromStationId);

    if (!fromPos || !this.consumeMoveMana(fromPos)) return null;

    const result = moveSlotCount(fromInv, toInv, { fromIndex: index, toIndex: null, count: 1 });

    if (!result.ok || (result.moved ?? 0) <= 0) return null;

    this.touchStation(link.fromStationId);

    this.touchStation(link.toStationId);

    this.game?.transportLinkPanel?.markDirty?.();

    return { itemId: slot.itemId, linkId: link.id };

  }



  update(dt) {

    const step = Math.max(0, dt);

    this.advanceTransit(step);

    if (!this.links.length) return;

    for (const link of this.links) {

      if (!Number.isFinite(link.transferCooldown)) link.transferCooldown = 0;

      link.transferCooldown -= step;

      if (link.transferCooldown > 0) continue;

      if (!this.linkCanFlow(link)) continue;

      const moved = this.transferAlongLink(link);

      if (moved) {

        link.transferCooldown = this.rules.secondsPerMove;

        this.spawnTransit(moved.linkId, moved.itemId);

      }

    }

  }



  spawnTransit(linkId, itemId) {

    if (!linkId || !itemId) return;

    this.inTransit.push({ linkId, itemId, progress: 0 });

    if (this.inTransit.length > 24) this.inTransit.shift();

  }



  advanceTransit(dt) {

    const speed = 1;

    if (!this.inTransit.length) return;

    this.inTransit = this.inTransit

      .map((entry) => ({ ...entry, progress: entry.progress + speed * Math.max(0, dt) }))

      .filter((entry) => entry.progress < 1.08);

  }



  snapshotLinks() {

    return this.links.map((link) => ({

      ...link,

      filter: { ...link.filter, itemIds: [...link.filter.itemIds] }

    }));

  }

}


