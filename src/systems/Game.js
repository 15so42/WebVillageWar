import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSelectionRing } from '../art/lowpoly.js';
import { BALANCE, TEAMS } from '../data/gameData.js';
import { UnitEntity } from '../entities/UnitEntity.js';
import { createWorld } from '../world/createWorld.js';
import { CardSystem } from './CardSystem.js';
import { CombatSystem } from './CombatSystem.js';
import { EffectsSystem } from './EffectsSystem.js';
import { RecoverySystem } from './RecoverySystem.js';
import { distance2D, polarOffset } from '../utils/math.js';

export class Game {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
    this.camera.position.set(0, 20, 22);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0.8, 0);
    this.controls.minDistance = 14;
    this.controls.maxDistance = 34;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minPolarAngle = Math.PI * 0.18;
    this.controls.enablePan = true;

    this.clock = new THREE.Clock();
    this.friendlyUnits = [];
    this.enemyUnits = [];
    this.score = 0;
    this.wave = 1;
    this.waveTimer = 12;
    this.lastCardPlayed = null;
    this.selectedUnit = null;
    this.playerBase = {
      position: new THREE.Vector3(
        BALANCE.playerBase.position.x,
        0,
        BALANCE.playerBase.position.z
      ),
      health: BALANCE.playerBase.maxHealth,
      maxHealth: BALANCE.playerBase.maxHealth
    };

    this.world = createWorld(this.scene);
    this.effects = new EffectsSystem(this.scene);
    this.combat = new CombatSystem(this);
    this.recovery = new RecoverySystem(this);
    this.cardSystem = new CardSystem(this);
    this.selectionRing = createSelectionRing();
    this.scene.add(this.selectionRing);

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
    canvas.addEventListener('pointerdown', (event) => this.onCanvasPointerDown(event));
    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.summonUnits('swordsman', 1, new THREE.Vector3(-1.6, 0, 10.8), 0.7);
    this.summonUnits('archer', 1, new THREE.Vector3(1.6, 0, 10.8), 0.7);
    this.spawnEnemyWave(1);

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
    if (this.waveTimer <= 0 && this.playerBase.health > 0) {
      this.wave += 1;
      this.spawnEnemyWave(this.wave);
      this.waveTimer = Math.max(12, 18 - this.wave * 0.35);
    }
    this.cardSystem.update(dt);
    this.combat.update(dt);
    this.recovery.update(dt);
    this.effects.update(dt);
    this.updateSelection();
    this.updateUnitVisuals(dt);
    this.updateHud();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  summonUnits(type, count, point, radius = 1) {
    for (let i = 0; i < count; i += 1) {
      const offset = polarOffset(i, count, radius * 0.55);
      const position = point.clone().add(offset);
      const unit = new UnitEntity({
        type,
        team: TEAMS.PLAYER,
        position
      });
      unit.moveGoal = new THREE.Vector3(
        BALANCE.enemyCamp.position.x,
        0,
        BALANCE.enemyCamp.position.z + 1.8
      );
      this.friendlyUnits.push(unit);
      this.scene.add(unit.mesh);
      this.effects.spawnRing(unit.position, '#9dd8ff', 0.82, 0.52);
      this.selectUnit(unit);
    }
  }

  spawnEnemyWave(wave) {
    const count = Math.min(8, 2 + Math.floor(wave * 0.8));
    for (let i = 0; i < count; i += 1) {
      const offset = polarOffset(i, count, 1.2 + (i % 3) * 0.45);
      const camp = BALANCE.enemyCamp.position;
      const unit = new UnitEntity({
        type: 'raider',
        team: TEAMS.ENEMY,
        position: new THREE.Vector3(camp.x, 0, camp.z).add(offset)
      });
      unit.moveGoal = this.playerBase.position.clone();
      this.enemyUnits.push(unit);
      this.scene.add(unit.mesh);
    }
  }

  castMeteor(point, card) {
    this.effects.spawnMeteor(point.clone(), card.radius, () => {
      this.enemyUnits.forEach((enemy) => {
        if (!enemy.alive) return;
        const distance = distance2D(enemy.position, point);
        if (distance > card.radius) return;
        const falloff = 1 - distance / card.radius;
        this.combat.applyDamage(enemy, card.damage * (0.65 + falloff * 0.35), null, 0);
        const dir = enemy.position.clone().sub(point).setY(0).normalize();
        enemy.knockbackVelocity.addScaledVector(dir, card.knockback * (0.45 + falloff));
      });
    });
  }

  damagePlayerBase(amount) {
    this.playerBase.health = Math.max(0, this.playerBase.health - amount);
    this.effects.spawnRing(this.playerBase.position, '#ff8c66', 1.2, 0.44);
  }

  selectUnit(unit) {
    this.selectedUnit = unit?.alive ? unit : null;
  }

  onCanvasPointerDown(event) {
    if (event.target !== this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const objects = [...this.friendlyUnits, ...this.enemyUnits].flatMap(
      (unit) => unit.mesh.children
    );
    const hit = this.raycaster
      .intersectObjects(objects, true)
      .find((entry) => entry.object.userData.entity?.alive);
    this.selectUnit(hit?.object.userData.entity ?? null);
  }

  updateSelection() {
    if (!this.selectedUnit?.alive) {
      this.selectedUnit = null;
      this.selectionRing.visible = false;
      return;
    }
    this.selectionRing.visible = true;
    this.selectionRing.position.x = this.selectedUnit.position.x;
    this.selectionRing.position.z = this.selectedUnit.position.z;
    this.selectionRing.rotation.z += 0.03;
  }

  updateUnitVisuals(dt) {
    [...this.friendlyUnits, ...this.enemyUnits].forEach((unit) => {
      unit.updateVisual(this.camera, dt);
    });
  }

  updateHud() {
    const baseRatio = Math.round(
      (this.playerBase.health / this.playerBase.maxHealth) * 100
    );
    this.dom.baseHealth.textContent = `${baseRatio}%`;
    this.dom.waveLabel.textContent = String(this.wave);
    this.dom.unitCount.textContent = String(this.friendlyUnits.length);
    if (this.selectedUnit) {
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
      selected: this.selectedUnit
        ? {
            id: this.selectedUnit.id,
            type: this.selectedUnit.type,
            hp: Math.round(this.selectedUnit.health),
            weapon: Math.round(this.selectedUnit.weapon.durability),
            enchantments: [...this.selectedUnit.enchantments.keys()],
            screen: this.worldToScreen(this.selectedUnit.position)
          }
        : null,
      enemySample: this.enemyUnits.slice(0, 3).map((enemy) => ({
        id: enemy.id,
        hp: Math.round(enemy.health),
        screen: this.worldToScreen(enemy.position)
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
