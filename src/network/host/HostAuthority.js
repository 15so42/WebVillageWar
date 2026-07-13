import * as THREE from 'three';
import { MSG } from '../protocol/messages.js';
import { SYNC } from '../protocol/syncConfig.js';
import { SnapshotBuilder } from './SnapshotBuilder.js';

export class HostAuthority {
  constructor(game, { sendToSlot, sendToAll }) {
    this.game = game;
    this.sendToSlot = sendToSlot;
    this.sendToAll = sendToAll;
    this.builder = new SnapshotBuilder(game);
    this.commandQueue = [];
    this.privateTimer = 0;
    this.hostFrozen = false;
    this.lastPrivateBySlot = new Map();
  }

  ingestCommand(command) {
    this.commandQueue.push(command);
  }

  freezeHost(waiting) {
    this.hostFrozen = waiting;
    this.sendToAll?.({
      type: MSG.HOST_WAITING,
      waiting
    });
  }

  update(dt) {
    if (this.hostFrozen) return;
    while (this.commandQueue.length) {
      const command = this.commandQueue.shift();
      this.applyCommand(command);
    }
    const outputs = this.builder.update(dt);
    outputs.forEach((entry) => {
      this.sendToAll?.({ type: entry.type, ...entry.payload });
    });
    this.privateTimer += dt;
    if (this.privateTimer >= 1 / SYNC.privateHz) {
      this.privateTimer = 0;
      this.flushPrivateStates();
    }
  }

  flushPrivateStates(force = false) {
    ['p1', 'p2'].forEach((slot) => {
      const payload = this.builder.buildPrivateState(slot);
      if (!payload) return;
      const signature = JSON.stringify(payload);
      if (!force && this.lastPrivateBySlot.get(slot) === signature) return;
      this.lastPrivateBySlot.set(slot, signature);
      this.sendToSlot?.(slot, { type: MSG.PRIVATE_STATE, ...payload });
    });
  }

  sendFullSnapshot(slot, sinceTick = 0) {
    const full = this.builder.buildFullSnapshot();
    this.sendToSlot?.(slot, { type: MSG.FULL_SNAPSHOT, ...full });
    this.sendToSlot?.(slot, {
      type: MSG.EVENT_CATCHUP,
      events: this.builder.eventsSince(sinceTick)
    });
    this.flushPrivateStates(true);
  }

  emitEvent(event) {
    const entry = this.builder.pushEvent(event);
    this.sendToAll?.({ type: MSG.EVENT, ...entry });
  }

  applyCommand(command) {
    const game = this.game;
    const slot = command.playerSlot ?? 'p2';
    switch (command.name) {
      case 'select_units':
        this.applySelectUnits(slot, command.payload);
        break;
      case 'issue_move':
        this.applyIssueMove(slot, command.payload);
        break;
      case 'issue_stop':
        this.applyIssueStop(slot);
        break;
      case 'play_card':
        this.applyPlayCard(slot, command.payload);
        break;
      case 'discard_card':
        this.applyDiscardCard(slot, command.payload);
        break;
      default:
        break;
    }
  }

  applySelectUnits(slot, payload) {
    const game = this.game;
    const run = game.players?.[slot];
    if (!run) return;
    const ids = new Set(payload?.unitIds ?? []);
    const units = game.friendlyUnits.filter((unit) => (
      unit.alive &&
      unit.ownerPlayerId === slot &&
      ids.has(unit.id)
    ));
    run.selectedUnits = units;
    run.selectedUnitIds = new Set(units.map((unit) => unit.id));
    run.selectedUnit = units[0] ?? null;
    run.selectionMode = units.length ? (payload?.mode ?? 'direct') : 'none';
    if (slot !== game.localPlayerSlot) return;
    game.selectedUnits = units;
    game.selectedUnitIds = new Set(run.selectedUnitIds);
    game.selectedUnit = run.selectedUnit;
    game.selectionMode = run.selectionMode;
    units.forEach((unit) => {
      unit.statusUiDirty = true;
    });
  }

  applyIssueMove(slot, payload) {
    const game = this.game;
    const run = game.players?.[slot];
    if (!run || !payload?.point) return;
    const previousSelection = game.selectedUnits;
    game.selectUnits(run.selectedUnits, { mode: run.selectionMode });
    const target = new THREE.Vector3(payload.point[0], 0, payload.point[2]);
    const moved = game.commandSelectedUnitsToPoint(target);
    if (slot !== game.localPlayerSlot) {
      game.selectUnits(previousSelection, { mode: game.selectionMode });
    }
  }

  applyIssueStop(slot) {
    const game = this.game;
    const run = game.players?.[slot];
    if (!run) return;
    const previousSelection = game.selectedUnits;
    game.selectUnits(run.selectedUnits, { mode: run.selectionMode });
    game.stopSelectedUnits();
    if (slot !== game.localPlayerSlot) {
      game.selectUnits(previousSelection, { mode: game.selectionMode });
    }
  }

  applyPlayCard(slot, payload) {
    const cards = this.game.cardSystems?.[slot];
    if (!cards || !payload?.cardInstanceId) return;
    const played = cards.playFromNetworkPayload(payload);
    if (played) {
      this.flushPrivateStates(true);
    }
  }

  applyDiscardCard(slot, payload) {
    const cards = this.game.cardSystems?.[slot];
    if (!cards || !payload?.cardInstanceId) return;
    const discarded = cards.discardFromNetworkPayload(payload);
    if (discarded) {
      this.flushPrivateStates(true);
    }
  }
}
