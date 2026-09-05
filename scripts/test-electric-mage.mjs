import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CARD_DEFINITIONS, UNIT_DEFINITIONS } from '../src/data/gameData.js';
import { UNIT_SPECIAL_UPGRADES } from '../src/data/cardUpgrades.js';
import { findNextChainLightningTarget } from '../src/systems/AttackSystem.js';
import { EffectsSystem } from '../src/systems/EffectsSystem.js';

const mage = UNIT_DEFINITIONS.lightningMage;
assert.equal(mage.attackDamageType, 'magic');
assert.equal(mage.attackBehavior?.type, 'chainLightning');
assert.equal(mage.attackBehavior?.jumpRange, 4.4);
assert.equal(mage.specialAbilities?.thunderCloud?.duration, 10);
assert.equal(mage.specialAbilities?.thunderCloud?.cooldown, 15);
assert.equal(mage.specialAbilities?.thunderCloud?.strikeRadius, 4.4);
assert.equal(mage.specialAbilities?.thunderCloud?.visualScale, 2);
assert.equal(mage.specialAbilities?.lightningSiphon?.cooldown, 30);
assert.equal(mage.specialAbilities?.lightningSiphon?.triggerDurability, 10);
assert.equal(mage.specialAbilities?.lightningSiphon?.range, 9);
assert.equal(mage.weapon.maxDurability, 18);
assert.equal(CARD_DEFINITIONS.find((card) => card.id === 'lightning-mages')?.unitType, 'lightningMage');
assert.deepEqual(
  UNIT_SPECIAL_UPGRADES.lightningMage.map((upgrade) => upgrade.trait),
  ['thunderCloud', 'lightningSiphon']
);

const origin = { x: 0, z: 0 };
const near = { id: 1, alive: true, position: { x: 2, z: 0 } };
const closer = { id: 2, alive: true, position: { x: 1, z: 0 } };
const distant = { id: 3, alive: true, position: { x: 5, z: 0 } };
const alreadyHit = new Set([2]);
assert.equal(
  findNextChainLightningTarget([near, closer, distant], origin, alreadyHit, 4),
  near
);
alreadyHit.add(1);
assert.equal(
  findNextChainLightningTarget([near, closer, distant], origin, alreadyHit, 4),
  null
);

const effectScene = new THREE.Scene();
const cloudEffects = new EffectsSystem(effectScene);
cloudEffects.spawnThunderCloud({
  position: new THREE.Vector3(2, 0, -3),
  age: 0,
  ability: mage.specialAbilities.thunderCloud
});
assert.equal(cloudEffects.effects.length, 1);
const cloudVisual = cloudEffects.effects[0].object;
assert.deepEqual(cloudVisual.userData.thunderCloudVisual, {
  lobeCount: 32,
  boltCount: 4,
  shadowCount: 1,
  polygonal: true,
  shadowShape: 'circle'
});
const cloudLobes = cloudVisual.children.filter((child) => child.userData.isThunderCloudLobe);
const cloudBolts = cloudVisual.children.filter((child) => child.userData.isThunderCloudBolt);
const cloudShadows = cloudVisual.children.filter((child) => child.userData.isThunderCloudShadow);
assert.equal(cloudVisual.children.filter((child) => child.isLine).length, 0);
assert.equal(cloudLobes.length, 32);
assert.equal(cloudLobes.every((lobe) => lobe.geometry?.type === 'DodecahedronGeometry'), true);
assert.equal(cloudBolts.length, 4);
assert.equal(cloudBolts.every((bolt) => (
  bolt.children.length === 5
  && bolt.children.every((segment) => segment.userData?.core?.geometry?.type === 'CylinderGeometry')
  && bolt.userData.coreMaterial?.toneMapped === false
  && Math.max(
    bolt.userData.coreMaterial.color.r,
    bolt.userData.coreMaterial.color.g,
    bolt.userData.coreMaterial.color.b
  ) > 1
)), true);
assert.equal(cloudShadows.length, 1);
assert.equal(cloudShadows.every((shadow) => (
  shadow.geometry?.type === 'CircleGeometry'
  && shadow.material.depthTest === true
)), true);
const cloudShadowAspect = cloudShadows[0].scale.x / cloudShadows[0].scale.y;
assert(
  Math.abs(cloudShadowAspect - 1) < 0.001,
  'thunder-cloud fake shadow should be a perfect circle'
);
assert.equal(cloudVisual.children.filter((child) => child.userData.stormFlashCore).length, 0);
cloudEffects.update(0.25);
assert.deepEqual(cloudVisual.position.toArray(), [2, 5.1, -3], 'cloud floats at its ability height');
// 雷云整体未在闪光时各云块保持半透明黑色材质
assert.ok(cloudLobes.every((lobe) => (
  lobe.material.transparent === true
  && lobe.material.opacity > 0 && lobe.material.opacity < 1
  && Math.max(
    lobe.material.color.r,
    lobe.material.color.g,
    lobe.material.color.b
  ) < 0.2
)), 'cloud lobes must be semi-transparent dark blocks');
// 闪电随机出现：强制点着第一条，确认闪亮期间实体分段可见且 HDR 材质发光
const firstBolt = cloudBolts[0];
firstBolt.userData.flashTimer = 0.001;
cloudEffects.update(0.002);
assert.equal(firstBolt.visible, true);
assert.ok(
  firstBolt.userData.coreMaterial.opacity > 0.03
  && Math.max(
    firstBolt.userData.coreMaterial.color.r,
    firstBolt.userData.coreMaterial.color.g,
    firstBolt.userData.coreMaterial.color.b
  ) > 1,
  'flashing bolt must be visible with an HDR core'
);

cloudEffects.spawnLightningChain(
  new THREE.Vector3(-1, 1.5, 0),
  new THREE.Vector3(4, 1.1, 0.5),
  { color: mage.attackBehavior.color }
);
const chainVisual = cloudEffects.effects.at(-1).object;
const chainStyle = chainVisual.userData.lightningChainVisual;
assert(chainStyle.segmentCount >= 3 && chainStyle.segmentCount <= 9);
assert(chainStyle.haloRadius >= 0.075, 'basic lightning must use a readable world-space width');
assert(chainStyle.coreRadius >= 0.028);
assert(chainStyle.hdrIntensity > 1);
const visibleChainSegments = chainVisual.userData.lightningSegments.filter((segment) => segment.visible);
assert.equal(visibleChainSegments.length, chainStyle.segmentCount);
assert.equal(visibleChainSegments.every((segment) => (
  segment.userData.halo.geometry?.type === 'CylinderGeometry'
  && segment.userData.core.geometry?.type === 'CylinderGeometry'
)), true, 'basic lightning must use thick segmented meshes instead of one-pixel WebGL lines');
assert.equal(chainVisual.userData.lightningCoreMaterial.toneMapped, false);
assert(
  Math.max(
    chainVisual.userData.lightningCoreMaterial.color.r,
    chainVisual.userData.lightningCoreMaterial.color.g,
    chainVisual.userData.lightningCoreMaterial.color.b
  ) > 1,
  'basic lightning core must retain HDR color values'
);
cloudEffects.destroy();

console.log('electric mage checks passed');
