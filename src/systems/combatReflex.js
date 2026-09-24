// 傀儡的**反射层**：谁拿身体、什么时候交还（Numen `MobDefenseChain` + `SurvivalDecisions` 的移植）。
// 纯逻辑：不碰 THREE / DOM / Game，可以被 `test-combat-reflex.mjs` 无头单测。
//
// 反射的定义是「**抢占 + 归还**」：傀儡挖着矿被咬了，自卫反射拿走这一帧（甚至几秒），
// 打完把身体**原样**还回去接着挖——作业记录一个字段都不动。
// 这与"顶掉当前任务"是两件不同的事：顶掉之后那件活就真没了（进度清零、要重排），
// 而 Numen 的注释写得很清楚：`stop(PREEMPTED)` 明确不动逻辑字段。
//
// 三条从 Numen 抄来的硬规矩：
//
//   1. **触发用布尔，不用"我多想要身体"的浮点分**。
//      反射之间的先后是固定的（自卫永远压过作业），不随世界状态变；
//      让每个反射返回一个浮点数再挑最大的，就是用连续量表达一个固定序，
//      那些数字会变成必须小心维护却没人看得懂的魔法数（Numen `SurvivalDecisions` 原文）。
//   2. **危险离开之后还有一段冷静宽限**（`calmGraceSeconds`）。
//      没有它，一只跟傀儡几乎一样快的怪（狼 3.9 vs 傀儡 2.85）会在触发线上
//      一进一出，每进出一次就重开一场仗——用户报的「互相拉扯」。
//   3. **开打之后不设冷却、不设闹钟**：终点只有一个，"没人再追我"。
//      冷却只会在那几秒里让新出现的危险白打（Numen 实测四次重伤都发生在这个窗口）。
import { combatPlanRules, isContactFoe } from './combatPlan.js';

/** 身体的两个持有者。固定顺序：自卫永远优先于作业。 */
export const BODY_HOLDER = {
  selfDefense: 'selfDefense',
  workOrder: 'workOrder'
};

/** 战斗的两个阶段。 */
export const COMBAT_PHASE = {
  fight: 'fight',
  flee: 'flee'
};

/**
 * 自卫反射要不要醒（Numen `mobDefenseTriggered`）。
 *
 * 两条触发线，任意一条成立就接管：
 *
 * ① **它已经在打我，而且够得着我**（`engaging && tooClose`）。
 *    到了这一步就没有提前量了，当场接管。远处那些该不该打是玩家的事：
 *    傀儡在狼群边上砍树、只要没狼咬它，它就该继续砍。
 *
 * ② **它已经进了我自己的攻击距离**（`inMyReach`）——也就是"遇上了"。
 *    这一条是**刻意比 Numen 宽的**，理由写在需求里：用户原话是
 *    「在干其他活的时候遇到怪物也会先把怪物打了」。
 *    Numen 的同伴是 LLM 智能体，"要不要打路过的怪"由模型看着局面决定；
 *    我们的傀儡没有规划器，玩家也不该替它下每一道命令，所以"贴到能打的距离
 *    就顺手清掉"是这里更对的手感。半径只有自己的一击之距（傀儡约 2.2m），
 *    所以不会出现"8m 外的狼就让它丢下工作"——那正是用户第 4 轮报的毛病。
 *
 * 两条都不要求"附近有敌人"：威胁数组负责的是**选点**（去危险的地方干活），
 * 触发负责的是**打断**，两件事用的是两个半径，故意不合并。
 */
export function defenseTriggered({ foes = [] } = {}) {
  for (let i = 0; i < foes.length; i += 1) {
    const foe = foes[i];
    if (!foe) continue;
    if (foe.engaging && foe.tooClose) return true;
    if (foe.inMyReach) return true;
  }
  return false;
}

/**
 * 这一刻身体归谁。**固定顺序**：先看已经开着的战斗（打完再说），再看触发，最后看宽限期。
 *
 * `session` 非空就等于"这一场还没收场"——`canRun` 无条件成立，
 * 不再每帧重判一次"还要不要打"。这是"很干脆"的关键：一帧一变就是拉扯。
 */
export function shouldHoldForDefense({
  session = null,
  triggered = false,
  now = 0,
  calmSince = null,
  rules = null
} = {}) {
  if (session) return true;
  if (triggered) return true;
  const resolved = combatPlanRules(rules ?? {});
  return Number.isFinite(calmSince) && (Number(now) - Number(calmSince)) < resolved.calmGraceSeconds;
}

export function selectBodyHolder(options = {}) {
  return shouldHoldForDefense(options) ? BODY_HOLDER.selfDefense : BODY_HOLDER.workOrder;
}

/**
 * 战斗的终点：**这一刻没人再追我了**。
 *
 * "还有人"与触发用的是**同一个** `isContactFoe`（锁了我的 + 已经贴到我攻击距离的），
 * 否则会出现"触发线 ② 开起来的那一场永远收不掉"：傀儡正在打一只没锁它、
 * 但就站在它攻击距离里的怪，而只认 `engaging` 的话会立刻判"没人了"。
 *
 * ⚠️ 这里**刻意不带冷静宽限**。宽限只有一处，就是 `shouldHoldForDefense` 里那个
 * `calmGraceSeconds`（身体还归反射、但不新开一场）。两处都加会变成
 * **两次叠加**：实测"狼死后 3.95 秒才回去干活"（2 秒 + 2 秒），
 * 而 Numen 只有一处（`CALM_GRACE_TICKS` 挂在触发侧，战斗的终点是"没人再追我"）。
 *
 * 不用"血回到多少""打了多久"之类的判据：Numen 的注释点名过，
 * 给一个闹钟只会在打到一半时把她扔在原地。
 */
export function fightResolved({ foes = [] } = {}) {
  return !foes.some(isContactFoe);
}

/**
 * 逃跑**唯一**的终点判据：身边没有还在追的东西了。
 *
 * 刻意不接受两类"看起来更聪明"的判据，它们都被 Numen 点名否决过：
 *   - "威胁压力降下来了"——傀儡一跑起来，按定义压力就会降，所以起跑两秒就会被满足，
 *     而身后两格还跟着三只；
 *   - "还有没有人在逼近"——同理，追兵一旦比我快就不再缩短距离，判据必然成立。
 *
 * 传进来的是 `{unit}` 的列表（已经是 `fleeDistance` 之内、且过滤过不动的巢穴）。
 */
export function fleeResolved({ pursuers = [] } = {}) {
  return !pursuers.length;
}

/**
 * 逃跑的兜底阀门。
 *
 * 追兵**比傀儡快**的时候（狼 3.9 vs 傀儡 2.85）距离永远拉不开，
 * 而"跑出 aggroRange 就甩掉"要等很久——没有这个阀门就是"永远在跑"的活锁。
 * 到点了回去干活，危险节点由 `nodeIsWorkable` 挡着，不会走回危险区里。
 */
export function fleeTimedOut({ startedAt = 0, now = 0, rules = null } = {}) {
  const resolved = combatPlanRules(rules ?? {});
  return (Number(now) - Number(startedAt)) >= resolved.fleeMaxSeconds;
}

/**
 * 「退无可退」（Numen `cornered`）：想跑但一步都没动。
 *
 * 这是逃跑阶段唯一的"提前结束"理由，而且**一闩住就不再翻回来**：
 * 它会退到墙角、挪不动、转身打；不闩的话下一刻又判"跑步掉"、
 * 再撞回墙角，一帧一帧地抖动。
 */
export function corneredReached({ stuckSeconds = 0, rules = null } = {}) {
  const resolved = combatPlanRules(rules ?? {});
  return Number(stuckSeconds) >= resolved.corneredSeconds;
}

/**
 * 逃跑终点要数的是**追兵**，不是地点。
 *
 * 巢穴（`isSpawnPointNest`）在威胁数组里有固定强度，因为它是"危险地点"；
 * 但它不会追人。把它算进"身边还有没有威胁"的话，傀儡只要在巢穴 14m 之内
 * 就永远跑不完一趟——那不是甩掉追兵，那是地图上到处都有巢穴。
 */
export function isMobileThreat(unit) {
  return Boolean(unit) && unit.isSpawnPointNest !== true;
}
