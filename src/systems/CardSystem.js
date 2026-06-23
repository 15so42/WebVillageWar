import * as THREE from 'three';
import { basicMat, createReticle } from '../art/lowpoly.js';
import { BALANCE, CARD_DEFINITIONS } from '../data/gameData.js';
import { insideBattlefield } from '../utils/math.js';

const HAND_SIZE = 5;
const INITIAL_ENERGY = 5;
const MAX_ENERGY = 10;
const ENERGY_REGEN_SECONDS = 5;
const DISCARD_DRAG_DISTANCE = 56;

export class CardSystem {
  constructor(game) {
    this.game = game;
    this.cards = CARD_DEFINITIONS;
    this.energy = INITIAL_ENERGY;
    this.energyTimer = 0;
    this.lastRenderedEnergy = -1;
    this.lastRenderedProgress = -1;
    this.drawPile = shuffleCards([...this.cards]);
    this.discardPile = [];
    this.handCards = [];
    this.pendingDrawAnimations = new Set();
    this.drag = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.reticle = createReticle();
    this.game.scene.add(this.reticle);
    this.enchantTargetRing = createReticle();
    this.enchantTargetRing.scale.setScalar(0.78);
    this.game.scene.add(this.enchantTargetRing);
    this.ghost = document.querySelector('#drag-ghost');
    this.hand = document.querySelector('#card-hand');
    this.energyPanel = createEnergyPanel(this.hand);
    this.drawToFullHand();
    this.updateEnergyUi(true);
    this.renderHand();
  }

  update(dt) {
    const previousEnergy = this.energy;
    this.energyTimer += dt;
    while (this.energy < MAX_ENERGY && this.energyTimer >= ENERGY_REGEN_SECONDS) {
      this.energy += 1;
      this.energyTimer -= ENERGY_REGEN_SECONDS;
    }
    if (this.energy >= MAX_ENERGY) {
      this.energyTimer = 0;
    }

    this.updateEnergyUi();
    if (previousEnergy !== this.energy) {
      this.updateCardAffordability();
    }
  }

  renderHand() {
    this.hand.innerHTML = '';
    for (let index = 0; index < HAND_SIZE; index += 1) {
      const card = this.handCards[index];
      if (!card) {
        const emptySlot = document.createElement('div');
        emptySlot.className = 'card-empty-slot';
        this.hand.appendChild(emptySlot);
        continue;
      }

      const element = document.createElement('article');
      element.className = `card${this.pendingDrawAnimations.has(card) ? ' is-drawn' : ''}`;
      element.dataset.cardId = card.id;
      element.dataset.handIndex = String(index);
      element.style.setProperty('--card-color', card.color);
      element.innerHTML = `
        <div class="card-cost">${cardEnergyCost(card)}</div>
        <div class="card-art">${card.label}</div>
        <div class="card-body">
          <div class="card-name">${card.name}</div>
          <div class="card-kind">${kindLabel(card.kind)}</div>
          <div class="card-text">${card.summary}</div>
        </div>
      `;
      element.addEventListener('pointerdown', (event) => this.startDrag(event, card));
      this.hand.appendChild(element);
    }
    this.pendingDrawAnimations.clear();
    this.updateCardAffordability();
  }

  startDrag(event, card) {
    if (event.button !== 0) return;
    if (!this.canSpend(discardEnergyCost(card))) {
      this.flashEnergyPanel();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.drag = {
      card,
      valid: false,
      point: null,
      targetUnit: null,
      startY: event.clientY,
      sourceElement: event.currentTarget
    };
    this.drag.sourceElement?.classList.add('is-dragging');
    this.ghost.textContent = '';
    this.ghost.classList.toggle('enchant-crosshair', card.target === 'friendly-unit');
    this.ghost.hidden = card.target !== 'friendly-unit';
    if (card.target === 'friendly-unit') {
      this.moveGhost(event.clientX, event.clientY);
    }
    document.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('pointerup', this.onPointerUp, { once: true });
    this.updateDrag(event);
  }

  onPointerMove = (event) => {
    this.updateDrag(event);
  };

  onPointerUp = (event) => {
    if (!this.drag) return;
    if (this.isDiscardGesture(event)) {
      this.discardDraggedCard(this.drag);
    } else if (this.drag.valid) {
      this.playDraggedCard(this.drag);
    }
    this.drag.sourceElement?.classList.remove('is-dragging');
    this.drag = null;
    this.reticle.visible = false;
    this.enchantTargetRing.visible = false;
    this.ghost.hidden = true;
    this.ghost.classList.remove('enchant-crosshair', 'is-valid');
    document.removeEventListener('pointermove', this.onPointerMove);
  };

  updateDrag(event) {
    if (!this.drag) return;
    this.drag.screen = {
      x: event.clientX,
      y: event.clientY
    };
    this.pointerFromEvent(event);
    this.raycaster.setFromCamera(this.pointer, this.game.camera);
    const point = this.game.groundPointFromClient(event.clientX, event.clientY);
    this.drag.point = point;
    this.drag.valid = false;
    this.drag.targetUnit = null;
    this.drag.canPayPlay = this.canSpend(cardEnergyCost(this.drag.card));

    if (this.drag.card.target === 'friendly-unit') {
      this.moveGhost(event.clientX, event.clientY);
      const target = this.pickFriendlyUnit();
      this.drag.targetUnit = target;
      this.drag.valid = Boolean(target) && this.drag.canPayPlay;
      this.ghost.classList.toggle('is-valid', this.drag.valid);
      this.showEnchantPreview(target, this.drag.card);
      this.reticle.visible = false;
      return;
    }

    if (!point) {
      this.reticle.visible = false;
      this.enchantTargetRing.visible = false;
      return;
    }

    const validGround =
      insideBattlefield(point, BALANCE.battlefield) && this.game.isPointWalkable(point);
    this.drag.valid = validGround && this.drag.canPayPlay;
    this.showGroundPreview(point, this.drag.card.radius, this.drag.valid, this.drag.card);
    this.enchantTargetRing.visible = false;
  }

  pointerFromEvent(event) {
    const rect = this.game.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  pickFriendlyUnit() {
    const objects = this.game.friendlyUnits.flatMap((unit) => unit.mesh.children);
    const hits = this.raycaster.intersectObjects(objects, true);
    const hit = hits.find((entry) => entry.object.userData.entity?.alive);
    if (hit?.object.userData.entity) {
      return hit.object.userData.entity;
    }

    let best = null;
    let bestDistance = 58;
    this.game.friendlyUnits.forEach((unit) => {
      if (!unit.alive) return;
      const screen = this.game.worldToScreen(unit.position);
      const distance = Math.hypot(screen.x - this.drag.screen.x, screen.y - this.drag.screen.y);
      if (distance < bestDistance) {
        best = unit;
        bestDistance = distance;
      }
    });
    return best;
  }

  showGroundPreview(point, radius, valid, card) {
    this.reticle.visible = true;
    this.reticle.position.set(point.x, point.y + 0.07, point.z);
    this.reticle.scale.setScalar(radius);
    const color = valid ? card.color : '#b8b8b8';
    this.reticle.userData.disc.material = basicMat(color, {
      transparent: true,
      opacity: valid ? 0.2 : 0.1,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.reticle.userData.ring.material = basicMat(valid ? '#fff2c7' : '#c9c9c9', {
      transparent: true,
      opacity: valid ? 0.9 : 0.42,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }

  showEnchantPreview(target, card) {
    this.enchantTargetRing.visible = Boolean(target);
    if (!target) return;
    this.enchantTargetRing.position.set(
      target.position.x,
      target.position.y + 0.12,
      target.position.z
    );
    this.enchantTargetRing.scale.setScalar(0.9);
    this.enchantTargetRing.userData.disc.material = basicMat(card.color, {
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.enchantTargetRing.userData.ring.material = basicMat('#fff2c7', {
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }

  resolveCard(drag) {
    return this.game.cardEffects.resolve(drag);
  }

  moveGhost(x, y) {
    this.ghost.style.left = `${x}px`;
    this.ghost.style.top = `${y}px`;
  }

  playDraggedCard(drag) {
    const cost = cardEnergyCost(drag.card);
    if (!this.canSpend(cost)) {
      this.flashEnergyPanel();
      return false;
    }
    if (!this.resolveCard(drag)) return false;
    this.spendEnergy(cost);
    this.moveCardToDiscard(drag.card);
    return true;
  }

  discardDraggedCard(drag) {
    const cost = discardEnergyCost(drag.card);
    if (!this.canSpend(cost)) {
      this.flashEnergyPanel();
      return false;
    }
    this.spendEnergy(cost);
    this.moveCardToDiscard(drag.card);
    return true;
  }

  moveCardToDiscard(card) {
    const index = this.handCards.indexOf(card);
    if (index === -1) return false;
    this.handCards.splice(index, 1);
    this.discardPile.push(card);
    const replacement = this.drawCard();
    if (replacement) {
      this.pendingDrawAnimations.add(replacement);
      this.handCards.splice(index, 0, replacement);
    }
    this.drawToFullHand({ animate: true });
    this.renderHand();
    return true;
  }

  drawToFullHand({ animate = false } = {}) {
    while (this.handCards.length < HAND_SIZE) {
      const card = this.drawCard();
      if (!card) break;
      if (animate) {
        this.pendingDrawAnimations.add(card);
      }
      this.handCards.push(card);
    }
  }

  drawCard() {
    if (this.drawPile.length === 0 && this.discardPile.length > 0) {
      this.drawPile = shuffleCards(this.discardPile.splice(0));
    }
    return this.drawPile.shift() ?? null;
  }

  spendEnergy(cost) {
    if (!this.canSpend(cost)) return false;
    this.energy -= cost;
    this.updateEnergyUi(true);
    this.updateCardAffordability();
    return true;
  }

  canSpend(cost) {
    return this.energy >= cost;
  }

  isDiscardGesture(event) {
    if (!this.drag) return false;
    const y = event?.clientY ?? this.drag.screen?.y ?? this.drag.startY;
    return y - this.drag.startY >= DISCARD_DRAG_DISTANCE;
  }

  updateCardAffordability() {
    this.hand.querySelectorAll('.card').forEach((element) => {
      const card = this.handCards[Number(element.dataset.handIndex)];
      if (!card) return;
      const canPlay = this.canSpend(cardEnergyCost(card));
      const canDiscard = this.canSpend(discardEnergyCost(card));
      element.setAttribute('aria-disabled', String(!canPlay));
      element.classList.toggle('is-discard-only', !canPlay && canDiscard);
      element.classList.toggle('is-locked', !canDiscard);
    });
  }

  updateEnergyUi(force = false) {
    const progress = this.energy >= MAX_ENERGY ? 1 : this.energyTimer / ENERGY_REGEN_SECONDS;
    const progressStep = Math.round(progress * 100);
    if (!force && this.lastRenderedEnergy === this.energy && this.lastRenderedProgress === progressStep) {
      return;
    }
    this.lastRenderedEnergy = this.energy;
    this.lastRenderedProgress = progressStep;
    const cells = Array.from({ length: MAX_ENERGY }, (_, index) => {
      const filledClass = index < this.energy ? ' is-filled' : '';
      return `<span class="energy-cell${filledClass}"></span>`;
    }).join('');
    this.energyPanel.style.setProperty('--energy-progress', `${progress * 100}%`);
    this.energyPanel.innerHTML = `
      <div class="energy-title">
        <span>能量</span>
        <strong>${this.energy}/${MAX_ENERGY}</strong>
      </div>
      <div class="energy-cells">${cells}</div>
      <div class="energy-progress"><div class="energy-progress-fill"></div></div>
    `;
  }

  flashEnergyPanel() {
    this.energyPanel.classList.remove('is-warning');
    void this.energyPanel.offsetWidth;
    this.energyPanel.classList.add('is-warning');
  }
}

function kindLabel(kind) {
  if (kind === 'summon') return '单位卡';
  if (kind === 'spell') return '法术卡';
  return '附魔卡';
}

function cardEnergyCost(card) {
  return card.energyCost ?? 1;
}

function discardEnergyCost(card) {
  return Math.max(1, Math.ceil(cardEnergyCost(card) * 0.5));
}

function shuffleCards(cards) {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }
  return cards;
}

function createEnergyPanel(hand) {
  const existing = document.querySelector('#energy-panel');
  if (existing) return existing;
  const panel = document.createElement('section');
  panel.id = 'energy-panel';
  panel.className = 'energy-panel';
  panel.setAttribute('aria-label', 'energy');
  hand.before(panel);
  return panel;
}
