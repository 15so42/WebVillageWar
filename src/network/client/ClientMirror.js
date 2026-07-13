import * as THREE from 'three';
import { TEAMS, UNIT_DEFINITIONS } from '../../data/gameData.js';
import { UnitEntity } from '../../entities/UnitEntity.js';
import { SYNC, VISUAL_STATE_FROM_CODE } from '../protocol/syncConfig.js';

export class ClientMirror {
  constructor(game) {
    this.game = game;
    this.records = new Map();
    this.knownWorld = new Map();
    this.lastTransformTime = 0;
    this.renderTime = performance.now();
  }

  applyWorldSnapshot(snapshot) {
    if (!snapshot) return;
    const seen = new Set();
    (snapshot.units ?? []).forEach((row) => {
      const [id, team, type, ownerPlayerId, hp, maxHp, shield, underConstruction] = row;
      seen.add(id);
      let record = this.records.get(id);
      if (!record) {
        record = this.spawnMirrorUnit({ id, team, type, ownerPlayerId });
        this.records.set(id, record);
      }
      const unit = record.unit;
      unit.health = hp;
      unit.maxHealth = maxHp;
      unit.shield = shield;
      unit.underConstruction = underConstruction === 1;
      unit.alive = hp > 0;
      unit.ownerPlayerId = ownerPlayerId ?? unit.ownerPlayerId;
      this.knownWorld.set(id, { team, type, ownerPlayerId, hp, maxHp, shield });
      unit.statusUiDirty = true;
    });
    this.records.forEach((record, id) => {
      if (!seen.has(id) && record.unit.alive) {
        this.removeMirrorUnit(id);
      }
    });
    if (snapshot.playerBase && this.game.playerBase) {
      this.game.playerBase.health = snapshot.playerBase.hp;
      this.game.playerBase.maxHealth = snapshot.playerBase.maxHp;
      this.game.playerBase.structureDurability = snapshot.playerBase.durability;
      this.game.playerBase.maxStructureDurability = snapshot.playerBase.maxDurability;
    }
    if (snapshot.enemyCamp && this.game.enemyCamp) {
      this.game.enemyCamp.health = snapshot.enemyCamp.hp;
      this.game.enemyCamp.maxHealth = snapshot.enemyCamp.maxHp;
    }
    if (snapshot.wave) {
      this.game.wave = snapshot.wave.index;
    }
    this.applyPlayersPublic(snapshot.playersPublic);
  }

  applyTransformSnapshot(snapshot) {
    if (!snapshot?.transforms) return;
    const serverTime = snapshot.serverTime ?? Date.now();
    snapshot.transforms.forEach((row) => {
      const [id, x, z, yaw, visualCode, animPhase] = row;
      let record = this.records.get(id);
      if (!record) {
        const world = this.knownWorld.get(id);
        if (!world) return;
        record = this.spawnMirrorUnit({
          id,
          team: world.team,
          type: world.type,
          ownerPlayerId: world.ownerPlayerId
        });
        this.records.set(id, record);
      }
      record.prev = record.next
        ? { ...record.next }
        : { x, z, yaw, t: serverTime - 1000 / SYNC.transformHz };
      record.next = { x, z, yaw, t: serverTime };
      record.visualState = VISUAL_STATE_FROM_CODE[visualCode] ?? 'idle';
      record.animPhase = animPhase ?? 0;
      record.unit.visualState = record.visualState;
    });
    this.lastTransformTime = serverTime;
  }

  applyFullSnapshot(bundle) {
    if (bundle?.world) this.applyWorldSnapshot(bundle.world);
    if (bundle?.transform) this.applyTransformSnapshot(bundle.transform);
  }

  applyPrivateState(state) {
    if (!state || state.playerSlot !== this.game.localPlayerSlot) return;
    const cards = this.game.cardSystem;
    if (!cards || !Array.isArray(state.hand)) return;
    cards.energy = state.energy;
    cards.handCards = state.hand.map((card) => ({ ...card }));
    cards.renderHand?.();
    cards.updateEnergyUi?.(true);
    const run = this.game.players?.[state.playerSlot];
    if (run) run.silver = state.silver;
    this.game.updateSilverHud?.();
  }

  applyEvent(event) {
    switch (event.name) {
      case 'unit_died': {
        const record = this.records.get(event.unitId);
        if (record) this.removeMirrorUnit(event.unitId);
        break;
      }
      case 'play_anim': {
        const record = this.records.get(event.unitId);
        if (!record) break;
        const root = record.unit.visualRoot;
        root.userData.animation = {
          name: event.anim,
          time: 0,
          duration: event.duration ?? 0.35
        };
        break;
      }
      case 'fx_move': {
        this.game.effects?.spawnMoveDestination?.(
          new THREE.Vector3(event.x, 0, event.z),
          event.radius ?? 1.2
        );
        break;
      }
      default:
        break;
    }
  }

  updateFrame(dt) {
    this.renderTime = performance.now();
    const delay = SYNC.clientInterpBufferMs;
    const sampleTime = this.renderTime - delay;
    this.records.forEach((record) => {
      if (!record.unit.alive) return;
      const pos = this.sampleTransform(record, sampleTime);
      if (!pos) return;
      record.unit.mesh.position.x = pos.x;
      record.unit.mesh.position.z = pos.z;
      record.unit.mesh.position.y = this.game.groundHeightAt(record.unit.mesh.position);
      record.unit.mesh.rotation.y = pos.yaw;
      record.unit.visualState = record.visualState ?? 'idle';
    });
    this.game.updateStructureStatusElement?.(this.game.playerBase, dt);
    this.game.updateStructureStatusElement?.(this.game.enemyCamp, dt);
  }

  sampleTransform(record, sampleTime) {
    const { prev, next } = record;
    if (!next) return null;
    if (!prev) return next;
    const span = Math.max(1, next.t - prev.t);
    const alpha = Math.max(0, Math.min(1, (sampleTime - prev.t) / span));
    return {
      x: prev.x + (next.x - prev.x) * alpha,
      z: prev.z + (next.z - prev.z) * alpha,
      yaw: lerpAngle(prev.yaw, next.yaw, alpha)
    };
  }

  spawnMirrorUnit({ id, team, type, ownerPlayerId }) {
    const definition = UNIT_DEFINITIONS[type];
    if (!definition) return { unit: null };
    const position = new THREE.Vector3(0, 0, team === TEAMS.PLAYER ? 28 : -28);
    const unit = new UnitEntity({ type, team, position });
    unit.id = id;
    unit.ownerPlayerId = ownerPlayerId;
    unit.alive = true;
    this.game.attachUnitStatus?.(unit);
    this.game.registerUnit(unit);
    return { unit, prev: null, next: null, visualState: 'idle', animPhase: 0 };
  }

  removeMirrorUnit(id) {
    const record = this.records.get(id);
    if (!record) return;
    const unit = record.unit;
    unit.alive = false;
    this.game.unitRegistry?.unregister(unit);
    this.records.delete(id);
    this.knownWorld.delete(id);
  }

  applyPlayersPublic(rows) {
    if (!Array.isArray(rows)) return;
    const ally = rows.find((row) => row.slot !== this.game.localPlayerSlot);
    const badge = document.querySelector('#coop-ally-badge');
    if (badge && ally) {
      badge.hidden = false;
      badge.textContent = `队友 能量 ${ally.energy} · 手牌 ${ally.handCount} · 银币 ${ally.silver}`;
    }
  }

  destroy() {
    [...this.records.keys()].forEach((id) => this.removeMirrorUnit(id));
    this.records.clear();
    this.knownWorld.clear();
  }
}

function lerpAngle(a, b, t) {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}
