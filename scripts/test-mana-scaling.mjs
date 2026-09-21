// 敌人携带魔力的成长方式回归测试（对应本次需求第 3 点）：
// 魔力不再按难度档位取固定值，而是和生命值、攻击力用同一套难度系数放大。
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
function createFakeElement(tag = 'div') {
  return {
    tagName: String(tag).toUpperCase(),
    children: [],
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    hidden: false,
    textContent: '',
    innerHTML: '',
    appendChild(child) { this.children.push(child); return child; },
    remove() {},
    setAttribute() {},
    removeAttribute() {},
    getAttribute: () => null,
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }),
    closest: () => null
  };
}
globalThis.document = {
  body: createFakeElement('body'),
  createElement: (tag) => createFakeElement(tag),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {}
};

const [
  { BALANCE, TEAMS, enemyManaFactor, manaBaseForEnemy, manaValueForEnemy },
  { standardEnemyStatFactors },
  { Game },
  { UnitEntity }
] = await Promise.all([
  import('../src/data/gameData.js'),
  import('../src/systems/difficultyRules.js'),
  import('../src/systems/Game.js'),
  import('../src/entities/UnitEntity.js')
]);

// ---- 1) 纯函数：档位基础值 + 与生命/攻击同源的难度系数 ----
{
  assert.ok(manaBaseForEnemy({}) > 0);
  assert.ok(
    manaBaseForEnemy({ isElite: true }) > manaBaseForEnemy({}),
    '精英的基础值必须高于普通'
  );
  assert.ok(
    manaBaseForEnemy({ isBoss: true }) > manaBaseForEnemy({ isElite: true }),
    'Boss 的基础值必须高于精英'
  );

  // 难度系数直接用模块导出的生命/攻击系数合成，两者一起决定成长幅度。
  const factorAt = (difficulty) => {
    const { health, damage } = standardEnemyStatFactors(difficulty);
    return enemyManaFactor(health, damage);
  };
  assert.ok(factorAt(1) > 0);
  for (let difficulty = 2; difficulty <= 12; difficulty += 1) {
    assert.ok(
      factorAt(difficulty) > factorAt(difficulty - 1),
      `难度 ${difficulty} 的魔力系数必须高于上一档（与生命/攻击同样单调上升）`
    );
  }
  // 权重 0.5 / 0.5 时就是两项的平均。
  const weighted = enemyManaFactor(1.4, 1.0);
  assert.ok(Math.abs(weighted - 1.2) < 1e-9, '默认按生命/攻击等权平均');

  assert.equal(manaValueForEnemy({ factor: 1 }), manaBaseForEnemy({}));
  assert.equal(
    manaValueForEnemy({ factor: 0 }),
    0,
    '系数为 0 时不应给出魔力'
  );
}

// ---- 2) 集成：applyEnemyDifficulty 写入的系数决定最终携带魔力 ----
function makeEnemyGame(difficulty) {
  return {
    isEndlessMode: () => false,
    coop: null,
    effectiveDifficulty: () => difficulty,
    // 起始 Buff 与本测试无关，避免依赖随机/波次配置。
    applyEnemyStartingBuffs: () => {}
  };
}

function spawnEnemy(difficulty) {
  const game = makeEnemyGame(difficulty);
  const unit = new UnitEntity({
    type: 'goblinSoldier',
    team: TEAMS.ENEMY,
    position: { x: 0, y: 0, z: 0 }
  });
  Game.prototype.applyEnemyDifficulty.call(game, unit, difficulty, null, 0);
  Game.prototype.assignEnemyManaValue.call(game, unit);
  return { unit, game };
}

{
  const first = spawnEnemy(1);
  assert.ok(
    Number.isFinite(first.unit.manaDifficultyFactor),
    'applyEnemyDifficulty 必须把本关的难度系数留在单位上'
  );
  assert.equal(
    first.unit.manaValue,
    manaValueForEnemy({ factor: first.unit.manaDifficultyFactor }),
    '携带魔力必须由档位基础值 × 难度系数算出'
  );
  assert.ok(first.unit.manaValue > 0);

  const mid = spawnEnemy(6);
  const late = spawnEnemy(12);
  assert.ok(
    mid.unit.manaValue > first.unit.manaValue,
    '难度提高后同一个敌人携带的魔力必须更高'
  );
  assert.ok(
    late.unit.manaValue > mid.unit.manaValue,
    '魔力必须随难度持续成长，而不是停在某个档位值'
  );

  // 魔力成长幅度必须和生命/攻击的成长系数一致（同源，而不是另一套公式）。
  for (const difficulty of [1, 4, 8, 12]) {
    const { unit } = spawnEnemy(difficulty);
    const { health, damage } = standardEnemyStatFactors(difficulty);
    assert.ok(
      Math.abs(unit.manaDifficultyFactor - enemyManaFactor(health, damage)) < 1e-9,
      `难度 ${difficulty} 的魔力系数必须与生命/攻击系数同源`
    );
  }
}

{
  // 没有走过 applyEnemyDifficulty 的生成点（例如野生动物）也要拿到与当前难度匹配的魔力。
  const game = makeEnemyGame(9);
  const unit = new UnitEntity({
    type: 'wolf',
    team: TEAMS.ENEMY,
    position: { x: 0, y: 0, z: 0 }
  });
  assert.equal(unit.manaDifficultyFactor, undefined);
  Game.prototype.assignEnemyManaValue.call(game, unit);
  const expectedFactor = enemyManaFactor(
    standardEnemyStatFactors(9).health,
    standardEnemyStatFactors(9).damage
  );
  assert.equal(unit.manaValue, manaValueForEnemy({ factor: expectedFactor }));
  assert.ok(unit.manaValue > 0);
}

{
  // 精英 / Boss 的档位差异仍然生效，而且同样乘上难度系数。
  const game = makeEnemyGame(8);
  const elite = new UnitEntity({ type: 'goblinSoldier', team: TEAMS.ENEMY, position: { x: 0, y: 0, z: 0 } });
  elite.isElite = true;
  Game.prototype.assignEnemyManaValue.call(game, elite);
  const boss = new UnitEntity({ type: 'goblinSoldier', team: TEAMS.ENEMY, position: { x: 0, y: 0, z: 0 } });
  boss.isBoss = true;
  Game.prototype.assignEnemyManaValue.call(game, boss);
  const normal = new UnitEntity({ type: 'goblinSoldier', team: TEAMS.ENEMY, position: { x: 0, y: 0, z: 0 } });
  Game.prototype.assignEnemyManaValue.call(game, normal);
  assert.ok(elite.manaValue > normal.manaValue);
  assert.ok(boss.manaValue > elite.manaValue);
}

console.log('enemy mana scaling checks passed');
