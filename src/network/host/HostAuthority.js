import * as THREE from 'three';
import { COMMAND, GAME_PROTOCOL_VERSION, MSG } from '../protocol/messages.js';
import { CommandValidator } from './CommandValidator.js';
import { SnapshotBuilder } from './SnapshotBuilder.js';

const PRIVATE_STATE_COMMANDS = new Set([
  COMMAND.PLAY_CARD,
  COMMAND.DISCARD_CARD,
  COMMAND.REWARD_CHOOSE,
  COMMAND.REWARD_REROLL,
  COMMAND.REWARD_SKIP,
  COMMAND.SHOP_CATEGORY,
  COMMAND.SHOP_CHOOSE,
  COMMAND.SHOP_ENERGY,
  COMMAND.SHOP_BACK,
  COMMAND.SHOP_REWARD_SKIP
]);

export class HostAuthority {
  constructor(game, {
    localPlayerId,
    matchId,
    phaseRevision = 0,
    sendToPlayer
  }) {
    this.game = game;
    this.localPlayerId = localPlayerId;
    this.matchId = matchId;
    this.phaseRevision = phaseRevision;
    this.sendToPlayer = sendToPlayer;
    this.builder = new SnapshotBuilder(game, { matchId });
    this.validator = new CommandValidator(game, {
      matchId,
      getPhaseRevision: () => this.phaseRevision
    });
    this.commandQueue = [];
    this.hostFrozen = false;
    this.serverSeqByPlayer = new Map();
    this.lastPrivateByPlayer = new Map();
    this.dirtyPrivatePlayers = new Set();
    this.commandResults = new Map();
    this.transactionSeq = 1;
    const localPrivateState = this.builder.buildPrivateState(this.localPlayerId);
    if (localPrivateState) this.lastPrivateByPlayer.set(this.localPlayerId, localPrivateState);
  }

  ingestCommand(command, sourcePlayerId) {
    this.commandQueue.push({ command, sourcePlayerId });
  }

  setPhaseRevision(revision) {
    if (Number.isFinite(Number(revision))) this.phaseRevision = Number(revision);
  }

  freezeHost(waiting) {
    this.hostFrozen = waiting;
    this.broadcast({ type: MSG.HOST_WAITING, waiting: Boolean(waiting) });
  }

  update(dt) {
    if (this.hostFrozen) return;
    while (this.commandQueue.length) {
      const entry = this.commandQueue.shift();
      this.applyCommand(entry.command, entry.sourcePlayerId);
    }
    this.builder.update(dt).forEach((entry) => {
      if (entry.type === MSG.STATE_PATCH && entry.payload?.entityType === 'players_public') {
        this.game.networkBridge?.updatePlayersPublic?.(entry.payload.changes?.players ?? []);
      }
      this.broadcast({
        type: entry.type,
        ...entry.payload
      });
    });
    this.flushDirtyPrivateStates();
  }

  flushPrivateStates(force = false, onlyPlayerId = null) {
    const playerIds = onlyPlayerId ? [onlyPlayerId] : this.playerIds();
    playerIds.forEach((playerId) => {
      const state = this.builder.buildPrivateState(playerId);
      if (!state) return;
      const previous = this.lastPrivateByPlayer.get(playerId);
      const changes = force || !previous ? state : diffPrivateState(previous, state);
      this.lastPrivateByPlayer.set(playerId, state);
      this.dirtyPrivatePlayers.delete(playerId);
      if (!force && previous && Object.keys(changes).length === 0) return;
      this.send(playerId, {
        type: MSG.UI_STATE,
        state: force || !previous ? state : { playerId, ...changes }
      });
    });
  }

  markPrivateStateDirty(playerId = null) {
    const playerIds = playerId ? [playerId] : this.playerIds();
    playerIds.forEach((id) => this.dirtyPrivatePlayers.add(id));
  }

  flushDirtyPrivateStates() {
    [...this.dirtyPrivatePlayers].forEach((playerId) => {
      this.flushPrivateStates(false, playerId);
    });
  }

  sendFullSnapshot(playerId) {
    const nextSeq = (this.serverSeqByPlayer.get(playerId) ?? 0) + 1;
    const snapshot = this.builder.buildFullSnapshot(playerId);
    if (snapshot.privateState) {
      snapshot.privateState.nextClientSeq = (this.validator.lastSeqByPlayer.get(playerId) ?? 0) + 1;
    }
    this.send(playerId, {
      type: MSG.FULL_SNAPSHOT,
      baseServerSeq: nextSeq,
      ...snapshot
    });
    this.lastPrivateByPlayer.set(playerId, snapshot.privateState);
    this.dirtyPrivatePlayers.delete(playerId);
  }

  emitEvent(event, { toPlayerId = null } = {}) {
    const payload = {
      type: MSG.EVENT,
      eventId: `${this.matchId}:event:${this.transactionSeq++}`,
      ...event
    };
    if (toPlayerId) this.send(toPlayerId, payload);
    else this.broadcast(payload);
  }

  emitCombatTransaction(result, cause = {}) {
    this.broadcast({
      type: MSG.TRANSACTION,
      transactionId: `${this.matchId}:combat:${this.transactionSeq++}`,
      cause,
      results: [result]
    });
  }

  applyCommand(command, sourcePlayerId) {
    const cacheKey = `${sourcePlayerId}:${command?.commandId}`;
    const cached = this.commandResults.get(cacheKey);
    if (cached) {
      this.send(sourcePlayerId, cached);
      return;
    }
    const validation = this.validator.validate(command, sourcePlayerId);
    if (!validation.ok) {
      const rejection = {
        type: MSG.COMMAND_REJECTED,
        commandId: command?.commandId,
        reasonCode: validation.reasonCode,
        authoritativeRevision: this.phaseRevision
      };
      this.commandResults.set(cacheKey, rejection);
      this.send(sourcePlayerId, rejection);
      if (sourcePlayerId === this.localPlayerId) {
        this.game.cardSystem?.setHint?.(`操作未执行：${validation.reasonCode}`, 'network-command');
      }
      return;
    }
    const normalized = { ...command, payload: validation.payload };
    let applied = false;
    this.game.networkApplyingCommand = true;
    try {
      applied = this.executeCommand(normalized, sourcePlayerId) !== false;
    } finally {
      this.game.networkApplyingCommand = false;
    }
    if (!applied) {
      const rejection = {
        type: MSG.COMMAND_REJECTED,
        commandId: command.commandId,
        reasonCode: this.commandRejectionReason(command, sourcePlayerId),
        authoritativeRevision: this.phaseRevision
      };
      this.commandResults.set(cacheKey, rejection);
      this.send(sourcePlayerId, rejection);
      return;
    }
    const transaction = {
      type: MSG.TRANSACTION,
      transactionId: `${this.matchId}:command:${this.transactionSeq++}`,
      commandId: command.commandId,
      cause: { kind: 'command', name: command.name, playerId: sourcePlayerId },
      results: [{ kind: 'command_applied', name: command.name, playerId: sourcePlayerId }]
    };
    this.commandResults.set(cacheKey, transaction);
    this.broadcast(transaction);
    if (PRIVATE_STATE_COMMANDS.has(command.name)) {
      this.markPrivateStateDirty(sourcePlayerId);
      this.flushDirtyPrivateStates();
    }
  }

  executeCommand(command, playerId) {
    const payload = command.payload ?? {};
    switch (command.name) {
      case COMMAND.ISSUE_MOVE:
        return this.applyIssueMove(playerId, payload);
      case COMMAND.ISSUE_STOP:
        return this.withCommandUnits(playerId, payload.unitIds, () => this.game.stopSelectedUnits());
      case COMMAND.ISSUE_GUARD:
        return this.withCommandUnits(playerId, payload.unitIds, () => this.game.guardSelectedUnits());
      case COMMAND.SELECTION_SET:
        return this.applySelectionSet(playerId, payload);
      case COMMAND.PLAY_CARD:
        return this.applyPlayCard(playerId, payload);
      case COMMAND.DISCARD_CARD:
        return this.applyDiscardCard(playerId, payload);
      case COMMAND.REWARD_CHOOSE:
        return this.game.applyNetworkStrategyChoice(playerId, payload.choiceIndex);
      case COMMAND.REWARD_REROLL:
        return this.game.applyNetworkStrategyReroll(playerId);
      case COMMAND.REWARD_SKIP:
        return this.game.applyNetworkStrategySkip(playerId);
      case COMMAND.SHOP_CATEGORY:
        return this.game.applyNetworkShopCategory(playerId, payload.category);
      case COMMAND.SHOP_CHOOSE:
        return this.game.applyNetworkShopChoice(playerId, payload.choiceIndex);
      case COMMAND.SHOP_ENERGY:
        return this.game.applyNetworkShopEnergy(playerId);
      case COMMAND.SHOP_BACK:
        return this.game.applyNetworkShopBack(playerId);
      case COMMAND.SHOP_REWARD_SKIP:
        return this.game.applyNetworkShopRewardSkip(playerId);
      default:
        return false;
    }
  }

  applyIssueMove(playerId, payload) {
    return this.withCommandUnits(playerId, payload.unitIds, () => {
      const point = new THREE.Vector3(payload.point[0], payload.point[1] ?? 0, payload.point[2]);
      return this.game.commandSelectedUnitsToPoint(point);
    });
  }

  applySelectionSet(playerId, payload) {
    const selectedUnitIds = new Set(payload.unitIds ?? []);
    this.game.friendlyUnits.forEach((unit) => {
      if ((unit.controllerPlayerId ?? unit.ownerPlayerId) !== playerId) return;
      this.game.applyUnitSelectionState?.(
        unit,
        selectedUnitIds.has(unit.id),
        selectedUnitIds.has(unit.id) ? playerId : null
      );
    });
    return true;
  }

  withCommandUnits(playerId, unitIds, callback) {
    const requested = new Set(unitIds ?? []);
    const units = this.game.friendlyUnits.filter((unit) => (
      unit?.alive
      && requested.has(unit.id)
      && (unit.controllerPlayerId ?? unit.ownerPlayerId) === playerId
    ));
    if (!units.length || units.length !== requested.size) return false;
    const previous = {
      units: this.game.selectedUnits,
      ids: this.game.selectedUnitIds,
      unit: this.game.selectedUnit,
      mode: this.game.selectionMode
    };
    this.game.selectedUnits = units;
    this.game.selectedUnitIds = new Set(units.map((unit) => unit.id));
    this.game.selectedUnit = units[0] ?? null;
    this.game.selectionMode = units.length > 1 ? 'box' : 'direct';
    try {
      const result = callback();
      return result !== false;
    } finally {
      this.game.selectedUnits = previous.units;
      this.game.selectedUnitIds = previous.ids;
      this.game.selectedUnit = previous.unit;
      this.game.selectionMode = previous.mode;
    }
  }

  applyPlayCard(playerId, payload) {
    const cards = this.game.cardSystems?.[playerId]
      ?? (playerId === this.localPlayerId ? this.game.cardSystem : null);
    return Boolean(cards?.playFromNetworkPayload?.(payload));
  }

  applyDiscardCard(playerId, payload) {
    const cards = this.game.cardSystems?.[playerId]
      ?? (playerId === this.localPlayerId ? this.game.cardSystem : null);
    return Boolean(cards?.discardFromNetworkPayload?.(payload));
  }

  commandRejectionReason(command, playerId) {
    if (command?.name !== COMMAND.PLAY_CARD) return 'game_rule_rejected';
    const cards = this.game.cardSystems?.[playerId]
      ?? (playerId === this.localPlayerId ? this.game.cardSystem : null);
    return cards?.lastNetworkPlayRejectionReason ?? 'game_rule_rejected';
  }

  send(playerId, payload) {
    if (!playerId) return false;
    const serverSeq = (this.serverSeqByPlayer.get(playerId) ?? 0) + 1;
    this.serverSeqByPlayer.set(playerId, serverSeq);
    const message = {
      ...payload,
      gameProtocolVersion: GAME_PROTOCOL_VERSION,
      matchId: this.matchId,
      serverSeq,
      serverTick: this.builder.tick
    };
    if (playerId === this.localPlayerId) return true;
    return this.sendToPlayer?.(playerId, message) ?? false;
  }

  broadcast(payload) {
    this.playerIds().forEach((playerId) => this.send(playerId, payload));
  }

  playerIds() {
    return Object.keys(this.game.players ?? {});
  }
}

function diffPrivateState(previous, current) {
  const changes = {};
  Object.keys(current).forEach((key) => {
    if (key === 'playerId') return;
    if (JSON.stringify(previous?.[key]) === JSON.stringify(current[key])) return;
    changes[key] = current[key];
  });
  return changes;
}
