import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SAOPass } from 'three/examples/jsm/postprocessing/SAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { createSelectionRing } from '../art/lowpoly.js';
import {
  BALANCE,
  CARD_DEFINITIONS,
  COOP_ENEMY_SCALING,
  ISLAND_SPAWN_POINTS,
  ITEM_DEFINITIONS,
  ITEM_RULES,
  LEVEL_DEFINITIONS,
  POWER_RULES,
  RECRUITMENT_ORDER_ITEM_ID,
  RESOURCE_NODE_RULES,
  TEAMS,
  UNIT_DEFINITIONS,
  WAVE_BOSS_TYPES,
  WAVE_MONSTER_TYPES,
  isTerrainCard,
  enemyManaFactor,
  manaValueForEnemy,
  openingEnergyForLevel,
  openingUnitCardCount
} from '../data/gameData.js';
import {
  UNIT_GENERIC_UPGRADES,
  UNIT_SPECIAL_UPGRADES,
  runtimeUpgradeSummaryForCard,
  runtimeUpgradeTitleForCard
} from '../data/cardUpgrades.js';
import { pickAltarSpecializationChoices } from './altarRewardChoices.js';
import { UnitEntity } from '../entities/UnitEntity.js';
import {
  createUnitModel,
  playUnitAnimation,
  prewarmUnitModelTemplates,
  setUnitRuntimeVisualScale,
  triggerUnitHitFlash
} from '../art/visualRegistry.js';
import { createWorld } from '../world/createWorld.js';
import { createCoopPlayerStates, isCoopSession } from '../coop/CoopSession.js';
import { BuffSystem } from './BuffSystem.js';
import { BuildingSystem } from './BuildingSystem.js';
import { CardEffectSystem } from './CardEffectSystem.js';
import {
  CardSystem,
  cardEnergyCost,
  cardThemeColor,
  createCardArtMarkup,
  createForgedCardMarkup,
  fitStrategyRewardCards
} from './CardSystem.js';
import { CombatSystem } from './CombatSystem.js';
import { AttackSystem } from './AttackSystem.js';
import { EffectsSystem } from './EffectsSystem.js';
import { AltarSystem } from './AltarSystem.js';
import { EnemyEnchantmentSystem } from './EnemyEnchantmentSystem.js';
import { eliteOrBossInitialAttackModifiers } from './enemyForceRules.js';
import { standardEnemyStatFactors } from './difficultyRules.js';
import { LevelMechanicSystem } from './LevelMechanicSystem.js';
import { LootDropSystem } from './LootDropSystem.js';
import { AttributeSet, bindAttributeGetter } from './AttributeSet.js';
import { AreaEffectSystem } from './AreaEffectSystem.js';
import { AbilitySystem } from './AbilitySystem.js';
import { BattleDebugPanel } from './BattleDebugPanel.js';
import { ModifierSystem } from './ModifierSystem.js';
import { RecoverySystem } from './RecoverySystem.js';
import { SpellSystem } from './SpellSystem.js';
import { MovementSystem } from './MovementSystem.js';
import { PathfindingSystem } from './PathfindingSystem.js';
import { TargetingSystem } from './TargetingSystem.js';
import { UnitLogicSystem } from './UnitLogicSystem.js';
import { UnitRegistry } from './UnitRegistry.js';
import {
  isRunShopPrepBlockingWaveAdvance,
  shouldPauseRunShop,
  shouldRestoreFreeRunShopUi
} from './runShopUiState.js';
import {
  RUN_SHOP_ACTION_BUY_ENERGY,
  RUN_SHOP_ACTION_SPECIALIZATION_FALLBACK,
  RUN_SHOP_ACTION_SPECIALIZATION_UNIT,
  RUN_SHOP_BACK_TO_UNIT_LABEL,
  RUN_SHOP_CATEGORIES,
  RUN_SHOP_CONTINUE_LABEL,
  RUN_SHOP_ENERGY_CARD_ID,
  RUN_SHOP_FREE_LABEL,
  RUN_SHOP_SOLD_OUT_LABEL,
  RUN_SHOP_SPECIALIZATION_STEPS,
  RUN_SHOP_SPECIALIZATION_TITLE,
  RUN_SHOP_STEP_SPECIALIZATION_TYPE,
  RUN_SHOP_STEP_SPECIALIZATION_UPGRADE,
  RUN_SHOP_STEP_SUPPLY,
  RUN_SHOP_SUPPLY_KIND_ICONS,
  RUN_SHOP_SUPPLY_KIND_LABELS,
  RUN_SHOP_SUPPLY_KINDS,
  RUN_SHOP_SUPPLY_TITLE,
  isRunShopCategoryRetired,
  runShopSupplyConfig,
  runShopSupplyEnergyAmount,
  runShopSupplyFallbackSilver,
  runShopSupplyItemCount,
  runShopSupplyKindPrice,
  runShopSupplyKindSequence
} from './runShopCatalog.js';
import {
  performSelfDestructAttacks,
  performSelfDestructExplosion,
  SELF_DESTRUCT_RADIUS
} from './selfDestructRules.js';
import { clamp, distance2D, polarOffset, seededRandom } from '../utils/math.js';
import { calculateLevelReward } from '../utils/levelRewards.js';
import {
  applyKnockbackImpulse,
  formatSupportAmount,
  KNOCKBACK_MOTION_TIME_SCALE,
  targetCombatRadius
} from './combatHelpers.js';
import {
  applyEndlessDifficulty,
  applyEndlessPerformanceMultiplier,
  calculateEndlessReward,
  endlessEnchantCount,
  endlessEnchantLevel,
  endlessEnemyClass,
  endlessDifficultyReferenceHealth,
  endlessEnemyStatFactors,
  endlessExpectedLifetime,
  endlessPlayerUnitDeathDifficultyDelta,
  endlessPlayerUnitDeathPerformanceDelta,
  isEndlessMode,
  normalizeChallengeMode,
  resetEndlessDeckLevels,
  resolveEndlessEnemyDefeat
} from './endlessMode.js';
import {
  consumeBaseHealthLossMilestones,
  resolvePlayerBaseDamage,
  resolveStructureDamage
} from './playerBaseRules.js';
import { scaleResourceAfterMaximumChange } from './unitResourceSync.js';
import { NetworkAnalysisUi } from './NetworkAnalysisUi.js';
import {
  createWaveRewardDeckIds,
  shouldConsumeWaveRewardCard,
  waveRewardUnitCards
} from './waveRewardPool.js';
import { RuneStoneSystem } from './RuneStoneSystem.js';
import { ResourceNodeSystem } from './ResourceNodeSystem.js';
import { Inventory } from './Inventory.js';
import {
  CRAFT_ERROR_LABELS,
  allRecipes,
  canCraft,
  craftRecipe as craftIntoInventory,
  maxCraftableTimes,
  normalizeRecipe,
  recipeById
} from './crafting.js';
import { BaseStorageUi } from './BaseStorageUi.js';
import { isHostileEnemy } from './unitTeam.js';
import { PowerSystem } from './PowerSystem.js';
import { SpawnPointSystem } from './SpawnPointSystem.js';
import { GroundDropSystem } from './GroundDropSystem.js';
import { ProductionSystem } from './ProductionSystem.js';
import { FuelPowerSystem } from './FuelPowerSystem.js';
import { ResearchSystem } from './ResearchSystem.js';
import { PlantingSystem } from './PlantingSystem.js';
import { FacilitySystem } from './FacilitySystem.js';
import {
  WEAPON_ERROR_LABELS,
  baselineWeaponItemFor,
  canEquipWeapon,
  weaponStatPatch
} from './weapons.js';
import { HotbarUi } from './HotbarUi.js';
import { planDeathDrop } from './drops.js';
import { WorkSystem } from './WorkSystem.js';
import { RuneBackpackUi } from './RuneBackpackUi.js';
import { manaThresholdForLevel, runeDisplayName } from './runeStones.js';
import { autoRebirthDurationFor } from './rebirthRules.js';
import {
  cameraFollowCenter,
  cameraKeyboardPanDelta,
  cameraMoveKeyForEvent
} from './cameraKeyboardControls.js';

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
const MAX_LEVEL_DIFFICULTY = 10;
const TOTAL_WAVES = 21;
const BOSS_WAVES_TO_WIN = 3;
const WAVES_PER_BOSS = 7;
const COOP_REWARD_AUTO_SELECT_SECONDS = 30;
const BOSS_HEALTH_MULTIPLIER = 0.6;
const ELITE_WAVE_INTERVAL = 3;
const WAVE_DIFFICULTY_STEP_WAVES = 3;
const WAVE_DIFFICULTY_GROWTH_PER_SELECTED_DIFFICULTY = 0.16;
const STRATEGY_CHOICE_COUNT = 3;
const STRATEGY_REWARD_REROLL_SILVER_COST = 4;
const SILVER_GAIN_MULTIPLIER = 0.6;
const RUN_SHOP_PLAYER_ACCESS_ENABLED = false;
const FORCED_CARD_CHOICE_UNTIL_WAVE = 3;
const OPENING_COMBAT_UNIT_CHOICES = 2;
// 开局步骤由关卡路线数驱动：每条路线一次单位卡三选一，之后各一次能力卡与地形卡。
// 不再有开局附魔卡步骤——附魔卡改为一次性生成符文石（见 docs/RUNE_STONE_GAMEPLAY_PLAN.md 第 2～3 节）。
// 第一步（首个单位卡三选一）在开局时直接打开，其余步骤由 pendingStrategyRewards 依次串行推进（联机按全员等待）。
const OPENING_REWARD_STEP_DEFINITIONS = {
  unit: {
    type: 'opening-unit',
    kind: 'summon',
    title: '选择你的起始单位卡',
    summary: '从所有战斗单位中三选一，获得该单位卡后自行部署。'
  },
  ability: {
    type: 'opening-ability',
    kind: 'ability',
    title: '选择起始能力卡',
    summary: '从能力卡中三选一，加入抽牌堆。'
  },
  terrain: {
    type: 'opening-terrain',
    kind: 'spell',
    terrainOnly: true,
    title: '选择起始地形卡',
    summary: '从地形卡中三选一，加入抽牌堆。'
  }
};
const OPENING_REWARD_STEP_ORDER = ['unit', 'ability', 'terrain'];

export function openingRewardStepsForLevel(level, opening = BALANCE.opening) {
  const counts = {
    unit: openingUnitCardCount(level, opening),
    ability: Math.max(0, Math.floor(Number(opening?.abilityCards ?? 1))),
    terrain: Math.max(0, Math.floor(Number(opening?.terrainCards ?? 1)))
  };
  const steps = [];
  OPENING_REWARD_STEP_ORDER.forEach((key) => {
    const definition = OPENING_REWARD_STEP_DEFINITIONS[key];
    const count = counts[key] ?? 0;
    for (let index = 0; index < count; index += 1) {
      steps.push({ ...definition });
    }
  });
  return steps;
}
const ENEMY_CAMP_IDLE_SCAN_SECONDS = 0.18;
// 海岛生存：己方单位全灭后要连续这么多秒没有新单位，才算真的走投无路。
// 单位死亡与替补入场可能落在相邻两帧，不设这个宽限会在"刚要有人"的瞬间误判失败。
const SURVIVAL_STRANDED_GRACE_SECONDS = 5;
// 旧版“军需铺按服务类别定价”的基础价：仅用于初始化 shopPrices 这个联机私有状态字段。
const RUN_SHOP_BASE_PRICE = 12;
const WAVE_AFFIX_DEFINITIONS = {
  swarm: {
    id: 'swarm',
    name: '集群',
    preview: '步兵 · 蜘蛛 · 掠夺者',
    description: '集群主题提高哥布林步兵、蜘蛛与掠夺者的出场权重，只改变本波怪物种类。',
    preferredTypes: ['goblinSoldier', 'spider', 'enemyRaider']
  },
  armored: {
    id: 'armored',
    name: '重甲',
    preview: '重装 · 盾卫 · 大型怪物',
    description: '重甲主题提高重装、盾卫与大型怪物的出场权重，只改变本波怪物种类。',
    preferredTypes: ['skeletonSoldier', 'shieldBearer', 'goblinShaman', 'goblinTroll', 'ogre', 'scorpion']
  },
  rush: {
    id: 'rush',
    name: '冲锋',
    preview: '掠夺者 · 猎手 · 蜘蛛',
    description: '冲锋主题提高高速近战怪物的出场权重，只改变本波怪物种类。',
    preferredTypes: ['enemyRaider', 'goblinHunter', 'spider', 'goblinSoldier']
  },
  ranged: {
    id: 'ranged',
    name: '远射',
    preview: '弓手 · 狙击手 · 施法者',
    description: '远射主题提高远程与施法怪物的出场权重，只改变本波怪物种类。',
    preferredTypes: ['goblinArcher', 'goblinHunter', 'elfSniper', 'skeletonArcher', 'venomArcher', 'goblinShaman', 'wizard', 'frostAcolyte']
  },
  siege: {
    id: 'siege',
    name: '攻城',
    preview: '巨魔 · 食人魔 · 爆破手',
    description: '攻城主题提高大型与爆破怪物的出场权重，只改变本波怪物种类。',
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
  summary: '特殊卡牌。使目标每秒恢复 4% 最大生命值（消耗）。',
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
  summary: '特殊卡牌。拖拽给单位后，随机进行 5 次 1 级附魔（消耗）。',
  target: 'friendly-unit',
  radius: 1.1,
  cooldown: 0,
  energyCost: 0,
  uses: 1,
  lootOnly: true,
  effect: {
    type: 'apply-random-enchantments',
    count: 5,
    level: 1
  },
  color: '#b68cff'
};
const TEMPORARY_RUNE_EXPANSION_CARD = {
  id: 'temporary-rune-expansion',
  name: '扩容咒印',
  kind: 'tactic',
  label: '拓',
  artKey: 'abilityEnchantEcho',
  summary: '特殊卡牌。使一个友方单位的附魔槽上限永久 +1（消耗）。',
  target: 'friendly-unit',
  radius: 1.1,
  cooldown: 0,
  energyCost: 0,
  uses: 1,
  lootOnly: true,
  effect: {
    type: 'increase-enchantment-slots',
    amount: 1
  },
  color: '#63e0c4'
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
    description: '获得一张特殊卡牌：每秒恢复目标 4% 最大生命值（消耗）。',
    temporaryCard: TEMPORARY_IMMORTALITY_CARD
  },
  {
    id: 'temporary-mana-surge-card',
    action: 'grant-temporary-card',
    title: '获得魔力涌动',
    description: '获得一张特殊卡牌：对目标随机进行 5 次 1 级附魔（消耗）。',
    temporaryCard: TEMPORARY_MANA_SURGE_CARD
  },
  {
    id: 'temporary-rune-expansion-card',
    action: 'grant-temporary-card',
    title: '获得扩容咒印',
    description: '获得一张特殊卡牌：使一个友方单位的附魔槽上限永久 +1（消耗）。',
    temporaryCard: TEMPORARY_RUNE_EXPANSION_CARD
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
const SELF_DESTRUCT_ENCHANTMENT_ID = 'selfDestruct';
const BASE_RECOVERY_PACT_ABILITY_ID = 'baseRecoveryPact';
const BASE_RECOVERY_PACT_SOURCE = 'ability:base-recovery-pact';
const BASE_RECOVERY_PACT_MAX_HEALTH_FACTOR = 0.6;
const BASE_RECOVERY_PACT_INTERVAL_SECONDS = 3;
const PLAYER_VISUAL_COLORS = ['#62d56f', '#f2c94c', '#a970ff', '#55a7ff'];
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
  enemyEnchantment: '敌方附魔',
  frame: '整帧',
  hud: 'HUD',
  loot: '掉落',
  mechanics: '关卡机制',
  navDebug: '寻路显示',
  playerBaseAttack: '基地防御火力',
  rebirth: '复生队列',
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
  toneMapping: 'aces',
  // 预览页定稿（2026-09-06）：亮冷白雪面 + 低位金色侧光，高环境光保持通透，远景统一冷灰蓝。
  exposure: 1.04,
  brightness: 1.05,
  contrast: 1.18,
  saturation: 1.02,
  hue: 0,
  warmth: 0,
  // 金色暖阳从前方偏左低位斜入，照亮近景主路与营地；冷灰蓝环境光整体托底，阴影通透不死黑。
  sunColor: '#ffcf9e',
  sunIntensity: 3.5,
  sunX: -22,
  sunY: 42,
  sunZ: 88,
  shadowIntensity: 1,
  hemiIntensity: 0.78,
  hemiSky: '#b7c9e8',
  hemiGround: '#3b4a68',
  ambientColor: '#a9b2c6',
  ambientIntensity: 0.6,
  background: '#c8cddc',
  fogColor: '#c8cddc',
  fogNear: 48,
  fogFar: 215,
  aoIntensity: 0.012,
  aoScale: 3.2,
  aoKernelRadius: 18,
  aoBias: 0.26,
  // 轻微接触遮蔽与辉光衔接岩脚、积雪和树根，轮廓保持柔和。
  bloomStrength: 0.12,
  vignetteStrength: 0.06,
  snowColor: '#e9eef6',
  rockColor: '#7c7f85',
  treeColor: '#46685a',
  outlineThickness: 0.2,
  outlineColor: '#56606d',
  outlineThreshold: 0.48
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
  shadowIntensity: 1,
  hemiIntensity: 1.52,
  hemiSky: '#ac6262',
  hemiGround: '#ff8080',
  background: '#d1d1d1',
  fogColor: '#c05454',
  fogNear: 20,
  fogFar: 127,
  aoIntensity: 0.01,
  aoScale: 2.6,
  aoKernelRadius: 24,
  aoBias: 0.08,
  snowColor: '#eee8d8',
  rockColor: '#969487',
  treeColor: '#356747',
  outlineThickness: 0.3,
  outlineColor: '#221111',
  outlineThreshold: 0.18
});
const RED_DESERT_HEAD_RENDER_TUNING = Object.freeze({
  toneMapping: 'linear',
  exposure: 0.89,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  warmth: 0,
  sunColor: '#ffdbcc',
  sunIntensity: 8,
  sunX: -88,
  sunY: 48,
  sunZ: 48,
  shadowIntensity: 1,
  hemiIntensity: 0.77,
  hemiSky: '#ffd79e',
  hemiGround: '#902c2c',
  background: '#ff8847',
  fogColor: '#ffa27a',
  fogNear: 20,
  fogFar: 245,
  aoIntensity: 0.01,
  aoScale: 2.6,
  aoKernelRadius: 32,
  aoBias: 0.08,
  snowColor: '#eee8d8',
  rockColor: '#969487',
  treeColor: '#356747',
  outlineThickness: 0.3,
  outlineColor: '#442211',
  outlineThreshold: 0.18
});
const EMERALD_MARSH_HEAD_RENDER_TUNING = Object.freeze({
  toneMapping: 'aces',
  exposure: 0.97,
  brightness: 1.03,
  contrast: 1.07,
  saturation: 1.02,
  hue: 0,
  warmth: 0,
  sunColor: '#ffd9a6',
  sunIntensity: 3.5,
  sunX: -62,
  sunY: 54,
  sunZ: 40,
  shadowIntensity: 0.82,
  hemiIntensity: 0.92,
  hemiSky: '#b8d0c6',
  hemiGround: '#2f4638',
  ambientColor: '#7d98a0',
  ambientIntensity: 0.5,
  background: '#93a893',
  fogColor: '#9cb2a0',
  fogNear: 38,
  fogFar: 152,
  aoIntensity: 0.025,
  aoScale: 3.2,
  aoKernelRadius: 10,
  aoBias: 0.14,
  bloomStrength: 0.035,
  vignetteStrength: 0.025,
  snowColor: '#5f7050',
  rockColor: '#5a655b',
  treeColor: '#3f6849',
  outlineThickness: 0,
  outlineColor: '#34443d',
  outlineThreshold: 0.24
});
const CAMERA_FOG_COMPENSATION_START = 0.46;
const CAMERA_FOG_COMPENSATION_NEAR_SCALE = 0.34;
const CAMERA_FOG_COMPENSATION_FAR_SCALE = 2.4;

const OutlineShader = {
  name: 'LowPolyOutlineShader',
  uniforms: {
    tDiffuse: { value: null },
    aspect: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    outlineColor: { value: new THREE.Color('#445566') },
    outlineThickness: { value: 0.8 },
    outlineThreshold: { value: 0.22 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 aspect;
    uniform vec3 outlineColor;
    uniform float outlineThickness;
    uniform float outlineThreshold;
    varying vec2 vUv;

    void main() {
      vec4 centerTexel = texture2D(tDiffuse, vUv);
      if (outlineThickness <= 0.0) {
        gl_FragColor = centerTexel;
        return;
      }
      
      vec2 texelSize = outlineThickness / aspect;
      
      // Sample adjacent 4 pixels
      vec3 cLeft   = texture2D(tDiffuse, vUv + vec2(-texelSize.x, 0.0)).rgb;
      vec3 cRight  = texture2D(tDiffuse, vUv + vec2( texelSize.x, 0.0)).rgb;
      vec3 cUp     = texture2D(tDiffuse, vUv + vec2(0.0,  texelSize.y)).rgb;
      vec3 cDown   = texture2D(tDiffuse, vUv + vec2(0.0, -texelSize.y)).rgb;

      // Color distance-based edge detection
      float diff = distance(centerTexel.rgb, cLeft) +
                   distance(centerTexel.rgb, cRight) +
                   distance(centerTexel.rgb, cUp) +
                   distance(centerTexel.rgb, cDown);

      // Smoothstep the edge detection using the threshold parameter
      float edge = smoothstep(outlineThreshold, outlineThreshold + 0.15, diff);

      // 高亮豁免：加法混合的发光粒子（回血光点、闪电、火花、烟花等）输出接近
      // 白热的高亮度像素，亮度过高时不再叠加暗色描边，否则小粒子会被整个描成黑色。
      float luminance = dot(centerTexel.rgb, vec3(0.299, 0.587, 0.114));
      float highlightMask = 1.0 - smoothstep(0.66, 0.9, luminance);
      edge *= highlightMask;

      // 火焰豁免：半透明火苗（营火/火把）正常混合叠在亮雪面上后亮度达不到
      // 高亮豁免线，轮廓会被描成一圈黑边；按“暖色高饱和 + 足够亮”补充豁免，
      // 红旗/暖木等亮度不足不受影响。
      float warmth = centerTexel.r - centerTexel.b;
      float fireMask = smoothstep(0.34, 0.5, warmth) * smoothstep(0.42, 0.58, luminance);
      edge *= 1.0 - fireMask;

      // Blend outline with original color
      gl_FragColor = vec4(mix(centerTexel.rgb, outlineColor, edge), centerTexel.a);
    }
  `
};

const StorybookVignetteShader = {
  name: 'StorybookVignetteShader',
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float edgeDistance = distance(vUv, vec2(0.5));
      float vignette = smoothstep(0.38, 0.76, edgeDistance) * strength;
      vec3 edgeTint = vec3(0.86, 0.91, 0.92);
      color.rgb = mix(color.rgb, color.rgb * edgeTint, vignette);
      gl_FragColor = color;
    }
  `
};

export class Game {
  constructor({
    canvas,
    session = null,
    networkBridge = null,
    onLevelComplete = null,
    onRestart = null,
    onExitToMenu = null
  } = {}) {
    this.canvas = canvas;
    this.levelSession = normalizeLevelSession(session);
    this.networkRole = session?.networkRole ?? 'offline';
    this.localPlayerId = session?.localPlayerId ?? session?.localPlayerSlot ?? 'local-player';
    this.localPlayerSlot = this.localPlayerId;
    this.activeEconomySlot = this.localPlayerSlot;
    this.coopRewardWaitSlots = null;
    this.coopRewardKind = null;
    this.coopRewardDeadlineAtMs = null;
    this.coopRewardLastPublishedSecond = null;
    this.coopRewardAutoSelectSecondsRemaining = null;
    this.networkBridge = networkBridge ?? null;
    this.networkClientMode = this.networkRole === 'client';
    this.networkStrategySelectionRequired = false;
    this.coop = isCoopSession(this.levelSession)
      ? {
        enabled: true,
        healthMult: this.levelSession.coop?.healthMult ?? COOP_ENEMY_SCALING.healthMult,
        damageMult: this.levelSession.coop?.damageMult ?? COOP_ENEMY_SCALING.damageMult
      }
      : null;
    this.players = isCoopSession(this.levelSession)
      ? createCoopPlayerStates(this.levelSession)
      : null;
    this.onLevelComplete = onLevelComplete;
    this.onRestart = onRestart;
    this.onExitToMenu = onExitToMenu;
    this.elapsedTime = 0;
    this.levelFinished = false;
    this.paused = false;
    this.networkTerminated = false;
    this.networkTerminatedOverlay = null;
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
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 240);
    this.camera.layers.enable(1); // Enable layer 1 for selective rendering/raycasting
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

    // Initialize post-processing pipeline for Screen Space Ambient Occlusion (AO)
    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(window.innerWidth, window.innerHeight);

    const renderPass = new RenderPass(this.scene, this.camera);
    renderPass.render = function (renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
      const oldMask = this.camera.layers.mask;
      this.camera.layers.set(0);
      RenderPass.prototype.render.call(this, renderer, writeBuffer, readBuffer, deltaTime, maskActive);
      this.camera.layers.mask = oldMask;
    };
    this.composer.addPass(renderPass);

    this.saoPass = new SAOPass(this.scene, this.camera);
    // The normal/depth override ignores sprite alpha and otherwise turns the
    // campfire into opaque rectangles. Exclude only its registered soft effects.
    this.saoPass.renderOverride = function (renderer, material, target, clearColor, clearAlpha) {
      const exclusions = this.scene.userData.aoExclusions ?? [];
      for (const entry of exclusions) {
        entry.visible = entry.object.visible;
        entry.object.visible = false;
      }
      try {
        SAOPass.prototype.renderOverride.call(this, renderer, material, target, clearColor, clearAlpha);
      } finally {
        for (const entry of exclusions) entry.object.visible = entry.visible;
      }
    };
    this.saoPass.render = function (renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
      const oldMask = this.camera.layers.mask;
      this.camera.layers.set(0);
      SAOPass.prototype.render.call(this, renderer, writeBuffer, readBuffer, deltaTime, maskActive);
      this.camera.layers.mask = oldMask;
    };
    // Tweak parameters for clean, subtle low-poly shading and depth calculation
    this.saoPass.params.saoBias = 0.08;
    this.saoPass.params.saoIntensity = 0.01;        // Subtle yet clear shadow edges in low-poly contours
    this.saoPass.params.saoScale = 2.6;            // Fits nicely within camera distance ranges without numeric overflow
    this.saoPass.params.saoKernelRadius = 32;      // Smooth wide shadow falloff
    this.saoPass.params.saoMinResolution = 0;
    this.saoPass.params.saoBlur = true;            // Blurring is critical for making AO look silky on snow
    this.saoPass.params.saoBlurRadius = 4;
    this.saoPass.params.saoBlurStdDev = 4;
    this.saoPass.params.saoBlurDepthCutoff = 0.01;
    // First-map terrain already uses baked ground shadows.  On phones, keep
    // that static shading but avoid the four full-screen passes that are most
    // likely to make the device run hot during a long battle.
    const useFullPostProcessing = this.renderQuality.mode !== 'mobile';
    this.saoPass.enabled = useFullPostProcessing;
    this.composer.addPass(this.saoPass);

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.15, 0.4, 0.85);
    this.bloomPass.enabled = useFullPostProcessing;
    this.composer.addPass(this.bloomPass);

    this.outlinePass = new ShaderPass(OutlineShader);
    // 风格化：对所有地图启用卡通描边（含雪谷第一关，由 render tuning 控制粗细/颜色/阈值）。
    this.outlinePass.enabled = useFullPostProcessing;
    this.composer.addPass(this.outlinePass);

    this.vignettePass = new ShaderPass(StorybookVignetteShader);
    this.vignettePass.enabled = useFullPostProcessing;
    this.composer.addPass(this.vignettePass);

    const overlayPass = new RenderPass(this.scene, this.camera);
    overlayPass.clear = false;
    overlayPass.render = function (renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
      const oldMask = this.camera.layers.mask;
      const oldBackground = this.scene.background;
      this.scene.background = null;
      this.camera.layers.set(1);
      RenderPass.prototype.render.call(this, renderer, writeBuffer, readBuffer, deltaTime, maskActive);
      this.scene.background = oldBackground;
      this.camera.layers.mask = oldMask;
    };
    this.composer.addPass(overlayPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

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
    this.cameraMoveKeys = new Set();
    this.cameraFollowEnabled = false;
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
    this.endlessDifficulty = 0;
    this.endlessPerformanceMultiplier = 1;
    this.waveSchedule = this.isEndlessMode()
      ? (this.networkClientMode ? [] : [createWaveConfig(this.levelSession, 1, this.endlessDifficulty)])
      : createWaveSchedule(this.levelSession);
    this.waveIndex = 0;
    this.currentWave = null;
    this.wave = 0;
    this.enemyDirector = {
      energy: 999
    };
    this.currentEnemyForce = null;
    this.pendingStrategyRewards = [];
    this.teamGenericUpgradeCounts = new Map();
    this.teamSpecialUpgrades = new Map();
    this.teamSupportModifiersApplied = new Set();
    this.acquiredUnitCardTypes = new Set();
    this.bossesDefeated = 0;
    this.pendingWaveAdvance = false;
    if (this.players) {
      this.silver = this.players[this.localPlayerSlot].silver;
    } else {
      this.silver = Math.max(0, Number(BALANCE.runCurrency?.starting ?? 0));
    }
    this.strategyRewardRerollCount = 0;
    this.autoSkipWaveRewards = false;
    this.autoSkippedWaveRewardKey = null;
    this.shopPrices = createInitialShopPrices();
    this.waveRewardDeck = createWaveRewardDeckIds(this.levelSession.deck, CARD_DEFINITIONS);
    this.rebirthQueue = [];
    this.nextRebirthQueueId = 1;
    this.awaitingOpeningReward = false;
    this.heroUnitType = null;
    this.runShopOpen = false;
    this.runShopCausedPause = false;
    this.runShopUiBoundOverlay = null;
    this.runShopPendingOffers = {};
    this.runShopActiveCategory = null;
    this.runShopChoices = [];
    this.runShopCardScale = 1;
    this.runShopFreeReward = false;
    this.runShopAutoSelectSecondsRemaining = null;
    // Boss 整备（免费兵种专精 + 明码标价补给）的本局状态。
    // 这些字段按玩家存放：单机直接放在 Game 上，联机放在 players[slot]（withPlayerContext 会同步搬运）。
    this.runShopItems = null;
    this.runShopPrepNodeKey = null;
    this.runShopSpecializationClaimed = false;
    this.runShopSpecializationUnitType = null;
    this.runShopPrepCompleted = false;
    this.runShopCompletedNodeKey = null;
    this.levelTestMode = false;
    this.debugTimeScale = 1;
    this.strategyEvent = null;
    this.enemyCampAttackTimer = 0;
    this.playerBaseAttackTimer = 0;
    this.playerBaseHealthLossProgress = 0;
    // 生存模式：己方一个单位都不剩是从哪一刻开始的（用于延迟判负，见 checkSurvivalLevelEnd）
    this.survivalStrandedSince = null;
    this.lastCardPlayed = null;
    this.runCardsPlayedCount = 0;
    this.selectedUnit = null;
    this.selectedUnits = [];
    this.selectedUnitIds = new Set();
    this.selectionMode = 'none';
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
        maxHealth: BALANCE.playerBase.maxHealth
      }
    });

    this.world = createWorld(this.scene, this.worldConfig);
    this.worldConfig = this.world.config ?? this.worldConfig;
    // 基地实体的坐标必须跟随关卡预设，而不是停在 BALANCE 的全局默认值。
    // 上面那句在 createWorld 之前执行，此时 worldConfig 还只有关卡的 world 字段
    // （例如 { sceneKey: 'island-survival' }），拿不到预设里的 playerBasePosition，
    // 于是会退回 (0,30)。而世界里的基地模型是按预设坐标摆的，两边会差出一段距离，
    // 出生点、返程、部署与供能半径全都跟着错位。
    if (this.worldConfig.playerBasePosition && this.playerBase) {
      this.playerBase.position.set(
        this.worldConfig.playerBasePosition.x,
        this.playerBase.position.y,
        this.worldConfig.playerBasePosition.z
      );
      this.playerBase.homePoint = null;
    }
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
      collisionRadius: 2.35,
      attackRadius: 2.48
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
    this.playerBase.statusHeight = this.playerBase.model?.userData?.baseStyle === 'friendly-command-camp'
      ? 3.05
      : 4.48;
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
    // 基地库存：目前是资源节点的落点，后续合成、快捷栏、搬运都以它为准。
    this.baseInventory = new Inventory({ id: 'base', capacity: ITEM_RULES.baseInventorySlots });
    // 资源节点：地图上每棵树/石堆/矿脉的剩余量归这里管；模型与寻路阻挡仍由 world 提供。
    this.resourceNodes = new ResourceNodeSystem(this);
    this.resourceNodes.attach(this.world);
    this.resourceNodes.setDepositTarget(this.baseInventory);
    // 基地供能：周围约 20m 内的傀儡与工作设施从这里补活动魔力。
    // 供能功率有上限，分配时不能给范围内每个接收者各发一份完整功率。
    this.power = new PowerSystem(this);
    {
      const basePosition = this.world?.config?.playerBasePosition ?? { x: 0, z: 0 };
      this.power.registerSupplier({
        id: 'player-base',
        kind: 'base',
        x: basePosition.x,
        z: basePosition.z,
        supplyPerSecond: POWER_RULES.baseSupplyPerSecond,
        supplyRadius: POWER_RULES.baseSupplyRadius
      });
    }
    // 傀儡作业：采集状态机 + 每个傀儡自己的背包与活动魔力。
    // 与供能系统是上下游关系：这里决定傀儡干什么，power 负责给它的储备补魔。
    this.work = new WorkSystem(this);
    // 刷怪点：海岛关没有波次，持续压力来自地图上的点位；点被摧毁后永久停止产怪。
    this.spawnPoints = new SpawnPointSystem(this);
    // 地面遗物包：单位阵亡时背包与符文石一起落地，走近即转移进拾取者（物品守恒，方案第 7 节）。
    this.drops = new GroundDropSystem(this);
    this.drops.attach();
    // 生产设施（方案第 9 节）：放置下来的熔炉按周期把基地库存里的木材烧成木炭。
    this.production = new ProductionSystem(this);
    // 燃料供能设施（魔力炉）：烧木炭，为周围的生产与战斗供能。
    this.fuelPower = new FuelPowerSystem(this);
    // 科技与附魔台：研究解锁配方，附魔台用材料制作附魔石（不再依赖附魔卡）。
    this.research = new ResearchSystem(this);
    // 树坑与种植：种下树苗 → 长成一棵真实资源节点 → 傀儡去砍 → 自动补种。
    this.planting = new PlantingSystem(this);
    // 需要魔力的功能设施（箭塔 / 食堂）：魔力耗尽就停机。
    this.facilities = new FacilitySystem(this);
    // 符文石背包权威：附魔卡一次性生成石头，石头放在单位背包里才生效。
    this.runeStones = new RuneStoneSystem(this);
    // 符文背包界面：常驻入口或 B 键打开；未选中己方单位时显示基地与阵亡单位背包。
    if (typeof document !== 'undefined') {
      this.runeBackpack = new RuneBackpackUi(this, {
        getSelectedUnit: () => (
          this.selectedUnit?.team === TEAMS.PLAYER && this.selectedUnit.alive
            ? this.selectedUnit
            : null
        )
      });
      this.runeBackpack.ensureLauncher();
    }
    // 基地库存与合成面板：与符文背包分开，因为库存里是可堆叠材料、没有拖拽出售那套语义。
    if (typeof document !== 'undefined') {
      this.baseStorage = new BaseStorageUi(this);
      // 必须在这里就把常驻入口建出来：入口按钮原本是在 ensureUi()（也就是第一次打开面板）时
      // 才创建的，于是"不知道怎么开面板"的玩家永远看不到入口——符文背包当初也踩过这个鸡生蛋问题。
      this.baseStorage.ensureLauncher();
      // 物品快捷栏：基地里可放置建筑的快捷入口（数字键 1..9）。
      this.hotbar = new HotbarUi(this);
      this.hotbar.ensureUi();
    }
    if (isCoopSession(this.levelSession)) {
      const coopPlayers = this.levelSession.players ?? {};
      if (this.networkClientMode) {
        const localDeck = coopPlayers[this.localPlayerSlot]?.deck ?? [];
        this.cardSystems = null;
        this.cardSystem = new CardSystem(this, {
          deck: localDeck,
          playerSlot: this.localPlayerSlot,
          mountUi: true,
          startWithEmptyDrawPile: true
        });
        this.abilitySystems = null;
        this.abilities = new AbilitySystem(this, {
          playerSlot: this.localPlayerSlot,
          mountUi: true
        });
      } else {
        this.cardSystems = Object.fromEntries(Object.entries(coopPlayers).map(([playerId, player]) => [
          playerId,
          new CardSystem(this, {
            deck: player?.deck ?? [],
            playerSlot: playerId,
            mountUi: this.localPlayerSlot === playerId,
            startWithEmptyDrawPile: true
          })
        ]));
        this.cardSystem = this.cardSystems[this.localPlayerSlot];
        this.abilitySystems = Object.fromEntries(Object.keys(coopPlayers).map((playerId) => [
          playerId,
          new AbilitySystem(this, {
            playerSlot: playerId,
            mountUi: this.localPlayerSlot === playerId
          })
        ]));
        this.abilities = this.abilitySystems[this.localPlayerSlot];
      }
    } else {
      this.cardSystems = null;
      this.cardSystem = new CardSystem(this, {
        deck: this.levelSession.deck,
        startWithEmptyDrawPile: true
      });
      this.abilitySystems = null;
      this.abilities = new AbilitySystem(this);
    }
    this.lootDrops = new LootDropSystem(this);
    this.altars = new AltarSystem(this, this.world.config?.altars ?? this.worldConfig.altars);
    // 多路线关卡的开局能量：每多一条路线额外发放，具体增量由 BALANCE.opening 配置。
    this.grantOpeningRouteEnergy();
    this.spawnWildlife();
    this.enemyEnchantment = new EnemyEnchantmentSystem(this);
    this.levelMechanics = new LevelMechanicSystem(this);
    this.selectionBox = createSelectionBoxElement();

    this.dom = {
      baseHealth: document.querySelector('#base-health'),
      waveLabel: document.querySelector('#wave-label'),
      silverCount: document.querySelector('#silver-count'),
      wavePreview: document.querySelector('#wave-preview'),
      wavePanel: document.querySelector('.wave-command-panel'),
      battleTimeLabel: document.querySelector('#battle-time-label'),
      battleTime: document.querySelector('#battle-time'),
      unitCount: document.querySelector('#unit-count'),
    spawnPointMeter: document.querySelector('#spawn-point-meter'),
    spawnPointCount: document.querySelector('#spawn-point-count'),
      selectedPanel: document.querySelector('#selected-panel'),
      selectedName: document.querySelector('#selected-name'),
      selectedStats: document.querySelector('#selected-stats'),
      selectedEnchants: document.querySelector('#selected-enchants'),
      cameraFollowButton: document.querySelector('#selected-camera-follow'),
      selectedRecruitButton: document.querySelector('#selected-recruit'),
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
    this.networkAnalysisUi = new NetworkAnalysisUi({
      getSnapshot: () => this.networkBridge?.getNetworkDiagnosticsSnapshot?.() ?? null
    });
    this.networkAnalysisUi.setEnabled(Boolean(this.coop?.enabled && this.networkBridge));
    if (this.dom.fpsMeter) this.dom.fpsMeter.hidden = false;
    this.strategyEventUi = createStrategyEventUi();
    this.runShopUi = createRunShopUi();
    this.bindRunShopUi();
    this.battleDebugPanel = this.levelSession.debug ? null : new BattleDebugPanel(this);
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
      this.cameraMoveKeys.clear();
      this.activeTouchPointers.clear();
    }, { signal });
    canvas.addEventListener('webglcontextlost', (event) => {
      // 手机通话/切后台时浏览器可能回收 WebGL 上下文。阻止默认永久丢失，
      // 并等待恢复事件重新分配后处理的渲染目标。
      event.preventDefault();
      this.webglContextLost = true;
    }, { signal });
    canvas.addEventListener('webglcontextrestored', () => this.restoreWebglContext(), { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.cameraMoveKeys.clear();
      } else {
        this.restoreWebglContext();
      }
    }, { signal });
    canvas.addEventListener('wheel', (event) => this.onCanvasWheel(event), { passive: false, signal });
    window.addEventListener('pointermove', (event) => this.onWindowPointerMove(event), { signal });
    window.addEventListener('contextmenu', (event) => this.onGameContextMenu(event), { capture: true, signal });
    window.addEventListener('keydown', (event) => this.onKeyDown(event), { signal });
    window.addEventListener('keyup', (event) => this.onKeyUp(event), { signal });
    window.addEventListener('resize', () => this.resize(), { signal });
    window.addEventListener('popstate', (event) => this.onReturnNavigation(event), { signal });
    this.strategyEventUi.root.addEventListener('click', (event) => this.onStrategyEventClick(event), { signal });
    this.strategyEventUi.root.addEventListener('pointerdown', stopUiPropagation, { signal });
    this.strategyEventUi.root.addEventListener('contextmenu', stopUiEvent, { signal });
    this.dom.wavePreview?.addEventListener('change', (event) => this.onWavePreviewChange(event), { signal });
    this.dom.settingsButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setPaused(true, '设置');
    }, { signal });
    this.dom.commandDock?.addEventListener('click', (event) => this.onCommandDockClick(event), { signal });
    this.dom.commandDock?.addEventListener('pointerdown', stopUiEvent, { signal });
    this.dom.commandDock?.addEventListener('contextmenu', stopUiEvent, { signal });
    this.dom.cameraFollowButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleCameraFollow();
    }, { signal });
    this.dom.cameraFollowButton?.addEventListener('pointerdown', stopUiEvent, { signal });
    this.dom.cameraFollowButton?.addEventListener('contextmenu', stopUiEvent, { signal });
    // 招募按钮：只在选中野外中立单位时可见；点击消耗一张招募令把它变成自己人。
    this.dom.selectedRecruitButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.recruitSelectedUnit();
    }, { signal });
    this.dom.selectedRecruitButton?.addEventListener('pointerdown', stopUiEvent, { signal });
    this.dom.selectedRecruitButton?.addEventListener('contextmenu', stopUiEvent, { signal });
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
    if (this.runShopUi?.toggle) this.runShopUi.toggle.hidden = true;
    this.armReturnNavigationTrap();
    prewarmUnitModelTemplates(unitModelPrewarmEntries());

    if (this.levelSession.debug) {
      this.summonUnits('raider', 1, this.playerBase.position.clone().add(new THREE.Vector3(-1.4, 0, -2.2)), 0.7, {
        select: false
      });
      this.summonUnits('archer', 1, this.playerBase.position.clone().add(new THREE.Vector3(1.4, 0, -2.2)), 0.7, {
        select: false
      });
      this.spawnEnemyWave(1);
    } else if (this.networkClientMode) {
      // Remote clients wait for Host ui_state/full_snapshot and never generate authority state.
      this.updateWavePreview();
      this.awaitingOpeningReward = false;
    } else {
      this.updateWavePreview();
      this.awaitingOpeningReward = true;
      // 开局四次三选一：先排好后续三次（法术 / 附魔 / 能力），
      // 每次选完由 continueAfterStrategyFlow 取出下一项，全部选完才开第一波。
      // 联机 Client 走上面的分支、不排本地队列，步骤由 Host 权威推进。
      this.queueOpeningRewardSteps();
      // 孤岛求生：开局布置木傀儡与初始物资（在开局奖励流程之外，不占用三选一）
      this.setupSurvivalOpening();
      if (this.coop?.enabled) {
        this.openCoopStrategyEventForAll('opening-unit');
      } else {
        this.openStrategyEvent('opening-unit');
      }
    }

    window.__VILLAGE_WAR_DEBUG__ = {
      game: this,
      snapshot: () => this.snapshot(),
      samplePixels: () => this.samplePixels()
    };
    if (this.networkBridge) {
      this.networkBridge.bindGame(this);
    }
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
    // A result screen can replace a running match while a touch/drag gesture
    // is still active. Clear every transient input capture so the next solo
    // session does not inherit a frozen field or an invisible selection drag.
    this.cancelCameraDrag();
    this.cancelSelectionDrag();
    this.cancelTouchGesture();
    this.activeTouchPointers.clear();
    this.setMobileBoxSelectMode(false);
    this.eventController.abort();
    this.runeBackpack?.destroy?.();
    this.baseStorage?.destroy?.();
    this.hotbar?.destroy?.();
    this.cardSystem?.destroy?.();
    this.buildings?.destroy?.();
    this.lootDrops?.destroy?.();
    this.drops?.destroy?.();
    this.enemyEnchantment?.destroy?.();
    this.areaEffects?.destroy?.();
    this.levelMechanics?.destroy?.();
    this.unitRegistry?.destroy?.();
    this.attacks?.destroy?.();
    this.combat?.destroy?.();
    this.effects?.destroy?.();
    this.pathWorker?.terminate?.();
    this.pathWorker = null;
    this.pendingPathRequests.clear();
    this.networkBridge?.unbindGame();
    this.networkAnalysisUi?.destroy();
    this.networkAnalysisUi = null;
    this.battleDebugPanel?.destroy();
    this.battleDebugPanel = null;
    this.clearCoopRewardAutoSelectTimer();
    this.disposeNavDebug();
    this.renderer.dispose();
    this.selectionBox?.remove();
    this.strategyEventUi?.root?.remove();
    this.runShopUi?.overlay?.remove();
    this.networkTerminatedOverlay?.remove();
    this.networkTerminatedOverlay = null;
    document.body.classList.remove(
      'is-game-active',
      'is-game-paused',
      'is-strategy-event-open',
      'is-run-shop-open',
      'is-battle-debug-open',
      'is-mobile-box-select-active'
    );
    this.canvas.classList.remove('is-camera-dragging');
    if (this.dom.settingsButton) this.dom.settingsButton.hidden = true;
    if (this.runShopUi?.toggle) this.runShopUi.toggle.hidden = true;
    if (this.dom.fpsMeter) this.dom.fpsMeter.hidden = true;
    if (this.dom.pauseOverlay) this.dom.pauseOverlay.hidden = true;
    if (this.dom.perfPanel) this.dom.perfPanel.hidden = true;
    this.renderTuningUi?.root?.remove();
    this.renderTuningUi?.button?.remove();
    this.canvas.style.filter = '';
    this.worldUi.innerHTML = '';
    if (window.__VILLAGE_WAR_DEBUG__?.game === this) {
      delete window.__VILLAGE_WAR_DEBUG__;
    }
  }

  tick() {
    if (this.destroyed) return;
    const rawDt = this.clock.getDelta();
    const debugTimeScale = this.levelTestMode ? this.debugTimeScale : 1;
    // Box-selecting on a touch screen needs a little time to read the field.
    // It is deliberately local-only: a co-op Host cannot slow the shared
    // simulation and a Client must keep following Host time.
    const boxSelectTimeScale = this.mobileBoxSelectMode && !this.coop?.enabled ? 0.1 : 1;
    const timeScale = debugTimeScale * boxSelectTimeScale;
    const dt = Math.min(rawDt, 0.05) * timeScale;
    this.updateFpsMeter(rawDt);
    this.networkAnalysisUi?.update();
    this.syncCoopRewardPauseState();
    if (this.paused) {
      // 联机暂停（波次奖励/军需铺）时仍要处理远端命令与私有状态推送
      this.networkBridge?.beforeTick?.(0);
      this.updateCoopRewardAutoResolve();
      this.updateCamera(0);
      this.world.update?.(0, this.cameraTarget, this.camera, { forceStaticCulling: true });
      this.updateHud(0);
      this.renderScene();
      return;
    }
    if (this.networkClientMode) {
      this.networkBridge?.updateClientFrame(dt);
      this.cardSystem?.update?.(dt);
      this.updateCamera(dt);
      this.world.update?.(dt, this.cameraTarget, this.camera);
      this.effects.update(dt);
      this.updateSelection();
      this.updateHud(dt);
      this.renderScene();
      return;
    }
    this.networkBridge?.beforeTick(dt);
    this.updateCoopRewardAutoResolve();
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
      runPerfStep('card', () => this.updateCardSystems(dt));
      runPerfStep('abilities', () => this.updateAbilitySystems(dt));
      runPerfStep('baseRecoveryPact', () => this.updateBaseRecoveryPact(dt));
      runPerfStep('playerBaseAttack', () => this.updatePlayerBaseAttack(dt));
      runPerfStep('enemyCampAttack', () => this.updateEnemyCampAttack(dt));
      runPerfStep('spiders', () => this.updateSpiderLifecycle(dt));
      runPerfStep('combat', () => this.unitLogic.update(dt));
      runPerfStep('buildings', () => this.buildings.update(dt));
      runPerfStep('recovery', () => this.recovery.update(dt));
      runPerfStep('altars', () => this.altars.update(dt));
      // 供能：傀儡与工作设施的活动魔力分配，实发量受基地功率上限约束
      // 燃料供能：必须在 power 之前——这一段分配用的功率是它刚算出来的
      runPerfStep('fuelPower', () => this.fuelPower.update(dt));
      // 设施的供能状态：必须在 power 之前，决定这一段它吃不吃魔
      runPerfStep('facilities', () => this.facilities.update(dt));
      runPerfStep('power', () => this.power.update(dt));
      // 生产：必须在 power 之后——设施这一段拿到的 activityMana 决定它能不能开工
      runPerfStep('production', () => this.production.update(dt));
      // 傀儡作业：清掉已经不在注册表里的傀儡（不扫描资源节点）
      runPerfStep('work', () => this.work.update(dt));
      runPerfStep('spawnPoints', () => this.spawnPoints.update(dt));
      runPerfStep('drops', () => this.drops.update(dt));
      runPerfStep('mechanics', () => this.levelMechanics.update(dt));
      runPerfStep('areaEffects', () => this.areaEffects.update(dt));
      runPerfStep('loot', () => this.lootDrops.update(dt));
      runPerfStep('rebirth', () => this.updateRebirthQueue(dt));
      runPerfStep('effects', () => this.effects.update(dt));
      runPerfStep('structure', () => this.updateStructureFeedback(dt));
      runPerfStep('camera', () => this.updateCamera(dt));
      runPerfStep('world', () => this.world.update?.(dt, this.cameraTarget, this.camera));
      runPerfStep('selection', () => this.updateSelection());
      runPerfStep('unitVisuals', () => this.updateUnitVisuals(dt));
      runPerfStep('navDebug', () => this.updateNavDebug(dt));
      runPerfStep('hud', () => this.updateHud(dt));
      runPerfStep('render', () => this.renderScene());
      perf.endFrame(this.createPerfCounters({ takeNavStats: true }));
      this.recordPerfSample();
      this.updatePerfPanel(dt);
    } else {
      runStep('waveSpawn', () => this.updateWaveFlow());
      runStep('card', () => this.updateCardSystems(dt));
      runStep('abilities', () => this.updateAbilitySystems(dt));
      runStep('baseRecoveryPact', () => this.updateBaseRecoveryPact(dt));
      runStep('playerBaseAttack', () => this.updatePlayerBaseAttack(dt));
      runStep('enemyCampAttack', () => this.updateEnemyCampAttack(dt));
      runStep('spiders', () => this.updateSpiderLifecycle(dt));
      runStep('combat', () => this.unitLogic.update(dt));
      runStep('buildings', () => this.buildings.update(dt));
      runStep('recovery', () => this.recovery.update(dt));
      runStep('altars', () => this.altars.update(dt));
      runStep('fuelPower', () => this.fuelPower.update(dt));
      runStep('facilities', () => this.facilities.update(dt));
      runStep('power', () => this.power.update(dt));
      runStep('production', () => this.production.update(dt));
      // 种植：长成时会往世界里加资源节点，所以放在采集之前
      runStep('planting', () => this.planting.update(dt));
      runStep('work', () => this.work.update(dt));
      runStep('spawnPoints', () => this.spawnPoints.update(dt));
      runStep('drops', () => this.drops.update(dt));
      runStep('mechanics', () => this.levelMechanics.update(dt));
      runStep('areaEffects', () => this.areaEffects.update(dt));
      runStep('loot', () => this.lootDrops.update(dt));
      runStep('rebirth', () => this.updateRebirthQueue(dt));
      runStep('effects', () => this.effects.update(dt));
      runStep('structure', () => this.updateStructureFeedback(dt));
      runStep('camera', () => this.updateCamera(dt));
      runStep('world', () => this.world.update?.(dt, this.cameraTarget, this.camera));
      runStep('selection', () => this.updateSelection());
      runStep('unitVisuals', () => this.updateUnitVisuals(dt));
      runStep('navDebug', () => this.updateNavDebug(dt));
      runStep('hud', () => this.updateHud(dt));
      runStep('render', () => this.renderScene());
    }
    this.checkLevelEnd();
  }

  updateWaveFlow() {
    if (this.levelSession.debug || this.levelFinished || this.strategyEvent) return;
    if (!this.currentWave) {
      // Boss 整备（免费专精 → 付费补给 → 继续战斗）是阻塞式状态：
      // 只有玩家走完两步、整备结束后才允许推进下一波。
      if (this.pendingWaveAdvance && !this.isRunShopPrepBlockingWaveAdvance()) {
        this.continueAfterStrategyFlow(false);
      }
      return;
    }
    if (this.hasActiveWaveEnemies()) return;
    this.completeCurrentWave();
  }

  /** Boss 整备进行中：禁止开始下一波（无尽自动跳过路径会提前结束整备再放行）。 */
  isRunShopPrepBlockingWaveAdvance() {
    return isRunShopPrepBlockingWaveAdvance({ freeReward: this.runShopFreeReward === true });
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

  isEndlessMode() {
    return isEndlessMode(this.levelSession.challengeMode);
  }

  ensureWaveConfig(scheduleIndex = this.waveIndex) {
    if (!this.isEndlessMode() || this.networkClientMode) {
      return this.waveSchedule[scheduleIndex] ?? null;
    }
    while (this.waveSchedule.length <= scheduleIndex) {
      const index = this.waveSchedule.length + 1;
      this.waveSchedule.push(createWaveConfig(this.levelSession, index, this.endlessDifficulty));
    }
    return this.waveSchedule[scheduleIndex] ?? null;
  }

  startNextWave() {
    if (this.levelFinished || this.levelSession.debug) return;
    const wave = this.ensureWaveConfig(this.waveIndex);
    if (!wave) {
      this.finishLevel(true, { endReason: 'waves_completed' });
      return;
    }
    this.currentWave = wave;
    this.currentEnemyForce = wave;
    this.waveIndex += 1;
    this.wave = wave.index;
    this.spawnEnemyWave(wave.index, { waveConfig: wave });
    this.updateWavePreview();
    this.updateHud(0);
  }

  completeCurrentWave() {
    const wave = this.currentWave;
    if (!wave || this.levelFinished) return;
    this.currentWave = null;
    this.currentEnemyForce = null;
    this.ensureWaveConfig(this.waveIndex);
    this.updateWavePreview();
    if (wave.kind === 'boss') {
      this.bossesDefeated += 1;
      this.grantWaveSilver(wave);
      if (!this.isEndlessMode() && this.bossesDefeated >= BOSS_WAVES_TO_WIN) {
        // 标准战役最终 Boss：直接结算，不再弹出当局用不到的专精/补给流程。
        this.finishLevel(true, { endReason: 'waves_completed' });
        return;
      }
      // 非最终 Boss：进入 Boss 整备（先免费专精，再明码标价补给）。
      // 是否提供整备由“本局是否真的结束”决定，不按固定 Boss 序号硬编码，
      // 因此无尽等仍有后续战斗的模式同样会继续提供。
      this.pendingWaveAdvance = true;
      if (this.coop?.enabled) {
        this.openCoopRunShopForAll({ freeReward: true });
      } else {
        this.openRunShop({ freeReward: true });
      }
      return;
    }
    this.grantWaveSilver(wave);
    this.pendingWaveAdvance = true;
    if (this.coop?.enabled) {
      this.openCoopStrategyEventForAll('wave-reward', { wave });
    } else {
      this.openStrategyEvent('wave-reward', { wave });
    }
  }

  updateWavePreview() {
    const root = this.dom.wavePreview;
    if (!root) return;
    const wave = this.currentWave ?? this.waveSchedule[this.waveIndex] ?? null;
    if (!wave) {
      root.innerHTML = '';
      return;
    }
    const stateLabel = this.currentWave
      ? '当前攻势'
      : (this.wave > 0 ? '下一波情报' : '首波情报');
    const rosterLabel = waveCommandRosterLabel(wave);
    const autoSkipMarkup = this.isEndlessMode()
      ? `
        <label class="wave-command-auto-skip" title="自动跳过普通波次与 Boss 波次奖励">
          <input
            type="checkbox"
            data-endless-auto-skip-wave-rewards
            aria-label="自动跳过波次奖励"
            ${this.autoSkipWaveRewards ? 'checked' : ''}
          >
          <span>自动跳过奖励</span>
        </label>
      `
      : '';
    root.dataset.state = this.currentWave ? 'active' : 'upcoming';
    root.innerHTML = `
      <div class="wave-command-summary is-${cssKey(wave.kind)}">
        <span class="wave-command-kicker">${escapeHtml(stateLabel)}</span>
        <strong class="wave-command-kind">${escapeHtml(waveKindLabel(wave))}</strong>
        <span class="wave-command-roster">${escapeHtml(rosterLabel)}</span>
      </div>
      ${autoSkipMarkup}
    `;
  }

  onWavePreviewChange(event) {
    const input = event.target?.closest?.('[data-endless-auto-skip-wave-rewards]');
    if (!input) return;
    this.autoSkipWaveRewards = this.isEndlessMode() && Boolean(input.checked);
    if (!this.autoSkipWaveRewards) {
      this.autoSkippedWaveRewardKey = null;
      return;
    }
    this.tryAutoSkipWaveReward();
  }

  isAutoSkippableWaveReward(event = this.strategyEvent) {
    return Boolean(
      this.isEndlessMode()
      && this.autoSkipWaveRewards
      && event?.type === 'wave-reward'
    );
  }

  autoSkipWaveRewardKey(event = this.strategyEvent) {
    if (!event) return null;
    return event.networkInteractionId
      ?? `${event.type}:${event.wave?.index ?? this.wave ?? this.waveIndex ?? 0}:${this.bossesDefeated ?? 0}`;
  }

  tryAutoSkipWaveReward() {
    const event = this.strategyEvent;
    if (!this.isAutoSkippableWaveReward(event)) return false;
    const rewardKey = this.autoSkipWaveRewardKey(event);
    if (!rewardKey || rewardKey === this.autoSkippedWaveRewardKey) return false;

    if (this.networkBridge?.shouldRouteLocalCommands?.()) {
      const sent = this.networkBridge.commandSender?.strategySkip?.();
      if (!sent) return false;
      this.autoSkippedWaveRewardKey = rewardKey;
      if (this.networkClientMode || this.coopRewardWaitSlots?.size) {
        this.showCoopRewardWaitingUi();
      }
      return true;
    }

    this.autoSkippedWaveRewardKey = rewardKey;
    if (this.skipStrategyReward()) return true;
    this.autoSkippedWaveRewardKey = null;
    return false;
  }

  tryAutoSkipRunShopReward() {
    if (!(this.isEndlessMode() && this.autoSkipWaveRewards && this.runShopFreeReward)) return false;
    const slot = this.activeEconomySlot ?? this.localPlayerSlot ?? 'local';
    const rewardKey = `run-shop:${this.bossesDefeated ?? 0}:${slot}`;
    if (rewardKey === this.autoSkippedWaveRewardKey) return false;

    if (this.networkBridge?.shouldRouteLocalCommands?.()) {
      const sent = this.networkBridge.commandSender?.shopRewardSkip?.();
      if (!sent) return false;
      this.autoSkippedWaveRewardKey = rewardKey;
      if (this.networkClientMode || this.coopRewardWaitSlots?.size) {
        this.showCoopRunShopWaitingUi();
      }
      return true;
    }

    this.autoSkippedWaveRewardKey = rewardKey;
    this.closeRunShop({ force: true });
    return true;
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
    this.spawnEnemyWave(force.index, { waveConfig: force });
  }

  queueStrategyReward(type, options = {}) {
    if (this.levelFinished || this.levelSession.debug) return false;
    this.pendingStrategyRewards.push({ type, options });
    return this.openNextStrategyReward();
  }

  // 开局三选一的其余步骤：排在奖励队列里，由 continueAfterStrategyFlow 依次打开。
  // 联机时必须带 coop 标记，才能重新走“全员各自三选一”的共享流程。
  queueOpeningRewardSteps() {
    const coop = Boolean(this.coop?.enabled);
    // 第一步（首个单位卡三选一）在开局时直接打开，这里只排它之后的步骤。
    this.openingRewardSteps().slice(1).forEach((step) => {
      this.pendingStrategyRewards.push({ type: step.type, options: {}, coop });
    });
  }

  /** 开局步骤：路线数 × 单位卡三选一，之后各一次能力卡与地形卡。 */
  openingRewardSteps() {
    return openingRewardStepsForLevel(this.levelSession?.level ?? null);
  }

  /** 每多一条路线额外发放开局能量；单路线时增量为 0，不影响现有数值。 */
  grantOpeningRouteEnergy() {
    const extra = openingEnergyForLevel(this.levelSession?.level ?? null)
      - Math.max(0, Number(BALANCE.playerEnergy?.initial) || 0);
    if (!(extra > 0)) return 0;
    this.playerSlotsWithCardSystems().forEach((slot) => {
      this.cardSystemForSlot(slot)?.addEnergy?.(extra);
    });
    return extra;
  }

  playerSlotsWithCardSystems() {
    if (this.cardSystems) return Object.keys(this.cardSystems);
    return [this.localPlayerSlot ?? this.cardSystem?.playerSlot ?? 'p1'];
  }

  cardSystemForSlot(slot) {
    if (this.cardSystems?.[slot]) return this.cardSystems[slot];
    if (slot === (this.activeEconomySlot ?? this.localPlayerSlot)) return this.cardSystem ?? null;
    if (slot === this.cardSystem?.playerSlot) return this.cardSystem ?? null;
    return null;
  }

  hasPendingOpeningReward() {
    return (this.pendingStrategyRewards ?? []).some((entry) => isOpeningRewardType(entry?.type));
  }

  openNextStrategyReward() {
    if (this.levelFinished || this.strategyEvent) return false;
    const next = this.pendingStrategyRewards.shift();
    if (!next) return false;
    // Co-op queue entries must reopen the shared all-players flow; the solo
    // path would generate a reward for this machine only.
    if (next.coop && this.players) {
      if (next.type === 'run-shop') return this.openCoopRunShopForAll(next.options);
      return this.openCoopStrategyEventForAll(next.type, next.options);
    }
    return this.openStrategyEvent(next.type, next.options);
  }

  finishStrategyReward() {
    if (this.coop?.enabled && this.coopRewardWaitSlots?.size) {
      this.finishCoopStrategyReward(this.activeEconomySlot ?? this.localPlayerSlot);
      return;
    }
    const shouldStartFirstWave = this.awaitingOpeningReward;
    this.closeStrategyEvent();
    this.continueAfterStrategyFlow(shouldStartFirstWave);
  }

  hasBlockingCoopRewardWait() {
    return Boolean(
      this.coop?.enabled
      && !this.networkClientMode
      && this.coopRewardWaitSlots?.size
    );
  }

  syncCoopRewardPauseState() {
    if (!this.hasBlockingCoopRewardWait()) return false;
    this.paused = true;
    document.body.classList.add('is-game-paused');
    return true;
  }

  isCoopPlayerConnected(slot) {
    return this.players?.[slot]?.connected !== false;
  }

  startCoopRewardAutoSelectTimer() {
    if (!this.coop?.enabled || this.networkClientMode) return;
    const now = globalThis.performance?.now?.() ?? Date.now();
    this.coopRewardDeadlineAtMs = now + COOP_REWARD_AUTO_SELECT_SECONDS * 1000;
    this.coopRewardLastPublishedSecond = null;
    this.publishCoopRewardCountdown(true);
  }

  clearCoopRewardAutoSelectTimer() {
    this.coopRewardDeadlineAtMs = null;
    this.coopRewardLastPublishedSecond = null;
    this.setCoopRewardCountdownSeconds(null, { force: true, render: true });
  }

  coopRewardSecondsRemaining() {
    if (!Number.isFinite(this.coopRewardDeadlineAtMs) || !this.coopRewardWaitSlots?.size) return null;
    const now = globalThis.performance?.now?.() ?? Date.now();
    return Math.max(0, Math.ceil((this.coopRewardDeadlineAtMs - now) / 1000));
  }

  setCoopRewardCountdownSeconds(seconds, options = {}) {
    const normalized = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : null;
    if (!options.force && this.coopRewardAutoSelectSecondsRemaining === normalized) return false;
    this.coopRewardAutoSelectSecondsRemaining = normalized;
    this.runShopAutoSelectSecondsRemaining = normalized;
    if (this.strategyEvent) {
      this.strategyEvent.autoSelectSecondsRemaining = normalized;
    }
    if (options.render) {
      this.updateCoopRewardCountdownUi();
    }
    return true;
  }

  updateCoopRewardCountdownUi() {
    if (this.strategyEvent && this.strategyEventUi?.root && !this.strategyEventUi.root.hidden) {
      const summary = appendCoopRewardCountdown(
        this.strategyEvent.summary ?? '',
        this.strategyEvent.autoSelectSecondsRemaining ?? this.coopRewardAutoSelectSecondsRemaining,
        '超时将自动选择一项。'
      );
      if (this.strategyEventUi.summary) {
        this.strategyEventUi.summary.textContent = summary;
        this.strategyEventUi.summary.hidden = !summary;
      }
    }
    this.updateCoopRewardWaitingSummary();
    if (this.runShopOpen && this.runShopFreeReward && this.runShopUi?.kicker) {
      this.runShopUi.kicker.textContent = this.runShopKickerText();
    }
  }

  publishCoopRewardCountdown(force = false) {
    const seconds = this.coopRewardSecondsRemaining();
    this.setCoopRewardCountdownSeconds(seconds, { force, render: true });
    if (!force && this.coopRewardLastPublishedSecond === seconds) return false;
    this.coopRewardLastPublishedSecond = seconds;
    this.networkBridge?.markPrivateStateDirty?.();
    return true;
  }

  updateCoopRewardAutoResolve() {
    if (this.networkClientMode || !this.coop?.enabled || !this.coopRewardWaitSlots?.size) return;
    if (!Number.isFinite(this.coopRewardDeadlineAtMs)) {
      this.startCoopRewardAutoSelectTimer();
    }
    this.resolveDisconnectedCoopRewardSlots();
    if (!this.coopRewardWaitSlots?.size) return;
    const seconds = this.coopRewardSecondsRemaining();
    this.publishCoopRewardCountdown();
    if (seconds > 0) return;
    [...this.coopRewardWaitSlots].forEach((slot) => {
      if (this.coopRewardWaitSlots?.has(slot)) this.autoCompleteCoopRewardSlot(slot, 'timeout');
    });
  }

  resolveDisconnectedCoopRewardSlots() {
    if (this.networkClientMode || !this.coopRewardWaitSlots?.size) return false;
    let changed = false;
    [...this.coopRewardWaitSlots].forEach((slot) => {
      if (this.players?.[slot]?.connected !== false) return;
      changed = this.autoCompleteCoopRewardSlot(slot, 'disconnect') || changed;
    });
    return changed;
  }

  autoCompleteCoopRewardSlot(slot, reason = 'timeout') {
    if (!this.coopRewardWaitSlots?.has(slot)) return false;
    if (this.coopRewardKind === 'strategy') {
      return this.autoChooseCoopStrategyReward(slot);
    }
    if (this.coopRewardKind === 'run-shop') {
      if (reason === 'disconnect' || this.players?.[slot]?.connected === false) {
        return this.skipCoopRunShopForSlot(slot);
      }
      return this.autoChooseCoopRunShop(slot);
    }
    return false;
  }

  autoChooseCoopStrategyReward(slot) {
    this.withPlayerContext(slot, () => {
      const choices = Array.isArray(this.strategyEvent?.choices)
        ? this.strategyEvent.choices
        : [];
      for (const choice of choices) {
        if (choice && this.applyStrategyChoice(choice)) break;
      }
    });
    this.finishCoopStrategyReward(slot);
    return true;
  }

  autoChooseCoopRunShop(slot) {
    this.withPlayerContext(slot, () => {
      this.completeRunShopAutoSelection();
    });
    this.finishCoopRunShop(slot);
    return true;
  }

  skipCoopRunShopForSlot(slot) {
    this.withPlayerContext(slot, () => {
      this.runShopFreeReward = false;
      this.runShopActiveCategory = null;
      this.runShopChoices = [];
      this.runShopItems = null;
    });
    this.finishCoopRunShop(slot);
    return true;
  }

  /**
   * 超时自动处理：由 Host 代打第一步——领取一项仍可用的兵种专精（全部获得时改领补偿），
   * 但绝不代买需要银币的补给商品。断线玩家走 skipCoopRunShopForSlot，不补发专精。
   */
  completeRunShopAutoSelection() {
    if (!this.runShopFreeReward) return false;
    this.ensureRunShopPrep();
    this.autoClaimRunShopSpecialization();
    return true;
  }

  /** 自动领取第一项可用专精；没有可用专精时领取补偿。 */
  autoClaimRunShopSpecialization() {
    if (this.runShopSpecializationClaimed) return true;
    const specialization = this.buildRunShopSpecializationState();
    const option = specialization.options[0];
    if (option) {
      const upgrade = option.available[0];
      if (upgrade && this.claimRunShopSpecialization(option.unitType, upgrade, { render: false })) {
        return true;
      }
    }
    return this.claimRunShopSpecializationFallback({ render: false });
  }

  openCoopStrategyEventForAll(type, options = {}) {
    type = normalizeStrategyEventType(type);
    if (!this.players) {
      return this.openStrategyEvent(type, options);
    }
    // Re-entrancy guard: a second reward source (e.g. an altar capture landing
    // in the same frame as a wave clear) must not clobber an in-progress
    // reward. Queue it instead; the completion path drains the queue.
    if (this.coopRewardWaitSlots?.size || this.coopRewardKind) {
      this.pendingStrategyRewards.push({ type, options, coop: true });
      return true;
    }
    this.coopRewardWaitSlots = new Set();
    this.coopRewardKind = 'strategy';
    this.coopPlayerSlots().forEach((slot) => {
      let hasEvent = false;
      this.withPlayerContext(slot, () => {
        let event = this.createStrategyEvent(type, options);
        if (!event?.choices?.length && type === 'wave-reward') {
          // 发牌池耗尽：仍进入奖励阶段并显示"牌已发光"，等待其他玩家选完
          //（30 秒倒计时超时或手动跳过由 Host 自动完成）。
          event = {
            type,
            kicker: '波次奖励',
            title: '牌已发光',
            summary: '本局波次奖励的发牌池已用完。',
            choices: [],
            exhausted: true
          };
        } else {
          if (!event?.choices?.length && type !== 'card-choice' && type !== 'wave-reward') {
            event = this.createStrategyEvent('card-choice', {
              ...options,
              fallbackFrom: type
            });
          }
          if (!event?.choices?.length && type !== 'wave-reward') {
            event = this.createFallbackCardChoiceEvent(options);
          }
        }
        this.strategyEvent = event?.choices?.length || event?.exhausted ? event : null;
        hasEvent = Boolean(this.strategyEvent);
      });
      if (hasEvent) this.coopRewardWaitSlots.add(slot);
    });
    if (!this.coopRewardWaitSlots.size) {
      this.coopRewardWaitSlots = null;
      this.coopRewardKind = null;
      this.clearCoopRewardAutoSelectTimer();
      this.continueAfterStrategyFlow(false);
      return false;
    }
    this.startCoopRewardAutoSelectTimer();
    this.resolveDisconnectedCoopRewardSlots();
    if (!this.coopRewardWaitSlots?.size) return true;
    this.syncCoopRewardPauseState();
    this.showLocalCoopStrategyUi();
    this.networkBridge?.markPrivateStateDirty?.();
    return true;
  }

  showLocalCoopStrategyUi() {
    const local = this.players?.[this.localPlayerSlot];
    this.strategyEvent = local?.strategyEvent ?? null;
    if (!this.strategyEvent) {
      this.showCoopRewardWaitingUi();
      return;
    }
    this.syncNetworkStrategyEventUi();
  }

  showCoopRewardWaitingUi() {
    this.paused = true;
    this.cancelCameraDrag();
    this.cancelSelectionDrag();
    document.body.classList.add('is-game-paused', 'is-strategy-event-open');
    this.strategyEventUi.root.hidden = false;
    this.strategyEventUi.root.dataset.eventType = 'waiting';
    this.strategyEventUi.root.setAttribute('aria-label', '等待其他玩家');
    this.strategyEventUi.kicker.textContent = '联机奖励';
    this.strategyEventUi.kicker.hidden = false;
    this.strategyEventUi.title.textContent = '等待其他玩家';
    this.strategyEventUi.summary.textContent = this.coopRewardWaitingSummary();
    this.strategyEventUi.summary.hidden = false;
    this.strategyEventUi.choices.innerHTML = '';
    this.strategyEventUi.actions.hidden = true;
    this.strategyEventUi.actions.innerHTML = '';
    this.cardSystem?.setHint?.('等待其他玩家选择奖励…', 'coop-wait-reward');
  }

  hideCoopRewardWaitingUi() {
    this.strategyEventUi.root.hidden = true;
    this.strategyEventUi.choices.innerHTML = '';
    this.strategyEventUi.actions.hidden = true;
    this.strategyEventUi.actions.innerHTML = '';
    delete this.strategyEventUi.root.dataset.eventType;
    document.body.classList.remove('is-strategy-event-open');
    this.cardSystem?.clearHint?.('coop-wait-reward');
  }

  showCoopRunShopWaitingUi() {
    this.paused = true;
    this.cancelCameraDrag();
    this.cancelSelectionDrag();
    if (this.runShopUi?.overlay) {
      this.runShopUi.overlay.hidden = true;
      this.runShopUi.overlay.setAttribute('hidden', '');
    }
    document.body.classList.remove('is-run-shop-open');
    document.body.classList.add('is-game-paused', 'is-strategy-event-open');
    this.strategyEventUi.root.hidden = false;
    this.strategyEventUi.root.dataset.eventType = 'run-shop-waiting';
    this.strategyEventUi.root.setAttribute('aria-label', '等待队友完成 Boss 整备');
    this.strategyEventUi.kicker.textContent = '联机军需铺';
    this.strategyEventUi.kicker.hidden = false;
    this.strategyEventUi.title.textContent = '等待队友完成 Boss 整备';
    this.strategyEventUi.summary.textContent = this.coopRunShopWaitingSummary();
    this.strategyEventUi.summary.hidden = false;
    this.strategyEventUi.choices.innerHTML = '';
    this.strategyEventUi.actions.hidden = true;
    this.strategyEventUi.actions.innerHTML = '';
    this.cardSystem?.clearHint?.('boss-shop');
    this.cardSystem?.setHint?.('等待队友完成 Boss 整备…', 'coop-wait-shop');
  }

  hideCoopRunShopWaitingUi() {
    if (this.strategyEventUi.root.dataset.eventType !== 'run-shop-waiting') return false;
    this.strategyEventUi.root.hidden = true;
    this.strategyEventUi.choices.innerHTML = '';
    this.strategyEventUi.actions.hidden = true;
    this.strategyEventUi.actions.innerHTML = '';
    delete this.strategyEventUi.root.dataset.eventType;
    document.body.classList.remove('is-strategy-event-open');
    this.cardSystem?.clearHint?.('coop-wait-shop');
    return true;
  }

  coopRewardWaitingSummary() {
    return appendCoopRewardCountdown(
      '你的奖励已经选择完成，所有玩家完成选择后将继续游戏。',
      this.coopRewardAutoSelectSecondsRemaining,
      '超时将自动为未选择玩家选择一项。'
    );
  }

  coopRunShopWaitingSummary() {
    return appendCoopRewardCountdown(
      '你已完成 Boss 整备（免费专精与补给），所有玩家完成后会继续战斗。',
      this.coopRewardAutoSelectSecondsRemaining,
      '超时将自动为未完成玩家领取可用专精。'
    );
  }

  updateCoopRewardWaitingSummary() {
    const eventType = this.strategyEventUi?.root?.dataset?.eventType;
    if (eventType === 'waiting' && this.strategyEventUi?.summary) {
      this.strategyEventUi.summary.textContent = this.coopRewardWaitingSummary();
      this.strategyEventUi.summary.hidden = false;
    } else if (eventType === 'run-shop-waiting' && this.strategyEventUi?.summary) {
      this.strategyEventUi.summary.textContent = this.coopRunShopWaitingSummary();
      this.strategyEventUi.summary.hidden = false;
    }
  }

  syncNetworkStrategyEventUi() {
    const waitingForNetwork = Boolean(
      this.networkBridge
      && !this.networkBridge.canShowStrategyInteraction?.()
    );
    if (!this.strategyEvent || waitingForNetwork) {
      this.paused = true;
      this.strategyEventUi.root.hidden = true;
      document.body.classList.add('is-game-paused');
      document.body.classList.remove('is-strategy-event-open');
      if (waitingForNetwork) {
        this.cardSystem?.setHint?.('等待所有玩家载入…', 'coop-loading');
      }
      return false;
    }
    this.cardSystem?.clearHint?.('coop-loading');
    this.paused = true;
    this.cancelCameraDrag();
    this.cancelSelectionDrag();
    document.body.classList.add('is-game-paused', 'is-strategy-event-open');
    this.strategyEventUi.root.hidden = false;
    this.renderStrategyEvent();
    if (this.tryAutoSkipWaveReward()) return true;
    return true;
  }

  onNetworkMatchPhaseChanged(phase) {
    if (this.strategyEvent) {
      this.syncNetworkStrategyEventUi();
      return;
    }
    if (this.syncCoopRewardPauseState()) return;
    if (phase === 'RUNNING' && !this.runShopFreeReward) {
      this.paused = false;
      this.hudUpdateTimer = 0;
      document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
      this.cardSystem?.clearHint?.('coop-loading');
      this.cardSystem?.clearHint?.('coop-wait-reward');
      this.clock.getDelta();
      this.updateHud(0);
    }
  }

  finishCoopStrategyReward(slot) {
    const resolvedSlot = slot ?? this.localPlayerSlot;
    if (this.activeEconomySlot === resolvedSlot) {
      this.strategyEvent = null;
    } else {
      this.withPlayerContext(resolvedSlot, () => {
        this.strategyEvent = null;
      });
    }
    if (this.players?.[resolvedSlot]) {
      this.players[resolvedSlot].strategyEvent = null;
    }
    this.coopRewardWaitSlots?.delete(resolvedSlot);
    if (resolvedSlot === this.localPlayerSlot) {
      this.strategyEvent = null;
      if (this.coopRewardWaitSlots?.size) {
        this.showCoopRewardWaitingUi();
      } else {
        this.hideCoopRewardWaitingUi();
      }
    }
    this.networkBridge?.markPrivateStateDirty?.();
    if (this.coopRewardWaitSlots?.size) {
      this.syncCoopRewardPauseState();
      return;
    }
    this.coopRewardWaitSlots = null;
    this.coopRewardKind = null;
    this.clearCoopRewardAutoSelectTimer();
    // The final choice may come from a remote player. In that case the Host's
    // local waiting dialog is still open and must be closed here as part of
    // the shared completion path, not only in the local-player branch above.
    this.hideCoopRewardWaitingUi();
    document.body.classList.remove('is-game-paused');
    this.paused = false;
    this.clock.getDelta();
    const shouldStartFirstWave = this.awaitingOpeningReward;
    // 开局有四次三选一：只有队列里再没有开局步骤时才算选完，否则联机对局
    // 会在第一次选牌后就被标记为“开局选择完成”。
    if (shouldStartFirstWave && !this.hasPendingOpeningReward()) {
      this.networkBridge?.notifyOpeningSelectionComplete?.();
    }
    this.continueAfterStrategyFlow(shouldStartFirstWave);
  }

  openCoopRunShopForAll(options = {}) {
    if (!this.players) {
      return this.openRunShop(options);
    }
    // Re-entrancy guard: never replace an in-progress co-op reward/shop with
    // a new one; defer it to the queue drained by continueAfterStrategyFlow.
    if (this.coopRewardWaitSlots?.size || this.coopRewardKind) {
      this.pendingStrategyRewards.push({ type: 'run-shop', options, coop: true });
      return true;
    }
    this.coopRewardWaitSlots = new Set();
    this.coopRewardKind = 'run-shop';
    this.coopPlayerSlots().forEach((slot) => {
      const run = this.players[slot];
      const canUseShop = this.isCoopPlayerConnected(slot);
      run.runShopFreeReward = options.freeReward === true && canUseShop;
      run.runShopActiveCategory = null;
      run.runShopChoices = [];
      run.runShopItems = null;
      run.runShopPendingOffers = options.freeReward === true && canUseShop ? {} : (run.runShopPendingOffers ?? {});
      if (run.runShopFreeReward) {
        // 每位玩家各自生成一套专精候选与补给商品；同一节点重复进入不会重建
        // （断线重连不刷新已领专精，也不重置已售罄商品）。
        this.withPlayerContext(slot, () => this.ensureRunShopPrep());
      }
      if (run.runShopFreeReward) this.coopRewardWaitSlots.add(slot);
    });
    if (!this.coopRewardWaitSlots.size) {
      this.coopRewardWaitSlots = null;
      this.coopRewardKind = null;
      this.clearCoopRewardAutoSelectTimer();
      this.networkBridge?.markPrivateStateDirty?.();
      this.continueAfterStrategyFlow(false);
      return false;
    }
    this.startCoopRewardAutoSelectTimer();
    this.syncCoopRewardPauseState();
    if (this.coopRewardWaitSlots.has(this.localPlayerSlot)) {
      this.openRunShop(options);
    } else {
      this.showCoopRunShopWaitingUi();
    }
    this.networkBridge?.markPrivateStateDirty?.();
    return true;
  }

  finishCoopRunShop(slot) {
    const resolvedSlot = slot ?? this.localPlayerSlot;
    const closeShopState = () => {
      // 记录本节点整备已完成：之后即使收到重复/滞后命令也不会重建商品或再发专精。
      this.markRunShopPrepCompleted();
      this.runShopFreeReward = false;
      this.runShopActiveCategory = null;
      this.runShopChoices = [];
      this.runShopPendingOffers = {};
      this.runShopItems = null;
      this.runShopAutoSelectSecondsRemaining = null;
    };
    if (this.activeEconomySlot === resolvedSlot) closeShopState();
    else this.withPlayerContext(resolvedSlot, closeShopState);
    const run = this.players?.[resolvedSlot];
    if (run) {
      run.runShopFreeReward = false;
      run.runShopActiveCategory = null;
      run.runShopChoices = [];
      run.runShopPendingOffers = {};
      run.runShopItems = null;
      run.runShopAutoSelectSecondsRemaining = null;
    }
    this.coopRewardWaitSlots?.delete(resolvedSlot);
    if (resolvedSlot === this.localPlayerSlot) {
      if (this.runShopUi?.overlay) {
        this.runShopUi.overlay.hidden = true;
        this.runShopUi.overlay.setAttribute('hidden', '');
      }
      if (this.runShopUi?.choices) this.runShopUi.choices.hidden = true;
      this.runShopUi?.root?.classList.remove('is-free-reward');
      this.runShopUi?.toggle?.classList.remove('is-active');
      document.body.classList.remove('is-run-shop-open');
      this.runShopOpen = false;
      this.runShopFreeReward = false;
      this.runShopCausedPause = false;
      this.cardSystem?.clearHint?.('boss-shop');
      if (this.coopRewardWaitSlots?.size) {
        this.showCoopRunShopWaitingUi();
      }
    }
    this.networkBridge?.markPrivateStateDirty?.();
    if (this.coopRewardWaitSlots?.size) {
      this.syncCoopRewardPauseState();
      return;
    }
    this.coopRewardWaitSlots = null;
    this.coopRewardKind = null;
    this.clearCoopRewardAutoSelectTimer();
    this.hideCoopRunShopWaitingUi();
    this.cardSystem?.clearHint?.('coop-wait-shop');
    document.body.classList.remove('is-game-paused', 'is-run-shop-open');
    this.paused = false;
    this.clock.getDelta();
    this.continueAfterStrategyFlow(false);
  }

  applyNetworkStrategyChoice(slot, index) {
    const applied = this.withPlayerContext(slot, () => {
      const choice = this.strategyEvent?.choices?.[index];
      if (!choice) return false;
      if (!this.applyStrategyChoice(choice)) return false;
      return true;
    });
    if (!applied) return false;
    this.finishCoopStrategyReward(slot);
    return true;
  }

  applyNetworkStrategyReroll(slot) {
    const shouldRenderLocalUi = slot === this.localPlayerSlot;
    return this.withPlayerContext(slot, () => this.rerollStrategyRewardChoices({
      render: shouldRenderLocalUi
    }));
  }

  applyNetworkStrategySkip(slot) {
    const canSkip = this.withPlayerContext(slot, () => Boolean(this.strategyEvent));
    if (!canSkip) return false;
    this.finishCoopStrategyReward(slot);
    return true;
  }

  applyNetworkShopCategory(slot, category) {
    // 新版军需铺不再有“先选服务类别”这一步：所有旧类别都被判定为下架，
    // 即使客户端伪造 shopCategory 命令也无法重新打开复制/删牌/升级等服务。
    void slot;
    void category;
    return false;
  }

  applyNetworkShopChoice(slot, index) {
    // 一次选择只处理一件事：选兵种、领专精、买一件商品。
    // 补给购买不会结束整备——只有 shopRewardSkip（继续战斗）才结束。
    return this.withPlayerContext(slot, () => {
      const choice = this.runShopChoices?.[index];
      if (!choice || choice.disabled) return false;
      const applied = this.completeRunShopPurchase(choice);
      if (applied) this.networkBridge?.markPrivateStateDirty?.(slot);
      return applied;
    });
  }

  applyNetworkShopRewardSkip(slot) {
    const canSkip = this.withPlayerContext(slot, () => Boolean(this.runShopFreeReward));
    if (!canSkip) return false;
    this.finishCoopRunShop(slot);
    return true;
  }

  applyNetworkShopEnergy(slot) {
    // 保底路径（旧 SHOP_ENERGY 命令）：按配置价购买能量补给，同样不结束整备。
    return this.withPlayerContext(slot, () => this.purchaseRunShopEnergy());
  }

  applyNetworkShopBack(slot) {
    return this.withPlayerContext(slot, () => {
      this.clearRunShopSelection();
      return true;
    });
  }

  isLocalCoopRunShopWaiting() {
    if (!this.coop?.enabled || this.runShopFreeReward) return false;
    if (this.strategyEventUi?.root?.dataset?.eventType === 'run-shop-waiting') return true;
    return Boolean(
      this.coopRewardKind === 'run-shop'
      && this.coopRewardWaitSlots?.size
      && !this.coopRewardWaitSlots.has(this.localPlayerSlot)
    );
  }

  applyNetworkPrivateUi(state) {
    if (!this.networkClientMode || !state) return;
    let receivedRewardCountdown = false;
    if ('strategySelectionRequired' in state) {
      this.networkStrategySelectionRequired = Boolean(state.strategySelectionRequired);
    }
    if ('coopRewardAutoSelectSecondsRemaining' in state) {
      const seconds = Number(state.coopRewardAutoSelectSecondsRemaining);
      const normalizedSeconds = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : null;
      this.coopRewardAutoSelectSecondsRemaining = normalizedSeconds;
      this.runShopAutoSelectSecondsRemaining = normalizedSeconds;
      if (this.strategyEvent) this.strategyEvent.autoSelectSecondsRemaining = normalizedSeconds;
      receivedRewardCountdown = true;
    }
    if (state.strategyWaiting) {
      this.strategyEvent = null;
      this.showCoopRewardWaitingUi();
    } else if (
      'strategyWaiting' in state
      && !state.strategyUi
      && !this.strategyEvent
      && this.strategyEventUi.root.dataset.eventType === 'waiting'
    ) {
      this.hideCoopRewardWaitingUi();
      this.onNetworkMatchPhaseChanged(this.networkBridge?.phase);
    }
    if ('strategyUi' in state) {
      if (state.strategyUi?.choices?.length || state.strategyUi?.exhausted) {
        // 刷新次数随奖励状态同步：每波第一次免费，之后从 8 金币开始递增。
        this.strategyRewardRerollCount = Math.max(0, Number(state.strategyUi.rerollCount) || 0);
        this.strategyEvent = {
          networkInteractionId: state.strategyUi.rewardId,
          networkRevision: state.strategyUi.revision,
          type: state.strategyUi.type,
          kicker: state.strategyUi.kicker,
          title: state.strategyUi.title,
          summary: state.strategyUi.summary,
          autoSelectSecondsRemaining: state.strategyUi.autoSelectSecondsRemaining
            ?? this.coopRewardAutoSelectSecondsRemaining,
          rerollCount: this.strategyRewardRerollCount,
          exhausted: Boolean(state.strategyUi.exhausted),
          wave: state.strategyUi.wave,
          choices: state.strategyUi.choices.map((choice) => ({
            ...choice,
            card: choice.card ? { ...choice.card } : null
          }))
        };
        this.syncNetworkStrategyEventUi();
        this.cardSystem?.clearHint?.('coop-wait-reward');
      } else if (!state.strategyWaiting && (this.strategyEvent || !this.strategyEventUi.root.hidden)) {
        this.strategyEvent = null;
        this.strategyEventUi.root.hidden = true;
        this.strategyEventUi.choices.innerHTML = '';
        document.body.classList.remove('is-strategy-event-open');
        this.onNetworkMatchPhaseChanged(this.networkBridge?.phase);
      }
    }

    if ('runShopState' in state || 'runShopUi' in state) {
      const shopState = state.runShopState ?? state.runShopUi ?? {};
      const wasFreeReward = this.runShopFreeReward;
      this.runShopFreeReward = Boolean(shopState.freeReward);
      if (shopState.prices && typeof shopState.prices === 'object') {
        this.shopPrices = { ...this.shopPrices, ...shopState.prices };
        const localRun = this.players?.[this.localPlayerSlot];
        if (localRun) localRun.shopPrices = this.shopPrices;
      }
      this.runShopActiveCategory = shopState.activeCategory ?? null;
      this.runShopChoices = (shopState.choices ?? []).map((choice) => ({
        ...choice,
        card: choice.card ? { ...choice.card } : null
      }));
      this.runShopNetworkOfferId = shopState.offerId ?? null;
      this.runShopNetworkRevision = shopState.revision ?? null;
      this.runShopAutoSelectSecondsRemaining = shopState.autoSelectSecondsRemaining
        ?? this.coopRewardAutoSelectSecondsRemaining;
      if (shouldRestoreFreeRunShopUi({
        freeReward: this.runShopFreeReward,
        runShopOpen: this.runShopOpen,
        ui: this.runShopUi
      })) {
        this.openRunShop({ freeReward: true, preserveState: true });
      } else if (wasFreeReward && !this.runShopFreeReward && this.runShopOpen) {
        this.closeRunShop({ localUiOnly: true });
      } else if (this.runShopOpen) {
        this.renderRunShop();
      }
    }
    if ('runShopWaiting' in state) {
      if (state.runShopWaiting) {
        this.showCoopRunShopWaitingUi();
      } else {
        if (this.hideCoopRunShopWaitingUi()) {
          this.onNetworkMatchPhaseChanged(this.networkBridge?.phase);
        }
      }
    }
    if (receivedRewardCountdown) {
      // 倒计时每秒变化时只更新文字。重建 choices.innerHTML 会替换正在接收
      // pointer/click 的按钮节点，导致波次奖励和免费军需铺偶发点击失效。
      this.updateCoopRewardCountdownUi();
    }
  }

  continueAfterStrategyFlow(shouldStartFirstWave = false) {
    if (this.openNextStrategyReward()) return;
    if (shouldStartFirstWave) {
      this.awaitingOpeningReward = false;
      if (this.cardSystems) {
        Object.values(this.cardSystems).forEach((system) => {
          system.drawToFullHand?.({ animate: system.mountUi !== false });
        });
      } else {
        this.cardSystem?.drawToFullHand?.({ animate: true });
      }
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

  // ---------------------------------------------------------------------------
  // Boss 整备（免费兵种专精 → 明码标价的军需补给铺 → 继续战斗）
  // 规则见 docs/RUNE_STONE_GAMEPLAY_PLAN.md 第 10 节。
  // ---------------------------------------------------------------------------

  /** 军需补给铺配置（可配置数据段；BALANCE.runCurrency.supply 可覆盖默认值）。 */
  runShopSupplyConfig() {
    return runShopSupplyConfig(BALANCE.runCurrency);
  }

  runShopRouteCount() {
    return Math.max(1, Math.floor(Number(this.levelSession?.level?.routeCount) || 1));
  }

  /** 商品类别价格（明码标价，购买前可见）。 */
  shopPrice(kind) {
    return runShopSupplyKindPrice(kind, this.runShopSupplyConfig());
  }

  /** 本局第 N 个 Boss 的整备节点标识；同一节点不会重复初始化。 */
  runShopPrepKey() {
    return `boss:${Math.max(0, Math.floor(Number(this.bossesDefeated) || 0))}`;
  }

  /**
   * 旧版“先选服务类别再进入详情”的入口已全部下架。
   * 新版通过 shopChoice 命令选择具体专精或具体商品，这里只保留兼容占位。
   */
  canRunShopCategory(category) {
    if (isRunShopCategoryRetired(category)) {
      return { ok: false, reason: '该军需服务已从新版军需铺下架' };
    }
    return { ok: false, reason: '新版军需铺直接展示具体商品' };
  }

  isLocalEconomyContext() {
    return (this.activeEconomySlot ?? this.localPlayerSlot) === this.localPlayerSlot;
  }

  /** 当前整备步骤：'specialization-type' | 'specialization-upgrade' | 'supply' | null。 */
  runShopPrepMode() {
    const mode = this.runShopActiveCategory;
    if (RUN_SHOP_SPECIALIZATION_STEPS.includes(mode)) return mode;
    if (mode === RUN_SHOP_STEP_SUPPLY) return mode;
    return null;
  }

  /**
   * 初始化（或恢复）本节点整备：先展示“选择兵种”，商品列表一次性生成后保持稳定。
   * 幂等：同一节点重复调用不会重建商品、不会重置已领专精与售罄状态，
   * 因此断线重连或重复打开都不会刷出新商品或补发专精。
   */
  ensureRunShopPrep() {
    // 联机客户端只渲染 Host 同步过来的状态，绝不自己生成商品。
    if (this.networkClientMode) return false;
    const nodeKey = this.runShopPrepKey();
    if (this.runShopCompletedNodeKey && this.runShopCompletedNodeKey === nodeKey) return false;
    if (
      this.runShopPrepNodeKey === nodeKey
      && Array.isArray(this.runShopItems)
      && this.runShopChoices?.length
    ) {
      return true;
    }
    this.runShopPrepNodeKey = nodeKey;
    this.runShopItems = this.createRunShopSupplyItems(nodeKey);
    this.runShopSpecializationClaimed = false;
    this.runShopSpecializationUnitType = null;
    this.runShopPrepCompleted = false;
    this.runShopPendingOffers = {};
    this.runShopActiveCategory = RUN_SHOP_STEP_SPECIALIZATION_TYPE;
    this.runShopChoices = this.createRunShopSpecializationTypeChoices();
    return true;
  }

  /** 整备是否已走完两步（商品购买不阻塞结束，专精必须先领取或明确放弃）。 */
  markRunShopPrepCompleted() {
    if (!this.runShopSpecializationClaimed) {
      // 未领取就结束整备视为放弃本次免费专精，记录在案防止重复领取。
      this.runShopSpecializationClaimed = true;
    }
    this.runShopPrepCompleted = true;
    this.runShopCompletedNodeKey = this.runShopPrepNodeKey ?? this.runShopPrepKey();
  }

  /**
   * 已获得兵种中仍可用专精：只列本局已获得兵种（acquiredUnitTypes），
   * 并且过滤掉该兵种已拥有的专精；全部获得时返回空列表，由补偿选项兜底。
   */
  buildRunShopSpecializationState() {
    const options = [];
    this.acquiredUnitTypes().forEach((unitType) => {
      const owned = this.teamSpecialUpgrades?.get?.(unitType) ?? new Set();
      const available = (UNIT_SPECIAL_UPGRADES[unitType] ?? [])
        .filter((upgrade) => !owned.has(upgrade.id));
      if (!available.length) return;
      options.push({
        unitType,
        unitName: UNIT_DEFINITIONS[unitType]?.name ?? unitType,
        available
      });
    });
    options.sort((left, right) => left.unitName.localeCompare(right.unitName, 'zh-Hans-CN'));
    return { options, hasAny: options.length > 0 };
  }

  /** 第一步：选择要获得专精的兵种（无可用专精时只给一个补偿选项）。 */
  createRunShopSpecializationTypeChoices() {
    const specialization = this.buildRunShopSpecializationState();
    if (!specialization.hasAny) return [this.createRunShopSpecializationFallbackChoice()];
    return specialization.options.map((option) => ({
      action: RUN_SHOP_ACTION_SPECIALIZATION_UNIT,
      actionLabel: '选择兵种',
      unitType: option.unitType,
      title: option.unitName,
      description: `可解锁 ${option.available.length} 项专精：${option.available.map((upgrade) => upgrade.name).join('、')}`,
      card: {
        id: `run-shop-specialization-${option.unitType}`,
        name: option.unitName,
        kind: 'ability',
        label: '专',
        artKey: option.unitType,
        summary: `可解锁 ${option.available.length} 项专精`,
        energyCost: 0,
        color: specializationIconColor(option.unitType),
        level: 1
      }
    }));
  }

  createRunShopSpecializationFallbackChoice() {
    const silver = runShopSupplyFallbackSilver(this.runShopSupplyConfig());
    return {
      action: RUN_SHOP_ACTION_SPECIALIZATION_FALLBACK,
      actionLabel: '领取补偿',
      title: '专精已满 · 领取补偿',
      description: `本局已获得兵种的全部专精均已解锁，改领 ${formatSilverAmount(silver)} 银币补偿。`,
      fallbackSilver: silver,
      card: {
        id: 'run-shop-specialization-fallback',
        name: '专精补偿',
        kind: 'tactic',
        label: '补',
        artKey: 'tacticUpgrade',
        summary: `改领 ${formatSilverAmount(silver)} 银币`,
        energyCost: 0,
        color: '#ffd166',
        level: 1
      }
    };
  }

  /** 第二步：展示所选兵种尚未获得的专精，选定后直接生效。 */
  createRunShopSpecializationUpgradeChoices(unitType) {
    const owned = this.teamSpecialUpgrades?.get?.(unitType) ?? new Set();
    return (UNIT_SPECIAL_UPGRADES[unitType] ?? [])
      .filter((upgrade) => !owned.has(upgrade.id))
      .map((upgrade) => this.createTeamSpecialUpgradeChoice(unitType, upgrade));
  }

  /** 点击兵种：进入该兵种的专精列表。 */
  selectRunShopSpecializationUnit(unitType) {
    if (!this.isRunShopPrepEditable()) return false;
    if (this.runShopSpecializationClaimed) return false;
    if (this.runShopActiveCategory !== RUN_SHOP_STEP_SPECIALIZATION_TYPE) return false;
    const choices = this.createRunShopSpecializationUpgradeChoices(unitType);
    if (!choices.length) return false;
    this.runShopSpecializationUnitType = unitType;
    this.runShopActiveCategory = RUN_SHOP_STEP_SPECIALIZATION_UPGRADE;
    this.runShopChoices = choices;
    this.renderRunShop();
    this.networkBridge?.markPrivateStateDirty?.(this.activeEconomySlot ?? this.localPlayerSlot);
    return true;
  }

  /** 专精奖励只能在真正的 Boss 整备期间领取：滞后命令不能凭空补发专精。 */
  isRunShopPrepEditable() {
    return this.runShopFreeReward === true && Boolean(this.runShopPrepNodeKey);
  }

  /** 领取一项专精：免费、立即对该兵种现有与后续单位生效，不生成卡牌、不消耗能量。 */
  claimRunShopSpecialization(unitType, upgrade, options = {}) {
    if (!this.isRunShopPrepEditable()) return false;
    if (this.runShopSpecializationClaimed) return false;
    if (!unitType || !upgrade?.id) return false;
    const owned = this.teamSpecialUpgrades?.get?.(unitType);
    if (owned?.has(upgrade.id)) return false;
    if (!this.applyTeamSpecialUpgrade(unitType, upgrade)) return false;
    this.runShopSpecializationClaimed = true;
    this.runShopSpecializationUnitType = null;
    this.enterRunShopSupplyStep({ render: options.render !== false });
    this.cardSystem?.setHint?.(
      `已获得专精：${UNIT_DEFINITIONS[unitType]?.name ?? unitType}·${upgrade.name}`,
      'run-shop'
    );
    return true;
  }

  /** 所有专精都已获得时的替代奖励：少量银币，保证流程永远可以继续。 */
  claimRunShopSpecializationFallback(options = {}) {
    if (!this.isRunShopPrepEditable()) return false;
    if (this.runShopSpecializationClaimed) return false;
    const silver = runShopSupplyFallbackSilver(this.runShopSupplyConfig());
    this.runShopSpecializationClaimed = true;
    this.runShopSpecializationUnitType = null;
    if (silver > 0) this.addSilver(silver);
    this.enterRunShopSupplyStep({ render: options.render !== false });
    this.cardSystem?.setHint?.(`专精已满，改领 ${formatSilverAmount(silver)} 银币补偿`, 'run-shop');
    this.updateHud(0);
    return true;
  }

  /** 专精步骤结束：切到明码标价的军需补给铺。 */
  enterRunShopSupplyStep(options = {}) {
    this.runShopActiveCategory = RUN_SHOP_STEP_SUPPLY;
    this.runShopChoices = this.createRunShopSupplyChoices();
    this.networkBridge?.markPrivateStateDirty?.(this.activeEconomySlot ?? this.localPlayerSlot);
    if (options.render !== false) this.renderRunShop();
    return true;
  }

  /**
   * 生成 4～6 件具体商品：数量、类别配额与价格全部来自 runShopCatalog 的配置。
   * 每件商品有独立实例 id；购买一次后售罄，不退场、不自动补货。
   */
  createRunShopSupplyItems(nodeKey = this.runShopPrepKey()) {
    const config = this.runShopSupplyConfig();
    const itemCount = runShopSupplyItemCount(config, this.runShopRouteCount() - 1);
    const kinds = runShopSupplyKindSequence(config, itemCount);
    const context = {
      config,
      nodeKey,
      cardPool: this.waveRewardCardPool(),
      usedCardIds: new Set(),
      usedUpgradeIds: new Set(),
      energyOffered: false,
      index: 0
    };
    const items = [];
    const tryAdd = (kind) => {
      const item = this.createRunShopSupplyItem(kind, context);
      if (!item) return false;
      if (kind === 'energy') context.energyOffered = true;
      context.index += 1;
      items.push(item);
      return true;
    };
    kinds.forEach(tryAdd);
    // 波次奖励牌组耗尽时仍要凑够最少商品数：优先补不同项的属性集训，再补其余类别，
    // 保证玩家永远看得到可购买的具体商品，而不是空列表。
    const minimum = Math.max(1, Math.min(config.minItemCount, itemCount));
    const fillOrder = ['attribute', 'energy', ...RUN_SHOP_SUPPLY_KINDS.filter((kind) => kind !== 'attribute')];
    let attempts = 0;
    while (items.length < minimum && attempts < fillOrder.length * 4) {
      tryAdd(fillOrder[attempts % fillOrder.length]);
      attempts += 1;
    }
    return items;
  }

  /** 单位卡 / 附魔卡 / 能力地形卡 / 属性集训 / 能量补给各取一件具体商品。 */
  createRunShopSupplyItem(kind, {
    config,
    nodeKey,
    index = 0,
    cardPool = [],
    usedCardIds = new Set(),
    usedUpgradeIds = new Set(),
    energyOffered = false
  } = {}) {
    const itemId = `run-shop-item:${nodeKey}:${index}:${kind}`;
    const price = runShopSupplyKindPrice(kind, config);
    if (kind === 'energy') {
      if (energyOffered) return null;
      const amount = runShopSupplyEnergyAmount(config);
      return {
        itemId,
        kind,
        price,
        sold: false,
        energyAmount: amount,
        cardId: RUN_SHOP_ENERGY_CARD_ID,
        title: `${RUN_SHOP_SUPPLY_KIND_LABELS.energy} +${amount}`,
        effectSummary: `立即获得 ${amount} 点能量。`,
        choice: {
          action: RUN_SHOP_ACTION_BUY_ENERGY,
          actionLabel: '购买能量',
          title: `${RUN_SHOP_SUPPLY_KIND_LABELS.energy} +${amount}`,
          description: `立即获得 ${amount} 点能量。`,
          card: {
            id: RUN_SHOP_ENERGY_CARD_ID,
            name: `${RUN_SHOP_SUPPLY_KIND_LABELS.energy} +${amount}`,
            kind: 'tactic',
            label: '能',
            artKey: 'tacticUpgrade',
            summary: `立即获得 ${amount} 点能量`,
            energyCost: 0,
            color: '#8ad6ff',
            level: 1
          }
        }
      };
    }
    if (kind === 'attribute') {
      const pool = this.buildAttributeUpgradeChoicePool()
        .filter((choice) => !usedUpgradeIds.has(choice.upgrade?.id));
      const picked = pickRandomItems(pool, 1)[0];
      if (!picked) return null;
      if (picked.upgrade?.id) usedUpgradeIds.add(picked.upgrade.id);
      return {
        itemId,
        kind,
        price,
        sold: false,
        upgradeId: picked.upgrade?.id ?? null,
        cardId: picked.card?.id ?? null,
        title: picked.card?.name ?? picked.title ?? RUN_SHOP_SUPPLY_KIND_LABELS.attribute,
        effectSummary: picked.card?.summary ?? picked.description ?? '',
        choice: {
          action: picked.action,
          actionLabel: '购买集训',
          title: picked.title,
          description: picked.description,
          upgrade: picked.upgrade,
          card: picked.card
        }
      };
    }
    const matchesKind = (card) => {
      if (kind === 'unitCard') return card?.kind === 'summon';
      if (kind === 'enchant') return card?.kind === 'enchant';
      return card?.kind === 'spell' || card?.kind === 'ability';
    };
    const candidates = (cardPool ?? []).filter((card) => card?.id && matchesKind(card));
    const repeatable = kind === 'enchant' && config?.allowDuplicateEnchant !== false;
    let card = candidates.find((entry) => !usedCardIds.has(entry.id)) ?? null;
    if (!card && repeatable) card = candidates[0] ?? null;
    if (!card) return null;
    usedCardIds.add(card.id);
    const kindLabel = RUN_SHOP_SUPPLY_KIND_LABELS[kind];
    return {
      itemId,
      kind,
      price,
      sold: false,
      cardId: card.id,
      title: card.name,
      effectSummary: card.summary ?? '',
      choice: {
        action: 'add-card',
        actionLabel: '购买卡牌',
        // 单位卡等同剩余波次奖励牌组中的同名卡：购买后同样会消耗该定义（附魔卡除外）。
        rewardSource: 'wave-reward-deck',
        title: card.name,
        description: `${kindLabel} · ${card.summary ?? ''}`.trim(),
        card
      }
    };
  }

  /** 商品实例 → 可渲染/可选择的选择项（含售价与售罄状态）。 */
  runShopItemToChoice(item, silver) {
    if (!item) return null;
    const soldOut = item.sold === true;
    const affordable = soldOut || silver + 0.001 >= item.price;
    return {
      ...item.choice,
      itemId: item.itemId,
      itemKind: item.kind,
      itemPrice: item.price,
      soldOut,
      disabled: soldOut || !affordable,
      actionLabel: soldOut ? RUN_SHOP_SOLD_OUT_LABEL : `${formatSilverAmount(item.price)} 银币`
    };
  }

  createRunShopSupplyChoices() {
    const silver = Math.max(0, Number(this.getSilver()) || 0);
    return (this.runShopItems ?? [])
      .map((item) => this.runShopItemToChoice(item, silver))
      .filter(Boolean);
  }

  /** 购买后刷新商品列表（保留顺序与实例身份，只更新售价标签与售罄状态）。 */
  refreshRunShopSupplyChoices() {
    if (this.runShopActiveCategory === RUN_SHOP_STEP_SUPPLY) {
      this.runShopChoices = this.createRunShopSupplyChoices();
    }
    if (this.isLocalEconomyContext()) this.renderRunShop();
  }

  /**
   * 购买一件商品：Host 权威校验（银币、价格、是否已售罄、商品是否属于本节点），
   * 先扣款再应用，应用失败立刻退款；任何一步失败都不改变世界状态。
   */
  purchaseRunShopSupplyItem(item) {
    if (!item || item.sold) {
      this.cardSystem?.setHint?.('该商品已经售罄', 'run-shop');
      return false;
    }
    if (this.runShopActiveCategory !== RUN_SHOP_STEP_SUPPLY || !this.isRunShopPrepEditable()) return false;
    if (!(this.runShopItems ?? []).includes(item)) return false;
    const price = Math.max(0, Number(item.price) || 0);
    if (this.getSilver() + 0.001 < price) {
      this.cardSystem?.setHint?.('银币不足', 'run-shop');
      return false;
    }
    // 银币走玩家独立经济助手，联机各自扣款；银币支出与符文石出售基准完全无关。
    this.setSilver(this.getSilver() - price);
    if (!this.applyRunShopSupplyItemEffect(item)) {
      this.setSilver(this.getSilver() + price);
      this.cardSystem?.setHint?.('购买失败，请重试', 'run-shop');
      return false;
    }
    item.sold = true;
    this.refreshRunShopSupplyChoices();
    this.cardSystem?.setHint?.(
      `${item.title} 已获得，-${formatSilverAmount(price)} 银币`,
      'run-shop'
    );
    this.updateHud(0);
    this.networkBridge?.markPrivateStateDirty?.(this.activeEconomySlot ?? this.localPlayerSlot);
    return true;
  }

  /** 商品效果：加卡 / 全队属性集训 / 能量补给。 */
  applyRunShopSupplyItemEffect(item) {
    if (!item) return false;
    if (item.kind === 'energy') return this.grantRunShopEnergy(item.energyAmount);
    if (item.upgrade) return this.applyTeamGenericUpgrade(item.upgrade);
    if (item.choice?.card) return this.applyStrategyChoice(item.choice);
    return false;
  }

  grantRunShopEnergy(amount) {
    const gained = this.cardSystem?.addEnergy?.(Math.max(1, Math.floor(Number(amount) || 1))) ?? 0;
    return gained > 0;
  }

  /**
   * 明码标价的能量补给：必须支付银币（Boss 整备期间也不免费）。
   * 免费机会只属于兵种专精，不与补给竞争。
   */
  purchaseRunShopEnergy(options = {}) {
    const config = this.runShopSupplyConfig();
    const amount = Math.max(1, Math.floor(Number(options.amount ?? runShopSupplyEnergyAmount(config))));
    const price = Math.max(0, Number(options.price ?? runShopSupplyKindPrice('energy', config)));
    if (this.getSilver() + 0.001 < price) {
      this.cardSystem?.setHint?.('银币不足', 'run-shop');
      return false;
    }
    if (!this.grantRunShopEnergy(amount)) return false;
    this.setSilver(this.getSilver() - price);
    this.cardSystem?.setHint?.(`已购买 ${amount} 点能量，-${formatSilverAmount(price)} 银币`, 'run-shop');
    this.updateHud(0);
    this.renderRunShop();
    return true;
  }

  /** “继续战斗”：结束整个 Boss 整备（两步都算完成），由调用方推进下一波。 */
  finishRunShopPrep() {
    if (!this.runShopFreeReward) return false;
    this.closeRunShop({ force: true });
    return true;
  }

  bindRunShopUi() {
    const ui = this.runShopUi;
    if (!ui?.overlay) return;
    if (ui.overlay === this.runShopUiBoundOverlay) return;
    this.runShopUiBoundOverlay = ui.overlay;
    const signal = this.eventController.signal;
    ui.overlay.addEventListener('click', (event) => this.onRunShopClick(event), { signal });
    ui.overlay.addEventListener('pointerdown', stopUiPropagation, { signal });
    ui.overlay.addEventListener('contextmenu', stopUiEvent, { signal });
    ui.cardScaleInput?.addEventListener('input', (event) => {
      event.stopPropagation();
      const percent = clamp(Number(event.currentTarget.value) || 100, 55, 100);
      this.runShopCardScale = percent / 100;
      this.syncRunShopCardScaleUi(true);
    }, { signal });
    ui.cardScaleInput?.addEventListener('pointerdown', stopUiPropagation, { signal });
    ui.toggle?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleRunShop();
    }, { signal });
    ui.toggle?.addEventListener('pointerdown', stopUiPropagation, { signal });
  }

  syncRunShopCardScaleUi(visible = false) {
    const scale = clamp(Number(this.runShopCardScale) || 1, 0.55, 1);
    const percent = Math.round(scale * 100);
    if (this.runShopUi.cardScaleControl) this.runShopUi.cardScaleControl.hidden = !visible;
    if (this.runShopUi.cardScaleInput) this.runShopUi.cardScaleInput.value = String(percent);
    if (this.runShopUi.cardScaleValue) {
      this.runShopUi.cardScaleValue.value = `${percent}%`;
      this.runShopUi.cardScaleValue.textContent = `${percent}%`;
    }
    const choiceList = this.runShopUi.choiceList;
    if (!choiceList) return;
    choiceList.classList.toggle('is-scalable-card-picker', visible);
    choiceList.style?.setProperty?.('--run-shop-card-scale', String(scale));
    choiceList.style?.setProperty?.('--run-shop-card-width', `${184 * scale}px`);
    choiceList.style?.setProperty?.('--run-shop-card-height', `${290 * scale}px`);
    choiceList.style?.setProperty?.('--run-shop-mobile-card-width', `${145 * scale}px`);
    choiceList.style?.setProperty?.('--run-shop-mobile-card-height', `${229 * scale}px`);
    choiceList.style?.setProperty?.('--run-shop-card-column-gap', `${10 * scale}px`);
    choiceList.style?.setProperty?.('--run-shop-card-row-gap', `${12 * scale}px`);
  }

  toggleRunShop() {
    if (!RUN_SHOP_PLAYER_ACCESS_ENABLED && !this.runShopFreeReward) return false;
    if (this.levelFinished || this.levelSession.debug) return;
    if (this.strategyEvent) return;
    if (!this.runShopFreeReward && this.isLocalCoopRunShopWaiting()) {
      this.showCoopRunShopWaitingUi();
      return;
    }
    if (this.runShopFreeReward) {
      if (shouldRestoreFreeRunShopUi({
        freeReward: true,
        runShopOpen: this.runShopOpen,
        ui: this.runShopUi
      })) {
        this.openRunShop({ freeReward: true, preserveState: true });
      } else if (this.runShopOpen) {
        if (this.networkBridge?.shouldRouteLocalCommands?.()) {
          this.networkBridge.commandSender?.shopRewardSkip?.();
        } else {
          this.closeRunShop({ force: true });
        }
      }
      return;
    }
    if (this.runShopOpen) {
      this.closeRunShop();
      return;
    }
    this.openRunShop();
  }

  openRunShop(options = {}) {
    if (!RUN_SHOP_PLAYER_ACCESS_ENABLED && options.freeReward !== true) return false;
    if (!options.freeReward && this.isLocalCoopRunShopWaiting()) {
      this.showCoopRunShopWaitingUi();
      return false;
    }
    this.runShopUi = ensureRunShopUi(this.runShopUi);
    this.bindRunShopUi();
    if (this.strategyEventUi?.root) {
      this.strategyEventUi.root.hidden = true;
    }
    this.runShopOpen = true;
    if (!options.preserveState) {
      this.runShopFreeReward = options.freeReward === true;
      if (this.runShopFreeReward) {
        // 打开（或恢复）Boss 整备：先给免费专精选择，再进入补给铺。
        // 同一整备节点不会重建商品，也不会重置已领专精。
        if (!this.ensureRunShopPrep()) {
          this.runShopOpen = false;
          this.runShopFreeReward = false;
          return false;
        }
      } else {
        this.runShopActiveCategory = null;
        this.runShopChoices = [];
        this.runShopPendingOffers = {};
      }
      const run = this.players?.[this.activeEconomySlot ?? this.localPlayerSlot];
      if (run) this.mirrorRunShopPrepStateTo(run);
    }
    if (this.tryAutoSkipRunShopReward()) return true;
    if (this.runShopUi.overlay) {
      this.runShopUi.overlay.hidden = false;
      this.runShopUi.overlay.removeAttribute('hidden');
    }
    this.runShopUi.toggle?.classList.add('is-active');
    this.runShopUi.root?.classList.toggle('is-free-reward', this.runShopFreeReward);
    document.body.classList.add('is-run-shop-open');
    if (shouldPauseRunShop({
      coopEnabled: this.coop?.enabled === true,
      alreadyPaused: this.paused
    })) {
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
      this.cardSystem?.setHint?.(this.runShopHintText(), 'boss-shop');
    } else {
      this.cardSystem?.setHint?.('军需铺已打开，按 Esc 关闭', 'run-shop');
    }
    this.renderRunShop();
    this.runShopUi.root?.focus?.();
    return true;
  }

  /** 把当前整备状态同步到该玩家的 run 状态（断线重连与联机私有状态都以 run 为准）。 */
  mirrorRunShopPrepStateTo(container) {
    if (!container) return;
    container.runShopFreeReward = this.runShopFreeReward;
    container.runShopActiveCategory = this.runShopActiveCategory;
    container.runShopChoices = this.runShopChoices;
    container.runShopPendingOffers = this.runShopPendingOffers;
    container.runShopItems = this.runShopItems;
    container.runShopPrepNodeKey = this.runShopPrepNodeKey;
    container.runShopSpecializationClaimed = this.runShopSpecializationClaimed;
    container.runShopSpecializationUnitType = this.runShopSpecializationUnitType;
    container.runShopPrepCompleted = this.runShopPrepCompleted;
    container.runShopCompletedNodeKey = this.runShopCompletedNodeKey;
  }

  closeRunShop(options = {}) {
    if (this.runShopFreeReward && !options.force && !options.afterFreeReward) {
      return;
    }
    if (!options.localUiOnly && this.coop?.enabled && this.coopRewardKind === 'run-shop' && this.coopRewardWaitSlots?.size) {
      const wasFreeReward = this.runShopFreeReward;
      if (wasFreeReward || options.afterFreeReward || options.force) {
        this.finishCoopRunShop(this.activeEconomySlot ?? this.localPlayerSlot);
        return;
      }
    }
    const wasFreeReward = this.runShopFreeReward;
    if (wasFreeReward && !options.localUiOnly) {
      // 整备结束（无论是否买了商品）都记录完成，防止滞后命令重新开启或重复领取专精。
      this.markRunShopPrepCompleted();
    }
    const causedPause = this.runShopCausedPause;
    this.runShopOpen = false;
    if (wasFreeReward && !options.localUiOnly) {
      this.runShopFreeReward = false;
      this.runShopActiveCategory = null;
      this.runShopChoices = [];
      this.runShopItems = null;
    }
    if (this.runShopUi?.overlay) {
      this.runShopUi.overlay.hidden = true;
      this.runShopUi.overlay.setAttribute('hidden', '');
    }
    if (this.runShopUi?.choices) this.runShopUi.choices.hidden = true;
    this.runShopUi?.root?.classList.remove('is-free-reward');
    this.runShopUi?.toggle?.classList.remove('is-active');
    document.body.classList.remove('is-run-shop-open');
    this.runShopCausedPause = false;
    this.cardSystem?.clearHint?.('run-shop');
    this.cardSystem?.clearHint?.('boss-shop');
    if (causedPause) {
      this.paused = false;
      document.body.classList.remove('is-game-paused');
      if (this.dom.pauseOverlay) this.dom.pauseOverlay.hidden = true;
      this.clock.getDelta();
    }
    if (!options.localUiOnly && (wasFreeReward || options.afterFreeReward)) {
      if (this.paused) {
        this.paused = false;
        document.body.classList.remove('is-game-paused');
        this.clock.getDelta();
      }
      this.continueAfterStrategyFlow(false);
    }
  }

  /** 返回上一步：专精列表 → 兵种列表。领取后不可回退，补给铺也不回退。 */
  clearRunShopSelection() {
    if (
      this.runShopActiveCategory !== RUN_SHOP_STEP_SPECIALIZATION_UPGRADE
      || this.runShopSpecializationClaimed
    ) {
      return false;
    }
    this.runShopSpecializationUnitType = null;
    this.runShopActiveCategory = RUN_SHOP_STEP_SPECIALIZATION_TYPE;
    this.runShopChoices = this.createRunShopSpecializationTypeChoices();
    this.renderRunShop();
    this.networkBridge?.markPrivateStateDirty?.(this.activeEconomySlot ?? this.localPlayerSlot);
    return true;
  }

  /** 整备中按 Esc：专精列表先返回；其余情况视为跳过本次整备继续战斗。 */
  escapeRunShop() {
    if (this.runShopActiveCategory === RUN_SHOP_STEP_SPECIALIZATION_UPGRADE) {
      if (this.networkBridge?.shouldRouteLocalCommands?.()) {
        this.networkBridge.commandSender?.shopBack?.();
      } else {
        this.clearRunShopSelection();
      }
      return;
    }
    if (this.runShopFreeReward) {
      if (this.networkBridge?.shouldRouteLocalCommands?.()) {
        this.networkBridge.commandSender?.shopRewardSkip?.();
      } else {
        this.finishRunShopPrep();
      }
      return;
    }
    this.closeRunShop();
  }

  /**
   * 处理一次军需铺选择：可能是选择兵种、领取专精、领取补偿，或购买一件具体商品。
   * 所有校验都在 Host 侧完成；被拒绝的请求不改变任何状态。
   */
  completeRunShopPurchase(choice, options = {}) {
    void options;
    if (!choice || choice.disabled) return false;
    const mode = this.runShopPrepMode();
    if (mode === RUN_SHOP_STEP_SPECIALIZATION_TYPE) {
      if (choice.action === RUN_SHOP_ACTION_SPECIALIZATION_FALLBACK) {
        return this.claimRunShopSpecializationFallback();
      }
      if (choice.action === RUN_SHOP_ACTION_SPECIALIZATION_UNIT) {
        return this.selectRunShopSpecializationUnit(choice.unitType);
      }
      return false;
    }
    if (mode === RUN_SHOP_STEP_SPECIALIZATION_UPGRADE) {
      if (choice.action !== 'apply-team-special-upgrade') return false;
      return this.claimRunShopSpecialization(choice.unitType, choice.upgrade);
    }
    if (mode !== RUN_SHOP_STEP_SUPPLY) return false;
    const item = this.runShopItemForChoice(choice);
    return this.purchaseRunShopSupplyItem(item);
  }

  /** 选择项 → 商品实例：Host 用实例 id 定位，客户端不参与应用。 */
  runShopItemForChoice(choice) {
    const items = this.runShopItems ?? [];
    if (!items.length) return null;
    if (choice?.itemId) {
      return items.find((item) => item.itemId === choice.itemId) ?? null;
    }
    const index = (this.runShopChoices ?? []).indexOf(choice);
    return index >= 0 ? items[index] ?? null : null;
  }

  renderRunShop() {
    if (!this.isLocalEconomyContext() || !this.runShopOpen || !this.runShopUi?.root) return;
    const ui = this.runShopUi;
    const previousMode = ui.renderedCategory ?? null;
    const mode = this.runShopPrepMode();
    if (ui.silver) ui.silver.textContent = formatSilverAmount(this.getSilver());
    if (ui.kicker) ui.kicker.textContent = this.runShopKickerText(mode);
    if (ui.title) ui.title.textContent = this.runShopTitleText(mode);
    if (ui.back) {
      ui.back.hidden = mode !== RUN_SHOP_STEP_SPECIALIZATION_UPGRADE;
      ui.back.textContent = RUN_SHOP_BACK_TO_UNIT_LABEL;
    }
    if (ui.skip) {
      // “继续战斗”只在补给铺出现：专精还没领时不允许误触结束整备。
      ui.skip.hidden = mode !== RUN_SHOP_STEP_SUPPLY;
      ui.skip.textContent = RUN_SHOP_CONTINUE_LABEL;
      ui.skip.disabled = mode !== RUN_SHOP_STEP_SUPPLY;
    }
    if (ui.close) ui.close.hidden = this.runShopFreeReward === true;
    ui.root.classList.toggle('is-free-reward', mode !== RUN_SHOP_STEP_SUPPLY);
    ui.root.classList.toggle('is-detail', mode === RUN_SHOP_STEP_SPECIALIZATION_UPGRADE);
    ui.root.classList.toggle('is-wave-card-picker', mode === RUN_SHOP_STEP_SPECIALIZATION_UPGRADE);
    ui.renderedCategory = mode;

    if (mode === RUN_SHOP_STEP_SPECIALIZATION_UPGRADE) {
      if (ui.services) ui.services.hidden = true;
      if (ui.choices) ui.choices.hidden = false;
      ui.choiceList?.classList.toggle('is-card-picker', true);
      ui.choiceList?.classList.toggle('is-catalog-picker', false);
      ui.choiceList?.classList.toggle('is-horizontal-row', true);
      ui.choiceList?.classList.toggle('is-training-card-picker', false);
      ui.choiceList?.classList.toggle('is-specialization-card-picker', true);
      ui.choiceList?.classList.toggle('is-temporary-card-picker', false);
      ui.choiceList?.classList.toggle('is-compact-three-choice-picker', true);
      this.syncRunShopCardScaleUi(false);
      if (ui.choiceList) {
        ui.choiceList.innerHTML = (this.runShopChoices ?? [])
          .map((choice, index) => runShopChoiceMarkup(choice, index, {
            game: this,
            useSpecializationStyle: true
          }))
          .join('');
        fitStrategyRewardCards(ui.choiceList);
      }
    } else {
      if (ui.choices) ui.choices.hidden = true;
      if (ui.choiceList) {
        ui.choiceList.innerHTML = '';
        ui.choiceList.classList.remove(
          'is-card-picker',
          'is-catalog-picker',
          'is-horizontal-row',
          'is-training-card-picker',
          'is-specialization-card-picker',
          'is-temporary-card-picker',
          'is-compact-three-choice-picker',
          'is-scalable-card-picker'
        );
      }
      this.syncRunShopCardScaleUi(false);
      if (ui.services) {
        ui.services.hidden = false;
        if (mode === RUN_SHOP_STEP_SUPPLY) {
          ui.services.innerHTML = (this.runShopChoices ?? [])
            .map((choice, index) => runShopSupplyItemMarkup(choice, index))
            .join('');
        } else if (mode === RUN_SHOP_STEP_SPECIALIZATION_TYPE) {
          ui.services.innerHTML = (this.runShopChoices ?? [])
            .map((choice, index) => runShopServiceOptionMarkup(choice, index, {
              icon: choice.action === RUN_SHOP_ACTION_SPECIALIZATION_FALLBACK
                ? '补'
                : (UNIT_DEFINITIONS[choice.unitType]?.name ?? '专').slice(0, 1),
              priceLabel: RUN_SHOP_FREE_LABEL
            }))
            .join('');
        } else {
          ui.services.innerHTML = '<p class="run-shop-balance">当前没有可用的军需补给。</p>';
        }
      }
    }
    if (previousMode !== mode) {
      ui.root.scrollTop = 0;
      if (ui.choiceList) ui.choiceList.scrollTop = 0;
    }
  }

  runShopKickerText(mode = this.runShopPrepMode()) {
    const countdown = formatCoopRewardCountdownSuffix(this.runShopAutoSelectSecondsRemaining);
    if (mode === RUN_SHOP_STEP_SUPPLY) {
      return `Boss 战利 #${this.bossesDefeated} · 军需补给${countdown}`;
    }
    if (mode) {
      return `Boss 战利 #${this.bossesDefeated} · 免费兵种专精${countdown}`;
    }
    return this.runShopFreeReward ? `Boss 战利 #${this.bossesDefeated}${countdown}` : '营地军需';
  }

  runShopTitleText(mode = this.runShopPrepMode()) {
    if (mode === RUN_SHOP_STEP_SUPPLY) return RUN_SHOP_SUPPLY_TITLE;
    if (mode === RUN_SHOP_STEP_SPECIALIZATION_UPGRADE) {
      const unitType = this.runShopSpecializationUnitType;
      const unitName = UNIT_DEFINITIONS[unitType]?.name ?? '兵种';
      return `${unitName} · 选择专精`;
    }
    if (mode === RUN_SHOP_STEP_SPECIALIZATION_TYPE) return RUN_SHOP_SPECIALIZATION_TITLE;
    return this.runShopFreeReward ? 'Boss 整备' : '军需铺';
  }

  runShopHintText() {
    return this.runShopPrepMode() === RUN_SHOP_STEP_SUPPLY
      ? 'Boss 战利：军需补给铺已开放，可购买或直接继续战斗'
      : 'Boss 战利：请选择一项免费兵种专精';
  }

  onRunShopClick(event) {
    if (this.networkBridge?.shouldRouteLocalCommands?.()) {
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
      if (backButton && !backButton.hidden) {
        event.preventDefault();
        const sent = this.networkBridge?.commandSender?.shopBack?.();
        if (!sent) this.cardSystem?.setHint?.('返回请求未发送，请等待军需铺状态同步后重试', 'network-command');
        return;
      }
      const continueButton = event.target.closest('#run-shop-skip');
      if (continueButton && !continueButton.hidden) {
        event.preventDefault();
        if (this.runShopFreeReward) {
          const sent = this.networkBridge?.commandSender?.shopRewardSkip?.();
          if (!sent) this.cardSystem?.setHint?.('继续请求未发送，请等待军需铺状态同步后重试', 'network-command');
        }
        return;
      }
      const choiceButton = event.target.closest('[data-run-shop-choice-index]');
      if (choiceButton && !choiceButton.disabled) {
        event.preventDefault();
        const sent = this.networkBridge?.commandSender?.shopChoice?.(Number(choiceButton.dataset.runShopChoiceIndex));
        if (!sent) this.cardSystem?.setHint?.('军需请求未发送，请等待军需铺状态同步后重试', 'network-command');
      }
      return;
    }
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
    if (backButton && !backButton.hidden) {
      event.preventDefault();
      this.clearRunShopSelection();
      return;
    }
    const continueButton = event.target.closest('#run-shop-skip');
    if (continueButton && !continueButton.hidden) {
      event.preventDefault();
      this.finishRunShopPrep();
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

  grantSilver(amount, position = null, slot = this.activeEconomySlot ?? this.localPlayerSlot) {
    if (amount <= 0.001) return 0;
    const gained = amount * SILVER_GAIN_MULTIPLIER;
    if (gained <= 0.001) return 0;
    this.addSilver(gained, slot);
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
    if (this.runShopOpen && slot === (this.activeEconomySlot ?? this.localPlayerSlot)) {
      this.renderRunShop();
    }
    return gained;
  }

  grantWaveSilver(wave) {
    if (!wave) return 0;
    const rewards = BALANCE.runCurrency ?? {};
    let amount = Number(rewards.waveNormal) || 3;
    if (wave.kind === 'elite') amount = Number(rewards.waveElite) || 6;
    if (this.coop?.enabled && this.players) {
      let total = 0;
      this.coopPlayerSlots().forEach((slot) => {
        total += this.grantSilver(amount, this.playerBase?.position, slot);
      });
      return total;
    }
    return this.grantSilver(amount, this.playerBase?.position);
  }

  grantKillSilver(unit, source = null) {
    if (!unit || unit.team !== TEAMS.ENEMY || unit.isSilentRemoval) return 0;
    const rewards = BALANCE.runCurrency?.killRewards ?? {};
    let amount = Number(rewards.normal) || 0.35;
    if (unit.isBoss) amount = Number(rewards.boss) || 3.5;
    else if (unit.isElite) amount = Number(rewards.elite) || 1.1;
    else if (unit.isWildlife) amount = Number(rewards.wildlife) || 0.1;

    if (this.coop?.enabled && this.players) {
      // PvE 击杀是全队事件：每位玩家的独立经济各自获得同额基础奖励。
      let total = 0;
      this.coopPlayerSlots().forEach((slot) => {
        const showLocalFx = slot === this.localPlayerSlot;
        total += this.grantSilver(amount, showLocalFx ? unit.position : null, slot);
        const pouchStacks = this.abilitiesFor(slot)?.getStacks?.('lootPouch') ?? 0;
        if (pouchStacks > 0) {
          const pouchSilver = pouchStacks * 0.35;
          this.addSilver(pouchSilver, slot);
          total += pouchSilver;
          if (showLocalFx && unit.position && this.effects?.spawnEnergyNumber) {
            this.effects.spawnEnergyNumber(unit.position, pouchSilver, {
              text: `+${formatSilverAmount(pouchSilver)} 银币`,
              color: '#f6e7a8',
              stroke: '#4a3818',
              height: 2.2,
              duration: 0.82,
              fontSize: 76
            });
          }
        }
      });
      this.updateHud(0);
      return total;
    }

    const ownerSlot = resolveKillOwnerSlot(this, source);
    const slot = ownerSlot ?? this.localPlayerSlot;
    const gained = this.grantSilver(amount, unit.position, slot);
    const pouchStacks = this.abilitiesFor(slot)?.getStacks?.('lootPouch') ?? 0;
    if (pouchStacks > 0) {
      const pouchSilver = pouchStacks * 0.35;
      this.addSilver(pouchSilver, slot);
      if (unit.position && this.effects?.spawnEnergyNumber) {
        this.effects.spawnEnergyNumber(unit.position, pouchSilver, {
          text: `+${formatSilverAmount(pouchSilver)} 银币`,
          color: '#f6e7a8',
          stroke: '#4a3818',
          height: 2.2,
          duration: 0.82,
          fontSize: 76
        });
      }
      this.updateHud(0);
      if (this.runShopOpen) this.renderRunShop();
      return gained + pouchSilver;
    }
    return gained;
  }

  getSpellAreaRadiusBonus(slot = this.activeEconomySlot ?? this.localPlayerSlot) {
    const stacks = this.getAbilityStacks('tacticalMaster', slot);
    return 1 + 0.5 * Math.max(0, stacks);
  }

  scaleSpellAreaRadius(radius, slot = this.activeEconomySlot ?? this.localPlayerSlot) {
    return Math.max(0.5, radius * this.getSpellAreaRadiusBonus(slot));
  }

  // 旧版“按服务类别生成候选”的 createShopChoicesForCategory 已随八类服务一起下架；
  // 新版军需铺的商品候选由 createRunShopSupplyItems 一次性生成。

  openStrategyEvent(type, options = {}) {
    if (this.levelFinished || this.levelSession.debug) return;
    type = normalizeStrategyEventType(type);
    let event = this.createStrategyEvent(type, options);
    if (!event?.choices?.length && type === 'wave-reward') {
      // 发牌池已耗尽：提示后直接继续（单机无等待）
      this.cardSystem?.setHint?.('牌已发光：本局波次奖励的发牌池已用完', 'wave-reward-exhausted');
      this.continueAfterStrategyFlow(false);
      return false;
    }
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
    if (this.tryAutoSkipWaveReward()) return true;
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
    type = normalizeStrategyEventType(type);
    this.resetStrategyRewardRerollForEvent(type);
    if (isOpeningRewardType(type)) {
      const step = openingRewardStep(type);
      if (type === 'opening-unit') {
        const summonPool = CARD_DEFINITIONS.filter((card) => isOpeningCombatSummon(card));
        return {
          type,
          kicker: '开局准备',
          title: step?.title ?? '选择你的起始单位卡',
          summary: step?.summary ?? '从所有战斗单位中三选一，获得该单位卡后自行部署。',
          choices: this.openingUnitChoices({
            pool: summonPool,
            action: 'grant-opening-unit-card',
            actionLabel: '获得单位卡'
          })
        };
      }
      const terrainOnly = step?.terrainOnly === true;
      return {
        type,
        kicker: '开局准备',
        title: step?.title ?? '开局选牌',
        summary: step?.summary ?? '从本局可选卡牌中三选一，加入抽牌堆。',
        choices: this.openingKindChoices({
          kind: step?.kind ?? null,
          terrainOnly,
          pool: this.openingKindPool(step?.kind ?? null, { terrainOnly }),
          action: 'add-card',
          actionLabel: '加入牌堆'
        })
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
        choices: this.createCardWaveRewardChoices()
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
        : this.randomCardChoices({
            pool: this.selectedCardPool(),
            action: 'add-card',
            actionLabel: '加入牌堆'
          })
    };
  }

  createFallbackCardChoiceEvent(options = {}) {
    return {
      type: 'card-choice',
      kicker: waveEventKicker(options.wave),
      title: '选择一张新卡',
      summary: '当前奖励事件没有可用目标，改为从全部可用卡牌中选择一张。',
      choices: this.randomCardChoices({
        pool: this.selectedCardPool({ allowAllFallback: true }),
        action: 'add-card',
        actionLabel: '加入牌堆'
      })
    };
  }

  selectedCardPool(options = {}) {
    const seen = new Set();
    const slot = this.activeEconomySlot ?? this.localPlayerSlot;
    const coopDeck = this.levelSession?.players?.[slot]?.deck;
    const hasCoopDeck = Array.isArray(coopDeck) && coopDeck.length > 0;
    const hasSessionDeck = Array.isArray(this.levelSession.deck);
    const sourceDeck = hasCoopDeck
      ? coopDeck
      : hasSessionDeck
        ? this.levelSession.deck
        : CARD_DEFINITIONS;
    const source = sourceDeck
      .filter((card) => !card.lootOnly && !card.retired)
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
    if ((hasSessionDeck || hasCoopDeck) && options.allowAllFallback !== true) return [];
    return CARD_DEFINITIONS
      .filter((card) => !card.lootOnly && !card.retired)
      .filter((card) => !options.kind || card.kind === options.kind)
      .filter((card) => !options.excludeKinds?.includes(card.kind))
      .map((card) => this.cardSystem?.applyRuntimeCardLevel?.(card) ?? card);
  }

  waveRewardDeckIds(slot = this.activeEconomySlot ?? this.localPlayerSlot) {
    const run = this.players?.[slot];
    if (run) {
      if (!Array.isArray(run.waveRewardDeck)) {
        run.waveRewardDeck = createWaveRewardDeckIds(run.deck, CARD_DEFINITIONS);
      }
      return run.waveRewardDeck;
    }
    if (!Array.isArray(this.waveRewardDeck)) {
      this.waveRewardDeck = createWaveRewardDeckIds(this.levelSession.deck, CARD_DEFINITIONS);
    }
    return this.waveRewardDeck;
  }

  waveRewardCardPool(options = {}) {
    const slot = this.activeEconomySlot ?? this.localPlayerSlot;
    const remaining = this.waveRewardDeckIds(slot);
    if (!remaining.length) return [];
    const remainingIds = new Set(remaining);
    const selectedCards = this.selectedCardPool({
      ...options,
      allowAllFallback: false
    });
    const unitCards = waveRewardUnitCards(CARD_DEFINITIONS).map((card) => {
      const leveledCard = {
        ...card,
        level: this.openingUnitCardLevel(card.id)
      };
      return this.cardSystem?.applyRuntimeCardLevel?.(leveledCard) ?? leveledCard;
    });
    // 波次奖励不再发放单位专精卡牌（兵种专精仅经由祭坛三选一获取）。
    const seen = new Set();
    return [...selectedCards, ...unitCards].filter((card) => {
      if (!card?.id || seen.has(card.id) || !remainingIds.has(card.id)) return false;
      seen.add(card.id);
      return true;
    });
  }

  unitSpecializationRewardCards(slot = this.activeEconomySlot ?? this.localPlayerSlot) {
    // 已从波次奖励移除：单位专精卡牌不再进入波次奖励牌池。
    void slot;
    return [];
  }

  unlockUnitSpecializationRewardCards(unitType, slot = this.activeEconomySlot ?? this.localPlayerSlot) {
    // 已从波次奖励移除：获得单位卡不再解锁单位专精奖励卡。
    void unitType;
    void slot;
    return 0;
  }

  consumeWaveRewardCard(card) {
    const cardId = card?.cardDefinitionId ?? card?.id;
    if (!cardId) return false;
    const remaining = this.waveRewardDeckIds();
    const index = remaining.indexOf(cardId);
    if (index < 0) return false;
    remaining.splice(index, 1);
    const cachedUnitOffers = this.runShopPendingOffers?.unit;
    if (cachedUnitOffers?.some((choice) => (
      (choice?.card?.id ?? choice?.card?.cardDefinitionId) === cardId
    ))) {
      // 免费军需奖励会保留当前三选一。若其他奖励先消耗了其中一张，
      // 必须废弃整组报价，避免仍选到已经离池的卡牌。
      delete this.runShopPendingOffers.unit;
    }
    const slot = this.activeEconomySlot ?? this.localPlayerSlot;
    this.networkBridge?.markPrivateStateDirty?.(slot);
    return true;
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
    return this.openingRewardChoices(sourcePool, { action, actionLabel });
  }

  // 开局指定种类（能力 / 地形）的三选一候选池：优先本局出战牌组里的该类卡；
  // 牌组里该类不足三张时用全部同名卡补足，保证开局永远是三选一。
  // terrainOnly 时按地形牌规则筛选（isTerrainCard），不能把所有法术都当成地形卡。
  openingKindPool(kind, { terrainOnly = false } = {}) {
    const matches = (card) => {
      if (kind && card.kind !== kind) return false;
      if (terrainOnly && !isTerrainCard(card)) return false;
      return true;
    };
    const deckPool = this.selectedCardPool({ kind, allowAllFallback: false }).filter(matches);
    if (deckPool.length >= STRATEGY_CHOICE_COUNT) return deckPool;
    const catalogue = CARD_DEFINITIONS
      .filter((card) => !card.lootOnly && !card.retired)
      .filter(matches)
      .map((card) => this.cardSystem?.applyRuntimeCardLevel?.(card) ?? card);
    return catalogue.length > deckPool.length ? catalogue : deckPool;
  }

  openingKindChoices({ kind, terrainOnly = false, pool, action, actionLabel }) {
    const sourcePool = (pool ?? []).filter((card) => {
      if (kind && card.kind !== kind) return false;
      if (terrainOnly && !isTerrainCard(card)) return false;
      return true;
    });
    return this.openingRewardChoices(sourcePool, { action, actionLabel });
  }

  openingRewardChoices(pool, { action = 'add-card', actionLabel = '加入牌堆' } = {}) {
    if (!pool?.length) return [];
    return pickRandomItems(pool, STRATEGY_CHOICE_COUNT).map((card) => {
      // 开局奖励沿用玩家在该卡上的升级等级（无尽模式统一 Lv.1）。
      const leveledCard = {
        ...card,
        level: Math.max(
          1,
          Math.floor(Number(card?.level) || 1),
          this.openingUnitCardLevel(card.id)
        )
      };
      const resolvedCard = this.cardSystem?.applyRuntimeCardLevel?.(leveledCard) ?? leveledCard;
      return {
        action,
        actionLabel,
        card: resolvedCard,
        title: resolvedCard.name,
        description: resolvedCard.summary
      };
    });
  }

  openingUnitCardLevel(cardId) {
    if (!cardId || this.isEndlessMode()) return 1;
    const sharedPlayerLevel = Object.values(this.levelSession?.players ?? {}).reduce(
      (highest, player) => Math.max(
        highest,
        Math.floor(Number(player?.cardLevels?.[cardId]) || 1)
      ),
      1
    );
    const localLevel = Math.floor(Number(this.levelSession?.cardLevels?.[cardId]) || 1);
    return Math.max(1, sharedPlayerLevel, localLevel);
  }

  genericTrainingRewardChoices() {
    return UNIT_GENERIC_UPGRADES.map((upgrade) => this.createTeamGenericUpgradeChoice(upgrade));
  }

  createCardWaveRewardChoices() {
    const trainingChoices = this.genericTrainingRewardChoices().map((choice) => (
      this.createPlayableTrainingCardChoice(choice)
    ));
    const candidates = createWaveRewardCandidateEntries(
      this.waveRewardCardPool(),
      trainingChoices
    );
    return pickRandomItems(candidates, STRATEGY_CHOICE_COUNT);
  }

  createPlayableTrainingCardChoice(choice) {
    if (choice.action === 'apply-team-upgrade') {
      return {
        action: 'add-card',
        actionLabel: '获得训练卡',
        title: choice.title,
        description: choice.description,
        card: {
          ...choice.card,
          target: 'none',
          exhaust: true,
          effect: {
            type: 'apply-team-generic-upgrade',
            upgrade: choice.upgrade
          }
        }
      };
    }
    if (choice.action === 'apply-team-special-upgrade') {
      return {
        action: 'add-card',
        actionLabel: '获得专精卡',
        title: choice.title,
        description: choice.description,
        card: {
          ...choice.card,
          unitType: choice.unitType,
          target: 'none',
          exhaust: true,
          effect: {
            type: 'apply-team-special-upgrade',
            unitType: choice.unitType,
            upgrade: choice.upgrade
          }
        }
      };
    }
    return choice;
  }

  createWaveRewardOptionChoices() {
    return this.createCardWaveRewardChoices();
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

  buildTraitUpgradeChoicePool({ includeAllUnitTypes = false } = {}) {
    const choices = [];
    const acquiredTypes = this.acquiredUnitTypes();
    const deckTypes = this.deckUnitTypes();
    const allTypes = includeAllUnitTypes ? Object.keys(UNIT_SPECIAL_UPGRADES) : [];
    const orderedTypes = [...new Set([...acquiredTypes, ...deckTypes, ...allTypes])];
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

  acquiredUnitTypes() {
    const slot = this.activeEconomySlot ?? this.localPlayerSlot;
    const types = new Set(this.acquiredUnitCardTypesFor(slot));
    const addCardUnitType = (card) => {
      if (card?.kind !== 'summon' || !card.unitType) return;
      types.add(card.unitType);
      this.recordAcquiredUnitCard(card, slot);
    };
    // Persist unit cards while they are still visible, before one-use summons
    // leave the deck. Living units remain valid altar-specialization candidates,
    // but only actually acquired summon cards unlock wave-reward specializations.
    this.cardSystem?.activeRunCards?.().forEach(addCardUnitType);
    this.friendlyUnits?.forEach((unit) => {
      if (!unit?.alive || unit.isWildlife || !unit.type) return;
      if (!this.unitBelongsToPlayer(unit, slot)) return;
      types.add(unit.type);
    });
    return types;
  }

  acquiredUnitCardTypesFor(slot = this.activeEconomySlot ?? this.localPlayerSlot) {
    const run = this.players?.[slot];
    if (run) {
      if (!(run.acquiredUnitCardTypes instanceof Set)) run.acquiredUnitCardTypes = new Set();
      return run.acquiredUnitCardTypes;
    }
    if (!(this.acquiredUnitCardTypes instanceof Set)) this.acquiredUnitCardTypes = new Set();
    return this.acquiredUnitCardTypes;
  }

  recordAcquiredUnitCard(card, slot = this.activeEconomySlot ?? this.localPlayerSlot) {
    if (card?.kind !== 'summon') return false;
    return this.recordAcquiredUnitType(card?.unitType, slot);
  }

  recordAcquiredUnitType(unitType, slot = this.activeEconomySlot ?? this.localPlayerSlot) {
    if (!unitType) return false;
    const types = this.acquiredUnitCardTypesFor(slot);
    const before = types.size;
    types.add(unitType);
    const added = types.size !== before;
    // 单位专精卡已从波次奖励中移除：获得单位卡不再向波次奖励牌组解锁专精卡。
    return added;
  }

  teamSpecialUpgradeMapForSlot(slot = this.activeEconomySlot ?? this.localPlayerSlot) {
    return this.players?.[slot]?.teamSpecialUpgrades ?? this.teamSpecialUpgrades;
  }

  getEnergyPanelSpecializationIcons(slot = this.localPlayerSlot) {
    const upgradesByType = this.teamSpecialUpgradeMapForSlot(slot);
    if (!upgradesByType?.size) return [];
    const icons = [];
    upgradesByType.forEach((upgradeIds, unitType) => {
      if (!upgradeIds?.size) return;
      const unitName = UNIT_DEFINITIONS[unitType]?.name ?? unitType;
      [...upgradeIds].forEach((upgradeId) => {
        const upgrade = runtimeUnitUpgradeDefinition(unitType, upgradeId);
        if (!upgrade) return;
        icons.push({
          id: `special:${unitType}:${upgrade.id}`,
          kind: 'specialization',
          name: `${unitName}·${upgrade.name}`,
          label: unitName.slice(0, 1) || '专',
          badge: '专',
          color: specializationIconColor(unitType),
          summary: upgrade.summary ?? ''
        });
      });
    });
    return icons;
  }

  createTeamGenericUpgradeChoice(upgrade) {
    const stacks = this.teamGenericUpgradeCounts.get(upgrade.id) ?? 0;
    return {
      action: 'apply-team-upgrade',
      actionLabel: '己方强化',
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
          ? `${upgrade.summary}（已叠加 ${stacks} 次，立即对己方部队生效）`
          : `${upgrade.summary}（立即对己方现有与后续单位生效）`,
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
        id: unitSpecializationRewardCardId(unitType, upgrade.id),
        name: `${unitName}·${upgrade.name}`,
        kind: 'ability',
        label: '专',
        artKey: unitType,
        summary: `己方所有${unitName}获得：${upgrade.summary}`,
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
    const slot = this.activeEconomySlot ?? this.localPlayerSlot;
    const feedback = teamUpgradeFeedbackVisual(upgrade);
    this.friendlyUnits.forEach((unit) => {
      if (!unit.alive || unit.isWildlife) return;
      if (!this.unitBelongsToPlayer(unit, slot)) return;
      if (this.applyTeamGenericUpgradeLayerToUnit(unit, upgrade, nextIndex)) {
        this.showUnitUpgradeFeedback(unit, feedback);
      }
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
    this.consumeWaveRewardCard({
      id: unitSpecializationRewardCardId(unitType, upgrade.id)
    });
    const slot = this.activeEconomySlot ?? this.localPlayerSlot;
    const feedback = {
      text: upgrade.name,
      color: specializationIconColor(unitType)
    };
    this.friendlyUnits.forEach((unit) => {
      if (!unit.alive || unit.isWildlife || unit.type !== unitType) return;
      if (!this.unitBelongsToPlayer(unit, slot)) return;
      if (this.applyTeamSpecialUpgradeToUnit(unit, upgrade)) {
        this.showUnitUpgradeFeedback(unit, feedback);
      }
    });
    if (upgrade.supportModifiers) this.teamSupportModifiersApplied.add(upgrade.id);
    this.abilitiesFor(slot)?.updateUi?.();
    return true;
  }

  applyTeamGenericUpgradeLayerToUnit(unit, upgrade, index = 0) {
    const previousMaxHealth = unit.maxHealth;
    const previousMaxDurability = unit.weapon.maxDurability;
    const modifiers = unitGenericUpgradeModifiers(unit, upgrade, index);
    if (!modifiers.length) return false;
    unit.attributes.addModifiers(modifiers, `team:${upgrade.id}:${index}`);
    if (modifiersAffectHealthOrDurability(modifiers)) {
      syncUnitAfterMaxHealthModifiers(unit, previousMaxHealth, previousMaxDurability);
    }
    unit.clampToAttributeCaps();
    unit.statusUiDirty = true;
    return true;
  }

  applyTeamSpecialUpgradeToUnit(unit, upgrade) {
    unit.runtimeUpgradeIds = unit.runtimeUpgradeIds ?? new Set();
    unit.runtimeTraits = unit.runtimeTraits ?? new Set();
    if (unit.runtimeUpgradeIds.has(upgrade.id)) return false;
    unit.runtimeUpgradeIds.add(upgrade.id);
    if (upgrade.trait) unit.runtimeTraits.add(upgrade.trait);
    if (upgrade.supportModifiers) applySupportUpgrade(unit, upgrade.supportModifiers);
    if (upgrade.modifiers?.length) {
      const previousMaxHealth = unit.maxHealth;
      const previousMaxDurability = unit.weapon.maxDurability;
      unit.attributes.addModifiers(upgrade.modifiers, `team:${upgrade.id}`);
      if (modifiersAffectHealthOrDurability(upgrade.modifiers)) {
        syncUnitAfterMaxHealthModifiers(unit, previousMaxHealth, previousMaxDurability);
      }
    }
    unit.clampToAttributeCaps();
    unit.statusUiDirty = true;
    return true;
  }

  showUnitUpgradeFeedback(unit, feedback = {}) {
    if (!unit?.position) return false;
    const color = feedback.color ?? '#ffd166';
    const height = Math.max(1, unit.projectileHitHeight ?? 1.55);
    this.effects?.spawnUnitUpgrade?.(unit.position, {
      color,
      radius: Math.max(0.68, (unit.collisionRadius ?? 0.45) * 1.7),
      height,
      duration: 0.9
    });
    this.effects?.spawnDamageNumber?.(unit.position, 1, {
      text: feedback.text ?? '单位强化',
      color,
      height: height + 0.5,
      duration: 1.05,
      fontSize: 92,
      baseHeight: 0.54,
      fadeStart: 0.64
    });
    return true;
  }

  applyTeamUpgradesToUnit(unit) {
    if (!unit || unit.isWildlife) return;
    const slot = this.activeEconomySlot ?? this.localPlayerSlot;
    if (!this.unitBelongsToPlayer(unit, slot)) return;
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
    return pickAltarSpecializationChoices(
      pool,
      this.acquiredUnitTypes(),
      Math.min(STRATEGY_CHOICE_COUNT, pool.length)
    );
  }

  createMaintenanceChoices() {
    return this.createAttributeUpgradeChoices();
  }

  activeRunCardInstances() {
    return this.cardSystem?.activeRunCards?.() ?? [];
  }

  runShopOwnedCards() {
    const seen = new Set();
    return (this.cardSystem?.runShopCards?.() ?? []).filter((card) => {
      if (!card?.id || seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    }).sort((a, b) => cardSortKey(a).localeCompare(cardSortKey(b), 'zh-Hans-CN'));
  }

  createRunShopOwnedPickerChoices(action, actionLabel, descriptionSuffix) {
    return this.runShopOwnedCards().map((card) => {
      return {
        action,
        actionLabel,
        compactActionLabel: actionLabel.replace('卡牌', ''),
        title: card.name,
        compactPicker: true,
        description: card.summary ?? descriptionSuffix ?? '',
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
      return this.randomCardChoices({
        pool: this.selectedCardPool({ allowAllFallback: true }),
        action: 'add-card',
        actionLabel: '加入牌堆'
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
      const summary = appendCoopRewardCountdown(
        event.summary ?? '',
        event.autoSelectSecondsRemaining ?? this.coopRewardAutoSelectSecondsRemaining,
        '超时将自动选择一项。'
      );
      this.strategyEventUi.summary.textContent = summary;
      this.strategyEventUi.summary.hidden = !summary;
    }
    if (event.exhausted) {
      this.strategyEventUi.choices.innerHTML = '<p class="strategy-event-exhausted">牌已发光：本局波次奖励的发牌池已用完。</p>';
    } else {
      this.strategyEventUi.choices.innerHTML = event.choices
        .map((choice, index) => strategyRewardMarkup(choice, index))
        .join('');
    }
    fitStrategyRewardCards(this.strategyEventUi.choices);
    this.renderStrategyEventActions(event);
  }

  getStrategyRewardRerollCost() {
    return STRATEGY_REWARD_REROLL_SILVER_COST;
  }

  resetStrategyRewardRerollForEvent(type) {
    if (type === 'wave-reward') this.strategyRewardRerollCount = 0;
  }

  rerollStrategyRewardChoices(options = {}) {
    const shouldRender = options.render !== false;
    const event = this.strategyEvent;
    if (!event || event.type !== 'wave-reward') return false;
    const cost = this.getStrategyRewardRerollCost();
    if (this.getSilver() + 0.001 < cost) return false;
    const choices = this.createCardWaveRewardChoices();
    if (!choices.length) return false;
    this.setSilver(this.getSilver() - cost);
    this.strategyRewardRerollCount = Math.max(0, (this.strategyRewardRerollCount ?? 0) + 1);
    event.choices = choices;
    if (shouldRender) {
      this.renderStrategyEvent();
      this.updateHud(0);
    }
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
    if (event.exhausted) {
      // 牌已发光：无需重新随机，仅保留放弃奖励（等待其他玩家/继续）。
      actions.hidden = false;
      actions.innerHTML = `
        <button class="strategy-event-action is-skip" type="button" data-strategy-action="skip">
          <span class="strategy-event-action-label">放弃奖励</span>
          <strong>直接进入下一波</strong>
        </button>
      `;
      return;
    }
    const rerollCost = this.getStrategyRewardRerollCost();
    const currentSilver = Math.max(0, this.getSilver());
    const canAffordReroll = currentSilver + 0.001 >= rerollCost;
    const rerollCount = Math.max(0, this.strategyRewardRerollCount ?? 0);
    const rerollCostLabel = `${rerollCost} 银币`;
    const rerollLabel = rerollCount === 0 ? '重新随机' : `重新随机 · 已刷新 ${rerollCount} 次`;
    const remainingSilverLabel = `当前剩余 ${formatSilverAmount(currentSilver)} 银币`;
    actions.hidden = false;
    actions.innerHTML = `
      <button
        class="strategy-event-action is-reroll${canAffordReroll ? '' : ' is-disabled'}"
        type="button"
        data-strategy-action="reroll"
        ${canAffordReroll ? '' : 'disabled aria-disabled="true"'}
      >
        <span class="strategy-event-action-label">${rerollLabel}</span>
        <strong>${rerollCostLabel}</strong>
        <small class="strategy-event-reroll-balance">${remainingSilverLabel}</small>
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
      if (this.networkBridge?.shouldRouteLocalCommands?.()) {
        if (action === 'reroll' && !actionButton.disabled) {
          const cost = this.getStrategyRewardRerollCost();
          if (this.getSilver() + 0.001 < cost) {
            this.cardSystem?.setHint?.('银币不足，无法刷新波次奖励', 'network-command');
            return;
          }
          const sent = this.networkBridge?.commandSender?.strategyReroll?.();
          if (!sent) this.cardSystem?.setHint?.('刷新请求未发送，请等待联机状态同步后重试', 'network-command');
        } else if (action === 'skip') {
          const sent = this.networkBridge?.commandSender?.strategySkip?.();
          if (sent) {
            // 本地乐观反馈：立即进入等待，不等 Host 回执
            this.showCoopRewardWaitingUi();
          } else {
            this.cardSystem?.setHint?.('跳过请求未发送，请等待联机状态同步后重试', 'network-command');
          }
        }
        return;
      }
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
    if (this.networkBridge?.shouldRouteLocalCommands?.()) {
      const sent = this.networkBridge?.commandSender?.strategyChoose?.(index);
      if (sent) {
        // 本地乐观反馈：选完立即进入等待，不等 Host 回执（Host 确认后由
        // ui_state 同步最终状态；若命令被拒会收到提示并可重新选择）。
        this.showCoopRewardWaitingUi();
      } else {
        this.cardSystem?.setHint?.('选择请求未发送，请等待联机状态同步后重试', 'network-command');
      }
      return;
    }
    const choice = this.strategyEvent.choices[index];
    if (!choice || button.disabled) return;
    if (!this.applyStrategyChoice(choice)) return;
    this.finishStrategyReward();
  }

  applyStrategyChoice(choice) {
    let applied = false;
    if (choice.action === 'grant-opening-unit-card') {
      const unitType = choice.card?.unitType;
      if (!unitType) return false;
      const result = this.cardSystem.addCardToDrawPile(choice.card, {
        prefix: `opening-${choice.card.id}-${Date.now()}`
      });
      if (result.added) this.heroUnitType = unitType;
      applied = result.added;
    } else if (choice.action === 'add-card') {
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
    const rewardEventType = this.strategyEvent?.type ?? null;
    if (choice.rewardSource === 'wave-reward-deck' || rewardEventType === 'wave-reward') {
      const remainingWaveRewardIds = this.waveRewardDeckIds();
      if (shouldConsumeWaveRewardCard(choice, rewardEventType, remainingWaveRewardIds)) {
        this.consumeWaveRewardCard(choice.card);
      }
    }
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
    const text = renderTuningExportText(this.renderTuning, this.worldConfig, this.camera, this.cameraTarget);
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
      if (settings.shadowIntensity !== undefined && sun.shadow) {
        sun.shadow.intensity = settings.shadowIntensity;
      }
    }
    if (this.bloomPass && settings.bloomStrength !== undefined) {
      this.bloomPass.strength = settings.bloomStrength;
    }
    if (this.vignettePass) {
      this.vignettePass.uniforms.strength.value = settings.vignetteStrength;
    }
    this.world?.setMaterialColors?.({
      snow: settings.snowColor,
      rock: settings.rockColor,
      tree: settings.treeColor
    });
    const hemisphere = this.world?.lights?.hemisphere;
    if (hemisphere) {
      hemisphere.color.set(settings.hemiSky);
      hemisphere.groundColor.set(settings.hemiGround);
      hemisphere.intensity = settings.hemiIntensity;
    }
    const ambient = this.world?.lights?.ambient;
    if (ambient) {
      ambient.color.set(settings.ambientColor || '#8FAFD0');
      ambient.intensity = settings.ambientIntensity || 0.4;
    }
    if (this.scene) {
      this.scene.background = new THREE.Color(settings.background);
      if (this.scene.fog) {
        this.scene.fog.color.set(settings.fogColor);
        this.applyCameraFogRange(settings);
      }
    }
    if (this.saoPass) {
      this.saoPass.params.saoIntensity = settings.aoIntensity;
      this.saoPass.params.saoScale = settings.aoScale;
      this.saoPass.params.saoKernelRadius = settings.aoKernelRadius;
      this.saoPass.params.saoBias = settings.aoBias;
    }
    if (this.outlinePass) {
      this.outlinePass.uniforms.outlineThickness.value = settings.outlineThickness;
      this.outlinePass.uniforms.outlineColor.value.set(settings.outlineColor);
      this.outlinePass.uniforms.outlineThreshold.value = settings.outlineThreshold;
    }
    if (this.world?.config?.sky) {
      Object.assign(this.world.config.sky, {
        toneMapping: settings.toneMapping,
        exposure: settings.exposure,
        sun: settings.sunColor,
        sunIntensity: settings.sunIntensity,
        sunPosition: { x: settings.sunX, y: settings.sunY, z: settings.sunZ },
        shadowIntensity: settings.shadowIntensity,
        hemiSky: settings.hemiSky,
        hemiGround: settings.hemiGround,
        hemiIntensity: settings.hemiIntensity,
        fog: settings.fogColor,
        fogNear: settings.fogNear,
        fogFar: settings.fogFar,
        background: settings.background
      });
    }
    const safeFilterValue = (value, fallback = 1) => {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    };
    this.canvas.style.filter = [
      `brightness(${safeFilterValue(settings.brightness)})`,
      `contrast(${safeFilterValue(settings.contrast)})`,
      `saturate(${safeFilterValue(settings.saturation)})`,
      `hue-rotate(${safeFilterValue(settings.hue, 0)}deg)`,
      `sepia(${safeFilterValue(settings.warmth, 0)})`
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
      ui.exportText.textContent = renderTuningExportText(settings, this.worldConfig, this.camera, this.cameraTarget);
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
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.outlinePass) {
      this.outlinePass.uniforms.aspect.value.set(width, height);
    }
    this.world?.update?.(0, this.cameraTarget, this.camera, { forceStaticCulling: true });
    this.updateWavePreview();
  }

  restoreWebglContext() {
    if (this.destroyed || document.hidden || this.renderer?.getContext?.().isContextLost?.()) return;
    this.webglContextLost = false;
    this.lastAnimationFrameTime = null;
    this.clock?.getDelta?.();
    this.renderer.setPixelRatio(this.renderQuality?.pixelRatio ?? this.renderer.getPixelRatio());
    this.resize();
    // EffectComposer owns off-screen buffers which are not reliable after a
    // mobile browser has suspended or restored WebGL. A resized first frame
    // forces every pass to recreate them before the regular loop resumes.
    this.renderScene();
  }

  renderScene() {
    if (this.webglContextLost || this.renderer?.getContext?.().isContextLost?.()) return;
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
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
    const initialPosition = config.initialPosition;
    if (
      Number.isFinite(initialPosition?.x)
      && Number.isFinite(initialPosition?.y)
      && Number.isFinite(initialPosition?.z)
    ) {
      this.camera.position.set(initialPosition.x, initialPosition.y, initialPosition.z);
      this.cameraOffsetDirection.copy(this.camera.position).sub(this.cameraTarget);
      const initialDistance = this.cameraOffsetDirection.length();
      if (initialDistance > 0.001) {
        this.cameraOffsetDirection.multiplyScalar(1 / initialDistance);
        this.cameraDistance = initialDistance;
      }
    }
    this.updateCamera(0);
  }

  updateCamera(dt) {
    this.applyCameraFollowTarget();
    this.applyCameraDragDelta();
    this.applyKeyboardCameraMovement(dt);
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

  applyKeyboardCameraMovement(dt) {
    const delta = cameraKeyboardPanDelta(
      this.cameraMoveKeys,
      this.cameraOffsetDirection,
      this.cameraDistance,
      dt
    );
    if (!delta) return;
    this.cameraTarget.x += delta.x;
    this.cameraTarget.z += delta.z;
    this.clampCameraTarget();
  }

  applyCameraFollowTarget() {
    if (!this.cameraFollowEnabled) return false;
    const center = cameraFollowCenter(this.selectedUnits);
    if (!center) {
      this.setCameraFollowEnabled(false);
      return false;
    }
    this.cameraTarget.x = center.x;
    this.cameraTarget.z = center.z;
    this.clampCameraTarget();
    return true;
  }

  setCameraFollowEnabled(enabled) {
    const next = Boolean(enabled && cameraFollowCenter(this.selectedUnits));
    this.cameraFollowEnabled = next;
    if (next) this.applyCameraFollowTarget();
    this.syncCameraFollowUi();
    return next;
  }

  toggleCameraFollow() {
    return this.setCameraFollowEnabled(!this.cameraFollowEnabled);
  }

  syncCameraFollowUi() {
    const button = this.dom?.cameraFollowButton;
    if (!button) return;
    const hasSelection = Boolean(cameraFollowCenter(this.selectedUnits));
    button.hidden = !hasSelection;
    button.classList.toggle('is-active', this.cameraFollowEnabled);
    button.setAttribute('aria-pressed', this.cameraFollowEnabled ? 'true' : 'false');
    button.textContent = this.cameraFollowEnabled ? '停止跟随' : '跟随镜头';
  }

  // 关卡的可行进范围：优先取世界配置里的 navigationBounds，没有才回退到全局
  // BALANCE.battlefield。海岛这类比旧走廊大得多的地图如果继续用 ±42 / −40..40，
  // 镜头、信标落点、单位落点和击退都会被悄悄裁到中间一小块。
  battlefieldBounds() {
    const nav = this.world?.config?.navigationBounds ?? this.worldConfig?.navigationBounds;
    if (nav && Number.isFinite(nav.minX) && Number.isFinite(nav.maxX)) {
      return {
        minX: nav.minX,
        maxX: nav.maxX,
        minZ: nav.minZ,
        maxZ: nav.maxZ
      };
    }
    const legacy = BALANCE.battlefield;
    return {
      minX: -legacy.halfWidth,
      maxX: legacy.halfWidth,
      minZ: legacy.minZ,
      maxZ: legacy.maxZ
    };
  }

  clampCameraTarget() {
    const margin = 4;
    const bounds = this.battlefieldBounds();
    this.cameraTarget.x = clamp(
      this.cameraTarget.x,
      bounds.minX + margin,
      bounds.maxX - margin
    );
    this.cameraTarget.z = clamp(
      this.cameraTarget.z,
      bounds.minZ + margin,
      bounds.maxZ - margin
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

  registerUnit(unit, options = {}) {
    unit.game = this;
    if (this.coop?.enabled && unit.team === TEAMS.PLAYER && !unit.ownerPlayerId) {
      unit.ownerPlayerId = this.localPlayerSlot;
    }
    if (unit.team === TEAMS.PLAYER && !unit.controllerPlayerId) {
      unit.controllerPlayerId = unit.ownerPlayerId ?? this.localPlayerSlot;
    }
    this.applyUnitPlayerColor(unit);
    return this.unitRegistry.register(unit, options);
  }

  applyUnitPlayerColor(unit, explicitIndex = null) {
    if (!unit?.statusElement || unit.team !== TEAMS.PLAYER) return;
    const playerId = unit.controllerPlayerId ?? unit.ownerPlayerId;
    const colorIndex = this.playerColorIndexFor(playerId, explicitIndex);
    unit.playerColorIndex = colorIndex;
    unit.statusElement.dataset.playerColorIndex = String(colorIndex);
    this.applyUnitPlayerName(unit);
  }

  applyUnitPlayerName(unit) {
    const label = unit?.statusElement?.parts?.playerName;
    if (!label) return;
    const playerId = unit.controllerPlayerId ?? unit.ownerPlayerId;
    const playerName = this.coop?.enabled
      ? resolveUnitPlayerName(this.levelSession, playerId)
      : '';
    label.textContent = playerName;
    label.hidden = playerName.length === 0;
  }

  playerColorIndexFor(playerId, explicitIndex = null) {
    if (Number.isInteger(explicitIndex)) return Math.max(0, Math.min(3, explicitIndex));
    const descriptors = this.levelSession?.matchRules?.players ?? [];
    const descriptorOrder = descriptors.find((player) => player.playerId === playerId)?.order;
    const fallbackOrder = Object.keys(this.players ?? {}).indexOf(playerId);
    const rawIndex = Number.isInteger(descriptorOrder) ? descriptorOrder : fallbackOrder;
    const order = rawIndex < 0 ? 0 : rawIndex;
    return order <= 0 ? 0 : 1 + ((order - 1) % 3);
  }

  playerVisualColor(playerOrUnit = this.localPlayerSlot) {
    const isUnit = typeof playerOrUnit === 'object' && playerOrUnit !== null;
    const playerId = isUnit
      ? (playerOrUnit.controllerPlayerId ?? playerOrUnit.ownerPlayerId)
      : playerOrUnit;
    const explicitIndex = isUnit ? playerOrUnit.playerColorIndex : null;
    return PLAYER_VISUAL_COLORS[this.playerColorIndexFor(playerId, explicitIndex)] ?? PLAYER_VISUAL_COLORS[0];
  }

  updateCardSystems(dt) {
    if (this.cardSystems) {
      Object.values(this.cardSystems).forEach((system) => system.update(dt));
      return;
    }
    this.cardSystem.update(dt);
  }

  updateAbilitySystems(dt) {
    if (this.abilitySystems) {
      Object.values(this.abilitySystems).forEach((system) => system.update(dt));
      return;
    }
    this.abilities?.update?.(dt);
  }

  updateBaseRecoveryPact(dt = 0) {
    const base = this.playerBase;
    if (!base?.attributes) return;
    const active = this.coopPlayerSlots().some((slot) => (
      this.getAbilityStacks(BASE_RECOVERY_PACT_ABILITY_ID, slot) > 0
    ));
    if (!active) {
      if (base.baseRecoveryPactActive) {
        base.attributes.removeModifiersBySource(BASE_RECOVERY_PACT_SOURCE);
        base.baseRecoveryPactActive = false;
        base.baseRecoveryPactTimer = 0;
        this.updateStructureStatusElement(base, 0);
      }
      return;
    }
    if (!base.baseRecoveryPactActive) {
      base.attributes.addModifiers([
        { stat: 'maxHealth', type: 'multiply', amount: BASE_RECOVERY_PACT_MAX_HEALTH_FACTOR }
      ], BASE_RECOVERY_PACT_SOURCE);
      base.health = Math.min(base.health, base.maxHealth);
      base.baseRecoveryPactActive = true;
      base.baseRecoveryPactTimer = BASE_RECOVERY_PACT_INTERVAL_SECONDS;
      this.updateStructureStatusElement(base, 0);
    }
    if (!base.alive || this.levelFinished) return;
    base.baseRecoveryPactTimer = Math.max(0, (base.baseRecoveryPactTimer ?? BASE_RECOVERY_PACT_INTERVAL_SECONDS) - Math.max(0, dt));
    while (base.baseRecoveryPactTimer <= 0) {
      this.repairStructure(base, { health: 1, durability: 1 });
      base.baseRecoveryPactTimer += BASE_RECOVERY_PACT_INTERVAL_SECONDS;
    }
  }

  getSilver(slot = this.activeEconomySlot ?? this.localPlayerSlot) {
    if (this.players?.[slot]) return this.players[slot].silver;
    return this.silver;
  }

  setSilver(value, slot = this.activeEconomySlot ?? this.localPlayerSlot) {
    const next = Math.max(0, value);
    if (this.players?.[slot]) {
      const isActiveEconomyContext = slot === (this.activeEconomySlot ?? this.localPlayerSlot);
      if (this.players[slot].silver === next) {
        if (slot === this.localPlayerSlot || isActiveEconomyContext) this.silver = next;
        return;
      }
      this.players[slot].silver = next;
      if (slot === this.localPlayerSlot || isActiveEconomyContext) this.silver = next;
      this.networkBridge?.markPrivateStateDirty?.(slot);
      return;
    }
    if (this.silver === next) return;
    this.silver = next;
    this.networkBridge?.markPrivateStateDirty?.(slot);
  }

  addSilver(amount, slot = this.activeEconomySlot ?? this.localPlayerSlot) {
    this.setSilver(this.getSilver(slot) + amount, slot);
  }

  withPlayerContext(slot, action) {
    if (!this.players || !slot || !this.players[slot]) {
      return action();
    }
    const run = this.players[slot];
    const previous = {
      activeEconomySlot: this.activeEconomySlot,
      cardSystem: this.cardSystem,
      abilities: this.abilities,
      strategyEvent: this.strategyEvent,
      shopPrices: this.shopPrices,
      strategyRewardRerollCount: this.strategyRewardRerollCount,
      runShopFreeReward: this.runShopFreeReward,
      runShopActiveCategory: this.runShopActiveCategory,
      runShopChoices: this.runShopChoices,
      runShopPendingOffers: this.runShopPendingOffers,
      runShopItems: this.runShopItems,
      runShopPrepNodeKey: this.runShopPrepNodeKey,
      runShopSpecializationClaimed: this.runShopSpecializationClaimed,
      runShopSpecializationUnitType: this.runShopSpecializationUnitType,
      runShopPrepCompleted: this.runShopPrepCompleted,
      runShopCompletedNodeKey: this.runShopCompletedNodeKey,
      silver: this.silver,
      runCardsPlayedCount: this.runCardsPlayedCount,
      waveRewardDeck: this.waveRewardDeck,
      acquiredUnitCardTypes: this.acquiredUnitCardTypes,
      teamGenericUpgradeCounts: this.teamGenericUpgradeCounts,
      teamSpecialUpgrades: this.teamSpecialUpgrades,
      teamSupportModifiersApplied: this.teamSupportModifiersApplied,
      heroUnitType: this.heroUnitType
    };
    this.activeEconomySlot = slot;
    if (this.cardSystems?.[slot]) this.cardSystem = this.cardSystems[slot];
    if (this.abilitySystems?.[slot]) this.abilities = this.abilitySystems[slot];
    this.strategyEvent = run.strategyEvent;
    this.shopPrices = run.shopPrices;
    this.strategyRewardRerollCount = run.strategyRewardRerollCount;
    this.runShopFreeReward = run.runShopFreeReward;
    this.runShopActiveCategory = run.runShopActiveCategory;
    this.runShopChoices = run.runShopChoices;
    this.runShopPendingOffers = run.runShopPendingOffers;
    this.runShopItems = run.runShopItems ?? null;
    this.runShopPrepNodeKey = run.runShopPrepNodeKey ?? null;
    this.runShopSpecializationClaimed = run.runShopSpecializationClaimed === true;
    this.runShopSpecializationUnitType = run.runShopSpecializationUnitType ?? null;
    this.runShopPrepCompleted = run.runShopPrepCompleted === true;
    this.runShopCompletedNodeKey = run.runShopCompletedNodeKey ?? null;
    // 本地槽位的「不可逆标记」以 game 为准：整备完成/专精已领这些标记大部分是在
    // withPlayerContext 之外写入 game 的，如果这里无条件用 run 的旧值覆盖，
    // 同一个 Boss 节点就会被重新打开，专精可以再领一次、售罄商品也会重置。
    // 网络客户端例外：那里的 run 是 Host 下发的权威副本。
    if (slot === this.localPlayerSlot && !this.networkClientMode) {
      this.runShopSpecializationClaimed = previous.runShopSpecializationClaimed === true
        || run.runShopSpecializationClaimed === true;
      if (this.runShopSpecializationClaimed) {
        this.runShopSpecializationUnitType = previous.runShopSpecializationUnitType
          ?? run.runShopSpecializationUnitType
          ?? null;
      }
      this.runShopPrepCompleted = previous.runShopPrepCompleted === true
        || run.runShopPrepCompleted === true;
      this.runShopCompletedNodeKey = previous.runShopCompletedNodeKey
        ?? run.runShopCompletedNodeKey
        ?? null;
    }
    this.silver = run.silver;
    this.runCardsPlayedCount = run.runCardsPlayedCount ?? 0;
    this.waveRewardDeck = run.waveRewardDeck;
    this.acquiredUnitCardTypes = run.acquiredUnitCardTypes;
    this.teamGenericUpgradeCounts = run.teamGenericUpgradeCounts;
    this.teamSpecialUpgrades = run.teamSpecialUpgrades;
    this.teamSupportModifiersApplied = run.teamSupportModifiersApplied;
    this.heroUnitType = run.heroUnitType ?? null;
    try {
      return action();
    } finally {
      run.strategyEvent = this.strategyEvent;
      run.shopPrices = this.shopPrices;
      run.strategyRewardRerollCount = this.strategyRewardRerollCount;
      run.runShopFreeReward = this.runShopFreeReward;
      run.runShopActiveCategory = this.runShopActiveCategory;
      run.runShopChoices = this.runShopChoices;
      run.runShopPendingOffers = this.runShopPendingOffers;
      run.runShopItems = this.runShopItems;
      run.runShopPrepNodeKey = this.runShopPrepNodeKey;
      run.runShopSpecializationClaimed = this.runShopSpecializationClaimed;
      run.runShopSpecializationUnitType = this.runShopSpecializationUnitType;
      run.runShopPrepCompleted = this.runShopPrepCompleted;
      run.runShopCompletedNodeKey = this.runShopCompletedNodeKey;
      run.silver = this.silver;
      run.runCardsPlayedCount = this.runCardsPlayedCount;
      run.waveRewardDeck = this.waveRewardDeck;
      run.acquiredUnitCardTypes = this.acquiredUnitCardTypes;
      run.teamGenericUpgradeCounts = this.teamGenericUpgradeCounts;
      run.teamSpecialUpgrades = this.teamSpecialUpgrades;
      run.teamSupportModifiersApplied = this.teamSupportModifiersApplied;
      run.heroUnitType = this.heroUnitType;
      this.activeEconomySlot = previous.activeEconomySlot;
      this.cardSystem = previous.cardSystem;
      this.abilities = previous.abilities;
      this.strategyEvent = previous.strategyEvent;
      this.shopPrices = previous.shopPrices;
      this.strategyRewardRerollCount = previous.strategyRewardRerollCount;
      this.runShopFreeReward = previous.runShopFreeReward;
      this.runShopActiveCategory = previous.runShopActiveCategory;
      this.runShopChoices = previous.runShopChoices;
      this.runShopPendingOffers = previous.runShopPendingOffers;
      this.runShopItems = previous.runShopItems;
      this.runShopPrepNodeKey = previous.runShopPrepNodeKey;
      this.runShopSpecializationClaimed = previous.runShopSpecializationClaimed;
      this.runShopSpecializationUnitType = previous.runShopSpecializationUnitType;
      this.runShopPrepCompleted = previous.runShopPrepCompleted;
      this.runShopCompletedNodeKey = previous.runShopCompletedNodeKey;
      this.silver = previous.silver;
      this.runCardsPlayedCount = previous.runCardsPlayedCount;
      this.waveRewardDeck = previous.waveRewardDeck;
      this.acquiredUnitCardTypes = previous.acquiredUnitCardTypes;
      this.teamGenericUpgradeCounts = previous.teamGenericUpgradeCounts;
      this.teamSpecialUpgrades = previous.teamSpecialUpgrades;
      this.teamSupportModifiersApplied = previous.teamSupportModifiersApplied;
      this.heroUnitType = previous.heroUnitType;
      if (slot === this.localPlayerSlot) {
        this.strategyEvent = run.strategyEvent;
        this.strategyRewardRerollCount = run.strategyRewardRerollCount;
        this.shopPrices = run.shopPrices;
        this.runShopFreeReward = run.runShopFreeReward;
        this.runShopActiveCategory = run.runShopActiveCategory;
        this.runShopChoices = run.runShopChoices;
        this.runShopPendingOffers = run.runShopPendingOffers;
        this.runShopItems = run.runShopItems ?? null;
        this.runShopPrepNodeKey = run.runShopPrepNodeKey ?? null;
        this.runShopSpecializationClaimed = run.runShopSpecializationClaimed === true;
        this.runShopSpecializationUnitType = run.runShopSpecializationUnitType ?? null;
        this.runShopPrepCompleted = run.runShopPrepCompleted === true;
        this.runShopCompletedNodeKey = run.runShopCompletedNodeKey ?? null;
        this.silver = run.silver;
      }
    }
  }

  coopPlayerSlots() {
    return this.players ? Object.keys(this.players) : [this.localPlayerSlot];
  }

  abilitiesFor(slotOrUnit = null) {
    if (!this.abilitySystems) return this.abilities;
    if (typeof slotOrUnit === 'string') {
      return this.abilitySystems[slotOrUnit] ?? this.abilities;
    }
    const owner = slotOrUnit?.controllerPlayerId ?? slotOrUnit?.ownerPlayerId;
    if (owner && this.abilitySystems[owner]) return this.abilitySystems[owner];
    const slot = this.activeEconomySlot ?? this.localPlayerSlot;
    return this.abilitySystems[slot] ?? this.abilities;
  }

  getAbilityStacks(abilityId, slotOrUnit = null) {
    if (!this.abilitySystems) {
      return this.abilities?.getStacks?.(abilityId) ?? 0;
    }
    if (typeof slotOrUnit === 'string') {
      return this.abilitySystems[slotOrUnit]?.getStacks?.(abilityId) ?? 0;
    }
    const owner = slotOrUnit?.controllerPlayerId ?? slotOrUnit?.ownerPlayerId;
    if (owner) {
      return this.abilitySystems[owner]?.getStacks?.(abilityId) ?? 0;
    }
    const slot = this.activeEconomySlot ?? this.localPlayerSlot;
    return this.abilitySystems[slot]?.getStacks?.(abilityId) ?? 0;
  }

  unitBelongsToPlayer(unit, slot = this.activeEconomySlot ?? this.localPlayerSlot) {
    if (!unit) return false;
    if (!this.coop?.enabled) return unit.team === TEAMS.PLAYER;
    return (unit.controllerPlayerId ?? unit.ownerPlayerId) === slot;
  }

  updateSilverHud() {
    if (this.dom.silverCount) {
      this.dom.silverCount.textContent = formatSilverAmount(this.getSilver());
    }
    if (this.runShopUi?.silver) {
      this.runShopUi.silver.textContent = formatSilverAmount(this.getSilver());
    }
  }

  canControlUnit(unit) {
    if (!unit?.alive) return false;
    if (!this.coop?.enabled) return unit.team === TEAMS.PLAYER;
    return unit.team === TEAMS.PLAYER
      && (unit.controllerPlayerId ?? unit.ownerPlayerId) === this.localPlayerSlot;
  }

  canInspectUnit(unit) {
    if (!unit?.alive) return false;
    return unit.team === TEAMS.PLAYER || unit.team === TEAMS.ENEMY;
  }

  commandSelectedUnitsToPoint(point) {
    if (!point) return false;
    return this.commandSelectedUnits(point);
  }

  handleUnitDeath(unit, source = null) {
    if (!unit || unit.deathHandled) return false;
    // 刷怪点巢穴被打掉 → 永久停止该点产怪。
    // 挂钩在死亡处理里而不是轮询：轮询会重复结算进度与掉落。
    if (unit.isSpawnPointNest) {
      this.spawnPoints?.destroyPoint(unit.spawnPointId);
    }
    this.triggerSelfDestructOnDeath(unit);
    this.queueRebirthForUnit(unit, source);
    const handled = this.unitRegistry.handleDeath(unit, source);
    if (!handled) return false;
    this.updateEndlessDifficultyForDeath(unit);
    this.networkBridge?.notifyUnitDied?.(unit.id);

    if (unit?.team === TEAMS.ENEMY) {
      this.grantKillEnergy(unit, source);
      this.grantKillSilver(unit, source);
      // 魔力与能量是两种资源：只有单位击杀才结算，且均分给击杀者携带的符文石。
      this.grantKillMana(unit, source);
      // 敌方单位若真有背包或符文石，同样按方案第 7 节掉落；没有则什么也不发生。
      // 这里不是"给所有装饰武器模型自动生成战利品"——只有真实持有物才会落地。
      this.dropUnitBelongingsOnDeath(unit);
    } else if (unit?.team === TEAMS.PLAYER) {
      // 死亡掉落（方案第 7 节）：背包里的东西与身上的符文石一起落地。
      // 不再是"石头留在阵亡单位档案里"，也不自动传回基地。
      this.dropUnitBelongingsOnDeath(unit);
      // 单位阵亡时必须关掉它的符文背包，避免面板停在一个已经不存在的单位上。
      this.runeBackpack?.closeIfUnit?.(unit);
    }

    return true;
  }

  /**
   * 单位阵亡结算：清空背包 + 符文石落地 + 中断作业并释放任务预留。
   *
   * 顺序不能调换：
   *   1. 先让石头离开单位（`detachStonesOnDeath` 会顺带撤掉单位身上的附魔与成长投影）；
   *   2. 再算背包掉落（`planDeathDrop` 是清空式转移，之后背包里不再有这些物品）；
   *   3. 最后注销傀儡登记——`unregisterWorker` 会删掉系统持有的背包引用，
   *      所以必须在掉落结算之后调用，否则第 2 步就拿不到背包了。
   * 重复死亡通知由 `unit.deathHandled`（外层）与 `unit.deathDropPlanned`（这里）双重挡住。
   */
  dropUnitBelongingsOnDeath(unit) {
    if (!unit || unit.deathDropPlanned) return null;
    unit.deathDropPlanned = true;

    const position = unit.position ?? null;
    const x = position?.x ?? 0;
    const z = position?.z ?? 0;
    const ownerId = unit.controllerPlayerId ?? unit.ownerPlayerId ?? this.localPlayerSlot ?? null;
    const dropId = this.drops?.reserveId?.() ?? null;

    const stacks = [];
    // 符文石：石头是成长数据的唯一持有者，掉落搬运的是同一块实例。
    const stoneStacks = this.runeStones?.detachStonesOnDeath?.(unit, { x, z, dropId }) ?? [];
    stoneStacks.forEach((stack) => stacks.push(stack));

    // 傀儡背包里的货物与工具：已经搬进背包的跟着背包掉落，
    // 尚未取出的留在源容器（资源节点的剩余量归 ResourceNodeSystem）。
    // 傀儡的背包由作业系统持有；战斗单位的背包按需创建，
    // 死亡掉落与搬运都要能看见它，所以统一走 itemBagFor / 这里的非创建式读取。
    const inventory = unit.workerInventory ?? unit.itemBag ?? this.work?.inventoryFor?.(unit.id) ?? null;
    const planned = planDeathDrop(inventory, { dropId, alreadyDropped: false });
    planned.stacks.forEach((stack) => stacks.push(stack));

    const drop = stacks.length
      ? this.drops?.spawnFromStacks?.(stacks, { dropId, x, z, ownerId }) ?? null
      : null;

    // 中断作业并释放任务预留：`unregisterWorker` 内部会 `board.release`，
    // 否则这支傀儡占着的资源点会一直没人能接。
    if (this.work?.isWorker?.(unit)) this.work.unregisterWorker(unit);

    return { drop, stacks: stacks.length, inventoryCleared: planned.dropped === true };
  }

  /** 鼠标当前指向的己方单位（不含建筑），用于 E 键直接开背包。 */
  hoveredFriendlyUnitForBackpack() {
    const point = this.pointerScreen;
    if (!point) return null;
    const candidates = (this.friendlyUnits ?? []).filter((unit) => (
      unit?.alive && !unit.isBuilding && this.unitBelongsToPlayer(unit)
    ));
    if (!candidates.length) return null;
    // 射线为主，允许一点屏幕范围内的吸附，避免小体型单位难以对准。
    const picked = this.pickUnitFromList(candidates, point.x, point.y, { screenRadius: 30 });
    return picked?.alive && !picked.isBuilding ? picked : null;
  }

  /**
   * E 键：给鼠标指向的己方单位打开符文背包；鼠标没指向单位时用当前选中单位。
   * 既没指向也没选中单位时不打开——否则玩家不知道开的是谁的背包，只给一句提示。
   * 已经打开时再按一次 E 关闭（两个背包一起关闭）。
   */
  toggleUnitRuneBackpack() {
    if (!this.runeBackpack) return false;
    if (this.runeBackpack.isOpen()) {
      this.runeBackpack.close();
      return true;
    }
    const hovered = this.hoveredFriendlyUnitForBackpack();
    const selected = this.selectedUnit;
    const unit = hovered
      ?? (selected?.team === TEAMS.PLAYER && selected.alive ? selected : null);
    if (!unit) {
      this.cardSystem?.setHintOnce?.(
        '把鼠标对准己方单位，或先选中一个单位，再按 E 打开它的符文背包。',
        'rune-backpack'
      );
      return false;
    }
    this.runeBackpack.openForUnit(unit);
    return true;
  }

  /** B 键：打开基地背包（居中显示，只展示基地存储）。 */
  toggleBaseRuneBackpack() {
    if (!this.runeBackpack) return false;
    this.runeBackpack.toggleBase();
    return true;
  }

  /**
   * 符文背包 UI 的统一入口。联机时把动作交给 Host 校验，单机返回 null 让调用方
   * 直接走本地 RuneStoneSystem；客户端不做乐观改动，结果靠 Host 私有状态同步。
   */
  requestRuneStoneAction(payload) {
    if (!payload?.stoneId) return null;
    if (!this.networkBridge?.shouldRouteLocalCommands?.()) return null;
    const sender = this.networkBridge.commandSender;
    if (!sender) return { ok: false, reason: 'rune_stone_not_owned' };
    const sent = payload.action === 'sell'
      ? sender.runeStoneSell?.(payload.stoneId)
      : sender.runeStoneMove?.(payload.stoneId, payload.target ?? {});
    return sent ? { ok: true, pending: true } : { ok: false, reason: 'game_rule_rejected' };
  }

  /** Host 权威：执行客户端发来的符文石转移，落点与归属在这里再校验一次。 */
  applyNetworkRuneStoneMove(playerId, payload) {
    const stoneId = payload?.stoneId;
    if (!stoneId) return false;
    let target = null;
    if (payload?.targetKind === 'unit') {
      const unit = (this.friendlyUnits ?? []).find(
        (candidate) => String(candidate.id) === String(payload.targetUnitId) && candidate.alive
      );
      if (!unit) return false;
      if ((unit.controllerPlayerId ?? unit.ownerPlayerId) !== playerId) return false;
      target = { kind: 'unit', unit };
    } else {
      target = { kind: 'base', playerId };
    }
    const result = this.runeStones?.moveStone(stoneId, target, { playerId });
    if (!result?.ok) return false;
    this.runeBackpack?.refresh?.();
    return true;
  }

  /** Host 权威：出售符文石，按生成时实付能量的比例返还到该玩家的能量。 */
  applyNetworkRuneStoneSell(playerId, payload) {
    const result = this.runeStones?.sellStone(payload?.stoneId, { playerId });
    if (!result?.ok) return false;
    this.runeBackpack?.refresh?.();
    return true;
  }

  /**
   * 敌人生成时确定携带魔力：档位基础值 × 与生命/攻击同源的难度系数，之后不再重算。
   * 所有敌军生成点都应调用，包括召唤物、蜘蛛卵孵化与野生动物。
   */
  assignEnemyManaValue(unit, { isBoss = null, isElite = null } = {}) {
    if (!unit || unit.team !== TEAMS.ENEMY) return 0;
    // 没走过 applyEnemyDifficulty 的生成点（例如野生动物）按当前难度现算一份系数。
    const difficulty = this.effectiveDifficulty?.() ?? 1;
    const standard = standardEnemyStatFactors(difficulty);
    const factor = Number.isFinite(unit.manaDifficultyFactor)
      ? unit.manaDifficultyFactor
      : enemyManaFactor(standard.health, standard.damage);
    const value = manaValueForEnemy({
      isBoss: isBoss ?? unit.isBoss === true,
      isElite: isElite ?? unit.isElite === true,
      factor
    });
    unit.manaValue = value;
    return value;
  }

  /**
   * 魔力结算：敌人生成时携带的 manaValue 在击杀时授予击杀单位。
   * 法术等非单位击杀（source 不是友方单位）不产生魔力，也不会分给附近友军或基地。
   */
  grantKillMana(unit, source = null) {
    if (!unit || unit.isSilentRemoval) return 0;
    if (unit.team !== TEAMS.ENEMY) return 0;
    if (!source?.alive || source.isBuilding) return 0;
    if (source.team !== TEAMS.PLAYER) return 0;
    if (!this.unitBelongsToPlayer(source)) return 0;
    const amount = Math.max(0, Number(unit.manaValue) || 0);
    if (amount <= 0) return 0;

    const result = this.runeStones?.awardMana?.(source, amount);
    const levels = Math.max(0, Math.floor(result?.levelsGained ?? 0));
    if (levels > 0) {
      this.effects.spawnDamageNumber(source.position, 1, {
        text: `符文石 +${levels} 级`,
        color: '#c7a6ff',
        stroke: '#241536',
        height: source.projectileHitHeight ?? 1.55,
        duration: 1.05,
        fontSize: 72,
        baseHeight: 0.5
      });
    }
    return Math.max(0, Number(result?.distributed) || 0);
  }

  queueRebirthForUnit(unit, source = null) {
    if (!this.canQueueRebirthForUnit(unit)) return false;
    const enchantment = unit.enchantments.get(SELF_DESTRUCT_ENCHANTMENT_ID);
    const level = Math.max(1, Math.floor(enchantment?.level ?? 1));
    const total = autoRebirthDurationFor(this.elapsedTime, enchantment ? level : 0);
    const entry = {
      id: this.nextRebirthQueueId,
      sourceUnitId: unit.id,
      type: unit.type,
      name: unit.name ?? UNIT_DEFINITIONS[unit.type]?.name ?? unit.type,
      sourceCardId: unit.sourceCardId ?? null,
      sourceCardEnergyCost: finiteNumber(unit.sourceCardEnergyCost, null),
      ownerPlayerId: unit.ownerPlayerId ?? this.localPlayerSlot,
      controllerPlayerId: unit.controllerPlayerId ?? unit.ownerPlayerId ?? this.localPlayerSlot,
      playerColorIndex: this.playerColorIndexFor(unit.controllerPlayerId ?? unit.ownerPlayerId),
      level,
      total,
      remaining: total,
      queuedAt: this.elapsedTime,
      sourceId: source?.id ?? null,
      snapshot: this.createRebirthSnapshot(unit, level)
    };
    this.nextRebirthQueueId += 1;
    this.rebirthQueue.push(entry);
    unit.rebirthQueued = true;
    this.playerBase.statusElement?.parts?.rebirthQueue?.removeAttribute('hidden');
    return true;
  }

  canQueueRebirthForUnit(unit) {
    return (
      !this.networkClientMode &&
      !this.levelFinished &&
      unit &&
      unit.deathHandled !== true &&
      unit.team === TEAMS.PLAYER &&
      // 傀儡不自动重生：开局只发一个工人，让它排进重生队列等于
      // 「工人战死会自动复活」，把「采集单位是稀缺资源」这条设计直接抹掉。
      unit.isWorker !== true &&
      unit.isSilentRemoval !== true &&
      unit.isBuilding !== true &&
      unit.underConstruction !== true &&
      unit.rebirthQueued !== true &&
      !this.rebirthQueue.some((entry) => entry.sourceUnitId === unit.id)
    );
  }

  triggerSelfDestructOnDeath(unit) {
    if (
      unit?.isSilentRemoval === true ||
      unit?.hasEnchantment?.(SELF_DESTRUCT_ENCHANTMENT_ID) !== true ||
      !unit.position
    ) return false;
    const enchantment = unit.enchantments?.get?.(SELF_DESTRUCT_ENCHANTMENT_ID);
    const level = Math.max(1, Math.floor(enchantment?.level ?? 1));
    const attackHitCount = performSelfDestructAttacks(unit, this, (source, target, options) =>
      this.combat.applyAttack(source, target, options)
    );
    const explosionHitCount = performSelfDestructExplosion(
      unit,
      this,
      level,
      (source, target, damage, options) => this.combat.applyDamage(target, damage, source, 0, {
        ...options,
        damage,
        source,
        target,
        defenseDamageType: 'physical',
        isAttack: false,
        damageTypes: new Set(['selfDestruct'])
      })
    );
    this.effects.spawnSelfDestructExplosion(unit.position, SELF_DESTRUCT_RADIUS);
    this.effects.spawnHit({
      x: unit.position.x,
      y: (unit.position.y ?? 0) + 0.82,
      z: unit.position.z
    }, '#ff784f');
    return attackHitCount > 0 || explosionHitCount > 0;
  }

  createRebirthSnapshot(unit, level = 1) {
    return {
      type: unit.type,
      team: unit.team,
      name: unit.name ?? UNIT_DEFINITIONS[unit.type]?.name ?? unit.type,
      sourceCardId: unit.sourceCardId ?? null,
      sourceCardEnergyCost: finiteNumber(unit.sourceCardEnergyCost, null),
      ownerPlayerId: unit.ownerPlayerId ?? this.localPlayerSlot,
      controllerPlayerId: unit.controllerPlayerId ?? unit.ownerPlayerId ?? this.localPlayerSlot,
      factionId: unit.factionId ?? unit.team,
      playerColorIndex: this.playerColorIndexFor(unit.controllerPlayerId ?? unit.ownerPlayerId),
      maxEnchantmentSlots: Math.max(unit.enchantments?.size ?? 0, Math.floor(unit.maxEnchantmentSlots ?? 5)),
      // 符文石留在原单位背包里，重生时按 unitId 把背包引到新单位上，
      // 不在快照里复制一份，避免产生两套石头。
      unitId: unit.id,
      homePoint: vectorSnapshot(unit.homePoint),
      rebirthLevel: level,
      attributes: captureRebirthAttributeSnapshot(unit),
      enchantments: captureRebirthEnchantments(unit)
    };
  }

  // 选中面板的符文石列表：名称 + 等级 + 当前魔力进度（满级显示已满级）。
  formatRuneStoneList(unit) {
    const stones = this.runeStones?.stonesForUnit?.(unit) ?? [];
    return stones.map((stone) => {
      const need = manaThresholdForLevel(stone.level);
      const progress = Number.isFinite(need)
        ? `(${Math.floor(stone.mana)}/${need})`
        : '(满级)';
      return `${runeDisplayName(stone.enchantmentId)}Lv.${stone.level}${progress}`;
    }).join('、');
  }

  updateRebirthQueue(dt = 0) {
    if (this.networkClientMode || !this.rebirthQueue.length) return;
    const elapsed = Math.max(0, finiteNumber(dt, 0));
    for (let index = this.rebirthQueue.length - 1; index >= 0; index -= 1) {
      const entry = this.rebirthQueue[index];
      entry.remaining = Math.max(0, finiteNumber(entry.remaining, 0) - elapsed);
      if (entry.remaining > 0) continue;
      this.rebirthQueue.splice(index, 1);
      this.respawnRebirthEntry(entry);
    }
  }

  respawnRebirthEntry(entry) {
    const snapshot = entry?.snapshot;
    if (!snapshot?.type || !UNIT_DEFINITIONS[snapshot.type] || this.playerBase?.alive === false) return null;
    const position = this.resolveRebirthSpawnPoint(entry);
    const unit = new UnitEntity({
      type: snapshot.type,
      team: TEAMS.PLAYER,
      position
    });
    unit.ownerPlayerId = snapshot.ownerPlayerId ?? this.localPlayerSlot;
    unit.controllerPlayerId = snapshot.controllerPlayerId ?? unit.ownerPlayerId;
    unit.factionId = snapshot.factionId ?? unit.team;
    unit.sourceCardId = snapshot.sourceCardId ?? entry.sourceCardId ?? null;
    unit.sourceCardEnergyCost = finiteNumber(
      snapshot.sourceCardEnergyCost ?? entry.sourceCardEnergyCost,
      null
    );
    unit.maxEnchantmentSlots = Math.max(
      Math.floor(snapshot.maxEnchantmentSlots ?? 5),
      snapshot.enchantments?.length ?? 0
    );
    // 重生单位回到之前的返回位置（若无返回位置则以重生点为准）
    unit.homePoint = vectorFromSnapshot(snapshot.homePoint) ?? position.clone();
    unit.homePoint.y = this.groundHeightAt(unit.homePoint);
    this.attachUnitStatus(unit);
    this.registerUnit(unit);
    // 复生单位**不接回**原单位的符文石：石头在阵亡时已经落地成了遗物包（方案第 7 节），
    // 再把它塞给复生单位等于让同一块石头同时存在于地面和新身体里。
    // 想要拿回来，就派人去遗物包那里捡。
    // 顺序仍然是"先非符文附魔与属性、后同步符文附魔"，保证附魔不会被背包同步覆盖。
    restoreRebirthEnchantments(unit, snapshot.enchantments);
    restoreRebirthAttributes(unit, snapshot.attributes);
    this.runeStones?.syncUnitEnchantments(unit);
    this.effects.spawnRing(unit.position, '#f1d97a', 1.05, 0.74);
    this.effects.spawnDamageNumber(unit.position, 1, {
      text: '复生',
      color: '#f1d97a',
      stroke: '#3c2b10',
      height: unit.projectileHitHeight ?? 1.55,
      duration: 0.9,
      fontSize: 78,
      baseHeight: 0.5
    });
    return unit;
  }

  resolveRebirthSpawnPoint(entry = null) {
    const base = this.playerBase?.position ?? new THREE.Vector3(0, 0, BALANCE.playerBase.position.z);
    const offsetIndex = Math.max(0, Math.floor(entry?.id ?? 0)) % 8;
    const point = base.clone().add(polarOffset(offsetIndex, 8, 2.45));
    const position = this.resolveWalkablePoint(point);
    position.y = this.groundHeightAt(position);
    return position;
  }

  serializeRebirthQueue() {
    return this.rebirthQueue.map((entry) => serializeRebirthQueueEntry(entry));
  }

  applyNetworkRebirthQueue(queue = []) {
    if (!this.networkClientMode) return;
    this.rebirthQueue = (Array.isArray(queue) ? queue : []).map((entry, index) => ({
      id: entry.id ?? index + 1,
      sourceUnitId: entry.sourceUnitId ?? null,
      type: entry.type,
      name: entry.name ?? UNIT_DEFINITIONS[entry.type]?.name ?? entry.type ?? '单位',
      ownerPlayerId: entry.ownerPlayerId ?? null,
      controllerPlayerId: entry.controllerPlayerId ?? entry.ownerPlayerId ?? null,
      playerColorIndex: Math.max(0, Math.min(3, Math.floor(entry.playerColorIndex ?? 0))),
      level: Math.max(1, Math.floor(entry.level ?? 1)),
      total: Math.max(0, finiteNumber(entry.total, 0)),
      remaining: Math.max(0, finiteNumber(entry.remaining, 0))
    }));
  }

  markEndlessEnemySpawn(unit) {
    if (!this.isEndlessMode() || this.networkClientMode || unit?.team !== TEAMS.ENEMY) return;
    const enemyClass = endlessEnemyClass(unit);
    unit.endlessCombatStartedAt = null;
    unit.endlessFirstAttackerId = null;
    unit.endlessEnemyClass = enemyClass;
    // 难度权重必须使用单位原始生命。若把已经受无尽难度和联机倍率放大的
    // maxHealth 再用于击杀结算，会形成“难度 -> 血量 -> 单次难度收益”的正反馈，
    // 导致难度增长和回落都越来越突然。
    unit.endlessDifficultyBaseHealth = endlessDifficultyReferenceHealth(unit);
    unit.endlessExpectedLifetime = endlessExpectedLifetime({
      // 击杀快慢仍按实际生命衡量，保证高难度敌人拥有合理的预期交战时间。
      baseHealth: unit.maxHealth ?? unit.endlessDifficultyBaseHealth,
      enemyClass
    });
  }

  markEndlessEnemyCombatStarted(unit, source = null) {
    if (
      !this.isEndlessMode()
      || this.networkClientMode
      || unit?.team !== TEAMS.ENEMY
      || unit.isSilentRemoval
      || !source
      || Number.isFinite(unit.endlessCombatStartedAt)
    ) return;
    if (source.team && unit.team && source.team === unit.team) return;
    unit.endlessCombatStartedAt = this.elapsedTime;
    unit.endlessFirstAttackerId = source.id ?? null;
  }

  updateEndlessDifficultyForDeath(unit) {
    if (
      !this.isEndlessMode()
      || this.networkClientMode
      || unit?.isSilentRemoval
    ) return;
    if (unit?.team === TEAMS.ENEMY) {
      this.updateEndlessDifficultyForEnemyDeath(unit);
      return;
    }
    if (unit?.team === TEAMS.PLAYER) {
      this.updateEndlessDifficultyForPlayerUnitDeath(unit);
    }
  }

  updateEndlessDifficultyForEnemyDeath(unit) {
    if (
      !Number.isFinite(unit.endlessCombatStartedAt)
      || !Number.isFinite(unit.endlessExpectedLifetime)
    ) return;
    const result = resolveEndlessEnemyDefeat({
      baseHealth: unit.endlessDifficultyBaseHealth ?? unit.maxHealth ?? unit.definition?.maxHealth,
      lifetime: Math.max(0, this.elapsedTime - unit.endlessCombatStartedAt),
      expectedLifetime: unit.endlessExpectedLifetime,
      enemyClass: unit.endlessEnemyClass ?? endlessEnemyClass(unit),
      performanceMultiplier: this.endlessPerformanceMultiplier
    });
    this.endlessPerformanceMultiplier = result.performanceMultiplier;
    this.applyEndlessDifficultyChange(result.difficultyDelta, { forceHud: true });
  }

  updateEndlessDifficultyForPlayerUnitDeath(unit) {
    if (
      unit?.team !== TEAMS.PLAYER
      || unit?.isSilentRemoval
      || unit.isBuilding
      || unit.underConstruction
    ) return;
    this.endlessPerformanceMultiplier = applyEndlessPerformanceMultiplier(
      this.endlessPerformanceMultiplier,
      endlessPlayerUnitDeathPerformanceDelta()
    );
    const survivingCombatUnitCount = this.friendlyUnits.filter((friendly) => (
      friendly?.team === TEAMS.PLAYER
      && !friendly.isBuilding
      && !friendly.underConstruction
      && friendly.alive
    )).length;
    const ownedCombatUnitCount = Math.max(1, survivingCombatUnitCount + 1);
    this.applyEndlessDifficultyChange(
      endlessPlayerUnitDeathDifficultyDelta(this.endlessDifficulty, ownedCombatUnitCount),
      { forceHud: true }
    );
  }

  applyEndlessDifficultyChange(delta, { forceHud = false } = {}) {
    const change = Number(delta);
    if (!Number.isFinite(change)) return;
    if (change !== 0) {
      this.endlessDifficulty = applyEndlessDifficulty(this.endlessDifficulty, change);
    } else if (!forceHud) {
      return;
    }
    this.hudUpdateTimer = 0;
    this.updateHud(0);
  }

  onUnitDied(unit, source = null) {
    if (unit?.team !== TEAMS.ENEMY) return;
    if (!source?.alive || source.team !== TEAMS.PLAYER || source.isBuilding) return;
    if (!unit.buffs?.has?.('huntMarked')) return;

    const share = 0.25;
    const sourceTag = `hunt-mark:${unit.id}`;
    const physicalAttack = this.modifiers.getPhysicalAttack(unit);
    const magicAttack = this.modifiers.getMagicAttack(unit);
    const attackRate = this.modifiers.getAttackRate(unit);
    const armor = this.modifiers.getArmor(unit);
    const magicResistance = this.modifiers.getMagicResistance(unit);
    const maxHealthGain = Math.max(0, unit.maxHealth * share);
    const maxDurabilityGain = Math.max(0, (unit.weapon?.maxDurability ?? 0) * share);

    source.attributes.addModifiers([
      { stat: 'maxHealth', type: 'add', amount: maxHealthGain },
      { stat: 'physicalAttack', type: 'add', amount: physicalAttack * share },
      { stat: 'magicAttack', type: 'add', amount: magicAttack * share },
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

  grantKillEnergy(unit, source = null) {
    if (!unit || unit.team !== TEAMS.ENEMY || unit.isSilentRemoval) return;
    const triggerKillHarvest = (slot) => {
      const abilities = this.abilitiesFor(slot);
      if ((abilities?.getStacks?.('killHarvest') ?? 0) <= 0) return false;
      abilities.onEnemyKilled?.(unit, unit.position);
      return true;
    };
    // 普通击杀不产生能量；只有明确持有“猎魂潮汐”的玩家才处理该事件。
    if (this.coop?.enabled && this.players) {
      this.coopPlayerSlots().forEach((slot) => {
        triggerKillHarvest(slot);
      });
      return;
    }

    const ownerSlot = resolveKillOwnerSlot(this, source);
    const slot = ownerSlot ?? this.localPlayerSlot;
    triggerKillHarvest(slot);
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
    // 祭坛不再发放兵种专精奖励：专精改由非最终 Boss 后的免费奖励步骤提供。
    // 占领的意义是获得前线部署点、祭坛恢复与魔力祭坛的魔力供给。
    if (!event || event.owner !== TEAMS.PLAYER || event.reason !== 'captured') return;
    this.networkBridge?.markPrivateStateDirty?.(this.localPlayerSlot);
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
      unit.ownerPlayerId = options.ownerPlayerId ?? this.cardSystem?.playerSlot ?? this.localPlayerSlot;
      unit.controllerPlayerId = unit.ownerPlayerId;
      assignUnitSourceCard(unit, options.sourceCard);
      this.applySummonCardLevel(unit, options.sourceCard);
      this.attachUnitStatus(unit);
      this.registerUnit(unit);
      this.abilitiesFor(unit)?.onFriendlyUnitSummoned?.(unit, options.sourceCard);
      // 玩家单位部署后把出生点记为默认"返回位置"：未下达移动指令时待在原地，
      // 遇敌会追击作战、打完自动回到这里；下达移动指令后则以目的地作为新的返回位置。
      unit.homePoint = unit.position.clone();
      unit.homePoint.y = this.groundHeightAt(unit.homePoint);
      this.effects.spawnRing(unit.position, '#9dd8ff', 0.82, 0.52);
      if (selectSpawned) {
        this.selectUnit(unit);
      }
    }
  }

  /**
   * 海岛开局的出生护卫（`BALANCE.world.survivalOpening.escorts`）。
   *
   * 落点同样要过 `resolveWalkablePoint`：基地自身有半径 2.25 的寻路阻挡，
   * 落在里面的单位会一直"想走但一步不动"。
   * 每个护卫错开一点站位，避免全部叠在同一个格子上互相挤。
   */
  spawnSurvivalEscorts() {
    const opening = this.world?.config?.survivalOpening
      ?? this.worldConfig?.survivalOpening
      ?? BALANCE.world.survivalOpening
      ?? {};
    const escorts = Array.isArray(opening.escorts) ? opening.escorts : [];
    const spawned = [];
    escorts.forEach((type, index) => {
      if (!UNIT_DEFINITIONS[type]) return;
      const spot = this.playerBase.position.clone().add(new THREE.Vector3(
        1.8 + (index % 2) * 1.6,
        0,
        -3.4 - Math.floor(index / 2) * 1.7
      ));
      const position = this.resolveWalkablePoint(spot);
      position.y = this.groundHeightAt(position);
      this.summonUnits(type, 1, position, 0.7, { select: false });
      const unit = this.findNewestFriendlyUnit(type);
      if (unit) spawned.push(unit);
    });
    return spawned;
  }

  // 孤岛求生的开局布置：一个木傀儡 + 一把斧子一把镐子 + 一小笔启动物资。
  //
  // 刻意放在开局奖励流程之外：三选一卡牌不应该被「你已经有个工人了」干扰，
  // 也不该因为玩家没选工人就变成没法采集。这里不发牌、不推波次、不写策略事件。
  setupSurvivalOpening() {
    if (this.worldConfig?.sceneKey !== 'island-survival') return null;
    if (!this.work) return null;
    // 缺 woodPuppet 定义时安静跳过：宁可不生成工人，也不要把整个开局搞崩。
    if (!UNIT_DEFINITIONS.woodPuppet) return null;
    // 出生点不能只按几何偏移算：基地自身登记了半径 2.25 的寻路阻挡，
    // 落在它附近（含所在格子中心落在半径内）的格子是不可走的。
    // 傀儡若出生在这种格子上，MovementAgent.moveToward 里的
    // safeSurfaceSteeringToward 会一直返回空，于是每帧 false、一步不动，
    // 而作业状态机还会按「正在移动」扣魔力。这里直接放到阻挡外的可走区域（约 5m）。
    const spawnPoint = this.playerBase.position.clone().add(new THREE.Vector3(-3.6, 0, 3.4));
    this.summonUnits('woodPuppet', 1, spawnPoint, 0.7, { select: false });
    const worker = this.findNewestFriendlyUnit('woodPuppet');
    if (!worker) return null;
    // 出生护卫。没有它这个模式走不通：招募链是「招募令 ← 深邃核心 ← 摧毁巢穴」，
    // 战斗单位本身来自巢穴——只给傀儡的话整条链是死循环（见 BALANCE.world.survivalOpening）。
    this.spawnSurvivalEscorts();
    // 工具放进背包而不是单独挂一个列表：工具所有权只有一个来源（背包实例），
    // 规划器判断「缺工具」时读的就是这份背包。
    const workerInventory = this.createWorkerBootstrapInventory(worker.id);
    this.work.registerWorker(worker, { inventory: workerInventory });
    // 默认采集需求：前期以木材为主、石料次之，食物只占一小份。
    // 这里只给权重与库存目标，具体派谁、去哪棵树由调度器按可执行性与距离决定。
    this.work.setDemands([
      { id: 'auto-wood', resource: 'wood', weight: 50, targetStock: 400 },
      { id: 'auto-stone', resource: 'stone', weight: 30, targetStock: 300 },
      { id: 'auto-food', resource: 'food', weight: 20, targetStock: 60 }
    ]);
    // 海岛不跑波次，敌人由这 4 个刷怪点持续产生，全部摧毁才通关。
    this.spawnPoints.attach(ISLAND_SPAWN_POINTS);
    // 巢穴用惰性建筑类型 spawnPointNest：早前拿 spiderEgg 当占位，
    // 它其实是会孵化的活单位，会衍生出不带点位归属的敌人（验收 20→24）。
    this.spawnSpawnPointNests();
    // 野外中立战斗单位：点开详情面板花一张招募令就能归队。
    this.spawnFieldRecruits();
    // 启动物资：够搭第一座工作台与一段栅栏，但不够跳过采集阶段。
    this.baseInventory.add('wood', 20);
    this.baseInventory.add('stone', 12);
    return worker;
  }

  // summonUnits 不返回生成结果，按类型从注册表里取最新的一支。
  findNewestFriendlyUnit(type) {
    const units = this.friendlyUnits;
    for (let i = units.length - 1; i >= 0; i -= 1) {
      if (units[i]?.type === type && units[i].alive) return units[i];
    }
    return null;
  }

  buildStructureUnit(type, point, options = {}) {
    const position = this.resolveWalkablePoint(point.clone());
    position.y = this.groundHeightAt(position);
    const unit = new UnitEntity({
      type,
      team: TEAMS.PLAYER,
      position
    });
    unit.ownerPlayerId = options.ownerPlayerId ?? this.cardSystem?.playerSlot ?? this.localPlayerSlot;
    unit.controllerPlayerId = unit.ownerPlayerId;
    assignUnitSourceCard(unit, options.sourceCard);
    this.applySummonCardLevel(unit, options.sourceCard);
    this.abilitiesFor(unit)?.applyNewBuildingDurability(unit);
    this.attachUnitStatus(unit);
    this.registerUnit(unit);
    this.buildings.startConstruction(unit, options.buildSeconds ?? options.sourceCard?.buildSeconds ?? 30);
    this.effects.spawnRing(unit.position, '#dff8ff', 1.1, 0.62);
    this.selectUnit(unit);
    return unit;
  }

  canDeploySummonAt(point, slot = this.activeEconomySlot ?? this.localPlayerSlot) {
    if (!point) return false;
    return this.getSummonDeploymentAnchors(slot).some((anchor) => (
      Math.hypot(point.x - anchor.position.x, point.z - anchor.position.z) <= anchor.radius
    ));
  }

  canPlaceBeaconAt(point) {
    if (!point) return false;
    const bounds = this.battlefieldBounds();
    return (
      point.x >= bounds.minX &&
      point.x <= bounds.maxX &&
      point.z >= bounds.minZ &&
      point.z <= bounds.maxZ &&
      this.isPointWalkable(point)
    );
  }

  getSummonDeploymentAnchors(slot = this.activeEconomySlot ?? this.localPlayerSlot) {
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
      if (!this.unitBelongsToPlayer(unit, slot)) return;
      anchors.push({
        position: unit.position,
        radius: unit.definition.deploymentRadius ?? SUMMON_DEPLOY_RADIUS
      });
    });
    // 己方占领的祭坛同样是前线部署点，规则复用信标的合法落点与预览流程。
    this.altars?.altars?.forEach((altar) => {
      if (altar.owner !== TEAMS.PLAYER) return;
      anchors.push({
        position: altar.position,
        radius: BALANCE.altarRules?.deploymentRadius ?? SUMMON_DEPLOY_RADIUS
      });
    });
    return anchors;
  }

  applySummonCardLevel(unit, card) {
    applySummonCardLevelModifiers(unit, card);
    applyBuildingCardUpgrade(unit, card);
    const owner = unit.ownerPlayerId ?? this.activeEconomySlot ?? this.localPlayerSlot;
    if (this.players?.[owner]) {
      this.withPlayerContext(owner, () => this.applyTeamUpgradesToUnit(unit));
    } else {
      this.applyTeamUpgradesToUnit(unit);
    }
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
    inheritUpgradeTurretAttributes(turret, owner);
    turret.ownerUnitId = owner.id;
    turret.ownerPlayerId = owner.ownerPlayerId ?? this.activeEconomySlot ?? this.localPlayerSlot;
    turret.controllerPlayerId = owner.controllerPlayerId ?? turret.ownerPlayerId;
    turret.controlMode = owner.controlMode;
    turret.homePoint = owner.homePoint?.clone?.() ?? owner.position.clone();
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
    const baseRange = Math.max(0, BALANCE.playerBase.attackRange ?? 8.5);
    const lookoutStacks = Math.max(0, Math.floor(
      this.getAbilityStacks?.('lookout') ?? this.abilities?.getStacks?.('lookout') ?? 0
    ));
    // 瞭望：每层 +50% 初始攻击距离（加算，不是乘算）
    const range = baseRange + baseRange * 0.5 * lookoutStacks;
    const baseRadius = targetCombatRadius(this.playerBase);
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    this.enemyUnits.forEach((unit) => {
      // 用 isHostileEnemy 而不是 team === enemy：野生动物与野外可招募单位也在 enemy 队伍里，
      // 基地不该把它们当敌人打（那会把还没招募的野外单位直接打死）。
      if (!unit.alive || !isHostileEnemy(unit) || !unit.position) return;
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
    const attackEmitter = this.playerBase.model?.userData?.attackEmitter;
    if (attackEmitter) {
      this.playerBase.model.updateMatrixWorld(true);
      attackEmitter.getWorldPosition(start);
    } else {
      start.y += this.playerBase.projectileHitHeight ?? 2.1;
    }
    const end = target.position.clone();
    end.y += target.projectileHitHeight ?? 1.45;

    // 冰镜结晶：先知开着冰镜时，基地激光被吸收并原路反弹回基地
    const mirrorBuff = target.buffs?.get?.('frostMirror');
    const mirrorRemaining = Number.isFinite(mirrorBuff?.frostMirrorRemaining)
      ? mirrorBuff.frostMirrorRemaining
      : 0;
    if (mirrorRemaining > 0) {
      const reflected = Math.min(damage, mirrorRemaining);
      mirrorBuff.frostMirrorRemaining = mirrorRemaining - reflected;
      if (mirrorBuff.frostMirrorRemaining <= 0) {
        target.removeBuff?.('frostMirror');
      }
      // 反弹光束：与基地激光完全一致的视觉（同款冰蓝光束 + 翠绿热芯）
      this.effects.spawnEnemyCampBlast(end, start, {
        color: '#b7e8ff',
        hotColor: '#6adbb8'
      });
      this.effects.spawnRing(target.position, '#bcecff', 1.3, 0.5);
      this.effects.spawnDamageNumber(target.position, reflected, {
        text: `冰镜反弹 ${Math.round(reflected)}`,
        color: '#bcecff',
        stroke: '#12343e',
        height: target.projectileHitHeight ?? 1.45,
        duration: 0.82,
        fontSize: 76,
        baseHeight: 0.5,
        fadeStart: 0.62
      });
      if (reflected > 0) {
        this.damagePlayerBase(reflected, { isAttack: false, source: target });
      }
      return;
    }

    this.effects.spawnEnemyCampBlast(start, end, {
      color: '#b7e8ff',
      hotColor: '#6adbb8'
    });
    target.takeRawDamage(damage, { bypassShield: false });
    target.statusUiDirty = true;
    const knockbackResistance = this.modifiers.getKnockbackResistance(target);
    const knockback = Math.max(
      0,
      (BALANCE.playerBase.attackKnockback ?? 1.35) * (1 - knockbackResistance)
    );
    if (applyKnockbackImpulse(this, target, this.playerBase.position, knockback)) {
      target.recentPlayerKnockback = true;
      target.recentPlayerKnockbackOwner = null;
      target.knockbackSessionDistance = 0;
    }
    playUnitAnimation(target, 'hit');
    triggerUnitHitFlash(target, 0.14);
    this.networkBridge?.notifyUnitHitFlash?.(target.id, 0.14);
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

  spawnEnemyWave(waveNumber, { waveConfig = null } = {}) {
    // 海岛生存没有波次：持续压力来自地图上的刷怪点（SpawnPointSystem）。
    // 这里直接不产出敌人，否则会同时存在两套敌人来源，玩家分不清压力从哪来，
    // 「清除全部刷怪点」这个目标也就不成立了。
    // 只屏蔽本关，其它关卡行为不变。
    if (this.worldConfig?.sceneKey === 'island-survival') return;
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
        type: this.enemyTypeForWave(waveIndex, i, difficulty, waveConfig),
        team: TEAMS.ENEMY,
        position
      });
      unit.enemyForce = waveConfig ?? null;
      this.applyEnemyDifficulty(unit, difficulty, waveConfig, i);
      this.applyEnemyForceModifiers(unit, waveConfig, i);
      // 携带魔力在生成时按难度档位一次定死；之后等待更久、难度变化都不再重算。
      this.assignEnemyManaValue(unit);
      this.applySpiderSpawnTraits(unit, difficulty, waveConfig, i);
      this.initializeSpiderLifecycle(unit);
      this.markEndlessEnemySpawn(unit);
      this.attachUnitStatus(unit);
      this.registerUnit(unit);
      spawnedUnits.push(unit);
      this.orderEnemyAttack(unit, i, count);
    }
    this.enemyEnchantment?.enchantSpawnWave?.(spawnedUnits, waveConfig);
  }

  // 给每个刷怪点放一个可被玩家攻击摧毁的巢穴实体。
  // 暂时复用现成的敌方静止建筑作为外形与耐久载体；专用巢穴模型留待美术阶段替换。
  // 巢穴带 isSpawnPointNest 标记，SpawnPointSystem 统计存活时会把它们排除，
  // 否则巢穴会白白占掉一个「这个点还能生几个」的名额。
  spawnSpawnPointNests() {
    if (!this.spawnPoints?.points.length) return [];
    const nests = [];
    this.spawnPoints.points.forEach((point) => {
      const position = new THREE.Vector3(point.x, 0, point.z);
      position.y = this.groundHeightAt(position);
      const unit = new UnitEntity({ type: 'spawnPointNest', team: TEAMS.ENEMY, position });
      // 标记必须在 registerUnit 之前打上：注册过程会重建/重置单位的运行期字段，
      // 放在之后再赋值会被覆盖，表现为「巢穴既不是 nest 也没有 pointId」，
      // 统计时落进无归属分组。
      unit.isSpawnPointNest = true;
      unit.spawnPointId = point.id;
      this.applyEnemyDifficulty(unit, 1, null, 0);
      // 按点覆盖巢穴血量（起始点用）。health 是普通字段，maxHealth 是绑到属性的
      // getter（赋值会抛错），所以只动 health；血条比例要跟着调，否则条子会显示成满血。
      if (point.nestHealth > 0) {
        unit.health = Math.min(unit.health, point.nestHealth);
        unit.healthLagRatio = Math.min(1, unit.health / Math.max(1, unit.maxHealth));
      }
      this.attachUnitStatus(unit);
      this.registerUnit(unit);
      nests.push(unit);
    });
    return nests;
  }

  // 在指定位置生成一个敌人，供刷怪点使用。
  // 走的是和波次生成完全相同的注册路径（属性、难度、魔力、状态条、注册表），
  // 只是来源不是波次配置，而是某个刷怪点；unit.spawnPoint 是这个点和敌人的唯一关联，
  // SpawnPointSystem 靠它从注册表反算每个点还有多少存活。
  spawnEnemyAt(type, basePoint, options = {}) {
    if (!type || !basePoint) return null;
    const difficulty = options.difficulty ?? this.effectiveDifficultyForWave(1);
    const radius = options.radius ?? 1.6;
    const index = options.index ?? 0;
    const position = this.resolveWalkablePoint(
      new THREE.Vector3(basePoint.x, 0, basePoint.z).add(polarOffset(index, 6, radius))
    );
    position.y = this.groundHeightAt(position);
    const unit = new UnitEntity({ type, team: TEAMS.ENEMY, position });
    this.applyEnemyDifficulty(unit, difficulty, null, index);
    this.assignEnemyManaValue(unit);
    this.attachUnitStatus(unit);
    this.registerUnit(unit);
    // 注意：unit.spawnPoint 在本代码库里已经被占用（旧波次敌人用它存出生坐标，
    // 供拴绳/游荡使用）。刷怪点的归属必须用独立字段，否则两套语义会互相覆盖，
    // 表现为「按点位统计存活数」时多出一个 "[object Object]" 分组。
    unit.spawnPointId = options.spawnPointId ?? null;
    this.orderEnemyAttack(unit, index, 6);
    return unit;
  }

  enemyTypeForWave(waveIndex, index, difficulty, waveConfig = null) {    if (waveConfig?.types?.length) {
      return waveConfig.types[index % waveConfig.types.length];
    }
    const pool = this.levelSession.level.enemyPool ?? [];
    const pooledType = selectEnemyFromPool(pool, waveIndex, index, difficulty);
    if (pooledType) return pooledType;

    const wizardUnlocked = difficulty >= 4 || waveIndex >= 7;
    if (wizardUnlocked) {
      const wizardEvery = difficulty >= 6 ? 5 : 7;
      if ((index * 3 + waveIndex) % wizardEvery === 0) return 'wizard';
    }
    const ogreUnlocked = difficulty >= 3 || waveIndex >= 5;
    if (ogreUnlocked) {
      const ogreEvery = difficulty >= 5 ? 4 : 6;
      if ((index + waveIndex * 2) % ogreEvery === 0) return 'ogre';
    }
    const skeletonArcherUnlocked = difficulty >= 3 || waveIndex >= 4;
    if (skeletonArcherUnlocked && (index + waveIndex * 3) % 5 === 1) {
      return 'skeletonArcher';
    }
    const skeletonUnlocked = difficulty >= 2 || waveIndex >= 2;
    if (skeletonUnlocked && (index + waveIndex) % 3 === 1) {
      return 'skeletonSoldier';
    }
    const archerUnlocked = difficulty >= 2 || waveIndex >= 3;
    if (!archerUnlocked) return 'goblinSoldier';
    const archerEvery = difficulty >= 5 ? 2 : difficulty >= 3 ? 3 : 4;
    return (index + waveIndex) % archerEvery === 0 ? 'goblinArcher' : 'goblinSoldier';
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
        ...eliteOrBossInitialAttackModifiers(),
        { stat: 'attackPower', type: 'multiply', amount: eliteScale.eliteDamageMultiply ?? 1.16 }
      ], `force:${waveConfig.id ?? waveConfig.index ?? 0}:elite`);
      unit.health = unit.maxHealth;
      unit.shield = 0;
      unit.weapon.durability = unit.weapon.maxDurability;
      unit.runtimeVisualScale = 1.1;
      unit.runtimeStatusHeightScale = 1.1;
      setUnitRuntimeVisualScale(unit, unit.runtimeVisualScale);
      unit.projectileHitHeight = (unit.projectileHitHeight ?? 1.6) * unit.runtimeStatusHeightScale;
      return;
    }
    if (waveConfig.kind !== 'boss') return;
    if (index === 0) {
      const bossRank = Math.max(1, waveConfig.bossOrdinal ?? 1);
      const bossScale = BALANCE.waveScaling ?? {};
      const bossHealthMultiplier =
        ((bossScale.bossHealthBase ?? 2.5) + bossRank * (bossScale.bossHealthPerRank ?? 0.3))
        * 0.7
        * BOSS_HEALTH_MULTIPLIER;
      unit.isBoss = true;
      unit.name = `Boss ${unit.name}`;
      unit.attributes.addModifiers([
        {
          stat: 'maxHealth',
          type: 'multiply',
          amount: bossHealthMultiplier
        },
        {
          stat: 'maxShield',
          type: 'multiply',
          amount: (bossScale.bossShieldBase ?? 1.95) + bossRank * (bossScale.bossShieldPerRank ?? 0.2)
        },
        ...eliteOrBossInitialAttackModifiers(),
        {
          stat: 'attackPower',
          type: 'multiply',
          amount: (bossScale.bossDamageBase ?? 1.22) + bossRank * (bossScale.bossDamagePerRank ?? 0.08)
        }
      ], `force:${waveConfig.id ?? waveConfig.index ?? 0}:boss`);
      const bossStatMultiply = bossScale.bossStatMultiply ?? 1;
      if (Math.abs(bossStatMultiply - 1) > 0.001) {
        unit.attributes.addModifiers([
          { stat: 'maxHealth', type: 'multiply', amount: bossStatMultiply },
          { stat: 'maxShield', type: 'multiply', amount: bossStatMultiply },
          { stat: 'attackPower', type: 'multiply', amount: bossStatMultiply }
        ], `force:${waveConfig.id ?? waveConfig.index ?? 0}:boss-scale`);
      }
      const targetBossShield = unit.maxHealth * 0.5;
      unit.attributes.addModifiers([
        { stat: 'maxShield', type: 'add', amount: targetBossShield - unit.maxShield }
      ], `force:${waveConfig.id ?? waveConfig.index ?? 0}:boss-shield-cap`);
      unit.health = unit.maxHealth;
      unit.shield = unit.maxShield;
      unit.weapon.durability = unit.weapon.maxDurability;
      // Boss 体型缩小 40%：2.5 → 1.5
      const bossVisualScale = unit.type === 'frostTrollBoss' ? 1.5 : 1.32;
      unit.runtimeVisualScale = bossVisualScale;
      unit.runtimeStatusHeightScale = bossVisualScale;
      setUnitRuntimeVisualScale(unit, bossVisualScale);
      unit.projectileHitHeight = (unit.projectileHitHeight ?? 1.6) * bossVisualScale;
      return;
    }
    unit.attributes.addModifiers([
      { stat: 'maxHealth', type: 'multiply', amount: 1.18 },
      { stat: 'attackPower', type: 'multiply', amount: 1.08 }
    ], `force:${waveConfig.id ?? waveConfig.index ?? 0}:boss-support`);
    unit.health = unit.maxHealth;
    unit.shield = 0;
  }

  levelBaseDifficulty() {
    return Math.max(1, Math.floor(this.levelSession.level.baseDifficulty ?? 1));
  }

  effectiveDifficulty() {
    if (this.isEndlessMode()) return this.endlessDifficulty;
    return resolveSessionBaseDifficulty(this.levelSession);
  }

  effectiveDifficultyForWave(wave = this.wave) {
    if (this.isEndlessMode()) return this.endlessDifficulty;
    return this.effectiveDifficulty() + waveDifficultyBonus(wave, this.levelSession);
  }

  applyEnemyDifficulty(unit, difficulty, waveConfig = null, indexInWave = 0) {
    const endlessFactors = this.isEndlessMode()
      ? endlessEnemyStatFactors(difficulty)
      : null;
    const standardFactors = endlessFactors ? null : standardEnemyStatFactors(difficulty);
    let healthFactor = endlessFactors?.health ?? standardFactors.health;
    let damageFactor = endlessFactors?.damage ?? standardFactors.damage;
    if (this.coop?.enabled) {
      healthFactor *= this.coop.healthMult ?? COOP_ENEMY_SCALING.healthMult;
      damageFactor *= this.coop.damageMult ?? COOP_ENEMY_SCALING.damageMult;
    }
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
        stat: 'attackPower',
        type: 'multiply',
        amount: damageFactor
      }
    ], 'level:difficulty');
    // 携带魔力与生命/攻击同源成长：把这次实际用到的难度系数留到单位上，
    // 生成流程稍后再按档位基础值折算成魔力（精英/Boss 档位在那一步才确定）。
    unit.manaDifficultyFactor = enemyManaFactor(healthFactor, damageFactor);
    this.applyEnemyStartingBuffs(unit, difficulty, waveConfig, indexInWave);
    unit.health = unit.maxHealth;
    unit.clampToAttributeCaps();
  }

  applyEnemyStartingBuffs(unit, difficulty, waveConfig = null, indexInWave = 0) {
    const startingBuffs = unit.definition.startingBuffs ?? [];
    const endlessClass = endlessEnemyClassForWave(waveConfig, indexInWave);
    const waveIndex = waveConfig?.index ?? this.currentWave?.index ?? this.wave ?? 1;
    const endlessSeed = stableEnemyRoll(waveIndex, indexInWave + unit.id * 17, difficulty);
    if (this.isEndlessMode()) {
      unit.endlessEnchantBudget = endlessEnchantCount(difficulty, {
        enemyClass: endlessClass,
        seed: endlessSeed
      });
    }
    if (!startingBuffs.length) return;
    const buffLimit = this.isEndlessMode()
      ? Math.min(startingBuffs.length, unit.endlessEnchantBudget)
      : startingBuffs.length;
    startingBuffs.slice(0, buffLimit).forEach((entry, slotIndex) => {
      const scalingLevel = this.isEndlessMode()
        ? endlessEnchantLevel(difficulty, {
          enemyClass: endlessClass,
          slotIndex,
          seed: endlessSeed
        })
        : enemyEnchantmentLevel(difficulty);
      const level = (entry.level ?? 1) + (entry.scalesWithDifficulty ? scalingLevel - 1 : 0);
      this.buffs.applyBuff(unit, entry.buffId, unit, {
        level,
        sourceUnitType: unit.type
      });
    });
  }

  applySpiderSpawnTraits(unit, difficulty, waveConfig = null, seedIndex = 0) {
    if (unit.type !== 'spider') return;
    const waveIndex = waveConfig?.index ?? this.currentWave?.index ?? this.wave ?? 1;
    if (stableEnemyRoll(waveIndex, seedIndex + unit.id * 17, difficulty) % 3 !== 0) return;
    if (this.isEndlessMode() && unit.enchantments.size >= (unit.endlessEnchantBudget ?? 0)) return;
    this.buffs.applyBuff(unit, 'poison', unit, {
      level: this.isEndlessMode()
        ? endlessEnchantLevel(difficulty, {
          enemyClass: endlessEnemyClass(unit),
          slotIndex: unit.enchantments.size,
          seed: stableEnemyRoll(waveIndex, seedIndex + unit.id * 17, difficulty)
        })
        : enemyEnchantmentLevel(difficulty),
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
    this.assignEnemyManaValue(egg);
    this.markEndlessEnemySpawn(egg);
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
    const waveIndex = egg.enemyForce?.index ?? this.currentWave?.index ?? this.wave ?? 1;
    const difficulty = egg.enemyForce?.effectiveDifficulty ?? this.effectiveDifficultyForWave(waveIndex);
    this.removeEnemyUnitSilently(egg);

    const spider = new UnitEntity({
      type: 'spider',
      team: TEAMS.ENEMY,
      position
    });
    this.applyEnemyDifficulty(spider, difficulty, egg.enemyForce ?? this.currentEnemyForce, 0);
    spider.enemyForce = egg.enemyForce ?? this.currentEnemyForce ?? null;
    this.assignEnemyManaValue(spider);
    this.initializeSpiderLifecycle(spider);
    this.markEndlessEnemySpawn(spider);
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

  /**
   * 野外可招募单位（方案第 6.1 条：原有战斗单位可在野外发现并招募）。
   *
   * 它们是**中立**单位。走 ENEMY 队伍只是为了复用现有的注册、索敌索引、
   * 状态条与死亡链路（野生动物也是这么做的）；`isRecruitable` 让索敌系统
   * 两边都跳过它们——既不主动打人，也不会被己方单位自动打。招募之后这个标记
   * 会被清掉，它就以普通战斗单位身份正常参战。
   */
  spawnFieldRecruits() {
    const entries = this.world?.config?.fieldRecruits
      ?? this.worldConfig?.fieldRecruits
      ?? BALANCE.world.fieldRecruits
      ?? [];
    entries.forEach((spawn) => {
      if (!UNIT_DEFINITIONS[spawn.type]) return;
      // 落点过一遍可走点：坐标是手写的，落到阻挡格或水里就会永远站着不动。
      const position = this.resolveWalkablePoint(new THREE.Vector3(spawn.x, 0, spawn.z));
      position.y = this.groundHeightAt(position);
      const unit = new UnitEntity({
        type: spawn.type,
        team: TEAMS.ENEMY,
        position
      });
      this.attachUnitStatus(unit);
      unit.isRecruitable = true;
      // 不设 moveGoal / wanderGoal / homePoint：中立待招募单位应该守在原地，
      // 给它们 wanderGoal 会像野生动物那样自己走开，玩家就找不到了。
      this.registerUnit(unit);
      this.effects.spawnRing(unit.position, '#ffd9a0', 0.7, 0.5);
    });
  }

  spawnWildlife() {
    (this.world.config?.wildlife ?? this.worldConfig.wildlife ?? BALANCE.world.wildlife).forEach((spawn, index) => {
      const unit = new UnitEntity({
        type: spawn.type,
        team: TEAMS.ENEMY,
        position: new THREE.Vector3(spawn.x, this.groundHeightAt(spawn), spawn.z)
      });
      this.applyWildlifeDifficulty(unit);
      this.assignEnemyManaValue(unit);
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
        stat: 'attackPower',
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

    if (groundOffset >= -UNIT_GROUND_EPSILON && (unit.verticalVelocity ?? 0) <= 0) {
      unit.position.y = groundY;
      unit.verticalVelocity = 0;
      unit.grounded = true;
      return;
    }

    const previousVerticalVelocity = unit.verticalVelocity ?? 0;
    const verticalDt = previousVerticalVelocity <= UNIT_GRAVITY * dt
      ? dt * KNOCKBACK_MOTION_TIME_SCALE
      : dt;
    unit.verticalVelocity = Math.max(
      previousVerticalVelocity - UNIT_GRAVITY * verticalDt,
      -UNIT_MAX_FALL_SPEED
    );
    unit.position.y += (previousVerticalVelocity + unit.verticalVelocity) * 0.5 * verticalDt;

    if (unit.position.y <= groundY + UNIT_GROUND_EPSILON) {
      unit.position.y = groundY;
      unit.verticalVelocity = 0;
      unit.grounded = true;
    } else {
      unit.grounded = false;
    }
  }

  isPointWalkable(point, options = {}) {
    const bounds = this.battlefieldBounds();
    if (
      point.x < bounds.minX ||
      point.x > bounds.maxX ||
      point.z < bounds.minZ ||
      point.z > bounds.maxZ
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
    const bounds = this.battlefieldBounds();
    resolved.x = clamp(resolved.x, bounds.minX, bounds.maxX);
    resolved.z = clamp(resolved.z, bounds.minZ, bounds.maxZ);
    resolved.y = this.groundHeightAt(resolved);
    return this.isPointWalkable(resolved)
      ? resolved
      : this.resolveNearestNavigationPoint(resolved, { maxRings: 14, requireSafeSurface: false }) ?? resolved;
  }

  resolveCommandPoint(point) {
    if (!point) return null;
    const resolved = point.clone();
    const bounds = this.battlefieldBounds();
    resolved.x = clamp(resolved.x, bounds.minX, bounds.maxX);
    resolved.z = clamp(resolved.z, bounds.minZ, bounds.maxZ);
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

  damagePlayerBase(amount, { isAttack = false } = {}) {
    if (this.playerBase.invincible) {
      this.playerBase.health = this.playerBase.maxHealth;
      this.playerBase.structureDurability = this.playerBase.maxStructureDurability;
      this.playerBase.alive = true;
      this.playerBase.healthLagRatio = 1;
      this.playerBase.healthLagDelay = 0;
      this.updateStructureStatusElement(this.playerBase, 0);
      return;
    }
    if (!this.playerBase.alive) return;
    const resolvedDamage = resolvePlayerBaseDamage(amount, {
      isAttack,
      attackDamage: BALANCE.playerBase.damagePerAttack ?? 1
    });
    if (resolvedDamage <= 0) return;
    const previousHealth = this.playerBase.health;
    const previousDurability = this.playerBase.structureDurability ?? 0;
    this.playerBase.health = Math.max(0, this.playerBase.health - resolvedDamage);
    const healthLost = Math.max(0, previousHealth - this.playerBase.health);
    this.spendStructureDurability(this.playerBase, 1);
    this.networkBridge?.notifyCombatResult?.({
      kind: 'damage_applied',
      targetId: 'player-base',
      damageType: 'structure',
      requestedAmount: amount,
      appliedAmount: healthLost,
      healthBefore: previousHealth,
      healthAfter: this.playerBase.health,
      durabilityBefore: previousDurability,
      durabilityAfter: this.playerBase.structureDurability ?? 0
    }, { kind: 'structure_attack' });
    registerStructureHealthLoss(this.playerBase, previousHealth, this.elapsedTime);
    this.playerBase.alive = this.playerBase.health > 0;
    this.updateStructureStatusElement(this.playerBase, 0);
    this.shakeStructure(this.playerBase, 0.2, 0.36);
    this.effects.spawnRing(this.playerBase.position, '#ff8c66', 1.2, 0.44);
    this.effects.spawnStructureDust(this.playerBase.position, this.playerBase.collisionRadius);
    this.effects.spawnDamageNumber(this.playerBase.position, healthLost, {
      height: 2.55
    });
    this.applyPlayerBaseHealthLossEnergyReward(healthLost);
    if (!this.playerBase.alive) {
      this.playerBase.health = 0;
    }
  }

  applyPlayerBaseHealthLossEnergyReward(healthLost) {
    const threshold = BALANCE.playerBase.energyRewardHealthLoss ?? 10;
    const result = consumeBaseHealthLossMilestones(
      this.playerBaseHealthLossProgress,
      healthLost,
      threshold
    );
    this.playerBaseHealthLossProgress = result.progress;
    if (result.milestones <= 0) return;

    const rewardPerMilestone = Math.max(
      0,
      Number(BALANCE.playerBase.energyRewardAmount) || 0
    );
    const reward = rewardPerMilestone * result.milestones;
    if (reward <= 0) return;

    this.coopPlayerSlots().forEach((slot) => {
      const cards = this.cardSystems?.[slot]
        ?? (slot === this.localPlayerSlot ? this.cardSystem : null);
      cards?.addEnergy?.(reward);
    });
    this.effects.spawnEnergyNumber(this.playerBase.position, reward, {
      height: 3.05,
      duration: 1.1,
      fontSize: 96
    });
  }

  damageEnemyCamp(amount, { isAttack = false } = {}) {
    if (!this.enemyCamp.alive) return;
    const resolvedDamage = resolveStructureDamage(amount, {
      isAttack,
      attackDamage: BALANCE.enemyCamp.damagePerAttack ?? BALANCE.playerBase.damagePerAttack ?? 1
    });
    if (resolvedDamage <= 0) return;
    const previousHealth = this.enemyCamp.health;
    const previousDurability = this.enemyCamp.structureDurability ?? 0;
    this.enemyCamp.health = Math.max(0, this.enemyCamp.health - resolvedDamage);
    const healthLost = Math.max(0, previousHealth - this.enemyCamp.health);
    this.spendStructureDurability(this.enemyCamp, 1);
    this.networkBridge?.notifyCombatResult?.({
      kind: 'damage_applied',
      targetId: 'enemy-camp',
      damageType: 'structure',
      requestedAmount: amount,
      appliedAmount: healthLost,
      healthBefore: previousHealth,
      healthAfter: this.enemyCamp.health,
      durabilityBefore: previousDurability,
      durabilityAfter: this.enemyCamp.structureDurability ?? 0
    }, { kind: 'structure_attack' });
    registerStructureHealthLoss(this.enemyCamp, previousHealth, this.elapsedTime);
    this.enemyCamp.alive = this.enemyCamp.health > 0;
    this.updateStructureStatusElement(this.enemyCamp, 0);
    this.shakeStructure(this.enemyCamp, 0.16, 0.32);
    this.effects.spawnRing(this.enemyCamp.position, '#ff8c66', 1.1, 0.44);
    this.effects.spawnStructureDust(this.enemyCamp.position, this.enemyCamp.collisionRadius, '#8d7464');
    this.effects.spawnDamageNumber(this.enemyCamp.position, healthLost, {
      height: 2.7
    });
    const campDamageRatio = healthLost / Math.max(1, this.enemyCamp.maxHealth);
    if (campDamageRatio >= 0.02) {
      const rewards = this.enemyDirectorConfig.battleRewards ?? {};
      const grant = campDamageRatio * (Number(rewards.campDamageRatio) || 3.2);
      this.grantEnemyEnergy(grant, this.enemyCamp.position);
    }
    if (!this.enemyCamp.alive) {
      this.enemyCamp.health = 0;
      // 海岛关的目标是清除全部刷怪点（写在关卡副标题里），敌营不是通关按钮。
      // 它照样会开火，所以打掉它仍然有意义——但要明确告诉玩家"这不是终点"，
      // 否则会出现"打完敌营什么都没发生"的困惑。
      if (this.isSurvivalLevel()) {
        this.cardSystem?.setHintOnce?.(
          '敌营已摧毁。本关目标是清除全部刷怪点，并清掉它们已经放出来的敌人。',
          'enemy-camp-down'
        );
      } else {
        this.finishLevel(true, { endReason: 'enemy_camp_destroyed' });
      }
    }
  }

  /** 是否海岛生存关。这一关的胜负规则与旧关卡完全不同，见 checkSurvivalLevelEnd。 */
  isSurvivalLevel() {
    return this.worldConfig?.sceneKey === 'island-survival';
  }

  checkLevelEnd() {
    if (this.levelFinished) return;
    if (this.isSurvivalLevel()) {
      this.checkSurvivalLevelEnd();
      return;
    }
    if (!this.enemyCamp.alive) {
      this.finishLevel(true, { endReason: 'enemy_camp_destroyed' });
      return;
    }
    if (!this.playerBase.alive) {
      this.finishLevel(this.isEndlessMode(), { endReason: 'player_base_destroyed' });
    }
  }

  /**
   * 海岛生存的胜负（方案第 6 节）。
   *
   * 胜：全部刷怪点被永久摧毁，**且**它们放出来的敌人也已经清干净。
   *     这条规则本来就写在 `SpawnPointSystem.checkVictory()` 里，并且一直在算，
   *     只是此前没有任何地方读它的结果——于是海岛关从来不会赢。
   *     野生动物（isWildlife）不算残余敌人：它们不是刷怪点产出的，也不该让人
   *     为了通关满地图找最后一只兔子。`aliveByPoint()` 的口径正好是这样。
   * 负：基地被毁；或一个己方单位都不剩且当前没有任何补充单位的途径。
   *
   * 敌营被毁在这张图上**不算通关**——本关目标写在关卡副标题里：
   * 「最终摧毁全部刷怪点」。敌营仍然会开火，所以它是个战术目标，不是通关按钮。
   */
  checkSurvivalLevelEnd() {
    if (this.spawnPoints?.checkVictory?.()) {
      this.finishLevel(true, { endReason: 'spawn_points_cleared' });
      return;
    }
    if (this.playerBase?.alive === false) {
      this.finishLevel(false, { endReason: 'player_base_destroyed' });
      return;
    }
    if (this.survivalStrandedLongEnough()) {
      this.finishLevel(false, { endReason: 'no_units_left' });
    }
  }

  /**
   * 己方单位全灭、且没有别的办法再拿到单位，并且这个状态已经持续了一会儿。
   *
   * 延迟确认是必要的：单位刚死、替补正要入场的同一帧不能直接判负；
   * 重生队列里还有条目时也不判负（它们马上就要回到场上）。
   */
  survivalStrandedLongEnough() {
    if ((this.friendlyUnits ?? []).some((unit) => unit?.alive)) {
      this.survivalStrandedSince = null;
      return false;
    }
    if (this.survivalCanStillGetUnits()) {
      this.survivalStrandedSince = null;
      return false;
    }
    if ((this.rebirthQueue?.length ?? 0) > 0 || this.awaitingOpeningReward) return false;
    const now = Number(this.elapsedTime) || 0;
    if (!Number.isFinite(this.survivalStrandedSince)) {
      this.survivalStrandedSince = now;
      return false;
    }
    return now - this.survivalStrandedSince >= SURVIVAL_STRANDED_GRACE_SECONDS;
  }

  /**
   * 生存模式还有没有"再获得单位"的途径。
   *
   * 答案是**没有**，而且刷怪点奖励也救不了这个局面——这一点容易想反：
   * 巢穴里的傀儡只有摧毁巢穴才会出来，而摧毁巢穴需要己方单位去打。
   * 所以"一个己方单位都不剩"时，剩下的巢穴再肥也拿不到手，只能判负。
   * 野外招募（方案第 6.2 条，发现方式与条件待定）接上之后，
   * 这个判断才可能真的返回 true，届时必须一起改。
   */
  survivalCanStillGetUnits() {
    return false;
  }

  /**
   * 摧毁一个刷怪点之后的结算（方案第 6 节）。
   *
   * 由 `SpawnPointSystem.destroyPoint()` 在**真正完成清除**的那一次调用，
   * 所以奖励天然幂等：重复摧毁同一个点不会再发一份。
   *
   * 两样东西会掉出来：
   *   - `point.drops` 里的资源，走地面遗物包（和阵亡掉落同一个系统、同一套守恒规则）；
   *   - `point.workerReward` 的傀儡——方案第 6.1 条确认过「新增傀儡来源是刷怪点」。
   */
  onSpawnPointCleared(point) {
    if (!point) return null;
    if (!this.isSurvivalLevel()) return null;
    const x = Number(point.x) || 0;
    const z = Number(point.z) || 0;

    const stacks = (point.drops ?? [])
      .filter((entry) => entry?.itemId && Number(entry.count) > 0)
      .map((entry) => ({
        itemId: entry.itemId,
        count: Math.max(1, Math.floor(Number(entry.count)))
      }));
    const drop = stacks.length
      ? this.drops?.spawnFromStacks?.(stacks, {
        x: x + 0.6,
        z: z + 0.6,
        ownerId: this.localPlayerSlot ?? null
      }) ?? null
      : null;

    const workers = this.grantSpawnPointWorkerReward(point, x, z);

    const label = [
      drop ? '遗物落地' : null,
      workers ? `获得木傀儡 ×${workers}` : null
    ].filter(Boolean).join(' · ');
    if (label) {
      const center = new THREE.Vector3(x, 0, z);
      center.y = this.groundHeightAt(center);
      this.effects?.spawnRing?.(center, '#8fe3c8', 1.5, 0.7);
      this.effects?.spawnDamageNumber?.(center, 1, {
        text: `${point.name ?? '刷怪点'}已清除 · ${label}`,
        color: '#bff5e2',
        stroke: '#123a2e',
        height: 2.1,
        duration: 1.5,
        fontSize: 74,
        baseHeight: 0.5
      });
    }
    return { drop, workers };
  }

  /**
   * 把巢穴里那支木傀儡交给玩家。
   *
   * 落点必须先过 `resolveWalkablePoint`：巢穴自身登记了寻路阻挡，直接按几何偏移
   * 落点会踩进阻挡格，那支傀儡就会永远"想走但一步不动"（这个坑在开局傀儡上踩过一次）。
   */
  grantSpawnPointWorkerReward(point, x, z) {
    const reward = point?.workerReward;
    if (!reward?.type) return 0;
    // 定义缺失时安静跳过：宁可不发傀儡，也不要把整局搞崩。
    if (!UNIT_DEFINITIONS[reward.type]) return 0;
    const count = Math.max(1, Math.min(4, Math.floor(Number(reward.count) || 1)));
    const spot = new THREE.Vector3(x - 3.2, 0, z + 3.0);
    const position = this.resolveWalkablePoint(spot);
    position.y = this.groundHeightAt(position);

    const before = new Set((this.friendlyUnits ?? []).map((unit) => unit.id));
    this.summonUnits(reward.type, count, position, 0.7, { select: false });
    const fresh = (this.friendlyUnits ?? []).filter((unit) => (
      unit?.alive && !before.has(unit.id) && unit.type === reward.type
    ));
    fresh.forEach((unit) => {
      this.work?.registerWorker?.(unit, { inventory: this.createWorkerBootstrapInventory(unit.id) });
    });
    return fresh.length;
  }

  /**
   * 傀儡的启动工具。
   *
   * 目前游戏里还没有工具制作链，所以工具的唯一来源就是这里（开局那支 + 刷怪点奖励的那支）。
   * 合成 / 附魔台接上之后，这段要改成"只发开局那一支"，
   * 否则工具会一直免费发，采集需求也就不再有意义。
   */
  createWorkerBootstrapInventory(unitId) {
    const inventory = new Inventory({
      id: `worker:${unitId}`,
      capacity: ITEM_RULES.workerInventorySlots
    });
    ['axe', 'pickaxe'].forEach((itemId) => {
      if (!ITEM_DEFINITIONS[itemId]) return;
      inventory.add(itemId, 1);
    });
    return inventory;
  }

  /**
   * 合成入口（方案第 9 节）。目前只在**基地库存**上合成——熔炉、附魔台这类设施还没做，
   * 所以没有"必须站在某台机器旁边"的限制。整笔原子性由 crafting.js 保证：
   * 材料不够或产物放不下都不会扣掉一半材料。
   */
  craftAtBase(recipeId, { times = 1 } = {}) {
    if (!this.baseInventory) return { ok: false, reason: 'no_inventory', crafted: 0, missing: [] };
    const result = craftIntoInventory(this.baseInventory, recipeId, { times });
    const recipe = recipeById(recipeId);
    if (result.ok) {
      const name = recipe?.name ?? recipeId;
      const center = this.playerBase?.position?.clone?.() ?? new THREE.Vector3();
      if (this.playerBase?.position) {
        center.y = this.groundHeightAt(center);
        this.effects?.spawnRing?.(center, '#9fe8ff', 1.1, 0.6);
        this.effects?.spawnDamageNumber?.(center, 1, {
          text: `合成 ${name} ×${result.crafted}`,
          color: '#cdf3ff',
          stroke: '#123043',
          height: 2.4,
          duration: 1.1,
          fontSize: 76,
          baseHeight: 0.5
        });
      }
      return result;
    }
    const label = CRAFT_ERROR_LABELS[result.reason] ?? '无法合成';
    this.cardSystem?.setHintOnce?.(`${recipe?.name ?? '合成'}：${label}`, `crafting:${recipeId}`);
    return result;
  }

  /**
   * 配方的可读状态：每个配方当前能不能做、缺什么、还差多少。
   * 合成界面直接渲染这个，不要在 UI 里重算库存规则。
   */
  recipeStatus() {
    const inventory = this.baseInventory;
    return allRecipes()
      // 没被科技解锁的配方**根本不出现**在列表里，而不是显示成灰的：
      // 玩家在解锁前不该知道有这么个东西，列表也不该被暂时用不了的条目撑满。
      .filter((raw) => this.research?.recipeUnlocked?.(raw) !== false)
      .map((raw) => {
        const recipe = normalizeRecipe(raw);
        const check = canCraft(inventory, recipe);
        return {
          ...recipe,
          craftable: check.ok,
          reason: check.reason,
          reasonLabel: check.ok ? '' : (CRAFT_ERROR_LABELS[check.reason] ?? ''),
          missing: check.missing,
          inputs: recipe.inputs.map((entry) => ({
            ...entry,
            have: inventory?.countOf?.(entry.itemId) ?? 0
          }))
        };
      });
  }

  /**
   * 这批配方在当前基地库存下最多能连做几批。
   * 界面用它决定"全部合成"按钮显示多少，规则本身在 crafting.js 里。
   */
  maxCraftableTimes(recipeOrId, { limit = 20 } = {}) {
    return maxCraftableTimes(this.baseInventory, recipeOrId, { limit });
  }

  /** I 键 / 常驻入口：基地库存与合成面板。合成不暂停战斗。 */
  toggleBaseStorage() {
    if (!this.baseStorage) return false;
    this.baseStorage.toggle();
    return true;
  }

  /**
   * 详情面板上的招募按钮要显示成什么样。全部规则都在这里算，UI 只负责渲染。
   */
  recruitStatusFor(unit) {
    const hidden = { visible: false, canRecruit: false, orders: 0, label: '', hint: '' };
    if (!unit || unit.alive === false) return hidden;
    if (!this.isSurvivalLevel()) return hidden;
    if (!unit.isRecruitable) return hidden;
    const orders = this.baseInventory?.countOf?.(RECRUITMENT_ORDER_ITEM_ID) ?? 0;
    return {
      visible: true,
      canRecruit: orders > 0,
      orders,
      label: orders > 0 ? '招募' : '缺招募令',
      hint: orders > 0
        ? `消耗 1 张招募令，把${unit.name}招募成自己人`
        : '需要 1 张招募令：在刷怪点拿到深邃核心后，到基地库存（I）里合成'
    };
  }

  /**
   * 把野外中立单位招募成自己人（用户定稿的交互：详情面板按钮 + 消耗一张招募令）。
   *
   * 距离不做限制：用户指定的是"点开面板按按钮"，面板里再要求"必须站到旁边"
   * 就成了一条界面上看不出来的隐藏规则。招募令本身就是"一道命令"，
   * 远程下达是自洽的。若之后要加距离门槛，改这里并同时给出提示文案。
   */
  recruitUnit(unit) {
    if (!unit || unit.alive === false) return { ok: false, reason: 'no_unit' };
    if (!this.isSurvivalLevel()) return { ok: false, reason: 'not_survival_level' };
    if (!unit.isRecruitable) return { ok: false, reason: 'not_recruitable' };
    if (!this.baseInventory) return { ok: false, reason: 'no_inventory' };

    const spent = this.baseInventory.remove(RECRUITMENT_ORDER_ITEM_ID, 1);
    if (!spent.ok) return { ok: false, reason: 'no_order' };

    const changed = this.unitRegistry?.changeTeam?.(unit, TEAMS.PLAYER);
    if (!changed) {
      // 换队失败必须把招募令放回去：刚扣掉 1 张，背包里一定有位置。
      this.baseInventory.add(RECRUITMENT_ORDER_ITEM_ID, 1);
      return { ok: false, reason: 'team_change_failed' };
    }

    unit.isRecruitable = false;
    unit.recruitedAt = this.elapsedTime;
    unit.ownerPlayerId = this.localPlayerSlot ?? null;
    unit.controllerPlayerId = unit.ownerPlayerId;
    unit.statusUiDirty = true;
    // 招募后它是自己人了：别让"野生动物/敌人"那套按类型做的加成继续套用。
    unit.isWildlife = false;

    this.effects?.spawnRing?.(unit.position, '#ffe6a3', 1.0, 0.62);
    this.effects?.spawnDamageNumber?.(unit.position, 1, {
      text: `${unit.name} 已加入`,
      color: '#ffe6a3',
      stroke: '#4a3a12',
      height: unit.projectileHitHeight ?? 1.55,
      duration: 1.2,
      fontSize: 80,
      baseHeight: 0.5
    });
    this.baseStorage?.markDirty?.();
    return { ok: true, unit };
  }

  /** 详情面板上的招募按钮：对当前选中单位调用 recruitUnit。 */
  recruitSelectedUnit() {
    const unit = this.selectedUnit;
    const status = this.recruitStatusFor(unit);
    if (!status.visible) return { ok: false, reason: 'not_recruitable' };
    const result = this.recruitUnit(unit);
    if (!result.ok) {
      const label = result.reason === 'no_order'
        ? '招募需要一张招募令'
        : '这个单位现在无法招募';
      this.cardSystem?.setHintOnce?.(label, `recruit:${unit.id}`);
      return result;
    }
    // 招募成功后立刻切到它，玩家能直接下令——不然还要再点一次才知道成了。
    this.selectUnit(unit);
    this.baseStorage?.markDirty?.();
    return result;
  }

  /**
   * 把一个库存格里的东西整格搬到另一个容器（合成面板里的点击搬运）。
   *
   * 堆叠物走 `transferTo`，实例物走 `transferInstanceTo`——后者必须保留 instanceId，
   * 否则工具会被重新发一个 ID，等于凭空造了第二件。
   * 两者都是库存自己的原子转移：目标装不下就整笔失败，不会出现"两边都没有"的瞬间。
   */
  transferInventoryEntry(source, target, slotIndex) {
    if (!source || !target) return { ok: false, reason: 'no_inventory' };
    const slot = source.slots?.[slotIndex];
    if (!slot?.itemId) return { ok: false, reason: 'empty_slot' };
    const result = slot.instanceId
      ? source.transferInstanceTo(target, slot.instanceId)
      : source.transferTo(target, slot.itemId, slot.count);
    return result?.ok
      ? { ok: true, itemId: slot.itemId, count: slot.count }
      : { ok: false, reason: result?.error ?? 'transfer_failed', itemId: slot.itemId };
  }

  /**
   * 单位的物品背包。傀儡的背包由作业系统创建（`workerInventory`），
   * 战斗单位没有作业系统，所以在这里按需建一个。
   *
   * 不做成"只有傀儡有背包"：方案第 4 节写的是「点击单位同时打开单位与基地背包，
   * 可以把工具、武器和附魔石拖给单位」——能接收物品的单位都得有背包。
   * 建筑除外（它们不是能拿东西的东西）。
   */
  itemBagFor(unit, { create = true } = {}) {
    if (!unit?.id) return null;
    if (unit.workerInventory) return unit.workerInventory;
    if (unit.itemBag) return unit.itemBag;
    if (!create) return null;
    // **必须是真的单位**：基地、资源节点这类对象也有 id，但它们不是能拿东西的东西。
    // 用 `definition` 作为"这是 UnitEntity"的判据，再排除建筑。
    if (!unit.definition) return null;
    if (unit.isBuilding === true || unit.definition.canMove === false) return null;
    unit.itemBag = new Inventory({
      id: `unit:${unit.id}`,
      capacity: ITEM_RULES.combatInventorySlots
    });
    return unit.itemBag;
  }

  /** 基地库存 → 单位背包。 */
  transferBaseSlotToUnit(slotIndex, unit) {
    if (!unit?.alive) return { ok: false, reason: 'no_unit' };
    const bag = this.itemBagFor(unit);
    if (!bag) return { ok: false, reason: 'unit_has_no_bag' };
    const result = this.transferInventoryEntry(this.baseInventory, bag, slotIndex);
    if (result.ok) {
      // 背包缓存不会自己失效：工具列表与卸货清单都从缓存派生，
      // 不通知的话会出现"背包里明明有斧子，规划器还说缺工具"。
      this.work?.notifyInventoryChanged?.(unit);
      this.baseStorage?.markDirty?.();
    }
    return result;
  }

  /** 单位背包 → 基地库存。 */
  transferUnitSlotToBase(slotIndex, unit) {
    const bag = this.itemBagFor(unit, { create: false });
    if (!bag) return { ok: false, reason: 'unit_has_no_bag' };
    const result = this.transferInventoryEntry(bag, this.baseInventory, slotIndex);
    if (result.ok) {
      this.work?.notifyInventoryChanged?.(unit);
      this.baseStorage?.markDirty?.();
    }
    return result;
  }

  /**
   * 从单位背包里装备一件武器（方案第 6.2 节：武器只能换成同类武器）。
   *
   * 三条纪律：
   *   1. **先校验再动手**：家族、射程、投射物、攻击动作四项由 `canEquipWeapon` 判定，
   *      不匹配就整笔拒绝并给出原因，绝不"先脱了旧武器再说"；
   *   2. **换下来的武器必须还回背包**：单位最初手里那把不是物品，
   *      所以第一次换装时按家族物化成"原配武器"物品放进背包（`baselineWeaponItemFor`），
   *      否则每换一次武器就凭空少一把；
   *   3. 背包放不下换下来的武器时**整笔失败**，不做半途而废的交换。
   */
  equipWeaponFromBag(unit, slotIndex) {
    if (!unit?.alive) return { ok: false, reason: 'no_unit' };
    const bag = this.itemBagFor(unit, { create: false });
    if (!bag) return { ok: false, reason: 'unit_has_no_bag', label: '这个单位没有物品背包' };
    const slot = bag.slots[slotIndex] ?? null;
    if (!slot) return { ok: false, reason: 'not_in_bag', label: '背包里没有这件东西' };
    const check = canEquipWeapon(slot.itemId, unit);
    if (!check.ok) return { ok: false, reason: check.reason, label: check.label };

    // 换下来的那把：优先用"上次装上去的那件"，否则把原配武器物化成物品
    const outgoingItemId = unit.weaponItemId ?? baselineWeaponItemFor(check.weapon.family);
    if (outgoingItemId && outgoingItemId === slot.itemId && unit.weaponItemId === slot.itemId) {
      return { ok: false, reason: 'already_equipped', label: '已经装备着这件武器' };
    }

    // 先确认背包腾得出位置：换下来的武器要放回去（武器是实例，按 instanceId 移动）
    const bagSlots = bag.slots;
    const outgoingSlotIndex = slotIndex;
    bagSlots[outgoingSlotIndex] = null;
    let returned = { ok: true };
    if (outgoingItemId) {
      returned = bag.add(outgoingItemId, 1, { allowPartial: false });
      if (!returned.ok) {
        // 放不回去就把新武器放回原格，整笔回滚
        bagSlots[outgoingSlotIndex] = slot;
        return {
          ok: false,
          reason: 'no_space_for_old_weapon',
          label: WEAPON_ERROR_LABELS.no_space_for_old_weapon
        };
      }
    }

    this.applyWeaponToUnit(unit, slot.itemId);
    this.work?.notifyInventoryChanged?.(unit);
    this.baseStorage?.markDirty?.();
    this.cardSystem?.setHintOnce?.(
      `${unit.name}换上了${ITEM_DEFINITIONS[slot.itemId]?.name ?? slot.itemId}`,
      `equip:${unit.id}`
    );
    return {
      ok: true,
      reason: 'none',
      itemId: slot.itemId,
      returnedItemId: outgoingItemId,
      stats: weaponStatPatch(slot.itemId)
    };
  }

  /**
   * 把武器的数值写到单位身上。
   *
   * **`weapon.maxDurability` 与 `weapon.durabilityCost` 都只有 getter**
   * （UnitEntity 用 `bindAttributeGetter` 绑到 attributes 上），直接赋值会抛
   * "Cannot set property ... which has only a getter"。所以这两项要走
   * `attributes.setBase`，和护甲/攻击力是同一条路。
   * `durability` 是普通字段，可以写；换装按"新武器满耐久"处理。
   * 这里**不碰** activityMana（方案第 3 节：活动魔力与武器耐久互不混用）。
   */
  applyWeaponToUnit(unit, itemId) {
    const patch = weaponStatPatch(itemId);
    if (!patch || !unit) return null;
    const attributes = unit.attributes;
    const attribute = patch.damageType === 'magic' ? 'magicAttack' : 'physicalAttack';
    attributes?.setBase?.(attribute, patch.damage, { min: 0 });
    if (Number.isFinite(patch.attackRate)) {
      attributes?.setBase?.('attackRate', patch.attackRate, { min: 0.05 });
    }
    attributes?.setBase?.('maxDurability', patch.maxDurability, { min: 1 });
    attributes?.setBase?.('durabilityCost', patch.durabilityCost, { min: 0 });
    if (unit.weapon) {
      unit.weapon.name = patch.name;
      // 换装给的是满耐久的武器，和刚建出来时一致
      unit.weapon.durability = attributes?.get?.('maxDurability') ?? patch.maxDurability;
    }
    unit.weaponItemId = itemId;
    return patch;
  }

  /** 合成面板搬运失败时的中文原因，UI 直接显示。 */
  transferFailureLabel(reason) {
    const labels = {
      no_unit: '先选中一个己方单位',
      unit_has_no_bag: '这个单位没有物品背包（目前只有傀儡有）',
      empty_slot: '这一格是空的',
      no_space: '对面放不下',
      not_enough: '数量不够',
      unknown_instance: '找不到这件物品'
    };
    return labels[reason] ?? '搬不过去';
  }

  // ---------------------------------------------------------------- 放置建筑
  //
  // 流程：合成面板里点「放置」→ 进入放置模式（地图上跟一个半透明预览）→
  // 左键落地 / 右键或 Esc 取消。落地时才扣物品，取消不扣。
  //
  // 校验规则只有两条，都是"不满足就不能放"而不是"放了再说"：
  //   1. 落点必须可走（`world.isWalkable`）——否则建筑会卡在障碍里；
  //   2. 必须落在某个供能源的半径内——设施是供能接收者，没电的生产设施是摆设。
  //      方案第 9 节的魔力炉就是"为周围生产和战斗提供魔力"，所以"紧邻供能"是既有模型。

  /** 进入放置模式。物品不可放置时明确拒绝并给原因。 */
  beginPlacement(itemId) {
    const definition = ITEM_DEFINITIONS[itemId];
    if (!definition?.placeable?.unitType) return { ok: false, reason: 'not_placeable' };
    if (!UNIT_DEFINITIONS[definition.placeable.unitType]) return { ok: false, reason: 'unknown_building' };
    if (this.baseInventory?.countOf?.(itemId) <= 0) return { ok: false, reason: 'not_in_stock' };
    this.cancelPlacement();
    this.placingItem = { itemId, unitType: definition.placeable.unitType };
    this.createPlacementGhost(definition.placeable.unitType);
    this.cardSystem?.setHint?.(
      `放置${definition.name}：左键落地，右键或 Esc 取消`,
      'placement'
    );
    this.baseStorage?.close?.();
    return { ok: true, itemId, unitType: definition.placeable.unitType };
  }

  cancelPlacement() {
    if (!this.placingItem) return false;
    this.placingItem = null;
    if (this.placementGhost) {
      this.scene.remove(this.placementGhost);
      disposeObject3D(this.placementGhost, { materials: true });
      this.placementGhost = null;
    }
    this.cardSystem?.clearHint?.('placement');
    return true;
  }

  isPlacing() {
    return Boolean(this.placingItem);
  }

  createPlacementGhost(unitType) {
    try {
      const ghost = createUnitModel(unitType, TEAMS.PLAYER);
      // 半透明预览：材质是这一份模型独有的，可以安全改透明度。
      ghost.traverse((node) => {
        if (!node.isMesh) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => {
          if (!material) return;
          material.transparent = true;
          material.opacity = 0.55;
          material.depthWrite = false;
        });
      });
      ghost.userData.isPlacementGhost = true;
      this.scene.add(ghost);
      this.placementGhost = ghost;
      return ghost;
    } catch {
      this.placementGhost = null;
      return null;
    }
  }

  /**
   * 能不能把当前待放置的建筑放在这个点上。
   * 返回的 `label` 可以直接显示给玩家——"放不下"必须说清是哪种放不下。
   */
  canPlaceAt(point) {
    const placing = this.placingItem;
    if (!placing || !point) return { ok: false, reason: 'not_placing', label: '没有正在放置的建筑' };
    const definition = UNIT_DEFINITIONS[placing.unitType];
    const radius = Math.max(0.2, Number(definition?.collisionRadius) || 0.8);
    if (!this.world?.isWalkable?.(point.x, point.z)) {
      return { ok: false, reason: 'blocked', label: '这里放不下（地面不可走）' };
    }
    // 供能源自己不受"必须在供能范围内"约束——魔力炉就是来给远处供能的，
    // 要求它先待在基地旁边等于把它的用途取消掉。它只需要地面可走。
    if (definition?.powerSource === true) {
      return { ok: true, reason: 'none', label: '', radius, supplierId: null };
    }
    const supplier = this.power?.nearestSupplier?.(point.x, point.z) ?? null;
    const inRange = Boolean(supplier && supplier.distance <= supplier.supplier.supplyRadius);
    if (!inRange) {
      return {
        ok: false,
        reason: 'no_power',
        label: `离供能范围太远（基地约 ${Math.round(this.power?.suppliers?.get?.('player-base')?.supplyRadius ?? 20)} 米内）`
      };
    }
    return { ok: true, reason: 'none', label: '', radius, supplierId: supplier.supplier.id };
  }

  /** 放置预览跟着指针走，并用颜色交代"这里能不能放"。 */
  updatePlacementPreview(clientX, clientY) {
    if (!this.placingItem) return null;
    const point = this.groundPointFromClient(clientX, clientY);
    if (!point) return null;
    const check = this.canPlaceAt(point);
    if (this.placementGhost) {
      this.placementGhost.position.copy(point);
      this.placementGhost.visible = true;
      this.placementGhost.userData.placementValid = check.ok === true;
    }
    return { point, check };
  }

  /**
   * 落地。成功才扣物品，并把建筑登记成生产者（如果有生产配方）。
   * 校验失败时**什么都不扣**，只给提示——这是放置流程最容易写错的地方。
   */
  confirmPlacement(point) {
    const placing = this.placingItem;
    if (!placing) return { ok: false, reason: 'not_placing' };
    // 统一成 Vector3 再往下走：canPlaceAt 只读 x/z（可以接受普通对象），
    // 但 buildStructureUnit 会调 point.clone()。同一个 API 不该一半接受普通对象、
    // 一半要求 Vector3——调用方传 {x,z} 时直接 TypeError 是最难查的那种错。
    const spot = point?.clone
      ? point
      : new THREE.Vector3(Number(point?.x) || 0, 0, Number(point?.z) || 0);
    const check = this.canPlaceAt(spot);
    if (!check.ok) {
      this.cardSystem?.setHintOnce?.(check.label, 'placement-blocked');
      return { ok: false, reason: check.reason, label: check.label };
    }
    const spent = this.baseInventory.remove(placing.itemId, 1);
    if (!spent.ok) {
      this.cancelPlacement();
      return { ok: false, reason: 'not_in_stock' };
    }
    const unit = this.buildStructureUnit(placing.unitType, spot, { buildSeconds: 6 });
    const producer = this.production?.registerProducer?.(unit) ?? null;
    // 燃料供能设施（魔力炉）注册成供能源；它没有生产配方，所以 producer 为空。
    const burner = this.fuelPower?.registerBurner?.(unit) ?? null;
    // 树坑：注册成种植地块（种树苗 → 长成 → 可砍）
    const plot = this.planting?.registerPlot?.(unit) ?? null;
    // 箭塔 / 食堂：注册成"要魔力的设施"（魔力耗尽就停机）
    const facility = this.facilities?.registerFacility?.(unit) ?? null;
    this.effects?.spawnRing?.(unit.position, '#a9f0d8', 1.3, 0.6);
    this.cardSystem?.setHintOnce?.(
      producer ? `${UNIT_DEFINITIONS[placing.unitType].name}已动工，建成后开始生产`
        : (burner ? `${UNIT_DEFINITIONS[placing.unitType].name}已动工，建成后开始供能`
          : (plot ? `${UNIT_DEFINITIONS[placing.unitType].name}已动工，建成后开始种树`
            : (facility ? `${UNIT_DEFINITIONS[placing.unitType].name}已动工，建成后需要魔力驱动` : '建筑已动工'))),
      'placement-done'
    );
    this.cancelPlacement();
    this.baseStorage?.markDirty?.();
    return {
      ok: true,
      unit,
      producer: Boolean(producer),
      burner: Boolean(burner),
      plot: Boolean(plot),
      facility: Boolean(facility)
    };
  }

  /** 左键按下时优先尝试放置：成功/失败都吃掉这次点击，别再当成框选。 */
  tryPlaceAtPointer(event) {
    if (!this.placingItem) return false;
    const point = this.groundPointFromClient(event.clientX, event.clientY);
    if (!point) return false;
    this.confirmPlacement(point);
    return true;
  }

  /** 快捷栏槽位：基地里当前可放置的建筑（按物品定义里的 `placeable` 判定）。 */
  hotbarItems() {
    const inventory = this.baseInventory;
    if (!inventory) return [];
    const entries = [];
    inventory.slots.forEach((slot) => {
      if (!slot?.itemId) return;
      const definition = ITEM_DEFINITIONS[slot.itemId];
      if (!definition?.placeable?.unitType) return;
      const existing = entries.find((entry) => entry.itemId === slot.itemId);
      if (existing) {
        existing.count += slot.count;
        return;
      }
      entries.push({ itemId: slot.itemId, name: definition.name, count: slot.count });
    });
    return entries;
  }

  /**
   * 数字键 / 点击快捷栏：进入该建筑的放置模式；再按同一个键取消。
   * 槽位是按"库存里现在有什么"动态算的，所以按键与物品的对应关系随时可能变——
   * 这也是为什么取消的条件是"当前正在放的就是这一件"，而不是记住槽位号。
   */
  activateHotbarSlot(index) {
    const items = this.hotbarItems();
    const entry = items[index] ?? null;
    if (!entry) return { ok: false, reason: 'empty_slot' };
    if (this.placingItem?.itemId === entry.itemId) {
      this.cancelPlacement();
      this.hotbar?.refresh?.();
      return { ok: true, cancelled: true, itemId: entry.itemId };
    }
    const result = this.beginPlacement(entry.itemId);
    this.hotbar?.refresh?.();
    return result;
  }

  finishLevel(victory, { endReason = null } = {}) {
    if (this.levelFinished) return;
    this.levelFinished = true;
    this.levelEndReason = endReason;
    this.stop();
    const result = this.createLevelResult(victory, this.localPlayerSlot, endReason);
    if (this.coop?.enabled && this.networkRole === 'host') {
      const resultsByPlayerId = Object.fromEntries(Object.keys(this.players ?? {}).map((playerId) => [
        playerId,
        this.createNetworkLevelResult(victory, playerId, endReason)
      ]));
      this.networkBridge?.publishMatchResult?.(resultsByPlayerId);
    }
    this.onLevelComplete?.(result);
  }

  createLevelResult(victory, playerId, endReason = this.levelEndReason) {
    const rewardMultiplier = this.abilitiesFor(playerId)?.getRewardMultiplier?.() ?? 1;
    const endless = this.isEndlessMode();
    return {
      victory,
      endReason,
      endingDifficulty: endless ? this.endlessDifficulty : null,
      elapsedTime: this.elapsedTime,
      wave: this.wave,
      session: this.levelSession,
      playerBaseHealth: this.playerBase.health,
      enemyCampHealth: this.enemyCamp.health,
      bossesDefeated: this.bossesDefeated,
      rewardMultiplier,
      authoritativeReward: victory
        ? (endless
          ? calculateEndlessReward(this.endlessDifficulty, this.elapsedTime, rewardMultiplier)
          : calculateLevelReward({
            level: this.levelSession.level,
            difficulty: this.levelSession.difficulty,
            elapsedTime: this.elapsedTime,
            rewardMultiplier
          }))
        : 0,
      returnToMenu: this.coop?.enabled === true
    };
  }

  createNetworkLevelResult(victory, playerId, endReason = this.levelEndReason) {
    const result = this.createLevelResult(victory, playerId, endReason);
    const { session, returnToMenu, ...networkResult } = result;
    return networkResult;
  }

  finishNetworkLevel(networkResult = {}) {
    if (this.levelFinished || this.destroyed) return;
    this.levelFinished = true;
    this.stop();
    const result = {
      ...this.createLevelResult(Boolean(networkResult.victory), this.localPlayerSlot),
      ...networkResult,
      session: this.levelSession,
      returnToMenu: true
    };
    this.onLevelComplete?.(result);
  }

  setPaused(paused, reason = '设置') {
    if (this.destroyed || this.levelFinished) return;
    if (this.networkTerminated && !paused) return;
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
    if (this.networkApplyingCommand
      && this.activeEconomySlot
      && this.activeEconomySlot !== this.localPlayerSlot) {
      return;
    }
    const previousSelection = [...this.selectedUnits];
    const unique = new Set();
    previousSelection.forEach((unit) => {
      unit.statusUiDirty = true;
    });
    const filtered = units.filter((unit) => {
      const canSelect = mode === 'box'
        ? this.canControlUnit(unit)
        : this.canInspectUnit(unit);
      if (!unit?.alive || unique.has(unit.id) || !canSelect) return false;
      unique.add(unit.id);
      return true;
    });
    this.selectedUnits = filtered;
    this.selectedUnitIds = new Set(this.selectedUnits.map((unit) => unit.id));
    this.selectedUnits.forEach((unit) => {
      unit.statusUiDirty = true;
    });
    this.selectedUnit = this.selectedUnits[0] ?? null;
    this.selectionMode = this.selectedUnits.length ? mode : 'none';
    previousSelection.forEach((unit) => {
      if (!this.selectedUnitIds.has(unit.id) && unit.selectedByPlayerId === this.localPlayerSlot) {
        this.applyUnitSelectionState(unit, false, null);
      }
    });
    this.selectedUnits.forEach((unit) => {
      if (this.canControlUnit(unit)) {
        this.applyUnitSelectionState(unit, true, this.localPlayerSlot);
      }
    });
    if (this.cameraFollowEnabled && this.selectedUnits.length === 0) {
      this.setCameraFollowEnabled(false);
    } else {
      this.syncCameraFollowUi();
    }
    this.sendNetworkSelectionState();
  }

  showNetworkTerminatedDialog() {
    if (this.destroyed || this.networkTerminated) return;
    this.networkTerminated = true;
    this.paused = true;
    document.body.classList.add('is-game-paused');
    this.cancelCameraDrag();
    this.cancelSelectionDrag();
    this.cardSystem?.cancelActiveDrag?.();
    if (this.dom.pauseOverlay) this.dom.pauseOverlay.hidden = true;
    if (this.strategyEventUi?.root) this.strategyEventUi.root.hidden = true;
    if (this.runShopUi?.overlay) this.runShopUi.overlay.hidden = true;
    document.body.classList.remove('is-strategy-event-open', 'is-run-shop-open');

    const overlay = document.createElement('section');
    overlay.className = 'network-terminated-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'network-terminated-title');
    overlay.innerHTML = `
      <div class="network-terminated-panel">
        <div class="network-terminated-kicker">联机中断</div>
        <h2 id="network-terminated-title">对局已终止</h2>
        <p>Host 连接已经中断，权威战斗状态无法继续。本局不能回连。</p>
        <button type="button" class="network-terminated-exit">退出对局</button>
      </div>
    `;
    document.body.appendChild(overlay);
    this.networkTerminatedOverlay = overlay;
    const exitButton = overlay.querySelector('.network-terminated-exit');
    exitButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onExitToMenu?.();
    }, { signal: this.eventController.signal });
    exitButton?.focus();
    this.clock.getDelta();
  }

  sendNetworkSelectionState() {
    if (!this.networkBridge?.shouldRouteLocalCommands?.()) return false;
    return Boolean(this.networkBridge.commandSender?.selectionSet?.(this.selectedControllableUnitIds()));
  }

  selectedControllableUnitIds() {
    return this.selectedUnits
      .filter((unit) => this.canControlUnit(unit))
      .map((unit) => unit.id);
  }

  applyUnitSelectionState(unit, selected, selectedByPlayerId = null) {
    if (!unit) return;
    const nextSelected = Boolean(selected && selectedByPlayerId);
    unit.selected = nextSelected;
    unit.selectedByPlayerId = nextSelected ? selectedByPlayerId : null;
    let ring = unit.networkSelectionRing;
    if (nextSelected && !ring) {
      ring = createSelectionRing(this.playerVisualColor(selectedByPlayerId));
      ring.traverse((child) => child.layers.set(0));
      ring.position.set(0, 0.05, 0);
      unit.mesh.add(ring);
      unit.networkSelectionRing = ring;
    }
    if (!ring) return;
    ring.visible = nextSelected;
    if (nextSelected) applyPlayerMarkerColor(ring, this.playerVisualColor(selectedByPlayerId));
  }

  onCanvasPointerDown(event) {
    if (event.target !== this.canvas) return;
    this.pointerScreen.set(event.clientX, event.clientY);

    if (event.pointerType === 'touch') {
      event.preventDefault();
      this.resetTouchInteractionForPrimaryPointerDown(event);
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
      // 放置模式里右键是"取消"，不能顺手把部队派过去
      if (this.isPlacing()) {
        this.cancelPlacement();
        return;
      }
      this.issueMoveCommand(event);
      return;
    }

    if (event.button !== 0 || this.cardSystem.drag) return;
    if (this.lootDrops?.tryOpenPickup(event)) return;
    // 放置模式：左键落地。无论成功与否都吃掉这次点击，避免顺带拉出一个框选。
    if (this.tryPlaceAtPointer(event)) {
      event.preventDefault();
      return;
    }
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
    if (isTextInputTarget(event.target)) return;
    if (this.networkTerminated) {
      event.preventDefault();
      return;
    }
    const cameraMoveKey = cameraMoveKeyForEvent(event);
    if (cameraMoveKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.setCameraFollowEnabled(false);
      this.cameraMoveKeys.add(cameraMoveKey);
      return;
    }
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    // E：给鼠标指向（其次当前选中）的己方单位打开符文背包；再按一次关闭两个背包。
    if (key === 'e' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.toggleUnitRuneBackpack();
      return;
    }
    // B：打开基地背包，居中显示，只展示基地存储。
    if (key === 'b' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.toggleBaseRuneBackpack();
      return;
    }
    // I：基地库存与合成面板。E/B 已经被符文背包占用，所以库存另给一个键。
    if (key === 'i' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.toggleBaseStorage();
      return;
    }
    // 数字键 1-9：物品快捷栏。放的是基地里可放置的建筑，按一次进入放置模式，
    // 再按一次取消——比"开面板找那件东西点放置"少两步。
    if (!event.ctrlKey && !event.metaKey && !event.altKey && /^[1-9]$/.test(key)) {
      const slotIndex = Number(key) - 1;
      const result = this.activateHotbarSlot(slotIndex);
      if (result?.ok) {
        event.preventDefault();
        return;
      }
    }
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
      // 放置模式优先取消，不要一点 Esc 就把整个游戏暂停了
      if (this.isPlacing()) {
        this.cancelPlacement();
        return;
      }
      // 符文背包：Esc 与再按一次 E 等价，两个背包一起关闭。
      if (this.runeBackpack?.isOpen()) {
        this.runeBackpack.close();
        return;
      }
      if (this.baseStorage?.isOpen()) {
        this.baseStorage.close();
        return;
      }
      if (this.battleDebugPanel?.isOpen()) {
        this.battleDebugPanel.close();
        return;
      }
      if (this.runShopOpen) {
        this.escapeRunShop();
        return;
      }
      this.setPaused(!this.paused, '设置');
      return;
    }
    if (key === 'n') {
      event.preventDefault();
      if (!event.shiftKey) {
        this.battleDebugPanel?.toggle();
        return;
      }
      this.setNavDebugEnabled(!this.navDebugEnabled);
      this.cardSystem?.setHint?.(
        this.navDebugEnabled ? '寻路网格：开启（Shift+N 关闭）' : '寻路网格：关闭（Shift+N 开启）',
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
    if (key === 'f') {
      event.preventDefault();
      this.toggleCameraFollow();
      return;
    }
    if (!this.selectedUnits.some((unit) => unit.alive && unit.team === TEAMS.PLAYER)) return;
    if (key === 'x') {
      event.preventDefault();
      this.stopSelectedUnits();
    }
  }

  onKeyUp(event) {
    const cameraMoveKey = cameraMoveKeyForEvent(event);
    if (!cameraMoveKey) return;
    this.cameraMoveKeys.delete(cameraMoveKey);
  }

  onCanvasPointerMove(event) {
    // 放置预览跟着指针走：不更新的话玩家看不到自己要放在哪
    if (this.isPlacing()) this.updatePlacementPreview(event.clientX, event.clientY);
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
      this.setCameraFollowEnabled(false);
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

  resetTouchInteractionForPrimaryPointerDown(event) {
    if (event.pointerType !== 'touch' || event.isPrimary !== true) return;
    if (this.touchGesture) {
      this.cancelTouchGesture();
    }
    if (this.cameraDrag?.mode === 'touch-pan') {
      if (this.cameraDrag.pointerId != null) {
        safeReleasePointerCapture(this.canvas, this.cameraDrag.pointerId);
      }
      this.cancelCameraDrag();
    }
    if (this.selectionDrag?.pointerId != null) {
      this.cancelSelectionDrag();
    }
    this.activeTouchPointers.clear();
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
      this.canControlUnit(unit) &&
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
      .filter((unit) => unit?.alive && unit.mesh?.children?.length && (
        options.ignoreOwnership || this.canControlUnit(unit) || unit.team !== TEAMS.PLAYER
      ))
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
      if (!unit.alive || !this.canControlUnit(unit)) return false;
      const screen = this.worldToScreen(unit.position);
      return screen.x >= minX && screen.x <= maxX && screen.y >= minY && screen.y <= maxY;
    });
  }

  issueMoveCommand(event) {
    const point = this.groundPointFromClient(event.clientX, event.clientY);
    if (!point || !this.selectedUnits.length) return false;
    if (this.networkBridge?.shouldRouteLocalCommands?.()) {
      const unitIds = this.selectedControllableUnitIds();
      if (!unitIds.length) return false;
      return Boolean(this.networkBridge?.commandSender?.issueMove(unitIds, point));
    }
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
    // 点在一个还能采的资源点附近时，选中的傀儡改为「去采这里」而不是走过去站着。
    // 只在这里（一次点击）做节点距离判定，绝不放进每帧循环——activeNodes() 会遍历节点表。
    if (this.issueHarvestOrders(commandCenter, units)) return true;
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
      // 移动途中遇敌会先追击作战、打完继续前往；到达目的地后把落点记为新的返回位置
      unit.homePoint = null;
      if (forceMove) forceMoveUnits.push(unit);
    });
    if (!commanded) return false;
    this.attacks.cancelPendingAttacksFor(forceMoveUnits);
    this.effects.spawnMoveDestination(
      commandCenter,
      formationRadius,
      this.playerVisualColor(units[0] ?? this.localPlayerSlot)
    );
    return true;
  }

  // 右键点在一个还能采的资源点附近时的「派活」分支。
  //
  // 放在这里而不是每帧逻辑里：节点距离判定只应在玩家点击时做一次，
  // resourceNodes.activeNodes() 会遍历整张节点表，放进 update 就是每帧全表扫描。
  //
  // 返回 true 表示这次点击已经变成采集指令，调用方不要再补一条移动指令。
  // 选中的非傀儡单位不受影响，仍然走原来的移动流程。
  issueHarvestOrders(commandPoint, units) {
    if (!this.work || !commandPoint) return false;
    const nodes = this.resourceNodes;
    if (!nodes?.activeNodes) return false;
    const range = RESOURCE_NODE_RULES.harvestRange;
    let target = null;
    let bestDistance = Infinity;
    nodes.activeNodes().forEach((node) => {
      const distance = Math.hypot((node.x ?? 0) - commandPoint.x, (node.z ?? 0) - commandPoint.z);
      if (distance > range || distance >= bestDistance) return;
      target = node;
      bestDistance = distance;
    });
    if (!target) return false;
    let assigned = 0;
    units.forEach((unit) => {
      if (unit.isWorker !== true) return;
      if (this.work.assignNode(unit, target.id)) assigned += 1;
    });
    if (!assigned) return false;
    const color = this.playerVisualColor(units[0] ?? this.localPlayerSlot);
    // 节点状态里只有 x/z，落点特效需要地面高度，所以过一次 resolveCommandPoint
    const marker = this.resolveCommandPoint(new THREE.Vector3(target.x, 0, target.z));
    this.effects.spawnMoveDestination(marker ?? target, range * 0.8, color);
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
    if (this.networkBridge?.shouldRouteLocalCommands?.()) {
      const unitIds = this.selectedControllableUnitIds();
      if (unitIds.length) this.networkBridge.commandSender?.issueStop?.(unitIds);
      return;
    }
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
      unit.homePoint = null;
      unit.knockbackVelocity.set(0, 0, 0);
    });
    this.attacks.cancelPendingAttacksFor(units);
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
      this.sendNetworkSelectionState();
    }
    this.selectedUnit = this.selectedUnits[0] ?? null;
    if (this.cameraFollowEnabled && this.selectedUnits.length === 0) {
      this.setCameraFollowEnabled(false);
    }
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
    if (structure === this.playerBase) {
      this.renderRebirthQueueStatus(element.parts.rebirthQueue);
    } else if (element.parts.rebirthQueue) {
      element.parts.rebirthQueue.hidden = true;
    }
    updateHealthTicks(element.parts.ticks, structure.maxHealth);
    const screen = this.projectWorldUi(structure.position, structure.statusHeight ?? 2.8);
    element.hidden = !structure.alive || !screen.visible;
    if (element.hidden) return;
    element.style.transform = `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -100%)`;
  }

  renderRebirthQueueStatus(container) {
    if (!container) return;
    const entries = (this.rebirthQueue ?? [])
      .filter((entry) => entry && finiteNumber(entry.remaining, 0) > 0)
      .sort((a, b) => finiteNumber(a.remaining, 0) - finiteNumber(b.remaining, 0));
    if (!entries.length) {
      container.hidden = true;
      container.innerHTML = '';
      container.dataset.rebirthSignature = '';
      return;
    }
    container.hidden = false;
    const visible = entries.slice(0, 5);
    const overflow = Math.max(0, entries.length - visible.length);
    const signature = [
      ...visible.map((entry) => [
        entry.id,
        entry.type,
        entry.ownerPlayerId,
        Math.ceil(finiteNumber(entry.remaining, 0))
      ].join(':')),
      overflow > 0 ? `+${overflow}` : ''
    ].join('|');
    if (container.dataset.rebirthSignature === signature) return;
    container.dataset.rebirthSignature = signature;
    container.innerHTML = `${visible.map((entry) => {
      const name = entry.name ?? UNIT_DEFINITIONS[entry.type]?.name ?? '单位';
      const icon = rebirthUnitIconMarkup(entry.type, name);
      const seconds = Math.ceil(finiteNumber(entry.remaining, 0));
      const color = PLAYER_VISUAL_COLORS[
        Math.max(0, Math.min(PLAYER_VISUAL_COLORS.length - 1, Math.floor(entry.playerColorIndex ?? 0)))
      ] ?? this.playerVisualColor(entry.ownerPlayerId);
      return `
        <span class="world-rebirth-token" style="--rebirth-color: ${escapeHtml(color)}" title="${escapeHtml(`${name}复活中 ${seconds}s`)}">
          <span class="world-rebirth-avatar">${icon}</span>
          <span class="world-rebirth-time">${seconds}s</span>
        </span>
      `;
    }).join('')}${overflow > 0 ? `
      <span class="world-rebirth-token is-overflow" title="${escapeHtml(`还有 ${overflow} 个单位复活中`)}">
        <span class="world-rebirth-avatar">+</span>
        <span class="world-rebirth-time">${overflow}</span>
      </span>
    ` : ''}`;
  }

  spendStructureDurability(structure, amount = 1) {
    if (!structure) return;
    if (this.levelTestMode && structure === this.playerBase) return;
    structure.structureDurability = Math.max(
      0,
      (structure.structureDurability ?? 0) - Math.max(0, amount)
    );
  }

  repairStructure(structure, {
    health = 0,
    durability = 0,
    healthPercent = 0,
    durabilityPercent = 0
  } = {}) {
    if (!structure?.alive) return { health: 0, durability: 0 };
    const previousHealth = structure.health;
    const healthGain = Math.max(0, health + structure.maxHealth * healthPercent);
    // 基地类结构用 structureDurability，普通建筑用 weapon.durability
    const durabilityReference = Number.isFinite(structure.maxStructureDurability)
      ? structure.maxStructureDurability
      : (structure.weapon?.maxDurability ?? 0);
    const durabilityGain = Math.max(0, durability + durabilityReference * durabilityPercent);
    if (healthGain > 0) {
      structure.health = Math.min(structure.maxHealth, structure.health + healthGain);
      registerStructureHealthLoss(structure, previousHealth, this.elapsedTime);
    }
    if (durabilityGain > 0) {
      if (Number.isFinite(structure.maxStructureDurability)) {
        structure.structureDurability = Math.min(
          structure.maxStructureDurability,
          (structure.structureDurability ?? 0) + durabilityGain
        );
      } else if (structure.weapon?.maxDurability) {
        structure.weapon.durability = Math.min(
          structure.weapon.maxDurability,
          (structure.weapon.durability ?? 0) + durabilityGain
        );
      }
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
    const displayedWave = this.currentWave ?? this.waveSchedule[this.waveIndex] ?? null;
    if (this.isEndlessMode()) {
      this.dom.waveLabel.textContent = displayedWave
        ? String(displayedWave.index)
        : String(Math.max(1, this.wave || 1));
    } else {
      this.dom.waveLabel.textContent = displayedWave
        ? `${displayedWave.index}/${this.waveSchedule.length}`
        : `${this.waveSchedule.length}/${this.waveSchedule.length}`;
    }
    if (this.dom.silverCount) {
      this.dom.silverCount.textContent = formatSilverAmount(this.getSilver());
    }
    if (this.isEndlessMode()) {
      if (this.dom.battleTimeLabel) this.dom.battleTimeLabel.textContent = '难度';
      this.dom.battleTime.textContent = Number(this.endlessDifficulty || 0).toFixed(1);
      this.dom.battleTime.closest('.meter-time')?.classList.remove('is-expired');
    } else {
      if (this.dom.battleTimeLabel) this.dom.battleTimeLabel.textContent = '目标剩余';
      const targetTime = Math.max(0, Number(this.levelSession.level.targetTime ?? 0));
      const targetTimeRemaining = Math.max(0, targetTime - this.elapsedTime);
      this.dom.battleTime.textContent = formatBattleTime(targetTimeRemaining);
      this.dom.battleTime.closest('.meter-time')?.classList.toggle(
        'is-expired',
        targetTime > 0 && targetTimeRemaining <= 0
      );
    }
    this.dom.unitCount.textContent = String(this.friendlyUnits.length);
    // 海岛关没有波次：把「当前波次」计数器与波次情报整块隐藏（CSS 里按 is-survival 压
    // display），只留时间与刷怪点进度。否则生存关会显示「当前波次 1/21」这种误导信息。
    this.dom.wavePanel?.classList.toggle('is-survival', this.isSurvivalLevel());
    // 海岛关：显示刷怪点清除进度（「清除全部刷怪点」是本关的胜利条件）。
    // 其它关卡没有刷怪点，整行保持隐藏。
    if (this.dom.spawnPointMeter) {
      const spawnProgress = this.spawnPoints?.progress?.();
      const showSpawnPoints = Boolean(spawnProgress?.total);
      this.dom.spawnPointMeter.hidden = !showSpawnPoints;
      if (showSpawnPoints && this.dom.spawnPointCount) {
        // 胜利条件是「全部点位摧毁 **且** 残余敌人清空」，所以 4/4 不代表已经赢。
        // 点位全清之后必须把还剩几个敌人也显示出来，否则玩家会以为卡住了。
        const remaining = this.spawnPoints?.aliveByPoint?.() ?? {};
        const remainingCount = Object.values(remaining).reduce((sum, count) => sum + count, 0);
        const label = spawnProgress.allCleared && remainingCount > 0
          ? `${spawnProgress.cleared}/${spawnProgress.total} · 残敌 ${remainingCount}`
          : `${spawnProgress.cleared}/${spawnProgress.total}`;
        if (this.dom.spawnPointCount.textContent !== label) {
          this.dom.spawnPointCount.textContent = label;
        }
      }
    }
    if (this.selectedUnits.length > 1) {
      if (this.dom.selectedPanel) {
        this.dom.selectedPanel.hidden = false;
        this.dom.selectedPanel.dataset.selection = 'group';
        this.dom.selectedPanel.dataset.team = 'player';
      }
      // 多选不显示招募按钮：招募是单个单位的事，留着会让人以为能整队招募。
      if (this.dom.selectedRecruitButton) this.dom.selectedRecruitButton.hidden = true;
      const totalHealth = formatDisplayedHealth(
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
      if (this.dom.selectedPanel) {
        this.dom.selectedPanel.hidden = false;
        this.dom.selectedPanel.dataset.selection = 'unit';
        this.dom.selectedPanel.dataset.team = this.selectedUnit.team === TEAMS.PLAYER ? 'player' : 'enemy';
      }
      const unit = this.selectedUnit;
      const hp = formatDisplayedHealth(unit.health);
      const shield = Math.round(unit.shield);
      const durability = Math.round(unit.weapon.durability);
      const maxDurability = Math.round(unit.weapon.maxDurability);
      const teamLabel = unit.team === TEAMS.PLAYER ? '友军' : '敌方';
      const physicalAttack = formatSupportAmount(this.modifiers.getPhysicalAttack(unit));
      const magicAttack = formatSupportAmount(this.modifiers.getMagicAttack(unit));
      const armor = formatSignedStat(this.modifiers.getArmor(unit));
      const magicResistance = formatSignedStat(this.modifiers.getMagicResistance(unit));
      const dodgeChance = Math.round(this.modifiers.getDodgeChance(unit) * 100);
      const knockbackResistance = Math.round(this.modifiers.getKnockbackResistance(unit) * 100);
      this.dom.selectedName.textContent = `${teamLabel} ${unit.name} #${unit.id}`;
      // 野外中立单位：队友/敌人都不合适，明确写成"野外单位"，并把招募按钮亮出来。
      const recruit = this.recruitStatusFor(unit);
      if (this.dom.selectedName && unit.isRecruitable) {
        this.dom.selectedName.textContent = `野外单位 ${unit.name} #${unit.id}`;
      }
      if (this.dom.selectedRecruitButton) {
        this.dom.selectedRecruitButton.hidden = !recruit.visible;
        if (recruit.visible) {
          this.dom.selectedRecruitButton.textContent = recruit.label;
          this.dom.selectedRecruitButton.disabled = !recruit.canRecruit;
          this.dom.selectedRecruitButton.title = recruit.hint;
        }
      }
      this.dom.selectedStats.textContent =
        `HP ${hp}/${Math.round(unit.maxHealth)} / 护盾 ${shield}/${Math.round(unit.maxShield)} / 武器 ${unit.weapon.name} / 耐久 ${durability}/${maxDurability}`;
      this.dom.selectedEnchants.textContent =
        `物攻 ${physicalAttack} / 魔攻 ${magicAttack} / 护甲 ${armor} / 魔抗 ${magicResistance} / 闪避 ${dodgeChance}% / 抗击退 ${knockbackResistance}% / 符文背包 ${this.runeStones?.stonesForUnit?.(unit)?.length ?? 0}/${Math.max(0, Math.floor(unit.maxEnchantmentSlots ?? 5))} / 符文 ${this.formatRuneStoneList(unit) || '-'}`;
    } else {
      if (this.dom.selectedPanel) {
        this.dom.selectedPanel.hidden = true;
        delete this.dom.selectedPanel.dataset.selection;
        delete this.dom.selectedPanel.dataset.team;
      }
      if (this.dom.selectedRecruitButton) this.dom.selectedRecruitButton.hidden = true;
      this.dom.selectedName.textContent = '未选中';
      this.dom.selectedStats.textContent = 'HP - / 武器 -';
      this.dom.selectedEnchants.textContent = '附魔 -';
    }
    this.syncCameraFollowUi();
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
        ? `${formatPerfSeconds(latest.elapsedTime)} / W${latest.wave ?? 0} / peak ${this.perfHistory.length}s`
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
    const network = this.networkBridge?.getNetworkDiagnosticsSnapshot?.() ?? null;
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
        network ? perfStat('Net', networkSummary(network)) : '',
        workerError
      ].filter(Boolean).join('')}</div>`,
      profilerTableMarkup('Top Systems', topSections),
      profilerTableMarkup('Combat Details', combatRows),
      network ? networkDiagnosticsMarkup(network) : ''
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
      network: this.networkBridge?.getNetworkDiagnosticsSnapshot?.() ?? null,
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
      enemyDirector: this.enemyDirectorSnapshot(),
      pendingStrategyRewards: this.pendingStrategyRewards.length,
      currentEnemyForce: this.currentEnemyForce
        ? {
            id: this.currentEnemyForce.id,
            kind: this.currentEnemyForce.kind,
            count: this.currentEnemyForce.count,
            waveIndex: this.currentEnemyForce.index,
            difficulty: this.currentEnemyForce.effectiveDifficulty
          }
        : null,
      baseHealth: Math.round(this.playerBase.health),
      enemyCampHealth: Math.round(this.enemyCamp.health),
      rebirthQueue: this.serializeRebirthQueue(),
      selectedCount: this.selectedUnits.length,
      selectedIds: this.selectedUnits.map((unit) => unit.id),
      altars: this.altars.snapshot(),
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
            hp: formatDisplayedHealth(this.selectedUnit.health),
            weapon: Math.round(this.selectedUnit.weapon.durability),
            enchantments: [...this.selectedUnit.enchantments.keys()],
            maxEnchantmentSlots: this.selectedUnit.maxEnchantmentSlots ?? 5,
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
        hp: formatDisplayedHealth(unit.health),
        screen: this.worldToScreen(unit.position)
      })),
      enemySample: this.enemyUnits.slice(0, 8).map((enemy) => ({
        id: enemy.id,
        type: enemy.type,
        x: Number(enemy.position.x.toFixed(2)),
        y: Number(enemy.position.y.toFixed(2)),
        z: Number(enemy.position.z.toFixed(2)),
        hp: formatDisplayedHealth(enemy.health),
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

function resolveKillOwnerSlot(game, source) {
  if (!game?.coop?.enabled || !game.players) {
    return game?.localPlayerSlot ?? 'local-player';
  }
  const owner = source?.ownerPlayerId;
  if (owner && game.players[owner]) return owner;
  // 基地 / 无归属：返回 null，由发放逻辑给双方
  return null;
}

function normalizeLevelSession(session) {
  const fallbackLevel = LEVEL_DEFINITIONS[0] ?? {
    id: 'debug',
    name: '调试关卡',
    baseReward: 0,
    targetTime: 180
  };
  const fallbackDeck = CARD_DEFINITIONS
    .filter((card) => !card.lootOnly && !card.retired)
    .slice(0, 5)
    .map((card, index) => ({
      ...card,
      level: 1,
      instanceId: `debug-${card.id}-${index}`
    }));
  const level = session?.level ?? fallbackLevel;
  const challengeMode = normalizeChallengeMode(session?.challengeMode);
  const normalizeRuntimeDeck = (deck) => (
    isEndlessMode(challengeMode)
      ? resetEndlessDeckLevels(deck)
      : deck
  );
  const sessionDeck = Array.isArray(session?.deck) ? session.deck : fallbackDeck;
  const normalized = {
    level,
    difficulty: clampLevelDifficulty(session?.difficulty ?? 1),
    challengeMode,
    deck: normalizeRuntimeDeck(sessionDeck),
    cardLevels: normalizeSessionCardLevels(session?.cardLevels, sessionDeck, challengeMode),
    debug: session?.debug === true,
    startedAt: session?.startedAt ?? Date.now()
  };
  if (session?.mode === 'coop' || session?.mode === 'multiplayer') {
    normalized.mode = 'multiplayer';
    normalized.networkRole = session.networkRole ?? 'offline';
    normalized.localPlayerId = session.localPlayerId ?? session.localPlayerSlot;
    normalized.localPlayerSlot = normalized.localPlayerId;
    normalized.hostPlayerId = session.hostPlayerId ?? session.matchRules?.hostPlayerId ?? null;
    normalized.matchId = session.matchId ?? null;
    normalized.matchRules = session.matchRules ?? null;
    normalized.roomId = session.roomId ?? null;
    normalized.matchSeed = session.matchSeed ?? Date.now();
    normalized.coop = session.coop ?? null;
    normalized.players = session.players
      ? Object.fromEntries(Object.entries(session.players).map(([playerId, player]) => [
          playerId,
          {
            ...player,
            deck: normalizeRuntimeDeck(Array.isArray(player?.deck) ? player.deck : []),
            cardLevels: normalizeSessionCardLevels(
              player?.cardLevels,
              Array.isArray(player?.deck) ? player.deck : [],
              challengeMode
            )
          }
        ]))
      : null;
  }
  return normalized;
}

function normalizeSessionCardLevels(sourceLevels, deck = [], challengeMode = 'standard') {
  const levels = {};
  Object.entries(sourceLevels ?? {}).forEach(([id, level]) => {
    if (!id) return;
    levels[id] = Math.max(1, Math.floor(Number(level) || 1));
  });
  (Array.isArray(deck) ? deck : []).forEach((card) => {
    const id = typeof card === 'string' ? card : (card?.id ?? card?.cardDefinitionId);
    if (!id) return;
    const level = typeof card === 'string' ? 1 : Math.max(1, Math.floor(Number(card?.level) || 1));
    levels[id] = Math.max(levels[id] ?? 1, level);
  });
  if (isEndlessMode(challengeMode)) {
    Object.keys(levels).forEach((id) => {
      levels[id] = 1;
    });
  }
  return levels;
}

function enemyForceTypes({
  level,
  forceId,
  kind,
  count,
  difficulty,
  waveIndex,
  bossOrdinal,
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
      return selectEnemyFromPool(bossPool, waveIndex, forceId + bossOrdinal, difficulty, preferred) ??
        enemyBossType(enemyPool, forceId, difficulty, waveIndex, bossOrdinal);
    }
    if (kind === 'elite' && unitIndex === 0) {
      return selectEnemyFromPool(elitePool, waveIndex, forceId, difficulty, preferred) ??
        selectEnemyFromPool(enemyPool, waveIndex, forceId, difficulty, preferred) ??
        'goblinSoldier';
    }
    return selectEnemyFromPool(enemyPool, waveIndex, forceId + unitIndex, difficulty, preferred) ?? 'goblinSoldier';
  });
}

function enemyBossType(enemyPool, forceId, difficulty, waveIndex, bossOrdinal) {
  const levelBossPool = enemyPool.filter((entry) => WAVE_BOSS_TYPES.includes(entry?.type));
  const fallbackPool = WAVE_BOSS_TYPES.map((type) => ({
    type,
    weight: 1,
    minWave: WAVE_MONSTER_UNLOCKS[type]?.minWave ?? 1,
    minDifficulty: 1
  }));
  return selectEnemyFromPool(
    levelBossPool.length ? levelBossPool : fallbackPool,
    waveIndex,
    forceId + bossOrdinal,
    difficulty
  ) ?? 'goblinTroll';
}

function createWaveSchedule(session) {
  return Array.from(
    { length: TOTAL_WAVES },
    (_, offset) => createWaveConfig(session, offset + 1)
  );
}

function createWaveConfig(session, index, endlessDifficulty = 0) {
  const level = session.level ?? {};
  const endless = isEndlessMode(session.challengeMode);
  const baseDifficulty = resolveSessionBaseDifficulty(session);
  const difficultyGrowth = resolveSessionDifficultyGrowth(session);
  const affixFlow = normalizeWaveAffixFlow(level.waveAffixFlow);
  const isBoss = index % WAVES_PER_BOSS === 0;
  const kind = isBoss ? 'boss' : index % ELITE_WAVE_INTERVAL === 0 ? 'elite' : 'normal';
  const bossOrdinal = isBoss ? Math.floor(index / WAVES_PER_BOSS) : 0;
  const difficultyBonus = endless ? 0 : waveDifficultyBonus(index, difficultyGrowth);
  const effectiveDifficulty = endless ? Number(endlessDifficulty) || 0 : baseDifficulty + difficultyBonus;
  const contentDifficulty = endless
    ? Math.max(1, effectiveDifficulty + 1)
    : effectiveDifficulty;
  const affixId = chooseWaveAffix(index, kind, affixFlow);
  const affixIds = [affixId];
  const count = waveEnemyCount(kind, index, contentDifficulty, bossOrdinal);
  const types = enemyForceTypes({
    level,
    forceId: index,
    kind,
    count,
    difficulty: contentDifficulty,
    waveIndex: index,
    bossOrdinal,
    affixId,
    compositionPreferred: new Set()
  });
  return {
    id: index,
    index,
    kind,
    affixId,
    affixIds,
    bossOrdinal,
    count,
    types,
    effectiveDifficulty,
    contentDifficulty,
    difficultyBonus,
    challengeMode: normalizeChallengeMode(session.challengeMode)
  };
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
  const normalized = normalizeWaveAffixFlow(flow);
  const affixId = normalized[(Math.max(1, index) - 1) % normalized.length];
  return WAVE_AFFIX_DEFINITIONS[affixId]
    ? affixId
    : (kind === 'boss' ? 'siege' : 'swarm');
}

function waveAffixIdsForConfig(waveConfig) {
  if (Array.isArray(waveConfig?.affixIds) && waveConfig.affixIds.length) {
    return waveConfig.affixIds.filter((affixId) => WAVE_AFFIX_DEFINITIONS[affixId]);
  }
  return waveConfig?.affixId ? [waveConfig.affixId] : [];
}

function waveCommandRosterLabel(wave) {
  const names = [...new Set(wave?.types ?? [])]
    .slice(0, 2)
    .map((type) => UNIT_DEFINITIONS[type]?.name ?? type)
    .filter(Boolean);
  const roster = names.length ? names.join(' / ') : '敌军';
  return `${Math.max(0, Math.floor(wave?.count ?? 0))} 名 · ${roster}`;
}

function isUnitInWave(unit, wave) {
  if (!unit || !wave) return false;
  return unit.enemyForce === wave;
}

function waveKindLabel(wave) {
  if (wave.kind === 'boss') {
    return wave.challengeMode === 'endless'
      ? `Boss ${wave.bossOrdinal}`
      : `Boss ${wave.bossOrdinal}/${BOSS_WAVES_TO_WIN}`;
  }
  if (wave.kind === 'elite') return '精英';
  return '普通';
}

function cardRunLocationLabel(game, card) {
  const cs = game?.cardSystem;
  if (!cs || !card) return '卡牌';
  if (cs.handCards.includes(card)) return '手牌';
  if (cs.drawPile.includes(card)) return '抽牌堆';
  if (cs.discardPile.includes(card)) return '弃牌堆';
  return '卡牌';
}

function waveAffixLabel(affixId) {
  const affix = WAVE_AFFIX_DEFINITIONS[affixId];
  if (!affix) return '无主题';
  return `${affix.name}主题`;
}

function waveAffixListLabel(wave) {
  const affixIds = waveAffixIdsForConfig(wave);
  if (!affixIds.length) return '无主题';
  return affixIds.map((affixId) => waveAffixLabel(affixId)).join(' · ');
}

function waveEventKicker(wave) {
  if (!wave) return '战场事件';
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

export function createWaveRewardCandidateEntries(cards, trainingChoices) {
  const cardEntries = (Array.isArray(cards) ? cards : []).map((card) => ({
    action: 'add-card',
    actionLabel: '获得卡牌',
    card,
    title: card.name,
    description: card.summary,
    rewardSource: 'wave-reward-deck'
  }));
  const trainingEntries = Array.isArray(trainingChoices) ? trainingChoices : [];
  return [...cardEntries, ...trainingEntries];
}

function isOpeningCombatSummon(card) {
  if (card?.kind !== 'summon' || !card.unitType) return false;
  const unit = UNIT_DEFINITIONS[card.unitType];
  if (!unit || unit.isBuilding || unit.support) return false;
  return Math.max(unit.physicalAttack ?? 0, unit.magicAttack ?? 0) >= 3 &&
    (unit.attackRange ?? 0) > 0;
}

function runtimeUnitUpgradeDefinition(unitType, upgradeId) {
  return UNIT_GENERIC_UPGRADES.find((upgrade) => upgrade.id === upgradeId) ??
    (UNIT_SPECIAL_UPGRADES[unitType] ?? []).find((upgrade) => upgrade.id === upgradeId) ??
    null;
}

function specializationIconColor(unitType) {
  const colors = [
    '#d8c58d',
    '#8fb6ff',
    '#ffb45c',
    '#7fd8b0',
    '#caa7ff',
    '#ffd166'
  ];
  const text = String(unitType ?? '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return colors[hash % colors.length];
}

function teamUpgradeFeedbackVisual(upgrade) {
  const visuals = {
    vitality: { text: '生命/耐久 +10%', color: '#7fd8a7' },
    attack: { text: '双攻 +10%', color: '#ffb45c' },
    armor: { text: '护甲 +10%', color: '#d8c58d' },
    magicResistance: { text: '魔抗 +10%', color: '#b9a4ff' }
  };
  return visuals[upgrade?.stat] ?? {
    text: upgrade?.name ?? '单位强化',
    color: '#ffd166'
  };
}

function teamGenericUpgradeAmount(baseValue) {
  return Math.max(1, Math.round(Math.max(0, baseValue) * 0.1));
}

function unitBaseAttributeValue(unit, stat, fallback = 0) {
  const value = unit?.attributes?.getBase?.(stat, fallback);
  return Number.isFinite(value) ? value : fallback;
}

function unitGenericUpgradeModifiers(unit, upgrade, index = 0) {
  void index;
  if (upgrade.stat === 'vitality') {
    return [
      {
        stat: 'maxHealth',
        type: 'add',
        amount: teamGenericUpgradeAmount(unitBaseAttributeValue(unit, 'maxHealth'))
      },
      {
        stat: 'maxDurability',
        type: 'add',
        amount: teamGenericUpgradeAmount(unitBaseAttributeValue(unit, 'maxDurability'))
      }
    ];
  }
  if (upgrade.stat === 'attack') {
    return [
      {
        stat: 'physicalAttack',
        type: 'add',
        amount: teamGenericUpgradeAmount(unitBaseAttributeValue(unit, 'physicalAttack'))
      },
      {
        stat: 'magicAttack',
        type: 'add',
        amount: teamGenericUpgradeAmount(unitBaseAttributeValue(unit, 'magicAttack'))
      }
    ];
  }
  if (upgrade.stat === 'armor') {
    return [{
      stat: 'armor',
      type: 'add',
      amount: teamGenericUpgradeAmount(unitBaseAttributeValue(unit, 'armor'))
    }];
  }
  if (upgrade.stat === 'magicResistance') {
    return [{
      stat: 'magicResistance',
      type: 'add',
      amount: teamGenericUpgradeAmount(unitBaseAttributeValue(unit, 'magicResistance'))
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
      if (Number.isFinite(ability.spellPowerFactor)) {
        ability.outputMultiplier = (ability.outputMultiplier ?? 1) * modifier.amountFactor;
      } else {
        ability.amount *= modifier.amountFactor;
      }
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

function inheritUpgradeTurretAttributes(turret, owner) {
  if (!turret?.attributes || !owner?.attributes) return;
  const inherited = owner.attributes.snapshot();
  Object.entries(inherited).forEach(([name, entry]) => {
    if (!UPGRADE_TURRET_INHERITED_STATS.has(name)) return;
    if (!Number.isFinite(entry?.value)) return;
    const value = name === 'maxHealth' ? entry.value * 0.5 : entry.value;
    turret.attributes.setBase(name, value);
  });
  turret.definition.canMove = false;
  turret.attributes.setBase('moveSpeed', 0);
  turret.health = turret.maxHealth;
  turret.shield = Math.min(turret.maxShield, Math.max(0, owner.shield ?? 0));
  turret.weapon.durability = turret.weapon.maxDurability;
  turret.clampToAttributeCaps?.();
  turret.statusUiDirty = true;
}

const UPGRADE_TURRET_INHERITED_STATS = new Set([
  'maxHealth',
  'maxShield',
  'physicalAttack',
  'magicAttack',
  'armor',
  'magicResistance',
  'knockback',
  'knockbackResistance',
  'dodgeChance',
  'maxDurability',
  'durabilityCost'
]);

const SUMMON_CARD_LEVEL_STAT_PERCENT = 0.25;
const UNIT_SUMMON_LEVEL_STATS = [
  'maxHealth',
  'maxShield',
  'physicalAttack',
  'magicAttack',
  'armor',
  'magicResistance',
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

function syncUnitAfterMaxHealthModifiers(unit, previousMaxHealth, previousMaxDurability) {
  scaleUnitHealthAfterMaxHealthChange(unit, previousMaxHealth);
  unit.weapon.durability = scaleResourceAfterMaximumChange(
    unit.weapon.durability,
    previousMaxDurability,
    unit.weapon.maxDurability
  );
}

function applySummonCardLevelModifiers(unit, card) {
  if (card?.kind !== 'summon') return;
  const bonusLevel = Math.max(0, Math.floor(card?.level ?? 1) - 1);
  if (bonusLevel <= 0) return;
  const previousMaxHealth = unit.maxHealth;
  const previousMaxDurability = unit.weapon.maxDurability;
  unit.attributes.addModifiers(
    summonCardLevelModifiers(bonusLevel),
    `card:${card.id}:summon-level`
  );
  syncUnitAfterMaxHealthModifiers(unit, previousMaxHealth, previousMaxDurability);
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
        stat: 'attackPower',
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

function normalizeCoopRewardSeconds(seconds) {
  if (seconds == null || seconds === '') return null;
  const value = Number(seconds);
  return Number.isFinite(value) ? Math.max(0, Math.ceil(value)) : null;
}

function formatCoopRewardCountdownSuffix(seconds) {
  const value = normalizeCoopRewardSeconds(seconds);
  return value === null ? '' : ` · 剩余 ${value} 秒`;
}

function appendCoopRewardCountdown(text, seconds, timeoutText) {
  const value = normalizeCoopRewardSeconds(seconds);
  const base = String(text ?? '').trim();
  if (value === null) return base;
  return [base, `剩余 ${value} 秒，${timeoutText}`].filter(Boolean).join(' ');
}

function formatDisplayedHealth(health) {
  const value = Number(health) || 0;
  if (value <= 0) return 0;
  return Math.max(1, Math.ceil(value));
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function strategyRewardMarkup(choice, index, options = {}) {
  const visual = strategyRewardVisualMeta(choice);
  const card = resolveStrategyChoiceCard(choice, index);
  const directCard = choice.card ?? choice.targetCard ?? choice.temporaryCard ?? null;
  const cardAccent = cardThemeColor(card);
  const title = directCard?.name ?? choice.title ?? '奖励';
  const description = directCard?.summary ?? choice.description ?? '';
  const typeLabel = strategyChoiceCardTypeLabel(choice, card);
  const disabledAttr = choice.disabled ? ' disabled aria-disabled="true"' : '';
  const choiceIndexAttribute = options.choiceIndexAttribute ?? 'data-strategy-choice-index';
  const extraClass = options.extraClass ? ` ${options.extraClass}` : '';
  const actionLabel = choice.actionLabel ?? visual.actionLabel;
  return `
    <button
      class="strategy-reward-option strategy-reward-card meta-card is-forged-reward is-${visual.kindKey}${extraClass}${choice.disabled ? ' is-disabled' : ''}"
      type="button"
      ${choiceIndexAttribute}="${index}"${disabledAttr}
      style="--reward-accent:${visual.accent};--card-accent:${cardAccent};--card-color:${cardAccent}"
      aria-label="${escapeHtml(actionLabel)}：${escapeHtml(title)}"
    >
      <div class="wave-reward-card-frame">
        ${createForgedCardMarkup(card, {
          title,
          summary: description,
          typeLabel
        })}
      </div>
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
      typeLabel: '特殊卡牌',
      actionLabel: '获得特殊卡牌',
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
  if (choice.targetCard) return choice.targetCard;
  if (choice.temporaryCard) return choice.temporaryCard;
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
  if (choice.action === 'grant-temporary-card') return '特殊卡牌';
  return strategyKindLabel(card.kind);
}

function strategyChoiceCardTypeLabel(choice, card) {
  if (choice.action === 'apply-team-upgrade' || choice.upgrade?.kind === 'unit-generic') {
    return '训练卡';
  }
  if (choice.action === 'apply-team-special-upgrade' || choice.upgrade?.kind === 'unit-special') {
    return '专精卡';
  }
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
  if (isOpeningRewardType(type)) {
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
  if (type === 'card-copy') {
    return { key: 'copy', mark: '复', label: '复制事件' };
  }
  return { key: 'choice', mark: '选', label: '选牌奖励' };
}

function strategyChoiceActionMeta(choice) {
  if (choice.action === 'open-card-kind-choice') return { key: 'select-upgrade', label: '选卡方向' };
  if (choice.action === 'open-card-upgrade-choice') return { key: 'upgrade-card', label: '升级入口' };
  if (choice.action === 'open-card-copy-choice') return { key: 'copy-card', label: '复制入口' };
  if (choice.action === 'grant-temporary-card') return { key: 'restore-card', label: '特殊卡牌奖励' };
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
  return '特殊卡牌 / 本局限定';
}

function createInitialShopPrices() {
  const basePrice = Number(BALANCE.runCurrency?.shop?.basePrice ?? RUN_SHOP_BASE_PRICE);
  const prices = {};
  RUN_SHOP_CATEGORIES.forEach((category) => {
    prices[category.key] = basePrice;
  });
  return prices;
}

export function normalizeStrategyEventType(type) {
  return type === 'unit-upgrade' ? 'wave-reward' : type;
}

// 开局三选一系列事件（单位卡 ×路线数 / 能力 / 地形）。
export function isOpeningRewardType(type) {
  return OPENING_REWARD_STEP_ORDER.some(
    (key) => OPENING_REWARD_STEP_DEFINITIONS[key].type === type
  );
}

function openingRewardStep(type) {
  const key = OPENING_REWARD_STEP_ORDER.find(
    (candidate) => OPENING_REWARD_STEP_DEFINITIONS[candidate].type === type
  );
  return key ? OPENING_REWARD_STEP_DEFINITIONS[key] : null;
}

function unitSpecializationRewardCardId(unitType, upgradeId) {
  return `team-special-${unitType}-${upgradeId}`;
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
  let root = overlay.querySelector('#run-shop-panel');
  if (!root) {
    overlay.innerHTML = RUN_SHOP_OVERLAY_INNER_HTML;
    root = overlay.querySelector('#run-shop-panel');
  }
  if (!root?.querySelector('#run-shop-card-scale-control')) {
    root?.querySelector('#run-shop-choice-list')?.insertAdjacentHTML(
      'beforebegin',
      RUN_SHOP_CARD_SCALE_CONTROL_HTML
    );
  }
  return {
    overlay,
    root,
    toggle: existing?.toggle ?? document.querySelector('#run-shop-toggle'),
    kicker: root?.querySelector('.run-shop-kicker'),
    title: root?.querySelector('.run-shop-title'),
    silver: root?.querySelector('#run-shop-silver'),
    services: root?.querySelector('#run-shop-services'),
    skip: root?.querySelector('#run-shop-skip'),
    close: root?.querySelector('#run-shop-close'),
    back: root?.querySelector('#run-shop-back'),
    choices: root?.querySelector('#run-shop-choices'),
    cardScaleControl: root?.querySelector('#run-shop-card-scale-control'),
    cardScaleInput: root?.querySelector('#run-shop-card-scale'),
    cardScaleValue: root?.querySelector('#run-shop-card-scale-value'),
    choiceList: root?.querySelector('#run-shop-choice-list')
  };
}

const RUN_SHOP_CARD_SCALE_CONTROL_HTML = `
  <label id="run-shop-card-scale-control" class="run-shop-card-scale-control" hidden>
    <span>卡牌大小 <output id="run-shop-card-scale-value" for="run-shop-card-scale">100%</output></span>
    <input id="run-shop-card-scale" type="range" min="55" max="100" step="5" value="100" aria-label="卡牌大小" />
  </label>
`;

const RUN_SHOP_OVERLAY_INNER_HTML = `
  <section id="run-shop-panel" class="run-shop-panel" aria-label="军需铺" tabindex="-1">
    <header class="run-shop-header">
      <div class="run-shop-heading">
        <span class="run-shop-kicker">营地军需</span>
        <h2 class="run-shop-title">军需铺</h2>
      </div>
      <button id="run-shop-close" class="run-shop-close" type="button" aria-label="关闭军需铺">×</button>
    </header>
    <p class="run-shop-balance">持有 <strong id="run-shop-silver">0</strong> 银币</p>
    <div id="run-shop-services" class="run-shop-services"></div>
    <button id="run-shop-skip" class="run-shop-skip" type="button" hidden>${RUN_SHOP_CONTINUE_LABEL}</button>
    <div id="run-shop-choices" class="run-shop-choices" hidden>
      <button id="run-shop-back" class="run-shop-back" type="button">${RUN_SHOP_BACK_TO_UNIT_LABEL}</button>
      ${RUN_SHOP_CARD_SCALE_CONTROL_HTML}
      <div id="run-shop-choice-list" class="run-shop-choice-list"></div>
    </div>
  </section>
`;

/**
 * 军需补给铺的一件具体商品：名称、效果、银币价格与售罄状态都直接可见。
 * 复用旧服务行的 DOM 结构与样式，点击同样走 data-run-shop-choice-index。
 */
function runShopSupplyItemMarkup(choice, index) {
  const kind = choice.itemKind ?? 'unitCard';
  const icon = RUN_SHOP_SUPPLY_KIND_ICONS[kind] ?? '✦';
  const label = RUN_SHOP_SUPPLY_KIND_LABELS[kind] ?? '';
  const title = choice.title ?? choice.card?.name ?? label;
  const summary = choice.card?.summary ?? choice.description ?? '';
  const description = label ? `${label} · ${summary}` : summary;
  const priceLabel = choice.actionLabel
    ?? `${formatSilverAmount(choice.itemPrice ?? 0)} 银币`;
  const disabled = choice.disabled === true;
  return `
    <button
      class="run-shop-service run-shop-supply-item${disabled ? ' is-disabled' : ''}"
      type="button"
      data-run-shop-choice-index="${index}"
      ${disabled ? 'disabled aria-disabled="true"' : ''}
    >
      <span class="run-shop-service-icon" aria-hidden="true">${escapeHtml(icon)}</span>
      <span class="run-shop-service-body">
        <strong class="run-shop-service-title">${escapeHtml(title)}</strong>
        <span class="run-shop-service-desc">${escapeHtml(description)}</span>
      </span>
      <span class="run-shop-service-price">${escapeHtml(priceLabel)}</span>
    </button>
  `;
}

/** 兵种专精第一步（选择兵种 / 专精已满的补偿）使用同一套服务行样式。 */
function runShopServiceOptionMarkup(choice, index, options = {}) {
  const icon = options.icon ?? '专';
  const priceLabel = options.priceLabel ?? RUN_SHOP_FREE_LABEL;
  const disabled = choice.disabled === true;
  return `
    <button
      class="run-shop-service${disabled ? ' is-disabled' : ''}"
      type="button"
      data-run-shop-choice-index="${index}"
      ${disabled ? 'disabled aria-disabled="true"' : ''}
    >
      <span class="run-shop-service-icon" aria-hidden="true">${escapeHtml(icon)}</span>
      <span class="run-shop-service-body">
        <strong class="run-shop-service-title">${escapeHtml(choice.title ?? '兵种专精')}</strong>
        <span class="run-shop-service-desc">${escapeHtml(choice.description ?? '')}</span>
      </span>
      <span class="run-shop-service-price">${escapeHtml(priceLabel)}</span>
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

function runShopChoiceMarkup(choice, index, options = {}) {
  if (
    options.useAttributeTrainingStyle
    || options.useSpecializationStyle
    || options.useWaveRewardStyle
    || runShopChoiceUsesCardFace(choice)
  ) {
    return strategyRewardMarkup(choice, index, {
      choiceIndexAttribute: 'data-run-shop-choice-index',
      extraClass: 'run-shop-reward-option'
    });
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

function enemyEnchantmentLevel(difficulty) {
  return 1 + Math.floor((Math.max(1, difficulty) - 1) / 2);
}

function endlessEnemyClassForWave(waveConfig, indexInWave) {
  if (indexInWave === 0 && waveConfig?.kind === 'boss') return 'boss';
  if (indexInWave === 0 && waveConfig?.kind === 'elite') return 'elite';
  return 'normal';
}

function selectEnemyFromPool(pool, waveIndex, index, difficulty, preferredTypes = null) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const candidates = pool.filter((entry) => (
    waveIndex >= (entry.minWave ?? 1) &&
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
  let roll = stableEnemyRoll(waveIndex, index, difficulty) % totalWeight;
  for (const entry of weighted) {
    roll -= Math.max(1, entry.weight ?? 1);
    if (roll < 0) return entry.type;
  }
  return weighted[weighted.length - 1].type;
}

function stableEnemyRoll(waveIndex, index, difficulty) {
  return Math.abs(
    (waveIndex * 73856093) ^
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
    if (params.has('netdebug')) return params.get('netdebug') !== '0';
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
        ${renderSliderControl('shadowIntensity', '阴影', 0, 1, 0.01)}
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
        <legend>场景材质</legend>
        ${renderColorControl('snowColor', '雪')}
        ${renderColorControl('rockColor', '岩石')}
        ${renderColorControl('treeColor', '树木')}
      </fieldset>
      <fieldset>
        <legend>雾</legend>
        ${renderColorControl('fogColor', '颜色')}
        ${renderSliderControl('fogNear', '近端', 20, 220, 1)}
        ${renderSliderControl('fogFar', '远端', 80, 480, 1)}
      </fieldset>
      <fieldset>
        <legend>环境遮蔽 (AO)</legend>
        ${renderSliderControl('aoIntensity', '遮蔽强度', 0, 0.5, 0.01)}
        ${renderSliderControl('aoScale', '遮蔽尺度', 0.1, 10, 0.1)}
        ${renderSliderControl('aoKernelRadius', '采样半径', 1, 100, 1)}
        ${renderSliderControl('aoBias', '遮蔽偏移', 0, 1, 0.01)}
      </fieldset>
      <fieldset>
        <legend>描边效果</legend>
        ${renderSliderControl('outlineThickness', '描边粗细', 0, 3.0, 0.1)}
        ${renderColorControl('outlineColor', '描边颜色')}
        ${renderSliderControl('outlineThreshold', '描边阈值', 0.05, 0.5, 0.01)}
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
    // 半烘焙半实时：桌面端走实时阴影（山体/装饰物/单位能正确接收与投射阴影），
    // 移动端关掉实时阴影贴图、回落到烘焙地面遮罩以省算力（手机顶不住每帧阴影渲染）。
    realtimeShadows: !mobile
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
      // 半烘焙半实时：实时阴影开启时关掉烘焙（避免地面双重投影），
      // 实时关闭（移动端/低画质）时回落到烘焙遮罩省算力（手机顶不住每帧阴影渲染）。
      bakedShadows: realtimeShadows ? false : true
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
    shadowIntensity: finiteNumber(headDefaults?.shadowIntensity ?? sky.shadowIntensity, 0.8),
    hemiIntensity: finiteNumber(headDefaults?.hemiIntensity ?? sky.hemiIntensity, 1.85),
    ambientColor: colorToHex(headDefaults?.ambientColor ?? sky.ambientColor, '#8FAFD0'),
    ambientIntensity: finiteNumber(headDefaults?.ambientIntensity ?? sky.ambientIntensity, 0.4),
    bloomStrength: finiteNumber(headDefaults?.bloomStrength ?? sky.bloomStrength, 0.15),
    vignetteStrength: finiteNumber(headDefaults?.vignetteStrength, 0),
    snowColor: colorToHex(headDefaults?.snowColor ?? worldConfig.materials?.snow, '#eee8d8'),
    rockColor: colorToHex(headDefaults?.rockColor ?? worldConfig.materials?.rock, '#969487'),
    treeColor: colorToHex(headDefaults?.treeColor ?? worldConfig.materials?.tree, '#356747'),
    hemiSky: colorToHex(headDefaults?.hemiSky ?? sky.hemiSky, '#e8f4ff'),
    hemiGround: colorToHex(headDefaults?.hemiGround ?? sky.hemiGround, '#bebbc5'),
    background: colorToHex(headDefaults?.background ?? sky.skyGradient?.middle ?? sky.background, '#f0f8fc'),
    fogColor: colorToHex(headDefaults?.fogColor ?? sky.fog, '#f7f8f2'),
    fogNear: finiteNumber(headDefaults?.fogNear ?? sky.fogNear, 110),
    fogFar: finiteNumber(headDefaults?.fogFar ?? sky.fogFar, 282),
    aoIntensity: finiteNumber(headDefaults?.aoIntensity, 0.01),
    aoScale: finiteNumber(headDefaults?.aoScale, 2.6),
    aoKernelRadius: finiteNumber(headDefaults?.aoKernelRadius, 32),
    aoBias: finiteNumber(headDefaults?.aoBias, 0.08),
    outlineThickness: finiteNumber(headDefaults?.outlineThickness, 0.8),
    outlineColor: colorToHex(headDefaults?.outlineColor, '#445566'),
    outlineThreshold: finiteNumber(headDefaults?.outlineThreshold, 0.22)
  };
}

function renderTuningHeadDefaultsForWorld(worldConfig = BALANCE.world) {
  if (worldConfig.sceneKey === 'snow-valley') return SNOW_VALLEY_HEAD_RENDER_TUNING;
  if (worldConfig.sceneKey === 'dungeon-halls') return DUNGEON_HALLS_HEAD_RENDER_TUNING;
  if (worldConfig.sceneKey === 'red-desert') return RED_DESERT_HEAD_RENDER_TUNING;
  if (worldConfig.sceneKey === 'emerald-marsh') return EMERALD_MARSH_HEAD_RENDER_TUNING;
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
    shadowIntensity: clamp(finiteNumber(settings.shadowIntensity, defaults.shadowIntensity ?? 0.8), 0, 1),
    hemiIntensity: clamp(finiteNumber(settings.hemiIntensity, defaults.hemiIntensity), 0, 3.2),
    ambientColor: colorToHex(settings.ambientColor, defaults.ambientColor),
    ambientIntensity: clamp(finiteNumber(settings.ambientIntensity, defaults.ambientIntensity), 0, 2),
    bloomStrength: clamp(finiteNumber(settings.bloomStrength, defaults.bloomStrength), 0, 2),
    vignetteStrength: clamp(finiteNumber(settings.vignetteStrength, defaults.vignetteStrength), 0, 0.4),
    snowColor: colorToHex(settings.snowColor, defaults.snowColor),
    rockColor: colorToHex(settings.rockColor, defaults.rockColor),
    treeColor: colorToHex(settings.treeColor, defaults.treeColor),
    hemiSky: colorToHex(settings.hemiSky, defaults.hemiSky),
    hemiGround: colorToHex(settings.hemiGround, defaults.hemiGround),
    background: colorToHex(settings.background, defaults.background),
    fogColor: colorToHex(settings.fogColor, defaults.fogColor),
    fogNear,
    fogFar,
    aoIntensity: clamp(finiteNumber(settings.aoIntensity, defaults.aoIntensity), 0, 0.5),
    aoScale: clamp(finiteNumber(settings.aoScale, defaults.aoScale), 0.1, 10.0),
    aoKernelRadius: clamp(finiteNumber(settings.aoKernelRadius, defaults.aoKernelRadius), 1, 100),
    aoBias: clamp(finiteNumber(settings.aoBias, defaults.aoBias), 0, 1.0),
    outlineThickness: clamp(finiteNumber(settings.outlineThickness, defaults.outlineThickness), 0, 3.0),
    outlineColor: colorToHex(settings.outlineColor, defaults.outlineColor),
    outlineThreshold: clamp(finiteNumber(settings.outlineThreshold, defaults.outlineThreshold), 0.05, 0.5)
  };
}

function renderTuningExportText(settings, worldConfig = BALANCE.world, camera = null, cameraTarget = null) {
  const normalized = normalizeRenderTuning(settings, worldConfig);
  const cameraPosition = camera?.position;
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
      },
      shadowIntensity: normalized.shadowIntensity
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
    ao: {
      intensity: normalized.aoIntensity,
      scale: normalized.aoScale,
      kernelRadius: normalized.aoKernelRadius,
      bias: normalized.aoBias
    },
    outline: {
      thickness: normalized.outlineThickness,
      color: normalized.outlineColor,
      threshold: normalized.outlineThreshold
    },
    materials: {
      snow: normalized.snowColor,
      rock: normalized.rockColor,
      tree: normalized.treeColor
    },
    background: normalized.background,
    camera: {
      initialPosition: {
        x: Number((cameraPosition?.x ?? 0).toFixed(3)),
        y: Number((cameraPosition?.y ?? 0).toFixed(3)),
        z: Number((cameraPosition?.z ?? 0).toFixed(3))
      },
      target: {
        x: Number((cameraTarget?.x ?? 0).toFixed(3)),
        y: Number((cameraTarget?.y ?? 4).toFixed(3)),
        z: Number((cameraTarget?.z ?? 0).toFixed(3))
      }
    }
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

function assignUnitSourceCard(unit, card) {
  if (!unit || !card) return;
  unit.sourceCardId = card.cardDefinitionId ?? card.id ?? unit.sourceCardId ?? null;
  unit.sourceCardEnergyCost = Math.max(0, finiteNumber(cardEnergyCost(card), 0));
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

function networkSummary(network) {
  const rtt = network.rtt?.latestMs == null ? '-' : `${network.rtt.latestMs}ms`;
  const gap = network.transform?.maxGapMs ?? 0;
  return `↓${network.received?.messagesPerSecond ?? 0}/s ${rtt} gap ${gap}ms`;
}

function networkDiagnosticsMarkup(network) {
  const received = network.received ?? {};
  const sent = network.sent ?? {};
  const transform = network.transform ?? {};
  const rtt = network.rtt ?? {};
  return profilerTableMarkup('Network (10s window)', [
    ['Receive', `${received.messagesPerSecond ?? 0}/s · ${formatNetworkRate(received.bytesPerSecond)} · max gap ${received.maxGapMs ?? 0}ms · >=200ms ${received.gapsOver200Ms ?? 0}`],
    ['Send', `${sent.messagesPerSecond ?? 0}/s · ${formatNetworkRate(sent.bytesPerSecond)}`],
    ['Transform', `${transform.streamsPerSecond ?? 0}/s · max gap ${transform.maxGapMs ?? 0}ms · latest ${transform.latestAgeMs ?? '-'}ms ago · ${transform.latestUnitCount ?? 0} units / ${transform.latestProjectileCount ?? 0} projectiles`],
    ['RTT', rtt.latestMs == null ? 'waiting for time sync' : `latest ${rtt.latestMs}ms · avg ${rtt.avgMs}ms · max ${rtt.maxMs}ms`],
    ['Recovery', `server sequence gaps ${network.serverSequenceGaps ?? 0} · resyncs ${network.resyncs ?? 0}`]
  ]);
}

function formatNetworkRate(bytesPerSecond = 0) {
  if (bytesPerSecond >= 1024) return `${(bytesPerSecond / 1024).toFixed(1)}KB/s`;
  return `${Math.round(bytesPerSecond)}B/s`;
}

function captureRebirthAttributeSnapshot(unit) {
  const result = {};
  const context = { owner: unit, game: unit?.game };
  unit?.attributes?.values?.forEach?.((entry, name) => {
    const value = rebirthAttributeValue(entry, context, unit);
    if (!Number.isFinite(value)) return;
    result[name] = value;
  });
  return result;
}

function rebirthAttributeValue(entry, context, unit) {
  const addValue = (entry?.add ?? [])
    .filter((modifier) => shouldPreserveRebirthModifier(modifier, unit))
    .reduce((sum, modifier) => sum + rebirthAddAmount(modifier, context), 0);
  const multiplier = (entry?.multiply ?? [])
    .filter((modifier) => shouldPreserveRebirthModifier(modifier, unit))
    .reduce((product, modifier) => product * rebirthMultiplier(modifier, context), 1);
  const value = (finiteNumber(entry?.base, 0) + addValue) * multiplier;
  return Math.min(
    Math.max(value, finiteNumber(entry?.min, 0)),
    finiteNumber(entry?.max, Number.POSITIVE_INFINITY)
  );
}

function shouldPreserveRebirthModifier(modifier, unit) {
  const source = String(modifier?.source ?? '');
  if (!source.startsWith('buff:')) return true;
  const enchantmentId = source.slice(5).split(':')[0];
  return unit?.enchantments?.has?.(enchantmentId) === true;
}

// 符石附魔由符文背包负责恢复，快照只记录非符文来源的附魔，避免重生时叠加两层效果。
function captureRebirthEnchantments(unit) {
  const runeManaged = unit?.runeEnchantmentIds instanceof Set ? unit.runeEnchantmentIds : new Set();
  return [...(unit?.enchantments?.entries?.() ?? [])]
    .filter(([id]) => !runeManaged.has(id))
    .map(([id, enchantment]) => ({
      id,
      level: Math.max(1, Math.floor(enchantment?.level ?? 1)),
      sourceCard: enchantment?.sourceCard ?? null,
      remaining: Number.isFinite(enchantment?.remaining) ? Math.max(0, enchantment.remaining) : null,
      hidden: enchantment?.hidden === true
    }));
}

function restoreRebirthEnchantments(unit, enchantments = []) {
  if (!unit?.addBuff || !Array.isArray(enchantments)) return;
  const unique = new Map();
  enchantments.forEach((entry) => {
    if (!entry?.id) return;
    const previous = unique.get(entry.id);
    unique.set(entry.id, {
      ...entry,
      level: Math.max(previous?.level ?? 1, Math.max(1, Math.floor(entry.level ?? 1)))
    });
  });
  unit.maxEnchantmentSlots = Math.max(
    Math.floor(unit.maxEnchantmentSlots ?? 5),
    unique.size
  );
  unique.forEach((entry) => {
    const overrides = {
      level: Math.max(1, Math.floor(entry.level ?? 1)),
      sourceCard: entry.sourceCard ?? undefined,
      hidden: entry.hidden === true
    };
    if (Number.isFinite(entry.remaining)) overrides.duration = Math.max(0, entry.remaining);
    const buff = unit.addBuff(entry.id, undefined, overrides);
    if (buff && entry.hidden === true) buff.hidden = true;
  });
}

function restoreRebirthAttributes(unit, attributes) {
  if (!unit?.attributes || !attributes) return;
  Object.entries(attributes).forEach(([name, value]) => {
    if (!Number.isFinite(value)) return;
    setAttributeFinalValue(unit, name, value);
  });
  unit.health = unit.maxHealth;
  // 复活不恢复护盾：盾为空，与"复活后需重新充盾"的规则一致
  unit.shield = 0;
  if (unit.weapon) {
    unit.weapon.durability = unit.weapon.maxDurability;
  }
  unit.clampToAttributeCaps?.();
  unit.statusUiDirty = true;
}

function setAttributeFinalValue(unit, name, targetValue) {
  const attributes = unit?.attributes;
  if (!attributes?.setBase) return;
  const entry = attributes.values?.get?.(name) ?? attributes.setBase(name, 0);
  const context = { owner: unit, game: unit.game };
  const addValue = (entry.add ?? []).reduce(
    (sum, modifier) => sum + rebirthAddAmount(modifier, context),
    0
  );
  const multiplier = (entry.multiply ?? []).reduce(
    (product, modifier) => product * rebirthMultiplier(modifier, context),
    1
  );
  const baseValue = Math.abs(multiplier) > 0.0001
    ? (targetValue / multiplier) - addValue
    : targetValue - addValue;
  attributes.setBase(name, baseValue, {
    min: entry.min,
    max: entry.max
  });
}

function rebirthAddAmount(modifier, context) {
  const level = rebirthModifierLevel(modifier, context);
  return finiteNumber(modifier.amount ?? modifier.value, 0) +
    finiteNumber(modifier.amountPerLevel, 0) * level +
    rebirthNearbyAllyCount(modifier, context) * finiteNumber(modifier.nearbyAllyAmountPerLevel, 0) * level;
}

function rebirthMultiplier(modifier, context) {
  const level = rebirthModifierLevel(modifier, context);
  if (Number.isFinite(modifier.factor) || Number.isFinite(modifier.factorPerLevel)) {
    return finiteNumber(modifier.factor, 1) + finiteNumber(modifier.factorPerLevel, 0) * level;
  }
  const percent = finiteNumber(modifier.percent ?? modifier.percentage, null);
  const percentPerLevel = finiteNumber(modifier.percentPerLevel, 0);
  if (percent !== null || percentPerLevel !== 0) {
    return 1 + finiteNumber(percent, 0) + percentPerLevel * level;
  }
  return finiteNumber(modifier.amount ?? modifier.value, 1);
}

function rebirthModifierLevel(modifier, context) {
  return Math.max(1, finiteNumber(modifier.level ?? context.level, 1));
}

function rebirthNearbyAllyCount(modifier, context) {
  if (!modifier?.nearbyAllyAmountPerLevel) return 0;
  const owner = context.owner;
  const game = context.game;
  if (!owner?.position || !game) return 0;
  const radius = Math.max(0, finiteNumber(modifier.radius, 6));
  const units = owner.team === TEAMS.PLAYER ? game.friendlyUnits : game.enemyUnits;
  return (units ?? []).filter((unit) => {
    if (!unit.alive || unit === owner || unit.team !== owner.team) return false;
    const dx = unit.position.x - owner.position.x;
    const dz = unit.position.z - owner.position.z;
    return Math.hypot(dx, dz) <= radius;
  }).length;
}

function serializeRebirthQueueEntry(entry) {
  return {
    id: entry.id,
    sourceUnitId: entry.sourceUnitId ?? null,
    type: entry.type,
    name: entry.name ?? UNIT_DEFINITIONS[entry.type]?.name ?? entry.type ?? '单位',
    ownerPlayerId: entry.ownerPlayerId ?? null,
    controllerPlayerId: entry.controllerPlayerId ?? entry.ownerPlayerId ?? null,
    playerColorIndex: Math.max(0, Math.min(3, Math.floor(entry.playerColorIndex ?? 0))),
    level: Math.max(1, Math.floor(entry.level ?? 1)),
    total: roundRebirthSeconds(entry.total),
    remaining: roundRebirthSeconds(entry.remaining)
  };
}

function roundRebirthSeconds(value) {
  // Rebirth timing remains authoritative at full precision on the Host. The
  // client UI displays whole seconds, so tenths only force a complete match
  // state patch ten times per second while a unit is waiting to respawn.
  return Math.ceil(Math.max(0, finiteNumber(value, 0)));
}

function vectorSnapshot(vector) {
  if (!vector || !Number.isFinite(vector.x) || !Number.isFinite(vector.z)) return null;
  return {
    x: vector.x,
    y: Number.isFinite(vector.y) ? vector.y : 0,
    z: vector.z
  };
}

function vectorFromSnapshot(snapshot) {
  if (!snapshot || !Number.isFinite(snapshot.x) || !Number.isFinite(snapshot.z)) return null;
  return new THREE.Vector3(
    snapshot.x,
    Number.isFinite(snapshot.y) ? snapshot.y : 0,
    snapshot.z
  );
}

function rebirthUnitIconMarkup(type, name) {
  const card = CARD_DEFINITIONS.find((definition) => (
    definition.kind === 'summon' && definition.unitType === type
  ));
  if (card) {
    return createCardArtMarkup(card);
  }
  const text = String(name ?? UNIT_DEFINITIONS[type]?.name ?? '?').trim();
  return `<span class="world-rebirth-avatar-fallback">${escapeHtml(Array.from(text)[0] ?? '?')}</span>`;
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
    <div class="world-rebirth-queue" hidden></div>
  `;
  element.hidden = true;
  element.parts = {
    hp: element.querySelector('.world-health-fill'),
    healthLoss: element.querySelector('.world-health-loss-fill'),
    ticks: element.querySelector('.world-health-ticks'),
    durability: element.querySelector('.world-durability-fill'),
    rebirthQueue: element.querySelector('.world-rebirth-queue')
  };
  return element;
}

function unitStatusHeight(unit) {
  const runtimeScale = Math.max(1, Number(unit?.runtimeStatusHeightScale) || 1);
  if (Number.isFinite(unit.definition?.statusHeight)) return unit.definition.statusHeight * runtimeScale;
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

function applyPlayerMarkerColor(marker, color) {
  if (!marker || marker.userData.playerMarkerColor === color) return;
  (marker.userData.colorMeshes ?? []).forEach((mesh) => {
    mesh.material?.color?.set?.(color);
  });
  marker.userData.playerMarkerColor = color;
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

export function resolveUnitPlayerName(levelSession, playerId) {
  if (!playerId) return '';
  const sessionName = levelSession?.players?.[playerId]?.name;
  const descriptorName = levelSession?.matchRules?.players
    ?.find((player) => player?.playerId === playerId)?.name;
  return String(sessionName ?? descriptorName ?? '').trim();
}
