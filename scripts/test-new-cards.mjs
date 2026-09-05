import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { BUFF_DEFINITIONS, CARD_DEFINITIONS, UNIT_DEFINITIONS } from '../src/data/gameData.js';
import { AbilitySystem } from '../src/systems/AbilitySystem.js';
import { BuffSystem } from '../src/systems/BuffSystem.js';
import { resolveSupportAmount } from '../src/systems/UnitLogicSystem.js';
import {
  CardSystem,
  findFriendlyUnitScreenTarget,
  toRomanNumeral
} from '../src/systems/CardSystem.js';
import { isEnchantmentCardBlocked } from '../src/systems/enchantmentSlots.js';
import { rollOverflowChance } from '../src/utils/chance.js';
import { UNIT_SPECIAL_UPGRADES } from '../src/data/cardUpgrades.js';

const inspirationCard = CARD_DEFINITIONS.find((card) => card.id === 'inspiration');
const judgmentCard = CARD_DEFINITIONS.find((card) => card.id === 'judgment-enchant');
const bodyForgingCard = CARD_DEFINITIONS.find((card) => card.id === 'body-forging-enchant');
const enchantResonanceCard = CARD_DEFINITIONS.find((card) => card.id === 'enchant-echo-ability');
const lightningMageCard = CARD_DEFINITIONS.find((card) => card.id === 'lightning-mages');

assert.equal(inspirationCard?.effect?.abilityId, 'inspiration');
assert.equal(inspirationCard?.effect?.stacksBase, 1);
assert.equal(inspirationCard?.effect?.stacksPerLevel, 1);
assert.equal(judgmentCard?.enchantmentId, 'judgment');
assert.equal(bodyForgingCard?.enchantmentId, 'bodyForging');
assert.equal(BUFF_DEFINITIONS.judgment.effects[0].cooldown, 5);
assert.equal(BUFF_DEFINITIONS.judgment.effects[0].damagePerLevel, 2);
assert.equal(BUFF_DEFINITIONS.bodyForging.tickInterval, 5);
assert.match(enchantResonanceCard?.summary ?? '', /超过 100%/);
assert.equal(lightningMageCard?.energyCost, 4, '雷法师应固定消耗 4 点能量');
assert.equal(
  UNIT_SPECIAL_UPGRADES.archer.find((upgrade) => upgrade.id === 'archer-eagle-eye')?.modifiers
    ?.some((modifier) => modifier.stat === 'projectileSpeed'),
  false,
  '单位专精不应提高投射物速度'
);
assert.equal(
  BUFF_DEFINITIONS.waveRanged.modifiers?.some((modifier) => modifier.stat === 'projectileSpeed'),
  false,
  '怪物远射词缀不应提高投射物速度'
);
assert.equal(BUFF_DEFINITIONS.waveSwarm, undefined, '集群附魔定义应移除');
assert.equal(CARD_DEFINITIONS.some((card) => card.id === 'swarm-enchant'), false, '集群附魔牌应移除');
assert.deepEqual(
  BUFF_DEFINITIONS.waveArmored.modifiers.map((modifier) => modifier.stat),
  ['maxHealth', 'armor'],
  '重甲附魔只增加生命和护甲'
);
assert.deepEqual(
  BUFF_DEFINITIONS.waveRush.modifiers.map((modifier) => modifier.stat),
  ['moveSpeed', 'attackRate'],
  '冲锋附魔只增加移速和攻速'
);
assert.deepEqual(BUFF_DEFINITIONS.waveArmored.modifiers, [
  { stat: 'maxHealth', type: 'multiply', factor: 1, factorPerLevel: 0.05 },
  { stat: 'armor', type: 'add', amount: 0, amountPerLevel: 0.5 }
], '重甲附魔每级只增加 5% 生命和 0.5 护甲');
assert.deepEqual(BUFF_DEFINITIONS.waveRush.modifiers, [
  { stat: 'moveSpeed', type: 'multiply', factor: 1, factorPerLevel: 0.05 },
  { stat: 'attackRate', type: 'multiply', factor: 1, factorPerLevel: 0.05 }
], '冲锋附魔每级只增加 5% 移速和 5% 攻速');
assert.equal(
  CARD_DEFINITIONS.find((card) => card.id === 'armored-enchant')?.summary,
  '每级：生命 +5%、护甲 +0.5'
);
assert.equal(
  CARD_DEFINITIONS.find((card) => card.id === 'rush-enchant')?.summary,
  '每级：移速 +5%、攻速 +5%'
);
assert.deepEqual(
  BUFF_DEFINITIONS.waveRanged.modifiers.map((modifier) => modifier.stat),
  ['attackRange', 'attackPower'],
  '远射附魔只增加射程和攻击'
);
assert.deepEqual(
  BUFF_DEFINITIONS.waveSiege.modifiers.map((modifier) => modifier.stat),
  ['attackPower', 'knockback'],
  '攻城附魔只增加攻击和击退'
);
assert.deepEqual(BUFF_DEFINITIONS.waveRanged.modifiers, [
  { stat: 'attackRange', type: 'multiply', factor: 1, factorPerLevel: 0.05 },
  { stat: 'attackPower', type: 'multiply', factor: 1, factorPerLevel: 0.05 }
], '远射附魔每级只增加 5% 射程和 5% 攻击');
assert.deepEqual(BUFF_DEFINITIONS.waveSiege.modifiers, [
  { stat: 'attackPower', type: 'multiply', factor: 1, factorPerLevel: 0.05 },
  { stat: 'knockback', type: 'multiply', factor: 1, factorPerLevel: 0.05 }
], '攻城附魔每级只增加 5% 攻击和 5% 击退');
assert.equal(
  CARD_DEFINITIONS.find((card) => card.id === 'ranged-enchant')?.summary,
  '每级：射程 +5%、攻击 +5%'
);
assert.equal(
  CARD_DEFINITIONS.find((card) => card.id === 'siege-enchant')?.summary,
  '每级：攻击 +5%、击退 +5%'
);
assert.equal(UNIT_DEFINITIONS.engineer.support.repairAura.amount, 10);
assert.equal(UNIT_DEFINITIONS.engineer.support.repairAura.spellPowerFactor, 0.5);
assert.equal(resolveSupportAmount({
  modifiers: { getMagicAttack: () => 8 }
}, {}, UNIT_DEFINITIONS.engineer.support.repairAura), 14, '工匠修理应获得 50% 魔攻加成');

{
  // 矮人工匠：可维修所有建筑（含基地），每次固定 5% 血量和耐久
  globalThis.window = { innerWidth: 1, innerHeight: 1 };
  const { Game } = await import('../src/systems/Game.js');
  const { UnitLogicSystem } = await import('../src/systems/UnitLogicSystem.js');
  const system = Object.create(UnitLogicSystem.prototype);
  const engineer = { team: 'player', position: { x: 0, z: 0 } };
  const tower = {
    alive: true,
    isBuilding: true,
    kind: 'building',
    underConstruction: false,
    position: { x: 1, z: 1 },
    maxHealth: 50,
    health: 40,
    weapon: { maxDurability: 30, durability: 15 }
  };
  const base = {
    alive: true,
    kind: 'structure',
    position: { x: 10, z: 0 },
    maxHealth: 100,
    health: 50,
    maxStructureDurability: 100,
    structureDurability: 40
  };
  system.game = {
    friendlyUnits: [engineer, tower],
    enemyUnits: [],
    playerBase: base,
    enemyCamp: { alive: false }
  };
  const ability = {
    range: 5.4,
    baseRange: 8.5,
    includeBase: true,
    maxTargets: 1,
    baseHealthPercent: 0.05,
    baseDurabilityPercent: 0.05
  };
  const pick = UnitLogicSystem.prototype.findBestRepairAuraTarget.call(system, engineer, ability);
  assert.equal(pick.mode, 'structure');
  assert.equal(pick.target, tower, '矮人工匠可维修范围内的普通建筑');
  const engineerNearBase = { ...engineer, position: { x: 7, z: 0 } };
  const pickBase = UnitLogicSystem.prototype.findBestRepairAuraTarget.call(system, engineerNearBase, ability);
  assert.equal(pickBase.target.kind, 'structure', '基地同样在维修范围内');

  // repairStructure 对普通建筑：固定 5% 血量 + 5% 耐久（weapon.durability 路径）
  const repairGame = Object.assign(Object.create(Game.prototype), {
    elapsedTime: 0,
    updateStructureStatusElement() {},
    registerStructureHealthLoss() {}
  });
  const result = Game.prototype.repairStructure.call(repairGame, tower, {
    healthPercent: 0.05,
    durabilityPercent: 0.05
  });
  assert(Math.abs(result.health - 2.5) < 1e-9, '建筑每次修复 5% 血量');
  assert(Math.abs(tower.weapon.durability - 16.5) < 1e-9, '建筑每次修复 5% 耐久');
}
{
  // 冰霜巨魔：冰霜风暴（每秒攻击力×1 魔法伤害 + 冰风减速，无攻击特效/击退）与近战溅射
  const { AttackSystem } = await import('../src/systems/AttackSystem.js');
  const boss = {
    alive: true,
    type: 'frostTrollBoss',
    team: 'enemy',
    position: new THREE.Vector3(0, 0, 0),
    definition: {
      attackDamageType: 'physical',
      damage: 10,
      monsterAbility: UNIT_DEFINITIONS.frostTrollBoss.monsterAbility
    }
  };
  const attacks = new AttackSystem();
  const damageRecords = [];
  const buffRecords = [];
  attacks.game = {
    friendlyUnits: [],
    enemyUnits: [],
    elapsedTime: 0,
    modifiers: {
      getAttackDamage: () => 12
    },
    combat: {
      applyDamage(target, amount, source, knockback, context) {
        damageRecords.push({ target, amount, knockback, context });
        return true;
      }
    },
    buffs: {
      applyBuff(target, buffId, source, overrides) {
        buffRecords.push({ target, buffId, overrides });
        return { id: buffId, ...overrides };
      }
    },
    effects: {
      spawnFrostStorm() {},
      spawnMonsterAbilityText() {},
      spawnHitSplashShockwave() {}
    }
  };
  const meleeUnit = { alive: true, underConstruction: false, position: new THREE.Vector3(1, 0, 0), projectileHitHeight: 1.4 };
  const farUnit = { alive: true, underConstruction: false, position: new THREE.Vector3(6, 0, 0), projectileHitHeight: 1.4 };
  attacks.game.friendlyUnits.push(meleeUnit, farUnit);
  const stormAbility = UNIT_DEFINITIONS.frostTrollBoss.monsterAbility;
  assert.equal(stormAbility.type, 'frostStorm', '第一关 Boss 技能应为冰霜风暴');
  attacks.frostStorms.push({
    source: boss,
    position: boss.position.clone(),
    age: 0,
    tickTimer: 0,
    radius: stormAbility.radius,
    duration: stormAbility.duration,
    tickSeconds: stormAbility.tickSeconds,
    slowDuration: stormAbility.slowDuration,
    ability: stormAbility
  });
  attacks.updateFrostStorms(0.016);
  assert.equal(damageRecords.length, 1, '风暴首跳命中范围内单位');
  assert.equal(damageRecords[0].target, meleeUnit);
  assert.equal(damageRecords[0].amount, 12, '每秒攻击力×1 伤害');
  assert.equal(damageRecords[0].knockback, 0, '风暴无击退');
  assert.equal(damageRecords[0].context.isAttack, false, '风暴不附带攻击特效');
  assert.equal(damageRecords[0].context.skipHitEffect, true);
  assert.deepEqual(buffRecords.map((entry) => entry.buffId), ['frostStorm'], '风暴施加冰风减速');
  assert.equal(BUFF_DEFINITIONS.frostStorm.modifiers.length, 2, '冰风同时降低移速与攻速');
  assert.ok(BUFF_DEFINITIONS.frostStorm.modifiers.every((modifier) => modifier.factor === 0.6));
  damageRecords.length = 0;
  attacks.updateFrostStorms(1.0);
  assert.equal(damageRecords.length, 1, '风暴按每秒间隔重复跳伤');

  // 近战溅射：命中点周围敌人受 60% 攻击力范围伤，无击退/攻击特效
  const primary = { alive: true, underConstruction: false, position: new THREE.Vector3(2, 0, 0), projectileHitHeight: 1.4 };
  const splashVictim = { alive: true, underConstruction: false, position: new THREE.Vector3(2.8, 0, 0.4), projectileHitHeight: 1.4 };
  const outOfRange = { alive: true, underConstruction: false, position: new THREE.Vector3(6, 0, 0), projectileHitHeight: 1.4 };
  attacks.game.friendlyUnits.push(primary, splashVictim, outOfRange);
  damageRecords.length = 0;
  const splashed = attacks.tryBossSplashAttack(boss, primary);
  assert.equal(splashed, true);
  assert.equal(damageRecords.length, 2, '溅射命中范围内的全部旁侧单位');
  assert.ok(damageRecords.some((record) => record.target === splashVictim));
  assert.ok(damageRecords.every((record) => (
    record.target !== primary && record.target !== outOfRange
  )), '溅射不命中主目标与范围外单位');
  assert.ok(damageRecords.every((record) => Math.abs(record.amount - 7.2) < 1e-9), '溅射伤害为攻击力 60%');
  assert.ok(damageRecords.every((record) => record.knockback === 0), '溅射无击退');
  assert.ok(damageRecords.every((record) => record.context.isAttack === false), '溅射不附带攻击特效');
}
assert.equal(toRomanNumeral(1), 'I');
assert.equal(toRomanNumeral(2), 'II');
assert.equal(toRomanNumeral(11), 'XI');
const cardSystemSource = readFileSync(new URL('../src/systems/CardSystem.js', import.meta.url), 'utf8');
const cardStyleSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
assert.match(cardSystemSource, /this\.dragGhostPreviewCache = new WeakMap\(\)/);
assert.match(
  cardSystemSource,
  /this\.dragGhostPreviewCache\.get\(sourceElement\)[\s\S]*?this\.createDragGhostCardPreview\(sourceElement\)/,
  'ability-card drag should reuse its cached card face instead of cloning it on pointer-down'
);
assert.match(
  cardSystemSource,
  /host\.className = 'card-hand drag-ghost-card-host'/,
  'drag preview should opt into the same forged-card style context as the live hand'
);
assert.match(cardStyleSource, /\.drag-ghost\.has-card-preview \.drag-ghost-card-host\.card-hand/);
assert.doesNotMatch(
  cardStyleSource,
  /\.drag-ghost\.has-card-preview \.card:hover\s*\{[^}]*scale\(0\.84\)/,
  'drag preview must not use the old mismatched 84% hover scale'
);
assert.equal(
  Math.max(...CARD_DEFINITIONS.filter((card) => !card.retired).map((card) => [...card.name].length)),
  4,
  '可用卡牌名称最多四个汉字，手机标题行不应再依赖省略号'
);

{
  // 凛霜狼王 / 冰川先知：扑击、狼群召唤、风暴追逐、冰镜吸收
  globalThis.window = { innerWidth: 1, innerHeight: 1 };
  globalThis.document = {
    createElement() {
      return {
        className: '',
        innerHTML: '',
        style: {},
        querySelector() { return {}; },
        querySelectorAll() { return []; },
        remove() {}
      };
    }
  };
  const gameData = await import('../src/data/gameData.js');
  const { AttackSystem } = await import('../src/systems/AttackSystem.js');
  const snowBosses = gameData.LEVEL_DEFINITIONS.find((level) => level.id === 'snow-valley')?.bossPool ?? [];
  assert.ok(
    ['frostTrollBoss', 'frostWolfBoss', 'frostOracleBoss'].every((type) => (
      snowBosses.some((entry) => entry.type === type)
    )),
    '第一关 boss 波应包含冰霜巨魔/凛霜狼王/冰川先知'
  );
  assert.ok(gameData.WAVE_BOSS_TYPES.includes('frostWolfBoss'));
  assert.ok(gameData.WAVE_BOSS_TYPES.includes('frostOracleBoss'));

  const attacks = new AttackSystem();
  const records = { damage: [], buffs: [], spawnRing: 0, texts: [], units: [] };
  const wolfBoss = {
    alive: true,
    type: 'frostWolfBoss',
    team: 'enemy',
    position: new THREE.Vector3(0, 0, 0),
    definition: {
      attackDamageType: 'physical',
      damage: 13,
      monsterAbility: gameData.UNIT_DEFINITIONS.frostWolfBoss.monsterAbility
    },
    enemyForce: null,
    packSummonTimer: undefined
  };
  const enemyUnit = { alive: true, underConstruction: false, position: new THREE.Vector3(2, 0, 0), projectileHitHeight: 1.4 };
  const pathUnit = { alive: true, underConstruction: false, position: new THREE.Vector3(1.2, 0, 0.2), projectileHitHeight: 1.4 };
  attacks.game = {
    friendlyUnits: [enemyUnit, pathUnit],
    enemyUnits: [],
    elapsedTime: 0,
    unitsNear: (team) => (team === 'player' ? [] : [enemyUnit, pathUnit]),
    modifiers: { getAttackDamage: () => 13 },
    combat: {
      applyDamage(target, amount, source, knockback, context) {
        records.damage.push({ target, amount, knockback, context });
        return true;
      }
    },
    buffs: {
      applyBuff(target, buffId, source, overrides) {
        records.buffs.push({ target, buffId, overrides });
        return { id: buffId, ...overrides };
      }
    },
    effects: {
      spawnFrostPounceTrail() {},
      spawnRing() { records.spawnRing += 1; },
      spawnMonsterAbilityText() { records.texts.push('pounce'); },
      spawnIceMirrorAura() {},
      spawnDamageNumber() {},
      spawnEnemyCampBlast() {}
    },
    resolveWalkablePoint: (point) => point.clone(),
    groundHeightAt: () => 0,
    registerUnit(unit) {
      records.units.push(unit);
    },
    applyEnemyDifficulty() {},
    attachUnitStatus() {},
    markEndlessEnemySpawn() {},
    orderEnemyAttack() {}
  };
  // 霜牙扑击：路径与落点敌人受击 + 减速，Boss 位移到落点
  attacks.castFrostPounce(wolfBoss, enemyUnit, gameData.UNIT_DEFINITIONS.frostWolfBoss.monsterAbility);
  assert.ok(records.damage.length >= 2, '扑击命中路径与落点范围的敌人');
  assert.ok(records.buffs.every((entry) => entry.buffId === 'frostSnared'), '扑击施加寒咬减速');
  assert.ok(wolfBoss.position.distanceTo(new THREE.Vector3(2, 0, 0)) < 0.01, '狼王位移到落点');

  // 狼群附魔：自动召唤冰狼
  attacks.game.enemyUnits.push(wolfBoss);
  records.units.length = 0;
  wolfBoss.packSummonTimer = 0.01;
  attacks.updateWolfPackSummon(0.02);
  assert.equal(records.units.length, 1, '狼群附魔每 7 秒召唤一只冰狼');
  assert.equal(records.units[0].type, 'frostWolf');
  records.units.length = 0;
  wolfBoss.packSummonTimer = 0.01;
  attacks.updateWolfPackSummon(0.02);
  assert.equal(records.units.length, 1, '召唤间隔内不重复召唤');

  // 冰霜风暴追逐最近敌人
  const oracle = {
    alive: true,
    type: 'frostOracleBoss',
    team: 'enemy',
    position: new THREE.Vector3(5, 0, 5),
    definition: { monsterAbility: gameData.UNIT_DEFINITIONS.frostOracleBoss.monsterAbility }
  };
  const farFriend = { alive: true, underConstruction: false, position: new THREE.Vector3(0, 0, 0), projectileHitHeight: 1.4 };
  attacks.game.friendlyUnits.push(farFriend);
  attacks.frostStorms.push({
    source: oracle,
    position: new THREE.Vector3(3, 0, 3),
    age: 0,
    tickTimer: 0.4,
    radius: 3.8,
    duration: 4,
    tickSeconds: 1,
    slowDuration: 3,
    ability: gameData.UNIT_DEFINITIONS.frostOracleBoss.monsterAbility
  });
  attacks.updateFrostStorms(0.5);
  const storm = attacks.frostStorms[0];
  assert.ok(
    storm.position.distanceTo(new THREE.Vector3(0, 0, 0)) < 3,
    '先知风暴向最近敌人追逐移动'
  );

  // 冰镜结晶：吸收伤害并减速攻击者
  const { BuffSystem } = await import('../src/systems/BuffSystem.js');
  const buffGame = {
    elapsedTime: 0,
    effects: { spawnDamageNumber() {}, spawnRing() {} },
    friendlyUnits: [],
    enemyUnits: []
  };
  const buffs = new BuffSystem(buffGame);
  const oracleUnit = {
    alive: true,
    team: 'enemy',
    position: { x: 0, y: 0, z: 0 },
    buffs: new Map(),
    addBuff(buffId, definition, overrides = {}) {
      const buff = { ...definition, ...overrides, id: buffId };
      this.buffs.set(buffId, buff);
      return buff;
    },
    removeBuff(buffId) {
      this.buffs.delete(buffId);
    }
  };
  const attackerUnit = {
    alive: true,
    team: 'player',
    position: { x: 2, y: 0, z: 0 },
    buffs: new Map(),
    addBuff(buffId, definition, overrides = {}) {
      const buff = { ...definition, ...overrides, id: buffId };
      this.buffs.set(buffId, buff);
      return buff;
    }
  };
  const mirror = buffs.applyBuff(oracleUnit, 'frostMirror', oracleUnit, {
    duration: 6,
    frostMirrorRemaining: 50
  });
  assert.ok(mirror, '冰镜结晶 buff 可施加');
  const damageContext = {
    source: attackerUnit,
    target: oracleUnit,
    damage: 20,
    damageTypes: new Set(),
    buff: mirror
  };
  buffs.beforeDamage(damageContext);
  assert.equal(damageContext.damage, 0, '冰镜吸收全部伤害');
  assert.equal(mirror.frostMirrorRemaining, 30, '吸收量递减');
  assert.equal(attackerUnit.buffs.has('frostMirrorSlow'), true, '攻击者被寒锋减速');
  buffs.beforeDamage({ ...damageContext, damage: 40 });
  assert.equal(oracleUnit.buffs.has('frostMirror'), false, '吸收耗尽后冰镜破碎');
}

const touchTarget = { id: 21, alive: true, canReceiveBuffs: true, screen: { x: 100, y: 100 } };
const closerTarget = { id: 22, alive: true, canReceiveBuffs: true, screen: { x: 160, y: 142 } };
assert.equal(findFriendlyUnitScreenTarget(
  [touchTarget, closerTarget],
  [{ x: 100, y: 142 }, { x: 100, y: 100 }],
  (unit) => unit.screen,
  { acquireRadius: 84, stickyRadius: 112 }
), touchTarget, '触摸命中应同时检查指尖位置与指尖上方的可见单位');
assert.equal(findFriendlyUnitScreenTarget(
  [touchTarget],
  [{ x: 100, y: 0 }],
  (unit) => unit.screen,
  { acquireRadius: 84, stickyRadius: 112, previousTarget: touchTarget }
), touchTarget, '松手轻微漂移到获取半径之外时应粘住已高亮的附魔目标');

const fullEnchantTarget = {
  alive: true,
  position: { x: 0, y: 0, z: 0 },
  projectileHitHeight: 1.5,
  maxEnchantmentSlots: 2,
  enchantments: new Map([['fire', {}], ['thorns', {}]])
};
assert.equal(isEnchantmentCardBlocked(judgmentCard, fullEnchantTarget), true);
assert.equal(isEnchantmentCardBlocked({ ...judgmentCard, enchantmentId: 'fire', effect: { buffId: 'fire' } }, fullEnchantTarget), false);

let blockedNetworkCommands = 0;
let blockedSlotVisuals = 0;
let blockedHint = '';
const blockedCardSystem = Object.assign(Object.create(CardSystem.prototype), {
  playerSlot: 'p2',
  energy: 12,
  game: {
    networkBridge: {
      shouldRouteLocalCommands: () => true,
      commandSender: {
        playCard() {
          blockedNetworkCommands += 1;
          return true;
        }
      }
    },
    cardEffects: {
      showEnchantmentSlotFailure() {
        blockedSlotVisuals += 1;
      }
    }
  },
  setHint(text) {
    blockedHint = text;
  }
});
assert.equal(blockedCardSystem.playDraggedCard({
  card: { ...judgmentCard, instanceId: 'judgment-full-slot' },
  targetUnit: fullEnchantTarget
}, { hold: true }), false);
assert.equal(blockedCardSystem.energy, 12, '槽位已满时不得预扣客户端能量');
assert.equal(blockedNetworkCommands, 0, '槽位已满时不得发送长按附魔命令');
assert.equal(blockedSlotVisuals, 1);
assert.match(blockedHint, /附魔槽已满.*未消耗能量/);

let blockedHoldStopped = false;
blockedCardSystem.enchantHold = {
  drag: { card: { ...judgmentCard, instanceId: 'judgment-full-slot-hold' } },
  target: fullEnchantTarget,
  cost: 3,
  remainingUses: 4,
  tickCount: 0
};
blockedCardSystem.stopEnchantHold = () => {
  blockedHoldStopped = true;
  blockedCardSystem.enchantHold = null;
};
blockedCardSystem.rejectFullEnchantmentTarget = CardSystem.prototype.rejectFullEnchantmentTarget;
CardSystem.prototype.tickEnchantHold.call(blockedCardSystem);
assert.equal(blockedHoldStopped, true);
assert.equal(blockedCardSystem.energy, 12, '持续附魔检测到满槽时不得消耗能量');
assert.equal(blockedNetworkCommands, 0);

let zeroTickPlayedDrag = null;
const zeroTickHoldSystem = {
  drag: {
    card: { ...judgmentCard, instanceId: 'judgment-mobile-release' },
    targetUnit: touchTarget,
    mode: 'play',
    valid: true
  },
  enchantHold: {
    drag: null,
    target: touchTarget,
    tickCount: 0
  },
  enchantHoldInterval: null,
  clearEnchantHoldStartTimer() {},
  hideEnchantHoldUi() {},
  cleanupDrag() {
    this.drag = null;
  },
  playDraggedCard(drag) {
    zeroTickPlayedDrag = drag;
    return true;
  },
  game: { networkBridge: { shouldRouteLocalCommands: () => false } }
};
CardSystem.prototype.stopEnchantHold.call(zeroTickHoldSystem, { commit: true });
assert.equal(zeroTickPlayedDrag?.targetUnit, touchTarget);
assert.equal(zeroTickPlayedDrag?.card?.id, 'judgment-enchant');

assert.equal(rollOverflowChance(0, () => 0), 0);
assert.equal(rollOverflowChance(0.3, () => 0.29), 1);
assert.equal(rollOverflowChance(0.3, () => 0.31), 0);
assert.equal(rollOverflowChance(1.3, () => 0.29), 2);
assert.equal(rollOverflowChance(1.3, () => 0.31), 1);
assert.equal(rollOverflowChance(2, () => { throw new Error('整数概率不应再随机判定'); }), 2);

const resonanceCalls = [];
const resonanceVisuals = [];
const resonanceGame = createAbilityGame();
resonanceGame.cardEffects = {
  resolve(drag) {
    resonanceCalls.push(drag);
    return true;
  }
};
resonanceGame.effects.spawnDamageNumber = (position, amount, options) => {
  resonanceVisuals.push({ position, amount, options });
};
const resonanceAbilities = new AbilitySystem(resonanceGame, { mountUi: false, playerSlot: 'p1' });
resonanceAbilities.acquire('enchantResonance', 30, { silent: true });
const resonanceRandom = Math.random;
Math.random = () => 0.59;
try {
  resonanceAbilities.onCardPlayed(
    { id: 'fire-enchant', kind: 'enchant', level: 1 },
    { targetUnit: { id: 7 } }
  );
} finally {
  Math.random = resonanceRandom;
}
assert.equal(resonanceCalls.length, 4, '30 层附魔共鸣应保证 3 次，并以 60% 概率追加第 4 次');
assert.ok(resonanceCalls.every((drag) => drag.skipAbilityTriggers === true));
assert.equal(resonanceVisuals.at(-1)?.options?.text, '附魔共鸣x4');

const holdResolveCalls = [];
const holdVisuals = [];
const holdGame = createAbilityGame();
holdGame.cardEffects = {
  resolve(drag) {
    holdResolveCalls.push(drag);
    return true;
  }
};
holdGame.effects.spawnDamageNumber = (position, amount, options) => {
  holdVisuals.push({ position, amount, options });
};
const holdAbilities = new AbilitySystem(holdGame, { mountUi: false, playerSlot: 'p1' });
holdGame.abilitiesFor = () => holdAbilities;
holdAbilities.acquire('enchantResonance', 30, { silent: true });
const holdCard = {
  id: 'fire-enchant',
  kind: 'enchant',
  target: 'friendly-unit',
  level: 1,
  energyCost: 0,
  maxUses: 3,
  remainingUses: 3
};
const holdTarget = { id: 9 };
const holdDrag = {
  card: holdCard,
  targetUnit: holdTarget,
  mode: 'play',
  valid: true
};
let holdHandRenders = 0;
let holdCardUiUpdates = 0;
let holdCountdownRestarts = 0;
const holdCardSystem = {
  game: holdGame,
  playerSlot: 'p1',
  drag: holdDrag,
  enchantHold: {
    drag: holdDrag,
    target: holdTarget,
    cost: 0,
    remainingUses: 3,
    tickCount: 0
  },
  isCardOnCooldown: () => false,
  canSpend: () => true,
  resolveCard(drag) {
    return this.game.cardEffects.resolve(drag);
  },
  spendEnergy() {},
  consumeCardUse(card) {
    card.remainingUses = Math.max(0, card.remainingUses - 1);
    return 1;
  },
  renderHand() {
    holdHandRenders += 1;
  },
  updateCardAffordability() {},
  updateEnchantHoldCardUi(card) {
    holdCardUiUpdates += 1;
    assert.equal(card, holdCard);
  },
  updateEnchantHoldUi() {
    holdCountdownRestarts += 1;
  },
  markNetworkStateDirty() {},
  stopEnchantHold() {
    throw new Error('有效的长按附魔不应提前停止');
  },
  setHint() {},
  rejectFullEnchantmentTarget: CardSystem.prototype.rejectFullEnchantmentTarget,
  playDraggedCard: CardSystem.prototype.playDraggedCard
};
const holdRandom = Math.random;
Math.random = () => 0.61;
try {
  CardSystem.prototype.tickEnchantHold.call(holdCardSystem);
} finally {
  Math.random = holdRandom;
}
assert.equal(holdResolveCalls.length, 4, '长按每跳应结算原附魔，并触发 30 层共鸣的 3 次保证追加');
assert.equal(holdCard.remainingUses, 2);
assert.equal(holdCardSystem.enchantHold.remainingUses, 2);
assert.equal(holdCardSystem.enchantHold.tickCount, 1);
assert.equal(holdVisuals.at(-1)?.options?.text, '附魔共鸣x3');
assert.equal(holdHandRenders, 0, '持续附魔时不能重建手牌 DOM，否则后续倒计时会更新脱离页面的旧节点');
assert.equal(holdCardUiUpdates, 1, '持续附魔应原位更新卡牌次数');
assert.equal(holdCountdownRestarts, 1, '每轮持续附魔后都应重新启动倒计时动画');

const abilityGame = createAbilityGame();
const abilities = new AbilitySystem(abilityGame, { mountUi: false, playerSlot: 'p1' });
abilityGame.abilitiesFor = () => abilities;
abilities.acquire('inspiration', 3, { silent: true });

const baseCard = { id: 'swordsmen', kind: 'summon', level: 2, energyCost: 3 };
const preparedCard = abilities.prepareCardForPlay(baseCard);
assert.notEqual(preparedCard, baseCard);
assert.equal(preparedCard.level, 3);
assert.equal(baseCard.level, 2);
assert.equal(abilities.consumePreparedCardPlay(baseCard, preparedCard), true);
assert.equal(abilities.getStacks('inspiration'), 2);

const inspirationPrepared = abilities.prepareCardForPlay(inspirationCard);
assert.equal(inspirationPrepared, inspirationCard, '灵感自身不能消耗或享受灵感临时升级');
assert.equal(abilities.getStacks('inspiration'), 2);

const cardPlayGame = {
  runCardsPlayedCount: 0,
  abilitiesFor: () => abilities
};
const cardSystem = {
  game: cardPlayGame,
  playerSlot: 'p1',
  rejectFullEnchantmentTarget: CardSystem.prototype.rejectFullEnchantmentTarget,
  isCardOnCooldown: () => false,
  canSpend: () => true,
  resolveCard(drag) {
    this.resolvedCard = drag.card;
    return true;
  },
  spendEnergy(cost) {
    this.spentEnergy = cost;
  },
  moveCardToDiscard(card) {
    this.discardedCard = card;
  }
};
assert.equal(CardSystem.prototype.playDraggedCard.call(cardSystem, { card: baseCard }), true);
assert.equal(cardSystem.resolvedCard.level, 3);
assert.equal(cardSystem.spentEnergy, 3);
assert.equal(cardSystem.discardedCard, baseCard);
assert.equal(abilities.getStacks('inspiration'), 1);

cardSystem.resolveCard = () => false;
assert.equal(CardSystem.prototype.playDraggedCard.call(cardSystem, { card: baseCard }), false);
assert.equal(abilities.getStacks('inspiration'), 1, '结算失败不应消耗灵感');

const bodySources = new Map();
const bodyUnit = {
  alive: true,
  health: 8,
  position: { x: 0, y: 0, z: 0 },
  projectileHitHeight: 1.5,
  attributes: {
    removeModifiersBySource(source) {
      bodySources.delete(source);
    },
    addModifier(modifier, source) {
      bodySources.set(source, modifier);
    }
  },
  get maxHealth() {
    return 10 + [...bodySources.values()].reduce((sum, modifier) => sum + (modifier.amount ?? 0), 0);
  },
  clampToAttributeCaps() {
    this.health = Math.min(this.health, this.maxHealth);
  }
};
const bodyGame = createBuffGame();
const bodyBuffs = new BuffSystem(bodyGame);
const bodyBuff = { id: 'bodyForging', level: 11 };
const originalRandom = Math.random;
Math.random = () => 0.29;
try {
  bodyBuffs.applyEffect(BUFF_DEFINITIONS.bodyForging.effects[0], {
    target: bodyUnit,
    buff: bodyBuff
  });
} finally {
  Math.random = originalRandom;
}
assert.equal(bodyBuff.bodyForgingBonus, 2, '130% 概率应成功一次并以 30% 再判定一次');
assert.equal(bodyUnit.maxHealth, 12);
assert.equal(bodyUnit.health, 10);

const judgmentCalls = [];
const judgmentGame = createBuffGame();
judgmentGame.elapsedTime = 0;
judgmentGame.effects.spawnJudgmentSword = (position, radius, onImpact) => {
  judgmentCalls.push({ position, radius });
  onImpact();
};
judgmentGame.combat = {
  applyAttack(source, target, override) {
    judgmentCalls.push({ source, target, override });
    return true;
  }
};
const judgmentBuffs = new BuffSystem(judgmentGame);
const defender = { id: 1, alive: true, team: 'player', position: { x: 0, y: 0, z: 0 } };
const secondDefender = { id: 3, alive: true, team: 'player', position: { x: -1, y: 0, z: 0 } };
const attacker = { id: 2, alive: true, team: 'enemy', position: { x: 2, y: 0, z: 0 } };
const judgmentBuff = { id: 'judgment', level: 3 };
const secondJudgmentBuff = { id: 'judgment', level: 2 };
const attackContext = {
  source: attacker,
  target: defender,
  buff: judgmentBuff,
  isAttack: true,
  damageTypes: new Set()
};
judgmentBuffs.applyEffect(BUFF_DEFINITIONS.judgment.effects[0], attackContext);
assert.equal(judgmentCalls.length, 2);
assert.equal(judgmentCalls[1].source, defender);
assert.equal(judgmentCalls[1].target, attacker);
assert.equal(judgmentCalls[1].override.damage, 6);
assert.equal(judgmentCalls[1].override.attackDamageType, 'magic');
assert.equal(judgmentCalls[1].override.damageTypes.has('judgment'), true);

judgmentBuffs.applyEffect(BUFF_DEFINITIONS.judgment.effects[0], {
  ...attackContext,
  target: secondDefender,
  buff: secondJudgmentBuff
});
assert.equal(judgmentCalls.length, 4, '不同审判持有者应各自拥有独立的5秒冷却');
assert.equal(judgmentCalls[3].source, secondDefender);
assert.equal(judgmentCalls[3].override.damage, 4);

judgmentGame.elapsedTime = 4.99;
judgmentBuffs.applyEffect(BUFF_DEFINITIONS.judgment.effects[0], attackContext);
assert.equal(judgmentCalls.length, 4, '同一持有者的5秒冷却内不能再次触发');
judgmentGame.elapsedTime = 5;
judgmentBuffs.applyEffect(BUFF_DEFINITIONS.judgment.effects[0], attackContext);
assert.equal(judgmentCalls.length, 6, '同一持有者在5秒时应重新就绪');

judgmentGame.elapsedTime = 10;
judgmentBuffs.applyEffect(BUFF_DEFINITIONS.judgment.effects[0], {
  ...attackContext,
  damageTypes: new Set(['judgment'])
});
assert.equal(judgmentCalls.length, 6, '审判伤害不能触发另一轮审判');

// —— 审判事件分发：友方单位受击即触发（不要求持有者本人被击中）——
const allyCalls = [];
const allyGame = createBuffGame();
allyGame.elapsedTime = 0;
allyGame.effects.spawnJudgmentSword = (position, radius, onImpact) => {
  allyCalls.push({ position, radius });
  onImpact();
};
allyGame.combat = {
  applyAttack(source, target, override) {
    allyCalls.push({ source, target, override });
    return true;
  }
};
const allyBuffs = new BuffSystem(allyGame);
const judgmentHolder = { id: 11, alive: true, team: 'player', position: { x: 0, y: 0, z: 0 } };
judgmentHolder.buffs = new Map([['judgment', {
  id: 'judgment',
  level: 1,
  effects: BUFF_DEFINITIONS.judgment.effects
}]]);
const friendUnit = { id: 12, alive: true, team: 'player', position: { x: 1, y: 0, z: 0 } };
friendUnit.buffs = new Map();
const enemyAttacker = { id: 13, alive: true, team: 'enemy', position: { x: 3, y: 0, z: 0 } };
allyBuffs.judgmentHolders.add(judgmentHolder);
// 友方非持有者被攻击 → 持有者反击攻击者
allyBuffs.afterDamage({
  source: enemyAttacker,
  target: friendUnit,
  damageTypes: new Set(),
  isAttack: true,
  damageDealt: 4
});
assert.equal(allyCalls.length, 2, '友方单位受击时应触发审判持有者反击');
assert.equal(allyCalls[1].source, judgmentHolder);
assert.equal(allyCalls[1].target, enemyAttacker);
assert.equal(allyCalls[1].override.damage, 2, '审判反击伤害为等级×2 魔法伤害');
// 持有者本人被攻击 → 仍只触发一次（自身也属于友方单位，且受同一 5 秒冷却约束）
allyBuffs.afterDamage({
  source: enemyAttacker,
  target: judgmentHolder,
  damageTypes: new Set(),
  isAttack: true,
  damageDealt: 3
});
assert.equal(allyCalls.length, 2, '持有者本人被击中也不应重复触发（同一冷却）');
// 非攻击来源（法术/持续伤害）不触发审判
allyGame.elapsedTime = 6;
allyBuffs.afterDamage({
  source: enemyAttacker,
  target: friendUnit,
  damageTypes: new Set(),
  isAttack: false,
  damageDealt: 4
});
assert.equal(allyCalls.length, 2, '非攻击伤害不触发审判');
// 队伍隔离：敌方受击时只由敌方审判持有者反击
const enemyHolder = { id: 21, alive: true, team: 'enemy', position: { x: 9, y: 0, z: 9 } };
enemyHolder.buffs = new Map([['judgment', {
  id: 'judgment',
  level: 2,
  effects: BUFF_DEFINITIONS.judgment.effects
}]]);
allyBuffs.judgmentHolders.add(enemyHolder);
const playerAttacker = { id: 22, alive: true, team: 'player', position: { x: 5, y: 0, z: 5 } };
const enemyVictim = { id: 23, alive: true, team: 'enemy', position: { x: 8, y: 0, z: 8 } };
enemyVictim.buffs = new Map();
allyGame.elapsedTime = 12;
allyBuffs.afterDamage({
  source: playerAttacker,
  target: enemyVictim,
  damageTypes: new Set(),
  isAttack: true,
  damageDealt: 2
});
assert.equal(allyCalls.length, 4, '敌方审判持有者同样在友方单位受击时反击');
assert.equal(allyCalls[3].source, enemyHolder);
assert.equal(allyCalls[3].override.damage, 4);

console.log('new card effect tests passed');

function createAbilityGame() {
  return {
    localPlayerSlot: 'p1',
    elapsedTime: 0,
    friendlyUnits: [],
    playerBase: { position: { x: 0, y: 0, z: 0 } },
    effects: {
      spawnDamageNumber() {}
    },
    networkBridge: {
      markPrivateStateDirty() {}
    }
  };
}

function createBuffGame() {
  return {
    elapsedTime: 0,
    effects: {
      spawnRing() {},
      spawnDamageNumber() {},
      spawnJudgmentSword() {}
    }
  };
}
