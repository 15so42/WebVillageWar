import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BALANCE } from '../src/data/gameData.js';
import {
  consumeBaseHealthLossMilestones,
  resolvePlayerBaseDamage,
  resolveStructureDamage
} from '../src/systems/playerBaseRules.js';

assert.equal(resolvePlayerBaseDamage(999, { isAttack: true, attackDamage: 1 }), 1);
assert.equal(resolvePlayerBaseDamage(0, { isAttack: true, attackDamage: 1 }), 1);
assert.equal(resolvePlayerBaseDamage(10, { isAttack: false, attackDamage: 1 }), 10);

assert.equal(resolveStructureDamage(999, { isAttack: true, attackDamage: 1 }), 1);
assert.equal(resolveStructureDamage(0, { isAttack: true, attackDamage: 1 }), 1);
assert.equal(resolveStructureDamage(10, { isAttack: false, attackDamage: 1 }), 10);

assert.deepEqual(
  consumeBaseHealthLossMilestones(9, 1, 10),
  { milestones: 1, progress: 0 }
);
assert.deepEqual(
  consumeBaseHealthLossMilestones(0, 25, 10),
  { milestones: 2, progress: 5 }
);
assert.deepEqual(
  consumeBaseHealthLossMilestones(4, 5, 10),
  { milestones: 0, progress: 9 }
);

assert.equal(BALANCE.playerBase.attackKnockback, 1.35);
const gameSource = readFileSync(new URL('../src/systems/Game.js', import.meta.url), 'utf8');
const playerBaseAttackSource = gameSource.match(
  /applyPlayerBaseAttack\(target\) \{([\s\S]*?)\n  updateEnemyCampAttack\(dt\)/
)?.[1] ?? '';
assert.match(playerBaseAttackSource, /applyKnockbackImpulse\(this, target, this\.playerBase\.position, knockback\)/);

{
  globalThis.window = { innerWidth: 1, innerHeight: 1 };
  const { Game } = await import('../src/systems/Game.js');
  const makeTarget = (x, z) => ({
    alive: true,
    isWildlife: false,
    isBoss: false,
    position: { x, z },
    collisionRadius: 0.4,
    health: 10,
    maxHealth: 20
  });
  const stubGame = (stacks) => Object.assign(Object.create(Game.prototype), {
    playerBase: { alive: true, position: { x: 0, z: 0 }, collisionRadius: 0.4 },
    enemyUnits: [makeTarget(0, 12)],
    getAbilityStacks: () => stacks
  });
  // 瞭望：每层 +50% 初始攻击距离，加算（8.5 → 1 层 12.75、2 层 17）
  const twoStacks = stubGame(2);
  assert.equal(
    Game.prototype.findPlayerBaseAttackTarget.call(twoStacks),
    twoStacks.enemyUnits[0],
    '瞭望 2 层加算射程 17，能命中 12 单位外的敌人'
  );
  const oneStack = stubGame(1);
  assert.equal(
    Game.prototype.findPlayerBaseAttackTarget.call(oneStack),
    oneStack.enemyUnits[0],
    '瞭望 1 层加算射程 12.75，能命中 12 单位外的敌人'
  );
  assert.equal(
    Game.prototype.findPlayerBaseAttackTarget.call(stubGame(0)),
    null,
    '无瞭望 8.5 射程不足以命中 12 单位外的敌人'
  );
  assert.match(gameSource, /baseRange \* 0\.5 \* lookoutStacks/, '瞭望按初始距离加算而非乘算');
}

console.log('Player-base damage and energy milestone checks passed.');
