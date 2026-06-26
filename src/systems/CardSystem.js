import * as THREE from 'three';
import { basicMat, createReticle } from '../art/lowpoly.js';
import { BALANCE, CARD_DEFINITIONS } from '../data/gameData.js';
import { insideBattlefield } from '../utils/math.js';

const HAND_SIZE = 5;
const INITIAL_ENERGY = 5;
const MAX_ENERGY = 10;
const ENERGY_REGEN_SECONDS = 5;
const PLAY_DRAG_RATIO = 0.5;
const DISCARD_DRAG_RATIO = 0.3;
const DISCARD_FALL_DELAY_MS = 2000;
const CARD_USAGE_HINT = '上滑使用 / 下滑丢弃';

export class CardSystem {
  constructor(game, options = {}) {
    this.game = game;
    this.cards = normalizeDeck(options.deck ?? CARD_DEFINITIONS);
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
    this.hintPanel = createGameHintPanel(this.energyPanel);
    this.hintOwner = null;
    this.activePileViewer = null;
    this.pileUi = createPileUi();
    this.bindPileUi();
    this.drawToFullHand();
    this.updateEnergyUi(true);
    this.renderHand();
    this.updatePileUi();
  }

  update(dt) {
    const previousEnergy = this.energy;
    this.energyTimer += dt;
    while (this.energy < MAX_ENERGY && this.energyTimer >= ENERGY_REGEN_SECONDS) {
      this.energy = Math.min(MAX_ENERGY, this.energy + 1);
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
        this.hand.appendChild(this.createEmptySlot());
        continue;
      }

      this.hand.appendChild(
        this.createCardElement(card, index, {
          isDrawn: this.pendingDrawAnimations.has(card)
        })
      );
    }
    this.pendingDrawAnimations.clear();
    this.updateCardAffordability();
  }

  createCardElement(card, index, { isDrawn = false } = {}) {
    const element = document.createElement('article');
    element.className = `card${isDrawn ? ' is-drawn' : ''}`;
    element.dataset.cardId = card.id;
    element.dataset.handIndex = String(index);
    element.style.setProperty('--card-color', card.color);
    element.innerHTML = `
      <div class="card-cost">${cardEnergyCost(card)}</div>
      <div class="card-level">Lv.${card.level ?? 1}</div>
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
    element.addEventListener('pointerenter', () => this.setHint(CARD_USAGE_HINT, 'card-hover'));
    element.addEventListener('pointerleave', () => this.clearHint('card-hover'));
    element.addEventListener('pointerdown', (event) => this.startDrag(event, card));
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
      mode: 'idle',
      startX: event.clientX,
      startY: event.clientY,
      sourceHeight: event.currentTarget.getBoundingClientRect().height,
      sourceElement: event.currentTarget
    };
    this.drag.playThreshold = this.drag.sourceHeight * PLAY_DRAG_RATIO;
    this.drag.discardThreshold = this.drag.sourceHeight * DISCARD_DRAG_RATIO;
    this.drag.sourceElement?.classList.add('is-dragging');
    this.ghost.textContent = '';
    this.ghost.classList.toggle('enchant-crosshair', card.target === 'friendly-unit');
    this.ghost.hidden = true;
    this.updateDraggedCardMotion(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('pointerup', this.onPointerUp, { once: true });
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
    this.drag.canPayPlay = this.canSpend(cardEnergyCost(this.drag.card));
    this.drag.canPayDiscard = this.canSpend(discardEnergyCost(this.drag.card));
    this.drag.mode = this.resolveDragMode(event);
    this.drag.sourceElement?.classList.toggle(
      'is-discard-ready',
      this.drag.mode === 'discard' && this.drag.canPayDiscard
    );

    if (this.drag.mode !== 'play') {
      this.drag.point = null;
      this.reticle.visible = false;
      this.enchantTargetRing.visible = false;
      this.ghost.hidden = true;
      this.ghost.classList.remove('is-valid');
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
    if (deltaY <= -this.drag.playThreshold) return 'play';
    if (deltaY >= this.drag.discardThreshold) return 'discard';
    return 'idle';
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
    this.ghost.hidden = true;
    this.ghost.classList.remove('enchant-crosshair', 'is-valid');
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
    this.moveCardToDiscard(drag.card);
    return true;
  }

  discardDraggedCard(drag) {
    const cost = discardEnergyCost(drag.card);
    if (!this.canSpend(cost)) {
      this.flashEnergyPanel();
      return false;
    }
    const index = this.handCards.indexOf(drag.card);
    if (index === -1) return false;
    this.spendEnergy(cost);
    this.startDiscardFall(drag, index);
    return true;
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
    const index = this.handCards.indexOf(card);
    if (index === -1) return false;
    this.handCards.splice(index, 1);
    this.discardPile.push(card);
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
    const energyStep = Math.floor(this.energy * 10 + 0.0001);
    if (!force && this.lastRenderedEnergy === energyStep && this.lastRenderedProgress === progressStep) {
      return;
    }
    this.lastRenderedEnergy = energyStep;
    this.lastRenderedProgress = progressStep;
    const filledEnergy = Math.floor(this.energy + 0.0001);
    const cells = Array.from({ length: MAX_ENERGY }, (_, index) => {
      const filledClass = index < filledEnergy ? ' is-filled' : '';
      return `<span class="energy-cell${filledClass}"></span>`;
    }).join('');
    this.energyPanel.style.setProperty('--energy-progress', `${progress * 100}%`);
    this.energyPanel.innerHTML = `
      <div class="energy-title">
        <span>能量</span>
        <strong>${formatEnergy(this.energy)}/${MAX_ENERGY}</strong>
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
    this.enchantTargetRing?.parent?.remove(this.enchantTargetRing);
    this.ghost.hidden = true;
    this.ghost.classList.remove('enchant-crosshair', 'is-valid');
    this.hand.innerHTML = '';
    this.energyPanel?.remove();
    this.hintPanel?.remove();
    this.pileUi?.root?.remove();
    this.pileUi?.viewer?.remove();
  }
}

function normalizeDeck(cards) {
  return (cards?.length ? cards : CARD_DEFINITIONS).map((card, index) => ({
    ...card,
    instanceId: card.instanceId ?? `${card.id}-${index}-${Math.random().toString(36).slice(2)}`
  }));
}

function kindLabel(kind) {
  if (kind === 'summon') return '单位卡';
  if (kind === 'spell') return '法术卡';
  return '附魔卡';
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
  element.style.setProperty('--card-color', card.color);
  element.innerHTML = `
    <div class="pile-card-cost">${cardEnergyCost(card)}</div>
    <div class="pile-card-level">Lv.${card.level ?? 1}</div>
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
