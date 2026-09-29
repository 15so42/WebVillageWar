// 手动工作台 / 箱子的独立界面。
//
// 左边是容器真实仓库；右边是存放白/黑名单与任务优先级（默认黑名单，空名单=什么都收）。
// 合成表仍在 B 键基地背包右侧。
import { itemArtForSlot } from './itemArt.js';
import { itemName } from './items.js';
import { insertIntoInventory } from './inventoryTransfer.js';
import {
  handleInventorySlotClick,
  removeInventoryCursorGhost,
  returnInventoryCursor,
  syncInventoryCursorGhostPosition,
  updateInventoryCursorGhost
} from './inventoryCursorUi.js';
import { STATION_KIND } from './StationSystem.js';import { mountStationStoragePane, STATION_STORAGE_DATASETS } from './stationStorageUi.js';
import { CRAFT_IDLE_PRIORITY, CRAFT_READY_PRIORITY, resolveStorePriority } from './workTasks.js';

const REFRESH_INTERVAL_MS = 400;

export const STATION_PANELS = Object.freeze({
  manualWorkbench: {
    unitType: STATION_KIND.manualWorkbench,
    title: '手动工作台',
    icon: '⚒'
  },
  chest: {
    unitType: STATION_KIND.chest,
    title: '箱子',
    icon: '箱'
  },
  furnace: {
    unitType: STATION_KIND.furnace,
    title: '熔炉',
    icon: '炉'
  },
  manaFurnace: {
    unitType: STATION_KIND.manaFurnace,
    title: '魔力炉',
    icon: '魔'
  }
});

export function stationPanelFor(unitOrType) {
  const type = typeof unitOrType === 'string' ? unitOrType : unitOrType?.type;
  return STATION_PANELS[type] ?? null;
}

export class StationPanelUi {
  constructor(game, options = {}) {
    this.game = game;
    this.mount = options.mount ?? (typeof document !== 'undefined' ? document.body : null);
    this.root = null;
    this.parts = null;
    this.unit = null;
    this.config = null;
    this.lastSignature = '';
    this.cursor = null;
    this.cursorGhost = null;
    this.lastPointerX = null;
    this.lastPointerY = null;
    this.suppressClick = false;
    this.refreshTimer = null;
    this.bound = false;
    this.onWindowPointerMove = (event) => {
      syncInventoryCursorGhostPosition(this, event.clientX, event.clientY);
    };
    this.onWindowPointerUp = (event) => this.onPointerUp(event);
  }

  get available() {
    return Boolean(this.mount);
  }

  isOpen() {
    return Boolean(this.root && !this.root.hidden);
  }

  isOpenFor(unit) {
    return this.isOpen() && Boolean(unit) && this.unit === unit;
  }

  openForUnit(unit) {
    const config = stationPanelFor(unit);
    if (!config) return { ok: false, reason: 'no_station_panel' };
    if (unit?.alive === false) return { ok: false, reason: 'dead_unit' };
    const station = this.game?.stations?.stationFor?.(unit) ?? this.game?.stations?.registerBuilding?.(unit);
    if (!station) return { ok: false, reason: 'no_station' };
    this.ensureUi();
    if (!this.root) return { ok: false, reason: 'no_mount' };
    this.game?.facilityPanel?.close?.();
    this.unit = unit;
    this.config = config;
    this.lastSignature = '';
    this.root.hidden = false;
    this.root.classList.add('is-open');
    this.root.dataset.station = config.unitType;
    this.startAutoRefresh();
    this.refresh();
    return { ok: true, unitType: config.unitType };
  }

  toggleForUnit(unit) {
    if (this.isOpenFor(unit)) {
      this.close();
      return { ok: true, closed: true };
    }
    return this.openForUnit(unit);
  }

  close() {
    this.stopAutoRefresh();
    this.returnCursor();
    this.unit = null;
    this.config = null;
    this.lastSignature = '';
    if (!this.root) return;
    this.root.hidden = true;
    this.root.classList.remove('is-open');
    delete this.root.dataset.station;
  }

  closeIfUnit(unit) {
    if (!this.isOpenFor(unit)) return false;
    this.close();
    return true;
  }

  markDirty() {
    this.lastSignature = '';
    if (this.isOpen()) this.refresh();
  }

  destroy() {
    this.stopAutoRefresh();
    this.returnCursor();
    removeInventoryCursorGhost(this);
    if (this.bound) {
      window.removeEventListener('pointermove', this.onWindowPointerMove);
      window.removeEventListener('pointerup', this.onWindowPointerUp);
      this.bound = false;
    }
    this.root?.remove();
    this.root = null;
    this.parts = null;
    this.unit = null;
  }

  startAutoRefresh() {
    if (this.refreshTimer != null) return;
    this.refreshTimer = setInterval(() => {
      if (!this.isOpen()) {
        this.stopAutoRefresh();
        return;
      }
      this.refresh();
    }, REFRESH_INTERVAL_MS);
  }

  stopAutoRefresh() {
    if (this.refreshTimer == null) return;
    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  ensureUi() {
    if (this.root || !this.available) return this.root;
    const root = document.createElement('div');
    root.id = 'station-panel';
    root.className = 'station-panel';
    root.hidden = true;
    root.innerHTML = `
      <div class="station-frame" role="dialog" aria-label="建筑界面">
        <header class="backpack-header">
          <div class="backpack-heading">
            <span class="backpack-title" data-station-title>建筑</span>
            <span class="backpack-subtitle" data-station-subtitle></span>
          </div>
          <button type="button" class="backpack-close" data-station-close aria-label="关闭">✕</button>
        </header>
        <div class="station-body">
          <section class="station-side" data-station-left></section>
          <section class="station-side" data-station-right></section>
        </div>
        <section class="station-base" data-station-base></section>
      </div>
    `;
    this.mount.appendChild(root);
    this.root = root;
    this.parts = {
      title: root.querySelector('[data-station-title]'),
      subtitle: root.querySelector('[data-station-subtitle]'),
      left: root.querySelector('[data-station-left]'),
      right: root.querySelector('[data-station-right]'),
      base: root.querySelector('[data-station-base]')
    };
    if (!this.bound) {
      root.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        this.onPointerDown(event);
      });
      root.addEventListener('click', (event) => this.onClick(event));
      root.addEventListener('contextmenu', (event) => event.preventDefault());
      window.addEventListener('pointermove', this.onWindowPointerMove);
      window.addEventListener('pointerup', this.onWindowPointerUp);
      this.bound = true;
    }
    return root;
  }

  station() {
    return this.game?.stations?.stationFor?.(this.unit) ?? null;
  }

  refresh() {
    if (!this.isOpen() || !this.parts) return;
    if (this.unit?.alive === false) {
      this.close();
      return;
    }
    const station = this.station();
    if (!station) {
      this.close();
      return;
    }
    const signature = this.signature(station);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.render(station);
  }

  signature(station) {
    const slots = (inventory) => (inventory?.slots ?? []).map((slot) => (
      slot ? `${slot.itemId}:${slot.count}:${slot.instanceId ?? ''}` : ''
    )).join('|');
    return JSON.stringify({
      kind: station.kind,
      priority: station.craftPriority,
      filter: station.filter,
      storePriority: resolveStorePriority(station),
      stationSlots: slots(station.inventory),
      fuelSlots: slots(station.fuelInventory),
      outputSlots: slots(station.outputInventory),
      baseSlots: slots(this.game?.baseInventory),
      production: this.game?.production?.statusOf?.(this.unit) ?? null,
      fuelPower: this.game?.fuelPower?.statusOf?.(this.unit) ?? null,
      cursor: this.cursor
        ? [this.cursor.itemId, this.cursor.count, this.cursor.instanceId ?? null]
        : null
    });
  }

  render(station) {
    const config = this.config;
    this.parts.title.textContent = config?.title ?? '建筑';
    this.parts.right.hidden = false;
    this.parts.left.className = 'station-side';
    this.parts.right.className = 'station-side';
    if (station.kind === STATION_KIND.furnace) {
      this.renderFurnace(station);
      return;
    }
    if (station.kind === STATION_KIND.manaFurnace) {
      this.renderManaFurnace(station);
      return;
    }
    if (station.kind === STATION_KIND.manualWorkbench) {
      const priority = station.craftPriority ?? CRAFT_IDLE_PRIORITY;
      this.parts.subtitle.textContent = priority === CRAFT_READY_PRIORITY
        ? `合成任务优先级 ${priority}：材料够了，傀儡会过来做`
        : `合成任务优先级 ${priority}：现在做不了任何配方`;
    } else {
      const mode = station.filter.mode === 'blacklist' ? '黑名单' : '白名单';
      this.parts.subtitle.textContent = `存放任务优先级 ${resolveStorePriority(station)} · ${mode} · 傀儡从背包搬进仓库`;
    }
    this.renderGrid(this.parts.left, {
      key: 'station',
      title: '仓库',
      inventory: station.inventory,
      columns: station.kind === STATION_KIND.chest ? 8 : 6,
      hint: station.kind === STATION_KIND.manualWorkbench
        ? '材料由傀儡按右侧名单搬入；凑齐后傀儡会来合成。'
        : '左侧是箱子里的真实库存；名单只决定傀儡还要搬进哪些种类。'
    });
    this.renderStorageSettings(station);
    this.parts.base.hidden = true;
    this.parts.base.textContent = '';
  }

  renderManaFurnace(station) {
    const status = this.game?.fuelPower?.statusOf?.(this.unit) ?? null;
    const pct = status?.manaCapacity
      ? Math.round(((status.manaStored ?? 0) / status.manaCapacity) * 100)
      : 0;
    const reasonLabels = {
      none: '燃烧木炭充能中',
      no_fuel: '燃料格无木炭',
      no_inventory: '魔力炉库存异常'
    };
    this.parts.subtitle.textContent = `${reasonLabels[status?.reason] ?? '魔力炉'} · 储备 ${status?.manaStored ?? 0}/${status?.manaCapacity ?? 100}（${pct}%）`;
    this.parts.right.hidden = true;
    this.parts.left.className = 'station-side';
    this.renderGrid(this.parts.left, {
      key: 'station',
      title: '木炭',
      inventory: station.inventory,
      columns: 1,
      hint: '运输线送入木炭；有燃料即燃烧并为炉内充魔，满 100 后按基地相同功率向周围放电。'
    });
    this.parts.base.hidden = false;
    this.parts.base.className = 'station-base';
    this.renderGrid(this.parts.base, {
      key: 'base',
      title: '基地背包',
      inventory: this.game?.baseInventory,
      columns: 8
    });
  }

  renderFurnace(station) {
    const status = this.game?.production?.statusOf?.(this.unit) ?? null;
    const seconds = status?.seconds ?? 0;
    const progress = status?.progress ?? 0;
    const pct = seconds > 0 ? Math.min(100, Math.round((progress / seconds) * 100)) : 0;
    const reasonLabels = {
      working: '烧制中',
      no_input: '进料格为空或数量不足',
      no_fuel: '燃料不足（燃料口需木材或木炭）',
      no_power: '魔力不足（需在供能范围内）',
      unknown_material: '这种材料不能在此熔炼',
      output_blocked: '出料口已满',
      no_inventory: '熔炉库存异常'
    };
    this.parts.subtitle.textContent = reasonLabels[status?.reason] ?? '熔炉';
    this.parts.right.hidden = true;
    this.parts.left.className = 'station-side furnace-layout-host';
    this.parts.left.textContent = '';
    const layout = document.createElement('div');
    layout.className = 'furnace-layout';
    const portsCol = document.createElement('div');
    portsCol.className = 'furnace-ports-col';
    this.renderFurnacePort(portsCol, {
      key: 'station',
      title: '进料口',
      inventory: station.inventory,
      tip: '可熔炼原料；运输线连入时选进料口'
    });
    this.renderFurnacePort(portsCol, {
      key: 'station-fuel',
      title: '燃料口',
      inventory: station.fuelInventory,
      tip: '木材或木炭，每批熔炼消耗燃料',
      append: true
    });
    const flameCol = document.createElement('div');
    flameCol.className = 'furnace-flame-col';
    flameCol.innerHTML = `
      <div class="furnace-flame-stack">
        <div class="furnace-flame" aria-hidden="true" title="熔炼中">🔥</div>
        <div class="furnace-progress-wrap">
          <div class="furnace-progress-label">${pct}%</div>
          <div class="furnace-progress-track"><div class="furnace-progress-fill" style="width:${pct}%"></div></div>
          <div class="furnace-progress-meta">${seconds > 0 ? `${seconds}s` : '—'}<span class="furnace-progress-meta-sep">·</span>燃${status?.fuelCount ?? 0}</div>
        </div>
      </div>
    `;
    const outCol = document.createElement('div');
    outCol.className = 'furnace-out-col';
    this.renderFurnacePort(outCol, {
      key: 'station-out',
      title: '出料口',
      inventory: station.outputInventory,
      tip: '产物先进入出料口；格满停炉，可用输出运输线运走'
    });
    layout.append(portsCol, flameCol, outCol);
    this.parts.left.appendChild(layout);
    this.parts.base.hidden = false;
    this.parts.base.className = 'station-base furnace-base';
    this.renderGrid(this.parts.base, {
      key: 'base',
      title: '基地背包',
      inventory: this.game?.baseInventory,
      columns: 8
    });
  }

  renderFurnacePort(host, { key, title, inventory, tip = '', append = false }) {
    if (!host) return;
    if (!append) host.textContent = '';
    const block = document.createElement('div');
    block.className = 'backpack-grid-block furnace-port-block';
    const head = document.createElement('div');
    head.className = 'backpack-pane-head furnace-port-head';
    const titleEl = document.createElement('span');
    titleEl.className = 'backpack-pane-title';
    titleEl.textContent = title;
    if (tip) titleEl.title = tip;
    const count = document.createElement('span');
    count.className = 'backpack-pane-count';
    const used = inventory?.usedSlots?.() ?? 0;
    const capacity = inventory?.capacity ?? 0;
    count.textContent = `${used}/${capacity}`;
    head.append(titleEl, count);
    block.appendChild(head);
    const grid = document.createElement('div');
    grid.className = 'backpack-grid furnace-port-grid';
    grid.style.setProperty('--backpack-columns', '1');
    const slots = inventory?.slots ?? [];
    for (let index = 0; index < capacity; index += 1) {
      grid.appendChild(this.createSlot(key, slots[index] ?? null, index));
    }
    block.appendChild(grid);
    host.appendChild(block);
  }

  renderGrid(host, entry, options = {}) {
    if (!host) return;
    if (!options.append) host.textContent = '';
    const block = document.createElement('div');
    block.className = 'backpack-grid-block';
    const head = document.createElement('div');
    head.className = 'backpack-pane-head';
    const title = document.createElement('span');
    title.className = 'backpack-pane-title';
    title.textContent = entry.title;
    const count = document.createElement('span');
    count.className = 'backpack-pane-count';
    const inventory = entry.inventory;
    const used = inventory?.usedSlots?.() ?? 0;
    const capacity = inventory?.capacity ?? 0;
    count.textContent = `${used}/${capacity}`;
    head.append(title, count);
    block.appendChild(head);
    if (entry.hint) {
      const hint = document.createElement('p');
      hint.className = 'backpack-grid-hint';
      hint.textContent = entry.hint;
      block.appendChild(hint);
    }
    const grid = document.createElement('div');
    grid.className = 'backpack-grid';
    grid.style.setProperty('--backpack-columns', String(entry.columns));
    const slots = inventory?.slots ?? [];
    for (let index = 0; index < capacity; index += 1) {
      grid.appendChild(this.createSlot(entry.key, slots[index] ?? null, index));
    }
    block.appendChild(grid);
    host.appendChild(block);
  }

  createSlot(container, slot, index) {
    const cell = document.createElement('div');
    cell.className = slot?.itemId ? 'backpack-slot is-filled' : 'backpack-slot is-empty';
    cell.dataset.stationSlot = String(index);
    cell.dataset.stationContainer = container;
    if (slot?.itemId) {
      cell.dataset.itemId = slot.itemId;
      const art = document.createElement('div');
      art.className = 'backpack-slot-art';
      art.innerHTML = itemArtForSlot(slot);
      cell.appendChild(art);
      if ((slot.count ?? 1) > 1) {
        const count = document.createElement('span');
        count.className = 'backpack-slot-count';
        count.textContent = String(slot.count);
        cell.appendChild(count);
      }
      cell.title = itemName(slot.itemId);
    }
    return cell;
  }

  renderStorageSettings(station) {
    const host = this.parts.right;
    if (!host) return;
    const datasets = STATION_STORAGE_DATASETS.panel;
    mountStationStoragePane(host, station, {
      hostClass: 'station-side',
      title: '傀儡存放',
      filterHintWhitelist: '把左侧仓库格里的物品拖到这里，傀儡只会把名单里的货搬进来。白名单为空时不收任何种类。',
      filterHintBlacklist: '除名单里的种类外都收；黑名单为空时什么都收。点掉一项可移出名单。',
      datasets: {
        mode: datasets.mode,
        filter: datasets.filter,
        filterItem: datasets.filterItem,
        priorityDelta: datasets.priorityDelta
      }
    });
  }

  onClick(event) {
    if (event.target.closest('[data-station-close]')) {
      event.preventDefault();
      this.close();
      return;
    }
    const mode = event.target.closest('[data-station-mode]');
    if (mode) {
      event.preventDefault();
      this.game?.stations?.setFilterMode?.(this.station(), mode.dataset.stationMode);
      return;
    }
    const priorityBtn = event.target.closest('[data-station-priority-delta]');
    if (priorityBtn) {
      event.preventDefault();
      const delta = Number(priorityBtn.dataset.stationPriorityDelta);
      if (!Number.isFinite(delta)) return;
      this.game?.stations?.setStorePriority?.(this.station(), delta);
      return;
    }
    const chip = event.target.closest('[data-station-filter-item]');
    if (chip && !this.suppressClick) {
      event.preventDefault();
      this.game?.stations?.removeFilterItem?.(this.station(), chip.dataset.stationFilterItem);
    }
    const filterDrop = event.target.closest('[data-station-filter]');
    if (
      filterDrop
      && this.cursor?.itemId
      && !event.target.closest('[data-station-filter-item]')
    ) {
      event.preventDefault();
      this.game?.stations?.addFilterItem?.(this.station(), this.cursor.itemId);
      return;
    }
    const transportFilterDrop = event.target.closest('[data-transport-link-filter]');
    if (
      transportFilterDrop
      && this.cursor?.itemId
      && !event.target.closest('[data-transport-link-filter-item]')
    ) {
      event.preventDefault();
      this.game?.transportLinkPanel?.acceptFilterDrop?.(this.cursor.itemId);
      return;
    }
    this.suppressClick = false;
  }

  inventoryForKey(containerKey) {
    return this.game?.stations?.inventoryFor?.(this.station(), containerKey) ?? null;
  }

  stationSlotFromPoint(clientX, clientY) {
    if (typeof document === 'undefined') return null;
    const hit = document.elementFromPoint(clientX, clientY);
    const cell = hit?.closest?.('[data-station-slot]');
    if (!cell || !this.root?.contains(cell)) return null;
    return cell;
  }

  afterCursorChange() {
    this.game?.stations?.touch?.(this.station());
    updateInventoryCursorGhost(this);
    this.lastSignature = '';
    this.refresh();
  }

  returnCursor() {
    returnInventoryCursor(this, {
      insertIntoInventory,
      fallbackInventories: [this.game?.baseInventory]
    });
  }

  registerFilterItemFromCursor(clientX, clientY) {
    if (!this.cursor?.itemId || typeof document === 'undefined') return false;
    const hit = document.elementFromPoint(clientX, clientY);
    if (hit?.closest?.('[data-station-slot]')) return false;
    const filter = hit?.closest?.('[data-station-filter]');
    if (filter) {
      this.game?.stations?.addFilterItem?.(this.station(), this.cursor.itemId);
      return true;
    }
    const tlink = hit?.closest?.('[data-transport-link-filter]');
    if (tlink && this.game?.transportLinkPanel?.acceptFilterDrop?.(this.cursor.itemId)) {
      return true;
    }
    return false;
  }

  onPointerDown(event) {
    const cell = event.target.closest('[data-station-slot]');
    if (!cell || !this.root?.contains(cell)) return;
    event.preventDefault();
    syncInventoryCursorGhostPosition(this, event.clientX, event.clientY);
    const index = Number(cell.dataset.stationSlot);
    const containerKey = cell.dataset.stationContainer;
    if (!Number.isFinite(index) || !containerKey) return;
    const inventory = this.inventoryForKey(containerKey);
    if (!inventory) return;
    if (event.button === 2) {
      handleInventorySlotClick(this, inventory, index, { right: true });
      this.afterCursorChange();
      return;
    }
    if (event.button !== 0) return;
    if (!this.cursor) {
      const slot = inventory.slots?.[index];
      if (!slot?.itemId) return;
      handleInventorySlotClick(this, inventory, index, { right: false });
      this.afterCursorChange();
    }
  }

  onPointerUp(event) {
    if (!this.isOpen() || event.button !== 0 || !this.cursor) return;
    if (this.registerFilterItemFromCursor(event.clientX, event.clientY)) {
      this.suppressClick = true;
      return;
    }
    const cell = this.stationSlotFromPoint(event.clientX, event.clientY);
    if (!cell) return;
    const index = Number(cell.dataset.stationSlot);
    const containerKey = cell.dataset.stationContainer;
    const inventory = this.inventoryForKey(containerKey);
    if (!inventory || !Number.isFinite(index)) return;
    handleInventorySlotClick(this, inventory, index, { right: false });
    this.afterCursorChange();
  }
}
