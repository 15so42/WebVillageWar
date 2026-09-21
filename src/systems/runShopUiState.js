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

// A solo shop is a local decision screen, so it stops the battle regardless
// of whether it was opened manually or awarded for free. Co-op keeps normal
// shopping local; only the shared Host reward flow is allowed to pause both
// players.
export function shouldPauseRunShop({ coopEnabled = false, alreadyPaused = false } = {}) {
  return !coopEnabled && !alreadyPaused;
}

/**
 * Boss 整备（免费兵种专精 → 明码标价的军需补给铺 → 继续战斗）是阻塞流程：
 * 只要整备还开着，就不能开始下一波。无尽模式的自动跳过会先结束整备再放行。
 */
export function isRunShopPrepBlockingWaveAdvance({ freeReward = false } = {}) {
  return freeReward === true;
}
