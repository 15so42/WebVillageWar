import assert from 'node:assert/strict';
import { RecoverySystem } from '../src/systems/RecoverySystem.js';

function unit({ durability, maxDurability, isBuilding = false }) {
  return {
    alive: true,
    isBuilding,
    underConstruction: false,
    position: { x: 10, y: 0, z: 0 },
    health: 10,
    maxHealth: 10,
    projectileHitHeight: 1,
    weapon: { durability, maxDurability },
    restoreHealth: () => 0,
    restoreDurability(amount) {
      const previous = this.weapon.durability;
      this.weapon.durability = Math.min(this.weapon.maxDurability, previous + amount);
      return this.weapon.durability - previous;
    }
  };
}

function structure(id, durability) {
  return {
    id,
    kind: 'structure',
    alive: true,
    position: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    structureDurability: durability,
    maxStructureDurability: 30
  };
}

const friendlyUnit = unit({ durability: 5, maxDurability: 10 });
const friendlyBuilding = unit({ durability: 8, maxDurability: 12, isBuilding: true });
const enemyUnit = unit({ durability: 2, maxDurability: 8 });
const playerBase = structure('player-base', 17);
const enemyCamp = structure('enemy-camp', 29);
const game = {
  playerBase,
  enemyCamp,
  friendlyUnits: [friendlyUnit, friendlyBuilding],
  enemyUnits: [enemyUnit],
  localPlayerSlot: 'p1',
  modifiers: {
    getStructureRecoveryRadius: () => 0,
    getStructureHealthPerSecond: () => 0,
    getStructureDurabilityPerSecond: () => 0,
    getArmor: () => 0
  },
  effects: {
    ensureRecoveryAura: () => {},
    spawnHealNumber: () => {}
  },
  repairStructure(target, { durability = 0 } = {}) {
    const previous = target.structureDurability;
    target.structureDurability = Math.min(target.maxStructureDurability, previous + durability);
    return { health: 0, durability: target.structureDurability - previous };
  }
};

const recovery = new RecoverySystem(game);
recovery.update(1);
recovery.update(1);
assert.equal(friendlyUnit.weapon.durability, 5, '两秒时尚未触发被动耐久恢复');
recovery.update(1);
assert.equal(friendlyUnit.weapon.durability, 6);
assert.equal(friendlyBuilding.weapon.durability, 9, '建筑单位也应恢复耐久');
assert.equal(enemyUnit.weapon.durability, 3, '敌方单位同样遵守通用耐久规则');
assert.equal(playerBase.structureDurability, 18);
assert.equal(enemyCamp.structureDurability, 30, '结构耐久不得超过上限');

console.log('Passive three-second durability recovery checks passed.');
