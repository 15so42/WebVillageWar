/**
 * 单选友方/可交互单位后，在屏幕底部快捷栏正上方展开操作按钮。
 *
 * 建筑：设施 / 工作台·箱子背包（B）。
 * 选中基地（点营地）时显示 **背包（B）**；运输线在容器上拖拽即可连线。
 */
import { facilityPanelFor } from './FacilityPanelUi.js';
import { stationPanelFor } from './StationPanelUi.js';
import { isWorkerAutonomous } from './workOrders.js';
import { REPAIR_REQUEST_STATE, REPAIR_STATE_LABELS } from './buildingRepair.js';
const BUTTON_SIZE = 52;

/**
 * 防御终端在扇形菜单里那一项：显示等级与"能不能升级"。
 *
 * 点它打开塔界面（材料 / 资格 / 施工进度都在那里），
 * 而不是在这里直接扣材料——升级是一次有材料、有资格、有施工时间的投资，
 * 一次误触不该花掉 24 木材。
 */
export function towerActionFor(status) {
  if (!status) return null;
  const label = status.upgrading
    ? `升级 ${Math.round((status.progress ?? 0) * 100)}%`
    : (status.maxed ? `${status.tierLabel} 级` : `升级到 ${status.targetTier} 级`);
  return {
    id: 'tower',
    label,
    icon: status.maxed ? '★' : '⇧',
    disabled: false,
    title: [
      `${status.role?.name ?? ''}（${status.tierLabel} 级）`,
      status.role?.purpose ?? '',
      status.maxed ? '已经三级' : (status.ok ? '材料齐备，可以升级' : (status.label || '暂不可升级'))
    ].filter(Boolean).join(' · ')
  };
}

/**
 * 脱战维修状态：只在**真的有请求**时出现一项，而且是只读的。
 *
 * 「用少量克制的状态标记，维修动作与粒子复用既有材质；没有任务时不常驻大图标」——
 * 所以这里不画世界大图标，只在选中这栋建筑时给一行状态。
 */
export function repairActionFor(request) {
  if (!request) return null;
  const state = request.state ?? REPAIR_REQUEST_STATE.waiting;
  const label = REPAIR_STATE_LABELS[state] ?? '待维修';
  const material = request.status?.material ?? request.lastMaterial ?? null;
  const gap = Math.round(request.status?.healthGap ?? 0);
  return {
    id: 'repair-status',
    label,
    icon: state === REPAIR_REQUEST_STATE.assigned ? '🔧'
      : state === REPAIR_REQUEST_STATE.missingMaterial ? '⚠' : '⛭',
    disabled: true,
    statusOnly: true,
    title: [
      `脱战维修：${label}`,
      gap > 0 ? `生命缺口 ${gap}` : '',
      material ? `材料 ${material}` : '',
      state === REPAIR_REQUEST_STATE.pending ? '交战中不施工，脱战后自动派工' : '',
      state === REPAIR_REQUEST_STATE.missingMaterial ? '库存里没有这种材料，修好前先补料' : ''
    ].filter(Boolean).join(' · ')
  };
}

/**
 * 主动拆除：只有"玩家真的付过材料"的建筑才给这个入口。
 *
 * 初始基地、免费生成对象与奖励对象没有 `paidInvestment`，
 * `recyclePreview().ok` 就会是 false——返还不出没支付过的成本，也不能拆基地绕过败局规则
 * （见 docs/DSH_RESOURCE_SUSTAINABILITY.md「材料回收缓冲失误」）。
 * 按钮标题直接写清比例与返还清单，因为回收物是**落地掉落**、要傀儡搬。
 */
export function demolishActionFor(game, unit) {
  const preview = game?.salvage?.recyclePreview?.(unit) ?? null;
  if (!preview?.ok) return null;
  const refund = (preview.refunded ?? []).map((entry) => `${entry.itemId}×${entry.count}`).join('、');
  return {
    id: 'demolish',
    label: '拆除',
    icon: '⛏',
    disabled: false,
    title: `拆除这栋建筑：回收约 ${Math.round((preview.ratio ?? 0) * 100)}% 的材料`
      + `（${refund || '无'}），落在地上需要傀儡搬运`
  };
}

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
      // 防御终端：扇形菜单直接给"升级 / 已满级"，并把脱战维修状态写成一行字。
      // 塔没有进料格，没有"背包"这回事，所以它不该走 station 分支。
      const tower = this.game?.towerUpgrades?.status?.(unit) ?? null;
      if (tower) {
        actions.push(towerActionFor(tower));
        const repair = this.game?.repairDispatch?.requestFor?.(unit.id) ?? null;
        if (repair) actions.push(repairActionFor(repair));
        const demolish = demolishActionFor(this.game, unit);
        if (demolish) actions.push(demolish);
        return actions;
      }
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
      const repair = this.game?.repairDispatch?.requestFor?.(unit.id) ?? null;
      if (repair) actions.push(repairActionFor(repair));
      const demolish = demolishActionFor(this.game, unit);
      if (demolish) actions.push(demolish);
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
    // 防御终端那一项的标签会随等级/施工进度变化，所以签名必须带上它的状态，
    // 否则"升级到 2 级"会在升级完成后继续挂在菜单上。
    const towerSignature = unit?.isBuilding
      ? (() => {
        const tower = this.game?.towerUpgrades?.status?.(unit) ?? null;
        if (!tower) return 'none';
        return `${tower.tier}/${tower.upgrading ? Math.round(tower.progress * 50) : 'idle'}/${tower.maxed ? 'max' : tower.targetTier}`;
      })()
      : 'none';
    const signature = unit
      ? `u:${unit.id}:${unit.workerAutonomous === false ? 'manual' : 'auto'}:${unit.workerStandby === true ? 'sb' : 'on'}:${towerSignature}:${actions.map((a) => a.id + (a.statusOnly ? `:${a.label}` : '')).join('|')}`
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
    if (action === 'tower' && unit) {
      this.game?.towerPanel?.toggleForUnit?.(unit);
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
    if (action === 'demolish' && unit) {
      this.game?.salvage?.demolishBuilding?.(unit);
      this.sync();
      return;
    }
    if (action === 'stop' && unit) {
      this.game?.stopSelectedUnits?.();
    }
  }
}

export { BUTTON_SIZE };
