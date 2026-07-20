import { SYNC } from '../protocol/syncConfig.js';
import { MSG } from '../protocol/messages.js';

export class CommandSender {
  constructor({ slot, send }) {
    this.slot = slot;
    this.send = send;
    this.seq = 1;
    this.lastSentAt = 0;
  }

  sendCommand(name, payload = {}) {
    const now = performance.now();
    if (now - this.lastSentAt < SYNC.commandThrottleMs) {
      if (name === 'issue_move') return false;
    }
    this.lastSentAt = now;
    const message = {
      type: MSG.CMD,
      seq: this.seq,
      playerSlot: this.slot,
      clientTime: Date.now(),
      name,
      payload
    };
    this.seq += 1;
    return this.send(message);
  }

  selectUnits(unitIds, mode = 'direct') {
    return this.sendCommand('select_units', { unitIds, mode });
  }

  issueMove(point, radius = 1.2) {
    return this.sendCommand('issue_move', {
      point: [point.x, point.y ?? 0, point.z],
      radius
    });
  }

  issueStop() {
    return this.sendCommand('issue_stop', {});
  }

  playCard(payload) {
    return this.sendCommand('play_card', payload);
  }

  discardCard(payload) {
    return this.sendCommand('discard_card', payload);
  }

  strategyChoose(index) {
    return this.sendCommand('strategy_choose', { index });
  }

  strategyReroll() {
    return this.sendCommand('strategy_reroll', {});
  }

  strategySkip() {
    return this.sendCommand('strategy_skip', {});
  }

  shopCategory(category) {
    return this.sendCommand('shop_category', { category });
  }

  shopChoice(index) {
    return this.sendCommand('shop_choice', { index });
  }

  shopEnergy() {
    return this.sendCommand('shop_energy', {});
  }

  shopBack() {
    return this.sendCommand('shop_back', {});
  }

  shopClose(options = {}) {
    return this.sendCommand('shop_close', options);
  }
}
