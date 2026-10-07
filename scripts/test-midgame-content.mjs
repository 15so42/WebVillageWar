// 中段内容：锻造、铁工具采集加成、弩炮、三种附魔、外圈巢穴不再是同一批敌人。
import assert from 'node:assert/strict';
import {
  ENCHANTMENTS,
  ITEM_DEFINITIONS,
  RECIPES,
  TECH_DEFINITIONS,
  UNIT_DEFINITIONS
} from '../src/data/gameData.js';
import { enchantRecipeById, recipeUnlocked } from '../src/systems/research.js';
import { toolHarvestRate } from '../src/systems/resources.js';
import { islandOuterSpawnPoints } from '../src/systems/survivalExpansion.js';
import { canEquipWeapon } from '../src/systems/weapons.js';

const report = [];
function check(name, fn) {
  try {
    fn();
    report.push(`ok   ${name}`);
  } catch (error) {
    report.push(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

check('没研究锻造时做不了铁工具，研究之后配方出现', () => {
  assert.equal(recipeUnlocked(RECIPES.ironAxe, new Set()), false);
  assert.equal(recipeUnlocked(RECIPES.puppetIronBlade, new Set()), false);
  assert.equal(recipeUnlocked(RECIPES.ironAxe, new Set(['smithing'])), true);
  assert.equal(TECH_DEFINITIONS.smithing.unlocks.recipes.includes('ironPickaxe'), true);
});

check('攻城器械要先有锻造，弩炮比箭塔打得重、射得慢', () => {
  assert.deepEqual(TECH_DEFINITIONS.siegeWorks.requires, ['smithing']);
  assert.equal(recipeUnlocked(RECIPES.ballista, new Set(['smithing'])), false);
  assert.equal(recipeUnlocked(RECIPES.ballista, new Set(['smithing', 'siegeWorks'])), true);
  assert.ok(UNIT_DEFINITIONS.ballista.damage > UNIT_DEFINITIONS.arrowTower.damage);
  assert.ok(UNIT_DEFINITIONS.ballista.attackRate < UNIT_DEFINITIONS.arrowTower.attackRate);
  assert.ok(UNIT_DEFINITIONS.ballista.attackRange > UNIT_DEFINITIONS.arrowTower.attackRange);
});

check('铁斧仍算斧，但砍得比木斧快', () => {
  assert.equal(ITEM_DEFINITIONS.ironAxe.tool, 'axe');
  assert.equal(ITEM_DEFINITIONS.ironPickaxe.tool, 'pickaxe');
  assert.ok(ITEM_DEFINITIONS.ironAxe.harvestRate > 1);
  const wood = toolHarvestRate([{ itemId: 'axe' }], 'axe');
  const iron = toolHarvestRate([{ itemId: 'axe' }, { itemId: 'ironAxe' }], 'axe');
  const wrong = toolHarvestRate([{ itemId: 'ironPickaxe' }], 'axe');
  assert.equal(wood, 1);
  assert.equal(iron, ITEM_DEFINITIONS.ironAxe.harvestRate);
  assert.equal(wrong, 1);
});

check('傀儡铁刃木傀儡和铁傀儡都能装，而且比木刃疼', () => {
  assert.equal(canEquipWeapon('puppetIronBlade', { type: 'woodPuppet' }).ok, true);
  assert.equal(canEquipWeapon('puppetIronBlade', { type: 'ironPuppet' }).ok, true);
  assert.ok(ITEM_DEFINITIONS.puppetIronBlade.weapon.damage > ITEM_DEFINITIONS.puppetGlaive.weapon.damage);
});

check('附魔台多了吸血、出血和坚韧，一块石头要堆很多材料，而且不用食物', () => {
  for (const id of ['lifesteal', 'bleed', 'toughness']) {
    const recipe = enchantRecipeById(id);
    assert.ok(recipe, id);
    assert.ok(ENCHANTMENTS[id], id);
    assert.equal(recipe.cost.some((entry) => entry.itemId === 'food'), false);
    const bulk = recipe.cost.reduce((sum, entry) => sum + entry.count, 0);
    assert.ok(bulk >= 60, `${id} 成本只有 ${bulk}`);
  }
});

check('外圈四座巢穴敌人不一样，而且都还掉深邃核心和铁矿', () => {
  const nests = islandOuterSpawnPoints();
  assert.equal(nests.length, 4);
  const signatures = nests.map((nest) => nest.enemyPool.map((entry) => entry.type).sort().join(','));
  assert.equal(new Set(signatures).size, 4);
  nests.forEach((nest) => {
    assert.ok(nest.drops.some((drop) => drop.itemId === 'deepCore' && drop.count >= 1));
    assert.ok(nest.drops.some((drop) => drop.itemId === 'iron' && drop.count >= 1));
    assert.equal(nest.drops.some((drop) => drop.itemId === 'food'), false);
    nest.enemyPool.forEach((entry) => {
      assert.ok(UNIT_DEFINITIONS[entry.type], entry.type);
    });
    nest.recruitReward.types.forEach((type) => {
      assert.ok(UNIT_DEFINITIONS[type], type);
    });
  });
});

console.log(report.join('\n'));
if (process.exitCode) process.exit(process.exitCode);
