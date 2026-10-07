import {
  createArcherModel,
  createArrowTowerModel,
  createManaFurnaceModel,
  createMiniTurretModel,
  createMireHunterModel,
  createMireJavelinModel,
  createArrowModel,
  createBearModel,
  createBeaconModel,
  createBerserkerModel,
  createBoneChantOrbModel,
  createBoneVoicePriestModel,
  createBombProjectileModel,
  createBoltModel,
  createCanteenModel,
  createCrossbowmanModel,
  createDaggerModel,
  createDuskFrostOrbModel,
  createEnergyOrbModel,
  createEngineerModel,
  createFrostAcolyteModel,
  createFurnaceModel,
  createEnchantTableModel,
  createFrostArrowModel,
  createResearchStationModel,
  createTreePitModel,
  createManualWorkbenchModel,
  createChestModel,
  createFrostScoutModel,
  createFrostTrollBossModel,
  createFrostOracleBossModel,
  createGoblinArcherModel,
  createGoblinBomberModel,
  createGoblinHunterModel,
  createGoblinShamanModel,
  createGoblinSoldierModel,
  createGoblinTrollModel,
  createHolyBoltModel,
  createIceShardModel,
  createKnightModel,
  createLightningMageModel,
  createLanternBoltModel,
  createSpearmanModel,
  createSwordsmanModel,
  createTowerShieldModel,
  createMeteorModel,
  createOgreModel,
  createPhysicianModel,
  createPurifierModel,
  createRaiderModel,
  createRepairStationModel,
  createRotrootColossusModel,
  createRogueModel,
  createScorpionModel,
  createSandScorpionGuardModel,
  createSkeletonArcherModel,
  createSkeletonSoldierModel,
  createShieldBearerModel,
  createSpiderEggModel,
  createSpiderModel,
  createSnowDuskShamanModel,
  createElfSniperModel,
  createTombLanternCrossbowmanModel,
  createThornVineModel,
  createVenomArcherModel,
  createVenomArrowModel,
  createWarderModel,
  createWaterMageModel,
  createWaterOrbModel,
  createWardSigilModel,
  createWindMageModel,
  createWizardModel,
  createWolfModel,
  createWoodPuppetModel,
  createYellowSandOgreModel,
  createToolModel
} from './lowpoly.js';
import * as THREE from 'three';

function createSharedRaiderVisual() {
  return createRaiderModel({
    team: 'player',
    fieldStyle: true,
    panelColor: '#7f3932',
    beltColor: '#4d3024',
    leatherColor: '#4d3024',
    headbandColor: '#3a261e',
    shoulderSide: 1
  });
}

// 防御终端：三种定位 × 三级投资。同一个工厂按 variant + tier 出形状与材质都不同的模型，
// 不靠悬浮文字或换色充当差异（见 createArrowTowerModel 的注释）。
const TOWER_VARIANTS = {
  arrowTower: 'arrowTower',
  ballista: 'ballista',
  shockTower: 'shockTower'
};
const TOWER_VISUAL_FACTORIES = {};
Object.entries(TOWER_VARIANTS).forEach(([towerId, variant]) => {
  for (let tier = 1; tier <= 3; tier += 1) {
    const unitType = tier <= 1 ? towerId : `${towerId}${['I', 'II', 'III'][tier - 1]}`;
    TOWER_VISUAL_FACTORIES[unitType] = ({ team }) => createArrowTowerModel(team, { variant, tier });
  }
});

const UNIT_FACTORIES = {
  knight: ({ team }) => createKnightModel(team),
  spearman: ({ team }) => createSpearmanModel(team),
  towerShield: ({ team }) => createTowerShieldModel(team),
  swordsman: ({ team }) => createSwordsmanModel(team),
  berserker: ({ team }) => createBerserkerModel(team),
  archer: ({ team }) => createArcherModel(team),
  crossbowman: ({ team }) => createCrossbowmanModel(team),
  waterMage: ({ team }) => createWaterMageModel(team),
  lightningMage: ({ team }) => createLightningMageModel(team),
  windMage: ({ team }) => createWindMageModel(team),
  rogue: ({ team }) => createRogueModel(team),
  engineer: ({ team }) => createEngineerModel(team),
  // 木傀儡：非战斗后勤单位。不注册会静默回落到 raider 模型
  woodPuppet: ({ team }) => createWoodPuppetModel(team),
  ironPuppet: ({ team }) => createWoodPuppetModel(team),
  andGate: ({ team }) => createChestModel(team),
  orGate: ({ team }) => createChestModel(team),
  notGate: ({ team }) => createChestModel(team),
  physician: ({ team }) => createPhysicianModel(team),
  purifier: ({ team }) => createPurifierModel(team),
  warder: ({ team }) => createWarderModel(team),
  raider: () => createSharedRaiderVisual(),
  enemyRaider: () => createSharedRaiderVisual(),
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
  frostScout: () => createFrostScoutModel(),
  frostTrollBoss: () => createFrostTrollBossModel(),
  snowDuskShaman: () => createSnowDuskShamanModel(),
  tombLanternCrossbowman: () => createTombLanternCrossbowmanModel(),
  boneVoicePriest: () => createBoneVoicePriestModel(),
  sandScorpionGuard: () => createSandScorpionGuardModel(),
  yellowSandOgre: () => createYellowSandOgreModel(),
  mireHunter: () => createMireHunterModel(),
  rotrootColossus: () => createRotrootColossusModel(),
  scorpion: () => createScorpionModel(),
  spider: () => createSpiderModel(),
  spiderEgg: () => createSpiderEggModel(),
  // 刷怪巢穴借用蜘蛛卵的模型：只是外形借用，类型不同所以不会触发蜘蛛那套
  // 孵化生命周期——拿 spiderEgg 当类型会让巢穴变成会孵化的活单位。
  spawnPointNest: () => createSpiderEggModel(),
  wolf: () => createWolfModel(),
  wolfFrost: () => createWolfModel({ frost: true }),
  frostWolf: () => createWolfModel({ frost: true }),
  frostWolfBoss: () => createWolfModel({ boss: true }),
  frostOracleBoss: () => createFrostOracleBossModel(),
  bear: () => createBearModel(),
  ...TOWER_VISUAL_FACTORIES,
  miniTurret: ({ team }) => createMiniTurretModel(team),
  repairStation: ({ team }) => createRepairStationModel(team),
  canteen: ({ team }) => createCanteenModel(team),
  beacon: ({ team }) => createBeaconModel(team),
  // 熔炉：海岛生存的第一座可放置生产设施（木材 → 木炭）
  furnace: ({ team }) => createFurnaceModel(team),
  // 魔力炉：烧木炭产出魔力，为周围供能
  manaFurnace: ({ team }) => createManaFurnaceModel(team),
  // 科研站 / 附魔台：科技解锁链上的两座设施
  researchStation: ({ team }) => createResearchStationModel(team),
  enchantTable: ({ team }) => createEnchantTableModel(team),
  // 树坑 / 菜圃：种植地块。菜圃也复用树坑的苗床轮廓，靠作物节点区分产物。
  treePit: ({ team }) => createTreePitModel(team),
  cropPlot: ({ team }) => createTreePitModel(team),
  // 采石场 / 深矿井：地表资源采完后的慢速深采设施，复用石堆构型区分职能。
  quarry: ({ team }) => createFurnaceModel(team),
  deepMine: ({ team }) => createManaFurnaceModel(team),
  manualWorkbench: ({ team }) => createManualWorkbenchModel(team),
  chest: ({ team }) => createChestModel(team)
};

const PROJECTILE_FACTORIES = {
  arrow: ({ color }) => createArrowModel(color),
  frostArrow: ({ color }) => createFrostArrowModel(color),
  duskFrostOrb: ({ color }) => createDuskFrostOrbModel(color),
  lanternBolt: ({ color }) => createLanternBoltModel(color),
  boneChantOrb: ({ color }) => createBoneChantOrbModel(color),
  venomArrow: ({ color }) => createVenomArrowModel(color),
  mireJavelin: ({ color }) => createMireJavelinModel(color),
  thornVine: ({ color }) => createThornVineModel(color),
  bomb: () => createBombProjectileModel(),
  iceShard: ({ color }) => createIceShardModel(color),
  bolt: ({ color }) => createBoltModel(color),
  dagger: ({ color }) => createDaggerModel(color),
  holyBolt: ({ color }) => createHolyBoltModel(color),
  wardSigil: ({ color }) => createWardSigilModel(color),
  energyOrb: ({ color }) => createEnergyOrbModel(color),
  // 震荡塔的魔力脉冲：复用同一份能量球模型与材质，不新增纹理体系。
  shockPulse: ({ color }) => createEnergyOrbModel(color),
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

const HIT_FLASH_DURATION = 0.1;

export function createUnitModel(type, team) {
  const root = createUnitModelRoot(type, team);
  cloneUnitMaterials(root);
  root.userData.visualType = type;
  root.userData.animation = null;
  return root;
}

export function setUnitRuntimeVisualScale(unit, scale = 1) {
  const root = unit?.visualRoot;
  if (!root) return;
  const normalizedScale = Math.max(0.1, Number(scale) || 1);
  let scaleRoot = root.userData.runtimeVisualScaleRoot;
  if (!scaleRoot) {
    scaleRoot = new THREE.Group();
    scaleRoot.name = 'unitRuntimeVisualScaleRoot';
    const visualChildren = [...root.children];
    visualChildren.forEach((child) => scaleRoot.add(child));
    root.add(scaleRoot);
    root.userData.runtimeVisualScaleRoot = scaleRoot;
  }
  scaleRoot.scale.setScalar(normalizedScale);
  unit.runtimeVisualScale = normalizedScale;
}

function cloneUnitMaterials(root) {
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => material.clone());
      return;
    }
    object.material = object.material.clone();
  });
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

export function resetProjectileVisual(object, type) {
  if (type === 'waterOrb' && object?.userData?.isWaterOrb) {
    object.userData.waterSpinRoot?.rotation.set(0, 0, 0);
    object.userData.waterFlowRoot?.rotation.set(0, 0, 0);
    object.userData.waterFlowRings?.forEach((ring) => {
      ring.rotation.copy(ring.userData.baseRotation);
    });
  } else if (type === 'duskFrostOrb' && object?.userData?.isDuskFrostOrb) {
    object.userData.duskSpinRoot?.rotation.set(0, 0, 0);
    object.userData.duskFlowRoot?.rotation.set(0, 0, 0);
    object.userData.duskFlowRings?.forEach((ring) => {
      ring.rotation.copy(ring.userData.baseRotation);
    });
  } else {
    return;
  }
  updateProjectileVisual(object, type, 0, 0);
}

export function updateProjectileVisual(object, type, dt, age = 0) {
  if (type === 'duskFrostOrb' && object?.userData?.isDuskFrostOrb) {
    updateDuskFrostOrbVisual(object, dt, age);
    return;
  }
  if (type !== 'waterOrb' || !object?.userData?.isWaterOrb) return;
  const spinRoot = object.userData.waterSpinRoot;
  const flowRoot = object.userData.waterFlowRoot;
  if (spinRoot) {
    spinRoot.rotation.x += dt * 3.8;
    spinRoot.rotation.y += dt * 5.6;
    spinRoot.rotation.z -= dt * 2.7;
  }
  if (flowRoot) {
    flowRoot.rotation.x = Math.sin(age * 2.4) * 0.16;
    flowRoot.rotation.y += dt * 2.35;
    flowRoot.rotation.z -= dt * 3.15;
  }
  object.userData.waterFlowRings?.forEach((ring, index) => {
    const direction = index % 2 === 0 ? 1 : -1;
    ring.rotation.x += dt * (0.72 + index * 0.28) * direction;
    ring.rotation.z += dt * (1.05 + index * 0.34) * direction;
  });
  object.userData.waterOrbitDroplets?.forEach((droplet, index) => {
    const phase = droplet.userData.orbitPhase + age * droplet.userData.orbitSpeed;
    const radius = droplet.userData.orbitRadius;
    droplet.position.set(
      Math.cos(phase) * radius,
      Math.sin(phase * 1.7 + index * 0.42) * droplet.userData.orbitHeight,
      Math.sin(phase) * radius
    );
    const pulse = 0.82 + Math.sin(age * 7.2 + index * 1.3) * 0.18;
    droplet.scale.setScalar(droplet.userData.baseScale * pulse);
  });
}

function updateDuskFrostOrbVisual(object, dt, age) {
  const spinRoot = object.userData.duskSpinRoot;
  const flowRoot = object.userData.duskFlowRoot;
  if (spinRoot) {
    spinRoot.rotation.x += dt * 5.2;
    spinRoot.rotation.y -= dt * 7.4;
    spinRoot.rotation.z += dt * 3.1;
  }
  if (flowRoot) {
    flowRoot.rotation.x = Math.sin(age * 3.4) * 0.18;
    flowRoot.rotation.y += dt * 4.8;
    flowRoot.rotation.z -= dt * 3.6;
  }
  object.userData.duskFlowRings?.forEach((ring, index) => {
    const direction = index % 2 === 0 ? 1 : -1;
    ring.rotation.z += dt * (2.6 + index * 0.9) * direction;
  });
  object.userData.duskFrostMotes?.forEach((mote, index) => {
    const phase = mote.userData.orbitPhase + age * (3.5 + index * 0.16);
    const radius = mote.userData.orbitRadius;
    mote.position.set(
      Math.cos(phase) * radius,
      Math.sin(phase * 1.6 + index * 0.54) * 0.13,
      Math.sin(phase) * radius
    );
    const pulse = 0.76 + Math.sin(age * 10 + index) * 0.24;
    mote.scale.setScalar(mote.userData.baseScale * pulse);
  });
  const aura = object.userData.duskAura;
  if (aura) {
    const auraPulse = 0.54 + Math.sin(age * 11.5) * 0.05;
    aura.scale.setScalar(auraPulse);
    aura.material.opacity = 0.26 + Math.sin(age * 9.2) * 0.06;
  }
  const tail = object.userData.duskTail;
  if (tail) {
    tail.scale.set(0.84 + Math.sin(age * 12) * 0.08, 1.05 + Math.sin(age * 15) * 0.14, 0.84);
  }
}

export function createSpellModel(type) {
  const factory = SPELL_FACTORIES[type] ?? SPELL_FACTORIES.meteor;
  return factory();
}

export function playUnitAnimation(unit, name, duration = getAnimationDuration(unit, name), options = {}) {
  const root = unit.visualRoot;
  if (!root) return;
  const current = root.userData.animation;
  if (name === 'hit' && shouldPreserveAttackAnimation(current)) {
    triggerUnitHitFlash(unit, 0.1);
    return;
  }
  root.userData.animation = {
    name,
    duration,
    time: 0,
    variant: options.variant ?? null,
    networkStartTick: unit.game?.networkBridge?.authoritativeTick?.() ?? 0
  };
  unit.game?.networkBridge?.notifyPlayAnim?.(unit.id, name, duration);
}

export function triggerUnitHitFlash(unit, duration = HIT_FLASH_DURATION) {
  if (!unit) return;
  unit.hitFlashTimer = Math.max(unit.hitFlashTimer ?? 0, duration);
  unit.hitFlashDuration = Math.max(unit.hitFlashDuration ?? HIT_FLASH_DURATION, duration);
}

export function clearUnitHitFlash(unit) {
  if (!unit?.visualRoot) return;
  unit.hitFlashTimer = 0;
  unit.hitFlashDuration = HIT_FLASH_DURATION;
  restoreHitFlashVisual(unit.visualRoot, true);
}

export function stopUnitAnimation(unit, name = null) {
  const animation = unit.visualRoot?.userData.animation;
  if (!animation) return;
  if (name && animation.name !== name) return;
  unit.visualRoot.userData.animation = null;
}

/**
 * 让木傀儡手里握着某件采集工具（'axe' / 'pickaxe' / null 表示空手）。
 *
 * 两个细节值得写下来：
 *   1. 两把工具模型都建好挂在手掌上，切换只改 `visible`——不新建也不销毁 GPU 资源。
 *      傀儡每换一次任务就重建一次模型，在采集循环里是纯浪费。
 *   2. 可见性要同时写进 `userData.bindPose`（若存在）。`resetAnimatedParts` 每帧
 *      按 bindPose 还原 `visible`，只改节点上的 visible 会在同一帧被抹掉，
 *      表现成"工具永远不出现"（树苗那件事就是这么踩的，见 PlantingSystem 的注释）。
 */
export function setUnitHeldTool(unit, kind = null) {
  const socket = unit?.visualRoot?.userData?.parts?.toolSocket;
  if (!socket) return false;
  const wanted = kind === 'axe' || kind === 'pickaxe' ? kind : null;
  const cache = socket.userData.heldTools ?? (socket.userData.heldTools = {});
  const ensureModel = (toolKind) => {
    if (cache[toolKind]) return cache[toolKind];
    const model = createToolModel(toolKind);
    model.name = `unitHeldTool:${toolKind}`;
    socket.add(model);
    cache[toolKind] = model;
    return model;
  };
  if (wanted) ensureModel(wanted);
  // 没建过的工具不必建：只把已有的那两把按需显示
  Object.entries(cache).forEach(([toolKind, model]) => {
    const visible = toolKind === wanted;
    if (model.visible === visible) return;
    model.visible = visible;
    if (model.userData?.bindPose) model.userData.bindPose.visible = visible;
  });
  socket.userData.heldTool = wanted;
  return true;
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

function unitIsWalking(unit) {
  const state = unit?.visualState;
  if (state === 'walk' || state === 'moving') return true;
  if (unit?.aiState === 'moving') return true;
  return false;
}

export function updateUnitAnimation(unit, dt) {
  const root = unit.visualRoot;
  resetAnimatedParts(root);
  root.position.x = 0;
  root.position.z = 0;
  updateUnitHitFlash(unit, dt);
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
  if (unit.type === 'spearman') {
    applySpearmanStance(root, time, unitIsWalking(unit), unit.id);
    return;
  }
  if (unit.type === 'woodPuppet' || unit.type === 'ironPuppet') {
    applyWoodPuppetStance(root, time, unitIsWalking(unit), unit.id);
    return;
  }
  if (unitIsWalking(unit)) {
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
  // 采集挥击：砍树 / 挖矿。这两个名字是给"有工具在干活"的单位用的，
  // 目前只有木傀儡会播；别的单位万一被要求播，退化成一次普通挥击，
  // 而不是静默什么都不做（那会表现成"命令没反应"）。
  if (name === 'chop' || name === 'mine') {
    if (unit.type === 'woodPuppet' || unit.type === 'ironPuppet') {
      applyWoodPuppetSwing(root, name, t);
      return;
    }
    root.position.y = rootGroundOffset(root);
    root.rotation.z = 0;
    applySwordsmanAttack(root, t, pulse);
    return;
  }
  if (name === 'attack') {
    if (unit.type === 'woodPuppet' || unit.type === 'ironPuppet') {
      applyWoodPuppetAttack(root, t);
      return;
    }
    if (unit.type === 'spearman') {
      root.position.y = rootGroundOffset(root) + pulse * 0.018;
      root.rotation.z = 0;
      root.scale.setScalar(1);
      applySpearmanAttack(root, t, pulse);
      return;
    }
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
  if (unit.type === 'frostScout') {
    applyArcherAttack(root, t, pulse);
    applyFrostScoutVolley(root, t, pulse);
    return;
  }
  if (unit.type === 'tombLanternCrossbowman') {
    applyCrossbowAttack(root, t, pulse);
    applyTombLanternRelease(root, t, pulse);
    return;
  }
  if (unit.type === 'snowDuskShaman' || unit.type === 'boneVoicePriest') {
    applyCasterAttack(root, t, pulse);
    applyBossCasterFocus(root, t, pulse, unit.type);
    return;
  }
  if (unit.type === 'sandScorpionGuard') {
    applyBeastAttack(root, t, pulse, unit.type);
    applySandScorpionStrike(root, t, pulse);
    return;
  }
  if (unit.type === 'yellowSandOgre') {
    applyRaiderAttack(root, t, pulse);
    applyYellowSandOgreSmash(root, t, pulse);
    return;
  }
  if (unit.type === 'mireHunter') {
    applyMireHunterThrow(root, t, pulse);
    return;
  }
  if (unit.type === 'rotrootColossus') {
    applyRotrootVineCast(root, t, pulse, variant);
    return;
  }
  if (unit.type === 'frostTrollBoss') {
    applyFrostTrollBossAttack(root, t, pulse, variant);
    return;
  }
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
  if (unit.type === 'spearman') {
    applySpearmanAttack(root, t, pulse);
    return;
  }
  if (unit.type === 'towerShield') {
    applyTowerShieldAttack(root, t, pulse);
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
    unit.type === 'waterMage' ||
    unit.type === 'lightningMage' ||
    unit.type === 'windMage' ||
    unit.type === 'frostOracleBoss'
  ) {
    applyCasterAttack(root, t, pulse);
    return;
  }
  if (unit.type === 'warder') {
    applyWarderAttack(root, t, pulse);
    return;
  }
  if (unit.type === 'wolf' || unit.type === 'frostWolf' || unit.type === 'frostWolfBoss' || unit.type === 'bear' || unit.type === 'scorpion' || unit.type === 'spider') {
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

function applySpearmanStance(root, time, walking, unitId = 0) {
  const { upperBodyPivot, headPivot, spearPivot } = root.userData.parts ?? {};
  const bobRate = walking ? WALK_BOB_RATE : 1.7;
  const bobHeight = walking ? WALK_BOB_HEIGHT : IDLE_BOB_HEIGHT * 0.55;
  const bob = Math.sin(time * bobRate + unitId) * bobHeight;
  root.position.y = rootGroundOffset(root) + bob;
  root.rotation.x = 0;
  root.rotation.y = 0;
  root.rotation.z = walking
    ? Math.sin(time * WALK_SWAY_RATE + unitId) * WALK_SWAY_ANGLE * 0.45
    : 0;
  // resetAnimatedParts 已恢复 bindPose；这里只叠加动画偏移，不能重写 pivot 根位置
  if (upperBodyPivot) {
    upperBodyPivot.rotation.set(0, Math.PI / 2, 0);
  }
  if (headPivot) {
    headPivot.rotation.set(0, 0, 0);
    const baseY = headPivot.userData.bindPose?.position.y ?? headPivot.position.y;
    headPivot.position.y = baseY + bob * 0.15;
  }
  if (spearPivot) {
    spearPivot.rotation.set(0, 0, 0);
    const baseY = spearPivot.userData.bindPose?.position.y ?? spearPivot.position.y;
    spearPivot.position.y = baseY + bob * 0.3;
  }
}

// 木傀儡的待机/行走姿态：没有膝关节 IK，靠上下两段肢体错相摆动，
// 配合比人类单位更大的左右摇晃，读起来就是"关节木头人在挪步"。
// resetAnimatedParts 每帧已恢复 bindPose（驼背前倾就存在 bindPose 里），
// 这里只叠加动画偏移，绝不重写 pivot 的基准旋转。
function applyWoodPuppetStance(root, time, walking, unitId = 0) {
  const {
    upperBodyPivot,
    headPivot,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    leftElbowPivot,
    rightElbowPivot,
    leftKneePivot,
    rightKneePivot
  } = root.userData.parts ?? {};
  const bobRate = walking ? WALK_BOB_RATE * 0.9 : 1.7;
  const bobHeight = walking ? WALK_BOB_HEIGHT * 1.4 : IDLE_BOB_HEIGHT * 0.7;
  const bob = Math.sin(time * bobRate + unitId) * bobHeight;
  root.position.y = rootGroundOffset(root) + bob;
  root.rotation.x = 0;
  root.rotation.y = 0;
  root.rotation.z = walking
    ? Math.sin(time * WALK_SWAY_RATE + unitId) * WALK_SWAY_ANGLE * 1.6
    : 0;
  const swingRate = walking ? 5.6 : 1.3;
  const swing = Math.sin(time * swingRate + unitId) * (walking ? 0.5 : 0.06);
  if (leftLegPivot) leftLegPivot.rotation.x = swing;
  if (rightLegPivot) rightLegPivot.rotation.x = -swing;
  if (leftArmPivot) leftArmPivot.rotation.x = -swing * 0.7;
  if (rightArmPivot) rightArmPivot.rotation.x = swing * 0.7;
  // 膝与肘：只有胯/肩时，四肢是四根直木棍前后撬。膝盖在后摆那条腿上屈起来，
  // 肘在手摆到身后时收一点，走起来才像"抬腿落脚、带着家伙走"。
  // 站立时不弯到 0，留一点点常驻屈度，免得看着像被钉在地上的木桩。
  const kneeBase = walking ? 0.07 : 0.02;
  const kneeBend = walking ? 0.4 : 0.05;
  if (leftKneePivot) leftKneePivot.rotation.x = kneeBase + Math.max(0, -swing) * kneeBend;
  if (rightKneePivot) rightKneePivot.rotation.x = kneeBase + Math.max(0, swing) * kneeBend;
  // 屈肘的方向：+X 把小臂往身后折，所以"手摆到身后"的那条臂收得更多
  const elbowBend = walking ? 0.5 : 0.1;
  if (leftElbowPivot) leftElbowPivot.rotation.x = Math.max(0, swing) * elbowBend;
  if (rightElbowPivot) rightElbowPivot.rotation.x = Math.max(0, -swing) * elbowBend;
  if (upperBodyPivot) {
    upperBodyPivot.rotation.x += Math.abs(swing) * 0.08;
    upperBodyPivot.rotation.y = Math.sin(time * swingRate * 0.5 + unitId) * (walking ? 0.05 : 0.012);
  }
  if (headPivot) {
    headPivot.rotation.x = Math.sin(time * swingRate + unitId + 0.8) * (walking ? 0.06 : 0.02);
  }
}

/**
 * 木傀儡的采集挥击：`chop`（斧，抡得开）与 `mine`（镐，短促下砸）。
 *
 * 这个动作的关键是**两段错拍**：肩部决定挥幅、肘部决定命中那一下的甩出。
 * 于是工具尖端（`toolSocket`）的轨迹是「先被抬到最高 → 命中帧急速下落 → 收势回正」，
 * 而不是一整根直臂匀速转过去。命中帧与 `timelines[*].events.strike` 对齐，
 * 采集结算与打击特效都发生在那一帧，动作和产物才是同一个节拍。
 *
 * 关节方向（这三条是从模型坐标算出来的，不是猜的）：
 *   - 肩枢轴 -X → 手臂向前上方抬起；+X → 向后下方摆。
 *   - 肘枢轴 +X → 小臂往身后折（屈肘），所以起手用 +，命中时回 0 把它甩出去。
 *   - 膝枢轴 +X → 小腿向后弯（正常屈膝），配合根节点下沉做出"蹲一下"。
 */
function applyWoodPuppetSwing(root, kind, t) {
  const parts = root.userData.parts ?? {};
  const isChop = kind === 'chop';
  const strikeAt = isChop ? 0.46 : 0.42;
  const holdEnd = Math.min(1, strikeAt + 0.22);
  const raise = isChop ? 1.3 : 0.95;
  const driveEnd = isChop ? 0.5 : 0.36;
  const fold = isChop ? 0.95 : 0.7;

  // 四段曲线。**顺序很讲究**：屈肘的"甩直"必须在命中帧**之前**完成，
  // 否则命中那一刻手臂还是折着的，看起来像"用肘去撞树"。
  const windup = smoothstep(0, strikeAt * 0.7, t);            // 抬臂并屈肘蓄力
  const extend = smoothstep(strikeAt * 0.72, strikeAt, t);     // 命中前甩直小臂（鞭梢，尖端最高速来自这里）
  const drive = smoothstep(strikeAt - 0.08, strikeAt + 0.14, t); // 肩部下砸，最快的一瞬落在命中帧附近
  const recover = smoothstep(holdEnd, 1, t);                   // 收势回正

  const shoulderX = -raise * windup + (raise + driveEnd) * drive - driveEnd * recover;
  const elbowX = fold * windup * (1 - extend) + 0.16 * fold * recover;
  // 屈膝下沉：命中前后整个身体压下去，力量才有落点（也是"蹲着砍"的来源）
  const dip = bell(strikeAt - 0.16, strikeAt + 0.05, strikeAt + 0.4, t);
  const kneeBend = dip * (isChop ? 0.32 : 0.26);

  if (parts.rightArmPivot) parts.rightArmPivot.rotation.x = shoulderX;
  // 左手扶在小臂上（双手持械）：幅度小一点、节奏晚一点
  if (parts.leftArmPivot) parts.leftArmPivot.rotation.x = shoulderX * 0.6;
  if (parts.rightElbowPivot) parts.rightElbowPivot.rotation.x = elbowX;
  if (parts.leftElbowPivot) parts.leftElbowPivot.rotation.x = elbowX * 0.72;
  if (parts.leftKneePivot) parts.leftKneePivot.rotation.x = kneeBend;
  if (parts.rightKneePivot) parts.rightKneePivot.rotation.x = kneeBend;
  // 髋部反向一点，让脚大致留在原地，不至于屈膝时看着整只脚飘起来
  if (parts.leftLegPivot) parts.leftLegPivot.rotation.x = -kneeBend * 0.45;
  if (parts.rightLegPivot) parts.rightLegPivot.rotation.x = -kneeBend * 0.45;
  if (parts.upperBodyPivot) {
    // +X 是前倾（驼背的基准就是 +0.14）：起手后仰蓄力、命中前倾发力
    parts.upperBodyPivot.rotation.x += windup * (isChop ? 0.16 : 0.12) - drive * (isChop ? 0.44 : 0.3);
    parts.upperBodyPivot.rotation.y = (isChop ? 0.1 : -0.13) * (windup - drive * 0.6);
  }
  if (parts.headPivot) {
    parts.headPivot.rotation.x -= windup * 0.1 - drive * 0.16;
  }
  root.position.y = rootGroundOffset(root) - dip * 0.06;
  root.rotation.x = 0;
  root.rotation.y = 0;
  root.rotation.z = 0;
  root.scale.setScalar(1);
}

/**
 * 木傀儡的攻击动作：一记短促的前挥。
 *
 * 说明：木傀儡按设计**不参战**（`physicalAttack: 0`、`aggroRange: 0`，
 * 而且 `WorkSystem.updateWorker` 会接管它的整帧），所以这个动作在正常玩法里
 * 不会被触发。它存在是为了两件事：被招募/换装成能打的单位时动作齐全，
 * 以及"给任何单位播 attack"这条通用路径在傀儡身上不会退化成静止不动。
 */
function applyWoodPuppetAttack(root, t) {
  const parts = root.userData.parts ?? {};
  const windup = smoothstep(0, 0.32, t);
  const strike = smoothstep(0.32, 0.62, t);
  const recover = smoothstep(0.62, 1, t);
  const shoulderX = -0.5 * windup + 1.15 * strike - 0.65 * recover;
  const elbowX = 0.55 * windup - 0.55 * strike;
  if (parts.rightArmPivot) parts.rightArmPivot.rotation.x = shoulderX;
  if (parts.rightElbowPivot) parts.rightElbowPivot.rotation.x = elbowX;
  if (parts.leftArmPivot) parts.leftArmPivot.rotation.x = -shoulderX * 0.35;
  if (parts.leftElbowPivot) parts.leftElbowPivot.rotation.x = elbowX * 0.5;
  if (parts.leftKneePivot) parts.leftKneePivot.rotation.x = 0.12 * strike;
  if (parts.rightKneePivot) parts.rightKneePivot.rotation.x = 0.12 * strike;
  if (parts.upperBodyPivot) {
    parts.upperBodyPivot.rotation.x += 0.1 * windup - 0.28 * strike + 0.18 * recover;
    parts.upperBodyPivot.rotation.y = -0.16 * (windup - strike * 0.5);
  }
  if (parts.headPivot) parts.headPivot.rotation.x -= 0.08 * strike;
  root.position.y = rootGroundOffset(root) - 0.02 * strike;
  root.rotation.x = 0;
  root.rotation.y = 0;
  root.rotation.z = 0;
  root.scale.setScalar(1);
}

function applySpearmanAttack(root, t, pulse) {
  const { upperBodyPivot, headPivot, spearPivot } = root.userData.parts ?? {};
  if (!spearPivot) return;

  const gather = smoothstep(0, 0.24, t) * (1 - smoothstep(0.84, 1, t));
  const thrust = bell(0.26, 0.5, 0.74, t);
  const recover = smoothstep(0.7, 1, t);
  const spearBase = spearPivot.userData.bindPose?.position;

  root.position.z += 0.12 * thrust - 0.04 * recover;

  if (upperBodyPivot) {
    upperBodyPivot.rotation.set(0, Math.PI / 2 + 0.05 * gather - 0.03 * thrust, 0);
    const baseZ = upperBodyPivot.userData.bindPose?.position.z ?? 0;
    upperBodyPivot.position.z = baseZ + 0.02 * thrust;
  }
  if (headPivot) {
    headPivot.rotation.set(0, -0.03 * gather + 0.025 * thrust, 0);
  }

  if (spearBase) {
    spearPivot.position.set(
      spearBase.x,
      spearBase.y + pulse * 0.01,
      spearBase.z - 0.3 * gather + 0.62 * thrust - 0.1 * recover
    );
  } else {
    spearPivot.position.x = -0.22;
    spearPivot.position.y = 1.0 + pulse * 0.01;
    spearPivot.position.z = 0.04 - 0.3 * gather + 0.62 * thrust - 0.1 * recover;
  }
  spearPivot.rotation.set(0, 0, 0);
}

function applyTowerShieldAttack(root, t, pulse) {
  const { shieldPivot, shield, upperBodyPivot } = root.userData.parts ?? {};
  if (!shieldPivot) return;
  const brace = smoothstep(0, 0.28, t) * (1 - smoothstep(0.78, 1, t));
  const bash = smoothstep(0.3, 0.56, t) * (1 - smoothstep(0.78, 1, t));
  const recover = smoothstep(0.78, 1, t);

  root.position.y += pulse * 0.018;
  root.position.z += 0.06 * brace + 0.28 * bash - 0.1 * recover;
  root.rotation.x += -0.04 * brace + 0.06 * bash - 0.02 * recover;
  shieldPivot.position.z += 0.1 * brace + 0.58 * bash - 0.14 * recover;
  shieldPivot.position.y += 0.04 * brace - 0.02 * recover;
  shieldPivot.rotation.x += -0.14 * brace - 0.1 * bash + 0.05 * recover;
  if (upperBodyPivot) {
    upperBodyPivot.rotation.x += 0.05 * bash - 0.02 * recover;
    upperBodyPivot.position.z += 0.04 * bash;
  }
  if (shield) {
    shield.scale.set(1 + bash * 0.04, 1 + bash * 0.015, 1 + bash * 0.08);
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

function applyFrostScoutVolley(root, t, pulse) {
  const { fanArrows, bowPivot } = root.userData.parts ?? {};
  const draw = smoothstep(0.14, 0.5, t) * (1 - smoothstep(0.6, 0.94, t));
  const release = bell(0.56, 0.64, 0.78, t);
  if (fanArrows) {
    fanArrows.rotation.y += draw * 0.1;
    fanArrows.scale.set(1 + draw * 0.08, 1 + draw * 0.08, 1 + draw * 0.08);
  }
  if (bowPivot) {
    bowPivot.rotation.z += release * 0.045;
  }
}

function applyTombLanternRelease(root, t, pulse) {
  const { lanternGlow, projectileSocket } = root.userData.parts ?? {};
  const release = bell(0.46, 0.54, 0.7, t);
  if (lanternGlow) {
    lanternGlow.scale.setScalar(1 + release * 0.28 + pulse * 0.06);
  }
  if (projectileSocket) {
    projectileSocket.scale.setScalar(1 + release * 0.3);
  }
}

function applyBossCasterFocus(root, t, pulse, type) {
  const { focus, shardRing, staffSoul, spiritRing, projectileSocket } = root.userData.parts ?? {};
  const gather = smoothstep(0, 0.4, t) * (1 - smoothstep(0.76, 1, t));
  const release = bell(0.46, 0.58, 0.76, t);
  const focusObject = type === 'snowDuskShaman' ? focus : staffSoul;
  const ringObject = type === 'snowDuskShaman' ? shardRing : spiritRing;
  if (focusObject) {
    focusObject.rotation.y += gather * 0.4 + release * 0.68;
    focusObject.scale.setScalar(1 + gather * 0.18 + release * 0.24);
  }
  if (ringObject) {
    ringObject.rotation.z += gather * 0.45 + release * 0.75;
    ringObject.scale.setScalar(1 + gather * 0.22 + release * 0.18);
  }
  if (projectileSocket) {
    projectileSocket.scale.setScalar(1 + gather * 0.35 + release * 0.32);
  }
}

function applySandScorpionStrike(root, t, pulse) {
  const { armorPlates, sting } = root.userData.parts ?? {};
  const windup = bell(0, 0.3, 0.52, t);
  const strike = smoothstep(0.4, 0.64, t) * (1 - smoothstep(0.78, 1, t));
  if (armorPlates) {
    armorPlates.rotation.y += windup * 0.08 - strike * 0.06;
    armorPlates.position.y += windup * 0.025;
  }
  if (sting) {
    sting.scale.set(1 + strike * 0.16, 1 + strike * 0.16, 1 + strike * 0.16);
  }
}

function applyYellowSandOgreSmash(root, t, pulse) {
  const { hammerHead } = root.userData.parts ?? {};
  const strike = smoothstep(0.38, 0.64, t) * (1 - smoothstep(0.78, 1, t));
  if (hammerHead) {
    hammerHead.scale.set(1 + strike * 0.06, 1 + strike * 0.06, 1 + strike * 0.06);
  }
}

function applyMireHunterThrow(root, t, pulse) {
  const { upperBodyPivot, weaponPivot, weaponSwingPivot, offhandPivot, javelinHead } = root.userData.parts ?? {};
  if (!weaponPivot) return;
  const aim = smoothstep(0, 0.4, t) * (1 - smoothstep(0.64, 0.84, t));
  const release = smoothstep(0.48, 0.62, t) * (1 - smoothstep(0.76, 1, t));
  const recover = smoothstep(0.76, 1, t);
  root.rotation.z = -0.012 * pulse;
  if (upperBodyPivot) {
    upperBodyPivot.rotation.y += -0.42 * aim + 0.28 * release;
    upperBodyPivot.rotation.x += -0.04 * aim + 0.06 * release;
  }
  weaponPivot.rotation.x += -1.06 * aim + 1.38 * release - 0.18 * recover;
  weaponPivot.rotation.z += -0.32 * aim + 0.24 * release;
  if (weaponSwingPivot) {
    weaponSwingPivot.rotation.x += -0.28 * aim + 0.42 * release;
    weaponSwingPivot.position.z += -0.1 * aim + 0.16 * release;
  }
  if (offhandPivot) {
    offhandPivot.rotation.x += -0.18 * aim + 0.1 * release;
    offhandPivot.rotation.z += 0.12 * aim;
  }
  if (javelinHead) {
    javelinHead.scale.setScalar(1 + release * 0.12);
  }
}

function applyRotrootVineCast(root, t, pulse, variant = null) {
  const { upperBodyPivot, weaponPivot, weaponSwingPivot, offhandPivot, coreStone, rightFist } = root.userData.parts ?? {};
  const abilityCast = variant === 'monsterAbility';
  const boost = abilityCast ? 1.18 : 1;
  const lift = smoothstep(0, 0.42, t) * (1 - smoothstep(0.68, 1, t));
  const focus = smoothstep(0.18, 0.52, t) * (1 - smoothstep(0.62, 1, t));
  root.position.y += lift * 0.045;
  root.rotation.z = -0.012 * pulse;
  if (upperBodyPivot) {
    upperBodyPivot.rotation.x += -0.08 * lift * boost;
    upperBodyPivot.rotation.z += (abilityCast ? 0 : -0.035) * focus;
  }
  if (weaponPivot) {
    weaponPivot.rotation.x += -0.92 * lift * boost;
    weaponPivot.rotation.z += (abilityCast ? -0.34 : -0.18) * focus;
  }
  if (weaponSwingPivot) {
    weaponSwingPivot.rotation.x += -0.28 * focus;
    weaponSwingPivot.position.z += 0.14 * focus;
  }
  if (offhandPivot) {
    offhandPivot.rotation.x += (abilityCast ? -0.84 : -0.46) * lift;
    offhandPivot.rotation.z += (abilityCast ? 0.36 : 0.16) * focus;
  }
  if (coreStone) {
    coreStone.scale.setScalar(1 + focus * 0.28 * boost);
  }
  if (rightFist) {
    rightFist.scale.setScalar(1 + focus * 0.1 * boost);
  }
}

function applyFrostTrollBossAttack(root, t, pulse, variant = null) {
  const {
    weaponPivot,
    weaponSwingPivot,
    offhandPivot,
    hammerHead,
    hammerGem,
    skullCharm
  } = root.userData.parts ?? {};
  const abilityBoost = variant === 'monsterAbility' ? 1.18 : 1;
  const windup = smoothstep(0, 0.48, t) * (1 - smoothstep(0.58, 0.72, t));
  const strike = smoothstep(0.56, 0.62, t) * (1 - smoothstep(0.72, 0.88, t));
  const recover = smoothstep(0.74, 1, t);

  root.position.y += windup * 0.05 - strike * 0.075 * abilityBoost;
  root.rotation.x += windup * -0.08 + strike * 0.14 * abilityBoost;
  root.rotation.z = -0.012 * pulse;

  if (weaponPivot) {
    weaponPivot.rotation.x += -1.28 * windup + 1.72 * strike - 0.24 * recover;
    weaponPivot.rotation.y += 0.06 * windup - 0.04 * strike;
    weaponPivot.rotation.z += 0.1 * windup - 0.12 * strike;
  }
  if (weaponSwingPivot) {
    weaponSwingPivot.rotation.x += -0.34 * windup + 0.5 * strike - 0.1 * recover;
    weaponSwingPivot.rotation.z += 0.06 * windup - 0.08 * strike;
  }
  if (offhandPivot) {
    offhandPivot.rotation.z += -0.02 * windup + 0.05 * strike;
  }
  if (hammerHead) {
    hammerHead.scale.multiplyScalar(1 + strike * 0.12 * abilityBoost);
  }
  if (hammerGem) {
    hammerGem.rotation.y += windup * 0.35 + strike * 0.65 * abilityBoost;
    hammerGem.scale.multiplyScalar(1 + (windup * 0.08 + strike * 0.16) * abilityBoost);
  }
  if (skullCharm) {
    skullCharm.rotation.z += Math.sin(t * Math.PI * 2) * 0.015 * abilityBoost + strike * 0.03;
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

function shouldPreserveAttackAnimation(animation) {
  if (!animation || animation.name !== 'attack') return false;
  return animation.time < animation.duration;
}

function updateUnitHitFlash(unit, dt) {
  const root = unit.visualRoot;
  if (!root) return;
  const timer = unit.hitFlashTimer ?? 0;
  if (timer <= 0) {
    restoreHitFlashVisual(root, true);
    unit.hitFlashTimer = 0;
    return;
  }
  const duration = Math.max(0.01, unit.hitFlashDuration ?? HIT_FLASH_DURATION);
  unit.hitFlashTimer = Math.max(0, timer - dt);
  const intensity = Math.min(1, unit.hitFlashTimer / duration);
  if (intensity > 0) {
    applyHitFlashVisual(root, intensity);
  } else {
    restoreHitFlashVisual(root, true);
    unit.hitFlashTimer = 0;
  }
}

function applyHitFlashVisual(root, intensity) {
  if (intensity <= 0) return;
  root.traverse((object) => {
    if (!object.isMesh) return;
    const material = object.material;
    if (!material?.emissive) return;
    if (!object.userData.flashBaseEmissive) {
      object.userData.flashBaseEmissive = material.emissive.clone();
      object.userData.flashBaseEmissiveIntensity = material.emissiveIntensity ?? 0;
    }
    material.emissive.setRGB(1, 0.18, 0.12).lerp(object.userData.flashBaseEmissive, 1 - intensity);
    material.emissiveIntensity = THREE.MathUtils.lerp(
      0.92,
      object.userData.flashBaseEmissiveIntensity,
      1 - intensity
    );
  });
}

function restoreHitFlashVisual(root, clearCache = false) {
  root.traverse((object) => {
    if (!object.isMesh || !object.userData.flashBaseEmissive) return;
    const material = object.material;
    if (!material?.emissive) return;
    material.emissive.copy(object.userData.flashBaseEmissive);
    material.emissiveIntensity = object.userData.flashBaseEmissiveIntensity ?? 0;
    if (clearCache) {
      delete object.userData.flashBaseEmissive;
      delete object.userData.flashBaseEmissiveIntensity;
    }
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
  // 采集挥击：具体时长按单位定义里的 timelines 走，这里只是缺省兜底
  if (name === 'chop') return 0.9;
  if (name === 'mine') return 0.75;
  return 0.5;
}
