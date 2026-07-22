import { COMMAND, GAME_PROTOCOL_VERSION, MATCH_PHASE, MSG, relayEnvelope } from '../protocol/messages.js';
import { ClientMirror } from '../client/ClientMirror.js';
import { CommandSender } from '../client/CommandSender.js';
import { installHostEffectsRelay } from '../client/NetworkFxRelay.js';
import { HostAuthority } from '../host/HostAuthority.js';
import { SYNC } from '../protocol/syncConfig.js';
import { CoopPlayerStatusUi } from '../../systems/CoopPlayerStatusUi.js';

export class GameNetworkBridge {
  constructor({
    role,
    localPlayerId,
    localSlot,
    hostPlayerId,
    transport,
    roomId,
    matchId,
    phaseRevision = 0,
    initialPhase = MATCH_PHASE.MATCH_LOADING,
    onOpeningSelectionComplete = null
  }) {
    this.role = role;
    this.localPlayerId = localPlayerId ?? localSlot;
    this.hostPlayerId = hostPlayerId;
    this.transport = transport;
    this.roomId = roomId;
    this.matchId = matchId;
    this.phaseRevision = phaseRevision;
    this.onOpeningSelectionComplete = onOpeningSelectionComplete;
    this.phase = initialPhase;
    this.game = null;
    this.mirror = null;
    this.host = null;
    this.sender = null;
    this.lastServerSeq = 0;
    this.resyncPending = false;
    this.unsubscribe = null;
    this.closeUnsubscribe = null;
    this.restoreEffectsRelay = null;
    this.coopStatusUi = null;
    this.nextTimeSyncAt = 0;
  }

  bindGame(game) {
    this.game = game;
    this.sender = new CommandSender({
      playerId: this.localPlayerId,
      matchId: this.matchId,
      getPhaseRevision: () => this.phaseRevision,
      getInteractionState: () => ({
        strategyEvent: game.strategyEvent,
        runShop: {
          offerId: game.runShopNetworkOfferId,
          revision: game.runShopNetworkRevision,
          choices: game.runShopChoices
        }
      }),
      send: (payload) => {
        if (this.role === 'host') {
          this.host?.ingestCommand(payload, this.localPlayerId);
          return true;
        }
        return this.sendNet(payload, this.hostPlayerId);
      }
    });
    if (this.role === 'client') {
      this.mirror = new ClientMirror(game);
      game.networkClientMode = true;
    } else if (this.role === 'host') {
      this.host = new HostAuthority(game, {
        localPlayerId: this.localPlayerId,
        matchId: this.matchId,
        phaseRevision: this.phaseRevision,
        sendToPlayer: (playerId, payload) => this.sendNet(payload, playerId)
      });
      this.restoreEffectsRelay = installHostEffectsRelay(
        game,
        (payload) => this.host?.emitEvent(payload)
      );
    }
    if (game.coop?.enabled) this.coopStatusUi = new CoopPlayerStatusUi(game);
    if (this.transport) {
      this.unsubscribe = this.transport.onMessage((message) => this.onTransportMessage(message));
      this.closeUnsubscribe = this.transport.onClose(() => {
        if (this.role === 'host') this.host?.freezeHost(true);
        if (this.role === 'client') this.game?.cardSystem?.cancelActiveDrag?.();
      });
    }
    if (this.role === 'client') {
      this.requestTimeSync(true);
      this.requestResync();
    }
  }

  unbindGame() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.closeUnsubscribe?.();
    this.closeUnsubscribe = null;
    this.restoreEffectsRelay?.();
    this.restoreEffectsRelay = null;
    this.coopStatusUi?.destroy();
    this.coopStatusUi = null;
    this.mirror?.destroy();
    this.mirror = null;
    this.host = null;
    this.sender = null;
    this.game = null;
  }

  shouldRouteLocalCommands() {
    return Boolean(this.sender && !this.game?.networkApplyingCommand);
  }

  canShowStrategyInteraction() {
    return this.phase === MATCH_PHASE.OPENING_SELECTION
      || this.phase === MATCH_PHASE.RUNNING
      || Boolean(this.game?.networkStrategySelectionRequired);
  }

  sendNet(payload, to = 'broadcast') {
    if (!this.transport?.connected) return false;
    return this.transport.send(relayEnvelope(this.roomId, to, payload));
  }

  requestResync() {
    if (this.role !== 'client' || this.resyncPending) return false;
    this.resyncPending = true;
    const sent = this.sendNet({
      type: MSG.RESYNC_REQUEST,
      gameProtocolVersion: GAME_PROTOCOL_VERSION,
      matchId: this.matchId,
      lastServerSeq: this.lastServerSeq
    }, this.hostPlayerId);
    if (!sent) this.resyncPending = false;
    return sent;
  }

  requestTimeSync(force = false) {
    if (this.role !== 'client') return false;
    const now = performance.now();
    if (!force && now < this.nextTimeSyncAt) return false;
    this.nextTimeSyncAt = now + SYNC.timeSyncIntervalMs;
    return this.sendNet({
      type: MSG.TIME_SYNC_REQUEST,
      gameProtocolVersion: GAME_PROTOCOL_VERSION,
      matchId: this.matchId,
      clientSentAtMs: now
    }, this.hostPlayerId);
  }

  onTransportMessage(message) {
    if (message.type === MSG.NET_FORWARD) {
      this.handlePayload(message.payload, message.fromPlayerId);
      return;
    }
    if (message.type === MSG.RECONNECT_OK && this.role === 'client') {
      this.resyncPending = false;
      this.requestTimeSync(true);
      this.requestResync();
    } else if (message.type === MSG.RECONNECT_OK && this.role === 'host') {
      this.host?.freezeHost(false);
    }
  }

  handlePayload(payload, fromPlayerId) {
    if (!payload || (payload.matchId && payload.matchId !== this.matchId)) return;
    if (payload.type === MSG.MATCH_RUNNING || payload.type === MSG.MATCH_PHASE_CHANGED) {
      if ((payload.phaseRevision ?? 0) < this.phaseRevision) return;
      this.phase = payload.phase ?? MATCH_PHASE.RUNNING;
      this.phaseRevision = payload.phaseRevision;
      this.host?.setPhaseRevision(this.phaseRevision);
      this.game?.onNetworkMatchPhaseChanged?.(this.phase);
      return;
    }
    if (this.role === 'host') {
      if (payload.type === MSG.COMMAND) {
        if (payload.name !== COMMAND.READY_SET && payload.name !== COMMAND.CLIENT_LOADED) {
          this.host?.ingestCommand(payload, fromPlayerId);
        }
      } else if (payload.type === MSG.RESYNC_REQUEST) {
        this.host?.sendFullSnapshot(fromPlayerId);
      } else if (payload.type === MSG.TIME_SYNC_REQUEST) {
        this.sendNet({
          type: MSG.TIME_SYNC_RESPONSE,
          gameProtocolVersion: GAME_PROTOCOL_VERSION,
          matchId: this.matchId,
          clientSentAtMs: payload.clientSentAtMs,
          hostTimeMs: performance.now()
        }, fromPlayerId);
      }
      return;
    }
    if (fromPlayerId !== this.hostPlayerId) return;
    if (payload.type === MSG.TIME_SYNC_RESPONSE) {
      this.mirror?.applyTimeSync(payload);
      return;
    }
    if (payload.type === MSG.FULL_SNAPSHOT) {
      this.mirror?.applyFullSnapshot(payload);
      this.lastServerSeq = payload.baseServerSeq ?? payload.serverSeq ?? 0;
      this.resyncPending = false;
      return;
    }
    if (!this.acceptServerSequence(payload)) return;
    switch (payload.type) {
      case MSG.STATE_PATCH: {
        const applied = this.mirror?.applyStatePatch(payload);
        if (applied === false) this.requestResync();
        break;
      }
      case MSG.TRANSFORM_STREAM:
        this.mirror?.applyTransformStream(payload);
        break;
      case MSG.MOTION_EVENT:
        this.mirror?.applyMotionEvent(payload);
        break;
      case MSG.UI_STATE:
        this.mirror?.applyPrivateState(payload.state);
        break;
      case MSG.TRANSACTION:
        this.mirror?.applyTransaction(payload);
        break;
      case MSG.EVENT:
        this.mirror?.applyEvent(payload);
        break;
      case MSG.COMMAND_REJECTED:
        this.mirror?.applyCommandRejected(payload);
        break;
      case MSG.HOST_WAITING:
        if (payload.waiting) this.terminateClientMatch('host_disconnected');
        break;
      default:
        break;
    }
  }

  acceptServerSequence(payload) {
    const seq = Number(payload.serverSeq);
    if (!Number.isSafeInteger(seq)) return true;
    if (seq <= this.lastServerSeq) return false;
    if (this.lastServerSeq && seq !== this.lastServerSeq + 1) {
      this.requestResync();
      return false;
    }
    this.lastServerSeq = seq;
    return true;
  }

  beforeTick(dt) {
    if (this.role === 'host') {
      this.host?.update(dt);
      this.coopStatusUi?.render();
    }
  }

  updateClientFrame(dt) {
    this.requestTimeSync();
    this.mirror?.updateFrame(dt);
    this.coopStatusUi?.render();
  }

  updatePlayersPublic(rows) {
    this.coopStatusUi?.updatePlayersPublic(rows);
  }

  authoritativeTick() {
    return this.host?.builder?.tick ?? 0;
  }

  updateConnections(room) {
    if (this.role !== 'host' || !this.game?.players) return;
    Object.entries(room?.players ?? {}).forEach(([playerId, relayPlayer]) => {
      if (this.game.players[playerId]) this.game.players[playerId].connected = relayPlayer.connected !== false;
    });
  }

  handleRelayRoomState(room) {
    if (this.role !== 'client' || !this.game) return;
    if (room?.hostDisconnectedAt) this.terminateClientMatch('host_disconnected');
  }

  handleRoomClosed(reason = 'room_closed') {
    if (this.role !== 'client') return;
    this.terminateClientMatch(reason);
  }

  terminateClientMatch(reason = 'host_disconnected') {
    if (this.role !== 'client' || !this.game) return;
    this.game.showNetworkTerminatedDialog?.({ reason });
  }

  get commandSender() {
    return this.sender;
  }

  notifyUnitDied(unitId) {
    this.host?.emitEvent({ name: 'unit_died', unitId });
  }

  notifyPlayAnim(unitId, animationKey, duration = 0.35) {
    this.host?.emitEvent({
      name: 'animation_changed',
      unitId,
      animationKey,
      startTick: this.host?.builder?.tick ?? 0,
      playbackRate: 1,
      loop: false,
      duration
    });
  }

  notifyProjectileSpawn(projectile) {
    if (!projectile?.networkId || !projectile.object) return;
    const { position, quaternion, scale } = projectile.object;
    this.host?.emitEvent({
      name: 'projectile_spawn',
      projectile: {
        projectileId: projectile.networkId,
        type: projectile.type,
        color: projectile.color,
        scale: scale.x,
        x: position.x,
        y: position.y,
        z: position.z,
        qx: quaternion.x,
        qy: quaternion.y,
        qz: quaternion.z,
        qw: quaternion.w
      }
    });
  }

  notifyProjectileDespawn(projectileId) {
    if (!projectileId) return;
    this.host?.emitEvent({ name: 'projectile_despawn', projectileId });
  }

  notifyAreaEffectSpawn(areaEffect) {
    if (!areaEffect) return;
    this.host?.emitEvent({ name: 'fx_area_effect', ...areaEffect });
  }

  notifyCombatResult(result, cause) {
    this.host?.emitCombatTransaction(result, cause);
  }

  markPrivateStateDirty(playerId = null) {
    this.host?.markPrivateStateDirty(playerId);
  }

  notifyOpeningSelectionComplete() {
    if (this.role === 'host') this.onOpeningSelectionComplete?.();
  }

  onHostDisconnect(waiting) {
    this.host?.freezeHost(waiting);
  }
}
