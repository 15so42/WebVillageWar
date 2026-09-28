/**
 * 单选友方/可交互单位后，在屏幕底部快捷栏正上方展开操作按钮。
 *
 * 建筑：设施 / 工作台·箱子 + **运输连线**。
 * 选中基地（点营地）时同样显示 **背包 / 运输**。
 */
import { facilityPanelFor } from './FacilityPanelUi.js';
import { stationPanelFor } from './StationPanelUi.js';
import { playerBaseTransportEndpoint, transportEndpointFromUnit } from './transport.js';

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

  transportEndpointForUnit(unit) {
    if (!unit?.alive) return null;
    return transportEndpointFromUnit(unit, this.game?.stations);
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
          label: station.title,
          icon: station.icon,
          disabled: false,
          title: `打开${station.title}`
        });
      }
      if (this.transportEndpointForUnit(unit)) {
        actions.push({
          id: 'transport',
          label: '运输',
          icon: '↝',
          disabled: false,
          title: unit.type === 'furnace'
            ? '运输线：连入=进料，从熔炉连出=产物输出'
            : '连接运输线：先点来源容器，再点目标容器'
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

  actionsForContainer(target) {
    if (!target) return [];
    return [
      {
        id: 'backpack',
        label: '背包',
        icon: '▣',
        disabled: false,
        title: '打开基地背包（B）'
      },
      {
        id: 'transport',
        label: '运输',
        icon: '↝',
        disabled: false,
        title: '从基地连到其他容器，或从其他容器连到基地'
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
      ? `u:${unit.id}:${actions.map((a) => a.id).join('|')}`
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
    if (action === 'transport') {
      const origin = unit
        ? this.transportEndpointForUnit(unit)
        : (container ?? playerBaseTransportEndpoint());
      this.game?.beginTransportLink?.(origin);
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
    if (action === 'stop' && unit) {
      this.game?.stopSelectedUnits?.();
    }
  }
}

export { BUTTON_SIZE };
