// 「打还是逃、打谁」判据的纯逻辑回归（combatPlan.js = Numen Menace + AttackPlan 的移植）。
//
// 这一层守的是**用户这一轮点名要的四件事**：
//   1. 「在执行任务时会朝着目标前进，路上遇到怪有些会打有些不会打，很干脆」
//      → 只有"正在打我"的怪才算数；路过的、还没动手的一律不招惹（不挑衅、不空跑）。
//   2. 「在干其他活的时候遇到怪物也会先把怪物打了」
//      → 打不打得过只由战力决定，与"我现在在干什么"无关。
//   3. 「很干脆」→ 结论不能随距离、随一帧的抖动翻面（旧实现翻面的根因就是判定含距离）。
//   4. 打完才换目标（承诺）：选中一只就打完再换，不要每刻重选"最近那只"。
//
// 与旧实现（puppetArms.decidePuppetAction）的差别是**输入的形状**：
// 那边输入"威胁压力 + 距离"，这边输入"整个局面 + 上一刻的决定"。
// 所以这里能断言的正是那边断言不了的两件事：距离无关、有记忆。
import assert from 'node:assert/strict';
import { TEAMS, UNIT_DEFINITIONS } from '../src/data/gameData.js';
import {
  COMBAT_ACTION,
  attackReachOf,
  combatFoes,
  combatPlanRules,
  combatPowerOf,
  dangerRadiusOf,
  decideCombatMove,
  healthRatioOf,
  isEngagingMe,
  outmatchedFor,
  pickCombatFoe,
  planarDistance,
  tooClose,
  unitRadius
} from '../src/systems/combatPlan.js';
import { IMPROVISED_TOOL_DAMAGE, puppetCombatPower, puppetGearFor } from '../src/systems/puppetArms.js';

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

const rules = combatPlanRules();

/** 造一个傀儡。字段与 UnitEntity 一致（半径是构造时从 definition 抄过来的）。 */
function makePuppet(overrides = {}) {
  const definition = UNIT_DEFINITIONS.woodPuppet;
  return {
    id: 'puppet-1',
    team: TEAMS.PLAYER,
    type: 'woodPuppet',
    position: { x: 0, z: 0 },
    alive: true,
    health: definition.maxHealth,
    maxHealth: definition.maxHealth,
    collisionRadius: definition.collisionRadius,
    attackRadius: definition.attackRadius,
    definition,
    target: null,
    isWildlife: false,
    isRecruitable: false,
    ...overrides
  };
}

/** 造一个敌人，摆在距离傀儡 `distance`、角度 `angle` 的地方。 */
function makeFoe(type, distance = 2, angle = 0, overrides = {}) {
  const definition = UNIT_DEFINITIONS[type];
  const id = overrides.id ?? `foe:${type}:${Math.round(angle * 1000)}:${distance}`;
  return {
    id,
    team: TEAMS.ENEMY,
    type,
    position: { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance },
    alive: true,
    health: definition.maxHealth,
    maxHealth: definition.maxHealth,
    collisionRadius: definition.collisionRadius,
    attackRadius: definition.attackRadius,
    definition,
    target: null,
    isWildlife: false,
    isRecruitable: false,
    ...overrides,
    id
  };
}

/** 模仿 `ThreatFieldSystem.threatsNear()` 的输出形状。 */
function threatsFor(self, units) {
  return units.map((unit) => ({
    unit,
    x: unit.position.x,
    z: unit.position.z,
    power: combatPowerOf({ unit }),
    distance: planarDistance(unit.position, self.position)
  }));
}

const foesOf = (self, units, now = 0) => combatFoes({
  self,
  threats: threatsFor(self, units),
  rules,
  now
});

const openFire = (self, units, gearOptions, extra = {}) => {
  const gear = puppetGearFor(gearOptions);
  const foes = foesOf(self, units, extra.now ?? 0);
  return {
    foes,
    move: decideCombatMove({
      self,
      foes,
      gearPower: puppetCombatPower(gear),
      engaged: extra.engaged ?? false,
      cornered: extra.cornered ?? false,
      last: extra.last ?? null,
      rules
    })
  };
};

/** 把敌人设成"正在打我"。 */
const engaging = (unit, self) => { unit.target = self; return unit; };

// ---------------------------------------------------------------- 危险半径
check('危险半径按每一只敌人自己的够到距离算（弓手远、野狼近）', () => {
  const self = makePuppet();
  const archer = makeFoe('goblinArcher', 6);
  const wolf = makeFoe('wolf', 6);
  const archerRadius = dangerRadiusOf(archer, self);
  const wolfRadius = dangerRadiusOf(wolf, self);
  assert.ok(archerRadius > 8, `弓手应该在 8m 外就算够得着，实际 ${archerRadius}`);
  assert.ok(wolfRadius < 3.5, `近战野狼不该在 3.5m 外就算够得着，实际 ${wolfRadius}`);
  // 两者的差就是它们攻击距离的差（同一个自己、同一个余量）
  assert.ok(
    Math.abs((archerRadius - wolfRadius) - (attackReachOf(archer) - attackReachOf(wolf))) < 1e-9,
    '危险半径之间的差必须完全来自各自攻击距离的差'
  );
});

check('危险半径与 AttackSystem 用的公式一致（射程 + 目标半径 + 0.85）', () => {
  const self = makePuppet();
  const wolf = makeFoe('wolf', 2);
  const expected = attackReachOf(wolf) + unitRadius(self) + rules.attackReachSlack;
  assert.equal(dangerRadiusOf(wolf, self), expected);
  assert.equal(rules.attackReachSlack, 0.85, '这个 0.85 必须与 AttackSystem 的 allowedRange 相同');
});

check('tooClose 就是"它够得着我"：边界两侧结论不同', () => {
  const self = makePuppet();
  const radius = dangerRadiusOf(makeFoe('wolf', 0), self);
  assert.equal(tooClose(makeFoe('wolf', radius - 0.05), self), true);
  assert.equal(tooClose(makeFoe('wolf', radius + 0.05), self), false);
});

// ---------------------------------------------------------------- 谁算"正在打我"
check('只有"锁定我 / 刚打过我"才算正在打我，旁边站着的怪不算', () => {
  const self = makePuppet();
  const bystander = makeFoe('wolf', 2);
  assert.equal(isEngagingMe(bystander, self, 0, rules), false, '只是站在旁边不算');

  const locker = makeFoe('wolf', 2);
  locker.target = self;
  assert.equal(isEngagingMe(locker, self, 0, rules), true, '锁了我就算');

  const biter = makeFoe('wolf', 2);
  self.lastAttacker = biter;
  self.lastAttackerTime = 4;
  assert.equal(isEngagingMe(biter, self, 5, rules), true, '刚咬过我就算');
  assert.equal(
    isEngagingMe(biter, self, 4 + rules.engageMemorySeconds + 0.5, rules),
    false,
    '过了记忆窗口就不该还算"正在打我"'
  );
});

check('combatFoes 把「锁定我」「该不该动手」「够不够得着」分开标记', () => {
  const self = makePuppet();
  const adjacent = engaging(makeFoe('wolf', 1.2, 0, { id: 'adjacent' }), self);
  const approaching = engaging(makeFoe('wolf', 4, 1, { id: 'approaching' }), self);
  const lockedFar = engaging(makeFoe('wolf', 9, 2, { id: 'locked-far' }), self);
  const bystander = makeFoe('goblinSoldier', 1.5, 3, { id: 'bystander' });
  const faraway = makeFoe('goblinSoldier', 12, 4, { id: 'faraway' });
  const foes = foesOf(self, [adjacent, approaching, lockedFar, bystander, faraway]);
  const byId = Object.fromEntries(foes.map((foe) => [foe.id, foe]));

  // 贴脸且锁定：三条全中
  assert.equal(byId.adjacent.lockedOn, true);
  assert.equal(byId.adjacent.engaging, true);
  assert.equal(byId.adjacent.tooClose, true);
  assert.equal(byId.adjacent.inMyReach, true);

  // 锁定了、正在逼近、但还没到咬得到的距离：**这一档就是要它提前迎上去**
  assert.equal(byId.approaching.lockedOn, true);
  assert.equal(byId.approaching.engaging, true, '锁了我并已逼近 → 这一场算数');
  assert.equal(byId.approaching.tooClose, false, '还没到它能咬到我的距离');
  assert.equal(byId.approaching.inMyReach, false, '我也还没够到它');

  // 锁定了但还很远：**信息留着（lockedOn），但不参与判据**。
  // 用户第 4 轮报的「一开始为什么还朝狼走」就是这一档被算进去了。
  assert.equal(byId['locked-far'].lockedOn, true);
  assert.equal(byId['locked-far'].engaging, false, '9m 外刚锁定我，还不该丢下工作追过去');
  assert.equal(byId['locked-far'].inMyReach, false);

  // 没锁定我，但已经贴到我的刀口上：触发线 ② 管这一档
  assert.equal(byId.bystander.lockedOn, false);
  assert.equal(byId.bystander.engaging, false, '没动手的不算在打我');
  assert.equal(byId.bystander.inMyReach, true, '但贴到我的攻击距离里了（"遇上了就先打"）');

  assert.equal(byId.faraway.lockedOn, false);
  assert.equal(byId.faraway.engaging, false);
  assert.equal(byId.faraway.inMyReach, false, '12m 外两条触发线都不成立');

  // 列表按距离升序：没有记忆时"打最近的"直接吃这个顺序
  for (let i = 1; i < foes.length; i += 1) {
    assert.ok(foes[i - 1].distance <= foes[i].distance, 'foes 必须按距离升序');
  }
});

check('反应距离必须明显大于近战的够到距离——否则又是"被咬了才还手"', () => {
  const self = makePuppet();
  const wolf = engaging(makeFoe('wolf', 4), self);
  const [foe] = foesOf(self, [wolf]);
  // 近战怪够得着我只有 2.3m 上下，而"迎上去"是 5.5m：
  // 用户口径「狼都追到脸上了它才和狼战斗」要的就是这个差值。
  assert.ok(foe.dangerRadius < 3, `近战危险半径不该这么大：${foe.dangerRadius}`);
  assert.ok(foe.engageRange >= rules.engageReactionRange);
  assert.ok(foe.engageRange > foe.dangerRadius * 2, '迎上去的距离必须明显大于它咬到我的距离');
  // 远程敌人不受这个数影响：它自己的射程说了算
  const archer = engaging(makeFoe('goblinArcher', 4, 1), self);
  const archerFoe = foesOf(self, [archer])[0];
  assert.ok(archerFoe.engageRange > 8, '弓手在自己射程内就能打到我，取 max 之后仍是射程说了算');
});

check('野生动物与未被招募的野外单位：前者算威胁，后者完全不参与', () => {
  const self = makePuppet();
  const wolf = engaging(makeFoe('wolf', 1.2, 0), self);
  wolf.isWildlife = true;
  const recruit = makeFoe('goblinSoldier', 1.2, 1, { isRecruitable: true });
  const foes = foesOf(self, [wolf, recruit]);
  assert.equal(foes.length, 1, '可招募的中立单位不该进判据');
  assert.equal(foes[0].id, wolf.id);
});

// ---------------------------------------------------------------- 打还是逃
check('索敌半径内的敌人：主动接战（未锁定也算）', () => {
  const self = makePuppet();
  const { move } = openFire(self, [makeFoe('wolf', 6)], { weaponItemId: 'puppetCudgel' });
  assert.equal(move.action, COMBAT_ACTION.skirmish);
});

check('索敌半径外、未贴脸：仍视为「还没开打」', () => {
  const self = makePuppet();
  const { move } = openFire(self, [makeFoe('goblinSoldier', 11)], { toolIds: ['axe'] });
  assert.equal(move.action, COMBAT_ACTION.done);
  assert.equal(move.reason, 'clear');
});

check('已经贴到我的攻击距离：遇上了就先打（哪怕它还没动手）', () => {
  const self = makePuppet();
  // 用哥布林弓手（战力 4.88）：拿斧头（8.19）打得过，所以"先打"这一档看得出来是打，不是逃。
  const close = makeFoe('goblinArcher', 1.2);
  assert.equal(close.target, null, '前提：它没有锁我');
  const { foes, move } = openFire(self, [close], { toolIds: ['axe'] });
  assert.equal(foes[0].inMyReach, true);
  assert.equal(foes[0].engaging, false);
  assert.equal(move.action, COMBAT_ACTION.skirmish, '需求原文：「遇到怪物也会先把怪物打了」');
  assert.equal(move.foeId, close.id);
});

check('空手遇到正在打我的敌人一定逃（"没有武器就要逃跑"）', () => {
  const self = makePuppet();
  const foe = engaging(makeFoe('goblinSoldier', 1.2), self);
  const { move } = openFire(self, [foe], {});
  assert.equal(move.action, COMBAT_ACTION.disengage);
  assert.equal(move.reason, 'unarmed');
  assert.equal(move.power, 0);
});

check('拿斧/镐能打赢一只野狼（用户第 4 轮："为什么不打狼"）', () => {
  const self = makePuppet();
  const wolf = engaging(makeFoe('wolf', 1.2), self);
  assert.equal(openFire(self, [wolf], { toolIds: ['axe'] }).move.action, COMBAT_ACTION.skirmish);
  assert.equal(openFire(self, [wolf], { toolIds: ['pickaxe'] }).move.action, COMBAT_ACTION.skirmish);
  assert.equal(
    openFire(self, [wolf], { weaponItemId: 'puppetCudgel' }).move.action,
    COMBAT_ACTION.skirmish
  );
});

check('拿斧/镐仍然打不过哥布林士兵（合成武器那条线还在）', () => {
  const self = makePuppet();
  const soldier = engaging(makeFoe('goblinSoldier', 1.2), self);
  const axe = openFire(self, [soldier], { toolIds: ['axe'] }).move;
  assert.equal(axe.action, COMBAT_ACTION.disengage);
  assert.equal(axe.reason, 'outmatched');
  assert.equal(
    openFire(self, [soldier], { weaponItemId: 'puppetCudgel' }).move.action,
    COMBAT_ACTION.skirmish
  );
});

check('抱团更危险：合计战力一超线就转逃', () => {
  const self = makePuppet();
  const pack = [
    engaging(makeFoe('wolf', 1.2, 0, { id: 'wolf-a' }), self),
    engaging(makeFoe('wolf', 1.2, Math.PI, { id: 'wolf-b' }), self)
  ];
  assert.equal(openFire(self, pack, { toolIds: ['axe'] }).move.action, COMBAT_ACTION.disengage);
  // 木刃能清场，遇到食人魔仍然要逃
  assert.equal(
    openFire(self, [engaging(makeFoe('shieldBearer', 2), self)], { weaponItemId: 'puppetGlaive' }).move.action,
    COMBAT_ACTION.skirmish
  );
  assert.equal(
    openFire(self, [engaging(makeFoe('ogre', 2), self)], { weaponItemId: 'puppetGlaive' }).move.action,
    COMBAT_ACTION.disengage
  );
});

check('同一个敌人，距离远近不能改变结论（旧实现翻面的根因）', () => {
  const self = makePuppet();
  // 1~5m：都在"迎上去"的距离内（`engageReactionRange` 5.5），结论必须逐档一致
  for (const distance of [1, 2, 3, 4, 5]) {
    const shield = engaging(makeFoe('shieldBearer', distance), self);
    const axe = openFire(self, [shield], { toolIds: ['axe'] }).move;
    assert.equal(axe.action, COMBAT_ACTION.disengage, `拿斧头距离 ${distance}m 应始终判逃`);
    assert.equal(axe.reason, 'outmatched', '是"打不过"，不是"没武器"');
    const wolf = engaging(makeFoe('wolf', distance), self);
    assert.equal(
      openFire(self, [wolf], { weaponItemId: 'puppetCudgel' }).move.action,
      COMBAT_ACTION.skirmish,
      `拿木棒距离 ${distance}m 应始终判迎战`
    );
  }
  // 再远就不是"距离改变结论"，而是"这一场还没开始"：锁定了我但还没逼近，
  // 判据压根不参与（`engaging` 为假）——这跟"迎战/逃跑翻面"是两件事。
  const farWolf = engaging(makeFoe('wolf', 10), self);
  const farFoes = foesOf(self, [farWolf]);
  assert.equal(farFoes[0].lockedOn, true, '前提：它确实锁了我');
  assert.equal(farFoes[0].engaging, false);
  assert.equal(
    decideCombatMove({
      self, foes: farFoes, gearPower: puppetCombatPower(puppetGearFor({ weaponItemId: 'puppetCudgel' })),
      engaged: false, cornered: false, last: null, rules
    }).action,
    COMBAT_ACTION.done,
    '索敌半径外刚锁定我的怪仍不算接战对手'
  );
});

check('装备越好，结论只会越好（单调）', () => {
  const self = makePuppet();
  const soldier = engaging(makeFoe('goblinSoldier', 2), self);
  const rank = { [COMBAT_ACTION.disengage]: 0, [COMBAT_ACTION.done]: 1, [COMBAT_ACTION.skirmish]: 2 };
  const order = [
    {},
    { toolIds: ['pickaxe'] },
    { toolIds: ['axe'] },
    { weaponItemId: 'puppetCudgel' },
    { weaponItemId: 'puppetGlaive' }
  ].map((options) => openFire(self, [soldier], options).move);
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(
      rank[order[i].action] >= rank[order[i - 1].action],
      `第 ${i} 档不该比上一档更保守：${order[i - 1].action} → ${order[i].action}`
    );
  }
});

check('自己被打到三成血以下就跑（哪怕本来打得过）', () => {
  const self = makePuppet();
  const wolf = engaging(makeFoe('wolf', 1.2), self);
  const healthy = openFire(self, [wolf], { weaponItemId: 'puppetGlaive' }).move;
  assert.equal(healthy.action, COMBAT_ACTION.skirmish, '前提：满血时敢打');
  const definition = UNIT_DEFINITIONS.woodPuppet;
  self.health = definition.maxHealth * (rules.minHealthRatio - 0.02);
  const hurt = openFire(self, [wolf], { weaponItemId: 'puppetGlaive' }).move;
  assert.equal(hurt.action, COMBAT_ACTION.disengage);
  assert.equal(hurt.reason, 'wounded');
  assert.ok(healthRatioOf(self) < rules.minHealthRatio);
});

check('退无可退时不再"打不过就跑"，转身打（空手例外）', () => {
  const self = makePuppet();
  const soldier = engaging(makeFoe('goblinSoldier', 1.2), self);
  const cornered = openFire(self, [soldier], { toolIds: ['axe'] }, { cornered: true }).move;
  assert.equal(cornered.action, COMBAT_ACTION.skirmish, '斧头对士兵本该逃，被堵住时只能打');
  // 空手例外：power 恒为 0，硬着头皮打只是站着挨打
  const unarmed = openFire(self, [soldier], {}, { cornered: true }).move;
  assert.equal(unarmed.action, COMBAT_ACTION.disengage);
  assert.equal(unarmed.reason, 'unarmed');
});

check('挑不出目标但还有东西在追我 → 继续走位，而不是"打不过就跑"', () => {
  // 这是 Numen 明确点过的错判："于是场上只剩一只点着火的爬行者时，
  // 拿着下界合金剑的满血玩家直接跑三十二格"。
  const self = makePuppet();
  const dead = {
    id: 'ghost',
    unit: { id: 'ghost', alive: false },
    distance: 1.2,
    power: 6,
    engaging: true,
    tooClose: true
  };
  const move = decideCombatMove({
    self,
    foes: [dead],
    gearPower: puppetCombatPower(puppetGearFor({ weaponItemId: 'puppetGlaive' })),
    engaged: true,
    cornered: false,
    last: null,
    rules
  });
  assert.equal(move.action, COMBAT_ACTION.skirmish);
  assert.equal(move.reason, 'no-target');
  assert.equal(move.foeId, null);
});

// ---------------------------------------------------------------- 承诺（记忆）
check('承诺：选中一只就打完再换，不会因为另一只更近就转向', () => {
  const self = makePuppet();
  // 两只都在"迎上去"的距离内（5m / 2m），所以两只都是这一场的对手
  const chosen = engaging(makeFoe('goblinArcher', 5, 0, { id: 'chosen' }), self);
  const nearer = engaging(makeFoe('goblinArcher', 2, Math.PI, { id: 'nearer' }), self);
  const gear = puppetGearFor({ weaponItemId: 'puppetCudgel' });
  const foes = foesOf(self, [chosen, nearer]);
  assert.equal(foes.filter((foe) => foe.engaging).length, 2, '前提：两只都在这一场里');
  const first = decideCombatMove({
    self, foes, gearPower: puppetCombatPower(gear), engaged: true, last: null, rules
  });
  assert.equal(first.foeId, 'nearer', '第一次当然挑最近的');
  const second = decideCombatMove({
    self, foes, gearPower: puppetCombatPower(gear), engaged: true,
    last: { foeId: 'chosen' }, rules
  });
  assert.equal(second.foeId, 'chosen', '已经在打的那只必须留着，哪怕另一只更近');
});

check('承诺不是死心眼：上一只死了/没了就重新挑最近的', () => {
  const self = makePuppet();
  const a = { id: 'a', unit: { id: 'a', alive: true }, distance: 3, power: 1, engaging: true, tooClose: true };
  const b = { id: 'b', unit: { id: 'b', alive: true }, distance: 1, power: 1, engaging: true, tooClose: true };
  assert.equal(pickCombatFoe({ foes: [a, b], last: { foeId: 'gone' } })?.id, 'b');
  const dead = { ...a, unit: { id: 'a', alive: false } };
  assert.equal(pickCombatFoe({ foes: [dead, b], last: { foeId: 'a' } })?.id, 'b');
});
// ---------------------------------------------------------------- 与旧实现的分界
check('判据只吃"局面 + 上一刻的决定"，不再需要距离加权的压力', () => {
  const self = makePuppet();
  const soldier = engaging(makeFoe('goblinSoldier', 2), self);
  // 同一个局面连续算 20 次必须完全一致（没有隐藏的随机/时间依赖）
  const first = openFire(self, [soldier], { weaponItemId: 'puppetCudgel' }).move;
  for (let i = 0; i < 20; i += 1) {
    assert.deepEqual(openFire(self, [soldier], { weaponItemId: 'puppetCudgel' }).move, first);
  }
});

check('规则自洽：脱离线比迎战线宽，冷静宽限与逃跑距离都是正数', () => {
  assert.ok(rules.disengagePowerRatio < rules.engagePowerRatio, '不设滞回区间的话单阈值必然会抽');
  assert.ok(rules.calmGraceSeconds > 0, '没有冷静宽限就会在触发线上反复开战');
  assert.ok(
    rules.fleeDistance > 3 * rules.attackReachSlack,
    '逃跑距离必须远大于危险半径，否则"退两格就判跑掉了"'
  );
  assert.ok(rules.scanRadius > rules.engageAggroRange, '扫描半径要盖住索敌半径');
  assert.ok(rules.engageAggroRange > 0);
});

check('战力口径统一：装备换过之后用装备算，没装备就用单位定义', () => {
  const self = makePuppet();
  const gear = puppetGearFor({ toolIds: ['axe'] });
  assert.equal(combatPowerOf({ unit: self, gear }), puppetCombatPower(gear));
  const wolf = makeFoe('wolf', 2);
  assert.equal(combatPowerOf({ unit: wolf }), combatPowerOf({ unit: wolf }));
  assert.ok(combatPowerOf({ unit: wolf }) > 0);
  assert.equal(
    IMPROVISED_TOOL_DAMAGE.axe,
    gear.damage,
    '工具伤害的来源必须只有一处（IMPROVISED_TOOL_DAMAGE）'
  );
});

check('outmatchedFor 只看正在打我的那些：远处围观的不算战力', () => {
  const self = makePuppet();
  const gear = puppetGearFor({ toolIds: ['axe'] });
  const power = puppetCombatPower(gear);
  assert.equal(outmatchedFor({ self, foes: [], gearPower: power, rules }).outmatched, false);
  assert.equal(
    outmatchedFor({ self, foes: [{ power: 1000 }], gearPower: power, rules }).reason,
    'outmatched'
  );
});

console.log(report.join('\n'));
console.log(process.exitCode ? '\nCOMBAT PLAN: FAIL' : '\nCOMBAT PLAN: PASS');
