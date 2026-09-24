// 「这一刻该打还是该逃、对谁打」——Numen(minecraft-numen)式判据的移植。
// 纯逻辑：不碰 THREE / DOM / Game，可以被 `test-combat-plan.mjs` 无头单测。
//
// 对应 Numen 的两个文件：
//   core/combat/Menace.java      —— 「离它多近算危险」按**每一只敌人自己**的够到距离算，
//                                   而且判据与走位问的是**同一个函数**；
//   core/combat/AttackPlan.java  —— 「这一刻该做什么、对谁做」，判据**带记忆**：
//                                   迟滞（已经在挥击时目标退开一点点不该让她重新起步）
//                                   + 承诺（选中一只就打完再换）。
//
// 为什么要从 WorkSystem 里搬出来（用户这一轮的反馈是
// 「它的 ai 在执行任务时会朝着目标前进，路上遇到怪有些会打有些不会打，很干脆」）：
//
//   旧实现是**每帧**用连续量（威胁压力 `threatPressureAt`）重算一次打还是逃，于是
//     - 判定里含距离：同一只敌人在远处显得弱、走近了显得强，结论会在它逼近的过程中翻面；
//     - 没有记忆：`pick` 每帧重选"最近那只"，而目标一换就要重算寻路；
//     - 傀儡（2.85）和狼（3.9）速度接近，距离在窗口边界上来回穿，
//       结论一帧一变、`unit.target` 被反复清空 —— 用户报的「互相拉扯」就是这件事。
//   Numen 的答案是三句话：**触发用布尔、判据带记忆、开打就承诺**。这里照搬。
//
// 两条硬约束（与 puppetArms 一致）：
//   - 战力公式对**双方用同一个**（`puppetArms.combatPower`），否则"我打不打得过他"没有意义；
//   - 危险半径必须与 `AttackSystem` 真正的命中判据一致（见 `dangerRadiusOf`）。
import { targetCombatRadius } from './combatHelpers.js';
import { combatPower, unitCombatPower } from './puppetArms.js';
import { isThreateningUnit } from './unitTeam.js';

export const COMBAT_ACTION = {
  /** 走位并还手：把这一帧交回常规战斗 AI（挥击/弹道/走位全归那一份实现）。 */
  skirmish: 'skirmish',
  /** 脱离接触：打不过，跑。 */
  disengage: 'disengage',
  /** 没什么可打的了。 */
  done: 'done'
};

export const COMBAT_PLAN_RULES = {
  /**
   * 攻击判定的那半格余量。**必须与 `AttackSystem` 里 `allowedRange` 的那个 0.85 完全一致**：
   * 判据与命中用两把尺子的时候，会出现"它说快躲、实际根本打不到"或者反过来
   * "它说安全、其实已经在挨打"——Numen 的原话是"两边各用各的度量时，判据说快躲、
   * 寻路说'你已经躲开了'，导航一建就到达、一步不走，她站在原地被打死"。
   */
  attackReachSlack: 0.85,
  /**
   * 威胁扫描半径。要**大于**任何单位能打到傀儡的距离，否则会出现"它正在打我，
   * 但没进扫描范围"。射程最远的敌人约 11m（法师），加上半径与余量约 12.5，
   * 所以取 14。
   */
  scanRadius: 14,
  /** 迎战时写进 aggroRange 的索敌半径（只写这一个单位，不改共享 definition）。 */
  engageAggroRange: 9,
  /**
   * 「它已经锁定我、而且已经逼近到这个距离」就先动手。
   *
   * 这条是**用户试玩之后加的**：原来只有"它够得着我"（近战约 2.3m）才触发，
   * 表现是"狼都追到脸上了它才开打"——它总是先挨一口。而一只**已经锁了我、
   * 正在往我这儿走**的怪，是在明确地要打这一架，那就该在它咬到之前迎上去。
   *
   * 取 5.5 的两个理由：
   *   - 明显大于近战的够到距离（约 2.3m），所以"迎上去 vs 被咬一口"的差别看得见；
   *   - 只有**锁了我**的怪才算（`engaging`），所以不会退回到用户第 4 轮报的
   *     「一开始为什么还朝狼走」——那时候任何 8m 外的狼都会让傀儡丢下工作。
   *     路过的、没锁定我的怪，仍然只有贴到我一刀之内才会被顺手清掉（触发线 ②）。
   *
   * 远程敌人不受这个数影响：它的危险半径（弓手约 9.7m）本来就比它大，
   * 取 `max` 之后仍然是"它能打到我"那一条说了算。
   */
  engageReactionRange: 5.5,
  /**
   * 自己战力 ≥ 敌方**合计**战力 × 这个系数 才**开始**迎战。取 1.0 = "打得过才打"。
   * 为什么不用 0.85（"略微劣势也敢拼"）：战力公式只是代理指标，0.85 那条线会把
   * "明显打不赢但数值接近"的情况放进来——拿斧的傀儡 8.19 对盾卫 10.87 会判"敢打"，
   * 而实际对打是傀儡 18 秒才能拆掉盾卫、盾卫 16.5 秒打死傀儡，冲上去就是送死。
   */
  engagePowerRatio: 1,
  /**
   * 已经在打的时候，敌方合计战力涨到这个系数之前都**继续打**。
   * 略小于 1：这里只处理"敌人数量的真实增减"，距离变化不再让结论翻面
   * （那是旧实现翻面的根因）。
   */
  disengagePowerRatio: 0.95,
  /**
   * 自己的血量掉到这个比例以下就不打了。
   *
   * Numen 这里是**裸血线 8 点**（四颗心），因为那边所有玩家都是 20 点血；
   * 我们的单位血量从 20 到 200 都有，所以换成比例。
   */
  minHealthRatio: 0.3,
  /**
   * 「它刚刚咬过我」的记账时长。`CombatSystem` 把伤害来源写在**受害者**的
   * `lastAttacker` 上，所以"这只怪刚才打了我"是从自己身上读的。
   */
  engageMemorySeconds: 6,
  /**
   * 战斗结束后还盯这么久才算真的没事（Numen `CALM_GRACE_TICKS = 40`）。
   *
   * 没有它，一只跟傀儡几乎一样快的怪会在触发线上**一进一出**，
   * 每进出一次就重开一场仗——用户报的「互相拉扯」的另一半原因。
   */
  calmGraceSeconds: 2,
  /**
   * 逃跑跑多远才算"甩掉了"。
   *
   * Numen 用 32（那边是区块尺度的追杀距离），它的**原则**是"必须远大于危险半径"：
   * "后者是'退出去就能接着打'的两三格，前者是'它已经跟不动了'"。
   * 我们用 14，因为 14 已经超过**任何**单位的索敌半径（最远的约 9.5）：
   * `TargetingSystem.isCurrentTargetValid` 一旦距离超过 aggroRange 就会把目标丢掉，
   * 所以跑出 14m 追兵是真的跟不上了，而不是"再走两步它又回来"。
   */
  fleeDistance: 14,
  /**
   * 逃跑的兜底时长。追兵**比傀儡快**时（狼 3.9 vs 傀儡 2.85）距离永远拉不开，
   * 没有这个阀门就是"永远在跑"的活锁。到点了就回去干活，
   * 危险节点由 `nodeIsWorkable` 的过滤挡着，不会走回危险区。
   */
  fleeMaxSeconds: 10,
  /** 连续这么久「想逃但一步都没动」就判"退无可退"，转身打（Numen 的 cornered）。 */
  corneredSeconds: 1.2
};

export function combatPlanRules(overrides = {}) {
  return { ...COMBAT_PLAN_RULES, ...(overrides ?? {}) };
}

/** 平面距离。缺任一坐标时返回 Infinity（判据一律当作"够不着"）。 */
export function planarDistance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.z ?? 0) - (b.z ?? 0));
}

/** 碰撞半径。走 `combatHelpers.targetCombatRadius` —— 与命中判定同一个来源。 */
export function unitRadius(unit) {
  return Math.max(0, Number(targetCombatRadius(unit)) || 0);
}

/**
 * 它够得着多远的**中心距**。
 *
 * 优先用注入的 `reachOf`（运行时传 `game.modifiers.getAttackRange`，因为武器/增益会改射程），
 * 没有就退回单位自己的 `attackRange` / `definition.attackRange`。
 */
export function attackReachOf(unit, reachOf = null) {
  if (typeof reachOf === 'function') {
    const value = Number(reachOf(unit));
    if (Number.isFinite(value)) return Math.max(0, value);
  }
  const direct = Number(unit?.attackRange);
  if (Number.isFinite(direct)) return Math.max(0, direct);
  return Math.max(0, Number(unit?.definition?.attackRange) || 0);
}

/**
 * **危险半径**：`foe` 从这么近就能打到 `self`（中心到中心）。
 *
 * 与 `AttackSystem` 的 `allowedRange = getAttackRange(source) + targetCombatRadius(target) + 0.85`
 * 是同一个公式。刻意做成"每只敌人自己一个数"而不是一条固定线：
 * 弓手（射程 8.4）在 9 米外就已经在打我，近战怪要到 2 米内，
 * 用同一条线必然有一边判错。
 */
export function dangerRadiusOf(foe, self, options = {}) {
  const rules = combatPlanRules(options.rules ?? {});
  const slack = Number.isFinite(options.slack) ? Number(options.slack) : rules.attackReachSlack;
  return attackReachOf(foe, options.reachOf) + unitRadius(self) + slack;
}

/** 它此刻是不是已经"够得着我"了。判据与寻路/走位共用这一个数。 */
export function tooClose(foe, self, options = {}) {
  if (!foe?.position || !self?.position) return false;
  return planarDistance(foe.position, self.position) <= dangerRadiusOf(foe, self, options);
}

/**
 * 它是不是**正在针对我**。
 *
 * 只看两件事（Numen `Menace.threatens` + `MobDefenseChain.dangersNear`）：
 *   1. 它的当前目标是我不 —— `TargetingSystem` 写的 `unit.target`；
 *   2. 我刚刚被它打过 —— `CombatSystem` 把来源写在我的 `lastAttacker` 上。
 *
 * 刻意**不**把"它离我很近"算进来：一只路过的野狼不该被"自卫"招惹，
 * 远处的敌人也不该让傀儡丢下手里的活（Numen 原话："防守不是挑衅，
 * 一只路过的僵尸猪灵不该被'防御'链招惹；还没逼近的那些该由主人决定要不要动手"）。
 */
export function isEngagingMe(foe, self, now, rules = COMBAT_PLAN_RULES) {
  if (!foe || !self) return false;
  const target = foe.target;
  if (target && (target === self || (target.id != null && target.id === self.id))) return true;
  const attacker = self.lastAttacker;
  if (attacker && (attacker === foe || (attacker.id != null && attacker.id === foe.id))) {
    const at = Number(self.lastAttackerTime);
    const resolved = combatPlanRules(rules);
    return Number.isFinite(at) && (Number(now) - at) <= resolved.engageMemorySeconds;
  }
  return false;
}

/**
 * 把 `ThreatFieldSystem.threatsNear()` 的原始列表加工成判据输入。
 *
 * 每一项都带上"它离我多远、够不够得着我、我够不够得着它、是不是正在打我"，
 * 这样后面的判据不必再碰几何，也就不会出现第二把尺子。
 *
 * ⚠️ `engaging` 是**判据口径**，不是原始信号：
 *      `engaging = 它锁了我(lockedOn) 且 已经进了「迎上去」的距离`
 *   原始信号单独放在 `lockedOn` 里，供调试与验收查看。
 *   这么分是因为"锁了我"和"该不该现在动手"是两件事：弓手 9m 外锁我就已经能打到我，
 *   而一只 8m 外刚锁定我的狼还没到该迎上去的距离（用户第 4 轮报的就是被这种怪牵着走）。
 */
export function combatFoes({ self, threats = [], rules = null, reachOf = null, now = 0 } = {}) {
  const resolved = combatPlanRules(rules ?? {});
  const foes = [];
  for (let i = 0; i < threats.length; i += 1) {
    const threat = threats[i];
    const unit = threat?.unit ?? null;
    if (!unit?.alive || !isThreateningUnit(unit)) continue;
    const distance = Number.isFinite(threat.distance)
      ? Number(threat.distance)
      : planarDistance(unit.position, self?.position);
    const danger = dangerRadiusOf(unit, self, { rules: resolved, reachOf });   // 它够得着我
    const mine = dangerRadiusOf(self, unit, { rules: resolved, reachOf });     // 我够得着它
    const lockedOn = isEngagingMe(unit, self, now, resolved);
    // 「迎上去」的距离：它已经能打到我，或者已经逼近到我愿意主动开打的距离
    const engageRange = Math.max(danger, resolved.engageReactionRange);
    foes.push({
      unit,
      id: unit.id,
      kind: unit.type ?? null,
      distance,
      power: Number.isFinite(threat.power) ? Number(threat.power) : unitCombatPower(unit),
      lockedOn,
      engaging: lockedOn && distance <= engageRange,
      tooClose: distance <= danger,
      // 「我也够得着它」——"遇上了就先打"那一档的触发条件（见 combatReflex）
      inMyReach: distance <= mine,
      dangerRadius: danger,
      engageRange
    });
  }
  // 近的排前面：`pickCombatFoe` 的"没有记忆时打最近的"直接吃这个顺序
  foes.sort((a, b) => a.distance - b.distance);
  return foes;
}

/** 当前血量比例。逃跑的"扛不住了"用的就是它。 */
export function healthRatioOf(self) {
  const max = Math.max(1, Number(self?.maxHealth) || 1);
  const health = Math.max(0, Number(self?.health) || 0);
  return Math.min(1, health / max);
}

/**
 * 打不打得过。
 *
 * 三个理由，按 Numen `AttackPlan.decide` 的顺序：
 *   ① `unarmed`   手上没有任何能打的东西（power 恒 0）——"没有武器就逃跑"是公式的必然结果；
 *   ② `wounded`   自己血量掉到 `minHealthRatio` 以下，站着打就是送；
 *   ③ `outmatched` 敌方（**只看正在打我的那些**）合计战力超过我。
 *
 * 合计而不是取最大值：抱团更危险由"多一个人就多一份战力"直接表达，
 * 不需要再编一个"每多一个人乘 1.5"的系数。**与距离无关**，
 * 所以同一只敌人在远处和近处得出同一个结论——这正是旧实现翻面的根因。
 */
export function outmatchedFor({ self, foes = [], gearPower = 0, engaged = false, rules = null } = {}) {
  const resolved = combatPlanRules(rules ?? {});
  const power = Math.max(0, Number(gearPower) || 0);
  const foePower = foes.reduce((sum, foe) => sum + Math.max(0, Number(foe?.power) || 0), 0);
  if (power <= 0) return { outmatched: true, reason: 'unarmed', power, foePower };
  if (healthRatioOf(self) <= resolved.minHealthRatio) {
    return { outmatched: true, reason: 'wounded', power, foePower };
  }
  const ratio = engaged ? resolved.disengagePowerRatio : resolved.engagePowerRatio;
  if (power < foePower * ratio) return { outmatched: true, reason: 'outmatched', power, foePower };
  return { outmatched: false, reason: 'stronger', power, foePower };
}

/** 这一只值不值得当目标（目前只有"还活着"；保留成函数是为了以后加"打不了的"规则）。 */
export function fightableFoe(foe) {
  return Boolean(foe?.unit?.alive !== false && foe.unit);
}

/**
 * 它算不算"这一场里的对手"。
 *
 * 两种都算，而且**必须一起算**：
 *   - `engaging`（它锁了我 / 刚打过我）——Numen 的定义；
 *   - `inMyReach`（它已经进了我的攻击距离）——"遇到了就先打"那一档。
 *
 * 只用 `engaging` 会让"遇上了先打"这一档开出一场空仗：
 * 触发进来了，可挑目标时列表是空的，于是判 DONE、站在原地不打也不动。
 */
export function isContactFoe(foe) {
  return foe?.engaging === true || foe?.inMyReach === true;
}

/**
 * 打谁。**先打近的，但选定之后打完再换**（Numen `AttackPlan.pick`）。
 *
 * 每刻按距离重选的话，一群敌人里"最近那只"每刻都在变，她永远在转向，
 * 而每次转向都会拆掉刚算好的寻路——这正是"互相拉扯"的观感来源之一。
 */
export function pickCombatFoe({ foes = [], last = null } = {}) {
  if (!foes.length) return null;
  const keepId = last?.foeId ?? null;
  if (keepId != null) {
    const kept = foes.find((foe) => foe.id === keepId);
    if (kept && fightableFoe(kept)) return kept;
  }
  // 没有承诺时打**最近的**。自己比一次距离，不假设调用方排过序——
  // 判据不该依赖一个"输入必须有序"的隐含契约。
  let best = null;
  for (let i = 0; i < foes.length; i += 1) {
    const foe = foes[i];
    if (!fightableFoe(foe)) continue;
    if (!best || Number(foe.distance) < Number(best.distance)) best = foe;
  }
  return best;
}

/**
 * 这一刻该做什么。
 *
 * 与旧实现最大的区别：**输入是整个局面 + 上一刻的决定**，而不是一个目标加一串距离。
 * `last` 提供两件东西——迟滞（目标退开一点点不该重新起步）与承诺（选中一只就打完再换）。
 *
 * @param self      傀儡单位（读 health / maxHealth / lastAttacker）
 * @param foes      `combatFoes()` 的结果
 * @param gearPower 当前装备的战力（`puppetCombatPower`）
 * @param engaged   这一帧是不是已经在打（决定用哪条战力线：迎战线还是脱离线）
 * @param cornered  退无可退（想跑但跑不掉）——这时"打不过"不再成立，只能硬着头皮上
 * @param last      上一刻的决定（`{foeId}`），第一次传 null
 */
export function decideCombatMove({
  self,
  foes = [],
  gearPower = 0,
  engaged = false,
  cornered = false,
  last = null,
  rules = null
} = {}) {
  const resolved = combatPlanRules(rules ?? {});
  // 判据只处理**这一场里的对手**：正在打我的，加上已经贴到我攻击距离的。
  // 旁边站着、还离得远的怪不算"我面对的战力"——它一动手（或一走近），下一刻自己会进这个列表。
  const contact = foes.filter(isContactFoe);
  const verdict = outmatchedFor({ self, foes: contact, gearPower, engaged, rules: resolved });

  // ① 扛不住 → 脱离接触，**但前提是真的有对手**：
  //    没有对手的时候"打不过"无从谈起（那只是"我现在很弱"），该回去干活而不是空跑一场。
  //    `cornered`（退无可退）时改为硬着头皮打——除了空手：
  //    空手 power 恒为 0，"硬着头皮打"只是站着挨打，所以它永远走脱离这一支。
  if (verdict.outmatched && contact.length > 0 && !(cornered && verdict.reason !== 'unarmed')) {
    return {
      action: COMBAT_ACTION.disengage,
      foeId: null,
      reason: verdict.reason,
      power: verdict.power,
      foePower: verdict.foePower,
      engaging: contact.length
    };
  }

  const foe = pickCombatFoe({ foes: contact, last });
  if (foe) {
    return {
      action: COMBAT_ACTION.skirmish,
      foeId: foe.id,
      reason: verdict.reason,
      distance: foe.distance,
      power: verdict.power,
      foePower: verdict.foePower,
      engaging: contact.length
    };
  }

  // ② 挑不出目标，但还有东西在追我 —— **这不是"打不过"**。
  //    Numen 原文点明这里曾经错判成 DISENGAGE："于是场上只剩一只点着的爬行者时，
  //    拿着下界合金剑的满血玩家直接跑三十二格"。照样走位，下一刻自会有目标。
  if (contact.length > 0) {
    return {
      action: COMBAT_ACTION.skirmish,
      foeId: null,
      reason: 'no-target',
      power: verdict.power,
      foePower: verdict.foePower,
      engaging: contact.length
    };
  }

  return {
    action: COMBAT_ACTION.done,
    foeId: null,
    reason: 'clear',
    power: verdict.power,
    foePower: verdict.foePower,
    engaging: 0
  };
}

/** 战力口径的统一出口：傀儡用装备后的战力，其它单位用自己的定义。 */
export function combatPowerOf({ unit, gear = null } = {}) {
  if (gear) {
    const definition = unit?.definition ?? {};
    return combatPower({
      damage: gear.damage,
      attackRate: gear.attackRate,
      maxHealth: definition.maxHealth,
      maxShield: definition.maxShield,
      armor: definition.armor
    });
  }
  return unitCombatPower(unit);
}
