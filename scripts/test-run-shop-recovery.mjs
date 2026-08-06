import assert from 'node:assert/strict';
import {
  isRunShopUiVisible,
  shouldPauseRunShop,
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
assert.equal(shouldPauseRunShop({ coopEnabled: false, alreadyPaused: false }), true);
assert.equal(shouldPauseRunShop({ coopEnabled: false, alreadyPaused: true }), false);
assert.equal(shouldPauseRunShop({ coopEnabled: true, alreadyPaused: false }), false);

console.log('Run-shop reward recovery checks passed.');
