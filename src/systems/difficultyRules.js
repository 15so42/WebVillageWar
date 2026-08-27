export const ENEMY_DIFFICULTY_STAT_SCALE = 0.6;
export const STANDARD_ENEMY_HEALTH_PER_DIFFICULTY = 0.11;
export const STANDARD_ENEMY_DAMAGE_PER_DIFFICULTY = 0.1;

export function standardEnemyStatFactors(difficulty) {
  const value = Math.max(1, finiteNumber(difficulty, 1));
  return {
    health: ENEMY_DIFFICULTY_STAT_SCALE * (
      1 + (value - 1) * STANDARD_ENEMY_HEALTH_PER_DIFFICULTY
    ),
    damage: ENEMY_DIFFICULTY_STAT_SCALE * (
      1 + (value - 1) * STANDARD_ENEMY_DAMAGE_PER_DIFFICULTY
    )
  };
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
