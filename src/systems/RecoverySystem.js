const PASSIVE_DURABILITY_RECOVERY_INTERVAL_SECONDS = 3;
const PASSIVE_DURABILITY_RECOVERY_AMOUNT = 1;

export class RecoverySystem {
  constructor(game) {
    this.game = game;
    this.passiveDurabilityTimer = 0;
  }

  update(dt) {
    // 基地不再提供生命或耐久恢复，也不再创建基地恢复光环。
    // 前线恢复改由祭坛承担（见 ALTAR_DEFINITIONS 的共享恢复效果）。
    // 全局被动耐久回复与壁垒回复与基地恢复无关，必须继续独立推进。
    this.tickBulwarkRegen();
    this.tickPassiveDurabilityRecovery(dt);
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
