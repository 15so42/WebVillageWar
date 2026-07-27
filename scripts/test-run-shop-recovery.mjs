import assert from 'node:assert/strict';
import {
  isRunShopUiVisible,
  shouldRestoreFreeRunShopUi
} from '../src/systems/runShopUiState.js';

const visibleUi = {
  overlay: {
    isConnected: true,
    hidden: false,
    hasAttribute: () => false
  },
  root: { isConnected: true }
};

assert.equal(isRunShopUiVisible(visibleUi), true);
assert.equal(shouldRestoreFreeRunShopUi({ freeReward: true, runShopOpen: true, ui: visibleUi }), false);
assert.equal(shouldRestoreFreeRunShopUi({ freeReward: true, runShopOpen: false, ui: visibleUi }), true);
assert.equal(shouldRestoreFreeRunShopUi({ freeReward: true, runShopOpen: true, ui: null }), true);
assert.equal(shouldRestoreFreeRunShopUi({
  freeReward: true,
  runShopOpen: true,
  ui: {
    ...visibleUi,
    overlay: { ...visibleUi.overlay, hidden: true }
  }
}), true);
assert.equal(shouldRestoreFreeRunShopUi({ freeReward: false, runShopOpen: true, ui: null }), false);

console.log('Run-shop reward recovery checks passed.');
