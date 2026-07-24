import assert from 'node:assert/strict';
import { scaleResourceAfterMaximumChange } from '../src/systems/unitResourceSync.js';

assert.equal(
  scaleResourceAfterMaximumChange(40, 40, 50),
  50,
  'a freshly summoned full-durability unit should remain full after its maximum increases'
);

assert.equal(
  scaleResourceAfterMaximumChange(20, 40, 50),
  25,
  'an existing unit should preserve its durability ratio when its maximum increases'
);

assert.equal(
  scaleResourceAfterMaximumChange(0, 40, 50),
  0,
  'an exhausted unit should not regain durability from a maximum-only upgrade'
);

assert.equal(
  scaleResourceAfterMaximumChange(60, 40, 50),
  50,
  'durability should remain capped at the new maximum'
);

console.log('unit resource sync tests passed');
