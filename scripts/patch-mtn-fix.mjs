// 修山体几何：面数更切面(7) + 法线统一朝外（非索引逐三角翻转）。
import { readFileSync, writeFileSync } from 'node:fs';
const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');
let n = 0;
function rep(search, repl) {
  for (const v of [search, search.replace(/\n/g, '\r\n')]) {
    const p = txt.split(v);
    if (p.length === 2) { txt = p.join(repl.replace(/\n/g, v.includes('\r\n') ? '\r\n' : '\n')); n++; return; }
  }
  console.error('NF :: ' + search.slice(0, 40)); process.exit(1);
}
// 面数 9→7
rep('const sides = options.sides ?? 9;', 'const sides = options.sides ?? 7;');
// 非索引几何：法线朝外纠正
const oldBlock = `  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();`;
const newBlock = `  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  // 法线朝外：逐三角按体心方向翻正绕序（否则背面被剔/发黑）
  {
    const pos = flat.attributes.position;
    const count = pos.count;
    const cy = height * 0.5;
    for (let fTri = 0; fTri < count; fTri += 3) {
      const ax = pos.getX(fTri), ay = pos.getY(fTri), az = pos.getZ(fTri);
      const bx = pos.getX(fTri + 1), by = pos.getY(fTri + 1), bz = pos.getZ(fTri + 1);
      const dx = pos.getX(fTri + 2), dy = pos.getY(fTri + 2), dz = pos.getZ(fTri + 2);
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = dx - ax, vy = dy - ay, vz = dz - az;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const fox = (ax + bx + dx) / 3;
      const foy = (ay + by + dy) / 3 - cy;
      const foz = (az + bz + dz) / 3;
      if (nx * fox + ny * foy + nz * foz < 0) {
        pos.setX(fTri, bx); pos.setX(fTri + 1, ax);
        pos.setY(fTri, by); pos.setY(fTri + 1, ay);
        pos.setZ(fTri, bz); pos.setZ(fTri + 1, az);
      }
    }
    flat.computeVertexNormals();
  }`;
rep(oldBlock, newBlock);

writeFileSync(file, txt, 'utf8');
console.log(`mountain geometry fixed (facets=7 + outward normals), ${n} edits`);