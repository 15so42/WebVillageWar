// 附魔石：目录里的每一种附魔都能做成石头，放进傀儡背包后生效，取出后消失。
import assert from 'node:assert/strict';
import { Inventory } from '../src/systems/Inventory.js';

function createFakeElement(tag = 'div') {
  return {
    tagName: String(tag).toUpperCase(),
    children: [],
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    hidden: false,
    textContent: '',
    appendChild(child) { this.children.push(child); return child; },
    remove() {},
    setAttribute() {},
    removeAttribute() {},
    getAttribute: () => null,
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }),
    closest: () => null
  };
}

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  location: { href: 'http://localhost/', search: '' },
  matchMedia: () => ({ matches: false }),
  addEventListener: () => {},
  removeEventListener: () => {}
};
globalThis.document = {
  body: createFakeElement('body'),
  createElement: (tag) => createFakeElement(tag),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {}
};

const [
  { ENCHANTMENTS, ITEM_DEFINITIONS, ITEM_RULES },
  { allEnchantRecipes },
  { RuneStoneSystem },
  { UnitEntity },
  { workerCargoSlotStart, workerCargoUsedSlots },
  { magicStoneDropFor }
] = await Promise.all([
  import('../src/data/gameData.js'),
  import('../src/systems/research.js'),
  import('../src/systems/RuneStoneSystem.js'),
  import('../src/entities/UnitEntity.js'),
  import('../src/systems/workerInventory.js'),
  import('../src/systems/drops.js')
]);

const report = [];
function check(name, fn) {
  try {
    fn();
    report.push(`ok   ${name}`);
  } catch (error) {
    report.push(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

function makeGame() {
  const game = {
    localPlayerSlot: 'p1',
    localPlayerId: 'p1',
    friendlyUnits: [],
    enemyUnits: [],
    networkBridge: { markPrivateStateDirty: () => {} },
    coopPlayerSlots: () => ['p1'],
    onUnitBackpackChanged() {}
  };
  game.baseInventory = new Inventory({ id: 'base', capacity: 64 });
  game.itemBagFor = (unit, { create = true } = {}) => {
    if (!unit?.id) return null;
    if (unit.workerInventory) return unit.workerInventory;
    if (unit.itemBag) return unit.itemBag;
    if (!create) return null;
    unit.itemBag = new Inventory({ id: `unit:${unit.id}`, capacity: 16 });
    return unit.itemBag;
  };
  return game;
}

function makePuppet(type) {
  const unit = new UnitEntity({ type, team: 'player', position: { x: 0, y: 0, z: 0 } });
  unit.isWorker = true;
  unit.alive = true;
  unit.workerInventory = new Inventory({
    id: `worker:${unit.id}`,
    capacity: ITEM_RULES.workerInventorySlots
  });
  return unit;
}

check('每一种附魔都有一块石头，而且要堆很多材料，不用食物', () => {
  const recipes = allEnchantRecipes();
  const ids = new Set(recipes.map((recipe) => recipe.enchantmentId));
  Object.keys(ENCHANTMENTS).forEach((id) => {
    assert.equal(ids.has(id), true, `${id} 没有附魔石配方`);
  });
  assert.equal(recipes.length, Object.keys(ENCHANTMENTS).length);
  assert.equal(ids.has('curse'), true);
  assert.equal(ids.has('frost'), true);
  recipes.forEach((recipe) => {
    assert.equal(recipe.cost.some((entry) => entry.itemId === 'food'), false, recipe.enchantmentId);
    assert.equal(recipe.cost.some((entry) => entry.itemId === 'deepCore'), false, recipe.enchantmentId);
    const bulk = recipe.cost.reduce((sum, entry) => sum + entry.count, 0);
    assert.ok(bulk >= 60, `${recipe.enchantmentId} 成本只有 ${bulk}`);
    recipe.cost.forEach((entry) => {
      assert.ok(ITEM_DEFINITIONS[entry.itemId], entry.itemId);
    });
  });
});

check('附魔石放进木傀儡和铁傀儡背包就生效，取出来就消失', () => {
  for (const type of ['woodPuppet', 'ironPuppet']) {
    const game = makeGame();
    const system = new RuneStoneSystem(game);
    game.runeStones = system;
    const puppet = makePuppet(type);
    game.friendlyUnits.push(puppet);
    const baseArmor = puppet.armor;
    const baseAttack = puppet.physicalAttack;
    const baseMagic = puppet.magicAttack;

    const made = system.createEnchantmentStone({
      enchantmentId: 'power',
      playerId: 'p1',
      targetUnit: puppet
    });
    assert.equal(made.ok, true, made.reason);
    assert.equal(puppet.enchantments.has('power'), true, `${type} 背包里的力量石应生效`);
    assert.equal(puppet.physicalAttack, baseAttack + 1.5);
    assert.equal(puppet.magicAttack, baseMagic + 1.5);

    const back = system.moveStone(made.stone.id, { kind: 'base' }, { playerId: 'p1' });
    assert.equal(back.ok, true);
    assert.equal(puppet.enchantments.has('power'), false, `${type} 取出力量石后攻击加成应消失`);
    assert.equal(puppet.physicalAttack, baseAttack);
    assert.equal(puppet.magicAttack, baseMagic);

    const armored = system.createEnchantmentStone({
      enchantmentId: 'waveArmored',
      playerId: 'p1',
      targetUnit: puppet
    });
    assert.equal(armored.ok, true, armored.reason);
    assert.equal(puppet.enchantments.has('waveArmored'), true);
    assert.ok(puppet.armor > baseArmor, `${type} 重甲石应提高护甲`);
    system.moveStone(armored.stone.id, { kind: 'base' }, { playerId: 'p1' });
    assert.equal(puppet.enchantments.has('waveArmored'), false);
    assert.equal(puppet.armor, baseArmor);
  }
});

check('目录里的每一种附魔石放进木傀儡背包都会挂上同名效果', () => {
  const game = makeGame();
  const system = new RuneStoneSystem(game);
  game.runeStones = system;
  const puppet = makePuppet('woodPuppet');
  game.friendlyUnits.push(puppet);
  Object.keys(ENCHANTMENTS).forEach((id) => {
    const made = system.createEnchantmentStone({
      enchantmentId: id,
      playerId: 'p1',
      targetUnit: puppet
    });
    assert.equal(made.ok, true, `${id}: ${made.reason}`);
    assert.equal(puppet.enchantments.has(id), true, `${id} 放进背包后应挂上附魔`);
    const back = system.moveStone(made.stone.id, { kind: 'base' }, { playerId: 'p1' });
    assert.equal(back.ok, true, id);
    assert.equal(puppet.enchantments.has(id), false, `${id} 取出后不应残留`);
  });
});

check('物资区里的附魔石仍生效，但不算成要送回去的货', () => {
  const game = makeGame();
  const system = new RuneStoneSystem(game);
  game.runeStones = system;
  const puppet = makePuppet('woodPuppet');
  game.friendlyUnits.push(puppet);
  const made = system.createEnchantmentStone({
    enchantmentId: 'fire',
    playerId: 'p1',
    targetUnit: puppet
  });
  assert.equal(made.ok, true, made.reason);
  const cargoIndex = workerCargoSlotStart();
  const moved = system.moveStone(
    made.stone.id,
    { kind: 'unit', unit: puppet },
    { playerId: 'p1', slotIndex: cargoIndex }
  );
  assert.equal(moved.ok, true, moved.reason);
  assert.equal(puppet.workerInventory.slots[cargoIndex]?.itemId, 'runeStone');
  assert.equal(puppet.enchantments.has('fire'), true);
  assert.equal(workerCargoUsedSlots(puppet.workerInventory), 0);
});

check('怪物掉魔石，玩家和建筑不掉', () => {
  const wolf = magicStoneDropFor({ team: 'enemy', isWildlife: true, definition: { maxHealth: 13 } });
  const bear = magicStoneDropFor({ team: 'enemy', isWildlife: true, definition: { maxHealth: 68 } });
  const ogre = magicStoneDropFor({ team: 'enemy', definition: { maxHealth: 90 } });
  const puppet = magicStoneDropFor({ team: 'player', isWorker: true, definition: { maxHealth: 30 } });
  const tower = magicStoneDropFor({ team: 'enemy', isBuilding: true, definition: { maxHealth: 80 } });
  assert.deepEqual(wolf, { itemId: 'magicStone', count: 1 });
  assert.deepEqual(bear, { itemId: 'magicStone', count: 2 });
  assert.deepEqual(ogre, { itemId: 'magicStone', count: 3 });
  assert.equal(puppet, null);
  assert.equal(tower, null);
  const power = allEnchantRecipes().find((recipe) => recipe.enchantmentId === 'power');
  assert.deepEqual(
    power.cost.find((entry) => entry.itemId === 'magicStone'),
    { itemId: 'magicStone', count: 8 }
  );
});

console.log(report.join('\n'));
if (process.exitCode) process.exit(process.exitCode);
console.log(`\n附魔石：${report.length}/${report.length} 通过`);
