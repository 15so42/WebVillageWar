import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UNIT_DEFINITIONS } from '../src/data/gameData.js';
import {
  cameraFollowCenter,
  cameraKeyboardPanDelta,
  cameraMoveKeyForEvent
} from '../src/systems/cameraKeyboardControls.js';
import { UnitLogicSystem } from '../src/systems/UnitLogicSystem.js';
import { distance2D } from '../src/utils/math.js';

assert.equal(cameraMoveKeyForEvent({ code: 'KeyW', key: 'w' }), 'w');
assert.equal(cameraMoveKeyForEvent({ code: 'KeyA', key: 'a' }), 'a');
assert.equal(cameraMoveKeyForEvent({ code: 'KeyS', key: 's' }), 's');
assert.equal(cameraMoveKeyForEvent({ code: 'KeyD', key: 'd' }), 'd');
assert.equal(cameraMoveKeyForEvent({ code: 'KeyX', key: 'x' }), null);

const cameraOffsetDirection = { x: 0, z: 1 };
const forwardDelta = cameraKeyboardPanDelta(
  new Set(['w']),
  cameraOffsetDirection,
  20,
  1
);
const rightDelta = cameraKeyboardPanDelta(
  new Set(['d']),
  cameraOffsetDirection,
  20,
  1
);
const diagonalDelta = cameraKeyboardPanDelta(
  new Set(['w', 'd']),
  cameraOffsetDirection,
  20,
  1
);
assert.ok(Math.abs(forwardDelta.x) < 0.0001);
assert.ok(forwardDelta.z < 0);
assert.ok(rightDelta.x > 0);
assert.ok(Math.abs(rightDelta.z) < 0.0001);
assert.ok(
  Math.abs(
    Math.hypot(diagonalDelta.x, diagonalDelta.z)
      - Math.hypot(forwardDelta.x, forwardDelta.z)
  ) < 0.0001,
  'diagonal camera movement must not be faster'
);
assert.equal(
  cameraKeyboardPanDelta(new Set(['w', 's']), cameraOffsetDirection, 20, 1),
  null
);

assert.deepEqual(
  cameraFollowCenter([
    { alive: true, position: { x: 4, z: 8 } }
  ]),
  { x: 4, z: 8, count: 1 }
);
assert.deepEqual(
  cameraFollowCenter([
    { alive: true, position: { x: -4, z: 2 } },
    { alive: true, position: { x: 8, z: 10 } },
    { alive: false, position: { x: 100, z: 100 } }
  ]),
  { x: 2, z: 6, count: 2 }
);
assert.equal(cameraFollowCenter([{ alive: false, position: { x: 1, z: 1 } }]), null);

const owner = {
  id: 41,
  alive: true,
  team: 'player',
  position: new THREE.Vector3(0, 0, 0)
};
const turret = {
  id: 73,
  alive: true,
  team: 'player',
  type: 'miniTurret',
  ownerUnitId: owner.id,
  definition: structuredClone(UNIT_DEFINITIONS.miniTurret),
  position: new THREE.Vector3(24, 0, 0),
  guardPoint: new THREE.Vector3(24, 0, 0),
  target: { id: 99 },
  moveGoal: new THREE.Vector3(1, 0, 1),
  commandMoveGoal: new THREE.Vector3(2, 0, 2),
  attackRangeHoldTargetId: 99,
  knockbackVelocity: new THREE.Vector3(2, 0, 0),
  verticalVelocity: 3,
  grounded: false
};
let cancelledAttackCount = 0;
const recallRings = [];
const recallGame = {
  unitRegistry: {
    byId: new Map([[owner.id, owner]])
  },
  resolveWalkablePoint(point) {
    return point.clone();
  },
  groundHeightAt() {
    return 1.75;
  },
  attacks: {
    cancelPendingAttacksFor(units) {
      assert.deepEqual(units, [turret]);
      cancelledAttackCount += 1;
    }
  },
  effects: {
    spawnRing(position) {
      recallRings.push(position.clone());
    }
  }
};
const unitLogic = new UnitLogicSystem(recallGame);
assert.equal(unitLogic.updateOwnerRecall(turret, 0.25), true);
assert.ok(
  distance2D(turret.position, owner.position)
    <= UNIT_DEFINITIONS.miniTurret.ownerRecall.returnRadius + 0.001
);
assert.equal(turret.position.y, 1.75);
assert.equal(turret.target, null);
assert.equal(turret.moveGoal, null);
assert.equal(turret.commandMoveGoal, null);
assert.equal(turret.attackRangeHoldTargetId, null);
assert.equal(turret.knockbackVelocity.lengthSq(), 0);
assert.equal(turret.verticalVelocity, 0);
assert.equal(turret.grounded, true);
assert.equal(cancelledAttackCount, 1);
assert.equal(recallRings.length, 2);

const nearbyTurret = {
  ...turret,
  id: 74,
  position: new THREE.Vector3(
    UNIT_DEFINITIONS.miniTurret.ownerRecall.maxDistance - 0.1,
    0,
    0
  ),
  guardPoint: new THREE.Vector3(),
  ownerRecallCheckTimer: 0
};
assert.equal(unitLogic.updateOwnerRecall(nearbyTurret, 0.25), false);
assert.equal(cancelledAttackCount, 1);

console.log('unit recall and camera control checks passed');
