// 物品搬运（基地 ↔ 单位背包）端到端验收。
//
// 为什么这件事重要：合成出来的工具原本**没有任何办法送到傀儡手里**——
// 基地库存与单位背包之间没有搬运入口，所以"工具可制作"是句空话。
// 这个脚本验的就是这条链真的通了：
//   合成木斧 → 交给傀儡 → 傀儡的工具缓存更新 → 它能去砍树。
//
// 顺带守两条容易错的：
//   1) 实例类物品搬运必须保持同一个 instanceId（换个 ID 就等于凭空复制一件）；
//   2) 搬运之后必须通知作业系统重算背包缓存，否则"背包里明明有斧子，规划器还说缺工具"。
//
// 统一背包面板（v0.2.196）之后，单位视图同时画两块网格（单位背包 + 基地背包），
// 跨容器搬运仍然可以点出来。本脚本的重心是**这条链的后果**——
// 工具到了傀儡手里之后它能砍树、缓存会失效、instanceId 不变；
// 而"两块网格之间点击互搬"这个界面路径由 `verify-backpack-transfer.mjs` 专门守着。
// 所以这里那一步走 Game 的原子入口（`transferBaseSlotToUnit` / `transferUnitSlotToBase`），
// 再把面板切到对应视图，断言面板里真的画出了那件东西。
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

    const worker = (game.friendlyUnits ?? []).find((u) => u?.alive && u.isWorker) ?? null;
    out.workerFound = Boolean(worker);
    if (!worker) return JSON.stringify({ ...out, error: 'no_worker' });
    out.workerId = worker.id;

    // 统一背包面板：openBase() = B 键，openForUnit(unit) = E 键 / 单位菜单的「背包」。
    const panel = game.backpack;
    const openBase = async () => {
      if (!panel.isOpen() || panel.mode !== 'base') panel.openBase();
      panel.setTab('craft');
      panel.lastSignature = '';
      panel.refresh();
      await step(1);
    };
    const openUnit = async (unit) => {
      panel.openForUnit(unit);
      panel.setTab('craft');
      panel.lastSignature = '';
      panel.refresh();
      await step(1);
    };
    const cells = () => [...document.querySelectorAll('#backpack [data-backpack-grid] [data-backpack-slot]')];
    const filledCells = () => cells().filter((cell) => cell.classList.contains('is-filled'));
    // 格子的 title 就是悬浮提示（物品名开头），用它把 DOM 格子和库存物品对上。
    const cellTitled = (name) => cells().find((cell) => String(cell.title || '').startsWith(name)) ?? null;

    // ---- 1) 基地视图：合成木斧 —— 点配方 → 产物上手 → 点空格落下 ----
    await openBase();
    out.panelOpen = panel.isOpen() === true;
    out.baseGridTitle = document.querySelector('#backpack [data-backpack-grid-title]')?.textContent ?? null;
    game.baseInventory.slots.fill(null);
    game.baseInventory.add('wood', 40);
    game.baseInventory.add('stone', 40);
    // 傀儡身上本来就有一套启动工具（斧+镐），先清空它，才能把"这把斧子"当成唯一变量：
    // 否则"它能砍树"可能只是启动工具在起作用，什么都证明不了。
    worker.workerInventory.slots.fill(null);
    game.work?.notifyInventoryChanged?.(worker);
    panel.lastSignature = '';
    panel.refresh();
    await step(1);
    const axeTile = document.querySelector('[data-backpack-recipe="axe"]');
    out.axeRecipeListed = Boolean(axeTile);
    axeTile?.click();
    // 产物已经**离开基地背包跟到鼠标上**（需求第 3 条），而不是原地留在库存里
    out.cursorHoldsAxe = panel.cursor?.itemId === 'axe';
    out.cursorGhostInBody = Boolean(document.body.querySelector('.backpack-cursor-ghost'));
    out.axeLeftBaseWhileOnCursor = game.baseInventory.countOf('axe') === 0;
    const emptyForAxe = game.baseInventory.slots.findIndex((slot) => !slot);
    panel.handleSlotClick(emptyForAxe);
    await step(1);
    out.axeInBase = game.baseInventory.instancesOf('axe').length;
    const craftedAxeId = game.baseInventory.instancesOf('axe')[0]?.instanceId ?? null;
    out.axeInstanceId = craftedAxeId;
    out.cursorEmptiedAfterPlace = panel.cursor === null
      && !document.body.querySelector('.backpack-cursor-ghost');
    out.baseGridShowsAxe = Boolean(cellTitled('木斧'));
    out.workerToolsBefore = Object.keys(worker.workerInventory.countsByItem()).length;

    // ---- 2) 先证明"没有斧子就砍不动树" ----
    // 挑一棵离所有刷怪点都够远的树：贴到巢穴旁边测试会被敌人打死，
    // 而傀儡阵亡会把背包连同工具一起掉在地上（那正是死亡掉落功能），
    // 后面的断言就会变成在测一个已经死掉的单位。
    const points = game.spawnPoints?.points ?? [];
    const treeNode = game.resourceNodes.activeNodes()
      .filter((node) => ['oak', 'pine'].includes(node.definitionId) && node.amount > 0)
      .map((node) => ({
        node,
        clearance: Math.min(...points.map((p) => Math.hypot((p.x ?? 0) - node.x, (p.z ?? 0) - node.z)))
      }))
      .sort((a, b) => b.clearance - a.clearance)[0]?.node ?? null;
    out.treeNodeFound = Boolean(treeNode);
    out.treeNodeClearance = treeNode
      ? Math.round(Math.min(...points.map((p) => Math.hypot((p.x ?? 0) - treeNode.x, (p.z ?? 0) - treeNode.z))))
      : null;
    if (treeNode) {
      game.work.setDemands([]);
      worker.position.set(treeNode.x, worker.position.y, treeNode.z);
      const beforeNoTool = treeNode.amount;
      game.work.assignNode(worker, treeNode.id);
      await step(60);   // 3 秒模拟时间
      out.harvestedWithoutTool = treeNode.amount < beforeNoTool;
      out.workerAliveAfterNoTool = worker.alive === true;
    }

    // ---- 3) 基地 → 单位：把那把刚做出来的木斧交给傀儡 ----
    // 搬的是**同一件**：搬完立刻在面板里切到这个单位的背包，确认它画出来了。
    await step(1);
    await openBase();
    const axeSlotIndex = game.baseInventory.slots.findIndex((slot) => slot?.itemId === 'axe');
    out.axeSlotIndex = axeSlotIndex;
    const movedToUnit = axeSlotIndex >= 0 ? game.transferBaseSlotToUnit(axeSlotIndex, worker) : null;
    out.axeMovedToUnit = movedToUnit?.ok === true;
    await step(1);
    out.axeInBaseAfter = game.baseInventory.instancesOf('axe').length;
    out.workerAxeCount = (worker.workerInventory?.countsByItem?.() ?? {}).axe ?? 0;
    out.workerAxeInstanceId = worker.workerInventory?.instancesOf?.('axe')?.[0]?.instanceId ?? null;
    // 搬过去的必须是**同一件**：instanceId 一致，不是又造了一把
    out.instancePreserved = Boolean(craftedAxeId)
      && Boolean(worker.workerInventory?.findInstance?.(craftedAxeId));
    await openUnit(worker);
    out.unitGridTitle = document.querySelector('#backpack [data-backpack-grid-title]')?.textContent ?? null;
    out.unitGridShowsAxe = Boolean(cellTitled('木斧'));
    // 木斧是工具不是武器，所以它没有「装备」按钮（那是单位视图里武器格才有的动作）；
    // 这里只要求格子画出了物品美术，证明面板真的渲染了这个单位的背包。
    const workerAxeSlot = worker.workerInventory.slots.findIndex((slot) => slot?.itemId === 'axe');
    out.unitGridAxeHasArt = workerAxeSlot >= 0
      && Boolean(document.querySelector('#backpack [data-backpack-slot="' + workerAxeSlot + '"] svg'));
    // 工具缓存必须被通知重算，否则规划器还当它没有工具
    const record = game.work?.records?.get?.(worker.id) ?? null;
    out.packRefreshWorks = record
      ? game.work.refreshPack(record).toolSet.has('axe')
      : null;

    // ---- 4) 有了这把斧子之后必须砍得动 ----
    if (treeNode) {
      const beforeWithTool = treeNode.amount;
      game.work.setDemands([]);
      game.work.assignNode(worker, treeNode.id);
      await step(80);   // 4 秒模拟时间
      out.harvestedWithTool = treeNode.amount < beforeWithTool;
      out.workerAliveAfterHarvest = worker.alive === true;
      out.workerCarriedWood = (worker.workerInventory?.countsByItem?.() ?? {}).wood ?? 0;
    }

    // ---- 5) 单位 → 基地：把傀儡背回来的木材收回基地，面板要少一格 ----
    await openUnit(worker);
    await step(1);
    const unitWoodSlot = worker.workerInventory.slots.findIndex((slot) => slot?.itemId === 'wood');
    out.unitWoodSlot = unitWoodSlot;
    out.unitFilledCellsBeforeMove = filledCells().length;
    const baseWoodBefore = game.baseInventory.countOf('wood');
    const axeOnWorkerBefore = (worker.workerInventory?.countsByItem?.() ?? {}).axe ?? 0;
    const movedBack = unitWoodSlot >= 0 ? game.transferUnitSlotToBase(unitWoodSlot, worker) : null;
    out.movedBackOk = movedBack?.ok === true;
    await step(1);
    panel.lastSignature = '';
    panel.refresh();
    out.baseWoodAfter = game.baseInventory.countOf('wood');
    out.axeOnWorkerAfter = (worker.workerInventory?.countsByItem?.() ?? {}).axe ?? 0;
    out.unitFilledCellsAfterMove = filledCells().length;
    out.goodsMovedBack = unitWoodSlot >= 0
      && (out.baseWoodAfter > baseWoodBefore || out.axeOnWorkerAfter < axeOnWorkerBefore);

    // ---- 6) 战斗单位也有背包（方案第 4 节：可以把工具、武器和附魔石拖给单位） ----
    // 旧版本这里断言的是"战斗单位没有背包"——那是当时的限制，不是目标。
    // 现在战斗单位按需建背包，所以改成验它**能收东西**。
    //
    // ⚠️ 战斗单位必须**自己造一个**：用户已要求「玩家一开始没有任何战斗单位」，
    // 开局只有一支木傀儡。早期版本靠"出生护卫"拿到蛮兵，那条路已经没有了。
    // 这里直接走 summonUnits（招募/生产的最终入口也是它），
    // 测的是"战斗单位的背包"，与"它从哪来"无关。
    game.summonUnits('raider', 1, game.playerBase.position.clone().add({ x: 4.2, y: 0, z: 4.0 }), 0.7, { select: false });
    const fighter = (game.friendlyUnits ?? []).find((u) => u?.alive && !u.isWorker && !u.isBuilding) ?? null;
    out.fighterFound = Boolean(fighter);
    if (fighter) {
      game.selectUnit(fighter);
      await openUnit(fighter);
      out.fighterBagCreated = Boolean(game.itemBagFor(fighter));
      out.fighterBagCapacity = game.itemBagFor(fighter)?.capacity ?? null;
      out.fighterGridCells = cells().length;
      const slotIndex = game.baseInventory.slots.findIndex((slot) => slot);
      const direct = game.transferBaseSlotToUnit(slotIndex, fighter);
      out.fighterAcceptsItems = direct?.ok === true;
      out.fighterBagUsed = game.itemBagFor(fighter)?.usedSlots?.() ?? null;
    }

    // 不做单位的东西没有背包：基地（不是 UnitEntity）与建筑都要明确拒绝
    const buildingBag = game.itemBagFor(game.playerBase);
    out.buildingHasNoBag = buildingBag === null;
    out.baseIsUnit = Boolean(game.playerBase?.definition);
    const buildingTransfer = game.transferBaseSlotToUnit(0, game.playerBase);
    out.buildingTransferRejected = buildingTransfer?.ok === false
      && buildingTransfer.reason === 'unit_has_no_bag';
    out.buildingTransferReason = buildingTransfer?.reason ?? null;
    // 建筑（有 definition 但 isBuilding）同样不该拿到背包
    out.realBuildingHasNoBag = game.itemBagFor({
      id: 'synthetic-building',
      isBuilding: true,
      definition: { canMove: false }
    }) === null;

    // 截图前回到"傀儡 + 背包里有东西"的状态
    game.selectUnit(worker);
    game.baseInventory.add('wood', 30, { allowPartial: true });
    await openUnit(worker);
    out.screenshotState = {
      gridTitle: document.querySelector('#backpack [data-backpack-grid-title]')?.textContent ?? null,
      filledCells: filledCells().length,
      unitCells: cells().length
    };
    document.querySelector('[data-backpack-tab="craft"]')?.click();
    await step(1);
    // 面板必须整体落在视口内（量的是 .backpack-panel：外层 #backpack 是 inset:0 的全屏遮罩）
    const panelRect = document.querySelector('#backpack .backpack-panel')?.getBoundingClientRect?.() ?? null;
    out.panelFitsViewport = Boolean(panelRect)
      && panelRect.top >= -1
      && panelRect.bottom <= window.innerHeight + 1
      && panelRect.left >= -1
      && panelRect.right <= window.innerWidth + 1;
    out.panelRect = panelRect
      ? {
        top: Math.round(panelRect.top),
        bottom: Math.round(panelRect.bottom),
        left: Math.round(panelRect.left),
        right: Math.round(panelRect.right),
        viewport: [window.innerWidth, window.innerHeight]
      }
      : null;
    // 最后一条配方的入口必须够得着。配方区是可滚动的，所以判据是
    // "滚进视野后落在面板内"，不是"不滚动就能看见"——后者对长列表是错的要求。
    const recipePane = document.querySelector('#backpack [data-backpack-recipes]');
    const craftTiles = [...document.querySelectorAll('#backpack [data-backpack-recipe]')];
    const lastCraft = craftTiles[craftTiles.length - 1] ?? null;
    out.recipeTileCount = craftTiles.length;
    out.recipesScrollable = Boolean(recipePane) && recipePane.scrollHeight > recipePane.clientHeight;
    lastCraft?.scrollIntoView?.({ block: 'nearest' });
    const craftRect = lastCraft?.getBoundingClientRect?.() ?? null;
    out.lastCraftReachable = Boolean(craftRect) && Boolean(panelRect)
      && craftRect.top >= panelRect.top - 1
      && craftRect.bottom <= panelRect.bottom + 1;
    // 断言完把列表滚回顶部，截图看的是完整面板
    if (recipePane) recipePane.scrollTop = 0;

    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));

  mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync('C:/WebProjects/WebVillageWar/outputs/verify-item-transfer.png', Buffer.from(shot.data, 'base64'));
}

const r = report.result;
report.verdict = r && !r.error ? {
  booted: true,
  // 合成：点配方 → 产物上手（跟随光标）→ 点空格落回基地
  craftGoesThroughCursor: r.cursorHoldsAxe === true
    && r.cursorGhostInBody === true
    && r.axeLeftBaseWhileOnCursor === true
    && r.cursorEmptiedAfterPlace === true,
  axeRecipeListed: r.axeRecipeListed === true,
  axeCraftedAsInstance: r.axeInBase === 1 && Boolean(r.axeInstanceId),
  baseGridShowsCraftedAxe: r.baseGridShowsAxe === true,
  // 先把傀儡清空，确认"没有工具就砍不动"——不然下面的"砍得动"什么都证明不了
  cleanWorkerCannotHarvest: r.workerToolsBefore === 0
    && r.harvestedWithoutTool === false
    && r.workerAliveAfterNoTool === true,
  // 基地 → 单位
  axeMovedToWorker: r.axeMovedToUnit === true && r.axeInBaseAfter === 0 && r.workerAxeCount === 1,
  instanceIdPreserved: r.instancePreserved === true,
  // 面板真的画出这个单位的背包：标题 + 那把斧子的格子与美术
  panelShowsUnitBag: r.unitGridShowsAxe === true
    && r.unitGridAxeHasArt === true
    && String(r.unitGridTitle ?? '').includes('背包'),
  packCacheNotified: r.packRefreshWorks === true,
  // 傀儡据此真的能干活（工具是唯一变量）
  workerHarvestsWithTool: r.harvestedWithTool === true
    && r.workerAliveAfterHarvest === true
    && r.workerCarriedWood > 0,
  // 单位 → 基地
  unitShowsMovableGoods: r.unitWoodSlot >= 0 && r.movedBackOk === true,
  goodsMovedBack: r.goodsMovedBack === true
    && r.unitFilledCellsAfterMove < r.unitFilledCellsBeforeMove,
  // 战斗单位也有背包并真的能收东西；建筑没有背包时明确拒绝
  fighterHasBag: r.fighterFound === true
    && r.fighterBagCreated === true
    && r.fighterBagCapacity > 0
    && r.fighterAcceptsItems === true
    && r.fighterBagUsed > 0,
  buildingHasNoBag: r.buildingHasNoBag === true
    && r.baseIsUnit === false
    && r.buildingTransferRejected === true
    && r.realBuildingHasNoBag === true,
  // 面板整体在视口内，最后一条配方的入口够得着（滚动可达即可）
  panelFitsViewport: r.panelFitsViewport === true,
  lastCraftReachable: r.lastCraftReachable === true
} : null;
console.log(JSON.stringify(report, null, 2));
const ok = Object.values(report.verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nITEM TRANSFER: PASS' : '\nITEM TRANSFER: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
