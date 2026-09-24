// 放置建筑 + 生产设施端到端验收（方案第 9 节第一块）。
//
// 这条链是：合成熔炉 → 面板里点「放置」→ 地图上落地 → 设施按周期把木材烧成木炭。
// 验四件事：
//   1. 落地的位置必须合规：地面可走 + 在供能半径内，不合规**一件物品都不扣**；
//   2. 合规落地：扣 1 个熔炉、场景里多一座玩家建筑、登记成生产者；
//   3. 会生产：木材减少、木炭增加，且数量严格按配方（守恒）；
//   4. 缺料就停：不会凭空产出，也不会把进度清零。
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
    await step(8);
    game.pendingStrategyRewards = [];
    game.awaitingOpeningReward = false;
    if (game.strategyEvent) game.strategyEvent = null;
    if (game.strategyEventUi?.root) game.strategyEventUi.root.hidden = true;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
    await step(4);

    // 隔离：把场上会来打基地的敌人清掉再测生产。
    // 不是为了放水——生产链跟战斗无关，而基地附近会持续来怪，
    // 熔炉被顺手拆了之后 stall 断言会变成"在测一座已经没了的建筑"。
    //
    // **必须放过巢穴**：把所有巢穴也清掉就等于清空全部刷怪点，
    // 胜负判定会立刻判胜、关卡结束、系统停止推进——上一版就是这么把
    // 自己的测试搞成"建造永远完不成"的。中立可招募单位也留着（它们不参战）。
    let clearedEnemies = 0;
    (game.enemyUnits ?? []).slice().forEach((unit) => {
      if (!unit?.alive || unit.isSpawnPointNest || unit.isRecruitable) return;
      unit.alive = false;
      game.handleUnitDeath(unit, null);
      clearedEnemies += 1;
    });
    // 顺便把刷怪点的计时推到很后面，免得测试中途又冒出新敌人
    (game.spawnPoints?.points ?? []).forEach((point) => { point.timer = 9999; });
    out.clearedEnemies = clearedEnemies;
    await step(4);

    // ---- 1) 合成一座熔炉（材料由测试注入） ----
    game.baseInventory.slots.fill(null);
    game.baseInventory.add('wood', 200);
    game.baseInventory.add('stone', 60);
    game.toggleBaseStorage();
    game.baseStorage.lastSignature = '';
    game.baseStorage.refresh();
    await step(2);
    const card = document.querySelector('[data-recipe-id="furnace"]');
    out.furnaceRecipeListed = Boolean(card);
    // 新背包面板里配方本身就是按钮（[data-backpack-recipe]），直接点它即可。
    card?.click();
    // 产物跟鼠标走（需求第 3 条）：点一个空格把它放下。
    const furnaceEmptySlot = game.baseInventory.slots.findIndex((slot) => !slot);
    if (furnaceEmptySlot >= 0) game.baseStorage.handleSlotClick(furnaceEmptySlot);
    out.furnaceInBase = game.baseInventory.countOf('furnace');
    await step(1);

    // ---- 2) 点「放置」进入放置模式 ----
    game.baseStorage.lastSignature = '';
    game.baseStorage.refresh();
    const furnaceIndex = game.baseInventory.slots.findIndex((slot) => slot?.itemId === 'furnace');
    const placeButton = furnaceIndex >= 0
      ? document.querySelector('[data-backpack-slot="' + furnaceIndex + '"] [data-backpack-place]')
      : null;
    out.placeButtonFound = Boolean(placeButton);
    placeButton?.click();
    await step(1);
    out.placing = game.isPlacing() === true;
    out.panelClosedForPlacement = game.baseStorage.isOpen() === false;
    out.ghostInScene = Boolean(game.placementGhost);

    // ---- 3) 不合规的落点必须什么都不扣 ----
    // 远处：地面**可走**但离基地太远、拿不到供能。
    // 不能随手写一个坐标——岛外是海，那种点会因为"不可走"被拒，测不到供能这条规则。
    const farSpot = (() => {
      const base = game.playerBase.position;
      for (let radius = 24; radius <= 52; radius += 2) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
          const x = base.x + Math.cos(angle) * radius;
          const z = base.z + Math.sin(angle) * radius;
          if (!game.world.isWalkable(x, z)) continue;
          const supplier = game.power.nearestSupplier(x, z);
          if (supplier && supplier.distance > supplier.supplier.supplyRadius) return { x, z };
        }
      }
      return null;
    })();
    out.farSpotFound = Boolean(farSpot);
    if (farSpot) {
      const farCheck = game.canPlaceAt(farSpot);
      out.farRejected = farCheck.ok === false && farCheck.reason === 'no_power';
      out.farSpotWalkable = game.world.isWalkable(farSpot.x, farSpot.z) === true;
      const beforeFar = game.baseInventory.countOf('furnace');
      const farResult = game.confirmPlacement(farSpot);
      out.farConfirmRejected = farResult.ok === false;
      out.furnaceNotSpentOnReject = game.baseInventory.countOf('furnace') === beforeFar;
      out.stillPlacingAfterReject = game.isPlacing() === true;
    }

    // 障碍上：不可走
    const blockedSpot = (() => {
      // 找基地附近一个不可走但仍在供能半径内的格子
      for (let dx = -8; dx <= 8; dx += 1) {
        for (let dz = -8; dz <= 8; dz += 1) {
          const x = game.playerBase.position.x + dx;
          const z = game.playerBase.position.z + dz;
          if (game.world.isWalkable(x, z)) continue;
          if (!game.world.isWalkable(x, z)) return { x, z };
        }
      }
      return null;
    })();
    out.blockedSpotFound = Boolean(blockedSpot);
    if (blockedSpot) {
      const blockedCheck = game.canPlaceAt(blockedSpot);
      out.blockedRejected = blockedCheck.ok === false && blockedCheck.reason === 'blocked';
    }

    // ---- 4) 合规落点：扣物品、建建筑、登记生产者 ----
    const buildingsBefore = (game.friendlyUnits ?? []).filter((u) => u.type === 'furnace').length;
    const spot = game.playerBase.position.clone();
    spot.x += 5.5;
    spot.z += 1.5;
    const spotCheck = game.canPlaceAt(spot);
    out.validSpotAccepted = spotCheck.ok === true;
    const furnaceBefore = game.baseInventory.countOf('furnace');
    const placed = game.confirmPlacement(spot);
    out.placementOk = placed.ok === true;
    out.furnaceConsumed = game.baseInventory.countOf('furnace') === furnaceBefore - 1;
    out.placingCleared = game.isPlacing() === false;
    out.ghostCleared = !game.placementGhost;
    const furnaceUnit = placed.unit ?? null;
    out.furnaceUnitType = furnaceUnit?.type ?? null;
    out.furnaceIsBuilding = furnaceUnit?.isBuilding === true;
    out.furnaceInFriendlyList = (game.friendlyUnits ?? []).includes(furnaceUnit);
    out.furnaceOnWalkable = furnaceUnit
      ? game.world.isWalkable(furnaceUnit.position.x, furnaceUnit.position.z) === true
      : null;
    out.buildingsAfter = (game.friendlyUnits ?? []).filter((u) => u.type === 'furnace').length
      === buildingsBefore + 1;
    out.producerRegistered = game.production.producers.has(furnaceUnit?.id) === true;
    out.powerReceiverRegistered = game.power.receivers.has(furnaceUnit?.id) === true;

    // ---- 5) 建成之后开始生产：木材换木炭，数量严格按配方 ----
    // 建造需要时间，先把它走完
    await step(200);   // 10 秒模拟时间（建造 6 秒）
    out.built = furnaceUnit?.underConstruction !== true;
    const recipe = game.production.producers.get(furnaceUnit?.id)?.recipe ?? null;
    out.recipeInput = recipe?.input ?? null;
    out.recipeOutput = recipe?.output ?? null;
    out.recipeSeconds = recipe?.seconds ?? null;

    // 只留刚好够 5 次的木材，避免"跑了多久"影响账目
    game.baseInventory.slots.fill(null);
    game.baseInventory.add('wood', 20);
    await step(4);
    const woodBefore = game.baseInventory.countOf('wood');
    const charcoalBefore = game.baseInventory.countOf('charcoal');
    await step(400);   // 20 秒模拟时间，够 2 个周期（每 8 秒一次）
    const woodAfter = game.baseInventory.countOf('wood');
    const charcoalAfter = game.baseInventory.countOf('charcoal');
    out.woodConsumed = woodBefore - woodAfter;
    out.charcoalProduced = charcoalAfter - charcoalBefore;
    out.cycles = out.woodConsumed / (recipe?.input.count ?? 1);
    // 严格守恒：消耗的木材 = 周期数 × 每次投入，产出 = 周期数 × 每次产出
    out.ratioExact = out.woodConsumed > 0
      && out.woodConsumed % recipe.input.count === 0
      && out.charcoalProduced === (out.woodConsumed / recipe.input.count) * recipe.output.count;
    out.statusWhileWorking = game.production.statusOf(furnaceUnit)?.reason ?? null;

    // ---- 6) 缺料停摆：不凭空产出，进度保留 ----
    game.baseInventory.slots.fill(null);
    game.baseInventory.add('charcoal', 0);
    await step(60);
    const stalledStatus = game.production.statusOf(furnaceUnit);
    out.stalledReason = stalledStatus?.reason ?? null;
    out.stalledProgress = stalledStatus?.progress ?? null;
    const charcoalAtStall = game.baseInventory.countOf('charcoal');
    await step(200);   // 再跑 10 秒
    out.noOutputWithoutInput = game.baseInventory.countOf('charcoal') === charcoalAtStall;
    const afterStall = game.production.statusOf(furnaceUnit);
    out.progressKeptWhileStalled = Math.abs((afterStall?.progress ?? 0) - (stalledStatus?.progress ?? 0)) < 1e-6;

    // ---- 7) Esc 取消放置不扣物品 ----
    // 先补一个熔炉：前面那一个已经落地用掉了，库存是空的，
    // 空库存会被 beginPlacement 以 not_in_stock 直接拒掉，测不到"取消"。
    game.baseInventory.add('furnace', 1);
    const beginAgain = game.beginPlacement('furnace');
    out.placingAgain = game.isPlacing() === true && beginAgain.ok === true;
    const furnaceBeforeCancel = game.baseInventory.countOf('furnace');
    game.cancelPlacement();
    out.cancelWorks = game.isPlacing() === false && !game.placementGhost;
    out.cancelSpendsNothing = game.baseInventory.countOf('furnace') === furnaceBeforeCancel;

    out.elapsedAdvanced = game.elapsedTime > 0;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));

  mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync('C:/WebProjects/WebVillageWar/outputs/verify-island-production.png', Buffer.from(shot.data, 'base64'));
}

const r = report.result;
report.verdict = r && !r.error ? {
  booted: true,
  furnaceRecipeListed: r.furnaceRecipeListed === true,
  furnaceCrafted: r.furnaceInBase === 1,
  // 放置模式
  placeButtonWorks: r.placeButtonFound === true && r.placing === true && r.ghostInScene === true,
  panelClosesForPlacement: r.panelClosedForPlacement === true,
  // 不合规落点：一件物品都不扣，也不退出放置模式
  rejectsFarSpot: r.farSpotFound === true && r.farRejected === true
    && r.farSpotWalkable === true && r.farConfirmRejected === true,
  rejectsBlockedSpot: r.blockedSpotFound === true && r.blockedRejected === true,
  rejectSpendsNothing: r.furnaceNotSpentOnReject === true && r.stillPlacingAfterReject === true,
  // 合规落点
  placesValidSpot: r.validSpotAccepted === true && r.placementOk === true
    && r.furnaceConsumed === true && r.placingCleared === true && r.ghostCleared === true,
  buildingCreated: r.furnaceUnitType === 'furnace' && r.furnaceIsBuilding === true
    && r.furnaceInFriendlyList === true && r.furnaceOnWalkable === true && r.buildingsAfter === true,
  registeredAsProducer: r.producerRegistered === true && r.powerReceiverRegistered === true,
  // 生产
  buildsThenProduces: r.built === true && (r.cycles ?? 0) >= 2,
  productionIsExact: r.ratioExact === true,
  // 缺料停摆
  stallsWithoutInput: r.stalledReason === 'no_input'
    && r.noOutputWithoutInput === true
    && r.progressKeptWhileStalled === true,
  // 取消
  cancelSpendsNothing: r.placingAgain === true && r.cancelWorks === true && r.cancelSpendsNothing === true,
  elapsedAdvanced: r.elapsedAdvanced === true
} : null;
console.log(JSON.stringify(report, null, 2));
const ok = Object.values(report.verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nISLAND PRODUCTION: PASS' : '\nISLAND PRODUCTION: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
