import * as THREE from 'three';
import { createAttackRangeRing, createGuardFlag, createSelectionRing } from '../art/lowpoly.js';
import { BALANCE, CARD_DEFINITIONS, LEVEL_DEFINITIONS, TEAMS, UNIT_DEFINITIONS } from '../data/gameData.js';
import { UnitEntity } from '../entities/UnitEntity.js';
import { prewarmUnitModelTemplates } from '../art/visualRegistry.js';
import { createWorld } from '../world/createWorld.js';
import { BuffSystem } from './BuffSystem.js';
import { BuildingSystem } from './BuildingSystem.js';
import { CardEffectSystem } from './CardEffectSystem.js';
import { CardSystem } from './CardSystem.js';
import { CombatSystem } from './CombatSystem.js';
import { AttackSystem } from './AttackSystem.js';
import { EffectsSystem } from './EffectsSystem.js';
import { AltarSystem } from './AltarSystem.js';
import { EnemyCommanderSystem } from './EnemyCommanderSystem.js';
import { LevelMechanicSystem } from './LevelMechanicSystem.js';
import { LootDropSystem } from './LootDropSystem.js';
import { AttributeSet, bindAttributeGetter } from './AttributeSet.js';
import { AreaEffectSystem } from './AreaEffectSystem.js';
import { AbilitySystem } from './AbilitySystem.js';
import { ModifierSystem } from './ModifierSystem.js';
import { RecoverySystem } from './RecoverySystem.js';
import { SpellSystem } from './SpellSystem.js';
import { MovementSystem } from './MovementSystem.js';
import { PathfindingSystem } from './PathfindingSystem.js';
import { TargetingSystem } from './TargetingSystem.js';
import { UnitLogicSystem } from './UnitLogicSystem.js';
import { UnitRegistry } from './UnitRegistry.js';
import { clamp, polarOffset } from '../utils/math.js';

const ROUTE_REPATH_DISTANCE = 1.15;
const ROUTE_REJOIN_DISTANCE = 2.2;
const ROUTE_WAYPOINT_RADIUS = 0.38;
const ROUTE_REPATH_COOLDOWN = 1.35;
const ROUTE_BLOCKED_REPATH_COOLDOWN = 1.2;
const ROUTE_FAILED_REPATH_COOLDOWN = 2.4;
const ROUTE_DEFERRED_REPATH_COOLDOWN = 0.22;
const ROUTE_REPATH_JITTER = 0.9;
const ROUTE_SEARCHES_PER_FRAME = 1;
const ROUTE_MAX_SEARCH_CELLS = 6500;
const ROUTE_WORKER_MAX_PENDING = 64;
const ROUTE_WORKER_MAX_SEARCH_CELLS = 20000;
const ROUTE_STEERING_LOOKAHEAD_DISTANCE = 1.6;
const ROUTE_RECOVERY_LOOKAHEAD_DISTANCE = 0.55;
const NAV_LINE_RECHECK_DISTANCE = 1.15;
const OFF_ROUTE_RECHECK_COOLDOWN = 0.32;
const NAV_STEERING_CACHE_SECONDS = 0.14;
const NAV_STEERING_CACHE_POSITION_DISTANCE = 0.72;
const NAV_STEERING_CACHE_TARGET_DISTANCE = 0.95;
const UNIT_GRAVITY = 28;
const UNIT_MAX_FALL_SPEED = 18;
const UNIT_CLIMB_SPEED = 3.4;
const UNIT_MAX_SMOOTH_CLIMB_HEIGHT = 0.58;
const UNIT_GROUND_EPSILON = 0.006;
const MAX_ACTIVE_WAVE_SPAWNS = 4;
const INITIAL_ATTACK_WAVE_DELAY = 18;
const EARLY_ENEMY_WAVE_DELAY = 24;
const SUMMON_DEPLOY_RADIUS = 7.5;
const BEACON_PLACEMENT_RADIUS = 5.5;
const SPIDER_FIRST_EGG_SECONDS = 37;
const SPIDER_EGG_INTERVAL_SECONDS = 60;
const SPIDER_EGG_HATCH_SECONDS = 15;
const TOUCH_TAP_THRESHOLD = 7;
const MOBILE_DOUBLE_TAP_MS = 360;
const MOBILE_DOUBLE_TAP_DISTANCE = 38;
const PERF_HISTORY_LIMIT = 120;
const PERF_CHART_UPDATE_INTERVAL = 0.25;
const PERF_TOP_SECTION_LIMIT = 9;
const PERF_COMBAT_DETAIL_LIMIT = 14;
const PERF_LABELS = {
  abilities: '能力',
  altars: '祭坛',
  areaEffects: '范围效果',
  buildings: '建筑',
  camera: '相机',
  card: '卡牌',
  combat: '战斗',
  effects: '特效',
  enemyCommander: '敌方指挥',
  frame: '整帧',
  guardVisuals: '驻守标记',
  hud: 'HUD',
  loot: '掉落',
  mechanics: '关卡机制',
  navDebug: '寻路显示',
  recovery: '恢复',
  render: '渲染',
  selection: '选择',
  spiders: '蜘蛛生命周期',
  structure: '基地/营地反馈',
  unitVisuals: '单位视觉',
  waveSpawn: '刷怪/生成',
  world: '世界'
};
const COMBAT_PROFILE_LABELS = {
  activeAttackMs: '当前攻击查询',
  attackDecisionMs: '攻击/追击决策',
  attackIndexMs: '攻击索引',
  commandMs: '指令移动',
  guardMs: '驻守状态',
  immobileMs: '静止单位',
  motionMs: '最终位移',
  supportMs: '支援能力',
  targetIndexMs: '索敌索引',
  targetDecisionMs: '目标决策',
  unitBookkeepingMs: '单位基础状态',
  buffsMs: 'Buff 更新',
  cleanupMs: '清理死亡',
  collectMs: '收集单位',
  pendingMs: '攻击队列',
  projectilesMs: '投射物',
  projectileFlightMs: '投射物飞行',
  projectileMoveApplyMs: '投射物位移',
  projectileQueryMs: '投射物查询',
  projectileHitMs: '投射物命中',
  projectileRecycleMs: '投射物回收',
  separationMs: '单位分离',
  steeringMs: '移动/寻路',
  targetingMs: '寻敌',
  unitsMs: '单位循环总计'
};
const DESKTOP_RENDER_PIXEL_RATIO = 1.5;
const MOBILE_RENDER_PIXEL_RATIO = 1;
const ENABLE_REALTIME_SHADOWS = true;
const DEFAULT_FPS_LIMIT = 60;
const MIN_FPS_LIMIT = 30;
const MAX_FPS_LIMIT = 90;
const DEFAULT_DPR = 1;
const MIN_DPR = 1;
const MAX_DPR = 2;
const SETTINGS_STORAGE_KEY = 'village-war-render-settings-v1';

export class Game {
  constructor({ canvas, session = null, onLevelComplete = null, onRestart = null, onExitToMenu = null } = {}) {
    this.canvas = canvas;
    this.levelSession = normalizeLevelSession(session);
    this.onLevelComplete = onLevelComplete;
    this.onRestart = onRestart;
    this.onExitToMenu = onExitToMenu;
    this.elapsedTime = 0;
    this.levelFinished = false;
    this.paused = false;
    this.destroyed = false;
    this.eventController = new AbortController();
    this.renderSettings = loadRenderSettings();
    this.renderQuality = createRenderQualityProfile(this.renderSettings);
    this.frameLimitMs = 1000 / this.renderSettings.fpsLimit;
    this.lastAnimationFrameTime = null;
    this.worldConfig = this.levelSession.level.world ?? BALANCE.world;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 240);
    this.camera.position.set(0, 34, 47.2);
    this.camera.lookAt(0, 4, 10);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.renderQuality.antialias,
      alpha: false,
      preserveDrawingBuffer: false
    });
    this.renderer.setPixelRatio(this.renderQuality.pixelRatio);
    this.renderer.shadowMap.enabled = ENABLE_REALTIME_SHADOWS;
    this.renderer.shadowMap.autoUpdate = ENABLE_REALTIME_SHADOWS;
    if (ENABLE_REALTIME_SHADOWS) {
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.worldUi = ensureWorldUiElement();
    this.cameraTarget = new THREE.Vector3(0, 4, 18);
    this.cameraOffsetDirection = new THREE.Vector3(0, 30, 37.2).normalize();
    this.cameraDistance = 28.7;
    this.worldUiProjection = new THREE.Vector3();
    this.cameraMinDistance = 12;
    this.cameraMaxDistance = 78;
    this.pointerScreen = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5);
    this.edgePanActive = false;
    this.cameraDrag = null;
    this.lastMobileTap = null;
    this.updateCamera(0);

    this.clock = new THREE.Clock();
    this.unitRegistry = new UnitRegistry(this);
    this.friendlyUnits = this.unitRegistry.friendlyUnits;
    this.enemyUnits = this.unitRegistry.enemyUnits;
    this.score = 0;
    this.wave = 1;
    this.waveTimer = INITIAL_ATTACK_WAVE_DELAY;
    this.lastCardPlayed = null;
    this.selectedUnit = null;
    this.selectedUnits = [];
    this.selectedUnitIds = new Set();
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
    this.perfJsonEnabled = initialPerfJsonEnabled();
    this.perfTracker = this.perfDebugEnabled ? new PerfTracker() : null;
    this.perfHistory = [];
    this.lastPerfSampleId = 0;
    this.perfChartUpdateTimer = 0;
    this.perfChartVisible = this.perfDebugEnabled;
    this.fpsMeterFrames = 0;
    this.fpsMeterElapsed = 0;
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
    this.routeSearchBudget = ROUTE_SEARCHES_PER_FRAME;
    this.pathWorker = null;
    this.pathWorkerReady = false;
    this.pathWorkerError = null;
    this.nextPathRequestId = 1;
    this.pendingPathRequests = new Map();
    this.workerPathStats = createEmptyWorkerPathStats();
    this.setupPathfindingWorker();
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
    this.movement = new MovementSystem(this);
    this.pathfinding = new PathfindingSystem(this);
    this.targeting = new TargetingSystem(this);
    this.buildings = new BuildingSystem(this);
    this.combat = new CombatSystem(this);
    this.attacks = new AttackSystem(this);
    this.unitLogic = new UnitLogicSystem(this);
    this.spells = new SpellSystem(this);
    this.cardEffects = new CardEffectSystem(this);
    this.recovery = new RecoverySystem(this);
    this.cardSystem = new CardSystem(this, {
      deck: this.levelSession.deck
    });
    this.abilities = new AbilitySystem(this);
    this.lootDrops = new LootDropSystem(this);
    this.altars = new AltarSystem(this, this.world.config?.altars ?? this.worldConfig.altars);
    this.enemyCommander = new EnemyCommanderSystem(this);
    this.levelMechanics = new LevelMechanicSystem(this);
    this.selectionBox = createSelectionBoxElement();

    this.dom = {
      baseHealth: document.querySelector('#base-health'),
      waveLabel: document.querySelector('#wave-label'),
      battleTime: document.querySelector('#battle-time'),
      unitCount: document.querySelector('#unit-count'),
      selectedName: document.querySelector('#selected-name'),
      selectedStats: document.querySelector('#selected-stats'),
      selectedEnchants: document.querySelector('#selected-enchants'),
      settingsButton: document.querySelector('#game-settings-button'),
      commandDock: document.querySelector('#game-command-dock'),
      pauseOverlay: document.querySelector('#pause-overlay'),
      pauseReason: document.querySelector('#pause-reason'),
      fpsMeter: document.querySelector('#fps-meter'),
      fpsLimitSlider: document.querySelector('#fps-limit-slider'),
      fpsLimitValue: document.querySelector('#fps-limit-value'),
      dprSlider: document.querySelector('#dpr-slider'),
      dprValue: document.querySelector('#dpr-value'),
      debug: document.querySelector('#debug-state'),
      perfPanel: document.querySelector('#perf-panel'),
      perfCanvas: document.querySelector('#perf-chart'),
      perfStatus: document.querySelector('#perf-panel-status'),
      perfStats: document.querySelector('#perf-stats')
    };
    if (this.dom.fpsMeter) this.dom.fpsMeter.hidden = false;
    this.syncSettingsControls();

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
    window.addEventListener('popstate', (event) => this.onReturnNavigation(event), { signal });
    this.dom.settingsButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setPaused(true, '设置');
    }, { signal });
    this.dom.commandDock?.addEventListener('click', (event) => this.onCommandDockClick(event), { signal });
    this.dom.commandDock?.addEventListener('pointerdown', stopUiEvent, { signal });
    this.dom.commandDock?.addEventListener('contextmenu', stopUiEvent, { signal });
    this.dom.pauseOverlay?.addEventListener('click', (event) => this.onPauseOverlayClick(event), { signal });
    this.dom.pauseOverlay?.addEventListener('pointerdown', stopUiEvent, { signal });
    this.dom.pauseOverlay?.addEventListener('contextmenu', stopUiEvent, { signal });
    this.dom.fpsLimitSlider?.addEventListener('input', (event) => this.onRenderSettingInput(event), { signal });
    this.dom.dprSlider?.addEventListener('input', (event) => this.onRenderSettingInput(event), { signal });
    this.dom.fpsLimitSlider?.addEventListener('pointerdown', stopUiPropagation, { signal });
    this.dom.dprSlider?.addEventListener('pointerdown', stopUiPropagation, { signal });
    this.resize();
    document.body.classList.add('is-game-active');
    if (this.dom.settingsButton) this.dom.settingsButton.hidden = false;
    this.armReturnNavigationTrap();
    prewarmUnitModelTemplates(unitModelPrewarmEntries());

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
    this.lastAnimationFrameTime = null;
    this.renderer.setAnimationLoop((time) => this.animationFrame(time));
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
    this.attacks?.destroy?.();
    this.combat?.destroy?.();
    this.effects?.destroy?.();
    this.pathWorker?.terminate?.();
    this.pathWorker = null;
    this.pendingPathRequests.clear();
    this.disposeNavDebug();
    this.renderer.dispose();
    this.selectionBox?.remove();
    document.body.classList.remove('is-game-active', 'is-game-paused');
    if (this.dom.settingsButton) this.dom.settingsButton.hidden = true;
    if (this.dom.fpsMeter) this.dom.fpsMeter.hidden = true;
    if (this.dom.pauseOverlay) this.dom.pauseOverlay.hidden = true;
    if (this.dom.perfPanel) this.dom.perfPanel.hidden = true;
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
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    this.updateFpsMeter(rawDt);
    if (this.paused) {
      this.updateCamera(0);
      this.updateHud(0);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const perf = this.perfTracker;
    if (perf) {
      perf.beginFrame(dt);
    }
    this.elapsedTime += dt;
    this.routeSearchBudget = ROUTE_SEARCHES_PER_FRAME;
    const updateWaveSpawn = () => {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0 && this.playerBase.health > 0 && this.enemyCamp.alive) {
        this.wave += 1;
        this.spawnEnemyWave(this.wave, { orders: 'attack' });
        this.waveTimer = nextEnemyWaveDelay(this.wave);
      }
    };
    if (perf) {
      this.measurePerf('waveSpawn', updateWaveSpawn);
      this.measurePerf('card', () => this.cardSystem.update(dt));
      this.measurePerf('abilities', () => this.abilities.update(dt));
      this.measurePerf('enemyCommander', () => this.enemyCommander.update(dt));
      this.measurePerf('spiders', () => this.updateSpiderLifecycle(dt));
      this.measurePerf('combat', () => this.unitLogic.update(dt));
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
      this.recordPerfSample();
      this.updatePerfPanel(dt);
    } else {
      updateWaveSpawn();
      this.cardSystem.update(dt);
      this.abilities.update(dt);
      this.enemyCommander.update(dt);
      this.updateSpiderLifecycle(dt);
      this.unitLogic.update(dt);
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

  animationFrame(time = performance.now()) {
    if (this.destroyed) return;
    if (this.shouldSkipFrame(time)) return;
    this.tick();
  }

  shouldSkipFrame(time) {
    if (this.lastAnimationFrameTime == null) {
      this.lastAnimationFrameTime = time;
      return false;
    }
    const elapsed = time - this.lastAnimationFrameTime;
    if (elapsed + 0.25 < this.frameLimitMs) return true;
    if (elapsed > this.frameLimitMs * 4) {
      this.lastAnimationFrameTime = time;
    } else {
      this.lastAnimationFrameTime += this.frameLimitMs;
    }
    return false;
  }

  updateFpsMeter(dt) {
    if (!this.dom.fpsMeter || dt <= 0) return;
    this.fpsMeterFrames += 1;
    this.fpsMeterElapsed += dt;
    if (this.fpsMeterElapsed < 0.5) return;
    const fps = Math.round(this.fpsMeterFrames / this.fpsMeterElapsed);
    this.dom.fpsMeter.textContent = `FPS ${fps}`;
    this.fpsMeterFrames = 0;
    this.fpsMeterElapsed = 0;
  }

  onRenderSettingInput(event) {
    const target = event.target;
    if (target === this.dom.fpsLimitSlider) {
      this.renderSettings.fpsLimit = clamp(
        Number(target.value) || DEFAULT_FPS_LIMIT,
        MIN_FPS_LIMIT,
        MAX_FPS_LIMIT
      );
      this.frameLimitMs = 1000 / this.renderSettings.fpsLimit;
      this.lastAnimationFrameTime = null;
    } else if (target === this.dom.dprSlider) {
      this.renderSettings.dpr = clamp(
        Number(target.value) || DEFAULT_DPR,
        MIN_DPR,
        MAX_DPR
      );
      this.renderQuality = createRenderQualityProfile(this.renderSettings);
      this.renderer.setPixelRatio(this.renderQuality.pixelRatio);
      this.resize();
    }
    saveRenderSettings(this.renderSettings);
    this.syncSettingsControls();
  }

  syncSettingsControls() {
    if (this.dom.fpsLimitSlider) {
      this.dom.fpsLimitSlider.value = String(this.renderSettings.fpsLimit);
    }
    if (this.dom.fpsLimitValue) {
      this.dom.fpsLimitValue.textContent = `${Math.round(this.renderSettings.fpsLimit)}`;
    }
    if (this.dom.dprSlider) {
      this.dom.dprSlider.value = String(this.renderSettings.dpr);
    }
    if (this.dom.dprValue) {
      this.dom.dprValue.textContent = this.renderSettings.dpr.toFixed(1);
    }
  }

  createPerfCounters({ takeNavStats = false } = {}) {
    const navGrid = this.world?.navGrid;
    const rendererInfo = this.renderer.info;
    const navStats = takeNavStats
      ? mergePathStats(navGrid?.takeStats?.() ?? null, this.takeWorkerPathStats())
      : mergePathStats(navGrid?.stats ? { ...navGrid.stats } : null, this.workerPathStats);
    return {
      friendly: this.friendlyUnits.length,
      enemies: this.enemyUnits.length,
      effects: this.effects?.effects?.length ?? 0,
      projectiles: this.attacks?.projectiles?.length ?? 0,
      pendingAttacks: this.attacks?.pendingAttacks?.length ?? 0,
      navDistanceCache: this.combat?.navDistanceCache?.size ?? 0,
      combatProfile: this.unitLogic?.lastProfile ?? this.combat?.lastProfile ?? null,
      sceneChildren: this.scene.children.length,
      rendererGeometries: rendererInfo?.memory?.geometries ?? 0,
      rendererTextures: rendererInfo?.memory?.textures ?? 0,
      renderCalls: rendererInfo?.render?.calls ?? 0,
      triangles: rendererInfo?.render?.triangles ?? 0,
      pathWorkerReady: this.pathWorkerReady ? 1 : 0,
      pendingPathRequests: this.pendingPathRequests?.size ?? 0,
      nav: navStats
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
    this.edgePanActive = false;
  }

  onGameContextMenu(event) {
    if (!event.target?.closest?.('#app')) return;
    event.preventDefault();
    event.stopPropagation();
  }

  registerUnit(unit) {
    return this.unitRegistry.register(unit);
  }

  handleUnitDeath(unit, source = null) {
    return this.unitRegistry.handleDeath(unit, source);
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
      this.registerUnit(unit);
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
    this.abilities?.applyNewBuildingDurability(unit);
    this.attachUnitStatus(unit);
    this.registerUnit(unit);
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
    return this.getBeaconPlacementAnchors().some((anchor) => (
      Math.hypot(point.x - anchor.position.x, point.z - anchor.position.z) <= anchor.radius
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

  getBeaconPlacementAnchors() {
    return this.friendlyUnits
      .filter((unit) => (
        unit.alive &&
        !unit.underConstruction &&
        !unit.isBuilding
      ))
      .map((unit) => ({
        position: unit.position,
        radius: BEACON_PLACEMENT_RADIUS
      }));
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
    const count = Math.min(
      MAX_ACTIVE_WAVE_SPAWNS,
      2 + Math.floor(wave * 0.72) + Math.floor((difficulty - 1) * 0.45)
    );
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
      this.applySpiderSpawnTraits(unit, wave, difficulty, i);
      this.initializeSpiderLifecycle(unit);
      this.attachUnitStatus(unit);
      this.registerUnit(unit);
      spawnedUnits.push(unit);
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

  applySpiderSpawnTraits(unit, wave, difficulty, seedIndex = 0) {
    if (unit.type !== 'spider') return;
    if (stableEnemyRoll(wave, seedIndex + unit.id * 17, difficulty) % 3 !== 0) return;
    this.buffs.applyBuff(unit, 'poison', unit, {
      level: enemyEnchantmentLevel(wave, difficulty),
      sourceUnitType: unit.type
    });
  }

  initializeSpiderLifecycle(unit) {
    if (unit.type !== 'spider') return;
    unit.spiderEggTimer = SPIDER_FIRST_EGG_SECONDS;
    unit.spiderEggCount = 0;
  }

  updateSpiderLifecycle(dt) {
    [...this.enemyUnits].forEach((unit) => {
      if (!unit.alive) return;
      if (unit.type === 'spider') {
        this.updateSpiderEggLaying(unit, dt);
      } else if (unit.type === 'spiderEgg') {
        this.updateSpiderEggHatching(unit, dt);
      }
    });
  }

  updateSpiderEggLaying(unit, dt) {
    unit.spiderEggTimer = (unit.spiderEggTimer ?? SPIDER_FIRST_EGG_SECONDS) - dt;
    if (unit.spiderEggTimer > 0) return;
    unit.spiderEggTimer += SPIDER_EGG_INTERVAL_SECONDS;
    if (unit.spiderEggTimer <= 0) {
      unit.spiderEggTimer = SPIDER_EGG_INTERVAL_SECONDS;
    }
    this.spawnSpiderEgg(unit);
  }

  spawnSpiderEgg(parent) {
    const position = this.spiderEggSpawnPoint(parent);
    if (!position) return;
    const egg = new UnitEntity({
      type: 'spiderEgg',
      team: TEAMS.ENEMY,
      position
    });
    egg.hatchTimer = SPIDER_EGG_HATCH_SECONDS;
    egg.parentSpiderId = parent.id;
    this.attachUnitStatus(egg);
    this.registerUnit(egg);
    this.effects.spawnRing(egg.position, '#b6d48d', 0.56, 0.45);
  }

  spiderEggSpawnPoint(parent) {
    const eggIndex = parent.spiderEggCount ?? 0;
    parent.spiderEggCount = eggIndex + 1;
    const baseAngle = parent.mesh.rotation.y + Math.PI + eggIndex * 1.618;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = baseAngle + attempt * 0.78;
      const radius = 0.58 + attempt * 0.08;
      const candidate = parent.position.clone();
      candidate.x += Math.sin(angle) * radius;
      candidate.z += Math.cos(angle) * radius;
      candidate.y = this.groundHeightAt(candidate);
      const resolved = this.resolveWalkablePoint(candidate, 0.08);
      if (this.isPointWalkable(resolved)) return resolved;
    }
    return null;
  }

  updateSpiderEggHatching(egg, dt) {
    egg.hatchTimer = (egg.hatchTimer ?? SPIDER_EGG_HATCH_SECONDS) - dt;
    if (egg.hatchTimer > 0) return;
    this.hatchSpiderEgg(egg);
  }

  hatchSpiderEgg(egg) {
    if (!egg.alive) return;
    const position = egg.position.clone();
    position.y = this.groundHeightAt(position);
    const wave = this.wave;
    const difficulty = this.effectiveDifficulty();
    this.removeEnemyUnitSilently(egg);

    const spider = new UnitEntity({
      type: 'spider',
      team: TEAMS.ENEMY,
      position
    });
    this.applyEnemyDifficulty(spider, wave, difficulty);
    this.initializeSpiderLifecycle(spider);
    this.attachUnitStatus(spider);
    this.registerUnit(spider);
    this.orderEnemyAttack(spider, 0, 1);
    this.effects.spawnRing(spider.position, '#78b85a', 0.72, 0.48);
  }

  removeEnemyUnitSilently(unit) {
    unit.alive = false;
    unit.isSilentRemoval = true;
    this.unitRegistry.unregister(unit);
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
      this.registerUnit(unit);
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

    if (!options.allowOffNavigation && this.world?.isWalkable && !this.world.isWalkable(point)) {
      return false;
    }

    return true;
  }

  isPointOnSafeSurface(point) {
    return this.world?.isSafeSurface?.(point) ?? true;
  }

  isPointOnNavigationSurface(point) {
    return this.world?.isWalkable?.(point) ?? true;
  }

  shouldUseNavigationPathing() {
    return true;
  }

  shouldUseWorkerPathing() {
    return this.pathWorkerReady;
  }

  setupPathfindingWorker() {
    const workerData = this.world?.navGrid?.toWorkerData?.();
    if (!workerData) return;
    try {
      this.pathWorker = new Worker(new URL('../workers/pathfindingWorker.js', import.meta.url), {
        type: 'module'
      });
      this.pathWorker.onmessage = (event) => this.handlePathWorkerMessage(event.data);
      this.pathWorker.onerror = (event) => {
        this.pathWorkerError = event?.message ?? 'path worker error';
        this.pathWorkerReady = false;
        this.pathWorker?.terminate?.();
        this.pathWorker = null;
        this.pendingPathRequests.clear();
      };
      this.pathWorker.postMessage({
        type: 'init',
        grid: workerData
      });
      this.pathWorkerReady = true;
    } catch (error) {
      this.pathWorkerError = error?.message ?? String(error);
      this.pathWorkerReady = false;
      this.pathWorker = null;
    }
  }

  handlePathWorkerMessage(message) {
    if (message?.type !== 'pathResult') return;
    const request = this.pendingPathRequests.get(message.id);
    if (!request) return;
    this.pendingPathRequests.delete(message.id);
    this.addWorkerPathStats(message.stats);

    const { unit } = request;
    if (!unit?.alive || unit.pendingRouteRequestId !== message.id) return;
    const target = message.target ?? request.target;
    unit.pendingRouteRequestId = null;
    unit.pendingRouteTarget = null;
    unit.route = (message.route ?? []).map((point) => new THREE.Vector3(point.x, 0, point.z));
    unit.routeIndex = 0;
    unit.routeTarget = new THREE.Vector3(target.x, 0, target.z);
    const cooldown = unit.route.length ? ROUTE_REPATH_COOLDOWN : ROUTE_FAILED_REPATH_COOLDOWN;
    unit.nextRouteRepathAt = this.elapsedTime + routeRepathCooldown(unit, cooldown);
  }

  addWorkerPathStats(stats = {}) {
    this.workerPathStats.findPath += stats.findPath ?? 0;
    this.workerPathStats.nearestWalkableCell += stats.nearestWalkableCell ?? 0;
    this.workerPathStats.hasLine += stats.hasLine ?? 0;
    this.workerPathStats.expandedCells += stats.expandedCells ?? 0;
  }

  takeWorkerPathStats() {
    const stats = { ...this.workerPathStats };
    this.workerPathStats = createEmptyWorkerPathStats();
    return stats;
  }

  requestWorkerRoute(unit, position, targetPosition) {
    if (!this.pathWorkerReady || !this.pathWorker || !unit) return false;
    if (this.pendingPathRequests.size >= ROUTE_WORKER_MAX_PENDING) {
      unit.nextRouteRepathAt = this.elapsedTime + routeRepathCooldown(unit, ROUTE_DEFERRED_REPATH_COOLDOWN);
      return true;
    }
    if (
      unit.pendingRouteRequestId &&
      unit.pendingRouteTarget &&
      flatDistance(unit.pendingRouteTarget, targetPosition) <= ROUTE_REPATH_DISTANCE
    ) {
      return true;
    }

    const id = this.nextPathRequestId;
    this.nextPathRequestId += 1;
    const target = new THREE.Vector3(targetPosition.x, 0, targetPosition.z);
    unit.pendingRouteRequestId = id;
    unit.pendingRouteTarget = target;
    unit.nextRouteRepathAt = this.elapsedTime + routeRepathCooldown(unit, ROUTE_DEFERRED_REPATH_COOLDOWN);
    this.pendingPathRequests.set(id, {
      unit,
      target
    });
    this.pathWorker.postMessage({
      type: 'findPath',
      id,
      start: { x: position.x, z: position.z },
      end: { x: targetPosition.x, z: targetPosition.z },
      options: {
        smooth: false,
        startRequireLine: false,
        startAllowLooseFallback: true,
        endRequireLine: false,
        maxIterations: ROUTE_WORKER_MAX_SEARCH_CELLS
      }
    });
    return true;
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
    if (unit) {
      const cachedSteering = readCachedNavSteering(
        unit,
        position,
        targetPosition,
        desiredDistance,
        this.elapsedTime
      );
      if (cachedSteering.hit) return cachedSteering.steering;
    }
    const startsOnNavigation = this.isPointOnNavigationSurface(position);
    if (!unit) {
      const path = this.world.findPath(position, targetPosition, {
        smooth: false,
        startRequireLine: false,
        startAllowLooseFallback: true,
        endRequireLine: false,
        maxIterations: ROUTE_MAX_SEARCH_CELLS
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
    const needsRoute = (
      targetChanged ||
      !Array.isArray(unit.route) ||
      unit.route.length === 0 ||
      offRoute
    );

    if (needsRoute) {
      const canRepath = (unit.nextRouteRepathAt ?? 0) <= this.elapsedTime;
      if (canRepath) {
        if (this.shouldUseWorkerPathing()) {
          this.requestWorkerRoute(unit, position, targetPosition);
          return Array.isArray(unit.route) && unit.route.length
            ? steeringFromRoute(position, targetPosition, unit.route, {
                desiredDistance,
                startsOnNavigation,
                startIndex: unit.routeIndex ?? 0
              })
            : null;
        }
        if (!this.consumeRouteSearchBudget(unit)) {
          return Array.isArray(unit.route) && unit.route.length
            ? steeringFromRoute(position, targetPosition, unit.route, {
                desiredDistance,
                startsOnNavigation,
                startIndex: unit.routeIndex ?? 0
              })
            : null;
        }
        const route = this.world.findPath(position, targetPosition, {
          smooth: false,
          startRequireLine: false,
          startAllowLooseFallback: true,
          endRequireLine: false,
          maxIterations: ROUTE_MAX_SEARCH_CELLS
        });
        unit.route = route;
        unit.routeIndex = 0;
        unit.routeTarget = setReusableVector(unit.routeTarget, targetPosition);
        const cooldown = route.length ? ROUTE_REPATH_COOLDOWN : ROUTE_FAILED_REPATH_COOLDOWN;
        unit.nextRouteRepathAt = this.elapsedTime + routeRepathCooldown(unit, cooldown);
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
      unit.route,
      {
        desiredDistance,
        startsOnNavigation,
        startIndex: index
      }
    );
    if (steering?.debugTarget) {
      unit.navSteeringTarget = setReusableVector(unit.navSteeringTarget, steering.debugTarget);
    } else {
      unit.navSteeringTarget = null;
    }
    return writeCachedNavSteering(unit, position, targetPosition, desiredDistance, steering, this.elapsedTime);
  }

  consumeRouteSearchBudget(unit) {
    if ((this.routeSearchBudget ?? ROUTE_SEARCHES_PER_FRAME) > 0) {
      this.routeSearchBudget -= 1;
      return true;
    }
    if (unit) {
      unit.nextRouteRepathAt = Math.max(
        unit.nextRouteRepathAt ?? 0,
        this.elapsedTime + routeRepathCooldown(unit, ROUTE_DEFERRED_REPATH_COOLDOWN)
      );
    }
    return false;
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
      unit.offRouteCheckTarget = setReusableVector(unit.offRouteCheckTarget, waypoint);
      unit.offRouteCheckPosition = setReusableVector(unit.offRouteCheckPosition, unit.position);
    }
    return unit.isOffRoute === true;
  }

  clearUnitRoute(unit) {
    if (!unit) return;
    if (unit.pendingRouteRequestId) {
      this.pendingPathRequests.delete(unit.pendingRouteRequestId);
    }
    unit.route = null;
    unit.routeIndex = null;
    unit.routeTarget = null;
    unit.pendingRouteRequestId = null;
    unit.pendingRouteTarget = null;
    unit.navSteeringTarget = null;
    unit.navMoveTarget = null;
    unit.navSteeringCache = null;
    unit.nextRouteRepathAt = 0;
  }

  requestUnitRouteRepath(unit, delay = ROUTE_BLOCKED_REPATH_COOLDOWN) {
    if (!unit) return;
    if (unit.pendingRouteRequestId) {
      this.pendingPathRequests.delete(unit.pendingRouteRequestId);
    }
    unit.route = null;
    unit.routeIndex = null;
    unit.routeTarget = null;
    unit.pendingRouteRequestId = null;
    unit.pendingRouteTarget = null;
    unit.navSteeringTarget = null;
    unit.nextRouteRepathAt = this.elapsedTime + routeRepathCooldown(unit, delay);
  }

  resolveWalkablePoint(point, padding = 0) {
    const resolved = point.clone();
    void padding;
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
      requireSafeSurface: false
    });
  }

  resolveNearestNavigationPoint(point, {
    maxRings = 12,
    requireSafeSurface = false
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
      enemyCampHealth: this.enemyCamp.health,
      rewardMultiplier: this.abilities?.getRewardMultiplier?.() ?? 1
    });
  }

  setPaused(paused, reason = '设置') {
    if (this.destroyed || this.levelFinished) return;
    this.paused = Boolean(paused);
    document.body.classList.toggle('is-game-paused', this.paused);
    if (this.paused) {
      this.cancelCameraDrag();
      this.cancelSelectionDrag();
      if (this.dom.pauseReason) {
        this.dom.pauseReason.textContent = reason === '返回' ? '返回键已暂停' : '游戏已暂停';
      }
      if (this.dom.pauseOverlay) this.dom.pauseOverlay.hidden = false;
      this.clock.getDelta();
    } else {
      if (this.dom.pauseOverlay) this.dom.pauseOverlay.hidden = true;
      this.clock.getDelta();
    }
  }

  onPauseOverlayClick(event) {
    const actionTarget = event.target.closest('[data-pause-action]');
    if (!actionTarget) return;
    event.preventDefault();
    event.stopPropagation();
    const action = actionTarget.dataset.pauseAction;
    if (action === 'continue') {
      this.setPaused(false);
      return;
    }
    if (action === 'fullscreen') {
      this.requestFullscreen();
      return;
    }
    if (action === 'restart') {
      this.onRestart?.(this.levelSession);
      return;
    }
    if (action === 'menu') {
      this.onExitToMenu?.();
    }
  }

  onReturnNavigation(event) {
    if (this.destroyed || this.levelFinished) return;
    event.preventDefault?.();
    this.setPaused(true, '返回');
    this.armReturnNavigationTrap();
  }

  async requestFullscreen() {
    const root = document.documentElement;
    const request = root.requestFullscreen
      ?? root.webkitRequestFullscreen
      ?? root.msRequestFullscreen;
    if (!request) {
      if (this.dom.pauseReason) this.dom.pauseReason.textContent = '当前浏览器不支持网页全屏';
      return;
    }
    try {
      await request.call(root);
      if (this.dom.pauseReason) this.dom.pauseReason.textContent = '已进入全屏';
    } catch {
      if (this.dom.pauseReason) this.dom.pauseReason.textContent = '请用浏览器菜单或添加到主屏幕后全屏游玩';
    }
  }

  armReturnNavigationTrap() {
    try {
      window.history.pushState({ villageWarPauseTrap: true }, '', window.location.href);
    } catch {
      // Browsers can reject history mutations in unusual embedded contexts.
    }
  }

  selectUnit(unit) {
    this.selectUnits(unit ? [unit] : []);
  }

  selectUnits(units) {
    const unique = new Set();
    this.selectedUnits.forEach((unit) => {
      unit.statusUiDirty = true;
    });
    this.selectedUnits = units.filter((unit) => {
      if (!unit?.alive || unit.team !== TEAMS.PLAYER || unique.has(unit.id)) return false;
      unique.add(unit.id);
      return true;
    });
    this.selectedUnitIds = new Set(this.selectedUnits.map((unit) => unit.id));
    this.selectedUnits.forEach((unit) => {
      unit.statusUiDirty = true;
    });
    this.selectedUnit = this.selectedUnits[0] ?? null;
  }

  onCanvasPointerDown(event) {
    if (event.target !== this.canvas) return;
    this.pointerScreen.set(event.clientX, event.clientY);

    if (event.pointerType === 'touch') {
      event.preventDefault();
      if (this.isMobileSelectionDoubleTap(event)) {
        this.lastMobileTap = null;
        this.beginSelectionDrag(event);
      } else {
        this.beginCameraDrag(event, {
          mode: 'touch-pan',
          issueCommandOnTap: true
        });
      }
      return;
    }

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
    this.beginSelectionDrag(event);
  }

  beginSelectionDrag(event) {
    if (this.cardSystem.drag) return;
    this.selectionDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      active: false
    };
    if (event.pointerId != null) {
      safeSetPointerCapture(this.canvas, event.pointerId);
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
    if (key === 'f2') {
      event.preventDefault();
      this.togglePerfChart();
      return;
    }
    if (key === 'escape') {
      event.preventDefault();
      this.setPaused(!this.paused, '设置');
      return;
    }
    if (this.paused) return;
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
      safeReleasePointerCapture(this.canvas, event.pointerId);
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
      safeReleasePointerCapture(this.canvas, event.pointerId);
    }
    this.hideSelectionBox();
  }

  isCurrentSelectionEvent(event) {
    if (!this.selectionDrag) return false;
    return event.pointerId == null || this.selectionDrag.pointerId == null || this.selectionDrag.pointerId === event.pointerId;
  }

  beginCameraDrag(event, options = {}) {
    if (this.cardSystem.drag || this.selectionDrag || isGameUiTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    this.cameraDrag = {
      mode: options.mode ?? 'mouse',
      issueCommandOnTap: options.issueCommandOnTap === true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      pendingX: 0,
      pendingY: 0,
      totalDistance: 0,
      moved: false
    };
    this.edgePanActive = false;
    this.canvas.classList.add('is-camera-dragging');
    if (event.pointerId != null) {
      safeSetPointerCapture(this.canvas, event.pointerId);
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
      this.cameraDrag.totalDistance += Math.hypot(dx, dy);
      this.cameraDrag.moved = this.cameraDrag.totalDistance > TOUCH_TAP_THRESHOLD;
    }
    return true;
  }

  onCommandDockClick(event) {
    const button = event.target?.closest?.('[data-command-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.paused) return;
    const action = button.dataset.commandAction;
    if (action === 'stop') {
      this.stopSelectedUnits();
    } else if (action === 'guard') {
      this.guardSelectedUnits();
    }
  }

  endCameraDrag(event) {
    if (!this.isCameraDragEndEvent(event)) return false;
    event.preventDefault?.();
    event.stopPropagation?.();
    const drag = this.cameraDrag;
    const pointerId = event.pointerId ?? this.cameraDrag.pointerId;
    if (pointerId != null) {
      safeReleasePointerCapture(this.canvas, pointerId);
    }
    this.applyCameraDragDelta();
    this.cancelCameraDrag();
    if (drag.issueCommandOnTap && !drag.moved && event.type !== 'pointercancel') {
      this.handleMobileTapCommand(event);
    }
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

  cancelSelectionDrag() {
    if (!this.selectionDrag) return;
    if (this.selectionDrag.pointerId != null) {
      safeReleasePointerCapture(this.canvas, this.selectionDrag.pointerId);
    }
    this.selectionDrag = null;
    this.hideSelectionBox();
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

  isMobileSelectionDoubleTap(event) {
    const tap = this.lastMobileTap;
    if (!tap) return false;
    const elapsed = performance.now() - tap.time;
    const distance = Math.hypot(event.clientX - tap.x, event.clientY - tap.y);
    return elapsed <= MOBILE_DOUBLE_TAP_MS && distance <= MOBILE_DOUBLE_TAP_DISTANCE;
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

  handleMobileTapCommand(event) {
    if (this.lootDrops?.tryOpenPickup(event)) return;
    const unit = this.pickFriendlyUnit(event.clientX, event.clientY);
    if (unit) {
      this.selectUnit(unit);
    } else {
      this.issueMoveCommand(event);
    }
    this.lastMobileTap = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now()
    };
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
    const units = this.selectedUnits.filter((unit) => (
      unit.alive &&
      !unit.isBuilding &&
      unit.definition?.canMove !== false
    ));
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
    this.attacks.cancelPendingAttacksFor(forceMoveUnits);
    this.effects.spawnMoveDestination(commandCenter, formationRadius);
  }

  isUnitEngaged(unit) {
    return Boolean(unit.target?.alive !== false && unit.target) ||
      Boolean(this.attacks.getActiveAttackFor(unit));
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
    this.attacks.cancelPendingAttacksFor(units);
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
    this.attacks.cancelPendingAttacksFor(units);
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
    const previousCount = this.selectedUnits.length;
    this.selectedUnits = this.selectedUnits.filter((unit) => unit.alive);
    if (this.selectedUnits.length !== previousCount) {
      this.selectedUnitIds = new Set(this.selectedUnits.map((unit) => unit.id));
    }
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
    for (let i = 0; i < this.friendlyUnits.length; i += 1) {
      this.updateUnitVisual(this.friendlyUnits[i], dt);
    }
    for (let i = 0; i < this.enemyUnits.length; i += 1) {
      this.updateUnitVisual(this.enemyUnits[i], dt);
    }
    this.updateStructureStatusElement(this.playerBase, dt);
    this.updateStructureStatusElement(this.enemyCamp, dt);
  }

  updateUnitVisual(unit, dt) {
    this.placeUnitOnGround(unit, dt);
    unit.updateVisual(this.camera, dt);
    this.updateUnitStatusElement(unit, dt);
  }

  attachUnitStatus(unit) {
    if (unit.statusElement && !unit.statusElement.parentElement) {
      this.worldUi.append(unit.statusElement);
    }
  }

  updateUnitStatusElement(unit, dt = 0, force = false) {
    const element = unit.statusElement;
    if (!element) return;
    if (!unit.alive) {
      element.hidden = true;
      return;
    }
    const screen = this.projectWorldUi(unit.position, unitStatusHeight(unit));
    element.hidden = !screen.visible;
    if (!element.hidden) {
      element.style.transform = `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -100%)`;
    }
    if (force || unit.statusUiDirty) {
      unit.updateStatusVisual(dt);
    } else if (unit.statusLagActive) {
      unit.updateStatusLagVisual(dt);
    }
  }

  updateStructureStatusElement(structure, dt = 0) {
    const element = structure.statusElement;
    if (!element?.parts) return;
    const hpRatio = clamp(structure.health / structure.maxHealth, 0, 1);
    updateStructureHealthLag(structure, hpRatio, dt);
    element.parts.hp.style.transform = `scaleX(${hpRatio})`;
    element.parts.healthLoss.style.transform = `scaleX(${structure.healthLagRatio})`;
    element.parts.healthLoss.hidden = structure.healthLagRatio <= hpRatio + 0.006;
    updateHealthTicks(element.parts.ticks, structure.maxHealth);
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
    this.dom.battleTime.textContent = formatBattleTime(this.elapsedTime);
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
    if (this.perfJsonEnabled && this.dom.debug) {
      this.dom.debug.hidden = false;
      this.dom.debug.textContent = JSON.stringify(this.perfDebugSnapshot());
    } else if (this.dom.debug && !this.dom.debug.hidden) {
      this.dom.debug.hidden = true;
      this.dom.debug.textContent = '';
    }
  }

  togglePerfChart() {
    this.perfDebugEnabled = true;
    if (!this.perfTracker) {
      this.perfTracker = new PerfTracker();
      this.perfHistory = [];
      this.lastPerfSampleId = 0;
    }
    this.perfChartVisible = !this.perfChartVisible;
    this.updatePerfPanel(0, { force: true });
  }

  recordPerfSample() {
    const sample = this.perfTracker?.snapshot?.();
    if (!sample || sample.warmingUp || sample.sampleId === this.lastPerfSampleId) return;
    this.lastPerfSampleId = sample.sampleId;
    this.perfHistory.push({
      sampleId: sample.sampleId,
      elapsedTime: Number(this.elapsedTime.toFixed(1)),
      wave: this.wave,
      fps: sample.fps ?? 0,
      sections: sample.sections ?? {},
      counts: sample.counts ?? {}
    });
    if (this.perfHistory.length > PERF_HISTORY_LIMIT) {
      this.perfHistory.splice(0, this.perfHistory.length - PERF_HISTORY_LIMIT);
    }
  }

  updatePerfPanel(dt = 0, { force = false } = {}) {
    const panel = this.dom.perfPanel;
    if (!panel) return;
    panel.hidden = !this.perfChartVisible;
    if (panel.hidden) return;

    this.perfChartUpdateTimer -= dt;
    if (!force && this.perfChartUpdateTimer > 0) return;
    this.perfChartUpdateTimer = PERF_CHART_UPDATE_INTERVAL;

    const latest = this.perfHistory[this.perfHistory.length - 1] ?? null;
    if (this.dom.perfStatus) {
      this.dom.perfStatus.textContent = latest
        ? `${formatPerfSeconds(latest.elapsedTime)} / W${latest.wave} / peak ${this.perfHistory.length}s`
        : 'warming up';
    }
    if (this.dom.perfStats) {
      this.dom.perfStats.innerHTML = latest
        ? this.createPerfStatsMarkup(latest)
        : '<span>waiting for first sample</span>';
    }
    this.drawPerfChart();
  }

  createPerfStatsMarkup(sample) {
    const counts = sample.counts ?? {};
    const nav = counts.nav ?? {};
    const sections = sample.sections ?? {};
    const frameMax = sections.frame?.maxMs ?? 0;
    const effectTotal = (counts.effects ?? 0) + (counts.projectiles ?? 0);
    const combatProfile = counts.combatProfile ?? {};
    const workerText = counts.pathWorkerReady ? 'worker' : 'sync';
    const workerError = this.pathWorkerError ? `<span class="is-bad">worker error</span>` : '';
    const topSections = profilerRowsFromSections(sections, PERF_TOP_SECTION_LIMIT, sectionPeakMap(this.perfHistory));
    const combatRows = profilerRowsFromCombatProfile(combatProfile, PERF_COMBAT_DETAIL_LIMIT, combatPeakMap(this.perfHistory));
    const targetSearches = profilerCounterTotal(combatProfile.targetSearches);
    const targetQueries = profilerCounterTotal(combatProfile.targetQueries);
    const targetCandidates = profilerCounterTotal(combatProfile.targetCandidates);
    const moveCalls = profilerCounterTotal(combatProfile.moveCalls);
    const separationChecks = profilerCounterTotal(combatProfile.separationChecks);
    const separationPushes = profilerCounterTotal(combatProfile.separationPushes);
    return [
      `<div class="perf-summary">${[
        perfStat('FPS', sample.fps),
        perfStat('Frame Max', `${frameMax}ms`),
        perfStat('Units', (counts.friendly ?? 0) + (counts.enemies ?? 0)),
        perfStat('FX', effectTotal),
        perfStat('Path', `${nav.findPath ?? 0}/${nav.expandedCells ?? 0}`),
        perfStat('AI', `${targetSearches}/${moveCalls}`),
        perfStat('Tgt', `${targetQueries}/${targetCandidates}`),
        perfStat('Sep', `${separationChecks}/${separationPushes}`),
        perfStat('Queue', counts.pendingPathRequests ?? 0),
        perfStat('Mode', workerText),
        workerError
      ].filter(Boolean).join('')}</div>`,
      profilerTableMarkup('Top Systems', topSections),
      profilerTableMarkup('Combat Details', combatRows)
    ].filter(Boolean).join('');
  }

  drawPerfChart() {
    const canvas = this.dom.perfCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width || canvas.width));
    const height = Math.max(120, Math.floor(rect.height || canvas.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawPerfBackground(ctx, width, height);
    if (this.perfHistory.length < 2) {
      ctx.fillStyle = 'rgba(247, 244, 232, 0.64)';
      ctx.font = '12px sans-serif';
      ctx.fillText('collecting samples...', 14, 26);
      return;
    }

    const framePeak = Math.max(33, historyMax(this.perfHistory, (sample) => sample.sections.frame?.maxMs ?? 0));
    const navPeak = Math.max(200, historyMax(this.perfHistory, (sample) => sample.counts.nav?.expandedCells ?? 0));
    drawPerfBars(ctx, this.perfHistory, width, height, (sample) => sample.counts.nav?.expandedCells ?? 0, navPeak, 'rgba(101, 209, 240, 0.22)');
    drawPerfLine(ctx, this.perfHistory, width, height, (sample) => clamp(sample.fps ?? 0, 0, 60), 60, '#8ff0d2', 2);
    drawPerfLine(ctx, this.perfHistory, width, height, (sample) => sample.sections.frame?.maxMs ?? 0, framePeak, '#ffd166', 2);
    drawPerfLine(ctx, this.perfHistory, width, height, (sample) => sample.sections.combat?.maxMs ?? 0, framePeak, '#ef6f6c', 1.5);
    drawPerfLine(ctx, this.perfHistory, width, height, (sample) => sample.sections.render?.maxMs ?? 0, framePeak, '#a9d6ff', 1.5);
    drawPerfLegend(ctx, width, height, framePeak);
  }

  perfDebugSnapshot() {
    return {
      level: this.levelSession.level.id,
      sceneKey: this.world.config?.sceneKey ?? this.worldConfig.sceneKey,
      elapsedTime: Number(this.elapsedTime.toFixed(1)),
      wave: this.wave,
      counts: this.createPerfCounters(),
      pathWorker: {
        ready: this.pathWorkerReady,
        pending: this.pendingPathRequests?.size ?? 0,
        error: this.pathWorkerError
      },
      perf: this.perfTracker?.snapshot() ?? null,
      perfHistory: this.perfHistory.slice(-8)
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
    const projected = this.worldUiProjection;
    projected.set(position.x, position.y + height, position.z);
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
  return Boolean(target?.closest?.(
    '.hud, .card, .energy-panel, .card-pile-dock, .pile-viewer, .loot-confirm, .drag-ghost, .game-settings-button, .game-command-dock, .mobile-action-dock, .pause-overlay'
  ));
}

function isTextInputTarget(target) {
  if (!target) return false;
  const tagName = target.tagName?.toLowerCase();
  return tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable;
}

function stopUiEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}

function stopUiPropagation(event) {
  event.stopPropagation();
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

function nextEnemyWaveDelay() {
  return EARLY_ENEMY_WAVE_DELAY;
}

function steeringFromRoute(position, targetPosition, route, {
  desiredDistance = 0.22,
  startsOnNavigation = true,
  startIndex = 0
} = {}) {
  if (!Array.isArray(route) || route.length === 0) return null;
  if (flatDistance(position, targetPosition) <= desiredDistance) return null;

  const lookaheadDistance = startsOnNavigation
    ? ROUTE_STEERING_LOOKAHEAD_DISTANCE
    : ROUTE_RECOVERY_LOOKAHEAD_DISTANCE;
  const debugTarget = routeLookaheadPoint(position, route, lookaheadDistance, startIndex);
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

function steeringFromDirectTarget(position, targetPosition, desiredDistance = 0.22) {
  if (flatDistance(position, targetPosition) <= desiredDistance) return null;
  const dx = targetPosition.x - position.x;
  const dz = targetPosition.z - position.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return null;
  return {
    direction: new THREE.Vector3(dx / length, 0, dz / length),
    debugTarget: targetPosition
  };
}

function readCachedNavSteering(unit, position, targetPosition, desiredDistance, now) {
  const cache = unit?.navSteeringCache;
  if (!cache || cache.expiresAt <= now) return { hit: false, steering: null };
  if (Math.abs((cache.desiredDistance ?? 0) - desiredDistance) > 0.001) {
    return { hit: false, steering: null };
  }
  if (
    flatDistance(cache.position, position) > NAV_STEERING_CACHE_POSITION_DISTANCE ||
    flatDistance(cache.target, targetPosition) > NAV_STEERING_CACHE_TARGET_DISTANCE
  ) {
    return { hit: false, steering: null };
  }
  if (!cache.hasSteering) return { hit: true, steering: null };
  return {
    hit: true,
    steering: {
      direction: cache.direction.clone(),
      debugTarget: cache.debugTarget.clone()
    }
  };
}

function writeCachedNavSteering(unit, position, targetPosition, desiredDistance, steering, now) {
  if (!unit) return steering;
  unit.navSteeringCache = {
    expiresAt: now + NAV_STEERING_CACHE_SECONDS,
    desiredDistance,
    position: setReusableVector(unit.navSteeringCache?.position, position),
    target: setReusableVector(unit.navSteeringCache?.target, targetPosition),
    hasSteering: Boolean(steering),
    direction: steering?.direction
      ? setReusableVector(unit.navSteeringCache?.direction, steering.direction)
      : null,
    debugTarget: steering?.debugTarget
      ? setReusableVector(unit.navSteeringCache?.debugTarget, steering.debugTarget)
      : null
  };
  return steering;
}

function routeLookaheadPoint(position, route, lookaheadDistance, startIndex = 0) {
  let anchor = position;
  let remaining = Math.max(0.05, lookaheadDistance);
  let last = null;

  for (let i = Math.max(0, startIndex); i < route.length; i += 1) {
    const point = route[i];
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

  return last ?? null;
}

function setReusableVector(current, point) {
  if (!point) return null;
  const vector = current ?? new THREE.Vector3();
  vector.set(point.x, point.y ?? 0, point.z);
  return vector;
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

function initialPerfJsonEnabled() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has('perfjson') && params.get('perfjson') !== '0';
  } catch {
    return false;
  }
}

function createRenderQualityProfile(settings = loadRenderSettings()) {
  const override = readRenderQualityOverride();
  const mobile = override === 'low' || (override !== 'high' && isProbablyMobileDevice());
  const rawPixelRatio = window.devicePixelRatio || 1;
  const pixelRatio = settings.dpr ?? (mobile ? MOBILE_RENDER_PIXEL_RATIO : DESKTOP_RENDER_PIXEL_RATIO);
  return {
    mode: mobile ? 'mobile' : 'desktop',
    pixelRatio: clamp(pixelRatio, MIN_DPR, MAX_DPR),
    nativePixelRatio: rawPixelRatio,
    antialias: true
  };
}

function loadRenderSettings() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || 'null');
  } catch {
    saved = null;
  }
  const defaultDpr = isProbablyMobileDevice() ? MOBILE_RENDER_PIXEL_RATIO : DESKTOP_RENDER_PIXEL_RATIO;
  return {
    fpsLimit: clamp(Number(saved?.fpsLimit) || DEFAULT_FPS_LIMIT, MIN_FPS_LIMIT, MAX_FPS_LIMIT),
    dpr: clamp(Number(saved?.dpr) || defaultDpr || DEFAULT_DPR, MIN_DPR, MAX_DPR)
  };
}

function saveRenderSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      fpsLimit: Math.round(settings.fpsLimit),
      dpr: Number(settings.dpr.toFixed(2))
    }));
  } catch {
    // Storage can be unavailable in private or embedded browsers.
  }
}

function readRenderQualityOverride() {
  try {
    const params = new URLSearchParams(window.location.search);
    const value = (params.get('quality') ?? params.get('renderQuality') ?? '').toLowerCase();
    if (['low', 'mobile', 'performance'].includes(value)) return 'low';
    if (['high', 'desktop', 'quality'].includes(value)) return 'high';
  } catch {
    // Keep the default auto mode when URLSearchParams is unavailable.
  }
  return 'auto';
}

function isProbablyMobileDevice() {
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua)) return true;
  const hasTouch = navigator.maxTouchPoints > 0;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const narrowSide = Math.min(window.innerWidth || 0, window.innerHeight || 0);
  return hasTouch && (coarsePointer || narrowSide <= 900);
}

function perfStat(label, value) {
  return `<span><b>${label}</b>${value}</span>`;
}

function unitModelPrewarmEntries() {
  return Object.keys(UNIT_DEFINITIONS).flatMap((type) => ([
    { type, team: TEAMS.PLAYER },
    { type, team: TEAMS.ENEMY }
  ]));
}

function profilerRowsFromSections(sections = {}, limit = 8, peaks = {}) {
  return Object.entries(sections)
    .filter(([name]) => name !== 'frame')
    .map(([name, stat]) => ({
      name,
      label: PERF_LABELS[name] ?? name,
      lastMs: stat.lastMs ?? stat.avgMs ?? 0,
      avgMs: stat.avgMs ?? 0,
      maxMs: stat.maxMs ?? 0,
      peakMs: Math.max(stat.maxMs ?? 0, peaks[name] ?? 0)
    }))
    .sort((a, b) => (b.peakMs - a.peakMs) || (b.maxMs - a.maxMs) || (b.avgMs - a.avgMs))
    .slice(0, limit);
}

function profilerRowsFromCombatProfile(profile = {}, limit = 8, peaks = {}) {
  return Object.entries(COMBAT_PROFILE_LABELS)
    .map(([key, label]) => profilerTimingRow(key, label, profile[key], peaks[key] ?? 0))
    .filter((row) => row.maxMs > 0 || row.peakMs > 0)
    .sort((a, b) => (b.peakMs - a.peakMs) || (b.maxMs - a.maxMs))
    .slice(0, limit);
}

function profilerTimingRow(name, label, value, peakMs = 0) {
  if (value && typeof value === 'object') {
    const maxMs = Number(value.maxMs ?? value.max ?? 0);
    return {
      name,
      label,
      lastMs: Number(value.lastMs ?? value.last ?? 0),
      avgMs: Number(value.avgMs ?? value.avg ?? 0),
      maxMs,
      peakMs: Math.max(maxMs, Number(peakMs) || 0)
    };
  }
  const ms = Number(value ?? 0);
  return {
    name,
    label,
    lastMs: ms,
    avgMs: ms,
    maxMs: ms,
    peakMs: Math.max(ms, Number(peakMs) || 0)
  };
}

function sectionPeakMap(history = []) {
  const peaks = {};
  history.forEach((sample) => {
    Object.entries(sample.sections ?? {}).forEach(([name, stat]) => {
      peaks[name] = Math.max(peaks[name] ?? 0, stat?.maxMs ?? 0);
    });
  });
  return peaks;
}

function combatPeakMap(history = []) {
  const peaks = {};
  history.forEach((sample) => {
    Object.entries(sample.counts?.combatProfile ?? {}).forEach(([name, stat]) => {
      const maxMs = stat && typeof stat === 'object' ? stat.maxMs ?? stat.max ?? 0 : Number(stat ?? 0);
      peaks[name] = Math.max(peaks[name] ?? 0, maxMs);
    });
  });
  return peaks;
}

function profilerCounterTotal(value) {
  if (value && typeof value === 'object') {
    return Math.round(Number(value.total ?? value.last ?? value.max ?? 0));
  }
  return Math.round(Number(value ?? 0));
}

function profilerTableMarkup(title, rows) {
  if (!rows?.length) {
    return `
      <div class="profiler-block">
        <div class="profiler-title">${title}</div>
        <div class="profiler-empty">collecting...</div>
      </div>
    `;
  }
  const maxMs = Math.max(1, ...rows.map((row) => row.peakMs ?? row.maxMs));
  return `
    <div class="profiler-block">
      <div class="profiler-title">${title}</div>
      <div class="profiler-table">
        <div class="profiler-row profiler-head">
          <span>代码块</span><span>now</span><span>avg</span><span>max</span><span>peak</span>
        </div>
        ${rows.map((row) => profilerRowMarkup(row, maxMs)).join('')}
      </div>
    </div>
  `;
}

function profilerRowMarkup(row, maxMs) {
  const peakMs = row.peakMs ?? row.maxMs;
  const ratio = clamp(peakMs / Math.max(0.001, maxMs), 0, 1);
  const warningClass = peakMs >= 8 ? ' is-hot' : peakMs >= 4 ? ' is-warm' : '';
  return `
    <div class="profiler-row${warningClass}" style="--profiler-load:${ratio}">
      <span>${row.label}</span>
      <span>${formatPerfMs(row.lastMs)}</span>
      <span>${formatPerfMs(row.avgMs)}</span>
      <span>${formatPerfMs(row.maxMs)}</span>
      <span>${formatPerfMs(peakMs)}</span>
    </div>
  `;
}

function formatPerfMs(value) {
  const number = Number(value) || 0;
  return `${number.toFixed(number >= 10 ? 1 : 2)}ms`;
}

function formatPerfSeconds(seconds) {
  if (!Number.isFinite(seconds)) return '0s';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function historyMax(history, readValue) {
  return history.reduce((max, sample) => Math.max(max, readValue(sample) || 0), 0);
}

function drawPerfBackground(ctx, width, height) {
  ctx.fillStyle = 'rgba(9, 14, 15, 0.74)';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (height * i) / 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  for (let i = 1; i < 6; i += 1) {
    const x = (width * i) / 6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
}

function drawPerfLine(ctx, history, width, height, readValue, maxValue, color, lineWidth = 1.5) {
  if (history.length < 2 || maxValue <= 0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  history.forEach((sample, index) => {
    const x = (index / (history.length - 1)) * width;
    const value = clamp(readValue(sample) || 0, 0, maxValue);
    const y = height - (value / maxValue) * (height - 12) - 6;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
}

function drawPerfBars(ctx, history, width, height, readValue, maxValue, color) {
  if (history.length < 2 || maxValue <= 0) return;
  const barWidth = Math.max(1, width / history.length);
  ctx.fillStyle = color;
  history.forEach((sample, index) => {
    const value = clamp(readValue(sample) || 0, 0, maxValue);
    const barHeight = (value / maxValue) * (height - 12);
    ctx.fillRect(index * barWidth, height - barHeight, Math.ceil(barWidth), barHeight);
  });
}

function drawPerfLegend(ctx, width, height, framePeak) {
  ctx.font = '11px sans-serif';
  ctx.textBaseline = 'top';
  const items = [
    ['FPS', '#8ff0d2'],
    ['Frame', '#ffd166'],
    ['Combat', '#ef6f6c'],
    ['Render', '#a9d6ff'],
    ['Nav cells', '#65d1f0']
  ];
  let x = 10;
  items.forEach(([label, color]) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, 9, 8, 8);
    ctx.fillStyle = 'rgba(247, 244, 232, 0.78)';
    ctx.fillText(label, x + 12, 6);
    x += ctx.measureText(label).width + 30;
  });
  ctx.fillStyle = 'rgba(247, 244, 232, 0.62)';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.ceil(framePeak)}ms`, width - 10, height - 18);
  ctx.textAlign = 'left';
}

class PerfTracker {
  constructor() {
    this.interval = 1;
    this.lastSnapshot = null;
    this.sampleId = 0;
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
    this.combatProfile = new Map();
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
      count: 0,
      last: 0
    };
    stat.total += ms;
    stat.max = Math.max(stat.max, ms);
    stat.count += 1;
    stat.last = ms;
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
    this.addCombatProfile(counters.combatProfile);
    this.counts = {
      ...counters,
      combatProfile: undefined,
      nav: undefined
    };
    if (this.elapsed < this.interval) return;

    this.lastSnapshot = {
      sampleId: ++this.sampleId,
      fps: roundPerf(this.frames / Math.max(0.001, this.elapsed)),
      seconds: roundPerf(this.elapsed),
      sections: this.sectionSnapshot(),
      counts: {
        ...this.counts,
        combatProfile: this.combatProfileSnapshot(),
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
        maxMs: roundPerf(stat.max),
        lastMs: roundPerf(stat.last)
      };
    });
    return sections;
  }

  addCombatProfile(profile = null) {
    if (!profile) return;
    Object.entries(profile).forEach(([key, value]) => {
      if (!Number.isFinite(value)) return;
      const stat = this.combatProfile.get(key) ?? {
        total: 0,
        max: 0,
        count: 0,
        last: 0
      };
      stat.total += value;
      stat.max = Math.max(stat.max, value);
      stat.count += 1;
      stat.last = value;
      this.combatProfile.set(key, stat);
    });
  }

  combatProfileSnapshot() {
    const profile = {};
    this.combatProfile.forEach((stat, key) => {
      const isTiming = key.endsWith('Ms');
      if (isTiming) {
        profile[key] = {
          lastMs: roundPerf(stat.last),
          avgMs: roundPerf(stat.total / Math.max(1, stat.count)),
          maxMs: roundPerf(stat.max),
          totalMs: roundPerf(stat.total)
        };
      } else {
        profile[key] = {
          last: roundPerf(stat.last),
          avg: roundPerf(stat.total / Math.max(1, stat.count)),
          max: roundPerf(stat.max),
          total: roundPerf(stat.total)
        };
      }
    });
    return profile;
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

function createEmptyWorkerPathStats() {
  return {
    findPath: 0,
    pathDistance: 0,
    hasLine: 0,
    nearestWalkableCell: 0,
    expandedCells: 0
  };
}

function mergePathStats(primary = null, secondary = null) {
  if (!primary && !secondary) return null;
  return {
    findPath: (primary?.findPath ?? 0) + (secondary?.findPath ?? 0),
    pathDistance: (primary?.pathDistance ?? 0) + (secondary?.pathDistance ?? 0),
    hasLine: (primary?.hasLine ?? 0) + (secondary?.hasLine ?? 0),
    nearestWalkableCell: (primary?.nearestWalkableCell ?? 0) + (secondary?.nearestWalkableCell ?? 0),
    expandedCells: (primary?.expandedCells ?? 0) + (secondary?.expandedCells ?? 0)
  };
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

function safeSetPointerCapture(element, pointerId) {
  try {
    element?.setPointerCapture?.(pointerId);
  } catch {
    // Some touch browsers can reject capture during synthetic or interrupted gestures.
  }
}

function safeReleasePointerCapture(element, pointerId) {
  try {
    element?.releasePointerCapture?.(pointerId);
  } catch {
    // The release path should never block drag cleanup.
  }
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

function formatBattleTime(seconds = 0) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
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
    healthLoss: element.querySelector('.world-health-loss-fill'),
    ticks: element.querySelector('.world-health-ticks')
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
  if (unit.type === 'spider') return 1.18;
  if (unit.type === 'spiderEgg') return 0.88;
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

function updateHealthTicks(ticks, maxHealth) {
  if (!ticks) return;
  const scale = healthTickScale(maxHealth);
  ticks.style.setProperty('--health-tick-step', `${scale.stepPercent}%`);
  ticks.style.setProperty('--health-tick-color', scale.color);
}

function healthTickScale(maxHealth) {
  const health = Math.max(1, maxHealth ?? 1);
  if (health > 5000) {
    return { color: '#62d56f', stepPercent: Math.min(100, 500 / health * 100) };
  }
  if (health >= 500) {
    return { color: '#b56cff', stepPercent: Math.min(100, 100 / health * 100) };
  }
  if (health >= 50) {
    return { color: '#ffd45f', stepPercent: Math.min(100, 25 / health * 100) };
  }
  return { color: '#120f0d', stepPercent: Math.min(100, 5 / health * 100) };
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
