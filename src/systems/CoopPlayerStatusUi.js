const MAX_ENERGY = 12;

export class CoopPlayerStatusUi {
  constructor(game) {
    this.game = game;
    this.playersPublic = [];
    this.expandedPlayerId = null;
    this.root = document.querySelector('#coop-player-status');
    if (!this.root) {
      this.root = document.createElement('section');
      this.root.id = 'coop-player-status';
      this.root.className = 'coop-player-status';
      document.querySelector('.hud-primary')?.appendChild(this.root);
    }
    this.root.hidden = false;
    this.root.addEventListener('click', (event) => this.onClick(event));
  }

  destroy() {
    this.root?.remove();
    this.root = null;
  }

  onClick(event) {
    const chip = event.target.closest('[data-coop-player-slot]');
    if (!chip) {
      if (event.target.closest('[data-coop-close-detail]')) {
        this.expandedPlayerId = null;
        this.render();
      }
      return;
    }
    const playerId = chip.dataset.coopPlayerSlot;
    this.expandedPlayerId = this.expandedPlayerId === playerId ? null : playerId;
    this.render();
  }

  updatePlayersPublic(rows) {
    if (Array.isArray(rows)) {
      this.playersPublic = rows;
    }
    this.render();
  }

  render() {
    if (!this.root) return;
    const rows = this.buildRows();
    this.root.innerHTML = `
      <div class="coop-player-status-row">
        ${rows.map((row) => this.renderChip(row)).join('')}
      </div>
      ${this.expandedPlayerId ? this.renderDetail(rows.find((row) => row.playerId === this.expandedPlayerId)) : ''}
    `;
  }

  buildRows() {
    const game = this.game;
    const sessionPlayers = game?.levelSession?.players ?? {};
    const localPlayerId = game.localPlayerId ?? game.localPlayerSlot;
    const playerIds = Object.keys(sessionPlayers).sort((a, b) => {
      if (a === localPlayerId) return -1;
      if (b === localPlayerId) return 1;
      return (sessionPlayers[a]?.order ?? Number.MAX_SAFE_INTEGER)
        - (sessionPlayers[b]?.order ?? Number.MAX_SAFE_INTEGER);
    });
    return playerIds.map((playerId) => {
      const isLocal = playerId === localPlayerId;
      const publicRow = this.playersPublic.find((row) => (row.playerId ?? row.slot) === playerId) ?? {};
      const run = game.players?.[playerId];
      const cards = game.cardSystems?.[playerId] ?? (isLocal ? game.cardSystem : null);
      const localDetail = isLocal && cards
        ? {
          energy: cards.energy ?? 0,
          silver: game.getSilver?.(playerId) ?? run?.silver ?? 0,
          handCount: cards.handCards?.length ?? 0,
          drawCount: cards.drawPile?.length ?? 0,
          discardCount: cards.discardPile?.length ?? 0,
          tempCount: cards.temporaryCards?.length ?? 0,
          connected: true,
          strategyPending: Boolean(game.strategyEvent || run?.strategyEvent)
            ? 1
            : (run?.pendingStrategyRewards?.length ?? 0)
        }
        : null;
      return {
        playerId,
        slot: playerId,
        name: sessionPlayers[playerId]?.name ?? '玩家',
        isLocal,
        isHost: playerId === game.levelSession?.matchRules?.hostPlayerId,
        energy: localDetail?.energy ?? publicRow.energy ?? 0,
        silver: localDetail?.silver ?? publicRow.silver ?? 0,
        handCount: localDetail?.handCount ?? publicRow.handCount ?? 0,
        drawCount: localDetail?.drawCount ?? publicRow.drawCount ?? 0,
        discardCount: localDetail?.discardCount ?? publicRow.discardCount ?? 0,
        tempCount: localDetail?.tempCount ?? publicRow.tempCount ?? 0,
        connected: localDetail?.connected ?? publicRow.connected !== false,
        strategyPending: localDetail?.strategyPending ?? (publicRow.strategyPending ? 1 : 0)
      };
    });
  }

  renderChip(row) {
    const role = row.isLocal ? '你' : '队友';
    const hostMark = row.isHost ? ' · Host' : '';
    const offline = row.connected ? '' : ' · 断线';
    return `
      <button
        type="button"
        class="coop-player-chip ${row.isLocal ? 'is-local' : ''} ${this.expandedPlayerId === row.playerId ? 'is-expanded' : ''}"
        data-coop-player-slot="${row.playerId}"
      >
        <span class="coop-player-chip-title">${escapeHtml(row.name)}（${role}${hostMark}${offline}）</span>
        <span class="coop-player-chip-stats">
          <span>⚡ ${formatNum(row.energy)}/${MAX_ENERGY}</span>
          <span>🪙 ${formatNum(row.silver)}</span>
          <span>🃏 ${row.handCount}</span>
        </span>
      </button>
    `;
  }

  renderDetail(row) {
    if (!row) return '';
    return `
      <div class="coop-player-detail">
        <div class="coop-player-detail-header">
          <strong>${escapeHtml(row.name)} 详情</strong>
          <button type="button" class="coop-player-detail-close" data-coop-close-detail>收起</button>
        </div>
        <dl class="coop-player-detail-grid">
          <div><dt>能量</dt><dd>${formatNum(row.energy)} / ${MAX_ENERGY}</dd></div>
          <div><dt>银币</dt><dd>${formatNum(row.silver)}</dd></div>
          <div><dt>手牌</dt><dd>${row.handCount}</dd></div>
          <div><dt>抽牌堆</dt><dd>${row.drawCount}</dd></div>
          <div><dt>弃牌堆</dt><dd>${row.discardCount}</dd></div>
          <div><dt>临时牌</dt><dd>${row.tempCount}</dd></div>
          <div><dt>待选奖励</dt><dd>${row.strategyPending}</dd></div>
          <div><dt>连接</dt><dd>${row.connected ? '在线' : '断线'}</dd></div>
        </dl>
        <p class="coop-player-detail-hint">${row.isLocal ? '这是你的完整状态。' : '队友只显示公开摘要，看不到具体手牌内容。'}</p>
      </div>
    `;
  }
}

function formatNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
