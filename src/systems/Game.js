import * as THREE from 'three';
import { createAttackRangeRing, createGuardFlag, createSelectionRing } from '../art/lowpoly.js';
import {
  BALANCE,
  CARD_DEFINITIONS,
  LEVEL_DEFINITIONS,
  TEAMS,
  UNIT_DEFINITIONS,
  WAVE_BOSS_TYPES,
  WAVE_MONSTER_TYPES
} from '../data/gameData.js';
import {
  UNIT_GENERIC_UPGRADES,
  UNIT_SPECIAL_UPGRADES,
  runtimeUpgradeSummaryForCard,
  runtimeUpgradeTitleForCard
} from '../data/cardUpgrades.js';
import { UnitEntity } from '../entities/UnitEntity.js';
import { prewarmUnitModelTemplates } from '../art/visualRegistry.js';
import { createWorld } from '../world/createWorld.js';
import { BuffSystem } from './BuffSystem.js';
import { BuildingSystem } from './BuildingSystem.js';
import { CardEffectSystem } from './CardEffectSystem.js';
import {
  CardSystem,
  cardEnergyCost,
  cardThemeColor,
  cardUseBarMarkup,
  createCardArtMarkup,
  fitStrategyRewardCards
} from './CardSystem.js';
import { CombatSystem } from './CombatSystem.js';
import { AttackSystem } from './AttackSystem.js';
import { EffectsSystem } from './EffectsSystem.js';
import { AltarSystem } from './AltarSystem.js';
import { EnemyCommanderSystem } from './EnemyCommanderSystem.js';
import { EnemyEnchantmentSystem } from './EnemyEnchantmentSystem.js';
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
import { clamp, polarOffset, seededRandom } from '../utils/math.js';
import { formatSupportAmount, targetCombatRadius } from './combatHelpers.js';

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
const MAX_ACTIVE_WAVE_SPAWNS = 7;
const WAVE_PREVIEW_COUNT = 5;
const MOBILE_WAVE_PREVIEW_COUNT = 3;
const MAX_LEVEL_DIFFICULTY = 10;
const TOTAL_WAVES = 21;
const BOSS_WAVES_TO_WIN = 3;
const WAVES_PER_BOSS = 7;
const ELITE_WAVE_INTERVAL = 3;
const WAVE_DIFFICULTY_STEP_WAVES = 3;
const WAVE_DIFFICULTY_GROWTH_PER_SELECTED_DIFFICULTY = 0.16;
const STRATEGY_CHOICE_COUNT = 3;
const STRATEGY_REWARD_REROLL_BASE_COST = 4;
const SILVER_GAIN_MULTIPLIER = 0.6;
const FORCED_CARD_CHOICE_UNTIL_WAVE = 3;
const OPENING_COMBAT_UNIT_CHOICES = 2;
const ENEMY_CAMP_IDLE_SCAN_SECONDS = 0.18;
const RUN_SHOP_BASE_PRICE = 8;
const RUN_SHOP_PRICE_INCREMENT = 3;
const RUN_SHOP_CATEGORIES = [
  {
    key: 'card',
    title: '购置卡牌',
    description: '随机 3 张出战牌，选 1 张加入抽牌堆。',
    icon: '▣'
  },
  {
    key: 'attribute',
    title: '属性集训',
    description: '三选一全队属性强化，立即生效。',
    icon: '↑'
  },
  {
    key: 'trait',
    title: '特性专精',
    description: '三选一兵种特性，每种仅一次。',
    icon: '★'
  },
  {
    key: 'copy',
    title: '复制卡牌',
    description: '从已有卡牌中选一张复制；手牌有空位则优先进手牌。',
    icon: '⧉',
    picker: true,
    catalogPicker: true
  },
  {
    key: 'remove',
    title: '移除卡牌',
    description: '从已有卡牌中选一张，移出本局全部同名卡牌。',
    icon: '✕',
    picker: true,
    catalogPicker: true
  },
  {
    key: 'upgrade',
    title: '升级卡牌',
    description: '从已有卡牌中选一张，该牌及同名牌等级 +1。',
    icon: '⬆',
    picker: true,
    catalogPicker: true
  },
  {
    key: 'energy',
    title: '购买能量',
    description: '立即获得 1 点能量。',
    icon: '⚡',
    fixedPrice: 4
  },
  {
    key: 'temporary',
    title: '临时咒印',
    description: '购置一张本局可用的临时牌。',
    icon: '⏱'
  }
];
const WAVE_AFFIX_DEFINITIONS = {
  swarm: {
    id: 'swarm',
    name: '集群',
    preview: '数量压迫',
    description: '数量更多，但单体略脆',
    buffId: 'waveSwarm',
    countBonus: 1,
    preferredTypes: ['goblinSoldier', 'spider', 'enemyRaider']
  },
  armored: {
    id: 'armored',
    name: '重甲',
    preview: '护盾厚',
    description: '生命和护盾更高',
    buffId: 'waveArmored',
    countBonus: 0,
    preferredTypes: ['skeletonSoldier', 'shieldBearer', 'goblinShaman', 'goblinTroll', 'ogre', 'scorpion']
  },
  rush: {
    id: 'rush',
    name: '冲锋',
    preview: '速度快',
    description: '移动和攻击更快',
    buffId: 'waveRush',
    countBonus: 1,
    preferredTypes: ['enemyRaider', 'goblinHunter', 'spider', 'goblinSoldier']
  },
  ranged: {
    id: 'ranged',
    name: '远射',
    preview: '远程多',
    description: '更容易出现远程单位',
    buffId: 'waveRanged',
    countBonus: 0,
    preferredTypes: ['goblinArcher', 'goblinHunter', 'elfSniper', 'skeletonArcher', 'venomArcher', 'goblinShaman', 'wizard', 'frostAcolyte']
  },
  siege: {
    id: 'siege',
    name: '攻城',
    preview: '高伤害',
    description: '伤害更高，压迫基地',
    buffId: 'waveSiege',
    countBonus: 0,
    preferredTypes: ['ogre', 'goblinTroll', 'shieldBearer', 'goblinShaman', 'goblinBomber', 'scorpion']
  }
};
const DEFAULT_WAVE_AFFIX_FLOW = [
  'swarm',
  'rush',
  'ranged',
  'armored',
  'siege',
  'swarm',
  'armored',
  'ranged',
  'rush',
  'siege',
  'ranged',
  'swarm',
  'armored',
  'rush',
  'siege'
];
const WAVE_MONSTER_UNLOCKS = {
  enemyRaider: { minWave: 1 },
  goblinSoldier: { minWave: 1 },
  spider: { minWave: 2 },
  goblinArcher: { minWave: 3 },
  goblinHunter: { minWave: 4 },
  goblinShaman: { minWave: 5 },
  goblinBomber: { minWave: 6 },
  venomArcher: { minWave: 4 },
  skeletonSoldier: { minWave: 4 },
  skeletonArcher: { minWave: 6 },
  frostAcolyte: { minWave: 6 },
  elfSniper: { minWave: 8 },
  scorpion: { minWave: 6 },
  shieldBearer: { minWave: 6 },
  goblinTroll: { minWave: 7 },
  wizard: { minWave: 8 },
  ogre: { minWave: 10 }
};
const WAVE_BOSS_UNLOCKS = {
  goblinTroll: { minBoss: 1 },
  scorpion: { minBoss: 1 },
  wizard: { minBoss: 2 },
  ogre: { minBoss: 2 }
};
const TEMPORARY_IMMORTALITY_CARD = {
  id: 'temporary-immortality-enchant',
  name: '不朽附魔',
  kind: 'enchant',
  label: '朽',
  artKey: 'recovery',
  summary: '特殊临时牌。使目标每秒恢复 4% 最大生命值（消耗）。',
  target: 'friendly-unit',
  radius: 1.1,
  cooldown: 0,
  energyCost: 0,
  uses: 1,
  lootOnly: true,
  enchantmentId: 'immortality',
  effect: {
    type: 'apply-buff',
    buffId: 'immortality'
  },
  color: '#f1e7a8'
};
const TEMPORARY_MANA_SURGE_CARD = {
  id: 'temporary-mana-surge-enchant',
  name: '魔力涌动',
  kind: 'enchant',
  label: '涌',
  artKey: 'abilityEnchantEcho',
  summary: '特殊临时牌。拖拽给单位后，随机进行 3 次附魔（消耗）。',
  target: 'friendly-unit',
  radius: 1.1,
  cooldown: 0,
  energyCost: 0,
  uses: 1,
  lootOnly: true,
  effect: {
    type: 'apply-random-enchantments',
    count: 3
  },
  color: '#b68cff'
};
const STRATEGY_REWARD_OPTION_DEFINITIONS = [
  {
    id: 'choose-summon-card',
    action: 'open-card-kind-choice',
    cardKind: 'summon',
    title: '选择单位卡',
    description: '从本局出战单位牌中选择一张加入抽牌堆。',
    artKey: 'raider',
    color: '#8fdc9b'
  },
  {
    id: 'choose-spell-card',
    action: 'open-card-kind-choice',
    cardKind: 'spell',
    title: '选择法术卡',
    description: '从本局出战法术牌中选择一张加入抽牌堆。',
    artKey: 'meteor',
    color: '#9a3f35'
  },
  {
    id: 'choose-enchant-card',
    action: 'open-card-kind-choice',
    cardKind: 'enchant',
    title: '选择附魔卡',
    description: '从本局出战附魔牌中选择一张加入抽牌堆。',
    artKey: 'power',
    color: '#b97d2c'
  },
  {
    id: 'choose-tactic-card',
    action: 'open-card-kind-choice',
    cardKind: 'tactic',
    title: '选择战术卡',
    description: '从本局出战战术牌中选择一张加入抽牌堆。',
    artKey: 'tacticUpgrade',
    color: '#8a6fc4'
  },
  {
    id: 'choose-ability-card',
    action: 'open-card-kind-choice',
    cardKind: 'ability',
    title: '选择能力卡',
    description: '从本局出战能力牌中选择一张加入抽牌堆。',
    artKey: 'abilityPeriodicEnergy',
    color: '#7f8fc7'
  },
  {
    id: 'choose-building-card',
    action: 'open-card-kind-choice',
    cardKind: 'building',
    title: '选择建筑卡',
    description: '从本局出战建筑牌中选择一张加入抽牌堆。',
    artKey: 'arrowTower',
    color: '#8f6a3f'
  },
  {
    id: 'upgrade-existing-card',
    action: 'open-card-upgrade-choice',
    title: '升级一张已有卡',
    description: '选择一张已有卡，使同名卡牌等级 +1。',
    artKey: 'tacticUpgrade',
    color: '#d8c58d'
  },
  {
    id: 'copy-existing-card',
    action: 'open-card-copy-choice',
    title: '复制一张已有卡',
    description: '选择一张已有卡，复制一张同等级副本。',
    artKey: 'copy',
    color: '#9eeedb'
  },
  {
    id: 'temporary-immortality-card',
    action: 'grant-temporary-card',
    title: '获得不朽附魔',
    description: '获得一张特殊临时牌：每秒恢复目标 4% 最大生命值（消耗）。',
    temporaryCard: TEMPORARY_IMMORTALITY_CARD
  },
  {
    id: 'temporary-mana-surge-card',
    action: 'grant-temporary-card',
    title: '获得魔力涌动',
    description: '获得一张特殊临时牌：对目标随机进行 3 次附魔（消耗）。',
    temporaryCard: TEMPORARY_MANA_SURGE_CARD
  }
];
const SUMMON_DEPLOY_RADIUS = 7.5;
const SPIDER_FIRST_EGG_SECONDS = 37;
const SPIDER_EGG_INTERVAL_SECONDS = 60;
const SPIDER_EGG_HATCH_SECONDS = 15;
const TOUCH_TAP_THRESHOLD = 7;
const MOBILE_PINCH_MIN_DISTANCE = 24;
const STRUCTURE_HEALTH_LAG_DELAY = 0.4;
const STRUCTURE_HEALTH_LAG_RAPID_DELAY = 0.08;
const STRUCTURE_HEALTH_LAG_RAPID_WINDOW = 0.18;
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
  enemyEnchantment: '敌方附魔',
  frame: '整帧',
  guardVisuals: '驻守标记',
  hud: 'HUD',
  loot: '掉落',
  mechanics: '关卡机制',
  navDebug: '寻路显示',
  playerBaseAttack: '基地防御火力',
  recovery: '恢复',
  render: '渲染',
  selection: '选择',
  spiders: '蜘蛛生命周期',
  strategySpawn: '敌军附魔',
  enemyDirector: '敌军出兵',
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
const DEFAULT_FPS_LIMIT = 60;
const MIN_FPS_LIMIT = 30;
const MAX_FPS_LIMIT = 90;
const DEFAULT_DPR = 1;
const MIN_DPR = 1;
const MAX_DPR = 2;
const SETTINGS_STORAGE_KEY = 'village-war-render-settings-v1';
const RENDER_TONE_MAPPING_OPTIONS = ['neutral', 'aces', 'reinhard', 'linear', 'none'];
const RENDER_TONE_MAPPING_LABELS = {
  neutral: 'Neutral',
  aces: 'ACES',
  reinhard: 'Reinhard',
  linear: 'Linear',
  none: 'None'
};
const SNOW_VALLEY_HEAD_RENDER_TUNING = Object.freeze({
  toneMapping: 'linear',
  exposure: 1.1,
  brightness: 1.02,
  contrast: 1.22,
  saturation: 0.81,
  hue: 0,
  warmth: 0,
  sunColor: '#fff0f0',
  sunIntensity: 2.12,
  sunX: -88,
  sunY: 48,
  sunZ: 48,
  hemiIntensity: 1.52,
  hemiSky: '#e8f4ff',
  hemiGround: '#bebbc5',
  background: '#f0f8fc',
  fogColor: '#f7f8f2',
  fogNear: 110,
  fogFar: 282
});
const DUNGEON_HALLS_HEAD_RENDER_TUNING = Object.freeze({
  toneMapping: 'linear',
  exposure: 1.1,
  brightness: 1,
  contrast: 1.12,
  saturation: 1.07,
  hue: 0,
  warmth: 0,
  sunColor: '#ffa852',
  sunIntensity: 2.12,
  sunX: -88,
  sunY: 48,
  sunZ: 48,
  hemiIntensity: 1.52,
  hemiSky: '#ac6262',
  hemiGround: '#ff8080',
  background: '#d1d1d1',
  fogColor: '#c05454',
  fogNear: 20,
  fogFar: 127
});
const RED_DESERT_HEAD_RENDER_TUNING = Object.freeze({
  toneMapping: 'linear',
  exposure: 1.1,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  warmth: 0,
  sunColor: '#fbb99d',
  sunIntensity: 3.3,
  sunX: -88,
  sunY: 48,
  sunZ: 48,
  hemiIntensity: 0.77,
  hemiSky: '#ffd79e',
  hemiGround: '#902c2c',
  background: '#ff8847',
  fogColor: '#ffc87a',
  fogNear: 20,
  fogFar: 117
});
const CAMERA_FOG_COMPENSATION_START = 0.46;
const CAMERA_FOG_COMPENSATION_NEAR_SCALE = 0.34;
const CAMERA_FOG_COMPENSATION_FAR_SCALE = 2.4;

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
    this.runtimeError = null;
    this.currentFrameStep = null;
    this.eventController = new AbortController();
    this.renderSettings = loadRenderSettings();
    this.renderQuality = createRenderQualityProfile(this.renderSettings);
    this.frameLimitMs = 1000 / this.renderSettings.fpsLimit;
    this.lastAnimationFrameTime = null;
    this.worldConfig = {
      ...(this.levelSession.level.world ?? BALANCE.world)
    };
    this.worldConfig = applyRenderQualityToWorldConfig(this.worldConfig, this.renderQuality);
    this.renderTuning = null;
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
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.setPixelRatio(this.renderQuality.pixelRatio);
    const useRealtimeShadows = this.renderQuality.realtimeShadows && this.worldConfig.sky?.realtimeShadows !== false;
    this.renderer.shadowMap.enabled = useRealtimeShadows;
    this.renderer.shadowMap.autoUpdate = useRealtimeShadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    this.activeTouchPointers = new Map();
    this.touchGesture = null;
    this.mobileBoxSelectMode = false;
    this.updateCamera(0);

    this.clock = new THREE.Clock();
    this.unitRegistry = new UnitRegistry(this);
    this.friendlyUnits = this.unitRegistry.friendlyUnits;
    this.enemyUnits = this.unitRegistry.enemyUnits;
    this.score = 0;
    this.enemyDirectorConfig = {
      ...(BALANCE.enemyDirector ?? {}),
      ...(this.levelSession.level.enemyDirector ?? {})
    };
    this.waveSchedule = createWaveSchedule(this.levelSession);
    this.waveIndex = 0;
    this.currentWave = null;
    this.wave = 0;
    this.enemyDirector = {
      energy: 999,
      threatTier: 1,
      threat: 1
    };
    this.currentEnemyForce = null;
    this.pendingStrategyRewards = [];
    this.rewardedAltarIds = new Set();
    this.teamGenericUpgradeCounts = new Map();
    this.teamSpecialUpgrades = new Map();
    this.teamSupportModifiersApplied = new Set();
    this.bossesDefeated = 0;
    this.pendingWaveAdvance = false;
    this.silver = Math.max(0, Number(BALANCE.runCurrency?.starting ?? 0));
    this.strategyRewardRerollCount = 0;
    this.shopPrices = createInitialShopPrices();
    this.awaitingOpeningReward = false;
    this.runShopOpen = false;
    this.runShopCausedPause = false;
    this.runShopUiBoundOverlay = null;
    this.runShopPendingOffers = {};
    this.runShopActiveCategory = null;
    this.runShopChoices = [];
    this.runShopFreeReward = false;
    this.levelTestMode = false;
    this.debugTimeScale = 1;
    this.strategyEvent = null;
    this.enemyCampAttackTimer = 0;
    this.playerBaseAttackTimer = 0;
    this.lastCardPlayed = null;
    this.runCardsPlayedCount = 0;
    this.selectedUnit = null;
    this.selectedUnits = [];
    this.selectedUnitIds = new Set();
    this.selectionMode = 'none';
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
      maxStructureDurability: BALANCE.playerBase.maxStructureDurability ?? 49,
      attributes: {
        maxHealth: BALANCE.playerBase.maxHealth,
        recoveryRadius: BALANCE.playerBase.recoveryRadius,
        healthPerSecond: BALANCE.playerBase.healthPerSecond,
        durabilityPerSecond: BALANCE.playerBase.durabilityPerSecond
      }
    });

    this.world = createWorld(this.scene, this.worldConfig);
    this.worldConfig = this.world.config ?? this.worldConfig;
    const useResolvedRealtimeShadows = this.renderQuality.realtimeShadows && this.worldConfig.sky?.realtimeShadows !== false;
    this.renderer.shadowMap.enabled = useResolvedRealtimeShadows;
    this.renderer.shadowMap.autoUpdate = useResolvedRealtimeShadows;
    this.renderTuning = defaultRenderTuningForWorld(this.worldConfig);
    this.applyWorldRenderTone();
    this.applyRenderTuning();
    this.applyInitialCameraConfig();
    this.world.update?.(0, this.cameraTarget, this.camera, { forceStaticCulling: true });
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
      maxStructureDurability: BALANCE.enemyCamp.maxStructureDurability ?? 49,
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
      deck: this.levelSession.deck,
      startWithEmptyDrawPile: true
    });
    this.abilities = new AbilitySystem(this);
    this.lootDrops = new LootDropSystem(this);
    this.altars = new AltarSystem(this, this.world.config?.altars ?? this.worldConfig.altars);
    this.spawnWildlife();
    this.enemyCommander = new EnemyCommanderSystem(this);
    this.enemyEnchantment = new EnemyEnchantmentSystem(this);
    this.levelMechanics = new LevelMechanicSystem(this);
    this.selectionBox = createSelectionBoxElement();

    this.dom = {
      baseHealth: document.querySelector('#base-health'),
      waveLabel: document.querySelector('#wave-label'),
      silverCount: document.querySelector('#silver-count'),
      wavePreview: document.querySelector('#wave-preview'),
      battleTime: document.querySelector('#battle-time'),
      unitCount: document.querySelector('#unit-count'),
      selectedPanel: document.querySelector('#selected-panel'),
      selectedName: document.querySelector('#selected-name'),
      selectedStats: document.querySelector('#selected-stats'),
      selectedEnchants: document.querySelector('#selected-enchants'),
      settingsButton: document.querySelector('#game-settings-button'),
      commandDock: document.querySelector('#game-command-dock'),
      pauseOverlay: document.querySelector('#pause-overlay'),
      pauseReason: document.querySelector('#pause-reason'),
      pauseErrorCopyButton: document.querySelector('[data-pause-action="copy-error"]'),
      fpsMeter: document.querySelector('#fps-meter'),
      fpsLimitSlider: document.querySelector('#fps-limit-slider'),
      fpsLimitValue: document.querySelector('#fps-limit-value'),
      dprSlider: document.querySelector('#dpr-slider'),
      dprValue: document.querySelector('#dpr-value'),
      debug: document.querySelector('#debug-state'),
      perfPanel: document.querySelector('#perf-panel'),
      perfCanvas: document.querySelector('#perf-chart'),
      perfStatus: document.querySelector('#perf-panel-status'),
      perfStats: document.querySelector('#perf-stats'),
      mobileBoxSelectButton: document.querySelector('[data-command-action="box-select"]'),
      mobileBoxSelectHint: document.querySelector('#mobile-box-select-hint')
    };
    this.renderTuningUi = createRenderTuningPanel();
    if (this.dom.fpsMeter) this.dom.fpsMeter.hidden = false;
    this.strategyEventUi = createStrategyEventUi();
    this.runShopUi = createRunShopUi();
    this.bindRunShopUi();
    this.syncSettingsControls();
    this.syncRenderTuningPanel();
    this.syncPauseErrorControls();

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
    window.addEventListener('blur', () => {
      this.cancelCameraDrag();
      this.cancelTouchGesture();
      this.setMobileBoxSelectMode(false);
      this.activeTouchPointers.clear();
    }, { signal });
    canvas.addEventListener('wheel', (event) => this.onCanvasWheel(event), { passive: false, signal });
    window.addEventListener('pointermove', (event) => this.onWindowPointerMove(event), { signal });
    window.addEventListener('contextmenu', (event) => this.onGameContextMenu(event), { capture: true, signal });
    window.addEventListener('keydown', (event) => this.onKeyDown(event), { signal });
    window.addEventListener('resize', () => this.resize(), { signal });
    window.addEventListener('popstate', (event) => this.onReturnNavigation(event), { signal });
    this.strategyEventUi.root.addEventListener('click', (event) => this.onStrategyEventClick(event), { signal });
    this.strategyEventUi.root.addEventListener('pointerdown', stopUiPropagation, { signal });
    this.strategyEventUi.root.addEventListener('contextmenu', stopUiEvent, { signal });
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
    this.renderTuningUi.root.addEventListener('input', (event) => this.onRenderTuningInput(event), { signal });
    this.renderTuningUi.root.addEventListener('change', (event) => this.onRenderTuningInput(event), { signal });
    this.renderTuningUi.root.addEventListener('click', (event) => this.onRenderTuningPanelClick(event), { signal });
    this.renderTuningUi.root.addEventListener('pointerdown', stopUiPropagation, { signal });
    this.renderTuningUi.root.addEventListener('contextmenu', stopUiEvent, { signal });
    this.renderTuningUi.button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleRenderTuningPanel();
    }, { signal });
    this.renderTuningUi.button.addEventListener('pointerdown', stopUiPropagation, { signal });
    this.renderTuningUi.button.addEventListener('contextmenu', stopUiEvent, { signal });
    this.resize();
    document.body.classList.add('is-game-active');
    if (this.dom.settingsButton) this.dom.settingsButton.hidden = false;
    if (this.runShopUi?.toggle) this.runShopUi.toggle.hidden = false;
    this.armReturnNavigationTrap();
    prewarmUnitModelTemplates(unitModelPrewarmEntries());

    if (this.levelSession.debug) {
      this.summonUnits('raider', 1, this.playerBase.position.clone().add(new THREE.Vector3(-1.4, 0, -2.2)), 0.7, {
        select: false
      });
      this.summonUnits('archer', 1, this.playerBase.position.clone().add(new THREE.Vector3(1.4, 0, -2.2)), 0.7, {
        select: false
      });
      this.spawnEnemyWave(1, { orders: 'guard' });
    } else {
      this.updateWavePreview();
      this.awaitingOpeningReward = true;
      this.openStrategyEvent('opening-unit');
    }

    window.__VILLAGE_WAR_DEBUG__ = {
      game: this,
      snapshot: () => this.snapshot(),
      samplePixels: () => this.samplePixels()
    };
  }

  applyWorldRenderTone() {
    const sky = this.world?.config?.sky ?? this.worldConfig?.sky ?? {};
    const toneMapping = {
      aces: THREE.ACESFilmicToneMapping,
      neutral: THREE.NeutralToneMapping,
      reinhard: THREE.ReinhardToneMapping,
      linear: THREE.LinearToneMapping,
      none: THREE.NoToneMapping
    }[sky.toneMapping ?? 'none'] ?? THREE.NoToneMapping;
    this.renderer.toneMapping = toneMapping;
    this.renderer.toneMappingExposure = Number.isFinite(sky.exposure) ? sky.exposure : 1;
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
    this.setMobileBoxSelectMode(false);
    this.eventController.abort();
    this.cardSystem?.destroy?.();
    this.buildings?.destroy?.();
    this.lootDrops?.destroy?.();
    this.enemyCommander?.destroy?.();
    this.enemyEnchantment?.destroy?.();
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
    this.strategyEventUi?.root?.remove();
    this.runShopUi?.overlay?.remove();
    this.runShopUi?.toggle?.remove();
    document.body.classList.remove('is-game-active', 'is-game-paused', 'is-strategy-event-open', 'is-run-shop-open');
    if (this.dom.settingsButton) this.dom.settingsButton.hidden = true;
    if (this.runShopUi?.toggle) this.runShopUi.toggle.hidden = true;
    if (this.dom.fpsMeter) this.dom.fpsMeter.hidden = true;
    if (this.dom.pauseOverlay) this.dom.pauseOverlay.hidden = true;
    if (this.dom.perfPanel) this.dom.perfPanel.hidden = true;
    this.renderTuningUi?.root?.remove();
    this.renderTuningUi?.button?.remove();
    this.canvas.style.filter = '';
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
    const timeScale = this.levelTestMode ? this.debugTimeScale : 1;
    const dt = Math.min(rawDt, 0.05) * timeScale;
    this.updateFpsMeter(rawDt);
    if (this.paused) {
      this.updateCamera(0);
      this.world.update?.(0, this.cameraTarget, this.camera, { forceStaticCulling: true });
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
    const runStep = (name, action) => this.runFrameStep(name, action);
    const runPerfStep = (name, action) => runStep(name, () => this.measurePerf(name, action));
    if (perf) {
      runPerfStep('waveSpawn', () => this.updateWaveFlow());
      runPerfStep('card', () => this.cardSystem.update(dt));
      runPerfStep('abilities', () => this.abilities.update(dt));
      runPerfStep('playerBaseAttack', () => this.updatePlayerBaseAttack(dt));
      runPerfStep('enemyCampAttack', () => this.updateEnemyCampAttack(dt));
      runPerfStep('enemyCommander', () => this.enemyCommander.update(dt));
      runPerfStep('spiders', () => this.updateSpiderLifecycle(dt));
      runPerfStep('combat', () => this.unitLogic.update(dt));
      runPerfStep('buildings', () => this.buildings.update(dt));
      runPerfStep('recovery', () => this.recovery.update(dt));
      runPerfStep('altars', () => this.altars.update(dt));
      runPerfStep('mechanics', () => this.levelMechanics.update(dt));
      runPerfStep('areaEffects', () => this.areaEffects.update(dt));
      runPerfStep('loot', () => this.lootDrops.update(dt));
      runPerfStep('effects', () => this.effects.update(dt));
      runPerfStep('structure', () => this.updateStructureFeedback(dt));
      runPerfStep('camera', () => this.updateCamera(dt));
      runPerfStep('world', () => this.world.update?.(dt, this.cameraTarget, this.camera));
      runPerfStep('selection', () => this.updateSelection());
      runPerfStep('guardVisuals', () => this.updateGuardVisuals(dt));
      runPerfStep('unitVisuals', () => this.updateUnitVisuals(dt));
      runPerfStep('navDebug', () => this.updateNavDebug(dt));
      runPerfStep('hud', () => this.updateHud(dt));
      runPerfStep('render', () => this.renderer.render(this.scene, this.camera));
      perf.endFrame(this.createPerfCounters({ takeNavStats: true }));
      this.recordPerfSample();
      this.updatePerfPanel(dt);
    } else {
      runStep('waveSpawn', () => this.updateWaveFlow());
      runStep('card', () => this.cardSystem.update(dt));
      runStep('abilities', () => this.abilities.update(dt));
      runStep('playerBaseAttack', () => this.updatePlayerBaseAttack(dt));
      runStep('enemyCampAttack', () => this.updateEnemyCampAttack(dt));
      runStep('enemyCommander', () => this.enemyCommander.update(dt));
      runStep('spiders', () => this.updateSpiderLifecycle(dt));
      runStep('combat', () => this.unitLogic.update(dt));
      runStep('buildings', () => this.buildings.update(dt));
      runStep('recovery', () => this.recovery.update(dt));
      runStep('altars', () => this.altars.update(dt));
      runStep('mechanics', () => this.levelMechanics.update(dt));
      runStep('areaEffects', () => this.areaEffects.update(dt));
      runStep('loot', () => this.lootDrops.update(dt));
      runStep('effects', () => this.effects.update(dt));
      runStep('structure', () => this.updateStructureFeedback(dt));
      runStep('camera', () => this.updateCamera(dt));
      runStep('world', () => this.world.update?.(dt, this.cameraTarget, this.camera));
      runStep('selection', () => this.updateSelection());
      runStep('guardVisuals', () => this.updateGuardVisuals(dt));
      runStep('unitVisuals', () => this.updateUnitVisuals(dt));
      runStep('navDebug', () => this.updateNavDebug(dt));
      runStep('hud', () => this.updateHud(dt));
      runStep('render', () => this.renderer.render(this.scene, this.camera));
    }
    this.checkLevelEnd();
  }

  updateWaveFlow() {
    if (this.levelSession.debug || this.levelFinished || this.strategyEvent) return;
    if (!this.currentWave) {
      if (this.pendingWaveAdvance && !this.runShopOpen) {
        this.continueAfterStrategyFlow(false);
      }
      return;
    }
    if (this.hasActiveWaveEnemies()) return;
    this.completeCurrentWave();
  }

  hasActiveWaveEnemies() {
    const wave = this.currentWave;
    if (!wave) return false;

    const waveEnemies = this.enemyUnits.filter((unit) => (
      unit.alive && !unit.isWildlife && isUnitInWave(unit, wave)
    ));
    if (!waveEnemies.length) return false;

    if (wave.kind === 'boss' && !waveEnemies.some((unit) => unit.isBoss)) {
      this.clearWaveEnemyStragglers(waveEnemies);
      return false;
    }
    if (wave.kind === 'elite' && !waveEnemies.some((unit) => unit.isElite)) {
      this.clearWaveEnemyStragglers(waveEnemies);
      return false;
    }
    return true;
  }

  clearWaveEnemyStragglers(units) {
    units.forEach((unit) => this.removeEnemyUnitSilently(unit));
  }

  startNextWave() {
    if (this.levelFinished || this.levelSession.debug) return;
    const wave = this.waveSchedule[this.waveIndex];
    if (!wave) {
      this.finishLevel(true);
      return;
    }
    this.currentWave = wave;
    this.currentEnemyForce = wave;
    this.waveIndex += 1;
    this.wave = wave.index;
    this.enemyDirector.threatTier = wave.index;
    this.spawnEnemyWave(wave.index, {
      orders: 'attack',
      waveConfig: wave
    });
    this.updateWavePreview();
    this.updateHud(0);
  }

  completeCurrentWave() {
    const wave = this.currentWave;
    if (!wave || this.levelFinished) return;
    this.currentWave = null;
    this.currentEnemyForce = null;
    this.updateWavePreview();
    if (wave.kind === 'boss') {
      this.bossesDefeated += 1;
      this.grantWaveSilver(wave);
      if (this.bossesDefeated >= BOSS_WAVES_TO_WIN) {
        this.finishLevel(true);
        return;
      }
      this.pendingWaveAdvance = true;
      this.openRunShop({ freeReward: true });
      return;
    }
    this.grantWaveSilver(wave);
    this.pendingWaveAdvance = true;
    this.openStrategyEvent('wave-reward', { wave });
  }

  updateWavePreview() {
    const root = this.dom.wavePreview;
    if (!root) return;
    const startIndex = this.currentWave
      ? Math.max(0, this.currentWave.index - 1)
      : this.waveIndex;
    const previewCount = wavePreviewNodeCount();
    const waves = this.waveSchedule.slice(startIndex, startIndex + previewCount);
    if (!waves.length) {
      root.innerHTML = '';
      return;
    }
    root.innerHTML = `
      <div class="wave-preview-track" style="--wave-node-count: ${waves.length}">
        ${waves.map((wave) => {
          const isActive = this.currentWave === wave;
          return `
            <div class="wave-preview-node is-${cssKey(wave.kind)}${isActive ? ' is-active' : ''}">
              <span class="wave-node-dot">${escapeHtml(wave.index)}</span>
              <strong>${escapeHtml(waveKindShortLabel(wave))}</strong>
              ${waveAffixPreviewMarkup(wave)}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  enemyEnchantCost(unit, level = 1) {
    const costs = this.enemyDirectorConfig.enchantCosts ?? {};
    let cost = Number(costs.base ?? 2.4) + Math.max(0, Math.floor(level) - 1) * Number(costs.perLevel ?? 0.8);
    if (unit?.isBoss) cost *= Number(costs.bossMultiplier ?? 1.45);
    else if (unit?.isElite) cost *= Number(costs.eliteMultiplier ?? 1.2);
    return Math.max(0.5, cost);
  }

  grantEnemyEnergy(amount) {
    if (amount <= 0.001) return 0;
    this.enemyDirector.energy = Math.min(999, (this.enemyDirector.energy ?? 0) + amount);
    return amount;
  }

  spendEnemyEnergy(amount) {
    if (amount <= 0) return true;
    if ((this.enemyDirector.energy ?? 0) + 0.001 < amount) return false;
    this.enemyDirector.energy = Math.max(0, this.enemyDirector.energy - amount);
    return true;
  }

  enemyEnergyAvailableForEnchant(unit = null) {
    if (unit?.isBoss || unit?.isElite) return this.enemyDirector.energy ?? 0;
    const reserve = Math.max(0, Number(this.enemyDirectorConfig.spawnReserveEnergy ?? 4.5));
    return Math.max(0, (this.enemyDirector.energy ?? 0) - reserve);
  }

  updateStrategyPreview() {
    this.updateWavePreview();
  }

  spawnEnemyForce(force) {
    if (!force) return;
    const orders = force.kind === 'normal-squad' ? 'mixed' : 'attack';
    this.spawnEnemyWave(force.threatTier, { orders, waveConfig: force });
  }

  queueStrategyReward(type, options = {}) {
    if (this.levelFinished || this.levelSession.debug) return false;
    this.pendingStrategyRewards.push({ type, options });
    return this.openNextStrategyReward();
  }

  openNextStrategyReward() {
    if (this.levelFinished || this.strategyEvent) return false;
    const next = this.pendingStrategyRewards.shift();
    if (!next) return false;
    return this.openStrategyEvent(next.type, next.options);
  }

  finishStrategyReward() {
    const shouldStartFirstWave = this.awaitingOpeningReward;
    this.closeStrategyEvent();
    this.continueAfterStrategyFlow(shouldStartFirstWave);
  }

  continueAfterStrategyFlow(shouldStartFirstWave = false) {
    if (this.openNextStrategyReward()) return;
    if (shouldStartFirstWave) {
      this.awaitingOpeningReward = false;
      this.cardSystem?.drawToFullHand?.({ animate: true });
      this.updateWavePreview();
      this.startNextWave();
      return;
    }
    if (this.pendingWaveAdvance) {
      this.pendingWaveAdvance = false;
      this.updateWavePreview();
      this.startNextWave();
    }
  }

  shopPrice(category) {
    const categoryMeta = RUN_SHOP_CATEGORIES.find((entry) => entry.key === category);
    if (Number.isFinite(categoryMeta?.fixedPrice)) {
      return Math.max(0, Number(categoryMeta.fixedPrice));
    }
    let price = Math.max(0, Number(this.shopPrices?.[category] ?? RUN_SHOP_BASE_PRICE));
    if (category === 'copy' || category === 'remove') {
      price *= 2;
    }
    return price;
  }

  shopPriceIncrement() {
    return Math.max(0, Number(BALANCE.runCurrency?.shop?.priceIncrement ?? RUN_SHOP_PRICE_INCREMENT));
  }

  canRunShopCategory(category) {
    if (category === 'copy' || category === 'remove' || category === 'upgrade') {
      if (!this.runShopOwnedCards().length) {
        return { ok: false, reason: '牌组中没有可操作的卡牌' };
      }
    }
    if (category === 'energy') {
      const maxEnergy = Number(BALANCE.playerEnergy?.max) || 12;
      if ((this.cardSystem?.energy ?? 0) + 0.001 >= maxEnergy) {
        return { ok: false, reason: '能量已满' };
      }
    }
    if (category === 'attribute' && !this.buildAttributeUpgradeChoicePool().length) {
      return { ok: false, reason: '暂无可购强化' };
    }
    if (category === 'trait' && !this.buildTraitUpgradeChoicePool().length) {
      return { ok: false, reason: '专精已满' };
    }
    if (category === 'card' && !this.selectedCardPool({ allowAllFallback: true }).length) {
      return { ok: false, reason: '牌池为空' };
    }
    if (category === 'temporary') {
      const options = STRATEGY_REWARD_OPTION_DEFINITIONS
        .filter((option) => option.action === 'grant-temporary-card' && option.temporaryCard);
      if (!options.length) return { ok: false, reason: '暂无咒印' };
    }
    return { ok: true, reason: '' };
  }

  bindRunShopUi() {
    const ui = this.runShopUi;
    if (!ui?.overlay) return;
    if (ui.overlay === this.runShopUiBoundOverlay) return;
    this.runShopUiBoundOverlay = ui.overlay;
    const signal = this.eventController.signal;
    ui.overlay.addEventListener('click', (event) => this.onRunShopClick(event), { signal });
    ui.root?.addEventListener('click', (event) => this.onRunShopClick(event), { signal });
    ui.overlay.addEventListener('pointerdown', stopUiPropagation, { signal });
    ui.root?.addEventListener('pointerdown', stopUiPropagation, { signal });
    ui.overlay.addEventListener('contextmenu', stopUiEvent, { signal });
    ui.root?.addEventListener('contextmenu', stopUiEvent, { signal });
    ui.toggle?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleRunShop();
    }, { signal });
    ui.toggle?.addEventListener('pointerdown', stopUiPropagation, { signal });
  }

  toggleRunShop() {
    if (this.levelFinished || this.levelSession.debug) return;
    if (this.strategyEvent) return;
    if (this.runShopFreeReward) {
      if (this.runShopOpen) this.closeRunShop({ force: true });
      return;
    }
    if (this.runShopOpen) {
      this.closeRunShop();
      return;
    }
    this.openRunShop();
  }

  openRunShop(options = {}) {
    this.runShopUi = ensureRunShopUi(this.runShopUi);
    this.bindRunShopUi();
    if (this.strategyEventUi?.root) {
      this.strategyEventUi.root.hidden = true;
    }
    this.runShopOpen = true;
    this.runShopFreeReward = options.freeReward === true;
    this.runShopActiveCategory = null;
    this.runShopChoices = [];
    if (this.runShopFreeReward) {
      this.runShopPendingOffers = {};
    }
    if (this.runShopUi.overlay) {
      this.runShopUi.overlay.hidden = false;
      this.runShopUi.overlay.removeAttribute('hidden');
    }
    this.runShopUi.toggle?.classList.add('is-active');
    this.runShopUi.root?.classList.toggle('is-free-reward', this.runShopFreeReward);
    document.body.classList.add('is-run-shop-open');
    if (!this.paused) {
      this.runShopCausedPause = true;
      this.paused = true;
      this.cancelCameraDrag();
      this.cancelSelectionDrag();
      document.body.classList.add('is-game-paused');
      this.clock.getDelta();
    } else {
      this.runShopCausedPause = false;
    }
    if (this.runShopFreeReward) {
      this.cardSystem?.setHint?.('Boss 战利：请选择一项免费军需奖励', 'boss-shop');
    } else {
      this.cardSystem?.setHint?.('军需铺已打开，按 B 或 Esc 关闭', 'run-shop');
    }
    this.renderRunShop();
    this.runShopUi.root?.focus?.();
  }

  closeRunShop(options = {}) {
    if (this.runShopFreeReward && !options.force && !options.afterFreeReward) {
      return;
    }
    const wasFreeReward = this.runShopFreeReward;
    const causedPause = this.runShopCausedPause;
    this.runShopOpen = false;
    this.runShopFreeReward = false;
    this.runShopActiveCategory = null;
    this.runShopChoices = [];
    if (this.runShopUi?.overlay) {
      this.runShopUi.overlay.hidden = true;
      this.runShopUi.overlay.setAttribute('hidden', '');
    }
    if (this.runShopUi?.choices) this.runShopUi.choices.hidden = true;
    this.runShopUi?.root?.classList.remove('is-free-reward');
    this.runShopUi?.toggle?.classList.remove('is-active');
    document.body.classList.remove('is-run-shop-open');
    this.runShopCausedPause = false;
    if (causedPause || (this.paused && !this.strategyEvent && this.dom.pauseOverlay?.hidden !== false)) {
      this.paused = false;
      document.body.classList.remove('is-game-paused');
      if (this.dom.pauseOverlay) this.dom.pauseOverlay.hidden = true;
      this.clock.getDelta();
    }
    if (wasFreeReward || options.afterFreeReward) {
      if (this.paused) {
        this.paused = false;
        document.body.classList.remove('is-game-paused');
        this.clock.getDelta();
      }
      this.continueAfterStrategyFlow(false);
    }
  }

  clearRunShopSelection() {
    this.runShopActiveCategory = null;
    this.runShopChoices = [];
    if (this.runShopUi?.choices) this.runShopUi.choices.hidden = true;
    this.renderRunShop();
  }

  selectRunShopCategory(category) {
    if (category === 'energy') {
      this.purchaseRunShopEnergy();
      return;
    }
    const availability = this.canRunShopCategory(category);
    if (!availability.ok) return;
    const isFree = this.runShopFreeReward;
    const price = this.shopPrice(category);
    if (!isFree && this.silver + 0.001 < price) {
      this.cardSystem?.setHint?.('银币不足', 'run-shop');
      return;
    }
    const categoryMeta = RUN_SHOP_CATEGORIES.find((entry) => entry.key === category);
    let choices = categoryMeta?.picker ? null : this.runShopPendingOffers[category];
    if (!choices?.length) {
      choices = this.createShopChoicesForCategory(category);
      if (!choices.length) return;
      if (!categoryMeta?.picker) {
        choices = choices.slice(0, STRATEGY_CHOICE_COUNT);
        this.runShopPendingOffers[category] = choices;
      }
    }
    this.runShopActiveCategory = category;
    this.runShopChoices = choices;
    if (this.runShopUi?.choices) this.runShopUi.choices.hidden = false;
    this.renderRunShop();
  }

  completeRunShopPurchase(choice) {
    const category = this.runShopActiveCategory;
    if (!category || !choice) return false;
    const isFree = this.runShopFreeReward;
    const price = this.shopPrice(category);
    if (!isFree && this.silver + 0.001 < price) {
      this.cardSystem?.setHint?.('银币不足', 'run-shop');
      return false;
    }
    if (!this.applyStrategyChoice(choice)) {
      this.cardSystem?.setHint?.('购买失败，请重试', 'run-shop');
      return false;
    }
    if (!isFree) {
      this.silver = Math.max(0, this.silver - price);
      if (category !== 'energy') {
        this.shopPrices[category] = price + this.shopPriceIncrement();
        delete this.runShopPendingOffers[category];
      }
    } else {
      delete this.runShopPendingOffers[category];
    }
    this.cardSystem?.setHint?.(
      `${choice.title ?? '商品'} 已购入${isFree ? '' : `，-${formatSilverAmount(price)} 银币`}`,
      'run-shop'
    );
    this.runShopActiveCategory = null;
    this.runShopChoices = [];
    if (this.runShopUi?.choices) this.runShopUi.choices.hidden = true;
    this.updateHud(0);
    if (isFree) {
      this.closeRunShop({ afterFreeReward: true });
      return true;
    }
    this.renderRunShop();
    return true;
  }

  purchaseRunShopEnergy() {
    const isFree = this.runShopFreeReward;
    const price = this.shopPrice('energy');
    if (!isFree && this.silver + 0.001 < price) return false;
    const gained = this.cardSystem?.addEnergy?.(1) ?? 0;
    if (gained <= 0) return false;
    if (!isFree) {
      this.silver = Math.max(0, this.silver - price);
    } else {
      this.closeRunShop({ afterFreeReward: true });
    }
    this.updateHud(0);
    if (!isFree) this.renderRunShop();
    return true;
  }

  renderRunShop() {
    if (!this.runShopOpen || !this.runShopUi?.root) return;
    if (this.runShopUi.silver) {
      this.runShopUi.silver.textContent = formatSilverAmount(this.silver);
    }
    if (this.runShopActiveCategory && this.runShopChoices.length) {
      const categoryMeta = RUN_SHOP_CATEGORIES.find((entry) => entry.key === this.runShopActiveCategory);
      const isPicker = Boolean(categoryMeta?.picker);
      const isCatalogPicker = Boolean(categoryMeta?.catalogPicker);
      const useCardFaceGrid = isPicker || isCatalogPicker
        || this.runShopActiveCategory === 'card'
        || this.runShopActiveCategory === 'temporary';
      const useHorizontalRow = useCardFaceGrid && !isCatalogPicker;
      this.runShopUi.root.classList.add('is-detail');
      if (this.runShopUi.kicker) {
        this.runShopUi.kicker.textContent = this.runShopFreeReward
          ? `Boss 战利 #${this.bossesDefeated} · 免费一次`
          : isCatalogPicker
            ? '军需铺 · 已有卡牌 · 选定后立即购买'
            : '军需铺 · 选定后立即购买';
      }
      if (this.runShopUi.title) this.runShopUi.title.textContent = categoryMeta?.title ?? '选择商品';
      if (this.runShopUi.services) this.runShopUi.services.hidden = true;
      if (this.runShopUi.choices) this.runShopUi.choices.hidden = false;
      this.runShopUi.choiceList?.classList.toggle('is-card-picker', useCardFaceGrid);
      this.runShopUi.choiceList?.classList.toggle('is-catalog-picker', isCatalogPicker);
      this.runShopUi.choiceList?.classList.toggle('is-horizontal-row', useHorizontalRow);
      if (this.runShopUi.choiceList) {
        this.runShopUi.choiceList.innerHTML = this.runShopChoices
          .map((choice, index) => runShopChoiceMarkup(choice, index, { game: this }))
          .join('');
        fitStrategyRewardCards(this.runShopUi.choiceList);
      }
      if (this.runShopUi.skip) this.runShopUi.skip.hidden = true;
      return;
    }
    this.runShopUi.root.classList.remove('is-detail');
    if (this.runShopUi.kicker) {
      this.runShopUi.kicker.textContent = this.runShopFreeReward
        ? `Boss 战利 #${this.bossesDefeated} · 免费一次`
        : '营地军需 · B';
    }
    if (this.runShopUi.title) {
      this.runShopUi.title.textContent = this.runShopFreeReward ? '免费军需铺' : '军需铺';
    }
    if (this.runShopUi.services) {
      this.runShopUi.services.hidden = false;
      this.runShopUi.services.innerHTML = RUN_SHOP_CATEGORIES
        .map((category) => runShopServiceMarkup(category, this))
        .join('');
    }
    if (this.runShopUi.skip) {
      this.runShopUi.skip.hidden = !this.runShopFreeReward;
    }
    this.runShopUi.choiceList?.classList.remove('is-card-picker', 'is-catalog-picker', 'is-horizontal-row');
    if (this.runShopUi.choices) this.runShopUi.choices.hidden = true;
    if (this.runShopUi.choiceList) this.runShopUi.choiceList.innerHTML = '';
  }

  onRunShopClick(event) {
    if (event.target === this.runShopUi.overlay) {
      if (!this.runShopFreeReward) this.closeRunShop();
      return;
    }
    const closeButton = event.target.closest('#run-shop-close');
    if (closeButton) {
      event.preventDefault();
      if (!this.runShopFreeReward) this.closeRunShop();
      return;
    }
    const backButton = event.target.closest('#run-shop-back');
    if (backButton) {
      event.preventDefault();
      this.clearRunShopSelection();
      return;
    }
    const skipButton = event.target.closest('#run-shop-skip');
    if (skipButton) {
      event.preventDefault();
      if (this.runShopFreeReward) this.closeRunShop({ force: true });
      return;
    }
    const serviceButton = event.target.closest('[data-run-shop-category]');
    if (serviceButton && !serviceButton.disabled) {
      event.preventDefault();
      this.selectRunShopCategory(serviceButton.dataset.runShopCategory);
      return;
    }
    const choiceButton = event.target.closest('[data-run-shop-choice-index]');
    if (choiceButton && !choiceButton.disabled) {
      event.preventDefault();
      const index = Number(choiceButton.dataset.runShopChoiceIndex);
      const choice = this.runShopChoices[index];
      if (!choice || choice.disabled) return;
      this.completeRunShopPurchase(choice);
    }
  }

  grantSilver(amount, position = null) {
    if (amount <= 0.001) return 0;
    const gained = amount * SILVER_GAIN_MULTIPLIER;
    if (gained <= 0.001) return 0;
    this.silver += gained;
    if (position && this.effects?.spawnEnergyNumber) {
      this.effects.spawnEnergyNumber(position, gained, {
        text: `+${formatSilverAmount(gained)} 银币`,
        color: '#f6e7a8',
        stroke: '#4a3818',
        height: 2.45,
        duration: 0.88,
        fontSize: 82
      });
    }
    this.updateHud(0);
    if (this.runShopOpen) this.renderRunShop();
    return gained;
  }

  grantWaveSilver(wave) {
    if (!wave) return 0;
    const rewards = BALANCE.runCurrency ?? {};
    let amount = Number(rewards.waveNormal) || 3;
    if (wave.kind === 'elite') amount = Number(rewards.waveElite) || 6;
    return this.grantSilver(amount, this.playerBase?.position);
  }

  grantKillSilver(unit) {
    if (!unit || unit.team !== TEAMS.ENEMY || unit.isSilentRemoval) return 0;
    const rewards = BALANCE.runCurrency?.killRewards ?? {};
    let amount = Number(rewards.normal) || 0.35;
    if (unit.isBoss) amount = Number(rewards.boss) || 3.5;
    else if (unit.isElite) amount = Number(rewards.elite) || 1.1;
    else if (unit.isWildlife) amount = Number(rewards.wildlife) || 0.1;
    const gained = this.grantSilver(amount, unit.position);
    const pouchStacks = this.abilities?.getStacks?.('lootPouch') ?? 0;
    if (pouchStacks > 0) {
      this.silver += pouchStacks;
      if (unit.position && this.effects?.spawnEnergyNumber) {
        this.effects.spawnEnergyNumber(unit.position, pouchStacks, {
          text: `+${formatSilverAmount(pouchStacks)} 银币`,
          color: '#f6e7a8',
          stroke: '#4a3818',
          height: 2.2,
          duration: 0.82,
          fontSize: 76
        });
      }
      this.updateHud(0);
      if (this.runShopOpen) this.renderRunShop();
      return gained + pouchStacks;
    }
    return gained;
  }

  getSpellAreaRadiusBonus() {
    const stacks = this.abilities?.getStacks?.('tacticalMaster') ?? 0;
    return 1 + 0.5 * Math.max(0, stacks);
  }

  scaleSpellAreaRadius(radius) {
    return Math.max(0.5, radius * this.getSpellAreaRadiusBonus());
  }

  createShopChoicesForCategory(category, wave = null) {
    if (category === 'card') {
      return this.weightedCardChoices({
        pool: this.selectedCardPool({ allowAllFallback: true, excludeKinds: ['ability'] }),
        action: 'add-card',
        actionLabel: '获得卡牌',
        wave
      });
    }
    if (category === 'attribute') {
      return this.createAttributeUpgradeChoices();
    }
    if (category === 'trait') {
      return this.createTraitUpgradeChoices();
    }
    if (category === 'copy') {
      return this.createRunShopOwnedPickerChoices('copy-card', '复制卡牌', '复制一张加入牌组。');
    }
    if (category === 'remove') {
      return this.createRunShopOwnedPickerChoices('remove-card', '移除卡牌', '移出本局全部同名卡牌。');
    }
    if (category === 'upgrade') {
      return this.createRunShopOwnedPickerChoices('upgrade-card', '升级卡牌', '该牌及同名牌等级 +1。');
    }
    if (category === 'temporary') {
      const options = STRATEGY_REWARD_OPTION_DEFINITIONS
        .filter((option) => option.action === 'grant-temporary-card' && option.temporaryCard);
      if (!options.length) return [];
      return pickRandomItems(options, Math.min(STRATEGY_CHOICE_COUNT, options.length)).map((option) => ({
        action: 'grant-temporary-card',
        actionLabel: '获得临时牌',
        title: option.title,
        description: option.description,
        card: option.temporaryCard,
        temporaryCard: option.temporaryCard
      }));
    }
    return [];
  }

  openStrategyEvent(type, options = {}) {
    if (this.levelFinished || this.levelSession.debug) return;
    let event = this.createStrategyEvent(type, options);
    if (!event?.choices?.length && type !== 'card-choice') {
      event = this.createStrategyEvent('card-choice', {
        ...options,
        fallbackFrom: type
      });
    }
    if (!event?.choices?.length) {
      event = this.createFallbackCardChoiceEvent(options);
    }
    if (!event?.choices?.length) {
      this.continueAfterStrategyFlow(false);
      return false;
    }
    this.strategyEvent = event;
    this.paused = true;
    this.cancelCameraDrag();
    this.cancelSelectionDrag();
    document.body.classList.add('is-game-paused', 'is-strategy-event-open');
    this.strategyEventUi.root.hidden = false;
    this.renderStrategyEvent();
    this.clock.getDelta();
    return true;
  }

  closeStrategyEvent() {
    this.strategyEvent = null;
    this.strategyEventUi.root.hidden = true;
    this.strategyEventUi.choices.innerHTML = '';
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
    this.paused = false;
    this.clock.getDelta();
  }

  createStrategyEvent(type, options = {}) {
    if (type === 'opening-unit') {
      const summonPool = this.selectedCardPool({ kind: 'summon' });
      return {
        type,
        kicker: '开局准备',
        title: '选择初始单位',
        summary: '从出战单位牌中三选一，加入抽牌堆后开始第一波。',
        choices: this.openingUnitChoices({
          pool: summonPool,
          action: 'add-card',
          actionLabel: '获得单位'
        })
      };
    }
    if (type === 'elite-reward') {
      const force = options.force ?? this.currentEnemyForce;
      const forceThreat = Number(force?.threat ?? this.enemyDirector.threat);
      const threatLabel = Number.isFinite(forceThreat)
        ? forceThreat.toFixed(1)
        : this.enemyDirector.threat.toFixed(1);
      return {
        type,
        kicker: `精英战利品 / 威胁 ${threatLabel}`,
        title: '选择精英奖励',
        summary: '精英被击败后获得一次局内强化，三选一可直接获得新卡、复制、专精或临时牌。',
        choices: this.createWaveRewardOptionChoices(force)
      };
    }
    if (type === 'altar-reward') {
      const altarName = options.altar?.name ?? '祭坛';
      return {
        type,
        kicker: `首次占领 ${altarName}`,
        title: '选择能力卡',
        summary: '首次占领祭坛可从能力卡中三选一，立即获得对应能力。重复占领不会再次触发。',
        choices: this.createAltarAbilityRewardChoices()
      };
    }
    if (type === 'wave-reward') {
      const eliteNote = options.wave?.kind === 'elite'
        ? '本波为精英：已额外获得银币。'
        : '';
      return {
        type,
        wave: options.wave ?? null,
        kicker: waveEventKicker(options.wave),
        title: options.wave?.kind === 'elite' ? '精英波奖励' : '选择卡牌奖励',
        summary: eliteNote || '从出战牌组随机出现 3 张卡牌，选一张加入抽牌堆。',
        choices: this.createCardWaveRewardChoices(options.wave)
      };
    }
    if (type === 'card-kind-choice') {
      return {
        type,
        kicker: waveEventKicker(options.wave),
        title: options.title ?? '选择一张新卡',
        summary: options.summary ?? '从本局出战牌组中选择一张加入抽牌堆。',
        choices: this.randomCardChoices({
          pool: this.selectedCardPool({ kind: options.cardKind }),
          action: 'add-card',
          actionLabel: '加入牌堆'
        })
      };
    }
    if (type === 'existing-card-copy') {
      return {
        type,
        kicker: waveEventKicker(options.wave),
        title: '复制一张已有卡',
        summary: '复制一张同等级卡牌并加入抽牌堆。',
        choices: this.createExistingCardCopyChoices()
      };
    }
    if (type === 'card-maintenance') {
      return {
        type,
        kicker: waveEventKicker(options.wave),
        title: '选择属性强化',
        summary: '三选一：全队属性训练，立即对现有与后续单位生效，可重复叠加。',
        choices: this.createAttributeUpgradeChoices()
      };
    }
    if (type === 'unit-upgrade') {
      return {
        type,
        kicker: '兵种特性',
        title: '选择特性强化',
        summary: '三选一：从本局出战兵种中随机出现特性专精，每种仅可获得一次。',
        choices: this.createTraitUpgradeChoices()
      };
    }
    if (type === 'card-copy') {
      return {
        type,
        kicker: waveEventKicker(options.wave),
        title: '复制一张卡牌',
        summary: '复制会保留等级，并加入抽牌堆。',
        choices: this.createCopyChoices()
      };
    }
    const isOpening = options.opening === true;
    const isOpeningSupport = options.openingSupport === true;
    return {
      type: 'card-choice',
      kicker: isOpening || isOpeningSupport ? '开局准备' : waveEventKicker(options.wave),
      title: isOpeningSupport ? '选择一张支援卡' : isOpening ? '选择第一张卡' : '选择一张新卡',
      summary: isOpeningSupport
        ? '再从本局出战牌组中选择一张卡，降低前期压力。'
        : isOpening
          ? '开局抽牌堆为空，从本局出战牌组中选择第一张牌。'
          : options.fallbackFrom
            ? '当前事件没有可用目标，改为选择一张新卡作为本次奖励。'
            : '候选牌只来自本局出战牌组，会作为新实例加入抽牌堆。',
      choices: isOpeningSupport
        ? this.randomCardChoices({
            pool: this.selectedCardPool(),
            action: 'add-card',
            actionLabel: '加入牌堆'
          })
        : this.weightedCardChoices({
            pool: this.selectedCardPool(),
            action: 'add-card',
            actionLabel: '加入牌堆',
            wave: this.nextUpcomingWave()
          })
    };
  }

  createFallbackCardChoiceEvent(options = {}) {
    return {
      type: 'card-choice',
      kicker: waveEventKicker(options.wave),
      title: '选择一张新卡',
      summary: '当前奖励事件没有可用目标，改为从全部可用卡牌中选择一张。',
      choices: this.weightedCardChoices({
        pool: this.selectedCardPool({ allowAllFallback: true }),
        action: 'add-card',
        actionLabel: '加入牌堆',
        wave: this.nextUpcomingWave()
      })
    };
  }

  selectedCardPool(options = {}) {
    const seen = new Set();
    const hasSessionDeck = Array.isArray(this.levelSession.deck);
    const sourceDeck = hasSessionDeck ? this.levelSession.deck : CARD_DEFINITIONS;
    const source = sourceDeck
      .filter((card) => !card.lootOnly)
      .filter((card) => !options.kind || card.kind === options.kind)
      .filter((card) => !options.excludeKinds?.includes(card.kind))
      .filter((card) => {
        if (!card?.id || seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
      });
    if (source.length) {
      return source.map((card) => ({
        ...(this.cardSystem?.applyRuntimeCardLevel?.(card) ?? card),
        instanceId: undefined
      }));
    }
    if (hasSessionDeck && options.allowAllFallback !== true) return [];
    return CARD_DEFINITIONS
      .filter((card) => !card.lootOnly)
      .filter((card) => !options.kind || card.kind === options.kind)
      .filter((card) => !options.excludeKinds?.includes(card.kind))
      .map((card) => this.cardSystem?.applyRuntimeCardLevel?.(card) ?? card);
  }

  randomCardChoices({ pool, action, actionLabel }) {
    return pickRandomItems(pool, STRATEGY_CHOICE_COUNT).map((card) => ({
      action,
      actionLabel,
      card,
      title: card.name,
      description: card.summary
    }));
  }

  openingUnitChoices({ pool, action, actionLabel }) {
    const combatPool = pool.filter((card) => isOpeningCombatSummon(card));
    const sourcePool = combatPool.length >= STRATEGY_CHOICE_COUNT ? combatPool : pool;
    return pickRandomItems(sourcePool, STRATEGY_CHOICE_COUNT).map((card) => ({
      action,
      actionLabel,
      card,
      title: card.name,
      description: card.summary
    }));
  }

  weightedCardChoices({ pool, action, actionLabel, wave = null }) {
    return pickWeightedCardItems(pool, STRATEGY_CHOICE_COUNT, (card) => (
      cardChoiceWeightForWave(card, wave)
    )).map((card) => ({
      action,
      actionLabel,
      card,
      title: card.name,
      description: card.summary
    }));
  }

  createCardWaveRewardChoices(wave = null) {
    return this.weightedCardChoices({
      pool: this.selectedCardPool({ allowAllFallback: true }),
      action: 'add-card',
      actionLabel: '获得卡牌',
      wave
    });
  }

  createWaveRewardOptionChoices(wave = null) {
    return this.createCardWaveRewardChoices(wave);
  }

  createAltarAbilityRewardChoices() {
    return this.randomCardChoices({
      pool: CARD_DEFINITIONS.filter((card) => card.kind === 'ability' && !card.lootOnly),
      action: 'acquire-ability',
      actionLabel: '获得能力'
    });
  }

  buildRuntimeUpgradeChoicePool() {
    return [
      ...this.buildAttributeUpgradeChoicePool(),
      ...this.buildTraitUpgradeChoicePool()
    ];
  }

  buildAttributeUpgradeChoicePool() {
    return UNIT_GENERIC_UPGRADES.map((upgrade) => this.createTeamGenericUpgradeChoice(upgrade));
  }

  buildTraitUpgradeChoicePool() {
    const choices = [];
    const ownedTypes = this.ownedUnitTypes();
    const deckTypes = this.deckUnitTypes();
    const orderedTypes = [...new Set([...ownedTypes, ...deckTypes])];
    orderedTypes.forEach((unitType) => {
      const owned = this.teamSpecialUpgrades.get(unitType) ?? new Set();
      (UNIT_SPECIAL_UPGRADES[unitType] ?? []).forEach((upgrade) => {
        if (owned.has(upgrade.id)) return;
        choices.push(this.createTeamSpecialUpgradeChoice(unitType, upgrade));
      });
    });
    return choices;
  }

  deckUnitTypes() {
    const types = new Set();
    this.selectedCardPool().forEach((card) => {
      if (card?.unitType) types.add(card.unitType);
    });
    this.cardSystem.allDeckCards().forEach((card) => {
      if (card?.unitType) types.add(card.unitType);
    });
    return [...types];
  }

  ownedUnitTypes() {
    const types = new Set();
    this.cardSystem?.allDeckCards?.().forEach((card) => {
      if (card?.unitType) types.add(card.unitType);
    });
    this.friendlyUnits?.forEach((unit) => {
      if (unit?.alive && !unit.isWildlife && unit.type) types.add(unit.type);
    });
    return types;
  }

  createTeamGenericUpgradeChoice(upgrade) {
    const stacks = this.teamGenericUpgradeCounts.get(upgrade.id) ?? 0;
    return {
      action: 'apply-team-upgrade',
      actionLabel: '全队强化',
      title: upgrade.name,
      description: upgrade.summary,
      upgrade,
      card: {
        id: `team-upgrade-${upgrade.id}`,
        name: upgrade.name,
        kind: 'tactic',
        label: '队',
        artKey: 'tacticUpgrade',
        summary: stacks > 0
          ? `${upgrade.summary}（已叠加 ${stacks} 次，立即对全队生效）`
          : `${upgrade.summary}（立即对全队与后续单位生效）`,
        energyCost: 0,
        color: '#9eeedb',
        level: stacks + 1
      }
    };
  }

  createTeamSpecialUpgradeChoice(unitType, upgrade) {
    const unitName = UNIT_DEFINITIONS[unitType]?.name ?? unitType;
    return {
      action: 'apply-team-special-upgrade',
      actionLabel: '兵种专精',
      title: `${unitName}·${upgrade.name}`,
      description: upgrade.summary,
      unitType,
      upgrade,
      card: {
        id: `team-special-${unitType}-${upgrade.id}`,
        name: `${unitName}·${upgrade.name}`,
        kind: 'ability',
        label: '专',
        artKey: unitType,
        summary: `所有${unitName}获得：${upgrade.summary}`,
        energyCost: 0,
        color: '#ffd166',
        level: 1
      }
    };
  }

  applyTeamGenericUpgrade(upgrade) {
    if (!upgrade?.id || upgrade.kind !== 'unit-generic') return false;
    const nextIndex = this.teamGenericUpgradeCounts.get(upgrade.id) ?? 0;
    this.teamGenericUpgradeCounts.set(upgrade.id, nextIndex + 1);
    this.friendlyUnits.forEach((unit) => {
      if (!unit.alive || unit.isWildlife) return;
      this.applyTeamGenericUpgradeLayerToUnit(unit, upgrade, nextIndex);
    });
    return true;
  }

  applyTeamSpecialUpgrade(unitType, upgrade) {
    if (!unitType || !upgrade?.id || upgrade.kind !== 'unit-special') return false;
    if (!this.teamSpecialUpgrades.has(unitType)) {
      this.teamSpecialUpgrades.set(unitType, new Set());
    }
    const owned = this.teamSpecialUpgrades.get(unitType);
    if (owned.has(upgrade.id)) return false;
    owned.add(upgrade.id);
    if (upgrade.supportModifiers && !this.teamSupportModifiersApplied.has(upgrade.id)) {
      const sample = this.friendlyUnits.find((unit) => unit.type === unitType && unit.alive);
      if (sample) applySupportUpgrade(sample, upgrade.supportModifiers);
      this.teamSupportModifiersApplied.add(upgrade.id);
    }
    this.friendlyUnits.forEach((unit) => {
      if (!unit.alive || unit.isWildlife || unit.type !== unitType) return;
      this.applyTeamSpecialUpgradeToUnit(unit, upgrade);
    });
    return true;
  }

  applyTeamGenericUpgradeLayerToUnit(unit, upgrade, index = 0) {
    const previousMaxHealth = unit.maxHealth;
    const modifiers = unitGenericUpgradeModifiers(unit, upgrade, index);
    if (!modifiers.length) return;
    unit.attributes.addModifiers(modifiers, `team:${upgrade.id}:${index}`);
    if (modifiersAffectHealthOrDurability(modifiers)) {
      syncUnitAfterMaxHealthModifiers(unit, previousMaxHealth);
    }
    unit.clampToAttributeCaps();
    unit.statusUiDirty = true;
  }

  applyTeamSpecialUpgradeToUnit(unit, upgrade) {
    unit.runtimeUpgradeIds = unit.runtimeUpgradeIds ?? new Set();
    unit.runtimeTraits = unit.runtimeTraits ?? new Set();
    if (unit.runtimeUpgradeIds.has(upgrade.id)) return;
    unit.runtimeUpgradeIds.add(upgrade.id);
    if (upgrade.trait) unit.runtimeTraits.add(upgrade.trait);
    if (upgrade.modifiers?.length) {
      const previousMaxHealth = unit.maxHealth;
      unit.attributes.addModifiers(upgrade.modifiers, `team:${upgrade.id}`);
      if (modifiersAffectHealthOrDurability(upgrade.modifiers)) {
        syncUnitAfterMaxHealthModifiers(unit, previousMaxHealth);
      }
    }
    unit.clampToAttributeCaps();
    unit.statusUiDirty = true;
  }

  applyTeamUpgradesToUnit(unit) {
    if (!unit || unit.isWildlife) return;
    unit.runtimeUpgradeIds = new Set();
    unit.runtimeTraits = new Set();
    this.teamGenericUpgradeCounts.forEach((count, upgradeId) => {
      const upgrade = UNIT_GENERIC_UPGRADES.find((entry) => entry.id === upgradeId);
      if (!upgrade) return;
      for (let index = 0; index < count; index += 1) {
        this.applyTeamGenericUpgradeLayerToUnit(unit, upgrade, index);
      }
    });
    const ownedSpecials = this.teamSpecialUpgrades.get(unit.type);
    if (!ownedSpecials?.size) return;
    ownedSpecials.forEach((upgradeId) => {
      const upgrade = runtimeUnitUpgradeDefinition(unit.type, upgradeId);
      if (!upgrade) return;
      this.applyTeamSpecialUpgradeToUnit(unit, upgrade);
    });
  }

  isWaveRewardOptionAvailable(option) {
    if (option.action === 'open-card-kind-choice') {
      return this.selectedCardPool({ kind: option.cardKind }).length > 0;
    }
    if (option.action === 'open-card-upgrade-choice' || option.action === 'open-card-copy-choice') {
      return this.uniqueRuntimeCards().length > 0;
    }
    return true;
  }

  nextUpcomingWave() {
    return this.waveSchedule[this.waveIndex] ?? this.currentWave ?? null;
  }

  createAttributeUpgradeChoices() {
    const pool = this.buildAttributeUpgradeChoicePool();
    if (!pool.length) {
      return this.createWaveRewardOptionChoices(this.nextUpcomingWave());
    }
    return pickRandomItems(pool, Math.min(STRATEGY_CHOICE_COUNT, pool.length));
  }

  createTraitUpgradeChoices() {
    const pool = this.buildTraitUpgradeChoicePool();
    if (!pool.length) {
      return this.createAttributeUpgradeChoices();
    }
    const ownedTypes = this.ownedUnitTypes();
    return pickWeightedCardItems(
      pool,
      Math.min(STRATEGY_CHOICE_COUNT, pool.length),
      (choice) => (ownedTypes.has(choice.unitType) ? 12 : 0.35)
    );
  }

  createMaintenanceChoices() {
    return this.createAttributeUpgradeChoices();
  }

  activeRunCardInstances() {
    return this.cardSystem?.activeRunCards?.() ?? [];
  }

  runShopOwnedCards() {
    return this.uniqueRuntimeCards();
  }

  createRunShopOwnedPickerChoices(action, actionLabel, descriptionSuffix) {
    return this.runShopOwnedCards().map((card) => {
      const inDeck = this.cardSystem?.countDeckCardsById?.(card.id) ?? 0;
      const location = cardRunLocationLabel(this, card);
      return {
        action,
        actionLabel,
        title: card.name,
        description: `${location} · 牌组 ×${inDeck} · Lv.${card.level ?? 1} · ${descriptionSuffix}`,
        card,
        targetCard: card
      };
    });
  }

  uniqueRuntimeCards() {
    const seen = new Set();
    return this.cardSystem.allDeckCards().filter((card) => {
      if (!card?.id || seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    }).sort((a, b) => cardSortKey(a).localeCompare(cardSortKey(b), 'zh-Hans-CN'));
  }

  createUnitUpgradeChoices() {
    return this.createTraitUpgradeChoices();
  }

  createCopyChoices() {
    const selectedIds = new Set(this.selectedCardPool().map((card) => card.id));
    const cards = this.cardSystem.allDeckCards().filter((card) => selectedIds.has(card.id));
    if (!cards.length) {
      return this.weightedCardChoices({
        pool: this.selectedCardPool({ allowAllFallback: true }),
        action: 'add-card',
        actionLabel: '加入牌堆',
        wave: this.nextUpcomingWave()
      });
    }
    return pickRandomItems(cards, STRATEGY_CHOICE_COUNT).map((card) => ({
      action: 'copy-card',
      actionLabel: '复制',
      title: `复制 ${card.name}`,
        description: '加入一张同等级复制牌。',
      card,
      targetCard: card
    }));
  }

  createExistingCardCopyChoices() {
    return pickRandomItems(this.uniqueRuntimeCards(), STRATEGY_CHOICE_COUNT).map((card) => ({
      action: 'copy-card',
      actionLabel: '复制',
      title: `复制 ${card.name}`,
        description: '加入一张同等级复制牌。',
      card,
      targetCard: card
    }));
  }

  renderStrategyEvent() {
    const event = this.strategyEvent;
    if (!event) return;
    event.choices = Array.isArray(event.choices) ? event.choices.filter(Boolean) : [];
    if (event.choices.length > STRATEGY_CHOICE_COUNT) {
      event.choices = event.choices.slice(0, STRATEGY_CHOICE_COUNT);
    }
    const typeMeta = strategyEventTypeMeta(event.type);
    this.strategyEventUi.root.dataset.eventType = typeMeta.key;
    this.strategyEventUi.root.setAttribute('aria-label', event.title ?? '选择奖励');
    if (this.strategyEventUi.kicker) {
      this.strategyEventUi.kicker.textContent = event.kicker ?? '';
      this.strategyEventUi.kicker.hidden = !event.kicker;
    }
    if (this.strategyEventUi.title) {
      this.strategyEventUi.title.textContent = event.title ?? '选择奖励';
    }
    if (this.strategyEventUi.summary) {
      this.strategyEventUi.summary.textContent = event.summary ?? '';
      this.strategyEventUi.summary.hidden = !event.summary;
    }
    this.strategyEventUi.choices.innerHTML = event.choices
      .map((choice, index) => strategyRewardMarkup(choice, index))
      .join('');
    this.renderStrategyEventActions(event);
  }

  getStrategyRewardRerollCost() {
    return STRATEGY_REWARD_REROLL_BASE_COST * (2 ** Math.max(0, this.strategyRewardRerollCount ?? 0));
  }

  rerollStrategyRewardChoices() {
    const event = this.strategyEvent;
    if (!event || event.type !== 'wave-reward') return false;
    const cost = this.getStrategyRewardRerollCost();
    if (this.silver + 0.001 < cost) return false;
    this.silver = Math.max(0, this.silver - cost);
    this.strategyRewardRerollCount = Math.max(0, (this.strategyRewardRerollCount ?? 0) + 1);
    event.choices = this.createCardWaveRewardChoices(event.wave);
    this.renderStrategyEvent();
    this.updateHud(0);
    return true;
  }

  skipStrategyReward() {
    if (!this.strategyEvent) return false;
    this.finishStrategyReward();
    return true;
  }

  renderStrategyEventActions(event) {
    const actions = this.strategyEventUi.actions;
    if (!actions) return;
    if (event?.type !== 'wave-reward') {
      actions.hidden = true;
      actions.innerHTML = '';
      return;
    }
    const rerollCost = this.getStrategyRewardRerollCost();
    const canAffordReroll = this.silver + 0.001 >= rerollCost;
    const rerollCount = Math.max(0, this.strategyRewardRerollCount ?? 0);
    actions.hidden = false;
    actions.innerHTML = `
      <button
        class="strategy-event-action is-reroll${canAffordReroll ? '' : ' is-disabled'}"
        type="button"
        data-strategy-action="reroll"
        ${canAffordReroll ? '' : 'disabled aria-disabled="true"'}
      >
        <span class="strategy-event-action-label">重新随机</span>
        <strong>${formatSilverAmount(rerollCost)} 银币</strong>
        <small>已刷新 ${rerollCount} 次，下次费用翻倍</small>
      </button>
      <button class="strategy-event-action is-skip" type="button" data-strategy-action="skip">
        <span class="strategy-event-action-label">放弃奖励</span>
        <strong>直接进入下一波</strong>
      </button>
    `;
  }

  onStrategyEventClick(event) {
    const actionButton = event.target.closest('[data-strategy-action]');
    if (actionButton && this.strategyEvent) {
      event.preventDefault();
      event.stopPropagation();
      const action = actionButton.dataset.strategyAction;
      if (action === 'reroll' && !actionButton.disabled) {
        this.rerollStrategyRewardChoices();
      } else if (action === 'skip') {
        this.skipStrategyReward();
      }
      return;
    }
    const button = event.target.closest('[data-strategy-choice-index]');
    if (!button || !this.strategyEvent) return;
    event.preventDefault();
    event.stopPropagation();
    const index = Number(button.dataset.strategyChoiceIndex);
    const choice = this.strategyEvent.choices[index];
    if (!choice || button.disabled) return;
    if (!this.applyStrategyChoice(choice)) return;
    this.finishStrategyReward();
  }

  applyStrategyChoice(choice) {
    let applied = false;
    if (choice.action === 'add-card') {
      const result = this.cardSystem.addCardToDrawPile(choice.card, {
        prefix: `event-${choice.card.id}-${Date.now()}`
      });
      applied = result.added;
    } else if (choice.action === 'upgrade-card') {
      applied = this.cardSystem.upgradeCardFamily(choice.targetCard ?? choice.card, 1);
    } else if (choice.action === 'apply-team-upgrade') {
      applied = this.applyTeamGenericUpgrade(choice.upgrade);
    } else if (choice.action === 'apply-team-special-upgrade') {
      applied = this.applyTeamSpecialUpgrade(choice.unitType, choice.upgrade);
    } else if (choice.action === 'apply-card-upgrade') {
      if (choice.upgrade?.kind === 'unit-special') {
        applied = this.applyTeamSpecialUpgrade(choice.targetCard?.unitType, choice.upgrade);
      } else {
        applied = this.applyTeamGenericUpgrade(choice.upgrade);
      }
    } else if (choice.action === 'copy-card') {
      const targetCard = choice.targetCard ?? choice.card;
      if (targetCard?.instanceId && this.cardSystem.allDeckCards().includes(targetCard)) {
        applied = this.cardSystem.copyCardInstance(targetCard, {
          prefix: `copy-${targetCard.id}-${Date.now()}`
        }).added;
      }
    } else if (choice.action === 'remove-card') {
      const targetCard = choice.targetCard ?? choice.card;
      applied = this.cardSystem.removeCardFamily(targetCard?.id);
    } else if (choice.action === 'grant-temporary-card') {
      applied = this.cardSystem.addTemporaryCard(choice.temporaryCard ?? choice.card, {
        prefix: `event-temporary-${choice.temporaryCard?.id ?? choice.card?.id}-${Date.now()}`,
        applyRuntimeLevelBonus: false,
        energyCost: 0
      }).added;
    } else if (choice.action === 'acquire-ability') {
      applied = this.cardEffects.resolve({
        card: choice.card,
        point: null,
        targetUnit: null,
        targetCard: null
      }) !== false;
    }
    if (!applied) return false;
    this.applyStrategyChoiceCost(choice);
    return true;
  }

  applyDirectCardUpgrade(card) {
    return this.cardSystem.applyRuntimeUpgrade(card, {
      id: `${card.id}:runtime-level:${Date.now()}`,
      kind: `${card.kind}-level`,
      name: runtimeUpgradeTitleForCard(card),
      summary: runtimeUpgradeSummaryForCard(card),
      levelBonus: 1
    });
  }

  applyStrategyChoiceCost(choice) {
    if (choice.baseDamagePercent > 0) {
      this.damagePlayerBase(this.playerBase.maxHealth * choice.baseDamagePercent);
    }
  }

  measurePerf(name, action) {
    const startedAt = performance.now();
    const result = action();
    this.perfTracker?.add(name, performance.now() - startedAt);
    return result;
  }

  runFrameStep(name, action) {
    const previousStep = this.currentFrameStep;
    this.currentFrameStep = name;
    try {
      return action();
    } catch (error) {
      this.handleRuntimeError(error, name);
      throw error;
    } finally {
      this.currentFrameStep = previousStep;
    }
  }

  animationFrame(time = performance.now()) {
    if (this.destroyed) return;
    if (this.shouldSkipFrame(time)) return;
    try {
      this.tick();
    } catch (error) {
      this.handleRuntimeError(error, this.currentFrameStep ?? 'frame');
      this.stop();
    }
  }

  handleRuntimeError(error, step = 'frame') {
    if (this.runtimeError) return;
    const message = error?.message ? String(error.message) : String(error);
    this.runtimeError = {
      step,
      message,
      stack: error?.stack ?? null,
      time: this.elapsedTime
    };
    window.__VILLAGE_WAR_DEBUG__ = {
      ...(window.__VILLAGE_WAR_DEBUG__ ?? {}),
      game: this,
      lastRuntimeError: this.runtimeError
    };
    console.error(`[VillageWar] runtime error in ${step}`, error);
    this.paused = true;
    document.body.classList.add('is-game-paused');
    if (this.dom.pauseReason) {
      this.dom.pauseReason.textContent = `运行错误：${step} / ${message}`;
    }
    if (this.dom.pauseOverlay) {
      this.dom.pauseOverlay.hidden = false;
    }
    this.syncPauseErrorControls();
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

  toggleRenderTuningPanel(force = null) {
    if (!this.renderTuningUi?.root) return;
    const shouldShow = force == null ? this.renderTuningUi.root.hidden : Boolean(force);
    this.renderTuningUi.root.hidden = !shouldShow;
    this.renderTuningUi.button?.setAttribute('aria-pressed', shouldShow ? 'true' : 'false');
    if (!this.renderTuningUi.root.hidden) {
      this.syncRenderTuningPanel();
    }
  }

  onRenderTuningInput(event) {
    const field = event.target?.dataset?.renderTuning;
    if (!field) return;
    if (event.type === 'change' && event.target?.type === 'range') return;
    event.stopPropagation();
    const next = { ...this.renderTuning };
    if (event.target.type === 'color' || event.target.tagName?.toLowerCase() === 'select') {
      next[field] = event.target.value;
    } else {
      next[field] = Number(event.target.value);
    }
    this.renderTuning = normalizeRenderTuning(next, this.worldConfig);
    this.applyRenderTuning();
    this.syncRenderTuningPanel();
  }

  onRenderTuningPanelClick(event) {
    const action = event.target?.closest?.('[data-render-action]')?.dataset?.renderAction;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'reset') {
      this.renderTuning = defaultRenderTuningForWorld(this.worldConfig);
      this.applyRenderTuning();
      this.syncRenderTuningPanel();
      return;
    }
    if (action === 'copy') {
      this.copyRenderTuningParameters();
      return;
    }
  }

  async copyRenderTuningParameters() {
    const text = renderTuningExportText(this.renderTuning, this.worldConfig);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      this.setRenderTuningCopyStatus('已复制');
    } catch {
      this.setRenderTuningCopyStatus('复制失败');
    }
    console.info('[VillageWar] Render tuning parameters', this.renderTuning);
  }

  setRenderTuningCopyStatus(text) {
    const button = this.renderTuningUi?.copyButton;
    if (!button) return;
    button.textContent = text;
    window.clearTimeout(this.renderTuningUi.copyStatusTimer);
    this.renderTuningUi.copyStatusTimer = window.setTimeout(() => {
      button.textContent = '复制参数';
    }, 1200);
  }

  applyRenderTuning() {
    if (!this.renderTuning || !this.renderer) return;
    const settings = normalizeRenderTuning(this.renderTuning, this.worldConfig);
    this.renderTuning = settings;
    const toneMapping = {
      aces: THREE.ACESFilmicToneMapping,
      neutral: THREE.NeutralToneMapping,
      reinhard: THREE.ReinhardToneMapping,
      linear: THREE.LinearToneMapping,
      none: THREE.NoToneMapping
    }[settings.toneMapping] ?? THREE.NoToneMapping;
    this.renderer.toneMapping = toneMapping;
    this.renderer.toneMappingExposure = settings.exposure;

    const sun = this.world?.lights?.sun;
    if (sun) {
      sun.color.set(settings.sunColor);
      sun.intensity = settings.sunIntensity;
      sun.position.set(settings.sunX, settings.sunY, settings.sunZ);
      sun.target?.updateMatrixWorld?.();
    }
    const hemisphere = this.world?.lights?.hemisphere;
    if (hemisphere) {
      hemisphere.color.set(settings.hemiSky);
      hemisphere.groundColor.set(settings.hemiGround);
      hemisphere.intensity = settings.hemiIntensity;
    }
    if (this.scene) {
      this.scene.background = new THREE.Color(settings.background);
      if (this.scene.fog) {
        this.scene.fog.color.set(settings.fogColor);
        this.applyCameraFogRange(settings);
      }
    }
    if (this.world?.config?.sky) {
      Object.assign(this.world.config.sky, {
        toneMapping: settings.toneMapping,
        exposure: settings.exposure,
        sun: settings.sunColor,
        sunIntensity: settings.sunIntensity,
        sunPosition: { x: settings.sunX, y: settings.sunY, z: settings.sunZ },
        hemiSky: settings.hemiSky,
        hemiGround: settings.hemiGround,
        hemiIntensity: settings.hemiIntensity,
        fog: settings.fogColor,
        fogNear: settings.fogNear,
        fogFar: settings.fogFar,
        background: settings.background
      });
    }
    this.canvas.style.filter = [
      `brightness(${settings.brightness})`,
      `contrast(${settings.contrast})`,
      `saturate(${settings.saturation})`,
      `hue-rotate(${settings.hue}deg)`,
      `sepia(${settings.warmth})`
    ].join(' ');
  }

  applyCameraFogRange(settings = this.renderTuning) {
    if (!this.scene?.fog || !settings) return;
    const normalized = normalizeRenderTuning(settings, this.worldConfig);
    const zoomSpan = Math.max(1, this.cameraMaxDistance - this.cameraMinDistance);
    const zoomT = smoothstep01((this.cameraDistance - this.cameraMinDistance) / zoomSpan, CAMERA_FOG_COMPENSATION_START, 1);
    const stretch = this.cameraDistance * zoomT;
    this.scene.fog.near = normalized.fogNear + stretch * CAMERA_FOG_COMPENSATION_NEAR_SCALE;
    this.scene.fog.far = normalized.fogFar + stretch * CAMERA_FOG_COMPENSATION_FAR_SCALE;
  }

  syncRenderTuningPanel() {
    const ui = this.renderTuningUi;
    if (!ui?.root) return;
    const settings = normalizeRenderTuning(this.renderTuning, this.worldConfig);
    this.renderTuning = settings;
    Object.entries(ui.controls).forEach(([key, input]) => {
      if (!input) return;
      input.value = String(settings[key]);
    });
    Object.entries(ui.values).forEach(([key, value]) => {
      if (!value) return;
      value.textContent = formatRenderTuningValue(key, settings[key]);
    });
    if (ui.exportText) {
      ui.exportText.textContent = renderTuningExportText(settings, this.worldConfig);
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
      realtimeShadows: this.renderer.shadowMap.enabled ? 1 : 0,
      bakedShadowMeshes: this.world?.bakedShadowMeshes?.length ?? 0,
      shadowMaskTexture: this.world?.shadowMaskTexture ? 1 : 0,
      shadowMaskTriangles: this.world?.shadowMaskTriangleCount ?? 0,
      staticDecorationBatches: this.world?.staticDecorationMeshes?.length ?? 0,
      staticCullables: this.world?.staticCullables?.length ?? 0,
      staticVisibleCullables: this.world?.staticCulling?.visibleCount ?? 0,
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
    this.world?.update?.(0, this.cameraTarget, this.camera, { forceStaticCulling: true });
    this.updateWavePreview();
  }

  applyInitialCameraConfig() {
    const config = this.world?.config?.camera;
    if (!config) return;
    if (config.target) {
      this.cameraTarget.set(
        config.target.x ?? this.cameraTarget.x,
        config.target.y ?? this.cameraTarget.y,
        config.target.z ?? this.cameraTarget.z
      );
    }
    if (config.offsetDirection) {
      this.cameraOffsetDirection.set(
        config.offsetDirection.x ?? this.cameraOffsetDirection.x,
        config.offsetDirection.y ?? this.cameraOffsetDirection.y,
        config.offsetDirection.z ?? this.cameraOffsetDirection.z
      ).normalize();
    }
    if (Number.isFinite(config.distance)) {
      this.cameraDistance = config.distance;
    }
    if (Number.isFinite(config.minDistance)) {
      this.cameraMinDistance = config.minDistance;
    }
    if (Number.isFinite(config.maxDistance)) {
      this.cameraMaxDistance = config.maxDistance;
    }
    this.updateCamera(0);
  }

  updateCamera(dt) {
    this.applyCameraDragDelta();
    this.cameraTarget.y = 4;
    this.camera.position.copy(this.cameraTarget).addScaledVector(
      this.cameraOffsetDirection,
      this.cameraDistance
    );
    this.camera.lookAt(this.cameraTarget);
    this.applyCameraFogRange();
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
    unit.game = this;
    return this.unitRegistry.register(unit);
  }

  handleUnitDeath(unit, source = null) {
    const handled = this.unitRegistry.handleDeath(unit, source);
    if (!handled) return false;

    if (unit?.team === TEAMS.ENEMY) {
      this.grantKillEnergy(unit);
      this.grantKillSilver(unit);
    }

    return true;
  }

  onUnitDied(unit, source = null) {
    if (unit?.team !== TEAMS.ENEMY) return;
    if (!source?.alive || source.team !== TEAMS.PLAYER || source.isBuilding) return;
    if (!unit.buffs?.has?.('huntMarked')) return;

    const share = 0.25;
    const sourceTag = `hunt-mark:${unit.id}`;
    const attackDamage = this.modifiers.getAttackDamage(unit);
    const attackRate = this.modifiers.getAttackRate(unit);
    const armor = this.modifiers.getArmor(unit);
    const magicResistance = this.modifiers.getMagicResistance(unit);
    const maxHealthGain = Math.max(0, unit.maxHealth * share);
    const maxDurabilityGain = Math.max(0, (unit.weapon?.maxDurability ?? 0) * share);

    source.attributes.addModifiers([
      { stat: 'maxHealth', type: 'add', amount: maxHealthGain },
      { stat: 'attackDamage', type: 'add', amount: attackDamage * share },
      { stat: 'attackRate', type: 'add', amount: attackRate * share },
      { stat: 'armor', type: 'add', amount: armor * share },
      { stat: 'magicResistance', type: 'add', amount: magicResistance * share },
      { stat: 'maxDurability', type: 'add', amount: maxDurabilityGain }
    ], sourceTag);
    source.health = Math.min(source.maxHealth, source.health + maxHealthGain);
    source.weapon.durability = Math.min(
      source.weapon.maxDurability,
      source.weapon.durability + maxDurabilityGain
    );
    source.clampToAttributeCaps?.();
    source.statusUiDirty = true;
    this.effects.spawnDamageNumber(source.position, 1, {
      text: '猎杀赏',
      color: '#ffb18a',
      stroke: '#4a2018',
      height: source.projectileHitHeight ?? 1.55,
      duration: 0.82,
      fontSize: 76,
      baseHeight: 0.48
    });
    this.effects.spawnRing(source.position, '#ff8866', 0.92, 0.48);
  }

  grantKillEnergy(unit) {
    if (!unit || unit.team !== TEAMS.ENEMY || unit.isSilentRemoval) return;
    const rewards = BALANCE.playerEnergy?.killRewards ?? {};
    let amount = Number(rewards.normal) || 1;
    if (unit.isBoss) amount = Number(rewards.boss) || 6;
    else if (unit.isElite) amount = Number(rewards.elite) || 3;
    else if (unit.isWildlife) amount = Number(rewards.wildlife) || 1;
    else if (unit.isBuilding) amount = Number(rewards.structure) || 1;

    const gained = this.cardSystem?.addEnergy?.(amount) ?? 0;
    if (gained > 0 && unit.position) {
      this.effects.spawnEnergyNumber(unit.position, gained, {
        height: 2.55
      });
    }
    this.abilities?.onEnemyKilled?.(unit, unit.position);
  }

  getEnemyForceSpawnPoints(count) {
    const camp = this.enemyCamp.position.clone().setY(0);
    const pathPoints = this.world?.pathPoints ?? BALANCE.world?.pathPoints ?? [];
    const playerZ = this.playerBase?.position?.z ?? BALANCE.playerBase.position.z;
    const campZ = camp.z;
    const spawnZCutoff = playerZ + (campZ - playerZ) * 0.55;
    const anchors = [];

    const monsterCamp = this.worldConfig?.monsterCamp ?? this.world?.config?.monsterCamp;
    if (monsterCamp) {
      anchors.push(new THREE.Vector3(monsterCamp.x, 0, monsterCamp.z));
    }

    if (pathPoints.length >= 2) {
      const enemyPathPoints = pathPoints.filter((point) => point.z <= spawnZCutoff);
      const tailCount = Math.min(4, Math.max(1, enemyPathPoints.length));
      const tailStart = Math.max(0, enemyPathPoints.length - tailCount);
      for (let i = tailStart; i < enemyPathPoints.length; i += 1) {
        const point = enemyPathPoints[i];
        anchors.push(new THREE.Vector3(point.x, 0, point.z));
      }
    }

    anchors.push(camp);

    const uniqueAnchors = [];
    anchors.forEach((anchor) => {
      if (uniqueAnchors.some((existing) => existing.distanceTo(anchor) < 1.5)) return;
      uniqueAnchors.push(anchor);
    });
    const spawnAnchors = uniqueAnchors.length ? uniqueAnchors : [camp];
    const total = Math.max(1, count);
    return Array.from({ length: total }, (_, index) => spawnAnchors[index % spawnAnchors.length]);
  }

  onAltarOwnershipChanged(event) {
    if (!event || event.owner !== TEAMS.PLAYER || event.reason !== 'captured') return;
    const altarId = event.altar?.id;
    if (!altarId || this.rewardedAltarIds.has(altarId)) return;
    this.rewardedAltarIds.add(altarId);
    this.queueStrategyReward('altar-reward', { altar: event.altar });
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
      this.abilities?.onFriendlyUnitSummoned?.(unit, options.sourceCard);
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
    return (
      Math.abs(point.x) <= BALANCE.battlefield.halfWidth &&
      point.z >= BALANCE.battlefield.minZ &&
      point.z <= BALANCE.battlefield.maxZ &&
      this.isPointWalkable(point)
    );
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
    applySummonCardLevelModifiers(unit, card);
    applyBuildingCardUpgrade(unit, card);
    this.applyTeamUpgradesToUnit(unit);
  }

  spawnUpgradeTurret(owner, ability = {}) {
    if (!owner?.alive) return null;
    const existing = this.friendlyUnits.filter((unit) => (
      unit.alive &&
      unit.type === 'miniTurret' &&
      unit.ownerUnitId === owner.id
    ));
    const maxTurrets = Math.max(1, Math.floor(ability.maxTurrets ?? 1));
    if (existing.length >= maxTurrets) return null;
    const offset = polarOffset(existing.length, maxTurrets + 1, ability.spawnRadius ?? 1.35);
    const position = this.resolveWalkablePoint(owner.position.clone().add(offset));
    position.y = this.groundHeightAt(position);
    const turret = new UnitEntity({
      type: 'miniTurret',
      team: owner.team,
      position
    });
    turret.ownerUnitId = owner.id;
    turret.controlMode = owner.controlMode;
    turret.guardPoint = owner.guardPoint?.clone?.() ?? owner.position.clone();
    turret.guardRadius = Math.max(6.5, owner.guardRadius ?? 6.5);
    this.attachUnitStatus(turret);
    this.registerUnit(turret);
    this.effects.spawnRing(turret.position, '#dff8ff', 0.72, 0.48);
    return turret;
  }

  updatePlayerBaseAttack(dt) {
    if (this.levelFinished || !this.playerBase?.alive) return;
    if ((this.playerBase.structureDurability ?? 0) <= 0) return;
    this.playerBaseAttackTimer = Math.max(0, (this.playerBaseAttackTimer ?? 0) - dt);
    if (this.playerBaseAttackTimer > 0) return;
    const target = this.findPlayerBaseAttackTarget();
    if (!target) {
      this.playerBaseAttackTimer = ENEMY_CAMP_IDLE_SCAN_SECONDS;
      return;
    }
    this.playerBaseAttackTimer = Math.max(0.1, BALANCE.playerBase.attackInterval ?? 1);
    this.applyPlayerBaseAttack(target);
  }

  findPlayerBaseAttackTarget() {
    if (!this.playerBase?.alive) return null;
    const range = Math.max(0, BALANCE.playerBase.attackRange ?? 8.5);
    const baseRadius = targetCombatRadius(this.playerBase);
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    this.enemyUnits.forEach((unit) => {
      if (!unit.alive || unit.isWildlife || !unit.position) return;
      const distance = Math.max(
        0,
        flatDistance(this.playerBase.position, unit.position) - baseRadius - targetCombatRadius(unit)
      );
      if (distance > range) return;
      const healthRatio = unit.health / Math.max(1, unit.maxHealth);
      const score = distance + healthRatio * 0.2 + (unit.isBoss ? -0.2 : 0);
      if (score >= bestScore) return;
      best = unit;
      bestScore = score;
    });
    return best;
  }

  applyPlayerBaseAttack(target) {
    if (!target?.alive || !target.takeRawDamage) return;
    const damage = this.levelTestMode
      ? 999
      : Math.max(0, BALANCE.playerBase.attackDamage ?? 7);
    if (damage <= 0) return;
    const durabilityCost = Math.max(0, BALANCE.playerBase.attackDurabilityCost ?? 1);
    if ((this.playerBase.structureDurability ?? 0) < durabilityCost) return;
    this.spendStructureDurability(this.playerBase, durabilityCost);
    const start = this.playerBase.position.clone();
    start.y += this.playerBase.projectileHitHeight ?? 2.1;
    const end = target.position.clone();
    end.y += target.projectileHitHeight ?? 1.45;
    this.effects.spawnEnemyCampBlast(start, end, {
      color: '#b7e8ff',
      hotColor: '#6adbb8'
    });
    target.takeRawDamage(damage, { bypassShield: false });
    target.statusUiDirty = true;
    this.effects.spawnDamageNumber(target.position, damage, {
      color: '#9eeedb',
      stroke: '#12342d',
      height: target.projectileHitHeight ?? 1.45,
      duration: 0.72
    });
    if (target.alive === false) {
      this.handleUnitDeath(target, this.playerBase);
    }
  }

  updateEnemyCampAttack(dt) {
    if (this.levelFinished || !this.enemyCamp?.alive) return;
    if ((this.enemyCamp.structureDurability ?? 0) <= 0) return;
    this.enemyCampAttackTimer = Math.max(0, (this.enemyCampAttackTimer ?? 0) - dt);
    if (this.enemyCampAttackTimer > 0) return;
    const target = this.findEnemyCampAttackTarget();
    if (!target) {
      this.enemyCampAttackTimer = ENEMY_CAMP_IDLE_SCAN_SECONDS;
      return;
    }
    this.enemyCampAttackTimer = Math.max(0.1, BALANCE.enemyCamp.attackInterval ?? 1);
    this.applyEnemyCampAttack(target);
  }

  findEnemyCampAttackTarget() {
    if (!this.enemyCamp?.alive) return null;
    const range = Math.max(0, BALANCE.enemyCamp.attackRange ?? 8.5);
    const campRadius = targetCombatRadius(this.enemyCamp);
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    this.friendlyUnits.forEach((unit) => {
      if (!unit.alive || !unit.position) return;
      const distance = Math.max(
        0,
        flatDistance(this.enemyCamp.position, unit.position) - campRadius - targetCombatRadius(unit)
      );
      if (distance > range) return;
      const healthRatio = unit.health / Math.max(1, unit.maxHealth);
      const score = distance + healthRatio * 0.2 + (unit.isBuilding ? 0.35 : 0);
      if (score >= bestScore) return;
      best = unit;
      bestScore = score;
    });
    return best;
  }

  applyEnemyCampAttack(target) {
    if (!target?.alive || !target.takeRawDamage) return;
    const damage = Math.max(0, BALANCE.enemyCamp.attackDamage ?? 7);
    if (damage <= 0) return;
    const durabilityCost = Math.max(0, BALANCE.enemyCamp.attackDurabilityCost ?? 1);
    if ((this.enemyCamp.structureDurability ?? 0) < durabilityCost) return;
    this.spendStructureDurability(this.enemyCamp, durabilityCost);
    const start = this.enemyCamp.position.clone();
    start.y += this.enemyCamp.projectileHitHeight ?? 2.2;
    const end = target.position.clone();
    end.y += target.projectileHitHeight ?? 1.35;
    this.effects.spawnEnemyCampBlast(start, end);
    target.takeRawDamage(damage, { bypassShield: false });
    target.statusUiDirty = true;
    this.effects.spawnDamageNumber(target.position, damage, {
      color: '#ffcf7a',
      stroke: '#4a2506',
      height: target.projectileHitHeight ?? 1.45,
      duration: 0.72
    });
    if (target.alive === false) {
      this.handleUnitDeath(target, null);
    }
  }

  spawnEnemyWave(waveNumber, { orders = 'attack', waveConfig = null } = {}) {
    const waveIndex = waveConfig?.index ?? waveNumber;
    const difficulty = waveConfig?.effectiveDifficulty ?? this.effectiveDifficultyForWave(waveIndex);
    const count = waveConfig?.count ?? Math.min(
      MAX_ACTIVE_WAVE_SPAWNS,
      2 + Math.floor(waveIndex * 0.72) + Math.floor((difficulty - 1) * 0.45)
    );
    const spawnPoints = this.getEnemyForceSpawnPoints(count);
    const spawnedUnits = [];
    for (let i = 0; i < count; i += 1) {
      const spawnBase = spawnPoints[i % spawnPoints.length] ?? this.enemyCamp.position;
      const offset = polarOffset(i, count, 1.2 + (i % 3) * 0.45);
      const position = this.resolveWalkablePoint(spawnBase.clone().setY(0).add(offset));
      position.y = this.groundHeightAt(position);
      const unit = new UnitEntity({
        type: this.enemyTypeForThreat(waveIndex, i, difficulty, waveConfig),
        team: TEAMS.ENEMY,
        position
      });
      unit.enemyForce = waveConfig ?? null;
      this.applyEnemyDifficulty(unit, waveIndex, difficulty);
      this.applyOpeningForceScaling(unit, waveConfig);
      this.applyEnemyForceModifiers(unit, waveConfig, i);
      this.applyEnemyForceAffixModifiers(unit, waveConfig);
      this.applySpiderSpawnTraits(unit, waveIndex, difficulty, i);
      this.initializeSpiderLifecycle(unit);
      this.attachUnitStatus(unit);
      this.registerUnit(unit);
      spawnedUnits.push(unit);
      if (orders === 'attack' && !this.enemyCommander) {
        this.orderEnemyAttack(unit, i, count);
      }
    }
    this.enemyCommander?.registerWave(spawnedUnits, waveIndex, orders, waveConfig);
    this.enemyEnchantment?.enchantSpawnWave?.(spawnedUnits, waveConfig);
  }

  enemyTypeForThreat(threatTier, index, difficulty, waveConfig = null) {
    if (waveConfig?.types?.length) {
      return waveConfig.types[index % waveConfig.types.length];
    }
    const pool = this.levelSession.level.enemyPool ?? [];
    const pooledType = selectEnemyFromPool(pool, threatTier, index, difficulty);
    if (pooledType) return pooledType;

    const wizardUnlocked = difficulty >= 4 || threatTier >= 7;
    if (wizardUnlocked) {
      const wizardEvery = difficulty >= 6 ? 5 : 7;
      if ((index * 3 + threatTier) % wizardEvery === 0) return 'wizard';
    }
    const ogreUnlocked = difficulty >= 3 || threatTier >= 5;
    if (ogreUnlocked) {
      const ogreEvery = difficulty >= 5 ? 4 : 6;
      if ((index + threatTier * 2) % ogreEvery === 0) return 'ogre';
    }
    const skeletonArcherUnlocked = difficulty >= 3 || threatTier >= 4;
    if (skeletonArcherUnlocked && (index + threatTier * 3) % 5 === 1) {
      return 'skeletonArcher';
    }
    const skeletonUnlocked = difficulty >= 2 || threatTier >= 2;
    if (skeletonUnlocked && (index + threatTier) % 3 === 1) {
      return 'skeletonSoldier';
    }
    const archerUnlocked = difficulty >= 2 || threatTier >= 3;
    if (!archerUnlocked) return 'goblinSoldier';
    const archerEvery = difficulty >= 5 ? 2 : difficulty >= 3 ? 3 : 4;
    return (index + threatTier) % archerEvery === 0 ? 'goblinArcher' : 'goblinSoldier';
  }

  applyEnemyForceModifiers(unit, waveConfig, index) {
    if (!waveConfig) return;
    if (waveConfig.kind === 'elite') {
      if (index !== 0) return;
      const eliteScale = BALANCE.waveScaling ?? {};
      unit.isElite = true;
      unit.name = `精英${unit.name}`;
      unit.attributes.addModifiers([
        { stat: 'maxHealth', type: 'multiply', amount: (eliteScale.eliteHealthMultiply ?? 1.45) * 0.5 },
        { stat: 'maxShield', type: 'multiply', amount: (eliteScale.eliteHealthMultiply ?? 1.45) * 0.5 },
        { stat: 'attackDamage', type: 'multiply', amount: eliteScale.eliteDamageMultiply ?? 1.16 },
        { stat: 'knockbackResistance', type: 'add', amount: 0.14 }
      ], `force:${waveConfig.id ?? waveConfig.index ?? 0}:elite`);
      unit.health = unit.maxHealth;
      unit.shield = 0;
      unit.weapon.durability = unit.weapon.maxDurability;
      unit.visualRoot?.scale?.multiplyScalar?.(1.1);
      return;
    }
    if (waveConfig.kind !== 'boss') return;
    if (index === 0) {
      const bossRank = Math.max(1, waveConfig.bossOrdinal ?? 1);
      const bossScale = BALANCE.waveScaling ?? {};
      unit.isBoss = true;
      unit.name = `Boss ${unit.name}`;
      unit.attributes.addModifiers([
        {
          stat: 'maxHealth',
          type: 'multiply',
          amount: ((bossScale.bossHealthBase ?? 2.5) + bossRank * (bossScale.bossHealthPerRank ?? 0.3)) * 0.7
        },
        {
          stat: 'maxShield',
          type: 'multiply',
          amount: (bossScale.bossShieldBase ?? 1.95) + bossRank * (bossScale.bossShieldPerRank ?? 0.2)
        },
        {
          stat: 'attackDamage',
          type: 'multiply',
          amount: (bossScale.bossDamageBase ?? 1.22) + bossRank * (bossScale.bossDamagePerRank ?? 0.08)
        },
        { stat: 'knockback', type: 'multiply', amount: 1.12 },
        { stat: 'knockbackResistance', type: 'add', amount: 0.22 + bossRank * 0.03 }
      ], `force:${waveConfig.id ?? waveConfig.index ?? 0}:boss`);
      const bossStatMultiply = bossScale.bossStatMultiply ?? 1;
      if (Math.abs(bossStatMultiply - 1) > 0.001) {
        unit.attributes.addModifiers([
          { stat: 'maxHealth', type: 'multiply', amount: bossStatMultiply },
          { stat: 'maxShield', type: 'multiply', amount: bossStatMultiply },
          { stat: 'attackDamage', type: 'multiply', amount: bossStatMultiply }
        ], `force:${waveConfig.id ?? waveConfig.index ?? 0}:boss-scale`);
      }
      const targetBossShield = unit.maxHealth * 0.5;
      unit.attributes.addModifiers([
        { stat: 'maxShield', type: 'add', amount: targetBossShield - unit.maxShield }
      ], `force:${waveConfig.id ?? waveConfig.index ?? 0}:boss-shield-cap`);
      unit.health = unit.maxHealth;
      unit.shield = unit.maxShield;
      unit.weapon.durability = unit.weapon.maxDurability;
      unit.visualRoot?.scale?.multiplyScalar?.(unit.type === 'frostTrollBoss' ? 1 : 1.32);
      unit.projectileHitHeight = (unit.projectileHitHeight ?? 1.6) * 1.18;
      return;
    }
    unit.attributes.addModifiers([
      { stat: 'maxHealth', type: 'multiply', amount: 1.18 },
      { stat: 'attackDamage', type: 'multiply', amount: 1.08 },
      { stat: 'knockbackResistance', type: 'add', amount: 0.08 }
    ], `force:${waveConfig.id ?? waveConfig.index ?? 0}:boss-support`);
    unit.health = unit.maxHealth;
    unit.shield = 0;
  }

  applyEnemyForceAffixModifiers(unit, waveConfig) {
    void unit;
    void waveConfig;
  }

  levelBaseDifficulty() {
    return Math.max(1, Math.floor(this.levelSession.level.baseDifficulty ?? 1));
  }

  effectiveDifficulty() {
    return resolveSessionBaseDifficulty(this.levelSession);
  }

  effectiveDifficultyForWave(wave = this.wave) {
    return this.effectiveDifficulty() + waveDifficultyBonus(wave, this.levelSession);
  }

  effectiveDifficultyForThreat(threatTier = this.currentWave?.index ?? this.wave ?? 1) {
    return this.effectiveDifficulty() + Math.max(0, Math.floor(threatTier) - 1);
  }

  applyEnemyDifficulty(unit, threatTier, difficulty) {
    const scale = BALANCE.waveScaling ?? {};
    const healthFactor = 1
      + (difficulty - 1) * (scale.difficultyHealthPerLevel ?? 0.11)
      + (threatTier - 1) * (scale.threatHealthPerTier ?? 0.028);
    const damageFactor = 1
      + (difficulty - 1) * (scale.difficultyDamagePerLevel ?? 0.1)
      + (threatTier - 1) * (scale.threatDamagePerTier ?? 0.022);
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
    this.applyEnemyStartingBuffs(unit, threatTier, difficulty);
    unit.health = unit.maxHealth;
    unit.clampToAttributeCaps();
  }

  applyOpeningForceScaling(unit, force) {
    if (!force?.opening) return;
    const healthFactor = Math.max(0.1, this.enemyDirectorConfig.openingHealthMultiplier ?? 0.62);
    const damageFactor = Math.max(0.1, this.enemyDirectorConfig.openingDamageMultiplier ?? 0.56);
    unit.attributes.addModifiers([
      { stat: 'maxHealth', type: 'multiply', amount: healthFactor },
      { stat: 'maxShield', type: 'multiply', amount: healthFactor },
      { stat: 'attackDamage', type: 'multiply', amount: damageFactor }
    ], `director:opening:${force.id ?? 0}`);
    unit.health = unit.maxHealth;
    unit.shield = Math.min(unit.shield, unit.maxShield);
  }

  applyEnemyStartingBuffs(unit, threatTier, difficulty) {
    const startingBuffs = unit.definition.startingBuffs ?? [];
    if (!startingBuffs.length) return;
    const scalingLevel = enemyEnchantmentLevel(threatTier, difficulty);
    startingBuffs.forEach((entry) => {
      const level = (entry.level ?? 1) + (entry.scalesWithDifficulty ? scalingLevel - 1 : 0);
      this.buffs.applyBuff(unit, entry.buffId, unit, {
        level,
        sourceUnitType: unit.type
      });
    });
  }

  applySpiderSpawnTraits(unit, threatTier, difficulty, seedIndex = 0) {
    if (unit.type !== 'spider') return;
    if (stableEnemyRoll(threatTier, seedIndex + unit.id * 17, difficulty) % 3 !== 0) return;
    this.buffs.applyBuff(unit, 'poison', unit, {
      level: enemyEnchantmentLevel(threatTier, difficulty),
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
    egg.enemyForce = parent.enemyForce ?? this.currentEnemyForce ?? null;
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
    const threatTier = egg.enemyForce?.threatTier ?? this.enemyDirector?.threatTier ?? 1;
    const difficulty = egg.enemyForce?.effectiveDifficulty ?? this.effectiveDifficultyForThreat(threatTier);
    this.removeEnemyUnitSilently(egg);

    const spider = new UnitEntity({
      type: 'spider',
      team: TEAMS.ENEMY,
      position
    });
    this.applyEnemyDifficulty(spider, threatTier, difficulty);
    spider.enemyForce = egg.enemyForce ?? this.currentEnemyForce ?? null;
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
    unit.moveGoalUsesDirectSteering = false;
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
      unit.position.y = groundY;
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
    const resolved = point.clone();
    resolved.x = clamp(resolved.x, -BALANCE.battlefield.halfWidth, BALANCE.battlefield.halfWidth);
    resolved.z = clamp(resolved.z, BALANCE.battlefield.minZ, BALANCE.battlefield.maxZ);
    resolved.y = this.groundHeightAt(resolved);
    return resolved;
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

  setPlayerBaseInvincible(enabled = true) {
    if (!this.playerBase) return;
    this.playerBase.invincible = Boolean(enabled);
    if (!this.playerBase.invincible) return;
    this.playerBase.health = this.playerBase.maxHealth;
    this.playerBase.structureDurability = this.playerBase.maxStructureDurability;
    this.playerBase.alive = true;
    this.playerBase.healthLagRatio = 1;
    this.playerBase.healthLagDelay = 0;
    this.updateStructureStatusElement(this.playerBase, 0);
    if (this.dom?.baseHealth) {
      this.dom.baseHealth.textContent = '无敌';
    }
  }

  toggleLevelTestMode() {
    if (!this.levelTestMode) {
      const input = window.prompt('输入关卡测试模式密码');
      if (input !== 'satest') {
        this.cardSystem?.setHint?.('密码错误', 'test-mode');
        return;
      }
      this.levelTestMode = true;
    } else {
      this.levelTestMode = false;
    }
    this.applyLevelTestMode();
  }

  applyLevelTestMode() {
    if (this.levelTestMode) {
      this.setPlayerBaseInvincible(true);
      this.debugTimeScale = 1;
      this.cardSystem?.setHint?.(
        '关卡测试模式：基地无敌 / 玩家基地不消耗耐久 / 基地防御999攻（Z慢放 X常速 C快放，F6关闭）',
        'test-mode'
      );
      return;
    }
    this.debugTimeScale = 1;
    this.setPlayerBaseInvincible(false);
    this.updateHud(0);
    this.cardSystem?.setHint?.('关卡测试模式已关闭', 'test-mode');
  }

  setDebugTimeScale(scale) {
    if (!this.levelTestMode) return;
    this.debugTimeScale = Math.max(0.05, Math.min(8, Number(scale) || 1));
    const label = this.debugTimeScale === 1
      ? '常速'
      : this.debugTimeScale < 1
        ? '慢放'
        : '快放';
    this.cardSystem?.setHint?.(`测试${label} ×${this.debugTimeScale.toFixed(2)}`, 'test-mode');
  }

  damagePlayerBase(amount) {
    if (this.playerBase.invincible) {
      this.playerBase.health = this.playerBase.maxHealth;
      this.playerBase.structureDurability = this.playerBase.maxStructureDurability;
      this.playerBase.alive = true;
      this.playerBase.healthLagRatio = 1;
      this.playerBase.healthLagDelay = 0;
      this.updateStructureStatusElement(this.playerBase, 0);
      return;
    }
    const previousHealth = this.playerBase.health;
    this.playerBase.health = Math.max(0, this.playerBase.health - amount);
    this.spendStructureDurability(this.playerBase, 1);
    registerStructureHealthLoss(this.playerBase, previousHealth, this.elapsedTime);
    this.playerBase.alive = this.playerBase.health > 0;
    this.updateStructureStatusElement(this.playerBase, 0);
    this.shakeStructure(this.playerBase, 0.2, 0.36);
    this.effects.spawnRing(this.playerBase.position, '#ff8c66', 1.2, 0.44);
    this.effects.spawnStructureDust(this.playerBase.position, this.playerBase.collisionRadius);
    this.effects.spawnDamageNumber(this.playerBase.position, amount, {
      height: 2.55
    });
    if (!this.playerBase.alive) {
      this.playerBase.health = 0;
    }
  }

  damageEnemyCamp(amount) {
    if (!this.enemyCamp.alive) return;
    const previousHealth = this.enemyCamp.health;
    this.enemyCamp.health = Math.max(0, this.enemyCamp.health - amount);
    this.spendStructureDurability(this.enemyCamp, 1);
    registerStructureHealthLoss(this.enemyCamp, previousHealth, this.elapsedTime);
    this.enemyCamp.alive = this.enemyCamp.health > 0;
    this.updateStructureStatusElement(this.enemyCamp, 0);
    this.shakeStructure(this.enemyCamp, 0.16, 0.32);
    this.effects.spawnRing(this.enemyCamp.position, '#ff8c66', 1.1, 0.44);
    this.effects.spawnStructureDust(this.enemyCamp.position, this.enemyCamp.collisionRadius, '#8d7464');
    this.effects.spawnDamageNumber(this.enemyCamp.position, amount, {
      height: 2.7
    });
    const campDamageRatio = amount / Math.max(1, this.enemyCamp.maxHealth);
    if (campDamageRatio >= 0.02) {
      const rewards = this.enemyDirectorConfig.battleRewards ?? {};
      const grant = campDamageRatio * (Number(rewards.campDamageRatio) || 3.2);
      this.grantEnemyEnergy(grant, this.enemyCamp.position);
    }
    if (!this.enemyCamp.alive) {
      this.enemyCamp.health = 0;
      this.finishLevel(true);
    }
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
      threat: this.wave,
      session: this.levelSession,
      playerBaseHealth: this.playerBase.health,
      enemyCampHealth: this.enemyCamp.health,
      bossesDefeated: this.bossesDefeated,
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
    this.syncPauseErrorControls();
  }

  onPauseOverlayClick(event) {
    const actionTarget = event.target.closest('[data-pause-action]');
    if (!actionTarget) return;
    event.preventDefault();
    event.stopPropagation();
    const action = actionTarget.dataset.pauseAction;
    if (action === 'continue') {
      if (this.runtimeError) {
        if (this.dom.pauseReason) {
          this.dom.pauseReason.textContent = '运行错误后请重新开始或返回菜单';
        }
        return;
      }
      this.setPaused(false);
      return;
    }
    if (action === 'copy-error') {
      this.copyRuntimeErrorInfo();
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

  syncPauseErrorControls() {
    if (!this.dom.pauseErrorCopyButton) return;
    this.dom.pauseErrorCopyButton.hidden = !this.runtimeError;
    if (this.runtimeError) {
      this.dom.pauseErrorCopyButton.textContent = '复制错误信息';
    }
  }

  async copyRuntimeErrorInfo() {
    if (!this.runtimeError) return;
    const button = this.dom.pauseErrorCopyButton;
    const text = formatRuntimeErrorInfo(this.runtimeError, this);
    try {
      await writeClipboardText(text);
      if (button) button.textContent = '已复制错误信息';
    } catch {
      if (button) button.textContent = '复制失败';
      if (this.dom.debug) {
        this.dom.debug.hidden = true;
        this.dom.debug.textContent = text;
      }
    }
    if (button) {
      window.setTimeout(() => {
        if (!this.runtimeError || button.hidden) return;
        button.textContent = '复制错误信息';
      }, 1400);
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
    this.selectUnits(unit ? [unit] : [], { mode: unit ? 'direct' : 'none' });
  }

  selectUnits(units, { mode = 'direct' } = {}) {
    const unique = new Set();
    this.selectedUnits.forEach((unit) => {
      unit.statusUiDirty = true;
    });
    this.selectedUnits = units.filter((unit) => {
      if (!unit?.alive || unique.has(unit.id)) return false;
      unique.add(unit.id);
      return true;
    });
    this.selectedUnitIds = new Set(this.selectedUnits.map((unit) => unit.id));
    this.selectedUnits.forEach((unit) => {
      unit.statusUiDirty = true;
    });
    this.selectedUnit = this.selectedUnits[0] ?? null;
    this.selectionMode = this.selectedUnits.length ? mode : 'none';
  }

  onCanvasPointerDown(event) {
    if (event.target !== this.canvas) return;
    this.pointerScreen.set(event.clientX, event.clientY);

    if (event.pointerType === 'touch') {
      event.preventDefault();
      this.trackTouchPointer(event);
      if (this.activeTouchPointers.size >= 2) {
        this.beginTouchGesture(event);
        return;
      }
      if (this.mobileBoxSelectMode) {
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
    if (key === 'f4') {
      event.preventDefault();
      this.setPlayerBaseInvincible(true);
      this.toggleRenderTuningPanel();
      return;
    }
    if (key === 'f6') {
      event.preventDefault();
      this.toggleLevelTestMode();
      return;
    }
    if (key === 'escape') {
      event.preventDefault();
      if (this.runShopOpen) {
        if (this.runShopActiveCategory) {
          this.clearRunShopSelection();
        } else if (this.runShopFreeReward) {
          this.closeRunShop({ force: true });
        } else {
          this.closeRunShop();
        }
        return;
      }
      this.setPaused(!this.paused, '设置');
      return;
    }
    if (key === 'b') {
      event.preventDefault();
      this.toggleRunShop();
      return;
    }
    if (key === 'n') {
      event.preventDefault();
      this.setNavDebugEnabled(!this.navDebugEnabled);
      this.cardSystem?.setHint?.(
        this.navDebugEnabled ? '寻路网格：开启（N 关闭）' : '寻路网格：关闭（N 开启）',
        'nav-debug'
      );
      return;
    }
    if (this.levelTestMode) {
      if (key === 'z') {
        event.preventDefault();
        this.setDebugTimeScale(0.35);
        return;
      }
      if (key === 'x') {
        event.preventDefault();
        this.setDebugTimeScale(1);
        return;
      }
      if (key === 'c') {
        event.preventDefault();
        this.setDebugTimeScale(2.5);
        return;
      }
    }
    if (this.paused) return;
    if (!this.selectedUnits.some((unit) => unit.alive && unit.team === TEAMS.PLAYER)) return;
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
    if (event.pointerType === 'touch') {
      this.trackTouchPointer(event);
      if (this.updateTouchGesture(event)) return;
    }
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
    if (event.pointerType === 'touch') {
      if (this.endTouchGesturePointer(event)) return;
      this.forgetTouchPointer(event);
    }
    if (this.endCameraDrag(event)) return;
    if (!this.isCurrentSelectionEvent(event)) return;
    const drag = this.selectionDrag;
    const wasMobileBoxSelect = this.mobileBoxSelectMode;
    this.selectionDrag = null;
    if (event.pointerId != null) {
      safeReleasePointerCapture(this.canvas, event.pointerId);
    }
    this.hideSelectionBox();

    if (wasMobileBoxSelect) {
      if (drag.active) {
        const units = this.unitsInScreenRect(drag);
        this.selectUnits(units, { mode: units.length ? 'box' : 'none' });
      } else {
        this.selectUnits([], { mode: 'none' });
      }
      this.setMobileBoxSelectMode(false);
      return;
    }

    if (drag.active) {
      this.selectUnits(this.unitsInScreenRect(drag), { mode: 'box' });
      return;
    }

    this.selectUnit(this.pickSelectableUnit(event.clientX, event.clientY));
  }

  onCanvasPointerCancel(event) {
    if (event.pointerType === 'touch') {
      if (this.endTouchGesturePointer(event)) return;
      this.forgetTouchPointer(event);
    }
    if (this.endCameraDrag(event)) return;
    if (!this.isCurrentSelectionEvent(event)) return;
    if (this.mobileBoxSelectMode) {
      this.setMobileBoxSelectMode(false);
    }
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
    if (action === 'box-select') {
      this.toggleMobileBoxSelectMode();
    } else if (action === 'stop') {
      this.stopSelectedUnits();
    } else if (action === 'guard') {
      this.guardSelectedUnits();
    }
  }

  toggleMobileBoxSelectMode() {
    this.setMobileBoxSelectMode(!this.mobileBoxSelectMode);
  }

  setMobileBoxSelectMode(active) {
    const next = active === true;
    if (this.mobileBoxSelectMode === next) return;
    this.mobileBoxSelectMode = next;
    document.body.classList.toggle('is-mobile-box-select-active', next);
    if (this.dom.mobileBoxSelectHint) {
      this.dom.mobileBoxSelectHint.hidden = !next;
      this.dom.mobileBoxSelectHint.setAttribute('aria-hidden', next ? 'false' : 'true');
    }
    if (this.dom.mobileBoxSelectButton) {
      this.dom.mobileBoxSelectButton.classList.toggle('is-active', next);
      this.dom.mobileBoxSelectButton.setAttribute('aria-pressed', next ? 'true' : 'false');
    }
    if (!next) {
      this.cancelSelectionDrag();
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

  trackTouchPointer(event) {
    if (event.pointerType !== 'touch' || event.pointerId == null) return;
    this.activeTouchPointers.set(event.pointerId, {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY
    });
  }

  forgetTouchPointer(event) {
    if (event.pointerType !== 'touch' || event.pointerId == null) return;
    this.activeTouchPointers.delete(event.pointerId);
  }

  beginTouchGesture(event) {
    if (this.activeTouchPointers.size < 2) return false;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (this.cameraDrag?.pointerId != null) {
      safeReleasePointerCapture(this.canvas, this.cameraDrag.pointerId);
    }
    this.cancelCameraDrag();
    this.cancelSelectionDrag();
    const points = this.currentTouchGesturePoints();
    if (points.length < 2) return false;
    const metrics = touchGestureMetrics(points);
    this.touchGesture = {
      pointerIds: points.map((point) => point.id),
      startDistance: Math.max(metrics.distance, MOBILE_PINCH_MIN_DISTANCE),
      startCameraDistance: this.cameraDistance,
      lastCenterX: metrics.centerX,
      lastCenterY: metrics.centerY
    };
    this.setMobileBoxSelectMode(false);
    this.edgePanActive = false;
    this.canvas.classList.add('is-camera-dragging');
    points.forEach((point) => safeSetPointerCapture(this.canvas, point.id));
    return true;
  }

  updateTouchGesture(event) {
    if (!this.touchGesture) return false;
    const points = this.currentTouchGesturePoints();
    if (points.length < 2) return false;
    event.preventDefault();
    event.stopPropagation?.();
    const metrics = touchGestureMetrics(points);
    const distance = Math.max(metrics.distance, MOBILE_PINCH_MIN_DISTANCE);
    this.cameraDistance = clamp(
      this.touchGesture.startCameraDistance * (this.touchGesture.startDistance / distance),
      this.cameraMinDistance,
      this.cameraMaxDistance
    );

    const dx = metrics.centerX - this.touchGesture.lastCenterX;
    const dy = metrics.centerY - this.touchGesture.lastCenterY;
    if (dx !== 0 || dy !== 0) {
      const dragScale = 0.018 + this.cameraDistance * 0.001;
      this.cameraTarget.x -= dx * dragScale;
      this.cameraTarget.z -= dy * dragScale;
      this.clampCameraTarget();
      this.touchGesture.lastCenterX = metrics.centerX;
      this.touchGesture.lastCenterY = metrics.centerY;
    }
    this.updateCamera(0);
    return true;
  }

  endTouchGesturePointer(event) {
    if (!this.touchGesture || event.pointerType !== 'touch') return false;
    const pointerId = event.pointerId;
    const wasGesturePointer = this.touchGesture.pointerIds.includes(pointerId);
    this.forgetTouchPointer(event);
    if (!wasGesturePointer) return false;
    event.preventDefault?.();
    event.stopPropagation?.();
    safeReleasePointerCapture(this.canvas, pointerId);
    if (this.activeTouchPointers.size >= 2) {
      this.restartTouchGestureFromCurrent();
    } else {
      this.cancelTouchGesture();
    }
    return true;
  }

  restartTouchGestureFromCurrent() {
    const points = this.currentTouchGesturePoints();
    if (points.length < 2) {
      this.cancelTouchGesture();
      return;
    }
    const metrics = touchGestureMetrics(points);
    this.touchGesture = {
      pointerIds: points.map((point) => point.id),
      startDistance: Math.max(metrics.distance, MOBILE_PINCH_MIN_DISTANCE),
      startCameraDistance: this.cameraDistance,
      lastCenterX: metrics.centerX,
      lastCenterY: metrics.centerY
    };
    points.forEach((point) => safeSetPointerCapture(this.canvas, point.id));
  }

  currentTouchGesturePoints() {
    const ids = this.touchGesture?.pointerIds ?? [];
    const selected = ids
      .map((id) => this.activeTouchPointers.get(id))
      .filter(Boolean);
    if (selected.length >= 2) return selected.slice(0, 2);
    return [...this.activeTouchPointers.values()].slice(0, 2);
  }

  cancelTouchGesture() {
    if (!this.touchGesture) return;
    this.touchGesture.pointerIds.forEach((pointerId) => {
      safeReleasePointerCapture(this.canvas, pointerId);
    });
    this.touchGesture = null;
    if (!this.cameraDrag) {
      this.canvas.classList.remove('is-camera-dragging');
    }
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

  hasMovablePlayerSelection() {
    return this.selectedUnits.some((unit) => (
      unit?.alive &&
      unit.team === TEAMS.PLAYER &&
      !unit.isBuilding &&
      unit.definition?.canMove !== false
    ));
  }

  pickSelectableUnit(clientX, clientY, options = {}) {
    const friendly = this.pickUnitFromList(this.friendlyUnits, clientX, clientY, options);
    if (friendly) return friendly;
    if (options.includeEnemies === false) return null;
    return this.pickUnitFromList(this.enemyUnits, clientX, clientY, options);
  }

  pickUnitFromList(units, clientX, clientY, options = {}) {
    this.setPointerFromClient(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const objects = units
      .filter((unit) => unit?.alive && unit.mesh?.children?.length)
      .flatMap((unit) => unit.mesh.children);
    const hit = this.raycaster
      .intersectObjects(objects, true)
      .find((entry) => entry.object.userData.entity?.alive);
    if (hit?.object.userData.entity) return hit.object.userData.entity;

    if (options.allowScreenFallback === false) return null;
    let best = null;
    let bestDistance = options.screenRadius ?? 42;
    units.forEach((unit) => {
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
    if (this.lootDrops?.tryOpenPickup(event)) {
      return;
    }

    const hasCommandableSelection = this.hasMovablePlayerSelection();
    const unit = hasCommandableSelection
      ? this.pickSelectableUnit(event.clientX, event.clientY, {
          allowScreenFallback: false,
          includeEnemies: false
        })
      : this.pickSelectableUnit(event.clientX, event.clientY);
    if (unit) {
      this.selectUnit(unit);
      return;
    }
    this.issueMoveCommand(event);
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
    if (!point || !this.selectedUnits.length) return false;
    return this.commandSelectedUnits(point);
  }

  commandSelectedUnits(point) {
    const units = this.selectedUnits.filter((unit) => (
      unit.alive &&
      unit.team === TEAMS.PLAYER &&
      !unit.isBuilding &&
      unit.definition?.canMove !== false
    ));
    if (!units.length) return false;
    const commandCenter = this.resolveCommandPoint(point);
    if (!commandCenter) return false;
    const formationRadius = Math.min(2.4, 0.55 + Math.sqrt(units.length) * 0.42);
    const forceMoveUnits = [];
    let commanded = false;
    units.forEach((unit, index) => {
      const destination = this.resolveCommandPoint(
        commandCenter.clone().add(commandFormationOffset(index, units.length, formationRadius))
      );
      if (!destination) return;
      commanded = true;
      const forceMove = this.isUnitEngaged(unit);
      unit.commandMoveGoal = forceMove ? destination.clone() : null;
      unit.moveGoal = destination.clone();
      unit.moveGoalUsesDirectSteering = false;
      unit.directMoveBlocked = false;
      unit.directMoveBlockedTime = 0;
      unit.attackRangeHoldTargetId = null;
      this.clearUnitRoute(unit);
      unit.target = null;
      unit.controlMode = 'normal';
      unit.guardPoint = null;
      unit.guardRadius = null;
      if (forceMove) forceMoveUnits.push(unit);
    });
    if (!commanded) return false;
    this.attacks.cancelPendingAttacksFor(forceMoveUnits);
    this.effects.spawnMoveDestination(commandCenter, formationRadius);
    return true;
  }

  isUnitEngaged(unit) {
    return Boolean(unit.target?.alive !== false && unit.target) ||
      Boolean(this.attacks.getActiveAttackFor(unit)) ||
      this.hasHostileInAggroRange(unit);
  }

  hasHostileInAggroRange(unit) {
    if (!unit?.position) return false;
    const hostileTeam = unit.team === TEAMS.PLAYER ? TEAMS.ENEMY : TEAMS.PLAYER;
    const candidates = hostileTeam === TEAMS.ENEMY ? this.enemyUnits : this.friendlyUnits;
    const aggroRange = this.modifiers.getAggroRange(unit);
    return candidates.some((candidate) => {
      if (!candidate.alive || candidate === unit || candidate.underConstruction) return false;
      const distance = Math.max(
        0,
        Math.hypot(unit.position.x - candidate.position.x, unit.position.z - candidate.position.z) -
          targetCombatRadius(candidate)
      );
      return distance <= aggroRange;
    });
  }

  stopSelectedUnits() {
    const units = this.selectedUnits.filter((unit) => unit.alive && unit.team === TEAMS.PLAYER);
    if (!units.length) return;
    units.forEach((unit) => {
      unit.controlMode = 'hold';
      unit.moveGoal = null;
      unit.commandMoveGoal = null;
      unit.moveGoalUsesDirectSteering = false;
      unit.directMoveBlocked = false;
      unit.directMoveBlockedTime = 0;
      unit.attackRangeHoldTargetId = null;
      unit.target = null;
      this.clearUnitRoute(unit);
      unit.guardPoint = null;
      unit.guardRadius = null;
      unit.knockbackVelocity.set(0, 0, 0);
    });
    this.attacks.cancelPendingAttacksFor(units);
  }

  guardSelectedUnits() {
    const units = this.selectedUnits.filter((unit) => unit.alive && unit.team === TEAMS.PLAYER);
    if (!units.length) return;
    units.forEach((unit) => {
      unit.controlMode = 'guard';
      unit.guardPoint = unit.position.clone();
      unit.guardPoint.y = this.groundHeightAt(unit.guardPoint);
      unit.guardRadius = this.gameGuardRadiusFor(unit);
      unit.moveGoal = null;
      unit.commandMoveGoal = null;
      unit.moveGoalUsesDirectSteering = false;
      unit.directMoveBlocked = false;
      unit.directMoveBlockedTime = 0;
      unit.attackRangeHoldTargetId = null;
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
    } else {
      this.cardSystem?.clearHint?.('nav-debug');
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
    const durabilityRatio = clamp(
      structure.structureDurability / Math.max(1, structure.maxStructureDurability),
      0,
      1
    );
    updateStructureHealthLag(structure, hpRatio, dt);
    element.parts.hp.style.transform = `scaleX(${hpRatio})`;
    element.parts.healthLoss.style.transform = `scaleX(${structure.healthLagRatio})`;
    element.parts.healthLoss.hidden = structure.healthLagRatio <= hpRatio + 0.006;
    if (element.parts.durability) {
      element.parts.durability.style.transform = `scaleX(${durabilityRatio})`;
    }
    updateHealthTicks(element.parts.ticks, structure.maxHealth);
    const screen = this.projectWorldUi(structure.position, structure.statusHeight ?? 2.8);
    element.hidden = !structure.alive || !screen.visible;
    if (element.hidden) return;
    element.style.transform = `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -100%)`;
  }

  spendStructureDurability(structure, amount = 1) {
    if (!structure) return;
    if (this.levelTestMode && structure === this.playerBase) return;
    structure.structureDurability = Math.max(
      0,
      (structure.structureDurability ?? 0) - Math.max(0, amount)
    );
  }

  repairStructure(structure, { healthPercent = 0, durabilityPercent = 0 } = {}) {
    if (!structure?.alive) return { health: 0, durability: 0 };
    const previousHealth = structure.health;
    const healthGain = Math.max(0, structure.maxHealth * healthPercent);
    const durabilityGain = Math.max(0, structure.maxStructureDurability * durabilityPercent);
    if (healthGain > 0) {
      structure.health = Math.min(structure.maxHealth, structure.health + healthGain);
      registerStructureHealthLoss(structure, previousHealth, this.elapsedTime);
    }
    if (durabilityGain > 0) {
      structure.structureDurability = Math.min(
        structure.maxStructureDurability,
        (structure.structureDurability ?? 0) + durabilityGain
      );
    }
    structure.alive = structure.health > 0;
    this.updateStructureStatusElement(structure, 0);
    return {
      health: Math.max(0, structure.health - previousHealth),
      durability: durabilityGain
    };
  }

  updateHud(dt = 0) {
    this.hudUpdateTimer -= dt;
    if (this.hudUpdateTimer > 0) return;
    this.hudUpdateTimer = 0.1;

    if (this.playerBase.invincible) {
      this.dom.baseHealth.textContent = '无敌';
    } else {
      const baseRatio = Math.round(
        (this.playerBase.health / this.playerBase.maxHealth) * 100
      );
      this.dom.baseHealth.textContent = `${baseRatio}%`;
    }
    this.dom.waveLabel.textContent = this.currentWave
      ? `${this.currentWave.index}/${this.waveSchedule.length}`
      : (this.wave > 0 ? '整备' : '准备');
    if (this.dom.silverCount) {
      this.dom.silverCount.textContent = formatSilverAmount(this.silver);
    }
    this.dom.battleTime.textContent = formatBattleTime(this.elapsedTime);
    this.dom.unitCount.textContent = String(this.friendlyUnits.length);
    if (this.selectedUnits.length > 1) {
      if (this.dom.selectedPanel) this.dom.selectedPanel.hidden = false;
      const totalHealth = Math.round(
        this.selectedUnits.reduce((sum, unit) => sum + unit.health, 0)
      );
      const totalDurability = Math.round(
        this.selectedUnits.reduce((sum, unit) => sum + unit.weapon.durability, 0)
      );
      const totalMaxDurability = Math.round(
        this.selectedUnits.reduce((sum, unit) => sum + unit.weapon.maxDurability, 0)
      );
      const types = countBy(this.selectedUnits, (unit) => unit.name);
      this.dom.selectedName.textContent = `已选中 ${this.selectedUnits.length} 个单位`;
      this.dom.selectedStats.textContent = `总 HP ${totalHealth} / 总耐久 ${totalDurability}/${totalMaxDurability} / ${formatCounts(types)}`;
      this.dom.selectedEnchants.textContent = '右键地面移动，遇敌自动战斗';
    } else if (this.selectedUnit) {
      if (this.dom.selectedPanel) this.dom.selectedPanel.hidden = false;
      const unit = this.selectedUnit;
      const hp = Math.round(unit.health);
      const shield = Math.round(unit.shield);
      const durability = Math.round(unit.weapon.durability);
      const maxDurability = Math.round(unit.weapon.maxDurability);
      const enchantments = formatEnchantmentList(unit);
      const teamLabel = unit.team === TEAMS.PLAYER ? '友军' : '敌方';
      const attack = formatSupportAmount(this.modifiers.getAttackDamage(unit));
      const armor = formatSignedStat(this.modifiers.getArmor(unit));
      const magicResistance = formatSignedStat(this.modifiers.getMagicResistance(unit));
      const dodgeChance = Math.round(this.modifiers.getDodgeChance(unit) * 100);
      const knockbackResistance = Math.round(this.modifiers.getKnockbackResistance(unit) * 100);
      this.dom.selectedName.textContent = `${teamLabel} ${unit.name} #${unit.id}`;
      this.dom.selectedStats.textContent =
        `HP ${hp}/${Math.round(unit.maxHealth)} / 护盾 ${shield}/${Math.round(unit.maxShield)} / 武器 ${unit.weapon.name} / 耐久 ${durability}/${maxDurability}`;
      this.dom.selectedEnchants.textContent =
        `${attackDamageTypeLabel(unit.definition.attackDamageType)}攻 ${attack} / 护甲 ${armor} / 魔抗 ${magicResistance} / 闪避 ${dodgeChance}% / 抗击退 ${knockbackResistance}% / 附魔 ${enchantments || '-'}`;
    } else {
      if (this.dom.selectedPanel) this.dom.selectedPanel.hidden = true;
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
      threat: this.wave,
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
        ? `${formatPerfSeconds(latest.elapsedTime)} / T${latest.threat ?? 0} / peak ${this.perfHistory.length}s`
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

  enemyDirectorSnapshot() {
    const wave = this.currentWave ?? this.waveSchedule[this.waveIndex] ?? null;
    return {
      wave: this.wave,
      waveIndex: this.waveIndex,
      waveKind: wave?.kind ?? 'normal',
      bossOrdinal: wave?.bossOrdinal ?? 0,
      bossesDefeated: this.bossesDefeated,
      totalWaves: this.waveSchedule.length
    };
  }

  perfDebugSnapshot() {
    return {
      level: this.levelSession.level.id,
      sceneKey: this.world.config?.sceneKey ?? this.worldConfig.sceneKey,
      elapsedTime: Number(this.elapsedTime.toFixed(1)),
      wave: this.wave,
      enemyDirector: this.enemyDirectorSnapshot(),
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
      threat: this.wave,
      enemyDirector: this.enemyDirectorSnapshot(),
      pendingStrategyRewards: this.pendingStrategyRewards.length,
      currentEnemyForce: this.currentEnemyForce
        ? {
            id: this.currentEnemyForce.id,
            kind: this.currentEnemyForce.kind,
            count: this.currentEnemyForce.count,
            threatTier: this.currentEnemyForce.threatTier,
            difficulty: this.currentEnemyForce.effectiveDifficulty
          }
        : null,
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
    difficulty: clampLevelDifficulty(session?.difficulty ?? 1),
    deck: Array.isArray(session?.deck) ? session.deck : fallbackDeck,
    debug: session?.debug === true,
    startedAt: session?.startedAt ?? Date.now()
  };
}

function enemyForceCount({ requestedKind, kind, threatTier, availableSlots, bossOrdinal, affixId }) {
  const affixBonusRaw = Math.max(0, Math.floor(WAVE_AFFIX_DEFINITIONS[affixId]?.countBonus ?? 0));
  const affixBonus = threatTier >= 5 ? affixBonusRaw : Math.min(affixBonusRaw, 1);
  if (kind === 'boss') {
    return Math.min(availableSlots, 2 + Math.floor(Math.max(0, bossOrdinal - 1) / 2) + affixBonus);
  }
  if (kind === 'elite') {
    return Math.min(availableSlots, 2 + Math.floor(Math.max(0, threatTier - 4) / 3) + affixBonus);
  }
  if (requestedKind === 'normal-squad') {
    const baseCount = threatTier <= 2
      ? 2
      : threatTier <= 4
        ? 3
        : 3 + Math.floor((threatTier - 4) / 2);
    return Math.min(availableSlots, baseCount + affixBonus);
  }
  return 1;
}

function collectPlayerCompositionBias(friendlyUnits) {
  const units = (friendlyUnits ?? []).filter((unit) => unit?.alive && !unit.isWildlife);
  let melee = 0;
  let ranged = 0;
  let buildings = 0;
  let support = 0;
  units.forEach((unit) => {
    if (unit.isBuilding) {
      buildings += 1;
      return;
    }
    const role = unit.definition?.role;
    if (unit.definition?.support || role === 'support') support += 1;
    else if (role === 'ranged') ranged += 1;
    else melee += 1;
  });
  return { melee, ranged, buildings, support, total: units.length };
}

function compositionPreferredTypes(bias, enemyPool) {
  const preferred = new Set();
  if (!bias || bias.total < 3 || !Array.isArray(enemyPool)) return preferred;
  enemyPool.forEach((entry) => {
    const type = entry?.type;
    const definition = UNIT_DEFINITIONS[type];
    if (!definition) return;
    if (bias.buildings >= 1 && definition.role === 'melee' && (definition.attackRange ?? 1.5) <= 2.6) {
      preferred.add(type);
    }
    if (bias.ranged >= bias.melee && bias.ranged >= 3 && definition.role === 'melee') {
      preferred.add(type);
    }
    if (bias.melee >= bias.ranged + 2 && bias.melee >= 4 && definition.role === 'ranged') {
      preferred.add(type);
    }
    if (bias.support >= 1 && (definition.moveSpeed ?? 0) >= 3.1) {
      preferred.add(type);
    }
  });
  return preferred;
}

function enemyForceTypes({
  level,
  forceId,
  kind,
  count,
  difficulty,
  threatTier,
  bossOrdinal,
  opening,
  affixId,
  compositionPreferred = null
}) {
  const enemyPool = Array.isArray(level?.enemyPool) ? level.enemyPool : [];
  const elitePool = Array.isArray(level?.elitePool) ? level.elitePool : [];
  const bossPool = Array.isArray(level?.bossPool) ? level.bossPool : [];
  const affixPreferred = new Set(WAVE_AFFIX_DEFINITIONS[affixId]?.preferredTypes ?? []);
  const compositionSet = compositionPreferred instanceof Set
    ? compositionPreferred
    : new Set(compositionPreferred ?? []);
  const preferred = new Set([...affixPreferred, ...compositionSet]);
  return Array.from({ length: count }, (_, unitIndex) => {
    if (kind === 'boss' && unitIndex === 0) {
      return selectEnemyFromPool(bossPool, threatTier, forceId + bossOrdinal, difficulty, preferred) ??
        enemyBossType(enemyPool, forceId, difficulty, threatTier, bossOrdinal);
    }
    if (kind === 'elite' && unitIndex === 0) {
      return selectEnemyFromPool(elitePool, threatTier, forceId, difficulty, preferred) ??
        selectEnemyFromPool(enemyPool, threatTier, forceId, difficulty, preferred) ??
        'goblinSoldier';
    }
    if (opening) return 'goblinSoldier';
    return selectEnemyFromPool(enemyPool, threatTier, forceId + unitIndex, difficulty, preferred) ?? 'goblinSoldier';
  });
}

function enemyBossType(enemyPool, forceId, difficulty, threatTier, bossOrdinal) {
  const levelBossPool = enemyPool.filter((entry) => WAVE_BOSS_TYPES.includes(entry?.type));
  const fallbackPool = WAVE_BOSS_TYPES.map((type) => ({
    type,
    weight: 1,
    minThreat: WAVE_MONSTER_UNLOCKS[type]?.minWave ?? 1,
    minDifficulty: 1
  }));
  return selectEnemyFromPool(
    levelBossPool.length ? levelBossPool : fallbackPool,
    threatTier,
    forceId + bossOrdinal,
    difficulty
  ) ?? 'goblinTroll';
}

function chooseDirectorAffix(threatTier, kind, flow = DEFAULT_WAVE_AFFIX_FLOW) {
  const usable = normalizeWaveAffixFlow(flow);
  const offset = Math.max(0, Math.floor(threatTier) - 3);
  const affixId = usable[offset % usable.length];
  if (WAVE_AFFIX_DEFINITIONS[affixId]) return affixId;
  return kind === 'boss' ? 'siege' : 'swarm';
}

function enemyForceKindLabel(kind) {
  if (kind === 'boss') return 'Boss 部队';
  if (kind === 'elite') return '精英部队';
  if (kind === 'normal-squad') return '小怪小队';
  return '小怪';
}

function strategyAssaultKind(index, config = {}) {
  const bossInterval = Math.max(1, Math.floor(config.bossInterval ?? 12));
  const eliteInterval = Math.max(1, Math.floor(config.eliteInterval ?? 4));
  if (index % bossInterval === 0) return 'boss';
  if (index % eliteInterval === 0) return 'elite';
  return 'normal';
}

function strategyAssaultDifficulty(session, index, config = {}) {
  const escalationSeconds = Math.max(1, config.escalationSeconds ?? 82);
  const expectedAssaultsPerTier = Math.max(
    3,
    Math.round(escalationSeconds / Math.max(4, config.spawnIntervalSeconds ?? 12))
  );
  return resolveSessionBaseDifficulty(session) + Math.floor(Math.max(0, index - 1) / expectedAssaultsPerTier);
}

function strategyAssaultCount(kind, index, difficulty, config = {}, bossOrdinal = 0) {
  if (kind === 'boss') {
    return Math.min(4, 2 + Math.floor(Math.max(0, bossOrdinal - 1) / 2));
  }
  if (kind === 'elite') {
    return Math.min(3, 2 + Math.floor(Math.max(0, index - 1) / 8));
  }
  const earlyWeakAssaults = Math.max(0, Math.floor(config.earlyWeakAssaults ?? 4));
  if (index <= earlyWeakAssaults) return index <= 2 ? 1 : 2;
  const maxGroupSize = Math.max(2, Math.floor(config.maxNormalGroupSize ?? 4));
  return Math.min(
    maxGroupSize,
    2 + Math.floor((index - earlyWeakAssaults) / 4) + Math.floor(Math.max(0, difficulty - 1) * 0.16)
  );
}

function strategyAssaultTypes({ level, index, kind, count, difficulty, bossOrdinal, earlyWeakAssaults }) {
  const enemyPool = Array.isArray(level?.enemyPool) ? level.enemyPool : [];
  return Array.from({ length: count }, (_, unitIndex) => {
    if (kind === 'boss' && unitIndex === 0) {
      return strategyBossType(enemyPool, index, difficulty, bossOrdinal);
    }
    if (index <= earlyWeakAssaults) return 'goblinSoldier';
    return selectEnemyFromPool(enemyPool, index, unitIndex, difficulty) ?? 'goblinSoldier';
  });
}

function strategyBossType(enemyPool, index, difficulty, bossOrdinal) {
  const levelBossPool = enemyPool.filter((entry) => WAVE_BOSS_TYPES.includes(entry?.type));
  const fallbackPool = WAVE_BOSS_TYPES.map((type) => ({
    type,
    weight: 1,
    minWave: WAVE_MONSTER_UNLOCKS[type]?.minWave ?? 1,
    minDifficulty: 1
  }));
  return selectEnemyFromPool(
    levelBossPool.length ? levelBossPool : fallbackPool,
    index,
    bossOrdinal,
    difficulty
  ) ?? 'goblinTroll';
}

function strategyAssaultKindLabel(assault) {
  if (assault.kind === 'boss') return 'Boss 攻势';
  if (assault.kind === 'elite') return '精英突袭';
  if (assault.index <= 2) return '侦察小队';
  return '敌军攻势';
}

function strategyAssaultPreview(assault) {
  const types = [...new Set(assault.types ?? [])]
    .slice(0, 2)
    .map((type) => UNIT_DEFINITIONS[type]?.name ?? type)
    .join(' / ');
  const affix = waveAffixListLabel(assault);
  return `${assault.count} 名${types ? ` · ${types}` : ''}${affix ? ` · ${affix}` : ''}`;
}

function createWaveSchedule(session) {
  const level = session.level ?? {};
  const baseDifficulty = resolveSessionBaseDifficulty(session);
  const selectedDifficulty = clampLevelDifficulty(session?.difficulty ?? 1);
  const difficultyGrowth = resolveSessionDifficultyGrowth(session);
  const affixFlow = normalizeWaveAffixFlow(level.waveAffixFlow);
  const totalWaves = TOTAL_WAVES;
  const schedule = [];

  for (let index = 1; index <= totalWaves; index += 1) {
    const isBoss = index % WAVES_PER_BOSS === 0;
    const kind = isBoss ? 'boss' : index % ELITE_WAVE_INTERVAL === 0 ? 'elite' : 'normal';
    const bossOrdinal = isBoss ? Math.floor(index / WAVES_PER_BOSS) : 0;
    const opening = index <= 2;
    const difficultyBonus = waveDifficultyBonus(index, difficultyGrowth);
    const effectiveDifficulty = baseDifficulty + difficultyBonus;
    const affixId = chooseWaveAffix(index, kind, affixFlow);
    const affixIds = chooseWaveAffixes(index, kind, affixFlow, effectiveDifficulty);
    const affix = WAVE_AFFIX_DEFINITIONS[affixId];
    const countBonus = waveAffixCountBonus(affix, index, kind);
    const count = Math.min(
      MAX_ACTIVE_WAVE_SPAWNS,
      waveEnemyCount(kind, index, effectiveDifficulty, bossOrdinal) + countBonus
    );
    const types = enemyForceTypes({
      level,
      forceId: index,
      kind,
      count,
      difficulty: effectiveDifficulty,
      threatTier: index,
      bossOrdinal,
      opening,
      affixId,
      compositionPreferred: new Set()
    });
    schedule.push({
      id: index,
      index,
      kind,
      affixId,
      affixIds,
      bossOrdinal,
      count,
      types,
      effectiveDifficulty,
      difficultyBonus,
      threatTier: index,
      opening
    });
  }

  return schedule;
}

function waveAffixCountBonus(affix, index, kind) {
  const bonus = Math.max(0, Math.floor(affix?.countBonus ?? 0));
  if (bonus <= 0) return 0;
  if (kind === 'boss') return bonus;
  if (index <= 1) return 0;
  if (index <= 4) return Math.min(1, bonus);
  return bonus;
}

function waveEnemyCount(kind, index, difficulty, bossOrdinal) {
  if (kind === 'boss') {
    return Math.min(MAX_ACTIVE_WAVE_SPAWNS, 2 + bossOrdinal + Math.floor((difficulty - 1) * 0.32));
  }
  if (kind === 'elite') {
    return Math.min(MAX_ACTIVE_WAVE_SPAWNS, 2 + Math.floor(index * 0.38) + Math.floor((difficulty - 1) * 0.25));
  }
  return Math.min(MAX_ACTIVE_WAVE_SPAWNS, 2 + Math.floor(index * 0.42) + Math.floor((difficulty - 1) * 0.22));
}

function waveEnemyTypes({ kind, count, random, monsterPool, bossPool, affixId = null }) {
  if (kind === 'boss') {
    return [
      pickFromPool(bossPool, random),
      ...Array.from({ length: Math.max(0, count - 1) }, () => pickWaveMonster(monsterPool, random, affixId))
    ];
  }
  const typeCount = kind === 'elite' ? Math.min(3, count) : Math.min(2, count);
  return Array.from({ length: typeCount }, () => pickWaveMonster(monsterPool, random, affixId));
}

function filterWaveMonsterPool(pool, wave, difficulty) {
  const valid = pool.filter((type) => UNIT_DEFINITIONS[type]);
  const unlocked = valid.filter((type) => isWaveMonsterUnlocked(type, wave, difficulty));
  if (unlocked.length) return unlocked;
  return valid.filter((type) => isEarlyMonster(type));
}

function filterWaveBossPool(pool, bossOrdinal, difficulty) {
  const valid = pool.filter((type) => UNIT_DEFINITIONS[type]);
  const unlocked = valid.filter((type) => isWaveBossUnlocked(type, bossOrdinal, difficulty));
  if (unlocked.length) return unlocked;
  return valid.length ? valid : WAVE_BOSS_TYPES.filter((type) => UNIT_DEFINITIONS[type]);
}

function resolveSessionBaseDifficulty(session) {
  const level = session?.level ?? {};
  const selectedDifficulty = clampLevelDifficulty(session?.difficulty ?? 1);
  return Math.max(1, Math.floor(level.baseDifficulty ?? 1) + selectedDifficulty - 1);
}

function resolveSessionDifficultyGrowth(session) {
  const level = session?.level ?? {};
  const selectedDifficulty = clampLevelDifficulty(session?.difficulty ?? 1);
  const levelGrowth = Number.isFinite(level.waveDifficultyGrowth)
    ? Math.max(0.1, level.waveDifficultyGrowth)
    : 1;
  return levelGrowth * (1 + (selectedDifficulty - 1) * WAVE_DIFFICULTY_GROWTH_PER_SELECTED_DIFFICULTY);
}

function wavePreviewNodeCount() {
  if (window.matchMedia?.('(pointer: coarse)')?.matches) {
    return MOBILE_WAVE_PREVIEW_COUNT;
  }
  return WAVE_PREVIEW_COUNT;
}

function waveDifficultyBonus(wave, sessionOrGrowth = 1) {
  const growth = Number.isFinite(sessionOrGrowth)
    ? sessionOrGrowth
    : resolveSessionDifficultyGrowth(sessionOrGrowth);
  const steps = Math.max(0, wave - 1);
  if (steps <= 0) return 0;
  const slowSteps = Math.min(steps, 5);
  const fastSteps = Math.max(0, steps - 5);
  const weightedSteps = slowSteps * 0.55 + fastSteps * 1.25;
  return Math.floor((weightedSteps / WAVE_DIFFICULTY_STEP_WAVES) * growth);
}

function clampLevelDifficulty(value) {
  const number = Number(value);
  const integer = Number.isFinite(number) ? Math.floor(number) : 1;
  return Math.max(1, Math.min(MAX_LEVEL_DIFFICULTY, integer));
}

function normalizeTypePool(types, fallback) {
  const valid = (types ?? []).filter((type) => UNIT_DEFINITIONS[type]);
  if (valid.length) return valid;
  return fallback.filter((type) => UNIT_DEFINITIONS[type]);
}

function isWaveMonsterUnlocked(type, wave, difficulty) {
  const unlock = WAVE_MONSTER_UNLOCKS[type] ?? {};
  return wave >= (unlock.minWave ?? 1) && difficulty >= (unlock.minDifficulty ?? 1);
}

function isWaveBossUnlocked(type, bossOrdinal, difficulty) {
  const unlock = WAVE_BOSS_UNLOCKS[type] ?? {};
  return bossOrdinal >= (unlock.minBoss ?? 1) && difficulty >= (unlock.minDifficulty ?? 1);
}

function isEarlyMonster(type) {
  return (WAVE_MONSTER_UNLOCKS[type]?.minWave ?? 1) <= 1;
}

function pickFromPool(pool, random) {
  return pool[Math.floor(random() * pool.length)] ?? 'goblinSoldier';
}

function pickWaveMonster(pool, random, affixId) {
  const preferred = new Set(WAVE_AFFIX_DEFINITIONS[affixId]?.preferredTypes ?? []);
  if (!preferred.size) return pickFromPool(pool, random);
  const weighted = pool.flatMap((type) => (
    preferred.has(type) ? [type, type, type, type] : [type]
  ));
  return pickFromPool(weighted, random);
}

function normalizeWaveAffixFlow(flow) {
  const valid = (flow ?? DEFAULT_WAVE_AFFIX_FLOW).filter((affixId) => WAVE_AFFIX_DEFINITIONS[affixId]);
  return valid.length ? valid : DEFAULT_WAVE_AFFIX_FLOW;
}

function chooseWaveAffix(index, kind, flow = DEFAULT_WAVE_AFFIX_FLOW) {
  const affixIds = chooseWaveAffixes(index, kind, flow, 1);
  return affixIds[0] ?? (kind === 'boss' ? 'siege' : 'swarm');
}

function chooseWaveAffixes(index, kind, flow = DEFAULT_WAVE_AFFIX_FLOW, effectiveDifficulty = 1) {
  const normalized = normalizeWaveAffixFlow(flow);
  const count = waveAffixCount(index, kind, effectiveDifficulty);
  const affixIds = [];
  for (let offset = 0; offset < count; offset += 1) {
    const affixId = normalized[(index - 1 + offset) % normalized.length];
    if (!WAVE_AFFIX_DEFINITIONS[affixId] || affixIds.includes(affixId)) continue;
    affixIds.push(affixId);
  }
  if (!affixIds.length) {
    affixIds.push(kind === 'boss' ? 'siege' : 'swarm');
  }
  return affixIds;
}

function waveAffixCount(index, kind, effectiveDifficulty = 1) {
  if (index <= 2) return 1;
  let count = 1;
  const difficulty = Math.max(1, Math.floor(effectiveDifficulty ?? 1));
  if (difficulty >= 3) count = 2;
  if (difficulty >= 5 && (kind === 'elite' || kind === 'boss')) count = Math.max(count, 2);
  if (difficulty >= 7 && kind === 'boss') count = 3;
  if (difficulty >= 9 && kind === 'elite') count = 3;
  return Math.min(3, count);
}

function waveAffixIdsForConfig(waveConfig) {
  if (Array.isArray(waveConfig?.affixIds) && waveConfig.affixIds.length) {
    return waveConfig.affixIds.filter((affixId) => WAVE_AFFIX_DEFINITIONS[affixId]);
  }
  return waveConfig?.affixId ? [waveConfig.affixId] : [];
}

function waveAffixPreviewLabel(wave) {
  const affixIds = waveAffixIdsForConfig(wave);
  if (!affixIds.length) return '';
  return affixIds
    .map((affixId) => {
      const affix = WAVE_AFFIX_DEFINITIONS[affixId];
      return affix ? `${affix.name}附魔` : affixId;
    })
    .join(' · ');
}

function waveAffixPreviewMarkup(wave) {
  const label = waveAffixPreviewLabel(wave);
  if (!label) return '';
  return `<span class="wave-preview-affix">${escapeHtml(label)}</span>`;
}

function waveAffixLevel(waveConfig) {
  const threatTier = Math.max(1, Math.floor(waveConfig?.threatTier ?? waveConfig?.index ?? 1));
  return 1 + Math.floor((threatTier - 1) / 3);
}

function isUnitInWave(unit, wave) {
  if (!unit || !wave) return false;
  return unit.enemyForce === wave;
}

function waveKindLabel(wave) {
  if (wave.kind === 'boss') return `Boss ${wave.bossOrdinal}/${BOSS_WAVES_TO_WIN}`;
  if (wave.kind === 'elite') return '精英';
  return '普通';
}

function waveKindShortLabel(wave) {
  if (wave.kind === 'boss') return 'Boss';
  if (wave.kind === 'elite') return '精英';
  return '普通';
}

function cardRunLocationLabel(game, card) {
  const cs = game?.cardSystem;
  if (!cs || !card) return '卡牌';
  if (cs.handCards.includes(card)) return '手牌';
  if (cs.temporaryCards.includes(card)) return '临时';
  if (cs.drawPile.includes(card)) return '抽牌堆';
  if (cs.discardPile.includes(card)) return '弃牌堆';
  return '卡牌';
}

function waveAffixLabel(affixId) {
  const affix = WAVE_AFFIX_DEFINITIONS[affixId];
  if (!affix) return '无词缀';
  return `${affix.name}附魔`;
}

function waveAffixListLabel(wave) {
  const affixIds = waveAffixIdsForConfig(wave);
  if (!affixIds.length) return '无词缀';
  return affixIds.map((affixId) => waveAffixLabel(affixId)).join(' · ');
}

function waveEventKicker(wave) {
  if (!wave) return '战场事件';
  const forceThreat = Number(wave.threat ?? wave.threatTier);
  if (Number.isFinite(forceThreat) || wave.requestedKind) {
    const kind = wave.requestedKind ?? wave.kind ?? 'normal';
    const affix = waveAffixListLabel(wave);
    const affixText = affix && affix !== '无词缀' ? ` · ${affix}` : '';
    const threat = Number.isFinite(forceThreat) ? ` / 威胁 ${forceThreat.toFixed(1)}` : '';
    return `敌军${enemyForceKindLabel(kind)}${threat}${affixText}`;
  }
  return `第 ${wave.index} 波结束 / ${waveKindLabel(wave)} · ${waveAffixListLabel(wave)}`;
}

function pickRandomItems(items, count) {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

function pickWeightedCardItems(items, count, readWeight) {
  const pool = [...items];
  const result = [];
  while (pool.length && result.length < count) {
    const weights = pool.map((item) => Math.max(0.01, readWeight(item)));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = Math.random() * total;
    let pickedIndex = 0;
    for (let index = 0; index < weights.length; index += 1) {
      roll -= weights[index];
      if (roll <= 0) {
        pickedIndex = index;
        break;
      }
    }
    result.push(pool.splice(pickedIndex, 1)[0]);
  }
  return result;
}

function cardChoiceWeightForWave(card, wave) {
  if (!wave?.affixId || !card) return 1;
  const id = card.id ?? '';
  const kind = card.kind ?? '';
  const unitType = card.unitType ?? '';
  let weight = 1;
  if (wave.kind === 'boss') weight += 0.5;
  if (wave.affixId === 'swarm') {
    if (kind === 'spell' || id.includes('meteor') || id.includes('fog')) weight += 3;
    if (id.includes('arrow-tower')) weight += 0.8;
    if (unitType === 'waterMage' || unitType === 'crossbowman') weight += 1.2;
  } else if (wave.affixId === 'armored') {
    if (kind === 'enchant' && /(poison|bleed|curse|power|spirit)/.test(id)) weight += 3;
    if (unitType === 'crossbowman' || unitType === 'waterMage') weight += 2;
    if (kind === 'tactic' || kind === 'ability') weight += 0.8;
  } else if (wave.affixId === 'rush') {
    if (/(knights|swordsmen|berserkers|warders|toughness|protection|block|white-smoke)/.test(id)) weight += 3;
    if (kind === 'building') weight += 0.4;
    if (kind === 'summon' && ['knight', 'swordsman', 'berserker', 'engineer'].includes(unitType)) weight += 1.4;
  } else if (wave.affixId === 'ranged') {
    if (/(rogues|berserkers|white-smoke|meteor|focus-energy)/.test(id)) weight += 3;
    if (kind === 'summon' && ['rogue', 'berserker', 'knight'].includes(unitType)) weight += 1.6;
    if (kind === 'enchant' && /(spirit-shield|protection|recovery)/.test(id)) weight += 1.2;
  } else if (wave.affixId === 'siege') {
    if (/(knights|swordsmen|berserkers|engineers|physicians|spirit-shield|recovery|protection)/.test(id)) {
      weight += 3;
    }
    if (/(repair-station|beacon)/.test(id)) weight += 0.8;
    if (kind === 'spell' && /(meteor|poison-fog)/.test(id)) weight += 1.5;
  }
  return weight;
}

function isOpeningCombatSummon(card) {
  if (card?.kind !== 'summon' || !card.unitType) return false;
  const unit = UNIT_DEFINITIONS[card.unitType];
  if (!unit || unit.isBuilding || unit.support) return false;
  return (unit.damage ?? 0) >= 3 && (unit.attackRange ?? 0) > 0;
}

function runtimeUnitUpgradeDefinition(unitType, upgradeId) {
  return UNIT_GENERIC_UPGRADES.find((upgrade) => upgrade.id === upgradeId) ??
    (UNIT_SPECIAL_UPGRADES[unitType] ?? []).find((upgrade) => upgrade.id === upgradeId) ??
    null;
}

function teamGenericUpgradeAmount(baseValue) {
  return Math.max(1, Math.round(Math.max(0, baseValue) * 0.1));
}

function unitGenericUpgradeModifiers(unit, upgrade, index = 0) {
  void index;
  if (upgrade.stat === 'vitality') {
    return [
      {
        stat: 'maxHealth',
        type: 'add',
        amount: teamGenericUpgradeAmount(unit.maxHealth ?? unit.attributes?.get?.('maxHealth') ?? 0)
      },
      {
        stat: 'maxDurability',
        type: 'add',
        amount: teamGenericUpgradeAmount(
          unit.weapon?.maxDurability ?? unit.maxDurability ?? unit.attributes?.get?.('maxDurability') ?? 0
        )
      }
    ];
  }
  if (upgrade.stat === 'attack') {
    return [{
      stat: 'attackDamage',
      type: 'add',
      amount: teamGenericUpgradeAmount(unit.attackDamage ?? unit.attributes?.get?.('attackDamage') ?? 0)
    }];
  }
  if (upgrade.stat === 'armor') {
    return [{
      stat: 'armor',
      type: 'add',
      amount: teamGenericUpgradeAmount(unit.armor ?? unit.attributes?.get?.('armor') ?? 0)
    }];
  }
  if (upgrade.stat === 'magicResistance') {
    return [{
      stat: 'magicResistance',
      type: 'add',
      amount: teamGenericUpgradeAmount(
        unit.magicResistance ?? unit.attributes?.get?.('magicResistance') ?? 0
      )
    }];
  }
  return [];
}

function scaleUnitHealthAfterMaxHealthChange(unit, previousMaxHealth) {
  const prevMax = Math.max(1, previousMaxHealth);
  const ratio = clamp(unit.health / prevMax, 0, 1);
  unit.health = Math.max(1, unit.maxHealth * ratio);
}

function applySupportUpgrade(unit, supportModifiers) {
  if (!supportModifiers || !unit.definition.support) return;
  Object.entries(supportModifiers).forEach(([key, modifier]) => {
    const ability = unit.definition.support[key];
    if (!ability) return;
    if (Number.isFinite(modifier.amountFactor) && Number.isFinite(ability.amount)) {
      ability.amount *= modifier.amountFactor;
    }
    if (Number.isFinite(modifier.amountFactor) && Number.isFinite(ability.baseHealthPercent)) {
      ability.baseHealthPercent *= modifier.amountFactor;
    }
    if (Number.isFinite(modifier.amountFactor) && Number.isFinite(ability.baseDurabilityPercent)) {
      ability.baseDurabilityPercent *= modifier.amountFactor;
    }
    if (Number.isFinite(modifier.cooldownFactor) && Number.isFinite(ability.cooldown)) {
      ability.cooldown *= modifier.cooldownFactor;
    }
    if (Number.isFinite(modifier.tickIntervalFactor) && Number.isFinite(ability.tickInterval)) {
      ability.tickInterval *= modifier.tickIntervalFactor;
    }
  });
}

const SUMMON_CARD_LEVEL_STAT_PERCENT = 0.25;
const UNIT_SUMMON_LEVEL_STATS = [
  'maxHealth',
  'maxShield',
  'moveSpeed',
  'attackRange',
  'attackRate',
  'attackDamage',
  'armor',
  'magicResistance',
  'knockback',
  'knockbackResistance',
  'aggroRange',
  'projectileSpeed',
  'dodgeChance',
  'maxDurability'
];

function summonCardLevelModifiers(bonusLevel) {
  if (bonusLevel <= 0) return [];
  const percent = SUMMON_CARD_LEVEL_STAT_PERCENT * bonusLevel;
  return UNIT_SUMMON_LEVEL_STATS.map((stat) => ({
    stat,
    type: 'multiply',
    percent
  }));
}

function modifiersAffectHealthOrDurability(modifiers = []) {
  return modifiers.some((modifier) => (
    modifier.stat === 'maxHealth' || modifier.stat === 'maxDurability'
  ));
}

function syncUnitAfterMaxHealthModifiers(unit, previousMaxHealth) {
  scaleUnitHealthAfterMaxHealthChange(unit, previousMaxHealth);
  unit.weapon.durability = Math.min(unit.weapon.maxDurability, unit.weapon.durability);
}

function applySummonCardLevelModifiers(unit, card) {
  if (card?.kind !== 'summon') return;
  const bonusLevel = Math.max(0, Math.floor(card?.level ?? 1) - 1);
  if (bonusLevel <= 0) return;
  const previousMaxHealth = unit.maxHealth;
  unit.attributes.addModifiers(
    summonCardLevelModifiers(bonusLevel),
    `card:${card.id}:summon-level`
  );
  syncUnitAfterMaxHealthModifiers(unit, previousMaxHealth);
  unit.clampToAttributeCaps?.();
  unit.statusUiDirty = true;
}

function applyBuildingCardUpgrade(unit, card) {
  if (card?.kind !== 'building') return;
  const bonusLevel = Math.max(0, Math.floor(card.level ?? 1) - 1);
  if (bonusLevel <= 0) return;
  const source = `card:${card.id}:building-level`;
  if (unit.type === 'arrowTower') {
    unit.attributes.addModifiers([
      {
        stat: 'attackDamage',
        type: 'multiply',
        percent: 0.18 * bonusLevel
      },
      {
        stat: 'attackRate',
        type: 'multiply',
        percent: 0.08 * bonusLevel
      },
      {
        stat: 'attackRange',
        type: 'add',
        amount: 0.35 * bonusLevel
      }
    ], source);
    return;
  }
  if (unit.definition.buildingAura) {
    const aura = unit.definition.buildingAura;
    aura.radius = (aura.radius ?? 4.4) + 0.28 * bonusLevel;
    if (Number.isFinite(aura.durabilityPerSecond)) {
      aura.durabilityPerSecond *= 1 + 0.18 * bonusLevel;
    }
    if (Number.isFinite(aura.healthPerDurability)) {
      aura.healthPerDurability *= 1 + 0.12 * bonusLevel;
    }
    if (Number.isFinite(aura.restorePerDurability)) {
      aura.restorePerDurability *= 1 + 0.12 * bonusLevel;
    }
    return;
  }
  if (unit.definition.deploymentBeacon) {
    unit.definition.deploymentRadius = (unit.definition.deploymentRadius ?? 7.5) + 0.75 * bonusLevel;
  }
}

function cardSortKey(card) {
  const order = {
    summon: '1',
    building: '2',
    spell: '3',
    enchant: '4',
    tactic: '5',
    ability: '6'
  }[card?.kind] ?? '9';
  return `${order}:${card?.name ?? card?.id ?? ''}`;
}

function formatSilverAmount(amount) {
  const value = Math.max(0, Number(amount) || 0);
  if (Math.abs(value - Math.round(value)) < 0.05) return String(Math.round(value));
  return value.toFixed(1);
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function strategyRewardMarkup(choice, index) {
  const visual = strategyRewardVisualMeta(choice);
  const title = choice.title ?? choice.card?.name ?? '奖励';
  const description = choice.description ?? choice.card?.summary ?? '';
  const meta = choice.metaText ? `<span class="strategy-reward-meta">${escapeHtml(choice.metaText)}</span>` : '';
  const disabledAttr = choice.disabled ? ' disabled aria-disabled="true"' : '';
  const iconClass = 'strategy-reward-icon';
  return `
    <button
      class="strategy-reward-option is-${visual.kindKey}${choice.disabled ? ' is-disabled' : ''}"
      type="button"
      data-strategy-choice-index="${index}"
      style="--reward-accent:${visual.accent}"${disabledAttr}
    >
      <span class="${iconClass}" aria-hidden="true">${escapeHtml(visual.icon)}</span>
      <span class="strategy-reward-type">${escapeHtml(visual.typeLabel)}</span>
      <strong class="strategy-reward-title">${escapeHtml(title)}</strong>
      <p class="strategy-reward-desc">${escapeHtml(description)}</p>
      ${meta}
      <span class="strategy-reward-action">${escapeHtml(choice.actionLabel ?? visual.actionLabel)}</span>
    </button>
  `;
}

function strategyRewardVisualMeta(choice) {
  if (choice.action === 'apply-team-upgrade' || choice.upgrade?.kind === 'unit-generic') {
    return {
      kindKey: 'attribute',
      typeLabel: '属性强化',
      actionLabel: '获得强化',
      icon: '↑',
      accent: '#9eeedb'
    };
  }
  if (choice.action === 'apply-team-special-upgrade' || choice.upgrade?.kind === 'unit-special') {
    return {
      kindKey: 'trait',
      typeLabel: '特性强化',
      actionLabel: '获得特性',
      icon: '★',
      accent: '#ffd166'
    };
  }
  if (choice.action === 'copy-card') {
    const card = choice.card ?? choice.targetCard;
    return {
      kindKey: 'copy',
      typeLabel: '复制奖励',
      actionLabel: '复制卡牌',
      icon: '⧉',
      accent: cardThemeColor(card)
    };
  }
  if (choice.action === 'remove-card') {
    const card = choice.card ?? choice.targetCard;
    return {
      kindKey: 'remove',
      typeLabel: '移除卡牌',
      actionLabel: '移除卡牌',
      icon: '✕',
      accent: '#ff8a8a'
    };
  }
  if (choice.action === 'upgrade-card') {
    const card = choice.card ?? choice.targetCard;
    return {
      kindKey: 'upgrade',
      typeLabel: '升级卡牌',
      actionLabel: '升级卡牌',
      icon: '⬆',
      accent: cardThemeColor(card)
    };
  }
  if (choice.action === 'grant-temporary-card') {
    const card = choice.temporaryCard ?? choice.card;
    return {
      kindKey: 'temporary',
      typeLabel: '临时牌',
      actionLabel: '获得临时牌',
      icon: '⏱',
      accent: cardThemeColor(card)
    };
  }
  if (choice.action === 'acquire-ability') {
    const card = choice.card;
    return {
      kindKey: 'ability',
      typeLabel: '能力卡',
      actionLabel: '获得能力',
      icon: '★',
      accent: cardThemeColor(card)
    };
  }
  if (choice.action === 'add-card') {
    const card = choice.card;
    return {
      kindKey: 'card',
      typeLabel: '卡牌奖励',
      actionLabel: '获得卡牌',
      icon: '▣',
      accent: cardThemeColor(card)
    };
  }
  return {
    kindKey: 'reward',
    typeLabel: strategyRewardKindLabel(choice, choice.card ?? {}),
    actionLabel: choice.actionLabel ?? '选择',
    icon: '✦',
    accent: choice.color ?? '#9eeedb'
  };
}

function strategyChoiceMarkup(choice, index) {
  return strategyRewardMarkup(choice, index);
}

function resolveStrategyChoiceCard(choice, index) {
  if (choice.card) return choice.card;
  return {
    id: `strategy-choice-${index}`,
    name: choice.title ?? '奖励',
    kind: rewardOptionCardKind(choice),
    label: rewardOptionLabel(choice),
    artKey: choice.artKey ?? 'tacticUpgrade',
    summary: choice.description ?? '',
    energyCost: 0,
    color: choice.color ?? '#9eeedb',
    level: 1
  };
}

function strategyRewardKindLabel(choice, card) {
  if (choice.action === 'apply-team-upgrade') return '全队训练';
  if (choice.action === 'apply-team-special-upgrade') return '兵种专精';
  if (choice.action === 'apply-card-upgrade') {
    return choice.upgrade?.kind === 'unit-special' ? '兵种专精' : '全队训练';
  }
  if (choice.action === 'copy-card') return '复制';
  if (choice.action === 'grant-temporary-card') return '临时牌';
  return strategyKindLabel(card.kind);
}

function dedupeStrategyChoices(choices) {
  const seen = new Set();
  return choices.filter((choice) => {
    const key = strategyChoiceDedupeKey(choice);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function strategyChoiceDedupeKey(choice) {
  if (choice.action === 'apply-team-upgrade') {
    return `team-upgrade:${choice.upgrade?.id}`;
  }
  if (choice.action === 'apply-team-special-upgrade') {
    return `team-special:${choice.unitType}:${choice.upgrade?.id}`;
  }
  if (choice.action === 'apply-card-upgrade') {
    return `upgrade:${choice.targetCard?.unitType ?? choice.targetCard?.id}:${choice.upgrade?.id}`;
  }
  if (choice.action === 'add-card') return `add:${choice.card?.id}`;
  if (choice.action === 'copy-card') return `copy:${choice.card?.id}`;
  if (choice.action === 'grant-temporary-card') return `temp:${choice.temporaryCard?.id ?? choice.card?.id}`;
  return `${choice.action}:${choice.title}:${choice.description}`;
}

function strategyEventTypeMeta(type) {
  if (type === 'opening-unit') {
    return { key: 'opening', mark: '初', label: '开局选牌' };
  }
  if (type === 'wave-reward') {
    return { key: 'choice', mark: '奖', label: '战场奖励' };
  }
  if (type === 'card-kind-choice') {
    return { key: 'choice', mark: '选', label: '选牌奖励' };
  }
  if (type === 'existing-card-copy') {
    return { key: 'copy', mark: '复', label: '复制奖励' };
  }
  if (type === 'card-maintenance') {
    return { key: 'upgrade', mark: '升', label: '升级事件' };
  }
  if (type === 'unit-upgrade') {
    return { key: 'unit-upgrade', mark: '专', label: '单位专精' };
  }
  if (type === 'card-copy') {
    return { key: 'copy', mark: '复', label: '复制事件' };
  }
  return { key: 'choice', mark: '选', label: '选牌奖励' };
}

function strategyChoiceActionMeta(choice) {
  if (choice.action === 'open-card-kind-choice') return { key: 'select-upgrade', label: '选卡方向' };
  if (choice.action === 'open-card-upgrade-choice') return { key: 'upgrade-card', label: '升级入口' };
  if (choice.action === 'open-card-copy-choice') return { key: 'copy-card', label: '复制入口' };
  if (choice.action === 'grant-temporary-card') return { key: 'restore-card', label: '临时奖励' };
  if (choice.action === 'add-card') return { key: 'add-card', label: '新卡奖励' };
  if (choice.action === 'select-upgrade-card') return { key: 'select-upgrade', label: '选择升级对象' };
  if (choice.action === 'apply-team-upgrade') return { key: 'team-upgrade', label: '全队训练' };
  if (choice.action === 'apply-team-special-upgrade') return { key: 'team-special', label: '兵种专精' };
  if (choice.action === 'apply-card-upgrade') return { key: 'apply-upgrade', label: '升级倾向' };
  if (choice.action === 'upgrade-card') return { key: 'upgrade-card', label: '等级提升' };
  if (choice.action === 'copy-card') return { key: 'copy-card', label: '复制奖励' };
  return { key: choice.action ?? 'choice', label: choice.actionLabel ?? '奖励' };
}

function strategyKindLabel(kind) {
  if (kind === 'summon') return '单位卡';
  if (kind === 'building') return '建筑卡';
  if (kind === 'spell') return '法术卡';
  if (kind === 'tactic') return '战术卡';
  if (kind === 'ability') return '能力卡';
  return '附魔卡';
}

function rewardOptionCardKind(option) {
  if (option.cardKind) return option.cardKind;
  if (option.action === 'open-card-upgrade-choice') return 'tactic';
  if (option.action === 'open-card-copy-choice') return 'ability';
  return 'tactic';
}

function rewardOptionLabel(option) {
  if (option.cardKind === 'summon') return '兵';
  if (option.cardKind === 'spell') return '法';
  if (option.cardKind === 'enchant') return '附';
  if (option.cardKind === 'tactic') return '策';
  if (option.cardKind === 'ability') return '能';
  if (option.cardKind === 'building') return '建';
  if (option.action === 'open-card-upgrade-choice') return '升';
  if (option.action === 'open-card-copy-choice') return '复';
  return '奖';
}

function rewardOptionMetaText(option) {
  if (option.cardKind) return `${strategyKindLabel(option.cardKind)} / 三选一`;
  if (option.action === 'open-card-upgrade-choice') return '已有卡牌 / 升级倾向';
  if (option.action === 'open-card-copy-choice') return '已有卡牌 / 满次数复制';
  return '特殊临时牌 / 本局限定';
}

function createInitialShopPrices() {
  const basePrice = Number(BALANCE.runCurrency?.shop?.basePrice ?? RUN_SHOP_BASE_PRICE);
  const prices = {};
  RUN_SHOP_CATEGORIES.forEach((category) => {
    prices[category.key] = basePrice;
  });
  return prices;
}

function createRunShopUi() {
  return ensureRunShopUi(null);
}

function ensureRunShopUi(existing = null) {
  const overlays = [...document.querySelectorAll('#run-shop-overlay')];
  let overlay = overlays[0] ?? null;
  for (let i = 1; i < overlays.length; i += 1) {
    overlays[i].remove();
  }
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'run-shop-overlay';
    overlay.className = 'run-shop-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = RUN_SHOP_OVERLAY_INNER_HTML;
    document.body.appendChild(overlay);
  } else {
    document.body.appendChild(overlay);
  }
  const root = overlay.querySelector('#run-shop-panel');
  return {
    overlay,
    root,
    toggle: existing?.toggle ?? document.querySelector('#run-shop-toggle'),
    kicker: root?.querySelector('.run-shop-kicker'),
    title: root?.querySelector('.run-shop-title'),
    silver: root?.querySelector('#run-shop-silver'),
    services: root?.querySelector('#run-shop-services'),
    skip: root?.querySelector('#run-shop-skip'),
    choices: root?.querySelector('#run-shop-choices'),
    choiceList: root?.querySelector('#run-shop-choice-list')
  };
}

const RUN_SHOP_OVERLAY_INNER_HTML = `
  <section id="run-shop-panel" class="run-shop-panel" aria-label="军需铺" tabindex="-1">
    <header class="run-shop-header">
      <div class="run-shop-heading">
        <span class="run-shop-kicker">营地军需 · B</span>
        <h2 class="run-shop-title">军需铺</h2>
      </div>
      <button id="run-shop-close" class="run-shop-close" type="button" aria-label="关闭军需铺">×</button>
    </header>
    <p class="run-shop-balance">持有 <strong id="run-shop-silver">0</strong> 银币</p>
    <div id="run-shop-services" class="run-shop-services"></div>
    <button id="run-shop-skip" class="run-shop-skip" type="button" hidden>跳过奖励，继续出征</button>
    <div id="run-shop-choices" class="run-shop-choices" hidden>
      <button id="run-shop-back" class="run-shop-back" type="button">← 返回服务列表</button>
      <div id="run-shop-choice-list" class="run-shop-choice-list"></div>
    </div>
  </section>
`;

function runShopServiceMarkup(category, game) {
  const isFree = game.runShopFreeReward === true;
  const price = game.shopPrice(category.key);
  const availability = game.canRunShopCategory(category.key);
  const canAfford = isFree || game.silver + 0.001 >= price;
  const disabled = !availability.ok || !canAfford;
  const statusText = !availability.ok
    ? availability.reason
    : isFree
      ? '免费'
      : `${formatSilverAmount(price)} 银币`;
  const isActive = game.runShopActiveCategory === category.key;
  return `
    <button
      class="run-shop-service${isActive ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}"
      type="button"
      data-run-shop-category="${escapeHtml(category.key)}"
      ${disabled ? 'disabled aria-disabled="true"' : ''}
    >
      <span class="run-shop-service-icon" aria-hidden="true">${escapeHtml(category.icon)}</span>
      <span class="run-shop-service-body">
        <strong class="run-shop-service-title">${escapeHtml(category.title)}</strong>
        <span class="run-shop-service-desc">${escapeHtml(category.description)}</span>
      </span>
      <span class="run-shop-service-price">${escapeHtml(statusText)}</span>
    </button>
  `;
}

function runShopChoiceUsesCardFace(choice) {
  const card = choice.targetCard ?? choice.card ?? choice.temporaryCard;
  if (!card) return false;
  return [
    'add-card',
    'copy-card',
    'remove-card',
    'upgrade-card',
    'grant-temporary-card'
  ].includes(choice.action);
}

function runShopCardFaceInnerMarkup(card) {
  return `
    <div class="card-cost">${cardEnergyCost(card)}</div>
    <div class="card-level">Lv.${card.level ?? 1}</div>
    ${cardUseBarMarkup(card)}
    <div class="card-face">
      <div class="card-header">
        <div class="card-rune">${escapeHtml(card.label ?? '')}</div>
        <div class="card-kind">${escapeHtml(strategyKindLabel(card.kind))}</div>
      </div>
      ${createCardArtMarkup(card)}
      <div class="card-name">${escapeHtml(card.name ?? '')}</div>
      <div class="card-text">${escapeHtml(card.summary ?? '')}</div>
    </div>
  `;
}

function runShopChoiceMarkup(choice, index, options = {}) {
  const card = choice.targetCard ?? choice.card ?? choice.temporaryCard;
  if (runShopChoiceUsesCardFace(choice)) {
    const visual = strategyRewardVisualMeta(choice);
    const description = choice.description ?? '';
    const location = options.game ? cardRunLocationLabel(options.game, card) : '';
    const locationBadge = location && location !== '卡牌'
      ? `<span class="run-shop-choice-location">${escapeHtml(location)}</span>`
      : '';
    const meta = description && description !== card.summary
      ? `<span class="run-shop-choice-desc">${escapeHtml(description)}</span>`
      : '';
    return `
      <button
        class="run-shop-choice-card strategy-reward-card card is-${visual.kindKey}${choice.disabled ? ' is-disabled' : ''}"
        type="button"
        data-run-shop-choice-index="${index}"
        style="--card-color:${cardThemeColor(card)}"
        ${choice.disabled ? 'disabled aria-disabled="true"' : ''}
      >
        ${locationBadge}
        ${runShopCardFaceInnerMarkup(card)}
        ${meta}
        <span class="run-shop-choice-action">${escapeHtml(choice.actionLabel ?? visual.actionLabel)}</span>
      </button>
    `;
  }
  const visual = strategyRewardVisualMeta(choice);
  const title = choice.title ?? choice.card?.name ?? '奖励';
  const description = choice.description ?? choice.card?.summary ?? '';
  const location = options.game ? cardRunLocationLabel(options.game, choice.targetCard ?? choice.card) : '';
  const locationBadge = location && location !== '卡牌'
    ? `<span class="run-shop-choice-location">${escapeHtml(location)}</span>`
    : '';
  return `
    <button
      class="run-shop-choice is-${visual.kindKey}${choice.disabled ? ' is-disabled' : ''}"
      type="button"
      data-run-shop-choice-index="${index}"
      style="--reward-accent:${visual.accent}"
      ${choice.disabled ? 'disabled aria-disabled="true"' : ''}
    >
      <span class="run-shop-choice-icon" aria-hidden="true">${escapeHtml(visual.icon)}</span>
      ${locationBadge}
      <strong class="run-shop-choice-title">${escapeHtml(title)}</strong>
      <span class="run-shop-choice-desc">${escapeHtml(description)}</span>
      <span class="run-shop-choice-action">${escapeHtml(choice.actionLabel ?? visual.actionLabel)}</span>
    </button>
  `;
}

function createStrategyEventUi() {
  let root = document.querySelector('#strategy-event-overlay');
  if (!root) {
    root = document.createElement('section');
    root.id = 'strategy-event-overlay';
    root.className = 'strategy-event-overlay';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    document.querySelector('#app')?.appendChild(root);
  }
  if (!root.querySelector('.strategy-event-panel')) {
    root.innerHTML = `
      <div class="strategy-event-panel">
        <div class="strategy-event-kicker"></div>
        <h2 class="strategy-event-title">选择奖励</h2>
        <p class="strategy-event-summary"></p>
        <div class="strategy-event-choices"></div>
        <div class="strategy-event-actions" hidden></div>
      </div>
    `;
  } else if (!root.querySelector('.strategy-event-actions')) {
    root.querySelector('.strategy-event-panel')?.appendChild(Object.assign(document.createElement('div'), {
      className: 'strategy-event-actions',
      hidden: true
    }));
  }
  return {
    root,
    kicker: root.querySelector('.strategy-event-kicker'),
    title: root.querySelector('.strategy-event-title'),
    summary: root.querySelector('.strategy-event-summary'),
    choices: root.querySelector('.strategy-event-choices'),
    actions: root.querySelector('.strategy-event-actions')
  };
}

function hashStringToSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cssKey(value) {
  return String(value ?? 'item').toLowerCase().replace(/[^a-z0-9-]/g, '-');
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
    '.hud, .card, .energy-panel, .card-pile-dock, .pile-viewer, .loot-confirm, .drag-ghost, .game-settings-button, .render-tuning-button, .game-command-dock, .mobile-action-dock, .pause-overlay'
      + ', .strategy-event-overlay, .debug-scene-panel, .render-tuning-panel'
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

function touchGestureMetrics(points) {
  const [a, b] = points;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    centerX: (a.x + b.x) * 0.5,
    centerY: (a.y + b.y) * 0.5,
    distance: Math.hypot(dx, dy)
  };
}

function enemyEnchantmentLevel(threatTier, difficulty) {
  return 1 + Math.floor((Math.max(1, difficulty) - 1) / 2) + Math.floor((Math.max(1, threatTier) - 1) / 3);
}

function selectEnemyFromPool(pool, threatTier, index, difficulty, preferredTypes = null) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const candidates = pool.filter((entry) => (
    threatTier >= (entry.minThreat ?? entry.minWave ?? 1) &&
    difficulty >= (entry.minDifficulty ?? 1)
  ));
  if (!candidates.length) return pool[0]?.type ?? null;

  const preferred = preferredTypes instanceof Set ? preferredTypes : new Set(preferredTypes ?? []);
  const weighted = preferred.size
    ? candidates.flatMap((entry) => {
      const repeats = preferred.has(entry.type) ? 4 : 1;
      return Array.from({ length: repeats }, () => entry);
    })
    : candidates;

  const totalWeight = weighted.reduce((sum, entry) => sum + Math.max(1, entry.weight ?? 1), 0);
  let roll = stableEnemyRoll(threatTier, index, difficulty) % totalWeight;
  for (const entry of weighted) {
    roll -= Math.max(1, entry.weight ?? 1);
    if (roll < 0) return entry.type;
  }
  return weighted[weighted.length - 1].type;
}

function stableEnemyRoll(threatTier, index, difficulty) {
  return Math.abs(
    (threatTier * 73856093) ^
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

function createRenderTuningPanel() {
  const button = document.createElement('button');
  button.id = 'render-tuning-button';
  button.className = 'render-tuning-button';
  button.type = 'button';
  button.setAttribute('aria-label', '渲染调参');
  button.setAttribute('title', '渲染调参');
  button.setAttribute('aria-pressed', 'false');
  button.textContent = '☼';
  button.hidden = true;
  document.body.appendChild(button);

  const root = document.createElement('section');
  root.id = 'render-tuning-panel';
  root.className = 'render-tuning-panel';
  root.hidden = true;
  root.setAttribute('aria-label', '渲染调参');
  root.innerHTML = `
    <div class="render-tuning-header">
      <strong>渲染调参</strong>
      <div class="render-tuning-actions">
        <button type="button" data-render-action="reset">重置</button>
        <button type="button" data-render-action="copy">复制参数</button>
      </div>
    </div>
    <div class="render-tuning-grid">
      <fieldset>
        <legend>调色</legend>
        ${renderSelectControl('toneMapping', '映射', RENDER_TONE_MAPPING_OPTIONS)}
        ${renderSliderControl('exposure', '曝光', 0.4, 1.8, 0.01)}
        ${renderSliderControl('brightness', '亮度', 0.65, 1.35, 0.01)}
        ${renderSliderControl('contrast', '对比', 0.65, 1.55, 0.01)}
        ${renderSliderControl('saturation', '饱和', 0.45, 1.8, 0.01)}
        ${renderSliderControl('hue', '色相', -32, 32, 1)}
        ${renderSliderControl('warmth', '暖调', 0, 0.42, 0.01)}
      </fieldset>
      <fieldset>
        <legend>阳光</legend>
        ${renderColorControl('sunColor', '颜色')}
        ${renderSliderControl('sunIntensity', '强度', 0, 8, 0.01)}
        ${renderSliderControl('sunX', 'X', -140, 140, 1)}
        ${renderSliderControl('sunY', 'Y', 8, 140, 1)}
        ${renderSliderControl('sunZ', 'Z', -140, 140, 1)}
      </fieldset>
      <fieldset>
        <legend>环境</legend>
        ${renderSliderControl('hemiIntensity', '半球光', 0, 3.2, 0.01)}
        ${renderColorControl('hemiSky', '天空色')}
        ${renderColorControl('hemiGround', '地面色')}
        ${renderColorControl('background', '背景色')}
      </fieldset>
      <fieldset>
        <legend>雾</legend>
        ${renderColorControl('fogColor', '颜色')}
        ${renderSliderControl('fogNear', '近端', 20, 220, 1)}
        ${renderSliderControl('fogFar', '远端', 80, 480, 1)}
      </fieldset>
    </div>
    <pre class="render-tuning-export" data-render-export></pre>
  `;
  document.body.appendChild(root);

  const controls = {};
  root.querySelectorAll('[data-render-tuning]').forEach((input) => {
    controls[input.dataset.renderTuning] = input;
  });
  const values = {};
  root.querySelectorAll('[data-render-value]').forEach((value) => {
    values[value.dataset.renderValue] = value;
  });
  return {
    root,
    button,
    controls,
    values,
    exportText: root.querySelector('[data-render-export]'),
    copyButton: root.querySelector('[data-render-action="copy"]'),
    copyStatusTimer: null
  };
}

function renderSliderControl(key, label, min, max, step) {
  return `
    <label class="render-tuning-row">
      <span>${label}<strong data-render-value="${key}"></strong></span>
      <input data-render-tuning="${key}" type="range" min="${min}" max="${max}" step="${step}" />
    </label>
  `;
}

function renderColorControl(key, label) {
  return `
    <label class="render-tuning-row render-tuning-row-color">
      <span>${label}<strong data-render-value="${key}"></strong></span>
      <input data-render-tuning="${key}" type="color" />
    </label>
  `;
}

function renderSelectControl(key, label, options) {
  return `
    <label class="render-tuning-row render-tuning-row-select">
      <span>${label}<strong data-render-value="${key}"></strong></span>
      <select data-render-tuning="${key}">
        ${options.map((option) => `<option value="${option}">${RENDER_TONE_MAPPING_LABELS[option] ?? option}</option>`).join('')}
      </select>
    </label>
  `;
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
    antialias: !mobile,
    realtimeShadows: false
  };
}

function applyRenderQualityToWorldConfig(worldConfig, renderQuality) {
  if (!worldConfig.sky) {
    return { ...worldConfig };
  }
  const sky = worldConfig.sky;
  const realtimeShadows = renderQuality.realtimeShadows && sky.realtimeShadows !== false;
  return {
    ...worldConfig,
    sky: {
      ...sky,
      realtimeShadows,
      bakedShadows: sky.bakedShadows ?? !realtimeShadows
    }
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

function defaultRenderTuningForWorld(worldConfig = BALANCE.world) {
  const sky = worldConfig.sky ?? {};
  const headDefaults = renderTuningHeadDefaultsForWorld(worldConfig);
  const sunPosition = sky.sunPosition ?? (
    headDefaults
      ? { x: headDefaults.sunX, y: headDefaults.sunY, z: headDefaults.sunZ }
      : { x: -44, y: 82, z: 46 }
  );
  return {
    toneMapping: RENDER_TONE_MAPPING_OPTIONS.includes(headDefaults?.toneMapping ?? sky.toneMapping)
      ? (headDefaults?.toneMapping ?? sky.toneMapping)
      : 'neutral',
    exposure: finiteNumber(headDefaults?.exposure ?? sky.exposure, 1),
    brightness: finiteNumber(headDefaults?.brightness, 1),
    contrast: finiteNumber(headDefaults?.contrast, 1),
    saturation: finiteNumber(headDefaults?.saturation, 1),
    hue: finiteNumber(headDefaults?.hue, 0),
    warmth: finiteNumber(headDefaults?.warmth, 0),
    sunColor: colorToHex(headDefaults?.sunColor ?? sky.sun, '#ffffff'),
    sunIntensity: finiteNumber(headDefaults?.sunIntensity ?? sky.sunIntensity, 3.55),
    sunX: finiteNumber(headDefaults?.sunX ?? sunPosition.x, -44),
    sunY: finiteNumber(headDefaults?.sunY ?? sunPosition.y, 82),
    sunZ: finiteNumber(headDefaults?.sunZ ?? sunPosition.z, 46),
    hemiIntensity: finiteNumber(headDefaults?.hemiIntensity ?? sky.hemiIntensity, 1.85),
    hemiSky: colorToHex(headDefaults?.hemiSky ?? sky.hemiSky, '#e8f4ff'),
    hemiGround: colorToHex(headDefaults?.hemiGround ?? sky.hemiGround, '#bebbc5'),
    background: colorToHex(headDefaults?.background ?? sky.skyGradient?.middle ?? sky.background, '#f0f8fc'),
    fogColor: colorToHex(headDefaults?.fogColor ?? sky.fog, '#f7f8f2'),
    fogNear: finiteNumber(headDefaults?.fogNear ?? sky.fogNear, 110),
    fogFar: finiteNumber(headDefaults?.fogFar ?? sky.fogFar, 282)
  };
}

function renderTuningHeadDefaultsForWorld(worldConfig = BALANCE.world) {
  if (worldConfig.sceneKey === 'snow-valley') return SNOW_VALLEY_HEAD_RENDER_TUNING;
  if (worldConfig.sceneKey === 'dungeon-halls') return DUNGEON_HALLS_HEAD_RENDER_TUNING;
  if (worldConfig.sceneKey === 'red-desert') return RED_DESERT_HEAD_RENDER_TUNING;
  return null;
}

function normalizeRenderTuning(settings = {}, worldConfig = BALANCE.world) {
  const defaults = defaultRenderTuningForWorld(worldConfig);
  const fogNear = clamp(finiteNumber(settings.fogNear, defaults.fogNear), 20, 220);
  const fogFar = clamp(
    Math.max(fogNear + 24, finiteNumber(settings.fogFar, defaults.fogFar)),
    fogNear + 24,
    480
  );
  const toneMapping = RENDER_TONE_MAPPING_OPTIONS.includes(settings.toneMapping)
    ? settings.toneMapping
    : defaults.toneMapping;
  return {
    toneMapping,
    exposure: clamp(finiteNumber(settings.exposure, defaults.exposure), 0.4, 1.8),
    brightness: clamp(finiteNumber(settings.brightness, defaults.brightness), 0.65, 1.35),
    contrast: clamp(finiteNumber(settings.contrast, defaults.contrast), 0.65, 1.55),
    saturation: clamp(finiteNumber(settings.saturation, defaults.saturation), 0.45, 1.8),
    hue: clamp(finiteNumber(settings.hue, defaults.hue), -32, 32),
    warmth: clamp(finiteNumber(settings.warmth, defaults.warmth), 0, 0.42),
    sunColor: colorToHex(settings.sunColor, defaults.sunColor),
    sunIntensity: clamp(finiteNumber(settings.sunIntensity, defaults.sunIntensity), 0, 8),
    sunX: clamp(finiteNumber(settings.sunX, defaults.sunX), -140, 140),
    sunY: clamp(finiteNumber(settings.sunY, defaults.sunY), 8, 140),
    sunZ: clamp(finiteNumber(settings.sunZ, defaults.sunZ), -140, 140),
    hemiIntensity: clamp(finiteNumber(settings.hemiIntensity, defaults.hemiIntensity), 0, 3.2),
    hemiSky: colorToHex(settings.hemiSky, defaults.hemiSky),
    hemiGround: colorToHex(settings.hemiGround, defaults.hemiGround),
    background: colorToHex(settings.background, defaults.background),
    fogColor: colorToHex(settings.fogColor, defaults.fogColor),
    fogNear,
    fogFar
  };
}

function renderTuningExportText(settings, worldConfig = BALANCE.world) {
  const normalized = normalizeRenderTuning(settings, worldConfig);
  return JSON.stringify({
    toneMapping: normalized.toneMapping,
    exposure: normalized.exposure,
    colorGrade: {
      brightness: normalized.brightness,
      contrast: normalized.contrast,
      saturation: normalized.saturation,
      hue: normalized.hue,
      warmth: normalized.warmth
    },
    sun: {
      color: normalized.sunColor,
      intensity: normalized.sunIntensity,
      position: {
        x: normalized.sunX,
        y: normalized.sunY,
        z: normalized.sunZ
      }
    },
    hemisphere: {
      intensity: normalized.hemiIntensity,
      sky: normalized.hemiSky,
      ground: normalized.hemiGround
    },
    fog: {
      color: normalized.fogColor,
      near: normalized.fogNear,
      far: normalized.fogFar
    },
    background: normalized.background
  }, null, 2);
}

function formatRenderTuningValue(key, value) {
  if (key === 'toneMapping') return RENDER_TONE_MAPPING_LABELS[value] ?? value;
  if (typeof value === 'string') return value.toUpperCase();
  if (key === 'hue') return `${Math.round(value)}°`;
  if (['sunX', 'sunY', 'sunZ', 'fogNear', 'fogFar'].includes(key)) return `${Math.round(value)}`;
  return Number(value).toFixed(2);
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function smoothstep01(value, edge0 = 0, edge1 = 1) {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function colorToHex(value, fallback = '#ffffff') {
  try {
    return `#${new THREE.Color(value ?? fallback).getHexString()}`;
  } catch {
    return fallback;
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

function formatRuntimeErrorInfo(error, game) {
  const level = game?.levelSession?.level ?? {};
  const sceneKey = game?.world?.config?.sceneKey ?? game?.worldConfig?.sceneKey ?? level.world?.sceneKey ?? 'unknown';
  return [
    'Village War Runtime Error',
    `time: ${new Date().toISOString()}`,
    `step: ${error.step ?? 'unknown'}`,
    `message: ${error.message ?? 'unknown error'}`,
    `elapsed: ${formatBattleTime(error.time ?? game?.elapsedTime ?? 0)}`,
    `threat: ${game?.enemyDirector?.threat?.toFixed?.(1) ?? '-'}`,
    `level: ${level.id ?? '-'} / ${level.name ?? '-'}`,
    `scene: ${sceneKey}`,
    `url: ${typeof window !== 'undefined' ? window.location.href : '-'}`,
    `userAgent: ${typeof navigator !== 'undefined' ? navigator.userAgent : '-'}`,
    '',
    'Stack:',
    error.stack || error.message || 'No stack'
  ].join('\n');
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  try {
    if (!document.execCommand('copy')) {
      throw new Error('copy command failed');
    }
  } finally {
    textarea.remove();
  }
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

function formatSignedStat(value) {
  const rounded = Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return rounded > 0 ? `+${text}` : text;
}

function attackDamageTypeLabel(type) {
  return type === 'magic' ? '魔法' : '物理';
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
    <div class="world-durability-bar">
      <span class="world-durability-fill"></span>
    </div>
  `;
  element.hidden = true;
  element.parts = {
    hp: element.querySelector('.world-health-fill'),
    healthLoss: element.querySelector('.world-health-loss-fill'),
    ticks: element.querySelector('.world-health-ticks'),
    durability: element.querySelector('.world-durability-fill')
  };
  return element;
}

function unitStatusHeight(unit) {
  if (Number.isFinite(unit.definition?.statusHeight)) return unit.definition.statusHeight;
  if (unit.type === 'goblinTroll' || unit.type === 'shieldBearer') return 2.35;
  if (unit.type === 'ogre') return 3.98;
  if (unit.type === 'wizard' || unit.type === 'frostAcolyte') return 1.85;
  if (unit.type === 'skeletonArcher' || unit.type === 'venomArcher') return 2.02;
  if (unit.type === 'skeletonSoldier') return 2.05;
  if (unit.type === 'scorpion') return 1.28;
  if (unit.type === 'spider') return 1.18;
  if (unit.type === 'spiderEgg') return 0.88;
  if (unit.type === 'bear') return 1.9;
  if (unit.type === 'wolf') return 1.25;
  return 2.25;
}

function createStructureState({ id, position, projectileHitHeight, attributes, maxStructureDurability = 49 }) {
  const structure = {
    id,
    kind: 'structure',
    position,
    projectileHitHeight,
    maxStructureDurability,
    structureDurability: maxStructureDurability,
    attributes: new AttributeSet(attributes),
    alive: true,
    healthLagRatio: 1,
    healthLagDelay: 0,
    lastHealthLossAt: -Infinity
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

function registerStructureHealthLoss(structure, previousHealth, now = 0) {
  if (!structure || structure.health >= previousHealth) return;
  const previousRatio = clamp(previousHealth / structure.maxHealth, 0, 1);
  structure.healthLagRatio = Math.max(structure.healthLagRatio ?? previousRatio, previousRatio);
  const rapidHit = now - (structure.lastHealthLossAt ?? -Infinity) <= STRUCTURE_HEALTH_LAG_RAPID_WINDOW;
  structure.healthLagDelay = rapidHit
    ? Math.min(structure.healthLagDelay ?? 0, STRUCTURE_HEALTH_LAG_RAPID_DELAY)
    : STRUCTURE_HEALTH_LAG_DELAY;
  structure.lastHealthLossAt = now;
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
