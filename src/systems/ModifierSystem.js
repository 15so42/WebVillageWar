export class ModifierSystem {
  constructor(game) {
    this.game = game;
  }

  getAttribute(entity, stat, fallback = 0) {
    if (entity?.attributes) {
      return entity.attributes.get(stat, fallback, {
        owner: entity,
        game: this.game
      });
    }
    return this.applyLegacyBuffModifiers(entity, stat, fallback);
  }

  getMaxHealth(entity) {
    return this.getAttribute(entity, 'maxHealth', entity?.maxHealth ?? 0);
  }

  getMoveSpeed(unit) {
    return this.getAttribute(unit, 'moveSpeed', unit.definition.speed);
  }

  getAttackRange(unit) {
    return this.getAttribute(unit, 'attackRange', unit.definition.attackRange);
  }

  getAttackRate(unit) {
    return this.getAttribute(unit, 'attackRate', unit.definition.attackRate);
  }

  getAttackDamage(unit) {
    return this.getAttribute(unit, 'attackDamage', unit.definition.damage);
  }

  getKnockback(unit) {
    return this.getAttribute(unit, 'knockback', unit.definition.knockback);
  }

  getAggroRange(unit) {
    return this.getAttribute(unit, 'aggroRange', unit.definition.aggroRange);
  }

  getProjectileSpeed(unit) {
    return this.getAttribute(unit, 'projectileSpeed', unit.definition.projectileSpeed ?? 0);
  }

  getMaxDurability(unit) {
    return this.getAttribute(unit, 'maxDurability', unit.definition.weapon.maxDurability);
  }

  getDurabilityCost(unit) {
    return this.getAttribute(unit, 'durabilityCost', unit.definition.weapon.durabilityCost);
  }

  getStructureRecoveryRadius(structure) {
    return this.getAttribute(structure, 'recoveryRadius', structure?.recoveryRadius ?? 0);
  }

  getStructureHealthPerSecond(structure) {
    return this.getAttribute(structure, 'healthPerSecond', structure?.healthPerSecond ?? 0);
  }

  getStructureDurabilityPerSecond(structure) {
    return this.getAttribute(
      structure,
      'durabilityPerSecond',
      structure?.durabilityPerSecond ?? 0
    );
  }

  getStructureCollisionRadius(structure) {
    return this.getAttribute(structure, 'collisionRadius', structure?.collisionRadius ?? 0);
  }

  getStructureAttackRadius(structure) {
    return this.getAttribute(structure, 'attackRadius', structure?.attackRadius ?? 0);
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

  applyLegacyBuffModifiers(unit, stat, baseValue) {
    let value = baseValue;
    unit?.buffs?.forEach((buff) => {
      (buff.modifiers ?? []).forEach((modifier) => {
        if (modifier.stat !== stat) return;
        value = applyModifier(value, modifier);
      });
    });
    return Math.max(0, value);
  }
}

function applyModifier(value, modifier) {
  const type = modifier.type ?? modifier.op;
  if (type === 'add') {
    return value + modifier.amount;
  }
  if (type === 'multiply') {
    return value * modifier.amount;
  }
  if (type === 'set') {
    return modifier.amount;
  }
  return value;
}
