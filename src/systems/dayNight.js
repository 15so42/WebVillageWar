/**
 * 生存关昼夜循环（纯规则，不碰 THREE / DOM）。
 *
 * 用户定稿：白天 5 分钟 + 黑夜 3 分钟；怪物只在黑夜出兵，随天数变多、变强。
 * 白天采集、建设、清点巢穴；入夜后刷怪点才产敌。已放出来的敌人白天不会凭空消失。
 */
export const DAY_NIGHT_PHASE = {
  day: 'day',
  night: 'night'
};

export const DAY_NIGHT_RULES = {
  daySeconds: 5 * 60,
  nightSeconds: 3 * 60,
  // 等了整个白天之后，入夜不必再把开局那 8 秒初始延迟走完
  nightfallDelaySeconds: 2,
  // 夜袭只抬难度，不再给每个刷怪点额外加存活上限或同批数量
  extraAlivePerNight: 0,
  difficultyPerNight: 0.25,
  extraPerTickEveryNights: 99
};

export function dayNightRules(overrides = {}) {
  const next = { ...DAY_NIGHT_RULES, ...(overrides ?? {}) };
  next.daySeconds = Math.max(1, Number(next.daySeconds) || DAY_NIGHT_RULES.daySeconds);
  next.nightSeconds = Math.max(1, Number(next.nightSeconds) || DAY_NIGHT_RULES.nightSeconds);
  next.nightfallDelaySeconds = Math.max(0, Number(next.nightfallDelaySeconds) || 0);
  next.extraAlivePerNight = Math.max(0, Math.floor(Number(next.extraAlivePerNight) || 0));
  next.difficultyPerNight = Math.max(0, Number(next.difficultyPerNight) || 0);
  next.extraPerTickEveryNights = Math.max(1, Math.floor(Number(next.extraPerTickEveryNights) || 2));
  return next;
}

export function createDayNightState(overrides = {}) {
  const rules = dayNightRules(overrides);
  return {
    rules,
    dayNumber: 1,
    phase: DAY_NIGHT_PHASE.day,
    phaseElapsed: 0,
    cycleElapsed: 0,
    justChanged: false,
    previousPhase: DAY_NIGHT_PHASE.day
  };
}

export function phaseDuration(state) {
  const rules = state?.rules ?? DAY_NIGHT_RULES;
  return state?.phase === DAY_NIGHT_PHASE.night ? rules.nightSeconds : rules.daySeconds;
}

export function phaseRemaining(state) {
  return Math.max(0, phaseDuration(state) - Math.max(0, Number(state?.phaseElapsed) || 0));
}

export function isNight(state) {
  return state?.phase === DAY_NIGHT_PHASE.night;
}

export function canRaidSpawn(state) {
  return isNight(state);
}

/**
 * 第 N 夜的出兵加量。第 1 夜不加；第 2 夜起存活上限与难度上升。
 * 同批数量每 extraPerTickEveryNights 夜才 +1，避免一夜之间变成倾泻。
 */
export function nightRaidModifiers(dayNumber, rules = DAY_NIGHT_RULES) {
  const resolved = dayNightRules(rules);
  const night = Math.max(1, Math.floor(Number(dayNumber) || 1));
  const nightsAfterFirst = Math.max(0, night - 1);
  return {
    extraAlive: nightsAfterFirst * resolved.extraAlivePerNight,
    extraPerTick: Math.floor(nightsAfterFirst / resolved.extraPerTickEveryNights),
    difficulty: 1 + nightsAfterFirst * resolved.difficultyPerNight
  };
}

export function advanceDayNight(state, dt = 0) {
  if (!state) return null;
  const step = Math.max(0, Number(dt) || 0);
  state.justChanged = false;
  state.previousPhase = state.phase;
  if (step <= 0) return snapshotDayNight(state);

  state.cycleElapsed = Math.max(0, Number(state.cycleElapsed) || 0) + step;
  state.phaseElapsed = Math.max(0, Number(state.phaseElapsed) || 0) + step;
  const duration = phaseDuration(state);
  if (state.phaseElapsed + 1e-9 >= duration) {
    const overflow = state.phaseElapsed - duration;
    if (state.phase === DAY_NIGHT_PHASE.day) {
      state.phase = DAY_NIGHT_PHASE.night;
    } else {
      state.phase = DAY_NIGHT_PHASE.day;
      state.dayNumber = Math.max(1, Math.floor(Number(state.dayNumber) || 1) + 1);
    }
    state.phaseElapsed = Math.max(0, overflow);
    state.justChanged = true;
  }
  return snapshotDayNight(state);
}

export function snapshotDayNight(state) {
  const remaining = phaseRemaining(state);
  const duration = phaseDuration(state);
  return {
    dayNumber: Math.max(1, Math.floor(Number(state?.dayNumber) || 1)),
    phase: state?.phase === DAY_NIGHT_PHASE.night ? DAY_NIGHT_PHASE.night : DAY_NIGHT_PHASE.day,
    isNight: isNight(state),
    phaseElapsed: Math.max(0, Number(state?.phaseElapsed) || 0),
    phaseRemaining: remaining,
    phaseDuration: duration,
    cycleElapsed: Math.max(0, Number(state?.cycleElapsed) || 0),
    justChanged: state?.justChanged === true,
    previousPhase: state?.previousPhase ?? state?.phase ?? DAY_NIGHT_PHASE.day,
    raid: nightRaidModifiers(state?.dayNumber, state?.rules)
  };
}

/** 0 = 正午，1 = 深夜。交界附近平滑过渡，避免灯光硬切。 */
export function nightBlend(state, fadeSeconds = 8) {
  const fade = Math.max(0.25, Number(fadeSeconds) || 8);
  const remaining = phaseRemaining(state);
  if (isNight(state)) {
    if (remaining <= fade) return clamp01(remaining / fade);
    return 1;
  }
  if (remaining <= fade) return 1 - clamp01(remaining / fade);
  return 0;
}

export function skipToPhase(state, phase, { dayNumber = null } = {}) {
  if (!state) return null;
  const next = phase === DAY_NIGHT_PHASE.night ? DAY_NIGHT_PHASE.night : DAY_NIGHT_PHASE.day;
  state.previousPhase = state.phase;
  state.justChanged = state.phase !== next;
  state.phase = next;
  state.phaseElapsed = 0;
  if (dayNumber != null) state.dayNumber = Math.max(1, Math.floor(Number(dayNumber) || 1));
  return snapshotDayNight(state);
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}
