import {
  createArcherModel,
  createArrowTowerModel,
  createArrowModel,
  createBearModel,
  createBeaconModel,
  createBerserkerModel,
  createBoltModel,
  createCanteenModel,
  createCrossbowmanModel,
  createDaggerModel,
  createEnergyOrbModel,
  createEngineerModel,
  createGoblinArcherModel,
  createGoblinSoldierModel,
  createGoblinTrollModel,
  createHolyBoltModel,
  createKnightModel,
  createMeteorModel,
  createOgreModel,
  createPhysicianModel,
  createPurifierModel,
  createRaiderModel,
  createRepairStationModel,
  createRogueModel,
  createScorpionModel,
  createSkeletonArcherModel,
  createSkeletonSoldierModel,
  createSwordsmanModel,
  createWarderModel,
  createWizardModel,
  createWolfModel
} from './lowpoly.js';

const UNIT_FACTORIES = {
  knight: ({ team }) => createKnightModel(team),
  swordsman: ({ team }) => createSwordsmanModel(team),
  berserker: ({ team }) => createBerserkerModel(team),
  archer: ({ team }) => createArcherModel(team),
  crossbowman: ({ team }) => createCrossbowmanModel(team),
  rogue: ({ team }) => createRogueModel(team),
  engineer: ({ team }) => createEngineerModel(team),
  physician: ({ team }) => createPhysicianModel(team),
  purifier: ({ team }) => createPurifierModel(team),
  warder: ({ team }) => createWarderModel(team),
  raider: () => createRaiderModel(),
  ogre: () => createOgreModel(),
  skeletonSoldier: () => createSkeletonSoldierModel(),
  skeletonArcher: () => createSkeletonArcherModel(),
  wizard: () => createWizardModel(),
  goblinSoldier: () => createGoblinSoldierModel(),
  goblinArcher: () => createGoblinArcherModel(),
  goblinTroll: () => createGoblinTrollModel(),
  scorpion: () => createScorpionModel(),
  wolf: () => createWolfModel(),
  bear: () => createBearModel(),
  arrowTower: ({ team }) => createArrowTowerModel(team),
  repairStation: ({ team }) => createRepairStationModel(team),
  canteen: ({ team }) => createCanteenModel(team),
  beacon: ({ team }) => createBeaconModel(team)
};

const PROJECTILE_FACTORIES = {
  arrow: ({ color }) => createArrowModel(color),
  bolt: ({ color }) => createBoltModel(color),
  dagger: ({ color }) => createDaggerModel(color),
  holyBolt: ({ color }) => createHolyBoltModel(color),
  energyOrb: ({ color }) => createEnergyOrbModel(color)
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

export function stopUnitAnimation(unit, name = null) {
  const animation = unit.visualRoot?.userData.animation;
  if (!animation) return;
  if (name && animation.name !== name) return;
  unit.visualRoot.userData.animation = null;
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
  if (unit.isBuilding) {
    root.position.y = 0;
    root.rotation.set(0, 0, 0);
    root.scale.setScalar(1);
    return;
  }
  if (unit.visualState === 'walk') {
    root.rotation.x = 0;
    root.rotation.y = 0;
    root.position.y = Math.sin(time * 10 + unit.id) * 0.055;
    root.rotation.z = Math.sin(time * 8 + unit.id) * 0.035;
    return;
  }
  root.position.y = Math.sin(time * 2 + unit.id) * 0.025;
  root.rotation.x = 0;
  root.rotation.y = 0;
  root.rotation.z = 0;
  root.scale.setScalar(1);
}

function applyOneShot(unit, root, name, t) {
  const pulse = Math.sin(t * Math.PI);
  root.rotation.x = 0;
  root.rotation.y = 0;
  root.rotation.z = 0;
  root.scale.setScalar(1);
  if (name === 'attack') {
    if (unit.type === 'archer' || unit.type === 'goblinArcher' || unit.type === 'skeletonArcher') {
      root.position.y = pulse * 0.025;
      applyAttackPose(unit, root, t, pulse);
      return;
    }
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
  if (unit.type === 'archer' || unit.type === 'goblinArcher' || unit.type === 'skeletonArcher') {
    applyArcherAttack(root, t, pulse);
    return;
  }
  if (unit.type === 'raider' || unit.type === 'goblinSoldier' || unit.type === 'skeletonSoldier') {
    applyRaiderAttack(root, t, pulse);
    return;
  }
  if (unit.type === 'rogue') {
    applyRogueAttack(root, t, pulse);
    return;
  }
  if (unit.type === 'crossbowman') {
    applyCrossbowAttack(root, t, pulse);
    return;
  }
  if (unit.type === 'berserker' || unit.type === 'ogre' || unit.type === 'goblinTroll') {
    applyRaiderAttack(root, t, pulse);
    return;
  }
  if (unit.type === 'physician' || unit.type === 'purifier' || unit.type === 'warder' || unit.type === 'wizard') {
    applyCasterAttack(root, t, pulse);
    return;
  }
  if (unit.type === 'wolf' || unit.type === 'bear' || unit.type === 'scorpion') {
    applyBeastAttack(root, t, pulse, unit.type);
    return;
  }
  applySwordsmanAttack(root, t, pulse);
}

function applyRogueAttack(root, t, pulse) {
  applySwordsmanAttack(root, t, pulse);
  const { offhandPivot, projectileSocket } = root.userData.parts ?? {};
  const feint = bell(0.12, 0.34, 0.62, t);
  const release = bell(0.42, 0.52, 0.7, t);
  root.rotation.z += pulse * 0.025;
  root.position.y += pulse * 0.025;
  if (offhandPivot) {
    offhandPivot.rotation.x += -0.34 * feint + 0.42 * release;
    offhandPivot.rotation.z += 0.26 * feint - 0.18 * release;
  }
  if (projectileSocket) {
    projectileSocket.position.z += release * 0.18;
  }
}

function applyCrossbowAttack(root, t, pulse) {
  const { upperBodyPivot, weaponPivot, offhandPivot, gripPivot, projectileSocket, heldBolt, string } = root.userData.parts ?? {};
  const aim = smoothstep(0, 0.28, t) * (1 - smoothstep(0.78, 1, t));
  const release = bell(0.44, 0.5, 0.66, t);
  const recover = smoothstep(0.66, 1, t);
  root.position.y += pulse * 0.025;
  root.rotation.z = -0.012 * pulse;
  if (upperBodyPivot) {
    upperBodyPivot.rotation.y += -0.42 * aim + 0.08 * release;
    upperBodyPivot.rotation.x += 0.018 * aim - 0.014 * release;
  }
  if (weaponPivot) {
    weaponPivot.position.z += 0.08 * aim - 0.16 * release + 0.04 * recover;
    weaponPivot.position.y += 0.035 * aim - 0.025 * release;
    weaponPivot.rotation.x += -0.03 * aim + 0.055 * release;
    weaponPivot.rotation.z += 0.018 * aim;
  }
  if (offhandPivot) {
    offhandPivot.rotation.x += -0.18 * aim + 0.08 * release;
    offhandPivot.rotation.z += 0.04 * aim;
  }
  if (gripPivot) {
    gripPivot.rotation.x += -0.14 * aim + 0.11 * release;
    gripPivot.rotation.z += -0.035 * aim;
  }
  if (string) {
    string.position.z -= 0.12 * aim;
    string.scale.x = 1 - 0.16 * aim;
  }
  if (heldBolt) {
    heldBolt.visible = t < 0.48;
  }
  if (projectileSocket) {
    projectileSocket.position.z += 0.12 * release;
  }
}

function applySwordsmanAttack(root, t, pulse) {
  const { weaponPivot, weaponSwingPivot, offhandPivot } = root.userData.parts ?? {};
  if (!weaponPivot) return;
  const highGuard = bell(0, 0.26, 0.48, t);
  const strike = smoothstep(0.34, 0.58, t) * (1 - smoothstep(0.72, 1, t));
  const recover = smoothstep(0.72, 1, t);

  root.rotation.x += 0.014 * strike - 0.006 * highGuard;
  root.rotation.z = -0.018 * pulse;
  weaponPivot.rotation.x += -0.94 * highGuard + 1.24 * strike - 0.14 * recover;
  weaponPivot.rotation.y += 0.08 * highGuard - 0.05 * strike;
  weaponPivot.rotation.z += 0.12 * highGuard - 0.13 * strike;

  if (weaponSwingPivot) {
    weaponSwingPivot.rotation.x += -0.16 * highGuard + 0.16 * strike;
    weaponSwingPivot.rotation.z += 0.04 * highGuard - 0.05 * strike;
  }

  if (offhandPivot) {
    offhandPivot.rotation.z += 0.025 * pulse;
  }
}

function applyRaiderAttack(root, t, pulse) {
  const { weaponPivot, weaponSwingPivot, offhandPivot } = root.userData.parts ?? {};
  if (!weaponPivot) return;
  const highGuard = bell(0, 0.3, 0.54, t);
  const strike = smoothstep(0.38, 0.64, t) * (1 - smoothstep(0.78, 1, t));
  const recover = smoothstep(0.78, 1, t);

  root.rotation.x += 0.016 * strike - 0.006 * highGuard;
  root.rotation.z = -0.016 * pulse;
  weaponPivot.rotation.x += -1.04 * highGuard + 1.38 * strike - 0.16 * recover;
  weaponPivot.rotation.y += 0.07 * highGuard - 0.04 * strike;
  weaponPivot.rotation.z += 0.1 * highGuard - 0.12 * strike;

  if (weaponSwingPivot) {
    weaponSwingPivot.rotation.x += -0.18 * highGuard + 0.18 * strike;
    weaponSwingPivot.rotation.z += 0.035 * highGuard - 0.045 * strike;
  }

  if (offhandPivot) {
    offhandPivot.rotation.z += -0.015 * highGuard + 0.025 * strike;
  }
}

function applyCasterAttack(root, t, pulse) {
  const { weaponPivot, weaponSwingPivot, offhandPivot, projectileSocket } = root.userData.parts ?? {};
  if (!weaponPivot) return;
  const gather = smoothstep(0, 0.36, t) * (1 - smoothstep(0.74, 1, t));
  const release = bell(0.48, 0.57, 0.74, t);
  const recover = smoothstep(0.72, 1, t);

  root.position.y += pulse * 0.025;
  root.rotation.z = -0.01 * pulse;
  weaponPivot.rotation.x += -0.36 * gather + 0.18 * release - 0.06 * recover;
  weaponPivot.rotation.y += -0.08 * gather;
  weaponPivot.position.y += 0.06 * gather;
  if (weaponSwingPivot) {
    weaponSwingPivot.rotation.z += -0.1 * gather + 0.18 * release;
    weaponSwingPivot.rotation.x += -0.08 * gather;
  }
  if (offhandPivot) {
    offhandPivot.rotation.x += -0.28 * gather + 0.22 * release;
    offhandPivot.rotation.z += 0.08 * gather;
  }
  if (projectileSocket) {
    const glow = 1 + gather * 0.55 + release * 0.35;
    projectileSocket.scale.setScalar(glow);
  }
}

function applyArcherAttack(root, t, pulse) {
  const { upperBodyPivot, bowPivot, drawPivot, drawForearmPivot, heldArrow, string } = root.userData.parts ?? {};
  if (!bowPivot || !drawPivot) return;
  const releaseAt = 0.57;
  const aimIn = smoothstep(0, 0.22, t);
  const upperAim = aimIn * (1 - smoothstep(0.9, 1, t));
  const bowAim = aimIn * (1 - smoothstep(0.84, 1, t));
  const handRecover = smoothstep(0.6, 0.95, t);
  const handAim = aimIn * (1 - handRecover);
  const drawIn = smoothstep(0.14, 0.5, t);
  const handPull = drawIn * (1 - handRecover);
  const stringPull = drawIn * (1 - smoothstep(releaseAt, releaseAt + 0.09, t));
  const bowKick = bell(releaseAt, 0.62, 0.74, t);

  if (upperBodyPivot) {
    upperBodyPivot.position.x += 0.018 * upperAim;
    upperBodyPivot.position.z -= 0.04 * upperAim;
    upperBodyPivot.rotation.y += -0.9 * upperAim;
    upperBodyPivot.rotation.x += 0.018 * handPull - 0.006 * bowKick;
    upperBodyPivot.rotation.z += -0.012 * upperAim;
  }
  bowPivot.rotation.x += -0.055 * stringPull + 0.012 * bowKick;
  bowPivot.rotation.z += 0.024 * bowAim + 0.04 * stringPull - 0.01 * bowKick;
  drawPivot.position.x += 0.01 * handAim - 0.01 * handPull;
  drawPivot.position.y += 0.004 * handPull;
  drawPivot.position.z -= 0.22 * handAim + 0.22 * handPull;
  drawPivot.rotation.x += 0.028 * handPull;
  drawPivot.rotation.y += -0.22 * handPull;
  if (drawForearmPivot) {
    drawForearmPivot.rotation.y += 0.215 * handPull;
    drawForearmPivot.rotation.x += 0.008 * handPull;
  }

  if (string) {
    string.position.x -= 0.045 * stringPull;
    string.position.z -= 0.21 * stringPull;
    string.scale.x = 1 - 0.24 * stringPull;
  }
  if (heldArrow) {
    heldArrow.visible = t < releaseAt;
    heldArrow.position.x -= 0.004 * handPull;
    heldArrow.position.z -= 0.26 * handPull;
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
