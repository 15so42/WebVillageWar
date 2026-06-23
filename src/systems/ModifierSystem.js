export class ModifierSystem {
  constructor(game) {
    this.game = game;
  }

  getMoveSpeed(unit) {
    return this.applyNumericModifiers(unit, 'moveSpeed', unit.definition.speed);
  }

  getAttackRate(unit) {
    return this.applyNumericModifiers(unit, 'attackRate', unit.definition.attackRate);
  }

  getAttackDamage(unit) {
    return this.applyNumericModifiers(unit, 'attackDamage', unit.definition.damage);
  }

  getKnockback(unit) {
    return this.applyNumericModifiers(unit, 'knockback', unit.definition.knockback);
  }

  getProjectileSpeed(unit) {
    return this.applyNumericModifiers(
      unit,
      'projectileSpeed',
      unit.definition.projectileSpeed ?? 0
    );
  }

  getDurabilityCost(unit) {
    return this.applyNumericModifiers(
      unit,
      'durabilityCost',
      unit.definition.weapon.durabilityCost
    );
  }

  createAttackContext(source, target, override = {}) {
    return {
      game: this.game,
      source,
      target,
      damage: override.damage ?? this.getAttackDamage(source),
      knockback: override.knockback ?? this.getKnockback(source),
      damageTypes: new Set(override.damageTypes ?? []),
      isProjectile: Boolean(override.isProjectile),
      isAttack: true
    };
  }

  applyNumericModifiers(unit, stat, baseValue) {
    let value = baseValue;
    unit.buffs?.forEach((buff) => {
      (buff.modifiers ?? []).forEach((modifier) => {
        if (modifier.stat !== stat) return;
        value = applyModifier(value, modifier);
      });
    });
    return Math.max(0, value);
  }
}

function applyModifier(value, modifier) {
  if (modifier.op === 'add') {
    return value + modifier.amount;
  }
  if (modifier.op === 'multiply') {
    return value * modifier.amount;
  }
  if (modifier.op === 'set') {
    return modifier.amount;
  }
  return value;
}
