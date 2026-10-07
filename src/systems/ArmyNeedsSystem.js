// 人类部队的口粮与供餐：运行时。
//
// 与 armyNeeds.js 的分工：那边是纯规则（饱食推进、阈值、互斥减益、HUD 汇总），
// 这边负责"谁在什么时候吃、吃的是背包还是食堂、属性来源怎么挂/撤"。
//
// 三条不能违反的边界（设计文档第三节 B）：
//   1. **傀儡/敌人/野生动物/中立/建筑都不吃**：判据是 definition.foodConsumer，
//      不是 canMove；
//   2. 吃饭**不改变当前指令**：随身口粮是纯数值消耗，不打断攻击/驻守/远征；
//      食堂供餐只挑"空闲"单位（没有攻击/移动/驻守命令的那一批）；
//   3. 减益靠唯一 source 幂等：吃饱了立刻 removeModifiersBySource，
//      反复刷新、快照、重载都不会叠乘。
import {
  ARMY_NEEDS_RULES,
  SATIETY_MODIFIER_SOURCE,
  SATIETY_TIER,
  advanceSatiety,
  armyNeedsRules,
  armySupplySummary,
  isFoodConsumer,
  planAutoEat,
  satietyModifiers,
  satietyOf,
  satietyTierOf,
  starvingSoldierCount
} from './armyNeeds.js';

export const RATION_ITEM_ID = 'ration';
export const GRAIN_ITEM_ID = 'grain';

/** 食堂一次最多同时招待几名客人（避免一座食堂把全军的口粮一次性发完）。 */
export const MAX_MEAL_SEATS = 3;

export class ArmyNeedsSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = armyNeedsRules(options.rules ?? {});
    this.sampleTimer = 0;
    /**
     * 上一段采样累积的**真实**模拟时间。
     *
     * 为什么不能直接用 `rules.sampleSeconds` 当步长：采样是按帧判断的
     * （`sampleTimer -= dt`），60fps 与 144fps 落到采样点上的累计时间有
     * 几十毫秒的漂移，于是"同样 30 秒，一个掉 5.8、一个掉 5.7"。
     * 用真实累积时间推进饱食度，掉速就与帧率完全无关。
     */
    this.pendingSeconds = 0;
    /** 已初始化过饱食度的单位 id（成功归队时初始化，不能每帧重设） */
    this.initialized = new Set();
    /** 食堂当前的用餐预约：canteenId → Set<unitId> */
    this.seats = new Map();
    this.stats = {
      ticks: 0,
      initialized: 0,
      autoMeals: 0,
      canteenMeals: 0,
      tierSwaps: 0,
      starving: 0
    };
    this.lastSummary = null;
  }

  /**
   * 成功归队时初始化需求。
   * 「招募归队时初始化」是设计文档的原文——所以这里不做"看到就补 100"，
   * 否则一支被打残到 0 饱食的部队会在每次刷新时被喂饱。
   */
  initializeFor(unit) {
    if (!unit?.id || !isFoodConsumer(unit)) return false;
    if (this.initialized.has(unit.id)) return false;
    unit.satiety = 100;
    this.initialized.add(unit.id);
    this.applyModifiers(unit, { force: true });
    this.stats.initialized += 1;
    return true;
  }

  /** 部队清单：只含需要饮食的**己方存活**单位。 */
  consumers() {
    const units = this.game?.friendlyUnits ?? [];
    return units.filter((unit) => unit?.alive !== false && isFoodConsumer(unit));
  }

  rationCount() {
    return this.game?.baseInventory?.countOf?.(RATION_ITEM_ID) ?? 0;
  }

  grainCount() {
    return this.game?.baseInventory?.countOf?.(GRAIN_ITEM_ID) ?? 0;
  }

  /** 把这一档的修正挂到单位属性上；同 source 先撤再挂，天然幂等。 */
  applyModifiers(unit, { force = false } = {}) {
    if (!unit?.attributes) return false;
    const satiety = satietyOf(unit, this.rules);
    const tier = satietyTierOf(unit, this.rules);
    if (!force && unit.satietyTier === tier) return false;
    unit.attributes.removeModifiersBySource(SATIETY_MODIFIER_SOURCE);
    const modifiers = satietyModifiers(satiety, this.rules);
    if (modifiers.length) {
      unit.attributes.addModifiers(
        modifiers.map((modifier) => ({ ...modifier })),
        SATIETY_MODIFIER_SOURCE
      );
    }
    unit.satietyTier = tier;
    this.stats.tierSwaps += 1;
    return true;
  }

  /** 餐厅列表：已建成、存活、有供能（断电的食堂不发饭）。 */
  canteens() {
    const units = this.game?.friendlyUnits ?? [];
    return units.filter((unit) => (
      unit?.alive !== false
      && unit.type === 'canteen'
      && unit.underConstruction !== true
      && unit.poweredDown !== true
    ));
  }

  seatsFor(canteenId) {
    let seats = this.seats.get(canteenId);
    if (!seats) {
      seats = new Set();
      this.seats.set(canteenId, seats);
    }
    return seats;
  }

  /**
   * 单位现在"忙不忙"。只有空闲单位才会被食堂供餐拉走——
   * 玩家明确的攻击/移动/驻守/远征命令绝不会被吃饭抢走。
   *
   * `ignoreMealWalk` 是给"已经坐在食堂座位上"的那批单位用的：
   * 供餐自己会往 `moveGoal` 写一个目的地，如果那也算"忙"，
   * 单位会在迈出第一步的下一帧被判定为不空闲、座位被释放、永远走不到食堂。
   * 所以座位检查用 `ignoreMealWalk: true`，而"要不要新占一个座位"用默认值。
   */
  unitIsIdle(unit, { ignoreMealWalk = false } = {}) {
    if (!unit) return false;
    if (unit.controlMode && unit.controlMode !== 'normal') return false;
    if (unit.commandMoveGoal) return false;
    if (unit.moveGoal && !(ignoreMealWalk && unit.mealWalk)) return false;
    if (unit.target) return false;
    if (unit.attackTimer > 0) return false;
    // 傀儡由作业系统接管，不参与食堂供餐（它不需要吃饭）
    if (unit.isWorker === true) return false;
    return true;
  }

  /** 这支部队随身带了几份口粮。 */
  carriedRations(unit) {
    const bag = this.game?.itemBagFor?.(unit, { create: false }) ?? null;
    return bag?.countOf?.(RATION_ITEM_ID) ?? 0;
  }

  consumeCarried(unit, count = 1) {
    const bag = this.game?.itemBagFor?.(unit, { create: false }) ?? null;
    if (!bag) return { ok: false, removed: 0 };
    const removed = bag.remove?.(RATION_ITEM_ID, count) ?? { ok: false, removed: 0 };
    if (removed.ok) {
      this.game?.backpack?.markDirty?.();
      this.game?.onUnitBackpackChanged?.(unit);
    }
    return removed;
  }

  /**
   * 一段模拟时间的推进。
   *
   * 有限采样（0.5 秒），而且只遍历**需要饮食的单位**——不每帧扫全世界。
   */
  update(dt = 0) {
    const step = Math.max(0, Number(dt) || 0);
    if (step <= 0) return;
    this.sampleTimer -= step;
    // 累积真实时间（不是固定步长），这样帧率不改变消耗速度。
    // 上限 5 秒：一次超长帧（切标签页回来、断点）不该让全军瞬间饿到 0。
    this.pendingSeconds = Math.min(5, this.pendingSeconds + step);
    if (this.sampleTimer > 0) return;
    const elapsed = this.pendingSeconds;
    if (elapsed <= 0) return;
    this.pendingSeconds = 0;
    this.sampleTimer = Math.max(0.2, Number(this.rules.sampleSeconds) || 0.5);
    this.stats.ticks += 1;
    const units = this.consumers();
    const canteens = this.canteens();
    units.forEach((unit) => {
      if (!this.initialized.has(unit.id)) this.initializeFor(unit);
      unit.satiety = advanceSatiety(unit.satiety, elapsed, this.rules);
      this.tryAutoEat(unit);
      this.applyModifiers(unit);
      this.tryCanteenMeal(unit, canteens, elapsed);
    });
    this.pruneSeats(units);
    this.lastSummary = this.summary(units);
  }

  /** 随身口粮自动吃：可在战斗中吃，不改变任何指令。 */
  tryAutoEat(unit) {
    const plan = planAutoEat({
      satiety: satietyOf(unit, this.rules),
      rations: this.carriedRations(unit),
      rules: this.rules
    });
    if (!plan) return false;
    const removed = this.consumeCarried(unit, 1);
    if (!removed.ok) return false;
    unit.satiety = plan.satietyAfter;
    this.applyModifiers(unit);
    this.stats.autoMeals += 1;
    this.game?.effects?.spawnRing?.(unit.position, '#e8c765', 0.42, 0.32);
    return true;
  }

  /**
   * 食堂供餐：空闲、没有随身口粮、饱食度已经掉到需要补的单位会走过来吃一份。
   * 预约是**独占**的：同一座食堂同时最多 MAX_MEAL_SEATS 名客人。
   */
  tryCanteenMeal(unit, canteens, elapsed) {
    if (!canteens.length) return false;
    if (satietyOf(unit, this.rules) > this.rules.autoEatAtOrBelow) {
      this.releaseSeat(unit);
      return false;
    }
    // 先看是不是已经在某座食堂的座位上：在就继续走 / 继续吃。
    // 这一段用 ignoreMealWalk——供餐自己写的 moveGoal 不该把它判成"玩家在指挥"。
    for (const canteen of canteens) {
      const seats = this.seatsFor(canteen.id);
      if (!seats.has(unit.id)) continue;
      // 玩家接管（给了命令）：让位，不跟命令抢
      if (!this.unitIsIdle(unit, { ignoreMealWalk: true })) {
        this.releaseSeat(unit);
        return false;
      }
      const distance = Math.hypot(
        (unit.position?.x ?? 0) - (canteen.position?.x ?? 0),
        (unit.position?.z ?? 0) - (canteen.position?.z ?? 0)
      );
      if (distance > this.rules.mealRange) {
        this.walkToMeal(unit, canteen, elapsed);
        return true;
      }
      return this.serveMeal(unit, canteen);
    }
    // 没有座位：只有真的空闲才去占一个新的
    if (!this.unitIsIdle(unit)) return false;
    const target = canteens.find((canteen) => {
      const seats = this.seatsFor(canteen.id);
      if (seats.size >= MAX_MEAL_SEATS) return false;
      return (this.game?.stations?.stationFor?.(canteen)?.outputInventory?.countOf?.(RATION_ITEM_ID) ?? 0) > 0;
    });
    if (!target) return false;
    this.seatsFor(target.id).add(unit.id);
    unit.mealCanteenId = target.id;
    this.walkToMeal(unit, target, elapsed);
    return true;
  }

  /**
   * 走向食堂。
   *
   * 走的是**既有的移动目标**字段，而且是空闲单位才走这一步——
   * 玩家刚下达的任何命令都会让 `unitIsIdle` 变假，下一帧自动释放座位。
   */
  walkToMeal(unit, canteen, dt) {
    if (!unit.movement || !canteen?.position) return false;
    unit.moveGoal = { x: canteen.position.x, z: canteen.position.z };
    unit.mealWalk = true;
    unit.movement.moveToward(unit.moveGoal, dt, Math.max(1, this.rules.mealRange - 0.6));
    return true;
  }

  /** 真正吃那一份：从食堂产物格里扣口粮，恢复饱食度。 */
  serveMeal(unit, canteen) {
    const station = this.game?.stations?.stationFor?.(canteen) ?? null;
    const output = station?.outputInventory ?? null;
    if (!output || (output.countOf?.(RATION_ITEM_ID) ?? 0) <= 0) {
      // 食堂没饭了：放掉座位，让它自己去干别的，不在这里干等
      this.releaseSeat(unit);
      return false;
    }
    const removed = output.remove(RATION_ITEM_ID, 1);
    if (!removed.ok) {
      this.releaseSeat(unit);
      return false;
    }
    unit.satiety = Math.min(100, satietyOf(unit, this.rules) + this.rules.mealRestore);
    this.applyModifiers(unit);
    this.releaseSeat(unit);
    this.stats.canteenMeals += 1;
    this.game?.stationPanel?.markDirty?.();
    this.game?.effects?.spawnRing?.(unit.position, '#e8c765', 0.5, 0.36);
    return true;
  }

  releaseSeat(unit) {
    if (!unit) return false;
    let released = false;
    this.seats.forEach((seats) => {
      if (seats.delete(unit.id)) released = true;
    });
    if (unit.mealCanteenId != null) {
      this.seatsFor(unit.mealCanteenId).delete(unit.id);
      unit.mealCanteenId = null;
    }
    if (unit.mealWalk) {
      // 只清"因为吃饭而设的"移动目标：玩家的命令不归这里管
      if (unit.moveGoal && !unit.commandMoveGoal) unit.moveGoal = null;
      unit.mealWalk = false;
    }
    return released;
  }

  pruneSeats(units) {
    const alive = new Set(units.map((unit) => unit.id));
    this.seats.forEach((seats, canteenId) => {
      [...seats].forEach((unitId) => {
        if (!alive.has(unitId)) seats.delete(unitId);
      });
      if (!seats.size) this.seats.delete(canteenId);
    });
  }

  /** HUD 汇总：口粮库存、预计供养人数/时间、缺粮部队数。不塞全军条形面板。 */
  summary(units = null) {
    const list = units ?? this.consumers();
    const aggregate = armySupplySummary({
      rations: this.rationCount(),
      soldiers: list.length,
      rules: this.rules
    });
    const starving = starvingSoldierCount(list, this.rules);
    this.stats.starving = starving;
    return {
      ...aggregate,
      grain: this.grainCount(),
      starving,
      hungryLabel: starving > 0 ? `${starving} 支部队缺粮` : '口粮充足',
      stats: { ...this.stats }
    };
  }

  /** 重新开始 / 快照加载：清监听与属性来源，不留任何残留修正。 */
  reset() {
    this.seats.clear();
    this.initialized.clear();
    this.sampleTimer = 0;
    this.pendingSeconds = 0;
    const units = this.game?.friendlyUnits ?? [];
    units.forEach((unit) => {
      unit.attributes?.removeModifiersBySource?.(SATIETY_MODIFIER_SOURCE);
      unit.satietyTier = null;
      unit.mealCanteenId = null;
      unit.mealWalk = false;
    });
    return true;
  }

  /** 校验用：某个单位当前的减益档（供测试与 HUD 读）。 */
  tierOf(unit) {
    return satietyTierOf(unit, this.rules);
  }

  /**
   * 自然/设施恢复的倍率（0 = 完全不恢复）。
   *
   * 这一项是 `satietyModifiers` 在**设施治疗**那一侧的落地：属性修正管的是
   * 单位自己的 attackRate / naturalRecoveryScale，而"食堂每 tick 治多少"这条
   * 路径不经过属性系统，所以要有一个同样幂等的查询接口。
   * 力竭（0）= 停止自然恢复；饥饿（≤25）= 减半；否则 1。
   */
  recoveryScaleFor(unit) {
    const tier = satietyTierOf(unit, this.rules);
    if (tier === SATIETY_TIER.exhausted) return 0;
    if (tier === SATIETY_TIER.hungry) return this.rules.hungryRecoveryFactor;
    return 1;
  }
}
