import assert from 'node:assert/strict';
import { buildOwnedCardLevelMap, upgradeCost } from '../src/systems/MetaGameSystem.js';

assert.equal(upgradeCost('barbarians', 1), 100);
assert.equal(upgradeCost('self-destruct-enchant', 1), 100);
assert.equal(upgradeCost('barbarians', 2), 200);
assert.equal(upgradeCost('self-destruct-enchant', 3), 400);
assert.deepEqual(
  buildOwnedCardLevelMap(['swordsmen', 'meteor', 'archers'], {
    swordsmen: 5,
    meteor: 3,
    archers: 4
  }),
  { swordsmen: 5, meteor: 3, archers: 4 },
  '战斗会话必须保留不进入初始牌组的单位卡等级'
);

console.log('Meta workshop upgrade pricing checks passed.');
