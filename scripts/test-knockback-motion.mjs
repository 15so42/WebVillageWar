import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MovementAgent } from '../src/entities/MovementAgent.js';
import {
  applyKnockbackImpulse,
  KNOCKBACK_AIRBORNE_VELOCITY_RETAIN_PER_SECOND,
  KNOCKBACK_LIFT_SPEED_CAP,
  KNOCKBACK_MOTION_TIME_SCALE,
  KNOCKBACK_VELOCITY_RETAIN_PER_SECOND,
  knockbackImpulseSpeed
} from '../src/systems/combatHelpers.js';

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

const pathClears = [];
const target = createUnit({ grounded: true });
assert.equal(applyKnockbackImpulse({
  pathfinding: { clear: (unit) => pathClears.push(unit) }
}, target, new THREE.Vector3(0, 0, 0), 1.45), true);
assert.equal(target.knockbackVelocity.x, knockbackImpulseSpeed(1.45, target));
assert.equal(target.knockbackVelocity.z, 0);
assert(target.verticalVelocity > 0 && target.verticalVelocity <= KNOCKBACK_LIFT_SPEED_CAP);
assert.equal(target.grounded, false, 'a grounded target should receive the short Minecraft-style lift');
assert.equal(pathClears.length, 1);

const firstImpulse = target.knockbackVelocity.x;
target.grounded = true;
target.verticalVelocity = 0;
assert.equal(applyKnockbackImpulse({ pathfinding: { clear() {} } }, target, new THREE.Vector3(0, 0, 0), 1.45), true);
assert.equal(
  target.knockbackVelocity.x,
  firstImpulse * 0.5 + knockbackImpulseSpeed(1.45, target),
  'a repeated hit should halve the old horizontal velocity before adding the new impulse'
);

const verticalUnit = createUnit({ grounded: false });
verticalUnit.verticalVelocity = target.verticalVelocity;
let peakHeight = verticalUnit.position.y;
for (let step = 0; step < 180 && !verticalUnit.grounded; step += 1) {
  Game.prototype.placeUnitOnGround.call({ groundHeightAt: () => 0 }, verticalUnit, 1 / 60);
  peakHeight = Math.max(peakHeight, verticalUnit.position.y);
}
assert(peakHeight > 0.04, 'the lift should produce a visible but restrained vertical arc');
assert.equal(verticalUnit.grounded, true);
assert.equal(verticalUnit.position.y, 0);

const airborne = createUnit({ grounded: false, velocity: 3 });
const grounded = createUnit({ grounded: true, velocity: 3 });
const airborneStartX = airborne.position.x;
const motionGame = {
  combat: { onKnockbackEnded() {} },
  clearUnitRoute() {},
  isPointWalkable: () => true
};
new MovementAgent(airborne, motionGame).applyMotion(0.05);
new MovementAgent(grounded, motionGame).applyMotion(0.05);
assert.equal(KNOCKBACK_MOTION_TIME_SCALE, 0.67);
assert(
  Math.abs(
    (airborne.position.x - airborneStartX)
      - 3 * 0.05 * KNOCKBACK_MOTION_TIME_SCALE
  ) < 0.000001,
  'horizontal knockback should move at 67% speed without changing its curve'
);
assert(
  airborne.knockbackVelocity.length() > grounded.knockbackVelocity.length(),
  'airborne knockback should retain momentum while landing applies strong braking'
);
assert(KNOCKBACK_AIRBORNE_VELOCITY_RETAIN_PER_SECOND > KNOCKBACK_VELOCITY_RETAIN_PER_SECOND);

console.log('Minecraft-style knockback motion tests passed.');

function createUnit({ grounded, velocity = 0 }) {
  return {
    type: 'archer',
    isBuilding: false,
    position: new THREE.Vector3(2, 0, 0),
    definition: { role: 'ranged', canMove: true },
    knockbackVelocity: new THREE.Vector3(velocity, 0, 0),
    knockbackSessionDistance: 0,
    verticalVelocity: 0,
    grounded,
    hitStunTimer: 0
  };
}
