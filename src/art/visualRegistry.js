import {
  createArcherModel,
  createArrowModel,
  createMeteorModel,
  createRaiderModel,
  createSwordsmanModel
} from './lowpoly.js';

const UNIT_FACTORIES = {
  swordsman: ({ team }) => createSwordsmanModel(team),
  archer: ({ team }) => createArcherModel(team),
  raider: () => createRaiderModel()
};

const PROJECTILE_FACTORIES = {
  arrow: ({ color }) => createArrowModel(color)
};

const SPELL_FACTORIES = {
  meteor: () => createMeteorModel()
};

export function createUnitModel(type, team) {
  const factory = UNIT_FACTORIES[type] ?? UNIT_FACTORIES.raider;
  const root = factory({ team });
  root.userData.visualType = type;
  root.userData.animation = null;
  return root;
}

export function createProjectileModel(type, options = {}) {
  const factory = PROJECTILE_FACTORIES[type] ?? PROJECTILE_FACTORIES.arrow;
  return factory(options);
}

export function createSpellModel(type) {
  const factory = SPELL_FACTORIES[type] ?? SPELL_FACTORIES.meteor;
  return factory();
}

export function playUnitAnimation(unit, name, duration = getAnimationDuration(unit, name)) {
  unit.visualRoot.userData.animation = {
    name,
    duration,
    time: 0
  };
}

export function getAnimationDuration(unit, name) {
  return unit.definition.art?.timelines?.[name]?.duration ?? defaultDuration(name);
}

export function getAnimationEventTime(unit, name, eventName) {
  const duration = getAnimationDuration(unit, name);
  const eventAt = unit.definition.art?.timelines?.[name]?.events?.[eventName];
  if (typeof eventAt !== 'number') {
    return duration * 0.5;
  }
  return duration * Math.max(0, Math.min(1, eventAt));
}

export function updateUnitAnimation(unit, dt) {
  const root = unit.visualRoot;
  const state = root.userData.animation;
  if (state) {
    state.time += dt;
    const t = Math.min(1, state.time / state.duration);
    applyOneShot(root, state.name, t);
    if (t >= 1) {
      root.userData.animation = null;
    }
    return;
  }

  const time = performance.now() * 0.001;
  if (unit.visualState === 'walk') {
    root.position.y = Math.sin(time * 10 + unit.id) * 0.055;
    root.rotation.z = Math.sin(time * 8 + unit.id) * 0.035;
    return;
  }
  root.position.y = Math.sin(time * 2 + unit.id) * 0.025;
  root.rotation.z = 0;
  root.scale.setScalar(1);
}

function applyOneShot(root, name, t) {
  const pulse = Math.sin(t * Math.PI);
  if (name === 'attack') {
    root.position.y = pulse * 0.08;
    root.rotation.z = -pulse * 0.14;
    root.scale.set(1 + pulse * 0.06, 1 - pulse * 0.04, 1 + pulse * 0.06);
    return;
  }
  if (name === 'hit') {
    root.position.y = pulse * 0.04;
    root.rotation.z = pulse * 0.12;
    root.scale.set(1 - pulse * 0.04, 1 + pulse * 0.05, 1 - pulse * 0.04);
    return;
  }
  root.position.y = 0;
  root.rotation.z = 0;
  root.scale.setScalar(1);
}

function defaultDuration(name) {
  if (name === 'attack') return 0.34;
  if (name === 'hit') return 0.24;
  return 0.5;
}
