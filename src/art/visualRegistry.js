import {
  createArcherModel,
  createArrowModel,
  createBearModel,
  createMeteorModel,
  createRaiderModel,
  createSwordsmanModel,
  createWolfModel
} from './lowpoly.js';

const UNIT_FACTORIES = {
  swordsman: ({ team }) => createSwordsmanModel(team),
  archer: ({ team }) => createArcherModel(team),
  raider: () => createRaiderModel(),
  wolf: () => createWolfModel(),
  bear: () => createBearModel()
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
  captureAnimatedDefaults(root);
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
  resetAnimatedParts(root);
  const state = root.userData.animation;
  if (state) {
    state.time += dt;
    const t = Math.min(1, state.time / state.duration);
    applyOneShot(unit, root, state.name, t);
    if (t >= 1) {
      root.userData.animation = null;
    }
    return;
  }

  const time = performance.now() * 0.001;
  if (unit.visualState === 'walk') {
    root.rotation.x = 0;
    root.position.y = Math.sin(time * 10 + unit.id) * 0.055;
    root.rotation.z = Math.sin(time * 8 + unit.id) * 0.035;
    return;
  }
  root.position.y = Math.sin(time * 2 + unit.id) * 0.025;
  root.rotation.x = 0;
  root.rotation.z = 0;
  root.scale.setScalar(1);
}

function applyOneShot(unit, root, name, t) {
  const pulse = Math.sin(t * Math.PI);
  root.rotation.x = 0;
  root.rotation.z = 0;
  root.scale.setScalar(1);
  if (name === 'attack') {
    root.position.y = pulse * 0.045;
    root.rotation.z = -pulse * 0.035;
    root.scale.set(1 + pulse * 0.025, 1 - pulse * 0.018, 1 + pulse * 0.025);
    applyAttackPose(unit, root, t, pulse);
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

function applyAttackPose(unit, root, t, pulse) {
  if (unit.type === 'archer') {
    applyArcherAttack(root, t, pulse);
    return;
  }
  if (unit.type === 'raider') {
    applyRaiderAttack(root, t, pulse);
    return;
  }
  if (unit.type === 'wolf' || unit.type === 'bear') {
    applyBeastAttack(root, t, pulse, unit.type);
    return;
  }
  applySwordsmanAttack(root, t, pulse);
}

function applySwordsmanAttack(root, t, pulse) {
  const { weaponPivot, weaponSwingPivot, offhandPivot } = root.userData.parts ?? {};
  if (!weaponPivot) return;
  const windup = bell(0, 0.23, 0.52, t);
  const strike = smoothstep(0.28, 0.56, t) * (1 - smoothstep(0.72, 1, t));
  const recover = smoothstep(0.72, 1, t);

  root.rotation.x += 0.02 * strike - 0.008 * windup;
  root.rotation.z = -0.018 * pulse;
  weaponPivot.rotation.x += -0.44 * windup + 0.86 * strike - 0.12 * recover;
  weaponPivot.rotation.y += 0.06 * windup - 0.04 * strike;
  weaponPivot.rotation.z += 0.07 * windup - 0.1 * strike;

  if (weaponSwingPivot) {
    weaponSwingPivot.rotation.x += 0.08 * strike;
    weaponSwingPivot.rotation.z += -0.03 * strike;
  }

  if (offhandPivot) {
    offhandPivot.rotation.z += 0.025 * pulse;
  }
}

function applyRaiderAttack(root, t, pulse) {
  const { weaponPivot, weaponSwingPivot, offhandPivot } = root.userData.parts ?? {};
  if (!weaponPivot) return;
  const windup = bell(0, 0.28, 0.58, t);
  const strike = smoothstep(0.34, 0.62, t) * (1 - smoothstep(0.78, 1, t));
  const recover = smoothstep(0.78, 1, t);

  root.rotation.x += 0.024 * strike - 0.008 * windup;
  root.rotation.z = -0.016 * pulse;
  weaponPivot.rotation.x += -0.52 * windup + 1.02 * strike - 0.14 * recover;
  weaponPivot.rotation.y += 0.05 * windup - 0.035 * strike;
  weaponPivot.rotation.z += 0.055 * windup - 0.085 * strike;

  if (weaponSwingPivot) {
    weaponSwingPivot.rotation.x += 0.09 * strike;
    weaponSwingPivot.rotation.z += -0.025 * strike;
  }

  if (offhandPivot) {
    offhandPivot.rotation.z += -0.015 * windup + 0.025 * strike;
  }
}

function applyArcherAttack(root, t, pulse) {
  const { bowPivot, drawPivot, heldArrow, string } = root.userData.parts ?? {};
  if (!bowPivot || !drawPivot) return;
  const pull = smoothstep(0, 0.42, t) * (1 - smoothstep(0.5, 0.66, t));
  const releaseSnap = bell(0.48, 0.58, 0.82, t);

  root.rotation.x += 0.05 * pull - 0.03 * releaseSnap;
  bowPivot.rotation.x += -0.08 * pull + 0.04 * releaseSnap;
  bowPivot.rotation.z += 0.06 * pull;
  drawPivot.position.z -= 0.38 * pull;
  drawPivot.position.y += 0.06 * pull;
  drawPivot.rotation.x += -0.18 * pull + 0.08 * releaseSnap;

  if (string) {
    string.position.z -= 0.27 * pull;
    string.scale.x = 1 - 0.14 * pull + 0.08 * releaseSnap;
  }
  if (heldArrow) {
    heldArrow.visible = t < 0.52;
    heldArrow.position.z -= 0.32 * pull;
    heldArrow.position.y += 0.02 * pull;
  }
}

function applyBeastAttack(root, t, pulse, type) {
  const { headPivot, frontPivot, tailPivot } = root.userData.parts ?? {};
  const windup = bell(0, 0.28, 0.54, t);
  const strike = smoothstep(0.34, 0.62, t) * (1 - smoothstep(0.78, 1, t));
  const snap = bell(0.42, 0.58, 0.78, t);

  if (type === 'bear') {
    root.position.y = pulse * 0.05 + windup * 0.16;
    root.rotation.x += -0.13 * windup + 0.09 * strike;
    root.scale.set(1 + pulse * 0.025, 1 - pulse * 0.012, 1 + pulse * 0.035);
    if (frontPivot) {
      frontPivot.rotation.x += -0.92 * windup + 1.28 * strike;
      frontPivot.position.y += 0.22 * windup - 0.08 * strike;
    }
    if (headPivot) {
      headPivot.rotation.x += -0.22 * windup + 0.28 * snap;
      headPivot.position.z += 0.12 * strike;
    }
    return;
  }

  root.position.y = pulse * 0.07;
  root.rotation.x += -0.06 * windup + 0.12 * snap;
  root.scale.set(1 + snap * 0.08, 1 - snap * 0.05, 1 + snap * 0.14);
  if (headPivot) {
    headPivot.rotation.x += 0.2 * windup - 0.42 * snap;
    headPivot.position.z += 0.24 * snap;
    headPivot.position.y -= 0.04 * snap;
  }
  if (frontPivot) {
    frontPivot.rotation.x += -0.28 * windup + 0.48 * snap;
  }
  if (tailPivot) {
    tailPivot.rotation.x += -0.22 * pulse;
    tailPivot.rotation.z += 0.2 * pulse;
  }
}

function captureAnimatedDefaults(root) {
  root.traverse((object) => {
    if (object === root) return;
    object.userData.bindPose = {
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
      visible: object.visible
    };
  });
}

function resetAnimatedParts(root) {
  root.traverse((object) => {
    const bindPose = object.userData.bindPose;
    if (!bindPose) return;
    object.position.copy(bindPose.position);
    object.quaternion.copy(bindPose.quaternion);
    object.scale.copy(bindPose.scale);
    object.visible = bindPose.visible;
  });
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function bell(start, peak, end, value) {
  return smoothstep(start, peak, value) * (1 - smoothstep(peak, end, value));
}

function defaultDuration(name) {
  if (name === 'attack') return 0.34;
  if (name === 'hit') return 0.24;
  return 0.5;
}
