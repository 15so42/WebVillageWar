export class NetworkAnalysisUi {
  constructor({ getSnapshot }) {
    this.getSnapshot = getSnapshot;
    this.visible = false;
    this.lastRenderAt = 0;
    this.metricRows = [];
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'network-analysis-button';
    this.button.textContent = '网络';
    this.button.hidden = true;
    this.button.setAttribute('aria-label', '网络分析');
    this.button.setAttribute('aria-pressed', 'false');

    this.root = document.createElement('section');
    this.root.className = 'network-analysis-panel';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', '网络分析');
    this.root.innerHTML = `
      <header>
        <div><strong>网络分析</strong><span data-network-path>等待联机</span></div>
        <button type="button" data-network-close aria-label="关闭网络分析">×</button>
      </header>
      <div class="network-analysis-content" data-network-content>等待数据…</div>
    `;
    this.path = this.root.querySelector('[data-network-path]');
    this.content = this.root.querySelector('[data-network-content]');
    this.button.addEventListener('click', () => this.toggle());
    this.root.querySelector('[data-network-close]').addEventListener('click', () => this.setOpen(false));
    document.body.append(this.button, this.root);
  }

  setEnabled(enabled) {
    this.button.hidden = !enabled;
    if (!enabled) this.setOpen(false);
  }

  toggle() {
    this.setOpen(!this.visible);
  }

  setOpen(open) {
    this.visible = Boolean(open);
    this.root.hidden = !this.visible;
    this.button.setAttribute('aria-pressed', String(this.visible));
    if (this.visible) this.render(true);
  }

  update() {
    if (!this.visible) return;
    this.render(false);
  }

  render(force) {
    const now = performance.now();
    if (!force && now - this.lastRenderAt < 400) return;
    this.lastRenderAt = now;
    const snapshot = this.getSnapshot?.();
    const direct = snapshot?.direct;
    const peers = direct?.peers ?? [];
    const primary = peers[0] ?? null;
    const isDirect = direct?.path === 'webrtc-direct';
    const path = isDirect
      ? (primary?.path === 'turn-relay' ? 'WebRTC · TURN 中继' : 'WebRTC · 直连')
      : 'WebSocket 中继';
    this.path.textContent = path;
    const received = snapshot?.received ?? {};
    const transform = snapshot?.transform ?? {};
    const rtt = snapshot?.rtt ?? {};
    const application = snapshot?.application ?? {};
    const activeReceived = isDirect ? (primary?.traffic?.received ?? received) : received;
    const receivePath = isDirect ? 'WebRTC 收包' : '中继收包';
    this.renderMetrics([
      ['当前路径', path],
      ['WebRTC', direct?.supported === false
        ? '当前浏览器不支持，使用 WebSocket'
        : webRtcState(primary)],
      ['WebRTC RTT', primary?.rttMs == null ? '等待候选连接' : `${primary.rttMs}ms`],
      ['中继 RTT', rtt.latestMs == null ? '等待时间同步' : `${rtt.latestMs}ms（平均 ${rtt.avgMs ?? '-'}ms）`],
      [receivePath, `${activeReceived.messagesPerSecond ?? 0}/秒 · ${formatRate(activeReceived.bytesPerSecond)} · 最大间隔 ${activeReceived.maxGapMs ?? 0}ms`],
      ['统计窗口', formatWindow(snapshot?.sampleWindowMs ?? snapshot?.windowMs)],
      ['最近收包', formatAge(activeReceived.latestAgeMs)],
      ['流量来源', formatTypeBreakdown(activeReceived.byType)],
      ['同步应用', formatApplication(application)],
      ['同步峰值来源', formatApplicationCategories(application.categories)],
      ['单位字段', formatUnitStateFields(snapshot?.unitStateFields)],
      ['状态流', `${transform.streamsPerSecond ?? 0}/秒 · 最大间隔 ${transform.maxGapMs ?? 0}ms · 单位 ${transform.latestUnitCount ?? 0} · 投射物 ${transform.latestProjectileCount ?? 0}`],
      ['恢复', `可靠序号缺口 ${snapshot?.serverSequenceGaps ?? 0} · 重同步 ${snapshot?.resyncs ?? 0}`]
    ]);
  }

  renderMetrics(metrics) {
    if (this.metricRows.length !== metrics.length) {
      this.content.replaceChildren(...metrics.map(() => {
        const row = document.createElement('div');
        row.className = 'network-analysis-row';
        row.append(document.createElement('span'), document.createElement('strong'));
        return row;
      }));
      this.metricRows = [...this.content.querySelectorAll('.network-analysis-row')].map((row) => ({
        label: row.querySelector('span'),
        value: row.querySelector('strong')
      }));
    }
    metrics.forEach(([label, value], index) => {
      const row = this.metricRows[index];
      if (row.label.textContent !== label) row.label.textContent = label;
      if (row.value.textContent !== value) row.value.textContent = value;
    });
  }

  destroy() {
    this.button.remove();
    this.root.remove();
  }
}

function webRtcState(peer) {
  if (!peer) return '正在等待对端协商；未连通时自动使用中继';
  const details = [peer.state, peer.iceState, peer.channelState].filter(Boolean).join(' / ');
  return `${details || '协商中'}${peer.candidateType ? ` · ${peer.candidateType}` : ''}${peer.lastError ? ` · ${peer.lastError}` : ''}`;
}

function formatRate(bytesPerSecond = 0) {
  if (bytesPerSecond >= 1024) return `${(bytesPerSecond / 1024).toFixed(1)}KB/s`;
  return `${Math.round(bytesPerSecond)}B/s`;
}

function formatAge(ageMs) {
  return Number.isFinite(ageMs) ? `${Math.round(ageMs)}ms 前` : '尚未收到数据';
}

function formatWindow(windowMs) {
  return Number.isFinite(windowMs) ? `${(windowMs / 1_000).toFixed(1)}秒滚动统计` : '等待样本';
}

function formatTypeBreakdown(entries) {
  if (!entries?.length) return '等待数据';
  return entries.slice(0, 5).map((entry) => (
    `${networkTypeLabel(entry.type)} ${entry.messagesPerSecond}/秒 ${formatRate(entry.bytesPerSecond)}`
  )).join(' · ');
}

function networkTypeLabel(type) {
  return {
    transform_stream: '位置流',
    'state_patch:unit': '单位状态',
    'state_patch:match': '战局状态',
    'state_patch:players_public': '玩家状态',
    'state_patch:structure': '建筑状态',
    'state_patch:altars': '祭坛状态',
    transaction: '结算',
    motion_event: '动作',
    ui_state: 'UI',
    time_sync_response: '时间同步',
    full_snapshot: '全量同步'
  }[type] ?? (type.startsWith('event:') ? `事件 ${type.slice('event:'.length)}` : type);
}

function formatUnitStateFields(entries) {
  if (!entries?.length) return '近期开局后无单位状态变更';
  return entries.slice(0, 4).map((entry) => `${entry.field} ${entry.updatesPerSecond}/秒`).join(' · ');
}

function formatApplication(application) {
  return `队列 ${application.reliableQueued ?? 0}+${application.transformsQueued ?? 0}`
    + ` · 最近 ${application.lastMs ?? 0}ms`
    + ` · 平均 ${application.avgMs ?? 0}ms`
    + ` · 峰值 ${application.maxMs ?? 0}ms`
    + ` · 合并位置 ${application.coalescedTransforms ?? 0}`;
}

function formatApplicationCategories(categories) {
  if (!categories?.length) return '等待同步数据';
  return categories.slice(0, 4).map((entry) => (
    `${applicationCategoryLabel(entry.category)} ${entry.maxMs ?? 0}ms`
  )).join(' · ');
}

function applicationCategoryLabel(category) {
  if (category === 'transform') return '位置';
  if (category === 'event') return '事件';
  if (category === 'ui') return 'UI';
  if (category === 'transaction') return '结算';
  if (category === 'motion') return '动作';
  if (category === 'full_snapshot') return '全量恢复';
  if (category?.startsWith('state:')) return `状态 ${category.slice('state:'.length)}`;
  return '其他';
}
