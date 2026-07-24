import { LEVEL_DEFINITIONS } from '../data/gameData.js';
import { GAME_VERSION } from '../version.js';
import { CHALLENGE_MODE, isEndlessMode, normalizeChallengeMode } from './endlessMode.js';

const DECK_SIZE = 36;

export class CoopLobbySystem {
  constructor({ controller, getSelectedLevelId, getSelectedDifficulty, getSelectedChallengeMode, selectedLevel, getOwnedCardIds, cardWithLevel, availableDifficulty, renderDeckCard, onBack }) {
    this.controller = controller;
    this.getSelectedLevelId = getSelectedLevelId;
    this.getSelectedDifficulty = getSelectedDifficulty;
    this.getSelectedChallengeMode = getSelectedChallengeMode;
    this.selectedLevel = selectedLevel;
    this.getOwnedCardIds = getOwnedCardIds;
    this.cardWithLevel = cardWithLevel;
    this.availableDifficulty = availableDifficulty;
    this.renderDeckCard = renderDeckCard;
    this.onBack = onBack;
    this.root = document.querySelector('#coop-lobby-root');
    this.notice = '';
    this.joinRoomId = '';
    this.createLevelId = null;
    this.createDifficulty = null;
    this.createChallengeMode = null;
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
      return;
    }
    if (event.target?.id === 'coop-create-level') {
      this.createLevelId = event.target.value;
      const maxDifficulty = Math.max(1, Number(this.availableDifficulty?.(this.createLevelId) ?? 1));
      this.createDifficulty = Math.min(Math.max(1, Number(this.createDifficulty ?? 1)), maxDifficulty);
      this.render(this.controller.viewState?.() ?? { room: this.controller.roomClient.room });
      return;
    }
    if (event.target?.id === 'coop-create-difficulty') {
      this.createDifficulty = Math.max(1, Number(event.target.value) || 1);
      return;
    }
    if (event.target?.id === 'coop-create-mode') {
      this.createChallengeMode = normalizeChallengeMode(event.target.value);
      this.render(this.controller.viewState?.() ?? { room: this.controller.roomClient.room });
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
      const levelId = this.root.querySelector('#coop-create-level')?.value ?? this.createLevelId;
      const difficulty = Number(this.root.querySelector('#coop-create-difficulty')?.value ?? this.createDifficulty ?? 1);
      const challengeMode = normalizeChallengeMode(
        this.root.querySelector('#coop-create-mode')?.value ?? this.createChallengeMode
      );
      this.controller.createRoom({ levelId, difficulty, challengeMode });
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
    if (action === 'deck-card') {
      this.controller.changeDeckCard(button.dataset.cardId);
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
    const rootScrollTop = this.root.scrollTop;
    const deckScrollTop = this.root.querySelector('.coop-deck-card-grid')?.scrollTop ?? 0;
    const room = state.room ?? this.controller.roomClient.room;
    const slot = this.controller.roomClient.playerId;
    const isHost = this.controller.roomClient.isHost;
    const lobbyConfig = room?.lobbyConfig ?? state.lobbyConfig ?? null;
    const level = LEVEL_DEFINITIONS.find((entry) => entry.id === lobbyConfig?.levelId)
      ?? this.selectedLevel?.()
      ?? LEVEL_DEFINITIONS[0];
    const difficulty = lobbyConfig?.difficulty ?? this.getSelectedDifficulty?.() ?? 1;
    const challengeMode = normalizeChallengeMode(
      lobbyConfig?.challengeMode
      ?? this.createChallengeMode
      ?? this.getSelectedChallengeMode?.()
    );
    const createLevelId = this.createLevelId ?? this.getSelectedLevelId?.() ?? LEVEL_DEFINITIONS[0]?.id;
    const createMaxDifficulty = Math.max(1, Number(this.availableDifficulty?.(createLevelId) ?? 1));
    const createDifficulty = Math.min(
      Math.max(1, Number(this.createDifficulty ?? this.getSelectedDifficulty?.() ?? 1)),
      createMaxDifficulty
    );
    const createLevel = LEVEL_DEFINITIONS.find((entry) => entry.id === createLevelId)
      ?? LEVEL_DEFINITIONS[0];
    this.createLevelId = createLevelId;
    this.createDifficulty = createDifficulty;
    this.createChallengeMode = challengeMode;
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
              <span>模式 ${isEndlessMode(challengeMode) ? '无尽挑战' : '普通战役'}</span>
              <span>${isEndlessMode(challengeMode) ? '初始难度 0' : `难度 ${difficulty}`}</span>
              <span>${isEndlessMode(challengeMode) ? '金币按结束难度结算' : `基础金币 ${Math.max(0, Number(level?.baseReward) || 0)}`}</span>
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
          ${this.renderDeckBuilder({ selfReady, locked: room.phase === 'MATCH_LOADING' || room.phase === 'OPENING_SELECTION' || room.phase === 'RUNNING' })}
        ` : `
          <section class="coop-lobby-entry">
            <label class="coop-level-field">
              <span>房主选择关卡</span>
              <select id="coop-create-level">
                ${LEVEL_DEFINITIONS.map((entry) => `<option value="${escapeHtml(entry.id)}" ${entry.id === createLevelId ? 'selected' : ''}>${escapeHtml(entry.name)}</option>`).join('')}
              </select>
            </label>
            <label class="coop-level-field">
              <span>房主选择模式</span>
              <select id="coop-create-mode">
                <option value="${CHALLENGE_MODE.STANDARD}" ${isEndlessMode(challengeMode) ? '' : 'selected'}>普通战役 · 21 波</option>
                <option value="${CHALLENGE_MODE.ENDLESS}" ${isEndlessMode(challengeMode) ? 'selected' : ''}>无尽挑战 · 无限波次</option>
              </select>
            </label>
            ${isEndlessMode(challengeMode) ? '' : `
            <label class="coop-level-field">
              <span>房主选择难度</span>
              <select id="coop-create-difficulty">
                ${Array.from({ length: createMaxDifficulty }, (_, index) => {
                  const value = index + 1;
                  return `<option value="${value}" ${value === createDifficulty ? 'selected' : ''}>难度 ${value}</option>`;
                }).join('')}
              </select>
            </label>
            `}
            <p class="coop-lobby-hint">${isEndlessMode(challengeMode)
              ? '无尽模式双方卡牌入场统一为 Lv.1；难度从 0 开始并由 Host 按敌人存活时间调整，任一基地被摧毁都会结算胜利。'
              : `本关基础金币：<strong>${Math.max(0, Number(createLevel?.baseReward) || 0)}</strong>。胜利后会再按难度、用时和个人奖励能力结算。`}</p>
            <button type="button" class="meta-menu-button coop-create-button" data-coop-action="create">创建房间</button>
            <p class="coop-lobby-hint">关卡、模式与普通难度会在创建时由 Host 锁定；创建后每位玩家各自选择并确认自己的 36 张出战牌。</p>
            <div class="coop-lobby-divider" role="separator"><span>或加入好友房间</span></div>
            <label class="coop-join-field">
              <span>房间号</span>
              <input id="coop-room-id" maxlength="6" placeholder="例如 A7K3Q9" value="${escapeHtml(this.joinRoomId)}" autocomplete="off" />
            </label>
            <button type="button" class="meta-menu-button" data-coop-action="join">加入房间</button>
          </section>
        `}
        <p class="coop-lobby-hint">当前游戏版本 v${escapeHtml(GAME_VERSION)} · 需先选满 ${DECK_SIZE} 张出战牌。联机中继：47.100.215.224:8888</p>
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
    this.root.scrollTop = rootScrollTop;
    const deckGrid = this.root.querySelector('.coop-deck-card-grid');
    if (deckGrid) deckGrid.scrollTop = deckScrollTop;
  }

  renderDeckBuilder({ selfReady, locked }) {
    const deck = this.controller.getDeckSelection?.() ?? [];
    const selected = new Set(deck);
    const ownedIds = this.getOwnedCardIds?.() ?? [];
    const selectedCount = deck.length;
    return `
      <section class="coop-deck-builder" aria-label="选择自己的出战牌组">
        <header class="coop-deck-builder-head">
          <div>
            <span>个人牌组</span>
            <strong>选择牌组 ${selectedCount}/${DECK_SIZE}</strong>
          </div>
          <small>${selfReady ? '修改牌组会自动取消准备' : '只会发送你自己的牌组给 Host'}</small>
        </header>
        <p class="coop-lobby-hint">双方独立选择牌组、能量、银币和奖励。奖励候选只从各自已确认的出战牌组生成。</p>
        <div class="meta-card-grid coop-deck-card-grid">
          ${ownedIds.map((id) => {
            const card = this.cardWithLevel?.(id) ?? { id, name: id, kind: 'card', level: 1 };
            const isSelected = selected.has(id);
            const disabled = locked || (!isSelected && selectedCount >= DECK_SIZE);
            return this.renderDeckCard?.(card, {
              action: 'deck-card',
              stateText: isSelected ? '移出' : '加入',
              statusText: isSelected ? '已加入' : '',
              selected: isSelected,
              disabled
            }) ?? '';
          }).join('') || '<p class="coop-lobby-hint">当前没有可用卡牌。</p>'}
        </div>
      </section>
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
