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
      if (!unit.alive || unit.isBuilding) return;
      if (distance2D(unit.position, this.center) > recoveryRadius) return;
      const healed = unit.restoreHealth(healthPerSecond);
      this.game.effects.spawnHealNumber(unit.position, healed, {
        displayAmount: healthPerSecond,
        height: unit.projectileHitHeight ?? 1.55
      });
      unit.restoreDurability(durabilityPerSecond);
    });

    this.tickBulwarkRegen();
  }

  tickBulwarkRegen() {
    const stacks = this.game.abilities?.getStacks?.('frontlineBulwark') ?? 0;
    if (stacks <= 0) return;
    const healAmount = stacks;
    this.game.friendlyUnits.forEach((unit) => {
      if (!unit.alive || unit.underConstruction) return;
      if (this.game.modifiers.getArmor(unit) <= 7) return;
      if (unit.health >= unit.maxHealth - 0.01) return;
      const healed = unit.restoreHealth(healAmount);
      if (healed <= 0.01) return;
      this.game.effects.spawnHealNumber(unit.position, healed, {
        displayAmount: healAmount,
        height: unit.projectileHitHeight ?? 1.55
      });
    });
  }
}
