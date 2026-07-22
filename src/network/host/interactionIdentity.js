export function ensureInteractionIdentity(container, {
  matchId = 'match',
  playerId = 'player',
  kind = 'choice',
  revision = null
} = {}) {
  if (!container) return null;
  container.networkRevision = revision ?? container.networkRevision ?? 1;
  container.networkInteractionId = container.networkInteractionId
    ?? `${matchId}:${playerId}:${kind}`;
  const choices = container.choices ?? container.runShopChoices ?? [];
  choices.forEach((choice, index) => {
    if (choice.networkChoiceRevision !== container.networkRevision) {
      choice.choiceId = `${container.networkInteractionId}:revision:${container.networkRevision}:choice:${index}`;
      choice.networkChoiceRevision = container.networkRevision;
    }
  });
  return {
    interactionId: container.networkInteractionId,
    revision: container.networkRevision
  };
}

export function findChoiceIndex(container, choiceId) {
  if (!container || !choiceId) return -1;
  return (container.choices ?? []).findIndex((choice) => choice?.choiceId === choiceId);
}
