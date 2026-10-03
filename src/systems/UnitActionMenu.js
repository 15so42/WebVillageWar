/**
 * 单选友方/可交互单位后，在屏幕底部快捷栏正上方展开操作按钮。
 *
 * 建筑：设施 / 工作台·箱子背包（B）。
 * 选中基地（点营地）时显示 **背包（B）**；运输线在容器上拖拽即可连线。
 */
import { facilityPanelFor } from './FacilityPanelUi.js';
import { stationPanelFor } from './StationPanelUi.js';
import { isWorkerAutonomous } from './workOrders.js';
const BUTTON_SIZE = 52;

export class UnitActionMenu {
  constructor(game, options = {}) {
    this.game = game;
    this.mount = options.mount ?? (typeof document !== 'undefined' ? document.body : null);
    this.root = null;
    this.unit = null;
    this.containerTarget = null;
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
    this.containerTarget = null;
  }

  actionsForUnit(unit) {
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
      const station = stationPanelFor(unit);
      if (station) {
        actions.push({
          id: 'station',
          label: '背包',
          icon: station.icon,
          disabled: false,
          title: `打开${station.title}（B）`
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
        title: '打开这个单位的背包（B）'
      });
    }
    if (unit.team === 'player' && unit.isWorker === true) {
      const autonomous = isWorkerAutonomous(unit);
      actions.push({
        id: 'worker-autonomous',
        label: '自律模式',
        stateOn: autonomous,
        stateText: autonomous ? '开' : '关',
        icon: autonomous ? '◎' : '○',
        toggle: true,
        disabled: false,
        title: autonomous
          ? '自律模式：开 — 自动采集与作业；右键仅为临时集结。点击关闭（切换为指挥模式）'
          : '自律模式：关 — 指挥模式，与剑士相同（移动、索敌、驻守）。点击开启自律模式'
      });
    }
    if (unit.team === 'player' && this.game?.canControlUnit?.(unit)) {
      actions.push({
        id: 'stop',
        label: unit.isWorker === true ? '待机' : '停止',
        icon: '■',
        disabled: false,
        title: unit.isWorker === true
          ? '进入待机：不作业、不接战（X）'
          : '停止当前命令并在原地驻守'
      });
    }
    return actions;
  }

  actionsForContainer(target) {
    if (!target) return [];
    return [
      {
        id: 'backpack',
        label: '背包',
        icon: '▣',
        disabled: false,
        title: '打开基地背包（B）；拖到其它容器可连运输线'
      }
    ];
  }

  sync() {
    if (!this.available) return;
    const unit = this.game?.selectedUnits?.length === 1 ? this.game.selectedUnit : null;
    const containerTarget = this.game?.containerMenuTarget ?? null;
    const actions = unit
      ? this.actionsForUnit(unit)
      : this.actionsForContainer(containerTarget);
    if ((!unit && !containerTarget) || !actions.length) {
      this.hide();
      return;
    }
    this.ensureUi();
    this.unit = unit;
    this.containerTarget = containerTarget;
    const signature = unit
      ? `u:${unit.id}:${unit.workerAutonomous === false ? 'manual' : 'auto'}:${unit.workerStandby === true ? 'sb' : 'on'}:${actions.map((a) => a.id).join('|')}`
      : `c:${containerTarget?.stationId ?? 'base'}:${actions.map((a) => a.id).join('|')}`;
    if (signature !== this.signature) {
      this.signature = signature;
      this.renderButtons(actions);
    }
    this.root.hidden = false;
    this.root.classList.add('is-open');
  }

  hide() {
    this.unit = null;
    this.containerTarget = null;
    this.signature = '';
    if (!this.root) return;
    this.root.hidden = true;
    this.root.classList.remove('is-open');
  }

  ensureUi() {
    if (this.root) return;
    const root = document.createElement('div');
    root.id = 'unit-action-menu';
    root.className = 'unit-action-menu';
    root.hidden = true;
    this.mount.appendChild(root);
    this.root = root;
    if (!this.bound) {
      root.addEventListener('click', (event) => this.onClick(event));
      root.addEventListener('pointerdown', (event) => event.stopPropagation());
      this.bound = true;
    }
  }

  renderButtons(actions) {
    const root = this.root;
    if (!root) return;
    root.textContent = '';
    actions.forEach((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      const classes = ['unit-action-button'];
      if (action.disabled) classes.push('is-disabled');
      if (action.toggle) classes.push('is-mode-toggle');
      if (action.toggle && action.stateOn) classes.push('is-on');
      button.className = classes.join(' ');
      button.dataset.unitAction = action.id;
      button.disabled = Boolean(action.disabled);
      button.title = action.title;
      if (action.toggle) {
        button.setAttribute('aria-pressed', action.stateOn ? 'true' : 'false');
      }
      const stateHtml = action.toggle
        ? `<span class="unit-action-state" aria-hidden="true">${action.stateText}</span>`
        : '';
      button.innerHTML = `<span class="unit-action-icon" aria-hidden="true">${action.icon}</span>`
        + `<span class="unit-action-label">${action.label}</span>`
        + stateHtml;
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
    const container = this.containerTarget ?? this.game?.containerMenuTarget;
    if (action === 'facility' && unit) {
      this.game?.facilityPanel?.toggleForUnit?.(unit);
      this.sync();
      return;
    }
    if (action === 'station' && unit) {
      this.game?.stationPanel?.toggleForUnit?.(unit);
      this.sync();
      return;
    }
    if (action === 'backpack') {
      if (unit) this.game?.backpack?.openForUnit?.(unit);
      else this.game?.toggleBaseBackpack?.();
      return;
    }
    if (action === 'recruit' && unit) {
      this.game?.recruitSelectedUnit?.();
      this.sync();
      return;
    }
    if (action === 'worker-autonomous' && unit) {
      const nextAutonomous = !isWorkerAutonomous(unit);
      this.game?.work?.setWorkerAutonomous?.(unit, nextAutonomous);
      this.game?.hints?.setHint?.(
        nextAutonomous
          ? `${unit.name}：自律模式已开启`
          : `${unit.name}：自律模式已关闭（指挥模式）`,
        `worker-mode:${unit.id}`
      );
      this.sync();
      return;
    }
    if (action === 'stop' && unit) {
      this.game?.stopSelectedUnits?.();
    }
  }
}

export { BUTTON_SIZE };
