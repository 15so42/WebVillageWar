import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UNIT_GENERIC_UPGRADES, UNIT_SPECIAL_UPGRADES } from '../src/data/cardUpgrades.js';
import { EffectsSystem } from '../src/systems/EffectsSystem.js';

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  location: { href: 'http://localhost/', search: '' },
  matchMedia: () => ({ matches: false }),
  addEventListener() {},
  removeEventListener() {}
};
globalThis.document = {
  body: {
    classList: {
      add() {},
      remove() {},
      contains: () => false
    }
  }
};

const { Game } = await import('../src/systems/Game.js');

function unit(id, type, ownerPlayerId, options = {}) {
  return {
    id,
    type,
    ownerPlayerId,
    alive: options.alive ?? true,
    isWildlife: options.isWildlife ?? false,
    collisionRadius: 0.5,
    projectileHitHeight: 1.6,
    position: { x: id, y: 0, z: id + 1 }
  };
}

function feedbackHarness(units) {
  const effects = [];
  const texts = [];
  return {
    effects,
    texts,
    game: {
      activeEconomySlot: 'p1',
      localPlayerSlot: 'p1',
      friendlyUnits: units,
      teamGenericUpgradeCounts: new Map(),
      teamSpecialUpgrades: new Map(),
      teamSupportModifiersApplied: new Set(),
      unitBelongsToPlayer: (target, slot) => target.ownerPlayerId === slot,
      applyTeamGenericUpgradeLayerToUnit(target) {
        target.genericApplied = (target.genericApplied ?? 0) + 1;
        return true;
      },
      applyTeamSpecialUpgradeToUnit(target) {
        target.specialApplied = (target.specialApplied ?? 0) + 1;
        return true;
      },
      showUnitUpgradeFeedback: Game.prototype.showUnitUpgradeFeedback,
      consumeWaveRewardCard() {},
      abilitiesFor: () => ({ updateUi() {} }),
      effects: {
        spawnUnitUpgrade(position, options) {
          effects.push({ position, options });
        },
        spawnDamageNumber(position, amount, options) {
          texts.push({ position, amount, options });
        }
      }
    }
  };
}

const genericUnits = [
  unit(1, 'knight', 'p1'),
  unit(2, 'archer', 'p1'),
  unit(3, 'knight', 'p2'),
  unit(4, 'knight', 'p1', { isWildlife: true }),
  unit(5, 'knight', 'p1', { alive: false })
];
const generic = feedbackHarness(genericUnits);
assert.equal(
  Game.prototype.applyTeamGenericUpgrade.call(generic.game, UNIT_GENERIC_UPGRADES[0]),
  true
);
assert.equal(generic.effects.length, 2);
assert.equal(generic.texts.length, 2);
assert.ok(generic.effects.every((entry) => entry.options.color === '#7fd8a7'));
assert.ok(generic.texts.every((entry) => entry.options.text === '生命/耐久 +10%'));
assert.equal(genericUnits[0].genericApplied, 1);
assert.equal(genericUnits[1].genericApplied, 1);
assert.equal(genericUnits[2].genericApplied, undefined);

const specialUnits = [
  unit(6, 'knight', 'p1'),
  unit(7, 'archer', 'p1'),
  unit(8, 'knight', 'p2')
];
const special = feedbackHarness(specialUnits);
const holyShield = UNIT_SPECIAL_UPGRADES.knight[0];
assert.equal(
  Game.prototype.applyTeamSpecialUpgrade.call(special.game, 'knight', holyShield),
  true
);
assert.equal(special.effects.length, 1);
assert.equal(special.texts.length, 1);
assert.equal(special.texts[0].options.text, '圣盾');
assert.equal(specialUnits[0].specialApplied, 1);
assert.equal(specialUnits[1].specialApplied, undefined);
assert.equal(specialUnits[2].specialApplied, undefined);

const scene = new THREE.Scene();
const effectsSystem = new EffectsSystem(scene);
assert.equal(effectsSystem.spawnUnitUpgrade(
  new THREE.Vector3(1, 0, 2),
  { color: '#ffd166', radius: 0.9, height: 1.7, duration: 0.9 }
), true);
assert.equal(effectsSystem.effects.length, 1);
const upgradeVisual = effectsSystem.effects[0].object;
assert.equal(upgradeVisual.userData.unitUpgradeVisual.orbitBeamCount, 3);
assert.equal(upgradeVisual.userData.unitUpgradeVisual.sparkleCount, 8);
assert.equal(upgradeVisual.userData.unitUpgradeVisual.renderLayer, 0);
assert.equal(upgradeVisual.userData.preserveRenderLayers, true);
const orbitBeams = upgradeVisual.userData.parts.orbitBeams;
const sparkles = upgradeVisual.userData.parts.sparkles;
assert.equal(orbitBeams.every((beam) => (
  beam.userData.isUnitUpgradeOrbitBeam
  && beam.material.isShaderMaterial
  && beam.material.depthTest === true
  && beam.material.depthWrite === false
  && beam.material.blending === THREE.AdditiveBlending
)), true);
assert.equal(sparkles.every((sparkle) => (
  sparkle.userData.isUnitUpgradeSparkle
  && sparkle.material.isShaderMaterial
  && sparkle.material.depthTest === true
  && sparkle.material.depthWrite === false
)), true);
upgradeVisual.traverse((node) => {
  assert.equal(node.layers.mask, 1, 'unit upgrade effects must remain on ordinary layer 0');
  assert.equal(node.renderOrder, 0, 'unit upgrade effects must not force an overlay render order');
});
const initialPhase = orbitBeams[0].material.uniforms.uPhase.value;
effectsSystem.update(0.45);
assert.notEqual(orbitBeams[0].material.uniforms.uPhase.value, initialPhase);
assert(orbitBeams.some((beam) => beam.material.uniforms.uOpacity.value > 0.2));
assert(sparkles.some((sparkle) => sparkle.material.uniforms.uOpacity.value > 0.2));
effectsSystem.update(0.5);
assert.equal(effectsSystem.effects.length, 0);
effectsSystem.destroy();

console.log('Team upgrade feedback tests passed.');
