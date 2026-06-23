import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
import { clamp, distance2D, polarOffset } from '../utils/math.js';

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
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 4, 10);
    this.controls.minDistance = 9;
    this.controls.maxDistance = 78;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minPolarAngle = Math.PI * 0.16;
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
    this.baseHealthBar = attachStructureHealthBar(this.world.playerBaseModel, '#62d56f', 3.25, 2.1);
    this.enemyCampHealthBar = attachStructureHealthBar(this.world.enemyCampModel, '#e05d56', 3.15, 2.0);

    const route = this.createRoute(BALANCE.world.pathPoints);
    this.routes = {
      playerToEnemy: route,
      enemyToPlayer: route.map((point) => point.clone()).reverse()
    };
    this.effects = new EffectsSystem(this.scene);
    this.modifiers = new ModifierSystem(this);
    this.buffs = new BuffSystem(this);
    this.combat = new CombatSystem(this);
    this.spells = new SpellSystem(this);
    this.cardEffects = new CardEffectSystem(this);
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

    this.summonUnits('swordsman', 1, new THREE.Vector3(-1.4, 0, 27.8), 0.7);
    this.summonUnits('archer', 1, new THREE.Vector3(1.4, 0, 27.8), 0.7);
    this.spawnWildlife();
    this.spawnEnemyWave(1);

    window.__VILLAGE_WAR_DEBUG__ = {
      snapshot: () => this.snapshot(),
      samplePixels: () => this.samplePixels()
    };
  }

  start() {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  createRoute(points) {
    const routePoints = points.map((point) => new THREE.Vector3(point.x, 0, point.z));
    const curve = new THREE.CatmullRomCurve3(routePoints);
    return curve.getPoints(86).map(
      (point) => new THREE.Vector3(point.x, this.groundHeightAt(point), point.z)
    );
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.waveTimer -= dt;
    if (this.waveTimer <= 0 && this.playerBase.health > 0 && this.enemyCamp.alive) {
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
      if (!this.isPointWalkable(position)) {
        position.copy(point);
      }
      position.y = this.groundHeightAt(position);
      const unit = new UnitEntity({
        type,
        team: TEAMS.PLAYER,
        position
      });
      unit.moveGoal = new THREE.Vector3(
        BALANCE.enemyCamp.position.x,
        this.groundHeightAt(BALANCE.enemyCamp.position),
        BALANCE.enemyCamp.position.z
      );
      this.assignRoute(unit, 'playerToEnemy');
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
      const position = new THREE.Vector3(camp.x, 0, camp.z).add(offset);
      position.y = this.groundHeightAt(position);
      const unit = new UnitEntity({
        type: 'raider',
        team: TEAMS.ENEMY,
        position
      });
      unit.moveGoal = this.playerBase.position.clone();
      this.assignRoute(unit, 'enemyToPlayer');
      this.enemyUnits.push(unit);
      this.scene.add(unit.mesh);
    }
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

  placeUnitOnGround(unit) {
    unit.position.y = this.groundHeightAt(unit.position);
  }

  assignRoute(unit, routeName) {
    const route = this.routes?.[routeName];
    if (!route?.length) return;
    unit.route = route.map((point) => point.clone());
    unit.routeIndex = closestRouteIndex(unit.position, unit.route);
    if (distance2D(unit.position, unit.route[unit.routeIndex]) < 5) {
      unit.routeIndex = Math.min(unit.route.length - 1, unit.routeIndex + 1);
    }
  }

  getRouteTarget(unit, finalPosition) {
    if (!unit.route?.length || unit.routeIndex == null) return finalPosition;
    if (unit.routeIndex >= unit.route.length) return finalPosition;

    let waypoint = unit.route[unit.routeIndex];
    while (
      unit.routeIndex < unit.route.length - 1 &&
      distance2D(unit.position, waypoint) < 0.9
    ) {
      unit.routeIndex += 1;
      waypoint = unit.route[unit.routeIndex];
    }

    if (
      unit.routeIndex >= unit.route.length - 1 &&
      distance2D(unit.position, waypoint) < 1.15
    ) {
      return finalPosition;
    }
    return waypoint;
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
    this.selectionRing.position.y = this.selectedUnit.position.y + 0.05;
    this.selectionRing.position.z = this.selectedUnit.position.z;
    this.selectionRing.rotation.z += 0.03;
  }

  updateUnitVisuals(dt) {
    [...this.friendlyUnits, ...this.enemyUnits].forEach((unit) => {
      this.placeUnitOnGround(unit);
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
      enemyCampHealth: Math.round(this.enemyCamp.health),
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

function attachStructureHealthBar(model, color, y, scale) {
  const healthBar = createHealthBar();
  healthBar.position.y = y;
  healthBar.scale.set(scale, scale, scale);
  healthBar.userData.weapon.visible = false;
  healthBar.userData.hp.material.color.set(color);
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

function closestRouteIndex(position, route) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  route.forEach((point, index) => {
    const distance = distance2D(position, point);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  });
  return bestIndex;
}
