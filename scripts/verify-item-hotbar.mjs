// 屏幕底部物品快捷栏的端到端验收。
//
// 快捷栏现在是**一个和基地背包同类的 9 格容器**（`Game.hotbarInventory`），
// 不是"基地库存里能用的东西"的自动投影。所以这一版验的是这套交互：
//
//   1. 常驻屏幕底部、固定 9 格，一开始是空的（内容由玩家决定）；
//   2. **背包开着 = 搬运**：把基地背包里的东西点到快捷栏格子上就存进去，
//      而且这时候**不能**触发使用（同一个"往快捷栏上放"的动作在两种情境下意思相反）；
//   3. **背包关着 = 使用**：数字键 / 点击 → 建筑进放置模式（预览跟鼠标走、右键取消）、
//      消耗品直接用掉、装备交给选中单位；材料按下去只给说明、不消耗；
//   4. **拖出去松手也是使用**：建筑拖到地上就建起来，消耗品拖出去松手就用掉；
//      松手落回快捷栏自己身上算反悔（不建、不吃）；
//   5. 扣物品**扣的是那一格**：快捷栏与基地背包各有一件同种建筑时，
//      从快捷栏放下的必须扣快捷栏那一格；
//   6. 位置真的在屏幕下方。
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';

const CDP_PORT = Number(process.env.ISLAND_CDP_PORT || 9235);
const BASE = process.env.ISLAND_URL || 'http://127.0.0.1:3000/';
const LEVEL_ID = process.env.ISLAND_LEVEL_ID || 'island-survival';
const OUT = 'outputs/verify-item-hotbar.png';

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
    const pressKey = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    const root = () => document.querySelector('#item-hotbar');
    const slotEls = () => [...document.querySelectorAll('#item-hotbar [data-hotbar-index]')];
    const pointer = (type, x, y, button = 0) => new PointerEvent(type, {
      clientX: x, clientY: y, button, buttons: button === 0 ? 1 : 2,
      bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse'
    });
    const centerOf = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const tap = (el, button = 0) => {
      const c = centerOf(el);
      el.dispatchEvent(pointer('pointerdown', c.x, c.y, button));
      return c;
    };
    const click = (el) => {
      const c = tap(el);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return c;
    };

    await step(8);
    game.pendingStrategyRewards = [];
    game.awaitingOpeningReward = false;
    if (game.strategyEvent) game.strategyEvent = null;
    if (game.strategyEventUi?.root) game.strategyEventUi.root.hidden = true;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
    // 清场（放过巢穴与可招募的中立单位：全清会判胜、关卡结束）
    (game.enemyUnits ?? []).slice().forEach((unit) => {
      if (!unit?.alive || unit.isSpawnPointNest || unit.isRecruitable) return;
      unit.alive = false;
      game.handleUnitDeath(unit, null);
    });
    (game.spawnPoints?.points ?? []).forEach((point) => { point.timer = 9999; });
    await step(4);

    const inventory = game.baseInventory;
    const hotbar = game.hotbarInventory;
    const worker = (game.friendlyUnits ?? []).find((unit) => unit?.alive && unit.isWorker) ?? null;
    out.workerFound = Boolean(worker);
    if (worker) {
      const spot = game.resolveWalkablePoint(
        new (worker.position.constructor)(game.playerBase.position.x - 14, 0, game.playerBase.position.z)
      );
      worker.position.set(spot.x, game.groundHeightAt(spot), spot.z);
      game.work.setDemands([]);
      game.work.clearTask(worker);
    }
    await step(2);

    const refreshAll = async () => {
      game.baseStorage.lastSignature = '';
      game.hotbar.lastSignature = '';
      game.baseStorage.refresh();
      game.hotbar.refresh();
      await step(1);
    };
    const clearItems = () => { inventory.loadSlots([]); hotbar.loadSlots([]); };
    // 可招募的中立单位只在"击破刷怪点"时生成（需求：不默认到处都有），
    // 所以要用招募令就得先打掉一个点位。
    const ensureNeutrals = async (wanted) => {
      const alive = () => (game.enemyUnits ?? []).filter((u) => u?.alive && u.isRecruitable);
      for (const point of (game.spawnPoints?.points ?? [])) {
        if (alive().length >= wanted) break;
        if (point.cleared) continue;
        game.spawnPoints.destroyPoint(point.id);
        await step(4);
      }
      return alive().length;
    };

    // ---- 1) 常驻 + 固定 9 格 + 一开始是空的容器 ----
    clearItems();
    await refreshAll();
    out.slotCount = slotEls().length;
    out.hotbarItemsLength = game.hotbarItems().length;
    out.hotbarStartsEmpty = game.hotbarItems().every((entry) => entry === null);
    out.emptySlotsHaveNoItem = slotEls().every((slot) => !slot.dataset.itemId);
    out.containerIsInventory = typeof hotbar?.slots?.length === 'number' && hotbar.slots.length === 9;
    out.modeWhileClosed = root()?.dataset.hotbarMode ?? null;
    out.hugsBottomMode = root()?.dataset.hotbarMode === 'use';

    // ---- 2) 背包开着：拖进去 = 存进快捷栏，且不触发使用 ----
    inventory.add('furnace', 3);
    await refreshAll();
    game.baseStorage.open();
    await step(2);
    out.modeWhileOpen = root()?.dataset.hotbarMode ?? null;
    const furnaceIndex = inventory.slots.findIndex((slot) => slot?.itemId === 'furnace');
    const baseSlotEl = document.querySelector(
      '#backpack .backpack-slot[data-backpack-container="base"][data-backpack-slot="' + furnaceIndex + '"]'
    );
    out.baseSlotFound = Boolean(baseSlotEl);
    tap(baseSlotEl);
    await step(1);
    out.cursorAfterPickUp = game.backpack.cursor?.itemId ?? null;
    out.baseFurnaceHeldNotInBag = inventory.countOf('furnace');
    tap(slotEls()[0]);
    await step(1);
    out.hotbarSlot0AfterTransfer = hotbar.slots[0]?.itemId ?? null;
    out.hotbarSlot0Count = hotbar.slots[0]?.count ?? 0;
    out.cursorEmptyAfterTransfer = game.backpack.cursor === null;
    out.baseEmptiedByTransfer = inventory.countOf('furnace');
    // 关键：搬运那一下绝不能进入放置模式
    out.notPlacingAfterTransfer = game.placingItem?.itemId ?? null;
    await refreshAll();
    out.slot0ShowsFurnace = slotEls()[0]?.dataset.itemId === 'furnace';
    out.slot0UseKind = slotEls()[0]?.dataset.hotbarUse ?? null;

    // ---- 3) 背包开着时点快捷栏 = 搬运，不是使用 ----
    tap(slotEls()[0]);
    await step(1);
    out.pickedUpFromHotbar = game.backpack.cursor?.itemId ?? null;
    out.hotbarSlot0WhileHeld = hotbar.slots[0]?.itemId ?? null;
    out.stillNotPlacing = game.isPlacing() === false;
    tap(slotEls()[0]);
    await step(1);
    out.putBackIntoSameSlot = hotbar.slots[0]?.itemId ?? null;
    out.cursorEmptyAgain = game.backpack.cursor === null;

    // 背包开着时"点击"（click 事件）也绝不能走使用
    click(slotEls()[0]);                  // pointerdown 拿起 + click 事件
    await step(1);
    out.clickWhileOpenStillContainer = game.isPlacing() === false;
    tap(slotEls()[0]);                    // 再点一下放回原格
    await step(1);
    await refreshAll();
    out.hotbarCountAfterPanelPlay = hotbar.countOf('furnace');

    // ---- 4) 背包关着：数字键进放置模式，预览跟鼠标走，右键取消 ----
    game.baseStorage.close();
    await refreshAll();
    out.modeAfterClose = root()?.dataset.hotbarMode ?? null;
    pressKey('1');
    await step(2);
    out.placingByKey = game.placingItem?.itemId ?? null;
    out.ghostExists = Boolean(game.placementGhost);
    out.ghostVisible = game.placementGhost?.visible === true;
    out.slot1MarkedActive = slotEls()[0]?.classList.contains('is-active') === true;

    const previewSpot = (dx, dz) => {
      const p = game.playerBase.position.clone();
      p.x += dx; p.z += dz;
      p.y = game.groundHeightAt(p);
      return p;
    };
    // 合法落点必须在"放置模式"下用 canPlaceAt 找（它读的就是 placingItem）。
    const SPOT_OFFSETS = [[5.2, -3.4], [6.5, 4.2], [-6, 5], [7, -6], [-5, -6], [8, 1], [0, 8], [-9, -3], [11, 4], [3, -9]];
    const findValidSpot = () => {
      for (const [dx, dz] of SPOT_OFFSETS) {
        const p = previewSpot(dx, dz);
        if (game.canPlaceAt(p).ok) return p;
      }
      return null;
    };
    const sA = game.worldToScreen(previewSpot(4, 4));
    const sB = game.worldToScreen(previewSpot(7, -2));
    game.canvas.dispatchEvent(pointer('pointermove', sA.x, sA.y));
    const ghostA = game.placementGhost ? game.placementGhost.position.clone() : null;
    game.canvas.dispatchEvent(pointer('pointermove', sB.x, sB.y));
    const ghostB = game.placementGhost ? game.placementGhost.position.clone() : null;
    out.previewFollowsPointer = Boolean(ghostA && ghostB)
      && Math.hypot(ghostA.x - ghostB.x, ghostA.z - ghostB.z) > 0.5;

    const beforeRightCancel = hotbar.countOf('furnace');
    game.canvas.dispatchEvent(pointer('pointerdown', sB.x, sB.y, 2));
    await step(2);
    out.rightClickCancelsPlacement = game.isPlacing() === false;
    out.nothingConsumedOnCancel = hotbar.countOf('furnace') === beforeRightCancel;
    out.ghostClearedOnCancel = !game.placementGhost;

    // ---- 5) 点击落地：扣的是快捷栏那一格，不是基地背包 ----
    inventory.add('furnace', 1);          // 基地里也放一个：扣错了就会露出来
    await step(1);
    const baseBeforePlace = inventory.countOf('furnace');
    const hbBeforePlace = hotbar.countOf('furnace');
    pressKey('1');
    await step(2);
    const spot = findValidSpot();
    out.spotFound = Boolean(spot);
    const buildingsBefore = new Set((game.friendlyUnits ?? []).filter((u) => u?.alive && u.isBuilding).map((u) => u.id));
    if (spot) {
      const s = game.worldToScreen(spot);
      game.canvas.dispatchEvent(pointer('pointerdown', s.x, s.y, 0));
      await step(4);
    }
    out.hotbarAfterPlace = hotbar.countOf('furnace');
    out.consumedFromHotbarSlot = hbBeforePlace - out.hotbarAfterPlace === 1;
    out.baseUntouchedByPlace = inventory.countOf('furnace') === baseBeforePlace;
    out.buildingAdded = (game.friendlyUnits ?? []).filter((u) => u?.alive && u.isBuilding && !buildingsBefore.has(u.id)).length === 1;
    out.placementClearedAfterBuild = game.isPlacing() === false;
    await refreshAll();

    // ---- 6) 消耗品：数字键直接使用（招募令 → 招募选中单位）----
    clearItems();
    hotbar.add('recruitmentOrder', 2);
    await refreshAll();
    out.consumeSlotUseKind = slotEls()[0]?.dataset.hotbarUse ?? null;
    // 先验"没有目标时不许白扣"：这是消耗品最容易写错的地方
    game.selectUnit(null);
    await step(1);
    const noTargetUse = game.useHotbarSlot(0);
    await step(1);
    out.consumeWithoutTargetRejected = noTargetUse?.ok === false;
    out.consumeWithoutTargetNotSpent = hotbar.countOf('recruitmentOrder') === 2;
    out.recruitableCount = await ensureNeutrals(1);
    const neutral = (game.enemyUnits ?? []).find((u) => u?.alive && u.isRecruitable) ?? null;
    out.neutralFound = Boolean(neutral);
    if (neutral) {
      const teamBefore = neutral.team;
      game.selectUnit(neutral);
      await step(2);
      pressKey('1');
      await step(2);
      out.ordersLeftAfterUse = hotbar.countOf('recruitmentOrder');
      out.neutralTeamChanged = neutral.team !== teamBefore;
      out.neutralRecruited = neutral.isRecruitable === false;
    }
    await refreshAll();

    // ---- 7) 消耗品拖出去松手 = 使用；落回快捷栏自己身上 = 反悔 ----
    clearItems();
    hotbar.add('recruitmentOrder', 1);     // 第 0 格
    out.recruitableCountB = await ensureNeutrals(1);
    const neutralB = (game.enemyUnits ?? []).find((u) => u?.alive && u.isRecruitable) ?? null;
    out.neutralBFound = Boolean(neutralB);
    if (neutralB) {
      const teamBefore = neutralB.team;
      game.selectUnit(neutralB);
      await step(2);
      const from = centerOf(slotEls()[0]);
      slotEls()[0].dispatchEvent(pointer('pointerdown', from.x, from.y));
      // 先拖到快捷栏外面（同一个 y 往左偏 200px 即可）
      window.dispatchEvent(pointer('pointermove', from.x - 260, from.y));
      out.dragGhostShown = Boolean(document.querySelector('.item-hotbar-drag-ghost'));
      window.dispatchEvent(pointer('pointerup', from.x - 260, from.y));
      await step(2);
      out.ordersLeftAfterDragUse = hotbar.countOf('recruitmentOrder');
      out.draggedConsumableUsed = neutralB.team !== teamBefore && neutralB.isRecruitable === false;
      out.dragGhostCleared = !document.querySelector('.item-hotbar-drag-ghost');
    }

    // 落回自己身上：不消耗
    clearItems();
    hotbar.add('recruitmentOrder', 1);
    await refreshAll();
    const selfFrom = centerOf(slotEls()[0]);
    const selfTo = centerOf(slotEls()[4]);
    slotEls()[0].dispatchEvent(pointer('pointerdown', selfFrom.x, selfFrom.y));
    window.dispatchEvent(pointer('pointermove', selfTo.x, selfTo.y));
    window.dispatchEvent(pointer('pointerup', selfTo.x, selfTo.y));
    await step(2);
    out.selfDropKeepsItem = hotbar.countOf('recruitmentOrder') === 1;
    out.selfDropDidNotUse = game.isPlacing() === false;
    await refreshAll();

    // ---- 8) 材料放进快捷栏也不能用（不消耗、有说明）----
    clearItems();
    hotbar.add('wood', 50);
    await refreshAll();
    out.materialSlotUseKind = slotEls()[0]?.dataset.hotbarUse ?? null;
    const woodUse = game.useHotbarSlot(0);
    await step(1);
    out.materialUseRejected = woodUse?.ok === false && woodUse?.reason === 'not_usable';
    out.materialNotConsumed = hotbar.countOf('wood') === 50;
    // 数字键同样不该消耗
    pressKey('1');
    await step(1);
    out.materialKeyNotConsumed = hotbar.countOf('wood') === 50 && game.isPlacing() === false;
    await refreshAll();

    // ---- 9) 装备：拖到单位身上仍然是"交给他" ----
    clearItems();
    hotbar.add('puppetCudgel', 1);
    await refreshAll();
    const bagOf = (unit) => game.itemBagFor(unit, { create: false });
    out.cudgelInBagBefore = bagOf(worker)?.countOf?.('puppetCudgel') ?? 0;
    if (worker) {
      const screen = game.worldToScreen(worker.position);
      const from = centerOf(slotEls()[0]);
      slotEls()[0].dispatchEvent(pointer('pointerdown', from.x, from.y));
      window.dispatchEvent(pointer('pointermove', (from.x + screen.x) / 2, (from.y + screen.y) / 2));
      window.dispatchEvent(pointer('pointermove', screen.x, screen.y));
      out.dropTargetLabel = root()?.dataset.dropTarget ?? null;
      window.dispatchEvent(pointer('pointerup', screen.x, screen.y));
      await step(2);
    }
    out.cudgelInBagAfterDrag = bagOf(worker)?.countOf?.('puppetCudgel') ?? 0;
    out.cudgelLeftHotbar = hotbar.countOf('puppetCudgel');
    await refreshAll();

    // ---- 10) 建筑拖到地上直接建起来 ----
    clearItems();
    hotbar.add('furnace', 1);
    await refreshAll();
    const buildBefore = new Set((game.friendlyUnits ?? []).filter((u) => u?.alive && u.isBuilding).map((u) => u.id));
    // 拖拽落点用的是"指针射到地面的真实交点"，和 worldToScreen 会有偏差，
    // 所以先借放置模式问一次"哪里能放"，再取消、按那个位置拖过去。
    game.beginPlacement('furnace', { source: { inventory: hotbar, slotIndex: 0 } });
    const placeSpot = findValidSpot();
    game.cancelPlacement();
    await step(1);
    out.dragSpotFound = Boolean(placeSpot);
    const dragFrom = centerOf(slotEls()[0]);
    const dragTo = game.worldToScreen(placeSpot ?? previewSpot(5.2, -3.4));
    slotEls()[0].dispatchEvent(pointer('pointerdown', dragFrom.x, dragFrom.y));
    window.dispatchEvent(pointer('pointermove', (dragFrom.x + dragTo.x) / 2, (dragFrom.y + dragTo.y) / 2));
    // 建筑拖出去就应该已经进入放置模式（预览跟着指针走），而不是等松手才建
    out.dragEntersPlacement = game.placingItem?.itemId ?? null;
    out.dragGhostShownForBuilding = Boolean(document.querySelector('.item-hotbar-drag-ghost'));
    window.dispatchEvent(pointer('pointermove', dragTo.x, dragTo.y));
    window.dispatchEvent(pointer('pointerup', dragTo.x, dragTo.y));
    await step(4);
    out.dragBuildConsumed = hotbar.countOf('furnace') === 0;
    out.dragBuildAdded = (game.friendlyUnits ?? []).filter((u) => u?.alive && u.isBuilding && !buildBefore.has(u.id)).length === 1;
    out.dragBuildClearedPlacement = game.isPlacing() === false;
    await refreshAll();

    // ---- 11) 位置真的在屏幕下方 ----
    const rect = root()?.getBoundingClientRect?.() ?? null;
    out.hotbarRect = rect
      ? { top: Math.round(rect.top), bottom: Math.round(rect.bottom), left: Math.round(rect.left), right: Math.round(rect.right) }
      : null;
    out.hotbarInsideViewport = Boolean(rect)
      && rect.left >= -1 && rect.right <= window.innerWidth + 1
      && rect.top >= 0 && rect.bottom <= window.innerHeight + 1;
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

  mkdirSync('outputs', { recursive: true });
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
}

const r = report.result;
report.verdict = r && !r.error ? {
  booted: true,
  // 1) 固定 9 格的空容器
  nineSlotContainer: r.slotCount === 9
    && r.hotbarItemsLength === 9
    && r.hotbarStartsEmpty === true
    && r.emptySlotsHaveNoItem === true
    && r.containerIsInventory === true,
  // 2) 背包开着 = 搬运，且不触发使用
  transferStoresIntoHotbar: r.baseSlotFound === true
    && r.cursorAfterPickUp === 'furnace'
    && r.baseFurnaceHeldNotInBag === 0
    && r.hotbarSlot0AfterTransfer === 'furnace'
    && r.hotbarSlot0Count === 3
    && r.cursorEmptyAfterTransfer === true
    && r.baseEmptiedByTransfer === 0
    && r.slot0ShowsFurnace === true
    && r.slot0UseKind === 'place',
  transferIsNotUse: r.modeWhileOpen === 'transfer'
    && r.notPlacingAfterTransfer === null
    && r.modeWhileClosed === 'use',
  // 3) 背包开着时点格子 = 拿起/放下
  transferRoundTrip: r.pickedUpFromHotbar === 'furnace'
    && r.hotbarSlot0WhileHeld === null
    && r.stillNotPlacing === true
    && r.putBackIntoSameSlot === 'furnace'
    && r.cursorEmptyAgain === true
    && r.clickWhileOpenStillContainer === true
    && r.hotbarCountAfterPanelPlay === 3,
  // 4) 关掉面板：数字键进放置模式，预览跟鼠标，右键取消
  keyEntersPlacement: r.modeAfterClose === 'use'
    && r.placingByKey === 'furnace'
    && r.ghostExists === true
    && r.ghostVisible === true
    && r.slot1MarkedActive === true,
  previewFollowsPointer: r.previewFollowsPointer === true,
  rightClickCancels: r.rightClickCancelsPlacement === true
    && r.nothingConsumedOnCancel === true
    && r.ghostClearedOnCancel === true,
  // 5) 落地扣的是快捷栏那一格
  placeConsumesFromSlot: r.spotFound === true
    && r.consumedFromHotbarSlot === true
    && r.baseUntouchedByPlace === true
    && r.buildingAdded === true
    && r.placementClearedAfterBuild === true,
  // 6) 消耗品：数字键直接用掉
  consumableByKey: r.consumeSlotUseKind === 'consume'
    && r.consumeWithoutTargetRejected === true
    && r.consumeWithoutTargetNotSpent === true
    && r.neutralFound === true
    && r.ordersLeftAfterUse === 1
    && r.neutralTeamChanged === true
    && r.neutralRecruited === true,
  // 7) 消耗品拖出去松手 = 使用；落回自己身上 = 反悔
  consumableByDrag: r.neutralBFound === true
    && r.dragGhostShown === true
    && r.draggedConsumableUsed === true
    && r.ordersLeftAfterDragUse === 0
    && r.dragGhostCleared === true,
  dragBackOntoBarIsUndone: r.selfDropKeepsItem === true && r.selfDropDidNotUse === true,
  // 8) 材料：能放进快捷栏，但不能用
  materialStoredButNotUsable: r.materialSlotUseKind === 'inert'
    && r.materialUseRejected === true
    && r.materialNotConsumed === true
    && r.materialKeyNotConsumed === true,
  // 9) 装备拖给单位
  dragGivesItemToUnit: r.cudgelInBagBefore === 0
    && r.cudgelInBagAfterDrag === 1
    && r.cudgelLeftHotbar === 0
    && typeof r.dropTargetLabel === 'string' && r.dropTargetLabel.length > 0,
  // 10) 建筑拖到地上直接建起来（拖动过程中就已经进入放置模式）
  dragBuildsOnGround: r.dragSpotFound === true
    && r.dragEntersPlacement === 'furnace'
    && r.dragGhostShownForBuilding === true
    && r.dragBuildConsumed === true
    && r.dragBuildAdded === true
    && r.dragBuildClearedPlacement === true,
  // 11) 位置
  hugsScreenBottom: r.hotbarInsideViewport === true
    && r.hugsScreenBottom === true
    && r.handZoneHiddenInSurvival === true,
  elapsedAdvanced: r.elapsedAdvanced === true
} : null;
console.log(JSON.stringify(report, null, 2));
const failedChecks = Object.entries(report.verdict ?? {})
  .filter(([, passed]) => passed !== true)
  .map(([key]) => key);
if (failedChecks.length) console.log(`FAILED CHECKS: ${failedChecks.join(', ')}`);
const ok = failedChecks.length === 0 && problems.length === 0;
console.log(ok ? '\nITEM HOTBAR: PASS' : '\nITEM HOTBAR: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
