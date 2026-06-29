import * as THREE from 'three';
import { createAttackRangeRing, createGuardFlag, createSelectionRing } from '../art/lowpoly.js';
import { BALANCE, CARD_DEFINITIONS, LEVEL_DEFINITIONS, TEAMS } from '../data/gameData.js';
import { UnitEntity } from '../entities/UnitEntity.js';
import { createWorld } from '../world/createWorld.js';
import { BuffSystem } from './BuffSystem.js';
import { BuildingSystem } from './BuildingSystem.js';
import { CardEffectSystem } from './CardEffectSystem.js';
import { CardSystem } from './CardSystem.js';
import { CombatSystem } from './CombatSystem.js';
import { EffectsSystem } from './EffectsSystem.js';
import { AltarSystem } from './AltarSystem.js';
import { EnemyCommanderSystem } from './EnemyCommanderSystem.js';
import { LevelMechanicSystem } from './LevelMechanicSystem.js';
import { LootDropSystem } from './LootDropSystem.js';
import { AttributeSet, bindAttributeGetter } from './AttributeSet.js';
import { AreaEffectSystem } from './AreaEffectSystem.js';
import { ModifierSystem } from './ModifierSystem.js';
import { RecoverySystem } from './RecoverySystem.js';
import { SpellSystem } from './SpellSystem.js';
import { clamp, polarOffset } from '../utils/math.js';

const STRUCTURE_PUSH_PADDING = 0.18;
const ROUTE_REPATH_DISTANCE = 1.15;
const ROUTE_REJOIN_DISTANCE = 2.2;
const ROUTE_WAYPOINT_RADIUS = 0.38;
const ROUTE_REPATH_COOLDOWN = 0.48;
const ROUTE_BLOCKED_REPATH_COOLDOWN = 0.45;
const ROUTE_REPATH_JITTER = 0.16;
const ROUTE_STEERING_LOOKAHEAD_DISTANCE = 1.6;
const ROUTE_RECOVERY_LOOKAHEAD_DISTANCE = 0.55;
const NAV_LINE_RECHECK_COOLDOWN = 0.12;
const NAV_LINE_RECHECK_DISTANCE = 0.55;
const OFF_ROUTE_RECHECK_COOLDOWN = 0.18;
const UNIT_GRAVITY = 28;
const UNIT_MAX_FALL_SPEED = 18;
const UNIT_CLIMB_SPEED = 3.4;
const UNIT_MAX_SMOOTH_CLIMB_HEIGHT = 0.58;
const UNIT_GROUND_EPSILON = 0.006;
const INITIAL_ATTACK_WAVE_DELAY = 18;
const MIN_ENEMY_WAVE_DELAY = 12;
const EARLY_ENEMY_WAVE_DELAY = 24;
const ENEMY_WAVE_DELAY_DECAY = 0.65;
const SUMMON_DEPLOY_RADIUS = 7.5;
const BEACON_PLACEMENT_RADIUS = 5.5;

export class Game {
  constructor({ canvas, session = null, onLevelComplete = null } = {}) {
    this.canvas = canvas;
    this.levelSession = normalizeLevelSession(session);
    this.onLevelComplete = onLevelComplete;
    this.elapsedTime = 0;
    this.levelFinished = false;
    this.destroyed = false;
    this.eventController = new AbortController();
    this.worldConfig = this.levelSession.level.world ?? BALANCE.world;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 240);
    this.camera.position.set(0, 34, 47.2);
    this.camera.lookAt(0, 4, 10);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.worldUi = ensureWorldUiElement();
    this.cameraTarget = new THREE.Vector3(0, 4, 18);
    this.cameraOffsetDirection = new THREE.Vector3(0, 30, 37.2).normalize();
    this.cameraDistance = 28.7;
    this.cameraMinDistance = 12;
    this.cameraMaxDistance = 78;
    this.pointerScreen = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5);
    this.edgePanActive = false;
    this.cameraDrag = null;
    this.updateCamera(0);

    this.clock = new THREE.Clock();
    this.friendlyUnits = [];
    this.enemyUnits = [];
    this.score = 0;
    this.wave = 1;
    this.waveTimer = INITIAL_ATTACK_WAVE_DELAY;
    this.lastCardPlayed = null;
    this.selectedUnit = null;
    this.selectedUnits = [];
    this.selectionRings = [];
    this.guardVisuals = new Map();
    this.selectionDrag = null;
    const playerBasePosition = this.worldConfig.playerBasePosition ?? BALANCE.playerBase.position;
    const enemyCampPosition = this.worldConfig.enemyCampPosition ?? BALANCE.enemyCamp.position;
    this.playerBase = createStructureState({
      id: 'player-base',
      position: new THREE.Vector3(
        playerBasePosition.x,
        0,
        playerBasePosition.z
      ),
      projectileHitHeight: 2.1,
      attributes: {
        maxHealth: BALANCE.playerBase.maxHealth,
        recoveryRadius: BALANCE.playerBase.recoveryRadius,
        healthPerSecond: BALANCE.playerBase.healthPerSecond,
        durabilityPerSecond: BALANCE.playerBase.durabilityPerSecond
      }
    });

    this.world = createWorld(this.scene, this.worldConfig);
    this.navDebugEnabled = initialNavDebugEnabled();
    this.perfDebugEnabled = initialPerfDebugEnabled();
    this.perfTracker = this.perfDebugEnabled ? new PerfTracker() : null;
    this.navDebugGroup = new THREE.Group();
    this.navDebugGroup.name = 'NavDebug';
    this.navDebugGroup.visible = this.navDebugEnabled;
    this.navDebugRouteGroup = new THREE.Group();
    this.navDebugRouteGroup.name = 'NavDebugRoutes';
    this.navDebugGroup.add(this.navDebugRouteGroup);
    this.navDebugGrid = null;
    this.navDebugMesh = null;
    this.navDebugTimer = 0;
    this.hudUpdateTimer = 0;
    this.scene.add(this.navDebugGroup);
    this.playerBase.position.y = this.groundHeightAt(this.playerBase.position);
    setupStructureBody(this.playerBase, this.world.playerBaseModel, {
      collisionRadius: 2.05,
      attackRadius: 2.2
    });
    this.enemyCamp = createStructureState({
      id: 'enemy-camp',
      position: new THREE.Vector3(
        enemyCampPosition.x,
        0,
        enemyCampPosition.z
      ),
      projectileHitHeight: 2.2,
      attributes: {
        maxHealth: BALANCE.enemyCamp.maxHealth
      }
    });
    this.enemyCamp.position.y = this.groundHeightAt(this.enemyCamp.position);
    setupStructureBody(this.enemyCamp, this.world.enemyCampModel, {
      collisionRadius: 2.75,
      attackRadius: 2.45
    });
    this.playerBase.statusElement = createStructureStatusElement('friendly');
    this.playerBase.statusHeight = 3.9;
    this.enemyCamp.statusElement = createStructureStatusElement('enemy');
    this.enemyCamp.statusHeight = 3.15;
    this.worldUi.append(this.playerBase.statusElement, this.enemyCamp.statusElement);

    this.effects = new EffectsSystem(this.scene);
    this.areaEffects = new AreaEffectSystem(this);
    this.modifiers = new ModifierSystem(this);
    this.buffs = new BuffSystem(this);
    this.buildings = new BuildingSystem(this);
    this.combat = new CombatSystem(this);
    this.spells = new SpellSystem(this);
    this.cardEffects = new CardEffectSystem(this);
    this.recovery = new RecoverySystem(this);
    this.cardSystem = new CardSystem(this, {
      deck: this.levelSession.deck
    });
    this.lootDrops = new LootDropSystem(this);
    this.altars = new AltarSystem(this, this.world.config?.altars ?? this.worldConfig.altars);
    this.enemyCommander = new EnemyCommanderSystem(this);
    this.levelMechanics = new LevelMechanicSystem(this);
    this.selectionBox = createSelectionBoxElement();

    this.dom = {
      baseHealth: document.querySelector('#base-health'),
      waveLabel: document.querySelector('#wave-label'),
      unitCount: document.querySelector('#unit-count'),
      selectedName: document.querySelector('#selected-name'),
      selectedStats: document.querySelector('#selected-stats'),
      selectedEnchants: document.querySelector('#selected-enchants'),
      debug: document.querySelector('#debug-state')
    };

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    const signal = this.eventController.signal;
    canvas.addEventListener('contextmenu', (event) => this.onGameContextMenu(event), { signal });
    canvas.addEventListener('pointerdown', (event) => this.onCanvasPointerDown(event), { signal });
    canvas.addEventListener('pointermove', (event) => this.onCanvasPointerMove(event), { signal });
    canvas.addEventListener('pointerup', (event) => this.onCanvasPointerUp(event), { signal });
    canvas.addEventListener('pointercancel', (event) => this.onCanvasPointerCancel(event), { signal });
    canvas.addEventListener('mousedown', (event) => this.onCanvasMouseDown(event), { signal });
    canvas.addEventListener('auxclick', (event) => this.onCanvasAuxClick(event), { signal });
    window.addEventListener('mousemove', (event) => this.onCanvasPointerMove(event), { signal });
    window.addEventListener('mouseup', (event) => this.onCanvasPointerUp(event), { signal });
    window.addEventListener('blur', () => this.cancelCameraDrag(), { signal });
    canvas.addEventListener('wheel', (event) => this.onCanvasWheel(event), { passive: false, signal });
    window.addEventListener('pointermove', (event) => this.onWindowPointerMove(event), { signal });
    window.addEventListener('contextmenu', (event) => this.onGameContextMenu(event), { capture: true, signal });
    window.addEventListener('keydown', (event) => this.onKeyDown(event), { signal });
    window.addEventListener('resize', () => this.resize(), { signal });
    this.resize();

    this.summonUnits('raider', 1, this.playerBase.position.clone().add(new THREE.Vector3(-1.4, 0, -2.2)), 0.7, {
      select: false
    });
    this.summonUnits('archer', 1, this.playerBase.position.clone().add(new THREE.Vector3(1.4, 0, -2.2)), 0.7, {
      select: false
    });
    this.spawnWildlife();
    this.spawnEnemyWave(1, { orders: 'guard' });

    window.__VILLAGE_WAR_DEBUG__ = {
      game: this,
      snapshot: () => this.snapshot(),
      samplePixels: () => this.samplePixels()
    };
  }

  start() {
    if (this.destroyed) return;
    this.renderer.setAnimationLoop(() => this.tick());
  }

  stop() {
    this.renderer.setAnimationLoop(null);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.eventController.abort();
    this.cardSystem?.destroy?.();
    this.buildings?.destroy?.();
    this.lootDrops?.destroy?.();
    this.enemyCommander?.destroy?.();
    this.areaEffects?.destroy?.();
    this.levelMechanics?.destroy?.();
    this.disposeNavDebug();
    this.renderer.dispose();
    this.selectionBox?.remove();
    this.guardVisuals.forEach((visuals) => {
      this.scene.remove(visuals.flag, visuals.rangeRing);
    });
    this.guardVisuals.clear();
    this.worldUi.innerHTML = '';
    if (window.__VILLAGE_WAR_DEBUG__?.game === this) {
      delete window.__VILLAGE_WAR_DEBUG__;
    }
  }

  tick() {
    if (this.destroyed) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsedTime += dt;
    this.waveTimer -= dt;
    if (this.waveTimer <= 0 && this.playerBase.health > 0 && this.enemyCamp.alive) {
      this.wave += 1;
      this.spawnEnemyWave(this.wave, { orders: 'attack' });
      this.waveTimer = nextEnemyWaveDelay(this.wave);
    }
    const perf = this.perfTracker;
    if (perf) {
      perf.beginFrame(dt);
      this.measurePerf('card', () => this.cardSystem.update(dt));
      this.measurePerf('enemyCommander', () => this.enemyCommander.update(dt));
      this.measurePerf('combat', () => this.combat.update(dt));
      this.measurePerf('buildings', () => this.buildings.update(dt));
      this.measurePerf('recovery', () => this.recovery.update(dt));
      this.measurePerf('altars', () => this.altars.update(dt));
      this.measurePerf('mechanics', () => this.levelMechanics.update(dt));
      this.measurePerf('areaEffects', () => this.areaEffects.update(dt));
      this.measurePerf('loot', () => this.lootDrops.update(dt));
      this.measurePerf('effects', () => this.effects.update(dt));
      this.measurePerf('structure', () => this.updateStructureFeedback(dt));
      this.measurePerf('camera', () => this.updateCamera(dt));
      this.measurePerf('world', () => this.world.update?.(dt, this.cameraTarget));
      this.measurePerf('selection', () => this.updateSelection());
      this.measurePerf('guardVisuals', () => this.updateGuardVisuals(dt));
      this.measurePerf('unitVisuals', () => this.updateUnitVisuals(dt));
      this.measurePerf('navDebug', () => this.updateNavDebug(dt));
      this.measurePerf('hud', () => this.updateHud(dt));
      this.measurePerf('render', () => this.renderer.render(this.scene, this.camera));
      perf.endFrame(this.createPerfCounters({ takeNavStats: true }));
    } else {
      this.cardSystem.update(dt);
      this.enemyCommander.update(dt);
      this.combat.update(dt);
      this.buildings.update(dt);
      this.recovery.update(dt);
      this.altars.update(dt);
      this.levelMechanics.update(dt);
      this.areaEffects.update(dt);
      this.lootDrops.update(dt);
      this.effects.update(dt);
      this.updateStructureFeedback(dt);
      this.updateCamera(dt);
      this.world.update?.(dt, this.cameraTarget);
      this.updateSelection();
      this.updateGuardVisuals(dt);
      this.updateUnitVisuals(dt);
      this.updateNavDebug(dt);
      this.updateHud(dt);
      this.renderer.render(this.scene, this.camera);
    }
    this.checkLevelEnd();
  }

  measurePerf(name, action) {
    const startedAt = performance.now();
    const result = action();
    this.perfTracker?.add(name, performance.now() - startedAt);
    return result;
  }

  createPerfCounters({ takeNavStats = false } = {}) {
    const navGrid = this.world?.navGrid;
    const rendererInfo = this.renderer.info;
    return {
      friendly: this.friendlyUnits.length,
      enemies: this.enemyUnits.length,
      effects: this.effects?.effects?.length ?? 0,
      projectiles: this.combat?.projectiles?.length ?? 0,
      pendingAttacks: this.combat?.pendingAttacks?.length ?? 0,
      navDistanceCache: this.combat?.navDistanceCache?.size ?? 0,
      sceneChildren: this.scene.children.length,
      rendererGeometries: rendererInfo?.memory?.geometries ?? 0,
      rendererTextures: rendererInfo?.memory?.textures ?? 0,
      renderCalls: rendererInfo?.render?.calls ?? 0,
      triangles: rendererInfo?.render?.triangles ?? 0,
      nav: takeNavStats
        ? navGrid?.takeStats?.() ?? null
        : navGrid?.stats ? { ...navGrid.stats } : null
    };
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  updateCamera(dt) {
    if (dt > 0 && this.edgePanActive && !this.cardSystem.drag && !this.selectionDrag && !this.cameraDrag) {
      const margin = 26;
      const width = window.innerWidth;
      const height = window.innerHeight;
      let panX = 0;
      let panZ = 0;

      if (this.pointerScreen.x <= margin) panX -= 1;
      if (this.pointerScreen.x >= width - margin) panX += 1;
      if (this.pointerScreen.y <= margin) panZ -= 1;
      if (this.pointerScreen.y >= height - margin) panZ += 1;

      if (panX !== 0 || panZ !== 0) {
        const length = Math.hypot(panX, panZ);
        const speed = 12 + this.cameraDistance * 0.24;
        this.cameraTarget.x += (panX / length) * speed * dt;
        this.cameraTarget.z += (panZ / length) * speed * dt;
        this.clampCameraTarget();
      }
    }

    this.applyCameraDragDelta();
    this.cameraTarget.y = 4;
    this.camera.position.copy(this.cameraTarget).addScaledVector(
      this.cameraOffsetDirection,
      this.cameraDistance
    );
    this.camera.lookAt(this.cameraTarget);
  }

  applyCameraDragDelta() {
    if (!this.cameraDrag) return;
    const dx = this.cameraDrag.pendingX;
    const dy = this.cameraDrag.pendingY;
    if (dx === 0 && dy === 0) return;

    this.cameraDrag.pendingX = 0;
    this.cameraDrag.pendingY = 0;
    const dragScale = 0.018 + this.cameraDistance * 0.001;
    this.cameraTarget.x -= dx * dragScale;
    this.cameraTarget.z -= dy * dragScale;
    this.clampCameraTarget();
  }

  clampCameraTarget() {
    const margin = 4;
    this.cameraTarget.x = clamp(
      this.cameraTarget.x,
      -BALANCE.battlefield.halfWidth + margin,
      BALANCE.battlefield.halfWidth - margin
    );
    this.cameraTarget.z = clamp(
      this.cameraTarget.z,
      BALANCE.battlefield.minZ + margin,
      BALANCE.battlefield.maxZ - margin
    );
  }

  onCanvasWheel(event) {
    event.preventDefault();
    this.cameraDistance = clamp(
      this.cameraDistance + event.deltaY * 0.035,
      this.cameraMinDistance,
      this.cameraMaxDistance
    );
    this.updateCamera(0);
  }

  onWindowPointerMove(event) {
    this.pointerScreen.set(event.clientX, event.clientY);
    this.edgePanActive = !this.cameraDrag && !isGameUiTarget(event.target);
  }

  onGameContextMenu(event) {
    if (!event.target?.closest?.('#app')) return;
    event.preventDefault();
    event.stopPropagation();
  }

  summonUnits(type, count, point, radius = 1, options = {}) {
    const selectSpawned = options.select ?? true;
    for (let i = 0; i < count; i += 1) {
      const offset = polarOffset(i, count, radius * 0.55);
      const position = this.resolveWalkablePoint(point.clone().add(offset));
      position.y = this.groundHeightAt(position);
      const unit = new UnitEntity({
        type,
        team: TEAMS.PLAYER,
        position
      });
      this.applySummonCardLevel(unit, options.sourceCard);
      this.attachUnitStatus(unit);
      this.friendlyUnits.push(unit);
      this.scene.add(unit.mesh);
      this.effects.spawnRing(unit.position, '#9dd8ff', 0.82, 0.52);
      if (selectSpawned) {
        this.selectUnit(unit);
      }
    }
  }

  buildStructureUnit(type, point, options = {}) {
    const position = this.resolveWalkablePoint(point.clone());
    position.y = this.groundHeightAt(position);
    const unit = new UnitEntity({
      type,
      team: TEAMS.PLAYER,
      position
    });
    this.applySummonCardLevel(unit, options.sourceCard);
    this.attachUnitStatus(unit);
    this.friendlyUnits.push(unit);
    this.scene.add(unit.mesh);
    this.buildings.startConstruction(unit, options.buildSeconds ?? options.sourceCard?.buildSeconds ?? 30);
    this.effects.spawnRing(unit.position, '#dff8ff', 1.1, 0.62);
    this.selectUnit(unit);
    return unit;
  }

  canDeploySummonAt(point) {
    if (!point) return false;
    return this.getSummonDeploymentAnchors().some((anchor) => (
      Math.hypot(point.x - anchor.position.x, point.z - anchor.position.z) <= anchor.radius
    ));
  }

  canPlaceBeaconAt(point) {
    if (!point) return false;
    return this.friendlyUnits.some((unit) => (
      unit.alive &&
      !unit.underConstruction &&
      !unit.isBuilding &&
      Math.hypot(point.x - unit.position.x, point.z - unit.position.z) <= BEACON_PLACEMENT_RADIUS
    ));
  }

  getSummonDeploymentAnchors() {
    const anchors = [];
    if (this.playerBase?.alive !== false) {
      anchors.push({
        position: this.playerBase.position,
        radius: SUMMON_DEPLOY_RADIUS
      });
    }
    this.friendlyUnits.forEach((unit) => {
      if (!unit.alive || unit.underConstruction) return;
      if (unit.definition?.deploymentBeacon !== true) return;
      anchors.push({
        position: unit.position,
        radius: unit.definition.deploymentRadius ?? SUMMON_DEPLOY_RADIUS
      });
    });
    return anchors;
  }

  applySummonCardLevel(unit, card) {
    const level = Math.max(1, Math.floor(card?.level ?? 1));
    if (level <= 1) return;
    const bonusLevel = level - 1;
    const healthMultiplier = 1 + bonusLevel * 0.25;
    unit.attributes.addModifiers([
      {
        stat: 'maxHealth',
        type: 'multiply',
        amount: healthMultiplier
      },
      {
        stat: 'maxShield',
        type: 'multiply',
        amount: healthMultiplier
      },
      {
        stat: 'maxDurability',
        type: 'multiply',
        amount: healthMultiplier
      },
      {
        stat: 'attackDamage',
        type: 'add',
        amount: bonusLevel
      }
    ], `card:${card.id}:level`);
    unit.health = unit.maxHealth;
    unit.weapon.durability = unit.weapon.maxDurability;
    unit.clampToAttributeCaps();
  }

  spawnEnemyWave(wave, { orders = 'attack' } = {}) {
    const difficulty = this.effectiveDifficulty();
    const count = Math.min(12, 2 + Math.floor(wave * 0.72) + Math.floor((difficulty - 1) * 0.45));
    const spawnedUnits = [];
    for (let i = 0; i < count; i += 1) {
      const offset = polarOffset(i, count, 1.2 + (i % 3) * 0.45);
      const position = this.resolveWalkablePoint(this.enemyCamp.position.clone().setY(0).add(offset));
      position.y = this.groundHeightAt(position);
      const unit = new UnitEntity({
        type: this.enemyTypeForWave(wave, i, difficulty),
        team: TEAMS.ENEMY,
        position
      });
      this.applyEnemyDifficulty(unit, wave, difficulty);
      this.attachUnitStatus(unit);
      this.enemyUnits.push(unit);
      spawnedUnits.push(unit);
      this.scene.add(unit.mesh);
      if (orders === 'attack' && !this.enemyCommander) {
        this.orderEnemyAttack(unit, i, count);
      }
    }
    this.enemyCommander?.registerWave(spawnedUnits, wave, orders);
  }

  enemyTypeForWave(wave, index, difficulty) {
    const pool = this.levelSession.level.enemyPool ?? [];
    const pooledType = selectEnemyFromPool(pool, wave, index, difficulty);
    if (pooledType) return pooledType;

    const wizardUnlocked = difficulty >= 4 || wave >= 7;
    if (wizardUnlocked) {
      const wizardEvery = difficulty >= 6 ? 5 : 7;
      if ((index * 3 + wave) % wizardEvery === 0) return 'wizard';
    }
    const ogreUnlocked = difficulty >= 3 || wave >= 5;
    if (ogreUnlocked) {
      const ogreEvery = difficulty >= 5 ? 4 : 6;
      if ((index + wave * 2) % ogreEvery === 0) return 'ogre';
    }
    const skeletonArcherUnlocked = difficulty >= 3 || wave >= 4;
    if (skeletonArcherUnlocked && (index + wave * 3) % 5 === 1) {
      return 'skeletonArcher';
    }
    const skeletonUnlocked = difficulty >= 2 || wave >= 2;
    if (skeletonUnlocked && (index + wave) % 3 === 1) {
      return 'skeletonSoldier';
    }
    const archerUnlocked = difficulty >= 2 || wave >= 3;
    if (!archerUnlocked) return 'goblinSoldier';
    const archerEvery = difficulty >= 5 ? 2 : difficulty >= 3 ? 3 : 4;
    return (index + wave) % archerEvery === 0 ? 'goblinArcher' : 'goblinSoldier';
  }

  levelBaseDifficulty() {
    return Math.max(1, Math.floor(this.levelSession.level.baseDifficulty ?? 1));
  }

  effectiveDifficulty() {
    const challengeDifficulty = Math.max(1, Math.floor(this.levelSession.difficulty ?? 1));
    return this.levelBaseDifficulty() + challengeDifficulty - 1;
  }

  applyEnemyDifficulty(unit, wave, difficulty) {
    const healthFactor = 1 + (difficulty - 1) * 0.14 + (wave - 1) * 0.035;
    const damageFactor = 1 + (difficulty - 1) * 0.12 + (wave - 1) * 0.025;
    unit.attributes.addModifiers([
      {
        stat: 'maxHealth',
        type: 'multiply',
        amount: healthFactor
      },
      {
        stat: 'maxShield',
        type: 'multiply',
        amount: healthFactor
      },
      {
        stat: 'attackDamage',
        type: 'multiply',
        amount: damageFactor
      }
    ], 'level:difficulty');
    this.applyEnemyStartingBuffs(unit, wave, difficulty);
    unit.health = unit.maxHealth;
    unit.clampToAttributeCaps();
  }

  applyEnemyStartingBuffs(unit, wave, difficulty) {
    const startingBuffs = unit.definition.startingBuffs ?? [];
    if (!startingBuffs.length) return;
    const scalingLevel = enemyEnchantmentLevel(wave, difficulty);
    startingBuffs.forEach((entry) => {
      const level = (entry.level ?? 1) + (entry.scalesWithDifficulty ? scalingLevel - 1 : 0);
      this.buffs.applyBuff(unit, entry.buffId, unit, {
        level,
        sourceUnitType: unit.type
      });
    });
  }

  orderEnemyAttack(unit, index, total) {
    const formationRadius = Math.min(3, 0.8 + Math.sqrt(total) * 0.38);
    const goal = this.playerBase.position.clone().add(
      commandFormationOffset(
        index,
        total,
        this.playerBase.collisionRadius + formationRadius
      )
    );
    goal.y = this.groundHeightAt(goal);
    unit.moveGoal = goal;
    unit.commandMoveGoal = null;
  }

  spawnWildlife() {
    (this.world.config?.wildlife ?? this.worldConfig.wildlife ?? BALANCE.world.wildlife).forEach((spawn, index) => {
      const unit = new UnitEntity({
        type: spawn.type,
        team: TEAMS.ENEMY,
        position: new THREE.Vector3(spawn.x, this.groundHeightAt(spawn), spawn.z)
      });
      this.applyWildlifeDifficulty(unit);
      this.attachUnitStatus(unit);
      unit.isWildlife = true;
      unit.spawnPoint = unit.position.clone();
      unit.leashRadius = spawn.radius;
      unit.moveGoal = unit.spawnPoint.clone();
      unit.wanderGoal = unit.spawnPoint.clone();
      unit.wanderTimer = 0;
      unit.attackTimer += index * 0.08;
      this.enemyUnits.push(unit);
      this.scene.add(unit.mesh);
      this.effects.spawnRing(unit.position, spawn.type === 'bear' ? '#9b6b45' : '#8aa0a8', 0.66, 0.5);
    });
  }

  applyWildlifeDifficulty(unit) {
    const difficulty = this.effectiveDifficulty();
    if (difficulty <= 1) return;
    const scaling = unit.definition.wildlife?.scaling ?? {};
    const bonusLevel = difficulty - 1;
    const healthFactor = 1 + bonusLevel * (scaling.healthPerDifficulty ?? 0.12);
    const shieldFactor = 1 + bonusLevel * (
      scaling.shieldPerDifficulty ?? scaling.healthPerDifficulty ?? 0.12
    );
    const damageFactor = 1 + bonusLevel * (scaling.damagePerDifficulty ?? 0.1);
    unit.attributes.addModifiers([
      {
        stat: 'maxHealth',
        type: 'multiply',
        amount: healthFactor
      },
      {
        stat: 'maxShield',
        type: 'multiply',
        amount: shieldFactor
      },
      {
        stat: 'attackDamage',
        type: 'multiply',
        amount: damageFactor
      }
    ], 'wildlife:difficulty');
    unit.health = unit.maxHealth;
    unit.clampToAttributeCaps();
  }

  groundHeightAt(pointOrX, maybeZ = null) {
    const x = typeof pointOrX === 'number' ? pointOrX : pointOrX.x;
    const z = typeof pointOrX === 'number' ? maybeZ : pointOrX.z;
    return this.world?.heightAt?.(x, z) ?? 0;
  }

  placeUnitOnGround(unit, dt = 0) {
    const groundY = this.groundHeightAt(unit.position);
    if (dt <= 0 || !Number.isFinite(unit.verticalVelocity)) {
      unit.position.y = groundY;
      unit.verticalVelocity = 0;
      unit.grounded = true;
      return;
    }

    const groundOffset = groundY - unit.position.y;
    if (groundOffset > UNIT_GROUND_EPSILON) {
      if (groundOffset > UNIT_MAX_SMOOTH_CLIMB_HEIGHT) {
        unit.position.y = groundY;
      } else {
        unit.position.y += Math.min(groundOffset, UNIT_CLIMB_SPEED * dt);
      }
      unit.verticalVelocity = 0;
      unit.grounded = true;
      return;
    }

    if (groundOffset >= -UNIT_GROUND_EPSILON) {
      unit.position.y = groundY;
      unit.verticalVelocity = 0;
      unit.grounded = true;
      return;
    }

    unit.verticalVelocity = Math.max(
      (unit.verticalVelocity ?? 0) - UNIT_GRAVITY * dt,
      -UNIT_MAX_FALL_SPEED
    );
    unit.position.y += unit.verticalVelocity * dt;

    if (unit.position.y <= groundY + UNIT_GROUND_EPSILON) {
      unit.position.y = groundY;
      unit.verticalVelocity = 0;
      unit.grounded = true;
    } else {
      unit.grounded = false;
    }
  }

  isPointWalkable(point, options = {}) {
    if (
      Math.abs(point.x) > BALANCE.battlefield.halfWidth ||
      point.z < BALANCE.battlefield.minZ ||
      point.z > BALANCE.battlefield.maxZ
    ) {
      return false;
    }

    if (!options.allowUnsafeSurface && !this.isPointOnSafeSurface(point)) {
      return false;
    }

    if (
      !options.allowUnsafeSurface &&
      !options.allowOffNavigation &&
      this.world?.isWalkable &&
      !this.world.isWalkable(point)
    ) {
      return false;
    }

    return !this.getStructureCollision(point);
  }

  isPointOnSafeSurface(point) {
    return this.world?.isSafeSurface?.(point) ?? true;
  }

  isPointOnNavigationSurface(point) {
    return this.world?.isWalkable?.(point) ?? true;
  }

  hasSafeSurfaceLine(start, end) {
    if (!start || !end) return true;
    if (this.world?.hasNavigationLine) {
      return this.world.hasNavigationLine(start, end);
    }
    const distance = Math.hypot(end.x - start.x, end.z - start.z);
    const sampleCount = Math.max(2, Math.ceil(distance / 1.15));
    for (let i = 1; i <= sampleCount; i += 1) {
      const t = i / sampleCount;
      const point = {
        x: start.x + (end.x - start.x) * t,
        z: start.z + (end.z - start.z) * t
      };
      if (!this.isPointOnSafeSurface(point)) return false;
    }
    return true;
  }

  safeSurfaceWaypointToward(position, targetPosition, unit = null, desiredDistance = 0.22) {
    return this.safeSurfaceSteeringToward(position, targetPosition, unit, desiredDistance)?.debugTarget ?? null;
  }

  safeSurfaceSteeringToward(position, targetPosition, unit = null, desiredDistance = 0.22) {
    if (!this.world?.navGrid) return null;
    return this.navGridSteeringToward(position, targetPosition, unit, desiredDistance);
  }

  navGridWaypointToward(position, targetPosition, unit = null, desiredDistance = 0.22) {
    return this.navGridSteeringToward(position, targetPosition, unit, desiredDistance)?.debugTarget ?? null;
  }

  navGridSteeringToward(position, targetPosition, unit = null, desiredDistance = 0.22) {
    if (!this.world?.findPath || !position || !targetPosition) return null;
    const startsOnNavigation = this.isPointOnNavigationSurface(position);
    const hasDirectNavigationLine = startsOnNavigation &&
      this.hasNavigationLineForUnit(unit, position, targetPosition);
    if (!unit) {
      if (hasDirectNavigationLine) {
        return steeringFromRoute(position, targetPosition, [targetPosition], {
          desiredDistance,
          startsOnNavigation
        });
      }
      const path = this.world.findPath(position, targetPosition, {
        smooth: false,
        startRequireLine: startsOnNavigation,
        startAllowLooseFallback: true,
        endRequireLine: false
      });
      return steeringFromRoute(position, targetPosition, path, {
        desiredDistance,
        startsOnNavigation
      });
    }

    const targetChanged = !unit.routeTarget ||
      flatDistance(unit.routeTarget, targetPosition) > ROUTE_REPATH_DISTANCE;
    const currentWaypoint = Array.isArray(unit.route)
      ? unit.route[unit.routeIndex ?? 0]
      : null;
    const offRoute = currentWaypoint && this.isUnitOffRoute(unit, currentWaypoint);
    const needsRoute = !hasDirectNavigationLine && (
      targetChanged ||
      !Array.isArray(unit.route) ||
      unit.route.length === 0 ||
      offRoute
    );

    if (hasDirectNavigationLine) {
      this.clearUnitRoute(unit);
      const steering = steeringFromRoute(position, targetPosition, [targetPosition], {
        desiredDistance,
        startsOnNavigation
      });
      unit.navSteeringTarget = steering?.debugTarget?.clone?.() ?? null;
      return steering;
    }

    if (needsRoute) {
      const canRepath = (unit.nextRouteRepathAt ?? 0) <= this.elapsedTime;
      if (canRepath) {
        unit.route = this.world.findPath(position, targetPosition, {
          smooth: false,
          startRequireLine: startsOnNavigation,
          startAllowLooseFallback: true,
          endRequireLine: false
        });
        unit.routeIndex = 0;
        unit.routeTarget = new THREE.Vector3(targetPosition.x, 0, targetPosition.z);
        unit.nextRouteRepathAt = this.elapsedTime + routeRepathCooldown(unit, ROUTE_REPATH_COOLDOWN);
      }
    }

    if (!Array.isArray(unit.route) || unit.route.length === 0) return null;

    let index = clamp(unit.routeIndex ?? 0, 0, unit.route.length - 1);
    while (
      index < unit.route.length - 1 &&
      (
        flatDistance(position, unit.route[index]) <= ROUTE_WAYPOINT_RADIUS ||
        flatDistance(position, unit.route[index + 1]) < flatDistance(position, unit.route[index])
      )
    ) {
      index += 1;
    }
    unit.routeIndex = index;

    const steering = steeringFromRoute(
      position,
      targetPosition,
      unit.route.slice(index),
      {
        desiredDistance,
        startsOnNavigation
      }
    );
    if (steering?.debugTarget) {
      unit.navSteeringTarget = steering.debugTarget.clone();
    } else {
      unit.navSteeringTarget = null;
    }
    return steering;
  }

  hasNavigationLineForUnit(unit, position, targetPosition) {
    if (!this.world?.hasNavigationLine) return false;
    if (!unit) return this.world.hasNavigationLine(position, targetPosition);

    const targetChanged = !unit.navDirectLineTarget ||
      flatDistance(unit.navDirectLineTarget, targetPosition) > NAV_LINE_RECHECK_DISTANCE;
    const positionChanged = !unit.navDirectLinePosition ||
      flatDistance(unit.navDirectLinePosition, position) > NAV_LINE_RECHECK_DISTANCE;
    const shouldCheck = targetChanged ||
      positionChanged ||
      (unit.nextNavDirectLineCheckAt ?? 0) <= this.elapsedTime;

    if (shouldCheck) {
      unit.hasNavDirectLine = this.world.hasNavigationLine(position, targetPosition);
      unit.nextNavDirectLineCheckAt = this.elapsedTime + NAV_LINE_RECHECK_COOLDOWN;
      unit.navDirectLineTarget = new THREE.Vector3(targetPosition.x, 0, targetPosition.z);
      unit.navDirectLinePosition = new THREE.Vector3(position.x, 0, position.z);
    }
    return unit.hasNavDirectLine === true;
  }

  isUnitOffRoute(unit, waypoint) {
    if (!unit || !waypoint) return false;
    if (flatDistance(unit.position, waypoint) <= ROUTE_REJOIN_DISTANCE) {
      unit.isOffRoute = false;
      return false;
    }

    const waypointChanged = !unit.offRouteCheckTarget ||
      flatDistance(unit.offRouteCheckTarget, waypoint) > NAV_LINE_RECHECK_DISTANCE;
    const positionChanged = !unit.offRouteCheckPosition ||
      flatDistance(unit.offRouteCheckPosition, unit.position) > NAV_LINE_RECHECK_DISTANCE;
    const shouldCheck = waypointChanged ||
      positionChanged ||
      (unit.nextOffRouteCheckAt ?? 0) <= this.elapsedTime;

    if (shouldCheck) {
      unit.isOffRoute = !this.world.hasNavigationLine?.(unit.position, waypoint);
      unit.nextOffRouteCheckAt = this.elapsedTime + OFF_ROUTE_RECHECK_COOLDOWN;
      unit.offRouteCheckTarget = waypoint.clone?.() ?? new THREE.Vector3(waypoint.x, 0, waypoint.z);
      unit.offRouteCheckPosition = new THREE.Vector3(unit.position.x, 0, unit.position.z);
    }
    return unit.isOffRoute === true;
  }

  clearUnitRoute(unit) {
    if (!unit) return;
    unit.route = null;
    unit.routeIndex = null;
    unit.routeTarget = null;
    unit.navSteeringTarget = null;
    unit.navMoveTarget = null;
    unit.nextRouteRepathAt = 0;
  }

  requestUnitRouteRepath(unit, delay = ROUTE_BLOCKED_REPATH_COOLDOWN) {
    if (!unit) return;
    unit.route = null;
    unit.routeIndex = null;
    unit.routeTarget = null;
    unit.navSteeringTarget = null;
    unit.nextRouteRepathAt = this.elapsedTime + routeRepathCooldown(unit, delay);
  }

  getBlockingStructures() {
    return [this.playerBase, this.enemyCamp].filter((structure) => (
      structure?.alive !== false && structure.collisionRadius > 0
    ));
  }

  getStructureCollision(point, padding = 0) {
    return this.getBlockingStructures().find((structure) => {
      const dx = point.x - structure.position.x;
      const dz = point.z - structure.position.z;
      return Math.hypot(dx, dz) < structure.collisionRadius + padding;
    }) ?? null;
  }

  resolveWalkablePoint(point, padding = STRUCTURE_PUSH_PADDING) {
    const resolved = point.clone();
    for (let iteration = 0; iteration < 3; iteration += 1) {
      let adjusted = false;
      this.getBlockingStructures().forEach((structure) => {
        const radius = structure.collisionRadius + padding;
        const dx = resolved.x - structure.position.x;
        const dz = resolved.z - structure.position.z;
        let distance = Math.hypot(dx, dz);
        if (distance >= radius) return;

        let nx = dx;
        let nz = dz;
        if (distance < 0.001) {
          nx = 0;
          nz = structure === this.playerBase ? -1 : 1;
          distance = 1;
        } else {
          nx /= distance;
          nz /= distance;
        }
        resolved.x = structure.position.x + nx * radius;
        resolved.z = structure.position.z + nz * radius;
        adjusted = true;
      });
      if (!adjusted) break;
    }
    resolved.x = clamp(resolved.x, -BALANCE.battlefield.halfWidth, BALANCE.battlefield.halfWidth);
    resolved.z = clamp(resolved.z, BALANCE.battlefield.minZ, BALANCE.battlefield.maxZ);
    resolved.y = this.groundHeightAt(resolved);
    return this.isPointWalkable(resolved)
      ? resolved
      : this.resolveNearestNavigationPoint(resolved, { maxRings: 14, requireSafeSurface: false }) ?? resolved;
  }

  resolveCommandPoint(point) {
    if (!point) return null;
    point.y = this.groundHeightAt(point);
    if (this.isPointWalkable(point)) return point;
    return this.resolveNearestNavigationPoint(point, {
      maxRings: 14,
      requireSafeSurface: true
    });
  }

  resolveNearestNavigationPoint(point, {
    maxRings = 12,
    requireSafeSurface = true
  } = {}) {
    if (!this.world?.navGrid?.nearestWalkableCell || !this.world?.navGrid?.cellCenter) return null;
    if (requireSafeSurface && !this.isPointOnSafeSurface(point)) return null;

    const cell = this.world.navGrid.nearestWalkableCell(point, maxRings, {
      requireLine: false
    });
    if (!cell) return null;
    const snapped = this.world.navGrid.cellCenter(cell.x, cell.z);
    snapped.y = this.groundHeightAt(snapped);
    return this.isPointWalkable(snapped) ? snapped : null;
  }

  updateStructureFeedback(dt) {
    [this.playerBase, this.enemyCamp].forEach((structure) => {
      const model = structure.model;
      const basePosition = structure.modelBasePosition;
      if (!model || !basePosition) return;

      if (structure.shakeTime > 0) {
        structure.shakeTime = Math.max(0, structure.shakeTime - dt);
        const t = 1 - structure.shakeTime / structure.shakeDuration;
        const falloff = 1 - t;
        const pulse = Math.sin(t * Math.PI * 18);
        const cross = Math.cos(t * Math.PI * 14);
        const strength = structure.shakeStrength * falloff;
        model.position.set(
          basePosition.x + pulse * strength,
          basePosition.y + Math.abs(cross) * strength * 0.22,
          basePosition.z + cross * strength * 0.75
        );
        return;
      }

      model.position.copy(basePosition);
    });
  }

  shakeStructure(structure, strength = 0.18, duration = 0.34) {
    if (!structure?.model) return;
    structure.shakeDuration = duration;
    structure.shakeTime = Math.max(structure.shakeTime ?? 0, duration);
    structure.shakeStrength = Math.max(structure.shakeStrength ?? 0, strength);
  }

  castMeteor(point, card) {
    this.spells.cast('meteor', { point, card });
  }

  damagePlayerBase(amount) {
    const previousHealth = this.playerBase.health;
    this.playerBase.health = Math.max(0, this.playerBase.health - amount);
    registerStructureHealthLoss(this.playerBase, previousHealth);
    this.playerBase.alive = this.playerBase.health > 0;
    this.shakeStructure(this.playerBase, 0.2, 0.36);
    this.effects.spawnRing(this.playerBase.position, '#ff8c66', 1.2, 0.44);
    this.effects.spawnStructureDust(this.playerBase.position, this.playerBase.collisionRadius);
    this.effects.spawnDamageNumber(this.playerBase.position, amount, {
      height: 2.55
    });
  }

  damageEnemyCamp(amount) {
    if (!this.enemyCamp.alive) return;
    const previousHealth = this.enemyCamp.health;
    this.enemyCamp.health = Math.max(0, this.enemyCamp.health - amount);
    registerStructureHealthLoss(this.enemyCamp, previousHealth);
    this.enemyCamp.alive = this.enemyCamp.health > 0;
    this.shakeStructure(this.enemyCamp, 0.16, 0.32);
    this.effects.spawnRing(this.enemyCamp.position, '#ff8c66', 1.1, 0.44);
    this.effects.spawnStructureDust(this.enemyCamp.position, this.enemyCamp.collisionRadius, '#8d7464');
    this.effects.spawnDamageNumber(this.enemyCamp.position, amount, {
      height: 2.7
    });
  }

  checkLevelEnd() {
    if (this.levelFinished) return;
    if (!this.enemyCamp.alive) {
      this.finishLevel(true);
      return;
    }
    if (!this.playerBase.alive) {
      this.finishLevel(false);
    }
  }

  finishLevel(victory) {
    if (this.levelFinished) return;
    this.levelFinished = true;
    this.stop();
    this.onLevelComplete?.({
      victory,
      elapsedTime: this.elapsedTime,
      wave: this.wave,
      session: this.levelSession,
      playerBaseHealth: this.playerBase.health,
      enemyCampHealth: this.enemyCamp.health
    });
  }

  selectUnit(unit) {
    this.selectUnits(unit ? [unit] : []);
  }

  selectUnits(units) {
    const unique = new Set();
    this.selectedUnits = units.filter((unit) => {
      if (!unit?.alive || unit.team !== TEAMS.PLAYER || unique.has(unit.id)) return false;
      unique.add(unit.id);
      return true;
    });
    this.selectedUnit = this.selectedUnits[0] ?? null;
  }

  onCanvasPointerDown(event) {
    if (event.target !== this.canvas) return;
    this.pointerScreen.set(event.clientX, event.clientY);

    if (event.button === 1) {
      this.beginCameraDrag(event);
      return;
    }

    if (event.button === 2) {
      event.preventDefault();
      this.issueMoveCommand(event);
      return;
    }

    if (event.button !== 0 || this.cardSystem.drag) return;
    if (this.lootDrops?.tryOpenPickup(event)) return;
    event.preventDefault();
    this.selectionDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      active: false
    };
    if (event.pointerId != null) {
      this.canvas.setPointerCapture?.(event.pointerId);
    }
  }

  onCanvasMouseDown(event) {
    if (event.button === 1) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.button !== 0 || this.selectionDrag) return;
    this.onCanvasPointerDown(event);
  }

  onCanvasAuxClick(event) {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
  }

  onKeyDown(event) {
    if (event.repeat || isTextInputTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === 'n') {
      event.preventDefault();
      this.setNavDebugEnabled(!this.navDebugEnabled);
      return;
    }
    if (!this.selectedUnits.some((unit) => unit.alive)) return;
    if (key === 's') {
      event.preventDefault();
      this.stopSelectedUnits();
    } else if (key === 'z') {
      event.preventDefault();
      this.guardSelectedUnits();
    }
  }

  onCanvasPointerMove(event) {
    this.pointerScreen.set(event.clientX, event.clientY);
    if (this.updateCameraDrag(event)) return;
    if (!this.isCurrentSelectionEvent(event)) return;
    this.selectionDrag.currentX = event.clientX;
    this.selectionDrag.currentY = event.clientY;

    const dx = event.clientX - this.selectionDrag.startX;
    const dy = event.clientY - this.selectionDrag.startY;
    if (Math.hypot(dx, dy) > 6) {
      this.selectionDrag.active = true;
    }
    this.updateSelectionBox();
  }

  onCanvasPointerUp(event) {
    if (this.endCameraDrag(event)) return;
    if (!this.isCurrentSelectionEvent(event)) return;
    const drag = this.selectionDrag;
    this.selectionDrag = null;
    if (event.pointerId != null) {
      this.canvas.releasePointerCapture?.(event.pointerId);
    }
    this.hideSelectionBox();

    if (drag.active) {
      this.selectUnits(this.unitsInScreenRect(drag));
      return;
    }

    this.selectUnit(this.pickFriendlyUnit(event.clientX, event.clientY));
  }

  onCanvasPointerCancel(event) {
    if (this.endCameraDrag(event)) return;
    if (!this.isCurrentSelectionEvent(event)) return;
    this.selectionDrag = null;
    if (event.pointerId != null) {
      this.canvas.releasePointerCapture?.(event.pointerId);
    }
    this.hideSelectionBox();
  }

  isCurrentSelectionEvent(event) {
    if (!this.selectionDrag) return false;
    return event.pointerId == null || this.selectionDrag.pointerId == null || this.selectionDrag.pointerId === event.pointerId;
  }

  beginCameraDrag(event) {
    if (this.cardSystem.drag || this.selectionDrag || isGameUiTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    this.cameraDrag = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      pendingX: 0,
      pendingY: 0
    };
    this.edgePanActive = false;
    this.canvas.classList.add('is-camera-dragging');
    if (event.pointerId != null) {
      this.canvas.setPointerCapture?.(event.pointerId);
    }
  }

  updateCameraDrag(event) {
    if (!this.isCurrentCameraDragEvent(event)) return false;
    event.preventDefault();
    event.stopPropagation?.();
    const dx = event.clientX - this.cameraDrag.lastX;
    const dy = event.clientY - this.cameraDrag.lastY;
    this.cameraDrag.lastX = event.clientX;
    this.cameraDrag.lastY = event.clientY;

    if (dx !== 0 || dy !== 0) {
      this.cameraDrag.pendingX += dx;
      this.cameraDrag.pendingY += dy;
    }
    return true;
  }

  endCameraDrag(event) {
    if (!this.isCameraDragEndEvent(event)) return false;
    event.preventDefault?.();
    event.stopPropagation?.();
    const pointerId = event.pointerId ?? this.cameraDrag.pointerId;
    if (pointerId != null) {
      this.canvas.releasePointerCapture?.(pointerId);
    }
    this.cancelCameraDrag();
    return true;
  }

  isCurrentCameraDragEvent(event) {
    if (!this.cameraDrag) return false;
    if (event.pointerId == null) return this.cameraDrag.pointerId == null;
    return this.cameraDrag.pointerId == null || this.cameraDrag.pointerId === event.pointerId;
  }

  isCameraDragEndEvent(event) {
    if (!this.cameraDrag) return false;
    if (this.isCurrentCameraDragEvent(event)) return true;
    return event.pointerId == null && event.button === 1;
  }

  cancelCameraDrag() {
    if (!this.cameraDrag) return;
    this.cameraDrag = null;
    this.canvas.classList.remove('is-camera-dragging');
  }

  updateSelectionBox() {
    if (!this.selectionDrag?.active) {
      this.hideSelectionBox();
      return;
    }
    const x = Math.min(this.selectionDrag.startX, this.selectionDrag.currentX);
    const y = Math.min(this.selectionDrag.startY, this.selectionDrag.currentY);
    const width = Math.abs(this.selectionDrag.currentX - this.selectionDrag.startX);
    const height = Math.abs(this.selectionDrag.currentY - this.selectionDrag.startY);
    this.selectionBox.hidden = false;
    this.selectionBox.style.transform = `translate(${x}px, ${y}px)`;
    this.selectionBox.style.width = `${width}px`;
    this.selectionBox.style.height = `${height}px`;
  }

  hideSelectionBox() {
    this.selectionBox.hidden = true;
  }

  pickFriendlyUnit(clientX, clientY) {
    this.setPointerFromClient(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const objects = this.friendlyUnits.flatMap((unit) => unit.mesh.children);
    const hit = this.raycaster
      .intersectObjects(objects, true)
      .find((entry) => entry.object.userData.entity?.alive);
    if (hit?.object.userData.entity) return hit.object.userData.entity;

    let best = null;
    let bestDistance = 42;
    this.friendlyUnits.forEach((unit) => {
      if (!unit.alive) return;
      const screen = this.worldToScreen(unit.position);
      const distance = Math.hypot(screen.x - clientX, screen.y - clientY);
      if (distance < bestDistance) {
        best = unit;
        bestDistance = distance;
      }
    });
    return best;
  }

  unitsInScreenRect(drag) {
    const minX = Math.min(drag.startX, drag.currentX);
    const maxX = Math.max(drag.startX, drag.currentX);
    const minY = Math.min(drag.startY, drag.currentY);
    const maxY = Math.max(drag.startY, drag.currentY);
    return this.friendlyUnits.filter((unit) => {
      if (!unit.alive) return false;
      const screen = this.worldToScreen(unit.position);
      return screen.x >= minX && screen.x <= maxX && screen.y >= minY && screen.y <= maxY;
    });
  }

  issueMoveCommand(event) {
    const point = this.groundPointFromClient(event.clientX, event.clientY);
    if (!point || !this.selectedUnits.length) return;
    this.commandSelectedUnits(point);
  }

  commandSelectedUnits(point) {
    const units = this.selectedUnits.filter((unit) => unit.alive);
    if (!units.length) return;
    const commandCenter = this.resolveWalkablePoint(point);
    const formationRadius = Math.min(2.4, 0.55 + Math.sqrt(units.length) * 0.42);
    const forceMoveUnits = [];
    units.forEach((unit, index) => {
      const destination = this.resolveWalkablePoint(
        commandCenter.clone().add(commandFormationOffset(index, units.length, formationRadius))
      );
      destination.y = this.groundHeightAt(destination);
      const forceMove = this.isUnitEngaged(unit);
      unit.commandMoveGoal = forceMove ? destination.clone() : null;
      unit.moveGoal = destination.clone();
      this.clearUnitRoute(unit);
      unit.target = null;
      unit.controlMode = 'normal';
      unit.guardPoint = null;
      unit.guardRadius = null;
      if (forceMove) forceMoveUnits.push(unit);
    });
    this.combat.cancelPendingAttacksFor(forceMoveUnits);
    this.effects.spawnMoveDestination(commandCenter, formationRadius);
  }

  isUnitEngaged(unit) {
    return Boolean(unit.target?.alive !== false && unit.target) ||
      Boolean(this.combat.getActiveAttackFor(unit));
  }

  stopSelectedUnits() {
    const units = this.selectedUnits.filter((unit) => unit.alive);
    if (!units.length) return;
    units.forEach((unit) => {
      unit.controlMode = 'hold';
      unit.moveGoal = null;
      unit.commandMoveGoal = null;
      unit.target = null;
      this.clearUnitRoute(unit);
      unit.guardPoint = null;
      unit.guardRadius = null;
      unit.knockbackVelocity.set(0, 0, 0);
    });
    this.combat.cancelPendingAttacksFor(units);
  }

  guardSelectedUnits() {
    const units = this.selectedUnits.filter((unit) => unit.alive);
    if (!units.length) return;
    units.forEach((unit) => {
      unit.controlMode = 'guard';
      unit.guardPoint = unit.position.clone();
      unit.guardPoint.y = this.groundHeightAt(unit.guardPoint);
      unit.guardRadius = this.gameGuardRadiusFor(unit);
      unit.moveGoal = null;
      unit.commandMoveGoal = null;
      unit.target = null;
      this.clearUnitRoute(unit);
    });
    this.combat.cancelPendingAttacksFor(units);
    this.effects.spawnRing(units[0].position, '#78e3ff', 0.8, 0.52);
  }

  gameGuardRadiusFor(unit) {
    const attackRange = this.modifiers.getAttackRange(unit);
    const aggroRange = this.modifiers.getAggroRange(unit);
    return Math.max(attackRange + 0.9, aggroRange);
  }

  setPointerFromClient(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  groundPointFromClient(clientX, clientY) {
    this.setPointerFromClient(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.world?.ground) {
      this.world.ground.updateMatrixWorld(true);
      const terrainHit = this.raycaster.intersectObject(this.world.ground, false)[0];
      if (terrainHit?.point) {
        const point = terrainHit.point.clone();
        return this.resolveCommandPoint(point);
      }
    }

    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point)) {
      return null;
    }
    return this.resolveCommandPoint(point);
  }

  updateSelection() {
    this.selectedUnits = this.selectedUnits.filter((unit) => unit.alive);
    this.selectedUnit = this.selectedUnits[0] ?? null;
    this.ensureSelectionRingCount(this.selectedUnits.length);

    this.selectionRings.forEach((ring, index) => {
      const unit = this.selectedUnits[index];
      ring.visible = Boolean(unit);
      if (!unit) return;
      ring.position.x = unit.position.x;
      ring.position.y = unit.position.y + 0.05;
      ring.position.z = unit.position.z;
      ring.rotation.set(0, 0, 0);
      ring.userData.ring.rotation.z += 0.035;
      ring.userData.glow.rotation.z -= 0.018;
    });
  }

  ensureSelectionRingCount(count) {
    while (this.selectionRings.length < count) {
      const ring = createSelectionRing();
      this.selectionRings.push(ring);
      this.scene.add(ring);
    }
  }

  updateGuardVisuals(dt) {
    const guardUnits = new Set(
      this.friendlyUnits.filter((unit) => unit.alive && unit.controlMode === 'guard')
    );
    [...this.guardVisuals.entries()].forEach(([unit, visuals]) => {
      if (guardUnits.has(unit)) return;
      this.scene.remove(visuals.flag, visuals.rangeRing);
      this.guardVisuals.delete(unit);
    });

    guardUnits.forEach((unit) => {
      const visuals = this.guardVisuals.get(unit) ?? this.createGuardVisuals(unit);
      const height = unitStatusHeight(unit) + 0.24;
      visuals.flag.visible = true;
      visuals.flag.position.set(unit.position.x, unit.position.y + height, unit.position.z);
      visuals.flag.rotation.y += dt * 2.7;

      const attackRange = this.modifiers.getAttackRange(unit);
      const center = unit.guardPoint ?? unit.position;
      visuals.rangeRing.visible = true;
      visuals.rangeRing.position.set(center.x, this.groundHeightAt(center) + 0.085, center.z);
      visuals.rangeRing.scale.setScalar(attackRange);
      visuals.rangeRing.userData.ring.rotation.z += dt * 0.42;
      visuals.rangeRing.userData.glow.rotation.z -= dt * 0.18;
    });
  }

  createGuardVisuals(unit) {
    const visuals = {
      flag: createGuardFlag(),
      rangeRing: createAttackRangeRing()
    };
    this.guardVisuals.set(unit, visuals);
    this.scene.add(visuals.flag, visuals.rangeRing);
    return visuals;
  }

  setNavDebugEnabled(enabled) {
    this.navDebugEnabled = Boolean(enabled);
    if (this.navDebugGroup) {
      this.navDebugGroup.visible = this.navDebugEnabled;
    }
    if (this.navDebugEnabled) {
      this.ensureNavDebugGrid();
    }
  }

  ensureNavDebugGrid() {
    if (!this.world?.navGrid || !this.navDebugGroup) return;
    this.world.navGrid.ensureDebugGeometry?.();

    if (!this.navDebugMesh) {
      this.navDebugMesh = createNavDebugMesh(
        this.world.navGrid.debugLines,
        (point) => this.groundHeightAt(point)
      );
      if (this.navDebugMesh) {
        this.navDebugGroup.add(this.navDebugMesh);
      }
    }

    if (!this.navDebugGrid) {
      const positions = [];
      const debugPoints = this.world.navGrid.debugPoints ?? [];
      debugPoints.forEach((point) => {
        positions.push(point.x, this.groundHeightAt(point) + 0.08, point.z);
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: '#57f2ff',
        size: 0.08,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        depthTest: false
      });
      this.navDebugGrid = new THREE.Points(geometry, material);
      this.navDebugGrid.name = 'NavDebugGrid';
      this.navDebugGrid.renderOrder = 1001;
      this.navDebugGroup.add(this.navDebugGrid);
    }
  }

  updateNavDebug(dt = 0) {
    if (!this.navDebugEnabled || !this.navDebugGroup) return;
    this.ensureNavDebugGrid();
    this.navDebugTimer -= dt;
    if (this.navDebugTimer > 0) return;
    this.navDebugTimer = 0.12;
    clearObjectChildren(this.navDebugRouteGroup);

    const units = this.selectedUnits.filter((unit) => unit.alive);
    units.forEach((unit, index) => {
      const color = index === 0 ? '#fff36a' : '#9cfffb';
      const route = Array.isArray(unit.route) ? unit.route : [];
      if (route.length) {
        const points = [
          this.navDebugSurfacePoint(unit.position),
          ...route.map((point) => this.navDebugSurfacePoint(point))
        ];
        this.navDebugRouteGroup.add(createDebugLine(points, color, 0.88));
      }
      if (unit.navMoveTarget) {
        this.navDebugRouteGroup.add(createDebugMarker(
          this.navDebugSurfacePoint(unit.navMoveTarget),
          '#ff5d5d',
          0.18
        ));
      }
      if (unit.navSteeringTarget) {
        const steeringTarget = this.navDebugSurfacePoint(unit.navSteeringTarget);
        this.navDebugRouteGroup.add(createDebugMarker(steeringTarget, '#ffffff', 0.13));
        this.navDebugRouteGroup.add(createDebugLine(
          [this.navDebugSurfacePoint(unit.position), steeringTarget],
          '#ffffff',
          0.72
        ));
      }
    });
  }

  navDebugSurfacePoint(point) {
    const surfacePoint = point.clone?.() ?? new THREE.Vector3(point.x, 0, point.z);
    surfacePoint.y = this.groundHeightAt(surfacePoint);
    return surfacePoint;
  }

  disposeNavDebug() {
    if (!this.navDebugGroup) return;
    this.scene.remove(this.navDebugGroup);
    clearObjectChildren(this.navDebugGroup);
    disposeObject3D(this.navDebugGroup);
    this.navDebugGroup = null;
    this.navDebugRouteGroup = null;
    this.navDebugGrid = null;
    this.navDebugMesh = null;
  }

  updateUnitVisuals(dt) {
    [...this.friendlyUnits, ...this.enemyUnits].forEach((unit) => {
      this.placeUnitOnGround(unit, dt);
      unit.updateVisual(this.camera, dt);
      this.updateUnitStatusElement(unit);
    });
    this.updateStructureStatusElement(this.playerBase, dt);
    this.updateStructureStatusElement(this.enemyCamp, dt);
  }

  attachUnitStatus(unit) {
    if (unit.statusElement && !unit.statusElement.parentElement) {
      this.worldUi.append(unit.statusElement);
    }
  }

  updateUnitStatusElement(unit) {
    const element = unit.statusElement;
    if (!element) return;
    const screen = this.projectWorldUi(unit.position, unitStatusHeight(unit));
    element.hidden = !unit.alive || !screen.visible;
    if (element.hidden) return;
    element.style.transform = `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -100%)`;
  }

  updateStructureStatusElement(structure, dt = 0) {
    const element = structure.statusElement;
    if (!element?.parts) return;
    const hpRatio = clamp(structure.health / structure.maxHealth, 0, 1);
    updateStructureHealthLag(structure, hpRatio, dt);
    element.parts.hp.style.transform = `scaleX(${hpRatio})`;
    element.parts.healthLoss.style.transform = `scaleX(${structure.healthLagRatio})`;
    element.parts.healthLoss.hidden = structure.healthLagRatio <= hpRatio + 0.006;
    const screen = this.projectWorldUi(structure.position, structure.statusHeight ?? 2.8);
    element.hidden = !structure.alive || !screen.visible;
    if (element.hidden) return;
    element.style.transform = `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -100%)`;
  }

  updateHud(dt = 0) {
    this.hudUpdateTimer -= dt;
    if (this.hudUpdateTimer > 0) return;
    this.hudUpdateTimer = 0.1;

    const baseRatio = Math.round(
      (this.playerBase.health / this.playerBase.maxHealth) * 100
    );
    this.dom.baseHealth.textContent = `${baseRatio}%`;
    this.dom.waveLabel.textContent = String(this.wave);
    this.dom.unitCount.textContent = String(this.friendlyUnits.length);
    if (this.selectedUnits.length > 1) {
      const totalHealth = Math.round(
        this.selectedUnits.reduce((sum, unit) => sum + unit.health, 0)
      );
      const types = countBy(this.selectedUnits, (unit) => unit.name);
      this.dom.selectedName.textContent = `已选中 ${this.selectedUnits.length} 个单位`;
      this.dom.selectedStats.textContent = `总 HP ${totalHealth} / ${formatCounts(types)}`;
      this.dom.selectedEnchants.textContent = '右键地面移动，遇敌自动战斗';
    } else if (this.selectedUnit) {
      const unit = this.selectedUnit;
      const hp = Math.round(unit.health);
      const shield = Math.round(unit.shield);
      const durability = Math.round(unit.weapon.durability);
      const maxDurability = Math.round(unit.weapon.maxDurability);
      const enchantments = formatEnchantmentList(unit);
      this.dom.selectedName.textContent = `${unit.name} #${unit.id}`;
      this.dom.selectedStats.textContent = `HP ${hp}/${unit.maxHealth} / 护盾 ${shield}/${unit.maxShield} / ${unit.weapon.name} ${durability}/${maxDurability}`;
      this.dom.selectedEnchants.textContent = `附魔 ${enchantments || '-'}`;
    } else {
      this.dom.selectedName.textContent = '未选中';
      this.dom.selectedStats.textContent = 'HP - / 武器 -';
      this.dom.selectedEnchants.textContent = '附魔 -';
    }
    if (this.perfDebugEnabled && this.dom.debug) {
      this.dom.debug.hidden = false;
      this.dom.debug.textContent = JSON.stringify(this.perfDebugSnapshot());
    } else if (this.dom.debug && !this.dom.debug.hidden) {
      this.dom.debug.textContent = JSON.stringify(this.snapshot());
    }
  }

  perfDebugSnapshot() {
    return {
      level: this.levelSession.level.id,
      sceneKey: this.world.config?.sceneKey ?? this.worldConfig.sceneKey,
      elapsedTime: Number(this.elapsedTime.toFixed(1)),
      wave: this.wave,
      counts: this.createPerfCounters(),
      perf: this.perfTracker?.snapshot() ?? null
    };
  }

  snapshot() {
    return {
      level: this.levelSession.level.id,
      difficulty: this.levelSession.difficulty,
      sceneKey: this.world.config?.sceneKey ?? this.worldConfig.sceneKey,
      elapsedTime: Number(this.elapsedTime.toFixed(1)),
      friendly: this.friendlyUnits.length,
      enemies: this.enemyUnits.length,
      wave: this.wave,
      baseHealth: Math.round(this.playerBase.health),
      enemyCampHealth: Math.round(this.enemyCamp.health),
      selectedCount: this.selectedUnits.length,
      selectedIds: this.selectedUnits.map((unit) => unit.id),
      altars: this.altars.snapshot(),
      enemyCommander: this.enemyCommander?.snapshot?.() ?? null,
      camera: {
        targetX: Number(this.cameraTarget.x.toFixed(2)),
        targetZ: Number(this.cameraTarget.z.toFixed(2)),
        distance: Number(this.cameraDistance.toFixed(2))
      },
      selected: this.selectedUnit
        ? {
            id: this.selectedUnit.id,
            type: this.selectedUnit.type,
            x: Number(this.selectedUnit.position.x.toFixed(2)),
            y: Number(this.selectedUnit.position.y.toFixed(2)),
            z: Number(this.selectedUnit.position.z.toFixed(2)),
            hp: Math.round(this.selectedUnit.health),
            weapon: Math.round(this.selectedUnit.weapon.durability),
            enchantments: [...this.selectedUnit.enchantments.keys()],
            commandMoveGoal: this.selectedUnit.commandMoveGoal
              ? {
                  x: Number(this.selectedUnit.commandMoveGoal.x.toFixed(2)),
                  y: Number(this.selectedUnit.commandMoveGoal.y.toFixed(2)),
                  z: Number(this.selectedUnit.commandMoveGoal.z.toFixed(2))
                }
              : null,
            screen: this.worldToScreen(this.selectedUnit.position)
          }
        : null,
      friendlySample: this.friendlyUnits.slice(0, 4).map((unit) => ({
        id: unit.id,
        type: unit.type,
        x: Number(unit.position.x.toFixed(2)),
        y: Number(unit.position.y.toFixed(2)),
        z: Number(unit.position.z.toFixed(2)),
        hp: Math.round(unit.health),
        screen: this.worldToScreen(unit.position)
      })),
      enemySample: this.enemyUnits.slice(0, 8).map((enemy) => ({
        id: enemy.id,
        type: enemy.type,
        x: Number(enemy.position.x.toFixed(2)),
        y: Number(enemy.position.y.toFixed(2)),
        z: Number(enemy.position.z.toFixed(2)),
        hp: Math.round(enemy.health),
        screen: this.worldToScreen(enemy.position)
      })),
      goblinSample: this.enemyUnits
        .filter((enemy) => enemy.type === 'goblinSoldier' || enemy.type === 'goblinArcher')
        .slice(0, 8)
        .map((enemy) => ({
          id: enemy.id,
          x: Number(enemy.position.x.toFixed(2)),
          y: Number(enemy.position.y.toFixed(2)),
          z: Number(enemy.position.z.toFixed(2)),
          moveGoal: enemy.moveGoal
            ? {
                x: Number(enemy.moveGoal.x.toFixed(2)),
                y: Number(enemy.moveGoal.y.toFixed(2)),
                z: Number(enemy.moveGoal.z.toFixed(2))
              }
            : null
        })),
      lastCardPlayed: this.lastCardPlayed,
      pixels: this.samplePixels()
    };
  }

  worldToScreen(position) {
    const projected = position.clone();
    projected.y += 1;
    projected.project(this.camera);
    return {
      x: Math.round((projected.x * 0.5 + 0.5) * window.innerWidth),
      y: Math.round((-projected.y * 0.5 + 0.5) * window.innerHeight)
    };
  }

  projectWorldUi(position, height = 1) {
    const projected = position.clone();
    projected.y += height;
    projected.project(this.camera);
    const x = Math.round((projected.x * 0.5 + 0.5) * window.innerWidth);
    const y = Math.round((-projected.y * 0.5 + 0.5) * window.innerHeight);
    const margin = 120;
    return {
      x,
      y,
      visible: (
        projected.z >= -1 &&
        projected.z <= 1 &&
        x >= -margin &&
        x <= window.innerWidth + margin &&
        y >= -margin &&
        y <= window.innerHeight + margin
      )
    };
  }

  samplePixels() {
    const gl = this.renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const points = [
      [Math.floor(width * 0.5), Math.floor(height * 0.5)],
      [Math.floor(width * 0.25), Math.floor(height * 0.55)],
      [Math.floor(width * 0.72), Math.floor(height * 0.4)]
    ];
    return points.map(([x, y]) => {
      const pixel = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return [...pixel];
    });
  }
}

function normalizeLevelSession(session) {
  const fallbackLevel = LEVEL_DEFINITIONS[0] ?? {
    id: 'debug',
    name: '调试关卡',
    baseReward: 0,
    targetTime: 180
  };
  const fallbackDeck = CARD_DEFINITIONS
    .filter((card) => !card.lootOnly)
    .slice(0, 5)
    .map((card, index) => ({
      ...card,
      level: 1,
      instanceId: `debug-${card.id}-${index}`
    }));
  const level = session?.level ?? fallbackLevel;
  return {
    level,
    difficulty: Math.max(1, Math.floor(session?.difficulty ?? 1)),
    deck: session?.deck?.length ? session.deck : fallbackDeck,
    startedAt: session?.startedAt ?? Date.now()
  };
}

function createSelectionBoxElement() {
  const element = document.createElement('div');
  element.className = 'selection-box';
  element.hidden = true;
  document.body.appendChild(element);
  return element;
}

function isGameUiTarget(target) {
  return Boolean(target?.closest?.('.hud, .card, .energy-panel, .card-pile-dock, .pile-viewer, .loot-confirm, .drag-ghost'));
}

function isTextInputTarget(target) {
  if (!target) return false;
  const tagName = target.tagName?.toLowerCase();
  return tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable;
}

function commandFormationOffset(index, total, radius) {
  if (total <= 1) return new THREE.Vector3();
  if (index === 0) return new THREE.Vector3();
  const ringIndex = index - 1;
  const angle = (ringIndex / Math.max(1, total - 1)) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
}

function enemyEnchantmentLevel(wave, difficulty) {
  return 1 + Math.floor((Math.max(1, difficulty) - 1) / 2) + Math.floor((Math.max(1, wave) - 1) / 4);
}

function selectEnemyFromPool(pool, wave, index, difficulty) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const candidates = pool.filter((entry) => (
    wave >= (entry.minWave ?? 1) &&
    difficulty >= (entry.minDifficulty ?? 1)
  ));
  if (!candidates.length) return pool[0]?.type ?? null;

  const totalWeight = candidates.reduce((sum, entry) => sum + Math.max(1, entry.weight ?? 1), 0);
  let roll = stableEnemyRoll(wave, index, difficulty) % totalWeight;
  for (const entry of candidates) {
    roll -= Math.max(1, entry.weight ?? 1);
    if (roll < 0) return entry.type;
  }
  return candidates[candidates.length - 1].type;
}

function stableEnemyRoll(wave, index, difficulty) {
  return Math.abs(
    (wave * 73856093) ^
    (index * 19349663) ^
    (difficulty * 83492791)
  );
}

function flatDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function routeRepathCooldown(unit, baseDelay) {
  const id = Number.isFinite(unit?.id) ? unit.id : 0;
  const jitter = ((id * 37) % 100) / 100 * ROUTE_REPATH_JITTER;
  return Math.max(0, baseDelay) + jitter;
}

function nextEnemyWaveDelay(wave) {
  return Math.max(
    MIN_ENEMY_WAVE_DELAY,
    EARLY_ENEMY_WAVE_DELAY - wave * ENEMY_WAVE_DELAY_DECAY
  );
}

function steeringFromRoute(position, targetPosition, route, {
  desiredDistance = 0.22,
  startsOnNavigation = true
} = {}) {
  if (!Array.isArray(route) || route.length === 0) return null;
  if (flatDistance(position, targetPosition) <= desiredDistance) return null;

  const lookaheadDistance = startsOnNavigation
    ? ROUTE_STEERING_LOOKAHEAD_DISTANCE
    : ROUTE_RECOVERY_LOOKAHEAD_DISTANCE;
  const debugTarget = routeLookaheadPoint(position, route, lookaheadDistance);
  if (!debugTarget) return null;

  const dx = debugTarget.x - position.x;
  const dz = debugTarget.z - position.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return null;

  return {
    direction: new THREE.Vector3(dx / length, 0, dz / length),
    debugTarget
  };
}

function routeLookaheadPoint(position, route, lookaheadDistance) {
  let anchor = position;
  let remaining = Math.max(0.05, lookaheadDistance);
  let last = null;

  for (const point of route) {
    const distance = flatDistance(anchor, point);
    if (distance < 0.001) {
      anchor = point;
      last = point;
      continue;
    }

    if (distance >= remaining) {
      const t = remaining / distance;
      return new THREE.Vector3(
        anchor.x + (point.x - anchor.x) * t,
        0,
        anchor.z + (point.z - anchor.z) * t
      );
    }

    remaining -= distance;
    anchor = point;
    last = point;
  }

  return last?.clone?.() ?? null;
}

function initialNavDebugEnabled() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('navdebug')) return params.get('navdebug') !== '0';
    return false;
  } catch {
    return false;
  }
}

function initialPerfDebugEnabled() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('perfdebug')) return params.get('perfdebug') !== '0';
    return false;
  } catch {
    return false;
  }
}

class PerfTracker {
  constructor() {
    this.interval = 1;
    this.lastSnapshot = null;
    this.resetWindow();
  }

  resetWindow() {
    this.elapsed = 0;
    this.frames = 0;
    this.sections = new Map();
    this.nav = {
      findPath: 0,
      pathDistance: 0,
      hasLine: 0,
      nearestWalkableCell: 0,
      expandedCells: 0
    };
    this.counts = null;
    this.frameStartedAt = 0;
  }

  beginFrame(dt) {
    this.elapsed += dt;
    this.frames += 1;
    this.frameStartedAt = performance.now();
  }

  add(name, ms) {
    const stat = this.sections.get(name) ?? {
      total: 0,
      max: 0,
      count: 0
    };
    stat.total += ms;
    stat.max = Math.max(stat.max, ms);
    stat.count += 1;
    this.sections.set(name, stat);
  }

  endFrame(counters = {}) {
    if (this.frameStartedAt > 0) {
      this.add('frame', performance.now() - this.frameStartedAt);
      this.frameStartedAt = 0;
    }
    if (counters.nav) {
      Object.keys(this.nav).forEach((key) => {
        this.nav[key] += counters.nav[key] ?? 0;
      });
    }
    this.counts = {
      ...counters,
      nav: undefined
    };
    if (this.elapsed < this.interval) return;

    this.lastSnapshot = {
      fps: roundPerf(this.frames / Math.max(0.001, this.elapsed)),
      seconds: roundPerf(this.elapsed),
      sections: this.sectionSnapshot(),
      counts: {
        ...this.counts,
        nav: this.navSnapshot()
      }
    };
    this.resetWindow();
  }

  sectionSnapshot() {
    const sections = {};
    this.sections.forEach((stat, name) => {
      sections[name] = {
        avgMs: roundPerf(stat.total / Math.max(1, stat.count)),
        maxMs: roundPerf(stat.max)
      };
    });
    return sections;
  }

  navSnapshot() {
    const perSecond = 1 / Math.max(0.001, this.elapsed);
    return {
      findPath: this.nav.findPath,
      pathDistance: this.nav.pathDistance,
      hasLine: this.nav.hasLine,
      nearestWalkableCell: this.nav.nearestWalkableCell,
      expandedCells: this.nav.expandedCells,
      findPathPerSecond: roundPerf(this.nav.findPath * perSecond),
      hasLinePerSecond: roundPerf(this.nav.hasLine * perSecond),
      expandedCellsPerSecond: roundPerf(this.nav.expandedCells * perSecond)
    };
  }

  snapshot() {
    return this.lastSnapshot ?? {
      warmingUp: true
    };
  }
}

function roundPerf(value) {
  return Number(value.toFixed(2));
}

function createDebugLine(points, color, opacity = 0.8) {
  const positions = [];
  points.forEach((point) => {
    positions.push(point.x, (point.y ?? 0) + 0.18, point.z);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false
    });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 1002;
  return line;
}

function createDebugMarker(point, color, radius = 0.14) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 8, 6),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      depthTest: false
    })
  );
  marker.position.set(point.x, (point.y ?? 0) + 0.32, point.z);
  marker.renderOrder = 1003;
  return marker;
}

function createNavDebugMesh(debugLines, heightAt) {
  if (!debugLines?.positions?.length) return null;
  const positions = new Float32Array(debugLines.positions.length);
  for (let i = 0; i < debugLines.positions.length; i += 3) {
    const x = debugLines.positions[i];
    const y = debugLines.positions[i + 1];
    const z = debugLines.positions[i + 2];
    positions[i] = x;
    positions[i + 1] = (Number.isFinite(y) ? y : heightAt({ x, z })) + 0.16;
    positions[i + 2] = z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: '#8ffff3',
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      depthTest: false
    })
  );
  lines.name = 'NavDebugMesh';
  lines.renderOrder = 1000;
  return lines;
}

function clearObjectChildren(object) {
  if (!object) return;
  [...object.children].forEach((child) => {
    object.remove(child);
    disposeObject3D(child);
  });
}

function disposeObject3D(object) {
  object.traverse?.((node) => {
    node.geometry?.dispose?.();
    const material = node.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item?.dispose?.());
    } else {
      material?.dispose?.();
    }
  });
}

function countBy(items, selector) {
  const counts = new Map();
  items.forEach((item) => {
    const key = selector(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

function formatCounts(counts) {
  return [...counts.entries()].map(([name, count]) => `${name} x${count}`).join('、');
}

function formatEnchantmentList(unit) {
  return [...unit.enchantments.values()]
    .filter((enchantment) => !enchantment.hidden)
    .map((enchantment) => (
      `${enchantment.name}${Math.max(1, Math.floor(enchantment.level ?? 1))}`
    ))
    .join('、');
}

function ensureWorldUiElement() {
  let element = document.querySelector('#world-ui');
  if (element) return element;
  element = document.createElement('div');
  element.id = 'world-ui';
  element.className = 'world-ui';
  element.setAttribute('aria-hidden', 'true');
  document.querySelector('#app')?.appendChild(element);
  return element;
}

function createStructureStatusElement(team) {
  const element = document.createElement('div');
  element.className = `world-status is-structure ${team === 'enemy' ? 'is-enemy-structure' : 'is-friendly-structure'}`;
  element.innerHTML = `
    <div class="world-health-bar">
      <span class="world-health-loss-fill"></span>
      <span class="world-health-fill"></span>
      <span class="world-health-ticks"></span>
    </div>
  `;
  element.hidden = true;
  element.parts = {
    hp: element.querySelector('.world-health-fill'),
    healthLoss: element.querySelector('.world-health-loss-fill')
  };
  return element;
}

function unitStatusHeight(unit) {
  if (unit.type === 'goblinTroll') return 2.35;
  if (unit.type === 'ogre') return 2.65;
  if (unit.type === 'wizard') return 1.85;
  if (unit.type === 'skeletonArcher') return 2.02;
  if (unit.type === 'skeletonSoldier') return 2.05;
  if (unit.type === 'scorpion') return 1.28;
  if (unit.type === 'bear') return 1.9;
  if (unit.type === 'wolf') return 1.25;
  return 2.25;
}

function createStructureState({ id, position, projectileHitHeight, attributes }) {
  const structure = {
    id,
    kind: 'structure',
    position,
    projectileHitHeight,
    attributes: new AttributeSet(attributes),
    alive: true,
    healthLagRatio: 1,
    healthLagDelay: 0
  };
  [
    'maxHealth',
    'recoveryRadius',
    'healthPerSecond',
    'durabilityPerSecond',
    'collisionRadius',
    'attackRadius'
  ].forEach((attribute) => bindAttributeGetter(structure, attribute, attribute));
  structure.health = structure.maxHealth;
  return structure;
}

function registerStructureHealthLoss(structure, previousHealth) {
  if (!structure || structure.health >= previousHealth) return;
  const previousRatio = clamp(previousHealth / structure.maxHealth, 0, 1);
  structure.healthLagRatio = Math.max(structure.healthLagRatio ?? previousRatio, previousRatio);
  structure.healthLagDelay = 0.4;
}

function updateStructureHealthLag(structure, hpRatio, dt) {
  structure.healthLagRatio = Math.max(structure.healthLagRatio ?? hpRatio, hpRatio);
  structure.healthLagDelay = Math.max(0, (structure.healthLagDelay ?? 0) - dt);
  if (structure.healthLagDelay > 0) return;
  if (structure.healthLagRatio <= hpRatio) {
    structure.healthLagRatio = hpRatio;
    return;
  }
  structure.healthLagRatio = Math.max(
    hpRatio,
    structure.healthLagRatio - 3.8 * Math.max(0, dt)
  );
}

function setupStructureBody(structure, model, { collisionRadius, attackRadius }) {
  structure.model = model;
  structure.modelBasePosition = model.position.clone();
  structure.attributes.setBase('collisionRadius', collisionRadius);
  structure.attributes.setBase('attackRadius', attackRadius);
  structure.shakeTime = 0;
  structure.shakeDuration = 0;
  structure.shakeStrength = 0;
}
