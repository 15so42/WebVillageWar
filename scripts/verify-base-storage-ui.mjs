// 基地库存与合成面板的端到端验收。
//
// 验的是"玩家真的能用它合成"，不是"DOM 里有个按钮"：
//   按 I 打开 → 面板可见且列出配方 → 缺料时按钮禁用且点了也不扣东西 →
//   补料后按钮可点 → 点击真的扣料出货 → Esc 关闭 → 空位/计数与库存一致。
// 最后留一张截图便于人工核对布局（避免压在其它 HUD 上）。
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';

const CDP_PORT = Number(process.env.ISLAND_CDP_PORT || 9235);
const BASE = process.env.ISLAND_URL || 'http://127.0.0.1:3000/';
const LEVEL_ID = process.env.ISLAND_LEVEL_ID || 'island-survival';
const OUT = 'C:/WebProjects/WebVillageWar/outputs/verify-base-storage.png';

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
for (let i = 0; i < 60; i += 1) {
  await sleep(400);
  if (await ev(`!!document.querySelector('[data-action="levels"]')`)) break;
}
await ev(`document.querySelector('[data-action="levels"]')?.click(); true`);
await sleep(1200);
await ev(`(() => {
  const btn = [...document.querySelectorAll('[data-action="select-level"]')]
    .find((e) => e.offsetParent !== null && (e.dataset.levelId || '').includes(${JSON.stringify(LEVEL_ID)}));
  if (btn) btn.click();
  return true;
})()`);
await sleep(500);
await ev(`(()=>{const b=[...document.querySelectorAll('[data-action="start-level"]')].find(e=>e.offsetParent!==null);if(b)b.click();return true;})()`);
for (let i = 0; i < 60; i += 1) {
  await sleep(400);
  if (await ev(`!!window.__VILLAGE_WAR_DEBUG__?.game`)) { report.started = true; break; }
}

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

  // 0) 入口必须在第一次打开之前就存在——否则"不知道怎么开"的玩家永远看不到入口
  // 注意：入口是 position: fixed，offsetParent 恒为 null，不能用它判断可见性。
  report.launcherBeforeOpen = JSON.parse(await ev(`(() => {
    const button = document.querySelector('#base-storage-button');
    const rect = button?.getBoundingClientRect?.() ?? null;
    const style = button ? getComputedStyle(button) : null;
    return JSON.stringify({
      exists: !!button,
      visible: !!rect && rect.width > 0 && rect.height > 0
        && style?.visibility !== 'hidden' && style?.display !== 'none',
      count: button?.querySelector('[data-storage-launcher-count]')?.textContent ?? null
    });
  })()`));

  // 1) 按 I 打开
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true })); true`);
  await sleep(300);
  report.opened = JSON.parse(await ev(`(() => {
    const root = document.querySelector('#base-storage');
    return JSON.stringify({
      exists: !!root,
      visible: !!root && !root.hidden && getComputedStyle(root).visibility === 'visible',
      openFlag: window.__VILLAGE_WAR_DEBUG__.game.baseStorage.isOpen()
    });
  })()`));

  // 2) 缺料：配方列出、按钮禁用、点了不扣东西
  report.blocked = JSON.parse(await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    const out = {};
    // 清空库存，制造"缺料"状态
    g.baseInventory.slots.fill(null);
    g.baseStorage.lastSignature = '';
    g.baseStorage.refresh();
    const card = document.querySelector('[data-recipe-id="recruitmentOrder"]');
    out.cardExists = !!card;
    out.name = card?.querySelector('.base-storage-recipe-name')?.textContent ?? null;
    const button = card?.querySelector('[data-craft-recipe]');
    out.buttonExists = !!button;
    out.buttonDisabled = button?.disabled === true;
    out.blockedLabel = card?.querySelector('.base-storage-blocked')?.textContent ?? null;
    out.missingChips = [...(card?.querySelectorAll('.base-storage-input.is-missing') ?? [])]
      .map((chip) => chip.dataset.itemId);
    const before = JSON.stringify(g.baseInventory.countsByItem());
    button?.click();
    out.inventoryUnchangedAfterDisabledClick = JSON.stringify(g.baseInventory.countsByItem()) === before;
    out.ordersAfterDisabledClick = g.baseInventory.countOf('recruitmentOrder');
    return JSON.stringify(out);
  })()`));

  // 3) 补料：按钮可点，点击真的合成
  report.crafting = JSON.parse(await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    const out = {};
    g.baseInventory.add('deepCore', 3);
    g.baseInventory.add('wood', 100);
    g.baseStorage.lastSignature = '';
    g.baseStorage.refresh();
    const card = document.querySelector('[data-recipe-id="recruitmentOrder"]');
    const button = card?.querySelector('[data-craft-recipe]');
    out.buttonEnabled = button?.disabled === false;
    out.cardCraftable = card?.classList.contains('is-craftable') === true;
    out.haveChips = [...(card?.querySelectorAll('.base-storage-input') ?? [])]
      .map((chip) => ({ itemId: chip.dataset.itemId, text: chip.querySelector('.base-storage-input-have')?.textContent }));
    out.coreBefore = g.baseInventory.countOf('deepCore');
    out.woodBefore = g.baseInventory.countOf('wood');
    button?.click();
    out.coreAfter = g.baseInventory.countOf('deepCore');
    out.woodAfter = g.baseInventory.countOf('wood');
    out.ordersAfter = g.baseInventory.countOf('recruitmentOrder');
    out.feedback = document.querySelector('[data-storage-feedback]')?.textContent ?? null;
    // 4) 全部合成：把剩余材料一次做完
    const all = document.querySelector('[data-recipe-id="recruitmentOrder"] [data-craft-times="2"]')
      ?? document.querySelector('[data-recipe-id="recruitmentOrder"] [data-craft-times]');
    out.allButtonText = all?.textContent ?? null;
    if (all && !all.disabled && all.dataset.craftTimes !== '1') {
      all.click();
      out.ordersAfterAll = g.baseInventory.countOf('recruitmentOrder');
      out.coreAfterAll = g.baseInventory.countOf('deepCore');
    }
    return JSON.stringify(out);
  })()`));

  // 5) 计数与空位显示、截图、Esc 关闭
  report.display = JSON.parse(await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    g.baseStorage.lastSignature = '';
    g.baseStorage.refresh();
    const used = g.baseInventory.usedSlots();
    const free = g.baseInventory.freeSlots();
    const chips = [...document.querySelectorAll('#base-storage [data-storage-items] .base-storage-item')];
    return JSON.stringify({
      slotCountText: document.querySelector('[data-storage-slot-count]')?.textContent ?? null,
      expectedSlotCount: used + '/' + g.baseInventory.capacity,
      freeSlots: free,
      emptyChips: chips.filter((chip) => chip.classList.contains('is-empty')).length,
      launcherCount: document.querySelector('[data-storage-launcher-count]')?.textContent ?? null,
      launcherExists: !!document.querySelector('#base-storage-button'),
      overlapsRuneLauncher: (() => {
        const a = document.querySelector('#base-storage-button')?.getBoundingClientRect();
        const b = document.querySelector('#rune-backpack-button')?.getBoundingClientRect();
        if (!a || !b) return null;
        return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
      })()
    });
  })()`));

  // 标签页：面板已经涨到 5 段，必须保证"一次只显示一段 + 切换真的生效 +
  // 别的段有没有内容能从徽标上看出来"。这几条不测的话，标签页坏了也照样"面板能用"。
  report.tabs = JSON.parse(await ev(`(async () => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    const step = () => g.tick();
    const buttons = () => [...document.querySelectorAll('#base-storage [data-storage-tab]')];
    const panels = () => [...document.querySelectorAll('#base-storage [data-storage-tab-panel]')];
    const visiblePanels = () => panels().filter((panel) => !panel.hidden).map((panel) => panel.dataset.storageTabPanel);
    const out = {};
    // 打开时默认停在库存段，且只显示这一段
    out.tabCount = buttons().length;
    out.panelCount = panels().length;
    out.initialVisible = visiblePanels();
    out.initialActive = buttons().find((b) => b.classList.contains('is-active'))?.dataset.storageTab ?? null;
    const body = document.querySelector('#base-storage .base-storage-body');
    out.bodyHeight = body ? Math.round(body.getBoundingClientRect().height) : null;
    // 逐个切过去：每次都应当只有这一段可见
    out.switchResults = [];
    for (const id of ['unit', 'craft', 'tech', 'enchant', 'items']) {
      buttons().find((b) => b.dataset.storageTab === id)?.click();
      step();
      out.switchResults.push({
        id,
        visible: visiblePanels(),
        active: buttons().find((b) => b.classList.contains('is-active'))?.dataset.storageTab ?? null
      });
    }
    // 徽标：先放点材料进去，保证**确实有东西可合成**——
    // 否则"可合成数 = 0、徽标是空的"这条断言恒真，什么都没验到。
    g.baseInventory.add('wood', 40);
    g.baseInventory.add('stone', 40);
    g.baseStorage.lastSignature = '';
    g.baseStorage.refresh();
    step();
    const craftable = g.recipeStatus().filter((recipe) => recipe.craftable).length;
    buttons().find((b) => b.dataset.storageTab === 'craft')?.click();
    step();
    out.craftableCount = craftable;
    out.craftBadge = document.querySelector('[data-storage-tab-badge="craft"]')?.textContent ?? null;
    out.craftBadgeHidden = document.querySelector('[data-storage-tab-badge="craft"]')?.hidden ?? null;
    // 未研究的科技数
    const locked = g.research.techStatus().filter((tech) => !tech.researched).length;
    out.lockedTechCount = locked;
    out.techBadge = document.querySelector('[data-storage-tab-badge="tech"]')?.textContent ?? null;
    // 切到合成段之后，配方卡片必须真的可见（不是被 hidden 的祖先盖住）
    out.craftPanelVisibleAfterSwitch = visiblePanels().includes('craft');
    out.firstRecipeRect = (() => {
      const card = document.querySelector('#base-storage [data-storage-recipes] .base-storage-recipe');
      const rect = card?.getBoundingClientRect?.();
      return rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null;
    })();
    // 切回库存段，让截图拍到默认状态
    buttons().find((b) => b.dataset.storageTab === 'items')?.click();
    step();
    out.finalVisible = visiblePanels();
    return JSON.stringify(out);
  })()`));

  mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
  await sleep(250);
  report.esc = JSON.parse(await ev(`(() => {
    const root = document.querySelector('#base-storage');
    return JSON.stringify({
      hidden: !!root?.hidden,
      openFlag: window.__VILLAGE_WAR_DEBUG__.game.baseStorage.isOpen()
    });
  })()`));
}

const v = report;
report.verdict = {
  booted: v.started === true,
  launcherExistsBeforeOpen: v.launcherBeforeOpen?.exists === true
    && v.launcherBeforeOpen?.visible === true
    && /^\d+\/\d+$/.test(String(v.launcherBeforeOpen?.count ?? '')),
  openByKey: v.opened?.exists === true && v.opened?.visible === true && v.opened?.openFlag === true,
  recipeListed: v.blocked?.cardExists === true && v.blocked?.name === '招募令',
  disabledWhenMissing: v.blocked?.buttonDisabled === true
    && v.blocked?.inventoryUnchangedAfterDisabledClick === true
    && v.blocked?.ordersAfterDisabledClick === 0,
  missingInputsShown: JSON.stringify(v.blocked?.missingChips ?? []) === JSON.stringify(['deepCore', 'wood'])
    && Boolean(v.blocked?.blockedLabel),
  enabledWhenStocked: v.crafting?.buttonEnabled === true && v.crafting?.cardCraftable === true,
  haveCountsShown: (v.crafting?.haveChips ?? []).some((chip) => chip.itemId === 'deepCore' && chip.text === '3/1')
    && (v.crafting?.haveChips ?? []).some((chip) => chip.itemId === 'wood' && chip.text === '100/20'),
  craftConsumesAndProduces: v.crafting?.coreAfter === v.crafting.coreBefore - 1
    && v.crafting?.woodAfter === v.crafting.woodBefore - 20
    && v.crafting?.ordersAfter === 1,
  craftShowsFeedback: typeof v.crafting?.feedback === 'string' && v.crafting.feedback.includes('合成完成'),
  craftAllWorks: v.crafting?.ordersAfterAll === 3 && v.crafting?.coreAfterAll === 0,
  slotCountMatchesInventory: v.display?.slotCountText === v.display?.expectedSlotCount,
  emptyChipsMatchFreeSlots: v.display?.emptyChips === Math.min(v.display?.freeSlots ?? -1, 24),
  launcherShowsUsage: /^\d+\/\d+$/.test(String(v.display?.launcherCount ?? '')),
  launcherDoesNotOverlap: v.display?.overlapsRuneLauncher === false,
  escCloses: v.esc?.hidden === true && v.esc?.openFlag === false,
  // 标签页
  tabsPresent: v.tabs?.tabCount === 5 && v.tabs?.panelCount === 5,
  oneVisiblePanelAtATime: v.tabs?.initialVisible?.length === 1
    && v.tabs.initialActive === 'items'
    && (v.tabs?.switchResults ?? []).every((entry) => (
      entry.visible.length === 1 && entry.visible[0] === entry.id && entry.active === entry.id
    ))
    && JSON.stringify(v.tabs?.finalVisible ?? []) === JSON.stringify(['items']),
  craftBadgeShowsCount: (v.tabs?.craftableCount ?? 0) > 0
    && Number(v.tabs?.craftBadge) === v.tabs?.craftableCount
    && v.tabs?.craftBadgeHidden === false,
  techBadgeShowsLocked: Number(v.tabs?.techBadge) === v.tabs?.lockedTechCount,
  // 切到合成段之后配方卡片真的有尺寸（不是被 hidden 的祖先盖住）
  craftPanelReallyVisible: v.tabs?.craftPanelVisibleAfterSwitch === true
    && (v.tabs?.firstRecipeRect?.height ?? 0) > 40,
  // 标签页应当让面板主体矮下来（只是一段的高度，而不是五段叠加）
  bodyStaysShort: (v.tabs?.bodyHeight ?? 9999) <= 420
};
console.log(JSON.stringify(report, null, 2));
const verdict = report.verdict;
const ok = Object.values(verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nBASE STORAGE UI: PASS' : '\nBASE STORAGE UI: FAIL');
console.log('SCREENSHOT', OUT);
ws.close();
process.exit(ok ? 0 : 1);
