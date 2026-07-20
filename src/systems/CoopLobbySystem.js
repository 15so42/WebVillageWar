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
    this.joinRoomId = '';
    if (!this.root) {
      this.root = document.createElement('section');
      this.root.id = 'coop-lobby-root';
      this.root.className = 'coop-lobby-root';
      document.querySelector('#app')?.appendChild(this.root);
    }
    this.unsubscribe = controller.roomClient.onUpdate((state) => this.render(state));
    this.root.addEventListener('click', (event) => this.onClick(event));
    this.root.addEventListener('input', (event) => this.onInput(event));
  }

  destroy() {
    this.unsubscribe?.();
    this.hide();
  }

  show(notice = '') {
    if (notice) this.notice = notice;
    this.root.hidden = false;
    document.body.classList.add('is-coop-lobby-open');
    this.render({ room: this.controller.roomClient.room });
  }

  setNotice(notice = '') {
    this.notice = notice;
    if (!this.root.hidden) {
      this.render({ room: this.controller.roomClient.room });
    }
  }

  hide() {
    this.root.hidden = true;
    document.body.classList.remove('is-coop-lobby-open');
  }

  onInput(event) {
    if (event.target?.id === 'coop-room-id') {
      this.joinRoomId = String(event.target.value ?? '').trim().toUpperCase();
    }
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
      const roomId = input?.value ?? this.joinRoomId;
      this.joinRoomId = String(roomId ?? '').trim().toUpperCase();
      this.controller.joinRoom(this.joinRoomId);
      return;
    }
    if (action === 'ready') {
      const slot = this.controller.roomClient.playerSlot;
      const currentlyReady = Boolean(this.controller.roomClient.room?.players?.[slot]?.ready);
      this.controller.toggleReady(!currentlyReady);
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
    const selfReady = Boolean(players?.[slot]?.ready);
    const bothReady = Boolean(p1?.ready && p2?.ready && p2?.connected !== false);
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
              <span>房间号（发给队友）</span>
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
              <button type="button" class="meta-menu-button" data-coop-action="ready">${selfReady ? '取消准备' : '准备'}</button>
            </div>
            <p class="coop-lobby-hint">${bothReady ? '双方已准备，正在进入对局…' : '双方都点准备后将自动开始'}</p>
          </section>
        ` : `
          <section class="coop-lobby-entry">
            <button type="button" class="meta-menu-button coop-create-button" data-coop-action="create">创建房间</button>
            <p class="coop-lobby-hint">创建后会生成房间号，发给队友加入即可</p>
            <div class="coop-lobby-divider" role="separator"><span>或加入好友房间</span></div>
            <label class="coop-join-field">
              <span>房间号</span>
              <input id="coop-room-id" maxlength="6" placeholder="例如 A7K3Q9" value="${escapeHtml(this.joinRoomId)}" autocomplete="off" />
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
