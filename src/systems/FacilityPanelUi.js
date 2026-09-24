// 科研站 / 附魔台的独立界面。
//
// 需求原文：「b 键面板内部右侧不应该有科技和附魔台，这两个应该是科研站和附魔台的
// 扇形菜单弹出的界面。」
//
// 所以科技与附魔从"一个永远存在于背包右侧的标签页"变成"走到那栋建筑、点它、
// 从扇形菜单里打开"。这不是搬运 DOM，而是把**入口**改对了：
//   1. 以前不需要科研站就能"翻到"科技页，页面上再告诉你"需要先建好科研站"——
//      那是一种自相矛盾的界面（能看见却不能用）；
//   2. 现在没有那栋建筑就没有那个入口，玩家不会看到用不了的东西；
//   3. 面板是模态的、独占屏幕中央，不会和背包抢同一块地方。
//
// 复用 `backpack.css` 里那套卡片样式（`.backpack-card` / `.backpack-input` /
// `.backpack-action` / `.backpack-blocked`）：它们是全局类选择器，
// 再造一套长得一样但名字不同的样式只会让以后调色要改两处。
import { itemName } from './items.js';
import { runeDisplayName } from './runeStones.js';

/** 哪些建筑提供哪个界面。建筑类型 → 面板配置。 */
export const FACILITY_PANELS = Object.freeze({
  researchStation: {
    unitType: 'researchStation',
    title: '科研站',
    tab: 'tech',
    emptyHint: '暂无科技。',
    actionLabel: '研究',
    doneLabel: '已研究',
    doneStateLabel: '已解锁',
    todoStateLabel: '未研究'
  },
  enchantTable: {
    unitType: 'enchantTable',
    title: '附魔台',
    tab: 'enchant',
    emptyHint: '暂无可制作的附魔。',
    actionLabel: '制作',
    doneLabel: '已制作',
    doneStateLabel: '可制作',
    todoStateLabel: '材料不足'
  }
});

/** 这个建筑类型有没有对应界面（没有就不该长出一个扇形菜单入口）。 */
export function facilityPanelFor(unitOrType) {
  const type = typeof unitOrType === 'string' ? unitOrType : unitOrType?.type;
  return FACILITY_PANELS[type] ?? null;
}

export class FacilityPanelUi {
  constructor(game, options = {}) {
    this.game = game;
    this.mount = options.mount ?? (typeof document !== 'undefined' ? document.body : null);
    this.root = null;
    this.parts = null;
    this.unit = null;
    this.config = null;
    this.lastSignature = '';
    this.feedback = null;
    this.feedbackTimer = null;
    this.bound = false;
  }

  get available() {
    return Boolean(this.mount);
  }

  isOpen() {
    return Boolean(this.root && !this.root.hidden);
  }

  isOpenFor(unit) {
    return this.isOpen() && Boolean(unit) && this.unit === unit;
  }

  /** 打开某个建筑的界面。建筑类型没有对应界面时明确拒绝。 */
  openForUnit(unit) {
    const config = facilityPanelFor(unit);
    if (!config) return { ok: false, reason: 'no_facility_panel' };
    if (unit?.alive === false) return { ok: false, reason: 'dead_unit' };
    this.ensureUi();
    if (!this.root) return { ok: false, reason: 'no_mount' };
    this.unit = unit;
    this.config = config;
    this.lastSignature = '';
    this.root.hidden = false;
    this.root.classList.add('is-open');
    this.root.dataset.facility = config.unitType;
    this.applyStaticText();
    this.refresh();
    return { ok: true, unitType: config.unitType };
  }

  /** 同一个建筑再点一次 = 关掉（与背包的 B 键同构）。 */
  toggleForUnit(unit) {
    if (this.isOpenFor(unit)) {
      this.close();
      return { ok: true, closed: true };
    }
    return this.openForUnit(unit);
  }

  close() {
    this.unit = null;
    this.config = null;
    this.lastSignature = '';
    if (!this.root) return;
    this.root.hidden = true;
    this.root.classList.remove('is-open');
    delete this.root.dataset.facility;
  }

  /** 建筑被拆掉/单位阵亡时自动关闭。 */
  closeIfUnit(unit) {
    if (!this.isOpenFor(unit)) return false;
    this.close();
    return true;
  }

  destroy() {
    if (this.feedbackTimer != null) clearTimeout(this.feedbackTimer);
    this.feedbackTimer = null;
    this.root?.remove();
    this.root = null;
    this.parts = null;
    this.unit = null;
  }

  ensureUi() {
    if (this.root || !this.available) return this.root;
    const root = document.createElement('div');
    root.id = 'facility-panel';
    root.className = 'facility-panel';
    root.hidden = true;
    root.innerHTML = `
      <div class="facility-frame" role="dialog" aria-label="设施界面">
        <header class="backpack-header">
          <div class="backpack-heading">
            <span class="backpack-title" data-facility-title>设施</span>
            <span class="backpack-subtitle" data-facility-subtitle></span>
          </div>
          <button type="button" class="backpack-close" data-facility-close aria-label="关闭">✕</button>
        </header>
        <div class="backpack-pane-head">
          <span class="backpack-pane-title" data-facility-pane-title>科技</span>
          <span class="backpack-pane-count" data-facility-count></span>
        </div>
        <div class="backpack-list" data-facility-list role="tabpanel"></div>
        <p class="backpack-feedback" data-facility-feedback hidden></p>
      </div>
    `;
    this.mount.appendChild(root);
    this.root = root;
    this.parts = {
      title: root.querySelector('[data-facility-title]'),
      subtitle: root.querySelector('[data-facility-subtitle]'),
      paneTitle: root.querySelector('[data-facility-pane-title]'),
      count: root.querySelector('[data-facility-count]'),
      list: root.querySelector('[data-facility-list]'),
      feedback: root.querySelector('[data-facility-feedback]')
    };
    if (!this.bound) {
      root.addEventListener('pointerdown', (event) => event.stopPropagation());
      root.addEventListener('click', (event) => this.onClick(event));
      root.addEventListener('contextmenu', (event) => event.preventDefault());
      this.bound = true;
    }
    return root;
  }

  applyStaticText() {
    const config = this.config;
    if (!config || !this.parts) return;
    this.parts.title.textContent = config.title;
    this.parts.paneTitle.textContent = config.tab === 'tech' ? '科技' : '附魔石';
    this.parts.subtitle.textContent = config.tab === 'tech'
      ? '投入资源解锁科技 · Esc 关闭'
      : '用材料制作附魔石 · 产出的符文石在基地背包里';
  }

  refresh() {
    if (!this.isOpen() || !this.parts) return;
    // 建筑在界面打开期间被拆掉：立刻关闭，否则会出现"对着空气研究科技"。
    if (this.unit?.alive === false) {
      this.close();
      return;
    }
    const status = this.statusFor();
    const signature = JSON.stringify({
      facility: this.config?.unitType ?? null,
      unitId: this.unit?.id ?? null,
      ready: status.ready,
      entries: status.entries.map((entry) => [
        entry.id,
        entry.done,
        entry.canAct,
        entry.cost.map((cost) => cost.have)
      ])
    });
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.renderList(status);
    this.renderFeedback();
  }

  /** 当前该显示的内容：科技走 techStatus，附魔走 enchantStatus。 */
  statusFor() {
    const research = this.game?.research;
    if (this.config?.tab === 'tech') {
      const techs = typeof research?.techStatus === 'function' ? research.techStatus() : [];
      return {
        ready: true,
        entries: techs.map((tech) => ({
          id: tech.id,
          name: tech.name,
          description: tech.description,
          cost: tech.cost,
          done: tech.researched === true,
          canAct: tech.canResearch === true,
          reasonLabel: tech.reasonLabel ?? null,
          actionAttr: 'researchTech'
        }))
      };
    }
    const enchants = typeof research?.enchantStatus === 'function' ? research.enchantStatus() : null;
    if (!enchants) return { ready: false, hint: '附魔系统不可用。', entries: [] };
    if (!enchants.tableReady) {
      return {
        ready: false,
        hint: enchants.stationReady
          ? '附魔台还没建成。先研究「附魔工艺」，再合成并放置附魔台。'
          : '需要先建造科研站，才能研究解锁附魔台。',
        entries: []
      };
    }
    return {
      ready: true,
      entries: enchants.recipes.map((recipe) => ({
        id: recipe.enchantmentId,
        name: runeDisplayName(recipe.enchantmentId),
        description: recipe.description ?? '',
        cost: recipe.cost,
        done: false,
        canAct: recipe.canEnchant === true,
        reasonLabel: recipe.reasonLabel ?? null,
        actionAttr: 'enchantRune'
      }))
    };
  }

  renderList(status) {
    const list = this.parts?.list;
    if (!list) return;
    const config = this.config;
    list.textContent = '';
    const doneCount = status.entries.filter((entry) => entry.done).length;
    if (this.parts.count) {
      this.parts.count.textContent = status.ready && status.entries.length
        ? (config?.tab === 'tech'
          ? `${doneCount}/${status.entries.length} 已解锁`
          : `${status.entries.filter((entry) => entry.canAct).length}/${status.entries.length} 可制作`)
        : (status.ready ? '' : '未就绪');
    }
    if (!status.ready || !status.entries.length) {
      const hint = document.createElement('p');
      hint.className = 'backpack-empty';
      hint.textContent = status.hint ?? config?.emptyHint ?? '暂无内容。';
      list.appendChild(hint);
      return;
    }
    status.entries.forEach((entry) => {
      const card = document.createElement('article');
      card.className = entry.done ? 'backpack-card is-done' : 'backpack-card';
      if (config?.tab === 'tech') card.dataset.techId = entry.id;
      else card.dataset.enchantId = entry.id;

      const head = document.createElement('div');
      head.className = 'backpack-card-head';
      const name = document.createElement('span');
      name.className = 'backpack-card-name';
      name.textContent = entry.name;
      const state = document.createElement('span');
      state.className = 'backpack-card-state';
      if (config?.tab === 'tech') {
        state.textContent = entry.done ? config.doneStateLabel : config.todoStateLabel;
      } else {
        state.textContent = '→ 符文石 ×1';
      }
      head.append(name, state);
      card.appendChild(head);

      if (entry.description) {
        const desc = document.createElement('p');
        desc.className = 'backpack-card-desc';
        desc.textContent = entry.description;
        card.appendChild(desc);
      }
      // 已完成的不再显示成本：研究完之后再把缺料标红只会让人以为还能再做一次。
      if (!entry.done && entry.cost?.length) {
        const inputs = document.createElement('div');
        inputs.className = 'backpack-inputs';
        entry.cost.forEach((cost) => {
          const missing = cost.have < cost.count;
          const chip = document.createElement('span');
          chip.className = missing ? 'backpack-input is-missing' : 'backpack-input';
          chip.dataset.itemId = cost.itemId;
          const label = document.createElement('span');
          label.textContent = itemName(cost.itemId);
          const amount = document.createElement('span');
          amount.className = 'backpack-input-have';
          amount.textContent = `${cost.have}/${cost.count}`;
          chip.append(label, amount);
          inputs.appendChild(chip);
        });
        card.appendChild(inputs);
      }

      const actions = document.createElement('div');
      actions.className = 'backpack-card-actions';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'backpack-action';
      button.dataset[entry.actionAttr] = entry.id;
      button.textContent = entry.done ? config.doneLabel : config.actionLabel;
      button.disabled = entry.done || !entry.canAct;
      actions.appendChild(button);
      if (!entry.done && !entry.canAct && entry.reasonLabel) {
        const blocked = document.createElement('span');
        blocked.className = 'backpack-blocked';
        blocked.textContent = entry.reasonLabel;
        actions.appendChild(blocked);
      }
      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  onClick(event) {
    if (event.target.closest('[data-facility-close]')) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    const tech = event.target.closest('[data-research-tech]');
    if (tech && !tech.disabled) {
      event.preventDefault();
      event.stopPropagation();
      const result = this.game?.research?.research?.(tech.dataset.researchTech)
        ?? { ok: false, reason: 'no_research_system' };
      this.showFeedback(
        result.ok ? `科技已解锁：${result.tech?.name ?? tech.dataset.researchTech}` : (result.label || '无法研究'),
        !result.ok
      );
      this.lastSignature = '';
      this.refresh();
      return;
    }
    const enchant = event.target.closest('[data-enchant-rune]');
    if (enchant && !enchant.disabled) {
      event.preventDefault();
      event.stopPropagation();
      const result = this.game?.research?.enchant?.(enchant.dataset.enchantRune)
        ?? { ok: false, reason: 'no_research_system' };
      this.showFeedback(
        result.ok
          ? `制作完成：${runeDisplayName(enchant.dataset.enchantRune)} 符文石（已放进基地背包）`
          : (result.label || '无法制作'),
        !result.ok
      );
      this.lastSignature = '';
      this.refresh();
    }
  }

  showFeedback(text, isError = false) {
    this.feedback = { text, error: isError === true };
    this.renderFeedback();
    if (this.feedbackTimer != null) clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => {
      this.feedback = null;
      this.renderFeedback();
    }, 2600);
  }

  renderFeedback() {
    const element = this.parts?.feedback;
    if (!element) return;
    element.hidden = !this.feedback;
    element.textContent = this.feedback?.text ?? '';
    element.classList.toggle('is-error', this.feedback?.error === true);
  }
}
