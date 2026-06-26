import { TEAMS } from '../data/gameData.js';
import { distance2D } from '../utils/math.js';

export class LevelMechanicSystem {
  constructor(game) {
    this.game = game;
    this.config = game.world?.config?.mechanics ?? {};
    this.traps = (this.config.traps ?? []).map((trap) => ({
      ...trap,
      timer: trap.initialDelay ?? Math.random() * (trap.intervalSeconds ?? trap.tickSeconds ?? 1),
      cycleTime: trap.phase ?? 0,
      active: false
    }));
    this.sunlightTimer = this.config.sunlight?.initialDelay ?? 0.75;
    this.lavaTimer = this.config.lava?.initialDelay ?? 0.2;
  }

  update(dt) {
    this.updateTraps(dt);
    this.updateSunlight(dt);
    this.updateLava(dt);
  }

  destroy() {}

  updateTraps(dt) {
    this.traps.forEach((trap) => {
      if (trap.type === 'spikes') {
        this.updateSpikeTrap(trap, dt);
        return;
      }
      if (trap.type === 'fireVent') {
        this.updateFireVent(trap, dt);
      }
    });
  }

  updateSpikeTrap(trap, dt) {
    trap.timer -= dt;
    if (trap.timer > 0) return;
    trap.timer += Math.max(0.25, trap.intervalSeconds ?? 2.2);
    this.damageUnitsInTrap(trap, trap.damage ?? 5, {
      color: '#d8d0bd',
      ringRadius: trap.radius ?? 1.35
    });
  }

  updateFireVent(trap, dt) {
    const activeSeconds = Math.max(0.25, trap.activeSeconds ?? 1.15);
    const restSeconds = Math.max(0.25, trap.restSeconds ?? 2.2);
    const cycle = activeSeconds + restSeconds;
    trap.cycleTime = (trap.cycleTime + dt) % cycle;
    trap.active = trap.cycleTime <= activeSeconds;
    if (!trap.active) return;

    const center = trapPosition(trap, this.game);
    this.game.effects.spawnFireParticlesAt(center, 2, 0.4, trap.radius ?? 0.8, 0.72);

    trap.timer -= dt;
    if (trap.timer > 0) return;
    trap.timer += Math.max(0.2, trap.tickSeconds ?? 0.55);
    this.damageUnitsInTrap(trap, trap.damage ?? 3.2, {
      color: '#ff8a35',
      ringRadius: trap.radius ?? 1.2
    });
  }

  damageUnitsInTrap(trap, damage, options = {}) {
    const center = trapPosition(trap, this.game);
    const radius = trap.radius ?? 1.2;
    let hitCount = 0;
    [...this.game.friendlyUnits, ...this.game.enemyUnits].forEach((unit) => {
      if (!unit.alive || distance2D(unit.position, center) > radius) return;
      hitCount += 1;
      this.game.combat.applyDamage(unit, damage, null, 0, {
        damage,
        source: null,
        target: unit,
        isAttack: false,
        skipHitAnimation: trap.type !== 'spikes',
        damageNumberHeight: unit.projectileHitHeight ?? 1.4,
        damageNumberDuration: 0.64
      });
    });
    if (hitCount > 0) {
      this.game.effects.spawnRing(center, options.color, options.ringRadius, 0.38);
    }
  }

  updateSunlight(dt) {
    const sunlight = this.config.sunlight;
    if (!sunlight?.enabled) return;
    this.sunlightTimer -= dt;
    if (this.sunlightTimer > 0) return;
    const tickSeconds = Math.max(0.25, sunlight.tickSeconds ?? 1);
    this.sunlightTimer += tickSeconds;
    const damage = sunlight.damagePerTick ?? sunlight.damagePerSecond ?? 1.6;
    this.game.friendlyUnits.forEach((unit) => {
      if (!unit.alive || unit.team !== TEAMS.PLAYER) return;
      if (this.isInShade(unit.position, sunlight)) return;
      this.game.combat.applyDamage(unit, damage, null, 0, {
        damage,
        source: null,
        target: unit,
        isAttack: false,
        skipHitAnimation: true,
        damageNumberHeight: unit.projectileHitHeight ?? 1.45,
        damageNumberDuration: 0.65
      });
      this.game.effects.spawnFireParticlesAt(unit.position, 3, 0.52, 0.38, unit.projectileHitHeight ?? 1.1);
    });
  }

  isInShade(position, sunlight = this.config.sunlight ?? {}) {
    const zones = sunlight.shadeZones ?? this.game.world?.config?.shadeZones ?? [];
    return zones.some((zone) => {
      const dx = position.x - zone.x;
      const dz = position.z - zone.z;
      const rx = Math.max(0.1, zone.rx ?? zone.radius ?? 3);
      const rz = Math.max(0.1, zone.rz ?? zone.radius ?? rx);
      return (dx * dx) / (rx * rx) + (dz * dz) / (rz * rz) <= 1;
    });
  }

  updateLava(dt) {
    const lava = this.config.lava;
    if (!lava?.enabled) return;
    this.lavaTimer -= dt;
    if (this.lavaTimer > 0) return;
    const tickSeconds = Math.max(0.12, lava.tickSeconds ?? 0.35);
    this.lavaTimer += tickSeconds;
    [...this.game.friendlyUnits, ...this.game.enemyUnits].forEach((unit) => {
      if (!unit.alive) return;
      if (this.game.isPointOnSafeSurface(unit.position)) return;
      const damage = lavaDamageFor(unit, lava, tickSeconds);
      this.game.combat.applyDamage(unit, damage, null, 0, {
        damage,
        source: null,
        target: unit,
        isAttack: false,
        skipHitAnimation: true,
        damageTypes: lava.bypassShield === false ? new Set() : new Set(['directHealth']),
        damageNumberHeight: unit.projectileHitHeight ?? 1.45,
        damageNumberDuration: 0.58
      });
      this.game.effects.spawnFireParticlesAt(unit.position, 5, 0.5, 0.48, unit.projectileHitHeight ?? 1.1);
      unit.knockbackVelocity.multiplyScalar(0.32);
    });
  }
}

function lavaDamageFor(unit, lava, tickSeconds) {
  if (Number.isFinite(lava.damagePerTick)) return Math.max(0, lava.damagePerTick);
  const percentPerSecond = lava.damageMaxHealthPercentPerSecond ?? lava.damagePercentPerSecond;
  if (Number.isFinite(percentPerSecond)) {
    return Math.max(0, unit.maxHealth * percentPerSecond * tickSeconds);
  }
  return Math.max(0, (lava.damagePerSecond ?? 18) * tickSeconds);
}

function trapPosition(trap, game) {
  return {
    x: trap.x ?? trap.position?.x ?? 0,
    y: game.groundHeightAt(trap.x ?? trap.position?.x ?? 0, trap.z ?? trap.position?.z ?? 0) + 0.08,
    z: trap.z ?? trap.position?.z ?? 0
  };
}
