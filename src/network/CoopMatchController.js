import { LEVEL_DEFINITIONS } from '../data/gameData.js';
import { RoomClient } from '../network/session/RoomClient.js';
import { buildDeckFromIds, normalizeCoopSession } from '../coop/CoopSession.js';
import { GameNetworkBridge } from '../network/bridge/GameNetworkBridge.js';
import { MSG } from '../network/protocol/messages.js';

const DECK_SIZE = 36;

export class CoopMatchController {
  constructor({
    getDeckSelection,
    getSelectedLevelId,
    getSelectedDifficulty,
    selectedLevel,
    cardWithLevel,
    onStartGame,
    onNotice,
    onLobbyVisible
  }) {
    this.getDeckSelection = getDeckSelection;
    this.getSelectedLevelId = getSelectedLevelId;
    this.getSelectedDifficulty = getSelectedDifficulty;
    this.selectedLevel = selectedLevel;
    this.cardWithLevel = cardWithLevel;
    this.onStartGame = onStartGame;
    this.onNotice = onNotice;
    this.onLobbyVisible = onLobbyVisible;
    this.roomClient = new RoomClient();
    this.activeBridge = null;
    this.pendingMatch = null;
    this.matchStarting = false;
    this.unsubscribe = this.roomClient.onUpdate((state) => this.handleRoomUpdate(state));
  }

  destroy() {
    this.unsubscribe?.();
    this.activeBridge?.unbindGame();
    this.roomClient.leaveRoom();
  }

  createRoom(playerName = '玩家 1') {
    this.matchStarting = false;
    const deck = this.getDeckSelection?.() ?? [];
    if (deck.length !== DECK_SIZE) {
      this.onNotice?.(`请先选满 ${DECK_SIZE} 张卡牌`);
      return;
    }
    this.onNotice?.('正在创建房间…');
    this.roomClient.createRoom(playerName, deck.length).catch((error) => {
      this.onNotice?.(error?.message ?? '连接服务器失败');
    });
  }

  joinRoom(roomId, playerName = '玩家 2') {
    this.matchStarting = false;
    const deck = this.getDeckSelection?.() ?? [];
    if (deck.length !== DECK_SIZE) {
      this.onNotice?.(`请先选满 ${DECK_SIZE} 张卡牌`);
      return;
    }
    this.onNotice?.('正在加入房间…');
    this.roomClient.joinRoom(String(roomId || '').trim().toUpperCase(), playerName, deck.length).catch((error) => {
      this.onNotice?.(error?.message ?? '连接服务器失败');
    });
  }

  toggleReady(ready) {
    const deck = this.buildDeckPayload();
    this.roomClient.setReady(ready, deck);
  }

  buildDeckPayload() {
    return (this.getDeckSelection?.() ?? []).map((id) => {
      const card = this.cardWithLevel?.(id) ?? { id, level: 1 };
      return { id, level: card.level ?? 1 };
    });
  }

  leaveRoom() {
    this.matchStarting = false;
    this.roomClient.leaveRoom();
    this.pendingMatch = null;
  }

  startMatch() {
    if (!this.roomClient.isHost) return;
    if (this.matchStarting) return;
    const room = this.roomClient.room;
    if (!room || room.state === 'running') return;
    const p2 = room?.players?.p2;
    if (!p2?.connected) return;
    if (!room.players.p1?.ready || !p2.ready) return;

    this.matchStarting = true;
    const levelId = this.getSelectedLevelId?.() ?? LEVEL_DEFINITIONS[0]?.id;
    const level = this.selectedLevel?.(levelId) ?? LEVEL_DEFINITIONS[0];
    const difficulty = this.getSelectedDifficulty?.() ?? 1;
    const hostDeck = buildDeckFromIds(this.getDeckSelection(), this.cardWithLevel);
    const matchSeed = Date.now();
    this.pendingMatch = {
      levelId,
      level,
      difficulty,
      matchSeed,
      hostDeck
    };
    this.roomClient.startMatch({
      levelId,
      difficulty,
      matchSeed,
      players: {
        p1: { deckSize: hostDeck.length },
        p2: { deckSize: p2.deckSize ?? DECK_SIZE }
      }
    });
  }

  tryAutoStartMatch(room) {
    if (!this.roomClient.isHost) return;
    if (this.matchStarting || room?.state === 'running') return;
    const p1 = room?.players?.p1;
    const p2 = room?.players?.p2;
    if (!p1?.ready || !p2?.ready || p2.connected === false) {
      this.matchStarting = false;
      return;
    }
    this.startMatch();
  }

  handleRoomUpdate(state) {
    if (state.event === 'error') {
      this.onNotice?.(state.message ?? '联机错误');
      this.matchStarting = false;
      return;
    }
    if (state.event === MSG.ROOM_CREATE || state.event === MSG.ROOM_JOIN) {
      this.onNotice?.('');
    }
    this.onLobbyVisible?.(state);
    if (state.event === MSG.ROOM_STATE || state.event === MSG.ROOM_CREATE || state.event === MSG.ROOM_JOIN) {
      this.tryAutoStartMatch(state.room ?? this.roomClient.room);
    }
    if (state.event === MSG.NET_FORWARD) {
      const payload = state.forward?.payload;
      if (payload?.type === 'match_start') {
        this.launchMatch(payload, this.roomClient.playerSlot);
      }
    }
  }

  launchMatch(payload, localSlot) {
    const level = this.pendingMatch?.level
      ?? LEVEL_DEFINITIONS.find((entry) => entry.id === payload.levelId)
      ?? LEVEL_DEFINITIONS[0];
    const difficulty = payload.difficulty ?? 1;
    const matchSeed = payload.matchSeed ?? Date.now();
    const buildDeck = (entries, prefix) => (entries ?? []).map((entry, index) => {
      const card = this.cardWithLevel?.(entry.id) ?? { id: entry.id, level: entry.level ?? 1 };
      return {
        ...card,
        level: entry.level ?? card.level ?? 1,
        instanceId: `${prefix}-${entry.id}-${index}-${matchSeed}`
      };
    });
    const p1Deck = buildDeck(payload.players?.p1?.deck, 'p1');
    const p2Deck = buildDeck(payload.players?.p2?.deck, 'p2');
    const localDeck = buildDeckFromIds(this.getDeckSelection(), this.cardWithLevel);
    const session = normalizeCoopSession({
      mode: 'coop',
      level,
      difficulty,
      roomId: this.roomClient.room?.id,
      matchSeed,
      networkRole: localSlot === 'p1' ? 'host' : 'client',
      localPlayerSlot: localSlot,
      players: {
        p1: {
          playerId: 'p1',
          name: payload.players?.p1?.name ?? '玩家 1',
          deck: p1Deck.length ? p1Deck : (localSlot === 'p1' ? localDeck : [])
        },
        p2: {
          playerId: 'p2',
          name: payload.players?.p2?.name ?? '玩家 2',
          deck: p2Deck.length ? p2Deck : (localSlot === 'p2' ? localDeck : [])
        }
      }
    });
    const bridge = new GameNetworkBridge({
      role: localSlot === 'p1' ? 'host' : 'client',
      localSlot,
      transport: this.roomClient.transport,
      roomId: this.roomClient.room?.id
    });
    this.activeBridge = bridge;
    this.onStartGame?.(session, bridge);
  }
}
