import assert from 'node:assert/strict';
import { BUFF_DEFINITIONS, TEAMS } from '../src/data/gameData.js';
import {
  ENEMY_RANDOM_ENCHANT_IDS,
  EnemyEnchantmentSystem,
  waveEnchantCountForIndex
} from '../src/systems/EnemyEnchantmentSystem.js';

assert.equal(new Set(ENEMY_RANDOM_ENCHANT_IDS).size, ENEMY_RANDOM_ENCHANT_IDS.length);
assert.equal(ENEMY_RANDOM_ENCHANT_IDS.includes('waveSwarm'), false, '随机池不应包含已移除的集群附魔');
ENEMY_RANDOM_ENCHANT_IDS.forEach((buffId) => {
  assert.equal(BUFF_DEFINITIONS[buffId]?.category, 'enchantment', `${buffId} 必须是有效附魔`);
});

const picker = Object.create(EnemyEnchantmentSystem.prototype);
const makePickerUnit = (overrides = {}) => ({
  id: 41,
  type: 'goblinSoldier',
  definition: { role: 'melee', traits: [] },
  enchantments: new Map(),
  ...overrides
});
const baseWave = { id: 9, index: 9, effectiveDifficulty: 3 };
const themeResults = ['swarm', 'armored', 'rush', 'ranged', 'siege'].map((affixId) => (
  picker.pickEnchantForUnit(makePickerUnit(), { ...baseWave, affixId }, 0)
));
assert.equal(new Set(themeResults).size, 1, '波次主题不应改变随机附魔结果');
assert.equal(
  picker.pickEnchantForUnit(makePickerUnit({ type: 'goblinArcher', definition: { role: 'ranged', traits: [] } }), baseWave, 0),
  picker.pickEnchantForUnit(makePickerUnit({ type: 'ogre', definition: { role: 'melee', traits: [] } }), baseWave, 0),
  '兵种和定位不应改变随机附魔结果'
);

const innateBuff = 'poison';
const unit = {
  id: 73,
  alive: true,
  team: TEAMS.ENEMY,
  type: 'venomArcher',
  definition: { role: 'ranged', traits: [] },
  maxEnchantmentSlots: 5,
  enchantments: new Map([[innateBuff, { id: innateBuff, level: 1 }]]),
  buffs: new Map([[innateBuff, { id: innateBuff, level: 1 }]]),
  maxHealth: 100,
  health: 100,
  maxShield: 0,
  shield: 0,
  weapon: { maxDurability: 20, durability: 20 },
  addBuff(id, definition, overrides = {}) {
    const buff = { ...definition, ...overrides, id, level: overrides.level ?? 1 };
    this.buffs.set(id, buff);
    if (definition.category === 'enchantment') this.enchantments.set(id, buff);
    return buff;
  }
};
const game = {
  isEndlessMode: () => false,
  friendlyUnits: [],
  enemyUnits: [unit],
  buffs: {
    applyBuff(target, id, source, overrides) {
      return target.addBuff(id, BUFF_DEFINITIONS[id], { ...overrides, source });
    }
  },
  enemyEnergyAvailableForEnchant: () => 0,
  spendEnemyEnergy: () => false,
  grantEnemyEnergy: () => {},
  effects: { spawnDamageNumber: () => {} }
};
new EnemyEnchantmentSystem(game).enchantSpawnWave([unit], {
  id: 7,
  index: 7,
  effectiveDifficulty: 2,
  affixId: 'rush'
});
assert.equal(waveEnchantCountForIndex(7), 2);
assert.equal(unit.enchantments.has(innateBuff), true, '兵种自带附魔应保留');
assert.equal(unit.enchantments.size, 2, '自带附魔占用一次，剩余次数应随机补满');
assert.equal([...unit.enchantments.keys()].filter((id) => id === innateBuff).length, 1);
assert.equal([...unit.enchantments.values()].at(-1).level, 1, '附魔等级只应由难度决定，不应再随波次重复成长');

console.log('Enemy enchantment randomization checks passed.');
