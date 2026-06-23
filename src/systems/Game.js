import * as THREE from 'three';
import { createHealthBar, createSelectionRing } from '../art/lowpoly.js';
import { BALANCE, TEAMS } from '../data/gameData.js';
import { UnitEntity } from '../entities/UnitEntity.js';
import { createWorld } from '../world/createWorld.js';
import { BuffSystem } from './BuffSystem.js';
import { CardEffectSystem } from './CardEffectSystem.js';
import { CardSystem } from './CardSystem.js';
import { CombatSystem } from './CombatSystem.js';
import { EffectsSystem } from './EffectsSystem.js';
import { ModifierSystem } from './ModifierSystem.js';
import { RecoverySystem } from './RecoverySystem.js';
import { SpellSystem } from './SpellSystem.js';
import { clamp, polarOffset } from '../utils/math.js';

export class Game {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 240);
    this.camera.position.set(0, 34, 47.2);
    this.camera.lookAt(0, 4, 10);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.cameraTarget = new THREE.Vector3(0, 4, 18);
    this.cameraOffsetDirection = new THREE.Vector3(0, 30, 37.2).normalize();
    this.cameraDistance = 28.7;
    this.cameraMinDistance = 12;
    this.cameraMaxDistance = 78;
    this.pointerScreen = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5);
    this.edgePanActive = false;
    this.updateCamera(0);

    this.clock = new THREE.Clock();
    this.friendlyUnits = [];
    this.enemyUnits = [];
    this.score = 0;
    this.wave = 1;
    this.waveTimer = 12;
    this.lastCardPlayed = null;
    this.selectedUnit = null;
    this.selectedUnits = [];
    this.selectionRings = [];
    this.selectionDrag = null;
    this.playerBase = {
      position: new THREE.Vector3(
        BALANCE.playerBase.position.x,
        0,
        BALANCE.playerBase.position.z
      ),
      health: BALANCE.playerBase.maxHealth,
      maxHealth: BALANCE.playerBase.maxHealth,
      alive: true,
      projectileHitHeight: 2.1
    };

    this.world = createWorld(this.scene);
    this.playerBase.position.y = this.groundHeightAt(this.playerBase.position);
    this.enemyCamp = {
      position: new THREE.Vector3(
        BALANCE.enemyCamp.position.x,
        0,
        BALANCE.enemyCamp.position.z
      ),
      health: BALANCE.enemyCamp.maxHealth,
      maxHealth: BALANCE.enemyCamp.maxHealth,
      alive: true,
      projectileHitHeight: 2.2
    };
    this.enemyCamp.position.y = this.groundHeightAt(this.enemyCamp.position);
    this.baseHealthBar = attachStructureHealthBar(this.world.playerBaseModel, '#62d56f', 3.9, 2.1);
    this.enemyCampHealthBar = attachStructureHealthBar(this.world.enemyCampModel, '#e05d56', 3.15, 2.0);

    this.effects = new EffectsSystem(this.scene);
    this.modifiers = new ModifierSystem(this);
    this.buffs = new BuffSystem(this);
    this.combat = new CombatSystem(this);
    this.spells = new SpellSystem(this);
    this.cardEffects = new CardEffectSystem(this);
    this.recovery = new RecoverySystem(this);
    this.cardSystem = new CardSystem(this);
    this.selectionBox = createSelectionBoxElement();

    this.dom = {
      baseHealth: document.querySelector('#base-health'),
      waveLabel: document.querySelector('#wave-label'),
      unitCount: document.querySelector('#unit-count'),
      selectedName: document.querySelector('#selected-name'),
      selectedStats: document.querySelector('#selected-stats'),
      selectedEnchants: document.querySelector('#selected-enchants'),
      debug: document.querySelector('#debug-state')
    };

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    canvas.addEventListener('contextmenu', (event) => this.onGameContextMenu(event));
    canvas.addEventListener('pointerdown', (event) => this.onCanvasPointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.onCanvasPointerMove(event));
    canvas.addEventListener('pointerup', (event) => this.onCanvasPointerUp(event));
    canvas.addEventListener('pointercancel', (event) => this.onCanvasPointerCancel(event));
    canvas.addEventListener('mousedown', (event) => this.onCanvasMouseDown(event));
    window.addEventListener('mousemove', (event) => this.onCanvasPointerMove(event));
    window.addEventListener('mouseup', (event) => this.onCanvasPointerUp(event));
    canvas.addEventListener('wheel', (event) => this.onCanvasWheel(event), { passive: false });
    window.addEventListener('pointermove', (event) => this.onWindowPointerMove(event));
    window.addEventListener('contextmenu', (event) => this.onGameContextMenu(event), true);
    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.summonUnits('swordsman', 1, new THREE.Vector3(-1.4, 0, 27.8), 0.7);
    this.summonUnits('archer', 1, new THREE.Vector3(1.4, 0, 27.8), 0.7);
    this.spawnWildlife();
    this.spawnEnemyWave(1, { orders: 'guard' });

    window.__VILLAGE_WAR_DEBUG__ = {
      snapshot: () => this.snapshot(),
      samplePixels: () => this.samplePixels()
    };
  }

  start() {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.waveTimer -= dt;
    if (this.waveTimer <= 0 && this.playerBase.health > 0 && this.enemyCamp.alive) {
      this.wave += 1;
      this.spawnEnemyWave(this.wave, { orders: 'attack' });
      this.waveTimer = Math.max(12, 18 - this.wave * 0.35);
    }
    this.cardSystem.update(dt);
    this.combat.update(dt);
    this.recovery.update(dt);
    this.effects.update(dt);
    this.updateCamera(dt);
    this.updateSelection();
    this.updateUnitVisuals(dt);
    this.updateHud();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  updateCamera(dt) {
    if (dt > 0 && this.edgePanActive && !this.cardSystem.drag && !this.selectionDrag) {
      const margin = 26;
      const width = window.innerWidth;
      const height = window.innerHeight;
      let panX = 0;
      let panZ = 0;

      if (this.pointerScreen.x <= margin) panX -= 1;
      if (this.pointerScreen.x >= width - margin) panX += 1;
      if (this.pointerScreen.y <= margin) panZ -= 1;
      if (this.pointerScreen.y >= height - margin) panZ += 1;

      if (panX !== 0 || panZ !== 0) {
        const length = Math.hypot(panX, panZ);
        const speed = 12 + this.cameraDistance * 0.24;
        this.cameraTarget.x += (panX / length) * speed * dt;
        this.cameraTarget.z += (panZ / length) * speed * dt;
        this.clampCameraTarget();
      }
    }

    this.cameraTarget.y = 4;
    this.camera.position.copy(this.cameraTarget).addScaledVector(
      this.cameraOffsetDirection,
      this.cameraDistance
    );
    this.camera.lookAt(this.cameraTarget);
  }

  clampCameraTarget() {
    const margin = 4;
    this.cameraTarget.x = clamp(
      this.cameraTarget.x,
      -BALANCE.battlefield.halfWidth + margin,
      BALANCE.battlefield.halfWidth - margin
    );
    this.cameraTarget.z = clamp(
      this.cameraTarget.z,
      BALANCE.battlefield.minZ + margin,
      BALANCE.battlefield.maxZ - margin
    );
  }

  onCanvasWheel(event) {
    event.preventDefault();
    this.cameraDistance = clamp(
      this.cameraDistance + event.deltaY * 0.035,
      this.cameraMinDistance,
      this.cameraMaxDistance
    );
    this.updateCamera(0);
  }

  onWindowPointerMove(event) {
    this.pointerScreen.set(event.clientX, event.clientY);
    this.edgePanActive = !isGameUiTarget(event.target);
  }

  onGameContextMenu(event) {
    if (!event.target?.closest?.('#app')) return;
    event.preventDefault();
    event.stopPropagation();
  }

  summonUnits(type, count, point, radius = 1) {
    for (let i = 0; i < count; i += 1) {
      const offset = polarOffset(i, count, radius * 0.55);
      const position = point.clone().add(offset);
      if (!this.isPointWalkable(position)) {
        position.copy(point);
      }
      position.y = this.groundHeightAt(position);
      const unit = new UnitEntity({
        type,
        team: TEAMS.PLAYER,
        position
      });
      this.friendlyUnits.push(unit);
      this.scene.add(unit.mesh);
      this.effects.spawnRing(unit.position, '#9dd8ff', 0.82, 0.52);
      this.selectUnit(unit);
    }
  }

  spawnEnemyWave(wave, { orders = 'attack' } = {}) {
    const count = Math.min(8, 2 + Math.floor(wave * 0.8));
    for (let i = 0; i < count; i += 1) {
      const offset = polarOffset(i, count, 1.2 + (i % 3) * 0.45);
      const camp = BALANCE.enemyCamp.position;
      const position = new THREE.Vector3(camp.x, 0, camp.z).add(offset);
      position.y = this.groundHeightAt(position);
      const unit = new UnitEntity({
        type: 'raider',
        team: TEAMS.ENEMY,
        position
      });
      this.enemyUnits.push(unit);
      this.scene.add(unit.mesh);
      if (orders === 'attack') {
        this.orderEnemyAttack(unit, i, count);
      }
    }
  }

  orderEnemyAttack(unit, index, total) {
    const formationRadius = Math.min(3, 0.8 + Math.sqrt(total) * 0.38);
    const goal = this.playerBase.position.clone().add(
      commandFormationOffset(index, total, formationRadius)
    );
    goal.y = this.groundHeightAt(goal);
    unit.moveGoal = goal;
    unit.commandMoveGoal = null;
  }

  spawnWildlife() {
    BALANCE.world.wildlife.forEach((spawn, index) => {
      const unit = new UnitEntity({
        type: spawn.type,
        team: TEAMS.ENEMY,
        position: new THREE.Vector3(spawn.x, this.groundHeightAt(spawn), spawn.z)
      });
      unit.isWildlife = true;
      unit.spawnPoint = unit.position.clone();
      unit.leashRadius = spawn.radius;
      unit.moveGoal = unit.spawnPoint.clone();
      unit.wanderGoal = unit.spawnPoint.clone();
      unit.wanderTimer = 0;
      unit.attackTimer += index * 0.08;
      this.enemyUnits.push(unit);
      this.scene.add(unit.mesh);
      this.effects.spawnRing(unit.position, spawn.type === 'bear' ? '#9b6b45' : '#8aa0a8', 0.66, 0.5);
    });
  }

  groundHeightAt(pointOrX, maybeZ = null) {
    const x = typeof pointOrX === 'number' ? pointOrX : pointOrX.x;
    const z = typeof pointOrX === 'number' ? maybeZ : pointOrX.z;
    return this.world?.heightAt?.(x, z) ?? 0;
  }

  placeUnitOnGround(unit, dt = 0) {
    const groundY = this.groundHeightAt(unit.position);
    if (dt <= 0) {
      unit.position.y = groundY;
      return;
    }
    const maxStep = 8 * dt;
    unit.position.y += clamp(groundY - unit.position.y, -maxStep, maxStep);
  }

  isPointWalkable(point) {
    if (
      Math.abs(point.x) > BALANCE.battlefield.halfWidth ||
      point.z < BALANCE.battlefield.minZ ||
      point.z > BALANCE.battlefield.maxZ
    ) {
      return false;
    }

    return true;
  }

  castMeteor(point, card) {
    this.spells.cast('meteor', { point, card });
  }

  damagePlayerBase(amount) {
    this.playerBase.health = Math.max(0, this.playerBase.health - amount);
    this.playerBase.alive = this.playerBase.health > 0;
    this.effects.spawnRing(this.playerBase.position, '#ff8c66', 1.2, 0.44);
  }

  damageEnemyCamp(amount) {
    if (!this.enemyCamp.alive) return;
    this.enemyCamp.health = Math.max(0, this.enemyCamp.health - amount);
    this.enemyCamp.alive = this.enemyCamp.health > 0;
    this.effects.spawnRing(this.enemyCamp.position, '#ff8c66', 1.1, 0.44);
  }

  selectUnit(unit) {
    this.selectUnits(unit ? [unit] : []);
  }

  selectUnits(units) {
    const unique = new Set();
    this.selectedUnits = units.filter((unit) => {
      if (!unit?.alive || unit.team !== TEAMS.PLAYER || unique.has(unit.id)) return false;
      unique.add(unit.id);
      return true;
    });
    this.selectedUnit = this.selectedUnits[0] ?? null;
  }

  onCanvasPointerDown(event) {
    if (event.target !== this.canvas) return;
    this.pointerScreen.set(event.clientX, event.clientY);

    if (event.button === 2) {
      event.preventDefault();
      this.issueMoveCommand(event);
      return;
    }

    if (event.button !== 0 || this.cardSystem.drag) return;
    event.preventDefault();
    this.selectionDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      active: false
    };
    if (event.pointerId != null) {
      this.canvas.setPointerCapture?.(event.pointerId);
    }
  }

  onCanvasMouseDown(event) {
    if (event.button !== 0 || this.selectionDrag) return;
    this.onCanvasPointerDown(event);
  }

  onCanvasPointerMove(event) {
    this.pointerScreen.set(event.clientX, event.clientY);
    if (!this.isCurrentSelectionEvent(event)) return;
    this.selectionDrag.currentX = event.clientX;
    this.selectionDrag.currentY = event.clientY;

    const dx = event.clientX - this.selectionDrag.startX;
    const dy = event.clientY - this.selectionDrag.startY;
    if (Math.hypot(dx, dy) > 6) {
      this.selectionDrag.active = true;
    }
    this.updateSelectionBox();
  }

  onCanvasPointerUp(event) {
    if (!this.isCurrentSelectionEvent(event)) return;
    const drag = this.selectionDrag;
    this.selectionDrag = null;
    if (event.pointerId != null) {
      this.canvas.releasePointerCapture?.(event.pointerId);
    }
    this.hideSelectionBox();

    if (drag.active) {
      this.selectUnits(this.unitsInScreenRect(drag));
      return;
    }

    this.selectUnit(this.pickFriendlyUnit(event.clientX, event.clientY));
  }

  onCanvasPointerCancel(event) {
    if (!this.isCurrentSelectionEvent(event)) return;
    this.selectionDrag = null;
    if (event.pointerId != null) {
      this.canvas.releasePointerCapture?.(event.pointerId);
    }
    this.hideSelectionBox();
  }

  isCurrentSelectionEvent(event) {
    if (!this.selectionDrag) return false;
    return event.pointerId == null || this.selectionDrag.pointerId == null || this.selectionDrag.pointerId === event.pointerId;
  }

  updateSelectionBox() {
    if (!this.selectionDrag?.active) {
      this.hideSelectionBox();
      return;
    }
    const x = Math.min(this.selectionDrag.startX, this.selectionDrag.currentX);
    const y = Math.min(this.selectionDrag.startY, this.selectionDrag.currentY);
    const width = Math.abs(this.selectionDrag.currentX - this.selectionDrag.startX);
    const height = Math.abs(this.selectionDrag.currentY - this.selectionDrag.startY);
    this.selectionBox.hidden = false;
    this.selectionBox.style.transform = `translate(${x}px, ${y}px)`;
    this.selectionBox.style.width = `${width}px`;
    this.selectionBox.style.height = `${height}px`;
  }

  hideSelectionBox() {
    this.selectionBox.hidden = true;
  }

  pickFriendlyUnit(clientX, clientY) {
    this.setPointerFromClient(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const objects = this.friendlyUnits.flatMap((unit) => unit.mesh.children);
    const hit = this.raycaster
      .intersectObjects(objects, true)
      .find((entry) => entry.object.userData.entity?.alive);
    if (hit?.object.userData.entity) return hit.object.userData.entity;

    let best = null;
    let bestDistance = 42;
    this.friendlyUnits.forEach((unit) => {
      if (!unit.alive) return;
      const screen = this.worldToScreen(unit.position);
      const distance = Math.hypot(screen.x - clientX, screen.y - clientY);
      if (distance < bestDistance) {
        best = unit;
        bestDistance = distance;
      }
    });
    return best;
  }

  unitsInScreenRect(drag) {
    const minX = Math.min(drag.startX, drag.currentX);
    const maxX = Math.max(drag.startX, drag.currentX);
    const minY = Math.min(drag.startY, drag.currentY);
    const maxY = Math.max(drag.startY, drag.currentY);
    return this.friendlyUnits.filter((unit) => {
      if (!unit.alive) return false;
      const screen = this.worldToScreen(unit.position);
      return screen.x >= minX && screen.x <= maxX && screen.y >= minY && screen.y <= maxY;
    });
  }

  issueMoveCommand(event) {
    const point = this.groundPointFromClient(event.clientX, event.clientY);
    if (!point || !this.selectedUnits.length) return;
    this.commandSelectedUnits(point);
  }

  commandSelectedUnits(point) {
    const units = this.selectedUnits.filter((unit) => unit.alive);
    if (!units.length) return;
    const formationRadius = Math.min(2.4, 0.55 + Math.sqrt(units.length) * 0.42);
    units.forEach((unit, index) => {
      const destination = point.clone().add(commandFormationOffset(index, units.length, formationRadius));
      if (!this.isPointWalkable(destination)) {
        destination.copy(point);
      }
      destination.y = this.groundHeightAt(destination);
      unit.commandMoveGoal = destination;
      unit.moveGoal = destination.clone();
      unit.route = null;
      unit.routeIndex = null;
      unit.target = null;
    });
    this.combat.cancelPendingAttacksFor(units);
    this.effects.spawnMoveDestination(point, formationRadius);
  }

  setPointerFromClient(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  groundPointFromClient(clientX, clientY) {
    this.setPointerFromClient(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.world?.ground) {
      this.world.ground.updateMatrixWorld(true);
      const terrainHit = this.raycaster.intersectObject(this.world.ground, false)[0];
      if (terrainHit?.point) {
        const point = terrainHit.point.clone();
        point.y = this.groundHeightAt(point);
        if (!this.isPointWalkable(point)) return null;
        return point;
      }
    }

    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point)) {
      return null;
    }
    point.y = this.groundHeightAt(point);
    if (!this.isPointWalkable(point)) return null;
    return point;
  }

  updateSelection() {
    this.selectedUnits = this.selectedUnits.filter((unit) => unit.alive);
    this.selectedUnit = this.selectedUnits[0] ?? null;
    this.ensureSelectionRingCount(this.selectedUnits.length);

    this.selectionRings.forEach((ring, index) => {
      const unit = this.selectedUnits[index];
      ring.visible = Boolean(unit);
      if (!unit) return;
      ring.position.x = unit.position.x;
      ring.position.y = unit.position.y + 0.05;
      ring.position.z = unit.position.z;
      ring.rotation.set(0, 0, 0);
      ring.userData.ring.rotation.z += 0.035;
      ring.userData.glow.rotation.z -= 0.018;
    });
  }

  ensureSelectionRingCount(count) {
    while (this.selectionRings.length < count) {
      const ring = createSelectionRing();
      this.selectionRings.push(ring);
      this.scene.add(ring);
    }
  }

  updateUnitVisuals(dt) {
    [...this.friendlyUnits, ...this.enemyUnits].forEach((unit) => {
      this.placeUnitOnGround(unit, dt);
      unit.updateVisual(this.camera, dt);
    });
    updateStructureHealthBar(this.baseHealthBar, this.playerBase, this.camera);
    updateStructureHealthBar(this.enemyCampHealthBar, this.enemyCamp, this.camera);
  }

  updateHud() {
    const baseRatio = Math.round(
      (this.playerBase.health / this.playerBase.maxHealth) * 100
    );
    this.dom.baseHealth.textContent = `${baseRatio}%`;
    this.dom.waveLabel.textContent = String(this.wave);
    this.dom.unitCount.textContent = String(this.friendlyUnits.length);
    if (this.selectedUnits.length > 1) {
      const totalHealth = Math.round(
        this.selectedUnits.reduce((sum, unit) => sum + unit.health, 0)
      );
      const types = countBy(this.selectedUnits, (unit) => unit.name);
      this.dom.selectedName.textContent = `已选中 ${this.selectedUnits.length} 个单位`;
      this.dom.selectedStats.textContent = `总 HP ${totalHealth} / ${formatCounts(types)}`;
      this.dom.selectedEnchants.textContent = '右键地面移动，遇敌自动战斗';
    } else if (this.selectedUnit) {
      const unit = this.selectedUnit;
      const hp = Math.round(unit.health);
      const durability = Math.round(unit.weapon.durability);
      const maxDurability = Math.round(unit.weapon.maxDurability);
      const enchantments = [...unit.enchantments.values()].map((item) => item.name);
      this.dom.selectedName.textContent = `${unit.name} #${unit.id}`;
      this.dom.selectedStats.textContent = `HP ${hp}/${unit.maxHealth} / ${unit.weapon.name} ${durability}/${maxDurability}`;
      this.dom.selectedEnchants.textContent = `附魔 ${enchantments.join('、') || '-'}`;
    } else {
      this.dom.selectedName.textContent = '未选中';
      this.dom.selectedStats.textContent = 'HP - / 武器 -';
      this.dom.selectedEnchants.textContent = '附魔 -';
    }
    this.dom.debug.textContent = JSON.stringify(this.snapshot());
  }

  snapshot() {
    return {
      friendly: this.friendlyUnits.length,
      enemies: this.enemyUnits.length,
      wave: this.wave,
      baseHealth: Math.round(this.playerBase.health),
      enemyCampHealth: Math.round(this.enemyCamp.health),
      selectedCount: this.selectedUnits.length,
      selectedIds: this.selectedUnits.map((unit) => unit.id),
      camera: {
        targetX: Number(this.cameraTarget.x.toFixed(2)),
        targetZ: Number(this.cameraTarget.z.toFixed(2)),
        distance: Number(this.cameraDistance.toFixed(2))
      },
      selected: this.selectedUnit
        ? {
            id: this.selectedUnit.id,
            type: this.selectedUnit.type,
            x: Number(this.selectedUnit.position.x.toFixed(2)),
            y: Number(this.selectedUnit.position.y.toFixed(2)),
            z: Number(this.selectedUnit.position.z.toFixed(2)),
            hp: Math.round(this.selectedUnit.health),
            weapon: Math.round(this.selectedUnit.weapon.durability),
            enchantments: [...this.selectedUnit.enchantments.keys()],
            commandMoveGoal: this.selectedUnit.commandMoveGoal
              ? {
                  x: Number(this.selectedUnit.commandMoveGoal.x.toFixed(2)),
                  y: Number(this.selectedUnit.commandMoveGoal.y.toFixed(2)),
                  z: Number(this.selectedUnit.commandMoveGoal.z.toFixed(2))
                }
              : null,
            screen: this.worldToScreen(this.selectedUnit.position)
          }
        : null,
      friendlySample: this.friendlyUnits.slice(0, 4).map((unit) => ({
        id: unit.id,
        type: unit.type,
        x: Number(unit.position.x.toFixed(2)),
        y: Number(unit.position.y.toFixed(2)),
        z: Number(unit.position.z.toFixed(2)),
        hp: Math.round(unit.health),
        screen: this.worldToScreen(unit.position)
      })),
      enemySample: this.enemyUnits.slice(0, 8).map((enemy) => ({
        id: enemy.id,
        type: enemy.type,
        x: Number(enemy.position.x.toFixed(2)),
        y: Number(enemy.position.y.toFixed(2)),
        z: Number(enemy.position.z.toFixed(2)),
        hp: Math.round(enemy.health),
        screen: this.worldToScreen(enemy.position)
      })),
      raiderSample: this.enemyUnits
        .filter((enemy) => enemy.type === 'raider')
        .slice(0, 8)
        .map((enemy) => ({
          id: enemy.id,
          x: Number(enemy.position.x.toFixed(2)),
          y: Number(enemy.position.y.toFixed(2)),
          z: Number(enemy.position.z.toFixed(2)),
          moveGoal: enemy.moveGoal
            ? {
                x: Number(enemy.moveGoal.x.toFixed(2)),
                y: Number(enemy.moveGoal.y.toFixed(2)),
                z: Number(enemy.moveGoal.z.toFixed(2))
              }
            : null
        })),
      lastCardPlayed: this.lastCardPlayed,
      pixels: this.samplePixels()
    };
  }

  worldToScreen(position) {
    const projected = position.clone();
    projected.y += 1;
    projected.project(this.camera);
    return {
      x: Math.round((projected.x * 0.5 + 0.5) * window.innerWidth),
      y: Math.round((-projected.y * 0.5 + 0.5) * window.innerHeight)
    };
  }

  samplePixels() {
    const gl = this.renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const points = [
      [Math.floor(width * 0.5), Math.floor(height * 0.5)],
      [Math.floor(width * 0.25), Math.floor(height * 0.55)],
      [Math.floor(width * 0.72), Math.floor(height * 0.4)]
    ];
    return points.map(([x, y]) => {
      const pixel = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return [...pixel];
    });
  }
}

function createSelectionBoxElement() {
  const element = document.createElement('div');
  element.className = 'selection-box';
  element.hidden = true;
  document.body.appendChild(element);
  return element;
}

function isGameUiTarget(target) {
  return Boolean(target?.closest?.('.hud, .card-hand, .card, .drag-ghost'));
}

function commandFormationOffset(index, total, radius) {
  if (total <= 1) return new THREE.Vector3();
  if (index === 0) return new THREE.Vector3();
  const ringIndex = index - 1;
  const angle = (ringIndex / Math.max(1, total - 1)) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
}

function countBy(items, selector) {
  const counts = new Map();
  items.forEach((item) => {
    const key = selector(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

function formatCounts(counts) {
  return [...counts.entries()].map(([name, count]) => `${name} x${count}`).join('、');
}

function attachStructureHealthBar(model, color, y, scale) {
  const healthBar = createHealthBar({ hpColor: color });
  healthBar.position.y = y;
  healthBar.scale.set(scale, scale, scale);
  healthBar.userData.weapon.visible = false;
  model.add(healthBar);
  return healthBar;
}

function updateStructureHealthBar(healthBar, structure, camera) {
  const hpRatio = clamp(structure.health / structure.maxHealth, 0, 1);
  const hp = healthBar.userData.hp;
  hp.scale.x = hpRatio;
  hp.position.x = (hpRatio - 1) * 0.5;
  healthBar.visible = structure.health > 0;
  healthBar.lookAt(camera.position);
}
