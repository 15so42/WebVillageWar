/**
 * Wave rewards normally consume the selected card definition. Summon cards
 * are intentionally exempt: they are one-shot cards in the actual draw pile,
 * so later waves may offer the same unit again. This does not affect the
 * separate run-shop inventory.
 */
export function shouldConsumeWaveRewardCard(choice) {
  if (choice?.rewardSource !== 'wave-reward-deck' || choice.action !== 'add-card') return false;
  return choice.card?.kind !== 'summon';
}
