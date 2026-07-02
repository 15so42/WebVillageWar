import * as THREE from 'three';
import { disposeObject3D } from '../utils/dispose.js';
import { distance2D } from '../utils/math.js';

const SCAFFOLD_COLOR = '#dff8ff';
const SERVICE_TICK_SECONDS = 1;
const BUILDING_SET_REFRESH_SECONDS = 1;

export class BuildingSystem {
  constructor(game) {
    this.game = game;
    this.constructing = new Set();
    this.buildings = new Set();
    this.buildingRefreshTimer = 0;
  }

  startConstruction(unit, duration = 30) {
    this.buildings.add(unit);
    unit.underConstruction = true;
    unit.buildDuration = Math.max(0.1, duration);
    unit.buildTimer = 0;
    unit.buildProgress = 0;
    unit.target = null;
    unit.moveGoal = null;
    unit.commandMoveGoal = null;
    unit.controlMode = 'hold';
    unit.health = unit.maxHealth;
    unit.weapon.durability = unit.weapon.maxDurability;
    this.prepareConstructionVisual(unit);
    this.constructing.add(unit);
  }

  update(dt) {
    this.refreshBuildingSet(dt);
    this.constructing.forEach((unit) => {
      if (!unit.alive) {
        this.finishConstructionVisual(unit, { removeOnly: true });
        this.constructing.delete(unit);
        this.buildings.delete(unit);
        return;
      }
      unit.buildTimer += dt;
      unit.buildProgress = Math.min(1, unit.buildTimer / unit.buildDuration);
      this.updateConstructionVisual(unit, unit.buildProgress);
      if (unit.buildProgress < 1) return;
      this.completeConstruction(unit);
    });
    this.buildings.forEach((unit) => {
      if (!unit.alive) {
        this.buildings.delete(unit);
        return;
      }
      if (!unit.underConstruction) {
        this.updateBuildingAura(unit, dt);
      }
    });
    this.buildings.forEach((unit) => this.destroyIfDurabilitySpent(unit));
  }

  destroy() {
    this.constructing.forEach((unit) => this.finishConstructionVisual(unit, { removeOnly: true }));
    this.constructing.clear();
    this.buildings.clear();
  }

  completeConstruction(unit) {
    unit.underConstruction = false;
    unit.controlMode = 'normal';
    unit.buildProgress = 1;
    this.finishConstructionVisual(unit);
    this.constructing.delete(unit);
    this.game.effects.spawnRing(unit.position, '#fff2a8', 1.25, 0.72);
    this.game.effects.spawnStructureDust(unit.position, 1.5, '#d8c8a8');
  }

  prepareConstructionVisual(unit) {
    unit.constructionMeshes = [];
    unit.visualRoot.traverse((node) => {
      if (!node.isMesh || node.userData.constructionMaterialPrepared) return;
      node.userData.originalMaterial = node.material;
      node.material = node.material.clone();
      node.material.transparent = true;
      node.material.opacity = 0.18;
      node.userData.constructionMaterialPrepared = true;
      unit.constructionMeshes.push(node);
    });

    const scaffold = createScaffold();
    scaffold.name = 'ConstructionScaffold';
    unit.mesh.add(scaffold);
    unit.constructionScaffold = scaffold;
    unit.constructionScaffoldLines = scaffold.children.slice();
    this.updateConstructionVisual(unit, 0);
  }

  updateConstructionVisual(unit, progress) {
    const eased = progress * progress * (3 - 2 * progress);
    unit.visualRoot.scale.set(0.72 + eased * 0.28, 0.08 + eased * 0.92, 0.72 + eased * 0.28);
    unit.visualRoot.position.y = -(1 - eased) * 0.35;
    unit.constructionMeshes?.forEach((node) => {
      node.material.opacity = 0.16 + eased * 0.84;
    });
    if (unit.constructionScaffold) {
      unit.constructionScaffold.scale.setScalar(1 + (1 - eased) * 0.08);
      unit.constructionScaffold.position.y = 1.85 * eased;
      unit.constructionScaffoldLines?.forEach((child, index) => {
        child.material.opacity = (0.68 - progress * 0.38) * (index % 2 ? 0.75 : 1);
      });
    }
  }

  finishConstructionVisual(unit, { removeOnly = false } = {}) {
    if (!removeOnly) {
      unit.visualRoot.scale.setScalar(1);
      unit.visualRoot.position.y = 0;
      unit.constructionMeshes?.forEach((node) => {
        node.material.opacity = 1;
        node.material.transparent = false;
      });
    }
    if (unit.constructionScaffold) {
      unit.mesh.remove(unit.constructionScaffold);
      disposeObject3D(unit.constructionScaffold);
      unit.constructionScaffold = null;
    }
    unit.constructionMeshes = null;
    unit.constructionScaffoldLines = null;
  }

  updateBuildingAura(unit, dt) {
    const aura = unit.definition.buildingAura;
    if (!aura) return;
    const tickSeconds = Math.max(1, aura.tickSeconds ?? SERVICE_TICK_SECONDS);
    unit.serviceTickTimer = (unit.serviceTickTimer ?? 0) + dt;
    while (unit.serviceTickTimer >= tickSeconds && unit.alive) {
      unit.serviceTickTimer -= tickSeconds;
      let didWork = false;
      if (aura.type === 'restoreDurability') {
        didWork = this.restoreNearbyDurability(unit, aura, tickSeconds);
      } else if (aura.type === 'restoreHealthFromDurability') {
        didWork = this.restoreNearbyHealth(unit, aura, tickSeconds);
      }
      if (didWork) {
        this.game.effects.spawnRecoveryPulse(unit.position, aura.radius ?? 5);
      }
      if (unit.weapon.durability <= 0) return;
    }
  }

  restoreNearbyDurability(building, aura, tickSeconds = 1) {
    const targets = this.getAuraTargets(building, aura);
    const restoreRate = Math.max(0, aura.durabilityPerSecond ?? 0) * tickSeconds;
    const restorePerDurability = Math.max(0.01, aura.restorePerDurability ?? 1);
    let didWork = false;
    for (const target of targets) {
      if (building.weapon.durability <= 0) return didWork;
      const missing = Math.max(0, target.weapon.maxDurability - target.weapon.durability);
      if (missing <= 0.01) continue;
      const wantedRestore = Math.min(restoreRate, missing);
      const wantedCost = wantedRestore / restorePerDurability;
      const spent = Math.min(building.weapon.durability, wantedCost);
      if (spent <= 0) return didWork;
      const restored = target.restoreDurability(spent * restorePerDurability);
      building.spendDurability(restored / restorePerDurability);
      if (restored > 0.01) {
        didWork = true;
        this.game.effects.spawnRing(target.position, '#9dd8ff', 0.42, 0.28);
      }
    }
    return didWork;
  }

  restoreNearbyHealth(building, aura, tickSeconds = 1) {
    const targets = this.getAuraTargets(building, aura);
    const spendRate = Math.max(0, aura.durabilityPerSecond ?? 0) * tickSeconds;
    const healthPerDurability = Math.max(0.01, aura.healthPerDurability ?? 2);
    let didWork = false;
    for (const target of targets) {
      if (building.weapon.durability <= 0) return didWork;
      const missing = Math.max(0, target.maxHealth - target.health);
      if (missing <= 0.01) {
        const displayAmount = spendRate * healthPerDurability;
        if (displayAmount > 0.01) {
          didWork = true;
          this.game.effects.spawnHealNumber(target.position, 0, {
            displayAmount,
            height: target.projectileHitHeight ?? 1.55
          });
        }
        continue;
      }
      const wantedCost = Math.min(spendRate, missing / healthPerDurability);
      const spent = Math.min(building.weapon.durability, wantedCost);
      if (spent <= 0) return didWork;
      const healed = target.restoreHealth(spent * healthPerDurability);
      building.spendDurability(healed / healthPerDurability);
      didWork = true;
      this.game.effects.spawnHealNumber(target.position, healed, {
        displayAmount: spent * healthPerDurability,
        height: target.projectileHitHeight ?? 1.55
      });
    }
    return didWork;
  }

  getAuraTargets(building, aura) {
    const units = building.team === 'enemy' ? this.game.enemyUnits : this.game.friendlyUnits;
    const radius = Math.max(0, aura.radius ?? 5);
    return units.filter((unit) => (
      unit.alive &&
      !unit.isBuilding &&
      !unit.underConstruction &&
      distance2D(unit.position, building.position) <= radius
    ));
  }

  destroyIfDurabilitySpent(unit) {
    if (!unit.isBuilding || !unit.alive || unit.underConstruction) return;
    if ((unit.weapon?.durability ?? 1) > 0) return;
    unit.alive = false;
    this.constructing.delete(unit);
    this.buildings.delete(unit);
    this.finishConstructionVisual(unit, { removeOnly: true });
    this.game.effects.spawnRing(unit.position, '#ff8c66', 1.05, 0.42);
    this.game.effects.spawnStructureDust(unit.position, Math.max(1, unit.collisionRadius ?? 1), '#d8c8a8');
    this.game.handleUnitDeath?.(unit, null);
  }

  refreshBuildingSet(dt) {
    this.buildingRefreshTimer -= dt;
    if (this.buildingRefreshTimer > 0) return;
    this.buildingRefreshTimer = BUILDING_SET_REFRESH_SECONDS;
    this.game.friendlyUnits.forEach((unit) => {
      if (unit.isBuilding) this.buildings.add(unit);
    });
    this.game.enemyUnits.forEach((unit) => {
      if (unit.isBuilding) this.buildings.add(unit);
    });
  }
}

function createScaffold() {
  const group = new THREE.Group();
  const createLineMaterial = () => new THREE.LineBasicMaterial({
    color: SCAFFOLD_COLOR,
    transparent: true,
    opacity: 0.68,
    depthWrite: false
  });
  const levels = [0.15, 1.15, 2.15, 3.15];
  levels.forEach((y) => {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.72, y, -0.72),
      new THREE.Vector3(0.72, y, -0.72),
      new THREE.Vector3(0.72, y, 0.72),
      new THREE.Vector3(-0.72, y, 0.72),
      new THREE.Vector3(-0.72, y, -0.72)
    ]);
    group.add(new THREE.Line(geometry, createLineMaterial()));
  });
  [
    [-0.72, -0.72],
    [0.72, -0.72],
    [0.72, 0.72],
    [-0.72, 0.72]
  ].forEach(([x, z]) => {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0.15, z),
      new THREE.Vector3(x * 0.78, 3.55, z * 0.78)
    ]);
    group.add(new THREE.Line(geometry, createLineMaterial()));
  });
  return group;
}
