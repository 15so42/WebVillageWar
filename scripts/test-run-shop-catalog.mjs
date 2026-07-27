import assert from 'node:assert/strict';
import {
  RUN_SHOP_CATEGORIES,
  isRunShopCategoryAvailable
} from '../src/systems/runShopCatalog.js';

assert.equal(isRunShopCategoryAvailable('card'), false);
assert.equal(RUN_SHOP_CATEGORIES.some((entry) => entry.key === 'card'), false);
for (const key of ['attribute', 'trait', 'copy', 'remove', 'upgrade', 'energy', 'temporary']) {
  assert.equal(isRunShopCategoryAvailable(key), true, `${key} should remain available`);
}

console.log('Run-shop catalog checks passed.');
