// 屏幕底部物品快捷栏的端到端验收（本轮需求 6）。
//
// 需求原文：「快捷栏应该在屏幕下方，这样才能拖拽相关东西给单位或者拖拽建筑进行建造，
// 不应该在 b 键面板内部。」
//
// 所以验的是**手势真的通**，而不是"DOM 里有一排格子"：
//   1. 常驻屏幕底部、固定 9 格（空槽也在），面板里一个都没有；
//   2. 取材是"能用的东西"：可放置建筑 + 能交给单位的装备，木材石料不该占格子；
//   3. 数字键 / 点击仍然能进入放置模式；
//   4. **拖拽**：拖到己方单位身上把东西交给他，拖到地上把建筑建起来；
//   5. 拖拽过程中有落点反馈，松手后跟手的图标不会残留；
//   6. 位置真的在屏幕下方（海岛关里手牌区是隐藏的，所以不再留 250px 的空白）。
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';

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
report.started = await enterSurvivalGame(ev, sleep);

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
    const root = () => document.querySelector('#item-hotbar');
    const hotbarVisible = () => root()?.hidden === false;
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
    const worker = (game.friendlyUnits ?? []).find((unit) => unit?.alive && unit.isWorker) ?? null;
    out.workerFound = Boolean(worker);
    // 傀儡站到离基地 14m 的空地上：拖拽落点靠屏幕坐标判定，
    // 站在基地旁边时"基地"这个建筑会挡在落点半径里，拖到单位身上会误判成拖到建筑上。
    if (worker) {
      const spot = game.resolveWalkablePoint(
        new (worker.position.constructor)(game.playerBase.position.x - 14, 0, game.playerBase.position.z)
      );
      worker.position.set(spot.x, game.groundHeightAt(spot), spot.z);
      game.work.setDemands([]);
      game.work.clearTask(worker);
    }
    game.selectUnit(worker);
    await step(2);

    const refreshAll = async () => {
      game.baseStorage.lastSignature = '';
      game.hotbar.lastSignature = '';
      game.baseStorage.refresh();
      game.hotbar.refresh();
      await step(1);
    };

    // ---- 1) 常驻 + 固定 9 格 + 取材只含"能用的东西" ----
    inventory.slots.fill(null);
    inventory.add('wood', 50);
    inventory.add('stone', 50);
    await refreshAll();
    out.visibleWithOnlyMaterials = hotbarVisible();
    out.slotCountWithOnlyMaterials = slots().length;
    out.emptySlotsHaveNoItem = slots().every((slot) => !slot.dataset.itemId);

    inventory.add('furnace', 2);
    inventory.add('manaFurnace', 1);
    inventory.add('puppetCudgel', 1);
    inventory.add('puppetGlaive', 1);
    await refreshAll();
    out.slotItems = slots().map((slot) => slot.dataset.itemId ?? null);
    out.slotKinds = slots().map((slot) => slot.dataset.hotbarKind ?? null);
    out.filledSlotCount = out.slotItems.filter(Boolean).length;
    out.emptySlotCount = out.slotItems.filter((itemId) => !itemId).length;
    out.furnaceCountShown = slots()
      .find((slot) => slot.dataset.itemId === 'furnace')
      ?.querySelector('.item-hotbar-count')?.textContent ?? null;
    // 木材石料不该占格子（它们是合成材料，不是"能在世界里用掉的东西"）
    out.materialsExcluded = !out.slotItems.includes('wood') && !out.slotItems.includes('stone');
    // 可放置的排在前面，装备在后：槽位序号就是数字键的含义，顺序必须稳定
    const firstGivable = out.slotItems.indexOf('puppetCudgel');
    const lastPlaceable = out.slotItems.indexOf('manaFurnace');
    out.placeablesFirst = lastPlaceable >= 0 && firstGivable > lastPlaceable;

    // ---- 2) 面板里一个快捷栏格子都没有 ----
    game.baseStorage.open();
    await refreshAll();
    out.panelHasNoHotbar = document.querySelectorAll('#backpack [data-backpack-hotbar-slot]').length === 0;
    game.baseStorage.close();
    await refreshAll();

    // ---- 3) 数字键进入放置 / 再按取消 / 空槽忽略 ----
    pressKey('1');
    await step(1);
    out.placingAfterKey1 = game.placingItem?.itemId ?? null;
    out.slot1MarkedActive = slots()[0]?.classList.contains('is-active') === true;
    pressKey('1');
    await step(1);
    out.cancelledBySecondPress = game.isPlacing() === false;
    slots()[1]?.click();
    await step(1);
    out.placingByClick = game.placingItem?.itemId ?? null;
    game.cancelPlacement();
    await step(1);
    pressKey('9');
    await step(1);
    out.emptySlotKeyIgnored = game.isPlacing() === false;

    // ---- 4) 点击装备槽：选中单位时直接交给他 ----
    const giveIndex = out.slotItems.indexOf('puppetCudgel');
    out.giveIndex = giveIndex;
    const bagOf = (unit) => game.itemBagFor(unit, { create: false });
    out.cudgelInBagBefore = bagOf(worker)?.countOf?.('puppetCudgel') ?? 0;
    slots()[giveIndex]?.click();
    await step(1);
    out.cudgelInBagAfterClick = bagOf(worker)?.countOf?.('puppetCudgel') ?? 0;
    out.cudgelLeftBaseAfterClick = inventory.countOf('puppetCudgel');
    await refreshAll();

    // ---- 5) 真拖拽：把木刃拖到傀儡身上 ----
    const dragIndex = slots().findIndex((slot) => slot.dataset.itemId === 'puppetGlaive');
    out.dragIndex = dragIndex;
    const dragSlot = slots()[dragIndex];
    const slotRect = dragSlot?.getBoundingClientRect?.() ?? null;
    const screen = game.worldToScreen(worker.position);
    const pointer = (type, x, y) => new PointerEvent(type, {
      clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse'
    });
    out.glaiveInBagBeforeDrag = bagOf(worker)?.countOf?.('puppetGlaive') ?? 0;
    if (slotRect) {
      const fromX = slotRect.left + slotRect.width / 2;
      const fromY = slotRect.top + slotRect.height / 2;
      dragSlot.dispatchEvent(pointer('pointerdown', fromX, fromY));
      window.dispatchEvent(pointer('pointermove', (fromX + screen.x) / 2, (fromY + screen.y) / 2));
      window.dispatchEvent(pointer('pointermove', screen.x, screen.y));
      out.dragGhostVisible = Boolean(document.querySelector('.item-hotbar-drag-ghost'));
      out.dropTargetLabel = root()?.dataset.dropTarget ?? null;
      window.dispatchEvent(pointer('pointerup', screen.x, screen.y));
      await step(2);
    }
    out.glaiveInBagAfterDrag = bagOf(worker)?.countOf?.('puppetGlaive') ?? 0;
    out.glaiveLeftBaseAfterDrag = inventory.countOf('puppetGlaive');
    out.dragGhostCleared = !document.querySelector('.item-hotbar-drag-ghost');
    await refreshAll();

    // ---- 6) 真拖拽：把熔炉拖到地上建成 ----
    const placeIndex = slots().findIndex((slot) => slot.dataset.itemId === 'furnace');
    const placeSlot = slots()[placeIndex];
    const placeRect = placeSlot?.getBoundingClientRect?.() ?? null;
    const furnaceSpot = game.playerBase.position.clone();
    furnaceSpot.x += 5.2;
    furnaceSpot.z -= 3.4;
    furnaceSpot.y = game.groundHeightAt(furnaceSpot);
    out.furnaceSpotPlaceable = game.canPlaceAt(furnaceSpot).ok === true;
    const furnaceScreen = game.worldToScreen(furnaceSpot);
    const furnacesBefore = inventory.countOf('furnace');
    const buildingsBefore = new Set((game.friendlyUnits ?? []).filter((unit) => unit?.alive && unit.isBuilding).map((unit) => unit.id));
    if (placeRect) {
      const fromX = placeRect.left + placeRect.width / 2;
      const fromY = placeRect.top + placeRect.height / 2;
      placeSlot.dispatchEvent(pointer('pointerdown', fromX, fromY));
      window.dispatchEvent(pointer('pointermove', (fromX + furnaceScreen.x) / 2, (fromY + furnaceScreen.y) / 2));
      window.dispatchEvent(pointer('pointermove', furnaceScreen.x, furnaceScreen.y));
      window.dispatchEvent(pointer('pointerup', furnaceScreen.x, furnaceScreen.y));
      await step(4);
    }
    out.furnacesBefore = furnacesBefore;
    out.furnacesAfter = inventory.countOf('furnace');
    const freshBuildings = (game.friendlyUnits ?? []).filter((unit) => (
      unit?.alive && unit.isBuilding && !buildingsBefore.has(unit.id)
    ));
    out.structuresBefore = buildingsBefore.size;
    out.structuresAfter = (game.friendlyUnits ?? []).filter((unit) => unit?.alive && unit.isBuilding).length;
    out.freshBuildingTypes = freshBuildings.map((unit) => unit.type);
    // 落点允许有偏差：worldToScreen 带一个高度偏移，groundPointFromClient 是
    // 指针射到地面的真实交点，两者不会落在同一个坐标上。要守的是"建在了那一带"。
    out.freshBuildingDistance = freshBuildings.length
      ? Math.round(Math.hypot(
        freshBuildings[0].position.x - furnaceSpot.x,
        freshBuildings[0].position.z - furnaceSpot.z
      ) * 100) / 100
      : null;
    out.buildConsumedItem = furnacesBefore - out.furnacesAfter === 1;
    out.buildAddedStructure = out.structuresAfter === out.structuresBefore + 1
      && out.freshBuildingTypes.includes('furnace');
    out.placementModeClearedAfterDrop = game.isPlacing() === false;
    await refreshAll();

    // ---- 7) 位置真的在屏幕下方 ----
    const rect = root()?.getBoundingClientRect?.() ?? null;
    out.hotbarRect = rect
      ? { top: Math.round(rect.top), bottom: Math.round(rect.bottom), left: Math.round(rect.left), right: Math.round(rect.right) }
      : null;
    out.hotbarInsideViewport = Boolean(rect)
      && rect.left >= -1 && rect.right <= window.innerWidth + 1
      && rect.top >= 0 && rect.bottom <= window.innerHeight + 1;
    // 距离屏幕底边不超过 60px：这就是"在屏幕下方"唯一可断言的形态。
    // 旧版本为了避开手牌区停在 bottom:268px，而海岛关里根本没有手牌。
    out.bottomGap = rect ? Math.round(window.innerHeight - rect.bottom) : null;
    out.hugsScreenBottom = out.bottomGap !== null && out.bottomGap <= 60;
    out.handZoneHiddenInSurvival = (() => {
      const hand = document.querySelector('#card-hand');
      if (!hand) return true;
      return getComputedStyle(hand).display === 'none' || hand.hidden === true;
    })();

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
  // 常驻 + 固定 9 格（空槽也在，才能当拖拽落点）
  alwaysVisibleNineSlots: r.visibleWithOnlyMaterials === true
    && r.slotCountWithOnlyMaterials === 9
    && r.emptySlotsHaveNoItem === true
    && r.emptySlotCount === 5
    && r.filledSlotCount === 4,
  // 取材：可放置建筑 + 能交给单位的装备；木材石料不算
  onlyUsableItems: r.materialsExcluded === true
    && r.slotItems?.includes('furnace') === true
    && r.slotItems?.includes('manaFurnace') === true
    && r.slotItems?.includes('puppetCudgel') === true
    && r.slotItems?.includes('puppetGlaive') === true,
  // 顺序稳定：可放置在前、装备在后
  placeablesBeforeGivables: r.placeablesFirst === true,
  countsShown: String(r.furnaceCountShown ?? '') === '×2',
  // 快捷栏真的不在面板里
  notInsidePanel: r.panelHasNoHotbar === true,
  // 数字键 / 点击仍然可用
  keyEntersPlacement: r.placingAfterKey1 === 'furnace' && r.slot1MarkedActive === true,
  secondPressCancels: r.cancelledBySecondPress === true,
  clickMatchesSlot: r.placingByClick === 'manaFurnace',
  emptySlotKeyIgnored: r.emptySlotKeyIgnored === true,
  // 点击装备槽 = 交给选中单位
  clickGivesItemToUnit: r.cudgelInBagAfterClick === 1
    && r.cudgelInBagBefore === 0
    && r.cudgelLeftBaseAfterClick === 0,
  // 拖到单位身上
  dragShowsGhostAndDropTarget: r.dragGhostVisible === true
    && typeof r.dropTargetLabel === 'string' && r.dropTargetLabel.length > 0,
  dragGivesItemToUnit: r.dragIndex >= 0
    && r.glaiveInBagBeforeDrag === 0
    && r.glaiveInBagAfterDrag === 1
    && r.glaiveLeftBaseAfterDrag === 0
    && r.dragGhostCleared === true,
  // 拖到地上建造
  dragBuildsOnGround: r.buildConsumedItem === true
    && r.buildAddedStructure === true
    && r.freshBuildingDistance !== null && r.freshBuildingDistance < 4
    && r.placementModeClearedAfterDrop === true,
  // 位置：贴屏幕底部
  hugsScreenBottom: r.hotbarInsideViewport === true
    && r.hugsScreenBottom === true
    && r.handZoneHiddenInSurvival === true,
  elapsedAdvanced: r.elapsedAdvanced === true
} : null;
console.log(JSON.stringify(report, null, 2));
// 单行列出哪几项判定是假的：批量回归里 runner 只回显失败输出里匹配
// "false|Error|FAIL" 的末尾几行，JSON 里的 false 散在几百行里经常被截掉。
const failedChecks = Object.entries(report.verdict ?? {})
  .filter(([, passed]) => passed !== true)
  .map(([key]) => key);
if (failedChecks.length) console.log(`FAILED CHECKS: ${failedChecks.join(', ')}`);
const ok = failedChecks.length === 0 && problems.length === 0;
console.log(ok ? '\nITEM HOTBAR: PASS' : '\nITEM HOTBAR: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
