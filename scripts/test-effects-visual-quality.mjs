import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createAreaEffectVisual } from '../src/art/areaEffectVisual.js';
import {
  createBaseModel,
  createBerserkerModel,
  createDuskFrostOrbModel,
  createFrostTrollBossModel,
  createSnowDuskShamanModel,
  createWaterMageModel,
  createWaterOrbModel
} from '../src/art/lowpoly.js';
import {
  createUnitModel,
  resetProjectileVisual,
  setUnitRuntimeVisualScale,
  updateProjectileVisual,
  updateUnitAnimation
} from '../src/art/visualRegistry.js';
import { getSoftParticleTexture } from '../src/art/vfxMaterials.js';
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
let polygonDeathSmokeCount = 0;
const deathSmokeSizes = [];
deathEffect.traverse((node) => {
  if (node.userData?.isDeathSmoke) {
    deathSmokeCount += 1;
    if (
      node.isMesh
      && node.geometry?.type === 'DodecahedronGeometry'
      && node.material.isMeshStandardMaterial
      && node.material.transparent
      && node.material.map == null
      && node.material.depthTest === true
    ) polygonDeathSmokeCount += 1;
    deathSmokeSizes.push(node.userData.baseScale);
  }
});
assert.equal(deathSmokeCount, 18);
assert.equal(polygonDeathSmokeCount, 18, 'death smoke should use crisp translucent low-poly chunks');
assert(Math.max(...deathSmokeSizes) - Math.min(...deathSmokeSizes) > 0.35, 'death smoke chunks should have distinct small, medium, and large tiers');
assert.equal(deathEffect.userData.preserveRenderLayers, true);
deathEffect.traverse((node) => assert.equal(node.layers.mask, 1, 'death smoke must remain on layer 0'));
effects.update(0.08);
const visibleDeathPuffs = deathEffect.children.filter((node) => (
  node.userData?.isDeathSmoke
  && node.visible
  && node.material.opacity > 0.1
  && Math.max(node.scale.x, node.scale.y, node.scale.z) > 0.45
));
assert(visibleDeathPuffs.length >= 7, 'death should immediately produce a readable white-smoke burst');

const berserker = createBerserkerModel('player');
const berserkerParts = berserker.userData.parts;
const berserkerTorso = berserkerParts.body.geometry.parameters;
assert(berserkerTorso.radiusTop / berserkerTorso.radiusBottom < 1.1, 'berserker torso should not taper into a triangle');
assert.equal(Math.abs(berserkerParts.furShoulderLeft.position.x), 0.31);
assert.equal(Math.abs(berserkerParts.furShoulderRight.position.x), 0.31);

effects.spawnHit(new THREE.Vector3(0, 1, 0), '#bda6ff');
const hitEffect = effects.effects.at(-1).object;
assert.equal(hitEffect.children.length, 7);
assert.equal(
  hitEffect.children.every((particle) => (
    particle.isSprite
    && particle.userData.isSoftParticle
    && particle.material.blending === THREE.NormalBlending
    && particle.material.map?.userData?.particleFalloff === 'tight'
  )),
  true,
  'hit particles should use a tight radial FallOff without strong additive glow'
);
const tightTexture = getSoftParticleTexture('tight');
const softTextureReference = getSoftParticleTexture('soft');
const falloffSampleX = Math.floor(tightTexture.image.width * 0.75);
const falloffSampleY = Math.floor(tightTexture.image.height * 0.5);
const falloffSampleOffset = (falloffSampleY * tightTexture.image.width + falloffSampleX) * 4 + 3;
assert(
  tightTexture.image.data[falloffSampleOffset] < softTextureReference.image.data[falloffSampleOffset] * 0.2,
  'hit particle alpha should decay much faster by radius than the general soft-particle profile'
);
assert.equal(typeof effects.spawnAttackBurst, 'undefined', 'attack release should not create a hand burst');

effects.spawnExplosion(new THREE.Vector3(1, 0, 2), 2.4);
const explosionEffect = effects.effects.at(-1)?.object;
const explosionCore = explosionEffect.children.find((node) => node.userData?.isExplosionCore);
const explosionSmoke = explosionEffect.children.filter((node) => node.userData?.isExplosionSmoke);
assert(explosionCore?.geometry?.type === 'IcosahedronGeometry', 'explosion must flash a polygon core');
assert.equal(explosionCore.material.toneMapped, false, 'explosion core must preserve HDR color');
assert.equal(explosionCore.material.blending, THREE.AdditiveBlending);
assert(
  Math.max(explosionCore.material.color.r, explosionCore.material.color.g, explosionCore.material.color.b) > 1,
  'explosion core must use an HDR orange value'
);
assert.equal(explosionEffect.userData.explosionRadius, 2.4);
assert.equal(explosionSmoke.length, 20, 'explosion should burst into a readable white polygon smoke cluster');
assert.equal(explosionSmoke.every((puff) => (
  puff.geometry?.type === 'DodecahedronGeometry'
  && puff.material.isMeshStandardMaterial
  && puff.material.transparent
  && puff.material.flatShading
)), true);
assert(
  Math.max(...explosionSmoke.map((puff) => puff.userData.burstDistance)) >= 2.4,
  'explosion smoke must visibly establish the complete damage radius'
);
const explosionSmokeScaleBefore = explosionSmoke.map((puff) => Math.max(
  puff.scale.x,
  puff.scale.y,
  puff.scale.z
));
const primaryExplosionSmoke = explosionSmoke[0];
const primaryExplosionOrigin = primaryExplosionSmoke.userData.origin.clone();
effects.update(0.12);
const firstBurstDistance = Math.hypot(
  primaryExplosionSmoke.position.x - primaryExplosionOrigin.x,
  primaryExplosionSmoke.position.z - primaryExplosionOrigin.z
);
const firstBurstHeight = primaryExplosionSmoke.position.y;
effects.update(0.12);
const secondBurstTotalDistance = Math.hypot(
  primaryExplosionSmoke.position.x - primaryExplosionOrigin.x,
  primaryExplosionSmoke.position.z - primaryExplosionOrigin.z
);
assert(
  firstBurstDistance > secondBurstTotalDistance - firstBurstDistance,
  'explosion smoke must move outward fast first and decelerate afterward'
);
const explosionSmokeScaleAfter = explosionSmoke.map((puff) => Math.max(
  puff.scale.x,
  puff.scale.y,
  puff.scale.z
));
assert.equal(
  explosionSmokeScaleAfter.every((scale, index) => scale < explosionSmokeScaleBefore[index]),
  true,
  'every explosion smoke polygon should dynamically shrink throughout its life'
);
assert(explosionCore.material.opacity < 0.1, 'HDR core should only flash for an instant');
effects.update(0.55);
assert(
  primaryExplosionSmoke.position.y > firstBurstHeight,
  'explosion smoke should continue steaming slowly upward after the outward burst'
);
assert(
  explosionSmoke.some((puff) => puff.material.opacity > 0.2),
  'white smoke should remain visible during the slower upward phase'
);

effects.spawnMeteor(new THREE.Vector3(2, 0, 3), 4.2);
const meteorEffect = effects.effects.at(-1)?.object;
const meteorTarget = effects.effects.find(({ object }) => object.userData?.isMeteorTarget)?.object;
let meteorFlames = 0;
let meteorFlameMaterial = null;
let meteorBody = null;
meteorEffect.traverse((node) => {
  if (node.userData?.isMeteorFlame) {
    meteorFlames += 1;
    meteorFlameMaterial = node.material;
    assert.equal(node.parent, meteorEffect, 'meteor flame trails must not inherit the spinning rock rotation');
  }
  if (node.userData?.isMeteorBody) meteorBody = node;
});
assert.equal(meteorFlames, 10);
assert(meteorBody, 'meteor should expose its independently rotating rock body');
assert(meteorTarget, 'meteor should expose a full-radius target marker');
assert(meteorFlameMaterial?.isShaderMaterial, 'meteor flames should use an opacity-gradient shader');
assert.equal(meteorTarget.userData.preserveRenderLayers, true);
meteorTarget.traverse((node) => assert.equal(node.layers.mask, 1, 'meteor target marker must stay on layer 0'));

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
let meteorImpactCore = 0;
impactEffect?.traverse((node) => {
  if (node.userData?.isMeteorRock) meteorRocks += 1;
  if (node.userData?.isMeteorSoil) meteorSoil += 1;
  if (node.userData?.isMeteorImpactCore) meteorImpactCore += 1;
});
assert.equal(meteorRocks, 22);
assert.equal(meteorSoil, 14);
assert.equal(meteorImpactCore, 1, 'meteor landing must contain an immediate readable impact core');
assert(effects.effects.some(({ object }) => object === meteorTarget), 'target marker should remain after impact starts');
effects.update(0.15);
assert(effects.effects.some(({ object }) => object === meteorTarget), 'target marker should fade instead of disappearing at impact');
let targetOpacity = 1;
meteorTarget.traverse((node) => {
  if (node.material?.transparent) targetOpacity = Math.min(targetOpacity, node.material.opacity);
});
assert(targetOpacity < 0.7 && targetOpacity > 0, 'target marker should be visibly fading after impact');

effects.spawnEnemyCampBlast(
  new THREE.Vector3(0, 3, 0),
  new THREE.Vector3(4, 1, 2),
  { color: '#b7e8ff', hotColor: '#6adbb8' }
);
const laserEffect = effects.effects.at(-1)?.object;
let strongestEmission = 0;
let softBeamMaterial = null;
let softLaserParticles = 0;
laserEffect.traverse((node) => {
  strongestEmission = Math.max(strongestEmission, Number(node.material?.emissiveIntensity) || 0);
  if (node.material?.isShaderMaterial && node.material?.uniforms?.uOpacity) softBeamMaterial = node.material;
  if (node.userData?.isSoftParticle) softLaserParticles += 1;
});
assert(strongestEmission >= 2, 'base laser should contain a strong emissive core');
assert(softBeamMaterial, 'base laser should use a soft-edge opacity-gradient shader');
assert.equal(softBeamMaterial.fragmentShader.includes('headFade'), false);
assert.equal(softBeamMaterial.fragmentShader.includes('tailFade'), false);
assert.equal(softBeamMaterial.fragmentShader.includes('softEdge'), true);
assert.equal(softLaserParticles, 18, 'base laser dissipating particles should have soft alpha edges');

const softTexture = effects.effects.at(-1).object.children.at(-1).children[0].material.map;
assert(softTexture?.isDataTexture, 'soft particles should reuse a generated alpha-gradient texture');
const softTextureData = softTexture.image.data;
const softTextureSize = softTexture.image.width;
assert.equal(softTextureData[3], 0, 'soft particle corner should be transparent');
const centerOffset = ((Math.floor(softTextureSize / 2) * softTextureSize) + Math.floor(softTextureSize / 2)) * 4 + 3;
assert(softTextureData[centerOffset] > 220, 'soft particle center should remain visible');

const waterOrb = createWaterOrbModel();
assert.equal(waterOrb.userData.waterFlowRings.length, 3);
assert.equal(waterOrb.userData.waterOrbitDroplets.length, 7);
assert(waterOrb.userData.waterOrbitDroplets.every((droplet) => droplet.userData.isSoftParticle));
resetProjectileVisual(waterOrb, 'waterOrb');
const initialSpin = waterOrb.userData.waterSpinRoot.rotation.y;
const initialFlow = waterOrb.userData.waterFlowRoot.rotation.z;
const initialDropletPosition = waterOrb.userData.waterOrbitDroplets[0].position.clone();
updateProjectileVisual(waterOrb, 'waterOrb', 0.16, 0.16);
assert.notEqual(waterOrb.userData.waterSpinRoot.rotation.y, initialSpin, 'water orb core should rotate in flight');
assert.notEqual(waterOrb.userData.waterFlowRoot.rotation.z, initialFlow, 'water currents should counter-rotate');
assert.notDeepEqual(
  waterOrb.userData.waterOrbitDroplets[0].position.toArray(),
  initialDropletPosition.toArray(),
  'water droplets should orbit the projectile'
);

const waterMage = createWaterMageModel('player');
const waterMageRobe = waterMage.userData.parts?.robe;
assert.equal(waterMage.userData.bodyStyle, 'onePieceRobe');
assert.equal(waterMageRobe?.name, 'playerOnePieceRobe');
assert.equal(waterMageRobe?.isMesh, true, 'water mage robe should be one continuous mesh');
assert.equal(waterMageRobe?.children.length, 0, 'water mage robe should not contain a separate skirt section');
assert.equal(waterMage.userData.parts?.sash, null, 'one-piece robe should not create a cinched waist belt');
assert.equal(waterMage.getObjectByName('playerRobeStructure'), undefined);
assert.equal(waterMage.getObjectByName('playerShortTunicStructure'), undefined);
const waterMageRobeBounds = new THREE.Box3().setFromObject(waterMageRobe);
assert(waterMageRobeBounds.min.y < 0.25, 'water mage robe should extend close to the ground');

const duskOrb = createDuskFrostOrbModel();
assert.equal(duskOrb.userData.duskFlowRings.length, 2);
assert.equal(duskOrb.userData.duskFrostMotes.length, 6);
const duskMoteStart = duskOrb.userData.duskFrostMotes[0].position.clone();
resetProjectileVisual(duskOrb, 'duskFrostOrb');
updateProjectileVisual(duskOrb, 'duskFrostOrb', 0.16, 0.16);
assert.notDeepEqual(
  duskOrb.userData.duskFrostMotes[0].position.toArray(),
  duskMoteStart.toArray(),
  'snow dusk orb should have animated orbiting frost flow'
);

const shaman = createSnowDuskShamanModel();
const shamanParts = shaman.userData.parts;
assert.equal(
  shamanParts.shardRing.parent,
  shamanParts.weaponSwingPivot,
  'staff fragments must follow the staff swing pivot instead of the unit root'
);
shaman.updateMatrixWorld(true);
const shardCenter = shamanParts.shardRing.getWorldPosition(new THREE.Vector3());
const focusCenter = shamanParts.focus.getWorldPosition(new THREE.Vector3());
assert(shardCenter.distanceTo(focusCenter) < 0.001, 'staff fragments should orbit the actual focus crystal');

const frostBoss = createFrostTrollBossModel();
assert.equal(frostBoss.userData.parts.hammerHead.geometry.type, 'SphereGeometry');
const animatedBoss = {
  id: 999,
  type: 'frostTrollBoss',
  isBuilding: false,
  visualState: 'idle',
  hitFlashTimer: 0,
  visualRoot: createUnitModel('frostTrollBoss', 'enemy')
};
setUnitRuntimeVisualScale(animatedBoss, 2.5);
updateUnitAnimation(animatedBoss, 0.016);
assert.equal(
  animatedBoss.visualRoot.userData.runtimeVisualScaleRoot.scale.x,
  2.5,
  'boss 2.5x size must survive animation root scale resets'
);
const gameSource = readFileSync(new URL('../src/systems/Game.js', import.meta.url), 'utf8');
assert.match(gameSource, /unit\.type === 'frostTrollBoss' \? 2\.5 : 1\.32/);

assert(deathBurstRadius({ projectileHitHeight: 1.4 }, 0.45) < 0.7);
assert(deathBurstRadius({ isElite: true, projectileHitHeight: 1.8 }, 0.55) >= 0.86);
assert(deathBurstRadius({ isBoss: true, projectileHitHeight: 3.2 }, 0.9) >= 1.55);

effects.destroy();
console.log('Effects visual quality checks passed.');
