// 树坑与种植规则回归测试（方案第 9 节）。
//
// 方案在这一节提了两条硬要求，这里各有一条测试钉住：
//   1.「建议种植材料有保留量，避免把下一轮种植所需资源全部加工掉」
//   2.「实施时检查整个链的净产出……必须还有可支持其他活动的产出」
import assert from 'node:assert/strict';
import {
  PLANTING_ERROR,
  PLANTING_STATE,
  advanceGrowth,
  allPlantingConfigs,
  canPlant,
  growthRatio,
  normalizePlantingConfig,
  plantingConfigForUnitType,
  plantingYield
} from '../src/systems/planting.js';
import {
  ITEM_DEFINITIONS,
  PLANTING_CONFIGS,
  RESOURCE_NODE_DEFINITIONS
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

const config = () => normalizePlantingConfig(PLANTING_CONFIGS.treePit);

// 种植地块分两类，判据是 `saplingItemId` 是不是 null：
//   - 需要种子的（树坑）：保留量、净树苗产出、副产物三条纪律全都适用；
//   - 不需要种子的（菜圃）：只要求"有生长秒数、有产出的节点定义、成本为 0"。
// 分开断言，而不是把菜圃塞进树苗那一套里蒙过去，也不是删掉旧判据。
const seedConfigs = () => allPlantingConfigs().filter((entry) => entry.saplingItemId);
const seedlessConfigs = () => allPlantingConfigs().filter((entry) => !entry.saplingItemId);

check('数据健全：树苗与长成的节点都有定义，长出的节点确实产木材', () => {
  assert.ok(allPlantingConfigs().length > 0);
  assert.ok(seedConfigs().length > 0, '至少要有一块需要种子的地块（树坑）');
  seedConfigs().forEach((entry) => {
    assert.ok(ITEM_DEFINITIONS[entry.saplingItemId], `树苗 ${entry.saplingItemId} 必须有物品定义`);
    const node = RESOURCE_NODE_DEFINITIONS[entry.nodeDefinitionId];
    assert.ok(node, `长成的节点 ${entry.nodeDefinitionId} 必须有定义`);
    assert.equal(node.resource, 'wood', '树坑长出来的必须是产木材的节点');
    assert.ok(entry.growthSeconds > 0 && entry.spawnRadius > 0 && entry.maxGrownNodes >= 1);
  });
  assert.equal(plantingConfigForUnitType('treePit')?.name, '树坑');
  assert.equal(plantingConfigForUnitType('furnace'), null, '不是种植设施的建筑不该被当成地块');
});

check('免种子地块（菜圃）：成本为 0、产出节点有定义、生长与地块上限都合法', () => {
  assert.ok(seedlessConfigs().length > 0, '至少要有一块免种子地块（菜圃）');
  seedlessConfigs().forEach((entry) => {
    assert.equal(entry.saplingItemId, null, '免种子地块不该拿到一个树苗 id');
    assert.equal(entry.saplingCost, 0, '免种子地块的补种成本必须是 0');
    assert.equal(entry.reserveSaplings, 0, '免种子地块没有保留量概念');
    const node = RESOURCE_NODE_DEFINITIONS[entry.nodeDefinitionId];
    assert.ok(node, `长成的节点 ${entry.nodeDefinitionId} 必须有定义`);
    assert.ok(node.amount > 0, '作物节点必须有产量');
    assert.equal(node.tool, null, '作物必须徒手可收，否则没工具就再也收不上粮');
    assert.ok(entry.growthSeconds > 0 && entry.spawnRadius > 0 && entry.maxGrownNodes >= 1);
  });
  // 免种子地块只要有空位就能补种，不需要任何库存
  const entry = seedlessConfigs()[0];
  assert.equal(canPlant(entry, { saplings: 0, grownNodes: 0 }).ok, true);
  assert.equal(
    canPlant(entry, { saplings: 0, grownNodes: entry.maxGrownNodes }).reason,
    PLANTING_ERROR.plotFull
  );
});

check('方案要求的净产出为正：一棵树收回的树苗 > 补种消耗，木材严格为正', () => {
  seedConfigs().forEach((entry) => {
    const result = plantingYield(entry);
    assert.ok(result, `${entry.id} 应当能算出产出`);
    assert.ok(result.netWood > 0, `净木材必须为正，实际 ${result.netWood}`);
    assert.ok(
      result.netSaplings > 0,
      `净树苗必须为正（收回 ${result.saplings} - 消耗 ${result.saplingCost}），实际 ${result.netSaplings}`
    );
  });
});

check('副产物配置必须真的能供给树苗（砍树掉苗的频率与上限都要能用）', () => {
  seedConfigs().forEach((entry) => {
    const node = RESOURCE_NODE_DEFINITIONS[entry.nodeDefinitionId];
    assert.equal(node.byproduct?.itemId, entry.saplingItemId, '长成的树必须掉这种树苗');
    assert.ok(node.byproduct.perAmount > 0);
    assert.ok(node.byproduct.maxPerNode >= 1);
    // 砍完一整棵树至少能收回一次补种所需的苗
    assert.ok(
      Math.min(Math.floor(node.amount / node.byproduct.perAmount), node.byproduct.maxPerNode)
        >= entry.saplingCost,
      '一棵树收回的树苗必须够补种一次'
    );
  });
});

check('保留量：只够一次种植时不许种（要留种），一棵都没有时理由不同', () => {
  const entry = config();
  const need = entry.saplingCost + entry.reserveSaplings;
  // 刚好等于"种植消耗 + 保留量" → 允许（保留量还留着）
  assert.equal(canPlant(entry, { saplings: need, grownNodes: 0 }).ok, true);
  assert.equal(canPlant(entry, { saplings: need + 3, grownNodes: 0 }).ok, true);
  // 差一个 → 拒绝，理由必须说清是留种而不是没苗
  const short = canPlant(entry, { saplings: need - 1, grownNodes: 0 });
  assert.equal(short.ok, false);
  assert.equal(short.reason, PLANTING_ERROR.belowReserve);
  // 一棵都没有 → 拒绝，理由是没苗
  assert.equal(canPlant(entry, { saplings: 0, grownNodes: 0 }).reason, PLANTING_ERROR.noSapling);
});

check('已经在长的坑不会重复种；地块长满之后也不再种', () => {
  const entry = config();
  const plenty = { saplings: 50 };
  assert.equal(
    canPlant(entry, { ...plenty, state: PLANTING_STATE.growing }).reason,
    PLANTING_ERROR.alreadyPlanted
  );
  assert.equal(
    canPlant(entry, { ...plenty, grownNodes: entry.maxGrownNodes }).reason,
    PLANTING_ERROR.plotFull
  );
  assert.equal(canPlant(entry, { ...plenty, grownNodes: entry.maxGrownNodes - 1 }).ok, true);
});

check('生长推进：攒够时间才长成，进度不会倒退也不会超上限', () => {
  const entry = config();
  const half = advanceGrowth({ progress: 0, dt: entry.growthSeconds * 0.5, growthSeconds: entry.growthSeconds });
  assert.equal(half.grown, false);
  assert.equal(Math.round(growthRatio(half.progress, entry.growthSeconds) * 100), 50);
  const done = advanceGrowth({
    progress: half.progress,
    dt: entry.growthSeconds * 0.6,
    growthSeconds: entry.growthSeconds
  });
  assert.equal(done.grown, true, '累计超过生长时间就必须长成');
  assert.equal(done.progress, entry.growthSeconds, '长成后进度封顶，不继续累加');
  // dt 为 0（暂停/隐藏标签页）时不该推进
  assert.equal(advanceGrowth({ progress: 3, dt: 0, growthSeconds: entry.growthSeconds }).progress, 3);
});

check('非法配置一律返回 null / 明确错误，不产生 NaN', () => {
  assert.equal(normalizePlantingConfig(null), null);
  assert.equal(normalizePlantingConfig({ id: 'x' }), null);
  assert.equal(normalizePlantingConfig({ id: 'x', saplingItemId: 'sapling', nodeDefinitionId: 'oak', growthSeconds: 0 }), null);
  assert.equal(normalizePlantingConfig({ id: 'x', saplingItemId: 'sapling', nodeDefinitionId: 'oak', growthSeconds: 5, spawnRadius: 0 }), null);
  assert.equal(canPlant(null, { saplings: 5 }).reason, PLANTING_ERROR.unknownConfig);
  assert.equal(plantingYield(null), null);
});

check('多个完整回合之后树苗是净增长的（模拟整条链，而不是只看一轮）', () => {
  const entry = config();
  // 从 0 棵苗开始是种不了的，所以整条链的入口是"先去砍野树"——
  // 这里模拟的就是那个前提：先砍 N 棵野树拿到苗，然后靠树坑自持。
  const wildTree = RESOURCE_NODE_DEFINITIONS.oak;
  const saplingsFromWild = Math.min(
    Math.floor(wildTree.amount / wildTree.byproduct.perAmount),
    wildTree.byproduct.maxPerNode
  );
  let saplings = saplingsFromWild;
  let wood = 0;
  let planted = 0;
  const rounds = 12;
  for (let round = 0; round < rounds; round += 1) {
    const gate = canPlant(entry, { saplings, grownNodes: 0 });
    if (!gate.ok) break;
    saplings -= entry.saplingCost;
    planted += 1;
    const yieldPerTree = plantingYield(entry);
    wood += yieldPerTree.wood;
    saplings += yieldPerTree.saplings;
  }
  assert.equal(planted, rounds, '只要保留量规则生效，12 个回合都应当能种下去');
  assert.ok(saplings > saplingsFromWild, `树苗应当净增长：起始 ${saplingsFromWild} → 结束 ${saplings}`);
  assert.equal(wood, rounds * plantingYield(entry).wood);
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
