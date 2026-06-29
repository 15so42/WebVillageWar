import * as THREE from 'three';
import { BUFF_DEFINITIONS, ENCHANTMENTS, TEAMS, UNIT_DEFINITIONS } from '../data/gameData.js';
import { mat } from '../art/lowpoly.js';
import { createUnitModel, updateUnitAnimation } from '../art/visualRegistry.js';
import { AttributeSet, bindAttributeGetter } from '../systems/AttributeSet.js';
import { clamp } from '../utils/math.js';

let nextUnitId = 1;

export class UnitEntity {
  constructor({ type, team, position }) {
    this.id = nextUnitId;
    nextUnitId += 1;
    this.type = type;
    this.team = team;
    this.definition = structuredClone(UNIT_DEFINITIONS[type]);
    this.name = this.definition.name;
    this.attributes = createUnitAttributes(this.definition);
    bindUnitAttributeGetters(this);
    this.health = this.maxHealth;
    this.shield = 0;
    this.healthLagRatio = 1;
    this.healthLagDelay = 0;
    this.weapon = {
      ...this.definition.weapon,
      attributes: this.attributes,
      durability: this.attributes.get('maxDurability')
    };
    bindAttributeGetter(this.weapon, 'maxDurability', 'maxDurability');
    bindAttributeGetter(this.weapon, 'durabilityCost', 'durabilityCost');
    this.attackTimer = Math.random() * 0.25;
    this.hitStunTimer = 0;
    this.knockbackVelocity = new THREE.Vector3();
    this.verticalVelocity = 0;
    this.grounded = true;
    this.isBuilding = this.definition.isBuilding === true;
    this.canReceiveBuffs = this.definition.canReceiveBuffs !== false;
    this.immuneToStatusEffects = this.definition.immuneToStatusEffects === true;
    this.collisionRadius = this.definition.collisionRadius;
    this.attackRadius = this.definition.attackRadius;
    this.projectileHitHeight = this.definition.projectileHitHeight;
    this.abilityCooldowns = new Map();
    const rangedProjectile = this.definition.weaponAbility?.rangedProjectile;
    if (rangedProjectile) {
      this.abilityCooldowns.set(
        rangedProjectile.key ?? 'rangedProjectile',
        Math.max(0, rangedProjectile.initialCooldown ?? 0)
      );
    }
    this.moveGoal = null;
    this.commandMoveGoal = null;
    this.controlMode = 'normal';
    this.guardPoint = null;
    this.guardRadius = null;
    this.supportCooldowns = new Map();
    this.target = null;
    this.alive = true;
    this.visualState = 'idle';
    this.buffs = new Map();
    this.enchantments = new Map();
    this.status = {
      burnTime: 0,
      burnDamagePerSecond: 0,
      burnTick: 0
    };
    this.mesh = new THREE.Group();
    this.visualRoot = createUnitModel(type, team);
    this.mesh.add(this.visualRoot);
    this.mesh.position.copy(position);
    this.mesh.userData.entity = this;
    this.mesh.traverse((node) => {
      node.userData.entity = this;
    });
    this.statusElement = createUnitStatusElement(team);
    this.enchantHalo = createEnchantHalo();
    this.mesh.add(this.enchantHalo);
    disableDynamicUnitShadows(this.mesh);
  }

  get position() {
    return this.mesh.position;
  }

  addEnchantment(id) {
    this.addBuff(id, ENCHANTMENTS[id]);
  }

  addBuff(id, definition = BUFF_DEFINITIONS[id], overrides = {}) {
    if (!definition) return null;
    const existing = this.buffs.get(id);
    const isEnchantment = definition.category === 'enchantment';
    const level = resolveBuffLevel(definition, existing, overrides, isEnchantment);
    const damagePerSecond = resolveStackingNumber('damagePerSecond', definition, existing, overrides);
    const healPerSecond = resolveStackingNumber('healPerSecond', definition, existing, overrides);
    this.attributes.removeModifiersBySource(buffModifierSource(id));
    const duration = overrides.duration ?? definition.duration ?? 0;
    const instance = {
      ...definition,
      ...overrides,
      id,
      level,
      ...(damagePerSecond !== null ? { damagePerSecond } : {}),
      ...(healPerSecond !== null ? { healPerSecond } : {}),
      source: overrides.source ?? existing?.source ?? null,
      remaining: duration,
      tickTimer: overrides.tickTimer ?? existing?.tickTimer ?? overrides.tickInterval ?? definition.tickInterval ?? 0
    };
    this.buffs.set(id, instance);
    this.attributes.addModifiers(instance.modifiers, buffModifierSource(id), {
      level: instance.level,
      buff: instance,
      owner: this
    });
    this.clampToAttributeCaps();

    if (isEnchantment) {
      this.enchantments.set(id, instance);
      refreshEnchantHalo(this);
      refreshStatusElement(this);
    }
    return instance;
  }

  removeBuff(id) {
    const buff = this.buffs.get(id);
    if (!buff) return;
    this.buffs.delete(id);
    this.attributes.removeModifiersBySource(buffModifierSource(id));
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:soul-bonus`);
    this.clampToAttributeCaps();
    if (this.enchantments.has(id)) {
      this.enchantments.delete(id);
      refreshEnchantHalo(this);
      refreshStatusElement(this);
    }
  }

  hasBuff(id) {
    return this.buffs.has(id);
  }

  hasEnchantment(id) {
    return this.enchantments.has(id);
  }

  getAttribute(name, fallback = 0) {
    return this.attributes.get(name, fallback, {
      owner: this
    });
  }

  restoreHealth(amount) {
    const previousHealth = this.health;
    this.health = clamp(this.health + amount, 0, this.maxHealth);
    return this.health - previousHealth;
  }

  restoreShield(amount) {
    const previousShield = this.shield;
    this.shield = clamp(this.shield + amount, 0, this.maxShield);
    return this.shield - previousShield;
  }

  restoreDurability(amount) {
    const previousDurability = this.weapon.durability;
    this.weapon.durability = clamp(
      this.weapon.durability + amount,
      0,
      this.weapon.maxDurability
    );
    return this.weapon.durability - previousDurability;
  }

  spendDurability(amount) {
    this.weapon.durability = clamp(this.weapon.durability - amount, 0, this.weapon.maxDurability);
  }

  clampToAttributeCaps() {
    this.health = clamp(this.health, 0, this.maxHealth);
    this.shield = clamp(this.shield, 0, this.maxShield);
    this.weapon.durability = clamp(this.weapon.durability, 0, this.weapon.maxDurability);
  }

  applyBurn(seconds, damagePerSecond) {
    this.addBuff('burning', BUFF_DEFINITIONS.burning, {
      duration: seconds,
      damagePerSecond
    });
  }

  updateVisual(camera, dt) {
    if (!this.underConstruction) {
      updateUnitAnimation(this, dt);
    }
    refreshStatusElement(this, dt);
    this.enchantHalo.rotation.y += 0.035;
    this.enchantHalo.visible = this.enchantments.size > 0;
  }

  takeRawDamage(amount, options = {}) {
    const incoming = Math.max(0, amount);
    const previousHealth = this.health;
    const absorbed = options.bypassShield ? 0 : Math.min(this.shield, incoming);
    this.shield -= absorbed;
    this.health -= incoming - absorbed;
    if (this.health < previousHealth) {
      this.registerHealthLoss(previousHealth);
    }
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
    }
  }

  registerHealthLoss(previousHealth) {
    const previousRatio = clamp(previousHealth / this.maxHealth, 0, 1);
    this.healthLagRatio = Math.max(this.healthLagRatio, previousRatio);
    this.healthLagDelay = 0.4;
  }
}

function createUnitAttributes(definition) {
  const maxHealth = definition.maxHealth;
  const maxShield = Number.isFinite(definition.maxShield)
    ? definition.maxShield
    : maxHealth * 0.5;
  return new AttributeSet({
    maxHealth,
    maxShield,
    moveSpeed: definition.speed,
    attackRange: definition.attackRange,
    attackRate: definition.attackRate,
    attackDamage: definition.damage,
    knockback: definition.knockback,
    aggroRange: definition.aggroRange,
    projectileSpeed: definition.projectileSpeed ?? 0,
    dodgeChance: definition.dodgeChance ?? 0,
    maxDurability: definition.weapon.maxDurability,
    durabilityCost: definition.weapon.durabilityCost
  });
}

function bindUnitAttributeGetters(unit) {
  bindAttributeGetter(unit, 'maxHealth', 'maxHealth');
  bindAttributeGetter(unit, 'maxShield', 'maxShield');
  bindAttributeGetter(unit, 'moveSpeed', 'moveSpeed');
  bindAttributeGetter(unit, 'attackRange', 'attackRange');
  bindAttributeGetter(unit, 'attackRate', 'attackRate');
  bindAttributeGetter(unit, 'attackDamage', 'attackDamage');
  bindAttributeGetter(unit, 'knockback', 'knockback');
  bindAttributeGetter(unit, 'aggroRange', 'aggroRange');
  bindAttributeGetter(unit, 'projectileSpeed', 'projectileSpeed');
  bindAttributeGetter(unit, 'dodgeChance', 'dodgeChance');
  bindAttributeGetter(unit, 'maxDurability', 'maxDurability');
  bindAttributeGetter(unit, 'durabilityCost', 'durabilityCost');
}

function buffModifierSource(id) {
  return `buff:${id}`;
}

function resolveBuffLevel(definition, existing, overrides, isEnchantment) {
  if (isEnchantment && existing && Number.isFinite(overrides.levelIncrement)) {
    return Math.max(1, existing.level ?? 1) + Math.max(1, overrides.levelIncrement);
  }
  if (Number.isFinite(overrides.level)) {
    return existing && !isEnchantment
      ? Math.max(existing.level ?? 1, overrides.level)
      : Math.max(1, overrides.level);
  }
  if (isEnchantment && existing) {
    return Math.max(1, existing.level ?? 1) + (overrides.levelIncrement ?? 1);
  }
  return Math.max(1, definition.level ?? existing?.level ?? 1);
}

function resolveStackingNumber(field, definition, existing, overrides) {
  const next = overrides[field] ?? definition[field];
  const previous = existing?.[field];
  if (Number.isFinite(next) && Number.isFinite(previous)) {
    return Math.max(next, previous);
  }
  if (Number.isFinite(next)) return next;
  if (Number.isFinite(previous)) return previous;
  return null;
}

function createEnchantHalo() {
  const group = new THREE.Group();
  const fire = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.025, 5, 24),
    mat('#ff823d', { emissive: '#ff4a1a', emissiveIntensity: 0.7 })
  );
  const thorns = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.026, 5, 24),
    mat('#79d27a', { emissive: '#275f2c', emissiveIntensity: 0.45 })
  );
  fire.rotation.x = Math.PI / 2;
  thorns.rotation.x = Math.PI / 2;
  fire.position.y = 0.14;
  thorns.position.y = 0.18;
  fire.userData.enchantment = 'fire';
  thorns.userData.enchantment = 'thorns';
  group.add(fire, thorns);
  group.visible = false;
  return group;
}

function disableDynamicUnitShadows(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = false;
    node.receiveShadow = false;
  });
}

function refreshEnchantHalo(unit) {
  unit.enchantHalo.children.forEach((child) => {
    child.visible = unit.enchantments.has(child.userData.enchantment);
  });
}

function createUnitStatusElement(team) {
  const element = document.createElement('div');
  element.className = `world-status unit-status ${team === TEAMS.PLAYER ? 'is-friendly' : 'is-enemy'}`;
  element.innerHTML = `
    <div class="world-health-bar">
      <span class="world-health-loss-fill"></span>
      <span class="world-health-fill"></span>
      <span class="world-health-ticks"></span>
      <span class="world-shield-fill" hidden></span>
    </div>
    <div class="world-durability-bar">
      <span class="world-durability-fill"></span>
    </div>
    <div class="world-enchantments" hidden></div>
  `;
  element.hidden = true;
  element.parts = {
    hp: element.querySelector('.world-health-fill'),
    healthLoss: element.querySelector('.world-health-loss-fill'),
    shield: element.querySelector('.world-shield-fill'),
    durability: element.querySelector('.world-durability-fill'),
    enchantments: element.querySelector('.world-enchantments')
  };
  return element;
}

function refreshStatusElement(unit, dt = 0) {
  const element = unit.statusElement;
  if (!element?.parts) return;
  const hpRatio = clamp(unit.health / unit.maxHealth, 0, 1);
  const shieldRatio = unit.maxShield > 0 ? clamp(unit.shield / unit.maxShield, 0, 1) : 0;
  const durabilityRatio = clamp(unit.weapon.durability / unit.weapon.maxDurability, 0, 1);
  updateHealthLag(unit, hpRatio, dt);
  element.classList.toggle('has-shield', unit.maxShield > 0);
  element.parts.hp.style.transform = `scaleX(${hpRatio})`;
  element.parts.healthLoss.style.transform = `scaleX(${unit.healthLagRatio})`;
  element.parts.healthLoss.hidden = unit.healthLagRatio <= hpRatio + 0.006;
  element.parts.shield.style.transform = `scaleX(${shieldRatio})`;
  element.parts.shield.hidden = shieldRatio <= 0;
  element.parts.durability.style.transform = `scaleX(${durabilityRatio})`;

  const enchantmentStatuses = [...unit.enchantments.values()]
    .filter((enchantment) => !enchantment.hidden)
    .map(formatEnchantmentStatus);
  const enchantmentText = wrapEnchantmentStatuses(enchantmentStatuses);
  element.parts.enchantments.textContent = enchantmentText;
  element.parts.enchantments.hidden = enchantmentText.length === 0;
}

function updateHealthLag(unit, hpRatio, dt) {
  unit.healthLagRatio = Math.max(unit.healthLagRatio ?? hpRatio, hpRatio);
  unit.healthLagDelay = Math.max(0, (unit.healthLagDelay ?? 0) - dt);
  if (unit.healthLagDelay > 0) return;
  if (unit.healthLagRatio <= hpRatio) {
    unit.healthLagRatio = hpRatio;
    return;
  }
  const catchupSpeed = 3.8;
  unit.healthLagRatio = Math.max(
    hpRatio,
    unit.healthLagRatio - catchupSpeed * Math.max(0, dt)
  );
}

function formatEnchantmentStatus(enchantment) {
  return `【${enchantment.name}${Math.max(1, Math.floor(enchantment.level ?? 1))}】`;
}

function wrapEnchantmentStatuses(statuses) {
  return statuses.join('');
}
