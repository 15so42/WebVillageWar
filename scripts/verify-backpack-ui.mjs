// 统一背包面板（#backpack）的端到端验收。
//
// 这一版面板把「符文背包」和「基地库存/合成」合并成了一个：B 打开基地背包（6 行 × 8 列 = 48 格）、
// E 打开某个单位的背包，右侧是合成 / 科技 / 附魔台，底部是 9 格快捷栏。
// 验的是"玩家真的能用它合成"，不是"DOM 里有个按钮"：
//   按 B 打开 → 旧的符文背包/基地库存面板彻底不存在 → 网格是 48 格 6 行 8 列 →
//   空格子都标 is-empty → 放进物品后正好一格 is-filled 带数量与美术 →
//   符文石只有左上角等级、没有数量 → 没见过的配方不出现、材料不足是灰的、够了才 is-craftable →
//   点配方产物上手（.backpack-cursor-ghost）→ 点空格放下、跟随物消失 → 快捷栏 9 格 →
//   面板整体落在视口内 → Esc 关闭。
// 最后留一张截图便于人工核对布局。
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';

const CDP_PORT = Number(process.env.ISLAND_CDP_PORT || 9235);
const BASE = process.env.ISLAND_URL || 'http://127.0.0.1:3000/';
const LEVEL_ID = process.env.ISLAND_LEVEL_ID || 'island-survival';
const OUT = 'C:/WebProjects/WebVillageWar/outputs/verify-backpack.png';

const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page')
  ?? await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 0;
const pending = new Map();
const problems = [];
const send = (m, p = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method: m, params: p }));
});
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    problems.push('[exception] ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? ''));
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    problems.push('[console.error] ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
});
await new Promise((r, rej) => { ws.on('open', r); ws.on('error', rej); });
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    const detail = res.exceptionDetails.exception?.description ?? res.exceptionDetails.text ?? 'unknown';
    throw new Error('page eval failed: ' + detail);
  }
  return res.result.value;
};

await send('Page.navigate', { url: BASE });
const report = { page: BASE, levelId: LEVEL_ID, started: false, result: null, problems };
report.started = await enterSurvivalGame(ev, sleep);

if (report.started) {
  await sleep(600);
  // 收掉开局三选一，免得它的模态盖住面板
  await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    g.pendingStrategyRewards = [];
    g.awaitingOpeningReward = false;
    if (g.strategyEvent) g.strategyEvent = null;
    if (g.strategyEventUi?.root) g.strategyEventUi.root.hidden = true;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
    return true;
  })()`);
  await sleep(300);

  // 0) 打开之前：旧的符文背包 / 基地库存面板与入口必须一个都不剩。
  //    新面板没有常驻入口按钮（B 键与"点单位"就是入口），所以这里只断言"旧的没了"。
  report.beforeOpen = JSON.parse(await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    return JSON.stringify({
      backpackRootAbsent: !document.querySelector('#backpack'),
      legacyNodesAbsent: !document.querySelector('#rune-backpack')
        && !document.querySelector('#rune-backpack-button')
        && !document.querySelector('#rune-backpack-open')
        && !document.querySelector('#base-storage')
        && !document.querySelector('#base-storage-button'),
      legacyStorageAttrsAbsent: !document.querySelector('[data-storage-items], [data-storage-tab], [data-storage-recipes]'),
      legacyApiGone: g.runeBackpack === undefined && g.toggleUnitRuneBackpack === undefined
        && g.toggleBaseRuneBackpack === undefined,
      aliasIsSameObject: g.baseStorage === g.backpack && Boolean(g.backpack)
    });
  })()`));

  // 1) 按 B 打开基地背包
  await ev(`(() => {
    window.__VILLAGE_WAR_DEBUG__.game.backpack.close();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
    return true;
  })()`);
  await sleep(300);
  report.opened = JSON.parse(await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    const root = document.querySelector('#backpack');
    const style = root ? getComputedStyle(root) : null;
    return JSON.stringify({
      exists: !!root,
      visible: !!root && !root.hidden && style.visibility === 'visible' && style.opacity !== '0',
      openFlag: g.backpack.isOpen() === true,
      baseMode: g.backpack.mode === 'base' && root?.classList.contains('is-base-view') === true,
      title: document.querySelector('#backpack [data-backpack-grid-title]')?.textContent ?? null
    });
  })()`));

  // 2) 网格结构 + 空格子 + 物品渲染 + 符文石 + 配方解锁 + 合成 + 快捷栏。
  //    全同步执行：面板每 400ms 会自动 refresh 重建网格，中间 await 会让刚查到的节点失效。
  report.panel = JSON.parse(await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    const panel = g.backpack;
    const out = {};
    const q = (sel) => document.querySelector(sel);
    const qa = (sel) => [...document.querySelectorAll(sel)];
    const grid = () => q('#backpack [data-backpack-grid]');
    const cells = () => qa('#backpack [data-backpack-grid] [data-backpack-slot]');
    const filledCells = () => cells().filter((cell) => cell.classList.contains('is-filled'));
    const tileFor = (recipeId) => q('#backpack [data-backpack-recipe="' + recipeId + '"]');
    const refresh = () => { panel.lastSignature = ''; panel.refresh(); };
    const inventory = g.baseInventory;

    // ---- 2.1) 6 行 × 8 列 = 48 格 ----
    const columns = getComputedStyle(grid()).gridTemplateColumns
      .split(/\\s+/).filter(Boolean).length;
    const cellNodes = cells();
    out.gridCells = cellNodes.length;
    out.gridColumns = columns;
    out.gridCssVariable = getComputedStyle(grid()).getPropertyValue('--backpack-columns').trim();
    out.gridRows = Math.ceil(cellNodes.length / columns);
    out.distinctRowTops = new Set(cellNodes.map((cell) => Math.round(cell.getBoundingClientRect().top))).size;
    out.cellIndexesSequential = cellNodes.every((cell, index) => Number(cell.dataset.backpackSlot) === index);

    // ---- 2.2) 空基地背包：每一格都是 is-empty ----
    inventory.slots.fill(null);
    // 配方解锁靠"见过"集合，清空库存之后必须把它一起清掉才能验"没见过 = 不出现"。
    panel.seenItemIds.clear();
    refresh();
    out.emptyCellCount = cells().filter((cell) => cell.classList.contains('is-empty')).length;
    out.emptyFilledCount = filledCells().length;
    out.emptyGridCountText = q('#backpack [data-backpack-grid-count]')?.textContent ?? null;
    out.emptyHint = q('#backpack [data-backpack-hint]')?.textContent ?? null;

    // ---- 2.3) 配方解锁：没见过材料 → 不出现；加材料 → 出现；不足灰、够亮 ----
    const furnaceInputs = ['stone', 'wood'];
    out.furnaceAbsentWhenUnseen = !tileFor('furnace');
    out.recruitmentAbsentWhenUnseen = !tileFor('recruitmentOrder');
    // 石料是熔炉的材料之一：加 1 份就应该解锁这条配方，但数量不够 → is-locked
    inventory.add('stone', 1);
    refresh();
    const locked = tileFor('furnace');
    out.furnaceAppearsAfterMaterial = Boolean(locked);
    out.furnaceLocked = locked?.classList.contains('is-locked') === true;
    out.furnaceNotCraftableWhileLocked = locked?.classList.contains('is-craftable') === false;
    out.furnaceMissingChips = [...(locked?.querySelectorAll('.backpack-input.is-missing') ?? [])]
      .map((chip) => chip.dataset.itemId);
    out.furnaceBlockedLabel = locked?.querySelector('.backpack-blocked')?.textContent ?? null;
    out.furnaceHaveChips = [...(locked?.querySelectorAll('.backpack-input') ?? [])]
      .map((chip) => ({ itemId: chip.dataset.itemId, text: chip.querySelector('.backpack-input-have')?.textContent }));
    // 补足材料（熔炉 = 石料 30 + 木材 20）→ 变成 is-craftable
    inventory.add('stone', 29);
    inventory.add('wood', 20);
    refresh();
    const craftable = tileFor('furnace');
    out.furnaceCraftable = craftable?.classList.contains('is-craftable') === true;
    out.furnaceNoMissingWhenStocked = (craftable?.querySelectorAll('.backpack-input.is-missing') ?? []).length === 0;
    out.furnaceNoBlockedWhenStocked = !craftable?.querySelector('.backpack-blocked');

    // ---- 2.4) 空格子/计数：只放木材 5 份 → 正好一格 is-filled + 数量 5 + svg 美术 ----
    inventory.slots.fill(null);
    inventory.add('wood', 5);
    refresh();
    const woodFill = filledCells();
    out.woodFilledCells = woodFill.length;
    out.woodCellCountText = woodFill[0]?.querySelector('.backpack-slot-count')?.textContent ?? null;
    out.woodCellHasSvgArt = Boolean(woodFill[0]?.querySelector('.backpack-slot-art svg'));
    out.woodCellIsEmpty = woodFill[0]?.classList.contains('is-empty') ?? null;
    out.woodGridCountText = q('#backpack [data-backpack-grid-count]')?.textContent ?? null;
    out.woodExpectedGridCount = inventory.usedSlots() + '/' + inventory.capacity;

    // ---- 2.5) 符文石是普通库存物品：左上角等级，且**不显示数量** ----
    const created = g.runeStones.createEnchantmentStone({ enchantmentId: 'fire', level: 3 });
    out.stoneCreated = created?.ok === true && created.stone?.level === 3;
    out.stoneId = created?.stone?.id ?? null;
    refresh();
    const runeCell = cells().find((cell) => cell.classList.contains('is-rune')) ?? null;
    out.runeCellFound = Boolean(runeCell);
    out.runeCellFilled = runeCell?.classList.contains('is-filled') === true;
    out.runeCellLevelText = runeCell?.querySelector('.backpack-slot-level')?.textContent ?? null;
    out.runeCellHasNoCount = !runeCell?.querySelector('.backpack-slot-count');
    out.runeCellHasSvgArt = Boolean(runeCell?.querySelector('.backpack-slot-art svg'));
    out.countBadgesInGrid = qa('#backpack [data-backpack-grid] .backpack-slot-count').length;

    // ---- 2.6) 合成：点配方 → 产物离开库存、跟到鼠标上 → 点空格放下 ----
    // 熔炉现在材料齐（石料 30 + 木材 20）
    inventory.add('stone', 30);
    inventory.add('wood', 15);   // 已有 5 份木材
    refresh();
    const stoneBefore = inventory.countOf('stone');
    const woodBefore = inventory.countOf('wood');
    tileFor('furnace')?.click();
    out.cursorAfterCraft = panel.cursor?.itemId ?? null;
    out.furnaceLeftInventory = inventory.countOf('furnace') === 0;
    out.cursorGhostInBody = Boolean(document.body.querySelector('.backpack-cursor-ghost'));
    out.cursorGhostHasArt = Boolean(document.body.querySelector('.backpack-cursor-ghost svg'));
    out.craftFeedback = q('#backpack [data-backpack-feedback]')?.textContent ?? null;
    out.stoneConsumed = stoneBefore - inventory.countOf('stone');
    out.woodConsumed = woodBefore - inventory.countOf('wood');
    const emptyIndex = inventory.slots.findIndex((slot) => !slot);
    out.emptyIndexForProduct = emptyIndex;
    panel.handleSlotClick(emptyIndex);
    out.furnaceBackInInventory = inventory.countOf('furnace') === 1;
    out.cursorCleared = panel.cursor === null;
    out.cursorGhostGone = !document.body.querySelector('.backpack-cursor-ghost');
    out.productCellVisible = Boolean(cells().find((cell) => String(cell.title || '').startsWith('熔炉')));

    // ---- 2.7) 快捷栏已经搬出面板（需求 6）----
    // 面板里**不该再有**快捷栏；屏幕底部那条常驻 9 格由 verify-item-hotbar 覆盖。
    out.hotbarLeftThePanel = qa('#backpack [data-backpack-hotbar-slot]').length === 0;
    out.screenHotbarPresent = qa('#item-hotbar [data-hotbar-index]').length === 9;

    // ---- 2.8) 右侧两段标签：合成 / 资源；科技与附魔台已经搬去建筑界面（需求 7）----
    out.tabIds = qa('#backpack [data-backpack-tab]').map((tab) => tab.dataset.backpackTab);
    out.tabSwitch = [];
    for (const tabId of ['resource', 'craft']) {
      q('#backpack [data-backpack-tab="' + tabId + '"]')?.click();
      out.tabSwitch.push({
        id: tabId,
        active: q('#backpack .backpack-tab.is-active')?.dataset.backpackTab ?? null,
        recipesHidden: q('#backpack [data-backpack-recipes]')?.hidden ?? null,
        resourcesHidden: q('#backpack [data-backpack-resources]')?.hidden ?? null,
        panelTitle: q('#backpack [data-backpack-recipe-title]')?.textContent ?? null
      });
    }
    out.craftTabActive = panel.activeTab === 'craft';
    out.recipeCountText = q('#backpack [data-backpack-recipe-count]')?.textContent ?? null;
    out.techPaneGone = q('#backpack [data-backpack-techs]') === null;
    out.enchantPaneGone = q('#backpack [data-backpack-enchants]') === null;

    // ---- 2.8b) 资源 tab：可采集 + 可合成两种行，都能改优先级 ----
    q('#backpack [data-backpack-tab="resource"]')?.click();
    const resourceRows = qa('#backpack [data-resource-row]');
    out.resourceRowCount = resourceRows.length;
    out.resourceRowKinds = [...new Set(resourceRows.map((row) => row.dataset.resourceKind))].sort();
    // 每一行都要有 −／＋ 与当前值
    out.resourceRowsHaveControls = resourceRows.every((row) => (
      row.querySelectorAll('[data-priority-item]').length === 2
      && Boolean(row.querySelector('[data-priority-value]'))
    ));
    // 真点一次「＋」：优先级上升，并且后台的采集需求真的跟着变了
    //
    // ⚠️ 每次点击前都必须**重新查一次那一行**：点一下会 markDirty → 整个面板重建，
    // 之前抓到的 DOM 节点立刻变成游离节点，再往上点就是在点空气。
    const clickPriority = (itemId, delta) => {
      q('#backpack [data-resource-row="' + itemId + '"]')
        ?.querySelector('[data-priority-item][data-priority-delta="' + delta + '"]')?.click();
      return q('#backpack [data-resource-row="' + itemId + '"]')
        ?.querySelector('[data-priority-value]')?.dataset.priorityValue ?? null;
    };
    const woodPriorityBefore = q('#backpack [data-resource-row="wood"]')
      ?.querySelector('[data-priority-value]')?.dataset.priorityValue ?? null;
    const demandsBefore = JSON.stringify(g.work.demands ?? []);
    const woodPriorityAfter = clickPriority('wood', '1');
    const demandsAfter = JSON.stringify(g.work.demands ?? []);
    out.resourcePriorityRaised = Number(woodPriorityAfter) === Number(woodPriorityBefore) + 1;
    out.resourcePriorityChangedDemands = demandsBefore !== demandsAfter;
    const woodDemand = (g.work.demands ?? []).find((demand) => demand.resource === 'wood') ?? null;
    out.woodDemandWeight = woodDemand ? Math.round(woodDemand.weight * 1000) / 1000 : null;
    out.woodDemandEnabled = woodDemand?.enabled === true;
    // 连点「−」：应该能降到 0，并且这一项需求被关掉（不再派傀儡去采）
    let woodPriorityLowest = null;
    for (let i = 0; i < 5; i += 1) woodPriorityLowest = clickPriority('wood', '-1');
    out.woodPriorityLowest = woodPriorityLowest;
    const woodDemandAfterDrop = (g.work.demands ?? []).find((demand) => demand.resource === 'wood') ?? null;
    out.woodCanBeDisabled = woodDemandAfterDrop === null || woodDemandAfterDrop.enabled === false;
    // 合成行：调它的优先级会折算到材料需求上
    const craftRowId = qa('#backpack [data-resource-row][data-resource-kind="craft"]')[0]
      ?.dataset.resourceRow ?? null;
    out.craftRowPresent = Boolean(craftRowId);
    if (craftRowId) {
      const before = JSON.stringify(g.work.demands ?? []);
      clickPriority(craftRowId, '1');
      out.craftRowChangesDemands = before !== JSON.stringify(g.work.demands ?? []);
      out.craftRowMentionsMaterials = /傀儡不会合成|材料/.test(
        q('#backpack [data-resource-row="' + craftRowId + '"] .backpack-card-desc')?.textContent ?? ''
      );
    }
    out.resourceTabSwitchesBack = (() => {
      q('#backpack [data-backpack-tab="craft"]')?.click();
      return q('#backpack [data-backpack-recipes]')?.hidden === false;
    })();

    // ---- 2.9) 面板整体落在视口内 ----
    const panelRect = q('#backpack .backpack-panel')?.getBoundingClientRect?.() ?? null;
    out.panelFitsViewport = Boolean(panelRect)
      && panelRect.left >= -1 && panelRect.top >= -1
      && panelRect.right <= window.innerWidth + 1
      && panelRect.bottom <= window.innerHeight + 1;
    out.panelRect = panelRect
      ? {
        left: Math.round(panelRect.left), top: Math.round(panelRect.top),
        right: Math.round(panelRect.right), bottom: Math.round(panelRect.bottom),
        viewport: [window.innerWidth, window.innerHeight]
      }
      : null;
    out.gridScrollsInsidePanel = (() => {
      const rect = grid()?.getBoundingClientRect?.();
      return Boolean(rect) && Boolean(panelRect)
        && rect.top >= panelRect.top - 1 && rect.bottom <= panelRect.bottom + 1;
    })();
    return JSON.stringify(out);
  })()`));

  mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

  // 3) Esc 关闭
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
  await sleep(250);
  report.esc = JSON.parse(await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    const root = document.querySelector('#backpack');
    return JSON.stringify({
      hidden: root?.hidden === true,
      openFlag: g.backpack.isOpen() === false
    });
  })()`));
}

const v = report;
const p = v.panel ?? {};
report.verdict = {
  booted: v.started === true,
  // 旧面板与旧入口彻底消失，baseStorage 只是新面板的别名
  legacyPanelsRemoved: v.beforeOpen?.backpackRootAbsent === true
    && v.beforeOpen?.legacyNodesAbsent === true
    && v.beforeOpen?.legacyStorageAttrsAbsent === true
    && v.beforeOpen?.legacyApiGone === true
    && v.beforeOpen?.aliasIsSameObject === true,
  // B 键打开基地背包
  openByKey: v.opened?.exists === true
    && v.opened?.visible === true
    && v.opened?.openFlag === true
    && v.opened?.baseMode === true
    && v.opened?.title === '基地背包',
  // 6 行 × 8 列 = 48 格，列数真的落在 CSS 上（不是只有常量写着 8）
  gridIs48Cells: p.gridCells === 48
    && p.gridColumns === 8
    && p.gridCssVariable === '8'
    && p.gridRows === 6
    && p.distinctRowTops === 6
    && p.cellIndexesSequential === true,
  // 空库存 ⇒ 每格 is-empty，计数 0/48
  emptyGridAllEmpty: p.emptyCellCount === 48
    && p.emptyFilledCount === 0
    && p.emptyGridCountText === '0/48',
  // 配方按"见过材料"解锁：没见过不出现，见过才出现，不足灰、够了亮
  recipesUnlockOnSeenItem: p.furnaceAbsentWhenUnseen === true
    && p.recruitmentAbsentWhenUnseen === true
    && p.furnaceAppearsAfterMaterial === true,
  recipeLockedWhenShort: p.furnaceLocked === true
    && p.furnaceNotCraftableWhileLocked === true
    && JSON.stringify(p.furnaceMissingChips ?? []) === JSON.stringify(['stone', 'wood'])
    && Boolean(p.furnaceBlockedLabel)
    && (p.furnaceHaveChips ?? []).some((chip) => chip.itemId === 'stone' && chip.text === '1/30'),
  recipeCraftableWhenStocked: p.furnaceCraftable === true
    && p.furnaceNoMissingWhenStocked === true
    && p.furnaceNoBlockedWhenStocked === true,
  // 一格物品：数量在右下角、美术是 svg
  singleFilledCellShowsCount: p.woodFilledCells === 1
    && p.woodCellCountText === '5'
    && p.woodCellHasSvgArt === true
    && p.woodCellIsEmpty === false,
  gridCountMatchesInventory: p.woodGridCountText === p.woodExpectedGridCount,
  // 符文石是普通库存物品：一格一块、左上角等级、没有数量
  runeStoneIsInventoryItem: p.stoneCreated === true
    && p.runeCellFound === true
    && p.runeCellFilled === true
    && p.runeCellLevelText === '3'
    && p.runeCellHasNoCount === true
    && p.runeCellHasSvgArt === true
    && p.countBadgesInGrid === 1,
  // 合成：产物离开库存跟到鼠标上（.backpack-cursor-ghost），点空格放下后跟随物消失
  craftGoesThroughCursor: p.cursorAfterCraft === 'furnace'
    && p.furnaceLeftInventory === true
    && p.cursorGhostInBody === true
    && p.cursorGhostHasArt === true,
  craftConsumesAndProduces: p.stoneConsumed === 30
    && p.woodConsumed === 20
    && p.furnaceBackInInventory === true
    && p.emptyIndexForProduct >= 0,
  craftShowsFeedback: String(p.craftFeedback ?? '').includes('做好了'),
  cursorGhostClearedAfterPlace: p.cursorCleared === true
    && p.cursorGhostGone === true
    && p.productCellVisible === true,
  // 快捷栏已搬出面板：面板里没有，屏幕底部有 9 格（需求 6）
  hotbarLeftThePanel: p.hotbarLeftThePanel === true && p.screenHotbarPresent === true,
  // 右侧两段标签一次只显示一段；科技/附魔台的窗格整个消失（需求 7 前半条）
  tabsAreCraftAndResource: JSON.stringify(p.tabIds ?? []) === JSON.stringify(['craft', 'resource'])
    && (p.tabSwitch ?? []).length === 2
    && (p.tabSwitch ?? []).every((entry) => entry.active === entry.id
      && entry.recipesHidden === (entry.id !== 'craft')
      && entry.resourcesHidden === (entry.id !== 'resource'))
    && p.craftTabActive === true
    && p.techPaneGone === true
    && p.enchantPaneGone === true,
  // 资源 tab（需求 8）：两类行 + 每行可加减 + 改动真的传到采集需求上
  resourceTabWorks: p.resourceRowCount > 0
    && JSON.stringify(p.resourceRowKinds ?? []) === JSON.stringify(['craft', 'resource'])
    && p.resourceRowsHaveControls === true
    && p.resourcePriorityRaised === true
    && p.resourcePriorityChangedDemands === true
    && p.woodDemandEnabled === true
    && p.craftRowPresent === true
    && p.craftRowChangesDemands === true
    && p.craftRowMentionsMaterials === true
    && p.resourceTabSwitchesBack === true,
  // 优先级可以降到"不采"，需求随之被关掉
  resourcePriorityCanDisable: p.woodCanBeDisabled === true,
  // 面板整体在视口内
  panelFitsViewport: p.panelFitsViewport === true && p.gridScrollsInsidePanel === true,
  escCloses: v.esc?.hidden === true && v.esc?.openFlag === true
};
console.log(JSON.stringify(report, null, 2));
const verdict = report.verdict;
const ok = Object.values(verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nBACKPACK UI: PASS' : '\nBACKPACK UI: FAIL');
console.log('SCREENSHOT', OUT);
ws.close();
process.exit(ok ? 0 : 1);
