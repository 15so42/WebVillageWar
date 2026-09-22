// 海岛资源节点在真实游戏里的端到端验收：
// 开局 → 采集一个会挡路的节点直到采空 → 确认模型隐藏、寻路阻挡解除、
// 导航网格那一片被重新采样（格子从不可走变回可走）。
// 只连自己起的 headless Edge（默认 9235 端口，独立 user-data-dir）。
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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

await send('Page.navigate', { url: BASE });
const report = { page: BASE, levelId: LEVEL_ID, started: false, harvest: null, problems };
for (let i = 0; i < 40; i += 1) {
  await sleep(500);
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
  await sleep(500);
  if (await ev(`!!window.__VILLAGE_WAR_DEBUG__?.game?.resourceNodes`)) { report.started = true; break; }
}

if (report.started) {
  await sleep(1000);
  report.harvest = JSON.parse(await ev(`(() => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const system = game.resourceNodes;
    const world = game.world;
    const toolFor = (definitionId) => (
      ['oak', 'pine'].includes(definitionId) ? 'axe'
        : ['stonePile', 'ironVein'].includes(definitionId) ? 'pickaxe' : null
    );
    const node = system.allNodes().find((entry) => entry.navRadius > 0 && entry.amount > 0);
    if (!node) return JSON.stringify({ error: 'no_blocking_node' });
    const cell = world.navGrid.pointToCell({ x: node.x, z: node.z });
    const before = {
      amount: node.amount,
      maxAmount: node.maxAmount,
      cellWalkable: world.navGrid.isCellWalkable(cell.x, cell.z),
      queryWalkable: world.isWalkable(node.x, node.z),
      visible: node.handle?.object?.visible !== false
    };
    // 基地库存里的木材起点：开局会发一批启动物资，所以只能比"增量"，
    // 不能断言采集后的绝对数量（旧断言写死 45，加了开局发放之后必然对不上）。
    const inventoryWoodBefore = game.baseInventory?.countOf?.('wood') ?? 0;
    // 没有工具必须采不动
    const noTool = system.harvest(node.id, { toolIds: [], position: { x: node.x, z: node.z } });
    // 站在节点上、带对应工具，一直采到采空
    const tool = toolFor(node.definitionId);
    const tools = tool ? [tool] : [];
    let swings = 0;
    let last = null;
    while (swings < 64) {
      last = system.harvest(node.id, { toolIds: tools, position: { x: node.x, z: node.z } });
      swings += 1;
      if (!last.ok || last.depleted) break;
    }
    const after = {
      amount: system.nodeById(node.id).amount,
      released: system.nodeById(node.id).released,
      cellWalkable: world.navGrid.isCellWalkable(cell.x, cell.z),
      queryWalkable: world.isWalkable(node.x, node.z),
      visible: node.handle?.object?.visible !== false
    };
    const totals = system.totals();
    return JSON.stringify({
      nodeId: node.id,
      definitionId: node.definitionId,
      tool,
      before,
      after,
      noToolError: noTool.ok ? null : noTool.error,
      swings,
      lastTaken: last?.taken ?? 0,
      bank: system.bankSnapshot(),
      totals,
      // 采集产物必须落在真正的基地库存里，而不是资源系统自己的账本
      usesInternalBank: system.usesInternalBank(),
      inventoryId: game.baseInventory?.id ?? null,
      inventoryCapacity: game.baseInventory?.capacity ?? null,
      inventoryWoodBefore,
      inventoryWood: game.baseInventory?.countOf?.('wood') ?? null,
      harvestedTotal: totals.harvestedTotal
    });
  })()`));
}

const h = report.harvest;
report.verdict = h && !h.error ? {
  // 没工具时必须被拒
  noToolRejected: h.noToolError === 'needs_tool',
  // 采空后模型必须隐藏
  modelHidden: h.after.visible === false,
  // 采空后寻路查询不再被挡
  queryUnblocked: h.before.queryWalkable === false && h.after.queryWalkable === true,
  // 采空后导航网格那一片被重新采样回可走
  gridRefreshed: h.before.cellWalkable === false && h.after.cellWalkable === true,
  depleted: h.after.amount === 0 && h.after.released === true,
  banked: (h.bank[h.definitionId === 'oak' || h.definitionId === 'pine' ? 'wood' : 'stone'] ?? 0) > 0,
  // 产物归基地库存所有，资源系统自己不再留一份
  inventoryOwns: h.usesInternalBank === false && h.inventoryId === 'base',
  // 基地库存的木材增量必须正好等于这次采到的量（开局发放的那批不算在内）
  inventoryReceived: h.inventoryWood === h.inventoryWoodBefore + h.harvestedTotal
    && h.harvestedTotal > 0
} : null;
console.log(JSON.stringify(report, null, 2));
const verdict = report.verdict;
const ok = Boolean(verdict) && Object.values(verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nISLAND RESOURCE HARVEST: PASS' : '\nISLAND RESOURCE HARVEST: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
