import {
  CARD_DEFINITIONS,
  CARD_META,
  DECK_SIZE,
  LEVEL_DEFINITIONS,
  STARTER_CARD_IDS
} from '../data/gameData.js';
import { cardEnergyCost, cardThemeColor, createCardArtMarkup } from './CardSystem.js';

const STORAGE_KEY = 'village-war-meta-v1';
const STARTING_COINS = 10000;
const STARTING_COINS_VERSION = 1;
const MAX_LEVEL_DIFFICULTY = 10;
const WAVE_DIFFICULTY_GROWTH_PER_SELECTED_DIFFICULTY = 0.16;
const TEST_VERSION_LABEL = '测试版本 v0.1.0';
const CHANGELOG_ENTRIES = [
  {
    date: '2026-07-07',
    title: '触屏操作与奖励修复',
    items: [
      '雪原关卡相机距离恢复为标准关卡距离。',
      '修复手机端框选单位后点击地面偶尔不下达移动命令的问题。',
      '修复手机端波次奖励按钮偶尔无法进入二段选择界面的问题。'
    ]
  },
  {
    date: '2026-07-07',
    title: '雪原海岸裂缝修整',
    items: [
      '收紧海岸水色混合，减少雪岸被海水染蓝的问题。',
      '崖壁改为连续环形网格，减少分段之间的裂缝。',
      '树木高度、离路距离和枯草分布回调到上一版。'
    ]
  },
  {
    date: '2026-07-07',
    title: '雪原崖壁与村落清理',
    items: [
      '移除海岸边缘的长方体崖面，改为沿岛轮廓生成低多边形石质崖壁。',
      '水洼恢复为清亮冰蓝色，崖壁颜色改得更干净。',
      '枯草改为簇状分布，后景房屋扩大并组成更明显的村落层级。',
      '海面浮冰改为更短碎的不规则冰片，减少规则长条块。'
    ]
  },
  {
    date: '2026-07-07',
    title: '雪原岛体与道路细化',
    items: [
      '雪原岛体整体抬高，海岸边缘改为石色交错断崖。',
      '枯草体积放大，并在中部空地增加更明显的覆雪草簇。',
      '道路曲线和边缘改得更自然，森林边界拆散，减少块状感。'
    ]
  },
  {
    date: '2026-07-06',
    title: '雪原海面与覆雪岩草',
    items: [
      '雪原海面范围再次扩大，寻路边界保持不变。',
      '敌营后方的尖锥山体替换为覆雪岩石群，避免像稻草堆。',
      '开阔雪地、林缘和岩石附近增加覆雪枯草簇。'
    ]
  },
  {
    date: '2026-07-06',
    title: '雪原构图二次修正',
    items: [
      '扩大雪原水面渲染范围并保留原寻路边界，避免画面里露出矩形水面边缘。',
      '重塑默认雪岛外轮廓，强化前景海湾、侧向半岛和不规则断崖。',
      '调整中央 S 路、左右林带和后景村落群，让整体更贴近参考图的小型雪岛战场。'
    ]
  },
  {
    date: '2026-07-06',
    title: '雪原岛屿构图调整',
    items: [
      '默认雪原改为海中雪岛构图，增加不规则海岸、冰湾、前景断崖和周边浮冰。',
      '主路加宽并改为更明显的中央 S 形，引导视线从前景基地通向后景敌营。',
      '树林、村落、冰湖和岩体按参考图重新分成左中森林、右侧森林、后景村落和前景开阔区。',
      '雪原初始镜头略微拉高后移，让进入关卡时能直接看到更多整体地貌构图。'
    ]
  },
  {
    date: '2026-07-06',
    title: '雪原场景重新构图',
    items: [
      '默认雪原改为不对称主陆块构图，使用更清晰的前景、中景和背景地貌层次。',
      '主路改为从基地到敌营的 S 形压实雪路，并重新组织林带、开阔雪地、冰湾和岩体节奏。',
      '保持原有低多边形材质、颜色、光照和雪天气氛，只调整地形与装饰布局。'
    ]
  },
  {
    date: '2026-07-06',
    title: '三选一卡牌布局贴合',
    items: [
      '三选一弹窗宽度改为贴合三张候选卡的实际占用空间，减少左右空白。',
      '候选卡的卡面图片横向铺满卡牌宽度，强化卡牌感。'
    ]
  },
  {
    date: '2026-07-06',
    title: '三选一卡牌宽度调整',
    items: [
      '开局选牌和波次奖励的三选一卡牌改为固定卡牌宽度，并在弹窗中居中排列。',
      '窄屏仍保持单列信息卡布局，避免手机端内容拥挤。'
    ]
  },
  {
    date: '2026-07-06',
    title: '局外卡牌视觉收敛',
    items: [
      '商店、牌组和升级页面的卡牌改为低饱和深色面板，减少整张卡牌铺色带来的刺眼感。',
      '卡牌类型颜色保留在符文、细边和插画底色上，让卡牌界面更贴近当前局外 UI。'
    ]
  },
  {
    date: '2026-07-06',
    title: '主菜单版式微调',
    items: [
      '移除主菜单标题和按钮后方的大背景面板，让入口直接浮在雪原背景上。',
      '测试版本文字固定到屏幕底部，避免挤在主菜单按钮区域里。'
    ]
  },
  {
    date: '2026-07-06',
    title: '牌组开始修复',
    items: [
      '出战牌组数量恢复为 30 张，修复选择牌组后开始关卡被错误数量校验挡住的问题。',
      '初始牌组恢复为 30 张，并保留蛮兵、弓兵及多类型卡牌组合。',
      '旧存档里不足 30 张的默认出战牌组会在加载时重置为完整初始牌组。'
    ]
  },
  {
    date: '2026-07-06',
    title: '恢复普通 UI 风格',
    items: [
      '移除生图切片接入的按钮、面板和装饰素材，界面回到普通 CSS 风格。',
      '保留主菜单、选关、商店、玩法说明和更新日志的独立页面结构。'
    ]
  },
  {
    date: '2026-07-06',
    title: '主菜单结构调整',
    items: [
      '新增独立主菜单入口，选关、商店、玩法说明、更新日志改为独立页面。',
      '主菜单底部增加测试版本标识，后续更新需要同步补充更新日志。',
      '保留当前局外 UI 的游戏化硬边风格，并修正选关与商店混在同一导航中的问题。'
    ]
  }
];

export class MetaGameSystem {
  constructor({ onStartLevel, onStartDebug = null, onStartAnimationPreview = null }) {
    this.onStartLevel = onStartLevel;
    this.onStartDebug = onStartDebug;
    this.onStartAnimationPreview = onStartAnimationPreview;
    this.progress = loadProgress();
    this.view = 'menu';
    this.selectedLevelId = this.progress.preferences.selectedLevelId;
    this.selectedDifficulty = this.selectedDifficultyForLevel(this.selectedLevelId);
    this.deckSelection = this.progress.preferences.deckSelection.slice(0, DECK_SIZE);
    this.lastResult = null;
    this.notice = null;
    this.noticeTimer = null;
    this.root = createMetaRoot();
    this.onDebugKeyDown = (event) => this.handleDebugKeyDown(event);
    this.root.addEventListener('click', (event) => this.onClick(event));
    this.root.addEventListener('pointerdown', stopMetaEvent);
    this.root.addEventListener('contextmenu', stopMetaEvent);
    document.addEventListener('keydown', this.onDebugKeyDown);
    this.show('menu');
  }

  show(view = this.view, options = {}) {
    if (!options.keepNotice && view !== this.view) {
      this.clearNotice();
    }
    this.view = view;
    this.root.hidden = false;
    document.body.classList.add('is-meta-open');
    this.render(options);
  }

  hide() {
    this.root.hidden = true;
    document.body.classList.remove('is-meta-open');
  }

  completeLevel(result) {
    const reward = result.victory ? this.calculateReward(result) : 0;
    if (result.victory) {
      const levelId = result.session.level.id;
      const currentDifficulty = this.availableDifficulty(levelId);
      const nextDifficulty = Math.min(
        MAX_LEVEL_DIFFICULTY,
        clampDifficulty(result.session.difficulty) + 1
      );
      this.progress.levelDifficulties[levelId] = Math.max(
        currentDifficulty,
        nextDifficulty
      );
      this.progress.coins += reward;
      saveProgress(this.progress);
    }

    this.lastResult = {
      ...result,
      reward,
      nextDifficulty: this.progress.levelDifficulties[result.session.level.id] ?? 1
    };
    this.show('result');
  }

  calculateReward(result) {
    const level = result.session.level;
    const difficulty = Math.max(1, result.session.difficulty);
    const targetTime = Math.max(30, level.targetTime ?? 180);
    const speedBonus = Math.max(0, (targetTime - result.elapsedTime) / targetTime);
    const speedMultiplier = 1 + Math.min(0.6, speedBonus * 0.6);
    const difficultyMultiplier = 1 + (difficulty - 1) * 0.45;
    const abilityMultiplier = Math.max(0, result.rewardMultiplier ?? 1);
    return Math.max(1, Math.round(
      level.baseReward * difficultyMultiplier * speedMultiplier * abilityMultiplier
    ));
  }

  onClick(event) {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    event.preventDefault();
    const { action } = actionTarget.dataset;

    if (action === 'menu') {
      this.show('menu');
      return;
    }
    if (action === 'levels') {
      this.show('levels');
      return;
    }
    if (action === 'shop') {
      this.show('shop');
      return;
    }
    if (action === 'upgrades') {
      this.show('upgrades');
      return;
    }
    if (action === 'guide') {
      this.show('guide');
      return;
    }
    if (action === 'changelog') {
      this.show('changelog');
      return;
    }
    if (action === 'debug-scene') {
      this.enterDebugScene();
      return;
    }
    if (action === 'animation-preview') {
      this.enterAnimationPreview();
      return;
    }
    if (action === 'select-level') {
      this.persistPreferences();
      this.selectedLevelId = actionTarget.dataset.levelId;
      this.selectedDifficulty = this.selectedDifficultyForLevel(this.selectedLevelId);
      this.persistPreferences();
      this.show('levels');
      return;
    }
    if (action === 'select-difficulty') {
      const difficulty = clampDifficulty(actionTarget.dataset.difficulty);
      if (difficulty <= this.availableDifficulty(this.selectedLevelId)) {
        this.selectedDifficulty = difficulty;
        this.persistPreferences();
      }
      this.show('levels');
      return;
    }
    if (action === 'deck') {
      this.ensureDeckSelection();
      this.persistPreferences();
      this.show('deck');
      return;
    }
    if (action === 'toggle-deck-card') {
      this.toggleDeckCard(actionTarget.dataset.cardId);
      this.show('deck', { preserveScroll: true });
      return;
    }
    if (action === 'start-level') {
      this.startLevel();
      return;
    }
    if (action === 'buy-card') {
      this.buyCard(actionTarget.dataset.cardId);
      return;
    }
    if (action === 'upgrade-card') {
      this.upgradeCard(actionTarget.dataset.cardId);
    }
  }

  handleDebugKeyDown(event) {
    if (event.repeat || isTextInputTarget(event.target)) return;
    if (event.code === 'F3' || event.key === 'F3') {
      event.preventDefault();
      event.stopPropagation();
      this.enterDebugScene();
      return;
    }
    const isDebugGoldKey = event.shiftKey && (
      event.code === 'KeyB' ||
      event.key?.toLowerCase() === 'b'
    );
    if (!isDebugGoldKey) return;
    event.preventDefault();
    event.stopPropagation();
    this.progress.coins += 1000;
    saveProgress(this.progress);
    this.render();
  }

  render(options = {}) {
    const scrollTop = options.preserveScroll ? this.root.scrollTop : 0;
    const viewScrollTop = options.preserveScroll
      ? this.root.querySelector('.meta-deck, .meta-layout, .meta-home, .meta-menu, .meta-page')?.scrollTop ?? 0
      : 0;
    const shellClass = `meta-shell ${this.view === 'menu' ? 'is-main-menu' : 'is-subpage'}`;
    this.root.innerHTML = `
      <div class="${shellClass}" role="dialog" aria-modal="true" aria-label="局外菜单">
        ${this.renderHeader()}
        ${this.renderNotice()}
        ${this.renderView()}
      </div>
    `;
    if (options.preserveScroll) {
      this.root.scrollTop = scrollTop;
      const restoreViewScroll = () => {
        const viewScroller = this.root.querySelector('.meta-deck, .meta-layout, .meta-home, .meta-menu, .meta-page');
        if (viewScroller) viewScroller.scrollTop = viewScrollTop;
      };
      restoreViewScroll();
      window.requestAnimationFrame(() => {
        this.root.scrollTop = scrollTop;
        restoreViewScroll();
      });
    }
  }

  enterDebugScene() {
    this.hide();
    this.onStartDebug?.();
  }

  enterAnimationPreview() {
    this.hide();
    this.onStartAnimationPreview?.();
  }

  renderHeader() {
    if (this.view === 'menu') return '';
    const currencyClass = `meta-currency${this.notice ? ' is-pulse' : ''}`;
    const pageTitle = pageTitleForView(this.view);
    return `
      <header class="meta-header">
        <div>
          <div class="meta-title">${pageTitle}</div>
          <div class="meta-subtitle">村落战争 / ${TEST_VERSION_LABEL}</div>
        </div>
        <button class="meta-back-button" type="button" data-action="menu">返回主菜单</button>
        <div class="${currencyClass}">
          <span>金币</span>
          <strong>${this.progress.coins}</strong>
        </div>
      </header>
    `;
  }

  renderNotice() {
    if (!this.notice) return '';
    return `
      <div class="meta-toast" role="status" aria-live="polite" data-notice-id="${this.notice.id}">
        ${this.notice.text}
      </div>
    `;
  }

  setNotice(text) {
    this.clearNotice({ render: false });
    this.notice = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text
    };
    this.noticeTimer = window.setTimeout(() => {
      this.clearNotice();
    }, 2600);
  }

  clearNotice({ render = true } = {}) {
    if (this.noticeTimer) {
      window.clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
    if (!this.notice) return;
    this.notice = null;
    if (render && !this.root.hidden) {
      this.render({ preserveScroll: true });
    }
  }

  renderView() {
    if (this.view === 'menu') return this.renderMainMenu();
    if (this.view === 'levels') return this.renderLevels();
    if (this.view === 'deck') return this.renderDeckBuilder();
    if (this.view === 'shop') return this.renderShop();
    if (this.view === 'guide') return this.renderGuide();
    if (this.view === 'changelog') return this.renderChangelog();
    if (this.view === 'upgrades') return this.renderUpgrades();
    if (this.view === 'result') return this.renderResult();
    return this.renderMainMenu();
  }

  renderMainMenu() {
    return `
      <main class="meta-menu">
        <div class="meta-menu-title">
          <h1>村落战争</h1>
          <p>雪原推进 / 卡牌构筑 / 即时战术</p>
        </div>
        <nav class="meta-menu-actions" aria-label="主菜单">
          <button class="meta-menu-button" type="button" data-action="levels">选关</button>
          <button class="meta-menu-button" type="button" data-action="shop">商店</button>
          <button class="meta-menu-button" type="button" data-action="guide">玩法说明</button>
          <button class="meta-menu-button" type="button" data-action="changelog">更新日志</button>
        </nav>
        <div class="meta-version-mark">${TEST_VERSION_LABEL}</div>
      </main>
    `;
  }

  renderLevels() {
    const selectedLevel = this.selectedLevel();
    const availableDifficulty = this.availableDifficulty(selectedLevel.id);
    const selectedDifficulty = Math.min(
      clampDifficulty(this.selectedDifficulty),
      availableDifficulty
    );
    const baseDifficulty = Math.max(1, Math.floor(selectedLevel.baseDifficulty ?? 1));
    const growthMultiplier = difficultyGrowthMultiplier(selectedLevel, selectedDifficulty);
    return `
      <main class="meta-layout meta-level-select">
        <section class="meta-panel meta-hero-panel">
          <div class="meta-panel-kicker">当前战役</div>
          <h1>${selectedLevel.name}</h1>
          <p>${selectedLevel.subtitle}</p>
          <div class="meta-hero-stats">
            <div>
              <span>开局难度</span>
              <strong>${baseDifficulty}</strong>
            </div>
            <div>
              <span>波次成长</span>
              <strong>x${formatGrowthMultiplier(growthMultiplier)}</strong>
            </div>
            <div>
              <span>解锁难度</span>
              <strong>${availableDifficulty}/${MAX_LEVEL_DIFFICULTY}</strong>
            </div>
          </div>
          <div class="meta-section-title">选择难度</div>
          <div class="meta-difficulty-row meta-hero-difficulty" aria-label="关卡难度">
            ${Array.from({ length: MAX_LEVEL_DIFFICULTY }, (_, index) => {
              const difficulty = index + 1;
              const disabled = difficulty > availableDifficulty ? 'disabled' : '';
              const selected = difficulty === selectedDifficulty ? 'is-selected' : '';
              return `
                <button
                  class="${selected}"
                  type="button"
                  data-action="select-difficulty"
                  data-difficulty="${difficulty}"
                  ${disabled}
                >
                  ${difficulty}
                </button>
              `;
            }).join('')}
          </div>
          <div class="meta-victory-goal">
            <span>胜利目标</span>
            <strong>击败 3 个 Boss 或击破敌营</strong>
          </div>
          <div class="meta-hero-actions">
            <button class="meta-primary-button" type="button" data-action="deck">选择牌组</button>
          </div>
        </section>
        <section class="meta-panel meta-stage-panel">
          <div class="meta-section-title">关卡</div>
          <div class="meta-level-list">
            ${LEVEL_DEFINITIONS.map((level) => `
              <button
                class="meta-level-button ${level.id === selectedLevel.id ? 'is-selected' : ''}"
                type="button"
                data-action="select-level"
                data-level-id="${level.id}"
              >
                <strong>${level.name}</strong>
                <span>${level.subtitle}</span>
                <em>基础 ${level.baseDifficulty ?? 1} / 已解锁 ${this.availableDifficulty(level.id)}/${MAX_LEVEL_DIFFICULTY}</em>
              </button>
            `).join('')}
          </div>
        </section>
      </main>
    `;
  }

  renderDeckBuilder() {
    this.ensureDeckSelection();
    const selected = new Set(this.deckSelection);
    const selectedCount = this.deckSelection.length;
    return `
      <main class="meta-deck">
        <section class="meta-panel meta-deck-summary">
          <div>
            <div class="meta-section-title">出战牌组</div>
            <p>已选择 ${selectedCount}/${DECK_SIZE}。必须选择 ${DECK_SIZE} 张卡牌才能进入关卡。</p>
          </div>
          <button class="meta-primary-button" type="button" data-action="start-level" ${selectedCount === DECK_SIZE ? '' : 'disabled'}>
            开始关卡
          </button>
          <button class="meta-secondary-button" type="button" data-action="levels">返回选关</button>
        </section>
        <section class="meta-card-grid">
          ${this.progress.ownedCards.map((id) => {
            const card = this.cardWithLevel(id);
            const isSelected = selected.has(id);
            return this.renderMetaCard(card, {
              action: 'toggle-deck-card',
              stateText: isSelected ? '已加入' : '加入',
              selected: isSelected,
              disabled: !isSelected && selectedCount >= DECK_SIZE
            });
          }).join('')}
        </section>
      </main>
    `;
  }

  renderShop() {
    const unowned = CARD_DEFINITIONS.filter((card) => (
      !card.lootOnly && !this.progress.ownedCards.includes(card.id)
    ));
    return `
      <main class="meta-deck">
        <section class="meta-panel">
          <div class="meta-section-title">卡牌商店</div>
          <p>购买后会进入局外卡牌库，并可加入 30 张出战牌组。</p>
          <button class="meta-secondary-button" type="button" data-action="upgrades">升级已有卡牌</button>
        </section>
        <section class="meta-card-grid">
          ${unowned.length ? unowned.map((card) => {
            const cost = CARD_META[card.id]?.buyCost ?? 80;
            return this.renderMetaCard({ ...card, level: 1 }, {
              action: 'buy-card',
              stateText: `购买 ${cost}`,
              disabled: this.progress.coins < cost
            });
          }).join('') : '<div class="meta-empty">商店已经清空。</div>'}
        </section>
      </main>
    `;
  }

  renderGuide() {
    return `
      <main class="meta-page meta-guide-page">
        <section class="meta-panel meta-guide-panel">
          <div class="meta-section-title">核心流程</div>
          <p>先在选关页面选择关卡和难度，再配置 30 张出战卡牌进入战斗。战斗中通过出牌、移动、驻守和三选一奖励推进基地。</p>
        </section>
        <section class="meta-guide-grid">
          <article class="meta-panel">
            <div class="meta-section-title">卡牌</div>
            <p>单位卡会召唤部队；能力、战术、建筑卡会提供即时效果或阵地支援。局内获得的临时卡通常不会带回局外牌库。</p>
          </article>
          <article class="meta-panel">
            <div class="meta-section-title">战斗</div>
            <p>守住基地耐久，清理敌方波次并击破敌营。不同关卡会有地形、天气或敌营规则差异。</p>
          </article>
          <article class="meta-panel">
            <div class="meta-section-title">成长</div>
            <p>通关后获得金币并解锁更高难度。商店可购买新卡，也可以升级已拥有卡牌。</p>
          </article>
        </section>
      </main>
    `;
  }

  renderChangelog() {
    return `
      <main class="meta-page meta-changelog-page">
        <section class="meta-panel meta-changelog-intro">
          <div class="meta-section-title">更新日志</div>
          <p>之后每次功能、数值或界面更新，都在这里补一条记录，方便测试时回看变化。</p>
        </section>
        <section class="meta-changelog-list">
          ${CHANGELOG_ENTRIES.map((entry) => `
            <article class="meta-panel meta-changelog-entry">
              <div class="meta-changelog-date">${entry.date}</div>
              <h2>${entry.title}</h2>
              <ul>
                ${entry.items.map((item) => `<li>${item}</li>`).join('')}
              </ul>
            </article>
          `).join('')}
        </section>
      </main>
    `;
  }

  renderUpgrades() {
    return `
      <main class="meta-deck">
        <section class="meta-panel">
          <div class="meta-section-title">卡牌升级</div>
          <p>升级消耗金币翻倍，并提高卡牌基础等级。局内事件升级只在当局生效；附魔牌的局内升级会提高施加的附魔等级。</p>
        </section>
        <section class="meta-card-grid">
          ${this.progress.ownedCards.map((id) => {
            const card = this.cardWithLevel(id);
            const cost = upgradeCost(id, card.level);
            return this.renderMetaCard(card, {
              action: 'upgrade-card',
              stateText: `升级 ${cost}`,
              disabled: this.progress.coins < cost,
              footer: `<span>当前 Lv.${card.level}</span><span>下级费用 ${cost}</span>`
            });
          }).join('')}
        </section>
      </main>
    `;
  }

  renderResult() {
    const result = this.lastResult;
    if (!result) return this.renderLevels();
    const level = result.session.level;
    return `
      <main class="meta-home">
        <section class="meta-panel meta-result-panel">
          <div class="meta-panel-kicker">${result.victory ? '通关成功' : '关卡失败'}</div>
          <h1>${level.name} / 难度 ${result.session.difficulty}</h1>
          <div class="meta-result-grid">
            <span>用时 <strong>${formatTime(result.elapsedTime)}</strong></span>
            <span>到达波次 <strong>${result.wave}</strong></span>
            <span>获得金币 <strong>${result.reward}</strong></span>
            <span>已解锁难度 <strong>${result.nextDifficulty}</strong></span>
          </div>
          <div class="meta-action-row">
            <button class="meta-primary-button" type="button" data-action="levels">继续选关</button>
            <button class="meta-secondary-button" type="button" data-action="shop">商店</button>
          </div>
        </section>
      </main>
    `;
  }

  renderMetaCard(card, options) {
    const disabled = options.disabled ? 'disabled' : '';
    const selected = options.selected ? ' is-selected' : '';
    return `
      <article class="meta-card${selected}" style="--card-color:${cardThemeColor(card)}">
        <div class="meta-card-cost">${cardEnergyCost(card)}</div>
        <div class="meta-card-level">Lv.${card.level ?? 1}</div>
        <div class="meta-card-face">
          <div class="meta-card-header">
            <span class="meta-card-rune">${card.label}</span>
            <span>${kindLabel(card.kind)}</span>
          </div>
          ${createCardArtMarkup(card)}
          <strong>${card.name}</strong>
          <p>${card.summary}</p>
          ${options.footer ? `<div class="meta-card-footer">${options.footer}</div>` : ''}
        </div>
        <button
          class="meta-card-action"
          type="button"
          data-action="${options.action}"
          data-card-id="${card.id}"
          ${disabled}
        >
          ${options.stateText}
        </button>
      </article>
    `;
  }

  selectedLevel() {
    return LEVEL_DEFINITIONS.find((level) => level.id === this.selectedLevelId) ?? LEVEL_DEFINITIONS[0];
  }

  availableDifficulty(levelId) {
    return clampDifficulty(this.progress.levelDifficulties[levelId] ?? 1);
  }

  selectedDifficultyForLevel(levelId) {
    const saved = this.progress.preferences.selectedDifficulties?.[levelId] ?? 1;
    return Math.min(clampDifficulty(saved), this.availableDifficulty(levelId));
  }

  persistPreferences() {
    const selectedLevelId = normalizeLevelId(this.selectedLevelId);
    const selectedDifficulties = {
      ...(this.progress.preferences?.selectedDifficulties ?? {})
    };
    selectedDifficulties[selectedLevelId] = Math.min(
      clampDifficulty(this.selectedDifficulty),
      this.availableDifficulty(selectedLevelId)
    );
    LEVEL_DEFINITIONS.forEach((level) => {
      selectedDifficulties[level.id] = Math.min(
        clampDifficulty(selectedDifficulties[level.id] ?? 1),
        this.availableDifficulty(level.id)
      );
    });
    this.selectedLevelId = selectedLevelId;
    this.deckSelection = normalizeDeckSelection(this.deckSelection, this.progress.ownedCards, {
      defaultToOwned: false
    });
    this.progress.preferences = {
      selectedLevelId,
      selectedDifficulties,
      deckSelection: this.deckSelection.slice(0, DECK_SIZE)
    };
    saveProgress(this.progress);
  }

  cardWithLevel(id) {
    const definition = CARD_DEFINITIONS.find((card) => card.id === id) ?? CARD_DEFINITIONS[0];
    return {
      ...definition,
      level: Math.max(1, this.progress.cardLevels[id] ?? 1)
    };
  }

  ensureDeckSelection() {
    const previous = this.deckSelection.join('|');
    this.deckSelection = normalizeDeckSelection(this.deckSelection, this.progress.ownedCards, {
      defaultToOwned: false
    });
    if (this.deckSelection.join('|') !== previous) {
      this.persistPreferences();
    }
  }

  toggleDeckCard(id) {
    if (!this.progress.ownedCards.includes(id)) return;
    const index = this.deckSelection.indexOf(id);
    if (index >= 0) {
      this.deckSelection.splice(index, 1);
      this.persistPreferences();
      return;
    }
    if (this.deckSelection.length >= DECK_SIZE) return;
    this.deckSelection.push(id);
    this.persistPreferences();
  }

  buyCard(id) {
    if (this.progress.ownedCards.includes(id)) return;
    const card = CARD_DEFINITIONS.find((definition) => definition.id === id);
    const cost = CARD_META[id]?.buyCost ?? 80;
    if (this.progress.coins < cost) return;
    this.progress.coins -= cost;
    this.progress.ownedCards.push(id);
    this.progress.cardLevels[id] = Math.max(1, this.progress.cardLevels[id] ?? 1);
    this.setNotice(`已购买 ${card?.name ?? '卡牌'}`);
    saveProgress(this.progress);
    this.show('shop', { preserveScroll: true, keepNotice: true });
  }

  upgradeCard(id) {
    if (!this.progress.ownedCards.includes(id)) return;
    const level = Math.max(1, this.progress.cardLevels[id] ?? 1);
    const cost = upgradeCost(id, level);
    if (this.progress.coins < cost) return;
    this.progress.coins -= cost;
    this.progress.cardLevels[id] = level + 1;
    saveProgress(this.progress);
    this.show('upgrades', { preserveScroll: true });
  }

  startLevel() {
    this.ensureDeckSelection();
    if (this.deckSelection.length !== DECK_SIZE) {
      this.setNotice(`请选择 ${DECK_SIZE} 张卡牌后开始关卡`);
      this.show('deck', { preserveScroll: true, keepNotice: true });
      return;
    }
    const deckIds = this.deckSelection.slice(0, DECK_SIZE);
    const deck = deckIds.map((id, index) => {
      const card = this.cardWithLevel(id);
      return {
        ...card,
        instanceId: `${id}-${index}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      };
    });
    if (!deck.some((card) => card.kind === 'summon')) {
      this.setNotice('出战牌组至少需要 1 张单位卡');
      this.show('deck', { preserveScroll: true, keepNotice: true });
      return;
    }
    const difficulty = Math.min(
      clampDifficulty(this.selectedDifficulty),
      this.availableDifficulty(this.selectedLevelId)
    );
    this.selectedDifficulty = difficulty;
    this.persistPreferences();
    const session = {
      level: this.selectedLevel(),
      difficulty,
      deck,
      startedAt: Date.now()
    };
    this.hide();
    this.onStartLevel?.(session);
  }
}

function createMetaRoot() {
  let root = document.querySelector('#meta-root');
  if (root) return root;
  root = document.createElement('section');
  root.id = 'meta-root';
  root.className = 'meta-root';
  document.querySelector('#app')?.appendChild(root);
  return root;
}

function pageTitleForView(view) {
  const titles = {
    levels: '选关',
    deck: '选择牌组',
    shop: '商店',
    upgrades: '升级卡牌',
    guide: '玩法说明',
    changelog: '更新日志',
    result: '战斗结算'
  };
  return titles[view] ?? '村落战争';
}

function loadProgress() {
  const raw = readStoredProgress();
  const ownedCards = normalizeOwnedCards(raw?.ownedCards);
  const cardLevels = {};
  ownedCards.forEach((id) => {
    cardLevels[id] = Math.max(1, Math.floor(raw?.cardLevels?.[id] ?? 1));
  });
  const levelDifficulties = {};
  LEVEL_DEFINITIONS.forEach((level) => {
    levelDifficulties[level.id] = clampDifficulty(raw?.levelDifficulties?.[level.id] ?? 1);
  });
  const preferences = normalizePreferences(raw?.preferences, ownedCards, levelDifficulties);
  const hasStartingCoinsGrant = raw?.startingCoinsVersion === STARTING_COINS_VERSION;
  const storedCoins = Math.max(0, Math.floor(raw?.coins ?? 0));
  const progress = {
    coins: hasStartingCoinsGrant ? storedCoins : Math.max(storedCoins, STARTING_COINS),
    startingCoinsVersion: STARTING_COINS_VERSION,
    ownedCards,
    cardLevels,
    levelDifficulties,
    preferences
  };
  saveProgress(progress);
  return progress;
}

function readStoredProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Local storage can fail in private contexts; gameplay can continue in memory.
  }
}

function normalizePreferences(rawPreferences, ownedCards, levelDifficulties) {
  const selectedLevelId = normalizeLevelId(rawPreferences?.selectedLevelId);
  const selectedDifficulties = {};
  LEVEL_DEFINITIONS.forEach((level) => {
    selectedDifficulties[level.id] = Math.min(
      clampDifficulty(rawPreferences?.selectedDifficulties?.[level.id] ?? 1),
      clampDifficulty(levelDifficulties[level.id] ?? 1)
    );
  });
  const savedDeckSelection = normalizeDeckSelection(rawPreferences?.deckSelection, ownedCards);
  const starterDeckSelection = normalizeDeckSelection(STARTER_CARD_IDS, ownedCards);
  return {
    selectedLevelId,
    selectedDifficulties,
    deckSelection: savedDeckSelection.length === DECK_SIZE
      ? savedDeckSelection
      : starterDeckSelection
  };
}

function normalizeLevelId(levelId) {
  return LEVEL_DEFINITIONS.some((level) => level.id === levelId)
    ? levelId
    : LEVEL_DEFINITIONS[0]?.id ?? 'snow-valley';
}

function normalizeDeckSelection(rawDeckSelection, ownedCards, options = {}) {
  const defaultToOwned = options.defaultToOwned !== false;
  const source = Array.isArray(rawDeckSelection)
    ? rawDeckSelection
    : defaultToOwned ? ownedCards : [];
  const owned = new Set(ownedCards);
  const result = [];
  source.forEach((id) => {
    if (!owned.has(id) || result.includes(id)) return;
    result.push(id);
  });
  return result.slice(0, DECK_SIZE);
}

function normalizeOwnedCards(rawOwnedCards) {
  const validIds = new Set(
    CARD_DEFINITIONS.filter((card) => !card.lootOnly).map((card) => card.id)
  );
  const result = [];
  [...STARTER_CARD_IDS, ...(rawOwnedCards ?? [])].forEach((id) => {
    if (!validIds.has(id) || result.includes(id)) return;
    result.push(id);
  });
  return result;
}

function upgradeCost(id, level) {
  const base = CARD_META[id]?.upgradeBaseCost ?? 25;
  return Math.round(base * 2 ** Math.max(0, level - 1));
}

function clampDifficulty(value) {
  const number = Number(value);
  const integer = Number.isFinite(number) ? Math.floor(number) : 1;
  return Math.max(1, Math.min(MAX_LEVEL_DIFFICULTY, integer));
}

function difficultyGrowthMultiplier(level, selectedDifficulty) {
  const levelGrowth = Number.isFinite(level?.waveDifficultyGrowth)
    ? Math.max(0.1, level.waveDifficultyGrowth)
    : 1;
  return levelGrowth * (1 + (clampDifficulty(selectedDifficulty) - 1) * WAVE_DIFFICULTY_GROWTH_PER_SELECTED_DIFFICULTY);
}

function formatGrowthMultiplier(value) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, '');
}

function kindLabel(kind) {
  if (kind === 'summon') return '单位';
  if (kind === 'spell') return '法术';
  if (kind === 'building') return '建筑';
  if (kind === 'tactic') return '战术';
  if (kind === 'ability') return '能力';
  return '附魔';
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function stopMetaEvent(event) {
  if (event.type === 'contextmenu') {
    event.preventDefault();
  }
  event.stopPropagation();
}

function isTextInputTarget(target) {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable;
}
