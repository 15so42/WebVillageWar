import assert from 'node:assert/strict';
import {
  applyNetworkFx,
  installHostEffectsRelay
} from '../src/network/client/NetworkFxRelay.js';

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

const judgmentEvents = [];
const judgmentGame = {
  effects: {
    spawnJudgmentSword: () => true
  }
};
const restoreJudgment = installHostEffectsRelay(judgmentGame, (event) => judgmentEvents.push(event));
assert.equal(judgmentGame.effects.spawnJudgmentSword({ x: 5, y: 1, z: 7 }, 0.9), true);
assert.deepEqual(judgmentEvents, [{
  name: 'fx_judgment_sword',
  x: 5,
  y: 1,
  z: 7,
  radius: 0.9
}]);
restoreJudgment();

const selfDestructEvents = [];
const selfDestructGame = {
  effects: {
    spawnSelfDestructExplosion: () => true
  }
};
const restoreSelfDestruct = installHostEffectsRelay(
  selfDestructGame,
  (event) => selfDestructEvents.push(event)
);
assert.equal(selfDestructGame.effects.spawnSelfDestructExplosion({ x: 6, y: 0, z: 8 }, 6), true);
assert.deepEqual(selfDestructEvents, [{
  name: 'fx_self_destruct_explosion',
  x: 6,
  y: 0,
  z: 8,
  radius: 6
}]);
restoreSelfDestruct();

const rootWarningEvents = [];
const rootWarningGame = {
  effects: {
    spawnRootWarning: () => true
  }
};
const restoreRootWarning = installHostEffectsRelay(
  rootWarningGame,
  (event) => rootWarningEvents.push(event)
);
assert.equal(rootWarningGame.effects.spawnRootWarning({ x: 2, y: 0, z: 6 }, 3.2, 0.62), true);
assert.deepEqual(rootWarningEvents, [{
  name: 'fx_root_warning',
  x: 2,
  y: 0,
  z: 6,
  radius: 3.2,
  duration: 0.62
}]);
restoreRootWarning();

const unitUpgradeEvents = [];
const unitUpgradeGame = {
  effects: {
    spawnUnitUpgrade: () => true
  }
};
const restoreUnitUpgrade = installHostEffectsRelay(
  unitUpgradeGame,
  (event) => unitUpgradeEvents.push(event)
);
unitUpgradeGame.effects.spawnUnitUpgrade(
  { x: 4, y: 0.2, z: 9 },
  { color: '#ffd166', radius: 0.9, height: 1.7, duration: 0.9 }
);
assert.deepEqual(unitUpgradeEvents, [{
  name: 'fx_unit_upgrade',
  x: 4,
  y: 0.2,
  z: 9,
  options: { color: '#ffd166', radius: 0.9, height: 1.7, duration: 0.9 }
}]);
restoreUnitUpgrade();

const lightningEvents = [];
const lightningGame = {
  effects: {
    spawnLightningChain: () => true,
    spawnThunderCloud: () => true
  }
};
const restoreLightning = installHostEffectsRelay(
  lightningGame,
  (event) => lightningEvents.push(event)
);
lightningGame.effects.spawnLightningChain(
  { x: 1, y: 2, z: 3 },
  { x: 4, y: 5, z: 6 },
  { color: '#bba8ff', duration: 0.28, impactRadius: 0.4 }
);
lightningGame.effects.spawnThunderCloud({
  position: { x: 7, y: 0, z: 8 },
  age: 0,
  ability: { duration: 10, height: 5.1, visualScale: 2, cooldown: 15 }
});
assert.deepEqual(lightningEvents, [
  {
    name: 'fx_lightning_chain',
    start: { x: 1, y: 2, z: 3 },
    end: { x: 4, y: 5, z: 6 },
    options: { color: '#bba8ff', duration: 0.28, impactRadius: 0.4 }
  },
  {
    name: 'fx_thunder_cloud',
    x: 7,
    y: 0,
    z: 8,
    age: 0,
    ability: { duration: 10, height: 5.1, visualScale: 2 }
  }
]);
restoreLightning();

const replayedFx = [];
applyNetworkFx({
  effects: {
    spawnLightningChain(start, end, options) {
      replayedFx.push({ kind: 'chain', start, end, options });
    },
    spawnThunderCloud(state) {
      replayedFx.push({ kind: 'cloud', state });
    }
  }
}, lightningEvents[0]);
applyNetworkFx({
  effects: {
    spawnLightningChain() {},
    spawnThunderCloud(state) {
      replayedFx.push({ kind: 'cloud', state });
    }
  }
}, lightningEvents[1]);
assert.deepEqual(
  {
    kind: replayedFx[0].kind,
    start: replayedFx[0].start.toArray(),
    end: replayedFx[0].end.toArray(),
    options: replayedFx[0].options
  },
  {
    kind: 'chain',
    start: [1, 2, 3],
    end: [4, 5, 6],
    options: { color: '#bba8ff', duration: 0.28, impactRadius: 0.4 }
  }
);
assert.equal(replayedFx[1].kind, 'cloud');
assert.deepEqual(replayedFx[1].state.position.toArray(), [7, 0, 8]);
assert.deepEqual(replayedFx[1].state.ability, { duration: 10, height: 5.1, visualScale: 2 });

const replayedSelfDestruct = [];
applyNetworkFx({
  effects: {
    spawnSelfDestructExplosion(position, radius) {
      replayedSelfDestruct.push({ position, radius });
    }
  }
}, selfDestructEvents[0]);
assert.deepEqual(replayedSelfDestruct[0].position.toArray(), [6, 0, 8]);
assert.equal(replayedSelfDestruct[0].radius, 6);

const replayedUnitUpgrade = [];
applyNetworkFx({
  effects: {
    spawnUnitUpgrade(position, options) {
      replayedUnitUpgrade.push({ position, options });
    }
  }
}, unitUpgradeEvents[0]);
assert.deepEqual(replayedUnitUpgrade[0].position.toArray(), [4, 0.2, 9]);
assert.deepEqual(replayedUnitUpgrade[0].options, {
  color: '#ffd166',
  radius: 0.9,
  height: 1.7,
  duration: 0.9
});

console.log('Network FX relay rate-limit checks passed.');
