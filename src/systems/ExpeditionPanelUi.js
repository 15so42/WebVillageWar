// 远征路线面板。
//
// 三条硬要求决定了它的形状：
//   1. **不是模态**：面板不暂停游戏，也不吃全屏指针——左边地图照常拖拽、右键下令。
//      所以容器是 `pointer-events: none` + 贴右侧的可滚动面板，只有面板自己接事件。
//   2. **closed 不构建 DOM**：没打开过就没有节点；收起后也不再更新（签名比对在 open 时才跑）。
//   3. **内容签名变了才重画**：点位状态、追踪目标、预报数字进签名，其余一律不改 DOM。
//
// 皮肤复用 backpack.css 里那套棕灰卡片语言（`.backpack-card` / `.backpack-input` /
// `.backpack-action` 是全局类选择器），所以不在这里重造一套长得一样但名字不同的样式。
import { EXPEDITION_STATE } from './expedition.js';

export class ExpeditionPanelUi {
  constructor(game, options = {}) {
    this.game = game;
    this.mount = options.mount ?? (typeof document !== 'undefined' ? document.body : null);
    this.root = null;
    this.parts = null;
    this.lastSignature = '';
    this.lastVersion = -1;
    this.buttonBound = false;
    this.buttonState = '';
    this.bound = false;
    // 监听器要能在 destroy 时按同一个引用摘掉：重开一局时 HUD 按钮仍在 DOM 里，
    // 只加不减会让"开/关"一次点击触发两次（面板闪一下就没了）。
    this.onButtonClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggle();
    };
    this.onButtonPointerDown = (event) => event.stopPropagation();
  }

  get available() {
    return Boolean(this.mount);
  }

  isOpen() {
    return Boolean(this.root && !this.root.hidden);
  }

  /** HUD 按钮：只在海岛生存关出现。按钮本身在 index.html 里，不需要建 DOM。 */
  toggleButton() {
    if (typeof document === 'undefined') return null;
    return document.querySelector('#expedition-toggle');
  }

  /**
   * 按钮该不该出现。
   *
   * 用户第 2 项要求移除屏幕顶部那个催促玩家的战役按钮，同时保留玩家自主探索与进攻
   * 节奏。所以这里不是"永远显示一个入口"，而是**只在真的有内容可看时显示**：
   *   - 已经追踪了某条路线（顶部目标句正指着它，此时点开有上下文）；
   *   - 或**夜袭进行中**（巢穴真的在出兵，防线正在挨打）。
   * 注意 `activeRoutes` 只表示"这条路线还有没拆的巢穴"，开局四条路线全为真，
   * 拿它当"正在出兵"会让按钮从第一秒起常驻——那就又变成一个常驻催促入口了。
   * 真正该出现"远征"入口的时刻是夜里防线在挨打，或玩家自己追踪了某条路线；
   * 其余时间玩家按 P 或从帮助面板随时能打开（见 Game.onKeyDown 与 HelpPanelUi）。
   */
  isRelevant() {
    const expeditions = this.game?.expeditions;
    if (!expeditions) return false;
    if (expeditions.trackedId) return true;
    const forecast = expeditions.snapshot?.()?.forecast ?? null;
    if (forecast?.isNight !== true) return false;
    return (forecast.activeRoutes?.length ?? 0) > 0;
  }

  syncButton() {
    const button = this.toggleButton();
    if (!button) return;
    if (!this.buttonBound) {
      button.addEventListener('click', this.onButtonClick);
      button.addEventListener('pointerdown', this.onButtonPointerDown);
      this.buttonBound = true;
    }
    // 生存关 + 有内容可看：不靠提示消息催促，也不常驻霸占顶部。
    const relevant = this.game?.isSurvivalLevel?.() === true && this.isRelevant();
    const open = this.isOpen();
    // 面板开着时按钮必须留着，否则玩家没法收起它（P 键也能收起，但按钮不该消失）。
    const visible = relevant || open;
    const state = `${visible}|${open}`;
    if (state === this.buttonState) return;
    this.buttonState = state;
    button.hidden = !visible;
    button.classList.toggle('is-active', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    button.title = this.game?.expeditions?.trackedId
      ? '远征路线 · 追踪中，点开看目标与掉落'
      : '远征路线 · 夜间巢穴正在出兵';
  }

  toggle() {
    if (this.isOpen()) {
      this.close();
      return { ok: true, closed: true };
    }
    return this.open();
  }

  open() {
    if (!this.available) return { ok: false, reason: 'no_mount' };
    this.ensureUi();
    if (!this.root) return { ok: false, reason: 'no_mount' };
    this.root.hidden = false;
    this.root.classList.add('is-open');
    this.lastSignature = '';
    this.refresh({ force: true });
    this.syncButton();
    return { ok: true };
  }

  close() {
    this.lastSignature = '';
    if (!this.root) return { ok: true, closed: true };
    this.root.hidden = true;
    this.root.classList.remove('is-open');
    this.syncButton();
    return { ok: true, closed: true };
  }

  destroy() {
    this.root?.remove();
    this.root = null;
    this.parts = null;
    this.lastSignature = '';
    this.bound = false;
    const button = this.toggleButton();
    if (button) {
      if (this.buttonBound) {
        button.removeEventListener('click', this.onButtonClick);
        button.removeEventListener('pointerdown', this.onButtonPointerDown);
      }
      button.hidden = true;
      button.classList.remove('is-active');
      button.setAttribute('aria-expanded', 'false');
    }
    this.buttonBound = false;
    this.buttonState = '';
  }

  ensureUi() {
    if (this.root || !this.available) return this.root;
    const root = document.createElement('div');
    root.id = 'expedition-panel';
    root.className = 'expedition-panel';
    root.hidden = true;
    root.innerHTML = `
      <section class="expedition-frame" role="dialog" aria-label="远征路线">
        <header class="expedition-header">
          <div class="expedition-heading">
            <span class="expedition-kicker">海岛远征</span>
            <strong class="expedition-title">远征路线</strong>
          </div>
          <span class="expedition-tracked" data-expedition-tracked></span>
          <button type="button" class="expedition-close" data-expedition-close aria-label="收起">✕</button>
        </header>
        <p class="expedition-hint">追踪只标方向，不会给单位下命令；查看位置只移动镜头。</p>
        <section class="expedition-forecast" data-expedition-forecast aria-label="夜袭预报"></section>
        <div class="expedition-list" data-expedition-list></div>
      </section>
    `;
    this.mount.appendChild(root);
    this.root = root;
    this.parts = {
      tracked: root.querySelector('[data-expedition-tracked]'),
      forecast: root.querySelector('[data-expedition-forecast]'),
      list: root.querySelector('[data-expedition-list]')
    };
    if (!this.bound) {
      root.addEventListener('pointerdown', (event) => {
        // 只有面板本身吃事件：点在空白处要让地图继续收到手势。
        if (event.target === root) return;
        event.stopPropagation();
      });
      root.addEventListener('click', (event) => this.onClick(event));
      root.addEventListener('contextmenu', (event) => event.preventDefault());
      this.bound = true;
    }
    this.syncButton();
    return root;
  }

  /** 只在打开时更新，并且签名没变就一个 DOM 都不碰。 */
  refresh({ force = false } = {}) {
    if (!this.isOpen() || !this.parts) return false;
    const expeditions = this.game?.expeditions ?? null;
    const version = expeditions?.sampleVersion ?? 0;
    // 版本没变说明 0.5 秒采样还没跑过：连签名 JSON 都不重算。
    if (!force && version === this.lastVersion) return false;
    this.lastVersion = version;
    const snapshot = expeditions?.snapshot?.() ?? null;
    if (!snapshot) return false;
    const signature = this.signatureOf(snapshot);
    if (!force && signature === this.lastSignature) return false;
    this.lastSignature = signature;
    this.renderTracked(snapshot);
    this.renderForecast(snapshot.forecast);
    this.renderRoutes(snapshot);
    return true;
  }

  signatureOf(snapshot) {
    return JSON.stringify({
      trackedId: this.game?.expeditions?.trackedId ?? null,
      routes: snapshot.briefs.map((brief) => [
        brief.id,
        brief.stage,
        brief.targetPointId,
        brief.innerCleared,
        brief.outerCleared,
        brief.blueprint?.ready === true,
        brief.blueprint?.researched === true,
        (brief.recruits ?? []).map((recruit) => `${recruit.type}:${recruit.count}`),
        snapshot.loadout?.dedicatedWeaponCount ?? 0,
        snapshot.loadout?.nativeArmedCount ?? 0
      ]),
      forecast: [
        snapshot.forecast?.counts?.cleared,
        snapshot.forecast?.counts?.sealed,
        snapshot.forecast?.counts?.threatening,
        snapshot.forecast?.isNight === true,
        snapshot.forecast?.nextNightNumber,
        snapshot.forecast?.residual
      ]
    });
  }

  renderTracked(snapshot) {
    const element = this.parts?.tracked;
    if (!element) return;
    const tracked = snapshot.tracked;
    if (!tracked) {
      element.textContent = '未追踪';
      element.classList.remove('is-active');
      return;
    }
    element.textContent = snapshot.trackedCompleted
      ? `已完成：${tracked.name}`
      : `追踪中：${tracked.name} → ${tracked.targetName ?? ''}`;
    element.classList.add('is-active');
  }

  renderForecast(forecast) {
    const element = this.parts?.forecast;
    if (!element || !forecast) return;
    element.textContent = '';
    const head = document.createElement('div');
    head.className = 'expedition-forecast-head';
    const title = document.createElement('strong');
    title.textContent = '夜袭预报';
    head.append(title);
    // 正在进行的这一夜与即将到来的下一夜**分开写**：夜里只看"下一夜"会漏掉
    // 当前这一夜正在生效的难度与人数（玩家此刻正挨着它）。
    // 数量项只在真的非零时才写：当前规则（dayNight.js）刻意"只抬难度、不抬数量"，
    // 每天都写"存活上限 +0 · 每批 +0"会让人以为有条没生效的加成。
    const raidLine = (label, raid) => {
      const parts = [`难度 ×${Number(raid?.difficulty ?? 1).toFixed(2)}`];
      const extraAlive = Math.floor(Number(raid?.extraAlive) || 0);
      const extraPerTick = Math.floor(Number(raid?.extraPerTick) || 0);
      if (extraAlive > 0) parts.push(`存活上限 +${extraAlive}`);
      if (extraPerTick > 0) parts.push(`每批 +${extraPerTick}`);
      return `${label} ${parts.join(' · ')}`;
    };
    if (forecast.isNight && forecast.currentNightRaid) {
      const current = document.createElement('span');
      current.textContent = raidLine(`第 ${forecast.currentNightNumber} 夜（进行中）`, forecast.currentNightRaid);
      head.appendChild(current);
    }
    const raid = forecast.nextNightRaid ?? { difficulty: 1, extraAlive: 0, extraPerTick: 0 };
    const night = document.createElement('span');
    night.textContent = raidLine(`第 ${forecast.nextNightNumber} 夜`, raid);
    head.appendChild(night);
    element.appendChild(head);

    const counts = document.createElement('p');
    counts.className = 'expedition-forecast-counts';
    const c = forecast.counts ?? {};
    counts.textContent = `正在威胁基地 ${c.threatening ?? 0} 座 · 被内巢封印 ${c.sealed ?? 0} 座`
      + ` · 已清除 ${c.cleared ?? 0}/${c.total ?? 0} 座`
      + (forecast.residual > 0 ? ` · 残兵 ${forecast.residual} 个（不会凭空消失）` : '');
    element.appendChild(counts);

    const active = document.createElement('p');
    active.className = 'expedition-forecast-line';
    active.textContent = forecast.activeRoutes?.length
      ? `活动路线：${forecast.activeRoutes.map((route) => `${route.name}→${route.active.name}`).join('、')}`
      : '现在没有巢穴在出兵。';
    element.appendChild(active);

    const safe = document.createElement('p');
    safe.className = 'expedition-forecast-line';
    safe.textContent = forecast.safeRoutes?.length
      ? `已停止出兵：${forecast.safeRoutes.map((route) => route.name).join('、')}`
      : '还没有任何方向被彻底清空。';
    element.appendChild(safe);

    if (forecast.threatening?.length) {
      const enemies = document.createElement('p');
      enemies.className = 'expedition-forecast-line';
      enemies.textContent = `威胁来源敌群：${forecast.threatening
        .map((point) => `${point.name}（${(point.enemies ?? []).map((enemy) => enemy.name).join('/')}）`)
        .join('，')}`;
      element.appendChild(enemies);
    }
  }

  renderRoutes(snapshot) {
    const list = this.parts?.list;
    if (!list) return;
    list.textContent = '';
    const trackedId = this.game?.expeditions?.trackedId ?? null;
    (snapshot.briefs ?? []).forEach((brief) => {
      const card = document.createElement('article');
      card.className = 'expedition-card';
      card.dataset.expeditionRoute = brief.id;
      if (brief.id === trackedId) card.classList.add('is-tracked');
      if (brief.stage === EXPEDITION_STATE.cleared) card.classList.add('is-cleared');

      const head = document.createElement('div');
      head.className = 'expedition-card-head';
      const name = document.createElement('span');
      name.className = 'expedition-card-name';
      name.textContent = `${brief.name}（${brief.direction}）`;
      const state = document.createElement('span');
      state.className = 'expedition-card-state';
      state.textContent = brief.stateLabel;
      head.append(name, state);

      const target = document.createElement('p');
      target.className = 'expedition-card-target';
      target.textContent = brief.targetName
        ? `当前目标：${brief.targetName}｜敌群 ${(brief.enemies ?? []).map((enemy) => enemy.name).join('/') || '未知'}`
        : '当前目标：这个方向已经清空';

      const strategy = document.createElement('p');
      strategy.className = 'expedition-card-strategy';
      strategy.textContent = brief.strategy;

      const facts = document.createElement('dl');
      facts.className = 'expedition-card-facts';
      const addFact = (label, value) => {
        if (!value) return;
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        row.append(dt, dd);
        facts.appendChild(row);
      };
      addFact('实际掉落', (brief.drops ?? []).map((drop) => `${drop.name}×${drop.count}`).join('、'));
      addFact('木傀儡', brief.worker ? `${brief.worker.name}×${brief.worker.count}` : '');
      addFact('待招募', (brief.recruits ?? [])
        .map((recruit) => `${recruit.name}×${recruit.count ?? 1}`)
        .join('、'));
      if (brief.blueprint) {
        const status = brief.blueprint.researched
          ? '已研究'
          : (brief.blueprint.ready ? '图纸已到手，可研究' : `拆掉${brief.blueprint.nestName}取得`);
        addFact('区域图纸', `${brief.blueprint.name}（${status}）`);
      }

      const payoff = document.createElement('p');
      payoff.className = 'expedition-card-payoff';
      payoff.textContent = `收益：${brief.payoff || brief.strategy}`;

      const actions = document.createElement('div');
      actions.className = 'expedition-card-actions';
      const trackButton = document.createElement('button');
      trackButton.type = 'button';
      trackButton.className = 'backpack-action expedition-action';
      trackButton.dataset.expeditionTrack = brief.id;
      trackButton.textContent = brief.id === trackedId ? '取消追踪' : '追踪';
      const focusButton = document.createElement('button');
      focusButton.type = 'button';
      focusButton.className = 'backpack-action expedition-action';
      focusButton.dataset.expeditionFocus = brief.id;
      focusButton.textContent = '查看位置';
      focusButton.disabled = !Number.isFinite(brief.targetX);
      actions.append(trackButton, focusButton);

      card.append(head, target, strategy, facts, payoff, actions);
      list.appendChild(card);
    });
  }

  onClick(event) {
    if (event.target.closest('[data-expedition-close]')) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    const track = event.target.closest('[data-expedition-track]');
    if (track && !track.disabled) {
      event.preventDefault();
      event.stopPropagation();
      this.game?.expeditions?.toggleTrack?.(track.dataset.expeditionTrack);
      this.refresh({ force: true });
      return;
    }
    const focus = event.target.closest('[data-expedition-focus]');
    if (focus && !focus.disabled) {
      event.preventDefault();
      event.stopPropagation();
      const result = this.game?.expeditions?.focusRoute?.(focus.dataset.expeditionFocus);
      if (result?.ok === false) {
        this.game?.hints?.setHintOnce?.('这条路线现在没有可查看的点位', 'expedition-focus-fail');
      }
      this.refresh({ force: true });
    }
  }
}
