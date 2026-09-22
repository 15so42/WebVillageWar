// 科技效果端到端验收：研究出来的东西必须真的改变已经在跑的设施与傀儡。
//
// 纯规则由 `test:research` 覆盖，这里验的是**接线**——两者都要过才算数：
//   1. 「高效烧炭」：先建好熔炉、跑一轮确认产出 2，再研究，**同一座熔炉**产出变 3。
//      顺序刻意做成"先建设施后研究"，因为玩家的实际顺序就是先建设施，
//      而"研究时重新解析已建设施的配方"正是最容易漏掉的一步。
//   2. 「采集效率」：傀儡一次采集动作取 5 → 研究后取 7（走真实作业链路，不是直接调 harvest）。
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
    timeout: 900000
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
    await step(8);
    game.pendingStrategyRewards = [];
    game.awaitingOpeningReward = false;
    if (game.strategyEvent) game.strategyEvent = null;
    if (game.strategyEventUi?.root) game.strategyEventUi.root.hidden = true;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
    // 清场时**必须放过巢穴**：全部刷怪点被清空会立刻判胜、关卡结束、
    // 系统停止推进，后面所有"建造没完成 / 找不到傀儡"的怪现象都是这个引起的。
    (game.enemyUnits ?? []).slice().forEach((unit) => {
      if (!unit?.alive || unit.isSpawnPointNest) return;
      unit.alive = false;
      game.handleUnitDeath(unit, null);
    });
    (game.spawnPoints?.points ?? []).forEach((point) => { point.timer = 9999; });
    game.work.setDemands([]);
    // 顺手把"下一步要放建筑的地方"清干净：被传送过来的敌人会拆掉施工中的建筑
    await step(4);

    const inventory = game.baseInventory;
    const clearItem = (itemId) => {
      const have = inventory.countOf(itemId);
      if (have > 0) inventory.remove(itemId, have);
    };
    const craftRecipe = (recipeId) => {
      game.baseStorage.open();
      game.baseStorage.setTab('craft');
      game.baseStorage.lastSignature = '';
      game.baseStorage.refresh();
      return document.querySelector('[data-craft-recipe="' + recipeId + '"]');
    };
    const place = async (itemId, offsetX, offsetZ, buildTicks = 200) => {
      craftRecipe(itemId)?.click();
      game.baseStorage.close();
      await step(1);
      game.beginPlacement(itemId);
      const spot = game.playerBase.position.clone();
      spot.x += offsetX;
      spot.z += offsetZ;
      const placed = game.confirmPlacement(spot);
      await step(buildTicks);
      return placed.unit ?? null;
    };

    // 记录：一开始科技一项都没研究
    out.techsAtStart = game.research.techStatus().map((tech) => tech.id);
    out.researchedAtStart = [...game.research.researched];

    // ---- 建熔炉，先按**没有科技**的状态跑一轮 ----
    inventory.slots.fill(null);
    inventory.add('wood', 200);
    inventory.add('stone', 300);
    inventory.add('fiber', 100);
    inventory.add('charcoal', 60);
    inventory.add('deepCore', 4);
    await step(2);
    const furnace = await place('furnace', 5.5, 1.5);
    out.furnacePlaced = Boolean(furnace);
    // 熔炉自身的供能：基地在 20 米内，够
    // 按**完成的周期数**驱动，而不是按固定秒数：固定秒数会被
    // "进来时进度已经攒了一半""这一段刚好只做了 0 个周期"这类时序问题搞成随机失败。
    const runCycles = async (minCycles) => {
      const cyclesStart = game.production.stats.cycles;
      const woodStart = inventory.countOf('wood');
      const charcoalStart = inventory.countOf('charcoal');
      let guard = 0;
      while (game.production.stats.cycles - cyclesStart < minCycles && guard < 1600) {
        await step(2);
        guard += 2;
      }
      const cycles = game.production.stats.cycles - cyclesStart;
      const woodUsed = woodStart - inventory.countOf('wood');
      const charcoalGained = inventory.countOf('charcoal') - charcoalStart;
      return {
        cycles,
        woodUsed,
        charcoalGained,
        inputPerCycle: cycles > 0 ? woodUsed / cycles : null,
        outputPerCycle: cycles > 0 ? charcoalGained / cycles : null
      };
    };

    inventory.slots.fill(null);
    inventory.add('wood', 200);
    await step(4);
    const baseRun = await runCycles(2);
    out.baseCycles = baseRun.cycles;
    out.baseOutputPerCycle = baseRun.outputPerCycle;
    out.baseInputPerCycle = baseRun.inputPerCycle;
    out.baseRecipeOutput = game.production.producers.get(furnace?.id)?.recipe?.output?.count ?? null;

    // ---- 建科研站并研究「高效烧炭」----
    inventory.add('wood', 200);
    inventory.add('stone', 300);
    inventory.add('charcoal', 60);
    await step(2);
    const station = await place('researchStation', -6.5, -3.5);
    out.stationPlaced = Boolean(station);
    out.stationReady = game.research.stationReady();
    const fuelTechCard = () => {
      game.baseStorage.open();
      game.baseStorage.setTab('tech');
      game.baseStorage.lastSignature = '';
      game.baseStorage.refresh();
      return document.querySelector('[data-tech-id="efficientFuel"]');
    };
    const card = fuelTechCard();
    out.efficientFuelListed = Boolean(card);
    out.efficientFuelEnabledBefore = card?.querySelector('[data-research-tech]')?.disabled === false;
    // 消耗要在**点击前后立刻**量，并把两侧库存都记下来：
    // 只记差值的话，一旦有别的来源在动这批货就查不出是哪边变了。
    const beforeClick = inventory.countsByItem();
    out.costShownByUi = (game.research.techStatus().find((tech) => tech.id === 'efficientFuel')?.cost ?? [])
      .map((entry) => entry.itemId + 'x' + entry.count);
    out.researchedBeforeClick = game.research.has('efficientFuel');
    card?.querySelector('[data-research-tech]')?.click();
    const afterClick = inventory.countsByItem();
    out.researchedAfterClick = game.research.has('efficientFuel');
    const delta = {};
    new Set([...Object.keys(beforeClick), ...Object.keys(afterClick)]).forEach((itemId) => {
      const change = (afterClick[itemId] ?? 0) - (beforeClick[itemId] ?? 0);
      if (change !== 0) delta[itemId] = change;
    });
    out.inventoryDeltaOnResearch = delta;
    out.charcoalSpent = (beforeClick.charcoal ?? 0) - (afterClick.charcoal ?? 0);
    await step(2);
    game.baseStorage.close();
    out.efficientFuelResearched = game.research.has('efficientFuel') === true;
    // 注意：这里**不要再**用"60 - 当前数量"重算消耗——
    // 熔炉一直在产木炭，那种算法量到的是"净变化"而不是"这次研究花了多少"。
    // 上面点击前后的差值才是准确的那一笔。
    // **关键**：已经建好的那座熔炉的配方要跟着变
    out.furnaceRecipeOutputAfter = game.production.producers.get(furnace?.id)?.recipe?.output?.count ?? null;

    // ---- 同一座熔炉再跑两个周期，产出应当是 3 ----
    inventory.slots.fill(null);
    inventory.add('wood', 200);
    await step(4);
    const techRun = await runCycles(2);
    out.techCycles = techRun.cycles;
    out.techOutputPerCycle = techRun.outputPerCycle;
    out.techInputPerCycle = techRun.inputPerCycle;

    // ---- 「采集效率」：走真实作业链路测一次采集动作 ----
    // 先量不加成的一次
    const worker = (game.friendlyUnits ?? []).find((unit) => unit?.alive && unit.isWorker) ?? null;
    out.workerFound = Boolean(worker);
    const ensureTools = (unit) => {
      const have = unit.workerInventory?.countsByItem?.() ?? {};
      ['axe', 'pickaxe'].forEach((tool) => {
        if (!have[tool]) unit.workerInventory?.add?.(tool, 1);
      });
      game.work?.notifyInventoryChanged?.(unit);
    };
    let harvestBefore = null;
    let harvestAfter = null;
    if (worker) {
      worker.controlMode = null;
      ensureTools(worker);
      const tree = game.resourceNodes.activeNodes().find((node) => (
        !node.released && (node.definitionId === 'oak' || node.definitionId === 'pine') && node.amount > 20
      )) ?? null;
      out.treeFound = Boolean(tree);
      if (tree) {
        const measureOneAction = async () => {
          worker.workerInventory.slots.fill(null);
          // 清背包之后必须**重新发工具**：第一版只在外层发过一次，
          // 结果每次测量前都把斧子清掉了，傀儡根本砍不动树（量出来是 0）。
          ensureTools(worker);
          game.work.notifyInventoryChanged(worker);
          worker.position.set(tree.x + 1.2, worker.position.y, tree.z + 1.2);
          const assigned = game.work.assignNode(worker, tree.id);
          const statsBefore = game.work.stats.harvestActions;
          let guard = 0;
          while (game.work.stats.harvestActions === statsBefore && guard < 300) {
            await step(1);
            guard += 1;
          }
          return {
            assigned: assigned === true,
            ticks: guard,
            carried: worker.workerInventory.countOf(tree.resource),
            error: game.work.records?.get?.(worker.id)?.lastError ?? null
          };
        };
        await step(20);
        const first = await measureOneAction();
        out.harvestBeforeDetail = first;
        harvestBefore = first.carried;
        out.harvestBefore = harvestBefore;
        // 研究采集效率
        inventory.add('wood', 100);
        inventory.add('fiber', 100);
        await step(2);
        const harvestCard = (() => {
          game.baseStorage.open();
          game.baseStorage.setTab('tech');
          game.baseStorage.lastSignature = '';
          game.baseStorage.refresh();
          return document.querySelector('[data-tech-id="harvesting"]');
        })();
        out.harvestingListed = Boolean(harvestCard);
        harvestCard?.querySelector('[data-research-tech]')?.click();
        await step(2);
        game.baseStorage.close();
        out.harvestingResearched = game.research.has('harvesting') === true;
        out.harvestBonus = game.research.harvestBonus();
        const second = await measureOneAction();
        out.harvestAfterDetail = second;
        harvestAfter = second.carried;
        out.harvestAfter = harvestAfter;
      }
    }

    out.stats = { ...game.production.stats };
    out.elapsedAdvanced = game.elapsedTime > 0;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));

  mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync('C:/WebProjects/WebVillageWar/outputs/verify-island-tech-effects.png', Buffer.from(shot.data, 'base64'));
}

const r = report.result;
report.verdict = r && !r.error ? {
  booted: true,
  startsWithoutTech: Array.isArray(r.researchedAtStart) && r.researchedAtStart.length === 0,
  // 1) 先建熔炉、按基础配方跑一轮
  baseFurnaceRuns: r.furnacePlaced === true
    && r.baseRecipeOutput === 2
    && r.baseOutputPerCycle === 2
    && r.baseCycles >= 1,
  // 2) 建科研站 → 研究高效烧炭
  researchStationBuilt: r.stationPlaced === true && r.stationReady === true,
  efficientFuelResearchable: r.efficientFuelListed === true
    && r.efficientFuelEnabledBefore === true
    && r.efficientFuelResearched === true
    && r.charcoalSpent === 20,
  // 3) **已经建好的**熔炉配方跟着变，再跑一轮产出 3
  existingFurnaceUpgraded: r.furnaceRecipeOutputAfter === 3
    && r.techOutputPerCycle === 3
    && r.techCycles >= 1,
  // 4) 采集效率走真实作业链路
  harvestTechWorks: r.workerFound === true && r.treeFound === true
    && r.harvestingListed === true
    && r.harvestingResearched === true
    && r.harvestBonus === 2
    && r.harvestBefore === 5
    && r.harvestAfter === 7,
  elapsedAdvanced: r.elapsedAdvanced === true
} : null;
console.log(JSON.stringify(report, null, 2));
const ok = report.verdict !== null
  && Object.values(report.verdict).every(Boolean)
  && problems.length === 0;
console.log(ok ? '\nISLAND TECH EFFECTS: PASS' : '\nISLAND TECH EFFECTS: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
