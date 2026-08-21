// 修复平顶台阶几何法线（鲁棒版）：插 helper + 换 normal 计算 + DoubleSide(尽力)
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');
let count = 0;

const helper = `// 把几何体内指向的三角面翻正：法线统一朝体心外侧（否则俯视下背面被剔除/发黑）。
function fixOutwardNormals(geometry, approxHeight) {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  if (!index) return;
  const cx = 0;
  const cy = approxHeight * 0.5;
  const cz = 0;
  const countT = index.count;
  const p = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
  for (let t = 0; t < countT; t += 3) {
    const ia = index.getX(t);
    const ib = index.getX(t + 1);
    const ic = index.getX(t + 2);
    const [ax, ay, az] = p(ia);
    const [bx, by, bz] = p(ib);
    const [dx, dy, dz] = p(ic);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = dx - ax, vy = dy - ay, vz = dz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const fx = (ax + bx + dx) / 3 - cx;
    const fy = (ay + by + dy) / 3 - cy;
    const fz = (az + bz + dz) / 3 - cz;
    if (nx * fx + ny * fy + nz * fz < 0) {
      index.setX(t, ib);
      index.setX(t + 1, ia);
    }
  }
  geometry.computeVertexNormals();
}

`;

const hs = txt.indexOf('function createFacetedWallGeometry(random, options = {}) {');
if (hs < 0) { console.error('mesa fn not found'); process.exit(1); }
txt = txt.slice(0, hs) + helper + txt.slice(hs);
count += 1;

const reGeom = /(  geometry\.setIndex\(indices\);\r?\n)  geometry\.computeVertexNormals\(\);\r?\n(  const flat = geometry\.toNonIndexed\(\);\r?\n  geometry\.dispose\(\);)/;
if (reGeom.test(txt)) {
  txt = txt.replace(reGeom, '$1  fixOutwardNormals(geometry, height);\r\n$2');
  count += 1;
} else {
  console.warn('mesa geom block skipped (not found)');
}

// DoubleSide 尽力
const reMat = /(    flatShading: true)(\r?\n  \}\)\);)/;
if (reMat.test(txt)) {
  txt = txt.replace(reMat, '$1,\r\n    side: THREE.DoubleSide$2');
  count += 1;
}

writeFileSync(file, txt, 'utf8');
console.log(`normal fix applied (${count} edits)`);
