import * as THREE from 'three';
import { BALANCE } from '../data/gameData.js';
import { distance2D } from '../utils/math.js';

export class RecoverySystem {
  constructor(game) {
    this.game = game;
    this.center = new THREE.Vector3(
      BALANCE.playerBase.position.x,
      0,
      BALANCE.playerBase.position.z
    );
  }

  update(dt) {
    const { recoveryRadius, healthPerSecond, durabilityPerSecond } = BALANCE.playerBase;
    this.game.friendlyUnits.forEach((unit) => {
      if (!unit.alive) return;
      if (distance2D(unit.position, this.center) > recoveryRadius) return;
      unit.restoreHealth(healthPerSecond * dt);
      unit.restoreDurability(durabilityPerSecond * dt);
    });
    this.game.effects.spawnRecoveryPulse(this.center, recoveryRadius);
  }
}
