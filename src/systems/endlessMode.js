export const CHALLENGE_MODE = Object.freeze({
  STANDARD: 'standard',
  ENDLESS: 'endless'
});

const LIFETIME_PROFILES = Object.freeze({
  normal: {
    targetSeconds: 5,
    referenceHealth: 18,
    minSeconds: 2.5,
    maxSeconds: 10,
    maxGain: 2
  },
  elite: {
    targetSeconds: 8.75,
    referenceHealth: 64,
    minSeconds: 6.25,
    maxSeconds: 15,
    maxGain: 4.5
  },
  boss: {
    targetSeconds: 17.5,
    referenceHealth: 150,
    minSeconds: 12.5,
    maxSeconds: 27.5,
    maxGain: 10
  }
});

const DIFFICULTY_GAIN_MULTIPLIER = 0.42;
const ENDLESS_REWARD_PER_DIFFICULTY = 6;
const ENDLESS_REWARD_TIME_STEP_SECONDS = 600;
const ENDLESS_REWARD_TIME_STEP_BONUS = 0.05;
const ENDLESS_REWARD_MAX_TIME_MULTIPLIER = 1.3;
const DIFFICULTY_DELTA_REFERENCE_HEALTH = 90;
const MIN_DIFFICULTY_HEALTH_WEIGHT = 0.05;
const MAX_DIFFICULTY_HEALTH_WEIGHT = 4;
const FAST_KILL_PERFORMANCE_GAIN = 0.1;
const SLOW_KILL_PERFORMANCE_LOSS = 0.05;
const PLAYER_UNIT_DEATH_PERFORMANCE_LOSS = 0.1;

export function normalizeChallengeMode(value) {
  return value === CHALLENGE_MODE.ENDLESS
    ? CHALLENGE_MODE.ENDLESS
    : CHALLENGE_MODE.STANDARD;
}

export function isEndlessMode(value) {
  return normalizeChallengeMode(value) === CHALLENGE_MODE.ENDLESS;
}

export function resetEndlessDeckLevels(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.map((card) => (
    card && typeof card === 'object'
      ? { ...card, level: 1 }
      : card
  ));
}

export function endlessEnemyClass(unit = {}) {
  if (unit.isBoss) return 'boss';
  if (unit.isElite) return 'elite';
  return 'normal';
}

export function endlessExpectedLifetime({
  baseHealth,
  enemyClass = 'normal'
} = {}) {
  const profile = LIFETIME_PROFILES[enemyClass] ?? LIFETIME_PROFILES.normal;
  const health = Math.max(0.01, Number(baseHealth) || profile.referenceHealth);
  return clamp(
    profile.targetSeconds * Math.sqrt(health / profile.referenceHealth),
    profile.minSeconds,
    profile.maxSeconds
  );
}

export function endlessDifficultyReferenceHealth(unit = {}) {
  const definitionHealth = Number(unit?.definition?.maxHealth);
  const actualHealth = Number(unit?.maxHealth);
  if (Number.isFinite(definitionHealth) && definitionHealth > 0) return definitionHealth;
  if (Number.isFinite(actualHealth) && actualHealth > 0) return actualHealth;
  return 0.01;
}

export function endlessDifficultyDelta({
  baseHealth,
  enemyClass = 'normal',
  performanceMultiplier = 1
} = {}) {
  const enemyDifficulty = endlessEnemyDifficultyValue({ baseHealth, enemyClass });
  const multiplier = Number.isFinite(Number(performanceMultiplier))
    ? Number(performanceMultiplier)
    : 1;
  return roundTo(enemyDifficulty * multiplier, 4);
}

export function endlessEnemyDifficultyValue({
  baseHealth,
  enemyClass = 'normal'
} = {}) {
  const profile = LIFETIME_PROFILES[enemyClass] ?? LIFETIME_PROFILES.normal;
  const health = Math.max(0.01, Number(baseHealth) || profile.referenceHealth);
  const healthWeight = clamp(
    health / DIFFICULTY_DELTA_REFERENCE_HEALTH,
    MIN_DIFFICULTY_HEALTH_WEIGHT,
    MAX_DIFFICULTY_HEALTH_WEIGHT
  );
  return roundTo(profile.maxGain * DIFFICULTY_GAIN_MULTIPLIER * healthWeight, 4);
}

export function endlessKillPerformanceDelta({
  lifetime,
  expectedLifetime,
  enemyClass = 'normal'
} = {}) {
  const profile = LIFETIME_PROFILES[enemyClass] ?? LIFETIME_PROFILES.normal;
  const safeExpected = Math.max(0.25, Number(expectedLifetime) || profile.targetSeconds);
  const rawLifetime = Number(lifetime);
  const safeLifetime = Number.isFinite(rawLifetime) ? Math.max(0, rawLifetime) : safeExpected;
  const lifetimeRatio = safeLifetime / safeExpected;
  if (lifetimeRatio <= 1) {
    return roundTo((1 - lifetimeRatio) * FAST_KILL_PERFORMANCE_GAIN, 4);
  }
  return roundTo(-Math.min(
    SLOW_KILL_PERFORMANCE_LOSS,
    (lifetimeRatio - 1) * SLOW_KILL_PERFORMANCE_LOSS
  ), 4);
}

export function applyEndlessPerformanceMultiplier(currentMultiplier, delta) {
  const current = Number.isFinite(Number(currentMultiplier)) ? Number(currentMultiplier) : 1;
  const change = Number.isFinite(Number(delta)) ? Number(delta) : 0;
  return roundTo(current + change, 2);
}

export function resolveEndlessEnemyDefeat({
  baseHealth,
  lifetime,
  expectedLifetime,
  enemyClass = 'normal',
  performanceMultiplier = 1
} = {}) {
  const performanceDelta = endlessKillPerformanceDelta({ lifetime, expectedLifetime, enemyClass });
  const nextPerformanceMultiplier = applyEndlessPerformanceMultiplier(
    performanceMultiplier,
    performanceDelta
  );
  const enemyDifficulty = endlessEnemyDifficultyValue({ baseHealth, enemyClass });
  return {
    performanceDelta,
    performanceMultiplier: nextPerformanceMultiplier,
    enemyDifficulty,
    difficultyDelta: roundTo(enemyDifficulty * nextPerformanceMultiplier, 4)
  };
}

export function applyEndlessDifficulty(currentDifficulty, delta) {
  const current = Number.isFinite(Number(currentDifficulty)) ? Number(currentDifficulty) : 0;
  const change = Number.isFinite(Number(delta)) ? Number(delta) : 0;
  return roundTo(current + change, 2);
}

export function endlessPlayerUnitDeathPerformanceDelta() {
  return -PLAYER_UNIT_DEATH_PERFORMANCE_LOSS;
}

export function endlessEnemyStatFactors(difficulty) {
  const value = Number.isFinite(Number(difficulty)) ? Number(difficulty) : 0;
  return {
    health: Math.max(0.1, 1 + value * 0.11),
    damage: Math.max(0.1, 1 + value * 0.1)
  };
}

export function endlessEnchantCount(difficulty, {
  enemyClass = 'normal',
  seed = 0
} = {}) {
  const value = Math.max(0, Number(difficulty) || 0);
  const roll = endlessEnchantRoll(seed, enemyClass, 0);
  if (enemyClass === 'boss') {
    // Bosses carry a small, reliable package instead of inheriting the full
    // normal-wave quota. The third slot remains an occasional late-game twist.
    const thirdSlotChance = Math.min(0.52, 0.18 + value * 0.025);
    return roll < thirdSlotChance ? 3 : 2;
  }
  if (enemyClass === 'elite') {
    const secondSlotChance = Math.min(0.58, 0.2 + value * 0.03);
    return roll < secondSlotChance ? 2 : 1;
  }

  // Most regular troops stay readable. Difficulty raises the chance of one
  // defining enchantment, never the number of stacked enchantments.
  const singleSlotChance = Math.min(0.62, 0.28 + value * 0.025);
  return roll < singleSlotChance ? 1 : 0;
}

export function endlessEnchantLevel(difficulty, {
  enemyClass = 'normal',
  slotIndex = 0,
  seed = 0
} = {}) {
  const value = Math.max(0, Number(difficulty) || 0);
  const minimum = enemyClass === 'boss' ? 2 : 1;
  const softCap = enemyClass === 'boss'
    ? 4
    : enemyClass === 'elite'
      ? 3
      : 2;
  const rawLevel = minimum + Math.floor(value / 5);
  const softCappedLevel = rawLevel <= softCap
    ? rawLevel
    : softCap + Math.floor(Math.log2(rawLevel - softCap + 1) / 2);
  const roll = endlessEnchantRoll(seed, enemyClass, slotIndex + 1);
  const variation = roll < 0.2 ? -1 : roll > 0.84 ? 1 : 0;
  return Math.max(1, softCappedLevel + variation);
}

export function calculateEndlessReward(difficulty, elapsedTimeOrMultiplier = 0, maybeRewardMultiplier = 1) {
  // Keep the old two-argument form for saved/network results while allowing
  // the authoritative finish calculation to account for time invested.
  const usesLegacySignature = arguments.length < 3;
  const elapsedTime = usesLegacySignature ? 0 : elapsedTimeOrMultiplier;
  const rewardMultiplier = usesLegacySignature ? elapsedTimeOrMultiplier : maybeRewardMultiplier;
  const baseReward = Math.max(0, Number(difficulty) || 0) * ENDLESS_REWARD_PER_DIFFICULTY;
  const multiplier = Math.max(0, Number(rewardMultiplier) || 0);
  const elapsedSeconds = Math.max(0, Number(elapsedTime) || 0);
  const timeMultiplier = Math.min(
    ENDLESS_REWARD_MAX_TIME_MULTIPLIER,
    1 + Math.floor(elapsedSeconds / ENDLESS_REWARD_TIME_STEP_SECONDS) * ENDLESS_REWARD_TIME_STEP_BONUS
  );
  return Math.round(baseReward * timeMultiplier * multiplier);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function endlessEnchantRoll(seed, enemyClass, salt) {
  const classSalt = enemyClass === 'boss'
    ? 0x45d9f3b
    : enemyClass === 'elite'
      ? 0x27d4eb2d
      : 0x165667b1;
  let value = (Math.floor(Number(seed) || 0) ^ classSalt ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0x100000000;
}
