import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EffectsSystem } from '../src/systems/EffectsSystem.js';

const scene = new THREE.Scene();
const effects = new EffectsSystem(scene);
assert.equal(effects.ensureRecoveryAura({ x: 2, y: 0, z: 3 }, 5), true);
assert.equal(effects.ensureRecoveryAura({ x: 2, y: 0, z: 3 }, 5), false);
assert.deepEqual(effects.getRecoveryAuraState(), { x: 2, y: 0, z: 3, radius: 5 });
effects.update(0.2);
assert.equal(scene.children.length, 1);
effects.destroy();
assert.equal(scene.children.length, 0);

console.log('Recovery aura checks passed.');
