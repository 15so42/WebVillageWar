// 点击运输线打开：配置该线的传输白/黑名单、查看供能状态、断开连线。
import { itemArtForSlot } from './itemArt.js';
import { itemName } from './items.js';
import { STATION_KIND } from './StationSystem.js';
import { mountStationStoragePane } from './stationStorageUi.js';
import { transportStationLabel } from './transport.js';

const REFRESH_INTERVAL_MS = 400;

const LINK_DATASETS = Object.freeze({
  mode: 'transportLinkMode',
  filter: 'transportLinkFilter',
  filterItem: 'transportLinkFilterItem',
  priorityDelta: 'transportLinkPriorityDelta'
});

export class TransportLinkPanelUi {
  constructor(game, options = {}) {
    this.game = game;
    this.mount = options.mount ?? (typeof document !== 'undefined' ? document.body : null);
    this.root = null;
    this.parts = null;
    this.linkId = null;
    this.lastSignature = '';
    this.drag = null;
    this.suppressClick = false;
    this.refreshTimer = null;
    this.bound = false;
    this.onWindowPointerMove = (event) => this.onPointerMove(event);
    this.onWindowPointerUp = (event) => this.onPointerUp(event);
  }

  isOpen() {
    return Boolean(this.root && !this.root.hidden);
  }

  link() {
    return this.game?.transport?.linkById?.(this.linkId) ?? null;
  }

  openForLink(linkId) {
    const link = this.game?.transport?.linkById?.(linkId);
    if (!link) return { ok: false, reason: 'no_link' };
    this.ensureUi();
    this.game?.stationPanel?.close?.();
    this.game?.facilityPanel?.close?.();
    this.linkId = linkId;
    this.lastSignature = '';
    this.root.hidden = false;
    this.root.classList.add('is-open');
    this.startAutoRefresh();
    this.refresh();
    return { ok: true };
  }

  toggleForLink(linkId) {
    if (this.isOpenFor(linkId)) {
      this.close();
      return { ok: true, closed: true };
    }
    return this.openForLink(linkId);
  }

  isOpenFor(linkId) {
    return this.isOpen() && this.linkId === linkId;
  }

  close() {
    this.stopAutoRefresh();
    this.drag = null;
    this.linkId = null;
    this.lastSignature = '';
    if (!this.root) return;
    this.root.hidden = true;
    this.root.classList.remove('is-open');
  }

  closeIfLink(linkId) {
    if (!this.isOpenFor(linkId)) return false;
    this.close();
    return true;
  }

  markDirty() {
    this.lastSignature = '';
    if (this.isOpen()) this.refresh();
  }

  destroy() {
    this.stopAutoRefresh();
    if (this.bound) {
      window.removeEventListener('pointermove', this.onWindowPointerMove);
      window.removeEventListener('pointerup', this.onWindowPointerUp);
      this.bound = false;
    }
    this.root?.remove();
    this.root = null;
  }

  startAutoRefresh() {
    if (this.refreshTimer != null) return;
    this.refreshTimer = setInterval(() => {
      if (!this.isOpen()) this.stopAutoRefresh();
      else this.refresh();
    }, REFRESH_INTERVAL_MS);
  }

  stopAutoRefresh() {
    if (this.refreshTimer == null) return;
    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  ensureUi() {
    if (this.root || !this.mount) return;
    const root = document.createElement('div');
    root.id = 'transport-link-panel';
    root.className = 'station-panel transport-link-panel';
    root.hidden = true;
    root.innerHTML = `
      <div class="station-frame" role="dialog" aria-label="运输线设置">
        <header class="backpack-header">
          <div class="backpack-heading">
            <span class="backpack-title" data-tlink-title>运输线</span>
            <span class="backpack-subtitle" data-tlink-subtitle></span>
          </div>
          <button type="button" class="backpack-close" data-tlink-close aria-label="关闭">✕</button>
        </header>
        <div class="station-body transport-link-body">
          <section class="station-side" data-tlink-left></section>
          <section class="station-side" data-tlink-right></section>
        </div>
        <footer class="transport-link-footer">
          <button type="button" class="backpack-action" data-tlink-remove>断开这条运输线</button>
        </footer>
      </div>
    `;
    this.mount.appendChild(root);
    this.root = root;
    this.parts = {
      title: root.querySelector('[data-tlink-title]'),
      subtitle: root.querySelector('[data-tlink-subtitle]'),
      left: root.querySelector('[data-tlink-left]'),
      right: root.querySelector('[data-tlink-right]')
    };
    if (!this.bound) {
      root.addEventListener('click', (event) => this.onClick(event));
      root.addEventListener('pointerdown', (event) => event.stopPropagation());
      window.addEventListener('pointermove', this.onWindowPointerMove);
      window.addEventListener('pointerup', this.onWindowPointerUp);
      this.bound = true;
    }
  }

  refresh() {
    const link = this.link();
    if (!this.isOpen() || !link || !this.parts) return;
    const fromInv = this.game?.transport?.exportInventory?.(link.fromStationId);
    const slotsSig = (inventory) => (inventory?.slots ?? []).map((slot) => (
      slot ? `${slot.itemId}:${slot.count}:${slot.instanceId ?? ''}` : ''
    )).join('|');
    const signature = JSON.stringify({
      id: link.id,
      filter: link.filter,
      powered: this.game?.transport?.linkHasPower?.(link),
      fromSlots: slotsSig(fromInv)
    });
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    const stations = this.game?.stations;
    const fromLabel = transportStationLabel(link.fromStationId, stations);
    const toLabel = transportStationLabel(link.toStationId, stations);
    this.parts.title.textContent = `${fromLabel} → ${toLabel}`;
    const powered = this.game?.transport?.linkHasPower?.(link);
    this.parts.subtitle.textContent = powered
      ? '来源端供能正常，自动搬运中'
      : '来源端供能不足或超出魔力范围 · 传输已暂停';
    this.renderSourceInventory(link, fromLabel, fromInv);
    this.renderTransportFilter(link, powered);
  }

  renderSourceInventory(link, fromLabel, inventory) {
    const host = this.parts.left;
    if (!host) return;
    host.textContent = '';
    const fromStation = this.game?.transport?.stationRecord?.(link.fromStationId)
      ?? this.game?.stations?.stationById?.(link.fromStationId);
    const isFurnaceOut = fromStation?.kind === STATION_KIND.furnace;
    const block = document.createElement('div');
    block.className = 'backpack-grid-block';
    const head = document.createElement('div');
    head.className = 'backpack-pane-head';
    const title = document.createElement('span');
    title.className = 'backpack-pane-title';
    title.textContent = isFurnaceOut ? `来源：${fromLabel}（产物格）` : `来源：${fromLabel}`;
    const count = document.createElement('span');
    count.className = 'backpack-pane-count';
    const used = inventory?.usedSlots?.() ?? 0;
    const capacity = inventory?.capacity ?? 0;
    count.textContent = `${used}/${capacity}`;
    head.append(title, count);
    block.appendChild(head);
    const hint = document.createElement('p');
    hint.className = 'backpack-grid-hint';
    hint.textContent = isFurnaceOut
      ? '输出线从产物格运走物品；此处只读预览。'
      : '运输线从该容器的这些格子里抽取物品；此处只读预览。';
    block.appendChild(hint);
    const grid = document.createElement('div');
    grid.className = 'backpack-grid';
    grid.style.setProperty('--backpack-columns', '6');
    const slots = inventory?.slots ?? [];
    for (let index = 0; index < capacity; index += 1) {
      const slot = slots[index] ?? null;
      const cell = document.createElement('div');
      cell.className = slot?.itemId ? 'backpack-slot is-filled is-readonly' : 'backpack-slot is-empty is-readonly';
      if (slot?.itemId) {
        const art = document.createElement('div');
        art.className = 'backpack-slot-art';
        art.innerHTML = itemArtForSlot(slot);
        cell.appendChild(art);
        if ((slot.count ?? 1) > 1) {
          const badge = document.createElement('span');
          badge.className = 'backpack-slot-count';
          badge.textContent = String(slot.count);
          cell.appendChild(badge);
        }
        cell.title = itemName(slot.itemId);
      }
      grid.appendChild(cell);
    }
    block.appendChild(grid);
    host.appendChild(block);
  }

  renderTransportFilter(link, powered) {
    const host = this.parts.right;
    if (!host) return;
    host.textContent = '';
    const status = document.createElement('p');
    status.className = powered
      ? 'backpack-grid-hint transport-link-power is-ok'
      : 'backpack-grid-hint transport-link-power is-off';
    status.textContent = powered
      ? '来源在供能范围内时，每条线每秒最多运 1 个（堆叠逐个运），每次消耗 0.5 魔力（目标不必在供能范围内）。'
      : '请把来源容器建在基地或魔力炉供能范围内，并保证供能源魔力充足。';
    host.appendChild(status);
    mountStationStoragePane(host, { filter: link.filter }, {
      hostClass: 'station-side',
      title: '传输过滤',
      showStorePriority: false,
      filterHintWhitelist: '白名单：只运送名单里的种类；空名单不运任何种类。可从 B 键背包或箱子界面拖物品到下方登记。',
      filterHintBlacklist: '黑名单：除名单外都运；空名单=任意种类。可从背包/箱子拖物品到下方登记。',
      datasets: LINK_DATASETS
    });
  }

  onClick(event) {
    if (event.target.closest('[data-tlink-close]')) {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.target.closest('[data-tlink-remove]')) {
      event.preventDefault();
      const id = this.linkId;
      if (id) this.game?.transport?.removeLink?.(id);
      this.close();
      this.game?.hints?.setHintOnce?.('运输线已断开', 'transport-link-removed');
      return;
    }
    const mode = event.target.closest('[data-transport-link-mode]');
    if (mode) {
      event.preventDefault();
      this.game?.transport?.setFilterMode?.(this.linkId, mode.dataset.transportLinkMode);
      return;
    }
    const chip = event.target.closest('[data-transport-link-filter-item]');
    if (chip && !this.suppressClick) {
      event.preventDefault();
      this.game?.transport?.removeFilterItem?.(this.linkId, chip.dataset.transportLinkFilterItem);
    }
    this.suppressClick = false;
  }

  onPointerMove(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    if (Math.hypot(event.clientX - this.drag.x, event.clientY - this.drag.y) > 4) {
      this.drag.moved = true;
    }
  }

  onPointerUp(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const drag = this.drag;
    this.drag = null;
    if (!drag.moved || !drag.itemId) return;
    this.suppressClick = true;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const filter = hit?.closest?.('[data-transport-link-filter]');
    if (filter) {
      this.game?.transport?.addFilterItem?.(this.linkId, drag.itemId);
    }
  }

  /** 背包 / 箱子拖物品到运输线过滤区 */
  acceptFilterDrop(itemId) {
    if (!this.isOpen() || !itemId) return false;
    this.game?.transport?.addFilterItem?.(this.linkId, itemId);
    return true;
  }
}

/** @deprecated 使用 TransportLinkPanelUi */
export class TransportPanelUi extends TransportLinkPanelUi {}

export function transportPanelFor() {
  return null;
}
