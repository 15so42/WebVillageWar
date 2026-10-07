// 建筑脱战维修：请求登记、优先级排序与材料结算（纯规则）。
//
// 设计约束（docs/DSH_DEFENSE_SURVIVAL_DESIGN.md 第二节）：
//   1. 复用既有恢复/维修/建设/库存/作业任务与预留机制，不另造第二套抢任务系统；
//   2. 生命低于最大值就登记缺口；已支持结构耐久的建筑也可登记耐久缺口；
//   3. 脱战 = 最后受伤或发起攻击至少 8 秒；交战中不执行，重新交战暂停并保留已修量；
//   4. 请求按建筑 id 唯一，重复受伤只更新一份；
//   5. 排序：逃生/紧急补能 > 急修（生命比例 <35% 的关键建筑）> 普通维修；
//      同一紧急等级里看缺损、距离与等待时间，长时间请求不会永久饿死；
//   6. **必须有经营代价**：按材质消耗木材/石料/铁矿，用量随修复量走，
//      批量材料提供有限修复额度，不能每帧把小数四舍五入掉一个材料，
//      也不能扣一个材料就无限修复。
//
// 这个文件不 import THREE / DOM / Game。

export const REPAIR_REQUEST_STATE = {
  /** 交战中登记的缺口：等着，不派活 */
  pending: 'in_combat',
  /** 脱战可派活 */
  waiting: 'waiting',
  /** 已有傀儡带料而来 */
  assigned: 'assigned',
  /** 材料不够，等补给 */
  missingMaterial: 'missing_material',
  /** 修满了 */
  satisfied: 'satisfied'
};

/**
 * 状态文案。**同时**按枚举名（pending / assigned / …）和状态值（in_combat / …）
 * 索引同一份字符串。
 *
 * 为什么要两套键：界面拿到的是 `request.state`（值形如 `in_combat`），
 * 而日志、扇形菜单与验收脚本更愿意写 `REPAIR_STATE_LABELS.pending`。
 * 只留一套键，另一处就会各自抄一遍中文字符串——设计文档点名的五种状态
 * （交战中等待 / 待维修 / 缺材料 / 傀儡维修中 / 已恢复）就会出现第二份口径。
 */
const REPAIR_STATE_TEXT = {
  [REPAIR_REQUEST_STATE.pending]: '交战中等待',
  [REPAIR_REQUEST_STATE.waiting]: '待维修',
  [REPAIR_REQUEST_STATE.assigned]: '傀儡维修中',
  [REPAIR_REQUEST_STATE.missingMaterial]: '缺材料',
  [REPAIR_REQUEST_STATE.satisfied]: '已恢复'
};

export const REPAIR_STATE_LABELS = {
  ...REPAIR_STATE_TEXT,
  pending: REPAIR_STATE_TEXT[REPAIR_REQUEST_STATE.pending],
  waiting: REPAIR_STATE_TEXT[REPAIR_REQUEST_STATE.waiting],
  assigned: REPAIR_STATE_TEXT[REPAIR_REQUEST_STATE.assigned],
  missing_material: REPAIR_STATE_TEXT[REPAIR_REQUEST_STATE.missingMaterial],
  satisfied: REPAIR_STATE_TEXT[REPAIR_REQUEST_STATE.satisfied]
};

/**
 * 建筑材质 → 维修消耗哪种材料。基地/魔力炉这类关键结构吃铁矿，
 * 石制建筑吃石料，木制建筑吃木材——"随建筑材质和修复量决定"。
 */
export const REPAIR_MATERIAL_BY_BUILDING = {
  playerBase: 'iron',
  manaFurnace: 'iron',
  furnace: 'stone',
  researchStation: 'stone',
  enchantTable: 'stone',
  repairStation: 'iron',
  arrowTower: 'wood',
  ballista: 'iron',
  shockTower: 'stone',
  canteen: 'wood',
  cropPlot: 'wood',
  treePit: 'wood',
  quarry: 'wood',
  deepMine: 'stone',
  chest: 'wood',
  manualWorkbench: 'wood',
  beacon: 'wood'
};

/** 没登记的建筑按这个来（不做材质猜测，够用即可）。 */
export const REPAIR_MATERIAL_DEFAULT = 'wood';

export const BUILDING_REPAIR_RULES = {
  /** 脱战判定：最后受伤/发起攻击之后至少这么多秒。 */
  outOfCombatSeconds: 8,
  /**
   * 请求登记的采样间隔（秒）。
   *
   * 以前这个值只写在 RepairDispatchSystem.update 的兜底表达式里，
   * 于是 `rules.sampleSeconds` 是 undefined——任何按 rules 读采样频率的
   * 界面或测试都会读到"没有这个配置"。放在这里，采样频率就是可配置的。
   */
  sampleSeconds: 0.5,
  /** 一批修复消耗 1 个材料，恢复多少生命（绝对点数）。 */
  healthPerMaterial: 8,
  /** 一批修复消耗 1 个材料，恢复多少结构耐久（绝对点数）。 */
  durabilityPerMaterial: 6,
  /** 一次批量结算最多吃几个材料（避免一口气把库存掏空）。 */
  maxMaterialsPerBatch: 2,
  /** 一批修复的施工时长（秒）。 */
  batchSeconds: 1.2,
  /** 傀儡站到多近才算够得着建筑。 */
  repairRange: 3.4,
  /** 生命比例低于这个值算「关键建筑急修」。 */
  urgentHealthRatio: 0.35,
  /**
   * 耐久缺口只在比例低于这个值时才登记。
   * 取值理由：维修站光环每 1 秒修 12 点耐久，门槛压到 0.5 才不会出现
   * "光环刚修了一点、维修请求又登记一条"的每帧抖动。
   */
  minDurabilityRatio: 0.5,
  /** 同一紧急等级里每个等待中的请求最多给多少"等待权重"（防饿死）。 */
  waitBonusSeconds: 150,
  /** 每等待 1 秒折算多少评分（配合 waitBonusSeconds 使用）。 */
  waitCreditPerSecond: 1,
  /** 重要度每一档折算多少评分。 */
  importanceWeight: 10,
  /** 急修（生命 <35%）额外插队多少评分。 */
  urgentBonus: 30,
  /** 缺损比例每 1.0 折算多少评分。 */
  damageCreditWeight: 30,
  /** 距离项权重：每米折算多少评分（越小越优先）。 */
  distanceWeight: 1
};

export function buildingRepairRules(overrides = {}) {
  return { ...BUILDING_REPAIR_RULES, ...(overrides ?? {}) };
}

/**
 * 维修重要度。数字越小越先做（与作业队列同尺度）。
 * 顺序来自设计文档：基地 > 魔力炉与关键供能节点 > 防塔 > 食物生产/食堂 > 普通生产与其它。
 */
export const REPAIR_IMPORTANCE = {
  playerBase: 0,
  manaFurnace: 1,
  furnace: 1,
  arrowTower: 3,
  ballista: 3,
  shockTower: 3,
  canteen: 4,
  cropPlot: 4,
  treePit: 4,
  repairStation: 5,
  researchStation: 5,
  enchantTable: 5,
  manualWorkbench: 6,
  chest: 6,
  quarry: 5,
  deepMine: 5
};

export const REPAIR_IMPORTANCE_DEFAULT = 6;

export function repairImportanceFor(unitType) {
  const value = REPAIR_IMPORTANCE[unitType];
  return Number.isFinite(value) ? value : REPAIR_IMPORTANCE_DEFAULT;
}

export function repairMaterialFor(unitType) {
  return REPAIR_MATERIAL_BY_BUILDING[unitType] ?? REPAIR_MATERIAL_DEFAULT;
}

/** 这栋建筑同一时刻允许几名傀儡预留/维修。基地等大型结构可配置为两名。 */
export const REPAIR_MAX_WORKERS = {
  playerBase: 2,
  manaFurnace: 2
};

export function maxRepairWorkersFor(unitType) {
  const value = REPAIR_MAX_WORKERS[unitType];
  if (Number.isFinite(value) && value > 0) return Math.floor(value);
  return 1;
}

function positive(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

/**
 * 这栋建筑现在需不需要维修。返回 `null` 表示不需要。
 *
 * 「施工未完成不能一边建设一边被当成健康不足维修」——`underConstruction` 时直接返回 null。
 */
export function buildingRepairStatus(unit, rules = BUILDING_REPAIR_RULES) {
  if (!unit) return null;
  if (unit.alive === false) return null;
  if (unit.underConstruction === true) return null;
  if (unit.isBuilding !== true && unit.kind !== 'building' && unit.kind !== 'structure') return null;
  const resolved = buildingRepairRules(rules);
  const maxHealth = positive(unit.maxHealth, 0);
  if (maxHealth <= 0) return null;
  const health = Math.max(0, Math.min(maxHealth, positive(unit.health, 0)));
  const healthRatio = health / maxHealth;
  const healthGap = Math.max(0, maxHealth - health);

  const maxDurability = positive(unit.weapon?.maxDurability, 0);
  const durability = maxDurability > 0
    ? Math.max(0, Math.min(maxDurability, positive(unit.weapon?.durability, 0)))
    : 0;
  const durabilityRatio = maxDurability > 0 ? durability / maxDurability : 1;
  const durabilityGap = maxDurability > 0 && durabilityRatio < resolved.minDurabilityRatio
    ? Math.max(0, maxDurability - durability)
    : 0;

  if (healthGap <= 0.01 && durabilityGap <= 0.01) return null;
  return {
    id: unit.id,
    unitType: unit.type,
    health,
    maxHealth,
    healthRatio,
    healthGap,
    durability,
    maxDurability,
    durabilityRatio,
    durabilityGap,
    // 「缺损比例」用于同紧急等级的排序：生命与耐久各取缺口比例，取大的那个
    damageRatio: Math.max(healthGap / maxHealth, maxDurability > 0 ? durabilityGap / maxDurability : 0),
    material: repairMaterialFor(unit.type),
    importance: repairImportanceFor(unit.type),
    maxWorkers: maxRepairWorkersFor(unit.type),
    urgent: healthRatio < resolved.urgentHealthRatio
  };
}

export function isUrgentRepair(status, rules = BUILDING_REPAIR_RULES) {
  const resolved = buildingRepairRules(rules);
  if (!status) return false;
  return status.healthRatio < resolved.urgentHealthRatio;
}

/**
 * 同一紧急等级里的排序键（越小越先做）。
 *
 * 三项都进评分，缺一不可：
 *   - 重要度：基地永远排在普通生产前面；
 *   - 缺损比例：同一档里先把快塌的修回来；
 *   - 距离与等待时间：远的那栋会慢慢变便宜，长时间排队不会永久饿死。
 *
 * 权重取值的理由（改动前是 100 / 60 / 30 / 45，等待权重压不过一档重要度差）：
 *   - 重要度 ×10：一档重要度 = 10 分，是"要不要跨档插队"的主判据；
 *   - 急修 -30：等于三档重要度，足以把一栋快塌的食堂提到完好防塔前面，
 *     但推不倒基地与供能节点（那两档差 10 分，急修仍然领先）；
 *   - 缺损比例 ×30：满缺口 = 30 分，跨两档以上；
 *   - 等待权重 150：单档重要度差是 10 分，所以等满 150 秒的普通维修
 *     最终能压过"刚出现的高一档"请求——这正是"长时间请求不会永久饿死"；
 *     但推不过两档（＋30 分以上）的差距，所以关键建筑与普通生产仍分层。
 */
export function repairPriorityScore(entry, { unitX = 0, unitZ = 0, now = 0, rules = BUILDING_REPAIR_RULES } = {}) {
  const resolved = buildingRepairRules(rules);
  const status = entry?.status ?? entry;
  if (!status) return Number.POSITIVE_INFINITY;
  const distance = Math.hypot((entry?.x ?? 0) - unitX, (entry?.z ?? 0) - unitZ);
  const waited = Math.max(0, (Number(now) || 0) - (Number(entry?.createdAt) || 0));
  const waitCredit = Math.min(resolved.waitBonusSeconds, waited) * (Number(resolved.waitCreditPerSecond) || 0);
  const damageCredit = Math.max(0, status.damageRatio) * (Number(resolved.damageCreditWeight) || 0);
  return status.importance * (Number(resolved.importanceWeight) || 0)
    - (status.urgent ? (Number(resolved.urgentBonus) || 0) : 0)
    - damageCredit
    - waitCredit
    + distance * Math.max(0, resolved.distanceWeight);
}

/**
 * 从请求池里挑一条给某个傀儡（纯函数）。
 *
 * `reservedCounts` 记录每栋建筑已经预留了几名傀儡，达到 `maxWorkers` 就不再派第二个人
 * ——这正是"多个傀儡不能各扣一次材料修同一份缺口"的第一道闸。
 */
export function pickRepairRequest(candidates = [], {
  unitX = 0,
  unitZ = 0,
  now = 0,
  reservedCounts = null,
  rules = BUILDING_REPAIR_RULES
} = {}) {
  const resolved = buildingRepairRules(rules);
  let best = null;
  candidates.forEach((entry) => {
    if (!entry?.status) return;
    if (entry.state === REPAIR_REQUEST_STATE.pending) return;
    if (entry.state === REPAIR_REQUEST_STATE.satisfied) return;
    if (entry.available === false) return;
    const taken = reservedCounts?.get?.(entry.id) ?? 0;
    if (taken >= Math.max(1, entry.status.maxWorkers ?? 1)) return;
    const score = repairPriorityScore(entry, { unitX, unitZ, now, rules: resolved });
    if (!best || score < best.score) best = { entry, score };
  });
  return best?.entry ?? null;
}

/**
 * 一批维修的材料需求与额度。
 *
 * 「采用批量材料提供有限修复额度」：每个材料换固定点数的修复量，
 * 一次最多吃 `maxMaterialsPerBatch` 个。于是一个材料绝不会无限修，
 * 也不会因为修复量是小数而被 Math.round 掉（取整只发生在材料个数上，
 * 而材料个数由 `Math.ceil(修复量 / 每材料点数)` 决定）。
 */
export function repairBatchPlan(status, { rules = BUILDING_REPAIR_RULES, available = Infinity } = {}) {
  const resolved = buildingRepairRules(rules);
  if (!status) return { materials: 0, health: 0, durability: 0, material: null };
  const healthPer = positive(resolved.healthPerMaterial, 1);
  const durabilityPer = positive(resolved.durabilityPerMaterial, 1);
  // 这一批想修多少：优先补生命（生命归零就是被摧毁），耐久跟着补
  const wantedHealth = Math.max(0, status.healthGap);
  const wantedDurability = Math.max(0, status.durabilityGap);
  const healthMaterials = wantedHealth / healthPer;
  const durabilityMaterials = wantedDurability / durabilityPer;
  const wanted = Math.max(healthMaterials, durabilityMaterials);
  if (wanted <= 0) return { materials: 0, health: 0, durability: 0, material: status.material };
  const affordable = Math.max(0, Math.floor(Number(available) || 0));
  const materials = Math.max(0, Math.min(
    Math.ceil(wanted),
    Math.floor(resolved.maxMaterialsPerBatch),
    affordable
  ));
  if (materials <= 0) {
    return { materials: 0, health: 0, durability: 0, material: status.material };
  }
  // 材料按"够不够"分摊：先满足生命缺口，剩余额度给耐久
  let budget = materials;
  const healthSpend = Math.min(budget, Math.ceil(healthMaterials));
  budget -= healthSpend;
  const durabilitySpend = Math.min(budget, Math.ceil(durabilityMaterials));
  return {
    materials: healthSpend + durabilitySpend,
    health: Math.min(wantedHealth, healthSpend * healthPer),
    durability: Math.min(wantedDurability, durabilitySpend * durabilityPer),
    material: status.material
  };
}

/**
 * 拆除/损毁回收：参考完好时 60%，损毁残骸 20%–30%。
 * 材料基准是**实际投入**（建造 + 已支付升级），不是凭等级猜的。
 */
export const RECYCLE_RULES = {
  intactRatio: 0.6,
  wreckRatio: 0.2,
  /** 低于这个生命比例按残骸算，线性过渡到 wreckRatio。 */
  wreckHealthRatio: 0.35,
  /** 免费/奖励/初始对象：可以回收，但返不出没支付过的成本。 */
  refundOnlyPaidInvestment: true
};

export function recycleRatioFor(healthRatio, rules = RECYCLE_RULES) {
  const ratio = Math.max(0, Math.min(1, Number(healthRatio) || 0));
  const wreck = Math.max(0, Math.min(1, Number(rules.wreckHealthRatio) || 0));
  if (ratio <= wreck) return Number(rules.wreckRatio) || 0;
  const t = (ratio - wreck) / Math.max(0.0001, 1 - wreck);
  return (Number(rules.wreckRatio) || 0) + t * ((Number(rules.intactRatio) || 0) - (Number(rules.wreckRatio) || 0));
}

/**
 * 回收产出。`paidInvestment` 是真实支付过的材料清单；
 * 没支付过（免费/初始/奖励对象）时传空数组，结果就是空——不能凭等级返一份没付过的资源。
 */
export function recycleRefundFor({ unitType = null, healthRatio = 1, paidInvestment = [], rules = RECYCLE_RULES } = {}) {
  void unitType;
  if (rules.refundOnlyPaidInvestment && !(paidInvestment ?? []).length) return [];
  const ratio = recycleRatioFor(healthRatio, rules);
  const out = [];
  (paidInvestment ?? []).forEach((entry) => {
    const count = Math.floor(Math.max(0, Number(entry.count) || 0) * ratio);
    if (count > 0) out.push({ itemId: entry.itemId, count });
  });
  return out;
}
