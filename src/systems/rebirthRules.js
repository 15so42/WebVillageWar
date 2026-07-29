const AUTO_REBIRTH_START_SECONDS = 15;
const AUTO_REBIRTH_MAX_SECONDS = 75;
const AUTO_REBIRTH_TIME_STEP_SECONDS = 60;
const AUTO_REBIRTH_SECONDS_PER_STEP = 5;
const SELF_DESTRUCT_REBIRTH_REDUCTION_PER_LEVEL = 0.05;
const SELF_DESTRUCT_REBIRTH_MAX_REDUCTION = 0.9;

export function autoRebirthDurationFor(elapsedTime = 0, selfDestructLevel = 0) {
  const elapsedSeconds = Math.max(0, Number(elapsedTime) || 0);
  const baseDuration = Math.min(
    AUTO_REBIRTH_MAX_SECONDS,
    AUTO_REBIRTH_START_SECONDS
      + Math.floor(elapsedSeconds / AUTO_REBIRTH_TIME_STEP_SECONDS) * AUTO_REBIRTH_SECONDS_PER_STEP
  );
  const level = Math.max(0, Math.floor(Number(selfDestructLevel) || 0));
  const reduction = Math.min(
    SELF_DESTRUCT_REBIRTH_MAX_REDUCTION,
    level * SELF_DESTRUCT_REBIRTH_REDUCTION_PER_LEVEL
  );
  return Math.round(baseDuration * (1 - reduction) * 1000) / 1000;
}
