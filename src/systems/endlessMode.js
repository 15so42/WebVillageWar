export const CHALLENGE_MODE = Object.freeze({
  STANDARD: 'standard',
  ENDLESS: 'endless'
});

const LIFETIME_PROFILES = Object.freeze({
  normal: {
    targetSeconds: 20,
    referenceHealth: 18,
    minSeconds: 10,
    maxSeconds: 40,
    maxGain: 2,
    maxLoss: 0.15
  },
  elite: {
    targetSeconds: 35,
    referenceHealth: 64,
    minSeconds: 25,
    maxSeconds: 60,
    maxGain: 4.5,
    maxLoss: 0.35
  },
  boss: {
    targetSeconds: 70,
    referenceHealth: 150,
    minSeconds: 50,
    maxSeconds: 110,
    maxGain: 10,
    maxLoss: 0.8
  }
});

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

export function endlessDifficultyDelta({
  lifetime,
  expectedLifetime,
  enemyClass = 'normal'
} = {}) {
  const profile = LIFETIME_PROFILES[enemyClass] ?? LIFETIME_PROFILES.normal;
  const safeLifetime = Math.max(0.25, Number(lifetime) || 0.25);
  const safeExpected = Math.max(0.25, Number(expectedLifetime) || profile.targetSeconds);
  const timeScore = clamp((safeExpected / safeLifetime) - 1, -1, 16);
  const delta = timeScore >= 0
    ? (timeScore / 16) * profile.maxGain
    : timeScore * profile.maxLoss;
  return roundTo(delta, 4);
}

export function applyEndlessDifficulty(currentDifficulty, delta) {
  const current = Number.isFinite(Number(currentDifficulty)) ? Number(currentDifficulty) : 0;
  const change = Number.isFinite(Number(delta)) ? Number(delta) : 0;
  return roundTo(current + change, 2);
}

export function endlessEnemyStatFactors(difficulty) {
  const value = Number.isFinite(Number(difficulty)) ? Number(difficulty) : 0;
  return {
    health: Math.max(0.1, 1 + value * 0.11),
    damage: Math.max(0.1, 1 + value * 0.1)
  };
}

export function endlessEnchantCount(difficulty) {
  const value = Number.isFinite(Number(difficulty)) ? Number(difficulty) : 0;
  if (value >= 7) return 3;
  if (value >= 3) return 2;
  return 1;
}

export function endlessEnchantLevel(difficulty) {
  const value = Number.isFinite(Number(difficulty)) ? Number(difficulty) : 0;
  return 1 + Math.floor(Math.max(0, value) / 2);
}

export function calculateEndlessReward(difficulty, rewardMultiplier = 1) {
  const baseReward = Math.max(0, Math.floor(Number(difficulty) || 0));
  const multiplier = Math.max(0, Number(rewardMultiplier) || 0);
  return Math.round(baseReward * multiplier);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
