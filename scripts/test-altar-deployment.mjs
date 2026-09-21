// 祭坛部署点回归测试（对应实施计划第 5.1 节与第 8 节验收要点）：
// 己方占领的祭坛必须像信标一样成为单位卡的合法落点；
// 中立与敌方占领的祭坛不得提供己方部署权限。
import assert from 'node:assert/strict';

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
  body: { classList: { add: () => {}, remove: () => {}, toggle: () => false, contains: () => false } },
  createElement: () => ({
    style: { setProperty() {} },
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(child) { return child; },
    remove() {},
    setAttribute() {},
    querySelector: () => null,
    querySelectorAll: () => []
  }),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {}
};

const [{ Game }, { BALANCE, TEAMS }] = await Promise.all([
  import('../src/systems/Game.js'),
  import('../src/data/gameData.js')
]);

const DEPLOY_RADIUS = Number(BALANCE.altarRules?.deploymentRadius ?? 7.5);

function makeGame() {
  return {
    playerBase: { position: { x: 0, y: 0, z: 30 }, alive: true },
    friendlyUnits: [],
    altars: {
      altars: [
        { id: 'neutral', owner: null, position: { x: -20, y: 0, z: 0 } },
        { id: 'ours', owner: TEAMS.PLAYER, position: { x: 12, y: 0, z: -4 } },
        { id: 'theirs', owner: TEAMS.ENEMY, position: { x: 24, y: 0, z: -18 } }
      ]
    },
    // canDeploySummonAt 内部复用同一个枚举函数，测试里直接绑上真实实现。
    getSummonDeploymentAnchors: Game.prototype.getSummonDeploymentAnchors,
    // 用联机口径的归属判定：单机口径下所有友方单位都属于“玩家”，无法区分槽位。
    unitBelongsToPlayer: (unit, slot) => (
      (unit?.controllerPlayerId ?? unit?.ownerPlayerId) === slot
    )
  };
}

{
  const game = makeGame();
  const anchors = Game.prototype.getSummonDeploymentAnchors.call(game, 'p1');
  const ids = anchors.map((anchor) => anchor.position.x + ':' + anchor.position.z);
  assert.ok(ids.includes('0:30'), '基地始终是部署点');
  assert.ok(ids.includes('12:-4'), '己方占领的祭坛必须是部署点');
  assert.equal(ids.includes('-20:0'), false, '中立祭坛不提供部署权限');
  assert.equal(ids.includes('24:-18'), false, '敌方占领的祭坛不提供部署权限');

  const altarAnchor = anchors.find((anchor) => anchor.position.x === 12);
  assert.equal(
    altarAnchor.radius,
    DEPLOY_RADIUS,
    '祭坛部署半径必须来自 BALANCE.altarRules.deploymentRadius'
  );
}

{
  const game = makeGame();
  // 祭坛半径内可以部署，半径外不行。
  assert.equal(
    Game.prototype.canDeploySummonAt.call(game, { x: 12 + DEPLOY_RADIUS - 0.1, z: -4 }, 'p1'),
    true,
    '己方祭坛半径内可部署'
  );
  assert.equal(
    Game.prototype.canDeploySummonAt.call(game, { x: 12 + DEPLOY_RADIUS + 1, z: -4 }, 'p1'),
    false,
    '超出祭坛部署半径不可部署'
  );
  assert.equal(
    Game.prototype.canDeploySummonAt.call(game, { x: -20, z: 0 }, 'p1'),
    false,
    '中立祭坛范围内不可部署'
  );
  assert.equal(
    Game.prototype.canDeploySummonAt.call(game, { x: 24, z: -18 }, 'p1'),
    false,
    '敌方祭坛范围内不可部署'
  );
}

{
  // 失去占领（被中和）后必须立即失去部署权限。
  const game = makeGame();
  game.altars.altars[1].owner = null;
  assert.equal(
    Game.prototype.canDeploySummonAt.call(game, { x: 12, z: -4 }, 'p1'),
    false,
    '祭坛被中和后不再提供己方部署权限'
  );
  game.altars.altars[1].owner = TEAMS.ENEMY;
  assert.equal(
    Game.prototype.canDeploySummonAt.call(game, { x: 12, z: -4 }, 'p1'),
    false,
    '祭坛被敌方占领后不再提供己方部署权限'
  );
}

{
  // 信标部署规则不能被祭坛改动破坏。
  const game = makeGame();
  game.friendlyUnits.push({
    id: 7,
    alive: true,
    underConstruction: false,
    team: 'player',
    ownerPlayerId: 'p1',
    controllerPlayerId: 'p1',
    definition: { deploymentBeacon: true, deploymentRadius: 5 },
    position: { x: -8, y: 0, z: 8 }
  });
  const anchors = Game.prototype.getSummonDeploymentAnchors.call(game, 'p1');
  const beacon = anchors.find((anchor) => anchor.position.x === -8);
  assert.ok(beacon, '信标仍然是部署点');
  assert.equal(beacon.radius, 5, '信标沿用自身 deploymentRadius');

  // 别人的信标不算数。
  const otherAnchors = Game.prototype.getSummonDeploymentAnchors.call(game, 'p2');
  assert.equal(otherAnchors.some((anchor) => anchor.position.x === -8), false);
}

console.log('altar deployment checks passed');
