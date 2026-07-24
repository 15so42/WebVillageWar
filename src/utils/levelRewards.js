export function calculateLevelReward({ level, difficulty, elapsedTime, rewardMultiplier = 1 } = {}) {
  const targetTime = Math.max(30, Number(level?.targetTime) || 180);
  const safeElapsedTime = Math.max(0, Number(elapsedTime) || 0);
  const safeDifficulty = Math.max(1, Number(difficulty) || 1);
  const speedBonus = Math.max(0, (targetTime - safeElapsedTime) / targetTime);
  const speedMultiplier = 1 + Math.min(0.6, speedBonus * 0.6);
  const difficultyMultiplier = 1 + (safeDifficulty - 1) * 0.45;
  const abilityMultiplier = Math.max(0, Number(rewardMultiplier) || 1);
  return Math.max(1, Math.round(
    (Number(level?.baseReward) || 0) * difficultyMultiplier * speedMultiplier * abilityMultiplier
  ));
}
