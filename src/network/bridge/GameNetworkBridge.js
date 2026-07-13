import { MSG } from '../protocol/messages.js';
import { ClientMirror } from '../client/ClientMirror.js';
import { CommandSender } from '../client/CommandSender.js';
import { installHostEffectsRelay } from '../client/NetworkFxRelay.js';
import { HostAuthority } from '../host/HostAuthority.js';
import { CoopPlayerStatusUi } from '../../systems/CoopPlayerStatusUi.js';

export class GameNetworkBridge {
  constructor({ role, localSlot, transport, roomId }) {
    this.role = role;
    this.localSlot = localSlot;
    this.transport = transport;
    this.roomId = roomId;
    this.game = null;
    this.mirror = null;
    this.host = null;
    this.sender = null;
    this.lastAckTick = 0;
    this.lastAckSeq = 0;
    this.unsubscribe = null;
    this.restoreEffectsRelay = null;
    this.coopStatusUi = null;
  }

  bindGame(game) {
    this.game = game;
    if (this.role === 'client') {
      this.mirror = new ClientMirror(game);
      this.sender = new CommandSender({
        slot: this.localSlot,
        send: (payload) => this.sendNet(payload)
      });
      game.networkClientMode = true;
    }
    if (this.role === 'host') {
      this.host = new HostAuthority(game, {
        sendToSlot: (slot, payload) => this.sendNet(payload, slot),
        sendToAll: (payload) => this.sendNet(payload, 'all')
      });
      this.restoreEffectsRelay = installHostEffectsRelay(
        game,
        (payload) => this.host?.emitEvent(payload)
      );
    }
    if (game.coop?.enabled) {
      this.coopStatusUi = new CoopPlayerStatusUi(game);
    }
    if (this.transport) {
      this.unsubscribe = this.transport.onMessage((message) => this.onTransportMessage(message));
    }
  }

  unbindGame() {
    this.unsubscribe?.();
    this.unsubscribe = null;
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

  sendNet(payload, to = 'all') {
    if (!this.transport?.connected) return false;
    return this.transport.send({
      type: MSG.NET_FORWARD,
      roomId: this.roomId,
      to,
      payload
    });
  }

  onTransportMessage(message) {
    if (message.type === MSG.NET_FORWARD) {
      this.handlePayload(message.payload, message.from);
      return;
    }
    if (message.type === MSG.FULL_SNAPSHOT) {
      this.handleFullSnapshot(message);
      return;
    }
    if (message.type === MSG.EVENT_CATCHUP) {
      (message.events ?? []).forEach((event) => this.mirror?.applyEvent(event));
      return;
    }
    if (message.type === MSG.HOST_WAITING) {
      this.game?.setPaused?.(Boolean(message.waiting), message.waiting ? '主机断线，等待重连…' : '');
    }
  }

  handlePayload(payload, from) {
    if (!payload) return;
    if (this.role === 'host' && payload.type === MSG.CMD) {
      this.host?.ingestCommand(payload);
      return;
    }
    if (this.role === 'host' && payload.type === 'client_reconnected') {
      this.host?.sendFullSnapshot(payload.playerSlot, payload.lastAckTick ?? 0);
      return;
    }
    if (this.role === 'client' && from === 'p1') {
      if (payload.type === MSG.SNAPSHOT_WORLD) {
        this.lastAckTick = payload.tick ?? this.lastAckTick;
        this.mirror?.applyWorldSnapshot(payload);
        this.updatePlayersPublic(payload.playersPublic);
        return;
      }
      if (payload.type === MSG.SNAPSHOT_TRANSFORM) {
        this.mirror?.applyTransformSnapshot(payload);
        return;
      }
      if (payload.type === MSG.PRIVATE_STATE && payload.playerSlot === this.localSlot) {
        this.mirror?.applyPrivateState(payload);
        return;
      }
      if (payload.type === MSG.EVENT) {
        this.mirror?.applyEvent(payload);
        return;
      }
    }
  }

  handleFullSnapshot(message) {
    this.lastAckTick = message.tick ?? 0;
    this.mirror?.applyFullSnapshot({
      world: message.world ?? message,
      transform: message.transform
    });
    const playersPublic = message.world?.playersPublic ?? message.playersPublic;
    if (playersPublic) {
      this.updatePlayersPublic(playersPublic);
    }
  }

  beforeTick(dt) {
    if (this.role === 'host') {
      this.host?.update(dt);
      this.coopStatusUi?.render();
    }
  }

  updateClientFrame(dt) {
    this.mirror?.updateFrame(dt);
    this.coopStatusUi?.render();
  }

  updatePlayersPublic(rows) {
    this.coopStatusUi?.updatePlayersPublic(rows);
  }

  get commandSender() {
    return this.sender;
  }

  notifyUnitDied(unitId) {
    this.host?.emitEvent({ name: 'unit_died', unitId });
  }

  notifyPlayAnim(unitId, anim, duration = 0.35) {
    this.host?.emitEvent({ name: 'play_anim', unitId, anim, duration });
  }

  onHostDisconnect(waiting) {
    this.host?.freezeHost(waiting);
  }

  onClientReconnected(slot, lastAckTick, lastAckSeq) {
    this.host?.sendFullSnapshot(slot, lastAckTick ?? 0);
    void lastAckSeq;
  }
}
