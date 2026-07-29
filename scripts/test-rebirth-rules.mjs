import assert from 'node:assert/strict';
import { autoRebirthDurationFor } from '../src/systems/rebirthRules.js';

assert.equal(autoRebirthDurationFor(0), 15);
assert.equal(autoRebirthDurationFor(11 * 60), 70);
assert.equal(autoRebirthDurationFor(12 * 60), 75);
assert.equal(autoRebirthDurationFor(60 * 60), 75);
assert.equal(autoRebirthDurationFor(0, 1), 14.25);
assert.equal(autoRebirthDurationFor(12 * 60, 18), 7.5);
assert.equal(autoRebirthDurationFor(12 * 60, 99), 7.5);

console.log('rebirth rule checks passed');
