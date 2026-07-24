import assert from 'node:assert/strict';
import { pickAltarSpecializationChoices } from '../src/systems/altarRewardChoices.js';

const choices = [
  { unitType: 'knight', upgrade: { id: 'knight-a' } },
  { unitType: 'knight', upgrade: { id: 'knight-b' } },
  { unitType: 'archer', upgrade: { id: 'archer-a' } },
  { unitType: 'mage', upgrade: { id: 'mage-a' } },
  { unitType: 'spearman', upgrade: { id: 'spearman-a' } }
];
const fixedRandom = () => 0;

const enoughOwned = pickAltarSpecializationChoices(
  choices,
  new Set(['knight', 'archer']),
  3,
  fixedRandom
);
assert.equal(enoughOwned.length, 3);
assert.ok(enoughOwned.every((choice) => ['knight', 'archer'].includes(choice.unitType)));

const needsFallback = pickAltarSpecializationChoices(
  choices,
  new Set(['archer']),
  3,
  fixedRandom
);
assert.equal(needsFallback.length, 3);
assert.equal(needsFallback.filter((choice) => choice.unitType === 'archer').length, 1);
assert.equal(new Set(needsFallback.map((choice) => choice.upgrade.id)).size, 3);

const noOwnedTypes = pickAltarSpecializationChoices(
  choices,
  new Set(),
  3,
  fixedRandom
);
assert.equal(noOwnedTypes.length, 3);

const playerOneChoices = pickAltarSpecializationChoices(
  choices,
  new Set(['knight']),
  2,
  fixedRandom
);
const playerTwoChoices = pickAltarSpecializationChoices(
  choices,
  new Set(['mage', 'spearman']),
  2,
  fixedRandom
);
assert.ok(playerOneChoices.every((choice) => choice.unitType === 'knight'));
assert.ok(playerTwoChoices.every((choice) => ['mage', 'spearman'].includes(choice.unitType)));

const exhaustedPool = pickAltarSpecializationChoices(
  choices.slice(0, 2),
  new Set(['knight']),
  3,
  fixedRandom
);
assert.equal(exhaustedPool.length, 2);

console.log('altar specialization reward tests passed');
