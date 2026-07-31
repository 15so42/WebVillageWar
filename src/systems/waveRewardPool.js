/**
 * Wave rewards consume the selected card definition from the reward deck.
 * Every card — including summon cards — can only be obtained once per run;
 * the reward pool shrinks until it is exhausted ("牌已发光").
 */
export function shouldConsumeWaveRewardCard(choice) {
  if (choice?.rewardSource !== 'wave-reward-deck' || choice.action !== 'add-card') return false;
  return true;
}
