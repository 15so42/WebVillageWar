import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpellSystem } from '../src/systems/SpellSystem.js';

const hits = [];
let impact = null;
const insideAtCast = {
  alive: true,
  underConstruction: false,
  collisionRadius: 0.45,
  position: new THREE.Vector3(3.7, 0, 0),
  projectileHitHeight: 1.4
};
const outsideAtCast = {
  alive: true,
  underConstruction: false,
  collisionRadius: 0.2,
  position: new THREE.Vector3(4.1, 0, 0),
  projectileHitHeight: 1.4
};
const game = {
  runCardsPlayedCount: 3,
  enemyUnits: [insideAtCast, outsideAtCast],
  scaleSpellAreaRadius: (radius) => radius,
  groundHeightAt: () => 0,
  effects: {
    spawnLavaEruption(_position, _radius, onImpact) {
      impact = onImpact;
    },
    spawnCrater() {}
  },
  combat: {
    applyDamage(target, damage, _source, _knockback, context) {
      hits.push({ target, damage, context });
      return true;
    }
  }
};

const spells = new SpellSystem(game);
spells.castLavaEruption({
  point: new THREE.Vector3(0, 0, 0),
  card: { radius: 3.5, level: 1 }
});
assert.equal(typeof impact, 'function');
insideAtCast.position.set(8, 0, 0);
impact();

assert.equal(hits.length, 1);
assert.equal(hits[0].target, insideAtCast);
assert.equal(hits[0].damage, 4);
assert.equal(hits[0].context.isAttack, false);

console.log('spell system tests passed');
