import * as THREE from 'three';
import {
  createProjectileModel,
  getAnimationDuration,
  getAnimationEventTime,
  playUnitAnimation,
  stopUnitAnimation,
  updateUnitAnimation
} from '../art/visualRegistry.js';
import { TEAMS } from '../data/gameData.js';
import { disposeObject3D } from '../utils/dispose.js';
import { clamp, distance2D } from '../utils/math.js';
import {
  getTargetPosition,
  roundProfile,
  resolveProjectileColor,
  targetCombatRadius
} from './combatHelpers.js';

const projectileLaunchPosition = new THREE.Vector3();
const projectileTargetPosition = new THREE.Vector3();
const projectileTrailTargetPosition = new THREE.Vector3();
const projectileForward = new THREE.Vector3(0, 0, 1);
const linearProjectileDirection = new THREE.Vector3();
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
      this.spawnAttackAccent(attack);
      this.resolveMonsterAbility(attack);
      return;
    }
    if (!attack.projectileOverride && target?.position && source.definition.role === 'melee') {
      const allowedRange =
        this.game.modifiers.getAttackRange(source) + targetCombatRadius(target) + 0.85;
      if (distance2D(source.position, target.position) > allowedRange) return;
    }

    this.spawnAttackAccent(attack);

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
  }

  spawnAttackAccent(attack) {
    const source = attack?.source;
    if (!source?.position) return;
    const ranged = Boolean(attack.projectileOverride || source.definition?.role === 'ranged');
    const origin = ranged
      ? this.getProjectileLaunchPosition(source).clone()
      : source.position.clone().add(new THREE.Vector3(0, source.projectileHitHeight ?? 1.05, 0));
    const targetPosition = attack.abilityPoint?.clone?.()
      ?? getTargetPosition(attack.target)?.clone?.()
      ?? origin.clone().add(new THREE.Vector3(0, 0, 1));
    const direction = targetPosition.sub(origin);
    if (!ranged && direction.lengthSq() > 0.001) {
      origin.addScaledVector(direction.clone().normalize(), 0.38);
    }
    const damageType = attack.projectileOverride?.attackDamageType
      ?? source.definition?.attackDamageType;
    const color = attack.projectileOverride?.projectileColor
      ?? source.definition?.projectileColor
      ?? (damageType === 'magic'
        ? '#bda6ff'
        : source.team === TEAMS.PLAYER ? '#ffd487' : '#ff9a78');
    this.game.effects.spawnAttackBurst(origin, direction, {
      color,
      scale: source.isBoss ? 1.45 : source.isElite ? 1.18 : 1
    });
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
