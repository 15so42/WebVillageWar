import { COMMAND, GAME_PROTOCOL_VERSION, MATCH_PHASE, MSG, relayEnvelope } from '../protocol/messages.js';
import { ClientMirror } from '../client/ClientMirror.js';
import { CommandSender } from '../client/CommandSender.js';
import { installHostEffectsRelay } from '../client/NetworkFxRelay.js';
import { HostAuthority } from '../host/HostAuthority.js';
import { SYNC } from '../protocol/syncConfig.js';
import { CoopPlayerStatusUi } from '../../systems/CoopPlayerStatusUi.js';
import { WebRtcDirectTransport } from '../transport/WebRtcDirectTransport.js';

const INBOUND_APPLY_BUDGET_MS = 2;
const MAX_RELIABLE_PAYLOADS_PER_FRAME = 48;
const INBOUND_STATS_WINDOW_MS = 10_000;

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
    this.directTransport = null;
    this.pendingReliablePayloads = [];
    this.pendingTransformPayloads = new Map();
    this.coalescedTransformPayloads = 0;
    this.inboundApplySamples = [];
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
    this.directTransport = new WebRtcDirectTransport({
      localPlayerId: this.localPlayerId,
      hostPlayerId: this.hostPlayerId,
      sendSignal: (payload, playerId) => this.sendRelay(payload, playerId),
      onPayload: (payload, playerId) => this.enqueuePayload(payload, playerId)
    });
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
      this.directTransport.requestConnection();
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
    this.directTransport?.destroy();
    this.directTransport = null;
    this.pendingReliablePayloads.length = 0;
    this.pendingTransformPayloads.clear();
    this.inboundApplySamples.length = 0;
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
    if (!isWebRtcSignal(payload) && to !== 'broadcast' && to !== 'all' && this.directTransport?.send(to, payload)) {
      return true;
    }
    return this.sendRelay(payload, to);
  }

  sendRelay(payload, to = 'broadcast') {
    if (!this.transport?.connected) return false;
    return this.transport.send(relayEnvelope(this.roomId, to, payload));
  }

  getNetworkDiagnosticsSnapshot() {
    const snapshot = this.transport?.diagnostics?.snapshot?.() ?? null;
    const application = this.inboundApplicationSnapshot();
    if (!snapshot) {
      return {
        direct: this.directTransport?.snapshot?.() ?? null,
        application
      };
    }
    return {
      ...snapshot,
      direct: this.directTransport?.snapshot?.() ?? null,
      application
    };
  }

  recordNetworkTransformStream(stream, options) {
    this.transport?.diagnostics?.recordTransformStream?.(stream, options);
  }

  recordNetworkRtt(rttMs) {
    this.transport?.diagnostics?.recordRtt?.(rttMs);
  }

  requestResync(reason = 'manual') {
    if (this.role !== 'client' || this.resyncPending) return false;
    this.transport?.diagnostics?.recordResync?.(reason);
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
      this.enqueuePayload(message.payload, message.fromPlayerId);
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

  enqueuePayload(payload, fromPlayerId) {
    if (!payload || (payload.matchId && payload.matchId !== this.matchId)) return false;
    // Signaling must stay immediate or an offer/answer can wait behind a large
    // gameplay recovery queue and time out before the next render frame.
    if (isWebRtcSignal(payload)) {
      this.handlePayload(payload, fromPlayerId);
      return true;
    }
    if (payload.type === MSG.TRANSFORM_STREAM) {
      const key = fromPlayerId ?? this.hostPlayerId ?? 'peer';
      if (this.pendingTransformPayloads.has(key)) this.coalescedTransformPayloads += 1;
      this.pendingTransformPayloads.set(key, { payload, fromPlayerId });
      return true;
    }
    this.pendingReliablePayloads.push({ payload, fromPlayerId });
    return true;
  }

  flushInboundPayloads() {
    if (!this.pendingReliablePayloads.length && !this.pendingTransformPayloads.size) return;
    const startedAt = performance.now();
    let reliableProcessed = 0;
    const reliableLimit = Math.min(
      this.pendingReliablePayloads.length,
      MAX_RELIABLE_PAYLOADS_PER_FRAME
    );
    const breakdown = {};

    while (reliableProcessed < reliableLimit) {
      const entry = this.pendingReliablePayloads[reliableProcessed];
      this.applyInboundEntry(entry, breakdown);
      reliableProcessed += 1;
      if (performance.now() - startedAt >= INBOUND_APPLY_BUDGET_MS) break;
    }
    if (reliableProcessed) this.pendingReliablePayloads.splice(0, reliableProcessed);

    // Transform snapshots are replaceable. Applying only the newest snapshot
    // once per render frame prevents network callbacks from interrupting camera
    // input and avoids replaying stale movement after a mobile-network stall.
    let transformsProcessed = 0;
    if (!this.pendingReliablePayloads.length && this.pendingTransformPayloads.size) {
      const transforms = [...this.pendingTransformPayloads.values()];
      this.pendingTransformPayloads.clear();
      transforms.forEach((entry) => this.applyInboundEntry(entry, breakdown));
      transformsProcessed = transforms.length;
    }

    const finishedAt = performance.now();
    this.recordInboundApplication(
      finishedAt,
      finishedAt - startedAt,
      reliableProcessed + transformsProcessed,
      breakdown
    );
  }

  applyInboundEntry(entry, breakdown) {
    const startedAt = performance.now();
    this.handlePayload(entry.payload, entry.fromPlayerId);
    const category = inboundApplicationCategory(entry.payload);
    const durationMs = performance.now() - startedAt;
    const current = breakdown[category] ?? { count: 0, durationMs: 0, maxMs: 0 };
    current.count += 1;
    current.durationMs += durationMs;
    current.maxMs = Math.max(current.maxMs, durationMs);
    breakdown[category] = current;
  }

  recordInboundApplication(atMs, durationMs, processed, breakdown) {
    this.inboundApplySamples.push({ atMs, durationMs, processed, breakdown });
    const minimumAtMs = atMs - INBOUND_STATS_WINDOW_MS;
    while (this.inboundApplySamples[0]?.atMs < minimumAtMs) {
      this.inboundApplySamples.shift();
    }
  }

  inboundApplicationSnapshot() {
    const now = performance.now();
    const minimumAtMs = now - INBOUND_STATS_WINDOW_MS;
    while (this.inboundApplySamples[0]?.atMs < minimumAtMs) {
      this.inboundApplySamples.shift();
    }
    const durationTotal = this.inboundApplySamples.reduce((total, sample) => total + sample.durationMs, 0);
    const processedTotal = this.inboundApplySamples.reduce((total, sample) => total + sample.processed, 0);
    const categories = new Map();
    this.inboundApplySamples.forEach((sample) => {
      Object.entries(sample.breakdown ?? {}).forEach(([category, values]) => {
        const current = categories.get(category) ?? {
          category,
          count: 0,
          durationMs: 0,
          maxMs: 0
        };
        current.count += values.count;
        current.durationMs += values.durationMs;
        current.maxMs = Math.max(current.maxMs, values.maxMs);
        categories.set(category, current);
      });
    });
    return {
      reliableQueued: this.pendingReliablePayloads.length,
      transformsQueued: this.pendingTransformPayloads.size,
      coalescedTransforms: this.coalescedTransformPayloads,
      lastMs: roundDuration(this.inboundApplySamples.at(-1)?.durationMs),
      avgMs: roundDuration(this.inboundApplySamples.length ? durationTotal / this.inboundApplySamples.length : 0),
      maxMs: roundDuration(this.inboundApplySamples.reduce(
        (maximum, sample) => Math.max(maximum, sample.durationMs),
        0
      )),
      payloadsPerSecond: Number((processedTotal / (INBOUND_STATS_WINDOW_MS / 1_000)).toFixed(1)),
      categories: [...categories.values()]
        .map((entry) => ({
          ...entry,
          durationMs: roundDuration(entry.durationMs),
          maxMs: roundDuration(entry.maxMs)
        }))
        .sort((a, b) => b.maxMs - a.maxMs || b.durationMs - a.durationMs)
    };
  }

  handlePayload(payload, fromPlayerId) {
    if (!payload || (payload.matchId && payload.matchId !== this.matchId)) return;
    if (this.directTransport?.handlesSignal(payload)) {
      this.directTransport.receiveSignal(payload, fromPlayerId);
      return;
    }
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
      this.transport?.diagnostics?.recordSequenceGap?.(this.lastServerSeq, seq);
      this.requestResync('server_sequence_gap');
      return false;
    }
    this.lastServerSeq = seq;
    return true;
  }

  beforeTick(dt) {
    this.flushInboundPayloads();
    if (this.role === 'host') {
      this.host?.update(dt);
      this.coopStatusUi?.update(dt);
    }
  }

  updateClientFrame(dt) {
    this.flushInboundPayloads();
    this.requestTimeSync();
    this.mirror?.updateFrame(dt);
    this.coopStatusUi?.update(dt);
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

  publishMatchResult(resultsByPlayerId = {}) {
    if (this.role !== 'host' || !this.host) return;
    Object.entries(resultsByPlayerId).forEach(([playerId, result]) => {
      if (playerId === this.localPlayerId) return;
      this.host.emitEvent({
        name: MSG.MATCH_FINISHED,
        result
      }, { toPlayerId: playerId });
    });
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

function isWebRtcSignal(payload) {
  return payload?.type === MSG.WEBRTC_READY
    || payload?.type === MSG.WEBRTC_OFFER
    || payload?.type === MSG.WEBRTC_ANSWER
    || payload?.type === MSG.WEBRTC_ICE;
}

function roundDuration(durationMs) {
  return Number((Number(durationMs) || 0).toFixed(2));
}

function inboundApplicationCategory(payload) {
  if (payload?.type === MSG.TRANSFORM_STREAM) return 'transform';
  if (payload?.type === MSG.STATE_PATCH) return `state:${payload.entityType ?? 'unknown'}`;
  if (payload?.type === MSG.EVENT) return 'event';
  if (payload?.type === MSG.UI_STATE) return 'ui';
  if (payload?.type === MSG.TRANSACTION) return 'transaction';
  if (payload?.type === MSG.MOTION_EVENT) return 'motion';
  if (payload?.type === MSG.FULL_SNAPSHOT) return 'full_snapshot';
  return 'other';
}
