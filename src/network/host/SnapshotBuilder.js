import {
  quantizePosition,
  quantizeYaw,
  SYNC,
  visualStateCode
} from '../protocol/syncConfig.js';
import { MSG } from '../protocol/messages.js';
import { ensureInteractionIdentity } from './interactionIdentity.js';

const NETWORK_KNOCKBACK_EPSILON_SQ = 0.0004;

export class SnapshotBuilder {
  constructor(game, { matchId = 'match' } = {}) {
    this.game = game;
    this.matchId = matchId;
    this.tick = 0;
    this.transformSeq = 0;
    this.transformTimer = 0;
    this.entityStates = new Map();
    this.entityRevisions = new Map();
    this.structureStates = new Map();
    this.structureRevisions = new Map();
    this.lastTransform = new Map();
    this.motionRevisions = new Map();
    this.lastMotionMode = new Map();
    this.lastWorldFlow = null;
    this.lastPlayersPublic = null;
    this.lastAltars = null;
  }

  update(dt) {
    this.tick += 1;
    const outputs = this.collectStateChanges();
    outputs.push(...this.collectMotionChanges());
    this.transformTimer += dt;
    const transformInterval = 1 / SYNC.transformHz;
    if (this.transformTimer >= transformInterval) {
      // Keep the fractional remainder so render-frame quantization does not
      // steadily lower the configured transform rate.
      this.transformTimer %= transformInterval;
      const stream = this.buildTransformStream({ includeUnits: true });
      if (stream.transforms.length || stream.projectiles.length) {
        outputs.push({ type: MSG.TRANSFORM_STREAM, payload: stream });
      }
    }
    return outputs;
  }

  collectMotionChanges() {
    const outputs = [];
    const sampleTimeMs = performance.now();
    this.allUnits().forEach((unit) => {
      if (!unit?.alive) return;
      const previousMode = this.lastMotionMode.get(unit.id) ?? 'idle';
      const knockbackActive = (unit.knockbackVelocity?.lengthSq?.() ?? 0) > NETWORK_KNOCKBACK_EPSILON_SQ;
      const mode = knockbackActive
        ? 'knockback'
        : (unit.visualState === 'walk' ? 'moving' : 'idle');

      if (previousMode === 'knockback' && mode !== 'knockback') {
        outputs.push({
          type: MSG.MOTION_EVENT,
          payload: motionEventFor(unit, 'knockback_end', sampleTimeMs, this.nextMotionRevision(unit.id))
        });
      }

      if (mode === 'knockback') {
        if (previousMode !== 'knockback') {
          outputs.push({
            type: MSG.MOTION_EVENT,
            payload: motionEventFor(unit, 'knockback_start', sampleTimeMs, this.nextMotionRevision(unit.id))
          });
        }
      } else if (mode === 'idle') {
        if (previousMode === 'moving') {
          outputs.push({
            type: MSG.MOTION_EVENT,
            payload: motionEventFor(unit, 'stop', sampleTimeMs, this.nextMotionRevision(unit.id))
          });
        }
      }
      this.lastMotionMode.set(unit.id, mode);
    });
    return outputs;
  }

  nextMotionRevision(unitId) {
    const revision = (this.motionRevisions.get(unitId) ?? 0) + 1;
    this.motionRevisions.set(unitId, revision);
    return revision;
  }

  buildFullMotionStates(sampleTimeMs) {
    return this.allUnits().filter((unit) => unit?.alive).map((unit) => {
      const revision = Math.max(1, this.motionRevisions.get(unit.id) ?? 0);
      this.motionRevisions.set(unit.id, revision);
      if ((unit.knockbackVelocity?.lengthSq?.() ?? 0) > NETWORK_KNOCKBACK_EPSILON_SQ) {
        return {
          type: MSG.MOTION_EVENT,
          ...motionEventFor(unit, 'knockback_start', sampleTimeMs, revision)
        };
      }
      return {
        type: MSG.MOTION_EVENT,
        ...motionEventFor(unit, 'stop', sampleTimeMs, revision)
      };
    });
  }

  collectStateChanges() {
    const outputs = [];
    const seen = new Set();
    this.allUnits().forEach((unit) => {
      if (!unit?.alive) return;
      seen.add(unit.id);
      const current = this.serializeUnitState(unit);
      const previous = this.entityStates.get(unit.id);
      if (!previous) {
        const revision = this.nextEntityRevision(unit.id);
        this.entityStates.set(unit.id, current);
        outputs.push({
          type: MSG.STATE_PATCH,
          payload: {
            entityType: 'unit',
            entityId: unit.id,
            entityRevision: revision,
            operation: 'spawn',
            changes: {
              ...current,
              position: [
                quantizePosition(unit.position.x),
                quantizePosition(unit.position.y),
                quantizePosition(unit.position.z)
              ],
              yaw: quantizeYaw(unit.mesh.rotation.y)
            }
          }
        });
        return;
      }
      const { changes, previousValues } = diffState(previous, current);
      if (!Object.keys(changes).length) return;
      const revision = this.nextEntityRevision(unit.id);
      this.entityStates.set(unit.id, current);
      outputs.push({
        type: MSG.STATE_PATCH,
        payload: {
          entityType: 'unit',
          entityId: unit.id,
          entityRevision: revision,
          operation: 'update',
          previousValues,
          changes
        }
      });
    });
    [...this.entityStates.keys()].forEach((unitId) => {
      if (seen.has(unitId)) return;
      const previous = this.entityStates.get(unitId);
      const revision = this.nextEntityRevision(unitId);
      this.entityStates.delete(unitId);
      this.lastTransform.delete(unitId);
      this.motionRevisions.delete(unitId);
      this.lastMotionMode.delete(unitId);
      outputs.push({
        type: MSG.STATE_PATCH,
        payload: {
          entityType: 'unit',
          entityId: unitId,
          entityRevision: revision,
          operation: 'remove',
          previousValues: previous,
          changes: { alive: false }
        }
      });
    });
    this.collectStructurePatches(outputs);
    this.collectFlowPatches(outputs);
    this.collectAltarPatches(outputs);
    return outputs;
  }

  collectAltarPatches(outputs) {
    const altars = this.game.altars?.snapshot?.() ?? [];
    if (statesEqual(altars, this.lastAltars)) return;
    outputs.push({
      type: MSG.STATE_PATCH,
      payload: {
        entityType: 'altars',
        entityId: 'altars',
        operation: this.lastAltars ? 'update' : 'spawn',
        changes: { altars }
      }
    });
    this.lastAltars = altars;
  }

  collectStructurePatches(outputs) {
    [
      ['player-base', this.game.playerBase],
      ['enemy-camp', this.game.enemyCamp]
    ].forEach(([id, structure]) => {
      if (!structure) return;
      const current = serializeStructure(structure);
      const previous = this.structureStates.get(id);
      if (previous && statesEqual(previous, current)) return;
      const revision = (this.structureRevisions.get(id) ?? 0) + 1;
      this.structureRevisions.set(id, revision);
      this.structureStates.set(id, current);
      const diff = previous ? diffState(previous, current) : { changes: current, previousValues: {} };
      outputs.push({
        type: MSG.STATE_PATCH,
        payload: {
          entityType: 'structure',
          entityId: id,
          entityRevision: revision,
          operation: previous ? 'update' : 'spawn',
          ...diff
        }
      });
    });
  }

  collectFlowPatches(outputs) {
    const flow = {
      waveIndex: this.game.wave ?? 0,
      waveScheduleIndex: this.game.waveIndex ?? 0,
      waveLabel: this.game.currentWave?.label ?? '',
      elapsedTime: Math.floor((this.game.elapsedTime ?? 0) * 4) / 4,
      currentWave: this.game.currentWave ? {
        index: this.game.currentWave.index ?? this.game.wave ?? 0,
        label: this.game.currentWave.label ?? '',
        kind: this.game.currentWave.kind ?? 'normal',
        count: this.game.currentWave.count ?? null
      } : null,
      levelFinished: Boolean(this.game.levelFinished)
    };
    if (!statesEqual(flow, this.lastWorldFlow)) {
      outputs.push({
        type: MSG.STATE_PATCH,
        payload: { entityType: 'match', entityId: this.matchId, operation: 'update', changes: flow }
      });
      this.lastWorldFlow = flow;
    }
    const playersPublic = this.collectPlayersPublic();
    if (!statesEqual(playersPublic, this.lastPlayersPublic)) {
      outputs.push({
        type: MSG.STATE_PATCH,
        payload: { entityType: 'players_public', entityId: 'players', operation: 'update', changes: { players: playersPublic } }
      });
      this.lastPlayersPublic = playersPublic;
    }
  }

  buildTransformStream({
    includeStatic = false,
    includeUnits = true,
    includeProjectiles = true
  } = {}) {
    const sampleTimeMs = performance.now();
    const transforms = [];
    if (includeUnits) {
      this.allUnits().forEach((unit) => {
        if (!unit?.alive) return;
        const previous = this.lastTransform.get(unit.id);
        const motionActive = (this.lastMotionMode.get(unit.id) ?? 'idle') !== 'idle';
        const current = transformFor(unit, previous, motionActive);
        const changed = !previous
          || Math.hypot(current.x - previous.x, current.z - previous.z) > SYNC.positionEpsilon
          || Math.abs(shortestYawDelta(previous.yaw, current.yaw)) > SYNC.yawEpsilon;
        if (includeStatic || changed || motionActive) {
          transforms.push(current);
          this.lastTransform.set(unit.id, current);
        }
      });
    }
    return {
      sampleSeq: ++this.transformSeq,
      sampleTimeMs,
      transforms,
      projectiles: includeProjectiles ? this.serializeProjectileTransforms() : []
    };
  }

  buildFullSnapshot(playerId) {
    const units = this.allUnits()
      .filter((unit) => unit?.alive)
      .map((unit) => ({
        ...this.serializeUnitState(unit, { includeTransform: true }),
        entityRevision: this.entityRevisions.get(unit.id) ?? 1
      }));
    const transformStream = this.buildTransformStream({ includeStatic: true });
    return {
      world: {
        units,
        projectiles: this.serializeProjectileStates(),
        areaEffects: this.game.areaEffects?.serializeNetworkState?.() ?? [],
        structures: {
          'player-base': serializeStructure(this.game.playerBase),
          'enemy-camp': serializeStructure(this.game.enemyCamp)
        },
        altars: this.game.altars?.snapshot?.() ?? [],
        flow: this.lastWorldFlow ?? {
          waveIndex: this.game.wave ?? 0,
          waveScheduleIndex: this.game.waveIndex ?? 0,
          waveLabel: this.game.currentWave?.label ?? '',
          elapsedTime: Math.floor((this.game.elapsedTime ?? 0) * 4) / 4,
          currentWave: this.game.currentWave ? {
            index: this.game.currentWave.index ?? this.game.wave ?? 0,
            label: this.game.currentWave.label ?? '',
            kind: this.game.currentWave.kind ?? 'normal',
            count: this.game.currentWave.count ?? null
          } : null,
          levelFinished: Boolean(this.game.levelFinished)
        },
        playersPublic: this.collectPlayersPublic()
      },
      sampleSeq: transformStream.sampleSeq,
      sampleTimeMs: transformStream.sampleTimeMs,
      transforms: transformStream.transforms,
      projectileTransforms: transformStream.projectiles,
      motionStates: this.buildFullMotionStates(transformStream.sampleTimeMs),
      privateState: this.buildPrivateState(playerId)
    };
  }

  serializeUnitState(unit, { includeTransform = false } = {}) {
    const state = {
      unitId: unit.id,
      team: unit.team,
      factionId: unit.factionId ?? unit.team,
      type: unit.type,
      ownerPlayerId: unit.ownerPlayerId ?? null,
      controllerPlayerId: unit.controllerPlayerId ?? unit.ownerPlayerId ?? null,
      playerColorIndex: playerColorIndex(this.game, unit.controllerPlayerId ?? unit.ownerPlayerId),
      health: round(unit.health),
      maxHealth: round(unit.maxHealth),
      shield: round(unit.shield ?? 0),
      maxShield: round(unit.maxShield ?? 0),
      durability: round(unit.weapon?.durability ?? 0),
      maxDurability: round(unit.weapon?.maxDurability ?? 0),
      underConstruction: Boolean(unit.underConstruction),
      buildProgress: round(unit.buildProgress ?? (unit.underConstruction ? 0 : 1), 2),
      visualState: unit.visualState ?? 'idle',
      selected: Boolean(unit.selected),
      selectedByPlayerId: unit.selected ? (unit.selectedByPlayerId ?? null) : null,
      isGuarding: unit.controlMode === 'guard',
      effects: serializeEffects(unit),
      enchantments: [...(unit.enchantments?.entries?.() ?? [])]
        .filter(([, enchantment]) => !enchantment?.hidden)
        .map(([key, enchantment]) => ({
          key,
          name: enchantment?.name ?? key,
          level: Math.max(1, Math.floor(enchantment?.level ?? 1))
        })),
      animation: serializeAnimation(unit)
    };
    if (includeTransform) {
      state.position = [
        quantizePosition(unit.position.x),
        quantizePosition(unit.position.y),
        quantizePosition(unit.position.z)
      ];
      state.yaw = quantizeYaw(unit.mesh.rotation.y);
    }
    return state;
  }

  collectPlayersPublic() {
    const game = this.game;
    if (!game.players) return [];
    return Object.keys(game.players).map((playerId) => {
      const run = game.players[playerId];
      const cards = game.cardSystems?.[playerId] ?? (playerId === game.localPlayerSlot ? game.cardSystem : null);
      const sessionPlayer = game.levelSession?.players?.[playerId];
      return {
        playerId,
        name: sessionPlayer?.name ?? '玩家',
        energy: round(cards?.energy ?? 0),
        silver: round(run?.silver ?? 0),
        handCount: cards?.handCards?.length ?? 0,
        connected: run?.connected !== false,
        flowState: run?.flowState ?? 'playing'
      };
    });
  }

  buildPrivateState(playerId) {
    const cards = this.game.cardSystems?.[playerId]
      ?? (playerId === this.game.localPlayerSlot ? this.game.cardSystem : null);
    const run = this.game.players?.[playerId];
    if (!cards || !run) return null;
    const isLocal = playerId === this.game.localPlayerSlot;
    const strategyEvent = isLocal ? (this.game.strategyEvent ?? run.strategyEvent) : run.strategyEvent;
    const shopRun = isLocal ? this.game : run;
    ensureInteractionIdentity(strategyEvent, {
      matchId: this.matchId,
      playerId,
      kind: 'reward',
      revision: Math.max(1, run.strategyRewardRerollCount + 1)
    });
    const shopSignature = JSON.stringify((shopRun.runShopChoices ?? []).map((choice) => [
      choice?.action,
      choice?.card?.instanceId ?? choice?.card?.id,
      choice?.disabled
    ]));
    if (shopRun.networkChoiceSignature !== shopSignature) {
      shopRun.networkChoiceSignature = shopSignature;
      shopRun.networkShopRevision = (shopRun.networkShopRevision ?? 0) + 1;
    }
    const shopIdentity = ensureInteractionIdentity(shopRun, {
      matchId: this.matchId,
      playerId,
      kind: 'shop',
      revision: Math.max(1, shopRun.networkShopRevision ?? 1)
    });
    if (isLocal) {
      this.game.runShopNetworkOfferId = shopIdentity?.interactionId ?? null;
      this.game.runShopNetworkRevision = shopIdentity?.revision ?? null;
    }
    return {
      playerId,
      energy: round(cards.energy),
      cooldowns: cards.serializeCooldowns?.() ?? [],
      zones: {
        hand: cards.handCards.map(serializeCard),
        drawPile: cards.drawPile.map(serializeCard),
        discardPile: cards.discardPile.map(serializeCard),
        temporary: cards.temporaryCards.map(serializeCard),
        exile: (cards.exilePile ?? []).map(serializeCard)
      },
      silver: round(isLocal ? this.game.getSilver(playerId) : run.silver),
      strategyUi: serializeStrategyUi(strategyEvent),
      strategySelectionRequired: Boolean(strategyEvent),
      strategyWaiting: Boolean(
        this.game.coopRewardKind === 'strategy'
        && this.game.coopRewardWaitSlots?.size
        && !strategyEvent
      ),
      runShopState: serializeRunShopState(shopRun),
      abilities: serializeAbilities(this.game.abilitySystems?.[playerId] ?? (isLocal ? this.game.abilities : null))
    };
  }

  nextEntityRevision(id) {
    const revision = (this.entityRevisions.get(id) ?? 0) + 1;
    this.entityRevisions.set(id, revision);
    return revision;
  }

  allUnits() {
    return [...this.game.friendlyUnits, ...this.game.enemyUnits];
  }

  serializeProjectileTransforms() {
    return (this.game.attacks?.projectiles ?? []).map((projectile) => ({
      projectileId: projectile.networkId,
      x: quantizePosition(projectile.object.position.x),
      y: quantizePosition(projectile.object.position.y),
      z: quantizePosition(projectile.object.position.z),
      qx: round(projectile.object.quaternion.x, 4),
      qy: round(projectile.object.quaternion.y, 4),
      qz: round(projectile.object.quaternion.z, 4),
      qw: round(projectile.object.quaternion.w, 4)
    })).filter((entry) => entry.projectileId != null);
  }

  serializeProjectileStates() {
    return (this.game.attacks?.projectiles ?? []).map((projectile) => ({
      projectileId: projectile.networkId,
      type: projectile.type,
      color: projectile.color,
      scale: projectile.object.scale.x,
      x: projectile.object.position.x,
      y: projectile.object.position.y,
      z: projectile.object.position.z,
      qx: projectile.object.quaternion.x,
      qy: projectile.object.quaternion.y,
      qz: projectile.object.quaternion.z,
      qw: projectile.object.quaternion.w
    })).filter((entry) => entry.projectileId != null);
  }
}

function serializeCard(card) {
  if (!card) return null;
  return {
    cardInstanceId: card.cardInstanceId ?? card.instanceId,
    instanceId: card.instanceId ?? card.cardInstanceId,
    cardDefinitionId: card.cardDefinitionId ?? card.id,
    id: card.id ?? card.cardDefinitionId,
    level: card.level ?? 1,
    runtimeOverrides: card.runtimeOverrides ?? null,
    resolvedPreview: card.resolvedPreview ?? null,
    name: card.name,
    kind: card.kind,
    energyCost: card.energyCost,
    summary: card.summary,
    color: card.color,
    artKey: card.artKey,
    ...(Number.isFinite(card.maxUses) ? { maxUses: card.maxUses } : {}),
    ...(Number.isFinite(card.remainingUses) ? { remainingUses: card.remainingUses } : {}),
    ...(Number.isFinite(card.cooldown) ? { cooldown: card.cooldown } : {})
  };
}

function serializeStrategyUi(event) {
  if (!event) return null;
  return {
    rewardId: event.networkInteractionId,
    revision: event.networkRevision,
    status: 'open',
    type: event.type,
    kicker: event.kicker,
    title: event.title,
    summary: event.summary,
    wave: event.wave ? { index: event.wave.index, kind: event.wave.kind } : null,
    choices: (event.choices ?? []).map((choice) => ({
      choiceId: choice.choiceId,
      action: choice.action,
      actionLabel: choice.actionLabel,
      title: choice.title,
      description: choice.description,
      card: serializeCard(choice.card ?? choice.targetCard ?? choice.temporaryCard)
    }))
  };
}

function serializeRunShopState(run) {
  return {
    offerId: run.networkInteractionId,
    revision: run.networkRevision,
    freeReward: Boolean(run.runShopFreeReward),
    activeCategory: run.runShopActiveCategory,
    choices: (run.runShopChoices ?? []).map((choice) => ({
      choiceId: choice.choiceId,
      action: choice.action,
      actionLabel: choice.actionLabel,
      title: choice.title,
      description: choice.description,
      disabled: Boolean(choice.disabled),
      card: serializeCard(choice.card ?? choice.targetCard ?? choice.temporaryCard)
    }))
  };
}

function serializeAbilities(abilitySystem) {
  if (!abilitySystem?.abilities) return [];
  return [...abilitySystem.abilities.entries()].map(([id, ability]) => ({
    id,
    stacks: ability.stacks ?? 0,
    expiresAt: ability.expiresAt ?? null
  }));
}

function serializeEffects(unit) {
  return [...(unit.buffs?.values?.() ?? [])].map((buff) => ({
    effectInstanceId: `${unit.id}:buff:${buff.id}`,
    effectKey: buff.id,
    sourceEntityId: buff.source?.id ?? null,
    stacks: buff.stacks ?? buff.level ?? 1,
    startTick: buff.networkStartTick ?? 0,
    endTick: buff.networkEndTick ?? null,
    params: buff.color ? { color: buff.color } : {}
  }));
}

function serializeAnimation(unit) {
  const animation = unit.visualRoot?.userData?.animation;
  return {
    animationKey: animation?.name ?? unit.visualState ?? 'idle',
    startTick: animation?.networkStartTick ?? 0,
    duration: animation?.duration,
    playbackRate: animation?.playbackRate ?? 1,
    loop: animation?.loop ?? false
  };
}

function serializeStructure(structure) {
  if (!structure) return null;
  return {
    health: round(structure.health),
    maxHealth: round(structure.maxHealth),
    durability: round(structure.structureDurability ?? 0),
    maxDurability: round(structure.maxStructureDurability ?? 0)
  };
}

function transformFor(unit, previousTransform, motionActive = false) {
  const x = quantizePosition(unit.position.x);
  const y = quantizePosition(unit.position.y);
  const z = quantizePosition(unit.position.z);
  const plan = {
    unitId: unit.id,
    x,
    y,
    z,
    yaw: quantizeYaw(unit.mesh.rotation.y),
    state: visualStateCode(unit.visualState),
    snap: Boolean(!motionActive && previousTransform && Math.hypot(
      x - previousTransform.x,
      y - previousTransform.y,
      z - previousTransform.z
    ) >= SYNC.snapDistance)
  };
  return plan;
}

function motionEventFor(unit, event, sampleTimeMs, revision) {
  const payload = {
    unitId: unit.id,
    event,
    revision,
    sampleTimeMs,
    position: serializeMotionPoint(unit.position, unit.position.y),
    yaw: quantizeYaw(unit.mesh.rotation.y),
    state: visualStateCode(unit.visualState)
  };
  return payload;
}

function serializeMotionPoint(point, y = 0) {
  return [
    quantizePosition(point.x),
    quantizePosition(Number.isFinite(y) ? y : (point.y ?? 0)),
    quantizePosition(point.z)
  ];
}

function shortestYawDelta(from, to) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function playerColorIndex(game, playerId) {
  if (!playerId) return 0;
  const descriptors = game.levelSession?.matchRules?.players ?? [];
  const explicit = descriptors.find((player) => player.playerId === playerId)?.order;
  if (Number.isInteger(explicit)) return multiplayerColorIndex(explicit);
  const orderedIds = Object.keys(game.players ?? {});
  const index = orderedIds.indexOf(playerId);
  return multiplayerColorIndex(index < 0 ? 0 : index);
}

function multiplayerColorIndex(order) {
  return order <= 0 ? 0 : 1 + ((order - 1) % 3);
}

function diffState(previous, current) {
  const changes = {};
  const previousValues = {};
  Object.keys(current).forEach((key) => {
    if (statesEqual(previous?.[key], current[key])) return;
    changes[key] = current[key];
    previousValues[key] = previous?.[key];
  });
  return { changes, previousValues };
}

function statesEqual(a, b) {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

function round(value, decimals = 2) {
  const number = Number(value);
  const factor = 10 ** decimals;
  return Number.isFinite(number) ? Math.round(number * factor) / factor : 0;
}
