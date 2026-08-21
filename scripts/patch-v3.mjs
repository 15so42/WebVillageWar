// 微调v3：①鞍脊连接(相邻山连成山脊) ②最深岩去紫提亮 ③路缘更自然+雪侵。其余不动。CRLF/LF 兼容。
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');
let changes = 0;
function repAll(search, repl, expect = null) {
  for (const v of [search, search.replace(/\n/g, '\r\n')]) {
    const parts = txt.split(v);
    if (parts.length > 1) {
      txt = parts.join(repl.replace(/\n/g, v.includes('\r\n') ? '\r\n' : '\n'));
      changes += parts.length - 1;
      if (expect !== null && parts.length - 1 !== expect) { console.error('COUNT', expect, parts.length - 1, search.slice(0, 30)); process.exit(1); }
      return;
    }
  }
  console.error('NOT FOUND :: ' + search.split('\n').pop().slice(0, 60));
  process.exit(1);
}

// ---- A) 鞍脊连接：把相邻山段间的避让空洞用低鞍脊接成山脊线 ----
const saddleFn = `// 用低鞍脊连接同一条山带内相邻的岩台，消除避让造成的"孤立巨岩"空洞，
// 形成连续山势（有鞍部起伏、不是直墙）；谷口与玩法避让区仍保持开口。
function connectCanyonSaddles(scene, material, random) {
  const groups = new Map();
  CANYON_WALL_SEGMENTS.forEach((entry) => {
    const band = entry.band;
    if (band.axis === 'x') return; // 横墙段已由显式通道管理
    const key = band.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });
  groups.forEach((entries) => {
    entries.sort((a, b) => a.seg.center - b.seg.center);
    for (let i = 0; i < entries.length - 1; i += 1) {
      const a = entries[i];
      const b = entries[i + 1];
      const halfA = a.seg.length * 0.5;
      const halfB = b.seg.length * 0.5;
      const gap = (b.seg.center - halfB) - (a.seg.center + halfA);
      if (gap < 0.5 || gap > 14) continue; // 已相连或过大则不桥接
      const midC = (a.seg.center + b.seg.center) * 0.5;
      const midX = (a.band.x + b.band.x) * 0.5;
      const h = Math.min(a.height, b.height) * 0.4 + random() * 0.5;
      const d = Math.min(a.depth, b.depth) * 0.7;
      const geom = createFacetedWallGeometry(random, { length: gap + 1.5, height: h, depth: d });
      if (a.band.tint) tintGeometryColors(geom, a.band.tint, (a.band.tintStrength ?? 0.20) * 0.8);
      const mesh = new THREE.Mesh(geom, material);
      mesh.rotation.y = a.band.side === 1 ? -Math.PI / 2 : Math.PI / 2;
      const groundY = worldSurfaceHeightAt(midX, midC);
      mesh.position.set(midX, groundY - 0.3, midC);
      enableDecorationShadows(mesh);
      bakeObjectGroundShadow(mesh);
      scene.add(mesh);
    }
  });
}

`;
const fnAnchor = 'function createSnowCanyonWalls(scene) {';
const fi = txt.indexOf(fnAnchor);
if (fi < 0) { console.error('snowCanyonWalls anchor not found'); process.exit(1); }
txt = txt.slice(0, fi) + saddleFn + txt.slice(fi);
changes += 1;

// 在 bands.forEach 之后调用
const callAnchor = `  bands.forEach((band) => {
    const segments = buildCanyonWallSegments(band, random, obstacles);
    segments.forEach((seg) => {
      addCanyonWallSegment(scene, band, seg, wallMaterial, random);
    });
  });
}`;
repAll(callAnchor, `  bands.forEach((band) => {
    const segments = buildCanyonWallSegments(band, random, obstacles);
    segments.forEach((seg) => {
      addCanyonWallSegment(scene, band, seg, wallMaterial, random);
    });
  });
  connectCanyonSaddles(scene, wallMaterial, random);
}`, 1);

// ---- B) 最深岩去紫、略提亮 ----
repAll("const rockDark = new THREE.Color('#5b6774');", "const rockDark = new THREE.Color('#62707d');", 1);

// ---- C) 路缘更自然 + 路边积雪侵入 ----
repAll('      edgeJitter: 0.34', '      edgeJitter: 0.42', 1);

// 路边小雪堆：沿主路两侧边缘撒低矮雪堆，模拟积雪侵入路缘
const snowFn = `// 路缘积雪：沿主路两侧边缘撒低矮雪堆，模拟长期踩踏形成的雪地道路、边缘被雪侵。
function placeSnowRoadOverlap(scene, pathPoints) {
  const config = worldConfig();
  const random = seededRandom((config.seed ?? 42) + 432);
  const width = config.pathWidth ?? 5.8;
  const pts = (pathPoints && pathPoints.length ? pathPoints : rawPathPoints());
  const n = pts.length;
  if (n < 3) return;
  const count = 20;
  for (let i = 0; i < count; i += 1) {
    const idx = 1 + Math.floor(random() * (n - 2));
    const a = pts[idx - 1];
    const b = pts[idx];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const side = random() < 0.5 ? 1 : -1;
    const lateral = (width * 0.5) * (0.55 + random() * 0.5);
    const tx = a.x + dx * random() - nx * side * lateral + (random() - 0.5) * 0.8;
    const tz = a.z + dz * random() - nz * side * lateral + (random() - 0.5) * 0.8;
    const size = 0.5 + random() * 0.7;
    const mound = createLowpolySnowRock(size, random, {
      color: worldMaterialColor('snow', '#dce3ec'),
      snowCap: true,
      snowColor: worldMaterialColor('snow', '#eef2f6')
    });
    const gy = terrainHeightAt(tx, tz);
    mound.position.set(tx, gy - 0.15 * size, tz);
    mound.rotation.y = random() * Math.PI * 2;
    mound.scale.set(1, 0.55, 1); // 压扁，更像雪堆
    enableDecorationShadows(mound);
    bakeObjectGroundShadow(mound);
    addStaticCulledObject(scene, mound);
  }
}

`;
const decorateAnchor = '    createSnowCanyonWalls(scene); // 层次感峡谷岩壁（替代圆锥排），近暖远冷双层+上台';
const da = txt.indexOf(decorateAnchor);
if (da < 0) { console.error('decorate anchor not found'); process.exit(1); }
txt = txt.slice(0, da) + snowFn + txt.slice(da);
changes += 1;
// 在 decorate 里调用（放在 createSnowCanyonWalls 之后）
repAll('    createSnowCanyonWalls(scene); // 层次感峡谷岩壁（替代圆锥排），近暖远冷双层+上台', '    createSnowCanyonWalls(scene); // 层次感峡谷岩壁（替代圆锥排），近暖远冷双层+上台\n    placeSnowRoadOverlap(scene, pathPoints);', 1);

writeFileSync(file, txt, 'utf8');
console.log(`v3 micro applied (${changes} edits)`);
