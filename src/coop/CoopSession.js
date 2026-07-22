// Compatibility facade for gameplay code. Network/session identity is implemented by MultiplayerSession.
export {
  isMultiplayerSession as isCoopSession,
  normalizeMultiplayerSession as normalizeCoopSession,
  createMultiplayerPlayerStates as createCoopPlayerStates,
  buildMatchDeck as buildDeckFromIds
} from '../network/session/MultiplayerSession.js';
