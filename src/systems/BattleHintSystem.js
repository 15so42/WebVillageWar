/**
 * 战场短提示。原先挂在卡牌系统上（能量条旁边），卡牌删掉之后提示仍要留下：
 * 放置建筑、招募、合成失败、拾取装不下，都靠它告诉玩家发生了什么。
 */
export class BattleHintSystem {
  constructor({ mount = true } = {}) {
    this.hintOwner = null;
    this.hintPanel = mount && typeof document !== 'undefined'
      ? createGameHintPanel()
      : null;
  }

  setHint(text, owner = 'system') {
    if (!this.hintPanel) return;
    const next = String(text ?? '');
    if (this.hintOwner === owner && this.hintPanel.textContent === next && !this.hintPanel.hidden) {
      return;
    }
    this.hintOwner = owner;
    this.hintPanel.textContent = next;
    this.hintPanel.hidden = false;
    this.hintPanel.classList.add('is-visible');
  }

  setHintOnce(text, owner = 'system') {
    this.setHint(text, owner);
  }

  clearHint(owner = 'system') {
    if (!this.hintPanel) return;
    if (this.hintOwner && owner !== this.hintOwner) return;
    this.hintOwner = null;
    this.hintPanel.classList.remove('is-visible');
    this.hintPanel.hidden = true;
  }

  destroy() {
    this.hintPanel?.remove?.();
    this.hintPanel = null;
    this.hintOwner = null;
  }
}

function createGameHintPanel() {
  const existing = document.querySelector('#game-hint-panel');
  if (existing) return existing;
  const panel = document.createElement('div');
  panel.id = 'game-hint-panel';
  panel.className = 'game-hint-panel';
  panel.setAttribute('aria-live', 'polite');
  panel.hidden = true;
  const anchor = document.querySelector('#card-hand')
    ?? document.querySelector('.hud')
    ?? document.querySelector('#app')
    ?? document.body;
  if (anchor?.before && anchor !== document.body) {
    anchor.before(panel);
  } else {
    (document.querySelector('#app') ?? document.body).appendChild(panel);
  }
  return panel;
}
