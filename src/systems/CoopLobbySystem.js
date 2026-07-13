import { LEVEL_DEFINITIONS } from '../data/gameData.js';

const DECK_SIZE = 36;

export class CoopLobbySystem {
  constructor({ controller, getSelectedLevelId, getSelectedDifficulty, selectedLevel, onBack }) {
    this.controller = controller;
    this.getSelectedLevelId = getSelectedLevelId;
    this.getSelectedDifficulty = getSelectedDifficulty;
    this.selectedLevel = selectedLevel;
    this.onBack = onBack;
    this.root = document.querySelector('#coop-lobby-root');
    this.notice = '';
    this.ready = false;
    this.joinRoomId = '';
    if (!this.root) {
      this.root = document.createElement('section');
      this.root.id = 'coop-lobby-root';
      this.root.className = 'coop-lobby-root';
      document.querySelector('#app')?.appendChild(this.root);
    }
    this.unsubscribe = controller.roomClient.onUpdate((state) => this.render(state));
    this.root.addEventListener('click', (event) => this.onClick(event));
  }

  destroy() {
    this.unsubscribe?.();
    this.hide();
  }

  show(notice = '') {
    this.notice = notice;
    this.root.hidden = false;
    document.body.classList.add('is-coop-lobby-open');
    this.render({ room: this.controller.roomClient.room });
  }

  hide() {
    this.root.hidden = true;
    document.body.classList.remove('is-coop-lobby-open');
  }

  onClick(event) {
    const button = event.target.closest('[data-coop-action]');
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.coopAction;
    if (action === 'back') {
      this.controller.leaveRoom();
      this.hide();
      this.onBack?.();
      return;
    }
    if (action === 'create') {
      this.controller.createRoom();
      return;
    }
    if (action === 'join') {
      const input = this.root.querySelector('#coop-room-id');
      this.controller.joinRoom(input?.value ?? this.joinRoomId);
      return;
    }
    if (action === 'ready') {
      this.ready = !this.ready;
      this.controller.toggleReady(this.ready);
      this.render({ room: this.controller.roomClient.room });
      return;
    }
    if (action === 'start') {
      this.controller.startMatch();
    }
  }

  render(state = {}) {
    const room = state.room ?? this.controller.roomClient.room;
    const slot = this.controller.roomClient.playerSlot;
    const isHost = slot === 'p1';
    const level = this.selectedLevel?.() ?? LEVEL_DEFINITIONS[0];
    const difficulty = this.getSelectedDifficulty?.() ?? 1;
    const players = room?.players ?? {};
    const p1 = players.p1;
    const p2 = players.p2;
    this.root.innerHTML = `
      <main class="coop-lobby">
        <header class="coop-lobby-header">
          <button type="button" class="coop-lobby-back" data-coop-action="back">← 返回</button>
          <div>
            <h1>合作联机</h1>
            <p>2 人共享营地 · 各自牌组/能量/银币 · 敌军 2.5x 血 / 1.3x 攻</p>
          </div>
        </header>
        ${this.notice ? `<p class="coop-lobby-notice">${escapeHtml(this.notice)}</p>` : ''}
        ${room ? `
          <section class="coop-room-card">
            <div class="coop-room-code">
              <span>房间号</span>
              <strong>${room.id}</strong>
            </div>
            <div class="coop-room-meta">
              <span>关卡 ${escapeHtml(level?.name ?? '')}</span>
              <span>难度 ${difficulty}</span>
              <span>身份 ${isHost ? '房主 (Host)' : '队友'}</span>
            </div>
            <ul class="coop-player-list">
              <li>${escapeHtml(p1?.name ?? '玩家 1')} · ${p1?.ready ? '已准备' : '未准备'} · ${p1?.connected === false ? '断线' : '在线'}</li>
              <li>${p2 ? `${escapeHtml(p2.name)} · ${p2.ready ? '已准备' : '未准备'} · ${p2.connected === false ? '断线' : '在线'}` : '等待玩家 2 加入…'}</li>
            </ul>
            <div class="coop-room-actions">
              <button type="button" class="meta-menu-button" data-coop-action="ready">${this.ready ? '取消准备' : '准备'}</button>
              ${isHost ? '<button type="button" class="meta-menu-button" data-coop-action="start">开始合作</button>' : '<p class="coop-wait-host">等待房主开始…</p>'}
            </div>
          </section>
        ` : `
          <section class="coop-room-actions coop-room-actions-stack">
            <button type="button" class="meta-menu-button" data-coop-action="create">创建房间</button>
            <label class="coop-join-field">
              <span>房间号</span>
              <input id="coop-room-id" maxlength="6" placeholder="例如 A7K3Q9" value="${escapeHtml(this.joinRoomId)}" />
            </label>
            <button type="button" class="meta-menu-button" data-coop-action="join">加入房间</button>
          </section>
        `}
        <p class="coop-lobby-hint">需先选满 ${DECK_SIZE} 张出战牌。中继默认 ws://127.0.0.1:8787</p>
      </main>
    `;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
