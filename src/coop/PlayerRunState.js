import { BALANCE } from '../data/gameData.js';

const DEFAULT_SHOP_CATEGORIES = ['card', 'attribute', 'trait', 'copy', 'remove', 'upgrade', 'energy', 'temporary'];

function createInitialShopPrices() {
  const basePrice = Number(BALANCE.runCurrency?.shop?.basePrice ?? 12);
  return Object.fromEntries(DEFAULT_SHOP_CATEGORIES.map((key) => [key, basePrice]));
}

export function createPlayerRunState(playerId, deck = [], descriptor = {}) {
  return {
    playerId,
    // Compatibility alias for gameplay systems; the value is still a stable playerId.
    slot: playerId,
    factionId: descriptor.factionId ?? `faction:${playerId}`,
    teamId: descriptor.teamId ?? 'players',
    connected: descriptor.connected !== false,
    flowState: descriptor.flowState ?? 'playing',
    runCardsPlayedCount: 0,
    deck: Array.isArray(deck) ? deck : [],
    waveRewardDeck: createRewardDeckIds(deck),
    silver: Math.max(0, Number(BALANCE.runCurrency?.starting ?? 0)),
    pendingRewards: new Map(),
    pendingStrategyRewards: [],
    strategyRewardRerollCount: 0,
    acquiredUnitCardTypes: new Set(),
    teamGenericUpgradeCounts: new Map(),
    teamSpecialUpgrades: new Map(),
    teamSupportModifiersApplied: new Set(),
    runShopPendingOffers: {},
    runShopActiveCategory: null,
    runShopChoices: [],
    runShopFreeReward: false,
    shopPrices: createInitialShopPrices(),
    shopState: null,
    strategyEvent: null
  };
}

function createRewardDeckIds(deck = []) {
  const seen = new Set();
  const result = [];
  (Array.isArray(deck) ? deck : []).forEach((entry) => {
    const id = typeof entry === 'string'
      ? entry
      : (entry?.cardDefinitionId ?? entry?.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  });
  return result;
}

export function getPlayerRunState(game, playerId) {
  return game?.players?.[playerId] ?? null;
}

export function localPlayerRunState(game) {
  return getPlayerRunState(game, game?.localPlayerId ?? game?.localPlayerSlot);
}
