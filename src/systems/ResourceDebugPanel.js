// L 键：后勤资源调试（仅开发/测试用，往基地背包加资源）。
import { ITEM_DEFINITIONS, RESOURCE_TYPES } from '../data/gameData.js';
import { itemName } from './items.js';

const DEFAULT_AMOUNT = 64;

const RESOURCE_BUTTONS = [
  ...Object.keys(RESOURCE_TYPES),
  'charcoal',
  'sapling',
  'manaCore',
  'manaStone',
].filter((id, index, list) => list.indexOf(id) === index && ITEM_DEFINITIONS[id]);

export class ResourceDebugPanel {
  constructor(game) {
    this.game = game;
    this.root = document.createElement('section');
    this.root.className = 'debug-scene-panel resource-debug-panel';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', '资源调试面板');
    document.body.appendChild(this.root);
    this.render();

    const signal = game.eventController?.signal;
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation(), { signal });
    this.root.addEventListener('click', (event) => this.onClick(event), { signal });
    this.root.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() !== 'escape' && event.key.toLowerCase() !== 'l') return;
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }, { signal });
  }

  isOpen() {
    return !this.root.hidden;
  }

  open() {
    this.root.hidden = false;
    document.body.classList.add('is-resource-debug-open');
    this.refreshStatus();
  }

  close() {
    this.root.hidden = true;
    document.body.classList.remove('is-resource-debug-open');
  }

  toggle() {
    if (this.isOpen()) this.close();
    else this.open();
  }

  destroy() {
    this.close();
    this.root.remove();
  }

  refreshStatus() {
    const el = this.root.querySelector('[data-resource-debug-status]');
    if (!el) return;
    const inv = this.game?.baseInventory;
    const used = inv?.usedSlots?.() ?? 0;
    const cap = inv?.capacity ?? 0;
    el.textContent = `基地背包 ${used}/${cap}`;
  }

  render() {
    const buttons = RESOURCE_BUTTONS.map((itemId) => {
      const label = itemName(itemId) || itemId;
      return `<button type="button" data-resource-add="${itemId}">+${DEFAULT_AMOUNT} ${label}</button>`;
    }).join('');
    this.root.innerHTML = `
      <div class="debug-scene-panel__header resource-debug-header">
        <div>
          <span>LOGISTICS</span>
          <strong>资源调试（L）</strong>
        </div>
        <button type="button" class="resource-debug-close" data-resource-debug-close aria-label="关闭">×</button>
      </div>
      <p class="resource-debug-hint" data-resource-debug-status>基地背包 —</p>
      <label class="resource-debug-amount">
        <span>每次数量</span>
        <input type="number" min="1" max="9999" value="${DEFAULT_AMOUNT}" data-resource-debug-amount>
      </label>
      <div class="resource-debug-grid">${buttons}</div>
      <button type="button" class="resource-debug-fill" data-resource-fill-common>常用一套（木石铁食纤各 64 + 木炭 32）</button>
    `;
  }

  amountValue() {
    const input = this.root.querySelector('[data-resource-debug-amount]');
    const n = Math.floor(Number(input?.value) || DEFAULT_AMOUNT);
    return Math.max(1, Math.min(9999, n));
  }

  addResource(itemId, count) {
    const inv = this.game?.baseInventory;
    if (!inv?.add) return;
    const added = inv.add(itemId, count, { allowPartial: true });
    this.game?.backpack?.markDirty?.();
    this.game?.stationPanel?.markDirty?.();
    this.refreshStatus();
    const name = itemName(itemId) || itemId;
    const moved = added?.moved ?? (added?.ok ? count : 0);
    this.game?.hints?.setHintOnce?.(
      moved > 0 ? `已添加 ${name} ×${moved}` : `${name} 背包已满`,
      `resource-debug:${itemId}`
    );
  }

  onClick(event) {
    if (event.target.closest('[data-resource-debug-close]')) {
      event.preventDefault();
      this.close();
      return;
    }
    const addBtn = event.target.closest('[data-resource-add]');
    if (addBtn) {
      event.preventDefault();
      this.addResource(addBtn.dataset.resourceAdd, this.amountValue());
      return;
    }
    if (event.target.closest('[data-resource-fill-common]')) {
      event.preventDefault();
      const pack = [
        ['wood', 64],
        ['stone', 64],
        ['iron', 64],
        ['food', 64],
        ['fiber', 64],
        ['charcoal', 32]
      ];
      pack.forEach(([id, n]) => this.addResource(id, n));
    }
  }
}
