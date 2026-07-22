import { MSG, RELAY_VERSION } from '../protocol/messages.js';

export class WebSocketTransport {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.handlers = new Set();
    this.openHandlers = new Set();
    this.closeHandlers = new Set();
    this.reconnectSession = null;
    this.manualClose = false;
    this.connectPromise = null;
  }

  connect() {
    this.manualClose = false;
    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.socket?.readyState === WebSocket.CONNECTING && this.connectPromise) {
      return this.connectPromise;
    }
    if (this.socket) {
      try {
        this.socket.onopen = null;
        this.socket.onmessage = null;
        this.socket.onerror = null;
        this.socket.onclose = null;
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(this.url);
      this.socket = socket;

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        fn(value);
      };

      socket.addEventListener('open', () => {
        this.openHandlers.forEach((handler) => handler());
        finish(resolve);
      }, { once: true });

      socket.addEventListener('message', (event) => {
        let payload = null;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        // Dispatch against a snapshot. A reconnect handler may construct the
        // in-match bridge and subscribe while RECONNECT_OK is being handled;
        // iterating the live Set would deliver that same message to the new
        // subscriber and trigger a second full resync.
        [...this.handlers].forEach((handler) => handler(payload));
      });

      socket.addEventListener('close', () => {
        this.closeHandlers.forEach((handler) => handler(this.manualClose));
        if (!settled) {
          finish(reject, new Error('WebSocket 连接已关闭'));
        }
      });

      socket.addEventListener('error', () => {
        finish(reject, new Error('WebSocket 连接失败，请确认已运行 npm run server:coop'));
      }, { once: true });
    }).finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  onMessage(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onOpen(handler) {
    this.openHandlers.add(handler);
    return () => this.openHandlers.delete(handler);
  }

  onClose(handler) {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  send(payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ relayVersion: RELAY_VERSION, ...payload }));
    return true;
  }

  close() {
    this.manualClose = true;
    this.socket?.close();
    this.socket = null;
    this.connectPromise = null;
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  saveSession(record) {
    this.reconnectSession = record;
    try {
      sessionStorage.setItem('village-war-multiplayer-session', JSON.stringify(record));
    } catch {
      // ignore
    }
  }

  loadSession() {
    if (this.reconnectSession) return this.reconnectSession;
    try {
      const raw = sessionStorage.getItem('village-war-multiplayer-session')
        ?? sessionStorage.getItem('village-war-coop-session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  hasReconnectSession() {
    const saved = this.loadSession();
    if (!saved?.roomId || !saved?.reconnectToken) return false;
    return !Number.isFinite(Number(saved.expiresAt)) || Number(saved.expiresAt) > Date.now();
  }

  clearSession() {
    this.reconnectSession = null;
    try {
      sessionStorage.removeItem('village-war-multiplayer-session');
      sessionStorage.removeItem('village-war-coop-session');
    } catch {
      // ignore
    }
  }

  sendHeartbeat() {
    this.send({ type: MSG.HEARTBEAT, sentAt: Date.now() });
  }
}

export function defaultCoopWsUrl() {
  const configured = import.meta.env.VITE_COOP_WS_URL;
  if (configured) return configured;
  const host = window.location.hostname || '127.0.0.1';
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${host}:8787`;
}
