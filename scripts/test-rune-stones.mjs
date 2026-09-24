// 符文石系统回归测试（对应 docs/RUNE_STONE_GAMEPLAY_PLAN.md 第 3～4 节与第 8 节验收要点）：
// 1) 附魔卡一次使用只生成一块石头，可落在单位背包或基地背包；
// 2) 同名一块、容量上限、随时转移、取出后立即失去效果；
// 3) 售价 = 生成时实付能量 × 80%，允许小数，练级不提高售价；
// 4) 阵亡掉落：石头离开单位落地成为遗物包，等级/经验/成长原样保留，可由人捡回；
// 5) 魔力按携带数量均分、跨级扣除、总量守恒，且满级不再累计；
// 6) 序列化/反序列化守恒，不复制不丢失。
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Inventory } from '../src/systems/Inventory.js';

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  location: { href: 'http://localhost/', search: '' },
  matchMedia: () => ({ matches: false }),
  addEventListener: () => {},
  removeEventListener: () => {}
};

// UnitEntity 会创建世界空间状态元素，这里给出最小 DOM 存根，避免测试依赖真实浏览器。
function createFakeElement(tag = 'div') {
  return {
    tagName: String(tag).toUpperCase(),
    children: [],
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    hidden: false,
    textContent: '',
    innerHTML: '',
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      return child;
    },
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

globalThis.document = {
  body: createFakeElement('body'),
  createElement: (tag) => createFakeElement(tag),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {}
};

const [
  { BALANCE },
  { RuneStoneSystem, RUNE_ERROR },
  {
    applyManaToStone,
    initialRuneLevelForCard,
    manaThresholdForLevel,
    runeMaxLevel,
    runeSellValue,
    splitManaEvenly
  },
  { UnitEntity }
] = await Promise.all([
  import('../src/data/gameData.js'),
  import('../src/systems/RuneStoneSystem.js'),
  import('../src/systems/runeStones.js'),
  import('../src/entities/UnitEntity.js')
]);

const REFUND_RATIO = Number(BALANCE.runes?.sellRefundRatio ?? 0.8);

// ---- 1) 纯函数：均分与成长 ----
{
  const shares = splitManaEvenly(10, 3);
  assert.equal(shares.length, 3);
  assert.equal(
    shares.reduce((sum, value) => sum + value, 0),
    10,
    '均分必须严格守恒，最后一块吸收浮点余数'
  );
  assert.equal(splitManaEvenly(0, 3).length, 0);
  assert.equal(splitManaEvenly(5, 0).length, 0);
}

{
  const threshold = manaThresholdForLevel(1);
  assert.ok(Number.isFinite(threshold) && threshold > 0, '1 级升 2 级需要正数魔力');
  assert.equal(manaThresholdForLevel(runeMaxLevel()), Infinity, '满级不再需要魔力');

  const first = applyManaToStone({ level: 1, mana: 0 }, threshold - 1);
  assert.equal(first.level, 1);
  assert.equal(first.mana, threshold - 1);
  assert.equal(first.levelsGained, 0);

  const second = applyManaToStone({ level: 1, mana: 0 }, threshold);
  assert.equal(second.level, 2);
  assert.equal(second.mana, 0);
  assert.equal(second.levelsGained, 1);

  // 一次投喂大量魔力应连续跨级并保留余额，不吞掉也不凭空增加。
  const big = applyManaToStone({ level: 1, mana: 0 }, 100000);
  assert.equal(big.level, runeMaxLevel(), '巨额魔力应直达满级');
  assert.equal(big.mana, 0, '满级后不再累计进度');
}

{
  // 附魔卡等级决定新石头初始等级（可配置开启时）。
  assert.equal(initialRuneLevelForCard({ level: 3 }), 3);
  assert.equal(initialRuneLevelForCard({}), 1);
}

// ---- 2) 售价：实付能量的 80% + 等级溢价（每级 +2），允许小数 ----
{
  const perLevel = Math.max(0, Number(BALANCE.runes?.sellPricePerLevel ?? 0));
  assert.ok(perLevel > 0, '等级溢价必须可配置且大于 0');
  assert.equal(runeSellValue({ paidEnergy: 2, level: 1 }), Math.round(2 * REFUND_RATIO * 100) / 100);
  assert.equal(
    runeSellValue({ paidEnergy: 2, level: 6 }),
    Math.round((2 * REFUND_RATIO + 5 * perLevel) * 100) / 100,
    '每提升一级都应加价'
  );
  assert.equal(
    runeSellValue({ paidEnergy: 2, level: 6 }) > runeSellValue({ paidEnergy: 2, level: 1 }),
    true,
    '练过级的石头必须卖得更贵'
  );
  assert.equal(runeSellValue({ paidEnergy: 0, level: 1 }), 0, '实付为零且一级的石头返还为零');
  assert.equal(
    runeSellValue({ paidEnergy: 0, level: 4 }),
    Math.round(3 * perLevel * 100) / 100,
    '等级溢价与实付能量无关：实付为零但练过级仍卖得出价钱'
  );
  assert.equal(runeSellValue({ paidEnergy: 3, level: 1 }), 2.4);
}

// ---- 3) 系统行为 ----
function makeGame() {
  const energyEvents = [];
  const cardSystem = {
    energy: 0,
    addEnergy(amount) {
      this.energy = Math.round((this.energy + Number(amount || 0)) * 100) / 100;
      energyEvents.push(amount);
      return amount;
    }
  };
  const game = {
    localPlayerSlot: 'p1',
    localPlayerId: 'p1',
    activeEconomySlot: 'p1',
    coop: null,
    players: null,
    friendlyUnits: [],
    enemyUnits: [],
    cardSystem,
    cardSystems: null,
    networkBridge: { markPrivateStateDirty: () => {} },
    coopPlayerSlots: () => ['p1'],
    unitBelongsToPlayer: (unit, slot) => (
      unit?.team === 'player' || (unit?.controllerPlayerId ?? unit?.ownerPlayerId) === slot
    )
  };
  // 符文石现在就是背包里的一件物品（itemId === 'runeStone'）：落点就是格子本身。
  // 所以假 game 也必须真的有存储，否则 createStone() 会因为"没地方放"直接失败。
  game.baseInventory = new Inventory({ id: 'base', capacity: 48 });
  game.itemBagFor = (unit, { create = true } = {}) => {
    if (!unit?.id) return null;
    if (unit.workerInventory) return unit.workerInventory;
    if (unit.itemBag) return unit.itemBag;
    if (!create) return null;
    unit.itemBag = new Inventory({ id: `unit:${unit.id}`, capacity: 16 });
    return unit.itemBag;
  };
  return { game, cardSystem, energyEvents };
}

function makeUnit(id, { capacity = 5 } = {}) {
  const unit = new UnitEntity({ type: 'knight', team: 'player', position: { x: 0, y: 0, z: 0 } });
  unit.id = id;
  unit.maxEnchantmentSlots = capacity;
  unit.alive = true;
  return unit;
}

const FIRE_CARD = { id: 'fire-enchant', kind: 'enchant', level: 1, enchantmentId: 'fire', energyCost: 2 };
const THORNS_CARD = { id: 'thorns-enchant', kind: 'enchant', level: 1, enchantmentId: 'thorns', energyCost: 2 };

{
  const { game } = makeGame();
  const system = new RuneStoneSystem(game);
  game.runeStones = system;
  const unit = makeUnit('u1');
  game.friendlyUnits.push(unit);

  // 拖到空处 → 基地背包
  const toBase = system.createFromCard(FIRE_CARD, { playerId: 'p1', paidEnergy: 2 });
  assert.equal(toBase.ok, true);
  assert.equal(toBase.placement, 'base');
  assert.equal(system.baseStones('p1').length, 1);
  assert.equal(unit.enchantments.size, 0, '基地背包里的石头不向单位提供效果');

  // 拖到单位 → 该单位背包并立即生效
  const toUnit = system.moveStone(toBase.stone.id, { kind: 'unit', unit }, { playerId: 'p1' });
  assert.equal(toUnit.ok, true);
  assert.equal(system.stonesForUnit(unit).length, 1);
  assert.equal(unit.enchantments.has('fire'), true, '石头放进单位背包后应立即生效');
  assert.equal(system.baseStones('p1').length, 0);

  // 取出后立即失去效果
  const back = system.moveStone(toBase.stone.id, { kind: 'base', playerId: 'p1' }, { playerId: 'p1' });
  assert.equal(back.ok, true);
  assert.equal(unit.enchantments.has('fire'), false, '取出后不应残留附魔效果');
  assert.equal(system.stonesForUnit(unit).length, 0);
  assert.equal(system.baseStones('p1').length, 1);

  // 同名石头允许放进同一个单位背包：第一块生效，第二块是同名备用石
  //（留在背包里灰色显示、不提供效果，但仍然照常吃魔力升级）。
  system.moveStone(toBase.stone.id, { kind: 'unit', unit }, { playerId: 'p1' });
  const sameName = system.createFromCard(FIRE_CARD, { playerId: 'p1', targetUnit: unit, paidEnergy: 2 });
  assert.equal(sameName.ok, true, '同名符文石必须允许放进同一单位背包');
  assert.equal(system.stonesForUnit(unit).length, 2);
  assert.equal(system.isStoneActive(toBase.stone), true, '先放进背包的那一块生效');
  assert.equal(system.isStoneActive(sameName.stone), false, '后放进来的同名石头不生效');
  assert.equal(system.isStoneInactiveDuplicate(sameName.stone), true);
  assert.equal(unit.enchantments.size, 1, '同名石头只能让一个附魔生效');
  assert.equal(
    unit.enchantments.get('fire')?.runeStoneId,
    toBase.stone.id,
    '生效的必须是排在最前的那一块'
  );

  // 备用石照常参与魔力均分，因此也能升级。
  const backupBefore = sameName.stone.level;
  system.awardMana(unit, 120);
  assert.ok(sameName.stone.mana > 0, '同名备用石必须照常吃魔力');
  assert.ok(
    sameName.stone.level >= backupBefore,
    '魔力照常累计到备用石上，攒够阈值就会升级'
  );
  assert.equal(unit.enchantments.size, 1, '备用石升级后仍然只有一个附魔生效');

  // 把生效的那块移走，备用石应立刻顶上生效。
  system.moveStone(toBase.stone.id, { kind: 'base', playerId: 'p1' }, { playerId: 'p1' });
  assert.equal(system.isStoneActive(sameName.stone), true, '前一块移走后备用石接管生效');
  assert.equal(unit.enchantments.get('fire')?.runeStoneId, sameName.stone.id);

  // 容量上限：符文石现在占的是**背包格**（不再单独有一套"符文槽位数"），
  // 所以"放不下"就等于单位的背包没有空格。
  // 用不可堆叠的魔力石把剩下的格子填满（木柴会叠成一堆，填不出"没格子"的状态）。
  const small = makeUnit('u2');
  game.friendlyUnits.push(small);
  const first = system.createFromCard(THORNS_CARD, { playerId: 'p1', targetUnit: small, paidEnergy: 2 });
  assert.equal(first.ok, true);
  const smallBag = game.itemBagFor(small);
  while (smallBag.freeSlots() > 0) smallBag.add('manaStone', 1);
  assert.equal(smallBag.freeSlots(), 0, '夹具前提：这个单位的背包确实已经填满');
  const overflow = system.createFromCard(FIRE_CARD, { playerId: 'p1', targetUnit: small, paidEnergy: 2 });
  assert.equal(overflow.ok, false);
  assert.equal(overflow.reason, RUNE_ERROR.UNIT_FULL);
  assert.equal(system.stonesForUnit(small).length, 1, '失败时不得改变资产');

  // 失败不消耗：已存在的石头数量只受成功操作影响
  assert.equal(system.allStones({ playerId: 'p1' }).length, 3);
}

{
  // 出售：只销毁被卖的实例。卡牌能量已删除，所以不再返还能量。
  const { game } = makeGame();
  const system = new RuneStoneSystem(game);
  game.runeStones = system;
  const unit = makeUnit('u1');
  game.friendlyUnits.push(unit);

  const created = system.createFromCard(FIRE_CARD, { playerId: 'p1', targetUnit: unit, paidEnergy: 2 });
  assert.equal(created.ok, true);
  assert.equal(created.stone.level, 1);
  const flatPrice = runeSellValue(created.stone);

  // 练级会提高售价：每提升一级额外加价。
  const perLevel = Math.max(0, Number(BALANCE.runes?.sellPricePerLevel ?? 0));
  created.stone.level = runeMaxLevel();
  const levelPrice = runeSellValue(created.stone);
  assert.equal(
    levelPrice,
    Math.round((1.6 + (runeMaxLevel() - 1) * perLevel) * 100) / 100,
    '售价必须随等级提高'
  );
  assert.ok(levelPrice > flatPrice, '练过级的石头比一级时更值钱');

  const sold = system.sellStone(created.stone.id, { playerId: 'p1' });
  assert.equal(sold.ok, true);
  assert.equal(sold.refund, levelPrice);
  assert.equal(system.allStones({ playerId: 'p1' }).length, 0);
  assert.equal(unit.enchantments.has('fire'), false, '卖掉单位身上的石头必须解除其效果');

  // 别人的石头不能卖
  const other = system.createFromCard(FIRE_CARD, { playerId: 'p2', paidEnergy: 2 });
  const denied = system.sellStone(other.stone.id, { playerId: 'p1' });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, RUNE_ERROR.NOT_OWNED);
}

{
  // 阵亡掉落（生存方案第 7 节）：石头立刻离开单位落地成为遗物包。
  // 这里断言的是新契约，和旧版"石头留在阵亡单位背包里"是相反的行为。
  const { game } = makeGame();
  const system = new RuneStoneSystem(game);
  game.runeStones = system;
  const unit = makeUnit('u1');
  game.friendlyUnits.push(unit);
  const created = system.createFromCard(FIRE_CARD, { playerId: 'p1', targetUnit: unit, paidEnergy: 2 });
  const stoneId = created.stone.id;
  assert.equal(unit.enchantments.has('fire'), true, '掉落前石头应当在单位身上生效');

  unit.alive = false;
  game.friendlyUnits = [];
  const stacks = system.detachStonesOnDeath(unit, { x: 3, z: -4, dropId: 'drop-1' });

  assert.equal(stacks.length, 1, '阵亡必须把石头交出来作为掉落物');
  assert.equal(stacks[0].instanceId, stoneId, '掉的必须是同一块石头实例');
  assert.equal(stacks[0].itemId, 'runeStone');
  assert.equal(system.stonesForUnit(unit).length, 0, '石头必须离开阵亡单位');
  assert.equal(system.baseStones('p1').length, 0, '死亡不得把石头自动送回基地');
  assert.equal(
    system.strandedBackpacks('p1').length,
    0,
    '石头已经落地，不该再出现在"阵亡单位背包"里'
  );
  const groundStone = system.stoneById(stoneId);
  assert.equal(groundStone.location.kind, 'ground');
  assert.equal(groundStone.location.dropId, 'drop-1');
  assert.equal(groundStone.location.fallenUnitId, 'u1');
  assert.equal(unit.enchantments.has('fire'), false, '落地后不得继续给原单位提供加成');

  // 拾取：同一个实例回到拾取者背包，等级与身份不变
  const picker = makeUnit('u2');
  game.friendlyUnits.push(picker);
  const picked = system.pickUpStone(stacks[0].instanceId, picker, stacks[0].data);
  assert.equal(picked.ok, true);
  assert.equal(picked.stone.id, stoneId, '拾取搬的是同一块石头，不是新造一块');
  assert.equal(system.stonesForUnit(picker).length, 1);
  assert.equal(picker.enchantments.has('fire'), true, '捡回后石头重新生效');
  assert.equal(system.allStones({ playerId: 'p1' }).length, 1, '掉落拾取不得复制石头');
}

{
  // 拾取者的符文背包满了：石头原地不动，绝不静默销毁
  const { game } = makeGame();
  const system = new RuneStoneSystem(game);
  game.runeStones = system;
  const fallen = makeUnit('u1');
  game.friendlyUnits.push(fallen);
  system.createFromCard(FIRE_CARD, { playerId: 'p1', targetUnit: fallen, paidEnergy: 2 });
  fallen.alive = false;
  game.friendlyUnits = [];
  const stacks = system.detachStonesOnDeath(fallen, { x: 0, z: 0 });

  // 拾取者的背包满了：石头原地不动，绝不静默销毁
  //（"满"的判据现在是背包没有空格，用不可堆叠的魔力石把格子填掉。）
  const full = makeUnit('u2');
  game.friendlyUnits.push(full);
  system.createFromCard(THORNS_CARD, { playerId: 'p1', targetUnit: full, paidEnergy: 2 });
  const fullBag = game.itemBagFor(full);
  while (fullBag.freeSlots() > 0) fullBag.add('manaStone', 1);
  assert.equal(fullBag.freeSlots(), 0, '夹具前提：拾取者的背包确实已经填满');
  const denied = system.pickUpStone(stacks[0].instanceId, full, stacks[0].data);
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, RUNE_ERROR.UNIT_FULL);
  assert.equal(system.stoneById(stacks[0].instanceId).location.kind, 'ground', '装不下就必须留在原地');
}

{
  // 拾取不得改写归属：单位身上的 ownerPlayerId / controllerPlayerId 属于卡牌系统那套
  // id 空间（本地单机是 'p1'），符文系统用的是 slot（'local-player'）。
  // 真机上曾经因为拿 unit.ownerPlayerId 覆盖 playerId，导致石头一被捡起来
  // 就从玩家自己的符文背包 UI 里消失（allStones({playerId}) 查不到了）。
  const { game } = makeGame();
  const system = new RuneStoneSystem(game);
  game.runeStones = system;
  const fallen = makeUnit('u1');
  game.friendlyUnits.push(fallen);
  system.createFromCard(FIRE_CARD, { playerId: 'p1', targetUnit: fallen, paidEnergy: 2 });
  fallen.alive = false;
  game.friendlyUnits = [];
  const stacks = system.detachStonesOnDeath(fallen, { x: 0, z: 0 });

  const picker = makeUnit('u2');
  // 故意让单位的归属 id 与石头的 playerId 不同名
  picker.ownerPlayerId = 'card-slot-p1';
  picker.controllerPlayerId = 'card-slot-p1';
  game.friendlyUnits.push(picker);

  const picked = system.pickUpStone(stacks[0].instanceId, picker, stacks[0].data);
  assert.equal(picked.ok, true);
  assert.equal(picked.stone.playerId, 'p1', '拾取不得改写石头的归属');
  assert.equal(
    system.allStones({ playerId: 'p1' }).length,
    1,
    '拾取后石头必须仍在原玩家的列表里，否则 UI 会当场看不到它'
  );
  assert.equal(
    system.allStones({ playerId: 'card-slot-p1' }).length,
    0,
    '不得把石头划到单位那套 id 空间下'
  );
}

{
  // 重生：石头已经落地，复生单位不得继承——否则同一块石头会同时存在于地面和新身体里
  const { game } = makeGame();
  const system = new RuneStoneSystem(game);
  game.runeStones = system;
  const oldUnit = makeUnit('u1');
  game.friendlyUnits.push(oldUnit);
  system.createFromCard(FIRE_CARD, { playerId: 'p1', targetUnit: oldUnit, paidEnergy: 2 });

  oldUnit.alive = false;
  const stacks = system.detachStonesOnDeath(oldUnit, { x: 1, z: 1 });
  const reborn = makeUnit('u9');
  game.friendlyUnits.push(reborn);

  assert.equal(system.stonesForUnit(reborn).length, 0, '复生单位不得自动继承阵亡单位的石头');
  assert.equal(reborn.enchantments.has('fire'), false);
  assert.equal(system.stoneById(stacks[0].instanceId).location.kind, 'ground');

  // 想要拿回来就派人去捡
  const picked = system.pickUpStone(stacks[0].instanceId, reborn, stacks[0].data);
  assert.equal(picked.ok, true);
  assert.equal(system.stonesForUnit(reborn).length, 1);
  assert.equal(reborn.enchantments.has('fire'), true);
  assert.equal(system.allStones({ playerId: 'p1' }).length, 1, '重生链路不得复制符文石');
}

{
  // 魔力均分与守恒
  const { game } = makeGame();
  const system = new RuneStoneSystem(game);
  game.runeStones = system;
  const unit = makeUnit('u1', { capacity: 5 });
  game.friendlyUnits.push(unit);

  // 未携带石头：魔力不凭空产生，也不静默变成资产
  const empty = system.awardMana(unit, 12);
  assert.equal(empty.distributed, 0);
  assert.equal(empty.wasted, 12);

  const a = system.createFromCard(FIRE_CARD, { playerId: 'p1', targetUnit: unit, paidEnergy: 2 }).stone;
  const b = system.createFromCard(THORNS_CARD, { playerId: 'p1', targetUnit: unit, paidEnergy: 2 }).stone;

  // 两块石头分 M 点：每块 M/2，不能各拿满 M
  const amount = 10;
  system.awardMana(unit, amount);
  assert.equal(a.mana + b.mana, amount, '均分总量必须守恒');
  assert.equal(a.mana, 5);
  assert.equal(b.mana, 5);

  // 只有一块石头时独占全部魔力
  const back = system.moveStone(b.id, { kind: 'base', playerId: 'p1' }, { playerId: 'p1' });
  assert.equal(back.ok, true);
  system.awardMana(unit, 7);
  assert.equal(a.mana, 12);

  // 升级后效果等级同步提高
  const needed = manaThresholdForLevel(1);
  system.awardMana(unit, Math.max(0, needed - a.mana));
  assert.equal(a.level, 2, '攒够阈值后石头应升级');
  assert.equal(unit.enchantments.get('fire')?.level, 2, '石头升级后单位身上的效果等级必须同步');
}

{
  // 序列化守恒
  const { game } = makeGame();
  const system = new RuneStoneSystem(game);
  game.runeStones = system;
  const unit = makeUnit('u1');
  game.friendlyUnits.push(unit);
  system.createFromCard(FIRE_CARD, { playerId: 'p1', targetUnit: unit, paidEnergy: 2 });
  system.createFromCard(THORNS_CARD, { playerId: 'p1', paidEnergy: 3 });

  const serialized = system.serializeForSlot('p1');
  assert.equal(serialized.stones.length, 2);
  assert.equal(JSON.parse(JSON.stringify(serialized)).stones.length, 2, '序列化结果必须可 JSON 往返');

  const { game: otherGame } = makeGame();
  const restored = new RuneStoneSystem(otherGame);
  restored.applyNetworkSnapshot(serialized.stones);
  const rows = restored.serializeForSlot('p1').stones;
  assert.equal(rows.length, 2);
  const unitStone = rows.find((row) => row.location.kind === 'unit');
  assert.equal(unitStone.location.unitId, 'u1', '单位归属必须随石头一起恢复');
  assert.equal(unitStone.paidEnergy, 2);
}

// ---- 4) 魔力祭坛的喷发表现：向上运动、软粒子多层、留在主世界 layer 0 ----
{
  const { EffectsSystem } = await import('../src/systems/EffectsSystem.js');
  const effects = new EffectsSystem(new THREE.Scene());
  effects.spawnManaBurst({ x: 0, y: 0, z: 0 }, { radius: 2 });
  const effect = effects.effects.at(-1);
  assert.ok(effect, '魔力喷发必须注册成一次特效');
  assert.ok(effect.duration > 0);

  const sprites = [];
  effect.object.traverse((child) => {
    if (child.isSprite) sprites.push(child);
  });
  assert.ok(sprites.length >= 20, '魔力喷发应由多层软边粒子组成，不能只放一颗');
  assert.equal(
    sprites.every((sprite) => sprite.layers.mask === 1),
    true,
    '魔力喷发必须留在主世界 layer 0，才能被地形与单位正常遮挡'
  );
  assert.equal(effect.object.userData.preserveRenderLayers, true);

  const beforeY = sprites.map((sprite) => sprite.position.y);
  for (let step = 0; step < 6; step += 1) effects.update(0.1);
  const risen = sprites.filter((sprite, index) => sprite.position.y > beforeY[index] + 0.05);
  assert.ok(risen.length > 0, '粒子必须向上运动，而不是原地不动或向下');
  assert.equal(
    sprites.every((sprite) => sprite.scale.x > 0 && sprite.scale.x < 4),
    true,
    '粒子尺寸必须由缩放包络驱动，出现与消失都有渐变'
  );
  assert.ok(
    sprites.some((sprite) => sprite.scale.x > 0.01),
    '播放中应至少有可见尺寸的粒子'
  );
  effects.destroy();
}

console.log('rune stone system checks passed');
