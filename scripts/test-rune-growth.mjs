// 附魔石永久成长回归测试。
// 逐条对应计划文档第 8.2 节给出的六条验收例，外加均分与非单位击杀两条已确认规则。
import assert from 'node:assert/strict';
import {
  addGrowth,
  applyGrowthSnapshot,
  dropStonesOnDeath,
  growthModifierSource,
  growthModifiersFor,
  growthOf,
  normalizeGrowth,
  serializeGrowth,
  splitGrowth,
  unitHealthCap
} from '../src/systems/runeGrowth.js';

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

function makeStone(id) {
  return normalizeGrowth({ id, enchantmentId: 'triumph' });
}

check('8.2-1/2：石头带 40 点成长，装在基础上限 100 的 A 身上 → A 上限 140', () => {
  const stone = makeStone('S');
  addGrowth(stone, 40);
  assert.equal(growthOf(stone), 40);
  assert.equal(unitHealthCap(100, [stone]), 140);
});

check('8.2-3：石头转给基础上限 200 的 B → A 恢复 100，B 变 240，石头累计仍是 40', () => {
  const stone = makeStone('S');
  addGrowth(stone, 40);
  // 转移只是换了持有者，石头本身不变
  const aStones = [];
  const bStones = [stone];
  assert.equal(unitHealthCap(100, aStones), 100, 'A 必须恢复基础值');
  assert.equal(unitHealthCap(200, bStones), 240);
  assert.equal(growthOf(stone), 40, '成长必须留在石头里');
});

check('8.2-4：B 再触发一次成长，只更新石头的累计值', () => {
  const stone = makeStone('S');
  addGrowth(stone, 40);
  splitGrowth([stone], 20);
  assert.equal(growthOf(stone), 60);
  // 换个人拿，享受的是最新值
  assert.equal(unitHealthCap(200, [stone]), 260);
  assert.equal(unitHealthCap(100, [stone]), 160);
});

check('8.2-5：B 死亡石头落地，拾回后等级、累计值、身份都不变', () => {
  const stone = makeStone('S');
  stone.level = 3;
  stone.experience = 120;
  addGrowth(stone, 55);
  const dropped = dropStonesOnDeath([stone]);
  assert.equal(dropped.length, 1);
  const picked = dropped[0];
  assert.equal(picked.id, 'S');
  assert.equal(picked.level, 3);
  assert.equal(picked.experience, 120);
  assert.equal(growthOf(picked), 55, '死亡掉落不得重置成长');
  assert.equal(unitHealthCap(200, [picked]), 255, '新持有者直接享受已有成长');
});

check('8.2-6：两块同名石头的成长互不污染', () => {
  const s = makeStone('S');
  const t = makeStone('T');
  addGrowth(s, 40);
  addGrowth(t, 15);
  assert.equal(growthOf(s), 40);
  assert.equal(growthOf(t), 15);
  // 不能按附魔类型共用累计字段：两块都叫 triumph，但值必须各自独立
  assert.equal(s.enchantmentId, t.enchantmentId);
  assert.notEqual(growthOf(s), growthOf(t));
  assert.equal(unitHealthCap(100, [s, t]), 155);
});

check('取下其中一块只移除它自己的贡献', () => {
  const s = makeStone('S');
  const t = makeStone('T');
  addGrowth(s, 40);
  addGrowth(t, 15);
  // 只带走 S
  const remaining = [t];
  assert.equal(unitHealthCap(100, remaining), 115, '不应影响另一块石头');
  assert.equal(growthOf(s), 40, '被取下的石头成长不重置');
});

check('杀掉多个目标时成长在参与成长的石头之间均分', () => {
  const s = makeStone('S');
  const t = makeStone('T');
  const granted = splitGrowth([s, t], 30);
  assert.equal(granted.length, 2);
  assert.equal(growthOf(s), 15);
  assert.equal(growthOf(t), 15);
  assert.equal(granted.reduce((sum, entry) => sum + entry.granted, 0), 30, '总量必须守恒');
});

check('法术等非单位击杀不产生成长资源', () => {
  const s = makeStone('S');
  const result = splitGrowth([s], 50, { source: 'spell' });
  assert.deepEqual(result, []);
  assert.equal(growthOf(s), 0, '非单位击杀不得凭空长出成长');
});

check('没有石头时击杀也不产生任何东西', () => {
  assert.deepEqual(splitGrowth([], 40), []);
  assert.deepEqual(splitGrowth(null, 40), []);
});

check('成长字段缺失或非法时按 0 处理，不会算出 NaN', () => {
  const stone = { id: 'S', growth: { triumphHealthBonus: 'oops' } };
  assert.equal(growthOf(stone), 0);
  assert.equal(unitHealthCap(100, [stone]), 100);
  assert.equal(unitHealthCap(100, [null, undefined]), 100);
  assert.equal(unitHealthCap(undefined, []), 0);
});

check('序列化往返保持成长值', () => {
  const stone = makeStone('S');
  addGrowth(stone, 33);
  const snapshot = JSON.parse(JSON.stringify(serializeGrowth(stone)));
  const restored = makeStone('S');
  applyGrowthSnapshot(restored, snapshot);
  assert.equal(growthOf(restored), 33);
});

// ---- 属性层投影：修改器来源必须按石头实例区分 ----

check('属性修改器来源按石头实例区分，同名石头不会互相覆盖', () => {
  const s = makeStone('S');
  const t = makeStone('T');
  addGrowth(s, 40);
  addGrowth(t, 12);
  const modifiers = growthModifiersFor([s, t]);
  assert.equal(modifiers.size, 2, '两块石头必须产生两条来源，不能按附魔名合并成一条');
  assert.deepEqual([...modifiers.keys()].sort(), [
    growthModifierSource('S'),
    growthModifierSource('T')
  ]);
  assert.equal(modifiers.get(growthModifierSource('S')).amount, 40);
  assert.equal(modifiers.get(growthModifierSource('T')).amount, 12);
  assert.equal(modifiers.get(growthModifierSource('S')).stat, 'maxHealth');
});

check('成长值为 0 的石头不产生修改器（避免无意义的 amount:0 来源）', () => {
  const zero = makeStone('Z');
  const grown = makeStone('S');
  addGrowth(grown, 7);
  const modifiers = growthModifiersFor([zero, grown, null, undefined]);
  assert.equal(modifiers.size, 1);
  assert.equal(modifiers.has(growthModifierSource('Z')), false);
});

check('修改器集合随石头成长值变化而整体替换，不叠加成两份', () => {
  const s = makeStone('S');
  addGrowth(s, 10);
  assert.equal(growthModifiersFor([s]).get(growthModifierSource('S')).amount, 10);
  addGrowth(s, 5);
  const after = growthModifiersFor([s]);
  assert.equal(after.size, 1, '同一块石头只有一条来源');
  assert.equal(after.get(growthModifierSource('S')).amount, 15);
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
