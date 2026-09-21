// 军需铺目录与 Boss 整备（免费专精 → 明码标价补给 → 继续战斗）回归测试。
// 规则来源：docs/RUNE_STONE_GAMEPLAY_PLAN.md 第 2.2 / 10 节。
// 1) 复制 / 移除 / 升级 / 临时咒印 / 随机卡牌 / 特性专精 已移出新版军需铺；
// 2) 补给铺直接展示 4～6 件明码标价的商品，数量与价格全部可配置；
// 3) 免费兵种专精排在付费补给之前，且不占用购买次数；
// 4) 战斗内军需入口仍然关闭。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RUN_SHOP_BACK_TO_UNIT_LABEL,
  RUN_SHOP_CATEGORIES,
  RUN_SHOP_CONTINUE_LABEL,
  RUN_SHOP_ENERGY_CARD_ID,
  RUN_SHOP_FREE_LABEL,
  RUN_SHOP_RETIRED_CATEGORIES,
  RUN_SHOP_SOLD_OUT_LABEL,
  RUN_SHOP_SPECIALIZATION_STEPS,
  RUN_SHOP_SPECIALIZATION_TITLE,
  RUN_SHOP_STEP_SPECIALIZATION_TYPE,
  RUN_SHOP_STEP_SUPPLY,
  RUN_SHOP_SUPPLY_DEFAULTS,
  RUN_SHOP_SUPPLY_KINDS,
  RUN_SHOP_SUPPLY_TITLE,
  isRunShopCategoryAvailable,
  isRunShopCategoryRetired,
  runShopSupplyConfig,
  runShopSupplyEnergyAmount,
  runShopSupplyFallbackSilver,
  runShopSupplyItemCount,
  runShopSupplyKindPrice,
  runShopSupplyKindSequence
} from '../src/systems/runShopCatalog.js';
import { collectRunShopCardInstances } from '../src/systems/CardSystem.js';

// ---- 1) 旧服务类别全部退役 ----
assert.equal(isRunShopCategoryAvailable('card'), false);
assert.equal(RUN_SHOP_CATEGORIES.some((entry) => entry.key === 'card'), false);
for (const key of ['attribute', 'unit', 'trait', 'copy', 'remove', 'upgrade', 'energy', 'temporary']) {
  // 键仍然存在（价格表与联机私有状态字段要引用），但必须被判为“已移出新版军需铺”。
  assert.equal(isRunShopCategoryAvailable(key), true, `${key} should remain a known legacy key`);
  assert.equal(isRunShopCategoryRetired(key), true, `${key} should be retired from the new shop`);
  assert.ok(RUN_SHOP_RETIRED_CATEGORIES.includes(key));
}
// 退役名单只覆盖旧服务类别；新商品类别是独立的一套，其中 attribute / energy
// 与旧键同名但语义不同（新版只是“可购买的商品”，不再是可选购的服务流程）。
assert.deepEqual(
  [...RUN_SHOP_RETIRED_CATEGORIES].sort(),
  ['attribute', 'copy', 'energy', 'remove', 'temporary', 'trait', 'unit', 'upgrade']
);
assert.equal(RUN_SHOP_SUPPLY_KINDS.includes('copy'), false);
assert.equal(RUN_SHOP_SUPPLY_KINDS.includes('temporary'), false);

// 复制 / 移除 / 升级 的卡牌选择器已从军需铺移除，但“局内已有卡牌”的统计口径仍然排除储备与临时牌。
const ownedHandCard = { id: 'hand', instanceId: 'hand-1' };
const ownedDrawCard = { id: 'draw', instanceId: 'draw-1' };
const ownedDiscardCard = { id: 'discard', instanceId: 'discard-1' };
const temporaryCard = { id: 'temporary', instanceId: 'temporary-1' };
const reserveCard = { id: 'reserve', instanceId: 'reserve-1' };
assert.deepEqual(collectRunShopCardInstances({
  handCards: [ownedHandCard],
  drawPile: [ownedDrawCard],
  discardPile: [ownedDiscardCard],
  temporaryCards: [temporaryCard],
  reservePile: [reserveCard]
}), [ownedHandCard, ownedDrawCard, ownedDiscardCard]);

// ---- 2) 补给铺配置 ----
{
  const defaults = runShopSupplyConfig(null);
  assert.equal(defaults.itemCount, RUN_SHOP_SUPPLY_DEFAULTS.itemCount);
  assert.ok(defaults.itemCount >= 4 && defaults.itemCount <= 6, '默认商品数必须是 4～6 件');
  assert.ok(runShopSupplyKindPrice('unitCard', defaults) > 0, '商品必须明码标价');
  assert.ok(runShopSupplyKindPrice('enchant', defaults) > 0);
  assert.ok(runShopSupplyEnergyAmount(defaults) >= 1);
  assert.ok(runShopSupplyFallbackSilver(defaults) >= 0);

  // 数量被夹在 4～6 之间，无论配置怎么填。
  assert.equal(runShopSupplyItemCount({ ...defaults, itemCount: 1, minItemCount: 4, maxItemCount: 6 }, 0), 4);
  assert.equal(runShopSupplyItemCount({ ...defaults, itemCount: 99, minItemCount: 4, maxItemCount: 6 }, 0), 6);
  assert.equal(runShopSupplyItemCount({ ...defaults, itemCount: 5, itemCountPerRoute: 1 }, 0), 5);
  assert.equal(runShopSupplyItemCount({ ...defaults, itemCount: 5, itemCountPerRoute: 1 }, 2), 6);

  // 类别序列长度等于商品数，且每个配额都出现。
  const sequence = runShopSupplyKindSequence(defaults, defaults.itemCount);
  assert.equal(sequence.length, defaults.itemCount);
  for (const kind of RUN_SHOP_SUPPLY_KINDS) {
    const quota = defaults.quotas[kind] ?? 0;
    if (quota <= 0) continue;
    assert.ok(
      sequence.filter((entry) => entry === kind).length >= Math.min(quota, sequence.length),
      `${kind} 的配额必须体现在商品序列里`
    );
  }
  // 能量补给是收尾商品，不参与补足顺序，因此商品数不足时不会挤掉其他类别。
  assert.equal(defaults.fillOrder.includes('energy'), false);

  // BALANCE.runCurrency.supply 覆盖默认值。
  const overridden = runShopSupplyConfig({
    supply: { itemCount: 4, prices: { unitCard: 20 }, energyAmount: 3 }
  });
  assert.equal(overridden.itemCount, 4);
  assert.equal(runShopSupplyKindPrice('unitCard', overridden), 20);
  assert.equal(runShopSupplyEnergyAmount(overridden), 3);
  assert.equal(runShopSupplyKindPrice('enchant', overridden), defaults.prices.enchant, '未覆盖的类别沿用默认价');
}

// ---- 3) 文案与步骤 ----
{
  assert.equal(RUN_SHOP_CONTINUE_LABEL, '继续战斗');
  assert.equal(RUN_SHOP_SOLD_OUT_LABEL, '已售罄');
  assert.equal(RUN_SHOP_FREE_LABEL, '免费');
  assert.equal(RUN_SHOP_SPECIALIZATION_TITLE, '选择兵种专精');
  assert.equal(RUN_SHOP_SUPPLY_TITLE, '军需补给铺');
  assert.match(RUN_SHOP_BACK_TO_UNIT_LABEL, /重新选择兵种/);
  assert.ok(RUN_SHOP_SPECIALIZATION_STEPS.includes(RUN_SHOP_STEP_SPECIALIZATION_TYPE));
  assert.equal(RUN_SHOP_SPECIALIZATION_STEPS.includes(RUN_SHOP_STEP_SUPPLY), false, '补给不是专精步骤');
  assert.ok(RUN_SHOP_ENERGY_CARD_ID);
}

// ---- 4) Game.js 接线 ----
{
  const gameSource = readFileSync(new URL('../src/systems/Game.js', import.meta.url), 'utf8');
  const indexMarkup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  // 旧的“先选服务类别”流程必须彻底移除（注释里提到历史实现是允许的）。
  assert.equal(/this\.selectRunShopCategory\s*\(/.test(gameSource), false, '旧的服务类别选购流程应已删除');
  assert.equal(/this\.createShopChoicesForCategory\s*\(/.test(gameSource), false, '旧的类别候选生成应已删除');
  assert.equal(/this\.shopPriceIncrement\s*\(/.test(gameSource), false, '旧的按次递增价格应已删除');
  assert.equal(/prepaidPrice\s*:/.test(gameSource), false, '先付费再揭示候选的旧规则应已删除');
  assert.equal(/this\.runShopServiceMarkup\s*\(/.test(gameSource), false, '旧的服务按钮渲染应已删除');

  // 新流程：免费专精 → 补给 → 继续战斗。
  assert.match(gameSource, /RUN_SHOP_STEP_SPECIALIZATION_TYPE/);
  assert.match(gameSource, /RUN_SHOP_STEP_SUPPLY/);
  assert.match(gameSource, /RUN_SHOP_CONTINUE_LABEL/);
  assert.match(gameSource, /isRunShopCategoryRetired/, '旧类别必须被封死，伪造 shopCategory 也不能重开');
  assert.match(gameSource, /claimRunShopSpecialization/);
  assert.match(gameSource, /purchaseRunShopSupplyItem/);
  assert.match(gameSource, /runShopSpecializationClaimed/, '专精领取必须是一次性的');

  // 战斗内军需入口仍然关闭。
  assert.match(gameSource, /const RUN_SHOP_PLAYER_ACCESS_ENABLED = false;/);

  // 继续战斗复用已有的跳过按钮节点，不需要新增 DOM。
  assert.match(indexMarkup, /id="run-shop-skip"/);
  assert.match(gameSource, /run-shop-skip/);
}

console.log('Run-shop catalog checks passed.');
