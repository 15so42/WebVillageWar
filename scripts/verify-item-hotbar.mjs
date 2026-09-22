// 物品快捷栏端到端验收。
//
// 快捷栏的价值在于把"按 I 开面板 → 找到那件东西 → 点放置"压成一次按键，
// 所以验的是这条捷径真的通，而不是"DOM 里有一排格子"：
//   1. 基地里没有可放置物品时整条藏起来（不留一排空槽位占地方）；
//   2. 有可放置建筑时按库存出现槽位，且**只**出现可放置的那些；
//   3. 按数字键进入对应建筑的放置模式，再按一次取消；
//   4. 点击槽位与按键行为一致；
//   5. 放置完成后槽位数量跟着库存走（放掉一座就少一座）；
//   6. 快捷栏不压住手牌区——这两块都在底部居中，很容易重叠。
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';

const CDP_PORT = Number(process.env.ISLAND_CDP_PORT || 9235);
const BASE = process.env.ISLAND_URL || 'http://127.0.0.1:3000/';
const LEVEL_ID = process.env.ISLAND_LEVEL_ID || 'island-survival';

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
  const res = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
    timeout: 300000
  });
  if (res.exceptionDetails) {
    throw new Error('page eval failed: ' + (res.exceptionDetails.exception?.description ?? res.exceptionDetails.text));
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
  await sleep(500);
  report.result = JSON.parse(await ev(`(async () => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const out = {};
    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    game.paused = false;
    const step = async (n) => {
      for (let i = 0; i < n; i += 1) {
        game.tick();
        if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };
    const pressKey = (key) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    };
    const slots = () => [...document.querySelectorAll('#item-hotbar [data-hotbar-index]')];
    const hotbarVisible = () => {
      const root = document.querySelector('#item-hotbar');
      return Boolean(root) && root.hidden === false;
    };
    await step(8);
    game.pendingStrategyRewards = [];
    game.awaitingOpeningReward = false;
    if (game.strategyEvent) game.strategyEvent = null;
    if (game.strategyEventUi?.root) game.strategyEventUi.root.hidden = true;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
    // 清场（放过巢穴：全清会判胜、关卡结束、系统停推）
    (game.enemyUnits ?? []).slice().forEach((unit) => {
      if (!unit?.alive || unit.isSpawnPointNest || unit.isRecruitable) return;
      unit.alive = false;
      game.handleUnitDeath(unit, null);
    });
    (game.spawnPoints?.points ?? []).forEach((point) => { point.timer = 9999; });
    await step(4);

    const inventory = game.baseInventory;
    const open_ = () => { if (!game.baseStorage.isOpen()) game.baseStorage.open(); };
    const refreshAll = async () => {
      game.baseStorage.lastSignature = '';
      game.hotbar.lastSignature = '';
      game.baseStorage.refresh();
      game.hotbar.refresh();
      await step(1);
    };

    // ---- 1) 只有材料、没有可放置物品：整条藏起来 ----
    inventory.slots.fill(null);
    inventory.add('wood', 50);
    inventory.add('stone', 50);
    await refreshAll();
    out.hotbarHiddenWithoutPlaceables = hotbarVisible() === false;
    out.slotCountWithoutPlaceables = slots().length;

    // ---- 2) 放进两座可放置建筑：只出现这两件 ----
    inventory.add('furnace', 2);
    inventory.add('manaFurnace', 1);
    await refreshAll();
    out.hotbarVisibleWithPlaceables = hotbarVisible() === true;
    out.slotItems = slots().map((slot) => slot.dataset.itemId);
    out.slotLabels = slots().map((slot) => slot.textContent.replace(/[0-9]/g, '').trim());
    out.slotCounts = slots().map((slot) => slot.querySelector('.item-hotbar-count')?.textContent ?? null);
    out.furnaceCountShown = out.slotCounts[out.slotItems.indexOf('furnace')] ?? null;
    // 木料不是可放置物品，不该出现
    out.materialsExcluded = out.slotItems.includes('wood') === false
      && out.slotItems.includes('stone') === false;

    // ---- 3) 数字键进入放置模式，再按一次取消 ----
    const firstItemId = out.slotItems[0] ?? null;
    out.firstItemId = firstItemId;
    pressKey('1');
    await step(1);
    out.placingAfterKey1 = game.placingItem?.itemId ?? null;
    out.key1MatchesSlot = out.placingAfterKey1 === firstItemId;
    out.slotMarkedActive = slots()[0]?.classList.contains('is-active') === true;
    pressKey('1');
    await step(1);
    out.cancelledBySecondPress = game.isPlacing() === false;
    out.slotInactiveAfterCancel = slots()[0]?.classList.contains('is-active') === false;

    // ---- 4) 点第二个槽位与按键一致 ----
    const secondItemId = out.slotItems[1] ?? null;
    slots()[1]?.click();
    await step(1);
    out.placingByClick = game.placingItem?.itemId ?? null;
    out.clickMatchesSecondSlot = out.placingByClick === secondItemId;
    game.cancelPlacement();
    await step(1);

    // ---- 5) 越界按键不产生任何状态 ----
    pressKey('9');
    await step(1);
    out.outOfRangeKeyIgnored = game.isPlacing() === false;

    // ---- 6) 放掉一座之后槽位数量跟着库存走 ----
    game.beginPlacement('furnace');
    const spot = game.playerBase.position.clone();
    spot.x += 4.5;
    spot.z -= 3.5;
    const placed = game.confirmPlacement(spot);
    out.placed = placed.ok === true;
    await refreshAll();
    out.furnaceCountAfterPlace = inventory.countOf('furnace');
    out.slotCountAfterPlace = slots().length;
    out.countTextAfterPlace = slots()
      .find((slot) => slot.dataset.itemId === 'furnace')
      ?.querySelector('.item-hotbar-count')?.textContent ?? null;

    // ---- 7) 与手牌区不重叠 ----
    const hotbarRect = document.querySelector('#item-hotbar')?.getBoundingClientRect?.() ?? null;
    const handRect = document.querySelector('#card-hand')?.getBoundingClientRect?.() ?? null;
    out.hotbarRect = hotbarRect ? { top: Math.round(hotbarRect.top), bottom: Math.round(hotbarRect.bottom) } : null;
    out.handRect = handRect ? { top: Math.round(handRect.top), bottom: Math.round(handRect.bottom) } : null;
    out.noHandOverlap = Boolean(hotbarRect && handRect)
      ? !(hotbarRect.right < handRect.left || hotbarRect.left > handRect.right
        || hotbarRect.bottom < handRect.top || hotbarRect.top > handRect.bottom)
      : null;
    // 手牌区在 bottom:30px、卡高 220px。上面那条 Rect 比对在"手牌是空的"时恒真
    // （矩形高度为 0），所以再补一条不依赖当前手牌内容的：快捷栏必须整体落在手牌区上方。
    const handZoneTop = window.innerHeight - 30 - 220;
    out.clearsHandZone = Boolean(hotbarRect) && hotbarRect.bottom <= handZoneTop;
    out.handZoneTop = handZoneTop;
    out.hotbarInsideViewport = Boolean(hotbarRect)
      && hotbarRect.top >= 0 && hotbarRect.bottom <= window.innerHeight;

    // 放置预览不能残留：泄漏的幽灵模型会一直挂在地图上，而且它是半透明的，
    // 很容易被当成"某个没建完的东西"。截图里看到疑似残留，所以这里直接断言。
    out.placementGhostCleared = !game.placementGhost && game.isPlacing() === false;
    out.ghostInScene = Boolean(game.placementGhost);

    out.elapsedAdvanced = game.elapsedTime > 0;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));

  mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync('C:/WebProjects/WebVillageWar/outputs/verify-item-hotbar.png', Buffer.from(shot.data, 'base64'));
}

const r = report.result;
report.verdict = r && !r.error ? {
  booted: true,
  // 没东西可放就藏起来
  hiddenWhenEmpty: r.hotbarHiddenWithoutPlaceables === true && r.slotCountWithoutPlaceables === 0,
  visibleWithPlaceables: r.hotbarVisibleWithPlaceables === true,
  // 只列可放置的物品
  onlyPlaceables: r.slotItems?.length === 2
    && r.slotItems.includes('furnace') && r.slotItems.includes('manaFurnace')
    && r.materialsExcluded === true,
  countsShown: String(r.furnaceCountShown ?? '') === '×2',
  // 数字键
  keyEntersPlacement: r.key1MatchesSlot === true && r.slotMarkedActive === true,
  secondPressCancels: r.cancelledBySecondPress === true && r.slotInactiveAfterCancel === true,
  clickMatchesKey: r.clickMatchesSecondSlot === true,
  outOfRangeIgnored: r.outOfRangeKeyIgnored === true,
  // 槽位跟着库存走
  slotsFollowInventory: r.placed === true
    && r.furnaceCountAfterPlace === 1
    && r.slotCountAfterPlace === 2
    && String(r.countTextAfterPlace ?? '') === '×1',
  // 布局
  noHandOverlap: r.noHandOverlap === false,
  clearsHandZone: r.clearsHandZone === true,
  hotbarInsideViewport: r.hotbarInsideViewport === true,
  noGhostLeftBehind: r.placementGhostCleared === true,
  elapsedAdvanced: r.elapsedAdvanced === true
} : null;
console.log(JSON.stringify(report, null, 2));
const ok = Object.values(report.verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nITEM HOTBAR: PASS' : '\nITEM HOTBAR: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
