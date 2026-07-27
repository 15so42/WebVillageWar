import assert from 'node:assert/strict';
import { WebRtcDirectTransport, candidatePath } from '../src/network/transport/WebRtcDirectTransport.js';
import { MSG } from '../src/network/protocol/messages.js';

async function run() {
  const previousRtc = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = FakePeerConnection;

  try {
  assert.equal(candidatePath('host', 'srflx'), 'direct');
  assert.equal(candidatePath('relay', 'srflx'), 'relay');
  assert.equal(candidatePath(null, null), null);

  const clientSignals = [];
  const client = new WebRtcDirectTransport({
    localPlayerId: 'client',
    hostPlayerId: 'host',
    sendSignal: (payload, to) => clientSignals.push({ payload, to })
  });
  assert.equal(client.requestConnection(), true);
  assert.deepEqual(clientSignals, [{ payload: { type: MSG.WEBRTC_READY }, to: 'host' }]);

  const hostSignals = [];
  const host = new WebRtcDirectTransport({
    localPlayerId: 'host',
    hostPlayerId: 'host',
    sendSignal: (payload, to) => hostSignals.push({ payload, to })
  });
  await host.receiveSignal({ type: MSG.WEBRTC_READY }, 'client');
  assert.equal(hostSignals.length, 1);
  assert.equal(hostSignals[0].payload.type, MSG.WEBRTC_OFFER);
  assert.equal(hostSignals[0].to, 'client');

  const peer = host.peers.get('client');
  assert.equal(host.send('client', { type: 'transaction' }), false);
  peer.channel.readyState = 'open';
  peer.channel.dispatchEvent(new Event('open'));
  assert.equal(host.send('client', { type: 'transaction', value: 7 }), true);
  assert.deepEqual(JSON.parse(peer.channel.sent.at(-1)), { type: 'game', payload: { type: 'transaction', value: 7 } });
  peer.channel.dispatchEvent(new MessageEvent('message', {
    data: JSON.stringify({ type: 'game', payload: { type: 'state_patch' } })
  }));
  assert.equal(host.snapshot().path, 'webrtc-direct');
  assert.equal(host.snapshot().peers[0].traffic.sent.messages, 1);
  assert.equal(host.snapshot().peers[0].traffic.received.messages, 1);

  client.destroy();
  host.destroy();
  console.log('WebRTC direct transport tests passed.');
  } finally {
    globalThis.RTCPeerConnection = previousRtc;
  }
}

class FakeDataChannel extends EventTarget {
  constructor() {
    super();
    this.readyState = 'connecting';
    this.sent = [];
  }

  send(message) {
    if (this.readyState !== 'open') throw new Error('channel is closed');
    this.sent.push(message);
  }

  close() {
    this.readyState = 'closed';
  }
}

class FakePeerConnection extends EventTarget {
  constructor() {
    super();
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this.localDescription = null;
    this.remoteDescription = null;
  }

  createDataChannel() {
    this.channel = new FakeDataChannel();
    return this.channel;
  }

  async createOffer() { return { type: 'offer', sdp: 'fake-offer' }; }
  async createAnswer() { return { type: 'answer', sdp: 'fake-answer' }; }
  async setLocalDescription(description) { this.localDescription = description; }
  async setRemoteDescription(description) { this.remoteDescription = description; }
  async addIceCandidate() {}
  async getStats() { return new Map(); }
  close() { this.connectionState = 'closed'; }
}

await run();
