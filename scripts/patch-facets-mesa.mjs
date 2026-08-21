// 把 createFacetedWallGeometry 从"四圈收顶圆包(球)"重写为"平顶多级台阶断块(梯田)"（CRLF 兼容）
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');

const startAnchor = 'function createFacetedWallGeometry(random, options = {}) {';
const endAnchor = '// 雪谷峡谷岩壁运行时记录：用于把穿插的装饰物抬升到岩壁表面，而不是删除岩壁。';

const si = txt.indexOf(startAnchor);
const ei = txt.indexOf(endAnchor);
if (si < 0 || ei < 0 || ei <= si) {
  console.error('anchors not found');
  process.exit(1);
}

const newFn = `function createFacetedWallGeometry(random, options = {}) {
  // 低模梯田式断块：长方形角面剪影 + 多级平顶台阶 + 棱面侧壁。
  // 顶部是平面多边形（雪帽），不是球、不是方盒、不是收顶圆包。
  const length = options.length ?? 12;
  const height = options.height ?? 10;
  const depth = options.depth ?? 6;
  const halfLength = length * 0.5;
  const halfDepth = depth * 0.5;
  const jitter = (amount) => (random() - 0.5) * amount;

  // 长方形 octagon 剪影（角面），顶点带少量起伏
  const outline = [
    [-halfLength, -halfDepth],
    [-halfLength * 0.5, -halfDepth - halfDepth * 0.12],
    [halfLength * 0.42, -halfDepth],
    [halfLength, -halfDepth * 0.58],
    [halfLength, halfDepth * 0.55],
    [halfLength * 0.36, halfDepth],
    [-halfLength * 0.44, halfDepth + halfDepth * 0.1],
    [-halfLength, halfDepth * 0.68]
  ].map(([x, z]) => [x + jitter(length * 0.045), z + jitter(depth * 0.07)]);
  const pts = outline.length;

  // 3 级平顶台阶：每级轮廓收缩、向背谷方向微退（背高前低的梯田）
  const tiers = [
    { y: 0.02, scale: 1.0, back: 0 },
    { y: height * 0.46, scale: 0.74, back: -depth * 0.12 },
    { y: height, scale: 0.52, back: -depth * 0.24 }
  ];

  const ringPoints = tiers.map((tier) =>
    outline.map(([x0, z0]) => [
      x0 * tier.scale + jitter(length * 0.012),
      z0 * tier.scale + tier.back + jitter(depth * 0.02)
    ])
  );

  const vertices = [];
  const indices = [];
  const pts0 = pts;

  // 每级点加入
  ringPoints.forEach((ring) => {
    ring.forEach(([x, z]) => vertices.push(x, 0, z)); // y 稍后按级设置
  });

  // 侧壁：相邻两级之间（棱面）
  for (let tier = 0; tier < tiers.length - 1; tier += 1) {
    const yTop = tiers[tier].y;
    const yNext = tiers[tier + 1].y;
    for (let p = 0; p < pts; p += 1) {
      const n = (p + 1) % pts;
      const r0 = tier * pts0;
      const r1 = (tier + 1) * pts0;
      // 下沿（tier）高度 yTop，上沿（tier+1）高度 yNext
      // 顶点顺序：ring 内点先在数组里，需要给每级统一设 y
      // 这里先记录边并最后统一设 y
      indices.push(r0 + p, r0 + n, r1 + n, r0 + p, r1 + n, r1 + p);
    }
    void yTop; void yNext;
  }

  // 每级平顶（tier>=1 是台阶台面）
  for (let tier = 1; tier < tiers.length; tier += 1) {
    const ring = ringPoints[tier];
    let cx = 0;
    let cz = 0;
    ring.forEach(([x, z]) => { cx += x; cz += z; });
    cx /= pts;
    cz /= pts;
    const centerIdx = vertices.length / 3;
    vertices.push(cx, tiers[tier].y, cz);
    const start = tier * pts0;
    for (let p = 0; p < pts; p += 1) {
      indices.push(start + p, start + ((p + 1) % pts), centerIdx);
    }
  }

  // 设置每级环的 y
  for (let tier = 0; tier < tiers.length; tier += 1) {
    const y = tiers[tier].y;
    for (let p = 0; p < pts; p += 1) {
      vertices[(tier * pts0 + p) * 3 + 1] = y;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const flat = geometry.toNonIndexed();
  geometry.dispose();

  paintSnowMountainFaces(flat, random, {
    heightScale: height,
    slopeSnowRange: [0.30, 0.62],
    heightSnowRange: [0.60, 0.96],
    heightJitter: 0.14,
    heightWeight: 1.1,
    patchChance: 0.04
  });
  return flat;
}

`;

txt = txt.slice(0, si) + newFn + txt.slice(ei);
writeFileSync(file, txt, 'utf8');
console.log('createFacetedWallGeometry rewritten to flat-top stepped mesa');
