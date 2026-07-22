import * as THREE from 'three';
import { BUFF_DEFINITIONS, ENCHANTMENTS, TEAMS, UNIT_DEFINITIONS } from '../data/gameData.js';
import { basicMat, mat } from '../art/lowpoly.js';
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
    this.hitFlashTimer = 0;
    this.knockbackVelocity = new THREE.Vector3();
    this.knockbackSessionDistance = 0;
    this.recentPlayerKnockback = false;
    this.recentPlayerKnockbackOwner = null;
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
    const monsterAbility = this.definition.monsterAbility;
    if (monsterAbility) {
      this.abilityCooldowns.set(
        monsterAbility.key ?? `monster:${monsterAbility.type ?? 'ability'}`,
        Math.max(0, monsterAbility.initialCooldown ?? 0)
      );
    }
    this.moveGoal = null;
    this.commandMoveGoal = null;
    this.moveGoalUsesDirectSteering = false;
    this.directMoveBlocked = false;
    this.directMoveBlockedTime = 0;
    this.attackRangeHoldTargetId = null;
    this.controlMode = 'normal';
    this.guardPoint = null;
    this.guardRadius = null;
    this.selected = false;
    this.selectedByPlayerId = null;
    this.networkSelectionRing = null;
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
    this.visualRoot.userData.groundOffset = unitVisualGroundOffset(this.definition);
    this.visualRoot.position.y = this.visualRoot.userData.groundOffset;
    this.mesh.add(this.visualRoot);
    this.groundShadow = createUnitGroundShadow(this);
    this.mesh.add(this.groundShadow);
    this.mesh.position.copy(position);
    this.mesh.userData.entity = this;
    this.mesh.traverse((node) => {
      node.userData.entity = this;
    });
    this.statusElement = createUnitStatusElement(team);
    this.statusUiDirty = true;
    this.statusLagActive = false;
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
    const incomingLevel = resolveIncomingBuffLevel(definition, overrides);
    const existingLevel = Math.max(1, existing?.level ?? 1);
    const level = existing && isEnchantment
      ? existingLevel + incomingLevel
      : incomingLevel;
    const duration = overrides.duration ?? definition.duration ?? 0;
    if (existing && !isEnchantment && level <= existingLevel) {
      existing.remaining = refreshBuffDuration(existing.remaining, duration);
      refreshBuffSource(existing, overrides);
      return existing;
    }

    const damagePerSecond = resolveBuffNumber('damagePerSecond', definition, overrides);
    const maxHealthDamagePercentPerSecond = resolveBuffNumber(
      'maxHealthDamagePercentPerSecond',
      definition,
      overrides
    );
    const healPerSecond = resolveBuffNumber('healPerSecond', definition, overrides);
    this.attributes.removeModifiersBySource(buffModifierSource(id));
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:focus-range`);
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:nearby`);
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:advantage`);
    const instance = {
      ...definition,
      ...overrides,
      id,
      level,
      ...(damagePerSecond !== null ? { damagePerSecond } : {}),
      ...(maxHealthDamagePercentPerSecond !== null ? { maxHealthDamagePercentPerSecond } : {}),
      ...(healPerSecond !== null ? { healPerSecond } : {}),
      source: resolveBuffSource(existing, overrides),
      remaining: isEnchantment
        ? refreshBuffDuration(existing?.remaining, duration)
        : duration,
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
      this.statusUiDirty = true;
    }
    return instance;
  }

  removeBuff(id) {
    const buff = this.buffs.get(id);
    if (!buff) return;
    this.buffs.delete(id);
    this.attributes.removeModifiersBySource(buffModifierSource(id));
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:soul-bonus`);
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:focus-range`);
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:nearby`);
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:advantage`);
    this.clampToAttributeCaps();
    if (this.enchantments.has(id)) {
      this.enchantments.delete(id);
      refreshEnchantHalo(this);
      this.statusUiDirty = true;
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
    if (this.health !== previousHealth) {
      this.statusUiDirty = true;
    }
    return this.health - previousHealth;
  }

  restoreShield(amount) {
    const previousShield = this.shield;
    this.shield = clamp(this.shield + amount, 0, this.maxShield);
    const gained = this.shield - previousShield;
    if (gained > 0.01) {
      this.statusUiDirty = true;
      this.game?.buffs?.onShieldGained?.(this, gained);
    } else if (this.shield !== previousShield) {
      this.statusUiDirty = true;
    }
    return gained;
  }

  restoreDurability(amount) {
    const previousDurability = this.weapon.durability;
    this.weapon.durability = clamp(
      this.weapon.durability + amount,
      0,
      this.weapon.maxDurability
    );
    if (this.weapon.durability !== previousDurability) {
      this.statusUiDirty = true;
    }
    return this.weapon.durability - previousDurability;
  }

  spendDurability(amount) {
    if (amount <= 0) return;
    const previousDurability = this.weapon.durability;
    this.weapon.durability = clamp(this.weapon.durability - amount, 0, this.weapon.maxDurability);
    if (this.weapon.durability !== previousDurability) {
      this.statusUiDirty = true;
    }
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
    this.enchantHalo.rotation.y += 0.035;
    this.enchantHalo.visible = this.enchantments.size > 0;
    this.groundShadow.visible = this.alive;
  }

  updateNetworkVisual(dt) {
    if (!this.underConstruction) {
      // The Host chooses visualState/one-shot animations. The mirror only advances
      // that received pose for rendering and never derives movement or combat state.
      updateUnitAnimation(this, dt);
    }
    this.enchantHalo.rotation.y += Math.max(0, dt) * 2.1;
    this.enchantHalo.visible = this.enchantments.size > 0;
    this.groundShadow.visible = this.alive;
  }

  updateStatusVisual(dt = 0) {
    refreshStatusElement(this, dt);
    this.statusUiDirty = false;
  }

  updateStatusLagVisual(dt = 0) {
    refreshStatusLagElement(this, dt);
  }

  takeRawDamage(amount, options = {}) {
    const incoming = Math.max(0, amount);
    const previousHealth = this.health;
    const absorbed = options.bypassShield ? 0 : Math.min(this.shield, incoming);
    this.shield -= absorbed;
    this.health -= incoming - absorbed;
    if (this.health < previousHealth) {
      this.registerHealthLoss(previousHealth);
      this.statusUiDirty = true;
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
    this.statusLagActive = true;
  }
}

function createUnitAttributes(definition) {
  const maxHealth = definition.maxHealth;
  const maxShield = Number.isFinite(definition.maxShield)
    ? definition.maxShield
    : maxHealth * 0.5;
  const attributes = new AttributeSet({
    maxHealth,
    maxShield,
    moveSpeed: definition.speed,
    attackRange: definition.attackRange,
    attackRate: definition.attackRate,
    attackDamage: definition.damage,
    knockback: definition.knockback,
    knockbackResistance: definition.knockbackResistance ?? 0,
    aggroRange: definition.aggroRange,
    projectileSpeed: definition.projectileSpeed ?? 0,
    dodgeChance: definition.dodgeChance ?? 0,
    maxDurability: definition.weapon.maxDurability,
    durabilityCost: definition.weapon.durabilityCost
  });
  attributes.setBase('armor', definition.armor ?? 0, { min: -99 });
  attributes.setBase('magicResistance', definition.magicResistance ?? 0, { min: -99 });
  return attributes;
}

function bindUnitAttributeGetters(unit) {
  bindAttributeGetter(unit, 'maxHealth', 'maxHealth');
  bindAttributeGetter(unit, 'maxShield', 'maxShield');
  bindAttributeGetter(unit, 'moveSpeed', 'moveSpeed');
  bindAttributeGetter(unit, 'attackRange', 'attackRange');
  bindAttributeGetter(unit, 'attackRate', 'attackRate');
  bindAttributeGetter(unit, 'attackDamage', 'attackDamage');
  bindAttributeGetter(unit, 'armor', 'armor');
  bindAttributeGetter(unit, 'magicResistance', 'magicResistance');
  bindAttributeGetter(unit, 'knockback', 'knockback');
  bindAttributeGetter(unit, 'knockbackResistance', 'knockbackResistance');
  bindAttributeGetter(unit, 'aggroRange', 'aggroRange');
  bindAttributeGetter(unit, 'projectileSpeed', 'projectileSpeed');
  bindAttributeGetter(unit, 'dodgeChance', 'dodgeChance');
  bindAttributeGetter(unit, 'maxDurability', 'maxDurability');
  bindAttributeGetter(unit, 'durabilityCost', 'durabilityCost');
}

function buffModifierSource(id) {
  return `buff:${id}`;
}

function resolveIncomingBuffLevel(definition, overrides) {
  if (Number.isFinite(overrides.level)) {
    return Math.max(1, overrides.level);
  }
  if (Number.isFinite(overrides.levelIncrement)) {
    return Math.max(1, definition.level ?? 1) + Math.max(1, overrides.levelIncrement);
  }
  return Math.max(1, definition.level ?? 1);
}

function resolveBuffNumber(field, definition, overrides) {
  const next = overrides[field] ?? definition[field];
  if (Number.isFinite(next)) return next;
  return null;
}

function refreshBuffDuration(current, next) {
  if (!Number.isFinite(next)) return next;
  if (!Number.isFinite(current)) return current;
  return Math.max(current, next);
}

function resolveBuffSource(existing, overrides) {
  if (Object.prototype.hasOwnProperty.call(overrides, 'source')) {
    return overrides.source;
  }
  return existing?.source ?? null;
}

function refreshBuffSource(buff, overrides) {
  buff.source = resolveBuffSource(buff, overrides);
  copyOverrideField(buff, overrides, 'sourceCard');
  copyOverrideField(buff, overrides, 'sourceUnitType');
  copyOverrideField(buff, overrides, 'sourceWaveAffix');
}

function copyOverrideField(target, source, field) {
  if (Object.prototype.hasOwnProperty.call(source, field)) {
    target[field] = source[field];
  }
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

function createUnitGroundShadow(unit) {
  const radius = Number.isFinite(unit.collisionRadius)
    ? unit.collisionRadius
    : unit.definition.role === 'ranged' ? 0.36 : 0.42;
  const width = clamp(radius * (unit.isBuilding ? 2.5 : 2.05), 0.56, unit.isBuilding ? 2.4 : 1.65);
  const depth = clamp(radius * (unit.isBuilding ? 1.8 : 1.35), 0.4, unit.isBuilding ? 1.65 : 1.12);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 28),
    basicMat('#050607', {
      transparent: true,
      opacity: unit.isBuilding ? 0.24 : 0.22,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    }).clone()
  );
  shadow.name = 'GroundShadow';
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.055;
  shadow.scale.set(width, depth, 1);
  shadow.renderOrder = -20;
  return shadow;
}

function unitVisualGroundOffset(definition) {
  if (definition.isBuilding) return 0;
  if (definition.art?.rig === 'humanoid') return 0.055;
  return 0.025;
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
    ticks: element.querySelector('.world-health-ticks'),
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
  unit.statusLagActive = unit.healthLagRatio > hpRatio + 0.006 || unit.healthLagDelay > 0;
  element.classList.toggle('has-shield', unit.maxShield > 0);
  element.parts.hp.style.transform = `scaleX(${hpRatio})`;
  element.parts.healthLoss.style.transform = `scaleX(${unit.healthLagRatio})`;
  element.parts.healthLoss.hidden = unit.healthLagRatio <= hpRatio + 0.006;
  updateHealthTicks(element.parts.ticks, unit.maxHealth);
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

function refreshStatusLagElement(unit, dt = 0) {
  const element = unit.statusElement;
  if (!element?.parts) return;
  const hpRatio = clamp(unit.health / unit.maxHealth, 0, 1);
  updateHealthLag(unit, hpRatio, dt);
  element.parts.healthLoss.style.transform = `scaleX(${unit.healthLagRatio})`;
  element.parts.healthLoss.hidden = unit.healthLagRatio <= hpRatio + 0.006;
  unit.statusLagActive = unit.healthLagRatio > hpRatio + 0.006 || unit.healthLagDelay > 0;
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

function updateHealthTicks(ticks, maxHealth) {
  if (!ticks) return;
  const scale = healthTickScale(maxHealth);
  ticks.style.setProperty('--health-tick-step', `${scale.stepPercent}%`);
  ticks.style.setProperty('--health-tick-color', scale.color);
}

function healthTickScale(maxHealth) {
  const health = Math.max(1, maxHealth ?? 1);
  if (health > 5000) {
    return { color: '#62d56f', stepPercent: Math.min(100, 500 / health * 100) };
  }
  if (health >= 500) {
    return { color: '#b56cff', stepPercent: Math.min(100, 100 / health * 100) };
  }
  if (health >= 50) {
    return { color: '#ffd45f', stepPercent: Math.min(100, 25 / health * 100) };
  }
  return { color: '#120f0d', stepPercent: Math.min(100, 5 / health * 100) };
}

function formatEnchantmentStatus(enchantment) {
  return `【${enchantment.name}${Math.max(1, Math.floor(enchantment.level ?? 1))}】`;
}

function wrapEnchantmentStatuses(statuses) {
  return statuses.join('');
}
