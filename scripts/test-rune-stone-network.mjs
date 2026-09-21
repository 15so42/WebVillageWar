// 符文石联机校验回归测试（对应实施计划第 7 节「联机保持 Host 权威」与第 8 节验收要点）：
// 1) 新命令已加入 GAMEPLAY_COMMANDS，不会被判成 unsupported_command；
// 2) 只能操作自己的符文石，目标只能是自己基地背包或自己的存活单位；
// 3) 拒绝时返回明确的 reason code，不改动任何状态；
// 4) 客户端只发送标识，落点合法性由 Host 复核；
// 5) 快照与私有状态确实带上符文石字段。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const [
  { COMMAND, GAME_PROTOCOL_VERSION, MSG },
  { CommandValidator },
  { RuneStoneSystem }
] = await Promise.all([
  import('../src/network/protocol/messages.js'),
  import('../src/network/host/CommandValidator.js'),
  import('../src/systems/RuneStoneSystem.js')
]);

const OWNER = 'p1';
const OTHER = 'p2';

function makeGame() {
  const game = {
    localPlayerId: OWNER,
    localPlayerSlot: OWNER,
    activeEconomySlot: OWNER,
    coop: { enabled: true },
    players: { p1: {}, p2: {} },
    cardSystem: null,
    cardSystems: null,
    friendlyUnits: [],
    enemyUnits: [],
    networkBridge: { markPrivateStateDirty() {} },
    coopPlayerSlots: () => [OWNER, OTHER],
    map: null
  };
  game.runeStones = new RuneStoneSystem(game);
  return game;
}

function makeUnit(id, ownerId, { alive = true } = {}) {
  return {
    id,
    alive,
    type: 'knight',
    team: 'player',
    ownerPlayerId: ownerId,
    controllerPlayerId: ownerId,
    enchantments: new Map(),
    buffs: new Map(),
    maxEnchantmentSlots: 5,
    statusUiDirty: false,
    runeEnchantmentIds: new Set(),
    position: { x: 0, y: 0, z: 0 },
    addBuff(buffId, definition, overrides = {}) {
      const instance = { ...definition, ...overrides, id: buffId, level: overrides.level ?? 1 };
      delete instance.absoluteLevel;
      delete instance.ignoreEnchantmentSlots;
      this.buffs.set(buffId, instance);
      this.enchantments.set(buffId, instance);
      return instance;
    },
    removeBuff(buffId) {
      this.buffs.delete(buffId);
      this.enchantments.delete(buffId);
    }
  };
}

const game = makeGame();
const ownUnit = makeUnit('u1', OWNER);
const otherUnit = makeUnit('u2', OTHER);
const deadUnit = makeUnit('u3', OWNER, { alive: false });
game.friendlyUnits.push(ownUnit, otherUnit, deadUnit);

const ownStone = game.runeStones.createStone({
  enchantmentId: 'fire',
  level: 1,
  paidEnergy: 2,
  playerId: OWNER
});
const otherStone = game.runeStones.createStone({
  enchantmentId: 'thorns',
  level: 1,
  paidEnergy: 2,
  playerId: OTHER
});

const validator = new CommandValidator(game, { matchId: 'match-1', getPhaseRevision: () => 7 });

// ---- 1) 命令集合与信封 ----
{
  const envelope = {
    type: MSG.COMMAND,
    gameProtocolVersion: GAME_PROTOCOL_VERSION,
    matchId: 'match-1',
    name: COMMAND.RUNE_STONE_MOVE,
    clientSeq: 1,
    expectedPhaseRevision: 7,
    payload: { stoneId: ownStone.id, targetKind: 'base' }
  };
  const result = validator.validate(envelope, OWNER);
  assert.equal(result.ok, true, '符文石转移命令必须被权威链路接受');
  assert.equal(result.payload.stoneId, ownStone.id);
  assert.equal(result.payload.targetKind, 'base');
  assert.equal(result.payload.targetUnitId, null);

  const sellEnvelope = { ...envelope, clientSeq: 2, name: COMMAND.RUNE_STONE_SELL, payload: { stoneId: ownStone.id } };
  assert.equal(validator.validate(sellEnvelope, OWNER).ok, true);
}

// ---- 2) 归属与目标校验 ----
{
  assert.equal(
    validator.validateRuneStoneMove(OWNER, { stoneId: 'rune-missing', targetKind: 'base' }).reasonCode,
    'rune_stone_not_found'
  );
  assert.equal(
    validator.validateRuneStoneMove(OWNER, { stoneId: otherStone.id, targetKind: 'base' }).reasonCode,
    'rune_stone_not_owned',
    '不能操作别人的符文石'
  );
  assert.equal(
    validator.validateRuneStoneMove(OWNER, { stoneId: ownStone.id, targetKind: 'ground' }).reasonCode,
    'invalid_rune_stone_target'
  );
  assert.equal(
    validator.validateRuneStoneMove(OWNER, { stoneId: ownStone.id, targetKind: 'unit' }).reasonCode,
    'invalid_rune_stone_target',
    '指定单位落点时必须给出单位 id'
  );
  assert.equal(
    validator.validateRuneStoneMove(OWNER, {
      stoneId: ownStone.id,
      targetKind: 'unit',
      targetUnitId: 'u404'
    }).reasonCode,
    'target_not_found'
  );
  assert.equal(
    validator.validateRuneStoneMove(OWNER, {
      stoneId: ownStone.id,
      targetKind: 'unit',
      targetUnitId: otherUnit.id
    }).reasonCode,
    'target_not_owned',
    '不能把符文石塞进别人的单位'
  );
  assert.equal(
    validator.validateRuneStoneMove(OWNER, {
      stoneId: ownStone.id,
      targetKind: 'unit',
      targetUnitId: deadUnit.id
    }).reasonCode,
    'target_not_found',
    '已阵亡单位不是合法落点'
  );

  const ownResult = validator.validateRuneStoneMove(OWNER, {
    stoneId: ownStone.id,
    targetKind: 'unit',
    targetUnitId: 'u1'
  });
  assert.equal(ownResult.ok, true);
  assert.equal(ownResult.payload.targetUnitId, 'u1');
}

{
  assert.equal(
    validator.validateRuneStoneSell(OWNER, { stoneId: otherStone.id }).reasonCode,
    'rune_stone_not_owned'
  );
  assert.equal(validator.validateRuneStoneSell(OWNER, {}).reasonCode, 'invalid_rune_stone');
  assert.equal(validator.validateRuneStoneSell(OWNER, { stoneId: ownStone.id }).ok, true);
}

// ---- 3) 拒绝时不得改动状态 ----
{
  const before = game.runeStones.serializeForSlot(OWNER).stones.length;
  validator.validateRuneStoneMove(OWNER, { stoneId: otherStone.id, targetKind: 'base' });
  validator.validateRuneStoneMove(OWNER, {
    stoneId: ownStone.id,
    targetKind: 'unit',
    targetUnitId: otherUnit.id
  });
  assert.equal(
    game.runeStones.serializeForSlot(OWNER).stones.length,
    before,
    '校验失败不得改动任何符文石'
  );
  assert.equal(otherUnit.enchantments.size, 0, '被拒绝的落点不得产生附魔效果');
}

// ---- 4) 客户端只发送标识，Host 侧执行入口必须存在 ----
{
  const hostSource = readFileSync(new URL('../src/network/host/HostAuthority.js', import.meta.url), 'utf8');
  assert.match(hostSource, /COMMAND\.RUNE_STONE_MOVE/);
  assert.match(hostSource, /COMMAND\.RUNE_STONE_SELL/);
  assert.match(hostSource, /applyNetworkRuneStoneMove/);
  assert.match(hostSource, /applyNetworkRuneStoneSell/);

  const senderSource = readFileSync(new URL('../src/network/client/CommandSender.js', import.meta.url), 'utf8');
  assert.match(senderSource, /runeStoneMove\(stoneId, target = \{\}\)/);
  assert.match(senderSource, /runeStoneSell\(stoneId\)/);

  const snapshotSource = readFileSync(new URL('../src/network/host/SnapshotBuilder.js', import.meta.url), 'utf8');
  assert.match(snapshotSource, /runeStones: this\.game\.runeStones\?\.serializeForSlot/);

  const mirrorSource = readFileSync(new URL('../src/network/client/ClientMirror.js', import.meta.url), 'utf8');
  assert.match(mirrorSource, /applyNetworkSnapshot\?\.\(state\.runeStones\)/);
  assert.match(mirrorSource, /rune_stone_duplicate_name: '该单位已携带同名符文石'/);
}

console.log('rune stone network checks passed');
