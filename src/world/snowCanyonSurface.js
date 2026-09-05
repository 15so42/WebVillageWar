// Build once from the final snow triangles. Queries visit only one 4 m cell and
// interpolate the actual rendered plane, so props share its low-poly surface.
const CELL_SIZE = 4;
const MIN_UPWARD_NORMAL = 0.15;
const EDGE_EPSILON = 1e-7;

export function createSnowCanyonSurfaceIndex() {
  const cells = new Map();

  function add(geometry) {
    const position = geometry.getAttribute('position');
    if (!position) return 0;
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    let added = 0;
    for (let offset = 0; offset + 2 < count; offset += 3) {
      const ia = index ? index.getX(offset) : offset;
      const ib = index ? index.getX(offset + 1) : offset + 1;
      const ic = index ? index.getX(offset + 2) : offset + 2;
      const ax = position.getX(ia); const ay = position.getY(ia); const az = position.getZ(ia);
      const bx = position.getX(ib); const by = position.getY(ib); const bz = position.getZ(ib);
      const cx = position.getX(ic); const cy = position.getY(ic); const cz = position.getZ(ic);
      if (![ax, ay, az, bx, by, bz, cx, cy, cz].every(Number.isFinite)) continue;
      const dxB = bx - ax; const dyB = by - ay; const dzB = bz - az;
      const dxC = cx - ax; const dyC = cy - ay; const dzC = cz - az;
      const nx = dyB * dzC - dzB * dyC;
      const ny = dzB * dxC - dxB * dzC;
      const nz = dxB * dyC - dyB * dxC;
      // Downward snow lips and near-vertical edge skirts cannot support props.
      if (ny <= 1e-10 || ny / Math.hypot(nx, ny, nz) < MIN_UPWARD_NORMAL) continue;
      const triangle = { ax, ay, az, dxB, dyB, dzB, dxC, dyC, dzC, inverseDet: -1 / ny };
      const minX = Math.floor(Math.min(ax, bx, cx) / CELL_SIZE);
      const maxX = Math.floor(Math.max(ax, bx, cx) / CELL_SIZE);
      const minZ = Math.floor(Math.min(az, bz, cz) / CELL_SIZE);
      const maxZ = Math.floor(Math.max(az, bz, cz) / CELL_SIZE);
      for (let x = minX; x <= maxX; x += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          const key = `${x}:${z}`;
          let bucket = cells.get(key);
          if (!bucket) { bucket = []; cells.set(key, bucket); }
          bucket.push(triangle);
        }
      }
      added += 1;
    }
    return added;
  }

  function heightAt(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const bucket = cells.get(`${Math.floor(x / CELL_SIZE)}:${Math.floor(z / CELL_SIZE)}`);
    if (!bucket) return null;
    let highest = null;
    for (let i = 0; i < bucket.length; i += 1) {
      const triangle = bucket[i];
      const dx = x - triangle.ax; const dz = z - triangle.az;
      const weightB = (dx * triangle.dzC - dz * triangle.dxC) * triangle.inverseDet;
      const weightC = (triangle.dxB * dz - triangle.dzB * dx) * triangle.inverseDet;
      if (weightB < -EDGE_EPSILON || weightC < -EDGE_EPSILON || weightB + weightC > 1 + EDGE_EPSILON) continue;
      const height = triangle.ay + weightB * triangle.dyB + weightC * triangle.dyC;
      if (highest == null || height > highest) highest = height;
    }
    return highest;
  }

  return { add, heightAt };
}
