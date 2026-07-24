export function scaleResourceAfterMaximumChange(currentValue, previousMaximum, nextMaximum) {
  const next = Math.max(0, Number(nextMaximum) || 0);
  if (next <= 0) return 0;

  const current = Math.max(0, Number(currentValue) || 0);
  const previous = Math.max(0, Number(previousMaximum) || 0);
  if (previous <= 0) return Math.min(current, next);

  const ratio = Math.min(1, current / previous);
  return Math.min(next, next * ratio);
}
