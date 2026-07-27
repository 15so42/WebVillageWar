import assert from 'node:assert/strict';
import { installHostEffectsRelay } from '../src/network/client/NetworkFxRelay.js';

const suppressedEvents = [];
const suppressedGame = {
  effects: {
    spawnRecoveryPulse: () => false
  }
};
const restoreSuppressed = installHostEffectsRelay(suppressedGame, (event) => suppressedEvents.push(event));
assert.equal(suppressedGame.effects.spawnRecoveryPulse({ x: 1, y: 0, z: 2 }, 5), false);
assert.deepEqual(suppressedEvents, []);
restoreSuppressed();

const emittedEvents = [];
const emittedGame = {
  effects: {
    spawnRecoveryPulse: () => true
  }
};
const restoreEmitted = installHostEffectsRelay(emittedGame, (event) => emittedEvents.push(event));
assert.equal(emittedGame.effects.spawnRecoveryPulse({ x: 1, y: 0, z: 2 }, 5), true);
assert.deepEqual(emittedEvents, [{ name: 'fx_recovery', x: 1, y: 0, z: 2, radius: 5 }]);
restoreEmitted();

const auraEvents = [];
const auraGame = {
  effects: {
    ensureRecoveryAura: () => true
  }
};
const restoreAura = installHostEffectsRelay(auraGame, (event) => auraEvents.push(event));
assert.equal(auraGame.effects.ensureRecoveryAura({ x: 3, y: 0, z: 4 }, 6), true);
assert.deepEqual(auraEvents, [{ name: 'fx_recovery_aura', x: 3, y: 0, z: 4, radius: 6 }]);
restoreAura();

console.log('Network FX relay rate-limit checks passed.');
