// 附魔石的永久成长（计划第 8 节）。
//
// 这一节的核心规则只有一句：**石头是成长数据的唯一持有者**。
//   - 成长记录在石头实例里，不记录为单位自身的永久属性；
//   - 石头转到谁身上，谁就享受已有成长，不需要重新练；
//   - 死亡掉落不重置成长，也不把成长留在死亡单位上；
//   - 两块同名石头的成长互不污染（不能按附魔类型共用一个累计字段）。
//
// 文档第 8.2 节给了六条验收例，下面的测试逐条对应。
// 和 drops.js 一样保持纯净：不依赖 THREE / DOM / Game。
export const RUNE_GROWTH_FIELDS = ['triumphHealthBonus'];

export const RUNE_GROWTH_RULES = {
  // 单位击杀获得的成长资源，在参与成长的石头之间均分（文档已确认的延续规则）
  splitMode: 'even',
  // 法术等非单位击杀不产生成长资源
  allowNonUnitKill: false
};

export function runeGrowthRules(overrides = {}) {
  return { ...RUNE_GROWTH_RULES, ...(overrides ?? {}) };
}

// 属性修改器的来源前缀。**必须按石头实例区分**：
// 单位身上可能同时挂着两块同名石头，卸下一块只能移除它自己的那份贡献。
export const RUNE_GROWTH_MODIFIER_PREFIX = 'rune-growth:';

export function growthModifierSource(stoneId) {
  return `${RUNE_GROWTH_MODIFIER_PREFIX}${stoneId ?? 'unknown'}`;
}

// 把成长字段规范化到一个石头实例上。两块同名石头各自持有自己的累计值，
// 所以这里只认实例，不认附魔种类。
export function normalizeGrowth(stone) {
  if (!stone) return null;
  const growth = {};
  RUNE_GROWTH_FIELDS.forEach((field) => {
    const value = Number(stone.growth?.[field]);
    growth[field] = Number.isFinite(value) ? value : 0;
  });
  return { ...stone, growth };
}

export function growthOf(stone, field = 'triumphHealthBonus') {
  const value = Number(stone?.growth?.[field]);
  return Number.isFinite(value) ? value : 0;
}

// 往石头上累加成长。就地写回并返回新值，调用方负责持久化。
export function addGrowth(stone, amount, field = 'triumphHealthBonus') {
  if (!stone) return 0;
  const delta = Number(amount);
  if (!Number.isFinite(delta) || delta === 0) return growthOf(stone, field);
  stone.growth = stone.growth ?? {};
  stone.growth[field] = growthOf(stone, field) + delta;
  return stone.growth[field];
}

// 均分：单位击杀拿到的成长资源摊给「参与成长的石头」。
// 参与成长的石头由调用方给出（通常是该单位当前激活的那些），
// 非单位击杀默认不产生资源——这条是文档明确确认过的。
export function splitGrowth(stones, amount, { source = 'unit_kill', rules = RUNE_GROWTH_RULES } = {}) {
  const resolved = runeGrowthRules(rules);
  const list = (stones ?? []).filter(Boolean);
  const total = Number(amount);
  if (!list.length || !Number.isFinite(total) || total <= 0) return [];
  if (source !== 'unit_kill' && !resolved.allowNonUnitKill) return [];
  const share = total / list.length;
  return list.map((stone) => {
    addGrowth(stone, share);
    return { stoneId: stone.id ?? null, granted: share, total: growthOf(stone) };
  });
}

// 单位当前的生命上限：基础值 + 它身上每块石头贡献的成长。
// 关键在于「把单位的全部成长都转存进石头」是错的——基础值与石头贡献必须分开算，
// 所以这里显式传入 baseCap，而不是读取单位自己累积的某个总值。
export function unitHealthCap(baseCap, stones) {
  const base = Number.isFinite(baseCap) ? baseCap : 0;
  return (stones ?? []).reduce((sum, stone) => sum + growthOf(stone), base);
}

// 单位身上每块生效石头「应当」贡献的属性修改器，按来源索引。
//
// 这是「石头是唯一持有者」在属性层的落地形式：修改器不是从单位或 Buff 的
// 累计字段重建出来的，而是每次从石头当前值重新投影出来。石头一转手，
// 新持有者的修改器集合变了，而石头上的数字没有被动过。
export function growthModifiersFor(stones, { stat = 'maxHealth', field = 'triumphHealthBonus' } = {}) {
  const desired = new Map();
  (stones ?? []).forEach((stone) => {
    if (!stone) return;
    const amount = growthOf(stone, field);
    // 成长值为 0 的石头不产生修改器：加一条 amount:0 的修改器只会
    // 让属性重算多做一次无用功，还会在「卸载后残留来源」的排查里造成误判。
    if (amount <= 0) return;
    desired.set(growthModifierSource(stone.id), { stat, amount });
  });
  return desired;
}

// 取下石头：只移除这块石头的贡献，不改动单位基础值，
// 也不影响同单位其它石头（同名石头各自的成长互不污染）。
export function detachStone(stones, stoneId) {
  return (stones ?? []).filter((stone) => (stone?.id ?? null) !== stoneId);
}

// 死亡掉落：石头离开单位，成长留在石头里，不做任何重置。
export function dropStonesOnDeath(stones) {
  return (stones ?? []).filter(Boolean).map((stone) => normalizeGrowth(stone));
}

export function serializeGrowth(stone) {
  return {
    id: stone?.id ?? null,
    growth: { ...(normalizeGrowth(stone)?.growth ?? {}) }
  };
}

export function applyGrowthSnapshot(stone, snapshot) {
  if (!stone) return false;
  const growth = snapshot?.growth ?? {};
  stone.growth = {};
  RUNE_GROWTH_FIELDS.forEach((field) => {
    const value = Number(growth[field]);
    stone.growth[field] = Number.isFinite(value) ? value : 0;
  });
  return true;
}
