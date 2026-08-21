// 梯田山体材质：平顶覆雪/陡壁露岩（正则容忍 CRLF/LF）
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');

// 1) 插入干净配色函数（在 createFacetedWallGeometry 之前，随该函数 LF 风格）
const fnBefore = `function createFacetedWallGeometry(random, options = {}) {`;
const iFn = txt.indexOf(fnBefore);
if (iFn < 0) { console.error('mesa fn not found'); process.exit(1); }
const colorFn = `// 梯田山体干净配色：平顶（法线朝上）覆雪，陡壁露岩三类，无斑点噪声。
function paintCleanTerraceFaces(geometry, height) {
  const pos = geometry.attributes.position;
  const count = pos.count;
  let color = geometry.attributes.color;
  if (!color) {
    color = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    geometry.setAttribute('color', color);
  }
  const sunDir = worldConfig().art?.sunDirection ?? { x: -0.6, y: 0.4, z: 0.5 };
  const sd = new THREE.Vector3(sunDir.x, sunDir.y, sunDir.z).normalize();
  const snowLit = new THREE.Color('#f2f6fb');
  const snowDark = new THREE.Color('#c2cfdf');
  const rockLit = new THREE.Color('#d9cfc0');
  const rockMid = new THREE.Color('#aaa291');
  const rockDark = new THREE.Color('#55627c');
  const c = new THREE.Color();
  for (let f = 0; f < count; f += 3) {
    const ax = pos.getX(f), ay = pos.getY(f), az = pos.getZ(f);
    const bx = pos.getX(f + 1), by = pos.getY(f + 1), bz = pos.getZ(f + 1);
    const dx = pos.getX(f + 2), dy = pos.getY(f + 2), dz = pos.getZ(f + 2);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = dx - ax, vy = dy - ay, vz = dz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const cy = (ay + by + dy) / 3;
    const faceYUp = Math.abs(ny);
    const ndl = nx * sd.x + ny * sd.y + nz * sd.z;
    if (faceYUp > 0.6 || cy > height * 0.72) {
      const t = 0.5 + 0.5 * Math.max(-0.4, Math.min(0.6, ndl));
      c.copy(snowDark).lerp(snowLit, t);
    } else if (ndl > 0.12) {
      c.copy(rockLit);
    } else if (ndl > -0.12) {
      c.copy(rockMid);
    } else {
      c.copy(rockDark);
    }
    for (let k = 0; k < 3; k += 1) color.setXYZ(f + k, c.r, c.g, c.b);
  }
  color.needsUpdate = true;
}

`;
txt = txt.slice(0, iFn) + colorFn + txt.slice(iFn);

// 2) 替换 mesa 的 paintSnowMountainFaces 调用（容忍两种换行）
const rePaint = /  paintSnowMountainFaces\(flat, random, \{\r?\n(\s*)heightScale: height,\r?\n(\s*)slopeSnowRange: \[0\.30, 0\.62\],\r?\n(\s*)heightSnowRange: \[0\.60, 0\.96\],\r?\n(\s*)heightJitter: 0\.14,\r?\n(\s*)heightWeight: 1\.1,\r?\n(\s*)patchChance: 0\.04\r?\n(\s*)\}\);\r?\n  return flat;/;
if (!rePaint.test(txt)) { console.error('mesa paint block not found (regex)'); process.exit(1); }
txt = txt.replace(rePaint, '  paintCleanTerraceFaces(flat, height);\n  return flat;');

writeFileSync(file, txt, 'utf8');
console.log('terrace material applied (clean snow/rock)');
