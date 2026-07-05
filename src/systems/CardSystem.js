import * as THREE from 'three';
import { basicMat, createReticle } from '../art/lowpoly.js';
import { BALANCE, CARD_DEFINITIONS } from '../data/gameData.js';
import { insideBattlefield } from '../utils/math.js';
import { disposeObject3D } from '../utils/dispose.js';

const HAND_SIZE = 5;
const INITIAL_ENERGY = 5;
const MAX_ENERGY = 10;
const ENERGY_REGEN_SECONDS = 5;
const ENERGY_REGEN_PER_SECOND = 1 / ENERGY_REGEN_SECONDS;
const TEMPORARY_CARD_LIMIT = 3;
const PLAY_DRAG_RATIO = 0.5;
const DISCARD_DRAG_RATIO = 0.3;
const PLAY_DRAG_MIN_DISTANCE = 24;
const DISCARD_FALL_DELAY_MS = 500;
const CARD_USAGE_HINT = '上滑使用 / 下滑丢弃';
const CARD_KIND_COLORS = {
  summon: '#4f7d64',
  enchant: '#8a6fc4',
  spell: '#3f7fa7',
  building: '#8b6840',
  tactic: '#6f718a',
  ability: '#5f8f9f'
};
const DEFAULT_CARD_USES = {
  summon: 4,
  building: 2,
  tactic: 2,
  spell: 2,
  enchant: 2,
  ability: 1
};
const CARD_RANGE_DISC_RENDER_ORDER = 62;
const CARD_RANGE_RING_RENDER_ORDER = 63;

export class CardSystem {
  constructor(game, options = {}) {
    this.game = game;
    this.cards = normalizeDeck(options.deck ?? CARD_DEFINITIONS);
    this.energy = INITIAL_ENERGY;
    this.energyTimer = 0;
    this.lastRenderedEnergy = -1;
    this.lastRenderedProgress = -1;
    this.drawPile = options.startWithEmptyDrawPile ? [] : shuffleCards([...this.cards]);
    this.discardPile = [];
    this.handCards = [];
    this.temporaryCards = [];
    this.runtimeCardLevelBonuses = new Map();
    this.pendingDrawAnimations = new Set();
    this.drag = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.reticle = createReticle();
    this.game.scene.add(this.reticle);
    this.deploymentRangeGroup = new THREE.Group();
    this.deploymentRangeGroup.visible = false;
    this.deploymentRangeSignature = '';
    this.game.scene.add(this.deploymentRangeGroup);
    this.deploymentDimPlane = createDeploymentDimPlane();
    this.game.scene.add(this.deploymentDimPlane);
    this.enchantTargetRing = createReticle();
    this.enchantTargetRing.scale.setScalar(0.78);
    this.game.scene.add(this.enchantTargetRing);
    this.ghost = document.querySelector('#drag-ghost');
    this.hand = document.querySelector('#card-hand');
    this.energyPanel = createEnergyPanel(this.hand);
    this.temporarySlot = createTemporaryCardSlot(this.energyPanel);
    this.energyParts = collectEnergyPanel(this.energyPanel);
    this.abilityIcons = this.energyParts.abilities;
    this.hintPanel = createGameHintPanel(this.energyPanel);
    this.hintOwner = null;
    this.activePileViewer = null;
    this.pileUi = createPileUi();
    this.bindPileUi();
    if (!options.startWithEmptyDrawPile) {
      this.drawToFullHand();
    }
    this.updateEnergyUi(true);
    this.renderHand();
    this.renderTemporaryCards();
    this.updatePileUi();
  }

  update(dt) {
    const previousEnergy = this.energy;
    if (this.energy < MAX_ENERGY) {
      this.energy = Math.min(MAX_ENERGY, this.energy + Math.max(0, dt) * ENERGY_REGEN_PER_SECOND);
    }
    if (this.energy >= MAX_ENERGY) {
      this.energyTimer = 0;
    } else {
      this.energyTimer = (this.energy % 1) * ENERGY_REGEN_SECONDS;
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
        this.hand.appendChild(this.createEmptySlot());
        continue;
      }

      this.hand.appendChild(
        this.createCardElement(card, index, {
          isDrawn: this.pendingDrawAnimations.has(card),
          location: 'hand'
        })
      );
    }
    this.pendingDrawAnimations.clear();
    this.updateCardAffordability();
  }

  renderTemporaryCards() {
    if (!this.temporarySlot) return;
    this.temporarySlot.innerHTML = '';
    if (this.temporaryCards.length > 0) {
      this.temporarySlot.classList.add('has-temporary-card');
      this.temporaryCards.forEach((card, index) => {
        this.temporarySlot.appendChild(this.createTemporaryCardElement(card, index));
        this.pendingDrawAnimations.delete(card);
      });
    } else {
      this.temporarySlot.classList.remove('has-temporary-card');
    }
    this.updateCardAffordability();
  }

  createCardElement(card, index, { isDrawn = false, location = 'hand' } = {}) {
    const element = document.createElement('article');
    const temporaryClass = location === 'temporary' ? ' is-temporary-card' : '';
    element.className = `card${temporaryClass}${isDrawn ? ' is-drawn' : ''}`;
    element.dataset.cardId = card.id;
    element.dataset.cardLocation = location;
    if (location === 'hand') {
      element.dataset.handIndex = String(index);
    }
    element.style.setProperty('--card-color', cardThemeColor(card));
    element.innerHTML = `
      <div class="card-cost">${cardEnergyCost(card)}</div>
      <div class="card-level">Lv.${card.level ?? 1}</div>
      ${createCardUseBarMarkup(card, 'card')}
      ${shouldExhaustAfterPlay(card) ? '<div class="card-keyword">消耗</div>' : ''}
      <div class="card-face">
        <div class="card-header">
          <div class="card-rune">${card.label}</div>
          <div class="card-kind">${kindLabel(card.kind)}</div>
        </div>
        ${createCardArtMarkup(card)}
        <div class="card-name">${card.name}</div>
        <div class="card-text">${card.summary}</div>
      </div>
    `;
    fitCardElementText(element);
    bindScrollableCardText(element);
    if (isDrawn) {
      scheduleDrawnClassCleanup(element);
    }
    element.addEventListener('pointerenter', () => this.setHint(CARD_USAGE_HINT, 'card-hover'));
    element.addEventListener('pointerleave', () => this.clearHint('card-hover'));
    element.addEventListener('pointerdown', (event) => this.startDrag(event, card));
    return element;
  }

  createTemporaryCardElement(card, index) {
    const element = this.createCardElement(card, -1, {
      isDrawn: this.pendingDrawAnimations.has(card),
      location: 'temporary'
    });
    element.dataset.temporaryIndex = String(index);
    return element;
  }

  createEmptySlot() {
    const emptySlot = document.createElement('div');
    emptySlot.className = 'card-empty-slot';
    return emptySlot;
  }

  replaceHandSlot(index, element) {
    const current = this.hand.children[index];
    if (!current) return false;
    current.replaceWith(element);
    return true;
  }

  bindPileUi() {
    const { root, viewer, drawButton, discardButton, closeButton } = this.pileUi;
    [root, viewer].forEach((element) => {
      element.addEventListener('pointerdown', stopUiEvent);
      element.addEventListener('contextmenu', stopUiEvent);
    });
    drawButton.addEventListener('click', (event) => {
      stopUiEvent(event);
      this.openPileViewer('draw');
    });
    discardButton.addEventListener('click', (event) => {
      stopUiEvent(event);
      this.openPileViewer('discard');
    });
    closeButton.addEventListener('click', (event) => {
      stopUiEvent(event);
      this.closePileViewer();
    });
    viewer.addEventListener('click', (event) => {
      if (event.target === viewer) this.closePileViewer();
    });
  }

  openPileViewer(type) {
    this.refillDrawPileFromDiscardIfNeeded();
    this.activePileViewer = type;
    this.renderPileViewer(type);
    this.pileUi.viewer.hidden = false;
    this.pileUi.viewer.dataset.pile = type;
    document.addEventListener('keydown', this.onPileViewerKeyDown);
    this.updatePileUi({ renderViewer: false });
  }

  closePileViewer() {
    this.activePileViewer = null;
    this.pileUi.viewer.hidden = true;
    this.pileUi.viewerGrid.innerHTML = '';
    document.removeEventListener('keydown', this.onPileViewerKeyDown);
  }

  onPileViewerKeyDown = (event) => {
    if (event.key === 'Escape') this.closePileViewer();
  };

  renderPileViewer(type = this.activePileViewer) {
    if (!type) return;
    const cards = type === 'draw' ? this.drawPile : this.discardPile;
    const title = type === 'draw' ? '抽牌堆' : '弃牌堆';
    this.pileUi.viewerTitle.textContent = title;
    this.pileUi.viewerCount.textContent = `${cards.length}`;
    this.pileUi.viewerGrid.innerHTML = '';

    if (cards.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pile-viewer-empty';
      empty.textContent = '空';
      this.pileUi.viewerGrid.appendChild(empty);
      return;
    }

    cards.forEach((card, index) => {
      this.pileUi.viewerGrid.appendChild(createPileCardElement(card, index));
    });
  }

  updatePileUi({ renderViewer = true } = {}) {
    if (!this.pileUi) return;
    this.pileUi.drawCount.textContent = String(this.drawPile.length);
    this.pileUi.discardCount.textContent = String(this.discardPile.length);
    this.pileUi.drawButton.classList.toggle('is-empty', this.drawPile.length === 0);
    this.pileUi.discardButton.classList.toggle('is-empty', this.discardPile.length === 0);
    if (renderViewer && this.activePileViewer) {
      this.renderPileViewer(this.activePileViewer);
    }
  }

  startDrag(event, card) {
    if (event.button !== 0) return;
    if (!this.canSpend(cardEnergyCost(card)) && !this.canSpend(discardEnergyCost(card))) {
      this.flashEnergyPanel();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.drag = {
      card,
      sourceLocation: event.currentTarget.dataset.cardLocation ?? 'hand',
      valid: false,
      point: null,
      targetUnit: null,
      targetCard: null,
      mode: 'idle',
      startX: event.clientX,
      startY: event.clientY,
      sourceHeight: event.currentTarget.getBoundingClientRect().height,
      sourceElement: event.currentTarget
    };
    this.drag.playThreshold = this.drag.sourceHeight * PLAY_DRAG_RATIO;
    this.drag.discardThreshold = this.drag.sourceHeight * DISCARD_DRAG_RATIO;
    this.drag.sourceElement?.classList.add('is-dragging');
    this.prepareDragGhost(event.currentTarget, card);
    this.ghost.classList.toggle('enchant-crosshair', card.target === 'friendly-unit');
    this.ghost.hidden = true;
    this.updateDraggedCardMotion(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('pointerup', this.onPointerUp, { once: true });
    this.updateDeploymentRangePreview(card, false);
    this.updateDrag(event);
  }

  onPointerMove = (event) => {
    this.updateDrag(event);
  };

  onPointerUp = (event) => {
    if (!this.drag) return;
    this.updateDrag(event);
    const drag = this.drag;
    const shouldDiscard = drag.mode === 'discard' && drag.canPayDiscard;
    const shouldPlay = drag.mode === 'play' && drag.valid;
    if (shouldDiscard) {
      this.cleanupDrag(event, { preserveSourceElement: true });
      this.discardDraggedCard(drag);
    } else if (shouldPlay) {
      this.cleanupDrag(event);
      this.playDraggedCard(drag);
    } else {
      this.cleanupDrag(event);
    }
  };

  updateDrag(event) {
    if (!this.drag) return;
    this.updateDraggedCardMotion(event);
    this.drag.screen = {
      x: event.clientX,
      y: event.clientY
    };
    this.drag.valid = false;
    this.drag.targetUnit = null;
    this.drag.targetCard = null;
    this.drag.canPayPlay = this.canSpend(cardEnergyCost(this.drag.card));
    this.drag.canPayDiscard = this.canSpend(discardEnergyCost(this.drag.card));
    this.drag.mode = this.resolveDragMode(event);
    this.clearHandCardTargetHighlights();
    this.drag.sourceElement?.classList.toggle(
      'is-discard-ready',
      this.drag.mode === 'discard' && this.drag.canPayDiscard
    );
    this.updateDeploymentRangePreview(this.drag.card, this.drag.mode === 'play');

    if (this.drag.mode !== 'play') {
      this.drag.point = null;
      this.reticle.visible = false;
      this.enchantTargetRing.visible = false;
      this.ghost.hidden = true;
      this.ghost.classList.remove('is-valid');
      this.clearHint('card-drag');
      return;
    }

    if (this.drag.card.target === 'hand-card') {
      this.moveGhost(event.clientX, event.clientY);
      this.ghost.hidden = false;
      this.drag.point = null;
      this.reticle.visible = false;
      this.enchantTargetRing.visible = false;
      const target = this.pickHandCardTarget(event.clientX, event.clientY);
      this.drag.targetCard = target?.card ?? null;
      this.drag.valid = Boolean(target?.card) && this.drag.canPayPlay;
      target?.element?.classList.toggle('is-hand-card-target', this.drag.valid);
      this.ghost.classList.toggle('is-valid', this.drag.valid);
      return;
    }

    if (this.drag.card.target === 'none' || this.drag.card.kind === 'tactic') {
      this.moveGhost(event.clientX, event.clientY);
      this.ghost.hidden = false;
      this.drag.point = null;
      this.reticle.visible = false;
      this.enchantTargetRing.visible = false;
      this.drag.valid = this.drag.canPayPlay;
      this.ghost.classList.toggle('is-valid', this.drag.valid);
      return;
    }

    this.pointerFromEvent(event);
    this.raycaster.setFromCamera(this.pointer, this.game.camera);
    const point = this.game.groundPointFromClient(event.clientX, event.clientY);
    this.drag.point = point;

    if (this.drag.card.target === 'friendly-unit') {
      this.moveGhost(event.clientX, event.clientY);
      this.ghost.hidden = false;
      const target = this.pickFriendlyUnit();
      this.drag.targetUnit = target;
      this.drag.valid = Boolean(target) && target.canReceiveBuffs !== false && this.drag.canPayPlay;
      this.ghost.classList.toggle('is-valid', this.drag.valid);
      this.showEnchantPreview(target, this.drag.card);
      this.reticle.visible = false;
      return;
    }

    if (!point) {
      this.reticle.visible = false;
      this.enchantTargetRing.visible = false;
      this.updateGroundDragHint(this.drag.card, false);
      return;
    }

    const validGround =
      insideBattlefield(point, BALANCE.battlefield) &&
      this.game.isPointWalkable(point) &&
      this.isValidGroundCardPoint(this.drag.card, point);
    this.drag.valid = validGround && this.drag.canPayPlay;
    this.showGroundPreview(point, this.drag.card.radius, this.drag.valid, this.drag.card);
    this.enchantTargetRing.visible = false;
    this.updateGroundDragHint(this.drag.card, this.drag.valid, {
      canPay: this.drag.canPayPlay
    });
  }

  pointerFromEvent(event) {
    const rect = this.game.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  pickFriendlyUnit() {
    const objects = this.game.friendlyUnits.flatMap((unit) => unit.mesh.children);
    const hits = this.raycaster.intersectObjects(objects, true);
    const hit = hits.find((entry) => {
      const entity = entry.object.userData.entity;
      return entity?.alive && entity.canReceiveBuffs !== false;
    });
    if (hit?.object.userData.entity) {
      return hit.object.userData.entity;
    }

    let best = null;
    let bestDistance = 58;
    this.game.friendlyUnits.forEach((unit) => {
      if (!unit.alive || unit.canReceiveBuffs === false) return;
      const screen = this.game.worldToScreen(unit.position);
      const distance = Math.hypot(screen.x - this.drag.screen.x, screen.y - this.drag.screen.y);
      if (distance < bestDistance) {
        best = unit;
        bestDistance = distance;
      }
    });
    return best;
  }

  pickHandCardTarget(x, y) {
    const element = document.elementFromPoint(x, y)?.closest?.('.card[data-card-location="hand"]');
    if (!element || element === this.drag?.sourceElement) return null;
    const index = Number(element.dataset.handIndex);
    const card = this.handCards[index];
    if (!card || card === this.drag?.card) return null;
    return { card, element, index };
  }

  clearHandCardTargetHighlights() {
    this.hand?.querySelectorAll('.card.is-hand-card-target').forEach((element) => {
      element.classList.remove('is-hand-card-target');
    });
  }

  showGroundPreview(point, radius, valid, card) {
    this.reticle.visible = true;
    this.reticle.position.set(point.x, point.y + 0.1, point.z);
    this.reticle.scale.setScalar(radius);
    const color = valid ? card.color : '#b8b8b8';
    this.reticle.userData.disc.material = basicMat(color, {
      transparent: true,
      opacity: valid ? 0.2 : 0.1,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    this.reticle.userData.ring.material = basicMat(valid ? '#fff2c7' : '#c9c9c9', {
      transparent: true,
      opacity: valid ? 0.9 : 0.42,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    this.reticle.userData.disc.renderOrder = CARD_RANGE_DISC_RENDER_ORDER;
    this.reticle.userData.ring.renderOrder = CARD_RANGE_RING_RENDER_ORDER;
  }

  updateDeploymentRangePreview(card, visible) {
    const anchors = visible ? this.deploymentAnchorsForCard(card) : [];
    if (!anchors.length) {
      this.clearDeploymentRangePreview();
      return;
    }
    const signature = anchors
      .map((anchor) => `${anchor.kind}:${Math.round(anchor.position.x * 10)}:${Math.round(anchor.position.z * 10)}:${Math.round(anchor.radius * 10)}`)
      .join('|');
    if (signature === this.deploymentRangeSignature) {
      this.deploymentRangeGroup.visible = true;
      return;
    }

    this.clearDeploymentRangePreview();
    anchors.forEach((anchor) => {
      const range = createReticle();
      range.visible = true;
      range.position.set(anchor.position.x, anchor.position.y + 0.045, anchor.position.z);
      range.scale.setScalar(anchor.radius);
      range.userData.disc.material = basicMat(anchor.color, {
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false
      }).clone();
      range.userData.ring.material = basicMat(anchor.ringColor, {
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false
      }).clone();
      range.userData.disc.renderOrder = CARD_RANGE_DISC_RENDER_ORDER;
      range.userData.ring.renderOrder = CARD_RANGE_RING_RENDER_ORDER;
      this.deploymentRangeGroup.add(range);
    });
    this.deploymentRangeSignature = signature;
    this.deploymentRangeGroup.visible = true;
    this.deploymentDimPlane.visible = true;
  }

  deploymentAnchorsForCard(card) {
    if (card.kind === 'summon') {
      return (this.game.getSummonDeploymentAnchors?.() ?? []).map((anchor) => ({
        ...anchor,
        kind: 'summon',
        color: '#6adbb8',
        ringColor: '#c6ffea'
      }));
    }
    if (card.kind === 'building' && (card.unitType === 'beacon' || card.effect?.unitType === 'beacon')) {
      return (this.game.getBeaconPlacementAnchors?.() ?? []).map((anchor) => ({
        ...anchor,
        kind: 'beacon',
        color: '#f0c575',
        ringColor: '#fff2c7'
      }));
    }
    return [];
  }

  clearDeploymentRangePreview() {
    if (!this.deploymentRangeGroup) return;
    this.deploymentRangeGroup.children.forEach((child) => {
      disposeObject3D(child, { materials: true });
    });
    this.deploymentRangeGroup.clear();
    this.deploymentRangeGroup.visible = false;
    this.deploymentRangeSignature = '';
    if (this.deploymentDimPlane) this.deploymentDimPlane.visible = false;
  }

  updateGroundDragHint(card, valid, options = {}) {
    if (options.canPay === false) {
      this.setHint('能量不足，无法使用这张卡。', 'card-drag');
      return;
    }
    if (card.kind === 'summon') {
      this.setHint(
        valid ? '可派遣：单位只能部署在基地或信标范围内。' : '只能在基地或信标范围内派遣单位。',
        'card-drag'
      );
      return;
    }
    if (card.kind === 'building' && (card.unitType === 'beacon' || card.effect?.unitType === 'beacon')) {
      this.setHint(
        valid ? '可放置信标：之后可在信标周围派遣单位。' : '信标只能放在友方非建筑单位附近。',
        'card-drag'
      );
    }
  }

  isValidGroundCardPoint(card, point) {
    if (card.kind === 'summon') {
      return this.game.canDeploySummonAt?.(point) ?? true;
    }
    if (card.kind === 'building' && (card.unitType === 'beacon' || card.effect?.unitType === 'beacon')) {
      return this.game.canPlaceBeaconAt?.(point) ?? true;
    }
    return true;
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
      depthTest: false,
      depthWrite: false
    });
    this.enchantTargetRing.userData.ring.material = basicMat('#fff2c7', {
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    this.enchantTargetRing.userData.disc.renderOrder = CARD_RANGE_DISC_RENDER_ORDER;
    this.enchantTargetRing.userData.ring.renderOrder = CARD_RANGE_RING_RENDER_ORDER;
  }

  resolveCard(drag) {
    return this.game.cardEffects.resolve(drag);
  }

  moveGhost(x, y) {
    this.ghost.style.left = `${x}px`;
    this.ghost.style.top = `${y}px`;
  }

  prepareDragGhost(sourceElement, card) {
    this.ghost.textContent = '';
    this.ghost.classList.remove('has-card-preview');
    if (!shouldUseCardFaceGhost(card) || !sourceElement) return;
    const clone = sourceElement.cloneNode(true);
    clone.classList.remove(
      'is-dragging',
      'is-discard-ready',
      'is-discard-only',
      'is-locked',
      'is-drawn',
      'is-hand-card-target'
    );
    clone.classList.add('drag-ghost-card');
    clone.removeAttribute('data-hand-index');
    clone.removeAttribute('data-temporary-index');
    clone.setAttribute('aria-hidden', 'true');
    clone.style.removeProperty('--card-drag-y');
    clone.style.removeProperty('--card-drag-rotate');
    this.ghost.classList.add('has-card-preview');
    this.ghost.appendChild(clone);
  }

  updateDraggedCardMotion(event) {
    if (!this.drag?.sourceElement) return;
    const deltaY = Math.max(0, event.clientY - this.drag.startY);
    const cappedY = Math.max(
      0,
      Math.min(this.drag.sourceHeight * 0.62, deltaY)
    );
    const tilt = Math.max(-5, Math.min(5, cappedY / 18));
    this.drag.sourceElement.style.setProperty('--card-drag-y', `${cappedY}px`);
    this.drag.sourceElement.style.setProperty('--card-drag-rotate', `${tilt}deg`);
  }

  resolveDragMode(event) {
    if (!this.drag) return 'idle';
    const deltaY = event.clientY - this.drag.startY;
    if (deltaY >= this.drag.discardThreshold) return 'discard';
    const targetsHandCard = this.drag.card?.target === 'hand-card';
    if (!targetsHandCard && this.isPointerBlockedByCardUi(event.clientX, event.clientY)) {
      return 'idle';
    }
    if (deltaY <= -this.drag.playThreshold) return 'play';
    const distance = Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY);
    if (distance < PLAY_DRAG_MIN_DISTANCE) return 'idle';
    if (targetsHandCard) return 'play';
    return 'play';
  }

  isPointerBlockedByCardUi(x, y) {
    const element = document.elementFromPoint(x, y);
    const blocker = element?.closest?.(
      '.card, .card-empty-slot, .temporary-card-empty-slot, .energy-panel, .card-pile-dock, .pile-viewer'
    );
    return Boolean(blocker);
  }

  cleanupDrag(event, { preserveSourceElement = false } = {}) {
    const drag = this.drag;
    if (!drag) return;
    drag.sourceElement?.releasePointerCapture?.(event.pointerId);
    if (!preserveSourceElement) {
      drag.sourceElement?.classList.remove('is-dragging', 'is-discard-ready');
      drag.sourceElement?.style.removeProperty('--card-drag-y');
      drag.sourceElement?.style.removeProperty('--card-drag-rotate');
    }
    this.drag = null;
    this.reticle.visible = false;
    this.enchantTargetRing.visible = false;
    this.clearDeploymentRangePreview();
    this.ghost.hidden = true;
    this.ghost.classList.remove('enchant-crosshair', 'is-valid', 'has-card-preview');
    this.ghost.textContent = '';
    this.clearHint('card-drag');
    this.clearHandCardTargetHighlights();
    document.removeEventListener('pointermove', this.onPointerMove);
  }

  playDraggedCard(drag) {
    const cost = cardEnergyCost(drag.card);
    if (!this.canSpend(cost)) {
      this.flashEnergyPanel();
      return false;
    }
    if (!this.resolveCard(drag)) return false;
    this.spendEnergy(cost);
    this.game.abilities?.onCardPlayed(drag.card, drag);
    this.consumeCardUse(drag.card);
    this.moveCardToDiscard(drag.card);
    return true;
  }

  discardDraggedCard(drag) {
    const cost = discardEnergyCost(drag.card);
    if (!this.canSpend(cost)) {
      this.flashEnergyPanel();
      return false;
    }
    if (drag.sourceLocation === 'temporary') {
      const index = this.temporaryCards.indexOf(drag.card);
      if (index === -1) return false;
      this.spendEnergy(cost);
      this.startTemporaryDiscardFall(drag, index);
      return true;
    }
    const index = this.handCards.indexOf(drag.card);
    if (index === -1) return false;
    this.spendEnergy(cost);
    this.startDiscardFall(drag, index);
    return true;
  }

  startTemporaryDiscardFall(drag, index) {
    const sourceElement = drag.sourceElement;
    const fallingElement = sourceElement
      ? this.createDiscardFallingElement(sourceElement)
      : null;
    this.temporaryCards.splice(index, 1);
    this.renderTemporaryCards();

    let fallingAnimation = null;
    if (fallingElement) {
      document.body.appendChild(fallingElement);
      fallingAnimation = this.animateDiscardFallingElement(fallingElement);
    }

    window.setTimeout(() => {
      fallingAnimation?.cancel();
      fallingElement?.remove();
      this.updateCardAffordability();
      this.updatePileUi();
    }, DISCARD_FALL_DELAY_MS);
  }

  startDiscardFall(drag, index) {
    const card = drag.card;
    this.handCards[index] = null;
    this.discardPile.push(card);
    this.refillDrawPileFromDiscardIfNeeded();
    this.updatePileUi();

    const sourceElement = drag.sourceElement;
    const fallingElement = sourceElement
      ? this.createDiscardFallingElement(sourceElement)
      : null;

    if (sourceElement?.parentElement === this.hand) {
      sourceElement.replaceWith(this.createEmptySlot());
    } else if (!this.replaceHandSlot(index, this.createEmptySlot())) {
      this.renderHand();
    }

    let fallingAnimation = null;
    if (fallingElement) {
      document.body.appendChild(fallingElement);
      fallingAnimation = this.animateDiscardFallingElement(fallingElement);
    }

    window.setTimeout(() => {
      fallingAnimation?.cancel();
      fallingElement?.remove();
      const replacement = this.drawCard();
      let replacementElement = this.createEmptySlot();
      if (replacement) {
        this.handCards[index] = replacement;
        replacementElement = this.createCardElement(replacement, index, { isDrawn: true });
      }
      if (!this.replaceHandSlot(index, replacementElement)) {
        if (replacement) this.pendingDrawAnimations.add(replacement);
        this.renderHand();
      }
      this.updateCardAffordability();
      this.updatePileUi();
    }, DISCARD_FALL_DELAY_MS);
  }

  createDiscardFallingElement(sourceElement) {
    const rect = sourceElement.getBoundingClientRect();
    const element = sourceElement.cloneNode(true);
    const startRotate = parseCssNumber(
      sourceElement.style.getPropertyValue('--card-drag-rotate')
    );
    const fallDistance = Math.max(520, window.innerHeight - rect.top + 180);
    const midDistance = Math.max(120, fallDistance * 0.28);
    const lateDistance = Math.max(midDistance + 80, fallDistance * 0.76);

    element.classList.remove(
      'is-dragging',
      'is-discard-ready',
      'is-discard-only',
      'is-locked',
      'is-drawn'
    );
    element.classList.add('card-discard-clone');
    element.setAttribute('aria-hidden', 'true');
    element.setAttribute('aria-disabled', 'true');
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
    element.style.setProperty('--discard-start-y', '0px');
    element.style.setProperty('--discard-mid-y', `${midDistance}px`);
    element.style.setProperty('--discard-late-y', `${lateDistance}px`);
    element.style.setProperty('--discard-end-y', `${fallDistance}px`);
    element.style.setProperty('--discard-start-rotate', `${startRotate}deg`);
    element.style.setProperty('--discard-mid-rotate', `${startRotate + 5}deg`);
    element.style.setProperty('--discard-late-rotate', `${startRotate + 15}deg`);
    element.style.setProperty('--discard-end-rotate', `${startRotate + 22}deg`);
    element.style.removeProperty('--card-drag-y');
    element.style.removeProperty('--card-drag-rotate');
    return element;
  }

  animateDiscardFallingElement(element) {
    element.classList.add('is-discard-falling');
    if (!window.requestAnimationFrame) {
      element.classList.add('is-css-discard-falling');
      return null;
    }

    const startY = parseCssNumber(element.style.getPropertyValue('--discard-start-y'));
    const midY = parseCssNumber(element.style.getPropertyValue('--discard-mid-y'));
    const lateY = parseCssNumber(element.style.getPropertyValue('--discard-late-y'));
    const endY = parseCssNumber(element.style.getPropertyValue('--discard-end-y'));
    const startRotate = parseCssNumber(
      element.style.getPropertyValue('--discard-start-rotate')
    );
    const midRotate = parseCssNumber(element.style.getPropertyValue('--discard-mid-rotate'));
    const lateRotate = parseCssNumber(element.style.getPropertyValue('--discard-late-rotate'));
    const endRotate = parseCssNumber(element.style.getPropertyValue('--discard-end-rotate'));
    const keyframes = [
      {
        offset: 0,
        y: startY,
        rotate: startRotate,
        scale: 1.035,
        opacity: 1,
        blur: 0,
        brightness: 1.12,
        saturate: 1.08
      },
      {
        offset: 0.35,
        y: midY,
        rotate: midRotate,
        scale: 0.98,
        opacity: 1,
        blur: 0,
        brightness: 1.04,
        saturate: 1
      },
      {
        offset: 0.72,
        y: lateY,
        rotate: lateRotate,
        scale: 0.82,
        opacity: 0.86,
        blur: 0.3,
        brightness: 0.9,
        saturate: 0.95
      },
      {
        offset: 1,
        y: endY,
        rotate: endRotate,
        scale: 0.74,
        opacity: 0,
        blur: 2,
        brightness: 0.55,
        saturate: 0.75
      }
    ];
    let frameId = 0;
    let cancelled = false;
    const startedAt = performance.now();
    const applyFrame = (progress) => {
      const frame = sampleDiscardFrame(keyframes, progress);
      element.style.opacity = String(frame.opacity);
      element.style.transform = `translateY(${frame.y}px) rotate(${frame.rotate}deg) scale(${frame.scale})`;
      element.style.filter = `blur(${frame.blur}px) brightness(${frame.brightness}) saturate(${frame.saturate})`;
    };
    const tick = (time) => {
      if (cancelled) return;
      const progress = clamp01((time - startedAt) / DISCARD_FALL_DELAY_MS);
      applyFrame(progress);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    applyFrame(0);
    frameId = window.requestAnimationFrame(tick);
    return {
      cancel() {
        cancelled = true;
        if (frameId) window.cancelAnimationFrame(frameId);
      }
    };
  }

  moveCardToDiscard(card) {
    const temporaryIndex = this.temporaryCards.indexOf(card);
    if (temporaryIndex !== -1) {
      this.temporaryCards.splice(temporaryIndex, 1);
      if (this.isCardSpent(card)) {
        this.game.abilities?.onCardExhausted(card);
      } else {
        this.discardPile.push(card);
      }
      this.renderTemporaryCards();
      this.updatePileUi();
      return true;
    }
    const index = this.handCards.indexOf(card);
    if (index === -1) return false;
    this.handCards.splice(index, 1);
    if (this.isCardSpent(card)) {
      this.game.abilities?.onCardExhausted(card);
    } else {
      this.discardPile.push(card);
    }
    this.refillDrawPileFromDiscardIfNeeded();
    const replacement = this.drawCard();
    if (replacement) {
      this.pendingDrawAnimations.add(replacement);
      this.handCards.splice(index, 0, replacement);
    }
    this.drawToFullHand({ animate: true });
    this.renderHand();
    this.updatePileUi();
    return true;
  }

  consumeCardUse(card) {
    if (!card) return 0;
    ensureCardUses(card);
    card.remainingUses = Math.max(0, Math.floor(card.remainingUses ?? card.maxUses) - 1);
    return card.remainingUses;
  }

  isCardSpent(card) {
    if (!card) return true;
    ensureCardUses(card);
    return (card.remainingUses ?? 0) <= 0 || shouldExhaustAfterPlay(card);
  }

  upgradeHandCard(card, amount = 1) {
    if (!card || !this.handCards.includes(card)) return false;
    return this.upgradeCardFamily(card, amount);
  }

  upgradeCardInstance(card, amount = 1) {
    if (!card || !this.allDeckCards().includes(card)) return false;
    return this.upgradeCardFamily(card, amount);
  }

  upgradeCardFamily(card, amount = 1) {
    if (!card?.id) return false;
    const levels = Math.max(1, Math.floor(amount));
    const currentBonus = this.runtimeCardLevelBonuses.get(card.id) ?? 0;
    this.runtimeCardLevelBonuses.set(card.id, currentBonus + levels);
    let upgraded = false;
    this.allDeckCards().forEach((candidate) => {
      if (candidate.id !== card.id) return;
      candidate.level = Math.max(1, Math.floor(candidate.level ?? 1)) + levels;
      candidate.runtimeLevelBonusApplied = Math.max(0, Math.floor(candidate.runtimeLevelBonusApplied ?? 0)) + levels;
      this.pendingDrawAnimations.add(candidate);
      upgraded = true;
    });
    this.renderHand();
    this.renderTemporaryCards();
    this.updatePileUi();
    return upgraded;
  }

  upgradeExistingCardCopies(card, amount = 1) {
    if (!card?.id) return false;
    const levels = Math.max(1, Math.floor(amount));
    let upgraded = false;
    this.allDeckCards().forEach((candidate) => {
      if (candidate.id !== card.id) return;
      candidate.level = Math.max(1, Math.floor(candidate.level ?? 1)) + levels;
      this.pendingDrawAnimations.add(candidate);
      upgraded = true;
    });
    this.renderHand();
    this.renderTemporaryCards();
    this.updatePileUi();
    return upgraded;
  }

  restoreCardUses(card) {
    if (!card || !this.allDeckCards().includes(card)) return false;
    ensureCardUses(card);
    card.remainingUses = card.maxUses;
    this.pendingDrawAnimations.add(card);
    this.renderHand();
    this.renderTemporaryCards();
    this.updatePileUi();
    return true;
  }

  removeCardInstance(card) {
    if (!card) return false;
    const locations = [
      this.handCards,
      this.temporaryCards,
      this.drawPile,
      this.discardPile
    ];
    for (const pile of locations) {
      const index = pile.indexOf(card);
      if (index === -1) continue;
      pile.splice(index, 1);
      this.renderHand();
      this.renderTemporaryCards();
      this.updatePileUi();
      return true;
    }
    return false;
  }

  copyCardInstance(card, options = {}) {
    if (!card || !this.allDeckCards().includes(card)) return { added: false, location: 'none' };
    ensureCardUses(card);
    return this.addCardToDrawPile({
      ...card,
      instanceId: undefined,
      remainingUses: card.maxUses
    }, {
      prefix: options.prefix ?? `copy-${Date.now()}`,
      applyRuntimeLevelBonus: false
    });
  }

  allDeckCards() {
    const seen = new Set();
    return [
      ...this.handCards,
      ...this.temporaryCards,
      ...this.drawPile,
      ...this.discardPile
    ].filter((card) => {
      if (!card || seen.has(card.instanceId)) return false;
      seen.add(card.instanceId);
      return true;
    });
  }

  applyAbilityUseBonus(card) {
    const bonus = Math.max(0, Math.floor(this.game.abilities?.getCardUseBonus?.(card) ?? 0));
    if (bonus <= 0) return;
    ensureCardUses(card);
    card.maxUses += bonus;
    card.remainingUses += bonus;
  }

  increaseUsesForKind(kind, amount = 1) {
    const bonus = Math.max(1, Math.floor(amount));
    this.allDeckCards().forEach((card) => {
      if (card.kind !== kind) return;
      ensureCardUses(card);
      card.maxUses += bonus;
      card.remainingUses += bonus;
      this.pendingDrawAnimations.add(card);
    });
    this.renderHand();
    this.renderTemporaryCards();
    this.updatePileUi();
  }

  exhaustHandCard(card, amount = 1, options = {}) {
    if (!card || !this.handCards.includes(card)) return 0;
    const targetCount = Math.max(1, Math.floor(amount));
    const excluded = new Set(options.excludeCards ?? []);
    const candidates = this.handCards.filter((candidate) => (
      candidate && candidate !== card && !excluded.has(candidate)
    ));
    shuffleCards(candidates);
    const targets = [card, ...candidates].slice(0, targetCount);
    let consumed = 0;

    targets.forEach((target) => {
      const index = this.handCards.indexOf(target);
      if (index === -1 || excluded.has(target)) return;
      this.handCards.splice(index, 1);
      this.game.abilities?.onCardExhausted(target);
      consumed += 1;
    });

    if (consumed > 0 && options.drawReplacement !== false) {
      this.drawToFullHand({ animate: true });
    }
    if (consumed > 0) {
      this.renderHand();
      this.updatePileUi();
    }
    return consumed;
  }

  addLootCard(cardDefinition) {
    if (!cardDefinition) return { added: false, location: 'none' };
    const card = createCardInstance(this.applyRuntimeCardLevel(cardDefinition), `loot-${Date.now()}`);
    if (this.temporaryCards.length < TEMPORARY_CARD_LIMIT) {
      this.temporaryCards.push(card);
      this.pendingDrawAnimations.add(card);
      this.renderTemporaryCards();
      this.updatePileUi();
      return { added: true, location: 'temporary', card };
    }
    this.drawPile.unshift(card);
    this.updatePileUi();
    return { added: true, location: 'draw', card };
  }

  addCardToDrawPile(cardDefinition, options = {}) {
    if (!cardDefinition) return { added: false, location: 'none' };
    const hasExplicitUses = Number.isFinite(cardDefinition.maxUses);
    const card = createCardInstance({
      ...cardDefinition,
      level: this.runtimeLevelForCard(cardDefinition, options)
    }, options.prefix ?? `reward-${Date.now()}`);
    if (!hasExplicitUses) {
      this.applyAbilityUseBonus(card);
    }
    if (options.top === false) {
      this.drawPile.push(card);
    } else {
      this.drawPile.unshift(card);
    }
    if (options.drawToHand !== false) {
      this.drawToFullHand({ animate: true });
      this.renderHand();
    }
    this.updatePileUi();
    return { added: true, location: 'draw', card };
  }

  addDebugCard(cardDefinition, options = {}) {
    if (!cardDefinition) return { added: false, location: 'none' };
    const level = this.runtimeLevelForCard(cardDefinition, options);
    const card = createCardInstance({
      ...cardDefinition,
      level
    }, `debug-${Date.now()}`);

    if (options.location !== 'hand' && this.temporaryCards.length < TEMPORARY_CARD_LIMIT) {
      this.temporaryCards.push(card);
      this.pendingDrawAnimations.add(card);
      this.renderTemporaryCards();
      this.updatePileUi();
      return { added: true, location: 'temporary', card };
    }

    this.drawPile.unshift(card);
    this.updatePileUi();
    return { added: true, location: 'draw', card };
  }

  runtimeLevelForCard(cardDefinition, options = {}) {
    const baseLevel = Math.max(1, Math.floor(cardDefinition.level ?? options.level ?? 1));
    if (options.applyRuntimeLevelBonus === false) return baseLevel;
    const bonus = this.runtimeCardLevelBonuses.get(cardDefinition.id) ?? 0;
    const alreadyApplied = Math.max(0, Math.floor(cardDefinition.runtimeLevelBonusApplied ?? 0));
    return baseLevel + Math.max(0, bonus - alreadyApplied);
  }

  applyRuntimeCardLevel(cardDefinition, options = {}) {
    const bonus = options.applyRuntimeLevelBonus === false
      ? 0
      : (this.runtimeCardLevelBonuses.get(cardDefinition.id) ?? 0);
    return {
      ...cardDefinition,
      level: this.runtimeLevelForCard(cardDefinition, options),
      runtimeLevelBonusApplied: Math.max(
        Math.max(0, Math.floor(cardDefinition.runtimeLevelBonusApplied ?? 0)),
        bonus
      )
    };
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
    this.refillDrawPileFromDiscardIfNeeded();
    const card = this.drawPile.shift() ?? null;
    this.refillDrawPileFromDiscardIfNeeded();
    this.updatePileUi();
    return card;
  }

  refillDrawPileFromDiscardIfNeeded() {
    if (this.drawPile.length > 0 || this.discardPile.length === 0) {
      return false;
    }
    this.drawPile = shuffleCards(this.discardPile.splice(0));
    return true;
  }

  spendEnergy(cost) {
    if (!this.canSpend(cost)) return false;
    this.energy -= cost;
    this.updateEnergyUi(true);
    this.updateCardAffordability();
    return true;
  }

  addEnergy(amount) {
    if (!Number.isFinite(amount) || amount <= 0 || this.energy >= MAX_ENERGY) return 0;
    const previousEnergy = this.energy;
    this.energy = Math.min(MAX_ENERGY, this.energy + amount);
    if (this.energy >= MAX_ENERGY) {
      this.energyTimer = 0;
    }
    this.updateEnergyUi();
    if (previousEnergy !== this.energy) {
      this.updateCardAffordability();
    }
    return this.energy - previousEnergy;
  }

  canSpend(cost) {
    return this.energy >= cost;
  }

  updateCardAffordability() {
    document.querySelectorAll('#card-hand .card, #temporary-card-slot .card').forEach((element) => {
      const card = element.dataset.cardLocation === 'temporary'
        ? this.temporaryCards[Number(element.dataset.temporaryIndex)]
        : this.handCards[Number(element.dataset.handIndex)];
      if (!card) return;
      const canPlay = this.canSpend(cardEnergyCost(card));
      const canDiscard = this.canSpend(discardEnergyCost(card));
      element.setAttribute('aria-disabled', String(!canPlay));
      element.classList.toggle('is-discard-only', !canPlay && canDiscard);
      element.classList.toggle('is-locked', !canDiscard);
    });
  }

  updateAbilityIcons(abilities = []) {
    if (!this.abilityIcons) return;
    this.abilityIcons.innerHTML = '';
    this.abilityIcons.hidden = abilities.length === 0;
    abilities.forEach((ability) => {
      const icon = document.createElement('div');
      icon.className = 'ability-icon';
      icon.style.setProperty('--ability-color', ability.color ?? '#9dd8ff');
      icon.title = `${ability.name} x${ability.stacks} - ${ability.summary}`;
      icon.innerHTML = `
        <span>${ability.label ?? ability.name?.slice?.(0, 1) ?? '?'}</span>
        <strong>${ability.stacks}</strong>
      `;
      this.abilityIcons.appendChild(icon);
    });
  }

  updateEnergyUi(force = false) {
    const progress = this.energy >= MAX_ENERGY ? 1 : this.energyTimer / ENERGY_REGEN_SECONDS;
    const progressStep = Math.round(progress * 100);
    const energyStep = Math.floor(this.energy * 10 + 0.0001);
    if (!force && this.lastRenderedEnergy === energyStep && this.lastRenderedProgress === progressStep) {
      return;
    }
    this.lastRenderedEnergy = energyStep;
    this.lastRenderedProgress = progressStep;
    const filledEnergy = Math.floor(this.energy + 0.0001);
    this.energyPanel.style.setProperty('--energy-progress', `${progress * 100}%`);
    if (this.energyParts?.value) {
      this.energyParts.value.textContent = `${formatEnergy(this.energy)}/${MAX_ENERGY}`;
    }
    this.energyParts?.cells?.forEach((cell, index) => {
      cell.classList.toggle('is-filled', index < filledEnergy);
    });
  }

  flashEnergyPanel() {
    this.energyPanel.classList.remove('is-warning');
    void this.energyPanel.offsetWidth;
    this.energyPanel.classList.add('is-warning');
  }

  setHint(text, owner = 'system') {
    if (!this.hintPanel) return;
    this.hintOwner = owner;
    this.hintPanel.textContent = text;
    this.hintPanel.hidden = false;
    this.hintPanel.classList.add('is-visible');
  }

  clearHint(owner = 'system') {
    if (!this.hintPanel) return;
    if (this.hintOwner && owner !== this.hintOwner) return;
    this.hintOwner = null;
    this.hintPanel.classList.remove('is-visible');
    this.hintPanel.hidden = true;
  }

  destroy() {
    document.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('pointerup', this.onPointerUp);
    document.removeEventListener('keydown', this.onPileViewerKeyDown);
    this.drag = null;
    this.reticle?.parent?.remove(this.reticle);
    this.clearDeploymentRangePreview();
    this.deploymentRangeGroup?.parent?.remove(this.deploymentRangeGroup);
    disposeObject3D(this.deploymentDimPlane, { materials: true });
    this.deploymentDimPlane?.parent?.remove(this.deploymentDimPlane);
    this.enchantTargetRing?.parent?.remove(this.enchantTargetRing);
    this.ghost.hidden = true;
    this.ghost.classList.remove('enchant-crosshair', 'is-valid');
    this.hand.innerHTML = '';
    this.temporarySlot?.remove();
    this.energyPanel?.remove();
    this.hintPanel?.remove();
    this.pileUi?.root?.remove();
    this.pileUi?.viewer?.remove();
  }
}

function normalizeDeck(cards) {
  const source = Array.isArray(cards)
    ? cards
    : CARD_DEFINITIONS.filter((card) => !card.lootOnly);
  return source.map((card, index) => ({
    ...initializeCardUses(card),
    instanceId: card.instanceId ?? `${card.id}-${index}-${Math.random().toString(36).slice(2)}`
  }));
}

function createCardInstance(card, prefix = 'card') {
  return initializeCardUses({
    ...card,
    instanceId: `${prefix}-${card.id}-${Math.random().toString(36).slice(2)}`
  });
}

function initializeCardUses(card) {
  const maxUses = Math.max(1, Math.floor(card.maxUses ?? defaultCardUses(card)));
  const remainingUses = Math.max(0, Math.min(
    maxUses,
    Math.floor(card.remainingUses ?? maxUses)
  ));
  return {
    ...card,
    maxUses,
    remainingUses
  };
}

function ensureCardUses(card) {
  if (!card) return null;
  const maxUses = Math.max(1, Math.floor(card.maxUses ?? defaultCardUses(card)));
  card.maxUses = maxUses;
  card.remainingUses = Math.max(0, Math.min(
    maxUses,
    Math.floor(card.remainingUses ?? maxUses)
  ));
  return card;
}

function defaultCardUses(card) {
  if (card?.exhaust) return 1;
  return DEFAULT_CARD_USES[card?.kind] ?? 2;
}

function kindLabel(kind) {
  if (kind === 'summon') return '单位卡';
  if (kind === 'spell') return '法术卡';
  if (kind === 'building') return '建筑卡';
  if (kind === 'tactic') return '战术卡';
  if (kind === 'ability') return '能力卡';
  return '附魔卡';
}

function shouldUseCardFaceGhost(card) {
  return card?.kind === 'ability';
}

function shouldExhaustAfterPlay(card) {
  return Boolean(card?.exhaust);
}

function createCardUseBarMarkup(card, classPrefix) {
  const normalized = ensureCardUses(card);
  const maxUses = normalized?.maxUses ?? 1;
  const remainingUses = normalized?.remainingUses ?? maxUses;
  const segments = Array.from({ length: maxUses }, (_, index) => (
    `<span class="${index < remainingUses ? 'is-filled' : ''}"></span>`
  )).join('');
  return `
    <div class="${classPrefix}-use-bar" aria-label="剩余使用次数 ${remainingUses}/${maxUses}">
      ${segments}
    </div>
  `;
}

export function cardThemeColor(cardOrKind) {
  const kind = typeof cardOrKind === 'string' ? cardOrKind : cardOrKind?.kind;
  return CARD_KIND_COLORS[kind] ?? CARD_KIND_COLORS.enchant;
}

export function createCardArtMarkup(card) {
  const key = safeArtKey(card.artKey ?? card.id ?? card.kind);
  const renderer = CARD_ART_RENDERERS[key] ?? CARD_ART_RENDERERS.default;
  return `<div class="card-art card-art-${key}" aria-hidden="true">${renderer()}</div>`;
}

function safeArtKey(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}

const CARD_ART_RENDERERS = {
  raider: () => artSvg(`
    <polygon fill="#372f28" points="0,51 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#c18b62" points="47,12 56,24 41,24" />
    <polygon fill="#8f3b34" points="40,24 59,24 62,44 37,44" />
    <polygon fill="#221f1d" points="39,44 49,44 47,58 38,58" />
    <polygon fill="#211d1c" points="51,44 61,44 62,58 53,58" />
    <polygon fill="#c18b62" points="33,29 40,30 44,43 38,46" />
    <polygon fill="#bd845d" points="62,28 69,30 59,43 53,41" />
    <polygon fill="#6d4a2c" points="27,16 34,13 76,54 69,58" />
    <polygon fill="#8b6037" points="24,14 34,9 40,17 29,22" />
    <polygon fill="#fff2c7" opacity="0.38" points="58,37 77,53 73,55" />
  `),
  swordsman: () => artSvg(`
    <polygon fill="#234034" points="0,49 18,39 44,43 67,36 96,46 96,64 0,64" />
    <polygon fill="#c7a06f" points="48,13 55,25 43,25" />
    <polygon fill="#2e6b5a" points="42,25 57,25 61,44 39,44" />
    <polygon fill="#172323" points="41,44 49,44 47,57 39,57" />
    <polygon fill="#162421" points="51,44 59,44 61,57 53,57" />
    <polygon fill="#e6bb81" points="32,29 39,30 44,42 39,45" />
    <polygon fill="#dcae72" points="61,28 67,31 58,44 53,41" />
    <polygon fill="#d6dde0" points="33,15 78,53 74,57 29,19" />
    <polygon fill="#7a4c30" points="26,16 34,13 39,19 30,22" />
    <polygon fill="#fff2c7" opacity="0.55" points="58,33 79,49 76,52" />
  `),
  knight: () => artSvg(`
    <polygon fill="#293b31" points="0,50 18,39 45,42 70,37 96,47 96,64 0,64" />
    <polygon fill="#dac087" points="47,11 56,24 41,24" />
    <polygon fill="#335e69" points="41,24 58,24 62,45 38,45" />
    <polygon fill="#182322" points="40,45 49,45 47,58 39,58" />
    <polygon fill="#141e20" points="51,45 60,45 62,58 53,58" />
    <polygon fill="#d7a878" points="32,29 39,31 44,43 38,45" />
    <polygon fill="#d7a878" points="62,28 68,30 59,43 53,41" />
    <polygon fill="#d8dde0" points="25,17 64,53 60,57 22,21" />
    <polygon fill="#755033" points="20,16 28,13 34,19 24,22" />
    <polygon fill="#d9d2a2" points="62,29 77,35 74,52 58,48" />
    <polygon fill="#766b45" points="64,32 74,36 72,47 61,45" />
    <polyline fill="none" stroke="#fff2c7" stroke-width="2" points="65,34 69,40 70,48" />
  `),
  berserker: () => artSvg(`
    <polygon fill="#32272a" points="0,51 17,41 43,44 70,37 96,48 96,64 0,64" />
    <polygon fill="#c18a64" points="47,11 57,24 39,24" />
    <polygon fill="#8f3240" points="38,24 60,24 65,45 48,55 31,45" />
    <polygon fill="#261e22" points="39,45 49,45 47,58 38,58" />
    <polygon fill="#241d21" points="51,45 61,45 62,58 53,58" />
    <polygon fill="#c99368" points="30,28 39,30 44,43 37,46" />
    <polygon fill="#bd845d" points="65,28 72,31 60,43 53,40" />
    <polygon fill="#5b3a28" points="22,15 29,12 74,54 68,58" />
    <polygon fill="#cbd3d6" points="55,23 77,31 71,44 50,36" />
    <polygon fill="#aeb9bd" points="72,28 86,37 72,45" />
    <polygon fill="#fff2c7" opacity="0.46" points="55,25 73,32 69,35" />
    <path fill="none" stroke="#ff9a62" stroke-width="2" opacity="0.7" d="M30 15 C42 6 57 6 69 15" />
  `),
  archer: () => artSvg(`
    <polygon fill="#254232" points="0,51 16,40 41,43 67,37 96,48 96,64 0,64" />
    <polygon fill="#d9aa78" points="47,12 55,23 41,23" />
    <polygon fill="#2f805f" points="40,23 58,23 61,44 37,44" />
    <polygon fill="#172325" points="39,44 49,44 47,57 39,57" />
    <polygon fill="#13201f" points="51,44 60,44 62,57 53,57" />
    <polygon fill="#e0b27b" points="59,28 67,29 70,35 63,37" />
    <polygon fill="#e0b27b" points="36,29 44,29 56,34 52,39" />
    <path fill="none" stroke="#4a3026" stroke-width="4" stroke-linecap="round" d="M69 15 C86 28 85 48 68 58" />
    <path fill="none" stroke="#f8e5b2" stroke-width="1.6" d="M69 15 L68 58" />
    <polygon fill="#efe8ca" points="34,34 72,33 72,36 34,37" />
    <polygon fill="#efe8ca" points="72,33 80,35 72,37" />
  `),
  crossbowman: () => artSvg(`
    <polygon fill="#263941" points="0,51 17,41 42,44 68,37 96,48 96,64 0,64" />
    <polygon fill="#d9aa78" points="47,12 55,23 41,23" />
    <polygon fill="#4f6f78" points="38,24 60,24 64,46 49,55 34,46" />
    <polygon fill="#172325" points="39,46 49,46 47,58 39,58" />
    <polygon fill="#13201f" points="51,46 61,46 62,58 53,58" />
    <polygon fill="#d9aa78" points="63,28 70,31 59,42 54,39" />
    <polygon fill="#d9aa78" points="31,29 38,30 44,39 39,43" />
    <polygon fill="#6a4a30" points="25,39 72,36 72,42 25,45" />
    <polygon fill="#3a2a24" points="23,31 78,31 82,36 19,37" />
    <polygon fill="#3a2a24" points="18,34 30,29 28,39" />
    <polygon fill="#3a2a24" points="80,34 68,29 70,39" />
    <polygon fill="#d8dde0" points="41,34 80,33 80,36 41,37" />
    <polygon fill="#d8dde0" points="80,33 88,35 80,37" />
    <polygon fill="#8f9a9b" points="45,12 57,16 52,23 39,20" />
    <path fill="none" stroke="#fff2c7" stroke-width="2" opacity="0.55" d="M22 35 L80 35" />
  `),
  waterMage: () => artSvg(`
    <polygon fill="#1f3440" points="0,51 18,42 42,44 69,38 96,49 96,64 0,64" />
    <ellipse fill="#65d8ff" opacity="0.22" cx="62" cy="34" rx="29" ry="19" />
    <polygon fill="#d9aa78" points="47,11 55,23 41,23" />
    <polygon fill="#235f83" points="35,24 61,24 66,51 49,58 30,51" />
    <polygon fill="#3e8fb3" points="40,28 58,28 61,48 49,54 37,48" />
    <polygon fill="#dff8ff" points="35,36 62,36 61,40 36,40" />
    <polygon fill="#17212a" points="40,50 49,50 47,59 39,59" />
    <polygon fill="#17212a" points="51,50 60,50 61,59 53,59" />
    <polygon fill="#d9aa78" points="28,30 36,31 44,42 39,46" />
    <polygon fill="#d9aa78" points="64,30 71,32 60,43 55,40" />
    <polygon fill="#6a4a30" points="72,10 78,10 70,59 65,59" />
    <circle fill="#65d8ff" cx="76" cy="10" r="7" />
    <circle fill="#dff8ff" opacity="0.74" cx="76" cy="10" r="3" />
    <circle fill="#65d8ff" opacity="0.72" cx="64" cy="36" r="15" />
    <circle fill="#dff8ff" opacity="0.34" cx="60" cy="31" r="7" />
    <path fill="none" stroke="#dff8ff" stroke-width="2" opacity="0.8" d="M49 39 C58 26 73 26 83 37" />
    <path fill="none" stroke="#8feaff" stroke-width="2" opacity="0.7" d="M43 45 C56 55 73 54 86 42" />
  `),
  rogue: () => artSvg(`
    <polygon fill="#1f2c35" points="0,51 18,42 42,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#dff8ff" opacity="0.16" cx="50" cy="42" rx="33" ry="16" />
    <polygon fill="#d9aa78" points="47,12 55,23 41,23" />
    <polygon fill="#29384a" points="35,24 60,24 66,52 49,59 31,52" />
    <polygon fill="#4f5f7c" points="39,28 57,28 60,46 49,54 37,46" />
    <polygon fill="#17212a" points="40,50 49,50 47,59 39,59" />
    <polygon fill="#17212a" points="51,50 60,50 61,59 53,59" />
    <polygon fill="#26303b" points="39,13 57,13 63,26 33,26" />
    <polygon fill="#d8dce2" points="28,45 45,31 49,35 33,51" />
    <polygon fill="#d8dce2" points="68,45 51,31 47,35 63,51" />
    <polygon fill="#7b5a38" points="24,49 32,43 36,48 28,54" />
    <polygon fill="#7b5a38" points="72,49 64,43 60,48 68,54" />
    <polygon fill="#dff8ff" points="61,15 82,11 70,25" />
    <path fill="none" stroke="#dff8ff" stroke-width="2" opacity="0.72" d="M24 51 C44 37 58 26 81 11" />
  `),
  engineer: () => artSvg(`
    <polygon fill="#342d27" points="0,51 18,42 42,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#9dd8ff" opacity="0.16" cx="52" cy="43" rx="32" ry="15" />
    <polygon fill="#d9aa78" points="47,13 55,23 41,23" />
    <polygon fill="#d09a5a" points="39,22 58,22 54,38 48,47 42,38" />
    <polygon fill="#7b5a38" points="36,29 61,29 66,51 49,59 32,51" />
    <polygon fill="#4d3a2a" points="41,34 57,34 59,52 49,56 39,52" />
    <polygon fill="#172325" points="40,52 49,52 47,60 39,60" />
    <polygon fill="#13201f" points="51,52 60,52 61,60 53,60" />
    <polygon fill="#8f9a9b" points="36,12 61,12 66,22 31,22" />
    <polygon fill="#d8c58d" points="38,17 59,17 59,21 38,21" />
    <polygon fill="#5a3a28" points="62,36 75,39 71,51 59,49" />
    <path fill="none" stroke="#5a3a28" stroke-width="5" stroke-linecap="round" d="M24 52 L42 34" />
    <polygon fill="#8f9a9b" points="39,29 54,35 49,43 34,37" />
    <path fill="none" stroke="#8f9a9b" stroke-width="4" stroke-linecap="round" d="M70 27 L58 47" />
    <polygon fill="#8f9a9b" points="66,23 78,27 73,32 62,29" />
    <circle fill="#9dd8ff" cx="51" cy="43" r="4" />
    <path fill="none" stroke="#eef7ff" stroke-width="2" opacity="0.68" d="M25 55 C39 46 55 47 72 36" />
  `),
  physician: () => artSvg(`
    <polygon fill="#263a2d" points="0,51 18,42 42,44 69,38 96,49 96,64 0,64" />
    <ellipse fill="#c7ffd1" opacity="0.24" cx="54" cy="36" rx="32" ry="19" />
    <polygon fill="#d9aa78" points="47,11 55,23 41,23" />
    <polygon fill="#3f7258" points="36,24 60,24 66,50 49,58 31,50" />
    <polygon fill="#5f9f73" points="40,28 58,28 61,48 49,54 37,48" />
    <polygon fill="#f5e5b2" points="35,36 62,36 61,40 36,40" />
    <polygon fill="#17212a" points="40,50 49,50 47,59 39,59" />
    <polygon fill="#17212a" points="51,50 60,50 61,59 53,59" />
    <polygon fill="#d9aa78" points="28,30 36,31 44,42 39,46" />
    <polygon fill="#d9aa78" points="64,30 71,32 60,43 55,40" />
    <polygon fill="#6a4a30" points="72,10 78,10 70,59 65,59" />
    <circle fill="#c7ffd1" cx="76" cy="10" r="7" />
    <circle fill="#ffffff" opacity="0.75" cx="76" cy="10" r="3" />
    <polygon fill="#f5e5b2" points="46,30 53,30 53,37 60,37 60,43 53,43 53,50 46,50 46,43 39,43 39,37 46,37" />
    <path fill="none" stroke="#9dffb0" stroke-width="2" opacity="0.75" d="M23 42 C37 30 55 28 75 11" />
  `),
  arrowTower: () => artSvg(`
    <polygon fill="#28333d" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#777d78" points="25,56 72,56 67,63 30,63" />
    <polygon fill="#6d4a30" points="30,55 37,55 42,23 35,23" />
    <polygon fill="#6d4a30" points="59,23 66,23 61,55 54,55" />
    <polygon fill="#3c2a22" points="30,43 66,43 66,48 30,48" />
    <polygon fill="#3c2a22" points="33,32 63,32 63,37 33,37" />
    <polygon fill="#84613f" points="25,21 71,21 76,37 48,48 20,37" />
    <polygon fill="#3e7cb1" points="48,5 78,23 18,23" />
    <polygon fill="#2d5c8d" points="48,10 69,22 27,22" />
    <path fill="none" stroke="#3c2a22" stroke-width="5" stroke-linecap="round" d="M34 36 C48 24 63 27 70 42" />
    <polygon fill="#efe8ca" points="41,35 75,34 75,37 41,38" />
    <polygon fill="#efe8ca" points="75,34 84,36 75,38" />
    <path fill="none" stroke="#fff2c7" stroke-width="2" opacity="0.58" d="M48 5 L48 48" />
  `),
  repairStation: () => artSvg(`
    <polygon fill="#263a42" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#777d78" points="18,56 78,56 70,63 26,63" />
    <polygon fill="#6b4a2f" points="24,39 73,39 70,53 27,53" />
    <polygon fill="#6b9ab8" points="29,30 54,30 58,43 25,43" />
    <polygon fill="#8f9a9b" points="59,31 73,35 67,45 55,41" />
    <polygon fill="#6b4a2f" points="45,16 51,16 51,55 45,55" />
    <polygon fill="#6b9ab8" points="30,13 66,13 70,28 26,28" />
    <circle fill="#9dd8ff" cx="48" cy="41" r="7" />
    <path fill="none" stroke="#eef7ff" stroke-width="3" stroke-linecap="round" d="M38 21 L58 21 M48 11 L48 31" />
    <path fill="none" stroke="#d8dde0" stroke-width="4" stroke-linecap="round" d="M63 18 C72 22 72 31 63 35" />
    <path fill="none" stroke="#d8dde0" stroke-width="3" stroke-linecap="round" d="M64 35 L55 48" />
  `),
  canteen: () => artSvg(`
    <polygon fill="#3a3028" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#777d78" points="17,56 79,56 71,63 25,63" />
    <polygon fill="#84613f" points="23,28 73,28 75,55 21,55" />
    <polygon fill="#b98758" points="48,8 80,29 16,29" />
    <polygon fill="#5a3a28" points="25,43 71,43 71,49 25,49" />
    <ellipse fill="#3e3a36" cx="48" cy="37" rx="16" ry="8" />
    <ellipse fill="#e0b36a" cx="48" cy="35" rx="13" ry="5" />
    <polygon fill="#5f564d" points="60,13 69,16 67,30 58,28" />
    <circle fill="#d8dde0" cx="32" cy="43" r="5" />
    <circle fill="#d8dde0" cx="64" cy="43" r="5" />
    <path fill="none" stroke="#fff2c7" stroke-width="2" opacity="0.7" d="M37 34 C41 29 45 33 48 29 C52 24 57 29 60 25" />
  `),
  beacon: () => artSvg(`
    <polygon fill="#26343b" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#9dd8ff" opacity="0.16" cx="49" cy="47" rx="34" ry="12" />
    <polygon fill="#777d78" points="20,56 76,56 69,63 27,63" />
    <polygon fill="#d8c58d" points="32,48 64,48 60,56 36,56" />
    <polygon fill="#777d78" points="43,23 53,23 56,49 40,49" />
    <ellipse fill="none" stroke="#d8c58d" stroke-width="4" cx="48" cy="26" rx="21" ry="8" />
    <polygon fill="#9dd8ff" points="48,4 62,23 48,42 34,23" />
    <polygon fill="#dff8ff" opacity="0.8" points="48,8 55,23 48,35 41,23" />
    <polygon fill="#d8c58d" points="48,1 57,8 48,14 39,8" />
    <path fill="none" stroke="#eef7ff" stroke-width="2" opacity="0.8" d="M21 49 C35 38 58 38 75 49" />
  `),
  purifier: () => artSvg(`
    <polygon fill="#263646" points="0,51 18,42 42,44 69,38 96,49 96,64 0,64" />
    <ellipse fill="#dff8ff" opacity="0.22" cx="54" cy="36" rx="32" ry="19" />
    <polygon fill="#d9aa78" points="47,11 55,23 41,23" />
    <polygon fill="#5666a4" points="36,24 60,24 66,50 49,58 31,50" />
    <polygon fill="#7889c7" points="40,28 58,28 61,48 49,54 37,48" />
    <polygon fill="#f0e8c6" points="35,36 62,36 61,40 36,40" />
    <polygon fill="#17212a" points="40,50 49,50 47,59 39,59" />
    <polygon fill="#17212a" points="51,50 60,50 61,59 53,59" />
    <polygon fill="#d9aa78" points="28,30 36,31 44,42 39,46" />
    <polygon fill="#d9aa78" points="64,30 71,32 60,43 55,40" />
    <polygon fill="#6a4a30" points="72,10 78,10 70,59 65,59" />
    <circle fill="#dff8ff" cx="76" cy="10" r="7" />
    <circle fill="#ffffff" opacity="0.75" cx="76" cy="10" r="3" />
    <path fill="none" stroke="#b7f3ff" stroke-width="2" opacity="0.75" d="M23 42 C37 30 55 28 75 11" />
    <path fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" d="M39 44 L58 27 M42 27 L59 44" />
  `),
  warder: () => artSvg(`
    <polygon fill="#243542" points="0,51 18,42 42,44 69,38 96,49 96,64 0,64" />
    <ellipse fill="#b7eaff" opacity="0.25" cx="51" cy="38" rx="34" ry="21" />
    <path fill="none" stroke="#dff8ff" stroke-width="3" d="M20 42 C31 20 67 20 80 42 C66 58 33 58 20 42 Z" />
    <polygon fill="#d9aa78" points="47,11 55,23 41,23" />
    <polygon fill="#466f8d" points="36,24 60,24 66,50 49,58 31,50" />
    <polygon fill="#6b9ab8" points="40,28 58,28 61,48 49,54 37,48" />
    <polygon fill="#dcefff" points="35,36 62,36 61,40 36,40" />
    <polygon fill="#17212a" points="40,50 49,50 47,59 39,59" />
    <polygon fill="#17212a" points="51,50 60,50 61,59 53,59" />
    <polygon fill="#d9aa78" points="28,30 36,31 44,42 39,46" />
    <polygon fill="#d9aa78" points="64,30 71,32 60,43 55,40" />
    <polygon fill="#6a4a30" points="72,10 78,10 70,59 65,59" />
    <circle fill="#b7eaff" cx="76" cy="10" r="7" />
    <circle fill="#ffffff" opacity="0.75" cx="76" cy="10" r="3" />
    <polygon fill="#dff8ff" points="49,27 63,34 60,48 49,55 38,48 35,34" />
    <polygon fill="#6b9ab8" points="49,32 57,36 55,45 49,49 43,45 41,36" />
  `),
  meteor: () => artSvg(`
    <polygon fill="#28333d" points="0,47 18,39 39,43 62,36 96,46 96,64 0,64" />
    <polygon fill="#ffe49a" opacity="0.9" points="20,2 68,31 59,39 12,10" />
    <polygon fill="#ff973f" points="27,8 66,31 58,36 20,14" />
    <polygon fill="#ff5d32" points="34,15 62,31 56,34 29,19" />
    <circle fill="#ffcf74" cx="67" cy="39" r="15" />
    <polygon fill="#f06b32" points="58,31 73,27 82,38 76,52 60,53 52,42" />
    <polygon fill="#6b4a35" points="63,34 74,32 79,41 72,49 61,47 56,40" />
    <polygon fill="#3f302c" points="67,36 75,38 72,46 61,43" />
    <polygon fill="#fff2c7" opacity="0.82" points="56,34 67,31 63,39" />
    <ellipse fill="#ffcf74" opacity="0.28" cx="67" cy="56" rx="28" ry="6" />
  `),
  fire: () => artSvg(`
    <polygon fill="#352f2a" points="0,50 20,41 43,44 66,38 96,48 96,64 0,64" />
    <polygon fill="#d7dde0" points="24,50 64,18 69,22 29,55" />
    <polygon fill="#7a4c30" points="18,54 28,47 34,54 24,60" />
    <polygon fill="#ff6b32" points="54,49 44,39 48,28 58,36 62,20 73,36 78,47 68,58" />
    <polygon fill="#ffd06b" points="60,50 54,41 58,34 64,41 68,30 72,43 70,53" />
    <polygon fill="#fff2c7" points="63,51 60,45 64,41 67,47" />
  `),
  thorns: () => artSvg(`
    <polygon fill="#243928" points="0,50 22,41 44,43 68,38 96,49 96,64 0,64" />
    <polygon fill="#9bbb6d" points="45,12 68,22 63,49 45,58 27,49 22,22" />
    <polygon fill="#314d2b" points="45,17 62,24 58,45 45,52 32,45 28,24" />
    <path fill="none" stroke="#d1f0a0" stroke-width="3" stroke-linecap="round" d="M18 46 C31 35 34 26 45 22 C55 18 64 21 78 13" />
    <path fill="none" stroke="#79b657" stroke-width="3" stroke-linecap="round" d="M17 55 C30 45 45 43 55 34 C62 28 66 21 78 18" />
    <polygon fill="#fff2c7" points="26,33 32,28 34,38" />
    <polygon fill="#fff2c7" points="58,27 65,22 65,33" />
    <polygon fill="#fff2c7" points="69,46 76,43 73,53" />
  `),
  toughness: () => artSvg(`
    <polygon fill="#3a352b" points="0,52 18,42 45,44 69,38 96,49 96,64 0,64" />
    <polygon fill="#fff2c7" opacity="0.18" points="48,7 76,27 68,57 48,62 28,57 20,27" />
    <path fill="none" stroke="#c4b06e" stroke-width="3" d="M25 52 C24 31 35 14 48 11 C61 14 72 31 71 52" />
    <polygon fill="#d1ad78" points="48,12 58,23 39,23" />
    <polygon fill="#6d744b" points="38,24 59,24 64,48 48,56 32,48" />
    <polygon fill="#4d5639" points="42,30 54,30 57,46 48,51 39,46" />
    <polygon fill="#d7a878" points="25,31 34,29 46,39 40,44" />
    <polygon fill="#d7a878" points="71,31 62,29 50,39 56,44" />
    <polygon fill="#f1c58a" points="36,39 46,35 51,40 41,47" />
    <polygon fill="#f1c58a" points="60,39 50,35 45,40 55,47" />
    <polygon fill="#fff2c7" opacity="0.6" points="34,30 43,35 39,39 29,34" />
    <polygon fill="#fff2c7" opacity="0.42" points="62,30 53,35 57,39 67,34" />
  `),
  protection: () => artSvg(`
    <polygon fill="#22364a" points="0,51 19,42 42,44 69,37 96,48 96,64 0,64" />
    <path fill="#8fc8ff" opacity="0.24" d="M20 51 C25 24 41 12 50 11 C66 13 76 28 78 51 Z" />
    <path fill="none" stroke="#dcefff" stroke-width="3" d="M20 51 C25 24 41 12 50 11 C66 13 76 28 78 51" />
    <polygon fill="#dcefff" points="49,17 66,24 62,44 49,53 36,44 32,24" />
    <polygon fill="#557fc9" points="49,22 60,27 57,41 49,47 41,41 38,27" />
    <polygon fill="#fff2c7" opacity="0.72" points="31,26 39,20 36,31" />
    <polygon fill="#fff2c7" opacity="0.5" points="67,33 74,42 65,40" />
  `),
  block: () => artSvg(`
    <polygon fill="#2c3338" points="0,51 19,42 42,44 69,37 96,48 96,64 0,64" />
    <path fill="#d8dde0" opacity="0.28" d="M20 51 C24 28 39 12 50 10 C64 13 76 28 78 51 C64 59 35 59 20 51 Z" />
    <path fill="none" stroke="#eef7ff" stroke-width="3" d="M20 51 C24 28 39 12 50 10 C64 13 76 28 78 51" />
    <polygon fill="#8f9a9b" points="50,16 67,25 63,45 50,55 37,45 33,25" />
    <polygon fill="#4f6f78" points="50,22 60,28 57,41 50,48 43,41 40,28" />
    <polygon fill="#fff2c7" points="26,53 70,53 72,58 24,58" />
    <polygon fill="#6a4a30" points="30,54 64,54 63,57 31,57" />
    <path fill="none" stroke="#ffffff" stroke-width="2" opacity="0.64" d="M35 30 L50 21 L65 30" />
    <circle fill="#eef7ff" opacity="0.74" cx="67" cy="20" r="3" />
  `),
  power: () => artSvg(`
    <polygon fill="#3a2e26" points="0,51 19,40 44,43 68,38 96,48 96,64 0,64" />
    <polygon fill="#fff2c7" opacity="0.26" points="47,4 66,34 47,60 28,34" />
    <polygon fill="#e8eef0" points="44,9 52,9 51,43 45,43" />
    <polygon fill="#f7d474" points="40,43 56,43 58,50 38,50" />
    <polygon fill="#7b4f2f" points="45,50 51,50 52,59 44,59" />
    <polygon fill="#f0b84d" points="23,30 36,27 31,36" />
    <polygon fill="#f0b84d" points="73,30 60,27 65,36" />
    <polygon fill="#ffe69f" points="47,14 50,33 46,33" />
  `),
  explosion: () => artSvg(`
    <polygon fill="#3a2a24" points="0,51 19,40 44,43 68,38 96,48 96,64 0,64" />
    <circle fill="#ff6b35" opacity="0.92" cx="49" cy="35" r="19" />
    <circle fill="#ffb45c" opacity="0.86" cx="49" cy="35" r="12" />
    <circle fill="#fff2c7" opacity="0.92" cx="49" cy="35" r="6" />
    <polygon fill="#ffb45c" points="48,6 55,25 42,25" />
    <polygon fill="#ffb45c" points="48,64 41,45 56,45" />
    <polygon fill="#ff8c3a" points="18,21 38,28 29,39" />
    <polygon fill="#ff8c3a" points="80,20 67,39 58,28" />
    <polygon fill="#ffd166" points="15,47 35,41 34,54" />
    <polygon fill="#ffd166" points="82,47 63,54 62,41" />
    <circle fill="#fff2c7" opacity="0.7" cx="33" cy="20" r="3" />
    <circle fill="#fff2c7" opacity="0.55" cx="69" cy="51" r="3" />
  `),
  critical: () => artSvg(`
    <polygon fill="#342923" points="0,51 19,40 44,43 68,38 96,48 96,64 0,64" />
    <polygon fill="#ffd166" opacity="0.28" points="48,4 58,25 82,26 63,40 70,61 48,49 26,61 33,40 14,26 38,25" />
    <polygon fill="#e8eef0" points="45,11 53,11 52,42 46,42" />
    <polygon fill="#ffd166" points="39,42 59,42 61,49 37,49" />
    <polygon fill="#6a3f2b" points="45,49 52,49 53,61 44,61" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" stroke-linecap="round" d="M24 24 L72 52" />
    <path fill="none" stroke="#ff9f43" stroke-width="3" stroke-linecap="round" d="M72 24 L24 52" />
    <circle fill="#fff2c7" cx="72" cy="24" r="5" />
    <circle fill="#ffd166" opacity="0.86" cx="24" cy="52" r="4" />
  `),
  focus: () => artSvg(`
    <polygon fill="#22313e" points="0,51 19,42 43,44 70,38 96,48 96,64 0,64" />
    <ellipse fill="#b7e8ff" opacity="0.18" cx="48" cy="38" rx="34" ry="21" />
    <circle fill="#dff8ff" opacity="0.32" cx="48" cy="35" r="24" />
    <circle fill="none" stroke="#b7e8ff" stroke-width="4" opacity="0.78" cx="48" cy="35" r="18" />
    <circle fill="none" stroke="#fff2c7" stroke-width="3" opacity="0.7" cx="48" cy="35" r="8" />
    <path fill="none" stroke="#dff8ff" stroke-width="3" stroke-linecap="round" d="M48 10 L48 22 M48 48 L48 60 M23 35 L35 35 M61 35 L74 35" />
    <polygon fill="#e8eef0" points="45,17 52,17 51,54 46,54" />
    <polygon fill="#8ac7e8" points="40,42 58,42 60,49 38,49" />
    <circle fill="#fff2c7" cx="48" cy="35" r="4" />
    <path fill="none" stroke="#b7e8ff" stroke-width="2" opacity="0.75" d="M28 54 C40 48 56 48 68 54" />
  `),
  phoenix: () => artSvg(`
    <polygon fill="#3a2e26" points="0,51 19,40 44,43 68,38 96,48 96,64 0,64" />
    <path fill="#ff6b32" d="M48 59 C31 48 26 30 38 16 C39 30 50 31 52 10 C67 22 71 42 48 59 Z" />
    <path fill="#ffd06b" d="M49 53 C39 44 38 31 46 22 C47 32 55 33 56 20 C64 31 63 43 49 53 Z" />
    <path fill="#fff2c7" d="M49 46 C45 41 46 35 50 31 C51 36 55 37 55 32 C59 38 56 43 49 46 Z" />
    <polygon fill="#ff9a47" points="34,34 15,24 27,43" />
    <polygon fill="#ff9a47" points="62,34 82,23 70,43" />
    <circle fill="#fff2c7" opacity="0.85" cx="49" cy="27" r="3" />
    <path fill="none" stroke="#fff2c7" stroke-width="2" opacity="0.7" d="M27 52 C40 60 57 60 70 52" />
  `),
  spiritWeapon: () => artSvg(`
    <polygon fill="#22313e" points="0,51 19,42 43,44 70,38 96,48 96,64 0,64" />
    <polygon fill="#dff8ff" opacity="0.22" points="48,5 70,31 48,60 26,31" />
    <polygon fill="#e8eef0" points="45,8 53,8 52,43 46,43" />
    <polygon fill="#9dd8ff" points="41,42 57,42 59,50 39,50" />
    <polygon fill="#5a3a28" points="45,50 51,50 52,60 44,60" />
    <path fill="none" stroke="#dff8ff" stroke-width="3" opacity="0.85" d="M23 40 C34 22 62 22 74 40" />
    <circle fill="#ffffff" cx="31" cy="35" r="3" />
    <circle fill="#ffffff" opacity="0.7" cx="67" cy="35" r="3" />
    <path fill="none" stroke="#fff2c7" stroke-width="2" opacity="0.64" d="M32 54 C43 48 53 48 64 54" />
  `),
  soulEater: () => artSvg(`
    <polygon fill="#302638" points="0,51 19,42 43,44 70,38 96,48 96,64 0,64" />
    <ellipse fill="#9f6bff" opacity="0.22" cx="49" cy="43" rx="35" ry="16" />
    <polygon fill="#593a78" points="49,9 70,26 63,52 49,60 35,52 28,26" />
    <polygon fill="#24172f" points="49,18 62,29 58,47 49,53 40,47 36,29" />
    <circle fill="#caa7ff" cx="42" cy="34" r="5" />
    <circle fill="#caa7ff" cx="56" cy="34" r="5" />
    <polygon fill="#caa7ff" points="45,45 53,45 49,50" />
    <path fill="none" stroke="#d8b7ff" stroke-width="2" opacity="0.7" d="M17 48 C30 29 39 57 49 38 C58 20 69 50 82 31" />
  `),
  lifesteal: () => artSvg(`
    <polygon fill="#3a2729" points="0,51 18,41 43,44 68,37 96,49 96,64 0,64" />
    <path fill="#b54848" d="M48 56 C28 42 25 24 38 16 C45 12 49 19 49 19 C49 19 54 12 61 16 C74 24 69 43 48 56 Z" />
    <path fill="#ff9b9b" opacity="0.58" d="M48 49 C36 39 35 27 42 23 C47 20 49 25 49 25 C49 25 52 20 57 23 C65 28 60 40 48 49 Z" />
    <polygon fill="#d8dde0" points="29,52 66,18 72,24 36,57" />
    <polygon fill="#5a2a2a" points="23,57 34,49 40,56 29,62" />
    <path fill="none" stroke="#fff2c7" stroke-width="2" opacity="0.55" d="M31 51 C45 45 55 36 67 23" />
  `),
  drain: () => artSvg(`
    <polygon fill="#233832" points="0,51 18,41 43,44 68,37 96,49 96,64 0,64" />
    <ellipse fill="#7fd8b0" opacity="0.18" cx="50" cy="42" rx="34" ry="17" />
    <polygon fill="#d8dde0" points="28,52 64,18 70,24 35,57" />
    <polygon fill="#4a3026" points="22,57 33,49 39,56 28,62" />
    <circle fill="#7fd8b0" cx="68" cy="22" r="8" />
    <circle fill="#b7f3dd" opacity="0.85" cx="68" cy="22" r="4" />
    <path fill="none" stroke="#7fd8b0" stroke-width="4" stroke-linecap="round" opacity="0.88" d="M74 20 C82 27 79 41 66 43 C54 45 47 37 36 47" />
    <path fill="none" stroke="#dff8ff" stroke-width="2" stroke-linecap="round" opacity="0.7" d="M72 27 C74 36 65 38 56 36 C47 34 42 41 35 50" />
    <circle fill="#7fd8b0" opacity="0.7" cx="80" cy="37" r="4" />
    <circle fill="#b7f3dd" opacity="0.6" cx="58" cy="46" r="3" />
  `),
  poison: () => artSvg(`
    <polygon fill="#253a29" points="0,51 18,41 43,44 68,37 96,49 96,64 0,64" />
    <polygon fill="#dcefd0" points="45,13 59,13 57,22 47,22" />
    <polygon fill="#a2d77a" points="35,24 67,24 72,50 51,58 30,50" />
    <polygon fill="#5f9f4f" points="39,29 64,29 67,47 51,53 35,47" />
    <circle fill="#dff6a5" cx="44" cy="41" r="4" />
    <circle fill="#dff6a5" cx="58" cy="39" r="4" />
    <polygon fill="#2b542d" points="48,48 54,48 51,52" />
    <circle fill="#98d66a" opacity="0.8" cx="70" cy="18" r="4" />
    <circle fill="#98d66a" opacity="0.55" cx="25" cy="25" r="3" />
  `),
  poisonFog: () => artSvg(`
    <polygon fill="#253a29" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#78b85a" opacity="0.32" cx="48" cy="44" rx="39" ry="14" />
    <ellipse fill="#a2d77a" opacity="0.38" cx="34" cy="38" rx="18" ry="10" />
    <ellipse fill="#5f9f4f" opacity="0.42" cx="60" cy="36" rx="23" ry="12" />
    <ellipse fill="#dff6a5" opacity="0.35" cx="51" cy="29" rx="13" ry="8" />
    <circle fill="#dff6a5" cx="35" cy="36" r="4" />
    <circle fill="#dff6a5" opacity="0.72" cx="63" cy="34" r="5" />
    <circle fill="#98d66a" opacity="0.85" cx="72" cy="24" r="4" />
    <circle fill="#98d66a" opacity="0.65" cx="23" cy="28" r="3" />
    <path fill="none" stroke="#dff6a5" stroke-width="2" opacity="0.58" d="M18 44 C33 32 47 48 61 34 C70 25 80 30 86 24" />
  `),
  whiteSmoke: () => artSvg(`
    <polygon fill="#27333a" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#eef7ff" opacity="0.42" cx="49" cy="45" rx="40" ry="14" />
    <ellipse fill="#ffffff" opacity="0.56" cx="32" cy="39" rx="19" ry="10" />
    <ellipse fill="#dbe8ef" opacity="0.64" cx="58" cy="36" rx="24" ry="13" />
    <ellipse fill="#f8fbff" opacity="0.68" cx="50" cy="28" rx="14" ry="9" />
    <circle fill="#ffffff" opacity="0.82" cx="72" cy="24" r="5" />
    <circle fill="#dff8ff" opacity="0.78" cx="24" cy="29" r="4" />
    <circle fill="#ffffff" opacity="0.72" cx="40" cy="24" r="3" />
    <path fill="none" stroke="#ffffff" stroke-width="2" opacity="0.78" d="M14 43 C29 31 43 48 56 35 C66 25 78 33 87 24" />
    <path fill="none" stroke="#dff8ff" stroke-width="2" opacity="0.55" d="M22 53 C40 43 56 56 75 43" />
  `),
  tacticEnergySmall: () => artSvg(`
    <polygon fill="#2c3040" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#7f8fc7" opacity="0.2" cx="48" cy="43" rx="35" ry="16" />
    <polygon fill="#fff2c7" points="48,6 62,31 50,31 57,58 35,26 47,26" />
    <polygon fill="#7f8fc7" points="47,13 57,29 48,29 52,47 39,28 48,28" />
    <circle fill="#dff8ff" opacity="0.75" cx="28" cy="34" r="5" />
    <circle fill="#dff8ff" opacity="0.58" cx="71" cy="25" r="4" />
    <circle fill="#fff2c7" opacity="0.7" cx="68" cy="49" r="3" />
    <path fill="none" stroke="#dff8ff" stroke-width="2" opacity="0.7" d="M21 50 C35 38 59 53 76 34" />
  `),
  tacticEnergyLarge: () => artSvg(`
    <polygon fill="#252f46" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#7f8fc7" opacity="0.26" cx="48" cy="42" rx="38" ry="18" />
    <polygon fill="#fff2c7" points="47,3 66,31 52,31 60,62 31,25 45,25" />
    <polygon fill="#ffd166" points="48,11 59,29 49,29 54,50 38,28 48,28" />
    <path fill="none" stroke="#dff8ff" stroke-width="4" opacity="0.72" d="M18 42 C32 18 64 18 79 42" />
    <circle fill="#dff8ff" cx="25" cy="43" r="4" />
    <circle fill="#dff8ff" opacity="0.72" cx="73" cy="43" r="4" />
    <circle fill="#fff2c7" opacity="0.72" cx="49" cy="20" r="4" />
  `),
  tacticUpgrade: () => artSvg(`
    <polygon fill="#302638" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#8a6fc4" opacity="0.28" points="48,5 78,27 67,58 29,58 18,27" />
    <polygon fill="#dff8ff" points="48,10 58,29 50,29 50,54 46,54 46,29 38,29" />
    <polygon fill="#fff2c7" points="31,37 65,37 65,44 31,44" />
    <polygon fill="#9f6bff" points="48,17 53,30 48,38 43,30" />
    <circle fill="#fff2c7" opacity="0.76" cx="26" cy="28" r="4" />
    <circle fill="#dff8ff" opacity="0.66" cx="70" cy="53" r="4" />
    <path fill="none" stroke="#caa7ff" stroke-width="2" opacity="0.75" d="M22 51 C34 42 58 41 74 27" />
  `),
  tacticExhaust: () => artSvg(`
    <polygon fill="#3a272c" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#f3e1c0" points="31,13 65,13 70,54 26,54" />
    <polygon fill="#9f6b70" points="35,18 61,18 64,49 32,49" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" stroke-linecap="round" d="M29 24 L67 50 M67 24 L29 50" />
    <polygon fill="#3a272c" opacity="0.72" points="24,54 72,54 67,61 29,61" />
    <circle fill="#fff2c7" opacity="0.7" cx="25" cy="19" r="4" />
    <circle fill="#ffb3b3" opacity="0.58" cx="72" cy="37" r="5" />
    <path fill="none" stroke="#ffb3b3" stroke-width="2" opacity="0.72" d="M20 47 C35 58 60 58 76 45" />
  `),
  abilityExhaustEnergy: () => artSvg(`
    <polygon fill="#203832" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#f3e1c0" points="28,15 62,12 69,50 35,56" />
    <polygon fill="#7fd8b0" points="34,21 57,19 62,45 39,49" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" stroke-linecap="round" d="M31 30 L62 42 M63 25 L35 48" />
    <polygon fill="#fff2c7" points="74,11 84,28 76,28 80,47 66,24 74,24" />
    <circle fill="#b7f3dd" opacity="0.82" cx="73" cy="48" r="5" />
  `),
  abilityPeriodicEnergy: () => artSvg(`
    <polygon fill="#252f46" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <circle fill="#7f8fc7" opacity="0.3" cx="48" cy="35" r="25" />
    <circle fill="none" stroke="#dff8ff" stroke-width="4" cx="48" cy="35" r="19" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" stroke-linecap="round" d="M48 35 L48 21 M48 35 L61 42" />
    <polygon fill="#fff2c7" points="24,41 35,28 36,45" />
    <polygon fill="#dff8ff" points="72,28 61,42 60,25" />
    <circle fill="#fff2c7" cx="48" cy="35" r="5" />
  `),
  abilityEnchantEcho: () => artSvg(`
    <polygon fill="#302638" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#b68cff" opacity="0.28" points="48,6 74,25 64,56 32,56 22,25" />
    <polygon fill="#d8dde0" points="31,51 60,20 66,26 38,56" />
    <polygon fill="#fff2c7" opacity="0.82" points="43,46 70,17 75,22 49,51" />
    <path fill="none" stroke="#caa7ff" stroke-width="3" opacity="0.85" d="M21 42 C33 24 47 58 59 38 C68 23 75 35 82 25" />
    <circle fill="#fff2c7" cx="75" cy="23" r="4" />
  `),
  abilityDeathExplosion: () => artSvg(`
    <polygon fill="#3a2a24" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#d8dde0" points="47,13 57,24 39,24" />
    <polygon fill="#6f718a" points="37,24 60,24 65,49 49,58 32,49" />
    <circle fill="#ff6b35" opacity="0.95" cx="63" cy="38" r="15" />
    <circle fill="#ffb45c" cx="63" cy="38" r="9" />
    <circle fill="#fff2c7" cx="63" cy="38" r="4" />
    <polygon fill="#ffd166" points="63,13 68,29 58,29" />
    <polygon fill="#ffd166" points="84,38 69,43 69,33" />
  `),
  abilityBuildingDurability: () => artSvg(`
    <polygon fill="#343128" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#777d78" points="21,55 75,55 68,63 28,63" />
    <polygon fill="#8b6840" points="25,30 71,30 73,55 23,55" />
    <polygon fill="#d8c58d" points="48,8 79,31 17,31" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" d="M24 51 C27 29 39 18 49 17 C61 19 71 30 73 51" />
    <polygon fill="#d8dde0" points="48,22 63,29 60,45 48,53 36,45 33,29" />
    <polygon fill="#6b9ab8" points="48,28 56,32 54,42 48,47 42,42 40,32" />
  `),
  abilityRandomHeal: () => artSvg(`
    <polygon fill="#243a2b" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#6edc8b" opacity="0.2" cx="49" cy="40" rx="36" ry="19" />
    <path fill="#6edc8b" d="M48 56 C29 43 25 25 38 17 C45 13 49 20 49 20 C49 20 54 13 61 17 C74 25 68 44 48 56 Z" />
    <polygon fill="#fff2c7" points="45,25 53,25 53,35 64,35 64,43 53,43 53,53 45,53 45,43 34,43 34,35 45,35" />
    <circle fill="#bff2c4" cx="25" cy="30" r="5" />
    <circle fill="#bff2c4" opacity="0.72" cx="74" cy="34" r="5" />
    <path fill="none" stroke="#fff2c7" stroke-width="2" opacity="0.72" d="M20 50 C33 43 63 43 77 28" />
  `),
  abilityVictoryGold: () => artSvg(`
    <polygon fill="#3a3426" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <circle fill="#ffd166" cx="48" cy="34" r="24" />
    <circle fill="#9a6b2f" opacity="0.35" cx="48" cy="34" r="18" />
    <path fill="none" stroke="#fff2c7" stroke-width="5" stroke-linecap="round" d="M38 29 C42 20 60 20 59 31 C58 44 39 35 38 47 C37 56 57 55 62 47" />
    <polygon fill="#fff2c7" points="48,4 56,17 40,17" />
    <polygon fill="#fff2c7" points="48,64 40,51 56,51" />
    <circle fill="#fff2c7" opacity="0.78" cx="75" cy="24" r="4" />
  `),
  bleed: () => artSvg(`
    <polygon fill="#3a2729" points="0,51 18,41 43,44 68,37 96,49 96,64 0,64" />
    <polygon fill="#d8dde0" points="25,50 66,15 72,21 31,56" />
    <polygon fill="#7a4c30" points="18,54 29,47 35,54 24,60" />
    <polygon fill="#ffffff" opacity="0.45" points="42,36 66,18 69,21 45,39" />
    <path fill="#d65b4f" d="M62 35 C72 43 77 50 76 56 C75 62 66 62 63 57 C60 52 63 45 62 35 Z" />
    <path fill="#8f2f36" d="M45 42 C53 48 56 54 54 59 C51 64 43 61 42 56 C41 52 45 47 45 42 Z" />
    <circle fill="#d65b4f" cx="75" cy="31" r="4" />
    <circle fill="#8f2f36" opacity="0.82" cx="30" cy="28" r="3" />
    <path fill="none" stroke="#f6c0b0" stroke-width="2" opacity="0.7" d="M28 50 C42 46 54 42 67 35" />
  `),
  recovery: () => artSvg(`
    <polygon fill="#243a2b" points="0,51 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#f5e4b7" points="45,18 54,18 54,31 67,31 67,40 54,40 54,53 45,53 45,40 32,40 32,31 45,31" />
    <path fill="#6edc8b" d="M50 38 C42 27 35 22 25 20 C27 34 36 41 50 38 Z" />
    <path fill="#4b9f65" d="M50 39 C59 27 68 22 80 22 C78 36 66 43 50 39 Z" />
    <path fill="none" stroke="#fff2c7" stroke-width="2" d="M30 24 C39 30 44 34 50 38 C59 33 66 29 76 25" />
    <circle fill="#bff2c4" opacity="0.8" cx="29" cy="48" r="3" />
    <circle fill="#bff2c4" opacity="0.65" cx="73" cy="47" r="4" />
  `),
  spiritShield: () => artSvg(`
    <polygon fill="#22313e" points="0,51 19,42 43,44 70,38 96,48 96,64 0,64" />
    <ellipse fill="#dcefff" opacity="0.22" cx="50" cy="38" rx="34" ry="21" />
    <path fill="none" stroke="#f7fbff" stroke-width="3" d="M18 39 C30 17 68 17 82 39 C68 57 31 57 18 39 Z" />
    <polygon fill="#f7fbff" points="50,14 68,23 64,44 50,56 36,44 32,23" />
    <polygon fill="#8fb7dc" points="50,20 61,26 58,40 50,49 42,40 39,26" />
    <circle fill="#ffffff" cx="32" cy="25" r="3" />
    <circle fill="#ffffff" opacity="0.7" cx="71" cy="48" r="3" />
    <circle fill="#ffffff" opacity="0.55" cx="78" cy="28" r="2" />
  `),
  waveSwarm: () => artSvg(`
    <polygon fill="#223827" points="0,51 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#93c86f" opacity="0.2" cx="50" cy="40" rx="36" ry="18" />
    <polygon fill="#93c86f" points="47,12 58,23 52,41 39,41 33,23" />
    <polygon fill="#3f6f35" points="47,19 53,25 50,38 41,38 38,25" />
    <path fill="none" stroke="#d7f6b8" stroke-width="3" stroke-linecap="round" d="M20 47 C30 33 40 39 49 27 C57 16 69 22 78 12" />
    <path fill="none" stroke="#93c86f" stroke-width="3" stroke-linecap="round" d="M17 55 C31 43 45 47 57 36 C66 28 72 31 82 24" />
    <circle fill="#d7f6b8" cx="27" cy="39" r="4" />
    <circle fill="#d7f6b8" opacity="0.72" cx="66" cy="25" r="4" />
    <polygon fill="#fff2c7" points="39,18 31,9 36,27" />
    <polygon fill="#fff2c7" points="56,18 65,9 59,27" />
  `),
  waveArmored: () => artSvg(`
    <polygon fill="#26343b" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <path fill="#9fb1c1" opacity="0.24" d="M19 52 C22 28 38 12 49 10 C65 14 77 29 79 52 C62 60 36 60 19 52 Z" />
    <path fill="none" stroke="#e8eef0" stroke-width="3" d="M19 52 C22 28 38 12 49 10 C65 14 77 29 79 52" />
    <polygon fill="#9fb1c1" points="49,16 69,25 64,47 49,57 34,47 29,25" />
    <polygon fill="#56636b" points="49,23 60,29 57,42 49,49 41,42 38,29" />
    <polygon fill="#d8c58d" points="47,20 52,20 52,53 47,53" />
    <polygon fill="#d8c58d" points="34,34 64,34 64,39 34,39" />
    <circle fill="#eef7ff" cx="29" cy="26" r="3" />
    <circle fill="#eef7ff" opacity="0.65" cx="73" cy="45" r="3" />
  `),
  waveRush: () => artSvg(`
    <polygon fill="#3a3426" points="0,51 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#ffd166" opacity="0.28" points="22,53 44,9 43,32 68,16 54,41 79,38 48,59" />
    <polygon fill="#d7a878" points="47,12 56,23 40,23" />
    <polygon fill="#8f5d2c" points="38,24 60,24 64,47 49,56 34,47" />
    <polygon fill="#2b241f" points="39,47 48,47 45,59 37,59" />
    <polygon fill="#2b241f" points="52,47 61,47 63,59 54,59" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" stroke-linecap="round" d="M18 45 C34 39 44 31 55 18" />
    <path fill="none" stroke="#ffd166" stroke-width="3" stroke-linecap="round" d="M28 56 C45 51 58 42 75 23" />
    <polygon fill="#fff2c7" points="70,18 84,17 76,30" />
  `),
  waveRanged: () => artSvg(`
    <polygon fill="#22313e" points="0,51 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#b7e8ff" opacity="0.2" cx="50" cy="36" rx="36" ry="20" />
    <path fill="none" stroke="#4a3026" stroke-width="4" stroke-linecap="round" d="M68 13 C86 27 85 49 67 59" />
    <path fill="none" stroke="#dff8ff" stroke-width="2" d="M68 13 L67 59" />
    <polygon fill="#dff8ff" points="21,34 75,32 75,37 21,39" />
    <polygon fill="#b7e8ff" points="75,31 88,35 75,39" />
    <path fill="none" stroke="#dff8ff" stroke-width="2" opacity="0.75" d="M18 25 C35 19 54 18 77 12" />
    <path fill="none" stroke="#b7e8ff" stroke-width="2" opacity="0.72" d="M15 48 C35 42 56 43 82 34" />
    <circle fill="#dff8ff" cx="32" cy="25" r="3" />
    <circle fill="#dff8ff" opacity="0.62" cx="61" cy="45" r="3" />
  `),
  waveSiege: () => artSvg(`
    <polygon fill="#3a2a24" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#ffb45c" opacity="0.22" cx="50" cy="45" rx="35" ry="16" />
    <polygon fill="#6d4a2c" points="27,15 35,11 76,54 68,59" />
    <polygon fill="#8b6037" points="22,13 36,8 43,18 28,24" />
    <circle fill="#ff6b35" cx="65" cy="42" r="16" />
    <circle fill="#ffb45c" cx="65" cy="42" r="9" />
    <circle fill="#fff2c7" cx="65" cy="42" r="4" />
    <polygon fill="#ffd166" points="65,16 70,33 59,33" />
    <polygon fill="#ffd166" points="87,42 70,47 70,36" />
    <polygon fill="#fff2c7" opacity="0.68" points="39,21 66,47 62,50 35,24" />
  `),
  wolfInstinct: () => artSvg(`
    <polygon fill="#26333a" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <path fill="#dbe8e9" opacity="0.18" d="M17 49 C30 31 41 20 51 18 C65 20 76 32 82 50 C64 58 35 58 17 49 Z" />
    <polygon fill="#8ea7b8" points="48,11 61,24 58,43 49,55 38,43 35,24" />
    <polygon fill="#5f7380" points="48,17 57,27 55,41 49,49 41,41 39,27" />
    <polygon fill="#dbe8e9" points="36,24 25,14 31,32" />
    <polygon fill="#dbe8e9" points="60,24 72,14 65,32" />
    <polygon fill="#142126" points="43,33 47,36 42,37" />
    <polygon fill="#142126" points="54,33 50,36 55,37" />
    <polygon fill="#eef5e8" points="47,42 51,42 49,46" />
    <path fill="none" stroke="#dbe8e9" stroke-width="2" opacity="0.8" d="M18 51 C29 42 39 38 49 38 C59 38 70 42 82 51" />
    <circle fill="#dbe8e9" opacity="0.65" cx="24" cy="44" r="3" />
    <circle fill="#dbe8e9" opacity="0.55" cx="74" cy="44" r="3" />
    <circle fill="#dbe8e9" opacity="0.45" cx="49" cy="53" r="2" />
  `),
  ursineSpirit: () => artSvg(`
    <polygon fill="#3b3028" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#ffe3a0" opacity="0.2" cx="50" cy="38" rx="35" ry="22" />
    <polygon fill="#b98758" points="48,9 64,22 67,41 58,55 39,55 29,41 32,22" />
    <polygon fill="#7a513b" points="48,17 59,26 61,40 54,49 42,49 35,40 38,26" />
    <circle fill="#b98758" cx="34" cy="20" r="8" />
    <circle fill="#b98758" cx="62" cy="20" r="8" />
    <circle fill="#2b201b" cx="43" cy="34" r="3" />
    <circle fill="#2b201b" cx="54" cy="34" r="3" />
    <polygon fill="#fff2c7" points="45,42 51,42 48,47" />
    <path fill="none" stroke="#ffe3a0" stroke-width="3" opacity="0.72" d="M21 47 C28 27 39 15 48 12 C59 15 70 27 77 47" />
    <polygon fill="#ffe3a0" opacity="0.75" points="22,38 34,34 29,45" />
    <polygon fill="#ffe3a0" opacity="0.75" points="74,38 62,34 67,45" />
  `),
  default: () => artSvg(`
    <polygon fill="#2d3f36" points="0,51 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#fff2c7" opacity="0.8" points="48,10 68,32 48,54 28,32" />
    <polygon fill="#6ea370" points="48,17 61,32 48,47 35,32" />
  `)
};

function artSvg(content) {
  return `
    <svg class="card-art-svg" viewBox="0 0 96 64" focusable="false" aria-hidden="true">
      <polygon fill="rgba(255,255,255,0.08)" points="0,0 96,0 96,64 0,64" />
      <polygon fill="rgba(255,255,255,0.1)" points="0,0 42,0 23,24 0,36" />
      <polygon fill="rgba(0,0,0,0.1)" points="96,0 96,64 66,64 76,28" />
      ${content}
    </svg>
  `;
}

export function cardEnergyCost(card) {
  return card.energyCost ?? 1;
}

function formatEnergy(value) {
  const stepped = Math.floor(value * 10 + 0.0001) / 10;
  return Number.isInteger(stepped) ? String(stepped) : stepped.toFixed(1);
}

function discardEnergyCost(card) {
  return Math.max(1, Math.ceil(cardEnergyCost(card) * 0.5));
}

function parseCssNumber(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function sampleDiscardFrame(keyframes, progress) {
  const nextIndex = keyframes.findIndex((frame) => progress <= frame.offset);
  if (nextIndex === -1) return keyframes[keyframes.length - 1];
  if (nextIndex === 0) return keyframes[0];
  const previous = keyframes[nextIndex - 1];
  const next = keyframes[nextIndex];
  const localProgress = clamp01(
    (progress - previous.offset) / (next.offset - previous.offset)
  );
  return {
    y: lerp(previous.y, next.y, localProgress),
    rotate: lerp(previous.rotate, next.rotate, localProgress),
    scale: lerp(previous.scale, next.scale, localProgress),
    opacity: lerp(previous.opacity, next.opacity, localProgress),
    blur: lerp(previous.blur, next.blur, localProgress),
    brightness: lerp(previous.brightness, next.brightness, localProgress),
    saturate: lerp(previous.saturate, next.saturate, localProgress)
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
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

function createTemporaryCardSlot(anchor) {
  const existing = document.querySelector('#temporary-card-slot');
  if (existing) return existing;
  const slot = document.createElement('section');
  slot.id = 'temporary-card-slot';
  slot.className = 'temporary-card-slot';
  slot.setAttribute('aria-label', 'temporary card slot');
  anchor.before(slot);
  return slot;
}

function collectEnergyPanel(panel) {
  if (!panel.querySelector('.energy-value')) {
    const cells = Array.from({ length: MAX_ENERGY }, () => '<span class="energy-cell"></span>').join('');
    panel.innerHTML = `
      <div class="energy-title">
        <span>能量</span>
        <strong class="energy-value">0/${MAX_ENERGY}</strong>
      </div>
      <div class="ability-icon-row" hidden></div>
      <div class="energy-cells">${cells}</div>
      <div class="energy-progress"><div class="energy-progress-fill"></div></div>
    `;
  } else if (!panel.querySelector('.ability-icon-row')) {
    const row = document.createElement('div');
    row.className = 'ability-icon-row';
    row.hidden = true;
    panel.querySelector('.energy-cells')?.before(row);
  }
  return {
    value: panel.querySelector('.energy-value'),
    cells: [...panel.querySelectorAll('.energy-cell')],
    abilities: panel.querySelector('.ability-icon-row')
  };
}

function createGameHintPanel(anchor) {
  const existing = document.querySelector('#game-hint-panel');
  if (existing) return existing;
  const panel = document.createElement('div');
  panel.id = 'game-hint-panel';
  panel.className = 'game-hint-panel';
  panel.setAttribute('aria-live', 'polite');
  panel.hidden = true;
  anchor.before(panel);
  return panel;
}

function fitCardElementText(element) {
  window.requestAnimationFrame(() => {
    fitTextBlock(element.querySelector('.card-name'), 15, 11);
    const text = element.querySelector('.card-text');
    fitTextBlock(text, 11, 8);
    element.classList.toggle(
      'has-scrollable-text',
      Boolean(text && text.scrollHeight > text.clientHeight + 1)
    );
  });
}

function bindScrollableCardText(element) {
  const text = element.querySelector('.card-text');
  if (!text) return;
  const shouldScrollText = () => (
    text.scrollHeight > text.clientHeight + 1 || text.scrollWidth > text.clientWidth + 1
  );
  text.addEventListener('pointerdown', (event) => {
    if (!shouldScrollText()) return;
    event.stopPropagation();
  });
  text.addEventListener('wheel', (event) => {
    if (!shouldScrollText()) return;
    event.stopPropagation();
  }, { passive: true });
}

function scheduleDrawnClassCleanup(element) {
  const cleanup = () => element.classList.remove('is-drawn');
  element.addEventListener('animationend', cleanup, { once: true });
  window.setTimeout(cleanup, 900);
}

function fitTextBlock(node, maxSize, minSize) {
  if (!node) return;
  node.style.fontSize = '';
  node.style.lineHeight = '';
  let size = maxSize;
  while (size > minSize && (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth)) {
    size -= 0.5;
    node.style.fontSize = `${size}px`;
    node.style.lineHeight = size <= 9 ? '1.14' : '1.2';
  }
}

function createDeploymentDimPlane() {
  const width = BALANCE.battlefield.halfWidth * 2 + 18;
  const depth = BALANCE.battlefield.maxZ - BALANCE.battlefield.minZ + 18;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    basicMat('#020506', {
      transparent: true,
      opacity: 0.46,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    }).clone()
  );
  plane.name = 'DeploymentDimPlane';
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, 0.035, (BALANCE.battlefield.minZ + BALANCE.battlefield.maxZ) / 2);
  plane.renderOrder = 40;
  plane.visible = false;
  return plane;
}

function createPileUi() {
  const existingRoot = document.querySelector('#card-pile-dock');
  const existingViewer = document.querySelector('#pile-viewer');
  if (existingRoot && existingViewer) {
    return collectPileUi(existingRoot, existingViewer);
  }

  const root = document.createElement('section');
  root.id = 'card-pile-dock';
  root.className = 'card-pile-dock';
  root.setAttribute('aria-label', 'card piles');
  root.innerHTML = `
    <button class="pile-button is-draw" type="button" aria-label="查看抽牌堆">
      <span class="pile-stack-icon" aria-hidden="true"><span>抽</span></span>
      <span class="pile-count">0</span>
    </button>
    <button class="pile-button is-discard" type="button" aria-label="查看弃牌堆">
      <span class="pile-stack-icon" aria-hidden="true"><span>弃</span></span>
      <span class="pile-count">0</span>
    </button>
  `;

  const viewer = document.createElement('section');
  viewer.id = 'pile-viewer';
  viewer.className = 'pile-viewer';
  viewer.hidden = true;
  viewer.setAttribute('aria-modal', 'true');
  viewer.setAttribute('role', 'dialog');
  viewer.innerHTML = `
    <div class="pile-viewer-panel">
      <header class="pile-viewer-header">
        <div>
          <div class="pile-viewer-title">抽牌堆</div>
          <div class="pile-viewer-count"><strong>0</strong></div>
        </div>
        <button class="pile-viewer-close" type="button" aria-label="关闭">×</button>
      </header>
      <div class="pile-viewer-grid"></div>
    </div>
  `;

  document.body.append(root, viewer);
  return collectPileUi(root, viewer);
}

function collectPileUi(root, viewer) {
  return {
    root,
    viewer,
    drawButton: root.querySelector('.pile-button.is-draw'),
    discardButton: root.querySelector('.pile-button.is-discard'),
    drawCount: root.querySelector('.pile-button.is-draw .pile-count'),
    discardCount: root.querySelector('.pile-button.is-discard .pile-count'),
    viewerTitle: viewer.querySelector('.pile-viewer-title'),
    viewerCount: viewer.querySelector('.pile-viewer-count strong'),
    viewerGrid: viewer.querySelector('.pile-viewer-grid'),
    closeButton: viewer.querySelector('.pile-viewer-close')
  };
}

function createPileCardElement(card, index) {
  const element = document.createElement('article');
  element.className = 'pile-card';
  element.dataset.cardId = card.id;
  element.dataset.pileIndex = String(index);
  element.style.setProperty('--card-color', cardThemeColor(card));
  element.innerHTML = `
    <div class="pile-card-cost">${cardEnergyCost(card)}</div>
    <div class="pile-card-level">Lv.${card.level ?? 1}</div>
    ${createCardUseBarMarkup(card, 'pile-card')}
    ${shouldExhaustAfterPlay(card) ? '<div class="pile-card-keyword">消耗</div>' : ''}
    <div class="pile-card-header">
      <span class="pile-card-rune">${card.label}</span>
      <span class="pile-card-kind">${kindLabel(card.kind)}</span>
    </div>
    ${createCardArtMarkup(card)}
    <div class="pile-card-name">${card.name}</div>
    <div class="pile-card-text">${card.summary}</div>
  `;
  return element;
}

function stopUiEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}
