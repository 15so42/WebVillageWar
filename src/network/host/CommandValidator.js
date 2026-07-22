import { COMMAND, GAME_PROTOCOL_VERSION, MSG } from '../protocol/messages.js';
import { findChoiceIndex } from './interactionIdentity.js';

const GAMEPLAY_COMMANDS = new Set([
  COMMAND.PLAY_CARD,
  COMMAND.DISCARD_CARD,
  COMMAND.ISSUE_MOVE,
  COMMAND.ISSUE_GUARD,
  COMMAND.ISSUE_STOP,
  COMMAND.SELECTION_SET,
  COMMAND.REWARD_CHOOSE,
  COMMAND.REWARD_REROLL,
  COMMAND.REWARD_SKIP,
  COMMAND.SHOP_CATEGORY,
  COMMAND.SHOP_CHOOSE,
  COMMAND.SHOP_ENERGY,
  COMMAND.SHOP_BACK,
  COMMAND.SHOP_REWARD_SKIP
]);

export class CommandValidator {
  constructor(game, { matchId, getPhaseRevision }) {
    this.game = game;
    this.matchId = matchId;
    this.getPhaseRevision = getPhaseRevision;
    this.lastSeqByPlayer = new Map();
  }

  validate(command, sourcePlayerId) {
    if (!command || command.type !== MSG.COMMAND) return reject('invalid_envelope');
    if (command.gameProtocolVersion !== GAME_PROTOCOL_VERSION) return reject('protocol_version_mismatch');
    if (command.matchId !== this.matchId) return reject('match_id_mismatch');
    if (!sourcePlayerId || !this.game.players?.[sourcePlayerId]) return reject('unknown_player');
    if (!GAMEPLAY_COMMANDS.has(command.name)) return reject('unsupported_command');
    const expectedRevision = Number(command.expectedPhaseRevision ?? 0);
    if (expectedRevision !== Number(this.getPhaseRevision?.() ?? 0)) return reject('phase_revision_mismatch');
    const seq = Number(command.clientSeq);
    if (!Number.isSafeInteger(seq) || seq <= 0) return reject('invalid_client_seq');
    if (seq <= (this.lastSeqByPlayer.get(sourcePlayerId) ?? 0)) return reject('out_of_order_command');

    const payload = command.payload ?? {};
    let result = { ok: true, payload };
    switch (command.name) {
      case COMMAND.ISSUE_MOVE:
        result = this.validateMove(sourcePlayerId, payload);
        break;
      case COMMAND.ISSUE_GUARD:
      case COMMAND.ISSUE_STOP:
        result = this.validateUnitCommand(sourcePlayerId, payload);
        break;
      case COMMAND.SELECTION_SET:
        result = this.validateSelection(sourcePlayerId, payload);
        break;
      case COMMAND.PLAY_CARD:
      case COMMAND.DISCARD_CARD:
        result = this.validateCard(sourcePlayerId, payload);
        break;
      case COMMAND.REWARD_CHOOSE:
        result = this.validateReward(sourcePlayerId, payload);
        break;
      case COMMAND.REWARD_REROLL:
      case COMMAND.REWARD_SKIP:
        result = this.validateRewardState(sourcePlayerId, payload);
        break;
      case COMMAND.SHOP_CHOOSE:
        result = this.validateShopChoice(sourcePlayerId, payload);
        break;
      case COMMAND.SHOP_REWARD_SKIP:
        result = this.validateShopReward(sourcePlayerId);
        break;
      default:
        break;
    }
    if (result.ok) this.lastSeqByPlayer.set(sourcePlayerId, seq);
    return result;
  }

  validateUnitCommand(playerId, payload) {
    if (!Array.isArray(payload.unitIds) || payload.unitIds.length < 1 || payload.unitIds.length > 200) {
      return reject('invalid_command_units');
    }
    const requested = new Set(payload.unitIds);
    if (requested.size !== payload.unitIds.length) return reject('invalid_command_units');
    const allowed = this.game.friendlyUnits.filter((unit) => (
      unit?.alive
      && requested.has(unit.id)
      && (unit.controllerPlayerId ?? unit.ownerPlayerId) === playerId
    ));
    if (allowed.length !== requested.size) return reject('unit_control_denied');
    return { ok: true, payload: { ...payload, unitIds: allowed.map((unit) => unit.id) } };
  }

  validateSelection(playerId, payload) {
    if (!Array.isArray(payload.unitIds) || payload.unitIds.length > 200) {
      return reject('invalid_selection_units');
    }
    const requested = new Set(payload.unitIds);
    if (requested.size !== payload.unitIds.length) return reject('invalid_selection_units');
    const allowed = this.game.friendlyUnits.filter((unit) => (
      unit?.alive
      && requested.has(unit.id)
      && (unit.controllerPlayerId ?? unit.ownerPlayerId) === playerId
    ));
    if (allowed.length !== requested.size) return reject('unit_control_denied');
    return { ok: true, payload: { unitIds: allowed.map((unit) => unit.id) } };
  }

  validateMove(playerId, payload) {
    const units = this.validateUnitCommand(playerId, payload);
    if (!units.ok) return units;
    const point = payload.point;
    if (!Array.isArray(point) || point.length < 3 || point.some((value) => !Number.isFinite(Number(value)))) {
      return reject('invalid_target_point');
    }
    return {
      ok: true,
      payload: {
        ...units.payload,
        point: [Number(point[0]), Number(point[1]), Number(point[2])]
      }
    };
  }

  validateCard(playerId, payload) {
    const cards = this.game.cardSystems?.[playerId]
      ?? (playerId === this.game.localPlayerSlot ? this.game.cardSystem : null);
    const instanceId = payload.cardInstanceId;
    if (!cards || typeof instanceId !== 'string') return reject('invalid_card_instance');
    const card = cards.findCardByInstanceId?.(instanceId);
    if (!card) return reject('card_not_owned_or_not_available');
    let normalizedPayload = payload;
    if (card.target === 'ground') {
      const point = payload.point;
      if (!Array.isArray(point) || point.length < 2 || point.slice(0, 2).some((value) => !Number.isFinite(Number(value)))) {
        return reject('invalid_target_point');
      }
      normalizedPayload = {
        ...payload,
        point: [Number(point[0]), Number(point[1])]
      };
    }
    if (payload.targetUnitId) {
      const target = [...this.game.friendlyUnits, ...this.game.enemyUnits]
        .find((unit) => unit.id === payload.targetUnitId && unit.alive);
      if (!target) return reject('target_not_found');
      if (
        card.target === 'friendly-unit'
        && (target.controllerPlayerId ?? target.ownerPlayerId) !== playerId
      ) {
        return reject('target_not_owned');
      }
    }
    return { ok: true, payload: normalizedPayload };
  }

  validateRewardState(playerId, payload) {
    const run = this.game.players?.[playerId];
    const event = playerId === this.game.localPlayerSlot
      ? (this.game.strategyEvent ?? run?.strategyEvent)
      : run?.strategyEvent;
    if (!event) return reject('reward_not_open');
    if (payload.rewardId && event.networkInteractionId !== payload.rewardId) return reject('stale_reward');
    if (payload.revision && event.networkRevision !== payload.revision) return reject('stale_reward_revision');
    return { ok: true, payload };
  }

  validateReward(playerId, payload) {
    const state = this.validateRewardState(playerId, payload);
    if (!state.ok) return state;
    const run = this.game.players?.[playerId];
    const event = playerId === this.game.localPlayerSlot
      ? (this.game.strategyEvent ?? run?.strategyEvent)
      : run?.strategyEvent;
    const choiceIndex = findChoiceIndex(event, payload.choiceId);
    if (choiceIndex < 0) return reject('reward_choice_not_found');
    return { ok: true, payload: { ...payload, choiceIndex } };
  }

  validateShopChoice(playerId, payload) {
    const run = this.game.players?.[playerId];
    const choices = playerId === this.game.localPlayerSlot ? this.game.runShopChoices : run?.runShopChoices;
    const choiceIndex = (choices ?? []).findIndex((choice) => choice?.choiceId === payload.choiceId);
    if (choiceIndex < 0 || choices[choiceIndex]?.disabled) return reject('shop_choice_not_found');
    return { ok: true, payload: { ...payload, choiceIndex } };
  }

  validateShopReward(playerId) {
    const run = this.game.players?.[playerId];
    const isLocal = playerId === this.game.localPlayerSlot;
    const freeReward = isLocal ? this.game.runShopFreeReward : run?.runShopFreeReward;
    return freeReward ? { ok: true, payload: {} } : reject('shop_reward_not_active');
  }
}

function reject(reasonCode) {
  return { ok: false, reasonCode };
}
