// 防御终端：三种定位 × 三级投资（纯数据 + 纯规则）。
//
// 设计约束（docs/DSH_DEFENSE_SURVIVAL_DESIGN.md 第一节）：
//   1. 一级保留原有战斗定位，不重写稳定攻击链——所以这里只描述
//      「一级基准 + 二三级倍率」，gameData 用同一份数据生成实例定义；
//   2. 三级倍率**相对一级**，不在二级上再乘一次；
//   3. 功率随级别上升（1 / 1.2 / 1.45），数量多了就要更高的燃料吞吐；
//   4. 升级材料用真实资源，逐级投资、原子扣除、不跳级；
//   5. 资格：二级要完工科研站；三级要本类二级 + 对应路线全线清除 + 完工科研站。
//
// 这个文件不 import THREE / DOM / Game，也不 import gameData——
// gameData 会 import 它，反向依赖会形成循环。

export const TOWER_TIER_MAX = 3;

export const TOWER_TIER_LABELS = ['I', 'II', 'III'];

/**
 * 等级倍率。**相对一级**，绝对值写死，避免"在上一级基础上再乘"的歧义。
 * DSH 记录：生命 1 / 1.3 / 1.6，伤害 1 / 1.2 / 1.45，射程 +0 / +0.4 / +0.8，
 * 功率 1 / 1.2 / 1.45——全部采用设计文档给出的起点值，测试后未改动（见结果报告）。
 */
export const TOWER_TIER_MODIFIERS = [
  { tier: 1, health: 1, damage: 1, rangeBonus: 0, power: 1 },
  { tier: 2, health: 1.3, damage: 1.2, rangeBonus: 0.4, power: 1.2 },
  { tier: 3, health: 1.6, damage: 1.45, rangeBonus: 0.8, power: 1.45 }
];

/**
 * 升级材料：以对应塔一级建造成本为参照。
 *   二级 = 一级成本的一半左右，并开始吃铁矿与木炭（"需要稳定铁矿与木炭生产"）；
 *   三级 = 一级成本的一倍左右，需要科研与持续后勤。
 * 全部是四种真实资源，没有只要求魔核。
 */
export const TOWER_UPGRADE_COSTS = {
  arrowTower: {
    2: [
      { itemId: 'wood', count: 14 },
      { itemId: 'stone', count: 10 },
      { itemId: 'iron', count: 4 }
    ],
    3: [
      { itemId: 'wood', count: 24 },
      { itemId: 'stone', count: 22 },
      { itemId: 'iron', count: 10 },
      { itemId: 'charcoal', count: 8 }
    ]
  },
  ballista: {
    2: [
      { itemId: 'wood', count: 10 },
      { itemId: 'stone', count: 14 },
      { itemId: 'iron', count: 8 },
      { itemId: 'charcoal', count: 4 }
    ],
    3: [
      { itemId: 'wood', count: 18 },
      { itemId: 'stone', count: 24 },
      { itemId: 'iron', count: 16 },
      { itemId: 'charcoal', count: 12 }
    ]
  },
  shockTower: {
    2: [
      { itemId: 'wood', count: 12 },
      { itemId: 'stone', count: 12 },
      { itemId: 'iron', count: 6 }
    ],
    3: [
      { itemId: 'wood', count: 20 },
      { itemId: 'stone', count: 20 },
      { itemId: 'iron', count: 14 },
      { itemId: 'charcoal', count: 10 }
    ]
  }
};

/** 一级建造成本：三级回收与"材料来自实际投入"的记账基准。 */
export const TOWER_BASE_COSTS = {
  arrowTower: [
    { itemId: 'wood', count: 25 },
    { itemId: 'stone', count: 20 }
  ],
  ballista: [
    { itemId: 'wood', count: 18 },
    { itemId: 'stone', count: 24 },
    { itemId: 'iron', count: 8 }
  ],
  shockTower: [
    { itemId: 'wood', count: 22 },
    { itemId: 'stone', count: 16 },
    { itemId: 'iron', count: 4 }
  ]
};

/** 三级资格对应的远征路线（全线清除才提供资格）。 */
export const TIER3_ROUTE_BY_TOWER = {
  arrowTower: 'east',
  ballista: 'north',
  shockTower: 'south'
};

export const TIER3_ROUTE_LABELS = {
  east: '东岬线',
  north: '北岬线',
  south: '南林线'
};

/**
 * 三种塔在建筑菜单/界面里的"用途与代价"说明。
 *
 * 放在数据里而不是 UI 里：这是**设计约束**（第一节表格），
 * 写进界面文件就会变成一段没人核对的散文字。
 */
export const TOWER_ROLE_INFO = {
  arrowTower: {
    id: 'arrowTower',
    name: '箭塔',
    role: '高频单体',
    purpose: '低成本铺防线，处理轻甲小怪。',
    weakness: '重甲与大群时效率低，血量与射程都不占优势。'
  },
  ballista: {
    id: 'ballista',
    name: '弩炮',
    role: '慢速重击 · 远射程',
    purpose: '针对重型敌人，射程最远、单击最重。',
    weakness: '成本高、转火慢、容易浪费伤害，不是最佳清杂塔。'
  },
  shockTower: {
    id: 'shockTower',
    name: '震荡塔',
    role: '短中距 · 小范围魔力脉冲',
    purpose: '处理密集敌群，脉冲同时打到半径内多个目标并轻微减速。',
    weakness: '对单体效率低于箭塔；功率约为同级箭塔 1.8 倍，射程短于弩炮。'
  }
};

export function towerRoleInfoFor(towerId) {
  return TOWER_ROLE_INFO[towerId] ?? null;
}

/** 每一级的升级施工时间（秒）。期间该塔停火；被打断则暂停施工、保留进度。 */
export const TOWER_UPGRADE_SECONDS = 12;

export const DEFENSE_TOWER_IDS = ['arrowTower', 'ballista', 'shockTower'];

/**
 * 单位类型 id：`arrowTower` / `arrowTowerII` / `arrowTowerIII`。
 * 一级不带后缀，保持与既有存档、既有验收脚本、既有刷怪点防守位数据兼容。
 */
export function towerUnitTypeFor(towerId, tier = 1) {
  if (!DEFENSE_TOWER_IDS.includes(towerId)) return null;
  const level = clampTier(tier);
  if (level <= 1) return towerId;
  return `${towerId}${TOWER_TIER_LABELS[level - 1]}`;
}

/** 反查：单位类型 → `{ towerId, tier }`；不是防御终端时返回 null。 */
export function towerIdentityFor(unitType) {
  if (!unitType) return null;
  const raw = String(unitType);
  const exact = DEFENSE_TOWER_IDS.find((id) => id === raw);
  if (exact) return { towerId: exact, tier: 1 };
  for (const id of DEFENSE_TOWER_IDS) {
    for (let tier = 2; tier <= TOWER_TIER_MAX; tier += 1) {
      if (raw === `${id}${TOWER_TIER_LABELS[tier - 1]}`) return { towerId: id, tier };
    }
  }
  return null;
}

export function isDefenseTowerUnitType(unitType) {
  return towerIdentityFor(unitType) !== null;
}

export function clampTier(tier) {
  const numeric = Math.floor(Number(tier));
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(TOWER_TIER_MAX, numeric));
}

export function tierModifiers(tier) {
  return TOWER_TIER_MODIFIERS[clampTier(tier) - 1];
}

/** 把一级数值按等级折算。取整规则统一在这里，避免各处各写一遍 Math.round。 */
export function applyTierStats(base, tier) {
  const mods = tierModifiers(tier);
  // 生命取整（不能有半滴血）；伤害/射程/功率保留一位小数——功率取整会把
  // 1 / 1.2 / 1.45 这三档压成同两个整数，等级差异就在数值上消失了。
  const round1 = (value) => Math.round(value * 10) / 10;
  return {
    maxHealth: Math.round((base.maxHealth ?? 0) * mods.health),
    damage: round1((base.damage ?? 0) * mods.damage),
    attackRange: round1((base.attackRange ?? 0) + mods.rangeBonus),
    power: round1((base.power ?? 0) * mods.power),
    manaCapacity: round1((base.manaCapacity ?? 0) * mods.power)
  };
}

/** 升到 `tier` 级要付的材料；一级返回空数组。 */
export function upgradeCostFor(towerId, tier) {
  const level = clampTier(tier);
  if (level <= 1) return [];
  // 超过三级没有成本表：clampTier 会把 4 夹成 3，所以这里必须先看原始值，
  // 否则"查四级成本"会静默返回三级成本，界面就有机会重复收一次钱。
  if (Math.floor(Number(tier)) > TOWER_TIER_MAX) return [];
  const table = TOWER_UPGRADE_COSTS[towerId];
  if (!table?.[level]) return [];
  return table[level].map((entry) => ({ itemId: entry.itemId, count: entry.count }));
}

/**
 * 一栋塔从建造到当前等级**累计已投入**的材料。
 * 三级回收要以实际投入为基准，不能凭等级猜一份资源。
 */
export function investedCostFor(towerId, tier) {
  if (!DEFENSE_TOWER_IDS.includes(towerId)) return [];
  const total = new Map();
  const add = (entries) => {
    (entries ?? []).forEach((entry) => {
      total.set(entry.itemId, (total.get(entry.itemId) ?? 0) + Math.max(0, Math.floor(Number(entry.count) || 0)));
    });
  };
  add(TOWER_BASE_COSTS[towerId]);
  for (let level = 2; level <= clampTier(tier); level += 1) add(upgradeCostFor(towerId, level));
  return [...total.entries()].map(([itemId, count]) => ({ itemId, count }));
}

export const UPGRADE_ERROR = {
  none: 'none',
  notTower: 'not_tower',
  maxTier: 'max_tier',
  wrongTier: 'wrong_tier',
  underConstruction: 'under_construction',
  upgrading: 'upgrading',
  dead: 'dead',
  alreadyUpgrading: 'already_upgrading',
  missingMaterials: 'missing_materials',
  missingResearch: 'missing_research',
  missingRoute: 'missing_route',
  busy: 'busy'
};

export const UPGRADE_ERROR_LABELS = {
  [UPGRADE_ERROR.notTower]: '这不是防御终端',
  [UPGRADE_ERROR.maxTier]: '已经是三级',
  [UPGRADE_ERROR.wrongTier]: '升级必须逐级进行',
  [UPGRADE_ERROR.underConstruction]: '还在施工，不能升级',
  [UPGRADE_ERROR.upgrading]: '正在升级施工',
  [UPGRADE_ERROR.dead]: '建筑已被摧毁',
  [UPGRADE_ERROR.alreadyUpgrading]: '这栋塔已经在升级',
  [UPGRADE_ERROR.missingMaterials]: '材料不足',
  [UPGRADE_ERROR.missingResearch]: '需要先建好科研站',
  [UPGRADE_ERROR.missingRoute]: '还没有清空对应路线',
  [UPGRADE_ERROR.busy]: '这座塔正忙'
};

/**
 * 升级资格（纯规则）。
 *
 * @param {object} input
 * @param {string} input.unitType        当前单位类型
 * @param {number} input.targetTier      想升到几级
 * @param {boolean} input.hasResearch    有没有**完工的**科研站
 * @param {boolean} input.routeCleared   对应路线是否全线清除（二级不看这一条）
 * @param {boolean} input.underConstruction
 * @param {boolean} input.alive
 * @returns {{ ok: boolean, reason: string, label: string, towerId: string|null, fromTier: number, toTier: number, cost: object[] }}
 */
export function canUpgradeTower({
  unitType = null,
  targetTier = 2,
  hasResearch = false,
  routeCleared = false,
  underConstruction = false,
  alive = true,
  upgrading = false
} = {}) {
  const identity = towerIdentityFor(unitType);
  const fail = (reason) => ({
    ok: false,
    reason,
    label: UPGRADE_ERROR_LABELS[reason] ?? '',
    towerId: identity?.towerId ?? null,
    fromTier: identity?.tier ?? 0,
    toTier: clampTier(targetTier),
    cost: []
  });
  if (!identity) return fail(UPGRADE_ERROR.notTower);
  if (alive === false) return fail(UPGRADE_ERROR.dead);
  if (underConstruction) return fail(UPGRADE_ERROR.underConstruction);
  if (upgrading) return fail(UPGRADE_ERROR.upgrading);
  const toTier = clampTier(targetTier);
  if (toTier <= identity.tier) return fail(UPGRADE_ERROR.wrongTier);
  // 不能跳级：目标必须正好是当前 +1。三级不是"再点两次"，而是先二级再三级。
  if (toTier !== identity.tier + 1) return fail(UPGRADE_ERROR.wrongTier);
  if (toTier > TOWER_TIER_MAX) return fail(UPGRADE_ERROR.maxTier);
  if (!hasResearch) return fail(UPGRADE_ERROR.missingResearch);
  if (toTier >= 3 && !routeCleared) return fail(UPGRADE_ERROR.missingRoute);
  return {
    ok: true,
    reason: UPGRADE_ERROR.none,
    label: '',
    towerId: identity.towerId,
    fromTier: identity.tier,
    toTier,
    cost: upgradeCostFor(identity.towerId, toTier)
  };
}

/** 缺哪些材料：`[{ itemId, need, have, missing }]`，空数组表示齐了。 */
export function missingUpgradeInputs(cost = [], countOf = null) {
  return (cost ?? [])
    .map((entry) => {
      const have = typeof countOf === 'function'
        ? Math.max(0, Math.floor(Number(countOf(entry.itemId)) || 0))
        : 0;
      return {
        itemId: entry.itemId,
        need: entry.count,
        have,
        missing: Math.max(0, entry.count - have)
      };
    })
    .filter((entry) => entry.missing > 0);
}

/** 升级完成后的新数值：保留绝对生命/耐久/活动魔力，只夹到新上限之内。 */
export function upgradeCarryOver({
  health = 0,
  durability = 0,
  activityMana = 0,
  nextMaxHealth = 0,
  nextMaxDurability = 0,
  nextManaCapacity = 0
} = {}) {
  const clampPositive = (value) => Math.max(0, Number(value) || 0);
  return {
    health: Math.min(clampPositive(health), clampPositive(nextMaxHealth)),
    durability: Math.min(clampPositive(durability), clampPositive(nextMaxDurability)),
    activityMana: Math.min(clampPositive(activityMana), clampPositive(nextManaCapacity))
  };
}
