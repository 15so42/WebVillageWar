import * as THREE from 'three';
import { BUFF_DEFINITIONS, ENCHANTMENTS, TEAMS, UNIT_DEFINITIONS } from '../data/gameData.js';
import { createHealthBar, mat } from '../art/lowpoly.js';
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
    this.moveGoal = null;
    this.commandMoveGoal = null;
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
    this.healthBar = createHealthBar({
      hpColor: team === TEAMS.PLAYER ? '#62d56f' : '#e05d56'
    });
    this.mesh.add(this.healthBar);
    this.enchantHalo = createEnchantHalo();
    this.mesh.add(this.enchantHalo);
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
    this.attributes.removeModifiersBySource(buffModifierSource(id));
    const duration = overrides.duration ?? definition.duration ?? 0;
    const instance = {
      ...definition,
      ...overrides,
      id,
      level: overrides.level ?? definition.level ?? existing?.level ?? 1,
      source: overrides.source ?? existing?.source ?? null,
      remaining: duration,
      tickTimer: overrides.tickInterval ?? definition.tickInterval ?? existing?.tickTimer ?? 0
    };
    this.buffs.set(id, instance);
    this.attributes.addModifiers(instance.modifiers, buffModifierSource(id), {
      level: instance.level,
      buff: instance,
      owner: this
    });
    this.clampToAttributeCaps();

    if (definition.category === 'enchantment') {
      this.enchantments.set(id, instance);
      refreshEnchantHalo(this);
    }
    return instance;
  }

  removeBuff(id) {
    const buff = this.buffs.get(id);
    if (!buff) return;
    this.buffs.delete(id);
    this.attributes.removeModifiersBySource(buffModifierSource(id));
    this.clampToAttributeCaps();
    if (this.enchantments.has(id)) {
      this.enchantments.delete(id);
      refreshEnchantHalo(this);
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
    this.health = clamp(this.health + amount, 0, this.maxHealth);
  }

  restoreDurability(amount) {
    this.weapon.durability = clamp(
      this.weapon.durability + amount,
      0,
      this.weapon.maxDurability
    );
  }

  spendDurability(amount) {
    this.weapon.durability = clamp(this.weapon.durability - amount, 0, this.weapon.maxDurability);
  }

  clampToAttributeCaps() {
    this.health = clamp(this.health, 0, this.maxHealth);
    this.weapon.durability = clamp(this.weapon.durability, 0, this.weapon.maxDurability);
  }

  applyBurn(seconds, damagePerSecond) {
    this.addBuff('burning', BUFF_DEFINITIONS.burning, {
      duration: seconds,
      damagePerSecond
    });
  }

  updateVisual(camera, dt) {
    updateUnitAnimation(this, dt);
    const hpRatio = clamp(this.health / this.maxHealth, 0, 1);
    const weaponRatio = clamp(
      this.weapon.durability / this.weapon.maxDurability,
      0,
      1
    );
    const hp = this.healthBar.userData.hp;
    const weapon = this.healthBar.userData.weapon;
    hp.scale.x = hpRatio;
    hp.position.x = (hpRatio - 1) * 0.5;
    weapon.scale.x = weaponRatio;
    weapon.position.x = (weaponRatio - 1) * 0.5;
    this.healthBar.lookAt(camera.position);
    this.enchantHalo.rotation.y += 0.035;
    this.enchantHalo.visible = this.enchantments.size > 0;
  }

  takeRawDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
    }
  }
}

function createUnitAttributes(definition) {
  return new AttributeSet({
    maxHealth: definition.maxHealth,
    moveSpeed: definition.speed,
    attackRange: definition.attackRange,
    attackRate: definition.attackRate,
    attackDamage: definition.damage,
    knockback: definition.knockback,
    aggroRange: definition.aggroRange,
    projectileSpeed: definition.projectileSpeed ?? 0,
    maxDurability: definition.weapon.maxDurability,
    durabilityCost: definition.weapon.durabilityCost
  });
}

function bindUnitAttributeGetters(unit) {
  bindAttributeGetter(unit, 'maxHealth', 'maxHealth');
  bindAttributeGetter(unit, 'moveSpeed', 'moveSpeed');
  bindAttributeGetter(unit, 'attackRange', 'attackRange');
  bindAttributeGetter(unit, 'attackRate', 'attackRate');
  bindAttributeGetter(unit, 'attackDamage', 'attackDamage');
  bindAttributeGetter(unit, 'knockback', 'knockback');
  bindAttributeGetter(unit, 'aggroRange', 'aggroRange');
  bindAttributeGetter(unit, 'projectileSpeed', 'projectileSpeed');
  bindAttributeGetter(unit, 'maxDurability', 'maxDurability');
  bindAttributeGetter(unit, 'durabilityCost', 'durabilityCost');
}

function buffModifierSource(id) {
  return `buff:${id}`;
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

function refreshEnchantHalo(unit) {
  unit.enchantHalo.children.forEach((child) => {
    child.visible = unit.enchantments.has(child.userData.enchantment);
  });
}
