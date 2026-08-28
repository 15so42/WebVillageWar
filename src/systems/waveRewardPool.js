/**
 * Wave rewards consume the selected card definition from the reward deck.
 * Every card — including summon cards — can only be obtained once per run;
 * the reward pool shrinks until it is exhausted ("牌已发光").
 */
export function shouldConsumeWaveRewardCard(choice, eventType = null, remainingIds = null) {
  if (choice?.action !== 'add-card') return false;
  if (choice.rewardSource === 'wave-reward-deck') return true;
  if (eventType !== 'wave-reward') return false;
  const cardId = choice.card?.cardDefinitionId ?? choice.card?.id;
  if (!cardId || !Array.isArray(remainingIds)) return false;
  return remainingIds.includes(cardId);
}

export function waveRewardUnitCards(definitions = []) {
  return (Array.isArray(definitions) ? definitions : []).filter((card) => (
    card?.kind === 'summon'
    && Boolean(card.unitType)
    && card.lootOnly !== true
    && card.retired !== true
  ));
}

export function createWaveRewardDeckIds(deck = [], definitions = []) {
  const seen = new Set();
  const result = [];
  const addCardId = (entry) => {
    const id = typeof entry === 'string'
      ? entry
      : (entry?.cardDefinitionId ?? entry?.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  };
  (Array.isArray(deck) ? deck : []).forEach(addCardId);
  waveRewardUnitCards(definitions).forEach(addCardId);
  return result;
}
