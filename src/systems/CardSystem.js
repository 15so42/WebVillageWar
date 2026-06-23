import * as THREE from 'three';
import { basicMat, createReticle } from '../art/lowpoly.js';
import { BALANCE, CARD_DEFINITIONS } from '../data/gameData.js';
import { insideBattlefield } from '../utils/math.js';

export class CardSystem {
  constructor(game) {
    this.game = game;
    this.cards = CARD_DEFINITIONS;
    this.cooldowns = new Map();
    this.drag = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.reticle = createReticle();
    this.game.scene.add(this.reticle);
    this.enchantTargetRing = createReticle();
    this.enchantTargetRing.scale.setScalar(0.78);
    this.game.scene.add(this.enchantTargetRing);
    this.ghost = document.querySelector('#drag-ghost');
    this.hand = document.querySelector('#card-hand');
    this.renderHand();
  }

  update(dt) {
    this.cards.forEach((card) => {
      const remaining = Math.max(0, (this.cooldowns.get(card.id) ?? 0) - dt);
      this.cooldowns.set(card.id, remaining);
      const element = this.hand.querySelector(`[data-card-id="${card.id}"]`);
      if (!element) return;
      element.setAttribute('aria-disabled', String(remaining > 0));
      const fill = element.querySelector('.cooldown-fill');
      fill.style.width = `${(remaining / card.cooldown) * 100}%`;
    });
  }

  renderHand() {
    this.hand.innerHTML = '';
    this.cards.forEach((card) => {
      const element = document.createElement('article');
      element.className = 'card';
      element.dataset.cardId = card.id;
      element.style.setProperty('--card-color', card.color);
      element.innerHTML = `
        <div class="card-art">${card.label}</div>
        <div class="card-body">
          <div class="card-name">${card.name}</div>
          <div class="card-kind">${kindLabel(card.kind)}</div>
          <div class="card-text">${card.summary}</div>
        </div>
        <div class="cooldown"><div class="cooldown-fill"></div></div>
      `;
      element.addEventListener('pointerdown', (event) => this.startDrag(event, card));
      this.hand.appendChild(element);
      this.cooldowns.set(card.id, 0);
    });
  }

  startDrag(event, card) {
    if ((this.cooldowns.get(card.id) ?? 0) > 0) return;
    event.preventDefault();
    this.drag = {
      card,
      valid: false,
      point: null,
      targetUnit: null
    };
    this.ghost.hidden = false;
    this.ghost.textContent = card.name;
    this.moveGhost(event.clientX, event.clientY);
    document.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('pointerup', this.onPointerUp, { once: true });
    this.updateDrag(event);
  }

  onPointerMove = (event) => {
    this.updateDrag(event);
  };

  onPointerUp = () => {
    if (!this.drag) return;
    if (this.drag.valid) {
      this.resolveCard(this.drag);
      this.cooldowns.set(this.drag.card.id, this.drag.card.cooldown);
    }
    this.drag = null;
    this.reticle.visible = false;
    this.enchantTargetRing.visible = false;
    this.ghost.hidden = true;
    document.removeEventListener('pointermove', this.onPointerMove);
  };

  updateDrag(event) {
    if (!this.drag) return;
    this.moveGhost(event.clientX, event.clientY);
    this.drag.screen = {
      x: event.clientX,
      y: event.clientY
    };
    this.pointerFromEvent(event);
    this.raycaster.setFromCamera(this.pointer, this.game.camera);
    const point = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.groundPlane, point);
    point.y = this.game.groundHeightAt(point);
    this.drag.point = point;
    this.drag.valid = false;
    this.drag.targetUnit = null;

    if (this.drag.card.target === 'friendly-unit') {
      const target = this.pickFriendlyUnit();
      this.drag.targetUnit = target;
      this.drag.valid = Boolean(target);
      this.showEnchantPreview(target);
      this.reticle.visible = false;
      return;
    }

    const validGround =
      insideBattlefield(point, BALANCE.battlefield) && this.game.isPointWalkable(point);
    this.drag.valid = validGround;
    this.showGroundPreview(point, this.drag.card.radius, validGround, this.drag.card);
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

  showEnchantPreview(target) {
    this.enchantTargetRing.visible = Boolean(target);
    if (!target) return;
    this.enchantTargetRing.position.set(
      target.position.x,
      target.position.y + 0.12,
      target.position.z
    );
    this.enchantTargetRing.scale.setScalar(0.9);
    this.enchantTargetRing.userData.disc.material = basicMat('#fff2c7', {
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }

  resolveCard(drag) {
    this.game.cardEffects.resolve(drag);
  }

  moveGhost(x, y) {
    this.ghost.style.left = `${x}px`;
    this.ghost.style.top = `${y}px`;
  }
}

function kindLabel(kind) {
  if (kind === 'summon') return '单位卡';
  if (kind === 'spell') return '法术卡';
  return '附魔卡';
}
