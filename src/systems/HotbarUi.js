import { itemArtForSlot } from './itemArt.js';
import { itemDefinition, itemName } from './items.js';

/**
 * 屏幕底部的物品快捷栏。
 *
 * 取材不是玩家手动配置的，而是"基地库存里现在能用掉的东西"（见 `Game.hotbarItems`）：
 *   1. 可放置的建筑 —— 点一下进入放置模式，或拖到地上直接落地；
 *   2. 能交给单位的装备（工具 / 武器 / 符文石 / 魔力石）—— 拖到单位身上就转移过去。
 *
 * 两个设计决定：
 *
 * **固定 9 格，空槽也画出来。** 早期版本是"有几件画几格、没有就整条隐藏"，
 * 那样槽位会随库存左右滑动，数字键的含义跟着变，而且**空格子是无法作为拖拽落点的**
 * ——拖到快捷栏上整理物品这种操作根本无从谈起。固定 9 格后"按 1 就是第一格"
 * 恒成立，也让"拖上去"有一个稳定的目标。
 *
 * **不再放在背包面板里。** 用户要求「快捷栏应该在屏幕下方…不应该在 b 键面板内部」：
 * 面板一打开就盖住大半个屏幕、进入放置模式还会自动关面板，快捷栏放在里面等于
 * 在最需要它的时候看不见。
 */

const REFRESH_INTERVAL_MS = 400;
export const HOTBAR_SLOT_COUNT = 9;
/** 指针移动超过这个像素数才算"拖拽"，否则当成点击（避免手抖变成掉落）。 */
const DRAG_THRESHOLD_PX = 6;

export class HotbarUi {
  constructor(game, options = {}) {
    this.game = game;
    this.mount = options.mount ?? (typeof document !== 'undefined' ? document.body : null);
    this.root = null;
    this.slots = [];
    this.lastSignature = '';
    this.refreshTimer = null;
    this.bound = false;
    /** 拖拽状态：`{ index, itemId, startX, startY, moved, ghost }` */
    this.drag = null;
    this.onWindowPointerMove = null;
    this.onWindowPointerUp = null;
  }

  get available() {
    return Boolean(this.mount);
  }

  isVisible() {
    return Boolean(this.root && !this.root.hidden);
  }

  ensureUi() {
    if (this.root || !this.available) return this.root;
    const root = document.createElement('div');
    root.id = 'item-hotbar';
    root.className = 'item-hotbar';
    root.hidden = true;
    root.setAttribute('role', 'toolbar');
    root.setAttribute('aria-label', '物品快捷栏');
    this.mount.appendChild(root);
    this.root = root;
    if (!this.bound) {
      // 面板自己吃掉指针事件，否则点到快捷栏会顺带在地图上选中/移动
      root.addEventListener('pointerdown', (event) => this.onPointerDown(event));
      root.addEventListener('click', (event) => this.onClick(event));
      root.addEventListener('contextmenu', (event) => event.preventDefault());
      root.addEventListener('pointerover', (event) => this.onPointerOver(event));
      root.addEventListener('pointerout', () => this.clearHoverHighlight());
      this.bound = true;
    }
    if (this.refreshTimer == null) {
      this.refreshTimer = window.setInterval(() => this.refresh(), REFRESH_INTERVAL_MS);
    }
    this.refresh();
    return root;
  }

  destroy() {
    if (this.refreshTimer != null) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.endDrag(null);
    if (this.root) {
      this.root.remove();
      this.root = null;
    }
    this.slots = [];
  }

  refresh() {
    if (!this.root) return;
    const game = this.game;
    const items = typeof game?.hotbarItems === 'function' ? game.hotbarItems() : [];
    const visible = items.slice(0, HOTBAR_SLOT_COUNT);
    const activeItemId = game?.placingItem?.itemId ?? null;
    const signature = JSON.stringify({
      items: visible.map((entry) => [entry.itemId, entry.count]),
      activeItemId,
      dragging: this.drag ? this.drag.itemId : null
    });
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    this.root.hidden = false;
    this.root.textContent = '';
    this.slots = [];
    for (let index = 0; index < HOTBAR_SLOT_COUNT; index += 1) {
      const entry = visible[index] ?? null;
      const slot = document.createElement(entry ? 'button' : 'div');
      if (entry) slot.type = 'button';
      slot.className = entry ? 'item-hotbar-slot' : 'item-hotbar-slot is-empty';
      slot.dataset.hotbarIndex = String(index);
      if (entry) {
        slot.dataset.itemId = entry.itemId;
        slot.dataset.hotbarKind = entry.placeable ? 'placeable' : 'givable';
      }
      const key = document.createElement('span');
      key.className = 'item-hotbar-key';
      key.textContent = String(index + 1);
      slot.appendChild(key);
      if (entry) {
        if (entry.itemId === activeItemId) slot.classList.add('is-active');
        slot.title = hotbarSlotTitle(entry);
        const art = document.createElement('span');
        art.className = 'item-hotbar-art';
        art.innerHTML = itemArtForSlot({ itemId: entry.itemId });
        const count = document.createElement('span');
        count.className = 'item-hotbar-count';
        count.textContent = `×${entry.count}`;
        slot.append(art, count);
      } else {
        slot.title = `空槽位 ${index + 1}`;
      }
      this.root.appendChild(slot);
      this.slots.push(slot);
    }
  }

  /** 悬停时把这一格的物品名显示出来（只有图标时很难认）。 */
  onPointerOver(event) {
    const slot = event.target.closest?.('[data-hotbar-index]');
    this.root?.setAttribute('data-hover-item', slot?.dataset?.itemId ?? '');
  }

  clearHoverHighlight() {
    this.root?.removeAttribute('data-hover-item');
  }

  // ------------------------------------------------------------------ 拖拽
  onPointerDown(event) {
    event.stopPropagation();
    const slot = event.target.closest?.('[data-hotbar-index]');
    if (!slot?.dataset?.itemId) return;
    const index = Number(slot.dataset.hotbarIndex);
    if (!Number.isFinite(index)) return;
    event.preventDefault();
    this.drag = {
      index,
      itemId: slot.dataset.itemId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      ghost: null,
      pointerId: event.pointerId ?? null
    };
    this.bindDragListeners();
  }

  bindDragListeners() {
    if (this.onWindowPointerMove) return;
    this.onWindowPointerMove = (event) => this.onDragMove(event);
    this.onWindowPointerUp = (event) => this.onDragEnd(event);
    window.addEventListener('pointermove', this.onWindowPointerMove);
    window.addEventListener('pointerup', this.onWindowPointerUp);
    window.addEventListener('pointercancel', this.onWindowPointerUp);
  }

  unbindDragListeners() {
    if (!this.onWindowPointerMove) return;
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('pointercancel', this.onWindowPointerUp);
    this.onWindowPointerMove = null;
    this.onWindowPointerUp = null;
  }

  onDragMove(event) {
    const drag = this.drag;
    if (!drag) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance < DRAG_THRESHOLD_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.ghost = this.createDragGhost(drag.itemId);
      this.root?.classList.add('is-dragging');
    }
    if (drag.ghost) {
      drag.ghost.style.left = `${event.clientX}px`;
      drag.ghost.style.top = `${event.clientY}px`;
    }
    this.updateDropHighlight(event.clientX, event.clientY);
  }

  onDragEnd(event) {
    const drag = this.drag;
    if (!drag) return;
    const wasDrag = drag.moved;
    const { index } = drag;
    this.endDrag(drag.ghost);
    if (!wasDrag) return;
    const result = this.game?.dropHotbarItemAt?.(index, event.clientX, event.clientY) ?? null;
    this.reportDrop(result, event.clientX, event.clientY);
    this.lastSignature = '';
    this.refresh();
  }

  /** 结束拖拽状态（不触发掉落）。 */
  endDrag(ghost) {
    if (ghost) ghost.remove();
    else this.drag?.ghost?.remove();
    this.drag = null;
    this.unbindDragListeners();
    this.root?.classList.remove('is-dragging');
    this.clearDropHighlight();
  }

  createDragGhost(itemId) {
    const ghost = document.createElement('div');
    ghost.className = 'item-hotbar-drag-ghost';
    ghost.dataset.hotbarDragGhost = itemId;
    ghost.innerHTML = itemArtForSlot({ itemId });
    document.body.appendChild(ghost);
    return ghost;
  }

  /**
   * 拖到单位身上时把那个单位高亮出来。
   *
   * 这一步不是为了好看：判定半径 48px 意味着"大概在这附近"就会被认成落点，
   * 没有反馈的话玩家不知道自己到底指到了谁。
   */
  updateDropHighlight(clientX, clientY) {
    const game = this.game;
    const unit = typeof game?.pickUnitFromList === 'function'
      ? game.pickUnitFromList(game.friendlyUnits ?? [], clientX, clientY, {
        screenRadius: 48,
        ignoreOwnership: true
      })
      : null;
    if (this.highlightedUnit === unit) return;
    this.clearDropHighlight();
    this.highlightedUnit = unit ?? null;
    if (unit?.statusElement) unit.statusElement.classList.add('is-hotbar-drop-target');
    this.root?.setAttribute('data-drop-target', unit ? (unit.name ?? unit.type ?? 'unit') : '');
  }

  clearDropHighlight() {
    if (this.highlightedUnit?.statusElement) {
      this.highlightedUnit.statusElement.classList.remove('is-hotbar-drop-target');
    }
    this.highlightedUnit = null;
    this.root?.removeAttribute('data-drop-target');
  }

  reportDrop(result, clientX, clientY) {
    const hints = this.game?.hints;
    if (!result) return;
    if (result.ok && result.target === 'unit') {
      hints?.setHint?.(
        `${itemName(result.itemId)} 已交给${result.unit?.name ?? '单位'}`,
        `hotbar-drop:${result.itemId}`
      );
      return;
    }
    if (result.ok && result.target === 'ground') {
      if (result.pending) {
        hints?.setHint?.(
          `${itemName(result.itemId)}：松手的位置放不下，左键选位置，右键取消`,
          `hotbar-drop-pending:${result.itemId}`
        );
      }
      return;
    }
    const reasons = {
      no_target: '拖到己方单位身上才能交给他，或拖到地上放建筑',
      not_givable: '这件东西不能交给单位',
      unit_has_no_bag: '这个单位没有物品背包',
      not_in_stock: '基地库存里已经没有这件东西了',
      empty_slot: '这一格是空的'
    };
    const reason = reasons[result.reason] ?? `放不下（${result.reason ?? '未知原因'}）`;
    hints?.setHintOnce?.(`${itemName(result.itemId)}：${reason}`, `hotbar-drop-fail:${result.itemId}`);
  }

  onClick(event) {
    const slot = event.target.closest?.('[data-hotbar-index]');
    if (!slot) return;
    event.preventDefault();
    event.stopPropagation();
    const index = Number(slot.dataset.hotbarIndex);
    if (!Number.isFinite(index)) return;
    this.game?.activateHotbarSlot?.(index);
    this.lastSignature = '';
    this.refresh();
  }
}

/** 快捷栏槽位里那件物品的名字（外部断言/日志用）。 */
export function hotbarSlotLabel(entry) {
  if (!entry?.itemId) return '';
  return itemDefinition(entry.itemId)?.name ?? itemName(entry.itemId);
}

/** 槽位提示：说清"这一格能怎么用"，而不是只报名字。 */
export function hotbarSlotTitle(entry) {
  if (!entry?.itemId) return '';
  const count = entry.count > 1 ? ` ×${entry.count}` : '';
  if (entry.placeable) {
    return `${entry.name}${count}：点击进入放置模式，或直接拖到地面上建造`;
  }
  return `${entry.name}${count}：拖到己方单位身上交给它`;
}
