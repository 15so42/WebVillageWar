import * as THREE from 'three';
import { createAltarModel } from '../art/lowpoly.js';
import { ALTAR_DEFINITIONS, BALANCE, TEAMS } from '../data/gameData.js';
import { clamp, distance2D } from '../utils/math.js';

const TEAM_COLORS = {
  [TEAMS.PLAYER]: '#6ef0c4',
  [TEAMS.ENEMY]: '#ff6b5f',
  neutral: '#d8e2df'
};

const PROGRESS_SEGMENTS = 72;
const FULL_CIRCLE = Math.PI * 2;

export class AltarSystem {
  constructor(game, altarConfigs = BALANCE.world.altars ?? []) {
    this.game = game;
    this.altars = altarConfigs
      .map((config) => this.createAltar(config))
      .filter(Boolean);
  }

  createAltar(config) {
    const definition = ALTAR_DEFINITIONS[config.type];
    if (!definition) return null;

    const position = config.position ?? { x: config.x, z: config.z };
    const altarPosition = new THREE.Vector3(
      position.x,
      this.game.groundHeightAt(position.x, position.z) + 0.12,
      position.z
    );
    const model = createAltarModel(definition);
    model.position.copy(altarPosition);
    model.rotation.y = config.rotation ?? 0;
    this.game.scene.add(model);
    const labelElement = createAltarLabel(definition);
    if (labelElement) {
      this.game.worldUi?.append(labelElement);
    }

    const captureRadius = config.captureRadius ?? definition.captureRadius ?? 4;
    const effectRadius = config.effectRadius ?? definition.effectRadius ?? captureRadius;
    const parts = model.userData.parts;
    parts.areaDisc.scale.setScalar(captureRadius);
    parts.areaRing.scale.setScalar(captureRadius);
    parts.progressRing.scale.setScalar(captureRadius);

    return {
      id: config.id,
      type: config.type,
      name: definition.name,
      definition,
      model,
      labelElement,
      position: altarPosition,
      captureRadius,
      effectRadius,
      captureSeconds: config.captureSeconds ?? definition.captureSeconds ?? 6,
      owner: null,
      captureTeam: null,
      progress: 0,
      contested: false,
      effectPulseTimer: 0,
      effectTimers: new Map(),
      age: Math.random() * 10,
      visual: {
        progressStep: -1,
        color: null
      }
    };
  }

  update(dt) {
    this.altars.forEach((altar) => {
      altar.age += dt;
      this.updateCapture(altar, dt);
      this.applyEffects(altar, dt);
      this.updateVisual(altar, dt);
    });
  }

  updateCapture(altar, dt) {
    const presentTeams = this.captureTeamsAt(altar);
    altar.contested = presentTeams.length > 1;
    if (altar.contested || presentTeams.length === 0) {
      return;
    }

    const team = presentTeams[0];
    const delta = dt / altar.captureSeconds;
    if (altar.owner) {
      if (team === altar.owner) {
        altar.captureTeam = null;
        altar.progress = Math.min(1, altar.progress + delta);
        return;
      }

      altar.captureTeam = team;
      altar.progress = Math.max(0, altar.progress - delta);
      if (altar.progress <= 0.001) {
        altar.owner = null;
        altar.progress = 0;
      }
      return;
    }

    if (altar.captureTeam && altar.captureTeam !== team) {
      altar.progress = Math.max(0, altar.progress - delta);
      if (altar.progress <= 0.001) {
        altar.captureTeam = team;
        altar.progress = 0;
      }
      return;
    }

    altar.captureTeam = team;
    altar.progress = Math.min(1, altar.progress + delta);
    if (altar.progress >= 0.999) {
      altar.owner = team;
      altar.captureTeam = null;
      altar.progress = 1;
      this.game.effects.spawnRing(altar.position, teamColor(team), altar.captureRadius, 0.8);
    }
  }

  captureTeamsAt(altar) {
    const teams = [];
    if (this.hasCapturingUnit(TEAMS.PLAYER, altar)) teams.push(TEAMS.PLAYER);
    if (this.hasCapturingUnit(TEAMS.ENEMY, altar)) teams.push(TEAMS.ENEMY);
    return teams;
  }

  hasCapturingUnit(team, altar) {
    return this.unitsForTeam(team, { includeWildlife: false }).some((unit) => (
      unit.alive && distance2D(unit.position, altar.position) <= altar.captureRadius
    ));
  }

  applyEffects(altar, dt) {
    if (!altar.owner) {
      altar.effectTimers.clear();
      return;
    }
    altar.definition.effects.forEach((effect, index) => this.applyEffect(altar, effect, dt, index));
    this.spawnActivePulse(altar, dt);
  }

  applyEffect(altar, effect, dt, index = 0) {
    if (!this.isEffectReady(altar, effect, dt, index)) return;

    if (effect.op === 'restoreEnergy') {
      if (altar.owner !== TEAMS.PLAYER) return;
      const amount = effect.amount ?? (effect.amountPerSecond ?? 0) * dt;
      const gained = this.game.cardSystem.addEnergy(amount);
      if (gained > 0) {
        this.game.effects.spawnEnergyNumber(altar.position, gained, {
          height: 2.35
        });
      }
      return;
    }

    const units = this.unitsForTeam(altar.owner, { includeWildlife: false });
    units.forEach((unit) => {
      if (!unit.alive) return;
      if (distance2D(unit.position, altar.position) > altar.effectRadius) return;

      if (effect.op === 'restoreShield') {
        unit.restoreShield(effect.amountPerSecond * dt);
      } else if (effect.op === 'restoreHealthPercent') {
        const percent = effect.percent ?? (effect.percentPerSecond ?? 0) * dt;
        const healed = unit.restoreHealth(unit.maxHealth * percent);
        this.game.effects.spawnHealNumber(unit.position, healed, {
          height: unit.projectileHitHeight ?? 1.55
        });
      } else if (effect.op === 'restoreDurabilityPercent') {
        const percent = effect.percent ?? (effect.percentPerSecond ?? 0) * dt;
        unit.restoreDurability(unit.weapon.maxDurability * percent);
      }
    });
  }

  isEffectReady(altar, effect, dt, index) {
    const interval = effect.intervalSeconds ?? effect.tickSeconds ?? 0;
    if (interval <= 0) return true;
    const key = `${index}:${effect.op}`;
    const elapsed = (altar.effectTimers.get(key) ?? 0) + Math.max(0, dt);
    if (elapsed < interval) {
      altar.effectTimers.set(key, elapsed);
      return false;
    }
    altar.effectTimers.set(key, 0);
    return true;
  }

  spawnActivePulse(altar, dt) {
    altar.effectPulseTimer -= dt;
    if (altar.effectPulseTimer > 0) return;
    altar.effectPulseTimer = altar.effectRadius > 0 ? 0.9 : 1.4;
    const radius = altar.effectRadius > 0 ? altar.effectRadius : 1.6;
    this.game.effects.spawnRing(altar.position, altar.definition.color, radius, 0.72);
  }

  updateVisual(altar, dt) {
    const parts = altar.model.userData.parts;
    const activeTeam = altar.owner ?? altar.captureTeam;
    const color = activeTeam ? teamColor(activeTeam) : altar.definition.color;
    const progress = clamp(altar.progress, 0, 1);

    if (altar.visual.color !== color) {
      altar.visual.color = color;
      parts.progressRing.material.color.set(color);
      parts.areaDisc.material.color.set(color);
      parts.areaRing.material.color.set(color);
      parts.ownerCrown.material.color.set(activeTeam ? color : TEAM_COLORS.neutral);
    }

    parts.progressRing.visible = progress > 0.005;
    parts.areaDisc.visible = false;
    parts.areaRing.material.opacity = altar.contested ? 0.44 : 0.24;
    parts.ownerCrown.material.opacity = altar.owner ? 0.92 : 0.48;
    parts.ownerCrown.visible = true;
    parts.ownerCrown.rotation.z += dt * (altar.owner ? 0.9 : 0.34);
    parts.crystal.rotation.y += dt * 0.82;
    const pulse = 1 + Math.sin(altar.age * 2.6) * (altar.owner ? 0.07 : 0.035);
    parts.crystal.scale.set(0.72 * pulse, 1.28 * (1 + (pulse - 1) * 0.35), 0.72 * pulse);
    this.updateProgressRing(parts.progressRing, altar, progress);
    this.updateLabel(altar);
  }

  updateLabel(altar) {
    if (!altar.labelElement) return;
    const screen = this.game.projectWorldUi(altar.position, 2.42);
    altar.labelElement.hidden = !screen.visible;
    if (altar.labelElement.hidden) return;
    altar.labelElement.style.transform = `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -100%)`;
  }

  updateProgressRing(ring, altar, progress) {
    const step = Math.round(progress * 100);
    if (altar.visual.progressStep === step) return;
    altar.visual.progressStep = step;
    ring.geometry.dispose();
    ring.geometry = new THREE.RingGeometry(
      1.04,
      1.1,
      PROGRESS_SEGMENTS,
      1,
      -Math.PI / 2,
      Math.max(0.001, FULL_CIRCLE * progress)
    );
  }

  unitsForTeam(team, { includeWildlife = true } = {}) {
    if (team === TEAMS.PLAYER) return this.game.friendlyUnits;
    return this.game.enemyUnits.filter((unit) => includeWildlife || !unit.isWildlife);
  }

  snapshot() {
    return this.altars.map((altar) => ({
      id: altar.id,
      type: altar.type,
      owner: altar.owner ?? 'neutral',
      captureTeam: altar.captureTeam,
      progress: Number(altar.progress.toFixed(2)),
      contested: altar.contested
    }));
  }
}

function teamColor(team) {
  return TEAM_COLORS[team] ?? TEAM_COLORS.neutral;
}

function createAltarLabel(definition) {
  if (typeof document === 'undefined') return null;
  const element = document.createElement('div');
  element.className = 'altar-name-label';
  element.textContent = definition.name;
  element.style.setProperty('--altar-color', definition.color ?? '#d8e2df');
  element.hidden = true;
  return element;
}
