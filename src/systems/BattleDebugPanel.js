import { CARD_DEFINITIONS, TEAMS, UNIT_DEFINITIONS } from '../data/gameData.js';
import { UnitEntity } from '../entities/UnitEntity.js';
import { polarOffset } from '../utils/math.js';

const DEFAULT_DEBUG_PASSWORD = 'satest';

export class BattleDebugPanel {
  constructor(game, options = {}) {
    this.game = game;
    this.password = options.password ?? DEFAULT_DEBUG_PASSWORD;
    this.unlocked = false;
    this.statusMessage = '输入密码后启用战斗调试工具';
    this.root = document.createElement('section');
    this.root.className = 'debug-scene-panel battle-debug-panel';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', '战斗调试面板');
    document.body.appendChild(this.root);
    this.renderLocked();

    const signal = game.eventController?.signal;
    this.root.addEventListener('pointerdown', stopDebugEvent, { signal });
    this.root.addEventListener('contextmenu', stopDebugEvent, { signal });
    this.root.addEventListener('click', (event) => this.onClick(event), { signal });
    this.root.addEventListener('submit', (event) => this.onSubmit(event), { signal });
    this.root.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (key !== 'escape' && key !== 'n') return;
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }, { signal });
  }

  isOpen() {
    return !this.root.hidden;
  }

  open() {
    if (this.isOpen()) return;
    this.root.hidden = false;
    document.body.classList.add('is-battle-debug-open');
    window.requestAnimationFrame(() => {
      const focusTarget = this.unlocked
        ? this.root.querySelector('[data-battle-debug-card-select]')
        : this.root.querySelector('[data-battle-debug-password]');
      focusTarget?.focus?.();
    });
  }

  close() {
    this.root.hidden = true;
    document.body.classList.remove('is-battle-debug-open');
  }

  toggle() {
    if (this.isOpen()) this.close();
    else this.open();
  }

  destroy() {
    this.close();
    this.root.remove();
  }

  renderLocked(message = this.statusMessage, isError = false) {
    this.root.classList.add('is-locked');
    this.root.innerHTML = `
      <div class="debug-scene-panel__header battle-debug-panel__header">
        <span class="battle-debug-panel__eyebrow">BATTLE TOOLS</span>
        <strong>战斗调试面板</strong>
        <button class="battle-debug-panel__close" type="button" data-battle-debug-action="close" aria-label="关闭调试面板">×</button>
      </div>
      <form class="battle-debug-password-form" data-battle-debug-password-form>
        <label>
          <span>访问密码</span>
          <input
            data-battle-debug-password
            type="password"
            autocomplete="off"
            spellcheck="false"
            aria-describedby="battle-debug-password-status"
          >
        </label>
        <button type="submit">解锁工具</button>
      </form>
      <p
        id="battle-debug-password-status"
        class="battle-debug-panel__status${isError ? ' is-error' : ''}"
        role="status"
        aria-live="polite"
      >${escapeHtml(message)}</p>
      <small class="battle-debug-panel__hint">按 N 再次关闭</small>
    `;
  }

  renderTools() {
    const isReadOnly = Boolean(this.game.coop?.enabled);
    const disabledAttr = isReadOnly ? ' disabled aria-disabled="true"' : '';
    this.root.classList.remove('is-locked');
    this.root.innerHTML = `
      <div class="debug-scene-panel__header battle-debug-panel__header">
        <span class="battle-debug-panel__eyebrow">BATTLE TOOLS</span>
        <strong>战斗调试面板</strong>
        <button class="battle-debug-panel__close" type="button" data-battle-debug-action="close" aria-label="关闭调试面板">×</button>
        <span data-battle-debug-status>${escapeHtml(isReadOnly ? '联机对局只读，避免破坏 Host 权威状态' : this.statusMessage)}</span>
      </div>
      <label>
        <span>测试卡牌</span>
        <select data-battle-debug-card-select${disabledAttr}>
          ${CARD_DEFINITIONS.filter((card) => !card.retired).map((card) => `
            <option value="${escapeHtml(card.id)}">${escapeHtml(card.name)} / ${escapeHtml(kindLabel(card.kind))}</option>
          `).join('')}
        </select>
      </label>
      <div class="debug-scene-row">
        <label>
          <span>等级</span>
          <input data-battle-debug-card-level type="number" min="1" max="20" step="1" value="1"${disabledAttr}>
        </label>
        <button type="button" data-battle-debug-action="add-card"${disabledAttr}>加入可打出的牌</button>
      </div>
      <div class="debug-scene-row battle-debug-panel__resource-row">
        <button type="button" data-battle-debug-action="max-energy"${disabledAttr}>能量回满</button>
        <button type="button" data-battle-debug-action="add-silver"${disabledAttr}>银币 +100</button>
      </div>
      <div class="debug-scene-row battle-debug-panel__resource-row">
        <button type="button" data-battle-debug-action="reset-camps"${disabledAttr}>重置双方基地</button>
        <button type="button" data-battle-debug-action="clear-enemies"${disabledAttr}>清空敌军</button>
      </div>
      <label>
        <span>敌方单位</span>
        <select data-battle-debug-unit-select${disabledAttr}>
          ${Object.entries(UNIT_DEFINITIONS).map(([type, definition]) => `
            <option value="${escapeHtml(type)}">${escapeHtml(definition.name ?? type)} / ${escapeHtml(type)}</option>
          `).join('')}
        </select>
      </label>
      <div class="debug-scene-row">
        <label>
          <span>数量</span>
          <input data-battle-debug-unit-count type="number" min="1" max="20" step="1" value="1"${disabledAttr}>
        </label>
        <label>
          <span>强度</span>
          <input data-battle-debug-unit-difficulty type="number" min="1" max="20" step="1" value="1"${disabledAttr}>
        </label>
      </div>
      <div class="debug-scene-row">
        <button type="button" data-battle-debug-action="spawn-enemy-camp"${disabledAttr}>敌营生成</button>
        <button type="button" data-battle-debug-action="spawn-enemy-camera"${disabledAttr}>镜头中心生成</button>
      </div>
      <div class="battle-debug-panel__footer">
        <button type="button" data-battle-debug-action="lock">重新锁定</button>
        <span>按 N 关闭</span>
      </div>
    `;
  }

  onSubmit(event) {
    if (!event.target.closest('[data-battle-debug-password-form]')) return;
    event.preventDefault();
    event.stopPropagation();
    const input = this.root.querySelector('[data-battle-debug-password]');
    if (input?.value !== this.password) {
      this.renderLocked('密码错误，请重新输入', true);
      window.requestAnimationFrame(() => this.root.querySelector('[data-battle-debug-password]')?.focus?.());
      return;
    }
    this.unlocked = true;
    this.statusMessage = '调试工具已解锁';
    this.renderTools();
  }

  onClick(event) {
    const button = event.target.closest('[data-battle-debug-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const action = button.dataset.battleDebugAction;
    if (action === 'close') {
      this.close();
      return;
    }
    if (action === 'lock') {
      this.unlocked = false;
      this.statusMessage = '调试工具已锁定';
      this.renderLocked();
      window.requestAnimationFrame(() => this.root.querySelector('[data-battle-debug-password]')?.focus?.());
      return;
    }
    if (!this.unlocked || this.game.coop?.enabled) return;
    if (action === 'add-card') {
      this.addCard();
      return;
    }
    if (action === 'max-energy') {
      this.game.cardSystem?.addEnergy?.(999);
      this.updateStatus('能量已回满');
      return;
    }
    if (action === 'add-silver') {
      this.game.addSilver?.(100);
      this.game.updateHud?.(0);
      this.updateStatus('银币 +100');
      return;
    }
    if (action === 'reset-camps') {
      this.resetCamps();
      return;
    }
    if (action === 'clear-enemies') {
      const count = this.game.enemyUnits?.length ?? 0;
      [...(this.game.enemyUnits ?? [])].forEach((unit) => this.game.removeEnemyUnitSilently?.(unit));
      this.updateStatus(`已清空 ${count} 个敌军`);
      return;
    }
    if (action === 'spawn-enemy-camp' || action === 'spawn-enemy-camera') {
      this.spawnEnemies(action === 'spawn-enemy-camera' ? 'camera' : 'camp');
    }
  }

  addCard() {
    const cardId = this.root.querySelector('[data-battle-debug-card-select]')?.value;
    const definition = CARD_DEFINITIONS.find((card) => card.id === cardId);
    if (!definition) {
      this.updateStatus('没有找到这张卡牌');
      return;
    }
    const level = clampInt(this.root.querySelector('[data-battle-debug-card-level]')?.value, 1, 20);
    const result = this.game.cardSystem?.addDebugCard?.(definition, { level });
    if (!result?.card) {
      this.updateStatus('加入卡牌失败');
      return;
    }
    const locationLabel = result.location === 'temporary'
      ? '临时牌位'
      : result.location === 'draw'
        ? '抽牌堆顶部'
        : '手牌';
    this.updateStatus(`${definition.name} 已加入${locationLabel}`);
  }

  resetCamps() {
    this.game.playerBaseHealthLossProgress = 0;
    [this.game.playerBase, this.game.enemyCamp].forEach((structure) => {
      if (!structure) return;
      structure.alive = true;
      structure.health = structure.maxHealth;
      structure.healthLagRatio = 1;
      structure.healthLagDelay = 0;
    });
    this.game.effects?.spawnRing?.(this.game.playerBase.position, '#9dd8ff', 1.25, 0.5);
    this.game.effects?.spawnRing?.(this.game.enemyCamp.position, '#ffb18a', 1.3, 0.5);
    this.updateStatus('双方基地已重置');
  }

  spawnEnemies(mode) {
    const unitType = this.root.querySelector('[data-battle-debug-unit-select]')?.value;
    const definition = UNIT_DEFINITIONS[unitType];
    if (!definition) {
      this.updateStatus('没有找到这个单位');
      return;
    }
    const count = clampInt(this.root.querySelector('[data-battle-debug-unit-count]')?.value, 1, 20);
    const difficulty = clampInt(this.root.querySelector('[data-battle-debug-unit-difficulty]')?.value, 1, 20);
    const center = mode === 'camera'
      ? this.game.cameraTarget.clone()
      : this.game.enemyCamp.position.clone();
    center.y = 0;
    for (let index = 0; index < count; index += 1) {
      const offset = polarOffset(index, count, 1.1 + (index % 4) * 0.36);
      const position = this.game.resolveWalkablePoint(center.clone().add(offset));
      position.y = this.game.groundHeightAt(position);
      const unit = new UnitEntity({ type: unitType, team: TEAMS.ENEMY, position });
      this.game.applyEnemyDifficulty(unit, this.game.wave, difficulty);
      this.game.applySpiderSpawnTraits(unit, this.game.wave, difficulty, index);
      this.game.initializeSpiderLifecycle(unit);
      this.game.attachUnitStatus(unit);
      this.game.registerUnit(unit);
      this.game.orderEnemyAttack(unit, index, count);
    }
    this.updateStatus(`生成 ${count} 个敌方 ${definition.name ?? unitType}`);
  }

  updateStatus(message) {
    this.statusMessage = message;
    const status = this.root.querySelector('[data-battle-debug-status]');
    if (status) status.textContent = message;
  }
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.floor(Number(value) || min)));
}

function kindLabel(kind) {
  if (kind === 'summon') return '单位';
  if (kind === 'spell') return '法术';
  if (kind === 'building') return '建筑';
  if (kind === 'tactic') return '战术';
  if (kind === 'ability') return '能力';
  return '附魔';
}

function stopDebugEvent(event) {
  event.stopPropagation();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
