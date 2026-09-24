// 采集挥击的纯逻辑：什么时候开始挥、哪一帧算"命中"、命中时该结算几次。
//
// 为什么单独一层：节奏算错的表现是"东西已经到手、动作还没落下去"，
// 或者"挥一次结算了两次货"——这两种在游戏里都很难复现，必须能单独断言。
//
// 这里刻意**不阻塞**采集进度的累积（那是 WorkSystem 的事）：
// 挥击只决定"产物与打击反馈在哪一帧落地"。如果让挥击把进度累积挡住，
// 一次采集就会变成「累积 1.6 秒 + 挥 0.9 秒」，采集速度直接掉三分之一。
// 所以 pending 是累加的：即使产物来得比动作快，也只是在下一次命中帧一起结算。
//
// 不碰 THREE / DOM / Game。
export const SWING_KIND = {
  chop: 'chop',
  mine: 'mine'
};

/** 用哪套挥击动作：拿镐就是挖，其余（斧、徒手）都是砍。 */
export function swingKindForTool(tool) {
  return tool === 'pickaxe' ? SWING_KIND.mine : SWING_KIND.chop;
}

function clamp01(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

/**
 * 从单位定义里读出某套挥击的时长与命中时刻（秒）。
 * 命中比例来自 `definition.art.timelines[kind].events.strike`，
 * 夹在 0.05..0.95 之间——写错成 0 或 1 会让命中帧落在动作的最边沿，
 * 表现成"还没抬手就出反馈"或者"动作播完了才出反馈"。
 */
export function workSwingTiming(definition, kind) {
  const timeline = definition?.art?.timelines?.[kind] ?? null;
  const fallbackDuration = kind === SWING_KIND.mine ? 0.75 : 0.9;
  const rawDuration = Number(timeline?.duration);
  const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : fallbackDuration;
  const strikeRatio = clamp01(timeline?.events?.strike ?? 0.45, 0.05, 0.95);
  return { duration, strikeAt: duration * strikeRatio, strikeRatio };
}

/** 一次挥击的运行状态。挂在作业记录上（每支傀儡一份）。 */
export function createWorkSwing() {
  return {
    kind: null,
    elapsed: 0,
    duration: 0,
    strikeAt: 0,
    /** 已经攒下、等着在命中帧一起结算的采集次数。 */
    pending: 0,
    struck: false
  };
}

export function isSwingActive(swing) {
  return Boolean(swing?.kind);
}

/**
 * 开始一次挥击。已经有一套在挥时**不打断**，只把次数累加进去——
 * 打断会让动作看起来一顿一顿的，而且会让已经攒下的产物失去落点。
 */
export function startSwing(swing, { kind, duration, strikeAt, completions = 1 }) {
  if (!swing || !kind) return swing;
  const pending = Math.max(0, Math.floor(Number(completions) || 0));
  if (isSwingActive(swing)) {
    swing.pending += pending;
    return swing;
  }
  swing.kind = kind;
  swing.elapsed = 0;
  swing.duration = Math.max(0.01, Number(duration) || 0.5);
  swing.strikeAt = Math.min(swing.duration, Math.max(0, Number(strikeAt) || swing.duration * 0.45));
  swing.pending = pending;
  swing.struck = false;
  return swing;
}

/** 挥击进行中又攒到新的采集次数：只记账，等下一次命中帧一起结算。 */
export function queueSwingCompletions(swing, completions) {
  if (!swing) return swing;
  const pending = Math.max(0, Math.floor(Number(completions) || 0));
  if (!isSwingActive(swing)) return swing;
  swing.pending += pending;
  return swing;
}

/**
 * 推进挥击。返回这一次推进里"是否刚好跨过命中帧"以及该结算几次。
 *
 * 命中判定放在结束判定**之前**：一段 dt 很长（比如卡了一帧）时，
 * 同一次推进可能既跨过命中帧又跨过结束，这种时候必须仍然结算，
 * 否则那次采集就凭空消失了。
 */
export function advanceSwing(swing, dt) {
  if (!isSwingActive(swing)) {
    return { active: false, struck: false, completions: 0, finished: false, progress: 0 };
  }
  const step = Math.max(0, Number(dt) || 0);
  swing.elapsed = Math.min(swing.duration, swing.elapsed + step);

  let completions = 0;
  if (!swing.struck && swing.elapsed >= swing.strikeAt) {
    swing.struck = true;
    completions = Math.max(0, Math.floor(swing.pending));
    swing.pending -= completions;
  }

  const finished = swing.elapsed >= swing.duration - 1e-9;
  if (finished && swing.pending > 0) {
    // 收尾时还有积压（产物来得比动作快）：动作已经播完，东西不能悬在半空，
    // 就在这一帧一起结算。所以"一次挥击结束后 pending 一定为 0"是个不变式。
    completions += Math.max(0, Math.floor(swing.pending));
    swing.pending = 0;
  }
  const progress = swing.duration > 0 ? swing.elapsed / swing.duration : 1;
  if (finished) {
    swing.kind = null;
    swing.elapsed = 0;
  }
  return {
    active: !finished,
    struck: completions > 0,
    completions,
    finished,
    progress
  };
}

/** 中断（采空、被打断、背包满、换任务）：把没结算的次数一并交回调用方。 */
export function cancelSwing(swing) {
  if (!swing) return 0;
  const leftover = isSwingActive(swing) && !swing.struck ? Math.max(0, Math.floor(swing.pending)) : 0;
  swing.kind = null;
  swing.elapsed = 0;
  swing.pending = 0;
  swing.struck = false;
  return leftover;
}
