import assert from 'node:assert/strict';
import {
  resolveTransportLink,
  playerBaseTransportEndpoint
} from '../src/systems/transport.js';
import { Inventory } from '../src/systems/Inventory.js';
import { moveSlotCount } from '../src/systems/inventoryTransfer.js';

function check(label, fn) {
  try {
    fn();
    console.log(`ok   ${label}`);
    return true;
  } catch (error) {
    console.error(`fail ${label}`);
    console.error(error);
    return false;
  }
}

const station = (id) => ({ kind: 'station', stationId: id });

let passed = 0;
let total = 0;
const run = (label, fn) => {
  total += 1;
  if (check(label, fn)) passed += 1;
};

run('容器→容器 合法（有向）', () => {
  const r = resolveTransportLink(station('player-base'), station('chest-1'));
  assert.equal(r.ok, true);
  assert.equal(r.from.stationId, 'player-base');
  assert.equal(r.to.stationId, 'chest-1');
});

run('反向连线方向不同', () => {
  const r = resolveTransportLink(station('chest-1'), station('player-base'));
  assert.equal(r.ok, true);
  assert.equal(r.from.stationId, 'chest-1');
});

run('不能连自己', () => {
  const r = resolveTransportLink(station('player-base'), station('player-base'));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'same_endpoint');
});

run('基地端点 id 固定', () => {
  const ep = playerBaseTransportEndpoint();
  assert.equal(ep.stationId, 'player-base');
});

run('运输逻辑每次只搬 1 个（堆叠留在来源格）', () => {
  const from = new Inventory({ capacity: 2 });
  const to = new Inventory({ capacity: 2 });
  from.add('wood', 10);
  const result = moveSlotCount(from, to, { fromIndex: 0, count: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.moved, 1);
  assert.equal(from.countOf('wood'), 9);
  assert.equal(to.countOf('wood'), 1);
});

console.log(`\n${passed}/${total} 通过`);
process.exitCode = passed === total ? 0 : 1;
