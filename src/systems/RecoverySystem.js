export class RecoverySystem {
  constructor(game) {
    this.game = game;
  }

  update(dt) {
    this.tickBulwarkRegen();
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
