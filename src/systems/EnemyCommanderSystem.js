import * as THREE from 'three';
import { TEAMS } from '../data/gameData.js';
import { distance2D, polarOffset } from '../utils/math.js';

const DEFAULT_STRATEGY = {
  profile: 'balanced',
  squadSize: 3,
  thinkInterval: 2.5,
  captureWeight: 1,
  rallyWeight: 1,
  holdWeight: 0.75,
  attackWeight: 1.15,
  minAttackSquads: 2,
  captureSquadRatio: 0.2,
  maxCaptureSquads: 1,
  minSquadsBeforeCapture: 4,
  rallyPathIndices: [2, 4, 6],
  chokePathIndices: [3, 5],
  flankPathIndices: [],
  openingOrders: ['attack', 'attack', 'rally', 'capture']
};

const ORDER_REEVALUATE_SECONDS = 4.2;
const FAST_RETHINK_SECONDS = 1.35;
const ARRIVAL_DISTANCE = 1.4;
const ORDER_DESTINATION_EPSILON = 0.75;
const FORWARD_FORMATION_MIN_DISTANCE = 8;
const ENGAGED_AI_STATES = new Set(['attacking', 'chasing', 'stunned']);

export class EnemyCommanderSystem {
  constructor(game) {
    this.game = game;
    this.strategy = {
      ...DEFAULT_STRATEGY,
      ...(game.levelSession.level.enemyStrategy ?? {})
    };
    this.squads = new Map();
    this.nextSquadId = 1;
    this.thinkTimer = 0.35;
    this.openingOrderCursor = 0;
    this.playerIntel = this.collectPlayerIntel();
    this.lastSnapshot = null;
  }

  update(dt) {
    this.thinkTimer -= dt;
    this.cleanupSquads();
    this.adoptUnassignedUnits();
    this.updateArrivals(dt);
    this.updateReactiveThink(dt);
    if (this.thinkTimer > 0) return;
    this.thinkTimer += this.currentThinkInterval();
    this.rethink();
  }

  currentThinkInterval() {
    const base = Math.max(1.2, this.strategy.thinkInterval ?? DEFAULT_STRATEGY.thinkInterval);
    const intel = this.getPlayerIntel();
    const forwardCount = intel.forwardFormation?.unitCount ?? 0;
    const playerUnits = intel.units?.length ?? 0;
    const playerBuildings = intel.buildingCount ?? 0;
    let interval = base;
    if (forwardCount >= 3) interval -= 0.55;
    else if (forwardCount >= 1) interval -= 0.28;
    if (playerUnits >= 10) interval -= 0.35;
    else if (playerUnits >= 6) interval -= 0.18;
    if (playerBuildings >= 2) interval -= 0.22;
    const threatTier = Number(this.game.enemyDirector?.threatTier) || 1;
    interval -= Math.min(0.45, Math.max(0, threatTier - 2) * 0.12);
    return Math.max(1.2, interval);
  }

  updateReactiveThink(dt) {
    const intel = this.getPlayerIntel();
    const pressure =
      (intel.forwardFormation?.unitCount ?? 0) * 0.22 +
      (intel.buildingCount ?? 0) * 0.35 +
      (intel.supportCount ?? 0) * 0.18;
    if (pressure < 0.75) return;
    this.thinkTimer = Math.min(this.thinkTimer, FAST_RETHINK_SECONDS);
    void dt;
  }

  destroy() {
    this.squads.clear();
  }

  registerWave(units, wave, orders = 'attack', force = null) {
    const controllable = this.sortUnitsForSquad(units.filter((unit) => this.isControllable(unit)));
    if (!controllable.length) return;
    this.refreshPlayerIntel();
    const size = Math.max(1, Math.floor(this.strategy.squadSize ?? DEFAULT_STRATEGY.squadSize));
    const squadCount = Math.ceil(controllable.length / size);
    for (let i = 0; i < controllable.length; i += size) {
      const squadUnits = controllable.slice(i, i + size);
      const squad = this.createSquad(squadUnits);
      squad.wave = wave;
      squad.spawnOrders = orders;
      const squadIndex = Math.floor(i / size);
      const role = this.resolveSquadOrderRole(orders, force, squadIndex, squadCount);
      const order = this.orderForRole(squad, role) ?? this.attackOrder(squad);
      this.issueOrder(squad, order);
    }
  }

  resolveSquadOrderRole(orders, force, squadIndex, squadCount) {
    if (force?.kind === 'boss' || force?.kind === 'elite') return 'attack';
    if (orders === 'mixed') {
      if (this.hasFlankRoute() && squadIndex === 0 && squadCount >= 2) return 'flank';
      if (squadIndex === 1 && squadCount >= 3) return 'rally';
      return 'attack';
    }
    if (orders === 'attack') return 'attack';
    if (orders === 'capture' || orders === 'hold' || orders === 'rally' || orders === 'flank') {
      return orders;
    }
    return 'attack';
  }

  snapshot() {
    return {
      profile: this.strategy.profile,
      knownPlayer: this.snapshotPlayerIntel(),
      squads: [...this.squads.values()].map((squad) => ({
        id: squad.id,
        role: squad.role,
        unitCount: this.aliveUnits(squad).length,
        engaged: this.aliveUnits(squad).filter((unit) => this.isEngaged(unit)).length,
        target: squad.target
          ? {
              x: Number(squad.target.x.toFixed(1)),
              z: Number(squad.target.z.toFixed(1))
            }
          : null
      }))
    };
  }

  isControllable(unit) {
    return unit?.alive && unit.team === TEAMS.ENEMY && !unit.isWildlife;
  }

  createSquad(units) {
    const squad = {
      id: this.nextSquadId,
      units: [],
      role: 'unassigned',
      target: null,
      targetId: null,
      reevaluateTimer: 0
    };
    this.nextSquadId += 1;
    units.forEach((unit) => this.assignUnitToSquad(unit, squad));
    this.squads.set(squad.id, squad);
    return squad;
  }

  assignUnitToSquad(unit, squad) {
    unit.enemySquadId = squad.id;
    unit.enemyCommanderRole = squad.role;
    squad.units.push(unit);
  }

  cleanupSquads() {
    this.squads.forEach((squad, id) => {
      squad.units = squad.units.filter((unit) => this.isControllable(unit));
      if (squad.units.length) return;
      this.squads.delete(id);
    });
  }

  adoptUnassignedUnits() {
    const unassigned = this.game.enemyUnits.filter((unit) => (
      this.isControllable(unit) && !this.squads.has(unit.enemySquadId)
    ));
    if (!unassigned.length) return;
    this.refreshPlayerIntel();
    const size = Math.max(1, Math.floor(this.strategy.squadSize ?? DEFAULT_STRATEGY.squadSize));
    for (let i = 0; i < unassigned.length; i += size) {
      const squad = this.createSquad(this.sortUnitsForSquad(unassigned.slice(i, i + size)));
      const order = this.chooseOrder(squad);
      this.issueOrder(squad, order ?? this.attackOrder(squad));
    }
  }

  updateArrivals(dt) {
    this.squads.forEach((squad) => {
      squad.reevaluateTimer = Math.max(0, squad.reevaluateTimer - dt);
      if (!squad.target || squad.role === 'attack') return;
      const units = this.aliveUnits(squad);
      if (!units.length) return;
      const center = squadCenter(units);
      if (distance2D(center, squad.target) > ARRIVAL_DISTANCE) return;
      if (squad.role === 'flank') {
        const attack = this.attackOrder(squad);
        if (attack) this.issueOrder(squad, attack);
        return;
      }
      if (squad.role === 'rally') {
        squad.reevaluateTimer = 0;
        const intel = this.getPlayerIntel();
        if ((intel.forwardFormation?.unitCount ?? 0) >= 2) {
          const attack = this.attackOrder(squad);
          if (attack) this.issueOrder(squad, attack);
        }
      }
    });
  }

  rethink() {
    this.refreshPlayerIntel();
    this.squads.forEach((squad) => {
      if (!this.commandableUnits(squad).length) return;
      if (squad.reevaluateTimer > 0 && squad.role !== 'unassigned') return;
      const order = this.chooseOrder(squad);
      this.issueOrder(squad, order);
    });
    this.lastSnapshot = this.snapshot();
  }

  assignOpeningOrder(squad) {
    const openingOrders = Array.isArray(this.strategy.openingOrders)
      ? this.strategy.openingOrders
      : [];
    const role = openingOrders[this.openingOrderCursor] ?? null;
    this.openingOrderCursor += 1;
    const openingOrder = role ? this.orderForRole(squad, role) : null;
    this.issueOrder(squad, openingOrder ?? this.chooseOrder(squad));
  }

  chooseOrder(squad) {
    const capture = this.captureOrder(squad);
    if (this.shouldUseCaptureOrder(squad, capture)) {
      return capture;
    }
    const intel = this.getPlayerIntel();
    const attackSquads = this.countActiveCombatSquads();
    const minAttack = Math.max(1, this.strategy.minAttackSquads ?? DEFAULT_STRATEGY.minAttackSquads);
    const underPressure = (intel.forwardFormation?.unitCount ?? 0) >= 2 ||
      (intel.buildingCount ?? 0) >= 1;
    const orders = [
      this.attackOrder(squad)
    ];
    if (this.hasFlankRoute() && (attackSquads >= minAttack || underPressure)) {
      orders.push(this.flankOrder(squad));
    }
    orders.push(this.rallyOrder(squad), this.holdOrder(squad));
    return orders
      .filter((order) => order?.target && Number.isFinite(order.score))
      .sort((left, right) => right.score - left.score)[0] ?? this.attackOrder(squad);
  }

  orderForRole(squad, role) {
    if (role === 'capture') return this.captureOrder(squad);
    if (role === 'rally') return this.rallyOrder(squad);
    if (role === 'hold') return this.holdOrder(squad);
    if (role === 'flank') return this.flankOrder(squad);
    return this.attackOrder(squad);
  }

  captureOrder(squad) {
    const altars = this.game.altars?.altars ?? [];
    if (!altars.length) return null;
    const center = this.squadCenter(squad);
    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    altars.forEach((altar) => {
      if (altar.owner === TEAMS.ENEMY && !altar.contested) return;
      const distance = distance2D(center, altar.position);
      const ownerBonus = altar.owner === TEAMS.PLAYER ? 1.35 : 0.75;
      const contestBonus = altar.contested ? 0.45 : 0;
      const defenders = this.playerUnitCountNear(altar.position, altar.captureRadius + 2.4);
      const defenderBonus = Math.min(0.42, defenders * 0.12);
      const score = (this.strategy.captureWeight ?? 1) * (ownerBonus + contestBonus) -
        distance * 0.018 + defenderBonus;
      if (score <= bestScore) return;
      best = altar;
      bestScore = score;
    });
    if (!best) return null;
    return {
      role: 'capture',
      target: best.position,
      targetId: best.id,
      radius: Math.max(1.3, best.captureRadius * 0.42),
      guardRadius: best.captureRadius + 1.4,
      score: bestScore
    };
  }

  shouldUseCaptureOrder(squad, captureOrder = this.captureOrder(squad)) {
    if (!captureOrder) return false;
    if (squad.role === 'capture') return true;
    const quota = this.captureSquadQuota();
    if (quota <= 0) return false;
    const currentCaptureSquads = this.countSquadsWithRole('capture', squad);
    return currentCaptureSquads < quota;
  }

  captureSquadQuota() {
    const total = this.activeSquadCount();
    const minBeforeCapture = Math.max(1, Math.floor(
      this.strategy.minSquadsBeforeCapture ?? DEFAULT_STRATEGY.minSquadsBeforeCapture
    ));
    if (total < minBeforeCapture) return 0;
    const ratio = Math.max(0, this.strategy.captureSquadRatio ?? DEFAULT_STRATEGY.captureSquadRatio);
    const maxCapture = Math.max(0, Math.floor(
      this.strategy.maxCaptureSquads ?? DEFAULT_STRATEGY.maxCaptureSquads
    ));
    const byRatio = Math.max(1, Math.floor(total * ratio));
    return maxCapture > 0 ? Math.min(maxCapture, byRatio) : byRatio;
  }

  rallyOrder(squad) {
    const point = this.bestIndexedPathPoint(this.strategy.rallyPathIndices, 'rally');
    if (!point) return null;
    const center = this.squadCenter(squad);
    const supportBonus = this.countSquadsWithRole('rally') < 2 ? 0.42 : 0;
    return {
      role: 'rally',
      target: point,
      targetId: `rally:${point.x.toFixed(1)}:${point.z.toFixed(1)}`,
      radius: 1.45,
      guardRadius: 4.2,
      score: (this.strategy.rallyWeight ?? 1) + supportBonus - distance2D(center, point) * 0.012
    };
  }

  hasFlankRoute() {
    return Array.isArray(this.strategy.flankPathIndices) &&
      this.strategy.flankPathIndices.length > 0;
  }

  flankOrder(squad) {
    if (!this.hasFlankRoute()) return null;
    const point = this.bestIndexedPathPoint(this.strategy.flankPathIndices, 'flank');
    if (!point) return null;
    const center = this.squadCenter(squad);
    const flankCount = this.countSquadsWithRole('flank', squad);
    const pressureBonus = this.strategy.profile === 'desert-pressure' ? 0.62 : 0.2;
    const supportBonus = flankCount === 0 ? 0.32 : -0.48 * flankCount;
    return {
      role: 'flank',
      target: point,
      targetId: `flank:${point.x.toFixed(1)}:${point.z.toFixed(1)}`,
      radius: 1.35,
      guardRadius: 0,
      score: (this.strategy.rallyWeight ?? 1) + pressureBonus + supportBonus -
        distance2D(center, point) * 0.01
    };
  }

  holdOrder(squad) {
    const point = this.bestIndexedPathPoint(this.strategy.chokePathIndices, 'hold');
    if (!point) return null;
    const center = this.squadCenter(squad);
    const dungeonBonus = this.strategy.profile === 'dungeon-choke' ? 0.72 : 0;
    return {
      role: 'hold',
      target: point,
      targetId: `hold:${point.x.toFixed(1)}:${point.z.toFixed(1)}`,
      radius: 1.2,
      guardRadius: 5.8,
      score: (this.strategy.holdWeight ?? 1) + dungeonBonus - distance2D(center, point) * 0.01
    };
  }

  attackOrder(squad) {
    const objective = this.pickAttackObjective(squad);
    if (!objective) return null;
    const center = this.squadCenter(squad);
    const activeSquads = this.countActiveCombatSquads();
    const enoughPressure = activeSquads >= Math.max(1, this.strategy.minAttackSquads ?? 1);
    const threatTier = Number.isFinite(this.game.enemyDirector?.threatTier)
      ? this.game.enemyDirector.threatTier
      : 1;
    const threatPressure = Math.max(0, threatTier - 1) * 0.12;
    return {
      role: 'attack',
      target: objective.position,
      targetId: objective.id,
      focusTargetId: objective.focusTargetId ?? null,
      radius: objective.radius,
      guardRadius: 0,
      score: (this.strategy.attackWeight ?? 1) + objective.priority + threatPressure +
        (enoughPressure ? 0.45 : -0.2) - distance2D(center, objective.position) * 0.006
    };
  }

  pickAttackObjective(squad) {
    const intel = this.getPlayerIntel();
    const base = intel.base;
    const basePosition = base?.position ?? this.game.playerBase.position;
    const baseRadius = base?.radius ?? this.game.playerBase.collisionRadius ?? 1.2;
    const candidates = [{
      id: 'player-base',
      position: basePosition.clone(),
      radius: baseRadius + 1.55,
      priority: 0.85,
      focusTargetId: null
    }];

    intel.units.forEach((unit) => {
      if (unit.underConstruction) return;
      let priority = 0.2;
      if (unit.isBuilding) priority += 1.85;
      if (unit.isSupport) priority += 1.45;
      if (unit.role === 'ranged') priority += 0.75;
      if (unit.healthRatio <= 0.42) priority += 0.55;
      candidates.push({
        id: unit.id,
        position: unit.position.clone(),
        radius: unit.isBuilding ? 1.35 : 1.05,
        priority,
        focusTargetId: unit.id
      });
    });

    if (intel.forwardFormation) {
      const formation = intel.forwardFormation;
      candidates.push({
        id: formation.id,
        position: formation.position.clone(),
        radius: Math.min(4.2, 1.25 + formation.unitCount * 0.42),
        priority: 1.1 + Math.min(0.8, formation.unitCount * 0.16) +
          Math.min(0.55, formation.distanceFromBase * 0.03),
        focusTargetId: formation.focusTargetId ?? null
      });
    }

    const center = this.squadCenter(squad);
    let best = candidates[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    candidates.forEach((candidate) => {
      const score = candidate.priority - distance2D(center, candidate.position) * 0.008;
      if (score <= bestScore) return;
      best = candidate;
      bestScore = score;
    });
    return best;
  }

  issueOrder(squad, order) {
    if (!order?.target) return;
    const units = this.commandableUnits(squad);
    if (!units.length) return;
    squad.role = order.role;
    squad.target = order.target.clone?.() ?? new THREE.Vector3(order.target.x, 0, order.target.z);
    squad.targetId = order.targetId;
    squad.focusTargetId = order.focusTargetId ?? null;
    squad.reevaluateTimer = ORDER_REEVALUATE_SECONDS;
    units.forEach((unit, index) => {
      const offset = polarOffset(index, units.length, order.radius ?? 1);
      const destination = this.game.resolveWalkablePoint(squad.target.clone().setY(0).add(offset));
      destination.y = this.game.groundHeightAt(destination);
      if (this.isSameUnitOrder(unit, order, destination)) return;
      unit.enemyCommanderRole = order.role;
      unit.enemyCommanderTargetId = order.targetId;
      unit.enemySquadFocusId = squad.focusTargetId ?? null;
      unit.target = null;
      unit.commandMoveGoal = null;
      unit.moveGoal = destination;
      this.game.pathfinding?.clear?.(unit);
      if (order.role === 'capture' || order.role === 'hold') {
        unit.controlMode = 'guard';
        unit.guardPoint = destination.clone();
        unit.guardRadius = order.guardRadius ?? 4;
      } else {
        unit.controlMode = 'normal';
        unit.guardPoint = null;
        unit.guardRadius = null;
      }
      unit.commanderMarching = order.role === 'rally' || order.role === 'flank';
    });
  }

  sortUnitsForSquad(units) {
    const roleWeight = (unit) => {
      const role = unit.definition?.role;
      if (role === 'melee') return 0;
      if (role === 'ranged') return 1;
      return 2;
    };
    return [...units].sort((left, right) => roleWeight(left) - roleWeight(right));
  }

  bestIndexedPathPoint(indices = [], role = 'rally') {
    const points = this.game.world?.pathPoints ?? [];
    if (!points.length) return null;
    const usable = indices
      .map((index) => points[Math.max(0, Math.min(points.length - 1, index))])
      .filter(Boolean);
    const candidates = usable.length ? usable : points;
    const occupied = new Map();
    this.squads.forEach((squad) => {
      if (!squad.targetId) return;
      occupied.set(squad.targetId, (occupied.get(squad.targetId) ?? 0) + 1);
    });
    const intel = this.getPlayerIntel();
    const basePosition = intel.base?.position ?? this.game.playerBase.position;
    const forwardFormation = intel.forwardFormation;
    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    candidates.forEach((point, index) => {
      const key = `${point.x.toFixed(1)}:${point.z.toFixed(1)}`;
      const crowding = (occupied.get(`rally:${key}`) ?? 0) +
        (occupied.get(`hold:${key}`) ?? 0) +
        (occupied.get(`flank:${key}`) ?? 0);
      const distanceFromBase = distance2D(point, basePosition);
      const forwardPressure = forwardFormation
        ? Math.max(0, 1 - distance2D(point, forwardFormation.position) / 34)
        : 0;
      const playerIntelBias = role === 'hold'
        ? forwardPressure * 0.24
        : role === 'rally'
          ? forwardPressure * 0.12
          : role === 'flank'
            ? -forwardPressure * 0.16
            : 0;
      const score = distanceFromBase * 0.01 - crowding * 0.65 - index * 0.03 + playerIntelBias;
      if (score <= bestScore) return;
      best = point;
      bestScore = score;
    });
    return best?.clone?.() ?? null;
  }

  squadCenter(squad) {
    return squadCenter(this.aliveUnits(squad));
  }

  refreshPlayerIntel() {
    this.playerIntel = this.collectPlayerIntel();
    return this.playerIntel;
  }

  getPlayerIntel() {
    return this.playerIntel ?? this.refreshPlayerIntel();
  }

  collectPlayerIntel() {
    const playerBase = this.game.playerBase;
    const base = hasPosition(playerBase?.position)
      ? {
          id: 'player-base',
          position: clonePlanarPosition(playerBase.position),
          radius: playerBase.collisionRadius ?? 0,
          alive: playerBase.alive !== false
        }
      : null;
    const units = (this.game.friendlyUnits ?? [])
      .filter((unit) => (
        unit?.alive !== false &&
        hasPosition(unit?.position) &&
        (unit.team == null || unit.team === TEAMS.PLAYER)
      ))
      .map((unit) => ({
        id: String(unit.id ?? `player-unit-${unit.type ?? 'unknown'}`),
        type: unit.type ?? 'unit',
        position: clonePlanarPosition(unit.position),
        underConstruction: unit.underConstruction === true,
        isBuilding: unit.isBuilding === true,
        isSupport: Boolean(unit.definition?.support),
        role: unit.definition?.role ?? 'melee',
        healthRatio: unit.maxHealth > 0 ? unit.health / unit.maxHealth : 1
      }));
    const buildingCount = units.reduce((count, unit) => count + (unit.isBuilding ? 1 : 0), 0);
    const supportCount = units.reduce((count, unit) => count + (unit.isSupport ? 1 : 0), 0);
    const forwardFormation = buildForwardFormation(units, base);
    return { base, units, forwardFormation, buildingCount, supportCount };
  }

  playerUnitCountNear(position, radius) {
    const radiusSquared = radius * radius;
    return this.getPlayerIntel().units.reduce((count, unit) => {
      if (unit.underConstruction) return count;
      return planarDistanceSquared(unit.position, position) <= radiusSquared ? count + 1 : count;
    }, 0);
  }

  snapshotPlayerIntel() {
    const intel = this.getPlayerIntel();
    return {
      base: intel.base
        ? snapshotPosition(intel.base.position, { id: intel.base.id, alive: intel.base.alive })
        : null,
      units: intel.units.map((unit) => snapshotPosition(unit.position, {
        id: unit.id,
        type: unit.type,
        underConstruction: unit.underConstruction
      })),
      forwardFormation: intel.forwardFormation
        ? snapshotPosition(intel.forwardFormation.position, {
            id: intel.forwardFormation.id,
            unitCount: intel.forwardFormation.unitCount,
            distanceFromBase: Number(intel.forwardFormation.distanceFromBase.toFixed(1))
          })
        : null
    };
  }

  aliveUnits(squad) {
    return squad.units.filter((unit) => this.isControllable(unit));
  }

  commandableUnits(squad) {
    return this.aliveUnits(squad).filter((unit) => !this.isEngaged(unit));
  }

  isEngaged(unit) {
    if (!this.isControllable(unit)) return false;
    if (unit.target?.alive !== false && unit.target) return true;
    if (unit.hitStunTimer > 0) return true;
    if (ENGAGED_AI_STATES.has(unit.aiState)) return true;
    return Boolean(this.game.attacks?.getActiveAttackFor?.(unit));
  }

  isSameUnitOrder(unit, order, destination) {
    if (unit.enemyCommanderRole !== order.role) return false;
    if (unit.enemyCommanderTargetId !== order.targetId) return false;
    const currentGoal = unit.moveGoal ?? unit.guardPoint;
    if (!currentGoal) return false;
    return distance2D(currentGoal, destination) <= ORDER_DESTINATION_EPSILON;
  }

  countSquadsWithRole(role, excludeSquad = null) {
    let count = 0;
    this.squads.forEach((squad) => {
      if (squad === excludeSquad) return;
      if (squad.role === role && this.aliveUnits(squad).length) count += 1;
    });
    return count;
  }

  activeSquadCount() {
    let count = 0;
    this.squads.forEach((squad) => {
      if (this.aliveUnits(squad).length) count += 1;
    });
    return count;
  }

  countActiveCombatSquads() {
    let count = 0;
    this.squads.forEach((squad) => {
      if (!this.aliveUnits(squad).length) return;
      if (squad.role === 'attack' || squad.role === 'flank') {
        count += 1;
        return;
      }
      if (squad.role === 'rally' && squad.reevaluateTimer <= 0.2) {
        count += 1;
      }
    });
    return count;
  }
}

function squadCenter(units) {
  if (!units.length) return new THREE.Vector3();
  const center = new THREE.Vector3();
  units.forEach((unit) => center.add(unit.position));
  center.divideScalar(units.length);
  center.y = 0;
  return center;
}

function hasPosition(position) {
  return Number.isFinite(position?.x) && Number.isFinite(position?.z);
}

function clonePlanarPosition(position) {
  return new THREE.Vector3(position.x, 0, position.z);
}

function planarDistanceSquared(left, right) {
  const dx = left.x - right.x;
  const dz = left.z - right.z;
  return dx * dx + dz * dz;
}

function buildForwardFormation(units, base) {
  if (!base?.position) return null;
  const minimumDistance = Math.max(FORWARD_FORMATION_MIN_DISTANCE, base.radius + 4.5);
  const forwardUnits = units.filter((unit) => (
    !unit.underConstruction &&
    distance2D(unit.position, base.position) >= minimumDistance
  ));
  if (!forwardUnits.length) return null;
  const position = new THREE.Vector3();
  let totalDistance = 0;
  let focusTarget = null;
  let focusScore = Number.NEGATIVE_INFINITY;
  forwardUnits.forEach((unit) => {
    position.add(unit.position);
    totalDistance += distance2D(unit.position, base.position);
    const score =
      (unit.isBuilding ? 2 : 0) +
      (unit.isSupport ? 1.6 : 0) +
      (unit.role === 'ranged' ? 1.1 : 0) +
      (unit.healthRatio <= 0.45 ? 0.8 : 0);
    if (score > focusScore) {
      focusTarget = unit;
      focusScore = score;
    }
  });
  position.divideScalar(forwardUnits.length);
  position.y = 0;
  return {
    id: `player-forward:${forwardUnits.map((unit) => unit.id).sort().join('|')}`,
    position,
    unitCount: forwardUnits.length,
    distanceFromBase: totalDistance / forwardUnits.length,
    focusTargetId: focusTarget?.id ?? null
  };
}

function snapshotPosition(position, details = {}) {
  return {
    ...details,
    x: Number(position.x.toFixed(1)),
    z: Number(position.z.toFixed(1))
  };
}
