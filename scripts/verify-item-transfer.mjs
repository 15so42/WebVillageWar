// 物品搬运（基地 ↔ 单位背包）端到端验收。
//
// 为什么这件事重要：合成出来的工具原本**没有任何办法送到傀儡手里**——
// 基地库存与单位背包之间没有搬运入口，所以"工具可制作"是句空话。
// 这个脚本验的就是这条链真的通了：
//   合成木斧 → 在面板里点一下交给傀儡 → 傀儡的工具缓存更新 → 它能去砍树。
//
// 顺带守两条容易错的：
//   1) 实例类物品搬运必须保持同一个 instanceId（换个 ID 就等于凭空复制一件）；
//   2) 搬运之后必须通知作业系统重算背包缓存，否则"背包里明明有斧子，规划器还说缺工具"。
import WebSocket from 'ws';
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

    // 打开面板，选中傀儡
    game.toggleBaseStorage();
    game.selectUnit(worker);
    game.baseStorage.lastSignature = '';
    game.baseStorage.refresh();
    await step(2);
    out.panelOpen = game.baseStorage.isOpen() === true;
    out.unitSectionTitle = document.querySelector('[data-storage-unit-title]')?.textContent ?? null;

    // ---- 1) 合成一把木斧（此时基地材料由测试注入），确认产物是实例 ----
    game.baseInventory.slots.fill(null);
    game.baseInventory.add('wood', 40);
    game.baseInventory.add('stone', 40);
    // 傀儡身上本来就有一套启动工具（斧+镐），先清空它，才能把"这把斧子"当成唯一变量：
    // 否则"它能砍树"可能只是启动工具在起作用，什么都证明不了。
    worker.workerInventory.slots.fill(null);
    game.work?.notifyInventoryChanged?.(worker);
    game.baseStorage.lastSignature = '';
    game.baseStorage.refresh();
    const axeCard = document.querySelector('[data-recipe-id="axe"]');
    out.axeRecipeListed = Boolean(axeCard);
    axeCard?.querySelector('[data-craft-recipe]')?.click();
    out.axeInBase = game.baseInventory.instancesOf('axe').length;
    const craftedAxeId = game.baseInventory.instancesOf('axe')[0]?.instanceId ?? null;
    out.axeInstanceId = craftedAxeId;
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

    // ---- 3) 点击基地里的木斧 → 交给傀儡 ----
    await step(1);
    game.baseStorage.lastSignature = '';
    game.baseStorage.refresh();
    const baseChips = [...document.querySelectorAll('[data-storage-items] [data-move-from="base"]')];
    out.baseChipCount = baseChips.length;
    const axeChip = baseChips.find((chip) => chip.textContent.includes('木斧'));
    out.axeChipFound = Boolean(axeChip);
    axeChip?.click();
    await step(1);
    out.axeInBaseAfter = game.baseInventory.instancesOf('axe').length;
    out.workerAxeCount = (worker.workerInventory?.countsByItem?.() ?? {}).axe ?? 0;
    out.workerAxeInstanceId = worker.workerInventory?.instancesOf?.('axe')?.[0]?.instanceId ?? null;
    // 搬过去的必须是**同一件**：instanceId 一致，不是又造了一把
    out.instancePreserved = Boolean(craftedAxeId)
      && Boolean(worker.workerInventory?.findInstance?.(craftedAxeId));
    out.feedbackAfterMove = document.querySelector('[data-storage-feedback]')?.textContent ?? null;
    // 工具缓存必须被通知重算，否则规划器还当它没有工具
    const record = game.work?.records?.get?.(worker.id) ?? null;
    out.packRefreshWorks = record
      ? game.work.refreshPack(record).toolSet.has('axe')
      : null;

    // ---- 4) 有了这把斧子之后必须砍得动 ----
    if (treeNode) {
      const beforeWithTool = treeNode.amount;
      game.work.assignNode(worker, treeNode.id);
      await step(80);   // 4 秒模拟时间
      out.harvestedWithTool = treeNode.amount < beforeWithTool;
      out.workerAliveAfterHarvest = worker.alive === true;
      out.workerCarriedWood = (worker.workerInventory?.countsByItem?.() ?? {}).wood ?? 0;
    }

    // ---- 5) 点击单位背包里的东西 → 搬回基地 ----
    game.selectUnit(worker);
    game.baseStorage.lastSignature = '';
    game.baseStorage.refresh();
    await step(1);
    const unitChips = [...document.querySelectorAll('[data-storage-unit-items] [data-move-from="unit"]')];
    out.unitChipCount = unitChips.length;
    const woodChip = unitChips.find((chip) => chip.textContent.includes('木材'))
      ?? unitChips.find((chip) => chip.textContent.includes('木斧'));
    out.unitWoodChipFound = Boolean(woodChip);
    out.unitWoodChipLabel = woodChip?.textContent ?? null;
    const baseWoodBefore = game.baseInventory.countOf('wood');
    const axeOnWorkerBefore = (worker.workerInventory?.countsByItem?.() ?? {}).axe ?? 0;
    woodChip?.click();
    await step(1);
    out.baseWoodAfter = game.baseInventory.countOf('wood');
    out.axeOnWorkerAfter = (worker.workerInventory?.countsByItem?.() ?? {}).axe ?? 0;
    out.goodsMovedBack = woodChip
      ? (out.baseWoodAfter > baseWoodBefore || out.axeOnWorkerAfter < axeOnWorkerBefore)
      : false;

    // ---- 6) 战斗单位也有背包（方案第 4 节：可以把工具、武器和附魔石拖给单位） ----
    // 旧版本这里断言的是"战斗单位没有背包"——那是当时的限制，不是目标。
    // 现在战斗单位按需建背包，所以改成验它**能收东西**。
    const fighter = (game.friendlyUnits ?? []).find((u) => u?.alive && !u.isWorker && !u.isBuilding) ?? null;
    out.fighterFound = Boolean(fighter);
    if (fighter) {
      game.selectUnit(fighter);
      game.baseStorage.lastSignature = '';
      game.baseStorage.refresh();
      await step(1);
      out.fighterBagCreated = Boolean(game.itemBagFor(fighter));
      out.fighterBagCapacity = game.itemBagFor(fighter)?.capacity ?? null;
      out.fighterSectionText = document.querySelector('[data-storage-unit-count]')?.textContent ?? null;
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

    // 截图前回到"傀儡 + 背包里有东西"的状态，让面板三段都非空
    game.selectUnit(worker);
    game.baseInventory.add('wood', 30, { allowPartial: true });
    game.baseStorage.lastSignature = '';
    game.baseStorage.refresh();
    await step(1);
    out.screenshotState = {
      unitTitle: document.querySelector('[data-storage-unit-title]')?.textContent ?? null,
      baseChips: document.querySelectorAll('[data-storage-items] [data-move-from="base"]').length,
      unitChips: document.querySelectorAll('[data-storage-unit-items] [data-move-from="unit"]').length
    };
    // 面板必须整体落在视口内。切到「合成」段再看最后一条配方的按钮：
    // 面板现在是标签页，没被选中的那一段是 hidden，按钮的矩形是 0×0，
    // 不切过去就断言"够不着"是在测一个玩家根本不会遇到的状态。
    document.querySelector('[data-storage-tab="craft"]')?.click();
    await step(1);
    const panelRect = document.querySelector('#base-storage')?.getBoundingClientRect?.() ?? null;
    out.panelFitsViewport = Boolean(panelRect)
      && panelRect.top >= -1
      && panelRect.bottom <= window.innerHeight + 1;
    out.panelRect = panelRect
      ? { top: Math.round(panelRect.top), bottom: Math.round(panelRect.bottom), viewport: window.innerHeight }
      : null;
    // 最后一条配方的合成按钮必须够得着。列表是可滚动的，所以判据是
    // "滚进视野后落在面板内"，不是"不滚动就能看见"——后者对长列表是错的要求。
    const craftButtons = [...document.querySelectorAll('[data-craft-recipe]')];
    const lastCraft = craftButtons[craftButtons.length - 1] ?? null;
    const body = document.querySelector('#base-storage .base-storage-body');
    out.bodyScrollable = Boolean(body) && body.scrollHeight > body.clientHeight;
    lastCraft?.scrollIntoView?.({ block: 'nearest' });
    const craftRect = lastCraft?.getBoundingClientRect?.() ?? null;
    out.lastCraftReachable = Boolean(craftRect) && Boolean(panelRect)
      && craftRect.top >= panelRect.top - 1
      && craftRect.bottom <= panelRect.bottom + 1;
    // 断言完把列表滚回顶部，截图看的是完整面板
    if (body) body.scrollTop = 0;

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
  // 合成工具
  axeRecipeListed: r.axeRecipeListed === true,
  axeCraftedAsInstance: r.axeInBase === 1 && Boolean(r.axeInstanceId),
  // 先把傀儡清空，确认"没有工具就砍不动"——不然下面的"砍得动"什么都证明不了
  cleanWorkerCannotHarvest: r.workerToolsBefore === 0
    && r.harvestedWithoutTool === false
    && r.workerAliveAfterNoTool === true,
  // 基地 → 单位
  baseShowsMovableChips: (r.baseChipCount ?? 0) > 0 && r.axeChipFound === true,
  axeMovedToWorker: r.axeInBaseAfter === 0 && r.workerAxeCount === 1,
  instanceIdPreserved: r.instancePreserved === true,
  moveShowsFeedback: String(r.feedbackAfterMove ?? '').includes('已把'),
  packCacheNotified: r.packRefreshWorks === true,
  // 傀儡据此真的能干活（工具是唯一变量）
  workerHarvestsWithTool: r.harvestedWithTool === true
    && r.workerAliveAfterHarvest === true
    && r.workerCarriedWood > 0,
  // 单位 → 基地
  unitShowsChips: (r.unitChipCount ?? 0) > 0 && r.unitWoodChipFound === true,
  goodsMovedBack: r.goodsMovedBack === true,
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
  // 面板整体在视口内，最后一条配方的按钮够得着（切到合成段后滚动可达即可）
  panelFitsViewport: r.panelFitsViewport === true,
  lastCraftReachable: r.lastCraftReachable === true
} : null;
console.log(JSON.stringify(report, null, 2));
const ok = Object.values(report.verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nITEM TRANSFER: PASS' : '\nITEM TRANSFER: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
