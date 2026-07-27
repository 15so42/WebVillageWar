import assert from 'node:assert/strict';
import { NetworkDiagnostics, networkDiagnosticsEnabled } from '../src/network/NetworkDiagnostics.js';

let now = 0;
const diagnostics = new NetworkDiagnostics({ now: () => now, windowMs: 1_000 });

diagnostics.recordInbound('{"type":"net_forward","payload":{"type":"transform_stream"}}', {
  type: 'net_forward',
  payload: { type: 'transform_stream' }
});
diagnostics.recordInbound('{"type":"net_forward","payload":{"type":"event","name":"fx_ring"}}', {
  type: 'net_forward',
  payload: { type: 'event', name: 'fx_ring' }
});
diagnostics.recordTransformStream({ sampleSeq: 1, transforms: [{ unitId: 'u1' }], projectiles: [] });
now = 260;
diagnostics.recordInbound('{"type":"net_forward"}', { type: 'net_forward' });
diagnostics.recordInbound('{"type":"net_forward","payload":{"type":"state_patch","entityType":"unit","changes":{"durability":12,"health":93}}}', {
  type: 'net_forward',
  payload: {
    type: 'state_patch',
    entityType: 'unit',
    changes: { durability: 12, health: 93 }
  }
});
diagnostics.recordTransformStream({ sampleSeq: 2, transforms: [{ unitId: 'u1' }], projectiles: [{ projectileId: 'p1' }] });
diagnostics.recordOutbound('{"type":"net_forward"}', { type: 'net_forward' });
diagnostics.recordOutbound('中', { type: 'heartbeat' });
diagnostics.recordRtt(320);
diagnostics.recordSequenceGap(8, 11);
diagnostics.recordResync('server_sequence_gap');

now = 1_000;
const snapshot = diagnostics.snapshot();
assert.equal(snapshot.sampleWindowMs, 1_000);
assert.equal(snapshot.received.messages, 4);
assert.equal(snapshot.received.gapsOver200Ms, 1);
assert.equal(snapshot.received.byType.find((entry) => entry.type === 'event:fx_ring')?.bytes, 66);
assert.equal(snapshot.received.byType.find((entry) => entry.type === 'transform_stream')?.bytes, 60);
assert.equal(snapshot.sent.byType.find((entry) => entry.type === 'heartbeat')?.bytes, 3);
assert.deepEqual(snapshot.unitStateFields, [
  { field: 'durability', updates: 1, updatesPerSecond: 1 },
  { field: 'health', updates: 1, updatesPerSecond: 1 }
]);
assert.equal(snapshot.transform.gapsOver200Ms, 1);
assert.equal(snapshot.transform.latestUnitCount, 1);
assert.equal(snapshot.transform.latestProjectileCount, 1);
assert.equal(snapshot.rtt.latestMs, 320);
assert.equal(snapshot.serverSequenceGaps, 1);
assert.equal(snapshot.resyncs, 1);
assert.equal(networkDiagnosticsEnabled('?netdebug=1'), true);
assert.equal(networkDiagnosticsEnabled('?netdebug=0'), false);

console.log('Network diagnostics checks passed.');
