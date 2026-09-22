import { itemDefinition, itemName } from './items.js';
import { runeDisplayName } from './runeStones.js';
import { WEAPON_ERROR, canEquipWeapon } from './weapons.js';

/**
 * 基地库存与合成面板（I 键）。
 *
 * 为什么是一个新面板而不是塞进符文背包：
 * 符文背包那一套的语义是"每格一块石头、可以拖拽转移、拖进垃圾桶出售"，
 * 而库存里的东西是可堆叠材料、没有出售动作。硬塞进去会让两套规则互相污染。
 * 两者主色也不同（符文紫 / 工坊青），可以同时开着。
 *
 * 本模块只负责 DOM 与交互，库存与配方的规则全部来自
 * `Game.recipeStatus()` 与 `crafting.js`——UI 里不重算"材料够不够"。
 */

const REFRESH_INTERVAL_MS = 400;
const LAUNCHER_INTERVAL_MS = 1000;

export class BaseStorageUi {
  constructor(game, options = {}) {
    this.game = game;
    this.mount = options.mount ?? (typeof document !== 'undefined' ? document.body : null);
    this.root = null;
    this.parts = null;
    this.launcher = null;
    this.launcherTimer = null;
    this.refreshTimer = null;
    this.lastSignature = '';
    this.feedback = null;
    /** 当前标签页：库存 / 单位背包 / 合成 / 科技 / 附魔台。 */
    this.activeTab = 'items';
    this.bound = false;
  }

  get available() {
    return Boolean(this.mount);
  }

  isOpen() {
    return Boolean(this.root && !this.root.hidden);
  }

  open() {
    if (!this.available) return false;
    this.ensureUi();
    this.root.hidden = false;
    this.root.classList.add('is-open');
    this.lastSignature = '';
    // 面板是关着的时候也可能被外部改标签页（比如开始放附魔台就切到附魔段），
    // 所以打开时重放一次，保证显示的就是当前那一段。
    this.applyTab();
    this.refresh();
    this.startAutoRefresh();
    return true;
  }

  close() {
    if (!this.root) return false;
    this.root.hidden = true;
    this.root.classList.remove('is-open');
    this.stopAutoRefresh();
    return true;
  }

  toggle() {
    return this.isOpen() ? this.close() : this.open();
  }

  /**
   * 外部改了基地库存（比如招募花掉一张招募令）时调用：
   * 清掉签名并立刻重画一次，不等 400ms 轮询。面板没开时什么也不做。
   */
  markDirty() {
    this.lastSignature = '';
    this.updateLauncher();
    if (this.isOpen()) this.refresh();
  }

  startAutoRefresh() {
    if (this.refreshTimer != null) return;
    this.refreshTimer = window.setInterval(() => this.refresh(), REFRESH_INTERVAL_MS);
  }

  stopAutoRefresh() {
    if (this.refreshTimer == null) return;
    window.clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  // ---- DOM ----

  ensureUi() {
    if (this.root || !this.available) return this.root;
    this.ensureLauncher();
    const root = document.createElement('div');
    root.id = 'base-storage';
    root.className = 'base-storage';
    root.hidden = true;
    root.innerHTML = `
      <div class="base-storage-panel" role="dialog" aria-label="基地库存与合成">
        <header class="base-storage-header">
          <div class="base-storage-heading">
            <span class="base-storage-title">基地库存</span>
            <span class="base-storage-note">I 打开 · Esc 关闭 · 合成在基地完成</span>
          </div>
          <button type="button" class="base-storage-close" data-storage-close aria-label="关闭基地库存">✕</button>
        </header>
        <p class="base-storage-hint" data-storage-hint></p>
        <div class="base-storage-tabs" role="tablist" data-storage-tabs>
          <button type="button" class="base-storage-tab" role="tab" data-storage-tab="items">
            <span>库存</span><span class="base-storage-tab-badge" data-storage-tab-badge="items"></span>
          </button>
          <button type="button" class="base-storage-tab" role="tab" data-storage-tab="unit">
            <span>单位背包</span><span class="base-storage-tab-badge" data-storage-tab-badge="unit"></span>
          </button>
          <button type="button" class="base-storage-tab" role="tab" data-storage-tab="craft">
            <span>合成</span><span class="base-storage-tab-badge" data-storage-tab-badge="craft"></span>
          </button>
          <button type="button" class="base-storage-tab" role="tab" data-storage-tab="tech">
            <span>科技</span><span class="base-storage-tab-badge" data-storage-tab-badge="tech"></span>
          </button>
          <button type="button" class="base-storage-tab" role="tab" data-storage-tab="enchant">
            <span>附魔台</span><span class="base-storage-tab-badge" data-storage-tab-badge="enchant"></span>
          </button>
        </div>
        <div class="base-storage-body">
          <section class="base-storage-tab-panel" data-storage-tab-panel="items">
            <h4 class="base-storage-section-title">
              <span>库存</span>
              <span class="base-storage-section-count" data-storage-slot-count></span>
            </h4>
            <div class="base-storage-items" data-storage-items></div>
          </section>
          <section class="base-storage-tab-panel" data-storage-tab-panel="unit">
            <h4 class="base-storage-section-title">
              <span data-storage-unit-title>单位背包</span>
              <span class="base-storage-section-count" data-storage-unit-count></span>
            </h4>
            <div class="base-storage-items" data-storage-unit-items></div>
          </section>
          <section class="base-storage-tab-panel" data-storage-tab-panel="craft">
            <h4 class="base-storage-section-title">
              <span>合成</span>
              <span class="base-storage-section-count" data-storage-recipe-count></span>
            </h4>
            <div class="base-storage-recipes" data-storage-recipes></div>
          </section>
          <section class="base-storage-tab-panel" data-storage-tab-panel="tech">
            <h4 class="base-storage-section-title">
              <span>科技</span>
              <span class="base-storage-section-count" data-storage-tech-count></span>
            </h4>
            <div class="base-storage-recipes" data-storage-techs></div>
          </section>
          <section class="base-storage-tab-panel" data-storage-tab-panel="enchant">
            <h4 class="base-storage-section-title">
              <span>附魔台</span>
              <span class="base-storage-section-count" data-storage-enchant-count></span>
            </h4>
            <div class="base-storage-recipes" data-storage-enchants></div>
          </section>
        </div>
        <p class="base-storage-feedback" data-storage-feedback hidden></p>
      </div>
    `;
    this.mount.appendChild(root);
    this.parts = {
      hint: root.querySelector('[data-storage-hint]'),
      slotCount: root.querySelector('[data-storage-slot-count]'),
      items: root.querySelector('[data-storage-items]'),
      unitTitle: root.querySelector('[data-storage-unit-title]'),
      unitCount: root.querySelector('[data-storage-unit-count]'),
      unitItems: root.querySelector('[data-storage-unit-items]'),
      recipeCount: root.querySelector('[data-storage-recipe-count]'),
      recipes: root.querySelector('[data-storage-recipes]'),
      techCount: root.querySelector('[data-storage-tech-count]'),
      techs: root.querySelector('[data-storage-techs]'),
      enchantCount: root.querySelector('[data-storage-enchant-count]'),
      enchants: root.querySelector('[data-storage-enchants]'),
      tabButtons: [...root.querySelectorAll('[data-storage-tab]')],
      tabPanels: [...root.querySelectorAll('[data-storage-tab-panel]')],
      tabBadges: {
        items: root.querySelector('[data-storage-tab-badge="items"]'),
        unit: root.querySelector('[data-storage-tab-badge="unit"]'),
        craft: root.querySelector('[data-storage-tab-badge="craft"]'),
        tech: root.querySelector('[data-storage-tab-badge="tech"]'),
        enchant: root.querySelector('[data-storage-tab-badge="enchant"]')
      },
      feedback: root.querySelector('[data-storage-feedback]')
    };
    this.root = root;

    if (!this.bound) {
      // 面板内的点击不要漏到画布上去（否则会顺手给单位下令、取消选中）。
      root.addEventListener('pointerdown', (event) => event.stopPropagation());
      root.addEventListener('click', (event) => this.onClick(event));
      root.addEventListener('contextmenu', (event) => event.preventDefault());
      this.bound = true;
    }
    return root;
  }

  ensureLauncher() {
    if (this.launcher || !this.available) return this.launcher;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'base-storage-button';
    button.className = 'base-storage-button';
    button.innerHTML = '<span class="base-storage-button-icon" aria-hidden="true">▤</span>'
      + '<span class="base-storage-button-label">基地库存</span>'
      + '<span class="base-storage-button-count" data-storage-launcher-count></span>';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      this.toggle();
    });
    this.mount.appendChild(button);
    this.launcher = {
      button,
      count: button.querySelector('[data-storage-launcher-count]')
    };
    this.updateLauncher();
    if (this.launcherTimer == null) {
      this.launcherTimer = window.setInterval(() => this.updateLauncher(), LAUNCHER_INTERVAL_MS);
    }
    return this.launcher;
  }

  updateLauncher() {
    if (!this.launcher) return;
    const inventory = this.game?.baseInventory;
    if (!inventory) return;
    const used = typeof inventory.usedSlots === 'function'
      ? inventory.usedSlots()
      : inventory.slots.filter(Boolean).length;
    const text = `${used}/${inventory.capacity}`;
    if (this.launcher.count.textContent !== text) this.launcher.count.textContent = text;
    this.launcher.button.title = `基地库存 ${text}（I）`;
  }

  // ---- 渲染 ----

  refresh() {
    if (!this.isOpen() || !this.parts) return;
    const game = this.game;
    const inventory = game?.baseInventory;
    if (!inventory) return;
    const recipes = typeof game.recipeStatus === 'function' ? game.recipeStatus() : [];
    const counts = inventory.countsByItem();
    const bagUnit = this.bagUnit();
    const bagCounts = bagUnit?.workerInventory?.countsByItem?.() ?? null;
    const techs = typeof game.research?.techStatus === 'function' ? game.research.techStatus() : [];
    const enchants = typeof game.research?.enchantStatus === 'function' ? game.research.enchantStatus() : null;

    // 签名只包含真正影响 DOM 的内容：签名没变就什么都不重建，
    // 否则每 400ms 重建一次会让按钮在鼠标按下时被替换掉，点都点不中。
    const signature = JSON.stringify({
      counts,
      bagUnitId: bagUnit?.id ?? null,
      bagCounts,
      bagUsed: bagUnit?.workerInventory?.usedSlots?.() ?? null,
      recipes: recipes.map((recipe) => [
        recipe.id,
        recipe.craftable,
        recipe.reason,
        recipe.inputs.map((entry) => entry.have)
      ]),
      techs: techs.map((tech) => [
        tech.id,
        tech.researched,
        tech.canResearch,
        tech.reason,
        tech.cost.map((entry) => entry.have)
      ]),
      enchants: enchants
        ? [enchants.tableReady, enchants.recipes.map((recipe) => [recipe.enchantmentId, recipe.canEnchant])]
        : null,
      feedback: this.feedback
    });
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    this.renderItems(inventory, counts);
    this.renderUnitBag(bagUnit, bagCounts);
    this.renderRecipes(recipes);
    this.renderTechs(techs);
    this.renderEnchants(enchants);
    this.renderFeedback();
    this.renderTabs({ inventory, counts, bagCounts, recipes, techs, enchants });
    this.updateLauncher();
  }

  /**
   * 分段标签页。
   *
   * 面板已经涨到 5 段（库存/单位背包/合成/科技/附魔台），全塞进一条滚动条之后，
   * 一次只看得到其中一段，而且每加一段就更难找东西。改成标签页之后，
   * 面板高度只由当前这一段决定。
   *
   * 徽标让玩家**不用切过去就知道别的段有没有内容**（可合成几项、几项科技没研究），
   * 否则标签页会把"有事要处理"藏在后面的页里。
   */
  setTab(tabId) {
    const next = this.parts?.tabPanels?.some((panel) => panel.dataset.storageTabPanel === tabId)
      ? tabId
      : 'items';
    this.activeTab = next;
    this.applyTab();
    return next;
  }

  applyTab() {
    if (!this.parts) return;
    const active = this.activeTab ?? 'items';
    this.parts.tabButtons.forEach((button) => {
      const isActive = button.dataset.storageTab === active;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    this.parts.tabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.storageTabPanel !== active;
    });
  }

  renderTabs({ inventory, counts, bagCounts, recipes, techs, enchants }) {
    if (!this.parts?.tabBadges) return;
    const used = typeof inventory.usedSlots === 'function' ? inventory.usedSlots() : 0;
    const bagUsed = bagCounts ? Object.keys(bagCounts).length : 0;
    const craftable = recipes.filter((recipe) => recipe.craftable).length;
    const pendingTech = techs.filter((tech) => !tech.researched && tech.canResearch).length;
    const lockedTech = techs.filter((tech) => !tech.researched).length;
    const enchantable = enchants?.tableReady
      ? enchants.recipes.filter((recipe) => recipe.canEnchant).length
      : 0;
    const badges = {
      // 库存徽标只放已用格数（"3"）：段标题里已经有 "3/24"，
      // 标签上再放 "3/24" 会把标签挤到折行。
      items: used ? String(used) : '',
      unit: bagUsed ? String(bagUsed) : '',
      craft: craftable ? String(craftable) : '',
      // 科技用"还没研究几项"作徽标，而不是"现在能研究几项"：
      // 能研究的会立刻被研究掉，用它当徽标等于没有提示作用。
      tech: lockedTech ? String(lockedTech) : '',
      enchant: enchantable ? String(enchantable) : ''
    };
    Object.entries(badges).forEach(([key, text]) => {
      const node = this.parts.tabBadges[key];
      if (!node) return;
      node.textContent = text;
      node.hidden = !text;
    });
    // 哪些段"现在有事可做"，用高亮交代（科技/附魔这种需要条件的尤其需要）
    const highlights = {
      craft: craftable > 0,
      tech: pendingTech > 0,
      enchant: enchantable > 0
    };
    this.parts.tabButtons.forEach((button) => {
      const id = button.dataset.storageTab;
      button.classList.toggle('has-action', highlights[id] === true);
    });
  }

  /**
   * 科技列表。全部状态来自 `game.research.techStatus()`——
   * 界面里不重算"能不能研究"，和合成那段是同一条纪律。
   */
  renderTechs(techs) {
    const list = this.parts.techs;
    if (!list) return;
    list.textContent = '';
    const done = techs.filter((tech) => tech.researched).length;
    this.parts.techCount.textContent = techs.length ? `${done}/${techs.length} 已解锁` : '';
    if (!techs.length) {
      const empty = document.createElement('p');
      empty.className = 'base-storage-recipe-desc';
      empty.textContent = '暂无科技。';
      list.appendChild(empty);
      return;
    }
    techs.forEach((tech) => {
      const card = document.createElement('article');
      card.className = tech.researched
        ? 'base-storage-recipe is-craftable'
        : 'base-storage-recipe';
      card.dataset.techId = tech.id;

      const head = document.createElement('div');
      head.className = 'base-storage-recipe-head';
      const name = document.createElement('span');
      name.className = 'base-storage-recipe-name';
      name.textContent = tech.name;
      const state = document.createElement('span');
      state.className = 'base-storage-recipe-output';
      state.textContent = tech.researched ? '已解锁' : '未研究';
      head.append(name, state);
      card.appendChild(head);

      if (tech.description) {
        const desc = document.createElement('p');
        desc.className = 'base-storage-recipe-desc';
        desc.textContent = tech.description;
        card.appendChild(desc);
      }

      // 已研究的科技不再显示成本：成本只在"还没研究"时有意义，
      // 研究完之后再把缺料标红只会让人以为它还能再研究一次。
      if (!tech.researched) {
        const inputs = document.createElement('div');
        inputs.className = 'base-storage-inputs';
        tech.cost.forEach((entry) => {
          const missing = entry.have < entry.count;
          const chip = document.createElement('span');
          chip.className = missing ? 'base-storage-input is-missing' : 'base-storage-input';
          chip.dataset.itemId = entry.itemId;
          const label = document.createElement('span');
          label.textContent = itemName(entry.itemId);
          const amount = document.createElement('span');
          amount.className = 'base-storage-input-have';
          amount.textContent = `${entry.have}/${entry.count}`;
          chip.append(label, amount);
          inputs.appendChild(chip);
        });
        card.appendChild(inputs);
      }

      const actions = document.createElement('div');
      actions.className = 'base-storage-actions';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'base-storage-craft';
      button.dataset.researchTech = tech.id;
      button.textContent = tech.researched ? '已研究' : '研究';
      button.disabled = !tech.canResearch;
      actions.appendChild(button);
      if (!tech.researched && tech.reasonLabel) {
        const blocked = document.createElement('span');
        blocked.className = 'base-storage-blocked';
        blocked.textContent = tech.reasonLabel;
        actions.appendChild(blocked);
      }
      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  /** 附魔台列表。没建好附魔台时整段只显示一句怎么开。 */
  renderEnchants(enchants) {
    const list = this.parts.enchants;
    if (!list || !enchants) return;
    list.textContent = '';
    const ready = enchants.recipes.filter((recipe) => recipe.canEnchant).length;
    this.parts.enchantCount.textContent = enchants.tableReady
      ? `${ready}/${enchants.recipes.length} 可制作`
      : '未建造';
    if (!enchants.tableReady) {
      const hint = document.createElement('p');
      hint.className = 'base-storage-recipe-desc';
      hint.textContent = enchants.stationReady
        ? '附魔台还没建成。先研究「附魔工艺」，再合成并放置附魔台。'
        : '需要先建造科研站，才能研究解锁附魔台。';
      list.appendChild(hint);
      return;
    }
    enchants.recipes.forEach((recipe) => {
      const card = document.createElement('article');
      card.className = recipe.canEnchant
        ? 'base-storage-recipe is-craftable'
        : 'base-storage-recipe';
      card.dataset.enchantId = recipe.enchantmentId;

      const head = document.createElement('div');
      head.className = 'base-storage-recipe-head';
      const name = document.createElement('span');
      name.className = 'base-storage-recipe-name';
      name.textContent = runeDisplayName(recipe.enchantmentId);
      const output = document.createElement('span');
      output.className = 'base-storage-recipe-output';
      output.textContent = '→ 附魔石 ×1';
      head.append(name, output);
      card.appendChild(head);

      const inputs = document.createElement('div');
      inputs.className = 'base-storage-inputs';
      recipe.cost.forEach((entry) => {
        const missing = entry.have < entry.count;
        const chip = document.createElement('span');
        chip.className = missing ? 'base-storage-input is-missing' : 'base-storage-input';
        chip.dataset.itemId = entry.itemId;
        const label = document.createElement('span');
        label.textContent = itemName(entry.itemId);
        const amount = document.createElement('span');
        amount.className = 'base-storage-input-have';
        amount.textContent = `${entry.have}/${entry.count}`;
        chip.append(label, amount);
        inputs.appendChild(chip);
      });
      card.appendChild(inputs);

      const actions = document.createElement('div');
      actions.className = 'base-storage-actions';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'base-storage-craft';
      button.dataset.enchantRune = recipe.enchantmentId;
      button.textContent = '制作';
      button.disabled = !recipe.canEnchant;
      actions.appendChild(button);
      if (!recipe.canEnchant && recipe.reasonLabel) {
        const blocked = document.createElement('span');
        blocked.className = 'base-storage-blocked';
        blocked.textContent = recipe.reasonLabel;
        actions.appendChild(blocked);
      }
      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  /** 搬运的目标单位：当前选中的己方单位（有背包的才真的能搬）。 */
  bagUnit() {
    const unit = this.game?.selectedUnit ?? null;
    if (!unit || unit.alive === false) return null;
    return unit;
  }

  renderUnitBag(unit, counts) {
    const bag = unit ? (unit.workerInventory ?? unit.itemBag ?? null) : null;
    this.parts.unitTitle.textContent = unit ? `${unit.name} 的背包` : '单位背包';
    if (!unit) {
      this.parts.unitCount.textContent = '未选中单位';
      this.parts.unitItems.textContent = '';
      const hint = document.createElement('div');
      hint.className = 'base-storage-item is-empty';
      hint.innerHTML = '<span class="base-storage-item-name">选中一个单位后可以在这里搬运</span>'
        + '<span class="base-storage-item-count">—</span>';
      this.parts.unitItems.appendChild(hint);
      return;
    }
    if (!bag) {
      this.parts.unitCount.textContent = '没有物品背包';
      this.parts.unitItems.textContent = '';
      const hint = document.createElement('div');
      hint.className = 'base-storage-item is-empty';
      hint.innerHTML = '<span class="base-storage-item-name">该单位没有物品背包（建筑没有背包）</span>'
        + '<span class="base-storage-item-count">—</span>';
      this.parts.unitItems.appendChild(hint);
      return;
    }
    this.parts.unitCount.textContent = `${bag.usedSlots()}/${bag.capacity}`;
    const list = this.parts.unitItems;
    list.textContent = '';
    bag.slots.forEach((slot, index) => {
      if (!slot) return;
      list.appendChild(this.createMoveChip(slot, {
        from: 'unit',
        index,
        unit,
        title: `点击把${itemName(slot.itemId)}搬回基地`
      }));
    });
    if (!Object.keys(counts ?? {}).length) {
      const empty = document.createElement('div');
      empty.className = 'base-storage-item is-empty';
      empty.innerHTML = '<span class="base-storage-item-name">背包是空的</span>'
        + '<span class="base-storage-item-count">0</span>';
      list.appendChild(empty);
    }
  }

  /** 一个可点击搬运的格子：基地 ↔ 单位都是同一套外观。 */
  createMoveChip(slot, { from, index, title, unit = null }) {
    const definition = itemDefinition(slot.itemId);
    const placeable = from === 'base' && definition?.placeable?.unitType;
    // 单位背包里的武器：多一个「装备」按钮。能不能装由 weapons.js 判定，
    // 界面只负责把原因显示出来（"装不上"必须说清是哪一项不匹配）。
    const weaponCheck = from === 'unit' && unit ? canEquipWeapon(slot.itemId, unit) : null;
    const equippable = weaponCheck?.ok === true
      || (weaponCheck && weaponCheck.reason !== WEAPON_ERROR.notAWeapon);
    const chip = document.createElement(placeable || equippable ? 'div' : 'button');
    chip.className = 'base-storage-item is-movable';
    chip.dataset.moveFrom = from;
    chip.dataset.slotIndex = String(index);
    if (!placeable && !equippable) chip.type = 'button';
    chip.title = title;
    const name = document.createElement('span');
    name.className = 'base-storage-item-name';
    name.textContent = itemName(slot.itemId);
    const amount = document.createElement('span');
    amount.className = 'base-storage-item-count';
    amount.textContent = String(slot.count ?? 1);
    chip.append(name, amount);
    if (placeable) {
      // 可放置物品：搬运按钮会误触，改成明确的两个动作
      const place = document.createElement('button');
      place.type = 'button';
      place.className = 'base-storage-place';
      place.dataset.placeItem = slot.itemId;
      place.textContent = '放置';
      place.title = `把${itemName(slot.itemId)}放到地面上（左键落地，右键取消）`;
      chip.appendChild(place);
    }
    if (equippable) {
      const equip = document.createElement('button');
      equip.type = 'button';
      equip.className = 'base-storage-place';
      equip.dataset.equipWeapon = String(index);
      equip.textContent = '装备';
      equip.disabled = weaponCheck.ok !== true;
      equip.title = weaponCheck.ok === true
        ? `把${itemName(slot.itemId)}装到${unit?.name ?? '单位'}手上`
        : weaponCheck.label;
      chip.appendChild(equip);
      if (weaponCheck.ok !== true) {
        const blocked = document.createElement('span');
        blocked.className = 'base-storage-blocked';
        blocked.textContent = weaponCheck.label;
        chip.appendChild(blocked);
      }
    }
    return chip;
  }

  renderItems(inventory, counts) {
    const used = typeof inventory.usedSlots === 'function'
      ? inventory.usedSlots()
      : Object.keys(counts).length;
    this.parts.slotCount.textContent = `${used}/${inventory.capacity}`;
    this.parts.hint.textContent = '点击基地里的物品可搬给选中的单位，点击单位背包里的物品可搬回基地。';
    const list = this.parts.items;
    list.textContent = '';
    const entries = [];
    inventory.slots.forEach((slot, index) => {
      if (slot) entries.push({ slot, index });
    });
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'base-storage-item is-empty';
      empty.innerHTML = '<span class="base-storage-item-name">空空如也</span><span class="base-storage-item-count">0</span>';
      list.appendChild(empty);
    } else {
      entries.forEach(({ slot, index }) => {
        list.appendChild(this.createMoveChip(slot, {
          from: 'base',
          index,
          title: `点击把${itemName(slot.itemId)} ×${slot.count} 交给选中的单位`
        }));
      });
    }
    // 空格子也画出来，让"还有多少位置"一眼能看出来（和库存容量是同一件事）
    const free = typeof inventory.freeSlots === 'function' ? inventory.freeSlots() : 0;
    for (let i = 0; i < Math.min(free, 24); i += 1) {
      const slot = document.createElement('div');
      slot.className = 'base-storage-item is-empty';
      slot.innerHTML = '<span class="base-storage-item-name">空</span><span class="base-storage-item-count">—</span>';
      list.appendChild(slot);
    }
  }

  renderRecipes(recipes) {
    const list = this.parts.recipes;
    list.textContent = '';
    this.parts.recipeCount.textContent = recipes.length
      ? `${recipes.filter((recipe) => recipe.craftable).length}/${recipes.length} 可合成`
      : '';
    if (!recipes.length) {
      const empty = document.createElement('p');
      empty.className = 'base-storage-recipe-desc';
      empty.textContent = '暂无配方。';
      list.appendChild(empty);
      return;
    }
    recipes.forEach((recipe) => {
      const card = document.createElement('article');
      card.className = recipe.craftable
        ? 'base-storage-recipe is-craftable'
        : 'base-storage-recipe';
      card.dataset.recipeId = recipe.id;

      const head = document.createElement('div');
      head.className = 'base-storage-recipe-head';
      const name = document.createElement('span');
      name.className = 'base-storage-recipe-name';
      name.textContent = recipe.name;
      const output = document.createElement('span');
      output.className = 'base-storage-recipe-output';
      output.textContent = `→ ${itemName(recipe.output.itemId)} ×${recipe.output.count}`;
      head.append(name, output);
      card.appendChild(head);

      if (recipe.description) {
        const desc = document.createElement('p');
        desc.className = 'base-storage-recipe-desc';
        desc.textContent = recipe.description;
        card.appendChild(desc);
      }

      const inputs = document.createElement('div');
      inputs.className = 'base-storage-inputs';
      recipe.inputs.forEach((entry) => {
        const missing = entry.have < entry.count;
        const chip = document.createElement('span');
        chip.className = missing ? 'base-storage-input is-missing' : 'base-storage-input';
        chip.dataset.itemId = entry.itemId;
        const label = document.createElement('span');
        label.textContent = itemName(entry.itemId);
        const amount = document.createElement('span');
        amount.className = 'base-storage-input-have';
        amount.textContent = `${entry.have}/${entry.count}`;
        chip.append(label, amount);
        inputs.appendChild(chip);
      });
      card.appendChild(inputs);

      const actions = document.createElement('div');
      actions.className = 'base-storage-actions';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'base-storage-craft';
      button.dataset.craftRecipe = recipe.id;
      button.dataset.craftTimes = '1';
      button.textContent = '合成 ×1';
      button.disabled = !recipe.craftable;
      actions.appendChild(button);

      // "全部合成"只在真的能做多批时才出现，避免多一个永远点不动的按钮
      const maxTimes = this.maxCraftableTimes(recipe);
      if (maxTimes > 1) {
        const all = document.createElement('button');
        all.type = 'button';
        all.className = 'base-storage-craft';
        all.dataset.craftRecipe = recipe.id;
        all.dataset.craftTimes = String(maxTimes);
        all.textContent = `全部合成 ×${maxTimes}`;
        actions.appendChild(all);
      }
      if (!recipe.craftable && recipe.reasonLabel) {
        const blocked = document.createElement('span');
        blocked.className = 'base-storage-blocked';
        blocked.textContent = recipe.reasonLabel;
        actions.appendChild(blocked);
      }
      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  /**
   * 一格里最多能连做几批。用 `crafting.js` 的模拟来算，不在 UI 里推库存规则；
   * 上限取一个保守值，避免点了"全部合成"直接做掉几百批。
   */
  maxCraftableTimes(recipe, limit = 20) {
    const game = this.game;
    if (typeof game.maxCraftableTimes !== 'function') return 0;
    return game.maxCraftableTimes(recipe, { limit });
  }

  renderFeedback() {
    const feedback = this.feedback;
    if (!feedback) {
      this.parts.feedback.hidden = true;
      return;
    }
    this.parts.feedback.hidden = false;
    this.parts.feedback.textContent = feedback.text;
    this.parts.feedback.classList.toggle('is-error', feedback.error === true);
  }

  // ---- 交互 ----

  onClick(event) {
    const close = event.target.closest('[data-storage-close]');
    if (close) {
      event.preventDefault();
      this.close();
      return;
    }
    const tab = event.target.closest('[data-storage-tab]');
    if (tab) {
      event.preventDefault();
      this.setTab(tab.dataset.storageTab);
      return;
    }
    const move = event.target.closest('[data-move-from]');
    if (move) {
      // 可放置物品的格子上没有搬运动作，只有里面的「放置」按钮
      const place = event.target.closest('[data-place-item]');
      if (place) {
        event.preventDefault();
        this.beginPlacement(place.dataset.placeItem);
        return;
      }
      const equip = event.target.closest('[data-equip-weapon]');
      if (equip) {
        event.preventDefault();
        if (equip.disabled) return;
        this.equipWeapon(Number(equip.dataset.equipWeapon));
        return;
      }
      if (move.tagName === 'BUTTON') {
        event.preventDefault();
        this.moveEntry(move.dataset.moveFrom, Number(move.dataset.slotIndex));
        return;
      }
    }
    const craft = event.target.closest('[data-craft-recipe]');
    if (craft) {
      event.preventDefault();
      if (craft.disabled) return;
      const recipeId = craft.dataset.craftRecipe;
      const times = Math.max(1, Math.floor(Number(craft.dataset.craftTimes) || 1));
      this.craft(recipeId, times);
      return;
    }
    const research = event.target.closest('[data-research-tech]');
    if (research) {
      event.preventDefault();
      if (research.disabled) return;
      this.researchTech(research.dataset.researchTech);
      return;
    }
    const enchant = event.target.closest('[data-enchant-rune]');
    if (enchant) {
      event.preventDefault();
      if (enchant.disabled) return;
      this.enchantRune(enchant.dataset.enchantRune);
      return;
    }
  }

  /** 在单位背包里给选中的单位换武器（同类武器校验在 weapons.js）。 */
  equipWeapon(slotIndex) {
    const game = this.game;
    const unit = this.bagUnit();
    const result = game.equipWeaponFromBag?.(unit, slotIndex)
      ?? { ok: false, reason: 'no_equip_api', label: '无法装备' };
    if (result.ok) {
      this.feedback = {
        text: `${unit?.name ?? '单位'}换上了${itemName(result.itemId)}`
          + (result.returnedItemId ? `，换下的${itemName(result.returnedItemId)}放回了背包` : ''),
        error: false
      };
    } else {
      this.feedback = { text: result.label || '无法装备', error: true };
    }
    this.lastSignature = '';
    this.refresh();
    return result;
  }

  /** 研究一项科技。规则与状态都来自 ResearchSystem，UI 只派发与报结果。 */
  researchTech(techId) {
    const game = this.game;
    const result = game.research?.research?.(techId) ?? { ok: false, reason: 'no_research_system' };
    if (result.ok) {
      this.feedback = { text: `科技已解锁：${result.tech?.name ?? techId}`, error: false };
    } else {
      this.feedback = { text: result.label || '无法研究', error: true };
    }
    this.lastSignature = '';
    this.refresh();
    return result;
  }

  /** 在附魔台做一块附魔石。成功后石头直接进符文背包。 */
  enchantRune(enchantmentId) {
    const game = this.game;
    const result = game.research?.enchant?.(enchantmentId) ?? { ok: false, reason: 'no_research_system' };
    if (result.ok) {
      this.feedback = {
        text: `制作完成：${runeDisplayName(enchantmentId)} 附魔石（已放进符文背包）`,
        error: false
      };
    } else {
      this.feedback = { text: result.label || '无法制作', error: true };
    }
    this.lastSignature = '';
    this.refresh();
    return result;
  }

  /**
   * 点「放置」：进入放置模式。面板会自己关掉——玩家接下来要点地图。
   */
  beginPlacement(itemId) {
    const game = this.game;
    const result = game.beginPlacement?.(itemId) ?? { ok: false, reason: 'not_placeable' };
    if (result.ok) {
      this.feedback = { text: `放置${itemName(itemId)}：左键落地，右键 / Esc 取消`, error: false };
      this.close();
    } else {
      this.feedback = {
        text: result.reason === 'not_in_stock' ? `${itemName(itemId)}：库存里没有` : '这件东西不能放置',
        error: true
      };
      this.lastSignature = '';
      this.refresh();
    }
    return result;
  }

  /**
   * 点击搬运：基地 → 选中单位，或选中单位 → 基地。
   * 两个方向都交给 Game（库存的原子转移在那边），UI 只负责报告结果。
   */
  moveEntry(from, slotIndex) {
    const game = this.game;
    const unit = this.bagUnit();
    if (!Number.isFinite(slotIndex)) return null;
    let result = null;
    if (from === 'base') {
      result = game.transferBaseSlotToUnit?.(slotIndex, unit)
        ?? { ok: false, reason: 'no_unit' };
    } else {
      result = game.transferUnitSlotToBase?.(slotIndex, unit)
        ?? { ok: false, reason: 'no_unit' };
    }
    const itemLabel = result.itemId ? itemName(result.itemId) : '物品';
    if (result.ok) {
      this.feedback = {
        text: from === 'base'
          ? `已把${itemLabel} ×${result.count} 交给 ${unit?.name ?? '单位'}`
          : `已把${itemLabel} ×${result.count} 收回基地`,
        error: false
      };
    } else {
      const label = typeof game.transferFailureLabel === 'function'
        ? game.transferFailureLabel(result.reason)
        : '搬不过去';
      this.feedback = { text: `${itemLabel}：${label}`, error: true };
    }
    this.lastSignature = '';
    this.refresh();
    return result;
  }

  craft(recipeId, times = 1) {
    const game = this.game;
    if (typeof game.craftAtBase !== 'function') return null;
    const result = game.craftAtBase(recipeId, { times });
    const recipe = (typeof game.recipeStatus === 'function' ? game.recipeStatus() : [])
      .find((entry) => entry.id === recipeId) ?? null;
    if (result?.ok) {
      this.feedback = { text: `合成完成：${recipe?.name ?? recipeId} ×${result.crafted}`, error: false };
    } else {
      this.feedback = {
        text: `${recipe?.name ?? recipeId}：${recipe?.reasonLabel || '合成失败'}`,
        error: true
      };
    }
    // 立刻反映一次，不等 400ms 的轮询
    this.lastSignature = '';
    this.refresh();
    return result;
  }

  destroy() {
    this.stopAutoRefresh();
    if (this.launcherTimer != null) {
      window.clearInterval(this.launcherTimer);
      this.launcherTimer = null;
    }
    this.launcher?.button?.remove();
    this.launcher = null;
    if (this.root) {
      this.root.remove();
      this.root = null;
      this.parts = null;
    }
  }
}
