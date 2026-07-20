import { BALANCE } from '../data/gameData.js';

const DEFAULT_SHOP_CATEGORIES = ['upgrade', 'enchant', 'tactic', 'building', 'energy'];

function createInitialShopPrices() {
  const basePrice = Number(BALANCE.runCurrency?.shop?.basePrice ?? 8);
  const prices = {};
  DEFAULT_SHOP_CATEGORIES.forEach((key) => {
    prices[key] = basePrice;
  });
  return prices;
}

export function createPlayerRunState(slot, deck = []) {
  return {
    slot,
    deck: Array.isArray(deck) ? deck : [],
    silver: Math.max(0, Number(BALANCE.runCurrency?.starting ?? 0)),
    pendingStrategyRewards: [],
    strategyRewardRerollCount: 0,
    teamGenericUpgradeCounts: new Map(),
    teamSpecialUpgrades: new Map(),
    teamSupportModifiersApplied: new Set(),
    runShopOpen: false,
    runShopCausedPause: false,
    runShopPendingOffers: {},
    runShopActiveCategory: null,
    runShopChoices: [],
    runShopFreeReward: false,
    shopPrices: createInitialShopPrices(),
    strategyEvent: null,
    selectedUnits: [],
    selectedUnitIds: new Set(),
    selectedUnit: null,
    selectionMode: 'none',
    connected: true
  };
}

export function getPlayerRunState(game, slot) {
  return game?.players?.[slot] ?? null;
}

export function localPlayerRunState(game) {
  const slot = game?.localPlayerSlot ?? 'p1';
  return getPlayerRunState(game, slot);
}
