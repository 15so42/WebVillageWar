import { clearUnitHitFlash } from '../art/visualRegistry.js';
import { disposeObject3D } from '../utils/dispose.js';

export class UnitRegistry {
  constructor(game) {
    this.game = game;
    this.allUnits = [];
    this.friendlyUnits = [];
    this.enemyUnits = [];
    this.byId = new Map();
  }

  register(unit, options = {}) {
    if (!unit || this.byId.has(unit.id)) return unit;
    this.byId.set(unit.id, unit);
    this.allUnits.push(unit);
    const teamList = unit.team === 'player' ? this.friendlyUnits : this.enemyUnits;
    teamList.push(unit);
    unit.registry = this;
    unit.game = this.game;
    unit.deathHandled = false;
    unit.networkMirror = options.networkMirror === true;
    if (!unit.networkMirror) this.game.movement?.attach?.(unit);
    this.game.scene.add(unit.mesh);
    if (!unit.networkMirror) this.game.targeting?.register?.(unit);
    return unit;
  }

  unregister(unit, options = {}) {
    if (!unit || !this.byId.has(unit.id)) return;
    this.byId.delete(unit.id);
    removeItem(this.allUnits, unit);
    removeItem(this.friendlyUnits, unit);
    removeItem(this.enemyUnits, unit);
    if (!unit.networkMirror) {
      this.game.targeting?.unregister?.(unit);
      this.game.attacks?.cancelPendingAttacksFor?.([unit]);
    }
    if (!options.keepSceneObject) {
      if (unit.constructionScaffold) {
        this.game.buildings?.finishConstructionVisual?.(unit, { removeOnly: true });
      }
      this.game.scene.remove(unit.mesh);
      unit.statusElement?.remove();
      disposeObject3D(unit.mesh, { materials: true });
      unit.renderResourcesDisposed = true;
    }
    unit.registry = null;
  }

  /**
   * 改变归属队伍。野外招募的唯一入口。
   *
   * 只搬列表、不碰 mesh 与寻路注册：那些和队伍无关。
   * 索敌索引也不用在这里手动维护——`TargetingSystem.rebuild()` 每个索引周期
   * 都会从 `allUnits` 重新按 `unit.team` 分桶，改完队伍下一周期自然归位。
   */
  changeTeam(unit, team) {
    if (!unit || !this.byId.has(unit.id)) return false;
    if (team !== 'player' && team !== 'enemy') return false;
    if (unit.team === team) return false;
    removeItem(this.friendlyUnits, unit);
    removeItem(this.enemyUnits, unit);
    unit.team = team;
    (team === 'player' ? this.friendlyUnits : this.enemyUnits).push(unit);
    // 改完队伍必须清掉旧目标：它可能正锁着一个"昨天还是敌人"的对象。
    unit.target = null;
    this.game.targeting?.unregister?.(unit);
    this.game.targeting?.register?.(unit);
    return true;
  }

  destroy() {
    [...this.allUnits].forEach((unit) => this.unregister(unit));
    this.byId.clear();
    this.allUnits.length = 0;
    this.friendlyUnits.length = 0;
    this.enemyUnits.length = 0;
  }

  activeUnits() {
    return this.allUnits.filter((unit) => unit.alive);
  }

  handleDeath(unit, source = null) {
    if (!unit || unit.deathHandled) return false;
    unit.alive = false;
    unit.deathHandled = true;
    if (unit.team === 'player') {
      this.game.abilitiesFor?.(unit)?.onFriendlyUnitDeath?.(unit);
    } else if (!unit.isSilentRemoval) {
      this.game.lootDrops?.handleUnitDeath(unit);
      this.game.score += 1;
    }
    this.game.buffs?.unitDeath(unit, source);
    const deathRadius = deathBurstRadius(
      unit,
      this.game.movement?.crowdRadius?.(unit) ?? 0
    );
    this.game.effects?.spawnDeathBurst(
      unit.position.clone(),
      deathRadius
    );
    clearUnitHitFlash(unit);
    this.unregister(unit);
    this.game.targeting?.handleKill?.(unit, source);
    this.game.onUnitDied?.(unit, source);
    return true;
  }
}

export function deathBurstRadius(unit, crowdRadius = 0) {
  const collisionRadius = Number(
    unit?.collisionRadius
    ?? unit?.definition?.collisionRadius
    ?? unit?.attributes?.get?.('collisionRadius')
    ?? 0
  ) || 0;
  const visualHeight = Math.max(0, Number(unit?.projectileHitHeight) || 0);
  const visualScale = Math.max(
    0.7,
    Number(unit?.visualRoot?.scale?.x) || 1,
    Number(unit?.visualRoot?.scale?.y) || 1,
    Number(unit?.visualRoot?.scale?.z) || 1
  );
  const classFloor = unit?.isBoss
    ? 1.55
    : unit?.isElite
      ? 0.86
      : unit?.isBuilding
        ? 1.15
        : 0;
  const bodyRadius = Math.max(
    0.48,
    Number(crowdRadius) || 0,
    collisionRadius,
    visualHeight * 0.38,
    classFloor
  );
  return Math.min(3.6, bodyRadius * Math.sqrt(visualScale));
}

function removeItem(items, item) {
  const index = items.indexOf(item);
  if (index >= 0) {
    items.splice(index, 1);
  }
}
