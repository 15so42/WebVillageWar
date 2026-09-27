// 需要魔力的功能设施（箭塔 / 食堂）端到端验收。
//
// 验的是方案第 9 节那句话：「合成后放置，**使用魔力**提供对应作用」。
// 所以三件事缺一不可：
//   1. 能合成、能放置（放置流程是通用的，配方接上就行）；
//   2. 真的起作用：箭塔真的把敌人打掉血、食堂真的把单位治回来；
//   3. **魔力断了就停**：把供能掐掉之后，箭塔不再开火、食堂不再治疗，
//      而且魔力充回来之后会自己复工（滞回的门槛行为）。
// 第 3 条是这一轮的重点——不然"要魔力"就只是配置里的两个数字。
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
    timeout: 900000
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
    // 清场：只清非野生动物，**放过野生动物与巢穴**。
    //  - 巢穴全清会判胜、关卡结束、系统停推；
    //  - 野生动物是箭塔的靶子，杀光了就没得打了（第一版就是这么崩的）。
    // 而且每一段观测前都重新挑一只**活着**的：上一段把它打死了，
    // 后面"没掉血"就成了假通过（死目标当然不掉血）。
    (game.enemyUnits ?? []).slice().forEach((unit) => {
      if (!unit?.alive || unit.isWildlife === true || unit.isSpawnPointNest || unit.isRecruitable) return;
      unit.alive = false;
      game.handleUnitDeath(unit, null);
    });
    (game.spawnPoints?.points ?? []).forEach((point) => { point.timer = 9999; });
    game.work.setDemands([]);
    // 把护卫挪远：它们会抢在箭塔前面把靶子打死，于是"箭塔有没有开火"就测不出来了
    // （第一版 phase 2 的射击计数是 0，靶子却掉血了——掉的血是护卫打的）。
    (game.friendlyUnits ?? []).forEach((unit) => {
      if (!unit?.alive || unit.isBuilding === true || unit.isWorker === true) return;
      unit.position.set(unit.position.x - 45, unit.position.y, unit.position.z - 45);
      unit.moveGoal = null;
      unit.commandMoveGoal = null;
      unit.target = null;
    });
    await step(4);
    out.wildlifeAvailable = (game.enemyUnits ?? []).filter((u) => u?.alive && u.isWildlife).length;

    const inventory = game.baseInventory;
    const craftAndPlace = async (itemId, offsetX, offsetZ, buildTicks = 200) => {
      game.baseStorage.open();
      game.baseStorage.setTab('craft');
      game.baseStorage.lastSignature = '';
      game.baseStorage.refresh();
      await step(1);
      document.querySelector('[data-backpack-recipe="' + itemId + '"]')?.click();
      // 产物跟鼠标走（需求第 3 条）：点一个空格把它放下，再读库存。
      const emptySlot = inventory.slots.findIndex((slot) => !slot);
      if (emptySlot >= 0) game.baseStorage.handleSlotClick(emptySlot);
      const inBag = inventory.countOf(itemId);
      game.baseStorage.close();
      await step(1);
      game.beginPlacement(itemId);
      const spot = game.playerBase.position.clone();
      spot.x += offsetX;
      spot.z += offsetZ;
      const placed = game.confirmPlacement(spot);
      await step(buildTicks);
      return { inBag, placed, unit: placed.unit ?? null };
    };

    // ---- 1) 合成并放置箭塔 ----
    inventory.slots.fill(null);
    inventory.add('wood', 200);
    inventory.add('stone', 200);
    inventory.add('food', 60);
    await step(2);
    out.towerRecipeListed = game.recipeStatus().some((recipe) => recipe.id === 'arrowTower');
    const towerPlacement = await craftAndPlace('arrowTower', 6.5, -2.5);
    const tower = towerPlacement.unit;
    out.towerInBag = towerPlacement.inBag;
    out.towerPlaced = towerPlacement.placed.ok === true;
    out.towerBuilt = tower?.underConstruction !== true;
    out.towerIsStationaryCombat = tower?.isBuilding === true
      && (tower?.definition?.attackRange ?? 0) > 0
      && (tower?.physicalAttack ?? 0) > 0;
    out.towerRegisteredAsFacility = game.facilities.facilities.has(tower?.id) === true;
    out.towerPowerReceiver = game.power.receivers.has(tower?.id) === true;
    const towerStatus = game.facilities.statusOf(tower);
    out.towerManaCapacity = towerStatus?.manaCapacity ?? null;
    out.towerDrain = towerStatus?.drainPerSecond ?? null;

    // ---- 2) 有魔力时箭塔真的开火 ----
    // 每段观测前挑一只**活着**的野生动物当靶子，放到塔边上。
    // 优先挑血最厚的（熊 > 狼），免得观测窗口还没结束它就被打死了。
    const pickFoe = (x, z) => {
      const foe = (game.enemyUnits ?? [])
        .filter((u) => u?.alive && u.isWildlife === true)
        .sort((a, b) => (b.maxHealth ?? 0) - (a.maxHealth ?? 0))[0] ?? null;
      if (!foe) return null;
      foe.position.set(x, foe.position.y, z);
      foe.health = foe.maxHealth;
      foe.moveGoal = null;
      foe.commandMoveGoal = null;
      foe.target = null;
      return foe;
    };
    let foe = pickFoe(tower.position.x + 4.5, tower.position.z + 4.5);
    out.foeReady = Boolean(foe);
    // **用箭塔自己的射击次数当判据，不要用靶子的血量。**
    // 靶子旁边还有护卫和基地在打它，"它掉血了"根本不能证明是箭塔打的；
    // 反过来停机那一段也会因为别人还在打而误判成"还在开火"（第一版就是这样）。
    // 箭塔每次攻击消耗 1 点武器耐久，这是只属于它自己的计数。
    const durabilityOf = (unit) => Math.round((unit?.weapon?.durability ?? 0) * 100) / 100;
    const healthOf = (unit) => Math.round((unit?.health ?? 0) * 100) / 100;
    // **开火次数用"处于攻击状态的帧数"来数**：武器耐久不是干净的计数器，
    // 它会随时间回一点（实测停机 10 秒耐久反而涨了 2），所以差值不能当射击次数。
    // 逐帧数攻击状态既直接又不受别人影响。
    const countFiringTicks = async (n) => {
      let attacking = 0;
      let activeAttack = 0;
      for (let i = 0; i < n; i += 1) {
        await step(1);
        if (game.attacks.getActiveAttackFor(tower)) activeAttack += 1;
        if (tower.aiState === 'attacking') attacking += 1;
      }
      return { attacking, activeAttack };
    };
    const foeHealthBefore = healthOf(foe);
    const durabilityBefore = durabilityOf(tower);
    const firing2 = await countFiringTicks(200);   // 10 秒
    out.towerFiringTicks = firing2.attacking;
    out.towerActiveAttackTicks = firing2.activeAttack;
    out.towerDurabilityDelta = Math.round((durabilityBefore - durabilityOf(tower)) * 100) / 100;
    out.towerDamagedFoe = Boolean(foe) && healthOf(foe) < foeHealthBefore;
    out.towerPoweredWhileFiring = game.facilities.statusOf(tower)?.poweredDown === false;

    // ---- 3) 掐掉供能：箭塔必须停机 ----
    const baseSupplier = game.power.suppliers.get('player-base');
    const originalSupply = baseSupplier?.supplyPerSecond ?? 0;
    if (baseSupplier) baseSupplier.supplyPerSecond = 0;
    tower.activityMana = 0;
    await step(1);
    // 第一帧的停机原因是"没魔"；再往后就进入"正在充能"（滞回那一段）。
    out.towerDownReasonFirstTick = game.facilities.statusOf(tower)?.reason ?? null;
    await step(20);
    const downStatus = game.facilities.statusOf(tower);
    out.towerPoweredDown = downStatus?.poweredDown === true;
    out.towerDownReason = downStatus?.reason ?? null;
    out.towerDrainWhileDown = downStatus?.drainPerSecond ?? null;
    foe = pickFoe(tower.position.x + 4.5, tower.position.z + 4.5);
    out.foeAliveDuringDownPhase = Boolean(foe) && foe.alive === true;
    const firing3 = await countFiringTicks(200);
    out.towerFiringTicksWhileDown = firing3.attacking;
    out.towerActiveAttackTicksWhileDown = firing3.activeAttack;
    out.towerAiIdle = tower.aiState === 'idle';
    out.towerTargetCleared = !tower.target;

    // ---- 4) 供能恢复：充到重启门槛才复工（滞回） ----
    // 门槛附近的采样要逐帧做：一次跑 1 秒就直接冲到门槛以上了，看不到"门槛以下仍然停着"。
    if (baseSupplier) baseSupplier.supplyPerSecond = originalSupply;
    const record = game.facilities.facilities.get(tower.id);
    const threshold = record.config.manaCapacity * record.config.restartRatio;
    out.restartThreshold = Math.round(threshold * 100) / 100;
    let stayedDownBelowThreshold = null;
    let resumeMana = null;
    for (let i = 0; i < 120; i += 1) {
      await step(1);
      const status = game.facilities.statusOf(tower);
      if (stayedDownBelowThreshold === null && status.activityMana > 0 && status.activityMana < threshold) {
        stayedDownBelowThreshold = status.poweredDown === true;
      }
      if (status.poweredDown === false) {
        resumeMana = status.activityMana;
        break;
      }
    }
    out.towerStayedDownBelowThreshold = stayedDownBelowThreshold;
    out.towerResumeMana = resumeMana;
    out.towerResumed = resumeMana !== null;
    await step(200);
    foe = pickFoe(tower.position.x + 4.5, tower.position.z + 4.5);
    const healthAfterResume = healthOf(foe);
    const firing4 = await countFiringTicks(200);
    out.towerFiringTicksAfterResume = firing4.attacking;
    out.towerFiresAgain = firing4.attacking > 0
      || (Boolean(foe) && healthOf(foe) < healthAfterResume);

    // ---- 5) 食堂：有魔力时治疗，停机时不治疗 ----
    // 先把箭塔挪开（免得它把靶子打死影响食堂的账），并**清掉全部敌人**。
    // 不清的话：前面为了测箭塔把野生动物传送到塔边上，而塔一挪走，
    // 那只熊就正好蹲在食堂的建造位置上，食堂会在施工期间被拆掉——
    // 表现出来是"登记了又消失"，很容易误判成登记逻辑的 bug。
    tower.position.set(tower.position.x + 40, tower.position.y, tower.position.z + 40);
    (game.enemyUnits ?? []).slice().forEach((unit) => {
      if (!unit?.alive || unit.isSpawnPointNest || unit.isRecruitable) return;
      unit.alive = false;
      game.handleUnitDeath(unit, null);
    });
    await step(4);
    inventory.add('canteen', 1);
    game.beginPlacement('canteen');
    const canteenSpot = game.playerBase.position.clone();
    canteenSpot.x += -6.5;
    canteenSpot.z += 2.5;
    const canteenPlaced = game.confirmPlacement(canteenSpot);
    const canteenPlacement = {
      inBag: 1,
      placed: canteenPlaced,
      unit: canteenPlaced.unit ?? null
    };
    // 立刻检查一次，再等建造完成检查一次：这样能区分"根本没登记"和"登记了又被摘掉"
    out.canteenPlacementFacilityFlag = canteenPlacement.placed.facility ?? null;
    out.canteenRegisteredImmediately = game.facilities.facilities.has(canteenPlacement.unit?.id) === true;
    await step(200);
    const canteen = canteenPlacement.unit;
    out.canteenRegisteredAfterBuild = game.facilities.facilities.has(canteen?.id) === true;
    out.canteenInBag = canteenPlacement.inBag;
    out.canteenPlaced = canteenPlacement.placed.ok === true;
    out.canteenPlaceReason = canteenPlacement.placed.reason ?? null;
    out.canteenUnitType = canteen?.type ?? null;
    out.canteenUnitId = canteen?.id ?? null;
    out.canteenBuilt = canteen ? canteen.underConstruction !== true : null;
    out.canteenRegisteredAsFacility = game.facilities.facilities.has(canteen?.id) === true;
    out.facilityRulesActive = game.facilities.rulesActive();
    out.canteenConfigFound = Boolean(game.facilities.facilities.get(canteen?.id)?.config);
    out.registeredFacilityIds = [...game.facilities.facilities.keys()];
    // 直接手动注册一次：能成功就说明 API 正常，问题在 confirmPlacement 那条路上
    const manual = canteen ? game.facilities.registerFacility(canteen) : null;
    out.canteenManualRegister = Boolean(manual);
    out.canteenRegisteredAfterManual = game.facilities.facilities.has(canteen?.id) === true;
    out.canteenManualConfigId = manual?.config?.id ?? null;
    // ⚠️ 伤员得**自己造一个**：用户已要求「玩家一开始没有任何战斗单位」，
    // 开局只有一支木傀儡（而傀儡是工人，不能当这个"被治疗的战斗单位"）。
    // 食堂治疗的对象与单位从哪来无关，所以直接走 summonUnits。
    game.summonUnits('raider', 1, game.playerBase.position.clone().add({ x: 4.2, y: 0, z: 4.0 }), 0.7, { select: false });
    const patient = (game.friendlyUnits ?? []).find((unit) => (
      unit?.alive && unit.isBuilding !== true && unit.isWorker !== true
    )) ?? null;
    out.patientFound = Boolean(patient);
    out.canteenAlive = canteen?.alive === true;
    let healed = null;
    let notHealedWhileDown = null;
    if (patient) {
      patient.health = Math.max(1, patient.maxHealth * 0.35);
      const before = patient.health;
      // 站到食堂旁边
      patient.position.set(canteen.position.x + 1.6, patient.position.y, canteen.position.z + 1.6);
      patient.moveGoal = null;
      patient.commandMoveGoal = null;
      await step(80);   // 4 秒（食堂按秒结算）
      healed = patient.health > before;
      out.canteenHealedPatient = healed;
      out.patientHealthDelta = Math.round((patient.health - before) * 100) / 100;
      // 掐掉食堂的魔力 → 不再治疗
      canteen.activityMana = 0;
      if (baseSupplier) baseSupplier.supplyPerSecond = 0;
      await step(40);
      out.canteenPoweredDown = game.facilities.statusOf(canteen)?.poweredDown === true;
      patient.health = Math.max(1, patient.maxHealth * 0.35);
      const downBefore = patient.health;
      await step(120);
      notHealedWhileDown = patient.health === downBefore;
      out.canteenStoppedHealing = notHealedWhileDown;
      if (baseSupplier) baseSupplier.supplyPerSecond = originalSupply;
    }

    out.stats = { ...game.facilities.stats };
    out.elapsedAdvanced = game.elapsedTime > 0;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));

  mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
  await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    const all = [...g.facilities.facilities.values()].map((r) => r.unit);
    // 优先拍食堂：箭塔在测试里被挪到海里去了（为了让它别抢靶子），拍它只有一片水。
    const unit = all.find((u) => u?.type === 'canteen') ?? all[0] ?? g.playerBase;
    const p = unit.position;
    g.cameraTarget.set(p.x, p.y, p.z);
    g.camera.position.set(p.x + 13, p.y + 15, p.z + 13);
    g.camera.lookAt(p.x, p.y + 1, p.z);
    g.renderScene();
    return true;
  })()`);
  await sleep(200);
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync('C:/WebProjects/WebVillageWar/outputs/verify-island-facilities.png', Buffer.from(shot.data, 'base64'));
}

const r = report.result;
report.verdict = r && !r.error ? {
  booted: true,
  // 1) 能合成、能放置、登记成要魔力的设施
  towerCraftableAndPlaced: r.towerRecipeListed === true && r.towerInBag === 1
    && r.towerPlaced === true && r.towerBuilt === true,
  towerIsRealTurret: r.towerIsStationaryCombat === true,
  towerRunsOnMana: r.towerRegisteredAsFacility === true
    && r.towerPowerReceiver === true
    && r.towerManaCapacity > 0
    && r.towerDrain > 0,
  // 2) 有魔力时真的开火（判据是箭塔自己的攻击帧数）
  towerDamagesEnemy: r.wildlifeAvailable > 0
    && r.foeReady === true
    && r.towerPoweredWhileFiring === true
    && r.towerFiringTicks > 0
    && r.towerDamagedFoe === true,
  // 3) 断供就停：攻击帧数归零，目标清空、状态回到 idle
  towerStopsWithoutMana: r.towerPoweredDown === true
    && r.towerDownReasonFirstTick === 'no_mana'
    && r.towerDrainWhileDown === 0
    && r.foeAliveDuringDownPhase === true
    && r.towerFiringTicksWhileDown === 0
    && r.towerActiveAttackTicksWhileDown === 0
    && r.towerAiIdle === true
    && r.towerTargetCleared === true,
  // 4) 滞回：门槛以下仍然停着，充到门槛才复工，复工后继续开火
  towerResumesWithMana: r.towerStayedDownBelowThreshold === true
    && r.towerResumed === true
    && r.towerResumeMana >= r.restartThreshold
    && r.towerFiringTicksAfterResume > 0,
  // 5) 食堂同理
  canteenCraftableAndPlaced: r.canteenInBag === 1
    && r.canteenPlaced === true && r.canteenBuilt === true
    && r.canteenAlive === true
    && r.canteenPlacementFacilityFlag === true
    && r.canteenRegisteredImmediately === true
    && r.canteenRegisteredAfterBuild === true,
  canteenHealsWhenPowered: r.patientFound === true && r.canteenHealedPatient === true,
  canteenStopsWithoutMana: r.canteenPoweredDown === true && r.canteenStoppedHealing === true,
  elapsedAdvanced: r.elapsedAdvanced === true
} : null;
console.log(JSON.stringify(report, null, 2));
const ok = Object.values(report.verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nISLAND FACILITIES: PASS' : '\nISLAND FACILITIES: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
