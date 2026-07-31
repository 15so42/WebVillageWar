// 压力测试：重复"host 建房 + client 加入 + 版本握手"，找概率性失败
import { WebSocket } from 'ws';
import { setTimeout as sleep } from 'node:timers/promises';

globalThis.WebSocket = WebSocket;
globalThis.window = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  location: { href: 'http://localhost/', search: '' },
  matchMedia: () => ({ matches: false }),
  addEventListener: () => {}, removeEventListener: () => {},
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: (id) => clearTimeout(id),
  setInterval, clearInterval, setTimeout, clearTimeout
};
globalThis.document = { body: { classList: { add() {}, remove() {} } } };

const { CoopMatchController } = await import('./src/network/CoopMatchController.js');

const makeController = (name) => new CoopMatchController({
  getDeckSelection: () => [],
  getSelectedLevelId: () => 'snow-valley',
  getSelectedDifficulty: () => 1,
  getSelectedChallengeMode: () => 'standard',
  getPlayerName: () => name,
  selectedLevel: () => ({ id: 'snow-valley', name: '雪原谷地' }),
  cardWithLevel: (id) => ({ id, level: 1 }),
  toggleLocalDeckCard: () => {}, setLocalDeckSelection: () => {},
  onStartGame: () => {}, onNotice: () => {}, onLobbyVisible: () => {}, onConnectionLost: () => {}
});

const ROUNDS = 15;
let failures = 0;
for (let round = 0; round < ROUNDS; round += 1) {
  const host = makeController(`房主${round}`);
  const client = makeController(`队友${round}`);
  host.createRoom(`房主${round}`);
  for (let i = 0; i < 50 && !host.roomClient.room?.id; i += 1) await sleep(100);
  if (!host.roomClient.room?.id) { console.log(`round ${round}: host 建房失败`); failures += 1; continue; }
  await sleep(150);
  client.joinRoom(host.roomClient.room.id);
  for (let i = 0; i < 60 && !client.roomClient.room?.id; i += 1) await sleep(100);
  await sleep(1500);

  const clientVerified = client.lobbyPlayers.get(client.roomClient.playerId)?.versionVerified === true;
  const hostSawClient = [...host.lobbyPlayers.values()].some((p) => (
    p.playerId === client.roomClient.playerId && p.versionVerified === true
  ));
  const hostHasClient = [...host.lobbyPlayers.keys()].includes(client.roomClient.playerId);
  const clientHasSelf = client.lobbyPlayers.has(client.roomClient.playerId);

  if (!clientVerified || !hostSawClient) {
    failures += 1;
    console.log(`round ${round}: FAIL clientVerified=${clientVerified} hostSawClient=${hostSawClient}`);
    console.log(`  host lobbyPlayers:`, [...host.lobbyPlayers.entries()].map(([id, p]) => `${p.name}:ver=${p.versionVerified}`).join(', ') || '(空)');
    console.log(`  hostHasClient=${hostHasClient} clientHasSelf=${clientHasSelf}`);
    console.log(`  host.room=${host.roomClient.room?.id} client.room=${client.roomClient.room?.id}`);
  }
  host.roomClient.leaveRoom?.();
  client.roomClient.leaveRoom?.();
  await sleep(200);
}
console.log(`\n结果: ${ROUNDS} 轮, ${failures} 失败`);
process.exit(failures ? 2 : 0);
