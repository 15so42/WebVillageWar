import { COOP_ENEMY_SCALING } from '../data/gameData.js';
import { createPlayerRunState } from './PlayerRunState.js';

export function isCoopSession(session) {
  return session?.mode === 'coop' && session?.players;
}

export function normalizeCoopSession(session) {
  if (!isCoopSession(session)) return session;
  const players = session.players ?? {};
  return {
    ...session,
    mode: 'coop',
    networkRole: session.networkRole ?? 'offline',
    localPlayerSlot: session.localPlayerSlot ?? 'p1',
    roomId: session.roomId ?? null,
    matchSeed: session.matchSeed ?? Date.now(),
    coop: {
      enabled: true,
      healthMult: session.coop?.healthMult ?? COOP_ENEMY_SCALING.healthMult,
      damageMult: session.coop?.damageMult ?? COOP_ENEMY_SCALING.damageMult
    },
    players: {
      p1: {
        playerId: players.p1?.playerId ?? 'p1',
        name: players.p1?.name ?? '玩家 1',
        deck: players.p1?.deck ?? []
      },
      p2: {
        playerId: players.p2?.playerId ?? 'p2',
        name: players.p2?.name ?? '玩家 2',
        deck: players.p2?.deck ?? []
      }
    }
  };
}

export function createCoopPlayerStates(session) {
  const normalized = normalizeCoopSession(session);
  return {
    p1: createPlayerRunState('p1', normalized.players.p1.deck),
    p2: createPlayerRunState('p2', normalized.players.p2.deck)
  };
}

export function buildDeckFromIds(deckIds, cardWithLevel) {
  return deckIds.map((id, index) => {
    const card = cardWithLevel(id);
    return {
      ...card,
      instanceId: `${id}-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    };
  });
}
