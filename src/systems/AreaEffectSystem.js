import { createAreaEffectVisual, updateAreaEffectVisual } from '../art/areaEffectVisual.js';
import { disposeObject3D } from '../utils/dispose.js';
import { distance2D } from '../utils/math.js';

const DEFAULT_APPLY_INTERVAL = 0.45;

export class AreaEffectSystem {
  constructor(game) {
    this.game = game;
    this.zones = [];
  }

  create(effect, point, card, { playerId = null } = {}) {
    if (!point) return null;
    const level = Math.max(1, Math.floor(card?.level ?? 1));
    const bonusLevel = Math.max(0, level - 1);
    const radius = this.game.scaleSpellAreaRadius(resolveAreaDimension(
      effect.radius ?? card?.radius ?? 3,
      effect.radiusPerLevel,
      level,
      0.06 * bonusLevel
    ), playerId);
    const duration = resolveAreaDimension(
      effect.duration ?? card?.duration ?? 10,
      effect.durationPerLevel,
      level,
      0.08 * bonusLevel
    );
    const position = point.clone();
    position.y = this.game.groundHeightAt(position) + 0.08;
    const visual = createAreaEffectVisual({
      radius,
      color: effect.color ?? card.color ?? '#ffffff',
      accent: effect.accent ?? '#ffffff',
      kind: effect.kind ?? 'fog'
    });
    visual.position.copy(position);
    this.game.scene.add(visual);

    const zone = {
      id: `${card.id}:${this.game.elapsedTime.toFixed(2)}:${this.zones.length}`,
      cardId: card.id,
      ownerPlayerId: playerId,
      source: playerId
        ? { team: 'player', ownerPlayerId: playerId, controllerPlayerId: playerId }
        : null,
      level,
      kind: effect.kind ?? 'fog',
      color: effect.color ?? card.color ?? '#ffffff',
      accent: effect.accent ?? '#ffffff',
      target: effect.target ?? 'all',
      position,
      radius,
      duration,
      age: 0,
      applyTimer: 0,
      applyInterval: effect.applyInterval ?? DEFAULT_APPLY_INTERVAL,
      buffId: effect.buffId,
      buffDuration: effect.buffDuration ?? Math.max(0.8, (effect.applyInterval ?? DEFAULT_APPLY_INTERVAL) * 2.5),
      damagePerSecondBase: effect.damagePerSecondBase,
      damagePerSecondPerLevel: effect.damagePerSecondPerLevel,
      maxHealthDamagePercentPerSecondBase: effect.maxHealthDamagePercentPerSecondBase,
      maxHealthDamagePercentPerSecondPerLevel: effect.maxHealthDamagePercentPerSecondPerLevel,
      directDamagePerSecondBase: effect.directDamagePerSecondBase,
      directDamagePerSecondPerLevel: effect.directDamagePerSecondPerLevel,
      defenseDamageType: normalizeDefenseDamageType(effect.defenseDamageType ?? effect.damageType),
      visual
    };
    this.zones.push(zone);
    this.applyZone(zone);
    this.game.networkBridge?.notifyAreaEffectSpawn?.(this.serializeZone(zone));
    return zone;
  }

  serializeZone(zone) {
    if (!zone?.position) return null;
    return {
      id: zone.id,
      cardId: zone.cardId,
      ownerPlayerId: zone.ownerPlayerId ?? null,
      kind: zone.kind,
      color: zone.color,
      accent: zone.accent,
      position: [zone.position.x, zone.position.y, zone.position.z],
      radius: zone.radius,
      remaining: Math.max(0, zone.duration - zone.age)
    };
  }

  serializeNetworkState() {
    return this.zones
      .filter((zone) => zone.age < zone.duration)
      .map((zone) => this.serializeZone(zone))
      .filter(Boolean);
  }

  update(dt) {
    for (let i = this.zones.length - 1; i >= 0; i -= 1) {
      const zone = this.zones[i];
      zone.age += dt;
      zone.applyTimer -= dt;
      if (zone.applyTimer <= 0) {
        this.applyZone(zone);
        zone.applyTimer += zone.applyInterval;
      }
      updateAreaEffectVisual(zone.visual, zone, dt);
      if (zone.age >= zone.duration) {
        this.removeZoneAt(i);
      }
    }
  }

  destroy() {
    for (let i = this.zones.length - 1; i >= 0; i -= 1) {
      this.removeZoneAt(i);
    }
  }

  applyZone(zone) {
    this.getTargets(zone).forEach((unit) => {
      this.applyZoneDirectDamage(zone, unit);
      if (!zone.buffId) return;
      const overrides = {
        sourceCard: zone.cardId,
        level: zone.level,
        duration: zone.buffDuration
      };
      const damagePerSecond = resolveLevelNumber(
        zone.damagePerSecondBase,
        zone.damagePerSecondPerLevel,
        zone.level
      );
      if (Number.isFinite(damagePerSecond)) {
        overrides.damagePerSecond = damagePerSecond;
      }
      const maxHealthDamagePercentPerSecond = resolveLevelNumber(
        zone.maxHealthDamagePercentPerSecondBase,
        zone.maxHealthDamagePercentPerSecondPerLevel,
        zone.level
      );
      if (Number.isFinite(maxHealthDamagePercentPerSecond)) {
        overrides.maxHealthDamagePercentPerSecond = maxHealthDamagePercentPerSecond;
      }
      const applied = this.game.buffs.applyBuff(unit, zone.buffId, zone.source, overrides);
      if (applied && zone.kind === 'poisonFog' && Math.random() < 0.38) {
        this.game.effects.spawnPoisonParticles(unit, 1);
      }
      if (applied && zone.kind === 'whiteSmoke' && Math.random() < 0.24) {
        this.game.effects.spawnRing(unit.position, '#eef7ff', 0.42, 0.28);
      }
      if (applied && zone.kind === 'plagueFog' && Math.random() < 0.32) {
        this.game.effects.spawnPoisonParticles(unit, 2);
      }
    });
  }

  applyZoneDirectDamage(zone, unit) {
    const damagePerSecond = resolveDirectDamagePerSecond(zone);
    if (!Number.isFinite(damagePerSecond) || damagePerSecond <= 0) return;
    const interval = Math.max(0.01, zone.applyInterval);
    const damage = damagePerSecond * interval;
    this.game.combat.applyDamage(unit, damage, null, 0, {
      damage,
      source: zone.source,
      target: unit,
      defenseDamageType: zone.defenseDamageType ?? 'magic',
      isAttack: false,
      skipHitAnimation: true,
      damageNumberHeight: unit.projectileHitHeight ?? 1.45,
      damageNumberDuration: 0.58
    });
  }

  getTargets(zone) {
    const pools = [];
    if (zone.target === 'enemy' || zone.target === 'all') pools.push(this.game.enemyUnits);
    if (zone.target === 'friendly' || zone.target === 'all') {
      pools.push(this.game.friendlyUnits);
    }
    return pools.flat().filter((unit) => (
      unit?.alive &&
      !unit.underConstruction &&
      distance2D(unit.position, zone.position) <= zone.radius
    ));
  }

  removeZoneAt(index) {
    const zone = this.zones[index];
    if (!zone) return;
    this.game.scene.remove(zone.visual);
    disposeObject3D(zone.visual, { materials: true });
    this.zones.splice(index, 1);
  }
}

function resolveLevelNumber(base, perLevel, level) {
  if (!Number.isFinite(base) && !Number.isFinite(perLevel)) return null;
  return (Number.isFinite(base) ? base : 0) + (Number.isFinite(perLevel) ? perLevel : 0) * level;
}

function resolveAreaDimension(base, perLevel, level, percentBonus = 0) {
  const value = Math.max(0.1, Number.isFinite(base) ? base : 1);
  const flatBonus = Number.isFinite(perLevel) ? perLevel * Math.max(0, level - 1) : 0;
  return (value + flatBonus) * (1 + Math.max(0, percentBonus));
}

function resolveDirectDamagePerSecond(zone) {
  if (
    Number.isFinite(zone.directDamagePerSecondBase) ||
    Number.isFinite(zone.directDamagePerSecondPerLevel)
  ) {
    return resolveLevelNumber(
      zone.directDamagePerSecondBase,
      zone.directDamagePerSecondPerLevel,
      zone.level
    );
  }
  if (!zone.buffId) {
    return resolveLevelNumber(zone.damagePerSecondBase, zone.damagePerSecondPerLevel, zone.level);
  }
  return null;
}

function normalizeDefenseDamageType(type) {
  if (type === 'physical' || type === 'magic') return type;
  return null;
}
