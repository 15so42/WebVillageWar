import * as THREE from 'three';
import { basicMat, createReticle } from '../art/lowpoly.js';
import { ACTIVE_DECK_SIZE, BALANCE, CARD_DEFINITIONS, isTerrainCard, TERRAIN_CARD_COOLDOWN_SECONDS } from '../data/gameData.js';
import { insideBattlefield } from '../utils/math.js';
import { disposeObject3D } from '../utils/dispose.js';

const HAND_SIZE = 5;
const energyBalance = BALANCE.playerEnergy ?? {};
const INITIAL_ENERGY = Number(energyBalance.initial) || 4;
const MAX_ENERGY = Number(energyBalance.max) || 12;
const TEMPORARY_CARD_LIMIT = 3;
const PLAY_DRAG_RATIO = 0.5;
const DISCARD_DRAG_RATIO = 0.3;
const PLAY_DRAG_MIN_DISTANCE = 24;
const DISCARD_FALL_DELAY_MS = 500;
const TEMPORARY_CARD_EFFECT_LIMIT = 6;
const CARD_USAGE_HINT = '上滑使用 / 下滑丢弃';
const CARD_KIND_COLORS = {
  summon: '#4f7d64',
  enchant: '#8a6fc4',
  spell: '#3f7fa7',
  building: '#8b6840',
  tactic: '#6f718a',
  ability: '#5f8f9f'
};
const CARD_RANGE_DISC_RENDER_ORDER = 62;
const CARD_RANGE_RING_RENDER_ORDER = 63;

export class CardSystem {
  constructor(game, options = {}) {
    this.game = game;
    this.playerSlot = options.playerSlot ?? 'p1';
    this.mountUi = options.mountUi !== false;
    const normalizedDeck = normalizeDeck(options.deck ?? CARD_DEFINITIONS);
    const activeDeckSize = Math.min(
      normalizedDeck.length,
      Math.max(1, options.activeDeckSize ?? ACTIVE_DECK_SIZE)
    );
    const shuffledDeck = shuffleCards([...normalizedDeck]);
    this.cards = normalizedDeck;
    this.reservePile = options.startWithEmptyDrawPile ? [...shuffledDeck] : shuffledDeck.splice(activeDeckSize);
    this.energy = INITIAL_ENERGY;
    this.energyTimer = 0;
    this.lastRenderedEnergy = -1;
    this.lastRenderedProgress = -1;
    this.drawPile = options.startWithEmptyDrawPile ? [] : shuffledDeck;
    this.discardPile = [];
    this.handCards = [];
    this.temporaryCards = [];
    this.runtimeCardLevelBonuses = new Map();
    this.runtimeCardUpgrades = new Map();
    this.cardCooldownUntil = new Map();
    this.cooldownClock = 0;
    this.lastNetworkPlayRejectionReason = null;
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
    this.hand = this.mountUi
      ? document.querySelector('#card-hand')
      : document.createElement('div');
    if (!this.mountUi) {
      this.hand.hidden = true;
    }
    this.energyPanel = createEnergyPanel(this.hand, this.mountUi);
    this.temporarySlot = createTemporaryCardSlot(this.energyPanel, this.mountUi);
    this.energyParts = collectEnergyPanel(this.energyPanel);
    this.abilityIcons = this.energyParts.abilities;
    this.coreIcons = this.energyParts.cores;
    this.hintPanel = createGameHintPanel(this.energyPanel, this.mountUi);
    this.hintOwner = null;
    this.activePileViewer = null;
    this.pileUi = createPileUi(this.mountUi);
    this.bindPileUi();
    if (!options.startWithEmptyDrawPile) {
      this.drawToFullHand();
    }
    this.updateEnergyUi(true);
    this.renderHand();
    this.renderTemporaryCards();
    this.updatePileUi();
  }

  ensureOpeningCardKind(kind) {
    if (!kind || this.handCards.some((card) => card?.kind === kind)) return false;
    const drawIndex = this.drawPile.findIndex((card) => card?.kind === kind);
    if (drawIndex < 0 || this.handCards.length === 0) return false;

    const [guaranteedCard] = this.drawPile.splice(drawIndex, 1);
    const replacementIndex = this.handCards.length - 1;
    const replacedCard = this.handCards[replacementIndex];
    this.handCards[replacementIndex] = guaranteedCard;
    if (replacedCard) {
      this.drawPile.splice(Math.floor(Math.random() * (this.drawPile.length + 1)), 0, replacedCard);
    }
    this.renderHand();
    this.updatePileUi();
    return true;
  }

  update(dt) {
    this.cooldownClock += Math.max(0, Number(dt) || 0);
    const previousEnergy = this.energy;
    this.updateEnergyUi();
    if (previousEnergy !== this.energy) {
      this.updateCardAffordability();
    }
    this.updateCardCooldownUi();
  }

  markNetworkStateDirty() {
    this.game.networkBridge?.markPrivateStateDirty?.(this.playerSlot);
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
    this.markNetworkStateDirty();
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
    this.markNetworkStateDirty();
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
        element.dataset.cost = cardEnergyCost(card);
    element.dataset.kind = card.kind;
    element.innerHTML = `
      <div class="med-card-wrapper">
        <div class="med-card-bg"></div>
        <div class="med-card-cost"><span>${cardEnergyCost(card)}</span></div>
        <div class="med-card-level" hidden>Lv.${card.level ?? 1}</div>
        ${cardUseBarMarkup(card)}
        ${cardCooldownOverlayMarkup(this, card)}
        <div class="med-card-face">
          <div class="med-card-art-container">
            ${createCardArtMarkup(card)}
          </div>
          <div class="med-card-bottom">
            <div class="med-card-name">${card.name}</div>
            <div class="med-card-desc">${card.summary}</div>
          </div>
        </div>
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
    this.markNetworkStateDirty();
  }

  startDrag(event, card) {
    if (event.button !== 0) return;
    if (this.isCardOnCooldown(card) && !this.canSpend(discardEnergyCost(card))) {
      this.flashEnergyPanel();
      return;
    }
    if (!this.isCardOnCooldown(card) && !this.canSpend(cardEnergyCost(card)) && !this.canSpend(discardEnergyCost(card))) {
      this.flashEnergyPanel();
      return;
    }
    this.cancelActiveDrag(event);
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
    document.addEventListener('pointerup', this.onPointerUp);
    document.addEventListener('pointercancel', this.onPointerCancel);
    this.updateDeploymentRangePreview(card, false);
    this.updateDrag(event);
  }

  onPointerMove = (event) => {
    this.updateDrag(event);
  };

  onPointerUp = (event) => {
    this.finishDrag(event);
  };

  onPointerCancel = (event) => {
    // Mobile browsers cancel the pointer when a pan/scroll gesture wins.
    // Never treat cancel as a play/discard release.
    this.cancelActiveDrag(event);
  };

  finishDrag(event) {
    if (!this.drag) return;
    this.updateDrag(event);
    const drag = this.drag;
    const shouldDiscard = drag.mode === 'discard' && drag.canPayDiscard;
    const releaseDistance = Math.hypot(
      event.clientX - drag.startX,
      event.clientY - drag.startY
    );
    const shouldPlay = drag.mode === 'play'
      && drag.valid
      && releaseDistance >= PLAY_DRAG_MIN_DISTANCE;
    if (shouldDiscard) {
      this.cleanupDrag(event, { preserveSourceElement: true });
      this.discardDraggedCard(drag);
    } else if (shouldPlay) {
      this.cleanupDrag(event);
      this.playDraggedCard(drag);
    } else {
      this.cleanupDrag(event);
    }
  }

  cancelActiveDrag(event = null) {
    if (!this.drag) return;
    this.cleanupDrag(event ?? { pointerId: null });
  }

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
    this.drag.canPayPlay = !this.isCardOnCooldown(this.drag.card) && this.canSpend(cardEnergyCost(this.drag.card));
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
    const previewRadius = this.resolveGroundPreviewRadius(this.drag.card);
    this.showGroundPreview(point, previewRadius, this.drag.valid, this.drag.card);
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
    const ownedUnits = this.game.friendlyUnits.filter((unit) => (
      this.game.unitBelongsToPlayer?.(unit, this.playerSlot) ?? true
    ));
    const objects = ownedUnits.flatMap((unit) => unit.mesh.children);
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
    ownedUnits.forEach((unit) => {
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

  resolveGroundPreviewRadius(card) {
    const baseRadius = Math.max(0.5, card?.radius ?? 1);
    if (card?.kind !== 'spell' && card?.effect?.type !== 'create-area-effect') {
      return baseRadius;
    }
    const level = Math.max(1, Math.floor(card?.level ?? 1));
    const bonusLevel = Math.max(0, level - 1);
    const effect = card.effect ?? {};
    let radius = baseRadius;
    if (card.kind === 'spell') {
      radius = baseRadius * (1 + 0.06 * bonusLevel);
    } else if (Number.isFinite(effect.radiusPerLevel)) {
      radius = baseRadius + effect.radiusPerLevel * bonusLevel;
    } else {
      radius = baseRadius * (1 + 0.06 * bonusLevel);
    }
    return this.game.scaleSpellAreaRadius?.(radius) ?? radius;
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
      return (this.game.getSummonDeploymentAnchors?.(this.playerSlot) ?? []).map((anchor) => ({
        ...anchor,
        kind: 'summon',
        color: '#6adbb8',
        ringColor: '#c6ffea'
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
        valid ? '可放置信标：可在任意可通行地面建立前线部署点。' : '信标必须放在可通行地面。',
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
    const playIntent = deltaY <= -this.drag.playThreshold;
    const dragDistance = Math.hypot(
      event.clientX - this.drag.startX,
      event.clientY - this.drag.startY
    );
    const fieldPlayIntent = !targetsHandCard && dragDistance >= PLAY_DRAG_MIN_DISTANCE && deltaY < 0;
    if (!targetsHandCard && !playIntent && !fieldPlayIntent) {
      if (this.isPointerBlockedByCardUi(event.clientX, event.clientY)) {
        return 'idle';
      }
    }
    if (playIntent) return 'play';
    if (dragDistance < PLAY_DRAG_MIN_DISTANCE) return 'idle';
    if (targetsHandCard) return 'play';
    return 'play';
  }

  isPointerBlockedByCardUi(x, y) {
    const element = document.elementFromPoint(x, y);
    const blocker = element?.closest?.(
      '.card:not(.is-dragging), .card-pile-dock, .pile-viewer, .strategy-event-overlay:not([hidden])'
    );
    return Boolean(blocker);
  }

  cleanupDrag(event, { preserveSourceElement = false } = {}) {
    const drag = this.drag;
    if (!drag) return;
    if (event?.pointerId != null) {
      drag.sourceElement?.releasePointerCapture?.(event.pointerId);
    }
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
    document.removeEventListener('pointerup', this.onPointerUp);
    document.removeEventListener('pointercancel', this.onPointerCancel);
  }

  playDraggedCard(drag) {
    if (this.game.networkBridge?.shouldRouteLocalCommands?.()) {
      return this.sendPlayCardCommand(drag);
    }
    if (this.isCardOnCooldown(drag.card)) return false;
    const cost = cardEnergyCost(drag.card);
    if (!this.canSpend(cost)) {
      this.flashEnergyPanel();
      return false;
    }
    if (!this.resolveCard(drag)) return false;
    this.spendEnergy(cost);
    this.game.runCardsPlayedCount = (this.game.runCardsPlayedCount ?? 0) + 1;
    this.game.abilitiesFor?.(this.playerSlot)?.onCardPlayed(drag.card, drag);
    if (isTerrainCard(drag.card)) {
      this.startCardCooldown(drag.card);
      this.renderHand();
      this.updateCardAffordability();
      return true;
    }
    this.moveCardToDiscard(drag.card);
    return true;
  }

  discardDraggedCard(drag) {
    if (this.game.networkBridge?.shouldRouteLocalCommands?.()) {
      return this.sendDiscardCardCommand(drag);
    }
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
    this.consumeCardUse(card);
    const exhausted = shouldExhaustAfterPlay(card);
    const spent = this.isCardSpent(card);
    const temporaryIndex = this.temporaryCards.indexOf(card);
    if (temporaryIndex !== -1) {
      this.temporaryCards.splice(temporaryIndex, 1);
      if (exhausted || spent) {
        this.game.abilitiesFor?.(this.playerSlot)?.onCardExhausted?.(card);
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
    if (exhausted || spent) {
      this.game.abilitiesFor?.(this.playerSlot)?.onCardExhausted?.(card);
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
    if (!cardHasUseLimit(card)) return 0;
    ensureCardUses(card);
    const before = card.remainingUses;
    card.remainingUses = Math.max(0, before - 1);
    return before > card.remainingUses ? 1 : 0;
  }

  isCardSpent(card) {
    if (!card) return true;
    if (!cardHasUseLimit(card)) return false;
    ensureCardUses(card);
    return card.remainingUses <= 0;
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
    return upgraded || levels > 0;
  }

  countDeckCardsById(cardId) {
    if (!cardId) return 0;
    return this.allDeckCards().filter((card) => card.id === cardId).length;
  }

  removeCardFamily(cardId) {
    if (!cardId) return false;
    let removed = false;
    const piles = [
      this.handCards,
      this.temporaryCards,
      this.drawPile,
      this.discardPile,
      this.reservePile
    ];
    piles.forEach((pile) => {
      for (let index = pile.length - 1; index >= 0; index -= 1) {
        if (pile[index]?.id !== cardId) continue;
        pile.splice(index, 1);
        removed = true;
      }
    });
    if (!removed) return false;
    this.renderHand();
    this.renderTemporaryCards();
    this.updatePileUi();
    this.updateCardAffordability();
    return true;
  }

  applyRuntimeUpgrade(card, upgrade) {
    if (!card?.id || !upgrade?.id) return false;
    const record = this.ensureRuntimeUpgradeRecord(card.id);
    if (upgrade.kind === 'unit-special' && record.unitUpgradeIds.includes(upgrade.id)) {
      return false;
    }
    const levelBonus = Math.max(0, Math.floor(upgrade.levelBonus ?? 1));
    if (levelBonus > 0) {
      const currentBonus = this.runtimeCardLevelBonuses.get(card.id) ?? 0;
      this.runtimeCardLevelBonuses.set(card.id, currentBonus + levelBonus);
    }
    record.upgradeIds.push(upgrade.id);
    if (upgrade.kind === 'unit-generic' || upgrade.kind === 'unit-special') {
      record.unitUpgradeIds.push(upgrade.id);
    }
    this.syncRuntimeCardUpgrades(card.id);
    return true;
  }

  ensureRuntimeUpgradeRecord(cardId) {
    if (!this.runtimeCardUpgrades.has(cardId)) {
      this.runtimeCardUpgrades.set(cardId, {
        upgradeIds: [],
        unitUpgradeIds: []
      });
    }
    return this.runtimeCardUpgrades.get(cardId);
  }

  runtimeUpgradesForCard(cardOrId) {
    const cardId = typeof cardOrId === 'string' ? cardOrId : cardOrId?.id;
    const record = this.runtimeCardUpgrades.get(cardId);
    return {
      upgradeIds: [...(record?.upgradeIds ?? [])],
      unitUpgradeIds: [...(record?.unitUpgradeIds ?? [])]
    };
  }

  syncRuntimeCardUpgrades(cardId) {
    let updated = false;
    this.allDeckCards().forEach((candidate) => {
      if (candidate.id !== cardId) return;
      Object.assign(candidate, this.applyRuntimeCardLevel(candidate));
      this.pendingDrawAnimations.add(candidate);
      updated = true;
    });
    if (updated) {
      this.renderHand();
      this.renderTemporaryCards();
      this.updatePileUi();
    }
    return updated;
  }

  restoreCardUses(card) {
    return Boolean(card && this.allDeckCards().includes(card));
  }

  restoreCardFamilyUses(card) {
    if (!card?.id) return false;
    return this.allDeckCards().some((candidate) => candidate.id === card.id);
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
    const { maxUses: _maxUses, remainingUses: _remainingUses, instanceId: _instanceId, ...template } = card;
    const newCard = createCardInstance(
      this.applyRuntimeCardLevel(template, { applyRuntimeLevelBonus: false }),
      options.prefix ?? `copy-${Date.now()}`
    );
    const handSlot = this.findEmptyHandSlotIndex();
    if (handSlot >= 0) {
      this.handCards[handSlot] = newCard;
      this.pendingDrawAnimations.add(newCard);
      this.renderHand();
      this.updatePileUi();
      this.updateCardAffordability();
      return { added: true, location: 'hand', card: newCard };
    }
    this.drawPile.unshift(newCard);
    this.updatePileUi();
    return { added: true, location: 'draw', card: newCard };
  }

  findEmptyHandSlotIndex() {
    for (let index = 0; index < HAND_SIZE; index += 1) {
      if (!this.handCards[index]) return index;
    }
    return -1;
  }

  allDeckCards() {
    const seen = new Set();
    return [
      ...this.handCards,
      ...this.temporaryCards,
      ...this.drawPile,
      ...this.discardPile,
      ...this.reservePile
    ].filter((card) => {
      if (!card || seen.has(card.instanceId)) return false;
      seen.add(card.instanceId);
      return true;
    });
  }

  activeRunCards() {
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
    void card;
    return 0;
  }

  increaseUsesForKind(kind, amount = 1) {
    void kind;
    void amount;
    return 0;
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
      this.game.abilitiesFor?.(this.playerSlot)?.onCardExhausted(target);
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
      this.updateCardAffordability();
      return { added: true, location: 'temporary', card };
    }
    this.drawPile.unshift(card);
    this.updatePileUi();
    return { added: true, location: 'draw', card };
  }

  addTemporaryCard(cardDefinition, options = {}) {
    if (!cardDefinition) return { added: false, location: 'none' };
    if (this.temporaryCards.length >= TEMPORARY_CARD_LIMIT) {
      return { added: false, location: 'none' };
    }
    const definition = {
      ...cardDefinition,
      energyCost: options.energyCost ?? cardDefinition.energyCost ?? 0
    };
    const card = createCardInstance(
      this.applyRuntimeCardLevel(definition, options),
      options.prefix ?? `temporary-${Date.now()}`
    );
    this.temporaryCards.push(card);
    this.pendingDrawAnimations.add(card);
    this.renderTemporaryCards();
    this.updatePileUi();
    this.updateCardAffordability();
    return { added: true, location: 'temporary', card };
  }

  addCardToDrawPile(cardDefinition, options = {}) {
    if (!cardDefinition) return { added: false, location: 'none' };
    const card = createCardInstance(
      this.applyRuntimeCardLevel(cardDefinition, options),
      options.prefix ?? `reward-${Date.now()}`
    );
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
    const card = createCardInstance(
      this.applyRuntimeCardLevel(cardDefinition, options),
      `debug-${Date.now()}`
    );

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

  drawTemporaryCards(count = 1, options = {}) {
    const targetCount = Math.max(1, Math.floor(count));
    const overflowToDrawTop = options.overflowToDrawTop === true;
    const defaultLimit = overflowToDrawTop ? TEMPORARY_CARD_EFFECT_LIMIT : TEMPORARY_CARD_LIMIT;
    const temporaryLimit = Math.max(
      TEMPORARY_CARD_LIMIT,
      Math.floor(options.temporaryLimit ?? defaultLimit)
    );
    const overflowCards = [];
    let visibleDrawn = 0;
    let resolved = 0;
    while (resolved < targetCount) {
      const card = this.drawCard();
      if (!card) break;
      if (this.temporaryCards.length < temporaryLimit) {
        this.temporaryCards.push(card);
        this.pendingDrawAnimations.add(card);
        visibleDrawn += 1;
      } else if (overflowToDrawTop) {
        overflowCards.push(card);
      } else {
        this.drawPile.unshift(card);
        break;
      }
      resolved += 1;
    }
    if (overflowCards.length) {
      this.drawPile.unshift(...overflowCards);
    }
    if (visibleDrawn > 0 || overflowCards.length) {
      this.renderTemporaryCards();
      this.updatePileUi();
    }
    return resolved;
  }

  addTemporaryCardsFromPool(pool, count = 1, options = {}) {
    if (!Array.isArray(pool) || pool.length === 0) return 0;
    const targetCount = Math.max(1, Math.floor(count));
    const overflowToDrawTop = options.overflowToDrawTop === true;
    const defaultLimit = overflowToDrawTop ? TEMPORARY_CARD_EFFECT_LIMIT : TEMPORARY_CARD_LIMIT;
    const temporaryLimit = Math.max(
      TEMPORARY_CARD_LIMIT,
      Math.floor(options.temporaryLimit ?? defaultLimit)
    );
    const candidates = shuffleCards(pool.filter((card) => card && !card.lootOnly));
    const overflowCards = [];
    let created = 0;
    while (created < targetCount && candidates.length > 0) {
      const definition = candidates.shift();
      const card = createCardInstance(
        this.applyRuntimeCardLevel({
          ...definition,
          instanceId: undefined
        }),
        options.prefix ?? `temporary-${Date.now()}`
      );
      if (this.temporaryCards.length < temporaryLimit) {
        this.temporaryCards.push(card);
        this.pendingDrawAnimations.add(card);
      } else if (overflowToDrawTop) {
        overflowCards.push(card);
      } else {
        break;
      }
      created += 1;
    }
    if (overflowCards.length) {
      this.drawPile.unshift(...overflowCards);
    }
    if (created > 0) {
      this.renderTemporaryCards();
      this.updatePileUi();
    }
    return created;
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
      runtimeUpgrades: this.runtimeUpgradesForCard(cardDefinition.id),
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
    this.drawPile = shuffleCards(
      this.discardPile.splice(0).filter((card) => !this.isCardSpent(card))
    );
    return true;
  }

  spendEnergy(cost) {
    if (!this.canSpend(cost)) return false;
    this.energy -= cost;
    this.updateEnergyUi(true);
    this.updateCardAffordability();
    this.markNetworkStateDirty();
    return true;
  }

  addEnergy(amount) {
    if (!Number.isFinite(amount) || amount <= 0 || this.energy >= MAX_ENERGY) return 0;
    const previousEnergy = this.energy;
    this.energy = Math.min(MAX_ENERGY, this.energy + amount);
    this.updateEnergyUi();
    if (previousEnergy !== this.energy) {
      this.updateCardAffordability();
      this.markNetworkStateDirty();
    }
    return this.energy - previousEnergy;
  }

  canSpend(cost) {
    return this.energy >= cost;
  }

  updateCardAffordability() {
    this.cardUiElements().forEach((element) => {
      const card = element.dataset.cardLocation === 'temporary'
        ? this.temporaryCards[Number(element.dataset.temporaryIndex)]
        : this.handCards[Number(element.dataset.handIndex)];
      if (!card) return;
      const onCooldown = this.isCardOnCooldown(card);
      const canPlay = !onCooldown && this.canSpend(cardEnergyCost(card));
      const canDiscard = this.canSpend(discardEnergyCost(card));
      element.setAttribute('aria-disabled', String(!canPlay));
      element.classList.toggle('is-discard-only', !canPlay && canDiscard);
      element.classList.toggle('is-locked', !canPlay && !canDiscard);
      element.classList.toggle('is-cooling', onCooldown);
    });
  }

  isCardOnCooldown(card) {
    if (!isTerrainCard(card)) return false;
    const until = this.cardCooldownUntil.get(card.instanceId);
    return Number.isFinite(until) && this.cooldownClock < until;
  }

  getCardCooldownRemaining(card) {
    if (!isTerrainCard(card)) return 0;
    const until = this.cardCooldownUntil.get(card.instanceId);
    if (!Number.isFinite(until)) return 0;
    return Math.max(0, until - this.cooldownClock);
  }

  startCardCooldown(card) {
    if (!isTerrainCard(card)) return;
    const duration = Math.max(0, Number(card.cooldown ?? TERRAIN_CARD_COOLDOWN_SECONDS));
    this.cardCooldownUntil.set(card.instanceId, this.cooldownClock + duration);
    this.markNetworkStateDirty();
  }

  serializeCooldowns() {
    const elapsed = this.cooldownClock;
    return [...this.cardCooldownUntil.entries()]
      .map(([cardInstanceId, until]) => ({
        cardInstanceId,
        remaining: Math.max(0, Number(until) - elapsed)
      }))
      .filter((entry) => entry.remaining > 0)
      .map((entry) => ({
        cardInstanceId: entry.cardInstanceId,
        remaining: Number(entry.remaining.toFixed(2))
      }));
  }

  applyCooldownSnapshot(rows = []) {
    const elapsed = this.cooldownClock;
    const nextCooldowns = new Map();
    rows.forEach((entry) => {
      const remaining = Number(entry?.remaining);
      if (typeof entry?.cardInstanceId !== 'string' || !Number.isFinite(remaining) || remaining <= 0) return;
      const existingUntil = this.cardCooldownUntil.get(entry.cardInstanceId);
      const existingRemaining = Number.isFinite(existingUntil) ? Math.max(0, existingUntil - elapsed) : null;
      const keepLocalClock = existingRemaining != null && Math.abs(existingRemaining - remaining) <= 0.75;
      nextCooldowns.set(entry.cardInstanceId, keepLocalClock ? existingUntil : elapsed + remaining);
    });
    this.cardCooldownUntil = nextCooldowns;
    this.updateCardCooldownUi();
    this.updateCardAffordability();
  }

  cardUiElements() {
    return [
      ...this.hand.querySelectorAll('.card'),
      ...this.temporarySlot.querySelectorAll('.card')
    ];
  }

  updateCardCooldownUi() {
    let needsRefresh = false;
    this.cardUiElements().forEach((element) => {
      const card = element.dataset.cardLocation === 'temporary'
        ? this.temporaryCards[Number(element.dataset.temporaryIndex)]
        : this.handCards[Number(element.dataset.handIndex)];
      if (!card || !isTerrainCard(card)) return;
      const remaining = this.getCardCooldownRemaining(card);
      const total = Math.max(0.001, Number(card.cooldown ?? TERRAIN_CARD_COOLDOWN_SECONDS));
      const overlay = element.querySelector('.card-cooldown-mask');
      if (remaining <= 0) {
        if (overlay) overlay.remove();
        return;
      }
      const progress = Math.max(0, Math.min(1, remaining / total));
      if (!overlay) {
        needsRefresh = true;
        return;
      }
      overlay.style.setProperty('--cooldown-progress', String(progress));
      const label = overlay.querySelector('.card-cooldown-label');
      if (label) label.textContent = `${Math.ceil(remaining)}s`;
    });
    if (needsRefresh) {
      this.renderHand();
      this.renderTemporaryCards();
      this.updateCardAffordability();
      return;
    }
    const hasActiveCooldown = [...this.cardCooldownUntil.entries()].some(([, until]) => (
      Number.isFinite(until) && this.cooldownClock < until
    ));
    if (!hasActiveCooldown && this.cardCooldownUntil.size > 0) {
      this.cardCooldownUntil.clear();
      this.updateCardAffordability();
    }
  }

  updateAbilityIcons(abilities = []) {
    if (!this.abilityIcons) return;
    this.abilityIcons.innerHTML = '';
    this.abilityIcons.hidden = abilities.length === 0;
    abilities.forEach((ability) => {
      const icon = document.createElement('div');
      icon.className = 'ability-icon';
      icon.style.setProperty('--ability-color', ability.color ?? '#9dd8ff');
      const remainingSeconds = Number.isFinite(ability.expiresAt)
        ? Math.max(0, Math.ceil(ability.expiresAt - (this.game.elapsedTime ?? 0)))
        : null;
      const durationText = remainingSeconds != null ? ` · 剩余 ${remainingSeconds}s` : '';
      const summary = ability.summary ?? '';
      icon.innerHTML = `
        <span>${ability.label ?? ability.name?.slice?.(0, 1) ?? '?'}</span>
        <strong>${ability.stacks}</strong>
        <span class="ability-icon-tooltip">${escapeHtml(`${ability.name} x${ability.stacks}${durationText}\n${summary}`)}</span>
      `;
      icon.title = `${ability.name} x${ability.stacks}${durationText} - ${summary}`;
      this.abilityIcons.appendChild(icon);
    });
    this.syncEnergyPanelToolbar();
  }

  updateCoreIcons(cores = []) {
    if (!this.coreIcons) return;
    this.coreIcons.innerHTML = '';
    this.coreIcons.hidden = cores.length === 0;
    cores.forEach((core) => {
      const icon = document.createElement('div');
      icon.className = 'core-icon';
      icon.style.setProperty('--core-color', core.color ?? '#9eeedb');
      icon.title = `${core.name} x${core.stacks} - ${core.summary}`;
      icon.innerHTML = `
        <span>${core.label ?? core.name?.slice?.(0, 1) ?? '核'}</span>
        <strong>${core.stacks}</strong>
      `;
      this.coreIcons.appendChild(icon);
    });
    this.syncEnergyPanelToolbar();
  }

  syncEnergyPanelToolbar() {
    const toolbar = this.energyParts?.toolbar;
    if (!toolbar) return;
    const hasAbilities = !this.abilityIcons?.hidden;
    const hasCores = !this.coreIcons?.hidden;
    toolbar.hidden = !hasAbilities && !hasCores;
  }

  updateEnergyUi(force = false) {
    const progress = this.energy >= MAX_ENERGY ? 1 : 0;
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

  sendPlayCardCommand(drag) {
    const sender = this.game.networkBridge?.commandSender;
    if (!sender || !drag?.card?.instanceId) return false;
    return sender.playCard({
      cardInstanceId: drag.card.instanceId,
      point: drag.point ? [drag.point.x, drag.point.z] : null,
      targetUnitId: drag.targetUnit?.id ?? null,
      targetCardInstanceId: drag.targetCard?.instanceId ?? null
    });
  }

  sendDiscardCardCommand(drag) {
    const sender = this.game.networkBridge?.commandSender;
    if (!sender || !drag?.card?.instanceId) return false;
    return sender.discardCard({
      cardInstanceId: drag.card.instanceId,
      sourceLocation: drag.sourceLocation ?? 'hand'
    });
  }

  playFromNetworkPayload(payload) {
    this.lastNetworkPlayRejectionReason = null;
    const card = this.findCardByInstanceId(payload.cardInstanceId);
    if (!card) {
      this.lastNetworkPlayRejectionReason = 'card_not_owned_or_not_available';
      return false;
    }
    if (this.isCardOnCooldown(card)) {
      this.lastNetworkPlayRejectionReason = 'card_cooldown';
      return false;
    }
    if (!this.canSpend(cardEnergyCost(card))) {
      this.lastNetworkPlayRejectionReason = 'insufficient_energy';
      return false;
    }
    const drag = this.buildDragFromNetworkPayload(card, payload);
    if (card.target === 'ground' && !drag.point) {
      this.lastNetworkPlayRejectionReason = 'invalid_target_point';
      return false;
    }
    const applied = this.game.withPlayerContext(this.playerSlot, () => this.playDraggedCard(drag));
    if (!applied && !this.lastNetworkPlayRejectionReason) {
      this.lastNetworkPlayRejectionReason = 'card_effect_rejected';
    }
    return applied;
  }

  discardFromNetworkPayload(payload) {
    const card = this.findCardByInstanceId(payload.cardInstanceId);
    if (!card) return false;
    return this.game.withPlayerContext(this.playerSlot, () => (
      this.discardDraggedCard({
        card,
        sourceLocation: payload.sourceLocation === 'temporary' ? 'temporary' : 'hand'
      })
    ));
  }

  findCardByInstanceId(instanceId) {
    return this.handCards.find((card) => card.instanceId === instanceId)
      ?? this.temporaryCards.find((card) => card.instanceId === instanceId)
      ?? null;
  }

  buildDragFromNetworkPayload(card, payload) {
    const point = Array.isArray(payload.point)
      ? new THREE.Vector3(payload.point[0], 0, payload.point[1] ?? payload.point[2] ?? 0)
      : null;
    const targetUnit = payload.targetUnitId
      ? this.game.friendlyUnits.find((unit) => unit.id === payload.targetUnitId)
      : null;
    const targetCard = payload.targetCardInstanceId
      ? this.handCards.find((entry) => entry.instanceId === payload.targetCardInstanceId)
      : null;
    return {
      card,
      point,
      targetUnit,
      targetCard,
      sourceLocation: this.temporaryCards.includes(card) ? 'temporary' : 'hand'
    };
  }

  destroy() {
    document.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('pointerup', this.onPointerUp);
    document.removeEventListener('pointercancel', this.onPointerCancel);
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
  return source.map((card, index) => createCardInstance(card, `deck-${index}`));
}

function createCardInstance(card, prefix = 'card') {
  const normalized = withoutLegacyUseFields(card);
  const maxUses = cardMaxUses(normalized);
  return {
    ...normalized,
    instanceId: card.instanceId ?? `${prefix}-${normalized.id}-${Math.random().toString(36).slice(2)}`,
    ...(maxUses > 0 ? { maxUses, remainingUses: maxUses } : {})
  };
}

function withoutLegacyUseFields(card) {
  const { maxUses: _maxUses, remainingUses: _remainingUses, ...normalized } = card ?? {};
  return normalized;
}

export function cardMaxUses(card) {
  if (Number.isFinite(card?.uses) && card.uses > 0) return Math.floor(card.uses);
  if (card?.exhaust === true || card?.kind === 'ability') return 1;
  return 0;
}

export function cardHasUseLimit(card) {
  return cardMaxUses(card) > 0;
}

function ensureCardUses(card) {
  const max = cardMaxUses(card);
  if (max <= 0) return;
  if (!Number.isFinite(card.maxUses)) card.maxUses = max;
  if (!Number.isFinite(card.remainingUses)) card.remainingUses = max;
}

export function cardUseBarMarkup(card, className = 'card-use-bar') {
  const max = card.maxUses ?? cardMaxUses(card);
  if (max <= 0) return '';
  ensureCardUses(card);
  const remaining = Math.max(0, Math.floor(card.remainingUses ?? max));
  const segments = [];
  for (let index = 0; index < max; index += 1) {
    segments.push(`<span${index < remaining ? ' class="is-filled"' : ''}></span>`);
  }
  return `<div class="${className}" aria-hidden="true">${segments.join('')}</div>`;
}

function cardCooldownOverlayMarkup(cardSystem, card) {
  if (!isTerrainCard(card)) return '';
  const remaining = cardSystem.getCardCooldownRemaining(card);
  if (remaining <= 0) return '';
  const total = Math.max(0.001, Number(card.cooldown ?? TERRAIN_CARD_COOLDOWN_SECONDS));
  const progress = Math.max(0, Math.min(1, remaining / total));
  return `
    <div class="card-cooldown-mask" style="--cooldown-progress:${progress}">
      <span class="card-cooldown-label">${Math.ceil(remaining)}s</span>
    </div>
  `;
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
  if (!cardHasUseLimit(card)) return false;
  ensureCardUses(card);
  return card.remainingUses <= 0;
}

export function cardThemeColor(cardOrKind) {
  const kind = typeof cardOrKind === 'string' ? cardOrKind : cardOrKind?.kind;
  return CARD_KIND_COLORS[kind] ?? CARD_KIND_COLORS.enchant;
}

const BITMAP_CARD_ART = {
  raider: 'card-art/raider-imagegen-lowpoly-v3.png',
  archer: 'card-art/archer-imagegen-lowpoly-v3.png',
  swordsman: 'card-art/swordsman-imagegen-lowpoly-v3.png',
  crossbowman: 'card-art/crossbowman-imagegen-lowpoly-v3.png',
  waterMage: 'card-art/waterMage-imagegen-lowpoly-v3.png',
  rogue: 'card-art/rogue-imagegen-lowpoly-v3.png',
  knight: 'card-art/knight-imagegen-lowpoly-v3.png',
  berserker: 'card-art/berserker-imagegen-lowpoly-v3.png'
};

function resolveCardArtAsset(path) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${path}`.replace(/([^:]\/)\/+/g, '$1');
}

export function createCardArtMarkup(card) {
  const key = safeArtKey(card.artKey ?? card.id ?? card.kind);
  const assetPath = BITMAP_CARD_ART[key];
  if (assetPath) {
    return `
      <div class="card-art card-art-${key} has-bitmap-art" aria-hidden="true">
        <img class="card-art-image" src="${resolveCardArtAsset(assetPath)}" alt="" draggable="false" loading="lazy" />
      </div>
    `;
  }
  const renderer = CARD_ART_RENDERERS[key] ?? CARD_ART_RENDERERS.default;
  return `<div class="card-art card-art-${key}" aria-hidden="true">${renderer()}</div>`;
}

function safeArtKey(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}

const CARD_ART_RENDERERS = {
  raider: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.24" cx="48" cy="56" rx="31" ry="6" />
    <polygon fill="#5b3b2d" points="18,43 25,36 63,57 58,63" />
    <polygon fill="#7a5237" points="17,25 31,17 40,34 23,41" />
    <polygon fill="#d8d0c2" points="19,23 14,17 24,20" />
    <polygon fill="#d8d0c2" points="31,18 31,9 38,19" />
    <polygon fill="#d8d0c2" points="39,32 48,32 42,39" />
    <polygon fill="#6f4735" points="28,52 34,35 48,28 62,35 69,52 57,59 39,59" />
    <polygon fill="#b9825f" points="36,27 48,14 60,27 56,40 40,40" />
    <polygon fill="#2c211d" points="36,26 48,12 61,26 55,30 48,24 41,30" />
    <polygon fill="#e1b48a" points="42,33 54,33 52,40 44,40" />
    <polygon fill="#8f4b36" points="39,41 57,41 60,51 48,57 36,51" />
    <path fill="none" stroke="#f5c978" stroke-width="2.4" d="M34 48 L48 57 L62 48" />
  `),
  swordsman: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.23" cx="48" cy="56" rx="29" ry="6" />
    <polygon fill="#e9edf0" points="49,5 56,30 50,58 44,30" />
    <polygon fill="#9fb3bc" points="49,5 50,58 44,30" />
    <rect fill="#7b5836" x="37" y="31" width="23" height="5" rx="1" />
    <polygon fill="#253954" points="29,53 35,30 47,20 61,30 68,53 56,60 40,60" />
    <polygon fill="#426f98" points="36,34 48,26 60,34 57,51 48,57 39,51" />
    <polygon fill="#c69b6d" points="42,24 48,15 55,24 52,33 44,33" />
    <polygon fill="#242829" points="40,24 48,12 57,24 52,27 48,24 44,28" />
    <polygon fill="#d8e6ee" opacity="0.72" points="51,9 54,29 50,44" />
    <path fill="none" stroke="#f1c778" stroke-width="2.2" d="M35 50 L48 57 L61 50" />
  `),
  knight: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.24" cx="49" cy="56" rx="31" ry="6" />
    <polygon fill="#cfd8dc" points="30,21 48,9 66,21 62,38 48,46 34,38" />
    <polygon fill="#7f929b" points="35,23 48,15 61,23 58,34 48,40 38,34" />
    <rect fill="#232d31" x="39" y="25" width="18" height="4" rx="1" />
    <polygon fill="#315a77" points="30,37 48,29 66,37 62,55 48,62 34,55" />
    <polygon fill="#d8c278" points="48,34 56,42 48,55 40,42" />
    <polygon fill="#fff1bf" points="47,34 49,34 49,55 47,55" />
    <polygon fill="#e7eef0" points="23,16 30,17 27,57 21,57" />
    <rect fill="#795a35" x="19" y="37" width="13" height="5" rx="1" />
    <path fill="none" stroke="#f4d98f" stroke-width="2.2" d="M34 55 L48 62 L62 55" />
  `),
  spearman: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.22" cx="48" cy="56" rx="30" ry="6" />
    <polygon fill="#6a7d4f" points="29,53 35,30 47,20 61,30 68,53 56,60 40,60" />
    <polygon fill="#8ea06f" points="36,34 48,26 60,34 57,51 48,57 39,51" />
    <polygon fill="#d8c278" points="42,24 48,15 55,24 52,33 44,33" />
    <polygon fill="#d8dce2" points="49,8 52,34 50,58 46,34" />
    <polygon fill="#9fb3bc" points="49,8 50,58 46,34" />
    <path fill="none" stroke="#f1c778" stroke-width="2.2" d="M35 50 L48 57 L61 50" />
  `),
  towerShield: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.24" cx="49" cy="56" rx="31" ry="6" />
    <polygon fill="#5a6a78" points="30,37 48,29 66,37 62,55 48,62 34,55" />
    <polygon fill="#7f929b" points="35,23 48,15 61,23 58,34 48,40 38,34" />
    <polygon fill="#cfd8dc" points="18,18 18,58 34,58 34,18" />
    <polygon fill="#9aa8b0" points="22,22 30,22 30,54 22,54" />
    <rect fill="#795a35" x="39" y="37" width="16" height="4" rx="1" />
    <path fill="none" stroke="#f4d98f" stroke-width="2.2" d="M34 55 L48 62 L62 55" />
  `),
  berserker: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.25" cx="48" cy="56" rx="32" ry="6" />
    <polygon fill="#5d3a2b" points="20,44 27,36 70,56 66,63" />
    <polygon fill="#d4dce0" points="60,16 83,25 74,42 51,32" />
    <polygon fill="#a6b2b8" points="77,23 89,34 73,43" />
    <polygon fill="#71342e" points="28,52 34,34 48,27 63,34 70,52 56,60 40,60" />
    <polygon fill="#ca7b55" points="37,26 48,13 60,26 56,38 40,38" />
    <polygon fill="#2c211f" points="36,25 48,11 61,25 56,29 48,24 40,30" />
    <polygon fill="#f06d3f" points="42,39 54,39 60,51 48,59 36,51" />
    <polygon fill="#efe6cf" points="37,24 29,17 39,18" />
    <polygon fill="#efe6cf" points="59,24 67,17 57,18" />
    <path fill="none" stroke="#ffd18a" stroke-width="2.4" d="M33 48 L48 59 L63 48" />
  `),
  archer: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.23" cx="48" cy="56" rx="30" ry="6" />
    <path fill="none" stroke="#5c3e2a" stroke-width="4.5" d="M68 12 C87 26 87 46 68 58" />
    <path fill="none" stroke="#f4e7bd" stroke-width="1.7" d="M68 12 L68 58" />
    <polygon fill="#f5e7bd" points="24,35 76,33 76,37 24,39" />
    <polygon fill="#f5e7bd" points="76,33 86,35 76,38" />
    <polygon fill="#274c37" points="30,54 35,31 48,20 62,31 67,54 56,60 40,60" />
    <polygon fill="#5f8e55" points="36,30 48,14 61,30 56,40 40,40" />
    <polygon fill="#d1a171" points="42,29 48,21 54,29 52,38 44,38" />
    <polygon fill="#203f31" points="38,29 48,16 59,29 54,32 48,28 42,33" />
    <polygon fill="#9ec77b" points="38,42 58,42 62,52 48,58 34,52" />
    <path fill="none" stroke="#f1d28e" stroke-width="2.2" d="M35 50 L48 58 L61 50" />
  `),
  crossbowman: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.24" cx="49" cy="56" rx="31" ry="6" />
    <polygon fill="#364b55" points="31,52 36,31 49,22 63,31 69,52 56,60 41,60" />
    <polygon fill="#7c8b91" points="39,22 49,13 60,22 57,34 42,34" />
    <rect fill="#222b2e" x="40" y="25" width="18" height="4" rx="1" />
    <polygon fill="#5f3f28" points="20,39 76,36 76,43 20,46" />
    <polygon fill="#2d2621" points="17,30 80,30 87,36 10,37" />
    <polygon fill="#2d2621" points="12,34 30,27 27,41" />
    <polygon fill="#2d2621" points="85,34 67,27 70,41" />
    <polygon fill="#dce6e8" points="39,34 84,33 84,37 39,38" />
    <polygon fill="#dce6e8" points="84,33 93,35 84,38" />
    <polygon fill="#8aa1a7" points="39,39 58,39 63,51 49,58 35,51" />
    <path fill="none" stroke="#f5d98e" stroke-width="2" d="M18 35 L82 35" />
  `),
  waterMage: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.22" cx="48" cy="56" rx="31" ry="6" />
    <circle fill="#65d8ff" opacity="0.18" cx="63" cy="35" r="22" />
    <path fill="none" stroke="#8feaff" stroke-width="2.4" d="M39 45 C51 56 72 55 84 42" />
    <path fill="none" stroke="#dff8ff" stroke-width="2" opacity="0.82" d="M45 38 C55 27 72 28 82 39" />
    <polygon fill="#214e78" points="30,54 36,29 48,17 62,29 68,54 56,61 40,61" />
    <polygon fill="#4b9fc4" points="38,31 48,21 58,31 57,49 48,57 39,49" />
    <polygon fill="#d5a878" points="43,30 48,23 54,30 52,37 44,37" />
    <polygon fill="#1e3f64" points="37,30 48,15 60,30 55,33 48,29 42,34" />
    <rect fill="#6b4b2f" x="72" y="9" width="5" height="50" rx="2" transform="rotate(8 74.5 34)" />
    <circle fill="#66dcff" cx="76" cy="12" r="7" />
    <circle fill="#e5fbff" opacity="0.85" cx="76" cy="12" r="3" />
    <circle fill="#66dcff" opacity="0.65" cx="64" cy="38" r="9" />
    <path fill="none" stroke="#f2fbff" stroke-width="1.8" d="M59 38 C64 33 70 34 73 39" />
  `),
  rogue: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.25" cx="48" cy="56" rx="31" ry="6" />
    <path fill="none" stroke="#dce8ee" stroke-width="2.4" opacity="0.74" d="M19 52 C39 37 58 23 80 11" />
    <path fill="none" stroke="#89a2b5" stroke-width="2" opacity="0.6" d="M77 52 C58 37 39 23 17 12" />
    <polygon fill="#dce6ea" points="60,17 83,10 69,27" />
    <polygon fill="#dce6ea" points="36,17 13,10 27,27" />
    <polygon fill="#202a35" points="29,54 35,30 48,18 62,30 69,54 56,61 40,61" />
    <polygon fill="#4a5670" points="38,32 48,22 58,32 56,49 48,57 40,49" />
    <polygon fill="#d3a477" points="43,30 48,24 53,30 51,37 45,37" />
    <polygon fill="#1c2631" points="36,29 48,14 61,29 55,33 48,28 41,34" />
    <polygon fill="#aebdc5" points="25,47 44,31 48,35 30,53" />
    <polygon fill="#aebdc5" points="71,47 52,31 48,35 66,53" />
    <rect fill="#6d4b31" x="21" y="49" width="12" height="5" rx="1" transform="rotate(-42 27 51)" />
    <rect fill="#6d4b31" x="63" y="49" width="12" height="5" rx="1" transform="rotate(42 69 51)" />
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
  heavyStrike: () => artSvg(`
    <polygon fill="#3a2e26" points="0,51 19,40 44,43 68,38 96,48 96,64 0,64" />
    <polygon fill="#c8a56a" opacity="0.28" points="47,4 66,34 47,60 28,34" />
    <rect fill="#d8dde0" x="42" y="10" width="12" height="34" rx="1" />
    <polygon fill="#f7d474" points="40,43 56,43 58,50 38,50" />
    <polygon fill="#7b4f2f" points="45,50 51,50 52,59 44,59" />
    <path fill="none" stroke="#ffe08a" stroke-width="3" stroke-linecap="round" d="M24 36 H72" />
    <polygon fill="#f0b84d" points="68,28 78,34 68,40" />
  `),
  quickStrike: () => artSvg(`
    <polygon fill="#3a2818" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#ffb347" opacity="0.22" cx="50" cy="38" rx="34" ry="20" />
    <path fill="none" stroke="#ffd89a" stroke-width="4" stroke-linecap="round" d="M22 44 L48 18 L74 44" />
    <path fill="none" stroke="#fff2c7" stroke-width="3" stroke-linecap="round" d="M30 52 L48 30 L66 52" />
    <polygon fill="#ffb347" points="48,12 58,24 52,40 44,40 38,24" />
    <circle fill="#fff2c7" cx="24" cy="36" r="3" />
    <circle fill="#fff2c7" opacity="0.72" cx="76" cy="36" r="3" />
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
  tacticSilverGamble: () => artSvg(`
    <polygon fill="#3a3020" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#d8b85a" opacity="0.24" cx="48" cy="42" rx="36" ry="17" />
    <circle fill="#ffe08a" cx="34" cy="34" r="12" />
    <circle fill="#fff2c7" cx="34" cy="34" r="7" />
    <circle fill="#ffe08a" cx="62" cy="38" r="10" />
    <circle fill="#fff2c7" cx="62" cy="38" r="6" />
    <path fill="none" stroke="#fff2c7" stroke-width="3" opacity="0.85" d="M24 18 L72 52" />
    <path fill="none" stroke="#d8a0a0" stroke-width="2.5" opacity="0.8" d="M72 18 L24 52" />
    <text x="48" y="24" text-anchor="middle" fill="#fff2c7" font-size="11" font-weight="700">x2</text>
    <text x="48" y="58" text-anchor="middle" fill="#d8a0a0" font-size="10" font-weight="700">÷2</text>
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
  abilityFireSpread: () => artSvg(`
    <polygon fill="#3a2418" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#ff823d" opacity="0.24" cx="48" cy="42" rx="36" ry="16" />
    <polygon fill="#ff823d" points="48,8 58,28 50,28 54,52 42,52 46,28 38,28" />
    <polygon fill="#ffd166" points="48,16 54,28 48,28 50,44 46,44 46,28 42,28" />
    <circle fill="#ffb45c" cx="28" cy="34" r="7" />
    <circle fill="#ffb45c" cx="68" cy="36" r="6" />
    <path fill="none" stroke="#ffe08a" stroke-width="2.5" opacity="0.85" d="M34 34 C42 26 54 30 62 36" />
    <path fill="none" stroke="#ffe08a" stroke-width="2.5" opacity="0.75" d="M28 40 C36 48 46 44 56 50" />
  `),
  plagueFog: () => artSvg(`
    <polygon fill="#243020" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#6a8a48" opacity="0.34" cx="48" cy="44" rx="39" ry="14" />
    <ellipse fill="#8aa860" opacity="0.36" cx="33" cy="38" rx="17" ry="10" />
    <ellipse fill="#4a6038" opacity="0.42" cx="61" cy="36" rx="22" ry="12" />
    <circle fill="#b8d88a" cx="36" cy="36" r="4" />
    <circle fill="#b8d88a" opacity="0.72" cx="58" cy="34" r="5" />
    <path fill="none" stroke="#dff6a5" stroke-width="2" opacity="0.65" d="M24 48 C36 36 56 52 74 40" />
    <polygon fill="#6a8a48" points="48,18 52,24 44,24" />
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
  abilityWarDrum: () => artSvg(`
    <polygon fill="#3a3424" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#8b5a2b" cx="48" cy="38" rx="24" ry="18" />
    <ellipse fill="#ffd166" cx="48" cy="38" rx="16" ry="11" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" stroke-linecap="round" d="M30 38 L66 38 M48 24 L48 52" />
    <circle fill="#fff2c7" cx="24" cy="22" r="4" />
    <circle fill="#ffb45c" cx="74" cy="24" r="5" />
  `),
  abilityArsenal: () => artSvg(`
    <polygon fill="#343128" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#777d78" points="24,55 72,55 66,63 30,63" />
    <polygon fill="#d8c58d" points="34,18 62,18 58,52 38,52" />
    <polygon fill="#fff2c7" points="48,12 54,22 42,22" />
    <rect fill="#5a4630" x="44" y="24" width="8" height="24" rx="2" />
    <path fill="none" stroke="#fff2c7" stroke-width="3" d="M22 40 L34 28 M74 40 L62 28" />
  `),
  abilityBloodRage: () => artSvg(`
    <polygon fill="#3a2424" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#6f718a" points="37,24 60,24 65,49 49,58 32,49" />
    <circle fill="#ff6b5a" opacity="0.92" cx="63" cy="36" r="16" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" stroke-linecap="round" d="M48 18 L48 30 M42 24 L54 24" />
    <path fill="none" stroke="#ffb3b3" stroke-width="3" d="M22 44 C34 56 62 56 76 42" />
  `),
  abilityDotAmplify: () => artSvg(`
    <polygon fill="#243428" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <circle fill="#78b85a" opacity="0.35" cx="48" cy="34" r="24" />
    <circle fill="none" stroke="#dff6a5" stroke-width="4" cx="48" cy="34" r="16" />
    <circle fill="#78b85a" cx="48" cy="34" r="7" />
    <path fill="none" stroke="#fff2c7" stroke-width="3" stroke-linecap="round" d="M24 48 C34 28 62 28 72 48" />
    <circle fill="#dff6a5" cx="24" cy="22" r="4" />
  `),
  tacticCorrupt: () => artSvg(`
    <polygon fill="#3a272c" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#f3e1c0" points="28,15 62,12 69,50 35,56" />
    <polygon fill="#9f6b70" points="34,21 57,19 62,45 39,49" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" stroke-linecap="round" d="M31 30 L62 42" />
    <circle fill="#fff2c7" cx="72" cy="20" r="8" />
    <text x="72" y="24" text-anchor="middle" fill="#3a272c" font-size="11" font-weight="700">0</text>
  `),
  meteorBarrage: () => artSvg(`
    <polygon fill="#3a2424" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <circle fill="#9a3f35" opacity="0.35" cx="48" cy="36" r="24" />
    <polygon fill="#b04a38" points="22,18 30,34 14,34" />
    <polygon fill="#d85a45" points="48,10 56,28 40,28" />
    <polygon fill="#9a3f35" points="74,16 82,32 66,32" />
    <circle fill="#ffb45c" cx="48" cy="44" r="10" />
    <circle fill="#fff2c7" cx="48" cy="44" r="4" />
  `),
  tacticRallyEnergy: () => artSvg(`
    <polygon fill="#252f46" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <circle fill="#7f8fc7" opacity="0.28" cx="48" cy="36" r="22" />
    <polygon fill="#6f718a" points="30,40 42,28 54,28 66,40 58,52 38,52" />
    <polygon fill="#fff2c7" points="48,14 56,30 40,30" />
    <circle fill="#dff8ff" cx="24" cy="24" r="5" />
    <circle fill="#dff8ff" cx="72" cy="24" r="5" />
    <circle fill="#fff2c7" cx="48" cy="36" r="6" />
  `),
  tacticHuntMark: () => artSvg(`
    <polygon fill="#3a2424" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <circle fill="none" stroke="#ff8866" stroke-width="4" cx="48" cy="36" r="20" />
    <circle fill="none" stroke="#ffb18a" stroke-width="2" cx="48" cy="36" r="12" />
    <circle fill="#ff8866" cx="48" cy="36" r="5" />
    <path fill="none" stroke="#fff2c7" stroke-width="3" stroke-linecap="round" d="M48 16 L48 24 M48 48 L48 56 M28 36 L36 36 M60 36 L68 36" />
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
  swarmPack: () => artSvg(`
    <polygon fill="#223827" points="0,51 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#93c86f" opacity="0.2" cx="50" cy="40" rx="36" ry="18" />
    <polygon fill="#93c86f" points="47,12 58,23 52,41 39,41 33,23" />
    <polygon fill="#3f6f35" points="47,19 53,25 50,38 41,38 38,25" />
    <circle fill="none" stroke="#d7f6b8" stroke-width="3" cx="50" cy="38" r="18" />
    <circle fill="none" stroke="#93c86f" stroke-width="2" cx="50" cy="38" r="11" />
    <circle fill="#d7f6b8" cx="27" cy="39" r="4" />
    <circle fill="#d7f6b8" opacity="0.72" cx="66" cy="25" r="4" />
    <circle fill="#d7f6b8" opacity="0.72" cx="72" cy="48" r="4" />
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

function symbolicUnitSvg(content) {
  return `
    <svg class="card-art-svg card-art-symbolic-svg" viewBox="0 0 96 64" focusable="false" aria-hidden="true">
      <g stroke-linejoin="round" stroke-linecap="round">
        ${content}
      </g>
    </svg>
  `;
}

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
  void card;
  return 1;
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

function createEnergyPanel(hand, mountUi = true) {
  const existing = mountUi ? document.querySelector('#energy-panel') : null;
  if (existing) return existing;
  const panel = document.createElement('section');
  panel.id = 'energy-panel';
  panel.className = 'energy-panel';
  panel.setAttribute('aria-label', 'energy');
  hand.before(panel);
  return panel;
}

function createTemporaryCardSlot(anchor, mountUi = true) {
  const existing = mountUi ? document.querySelector('#temporary-card-slot') : null;
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
      <div class="energy-subtitle">击杀充能</div>
      <div class="energy-panel-toolbar" hidden>
        <div class="ability-icon-row" hidden></div>
        <div class="core-icon-row" hidden></div>
      </div>
      <div class="energy-cells">${cells}</div>
      <div class="energy-progress"><div class="energy-progress-fill"></div></div>
    `;
  } else if (!panel.querySelector('.energy-panel-toolbar')) {
    const toolbar = document.createElement('div');
    toolbar.className = 'energy-panel-toolbar';
    toolbar.hidden = true;
    toolbar.innerHTML = `
      <div class="ability-icon-row" hidden></div>
      <div class="core-icon-row" hidden></div>
    `;
    panel.querySelector('.energy-cells')?.before(toolbar);
  } else {
    if (!panel.querySelector('.ability-icon-row')) {
      const row = document.createElement('div');
      row.className = 'ability-icon-row';
      row.hidden = true;
      panel.querySelector('.energy-panel-toolbar')?.prepend(row);
    }
    if (!panel.querySelector('.core-icon-row')) {
      const row = document.createElement('div');
      row.className = 'core-icon-row';
      row.hidden = true;
      panel.querySelector('.energy-panel-toolbar')?.append(row);
    }
  }
  return {
    value: panel.querySelector('.energy-value'),
    cells: [...panel.querySelectorAll('.energy-cell')],
    toolbar: panel.querySelector('.energy-panel-toolbar'),
    abilities: panel.querySelector('.ability-icon-row'),
    cores: panel.querySelector('.core-icon-row')
  };
}

function createGameHintPanel(anchor, mountUi = true) {
  const existing = mountUi ? document.querySelector('#game-hint-panel') : null;
  if (existing) return existing;
  const panel = document.createElement('div');
  panel.id = 'game-hint-panel';
  panel.className = 'game-hint-panel';
  panel.setAttribute('aria-live', 'polite');
  panel.hidden = true;
  anchor.before(panel);
  return panel;
}

export function fitStrategyRewardCards(root) {
  root?.querySelectorAll?.('.strategy-reward-card')?.forEach((element) => {
    fitCardElementText(element);
  });
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

function createPileUi(mountUi = true) {
  const existingRoot = mountUi ? document.querySelector('#card-pile-dock') : null;
  const existingViewer = mountUi ? document.querySelector('#pile-viewer') : null;
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

  if (mountUi) document.body.append(root, viewer);
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
      element.dataset.cost = cardEnergyCost(card);
    element.dataset.kind = card.kind;
    element.innerHTML = `
      <div class="med-card-wrapper">
        <div class="med-card-bg"></div>
        <div class="med-card-cost"><span>${cardEnergyCost(card)}</span></div>
        <div class="med-card-level" hidden>Lv.${card.level ?? 1}</div>
        ${cardUseBarMarkup(card)}
        ${cardCooldownOverlayMarkup(this, card)}
        <div class="med-card-face">
          <div class="med-card-art-container">
            ${createCardArtMarkup(card)}
          </div>
          <div class="med-card-bottom">
            <div class="med-card-name">${card.name}</div>
            <div class="med-card-desc">${card.summary}</div>
          </div>
        </div>
      </div>
    `;
  return element;
}

function stopUiEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
