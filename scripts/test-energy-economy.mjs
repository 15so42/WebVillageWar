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
  { EffectsSystem },
  { Game }
] = await Promise.all([
  import('../src/data/gameData.js'),
  import('../src/systems/CardSystem.js'),
  import('../src/systems/AbilitySystem.js'),
  import('../src/systems/EffectsSystem.js'),
  import('../src/systems/Game.js')
]);

assert.equal(BALANCE.playerEnergy.regenerationPerSecond, 0.1);
assert.equal('max' in BALANCE.playerEnergy, false, '玩家能量不应再配置上限');

{
  let floatingText = null;
  EffectsSystem.prototype.spawnEnergyNumber.call({
    spawnDamageNumber(position, amount, options) {
      floatingText = options.text;
    }
  }, { x: 0, y: 0, z: 0 }, 0.21, {
    text: '+0.21 银币',
    color: '#f6e7a8'
  });
  assert.equal(floatingText, '+0.21 银币', '击杀银币飘字不能被能量默认文案覆盖');
}

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
  assertNear(system.regenerateEnergy(0.01), 0.1);
  assertNear(system.energy, 4.1);
  assertNear(system.regenerateEnergy(5), 0.5);
  assertNear(system.energy, 4.6);
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
  assertNear(system.regenerateEnergy(1), 0.1);
  assertNear(system.energy, 12.1, '超过旧上限后仍应继续恢复能量');
  assertNear(system.addEnergy(100), 100);
  assertNear(system.energy, 112.1, '主动获得能量也不应受到旧上限限制');
}

{
  const energyValue = { textContent: '' };
  const silverValue = { textContent: '' };
  CardSystem.prototype.updateEnergyUi.call({
    energy: 125.4,
    playerSlot: 'p1',
    game: { getSilver: () => 37.5 },
    lastRenderedResourceSignature: '',
    energyParts: {
      values: new Map([
        ['energy', energyValue],
        ['silver', silverValue]
      ])
    }
  }, true);
  assert.equal(energyValue.textContent, '125.4');
  assert.equal(silverValue.textContent, '37.5');
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
  let killHarvestStacks = 0;
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
        getStacks(abilityId) {
          return abilityId === 'killHarvest' ? killHarvestStacks : 0;
        },
        onEnemyKilled() {
          abilityKillEvents += 1;
        }
      };
    }
  });
  game.grantKillEnergy({ team: TEAMS.ENEMY, position: { x: 0, y: 0, z: 0 } });
  assert.equal(directKillEnergyAdds, 0, '普通击杀不得直接增加能量');
  assert.equal(abilityKillEvents, 0, '未持有猎魂潮汐时不得触发任何击杀回能事件');
  killHarvestStacks = 1;
  game.grantKillEnergy({ team: TEAMS.ENEMY, position: { x: 0, y: 0, z: 0 } });
  assert.equal(directKillEnergyAdds, 0, '猎魂潮汐也必须通过能力结算，不能恢复基础击杀能量');
  assert.equal(abilityKillEvents, 1, '只有持有猎魂潮汐时才转发击杀事件');
}

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const gameSource = readFileSync(new URL('../src/systems/Game.js', import.meta.url), 'utf8');
const cardSystemSource = readFileSync(new URL('../src/systems/CardSystem.js', import.meta.url), 'utf8');
const coopStatusSource = readFileSync(new URL('../src/systems/CoopPlayerStatusUi.js', import.meta.url), 'utf8');
const battleHudStyles = readFileSync(new URL('../src/battleHud.css', import.meta.url), 'utf8');
assert.doesNotMatch(cardSystemSource, /MAX_ENERGY|energy-cell/);
assert.doesNotMatch(gameSource, /能量已满|playerEnergy\?\.max/);
assert.doesNotMatch(coopStatusSource, /MAX_ENERGY|\/\$\{MAX_ENERGY\}/);
assert.match(cardSystemSource, /id:\s*'energy',[\s\S]*?id:\s*'silver'/);
assert.match(cardSystemSource, /class="resource-list"[\s\S]*?data-resource-value="\$\{resource\.id\}"/);
assert.match(battleHudStyles, /\.resource-list\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,/);
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
assert.match(completeWaveSource, /openCoopRunShopForAll\(\{ freeReward: true \}\)/);
assert.match(completeWaveSource, /openRunShop\(\{ freeReward: true \}\)/);
assert.doesNotMatch(completeWaveSource, /boss-reward/);

console.log('Energy economy regression checks passed.');
