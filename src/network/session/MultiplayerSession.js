import { COOP_ENEMY_SCALING, PVE_ENEMY_SCALING_BY_PLAYER_COUNT } from '../../data/gameData.js';
import { GAME_PROTOCOL_VERSION } from '../protocol/messages.js';
import { createPlayerRunState } from '../../coop/PlayerRunState.js';

export function isMultiplayerSession(session) {
  return Boolean(
    session?.players && (
      session.mode === 'multiplayer'
      || session.mode === 'coop'
      || session.matchRules?.rulesVersion === GAME_PROTOCOL_VERSION
    )
  );
}

export function normalizeMultiplayerSession(session) {
  if (!isMultiplayerSession(session)) return session;
  const entries = normalizePlayerEntries(session.players);
  const localPlayerId = session.localPlayerId
    ?? session.localPlayerSlot
    ?? entries[0]?.[0]
    ?? null;
  const hostPlayerId = session.hostPlayerId
    ?? session.matchRules?.hostPlayerId
    ?? entries[0]?.[0]
    ?? null;
  const players = Object.fromEntries(entries.map(([playerId, player], order) => [playerId, {
    ...player,
    playerId,
    order: player.order ?? order,
    factionId: player.factionId ?? `faction:${playerId}`,
    teamId: player.teamId ?? 'players',
    deck: Array.isArray(player.deck) ? player.deck : []
  }]));
  const matchRules = {
    mode: session.matchRules?.mode ?? 'pve',
    maxPlayers: session.matchRules?.maxPlayers ?? Math.max(2, entries.length),
    hostPlayerId,
    players: Object.values(players).map(({ deck, ...player }) => player),
    factions: session.matchRules?.factions ?? [],
    aiFactions: session.matchRules?.aiFactions ?? [],
    basePolicy: session.matchRules?.basePolicy ?? 'shared_team_base',
    matchSeed: session.matchSeed ?? session.matchRules?.matchSeed ?? 1,
    rulesVersion: GAME_PROTOCOL_VERSION,
    phaseRevision: session.matchRules?.phaseRevision ?? 0
  };
  const pveScaling = PVE_ENEMY_SCALING_BY_PLAYER_COUNT[Math.min(4, Math.max(2, entries.length))]
    ?? COOP_ENEMY_SCALING;
  return {
    ...session,
    mode: 'multiplayer',
    networkRole: session.networkRole ?? (localPlayerId === hostPlayerId ? 'host' : 'client'),
    localPlayerId,
    localPlayerSlot: localPlayerId,
    hostPlayerId,
    roomId: session.roomId ?? null,
    matchId: session.matchId ?? null,
    matchSeed: matchRules.matchSeed,
    matchRules,
    coop: matchRules.mode === 'pve'
      ? {
        enabled: true,
        healthMult: session.coop?.healthMult ?? pveScaling.healthMult,
        damageMult: session.coop?.damageMult ?? pveScaling.damageMult
      }
      : null,
    players
  };
}

export function createMultiplayerPlayerStates(session) {
  const normalized = normalizeMultiplayerSession(session);
  return Object.fromEntries(
    Object.entries(normalized?.players ?? {}).map(([playerId, player]) => [
      playerId,
      createPlayerRunState(playerId, player.deck, player)
    ])
  );
}

export function buildMatchDeck(entries, cardWithLevel, { matchId, playerId } = {}) {
  return (entries ?? []).map((entry, index) => {
    const definitionId = typeof entry === 'string' ? entry : entry?.id;
    const source = cardWithLevel?.(definitionId) ?? { id: definitionId, level: 1 };
    const level = typeof entry === 'string' ? (source.level ?? 1) : (entry?.level ?? source.level ?? 1);
    return {
      ...source,
      id: definitionId,
      cardDefinitionId: definitionId,
      level,
      instanceId: `${matchId ?? 'match'}:${playerId ?? 'player'}:card:${index}`,
      cardInstanceId: `${matchId ?? 'match'}:${playerId ?? 'player'}:card:${index}`
    };
  });
}

function normalizePlayerEntries(players) {
  if (Array.isArray(players)) {
    return players
      .filter((player) => player?.playerId)
      .map((player) => [player.playerId, player]);
  }
  return Object.entries(players ?? {}).map(([key, player]) => [player?.playerId ?? key, player ?? {}]);
}
