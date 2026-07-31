import { MSG } from '../protocol/messages.js';
import { NetworkDiagnostics } from '../NetworkDiagnostics.js';

const DEFAULT_STUN_URL = 'stun:stun.l.google.com:19302';

/**
 * A best-effort game-data path layered over the existing room relay.
 * The relay remains responsible for room lifetime and WebRTC signaling; game
 * payloads use the DataChannel only after it is confirmed open.
 */
export class WebRtcDirectTransport {
  constructor({ localPlayerId, hostPlayerId, sendSignal, onPayload, now = () => performance.now() }) {
    this.localPlayerId = localPlayerId;
    this.hostPlayerId = hostPlayerId;
    this.sendSignal = sendSignal;
    this.onPayload = onPayload;
    this.now = now;
    this.peers = new Map();
    this.supported = typeof globalThis.RTCPeerConnection === 'function';
  }

  requestConnection() {
    if (!this.supported || !this.hostPlayerId || this.localPlayerId === this.hostPlayerId) return false;
    return Boolean(this.sendSignal({ type: MSG.WEBRTC_READY }, this.hostPlayerId));
  }

  handlesSignal(payload) {
    return WEBRTC_SIGNAL_TYPES.has(payload?.type);
  }

  async receiveSignal(payload, fromPlayerId) {
    if (!this.supported || !fromPlayerId || fromPlayerId === this.localPlayerId) return false;
    try {
      switch (payload.type) {
        case MSG.WEBRTC_READY:
          if (this.localPlayerId === this.hostPlayerId) await this.createHostOffer(fromPlayerId);
          return true;
        case MSG.WEBRTC_OFFER:
          if (this.localPlayerId !== this.hostPlayerId) await this.acceptOffer(fromPlayerId, payload.description);
          return true;
        case MSG.WEBRTC_ANSWER:
          await this.acceptAnswer(fromPlayerId, payload.description);
          return true;
        case MSG.WEBRTC_ICE:
          await this.acceptCandidate(fromPlayerId, payload.candidate);
          return true;
        default:
          return false;
      }
    } catch (error) {
      const peer = this.peerFor(fromPlayerId);
      if (peer) {
        peer.lastError = error?.message ?? String(error);
        peer.state = 'fallback';
      }
      return false;
    }
  }

  send(playerId, payload) {
    const peer = this.peers.get(playerId);
    if (!peer?.channel || peer.channel.readyState !== 'open') return false;
    try {
      const serialized = JSON.stringify({ type: 'game', payload });
      peer.channel.send(serialized);
      peer.diagnostics.recordOutbound(serialized, payload);
      peer.lastSentAtMs = this.now();
      return true;
    } catch (error) {
      peer.lastError = error?.message ?? String(error);
      peer.state = 'fallback';
      return false;
    }
  }

  snapshot() {
    const peers = [...this.peers.values()].map((peer) => ({
      playerId: peer.playerId,
      state: peer.state,
      connectionState: peer.connection.connectionState,
      iceState: peer.connection.iceConnectionState,
      channelState: peer.channel?.readyState ?? 'none',
      path: peer.path,
      candidateType: peer.candidateType,
      rttMs: peer.rttMs,
      traffic: peer.diagnostics.snapshot(),
      lastError: peer.lastError ?? null
    }));
    const direct = peers.some((peer) => peer.state === 'direct');
    return {
      supported: this.supported,
      path: direct ? 'webrtc-direct' : 'websocket-relay',
      peers
    };
  }

  destroy() {
    this.peers.forEach((peer) => {
      clearInterval(peer.statsTimer);
      try {
        peer.channel?.close();
        peer.connection.close();
      } catch {
        // Best-effort cleanup only.
      }
    });
    this.peers.clear();
  }

  async createHostOffer(playerId) {
    const existing = this.peers.get(playerId);
    if (existing && !isTerminalConnectionState(existing.connection.connectionState)) return;
    const peer = this.createPeer(playerId, { createDataChannel: true });
    const offer = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(offer);
    this.sendSignal({ type: MSG.WEBRTC_OFFER, description: peer.connection.localDescription }, playerId);
  }

  async acceptOffer(playerId, description) {
    const existing = this.peers.get(playerId);
    // Candidates that arrived before the offer (out-of-order signaling) are
    // buffered on the peer. Rebuilding the peer must carry them over, or a
    // host that does not re-trickle them would never get the P2P connection up.
    const carriedCandidates = existing?.pendingCandidates ?? [];
    if (existing) this.disposePeer(existing);
    const peer = this.createPeer(playerId);
    if (carriedCandidates.length) peer.pendingCandidates = carriedCandidates;
    await peer.connection.setRemoteDescription(description);
    await this.flushPendingCandidates(peer);
    const answer = await peer.connection.createAnswer();
    await peer.connection.setLocalDescription(answer);
    this.sendSignal({ type: MSG.WEBRTC_ANSWER, description: peer.connection.localDescription }, playerId);
  }

  async acceptAnswer(playerId, description) {
    const peer = this.peers.get(playerId);
    if (!peer || !description) return;
    await peer.connection.setRemoteDescription(description);
    await this.flushPendingCandidates(peer);
  }

  async acceptCandidate(playerId, candidate) {
    if (!candidate) return;
    const peer = this.peers.get(playerId);
    if (!peer || !peer.connection.remoteDescription) {
      const pending = peer ?? this.createPeer(playerId, { deferOffer: true });
      pending.pendingCandidates.push(candidate);
      return;
    }
    await peer.connection.addIceCandidate(candidate);
  }

  createPeer(playerId, { createDataChannel = false } = {}) {
    const connection = new RTCPeerConnection({ iceServers: webRtcIceServers() });
    const peer = {
      playerId,
      connection,
      channel: null,
      pendingCandidates: [],
      state: 'connecting',
      path: 'negotiating',
      candidateType: null,
      rttMs: null,
      lastError: null,
      lastSentAtMs: null,
      diagnostics: new NetworkDiagnostics({ now: this.now }),
      statsTimer: null
    };
    this.peers.set(playerId, peer);

    connection.addEventListener('icecandidate', (event) => {
      if (!event.candidate) return;
      this.sendSignal({ type: MSG.WEBRTC_ICE, candidate: event.candidate.toJSON?.() ?? event.candidate }, playerId);
    });
    connection.addEventListener('datachannel', (event) => this.attachDataChannel(peer, event.channel));
    connection.addEventListener('connectionstatechange', () => this.onConnectionState(peer));
    connection.addEventListener('iceconnectionstatechange', () => this.onConnectionState(peer));
    if (createDataChannel) this.attachDataChannel(peer, connection.createDataChannel('village-war-game', { ordered: true }));
    peer.statsTimer = setInterval(() => this.sampleStats(peer), 1_000);
    return peer;
  }

  attachDataChannel(peer, channel) {
    peer.channel?.close?.();
    peer.channel = channel;
    channel.addEventListener('open', () => {
      peer.state = 'direct';
      peer.path = peer.candidateType === 'relay' ? 'turn-relay' : 'direct';
      this.sampleStats(peer);
    });
    channel.addEventListener('close', () => {
      if (peer.state === 'direct') peer.state = 'fallback';
    });
    channel.addEventListener('error', () => {
      peer.lastError = 'data_channel_error';
      if (peer.state !== 'direct') peer.state = 'fallback';
    });
    channel.addEventListener('message', (event) => this.receiveData(peer, event.data));
  }

  receiveData(peer, raw) {
    try {
      const serialized = String(raw);
      const message = JSON.parse(serialized);
      peer.diagnostics.recordInbound(serialized, message.payload);
      if (message?.type !== 'game' || !message.payload) return;
      this.onPayload?.(message.payload, peer.playerId);
    } catch {
      peer.lastError = 'invalid_data_channel_message';
    }
  }

  onConnectionState(peer) {
    const state = peer.connection.connectionState;
    if (state === 'failed' || state === 'closed') {
      peer.state = 'fallback';
      peer.path = 'websocket-relay';
    }
  }

  async sampleStats(peer) {
    if (!peer?.connection || isTerminalConnectionState(peer.connection.connectionState)) return;
    try {
      const reports = await peer.connection.getStats();
      const pairs = [];
      reports.forEach((report) => {
        if (report.type === 'candidate-pair' && (report.selected || (report.nominated && report.state === 'succeeded'))) {
          pairs.push(report);
        }
      });
      const pair = pairs.at(-1);
      if (!pair) return;
      const local = reports.get(pair.localCandidateId);
      const remote = reports.get(pair.remoteCandidateId);
      peer.candidateType = candidatePath(local?.candidateType, remote?.candidateType);
      peer.path = peer.candidateType === 'relay' ? 'turn-relay' : 'direct';
      peer.rttMs = Number.isFinite(pair.currentRoundTripTime)
        ? Math.round(pair.currentRoundTripTime * 1_000)
        : peer.rttMs;
    } catch {
      // Browser statistics are advisory; the data channel remains usable.
    }
  }

  async flushPendingCandidates(peer) {
    const candidates = peer.pendingCandidates.splice(0);
    for (const candidate of candidates) await peer.connection.addIceCandidate(candidate);
  }

  peerFor(playerId) {
    return this.peers.get(playerId) ?? null;
  }

  disposePeer(peer) {
    clearInterval(peer.statsTimer);
    try {
      peer.channel?.close();
      peer.connection.close();
    } catch {
      // ignore
    }
    this.peers.delete(peer.playerId);
  }
}

export function candidatePath(localCandidateType, remoteCandidateType) {
  if (localCandidateType === 'relay' || remoteCandidateType === 'relay') return 'relay';
  if (localCandidateType || remoteCandidateType) return 'direct';
  return null;
}

function webRtcIceServers() {
  const configured = import.meta.env?.VITE_WEBRTC_STUN_URL;
  const urls = String(configured || DEFAULT_STUN_URL)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return urls.length ? [{ urls }] : [];
}

function isTerminalConnectionState(state) {
  return state === 'failed' || state === 'closed';
}

const WEBRTC_SIGNAL_TYPES = new Set([
  MSG.WEBRTC_READY,
  MSG.WEBRTC_OFFER,
  MSG.WEBRTC_ANSWER,
  MSG.WEBRTC_ICE
]);
