import { LEVEL_DEFINITIONS } from '../data/gameData.js';
import { GAME_VERSION } from '../version.js';

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
    // The controller is the single source of truth for lobby phase/ready state.
    // Subscribing to raw relay room snapshots here would overwrite newer Host revisions.
    this.unsubscribe = null;
    this.root.addEventListener('click', (event) => this.onClick(event));
    this.root.addEventListener('input', (event) => this.onInput(event));
  }

  destroy() {
    this.unsubscribe?.();
    this.hide();
  }

  show(notice = '') {
    this.controller.prepareReconnectPrompt?.();
    if (notice) this.notice = notice;
    this.root.hidden = false;
    document.body.classList.add('is-coop-lobby-open');
    this.render(this.controller.viewState?.() ?? { room: this.controller.roomClient.room });
  }

  setNotice(notice = '') {
    this.notice = notice;
    if (!this.root.hidden) {
      this.render(this.controller.viewState?.() ?? { room: this.controller.roomClient.room });
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
      const slot = this.controller.roomClient.playerId;
      const currentlyReady = Boolean(this.controller.lobbyPlayers?.get?.(slot)?.ready);
      this.controller.toggleReady(!currentlyReady);
      return;
    }
    if (action === 'reconnect-confirm') {
      this.controller.confirmReconnect?.();
      return;
    }
    if (action === 'reconnect-decline') {
      this.controller.declineReconnect?.();
    }
  }

  render(state = {}) {
    const room = state.room ?? this.controller.roomClient.room;
    const slot = this.controller.roomClient.playerId;
    const isHost = this.controller.roomClient.isHost;
    const level = this.selectedLevel?.() ?? LEVEL_DEFINITIONS[0];
    const difficulty = this.getSelectedDifficulty?.() ?? 1;
    const players = room?.players ?? {};
    const playerRows = (room?.playerOrder ?? Object.keys(players))
      .map((playerId) => players[playerId])
      .filter(Boolean);
    const selfReady = Boolean(players?.[slot]?.ready);
    const selfVersionVerified = players?.[slot]?.versionVerified === true;
    const allReady = playerRows.length >= 2 && playerRows.every((player) => (
      player.ready
      && player.connected !== false
      && player.versionVerified === true
    ));
    const reconnect = state.reconnect ?? (this.controller.pendingReconnectSession ? {
      roomId: this.controller.pendingReconnectSession.roomId,
      savedVersion: this.controller.pendingReconnectSession.gameVersion ?? null
    } : null);
    this.root.innerHTML = `
      <main class="coop-lobby">
        <header class="coop-lobby-header">
          <button type="button" class="coop-lobby-back" data-coop-action="back">← 返回</button>
          <div>
            <h1>合作联机</h1>
            <p>多人 PvE · 共享营地 · 各自牌组/能量/银币 · Host 权威</p>
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
              <span>人数 ${playerRows.length}</span>
              <span>身份 ${isHost ? '房主 (Host)' : '队友'}</span>
            </div>
            <ul class="coop-player-list">
              ${playerRows.map((player) => `<li>${escapeHtml(player.name ?? '玩家')} · ${player.playerId === room.hostPlayerId ? 'Host · ' : ''}${player.ready ? '已准备' : '未准备'} · ${player.connected === false ? '断线' : '在线'} · ${player.versionVerified ? `v${escapeHtml(player.gameVersion)}` : '版本校验中'}</li>`).join('')}
              ${playerRows.length < 2 ? '<li>等待其他玩家加入…</li>' : ''}
            </ul>
            <div class="coop-room-actions">
              <button type="button" class="meta-menu-button" data-coop-action="ready" ${selfVersionVerified ? '' : 'disabled'}>${selfReady ? '取消准备' : '准备'}</button>
            </div>
            <p class="coop-lobby-hint">${!selfVersionVerified ? '正在与主机校验游戏版本…' : (allReady ? '全员已准备，Host 正在创建权威对局…' : `至少 2 人且全员准备后开始 · 当前阶段 ${escapeHtml(room.phase ?? 'LOBBY_EDITING')}`)}</p>
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
        <p class="coop-lobby-hint">当前游戏版本 v${escapeHtml(GAME_VERSION)} · 需先选满 ${DECK_SIZE} 张出战牌。中继默认 ws://127.0.0.1:8787</p>
      </main>
      ${reconnect ? `
        <section class="coop-reconnect-backdrop" role="presentation">
          <div class="coop-reconnect-dialog" role="dialog" aria-modal="true" aria-labelledby="coop-reconnect-title">
            <h2 id="coop-reconnect-title">是否回连原房间？</h2>
            <p>房间 <strong>${escapeHtml(reconnect.roomId)}</strong> 仍存在且 Host 在线。确认后会向 Host 请求当前场上状态。</p>
            ${reconnect.savedVersion ? `<p class="coop-reconnect-version">断线版本 v${escapeHtml(reconnect.savedVersion)}</p>` : ''}
            <div class="coop-reconnect-actions">
              <button type="button" class="meta-menu-button" data-coop-action="reconnect-confirm">回连房间</button>
              <button type="button" class="coop-reconnect-cancel" data-coop-action="reconnect-decline">不回连</button>
            </div>
          </div>
        </section>
      ` : ''}
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
