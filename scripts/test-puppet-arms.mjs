// 木傀儡「装备与战力」的纯逻辑回归（用户需求 1 + 3 的那一半）。
//
// 这一层要守的是两句**很难在游戏里复现**的话：
//   「木傀儡在没有武器的情况下需要会逃跑」——空手必须恒为 0 战力；
//   「斧头稿子也可以作战，但是斧头稿子战斗力弱」——有工具敢打弱怪、遇到强怪仍然打不过；
// 以及「需要增加战力判断」——战力必须随装备变化、双方同公式、可比较。
//
// 这些结论如果只靠游戏里看，很难说是公式对了还是恰好碰上了，所以这里把标定值锁死。
// 改 gameData 里傀儡武器的 damage / attackRate，或改 IMPROVISED_TOOL_DAMAGE，都会立刻变红。
//
// 「打还是逃、打谁、什么时候还该继续打」的判据不在这里，在 `test-combat-plan.mjs`
// 与 `test-combat-reflex.mjs`——那是另一层（combatPlan / combatReflex），
// 这里只负责"手里拿的东西值多少战力"。
import assert from 'node:assert/strict';
import { ITEM_DEFINITIONS, RECIPES, UNIT_DEFINITIONS } from '../src/data/gameData.js';
import { canEquipWeapon, isWeaponItem, weaponItem } from '../src/systems/weapons.js';
import {
  IMPROVISED_TOOL_DAMAGE,
  PUPPET_GEAR,
  PUPPET_WEAPON_FAMILY,
  combatPower,
  puppetCombatPower,
  puppetGearFor,
  unitCombatPower
} from '../src/systems/puppetArms.js';

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

const puppet = UNIT_DEFINITIONS.woodPuppet;
const gear = (options) => puppetGearFor(options);

// ---------------------------------------------------------------- 数据接缝
check('木傀儡的武器族与 profile 与自身定义严格对齐（否则永远装不上武器）', () => {
  assert.equal(puppet.weapon.family, PUPPET_WEAPON_FAMILY);
  // canEquipWeapon 会逐项比对：family / attackRange / projectileType / attackAnimation
  assert.equal(puppet.weapon.profile.attackRange, puppet.attackRange);
  assert.equal(puppet.weapon.profile.attackAnimation, puppet.art.clips.attack);
  assert.equal(puppet.weapon.profile.projectileType, null);
  assert.equal(puppet.projectileType, undefined);
});

check('两件傀儡武器都是合法的武器物品，且能被傀儡装上', () => {
  ['puppetCudgel', 'puppetGlaive'].forEach((itemId) => {
    assert.ok(ITEM_DEFINITIONS[itemId], `${itemId} 必须存在`);
    assert.ok(weaponItem(itemId), `${itemId} 必须被 weapons.js 认成武器`);
    assert.equal(ITEM_DEFINITIONS[itemId].weapon.family, PUPPET_WEAPON_FAMILY);
    const result = canEquipWeapon(itemId, { type: 'woodPuppet' });
    assert.equal(result.ok, true, `${itemId} 应该装得上：${result.label}`);
  });
});

check('木傀儡装不上别的兵种的武器（跨族必须被拒）', () => {
  assert.equal(canEquipWeapon('steelSword', { type: 'woodPuppet' }).ok, false);
  assert.equal(canEquipWeapon('longBow', { type: 'woodPuppet' }).ok, false);
});

check('斧/镐仍然是工具而非武器物品——"工具能打"必须是另一条机制', () => {
  // 这条断言是**设计记录**：如果有人图省事把 axe 改成武器，会连带影响
  // 换装校验（family 比对）与采集工具的判定，必须显式改这里而不是悄悄改。
  Object.keys(IMPROVISED_TOOL_DAMAGE).forEach((itemId) => {
    assert.equal(isWeaponItem(itemId), false, `${itemId} 不该是武器物品`);
    assert.equal(ITEM_DEFINITIONS[itemId].tool, itemId, `${itemId} 必须是工具`);
  });
});

check('傀儡武器的配方产物都是已定义物品', () => {
  ['puppetCudgel', 'puppetGlaive'].forEach((recipeId) => {
    const recipe = RECIPES[recipeId];
    assert.ok(recipe, `${recipeId} 配方必须存在`);
    assert.ok(ITEM_DEFINITIONS[recipe.output.itemId], `${recipeId} 的产物必须已定义`);
    recipe.inputs.forEach((input) => {
      assert.ok(ITEM_DEFINITIONS[input.itemId], `${recipeId} 的材料 ${input.itemId} 必须已定义`);
    });
  });
});

// ---------------------------------------------------------------- 装备判读
check('空手：伤害与战力都是 0', () => {
  const none = gear({});
  assert.equal(none.kind, PUPPET_GEAR.unarmed);
  assert.equal(none.damage, 0);
  assert.equal(puppetCombatPower(none), 0);
});

check('拿斧/镐：有伤害但明显弱于专用武器', () => {
  const axe = gear({ toolIds: ['axe'] });
  const pick = gear({ toolIds: ['pickaxe'] });
  assert.equal(axe.kind, PUPPET_GEAR.tool);
  assert.equal(axe.damage, IMPROVISED_TOOL_DAMAGE.axe);
  assert.equal(pick.damage, IMPROVISED_TOOL_DAMAGE.pickaxe);
  const cudgel = gear({ weaponItemId: 'puppetCudgel' });
  const glaive = gear({ weaponItemId: 'puppetGlaive' });
  assert.ok(puppetCombatPower(axe) > 0);
  assert.ok(puppetCombatPower(axe) < puppetCombatPower(cudgel));
  assert.ok(puppetCombatPower(cudgel) < puppetCombatPower(glaive));
});

check('真武器的优先级高于工具（同时拿斧子与木棒时按木棒算）', () => {
  const both = gear({ toolIds: ['axe', 'pickaxe'], weaponItemId: 'puppetCudgel' });
  assert.equal(both.kind, PUPPET_GEAR.weapon);
  assert.equal(both.damage, ITEM_DEFINITIONS.puppetCudgel.weapon.damage);
});

check('装了不属于傀儡族的武器时退回空手（安全兜底，不会白拿战力）', () => {
  const foreign = gear({ weaponItemId: 'steelSword' });
  assert.equal(foreign.kind, PUPPET_GEAR.unarmed);
  assert.equal(foreign.damage, 0);
});

check('战力公式：空手恒 0，且随伤害/攻速/血量单调', () => {
  assert.equal(combatPower({ damage: 0, attackRate: 5, maxHealth: 999 }), 0);
  const base = combatPower({ damage: 5, attackRate: 1, maxHealth: 30 });
  assert.ok(combatPower({ damage: 10, attackRate: 1, maxHealth: 30 }) > base);
  assert.ok(combatPower({ damage: 5, attackRate: 2, maxHealth: 30 }) > base);
  assert.ok(combatPower({ damage: 5, attackRate: 1, maxHealth: 60 }) > base);
  // 敌人与傀儡必须能用同一把尺子比较，否则"打不打得过"没有意义
  const ogre = unitCombatPower('ogre');
  const archer = unitCombatPower('goblinArcher');
  assert.ok(ogre > archer, '食人魔的战力必须高于哥布林弓手');
});

check('战力标定值锁死（改武器或敌人数值会在这里变红）', () => {
  const round = (value) => Math.round(value * 100) / 100;
  assert.equal(round(puppetCombatPower(gear({}))), 0);
  assert.equal(round(puppetCombatPower(gear({ toolIds: ['axe'] }))), 8.19);
  assert.equal(round(puppetCombatPower(gear({ toolIds: ['pickaxe'] }))), 7.83);
  assert.equal(round(puppetCombatPower(gear({ weaponItemId: 'puppetCudgel' }))), 13.53);
  assert.equal(round(puppetCombatPower(gear({ weaponItemId: 'puppetGlaive' }))), 23.14);
  assert.equal(round(unitCombatPower('goblinArcher')), 4.88);
  // 野狼按"快但脆"重排之后比哥布林士兵弱——这是"工具能清野怪"的前提
  assert.equal(round(unitCombatPower('wolf')), 7.69);
  assert.equal(round(unitCombatPower('goblinSoldier')), 8.54);
  assert.equal(round(unitCombatPower('shieldBearer')), 10.87);
  assert.equal(round(unitCombatPower('ogre')), 30.69);
});

check('战力公式与单位定义无关的部分必须稳定（同输入同输出，不读 buff）', () => {
  const axe = gear({ toolIds: ['axe'] });
  const first = puppetCombatPower(axe);
  for (let i = 0; i < 10; i += 1) {
    assert.equal(puppetCombatPower(gear({ toolIds: ['axe'] })), first);
  }
  // 傀儡的定义是共享对象：战力计算绝不能反过来写 definition
  assert.equal(puppet.physicalAttack, 0);
});

console.log(report.join('\n'));
console.log(process.exitCode ? '\nPUPPET ARMS: FAIL' : '\nPUPPET ARMS: PASS');
