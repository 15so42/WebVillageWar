// 固定在视口上的物品详情悬浮框（背包格、站点格共用）。
import { buildItemTooltipModel } from './itemTooltip.js';

let sharedTooltip = null;

export function getItemTooltipUi() {
  if (!sharedTooltip) sharedTooltip = new ItemTooltipUi();
  return sharedTooltip;
}

/**
 * 给格子绑定悬浮提示（mouseenter / mousemove / mouseleave）。
 * @param {HTMLElement} element
 * @param {() => object|null} resolveSlot
 * @param {() => object} [resolveContext]
 */
export function bindItemTooltip(element, resolveSlot, resolveContext = () => ({})) {
  const ui = getItemTooltipUi();
  const show = (event) => {
    const slot = resolveSlot();
    if (!slot?.itemId) return;
    const context = resolveContext() ?? {};
    ui.show(slot, context, event.clientX, event.clientY);
  };
  element.addEventListener('mouseenter', show);
  element.addEventListener('mousemove', (event) => {
    const slot = resolveSlot();
    if (!slot?.itemId) return;
    ui.move(event.clientX, event.clientY);
  });
  element.addEventListener('mouseleave', () => ui.hide());
}

export class ItemTooltipUi {
  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'item-tooltip';
    this.root.setAttribute('role', 'tooltip');
    this.root.hidden = true;
    document.body.appendChild(this.root);
  }

  show(slot, context, clientX, clientY) {
    const model = buildItemTooltipModel(slot, context);
    if (!model) {
      this.hide();
      return;
    }
    this.root.innerHTML = this.renderMarkup(model);
    this.root.hidden = false;
    this.move(clientX, clientY);
  }

  hide() {
    this.root.hidden = true;
  }

  move(clientX, clientY) {
    if (this.root.hidden) return;
    const margin = 14;
    const rect = this.root.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = clientX;
    let y = clientY - margin;
    let below = false;
    if (y - rect.height < 8) {
      y = clientY + margin;
      below = true;
    }
    const halfW = rect.width / 2;
    x = Math.max(halfW + 8, Math.min(vw - halfW - 8, x));
    if (below) {
      this.root.classList.add('is-below');
      this.root.style.left = `${x}px`;
      this.root.style.top = `${y}px`;
      this.root.style.transform = 'translate(-50%, 0)';
    } else {
      this.root.classList.remove('is-below');
      this.root.style.left = `${x}px`;
      this.root.style.top = `${y}px`;
      this.root.style.transform = 'translate(-50%, -100%)';
    }
    if (y + rect.height > vh - 8 && !below) {
      this.root.classList.add('is-below');
      this.root.style.top = `${clientY + margin}px`;
      this.root.style.transform = 'translate(-50%, 0)';
    }
  }

  renderMarkup(model) {
    const rows = [
      ['种类', model.category],
      ['攻击力', model.attack],
      ['耐久值', model.durability]
    ];
    const stats = rows.map(([label, value]) => `
      <div class="item-tooltip-row">
        <span class="item-tooltip-label">${label}</span>
        <span class="item-tooltip-value">${value}</span>
      </div>`).join('');
    const desc = model.description
      ? `<p class="item-tooltip-desc">${escapeHtml(model.description)}</p>`
      : '';
    return `
      <div class="item-tooltip-name">${escapeHtml(model.name)}</div>
      <div class="item-tooltip-stats">${stats}</div>
      ${desc}`;
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
