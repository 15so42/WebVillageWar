import { clearUnitHitFlash } from '../art/visualRegistry.js';

export class UnitRegistry {
  constructor(game) {
    this.game = game;
    this.allUnits = [];
    this.friendlyUnits = [];
    this.enemyUnits = [];
    this.byId = new Map();
  }

  register(unit) {
    if (!unit || this.byId.has(unit.id)) return unit;
    this.byId.set(unit.id, unit);
    this.allUnits.push(unit);
    const teamList = unit.team === 'player' ? this.friendlyUnits : this.enemyUnits;
    teamList.push(unit);
    unit.registry = this;
    unit.game = this.game;
    unit.deathHandled = false;
    this.game.movement?.attach?.(unit);
    this.game.scene.add(unit.mesh);
    this.game.targeting?.register?.(unit);
    return unit;
  }

  unregister(unit, options = {}) {
    if (!unit || !this.byId.has(unit.id)) return;
    this.byId.delete(unit.id);
    removeItem(this.allUnits, unit);
    removeItem(this.friendlyUnits, unit);
    removeItem(this.enemyUnits, unit);
    this.game.targeting?.unregister?.(unit);
    this.game.attacks?.cancelPendingAttacksFor?.([unit]);
    if (!options.keepSceneObject) {
      this.game.scene.remove(unit.mesh);
      unit.statusElement?.remove();
    }
    unit.registry = null;
  }

  activeUnits() {
    return this.allUnits.filter((unit) => unit.alive);
  }

  handleDeath(unit, source = null) {
    if (!unit || unit.deathHandled) return false;
    unit.alive = false;
    unit.deathHandled = true;
    if (unit.team === 'player') {
      this.game.abilities?.onFriendlyUnitDeath(unit);
    } else if (!unit.isSilentRemoval) {
      this.game.lootDrops?.handleUnitDeath(unit);
      this.game.score += 1;
    }
    this.game.buffs?.unitDeath(unit);
    this.game.effects?.spawnDeathBurst(
      unit.position.clone(),
      Math.max(0.68, this.game.movement?.crowdRadius?.(unit) ?? 0.7)
    );
    clearUnitHitFlash(unit);
    this.unregister(unit);
    this.game.targeting?.handleKill?.(unit, source);
    this.game.onUnitDied?.(unit, source);
    return true;
  }
}

function removeItem(items, item) {
  const index = items.indexOf(item);
  if (index >= 0) {
    items.splice(index, 1);
  }
}
