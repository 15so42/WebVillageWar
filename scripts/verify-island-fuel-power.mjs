// 魔力炉（燃料供能）端到端验收。
//
// 这条链是：木材 → 木炭（熔炉）→ 魔力炉烧木炭 → 为**周围**的生产与战斗供能。
// 它也是方案第 9 节"整条链净产出为正"的闭环关键：在此之前木炭没有消费者。
//
// 最有价值的一条断言不是"魔力炉能供能"，而是：
//   **一座放在基地供能范围之外的熔炉，只有靠魔力炉才转得起来。**
// 为此整个场景都布置在基地半径之外：
//   1. 魔力炉放在基地范围外 → 放置必须成功（供能源豁免"附近要有供能"这条规则）；
//   2. 熔炉也放在基地范围外、但在魔力炉半径内 → 放置成功；
//   3. 关掉魔力炉的燃料 → 熔炉停摆（reason = no_power），证明它吃的就是魔力炉的电；
//   4. 补上燃料 → 熔炉恢复生产，同时木炭被烧掉。
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
    timeout: 600000
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
    // 清场（放过巢穴：全清会触发判胜、关卡结束、系统停止推进）
    (game.enemyUnits ?? []).slice().forEach((unit) => {
      if (!unit?.alive || unit.isSpawnPointNest || unit.isRecruitable) return;
      unit.alive = false;
      game.handleUnitDeath(unit, null);
    });
    (game.spawnPoints?.points ?? []).forEach((point) => { point.timer = 9999; });
    await step(4);

    // ---- 0) 启动路径：魔力炉的配方不能要求木炭 ----
    const manaRecipe = game.recipeStatus().find((entry) => entry.id === 'manaFurnace');
    out.manaRecipeListed = Boolean(manaRecipe);
    out.manaRecipeInputs = (manaRecipe?.inputs ?? []).map((entry) => entry.itemId);
    out.manaRecipeNeedsNoCharcoal = !(manaRecipe?.inputs ?? [])
      .some((entry) => entry.itemId === 'charcoal');

    // ---- 1) 找一个基地供能半径之外的落点 ----
    const baseSupplier = game.power.suppliers.get('player-base');
    out.baseRadius = baseSupplier?.supplyRadius ?? null;
    out.baseSupplyPerSecond = baseSupplier?.supplyPerSecond ?? null;
    out.maxRechargePerSecond = game.power.rules?.maxRechargePerSecond ?? null;
    const farSpot = (() => {
      const base = game.playerBase.position;
      for (let radius = (baseSupplier?.supplyRadius ?? 20) + 4; radius <= 50; radius += 1.5) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
          const x = base.x + Math.cos(angle) * radius;
          const z = base.z + Math.sin(angle) * radius;
          if (!game.world.isWalkable(x, z)) continue;
          const nearest = game.power.nearestSupplier(x, z);
          if (nearest && nearest.distance > nearest.supplier.supplyRadius) return { x, z };
        }
      }
      return null;
    })();
    out.farSpotFound = Boolean(farSpot);
    if (!farSpot) return JSON.stringify({ ...out, error: 'no_remote_spot' });
    out.farDistanceFromBase = Math.round(Math.hypot(
      farSpot.x - game.playerBase.position.x,
      farSpot.z - game.playerBase.position.z
    ) * 10) / 10;
    out.farSpotOutOfBaseRange = (() => {
      const nearest = game.power.nearestSupplier(farSpot.x, farSpot.z);
      return Boolean(nearest && nearest.distance > nearest.supplier.supplyRadius);
    })();

    // ---- 2) 材料 + 放置魔力炉（供能源豁免供能范围规则） ----
    game.baseInventory.slots.fill(null);
    game.baseInventory.add('stone', 120);
    game.baseInventory.add('wood', 120);
    game.baseInventory.add('iron', 40);
    game.baseInventory.add('charcoal', 12);
    game.baseInventory.add('manaFurnace', 1);
    game.baseInventory.add('furnace', 1);

    const beginMana = game.beginPlacement('manaFurnace');
    out.manaPlacementBegun = beginMana.ok === true;
    const manaCheck = game.canPlaceAt(farSpot);
    out.manaAcceptedOutsideBaseRange = manaCheck.ok === true;
    const placedMana = game.confirmPlacement(farSpot);
    out.manaPlaced = placedMana.ok === true;
    const manaUnit = placedMana.unit ?? null;
    out.manaIsPowerSource = manaUnit?.definition?.powerSource === true;
    out.manaBurnerRegistered = game.fuelPower.burners.has(manaUnit?.id) === true;
    const manaStatus0 = game.fuelPower.statusOf(manaUnit);
    out.manaSuppliedRadius = manaStatus0?.supplyRadius ?? null;
    out.manaSupplierRegistered = [...game.power.suppliers.keys()]
      .some((key) => key === 'fuel-power:' + manaUnit?.id);

    // 熔炉放在基地范围外、但落在魔力炉半径内
    const furnaceSpot = (() => {
      for (let radius = 4; radius <= (manaStatus0?.supplyRadius ?? 16) - 1; radius += 1) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
          const x = farSpot.x + Math.cos(angle) * radius;
          const z = farSpot.z + Math.sin(angle) * radius;
          if (!game.world.isWalkable(x, z)) continue;
          const nearest = game.power.nearestSupplier(x, z);
          // 必须在魔力炉半径内，同时仍在基地半径外
          const toBase = Math.hypot(x - game.playerBase.position.x, z - game.playerBase.position.z);
          if (!nearest || nearest.supplier.id !== 'fuel-power:' + manaUnit.id) continue;
          if (toBase <= (baseSupplier?.supplyRadius ?? 20)) continue;
          return { x, z };
        }
      }
      return null;
    })();
    out.furnaceSpotFound = Boolean(furnaceSpot);
    if (!furnaceSpot) return JSON.stringify({ ...out, error: 'no_furnace_spot' });
    const beginFurnace = game.beginPlacement('furnace');
    out.furnacePlacementBegun = beginFurnace.ok === true;
    const furnaceCheck = game.canPlaceAt(furnaceSpot);
    out.furnaceAcceptedViaManaFurnace = furnaceCheck.ok === true
      && furnaceCheck.supplierId === 'fuel-power:' + manaUnit.id;
    const placedFurnace = game.confirmPlacement(furnaceSpot);
    out.furnacePlaced = placedFurnace.ok === true;
    const furnaceUnit = placedFurnace.unit ?? null;

    // ---- 3) 完全没有燃料：魔力炉不供能，远处熔炉的储备被耗干 ----
    // 这里要模拟的是"玩家手上一张木炭都没有"，而不是"把库存清一次"：
    // 远处熔炉自己会产木炭（2 个 / 8 秒），清一次它下一轮就补上、
    // 顺手把魔力炉喂活了——那个循环是自洽的，但会让这个阶段测不到东西。
    // 所以这一段的每 tick 都把木炭清掉。
    //
    // 另外：Inventory.remove 是**整笔成功或整笔失败**的，
    // remove('charcoal', 99) 在只有 16 个的时候会直接失败什么都不做。
    // 清空某个物品必须按实际数量来，不能随手写个大数字。
    const manaStation = () => game.stations.stationFor(manaUnit);
    const clearItem = (itemId) => {
      const have = game.baseInventory.countOf(itemId);
      return have > 0 ? game.baseInventory.remove(itemId, have) : { ok: true, removed: 0 };
    };
    const clearManaFuel = () => {
      const inv = manaStation()?.inventory;
      if (!inv) return { ok: true, removed: 0 };
      const have = inv.countOf('charcoal');
      return have > 0 ? inv.remove('charcoal', have) : { ok: true, removed: 0 };
    };
    const feedManaFuel = (count) => manaStation()?.inventory?.add?.('charcoal', count) ?? { ok: false };
    const stepWithNoCharcoal = async (n) => {
      for (let i = 0; i < n; i += 1) {
        game.tick();
        clearItem('charcoal');
        clearManaFuel();
        if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };
    clearItem('charcoal');
    clearManaFuel();
    game.baseInventory.add('wood', 120);
    out.charcoalAfterClear = game.baseInventory.countOf('charcoal');
    // 24 点储备 ÷ 2.4/秒 = 10 秒，跑 15 秒足够耗干
    await stepWithNoCharcoal(300);
    out.bothBuilt = manaUnit?.underConstruction !== true && furnaceUnit?.underConstruction !== true;
    const manaNoFuel = game.fuelPower.statusOf(manaUnit);
    out.manaInactiveWithoutFuel = manaNoFuel?.active === false && manaNoFuel?.supplyPerSecond === 0;
    out.manaReasonNoFuel = manaNoFuel?.reason ?? null;
    out.remoteManaWithoutFuel = Math.round((furnaceUnit?.activityMana ?? 0) * 100) / 100;
    out.furnaceReasonWithoutFuel = game.production.statusOf(furnaceUnit)?.reason ?? null;

    // ---- 4) 补上燃料：木炭进魔力炉单格 → 燃烧充魔后放电 → 远处熔炉恢复生产 ----
    feedManaFuel(12);
    await step(200);   // 10 秒模拟：至少完成 1 个 8 秒燃烧周期并充入魔力
    const manaWithFuel = game.fuelPower.statusOf(manaUnit);
    out.manaStoredWithFuel = manaWithFuel?.manaStored ?? 0;
    out.manaActiveWithFuel = manaWithFuel?.active === true
      && (manaWithFuel?.supplyPerSecond ?? 0) > 0
      && (manaWithFuel?.manaStored ?? 0) > 0;
    const woodBefore = game.baseInventory.countOf('wood');
    await step(600);   // 30 秒模拟时间
    const woodAfter = game.baseInventory.countOf('wood');
    out.woodConsumed = woodBefore - woodAfter;
    out.furnaceProduced = out.woodConsumed > 0;
    out.fuelBurned = game.fuelPower.stats.fuelBurned > 0;
    out.fuelBurnedTotal = game.fuelPower.stats.fuelBurned;
    out.productionCycles = game.production.stats.cycles;
    out.remoteManaWhileFueled = Math.round((furnaceUnit?.activityMana ?? 0) * 100) / 100;
    out.manaSupplyWhileFueled = game.fuelPower.statusOf(manaUnit)?.supplyPerSecond ?? 0;
    out.remoteFurnaceWorked = game.production.statusOf(furnaceUnit)?.reason === 'working'
      || out.woodConsumed > 0;

    // ---- 5) 燃料与木料都断掉：魔力炉断供 ----
    // 这里**不**断言远处熔炉的储备归零：没有木料它就不干活，不干活就不耗魔，
    // 储备自然停在满值——那是正确行为，不是 bug。"缺电会停摆"这条已经由第 3 阶段
    // （木料管够、唯独没燃料）证明过了，这里只验供能侧确实断了。
    clearItem('charcoal');
    clearManaFuel();
    clearItem('wood');
    await step(400);
    const manaAfterEmpty = game.fuelPower.statusOf(manaUnit);
    out.manaStopsWhenEmpty = manaAfterEmpty?.supplyPerSecond === 0
      && manaAfterEmpty?.active === false;
    out.remoteManaAfterEmpty = Math.round((furnaceUnit?.activityMana ?? 0) * 100) / 100;


    out.elapsedAdvanced = game.elapsedTime > 0;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));

  mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
  // 截图前把镜头挪到远处那一簇设施上：这段验收的重点是"基地够不到的魔力炉 + 熔炉"，
  // 镜头留在基地旁边只会拍到一堆跟本次验收无关的单位。
  await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    const burnerId = g.fuelPower.burners.keys().next().value;
    const unit = g.unitRegistry?.byId?.get?.(burnerId) ?? null;
    if (!unit?.position) return false;
    const p = unit.position;
    g.cameraTarget.set(p.x, p.y, p.z);
    g.camera.position.set(p.x + 16, p.y + 18, p.z + 16);
    g.camera.lookAt(p.x, p.y + 1, p.z);
    g.renderScene();
    return true;
  })()`);
  await sleep(200);
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync('C:/WebProjects/WebVillageWar/outputs/verify-island-fuel-power.png', Buffer.from(shot.data, 'base64'));
}

const r = report.result;
// 基地功率是平衡参数，不能写死历史数字：从游戏里的规则读，供能上限必须不超过它。
const BASE_SUPPLY_PER_SECOND = report.baseSupplyPerSecond ?? null;
report.verdict = r && !r.error ? {
  booted: true,
  // 启动路径：魔力炉不需要木炭
  manaRecipeNeedsNoCharcoal: r.manaRecipeListed === true && r.manaRecipeNeedsNoCharcoal === true,
  // 供能源豁免"附近要有供能"这条放置规则
  remoteSpotIsOutOfBaseRange: r.farSpotFound === true && r.farSpotOutOfBaseRange === true,
  manaFurnacePlacesRemotely: r.manaPlacementBegun === true
    && r.manaAcceptedOutsideBaseRange === true
    && r.manaPlaced === true
    && r.manaIsPowerSource === true,
  manaFurnaceRegistersSupplier: r.manaBurnerRegistered === true
    && r.manaSupplierRegistered === true
    && r.manaSuppliedRadius > 0,
  // 基地范围外的熔炉靠魔力炉才放得下
  remoteFurnacePlacesViaMana: r.furnaceSpotFound === true
    && r.furnacePlacementBegun === true
    && r.furnaceAcceptedViaManaFurnace === true
    && r.furnacePlaced === true
    && r.bothBuilt === true,
  // 没燃料 → 不供能；远处熔炉的储备被耗干、因缺电停摆
  // （这条证明它吃的就是魔力炉的电：基地够不到它，木料管够，唯独没有燃料）
  noFuelNoPower: r.manaInactiveWithoutFuel === true
    && r.manaReasonNoFuel === 'no_fuel'
    && r.remoteManaWithoutFuel === 0
    && r.furnaceReasonWithoutFuel === 'no_power',
  // 有燃料 → 供能 → 远处熔炉真的生产了
  fueledRemoteProduction: r.manaActiveWithFuel === true
    && r.fuelBurned === true
    && r.remoteFurnaceWorked === true
    && r.remoteManaWhileFueled > 0,
  // 燃料断掉 → 自动断供（远处熔炉那侧由第 3 阶段覆盖，见脚本内注释）
  stopsWhenFuelRunsOut: r.manaStopsWhenEmpty === true,
  elapsedAdvanced: r.elapsedAdvanced === true
} : null;
console.log(JSON.stringify(report, null, 2));
const ok = Object.values(report.verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nISLAND FUEL POWER: PASS' : '\nISLAND FUEL POWER: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
