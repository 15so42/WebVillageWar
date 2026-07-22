import { CARD_DEFINITIONS, LEVEL_DEFINITIONS, TEAMS, UNIT_DEFINITIONS } from '../data/gameData.js';
import { UnitEntity } from '../entities/UnitEntity.js';
import { polarOffset } from '../utils/math.js';
import { Game } from './Game.js';

export function createDebugSession() {
  const baseLevel = LEVEL_DEFINITIONS.find((level) => level.id === 'snow-valley')
    ?? LEVEL_DEFINITIONS[0]
    ?? {};
  const deck = CARD_DEFINITIONS
    .filter((card) => !card.lootOnly)
    .map((card, index) => ({
      ...card,
      level: card.level ?? 1,
      instanceId: `debug-deck-${card.id}-${index}`
    }));

  return {
    level: {
      ...baseLevel,
      id: 'debug-scene',
      name: 'Debug 场景',
      subtitle: '任意卡牌、敌方单位与敌营测试场',
      baseReward: 0,
      targetTime: 99999,
      baseDifficulty: 1,
      enemyPool: []
    },
    difficulty: 1,
    deck,
    debug: true,
    startedAt: Date.now()
  };
}

export class DebugScene extends Game {
  constructor(options = {}) {
    super({
      ...options,
      session: options.session ?? createDebugSession()
    });
    this.waveTimer = Number.POSITIVE_INFINITY;
    this.clearDebugEnemies();
    this.createDebugPanel();
    this.updateDebugPanelStatus('Debug 场景已准备好');
    window.__VILLAGE_WAR_DEBUG__.addCard = (cardId, level = 1) => this.addDebugCard(cardId, level);
    window.__VILLAGE_WAR_DEBUG__.spawnEnemy = (unitType, count = 1) => this.spawnDebugEnemy(unitType, count);
  }

  clearDebugEnemies() {
    [...this.enemyUnits].forEach((unit) => this.removeEnemyUnitSilently(unit));
  }

  createDebugPanel() {
    this.debugPanel = document.createElement('section');
    this.debugPanel.className = 'debug-scene-panel';
    this.debugPanel.setAttribute('aria-label', 'Debug 场景控制台');
    this.debugPanel.innerHTML = `
      <div class="debug-scene-panel__header">
        <strong>Debug 场景</strong>
        <span data-debug-status>输入命令测试卡牌与敌人</span>
      </div>
      <label>
        <span>卡牌</span>
        <select data-debug-card-select>
          ${CARD_DEFINITIONS.map((card) => `
            <option value="${escapeHtml(card.id)}">${escapeHtml(card.name)} / ${escapeHtml(kindLabel(card.kind))}</option>
          `).join('')}
        </select>
      </label>
      <div class="debug-scene-row">
        <label>
          <span>等级</span>
          <input data-debug-card-level type="number" min="1" max="20" step="1" value="1">
        </label>
        <button type="button" data-debug-action="add-card">加入可打出的牌</button>
      </div>
      <div class="debug-scene-row">
        <button type="button" data-debug-action="max-energy">能量回满</button>
        <button type="button" data-debug-action="reset-camps">重置双方基地</button>
      </div>
      <label>
        <span>敌方单位</span>
        <select data-debug-unit-select>
          ${Object.entries(UNIT_DEFINITIONS).map(([type, definition]) => `
            <option value="${escapeHtml(type)}">${escapeHtml(definition.name ?? type)} / ${escapeHtml(type)}</option>
          `).join('')}
        </select>
      </label>
      <div class="debug-scene-row">
        <label>
          <span>数量</span>
          <input data-debug-unit-count type="number" min="1" max="20" step="1" value="1">
        </label>
        <label>
          <span>强度</span>
          <input data-debug-unit-difficulty type="number" min="1" max="20" step="1" value="1">
        </label>
      </div>
      <div class="debug-scene-row">
        <button type="button" data-debug-action="spawn-enemy-camp">敌营生成</button>
        <button type="button" data-debug-action="spawn-enemy-camera">镜头中心生成</button>
      </div>
    `;
    document.body.appendChild(this.debugPanel);
    const signal = this.eventController.signal;
    this.debugPanel.addEventListener('pointerdown', stopDebugEvent, { signal });
    this.debugPanel.addEventListener('contextmenu', stopDebugEvent, { signal });
    this.debugPanel.addEventListener('click', (event) => this.onDebugPanelClick(event), { signal });
  }

  onDebugPanelClick(event) {
    const actionTarget = event.target.closest('[data-debug-action]');
    if (!actionTarget) return;
    event.preventDefault();
    event.stopPropagation();
    const action = actionTarget.dataset.debugAction;
    if (action === 'add-card') {
      const cardId = this.debugPanel.querySelector('[data-debug-card-select]')?.value;
      const level = Number(this.debugPanel.querySelector('[data-debug-card-level]')?.value) || 1;
      this.addDebugCard(cardId, level);
      return;
    }
    if (action === 'max-energy') {
      const missingEnergy = 10 - (this.cardSystem?.energy ?? 0);
      this.cardSystem?.addEnergy?.(missingEnergy);
      this.updateDebugPanelStatus('能量已回满');
      return;
    }
    if (action === 'reset-camps') {
      this.resetDebugStructures();
      return;
    }
    if (action === 'spawn-enemy-camp' || action === 'spawn-enemy-camera') {
      const unitType = this.debugPanel.querySelector('[data-debug-unit-select]')?.value;
      const count = Number(this.debugPanel.querySelector('[data-debug-unit-count]')?.value) || 1;
      const difficulty = Number(this.debugPanel.querySelector('[data-debug-unit-difficulty]')?.value) || 1;
      const mode = action === 'spawn-enemy-camera' ? 'camera' : 'camp';
      this.spawnDebugEnemy(unitType, count, {
        mode,
        difficulty
      });
    }
  }

  addDebugCard(cardId, level = 1) {
    const definition = CARD_DEFINITIONS.find((card) => card.id === cardId);
    if (!definition) {
      this.updateDebugPanelStatus('没有找到这张卡牌');
      return null;
    }
    const result = this.cardSystem.addDebugCard(definition, {
      level
    });
    const locationLabel = result.location === 'temporary'
      ? '临时牌位'
      : result.location === 'draw'
        ? '抽牌堆顶部'
        : '手牌';
    this.updateDebugPanelStatus(`${definition.name} 已加入${locationLabel}`);
    return result.card;
  }

  spawnDebugEnemy(unitType, count = 1, options = {}) {
    const definition = UNIT_DEFINITIONS[unitType];
    if (!definition) {
      this.updateDebugPanelStatus('没有找到这个单位');
      return [];
    }
    const spawnCount = Math.max(1, Math.min(20, Math.floor(Number(count) || 1)));
    const difficulty = Math.max(1, Math.floor(Number(options.difficulty) || 1));
    const center = options.mode === 'camera'
      ? this.cameraTarget.clone()
      : this.enemyCamp.position.clone();
    center.y = 0;
    const spawnedUnits = [];
    for (let i = 0; i < spawnCount; i += 1) {
      const offset = polarOffset(i, spawnCount, 1.1 + (i % 4) * 0.36);
      const position = this.resolveWalkablePoint(center.clone().add(offset));
      position.y = this.groundHeightAt(position);
      const unit = new UnitEntity({
        type: unitType,
        team: TEAMS.ENEMY,
        position
      });
      this.applyEnemyDifficulty(unit, this.wave, difficulty);
      this.applySpiderSpawnTraits(unit, this.wave, difficulty, i);
      this.initializeSpiderLifecycle(unit);
      this.attachUnitStatus(unit);
      this.registerUnit(unit);
      this.orderEnemyAttack(unit, i, spawnCount);
      spawnedUnits.push(unit);
    }
    this.updateDebugPanelStatus(`生成 ${spawnCount} 个敌方 ${definition.name ?? unitType}`);
    return spawnedUnits;
  }

  resetDebugStructures() {
    [this.playerBase, this.enemyCamp].forEach((structure) => {
      structure.alive = true;
      structure.health = structure.maxHealth;
      structure.healthLagRatio = 1;
      structure.healthLagDelay = 0;
    });
    this.effects.spawnRing(this.playerBase.position, '#9dd8ff', 1.25, 0.5);
    this.effects.spawnRing(this.enemyCamp.position, '#ffb18a', 1.3, 0.5);
    this.updateDebugPanelStatus('双方基地已重置');
  }

  checkLevelEnd() {
    // Debug 场景不自动结算胜负，方便反复测试基地、单位和卡牌。
  }

  destroy() {
    this.debugPanel?.remove();
    super.destroy();
  }

  updateDebugPanelStatus(message) {
    const status = this.debugPanel?.querySelector('[data-debug-status]');
    if (status) status.textContent = message;
  }
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
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
