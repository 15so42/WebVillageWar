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

  getMaxShield(entity) {
    return this.getAttribute(entity, 'maxShield', entity?.maxShield ?? 0);
  }

  getMoveSpeed(unit) {
    const speed = this.getAttribute(unit, 'moveSpeed', unit.definition.speed);
    // 群集词缀的数量压力不应让敌人以不可反应的速度穿过整张战场。
    // 只约束带有该词缀的敌军，保留原本快单位及冲锋词缀的独立定位。
    if (unit?.team === 'enemy' && unit.hasEnchantment?.('waveSwarm')) {
      return Math.min(speed, 3.2);
    }
    return speed;
  }

  getAttackRange(unit) {
    return this.getAttribute(unit, 'attackRange', unit.definition.attackRange);
  }

  getAttackRate(unit) {
    return this.getAttribute(unit, 'attackRate', unit.definition.attackRate);
  }

  getPhysicalAttack(unit) {
    const baseAttack = this.getAttribute(
      unit,
      'physicalAttack',
      unit?.definition?.physicalAttack ?? 0
    );
    return baseAttack * this.getAttackDamageMultiplier(unit);
  }

  getMagicAttack(unit) {
    const baseAttack = this.getAttribute(
      unit,
      'magicAttack',
      unit?.definition?.magicAttack ?? 0
    );
    return baseAttack * this.getAttackDamageMultiplier(unit);
  }

  getAttackDamage(unit, attackDamageType = unit?.definition?.attackDamageType) {
    return normalizeAttackDamageType(attackDamageType) === 'magic'
      ? this.getMagicAttack(unit)
      : this.getPhysicalAttack(unit);
  }

  getArmor(unit) {
    return this.getAttribute(unit, 'armor', unit?.definition?.armor ?? 0);
  }

  getMagicResistance(unit) {
    return this.getAttribute(
      unit,
      'magicResistance',
      unit?.definition?.magicResistance ?? 0
    );
  }

  getKnockback(unit) {
    return this.getAttribute(unit, 'knockback', unit.definition.knockback);
  }

  getKnockbackResistance(unit) {
    return clampResistance(this.getAttribute(
      unit,
      'knockbackResistance',
      unit?.definition?.knockbackResistance ?? 0
    ));
  }

  getAggroRange(unit) {
    return this.getAttribute(unit, 'aggroRange', unit?.definition?.aggroRange ?? 0);
  }

  getProjectileSpeed(unit) {
    return this.getAttribute(unit, 'projectileSpeed', unit.definition.projectileSpeed ?? 0);
  }

  getDodgeChance(unit) {
    return clamp01(this.getAttribute(unit, 'dodgeChance', unit?.definition?.dodgeChance ?? 0));
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
    const attackDamageType = normalizeAttackDamageType(
      override.attackDamageType ?? source?.definition?.attackDamageType
    );
    return {
      game: this.game,
      source,
      target,
      damage: override.damage ?? this.getAttackDamage(source, attackDamageType),
      attackDamageType,
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

  getAttackDamageMultiplier(unit) {
    let multiplier = 1;
    (unit?.definition?.traits ?? []).forEach((trait) => {
      if (trait.type !== 'missingHealthAttackBonus') return;
      const maxHealth = this.getMaxHealth(unit);
      if (maxHealth <= 0) return;
      const missingRatio = clamp01(1 - unit.health / maxHealth);
      multiplier *= 1 + missingRatio * Math.max(0, trait.maxBonus ?? 0);
    });
    return multiplier;
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

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampResistance(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.92, Math.max(0, value));
}

function normalizeAttackDamageType(value) {
  return value === 'magic' ? 'magic' : 'physical';
}
