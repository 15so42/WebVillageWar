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
  lobeCount: 9,
  boltCount: 3
});
assert.equal(cloudVisual.children.filter((child) => child.isLine).length, 3);
assert.equal(cloudVisual.children.filter((child) => child.userData.stormFlashCore).length, 1);
cloudEffects.update(0.25);
assert.deepEqual(cloudVisual.position.toArray(), [2, 0, -3]);
assert.ok(cloudVisual.children.some((child) => child.isLine && child.material.opacity > 0.08));
cloudEffects.destroy();

console.log('electric mage checks passed');
