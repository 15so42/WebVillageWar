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
  // 注意：这里是唯一维护牌组校验文案的地方。
  // 曾经有 deck_requires_unit_card（牌组必须含单位卡），该规则已随
  // 单英雄流派构筑（f764db4）移除——开局三选一直接给英雄，牌组不再需要单位卡，
  // 所以那一条文案也一并删掉，避免 ui 上出现永远不会被触发的提示。
  const messages = {
    deck_requires_card: '请至少选择 1 张卡牌。',
    invalid_card_definition: '牌组中包含无效或重复卡牌。'
  };
  return messages[validation?.reason] ?? '当前牌组不符合出战要求。';
}
