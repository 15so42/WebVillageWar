// 风法师飓风逻辑运行时仿真：验证生成、推进、每 0.4s 伤害 + 吸引、
// 到期移除、源单位死亡移除，以及两种专精（续航 / 冷却重置）。
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TEAMS, UNIT_DEFINITIONS } from '../src/data/gameData.js';
import { UNIT_SPECIAL_UPGRADES } from '../src/data/cardUpgrades.js';
import { AttackSystem } from '../src/systems/AttackSystem.js';
import { EffectsSystem } from '../src/systems/EffectsSystem.js';

const behavior = UNIT_DEFINITIONS.windMage.attackBehavior;
assert.equal(behavior.type, 'hurricane');

// ---- 数据契约 ----
assert.equal(behavior.duration, 6, '飓风默认持续 6 秒');
assert.equal(behavior.tickInterval, 0.4, '每 0.4 秒结算一次');
assert.equal(UNIT_DEFINITIONS.windMage.damage, 4, '魔法攻击力 4');
assert.equal(UNIT_DEFINITIONS.windMage.attackDamageType, 'magic');
assert.equal(UNIT_DEFINITIONS.windMage.attackRate, 1 / 7, '低攻速：每 7 秒一次');
assert.deepEqual(
  UNIT_SPECIAL_UPGRADES.windMage.map((u) => u.trait),
  ['hurricaneDuration', 'hurricaneCooldownReset'],
  '风法师专精：续航 + 冷却重置'
);

// ---- 桩化游戏世界 ----
function makeGame() {
  const damageCalls = [];
  const spawnedEffects = [];
  const clearedPaths = [];
  const game = {
    enemyUnits: [],
    friendlyUnits: [],
    groundHeightAt: () => 0,
    modifiers: {
      getAttackDamage: () => 4,
      getKnockbackResistance: () => 0
    },
    combat: {
      applyDamage(unit, damage, source, _armor, options) {
        damageCalls.push({ unit, damage, options });
      }
    },
    effects: {
      spawnHurricane(h) {
        spawnedEffects.push(h);
      }
    },
    pathfinding: {
      clear(unit) {
        clearedPaths.push(unit);
      }
    }
  };
  return { game, damageCalls, spawnedEffects, clearedPaths };
}

function makeWindMage(team, runtimeTraits = []) {
  return {
    type: 'windMage',
    team,
    alive: true,
    attackTimer: 0,
    position: new THREE.Vector3(0, 0, 0),
    mesh: { rotation: { y: 0 } },
    definition: UNIT_DEFINITIONS.windMage,
    runtimeTraits: new Set(runtimeTraits)
  };
}

function makeVictim(x, z) {
  return {
    type: 'militia',
    team: TEAMS.ENEMY,
    alive: true,
    position: new THREE.Vector3(x, 0, z),
    knockbackVelocity: new THREE.Vector3(0, 0, 0),
    definition: {},
    projectileHitHeight: 1.4
  };
}

// 以固定步长推进飓风更新，返回经历的 tick 次数（以 applyDamage 计）
function advance(attacks, seconds, dt = 0.05) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) attacks.updateHurricanes(dt);
}

// ---- 场景 1：生成与推进 ----
{
  const { game, spawnedEffects } = makeGame();
  const attacks = new AttackSystem(game);
  const mage = makeWindMage(TEAMS.PLAYER);
  const target = makeVictim(5, 0);
  game.enemyUnits.push(target);

  const hurricane = attacks.spawnHurricane(mage, target, behavior);
  assert.equal(hurricanes_len(attacks), 1, '生成后应存在 1 道飓风');
  assert.equal(spawnedEffects.length, 1, '特效应被触发一次');
  assert.ok(Math.abs(hurricane.direction.x - 1) < 1e-6, '方向应指向目标 (+x)');
  assert.ok(Math.abs(hurricane.start.x - behavior.startOffset) < 1e-6, '起点沿方向前移 startOffset');
  assert.equal(hurricane.duration, 6, '无专精时持续 6 秒');
  assert.equal(hurricane.speed, behavior.advanceSpeed);
  assert.equal(hurricane.radius, behavior.radius);
  assert.equal(hurricane.tickInterval, 0.4);

  // 推进 2 秒：位置应约为 start + speed*2
  advance(attacks, 2);
  const expected = behavior.startOffset + behavior.advanceSpeed * 2;
  assert.ok(
    Math.abs(hurricane.position.x - expected) < 0.1,
    `推进 2 秒后 x≈${expected}，实际 ${hurricane.position.x.toFixed(3)}`
  );
  assert.equal(hurricanes_len(attacks), 1, '2 秒后飓风仍存在');
}

// ---- 场景 2：每 0.4 秒伤害 + 魔法类型 + 吸引 ----
{
  const { game, damageCalls, clearedPaths } = makeGame();
  const attacks = new AttackSystem(game);
  const mage = makeWindMage(TEAMS.PLAYER);
  // 敌人放在飓风推进路径上，位于攻击者前方约 3 单位，处于半径 2.5 内
  const victim = makeVictim(3, 0.5);
  game.enemyUnits.push(victim);

  attacks.spawnHurricane(mage, victim, behavior);
  // 推进 1.0 秒，理论 tick 次数约为 1.0/0.4 ≈ 2~3 次
  advance(attacks, 1.0);
  assert.ok(damageCalls.length >= 2 && damageCalls.length <= 3, `约每 0.4 秒一次伤害，实际 ${damageCalls.length} 次`);
  assert.ok(
    damageCalls.every((c) => c.damage === 4),
    '每次伤害应为魔法攻击力 4'
  );
  assert.ok(
    damageCalls.every((c) => c.options.defenseDamageType === 'magic'),
    '伤害按魔法结算'
  );
  assert.ok(
    damageCalls.every((c) => c.options.isAttack === false && c.options.skipHitAnimation === true),
    '持续伤害不触发受击动画，避免高频抖动'
  );
  assert.ok(
    damageCalls.every((c) => c.options.skipHitEffect === undefined || c.options.skipHitEffect === false),
    '保留命中特效（附带攻击特效）'
  );
  // 吸引：敌人被朝中心拉拽 → 触发寻路清除
  assert.ok(clearedPaths.length >= 2, '吸引应清除受害者寻路');
  // 受害者偏向中心方向：飓风中心在受害者前进方向更远的一侧，拉拽后 x 分量应推动其向中心靠拢
  assert.ok(
    victim.knockbackVelocity.lengthSq() > 0,
    '受害者应获得指向中心的拉拽速度'
  );
}

// ---- 场景 3：到期自动移除 ----
{
  const { game } = makeGame();
  const attacks = new AttackSystem(game);
  const mage = makeWindMage(TEAMS.PLAYER);
  const victim = makeVictim(3, 0);
  game.enemyUnits.push(victim);
  attacks.spawnHurricane(mage, victim, behavior);
  advance(attacks, 6.5);
  assert.equal(hurricanes_len(attacks), 0, '超过 6 秒后飓风应被移除');
}

// ---- 场景 4：源单位死亡时移除 ----
{
  const { game } = makeGame();
  const attacks = new AttackSystem(game);
  const mage = makeWindMage(TEAMS.PLAYER);
  const victim = makeVictim(3, 0);
  game.enemyUnits.push(victim);
  attacks.spawnHurricane(mage, victim, behavior);
  advance(attacks, 1);
  mage.alive = false;
  attacks.updateHurricanes(0.05);
  assert.equal(hurricanes_len(attacks), 0, '风法师阵亡后其飓风应立即消失');
}

// ---- 场景 5：专精「飓风续航」→ 持续 6*1.4 = 8.4 秒 ----
{
  const { game } = makeGame();
  const attacks = new AttackSystem(game);
  const mage = makeWindMage(TEAMS.PLAYER, ['hurricaneDuration']);
  const victim = makeVictim(3, 0);
  game.enemyUnits.push(victim);
  const hurricane = attacks.spawnHurricane(mage, victim, behavior);
  assert.ok(Math.abs(hurricane.duration - 8.4) < 1e-6, '续航专精使持续时间 = 8.4 秒');
  advance(attacks, 6.5);
  assert.equal(hurricanes_len(attacks), 1, '6.5 秒时（无专精会消失）仍在持续');
  advance(attacks, 2.2);
  assert.equal(hurricanes_len(attacks), 0, '8.4 秒后移除');
}

// ---- 场景 6：专精「冷却重置」→ 造成伤害时命中概率重置 attackTimer ----
{
  const { game } = makeGame();
  const attacks = new AttackSystem(game);
  const mage = makeWindMage(TEAMS.PLAYER, ['hurricaneCooldownReset']);
  const victim = makeVictim(3, 0);
  game.enemyUnits.push(victim);
  mage.attackTimer = 5; // 模拟刚攻击后进入冷却
  const originalRandom = Math.random;
  Math.random = () => 0.0; // 强制命中 3% 概率
  try {
    attacks.spawnHurricane(mage, victim, behavior);
    advance(attacks, 0.5); // 至少一次 tick 造成伤害
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(mage.attackTimer, 0, '冷却重置专精命中时应将攻击冷却归零');
}

// ---- 场景 7：无冷却重置专精时不应归零 ----
{
  const { game } = makeGame();
  const attacks = new AttackSystem(game);
  const mage = makeWindMage(TEAMS.PLAYER); // 无专精
  const victim = makeVictim(3, 0);
  game.enemyUnits.push(victim);
  mage.attackTimer = 5;
  const originalRandom = Math.random;
  Math.random = () => 0.0;
  try {
    attacks.spawnHurricane(mage, victim, behavior);
    advance(attacks, 0.5);
  } finally {
    Math.random = originalRandom;
  }
  assert.notEqual(mage.attackTimer, 0, '未持有专精时不应重置冷却');
}

// ---- 场景 8：飓风龙卷特效（四层构成 + 确定性推进 + 到期回收）----
{
  const scene = new THREE.Scene();
  const fx = new EffectsSystem(scene);
  const spawned = fx.spawnHurricane({
    start: new THREE.Vector3(0, 0, 0),
    direction: new THREE.Vector3(1, 0, 0),
    speed: behavior.advanceSpeed,
    radius: behavior.radius,
    duration: behavior.duration,
    tickInterval: behavior.tickInterval,
    color: behavior.color,
    accent: behavior.accent
  });
  assert.equal(spawned, true, 'spawnHurricane 应成功加入特效');
  assert.equal(fx.effects.length, 1, '应生成 1 个特效对象');
  const group = fx.effects[0].object;
  assert.equal(group.userData.preserveRenderLayers, true, '飓风为主世界 layer 0 特效，不置顶');
  const sprites = group.children.filter((c) => c.isSprite);
  const debris = group.children.filter((c) => c.geometry?.type === 'TetrahedronGeometry');
  const rings = group.children.filter((c) => c.geometry?.type === 'RingGeometry' || c.geometry?.type === 'CircleGeometry');
  assert.equal(sprites.length, 16, '软边粒子龙卷柱：16 个螺旋上升粒子');
  assert.equal(debris.length, 8, '低多边形碎石碎片：8 块');
  assert.equal(rings.length, 5, '1 个地面范围环 + 4 个 tick 脉冲环');
  // 粒子均使用软边材质且初始透明（出现/消失有透明度变化，非硬边纯色块）
  assert.ok(
    sprites.every((s) => s.material.transparent === true && s.material.opacity <= 1),
    '软边粒子必须透明，不能是硬边纯色几何体'
  );
  // 确定性推进：与逻辑位置公式 start + direction*speed*age 一致（start=0，speed=1.5，2s → x=3）
  fx.update(2.0);
  const expectedEffectX = behavior.advanceSpeed * 2;
  assert.ok(
    Math.abs(group.position.x - expectedEffectX) < 0.1,
    `特效推进 2 秒后 x≈${expectedEffectX}，实际 ${group.position.x.toFixed(3)}`
  );
  assert.equal(group.position.y, 0, '特效沿起点高度常量推进，避免与逻辑 y 抖动不一致');
  // 到期回收
  fx.update(4.6);
  assert.equal(fx.effects.length, 0, '超过持续时间后特效应被回收');
  fx.destroy();
}

function hurricanes_len(attacks) {
  return attacks.hurricanes.length;
}

console.log('wind mage hurricane checks passed');
