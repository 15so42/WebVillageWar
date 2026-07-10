import * as THREE from 'three';
import { createAttackRangeRing, createGuardFlag, createSelectionRing } from '../art/lowpoly.js';
import {
  BALANCE,
  CARD_DEFINITIONS,
  LEVEL_DEFINITIONS,
  PLAYER_ABILITY_DEFINITIONS,
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
import { CardSystem, cardEnergyCost, cardThemeColor, createCardArtMarkup } from './CardSystem.js';
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
const MAX_LEVEL_DIFFICULTY = 10;
const BOSS_WAVES_TO_WIN = 3;
const WAVES_PER_BOSS = 5;
const ELITE_WAVE_INTERVAL = 3;
const WAVE_DIFFICULTY_STEP_WAVES = 3;
const WAVE_DIFFICULTY_GROWTH_PER_SELECTED_DIFFICULTY = 0.16;
const STRATEGY_CHOICE_COUNT = 3;
const FORCED_CARD_CHOICE_UNTIL_WAVE = 3;
const OPENING_COMBAT_UNIT_CHOICES = 2;
const ENEMY_CAMP_IDLE_SCAN_SECONDS = 0.18;
const WAVE_AFFIX_DEFINITIONS = {
  swarm: {
    id: 'swarm',
    name: '虫群',
    preview: '数量压迫',
    description: '数量更多，但单体略脆',
    buffId: 'waveSwarm',
    countBonus: 2,
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
  summary: '特殊临时牌。使目标每秒恢复 2% 最大生命值。',
  target: 'friendly-unit',
  radius: 1.1,
  cooldown: 4,
  energyCost: 2,
  maxUses: 1,
  remainingUses: 1,
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
  summary: '特殊临时牌。拖拽给单位后，随机进行 6 次附魔。',
  target: 'friendly-unit',
  radius: 1.1,
  cooldown: 4,
  energyCost: 5,
  maxUses: 1,
  remainingUses: 1,
  lootOnly: true,
  effect: {
    type: 'apply-random-enchantments',
    count: 6
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
    description: '选择一张已有卡，同名卡牌等级 +1，并补满所有同名卡使用次数。',
    artKey: 'tacticUpgrade',
    color: '#d8c58d'
  },
  {
    id: 'copy-existing-card',
    action: 'open-card-copy-choice',
    title: '复制一张已有卡',
    description: '选择一张已有卡，先补满使用次数，再复制一张满次数副本。',
    artKey: 'copy',
    color: '#9eeedb'
  },
  {
    id: 'temporary-immortality-card',
    action: 'grant-temporary-card',
    title: '获得不朽附魔',
    description: '获得一张特殊临时牌：每秒恢复目标 2% 最大生命值。',
    temporaryCard: TEMPORARY_IMMORTALITY_CARD
  },
  {
    id: 'temporary-mana-surge-card',
    action: 'grant-temporary-card',
    title: '获得魔力涌动',
    description: '获得一张特殊临时牌：对目标随机进行 6 次附魔。',
    temporaryCard: TEMPORARY_MANA_SURGE_CARD
  }
];
const BOSS_CORE_REWARDS = [
  {
    abilityId: 'summonUseBonus',
    stacks: 2,
    title: '军团扩编',
    description: '所有现有和之后获得的单位卡使用次数 +2。',
    cardId: 'barbarians'
  },
  {
    abilityId: 'periodicEnergy',
    stacks: 3,
    title: '魔力泉涌',
    description: '每 10 秒获得 3 点能量，支撑法术和高费牌。',
    cardId: 'periodic-energy-ability'
  },
  {
    abilityId: 'buildingDurability',
    stacks: 3,
    title: '阵地工法',
    description: '之后新建建筑获得 60% 额外生命和耐久。',
    cardId: 'building-durability-ability'
  },
  {
    abilityId: 'enchantEcho',
    stacks: 3,
    title: '双重附魔',
    description: '使用附魔牌时有 60% 概率额外生效一次。',
    cardId: 'enchant-echo-ability'
  },
  {
    abilityId: 'randomHealOnCard',
    stacks: 2,
    title: '生机循环',
    description: '每次打出牌时治疗两名随机友军。',
    cardId: 'random-heal-ability'
  },
  {
    abilityId: 'deathExplosion',
    stacks: 3,
    title: '殉爆阵线',
    description: '友方单位死亡时爆炸，适合人海和消耗流。',
    cardId: 'death-explosion-ability'
  },
  {
    abilityId: 'exhaustEnergy',
    stacks: 3,
    title: '节能律令',
    description: '打出有能量消耗的牌时，最高约 48% 概率返还 1 点能量。',
    cardId: 'exhaust-energy-ability'
  },
  {
    abilityId: 'victoryGold',
    stacks: 3,
    title: '凯旋契约',
    description: '胜利后金币奖励 +60%，适合追求局外成长。',
    cardId: 'victory-gold-ability'
  },
  {
    abilityId: 'summonUseBonus',
    stacks: 4,
    title: '无尽征召',
    description: '所有单位卡使用次数 +4，直接支撑大规模铺场。',
    cardId: 'barbarians'
  },
  {
    abilityId: 'periodicEnergy',
    stacks: 5,
    title: '奥术潮汐',
    description: '每 10 秒获得 5 点能量，让高费组合持续运转。',
    cardId: 'burst-energy'
  },
  {
    abilityId: 'enchantEcho',
    stacks: 5,
    title: '附魔共鸣',
    description: '附魔牌必定额外生效一次，附魔构筑核心。',
    cardId: 'enchant-echo-ability'
  },
  {
    abilityId: 'randomHealOnCard',
    stacks: 4,
    title: '复苏矩阵',
    description: '每次打牌治疗四名随机友军，显著提高持续作战能力。',
    cardId: 'random-heal-ability'
  }
];
const SUMMON_DEPLOY_RADIUS = 7.5;
const BEACON_PLACEMENT_RADIUS = 5.5;
const SPIDER_FIRST_EGG_SECONDS = 37;
const SPIDER_EGG_INTERVAL_SECONDS = 60;
const SPIDER_EGG_HATCH_SECONDS = 15;
const TOUCH_TAP_THRESHOLD = 7;
const MOBILE_DOUBLE_TAP_MS = 360;
const MOBILE_DOUBLE_TAP_DISTANCE = 38;
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
  sunColor: '#fde2e2',
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
const BOUNCE_LIGHTMAP_WIDTH = 384;
const BOUNCE_LIGHTMAP_MIN_HEIGHT = 256;
const BOUNCE_LIGHTMAP_MAX_HEIGHT = 384;
const BOUNCE_LIGHTMAP_INTENSITY = 1.45;
const BOUNCE_LIGHTMAP_MAX_EMITTERS = 180;
const BOUNCE_LIGHTMAP_EMITTER_RADIUS_MIN = 3.6;
const BOUNCE_LIGHTMAP_EMITTER_RADIUS_MAX = 12;
const BOUNCE_LIGHTMAP_SHADOW_LIFT = 0.1;
const BOUNCE_LIGHTMAP_SNOW_REFLECTANCE = 0.82;
const BOUNCE_OBJECT_VERTEX_SCALE = 0.34;
const BOUNCE_OBJECT_SAMPLE_RADIUS_MIN = 1.15;
const BOUNCE_OBJECT_SAMPLE_RADIUS_MAX = 5.8;
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
      ...(this.levelSession.level.world ?? BALANCE.world),
      altars: []
    };
    this.worldConfig = applyRenderQualityToWorldConfig(this.worldConfig, this.renderQuality);
    this.renderTuning = null;
    this.bounceLightMapTexture = null;
    this.bounceLightBakeStats = null;
    this.bounceLightGroundRecord = null;
    this.bounceLightMaterialRecords = [];
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
    this.lastMobileTap = null;
    this.updateCamera(0);

    this.clock = new THREE.Clock();
    this.unitRegistry = new UnitRegistry(this);
    this.friendlyUnits = this.unitRegistry.friendlyUnits;
    this.enemyUnits = this.unitRegistry.enemyUnits;
    this.score = 0;
    this.wave = 0;
    this.waveSchedule = createWaveSchedule(this.levelSession);
    this.waveIndex = 0;
    this.currentWave = null;
    this.bossesDefeated = 0;
    this.strategyEvent = null;
    this.enemyCampAttackTimer = 0;
    this.lastCardPlayed = null;
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
      startWithEmptyDrawPile: !this.levelSession.debug
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
      perfStats: document.querySelector('#perf-stats')
    };
    this.renderTuningUi = createRenderTuningPanel();
    if (this.dom.fpsMeter) this.dom.fpsMeter.hidden = false;
    this.strategyEventUi = createStrategyEventUi();
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
    this.clearBakedBounceLight();
    this.renderer.dispose();
    this.selectionBox?.remove();
    this.strategyEventUi?.root?.remove();
    document.body.classList.remove('is-game-active', 'is-game-paused', 'is-strategy-event-open');
    if (this.dom.settingsButton) this.dom.settingsButton.hidden = true;
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
    const dt = Math.min(rawDt, 0.05);
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
      runPerfStep('waveSpawn', () => this.updateWaveFlow(dt));
      runPerfStep('card', () => this.cardSystem.update(dt));
      runPerfStep('abilities', () => this.abilities.update(dt));
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
      runStep('waveSpawn', () => this.updateWaveFlow(dt));
      runStep('card', () => this.cardSystem.update(dt));
      runStep('abilities', () => this.abilities.update(dt));
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
    if (!this.currentWave) return;
    if (this.hasActiveWaveEnemies()) return;
    this.completeCurrentWave();
  }

  hasActiveWaveEnemies() {
    return this.enemyUnits.some((unit) => (
      unit.alive && !unit.isWildlife
    ));
  }

  startNextWave() {
    if (this.levelFinished || this.levelSession.debug) return;
    const wave = this.waveSchedule[this.waveIndex];
    if (!wave) {
      this.finishLevel(true);
      return;
    }
    this.currentWave = wave;
    this.waveIndex += 1;
    this.wave = wave.index;
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
    this.updateWavePreview();
    if (wave.kind === 'boss') {
      this.bossesDefeated += 1;
      if (this.bossesDefeated >= BOSS_WAVES_TO_WIN) {
        this.finishLevel(true);
        return;
      }
      this.openStrategyEvent('boss-reward', { wave });
      return;
    }
    this.openStrategyEvent('wave-reward', { wave });
  }

  nextBasicStrategyEventType(wave = null) {
    if ((wave?.index ?? 0) <= FORCED_CARD_CHOICE_UNTIL_WAVE) return 'card-choice';
    const roll = Math.random();
    if (roll < 0.6) return 'card-choice';
    if (roll < 0.85) return 'card-maintenance';
    return 'card-copy';
  }

  updateWavePreview() {
    const root = this.dom.wavePreview;
    if (!root) return;
    const startIndex = this.currentWave
      ? Math.max(0, this.currentWave.index - 1)
      : this.waveIndex;
    const waves = this.waveSchedule.slice(startIndex, startIndex + WAVE_PREVIEW_COUNT);
    if (!waves.length) {
      root.innerHTML = '';
      return;
    }
    root.innerHTML = `
      <div class="wave-preview-track" style="--wave-node-count: ${waves.length}">
        ${waves.map((wave) => {
          const difficulty = wave.effectiveDifficulty ?? this.effectiveDifficultyForWave(wave.index);
          const isActive = this.currentWave === wave;
          return `
            <div class="wave-preview-node is-${cssKey(wave.kind)}${isActive ? ' is-active' : ''}">
              <span class="wave-node-dot">${escapeHtml(wave.index)}</span>
              <strong>${escapeHtml(waveKindLabel(wave))}</strong>
              <span>${escapeHtml(waveAffixLabel(wave.affixId))} / 难度 ${escapeHtml(difficulty)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
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
      this.startNextWave();
      return;
    }
    this.strategyEvent = event;
    this.paused = true;
    this.cancelCameraDrag();
    this.cancelSelectionDrag();
    document.body.classList.add('is-game-paused', 'is-strategy-event-open');
    this.strategyEventUi.root.hidden = false;
    this.renderStrategyEvent();
    this.clock.getDelta();
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
        kicker: '第一波准备',
        title: '选择第一张单位卡',
        summary: '开局抽牌堆为空，先从本局出战单位牌中选择一张，随后再补一张支援卡。',
        choices: this.openingUnitChoices({
          pool: summonPool,
          action: 'add-card',
          actionLabel: '加入牌堆'
        })
      };
    }
    if (type === 'boss-reward') {
      return {
        type,
        kicker: `Boss 奖励 ${this.bossesDefeated}/${BOSS_WAVES_TO_WIN}`,
        title: '选择一个构筑核心',
        summary: 'Boss 奖励会改变这局的构筑方向，是强力局内被动。',
        choices: this.createBossCoreChoices()
      };
    }
    if (type === 'wave-reward') {
      return {
        type,
        kicker: waveEventKicker(options.wave),
        title: '选择本波奖励',
        summary: '从奖励池随机出现 3 个方向，选择后进入对应奖励或直接获得临时牌。',
        choices: this.createWaveRewardOptionChoices(options.wave)
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
        summary: '先补满目标卡使用次数，再复制一张同等级、满使用次数的副本。',
        choices: this.createExistingCardCopyChoices()
      };
    }
    if (type === 'card-maintenance') {
      return {
        type,
        kicker: waveEventKicker(options.wave),
        title: '升级一张卡牌',
        summary: '选择当前局内的一张卡牌进行升级。单位卡会继续选择升级倾向。',
        choices: this.createMaintenanceChoices()
      };
    }
    if (type === 'unit-upgrade') {
      return {
        type,
        kicker: '单位升级',
        title: `选择 ${options.card?.name ?? '单位卡'} 的升级倾向`,
        summary: '通用属性可以重复选择，单位专属能力每局同一张卡只能获得一次。',
        choices: this.createUnitUpgradeChoices(options.card)
      };
    }
    if (type === 'card-copy') {
      return {
        type,
        kicker: waveEventKicker(options.wave),
        title: '复制一张卡牌',
        summary: '复制会保留等级，并以完整使用次数加入抽牌堆。',
        choices: this.createCopyChoices()
      };
    }
    const isOpening = options.opening === true;
    const isOpeningSupport = options.openingSupport === true;
    return {
      type: 'card-choice',
      kicker: isOpening || isOpeningSupport ? '第一波准备' : waveEventKicker(options.wave),
      title: isOpeningSupport ? '选择一张支援卡' : isOpening ? '选择第一张卡' : '选择一张新卡',
      summary: isOpeningSupport
        ? '再从本局出战牌组中选择一张卡，降低第一波压力。'
        : isOpening
          ? '开局抽牌堆为空，从本局出战牌组中选择第一张牌。'
          : options.fallbackFrom
            ? '当前事件没有可用目标，改为选择一张新卡作为本波奖励。'
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
      .filter((card) => {
        if (!card?.id || seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
      });
    if (source.length) {
      return source.map((card) => ({
        ...(this.cardSystem?.applyRuntimeCardLevel?.(card) ?? card),
        instanceId: undefined,
        remainingUses: undefined,
        maxUses: undefined
      }));
    }
    if (hasSessionDeck && options.allowAllFallback !== true) return [];
    return CARD_DEFINITIONS
      .filter((card) => !card.lootOnly)
      .filter((card) => !options.kind || card.kind === options.kind)
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
    const choices = pickRandomItems(
      combatPool,
      Math.min(OPENING_COMBAT_UNIT_CHOICES, STRATEGY_CHOICE_COUNT)
    );
    const pickedIds = new Set(choices.map((card) => card.id));
    const remainingPool = pool.filter((card) => !pickedIds.has(card.id));
    choices.push(...pickRandomItems(remainingPool, STRATEGY_CHOICE_COUNT - choices.length));
    return choices.map((card) => ({
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

  createWaveRewardOptionChoices(wave = null) {
    const options = STRATEGY_REWARD_OPTION_DEFINITIONS.filter((option) => (
      this.isWaveRewardOptionAvailable(option)
    ));
    return pickRandomItems(options, STRATEGY_CHOICE_COUNT).map((option) => {
      const optionDescription = option.action === 'open-card-upgrade-choice'
        ? '选择一张已有卡，然后选择这张卡对应的升级倾向。'
        : option.description;
      const card = option.temporaryCard
        ? option.temporaryCard
        : {
            id: `reward-option-${option.id}`,
            name: option.title,
            kind: rewardOptionCardKind(option),
            label: rewardOptionLabel(option),
            artKey: option.artKey ?? 'tacticUpgrade',
            summary: optionDescription,
            target: 'none',
            radius: 1,
            cooldown: 0,
            energyCost: 0,
            color: option.color ?? '#9eeedb'
          };
      return {
        action: option.action,
        actionLabel: option.action === 'grant-temporary-card' ? '获得临时牌' : '选择方向',
        title: option.title,
        description: optionDescription,
        metaText: option.action === 'open-card-upgrade-choice'
          ? '已有卡牌 / 升级倾向'
          : rewardOptionMetaText(option),
        card,
        cardKind: option.cardKind,
        wave,
        temporaryCard: option.temporaryCard
      };
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
    return this.waveSchedule[this.waveIndex] ?? null;
  }

  createBossCoreChoices() {
    return pickRandomItems(BOSS_CORE_REWARDS, STRATEGY_CHOICE_COUNT).map((reward) => {
      const definition = PLAYER_ABILITY_DEFINITIONS[reward.abilityId];
      const card = CARD_DEFINITIONS.find((entry) => entry.id === reward.cardId) ??
        CARD_DEFINITIONS.find((entry) => entry.effect?.abilityId === reward.abilityId) ??
        {
          id: `boss-core-${reward.abilityId}`,
          name: reward.title,
          kind: 'ability',
          label: definition?.label ?? '核',
          artKey: 'abilityPeriodicEnergy',
          energyCost: 0,
          summary: reward.description,
          color: definition?.color ?? '#9eeedb'
        };
      return {
        action: 'acquire-core',
        actionLabel: '选择核心',
        title: reward.title,
        description: reward.description,
        card: {
          ...card,
          name: reward.title,
          summary: reward.description,
          energyCost: 0,
          level: reward.stacks
        },
        metaText: '构筑核心 / 局内被动',
        abilityId: reward.abilityId,
        stacks: reward.stacks
      };
    });
  }

  createMaintenanceChoices() {
    const cards = this.uniqueRuntimeCards();
    if (!cards.length) {
      return this.weightedCardChoices({
        pool: this.selectedCardPool({ allowAllFallback: true }),
        action: 'add-card',
        actionLabel: '加入牌堆',
        wave: this.nextUpcomingWave()
      });
    }
    return cards.map((card) => ({
      action: 'select-upgrade-card',
      actionLabel: '选择升级',
      title: card.name,
      description: runtimeUpgradeSummaryForCard(card),
      metaText: runtimeUpgradeTitleForCard(card),
      card,
      targetCard: card
    }));
  }

  uniqueRuntimeCards() {
    const seen = new Set();
    return this.cardSystem.allDeckCards().filter((card) => {
      if (!card?.id || seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    }).sort((a, b) => cardSortKey(a).localeCompare(cardSortKey(b), 'zh-Hans-CN'));
  }

  createUnitUpgradeChoices(card) {
    if (!card?.unitType) return [];
    const owned = new Set(card.runtimeUpgrades?.unitUpgradeIds ?? []);
    const genericChoices = UNIT_GENERIC_UPGRADES.map((upgrade) => ({
      action: 'apply-card-upgrade',
      actionLabel: '选择升级',
      title: upgrade.name,
      description: upgrade.summary,
      metaText: '通用属性 / 可重复',
      card,
      targetCard: card,
      upgrade
    }));
    const specialChoices = (UNIT_SPECIAL_UPGRADES[card.unitType] ?? [])
      .filter((upgrade) => !owned.has(upgrade.id))
      .map((upgrade) => ({
        action: 'apply-card-upgrade',
        actionLabel: '选择升级',
        title: upgrade.name,
        description: upgrade.summary,
        metaText: '单位专属 / 本局唯一',
        card,
        targetCard: card,
        upgrade
      }));
    return pickRandomItems([...genericChoices, ...specialChoices], STRATEGY_CHOICE_COUNT);
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
      description: '加入一张同等级、满使用次数的复制牌。',
      card,
      targetCard: card
    }));
  }

  createExistingCardCopyChoices() {
    return pickRandomItems(this.uniqueRuntimeCards(), STRATEGY_CHOICE_COUNT).map((card) => ({
      action: 'copy-card',
      actionLabel: '复制',
      title: `复制 ${card.name}`,
      description: '先补满这张卡使用次数，再加入一张同等级、满使用次数的复制牌。',
      card,
      targetCard: card
    }));
  }

  renderStrategyEvent() {
    const event = this.strategyEvent;
    if (!event) return;
    const typeMeta = strategyEventTypeMeta(event.type);
    event.choices = Array.isArray(event.choices) ? event.choices.filter(Boolean) : [];
    this.strategyEventUi.root.dataset.eventType = typeMeta.key;
    this.strategyEventUi.typeMark.textContent = typeMeta.mark;
    this.strategyEventUi.typeLabel.textContent = typeMeta.label;
    this.strategyEventUi.kicker.textContent = event.kicker;
    this.strategyEventUi.title.textContent = event.title;
    this.strategyEventUi.summary.textContent = event.summary;
    this.strategyEventUi.choices.innerHTML = event.choices
      .map((choice, index) => strategyChoiceMarkup(choice, index))
      .join('');
  }

  onStrategyEventClick(event) {
    const button = event.target.closest('[data-strategy-choice-index]');
    if (!button || !this.strategyEvent) return;
    event.preventDefault();
    event.stopPropagation();
    const index = Number(button.dataset.strategyChoiceIndex);
    const eventType = this.strategyEvent.type;
    const choice = this.strategyEvent.choices[index];
    if (!choice || button.disabled) return;
    if (choice.action === 'open-card-kind-choice') {
      this.handleCardKindRewardSelection(choice);
      return;
    }
    if (choice.action === 'open-card-upgrade-choice') {
      this.handleCardUpgradeSelection(choice);
      return;
    }
    if (choice.action === 'open-card-copy-choice') {
      this.handleExistingCardCopySelection(choice);
      return;
    }
    if (choice.action === 'select-upgrade-card') {
      this.handleUpgradeCardSelection(choice);
      return;
    }
    if (!this.applyStrategyChoice(choice)) return;
    this.closeStrategyEvent();
    if (eventType === 'opening-unit') {
      this.openStrategyEvent('card-choice', { openingSupport: true });
      return;
    }
    this.startNextWave();
  }

  handleCardKindRewardSelection(choice) {
    const event = this.createStrategyEvent('card-kind-choice', {
      wave: choice.wave,
      cardKind: choice.cardKind,
      title: choice.title,
      summary: `从本局出战${strategyKindLabel(choice.cardKind)}中随机出现 3 张，选择 1 张加入抽牌堆。`
    });
    if (!event?.choices?.length) return;
    this.strategyEvent = event;
    this.renderStrategyEvent();
  }

  handleCardUpgradeSelection(choice) {
    const event = this.createStrategyEvent('card-maintenance', {
      wave: choice.wave
    });
    if (!event?.choices?.length) return;
    this.strategyEvent = event;
    this.renderStrategyEvent();
  }

  handleExistingCardCopySelection(choice) {
    const event = this.createStrategyEvent('existing-card-copy', {
      wave: choice.wave
    });
    if (!event?.choices?.length) return;
    this.strategyEvent = event;
    this.renderStrategyEvent();
  }

  handleUpgradeCardSelection(choice) {
    const card = choice.targetCard ?? choice.card;
    if (!card) return;
    if (card.kind === 'summon' && card.unitType) {
      const event = this.createStrategyEvent('unit-upgrade', { card });
      if (!event?.choices?.length) {
        this.applyDirectCardUpgrade(card);
        this.closeStrategyEvent();
        this.startNextWave();
        return;
      }
      this.strategyEvent = event;
      this.renderStrategyEvent();
      return;
    }
    if (!this.applyDirectCardUpgrade(card)) return;
    this.closeStrategyEvent();
    this.startNextWave();
  }

  applyStrategyChoice(choice) {
    let applied = false;
    if (choice.action === 'add-card') {
      const result = this.cardSystem.addCardToDrawPile(choice.card, {
        prefix: `event-${choice.card.id}-${Date.now()}`
      });
      applied = result.added;
    } else if (choice.action === 'add-card-limited-uses') {
      const result = this.cardSystem.addCardToDrawPile(cardWithUsePenalty(choice.card, choice.usePenalty ?? 1), {
        prefix: `event-cost-${choice.card.id}-${Date.now()}`
      });
      applied = result.added;
    } else if (choice.action === 'acquire-core') {
      applied = this.abilities?.acquire(choice.abilityId, choice.stacks ?? 1) === true;
    } else if (choice.action === 'restore-card') {
      applied = this.cardSystem.restoreCardUses(choice.targetCard);
    } else if (choice.action === 'upgrade-card') {
      applied = this.cardSystem.upgradeCardInstance(choice.targetCard, 1);
    } else if (choice.action === 'apply-card-upgrade') {
      applied = this.cardSystem.applyRuntimeUpgrade(choice.targetCard, choice.upgrade);
    } else if (choice.action === 'copy-card') {
      applied = this.cardSystem.copyCardInstance(choice.targetCard, {
        prefix: `event-copy-${choice.targetCard.id}-${Date.now()}`
      }).added;
    } else if (choice.action === 'copy-card-limited') {
      const copiedUses = currentCardRemainingUses(choice.targetCard);
      applied = this.cardSystem.addCardToDrawPile({
        ...choice.targetCard,
        instanceId: undefined,
        maxUses: copiedUses,
        remainingUses: copiedUses
      }, {
        prefix: `event-overload-${choice.targetCard.id}-${Date.now()}`,
        applyRuntimeLevelBonus: false
      }).added;
    } else if (choice.action === 'grant-temporary-card') {
      applied = this.cardSystem.addCardToDrawPile(choice.temporaryCard ?? choice.card, {
        prefix: `event-temporary-${choice.card.id}-${Date.now()}`,
        applyRuntimeLevelBonus: false
      }).added;
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
    if (action === 'bake-bounce') {
      this.bakeStaticBounceLight();
      return;
    }
    if (action === 'clear-bounce') {
      this.clearBakedBounceLight();
      this.setRenderTuningBakeStatus('已清除');
      this.syncRenderTuningPanel();
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

  bakeStaticBounceLight() {
    if (!this.world?.ground?.material) return;
    this.applyRenderTuning();
    this.setRenderTuningBakeStatus('烘焙中');
    window.requestAnimationFrame(() => {
      if (this.destroyed) return;
      try {
        const result = createStaticBounceLightMap({
          world: this.world,
          worldConfig: this.world.config ?? this.worldConfig,
          settings: this.renderTuning
        });
        this.applyBakedBounceLight(result);
        const { width, height, emitterCount, receiverCount } = this.bounceLightBakeStats ?? result;
        this.setRenderTuningBakeStatus(`已烘焙 ${width}x${height} / ${emitterCount} 面源 / ${receiverCount ?? 0} 接收`);
        this.syncRenderTuningPanel();
      } catch (error) {
        console.warn('[VillageWar] Bounce light bake failed', error);
        this.setRenderTuningBakeStatus('烘焙失败');
      }
    });
  }

  applyBakedBounceLight(result) {
    const ground = this.world?.ground;
    const material = ground?.material;
    if (!ground?.geometry || !material || !result?.texture) return;
    const uv = ground.geometry.attributes?.uv;
    if (uv && !ground.geometry.attributes?.uv2) {
      ground.geometry.setAttribute('uv2', uv.clone());
    }
    this.clearBakedBounceLight({ updatePanel: false });
    this.bounceLightGroundRecord = {
      material,
      lightMap: material.lightMap ?? null,
      lightMapIntensity: material.lightMapIntensity ?? 1
    };
    material.lightMap = result.texture;
    material.lightMapIntensity = result.intensity;
    material.needsUpdate = true;
    const receiverCount = this.applyStaticObjectBounceLight(result);
    this.bounceLightMapTexture = result.texture;
    this.bounceLightBakeStats = {
      width: result.width,
      height: result.height,
      emitterCount: result.emitterCount,
      receiverCount
    };
    if (this.world) {
      this.world.bounceLightMapTexture = result.texture;
      this.world.bounceLightMapEmitterCount = result.emitterCount;
      this.world.bounceLightMapReceiverCount = receiverCount;
    }
  }

  applyStaticObjectBounceLight(result) {
    const objects = staticBounceObjectsForWorld(this.world);
    const settings = normalizeRenderTuning(this.renderTuning, this.world?.config ?? this.worldConfig);
    const config = this.world?.config ?? this.worldConfig;
    const shadowMask = readShadowMaskData(this.world?.shadowMaskTexture);
    const groundSampler = createGroundBounceSampler(this.world, config, shadowMask);
    const materialRecords = [];
    let receiverCount = 0;

    objects.forEach((object) => {
      object.updateWorldMatrix(true, true);
      object.traverse((node) => {
        if (!node.isMesh || node.userData?.skipBakedShadow || !node.material || !node.geometry) return;
        const baked = bakeBounceIntoMesh(node, settings, config, groundSampler);
        if (!baked) return;
        materialRecords.push({
          node,
          originalGeometry: node.geometry,
          originalMaterial: node.material,
          bakedGeometry: baked.geometry,
          bakedMaterials: baked.materials
        });
        node.geometry = baked.geometry;
        node.material = Array.isArray(node.material) ? baked.materials : baked.materials[0];
        receiverCount += baked.vertexCount;
      });
    });

    this.bounceLightMaterialRecords = materialRecords;
    return receiverCount;
  }

  clearBakedBounceLight({ updatePanel = true } = {}) {
    const material = this.world?.ground?.material;
    if (this.bounceLightGroundRecord) {
      const record = this.bounceLightGroundRecord;
      record.material.lightMap = record.lightMap;
      record.material.lightMapIntensity = record.lightMapIntensity;
      record.material.needsUpdate = true;
      this.bounceLightGroundRecord = null;
    } else if (material?.lightMap === this.bounceLightMapTexture) {
      material.lightMap = null;
      material.lightMapIntensity = 1;
      material.needsUpdate = true;
    }
    this.bounceLightMaterialRecords.forEach((record) => {
      record.node.geometry = record.originalGeometry;
      record.node.material = record.originalMaterial;
      record.bakedGeometry?.dispose?.();
      record.bakedMaterials.forEach((bakedMaterial) => {
        const originals = Array.isArray(record.originalMaterial) ? record.originalMaterial : [record.originalMaterial];
        if (!originals.includes(bakedMaterial)) bakedMaterial.dispose?.();
      });
    });
    this.bounceLightMaterialRecords = [];
    this.bounceLightMapTexture?.dispose?.();
    this.bounceLightMapTexture = null;
    this.bounceLightBakeStats = null;
    if (this.world) {
      this.world.bounceLightMapTexture = null;
      this.world.bounceLightMapEmitterCount = 0;
      this.world.bounceLightMapReceiverCount = 0;
    }
    if (updatePanel) {
      this.setRenderTuningBakeStatus('未烘焙');
    }
  }

  setRenderTuningBakeStatus(text) {
    if (this.renderTuningUi?.bakeStatus) {
      this.renderTuningUi.bakeStatus.textContent = text;
    }
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
    if (ui.bakeStatus) {
      ui.bakeStatus.textContent = this.bounceLightBakeStats
        ? `已烘焙 ${this.bounceLightBakeStats.width}x${this.bounceLightBakeStats.height} / ${this.bounceLightBakeStats.emitterCount} 面源 / ${this.bounceLightBakeStats.receiverCount ?? 0} 接收`
        : '未烘焙';
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
      bakedShadowMeshes: this.world?.bakedShadowMeshes?.length ?? 0,
      shadowMaskTexture: this.world?.shadowMaskTexture ? 1 : 0,
      shadowMaskTriangles: this.world?.shadowMaskTriangleCount ?? 0,
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
    applyBuildingCardUpgrade(unit, card);
    const upgradeIds = card?.runtimeUpgrades?.unitUpgradeIds ?? [];
    if (!upgradeIds.length) return;
    unit.runtimeUpgradeIds = new Set(upgradeIds);
    unit.runtimeTraits = new Set();
    const modifiers = [];
    upgradeIds.forEach((upgradeId, index) => {
      const upgrade = runtimeUnitUpgradeDefinition(unit.type, upgradeId);
      if (!upgrade) return;
      if (upgrade.kind === 'unit-generic') {
        modifiers.push(...unitGenericUpgradeModifiers(unit, upgrade, index));
      }
      if (upgrade.modifiers?.length) {
        modifiers.push(...upgrade.modifiers);
      }
      if (upgrade.supportModifiers) {
        applySupportUpgrade(unit, upgrade.supportModifiers);
      }
      if (upgrade.trait) {
        unit.runtimeTraits.add(upgrade.trait);
      }
    });
    if (modifiers.length) {
      unit.attributes.addModifiers(modifiers, `card:${card.id}:runtime-upgrades`);
    }
    unit.health = unit.maxHealth;
    unit.weapon.durability = unit.weapon.maxDurability;
    unit.clampToAttributeCaps();
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

  updateEnemyCampAttack(dt) {
    if (this.levelFinished || !this.enemyCamp?.alive) return;
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

  spawnEnemyWave(wave, { orders = 'attack', waveConfig = null } = {}) {
    const difficulty = waveConfig?.effectiveDifficulty ?? this.effectiveDifficultyForWave(wave);
    const count = waveConfig?.count ?? Math.min(
      MAX_ACTIVE_WAVE_SPAWNS,
      2 + Math.floor(wave * 0.72) + Math.floor((difficulty - 1) * 0.45)
    );
    const spawnedUnits = [];
    for (let i = 0; i < count; i += 1) {
      const offset = polarOffset(i, count, 1.2 + (i % 3) * 0.45);
      const position = this.resolveWalkablePoint(this.enemyCamp.position.clone().setY(0).add(offset));
      position.y = this.groundHeightAt(position);
      const unit = new UnitEntity({
        type: this.enemyTypeForWave(wave, i, difficulty, waveConfig),
        team: TEAMS.ENEMY,
        position
      });
      this.applyEnemyDifficulty(unit, wave, difficulty);
      this.applyWaveModifiers(unit, waveConfig, i);
      this.applyWaveAffixModifiers(unit, waveConfig);
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

  enemyTypeForWave(wave, index, difficulty, waveConfig = null) {
    if (waveConfig?.types?.length) {
      return waveConfig.types[index % waveConfig.types.length];
    }
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

  applyWaveModifiers(unit, waveConfig, index) {
    if (!waveConfig) return;
    if (waveConfig.kind === 'elite') {
      unit.isElite = true;
      unit.name = `精英${unit.name}`;
      unit.attributes.addModifiers([
        { stat: 'maxHealth', type: 'multiply', amount: 1.55 },
        { stat: 'maxShield', type: 'multiply', amount: 1.55 },
        { stat: 'attackDamage', type: 'multiply', amount: 1.22 },
        { stat: 'knockbackResistance', type: 'add', amount: 0.14 }
      ], `wave:${waveConfig.index}:elite`);
      unit.health = unit.maxHealth;
      unit.shield = 0;
      unit.weapon.durability = unit.weapon.maxDurability;
      unit.visualRoot?.scale?.multiplyScalar?.(1.1);
      return;
    }
    if (waveConfig.kind !== 'boss') return;
    if (index === 0) {
      const bossRank = Math.max(1, waveConfig.bossOrdinal ?? 1);
      unit.isBoss = true;
      unit.name = `Boss ${unit.name}`;
      unit.attributes.addModifiers([
        { stat: 'maxHealth', type: 'multiply', amount: 4.4 + bossRank * 0.65 },
        { stat: 'maxShield', type: 'multiply', amount: 3.6 + bossRank * 0.45 },
        { stat: 'attackDamage', type: 'multiply', amount: 1.35 + bossRank * 0.12 },
        { stat: 'knockback', type: 'multiply', amount: 1.18 },
        { stat: 'knockbackResistance', type: 'add', amount: 0.28 + bossRank * 0.04 }
      ], `wave:${waveConfig.index}:boss`);
      unit.health = unit.maxHealth;
      unit.shield = unit.maxShield;
      unit.weapon.durability = unit.weapon.maxDurability;
      unit.visualRoot?.scale?.multiplyScalar?.(1.32);
      unit.projectileHitHeight = (unit.projectileHitHeight ?? 1.6) * 1.18;
      return;
    }
    unit.attributes.addModifiers([
      { stat: 'maxHealth', type: 'multiply', amount: 1.18 },
      { stat: 'attackDamage', type: 'multiply', amount: 1.08 },
      { stat: 'knockbackResistance', type: 'add', amount: 0.08 }
    ], `wave:${waveConfig.index}:boss-support`);
    unit.health = unit.maxHealth;
    unit.shield = 0;
  }

  applyWaveAffixModifiers(unit, waveConfig) {
    const affixId = waveConfig?.affixId;
    if (!affixId) return;
    const affix = WAVE_AFFIX_DEFINITIONS[affixId];
    if (!affix?.buffId) return;
    const applied = this.buffs.applyBuff(unit, affix.buffId, unit, {
      level: waveAffixLevel(waveConfig),
      sourceWaveAffix: affixId
    });
    if (!applied) return;
    unit.health = unit.maxHealth;
    unit.shield = Math.min(unit.shield, unit.maxShield);
    unit.weapon.durability = unit.weapon.maxDurability;
    unit.statusUiDirty = true;
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
    const difficulty = this.currentWave?.effectiveDifficulty ?? this.effectiveDifficultyForWave(wave);
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
    this.playerBase.alive = true;
    this.playerBase.healthLagRatio = 1;
    this.playerBase.healthLagDelay = 0;
    this.updateStructureStatusElement(this.playerBase, 0);
    if (this.dom?.baseHealth) {
      this.dom.baseHealth.textContent = '无敌';
    }
  }

  damagePlayerBase(amount) {
    if (this.playerBase.invincible) {
      this.playerBase.health = this.playerBase.maxHealth;
      this.playerBase.alive = true;
      this.playerBase.healthLagRatio = 1;
      this.playerBase.healthLagDelay = 0;
      this.updateStructureStatusElement(this.playerBase, 0);
      return;
    }
    const previousHealth = this.playerBase.health;
    this.playerBase.health = Math.max(0, this.playerBase.health - amount);
    registerStructureHealthLoss(this.playerBase, previousHealth, this.elapsedTime);
    this.playerBase.alive = this.playerBase.health > 0;
    this.updateStructureStatusElement(this.playerBase, 0);
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
    registerStructureHealthLoss(this.enemyCamp, previousHealth, this.elapsedTime);
    this.enemyCamp.alive = this.enemyCamp.health > 0;
    this.updateStructureStatusElement(this.enemyCamp, 0);
    this.shakeStructure(this.enemyCamp, 0.16, 0.32);
    this.effects.spawnRing(this.enemyCamp.position, '#ff8c66', 1.1, 0.44);
    this.effects.spawnStructureDust(this.enemyCamp.position, this.enemyCamp.collisionRadius, '#8d7464');
    this.effects.spawnDamageNumber(this.enemyCamp.position, amount, {
      height: 2.7
    });
    if (!this.enemyCamp.alive) {
      this.finishLevel(true);
    }
  }

  checkLevelEnd() {
    if (this.levelFinished) return;
    if (!this.enemyCamp.alive) {
      this.finishLevel(true);
      return;
    }
    if (!this.levelSession.debug && this.bossesDefeated >= BOSS_WAVES_TO_WIN) {
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
    if (key === 'f4') {
      event.preventDefault();
      this.setPlayerBaseInvincible(true);
      this.toggleRenderTuningPanel();
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
    this.selectionDrag = null;
    if (event.pointerId != null) {
      safeReleasePointerCapture(this.canvas, event.pointerId);
    }
    this.hideSelectionBox();

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
    this.lastMobileTap = null;
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

  isMobileSelectionDoubleTap(event) {
    const tap = this.lastMobileTap;
    if (!tap) return false;
    if (tap.kind !== 'select' && tap.kind !== 'empty') return false;
    const elapsed = performance.now() - tap.time;
    const distance = Math.hypot(event.clientX - tap.x, event.clientY - tap.y);
    return elapsed <= MOBILE_DOUBLE_TAP_MS && distance <= MOBILE_DOUBLE_TAP_DISTANCE;
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
      this.lastMobileTap = null;
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
      this.lastMobileTap = {
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        kind: 'select'
      };
    } else {
      const moved = this.issueMoveCommand(event);
      this.lastMobileTap = moved
        ? null
        : {
            x: event.clientX,
            y: event.clientY,
            time: performance.now(),
            kind: 'empty'
          };
    }
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

    if (this.playerBase.invincible) {
      this.dom.baseHealth.textContent = '无敌';
    } else {
      const baseRatio = Math.round(
        (this.playerBase.health / this.playerBase.maxHealth) * 100
      );
      this.dom.baseHealth.textContent = `${baseRatio}%`;
    }
    this.dom.waveLabel.textContent = this.currentWave
      ? `${this.wave}/${this.waveSchedule.length}`
      : (this.wave > 0 ? '整备' : '准备');
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
    difficulty: clampLevelDifficulty(session?.difficulty ?? 1),
    deck: Array.isArray(session?.deck) ? session.deck : fallbackDeck,
    debug: session?.debug === true,
    startedAt: session?.startedAt ?? Date.now()
  };
}

function createWaveSchedule(session) {
  const level = session.level ?? {};
  const baseDifficulty = resolveSessionBaseDifficulty(session);
  const selectedDifficulty = clampLevelDifficulty(session?.difficulty ?? 1);
  const difficultyGrowth = resolveSessionDifficultyGrowth(session);
  const seed = hashStringToSeed(
    `${level.id ?? 'level'}:${session.startedAt ?? Date.now()}:${baseDifficulty}:${selectedDifficulty}:${difficultyGrowth.toFixed(3)}`
  );
  const random = seededRandom(seed);
  const affixFlow = normalizeWaveAffixFlow(level.waveAffixFlow);
  const monsterPool = normalizeTypePool(level.waveMonsterTypes ?? WAVE_MONSTER_TYPES, WAVE_MONSTER_TYPES);
  const bossPool = normalizeTypePool(level.waveBossTypes ?? WAVE_BOSS_TYPES, WAVE_BOSS_TYPES);
  const totalWaves = BOSS_WAVES_TO_WIN * WAVES_PER_BOSS;
  const schedule = [];

  for (let index = 1; index <= totalWaves; index += 1) {
    const isBoss = index % WAVES_PER_BOSS === 0;
    const kind = isBoss ? 'boss' : index % ELITE_WAVE_INTERVAL === 0 ? 'elite' : 'normal';
    const bossOrdinal = isBoss ? Math.floor(index / WAVES_PER_BOSS) : 0;
    const difficultyBonus = waveDifficultyBonus(index, difficultyGrowth);
    const effectiveDifficulty = baseDifficulty + difficultyBonus;
    const affixId = chooseWaveAffix(index, kind, affixFlow);
    const affix = WAVE_AFFIX_DEFINITIONS[affixId];
    const waveMonsterPool = filterWaveMonsterPool(monsterPool, index, effectiveDifficulty);
    const waveBossPool = filterWaveBossPool(bossPool, bossOrdinal, effectiveDifficulty);
    const countBonus = waveAffixCountBonus(affix, index, kind);
    const count = Math.min(
      MAX_ACTIVE_WAVE_SPAWNS,
      waveEnemyCount(kind, index, effectiveDifficulty, bossOrdinal) + countBonus
    );
    const types = waveEnemyTypes({
      kind,
      count,
      random,
      monsterPool: waveMonsterPool,
      bossPool: waveBossPool,
      affixId
    });
    schedule.push({
      index,
      kind,
      affixId,
      bossOrdinal,
      count,
      types,
      effectiveDifficulty,
      difficultyBonus
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
  return Math.max(1, Math.floor(level.baseDifficulty ?? 1));
}

function resolveSessionDifficultyGrowth(session) {
  const level = session?.level ?? {};
  const selectedDifficulty = clampLevelDifficulty(session?.difficulty ?? 1);
  const levelGrowth = Number.isFinite(level.waveDifficultyGrowth)
    ? Math.max(0.1, level.waveDifficultyGrowth)
    : 1;
  return levelGrowth * (1 + (selectedDifficulty - 1) * WAVE_DIFFICULTY_GROWTH_PER_SELECTED_DIFFICULTY);
}

function waveDifficultyBonus(wave, sessionOrGrowth = 1) {
  const growth = Number.isFinite(sessionOrGrowth)
    ? sessionOrGrowth
    : resolveSessionDifficultyGrowth(sessionOrGrowth);
  return Math.floor((Math.max(0, wave - 1) / WAVE_DIFFICULTY_STEP_WAVES) * growth);
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
  const affixId = flow[(index - 1) % flow.length];
  if (WAVE_AFFIX_DEFINITIONS[affixId]) return affixId;
  return kind === 'boss' ? 'siege' : 'swarm';
}

function waveAffixLevel(waveConfig) {
  const waveIndex = Math.max(1, Math.floor(waveConfig?.index ?? 1));
  return 1 + Math.floor((waveIndex - 1) / WAVES_PER_BOSS);
}

function waveKindLabel(wave) {
  if (wave.kind === 'boss') return `Boss ${wave.bossOrdinal}/${BOSS_WAVES_TO_WIN}`;
  if (wave.kind === 'elite') return '精英';
  return '普通';
}

function waveAffixLabel(affixId) {
  const affix = WAVE_AFFIX_DEFINITIONS[affixId];
  if (!affix) return '无词缀';
  return `${affix.name}`;
}

function waveEventKicker(wave) {
  if (!wave) return '波次事件';
  return `第 ${wave.index} 波结束 / ${waveKindLabel(wave)} · ${waveAffixLabel(wave.affixId)}`;
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

function unitGenericUpgradeModifiers(unit, upgrade, index = 0) {
  const sourceSuffix = `${upgrade.id}:${index}`;
  if (upgrade.stat === 'vitality') {
    const baseHealth = Math.max(0, unit.definition.maxHealth ?? 0);
    const baseDurability = Math.max(0, unit.definition.weapon?.maxDurability ?? 0);
    return [
      {
        id: `${sourceSuffix}:health`,
        stat: 'maxHealth',
        type: 'add',
        amount: baseHealth * 0.5
      },
      {
        id: `${sourceSuffix}:durability`,
        stat: 'maxDurability',
        type: 'add',
        amount: baseDurability * 0.5
      }
    ];
  }
  if (upgrade.stat === 'attack') {
    const baseAttack = Math.max(0, unit.definition.damage ?? 0);
    return [{
      id: `${sourceSuffix}:attack`,
      stat: 'attackDamage',
      type: 'add',
      amount: baseAttack * 0.5
    }];
  }
  if (upgrade.stat === 'armor') {
    const baseArmor = Math.max(0, unit.definition.armor ?? 0);
    return [{
      id: `${sourceSuffix}:armor`,
      stat: 'armor',
      type: 'add',
      amount: baseArmor > 0 ? baseArmor * 0.5 : 1
    }];
  }
  if (upgrade.stat === 'magicResistance') {
    const baseResistance = Math.max(0, unit.definition.magicResistance ?? 0);
    return [{
      id: `${sourceSuffix}:magicResistance`,
      stat: 'magicResistance',
      type: 'add',
      amount: baseResistance > 0 ? baseResistance * 0.5 : 1
    }];
  }
  return [];
}

function applySupportUpgrade(unit, supportModifiers) {
  if (!supportModifiers || !unit.definition.support) return;
  Object.entries(supportModifiers).forEach(([key, modifier]) => {
    const ability = unit.definition.support[key];
    if (!ability) return;
    if (Number.isFinite(modifier.amountFactor) && Number.isFinite(ability.amount)) {
      ability.amount *= modifier.amountFactor;
    }
    if (Number.isFinite(modifier.cooldownFactor) && Number.isFinite(ability.cooldown)) {
      ability.cooldown *= modifier.cooldownFactor;
    }
    if (Number.isFinite(modifier.tickIntervalFactor) && Number.isFinite(ability.tickInterval)) {
      ability.tickInterval *= modifier.tickIntervalFactor;
    }
  });
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

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function strategyChoiceMarkup(choice, index) {
  const card = choice.card ?? {
    id: `strategy-choice-${index}`,
    name: choice.title ?? '奖励',
    kind: rewardOptionCardKind(choice),
    label: rewardOptionLabel(choice),
    artKey: choice.artKey ?? 'tacticUpgrade',
    summary: choice.description ?? '',
    energyCost: 0,
    color: choice.color ?? '#9eeedb'
  };
  const color = cardThemeColor(card);
  const metaText = choice.metaText ?? `${strategyKindLabel(card.kind)} / ${cardUsesText(card)}`;
  const actionMeta = strategyChoiceActionMeta(choice);
  const actionKey = cssKey(actionMeta.key);
  const kindKey = cssKey(card?.kind ?? 'card');
  return `
    <button class="strategy-choice is-choice-${actionKey} is-kind-${kindKey}" type="button" data-strategy-choice-index="${index}" style="--card-color:${color}">
      <span class="strategy-choice-topline">
        <span class="strategy-choice-action">${escapeHtml(choice.actionLabel)}</span>
        <span class="strategy-choice-type">${escapeHtml(actionMeta.label)}</span>
      </span>
      <span class="strategy-choice-cost">${cardEnergyCost(card)}</span>
      <div class="strategy-choice-art">${createCardArtMarkup(card)}</div>
      <span class="strategy-choice-body">
        <strong>${escapeHtml(choice.title)}</strong>
        <em>${escapeHtml(actionMeta.label)} · ${escapeHtml(metaText)}</em>
        <span>${escapeHtml(choice.description)}</span>
      </span>
    </button>
  `;
}

function strategyEventTypeMeta(type) {
  if (type === 'opening-unit') {
    return { key: 'opening', mark: '初', label: '开局选牌' };
  }
  if (type === 'wave-reward') {
    return { key: 'choice', mark: '奖', label: '波次奖励' };
  }
  if (type === 'card-kind-choice') {
    return { key: 'choice', mark: '选', label: '选牌奖励' };
  }
  if (type === 'existing-card-copy') {
    return { key: 'copy', mark: '复', label: '复制奖励' };
  }
  if (type === 'boss-reward') {
    return { key: 'boss', mark: '核', label: 'Boss 奖励' };
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
  if (choice.action === 'add-card-limited-uses') return { key: 'add-card', label: '代价新卡' };
  if (choice.action === 'select-upgrade-card') return { key: 'select-upgrade', label: '选择升级对象' };
  if (choice.action === 'apply-card-upgrade') return { key: 'apply-upgrade', label: '升级倾向' };
  if (choice.action === 'upgrade-card') return { key: 'upgrade-card', label: '等级提升' };
  if (choice.action === 'copy-card') return { key: 'copy-card', label: '复制奖励' };
  if (choice.action === 'copy-card-limited') return { key: 'copy-card', label: '代价复制' };
  if (choice.action === 'restore-card') return { key: 'restore-card', label: '补充次数' };
  if (choice.action === 'acquire-core') return { key: 'boss-core', label: '构筑核心' };
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

function cardUsesText(card) {
  const maxUses = Math.max(1, Math.floor(card.maxUses ?? defaultStrategyCardUses(card)));
  const remainingUses = Math.max(0, Math.min(maxUses, Math.floor(card.remainingUses ?? maxUses)));
  return `次数 ${remainingUses}/${maxUses}`;
}

function defaultStrategyCardUses(card) {
  if (card?.exhaust) return 1;
  if (card?.kind === 'summon') return 4;
  if (card?.kind === 'ability') return 1;
  return 2;
}

function cardWithUsePenalty(card, penalty = 1) {
  const baseUses = Math.max(1, Math.floor(card?.maxUses ?? defaultStrategyCardUses(card)));
  const maxUses = Math.max(1, baseUses - Math.max(1, Math.floor(penalty)));
  return {
    ...card,
    maxUses,
    remainingUses: maxUses
  };
}

function currentCardRemainingUses(card) {
  const maxUses = Math.max(1, Math.floor(card?.maxUses ?? defaultStrategyCardUses(card)));
  return Math.max(1, Math.min(maxUses, Math.floor(card?.remainingUses ?? maxUses)));
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
  if (!root.querySelector('.strategy-event-type-badge')) {
    root.innerHTML = `
      <div class="strategy-event-panel">
        <div class="strategy-event-header">
          <div class="strategy-event-type-badge">
            <span></span>
            <strong></strong>
          </div>
          <div class="strategy-event-heading">
            <div class="strategy-event-kicker"></div>
            <h2></h2>
          </div>
        </div>
        <p></p>
        <div class="strategy-event-choices"></div>
      </div>
    `;
  }
  return {
    root,
    typeMark: root.querySelector('.strategy-event-type-badge span'),
    typeLabel: root.querySelector('.strategy-event-type-badge strong'),
    kicker: root.querySelector('.strategy-event-kicker'),
    title: root.querySelector('h2'),
    summary: root.querySelector('p'),
    choices: root.querySelector('.strategy-event-choices')
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
        <button type="button" data-render-action="bake-bounce">烘焙反射光</button>
        <button type="button" data-render-action="clear-bounce">清除反射光</button>
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
    <div class="render-tuning-bake-status" data-render-bake-status>未烘焙</div>
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
    bakeStatus: root.querySelector('[data-render-bake-status]'),
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

function createStaticBounceLightMap({ world, worldConfig = BALANCE.world, settings }) {
  const config = worldConfig ?? BALANCE.world;
  const groundWidth = config.ground?.width ?? BALANCE.world.ground.width;
  const groundDepth = config.ground?.depth ?? BALANCE.world.ground.depth;
  const width = BOUNCE_LIGHTMAP_WIDTH;
  const height = Math.min(
    BOUNCE_LIGHTMAP_MAX_HEIGHT,
    Math.max(BOUNCE_LIGHTMAP_MIN_HEIGHT, Math.round(width * (groundDepth / Math.max(1, groundWidth))))
  );
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Bounce light canvas unavailable');

  const image = ctx.createImageData(width, height);
  const data = image.data;
  const normalized = normalizeRenderTuning(settings, config);
  const shadowMask = readShadowMaskData(world?.shadowMaskTexture);
  const groundSampler = createGroundBounceSampler(world, config, shadowMask);
  const sunColor = new THREE.Color(normalized.sunColor);
  const hemiSky = new THREE.Color(normalized.hemiSky);
  const emitters = collectStaticBounceEmitters(world, normalized);
  const halfWidth = groundWidth * 0.5;
  const halfDepth = groundDepth * 0.5;
  const sunBounce = normalized.sunIntensity * BOUNCE_LIGHTMAP_SHADOW_LIFT * BOUNCE_LIGHTMAP_SNOW_REFLECTANCE;
  const skyBounce = normalized.hemiIntensity * 0.018;

  for (let py = 0; py < height; py += 1) {
    const v = (py + 0.5) / height;
    const z = (1 - v) * groundDepth - halfDepth;
    for (let px = 0; px < width; px += 1) {
      const u = (px + 0.5) / width;
      const x = u * groundWidth - halfWidth;
      const groundSample = groundSampler.sample(x, z);
      const shadow = groundSample.shadow;
      const shadeLift = 0.28 + shadow * 0.95;
      const sourceLit = clamp(1 - shadow * 0.45, 0.22, 1);
      let r = sunColor.r * groundSample.color.r * sunBounce * shadeLift * sourceLit + hemiSky.r * skyBounce * (0.55 + shadow);
      let g = sunColor.g * groundSample.color.g * sunBounce * shadeLift * sourceLit + hemiSky.g * skyBounce * (0.55 + shadow);
      let b = sunColor.b * groundSample.color.b * sunBounce * shadeLift * sourceLit + hemiSky.b * skyBounce * (0.55 + shadow);

      for (let i = 0; i < emitters.length; i += 1) {
        const emitter = emitters[i];
        const dx = x - emitter.x;
        const dz = z - emitter.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq >= emitter.radiusSq) continue;
        const falloff = 1 - distanceSq / emitter.radiusSq;
        const contribution = emitter.strength * falloff * falloff * (0.45 + shadow * 0.85);
        r += emitter.color.r * contribution;
        g += emitter.color.g * contribution;
        b += emitter.color.b * contribution;
      }

      const offset = (py * width + px) * 4;
      data[offset] = Math.round(clamp(r, 0, 0.78) * 255);
      data[offset + 1] = Math.round(clamp(g, 0, 0.78) * 255);
      data[offset + 2] = Math.round(clamp(b, 0, 0.78) * 255);
      data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `${config.sceneKey ?? 'world'}-bounce-lightmap`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return {
    texture,
    width,
    height,
    emitterCount: emitters.length,
    intensity: BOUNCE_LIGHTMAP_INTENSITY
  };
}

function staticBounceObjectsForWorld(world) {
  const unique = new Set();
  [
    ...(world?.staticCullables ?? []).map((item) => item.object),
    world?.playerBaseModel,
    world?.enemyCampModel
  ].forEach((object) => {
    if (object) unique.add(object);
  });
  return [...unique];
}

function createGroundBounceSampler(world, config, shadowMask = null) {
  const groundWidth = config.ground?.width ?? BALANCE.world.ground.width;
  const groundDepth = config.ground?.depth ?? BALANCE.world.ground.depth;
  const halfWidth = groundWidth * 0.5;
  const halfDepth = groundDepth * 0.5;
  const fallbackColor = new THREE.Color(config.palette?.snow ?? config.palette?.base ?? '#fffef8');
  const geometry = world?.ground?.geometry;
  const position = geometry?.attributes?.position;
  const color = geometry?.attributes?.color;
  const widthSegments = geometry?.parameters?.widthSegments ?? 106;
  const heightSegments = geometry?.parameters?.heightSegments ?? 102;
  const columns = widthSegments + 1;
  const rows = heightSegments + 1;
  const samples = new Array(columns * rows);

  if (position) {
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = -position.getY(i);
      const u = clamp((x + halfWidth) / groundWidth, 0, 1);
      const v = clamp((z + halfDepth) / groundDepth, 0, 1);
      const col = clamp(Math.round(u * widthSegments), 0, widthSegments);
      const row = clamp(Math.round(v * heightSegments), 0, heightSegments);
      const sampleColor = color
        ? new THREE.Color(color.getX(i), color.getY(i), color.getZ(i))
        : fallbackColor.clone();
      samples[row * columns + col] = {
        color: sampleColor,
        height: position.getZ(i)
      };
    }
  }

  return {
    sample(x, z) {
      const u = clamp((x + halfWidth) / groundWidth, 0, 1);
      const groundV = clamp((z + halfDepth) / groundDepth, 0, 1);
      const col = clamp(Math.round(u * widthSegments), 0, widthSegments);
      const row = clamp(Math.round(groundV * heightSegments), 0, heightSegments);
      const item = samples[row * columns + col];
      return {
        color: item?.color ?? fallbackColor,
        height: item?.height ?? 0,
        shadow: sampleShadowMaskAt(shadowMask, u, 1 - groundV)
      };
    }
  };
}

function bakeBounceIntoMesh(node, settings, config, groundSampler) {
  const sourceGeometry = node.geometry;
  const position = sourceGeometry?.attributes?.position;
  if (!position) return null;

  const bakedGeometry = sourceGeometry.clone();
  if (!bakedGeometry.attributes?.normal) {
    bakedGeometry.computeVertexNormals();
  }
  const bakedPosition = bakedGeometry.attributes.position;
  const bakedNormal = bakedGeometry.attributes.normal;
  const originalColor = sourceGeometry.attributes?.color ?? null;
  const vertexColors = new Float32Array(bakedPosition.count * 3);
  const materials = Array.isArray(node.material) ? node.material : [node.material];
  const receiverColor = averageMaterialsColor(materials);
  const receiverTint = receiverColor.clone();
  const worldPosition = new THREE.Vector3();
  const worldNormal = new THREE.Vector3(0, 1, 0);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(node.matrixWorld);
  let changedVertices = 0;

  for (let i = 0; i < bakedPosition.count; i += 1) {
    worldPosition.fromBufferAttribute(bakedPosition, i).applyMatrix4(node.matrixWorld);
    if (bakedNormal) {
      worldNormal.fromBufferAttribute(bakedNormal, i).applyMatrix3(normalMatrix).normalize();
    }
    const existingColor = originalColor
      ? new THREE.Color(originalColor.getX(i), originalColor.getY(i), originalColor.getZ(i))
      : new THREE.Color(1, 1, 1);
    const baseColor = receiverTint.clone().multiply(existingColor);
    const bounce = sampleGroundReflectedLight(worldPosition, worldNormal, settings, groundSampler);
    const finalColor = baseColor.clone().add(bounce.multiply(receiverTint).multiplyScalar(BOUNCE_OBJECT_VERTEX_SCALE));
    clampColorComponents(finalColor, 0, 1.18);
    const offset = i * 3;
    vertexColors[offset] = finalColor.r;
    vertexColors[offset + 1] = finalColor.g;
    vertexColors[offset + 2] = finalColor.b;
    if (colorDistanceSquared(finalColor, baseColor) > 0.0001) changedVertices += 1;
  }

  if (changedVertices <= 0) {
    bakedGeometry.dispose?.();
    return null;
  }

  bakedGeometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  const bakedMaterials = materials.map((material) => {
    if (!material) return material;
    const baked = material.clone();
    baked.vertexColors = true;
    if (baked.color && !baked.map) {
      baked.color.set('#ffffff');
    }
    baked.needsUpdate = true;
    return baked;
  });
  return {
    geometry: bakedGeometry,
    materials: bakedMaterials,
    vertexCount: changedVertices
  };
}

function sampleGroundReflectedLight(worldPosition, worldNormal, settings, groundSampler) {
  const sunColor = new THREE.Color(settings.sunColor);
  const skyColor = new THREE.Color(settings.hemiSky);
  const sunXZ = new THREE.Vector2(settings.sunX, settings.sunZ);
  if (sunXZ.lengthSq() <= 0.0001) sunXZ.set(1, 0);
  sunXZ.normalize();
  const centerSample = groundSampler.sample(worldPosition.x, worldPosition.z);
  const heightAboveGround = Math.max(0, worldPosition.y - centerSample.height);
  const radius = clamp(
    heightAboveGround * 0.72 + 1.15,
    BOUNCE_OBJECT_SAMPLE_RADIUS_MIN,
    BOUNCE_OBJECT_SAMPLE_RADIUS_MAX
  );
  const sampleOffsets = [
    { x: 0, z: 0, weight: 1 },
    { x: -sunXZ.x * radius * 0.7, z: -sunXZ.y * radius * 0.7, weight: 0.78 },
    { x: sunXZ.x * radius * 0.45, z: sunXZ.y * radius * 0.45, weight: 0.42 },
    { x: -sunXZ.y * radius * 0.46, z: sunXZ.x * radius * 0.46, weight: 0.34 },
    { x: sunXZ.y * radius * 0.46, z: -sunXZ.x * radius * 0.46, weight: 0.34 }
  ];
  const incoming = new THREE.Color(0, 0, 0);
  const toHit = new THREE.Vector3();
  const hitPosition = new THREE.Vector3();

  sampleOffsets.forEach((offset) => {
    const sx = worldPosition.x + offset.x;
    const sz = worldPosition.z + offset.z;
    const sample = groundSampler.sample(sx, sz);
    hitPosition.set(sx, sample.height, sz);
    toHit.copy(hitPosition).sub(worldPosition);
    const distanceSq = Math.max(0.05, toHit.lengthSq());
    toHit.normalize();
    const facing = clamp(0.12 + Math.max(0, worldNormal.dot(toHit)) * 0.92, 0, 1);
    const attenuation = offset.weight / (1 + distanceSq * 0.22);
    const sourceLit = clamp(1 - sample.shadow * 0.72, 0.18, 1);
    const sourceColor = sample.color.clone()
      .multiply(sunColor)
      .multiplyScalar(settings.sunIntensity * BOUNCE_LIGHTMAP_SNOW_REFLECTANCE * sourceLit)
      .add(skyColor.clone().multiplyScalar(settings.hemiIntensity * 0.045));
    incoming.add(sourceColor.multiplyScalar(attenuation * facing));
  });

  clampColorComponents(incoming, 0, 0.95);
  return incoming;
}

function collectStaticBounceEmitters(world, settings) {
  const sources = staticBounceEmitterSourcesForWorld(world);
  const emitters = [];
  const sunDirection = new THREE.Vector3(settings.sunX, settings.sunY, settings.sunZ).normalize();
  const sunFacing = clamp(sunDirection.y * 1.2, 0.2, 1);
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();

  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    let color = source.color ?? null;
    if (source.object) {
      source.object.updateWorldMatrix(true, true);
      box.setFromObject(source.object);
      if (box.isEmpty()) continue;
      box.getCenter(center);
      box.getSize(size);
      color = averageObjectMaterialColor(source.object);
    } else {
      center.copy(source.center);
      size.copy(source.size);
    }
    if (!color) continue;
    const reflectance = bounceReflectanceForColor(color);
    const radius = clamp(
      Math.max(size.x, size.z) * 1.35 + size.y * 0.45,
      BOUNCE_LIGHTMAP_EMITTER_RADIUS_MIN,
      BOUNCE_LIGHTMAP_EMITTER_RADIUS_MAX
    );
    const surfaceScale = clamp(size.length() / 8, 0.42, 1.55);
    emitters.push({
      x: center.x,
      z: center.z,
      radius,
      radiusSq: radius * radius,
      color,
      strength: settings.sunIntensity * reflectance * sunFacing * surfaceScale * 0.012
    });
  }

  emitters.sort((a, b) => b.strength * b.radius - a.strength * a.radius);
  return emitters.slice(0, BOUNCE_LIGHTMAP_MAX_EMITTERS);
}

function staticBounceEmitterSourcesForWorld(world) {
  const unique = new Set();
  [
    ...(world?.staticCullables ?? [])
      .map((item) => item.object)
      .filter((object) => !object?.userData?.isStaticDecorationBatch),
    world?.playerBaseModel,
    world?.enemyCampModel
  ].forEach((object) => {
    if (object) unique.add(object);
  });
  return [
    ...(world?.staticDecorationBounceSources ?? []),
    ...[...unique].map((object) => ({ object }))
  ];
}

function averageObjectMaterialColor(object) {
  const color = new THREE.Color(0, 0, 0);
  let count = 0;
  object.traverse((node) => {
    if (!node.isMesh || node.userData?.skipBakedShadow) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      if (!material?.color) return;
      color.add(material.color);
      count += 1;
    });
  });
  if (count <= 0) return null;
  color.multiplyScalar(1 / count);
  return color;
}

function bounceReflectanceForColor(color) {
  const luminance = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  const greenBias = Math.max(0, color.g - Math.max(color.r, color.b));
  if (luminance > 0.78) return 0.42;
  if (greenBias > 0.08) return 0.24;
  if (color.r > color.g * 1.15 && color.r > color.b * 1.2) return 0.28;
  return clamp(0.2 + luminance * 0.28, 0.18, 0.38);
}

function averageMaterialsColor(materials) {
  const color = new THREE.Color(0, 0, 0);
  let count = 0;
  materials.forEach((material) => {
    if (!material?.color) return;
    color.add(material.color);
    count += 1;
  });
  if (count <= 0) return new THREE.Color(1, 1, 1);
  return color.multiplyScalar(1 / count);
}

function colorDistanceSquared(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function clampColorComponents(color, min = 0, max = 1) {
  color.r = clamp(color.r, min, max);
  color.g = clamp(color.g, min, max);
  color.b = clamp(color.b, min, max);
  return color;
}

function readShadowMaskData(texture) {
  const canvas = texture?.image;
  if (!canvas?.getContext || !canvas.width || !canvas.height) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    return {
      width: canvas.width,
      height: canvas.height,
      data: ctx.getImageData(0, 0, canvas.width, canvas.height).data
    };
  } catch {
    return null;
  }
}

function sampleShadowMaskAt(mask, u, v) {
  if (!mask?.data) return 0.22;
  const x = clamp(Math.round(u * (mask.width - 1)), 0, mask.width - 1);
  const y = clamp(Math.round(v * (mask.height - 1)), 0, mask.height - 1);
  const offset = (y * mask.width + x) * 4;
  return clamp(1 - mask.data[offset] / 255, 0, 1);
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
    `wave: ${game?.wave ?? '-'}`,
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
  if (Number.isFinite(unit.definition?.statusHeight)) return unit.definition.statusHeight;
  if (unit.type === 'goblinTroll' || unit.type === 'shieldBearer') return 2.35;
  if (unit.type === 'ogre') return 2.65;
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

function createStructureState({ id, position, projectileHitHeight, attributes }) {
  const structure = {
    id,
    kind: 'structure',
    position,
    projectileHitHeight,
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
