/**
 * The free Boss reward is a blocking game state. Keep its DOM state explicit
 * so a late multiplayer UI patch can recover a detached or hidden overlay.
 */
export function isRunShopUiVisible(ui = null) {
  const overlay = ui?.overlay;
  const root = ui?.root;
  return Boolean(
    overlay?.isConnected
    && root?.isConnected
    && !overlay.hidden
    && !overlay.hasAttribute?.('hidden')
  );
}

export function shouldRestoreFreeRunShopUi({
  freeReward = false,
  runShopOpen = false,
  ui = null
} = {}) {
  return Boolean(freeReward) && (!runShopOpen || !isRunShopUiVisible(ui));
}
