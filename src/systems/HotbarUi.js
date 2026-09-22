import { itemDefinition, itemName } from './items.js';

/**
 * 物品快捷栏（方案第 9 节的「物品快捷栏」）。
 *
 * 槽位来源不是玩家手动配置，而是**基地里当前可放置的建筑**：
 * 现在可放置的东西只有熔炉/魔力炉/科研站/附魔台，手工配置一排槽位没有意义，
 * 而且"库存里没有了槽位还亮着"这种状态本身就该避免。
 * 以后出现"可使用物品"（药剂、卷轴之类）时再扩展 `Game.hotbarItems()` 的取材范围。
 *
 * 交互：数字键 1..9 或点击 → 进入该建筑的放置模式；再按同一个键取消。
 * 这不是装饰性 UI：它把"按 I 开面板 → 找到那件东西 → 点放置"压成一次按键。
 */

const REFRESH_INTERVAL_MS = 400;
const MAX_SLOTS = 9;

export class HotbarUi {
  constructor(game, options = {}) {
    this.game = game;
    this.mount = options.mount ?? (typeof document !== 'undefined' ? document.body : null);
    this.root = null;
    this.slots = [];
    this.lastSignature = '';
    this.refreshTimer = null;
    this.bound = false;
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
      root.addEventListener('pointerdown', (event) => event.stopPropagation());
      root.addEventListener('click', (event) => this.onClick(event));
      root.addEventListener('contextmenu', (event) => event.preventDefault());
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
    const visible = items.slice(0, MAX_SLOTS);
    const activeItemId = game?.placingItem?.itemId ?? null;
    const signature = JSON.stringify({
      items: visible.map((entry) => [entry.itemId, entry.count]),
      activeItemId
    });
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    if (!visible.length) {
      // 没有可放置的东西就整条藏起来：留一排空槽位只会占地方
      this.root.hidden = true;
      this.root.textContent = '';
      this.slots = [];
      return;
    }
    this.root.hidden = false;
    this.root.textContent = '';
    this.slots = visible.map((entry, index) => {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = entry.itemId === activeItemId
        ? 'item-hotbar-slot is-active'
        : 'item-hotbar-slot';
      slot.dataset.hotbarIndex = String(index);
      slot.dataset.itemId = entry.itemId;
      slot.title = entry.itemId === activeItemId
        ? `再按一次 ${index + 1} 取消放置`
        : `放置${entry.name}（按 ${index + 1}）`;
      const key = document.createElement('span');
      key.className = 'item-hotbar-key';
      key.textContent = String(index + 1);
      const name = document.createElement('span');
      name.className = 'item-hotbar-name';
      name.textContent = entry.name;
      const count = document.createElement('span');
      count.className = 'item-hotbar-count';
      count.textContent = `×${entry.count}`;
      slot.append(key, name, count);
      this.root.appendChild(slot);
      return slot;
    });
  }

  onClick(event) {
    const slot = event.target.closest('[data-hotbar-index]');
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
