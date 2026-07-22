import { LEVEL_DEFINITIONS } from '../data/gameData.js';
import { GAME_VERSION } from '../version.js';
import { RoomClient } from './session/RoomClient.js';
import { buildMatchDeck, normalizeMultiplayerSession } from './session/MultiplayerSession.js';
import { GameNetworkBridge } from './bridge/GameNetworkBridge.js';
import {
  CATALOG_VERSION,
  COMMAND,
  createCommand,
  GAME_PROTOCOL_VERSION,
  MATCH_PHASE,
  MSG
} from './protocol/messages.js';

const DECK_SIZE = 36;

export function multiplayerVersionMatches(payload = {}) {
  return payload.gameVersion === GAME_VERSION
    && payload.gameProtocolVersion === GAME_PROTOCOL_VERSION
    && payload.catalogVersion === CATALOG_VERSION;
}

export class CoopMatchController {
  constructor({
    getDeckSelection,
    getSelectedLevelId,
    getSelectedDifficulty,
    selectedLevel,
    cardWithLevel,
    onStartGame,
    onNotice,
    onLobbyVisible,
    onConnectionLost
  }) {
    this.getDeckSelection = getDeckSelection;
    this.getSelectedLevelId = getSelectedLevelId;
    this.getSelectedDifficulty = getSelectedDifficulty;
    this.selectedLevel = selectedLevel;
    this.cardWithLevel = cardWithLevel;
    this.onStartGame = onStartGame;
    this.onNotice = onNotice;
    this.onLobbyVisible = onLobbyVisible;
    this.onConnectionLost = onConnectionLost;
    this.roomClient = new RoomClient();
    this.activeBridge = null;
    this.phase = MATCH_PHASE.LOBBY_EDITING;
    this.phaseRevision = 1;
    this.lobbyPlayers = new Map();
    this.commandResults = new Map();
    this.loadedPlayers = new Set();
    this.localCommandSeq = 1;
    this.match = null;
    this.launchedRevision = 0;
    this.unsubscribe = this.roomClient.onUpdate((state) => this.handleRoomUpdate(state));
    this.restoreAttempted = false;
    this.pendingReconnectSession = null;
    this.reconnectProbeSession = null;
    this.reconnectProbePending = false;
    this.reconnectRequestSession = null;
  }

  destroy() {
    this.unsubscribe?.();
    this.activeBridge?.unbindGame();
    this.roomClient.leaveRoom();
  }

  createRoom(playerName = '玩家 1') {
    if (!this.hasValidLocalDeck()) return;
    this.resetMatchState();
    this.onNotice?.('正在创建房间…');
    this.roomClient.createRoom(playerName).catch((error) => {
      this.onNotice?.(error?.message ?? '连接服务器失败');
    });
  }

  joinRoom(roomId, playerName = '玩家') {
    if (!this.hasValidLocalDeck()) return;
    this.resetMatchState();
    this.onNotice?.('正在加入房间…');
    this.roomClient.joinRoom(roomId, playerName).catch((error) => {
      this.onNotice?.(error?.message ?? '连接服务器失败');
    });
  }

  restoreSession() {
    if (this.restoreAttempted) return;
    this.restoreAttempted = true;
    this.prepareReconnectPrompt();
  }

  prepareReconnectPrompt() {
    if (this.roomClient.room?.id && this.roomClient.transport.connected) return false;
    if (this.pendingReconnectSession || this.reconnectProbePending || this.reconnectRequestSession) {
      return true;
    }
    const saved = this.roomClient.transport.loadSession();
    if (!saved?.roomId || !saved?.reconnectToken) return;
    if (Number.isFinite(Number(saved.expiresAt)) && Number(saved.expiresAt) <= Date.now()) {
      this.roomClient.transport.clearSession();
      return;
    }
    if (saved.playerId === saved.hostPlayerId) {
      this.roomClient.transport.clearSession();
      this.onNotice?.('Host 断线后权威状态无法恢复，请重新创建房间');
      return;
    }
    return this.checkReconnectAvailability(saved);
  }

  confirmReconnect() {
    const saved = this.pendingReconnectSession;
    if (!saved?.roomId || !saved?.reconnectToken) return false;
    if (Number.isFinite(Number(saved.expiresAt)) && Number(saved.expiresAt) <= Date.now()) {
      this.pendingReconnectSession = null;
      this.roomClient.transport.clearSession();
      this.onNotice?.('原房间的回连保留期已结束，无法回连');
      this.onLobbyVisible?.(this.viewState({ event: MSG.ERROR }));
      return false;
    }
    this.pendingReconnectSession = null;
    this.reconnectRequestSession = saved;
    this.onNotice?.('正在回连原联机会话…');
    this.onLobbyVisible?.(this.viewState({ event: MSG.RECONNECT }));
    this.roomClient.reconnect(saved)
      .then((sent) => {
        if (!sent) throw new Error('未能发送回连请求');
      })
      .catch((error) => {
        this.reconnectRequestSession = null;
        this.checkReconnectAvailability(saved);
        this.onNotice?.(error?.message ?? '联机会话恢复失败');
        this.onLobbyVisible?.(this.viewState({ event: MSG.ERROR }));
      });
    return true;
  }

  declineReconnect() {
    this.pendingReconnectSession = null;
    this.reconnectProbeSession = null;
    this.reconnectProbePending = false;
    this.reconnectRequestSession = null;
    this.roomClient.resetLocalRoom({ notify: false });
    this.resetMatchState();
    this.onNotice?.('已放弃回连，可以创建或加入其他房间');
    this.onLobbyVisible?.(this.viewState({ event: MSG.ROOM_LEAVE }));
  }

  checkReconnectAvailability(saved) {
    if (!saved?.roomId || !saved?.reconnectToken || saved.playerId === saved.hostPlayerId) {
      return false;
    }
    if (Number.isFinite(Number(saved.expiresAt)) && Number(saved.expiresAt) <= Date.now()) {
      this.roomClient.transport.clearSession();
      this.onNotice?.('原房间的回连保留期已结束，无法回连');
      return false;
    }
    this.pendingReconnectSession = null;
    this.reconnectProbeSession = saved;
    this.reconnectProbePending = true;
    this.onNotice?.('正在检测原房间与 Host 是否在线…');
    this.onLobbyVisible?.(this.viewState({ event: MSG.RECONNECT_PROBE }));
    this.roomClient.probeReconnect(saved)
      .then((sent) => {
        if (!sent) throw new Error('未能发送回连检测请求');
      })
      .catch((error) => {
        if (this.reconnectProbeSession !== saved) return;
        this.reconnectProbePending = false;
        this.onNotice?.(error?.message ?? '无法检测原房间状态');
        this.onLobbyVisible?.(this.viewState({ event: MSG.ERROR }));
      });
    return true;
  }

  hasValidLocalDeck() {
    const deck = this.getDeckSelection?.() ?? [];
    if (deck.length === DECK_SIZE) return true;
    this.onNotice?.(`请先选满 ${DECK_SIZE} 张卡牌`);
    return false;
  }

  toggleReady(ready) {
    if (ready && !this.hasValidLocalDeck()) return;
    const command = this.createLobbyCommand(COMMAND.READY_SET, {
      ready: Boolean(ready),
      deck: this.buildDeckPayload(),
      deckRevision: deckRevision(this.buildDeckPayload()),
      catalogVersion: CATALOG_VERSION,
      gameVersion: GAME_VERSION
    });
    this.submitLobbyCommand(command);
  }

  buildDeckPayload() {
    return (this.getDeckSelection?.() ?? []).map((id) => {
      const card = this.cardWithLevel?.(id) ?? { id, level: 1 };
      return { id, level: card.level ?? 1 };
    });
  }

  leaveRoom() {
    this.roomClient.leaveRoom();
    this.resetMatchState();
  }

  resetMatchState() {
    this.phase = MATCH_PHASE.LOBBY_EDITING;
    this.phaseRevision = 1;
    this.lobbyPlayers.clear();
    this.commandResults.clear();
    this.loadedPlayers.clear();
    this.match = null;
    this.launchedRevision = 0;
    this.pendingReconnectSession = null;
    this.reconnectProbeSession = null;
    this.reconnectProbePending = false;
    this.reconnectRequestSession = null;
  }

  createLobbyCommand(name, payload) {
    const seq = this.localCommandSeq++;
    return createCommand({
      playerId: this.roomClient.playerId ?? 'pending-player',
      clientSeq: seq,
      expectedPhaseRevision: this.phaseRevision,
      name,
      payload
    });
  }

  submitLobbyCommand(command) {
    if (this.roomClient.isHost) {
      this.ingestLobbyCommand(command, this.roomClient.playerId);
      return true;
    }
    return this.roomClient.forward(command, this.roomClient.hostPlayerId);
  }

  handleRoomUpdate(state) {
    if (state.event === MSG.CONNECTION_LOST) {
      this.handleConnectionLost(state);
      return;
    }
    if (state.event === MSG.RECONNECT_STATUS) {
      this.handleReconnectStatus(state);
      return;
    }
    if (state.event === MSG.RECONNECT_OK) {
      this.reconnectRequestSession = null;
      this.pendingReconnectSession = null;
    }
    if (state.event === MSG.ERROR) {
      if (this.reconnectRequestSession) {
        this.reconnectRequestSession = null;
        this.roomClient.transport.clearSession();
        this.onLobbyVisible?.(this.viewState({ event: MSG.ERROR }));
      }
      this.onNotice?.(state.message ?? '联机错误');
      return;
    }
    if (state.event === MSG.ROOM_CLOSED) {
      this.onNotice?.(state.reason === 'host_lease_expired' ? '房主断线超过 60 秒，房间已释放' : '房间已关闭');
      return;
    }
    if (state.event === MSG.ROOM_CREATE || state.event === MSG.ROOM_JOIN) {
      this.onNotice?.('');
    }
    if (state.room && this.roomClient.isHost) {
      this.syncRelayPlayers(state.room);
    }
    if (
      (state.event === MSG.ROOM_JOIN || state.event === MSG.RECONNECT_OK)
      && !this.roomClient.isHost
    ) {
      this.sendVersionHello();
    }
    if (state.room && this.activeBridge) {
      this.activeBridge.updateConnections?.(state.room);
      this.activeBridge.handleRelayRoomState?.(state.room);
    }
    this.onLobbyVisible?.(this.viewState(state));
    if (state.event === MSG.NET_FORWARD) {
      this.handleGamePayload(state.forward?.payload, state.forward?.fromPlayerId);
    }
    // The active GameNetworkBridge owns in-match resync. Keeping the request
    // here as well produced two consecutive full snapshots on reconnect and
    // could replace the hand DOM while the player started dragging a card.
  }

  handleConnectionLost(state = {}) {
    const saved = this.roomClient.transport.loadSession();
    if (this.roomClient.isHost) {
      this.roomClient.transport.clearSession();
      this.onNotice?.('主机与中继的连接已中断；原权威对局无法恢复');
      return;
    }
    if (this.reconnectProbePending) {
      this.reconnectProbePending = false;
      this.onNotice?.('连接已中断，暂时无法检测原房间状态');
      this.onLobbyVisible?.(this.viewState({ event: MSG.CONNECTION_LOST }));
      return;
    }
    this.activeBridge?.unbindGame();
    this.activeBridge = null;
    this.launchedRevision = 0;
    const shouldProbe = Boolean(state.reconnectAvailable && saved?.roomId && saved?.reconnectToken);
    this.onNotice?.(shouldProbe
      ? '连接已中断，正在检测原房间与 Host 是否在线…'
      : '连接已中断，当前会话已无法回连');
    if (shouldProbe) this.checkReconnectAvailability(saved);
    this.onConnectionLost?.({ reconnectChecking: shouldProbe });
    this.onLobbyVisible?.(this.viewState({
      event: MSG.CONNECTION_LOST,
      reconnectChecking: shouldProbe
    }));
  }

  handleReconnectStatus(state = {}) {
    const saved = this.reconnectProbeSession;
    if (!saved || String(state.roomId ?? '').toUpperCase() !== String(saved.roomId).toUpperCase()) {
      return;
    }
    this.reconnectProbeSession = null;
    this.reconnectProbePending = false;
    if (state.reconnectAvailable && state.hostOnline) {
      this.pendingReconnectSession = saved;
      this.onNotice?.('原房间仍在且 Host 在线，可以回连');
      this.onLobbyVisible?.(this.viewState({ event: MSG.RECONNECT_STATUS }));
      return;
    }
    this.pendingReconnectSession = null;
    this.roomClient.transport.clearSession();
    const notices = {
      host_offline: 'Host 当前不在线，原对局无法回连',
      room_missing: '原房间已关闭或释放，无法回连',
      expired: '原房间的回连保留期已结束，无法回连',
      invalid_token: '原房间的回连凭证已失效',
      host_reconnect_disabled: 'Host 断线后权威状态无法恢复，请重新创建房间'
    };
    this.onNotice?.(notices[state.reconnectReason] ?? '原房间当前无法回连');
    this.onLobbyVisible?.(this.viewState({ event: MSG.RECONNECT_STATUS }));
  }

  syncRelayPlayers(room) {
    const activeIds = new Set(room.playerOrder ?? Object.keys(room.players ?? {}));
    activeIds.forEach((playerId) => {
      const relayPlayer = room.players?.[playerId];
      const current = this.lobbyPlayers.get(playerId) ?? {
        playerId,
        ready: false,
        deck: [],
        deckRevision: null,
        catalogVersion: null,
        gameVersion: playerId === this.roomClient.playerId ? GAME_VERSION : null,
        versionVerified: playerId === this.roomClient.playerId
      };
      const didReconnect = current.connected === false && relayPlayer?.connected !== false;
      if (didReconnect) {
        current.versionVerified = playerId === this.roomClient.playerId;
      }
      current.name = relayPlayer?.name ?? current.name ?? '玩家';
      current.order = relayPlayer?.order ?? current.order ?? 0;
      current.connected = relayPlayer?.connected !== false;
      if (playerId === this.roomClient.playerId) {
        current.gameVersion = GAME_VERSION;
        current.versionVerified = true;
      }
      this.lobbyPlayers.set(playerId, current);
    });
    [...this.lobbyPlayers.keys()].forEach((playerId) => {
      if (!activeIds.has(playerId)) this.lobbyPlayers.delete(playerId);
    });
    if (this.phase === MATCH_PHASE.LOBBY_EDITING || this.phase === MATCH_PHASE.READY_CHECK) {
      this.publishLobbyState();
      this.tryStartLoading();
    }
  }

  handleGamePayload(payload, fromPlayerId) {
    if (!payload) return;
    if (this.roomClient.isHost && payload.type === MSG.VERSION_HELLO) {
      this.handleVersionHello(payload, fromPlayerId);
      return;
    }
    if (!this.roomClient.isHost && payload.type === MSG.VERSION_RESULT) {
      this.handleVersionResult(payload);
      return;
    }
    if (this.roomClient.isHost && payload.type === MSG.COMMAND) {
      if (payload.name === COMMAND.READY_SET || payload.name === COMMAND.CLIENT_LOADED) {
        this.ingestLobbyCommand(payload, fromPlayerId);
      }
      return;
    }
    if (payload.type === MSG.LOBBY_STATE) {
      if (payload.gameVersion !== GAME_VERSION) {
        this.handleVersionResult({
          accepted: false,
          hostVersion: payload.gameVersion ?? '未知'
        });
        return;
      }
      if ((payload.phaseRevision ?? 0) < this.phaseRevision) return;
      this.phase = payload.phase;
      this.phaseRevision = payload.phaseRevision;
      this.applyLobbyView(payload.players);
      this.onLobbyVisible?.(this.viewState({ event: MSG.LOBBY_STATE }));
      return;
    }
    if (payload.type === MSG.MATCH_LOADING_STARTED) {
      this.acceptLoadingState(payload);
      return;
    }
    if (payload.type === MSG.MATCH_RESUME) {
      this.acceptResumeState(payload);
      return;
    }
    if (payload.type === MSG.MATCH_RUNNING) {
      if ((payload.phaseRevision ?? 0) < this.phaseRevision) return;
      this.phase = MATCH_PHASE.RUNNING;
      this.phaseRevision = payload.phaseRevision;
      return;
    }
    if (payload.type === MSG.MATCH_PHASE_CHANGED) {
      if ((payload.phaseRevision ?? 0) < this.phaseRevision) return;
      this.phase = payload.phase;
      this.phaseRevision = payload.phaseRevision;
    }
  }

  sendVersionHello() {
    const saved = this.roomClient.transport.loadSession() ?? {};
    this.roomClient.transport.saveSession({ ...saved, gameVersion: GAME_VERSION });
    return this.roomClient.forward({
      type: MSG.VERSION_HELLO,
      gameVersion: GAME_VERSION,
      gameProtocolVersion: GAME_PROTOCOL_VERSION,
      catalogVersion: CATALOG_VERSION
    }, this.roomClient.hostPlayerId);
  }

  handleVersionHello(payload, playerId) {
    const player = this.lobbyPlayers.get(playerId);
    if (!player) return;
    const accepted = multiplayerVersionMatches(payload);
    player.gameVersion = typeof payload.gameVersion === 'string' ? payload.gameVersion : '未知';
    player.gameProtocolVersion = payload.gameProtocolVersion ?? null;
    player.catalogVersion = payload.catalogVersion ?? null;
    player.versionVerified = accepted;
    if (!accepted) player.ready = false;
    this.roomClient.forward({
      type: MSG.VERSION_RESULT,
      accepted,
      hostVersion: GAME_VERSION,
      clientVersion: player.gameVersion,
      gameProtocolVersion: GAME_PROTOCOL_VERSION,
      catalogVersion: CATALOG_VERSION
    }, playerId);
    if (!accepted) {
      this.onNotice?.(`玩家版本不一致：主机 v${GAME_VERSION}，对方 v${player.gameVersion}`);
      this.publishLobbyState();
      return;
    }
    this.publishLobbyState();
    if (
      this.match
      && (this.phase === MATCH_PHASE.OPENING_SELECTION || this.phase === MATCH_PHASE.RUNNING)
    ) {
      this.roomClient.forward({
        ...this.loadingPayloadFor(playerId),
        type: MSG.MATCH_RESUME,
        phase: this.phase,
        phaseRevision: this.phaseRevision
      }, playerId);
    }
  }

  handleVersionResult(payload) {
    if (
      payload.accepted
      && payload.hostVersion === GAME_VERSION
      && payload.gameProtocolVersion === GAME_PROTOCOL_VERSION
      && payload.catalogVersion === CATALOG_VERSION
    ) {
      this.pendingReconnectSession = null;
      const local = this.lobbyPlayers.get(this.roomClient.playerId);
      if (local) {
        local.gameVersion = GAME_VERSION;
        local.versionVerified = true;
      }
      this.onNotice?.('');
      this.onLobbyVisible?.(this.viewState({ event: MSG.VERSION_RESULT }));
      return;
    }
    const hostVersion = payload.hostVersion ?? '未知';
    const message = `版本不一致：主机 v${hostVersion}，当前 v${GAME_VERSION}，无法加入房间`;
    this.activeBridge?.unbindGame();
    this.activeBridge = null;
    this.pendingReconnectSession = null;
    this.roomClient.leaveRoom();
    this.resetMatchState();
    this.onNotice?.(message);
    this.onLobbyVisible?.(this.viewState({ event: MSG.VERSION_RESULT }));
  }

  ingestLobbyCommand(command, fromPlayerId) {
    if (!fromPlayerId || !this.lobbyPlayers.has(fromPlayerId)) return;
    const dedupeKey = `${fromPlayerId}:${command.commandId}`;
    if (this.commandResults.has(dedupeKey)) {
      this.sendLobbyResult(fromPlayerId, this.commandResults.get(dedupeKey));
      return;
    }
    let result;
    const player = this.lobbyPlayers.get(fromPlayerId);
    if (!player?.versionVerified || player.gameVersion !== GAME_VERSION) {
      result = this.rejectLobbyCommand(command, 'game_version_mismatch');
    } else if (command.expectedPhaseRevision !== this.phaseRevision) {
      result = this.rejectLobbyCommand(command, 'phase_revision_mismatch');
    } else if (command.name === COMMAND.READY_SET) {
      result = this.applyReadyCommand(command, fromPlayerId);
    } else if (command.name === COMMAND.CLIENT_LOADED) {
      result = this.applyLoadedCommand(command, fromPlayerId);
    } else {
      result = this.rejectLobbyCommand(command, 'unsupported_lobby_command');
    }
    this.commandResults.set(dedupeKey, result);
    this.sendLobbyResult(fromPlayerId, result);
  }

  applyReadyCommand(command, playerId) {
    if (this.phase !== MATCH_PHASE.LOBBY_EDITING && this.phase !== MATCH_PHASE.READY_CHECK) {
      return this.rejectLobbyCommand(command, 'lobby_closed');
    }
    const player = this.lobbyPlayers.get(playerId);
    const deck = Array.isArray(command.payload?.deck) ? command.payload.deck : [];
    if (command.payload?.gameVersion !== GAME_VERSION) {
      return this.rejectLobbyCommand(command, 'game_version_mismatch');
    }
    if (command.payload?.ready && deck.length !== DECK_SIZE) {
      return this.rejectLobbyCommand(command, 'invalid_deck_size');
    }
    if (command.payload?.catalogVersion !== CATALOG_VERSION) {
      return this.rejectLobbyCommand(command, 'catalog_version_mismatch');
    }
    if (command.payload?.ready && deck.some((card) => !card?.id)) {
      return this.rejectLobbyCommand(command, 'invalid_card_definition');
    }
    player.ready = Boolean(command.payload?.ready);
    player.deck = deck.map((card) => ({ id: card.id, level: card.level ?? 1 }));
    player.deckRevision = command.payload?.deckRevision ?? deckRevision(player.deck);
    player.catalogVersion = command.payload?.catalogVersion;
    this.phase = MATCH_PHASE.READY_CHECK;
    this.phaseRevision += 1;
    this.publishLobbyState();
    this.tryStartLoading();
    return {
      type: MSG.COMMAND_ACCEPTED,
      commandId: command.commandId,
      authoritativeRevision: this.phaseRevision
    };
  }

  applyLoadedCommand(command, playerId) {
    if (this.phase !== MATCH_PHASE.MATCH_LOADING || command.payload?.matchId !== this.match?.matchId) {
      return this.rejectLobbyCommand(command, 'match_not_loading');
    }
    this.loadedPlayers.add(playerId);
    this.tryEnterRunning();
    return {
      type: MSG.COMMAND_ACCEPTED,
      commandId: command.commandId,
      authoritativeRevision: this.phaseRevision
    };
  }

  rejectLobbyCommand(command, reasonCode) {
    return {
      type: MSG.COMMAND_REJECTED,
      commandId: command.commandId,
      reasonCode,
      authoritativeRevision: this.phaseRevision
    };
  }

  sendLobbyResult(playerId, result) {
    if (playerId === this.roomClient.playerId) {
      if (result.type === MSG.COMMAND_REJECTED) this.onNotice?.(`操作被拒绝：${result.reasonCode}`);
      return;
    }
    this.roomClient.forward(result, playerId);
  }

  publishLobbyState() {
    if (!this.roomClient.isHost) return;
    const payload = {
      type: MSG.LOBBY_STATE,
      gameProtocolVersion: GAME_PROTOCOL_VERSION,
      phase: this.phase,
      phaseRevision: this.phaseRevision,
      gameVersion: GAME_VERSION,
      players: this.publicLobbyPlayers()
    };
    this.applyLobbyView(payload.players);
    this.roomClient.forward(payload, 'broadcast');
    this.onLobbyVisible?.(this.viewState({ event: MSG.LOBBY_STATE }));
  }

  publicLobbyPlayers() {
    return Object.fromEntries([...this.lobbyPlayers.entries()].map(([playerId, player]) => [playerId, {
      playerId,
      name: player.name,
      order: player.order,
      connected: player.connected,
      ready: player.ready,
      deckRevision: player.deckRevision,
      catalogVersion: player.catalogVersion,
      gameVersion: player.gameVersion,
      versionVerified: player.versionVerified === true
    }]));
  }

  applyLobbyView(players) {
    Object.entries(players ?? {}).forEach(([playerId, view]) => {
      const current = this.lobbyPlayers.get(playerId) ?? { playerId, deck: [] };
      this.lobbyPlayers.set(playerId, { ...current, ...view });
    });
  }

  tryStartLoading() {
    if (!this.roomClient.isHost || this.phase === MATCH_PHASE.MATCH_LOADING || this.match) return;
    const players = [...this.lobbyPlayers.values()].sort((a, b) => a.order - b.order);
    if (
      players.length < 2
      || players.some((player) => (
        !player.connected
        || !player.ready
        || !player.versionVerified
        || player.gameVersion !== GAME_VERSION
      ))
    ) return;
    const levelId = this.getSelectedLevelId?.() ?? LEVEL_DEFINITIONS[0]?.id;
    const level = this.selectedLevel?.(levelId) ?? LEVEL_DEFINITIONS[0];
    const difficulty = this.getSelectedDifficulty?.() ?? 1;
    const matchId = createStableId('match');
    const matchSeed = randomSeed();
    this.phase = MATCH_PHASE.MATCH_LOADING;
    this.phaseRevision += 1;
    const descriptors = players.map((player) => ({
      playerId: player.playerId,
      name: player.name,
      order: player.order,
      connected: player.connected,
      factionId: 'players',
      teamId: 'players'
    }));
    this.match = {
      matchId,
      matchSeed,
      levelId,
      level,
      difficulty,
      players: descriptors,
      decks: Object.fromEntries(players.map((player) => [player.playerId, player.deck])),
      matchRules: {
        mode: 'pve',
        maxPlayers: players.length,
        hostPlayerId: this.roomClient.playerId,
        players: descriptors,
        factions: [{ factionId: 'players', teamId: 'players' }],
        aiFactions: [{ factionId: 'enemy-ai', teamId: 'enemy' }],
        basePolicy: 'shared_team_base',
        matchSeed,
        rulesVersion: GAME_PROTOCOL_VERSION,
        phaseRevision: this.phaseRevision
      }
    };
    players.forEach((player) => {
      const payload = this.loadingPayloadFor(player.playerId);
      if (player.playerId === this.roomClient.playerId) {
        this.acceptLoadingState(payload);
      } else {
        this.roomClient.forward(payload, player.playerId);
      }
    });
  }

  loadingPayloadFor(playerId) {
    return {
      type: MSG.MATCH_LOADING_STARTED,
      gameVersion: GAME_VERSION,
      gameProtocolVersion: GAME_PROTOCOL_VERSION,
      catalogVersion: CATALOG_VERSION,
      phase: MATCH_PHASE.MATCH_LOADING,
      phaseRevision: this.phaseRevision,
      matchId: this.match.matchId,
      matchSeed: this.match.matchSeed,
      levelId: this.match.levelId,
      difficulty: this.match.difficulty,
      players: this.match.players,
      matchRules: this.match.matchRules,
      localDeck: this.match.decks[playerId]
    };
  }

  acceptLoadingState(payload) {
    if (!multiplayerVersionMatches(payload)) {
      this.onNotice?.(`版本不一致：主机 v${payload.gameVersion ?? '未知'}，当前 v${GAME_VERSION}`);
      return;
    }
    if ((payload.phaseRevision ?? 0) < this.phaseRevision || this.launchedRevision === payload.phaseRevision) return;
    this.phase = MATCH_PHASE.MATCH_LOADING;
    this.phaseRevision = payload.phaseRevision;
    this.launchedRevision = payload.phaseRevision;
    this.launchMatch(payload);
    const loaded = this.createLobbyCommand(COMMAND.CLIENT_LOADED, { matchId: payload.matchId });
    loaded.expectedPhaseRevision = this.phaseRevision;
    this.submitLobbyCommand(loaded);
  }

  acceptResumeState(payload) {
    if (!multiplayerVersionMatches(payload)) {
      this.onNotice?.(`版本不一致：主机 v${payload.gameVersion ?? '未知'}，当前 v${GAME_VERSION}`);
      return;
    }
    if (this.activeBridge || this.launchedRevision === payload.phaseRevision) return;
    this.phase = payload.phase ?? MATCH_PHASE.RUNNING;
    this.phaseRevision = payload.phaseRevision;
    this.launchedRevision = payload.phaseRevision;
    this.launchMatch(payload);
    this.activeBridge?.requestResync?.();
  }

  launchMatch(payload) {
    const localPlayerId = this.roomClient.playerId;
    const hostPlayerId = payload.matchRules?.hostPlayerId ?? this.roomClient.hostPlayerId;
    const savedSession = this.roomClient.transport.loadSession() ?? {};
    this.roomClient.transport.saveSession({
      ...savedSession,
      playerId: localPlayerId,
      hostPlayerId,
      matchId: payload.matchId,
      matchActive: true,
      gameVersion: GAME_VERSION
    });
    const level = LEVEL_DEFINITIONS.find((entry) => entry.id === payload.levelId) ?? LEVEL_DEFINITIONS[0];
    const players = Object.fromEntries((payload.players ?? []).map((descriptor) => {
      const rawDeck = this.roomClient.isHost
        ? (this.match?.decks?.[descriptor.playerId] ?? [])
        : (descriptor.playerId === localPlayerId ? payload.localDeck : []);
      return [descriptor.playerId, {
        ...descriptor,
        deck: buildMatchDeck(rawDeck, this.cardWithLevel, {
          matchId: payload.matchId,
          playerId: descriptor.playerId
        })
      }];
    }));
    const session = normalizeMultiplayerSession({
      mode: 'multiplayer',
      level,
      difficulty: payload.difficulty ?? 1,
      roomId: this.roomClient.room?.id,
      matchId: payload.matchId,
      matchSeed: payload.matchSeed,
      networkRole: localPlayerId === hostPlayerId ? 'host' : 'client',
      localPlayerId,
      hostPlayerId,
      matchRules: payload.matchRules,
      players
    });
    const bridge = new GameNetworkBridge({
      role: session.networkRole,
      localPlayerId,
      hostPlayerId,
      transport: this.roomClient.transport,
      roomId: this.roomClient.room?.id,
      matchId: payload.matchId,
      phaseRevision: payload.phaseRevision,
      initialPhase: payload.phase ?? this.phase,
      onOpeningSelectionComplete: () => this.enterRunning()
    });
    this.activeBridge = bridge;
    this.onStartGame?.(session, bridge);
  }

  tryEnterRunning() {
    if (!this.roomClient.isHost || this.phase !== MATCH_PHASE.MATCH_LOADING) return;
    const required = [...this.lobbyPlayers.values()]
      .filter((player) => player.connected)
      .map((player) => player.playerId);
    if (required.some((playerId) => !this.loadedPlayers.has(playerId))) return;
    const openingSelectionActive = Boolean(
      this.activeBridge?.game?.awaitingOpeningReward
      || this.activeBridge?.game?.coopRewardKind === 'strategy'
    );
    if (openingSelectionActive) {
      this.phase = MATCH_PHASE.OPENING_SELECTION;
      this.phaseRevision += 1;
      const payload = {
        type: MSG.MATCH_PHASE_CHANGED,
        matchId: this.match.matchId,
        phase: this.phase,
        phaseRevision: this.phaseRevision
      };
      this.roomClient.forward(payload, 'broadcast');
      this.activeBridge?.handlePayload?.(payload, this.roomClient.playerId);
      return;
    }
    this.enterRunning();
  }

  enterRunning() {
    if (!this.roomClient.isHost || this.phase === MATCH_PHASE.RUNNING) return;
    this.phase = MATCH_PHASE.RUNNING;
    this.phaseRevision += 1;
    const payload = {
      type: MSG.MATCH_RUNNING,
      matchId: this.match.matchId,
      phase: this.phase,
      phaseRevision: this.phaseRevision
    };
    this.roomClient.forward(payload, 'broadcast');
    this.activeBridge?.handlePayload?.(payload, this.roomClient.playerId);
  }

  viewState(state = {}) {
    const room = this.roomClient.room;
    return {
      ...state,
      room: room ? {
        ...room,
        phase: this.phase,
        phaseRevision: this.phaseRevision,
        players: Object.fromEntries([...this.lobbyPlayers.entries()].map(([id, player]) => [id, {
          ...room.players?.[id],
          ...player,
          deck: undefined
        }]))
      } : null,
      playerId: this.roomClient.playerId,
      playerSlot: this.roomClient.playerId,
      reconnect: this.pendingReconnectSession ? {
        roomId: this.pendingReconnectSession.roomId,
        savedVersion: this.pendingReconnectSession.gameVersion ?? null,
        currentVersion: GAME_VERSION
      } : null,
      reconnectChecking: this.reconnectProbePending
    };
  }
}

function deckRevision(deck) {
  let hash = 2166136261;
  JSON.stringify(deck).split('').forEach((char) => {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  });
  return `deck-${(hash >>> 0).toString(16)}`;
}

function createStableId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

function randomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0];
  }
  return Math.floor(Math.random() * 0xffffffff);
}
