// 木傀儡采集链路的端到端验收：
// 开局 → 找到基地旁的木傀儡 → 派它去采一个资源点 → 驱动真实 game.tick() →
// 确认「走过去 → 采进自己背包 → 背包满 → 运回基地 → 卸货」整条链路成立，
// 并且它的活动魔力确实挂在供能系统上。
//
// headless 里 requestAnimationFrame 不推进，所以这里手动驱动 game.tick()，
// 走的是和线上同一条 runStep 路径。
// 只连自己起的 headless Edge（默认 9235 端口，独立 user-data-dir）。
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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

await send('Page.navigate', { url: BASE });
const report = { page: BASE, levelId: LEVEL_ID, started: false, result: null, problems };
report.started = await enterSurvivalGame(ev, sleep);
// 保留原有的启动诊断：进不去时要能区分"启动报错"和"没进场景"
report.ready = JSON.parse(await ev(`JSON.stringify({
  game: !!window.__VILLAGE_WAR_DEBUG__?.game,
  work: typeof window.__VILLAGE_WAR_DEBUG__?.game?.work,
  workKeys: window.__VILLAGE_WAR_DEBUG__?.game
    ? Object.keys(window.__VILLAGE_WAR_DEBUG__.game).filter((k) => /work/i.test(k))
    : [],
  launchError: window.__VILLAGE_WAR_LAST_LAUNCH_ERROR__?.message ?? null
})`));

if (report.started) {
  report.result = JSON.parse(await ev(`(() => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const work = game.work;
    const resourceNodes = game.resourceNodes;
    const base = game.baseInventory;

    // 找木傀儡：优先用 isWorker 标记，退回到工作系统登记的名单
    const registry = game.unitRegistry ?? game.units;
    const friendly = game.friendlyUnits ?? registry?.friendlyUnits ?? [];
    let worker = [...friendly].find((unit) => unit?.isWorker);
    if (!worker) {
      const registered = work?.workerList?.() ?? [];
      worker = registered[0] ?? null;
    }
    if (!worker) {
      return JSON.stringify({ error: 'no_worker', friendly: friendly.length, workApi: !!work });
    }

    const workerInventory = work.inventoryFor?.(worker)
      ?? work.inventories?.get?.(worker.id)
      ?? null;
    if (!workerInventory) return JSON.stringify({ error: 'no_worker_inventory' });

    // ---- 隔离威胁 ----
    // 这一段测的是「采集 → 搬运 → 入库」这条链，**不是**"遇到敌人怎么办"。
    // 岛上 4 处野生动物（狼/熊）会在基地附近游荡，而木傀儡现在会为了避险放下工作
    // （需求 1：非战斗任务要挑威胁度低的地方执行），所以不隔离的话这条链会时通时断。
    // 威胁规避本身由 verify-island-puppet-combat / test-puppet-arms 覆盖。
    // 只把 alive 置假，不走 handleUnitDeath：死亡结算会掉物品、改库存，
    // 那正好会污染这里要量的"基地收到多少货"。
    let clearedThreats = 0;
    (game.enemyUnits ?? []).slice().forEach((unit) => {
      if (!unit?.alive || unit.isSpawnPointNest) return;
      unit.alive = false;
      unit.health = 0;
      clearedThreats += 1;
    });
    // 巢穴也不会主动攻击，但它的"地标威胁"同样会把傀儡从近处的资源点赶走。
    // 这一段不需要它存在，直接关掉出生。
    (game.spawnPoints?.points ?? []).forEach((point) => { point.timer = 9999; });

    // 挑一个离基地最近的资源点派给它
    const basePosition = { x: worker.homePoint?.x ?? worker.x, z: worker.homePoint?.z ?? worker.z };
    // 选点必须用傀儡的真实坐标（worker.x/z 是作业系统内部视图，直接读会是 undefined，
    // 之前这里退化成「离坐标原点最近」，选到的资源点在基地另一侧，
    // 直线要穿过基地的寻路阻挡，看起来就像傀儡坏了）
    const workerX = worker.position?.x ?? 0;
    const workerZ = worker.position?.z ?? 0;
    const candidates = resourceNodes.activeNodes()
      .map((node) => ({ node, distance: Math.hypot(node.x - workerX, node.z - workerZ) }))
      .sort((a, b) => a.distance - b.distance);
    if (!candidates.length) return JSON.stringify({ error: 'no_active_node' });
    const targetNode = candidates[0].node;
    // 必须在采集前把初始量记下来：targetNode 是活对象，采完再读会变成 0
    const nodeAmountStart = targetNode.amount;
    const baseTotalStart = base.totalCount();

    // 自动派活验证：不手动派活，只跑帧，看空闲傀儡会不会自己领到任务。
    // 这条必须独立于「手动派活后能采」——后者成立完全不代表前者成立。
    const autoAssignProbe = (() => {
      const originalDelta = game.clock.getDelta.bind(game.clock);
      game.clock.getDelta = () => 0.05;
      const wasPaused = game.paused;
      game.paused = false;
      let assignedNodeId = null;
      let sawWork = false;
      for (let i = 0; i < 60; i += 1) {
        game.tick();
        const state = work.workerState?.(worker);
        if (state?.nodeId) assignedNodeId = state.nodeId;
        if (state?.state === 'moving_to_node' || state?.state === 'harvesting') sawWork = true;
      }
      game.paused = wasPaused;
      game.clock.getDelta = originalDelta;
      return { assignedNodeId, sawWork, demands: work.demands?.length ?? 0 };
    })();

    work.assignNode(worker, targetNode.id);

    // 手动驱动真实主循环
    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    const wasPaused = game.paused;
    game.paused = false;
    const samples = [];
    let sawHarvesting = false;
    let sawHauling = false;
    let backpackPeak = 0;
    let basePeak = 0;
    let powerMoved = false;
    const manaStart = worker.activityMana ?? 0;
    for (let i = 0; i < 360; i += 1) {
      // 采到一半时把背包直接塞满：背包 8 格、木材每格叠 200，
      // 一颗树填不满背包，不塞满就永远走不到「运回基地卸货」那一段。
      if (i === 200) {
        let guard = 0;
        while (workerInventory.freeSlots() > 0 && guard < 32) {
          workerInventory.add('wood', 200);
          guard += 1;
        }
      }
      game.tick();
      const state = work.workerState?.(worker);
      if (state?.state === 'harvesting') sawHarvesting = true;
      if (state?.state === 'hauling_home' || state?.state === 'depositing') sawHauling = true;
      backpackPeak = Math.max(backpackPeak, workerInventory.totalCount());
      basePeak = Math.max(basePeak, base.countOf(targetNode.resource));
      if (Math.abs((worker.activityMana ?? 0) - manaStart) > 1e-6) powerMoved = true;
      if (i % 60 === 0) {
        // 单位位置在 position 上；worker.x/z 是作业系统内部视图，直接读会是 undefined
        const wx = worker.position?.x ?? 0;
        const wz = worker.position?.z ?? 0;
        samples.push({
          tick: i,
          state: state?.state ?? null,
          x: Number(wx.toFixed(2)),
          z: Number(wz.toFixed(2)),
          distanceToNode: Number(Math.hypot(wx - targetNode.x, wz - targetNode.z).toFixed(2)),
          carrying: workerInventory.totalCount(),
          nodeAmount: resourceNodes.nodeById(targetNode.id)?.amount ?? null,
          baseCount: base.countOf(targetNode.resource),
          mana: Number((worker.activityMana ?? 0).toFixed(2))
        });
      }
    }
    game.paused = wasPaused;
    game.clock.getDelta = originalDelta;

    const finalState = work.workerState?.(worker);
    return JSON.stringify({
      workerType: worker.type ?? worker.definition?.id ?? null,
      // 隔离掉了几个威胁源：为 0 说明这一局本来就没有敌人，
      // 采集链的结论就与"有没有被威胁打断"无关，可以放心看。
      clearedThreats,
      // 活动魔力是否真的挂在供能系统上（站在基地旁魔力恒满，不能用「变没变」判断）
      powerTracked: (game.power?.receiverList?.() ?? []).some((entry) => entry.id === worker.id),
      autoAssign: autoAssignProbe,
      manaCapacityLive: worker.manaCapacity ?? null,
      // 基地坐标对账：世界侧预设写的是 (2,20)，游戏侧实体如果不在同一处，
      // 「傀儡出生在基地旁」这个前提就不成立
      worldBase: game.world?.config?.playerBasePosition ?? null,
      entityBase: game.playerBase ? { x: game.playerBase.position.x, z: game.playerBase.position.z } : null,
      workerPos: { x: Number((worker.position?.x ?? 0).toFixed(2)), z: Number((worker.position?.z ?? 0).toFixed(2)) },
      workerWalkable: game.world?.isWalkable ? game.world.isWalkable(worker.position.x, worker.position.z) : null,
      workerNavCell: (() => {
        const grid = game.world?.navGrid;
        if (!grid?.pointToCell) return null;
        const cell = grid.pointToCell(worker.position);
        return { x: cell.x, z: cell.z, walkable: grid.isCellWalkable(cell.x, cell.z) };
      })(),
      safeSteeringProbe: (() => {
        if (typeof game.safeSurfaceSteeringToward !== 'function' || !worker.position) return null;
        const result = game.safeSurfaceSteeringToward(
          worker.position,
          { x: targetNode.x, z: targetNode.z },
          worker,
          0.3
        );
        return result ? 'ok' : null;
      })(),
      moveTowardProbe: (() => {
        if (!worker.movement?.moveToward) return null;
        return worker.movement.moveToward({ x: targetNode.x, z: targetNode.z }, 0.05, 0.24, { direct: false }) === true;
      })(),
      // 沿着「傀儡 → 目标」的连线每 0.25m 采一次可走性，找出第一个被拒的位置。
      // 傀儡自己那格可走但一步都迈不出去，说明问题在脚下而不是目标点。
      pathProbe: (() => {
        if (!game.world?.isWalkable) return null;
        const x0 = worker.position.x;
        const z0 = worker.position.z;
        const dx = targetNode.x - x0;
        const dz = targetNode.z - z0;
        const length = Math.hypot(dx, dz) || 1;
        const steps = Math.min(24, Math.floor(length / 0.25));
        const out = [];
        for (let i = 1; i <= steps; i += 1) {
          const t = (i * 0.25) / length;
          const x = x0 + dx * t;
          const z = z0 + dz * t;
          out.push({ d: Number((i * 0.25).toFixed(2)), walk: game.world.isWalkable(x, z) });
        }
        return out;
      })(),
      neighborsProbe: (() => {
        if (!game.world?.isWalkable) return null;
        const x0 = worker.position.x;
        const z0 = worker.position.z;
        const dirs = [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4], [0.28, 0.28], [-0.28, 0.28], [0.28, -0.28], [-0.28, -0.28]];
        return dirs.map(([dx, dz]) => game.world.isWalkable(x0 + dx, z0 + dz) ? 1 : 0);
      })(),
      workerIsWorker: worker.isWorker === true,
      manaCapacity: worker.manaCapacity ?? null,
      inventoryCapacity: workerInventory.capacity,
      targetNode: { id: targetNode.id, resource: targetNode.resource, amountStart: nodeAmountStart },
      nodeAmountEnd: resourceNodes.nodeById(targetNode.id)?.amount ?? null,
      backpackEnd: workerInventory.totalCount(),
      backpackPeak,
      baseStart: baseTotalStart,
      baseEnd: base.totalCount(),
      basePeak,
      baseDelta: base.totalCount() - baseTotalStart,
      sawHarvesting,
      sawHauling,
      powerMoved,
      finalState: finalState?.state ?? null,
      finalNote: finalState?.note ?? null,
      samples
    });
  })()`));
}

const r = report.result;
report.verdict = r && !r.error ? {
  workerSpawned: r.workerIsWorker === true,
  hasManaBarFields: typeof r.manaCapacity === 'number' && r.manaCapacity > 0,
  // 真的采到了：节点剩余量下降
  nodeDrained: typeof r.nodeAmountEnd === 'number' && r.nodeAmountEnd < r.targetNode.amountStart,
  reachedHarvestState: r.sawHarvesting === true,
  // 产物先经过傀儡背包，最后落到基地
  carriedSomething: r.backpackPeak > 0,
  hauledHome: r.sawHauling === true,
  // 用基地总量增量判断，不绑死具体资源种类
  baseReceived: r.baseDelta > 0,
  // 活动魔力确实挂在供能系统上（站在基地旁时魔力恒满，不能拿「变没变」当断言）
  manaTracked: r.powerTracked === true,
  // 空闲傀儡会按需求表自动领活，不需要玩家手点
  autoAssigned: r.autoAssign?.sawWork === true && Boolean(r.autoAssign?.assignedNodeId)
} : null;
console.log(JSON.stringify(report, null, 2));
const verdict = report.verdict;
const ok = Boolean(verdict) && Object.values(verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nWORKER GATHER CHAIN: PASS' : '\nWORKER GATHER CHAIN: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
