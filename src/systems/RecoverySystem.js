import * as THREE from 'three';
import { distance2D } from '../utils/math.js';

const RECOVERY_TICK_SECONDS = 1;

export class RecoverySystem {
  constructor(game) {
    this.game = game;
    this.center = new THREE.Vector3();
    this.tickTimer = 0;
  }

  update(dt) {
    const base = this.game.playerBase;
    const recoveryRadius = this.game.modifiers.getStructureRecoveryRadius(base);
    const healthPerSecond = this.game.modifiers.getStructureHealthPerSecond(base);
    const durabilityPerSecond = this.game.modifiers.getStructureDurabilityPerSecond(base);
    this.center.copy(base.position);
    this.game.effects.spawnRecoveryPulse(this.center, recoveryRadius);

    this.tickTimer += dt;
    if (this.tickTimer < RECOVERY_TICK_SECONDS) return;
    this.tickTimer -= RECOVERY_TICK_SECONDS;

    this.game.friendlyUnits.forEach((unit) => {
      if (!unit.alive) return;
      if (distance2D(unit.position, this.center) > recoveryRadius) return;
      const healed = unit.restoreHealth(healthPerSecond);
      this.game.effects.spawnHealNumber(unit.position, healed);
      unit.restoreDurability(durabilityPerSecond);
    });
  }
}
