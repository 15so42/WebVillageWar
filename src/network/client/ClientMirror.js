import * as THREE from 'three';
import {
  CARD_DEFINITIONS,
  ENCHANTMENTS,
  PLAYER_ABILITY_DEFINITIONS,
  TEAMS,
  UNIT_DEFINITIONS
} from '../../data/gameData.js';
import { triggerUnitHitFlash } from '../../art/visualRegistry.js';
import { UnitEntity } from '../../entities/UnitEntity.js';
import { SYNC, VISUAL_STATE_FROM_CODE } from '../protocol/syncConfig.js';
import { applyNetworkFx } from './NetworkFxRelay.js';
import { ProjectileMirror } from './ProjectileMirror.js';

export class ClientMirror {
  constructor(game) {
    this.game = game;
    this.records = new Map();
    this.entityRevisions = new Map();
    this.projectiles = new ProjectileMirror(game);
    this.estimatedRttMs = null;
  }

  applyFullSnapshot(snapshot) {
    if (!snapshot?.world) return;
    this.game.cardSystem?.cancelActiveDrag?.();
    this.clearWorldMirrors();
    (snapshot.world.units ?? []).forEach((state) => {
      this.applyUnitPatch({
        entityId: state.unitId,
        entityRevision: state.entityRevision ?? 1,
        operation: 'spawn',
        changes: state
      });
    });
    Object.entries(snapshot.world.structures ?? {}).forEach(([entityId, state]) => {
      this.applyStructurePatch({ entityId, changes: state });
    });
    this.applyAltarPatch({ changes: { altars: snapshot.world.altars ?? [] } });
    this.game.effects?.replaceNetworkAreaEffects?.(snapshot.world.areaEffects ?? []);
    (snapshot.world.projectiles ?? []).forEach((state) => this.projectiles.spawn(state));
    this.applyMatchPatch({ changes: snapshot.world.flow ?? {} });
    this.applyPlayersPublic(snapshot.world.playersPublic ?? []);
    this.applyTransformStream({
      serverTick: snapshot.serverTick,
      sampleSeq: snapshot.sampleSeq,
      sampleTimeMs: snapshot.sampleTimeMs,
      transforms: snapshot.transforms ?? [],
      projectiles: snapshot.projectileTransforms ?? []
    }, { snap: true });
    (snapshot.motionStates ?? []).forEach((state) => {
      if (state.type === 'motion_event') this.applyMotionEvent(state);
    });
    this.applyPrivateState(snapshot.privateState);
  }

  applyStatePatch(patch) {
    if (!patch) return true;
    if (patch.entityType === 'unit') return this.applyUnitPatch(patch);
    if (patch.entityType === 'structure') return this.applyStructurePatch(patch);
    if (patch.entityType === 'altars') return this.applyAltarPatch(patch);
    if (patch.entityType === 'match') return this.applyMatchPatch(patch);
    if (patch.entityType === 'players_public') {
      this.applyPlayersPublic(patch.changes?.players ?? []);
      return true;
    }
    return true;
  }

  applyUnitPatch(patch) {
    const currentRevision = this.entityRevisions.get(patch.entityId) ?? 0;
    if (patch.entityRevision && patch.entityRevision <= currentRevision) return true;
    if (patch.entityRevision && currentRevision && patch.entityRevision !== currentRevision + 1) return false;
    if (patch.operation === 'remove') {
      this.removeMirrorUnit(patch.entityId);
      if (patch.entityRevision) this.entityRevisions.set(patch.entityId, patch.entityRevision);
      return true;
    }
    let record = this.records.get(patch.entityId);
    const state = patch.changes ?? {};
    if (!record) {
      record = this.spawnMirrorUnit({
        id: patch.entityId,
        team: state.team,
        type: state.type,
        ownerPlayerId: state.ownerPlayerId,
        controllerPlayerId: state.controllerPlayerId
      });
      if (!record) return false;
      this.records.set(patch.entityId, record);
    }
    this.applyUnitState(record.unit, state);
    if (Array.isArray(state.position) && !record.hasTransform) {
      record.authoritativePosition.copy(record.unit.mesh.position);
      record.hasTransform = true;
    }
    if (patch.entityRevision) this.entityRevisions.set(patch.entityId, patch.entityRevision);
    return true;
  }

  applyUnitState(unit, state) {
    if ('health' in state) unit.health = state.health;
    if ('maxHealth' in state) unit.attributes?.setBase?.('maxHealth', state.maxHealth);
    if ('shield' in state) unit.shield = state.shield;
    if ('maxShield' in state) unit.attributes?.setBase?.('maxShield', state.maxShield);
    if ('maxDurability' in state) unit.attributes?.setBase?.('maxDurability', state.maxDurability);
    if ('durability' in state && unit.weapon) {
      unit.weapon.durability = Math.max(0, Math.min(unit.weapon.maxDurability, Number(state.durability) || 0));
    }
    if ('underConstruction' in state || 'buildProgress' in state) {
      unit.underConstruction = 'underConstruction' in state
        ? Boolean(state.underConstruction)
        : Boolean(unit.underConstruction);
      unit.buildProgress = Number.isFinite(state.buildProgress)
        ? Math.max(0, Math.min(1, state.buildProgress))
        : (unit.underConstruction ? (unit.buildProgress ?? 0) : 1);
      this.game.buildings?.applyNetworkConstructionState?.(
        unit,
        unit.underConstruction,
        unit.buildProgress
      );
    }
    if ('ownerPlayerId' in state) unit.ownerPlayerId = state.ownerPlayerId;
    if ('controllerPlayerId' in state) unit.controllerPlayerId = state.controllerPlayerId;
    if ('playerColorIndex' in state) this.game.applyUnitPlayerColor?.(unit, state.playerColorIndex);
    if ('factionId' in state) unit.factionId = state.factionId;
    if ('visualState' in state) unit.visualState = state.visualState;
    if ('selected' in state || 'selectedByPlayerId' in state) {
      const selected = 'selected' in state ? Boolean(state.selected) : Boolean(state.selectedByPlayerId);
      this.game.applyUnitSelectionState?.(
        unit,
        selected,
        selected ? (state.selectedByPlayerId ?? unit.selectedByPlayerId) : null
      );
    }
    if ('isGuarding' in state) {
      unit.controlMode = state.isGuarding ? 'guard' : 'normal';
      this.game.applyUnitGuardVisualState?.(unit, state.isGuarding);
    }
    if (Array.isArray(state.position)) {
      unit.mesh.position.x = state.position[0];
      if (state.position.length >= 3) {
        unit.mesh.position.y = state.position[1];
        unit.mesh.position.z = state.position[2];
      } else {
        unit.mesh.position.z = state.position[1];
      }
    }
    if (Number.isFinite(state.yaw)) unit.mesh.rotation.y = state.yaw;
    if (Array.isArray(state.effects)) unit.networkEffects = state.effects.map((effect) => ({ ...effect }));
    if (Array.isArray(state.enchantments)) this.applyEnchantLabels(unit, state.enchantments);
    else if (Array.isArray(state.enchantLabels)) this.applyEnchantLabels(unit, state.enchantLabels);
    if (state.animation) this.applyAnimation(unit, state.animation);
    unit.alive = state.alive !== false && unit.health > 0;
    unit.statusUiDirty = true;
  }

  applyEnchantLabels(unit, labels) {
    unit.enchantments.clear();
    labels.forEach((entry) => {
      const key = typeof entry === 'string' ? entry : entry.key;
      if (!key) return;
      unit.enchantments.set(key, {
        id: key,
        name: typeof entry === 'string'
          ? (ENCHANTMENTS[key]?.name ?? key)
          : (entry.name ?? ENCHANTMENTS[key]?.name ?? key),
        level: typeof entry === 'string' ? 1 : (entry.level ?? entry.stacks ?? 1),
        hidden: false,
        networkOnly: true
      });
    });
  }

  applyAnimation(unit, animation) {
    if (!unit.visualRoot) return;
    const current = unit.visualRoot.userData.animation;
    const animationKey = animation.animationKey ?? animation.name ?? 'idle';
    if (current?.name === animationKey && current?.startTick === animation.startTick) return;
    unit.visualRoot.userData.animation = {
      name: animationKey,
      time: 0,
      duration: animation.duration ?? 0.35,
      playbackRate: animation.playbackRate ?? 1,
      loop: Boolean(animation.loop),
      startTick: animation.startTick
    };
  }

  applyStructurePatch(patch) {
    const structure = patch.entityId === 'player-base' ? this.game.playerBase : this.game.enemyCamp;
    if (!structure) return true;
    const changes = patch.changes ?? {};
    if ('health' in changes) structure.health = changes.health;
    if ('maxHealth' in changes) structure.attributes?.setBase?.('maxHealth', changes.maxHealth);
    if ('durability' in changes) structure.structureDurability = changes.durability;
    if ('maxDurability' in changes) structure.maxStructureDurability = changes.maxDurability;
    return true;
  }

  applyAltarPatch(patch) {
    this.game.altars?.applyNetworkSnapshot?.(patch?.changes?.altars ?? []);
    return true;
  }

  applyMatchPatch(patch) {
    const changes = patch.changes ?? {};
    if ('waveIndex' in changes) this.game.wave = changes.waveIndex;
    if ('waveScheduleIndex' in changes) this.game.waveIndex = changes.waveScheduleIndex;
    if ('elapsedTime' in changes) this.game.elapsedTime = changes.elapsedTime;
    if ('currentWave' in changes) {
      const incomingWave = changes.currentWave;
      const scheduledWave = incomingWave
        ? this.game.waveSchedule?.find?.((wave) => wave.index === incomingWave.index)
        : null;
      if (scheduledWave && incomingWave) Object.assign(scheduledWave, incomingWave);
      this.game.currentWave = scheduledWave ?? incomingWave;
    }
    if ('levelFinished' in changes) this.game.levelFinished = Boolean(changes.levelFinished);
    this.game.updateWavePreview?.();
    this.game.hudUpdateTimer = 0;
    this.game.updateHud?.(0);
    return true;
  }

  applyTransformStream(stream, { snap = false } = {}) {
    const receivedAtMs = performance.now();
    (stream?.transforms ?? []).forEach((transform) => {
      const record = this.records.get(transform.unitId);
      if (!record) return;
      if (Number.isFinite(stream.sampleSeq) && stream.sampleSeq <= record.sampleSeq) return;
      record.sampleSeq = Number.isFinite(stream.sampleSeq) ? stream.sampleSeq : record.sampleSeq + 1;
      const previousSampleTimeMs = record.sampleTimeMs;
      const nextSampleTimeMs = Number.isFinite(stream.sampleTimeMs)
        ? stream.sampleTimeMs
        : null;
      record.previousAuthoritativePosition.copy(record.authoritativePosition);
      record.sampleTimeMs = nextSampleTimeMs;
      record.receivedAtMs = receivedAtMs;
      record.authoritativePosition.set(
        transform.x,
        transform.y ?? record.unit.mesh.position.y,
        transform.z
      );
      record.authoritativeYaw = Number.isFinite(transform.yaw)
        ? transform.yaw
        : record.unit.mesh.rotation.y;
      record.visualState = VISUAL_STATE_FROM_CODE[transform.state] ?? record.visualState ?? 'idle';
      record.unit.visualState = record.visualState;
      const sampleDeltaSec = Number.isFinite(previousSampleTimeMs) && Number.isFinite(nextSampleTimeMs)
        ? (nextSampleTimeMs - previousSampleTimeMs) / 1_000
        : 0;
      if (!record.knockback && record.visualState === 'walk' && sampleDeltaSec > 0.001 && sampleDeltaSec <= 1) {
        sampledAuthoritativeVelocity.copy(record.authoritativePosition)
          .sub(record.previousAuthoritativePosition)
          .multiplyScalar(1 / sampleDeltaSec);
        record.authoritativeVelocity.lerp(sampledAuthoritativeVelocity, 0.45);
      } else {
        record.authoritativeVelocity.set(0, 0, 0);
      }
      if (snap || transform.snap || !record.hasTransform) {
        record.unit.mesh.position.copy(record.authoritativePosition);
        record.unit.mesh.rotation.y = record.authoritativeYaw;
        if (transform.snap) {
          record.knockback = null;
        }
      }
      record.hasTransform = true;
    });
    this.projectiles.applyTransforms(stream?.projectiles ?? [], { snap });
  }

  applyMotionEvent(message) {
    const record = this.records.get(message?.unitId);
    if (!record || !acceptMotionRevision(record, message.revision)) return;
    const position = readMotionPoint(message.position, record.unit.mesh.position);
    record.authoritativePosition.copy(position);
    record.authoritativeYaw = Number.isFinite(message.yaw)
      ? message.yaw
      : record.authoritativeYaw;
    record.visualState = VISUAL_STATE_FROM_CODE[message.state] ?? record.visualState ?? 'idle';
    record.unit.visualState = record.visualState;
    record.authoritativeVelocity.set(0, 0, 0);

    if (message.event === 'knockback_start') {
      const receivedAtMs = performance.now();
      record.receivedAtMs = receivedAtMs;
      record.hasTransform = true;
      record.knockback = { receivedAtMs };
      return;
    }

    record.knockback = null;
  }

  applyTimeSync(sample) {
    const receivedAtMs = performance.now();
    const clientSentAtMs = Number(sample?.clientSentAtMs);
    if (!Number.isFinite(clientSentAtMs)) return;
    const rttMs = receivedAtMs - clientSentAtMs;
    if (rttMs < 0 || rttMs > 5_000) return;
    if (!Number.isFinite(this.estimatedRttMs)) {
      this.estimatedRttMs = rttMs;
      return;
    }
    const alpha = rttMs < this.estimatedRttMs ? 0.35 : 0.08;
    this.estimatedRttMs += (rttMs - this.estimatedRttMs) * alpha;
  }

  estimatedOneWayLatencyMs() {
    if (!Number.isFinite(this.estimatedRttMs)) return 0;
    return Math.min(SYNC.maxPositionLeadMs, Math.max(0, this.estimatedRttMs * 0.5));
  }

  applyPrivateState(state) {
    const localPlayerId = this.game.localPlayerId ?? this.game.localPlayerSlot;
    if (!state || state.playerId !== localPlayerId) return;
    const cards = this.game.cardSystem;
    if ('nextClientSeq' in state) {
      this.game.networkBridge?.commandSender?.restoreSequence?.(state.nextClientSeq);
    }
    if (cards && 'energy' in state) {
      cards.energy = state.energy;
      cards.updateEnergyUi?.(true);
      cards.updateCardAffordability?.();
    }
    if (cards && state.zones) {
      cards.handCards = cloneCards(state.zones.hand);
      cards.drawPile = cloneCards(state.zones.drawPile);
      cards.discardPile = cloneCards(state.zones.discardPile);
      cards.temporaryCards = cloneCards(state.zones.temporary);
      cards.exilePile = cloneCards(state.zones.exile);
      cards.renderHand?.();
      cards.renderTemporaryCards?.();
      cards.updatePileUi?.();
    }
    if (cards && Array.isArray(state.cooldowns)) {
      cards.applyCooldownSnapshot?.(state.cooldowns);
    }
    const run = this.game.players?.[localPlayerId];
    if (run) {
      if ('silver' in state) run.silver = state.silver;
      if ('strategyUi' in state) run.strategyEvent = deserializeStrategy(state.strategyUi);
      if ('runShopState' in state || 'runShopUi' in state) {
        const shopState = state.runShopState ?? state.runShopUi ?? {};
        run.runShopFreeReward = Boolean(shopState.freeReward);
        run.runShopActiveCategory = shopState.activeCategory ?? null;
        run.runShopChoices = cloneChoices(shopState.choices);
      }
    }
    if ('runShopState' in state || 'runShopUi' in state) {
      const shopState = state.runShopState ?? state.runShopUi ?? {};
      this.game.runShopNetworkOfferId = shopState.offerId ?? null;
      this.game.runShopNetworkRevision = shopState.revision ?? null;
    }
    if ('silver' in state) this.game.updateSilverHud?.();
    if (Array.isArray(state.abilities)) this.applyAbilityState(state.abilities);
    this.game.applyNetworkPrivateUi?.(state);
    this.game.networkBridge?.coopStatusUi?.render?.();
  }

  applyTransaction(transaction) {
    (transaction?.results ?? []).forEach((result) => {
      if (result.kind === 'damage_applied' || result.kind === 'healing_applied') {
        const record = this.records.get(result.targetId);
        const structure = result.targetId === 'player-base'
          ? this.game.playerBase
          : (result.targetId === 'enemy-camp' ? this.game.enemyCamp : null);
        const target = record?.unit ?? structure;
        if (!target) return;
        if (Number.isFinite(result.healthAfter)) target.health = result.healthAfter;
        if (Number.isFinite(result.shieldAfter)) target.shield = result.shieldAfter;
        if (Number.isFinite(result.durabilityAfter)) target.structureDurability = result.durabilityAfter;
        if (result.kind === 'damage_applied' && record?.unit && didLoseHealthOrShield(result)) {
          triggerUnitHitFlash(record.unit, 0.1);
        }
        target.statusUiDirty = true;
      }
    });
  }

  applyEvent(event) {
    if (event.name?.startsWith('fx_')) applyNetworkFx(this.game, event);
    if (event.name === 'projectile_spawn') this.projectiles.spawn(event.projectile);
    if (event.name === 'projectile_despawn') this.projectiles.remove(event.projectileId);
    if (event.name === 'unit_died') this.removeMirrorUnit(event.unitId);
    if (event.name === 'animation_changed' || event.name === 'play_anim') {
      const unit = this.records.get(event.unitId)?.unit;
      if (unit) this.applyAnimation(unit, {
        animationKey: event.animationKey ?? event.anim,
        startTick: event.startTick ?? event.serverTick,
        playbackRate: event.playbackRate ?? 1,
        loop: event.loop ?? false,
        duration: event.duration
      });
    }
  }

  applyCommandRejected(message) {
    const labels = {
      card_cooldown: '卡牌仍在冷却',
      insufficient_energy: '能量不足',
      invalid_target_point: '目标位置无效',
      card_effect_rejected: '卡牌效果未能生效'
    };
    const reason = labels[message.reasonCode] ?? message.reasonCode;
    this.game.cardSystem?.setHint?.(`Host 拒绝操作：${reason}`, 'network-command');
  }

  applyPlayersPublic(rows) {
    this.game.networkBridge?.updatePlayersPublic?.(rows);
  }

  applyAbilityState(rows) {
    const abilities = this.game.abilities;
    if (!abilities?.abilities || !Array.isArray(rows)) return;
    abilities.abilities.clear();
    rows.forEach((row) => {
      const definition = PLAYER_ABILITY_DEFINITIONS[row.id];
      if (!definition) return;
      abilities.abilities.set(row.id, {
        ...definition,
        stacks: Math.max(0, Number(row.stacks) || 0),
        expiresAt: row.expiresAt ?? null
      });
    });
    abilities.updateUi?.();
  }

  updateFrame(dt = 0) {
    const clientNowMs = performance.now();
    const oneWayLatencyMs = this.estimatedOneWayLatencyMs();
    this.records.forEach((record) => {
      if (!record.unit.alive) return;
      updateNetworkMotion(record, dt, clientNowMs, oneWayLatencyMs);
      record.unit.visualState = record.visualState ?? 'idle';
      record.unit.updateNetworkVisual?.(dt);
      this.game.updateUnitStatusElement?.(record.unit, dt);
    });
    this.game.updateStructureStatusElement?.(this.game.playerBase, dt);
    this.game.updateStructureStatusElement?.(this.game.enemyCamp, dt);
    this.game.altars?.updateNetworkVisuals?.(dt);
    this.projectiles.updateFrame(dt);
  }

  spawnMirrorUnit({ id, team, type, ownerPlayerId, controllerPlayerId }) {
    if (!UNIT_DEFINITIONS[type]) return null;
    const position = new THREE.Vector3(0, 0, team === TEAMS.PLAYER ? 28 : -28);
    const unit = new UnitEntity({ type, team, position });
    unit.id = id;
    unit.ownerPlayerId = ownerPlayerId;
    unit.controllerPlayerId = controllerPlayerId ?? ownerPlayerId;
    unit.alive = true;
    this.game.attachUnitStatus?.(unit);
    this.game.registerUnit(unit, { networkMirror: true });
    return {
      unit,
      visualState: 'idle',
      authoritativePosition: position.clone(),
      previousAuthoritativePosition: position.clone(),
      authoritativeVelocity: new THREE.Vector3(),
      authoritativeYaw: unit.mesh.rotation.y,
      knockback: null,
      motionRevision: 0,
      sampleSeq: -1,
      sampleTimeMs: null,
      receivedAtMs: performance.now(),
      hasTransform: false
    };
  }

  removeMirrorUnit(id) {
    const record = this.records.get(id);
    if (!record) return;
    record.unit.alive = false;
    this.game.unitRegistry?.unregister(record.unit);
    this.records.delete(id);
  }

  clearWorldMirrors() {
    [...this.records.keys()].forEach((id) => this.removeMirrorUnit(id));
    this.records.clear();
    this.entityRevisions.clear();
    this.projectiles.clear();
  }

  destroy() {
    this.clearWorldMirrors();
  }
}

function cloneCards(cards) {
  return (cards ?? []).map((card) => ({
    ...(CARD_DEFINITIONS.find((definition) => definition.id === (card.id ?? card.cardDefinitionId)) ?? {}),
    ...card,
    instanceId: card.instanceId ?? card.cardInstanceId,
    id: card.id ?? card.cardDefinitionId
  }));
}

function updateNetworkMotion(record, dt, clientNowMs, oneWayLatencyMs) {
  const safeDt = Math.max(0, Math.min(0.05, dt));
  const moving = record.visualState === 'walk' && !record.knockback;
  sampledMotionPosition.copy(record.authoritativePosition);
  if (moving) {
    const sampleAgeMs = Math.max(0, clientNowMs - record.receivedAtMs);
    const leadMs = Math.min(SYNC.maxPositionLeadMs, sampleAgeMs + oneWayLatencyMs);
    extrapolatedPosition.copy(record.authoritativeVelocity).multiplyScalar(leadMs / 1_000);
    if (extrapolatedPosition.lengthSq() > SYNC.maxPositionLeadDistance ** 2) {
      extrapolatedPosition.setLength(SYNC.maxPositionLeadDistance);
    }
    sampledMotionPosition.add(extrapolatedPosition);
  }

  const correctionRate = record.knockback
    ? SYNC.knockbackCorrectionRate
    : (moving ? SYNC.positionCorrectionRate : SYNC.stopCorrectionRate);
  const maxCorrectionSpeed = record.knockback
    ? SYNC.maxKnockbackCorrectionSpeed
    : (moving ? SYNC.maxPositionCorrectionSpeed : SYNC.maxStopCorrectionSpeed);
  positionCorrection.copy(sampledMotionPosition)
    .sub(record.unit.mesh.position)
    .multiplyScalar(exponentialAlpha(correctionRate, safeDt))
    .clampLength(0, maxCorrectionSpeed * safeDt);
  record.unit.mesh.position.add(positionCorrection);
  record.unit.mesh.rotation.y += shortestAngleDelta(
    record.unit.mesh.rotation.y,
    record.authoritativeYaw
  ) * exponentialAlpha(SYNC.rotationCorrectionRate, safeDt);
}

function acceptMotionRevision(record, revision) {
  const nextRevision = Number(revision);
  if (Number.isFinite(nextRevision) && nextRevision <= record.motionRevision) return false;
  record.motionRevision = Number.isFinite(nextRevision)
    ? nextRevision
    : record.motionRevision + 1;
  return true;
}

function readMotionPoint(value, fallback) {
  if (Array.isArray(value) && value.length >= 3) {
    const x = Number(value[0]);
    const y = Number(value[1]);
    const z = Number(value[2]);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      return new THREE.Vector3(x, y, z);
    }
  }
  return fallback?.clone?.() ?? null;
}

function exponentialAlpha(rate, dt) {
  return 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
}

function shortestAngleDelta(from, to) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

const sampledMotionPosition = new THREE.Vector3();
const sampledAuthoritativeVelocity = new THREE.Vector3();
const extrapolatedPosition = new THREE.Vector3();
const positionCorrection = new THREE.Vector3();

function cloneChoices(choices) {
  return (choices ?? []).map((choice) => ({
    ...choice,
    card: choice.card ? cloneCards([choice.card])[0] : null
  }));
}

function deserializeStrategy(state) {
  if (!state) return null;
  return {
    ...state,
    networkInteractionId: state.rewardId,
    networkRevision: state.revision,
    choices: cloneChoices(state.choices)
  };
}

function didLoseHealthOrShield(result) {
  const healthLost = Number.isFinite(result.healthBefore)
    && Number.isFinite(result.healthAfter)
    && result.healthAfter < result.healthBefore;
  const shieldLost = Number.isFinite(result.shieldBefore)
    && Number.isFinite(result.shieldAfter)
    && result.shieldAfter < result.shieldBefore;
  return healthLost || shieldLost;
}
