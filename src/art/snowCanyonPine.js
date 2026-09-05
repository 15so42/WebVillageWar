import * as THREE from 'three';

const GEOMETRIES = new Map();
const MATERIALS = new Map();
const BRANCHES = 6;
const SIDES = BRANCHES * 2;
const TIERS = [
  { bottom: 0.37, top: 1.34, radius: 0.94 },
  { bottom: 0.91, top: 1.88, radius: 0.755 },
  { bottom: 1.46, top: 2.35, radius: 0.545 },
  { bottom: 2.0, top: 2.6, radius: 0.315 }
];

function buffer() {
  return { positions: [], colors: [] };
}

function triangle(target, a, b, c, shade = 1) {
  target.positions.push(...a, ...b, ...c);
  for (let vertex = 0; vertex < 3; vertex += 1) target.colors.push(shade, shade, shade);
}

function geometryFrom(target) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(target.positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(target.colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function interpolate(a, b, weight) {
  return a.map((value, index) => THREE.MathUtils.lerp(value, b[index], weight));
}

function shoulderPoint(apex, rim, distance) {
  const point = interpolate(apex, rim, distance);
  const height = apex[1] - rim[1];
  // A steep inner crown opens onto a broad upward shoulder, then turns down
  // into the green skirt. Snow rests on that shoulder instead of a cone wall.
  if (distance <= 0.3) {
    point[1] = apex[1] - height * 0.55 * distance / 0.3;
  } else if (distance <= 0.83) {
    point[1] = apex[1] - height * (0.55 + 0.15 * (distance - 0.3) / 0.53);
  } else {
    point[1] = apex[1] - height * (0.7 + 0.3 * (distance - 0.83) / 0.17);
  }
  return point;
}

function appendSnowBranch(target, apex, left, tip, right, level, variant) {
  // Wide, short snow pillows sit on the upward shoulder, leaving a deep green
  // skirt visible below them. The complete underside gives every patch volume.
  const pattern = [
    [0.42, 0], [0.53, -0.96], [0.78, -0.98],
    [0.87, 0.035], [0.8, 0.94], [0.5, 0.98]
  ];
  const thickness = 0.068 - level * 0.008;
  const top = [];
  const bottom = [];
  pattern.forEach(([distance, lateral], index) => {
    const edge = interpolate(tip, lateral < 0 ? left : right, Math.abs(lateral));
    const point = shoulderPoint(apex, edge, distance);
    const sag = index === 3 ? 0.011 : 0;
    top.push([point[0], point[1] + thickness - sag, point[2]]);
    bottom.push([point[0], point[1] + 0.003 - sag, point[2]]);
  });
  const ridge = shoulderPoint(apex, tip, 0.65 + (variant % 2) * 0.015);
  ridge[1] += thickness + 0.034;
  const underside = shoulderPoint(apex, tip, 0.65);
  for (let side = 0; side < top.length; side += 1) {
    const next = (side + 1) % top.length;
    triangle(target, ridge, top[next], top[side], 0.95 + (side % 3) * 0.025);
    triangle(target, top[side], top[next], bottom[side], 0.86);
    triangle(target, top[next], bottom[next], bottom[side], 0.86);
    triangle(target, underside, bottom[side], bottom[next], 0.84);
  }
}

function appendWood(target, start, end, radius) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from).normalize();
  const tangent = new THREE.Vector3(0, 0, 1).cross(direction).normalize();
  const bitangent = direction.clone().cross(tangent).normalize();
  const rings = [from, to].map((center, ring) => Array.from({ length: 5 }, (_, side) => {
    const angle = side / 5 * Math.PI * 2;
    return center.clone()
      .addScaledVector(tangent, Math.cos(angle) * radius * (ring ? 0.48 : 1))
      .addScaledVector(bitangent, Math.sin(angle) * radius * (ring ? 0.48 : 1))
      .toArray();
  }));
  for (let side = 0; side < 5; side += 1) {
    const next = (side + 1) % 5;
    triangle(target, rings[0][side], rings[0][next], rings[1][side], 0.9 + side * 0.025);
    triangle(target, rings[1][side], rings[0][next], rings[1][next], 0.9 + side * 0.025);
    triangle(target, start, rings[0][next], rings[0][side], 0.88);
    triangle(target, end, rings[1][side], rings[1][next], 1);
  }
}

function sharedGeometries(variant) {
  if (GEOMETRIES.has(variant)) return GEOMETRIES.get(variant);
  const foliage = buffer();
  const snow = buffer();
  const wood = buffer();
  const snowTip = buffer();

  TIERS.forEach((tier, level) => {
    const rotation = level * 0.37 + variant * 0.23;
    const apex = [0, tier.top, 0];
    const base = [0, tier.bottom + 0.1, 0];
    const rim = Array.from({ length: SIDES }, (_, side) => {
      const isTip = side % 2 === 0;
      const rhythm = Math.sin(side * 1.73 + level * 1.19 + variant * 2.31);
      const angle = rotation + side / SIDES * Math.PI * 2;
      const radius = tier.radius * (isTip ? 0.976 + rhythm * 0.024 : 0.865 + rhythm * 0.025);
      return [
        Math.cos(angle) * radius,
        tier.bottom + (isTip ? 0 : 0.065) + (rhythm + 1) * 0.018,
        Math.sin(angle) * radius
      ];
    });
    const collars = rim.map((point) => shoulderPoint(apex, point, 0.3));
    const shoulders = rim.map((point) => shoulderPoint(apex, point, 0.83));
    for (let side = 0; side < SIDES; side += 1) {
      const next = (side + 1) % SIDES;
      const shade = 0.9 + level * 0.03 + ((side + variant) % 3) * 0.026;
      triangle(foliage, apex, collars[next], collars[side], shade + 0.035);
      triangle(foliage, collars[side], collars[next], shoulders[side], shade + 0.025);
      triangle(foliage, collars[next], shoulders[next], shoulders[side], shade + 0.025);
      triangle(foliage, shoulders[side], shoulders[next], rim[side], shade);
      triangle(foliage, shoulders[next], rim[next], rim[side], shade);
      triangle(foliage, base, rim[side], rim[next], shade * 0.79);
    }

    // Nonadjacent branches retain dark green gaps between the snow lobes.
    const firstSnowBranch = (level * 2 + variant) % BRANCHES;
    const snowBranches = level < 2
      ? [firstSnowBranch, (firstSnowBranch + 2) % BRANCHES, (firstSnowBranch + 4) % BRANCHES]
      : [firstSnowBranch, (firstSnowBranch + 3) % BRANCHES];
    snowBranches.forEach((branch) => {
      const side = branch * 2;
      appendSnowBranch(snow, apex, rim[(side + SIDES - 1) % SIDES], rim[side], rim[(side + 1) % SIDES], level, variant);
    });

    if (level === TIERS.length - 1) {
      const tip = [0, tier.top + 0.008, 0];
      const tipRim = rim.map((point, index) => {
        const cap = shoulderPoint(apex, point, 0.32 + (index % 3) * 0.025);
        cap[1] += 0.019;
        return cap;
      });
      const tipBase = [0, tier.top - 0.22, 0];
      for (let side = 0; side < SIDES; side += 1) {
        const next = (side + 1) % SIDES;
        triangle(snowTip, tip, tipRim[next], tipRim[side], 0.97 + side % 2 * 0.025);
        triangle(snowTip, tipBase, tipRim[side], tipRim[next], 0.9);
      }
    }
  });

  appendWood(wood, [0, 0, 0], [0, 1.66, 0], 0.083);
  appendWood(wood, [0, 0.3, 0], [0.29, 0.54, 0.08], 0.033);
  appendWood(wood, [0, 0.32, 0], [-0.19, 0.58, -0.15], 0.028);
  const result = {
    foliage: geometryFrom(foliage),
    wood: geometryFrom(wood),
    snow: geometryFrom(snow),
    snowTip: geometryFrom(snowTip)
  };
  let footprintRadius = 0;
  Object.values(result).forEach((geometry) => {
    const position = geometry.getAttribute('position');
    for (let index = 0; index < position.count; index += 1) {
      footprintRadius = Math.max(footprintRadius, Math.hypot(position.getX(index), position.getZ(index)));
    }
  });
  result.footprintRadius = footprintRadius;
  GEOMETRIES.set(variant, result);
  return result;
}

function sharedMaterial(color, kind, roughness) {
  const resolved = new THREE.Color(color);
  const key = `${resolved.getHexString()}:${kind}:${roughness}`;
  let material = MATERIALS.get(key);
  if (material) {
    // Palette edits are scene state; a new world starts from this key's base color.
    material.color.copy(resolved);
    return material;
  }
  material = new THREE.MeshStandardMaterial({
    color: resolved, roughness, metalness: 0, flatShading: true, vertexColors: true
  });
  if (kind) material.userData.worldMaterialKind = kind;
  MATERIALS.set(key, material);
  return material;
}

/**
 * Four broad branch tiers: 2.6 * height tall, at most 0.94 * height radius.
 * All instances share geometry and materials and support world static batching.
 * Options: leafColor, trunkColor, snowColor, leafRoughness, snowRoughness,
 * variant (three stable silhouettes), snowCap (all snow), pureSnowCap (white tip).
 */
export function createSnowCanyonPine(height = 1, options = {}) {
  const scale = Number.isFinite(height) ? Math.max(0.01, height) : 1;
  const seed = Number.isFinite(options.variant) ? options.variant : Math.round(scale * 137);
  const variant = ((Math.trunc(seed) % 3) + 3) % 3;
  const geometry = sharedGeometries(variant);
  const tree = new THREE.Group();
  tree.name = 'SnowCanyonPine';
  tree.scale.setScalar(scale);
  tree.userData.visualFootprintRadius = geometry.footprintRadius * scale;
  tree.userData.visualHeight = (options.snowCap !== false && options.pureSnowCap === true ? 2.608 : 2.6) * scale;
  tree.userData.silhouetteVariant = variant;
  tree.add(
    new THREE.Mesh(geometry.wood, sharedMaterial(options.trunkColor ?? '#63523c', '', 0.97)),
    new THREE.Mesh(geometry.foliage, sharedMaterial(options.leafColor ?? '#61745b', 'tree', options.leafRoughness ?? 0.94))
  );
  if (options.snowCap !== false) {
    const snowMaterial = sharedMaterial(options.snowColor ?? '#e7edf1', 'snow', options.snowRoughness ?? 0.96);
    tree.add(new THREE.Mesh(geometry.snow, snowMaterial));
    if (options.pureSnowCap === true) tree.add(new THREE.Mesh(geometry.snowTip, snowMaterial));
  }
  tree.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return tree;
}
