import { itemArtForSlot } from './itemArt.js';
import { itemDefinition, itemName, ITEM_USE } from './items.js';
import { HOTBAR_CONTAINER_KEY } from './BackpackUi.js';

/**
 * 屏幕底部的物品快捷栏。
 *
 * **它本身是一个 9 格容器**（`Game.hotbarInventory`，和基地背包同一类的 `Inventory`），
 * 不是"基地库存里能用的东西"的自动投影。格子内容、顺序全部由玩家决定：
 * 打开 B 面板把东西拖进来 / 拖回去，关掉面板之后这些格子才是"用的入口"。
 *
 * 于是这一栏有**两种模式**，由"背包面板开没开"决定，这是本文件最要紧的一条规则：
 *
 *   背包开着  → **搬运模式**：格子是背包光标的落点（拿起 / 放下 / 交换 / 拿一半），
 *               和使用无关。把东西拖到这一栏 = 放进快捷栏。
 *   背包关着  → **使用模式**：点一下 / 按数字键 = 用掉（建筑进放置模式、消耗品直接用、
 *               装备交给选中单位）；直接拖出去松手也是"用"。
 *
 * 为什么必须由面板状态来分：同一个"把东西拖到快捷栏上"的动作，在两种情境下
 * 意思正好相反（存进去 vs 用出去）。让它们同时成立是不可能的，所以规则要显式、
 * 要能一眼看出来（界面上有 `is-transfer-mode` 提示）。
 *
 * 固定 9 格、空槽也画：槽位序号就是数字键 1..9 的含义，"有几件画几格"会让按键
 * 含义随库存滑动，而且空格子就无法作为拖拽落点。
 *
 * ⚠️ 为什么下面这些规则带 `body.is-game-active` 前缀和 `!important`：
 * styles.css 里有一条全局的"桌游按钮"皮肤
 *
 *     body.is-game-active button { border: … !important; border-radius: 5px !important;
 *                                  background: … !important }
 *     body.is-game-active button:hover { transform: translateY(-2px) !important }
 *
 * 它给游戏内**每一个** <button> 强制了边框、圆角与底色。快捷栏格子是 <button>，
 * 不覆盖就变成一排圆角小方块，而且悬停时会整体上浮 2px、把格子从原位挪开。
 * 选择器写得比 `body.is-game-active button` 更具体（0,2,1 > 0,1,2）即可胜出。
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

  /**
   * 搬运模式：背包面板开着的时候，这一栏是"另一个容器"，不是使用入口。
   * 使用流程（放置 / 消耗 / 交给单位）只在背包关掉之后成立——见文件头部的说明。
   */
  isTransferMode() {
    return Boolean(this.game?.backpack?.isOpen?.());
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
    const transferMode = this.isTransferMode();
    // 光标上那一叠也要进签名：搬运模式下"背包手里拿着东西"必须让提示文案跟着变。
    const held = game?.backpack?.cursor ?? null;
    const signature = JSON.stringify({
      items: visible.map((entry) => (entry ? [entry.itemId, entry.count, entry.useKind] : null)),
      activeItemId,
      transferMode,
      held: held ? [held.itemId, held.count] : null,
      dragging: this.drag ? this.drag.itemId : null
    });
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    this.root.hidden = false;
    this.root.classList.toggle('is-transfer-mode', transferMode);
    this.root.dataset.hotbarMode = transferMode ? 'transfer' : 'use';
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
        // 用途写进 DOM：提示文案、验收断言、CSS 都读同一个值。
        slot.dataset.hotbarUse = entry.useKind ?? 'inert';
      }
      const key = document.createElement('span');
      key.className = 'item-hotbar-key';
      key.textContent = String(index + 1);
      slot.appendChild(key);
      if (entry) {
        if (entry.itemId === activeItemId) slot.classList.add('is-active');
        slot.title = hotbarSlotTitle(entry, { transferMode });
        const art = document.createElement('span');
        art.className = 'item-hotbar-art';
        art.innerHTML = itemArtForSlot({ itemId: entry.itemId });
        const count = document.createElement('span');
        count.className = 'item-hotbar-count';
        count.textContent = `×${entry.count}`;
        slot.append(art, count);
      } else {
        slot.title = transferMode
          ? `空槽位 ${index + 1}：把基地背包里的东西拖到这一格`
          : `空槽位 ${index + 1}：打开背包（B）拖东西进来`;
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
    if (!slot) return;
    const index = Number(slot.dataset.hotbarIndex);
    if (!Number.isFinite(index)) return;
    event.preventDefault();
    // 搬运模式：这一栏是背包光标的落点。空格子也要接（拖进去就是往空槽放），
    // 所以这里不能像使用模式那样先把空槽挡掉。
    if (this.isTransferMode()) {
      this.game?.backpack?.handleSlotClick?.(index, {
        right: event.button === 2,
        container: HOTBAR_CONTAINER_KEY
      });
      this.lastSignature = '';
      this.refresh();
      return;
    }
    if (!slot.dataset.itemId) return;
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

  /** 这一格的用途（place / consume / give / null）。 */
  useKindAt(index) {
    return this.game?.hotbarItems?.()?.[index]?.useKind ?? null;
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
      // 建筑：拖出去的这一下**就进入放置模式**，世界里的半透明预览立刻跟着指针走，
      // 松手落在合法位置才真的建起来（见 onDragEnd / Game.dropHotbarItemAt）。
      // 等到松手才建的话玩家是"盲放"——落点合不合法要等建完才知道。
      if (this.useKindAt(drag.index) === ITEM_USE.place) {
        const started = this.game?.beginPlacement?.(drag.itemId, {
          source: this.game?.hotbarSource?.(drag.index)
        }) ?? null;
        drag.placementStarted = started?.ok === true;
      }
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
    // 松手时指针还压在快捷栏自己身上 = 反悔：不放置、不使用。
    // 没有这条的话，"从槽位里拖出来又拖回去"会把建筑建到栏后面的地上、
    // 或者把消耗品直接吃掉——两种都不是玩家想要的。
    if (this.isPointerOverSelf(event.clientX, event.clientY)) {
      // 建筑在拖动开始时就已经进了放置模式，这里要把它退掉，
      // 否则松手之后预览还挂在指针上，玩家以为自己还在放。
      if (drag.placementStarted) this.game?.cancelPlacement?.();
      this.lastSignature = '';
      this.refresh();
      return;
    }
    const result = this.game?.dropHotbarItemAt?.(index, event.clientX, event.clientY) ?? null;
    this.reportDrop(result, event.clientX, event.clientY);
    this.lastSignature = '';
    this.refresh();
  }

  /** 指针是不是落在快捷栏自己那块矩形里（拖拽落点判定用）。 */
  isPointerOverSelf(clientX, clientY) {
    const rect = this.root?.getBoundingClientRect?.() ?? null;
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
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
      no_target: '拖到己方单位身上才能交给他',
      not_givable: '这件东西不能交给单位',
      unit_has_no_bag: '这个单位没有物品背包',
      not_in_stock: '这一格已经没有这件东西了',
      empty_slot: '这一格是空的',
      not_usable: '这一格的东西不能直接使用（材料请在背包里合成）'
    };
    // 放置失败的原因由 Game 给出人话（如"离供能范围太远"），优先用它。
    const reason = result.label || reasons[result.reason] || `放不下（${result.reason ?? '未知原因'}）`;
    hints?.setHintOnce?.(`${itemName(result.itemId)}：${reason}`, `hotbar-drop-fail:${result.itemId}`);
  }

  onClick(event) {
    const slot = event.target.closest?.('[data-hotbar-index]');
    if (!slot) return;
    event.preventDefault();
    event.stopPropagation();
    // 搬运模式下这一下已经在 pointerdown 里交给背包的光标了，
    // 这里绝不能再走使用——否则"点一下把装备放进快捷栏"会顺手把它交给单位。
    if (this.isTransferMode()) return;
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
export function hotbarSlotTitle(entry, { transferMode = false } = {}) {
  if (!entry?.itemId) return '';
  const count = entry.count > 1 ? ` ×${entry.count}` : '';
  if (transferMode) {
    return `${entry.name}${count}：背包开着时这一栏是容器——点一下拿起 / 放下，和基地背包互搬`;
  }
  if (entry.useKind === ITEM_USE.place) {
    return `${entry.name}${count}：点击或按数字键进入放置模式（预览跟鼠标走，左键落地、右键取消），也可直接拖到地上建造`;
  }
  if (entry.useKind === ITEM_USE.consume) {
    return `${entry.name}${count}：点击或按数字键直接使用；拖出去松手也是使用`;
  }
  if (entry.useKind === ITEM_USE.give) {
    return `${entry.name}${count}：点击交给选中的单位，或拖到单位身上交给它`;
  }
  return `${entry.name}${count}：放进快捷栏的东西不能直接使用（材料请在背包里合成）`;
}
