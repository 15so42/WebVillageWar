import * as THREE from 'three';
import { ENCHANTMENTS, UNIT_DEFINITIONS } from '../data/gameData.js';
import { createHealthBar, mat } from '../art/lowpoly.js';
import { createUnitModel, updateUnitAnimation } from '../art/visualRegistry.js';
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
    this.maxHealth = this.definition.maxHealth;
    this.health = this.maxHealth;
    this.weapon = {
      ...this.definition.weapon,
      durability: this.definition.weapon.maxDurability
    };
    this.attackTimer = Math.random() * 0.25;
    this.hitStunTimer = 0;
    this.knockbackVelocity = new THREE.Vector3();
    this.moveGoal = position.clone();
    this.target = null;
    this.alive = true;
    this.visualState = 'idle';
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
    this.healthBar = createHealthBar();
    this.mesh.add(this.healthBar);
    this.enchantHalo = createEnchantHalo();
    this.mesh.add(this.enchantHalo);
  }

  get position() {
    return this.mesh.position;
  }

  addEnchantment(id) {
    const definition = ENCHANTMENTS[id];
    if (!definition) return;
    this.enchantments.set(id, {
      ...definition,
      remaining: definition.duration
    });
    refreshEnchantHalo(this);
  }

  hasEnchantment(id) {
    return this.enchantments.has(id);
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

  applyBurn(seconds, damagePerSecond) {
    this.status.burnTime = Math.max(this.status.burnTime, seconds);
    this.status.burnDamagePerSecond = Math.max(
      this.status.burnDamagePerSecond,
      damagePerSecond
    );
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
