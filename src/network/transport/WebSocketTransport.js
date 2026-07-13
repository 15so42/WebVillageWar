import { MSG } from '../protocol/messages.js';

export class WebSocketTransport {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.handlers = new Set();
    this.openHandlers = new Set();
    this.closeHandlers = new Set();
    this.reconnectToken = null;
    this.manualClose = false;
  }

  connect() {
    this.manualClose = false;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.addEventListener('open', () => {
        this.openHandlers.forEach((handler) => handler());
        resolve();
      }, { once: true });
      socket.addEventListener('message', (event) => {
        let payload = null;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        this.handlers.forEach((handler) => handler(payload));
      });
      socket.addEventListener('close', () => {
        this.closeHandlers.forEach((handler) => handler(this.manualClose));
      });
      socket.addEventListener('error', () => {
        reject(new Error('WebSocket 连接失败'));
      }, { once: true });
    });
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
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  close() {
    this.manualClose = true;
    this.socket?.close();
    this.socket = null;
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  saveSession(record) {
    this.reconnectToken = record;
    try {
      sessionStorage.setItem('village-war-coop-session', JSON.stringify(record));
    } catch {
      // ignore
    }
  }

  loadSession() {
    if (this.reconnectToken) return this.reconnectToken;
    try {
      const raw = sessionStorage.getItem('village-war-coop-session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  clearSession() {
    this.reconnectToken = null;
    try {
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
