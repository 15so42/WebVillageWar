// Sparse, unequal snow shoulders. Their broad planes follow the canyon's snow
// caps; quiet gaps between them are intentional, rather than a full-field wave.
export function createSnowFieldRelief({ width, depth, spacing, density, amplitude }) {
  if (!(Number.isFinite(spacing) && spacing > 0)) throw new RangeError('Snow relief spacing must be positive');
  const minX = Math.floor(-width / 2 / spacing) - 2;
  const minZ = Math.floor(-depth / 2 / spacing) - 2;
  const columns = Math.ceil(width / 2 / spacing) + 3 - minX;
  const rows = Math.ceil(depth / 2 / spacing) + 3 - minZ;
  const buckets = Array.from({ length: columns * rows }, () => []);
  function random(x, z, salt) {
    const value = Math.sin(x * 127.1 + z * 311.7 + salt * 73.9) * 43758.5453;
    return value - Math.floor(value);
  }
  for (let x = Math.floor(-width / 2 / spacing) - 1; x <= Math.ceil(width / 2 / spacing) + 1; x += 1) {
    for (let z = Math.floor(-depth / 2 / spacing) - 1; z <= Math.ceil(depth / 2 / spacing) + 1; z += 1) {
      if (random(x, z, 1) > density) continue;
      const angle = random(x, z, 2) * Math.PI;
      const patch = {
        x: (x + 0.15 + random(x, z, 3) * 0.7) * spacing,
        z: (z + 0.15 + random(x, z, 4) * 0.7) * spacing,
        cos: Math.cos(angle), sin: Math.sin(angle),
        width: spacing * (0.42 + random(x, z, 5) * 0.46),
        depth: spacing * (0.24 + random(x, z, 6) * 0.28),
        skew: (random(x, z, 7) - 0.5) * 0.7,
        shoulder: 0.08 + random(x, z, 8) * 0.27,
        height: amplitude * (random(x, z, 9) < 0.2 ? -0.32 : 0.5 + random(x, z, 10) * 0.5)
      };
      // Index the full rotated support once; the height query allocates nothing.
      const extentV = patch.depth * (1.52 + Math.abs(patch.skew));
      const extentX = Math.abs(patch.cos) * patch.width + Math.abs(patch.sin) * extentV;
      const extentZ = Math.abs(patch.sin) * patch.width + Math.abs(patch.cos) * extentV;
      for (let bx = Math.floor((patch.x - extentX) / spacing); bx <= Math.floor((patch.x + extentX) / spacing); bx += 1) {
        for (let bz = Math.floor((patch.z - extentZ) / spacing); bz <= Math.floor((patch.z + extentZ) / spacing); bz += 1) {
          if (bx >= minX && bx < minX + columns && bz >= minZ && bz < minZ + rows) {
            buckets[(bz - minZ) * columns + bx - minX].push(patch);
          }
        }
      }
    }
  }
  return (x, z) => {
    const cellX = Math.floor(x / spacing) - minX; const cellZ = Math.floor(z / spacing) - minZ;
    if (cellX < 0 || cellX >= columns || cellZ < 0 || cellZ >= rows) return 0;
    let ridge = 0; let hollow = 0;
    for (const patch of buckets[cellZ * columns + cellX]) {
      const dx = x - patch.x; const dz = z - patch.z;
      const u = (dx * patch.cos + dz * patch.sin) / patch.width;
      const v = (-dx * patch.sin + dz * patch.cos) / patch.depth + u * patch.skew;
      // Unequal polygonal shoulders, not circular bumps or uniform ripples.
      const distance = Math.max(Math.abs(u), Math.abs(v) * 0.82 + u * 0.24,
        Math.abs(v + u * 0.17) * 0.73 - u * 0.31);
      if (distance >= 1) continue;
      const profile = Math.min(1, (1 - distance) / (1 - patch.shoulder));
      const height = patch.height * profile;
      ridge = Math.max(ridge, height);
      hollow = Math.min(hollow, height);
    }
    return ridge + hollow;
  };
}
