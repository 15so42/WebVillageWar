// 生产规则回归测试（方案第 9 节）。
//
// 这一块的核心是三条"不许出现"的状态：
//   1. 缺料时凭空产出；
//   2. 缺料时把已经攒的进度清零（材料接上之后应该接着烧，不是从头再来）；
//   3. 一段时间内的产出超过材料允许的次数。
import assert from 'node:assert/strict';
import {
  advanceProduction,
  allProductionRecipes,
  maxCyclesByInput,
  maxCyclesByOutput,
  maxCyclesForFurnace,
  maxCyclesForFurnaceSlot,
  normalizeProductionRecipe,
  productionCycleAmounts,
  productionRecipeById,
  productionRecipeForInput,
  productionRecipeForUnitType,
  settleFurnaceProduction
} from '../src/systems/production.js';
import { ITEM_DEFINITIONS, PRODUCTION_RECIPES } from '../src/data/gameData.js';
import { Inventory } from '../src/systems/Inventory.js';

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

check('配方数据健全：材料与产物都有物品定义，周期与数量都是正数', () => {
  assert.ok(allProductionRecipes().length > 0);
  allProductionRecipes().forEach((recipe) => {
    assert.ok(ITEM_DEFINITIONS[recipe.input.itemId], `材料 ${recipe.input.itemId} 必须有定义`);
    assert.ok(ITEM_DEFINITIONS[recipe.output.itemId], `产物 ${recipe.output.itemId} 必须有定义`);
    assert.ok(recipe.input.count > 0 && recipe.output.count > 0);
    assert.ok(recipe.seconds > 0);
  });
  assert.equal(productionRecipeById('furnace')?.name, '烧炭');
  assert.equal(productionRecipeForUnitType('furnace')?.input.itemId, 'wood');
  assert.equal(productionRecipeForInput('furnace', 'wood')?.output.itemId, 'charcoal');
  assert.equal(productionRecipeForUnitType('furnace')?.drainPerSecond, 1);
  assert.equal(productionRecipeForUnitType('arrowTower'), null, '没有配方的建筑不该被登记成生产者');
});

check('非法配方一律返回 null，不会产出 NaN', () => {
  assert.equal(normalizeProductionRecipe(null), null);
  assert.equal(normalizeProductionRecipe({ id: 'x' }), null);
  assert.equal(normalizeProductionRecipe({ id: 'x', input: { itemId: 'wood', count: 0 }, output: { itemId: 'charcoal', count: 1 }, seconds: 5 }), null);
  assert.equal(normalizeProductionRecipe({ id: 'x', input: { itemId: 'wood', count: 1 }, output: { itemId: 'charcoal', count: 1 }, seconds: 0 }), null);
  assert.equal(normalizeProductionRecipe({ id: 'x', input: { itemId: 'wood', count: 1 }, output: { itemId: 'charcoal', count: 1 }, seconds: 'abc' }), null);
});

check('进度攒够一个周期就结算一次，余数留到下一段', () => {
  const recipe = PRODUCTION_RECIPES.furnace;
  const seconds = recipe.seconds;
  const step = advanceProduction({ progress: 0, dt: seconds * 0.6, seconds, cyclesAllowed: 5 });
  assert.equal(step.cycles, 0, '不到一个周期不该结算');
  assert.equal(Math.round(step.progress * 100) / 100, Math.round(seconds * 0.6 * 100) / 100);
  const second = advanceProduction({ progress: step.progress, dt: seconds * 0.6, seconds, cyclesAllowed: 5 });
  assert.equal(second.cycles, 1, '累计满一个周期结算一次');
  assert.equal(Math.round(second.progress * 100) / 100, Math.round(seconds * 0.2 * 100) / 100);
});

check('一段 dt 里最多结算 cyclesAllowed 次，而且空转时间不会攒成下一次的工作量', () => {
  const recipe = PRODUCTION_RECIPES.furnace;
  const step = advanceProduction({
    progress: 0,
    dt: recipe.seconds * 100,
    seconds: recipe.seconds,
    cyclesAllowed: 3
  });
  assert.equal(step.cycles, 3, '材料只够 3 次就必须停在 3 次');
  // 材料不够的那段时间设施是闲着的：不能把 100 个周期的时间攒起来，
  // 否则木材一到就会一次做完十几批，周期长度也就失去意义了。
  assert.ok(
    step.progress <= recipe.seconds,
    `最多保留一个周期的进度，实际留下 ${step.progress}`
  );
});

check('缺料时进度原地保留，不归零（材料接上要接着烧）', () => {
  const recipe = PRODUCTION_RECIPES.furnace;
  const half = recipe.seconds * 0.5;
  const stalled = advanceProduction({ progress: half, dt: 10, seconds: recipe.seconds, cyclesAllowed: 0 });
  assert.equal(stalled.cycles, 0);
  assert.equal(stalled.stalled, true);
  assert.equal(stalled.progress, half, '缺料不该把已攒的进度清零');
  // 材料补上之后，再走半秒就能结算
  const resumed = advanceProduction({ progress: stalled.progress, dt: half, seconds: recipe.seconds, cyclesAllowed: 1 });
  assert.equal(resumed.cycles, 1);
});

check('材料上限按整数周期算：17 木材 @4/次 → 4 次，剩 1 个木材不动', () => {
  const recipe = PRODUCTION_RECIPES.furnace;
  assert.equal(maxCyclesByInput(recipe, () => 17), 4);
  assert.equal(maxCyclesByInput(recipe, () => 3), 0);
  assert.equal(maxCyclesByInput(recipe, () => 0), 0);
  assert.equal(maxCyclesByOutput(recipe, () => 5), 2);
  assert.equal(maxCyclesByOutput(recipe, () => 1), 0);
});

check('周期结算量按次数放大，扣与产一模一样', () => {
  const recipe = PRODUCTION_RECIPES.furnace;
  const one = productionCycleAmounts(recipe, 1);
  assert.deepEqual(one.consumed, { itemId: 'wood', count: recipe.input.count });
  assert.deepEqual(one.produced, { itemId: 'charcoal', count: recipe.output.count });
  const three = productionCycleAmounts(recipe, 3);
  assert.equal(three.consumed.count, recipe.input.count * 3);
  assert.equal(three.produced.count, recipe.output.count * 3);
  assert.equal(productionCycleAmounts(recipe, 0).produced.count, 0);
});

check('长时间运行不会产出超过材料允许的次数（守恒）', () => {
  const recipe = normalizeProductionRecipe(PRODUCTION_RECIPES.furnace);
  const inputInv = new Inventory({ capacity: 1 });
  const outputInv = new Inventory({ capacity: 1 });
  inputInv.add('wood', 41);
  let progress = 0;
  const dt = 0.25;
  const steps = Math.ceil((recipe.seconds * 20) / dt);
  for (let i = 0; i < steps; i += 1) {
    const slot = inputInv.slots[0];
    const allowed = maxCyclesForFurnace(recipe, slot, outputInv, { stackLimit: 64 });
    const step = advanceProduction({ progress, dt, seconds: recipe.seconds, cyclesAllowed: allowed });
    progress = step.progress;
    if (step.cycles > 0) {
      settleFurnaceProduction(inputInv, outputInv, recipe, step.cycles, { stackLimit: 64 });
    }
    if (outputInv.countOf('charcoal') > 0) {
      outputInv.remove('charcoal', outputInv.countOf('charcoal'));
    }
  }
  const woodLeft = inputInv.countOf('wood');
  const totalCharcoal = outputInv.countOf('charcoal');
  assert.equal(woodLeft, 1, '剩 1 个木材做不了第 11 次，必须原样留着');
  assert.equal(totalCharcoal, 0);
  assert.equal(41 - woodLeft, 40, '应消耗 40 木材');
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
