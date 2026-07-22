import { BALANCE } from '../data/gameData.js';

const DEFAULT_SHOP_CATEGORIES = ['upgrade', 'enchant', 'tactic', 'building', 'energy'];

function createInitialShopPrices() {
  const basePrice = Number(BALANCE.runCurrency?.shop?.basePrice ?? 8);
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
    silver: Math.max(0, Number(BALANCE.runCurrency?.starting ?? 0)),
    pendingRewards: new Map(),
    pendingStrategyRewards: [],
    strategyRewardRerollCount: 0,
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

export function getPlayerRunState(game, playerId) {
  return game?.players?.[playerId] ?? null;
}

export function localPlayerRunState(game) {
  return getPlayerRunState(game, game?.localPlayerId ?? game?.localPlayerSlot);
}
