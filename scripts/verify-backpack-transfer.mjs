// 跨容器搬运的端到端验收（需求第 2、3 条的核心链路）。
//
// 为什么单独一个脚本：统一背包面板合并了"符文背包"和"基地库存"两个界面之后，
// 面板一度只画**一块**网格（基地或某个单位），于是"把基地里那把手斧交给傀儡"
// 这条链路在 DOM 上没有任何落点——Game 层的原子接口还在，但玩家点不到。
// 现在单位视图同时画两块网格（单位背包 + 基地背包），这个脚本守的就是它：
//
//   1. 单位视图下必须真的有两块网格，且单位那块在前；
//   2. 点基地那块的物品 → 手上出现（.backpack-cursor-ghost）→ 点单位那块的空格 → 搬过去；
//   3. 实例类物品（工具/石头）搬过去之后 instanceId 不变（换个 ID 就是凭空复制一件）；
//   4. 符文石搬进单位背包后**附魔真的生效**，搬回基地后失效；
//   5. 魔力石搬进单位背包后**最大魔力真的 +15**，搬回基地后回落。
//
// 3/4/5 三条是"统一背包"这件事真正的价值：石头不再有两套身份，
// 进哪个背包就在哪生效，搬出来就立刻失效。
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

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
        if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    await step(8);
    game.pendingStrategyRewards = [];
    game.awaitingOpeningReward = false;
    if (game.strategyEvent) game.strategyEvent = null;
    if (game.strategyEventUi?.root) game.strategyEventUi.root.hidden = true;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
    await step(4);

    const panel = game.backpack;
    const worker = (game.friendlyUnits ?? []).find((u) => u?.alive && u.isWorker) ?? null;
    out.workerFound = Boolean(worker);
    if (!worker) return JSON.stringify({ ...out, error: 'no_worker' });
    const bag = game.itemBagFor(worker);
    out.bagCapacity = bag.capacity;

    // 打开单位的背包：这就是"点单位 → 扇形菜单 → 背包"走到的那个视图。
    panel.openForUnit(worker);
    panel.lastSignature = '';
    panel.refresh();
    await step(1);

    // ---- 1) 单位视图下必须有两块网格，单位那块在前 ----
    const blocks = () => [...document.querySelectorAll('#backpack [data-backpack-grid-block]')];
    out.blockKeys = blocks().map((b) => b.dataset.backpackGridBlock);
    out.twoGrids = out.blockKeys.length === 2
      && out.blockKeys[0] === 'unit' && out.blockKeys[1] === 'base';
    const cellsIn = (key) => [...document.querySelectorAll(
      '#backpack [data-backpack-grid="' + key + '"] [data-backpack-slot]'
    )];
    out.unitCellCount = cellsIn('unit').length;
    out.baseCellCount = cellsIn('base').length;
    out.baseIsFortyEight = out.baseCellCount === 48;
    out.unitCellsMatchCapacity = out.unitCellCount === bag.capacity;
    // 每格都要标出自己属于哪一块：否则"点基地那格、放单位那格"无从判断。
    out.everyCellTagged = [...cellsIn('unit'), ...cellsIn('base')]
      .every((cell) => cell.dataset.backpackContainer === 'unit' || cell.dataset.backpackContainer === 'base');

    // 准备：基地里放一把斧子（实例物品，用来验 instanceId 守恒）
    game.baseInventory.slots.fill(null);
    game.baseInventory.add('axe', 1);
    bag.slots.fill(null);
    panel.lastSignature = '';
    panel.refresh();
    await step(1);
    const axeIndex = game.baseInventory.slots.findIndex((s) => s?.itemId === 'axe');
    const axeInstanceId = game.baseInventory.slots[axeIndex]?.instanceId ?? null;
    out.axeInBase = axeIndex >= 0 && Boolean(axeInstanceId);
    out.baseShowsAxe = Boolean(
      document.querySelector('#backpack [data-backpack-grid="base"] [data-backpack-slot="' + axeIndex + '"].is-filled')
    );

    // ---- 2) 真实 pointerdown：点基地那块的斧子 → 上手 ----
    const down = (key, index) => {
      const cell = document.querySelector(
        '#backpack [data-backpack-grid="' + key + '"] [data-backpack-slot="' + index + '"]'
      );
      if (!cell) return false;
      cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
      return true;
    };
    out.clickedBaseAxe = down('base', axeIndex);
    await step(1);
    out.cursorAfterPick = panel.cursor ? panel.cursor.itemId : null;
    out.ghostAfterPick = Boolean(document.querySelector('.backpack-cursor-ghost'));
    out.axeLeftBaseOnPick = game.baseInventory.countOf('axe') === 0;

    // ---- 3) 点单位那块的空格 → 落到单位的背包 ----
    const unitEmpty = bag.slots.findIndex((s) => !s);
    out.clickedUnitEmpty = down('unit', unitEmpty);
    await step(1);
    out.axeInUnitBag = bag.countOf('axe') === 1;
    out.axeGoneFromBase = game.baseInventory.countOf('axe') === 0;
    out.cursorEmptyAfterDrop = panel.cursor === null;
    out.ghostGoneAfterDrop = !document.querySelector('.backpack-cursor-ghost');
    const movedSlot = bag.slots.find((s) => s?.itemId === 'axe') ?? null;
    out.instanceIdPreserved = Boolean(movedSlot) && movedSlot.instanceId === axeInstanceId;
    // 道具缓存必须跟着失效，否则"背包里明明有斧子，规划器还说缺工具"。
    // 这里刻意**不调用** refreshPack：直接读缓存，才能证明搬运真的通知了作业系统。
    const workRecord = game.work?.records?.get?.(worker.id) ?? null;
    out.packSeesAxe = Boolean(workRecord?.pack?.toolSet?.has?.('axe'));
    out.unitGridShowsAxe = Boolean(
      document.querySelector('#backpack [data-backpack-grid="unit"] [data-backpack-slot="' + unitEmpty + '"].is-filled')
    );

    // ---- 4) 反向：点单位那块的斧子 → 点基地那块的空格 → 收回基地 ----
    const baseEmpty = game.baseInventory.slots.findIndex((s) => !s);
    out.clickedUnitAxe = down('unit', unitEmpty);
    await step(1);
    out.reverseCursorHoldsAxe = panel.cursor?.itemId === 'axe';
    down('base', baseEmpty);
    await step(1);
    out.axeBackInBase = game.baseInventory.countOf('axe') === 1;
    out.unitBagEmptyAgain = bag.countOf('axe') === 0;
    out.reverseInstanceIdPreserved = (
      game.baseInventory.slots.find((s) => s?.itemId === 'axe')?.instanceId === axeInstanceId
    );

    // ---- 5) 符文石：搬进单位背包就生效，搬回基地就失效 ----
    game.baseInventory.slots.fill(null);
    bag.slots.fill(null);
    const created = game.runeStones.createEnchantmentStone({
      enchantmentId: 'fire',
      level: 2,
      playerId: game.localPlayerSlot
    });
    out.stoneCreated = created?.ok === true && game.baseInventory.countOf('runeStone') === 1;
    panel.lastSignature = '';
    panel.refresh();
    await step(1);
    out.enchantBefore = worker.enchantments?.has?.('fire') === true;
    const stoneIndex = game.baseInventory.slots.findIndex((s) => s?.itemId === 'runeStone');
    const stoneCell = document.querySelector(
      '#backpack [data-backpack-grid="base"] [data-backpack-slot="' + stoneIndex + '"]'
    );
    out.stoneCellIsRune = Boolean(stoneCell?.classList.contains('is-rune'));
    out.stoneCellLevel = stoneCell?.querySelector('.backpack-slot-level')?.textContent ?? null;
    out.stoneCellHasNoCount = !stoneCell?.querySelector('.backpack-slot-count');

    down('base', stoneIndex);
    await step(1);
    out.stoneOnCursor = panel.cursor?.itemId === 'runeStone';
    const stoneTarget = bag.slots.findIndex((s) => !s);
    down('unit', stoneTarget);
    await step(1);
    out.stoneInUnitBag = bag.countOf('runeStone') === 1;
    out.enchantAfterMove = worker.enchantments?.has?.('fire') === true;
    out.stoneCountedAsActive = game.runeStones.stonesForUnit(worker).length === 1;

    // 搬回基地 → 附魔必须立刻失效（不允许"已经不在背包里的石头还在给加成"）
    down('unit', stoneTarget);
    await step(1);
    const stoneBack = game.baseInventory.slots.findIndex((s) => !s);
    down('base', stoneBack);
    await step(1);
    out.stoneBackInBase = game.baseInventory.countOf('runeStone') === 1;
    out.enchantAfterReturn = worker.enchantments?.has?.('fire') === true;

    // ---- 6) 魔力石：搬进单位背包 → 最大魔力 +15；搬回 → 回落 ----
    game.baseInventory.slots.fill(null);
    bag.slots.fill(null);
    panel.lastSignature = '';
    panel.refresh();
    await step(1);
    game.refreshUnitManaCapacity(worker);
    out.baseManaCapacity = Math.round(worker.baseManaCapacity ?? worker.manaCapacity ?? 0);
    out.manaBefore = Math.round(worker.manaCapacity ?? 0);
    game.baseInventory.add('manaStone', 1);
    panel.lastSignature = '';
    panel.refresh();
    await step(1);
    const manaIndex = game.baseInventory.slots.findIndex((s) => s?.itemId === 'manaStone');
    out.manaCellIsMana = Boolean(
      document.querySelector('#backpack [data-backpack-grid="base"] [data-backpack-slot="' + manaIndex + '"]')
        ?.classList.contains('is-mana')
    );
    down('base', manaIndex);
    await step(1);
    const manaTarget = bag.slots.findIndex((s) => !s);
    down('unit', manaTarget);
    await step(1);
    out.manaStoneInUnitBag = bag.countOf('manaStone') === 1;
    out.manaAfter = Math.round(worker.manaCapacity ?? 0);
    out.manaRaised = out.manaAfter === out.manaBefore + 15;

    down('unit', manaTarget);
    await step(1);
    const manaBack = game.baseInventory.slots.findIndex((s) => !s);
    down('base', manaBack);
    await step(1);
    out.manaRestored = Math.round(worker.manaCapacity ?? 0) === out.manaBefore;

    // ---- 7) 累加：两块魔力石各占一格，加成叠加 ----
    game.baseInventory.slots.fill(null);
    bag.slots.fill(null);
    game.baseInventory.add('manaStone', 1);
    game.baseInventory.add('manaStone', 1);
    panel.lastSignature = '';
    panel.refresh();
    await step(1);
    out.twoManaSlots = game.baseInventory.slots.filter((s) => s?.itemId === 'manaStone').length === 2;
    const manaIdxA = game.baseInventory.slots.findIndex((s) => s?.itemId === 'manaStone');
    down('base', manaIdxA);
    await step(1);
    down('unit', bag.slots.findIndex((s) => !s));
    await step(1);
    const manaIdxB = game.baseInventory.slots.findIndex((s) => s?.itemId === 'manaStone');
    down('base', manaIdxB);
    await step(1);
    down('unit', bag.slots.findIndex((s) => !s));
    await step(1);
    out.twoInUnitBag = bag.countOf('manaStone') === 2;
    out.capacityStacks = Math.round(worker.manaCapacity ?? 0) === out.manaBefore + 30;

    // ---- 8) 关面板时手上还拿着东西 → 自动放回，不吞物品 ----
    game.baseInventory.slots.fill(null);
    bag.slots.fill(null);
    game.baseInventory.add('stone', 7);
    panel.lastSignature = '';
    panel.refresh();
    await step(1);
    const stoneIdx = game.baseInventory.slots.findIndex((s) => s?.itemId === 'stone');
    down('base', stoneIdx);
    await step(1);
    out.heldBeforeClose = panel.cursor?.count ?? 0;
    panel.close();
    await step(1);
    out.cursorEmptyAfterClose = panel.cursor === null;
    out.stoneReturnedOnClose = game.baseInventory.countOf('stone') === 7;

    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));
}

mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
if (report.started) {
  // 截图留档：单位视图下两块网格的样子（左边单位背包、左边下面是基地背包）。
  await ev(`(() => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const worker = (game.friendlyUnits ?? []).find((u) => u?.alive && u.isWorker) ?? null;
    if (worker && game.backpack) {
      game.baseInventory.add('wood', 40);
      game.baseInventory.add('stone', 25);
      game.baseInventory.add('manaStone', 1);
      game.backpack.openForUnit(worker);
      game.backpack.setTab('craft');
      game.backpack.lastSignature = '';
      game.backpack.refresh();
    }
    return true;
  })()`);
  await sleep(250);
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync('C:/WebProjects/WebVillageWar/outputs/verify-backpack-transfer.png', Buffer.from(shot.data, 'base64'));
}

const r = report.result;
report.verdict = r && !r.error ? {
  booted: true,
  unitViewHasTwoGrids: r.twoGrids === true
    && r.baseIsFortyEight === true
    && r.unitCellsMatchCapacity === true
    && r.everyCellTagged === true,
  baseItemVisibleAndPickable: r.axeInBase === true && r.baseShowsAxe === true
    && r.clickedBaseAxe === true
    && r.cursorAfterPick === 'axe'
    && r.ghostAfterPick === true
    && r.axeLeftBaseOnPick === true,
  dropsIntoUnitBag: r.clickedUnitEmpty === true && r.axeInUnitBag === true
    && r.axeGoneFromBase === true
    && r.cursorEmptyAfterDrop === true
    && r.ghostGoneAfterDrop === true
    && r.unitGridShowsAxe === true,
  instanceIdPreserved: r.instanceIdPreserved === true && r.reverseInstanceIdPreserved === true,
  packCacheNotified: r.packSeesAxe === true,
  reverseMoveWorks: r.clickedUnitAxe === true && r.reverseCursorHoldsAxe === true
    && r.axeBackInBase === true && r.unitBagEmptyAgain === true,
  runeStoneActivatesInUnitBag: r.stoneCreated === true
    && r.stoneCellIsRune === true
    && r.stoneCellLevel === '2'
    && r.stoneCellHasNoCount === true
    && r.stoneOnCursor === true
    && r.stoneInUnitBag === true
    && r.enchantBefore === false
    && r.enchantAfterMove === true
    && r.stoneCountedAsActive === true,
  runeStoneDeactivatesInBase: r.stoneBackInBase === true && r.enchantAfterReturn === false,
  manaStoneRaisesCapacity: r.manaCellIsMana === true
    && r.manaStoneInUnitBag === true
    && r.manaRaised === true
    && r.manaRestored === true,
  manaStoneStacks: r.twoManaSlots === true && r.twoInUnitBag === true && r.capacityStacks === true,
  closeReturnsHeldItem: r.heldBeforeClose === 7 && r.cursorEmptyAfterClose === true
    && r.stoneReturnedOnClose === true
} : null;

console.log(JSON.stringify(report, null, 2));
const ok = Object.values(report.verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nBACKPACK TRANSFER: PASS' : '\nBACKPACK TRANSFER: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
