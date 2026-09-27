/**
 * 单选友方/可交互单位后，在屏幕底部快捷栏正上方展开操作按钮。
 *
 * 每个按钮是圆形图标 + 下方文字。动作按单位状态决定：
 *   - 己方单位：背包、停止（木傀儡无「停止」）
 *   - 可招募的野外单位：招募
 *   - 建筑：科研站 / 附魔台的界面入口
 *
 * 本模块只负责 DOM，真正的动作都交回 Game。
 */
import { facilityPanelFor } from './FacilityPanelUi.js';

const BUTTON_SIZE = 52;

export class UnitActionMenu {
  constructor(game, options = {}) {
    this.game = game;
    this.mount = options.mount ?? (typeof document !== 'undefined' ? document.body : null);
    this.root = null;
    this.unit = null;
    this.signature = '';
    this.bound = false;
  }

  get available() {
    return Boolean(this.mount);
  }

  destroy() {
    this.root?.remove();
    this.root = null;
    this.unit = null;
  }

  actionsFor(unit) {
    if (!unit?.alive) return [];
    const actions = [];
    if (unit.isBuilding === true) {
      const facility = facilityPanelFor(unit);
      if (facility) {
        actions.push({
          id: 'facility',
          label: facility.title,
          icon: facility.tab === 'tech' ? '⚗' : '✶',
          disabled: false,
          title: `打开${facility.title}界面`
        });
      }
      return actions;
    }
    const recruit = this.game?.recruitStatusFor?.(unit);
    if (recruit?.visible) {
      actions.push({
        id: 'recruit',
        label: recruit.label || '招募',
        icon: '⚑',
        disabled: !recruit.canRecruit,
        title: recruit.hint || '招募这名单位'
      });
    }
    const bag = this.game?.itemBagFor?.(unit, { create: false })
      ?? unit.workerInventory
      ?? unit.itemBag
      ?? null;
    const canOpenBag = unit.team === 'player'
      || Boolean(bag)
      || (typeof this.game?.itemBagFor === 'function' && Boolean(unit.definition) && unit.isBuilding !== true);
    if (canOpenBag && unit.team === 'player' && !unit.isBuilding) {
      actions.push({
        id: 'backpack',
        label: '背包',
        icon: '▣',
        disabled: false,
        title: '打开这个单位的背包（E）'
      });
    }
    if (unit.team === 'player' && unit.isWorker !== true && this.game?.canControlUnit?.(unit)) {
      actions.push({
        id: 'stop',
        label: '停止',
        icon: '■',
        disabled: false,
        title: '停止当前命令'
      });
    }
    return actions;
  }

  sync() {
    if (!this.available) return;
    const unit = this.game?.selectedUnits?.length === 1 ? this.game.selectedUnit : null;
    const actions = this.actionsFor(unit);
    if (!unit || !actions.length) {
      this.hide();
      return;
    }
    this.ensureUi();
    this.unit = unit;
    const signature = `${unit.id}:${actions.map((action) => `${action.id}:${action.disabled ? 1 : 0}:${action.label}`).join('|')}`;
    if (signature !== this.signature) {
      this.signature = signature;
      this.renderButtons(actions);
    }
    this.root.hidden = false;
    this.root.classList.add('is-open');
  }

  hide() {
    this.unit = null;
    this.signature = '';
    if (!this.root) return;
    this.root.hidden = true;
    this.root.classList.remove('is-open');
  }

  ensureUi() {
    if (this.root || !this.available) return this.root;
    const root = document.createElement('div');
    root.id = 'unit-action-menu';
    root.className = 'unit-action-menu';
    root.hidden = true;
    root.setAttribute('role', 'menu');
    root.setAttribute('aria-label', '单位操作');
    this.mount.appendChild(root);
    this.root = root;
    if (!this.bound) {
      root.addEventListener('pointerdown', (event) => event.stopPropagation());
      root.addEventListener('click', (event) => this.onClick(event));
      this.bound = true;
    }
    return root;
  }

  renderButtons(actions) {
    const root = this.root;
    if (!root) return;
    root.textContent = '';
    actions.forEach((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = action.disabled ? 'unit-action-button is-disabled' : 'unit-action-button';
      button.dataset.unitAction = action.id;
      button.disabled = Boolean(action.disabled);
      button.title = action.title;
      button.innerHTML = `<span class="unit-action-icon" aria-hidden="true">${action.icon}</span>`
        + `<span class="unit-action-label">${action.label}</span>`;
      root.appendChild(button);
    });
  }

  onClick(event) {
    const button = event.target.closest('[data-unit-action]');
    if (!button || button.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const action = button.dataset.unitAction;
    const unit = this.unit;
    if (!unit) return;
    if (action === 'facility') {
      this.game?.facilityPanel?.toggleForUnit?.(unit);
      this.sync();
      return;
    }
    if (action === 'backpack') {
      this.game?.backpack?.openForUnit?.(unit);
      return;
    }
    if (action === 'recruit') {
      this.game?.recruitSelectedUnit?.();
      this.sync();
      return;
    }
    if (action === 'stop') {
      this.game?.stopSelectedUnits?.();
    }
  }
}

export { BUTTON_SIZE };
