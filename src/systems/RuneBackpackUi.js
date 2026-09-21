import {
  manaProgressForStone,
  manaThresholdForLevel,
  runeColor,
  runeDisplayName,
  runeSellValue,
  unitRuneCapacity
} from './runeStones.js';
import { RUNE_ERROR_LABELS } from './RuneStoneSystem.js';
import { createCardArtMarkup } from './CardSystem.js';
import { CARD_DEFINITIONS } from '../data/gameData.js';

/**
 * 符文背包界面。
 *
 * 两种形态：
 * - 单位视图（E 键 / 单位详情里的背包按钮）：左侧靠边，左边「单位背包」、右边「基地背包」并排，
 *   两者同时打开、一起关闭，不能只关其中一个。没有单位时不会打开（否则玩家不知道开的是谁的背包）。
 * - 基地视图（B 键）：居中显示，只展示基地存储；两种形态下右下方都吸附一个垃圾桶，拖进去即出售。
 *
 * 规则（docs/RUNE_STONE_GAMEPLAY_PLAN.md 第 3.2 / 3.4 节）：
 * - 单位背包里的石头才生效；基地背包只是存储。
 * - 同名石头可以同时放在一个单位背包里，只有排在最前的一块生效，
 *   其余同名石头灰色显示、不提供效果，但仍照常吃魔力升级（备用石）。
 * - 每个格子只放一块石头，不堆叠。
 * - 收回基地背包与出售是两个不同落点，出售前显示预计返还值。
 * - 阵亡单位的背包继续保留，可手动收回基地，绝不自动回基地。
 * - 石头显示为对应附魔的图片，等级压在图片左上角；拖拽时物品跟着光标走（类似《我的世界》）。
 *
 * 本模块只负责 DOM 与交互，所有状态变更都交回 RuneStoneSystem（联机时由 Host 校验）。
 * 界面不暂停战斗：计划要求转移不受地点与交战状态限制。
 */

const REFRESH_INTERVAL_MS = 400;
const LAUNCHER_INTERVAL_MS = 1000;

/** enchantmentId → 卡面美术 key：直接沿用附魔卡自己的 artKey，保证与卡面一致。 */
const ENCHANT_ART_KEY_BY_ID = (() => {
  const map = new Map();
  CARD_DEFINITIONS.forEach((card) => {
    if (card?.kind !== 'enchant') return;
    const enchantmentId = card.enchantmentId ?? card.effect?.buffId;
    if (!enchantmentId || map.has(enchantmentId)) return;
    map.set(enchantmentId, card.artKey ?? card.id);
  });
  return map;
})();

/** 同一附魔的图片标记是静态的，缓存起来避免每次刷新都重新拼字符串。 */
const runeArtCache = new Map();

export function runeArtMarkup(enchantmentId) {
  const key = String(enchantmentId ?? '');
  if (runeArtCache.has(key)) return runeArtCache.get(key);
  const artKey = ENCHANT_ART_KEY_BY_ID.get(key) ?? key;
  const markup = createCardArtMarkup({ id: artKey, artKey, kind: 'enchant' });
  runeArtCache.set(key, markup);
  return markup;
}

export class RuneBackpackUi {
  constructor(game, options = {}) {
    this.game = game;
    this.mount = options.mount ?? (typeof document !== 'undefined' ? document.body : null);
    this.getSelectedUnit = options.getSelectedUnit ?? (() => null);
    this.root = null;
    this.parts = null;
    this.unit = null;
    this.mode = 'unit';
    this.drag = null;
    this.dragGhost = null;
    this.refreshTimer = null;
    this.launcherTimer = null;
    this.launcher = null;
    this.launcherText = '';
    this.selectedPanelButton = null;
    this.windowHandlers = null;
    this.bound = false;
    this.lastSignature = '';
  }

  get available() {
    return Boolean(this.mount);
  }

  isOpen() {
    return Boolean(this.root && !this.root.hidden);
  }

  isOpenFor(unit) {
    return this.isOpen() && this.mode === 'unit' && this.unit === unit;
  }

  // ---- 打开 / 关闭 ----

  /** 单位视图：单位背包 + 基地背包同时打开。没有单位时拒绝打开。 */
  openForUnit(unit = null) {
    if (!this.available || !unit || unit.alive === false) return false;
    this.ensureUi();
    this.unit = unit;
    this.setMode('unit');
    this.show();
    return true;
  }

  /** 基地视图：居中只显示基地存储（B 键）。 */
  openBase() {
    if (!this.available) return false;
    this.ensureUi();
    this.unit = null;
    this.setMode('base');
    this.show();
    return true;
  }

  show() {
    this.root.hidden = false;
    this.root.classList.add('is-open');
    this.lastSignature = '';
    this.refresh();
    this.startAutoRefresh();
  }

  setMode(mode) {
    this.mode = mode === 'base' ? 'base' : 'unit';
    if (!this.root) return;
    this.root.classList.toggle('is-unit-view', this.mode === 'unit');
    this.root.classList.toggle('is-base-view', this.mode === 'base');
  }

  /** 单位视图下同单位再按一次 E 才关闭；基地视图同理。 */
  toggleForUnit(unit = null) {
    if (this.isOpen() && this.mode === 'unit' && this.unit === unit) {
      this.close();
      return false;
    }
    return this.openForUnit(unit);
  }

  toggleBase() {
    if (this.isOpen() && this.mode === 'base') {
      this.close();
      return false;
    }
    return this.openBase();
  }

  /** 两个背包一起关闭，不提供单独关闭其中一个的入口。 */
  close() {
    this.cancelDrag();
    this.stopAutoRefresh();
    this.unit = null;
    this.lastSignature = '';
    if (!this.root) return;
    this.root.hidden = true;
    this.root.classList.remove('is-open');
  }

  /**
   * 某个单位阵亡/被移除时关闭它的背包，避免面板停留在已经不存在的单位上。
   */
  closeIfUnit(unit) {
    if (!this.isOpen()) return false;
    const current = this.unit;
    if (!current || !unit) return false;
    if (current !== unit && String(current.id) !== String(unit.id)) return false;
    this.close();
    return true;
  }

  startAutoRefresh() {
    if (this.refreshTimer != null) return;
    this.refreshTimer = setInterval(() => {
      if (!this.isOpen()) {
        this.stopAutoRefresh();
        return;
      }
      this.refresh();
    }, REFRESH_INTERVAL_MS);
  }

  stopAutoRefresh() {
    if (this.refreshTimer == null) return;
    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  destroy() {
    this.close();
    if (this.windowHandlers) {
      window.removeEventListener('pointermove', this.windowHandlers.move);
      window.removeEventListener('pointerup', this.windowHandlers.up);
      window.removeEventListener('pointercancel', this.windowHandlers.cancel);
      this.windowHandlers = null;
      this.bound = false;
    }
    if (this.launcherTimer != null) {
      clearInterval(this.launcherTimer);
      this.launcherTimer = null;
    }
    this.launcher?.button?.remove();
    this.launcher = null;
    this.selectedPanelButton?.remove();
    this.selectedPanelButton = null;
    if (this.root) {
      this.root.remove();
      this.root = null;
      this.parts = null;
    }
  }

  // ---- DOM 构建 ----

  ensureUi() {
    if (this.root || !this.available) return this.root;
    this.ensureLauncher();
    this.ensureSelectedPanelButton();
    const root = document.createElement('div');
    root.id = 'rune-backpack';
    root.className = 'rune-backpack is-unit-view';
    root.hidden = true;
    root.innerHTML = `
      <div class="rune-backpack-panel" role="dialog" aria-label="符文背包">
        <header class="rune-backpack-header">
          <div class="rune-backpack-heading">
            <span class="rune-backpack-title">符文背包</span>
            <span class="rune-backpack-unit" data-rune-unit-name></span>
          </div>
          <button type="button" class="rune-backpack-close" data-rune-close aria-label="关闭背包">✕</button>
        </header>
        <p class="rune-backpack-hint">E 单位背包 · B 基地背包 · Esc 关闭 · 拖到垃圾桶出售</p>
        <div class="rune-backpack-columns">
          <section class="rune-backpack-column is-unit" data-rune-drop="unit">
            <h4 class="rune-backpack-column-title">
              <span>单位背包</span>
              <span class="rune-backpack-count" data-rune-unit-count></span>
            </h4>
            <div class="rune-backpack-slots" data-rune-unit-slots></div>
          </section>
          <section class="rune-backpack-column is-base" data-rune-drop="base">
            <h4 class="rune-backpack-column-title">
              <span>基地背包</span>
              <span class="rune-backpack-count" data-rune-base-count></span>
            </h4>
            <div class="rune-backpack-slots" data-rune-base-slots></div>
          </section>
        </div>
        <section class="rune-backpack-stranded" data-rune-stranded hidden>
          <h4 class="rune-backpack-column-title">
            <span>阵亡单位背包</span>
            <span class="rune-backpack-note">石头留在原单位，不会自动回基地</span>
          </h4>
          <div class="rune-backpack-stranded-list" data-rune-stranded-list></div>
        </section>
        <div class="rune-backpack-trash" data-rune-sell>
          <span class="rune-backpack-trash-icon" aria-hidden="true">🗑</span>
          <span class="rune-backpack-trash-label">垃圾桶</span>
          <span class="rune-backpack-trash-value" data-rune-sell-value></span>
        </div>
        <p class="rune-backpack-feedback" data-rune-feedback hidden></p>
      </div>
    `;
    this.mount.appendChild(root);

    this.parts = {
      unitName: root.querySelector('[data-rune-unit-name]'),
      unitCount: root.querySelector('[data-rune-unit-count]'),
      baseCount: root.querySelector('[data-rune-base-count]'),
      unitSlots: root.querySelector('[data-rune-unit-slots]'),
      baseSlots: root.querySelector('[data-rune-base-slots]'),
      unitColumn: root.querySelector('.rune-backpack-column.is-unit'),
      stranded: root.querySelector('[data-rune-stranded]'),
      strandedList: root.querySelector('[data-rune-stranded-list]'),
      sellZone: root.querySelector('[data-rune-sell]'),
      sellValue: root.querySelector('[data-rune-sell-value]'),
      feedback: root.querySelector('[data-rune-feedback]')
    };
    this.root = root;

    if (!this.bound) {
      root.addEventListener('pointerdown', (event) => this.onPointerDown(event));
      root.addEventListener('click', (event) => this.onClick(event));
      // 拖拽用 window 级监听，销毁时必须摘掉，避免跨对局残留。
      this.windowHandlers = {
        move: (event) => this.onPointerMove(event),
        up: (event) => this.onPointerUp(event),
        cancel: () => this.cancelDrag()
      };
      window.addEventListener('pointermove', this.windowHandlers.move);
      window.addEventListener('pointerup', this.windowHandlers.up);
      window.addEventListener('pointercancel', this.windowHandlers.cancel);
      this.bound = true;
    }
    return root;
  }

  /** 常驻入口按钮：部队全灭时也要能打开基地背包收回阵亡单位的石头。 */
  ensureLauncher() {
    if (this.launcher || !this.available) return this.launcher;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'rune-backpack-button';
    button.className = 'rune-backpack-button';
    button.innerHTML = '<span class="rune-backpack-button-icon" aria-hidden="true">◈</span>'
      + '<span class="rune-backpack-button-label">符文背包</span>'
      + '<span class="rune-backpack-button-count" data-rune-launcher-count></span>';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const unit = this.resolveLauncherUnit();
      if (unit) this.toggleForUnit(unit);
      else this.toggleBase();
    });
    this.mount.appendChild(button);
    this.launcher = {
      button,
      count: button.querySelector('[data-rune-launcher-count]')
    };
    this.updateLauncher();
    if (this.launcherTimer == null) {
      this.launcherTimer = setInterval(() => this.updateLauncher(), LAUNCHER_INTERVAL_MS);
    }
    return this.launcher;
  }

  /** 右上角单位详情里的背包按钮（跟随选中面板显示/隐藏）。 */
  ensureSelectedPanelButton() {
    if (this.selectedPanelButton || !this.available) return this.selectedPanelButton;
    const panel = document.querySelector('#selected-panel');
    if (!panel) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'rune-backpack-open';
    button.className = 'rune-backpack-open';
    button.textContent = '符文背包 (E)';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const unit = this.game?.selectedUnit ?? null;
      if (unit?.team === 'player' && unit.alive) this.toggleForUnit(unit);
      else this.toggleBase();
    });
    panel.appendChild(button);
    this.selectedPanelButton = button;
    return button;
  }

  /** 打开时跟随当前选中的己方单位；没有选中单位时返回 null（由调用方决定去开基地背包）。 */
  resolveLauncherUnit() {
    const selected = this.getSelectedUnit?.() ?? null;
    if (selected && selected.alive !== false) return selected;
    return null;
  }

  updateLauncher() {
    if (!this.launcher) return;
    const system = this.runeSystem();
    if (!system) return;
    const base = system.baseStones(this.playerId()).length;
    const stranded = system.strandedBackpacks(this.playerId())
      .reduce((sum, group) => sum + group.stones.length, 0);
    const text = stranded > 0 ? `${base}+${stranded}` : String(base);
    if (this.launcherText !== text) {
      this.launcherText = text;
      this.launcher.count.textContent = text;
    }
    this.launcher.button.title = stranded > 0
      ? `符文背包：基地 ${base} 块，阵亡单位背包 ${stranded} 块（E 单位 / B 基地）`
      : `符文背包：基地 ${base} 块（E 单位 / B 基地）`;
  }

  // ---- 渲染 ----

  runeSystem() {
    return this.game?.runeStones ?? null;
  }

  playerId() {
    return this.game?.localPlayerId ?? this.game?.localPlayerSlot ?? 'local-player';
  }

  refresh() {
    if (!this.isOpen() || !this.parts) return;
    const system = this.runeSystem();
    if (!system) return;
    const unit = this.unit;
    const hasUnit = Boolean(unit);
    // 单位在背包打开期间阵亡：立刻关闭，不要停留在已经不存在的单位上。
    if (hasUnit && unit.alive === false) {
      this.close();
      return;
    }
    const unitStones = hasUnit ? system.stonesForUnit(unit) : [];
    const baseStones = system.baseStones(this.playerId());
    const unitCapacity = hasUnit ? unitRuneCapacity(unit) : 0;
    const baseCapacity = system.stats(this.playerId()).baseCapacity;
    const strandedGroups = system.strandedBackpacks(this.playerId())
      .filter((group) => group.stones.length);

    // 图片 + 等级徽章的重建不便宜，签名没变就只刷新徽标，不重建 DOM。
    const signature = buildSignature({
      mode: this.mode,
      unitId: hasUnit ? unit.id : null,
      unitStones,
      baseStones,
      strandedGroups
    });
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      this.renderAll({ hasUnit, unit, unitStones, baseStones, unitCapacity, baseCapacity, strandedGroups });
    }
    this.updateLauncher();
  }

  renderAll({ hasUnit, unit, unitStones, baseStones, unitCapacity, baseCapacity, strandedGroups }) {
    if (this.parts.unitName) {
      this.parts.unitName.textContent = hasUnit
        ? `${unit.name ?? unit.definition?.name ?? unit.type}`
        : '';
    }
    this.parts.unitCount.textContent = hasUnit ? `${unitStones.length}/${unitCapacity}` : '0/0';
    this.parts.baseCount.textContent = `${baseStones.length}/${baseCapacity}`;

    this.renderSlots(this.parts.unitSlots, unitStones, {
      capacity: unitCapacity,
      emptyText: hasUnit ? '拖入符文石即可生效' : '按 E 对准己方单位后可装备符文石'
    });
    this.renderSlots(this.parts.baseSlots, baseStones, {
      capacity: baseCapacity,
      emptyText: '拖入符文石存入基地'
    });
    this.renderStranded(strandedGroups);
  }

  /** 每块石头占一个格子，不做堆叠；空格子只做占位。 */
  renderSlots(container, stones, { capacity, emptyText }) {
    if (!container) return;
    container.textContent = '';
    if (!stones.length) {
      const empty = document.createElement('div');
      empty.className = 'rune-backpack-empty';
      empty.textContent = emptyText;
      container.appendChild(empty);
    }
    stones.forEach((stone) => container.appendChild(this.createStoneElement(stone)));
    const used = stones.length;
    const filler = Math.max(0, Math.min(capacity, Math.max(used, 6)) - used);
    for (let index = 0; index < filler; index += 1) {
      const slot = document.createElement('div');
      slot.className = 'rune-backpack-slot';
      slot.setAttribute('aria-hidden', 'true');
      container.appendChild(slot);
    }
  }

  renderStranded(groups) {
    const { stranded, strandedList } = this.parts;
    if (!stranded || !strandedList) return;
    stranded.hidden = groups.length === 0;
    strandedList.textContent = '';
    groups.forEach((group) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'rune-backpack-stranded-group';
      const label = document.createElement('div');
      label.className = 'rune-backpack-stranded-label';
      label.textContent = group.profile?.name ?? `单位 #${group.unitId}`;
      wrapper.appendChild(label);
      const list = document.createElement('div');
      list.className = 'rune-backpack-slots';
      group.stones.forEach((stone) => list.appendChild(this.createStoneElement(stone)));
      wrapper.appendChild(list);
      strandedList.appendChild(wrapper);
    });
  }

  /** 石头 = 对应附魔的图片，等级压在图片左上角；底部一条魔力进度。 */
  createStoneElement(stone) {
    const system = this.runeSystem();
    const inactive = Boolean(system?.isStoneInactiveDuplicate?.(stone));
    const name = runeDisplayName(stone.enchantmentId);
    const progress = manaProgressForStone(stone);
    const sell = runeSellValue(stone);
    const need = manaThresholdForLevel(stone.level);
    const manaText = Number.isFinite(need)
      ? `魔力 ${Math.floor(progress.have)}/${need}`
      : '已满级';

    const element = document.createElement('div');
    element.className = inactive ? 'rune-stone is-inactive' : 'rune-stone';
    element.dataset.runeStoneId = stone.id;
    element.style.setProperty('--rune-color', runeColor(stone.enchantmentId));
    element.title = inactive
      ? `${name} Lv.${stone.level} · ${manaText} · 同名备用石：留在背包里不生效，但仍照常吃魔力升级`
      : `${name} Lv.${stone.level} · ${manaText} · 售价 ${formatEnergy(sell)} 能量`;

    const art = document.createElement('div');
    art.className = 'rune-stone-art';
    art.innerHTML = runeArtMarkup(stone.enchantmentId);
    element.appendChild(art);

    const level = document.createElement('span');
    level.className = 'rune-stone-level';
    level.textContent = String(stone.level);
    element.appendChild(level);

    const bar = document.createElement('span');
    bar.className = 'rune-stone-mana';
    const fill = document.createElement('i');
    fill.style.width = `${Math.round(progress.ratio * 100)}%`;
    bar.appendChild(fill);
    element.appendChild(bar);

    if (inactive) {
      const badge = document.createElement('span');
      badge.className = 'rune-stone-inactive';
      badge.textContent = '未生效';
      element.appendChild(badge);
    }

    return element;
  }

  // ---- 拖拽（物品跟着光标走，类似《我的世界》） ----

  onPointerDown(event) {
    const target = event.target?.closest?.('.rune-stone');
    if (!target || !this.root?.contains(target)) return;
    const stone = this.runeSystem()?.stoneById(target.dataset.runeStoneId);
    if (!stone) return;
    event.preventDefault();
    this.drag = { stone, element: target, startX: event.clientX, startY: event.clientY, active: false };
  }

  onPointerMove(event) {
    if (!this.drag) return;
    const distance = Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY);
    if (!this.drag.active && distance < 5) return;
    if (!this.drag.active) {
      this.drag.active = true;
      this.drag.element.classList.add('is-dragging');
      document.body.classList.add('is-rune-dragging');
      this.ensureDragGhost(this.drag.stone);
    }
    this.moveDragGhost(event.clientX, event.clientY);
    this.highlightDropTarget(this.resolveDropTarget(event.clientX, event.clientY));
  }

  onPointerUp(event) {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    drag.element.classList.remove('is-dragging');
    document.body.classList.remove('is-rune-dragging');
    this.removeDragGhost();
    if (!drag.active) {
      this.highlightDropTarget(null);
      return;
    }
    const drop = this.resolveDropTarget(event.clientX, event.clientY);
    this.highlightDropTarget(null);
    if (!drop) return;
    this.performDrop(drag.stone, drop);
  }

  cancelDrag() {
    if (!this.drag) {
      this.removeDragGhost();
      return;
    }
    this.drag.element?.classList.remove('is-dragging');
    this.drag = null;
    document.body.classList.remove('is-rune-dragging');
    this.removeDragGhost();
    this.highlightDropTarget(null);
  }

  ensureDragGhost(stone) {
    this.removeDragGhost();
    if (typeof document === 'undefined') return null;
    const ghost = document.createElement('div');
    ghost.className = 'rune-drag-ghost';
    ghost.dataset.runeDragGhost = 'true';
    ghost.style.setProperty('--rune-color', runeColor(stone.enchantmentId));
    ghost.innerHTML = `<div class="rune-stone-art">${runeArtMarkup(stone.enchantmentId)}</div>`
      + `<span class="rune-stone-level">${stone.level}</span>`;
    document.body.appendChild(ghost);
    this.dragGhost = ghost;
    return ghost;
  }

  moveDragGhost(clientX, clientY) {
    if (!this.dragGhost) return;
    this.dragGhost.style.left = `${clientX}px`;
    this.dragGhost.style.top = `${clientY}px`;
  }

  removeDragGhost() {
    this.dragGhost?.remove();
    this.dragGhost = null;
  }

  resolveDropTarget(clientX, clientY) {
    if (typeof document.elementFromPoint !== 'function') return null;
    const under = document.elementFromPoint(clientX, clientY);
    if (!under) return null;
    if (under.closest('[data-rune-sell]')) return { kind: 'sell' };
    if (under.closest('[data-rune-drop="unit"]')) {
      const unit = this.unit;
      if (!unit?.alive) return null;
      return { kind: 'unit', unit };
    }
    if (under.closest('[data-rune-drop="base"]')) return { kind: 'base' };
    return null;
  }

  highlightDropTarget(drop) {
    const { unitColumn, baseSlots, sellZone, sellValue } = this.parts ?? {};
    const kind = drop?.kind ?? null;
    unitColumn?.classList.toggle('is-drop-target', kind === 'unit');
    baseSlots?.parentElement?.classList.toggle('is-drop-target', kind === 'base');
    sellZone?.classList.toggle('is-drop-target', kind === 'sell');
    if (!sellValue) return;
    sellValue.textContent = kind === 'sell' && this.drag?.stone
      ? `返还 ${formatEnergy(runeSellValue(this.drag.stone))} 能量`
      : '';
  }

  onClick(event) {
    if (event.target?.closest?.('[data-rune-close]')) {
      this.close();
    }
  }

  performDrop(stone, drop) {
    const system = this.runeSystem();
    if (!system) return;
    const playerId = this.playerId();
    let result = null;

    if (drop.kind === 'sell') {
      result = this.requestAction({ action: 'sell', stoneId: stone.id })
        ?? system.sellStone(stone.id, { playerId });
      if (result?.ok) {
        this.showFeedback(`已出售，返还 ${formatEnergy(result.refund)} 能量`, 'ok');
      }
    } else if (drop.kind === 'base') {
      result = this.requestAction({ action: 'move', stoneId: stone.id, target: { kind: 'base' } })
        ?? system.moveStone(stone.id, { kind: 'base', playerId }, { playerId });
      if (result?.ok) this.showFeedback('已收入基地背包', 'ok');
    } else if (drop.kind === 'unit') {
      result = this.requestAction({
        action: 'move',
        stoneId: stone.id,
        target: { kind: 'unit', unitId: String(drop.unit.id) }
      }) ?? system.moveStone(stone.id, { kind: 'unit', unit: drop.unit }, { playerId });
      if (result?.ok) this.showFeedback('已装备到该单位', 'ok');
    }

    if (result && result.ok === false) {
      this.showFeedback(RUNE_ERROR_LABELS[result.reason] ?? '无法完成该操作', 'error');
    }
    this.refresh();
  }

  /**
   * 联机时由 Game 提供 requestRuneStoneAction，把动作交给 Host 校验；
   * 单机返回 null，直接走本地系统。
   */
  requestAction(payload) {
    const handler = this.game?.requestRuneStoneAction;
    if (typeof handler !== 'function') return null;
    return handler.call(this.game, payload);
  }

  showFeedback(text, tone = 'ok') {
    const element = this.parts?.feedback;
    if (!element) return;
    element.textContent = text;
    element.dataset.tone = tone;
    element.hidden = false;
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => {
      if (element) element.hidden = true;
    }, 2200);
  }
}

function stoneSignature(stone) {
  return `${stone.id}:${stone.level}:${Math.floor(Number(stone.mana) || 0)}`;
}

function buildSignature({ mode, unitId, unitStones, baseStones, strandedGroups }) {
  const unitPart = unitStones.map(stoneSignature).join(',');
  const basePart = baseStones.map(stoneSignature).join(',');
  const strandedPart = strandedGroups
    .map((group) => `${group.unitId}[${group.stones.map(stoneSignature).join(',')}]`)
    .join('|');
  return `${mode}|${unitId ?? '-'}|${unitPart}|${basePart}|${strandedPart}`;
}

function formatEnergy(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
