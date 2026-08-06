import assert from 'node:assert/strict';
import { upgradeCost } from '../src/systems/MetaGameSystem.js';

assert.equal(upgradeCost('barbarians', 1), 100);
assert.equal(upgradeCost('self-destruct-enchant', 1), 100);
assert.equal(upgradeCost('barbarians', 2), 200);
assert.equal(upgradeCost('self-destruct-enchant', 3), 400);

console.log('Meta workshop upgrade pricing checks passed.');
