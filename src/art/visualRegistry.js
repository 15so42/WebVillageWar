import {
  createArcherModel,
  createArrowTowerModel,
  createArrowModel,
  createBearModel,
  createBeaconModel,
  createBerserkerModel,
  createBombProjectileModel,
  createBoltModel,
  createCanteenModel,
  createCrossbowmanModel,
  createDaggerModel,
  createEnergyOrbModel,
  createEngineerModel,
  createFrostAcolyteModel,
  createGoblinArcherModel,
  createGoblinBomberModel,
  createGoblinHunterModel,
  createGoblinShamanModel,
  createGoblinSoldierModel,
  createGoblinTrollModel,
  createHolyBoltModel,
  createIceShardModel,
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
  createShieldBearerModel,
  createSpiderEggModel,
  createSpiderModel,
  createSwordsmanModel,
  createElfSniperModel,
  createVenomArcherModel,
  createVenomArrowModel,
  createWarderModel,
  createWaterMageModel,
  createWaterOrbModel,
  createWardSigilModel,
  createWizardModel,
  createWolfModel
} from './lowpoly.js';

const UNIT_FACTORIES = {
  knight: ({ team }) => createKnightModel(team),
  swordsman: ({ team }) => createSwordsmanModel(team),
  berserker: ({ team }) => createBerserkerModel(team),
  archer: ({ team }) => createArcherModel(team),
  crossbowman: ({ team }) => createCrossbowmanModel(team),
  waterMage: ({ team }) => createWaterMageModel(team),
  rogue: ({ team }) => createRogueModel(team),
  engineer: ({ team }) => createEngineerModel(team),
  physician: ({ team }) => createPhysicianModel(team),
  purifier: ({ team }) => createPurifierModel(team),
  warder: ({ team }) => createWarderModel(team),
  raider: () => createRaiderModel(),
  enemyRaider: () => createRaiderModel(),
  ogre: () => createOgreModel(),
  skeletonSoldier: () => createSkeletonSoldierModel(),
  skeletonArcher: () => createSkeletonArcherModel(),
  wizard: () => createWizardModel(),
  goblinSoldier: () => createGoblinSoldierModel(),
  goblinArcher: () => createGoblinArcherModel(),
  goblinHunter: () => createGoblinHunterModel(),
  goblinBomber: () => createGoblinBomberModel(),
  goblinShaman: () => createGoblinShamanModel(),
  shieldBearer: () => createShieldBearerModel(),
  venomArcher: () => createVenomArcherModel(),
  elfSniper: () => createElfSniperModel(),
  frostAcolyte: () => createFrostAcolyteModel(),
  goblinTroll: () => createGoblinTrollModel(),
  scorpion: () => createScorpionModel(),
  spider: () => createSpiderModel(),
  spiderEgg: () => createSpiderEggModel(),
  wolf: () => createWolfModel(),
  bear: () => createBearModel(),
  arrowTower: ({ team }) => createArrowTowerModel(team),
  miniTurret: ({ team }) => {
    const group = createArrowTowerModel(team);
    group.scale.setScalar(0.55);
    return group;
  },
  repairStation: ({ team }) => createRepairStationModel(team),
  canteen: ({ team }) => createCanteenModel(team),
  beacon: ({ team }) => createBeaconModel(team)
};

const PROJECTILE_FACTORIES = {
  arrow: ({ color }) => createArrowModel(color),
  venomArrow: ({ color }) => createVenomArrowModel(color),
  bomb: () => createBombProjectileModel(),
  iceShard: ({ color }) => createIceShardModel(color),
  bolt: ({ color }) => createBoltModel(color),
  dagger: ({ color }) => createDaggerModel(color),
  holyBolt: ({ color }) => createHolyBoltModel(color),
  wardSigil: ({ color }) => createWardSigilModel(color),
  energyOrb: ({ color }) => createEnergyOrbModel(color),
  waterOrb: ({ color }) => createWaterOrbModel(color)
};

const WALK_BOB_RATE = 6.4;
const WALK_SWAY_RATE = 5.2;
const WALK_BOB_HEIGHT = 0.022;
const WALK_SWAY_ANGLE = 0.012;
const IDLE_BOB_HEIGHT = 0.014;

const SPELL_FACTORIES = {
  meteor: () => createMeteorModel()
};

export function createUnitModel(type, team) {
  const root = createUnitModelRoot(type, team);
  root.userData.visualType = type;
  root.userData.animation = null;
  return root;
}

export function prewarmUnitModelTemplates(entries = []) {
  // Kept as a stable API for Game startup. Unit models contain nested
  // userData object references for animation sockets, so cloning full
  // templates is unsafe; model pooling should happen at a lower level.
  void entries;
}

function createUnitModelRoot(type, team) {
  const factory = UNIT_FACTORIES[type] ?? UNIT_FACTORIES.raider;
  const root = factory({ team });
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

export function playUnitAnimation(unit, name, duration = getAnimationDuration(unit, name), options = {}) {
  unit.visualRoot.userData.animation = {
    name,
    duration,
    time: 0,
    variant: options.variant ?? null
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
  root.position.x = 0;
  root.position.z = 0;
  const state = root.userData.animation;
  if (state) {
    state.time += dt;
    const t = Math.min(1, state.time / state.duration);
    applyOneShot(unit, root, state.name, t, state);
    if (t >= 1) {
      root.userData.animation = null;
    }
    return;
  }

  const time = performance.now() * 0.001;
  if (unit.isBuilding) {
    root.position.y = rootGroundOffset(root);
    root.rotation.set(0, 0, 0);
    root.scale.setScalar(1);
    return;
  }
  if (unit.visualState === 'walk') {
    root.rotation.x = 0;
    root.rotation.y = 0;
    root.position.y = rootGroundOffset(root) + Math.sin(time * WALK_BOB_RATE + unit.id) * WALK_BOB_HEIGHT;
    root.rotation.z = Math.sin(time * WALK_SWAY_RATE + unit.id) * WALK_SWAY_ANGLE;
    return;
  }
  root.position.y = rootGroundOffset(root) + Math.sin(time * 1.7 + unit.id) * IDLE_BOB_HEIGHT;
  root.rotation.x = 0;
  root.rotation.y = 0;
  root.rotation.z = 0;
  root.scale.setScalar(1);
}

function rootGroundOffset(root) {
  return Number.isFinite(root?.userData?.groundOffset) ? root.userData.groundOffset : 0;
}

function applyOneShot(unit, root, name, t, state = null) {
  const pulse = Math.sin(t * Math.PI);
  root.rotation.x = 0;
  root.rotation.y = 0;
  root.rotation.z = 0;
  root.scale.setScalar(1);
  if (unit.isBuilding) {
    root.position.y = pulse * (name === 'hit' ? 0.035 : 0.025);
    if (name === 'hit') {
      root.scale.set(1 - pulse * 0.025, 1 + pulse * 0.035, 1 - pulse * 0.025);
    } else if (name === 'attack') {
      root.scale.set(1 + pulse * 0.018, 1 - pulse * 0.012, 1 + pulse * 0.018);
    }
    return;
  }
  if (name === 'attack') {
    if (isBowAttackUnit(unit.type)) {
      root.position.y = pulse * 0.025;
      applyAttackPose(unit, root, t, pulse, state?.variant);
      return;
    }
    root.position.y = pulse * 0.045;
    root.rotation.z = -pulse * 0.035;
    root.scale.set(1 + pulse * 0.025, 1 - pulse * 0.018, 1 + pulse * 0.025);
    applyAttackPose(unit, root, t, pulse, state?.variant);
    return;
  }
  if (name === 'hit') {
    root.position.y = pulse * 0.04;
    root.rotation.z = pulse * 0.12;
    root.scale.set(1 - pulse * 0.04, 1 + pulse * 0.05, 1 - pulse * 0.04);
    return;
  }
  if (name === 'support') {
    root.position.y = pulse * 0.028;
    root.rotation.z = -pulse * 0.012;
    applySupportPose(unit, root, t, pulse, state?.variant);
    return;
  }
  root.position.y = 0;
  root.rotation.z = 0;
  root.scale.setScalar(1);
}

function applyAttackPose(unit, root, t, pulse, variant = null) {
  if (unit.type === 'goblinBomber') {
    applyBomberAttack(root, t, pulse);
    return;
  }
  if (unit.type === 'shieldBearer') {
    applyShieldBearerAttack(root, t, pulse);
    return;
  }
  if (unit.type === 'frostAcolyte') {
    applyFrostAcolyteAttack(root, t, pulse);
    return;
  }
  if (isBowAttackUnit(unit.type)) {
    applyArcherAttack(root, t, pulse);
    if (unit.type === 'venomArcher') {
      applyVenomArcherExtras(root, t, pulse);
    }
    return;
  }
  if (
    unit.type === 'raider' ||
    unit.type === 'enemyRaider' ||
    unit.type === 'goblinSoldier' ||
    unit.type === 'goblinBomber' ||
    unit.type === 'skeletonSoldier'
  ) {
    applyRaiderAttack(root, t, pulse);
    return;
  }
  if (unit.type === 'rogue') {
    applyRogueAttack(root, t, pulse, variant);
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
  if (
    unit.type === 'physician' ||
    unit.type === 'purifier' ||
    unit.type === 'goblinShaman' ||
    unit.type === 'wizard' ||
    unit.type === 'waterMage'
  ) {
    applyCasterAttack(root, t, pulse);
    return;
  }
  if (unit.type === 'warder') {
    applyWarderAttack(root, t, pulse);
    return;
  }
  if (unit.type === 'wolf' || unit.type === 'bear' || unit.type === 'scorpion' || unit.type === 'spider') {
    applyBeastAttack(root, t, pulse, unit.type);
    return;
  }
  applySwordsmanAttack(root, t, pulse);
}

function isBowAttackUnit(type) {
  return type === 'archer' ||
    type === 'goblinArcher' ||
    type === 'goblinHunter' ||
    type === 'elfSniper' ||
    type === 'skeletonArcher' ||
    type === 'venomArcher';
}

function applyRogueAttack(root, t, pulse, variant = null) {
  if (variant === 'throw') {
    applyRogueThrowAttack(root, t, pulse);
    return;
  }
  applyRogueSlashAttack(root, t, pulse);
}

function applyRogueSlashAttack(root, t, pulse) {
  applyRogueArmSwipe(root, t, pulse, false);
}

function applyRogueThrowAttack(root, t, pulse) {
  applyRogueArmSwipe(root, t, pulse, true);
}

function applyRogueArmSwipe(root, t, pulse, isThrow) {
  const { upperBodyPivot, weaponPivot, weaponSwingPivot, offhandPivot, rogueElbowPivot } = root.userData.parts ?? {};
  if (!weaponPivot) return;
  const ready = smoothstep(0, 0.22, t) * (1 - smoothstep(0.76, 1, t));
  const slide = smoothstep(0.28, 0.56, t) * (1 - smoothstep(0.68, 0.92, t));
  const snap = bell(0.42, 0.55, 0.72, t);
  const release = isThrow ? bell(0.46, 0.58, 0.74, t) : 0;
  const recover = smoothstep(0.7, 1, t);
  const bodyTurn = smoothstep(0.04, 0.28, t) * (1 - smoothstep(0.76, 1, t));
  const armSlash = smoothstep(0.16, 0.46, t) * (1 - smoothstep(0.76, 1, t));
  root.position.y += pulse * 0.024;
  if (upperBodyPivot) {
    upperBodyPivot.position.x += 0.012 * bodyTurn;
    upperBodyPivot.position.z -= 0.028 * bodyTurn;
    upperBodyPivot.rotation.y += 0.82 * bodyTurn;
    upperBodyPivot.rotation.z += -0.012 * bodyTurn;
  } else {
    root.rotation.y += 0.23 * bodyTurn;
  }
  root.rotation.z += 0.018 * ready - 0.024 * slide;
  weaponPivot.rotation.x += -0.2 * ready + 0.12 * slide + 0.08 * release - 0.04 * recover;
  weaponPivot.rotation.y += 1.38 * armSlash;
  weaponPivot.rotation.z += -0.42 * ready + 1.05 * slide + 0.18 * release - 0.14 * recover;
  if (rogueElbowPivot) {
    rogueElbowPivot.rotation.x += 0.2 * ready - 0.3 * slide + 0.34 * release;
    rogueElbowPivot.rotation.y += 0.34 * armSlash;
    rogueElbowPivot.rotation.z += 0.24 * ready - 0.46 * slide + 0.12 * recover;
  }
  if (weaponSwingPivot) {
    weaponSwingPivot.rotation.x += -0.08 * ready + 0.18 * snap + 0.22 * release;
    weaponSwingPivot.rotation.y += -0.42 * armSlash;
    weaponSwingPivot.rotation.z += 0.16 * ready - 0.34 * slide;
  }
  if (offhandPivot) {
    offhandPivot.rotation.x += -0.06 * ready + 0.035 * slide;
    offhandPivot.rotation.z += -0.1 * ready + 0.06 * slide;
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

function applyBomberAttack(root, t, pulse) {
  const { weaponPivot, weaponSwingPivot, offhandPivot, projectileSocket, spark, matchTip } = root.userData.parts ?? {};
  const windup = smoothstep(0, 0.36, t) * (1 - smoothstep(0.7, 1, t));
  const throwOut = smoothstep(0.42, 0.58, t) * (1 - smoothstep(0.78, 1, t));
  const release = bell(0.52, 0.58, 0.72, t);
  const recover = smoothstep(0.72, 1, t);

  root.position.y += pulse * 0.03 + release * 0.025;
  root.rotation.z = -0.018 * windup + 0.04 * throwOut;
  root.rotation.x += -0.04 * windup + 0.06 * throwOut;
  if (weaponPivot) {
    weaponPivot.position.z -= 0.08 * windup;
    weaponPivot.position.y += 0.08 * windup + 0.04 * throwOut;
    weaponPivot.rotation.x += -0.72 * windup + 0.96 * throwOut - 0.18 * recover;
    weaponPivot.rotation.z += -0.34 * windup + 0.22 * throwOut;
  }
  if (weaponSwingPivot) {
    weaponSwingPivot.rotation.x += -0.24 * windup + 0.36 * throwOut;
    weaponSwingPivot.rotation.z += 0.2 * windup - 0.12 * throwOut;
    weaponSwingPivot.scale.setScalar(Math.max(0.45, 1 - release * 0.42));
  }
  if (offhandPivot) {
    offhandPivot.rotation.x += -0.1 * windup + 0.08 * release;
    offhandPivot.rotation.z += 0.1 * windup;
  }
  if (projectileSocket) {
    projectileSocket.scale.setScalar(1 + windup * 0.2 + release * 0.4);
  }
  if (spark) {
    spark.scale.setScalar(1 + pulse * 0.16 + windup * 0.2);
  }
  if (matchTip) {
    matchTip.scale.setScalar(1 + pulse * 0.18 + release * 0.22);
  }
}

function applyShieldBearerAttack(root, t, pulse) {
  const { weaponPivot, weaponSwingPivot, shieldPivot, shield } = root.userData.parts ?? {};
  const brace = smoothstep(0, 0.3, t) * (1 - smoothstep(0.76, 1, t));
  const bash = smoothstep(0.34, 0.56, t) * (1 - smoothstep(0.76, 1, t));
  const recover = smoothstep(0.76, 1, t);

  root.position.y += pulse * 0.025;
  root.position.z += 0.025 * bash - 0.012 * recover;
  root.rotation.x += -0.025 * brace + 0.035 * bash;
  if (shieldPivot) {
    shieldPivot.position.z += 0.12 * brace + 0.36 * bash - 0.08 * recover;
    shieldPivot.position.y += 0.05 * brace;
    shieldPivot.rotation.x += -0.18 * brace - 0.12 * bash;
    shieldPivot.rotation.z += -0.08 * brace + 0.04 * bash;
  }
  if (shield) {
    shield.scale.set(1 + bash * 0.04, 1 + bash * 0.02, 1);
  }
  if (weaponPivot) {
    weaponPivot.rotation.x += -0.28 * brace + 0.48 * bash - 0.08 * recover;
    weaponPivot.rotation.z += 0.14 * brace - 0.16 * bash;
  }
  if (weaponSwingPivot) {
    weaponSwingPivot.rotation.x += -0.12 * brace + 0.2 * bash;
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

function applyFrostAcolyteAttack(root, t, pulse) {
  applyCasterAttack(root, t, pulse);
  const { crystalCluster, shardRing, projectileSocket } = root.userData.parts ?? {};
  const gather = smoothstep(0, 0.4, t) * (1 - smoothstep(0.78, 1, t));
  const release = bell(0.48, 0.57, 0.74, t);
  if (crystalCluster) {
    crystalCluster.rotation.y += gather * 0.32 + release * 0.55;
    crystalCluster.scale.setScalar(1 + gather * 0.28 + release * 0.22);
  }
  if (shardRing) {
    shardRing.rotation.y += gather * 0.22 + pulse * 0.08;
    shardRing.position.y += gather * 0.05;
  }
  if (projectileSocket) {
    projectileSocket.scale.setScalar(1 + gather * 0.42 + release * 0.48);
  }
}

function applySupportPose(unit, root, t, pulse, variant = null) {
  if (unit.type === 'warder') {
    applyWarderSupport(root, t, pulse);
    return;
  }
  if (unit.type === 'engineer') {
    applyEngineerSupport(root, t, pulse);
    return;
  }
  applyCasterSupport(root, t, pulse, variant);
}

function applyCasterSupport(root, t, pulse) {
  const { weaponPivot, weaponSwingPivot, offhandPivot, projectileSocket } = root.userData.parts ?? {};
  const gather = smoothstep(0, 0.4, t) * (1 - smoothstep(0.78, 1, t));
  const release = bell(0.46, 0.62, 0.82, t);
  root.rotation.z += -0.008 * pulse;
  if (weaponPivot) {
    weaponPivot.position.y += 0.12 * gather;
    weaponPivot.position.z += 0.04 * gather;
    weaponPivot.rotation.x += -0.5 * gather + 0.16 * release;
    weaponPivot.rotation.z += -0.08 * gather;
  }
  if (weaponSwingPivot) {
    weaponSwingPivot.rotation.x += -0.16 * gather + 0.08 * release;
    weaponSwingPivot.rotation.z += 0.12 * gather;
  }
  if (offhandPivot) {
    offhandPivot.rotation.x += -0.18 * gather + 0.08 * release;
    offhandPivot.position.y += 0.05 * gather;
  }
  if (projectileSocket) {
    projectileSocket.scale.setScalar(1 + gather * 0.5 + release * 0.22);
  }
}

function applyEngineerSupport(root, t, pulse) {
  const { weaponPivot, weaponSwingPivot, offhandPivot } = root.userData.parts ?? {};
  const gather = smoothstep(0, 0.42, t) * (1 - smoothstep(0.78, 1, t));
  const release = bell(0.5, 0.62, 0.82, t);
  root.rotation.z += -0.01 * pulse;
  if (weaponPivot) {
    weaponPivot.position.y += 0.14 * gather;
    weaponPivot.position.z += 0.05 * gather;
    weaponPivot.rotation.x += -0.7 * gather + 0.22 * release;
    weaponPivot.rotation.z += -0.18 * gather;
  }
  if (weaponSwingPivot) {
    weaponSwingPivot.rotation.z += 0.2 * gather - 0.12 * release;
    weaponSwingPivot.rotation.x += -0.12 * gather;
  }
  if (offhandPivot) {
    offhandPivot.position.y += 0.06 * gather;
    offhandPivot.rotation.x += -0.12 * gather;
  }
}

function applyWarderSupport(root, t, pulse) {
  const { warderRightHandPivot, warderLeftHandPivot, wardCirclePivot, projectileSocket } = root.userData.parts ?? {};
  const gather = smoothstep(0, 0.44, t) * (1 - smoothstep(0.82, 1, t));
  const release = bell(0.48, 0.64, 0.84, t);
  root.rotation.z += -0.006 * pulse;
  if (warderRightHandPivot) {
    warderRightHandPivot.position.z += 0.08 * gather;
    warderRightHandPivot.position.y += 0.06 * gather;
    warderRightHandPivot.rotation.x += -0.12 * gather;
  }
  if (warderLeftHandPivot) {
    warderLeftHandPivot.position.z += 0.08 * gather;
    warderLeftHandPivot.position.y -= 0.05 * gather;
    warderLeftHandPivot.rotation.x += 0.1 * gather;
  }
  if (wardCirclePivot) {
    wardCirclePivot.position.z += 0.08 * gather;
    wardCirclePivot.rotation.z += 0.34 * gather + 0.56 * release;
    wardCirclePivot.scale.setScalar(1 + gather * 0.48 + release * 0.28);
  }
  if (projectileSocket) {
    projectileSocket.scale.setScalar(1 + gather * 0.34 + release * 0.3);
  }
}

function applyWarderAttack(root, t, pulse) {
  const { warderRightHandPivot, warderLeftHandPivot, wardCirclePivot, projectileSocket } = root.userData.parts ?? {};
  const gather = smoothstep(0, 0.36, t) * (1 - smoothstep(0.78, 1, t));
  const release = bell(0.46, 0.56, 0.72, t);
  const push = smoothstep(0.4, 0.6, t) * (1 - smoothstep(0.72, 1, t));
  const recover = smoothstep(0.72, 1, t);

  root.position.y += pulse * 0.018;
  root.rotation.z = -0.006 * pulse;
  if (warderRightHandPivot) {
    warderRightHandPivot.position.z += 0.08 * gather + 0.18 * push - 0.06 * recover;
    warderRightHandPivot.position.y += 0.03 * gather + 0.04 * release;
    warderRightHandPivot.rotation.x += -0.08 * gather - 0.14 * push;
    warderRightHandPivot.rotation.z += -0.08 * gather;
  }
  if (warderLeftHandPivot) {
    warderLeftHandPivot.position.z += 0.08 * gather + 0.18 * push - 0.06 * recover;
    warderLeftHandPivot.position.y -= 0.03 * gather - 0.035 * release;
    warderLeftHandPivot.rotation.x += 0.08 * gather - 0.08 * push;
    warderLeftHandPivot.rotation.z += 0.08 * gather;
  }
  if (wardCirclePivot) {
    wardCirclePivot.position.z += 0.08 * gather + 0.28 * push;
    wardCirclePivot.position.y += 0.015 * gather;
    wardCirclePivot.rotation.z += gather * 0.4 + release * 0.9;
    wardCirclePivot.scale.setScalar(1 + gather * 0.18 + release * 0.24);
  }
  if (projectileSocket) {
    projectileSocket.scale.setScalar(1 + gather * 0.28 + release * 0.45);
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

function applyVenomArcherExtras(root, t, pulse) {
  const { venomVial, projectileSocket } = root.userData.parts ?? {};
  const drawIn = smoothstep(0.14, 0.5, t) * (1 - smoothstep(0.6, 0.95, t));
  const release = bell(0.57, 0.64, 0.78, t);
  if (venomVial) {
    venomVial.rotation.z += 0.12 * pulse + 0.24 * drawIn;
    venomVial.scale.setScalar(1 + drawIn * 0.08 + release * 0.12);
  }
  if (projectileSocket) {
    projectileSocket.scale.setScalar(1 + drawIn * 0.18 + release * 0.25);
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
  if (name === 'support') return 0.58;
  return 0.5;
}
