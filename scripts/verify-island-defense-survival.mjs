// 防御终端 / 脱战维修 / 食品后勤 / 供能净供需 / 资源续航：端到端验收。
//
// 对应 docs/DSH_DEFENSE_SURVIVAL_DESIGN.md 的第 1–3 节与
// docs/DSH_RESOURCE_SUSTAINABILITY.md 的「采完地表资源，转向建设与深采」。
//
// 与纯规则测试（test-defense-survival / test-building-repair / test-army-needs /
// test-power-budget / test-resource-nodes）的分工：那边证明**规则**，
// 这边证明"在真实 Game 实例 + 真实放置/生产/科研/供能链上真的能跑通"。
// 只连自己起的 headless Chrome（默认 9235 端口，独立 user-data-dir）。
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';

const CDP_PORT = Number(process.env.ISLAND_CDP_PORT || 9235);
const BASE = process.env.ISLAND_URL || 'http://127.0.0.1:3000/';
const LEVEL_ID = process.env.ISLAND_LEVEL_ID || 'island-survival';
const OUT_DIR = process.env.ISLAND_OUT_DIR || 'F:/WebProjects/WebVillageWar/outputs';
mkdirSync(OUT_DIR, { recursive: true });

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
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    throw new Error('page eval failed: ' + (res.exceptionDetails.exception?.description ?? res.exceptionDetails.text));
  }
  return res.result.value;
};
const shoot = async (name, { width = 1280, height = 720, dpr = 1, mobile = false } = {}) => {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: dpr, mobile
  });
  await sleep(400);
  const res = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const path = `${OUT_DIR}/${name}.png`;
  writeFileSync(path, Buffer.from(res.data, 'base64'));
  return path;
};

await send('Page.navigate', { url: BASE });
const report = {
  page: BASE,
  levelId: LEVEL_ID,
  started: false,
  towers: null,
  repair: null,
  food: null,
  power: null,
  sustainability: null,
  panel: null,
  shots: [],
  problems
};
report.started = await enterSurvivalGame(ev, sleep);

if (report.started) {
  await sleep(800);
  // 先清场：这一轮验收关心的是设施与后勤，不是打怪。
  // 巢穴必须留着（全清会判胜、关卡结束、系统停止推进）。
  await ev(`(() => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    (game.enemyUnits ?? []).slice().forEach((unit) => {
      if (!unit?.alive || unit.isSpawnPointNest || unit.isRecruitable) return;
      unit.alive = false;
      game.handleUnitDeath(unit, null);
    });
    (game.spawnPoints?.points ?? []).forEach((point) => { point.timer = 9999; });
    return true;
  })()`);

  // =========================================================== 一、三塔三级
  report.towers = JSON.parse(await ev(`(async () => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const out = { towers: [], gates: {}, crossTower: {} };
    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    const wasPaused = game.paused;
    game.paused = false;
    const step = async (n) => { for (let i = 0; i < n; i += 1) { game.tick(); if (i % 4 === 3) await new Promise((r) => setTimeout(r, 4)); } };

    const inv = game.baseInventory;
    // 给足真实材料（四种都不是"魔核万能"）
    ['wood', 'stone', 'iron', 'charcoal'].forEach((item) => {
      const have = inv.countOf(item);
      if (have > 0) inv.remove(item, have);
      inv.add(item, 400);
    });
    // 每类塔要一件可放置物品 + 建造配方材料
    ['arrowTower', 'ballista', 'shockTower', 'researchStation'].forEach((item) => inv.add(item, 1));

    const base = game.playerBase.position;
    const placeAt = async (itemId, dx, dz) => {
      const begin = game.beginPlacement(itemId);
      if (!begin?.ok) return { ok: false, reason: begin?.reason ?? 'begin_failed' };
      const spot = { x: base.x + dx, z: base.z + dz };
      const placed = game.confirmPlacement(spot);
      await step(240);
      return { ok: placed?.ok === true, unit: placed?.unit ?? null, reason: placed?.reason ?? null };
    };

    // ---- 1) 三种塔各自建到一级 ----
    const spots = { arrowTower: [7, -3], ballista: [-7, -3], shockTower: [0, -8] };
    for (const towerId of ['arrowTower', 'ballista', 'shockTower']) {
      const [dx, dz] = spots[towerId];
      const placed = await placeAt(towerId, dx, dz);
      const unit = placed.unit;
      const status = unit ? game.towerUpgrades.status(unit) : null;
      out.towers.push({
        towerId,
        placed: placed.ok,
        built: unit?.underConstruction !== true,
        tier: status?.tier ?? null,
        role: status?.role?.id ?? null,
        purpose: Boolean(status?.role?.purpose),
        weakness: Boolean(status?.role?.weakness),
        maxHealth: unit?.maxHealth ?? null,
        physicalAttack: unit?.physicalAttack ?? null,
        magicAttack: unit?.magicAttack ?? null,
        attackRange: unit?.attackRange ?? null,
        attackSplashRadius: unit?.definition?.attackSplash?.radius ?? null,
        manaCapacity: status?.power?.manaCapacity ?? null,
        manaPerShot: status?.power?.manaPerShot ?? null,
        // 同一栋实例引用，后面升级用
        _ref: unit
      });
    }
    // 把实例引用挪到全局暂存，避免 JSON 序列化把对象丢掉
    window.__DSV__ = { towers: {} };
    out.towers.forEach((entry, index) => {
      const unit = game.friendlyUnits.find((u) => u.type === entry.towerId && u.underConstruction !== true);
      window.__DSV__.towers[entry.towerId] = unit ?? null;
      entry.instanceId = unit?.id ?? null;
      delete entry._ref;
      void index;
    });

    // ---- 2) 资格：没有科研站时二级必须被拒 ----
    const arrow = window.__DSV__.towers.arrowTower;
    out.gates.noResearchRefused = game.towerUpgrades.beginUpgrade(arrow);
    const woodBeforeNoResearch = inv.countOf('wood');
    out.gates.noResearchRefused = out.gates.noResearchRefused.ok === false
      && out.gates.noResearchRefused.reason === 'missing_research';
    out.gates.noResearchNoCost = inv.countOf('wood') === woodBeforeNoResearch;

    // ---- 3) 建科研站并研究出资格 ----
    // 科研站需要"完工"才算数：放置后等施工完成
    const station = await placeAt('researchStation', 12, -8);
    out.gates.researchStationBuilt = station.ok && station.unit?.underConstruction !== true;
    // 二级只需要完工的科研站，不需要路线
    const arrowTier2 = game.towerUpgrades.beginUpgrade(arrow);
    out.gates.tier2Started = arrowTier2.ok === true;
    out.gates.tier2Cost = arrowTier2.cost ?? null;
    // 跳级：一级直接点三级必须被拒
    const skipCheck = game.towerUpgrades.upgradeStatus(arrow);
    out.gates.noSkipWhileUpgrading = skipCheck.ok === false;
    // 施工中不能重复付费
    const woodBeforeDouble = inv.countOf('wood');
    const doublePay = game.towerUpgrades.beginUpgrade(arrow);
    out.gates.noDoublePay = doublePay.ok === false && inv.countOf('wood') === woodBeforeDouble;

    // 等施工完成
    await step(400);
    const arrowAfter = window.__DSV__.towers.arrowTower;
    const arrowStatus = game.towerUpgrades.status(arrowAfter);
    out.crossTower.arrowTier2 = {
      tier: arrowStatus?.tier ?? null,
      unitType: arrowAfter?.type ?? null,
      maxHealth: arrowAfter?.maxHealth ?? null,
      healthKeptBelowMax: (arrowAfter?.health ?? 0) <= (arrowAfter?.maxHealth ?? 0),
      activityManaKept: arrowAfter?.activityMana ?? null,
      manaCapacity: arrowAfter?.manaCapacity ?? null
    };

    // ---- 4) 三级资格：要先有本类二级 + 对应路线全线清除 ----
    const t3NoRoute = game.towerUpgrades.canUpgradeTower
      ? null
      : null;
    void t3NoRoute;
    const tier3Check = (() => {
      // 直接调 upgradeStatus 看当前为什么不能升三级（路线还没清）
      const status = game.towerUpgrades.upgradeStatus(arrowAfter);
      return { ok: status.ok, reason: status.reason, label: status.label, targetTier: status.toTier };
    })();
    out.gates.tier3NeedsRoute = tier3Check.reason === 'missing_route';
    out.gates.tier3Gates = game.towerUpgrades.status(arrowAfter)?.gates ?? null;

    // ---- 5) 交叉验证：不同塔绑不同路线 ----
    out.crossTower.routes = {
      east: game.towerUpgrades.routeClearedFor('arrowTower'),
      north: game.towerUpgrades.routeClearedFor('ballista'),
      south: game.towerUpgrades.routeClearedFor('shockTower')
    };
    // 一级/二级的 unitType 必须与既有 id 兼容
    out.crossTower.unitTypes = {
      arrowTower: window.__DSV__.towers.arrowTower?.type ?? null,
      ballista: window.__DSV__.towers.ballista?.type ?? null,
      shockTower: window.__DSV__.towers.shockTower?.type ?? null
    };

    // ---- 6) 升到三级（先把路线清掉）----
    const spawnPoints = game.spawnPoints?.points ?? [];
    const eastNestIds = ['island-east-cape', 'island-outer-east'];
    eastNestIds.forEach((nestId) => {
      const point = spawnPoints.find((entry) => entry.id === nestId);
      if (point) {
        point.cleared = true;
        point.nestHealth = 0;
      }
    });
    game.expeditions?.update?.(0.5);
    out.crossTower.eastRouteCleared = game.towerUpgrades.routeClearedFor('arrowTower');
    const arrowTier3 = game.towerUpgrades.beginUpgrade(arrowAfter);
    out.crossTower.tier3Started = arrowTier3.ok === true;
    out.crossTower.tier3Reason = arrowTier3.reason ?? null;
    await step(400);
    const arrow3 = window.__DSV__.towers.arrowTower;
    const arrow3Status = game.towerUpgrades.status(arrow3);
    out.crossTower.arrowTier3 = {
      tier: arrow3Status?.tier ?? null,
      unitType: arrow3?.type ?? null,
      maxHealth: arrow3?.maxHealth ?? null,
      attackRange: arrow3?.attackRange ?? null,
      physicalAttack: arrow3?.physicalAttack ?? null,
      maxed: arrow3Status?.maxed ?? null
    };

    // ---- 7) 满级之后不能再升级，也不能重复付费 ----
    const maxed = game.towerUpgrades.beginUpgrade(arrow3);
    out.crossTower.maxedRefused = maxed.ok === false && maxed.reason === 'wrong_tier';
    const ironBefore = inv.countOf('iron');
    game.towerUpgrades.beginUpgrade(arrow3);
    out.crossTower.maxedNoCost = inv.countOf('iron') === ironBefore;

    // ---- 8) 取消升级：材料整笔退回 ----
    const ballista = window.__DSV__.towers.ballista;
    const woodBeforeCancel = inv.countOf('wood');
    const started = game.towerUpgrades.beginUpgrade(ballista);
    const woodAfterStart = inv.countOf('wood');
    const cancelled = game.towerUpgrades.cancelUpgrade(ballista, { refund: true });
    const woodAfterCancel = inv.countOf('wood');
    out.crossTower.cancel = {
      started: started.ok === true,
      spent: woodBeforeCancel - woodAfterStart,
      refunded: woodAfterCancel - woodAfterStart,
      ok: cancelled.ok === true
    };

    // ---- 9) 快照 / 重载不会叠乘：反复 flush 后属性不变 ----
    const before = { maxHealth: arrow3.maxHealth, range: arrow3.attackRange, attack: arrow3.physicalAttack };
    game.refreshUnitManaCapacity?.(arrow3);
    game.applyTeamUpgradesToUnit?.(arrow3);
    game.towerUpgrades.status(arrow3);
    const after = { maxHealth: arrow3.maxHealth, range: arrow3.attackRange, attack: arrow3.physicalAttack };
    out.crossTower.noStacking = before.maxHealth === after.maxHealth
      && before.range === after.range
      && before.attack === after.attack;

    game.paused = wasPaused;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));
  report.shots.push(await shoot('dsv-towers-1280x720'));

  // ========================================== 一b、等级与类型的**真实模型**差异
  // 设计文档要求"轮廓和材质表达等级……不能靠悬浮文字或颜色换皮充当全部差异"。
  // 所以这里把 3 类 × 3 级共 9 个模型并排建出来，量一遍结构指标（网格数/高度/占地），
  // 再拍一张实际游戏相机距离的对照图。
  report.visuals = JSON.parse(await ev(`(async () => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const out = { variants: {}, checks: {} };
    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    const wasPaused = game.paused;
    game.paused = false;
    const inv = game.baseInventory;
    const step = async (n) => { for (let i = 0; i < n; i += 1) { game.tick(); if (i % 4 === 3) await new Promise((r) => setTimeout(r, 4)); } };

    const metaOf = (unit) => {
      const root = unit?.visualRoot ?? unit?.model ?? null;
      if (!root) return null;
      root.updateMatrixWorld?.(true);
      const rootPos = new root.position.constructor();
      root.getWorldPosition?.(rootPos);
      let meshes = 0;
      let minY = Infinity;
      let maxY = -Infinity;
      let maxR = 0;
      let localFootprint = 0;
      const colors = new Set();
      root.traverse((node) => {
        if (!node.isMesh) return;
        meshes += 1;
        const list = Array.isArray(node.material) ? node.material : [node.material];
        list.forEach((material) => {
          if (material?.color?.getHexString) colors.add(material.color.getHexString());
        });
        const geometry = node.geometry;
        if (!geometry) return;
        geometry.computeBoundingBox?.();
        const bb = geometry.boundingBox;
        if (!bb) return;
        // 水平占地用**几何体自身**的尺寸：这样量的是模型，不含范围环/血条这类
        // 挂在同一根节点上的辅助物（它们会把"占地"污染成几十米）。
        localFootprint = Math.max(
          localFootprint,
          Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z)
        );
        // 手工把 8 个角投到世界空间：页面里没有暴露 THREE，不能 new Box3
        [[bb.min.x, bb.min.y, bb.min.z], [bb.max.x, bb.min.y, bb.min.z],
          [bb.min.x, bb.max.y, bb.min.z], [bb.max.x, bb.max.y, bb.min.z],
          [bb.min.x, bb.min.y, bb.max.z], [bb.max.x, bb.min.y, bb.max.z],
          [bb.min.x, bb.max.y, bb.max.z], [bb.max.x, bb.max.y, bb.max.z]].forEach((corner) => {
          const v = new rootPos.constructor(corner[0], corner[1], corner[2]).applyMatrix4(node.matrixWorld);
          minY = Math.min(minY, v.y);
          maxY = Math.max(maxY, v.y);
          maxR = Math.max(maxR, Math.hypot(v.x - rootPos.x, v.z - rootPos.z));
        });
      });
      return {
        meshes,
        colorCount: colors.size,
        height: Number.isFinite(minY) ? Math.round((maxY - minY) * 100) / 100 : 0,
        // 单件几何体的最大水平尺寸（米）：塔的"占地"读数
        footprint: Math.round(localFootprint * 100) / 100,
        // 世界空间的整体水平半径，只作参考（会带上范围环等辅助物）
        worldRadius: Math.round(maxR * 100) / 100,
        tier: root.userData?.towerTier ?? null
      };
    };

    const origin = game.playerBase.position;
    const types = ['arrowTower', 'ballista', 'shockTower'];
    const suffixes = ['', 'II', 'III'];
    const built = {};
    for (let ti = 0; ti < types.length; ti += 1) {
      for (let tier = 1; tier <= 3; tier += 1) {
        const unitType = tier === 1 ? types[ti] : types[ti] + suffixes[tier - 1];
        // 摆位：**一列一个等级**（左→右 I/II/III），一行一种类型。
        // 这样截图里"等级差异"是横向直接对照，"类型差异"是纵向直接对照。
        const point = new origin.constructor(
          origin.x - 14 + (tier - 1) * 14,
          0,
          origin.z - 14 - ti * 10
        );
        point.y = game.groundHeightAt({ x: point.x, z: point.z }) ?? 0;
        const unit = game.buildStructureUnit(unitType, point, { buildSeconds: 0, paidInvestment: [] });
        game.buildings?.completeConstruction?.(unit);
        built[unitType] = unit;
        out.variants[unitType] = metaOf(unit);
      }
    }
    await step(4);

    // 同一类型的 I/II/III 必须在**结构**上不同（网格数或高度或占地至少一项），
    // 只在颜色上不同不算过。跨类型在同一级也要不同。
    const structuralDiff = (a, b) => Boolean(a && b)
      && (a.meshes !== b.meshes || a.height !== b.height || a.footprint !== b.footprint);
    out.checks.tiersDifferStructurally = types.every((type) => {
      const one = out.variants[type];
      const two = out.variants[type + 'II'];
      const three = out.variants[type + 'III'];
      return structuralDiff(one, two) && structuralDiff(two, three) && structuralDiff(one, three);
    });
    out.checks.typesDifferAtEachTier = [1, 2, 3].every((tier) => {
      const suffix = tier === 1 ? '' : suffixes[tier - 1];
      const a = out.variants['arrowTower' + suffix];
      const b = out.variants['ballista' + suffix];
      const c = out.variants['shockTower' + suffix];
      return structuralDiff(a, b) && structuralDiff(b, c) && structuralDiff(a, c);
    });
    // 等级越高结构越"重"：网格数不减、高度不减（不做严格单调，只保证不退化）
    out.checks.tierScalesUpward = types.every((type) => {
      const one = out.variants[type];
      const three = out.variants[type + 'III'];
      return one && three && three.meshes >= one.meshes && three.height >= one.height;
    });

    // 相机拉到这一排塔前，拍实际游戏距离的对照图
    const focusZ = origin.z - 25;
    game.cameraTarget?.set?.(origin.x, 1.4, focusZ);
    game.camera.position.set(origin.x - 6, 20, focusZ + 26);
    game.camera.lookAt(origin.x, 1.2, focusZ);
    game.renderScene?.();
    window.__DSV__.tierRow = { centerX: origin.x, centerZ: focusZ };
    game.paused = wasPaused;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));
  await sleep(600);
  report.shots.push(await shoot('dsv-tower-tiers-1280x720'));

  // =========================================================== 二、脱战维修
  report.repair = JSON.parse(await ev(`(async () => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const out = {};
    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    const wasPaused = game.paused;
    game.paused = false;
    const step = async (n) => { for (let i = 0; i < n; i += 1) { game.tick(); if (i % 4 === 3) await new Promise((r) => setTimeout(r, 4)); } };

    const inv = game.baseInventory;
    const dispatch = game.repairDispatch;
    // 拿一座箭塔当被试（二级那栋）
    const tower = window.__DSV__.towers.arrowTower;
    const tower2 = window.__DSV__.towers.shockTower;

    // 1) 满血不登记
    tower.health = tower.maxHealth;
    tower.weapon.durability = tower.weapon.maxDurability;
    dispatch.register(tower);
    out.fullHealthNoRequest = dispatch.requestFor(tower.id) === null;

    // 2) 交战中登记：8 秒内不派活
    tower.health = Math.round(tower.maxHealth * 0.3);
    tower.lastCombatAt = game.elapsedTime;
    dispatch.register(tower);
    const request = dispatch.requestFor(tower.id);
    out.requestRegistered = Boolean(request);
    out.uniqueRequest = dispatch.requests.size >= 1;
    // 重复受伤只更新一份
    const sizeBefore = dispatch.requests.size;
    tower.health = Math.round(tower.maxHealth * 0.25);
    dispatch.register(tower);
    out.noDuplicateRequest = dispatch.requests.size === sizeBefore;
    out.inCombatNotDispatched = dispatch.availableRequests().length === 0;
    out.inCombatState = request.state;

    // 3) 基地库存补上木料，脱战 8 秒后傀儡应该被派去修
    ['wood', 'stone', 'iron'].forEach((item) => inv.add(item, 200));
    tower.lastCombatAt = game.elapsedTime - 20;
    const available = dispatch.availableRequests();
    out.afterCombatDispatchable = available.length > 0;

    // 4) 手边有傀儡就直接派过去修：验证材料真的被扣、血真的回
    const healthBefore = tower.health;
    const woodBefore = inv.countOf('wood');
    const worker = (game.friendlyUnits ?? []).find((u) => u.isWorker && u.alive);
    out.hasWorker = Boolean(worker);
    let repairResult = null;
    if (worker) {
      // 把傀儡放到塔边上，避免依赖寻路（异步 worker 在批处理下不可靠）
      worker.position.set(tower.position.x + 1.2, worker.position.y, tower.position.z + 1.2);
      const material = dispatch.resolveRepairMaterial(worker, request);
      out.materialResolved = material.ok === true;
      out.materialSource = material.source ?? null;
      const applied = dispatch.applyRepairBatch(worker, request);
      repairResult = applied;
      out.batchOk = applied.ok === true;
      out.batchMaterials = applied.materials ?? 0;
      out.batchHealth = applied.health ?? 0;
      out.healthRestored = tower.health > healthBefore;
      out.workerCarryChanged = (game.work?.inventoryFor?.(worker)?.countOf?.(material.material) ?? 0) >= 0;
      out.statsMaterialsSpent = dispatch.stats.materialsSpent;
      void woodBefore;
    }

    // 5) 多个傀儡不能重复预留
    const request2 = dispatch.requestFor(tower.id) ?? request;
    const reserveA = dispatch.reserve(request2, 'probe-a');
    const reserveB = dispatch.reserve(request2, 'probe-b');
    out.reserveFirst = reserveA === true;
    out.reserveSecondRefused = reserveB === false;
    dispatch.releaseWorkerEverywhere('probe-a');
    dispatch.releaseWorkerEverywhere('probe-b');

    // 6) 缺料：转"待材料"，并且不锁死工人
    const missing = dispatch.requestFor(tower.id);
    if (missing) {
      missing.status = { ...missing.status, material: 'charcoal' };
      const noMaterial = dispatch.resolveRepairMaterial({ id: 'probe-none', position: { x: 0, z: 0 }, inventory: null }, missing);
      out.missingMaterialReason = noMaterial.reason;
      out.missingMaterialState = missing.state;
    }
    // 7) 关键建筑急修优先：基地 > 魔力炉 > 防塔
    out.importanceOrder = {
      playerBase: game.repairDispatch.constructor ? null : null,
      arrow: null,
      canteen: null
    };
    const statusBase = { importance: 0 };
    const statusTower = { importance: 3 };
    void statusBase; void statusTower;
    out.urgentOrder = game.repairDispatch.rules.urgentHealthRatio;

    // 8) 建筑死亡 / 重开不锁任务
    const deathProbe = window.__DSV__.towers.shockTower;
    dispatch.register(deathProbe);
    const hadRequest = Boolean(dispatch.requestFor(deathProbe.id));
    dispatch.reset();
    out.resetClears = dispatch.requests.size === 0;
    out.deathProbeHadRequest = hadRequest;
    dispatch.register(deathProbe);

    // 9) 自动维修开关
    game.autoBuildingRepair = false;
    out.autoRepairOff = dispatch.enabled === false;
    out.autoRepairOffNoDispatch = dispatch.pickFor(worker) === null;
    game.autoBuildingRepair = true;
    out.autoRepairOn = dispatch.enabled === true;

    // 10) 状态文案齐全
    out.stateLabels = { ...game.repairDispatch.constructor ? {} : {}, ...(dispatch.summary().labels ?? {}) };
    out.repairResult = repairResult;

    game.paused = wasPaused;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));

  // =========================================================== 三、食品后勤
  report.food = JSON.parse(await ev(`(async () => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const out = {};
    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    const wasPaused = game.paused;
    game.paused = false;
    const step = async (n) => { for (let i = 0; i < n; i += 1) { game.tick(); if (i % 4 === 3) await new Promise((r) => setTimeout(r, 4)); } };

    const inv = game.baseInventory;
    const base = game.playerBase.position;

    // ---- 1) 开局口粮：库存里必须有 12 份 ----
    out.startingRations = inv.countOf('ration') + (game.armyNeeds?.rationCount?.() ?? 0) > 0;
    out.rationCount = game.armyNeeds?.rationCount?.() ?? 0;

    // ---- 2) 菜圃：建一块，等成熟，长出真实谷物节点 ----
    inv.add('cropPlot', 1);
    inv.add('treePit', 1);
    const before = inv.countOf('grain');
    game.beginPlacement('cropPlot');
    const plot = game.confirmPlacement({ x: base.x + 4, z: base.z + 6 });
    const plotUnit = plot.unit;
    out.cropPlotPlaced = plot.ok === true;
    await step(300);   // 15 秒施工
    out.cropPlotBuilt = plotUnit?.underConstruction !== true;
    // 菜圃成熟需要 120 秒：直接推进种植系统
    await step(2600);  // 130 秒
    const grainNodes = game.resourceNodes.allNodes().filter((node) => node.resource === 'grain' && node.amount > 0);
    out.grainNodesGrown = grainNodes.length;
    out.grainNodeAmount = grainNodes[0]?.amount ?? null;
    // 徒手可收（tool: null），收一次
    if (grainNodes.length) {
      const harvest = game.resourceNodes.harvest(grainNodes[0].id, {
        toolIds: [],
        position: { x: grainNodes[0].x, z: grainNodes[0].z }
      });
      out.grainHarvested = harvest.ok === true && harvest.taken > 0;
      out.grainTaken = harvest.taken ?? 0;
      out.grainRemaining = harvest.remaining ?? null;
    }

    // ---- 3) 食堂：谷物 2 + 木炭 1 → 口粮 2 ----
    inv.add('canteen', 1);
    inv.add('grain', 20);
    inv.add('charcoal', 20);
    game.beginPlacement('canteen');
    const canteenPlace = game.confirmPlacement({ x: base.x + 8, z: base.z + 4 });
    const canteen = canteenPlace.unit;
    out.canteenPlaced = canteenPlace.ok === true;
    await step(300);
    out.canteenBuilt = canteen?.underConstruction !== true;
    const station = game.stations.stationFor(canteen);
    out.canteenHasStation = Boolean(station);
    out.canteenInputItems = station?.inventory?.slots
      ?.filter(Boolean)
      .map((slot) => ({ itemId: slot.itemId, count: slot.count })) ?? [];
    const recipe = game.production.statusOf(canteen)?.recipe ?? null;
    out.canteenRecipe = recipe
      ? {
        id: recipe.id,
        input: recipe.input,
        output: recipe.output,
        seconds: recipe.seconds,
        fuelPerCycle: recipe.fuelPerCycle
      }
      : null;
    // 装料 + 供能：把谷物与木炭放进进料格，并保证食堂有活动魔力
    station?.inventory?.slots?.fill(null);
    station?.inventory?.add('grain', 6);
    station?.fuelInventory?.add('charcoal', 6, { allowPartial: true });
    canteen.activityMana = canteen.manaCapacity ?? 30;
    // 供能：食堂要在基地半径内，工地位置离基地 9 米左右，没问题
    const rationBefore = station?.outputInventory?.countOf('ration') ?? 0;
    const cyclesBefore = game.production.stats.cycles;
    await step(400);   // 20 秒 → 至少一个 12 秒周期
    out.canteenCycles = game.production.stats.cycles - cyclesBefore;
    out.canteenRationOut = station?.outputInventory?.countOf('ration') ?? 0;
    out.canteenProduced = out.canteenRationOut > rationBefore;

    // ---- 4) 人类部队吃饭：走**真实招募**路径拿一支人，再看它吃随身口粮 ----
    // 用召唤/直接改定义都证明不了"招募兵种带 foodConsumer"这件事，
    // 所以这里和 verify-island-expedition 用同一条路：spawnEnemyAt → isRecruitable
    // → 花一张招募令 → recruitUnit（内部真的换队并初始化口粮需求）。
    const recruitSpot = { x: base.x - 4, z: base.z + 6 };
    const recruitable = game.spawnEnemyAt?.('towerShield', recruitSpot, { difficulty: 1, radius: 0.4 }) ?? null;
    out.recruitableSpawned = Boolean(recruitable);
    if (recruitable) {
      recruitable.isRecruitable = true;
      inv.add('recruitmentOrder', 1);
      const recruited = game.recruitUnit(recruitable);
      out.recruitOk = recruited.ok === true;
      out.recruitedTeam = recruitable.team;
      out.recruitedFoodConsumer = recruitable.definition?.foodConsumer === true;
    }
    // 第二个人：只用来证明"军队规模真的推高消耗"（1 人 vs 2 人的可供养时间）
    const recruitSpot2 = { x: base.x + 4, z: base.z + 6 };
    const recruitable2 = game.spawnEnemyAt?.('archer', recruitSpot2, { difficulty: 1, radius: 0.4 }) ?? null;
    if (recruitable2) {
      recruitable2.isRecruitable = true;
      inv.add('recruitmentOrder', 1);
      out.recruitSecondOk = game.recruitUnit(recruitable2).ok === true;
      out.recruitSecondFoodConsumer = recruitable2.definition?.foodConsumer === true;
    }
    const human = out.recruitOk ? recruitable : null;
    const human2 = out.recruitSecondOk ? recruitable2 : null;
    if (human2) {
      // 让第二个人"忙"起来：有玩家移动指令 → 不会被食堂叫走，
      // 只作为人口统计里的一员参与供需口径。
      human2.commandMoveGoal = { x: base.x + 30, z: base.z + 30 };
      const bag2 = game.itemBagFor(human2);
      const carried2 = bag2?.countOf?.('ration') ?? 0;
      if (carried2 > 0) bag2?.remove?.('ration', carried2);
    }
    out.hasFoodConsumerUnit = Boolean(human);
    if (human) {
      out.humanType = human.type;
      out.satietyInitialized = game.armyNeeds.initialized.has(human.id) && Math.round(human.satiety) === 100;

      // 4a) 随身口粮自动吃：≤60 时吃一份、+40、不超过上限、可以在战斗中吃
      const bag = game.itemBagFor(human);
      bag?.add?.('ration', 2);
      human.itemBag = human.itemBag ?? bag;
      const rationsBefore = bag?.countOf?.('ration') ?? 0;
      human.satiety = 55;
      // 故意挂上一条玩家移动指令：吃随身口粮不能清掉/改写它（同一个对象引用必须还在）
      const guardGoal = { x: human.position.x + 12, z: human.position.z };
      human.commandMoveGoal = guardGoal;
      await step(20);
      out.autoAte = (bag?.countOf?.('ration') ?? 0) < rationsBefore;
      out.satietyAfterEat = Math.round(human.satiety);
      out.ateWithoutLosingCommand = human.commandMoveGoal === guardGoal;
      human.commandMoveGoal = null;
      human.moveGoal = null;

      // 4b) 饥饿 / 力竭两档互斥，且吃饭后立刻撤掉
      // 这一段的主题是"减益"，所以先把两条喂饱的路径都掐掉：
      // 食堂暂时没饭 + 身上没粮 + 走远一点，否则它会被喂到 60 以上，测不到饥饿档。
      const mealStation = game.stations.stationFor(canteen);
      const heldMeals = mealStation?.outputInventory?.countOf('ration') ?? 0;
      if (heldMeals > 0) mealStation.outputInventory.remove('ration', heldMeals);
      const carriedLeft = bag?.countOf?.('ration') ?? 0;
      if (carriedLeft > 0) bag?.remove?.('ration', carriedLeft);
      human.position.set(base.x - 26, human.position.y, base.z - 26);
      human.moveGoal = null;
      human.mealWalk = false;
      game.armyNeeds.releaseSeat(human);
      human.satiety = 20;
      await step(20);
      out.hungryAttackRate = Math.round((human.attackRate ?? 0) * 1000) / 1000;
      out.hungryBaseRate = Math.round((human.definition?.attackRate ?? 0) * 1000) / 1000;
      out.hungryRecoveryScale = game.armyNeeds.recoveryScaleFor(human);
      human.satiety = 0;
      human.moveGoal = null;
      await step(20);
      out.exhaustedAttackRate = Math.round((human.attackRate ?? 0) * 1000) / 1000;
      out.exhaustedRecoveryScale = game.armyNeeds.recoveryScaleFor(human);
      // 反复刷新不能叠乘：再推一段，倍率必须还是同一档
      human.satiety = 0;
      human.moveGoal = null;
      await step(40);
      out.noStackingWhileStarving = Math.round((human.attackRate ?? 0) * 1000) / 1000;
      // 吃饭恢复 → 修正立刻撤掉
      bag?.add?.('ration', 2);
      human.satiety = 55;
      await step(20);
      out.recoveredAttackRate = Math.round((human.attackRate ?? 0) * 1000) / 1000;
      out.recoveredScale = game.armyNeeds.recoveryScaleFor(human);

      // 4c) 食堂供餐：把它放到食堂附近、清掉随身口粮，它会走过去吃一份
      const canteenStation = game.stations.stationFor(canteen);
      canteenStation?.outputInventory?.add('ration', 4, { allowPartial: true });
      const carried = bag?.countOf?.('ration') ?? 0;
      if (carried > 0) bag?.remove?.('ration', carried);
      human.satiety = 40;
      human.moveGoal = null;
      human.commandMoveGoal = null;
      human.target = null;
      human.attackTimer = 0;
      human.position.set(canteen.position.x + 2.2, human.position.y, canteen.position.z + 2.2);
      const canteenMealsBefore = game.armyNeeds.stats.canteenMeals;
      const canteenRationsBefore = canteenStation?.outputInventory?.countOf('ration') ?? 0;
      await step(30);
      out.canteenServed = game.armyNeeds.stats.canteenMeals > canteenMealsBefore;
      out.canteenRationsConsumed = canteenRationsBefore - (canteenStation?.outputInventory?.countOf('ration') ?? 0);
      out.satietyAfterCanteen = Math.round(human.satiety);

      // 4d) 玩家显式命令优先：有移动指令的空闲判定必须为假，不会被叫去吃饭
      human.satiety = 20;
      human.commandMoveGoal = { x: human.position.x + 10, z: human.position.z };
      const seatsBefore = [...game.armyNeeds.seats.values()].reduce((sum, set) => sum + set.size, 0);
      await step(20);
      const seatsAfter = [...game.armyNeeds.seats.values()].reduce((sum, set) => sum + set.size, 0);
      out.commandNotStolenByMeal = seatsAfter <= seatsBefore;
      human.commandMoveGoal = null;
      human.moveGoal = null;

      // 4e) 不能隔空吃基地库存：远离食堂、身上没粮 → 基地口粮一份都不能少
      const baseRationsBefore = game.armyNeeds.rationCount();
      human.position.set(base.x - 30, human.position.y, base.z - 30);
      human.moveGoal = null;
      human.commandMoveGoal = null;
      human.satiety = 30;
      await step(40);
      out.noRemoteBaseEating = game.armyNeeds.rationCount() === baseRationsBefore;
      human.moveGoal = null;
      human.mealWalk = false;
      game.armyNeeds.releaseSeat(human);

      // 4f) 傀儡 / 敌人不吃
      out.puppetIsFoodConsumer = (game.friendlyUnits ?? []).some((unit) => unit.isWorker
        && unit.definition?.foodConsumer === true);
      const enemySample = (game.enemyUnits ?? []).find((unit) => unit.alive && !unit.isBuilding);
      out.enemyIsFoodConsumer = enemySample?.definition?.foodConsumer === true;
      out.enemySatietyTracked = enemySample ? game.armyNeeds.consumers().includes(enemySample) : false;
    }
    // ---- 5) 傀儡不吃：给傀儡一个假饱食度，采样后必须原封不动 ----
    const puppet = (game.friendlyUnits ?? []).find((unit) => unit.isWorker && unit.alive);
    if (puppet) {
      puppet.satiety = 10;
      await step(20);
      out.puppetSatietyUnchanged = puppet.satiety === 10;
      out.puppetIsFoodConsumer = puppet.definition?.foodConsumer === true;
    }
    // ---- 6) HUD 汇总 + 军队规模真的推高消耗 ----
    const summary = game.armyNeeds?.summary?.() ?? null;
    out.summary = summary
      ? { rations: summary.rations, grain: summary.grain, soldiers: summary.soldiers, starving: summary.starving, label: summary.hungryLabel }
      : null;
    out.soldierCountMatchesConsumers = summary
      ? summary.soldiers === game.armyNeeds.consumers().length
      : false;
    const consumers = game.armyNeeds?.consumers?.() ?? [];
    out.consumerCount = consumers.length;
    if (consumers.length >= 2) {
      // 汇总口径：同样一批口粮，供养 2 个人的时间必须短于供养 1 个人
      const one = game.armyNeeds.summary(consumers.slice(0, 1)).secondsOfSupply;
      const all = game.armyNeeds.summary(consumers).secondsOfSupply;
      out.supplyOneSoldier = one;
      out.supplyAllSoldiers = all;
      out.supplyShrinksWithArmy = Number.isFinite(one) && Number.isFinite(all) && all > 0 && all < one;
    } else {
      out.supplyShrinksWithArmy = false;
    }
    [human, human2].forEach((unit) => {
      if (!unit) return;
      unit.alive = false;
      game.handleUnitDeath(unit, null);
    });

    game.paused = wasPaused;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));

  // =========================================================== 四、供能净供需
  report.power = JSON.parse(await ev(`(async () => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const out = {};
    const meter = document.querySelector('#power-net-meter');
    out.meterExists = Boolean(meter);
    out.meterHidden = meter?.hidden === true;
    out.valueText = document.querySelector('#power-net-value')?.textContent ?? null;
    out.detailText = document.querySelector('#power-net-detail')?.textContent ?? null;
    out.netMode = meter?.dataset?.powerNet ?? null;
    out.secondsLeft = meter?.dataset?.powerSecondsLeft ?? null;
    // 口径：净缺口时剩余时间必须是有限的真实数字；净余/零消耗显示"稳定"
    const deficit = out.netMode === 'deficit';
    out.secondsLeftValid = deficit
      ? (out.secondsLeft !== '稳定' && /^\\d+:\\d\\d$/.test(out.secondsLeft ?? ''))
      : out.secondsLeft === '稳定';
    // 同时显示储备与净供需
    out.showsReserve = /\\d+\\/\\d+/.test(out.detailText ?? '');
    out.showsSupplyAndDemand = /供 .*\\/秒/.test(out.detailText ?? '') && /需 .*\\/秒/.test(out.detailText ?? '');
    // 参数口径：单接收者补能上限不能高于基地功率
    out.maxRechargeNotAboveBase = game.power.rules.maxRechargePerSecond <= game.power.rules.baseSupplyPerSecond;
    // 起步：基地 + 单傀儡可持续
    const base = game.power.suppliers.get('player-base');
    out.baseSupplyPerSecond = base?.supplyPerSecond ?? null;
    out.baseManaCapacity = base?.manaCapacity ?? null;
    out.baseManaStored = Math.round((base?.manaStored ?? 0) * 10) / 10;
    out.receiverCount = game.power.receiverList().length;
    return JSON.stringify(out);
  })()`));

  // =========================================================== 五、资源续航
  report.sustainability = JSON.parse(await ev(`(async () => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const out = {};
    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    const wasPaused = game.paused;
    game.paused = false;
    const step = async (n) => { for (let i = 0; i < n; i += 1) { game.tick(); if (i % 4 === 3) await new Promise((r) => setTimeout(r, 4)); } };
    const inv = game.baseInventory;
    const system = game.resourceNodes;

    // ---- 1) 采空一个真实石堆：留贫矿址 + 世界标记 ----
    const stoneNode = system.allNodes().find((node) => node.resource === 'stone' && node.navRadius > 0 && node.amount > 0);
    out.stoneNodeFound = Boolean(stoneNode);
    if (stoneNode) {
      let last = null;
      for (let i = 0; i < 64; i += 1) {
        last = system.harvest(stoneNode.id, { toolIds: ['pickaxe'], position: { x: stoneNode.x, z: stoneNode.z } });
        if (!last.ok || last.depleted) break;
      }
      out.stoneDepleted = last?.depleted === true;
      const site = system.depletedOreSiteByNodeId(stoneNode.id);
      out.poorSiteRegistered = Boolean(site);
      out.poorSiteResource = site?.resource ?? null;
      out.poorSiteMarkerInWorld = Boolean(game.world.depletedSiteMarkers?.get?.(stoneNode.id));
      out.nodeStillVisible = stoneNode.handle?.object?.visible !== false;
      out.navBlockerReleased = game.world.isWalkable(stoneNode.x, stoneNode.z);
      // ---- 2) 在贫矿址旁建采石场 ----
      inv.add('quarry', 1);
      const spot = game.findResourceSiteSpot('quarry', { x: stoneNode.x, z: stoneNode.z });
      out.quarrySpotFound = Boolean(spot);
      out.quarrySpotOnDepletedSite = spot?.site?.kind === 'depleted' || Boolean(spot?.site?.site);
      if (spot) {
        const begin = game.beginPlacement('quarry');
        const placed = game.confirmPlacement(spot.point);
        out.quarryPlaced = begin?.ok === true && placed?.ok === true;
        const quarry = placed?.unit ?? null;
        await step(300);
        out.quarryBuilt = quarry?.underConstruction !== true;

        // ---- 2b) 远处矿址超出基地供能半径：必须先有本地燃料供能 ----
        // 这一条是"扩张要供给"的地面证据：矿在哪儿就得把电送过去。
        const basePos = game.playerBase.position;
        out.quarryDistanceToBase = Math.round(Math.hypot(
          quarry.position.x - basePos.x, quarry.position.z - basePos.z
        ) * 10) / 10;
        out.quarryOutOfBaseRange = out.quarryDistanceToBase > (game.power.rules.baseSupplyRadius ?? 20);

        // 先在**没有**本地供能的情况下跑一段：必须因缺电停摆（显示原因，不是静默产出）
        const station = game.stations.stationFor(quarry);
        out.quarryHasStation = Boolean(station);
        station?.inventory?.slots?.fill(null);
        station?.fuelInventory?.slots?.fill(null);
        station?.inventory?.add('charcoal', 4, { allowPartial: true });
        station?.fuelInventory?.add('charcoal', 4, { allowPartial: true });
        quarry.activityMana = 0;
        await step(600);   // 30 秒
        out.quarryReasonWithoutPower = game.production.statusOf(quarry)?.reason ?? null;
        out.quarryStoneWithoutPower = station?.outputInventory?.countOf('stone') ?? 0;

        // ---- 2c) 在矿址旁建魔力炉 + 真实木炭 → 深采真的出料 ----
        inv.add('manaFurnace', 1);
        const furnaceBegin = game.beginPlacement('manaFurnace');
        // canPlaceAt 读的是"当前待放置物品"，所以要先进放置模式再试落点
        const furnacePoint = furnaceBegin?.ok ? (() => {
          const offsets = [[3.4, 0], [-3.4, 0], [0, 3.4], [0, -3.4], [3, 3], [-3, -3], [4.6, 0], [0, 4.6]];
          for (const entry of offsets) {
            const candidate = new (game.playerBase.position.constructor)(
              quarry.position.x + entry[0],
              0,
              quarry.position.z + entry[1]
            );
            candidate.y = game.groundHeightAt({ x: candidate.x, z: candidate.z }) ?? 0;
            if (game.canPlaceAt(candidate).ok) return candidate;
          }
          return null;
        })() : null;
        const furnacePlaced = furnacePoint ? game.confirmPlacement(furnacePoint) : null;
        out.manaFurnaceNearQuarry = furnaceBegin?.ok === true && furnacePlaced?.ok === true;
        if (!furnacePlaced?.ok) game.cancelPlacement?.();
        const furnace = furnacePlaced?.unit ?? null;
        if (furnace) {
          await step(300);
          out.manaFurnaceBuilt = furnace.underConstruction !== true;
          const furnaceStation = game.stations.stationFor(furnace);
          furnaceStation?.inventory?.slots?.fill(null);
          const charcoalFed = furnaceStation?.inventory?.add('charcoal', 20, { allowPartial: true })?.added ?? 0;
          out.manaFurnaceCharcoalFed = charcoalFed;
          // 烧一会儿，攒起炉内储备（8 秒/周期 → 20 魔力）
          await step(400);
          const burnerStatus = game.fuelPower.statusOf(furnace);
          out.manaFurnaceActive = burnerStatus?.active === true;
          out.manaFurnaceManaStored = Math.round((burnerStatus?.manaStored ?? 0) * 10) / 10;
          out.manaFurnaceSupplyPerSecond = burnerStatus?.supplyPerSecond ?? 0;

          // ---- 3) 真实跑两个深采周期：木炭 → 石料，并核对守恒 ----
          const charcoalInputBefore = station?.inventory?.countOf('charcoal') ?? 0;
          const charcoalFuelBefore = station?.fuelInventory?.countOf('charcoal') ?? 0;
          const stoneBefore = station?.outputInventory?.countOf('stone') ?? 0;
          const cyclesBefore = game.production.stats.cycles;
          await step(2000);   // 100 秒 → 两个 45 秒周期
          out.quarryStoneOut = station?.outputInventory?.countOf('stone') ?? 0;
          out.quarryStoneProduced = out.quarryStoneOut - stoneBefore;
          out.quarryCycles = game.production.stats.cycles - cyclesBefore;
          out.quarryProduced = out.quarryStoneProduced > 0;
          out.quarryRecipe = game.production.statusOf(quarry)?.recipe?.id ?? null;
          out.quarryFuelPerCycle = game.production.statusOf(quarry)?.recipe?.fuelPerCycle ?? null;
          // 守恒：两个周期应当吃掉 2×(进料1 + 燃料1) = 4 份木炭、产出 8 石料
          out.quarryCharcoalConsumed = (charcoalInputBefore + charcoalFuelBefore)
            - ((station?.inventory?.countOf('charcoal') ?? 0) + (station?.fuelInventory?.countOf('charcoal') ?? 0));
          // 深采活动魔力消耗 = 周期数 × 45 秒 × 1.2/秒
          out.quarryManaDrainPerSecond = game.production.statusOf(quarry)?.drainPerSecond ?? 0;
          // 基地真的一步都没插手：这栋矿在基地半径之外
          out.quarryStillOutOfRange = Math.hypot(
            quarry.position.x - basePos.x, quarry.position.z - basePos.z
          ) > (game.power.rules.baseSupplyRadius ?? 20);
        }
      }
    }

    // ---- 4) 基础拾荒点：地上有掉落、傀儡能捡 ----
    const salvage = game.salvage;
    out.salvageEnabled = salvage?.enabled === true;
    out.salvagePoints = salvage?.summary?.().points?.length ?? 0;
    const summaryPoints = salvage?.summary?.().points ?? [];
    out.salvageOnGround = summaryPoints.reduce((sum, point) => sum + point.onGround, 0);
    out.salvageMaxOnGround = summaryPoints[0]?.maxOnGround ?? null;
    out.salvageMarkersInScene = salvage?.markers?.length ?? 0;
    // 推一个补充事件，确认真的落到地上（不是直接进库存）
    const dropCountBefore = game.drops?.count ?? 0;
    // 把计时器压到 0 再推进
    salvage.points.forEach((entry) => { entry.timer = 0.01; });
    const invWoodBefore = inv.countOf('wood');
    await step(4);
    out.salvageProducedDrop = (game.drops?.count ?? 0) >= dropCountBefore;
    out.salvageDidNotGoStraightToBase = inv.countOf('wood') === invWoodBefore;
    out.salvageStats = salvage?.stats ?? null;

    // ---- 5) 回收：主动拆除按真实投入返还、落地成掉落物、最多一次 ----
    // 现场建一座**满血**的一级箭塔（真的付了材料），再拆掉它。
    inv.add('arrowTower', 1);
    const recycleBegin = game.beginPlacement('arrowTower');
    const recycleSpot = (() => {
      const offsets = [[-6, -6], [6, -6], [-6, 6], [6, 6], [-9, 0], [0, -9]];
      for (const entry of offsets) {
        const candidate = new (game.playerBase.position.constructor)(
          game.playerBase.position.x + entry[0], 0, game.playerBase.position.z + entry[1]
        );
        candidate.y = game.groundHeightAt({ x: candidate.x, z: candidate.z }) ?? 0;
        if (game.canPlaceAt(candidate).ok) return candidate;
      }
      return null;
    })();
    const recyclePlaced = recycleBegin?.ok && recycleSpot ? game.confirmPlacement(recycleSpot) : null;
    out.recycleTowerPlaced = recyclePlaced?.ok === true;
    if (!recyclePlaced?.ok) game.cancelPlacement?.();
    const recycleTower = recyclePlaced?.unit ?? null;
    if (recycleTower) {
      await step(200);
      out.recycleTowerBuilt = recycleTower.underConstruction !== true;
      out.recyclePaidInvestment = (recycleTower.paidInvestment ?? []).map((entry) => ({
        itemId: entry.itemId, count: entry.count
      }));
      const preview = salvage.recyclePreview(recycleTower);
      out.recyclePreviewOk = preview.ok === true;
      out.recyclePreviewRatio = Math.round(preview.ratio * 100) / 100;
      out.recyclePreviewRefund = preview.refunded;
      const dropsBefore = game.drops?.count ?? 0;
      const baseWoodBefore = inv.countOf('wood');
      const demolished = salvage.demolishBuilding(recycleTower);
      out.recycleDemolishOk = demolished.ok === true;
      const recycleDrop = (game.drops?.drops?.() ?? []).find((drop) => drop.id === ('recycle:' + recycleTower.id)) ?? null;
      out.recycleDropSpawned = Boolean(recycleDrop);
      out.recycleDropStacks = recycleDrop
        ? recycleDrop.stacks.map((stack) => ({ itemId: stack.itemId, count: stack.count }))
        : [];
      out.recycleDropMatchesPreview = Boolean(recycleDrop)
        && recycleDrop.stacks.every((stack) => (preview.refunded.find((entry) => entry.itemId === stack.itemId)?.count ?? -1) === stack.count);
      // 60% 的真实投入：拿木材这一项对照（向下取整）
      const paidWood = (recycleTower.paidInvestment ?? []).find((entry) => entry.itemId === 'wood')?.count ?? 0;
      const refundedWood = preview.refunded.find((entry) => entry.itemId === 'wood')?.count ?? 0;
      out.recycleRatioExact = refundedWood === Math.floor(paidWood * 0.6);
      // 没有"同时返库存又生成掉落"：基地木材一份都不该多
      out.recycleDidNotCreditInventory = inv.countOf('wood') === baseWoodBefore;
      out.recycleDropsGrew = (game.drops?.count ?? 0) > dropsBefore;
      out.recycleTowerRemoved = recycleTower.alive === false;
      // 重复拆除 / 死亡回收都不能再结算第二份
      const again = salvage.demolishBuilding(recycleTower);
      out.recycleSecondRefused = again.ok === false;
      out.recycleSecondWreck = salvage.settleWreck(recycleTower);
      out.recycleSettledOnce = salvage.recycleStats.settled === 1;
      out.recycleStats = { ...salvage.recycleStats };
      // 基地与免费对象拆不出资源
      out.recycleBaseRefused = salvage.canRecycle(game.playerBase).ok === false;
      out.recycleFreeObjectRefused = salvage.canRecycle({
        id: 'free-probe', type: 'furnace', team: 'player', isBuilding: true, alive: true,
        health: 10, maxHealth: 10, position: { x: 0, z: 0 }, paidInvestment: []
      }).ok === false;
    }

    game.paused = wasPaused;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));

  // =========================================================== 六、防御终端界面
  report.panel = JSON.parse(await ev(`(async () => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const out = {};
    const tower = window.__DSV__.towers.arrowTower
      ?? (game.friendlyUnits ?? []).find((unit) => unit.type === 'arrowTower');
    out.towerFound = Boolean(tower);
    // 选中它 → 扇形菜单应该有「升级」入口
    game.selectUnit(tower);
    game.syncUnitActionMenu?.();
    await new Promise((r) => setTimeout(r, 250));
    const menu = document.querySelector('#unit-action-menu');
    out.menuVisible = Boolean(menu && !menu.hidden);
    const towerButton = menu?.querySelector?.('[data-unit-action="tower"]') ?? null;
    out.towerActionPresent = Boolean(towerButton);
    out.towerActionLabel = towerButton?.querySelector?.('.unit-action-label')?.textContent ?? null;
    out.towerActionTitle = towerButton?.title ?? null;
    const repairButton = menu?.querySelector?.('[data-unit-action="repair-status"]') ?? null;
    out.repairStatusAction = repairButton?.querySelector?.('.unit-action-label')?.textContent ?? null;
    // 主动拆除入口：玩家真的付过材料的建筑才有这一项，标题要写清回收比例与返还清单
    const demolishButton = menu?.querySelector?.('[data-unit-action="demolish"]') ?? null;
    out.demolishActionPresent = Boolean(demolishButton);
    out.demolishActionLabel = demolishButton?.querySelector?.('.unit-action-label')?.textContent ?? null;
    out.demolishActionTitle = demolishButton?.title ?? null;

    // 打开塔界面（B 键路径也要能到）
    const opened = game.toggleBuildingPanel(tower);
    await new Promise((r) => setTimeout(r, 250));
    const panel = document.querySelector('#tower-panel');
    out.panelOpened = opened === true;
    out.panelVisible = Boolean(panel && !panel.hidden);
    out.panelTitle = panel?.querySelector?.('[data-tower-title]')?.textContent ?? null;
    out.panelSubtitle = panel?.querySelector?.('[data-tower-subtitle]')?.textContent ?? null;
    out.panelRole = panel?.querySelector?.('[data-tower-role]')?.textContent ?? null;
    out.panelCount = panel?.querySelector?.('[data-tower-count]')?.textContent ?? null;
    out.hasPurposeCard = Boolean(panel?.querySelector?.('.tower-card-info'));
    out.hasGates = Boolean(panel?.querySelector?.('[data-tower-gate]'));
    out.hasUpgradeCard = Boolean(panel?.querySelector?.('[data-tower-upgrade-card]'));
    const action = panel?.querySelector?.('[data-tower-begin-upgrade]') ?? panel?.querySelector?.('[data-tower-cancel-upgrade]');
    out.hasActionButton = Boolean(action);
    out.actionDisabled = action?.disabled ?? null;
    // 关闭
    game.towerPanel.close();
    out.panelClosed = document.querySelector('#tower-panel')?.hidden === true;
    // 面板节点复用（关闭不销毁）
    const rootBefore = document.querySelector('#tower-panel');
    game.toggleBuildingPanel(tower);
    await new Promise((r) => setTimeout(r, 150));
    out.panelRootReused = document.querySelector('#tower-panel') === rootBefore;
    return JSON.stringify(out);
  })()`));
  report.shots.push(await shoot('dsv-tower-panel-1280x720'));

  // 手机视口：塔界面与 HUD 不出界
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(600);
  report.panelMobile = JSON.parse(await ev(`(() => {
    const out = {};
    const panel = document.querySelector('#tower-panel');
    out.panelVisible = Boolean(panel && !panel.hidden);
    if (panel) {
      const rect = panel.getBoundingClientRect();
      out.panelRect = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
      out.panelInsideViewport = rect.x >= -1 && rect.y >= -1
        && rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1;
      // 文字不溢出：滚动宽度不超过客户宽度太多
      const frame = panel.querySelector('.facility-frame');
      out.frameScrollOverflow = frame ? frame.scrollWidth - frame.clientWidth : null;
      out.actionsInViewport = (() => {
        const button = panel.querySelector('[data-tower-begin-upgrade]') ?? panel.querySelector('[data-tower-cancel-upgrade]');
        if (!button) return null;
        const r = button.getBoundingClientRect();
        return r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= -1 && r.bottom <= window.innerHeight + 1;
      })();
    }
    const meter = document.querySelector('#power-net-meter');
    out.powerMeterVisible = Boolean(meter && !meter.hidden);
    if (meter) {
      const r = meter.getBoundingClientRect();
      out.powerMeterInViewport = r.left >= -1 && r.right <= window.innerWidth + 1;
      out.powerMeterScroll = meter.scrollWidth - meter.clientWidth;
    }
    return JSON.stringify(out);
  })()`));
  report.shots.push(await shoot('dsv-tower-panel-390x844', { width: 390, height: 844, dpr: 2, mobile: true }));

  // 战斗场景截图（1280x720）：把镜头拉到防线上
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await ev(`(() => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const tower = window.__DSV__.towers.arrowTower;
    if (!tower) return false;
    const p = tower.position;
    game.cameraTarget.set(p.x, p.y, p.z);
    game.camera.position.set(p.x + 12, p.y + 16, p.z + 12);
    game.camera.lookAt(p.x, p.y + 1.5, p.z);
    game.renderScene();
    return true;
  })()`);
  await sleep(500);
  report.shots.push(await shoot('dsv-defense-line-1280x720'));
}

// --------------------------------------------------------------------- 判据
const towers = report.towers;
const cross = towers?.crossTower ?? {};
const towerEntries = towers?.towers ?? [];
const byId = Object.fromEntries(towerEntries.map((entry) => [entry.towerId, entry]));

report.verdict = report.started ? {
  // ---- 一、三塔三级 ----
  threeTowersBuilt: towerEntries.length === 3
    && towerEntries.every((entry) => entry.placed && entry.built),
  threeRolesDistinct: Boolean(byId.arrowTower && byId.ballista && byId.shockTower)
    && byId.arrowTower.attackRange < byId.ballista.attackRange
    && byId.arrowTower.physicalAttack < byId.ballista.physicalAttack
    && byId.shockTower.magicAttack > 0
    && byId.shockTower.attackSplashRadius > 0
    && byId.shockTower.attackRange < byId.ballista.attackRange,
  roleTextPresent: ["arrowTower", "ballista", "shockTower"]
    .every((id) => byId[id]?.purpose && byId[id]?.weakness),
  shockPowerIs1_8x: Math.abs((byId.shockTower?.manaPerShot ?? 0) / (byId.arrowTower?.manaPerShot ?? 1) - 1.8) < 0.05,
  // 资格
  tier2NeedsResearch: towers?.gates?.noResearchRefused === true && towers?.gates?.noResearchNoCost === true,
  tier2StartedAfterResearch: towers?.gates?.tier2Started === true,
  noSkip: towers?.gates?.noSkipWhileUpgrading === true,
  noDoublePay: towers?.gates?.noDoublePay === true,
  tier2Applied: cross.arrowTier2?.tier === 2 && cross.arrowTier2?.unitType === 'arrowTowerII',
  tier2Health1_3x: Math.abs((cross.arrowTier2?.maxHealth ?? 0) / (byId.arrowTower?.maxHealth ?? 1) - 1.3) < 0.02,
  tier2Carry: cross.arrowTier2?.healthKeptBelowMax === true,
  // 三级
  tier3NeedsRoute: towers?.gates?.tier3NeedsRoute === true,
  tier3GateShown: Boolean(towers?.gates?.tier3Gates?.route),
  eastRouteCleared: cross.eastRouteCleared === true,
  tier3Started: cross.tier3Started === true,
  tier3Applied: cross.arrowTier3?.tier === 3 && cross.arrowTier3?.unitType === 'arrowTowerIII',
  tier3Health1_6x: Math.abs((cross.arrowTier3?.maxHealth ?? 0) / (byId.arrowTower?.maxHealth ?? 1) - 1.6) < 0.02,
  tier3RangePlus0_8: Math.abs((cross.arrowTier3?.attackRange ?? 0) - ((byId.arrowTower?.attackRange ?? 0) + 0.8)) < 0.02,
  maxedRefused: cross.maxedRefused === true && cross.maxedNoCost === true,
  cancelRefundsExactly: cross.cancel?.started === true
    && cross.cancel.spent > 0
    && cross.cancel.refunded === cross.cancel.spent,
  noStackingAfterReload: cross.noStacking === true,
  // ---- 二、脱战维修 ----
  repairFullHealthNoRequest: report.repair?.fullHealthNoRequest === true,
  repairRequestRegistered: report.repair?.requestRegistered === true,
  repairUniqueRequest: report.repair?.noDuplicateRequest === true,
  repairInCombatHeld: report.repair?.inCombatNotDispatched === true,
  repairDispatchableAfterCombat: report.repair?.afterCombatDispatchable === true,
  repairMaterialFromInventory: report.repair?.materialResolved === true,
  repairBatchApplied: report.repair?.batchOk === true && report.repair?.healthRestored === true,
  repairConsumesMaterials: (report.repair?.batchMaterials ?? 0) > 0 && (report.repair?.statsMaterialsSpent ?? 0) > 0,
  repairNoDoubleReserve: report.repair?.reserveFirst === true && report.repair?.reserveSecondRefused === true,
  repairMissingMaterialState: report.repair?.missingMaterialReason === 'no_material',
  repairResetClears: report.repair?.resetClears === true,
  repairToggle: report.repair?.autoRepairOff === true
    && report.repair?.autoRepairOffNoDispatch === true
    && report.repair?.autoRepairOn === true,
  repairStateLabels: Boolean(report.repair?.stateLabels?.waiting)
    && Boolean(report.repair?.stateLabels?.pending)
    && Boolean(report.repair?.stateLabels?.missing_material),
  // ---- 三、食品后勤 ----
  cropPlotPlaced: report.food?.cropPlotPlaced === true && report.food?.cropPlotBuilt === true,
  grainGrows: (report.food?.grainNodesGrown ?? 0) > 0 && (report.food?.grainNodeAmount ?? 0) === 3,
  grainHandHarvestable: report.food?.grainHarvested === true,
  canteenBuilt: report.food?.canteenPlaced === true && report.food?.canteenBuilt === true,
  canteenRecipeCorrect: report.food?.canteenRecipe?.input?.itemId === 'grain'
    && report.food?.canteenRecipe?.input?.count === 2
    && report.food?.canteenRecipe?.output?.itemId === 'ration'
    && report.food?.canteenRecipe?.output?.count === 2
    && report.food?.canteenRecipe?.seconds === 12
    // 木炭走燃料格：每轮 1 份（设计文档的"谷物 2 + 木炭 1 → 口粮 2"）
    && report.food?.canteenRecipe?.fuelPerCycle === 1,
  canteenProducesRations: report.food?.canteenProduced === true,
  startingRationsPresent: (report.food?.rationCount ?? 0) > 0,
  // 真实招募来的人（不是召唤/改定义）才计入饥饿
  humanRecruitedForFood: report.food?.recruitOk === true
    && report.food?.recruitedTeam === 'player'
    && report.food?.recruitedFoodConsumer === true
    && report.food?.satietyInitialized === true,
  humanAutoEatsCarriedRation: report.food?.autoAte === true
    && (report.food?.satietyAfterEat ?? 0) > 55
    && (report.food?.satietyAfterEat ?? 0) <= 100
    && report.food?.ateWithoutLosingCommand === true,
  hungerTiersExclusive: (report.food?.hungryAttackRate ?? 0) > 0
    && (report.food?.hungryRecoveryScale ?? 0) > 0
    && (report.food?.exhaustedRecoveryScale ?? -1) === 0
    && (report.food?.exhaustedAttackRate ?? 1) < (report.food?.hungryAttackRate ?? 0),
  hungerDebuffRecovers: (report.food?.recoveredAttackRate ?? 0) > (report.food?.exhaustedAttackRate ?? 0)
    && Math.abs((report.food?.recoveredAttackRate ?? 0) - (report.food?.hungryBaseRate ?? 0)) < 0.001,
  hungerNoStacking: report.food?.noStackingWhileStarving === report.food?.exhaustedAttackRate,
  canteenServesRealMeal: report.food?.canteenServed === true
    && (report.food?.canteenRationsConsumed ?? 0) === 1
    && (report.food?.satietyAfterCanteen ?? 0) > 40,
  mealDoesNotStealCommands: report.food?.commandNotStolenByMeal === true,
  noRemoteBaseEating: report.food?.noRemoteBaseEating === true,
  nonHumansDoNotEat: report.food?.puppetIsFoodConsumer === false
    && report.food?.puppetSatietyUnchanged === true
    && report.food?.enemyIsFoodConsumer === false
    && report.food?.enemySatietyTracked === false,
  armyScaleRaisesDemand: report.food?.soldierCountMatchesConsumers === true
    && report.food?.recruitSecondOk === true
    && report.food?.recruitSecondFoodConsumer === true
    && (report.food?.consumerCount ?? 0) >= 2
    && report.food?.supplyShrinksWithArmy === true,
  // ---- 四、供能净供需 ----
  powerMeterVisible: report.power?.meterExists === true && report.power?.meterHidden === false,
  powerMeterShowsReserve: report.power?.showsReserve === true,
  powerMeterShowsNet: report.power?.showsSupplyAndDemand === true,
  powerSecondsLeftValid: report.power?.secondsLeftValid === true,
  powerRechargeNotAboveBase: report.power?.maxRechargeNotAboveBase === true,
  powerBaseReasonable: (report.power?.baseSupplyPerSecond ?? 0) > 0
    && (report.power?.baseManaCapacity ?? 0) > 0,
  // ---- 五、资源续航 ----
  stoneDepletesIntoPoorSite: report.sustainability?.stoneDepleted === true
    && report.sustainability?.poorSiteRegistered === true
    && report.sustainability?.poorSiteMarkerInWorld === true,
  poorSiteKeepsModelVisible: report.sustainability?.nodeStillVisible === true,
  poorSiteUnblocksPathing: report.sustainability?.navBlockerReleased === true,
  quarryBuildableOnPoorSite: report.sustainability?.quarrySpotFound === true
    && report.sustainability?.quarryPlaced === true
    && report.sustainability?.quarryBuilt === true,
  deepMiningOutOfBaseRange: report.sustainability?.quarryOutOfBaseRange === true,
  deepMiningStallsWithoutLocalPower: report.sustainability?.quarryReasonWithoutPower === 'no_power'
    && (report.sustainability?.quarryStoneWithoutPower ?? -1) === 0,
  localFuelPowerUnlocksDeepMining: report.sustainability?.manaFurnaceNearQuarry === true
    && report.sustainability?.manaFurnaceBuilt === true
    && report.sustainability?.manaFurnaceActive === true
    && (report.sustainability?.manaFurnaceManaStored ?? 0) > 0
    && (report.sustainability?.manaFurnaceSupplyPerSecond ?? 0) > 0,
  quarryProducesStone: report.sustainability?.quarryProduced === true
    && (report.sustainability?.quarryStoneProduced ?? 0) >= 4,
  quarryThroughputConserved: report.sustainability?.quarryStillOutOfRange === true
    && report.sustainability?.quarryRecipe === 'quarry'
    && (report.sustainability?.quarryFuelPerCycle ?? 0) === 1
    && (report.sustainability?.quarryCharcoalConsumed ?? 0) > 0
    && (report.sustainability?.quarryManaDrainPerSecond ?? 0) > 0,
  salvageEnabled: report.sustainability?.salvageEnabled === true
    && (report.sustainability?.salvagePoints ?? 0) >= 1
    && (report.sustainability?.salvageMarkersInScene ?? 0) >= 1,
  salvageDropsOnGround: report.sustainability?.salvageDidNotGoStraightToBase === true,
  salvageCapped: (report.sustainability?.salvageMaxOnGround ?? 0) > 0,
  // 回收：真实投入、60%、落地掉落、最多一次、基地与免费对象拒绝
  recyclingUsesRealInvestment: report.sustainability?.recycleTowerBuilt === true
    && report.sustainability?.recyclePreviewOk === true
    && (report.sustainability?.recyclePaidInvestment ?? []).length > 0
    && report.sustainability?.recycleRatioExact === true
    && report.sustainability?.recyclePreviewRatio === 0.6,
  recyclingLandsAsGroundDrop: report.sustainability?.recycleDemolishOk === true
    && report.sustainability?.recycleDropSpawned === true
    && report.sustainability?.recycleDropMatchesPreview === true
    && report.sustainability?.recycleDidNotCreditInventory === true
    && report.sustainability?.recycleDropsGrew === true
    && report.sustainability?.recycleTowerRemoved === true,
  recyclingSettlesAtMostOnce: report.sustainability?.recycleSecondRefused === true
    && report.sustainability?.recycleSecondWreck === null
    && report.sustainability?.recycleSettledOnce === true,
  recyclingRefusesFreeAndBase: report.sustainability?.recycleBaseRefused === true
    && report.sustainability?.recycleFreeObjectRefused === true,
  // ---- 六、界面 ----
  towerMenuAction: report.panel?.menuVisible === true
    && report.panel?.towerActionPresent === true
    && /升级|级/.test(report.panel?.towerActionLabel ?? ''),
  demolishActionOnBuilding: report.panel?.demolishActionPresent === true
    && /拆除/.test(report.panel?.demolishActionLabel ?? ''),
  towerPanelShowsEverything: report.panel?.panelOpened === true
    && report.panel?.panelVisible === true
    && Boolean(report.panel?.panelTitle)
    && Boolean(report.panel?.panelSubtitle)
    && report.panel?.hasPurposeCard === true
    && report.panel?.hasGates === true
    && report.panel?.hasUpgradeCard === true
    && report.panel?.hasActionButton === true,
  towerPanelReusesRoot: report.panel?.panelRootReused === true,
  mobilePanelInsideViewport: report.panelMobile?.panelVisible === true
    && report.panelMobile?.panelInsideViewport === true
    && (report.panelMobile?.frameScrollOverflow ?? 1) <= 2
    && report.panelMobile?.powerMeterInViewport !== false,
  noPageProblems: problems.length === 0
} : null;

console.log(JSON.stringify(report, null, 2));
const verdict = report.verdict;
const failed = verdict ? Object.entries(verdict).filter(([, value]) => !value).map(([key]) => key) : ['not_started'];
const ok = failed.length === 0;
if (!ok) console.log('FAILED CHECKS: ' + failed.join(', '));
console.log(ok ? '\nISLAND DEFENSE SURVIVAL: PASS' : '\nISLAND DEFENSE SURVIVAL: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
