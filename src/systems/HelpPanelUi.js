// 游戏内最小帮助面板。
//
// 为什么需要它：顶部中央那一行原先承担了"眼下"和"怎么玩"两种职责，开局就塞进
// 106 字的合成指南，把操作区整块占满（用户第 3 项）。玩法解释需要有地方可读，
// 但**不能**再占用战斗画面，也不该新建一套大型教程系统。所以：
//   - 入口是右上角工具条里一个 「?」 按钮（和设置齿轮同一排、同一材质）；
//   - 内容是**文字清单**，不是关卡式教程；
//   - 面板可关闭、不暂停游戏、不吃全屏指针（和远征面板同一处理方式）。
//
// 文案只写"读一眼就能继续玩"的量；凡是能从当前状态现算的（当前遇敌策略、
// 时间目标）都现读，不抄第二份数字。
import {
  PUPPET_COMBAT_MODE_LABELS,
  summarizePuppetCombatModes
} from './puppetCombatMode.js';
import { survivalObjectiveText } from './fieldCamps.js';

export class HelpPanelUi {
  constructor(game, options = {}) {
    this.game = game;
    this.mount = options.mount ?? (typeof document !== 'undefined' ? document.body : null);
    this.root = null;
    this.button = null;
    this.boundButton = false;
    this.windowHandlers = null;
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

  /** 入口按钮由 Game 在 HUD 工具条里创建（和设置齿轮同排），这里只负责绑定。 */
  attachButton(button) {
    if (!button || this.button === button) return;
    this.detachButton();
    this.button = button;
    button.addEventListener('click', this.onButtonClick);
    button.addEventListener('pointerdown', this.onButtonPointerDown);
    this.boundButton = true;
  }

  detachButton() {
    if (this.button && this.boundButton) {
      this.button.removeEventListener('click', this.onButtonClick);
      this.button.removeEventListener('pointerdown', this.onButtonPointerDown);
    }
    this.boundButton = false;
    this.button = null;
  }

  toggle() {
    return this.isOpen() ? this.close() : this.open();
  }

  open() {
    if (!this.available) return { ok: false, reason: 'no_mount' };
    this.ensureUi();
    if (!this.root) return { ok: false, reason: 'no_mount' };
    this.render();
    this.root.hidden = false;
    this.root.classList.add('is-open');
    this.game?.hints?.clearHint?.('help');
    return { ok: true };
  }

  close() {
    if (!this.root) return { ok: true, closed: true };
    this.root.hidden = true;
    this.root.classList.remove('is-open');
    return { ok: true, closed: true };
  }

  destroy() {
    this.detachButton();
    if (this.windowHandlers) {
      window.removeEventListener('pointerdown', this.windowHandlers.pointerDownCapture, { capture: true });
      this.windowHandlers = null;
    }
    this.root?.remove();
    this.root = null;
  }

  ensureUi() {
    if (this.root || !this.available) return this.root;
    const root = document.createElement('div');
    root.id = 'help-panel';
    root.className = 'help-panel';
    root.hidden = true;
    root.innerHTML = `
      <section class="help-frame" role="dialog" aria-label="玩法帮助">
        <header class="help-header">
          <div class="help-heading">
            <span class="help-kicker">海岛生存</span>
            <strong class="help-title">玩法帮助</strong>
          </div>
          <button type="button" class="help-close" data-help-close aria-label="关闭帮助">✕</button>
        </header>
        <div class="help-body" data-help-body></div>
      </section>
    `;
    this.mount.appendChild(root);
    this.root = root;
    // **不是模态**：容器不吃指针（CSS 里 pointer-events: none），左右两侧的空白
    // 仍然可以点地图。点面板外的空白处关闭面板，但只关面板、**不暂停游戏**——
    // 关闭走的是发送到窗口的那个 click（见下面的 windowHandlers）。
    root.addEventListener('pointerdown', (event) => {
      if (event.target === root) return;
      event.stopPropagation();
    });
    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-help-close]')) {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      }
    });
    root.addEventListener('contextmenu', (event) => event.preventDefault());
    // 面板开着时点地图空白处 = 收起面板（与 Esc 等价），而不是顺手把游戏暂停。
    // 监听挂在 window 的**捕获**阶段之前先让游戏自己的 pointerdown 处理完是不行的，
    // 所以这里只处理 pointerdown：捕获阶段收掉事件，游戏不会再拿它当选择/下令。
    this.windowHandlers = {
      pointerDownCapture: (event) => {
        if (!this.isOpen()) return;
        if (this.root?.contains(event.target)) return;
        // 「?」按钮自己就是开/关入口：它不在面板里，如果这里先关掉，
        // 随后按钮的 click 又会 toggle 回"打开"，玩家点关闭看起来毫无反应。
        if (this.button?.contains?.(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        this.close();
      }
    };
    window.addEventListener('pointerdown', this.windowHandlers.pointerDownCapture, { capture: true });
    return root;
  }

  /**
   * 文案组装。刻意保持短：每节一到三句，玩家读完就能回去操作。
   * 现算项（当前遇敌策略）读真实单位字段，不在文案里写死一个默认值。
   */
  sections() {
    const game = this.game;
    const worker = (game?.friendlyUnits ?? []).find((unit) => unit?.isWorker && unit.alive) ?? null;
    const summary = worker ? summarizePuppetCombatModes(worker) : null;
    const modeLine = summary?.mode
      ? `当前「${PUPPET_COMBAT_MODE_LABELS[summary.mode]}」。`
      : '';
    // 顶部那一行只放得下一句"眼下做什么"；这里把它展开成完整说明。
    // 数据现读远征快照（与顶部目标句同源），不会出现两套说法。
    const detailLines = game?.expeditions?.objectiveDetailLines?.()
      ?? [survivalObjectiveText(game?.survivalObjectiveInput?.() ?? {})];
    return [
      {
        title: '眼下',
        lines: detailLines
      },
      {
        title: '目标',
        lines: [
          '开局只有基地和一支木傀儡，没有战斗单位。',
          '白天采集、建造、给傀儡装武器；入夜后防线要能自己顶住。',
          '拆掉全部刷怪点并清掉残余敌人即获胜。'
        ]
      },
      {
        title: '操作',
        lines: [
          '左键点选，拖拽框选多个单位；右键地面移动。',
          '采集：按 **G** 进入资源框选，拖拽框住要采的树、石堆或矿脉。',
          'B 打开背包 / 合成，E 打开选中单位背包，Esc 关闭面板。',
          '滚轮缩放，中键拖动镜头，WASD 移动镜头，F 跟随选中单位，X 停止。'
        ]
      },
      {
        title: '采集与运输',
        lines: [
          '傀儡只采**你框选标记过的**资源点：按 G，拖拽框住树、石堆或矿脉。',
          '框选时按 F1–F12 设定优先级 1–12（默认 4）；按 C 进入取消标记模式。',
          '它采满背包后会自己走回基地卸货，然后继续采。',
          '敌人地盘里的资源（框选时会提示「傀儡不会去」）得先清掉那处营地或野兽才用得上。',
          '基地背包（B）里把斧/镐拖进傀儡的工具格，它才会装备。'
        ]
      },
      {
        title: '供能与建造',
        lines: [
          '设施与傀儡靠活动魔力运转，由基地与魔力炉供给；箭塔停火多半是燃料断了。',
          '建筑放在基地供能范围内才转得起来；放置预览的颜色就是能不能放。',
          '防御塔建在**哪里由你决定**：基地周围任何可走地面都行，只要在供能范围内、材料够。',
          '树、石堆、矿脉旁边的地会挡住地基；预览变红就是这种"这里放不下"。'
        ]
      },
      {
        title: '遇敌策略（木傀儡）',
        lines: [
          `${modeLine}选中傀儡后按 B，在「遇敌策略」里三选一：避战 / 战斗 / 自动。`,
          '避战：撤向最近友方可攻击建筑；战斗：主动迎战；自动：按战力与敌附魔估算。',
          '手里只有斧镐时它能自保，但打不动成群敌人——先合成傀儡武器（木棒 / 木刃 / 铁刃）。'
        ]
      },
      {
        title: '夜袭与远征',
        lines: [
          '入夜后巢穴会持续出兵；拆掉内巢会让它封印的外圈解除封印开始出兵。',
          '夜里敌人从最近那座还在出兵的巢穴方向压过来——塔摆在敌人来的那条路上最有用。',
          '「远征」面板列出四条路线、当前目标与真实掉落，追踪后顶部会指路。',
          '面板入口在右上角工具条，或按 P。'
        ]
      }
    ];
  }

  render() {
    const body = this.root?.querySelector('[data-help-body]');
    if (!body) return;
    body.textContent = '';
    this.sections().forEach((section) => {
      const block = document.createElement('section');
      block.className = 'help-section';
      const title = document.createElement('h3');
      title.className = 'help-section-title';
      title.textContent = section.title;
      block.appendChild(title);
      const list = document.createElement('ul');
      list.className = 'help-section-list';
      section.lines.forEach((line) => {
        const item = document.createElement('li');
        // `**强调**` 只有这一处需要，手写最少的解析，不引第三方 markdown。
        const parts = String(line).split(/\*\*(.+?)\*\*/g);
        parts.forEach((part, index) => {
          if (!part) return;
          if (index % 2 === 1) {
            const strong = document.createElement('strong');
            strong.textContent = part;
            item.appendChild(strong);
          } else {
            item.appendChild(document.createTextNode(part));
          }
        });
        list.appendChild(item);
      });
      block.appendChild(list);
      body.appendChild(block);
    });
  }
}
