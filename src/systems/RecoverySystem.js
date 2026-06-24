import * as THREE from 'three';
import { distance2D } from '../utils/math.js';

export class RecoverySystem {
  constructor(game) {
    this.game = game;
    this.center = new THREE.Vector3();
  }

  update(dt) {
    const base = this.game.playerBase;
    const recoveryRadius = this.game.modifiers.getStructureRecoveryRadius(base);
    const healthPerSecond = this.game.modifiers.getStructureHealthPerSecond(base);
    const durabilityPerSecond = this.game.modifiers.getStructureDurabilityPerSecond(base);
    this.center.copy(base.position);
    this.game.friendlyUnits.forEach((unit) => {
      if (!unit.alive) return;
      if (distance2D(unit.position, this.center) > recoveryRadius) return;
      unit.restoreHealth(healthPerSecond * dt);
      unit.restoreDurability(durabilityPerSecond * dt);
    });
    this.game.effects.spawnRecoveryPulse(this.center, recoveryRadius);
  }
}
