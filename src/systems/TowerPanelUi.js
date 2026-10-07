// 防御终端界面：类型 / 等级 / 用途 / 下一级材料与资格 / 当前耗能 / 状态。
//
// 设计约束（docs/DSH_DEFENSE_SURVIVAL_DESIGN.md 第一节）：
//   「建筑菜单显示类型、等级、用途、下一等级材料/资格、当前耗能和状态。
//     不要恢复旧卡牌/商店界面。」
//
// 为什么单开一个面板而不是塞进科研站界面：
//   1. 升级的**主体是一栋具体的塔**，面板必须能跟着那栋塔的施工进度刷新；
//   2. 科技界面是"解锁能力的清单"，把某一栋塔的状态混进去，
//      会变成截图里那种"能看见却对不上是哪一个对象"的界面；
//   3. 扇形菜单入口本来就已经按建筑类型分发（设施 / 背包），这里沿用同一条路。
//
// 复用 backpack.css 的卡片类（`.backpack-card` / `.backpack-input` /
// `.backpack-action` / `.backpack-blocked`），只在下面补几条塔专属的样式。
import { itemName } from './items.js';
import { TOWER_TIER_LABELS, TOWER_TIER_MAX } from '../data/defenseTiers.js';

export class TowerPanelUi {
  constructor(game, options = {}) {
    this.game = game;
    this.mount = options.mount ?? (typeof document !== 'undefined' ? document.body : null);
    this.root = null;
    this.parts = null;
    this.unit = null;
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

  openForUnit(unit) {
    const status = this.game?.towerUpgrades?.status?.(unit) ?? null;
    if (!status) return { ok: false, reason: 'not_tower' };
    if (unit?.alive === false) return { ok: false, reason: 'dead_unit' };
    this.ensureUi();
    if (!this.root) return { ok: false, reason: 'no_mount' };
    this.unit = unit;
    this.lastSignature = '';
    this.root.hidden = false;
    this.root.classList.add('is-open');
    this.root.dataset.towerId = status.towerId;
    this.refresh();
    return { ok: true, towerId: status.towerId, tier: status.tier };
  }

  toggleForUnit(unit) {
    if (this.isOpenFor(unit)) {
      this.close();
      return { ok: true, closed: true };
    }
    return this.openForUnit(unit);
  }

  close() {
    this.unit = null;
    this.lastSignature = '';
    if (!this.root) return;
    this.root.hidden = true;
    this.root.classList.remove('is-open');
    delete this.root.dataset.towerId;
  }

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
    root.id = 'tower-panel';
    root.className = 'facility-panel tower-panel';
    root.hidden = true;
    root.innerHTML = `
      <div class="facility-frame" role="dialog" aria-label="防御终端">
        <header class="backpack-header">
          <div class="backpack-heading">
            <span class="backpack-title" data-tower-title>防御终端</span>
            <span class="backpack-subtitle" data-tower-subtitle></span>
          </div>
          <button type="button" class="backpack-close" data-tower-close aria-label="关闭">✕</button>
        </header>
        <div class="backpack-pane-head">
          <span class="backpack-pane-title" data-tower-role>定位</span>
          <span class="backpack-pane-count" data-tower-count></span>
        </div>
        <div class="backpack-list" data-tower-list role="tabpanel"></div>
        <p class="backpack-feedback" data-tower-feedback hidden></p>
      </div>
    `;
    this.mount.appendChild(root);
    this.root = root;
    this.parts = {
      title: root.querySelector('[data-tower-title]'),
      subtitle: root.querySelector('[data-tower-subtitle]'),
      role: root.querySelector('[data-tower-role]'),
      count: root.querySelector('[data-tower-count]'),
      list: root.querySelector('[data-tower-list]'),
      feedback: root.querySelector('[data-tower-feedback]')
    };
    if (!this.bound) {
      root.addEventListener('pointerdown', (event) => event.stopPropagation());
      root.addEventListener('click', (event) => this.onClick(event));
      root.addEventListener('contextmenu', (event) => event.preventDefault());
      this.bound = true;
    }
    return root;
  }

  /**
   * 每帧刷新（只更新打开的那一栋）。
   * 施工进度是连续量，签名按 1% 量化，避免每帧重建 DOM。
   */
  refresh() {
    if (!this.isOpen() || !this.parts) return false;
    if (this.unit?.alive === false) {
      this.close();
      return false;
    }
    const status = this.game?.towerUpgrades?.status?.(this.unit) ?? null;
    if (!status) {
      this.close();
      return false;
    }
    const signature = JSON.stringify({
      unitId: status.unitId,
      tier: status.tier,
      target: status.targetTier,
      ok: status.ok,
      reason: status.reason,
      upgrading: status.upgrading,
      blocked: status.blocked,
      percent: Math.round(status.progress * 100),
      health: status.health.current,
      mana: Math.round(status.power.mana),
      have: status.cost.map((entry) => entry.have),
      research: status.gates.research.ok,
      route: status.gates.route?.ok ?? null
    });
    if (signature === this.lastSignature) return false;
    this.lastSignature = signature;
    this.renderStatus(status);
    this.renderFeedback();
    return true;
  }

  renderStatus(status) {
    const parts = this.parts;
    if (!parts) return;
    const role = status.role ?? null;
    parts.title.textContent = `${role?.name ?? status.towerId} ${status.tierLabel} 级`;
    parts.subtitle.textContent = `等级 ${status.tier}/${TOWER_TIER_MAX} · 生命 ${status.health.current}/${status.health.max} · 魔力 ${status.power.mana}/${status.power.manaCapacity} · Esc 关闭`;
    parts.role.textContent = role?.role ?? '防御终端';
    parts.count.textContent = status.upgrading
      ? `施工中 ${Math.round(status.progress * 100)}%`
      : (status.maxed ? '已满级' : (status.ok ? '可以升级' : '暂不可升级'));

    const list = parts.list;
    list.textContent = '';

    // ---- 用途与代价：这是"按敌群选塔"的依据，不能省 ----
    const infoCard = document.createElement('article');
    infoCard.className = 'backpack-card tower-card-info';
    const infoHead = document.createElement('div');
    infoHead.className = 'backpack-card-head';
    const infoName = document.createElement('span');
    infoName.className = 'backpack-card-name';
    infoName.textContent = '用途与代价';
    infoHead.appendChild(infoName);
    infoCard.appendChild(infoHead);
    [
      { label: '擅长', text: role?.purpose ?? '' },
      { label: '弱点', text: role?.weakness ?? '' }
    ].forEach((entry) => {
      if (!entry.text) return;
      const line = document.createElement('p');
      line.className = 'backpack-card-desc';
      line.textContent = `${entry.label}：${entry.text}`;
      infoCard.appendChild(line);
    });
    const powerLine = document.createElement('p');
    powerLine.className = 'backpack-card-desc';
    powerLine.textContent = status.power.manaPerShot == null
      ? `当前耗能：待机 ${status.power.drainPerSecond}/秒`
      : `当前耗能：每发 ${status.power.manaPerShot} 魔力 · 待机 ${status.power.drainPerSecond}/秒 · 活动储备 ${status.power.mana}/${status.power.manaCapacity}`;
    infoCard.appendChild(powerLine);
    list.appendChild(infoCard);

    // ---- 下一级 ----
    const card = document.createElement('article');
    card.className = status.upgrading ? 'backpack-card is-done' : 'backpack-card';
    card.dataset.towerUpgradeCard = '1';
    const head = document.createElement('div');
    head.className = 'backpack-card-head';
    const name = document.createElement('span');
    name.className = 'backpack-card-name';
    name.textContent = status.maxed
      ? '已经是三级'
      : `升级到 ${TOWER_TIER_LABELS[(status.targetTier ?? 2) - 1] ?? ''} 级`;
    const state = document.createElement('span');
    state.className = 'backpack-card-state';
    state.dataset.towerUpgradeState = status.upgrading ? 'upgrading'
      : (status.maxed ? 'maxed' : (status.ok ? 'ready' : 'blocked'));
    state.textContent = status.upgrading
      ? (status.blocked ? '交战中暂停' : '施工中')
      : (status.maxed ? '满级' : (status.ok ? '材料齐备' : (status.label || '未满足条件')));
    head.append(name, state);
    card.appendChild(head);

    if (!status.maxed) {
      const desc = document.createElement('p');
      desc.className = 'backpack-card-desc';
      desc.textContent = '升级在同一建筑原地进行：施工期间该塔停火，被攻击会暂停并保留进度；'
        + '新增的生命/耐久/魔力上限不会自动填满。';
      card.appendChild(desc);
    }

    if (status.cost.length) {
      const inputs = document.createElement('div');
      inputs.className = 'backpack-inputs';
      status.cost.forEach((entry) => {
        const chip = document.createElement('span');
        chip.className = entry.have < entry.count ? 'backpack-input is-missing' : 'backpack-input';
        chip.dataset.itemId = entry.itemId;
        const label = document.createElement('span');
        label.textContent = itemName(entry.itemId);
        const amount = document.createElement('span');
        amount.className = 'backpack-input-have';
        amount.textContent = `${entry.have}/${entry.count}`;
        chip.append(label, amount);
        inputs.appendChild(chip);
      });
      card.appendChild(inputs);
    }

    // 资格：二级只看科研站，三级还要对应路线。分开写才不会指错方向。
    const gates = document.createElement('div');
    gates.className = 'tower-gates';
    const gateEntries = [status.gates.research, status.gates.route].filter(Boolean);
    gateEntries.forEach((gate) => {
      const line = document.createElement('span');
      line.className = gate.ok ? 'tower-gate is-ok' : 'tower-gate is-missing';
      line.dataset.towerGate = gate.ok ? 'ok' : 'missing';
      line.textContent = `${gate.ok ? '✓' : '✕'} ${gate.label}`;
      gates.appendChild(line);
    });
    card.appendChild(gates);

    if (status.upgrading) {
      const bar = document.createElement('div');
      bar.className = 'tower-progress';
      const fill = document.createElement('div');
      fill.className = 'tower-progress-fill';
      fill.dataset.towerUpgradeProgress = String(Math.round(status.progress * 100));
      fill.style.width = `${Math.max(0, Math.min(100, Math.round(status.progress * 100)))}%`;
      bar.appendChild(fill);
      card.appendChild(bar);
    }

    const actions = document.createElement('div');
    actions.className = 'backpack-card-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'backpack-action';
    if (status.upgrading) {
      button.dataset.towerCancelUpgrade = String(status.unitId);
      button.textContent = '取消升级（材料退回）';
      button.disabled = false;
    } else {
      button.dataset.towerBeginUpgrade = String(status.unitId);
      button.textContent = status.maxed ? '已满级' : '升级';
      button.disabled = status.maxed || !status.ok;
      if (!status.maxed && !status.ok && status.label) {
        const blocked = document.createElement('span');
        blocked.className = 'backpack-blocked';
        blocked.dataset.towerBlocked = status.reason ?? 'blocked';
        blocked.textContent = status.label;
        actions.appendChild(blocked);
      }
    }
    actions.appendChild(button);
    card.appendChild(actions);
    list.appendChild(card);
  }

  onClick(event) {
    if (event.target.closest('[data-tower-close]')) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    const begin = event.target.closest('[data-tower-begin-upgrade]');
    if (begin && !begin.disabled) {
      event.preventDefault();
      event.stopPropagation();
      const result = this.game?.towerUpgrades?.beginUpgrade?.(this.unit)
        ?? { ok: false, label: '防御终端系统不可用' };
      this.showFeedback(
        result.ok
          ? `开始升级：${this.unit?.name ?? '防御终端'}（${Math.round(this.game?.towerUpgrades?.rules?.seconds ?? 0)} 秒，交战中暂停）`
          : (result.label || '不能升级'),
        !result.ok
      );
      this.lastSignature = '';
      this.refresh();
      return;
    }
    const cancel = event.target.closest('[data-tower-cancel-upgrade]');
    if (cancel && !cancel.disabled) {
      event.preventDefault();
      event.stopPropagation();
      const result = this.game?.towerUpgrades?.cancelUpgrade?.(this.unit, { refund: true })
        ?? { ok: false };
      this.showFeedback(
        result.ok ? '已取消升级，材料整笔退回基地库存' : '没有正在进行的升级',
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
