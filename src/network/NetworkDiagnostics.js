const DEFAULT_WINDOW_MS = 10_000;
const GAP_THRESHOLD_MS = 200;
const PRUNE_INTERVAL_MS = 500;

/**
 * Small rolling network probe for reproducing mobile relay stalls.
 * It deliberately keeps only aggregate samples, not game payloads.
 */
export class NetworkDiagnostics {
  constructor({ now = () => performance.now(), windowMs = DEFAULT_WINDOW_MS } = {}) {
    this.now = now;
    this.windowMs = windowMs;
    this.startedAtMs = now();
    this.messages = [];
    this.transforms = [];
    this.rttSamples = [];
    this.sequenceGaps = [];
    this.resyncs = [];
    this.lastInboundAtMs = null;
    this.lastTransformAtMs = null;
    this.nextPruneAtMs = this.startedAtMs + PRUNE_INTERVAL_MS;
  }

  recordInbound(raw, message) {
    this.recordMessage('inbound', rawByteLength(raw), protocolType(message), statePatchFields(message));
  }

  recordOutbound(raw, message) {
    this.recordMessage('outbound', rawByteLength(raw), protocolType(message), statePatchFields(message));
  }

  recordTransformStream(stream, { snap = false } = {}) {
    const now = this.now();
    const gapMs = this.lastTransformAtMs == null ? null : Math.max(0, now - this.lastTransformAtMs);
    this.lastTransformAtMs = now;
    this.transforms.push({
      atMs: now,
      gapMs,
      sampleSeq: Number.isFinite(stream?.sampleSeq) ? stream.sampleSeq : null,
      units: stream?.transforms?.length ?? 0,
      projectiles: stream?.projectiles?.length ?? 0,
      snap: Boolean(snap)
    });
    this.prune(now);
  }

  recordRtt(rttMs) {
    if (!Number.isFinite(rttMs) || rttMs < 0) return;
    const now = this.now();
    this.rttSamples.push({ atMs: now, rttMs });
    this.prune(now);
  }

  recordSequenceGap(previousSeq, receivedSeq) {
    const now = this.now();
    this.sequenceGaps.push({ atMs: now, previousSeq, receivedSeq });
    this.prune(now);
  }

  recordResync(reason = 'unknown') {
    const now = this.now();
    this.resyncs.push({ atMs: now, reason });
    this.prune(now);
  }

  snapshot() {
    const now = this.now();
    this.prune(now, true);
    const sampleWindowMs = Math.max(1, Math.min(this.windowMs, now - this.startedAtMs));
    const received = summarizeMessages(this.messages, 'inbound', now, sampleWindowMs);
    const sent = summarizeMessages(this.messages, 'outbound', now, sampleWindowMs);
    const transforms = this.transforms.filter((entry) => !entry.snap);
    const rtt = summarizeRtt(this.rttSamples);
    return {
      windowMs: this.windowMs,
      sampleWindowMs,
      received: { ...received, byType: summarizeByType(this.messages, 'inbound', sampleWindowMs) },
      sent: { ...sent, byType: summarizeByType(this.messages, 'outbound', sampleWindowMs) },
      rtt,
      transform: {
        streams: transforms.length,
        streamsPerSecond: ratePerSecond(transforms.length, sampleWindowMs),
        latestAgeMs: elapsedSince(this.lastTransformAtMs, now),
        maxGapMs: maxValue(transforms, 'gapMs'),
        gapsOver200Ms: transforms.filter((entry) => (entry.gapMs ?? 0) >= GAP_THRESHOLD_MS).length,
        latestUnitCount: transforms.at(-1)?.units ?? 0,
        latestProjectileCount: transforms.at(-1)?.projectiles ?? 0
      },
      unitStateFields: summarizeStateFields(this.messages, 'inbound', sampleWindowMs),
      serverSequenceGaps: this.sequenceGaps.length,
      resyncs: this.resyncs.length
    };
  }

  recordMessage(direction, bytes, type, stateFields = []) {
    const now = this.now();
    const inboundGapMs = direction === 'inbound' && this.lastInboundAtMs != null
      ? Math.max(0, now - this.lastInboundAtMs)
      : null;
    if (direction === 'inbound') this.lastInboundAtMs = now;
    this.messages.push({ atMs: now, direction, bytes, type, stateFields, inboundGapMs });
    this.prune(now);
  }

  prune(now, force = false) {
    if (!force && now < this.nextPruneAtMs) return;
    this.nextPruneAtMs = now + PRUNE_INTERVAL_MS;
    const minimumAtMs = now - this.windowMs;
    this.messages = this.messages.filter((entry) => entry.atMs >= minimumAtMs);
    this.transforms = this.transforms.filter((entry) => entry.atMs >= minimumAtMs);
    this.rttSamples = this.rttSamples.filter((entry) => entry.atMs >= minimumAtMs);
    this.sequenceGaps = this.sequenceGaps.filter((entry) => entry.atMs >= minimumAtMs);
    this.resyncs = this.resyncs.filter((entry) => entry.atMs >= minimumAtMs);
  }
}

export function networkDiagnosticsEnabled(locationSearch = globalThis.location?.search ?? '') {
  try {
    const params = new URLSearchParams(locationSearch);
    return (params.has('netdebug') && params.get('netdebug') !== '0')
      || (params.has('perfdebug') && params.get('perfdebug') !== '0');
  } catch {
    return false;
  }
}

function protocolType(message) {
  const payload = message?.type === 'net_forward' ? message.payload : message;
  const type = payload?.type ?? (message?.type === 'net_forward' ? 'net_forward' : 'unknown');
  if (type === 'event') return `event:${payload.name ?? 'unknown'}`;
  if (type === 'state_patch') return `state_patch:${payload.entityType ?? 'unknown'}`;
  return type;
}

function statePatchFields(message) {
  const payload = message?.type === 'net_forward' ? message.payload : message;
  if (payload?.type !== 'state_patch' || payload.entityType !== 'unit') return [];
  return Object.keys(payload.changes ?? {});
}

function rawByteLength(raw) {
  if (typeof raw === 'string') return utf8ByteLength(raw);
  return Number(raw?.byteLength) || 0;
}

function utf8ByteLength(value) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff
      && index + 1 < value.length
      && value.charCodeAt(index + 1) >= 0xdc00
      && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function summarizeMessages(messages, direction, now, windowMs) {
  const entries = messages.filter((entry) => entry.direction === direction);
  return {
    messages: entries.length,
    messagesPerSecond: ratePerSecond(entries.length, windowMs),
    bytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    bytesPerSecond: ratePerSecond(entries.reduce((total, entry) => total + entry.bytes, 0), windowMs),
    latestAgeMs: elapsedSince(entries.at(-1)?.atMs, now),
    maxGapMs: direction === 'inbound' ? maxValue(entries, 'inboundGapMs') : 0,
    gapsOver200Ms: direction === 'inbound'
      ? entries.filter((entry) => (entry.inboundGapMs ?? 0) >= GAP_THRESHOLD_MS).length
      : 0
  };
}

function summarizeRtt(samples) {
  if (!samples.length) return { latestMs: null, avgMs: null, maxMs: null };
  const values = samples.map((entry) => entry.rttMs);
  return {
    latestMs: values.at(-1),
    avgMs: Math.round(values.reduce((total, value) => total + value, 0) / values.length),
    maxMs: Math.round(Math.max(...values))
  };
}

function summarizeByType(messages, direction, windowMs) {
  const groups = new Map();
  messages.forEach((entry) => {
    if (entry.direction !== direction) return;
    const type = entry.type || 'unknown';
    const group = groups.get(type) ?? { type, messages: 0, bytes: 0 };
    group.messages += 1;
    group.bytes += entry.bytes;
    groups.set(type, group);
  });
  return [...groups.values()]
    .map((group) => ({
      ...group,
      messagesPerSecond: ratePerSecond(group.messages, windowMs),
      bytesPerSecond: ratePerSecond(group.bytes, windowMs)
    }))
    .sort((a, b) => b.bytes - a.bytes || b.messages - a.messages);
}

function summarizeStateFields(messages, direction, windowMs) {
  const groups = new Map();
  messages.forEach((entry) => {
    if (entry.direction !== direction || entry.type !== 'state_patch:unit') return;
    entry.stateFields.forEach((field) => groups.set(field, (groups.get(field) ?? 0) + 1));
  });
  return [...groups.entries()]
    .map(([field, updates]) => ({ field, updates, updatesPerSecond: ratePerSecond(updates, windowMs) }))
    .sort((a, b) => b.updates - a.updates || a.field.localeCompare(b.field));
}

function elapsedSince(atMs, now) {
  return Number.isFinite(atMs) ? Math.max(0, Math.round(now - atMs)) : null;
}

function ratePerSecond(value, windowMs) {
  return Number((value / (windowMs / 1_000)).toFixed(1));
}

function maxValue(entries, key) {
  const values = entries.map((entry) => entry[key]).filter(Number.isFinite);
  return values.length ? Math.round(Math.max(...values)) : 0;
}
