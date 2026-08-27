import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAreaEffectVisual } from '../src/art/areaEffectVisual.js';
import { createBaseModel } from '../src/art/lowpoly.js';
import { EffectsSystem } from '../src/systems/EffectsSystem.js';
import { deathBurstRadius } from '../src/systems/UnitRegistry.js';

for (const theme of ['snow', 'dungeon', 'red-desert', 'emerald-marsh']) {
  const base = createBaseModel({ theme });
  let meshCount = 0;
  base.traverse((node) => {
    if (node.isMesh) meshCount += 1;
  });
  assert.equal(base.userData.baseTheme, theme);
  assert(meshCount >= 32, `${theme} base should have a complete fortress silhouette`);
  assert(base.userData.attackEmitter?.isObject3D, `${theme} base should expose its attack emitter`);
  assert(
    base.userData.energyMeshes.some((mesh) => Number(mesh.material?.emissiveIntensity) >= 1.5),
    `${theme} base should contain a strong emissive energy core`
  );
  if (theme === 'snow') {
    assert.equal(base.userData.baseStyle, 'friendly-command-camp');
  }
}

const wildfire = createAreaEffectVisual({
  radius: 3.45,
  color: '#c84622',
  accent: '#ffc75a',
  kind: 'wildfire'
});
assert.equal(wildfire.userData.groundTraces.length, 14);
assert.equal(wildfire.userData.groundTraces.every(({ patch, emberTrace }) => (
  patch.layers.isEnabled(1) && emberTrace.layers.isEnabled(1)
)), true);

for (const kind of ['poisonFog', 'plagueFog']) {
  const toxic = createAreaEffectVisual({
    radius: 3.8,
    color: '#6a8a48',
    accent: '#b8d88a',
    kind
  });
  assert.equal(toxic.userData.atmospherePuffs.length, 10);
  assert.equal(toxic.userData.toxicMotes.length, 16);
  assert.equal(toxic.userData.stains.length, 8);
  assert.equal(toxic.userData.atmosphereMaterial.transparent, true);
}

const scene = new THREE.Scene();
const effects = new EffectsSystem(scene);
effects.spawnDeathBurst(new THREE.Vector3(0, 0, 0), 0.8);
const deathEffect = effects.effects.at(-1)?.object;
let deathSmokeCount = 0;
deathEffect.traverse((node) => {
  if (node.userData?.isDeathSmoke) deathSmokeCount += 1;
});
assert.equal(deathSmokeCount, 16);

effects.spawnAttackBurst(
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(1, 0.2, 0),
  { color: '#bda6ff' }
);
assert.equal(effects.effects.at(-1).object.children.length, 8);

effects.spawnMeteor(new THREE.Vector3(2, 0, 3), 4.2);
const meteorEffect = effects.effects.at(-1)?.object;
let meteorFlames = 0;
let meteorTarget = null;
let meteorFlameMaterial = null;
meteorEffect.traverse((node) => {
  if (node.userData?.isMeteorFlame) {
    meteorFlames += 1;
    meteorFlameMaterial = node.material;
  }
  if (node.userData?.isMeteorTarget) meteorTarget = node;
});
assert.equal(meteorFlames, 10);
assert(meteorTarget, 'meteor should expose a full-radius target marker');
assert(meteorFlameMaterial?.isShaderMaterial, 'meteor flames should use an opacity-gradient shader');

effects.update(1.1);
const impactEffect = effects.effects.find(({ object }) => {
  let found = false;
  object.traverse((node) => {
    if (node.userData?.isMeteorRock) found = true;
  });
  return found;
})?.object;
let meteorRocks = 0;
let meteorSoil = 0;
impactEffect?.traverse((node) => {
  if (node.userData?.isMeteorRock) meteorRocks += 1;
  if (node.userData?.isMeteorSoil) meteorSoil += 1;
});
assert.equal(meteorRocks, 22);
assert.equal(meteorSoil, 14);

effects.spawnEnemyCampBlast(
  new THREE.Vector3(0, 3, 0),
  new THREE.Vector3(4, 1, 2),
  { color: '#b7e8ff', hotColor: '#6adbb8' }
);
const laserEffect = effects.effects.at(-1)?.object;
let strongestEmission = 0;
let softBeamMaterial = null;
laserEffect.traverse((node) => {
  strongestEmission = Math.max(strongestEmission, Number(node.material?.emissiveIntensity) || 0);
  if (node.material?.isShaderMaterial && node.material?.uniforms?.uOpacity) softBeamMaterial = node.material;
});
assert(strongestEmission >= 2, 'base laser should contain a strong emissive core');
assert(softBeamMaterial, 'base laser should use a soft-edge opacity-gradient shader');

assert(deathBurstRadius({ projectileHitHeight: 1.4 }, 0.45) < 0.7);
assert(deathBurstRadius({ isElite: true, projectileHitHeight: 1.8 }, 0.55) >= 0.86);
assert(deathBurstRadius({ isBoss: true, projectileHitHeight: 3.2 }, 0.9) >= 1.55);

effects.destroy();
console.log('Effects visual quality checks passed.');
