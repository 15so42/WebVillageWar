import * as THREE from 'three';
import { BUFF_DEFINITIONS, TEAMS, UNIT_DEFINITIONS } from '../data/gameData.js';
import { basicMat, mat } from '../art/lowpoly.js';
import { createSoftParticleSprite } from '../art/vfxMaterials.js';
import { createUnitModel, updateUnitAnimation } from '../art/visualRegistry.js';
import { AttributeSet, bindAttributeGetter } from '../systems/AttributeSet.js';
import { scaleResourceAfterMaximumChange } from '../systems/unitResourceSync.js';
import { isHostileEnemy } from '../systems/unitTeam.js';
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
    this.workerStandby = false;
    this.workerCombatMode = 'fight';
    // 返回位置：单位追击/作战结束后会回到这里（出生点或上一个移动目的地）。
    // 不再有"驻守模式"和追击半径，追击无视距离，结束后统一回到该点。
    this.homePoint = null;
    this.selected = false;
    this.selectedByPlayerId = null;
    this.networkSelectionRing = null;
    this.supportCooldowns = new Map();
    this.target = null;
    this.alive = true;
    this.visualState = 'idle';
    this.buffs = new Map();
    this.enchantments = new Map();
    // 由符文石系统管理的附魔 id 集合：RuneStoneSystem.syncUnitEnchantments 用它
    // 区分「石头挂上的附魔」和「其他系统挂上的 Buff」，只回收自己那部分。
    this.runeEnchantmentIds = new Set();
    this.maxEnchantmentSlots = 5;
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

  /**
   * 真正意义上的敌方单位。判定逻辑在 `systems/unitTeam.js`——
   * 那里是自由函数，因为测试与联机镜像里存在大量普通对象充当单位。
   */
  get isHostileEnemy() {
    return isHostileEnemy(this);
  }

  addBuff(id, definition = BUFF_DEFINITIONS[id], overrides = {}) {
    if (!definition) return null;
    // 符文石专用覆盖标记，只作用于本次调用，不能写进 Buff 实例：
    // - absoluteLevel：等级就是 overrides.level，不再与已有等级叠加（符文石等级由魔力成长决定）。
    // - ignoreEnchantmentSlots：跳过附魔槽上限拦截，容量由 RuneStoneSystem 自己校验（符文背包）。
    const absoluteLevel = overrides.absoluteLevel === true;
    const ignoreEnchantmentSlots = overrides.ignoreEnchantmentSlots === true;
    const buffOverrides = (absoluteLevel || ignoreEnchantmentSlots)
      ? stripRuneBuffOverrides(overrides)
      : overrides;
    const existing = this.buffs.get(id);
    const isEnchantment = definition.category === 'enchantment';
    if (
      isEnchantment &&
      !existing &&
      !ignoreEnchantmentSlots &&
      this.enchantments.size >= Math.max(0, Math.floor(this.maxEnchantmentSlots ?? 5))
    ) {
      return null;
    }
    const incomingLevel = resolveIncomingBuffLevel(definition, buffOverrides);
    const existingLevel = Math.max(1, existing?.level ?? 1);
    const level = absoluteLevel
      ? incomingLevel
      : (existing && isEnchantment ? existingLevel + incomingLevel : incomingLevel);
    const duration = buffOverrides.duration ?? definition.duration ?? 0;
    if (existing && !isEnchantment && level <= existingLevel) {
      existing.remaining = refreshBuffDuration(existing.remaining, duration);
      refreshBuffSource(existing, buffOverrides);
      return existing;
    }

    const damagePerSecond = resolveBuffNumber('damagePerSecond', definition, buffOverrides);
    const maxHealthDamagePercentPerSecond = resolveBuffNumber(
      'maxHealthDamagePercentPerSecond',
      definition,
      buffOverrides
    );
    const healPerSecond = resolveBuffNumber('healPerSecond', definition, buffOverrides);
    const runtimeState = preserveEnchantmentRuntimeState(existing, id, isEnchantment);
    const previousMaxDurability = this.weapon?.maxDurability ?? 0;
    this.attributes.removeModifiersBySource(buffModifierSource(id));
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:body-bonus`);
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:focus-range`);
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:nearby`);
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:advantage`);
    const instance = {
      ...definition,
      ...buffOverrides,
      ...runtimeState,
      id,
      level,
      ...(damagePerSecond !== null ? { damagePerSecond } : {}),
      ...(maxHealthDamagePercentPerSecond !== null ? { maxHealthDamagePercentPerSecond } : {}),
      ...(healPerSecond !== null ? { healPerSecond } : {}),
      source: resolveBuffSource(existing, buffOverrides),
      remaining: isEnchantment
        ? refreshBuffDuration(existing?.remaining, duration)
        : duration,
      tickTimer: buffOverrides.tickTimer
        ?? existing?.tickTimer
        ?? buffOverrides.tickInterval
        ?? definition.tickInterval
        ?? 0
    };
    // 石头关联必须显式定优先级：调用方传了就用新的（石头换了一块），
    // 没传就沿用旧实例身上的。丢掉它会让这个 Buff 再也找不到自己的石头，
    // 于是凯旋的成长无处可写——而且是静默失效，不会报错。
    const runeStoneId = buffOverrides.runeStoneId ?? existing?.runeStoneId ?? null;
    if (runeStoneId != null && runeStoneId !== '') {
      instance.runeStoneId = String(runeStoneId);
    } else {
      delete instance.runeStoneId;
    }
    this.buffs.set(id, instance);
    this.attributes.addModifiers(instance.modifiers, buffModifierSource(id), {
      level: instance.level,
      buff: instance,
      owner: this
    });
    restoreEnchantmentRuntimeModifiers(this, instance, isEnchantment);
    syncWeaponDurabilityAfterMaximumChange(this, previousMaxDurability);
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
    const previousMaxDurability = this.weapon?.maxDurability ?? 0;
    this.buffs.delete(id);
    this.attributes.removeModifiersBySource(buffModifierSource(id));
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:soul-bonus`);
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:body-bonus`);
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:focus-range`);
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:nearby`);
    this.attributes.removeModifiersBySource(`${buffModifierSource(id)}:advantage`);
    syncWeaponDurabilityAfterMaximumChange(this, previousMaxDurability);
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

  restoreHealth(amount, options = {}) {
    const incoming = Math.max(0, Number(amount) || 0);
    const previousHealth = this.health;
    this.health = clamp(this.health + incoming, 0, this.maxHealth);
    const healed = this.health - previousHealth;
    if (this.health !== previousHealth) {
      this.statusUiDirty = true;
    }
    const overflow = Math.max(0, incoming - healed);
    if (overflow > 0.001 && this.alive !== false) {
      this.game?.buffs?.onOverheal?.(this, overflow, options.source ?? null);
    }
    return healed;
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
      this.game?.syncEquippedWeaponDurabilityToBag?.(this);
    }
    return this.weapon.durability - previousDurability;
  }

  spendDurability(amount) {
    if (amount <= 0) return 0;
    const previousDurability = this.weapon.durability;
    this.weapon.durability = clamp(this.weapon.durability - amount, 0, this.weapon.maxDurability);
    if (this.weapon.durability !== previousDurability) {
      this.statusUiDirty = true;
    }
    if (previousDurability > 0.001 && this.weapon.durability <= 0.001) {
      this.game?.buffs?.durabilityDepleted?.(this);
    }
    this.game?.syncEquippedWeaponDurabilityToBag?.(this);
    return previousDurability - this.weapon.durability;
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
    // 活动魔力每帧都在变，且不经过任何置脏入口，这里补一次差异检查
    // （普通单位无 manaCapacity，这一步是纯比较，不会产生 DOM 写入）
    markActivityManaDirty(this);
    if (!this.underConstruction) {
      updateUnitAnimation(this, dt);
    }
    updateEnchantHaloVisual(this, dt);
    this.groundShadow.visible = this.alive;
  }

  updateNetworkVisual(dt) {
    markActivityManaDirty(this);
    if (!this.underConstruction) {
      // The Host chooses visualState/one-shot animations. The mirror only advances
      // that received pose for rendering and never derives movement or combat state.
      updateUnitAnimation(this, dt);
    }
    updateEnchantHaloVisual(this, dt);
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
    const damageContext = {
      target: this,
      source: options.source ?? null,
      damage: Math.max(0, amount),
      bypassShield: options.bypassShield === true,
      damageTypes: options.damageTypes instanceof Set
        ? options.damageTypes
        : new Set(options.damageTypes ?? [])
    };
    if (!damageContext.bypassShield && this.shield > 0.001) {
      this.game?.buffs?.beforeShieldDamage?.(damageContext);
    }
    const incoming = Math.max(0, damageContext.damage);
    const previousHealth = this.health;
    const absorbed = damageContext.bypassShield ? 0 : Math.min(this.shield, incoming);
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
    physicalAttack: definition.physicalAttack ?? 0,
    magicAttack: definition.magicAttack ?? 0,
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
  bindAttributeGetter(unit, 'physicalAttack', 'physicalAttack');
  bindAttributeGetter(unit, 'magicAttack', 'magicAttack');
  Object.defineProperty(unit, 'attackDamage', {
    configurable: true,
    enumerable: true,
    get() {
      return this.definition.attackDamageType === 'magic'
        ? this.magicAttack
        : this.physicalAttack;
    }
  });
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

/** 剔除符文石专用的覆盖标记，避免它们被 ...overrides 写进 Buff 实例。 */
function stripRuneBuffOverrides(overrides) {
  const {
    absoluteLevel: _absoluteLevel,
    ignoreEnchantmentSlots: _ignoreEnchantmentSlots,
    ...rest
  } = overrides;
  return rest;
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

function preserveEnchantmentRuntimeState(existing, id, isEnchantment) {
  if (!existing || !isEnchantment) return {};
  const preserved = {};
  copyFiniteRuntimeValue(preserved, existing, 'soulBonus');
  copyFiniteRuntimeValue(preserved, existing, 'bodyForgingBonus');
  copyFiniteRuntimeValue(preserved, existing, 'focusRangeBonus');
  copyFiniteRuntimeValue(preserved, existing, 'judgmentReadyAt');
  copyFiniteRuntimeValue(preserved, existing, 'undyingReadyAt');
  // 凯旋的累计成长不在这里保留：它长在符文石实例上（方案第 8 节）。
  // 在这里再存一份合计值会造出"第二个持有者"，石头转手后两份数字必然打架。
  copyFiniteRuntimeValue(preserved, existing, 'assaultStacks');
  copyFiniteRuntimeValue(preserved, existing, 'shockwaveReadyAt');
  copyFiniteRuntimeValue(preserved, existing, `deathCooldown:${id}`);
  return preserved;
}

function restoreEnchantmentRuntimeModifiers(unit, buff, isEnchantment) {
  if (!isEnchantment || !unit?.attributes || !buff) return;
  // 注意：凯旋（triumph）的成长上限不在这里恢复。它由 RuneStoneSystem 按石头
  // 实例投影成属性修改器（来源 `rune-growth:<石头 id>`），本文件不再持有该数值。

  if (buff.soulBonus > 0) {
    const source = `${buffModifierSource(buff.id)}:soul-bonus`;
    unit.attributes.removeModifiersBySource(source);
    unit.attributes.addModifier({
      stat: 'maxHealth',
      type: 'add',
      amount: buff.soulBonus
    }, source);
  }

  if (buff.bodyForgingBonus > 0) {
    const source = `${buffModifierSource(buff.id)}:body-bonus`;
    unit.attributes.removeModifiersBySource(source);
    unit.attributes.addModifier({
      stat: 'maxHealth',
      type: 'add',
      amount: buff.bodyForgingBonus
    }, source);
  }

  if (buff.focusRangeBonus > 0) {
    unit.attributes.addModifier({
      stat: 'attackRange',
      type: 'add',
      amount: buff.focusRangeBonus
    }, `${buffModifierSource(buff.id)}:focus-range`);
  }
}

function copyFiniteRuntimeValue(target, source, key) {
  if (Number.isFinite(source?.[key])) {
    target[key] = source[key];
  }
}

function syncWeaponDurabilityAfterMaximumChange(unit, previousMaxDurability) {
  if (!unit?.weapon || !Number.isFinite(previousMaxDurability)) return;
  unit.weapon.durability = scaleResourceAfterMaximumChange(
    unit.weapon.durability,
    previousMaxDurability,
    unit.weapon.maxDurability
  );
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
    mat('#ff823d', { emissive: '#ff4a1a', emissiveIntensity: 0.7 }).clone()
  );
  const thorns = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.026, 5, 24),
    mat('#79d27a', { emissive: '#275f2c', emissiveIntensity: 0.45 }).clone()
  );
  fire.rotation.x = Math.PI / 2;
  thorns.rotation.x = Math.PI / 2;
  fire.position.y = 0.14;
  thorns.position.y = 0.18;
  fire.userData.enchantment = 'fire';
  thorns.userData.enchantment = 'thorns';
  const solarFlare = new THREE.Group();
  solarFlare.userData.enchantment = 'solarFlare';
  solarFlare.userData.isSolarFlameAura = true;
  solarFlare.userData.age = 0;
  const solarParticles = [];
  // 烈阳光晕：范围 +20%、密度 +50%（8 → 12 粒）
  for (let index = 0; index < 12; index += 1) {
    const particle = createSoftParticleSprite(index % 2 === 0 ? '#ffd95a' : '#ff9d32', {
      falloff: 'tight',
      opacity: 0.7,
      depthTest: true,
      toneMapped: false
    });
    particle.userData.phase = index / 12;
    particle.userData.orbitRadius = 0.41 + (index % 3) * 0.11;
    particle.userData.baseHeight = 0.28 + (index % 4) * 0.18;
    particle.userData.baseScale = 0.16 + (index % 3) * 0.045;
    particle.userData.orbitSpeed = 1.1 + (index % 4) * 0.16;
    solarParticles.push(particle);
    solarFlare.add(particle);
  }
  solarFlare.userData.particles = solarParticles;
  // 热扰动层：半透明橙黄"热浪"细条快速向上蒸腾、横向扭曲，模拟烈日下的空气抖动
  const heatRibbons = [];
  for (let index = 0; index < 8; index += 1) {
    const ribbon = createSoftParticleSprite('#ffd9a0', {
      falloff: 'tight',
      opacity: 0,
      depthTest: true,
      toneMapped: false
    });
    ribbon.userData.phase = index / 8;
    ribbon.userData.orbitRadius = 0.3 + (index % 3) * 0.16;
    ribbon.userData.baseHeight = 0.34 + (index % 4) * 0.2;
    ribbon.userData.baseScale = new THREE.Vector2(
      0.09 + (index % 3) * 0.035,
      0.55 + (index % 4) * 0.18
    );
    heatRibbons.push(ribbon);
    solarFlare.add(ribbon);
  }
  solarFlare.userData.heatRibbons = heatRibbons;
  group.add(fire, thorns, solarFlare);
  group.visible = false;
  return group;
}

function updateEnchantHaloVisual(unit, dt) {
  const delta = Math.max(0, Number(dt) || 0);
  refreshEnchantHalo(unit);
  unit.enchantHalo.rotation.y += delta * 2.1;
  unit.enchantHalo.visible = unit.enchantments.size > 0;
  const solarFlare = unit.enchantHalo.children.find((child) => child.userData.isSolarFlameAura);
  if (!solarFlare?.visible) return;
  solarFlare.userData.age = (solarFlare.userData.age ?? 0) + delta;
  const age = solarFlare.userData.age;
  solarFlare.userData.particles.forEach((particle) => {
    const phase = particle.userData.phase;
    const cycle = (age * 0.68 + phase) % 1;
    const angle = phase * Math.PI * 2 + age * particle.userData.orbitSpeed;
    const radius = particle.userData.orbitRadius * (0.9 + Math.sin((cycle + phase) * Math.PI * 2) * 0.1);
    particle.position.set(
      Math.cos(angle) * radius,
      particle.userData.baseHeight + cycle * 0.58,
      Math.sin(angle) * radius
    );
    const envelope = Math.sin(cycle * Math.PI);
    const scale = particle.userData.baseScale * (0.72 + envelope * 0.7);
    particle.scale.set(scale, scale * 1.3, 1);
    particle.material.opacity = 0.18 + envelope * 0.62;
  });
  // 热浪：每条约 0.8 秒一轮上浮，横向正弦扭曲+纵向拉长，透明度随升腾先增后减
  const heatRibbons = solarFlare.userData.heatRibbons ?? [];
  heatRibbons.forEach((ribbon) => {
    const phase = ribbon.userData.phase;
    const cycle = (age * 0.85 + phase) % 1;
    const angle = phase * Math.PI * 2 + age * (1.05 + (phase % 3) * 0.24);
    ribbon.position.set(
      Math.cos(angle) * ribbon.userData.orbitRadius + Math.sin(age * 3.4 + phase * 7) * 0.16,
      ribbon.userData.baseHeight + cycle * 1.35,
      Math.sin(angle) * ribbon.userData.orbitRadius + Math.cos(age * 2.6 + phase * 5) * 0.16
    );
    const envelope = Math.sin(cycle * Math.PI) ** 0.85;
    ribbon.scale.set(
      ribbon.userData.baseScale.x * (0.8 + envelope * 0.75),
      ribbon.userData.baseScale.y * (0.7 + envelope * 0.85),
      1
    );
    ribbon.material.opacity = 0.035 + envelope * 0.15;
  });
}

function visualFootprintSize(root) {
  if (!root) return null;
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return null;
  const size = new THREE.Vector3();
  box.getSize(size);
  return size;
}

function createUnitGroundShadow(unit) {
  const custom = unit.definition?.art?.groundShadow;
  let width;
  let depth;
  if (Number.isFinite(custom?.width) && Number.isFinite(custom?.depth)) {
    width = custom.width;
    depth = custom.depth;
  } else if (custom?.fromModel) {
    const size = visualFootprintSize(unit.visualRoot);
    const pad = Number.isFinite(custom.pad) ? custom.pad : 0.56;
    width = Math.max(0.26, (size?.x ?? 0.6) * pad);
    depth = Math.max(0.22, (size?.z ?? 0.52) * pad);
  } else {
    const radius = Number.isFinite(unit.collisionRadius)
      ? unit.collisionRadius
      : unit.definition.role === 'ranged' ? 0.36 : 0.42;
    width = clamp(radius * (unit.isBuilding ? 2.5 : 2.05), 0.56, unit.isBuilding ? 2.4 : 1.65);
    depth = clamp(radius * (unit.isBuilding ? 1.8 : 1.35), 0.4, unit.isBuilding ? 1.65 : 1.12);
  }
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
    <div class="world-player-name" hidden></div>
    <div class="world-health-bar">
      <span class="world-health-loss-fill"></span>
      <span class="world-health-fill"></span>
      <span class="world-health-ticks"></span>
      <span class="world-shield-fill" hidden></span>
    </div>
    <div class="world-durability-bar">
      <span class="world-durability-fill"></span>
    </div>
    <div class="world-activity-mana-bar" hidden>
      <span class="world-activity-mana-fill"></span>
    </div>
    <div class="world-enchantments" hidden></div>
  `;
  element.hidden = true;
  element.parts = {
    playerName: element.querySelector('.world-player-name'),
    hp: element.querySelector('.world-health-fill'),
    healthLoss: element.querySelector('.world-health-loss-fill'),
    ticks: element.querySelector('.world-health-ticks'),
    shield: element.querySelector('.world-shield-fill'),
    durability: element.querySelector('.world-durability-fill'),
    // 活动魔力条：排在耐久条正下方（容器是贴底对齐的 grid，最后一行离单位最近）
    activityManaBar: element.querySelector('.world-activity-mana-bar'),
    activityMana: element.querySelector('.world-activity-mana-fill'),
    enchantments: element.querySelector('.world-enchantments')
  };
  return element;
}

function refreshStatusElement(unit, dt = 0) {
  const element = unit.statusElement;
  if (!element?.parts) return;
  const hpRatio = clamp(unit.health / unit.maxHealth, 0, 1);
  const shieldRatio = unit.maxShield > 0 ? clamp(unit.shield / unit.maxShield, 0, 1) : 0;
  const workerDurability = unit.isWorker === true && unit.workerDurabilityRatio != null
    ? clamp(Number(unit.workerDurabilityRatio), 0, 1)
    : null;
  const durabilityRatio = workerDurability != null
    ? workerDurability
    : clamp(unit.weapon.durability / Math.max(1, unit.weapon.maxDurability), 0, 1);
  const showDurabilityBar = unit.isWorker === true
    ? workerDurability != null
    : unit.isBuilding !== true;
  const durBar = element.querySelector('.world-durability-bar');
  if (durBar) durBar.hidden = !showDurabilityBar;
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
  updateActivityManaBar(unit, element);

  const enchantmentStatuses = [...unit.enchantments.values()]
    .filter((enchantment) => !enchantment.hidden)
    .map(formatEnchantmentStatus);
  const enchantmentText = wrapEnchantmentStatuses(enchantmentStatuses);
  element.parts.enchantments.textContent = enchantmentText;
  element.parts.enchantments.hidden = enchantmentText.length === 0;
}

// 活动魔力条上一次真正写入 DOM 的比例。
// 用 WeakMap 挂在单位上而不是写成单位实例字段：这是纯 UI 状态，不该出现在
// 单位快照/存档里；WeakMap 也不会阻止单位被回收。
const activityManaBarRatio = new WeakMap();

// 返回要显示的比例；返回 null 表示这条魔力条应当完全隐藏。
// 普通战斗单位的 manaCapacity 是 undefined → capacity 为 0 → 返回 null，
// 也就是永远走"隐藏"分支，和加这条 UI 之前的表现完全一致。
function activityManaDisplayRatio(unit) {
  const capacity = Math.max(0, Number(unit?.manaCapacity) || 0);
  if (capacity <= 0) return null;
  // 死亡单位也要隐藏，避免残影停在尸体上方
  if (unit.alive === false) return null;
  return clamp((Number(unit.activityMana) || 0) / capacity, 0, 1);
}

// 活动魔力由供能系统每帧直接写单位字段，不会经过其他任何会置脏的入口，
// 所以这里做一次 O(1) 的比例比较：只有值真的变了才请求一次全量刷新。
// 普通单位两个值都是 null，永远不会因此把 statusUiDirty 打开，
// 因此不会破坏其他单位的刷新节流（不能无条件每帧置脏）。
function markActivityManaDirty(unit) {
  const ratio = activityManaDisplayRatio(unit);
  if (ratio === (activityManaBarRatio.get(unit) ?? null)) return;
  unit.statusUiDirty = true;
}

function updateActivityManaBar(unit, element) {
  const bar = element.parts.activityManaBar;
  const fill = element.parts.activityMana;
  if (!bar || !fill) return;
  const ratio = activityManaDisplayRatio(unit);
  if (ratio === (activityManaBarRatio.get(unit) ?? null)) return;
  activityManaBarRatio.set(unit, ratio);
  if (ratio === null) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  fill.style.transform = `scaleX(${ratio})`;
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
