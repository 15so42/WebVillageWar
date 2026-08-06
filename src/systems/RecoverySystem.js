import * as THREE from 'three';
import { distance2D } from '../utils/math.js';

const RECOVERY_TICK_SECONDS = 1;
const PASSIVE_DURABILITY_RECOVERY_INTERVAL_SECONDS = 3;
const PASSIVE_DURABILITY_RECOVERY_AMOUNT = 1;

export class RecoverySystem {
  constructor(game) {
    this.game = game;
    this.center = new THREE.Vector3();
    this.tickTimer = 0;
    this.passiveDurabilityTimer = 0;
  }

  update(dt) {
    const base = this.game.playerBase;
    const recoveryRadius = this.game.modifiers.getStructureRecoveryRadius(base);
    const healthPerSecond = this.game.modifiers.getStructureHealthPerSecond(base);
    const durabilityPerSecond = this.game.modifiers.getStructureDurabilityPerSecond(base);
    this.center.copy(base.position);
    this.game.effects.ensureRecoveryAura(this.center, recoveryRadius);

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

    this.tickPassiveDurabilityRecovery(RECOVERY_TICK_SECONDS);
  }

  tickPassiveDurabilityRecovery(dt) {
    this.passiveDurabilityTimer += Math.max(0, Number(dt) || 0);
    while (this.passiveDurabilityTimer >= PASSIVE_DURABILITY_RECOVERY_INTERVAL_SECONDS) {
      this.passiveDurabilityTimer -= PASSIVE_DURABILITY_RECOVERY_INTERVAL_SECONDS;
      this.restoreAllUnitDurability();
      this.restoreAllStructureDurability();
    }
  }

  restoreAllUnitDurability() {
    this.restoreUnitDurabilityList(this.game.friendlyUnits);
    this.restoreUnitDurabilityList(this.game.enemyUnits);
  }

  restoreUnitDurabilityList(units = []) {
    units.forEach((unit) => {
      if (!unit?.alive || unit.underConstruction || !unit.weapon?.maxDurability) return;
      unit.restoreDurability?.(PASSIVE_DURABILITY_RECOVERY_AMOUNT);
    });
  }

  restoreAllStructureDurability() {
    [this.game.playerBase, this.game.enemyCamp].forEach((structure) => {
      if (!structure?.alive || structure.kind !== 'structure') return;
      this.game.repairStructure?.(structure, {
        durability: PASSIVE_DURABILITY_RECOVERY_AMOUNT
      });
    });
  }

  tickBulwarkRegen() {
    const slots = this.game.coopPlayerSlots?.() ?? [this.game.localPlayerSlot ?? 'p1'];
    slots.forEach((slot) => {
      const stacks = this.game.getAbilityStacks?.('frontlineBulwark', slot)
        ?? (slot === (this.game.localPlayerSlot ?? 'p1')
          ? (this.game.abilities?.getStacks?.('frontlineBulwark') ?? 0)
          : 0);
      if (stacks <= 0) return;
      const healAmount = stacks;
      this.game.friendlyUnits.forEach((unit) => {
        if (!unit.alive || unit.underConstruction) return;
        if (this.game.coop?.enabled
          && (unit.controllerPlayerId ?? unit.ownerPlayerId) !== slot) return;
        if (this.game.modifiers.getArmor(unit) <= 7) return;
        if (unit.health >= unit.maxHealth - 0.01) return;
        const healed = unit.restoreHealth(healAmount);
        if (healed <= 0.01) return;
        this.game.effects.spawnHealNumber(unit.position, healed, {
          displayAmount: healAmount,
          height: unit.projectileHitHeight ?? 1.55
        });
      });
    });
  }
}
