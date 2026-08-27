import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  body: {
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => false,
      contains: () => false
    }
  }
};

const [
  { BALANCE, TEAMS },
  { CardSystem },
  { AbilitySystem },
  { Game }
] = await Promise.all([
  import('../src/data/gameData.js'),
  import('../src/systems/CardSystem.js'),
  import('../src/systems/AbilitySystem.js'),
  import('../src/systems/Game.js')
]);

assert.equal(BALANCE.playerEnergy.regenerationPerSecond, 0.2);

function makeEnergySystem({ client = false, energy = 4 } = {}) {
  let dirtyCount = 0;
  const system = Object.assign(Object.create(CardSystem.prototype), {
    game: {
      networkClientMode: client,
      networkBridge: {
        markPrivateStateDirty() {
          dirtyCount += 1;
        }
      }
    },
    playerSlot: 'p1',
    energy,
    energyTimer: 0,
    updateEnergyUi() {},
    updateCardAffordability() {}
  });
  return { system, dirtyCount: () => dirtyCount };
}

function assertNear(actual, expected, message = '') {
  assert.ok(Math.abs(actual - expected) < 1e-9, message || `${actual} should equal ${expected}`);
}

{
  const { system, dirtyCount } = makeEnergySystem();
  assert.equal(system.regenerateEnergy(0.99), 0);
  assert.equal(system.energy, 4);
  assertNear(system.regenerateEnergy(0.01), 0.2);
  assertNear(system.energy, 4.2);
  assertNear(system.regenerateEnergy(5), 1);
  assertNear(system.energy, 5.2);
  assert.equal(dirtyCount(), 2, 'Host 每批恢复后应同步一次私有能量状态');
}

{
  const { system, dirtyCount } = makeEnergySystem({ client: true });
  assert.equal(system.regenerateEnergy(10), 0);
  assert.equal(system.energy, 4, 'Client 镜像不得自行恢复能量');
  assert.equal(dirtyCount(), 0);
}

{
  const { system } = makeEnergySystem({ energy: 11.9 });
  assertNear(system.regenerateEnergy(1), 0.1);
  assert.equal(system.energy, 12);
  assert.equal(system.regenerateEnergy(1), 0);
  assert.equal(system.energyTimer, 0);
}

{
  const queriedAbilities = [];
  const gains = [];
  AbilitySystem.prototype.onEnemyKilled.call({
    getStacks(abilityId) {
      queriedAbilities.push(abilityId);
      return abilityId === 'killHarvest' ? 2 : 99;
    },
    gainEnergy(amount, position) {
      gains.push({ amount, position });
    }
  }, { position: { x: 1, y: 0, z: 2 } });
  assert.deepEqual(queriedAbilities, ['killHarvest']);
  assert.deepEqual(gains, [{ amount: 0.4, position: { x: 1, y: 0, z: 2 } }]);
}

{
  let directKillEnergyAdds = 0;
  let abilityKillEvents = 0;
  const game = Object.assign(Object.create(Game.prototype), {
    coop: { enabled: false },
    localPlayerSlot: 'p1',
    cardSystem: {
      addEnergy() {
        directKillEnergyAdds += 1;
      }
    },
    abilitiesFor() {
      return {
        onEnemyKilled() {
          abilityKillEvents += 1;
        }
      };
    }
  });
  game.grantKillEnergy({ team: TEAMS.ENEMY, position: { x: 0, y: 0, z: 0 } });
  assert.equal(directKillEnergyAdds, 0, '普通击杀不得直接增加能量');
  assert.equal(abilityKillEvents, 1, '击杀事件仍需交给猎魂潮汐处理');
}

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const gameSource = readFileSync(new URL('../src/systems/Game.js', import.meta.url), 'utf8');
assert.match(indexSource, /<button id="run-shop-toggle"[^>]*\shidden>/);
assert.match(gameSource, /this\.runShopUi\.toggle\.hidden = true/);
assert.doesNotMatch(indexSource, />B 军需铺/);
const keyDownSource = gameSource.match(/onKeyDown\(event\) \{([\s\S]*?)\n  onKeyUp\(event\)/)?.[1] ?? '';
assert.doesNotMatch(keyDownSource, /key === ['"]b['"]/i, 'B 键不应再打开军需铺');
assert.match(
  gameSource,
  /toggleRunShop\(\) \{\s*if \(!RUN_SHOP_PLAYER_ACCESS_ENABLED && !this\.runShopFreeReward\) return false;/,
  '隐藏军需铺时主动打开路径必须被规则层拦截'
);
assert.match(
  gameSource,
  /openRunShop\(options = \{\}\) \{\s*if \(!RUN_SHOP_PLAYER_ACCESS_ENABLED && options\.freeReward !== true\) return false;/,
  '普通军需铺即使被直接调用也不应打开'
);
const completeWaveSource = gameSource.match(/completeCurrentWave\(\) \{([\s\S]*?)\n  updateWavePreview\(\)/)?.[1] ?? '';
assert.match(completeWaveSource, /(?:openCoopStrategyEventForAll|openStrategyEvent)\('boss-reward'\)/);
assert.doesNotMatch(completeWaveSource, /open(?:Coop)?RunShop/);

console.log('Energy economy regression checks passed.');
