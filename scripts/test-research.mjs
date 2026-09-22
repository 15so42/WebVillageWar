// 科技与附魔规则回归测试（方案第 9 节）。
//
// 守住三件容易写错的事：
//   1. 没建好科研站不能研究；前置科技没研究不能跳级；
//   2. 材料不够时研究/制作**一个材料都不扣**；
//   3. 没被科技解锁的配方不能出现在合成列表里（由 recipeUnlocked 判定）。
import assert from 'node:assert/strict';
import {
  ENCHANT_ERROR,
  RESEARCH_ERROR,
  allEnchantRecipes,
  allTechs,
  applyProductionPatch,
  canEnchant,
  canResearch,
  enchantRecipeById,
  harvestPerActionBonus,
  missingEnchantInputs,
  missingPrerequisites,
  missingTechInputs,
  normalizeTech,
  productionPatchFor,
  recipeUnlocked,
  techById
} from '../src/systems/research.js';
import {
  ENCHANTMENTS,
  ITEM_DEFINITIONS,
  PRODUCTION_RECIPES,
  RECIPES,
  TECH_DEFINITIONS
} from '../src/data/gameData.js';

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

/** 假的库存查询：给一个 { itemId: count } 表就够了，规则层不需要真库存。 */
const counts = (table) => (itemId) => table[itemId] ?? 0;

check('数据健全：科技成本与附魔成本里的物品都有定义，附魔种类都存在', () => {
  assert.ok(allTechs().length > 0);
  allTechs().forEach((tech) => {
    tech.cost.forEach((entry) => {
      assert.ok(ITEM_DEFINITIONS[entry.itemId], `科技成本 ${entry.itemId} 必须有物品定义`);
      assert.ok(entry.count > 0);
    });
    tech.requires.forEach((id) => {
      assert.ok(TECH_DEFINITIONS[id], `前置科技 ${id} 必须有定义`);
    });
    tech.unlocks.recipes.forEach((id) => {
      assert.ok(RECIPES[id], `解锁的配方 ${id} 必须有定义`);
    });
  });
  allEnchantRecipes().forEach((recipe) => {
    assert.ok(ENCHANTMENTS[recipe.enchantmentId], `附魔 ${recipe.enchantmentId} 必须有定义`);
    recipe.cost.forEach((entry) => {
      assert.ok(ITEM_DEFINITIONS[entry.itemId], `附魔成本 ${entry.itemId} 必须有物品定义`);
    });
  });
});

check('配方上的 tech 字段必须指向真实科技，否则那条配方会永远锁着', () => {
  Object.values(RECIPES).forEach((recipe) => {
    if (!recipe.tech) return;
    assert.ok(TECH_DEFINITIONS[recipe.tech], `配方 ${recipe.id} 指向了不存在的科技 ${recipe.tech}`);
  });
  // 至少有一条被科技锁着的配方，否则这条测试没有意义
  assert.ok(Object.values(RECIPES).some((recipe) => recipe.tech));
});

check('没有科研站时不能研究，理由明确', () => {
  const result = canResearch('enchanting', {
    researched: new Set(),
    countOf: counts({ stone: 999, iron: 999, deepCore: 9 }),
    stationReady: false
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, RESEARCH_ERROR.noStation);
  assert.equal(result.missing.length, 0);
});

check('材料不够时不能研究，并报清缺什么', () => {
  const result = canResearch('enchanting', {
    researched: new Set(),
    countOf: counts({ stone: 40, iron: 3 }),
    stationReady: true
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, RESEARCH_ERROR.missingInputs);
  assert.deepEqual(result.missing.map((entry) => entry.itemId), ['iron', 'deepCore']);
  assert.equal(result.missing[0].missing, 9);
});

check('材料齐备且科研站建好 → 可以研究；已研究的不能重复研究', () => {
  const full = counts({ stone: 40, iron: 12, deepCore: 1 });
  assert.equal(canResearch('enchanting', { researched: new Set(), countOf: full, stationReady: true }).ok, true);
  const again = canResearch('enchanting', {
    researched: new Set(['enchanting']),
    countOf: full,
    stationReady: true
  });
  assert.equal(again.ok, false);
  assert.equal(again.reason, RESEARCH_ERROR.alreadyResearched);
});

check('前置科技没研究就不能跳级', () => {
  const chained = { id: 'x', name: 'X', cost: [], requires: ['enchanting'], unlocks: { recipes: [] } };
  const normalized = normalizeTech(chained);
  assert.deepEqual(missingPrerequisites(chained, new Set()), ['enchanting']);
  assert.deepEqual(missingPrerequisites(chained, new Set(['enchanting'])), []);
  const result = canResearch(normalized, {
    researched: new Set(),
    countOf: counts({}),
    stationReady: true
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, RESEARCH_ERROR.missingPrerequisites);
  assert.deepEqual(result.prerequisites, ['enchanting']);
});

check('未知科技与未知附魔都被拒绝', () => {
  assert.equal(canResearch('nope', { stationReady: true }).reason, RESEARCH_ERROR.unknownTech);
  assert.equal(techById('nope'), null);
  assert.equal(canEnchant('nope', { tableReady: true }).reason, ENCHANT_ERROR.unknownEnchantment);
  assert.equal(enchantRecipeById('nope'), null);
});

check('没建好附魔台就不能制作附魔石', () => {
  const result = canEnchant('fire', {
    countOf: counts({ iron: 99, charcoal: 99 }),
    tableReady: false
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, ENCHANT_ERROR.noTable);
});

check('附魔材料不够时报清缺口，够了才放行', () => {
  const short = canEnchant('fire', { countOf: counts({ iron: 5, charcoal: 1 }), tableReady: true });
  assert.equal(short.ok, false);
  assert.equal(short.reason, ENCHANT_ERROR.missingInputs);
  const full = canEnchant('fire', { countOf: counts({ iron: 6, charcoal: 4 }), tableReady: true });
  assert.equal(full.ok, true);
});

check('missingTechInputs / missingEnchantInputs 的 need/have/missing 口径一致', () => {
  const tech = techById('enchanting');
  const missing = missingTechInputs(tech, counts({ stone: 10, iron: 12, deepCore: 0 }));
  assert.equal(missing.length, 2);
  const stone = missing.find((entry) => entry.itemId === 'stone');
  assert.deepEqual(stone, { itemId: 'stone', need: 40, have: 10, missing: 30 });
  const enchant = missingEnchantInputs(enchantRecipeById('thorns'), counts({ fiber: 20, iron: 1 }));
  assert.deepEqual(enchant, [{ itemId: 'iron', need: 4, have: 1, missing: 3 }]);
});

check('没被科技解锁的配方不算解锁，没有 tech 字段的默认解锁', () => {
  assert.equal(recipeUnlocked(RECIPES.furnace, new Set()), true);
  assert.equal(recipeUnlocked(RECIPES.enchantTable, new Set()), false);
  assert.equal(recipeUnlocked(RECIPES.enchantTable, new Set(['enchanting'])), true);
  assert.equal(recipeUnlocked(null, new Set()), true);
});

check('附魔成本不含附魔卡相关字段（新玩法不依赖抽牌）', () => {
  allEnchantRecipes().forEach((recipe) => {
    recipe.cost.forEach((entry) => {
      assert.ok(!/card|energy/i.test(entry.itemId), `附魔成本里不该出现卡牌/能量相关物品：${entry.itemId}`);
    });
  });
});

check('科技效果的指向必须真实存在（配方 id / 采集加成都要能用）', () => {
  allTechs().forEach((tech) => {
    tech.effects.production.forEach((entry) => {
      const recipe = PRODUCTION_RECIPES[entry.recipeId];
      assert.ok(recipe, `科技 ${tech.id} 指向了不存在的生产配方 ${entry.recipeId}`);
      if (entry.patch.output?.itemId) {
        assert.ok(ITEM_DEFINITIONS[entry.patch.output.itemId], '补丁里的产物必须有物品定义');
      }
      if (entry.patch.output?.count != null) {
        assert.ok(entry.patch.output.count > 0, '产出数量必须是正数');
      }
    });
    assert.ok(tech.effects.harvest.perActionBonus >= 0);
  });
});

check('「高效烧炭」真的把熔炉产出从 2 提到 3（研究前不受影响）', () => {
  const base = PRODUCTION_RECIPES.furnace;
  assert.equal(base.output.count, 2, '基础配方应当是 2 个木炭');
  // 没研究 → 没有补丁
  assert.equal(productionPatchFor('furnace', new Set()), null);
  assert.equal(productionPatchFor('furnace', new Set(['harvesting'])), null, '别的科技不该影响熔炉');
  const patch = productionPatchFor('furnace', new Set(['efficientFuel']));
  assert.ok(patch, '研究了高效烧炭就该有补丁');
  const patched = applyProductionPatch(base, patch);
  assert.equal(patched.output.count, 3);
  assert.equal(patched.output.itemId, 'charcoal');
  assert.equal(patched.input.count, base.input.count, '投入不变');
  assert.equal(patched.seconds, base.seconds, '周期不变');
  // **纯函数**：不能就地改共享的配方表
  assert.equal(base.output.count, 2, '原配方必须保持不变，否则补丁会泄漏到下一局');
});

check('补丁写坏时退回原值，不会产出 0 个或 NaN', () => {
  const base = PRODUCTION_RECIPES.furnace;
  assert.equal(applyProductionPatch(base, { output: { count: 0 } }).output.count, base.output.count);
  assert.equal(applyProductionPatch(base, { output: { count: 'abc' } }).output.count, base.output.count);
  assert.equal(applyProductionPatch(base, { seconds: -5 }).seconds, base.seconds);
  assert.equal(applyProductionPatch(base, { drainPerSecond: 'x' }).drainPerSecond, base.drainPerSecond);
  assert.equal(applyProductionPatch(base, null), base);
  assert.equal(applyProductionPatch(null, { output: { count: 3 } }), null);
});

check('「采集效率」给出每次采集的加成，未研究时为 0', () => {
  assert.equal(harvestPerActionBonus(new Set()), 0);
  assert.equal(harvestPerActionBonus(new Set(['enchanting'])), 0, '附魔工艺不该改采集');
  assert.equal(harvestPerActionBonus(new Set(['harvesting'])), 2);
  assert.equal(harvestPerActionBonus(new Set(['harvesting', 'efficientFuel'])), 2, '加成不会互相叠加成奇怪的数');
});

check('多个科技同时改同一条配方时按研究集合合并，不互相覆盖成空', () => {
  const both = new Set(['efficientFuel', 'harvesting']);
  const patch = productionPatchFor('furnace', both);
  assert.equal(applyProductionPatch(PRODUCTION_RECIPES.furnace, patch).output.count, 3);
  // 没有补丁的配方保持原样
  assert.equal(productionPatchFor('nonexistent', both), null);
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
