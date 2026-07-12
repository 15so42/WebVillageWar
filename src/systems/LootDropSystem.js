import * as THREE from 'three';
import { basicMat, mat } from '../art/lowpoly.js';
import { CARD_DEFINITIONS } from '../data/gameData.js';
import { cardEnergyCost, cardMaxUses, cardUseBarMarkup, createCardArtMarkup } from './CardSystem.js';

const CARD_BY_ID = new Map(CARD_DEFINITIONS.map((card) => [card.id, card]));
const DEFAULT_LOOT_LIFETIME_SECONDS = 45;
const DECLINED_LOOT_LIFETIME_SECONDS = 10;

export class LootDropSystem {
  constructor(game) {
    this.game = game;
    this.drops = [];
    this.hoveredDrop = null;
    this.activeDrop = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.ui = createLootConfirmUi();
    this.bindUi();
  }

  update(dt) {
    this.updateDrops(dt);
    this.updateHover();
  }

  handleUnitDeath(unit) {
    if (!unit?.isWildlife) return;
    const drops = unit.definition?.wildlife?.drops ?? [];
    for (const entry of drops) {
      const chance = Math.max(0, Math.min(1, entry.chance ?? 0));
      if (Math.random() > chance) continue;
      const card = this.createDropCard(entry, unit);
      if (card) {
        this.spawnCardDrop(card, unit.position);
      }
      return;
    }
  }

  createDropCard(entry, unit) {
    const definition = CARD_BY_ID.get(entry.cardId);
    if (!definition) return null;
    const difficulty = Math.max(1, this.game.levelSession?.difficulty ?? 1);
    const levelBonus = Math.floor((difficulty - 1) * Math.max(0, entry.levelPerDifficulty ?? 0));
    const level = Math.max(1, Math.floor((entry.level ?? 1) + levelBonus));
    const card = {
      ...definition,
      level,
      lootOnly: true,
      instanceId: `drop-${definition.id}-${unit.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    };
    const maxUses = cardMaxUses(card);
    if (maxUses > 0) {
      card.maxUses = maxUses;
      card.remainingUses = maxUses;
    }
    return card;
  }

  spawnCardDrop(card, position) {
    const model = createLootCardModel(card);
    const dropPosition = position.clone();
    dropPosition.x += (Math.random() - 0.5) * 0.52;
    dropPosition.z += (Math.random() - 0.5) * 0.52;
    dropPosition.y = this.game.groundHeightAt(dropPosition);
    model.group.position.copy(dropPosition);
    model.group.userData.lootDrop = null;

    const drop = {
      ...model,
      card,
      basePosition: dropPosition,
      age: 0,
      expiresIn: DEFAULT_LOOT_LIFETIME_SECONDS,
      declined: false
    };
    drop.group.userData.lootDrop = drop;
    drop.pickables.forEach((object) => {
      object.userData.lootDrop = drop;
    });
    this.drops.push(drop);
    this.game.scene.add(drop.group);
    this.game.effects.spawnRing(dropPosition, card.color, 0.7, 0.52);
  }

  tryOpenPickup(event) {
    if (event.button !== 0 || this.activeDrop || this.game.cardSystem?.drag) return false;
    const drop = this.pickDrop(event.clientX, event.clientY);
    if (!drop) return false;
    event.preventDefault();
    event.stopPropagation();
    this.showConfirm(drop);
    return true;
  }

  showConfirm(drop) {
    this.activeDrop = drop;
    this.setDropHighlighted(drop, true);
    this.ui.root.hidden = false;
    this.ui.card.style.setProperty('--card-color', drop.card.color);
    this.ui.card.innerHTML = `
      <div class="loot-card-cost">${cardEnergyCost(drop.card)}</div>
      <div class="loot-card-level">Lv.${drop.card.level ?? 1}</div>
      ${cardUseBarMarkup(drop.card, 'loot-card-use-bar')}
      <div class="loot-card-header">
        <span class="loot-card-rune">${drop.card.label}</span>
        <span>${kindLabel(drop.card.kind)}</span>
      </div>
      ${createCardArtMarkup(drop.card)}
      <strong>${drop.card.name}</strong>
      <p>${drop.card.summary}</p>
    `;
    this.ui.title.textContent = `${drop.card.name}`;
    this.ui.summary.textContent = '拿取后优先进入临时卡牌位。临时位已有卡时，会放入抽牌堆顶。';
  }

  hideConfirm() {
    this.ui.root.hidden = true;
    this.activeDrop = null;
  }

  takeActiveDrop() {
    const drop = this.activeDrop;
    if (!drop) return;
    const result = this.game.cardSystem.addLootCard(drop.card);
    this.game.effects.spawnRing(drop.basePosition, '#fff2c7', 0.82, 0.58);
    this.game.effects.spawnDamageNumber(drop.basePosition, 1, {
      text: result.location === 'temporary' ? '加入临时卡位' : '加入抽牌堆',
      color: '#fff2c7',
      stroke: '#1d1712',
      height: 1.75,
      duration: 0.8,
      fontSize: 82,
      baseHeight: 0.5,
      fadeStart: 0.64
    });
    this.removeDrop(drop);
    this.hideConfirm();
  }

  declineActiveDrop() {
    const drop = this.activeDrop;
    if (!drop) return;
    drop.declined = true;
    drop.expiresIn = Math.min(drop.expiresIn, DECLINED_LOOT_LIFETIME_SECONDS);
    this.game.cardSystem?.setHint(`${drop.card.name} 将在 10 秒后消失`, 'loot-drop');
    window.setTimeout(() => this.game.cardSystem?.clearHint?.('loot-drop'), 1800);
    this.hideConfirm();
  }

  updateDrops(dt) {
    for (let i = this.drops.length - 1; i >= 0; i -= 1) {
      const drop = this.drops[i];
      drop.age += dt;
      drop.expiresIn -= dt;
      if (drop.expiresIn <= 0) {
        this.removeDrop(drop);
        continue;
      }

      const bob = Math.sin(drop.age * 2.4) * 0.07;
      drop.group.position.y = drop.basePosition.y + bob;
      drop.cardHolder.rotation.y += dt * 0.72;
      drop.ring.rotation.z -= dt * 0.72;
      const warning = drop.expiresIn < 6 ? 0.5 + Math.sin(drop.age * 9) * 0.28 : 1;
      const hoverBoost = drop === this.hoveredDrop ? 1.3 : 1;
      drop.ring.material.opacity = (drop.declined ? 0.34 : 0.5) * warning * hoverBoost;
      drop.glow.material.opacity = (drop.declined ? 0.16 : 0.24) * warning * hoverBoost;
    }
  }

  updateHover() {
    if (this.activeDrop || this.game.cardSystem?.drag) {
      this.setHoveredDrop(null);
      return;
    }
    this.setHoveredDrop(this.pickDrop(this.game.pointerScreen.x, this.game.pointerScreen.y));
  }

  pickDrop(clientX, clientY) {
    if (!this.drops.length) return null;
    const rect = this.game.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.game.camera);
    const objects = this.drops.flatMap((drop) => drop.pickables);
    const hit = this.raycaster
      .intersectObjects(objects, true)
      .find((entry) => entry.object.userData.lootDrop);
    return hit?.object.userData.lootDrop ?? null;
  }

  setHoveredDrop(drop) {
    if (drop === this.hoveredDrop) return;
    if (this.hoveredDrop && this.hoveredDrop !== this.activeDrop) {
      this.setDropHighlighted(this.hoveredDrop, false);
    }
    this.hoveredDrop = drop;
    this.game.canvas.classList.toggle('is-loot-hover', Boolean(drop));
    if (drop) this.setDropHighlighted(drop, true);
  }

  setDropHighlighted(drop, highlighted) {
    if (!drop) return;
    drop.cardHolder.scale.setScalar(highlighted ? 1.14 : 1);
    drop.frame.material.emissiveIntensity = highlighted ? 0.5 : 0.18;
    drop.face.material.opacity = highlighted ? 1 : 0.94;
  }

  removeDrop(drop) {
    const index = this.drops.indexOf(drop);
    if (index >= 0) this.drops.splice(index, 1);
    if (this.hoveredDrop === drop) {
      this.hoveredDrop = null;
      this.game.canvas.classList.remove('is-loot-hover');
    }
    if (this.activeDrop === drop) {
      this.hideConfirm();
    }
    this.game.scene.remove(drop.group);
    disposeLootCardModel(drop);
  }

  bindUi() {
    this.ui.root.addEventListener('pointerdown', stopUiEvent);
    this.ui.takeButton.addEventListener('click', (event) => {
      stopUiEvent(event);
      this.takeActiveDrop();
    });
    this.ui.declineButton.addEventListener('click', (event) => {
      stopUiEvent(event);
      this.declineActiveDrop();
    });
    this.ui.closeButton.addEventListener('click', (event) => {
      stopUiEvent(event);
      this.declineActiveDrop();
    });
  }

  destroy() {
    this.drops.slice().forEach((drop) => this.removeDrop(drop));
    this.ui.root.remove();
  }
}

function createLootCardModel(card) {
  const group = new THREE.Group();
  const cardHolder = new THREE.Group();
  cardHolder.position.y = 0.92;

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.02, 1.42, 0.08),
    mat(card.color, {
      roughness: 0.72,
      emissive: card.color,
      emissiveIntensity: 0.18
    }).clone()
  );
  frame.position.z = -0.035;

  const texture = createLootCardTexture(card);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 1.26),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide
    })
  );
  face.position.z = 0.012;
  face.renderOrder = 1200;

  const shine = new THREE.Mesh(
    new THREE.PlaneGeometry(0.72, 1.06),
    basicMat('#ffffff', {
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone()
  );
  shine.position.set(-0.04, 0.02, 0.018);
  shine.rotation.z = -0.18;
  shine.renderOrder = 1201;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.58, 0.78, 42),
    basicMat(card.color, {
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone()
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  ring.renderOrder = 1100;

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 42),
    basicMat(card.color, {
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone()
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  glow.renderOrder = 1099;

  cardHolder.add(frame, face, shine);
  group.add(glow, ring, cardHolder);
  return {
    group,
    cardHolder,
    frame,
    face,
    ring,
    glow,
    texture,
    pickables: [frame, face]
  };
}

function createLootCardTexture(card) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 360;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;

  const gradient = context.createLinearGradient(0, 0, 256, 360);
  gradient.addColorStop(0, '#fff2c7');
  gradient.addColorStop(0.08, card.color);
  gradient.addColorStop(1, '#18251f');
  context.fillStyle = gradient;
  roundRect(context, 0, 0, 256, 360, 18);
  context.fill();

  context.strokeStyle = 'rgba(255,255,255,0.52)';
  context.lineWidth = 8;
  roundRect(context, 12, 12, 232, 336, 14);
  context.stroke();

  context.fillStyle = 'rgba(11,18,16,0.34)';
  roundRect(context, 34, 64, 188, 172, 14);
  context.fill();

  context.fillStyle = '#fff2c7';
  context.font = '900 78px "Microsoft YaHei", Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(card.label ?? '?', 128, 148);

  context.fillStyle = '#10241e';
  context.beginPath();
  context.arc(218, 42, 24, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#9eeedb';
  context.font = '900 28px Arial, sans-serif';
  context.fillText(String(cardEnergyCost(card)), 218, 42);

  context.fillStyle = '#fff2c7';
  context.font = '900 30px "Microsoft YaHei", Arial, sans-serif';
  fitText(context, card.name, 128, 275, 210, 30);
  context.fillStyle = '#ffe6a4';
  context.font = '900 22px "Microsoft YaHei", Arial, sans-serif';
  if (cardMaxUses(card) > 0) {
    const max = cardMaxUses(card);
    const barWidth = 8;
    const barHeight = 56;
    const startX = 24;
    const startY = 168;
    const gap = 4;
    const segmentHeight = (barHeight - gap * (max - 1)) / max;
    for (let index = 0; index < max; index += 1) {
      const y = startY + index * (segmentHeight + gap);
      context.fillStyle = 'rgba(10, 18, 18, 0.48)';
      roundRect(context, startX, y, barWidth, segmentHeight, 4);
      context.fill();
      context.fillStyle = '#fff2c7';
      roundRect(context, startX, y, barWidth, segmentHeight, 4);
      context.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function fitText(context, text, x, y, maxWidth, initialSize) {
  let fontSize = initialSize;
  while (context.measureText(text).width > maxWidth && fontSize > 18) {
    fontSize -= 2;
    context.font = `900 ${fontSize}px "Microsoft YaHei", Arial, sans-serif`;
  }
  context.fillText(text, x, y);
}

function disposeLootCardModel(drop) {
  drop.group.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => material?.dispose?.());
  });
  drop.texture?.dispose?.();
}

function createLootConfirmUi() {
  const existing = document.querySelector('#loot-confirm');
  if (existing) return collectLootConfirmUi(existing);
  const root = document.createElement('section');
  root.id = 'loot-confirm';
  root.className = 'loot-confirm';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="loot-confirm-panel">
      <button class="loot-confirm-close" type="button" aria-label="关闭">×</button>
      <article class="loot-confirm-card"></article>
      <div class="loot-confirm-copy">
        <div class="loot-confirm-kicker">野怪掉落</div>
        <h2></h2>
        <p></p>
        <div class="loot-confirm-actions">
          <button class="loot-confirm-take" type="button">拿取</button>
          <button class="loot-confirm-decline" type="button">不拿取</button>
        </div>
      </div>
    </div>
  `;
  document.body.append(root);
  return collectLootConfirmUi(root);
}

function collectLootConfirmUi(root) {
  return {
    root,
    card: root.querySelector('.loot-confirm-card'),
    title: root.querySelector('.loot-confirm-copy h2'),
    summary: root.querySelector('.loot-confirm-copy p'),
    takeButton: root.querySelector('.loot-confirm-take'),
    declineButton: root.querySelector('.loot-confirm-decline'),
    closeButton: root.querySelector('.loot-confirm-close')
  };
}

function kindLabel(kind) {
  if (kind === 'summon') return '单位卡';
  if (kind === 'spell') return '法术卡';
  return '附魔卡';
}

function stopUiEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}
