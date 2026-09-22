import assert from 'node:assert/strict';
import { CARD_DEFINITIONS } from '../src/data/gameData.js';
import { validateDeckSelection } from '../src/systems/deckRules.js';

const unitCard = CARD_DEFINITIONS.find((card) => card.kind === 'summon');
const nonUnitCard = CARD_DEFINITIONS.find((card) => card.kind !== 'summon');

assert(unitCard, 'fixture requires a unit card');
assert(nonUnitCard, 'fixture requires a non-unit card');
assert.equal(validateDeckSelection([]).reason, 'deck_requires_card');
// 「牌组必须含单位卡」这条规则在 f764db4（单英雄流派构筑）里被有意移除：
// 现在开局会三选一送英雄，牌组本身只放专精/附魔卡，所以纯非单位卡牌组必须合法。
// 旧断言要求这里报 deck_requires_unit_card，是那次改版之前的行为。
assert.deepEqual(
  validateDeckSelection([nonUnitCard.id]),
  { valid: true, reason: null },
  '单英雄改版后，不含单位卡的牌组是合法的'
);
assert.deepEqual(validateDeckSelection([unitCard.id]), { valid: true, reason: null });
assert.equal(validateDeckSelection([unitCard.id, unitCard.id]).reason, 'invalid_card_definition');
assert.equal(validateDeckSelection(['missing-card']).reason, 'invalid_card_definition');
assert.equal(
  validateDeckSelection(CARD_DEFINITIONS.filter((card) => !card.retired).map((card) => card.id)).valid,
  true,
  'a large owned-card deck remains valid when it includes a unit card'
);

console.log('deck rules regression passed');
