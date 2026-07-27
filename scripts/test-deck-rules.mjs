import assert from 'node:assert/strict';
import { CARD_DEFINITIONS } from '../src/data/gameData.js';
import { validateDeckSelection } from '../src/systems/deckRules.js';

const unitCard = CARD_DEFINITIONS.find((card) => card.kind === 'summon');
const nonUnitCard = CARD_DEFINITIONS.find((card) => card.kind !== 'summon');

assert(unitCard, 'fixture requires a unit card');
assert(nonUnitCard, 'fixture requires a non-unit card');
assert.equal(validateDeckSelection([]).reason, 'deck_requires_card');
assert.equal(validateDeckSelection([nonUnitCard.id]).reason, 'deck_requires_unit_card');
assert.deepEqual(validateDeckSelection([unitCard.id]), { valid: true, reason: null });
assert.equal(validateDeckSelection([unitCard.id, unitCard.id]).reason, 'invalid_card_definition');
assert.equal(validateDeckSelection(['missing-card']).reason, 'invalid_card_definition');
assert.equal(
  validateDeckSelection(CARD_DEFINITIONS.filter((card) => !card.retired).map((card) => card.id)).valid,
  true,
  'a large owned-card deck remains valid when it includes a unit card'
);

console.log('deck rules regression passed');
