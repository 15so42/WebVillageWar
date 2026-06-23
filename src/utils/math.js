import * as THREE from 'three';

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function distance2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

export function direction2D(from, to) {
  const vector = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
  const length = vector.length();
  if (length < 0.0001) {
    return new THREE.Vector3(0, 0, 1);
  }
  return vector.divideScalar(length);
}

export function polarOffset(index, total, radius) {
  const angle = (index / Math.max(1, total)) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
}

export function insideBattlefield(point, bounds) {
  return (
    Math.abs(point.x) <= bounds.halfWidth &&
    point.z >= bounds.minZ &&
    point.z <= bounds.maxZ
  );
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}
