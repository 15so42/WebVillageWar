import { itemDefinition, itemName, itemStackLimit, itemStacksByMerging } from './items.js';
import { CRAFT_ERROR_LABELS } from './crafting.js';
import { insertIntoInventory, moveSlot, TRANSFER_ERROR_LABELS } from './inventoryTransfer.js';
import { itemArtForSlot, itemStatLines } from './itemArt.js';
import {
  PRIORITY_MAX,
  PRIORITY_MIN,
  priorityLabel
} from './resourcePriority.js';
import {
  RUNE_LOCATION_BASE,
  RUNE_LOCATION_UNIT,
  RUNE_STONE_ITEM_ID,
  manaProgressForStone,
  manaThresholdForLevel,
  runeColor
} from './runeStones.js';
import { isManaStoneItem } from './manaStones.js';
import { RUNE_ERROR_LABELS } from './RuneStoneSystem.js';

/**
 * 统一背包界面（B 键 / 点单位下方的「背包」按钮）。
 *
 * 这是本轮改造的核心：**符文背包与基地库存合并成一个面板**。
 * 原因是需求里那句"背包就是背包"——符文石、魔力石、工具、材料都是物品，
 * 没有理由分住在两个面板里。数据层也已经跟着统一：符文石就是
 * `itemId === 'runeStone'` 的库存实例（见 RuneStoneSystem 的注释）。
 *
 * 布局（对应需求第 3 条）：
 *   左侧  —— 背包网格。基地 6 行 × 8 列 = 48 格；单位视图用该单位自己的格数。
 *   右侧  —— 合成 / 资源优先级。合成是**网格**：灰的表示材料不足，
 *            悬浮显示详情，点击后产物跟鼠标走，再点背包空格放下。
 *           （快捷栏不住在这里：它是屏幕底部的独立常驻栏，见 HotbarUi。）
 *
 * 合成可撤销：点配方会**立刻扣材料**并把产物拿到鼠标上，所以"看走眼点了、格子又不够"
 * 需要一个出口——产物还在手上时按右键，材料原样退回基地背包（见 `cancelCraft`）。
 * 产物一旦落进任何格子就不再记撤销来源：那时它是背包里的一件普通物品。
 *
 * 格子里物品的画法：
 *   图 + 右下角数量；符文石不可堆叠，所以不显示数量，等级压在左上角。
 *
 * 搬运规则与《我的世界》一致（左键拿起整叠 / 右键拿一半放一个 / 同类合并 / 异类交换 /
 * 手上有东西时按 Esc 或关面板会放回原处，绝不吞物品）。
 *
 * 本模块只做 DOM 与交互，所有状态变更都交回 Game 与库存的原子接口。
 */

const REFRESH_INTERVAL_MS = 400;
/** 基地是 6 行 × 8 列。列数写死，行数由容量推出来。 */
const BASE_COLUMNS = 8;
/**
 * 快捷栏那块容器的 key。
 *
 * 它和基地背包是同一类的 `Inventory`，但**不画在面板里**（在屏幕底部，见 HotbarUi），
 * 所以它不进 `containerEntries()`；面板的光标单独认这个 key，把它当落点——
 * 这正是"打开背包时两边可以互相拖"唯一需要的那条线。
 */
export const HOTBAR_CONTAINER_KEY = 'hotbar';

export class BackpackUi {
  constructor(game, options = {}) {
    this.game = game;
    this.mount = options.mount ?? (typeof document !== 'undefined' ? document.body : null);
    this.getSelectedUnit = options.getSelectedUnit ?? (() => null);
    this.root = null;
    this.parts = null;
    this.unit = null;
    this.mode = 'base';
    this.activeTab = 'craft';
    /** 手上拿着的那一叠（《我的世界》语义）。null 表示空手。 */
    this.cursor = null;
    this.cursorGhost = null;
    this.lastPointerX = null;
    this.lastPointerY = null;
    this.refreshTimer = null;
    this.lastSignature = '';
    this.feedback = null;
    this.feedbackTimer = null;
    /** 玩家见过（拥有过）的物品 id：右侧配方靠它决定"解锁了没有"。 */
    this.seenItemIds = new Set();
    this.bound = false;
    this.windowHandlers = null;
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

  /** 单位视图：左侧显示这个单位的背包，右侧仍然是基地的配方。 */
  openForUnit(unit = null) {
    if (!this.available || !unit || unit.alive === false) return false;
    const inventory = this.game?.itemBagFor?.(unit, { create: true }) ?? null;
    if (!inventory) {
      this.game?.hints?.setHintOnce?.('这个单位没有背包（建筑不能装东西）。', `bag:${unit.id}`);
      return false;
    }
    this.ensureUi();
    this.returnCursor();
    this.unit = unit;
    this.setMode('unit');
    this.show();
    return true;
  }

  /** 基地视图：B 键。左侧 6x8 基地背包。 */
  openBase() {
    if (!this.available) return false;
    this.ensureUi();
    this.returnCursor();
    this.unit = null;
    this.setMode('base');
    this.show();
    return true;
  }

  open() {
    return this.openBase();
  }

  show() {
    this.root.hidden = false;
    this.root.classList.add('is-open');
    this.lastSignature = '';
    this.refresh();
    this.startAutoRefresh();
    // 快捷栏的那种"模式"（开着=搬运容器 / 关着=使用入口）由这个面板的开合决定，
    // 所以必须立刻通知它：等它自己那 400ms 轮询的话，玩家在这一瞬间点到的是旧语义。
    this.game?.hotbar?.refresh?.();
  }

  setMode(mode) {
    this.mode = mode === 'unit' && this.unit ? 'unit' : 'base';
    if (!this.root) return;
    this.root.classList.toggle('is-unit-view', this.mode === 'unit');
    this.root.classList.toggle('is-base-view', this.mode === 'base');
  }

  toggle() {
    return this.isOpen() ? this.close() : this.openBase();
  }

  toggleBase() {
    if (this.isOpen() && this.mode === 'base') {
      this.close();
      return false;
    }
    return this.openBase();
  }

  close() {
    // 手上有东西时先放回去：关闭面板不允许吞掉物品。
    this.returnCursor();
    this.stopAutoRefresh();
    this.unit = null;
    this.lastSignature = '';
    if (!this.root) return;
    this.root.hidden = true;
    this.root.classList.remove('is-open');
    // 面板关掉的这一刻，快捷栏就从"容器"变回"使用入口"（见 HotbarUi 的模式说明）。
    this.game?.hotbar?.refresh?.();
  }

  /** 某个单位阵亡/被移除时关掉它的背包，避免面板停在不存在的单位上。 */
  closeIfUnit(unit) {
    if (!this.isOpen()) return false;
    const current = this.unit;
    if (!current || !unit) return false;
    if (current !== unit && String(current.id) !== String(unit.id)) return false;
    this.close();
    return true;
  }

  markDirty() {
    this.lastSignature = '';
    if (this.isOpen()) this.refresh();
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
    this.returnCursor();
    this.stopAutoRefresh();
    if (this.feedbackTimer != null) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }
    if (this.windowHandlers) {
      window.removeEventListener('pointermove', this.windowHandlers.move);
      window.removeEventListener('pointerup', this.windowHandlers.up);
      this.windowHandlers = null;
      this.bound = false;
    }
    this.removeCursorGhost();
    if (this.root) {
      this.root.remove();
      this.root = null;
      this.parts = null;
    }
  }

  // ---- 容器 ----

  /**
   * 面板里要显示的所有容器，按显示顺序。
   *
   * **单位视图下有两块**：单位的背包 + 基地背包。这是《我的世界》里
   * "打开箱子时同时看到自己的背包"的同构做法，也是"物品能互相搬"能成立的前提——
   * 只画一块网格的话，两个容器之间就没有任何可点的落点，
   * 玩家能合成、能捡、能背，却没办法把基地里那把手斧交给傀儡。
   *
   * 基地视图下只有一块（基地背包）：这时单位背包没有"当前单位"可言。
   */
  containerEntries() {
    const entries = [];
    if (this.mode === 'unit' && this.unit) {
      const bag = this.game?.itemBagFor?.(this.unit, { create: false }) ?? null;
      if (bag) {
        entries.push({
          key: 'unit',
          inventory: bag,
          title: `${this.unit.name ?? this.unit.type ?? '单位'} 的背包`,
          hint: '装备武器 / 放符文石与魔力石',
          location: { kind: RUNE_LOCATION_UNIT, unitId: String(this.unit.id) },
          unit: this.unit,
          columns: Math.max(4, Math.min(6, bag.capacity))
        });
      }
    }
    const base = this.game?.baseInventory ?? null;
    if (base) {
      entries.push({
        key: 'base',
        inventory: base,
        title: '基地背包',
        hint: this.mode === 'unit' ? '与上面的单位背包互搬' : '6 行 × 8 列',
        location: { kind: RUNE_LOCATION_BASE, unitId: null },
        unit: null,
        columns: BASE_COLUMNS
      });
    }
    return entries;
  }

  /** 主容器：单位视图是单位的背包，基地视图是基地背包。 */
  container() {
    return this.containerEntries()[0]?.inventory ?? null;
  }

  /**
   * 按 `data-backpack-container` 的值取容器。
   *
   * `hotbar` 是**特例**：快捷栏不在面板里（它在屏幕底部，见 HotbarUi），
   * 但它和基地背包是同一类的 Inventory，所以面板的光标要能把它当落点——
   * "打开背包时两边互相拖"就落在这里。
   */
  containerFor(key) {
    if (key === HOTBAR_CONTAINER_KEY) return this.game?.hotbarInventory ?? null;
    const entries = this.containerEntries();
    const found = entries.find((entry) => entry.key === key) ?? null;
    return found?.inventory ?? entries[0]?.inventory ?? null;
  }

  entryFor(key) {
    const entries = this.containerEntries();
    return entries.find((entry) => entry.key === key) ?? entries[0] ?? null;
  }

  playerId() {
    return this.game?.localPlayerId ?? this.game?.localPlayerSlot ?? 'local-player';
  }

  runeSystem() {
    return this.game?.runeStones ?? null;
  }

  // ---- DOM ----

  ensureUi() {
    if (this.root || !this.available) return this.root;
    const root = document.createElement('div');
    root.id = 'backpack';
    root.className = 'backpack is-base-view';
    root.hidden = true;
    root.innerHTML = `
      <div class="backpack-panel" role="dialog" aria-label="背包">
        <header class="backpack-header">
          <div class="backpack-heading">
            <span class="backpack-title">背包</span>
            <span class="backpack-subtitle" data-backpack-subtitle>B 基地背包 · E 单位背包 · Esc 关闭</span>
          </div>
          <button type="button" class="backpack-close" data-backpack-close aria-label="关闭背包">✕</button>
        </header>
        <p class="backpack-hint" data-backpack-hint></p>
        <div class="backpack-main">
          <section class="backpack-grid-pane">
            <div class="backpack-grids" data-backpack-grids></div>
            <div class="backpack-trash" data-backpack-trash>
              <span class="backpack-trash-icon" aria-hidden="true">🗑</span>
              <span class="backpack-trash-label">销毁手上物品</span>
              <span class="backpack-trash-note">只对符文石有效</span>
            </div>
          </section>
          <section class="backpack-recipe-pane">
            <div class="backpack-tabs" role="tablist" data-backpack-tabs>
              <button type="button" class="backpack-tab is-active" role="tab" data-backpack-tab="craft" aria-selected="true">合成</button>
            </div>
            <div class="backpack-pane-head">
              <span class="backpack-pane-title" data-backpack-recipe-title>合成</span>
              <span class="backpack-pane-count" data-backpack-recipe-count></span>
              <span class="backpack-pane-count" data-backpack-resource-count hidden></span>
            </div>
            <div class="backpack-recipes" data-backpack-recipes role="tabpanel"></div>
            <div class="backpack-list" data-backpack-resources role="tabpanel" hidden></div>
            <p class="backpack-detail" data-backpack-detail></p>
          </section>
        </div>
        <p class="backpack-feedback" data-backpack-feedback hidden></p>
      </div>
    `;
    this.mount.appendChild(root);
    this.parts = {
      subtitle: root.querySelector('[data-backpack-subtitle]'),
      hint: root.querySelector('[data-backpack-hint]'),
      // 网格是**多块**的：单位视图下同时显示「单位的背包」与「基地背包」两块，
      // 这样两边的格子都在同一个面板里，物品可以直接从一块拖到另一块
      // （与《我的世界》里"箱子 + 自己的背包"同构）。
      grids: root.querySelector('[data-backpack-grids]'),
      trash: root.querySelector('[data-backpack-trash]'),
      recipeTitle: root.querySelector('[data-backpack-recipe-title]'),
      recipeCount: root.querySelector('[data-backpack-recipe-count]'),
      resourceCount: root.querySelector('[data-backpack-resource-count]'),
      recipes: root.querySelector('[data-backpack-recipes]'),
      resources: root.querySelector('[data-backpack-resources]'),
      detail: root.querySelector('[data-backpack-detail]'),
      feedback: root.querySelector('[data-backpack-feedback]'),
      tabButtons: [...root.querySelectorAll('[data-backpack-tab]')]
    };
    this.root = root;

    if (!this.bound) {
      // 面板内的点击不要漏到画布上（否则会顺手给单位下令、清空选中）。
      root.addEventListener('pointerdown', (event) => event.stopPropagation());
      root.addEventListener('click', (event) => this.onClick(event));
      root.addEventListener('pointerdown', (event) => this.onPointerDown(event));
      root.addEventListener('contextmenu', (event) => this.onContextMenu(event));
      root.addEventListener('pointerover', (event) => this.onPointerOver(event));
      root.addEventListener('pointerout', (event) => this.onPointerOut(event));
      // 光标上的那一叠要跟着鼠标走，所以监听挂在 window 上，销毁时必须摘掉。
      this.windowHandlers = {
        move: (event) => this.syncCursorGhostPosition(event.clientX, event.clientY)
      };
      window.addEventListener('pointermove', this.windowHandlers.move);
      this.bound = true;
    }
    this.applyTab();
    return root;
  }

  // ---- 渲染 ----

  /**
   * 记录"见过"的物品：右侧配方是否解锁完全靠它。
   * 只看基地背包——单位背包里的东西是临时携带，不该被当成学会了配方。
   */
  noteSeenItems() {
    const counts = this.game?.baseInventory?.countsByItem?.() ?? {};
    Object.keys(counts).forEach((itemId) => {
      if (itemId) this.seenItemIds.add(itemId);
    });
  }

  refresh() {
    if (!this.isOpen() || !this.parts) return;
    const entries = this.containerEntries();
    if (!entries.length) return;
    // 单位在面板打开期间阵亡：立刻关闭。
    if (this.mode === 'unit' && this.unit?.alive === false) {
      this.close();
      return;
    }
    this.noteSeenItems();

    const recipes = this.visibleRecipes();

    // 签名只包含真正影响 DOM 的内容：没变就什么都不重建，否则每 400ms
    // 重建一次会让按钮在鼠标按下时被替换掉，点都点不中。
    const signature = JSON.stringify({
      mode: this.mode,
      unitId: this.unit?.id ?? null,
      // 两块网格都要进签名：只算主容器的话，"往基地里放了东西"不会让 DOM 更新。
      containers: entries.map((entry) => [
        entry.key,
        entry.inventory.capacity,
        entry.inventory.slots.map((slot) => (slot
          ? [slot.itemId, slot.count, slot.instanceId ?? null, slot.data?.level ?? null, slot.data?.enchantmentId ?? null]
          : null))
      ]),
      cursor: this.cursor
        ? [this.cursor.itemId, this.cursor.count, this.cursor.instanceId ?? null]
        : null,
      recipes: recipes.map((recipe) => [
        recipe.id,
        recipe.craftable,
        recipe.inputs.map((entry) => entry.have)
      ]),
      placing: this.game?.placingItem?.itemId ?? null,
      stranded: this.strandedStones().length
    });
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    this.renderGrids(entries);
    this.renderRecipes(recipes);
    this.renderHeader(entries);
    this.renderFeedback();
  }

  renderHeader(entries) {
    const isUnit = this.mode === 'unit' && Boolean(this.unit);
    const primary = entries[0];
    const used = primary.inventory.usedSlots?.()
      ?? primary.inventory.slots.filter(Boolean).length;

    const stranded = this.strandedStones();
    const lines = [];
    if (isUnit) {
      const stones = this.runeSystem()?.stonesForUnit?.(this.unit)?.length ?? 0;
      lines.push(`${primary.title} ${used}/${primary.inventory.capacity} · 符文石 ${stones} 块生效中`);
      lines.push('上面是单位的背包、下面是基地背包：点一件拿起，再点另一块的格子就搬过去了');
      lines.push('按住 Shift 点格子：在背包与基地仓库之间整格转移（自动找空位或合并）');
    } else {
      lines.push(`负重 ${used}/${primary.inventory.capacity} · 基地共 ${primary.inventory.capacity} 格（6 行 × 8 列）`);
    }
    if (this.cursor?.craftedFrom) {
      lines.push(`手上：${itemName(this.cursor.itemId)} ×${this.cursor.count}（刚合成）— 点空格放下，右键取消并退回材料`);
    } else if (this.cursor) {
      lines.push(`手上：${itemName(this.cursor.itemId)} ×${this.cursor.count} — 点空格放下，点同类可合并，点异类交换`);
    } else {
      lines.push('左键拿起整叠 · 右键拿一半 · 手上有东西时按 Esc 会放回原处');
    }
    // 快捷栏是个容器这件事必须写出来：它在屏幕底部，和面板隔着一段距离，
    // 不说的话没人会想到"把东西拖到那一排格子上"是搬运而不是使用。
    lines.push('屏幕下方的快捷栏也是容器：手上有东西时点它一格就放进去，关掉面板后按 1~9 使用');
    if (stranded.length) {
      lines.push(`有 ${stranded.length} 块符文石失去了落点（旧存档残留），已列在下方可收回基地`);
    }
    this.parts.hint.textContent = lines.join(' · ');
  }

  /** 失去落点的符文石（旧存档 / 联机快照残留）——留一个手动收回的出口。 */
  strandedStones() {
    const system = this.runeSystem();
    if (!system?.strandedBackpacks) return [];
    try {
      return system.strandedBackpacks(this.playerId()) ?? [];
    } catch {
      return [];
    }
  }

  /**
   * 左侧网格（单位视图下是两块）。容量就是格子数，空格子也要画出来——
   * "还能装多少"是玩家最需要一眼看到的信息。
   */
  renderGrids(entries) {
    const host = this.parts.grids;
    if (!host) return;
    host.textContent = '';
    entries.forEach((entry) => {
      const block = document.createElement('div');
      block.className = 'backpack-grid-block';
      block.dataset.backpackGridBlock = entry.key;

      const head = document.createElement('div');
      head.className = 'backpack-pane-head';
      const title = document.createElement('span');
      title.className = 'backpack-pane-title';
      title.dataset.backpackGridTitle = entry.key;
      title.textContent = entry.title;
      const count = document.createElement('span');
      count.className = 'backpack-pane-count';
      count.dataset.backpackGridCount = entry.key;
      const used = entry.inventory.usedSlots?.() ?? entry.inventory.slots.filter(Boolean).length;
      count.textContent = `${used}/${entry.inventory.capacity}`;
      head.append(title, count);
      block.appendChild(head);

      if (entry.hint) {
        const hint = document.createElement('span');
        hint.className = 'backpack-grid-hint';
        hint.textContent = entry.hint;
        block.appendChild(hint);
      }

      const grid = document.createElement('div');
      grid.className = 'backpack-grid';
      if (entry.key === 'unit') grid.classList.add('is-unit-grid');
      grid.dataset.backpackGrid = entry.key;
      grid.setAttribute('role', 'grid');
      grid.setAttribute('aria-label', entry.title);
      grid.style.setProperty('--backpack-columns', String(entry.columns));
      for (let index = 0; index < entry.inventory.capacity; index += 1) {
        grid.appendChild(this.createSlotElement(entry, entry.inventory.slots[index] ?? null, index));
      }
      block.appendChild(grid);
      host.appendChild(block);
    });
    this.renderStranded(host);
  }

  createSlotElement(entry, slot, index) {
    const cell = document.createElement('div');
    cell.className = 'backpack-slot';
    cell.dataset.backpackSlot = String(index);
    // 每个格子都要记住自己属于哪一块网格：否则"点基地那格、放到单位那格"无从判断。
    cell.dataset.backpackContainer = entry.key;
    cell.setAttribute('role', 'gridcell');
    if (!slot?.itemId) {
      cell.classList.add('is-empty');
      return cell;
    }
    cell.classList.add('is-filled');
    const definition = itemDefinition(slot.itemId);
    const isStone = slot.itemId === RUNE_STONE_ITEM_ID;
    if (isStone) {
      cell.classList.add('is-rune');
      cell.style.setProperty('--rune-color', runeColor(slot.data?.enchantmentId));
      // 带上位置再查：`isStoneInactiveDuplicate()` 靠 location 判断"同名备用石"。
      const stone = this.runeSystem()?.stoneForSlot?.(slot, entry.location) ?? null;
      if (stone && this.runeSystem()?.isStoneInactiveDuplicate?.(stone)) {
        cell.classList.add('is-inactive');
      }
    }
    if (isManaStoneItem(slot.itemId)) cell.classList.add('is-mana');

    const art = document.createElement('div');
    art.className = 'backpack-slot-art';
    art.innerHTML = itemArtForSlot(slot);
    cell.appendChild(art);

    // 符文石不可堆叠：左上角显示等级，右下角不显示数量（永远是 1）。
    if (isStone) {
      const level = Number(slot.data?.level ?? 1);
      const badge = document.createElement('span');
      badge.className = 'backpack-slot-level';
      badge.textContent = String(Math.max(1, Math.floor(level)));
      cell.appendChild(badge);
    } else if ((slot.count ?? 1) > 1) {
      const count = document.createElement('span');
      count.className = 'backpack-slot-count';
      count.textContent = String(slot.count);
      cell.appendChild(count);
    }

    // 两件"格内动作"：基地那块的建筑可放置、单位那块（且只有这块）的武器可装备。
    // 它们是格子里的小按钮而不是"双击"之类的隐藏手势——旧面板就是这样，
    // 玩家已经习惯了，而且验收脚本也按这两个入口断言。
    if (entry.key === 'base' && definition?.placeable?.unitType) {
      cell.appendChild(this.createSlotAction('place', '放置', index, {
        title: `把${itemName(slot.itemId)}放到地面上（左键落地，右键取消）`
      }));
    }
    if (entry.key === 'unit' && definition?.category === 'weapon') {
      cell.appendChild(this.createSlotAction('equip', '装备', index, {
        title: `把${itemName(slot.itemId)}装到${this.unit?.name ?? '单位'}手上`
      }));
    }

    cell.title = this.slotTooltip(slot);
    return cell;
  }

  /** 格子右下角的小动作按钮（放置 / 装备）。 */
  createSlotAction(action, label, index, { title = '' } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `backpack-slot-action is-${action}`;
    button.dataset[action === 'place' ? 'backpackPlace' : 'backpackEquip'] = String(index);
    button.textContent = label;
    if (title) button.title = title;
    return button;
  }

  /** 悬浮提示：物品名 + 关键数值 + 符文石进度。 */
  slotTooltip(slot) {
    const definition = itemDefinition(slot.itemId);
    const lines = [`${itemName(slot.itemId)}${(slot.count ?? 1) > 1 ? ` ×${slot.count}` : ''}`];
    if (slot.itemId === RUNE_STONE_ITEM_ID) {
      const stone = this.runeSystem()?.stoneForSlot?.(slot) ?? null;
      const progress = manaProgressForStone(stone ?? slot.data ?? {});
      const need = manaThresholdForLevel(stone?.level ?? slot.data?.level ?? 1);
      lines.push(Number.isFinite(need)
        ? `等级 ${stone?.level ?? slot.data?.level ?? 1} · 魔力 ${Math.floor(progress.have)}/${need}`
        : `等级 ${stone?.level ?? slot.data?.level ?? 1} · 已满级`);
      if (stone && this.runeSystem()?.isStoneInactiveDuplicate?.(stone)) {
        lines.push('同名备用石：不生效，但仍照常吃魔力升级');
      }
      lines.push('不可堆叠 · 放进单位背包即生效');
      return lines.join('\n');
    }
    lines.push(...itemStatLines(slot.itemId, definition));
    if (slot.data?.durability != null && definition?.weapon) {
      lines.push(`当前耐久 ${Math.round(slot.data.durability)}/${definition.weapon.maxDurability}`);
    }
    return lines.join('\n');
  }

  renderStranded(grid) {
    const groups = this.strandedStones();
    if (!groups.length) return;
    const row = document.createElement('div');
    row.className = 'backpack-stranded';
    const total = groups.reduce((sum, group) => sum + group.stones.length, 0);
    row.textContent = `失去落点的符文石 ${total} 块：`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'backpack-stranded-recover';
    button.dataset.backpackRecoverStranded = 'true';
    button.textContent = '全部收回基地背包';
    row.appendChild(button);
    grid.appendChild(row);
  }

  // ---- 右侧：合成网格 ----

  /**
   * 已解锁的配方。
   *
   * 解锁规则（需求第 3 条：「基地背包获得任意物品后就解锁相关配方」）：
   * 配方里**任意一种材料**曾经出现在基地背包里，这条配方就出现。
   * 科技锁着的配方由 `recipeStatus()` 直接剔除，这里不再重复判断。
   */
  visibleRecipes() {
    const all = typeof this.game?.recipeStatus === 'function' ? this.game.recipeStatus() : [];
    return all.filter((recipe) => {
      const inputs = recipe.inputs ?? [];
      if (!inputs.length) return true;
      return inputs.some((entry) => this.seenItemIds.has(entry.itemId));
    });
  }

  renderRecipes(recipes) {
    const list = this.parts.recipes;
    if (!list) return;
    list.textContent = '';
    const craftable = recipes.filter((recipe) => recipe.craftable).length;
    this.parts.recipeCount.textContent = recipes.length
      ? `${craftable}/${recipes.length} 可合成`
      : '';
    if (!recipes.length) {
      const empty = document.createElement('p');
      empty.className = 'backpack-empty';
      empty.textContent = '还没有解锁任何配方。往基地背包里放入材料就会出现对应配方。';
      list.appendChild(empty);
      return;
    }
    recipes.forEach((recipe) => {
      list.appendChild(this.createRecipeTile(recipe));
    });
  }

  createRecipeTile(recipe) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = recipe.craftable
      ? 'backpack-recipe is-craftable'
      : 'backpack-recipe is-locked';
    tile.dataset.backpackRecipe = recipe.id;
    tile.dataset.recipeId = recipe.id;

    const art = document.createElement('div');
    art.className = 'backpack-recipe-art';
    art.innerHTML = itemArtForSlot({
      itemId: recipe.output.itemId,
      data: recipe.output.itemId === RUNE_STONE_ITEM_ID
        ? { enchantmentId: recipe.enchantmentId }
        : null
    });
    tile.appendChild(art);

    const name = document.createElement('span');
    name.className = 'backpack-recipe-name';
    name.textContent = recipe.name;
    tile.appendChild(name);

    const output = document.createElement('span');
    output.className = 'backpack-recipe-output';
    output.textContent = `×${recipe.output.count}`;
    tile.appendChild(output);

    const inputs = document.createElement('div');
    inputs.className = 'backpack-inputs';
    (recipe.inputs ?? []).forEach((entry) => {
      const missing = entry.have < entry.count;
      const chip = document.createElement('span');
      chip.className = missing ? 'backpack-input is-missing' : 'backpack-input';
      chip.dataset.itemId = entry.itemId;
      const chipArt = document.createElement('span');
      chipArt.className = 'backpack-input-art';
      chipArt.innerHTML = itemArtForSlot({ itemId: entry.itemId });
      const amount = document.createElement('span');
      amount.className = 'backpack-input-have';
      amount.textContent = `${entry.have}/${entry.count}`;
      chip.append(chipArt, amount);
      inputs.appendChild(chip);
    });
    tile.appendChild(inputs);

    if (!recipe.craftable && recipe.reasonLabel) {
      const blocked = document.createElement('span');
      blocked.className = 'backpack-blocked';
      blocked.textContent = recipe.reasonLabel;
      tile.appendChild(blocked);
    }
    tile.title = [
      `${recipe.name}：${recipe.description || ''}`,
      '左键合成：材料立刻扣除，产物跟鼠标走',
      '做好之后按右键可以取消这次合成，材料原样退回基地背包'
    ].join('\n');
    return tile;
  }

  /** 悬浮详情：材料明细 + 能不能做 + 做什么用。 */
  showRecipeDetail(recipeId) {
    if (!this.parts?.detail) return;
    const recipe = this.visibleRecipes().find((entry) => entry.id === recipeId) ?? null;
    if (!recipe) {
      this.parts.detail.textContent = '';
      return;
    }
    const parts = [`${recipe.name} → ${itemName(recipe.output.itemId)} ×${recipe.output.count}`];
    if (recipe.description) parts.push(recipe.description);
    const inputs = (recipe.inputs ?? [])
      .map((entry) => `${itemName(entry.itemId)} ${entry.have}/${entry.count}${entry.have < entry.count ? '（缺）' : ''}`)
      .join('，');
    if (inputs) parts.push(`材料：${inputs}`);
    parts.push(recipe.craftable
      ? '点击即可合成，产物会跟鼠标走，再点背包空格放下；做好后右键可取消并退回材料'
      : `暂时做不了：${recipe.reasonLabel ?? '材料不足'}`);
    this.parts.detail.textContent = parts.join(' · ');
  }

  clearRecipeDetail() {
    if (this.parts?.detail) this.parts.detail.textContent = '';
  }

  // ---- 右侧：资源优先级 tab ----

  /**
   * 资源 tab：木傀儡能采到的 + 能合成的全部物品，每行带"−／＋"调优先级。
   *
   * 需求原文：「显示木傀儡可以采集到的，可以合成的所有物品，然后玩家可以点击对应物品
   * 增加或者减少优先级。Ai 根据优先级去做相关任务」，并且明确「只影响采集：
   * 合成类物品自动换算成它的材料需求」。
   *
   * 所以这里刻意把两件事写在同一行上，让玩家一眼看懂因果：
   *   - 采集类行：优先级直接决定傀儡去采什么；
   *   - 合成类行：优先级的右边直接写出**折算到的材料**，点「＋」的效果是
   *     "多去挖这些材料"，而不是"傀儡去做这件东西"（傀儡不会合成）。
   * 没有这行小字的话，玩家给「傀儡木刃」加优先级却看到傀儡去砍树，会以为是 bug。
   */
  renderResources(rows) {
    const list = this.parts.resources;
    if (!list) return;
    list.textContent = '';
    const gatherableRows = rows.filter((row) => row.kind === 'resource');
    const active = gatherableRows.filter((row) => row.priority > 0).length;
    if (this.parts.resourceCount) {
      this.parts.resourceCount.textContent = rows.length
        ? `${active}/${gatherableRows.length} 项在采`
        : '';
    }
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'backpack-empty';
      empty.textContent = '没有可采集的资源。';
      list.appendChild(empty);
      return;
    }
    rows.forEach((row) => {
      const card = document.createElement('article');
      card.className = row.priority > 0 ? 'backpack-card is-done' : 'backpack-card';
      card.dataset.resourceRow = row.itemId;
      card.dataset.resourceKind = row.kind;

      const head = document.createElement('div');
      head.className = 'backpack-card-head';
      const name = document.createElement('span');
      name.className = 'backpack-card-name';
      name.textContent = row.name;
      const state = document.createElement('span');
      state.className = 'backpack-card-state';
      state.textContent = row.kind === 'resource' ? `库存 ${row.stock}` : `持有 ${row.stock}`;
      head.append(name, state);
      card.appendChild(head);

      // 优先级刻度：−／＋ 与当前值。0 = 不采、负 = 禁止，都直接写出来。
      const controls = document.createElement('div');
      controls.className = 'backpack-priority';
      const minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'backpack-priority-button';
      minus.dataset.priorityDelta = '-1';
      minus.dataset.priorityItem = row.itemId;
      minus.textContent = '−';
      minus.title = `降低「${row.name}」的优先级`;
      minus.disabled = row.priority <= PRIORITY_MIN;
      const value = document.createElement('span');
      value.className = 'backpack-priority-value';
      value.dataset.priorityValue = String(row.priority);
      value.textContent = priorityLabel(row.priority);
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'backpack-priority-button';
      plus.dataset.priorityDelta = '1';
      plus.dataset.priorityItem = row.itemId;
      plus.textContent = '＋';
      plus.title = `提高「${row.name}」的优先级`;
      plus.disabled = row.priority >= PRIORITY_MAX;
      controls.append(minus, value, plus);
      card.appendChild(controls);

      const desc = document.createElement('p');
      desc.className = 'backpack-card-desc';
      if (row.kind === 'resource') {
        desc.textContent = row.priority > 0
          ? '傀儡会按这个优先级去采这种资源。'
          : '优先级为 0 或更低时，傀儡不会专门去采它。';
      } else {
        const inputs = (row.inputs ?? [])
          .map((entry) => `${itemName(entry.itemId)}×${formatInputCount(entry.count)}`)
          .join('，');
        desc.textContent = inputs
          ? `傀儡不会合成它；加优先级等于多采它的材料：${inputs}`
          : '这件东西不需要采集材料。';
      }
      card.appendChild(desc);
      list.appendChild(card);
    });
  }

  // ---- 标签页 ----

  setTab(tabId) {
    // 'items' / 'unit' 是旧面板的段名：现在左上角永远是背包网格，直接当成 craft。
    // 'tech' / 'enchant' 是**已删除**的旧标签页（科技与附魔台改由科研站/附魔台的
    // 扇形菜单打开，见 FacilityPanelUi）。这里把旧名字映射到 craft 而不是报错，
    // 是为了让旧存档式的调用与验收脚本不至于直接崩掉。
    const aliases = { items: 'craft', unit: 'craft', tech: 'craft', enchant: 'craft', resource: 'craft' };
    const wanted = aliases[tabId] ?? tabId;
    const known = ['craft'];
    this.activeTab = known.includes(wanted) ? wanted : 'craft';
    this.applyTab();
    return this.activeTab;
  }

  applyTab() {
    if (!this.parts) return;
    const active = this.activeTab ?? 'craft';
    this.parts.tabButtons.forEach((button) => {
      const isActive = button.dataset.backpackTab === active;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    if (this.parts.recipes) this.parts.recipes.hidden = active !== 'craft';
    if (this.parts.resources) this.parts.resources.hidden = active !== 'resource';
    if (this.parts.recipeTitle) {
      this.parts.recipeTitle.textContent = active === 'craft' ? '合成' : '资源优先级';
    }
    if (this.parts.recipeCount) this.parts.recipeCount.hidden = active !== 'craft';
    if (this.parts.resourceCount) this.parts.resourceCount.hidden = active !== 'resource';
    // 悬浮详情那一行是给合成配方用的，切到资源 tab 时清掉，
    // 否则会留着上一张配方的说明文字，看起来像资源行的说明。
    if (active !== 'craft') this.clearRecipeDetail();
  }

  // ---- 交互：格子搬运（《我的世界》语义）----

  onPointerDown(event) {
    // 格子内的小按钮（放置 / 装备）不是搬运手势：先让 onClick 处理它们。
    if (event.target.closest('[data-backpack-place]') || event.target.closest('[data-backpack-equip]')) return;
    const cell = event.target.closest('[data-backpack-slot]');
    if (!cell || !this.parts?.grids?.contains(cell)) return;
    event.preventDefault();
    this.syncCursorGhostPosition(event.clientX, event.clientY);
    const index = Number(cell.dataset.backpackSlot);
    if (!Number.isFinite(index)) return;
    const containerKey = cell.dataset.backpackContainer ?? null;
    if (event.shiftKey && event.button === 0 && !this.cursor) {
      this.shiftTransferSlot(index, containerKey);
      return;
    }
    this.handleSlotClick(index, {
      right: event.button === 2,
      container: containerKey
    });
  }

  /**
   * Shift+左键：单位视图下在「单位背包 ↔ 基地仓库」之间整格搬运（不经过鼠标上的那一叠）。
   */
  shiftTransferSlot(index, containerKey = null) {
    if (this.mode !== 'unit' || !this.unit || this.cursor) return;
    const entries = this.containerEntries();
    const fromKey = containerKey === 'base' ? 'base' : 'unit';
    const toKey = fromKey === 'unit' ? 'base' : 'unit';
    const fromEntry = entries.find((entry) => entry.key === fromKey);
    const toEntry = entries.find((entry) => entry.key === toKey);
    if (!fromEntry?.inventory || !toEntry?.inventory) return;
    if (!Number.isInteger(index) || index < 0 || index >= fromEntry.inventory.slots.length) return;
    const slot = fromEntry.inventory.slots[index];
    if (!slot?.itemId) return;
    const result = moveSlot(fromEntry.inventory, toEntry.inventory, { fromIndex: index, toIndex: null });
    if (!result.ok) {
      this.showFeedback(TRANSFER_ERROR_LABELS[result.reason] ?? '放不下', true);
      return;
    }
    this.syncUnitState();
    this.lastSignature = '';
    this.refresh();
    const dest = toKey === 'base' ? '基地仓库' : '单位背包';
    this.showFeedback(`${itemName(slot.itemId)} → ${dest}`, false);
  }

  /**
   * 点一下某个格子。
   *
   * `containerKey` 决定点的是哪一块网格——单位视图下同时开着单位背包与基地背包，
   * 所以"拿起"和"放下"完全可能落在不同的容器上，那正是搬运能成立的地方。
   * 不传就落到主容器（单位视图=单位背包，基地视图=基地背包），旧脚本仍然照旧可用。
   */
  handleSlotClick(index, { right = false, container: containerKey = null } = {}) {
    const container = containerKey ? this.containerFor(containerKey) : this.container();
    if (!container) return;
    const slot = container.slots[index] ?? null;

    if (!this.cursor) {
      if (!slot?.itemId) return;
      const take = right && itemStacksByMerging(slot.itemId)
        ? Math.max(1, Math.floor((slot.count ?? 1) / 2))
        : (slot.count ?? 1);
      this.pickUpSlot(container, index, take);
      return;
    }

    if (!slot?.itemId) {
      if (right) this.placeOneCursorAt(container, index);
      else this.placeCursorAt(container, index);
      return;
    }

    // 手上有东西，目标格也有东西
    const mergeable = slot.itemId === this.cursor.itemId && itemStacksByMerging(slot.itemId);
    if (right) {
      if (mergeable) {
        const limit = itemStackLimit(slot.itemId);
        if ((slot.count ?? 0) < limit) {
          slot.count = (slot.count ?? 0) + 1;
          this.cursor.count -= 1;
          if (this.cursor.count <= 0) this.cursor = null;
          this.afterCursorChange();
          return;
        }
      }
      this.swapCursorWith(container, index);
      return;
    }
    if (mergeable) {
      const limit = itemStackLimit(slot.itemId);
      const room = Math.max(0, limit - (slot.count ?? 0));
      const moved = Math.min(room, this.cursor.count);
      if (moved > 0) {
        slot.count = (slot.count ?? 0) + moved;
        this.cursor.count -= moved;
        if (this.cursor.count <= 0) this.cursor = null;
        this.afterCursorChange();
        return;
      }
    }
    this.swapCursorWith(container, index);
  }

  pickUpSlot(container, index, count) {
    const slot = container.slots[index];
    if (!slot?.itemId) return;
    const take = Math.max(1, Math.min(Math.floor(count) || 1, slot.count ?? 1));
    this.cursor = {
      itemId: slot.itemId,
      count: take,
      instanceId: slot.instanceId ?? null,
      data: slot.data ? { ...slot.data } : null,
      from: { inventory: container, index }
    };
    if (take >= (slot.count ?? 1)) {
      container.slots[index] = null;
    } else {
      slot.count = (slot.count ?? 1) - take;
    }
    this.afterCursorChange();
  }

  placeCursorAt(container, index) {
    const cursor = this.cursor;
    if (!cursor) return;
    container.slots[index] = {
      itemId: cursor.itemId,
      count: cursor.count,
      instanceId: cursor.instanceId ?? undefined,
      data: cursor.data ? { ...cursor.data } : null
    };
    if (container.slots[index].instanceId === undefined) delete container.slots[index].instanceId;
    // 已经落格，不再记原位置：关面板时不该把它再搬走。
    this.cursor = null;
    this.afterCursorChange();
  }

  /** 右键点空格：只放下 1 个（可堆叠物）；不可堆叠则整叠落下。 */
  placeOneCursorAt(container, index) {
    const cursor = this.cursor;
    if (!cursor) return;
    if (!itemStacksByMerging(cursor.itemId) || (cursor.count ?? 1) <= 1) {
      this.placeCursorAt(container, index);
      return;
    }
    container.slots[index] = {
      itemId: cursor.itemId,
      count: 1,
      data: cursor.data ? { ...cursor.data } : null
    };
    cursor.count -= 1;
    this.afterCursorChange();
  }

  swapCursorWith(container, index) {
    const cursor = this.cursor;
    if (!cursor) return;
    const target = container.slots[index] ?? null;
    container.slots[index] = {
      itemId: cursor.itemId,
      count: cursor.count,
      data: cursor.data ? { ...cursor.data } : null
    };
    if (cursor.instanceId != null) container.slots[index].instanceId = cursor.instanceId;
    if (target) {
      this.cursor = {
        itemId: target.itemId,
        count: target.count,
        instanceId: target.instanceId ?? null,
        data: target.data ? { ...target.data } : null,
        // 换回来的这一叠继承原来的来源位置，关面板时能放回原处。
        from: cursor.from
      };
    } else {
      this.cursor = null;
    }
    this.afterCursorChange();
  }

  /**
   * 手上那一叠变化之后的统一收尾。
   *
   * 必须做两件事：
   *   1. 单位视图里符文石可能刚离开/进入这个单位的背包，附魔与最大魔力都要重算；
   *   2. 整个系统的"石头在哪"是从格子读出来的，格子变了要让它重新发现一次。
   */
  afterCursorChange() {
    this.syncUnitState();
    this.updateCursorGhost();
    this.lastSignature = '';
    this.refresh();
  }

  syncUnitState() {
    const system = this.runeSystem();
    const unit = this.mode === 'unit' ? this.unit : null;
    if (unit) {
      system?.syncUnitEnchantments?.(unit);
      this.game?.refreshUnitManaCapacity?.(unit);
      this.game?.work?.notifyInventoryChanged?.(unit);
    }
    system?.discoverAll?.();
  }

  /**
   * 把手上的东西放回去。
   *
   * 三种落点，按优先级：原格 → 原来的容器 → 基地背包。
   * 全部放不下时**继续留在手上**（面板已关，光标仍在），绝不销毁物品。
   */
  returnCursor() {
    const cursor = this.cursor;
    if (!cursor) {
      this.removeCursorGhost();
      return false;
    }
    const stack = {
      itemId: cursor.itemId,
      count: cursor.count,
      instanceId: cursor.instanceId ?? null,
      data: cursor.data ? { ...cursor.data } : null
    };
    const from = cursor.from ?? null;
    let remaining = stack.count;

    if (from?.inventory?.slots && Number.isInteger(from.index) && !from.inventory.slots[from.index]) {
      const result = insertIntoInventory(from.inventory, stack, { toIndex: from.index });
      remaining = result.remainder;
      if (remaining <= 0) {
        this.cursor = null;
        this.syncUnitState();
        this.removeCursorGhost();
        return true;
      }
    }

    const targets = [from?.inventory, this.game?.baseInventory].filter(Boolean);
    for (const target of targets) {
      if (remaining <= 0) break;
      const result = insertIntoInventory(target, { ...stack, count: remaining });
      remaining = result.remainder;
    }

    if (remaining <= 0) {
      this.cursor = null;
    } else {
      this.cursor = { ...cursor, count: remaining };
      this.showFeedback(`${itemName(stack.itemId)} 还剩 ${remaining} 个放不下，先留在鼠标上`, true);
    }
    this.syncUnitState();
    this.removeCursorGhost();
    return true;
  }

  // ---- 光标（手上那一叠跟着鼠标走）----

  updateCursorGhost() {
    if (!this.cursor) {
      this.removeCursorGhost();
      return null;
    }
    if (typeof document === 'undefined') return null;
    if (!this.cursorGhost) {
      const ghost = document.createElement('div');
      ghost.className = 'backpack-cursor-ghost';
      ghost.dataset.backpackCursorGhost = 'true';
      document.body.appendChild(ghost);
      this.cursorGhost = ghost;
    }
    this.cursorGhost.innerHTML = itemArtForSlot({
      itemId: this.cursor.itemId,
      data: this.cursor.data
    });
    if (this.cursor.count > 1) {
      const count = document.createElement('span');
      count.className = 'backpack-cursor-count';
      count.textContent = String(this.cursor.count);
      this.cursorGhost.appendChild(count);
    }
    if (this.cursor.itemId === RUNE_STONE_ITEM_ID) {
      const level = document.createElement('span');
      level.className = 'backpack-cursor-level';
      level.textContent = String(Math.max(1, Math.floor(Number(this.cursor.data?.level) || 1)));
      this.cursorGhost.appendChild(level);
    }
    this.syncCursorGhostPosition();
    return this.cursorGhost;
  }

  syncCursorGhostPosition(clientX, clientY) {
    if (Number.isFinite(clientX)) this.lastPointerX = clientX;
    if (Number.isFinite(clientY)) this.lastPointerY = clientY;
    if (!this.cursorGhost) return;
    const x = this.lastPointerX ?? window.innerWidth * 0.5;
    const y = this.lastPointerY ?? window.innerHeight * 0.5;
    this.cursorGhost.style.left = `${x}px`;
    this.cursorGhost.style.top = `${y}px`;
  }

  removeCursorGhost() {
    this.cursorGhost?.remove();
    this.cursorGhost = null;
  }

  // ---- 交互：点击派发 ----

  onClick(event) {
    if (Number.isFinite(event.clientX)) {
      this.syncCursorGhostPosition(event.clientX, event.clientY);
    }
    if (event.target.closest('[data-backpack-close]')) {
      event.preventDefault();
      this.close();
      return;
    }
    const tab = event.target.closest('[data-backpack-tab]');
    if (tab) {
      event.preventDefault();
      this.setTab(tab.dataset.backpackTab);
      return;
    }
    if (event.target.closest('[data-backpack-recover-stranded]')) {
      event.preventDefault();
      this.recoverStranded();
      return;
    }
    const place = event.target.closest('[data-backpack-place]');
    if (place) {
      event.preventDefault();
      // 「放置」只出现在基地那一块网格里。
      this.beginPlacement(Number(place.dataset.backpackPlace), 'base');
      return;
    }
    const equip = event.target.closest('[data-backpack-equip]');
    if (equip) {
      event.preventDefault();
      // 「装备」只出现在单位那一块网格里。
      this.equipWeapon(Number(equip.dataset.backpackEquip), 'unit');
      return;
    }
    if (event.target.closest('[data-backpack-trash]')) {
      event.preventDefault();
      this.destroyCursorStone();
      return;
    }
    const craft = event.target.closest('[data-backpack-recipe]');
    if (craft) {
      event.preventDefault();
      this.craftInto(/** @type {HTMLElement} */ (craft).dataset.backpackRecipe);
      return;
    }
    const priority = event.target.closest('[data-priority-item]');
    if (priority) {
      event.preventDefault();
      if (priority.disabled) return;
      const delta = Number(priority.dataset.priorityDelta);
      if (!Number.isFinite(delta)) return;
      this.adjustResourcePriority(priority.dataset.priorityItem, delta);
      return;
    }
  }

  onPointerOver(event) {
    const tile = event.target.closest('[data-backpack-recipe]');
    if (tile) this.showRecipeDetail(tile.dataset.backpackRecipe);
  }

  onPointerOut(event) {
    const tile = event.target.closest('[data-backpack-recipe]');
    if (tile && !tile.contains(event.relatedTarget)) this.clearRecipeDetail();
  }

  /**
   * 右键：撤回"刚做好、还拿在手上"的那一笔合成，材料原样退回基地背包。
   *
   * **必须先跳过格子。** 格子上的右键是《我的世界》语义（拿起一半 / 往格子里放一个），
   * 由 `onPointerDown` 在 pointerdown 阶段就处理掉了，而 contextmenu 紧随其后还会再触发一次。
   * 不跳过的话，"右键往空格里放一个产物"会把整笔合成一起撤掉：产物已经落了格、
   * 材料又退回来，那一格就成了凭空多出来的东西。
   */
  onContextMenu(event) {
    event.preventDefault();
    if (!this.cursor?.craftedFrom) return null;
    if (event.target.closest?.('[data-backpack-slot]')) return null;
    return this.cancelCraft();
  }

  /**
   * 合成并把产物拿到手上（需求第 3 条：产物跟着鼠标，再点空格放下）。
   *
   * 合成本身仍然走 `game.craftAtBase`——材料扣除与"放不下就整笔失败"的原子性
   * 都在 crafting.js 里。这里只是把刚做出来的那一件从基地背包**取到手上**：
   * 先记下现有的实例 id，合成后找出新出现的那个，用 removeInstance 取走，
   * 保证"手上这一件"就是刚做出来的那一件，而不是又复制一份。
   */
  craftInto(recipeId) {
    if (!recipeId) return null;
    if (this.cursor) {
      this.showFeedback('手里还拿着东西：先点背包空格放下，再合成', true);
      return null;
    }
    const recipe = this.visibleRecipes().find((entry) => entry.id === recipeId) ?? null;
    if (!recipe) return null;
    if (!recipe.craftable) {
      this.showFeedback(`${recipe.name}：${recipe.reasonLabel || '材料不足'}`, true);
      return null;
    }
    const inventory = this.game?.baseInventory;
    if (!inventory) return null;
    const outputItemId = recipe.output.itemId;
    const before = new Set((inventory.instancesOf?.(outputItemId) ?? []).map((slot) => slot.instanceId));

    const result = this.game?.craftAtBase?.(recipeId, { times: 1 });
    if (!result?.ok) {
      this.showFeedback(`${recipe.name}：${recipe.reasonLabel || '合成失败'}`, true);
      return null;
    }

    // 从基地背包取到手上
    let lifted = null;
    if (itemStacksByMerging(outputItemId)) {
      const count = Math.max(1, Math.floor(result.crafted ?? recipe.output.count));
      const removed = inventory.remove(outputItemId, count);
      if (removed.ok) {
        lifted = { itemId: outputItemId, count, instanceId: null, data: null };
      }
    } else {
      const created = (inventory.instancesOf?.(outputItemId) ?? [])
        .find((slot) => !before.has(slot.instanceId)) ?? null;
      if (created) {
        const removed = inventory.removeInstance(created.instanceId);
        if (removed.ok) {
          lifted = {
            itemId: created.itemId,
            count: 1,
            instanceId: created.instanceId,
            data: removed.data ?? created.data ?? null
          };
        }
      }
    }

    if (lifted) {
      // 记下"这一叠是刚做出来的、刚才扣了什么材料"：右键可以原样撤回（见 cancelCraft）。
      // 只在真的拿到材料清单时才记——清单为空说明这次合成没有可退的东西，
      // 那就别给玩家一个按下去什么都不发生的右键。
      const consumed = (result.consumed ?? [])
        .filter((entry) => entry?.itemId)
        .map((entry) => ({ itemId: entry.itemId, count: entry.count }));
      this.cursor = {
        ...lifted,
        from: { inventory, index: null },
        craftedFrom: consumed.length
          ? { recipeId: recipe.id, name: recipe.name, consumed }
          : null
      };
      this.seenItemIds.add(outputItemId);
      this.showFeedback(
        consumed.length
          ? `${recipe.name} 做好了：点背包空格放下，右键取消并退回材料`
          : `${recipe.name} 做好了：点背包空格放下`,
        false
      );
    } else {
      // 取不出来（理论上不该发生）也不报错：东西已经在基地背包里，没有丢。
      this.seenItemIds.add(outputItemId);
      this.showFeedback(`${recipe.name} 已放进基地背包`, false);
    }
    this.afterCursorChange();
    return result;
  }

  /**
   * 取消一笔"产物还拿在手上"的合成：丢掉产物、把扣掉的材料原样退回基地背包。
   *
   * 合成的交互是"点配方 → 立刻扣材料 → 产物跟着鼠标"，所以点错了（看走眼、格子不够、
   * 本来想做的是另一件）必须有个出口。产物还在鼠标上就意味着它没有进任何库存，
   * 这时撤回是干净的：库存直接回到点击之前的样子。
   *
   * 退不回来时**什么都不动**——产物继续留在手上，玩家可以腾出格子再右键，
   * 而不是"产物没了、材料也没了"。
   */
  cancelCraft() {
    const cursor = this.cursor;
    const origin = cursor?.craftedFrom ?? null;
    if (!cursor || !origin) {
      this.showFeedback('右键取消只对"刚做好、还拿在手上"的物件有效', true);
      return null;
    }
    const result = this.game?.refundCraftAtBase?.(origin.consumed)
      ?? { ok: false, reason: 'no_refund_api' };
    if (!result.ok) {
      const label = CRAFT_ERROR_LABELS[result.reason] ?? '材料退不回基地背包';
      this.showFeedback(`取消不了：${label}（先腾出格子再右键）`, true);
      return null;
    }
    const name = origin.name ?? itemName(cursor.itemId);
    // 产物只是"还没放下"的那一叠：撤销就是把它丢掉，材料已经退回来了。
    this.cursor = null;
    this.showFeedback(`已取消 ${name}：材料已退回基地背包`, false);
    this.afterCursorChange();
    return result;
  }

  /** 垃圾桶：只对符文石生效，而且要拿在手上才会被销毁，避免误点清空背包。 */
  destroyCursorStone() {
    const cursor = this.cursor;
    if (!cursor) {
      this.showFeedback('先拿起要销毁的东西，再点这里', true);
      return null;
    }
    if (cursor.itemId !== RUNE_STONE_ITEM_ID) {
      this.showFeedback('这里只销毁符文石；其它物品放回背包即可', true);
      return null;
    }
    const stoneId = cursor.instanceId;
    if (!stoneId) {
      this.showFeedback('这块符文石没有实例 id，无法销毁', true);
      return null;
    }
    const handler = this.game?.requestRuneStoneAction;
    const networked = typeof handler === 'function'
      ? handler.call(this.game, { action: 'sell', stoneId })
      : null;
    if (networked?.pending) {
      this.cursor = null;
      this.showFeedback('已请求销毁，等 Host 确认', false);
      this.afterCursorChange();
      return networked;
    }
    const result = networked ?? this.runeSystem()?.sellStone?.(stoneId, { playerId: this.playerId() }) ?? null;
    if (result?.ok) {
      this.cursor = null;
      this.showFeedback('符文石已销毁', false);
      this.afterCursorChange();
      return result;
    }
    this.showFeedback(RUNE_ERROR_LABELS[result?.reason] ?? '销毁失败', true);
    return result;
  }

  /** 把失去落点的符文石收回基地背包。 */
  recoverStranded() {
    const groups = this.strandedStones();
    const stones = groups.flatMap((group) => group.stones ?? []);
    if (!stones.length) {
      this.showFeedback('没有需要收回的符文石', true);
      return 0;
    }
    let moved = 0;
    stones.forEach((stone) => {
      const result = this.runeSystem()?.moveStone?.(
        stone.id,
        { kind: 'base' },
        { playerId: this.playerId() }
      ) ?? null;
      if (result?.ok) moved += 1;
    });
    this.showFeedback(`已收回 ${moved}/${stones.length} 块符文石`, moved === 0);
    this.markDirty();
    this.syncUnitState();
    return moved;
  }

  /**
   * 格子上的「放置」：进入放置模式。
   * 面板会自己关掉——玩家接下来要点地图，留着面板会挡住落点。
   */
  beginPlacement(slotIndex, containerKey = 'base') {
    const slot = this.containerFor(containerKey)?.slots?.[slotIndex] ?? null;
    if (!slot?.itemId) {
      this.showFeedback('这一格是空的', true);
      return null;
    }
    const result = this.game?.beginPlacement?.(slot.itemId) ?? { ok: false, reason: 'not_placeable' };
    if (result.ok) {
      // game.beginPlacement 内部会 close 本面板（关面板时不吞手上的东西）
      this.showFeedback(`放置${itemName(slot.itemId)}：左键落地，右键 / Esc 取消`, false);
    } else {
      this.showFeedback(
        result.reason === 'not_in_stock' ? `${itemName(slot.itemId)}：背包里没有` : '这件东西不能放置',
        true
      );
      this.markDirty();
    }
    return result;
  }

  /** 单位背包里的「装备」：同类武器校验在 weapons.js，界面只派发与报结果。 */
  equipWeapon(slotIndex, containerKey = 'unit') {
    const unit = this.unit;
    if (!unit) return null;
    // 装备只认单位那一块网格：基地背包里的武器不在这里装（要先搬过去）。
    if (containerKey !== 'unit') {
      this.showFeedback('装备要在单位的背包那一块里点', true);
      return null;
    }
    const result = this.game?.equipWeaponFromBag?.(unit, slotIndex)
      ?? { ok: false, reason: 'no_equip_api', label: '无法装备' };
    if (result.ok) {
      const returned = result.returnedItemId
        ? `，换下的${itemName(result.returnedItemId)}放回了背包`
        : '';
      this.showFeedback(`${unit.name ?? '单位'}换上了${itemName(result.itemId)}${returned}`, false);
    } else {
      this.showFeedback(result.label || '无法装备', true);
    }
    this.markDirty();
    return result;
  }

  /**
   * 调一项资源的优先级（需求：「点击对应物品增加或者减少优先级」）。
   *
   * 真正的换算在 `resourcePriority.js` 里（纯逻辑、可单测）；这里只负责
   * 改字典 → 让 Game 重算采集需求 → 立刻刷新界面。
   * 只改一个 itemId 的优先级，不去动别的项：玩家点一次「＋」应该只影响他点的那一项。
   */
  adjustResourcePriority(itemId, delta) {
    const result = this.game?.setResourcePriority?.(itemId, delta)
      ?? { ok: false, reason: 'no_game' };
    if (!result.ok) {
      this.showFeedback(result.label || '无法调整优先级', true);
      this.markDirty();
      return result;
    }
    const row = (this.game.resourcePriorityRows?.() ?? [])
      .find((entry) => entry.itemId === itemId) ?? null;
    const name = row?.name ?? itemName(itemId);
    if (row && row.kind === 'resource') {
      this.showFeedback(row.priority > 0
        ? `${name} 优先级 ${priorityLabel(row.priority)}：傀儡会按这个顺序去采`
        : `${name} 优先级 ${priorityLabel(row.priority)}：傀儡不再专门去采`);
    } else {
      this.showFeedback(`${name} 优先级 ${priorityLabel(row?.priority ?? 0)}：折算到它的材料需求`);
    }
    this.markDirty();
    return result;
  }

  // ---- 反馈 ----

  showFeedback(text, isError = false) {
    this.feedback = { text, error: isError === true };
    const element = this.parts?.feedback;
    if (!element) return;
    element.textContent = text;
    element.classList.toggle('is-error', this.feedback.error);
    element.hidden = false;
    if (this.feedbackTimer != null) clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => {
      this.feedback = null;
      if (element) element.hidden = true;
    }, 2600);
  }

  renderFeedback() {
    const element = this.parts?.feedback;
    if (!element) return;
    if (!this.feedback) {
      element.hidden = true;
      return;
    }
    element.hidden = false;
    element.textContent = this.feedback.text;
    element.classList.toggle('is-error', this.feedback.error === true);
  }
}
 
/**
 * 折算出来的材料份数可能是小数（配方产出多份时按比例摊）。
 * 整数就不显示小数点，别把「木材×1」写成「木材×1.0」。
 */
function formatInputCount(count) {
  const value = Number(count) || 0;
  if (Number.isInteger(value)) return String(value);
  return (Math.round(value * 100) / 100).toString();
}

/** 供外部断言使用的常量（验收脚本要按 6x8 检查列数）。 */
export const BACKPACK_BASE_COLUMNS = BASE_COLUMNS;
export { TRANSFER_ERROR_LABELS };
