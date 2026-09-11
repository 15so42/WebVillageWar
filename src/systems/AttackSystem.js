import * as THREE from 'three';
import {
  createProjectileModel,
  getAnimationDuration,
  getAnimationEventTime,
  playUnitAnimation,
  resetProjectileVisual,
  stopUnitAnimation,
  updateProjectileVisual,
  updateUnitAnimation
} from '../art/visualRegistry.js';
import { TEAMS } from '../data/gameData.js';
import { UnitEntity } from '../entities/UnitEntity.js';
import { disposeObject3D } from '../utils/dispose.js';
import { clamp, distance2D } from '../utils/math.js';
import {
  getTargetPosition,
  isStaticUnit,
  knockbackImpulseSpeed,
  maxKnockbackVelocity,
  roundProfile,
  resolveProjectileColor,
  targetCombatRadius
} from './combatHelpers.js';

const projectileLaunchPosition = new THREE.Vector3();
const projectileTargetPosition = new THREE.Vector3();
const projectileTrailTargetPosition = new THREE.Vector3();
const projectileForward = new THREE.Vector3(0, 0, 1);
const linearProjectileDirection = new THREE.Vector3();
const vortexDirection = new THREE.Vector3();
const PROJECTILE_TARGET_QUERY_PADDING = 3.2;
const CHAIN_LIGHTNING_COLOR = '#bba8ff';

export class AttackSystem {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    this.pendingAttacks = [];
    this.activeAttackBySourceId = new Map();
    this.projectilePools = new Map();
    this.thunderClouds = [];
    // 冰霜巨魔的冰霜风暴区域（Boss 脚下每秒惩罚近战单位）
    this.frostStorms = [];
    // 风法师飓风：向前缓慢推进的持续伤害 + 吸引区域
    this.hurricanes = [];
    this.nextProjectileNetworkId = 1;
    this.profile = null;
  }

  update(dt, profile = null) {
    this.profile = profile;
    this.updatePendingAttacks(dt);
    this.updateProjectiles(dt);
    this.profile = null;
  }

  tryRangedWeaponAbility(unit, target, targetDistance, targetRadius = 0) {
    const ability = unit.definition.weaponAbility?.rangedProjectile;
    if (!ability || unit.attackTimer > 0 || unit.weapon.durability <= 0) return false;
    const key = ability.key ?? 'rangedProjectile';
    if ((unit.abilityCooldowns.get(key) ?? 0) > 0) return false;
    const range = Math.max(0, ability.range ?? unit.definition.attackRange ?? 0);
    if (targetDistance > range + targetRadius) return false;
    const targetPosition = getTargetPosition(target);
    if (!targetPosition || !this.game.hasSafeSurfaceLine(unit.position, targetPosition)) return false;

    const cooldown = Math.max(0.1, ability.cooldown ?? 7);
    unit.abilityCooldowns.set(key, cooldown);
    unit.attackTimer = Math.max(unit.attackTimer, ability.attackLockSeconds ?? 0.35);
    unit.visualState = 'idle';
    const duration = getAnimationDuration(unit, 'attack');
    const attackDamageType = ability.attackDamageType ?? unit.definition.attackDamageType;
    playUnitAnimation(unit, 'attack', duration, {
      variant: ability.animationVariant ?? 'rangedAbility'
    });
    this.queuePendingAttack({
      source: unit,
      target,
      role: 'rangedAbility',
      eventName: 'release',
      elapsed: 0,
      fired: false,
      fireAt: getAnimationEventTime(unit, 'attack', 'release'),
      duration,
      projectileOverride: {
        projectileType: ability.projectileType ?? 'dagger',
        projectileColor: ability.projectileColor,
        projectileSpeed: ability.projectileSpeed ?? unit.definition.projectileSpeed ?? 13,
        damage: this.game.modifiers.getAttackDamage(unit, attackDamageType) * (ability.damageMultiplier ?? 1),
        attackDamageType,
        knockback: ability.knockback ?? this.game.modifiers.getKnockback(unit),
        damageTypes: ability.damageTypes
      }
    });
    unit.spendDurability(ability.durabilityCost ?? this.game.modifiers.getDurabilityCost(unit));
    return true;
  }

  tryMonsterAbility(unit, target, targetDistance, targetRadius = 0) {
    const ability = unit.definition.monsterAbility;
    if (!ability || unit.attackTimer > 0 || unit.weapon.durability <= 0) return false;
    const key = ability.key ?? `monster:${ability.type ?? 'ability'}`;
    if ((unit.abilityCooldowns.get(key) ?? 0) > 0) return false;
    const range = Math.max(0, ability.range ?? unit.definition.attackRange ?? 0);
    if (targetDistance > range + targetRadius) return false;

    const isImpactAbility =
      ability.type === 'venomTail' ||
      ability.type === 'sandQuake' ||
      ability.type === 'glacialSlam' ||
      ability.type === 'rootQuake';
    const eventName = isImpactAbility ? 'impact' : 'release';
    const abilityPoint = ability.type === 'vineField'
      ? getTargetPosition(target)?.clone?.()
      : null;
    const duration = getAnimationDuration(unit, 'attack');
    unit.abilityCooldowns.set(key, Math.max(0.1, ability.cooldown ?? 8));
    unit.attackTimer = Math.max(
      unit.attackTimer,
      ability.attackLockSeconds ?? Math.min(0.85, duration * 0.72)
    );
    unit.visualState = 'idle';
    playUnitAnimation(unit, 'attack', duration, {
      variant: ability.animationVariant ?? 'monsterAbility'
    });
    if (ability.type === 'rootQuake') {
      this.game.effects.spawnRootWarning(
        unit.position,
        Math.max(1, ability.radius ?? 4.8),
        Math.max(0.2, getAnimationEventTime(unit, 'attack', 'impact'))
      );
    }
    if (ability.type === 'vineField' && abilityPoint) {
      this.game.effects.spawnRootWarning(
        abilityPoint,
        Math.max(1, ability.radius ?? 3.2),
        Math.max(0.2, getAnimationEventTime(unit, 'attack', 'release'))
      );
    }
    this.queuePendingAttack({
      source: unit,
      target,
      role: 'monsterAbility',
      eventName,
      elapsed: 0,
      fired: false,
      fireAt: getAnimationEventTime(unit, 'attack', eventName),
      duration,
      abilityPoint,
      monsterAbility: ability
    });
    unit.spendDurability(ability.durabilityCost ?? this.game.modifiers.getDurabilityCost(unit));
    return true;
  }

  tryAttack(unit, target) {
    if (unit.attackTimer > 0 || unit.weapon.durability <= 0) return false;
    unit.attackTimer = 1 / this.game.modifiers.getAttackRate(unit);
    unit.visualState = 'idle';
    const eventName = unit.definition.role === 'ranged' ? 'release' : 'impact';
    const duration = getAnimationDuration(unit, 'attack');
    playUnitAnimation(unit, 'attack', duration, {
      variant: unit.definition.attackAnimationVariant ?? null
    });
    this.queuePendingAttack({
      source: unit,
      target,
      role: unit.definition.role,
      eventName,
      elapsed: 0,
      fired: false,
      fireAt: getAnimationEventTime(unit, 'attack', eventName),
      duration
    });
    unit.spendDurability(this.game.modifiers.getDurabilityCost(unit));
    return true;
  }

  queuePendingAttack(attack) {
    this.pendingAttacks.push(attack);
    if (attack.source?.id != null) {
      this.activeAttackBySourceId.set(attack.source.id, attack);
    }
  }

  rebuildActiveAttackIndex() {
    this.activeAttackBySourceId.clear();
    for (let i = 0; i < this.pendingAttacks.length; i += 1) {
      const attack = this.pendingAttacks[i];
      if (!isPendingAttackActive(attack)) continue;
      const sourceId = attack.source?.id;
      if (sourceId != null && !this.activeAttackBySourceId.has(sourceId)) {
        this.activeAttackBySourceId.set(sourceId, attack);
      }
    }
  }

  getActiveAttackFor(unit) {
    if (this.profile) {
      this.profile.activeAttackLookups += 1;
    }
    const attack = this.activeAttackBySourceId.get(unit.id);
    if (!isPendingAttackActive(attack) || attack.source !== unit) {
      this.activeAttackBySourceId.delete(unit.id);
      return null;
    }
    return attack;
  }

  updatePendingAttacks(dt) {
    for (let i = this.pendingAttacks.length - 1; i >= 0; i -= 1) {
      const attack = this.pendingAttacks[i];
      if (!attack || !Number.isFinite(attack.elapsed)) {
        if (attack?.source?.id != null && this.activeAttackBySourceId.get(attack.source.id) === attack) {
          this.activeAttackBySourceId.delete(attack.source.id);
        }
        this.pendingAttacks.splice(i, 1);
        continue;
      }
      attack.elapsed += dt;

      if (!attack.fired && attack.elapsed >= attack.fireAt) {
        attack.fired = true;
        this.resolveAttackEvent(attack);
      }

      if (attack.elapsed >= attack.duration) {
        if (attack.source?.id != null && this.activeAttackBySourceId.get(attack.source.id) === attack) {
          this.activeAttackBySourceId.delete(attack.source.id);
        }
        this.pendingAttacks.splice(i, 1);
      }
    }
  }

  cancelPendingAttacksFor(units) {
    if (!units?.length) return;
    const ids = new Set(
      units.map((unit) => unit?.id).filter((id) => id != null)
    );
    if (!ids.size) return;
    for (let i = this.pendingAttacks.length - 1; i >= 0; i -= 1) {
      const attack = this.pendingAttacks[i];
      const sourceId = attack?.source?.id;
      if (sourceId == null || !ids.has(sourceId)) continue;
      if (this.activeAttackBySourceId.get(sourceId) === attack) {
        this.activeAttackBySourceId.delete(sourceId);
      }
      this.pendingAttacks.splice(i, 1);
    }
    ids.forEach((id) => this.activeAttackBySourceId.delete(id));
    units.forEach((unit) => stopUnitAnimation(unit, 'attack'));
  }

  resolveAttackEvent(attack) {
    const { source, target } = attack;
    if (!source.alive) return;
    if (target?.alive === false) return;
    if (attack.monsterAbility) {
      this.resolveMonsterAbility(attack);
      return;
    }
    if (!attack.projectileOverride && target?.position && source.definition.role === 'melee') {
      const allowedRange =
        this.game.modifiers.getAttackRange(source) + targetCombatRadius(target) + 0.85;
      if (distance2D(source.position, target.position) > allowedRange) return;
    }

    if (source.definition.attackBehavior?.type === 'hurricane') {
      this.syncSourcePoseForAttackEvent(attack);
      this.spawnHurricane(source, target, source.definition.attackBehavior);
      return;
    }

    if (source.definition.attackBehavior?.type === 'chainLightning') {
      this.syncSourcePoseForAttackEvent(attack);
      this.resolveChainLightningAttack(source, target, source.definition.attackBehavior);
      this.trySpawnThunderCloud(source, target);
      return;
    }

    if (attack.projectileOverride || (source.definition.role === 'ranged' && target?.alive !== false)) {
      this.syncSourcePoseForAttackEvent(attack);
      this.spawnProjectile(source, target, attack.projectileOverride);
      return;
    }
    this.game.combat.applyAttack(source, target);
    // 冰霜巨魔近战锤击：命中点溅射 + 风冲击波特效
    this.tryBossSplashAttack(source, target);
  }

  resolveChainLightningAttack(source, initialTarget, behavior = {}) {
    if (!initialTarget?.position) return;
    const jumpRange = Math.max(0.1, behavior.jumpRange ?? 4);
    const hitTargetIds = new Set();
    let target = initialTarget;
    let start = this.getProjectileLaunchPosition(source).clone();

    while (target?.alive && target.position) {
      const targetId = chainTargetId(target);
      if (hitTargetIds.has(targetId)) break;
      hitTargetIds.add(targetId);
      const end = chainLightningPoint(target);
      this.game.effects.spawnLightningChain(start, end, {
        color: behavior.color ?? CHAIN_LIGHTNING_COLOR
      });
      this.game.combat.applyAttack(source, target, {
        attackDamageType: 'magic',
        knockback: Math.min(1, this.game.modifiers.getKnockback(source))
      });
      const candidates = this.unitsNear(
        source.team === TEAMS.PLAYER ? TEAMS.ENEMY : TEAMS.PLAYER,
        target.position,
        jumpRange
      );
      target = findNextChainLightningTarget(candidates, target.position, hitTargetIds, jumpRange);
      start = end;
    }
  }

  trySpawnThunderCloud(source, target) {
    if (!hasRuntimeTrait(source, 'thunderCloud') || !target?.position) return false;
    const ability = source.definition.specialAbilities?.thunderCloud;
    if (!ability) return false;
    const key = 'thunderCloud';
    if ((source.abilityCooldowns.get(key) ?? 0) > 0) return false;
    source.abilityCooldowns.set(key, Math.max(0.1, ability.cooldown ?? 15));
    const anchor = target.position.clone();
    const cloud = {
      source,
      anchor,
      position: anchor.clone(),
      age: 0,
      strikeTimer: Math.min(0.55, ability.strikeInterval ?? 1.25),
      ability
    };
    this.thunderClouds.push(cloud);
    this.game.effects.spawnThunderCloud(cloud);
    this.spawnMonsterAbilityText(source, '雷云', '#c9b8ff');
    return true;
  }

  updateThunderClouds(dt) {
    for (let index = this.thunderClouds.length - 1; index >= 0; index -= 1) {
      const cloud = this.thunderClouds[index];
      const ability = cloud.ability ?? {};
      cloud.age += dt;
      const duration = Math.max(0.1, ability.duration ?? 10);
      if (cloud.age >= duration) {
        this.thunderClouds.splice(index, 1);
        continue;
      }
      const driftRadius = Math.max(0, ability.driftRadius ?? 0.85);
      const phase = cloud.age * 0.78 + (cloud.source.id ?? 0) * 0.37;
      cloud.position.set(
        cloud.anchor.x + Math.cos(phase) * driftRadius,
        cloud.anchor.y ?? 0,
        cloud.anchor.z + Math.sin(phase * 1.31) * driftRadius
      );
      cloud.strikeTimer -= dt;
      if (cloud.strikeTimer > 0) continue;
      cloud.strikeTimer += Math.max(0.25, ability.strikeInterval ?? 1.25);
      this.strikeThunderCloud(cloud);
    }
  }

  strikeThunderCloud(cloud) {
    const { source, ability, position } = cloud;
    const targetTeam = source.team === TEAMS.PLAYER ? TEAMS.ENEMY : TEAMS.PLAYER;
    const targets = this.unitsNear(targetTeam, position, Math.max(3.5, ability.strikeRadius ?? 2.2));
    const strikeTarget = findNearestTarget(targets, position);
    if (!strikeTarget?.position) return;
    const damage = Math.max(
      1,
      this.game.modifiers.getAttackDamage(source, 'magic') * Math.max(0, ability.damageMultiplier ?? 0.7)
    );
    const strikeRadius = Math.max(0.1, ability.strikeRadius ?? 2.2);
    const skyPosition = position.clone();
    skyPosition.y += Math.max(2.6, ability.height ?? 5.1);
    this.unitsNear(targetTeam, strikeTarget.position, strikeRadius).forEach((target) => {
      if (!target?.alive || !target.position) return;
      this.game.combat.applyDamage(target, damage, source, 0, {
        damage,
        source,
        target,
        defenseDamageType: 'magic',
        isAttack: false,
        isExplosionDamage: false,
        damageNumberHeight: target.projectileHitHeight ?? 1.45,
        damageNumberDuration: 0.72
      });
      this.game.effects.spawnLightningChain(skyPosition, chainLightningPoint(target), {
        color: '#e8e2ff',
        duration: 0.28
      });
    });
  }

  // 风法师飓风：向前缓慢推进的持续伤害区域，每 tickInterval 对范围内敌人造成魔法伤害并吸引聚拢。
  spawnHurricane(source, target, behavior = {}) {
    if (!source?.position) return null;
    const targetPosition = target?.position ? getTargetPosition(target) : null;
    const direction = new THREE.Vector3();
    if (targetPosition) {
      direction.set(targetPosition.x - source.position.x, 0, targetPosition.z - source.position.z);
    } else {
      direction.set(Math.sin(source.mesh?.rotation?.y ?? 0), 0, Math.cos(source.mesh?.rotation?.y ?? 0));
    }
    if (direction.lengthSq() < 0.0001) direction.set(0, 0, -1);
    direction.normalize();
    const startOffset = Math.max(0, behavior.startOffset ?? 1.2);
    const groundY = this.game.groundHeightAt?.(source.position) ?? source.position.y ?? 0;
    const start = new THREE.Vector3(
      source.position.x + direction.x * startOffset,
      groundY,
      source.position.z + direction.z * startOffset
    );
    const baseDuration = Math.max(0.5, behavior.duration ?? 6);
    const hurricane = {
      source,
      team: source.team,
      start,
      position: start.clone(),
      direction,
      speed: Math.max(0.1, behavior.advanceSpeed ?? 1.5),
      radius: Math.max(0.5, behavior.radius ?? 2.5),
      duration: hasRuntimeTrait(source, 'hurricaneDuration') ? baseDuration * 1.4 : baseDuration,
      tickInterval: Math.max(0.1, behavior.tickInterval ?? 0.4),
      tickDamageMultiplier: Math.max(0, behavior.tickDamageMultiplier ?? 1),
      pullStrength: Math.max(0, behavior.pullStrength ?? 1.6),
      color: behavior.color ?? '#bfeaf0',
      accent: behavior.accent ?? '#eafcff',
      age: 0,
      tickTimer: 0
    };
    this.hurricanes.push(hurricane);
    this.game.effects.spawnHurricane(hurricane);
    return hurricane;
  }

  updateHurricanes(dt) {
    for (let index = this.hurricanes.length - 1; index >= 0; index -= 1) {
      const hurricane = this.hurricanes[index];
      hurricane.age += dt;
      if (hurricane.age >= hurricane.duration || !hurricane.source?.alive) {
        this.hurricanes.splice(index, 1);
        continue;
      }
      // 向前匀速推进，位置只由 start + direction × speed × age 决定，与客户端视觉公式一致
      const travel = hurricane.speed * hurricane.age;
      hurricane.position.x = hurricane.start.x + hurricane.direction.x * travel;
      hurricane.position.z = hurricane.start.z + hurricane.direction.z * travel;
      hurricane.position.y = this.game.groundHeightAt?.(hurricane.position) ?? hurricane.start.y;
      hurricane.tickTimer -= dt;
      if (hurricane.tickTimer > 0) continue;
      hurricane.tickTimer += hurricane.tickInterval;
      this.tickHurricane(hurricane);
    }
  }

  tickHurricane(hurricane) {
    const { source } = hurricane;
    const targetTeam = source.team === TEAMS.PLAYER ? TEAMS.ENEMY : TEAMS.PLAYER;
    const victims = this.unitsNear(targetTeam, hurricane.position, hurricane.radius);
    if (!victims.length) return;
    const damage = Math.max(
      1,
      this.game.modifiers.getAttackDamage(source, 'magic') * hurricane.tickDamageMultiplier
    );
    let damaged = false;
    victims.forEach((unit) => {
      if (!unit?.alive || unit.underConstruction || !unit.position) return;
      // 默认命中特效（不 skipHitEffect）即“附带攻击特效”；跳过受击动画避免高频抽抽
      this.game.combat.applyDamage(unit, damage, source, 0, {
        damage,
        source,
        target: unit,
        defenseDamageType: 'magic',
        isAttack: false,
        skipHitAnimation: true,
        damageNumberHeight: unit.projectileHitHeight ?? 1.45,
        damageNumberDuration: 0.6
      });
      damaged = true;
      applyVortexPull(this.game, unit, hurricane.position, hurricane.pullStrength);
    });
    // 专精：风暴回息——飓风造成伤害时 3% 概率重置风法师攻击冷却
    if (
      damaged
      && hasRuntimeTrait(source, 'hurricaneCooldownReset')
      && Math.random() < 0.03
    ) {
      source.attackTimer = 0;
    }
  }

  tryLightningSiphon(unit) {
    if (!hasRuntimeTrait(unit, 'lightningSiphon')) return false;
    const ability = unit.definition.specialAbilities?.lightningSiphon;
    if (!ability || (unit.weapon?.durability ?? 0) >= (ability.triggerDurability ?? 10)) return false;
    const key = 'lightningSiphon';
    if ((unit.abilityCooldowns.get(key) ?? 0) > 0) return false;
    const targetTeam = unit.team === TEAMS.PLAYER ? TEAMS.ENEMY : TEAMS.PLAYER;
    const target = findNearestTarget(
      this.unitsNear(targetTeam, unit.position, Math.max(0.1, ability.range ?? 4.5))
        .filter((candidate) => (candidate.weapon?.durability ?? 0) > 0.01),
      unit.position
    );
    if (!target) return false;
    const missing = Math.max(0, unit.weapon.maxDurability - unit.weapon.durability);
    const amount = Math.min(ability.amount ?? 10, missing, target.weapon.durability);
    if (amount <= 0.01) return false;
    target.spendDurability(amount);
    const restored = unit.restoreDurability(amount);
    if (restored <= 0.01) return false;
    unit.abilityCooldowns.set(key, Math.max(0.1, ability.cooldown ?? 3));
    this.game.effects.spawnLightningChain(chainLightningPoint(target), chainLightningPoint(unit), {
      color: '#d8c7ff',
      duration: 0.32
    });
    this.game.effects.spawnDamageNumber(unit.position, restored, {
      text: `+${Math.round(restored)} 耐久`,
      color: '#d8c7ff',
      stroke: '#27213e',
      height: unit.projectileHitHeight ?? 1.55,
      duration: 0.68
    });
    return true;
  }

  resolveMonsterAbility(attack) {
    const { source, target, abilityPoint, monsterAbility: ability } = attack;
    if (!ability || !target) return;
    if (ability.type === 'scatterShot') {
      this.fireScatterShot(source, target, ability);
      return;
    }
    if (ability.type === 'lanternBolt') {
      this.fireLanternBolt(source, target, ability);
      return;
    }
    if (ability.type === 'mireJavelin') {
      this.fireMireJavelin(source, target, ability);
      return;
    }
    if (ability.type === 'frostNova') {
      this.castFrostNova(source, target, ability);
      return;
    }
    if (ability.type === 'frostStorm') {
      this.castFrostStorm(source, ability);
      return;
    }
    if (ability.type === 'frostPounce') {
      this.castFrostPounce(source, target, ability);
      return;
    }
    if (ability.type === 'boneWard') {
      this.castBoneWard(source, ability);
      return;
    }
    if (ability.type === 'venomTail') {
      this.strikeVenomTail(source, target, ability);
      return;
    }
    if (ability.type === 'sandQuake') {
      this.castSandQuake(source, ability);
      return;
    }
    if (ability.type === 'glacialSlam') {
      this.castGlacialSlam(source, ability);
      return;
    }
    if (ability.type === 'vineField') {
      this.castVineField(source, abilityPoint ?? target, ability);
      return;
    }
    if (ability.type === 'rootQuake') {
      this.castRootQuake(source, ability);
    }
  }

  fireScatterShot(source, target, ability) {
    const targetPosition = getTargetPosition(target);
    if (!targetPosition) return;
    const count = Math.max(1, Math.min(5, Math.floor(ability.projectileCount ?? 3)));
    const spread = Math.max(0, ability.spread ?? 0.28);
    const baseDirection = targetPosition.clone().sub(source.position);
    baseDirection.y = 0;
    if (baseDirection.lengthSq() < 0.0001) return;
    baseDirection.normalize();
    const maxDistance = Math.max(ability.range ?? source.definition.attackRange ?? 8, 1);
    for (let index = 0; index < count; index += 1) {
      const angle = (index - (count - 1) * 0.5) * spread;
      const direction = baseDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      this.spawnProjectile(source, target, {
        projectileType: source.definition.projectileType ?? 'frostArrow',
        projectileColor: source.definition.projectileColor ?? '#bcecff',
        projectileSpeed: source.definition.projectileSpeed ?? 15,
        damage: this.game.modifiers.getAttackDamage(source, source.definition.attackDamageType) * 0.5,
        attackDamageType: source.definition.attackDamageType,
        knockback: this.game.modifiers.getKnockback(source) * 0.34,
        projectileDirection: direction,
        projectilePierce: {
          radius: 0.38,
          maxDistance,
          maxHits: 1
        },
        onHit: (hitTarget) => this.applyStatus(hitTarget, ability.statusBuffId ?? 'frostSnared', source, {
          duration: ability.slowDuration ?? 2.5
        })
      });
    }
    this.spawnMonsterAbilityText(source, '散射', '#bcecff');
  }

  fireLanternBolt(source, target, ability) {
    this.spawnProjectile(source, target, {
      projectileType: source.definition.projectileType ?? 'lanternBolt',
      projectileColor: source.definition.projectileColor ?? '#d7b66d',
      projectileSpeed: source.definition.projectileSpeed ?? 18,
      damage: Math.max(
        1,
        ability.damage ?? this.game.modifiers.getAttackDamage(source, source.definition.attackDamageType) * 1.4
      ),
      attackDamageType: source.definition.attackDamageType,
      knockback: this.game.modifiers.getKnockback(source) * 0.82,
      projectilePierce: {
        radius: 0.5,
        maxDistance: Math.max(ability.range ?? source.definition.attackRange ?? 10, 1),
        maxHits: Math.max(1, Math.floor(ability.projectilePierce ?? 3))
      },
      onHit: (hitTarget) => this.applyStatus(hitTarget, 'marked', source, {
        duration: ability.markDuration ?? 5
      })
    });
    this.spawnMonsterAbilityText(source, '墓灯贯射', '#d7b66d');
  }

  fireMireJavelin(source, target, ability) {
    this.spawnProjectile(source, target, {
      projectileType: source.definition.projectileType ?? 'mireJavelin',
      projectileColor: source.definition.projectileColor ?? '#8abf68',
      projectileSpeed: source.definition.projectileSpeed ?? 16,
      damage: Math.max(
        1,
        ability.damage ?? this.game.modifiers.getAttackDamage(source, source.definition.attackDamageType) * 1.45
      ),
      attackDamageType: source.definition.attackDamageType,
      knockback: this.game.modifiers.getKnockback(source) * 0.72,
      projectilePierce: {
        radius: 0.46,
        maxDistance: Math.max(ability.range ?? source.definition.attackRange ?? 10, 1),
        maxHits: Math.max(1, Math.floor(ability.projectilePierce ?? 2))
      },
      onHit: (hitTarget) => this.applyStatus(hitTarget, 'poisoned', source, {
        duration: ability.poisonDuration ?? 4.5
      })
    });
    this.spawnMonsterAbilityText(source, '瘴藤贯矛', '#a1d56c');
  }

  // 冰霜风暴：Boss 脚下持续冰风区域——范围内敌人每秒受到攻击力×1 的魔法伤害，
  // 并叠加冰风减速（移速/攻速 -40%），不附带攻击特效与击退
  castFrostStorm(source, ability) {
    if (!source?.position) return;
    const storm = {
      source,
      position: source.position.clone(),
      age: 0,
      tickTimer: 0,
      radius: Math.max(1, ability.radius ?? 4.2),
      duration: Math.max(0.5, ability.duration ?? 3.5),
      tickSeconds: Math.max(0.2, ability.tickSeconds ?? 1),
      slowDuration: Math.max(0.5, ability.slowDuration ?? 3),
      ability
    };
    this.frostStorms.push(storm);
    this.game.effects.spawnFrostStorm(storm.position, storm.radius, storm.duration, {
      color: '#9bdcff',
      accent: '#d5f4ff'
    }, storm);
    this.spawnMonsterAbilityText(source, '冰霜风暴', '#9bdcff');
  }

  // 霜牙扑击：狼王朝目标方向瞬身前扑，路径与落点范围的敌人受击并寒咬
  castFrostPounce(source, target, ability) {
    if (!source?.position || !target?.position) return;
    const start = source.position.clone();
    const end = getTargetPosition(target).clone();
    const horizontal = new THREE.Vector3(end.x - start.x, 0, end.z - start.z);
    const travelDistance = Math.min(horizontal.length(), Math.max(1, ability.range ?? 6));
    const direction = horizontal.lengthSq() > 0.0001 ? horizontal.clone().normalize() : new THREE.Vector3(0, 0, -1);
    const landing = start.clone().addScaledVector(direction, travelDistance);
    const baseDamage = Math.max(1, ability.damage ?? (
      this.game.modifiers?.getAttackDamage?.(source, source.definition?.attackDamageType ?? 'physical') ?? 13
    ));
    const pathDamage = baseDamage * Math.max(0.1, ability.damageMultiplier ?? 0.9);
    const dragDistance = Math.max(0.1, Math.min(travelDistance * 0.06, 1.1));
    const slowDuration = Math.max(0.1, ability.slowDuration ?? 1.5);
    const pathRadius = Math.max(0.5, ability.pathRadius ?? 1.3);
    const enemyTeam = source.team === TEAMS.PLAYER ? TEAMS.ENEMY : TEAMS.PLAYER;
    const victims = this.unitsNear(enemyTeam, landing, Math.max(2.4, ability.impactRadius ?? 1.9) + travelDistance);
    victims.forEach((unit) => {
      if (!unit?.alive || !unit.position) return;
      // 路径上的敌人：到 start→landing 线段距离 <= pathRadius
      const distance = distanceToSegment2D(unit.position, start, landing);
      const inPath = distance <= pathRadius || distance2D(unit.position, landing) <= (ability.impactRadius ?? 1.9);
      if (!inPath) return;
      this.game.combat.applyDamage(unit, pathDamage, source, 0, {
        damage: pathDamage,
        source,
        target: unit,
        defenseDamageType: 'physical',
        isAttack: false,
        skipHitAnimation: true,
        damageNumberHeight: unit.projectileHitHeight ?? 1.45,
        damageNumberDuration: 0.62
      });
      this.game.buffs.applyBuff(unit, ability.statusBuffId ?? 'frostSnared', source, {
        duration: slowDuration
      });
      applyKnockbackIfAvailable(this.game, unit, source.position, ability.impactKnockback ?? 2.6, direction, dragDistance);
    });
    // 位移到落点（取可走位置）
    const resolved = this.game.resolveWalkablePoint?.(landing, 0.4) ?? landing;
    source.position.set(resolved.x, this.game.groundHeightAt?.(resolved) ?? resolved.y, resolved.z);
    this.game.effects.spawnFrostPounceTrail(start, source.position, 0.42);
    this.game.effects.spawnRing(source.position, '#bcecff', Math.max(1.4, ability.impactRadius ?? 1.9), 0.52);
    this.spawnMonsterAbilityText(source, '霜牙扑击', '#bcecff');
  }

  // 狼群附魔：狼王每隔一段时间自动召唤一只冰狼
  updateWolfPackSummon(dt) {
    const pool = this.game.enemyUnits ?? [];
    for (let index = 0; index < pool.length; index += 1) {
      const boss = pool[index];
      if (!boss?.alive || boss.type !== 'frostWolfBoss') continue;
      const pack = boss.definition?.monsterAbility ?? {};
      const interval = Math.max(1, pack.summonInterval ?? 7);
      boss.packSummonTimer = (boss.packSummonTimer ?? interval) - dt;
      let summons = 0;
      while (boss.packSummonTimer <= 0 && boss.alive && summons < 3) {
        boss.packSummonTimer += interval;
        const count = Math.max(1, Math.floor(pack.summonCount ?? 1));
        for (let summoned = 0; summoned < count; summoned += 1) {
          this.summonFrostWolf(boss);
        }
        summons += 1;
      }
    }
  }

  summonFrostWolf(boss) {
    if (!boss?.position || !this.game.registerUnit) return null;
    const attemptCount = 8;
    let spawnPosition = null;
    for (let attempt = 0; attempt < attemptCount; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.5 + Math.random() * 1.8;
      const candidate = boss.position.clone();
      candidate.x += Math.cos(angle) * radius;
      candidate.z += Math.sin(angle) * radius;
      candidate.y = this.game.groundHeightAt?.(candidate) ?? 0;
      const resolved = this.game.resolveWalkablePoint?.(candidate, 0.25) ?? candidate;
      if (this.game.isPointWalkable?.(resolved) === false) continue;
      spawnPosition = resolved;
      break;
    }
    if (!spawnPosition) return null;
    const wolf = new UnitEntity({
      type: 'frostWolf',
      team: TEAMS.ENEMY,
      position: spawnPosition
    });
    const force = boss.enemyForce ?? this.game.currentEnemyForce ?? null;
    const difficulty = force?.effectiveDifficulty ?? this.game.effectiveDifficultyForWave?.(force?.index ?? this.game.wave ?? 1) ?? 1;
    this.game.applyEnemyDifficulty?.(wolf, difficulty, force, 0);
    wolf.enemyForce = force ?? null;
    this.game.markEndlessEnemySpawn?.(wolf);
    this.game.attachUnitStatus?.(wolf);
    this.game.registerUnit(wolf);
    this.game.orderEnemyAttack?.(wolf, 0, 1);
    this.game.effects.spawnRing(wolf.position, '#bcecff', 0.7, 0.46);
    this.game.effects.spawnChilledParticles?.(wolf, 3);
    return wolf;
  }

  // 冰川先知：暴风雪由 monsterAbility 调用；这里管理被动冰镜结晶
  updateOracleBossPassives(dt) {
    const pool = this.game.enemyUnits ?? [];
    for (let index = 0; index < pool.length; index += 1) {
      const oracle = pool[index];
      if (!oracle?.alive || oracle.type !== 'frostOracleBoss') continue;
      const ability = oracle.definition?.monsterAbility ?? {};
      oracle.iceMirrorTimer = (oracle.iceMirrorTimer ?? ability.iceMirrorInitialDelay ?? 7) - dt;
      if (oracle.iceMirrorTimer > 0) continue;
      oracle.iceMirrorTimer = Math.max(4, ability.iceMirrorInterval ?? 15);
      const duration = Math.max(1, ability.iceMirrorDuration ?? 6);
      const buff = this.game.buffs.applyBuff(oracle, 'frostMirror', oracle, {
        duration,
        frostMirrorRemaining: Math.max(1, ability.iceMirrorAbsorb ?? 50)
      });
      if (buff) {
        this.game.effects.spawnIceMirrorAura(oracle, duration);
        this.spawnMonsterAbilityText(oracle, '冰镜结晶', '#bcecff');
      }
    }
  }

  // 狼王近战攻击（frostPounce 之外的普通锤/爪击）同样复用滚动逻辑，无额外处理
  updateFrostStorms(dt) {
    for (let index = this.frostStorms.length - 1; index >= 0; index -= 1) {
      const storm = this.frostStorms[index];
      const ability = storm.ability ?? {};
      storm.age += dt;
      if (storm.age >= storm.duration) {
        this.frostStorms.splice(index, 1);
        continue;
      }
      // 追逐模式：风暴朝最近的敌人移动；否则跟随施法者脚下
      if (ability.tracking === 'nearestEnemy') {
        const targetPool = storm.source?.team === TEAMS.PLAYER
          ? this.game.enemyUnits
          : this.game.friendlyUnits;
        const chaseSpeed = Math.max(0.5, ability.chaseSpeed ?? 2.6);
        const candidates = (targetPool ?? []).filter((unit) => (
          unit?.alive && !unit.underConstruction && unit.position
        ));
        let nearest = null;
        let nearestDistance = Infinity;
        for (let i = 0; i < candidates.length; i += 1) {
          const candidate = candidates[i];
          const distance = distance2D(storm.position, candidate.position);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = candidate;
          }
        }
        if (nearest?.position) {
          const targetPoint = nearest.position;
          storm.position.x += Math.sign(targetPoint.x - storm.position.x)
            * Math.min(chaseSpeed * dt, Math.abs(targetPoint.x - storm.position.x));
          storm.position.z += Math.sign(targetPoint.z - storm.position.z)
            * Math.min(chaseSpeed * dt, Math.abs(targetPoint.z - storm.position.z));
        }
      } else {
        // 风暴跟随 Boss 脚下
        storm.position.copy(storm.source.position);
      }
      storm.tickTimer -= dt;
      if (storm.tickTimer > 0) continue;
      storm.tickTimer += storm.tickSeconds;
      const victims = storm.source.team === TEAMS.PLAYER
        ? this.game.enemyUnits
        : this.game.friendlyUnits;
      victims.forEach((unit) => {
        if (!unit?.alive || unit.underConstruction || !unit.position) return;
        if (distance2D(storm.position, unit.position) > storm.radius) return;
        const attack = this.game.modifiers?.getAttackDamage?.(
          storm.source,
          storm.source.definition?.attackDamageType ?? 'physical'
        );
        const damagePerTick = Math.max(1, attack ?? storm.source.definition?.damage ?? 1);
        this.game.combat.applyDamage(unit, damagePerTick, storm.source, 0, {
          damage: damagePerTick,
          source: storm.source,
          target: unit,
          defenseDamageType: 'magic',
          isAttack: false,
          skipHitAnimation: true,
          skipHitEffect: true,
          damageNumberHeight: unit.projectileHitHeight ?? 1.45,
          damageNumberDuration: 0.6
        });
        this.game.buffs.applyBuff(unit, ability.statusBuffId ?? 'frostStorm', storm.source, {
          duration: storm.slowDuration
        });
      });
    }
  }

  // 冰霜巨魔近战锤击溅射：命中点周围敌人受 60% 攻击力范围伤（魔法批次无击退）
  tryBossSplashAttack(source, target) {
    if (!source?.alive || source.type !== 'frostTrollBoss') return false;
    if (!target?.position) return false;
    const splashRadius = Math.max(1, source.collisionRadius ?? 0.72) + 1.9;
    const attack = this.game.modifiers?.getAttackDamage?.(
      source,
      source.definition?.attackDamageType ?? 'physical'
    );
    const splashDamage = Math.max(0.5, (attack ?? source.definition?.damage ?? 11) * 0.6);
    const enemies = source.team === TEAMS.PLAYER
      ? this.game.enemyUnits
      : this.game.friendlyUnits;
    let hitCount = 0;
    enemies.forEach((unit) => {
      if (!unit?.alive || unit === target || unit.underConstruction || !unit.position) return;
      if (distance2D(target.position, unit.position) > splashRadius) return;
      hitCount += 1;
      this.game.combat.applyDamage(unit, splashDamage, source, 0, {
        damage: splashDamage,
        source,
        target: unit,
        defenseDamageType: 'physical',
        isAttack: false,
        skipHitAnimation: true,
        skipHitEffect: true,
        damageNumberHeight: unit.projectileHitHeight ?? 1.45,
        damageNumberDuration: 0.62
      });
    });
    if (hitCount > 0 || target.alive) {
      this.game.effects.spawnHitSplashShockwave(target.position, splashRadius);
    }
    return hitCount > 0;
  }

  castFrostNova(source, target, ability) {
    const center = getTargetPosition(target);
    if (!center) return;
    const radius = Math.max(1, ability.radius ?? 3.4);
    const damage = Math.max(1, ability.damage ?? 6);
    const launch = this.getProjectileLaunchPosition(source).clone();
    const impact = center.clone();
    impact.y += target.projectileHitHeight ?? 1.1;
    this.game.effects.spawnProjectileTrail(launch, impact, '#dcefff', { duration: 0.34, width: 0.1 });
    this.damageTargetsInRadius(source, center, radius, damage, {
      defenseDamageType: 'magic',
      damageTypes: new Set(['undodgeable']),
      knockback: 0.65,
      onHit: (hitTarget) => this.applyStatus(hitTarget, ability.statusBuffId ?? 'frostSnared', source, {
        duration: ability.slowDuration ?? 2.8
      })
    });
    this.game.effects.spawnRing(center, '#dcefff', radius, 0.64);
    this.spawnMonsterAbilityText(source, '霜爆', '#dcefff');
  }

  castBoneWard(source, ability) {
    const radius = Math.max(1, ability.radius ?? 4.5);
    const shieldAmount = Math.max(1, ability.shieldAmount ?? 30);
    const maxTargets = Math.max(1, Math.floor(ability.summonCount ?? 2));
    const candidates = this.unitsNear(source.team, source.position, radius)
      .filter((unit) => unit.alive && !unit.underConstruction)
      .sort((left, right) => shieldRatio(left) - shieldRatio(right));
    if (!candidates.includes(source)) candidates.unshift(source);
    let granted = 0;
    for (const ally of candidates) {
      if (granted >= maxTargets + 1) break;
      const restored = ally.restoreShield?.(shieldAmount) ?? 0;
      if (restored <= 0.01) continue;
      granted += 1;
      this.game.effects.spawnRing(ally.position, '#a8d6c3', 0.74, 0.58);
      this.game.effects.spawnDamageNumber(ally.position, restored, {
        text: `骨盾+${Math.round(restored)}`,
        color: '#c9f1de',
        stroke: '#19392f',
        height: ally.projectileHitHeight ?? 1.55,
        duration: 0.72,
        fontSize: 78,
        baseHeight: 0.48
      });
    }
    this.game.effects.spawnRing(source.position, '#9fd4bc', radius, 0.68);
    this.spawnMonsterAbilityText(source, '骨语护持', '#a8d6c3');
  }

  strikeVenomTail(source, target, ability) {
    const landed = this.game.combat.applyAttack(source, target, {
      damage: Math.max(
        1,
        ability.damage ?? this.game.modifiers.getAttackDamage(source, source.definition.attackDamageType) * 1.25
      ),
      attackDamageType: source.definition.attackDamageType,
      knockback: this.game.modifiers.getKnockback(source) * 1.2,
      damageTypes: new Set(['undodgeable'])
    });
    if (landed && target.alive) {
      this.applyStatus(target, 'poisoned', source, {
        duration: ability.poisonDuration ?? 4
      });
    }
    this.game.effects.spawnRing(target.position, '#78b85a', 0.86, 0.48);
    this.spawnMonsterAbilityText(source, '毒尾穿刺', '#9ac96e');
  }

  castSandQuake(source, ability) {
    const radius = Math.max(1, ability.radius ?? 4.4);
    const damage = Math.max(1, ability.damage ?? 14);
    this.damageTargetsInRadius(source, source.position, radius, damage, {
      defenseDamageType: 'physical',
      damageTypes: new Set(['undodgeable']),
      knockback: this.game.modifiers.getKnockback(source) * 1.3,
      onHit: (hitTarget) => this.applyStatus(hitTarget, 'stunned', source, {
        duration: ability.stunDuration ?? 1
      })
    });
    this.game.effects.spawnRing(source.position, '#e1a961', radius, 0.78);
    this.spawnMonsterAbilityText(source, '裂地震击', '#f3c776');
  }

  castGlacialSlam(source, ability) {
    const radius = Math.max(1, ability.radius ?? 5.2);
    const damage = Math.max(1, ability.damage ?? 12.5);
    this.damageTargetsInRadius(source, source.position, radius, damage, {
      defenseDamageType: 'magic',
      damageTypes: new Set(['undodgeable']),
      knockback: this.game.modifiers.getKnockback(source) * 1.45,
      onHit: (hitTarget) => {
        this.applyStatus(hitTarget, ability.statusBuffId ?? 'frostSnared', source, {
          duration: ability.slowDuration ?? 4.2
        });
        this.applyStatus(hitTarget, 'stunned', source, {
          duration: ability.stunDuration ?? 0.65
        });
      }
    });
    this.game.effects.spawnRing(source.position, '#d9f7ff', radius, 0.92);
    this.game.effects.spawnRing(source.position, '#62c9f3', radius * 0.68, 0.68);
    this.spawnMonsterAbilityText(source, '冰川践踏', '#bceeff');
  }

  castRootQuake(source, ability) {
    const radius = Math.max(1, ability.radius ?? 4.8);
    const damage = Math.max(1, ability.damage ?? 17);
    this.damageTargetsInRadius(source, source.position, radius, damage, {
      defenseDamageType: 'magic',
      damageTypes: new Set(['undodgeable']),
      knockback: this.game.modifiers.getKnockback(source) * 1.12,
      onHit: (hitTarget) => this.applyStatus(hitTarget, ability.statusBuffId ?? 'mireSnared', source, {
        duration: ability.slowDuration ?? 2.8
      })
    });
    this.game.effects.spawnRootEruption(source.position, radius);
    this.spawnMonsterAbilityText(source, '腐根震裂', '#b8cf72');
  }

  castVineField(source, targetOrPoint, ability) {
    const targetPoint = targetOrPoint?.position ?? targetOrPoint;
    if (!targetPoint) return false;
    const point = targetPoint.clone?.() ?? new THREE.Vector3(
      targetPoint.x ?? 0,
      targetPoint.y ?? 0,
      targetPoint.z ?? 0
    );
    const color = ability.color ?? '#526b3f';
    const accent = ability.accent ?? '#b8cf72';
    const zone = this.game.areaEffects?.create?.({
      kind: 'rootVines',
      target: 'opponent',
      radius: Math.max(1, ability.radius ?? 3.2),
      duration: Math.max(0.5, ability.duration ?? 5.4),
      applyInterval: Math.max(0.2, ability.tickInterval ?? 0.75),
      buffId: ability.statusBuffId ?? 'mireSnared',
      buffDuration: Math.max(0.4, ability.slowDuration ?? 1.1),
      directDamagePerSecondBase: Math.max(0, ability.damagePerSecond ?? 5.6),
      defenseDamageType: 'magic',
      color,
      accent
    }, point, {
      id: ability.key ?? 'rotroot-vine-field',
      level: 1,
      color
    }, { source });
    if (!zone) return false;
    zone.applyTimer = zone.applyInterval;
    this.spawnMonsterAbilityText(source, '腐根蔓域', accent);
    return true;
  }

  damageTargetsInRadius(source, center, radius, damage, options = {}) {
    const targetTeam = source.team === TEAMS.PLAYER ? TEAMS.ENEMY : TEAMS.PLAYER;
    const targets = this.unitsNear(targetTeam, center, radius);
    for (const target of targets) {
      if (!target.alive) continue;
      this.game.combat.applyDamage(target, damage, source, options.knockback ?? 0, {
        damage,
        source,
        target,
        defenseDamageType: options.defenseDamageType,
        damageTypes: options.damageTypes,
        isAttack: false,
        damageNumberHeight: target.projectileHitHeight ?? 1.45,
        damageNumberDuration: 0.72
      });
      options.onHit?.(target);
    }
    const structure = source.team === TEAMS.PLAYER ? this.game.enemyCamp : this.game.playerBase;
    if (structure?.alive && distance2D(structure.position, center) <= radius + targetCombatRadius(structure)) {
      this.game.combat.applyAttack(source, structure, {
        damage,
        attackDamageType: options.defenseDamageType,
        knockback: options.knockback ?? 0,
        damageTypes: options.damageTypes
      });
    }
  }

  unitsNear(team, center, radius) {
    const indexed = this.game.targeting?.query?.(team, center, radius);
    if (indexed) return [...indexed];
    const fallback = team === TEAMS.PLAYER ? this.game.friendlyUnits : this.game.enemyUnits;
    return fallback.filter((unit) => unit.alive && distance2D(unit.position, center) <= radius);
  }

  applyStatus(target, buffId, source, overrides) {
    if (!target?.alive || !buffId) return;
    this.game.buffs.applyBuff(target, buffId, source, overrides);
  }

  spawnMonsterAbilityText(source, text, color) {
    this.game.effects.spawnDamageNumber(source.position, 1, {
      text,
      color,
      stroke: '#17201f',
      height: (source.projectileHitHeight ?? 1.55) + 0.16,
      duration: 0.62,
      fontSize: 74,
      baseHeight: 0.46
    });
  }

  syncSourcePoseForAttackEvent(attack) {
    const animation = attack.source.visualRoot?.userData.animation;
    if (!animation || animation.name !== 'attack') return;
    animation.time = clamp(attack.fireAt, 0, attack.duration);
    updateUnitAnimation(attack.source, 0);
    attack.source.mesh.updateMatrixWorld(true);
  }

  getProjectileLaunchPosition(source) {
    const parts = source.visualRoot?.userData.parts;
    const launchPart = parts?.projectileSocket ?? parts?.heldArrow ?? parts?.rightHand;
    if (launchPart) {
      source.mesh.updateMatrixWorld(true);
      launchPart.getWorldPosition(projectileLaunchPosition);
      return projectileLaunchPosition;
    }
    projectileLaunchPosition.copy(source.position);
    projectileLaunchPosition.y = source.position.y + 1.18;
    return projectileLaunchPosition;
  }

  spawnProjectile(source, target, override = {}) {
    const projectileType = override.projectileType ?? source.definition.projectileType ?? 'arrow';
    const projectileColor = override.projectileColor ?? resolveProjectileColor(source, projectileType);
    const projectileObject = this.acquireProjectileObject(projectileType, projectileColor);
    const isGreatWaterOrb =
      projectileType === 'waterOrb' &&
      hasRuntimeTrait(source, 'greatWaterOrb');
    projectileObject.scale.setScalar(isGreatWaterOrb ? 1.7 : 1);
    const launchPosition = this.getProjectileLaunchPosition(source);
    projectileObject.position.copy(launchPosition);
    projectileTrailTargetPosition.copy(target.position);
    projectileTrailTargetPosition.y = target.position.y + (target.projectileHitHeight ?? 1);
    projectileTargetPosition.copy(projectileTrailTargetPosition).sub(launchPosition);
    if (projectileTargetPosition.lengthSq() > 0.0001) {
      projectileTargetPosition.normalize();
      projectileObject.quaternion.setFromUnitVectors(projectileForward, projectileTargetPosition);
    }
    this.game.scene.add(projectileObject);

    const pierce = override.projectilePierce ?? source.definition.projectilePierce;
    const attackDamageType = override.attackDamageType ?? source.definition.attackDamageType;
    const projectile = {
      networkId: `projectile:${this.nextProjectileNetworkId++}`,
      object: projectileObject,
      source,
      target,
      type: projectileType,
      color: projectileColor,
      speed: override.projectileSpeed ?? this.game.modifiers.getProjectileSpeed(source),
      damage: (
        override.damage ?? this.game.modifiers.getAttackDamage(source, attackDamageType)
      ) * (isGreatWaterOrb ? 1.55 : 1),
      attackDamageType,
      knockback: (override.knockback ?? this.game.modifiers.getKnockback(source)) * (isGreatWaterOrb ? 1.25 : 1),
      damageTypes: override.damageTypes,
      onHit: override.onHit,
      hitRadius: 0.34 * (isGreatWaterOrb ? 1.7 : 1),
      age: 0
    };

    if (pierce) {
      if (override.projectileDirection) {
        linearProjectileDirection.copy(override.projectileDirection);
      } else {
        linearProjectileDirection.copy(target.position).sub(launchPosition);
      }
      linearProjectileDirection.y = 0;
      if (linearProjectileDirection.lengthSq() < 0.0001) {
        linearProjectileDirection.set(Math.sin(source.mesh.rotation.y), 0, Math.cos(source.mesh.rotation.y));
      }
      linearProjectileDirection.normalize();
      projectile.mode = 'linearPierce';
      projectile.direction = linearProjectileDirection.clone();
      projectile.origin = launchPosition.clone();
      projectile.radius = pierce.radius ?? 0.75;
      projectile.maxDistance = pierce.maxDistance ?? this.game.modifiers.getAttackRange(source);
      projectile.maxAge = pierce.maxAge ?? projectile.maxDistance / Math.max(0.1, projectile.speed) + 0.6;
      projectile.hitIds = new Set();
      projectile.maxHits = Math.max(1, Math.floor(pierce.maxHits ?? Number.POSITIVE_INFINITY));
      projectile.object.quaternion.setFromUnitVectors(projectileForward, projectile.direction);
    }

    this.projectiles.push(projectile);
    this.game.networkBridge?.notifyProjectileSpawn?.(projectile);
    if (isGreatWaterOrb) {
      this.game.effects.spawnDamageNumber(source.position, 1, {
        text: '大水弹',
        color: '#9bdcff',
        stroke: '#183146',
        height: source.projectileHitHeight ?? 1.55,
        duration: 0.6,
        fontSize: 72,
        baseHeight: 0.44
      });
    }
  }

  updateProjectiles(dt, profile = null) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      projectile.age += dt;
      updateProjectileVisual(projectile.object, projectile.type, dt, projectile.age);
      if (projectile.mode === 'linearPierce') {
        this.updateLinearPiercingProjectile(projectile, i, dt, profile);
        continue;
      }
      if (projectile.target?.alive === false || projectile.age > 2.5) {
        const removeStartedAt = profile ? performance.now() : 0;
        this.removeProjectileAt(i);
        recordProjectileProfile(profile, 'projectileRecycleMs', removeStartedAt);
        continue;
      }

      const flightStartedAt = profile ? performance.now() : 0;
      const objectPosition = projectile.object.position;
      const targetPosition = projectile.target.position;
      const dx = targetPosition.x - objectPosition.x;
      const dy = (targetPosition.y + (projectile.target.projectileHitHeight ?? 1)) - objectPosition.y;
      const dz = targetPosition.z - objectPosition.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      recordProjectileProfile(profile, 'projectileFlightMs', flightStartedAt);

      const hitRadius = Math.max(0.01, projectile.hitRadius ?? 0.34);
      if (distanceSq < hitRadius * hitRadius) {
        const hitStartedAt = profile ? performance.now() : 0;
        this.applyProjectileHit(projectile, projectile.target);
        recordProjectileProfile(profile, 'projectileHitMs', hitStartedAt);
        const removeStartedAt = profile ? performance.now() : 0;
        this.removeProjectileAt(i);
        recordProjectileProfile(profile, 'projectileRecycleMs', removeStartedAt);
        continue;
      }

      const moveStartedAt = profile ? performance.now() : 0;
      const distance = Math.sqrt(distanceSq);
      const step = projectile.speed * dt / Math.max(0.0001, distance);
      objectPosition.x += dx * step;
      objectPosition.y += dy * step;
      objectPosition.z += dz * step;
      projectileTargetPosition.set(dx / distance, dy / distance, dz / distance);
      projectile.object.quaternion.setFromUnitVectors(projectileForward, projectileTargetPosition);
      recordProjectileProfile(profile, 'projectileMoveApplyMs', moveStartedAt);
    }
  }

  updateLinearPiercingProjectile(projectile, index, dt, profile = null) {
    const flightStartedAt = profile ? performance.now() : 0;
    projectile.object.position.addScaledVector(projectile.direction, projectile.speed * dt);
    projectile.object.quaternion.setFromUnitVectors(projectileForward, projectile.direction);
    recordProjectileProfile(profile, 'projectileFlightMs', flightStartedAt);

    const traveled = distance2D(projectile.origin, projectile.object.position);
    if (traveled > projectile.maxDistance || projectile.age > projectile.maxAge) {
      const removeStartedAt = profile ? performance.now() : 0;
      this.removeProjectileAt(index);
      recordProjectileProfile(profile, 'projectileRecycleMs', removeStartedAt);
      return;
    }

    const queryStartedAt = profile ? performance.now() : 0;
    const targetTeam = projectile.source.team === TEAMS.PLAYER ? TEAMS.ENEMY : TEAMS.PLAYER;
    const targets = this.game.targeting?.query(
      targetTeam,
      projectile.object.position,
      projectile.radius + PROJECTILE_TARGET_QUERY_PADDING
    ) ?? (targetTeam === TEAMS.ENEMY ? this.game.enemyUnits : this.game.friendlyUnits);
    recordProjectileProfile(profile, 'projectileQueryMs', queryStartedAt);
    for (const target of targets) {
      if (!target.alive) continue;
      const hitKey = target.id ?? target;
      if (projectile.hitIds.has(hitKey)) continue;
      const hitRadius = projectile.radius + targetCombatRadius(target);
      if (distance2D(projectile.object.position, target.position) > hitRadius) continue;
      projectile.hitIds.add(hitKey);
      const hitStartedAt = profile ? performance.now() : 0;
      this.applyProjectileHit(projectile, target);
      recordProjectileProfile(profile, 'projectileHitMs', hitStartedAt);
      if (projectile.hitIds.size >= projectile.maxHits) {
        const removeStartedAt = profile ? performance.now() : 0;
        this.removeProjectileAt(index);
        recordProjectileProfile(profile, 'projectileRecycleMs', removeStartedAt);
        return;
      }
    }
  }

  applyProjectileHit(projectile, target) {
    const landed = this.game.combat.applyAttack(projectile.source, target, {
      damage: projectile.damage,
      attackDamageType: projectile.attackDamageType,
      knockback: projectile.knockback,
      damageTypes: projectile.damageTypes,
      hitPosition: projectile.object.position.clone(),
      isProjectile: true
    });
    if (landed) projectile.onHit?.(target, projectile);
  }

  removeProjectileAt(index) {
    const projectile = this.projectiles[index];
    if (!projectile) return;
    this.game.networkBridge?.notifyProjectileDespawn?.(projectile.networkId);
    this.releaseProjectileObject(projectile.object);
    this.projectiles.splice(index, 1);
  }

  acquireProjectileObject(type, color) {
    const key = projectilePoolKey(type, color);
    const pool = this.projectilePools.get(key);
    const object = pool?.pop() ?? createProjectileModel(type, { color });
    object.userData.projectilePoolKey = key;
    object.visible = true;
    object.scale.set(1, 1, 1);
    object.rotation.set(0, 0, 0);
    object.quaternion.identity();
    resetProjectileVisual(object, type);
    return object;
  }

  releaseProjectileObject(object) {
    if (!object) return;
    this.game.scene.remove(object);
    object.visible = false;
    const key = object.userData.projectilePoolKey;
    if (!key) {
      disposeObject3D(object);
      return;
    }
    const pool = this.projectilePools.get(key) ?? [];
    this.projectilePools.set(key, pool);
    if (pool.length >= 40) {
      disposeObject3D(object);
      return;
    }
    pool.push(object);
  }

  destroy() {
    this.projectiles.forEach((projectile) => {
      this.game.scene.remove(projectile.object);
      disposeObject3D(projectile.object);
    });
    this.projectiles.length = 0;
    this.projectilePools.forEach((pool) => {
      pool.forEach((object) => disposeObject3D(object));
    });
    this.projectilePools.clear();
    this.thunderClouds.length = 0;
    this.frostStorms.length = 0;
    this.hurricanes.length = 0;
    this.pendingAttacks.length = 0;
    this.activeAttackBySourceId.clear();
  }
}

function projectilePoolKey(type, color) {
  return `${type}:${color}`;
}

function isPendingAttackActive(attack) {
  return Boolean(
    attack &&
    attack.source?.alive !== false &&
    attack.target?.alive !== false &&
    attack.elapsed < attack.duration
  );
}

function hasRuntimeTrait(unit, trait) {
  return unit?.runtimeTraits?.has?.(trait) === true;
}

export function findNextChainLightningTarget(targets, origin, hitTargetIds, jumpRange) {
  let closest = null;
  let closestDistance = Math.max(0, jumpRange) ** 2;
  for (const target of targets ?? []) {
    if (!target?.alive || !target.position || hitTargetIds?.has(chainTargetId(target))) continue;
    const dx = target.position.x - origin.x;
    const dz = target.position.z - origin.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > closestDistance) continue;
    closest = target;
    closestDistance = distanceSq;
  }
  return closest;
}

function findNearestTarget(targets, origin) {
  return findNextChainLightningTarget(targets, origin, new Set(), Number.POSITIVE_INFINITY);
}

function chainTargetId(target) {
  return target?.id ?? target;
}

function chainLightningPoint(target) {
  return new THREE.Vector3(
    target.position.x,
    (target.position.y ?? 0) + (target.projectileHitHeight ?? 1.1),
    target.position.z
  );
}

function shieldRatio(unit) {
  return Math.max(0, unit?.shield ?? 0) / Math.max(1, unit?.maxShield ?? 0);
}

function recordProjectileProfile(profile, key, mark) {
  if (!profile) return;
  profile[key] += roundProfile(performance.now() - mark);
}

// 点到线段（2D 俯视）距离
function distanceToSegment2D(point, start, end) {
  const sx = start.x;
  const sz = start.z;
  const ex = end.x;
  const ez = end.z;
  const dx = ex - sx;
  const dz = ez - sz;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0.0001) return Math.hypot(point.x - sx, point.z - sz);
  const t = clamp(
    ((point.x - sx) * dx + (point.z - sz) * dz) / lengthSq,
    0,
    1
  );
  return Math.hypot(point.x - (sx + dx * t), point.z - (sz + dz * t));
}

// 可选的击退施加：沿方向推开并限制拖动距离
function applyKnockbackIfAvailable(game, unit, fromPosition, strength, direction, dragDistance) {
  if (!game?.applyKnockbackImpulse || !unit?.position) return;
  if (strength <= 0) return;
  if (game.applyKnockbackImpulse(unit, fromPosition, strength)) {
    unit.knockbackVelocity?.addScaledVector(direction, dragDistance);
  }
}

// 飓风吸引：将范围内敌人朝飓风中心拉拽聚拢（以水平为主，考虑击退抗性），
// 与飓风向前推进叠加，形成“被卷入漩涡、随风拖行”的手感。
function applyVortexPull(game, unit, center, pullStrength) {
  if (!unit?.position || !unit.knockbackVelocity || pullStrength <= 0 || isStaticUnit(unit)) return;
  const resistance = game?.modifiers?.getKnockbackResistance?.(unit) ?? 0;
  const strength = pullStrength * (1 - clamp(resistance, 0, 1));
  if (strength <= 0.001) return;
  vortexDirection.set(center.x - unit.position.x, 0, center.z - unit.position.z);
  if (vortexDirection.lengthSq() < 0.0001) return;
  vortexDirection.normalize();
  // 与击退一致：先衰减旧速度再叠加向内脉冲，避免多 tick 累积致速度失控
  unit.knockbackVelocity.multiplyScalar(0.6);
  unit.knockbackVelocity.addScaledVector(vortexDirection, knockbackImpulseSpeed(strength, unit));
  unit.knockbackVelocity.clampLength(0, maxKnockbackVelocity(unit));
  game?.pathfinding?.clear?.(unit);
}
