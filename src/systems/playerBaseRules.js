export function resolveStructureDamage(amount, {
  isAttack = false,
  attackDamage = 1
} = {}) {
  if (isAttack) {
    return Math.max(0, Number(attackDamage) || 0);
  }
  return Math.max(0, Number(amount) || 0);
}

export function resolvePlayerBaseDamage(amount, options = {}) {
  return resolveStructureDamage(amount, options);
}

export function consumeBaseHealthLossMilestones(
  currentProgress,
  healthLost,
  threshold = 10
) {
  const safeThreshold = Math.max(0.01, Number(threshold) || 10);
  const total = Math.max(0, Number(currentProgress) || 0)
    + Math.max(0, Number(healthLost) || 0);
  const milestones = Math.floor((total + Number.EPSILON) / safeThreshold);
  return {
    milestones,
    progress: total - milestones * safeThreshold
  };
}
