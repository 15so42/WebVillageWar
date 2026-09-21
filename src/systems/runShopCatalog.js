/**
 * 军需铺目录与 Boss 整备（免费专精 + 付费补给）配置。
 * 规则来源：docs/RUNE_STONE_GAMEPLAY_PLAN.md 第 2.2 / 10 节。
 *
 * 旧版“先选服务类别，再进入详情挑选”的军需铺流程已被替换：
 * 非最终 Boss 后先免费领取一次兵种专精，再进入直接展示具体商品的军需补给铺。
 * 复制卡牌 / 移除卡牌 / 升级卡牌 / 临时咒印 已移出新版军需铺；
 * 特性专精 改为前置的免费 Boss 奖励；属性集训 保留为可购买的补给商品。
 *
 * RUN_SHOP_CATEGORIES 仅作为历史数据保留（价格表、联机私有状态字段仍引用这些键），
 * 新版流程不会再渲染或选购这些类别，全部采购都走具体商品实例。
 */

export const RUN_SHOP_CATEGORIES = [
  {
    key: 'attribute',
    title: '属性集训',
    description: '三选一全队属性强化，立即生效。',
    icon: '↑'
  },
  {
    key: 'unit',
    title: '随机卡牌',
    description: '立即付费，从本局剩余波次奖励牌组随机展示三张；返回不退款，再次购买会重新扣费刷新。',
    icon: '▦',
    prepaidChoices: true
  },
  {
    key: 'trait',
    title: '特性专精',
    description: '三选一兵种特性，每种仅一次。',
    icon: '★'
  },
  {
    key: 'copy',
    title: '复制卡牌',
    description: '从已有卡牌中选一张复制；手牌有空位则优先进手牌。',
    icon: '⧉',
    picker: true,
    catalogPicker: true
  },
  {
    key: 'remove',
    title: '移除卡牌',
    description: '从已有卡牌中选一张，移出本局全部同名卡牌。',
    icon: '✕',
    picker: true,
    catalogPicker: true
  },
  {
    key: 'upgrade',
    title: '升级卡牌',
    description: '从已有卡牌中选一张，该牌及同名牌等级 +1。',
    icon: '⬆',
    picker: true,
    catalogPicker: true
  },
  {
    key: 'energy',
    title: '购买能量',
    description: '立即获得 1 点能量。',
    icon: '⚡',
    fixedPrice: 4
  },
  {
    key: 'temporary',
    title: '临时咒印',
    description: '购置一张本局可用的临时牌。',
    icon: '⏱'
  }
];

/** 新存档仍会初始化这些键的价格，避免联机私有状态字段缺项。 */
export function isRunShopCategoryAvailable(category) {
  return RUN_SHOP_CATEGORIES.some((entry) => entry.key === category);
}

/**
 * 已移出新版军需铺的旧服务类别。Game.js 用这个列表彻底封死旧选购入口，
 * 即使客户端伪造 shopCategory 命令也无法重新打开这些服务。
 */
export const RUN_SHOP_RETIRED_CATEGORIES = [
  'trait',
  'copy',
  'remove',
  'upgrade',
  'temporary',
  'unit',
  'attribute',
  'energy'
];

export function isRunShopCategoryRetired(category) {
  return RUN_SHOP_RETIRED_CATEGORIES.includes(String(category ?? ''));
}

/** Boss 整备的两个步骤，写入 runShopActiveCategory 以便联机快照同步当前界面。 */
export const RUN_SHOP_STEP_SPECIALIZATION_TYPE = 'specialization-type';
export const RUN_SHOP_STEP_SPECIALIZATION_UPGRADE = 'specialization-upgrade';
export const RUN_SHOP_STEP_SUPPLY = 'supply';

export const RUN_SHOP_SPECIALIZATION_STEPS = [
  RUN_SHOP_STEP_SPECIALIZATION_TYPE,
  RUN_SHOP_STEP_SPECIALIZATION_UPGRADE
];

/** 专精步骤里非卡面选项的动作标记（卡面选项沿用 apply-team-special-upgrade）。 */
export const RUN_SHOP_ACTION_SPECIALIZATION_UNIT = 'run-shop-specialization-unit';
export const RUN_SHOP_ACTION_SPECIALIZATION_FALLBACK = 'run-shop-specialization-fallback';
/** 能量补给商品的动作标记（卡牌商品沿用 add-card，属性集训沿用 apply-team-upgrade）。 */
export const RUN_SHOP_ACTION_BUY_ENERGY = 'run-shop-buy-energy';
/** 能量补给商品的伪卡牌 id：客户端只靠序列化字段渲染，用 id 识别图标与类型。 */
export const RUN_SHOP_ENERGY_CARD_ID = 'run-shop-energy-supply';

export const RUN_SHOP_SUPPLY_KINDS = [
  'unitCard',
  'enchant',
  'abilityTerrain',
  'attribute',
  'energy'
];

export const RUN_SHOP_SUPPLY_KIND_LABELS = {
  unitCard: '单位卡',
  enchant: '附魔卡',
  abilityTerrain: '能力/地形卡',
  attribute: '属性集训',
  energy: '能量补给'
};

export const RUN_SHOP_SUPPLY_KIND_ICONS = {
  unitCard: '兵',
  enchant: '附',
  abilityTerrain: '法',
  attribute: '训',
  energy: '⚡'
};

/**
 * 军需补给铺的可配置数据段（与 gameData.js 的 opening 段同样式）。
 * 默认 5 件商品、4～6 件可调；每类商品的数量配额、银币价格、能量补给数量都集中在这里。
 * 若将来把同名字段加进 BALANCE.runCurrency.supply，会自动覆盖这里的默认值。
 */
export const RUN_SHOP_SUPPLY_DEFAULTS = {
  // 默认展示商品数量，会被夹在 minItemCount / maxItemCount 之间。
  itemCount: 5,
  minItemCount: 4,
  maxItemCount: 6,
  // 每多一条关卡道路额外展示的商品数量（0 表示不随路线数变化）。
  itemCountPerRoute: 0,
  // 各类商品的配额；按 fillOrder 依次取用，不足 itemCount 时继续按 fillOrder 补足。
  quotas: {
    unitCard: 1,
    enchant: 1,
    abilityTerrain: 1,
    attribute: 1,
    energy: 1
  },
  // 补足商品数量时的取用顺序；energy 是收尾商品，不参与补足。
  fillOrder: ['unitCard', 'enchant', 'abilityTerrain', 'attribute'],
  // 各类商品的银币价格（明码标价，购买前即可见）。
  prices: {
    unitCard: 14,
    enchant: 16,
    abilityTerrain: 14,
    attribute: 18,
    energy: 8
  },
  // 能量补给商品一次给予的能量点数。
  energyAmount: 2,
  // 附魔卡是消耗品，同局可重复获得：同类附魔可提供多个实例。
  allowDuplicateEnchant: true,
  // 所有兵种专精都已获得时的替代补偿（银币）。
  specializationFallbackSilver: 6
};

function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toPositiveInt(value, fallback, minimum = 1) {
  return Math.max(minimum, Math.floor(toFiniteNumber(value, fallback)));
}

/**
 * 读取军需补给铺配置：默认值 + （可选的）BALANCE.runCurrency.supply 覆盖。
 */
export function runShopSupplyConfig(runCurrency = null) {
  const defaults = RUN_SHOP_SUPPLY_DEFAULTS;
  const overrides = runCurrency?.supply ?? {};
  const minItemCount = toPositiveInt(overrides.minItemCount, defaults.minItemCount, 1);
  const maxItemCount = Math.max(minItemCount, toPositiveInt(overrides.maxItemCount, defaults.maxItemCount, 1));
  const quotas = { ...defaults.quotas };
  RUN_SHOP_SUPPLY_KINDS.forEach((kind) => {
    if (overrides.quotas && kind in overrides.quotas) {
      quotas[kind] = Math.max(0, Math.floor(toFiniteNumber(overrides.quotas[kind], quotas[kind] ?? 0)));
    }
  });
  const fillOrder = Array.isArray(overrides.fillOrder) && overrides.fillOrder.length
    ? overrides.fillOrder.filter((kind) => RUN_SHOP_SUPPLY_KINDS.includes(kind))
    : [...defaults.fillOrder];
  const prices = { ...defaults.prices };
  RUN_SHOP_SUPPLY_KINDS.forEach((kind) => {
    if (overrides.prices && kind in overrides.prices) {
      prices[kind] = Math.max(0, toFiniteNumber(overrides.prices[kind], prices[kind] ?? 0));
    }
  });
  return {
    itemCount: toPositiveInt(overrides.itemCount, defaults.itemCount, 1),
    minItemCount,
    maxItemCount,
    itemCountPerRoute: Math.max(0, toFiniteNumber(overrides.itemCountPerRoute, defaults.itemCountPerRoute)),
    quotas,
    fillOrder: fillOrder.length ? fillOrder : [...defaults.fillOrder],
    prices,
    energyAmount: toPositiveInt(overrides.energyAmount, defaults.energyAmount, 1),
    allowDuplicateEnchant: overrides.allowDuplicateEnchant !== false,
    specializationFallbackSilver: Math.max(
      0,
      toFiniteNumber(overrides.specializationFallbackSilver, defaults.specializationFallbackSilver)
    )
  };
}

/** 实际展示的商品数量：配置值夹在 4～6 之间，可选按额外路线数增加。 */
export function runShopSupplyItemCount(config = null, extraRoutes = 0) {
  const resolved = config ?? runShopSupplyConfig(null);
  const routes = Math.max(0, Math.floor(toFiniteNumber(extraRoutes, 0)));
  const raw = toFiniteNumber(resolved.itemCount, RUN_SHOP_SUPPLY_DEFAULTS.itemCount)
    + toFiniteNumber(resolved.itemCountPerRoute, 0) * routes;
  const min = toPositiveInt(resolved.minItemCount, RUN_SHOP_SUPPLY_DEFAULTS.minItemCount, 1);
  const max = Math.max(min, toPositiveInt(resolved.maxItemCount, RUN_SHOP_SUPPLY_DEFAULTS.maxItemCount, 1));
  return Math.min(max, Math.max(min, Math.round(raw)));
}

/** 按配额与补足顺序展开成商品类别序列（length = 期望商品数）。 */
export function runShopSupplyKindSequence(config = null, itemCount = null) {
  const resolved = config ?? runShopSupplyConfig(null);
  const total = Math.max(1, Math.floor(
    toFiniteNumber(itemCount, runShopSupplyItemCount(resolved, 0))
  ));
  const sequence = [];
  RUN_SHOP_SUPPLY_KINDS.forEach((kind) => {
    const quota = Math.max(0, Math.floor(toFiniteNumber(resolved.quotas?.[kind], 0)));
    for (let index = 0; index < quota; index += 1) sequence.push(kind);
  });
  // 配额不足期望数量时按 fillOrder 依次补足；超出时从尾部裁剪（energy 排在配额末尾）。
  const fillOrder = resolved.fillOrder?.length
    ? resolved.fillOrder
    : RUN_SHOP_SUPPLY_DEFAULTS.fillOrder;
  let fillIndex = 0;
  while (sequence.length < total && fillOrder.length) {
    sequence.push(fillOrder[fillIndex % fillOrder.length]);
    fillIndex += 1;
  }
  return sequence.slice(0, total);
}

/** 商品类别对应的银币价格。 */
export function runShopSupplyKindPrice(kind, config = null) {
  const resolved = config ?? runShopSupplyConfig(null);
  const price = toFiniteNumber(resolved.prices?.[kind], 0);
  return Math.max(0, price);
}

/** 所有兵种专精都已获得时的银币补偿。 */
export function runShopSupplyFallbackSilver(config = null) {
  const resolved = config ?? runShopSupplyConfig(null);
  return Math.max(0, toFiniteNumber(resolved.specializationFallbackSilver, 0));
}

/** 能量补给商品一次给予的能量。 */
export function runShopSupplyEnergyAmount(config = null) {
  const resolved = config ?? runShopSupplyConfig(null);
  return toPositiveInt(resolved.energyAmount, RUN_SHOP_SUPPLY_DEFAULTS.energyAmount, 1);
}

/** 新版军需铺的结束动作文案，UI 与联机不变量共用。 */
export const RUN_SHOP_CONTINUE_LABEL = '继续战斗';
export const RUN_SHOP_SPECIALIZATION_TITLE = '选择兵种专精';
export const RUN_SHOP_SUPPLY_TITLE = '军需补给铺';
export const RUN_SHOP_BACK_TO_UNIT_LABEL = '← 重新选择兵种';
export const RUN_SHOP_SOLD_OUT_LABEL = '已售罄';
export const RUN_SHOP_FREE_LABEL = '免费';
