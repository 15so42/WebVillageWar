import * as THREE from 'three';
import { basicMat, mat } from '../art/lowpoly.js';
import { disposeObject3D } from '../utils/dispose.js';
import { distance2D } from '../utils/math.js';

const DEFAULT_APPLY_INTERVAL = 0.45;
const SMOKE_PARTICLE_COUNT = 22;

export class AreaEffectSystem {
  constructor(game) {
    this.game = game;
    this.zones = [];
  }

  create(effect, point, card) {
    if (!point) return null;
    const level = Math.max(1, Math.floor(card?.level ?? 1));
    const bonusLevel = Math.max(0, level - 1);
    const radius = this.game.scaleSpellAreaRadius(resolveAreaDimension(
      effect.radius ?? card?.radius ?? 3,
      effect.radiusPerLevel,
      level,
      0.06 * bonusLevel
    ));
    const duration = resolveAreaDimension(
      effect.duration ?? card?.duration ?? 10,
      effect.durationPerLevel,
      level,
      0.08 * bonusLevel
    );
    const position = point.clone();
    position.y = this.game.groundHeightAt(position) + 0.08;
    const visual = createFogVisual({
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
      level,
      kind: effect.kind ?? 'fog',
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
    return zone;
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
      updateFogVisual(zone, dt);
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
      const applied = this.game.buffs.applyBuff(unit, zone.buffId, null, overrides);
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
      source: null,
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
    if (zone.target === 'friendly' || zone.target === 'all') pools.push(this.game.friendlyUnits);
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

function createFogVisual({ radius, color, accent, kind }) {
  const group = new THREE.Group();
  group.userData.baseRadius = radius;
  group.userData.kind = kind;

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    basicMat(color, {
      transparent: true,
      opacity: kind === 'whiteSmoke' ? 0.18 : 0.2,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone()
  );
  disc.rotation.x = -Math.PI / 2;
  disc.scale.setScalar(radius);
  disc.renderOrder = 1320;
  group.add(disc);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1, 64),
    basicMat(accent, {
      transparent: true,
      opacity: kind === 'whiteSmoke' ? 0.62 : 0.54,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone()
  );
  ring.rotation.x = -Math.PI / 2;
  ring.scale.setScalar(radius);
  ring.position.y = 0.012;
  ring.renderOrder = 1321;
  group.add(ring);

  const puffMaterial = mat(color, {
    transparent: true,
    opacity: kind === 'whiteSmoke' ? 0.42 : 0.34,
    emissive: accent,
    emissiveIntensity: kind === 'whiteSmoke' ? 0.08 : 0.18,
    depthWrite: false
  }).clone();
  for (let i = 0; i < SMOKE_PARTICLE_COUNT; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = radius * Math.sqrt(Math.random()) * 0.88;
    const puff = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.26, 0),
      puffMaterial
    );
    puff.position.set(
      Math.cos(angle) * distance,
      0.22 + Math.random() * 0.82,
      Math.sin(angle) * distance
    );
    puff.userData.base = puff.position.clone();
    puff.userData.phase = Math.random() * Math.PI * 2;
    puff.userData.speed = 0.35 + Math.random() * 0.55;
    puff.userData.scale = puff.scale.x;
    puff.renderOrder = 1322;
    group.add(puff);
  }
  group.userData.disc = disc;
  group.userData.ring = ring;
  group.userData.puffMaterial = puffMaterial;
  return group;
}

function updateFogVisual(zone, dt) {
  const group = zone.visual;
  const t = Math.min(1, zone.age / Math.max(0.01, zone.duration));
  const fadeIn = Math.min(1, zone.age / 0.45);
  const fadeOut = Math.min(1, (zone.duration - zone.age) / 0.9);
  const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
  const pulse = Math.sin((zone.age * 1.9) + zone.radius) * 0.035;
  const scale = 1 + pulse;
  group.userData.disc.scale.setScalar(zone.radius * scale);
  group.userData.ring.scale.setScalar(zone.radius * (1 + pulse * 1.4));
  group.userData.disc.material.opacity = (zone.kind === 'whiteSmoke' ? 0.18 : 0.2) * alpha;
  group.userData.ring.material.opacity = (zone.kind === 'whiteSmoke' ? 0.62 : 0.54) * alpha;
  group.userData.puffMaterial.opacity = (zone.kind === 'whiteSmoke' ? 0.42 : 0.34) * alpha;
  group.children.forEach((child, index) => {
    if (!child.userData.base) return;
    const phase = child.userData.phase + zone.age * child.userData.speed;
    child.position.x = child.userData.base.x + Math.cos(phase) * 0.12;
    child.position.z = child.userData.base.z + Math.sin(phase * 0.84) * 0.12;
    child.position.y = child.userData.base.y + Math.sin(phase * 1.25) * 0.08;
    child.rotation.y += dt * (0.35 + index * 0.01);
    child.scale.setScalar(0.72 + Math.sin(phase) * 0.16 + Math.sin(t * Math.PI) * 0.18);
  });
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
