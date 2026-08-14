import { CARD_DEFINITIONS } from '../data/gameData.js';

export const MIN_DECK_SIZE = 1;

const CARD_BY_ID = new Map(CARD_DEFINITIONS.map((card) => [card.id, card]));

export function validateDeckSelection(deck) {
  if (!Array.isArray(deck) || deck.length < MIN_DECK_SIZE) {
    return { valid: false, reason: 'deck_requires_card' };
  }
  const ids = deck.map((entry) => (typeof entry === 'string' ? entry : entry?.id));
  if (ids.some((id) => !id || !CARD_BY_ID.has(id)) || new Set(ids).size !== ids.length) {
    return { valid: false, reason: 'invalid_card_definition' };
  }
  return { valid: true, reason: null };
}

export function deckValidationMessage(validation) {
  const messages = {
    deck_requires_card: '请至少选择 1 张卡牌。',
    invalid_card_definition: '牌组中包含无效或重复卡牌。',
    deck_requires_unit_card: '牌组中至少需要 1 张单位卡。'
  };
  return messages[validation?.reason] ?? '当前牌组不符合出战要求。';
}
