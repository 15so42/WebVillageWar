import * as THREE from 'three';
import { createWorld } from '../src/world/createWorld.js';

const scene = new THREE.Scene();
const world = createWorld(scene, { sceneKey: 'snow-valley', sky: { bakedShadows: false } });
scene.updateMatrixWorld(true);
const list = [];
scene.traverse((o) => {
  if (!o.isMesh || !o.geometry) return;
  const g = o.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const s = o.getWorldScale(new THREE.Vector3());
  const size = new THREE.Vector3();
  g.boundingBox.getSize(size);
  const sx = size.x * s.x, sy = size.y * s.y, sz = size.z * s.z;
  const vol = sx * sy * sz;
  if (vol < 200) return;
  const pos = o.getWorldPosition(new THREE.Vector3());
  let col = '';
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  if (m && m.color && m.color.getHexString) col = '#' + m.color.getHexString();
  list.push({ vol, x: pos.x, y: pos.y, z: pos.z, sx, sy, sz, col });
});
list.sort((a, b) => b.vol - a.vol);
console.log('large meshes(vol>=200):', list.length);
console.log('--- near-field (|x|<55 && |z|<45, sy>4) mountains ---');
list
  .filter((m) => Math.abs(m.x) < 55 && Math.abs(m.z) < 45 && m.sy > 4)
  .sort((a, b) => b.sy - a.sy)
  .slice(0, 25)
  .forEach((m) => {
    console.log(` h=${m.sy.toFixed(1)} size=(${m.sx.toFixed(1)},${m.sy.toFixed(1)},${m.sz.toFixed(1)}) pos=(${m.x.toFixed(1)},${m.y.toFixed(1)},${m.z.toFixed(1)}) col=${m.col}`);
  });
