// One-time, conservative crown clearance for static snow-valley scenery.
// A spatial hash includes rocks and towers placed before the deferred trees.
const CELL = 6;
function cells(x, z, radius) {
  const result = [];
  for (let a = Math.floor((x - radius) / CELL); a <= Math.floor((x + radius) / CELL); a += 1) {
    for (let b = Math.floor((z - radius) / CELL); b <= Math.floor((z + radius) / CELL); b += 1) result.push(`${a}:${b}`);
  }
  return result;
}
function segmentDistance(x, z, a, b) {
  const dx = b.x - a.x; const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}
export function createSnowCanyonPlacement(surfaceAt, cliffLayers) {
  const buckets = new Map();
  const report = { treeCount: 0, attemptedCount: 0, rejectedCount: 0, rejectedByReason: {},
    minTreeClearance: null, minCliffClearance: null, clearanceViolations: [], trees: [] };
  function add(item) {
    for (const key of cells(item.x, item.z, item.radius)) {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(item);
    }
  }
  function reject(reason) {
    report.rejectedCount += 1;
    report.rejectedByReason[reason] = (report.rejectedByReason[reason] ?? 0) + 1;
    return null;
  }
  function place(tree) {
    report.attemptedCount += 1;
    const { x, z, radius, height } = tree;
    const y = surfaceAt(x, z);
    let low = y; let high = y;
    for (let i = 0; i < 16; i += 1) {
      const angle = i / 16 * Math.PI * 2;
      const h = surfaceAt(x + Math.cos(angle) * (radius + 0.55), z + Math.sin(angle) * (radius + 0.55));
      low = Math.min(low, h); high = Math.max(high, h);
    }
    if (high - low > 0.48) return reject('cliff-or-ledge');
    const canopyBottom = y + height * 0.16;
    const canopyTop = y + height;
    let cliffClearance = Infinity;
    for (const layer of cliffLayers) {
      if (layer.top < canopyBottom) continue;
      for (let i = 0; i < layer.edge.length - 1; i += 1) {
        cliffClearance = Math.min(cliffClearance, segmentDistance(x, z, layer.edge[i], layer.edge[i + 1]) - radius - 1.05);
      }
    }
    if (cliffClearance < 0.25) return reject('crown-against-cliff');
    let treeClearance = Infinity;
    const seen = new Set();
    for (const key of cells(x, z, radius + 0.35)) {
      for (const item of buckets.get(key) ?? []) {
        if (seen.has(item)) continue; seen.add(item);
        if (item.top < canopyBottom || item.bottom > canopyTop) continue;
        const gap = Math.hypot(x - item.x, z - item.z) - radius - item.radius;
        if (gap < 0.28) return reject(item.tree ? 'crown-against-tree' : 'crown-against-prop');
        if (item.tree) treeClearance = Math.min(treeClearance, gap);
      }
    }
    add({ x, z, radius, bottom: canopyBottom, top: canopyTop, tree: true });
    report.treeCount += 1;
    if (Number.isFinite(treeClearance)) report.minTreeClearance = Math.min(report.minTreeClearance ?? Infinity, treeClearance);
    if (Number.isFinite(cliffClearance)) report.minCliffClearance = Math.min(report.minCliffClearance ?? Infinity, cliffClearance);
    report.trees.push({ x, z, y, crownRadius: radius, canopyBottom, canopyTop });
    return y;
  }
  return { addObstacle: add, place, report };
}
