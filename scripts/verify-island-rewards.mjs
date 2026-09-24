// 刷怪点清除奖励端到端验收（方案第 6.1 / 6.2 节）。
//
// 方案确认「新增傀儡来源是刷怪点」；数据里的 `point.drops` 此前只是留了个钩子，
// 没有任何地方读。这个脚本验的就是：打掉巢穴之后，该掉的东西真的掉了，
// 该给的傀儡真的到了，而且**只发一次**。
//
// 三个要点：
//   1) 掉落走的是地面遗物包（和阵亡掉落同一个系统），不是直接进基地库存；
//   2) 新傀儡落在可走格子上、登记成傀儡、带启动工具；
//   3) 同一个点再"摧毁"一次不会重复发奖励。
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
const ev = async (expr) => {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    const detail = res.exceptionDetails.exception?.description ?? res.exceptionDetails.text ?? 'unknown';
    throw new Error('page eval failed: ' + detail);
  }
  return res.result.value;
};

await send('Page.navigate', { url: BASE });
const report = { page: BASE, levelId: LEVEL_ID, started: false, result: null, problems };
report.started = await enterSurvivalGame(ev, sleep);

if (report.started) {
  report.result = JSON.parse(await ev(`(() => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const out = {};
    if (!game.spawnPoints?.points?.length) return JSON.stringify({ error: 'no_spawn_points' });
    if (!game.drops) return JSON.stringify({ error: 'no_ground_drop_system' });

    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    const wasPaused = game.paused;
    game.paused = false;
    const elapsedBefore = game.elapsedTime;
    const tick = (n) => { for (let i = 0; i < n; i += 1) game.tick(); };
    tick(4);
    game.pendingStrategyRewards = [];
    game.awaitingOpeningReward = false;
    if (game.strategyEvent) game.strategyEvent = null;
    if (game.strategyEventUi?.root) game.strategyEventUi.root.hidden = true;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');

    const point = game.spawnPoints.points[0];
    out.pointId = point.id;
    out.pointName = point.name ?? null;
    out.pointDrops = (point.drops ?? []).map((entry) => ({ itemId: entry.itemId, count: entry.count }));
    out.pointWorkerReward = point.workerReward ?? null;
    // 招募令的材料只从刷怪点来，所以每个点都必须带深邃核心
    out.pointHasDeepCore = (point.drops ?? []).some((entry) => entry.itemId === 'deepCore' && entry.count >= 1);
    out.workersBefore = (game.friendlyUnits ?? []).filter((u) => u?.alive && u.isWorker).length;
    out.dropsBefore = game.drops.count;
    out.baseWoodBefore = game.baseInventory.countOf('wood');
    // 按 id 差集认新单位：开局那支傀儡没有标记，靠"没有 testTag"之类的启发式会认错。
    const idsBefore = new Set((game.friendlyUnits ?? []).map((u) => u.id));

    // 走真实链路：打死巢穴，由 handleUnitDeath → destroyPoint → onSpawnPointCleared 结算
    const nest = (game.enemyUnits ?? []).find((u) => u?.isSpawnPointNest && u.spawnPointId === point.id);
    out.nestFound = Boolean(nest);
    if (nest) {
      nest.alive = false;
      game.handleUnitDeath(nest, null);
    }
    tick(2);

    out.pointCleared = game.spawnPoints.pointById(point.id)?.cleared === true;
    out.dropsAfter = game.drops.count;
    const drop = game.drops.drops().find((entry) => (
      entry.stacks.some((stack) => stack.itemId === 'wood')
    )) ?? game.drops.drops()[0] ?? null;
    out.dropStacks = drop ? drop.stacks.map((stack) => ({ itemId: stack.itemId, count: stack.count })) : [];
    out.dropDistanceFromPoint = drop
      ? Math.round(Math.hypot(drop.x - point.x, drop.z - point.z) * 100) / 100
      : null;
    // 掉落必须先落在地上，而不是直接进基地库存
    out.baseWoodAfter = game.baseInventory.countOf('wood');

    const workers = (game.friendlyUnits ?? []).filter((u) => u?.alive && u.isWorker);
    out.workersAfter = workers.length;
    const fresh = (game.friendlyUnits ?? []).find((u) => u?.alive && !idsBefore.has(u.id)) ?? null;
    out.freshWorker = fresh ? {
      type: fresh.type,
      isWorker: game.work.isWorker(fresh) === true,
      hasBag: Boolean(fresh.workerInventory),
      bagCounts: fresh.workerInventory?.countsByItem?.() ?? null,
      cellWalkable: (() => {
        const cell = game.world?.navGrid?.pointToCell?.({ x: fresh.position.x, z: fresh.position.z });
        return cell ? game.world.navGrid.isCellWalkable(cell.x, cell.z) : null;
      })(),
      distanceFromPoint: Math.round(Math.hypot(fresh.position.x - point.x, fresh.position.z - point.z) * 100) / 100
    } : null;

    // 幂等：再"摧毁"同一个点一次，不能再发一份
    const dropsBeforeRepeat = game.drops.count;
    const workersBeforeRepeat = (game.friendlyUnits ?? []).filter((u) => u?.alive && u.isWorker).length;
    const repeatResult = game.spawnPoints.destroyPoint(point.id);
    // 也再走一次巢穴死亡通知
    if (nest) game.handleUnitDeath(nest, null);
    tick(2);
    out.repeatDestroyReturned = repeatResult;
    out.repeatDropDelta = game.drops.count - dropsBeforeRepeat;
    out.repeatWorkerDelta = (game.friendlyUnits ?? []).filter((u) => u?.alive && u.isWorker).length
      - workersBeforeRepeat;

    out.elapsedAdvanced = game.elapsedTime > elapsedBefore;
    game.paused = wasPaused;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));
}

const r = report.result;
const expectedDrops = Object.fromEntries((r?.pointDrops ?? []).map((entry) => [entry.itemId, entry.count]));
const actualDrops = Object.fromEntries((r?.dropStacks ?? []).map((entry) => [entry.itemId, entry.count]));
report.verdict = r && !r.error ? {
  ranClean: true,
  nestFound: r.nestFound === true,
  pointCleared: r.pointCleared === true,
  // 招募令的材料（深邃核心）必须挂在每个刷怪点的掉落里
  pointDropsDeepCore: r.pointHasDeepCore === true,
  // 该掉的资源掉在地上，数量与配置一致
  dropAppeared: r.dropsAfter === r.dropsBefore + 1,
  dropContentsMatchConfig: Object.keys(expectedDrops).length > 0
    && Object.keys(expectedDrops).every((itemId) => actualDrops[itemId] === expectedDrops[itemId]),
  // 掉落是地面物，不是直接进基地
  dropIsOnGround: r.dropDistanceFromPoint !== null && r.dropDistanceFromPoint < 6,
  notAutoBanked: r.baseWoodAfter === r.baseWoodBefore,
  // 傀儡奖励到手：多了一支、登记成傀儡、带启动工具、落在可走格子上
  workerGranted: r.workersAfter === r.workersBefore + 1,
  workerIsRegistered: r.freshWorker?.isWorker === true,
  workerHasTools: r.freshWorker?.bagCounts?.axe === 1 && r.freshWorker?.bagCounts?.pickaxe === 1,
  workerOnWalkableCell: r.freshWorker?.cellWalkable === true,
  // 幂等：重复摧毁不再发
  repeatDestroyRejected: r.repeatDestroyReturned === false,
  repeatGrantsNothing: r.repeatDropDelta === 0 && r.repeatWorkerDelta === 0,
  elapsedAdvanced: r.elapsedAdvanced === true
} : null;
console.log(JSON.stringify(report, null, 2));
const ok = Object.values(report.verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nISLAND NEST REWARDS: PASS' : '\nISLAND NEST REWARDS: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
