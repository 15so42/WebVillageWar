// 远征与区域成长：游戏内端到端验收（真实按钮 / 真实采集 / 真实战斗 / 真实生产）。
//
// 覆盖方案 A/B/C/D 的可观察部分：
//   A 四条远征路线（开局事实 / 面板真实按钮 / 追踪 / 相机 / 目标自动换外巢 / 清线禁用查看位置）
//   B 区域图纸门槛（锁 / 不扣费 / 清对巢才解锁 / 原子扣费一次 / 四项真实效果 / 幂等 / 不影响敌方）
//   C 夜袭预报与清线回报（gateNestId 口径 / 活动来源 / 清线后不再新出兵 / 残兵不消失 / 判胜保留）
//   D 交互与生命周期（Esc 非暂停 / B 键不变 / 暂停后继续 / 重开与 destroy 不残留、不重复监听）
//
// 真实效果一律走真实链路度量：采集走 WorkSystem 的作业状态机，耐久走 AttackSystem 的实际攻击，
// 烧炭走 ProductionSystem 的真实周期与熔炉进料/燃料/产出格。
//
// 熔炉进料的说明：当前工作树的站点/运输改造**没有**把基地木料自动送进熔炉进料格
// （既有 verify-island-tech-effects 因此同样失败：cycles 0、stalledTicks 数千）。
// 这条脚本因此由测试直接把木料放进熔炉的进料格与燃料格，再让真实的 ProductionSystem 跑周期——
// 被验证的是"6 秒周期 / 产量 2→3"这条产品逻辑本身，不是进料 UI。
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';

const CDP_PORT = Number(process.env.ISLAND_CDP_PORT || 9235);
const BASE = process.env.ISLAND_URL || 'http://127.0.0.1:3000/';
const LEVEL_ID = process.env.ISLAND_LEVEL_ID || 'island-survival';
const OUT_DIR = 'C:/WebProjects/WebVillageWar/outputs';
const TMP_DIR = 'C:/Users/A/.codex/tmp/villagewar-design-20261004';

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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
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

const report = { page: BASE, levelId: LEVEL_ID, started: false, phases: {}, errors: [], screenshots: [], problems };

/** 每段独立跑：某段抛错时记进 errors，后面的段继续跑（失败不会被吞掉）。 */
const phase = async (name, body) => {
  try {
    const raw = await ev(`(async () => { try { ${body} } catch (error) { return JSON.stringify({ __error: String(error && error.stack || error) }); } })()`);
    const parsed = JSON.parse(raw);
    if (parsed?.__error) {
      report.errors.push(`${name}: ${parsed.__error}`);
      console.log(`[phase ${name}] ERROR ${parsed.__error}`);
    } else {
      report.phases[name] = parsed;
      console.log(`[phase ${name}] ${JSON.stringify(parsed)}`);
    }
    return parsed;
  } catch (error) {
    report.errors.push(`${name}: ${error.message}`);
    console.log(`[phase ${name}] EVAL ERROR ${error.message}`);
    return {};
  }
};

await send('Page.navigate', { url: BASE });
await sleep(700);
// 全新玩家：清掉上一轮可能留下的追踪 id（追踪本来就会落盘，这是产品行为）
await ev(`(() => { try { localStorage.removeItem('village-war-expedition-track'); } catch (error) {} return true; })()`);
report.started = await enterSurvivalGame(ev, sleep);

if (report.started) {
  await sleep(400);

  // ---------------------------------------------------------------- 准备
  report.phases.setup = await phase('setup', `
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    game.paused = false;
    const state = { originalDelta: originalDelta, out: {} };
    state.step = async (n) => {
      for (let i = 0; i < n; i += 1) {
        game.tick();
        if (i % 4 === 3) await new Promise((r) => setTimeout(r, 3));
      }
    };
    // 熔炉的真实进料/燃料/产出格（见文件头说明）
    //
    // 关键：进料格只有 1 格、单格上限 200，而 Inventory.add 默认**整笔成功或整笔失败**。
    // 早先这里直接 add('wood', 400)，超容 → added 0 → 进料格始终为空 →
    // ProductionSystem 报 no_input、record.recipe 永远是 null，后面读 recipe.seconds
    // 就抛 "Cannot read properties of null"。所以装料必须显式 allowPartial，
    // 并把实际装进去的数量记下来（不是用可选链把"没有配方"这件事藏掉）。
    state.feedFurnace = (furnace, wood) => {
      const station = game.stations.stationFor(furnace);
      if (!station) return null;
      station.inventory.slots.fill(null);
      const loaded = station.inventory.add('wood', wood, { allowPartial: true });
      station.fuelInventory.slots.fill(null);
      const fueled = station.fuelInventory.add('wood', 120, { allowPartial: true });
      station.outputInventory.slots.fill(null);
      if (!(furnace.activityMana > 0)) furnace.activityMana = furnace.manaCapacity || 24;
      state.lastFeed = {
        inputAdded: loaded.added,
        inputError: loaded.error,
        fuelAdded: fueled.added,
        fuelError: fueled.error
      };
      return station;
    };
    // 量的是"配方周期本身"：
    //   - 先把进度归零，否则上一段攒下的进度会被算进这一段的周期里；
    //   - 这一段持续保证熔炉魔力不为空 —— 基地功率是共享的，长阶段之后熔炉的
    //     activityMana 会被抽干，中途 no_power 停顿会把墙钟时间混进"周期"读数
    //     （实测：炭窑鼓风后仍量到 7.65 秒/周期，而配方就是 6 秒，stalledTicks=112）。
    //   供能是否充足由 verify-island-power / verify-island-fuel-power 覆盖，不在这里混着量。
    state.runCycles = async (furnace, minCycles) => {
      const station = game.stations.stationFor(furnace);
      const record = game.production.producers.get(furnace.id) || null;
      if (record) record.progress = 0;
      const cyclesStart = game.production.stats.cycles;
      const stalledStart = game.production.stats.stalledTicks;
      const inStart = station.inventory.countOf('wood');
      const fuelStart = station.fuelInventory.countOf('wood');
      const outStart = station.outputInventory.countOf('charcoal');
      const reasons = {};
      let ticks = 0;
      while (game.production.stats.cycles - cyclesStart < minCycles && ticks < 2400) {
        if (record) furnace.activityMana = Math.max(furnace.activityMana ?? 0, furnace.manaCapacity || 24);
        await state.step(2);
        ticks += 2;
        const status = game.production.statusOf(furnace);
        const key = status ? status.reason : 'none';
        reasons[key] = (reasons[key] || 0) + 1;
      }
      const cycles = game.production.stats.cycles - cyclesStart;
      return {
        cycles: cycles,
        ticks: ticks,
        secondsPerCycle: cycles > 0 ? (ticks * 0.05) / cycles : null,
        inputPerCycle: cycles > 0 ? (inStart - station.inventory.countOf('wood')) / cycles : null,
        fuelPerCycle: cycles > 0 ? (fuelStart - station.fuelInventory.countOf('wood')) / cycles : null,
        outputPerCycle: cycles > 0 ? (station.outputInventory.countOf('charcoal') - outStart) / cycles : null,
        stalledTicks: game.production.stats.stalledTicks - stalledStart,
        reasons: reasons,
        reason: game.production.statusOf(furnace) ? game.production.statusOf(furnace).reason : null
      };
    };
    window.__EXP__ = state;
    await state.step(8);
    game.pendingStrategyRewards = [];
    game.awaitingOpeningReward = false;
    if (game.strategyEvent) game.strategyEvent = null;
    if (game.strategyEventUi && game.strategyEventUi.root) game.strategyEventUi.root.hidden = true;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
    // 清场时放过巢穴：全部清空会立刻判胜、关卡结束、系统停推。
    (game.enemyUnits || []).slice().forEach((unit) => {
      if (!unit || !unit.alive || unit.isSpawnPointNest || unit.isRecruitable) return;
      unit.alive = false;
      game.handleUnitDeath(unit, null);
    });
    (game.spawnPoints.points || []).forEach((point) => { point.timer = 9999; });
    game.work.setDemands([]);
    await state.step(4);
    state.out.trackedAtStart = game.expeditions.trackedId;
    return JSON.stringify(state.out);
  `);

  // ------------------------------------------------- A1 开局事实与面板
  report.phases.opening = await phase('opening', `
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const step = window.__EXP__.step;
    const out = {};
    const friendly = (game.friendlyUnits || []).filter((unit) => unit.alive);
    out.workerCount = friendly.filter((unit) => unit.isWorker === true).length;
    out.combatGuardCount = friendly.filter((unit) => unit.isWorker !== true && unit.isBuilding !== true).length;
    out.spawnPointCount = game.spawnPoints.points.length;
    out.fieldCampCount = game.fieldCampState ? game.fieldCampState.camps.length : 0;
    out.panelBeforeOpen = document.querySelectorAll('#expedition-panel').length;
    const button = document.querySelector('#expedition-toggle');
    out.buttonExists = Boolean(button);
    out.buttonHidden = button ? button.hidden : null;
    out.buttonLabel = button ? button.textContent.trim() : null;
    out.objective = document.querySelector('#survival-objective') ? document.querySelector('#survival-objective').textContent : null;
    out.openingAsksForWeapon = /傀儡木棒/.test(out.objective || '');
    out.openingDoesNotPushCamp = !/西坡狼窝|北路哨卡|东林盗伙/.test(out.objective || '');
    button.click();
    await step(2);
    out.panelRootCount = document.querySelectorAll('#expedition-panel').length;
    out.panelOpen = game.expeditionPanel.isOpen();
    out.pausedAfterOpen = game.paused;
    out.buttonAria = button.getAttribute('aria-expanded');
    const cards = Array.from(document.querySelectorAll('[data-expedition-route]'));
    out.cardIds = cards.map((card) => card.dataset.expeditionRoute);
    const points = game.spawnPoints.points;
    out.cardFacts = cards.map((card) => {
      const routeId = card.dataset.expeditionRoute;
      const brief = game.expeditions.briefById(routeId);
      const point = points.find((entry) => entry.id === brief.targetPointId) || null;
      const text = card.textContent;
      return {
        id: routeId,
        targetName: brief.targetName,
        targetPointId: brief.targetPointId,
        pointName: point ? point.name : null,
        enemyNames: brief.enemies.map((enemy) => enemy.name),
        dropNames: brief.drops.map((drop) => drop.name + 'x' + drop.count),
        recruitNames: brief.recruits.map((recruit) => recruit.name + 'x' + recruit.count),
        workerName: brief.worker ? brief.worker.name + 'x' + brief.worker.count : null,
        blueprintName: brief.blueprint ? brief.blueprint.name : null,
        textHasTarget: text.indexOf(brief.targetName) >= 0,
        textHasEnemy: brief.enemies.every((enemy) => text.indexOf(enemy.name) >= 0),
        textHasDrop: brief.dropIds ? true : brief.drops.every((drop) => text.indexOf(drop.name) >= 0),
        textHasBlueprint: brief.blueprint ? text.indexOf(brief.blueprint.name) >= 0 : true,
        strategyHasBlueprint: /图纸/.test(brief.strategy)
      };
    });
    const forecast = game.expeditions.snapshot().forecast;
    out.forecastCounts = forecast.counts;
    out.forecastNextNight = forecast.nextNightNumber;
    out.forecastText = document.querySelector('[data-expedition-forecast]').textContent;
    return JSON.stringify(out);
  `);

  mkdirSync(OUT_DIR, { recursive: true });
  await sleep(150);
  let shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(`${OUT_DIR}/expedition-desktop-1280x720.png`, Buffer.from(shot.data, 'base64'));
  report.screenshots.push(`${OUT_DIR}/expedition-desktop-1280x720.png`);

  // ------------------------------------------------- A2 追踪 / 相机 / 无指令
  report.phases.tracking = await phase('tracking', `
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const step = window.__EXP__.step;
    const out = {};
    const westPoint = game.spawnPoints.pointById('island-west-ridge');
    document.querySelector('[data-expedition-track="west"]').click();
    await step(2);
    out.trackedId = game.expeditions.trackedId;
    out.trackButtonLabel = document.querySelector('[data-expedition-track="west"]').textContent;
    out.hudText = document.querySelector('#survival-objective').textContent;
    out.hudHasWestTarget = out.hudText.indexOf(westPoint.name) >= 0;
    out.hudHasBlueprint = out.hudText.indexOf('区域图纸') >= 0;
    out.hudHasResearch = out.hudText.indexOf('科研站') >= 0;
    await step(40);
    out.trackedStillWest = game.expeditions.trackedId === 'west';
    out.hudStillWest = document.querySelector('#survival-objective').textContent.indexOf(westPoint.name) >= 0;
    const worker = (game.friendlyUnits || []).find((unit) => unit.alive && unit.isWorker);
    game.selectUnit(worker);
    out.followBefore = game.setCameraFollowEnabled(true);
    const goalsOf = () => (game.friendlyUnits || []).filter((unit) => unit.alive).map((unit) => {
      const goal = unit.moveGoal || null;
      return unit.id + ':' + (goal ? Math.round(goal.x * 100) / 100 + ',' + Math.round(goal.z * 100) / 100 : 'none');
    });
    const moveGoals = goalsOf();
    const selectedBefore = game.selectedUnits.map((unit) => unit.id).join(',');
    document.querySelector('[data-expedition-focus="west"]').click();
    await step(2);
    out.followAfterFocus = game.cameraFollowEnabled;
    out.cameraNearWest = Math.abs(game.cameraTarget.x - westPoint.x) < 12
      && Math.abs(game.cameraTarget.z - westPoint.z) < 12;
    out.selectedUnchanged = game.selectedUnits.map((unit) => unit.id).join(',') === selectedBefore;
    out.noMoveOrdersIssued = moveGoals.join('|') === goalsOf().join('|');
    const bounds = game.battlefieldBounds();
    out.cameraInBounds = game.cameraTarget.x >= bounds.minX && game.cameraTarget.x <= bounds.maxX
      && game.cameraTarget.z >= bounds.minZ && game.cameraTarget.z <= bounds.maxZ;
    // 采样与帧率无关：先建好缓存，再各自推进 0.5 秒（多跑几帧确保跨过阈值）
    const countRebuilds = (fps) => {
      game.expeditions.invalidate();
      game.expeditions.update(0);
      const start = game.expeditions.sampleVersion;
      const frames = Math.round(fps * 0.5) + 4;
      for (let i = 0; i < frames; i += 1) game.expeditions.update(1 / fps);
      return game.expeditions.sampleVersion - start;
    };
    out.rebuilds60 = countRebuilds(60);
    out.rebuilds144 = countRebuilds(144);
    out.rebuildsMatch = out.rebuilds60 === out.rebuilds144 && out.rebuilds60 === 1;
    // 面板开着、追踪生效时，真实移动命令必须照常下达（远征面板不抢地图命令）。
    // 自治傀儡走 work.beginRally（落在 record.rally 上），非自治单位走 unit.moveGoal，
    // 两条通道任一发生变化都算"命令真的下达了"。
    game.selectUnit(worker);
    const goalText = (unit) => (unit.moveGoal
      ? Math.round(unit.moveGoal.x * 100) / 100 + ',' + Math.round(unit.moveGoal.z * 100) / 100
      : 'none');
    const rallyText = (unit) => {
      const rally = game.work.recordFor(unit)?.rally ?? null;
      return rally ? Math.round(rally.x * 100) / 100 + ',' + Math.round(rally.z * 100) / 100 + '@' + rally.phase : 'none';
    };
    const goalBeforeCommand = goalText(worker);
    const rallyBeforeCommand = rallyText(worker);
    const commandSpot = game.playerBase.position.clone();
    commandSpot.x += 3.5;
    commandSpot.z -= 3.5;
    const commandOk = game.commandSelectedUnits(commandSpot);
    await step(2);
    out.moveCommandIssued = commandOk === true;
    out.moveGoalBefore = goalBeforeCommand;
    out.moveGoalAfter = goalText(worker);
    out.rallyBefore = rallyBeforeCommand;
    out.rallyAfter = rallyText(worker);
    out.moveCommandTookEffect = out.moveGoalAfter !== goalBeforeCommand
      || out.rallyAfter !== rallyBeforeCommand;
    out.panelStillOpenAfterCommand = game.expeditionPanel.isOpen() === true;
    out.trackedStillWestAfterCommand = game.expeditions.trackedId === 'west';
    window.__EXP__.workerId = worker ? worker.id : null;
    return JSON.stringify(out);
  `);

  // ------------------------------------------------- B 基线：建设施 + 研究前读数
  report.phases.baseline = await phase('baseline', `
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const step = window.__EXP__.step;
    const state = window.__EXP__;
    const inventory = game.baseInventory;
    const out = {};
    const craftRecipe = (recipeId) => {
      game.baseStorage.open();
      game.baseStorage.setTab('craft');
      game.baseStorage.lastSignature = '';
      game.baseStorage.refresh();
      return document.querySelector('[data-backpack-recipe="' + recipeId + '"]');
    };
    const place = async (itemId, dx, dz, buildTicks) => {
      const button = craftRecipe(itemId);
      out['craft_' + itemId] = Boolean(button);
      if (button) button.click();
      game.baseStorage.close();
      await step(1);
      game.beginPlacement(itemId);
      const spot = game.playerBase.position.clone();
      spot.x += dx;
      spot.z += dz;
      const placed = game.confirmPlacement(spot);
      await step(buildTicks || 200);
      return placed.unit || null;
    };
    inventory.slots.fill(null);
    inventory.add('wood', 400);
    inventory.add('stone', 400);
    inventory.add('iron', 200);
    inventory.add('fiber', 200);
    inventory.add('charcoal', 120);
    inventory.add('deepCore', 6);
    await step(4);
    const station = await place('researchStation', -6.5, -3.5, 200);
    out.stationPlaced = Boolean(station);
    out.stationReady = game.research.stationReady();
    const tower = await place('arrowTower', 6.5, 3.5, 200);
    out.towerPlaced = Boolean(tower);
    const furnace = await place('furnace', 5.5, -4.5, 200);
    out.furnacePlaced = Boolean(furnace);
    out.furnaceStationFound = Boolean(game.stations.stationFor(furnace));
    out.towerRangeBefore = game.modifiers.getAttackRange(tower);
    out.towerRangeDefinition = tower.definition.attackRange;
    // 采集基线：走真实作业链路（补满活动魔力，隔离"资源到手几个"这一个变量）
    const worker = (game.friendlyUnits || []).find((unit) => unit.alive && unit.isWorker) || null;
    out.workerFound = Boolean(worker);
    const ensureTools = (unit) => {
      const have = unit.workerInventory && unit.workerInventory.countsByItem ? unit.workerInventory.countsByItem() : {};
      ['axe', 'pickaxe'].forEach((tool) => { if (!have[tool]) unit.workerInventory.add(tool, 1); });
      game.work.notifyInventoryChanged(unit);
    };
    const measureHarvest = async (unit) => {
      unit.controlMode = null;
      unit.workerAutonomous = true;
      if (unit.workerInventory) {
        unit.workerInventory.slots.fill(null);
        ensureTools(unit);
        game.work.notifyInventoryChanged(unit);
      }
      const tree = game.resourceNodes.activeNodes().find((node) => (
        !node.released && (node.definitionId === 'oak' || node.definitionId === 'pine') && node.amount > 20
      )) || null;
      if (!tree) return { tree: false };
      if (unit.attributes && unit.attributes.get('activityMana') !== undefined) unit.activityMana = unit.manaCapacity;
      unit.activityMana = unit.activityManaCapacity || unit.manaCapacity || unit.activityMana;
      unit.position.set(tree.x + 1.2, unit.position.y, tree.z + 1.2);
      const assigned = game.work.assignNode(unit, tree.id);
      const before = game.work.stats.harvestActions;
      let guard = 0;
      while (game.work.stats.harvestActions === before && guard < 400) { await step(1); guard += 1; }
      const record = game.work.recordFor(unit);
      return {
        tree: true,
        treeId: tree.id,
        assigned: assigned,
        ticks: guard,
        carried: unit.workerInventory.countOf(tree.resource),
        error: record ? record.lastError : null
      };
    };
    out.harvestBaseline = null;
    out.harvestBaselineDetail = null;
    if (worker) {
      await step(20);
      const detail = await measureHarvest(worker);
      out.harvestBaselineDetail = detail;
      out.harvestBaseline = detail.tree ? detail.carried : null;
    }
    // 烧炭基线：真实周期数驱动
    state.feedFurnace(furnace, 400);
    await step(4);
    out.furnaceLoad = { ...state.lastFeed };
    const baseRun = await state.runCycles(furnace, 2);
    out.baseRun = baseRun;
    out.baseSecondsPerCycle = baseRun.secondsPerCycle;
    out.baseOutputPerCycle = baseRun.outputPerCycle;
    const furnaceRecord = game.production.producers.get(furnace.id) || null;
    // 显式记录"配方到底有没有解析出来"：没有配方就是失败，不能用可选链读成 null 蒙混过去。
    out.recipeRegisteredBefore = Boolean(furnaceRecord && furnaceRecord.recipe);
    out.recipeSecondsBefore = out.recipeRegisteredBefore ? furnaceRecord.recipe.seconds : null;
    // 战斗耐久基线：真实攻击一次
    const spot = game.playerBase.position.clone();
    spot.x += 12;
    spot.z += 6;
    game.summonUnits('swordsman', 1, spot, 0.7, { select: false });
    const fighter = (game.friendlyUnits || []).filter((unit) => unit.alive && unit.type === 'swordsman').pop() || null;
    out.fighterSpawned = Boolean(fighter);
    if (fighter) {
      const enemySpot = { x: fighter.position.x + 1.4, z: fighter.position.z };
      const dummy = game.spawnEnemyAt('ogre', enemySpot, { difficulty: 1, radius: 0.3 });
      dummy.health = 100000;
      dummy.attributes.setBase('maxHealth', 100000);
      dummy.attributes.setBase('physicalAttack', 0);
      dummy.attributes.setBase('moveSpeed', 0);
      fighter.attributes.setBase('maxDurability', 5000);
      fighter.weapon.durability = 5000;
      out.fighterCostBefore = game.modifiers.getDurabilityCost(fighter);
      out.fighterCostDefinition = fighter.definition.weapon.durabilityCost;
      const before = fighter.weapon.durability;
      let guard = 0;
      while (fighter.weapon.durability >= before && guard < 200) {
        dummy.position.x = fighter.position.x + 1.4;
        dummy.position.z = fighter.position.z;
        dummy.moveGoal = null;
        await step(1);
        guard += 1;
      }
      out.attackTicks = guard;
      out.fighterCostMeasured = before - fighter.weapon.durability;
      state.fight = { fighter: fighter, dummy: dummy, fighterId: fighter.id, dummyId: dummy.id };
    }
    // 敌方对照：敌方剑士的耐久消耗必须保持原值
    const enemyFighter = game.spawnEnemyAt('swordsman', { x: game.playerBase.position.x - 16, z: game.playerBase.position.z + 10 }, { difficulty: 1, radius: 0.4 });
    out.enemyFighterCostBefore = enemyFighter ? game.modifiers.getDurabilityCost(enemyFighter) : null;
    out.enemyFighterDefinition = enemyFighter ? enemyFighter.definition.weapon.durabilityCost : null;
    state.enemyFighterId = enemyFighter ? enemyFighter.id : null;
    state.field = { stationId: station ? station.id : null, towerId: tower ? tower.id : null, furnaceId: furnace ? furnace.id : null };
    return JSON.stringify(out);
  `);

  // ------------------------------------------------- B 图纸门槛（科研站已建好）
  report.phases.blueprint = await phase('blueprint', `
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const step = window.__EXP__.step;
    const out = {};
    document.querySelector('[data-expedition-track="north"]').click();
    await step(2);
    out.northTargetBefore = game.expeditions.briefById('north').targetName;
    const inventory = game.baseInventory;
    inventory.slots.fill(null);
    inventory.add('wood', 90);
    inventory.add('iron', 40);
    inventory.add('stone', 80);
    inventory.add('fiber', 40);
    inventory.add('charcoal', 40);
    inventory.add('deepCore', 2);
    await step(2);
    const lockedError = game.research.research('towerCalibration');
    out.lockedErrorReason = lockedError.reason;
    out.lockedErrorLabel = lockedError.label;
    out.lockedLabelNamesNest = /北岬巢穴/.test(lockedError.label || '');
    out.lockedNoDeduction = inventory.countOf('wood') === 90 && inventory.countOf('stone') === 80;
    // 清一座**无关**的巢穴：北线图纸仍然锁着
    game.spawnPoints.destroyPoint('island-south-woods');
    await step(3);
    out.stillLockedAfterUnrelated = game.research.research('towerCalibration').reason;
    // 通过真实清点路径拆掉北岬巢穴
    out.destroyOk = game.spawnPoints.destroyPoint('island-camp-north') === true;
    await step(3);
    const northBrief = game.expeditions.briefById('north');
    out.northBlueprintReady = northBrief.blueprint.ready;
    out.northTargetAfter = northBrief.targetName;
    out.northTargetSwitched = northBrief.targetName === game.spawnPoints.pointById('island-outer-north').name;
    out.hudAfterClear = document.querySelector('#survival-objective').textContent;
    out.hudFollowsOuter = out.hudAfterClear.indexOf(northBrief.targetName) >= 0;
    const hintPanel = document.querySelector('#game-hint-panel');
    out.outerWarned = /解除封印|开始出兵/.test(out.hudAfterClear)
      || /解除封印|开始出兵/.test(hintPanel ? hintPanel.textContent : '');
    out.outerNowThreatening = game.expeditions.snapshot().forecast.threatening
      .some((point) => point.id === 'island-outer-north');
    return JSON.stringify(out);
  `);

  // ------------------------------------------------- B 清内巢 + 原子扣费
  report.phases.research = await phase('research', `
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const step = window.__EXP__.step;
    const inventory = game.baseInventory;
    const out = {};
    const pairs = [
      ['island-west-ridge', 'woodlandLogistics'],
      ['island-east-cape', 'armsMaintenance'],
      ['island-south-woods', 'charcoalBellows']
    ];
    out.stages = [];
    for (const pair of pairs) {
      if (!game.spawnPoints.pointById(pair[0]).cleared) game.spawnPoints.destroyPoint(pair[0]);
      await step(2);
      const status = game.research.techStatus().find((tech) => tech.id === pair[1]);
      out.stages.push({ nestId: pair[0], techId: pair[1], blueprintReady: status.blueprintReady, nestName: status.nestName });
    }
    // 弩炮需要的既有科技（老科技，不看图纸）
    inventory.slots.fill(null);
    inventory.add('stone', 300);
    inventory.add('iron', 120);
    inventory.add('charcoal', 80);
    inventory.add('wood', 300);
    inventory.add('fiber', 120);
    await step(2);
    out.smithing = game.research.research('smithing').ok;
    out.siegeWorks = game.research.research('siegeWorks').ok;
    const costs = {
      towerCalibration: [['wood', 18], ['iron', 8], ['stone', 16]],
      woodlandLogistics: [['wood', 24], ['fiber', 16], ['stone', 12]],
      armsMaintenance: [['iron', 12], ['charcoal', 8], ['fiber', 16]],
      charcoalBellows: [['stone', 20], ['iron', 12], ['charcoal', 12]]
    };
    out.costDeltas = {};
    out.researchResults = {};
    out.repeat = {};
    const orderedTechs = ['towerCalibration', 'woodlandLogistics', 'armsMaintenance', 'charcoalBellows'];
    for (const techId of orderedTechs) {
      // 刚好够 + 每项多 5 个余量；余量不该被扣
      inventory.slots.fill(null);
      costs[techId].forEach((entry) => inventory.add(entry[0], entry[1] + 5));
      const before = inventory.countsByItem();
      const result = game.research.research(techId);
      const after = inventory.countsByItem();
      const delta = {};
      new Set(Object.keys(before).concat(Object.keys(after))).forEach((itemId) => {
        const change = (after[itemId] || 0) - (before[itemId] || 0);
        if (change !== 0) delta[itemId] = change;
      });
      out.costDeltas[techId] = delta;
      out.researchResults[techId] = result.ok === true;
      const againBefore = inventory.countsByItem();
      const again = game.research.research(techId);
      const againAfter = inventory.countsByItem();
      out.repeat[techId] = {
        ok: again.ok,
        reason: again.reason,
        unchanged: JSON.stringify(againBefore) === JSON.stringify(againAfter)
      };
    }
    // 老科技对照：采集效率（+2）
    inventory.slots.fill(null);
    inventory.add('wood', 200);
    inventory.add('fiber', 200);
    await step(2);
    const harvestingBefore = inventory.countsByItem();
    out.harvestingResearched = game.research.research('harvesting').ok === true;
    // 扣费差值的定义统一为 after - before（花掉 = 负数），与上面 costDeltas 完全一致。
    // 这里原先写的是 before - after，符号与别处相反，判据也只是照抄了那个错符号。
    out.harvestingDelta = {
      wood: inventory.countOf('wood') - (harvestingBefore.wood || 0),
      fiber: inventory.countOf('fiber') - (harvestingBefore.fiber || 0)
    };
    out.harvestBonusTotal = game.research.harvestBonus();
    return JSON.stringify(out);
  `);

  // ------------------------------------------------- B 四项真实效果 + 幂等
  report.phases.effects = await phase('effects', `
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const step = window.__EXP__.step;
    const inventory = game.baseInventory;
    const state = window.__EXP__;
    const out = {};
    const tower = (game.friendlyUnits || []).find((unit) => unit.alive && unit.type === 'arrowTower') || null;
    const furnace = (game.friendlyUnits || []).find((unit) => unit.alive && unit.type === 'furnace') || null;
    // ---- 1) 哨站测距：已建好的箭塔 +1.5，新建弩炮同样 +1.5 ----
    out.towerRangeAfter = tower ? game.modifiers.getAttackRange(tower) : null;
    out.towerRangeExpected = tower ? tower.definition.attackRange + 1.5 : null;
    const craftRecipe = (recipeId) => {
      game.baseStorage.open();
      game.baseStorage.setTab('craft');
      game.baseStorage.lastSignature = '';
      game.baseStorage.refresh();
      return document.querySelector('[data-backpack-recipe="' + recipeId + '"]');
    };
    inventory.slots.fill(null);
    inventory.add('wood', 200);
    inventory.add('stone', 300);
    inventory.add('iron', 100);
    inventory.add('charcoal', 60);
    await step(2);
    const ballistaButton = craftRecipe('ballista');
    out.ballistaCraftable = Boolean(ballistaButton);
    if (ballistaButton) ballistaButton.click();
    game.baseStorage.close();
    await step(1);
    game.beginPlacement('ballista');
    const ballistaSpot = game.playerBase.position.clone();
    ballistaSpot.x += -4.5;
    ballistaSpot.z += 6.5;
    const ballistaPlaced = game.confirmPlacement(ballistaSpot);
    await step(200);
    const ballista = ballistaPlaced.unit || null;
    out.ballistaPlaced = Boolean(ballista);
    out.ballistaRange = ballista ? game.modifiers.getAttackRange(ballista) : null;
    out.ballistaRangeExpected = ballista ? ballista.definition.attackRange + 1.5 : null;
    out.furnaceRange = furnace ? game.modifiers.getAttackRange(furnace) : null;
    const enemyFighter = (game.enemyUnits || []).find((unit) => unit.alive && unit.id === state.enemyFighterId) || null;
    out.enemyFighterBaselineFound = Boolean(enemyFighter);
    // 敌方对照：基线那只在这么长的阶段里可能已经战死（它就在基地火力范围内），
    // 所以当场再按**真实生成路径**造一只来量。断言的是"敌方单位不获得玩家科技"
    // 这条规则，而不是某一只特定敌人的生死。
    const enemyControl = game.spawnEnemyAt('swordsman', {
      x: game.playerBase.position.x - 22,
      z: game.playerBase.position.z + 18
    }, { difficulty: 1, radius: 0.4 });
    out.enemyControlSpawned = Boolean(enemyControl);
    out.enemyFighterCostAfter = enemyControl ? game.modifiers.getDurabilityCost(enemyControl) : null;
    out.enemyFighterDefinitionAfter = enemyControl ? enemyControl.definition.weapon.durabilityCost : null;
    out.enemyFighterUnaffected = Boolean(enemyControl)
      && out.enemyFighterCostAfter > 0
      && Math.abs(out.enemyFighterCostAfter - out.enemyFighterDefinitionAfter) < 1e-9;
    // ---- 2) 林地采运：真实采集（此时采集效率也已研究 → 8） ----
    const summon = game.playerBase.position.clone();
    summon.x += 8;
    summon.z += 12;
    game.summonUnits('woodPuppet', 1, summon, 0.7, { select: false });
    const worker = (game.friendlyUnits || []).filter((unit) => unit.alive && unit.isWorker).pop() || null;
    out.harvestWorkerFound = Boolean(worker);
    if (worker) {
      game.work.registerWorker(worker, { inventory: game.createWorkerBootstrapInventory(worker.id) });
      await step(4);
      worker.workerAutonomous = true;
      worker.controlMode = null;
      const tree = game.resourceNodes.activeNodes().find((node) => (
        !node.released && (node.definitionId === 'oak' || node.definitionId === 'pine') && node.amount > 20
      )) || null;
      out.harvestTreeFound = Boolean(tree);
      if (tree) {
        worker.workerInventory.slots.fill(null);
        ['axe', 'pickaxe'].forEach((tool) => worker.workerInventory.add(tool, 1));
        game.work.notifyInventoryChanged(worker);
        worker.activityMana = worker.activityManaCapacity || worker.manaCapacity || 60;
        worker.position.set(tree.x + 1.2, worker.position.y, tree.z + 1.2);
        out.harvestAssigned = game.work.assignNode(worker, tree.id);
        const before = game.work.stats.harvestActions;
        let guard = 0;
        while (game.work.stats.harvestActions === before && guard < 400) { await step(1); guard += 1; }
        out.harvestTicks = guard;
        out.harvestAfter = worker.workerInventory.countOf(tree.resource);
        const record = game.work.recordFor(worker);
        out.harvestError = record ? record.lastError : null;
      }
    }
    out.harvestBonus = game.research.harvestBonus();
    // ---- 2b) 工具磨损保持原规则：军械保养只改战斗的 attributes.durabilityCost，
    //          采集工具磨损直接扣 item.data.durability（WorkSystem.settleWorkSwing → spendWorkerToolWear），
    //          两者不是同一条路。同一动作在"有/无军械保养"下各量一次，磨损必须完全一致且等于规则值。
    out.toolWear = null;
    if (worker) {
      const record = game.work.recordFor(worker);
      const axeDurability = () => {
        const slot = record?.inventory?.slots?.find((entry) => entry && entry.itemId === 'axe');
        return slot && slot.data && Number.isFinite(slot.data.durability) ? slot.data.durability : null;
      };
      const measureToolWear = async () => {
        const node = game.resourceNodes.activeNodes().find((entry) => (
          !entry.released && (entry.definitionId === 'oak' || entry.definitionId === 'pine') && entry.amount > 20
        )) || null;
        if (!node) return { error: 'no_tree' };
        worker.workerAutonomous = true;
        worker.controlMode = null;
        worker.activityMana = worker.activityManaCapacity || worker.manaCapacity || 60;
        worker.position.set(node.x + 1.2, worker.position.y, node.z + 1.2);
        game.work.assignNode(worker, node.id);
        const before = axeDurability();
        const actionsBefore = game.work.stats.harvestActions;
        let guard = 0;
        while (game.work.stats.harvestActions === actionsBefore && guard < 400) { await step(1); guard += 1; }
        const after = axeDurability();
        return {
          before,
          after,
          actions: game.work.stats.harvestActions - actionsBefore,
          wear: before != null && after != null ? Math.round((before - after) * 1000) / 1000 : null
        };
      };
      out.toolWearWithArms = await measureToolWear();
      game.research.researched.delete('armsMaintenance');
      game.research.refreshTechUnitEffects();
      out.toolWearWithoutArms = await measureToolWear();
      game.research.researched.add('armsMaintenance');
      game.research.refreshTechUnitEffects();
      out.toolWearRule = game.work.rules.harvestToolWear ?? 1;
      out.toolWear = {
        withArms: out.toolWearWithArms.wear,
        withoutArms: out.toolWearWithoutArms.wear,
        rule: out.toolWearRule,
        unchanged: out.toolWearWithArms.wear != null
          && out.toolWearWithArms.wear === out.toolWearWithoutArms.wear
          && out.toolWearWithArms.wear === out.toolWearRule
      };
    }
    // ---- 3) 军械保养：真实攻击一次 1.15 → 0.92 ----
    const fighter = (game.friendlyUnits || []).find((unit) => unit.alive && unit.id === (state.fight ? state.fight.fighterId : null)) || null;
    const dummy = (game.enemyUnits || []).find((unit) => unit.alive && unit.id === (state.fight ? state.fight.dummyId : null)) || null;
    out.fighterFound = Boolean(fighter && dummy);
    if (fighter && dummy) {
      out.fighterCostAfter = game.modifiers.getDurabilityCost(fighter);
      out.fighterCostExpected = fighter.definition.weapon.durabilityCost * 0.8;
      fighter.attributes.setBase('maxDurability', 5000);
      fighter.weapon.durability = 5000;
      const before = fighter.weapon.durability;
      let guard = 0;
      while (fighter.weapon.durability >= before && guard < 200) {
        dummy.position.x = fighter.position.x + 1.4;
        dummy.position.z = fighter.position.z;
        dummy.moveGoal = null;
        await step(1);
        guard += 1;
      }
      out.fighterCostMeasuredAfter = before - fighter.weapon.durability;
      const sample = () => Math.round(game.modifiers.getDurabilityCost(fighter) * 10000) / 10000;
      out.idempotence = { base: sample(), definition: fighter.definition.weapon.durabilityCost };
      for (let i = 0; i < 3; i += 1) game.research.applyUnitTechAttributes(fighter);
      out.idempotence.afterTripleApply = sample();
      game.research.refreshTechUnitEffects();
      out.idempotence.afterRefreshAll = sample();
      const researchedList = Array.from(game.research.researched);
      game.research.applySnapshot({ researched: researchedList });
      out.idempotence.afterSnapshot = sample();
      game.research.reset();
      out.idempotence.afterReset = sample();
      game.research.applySnapshot({ researched: researchedList });
      out.idempotence.afterRestore = sample();
      // 换武器：不变口径、不叠乘（换成同族的旧剑，耐久基数与出生武器一致）
      game.applyWeaponToUnit(fighter, 'wornSword', {});
      out.idempotence.afterWeaponApply = sample();
      out.maxDurabilityNotChanged = Math.abs(game.modifiers.getMaxDurability(fighter)
        - (fighter.definition.weapon.maxDurability)) < 1e-9;
      // 归队：真实招募一支单位，归队后立刻享受折扣
      const recruitSpot = game.playerBase.position.clone();
      recruitSpot.x += 3;
      recruitSpot.z += 14;
      const recruitable = game.spawnEnemyAt('towerShield', { x: recruitSpot.x, z: recruitSpot.z }, { difficulty: 1, radius: 0.4 });
      if (recruitable) {
        recruitable.isRecruitable = true;
        inventory.add('recruitmentOrder', 1);
        const recruited = game.recruitUnit(recruitable);
        out.recruitOk = recruited.ok === true;
        out.recruitedTeam = recruitable.team;
        out.recruitedCost = Math.round(game.modifiers.getDurabilityCost(recruitable) * 10000) / 10000;
        out.recruitedCostExpected = Math.round(recruitable.definition.weapon.durabilityCost * 0.8 * 10000) / 10000;
        // 归队后的装备判断必须读**真实伤害字段**：这个刚招募来的塔盾兵
        // 它的 weapon.damage 是 undefined，旧写法会把它当成"没有武器"，于是玩家有部队了
        // 还被 HUD 催着去做木棒。这里同时记下新口径与旧口径，判据比的是两者不同。
        game.expeditions.invalidate();
        game.expeditions.update(0);
        const descriptors = game.expeditions.loadoutDescriptors();
        const descriptor = descriptors.find((entry) => entry.id === recruitable.id) || null;
        out.recruitedDescriptor = descriptor ? {
          type: descriptor.type,
          nativeWeaponDamage: descriptor.nativeWeaponDamage,
          oldFormula: Math.max(0, Number(recruitable.definition.weapon?.damage) || 0),
          isWorker: descriptor.isWorker,
          isBuilding: descriptor.isBuilding
        } : null;
        const loadout = game.expeditions.snapshot().loadout;
        out.loadoutNeedsWeapon = loadout.needsWeapon;
        out.loadoutNativeCount = loadout.nativeArmedCount;
        out.loadoutNativeNames = loadout.nativeArmedNames;
        // 白天、不追踪时：目标句不该再喊"先合成并装备傀儡木棒"
        game.expeditions.untrack();
        game.dayNight.phase = 'day';
        game.dayNight.phaseElapsed = 0;
        game.expeditions.invalidate();
        game.expeditions.update(0);
        // updateHud 有 0.1 秒节流，一帧 0.05 秒不一定刷到；多跑几帧确保 DOM 已更新。
        await step(4);
        out.hudAfterTroops = document.querySelector('#survival-objective').textContent;
        out.hudNoWeaponNag = !/先合成并装备傀儡木棒/.test(out.hudAfterTroops || '');
        out.hudHasContent = (out.hudAfterTroops || '').length > 12 && /。/.test(out.hudAfterTroops || '');
      }
    }
    // ---- 4) 炭窑鼓风：真实周期 8 → 6 秒，产量 2；叠上高效烧炭 → 3 ----
    if (furnace) {
      state.feedFurnace(furnace, 400);
      await step(4);
      out.furnaceLoadAfter = { ...state.lastFeed };
      const techRun = await state.runCycles(furnace, 2);
      out.techRun = techRun;
      const furnaceRecordAfter = game.production.producers.get(furnace.id) || null;
      out.recipeRegisteredAfter = Boolean(furnaceRecordAfter && furnaceRecordAfter.recipe);
      out.recipeSecondsAfter = out.recipeRegisteredAfter ? furnaceRecordAfter.recipe.seconds : null;
      inventory.add('stone', 100);
      inventory.add('charcoal', 60);
      await step(2);
      out.efficientFuelResearched = game.research.research('efficientFuel').ok === true;
      state.feedFurnace(furnace, 400);
      await step(4);
      const stacked = await state.runCycles(furnace, 2);
      out.stackedRun = stacked;
    }
    return JSON.stringify(out);
  `);

  // ------------------------------------------------- C 清线后不再新出兵 / 残兵 / 判胜
  report.phases.raid = await phase('raid', `
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const step = window.__EXP__.step;
    const out = {};
    const westIds = ['island-west-ridge', 'island-outer-northwest'];
    const westUnits = () => (game.enemyUnits || []).filter((unit) => (
      unit.alive && !unit.isSpawnPointNest && westIds.indexOf(unit.spawnPointId) >= 0
    ));
    // 先整条线清干净。顺序很关键：只拆内巢时外巢会解除封印、在之前那几个阶段里
    // 一直出兵，那些兵混进来会让"只剩我们故意留的残兵"这条断言失真，
    // 而且会让人误以为"清线后还在出新兵"。先清外巢，再清掉这条线上已经在场的敌人，
    // 残兵实验才从已知状态出发（数量记下来，不藏）。
    if (!game.spawnPoints.pointById('island-outer-northwest').cleared) {
      game.spawnPoints.destroyPoint('island-outer-northwest');
    }
    await step(4);
    out.westPointsCleared = game.spawnPoints.pointById('island-west-ridge').cleared === true
      && game.spawnPoints.pointById('island-outer-northwest').cleared === true;
    const preexistingWest = westUnits();
    out.westPreexistingRemoved = preexistingWest.length;
    preexistingWest.forEach((unit) => {
      unit.alive = false;
      game.handleUnitDeath(unit, null);
    });
    await step(2);
    // 在"西线已清"的状态下留两个残兵：兵不会凭空消失，清线只停止**新**出兵
    const westSpot = game.spawnPoints.pointById('island-west-ridge');
    const residual = [];
    for (let i = 0; i < 2; i += 1) {
      const unit = game.spawnEnemyAt('goblinSoldier', { x: westSpot.x + i, z: westSpot.z + 1 }, { difficulty: 1, radius: 0.4 });
      if (unit) {
        unit.spawnPointId = 'island-west-ridge';
        residual.push(unit.id);
      }
    }
    game.expeditions.invalidate();
    game.expeditions.update(0);
    out.residualSpawned = residual.length;
    out.residualCounted = game.expeditions.snapshot().forecast.residual;
    // 整线清完后"查看位置"必须禁用：这条线已经没有目标点，镜头不能被挪到地图原点
    if (!game.expeditionPanel.isOpen()) document.querySelector('#expedition-toggle').click();
    game.expeditions.invalidate();
    game.expeditions.update(0);
    game.expeditionPanel.refresh({ force: true });
    await step(2);
    const westFocus = document.querySelector('[data-expedition-focus="west"]');
    out.westCardFound = Boolean(westFocus);
    out.westFocusDisabled = westFocus ? westFocus.disabled : null;
    out.westStageLabel = game.expeditions.briefById('west').stateLabel;
    out.westTargetX = game.expeditions.briefById('west').targetX;
    const cameraBeforeFailFocus = { x: game.cameraTarget.x, z: game.cameraTarget.z };
    out.westFocusRoute = game.expeditions.focusRoute('west');
    out.westFocusDidNotMoveCamera = Math.abs(game.cameraTarget.x - cameraBeforeFailFocus.x) < 1e-9
      && Math.abs(game.cameraTarget.z - cameraBeforeFailFocus.z) < 1e-9;
    if (game.expeditionPanel.isOpen()) game.expeditionPanel.close();
    // 入夜：其它点封住，只让北岬盾巢（已解除封印）当对照
    game.dayNight.phase = 'night';
    game.dayNight.phaseElapsed = 0;
    (game.spawnPoints.points || []).forEach((point) => { point.timer = 9999; });
    game.spawnPoints.pointById('island-outer-north').timer = 0;
    const controlPoint = game.spawnPoints.pointById('island-outer-north');
    const spawnedStatsBefore = game.spawnPoints.stats.spawned;
    const westIdsBefore = westUnits().map((unit) => unit.id).sort();
    const northIdsBefore = (game.enemyUnits || []).filter((unit) => unit.alive && unit.spawnPointId === 'island-outer-north').map((unit) => unit.id).sort();
    await step(80);
    const westIdsAfter = westUnits().map((unit) => unit.id).sort();
    const northIdsAfter = (game.enemyUnits || []).filter((unit) => unit.alive && unit.spawnPointId === 'island-outer-north').map((unit) => unit.id).sort();
    out.spawnedStatsDelta = game.spawnPoints.stats.spawned - spawnedStatsBefore;
    out.controlPointTimer = controlPoint.timer;
    out.controlPointSpawned = northIdsAfter.length > northIdsBefore.length;
    out.westNewUnits = westIdsAfter.filter((unitId) => westIdsBefore.indexOf(unitId) < 0).length;
    out.westAliveAfter = westIdsAfter.length;
    out.westOnlyResidual = westIdsAfter.every((unitId) => residual.indexOf(unitId) >= 0);
    out.raidModifiers = game.nightRaidModifiers();
    out.forecastIsNight = game.expeditions.snapshot().forecast.isNight;
    out.currentNight = game.expeditions.snapshot().forecast.currentNightNumber;
    out.nextNight = game.expeditions.snapshot().forecast.nextNightNumber;
    out.safeRouteIds = game.expeditions.snapshot().forecast.safeRoutes.map((route) => route.id);
    // 判胜：还有残兵不能赢；清掉残兵后其余点位未清也不能赢
    out.victoryWithResidual = game.spawnPoints.checkVictory();
    residual.forEach((unitId) => {
      const unit = (game.enemyUnits || []).find((entry) => entry.id === unitId);
      if (unit && unit.alive) { unit.alive = false; game.handleUnitDeath(unit, null); }
    });
    await step(2);
    out.victoryAfterResidual = game.spawnPoints.checkVictory();
    out.remainingPoints = game.spawnPoints.progress().remaining;
    return JSON.stringify(out);
  `);

  // ------------------------------------------------- D 移动端布局
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(250);
  report.phases.mobile = await phase('mobile', `
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const step = window.__EXP__.step;
    const out = {};
    const button = document.querySelector('#expedition-toggle');
    if (!game.expeditionPanel.isOpen()) button.click();
    await step(3);
    out.viewport = { width: window.innerWidth, height: window.innerHeight };
    out.docNoHorizontalOverflow = document.documentElement.scrollWidth <= window.innerWidth + 1;
    const frame = document.querySelector('.expedition-frame');
    const rect = frame.getBoundingClientRect();
    out.frameRect = { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
    out.frameInsideViewport = rect.left >= -1 && rect.right <= window.innerWidth + 1
      && rect.top >= -1 && rect.bottom <= window.innerHeight + 1;
    const list = document.querySelector('.expedition-list');
    out.listOverflowY = window.getComputedStyle(list).overflowY;
    out.listScrollable = list.scrollHeight > list.clientHeight || window.getComputedStyle(list).overflowY === 'auto';
    const cards = Array.from(document.querySelectorAll('[data-expedition-route]'));
    out.cardTextOverflow = cards.map((card) => ({
      id: card.dataset.expeditionRoute,
      overflow: card.scrollWidth > card.clientWidth + 2,
      clientWidth: card.clientWidth,
      scrollWidth: card.scrollWidth
    }));
    out.noCardOverflow = out.cardTextOverflow.every((entry) => entry.overflow === false);
    out.trackableFromMobile = Boolean(document.querySelector('[data-expedition-track="south"]'));
    return JSON.stringify(out);
  `);
  await sleep(200);
  shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(`${OUT_DIR}/expedition-mobile-390x844.png`, Buffer.from(shot.data, 'base64'));
  report.screenshots.push(`${OUT_DIR}/expedition-mobile-390x844.png`);

  // ------------------------------------------------- D 交互与生命周期
  report.phases.lifecycle = await phase('lifecycle', `
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const step = window.__EXP__.step;
    const out = {};
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await step(2);
    out.escClosed = game.expeditionPanel.isOpen() === false;
    out.escNotPaused = game.paused === false;
    // B 键规则不变：选中一个非建筑己方单位后开背包（选中建筑时 B 开的是它的设施面板）
    const worker = (game.friendlyUnits || []).find((unit) => unit.alive && unit.isWorker && !unit.isBuilding) || null;
    game.selectUnit(worker);
    await step(2);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
    await step(2);
    out.backpackOpenedByB = game.backpack.isOpen() === true;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
    await step(2);
    out.backpackClosedByB = game.backpack.isOpen() === false;
    // 暂停后继续：面板仍可用，且打开面板不会暂停
    game.setPaused(true, 'test');
    await step(2);
    out.pausedFlag = game.paused === true;
    game.setPaused(false, 'test');
    document.querySelector('#expedition-toggle').click();
    await step(2);
    out.panelAfterResume = game.expeditionPanel.isOpen() === true;
    out.notPausedByPanel = game.paused === false;
    // 关闭不重建 DOM、内容不变不反复重建：
    //   - 收起后根节点还是同一个（只是 hidden），不是拆掉再建一个新的；
    //   - 采样版本没变时 refresh() 直接返回 false，一个 DOM 节点都不碰。
    const panelRoot = document.querySelector('#expedition-panel');
    game.expeditionPanel.close();
    out.closeKeepsRoot = panelRoot === document.querySelector('#expedition-panel')
      && panelRoot.hidden === true
      && document.querySelectorAll('#expedition-panel').length === 1;
    out.refreshWhileClosedIsNoop = game.expeditionPanel.refresh() === false;
    game.expeditionPanel.open();
    const cardBefore = document.querySelector('[data-expedition-route="north"]');
    const cardTextBefore = cardBefore ? cardBefore.textContent : null;
    out.reopenReusesRoot = panelRoot === document.querySelector('#expedition-panel');
    out.noopRefreshKeepsNodes = game.expeditionPanel.refresh() === false
      && document.querySelector('[data-expedition-route="north"]') === cardBefore;
    game.expeditionPanel.close();
    game.expeditionPanel.open();
    out.reopenCardTextSame = cardTextBefore != null
      && document.querySelector('[data-expedition-route="north"]')?.textContent === cardTextBefore;
    game.expeditionPanel.close();
    return JSON.stringify(out);
  `);

  report.phases.restart = await phase('restart', `
    const out = {};
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    game.setPaused(true, 'test');
    const restartButton = document.querySelector('[data-pause-action="restart"]');
    out.restartButtonFound = Boolean(restartButton);
    if (restartButton) restartButton.click();
    return JSON.stringify(out);
  `);
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    await sleep(500);
    const hasNew = await ev(`(() => {
      const game = window.__VILLAGE_WAR_DEBUG__ && window.__VILLAGE_WAR_DEBUG__.game;
      return Boolean(game && game.expeditions && game.expeditionPanel && game.worldConfig);
    })()`);
    if (hasNew) { ready = true; break; }
  }
  report.phases.afterRestartReady = ready;
  if (ready) {
    report.phases.afterRestart = await phase('afterRestart', `
      const game = window.__VILLAGE_WAR_DEBUG__.game;
      const out = {};
      out.panelRootsBeforeOpen = document.querySelectorAll('#expedition-panel').length;
      out.trackedIdAfterRestart = game.expeditions.trackedId;
      const button = document.querySelector('#expedition-toggle');
      out.buttonHidden = button.hidden;
      button.click();
      await new Promise((r) => setTimeout(r, 150));
      out.panelRootsAfterOpen = document.querySelectorAll('#expedition-panel').length;
      out.panelOpen = game.expeditionPanel.isOpen() === true;
      out.ariaExpanded = button.getAttribute('aria-expanded');
      button.click();
      await new Promise((r) => setTimeout(r, 150));
      out.closedAfterSecondClick = game.expeditionPanel.isOpen() === false;
      const targetGame = game;
      targetGame.destroy();
      out.rootsAfterDestroy = document.querySelectorAll('#expedition-panel').length;
      out.buttonHiddenAfterDestroy = document.querySelector('#expedition-toggle').hidden;
      return JSON.stringify(out);
    `);
  }
}

// ------------------------------------------------------------------ 判定
const p = report.phases;
const cardFactsOk = (facts) => Array.isArray(facts) && facts.length === 4 && facts.every((fact) => (
  fact.textHasTarget && fact.textHasEnemy && fact.textHasDrop && fact.textHasBlueprint
  && fact.strategyHasBlueprint && fact.pointName === fact.targetName
));
const near = (a, b, tolerance = 0.02) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tolerance;
const costs = {
  towerCalibration: { wood: -18, iron: -8, stone: -16 },
  woodlandLogistics: { wood: -24, fiber: -16, stone: -12 },
  armsMaintenance: { iron: -12, charcoal: -8, fiber: -16 },
  charcoalBellows: { stone: -20, iron: -12, charcoal: -12 }
};

const verdict = {
  booted: report.started === true && report.errors.length === 0,
  // A1 开局事实 + 面板真实按钮
  openingFacts: Boolean(p.opening
    && p.opening.workerCount === 1
    && p.opening.combatGuardCount === 0
    && p.opening.spawnPointCount === 8
    && p.opening.fieldCampCount === 3),
  panelLazyAndOpens: Boolean(p.opening
    && p.opening.panelBeforeOpen === 0
    && p.opening.buttonExists === true
    && p.opening.buttonHidden === false
    && p.opening.panelRootCount === 1
    && p.opening.panelOpen === true
    && p.opening.pausedAfterOpen === false
    && p.opening.buttonAria === 'true'),
  panelShowsRealRouteData: Boolean(p.opening
    && JSON.stringify(p.opening.cardIds) === JSON.stringify(['north', 'west', 'east', 'south'])
    && cardFactsOk(p.opening.cardFacts)),
  openingObjective: Boolean(p.opening
    && p.opening.openingAsksForWeapon === true
    && p.opening.openingDoesNotPushCamp === true),
  forecastMatchesGateTruth: Boolean(p.opening
    && p.opening.forecastCounts.threatening === 4
    && p.opening.forecastCounts.sealed === 4
    && p.opening.forecastCounts.cleared === 0
    && /正在威胁基地 4 座/.test(p.opening.forecastText || '')),
  // A2 追踪 / 相机 / 无指令 / 采样与帧率无关
  trackingWorks: Boolean(p.tracking
    && p.tracking.trackedId === 'west'
    && p.tracking.hudHasWestTarget === true
    && p.tracking.hudHasBlueprint === true
    && p.tracking.hudHasResearch === true
    && p.tracking.trackedStillWest === true
    && p.tracking.hudStillWest === true
    && p.tracking.trackButtonLabel === '取消追踪'),
  focusOnlyMovesCamera: Boolean(p.tracking
    && p.tracking.followBefore === true
    && p.tracking.followAfterFocus === false
    && p.tracking.cameraNearWest === true
    && p.tracking.cameraInBounds === true
    && p.tracking.noMoveOrdersIssued === true
    && p.tracking.selectedUnchanged === true),
  // 追踪不会让单位失去移动命令：面板开着、追踪生效时真实下达一次移动命令
  moveCommandsUnaffected: Boolean(p.tracking
    && p.tracking.moveCommandIssued === true
    && p.tracking.moveCommandTookEffect === true
    && p.tracking.panelStillOpenAfterCommand === true
    && p.tracking.trackedStillWestAfterCommand === true),
  samplingFrameRateIndependent: Boolean(p.tracking && p.tracking.rebuildsMatch === true),
  // A3 清内巢 → 外巢 + 图纸
  blueprintGate: Boolean(p.blueprint
    && p.blueprint.lockedErrorReason === 'missing_blueprint'
    && p.blueprint.lockedLabelNamesNest === true
    && p.blueprint.lockedNoDeduction === true
    && p.blueprint.stillLockedAfterUnrelated === 'missing_blueprint'
    && p.blueprint.destroyOk === true
    && p.blueprint.northBlueprintReady === true
    && p.blueprint.northTargetSwitched === true
    && p.blueprint.hudFollowsOuter === true
    && p.blueprint.outerWarned === true
    && p.blueprint.outerNowThreatening === true),
  // B 基线（研究前）
  baselineMeasured: Boolean(p.baseline
    && p.baseline.stationReady === true
    && p.baseline.towerPlaced === true
    && p.baseline.furnacePlaced === true
    && p.baseline.furnaceStationFound === true
    && near(p.baseline.towerRangeBefore, p.baseline.towerRangeDefinition)
    && p.baseline.harvestBaseline === 5
    && p.baseline.baseRun && p.baseline.baseRun.cycles >= 2
    // 装料必须真的进到进料格：added 0 就意味着后面所有烧炭读数都是"设施空转"
    && p.baseline.furnaceLoad && p.baseline.furnaceLoad.inputAdded > 0 && p.baseline.furnaceLoad.fuelAdded > 0
    // 配方必须真的解析出来了，而不是靠可选链把 null 读成 null 混过去
    && p.baseline.recipeRegisteredBefore === true
    && near(p.baseline.recipeSecondsBefore, 8, 0.01)
    && near(p.baseline.baseRun.secondsPerCycle, 8, 0.4)
    && near(p.baseline.baseRun.outputPerCycle, 2, 0.01)
    && near(p.baseline.baseRun.inputPerCycle, 4, 0.01)
    && near(p.baseline.baseRun.fuelPerCycle, 2, 0.01)
    // 周期读数必须是在"没有停摆"的窗口里量的，否则墙钟时间不等于配方周期
    && p.baseline.baseRun.stalledTicks === 0
    && p.baseline.baseRun.reasons.working === p.baseline.baseRun.ticks / 2
    && p.baseline.fighterCostDefinition > 0
    && near(p.baseline.fighterCostMeasured, p.baseline.fighterCostDefinition, 0.001)),
  // B 四座内巢解锁 + 整笔原子扣费 + 重复研究不扣费 + 老科技对照
  researchGatedByNests: Boolean(p.research
    && Array.isArray(p.research.stages)
    && p.research.stages.length === 3
    && p.research.stages.every((stage) => stage.blueprintReady === true && Boolean(stage.nestName))
    && p.blueprint.northBlueprintReady === true),
  researchSpendsExactly: Boolean(p.research
    && ['towerCalibration', 'woodlandLogistics', 'armsMaintenance', 'charcoalBellows'].every((techId) => (
      p.research.researchResults[techId] === true
      && JSON.stringify(p.research.costDeltas[techId]) === JSON.stringify(costs[techId])
    ))
    && p.research.harvestingResearched === true
    // 差值统一定义为 after - before（花掉 = 负数），与上面 costDeltas 同一口径
    && p.research.harvestingDelta.wood === -40
    && p.research.harvestingDelta.fiber === -25),
  repeatResearchFree: Boolean(p.research
    && ['towerCalibration', 'woodlandLogistics', 'armsMaintenance', 'charcoalBellows']
      .every((techId) => p.research.repeat[techId]
        && p.research.repeat[techId].ok === false
        && p.research.repeat[techId].unchanged === true)),
  // B 四项真实效果
  towerCalibrationEffect: Boolean(p.effects
    && near(p.effects.towerRangeAfter, p.effects.towerRangeExpected)
    && near(p.effects.ballistaRange, p.effects.ballistaRangeExpected)
    && p.effects.furnaceRange === 0
    && p.effects.enemyControlSpawned === true
    && p.effects.enemyFighterUnaffected === true),
  woodlandLogisticsEffect: Boolean(p.effects
    && p.effects.harvestAfter === 8
    && p.effects.harvestBonus === 3
    && p.baseline.harvestBaseline === 5),
  armsMaintenanceEffect: Boolean(p.effects
    && p.effects.fighterFound === true
    && near(p.effects.fighterCostAfter, p.effects.fighterCostExpected)
    && near(p.effects.fighterCostMeasuredAfter, p.effects.fighterCostExpected, 0.001)
    && near(p.effects.fighterCostMeasuredAfter, p.baseline.fighterCostDefinition * 0.8, 0.001)),
  armsMaintenanceIdempotent: Boolean(p.effects && p.effects.idempotence
    && p.effects.idempotence.base === p.effects.idempotence.afterTripleApply
    && p.effects.idempotence.base === p.effects.idempotence.afterRefreshAll
    && p.effects.idempotence.base === p.effects.idempotence.afterSnapshot
    && p.effects.idempotence.base === p.effects.idempotence.afterWeaponApply
    && p.effects.idempotence.base === p.effects.idempotence.afterRestore
    && near(p.effects.idempotence.afterReset, p.effects.idempotence.definition, 1e-9)
    && p.effects.maxDurabilityNotChanged === true),
  armsMaintenanceRecruit: Boolean(p.effects
    && p.effects.recruitOk === true
    && p.effects.recruitedTeam === 'player'
    && near(p.effects.recruitedCost, p.effects.recruitedCostExpected, 0.0001)),
  charcoalBellowsEffect: Boolean(p.effects
    && p.effects.recipeRegisteredAfter === true
    && near(p.effects.recipeSecondsAfter, 6, 0.01)
    && p.effects.furnaceLoadAfter && p.effects.furnaceLoadAfter.inputAdded > 0
    && p.effects.techRun && p.effects.techRun.cycles >= 2
    && near(p.effects.techRun.secondsPerCycle, 6, 0.4)
    && near(p.effects.techRun.outputPerCycle, 2, 0.01)
    && near(p.effects.techRun.inputPerCycle, 4, 0.01)
    && p.effects.techRun.stalledTicks === 0
    && p.effects.efficientFuelResearched === true
    && p.effects.stackedRun && p.effects.stackedRun.cycles >= 2
    && near(p.effects.stackedRun.secondsPerCycle, 6, 0.4)
    && near(p.effects.stackedRun.outputPerCycle, 3, 0.01)
    && p.effects.stackedRun.stalledTicks === 0
    && near(p.baseline.baseRun.secondsPerCycle, 8, 0.4)),
  // B 装备判断读真实伤害字段：真实招募来的塔盾兵不能被当成"没有武器"
  nativeWeaponLoadout: Boolean(p.effects
    && p.effects.recruitedDescriptor
    && p.effects.recruitedDescriptor.nativeWeaponDamage > 0
    && p.effects.recruitedDescriptor.oldFormula === 0
    && p.effects.loadoutNeedsWeapon === false
    && p.effects.loadoutNativeCount >= 1
    && p.effects.loadoutNativeNames.length >= 1
    && p.effects.hudNoWeaponNag === true
    && p.effects.hudHasContent === true),
  // B 军械保养只改战斗耐久折扣，采集工具磨损保持原规则（同一动作有无科技一致）
  toolWearUnchanged: Boolean(p.effects
    && p.effects.toolWear
    && p.effects.toolWear.withArms > 0
    && p.effects.toolWear.unchanged === true),
  // C 清线回报
  clearedLineStopsSpawns: Boolean(p.raid
    && p.raid.westPointsCleared === true
    && p.raid.controlPointSpawned === true
    && p.raid.westNewUnits === 0
    && p.raid.westOnlyResidual === true
    && p.raid.safeRouteIds.indexOf('west') >= 0),
  clearedRouteFocusDisabled: Boolean(p.raid
    && p.raid.westCardFound === true
    && p.raid.westFocusDisabled === true
    && p.raid.westTargetX === null
    && p.raid.westFocusRoute && p.raid.westFocusRoute.ok === false
    && p.raid.westFocusRoute.reason === 'no_target'
    && p.raid.westFocusDidNotMoveCamera === true
    && /全线清除/.test(p.raid.westStageLabel || '')),
  residualAndVictoryRetained: Boolean(p.raid
    && p.raid.residualSpawned === 2
    && p.raid.residualCounted >= 2
    && p.raid.victoryWithResidual === false
    && p.raid.victoryAfterResidual === false
    && p.raid.remainingPoints > 0),
  // D 布局与生命周期
  mobileLayout: Boolean(p.mobile
    && p.mobile.docNoHorizontalOverflow === true
    && p.mobile.frameInsideViewport === true
    && p.mobile.noCardOverflow === true
    && p.mobile.trackableFromMobile === true),
  escapeAndBackpack: Boolean(p.lifecycle
    && p.lifecycle.escClosed === true
    && p.lifecycle.escNotPaused === true
    && p.lifecycle.backpackOpenedByB === true
    && p.lifecycle.backpackClosedByB === true
    && p.lifecycle.panelAfterResume === true
    && p.lifecycle.notPausedByPanel === true),
  // D 面板 DOM 稳定性：关闭不重建、内容不变不反复重建
  panelDomStability: Boolean(p.lifecycle
    && p.lifecycle.closeKeepsRoot === true
    && p.lifecycle.refreshWhileClosedIsNoop === true
    && p.lifecycle.reopenReusesRoot === true
    && p.lifecycle.noopRefreshKeepsNodes === true
    && p.lifecycle.reopenCardTextSame === true),
  restartLifecycle: Boolean(p.afterRestartReady === true
    && p.afterRestart
    && p.afterRestart.panelRootsBeforeOpen === 0
    && p.afterRestart.panelRootsAfterOpen === 1
    && p.afterRestart.panelOpen === true
    && p.afterRestart.ariaExpanded === 'true'
    && p.afterRestart.closedAfterSecondClick === true
    && p.afterRestart.rootsAfterDestroy === 0
    && p.afterRestart.buttonHiddenAfterDestroy === true)
};

report.verdict = verdict;
mkdirSync(TMP_DIR, { recursive: true });
writeFileSync(`${TMP_DIR}/verify-island-expedition.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verdict: verdict, errors: report.errors, problems: problems }, null, 2));
const failed = Object.entries(verdict).filter(([, value]) => value !== true).map(([key]) => key);
const ok = failed.length === 0 && problems.length === 0;
if (failed.length) console.log('FAILED CHECKS: ' + failed.join(', '));
if (report.errors.length) console.log('PHASE ERRORS: ' + report.errors.join(' | '));
if (problems.length) console.log('PAGE PROBLEMS: ' + problems.join(' | '));
console.log(ok ? '\nISLAND EXPEDITION: PASS' : '\nISLAND EXPEDITION: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
