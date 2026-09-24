// 武器换装规则回归测试（方案第 6.2 节）。
//
// 方案原文要求「武器只能换成同类武器」，并且「检查攻击动画、投射物、射程、
// 攻击事件和耐力参数兼容，不能只改模型」。这里把四项判据逐条钉住：
// 任何一项不匹配都必须被拒绝，且拒绝理由要能说清是哪一项。
import assert from 'node:assert/strict';
import {
  WEAPON_ERROR,
  baselineWeaponItemFor,
  canEquipWeapon,
  isWeaponItem,
  normalizeWeapon,
  unitWeaponProfile,
  weaponItem,
  weaponStatPatch
} from '../src/systems/weapons.js';
import { ITEM_DEFINITIONS, RECIPES, UNIT_DEFINITIONS } from '../src/data/gameData.js';

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

/** 只用定义就能构造出的"单位替身"：校验逻辑只看 type 与定义。 */
const unitOf = (type) => ({ type, definition: UNIT_DEFINITIONS[type], alive: true });

check('数据健全：每件武器都有家族、动作档位与数值，且都能被合成出来', () => {
  const weapons = Object.values(ITEM_DEFINITIONS).filter((item) => item.weapon);
  assert.ok(weapons.length >= 6, '至少要有三族各两件（原配 + 升级件）');
  weapons.forEach((item) => {
    const weapon = normalizeWeapon(item);
    assert.ok(weapon, `${item.id} 的 weapon 块必须能规范化`);
    assert.ok(weapon.family, `${item.id} 必须有 family`);
    assert.ok(weapon.attackRange > 0, `${item.id} 必须有攻击距离（判据之一）`);
    assert.ok(weapon.attackAnimation, `${item.id} 必须声明攻击动作（判据之一）`);
    assert.ok(weapon.damage > 0, `${item.id} 伤害必须为正`);
    assert.ok(weapon.maxDurability >= 1);
    assert.equal(item.kind, 'instance', '武器必须是实例物品（每把有自己的耐久）');
  });
  // 升级件都要有配方（原配武器不需要，它是"物化"出来的）
  weapons.forEach((item) => {
    if (item.weapon.defaultFor) return;
    assert.ok(RECIPES[item.id], `${item.id} 需要一条合成配方`);
  });
});

check('单位的武器家族来自定义（不靠名字字符串猜）', () => {
  ['swordsman', 'raider', 'archer'].forEach((type) => {
    const profile = unitWeaponProfile(type);
    assert.ok(profile, `${type} 应当有武器档位`);
    assert.ok(profile.family, `${type} 必须有 weapon.family`);
    assert.ok(profile.attackAnimation, `${type} 必须有攻击动作`);
  });
  // 木傀儡**现在有**武器档位了。它以前是 null（"傀儡不能装任何武器"），
  // 那一版没有可合成的傀儡武器，玩家开局还有 4 个护卫。
  // 现在开局没有战斗单位、傀儡是唯一部队，所以它必须能装自己的那一族武器，
  // 否则「合成武器 → 拖给傀儡 → 打得动刷怪点」这条链根本走不通。
  // 注意它仍然**只**能装 puppetArm 一族（见本文件后面的跨族断言）。
  const puppetProfile = unitWeaponProfile('woodPuppet');
  assert.ok(puppetProfile, '木傀儡必须有武器档位，否则一件武器也装不上');
  assert.equal(puppetProfile.family, 'puppetArm');
  assert.equal(puppetProfile.attackRange, UNIT_DEFINITIONS.woodPuppet.attackRange);
  assert.equal(puppetProfile.attackAnimation, UNIT_DEFINITIONS.woodPuppet.art.clips.attack);
  assert.equal(puppetProfile.projectileType, null, '傀儡是纯近战');
  assert.equal(unitWeaponProfile('nonexistent'), null);
  assert.equal(unitWeaponProfile(null), null);
});

check('同族且动作档位一致 → 可以装备', () => {
  const result = canEquipWeapon('steelSword', unitOf('swordsman'));
  assert.equal(result.ok, true, result.label);
  assert.equal(result.weapon.family, 'sword');
  const bow = canEquipWeapon('longBow', unitOf('archer'));
  assert.equal(bow.ok, true, bow.label);
  const club = canEquipWeapon('spikedClub', unitOf('raider'));
  assert.equal(club.ok, true, club.label);
});

check('跨家族一律拒绝（剑不能给弓手，弓不能给剑士）', () => {
  const bowOnSword = canEquipWeapon('longBow', unitOf('swordsman'));
  assert.equal(bowOnSword.ok, false);
  assert.equal(bowOnSword.reason, WEAPON_ERROR.familyMismatch);
  const swordOnArcher = canEquipWeapon('steelSword', unitOf('archer'));
  assert.equal(swordOnArcher.ok, false);
  assert.equal(swordOnArcher.reason, WEAPON_ERROR.familyMismatch);
  const clubOnSword = canEquipWeapon('spikedClub', unitOf('swordsman'));
  assert.equal(clubOnSword.reason, WEAPON_ERROR.familyMismatch);
});

/**
 * 临时往物品表里塞一件"违规武器"来跑**真实的判定分支**，跑完删掉。
 * 只断言"两个值不相等"是不够的——那证明不了 canEquipWeapon 会走到那个分支。
 */
function withFakeWeapon(itemId, profileOverrides, fn) {
  const baseline = ITEM_DEFINITIONS.steelSword;
  ITEM_DEFINITIONS[itemId] = {
    ...baseline,
    id: itemId,
    name: '测试武器',
    weapon: { ...baseline.weapon, profile: { ...baseline.weapon.profile, ...profileOverrides } }
  };
  try {
    fn();
  } finally {
    delete ITEM_DEFINITIONS[itemId];
  }
}

check('射程不一致被拒', () => {
  withFakeWeapon('test_sword_range', { attackRange: 4.5 }, () => {
    const result = canEquipWeapon('test_sword_range', unitOf('swordsman'));
    assert.equal(result.ok, false);
    assert.equal(result.reason, WEAPON_ERROR.rangeMismatch);
  });
});

check('攻击动作不一致被拒（只改模型不算通过）', () => {
  withFakeWeapon('test_sword_anim', { attackAnimation: 'Axe_Swing' }, () => {
    const result = canEquipWeapon('test_sword_anim', unitOf('swordsman'));
    assert.equal(result.ok, false);
    assert.equal(result.reason, WEAPON_ERROR.animationMismatch);
  });
});

check('投射方式不一致被拒', () => {
  withFakeWeapon('test_sword_proj', { projectileType: 'arrow' }, () => {
    const result = canEquipWeapon('test_sword_proj', unitOf('swordsman'));
    assert.equal(result.ok, false);
    assert.equal(result.reason, WEAPON_ERROR.projectileMismatch);
  });
});

check('四项判据的顺序：先看家族，再看射程/投射/动作', () => {
  withFakeWeapon('test_sword_multi', { attackRange: 9.9, attackAnimation: 'Axe_Swing' }, () => {
    // 家族对、其余多项不对时，报的是射程（判定顺序稳定，界面文案才可预测）
    const sameFamily = canEquipWeapon('test_sword_multi', unitOf('swordsman'));
    assert.equal(sameFamily.reason, WEAPON_ERROR.rangeMismatch);
    // 家族不对时直接报家族，不会先抱怨射程
    const otherFamily = canEquipWeapon('test_sword_multi', unitOf('archer'));
    assert.equal(otherFamily.reason, WEAPON_ERROR.familyMismatch);
  });
});

check('非法输入返回明确错误，不是静默通过', () => {
  assert.equal(canEquipWeapon('nonexistent', unitOf('swordsman')).reason, WEAPON_ERROR.unknownItem);
  assert.equal(canEquipWeapon('wood', unitOf('swordsman')).reason, WEAPON_ERROR.notAWeapon);
  assert.equal(canEquipWeapon('steelSword', unitOf('treePit')).reason, WEAPON_ERROR.notEquippable);
  assert.equal(canEquipWeapon(null, unitOf('swordsman')).reason, WEAPON_ERROR.unknownItem);
  assert.equal(weaponItem('wood'), null);
  assert.equal(isWeaponItem('wood'), false);
  assert.equal(isWeaponItem('steelSword'), true);
});

check('原配武器能物化回物品（换装不凭空少一把）', () => {
  assert.equal(baselineWeaponItemFor('sword'), 'wornSword');
  assert.equal(baselineWeaponItemFor('club'), 'wornClub');
  assert.equal(baselineWeaponItemFor('bow'), 'wornBow');
  assert.equal(baselineWeaponItemFor('nonexistent'), null);
  // 物化出来的必须是真物品，而且属于同一家族
  ['sword', 'club', 'bow'].forEach((family) => {
    const itemId = baselineWeaponItemFor(family);
    assert.ok(ITEM_DEFINITIONS[itemId], `${family} 的原配武器必须有物品定义`);
    assert.equal(ITEM_DEFINITIONS[itemId].weapon.family, family);
  });
});

check('属性变化只覆盖允许变的项：伤害/耐久/耐力/攻速，不含射程与动作', () => {
  const patch = weaponStatPatch('steelSword');
  assert.equal(patch.damage, 12);
  assert.equal(patch.damageType, 'physical');
  assert.equal(patch.maxDurability, 52);
  assert.ok(Number.isFinite(patch.attackRate));
  // 射程与动作不在补丁里——它们由兼容性决定，不该被武器改写
  assert.equal('attackRange' in patch, false);
  assert.equal('attackAnimation' in patch, false);
  assert.equal(weaponStatPatch('wood'), null);
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
