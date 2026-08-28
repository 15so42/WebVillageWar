import assert from 'node:assert/strict';
import { normalizeMultiplayerSession } from '../src/network/session/MultiplayerSession.js';

function pveSession(playerCount) {
  return {
    mode: 'multiplayer',
    players: Object.fromEntries(
      Array.from({ length: playerCount }, (_, index) => [`player-${index + 1}`, { deck: [] }])
    )
  };
}

for (const [playerCount, expected] of [
  [2, { healthMult: 2, damageMult: 1.1 }],
  [3, { healthMult: 3, damageMult: 1.2 }],
  [4, { healthMult: 4, damageMult: 1.3 }],
  [5, { healthMult: 4, damageMult: 1.3 }]
]) {
  const normalized = normalizeMultiplayerSession(pveSession(playerCount));
  assert.deepEqual(
    normalized.coop,
    { enabled: true, ...expected },
    `${playerCount} 人 PvE 应使用正确的敌军人数系数`
  );
}

const leveledOpeningSession = normalizeMultiplayerSession({
  mode: 'multiplayer',
  localPlayerId: 'p1',
  players: {
    p1: {
      deck: [
        { id: 'swordsmen', level: 6 },
        { id: 'meteor', level: 3 }
      ]
    },
    p2: { deck: [{ id: 'archers', level: 4 }] }
  }
});
assert.equal(
  leveledOpeningSession.players.p1.deck.some((card) => card.id === 'swordsmen'),
  false,
  '单位卡仍不应进入初始牌组'
);
assert.equal(leveledOpeningSession.players.p1.cardLevels.swordsmen, 6);
assert.equal(leveledOpeningSession.players.p1.cardLevels.meteor, 3);
assert.equal(leveledOpeningSession.players.p2.cardLevels.archers, 4);

console.log('Multiplayer player-count scaling checks passed.');
