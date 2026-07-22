import { SYNC } from '../protocol/syncConfig.js';
import { COMMAND, createCommand } from '../protocol/messages.js';

export class CommandSender {
  constructor({ playerId, matchId, getPhaseRevision, getInteractionState, send }) {
    this.playerId = playerId;
    this.matchId = matchId;
    this.getPhaseRevision = getPhaseRevision;
    this.getInteractionState = getInteractionState;
    this.send = send;
    this.seq = 1;
    this.lastMoveSentAt = Number.NEGATIVE_INFINITY;
  }

  sendCommand(name, payload = {}) {
    const now = performance.now();
    if (name === COMMAND.ISSUE_MOVE && now - this.lastMoveSentAt < SYNC.commandThrottleMs) return false;
    if (name === COMMAND.ISSUE_MOVE) this.lastMoveSentAt = now;
    const message = createCommand({
      matchId: this.matchId,
      playerId: this.playerId,
      clientSeq: this.seq,
      expectedPhaseRevision: this.getPhaseRevision?.() ?? 0,
      name,
      payload
    });
    this.seq += 1;
    return this.send(message);
  }

  restoreSequence(nextSeq) {
    const restored = Number(nextSeq);
    if (!Number.isSafeInteger(restored) || restored <= 0) return false;
    this.seq = Math.max(this.seq, restored);
    return true;
  }

  issueMove(unitIds, point, radius = 1.2) {
    return this.sendCommand(COMMAND.ISSUE_MOVE, {
      unitIds: normalizeUnitIds(unitIds),
      point: [point.x, point.y ?? 0, point.z],
      radius
    });
  }

  issueStop(unitIds) {
    return this.sendCommand(COMMAND.ISSUE_STOP, { unitIds: normalizeUnitIds(unitIds) });
  }

  issueGuard(unitIds) {
    return this.sendCommand(COMMAND.ISSUE_GUARD, { unitIds: normalizeUnitIds(unitIds) });
  }

  selectionSet(unitIds) {
    return this.sendCommand(COMMAND.SELECTION_SET, { unitIds: normalizeUnitIds(unitIds) });
  }

  playCard(payload) {
    return this.sendCommand(COMMAND.PLAY_CARD, payload);
  }

  discardCard(payload) {
    return this.sendCommand(COMMAND.DISCARD_CARD, payload);
  }

  strategyChoose(index) {
    const reward = this.getInteractionState?.()?.strategyEvent;
    const choice = reward?.choices?.[index];
    if (!reward?.networkInteractionId || !choice?.choiceId) return false;
    return this.sendCommand(COMMAND.REWARD_CHOOSE, {
      rewardId: reward.networkInteractionId,
      revision: reward.networkRevision,
      choiceId: choice.choiceId
    });
  }

  strategyReroll() {
    const reward = this.getInteractionState?.()?.strategyEvent;
    return this.sendCommand(COMMAND.REWARD_REROLL, {
      rewardId: reward?.networkInteractionId,
      revision: reward?.networkRevision
    });
  }

  strategySkip() {
    const reward = this.getInteractionState?.()?.strategyEvent;
    return this.sendCommand(COMMAND.REWARD_SKIP, {
      rewardId: reward?.networkInteractionId,
      revision: reward?.networkRevision
    });
  }

  shopCategory(category) {
    return this.sendCommand(COMMAND.SHOP_CATEGORY, { category });
  }

  shopChoice(index) {
    const shop = this.getInteractionState?.()?.runShop;
    const choice = shop?.choices?.[index];
    if (!choice?.choiceId) return false;
    return this.sendCommand(COMMAND.SHOP_CHOOSE, {
      offerId: shop.offerId,
      revision: shop.revision,
      choiceId: choice.choiceId
    });
  }

  shopEnergy() {
    return this.sendCommand(COMMAND.SHOP_ENERGY);
  }

  shopBack() {
    return this.sendCommand(COMMAND.SHOP_BACK);
  }

  shopRewardSkip() {
    return this.sendCommand(COMMAND.SHOP_REWARD_SKIP);
  }
}

function normalizeUnitIds(unitIds) {
  return [...new Set(unitIds ?? [])];
}
