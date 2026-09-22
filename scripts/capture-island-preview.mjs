// 海岛地图预览验收：在 world-preview 页渲染 island-survival，逐个机位截图，
// 并采样地形高度 / 可走性，检查「露在水面上的陆地 = 寻路可走」这条不变量。
// 只连自己起的 headless Edge（默认 9235 端口，独立 user-data-dir），不碰用户的浏览器。
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';

const CDP_PORT = Number(process.env.ISLAND_CDP_PORT || 9235);
const ORIGIN = process.env.ISLAND_URL || 'http://127.0.0.1:3000';
const PAGE = `${ORIGIN}/world-preview.html?scene=island-survival`;
const OUT_DIR = 'C:/WebProjects/WebVillageWar/outputs';
mkdirSync(OUT_DIR, { recursive: true });

const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
let target = list.find((t) => t.type === 'page');
if (!target) {
  target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(PAGE)}`, { method: 'PUT' })).json();
}
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
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const shoot = async (name) => {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  const path = `${OUT_DIR}/${name}.png`;
  writeFileSync(path, Buffer.from(res.data, 'base64'));
  return path;
};

await send('Page.navigate', { url: PAGE });
const report = { page: PAGE, ready: false, problems, static: null, samples: null, shots: [] };

for (let i = 0; i < 60; i += 1) {
  await sleep(500);
  if (await ev(`!!window.worldPreview`)) { report.ready = true; break; }
}
if (report.ready) {
  await sleep(1500);
  report.static = JSON.parse(await ev(`(() => {
    const wp = window.worldPreview;
    const w = wp.world;
    let meshes = 0;
    let ocean = false;
    let oceanOpacity = null;
    let oceanY = null;
    let points = 0;
    wp.scene.traverse((o) => {
      if (!o.isMesh) return;
      meshes += 1;
      points += o.geometry?.attributes?.position?.count ?? 0;
      if (o.name === 'island-ocean') {
        ocean = true;
        oceanOpacity = o.material.opacity;
        oceanY = o.position.y;
      }
    });
    return JSON.stringify({
      sceneKey: w.config.sceneKey,
      theme: w.config.theme,
      ground: w.config.ground,
      waterHeight: w.config.landmass?.waterHeight ?? null,
      shoreInner: w.config.landmass?.shoreInner ?? null,
      shoreOuter: w.config.landmass?.shoreOuter ?? null,
      lobeCount: (w.config.landmass?.lobes ?? []).length,
      hills: (w.config.terrain?.hills ?? []).length,
      forestZones: (w.config.forestZones ?? []).length,
      boulderClusters: (w.config.boulderClusters ?? []).length,
      navStats: w.navGrid?.takeStats?.() ?? null,
      meshes,
      vertices: points,
      ocean,
      oceanOpacity,
      oceanY,
      base: w.config.playerBasePosition,
      camp: w.config.enemyCampPosition,
      resourceNodes: (w.resourceNodes ?? []).length,
      resourceByKind: (w.resourceNodes ?? []).reduce((acc, n) => {
        acc[n.definitionId] = (acc[n.definitionId] ?? 0) + 1;
        return acc;
      }, {}),
      totalResourceAmount: (w.resourceNodes ?? []).reduce((sum, n) => sum + n.amount, 0),
      hasReleaseApi: typeof w.releaseResourceNode === 'function'
    });
  })()`));

  // 地形与可走性采样：露在水面之上的陆地必须是可走的，反之不能出现「可走的水面」
  report.samples = JSON.parse(await ev(`(() => {
    const w = window.worldPreview.world;
    const rows = [];
    for (let x = -80; x <= 80; x += 8) {
      for (let z = -70; z <= 70; z += 8) {
        const h = w.heightAt(x, z);
        rows.push([x, z, Number(h.toFixed(2)), w.isWalkable(x, z) ? 1 : 0]);
      }
    }
    return JSON.stringify(rows);
  })()`));

  // worldPreview.views 已经是机位名数组，不要再套 Object.keys
  const viewNames = JSON.parse(await ev(`JSON.stringify(window.worldPreview.views ?? [])`));
  await ev(`window.worldPreview.orbit.autoRotate = false; true`);
  report.cameras = [];
  for (const name of viewNames) {
    await ev(`window.worldPreview.setView(${JSON.stringify(name)}); true`);
    await sleep(700);
    const cam = JSON.parse(await ev(`JSON.stringify({
      name: ${JSON.stringify(name)},
      pos: window.worldPreview.camera.position.toArray().map((v) => Number(v.toFixed(1))),
      dist: Number(window.worldPreview.orbit.distance.toFixed(1))
    })`));
    report.cameras.push(cam);
    report.shots.push(await shoot(`island-${name}`));
  }
  // 俯视全岛：判断海岸线形状最直观的一张
  await ev(`window.worldPreview.setCamera({ target: [0, 0, 0], yaw: Math.PI * 0.5, pitch: 1.44, distance: 235 }); true`);
  await sleep(900);
  report.shots.push(await shoot('island-topdown'));
}

const s = report.samples ?? [];
const water = s.filter((r) => r[2] <= 0.02);
const land = s.filter((r) => r[2] > 0.02);
const walkable = s.filter((r) => r[3] === 1);
const walkableUnderwater = s.filter((r) => r[3] === 1 && r[2] <= 0.02);
const landUnwalkable = s.filter((r) => r[3] === 0 && r[2] > 0.6);
report.summary = {
  sampled: s.length,
  landSamples: land.length,
  waterSamples: water.length,
  walkableSamples: walkable.length,
  // 必须为 0：可走却被水淹没
  walkableUnderwater: walkableUnderwater.length,
  walkableUnderwaterAt: walkableUnderwater.slice(0, 8).map((r) => [r[0], r[1], r[2]]),
  // 允许少量（岸边缓冲区），但不应大面积
  landUnwalkable: landUnwalkable.length,
  landUnwalkableAt: landUnwalkable.slice(0, 8).map((r) => [r[0], r[1], r[2]]),
  minHeight: s.length ? Math.min(...s.map((r) => r[2])) : null,
  maxHeight: s.length ? Math.max(...s.map((r) => r[2])) : null,
  centerHeight: s.find((r) => r[0] === 0 && r[1] === 0)?.[2] ?? null,
  edgeHeights: [
    s.find((r) => r[0] === -80 && r[1] === 0)?.[2] ?? null,
    s.find((r) => r[0] === 80 && r[1] === 0)?.[2] ?? null,
    s.find((r) => r[0] === 0 && r[1] === -70)?.[2] ?? null,
    s.find((r) => r[0] === 0 && r[1] === 70)?.[2] ?? null
  ]
};
delete report.samples;
console.log(JSON.stringify(report, null, 2));
ws.close();
