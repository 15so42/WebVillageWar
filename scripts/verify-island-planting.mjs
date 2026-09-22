// 树坑与种植端到端验收（方案第 9 节最后一块设施）。
//
// 验的是完整回合，不是"放下去有个建筑"：
//   1. 砍野树会掉树苗（这是整条链的入口：没有坑的时候也得能拿到苗）；
//   2. 树坑只留种补种——树苗数量刚好等于保留量时**不种**；
//   3. 种下之后按生长时间推进，长成时在坑边**生成一棵真实的资源节点**
//      （不是树坑自己吐木材，方案写的是"种植、等待生长、砍伐"）；
//   4. 傀儡照常去砍这棵树：拿到木材**和树苗**；
//   5. 采空之后坑自动回到空地并补种（自持）；
//   6. 多个回合之后树苗净增长。
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
    // 清场（放过巢穴：全清会判胜、关卡结束、系统停推）
    (game.enemyUnits ?? []).slice().forEach((unit) => {
      if (!unit?.alive || unit.isSpawnPointNest || unit.isRecruitable) return;
      unit.alive = false;
      game.handleUnitDeath(unit, null);
    });
    (game.spawnPoints?.points ?? []).forEach((point) => { point.timer = 9999; });
    // 关掉开局自动采集需求：傀儡会自己跑去砍树，把基地库存的木料与树苗数量搅乱，
    // 后面每一条账都对不上（第一版就是这么失败的）。要它砍哪棵由测试显式指派。
    game.work.setDemands([]);
    await step(4);

    const inventory = game.baseInventory;
    // 干活用的傀儡：保留启动工具（斧子/镐子）。第一版把背包整个清空了，
    // 结果傀儡没了斧子，砍不动树——采集被拒的理由是 needs_tool，而 assignNode 照样返回成功。
    const worker = (game.friendlyUnits ?? []).find((unit) => unit?.alive && unit.isWorker) ?? null;
    out.workerFound = Boolean(worker);
    const ensureTools = (unit) => {
      if (!unit?.workerInventory) return null;
      const have = unit.workerInventory.countsByItem?.() ?? {};
      ['axe', 'pickaxe'].forEach((tool) => {
        if (!have[tool]) unit.workerInventory.add(tool, 1);
      });
      game.work?.notifyInventoryChanged?.(unit);
      return unit.workerInventory.countsByItem?.() ?? {};
    };
    if (worker) {
      out.workerTools = Object.keys(ensureTools(worker) ?? {});
      // **不要给傀儡设 controlMode = 'hold'**：UnitLogicSystem 里
      // "hold 就原地待命"的分支排在"傀儡交给作业系统"之前，一旦设上，
      // 作业系统整帧都不会被调用——表现出来就是"派了活但一辈子不动"。
      // 第一版为了"让它别乱跑"设了 hold，结果整条砍树验证卡死在这一行。
      worker.controlMode = null;
      worker.moveGoal = null;
      worker.commandMoveGoal = null;
    }
    await step(4);

    // ---- 1) 砍野树掉树苗（整条链的入口） ----
    const wildTree = game.resourceNodes.activeNodes().find((node) => (
      !node.released && (node.definitionId === 'oak' || node.definitionId === 'pine') && node.amount > 0
    )) ?? null;
    out.wildTreeFound = Boolean(wildTree);
    if (wildTree) {
      inventory.slots.fill(null);
      const before = { wood: inventory.countOf('wood'), sapling: inventory.countOf('sapling') };
      // 直接把整棵树采空，看副产物总数（走的是真实 harvest 链路）
      const nodeDef = game.resourceNodes.definitionOf(wildTree);
      let guard = 0;
      while (!wildTree.released && guard < 40) {
        game.resourceNodes.harvest(wildTree.id, {
          toolIds: ['axe'],
          position: { x: wildTree.x, z: wildTree.z },
          depositTarget: inventory
        });
        guard += 1;
      }
      out.wildTreeWood = inventory.countOf('wood') - before.wood;
      out.wildTreeSaplings = inventory.countOf('sapling') - before.sapling;
      out.wildTreeDepleted = wildTree.released === true;
      out.expectedSaplings = Math.min(
        Math.floor((nodeDef?.amount ?? 0) / (nodeDef?.byproduct?.perAmount ?? 1)),
        nodeDef?.byproduct?.maxPerNode ?? 0
      );
    }

    // ---- 2) 建树坑 ----
    const pitCfg = game.planting.plots.size >= 0 ? null : null;
    const plantingConfig = { saplingCost: 1, reserveSaplings: 1 };
    out.pitRecipeListed = game.recipeStatus().some((recipe) => recipe.id === 'treePit');
    inventory.add('wood', 60);
    inventory.add('stone', 40);
    document.querySelector('[data-storage-tab="craft"]');
    game.baseStorage.open();
    game.baseStorage.setTab('craft');
    game.baseStorage.lastSignature = '';
    game.baseStorage.refresh();
    await step(1);
    document.querySelector('[data-craft-recipe="treePit"]')?.click();
    out.pitInBag = inventory.countOf('treePit');
    await step(1);
    game.baseStorage.close();
    game.beginPlacement('treePit');
    const pitSpot = game.playerBase.position.clone();
    pitSpot.x += 8.5;
    pitSpot.z += 5.5;
    const placed = game.confirmPlacement(pitSpot);
    out.pitPlaced = placed.ok === true;
    const pit = placed.unit ?? null;
    out.pitRegistered = game.planting.plots.has(pit?.id) === true;
    // **建造期间不能让它先种下去**：第一版带着 3 棵树苗等建造完成，
    // 坑一建好就自己种了，等我"放进 2 棵苗"再读数时它早在长了，
    // 于是"保留量"那条断言测的根本不是我想测的那一刻。
    inventory.slots.fill(null);
    await step(200);   // 10 秒：走完建造
    out.pitBuilt = pit?.underConstruction !== true;
    out.stateWithoutSaplings = game.planting.statusOf(pit)?.state ?? null;

    // ---- 3) 保留量：只够一次种植时能种，种完保留量仍在 ----
    inventory.add('sapling', 2);   // 保留量 1 + 消耗 1 = 2 → 刚好够种一次
    await step(20);
    const statusAtTwo = game.planting.statusOf(pit);
    out.plantedWithExactlyEnough = statusAtTwo?.state === 'growing';
    out.saplingsAfterPlant = inventory.countOf('sapling');
    out.growingNodeIdWhileGrowing = statusAtTwo?.nodeId ?? null;

    // ---- 4) 等待长成：坑边出现一棵真实的资源节点 ----
    await step(900);   // 45 秒模拟时间（生长 40 秒）
    const statusGrown = game.planting.statusOf(pit);
    out.stateAfterGrowth = statusGrown?.state ?? null;
    out.grownNodeId = statusGrown?.nodeId ?? null;
    const grownNode = statusGrown?.nodeId ? game.resourceNodes.nodeById(statusGrown.nodeId) : null;
    out.grownNodeIsRealResourceNode = Boolean(grownNode)
      && grownNode.definitionId === 'oak'
      && grownNode.released !== true;
    out.grownNodeAmount = grownNode?.amount ?? null;
    out.grownNodeNearPit = grownNode && pit
      ? Math.round(Math.hypot(grownNode.x - pit.position.x, grownNode.z - pit.position.z) * 10) / 10
      : null;
    out.grownNodeWalkable = grownNode ? game.world.isWalkable(grownNode.x, grownNode.z) === true : null;
    out.pitSaplingHiddenWhenGrown = (() => {
      const parts = pit?.visualRoot?.userData?.parts ?? pit?.mesh?.userData?.parts;
      const sapling = parts?.pitSapling;
      return sapling ? sapling.visible === false : null;
    })();

    // ---- 5) 傀儡去砍这棵树：拿到木材与树苗，坑自动重置 ----
    let chopResult = null;
    if (grownNode && worker) {
      // 树自己会登记寻路阻挡，所以**节点所在格子必然不可走**——那是对的。
      // 要验的是"围边有能站人的地方"，否则傀儡永远走不到跟前。
      const adjacentWalkable = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
        .filter(([dx, dz]) => game.world.isWalkable(grownNode.x + dx * 1.4, grownNode.z + dz * 1.4));
      out.adjacentWalkableTiles = adjacentWalkable.length;
      out.grownNodeOwnCellBlocked = game.world.isWalkable(grownNode.x, grownNode.z) === false;
      // 只清货物、保留工具
      worker.workerInventory?.slots?.forEach?.((slot, index) => {
        if (slot && slot.itemId !== 'axe' && slot.itemId !== 'pickaxe') {
          worker.workerInventory.slots[index] = null;
        }
      });
      ensureTools(worker);
      out.workerHasAxeAtChop = (worker.workerInventory?.countOf?.('axe') ?? 0) > 0;
      const woodBefore = inventory.countOf('wood');
      const sapBefore = inventory.countOf('sapling');
      // 让傀儡站到树边按真实链路采（不是直接 harvest）
      worker.position.set(grownNode.x + 1.2, worker.position.y, grownNode.z + 1.2);
      const assigned = game.work.assignNode(worker, grownNode.id);
      out.harvestAssigned = assigned === true || assigned?.ok === true;
      const record = game.work.records?.get?.(worker.id) ?? null;
      out.workRecordExists = Boolean(record);
      out.taskAfterAssign = record?.task?.nodeId ?? null;
      out.controlModeAtChop = worker.controlMode ?? null;
      out.canHarvestNow = game.resourceNodes.canHarvest(grownNode.id, {
        toolIds: ['axe'],
        position: { x: worker.position.x, z: worker.position.z }
      });
      let guard = 0;
      const samples = [];
      while (!grownNode.released && guard < 1400) {
        await step(4);
        guard += 4;
        if (guard % 200 === 0) {
          samples.push({
            tick: guard,
            task: record?.task?.nodeId ?? null,
            behavior: record?.behavior ?? null,
            error: record?.lastError ?? null,
            distance: Math.round(Math.hypot(worker.position.x - grownNode.x, worker.position.z - grownNode.z) * 10) / 10,
            carried: worker.workerInventory?.countOf?.('wood') ?? 0,
            nodeAmount: grownNode.amount
          });
        }
      }
      out.chopSamples = samples;
      chopResult = {
        depleted: grownNode.released === true,
        ticks: guard
      };
      out.chopDepletedNode = chopResult.depleted;
      out.chopTicks = guard;
      // 木材要么在傀儡背包里、要么已经送回基地
      const carried = worker.workerInventory?.countOf?.('wood') ?? 0;
      out.woodGained = (inventory.countOf('wood') - woodBefore) + carried;
      out.saplingsGainedFromPlantedTree = (inventory.countOf('sapling') - sapBefore)
        + (worker.workerInventory?.countOf?.('sapling') ?? 0);
    }

    // ---- 6) 采空之后坑回到空地；此时没有树苗，所以不会补种 ----
    await step(40);   // 2 秒
    const statusAfterChop = game.planting.statusOf(pit);
    out.stateAfterChop = statusAfterChop?.state ?? null;
    out.noReplantWithoutSapling = statusAfterChop?.state === 'empty';

    // ---- 7) 给足树苗 → 自动补种；消耗严格是 1，保留量仍在 ----
    // 先把"傀儡身上那几棵刚砍下来的苗"和基地库存都清掉，让坑真的回到空地状态，
    // 否则它会在清点之前就用傀儡卸货的苗自己补种了，账目对不上。
    const clearItem = (itemId) => {
      const have = inventory.countOf(itemId);
      if (have > 0) inventory.remove(itemId, have);
    };
    if (worker?.workerInventory) {
      worker.workerInventory.slots.forEach((slot, index) => {
        if (slot?.itemId === 'sapling') worker.workerInventory.slots[index] = null;
      });
      game.work?.notifyInventoryChanged?.(worker);
    }
    clearItem('sapling');
    await step(20);
    out.stateAfterClearingSaplings = game.planting.statusOf(pit)?.state ?? null;
    const saplingsStart = 4;
    inventory.add('sapling', saplingsStart);
    await step(20);
    const statusReplant = game.planting.statusOf(pit);
    out.autoReplanted = statusReplant?.state === 'growing';
    out.saplingsConsumedByReplant = saplingsStart - inventory.countOf('sapling');
    out.reserveKept = inventory.countOf('sapling') >= plantingConfig.reserveSaplings;
    out.pitSaplingVisibleWhileGrowing = (() => {
      const parts = pit?.visualRoot?.userData?.parts ?? pit?.mesh?.userData?.parts;
      const sapling = parts?.pitSapling;
      return sapling ? sapling.visible === true : null;
    })();
    // 探针：手动同步一次再读。若手动同步能点亮、自动的没点亮，
    // 说明是"每帧同步没跑到"；若手动也点不亮，说明读到的部件与系统里的不是同一份。
    {
      const record = game.planting.plots.get(pit?.id);
      out.probeRecordState = record?.state ?? null;
      out.probeRecordProgress = record ? Math.round(record.progress * 100) / 100 : null;
      const partsOf = (unit) => unit?.visualRoot?.userData?.parts ?? unit?.mesh?.userData?.parts;
      out.probePartsBefore = partsOf(record?.unit)?.pitSapling?.visible ?? null;
      out.probeScaleBefore = partsOf(record?.unit)?.pitSapling?.scale?.x ?? null;
      if (record) game.planting.syncPlotVisual(record);
      out.probePartsAfterSync = partsOf(record?.unit)?.pitSapling?.visible ?? null;
      out.probePartsSameUnit = record?.unit === pit;
      // 再跑**一帧**：bindPose 机制会把"只改节点、不改静息姿态"的写法还原掉，
      // 所以这里必须在一帧之后再读，确认它没有被打回去。
      game.tick();
      out.probeVisibleAfterOneTick = partsOf(record?.unit)?.pitSapling?.visible ?? null;
      out.probeScaleAfterOneTick = partsOf(record?.unit)?.pitSapling?.scale?.x ?? null;
      out.probeStateAfterOneTick = record?.state ?? null;
      out.probeBindPoseTracksNode = (() => {
        const sapling = partsOf(record?.unit)?.pitSapling;
        if (!sapling?.userData?.bindPose) return null;
        return sapling.userData.bindPose.visible === sapling.visible
          && Math.abs(sapling.userData.bindPose.scale.x - sapling.scale.x) < 1e-6;
      })();
    }

    // ---- 8) 树坑状态可读（生长比例给视觉用） ----
    out.growthRatioMidway = (() => {
      const s = game.planting.statusOf(pit);
      return s ? Math.round(s.ratio * 100) / 100 : null;
    })();
    out.plotStats = { ...game.planting.stats };

    out.elapsedAdvanced = game.elapsedTime > 0;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));

  mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
  // 镜头挪到树坑与它长出来的树
  await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    const record = [...g.planting.plots.values()][0];
    const unit = record?.unit;
    if (!unit?.position) return false;
    const p = unit.position;
    g.cameraTarget.set(p.x, p.y, p.z);
    g.camera.position.set(p.x + 14, p.y + 16, p.z + 14);
    g.camera.lookAt(p.x, p.y + 1, p.z);
    g.renderScene();
    return true;
  })()`);
  await sleep(200);
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync('C:/WebProjects/WebVillageWar/outputs/verify-island-planting.png', Buffer.from(shot.data, 'base64'));
}

const r = report.result;
report.verdict = r && !r.error ? {
  booted: true,
  // 1) 砍野树掉树苗（整条链的入口）
  wildTreeDropsSaplings: r.wildTreeFound === true
    && r.wildTreeDepleted === true
    && r.wildTreeWood > 0
    && r.wildTreeSaplings === r.expectedSaplings
    && r.wildTreeSaplings > 0,
  // 2) 树坑建好并登记成地块
  pitBuilt: r.pitRecipeListed === true && r.pitInBag === 1
    && r.pitPlaced === true && r.pitRegistered === true && r.pitBuilt === true,
  // 3) 保留量：刚好够一次就能种，并且种下之后保留量仍在
  plantRespectsReserve: r.plantedWithExactlyEnough === true
    && r.stateWithoutSaplings === 'empty'
    && r.saplingsAfterPlant === 1,
  // 4) 长成的是一棵真实资源节点，位置合理
  growsRealResourceNode: r.stateAfterGrowth === 'grown'
    && r.grownNodeIsRealResourceNode === true
    && r.grownNodeAmount > 0
    && r.grownNodeNearPit > 1
    && r.grownNodeOwnCellBlocked === true
    && r.adjacentWalkableTiles > 0
    && r.pitSaplingHiddenWhenGrown === true,
  // 5) 傀儡按真实采集链路砍掉它，木材与树苗都有收成
  workerChopsPlantedTree: r.workerFound === true
    && r.workerHasAxeAtChop === true
    && r.harvestAssigned === true
    && r.chopDepletedNode === true
    && r.woodGained > 0
    && r.saplingsGainedFromPlantedTree > 0,
  // 6) 采空后回到空地；没苗时不补种
  resetsAndWaitsForSapling: r.stateAfterChop === 'empty' && r.noReplantWithoutSapling === true,
  // 7) 有苗时自动补种，消耗正好 1，保留量仍在；树苗的视觉在两帧之间不会被还原
  autoReplantsKeepingReserve: r.autoReplanted === true
    && r.stateAfterClearingSaplings === 'empty'
    && r.saplingsConsumedByReplant === 1
    && r.reserveKept === true
    && r.pitSaplingVisibleWhileGrowing === true
    && r.probeVisibleAfterOneTick === true
    && r.probeBindPoseTracksNode === true,
  growthProgressReadable: r.growthRatioMidway !== null && r.growthRatioMidway >= 0,
  elapsedAdvanced: r.elapsedAdvanced === true
} : null;
console.log(JSON.stringify(report, null, 2));
const ok = Object.values(report.verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nISLAND PLANTING: PASS' : '\nISLAND PLANTING: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
