// 人类部队的口粮与供餐（纯规则）。
//
// 设计约束（docs/DSH_DEFENSE_SURVIVAL_DESIGN.md 第三节 B）：
//   1. 傀儡由魔力、工具损耗和维修负担驱动，**不新增人的饥饿与睡眠需求**；
//      敌人、野生动物、中立待招募、建筑都不算玩家饥饿；
//   2. 判据是数据标记 `foodConsumer`，不是"所有 canMove 单位"；
//   3. 饱食度 0–100、初始 100、默认每分钟 -12，走模拟时间，暂停不消耗；
//   4. ≤60 且背包有口粮 → 自动吃一份、+40、不超上限、不重复扣费；
//      可在战斗中吃随身口粮，不改变当前指令；
//   5. 没有随身口粮的空闲单位可以用食堂供餐预约并实际移动；
//      **不会**因为吃饭抢走玩家强制攻击/驻守/远征命令；
//   6. <25 攻速 ×0.85、自然恢复减半；0 时攻速 ×0.70、停止自然恢复。
//      两个等级**互斥**，不叠成更重惩罚；吃饭恢复后即时撤掉，靠唯一 source 幂等。
//
// 这个文件不 import THREE / DOM / Game。

export const SATIETY_MAX = 100;
export const SATIETY_INITIAL = 100;

export const ARMY_NEEDS_RULES = {
  /** 每分钟掉多少饱食度（模拟时间）。 */
  satietyPerMinute: 12,
  /** 低于或等于这个值且背包有口粮就自动吃。 */
  autoEatAtOrBelow: 60,
  /** 吃一份口粮恢复多少。 */
  rationRestore: 40,
  /** 低于这个值进入「饥饿」减益档。 */
  hungryAtOrBelow: 25,
  hungryAttackRate: 0.85,
  hungryRecoveryFactor: 0.5,
  /** 饱食度为 0 进入「力竭」档（与饥饿档互斥）。 */
  exhaustedAttackRate: 0.7,
  /** 需求系统采样间隔（秒）。0.5 秒一次，事件驱动 + 有限频率。 */
  sampleSeconds: 0.5,
  /** 供餐预约：餐桌旁多远算「到了」。 */
  mealRange: 3.2,
  /** 一次食堂供餐消耗几份口粮。 */
  mealRations: 1,
  /** 一份口粮恢复多少（与 autoEat 同源，避免两套数字）。 */
  mealRestore: 40
};

export function armyNeedsRules(overrides = {}) {
  return { ...ARMY_NEEDS_RULES, ...(overrides ?? {}) };
}

/** 唯一属性来源 id：吃饭/饥饿来回切换时靠它幂等，不会越叠越重。 */
export const SATIETY_MODIFIER_SOURCE = 'food:satiety';

export const SATIETY_TIER = {
  fed: 'fed',
  hungry: 'hungry',
  exhausted: 'exhausted'
};

export const SATIETY_TIER_LABELS = {
  [SATIETY_TIER.fed]: '饱食',
  [SATIETY_TIER.hungry]: '饥饿',
  [SATIETY_TIER.exhausted]: '力竭'
};

export const FOOD_CONSUMER_FLAG = 'foodConsumer';

/**
 * 这支单位要不要吃饭。
 *
 * 只看数据标记：`definition.foodConsumer === true`。
 * 绝不拿 `canMove` 当判据——敌人、野生动物、中立待招募、建筑、傀儡全都能动或不能动，
 * 但它们都不该消耗玩家的口粮。
 */
export function isFoodConsumer(unit, definition = unit?.definition ?? null) {
  const source = unit ?? definition;
  if (!source) return false;
  const def = definition ?? unit?.definition ?? null;
  if (def?.[FOOD_CONSUMER_FLAG] === true) return true;
  if (source?.[FOOD_CONSUMER_FLAG] === true) return true;
  return false;
}

export function satietyOf(unit, rules = ARMY_NEEDS_RULES) {
  const resolved = armyNeedsRules(rules);
  const raw = Number(unit?.satiety);
  if (!Number.isFinite(raw)) return SATIETY_INITIAL;
  return Math.max(0, Math.min(SATIETY_MAX, raw));
}

export function satietyRatio(unit, rules = ARMY_NEEDS_RULES) {
  const resolved = armyNeedsRules(rules);
  return satietyOf(unit, resolved) / SATIETY_MAX;
}

/** 当前处于哪一档。饥饿与力竭互斥：最低档优先，绝不叠加。 */
export function satietyTier(satiety, rules = ARMY_NEEDS_RULES) {
  const resolved = armyNeedsRules(rules);
  const value = Math.max(0, Math.min(SATIETY_MAX, Number(satiety) || 0));
  if (value <= 0) return SATIETY_TIER.exhausted;
  if (value <= resolved.hungryAtOrBelow) return SATIETY_TIER.hungry;
  return SATIETY_TIER.fed;
}

export function satietyTierOf(unit, rules = ARMY_NEEDS_RULES) {
  const resolved = armyNeedsRules(rules);
  return satietyTier(satietyOf(unit, resolved), resolved);
}

/**
 * 这一档对应的属性修正。返回空数组表示没有减益（吃了饭要立刻回到空数组）。
 *
 * 两个档位的数值来源是"互斥"的：饥饿档只改攻速与自然恢复系数，
 * 力竭档只改攻速（自然恢复直接停，用 `naturalRecoveryEnabled: false` 表达）。
 * 绝不同时返回两个档的条目。
 */
export function satietyModifiers(satiety, rules = ARMY_NEEDS_RULES) {
  const resolved = armyNeedsRules(rules);
  const tier = satietyTier(satiety, resolved);
  if (tier === SATIETY_TIER.exhausted) {
    return [
      { stat: 'attackRate', type: 'multiply', percent: resolved.exhaustedAttackRate - 1 }
    ];
  }
  if (tier === SATIETY_TIER.hungry) {
    return [
      { stat: 'attackRate', type: 'multiply', percent: resolved.hungryAttackRate - 1 },
      { stat: 'naturalRecoveryScale', type: 'multiply', percent: resolved.hungryRecoveryFactor - 1 }
    ];
  }
  return [];
}

/** 自然恢复还能不能生效（力竭时停）。 */
export function naturalRecoveryEnabled(satiety, rules = ARMY_NEEDS_RULES) {
  return satietyTier(satiety, rules) !== SATIETY_TIER.exhausted;
}

/**
 * 推进一段时间后新的饱食度。`dt` 是**模拟时间**，暂停时调用方根本不推进，
 * 所以这条规则天然不会在暂停/离线期间饿死全军。
 */
export function advanceSatiety(satiety, dt, rules = ARMY_NEEDS_RULES) {
  const resolved = armyNeedsRules(rules);
  const step = Math.max(0, Number(dt) || 0);
  const current = Math.max(0, Math.min(SATIETY_MAX, Number.isFinite(Number(satiety)) ? Number(satiety) : SATIETY_INITIAL));
  const next = current - (resolved.satietyPerMinute / 60) * step;
  return Math.max(0, Math.min(SATIETY_MAX, next));
}

/** 单位这一趟最多能带几份口粮（按背包剩余可堆叠空间算，由调用方给 authoritative 数）。 */
export function rationCapacityFor(carriedRations, stackLimit = 64) {
  const limit = Math.max(0, Math.floor(Number(stackLimit) || 0));
  return Math.max(0, limit - Math.max(0, Math.floor(Number(carriedRations) || 0)));
}

/** 吃掉一份口粮后的饱食度（不超上限）。 */
export function satietyAfterEating(satiety, rules = ARMY_NEEDS_RULES) {
  const resolved = armyNeedsRules(rules);
  return Math.max(0, Math.min(SATIETY_MAX, (Number(satiety) || 0) + resolved.rationRestore));
}

/**
 * 该不该自动吃背包里的口粮。
 * 返回 `null` 表示不该吃；否则返回 `{ restore, satietyAfter }`。
 */
export function planAutoEat({ satiety = SATIETY_INITIAL, rations = 0, rules = ARMY_NEEDS_RULES } = {}) {
  const resolved = armyNeedsRules(rules);
  const value = Math.max(0, Math.min(SATIETY_MAX, Number(satiety) || 0));
  if (value > resolved.autoEatAtOrBelow) return null;
  if (Math.max(0, Math.floor(Number(rations) || 0)) < 1) return null;
  return {
    restore: resolved.rationRestore,
    satietyAfter: satietyAfterEating(value, resolved)
  };
}

/**
 * 这一趟能带多少口粮去前线。
 * 目的是"前线应通过携带口粮或运输补给解决，不能从远处基地隔空吃库存"：
 * 供餐只在本单位**已经带着口粮**或食堂在 `mealRange` 内时发生。
 */
export function frontlineRationTarget({ soldiers = 0, minutesPerSoldier = 6, rules = ARMY_NEEDS_RULES } = {}) {
  const resolved = armyNeedsRules(rules);
  const perSoldier = Math.max(1, Math.ceil((resolved.satietyPerMinute * minutesPerSoldier) / resolved.rationRestore));
  return Math.max(0, Math.ceil(Number(soldiers) || 0) * perSoldier);
}

/** HUD 汇总：口粮库存能供养多少人、多久，以及现在有几支缺粮部队。 */
export function armySupplySummary({
  rations = 0,
  soldiers = 0,
  rules = ARMY_NEEDS_RULES
} = {}) {
  const resolved = armyNeedsRules(rules);
  const stock = Math.max(0, Math.floor(Number(rations) || 0));
  const people = Math.max(0, Math.floor(Number(soldiers) || 0));
  if (people <= 0) {
    return { rations: stock, soldiers: 0, secondsOfSupply: null, rationSecondsPerSoldier: null, label: '没有需要口粮的部队' };
  }
  const perSecond = (resolved.satietyPerMinute / 60) / resolved.rationRestore;
  const secondsPerSoldier = perSecond > 0 ? (1 / perSecond) : null;
  const secondsOfSupply = perSecond > 0 ? (stock / (perSecond * people)) : null;
  return {
    rations: stock,
    soldiers: people,
    rationSecondsPerSoldier: secondsPerSoldier,
    secondsOfSupply,
    // 零消耗显示"稳定"而不是除零/无穷
    label: secondsOfSupply === null ? '口粮供给稳定' : ''
  };
}

/** 缺粮部队数：饱食度已经落进减益档的部队。 */
export function starvingSoldierCount(units = [], rules = ARMY_NEEDS_RULES) {
  const resolved = armyNeedsRules(rules);
  let count = 0;
  (units ?? []).forEach((unit) => {
    if (!isFoodConsumer(unit) || unit?.alive === false) return;
    if (satietyOf(unit, resolved) <= resolved.hungryAtOrBelow) count += 1;
  });
  return count;
}
