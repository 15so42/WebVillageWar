// v3b：当前可见系统微调——①山色深紫提亮转冷 ②巨岩收敛 ③路缘+雪侵。其余不动。CRLF/LF 兼容。
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

// **** ① 山色：最深岩去紫、略提亮（保留暖灰/明暗切面）****
// 远山环的主色
repAll("  rockShade: '#4d5a76', // 背阴岩面：青紫冷影，与地面 shade 色同族", "  rockShade: '#5b6773', // 背阴岩面：冷蓝灰，去紫并略提亮", 1);
// 岩块系统（boulderClusters/岩石堆）的主色
repAll("        mid: '#7c6a6e',", "        mid: '#7f7f83',", 1);
repAll("        shadow: '#484054',", "        shadow: '#5b6371',", 1);

// **** ② 巨岩收敛（sizeMax 上限压低，读成山势小丘而非几块孤岩）****
repAll('sizeMin: 1.55, sizeMax: 3.2', 'sizeMin: 1.5, sizeMax: 2.5', 1);
repAll('sizeMin: 1.7, sizeMax: 3.7', 'sizeMin: 1.6, sizeMax: 2.7', 1);
repAll('sizeMin: 1.55, sizeMax: 3.05', 'sizeMin: 1.5, sizeMax: 2.5', 1);
repAll('sizeMin: 1.45, sizeMax: 2.9', 'sizeMin: 1.45, sizeMax: 2.5', 1);
repAll('sizeMin: 1.35, sizeMax: 3.15', 'sizeMin: 1.35, sizeMax: 2.5', 1);

// **** ③ 路缘更自然 + 路边雪侵 ****
repAll('      edgeJitter: 0.34', '      edgeJitter: 0.42', 1);

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
const da = txt.indexOf('    createSnowValleyBackdrop(scene, seededRandom((worldConfig().seed ?? 42) + 977));');
if (da < 0) { console.error('backdrop anchor not found'); process.exit(1); }
txt = txt.slice(0, da) + snowFn + txt.slice(da);
changes += 1;
repAll('    createSnowValleyBackdrop(scene, seededRandom((worldConfig().seed ?? 42) + 977));',
  '    createSnowValleyBackdrop(scene, seededRandom((worldConfig().seed ?? 42) + 977));\n    placeSnowRoadOverlap(scene, pathPoints);', 1);

writeFileSync(file, txt, 'utf8');
console.log(`v3b applied (${changes} edits)`);
