import * as THREE from 'three';
import {
  createUnitModel,
  getAnimationDuration,
  playUnitAnimation,
  stopUnitAnimation,
  updateUnitAnimation
} from '../art/visualRegistry.js';
import { TEAMS, UNIT_DEFINITIONS } from '../data/gameData.js';
import { disposeObject3D } from '../utils/dispose.js';

const PREVIEW_ANIMATIONS = [
  { id: 'idle', label: 'Idle' },
  { id: 'walk', label: 'Walk' },
  { id: 'attack', label: 'Attack' },
  { id: 'hit', label: 'Hit' }
];

const PREVIEW_VARIANTS = [
  { id: '', label: 'Default' },
  { id: 'throw', label: 'Throw' },
  { id: 'rangedAbility', label: 'Ranged Ability' }
];

const DEFAULT_UNIT_TYPE = UNIT_DEFINITIONS.frostTrollBoss
  ? 'frostTrollBoss'
  : UNIT_DEFINITIONS.rogue
    ? 'rogue'
    : Object.keys(UNIT_DEFINITIONS)[0] ?? 'raider';

export class AnimationPreviewScene {
  constructor({ canvas, onExitToMenu = null } = {}) {
    this.canvas = canvas;
    this.onExitToMenu = onExitToMenu;
    this.eventController = new AbortController();
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#eef5fb');
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.state = createPreviewState();
    this.view = {
      yaw: -0.58,
      pitch: 0.82,
      distance: 6.1,
      target: new THREE.Vector3(0, 1.05, 0),
      dragging: null
    };
    this.previewGroup = new THREE.Group();
    this.previewGroup.name = 'animationPreviewUnit';
    this.scene.add(this.previewGroup);
    this.setupScene();
    this.createPanel();
    this.createPreviewUnit();
    this.addEventListeners();
    this.resize();
    this.updateCamera();
    document.body.classList.add('is-game-active', 'is-animation-preview-active');
    window.__VILLAGE_WAR_ANIMATION_PREVIEW__ = {
      scene: this,
      snapshot: () => this.snapshot()
    };
  }

  start() {
    if (this.destroyed) return;
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  stop() {
    this.renderer.setAnimationLoop(null);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.eventController.abort();
    this.panel?.remove();
    this.disposePreviewUnit();
    disposeObject3D(this.scene, { materials: true });
    this.renderer.dispose();
    document.body.classList.remove('is-game-active', 'is-animation-preview-active');
    if (window.__VILLAGE_WAR_ANIMATION_PREVIEW__?.scene === this) {
      delete window.__VILLAGE_WAR_ANIMATION_PREVIEW__;
    }
  }

  setupScene() {
    const hemi = new THREE.HemisphereLight('#ffffff', '#99a9b7', 1.95);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#ffffff', 2.4);
    key.position.set(-4.5, 7.5, 5.2);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#bfe7ff', 0.95);
    fill.position.set(5.2, 4.8, -4.5);
    this.scene.add(fill);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(2.85, 3.15, 0.16, 48),
      new THREE.MeshStandardMaterial({
        color: '#dfe9ef',
        roughness: 0.82,
        metalness: 0.02
      })
    );
    platform.position.y = -0.08;
    platform.name = 'animationPreviewPlatform';
    this.scene.add(platform);

    const grid = new THREE.GridHelper(6.4, 16, '#8fa4b1', '#c3d0d8');
    grid.position.y = 0.012;
    grid.material.transparent = true;
    grid.material.opacity = 0.42;
    this.scene.add(grid);
  }

  createPanel() {
    this.panel = document.createElement('section');
    this.panel.className = 'animation-preview-panel';
    this.panel.setAttribute('aria-label', '动画预览控制台');
    this.panel.innerHTML = `
      <div class="animation-preview-panel__header">
        <strong>动画预览</strong>
        <button type="button" data-animation-preview-action="exit">返回</button>
      </div>
      <label>
        <span>单位</span>
        <select data-animation-preview-unit>
          ${Object.entries(UNIT_DEFINITIONS).map(([type, definition]) => `
            <option value="${escapeHtml(type)}" ${type === this.state.unitType ? 'selected' : ''}>${escapeHtml(definition.name ?? type)} / ${escapeHtml(type)}</option>
          `).join('')}
        </select>
      </label>
      <div class="animation-preview-row">
        <label>
          <span>动画</span>
          <select data-animation-preview-animation>
            ${PREVIEW_ANIMATIONS.map((animation) => `
              <option value="${escapeHtml(animation.id)}" ${animation.id === this.state.animationName ? 'selected' : ''}>${escapeHtml(animation.label)}</option>
            `).join('')}
          </select>
        </label>
        <label>
          <span>变体</span>
          <select data-animation-preview-variant>
            ${PREVIEW_VARIANTS.map((variant) => `
              <option value="${escapeHtml(variant.id)}" ${variant.id === this.state.variant ? 'selected' : ''}>${escapeHtml(variant.label)}</option>
            `).join('')}
          </select>
        </label>
      </div>
      <div class="animation-preview-row">
        <label>
          <span>队伍</span>
          <select data-animation-preview-team>
            <option value="${TEAMS.PLAYER}" selected>Player</option>
            <option value="${TEAMS.ENEMY}">Enemy</option>
          </select>
        </label>
        <label>
          <span>速度</span>
          <input data-animation-preview-speed type="number" min="0.1" max="4" step="0.1" value="1">
        </label>
      </div>
      <div class="animation-preview-row animation-preview-row--actions">
        <button type="button" data-animation-preview-action="play-toggle">暂停</button>
        <button type="button" data-animation-preview-action="rebuild">重建模型</button>
      </div>
      <label>
        <span>时间 <b data-animation-preview-time-label>0%</b></span>
        <input data-animation-preview-time type="range" min="0" max="1" step="0.001" value="0">
      </label>
      <label>
        <span>模型转向 <b data-animation-preview-yaw-label>0°</b></span>
        <input data-animation-preview-yaw type="range" min="-180" max="180" step="1" value="0">
      </label>
      <label class="animation-preview-check">
        <input data-animation-preview-markers type="checkbox" ${this.state.showMarkers ? 'checked' : ''}>
        <span>显示调试关节点</span>
      </label>
    `;
    document.body.appendChild(this.panel);
  }

  addEventListeners() {
    const signal = this.eventController.signal;
    window.addEventListener('resize', () => this.resize(), { signal });
    this.panel.addEventListener('pointerdown', stopPreviewEvent, { signal });
    this.panel.addEventListener('wheel', stopPreviewEvent, { signal });
    this.panel.addEventListener('contextmenu', stopPreviewEvent, { signal });
    this.panel.addEventListener('click', (event) => this.onPanelClick(event), { signal });
    this.panel.addEventListener('input', (event) => this.onPanelInput(event), { signal });
    this.panel.addEventListener('change', (event) => this.onPanelInput(event), { signal });
    this.canvas.addEventListener('pointerdown', (event) => this.onCanvasPointerDown(event), { signal });
    this.canvas.addEventListener('wheel', (event) => this.onCanvasWheel(event), {
      signal,
      passive: false
    });
    window.addEventListener('pointermove', (event) => this.onPointerMove(event), { signal });
    window.addEventListener('pointerup', () => this.endViewDrag(), { signal });
  }

  tick() {
    if (this.destroyed) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.updatePreviewAnimation(dt);
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  updateCamera() {
    const { yaw, pitch, distance, target } = this.view;
    const horizontal = Math.cos(pitch) * distance;
    this.camera.position.set(
      Math.sin(yaw) * horizontal,
      Math.sin(pitch) * distance,
      Math.cos(yaw) * horizontal
    ).add(target);
    this.camera.lookAt(target);
  }

  createPreviewUnit() {
    this.disposePreviewUnit();
    const definition = UNIT_DEFINITIONS[this.state.unitType] ?? UNIT_DEFINITIONS[DEFAULT_UNIT_TYPE];
    const visualRoot = createUnitModel(this.state.unitType, this.state.team);
    visualRoot.rotation.y = THREE.MathUtils.degToRad(this.state.modelYaw);
    this.previewGroup.add(visualRoot);
    this.state.visualRoot = visualRoot;
    this.state.fakeUnit = {
      id: 71231,
      type: this.state.unitType,
      team: this.state.team,
      definition,
      visualRoot,
      visualState: this.state.animationName === 'walk' ? 'walk' : 'idle',
      isBuilding: Boolean(definition?.isBuilding)
    };
    this.previewGroup.scale.setScalar(
      this.state.unitType === 'frostTrollBoss'
        ? 1.08
        : definition?.isBuilding
          ? 0.75
          : 1.45
    );
    this.applyPreviewPose();
    this.rebuildMarkers();
    this.syncControls();
  }

  disposePreviewUnit() {
    if (this.state.markerGroup) {
      this.scene.remove(this.state.markerGroup);
      disposeObject3D(this.state.markerGroup, { materials: true });
      this.state.markerGroup = null;
    }
    if (this.state.visualRoot) {
      this.previewGroup.remove(this.state.visualRoot);
      disposeObject3D(this.state.visualRoot, { materials: true });
      this.state.visualRoot = null;
    }
    this.state.fakeUnit = null;
  }

  updatePreviewAnimation(dt) {
    if (!this.state.fakeUnit) return;
    if (this.state.playing) {
      const duration = Math.max(0.05, this.animationDuration());
      this.state.timeRatio = (this.state.timeRatio + (dt * this.state.speed) / duration) % 1;
      this.applyPreviewPose();
      this.syncControls();
      return;
    }
    this.updateMarkers();
  }

  applyPreviewPose() {
    const unit = this.state.fakeUnit;
    if (!unit?.visualRoot) return;
    unit.visualRoot.rotation.y = THREE.MathUtils.degToRad(this.state.modelYaw);
    unit.visualState = this.state.animationName === 'walk' ? 'walk' : 'idle';
    if (this.state.animationName === 'idle' || this.state.animationName === 'walk') {
      stopUnitAnimation(unit);
      updateUnitAnimation(unit, 0);
      this.updateMarkers();
      return;
    }
    const duration = this.animationDuration();
    playUnitAnimation(unit, this.state.animationName, duration, {
      variant: this.state.variant || null
    });
    const animation = unit.visualRoot.userData.animation;
    if (animation) {
      animation.time = clamp01(this.state.timeRatio) * duration;
    }
    updateUnitAnimation(unit, 0);
    this.updateMarkers();
  }

  animationDuration() {
    if (!this.state.fakeUnit) return 0.5;
    return getAnimationDuration(this.state.fakeUnit, this.state.animationName);
  }

  rebuildMarkers() {
    if (this.state.markerGroup) {
      this.scene.remove(this.state.markerGroup);
      disposeObject3D(this.state.markerGroup, { materials: true });
      this.state.markerGroup = null;
    }
    if (!this.state.showMarkers || !this.state.visualRoot) return;
    const group = new THREE.Group();
    group.name = 'animationPreviewMarkers';
    const parts = this.state.visualRoot.userData.parts ?? {};
    Object.entries(parts).forEach(([name, part]) => {
      if (!part?.isObject3D || typeof part.getWorldPosition !== 'function') return;
      const marker = createMarker(name);
      marker.userData.target = part;
      group.add(marker);
    });
    this.state.markerGroup = group;
    this.scene.add(group);
    this.updateMarkers();
  }

  updateMarkers() {
    const group = this.state.markerGroup;
    if (!group) return;
    group.children.forEach((marker) => {
      marker.userData.target?.getWorldPosition?.(marker.position);
    });
  }

  onPanelClick(event) {
    const actionTarget = event.target.closest('[data-animation-preview-action]');
    if (!actionTarget) return;
    event.preventDefault();
    event.stopPropagation();
    const action = actionTarget.dataset.animationPreviewAction;
    if (action === 'exit') {
      this.onExitToMenu?.();
      return;
    }
    if (action === 'play-toggle') {
      this.state.playing = !this.state.playing;
      this.syncControls();
      return;
    }
    if (action === 'rebuild') {
      this.createPreviewUnit();
    }
  }

  onPanelInput(event) {
    const target = event.target;
    if (!target) return;
    if (target.matches('[data-animation-preview-unit]')) {
      this.state.unitType = target.value;
      this.state.timeRatio = 0;
      this.createPreviewUnit();
      return;
    }
    if (target.matches('[data-animation-preview-team]')) {
      this.state.team = target.value;
      this.createPreviewUnit();
      return;
    }
    if (target.matches('[data-animation-preview-animation]')) {
      this.state.animationName = target.value;
      this.state.timeRatio = 0;
      this.applyPreviewPose();
      this.syncControls();
      return;
    }
    if (target.matches('[data-animation-preview-variant]')) {
      this.state.variant = target.value;
      this.state.timeRatio = 0;
      this.applyPreviewPose();
      this.syncControls();
      return;
    }
    if (target.matches('[data-animation-preview-speed]')) {
      this.state.speed = Math.max(0.1, Math.min(4, Number(target.value) || 1));
      this.syncControls();
      return;
    }
    if (target.matches('[data-animation-preview-time]')) {
      this.state.timeRatio = clamp01(Number(target.value) || 0);
      this.state.playing = false;
      this.applyPreviewPose();
      this.syncControls();
      return;
    }
    if (target.matches('[data-animation-preview-yaw]')) {
      this.state.modelYaw = Math.max(-180, Math.min(180, Number(target.value) || 0));
      this.applyPreviewPose();
      this.syncControls();
      return;
    }
    if (target.matches('[data-animation-preview-markers]')) {
      this.state.showMarkers = target.checked;
      this.rebuildMarkers();
      this.syncControls();
    }
  }

  syncControls() {
    if (!this.panel) return;
    const playButton = this.panel.querySelector('[data-animation-preview-action="play-toggle"]');
    if (playButton) playButton.textContent = this.state.playing ? '暂停' : '播放';
    const time = this.panel.querySelector('[data-animation-preview-time]');
    if (time && document.activeElement !== time) {
      time.value = String(clamp01(this.state.timeRatio));
    }
    const timeLabel = this.panel.querySelector('[data-animation-preview-time-label]');
    if (timeLabel) timeLabel.textContent = `${Math.round(clamp01(this.state.timeRatio) * 100)}%`;
    const speed = this.panel.querySelector('[data-animation-preview-speed]');
    if (speed && document.activeElement !== speed) {
      speed.value = String(this.state.speed);
    }
    const yaw = this.panel.querySelector('[data-animation-preview-yaw]');
    if (yaw && document.activeElement !== yaw) {
      yaw.value = String(this.state.modelYaw);
    }
    const yawLabel = this.panel.querySelector('[data-animation-preview-yaw-label]');
    if (yawLabel) yawLabel.textContent = `${Math.round(this.state.modelYaw)}°`;
    const markers = this.panel.querySelector('[data-animation-preview-markers]');
    if (markers) markers.checked = this.state.showMarkers;
  }

  onCanvasPointerDown(event) {
    if (event.button !== 0) return;
    this.view.dragging = {
      x: event.clientX,
      y: event.clientY,
      yaw: this.view.yaw,
      pitch: this.view.pitch
    };
    this.canvas.setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event) {
    const drag = this.view.dragging;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    this.view.yaw = drag.yaw - dx * 0.008;
    this.view.pitch = THREE.MathUtils.clamp(drag.pitch + dy * 0.006, 0.35, 1.22);
    this.updateCamera();
  }

  endViewDrag() {
    this.view.dragging = null;
  }

  onCanvasWheel(event) {
    event.preventDefault();
    this.view.distance = THREE.MathUtils.clamp(
      this.view.distance + Math.sign(event.deltaY) * 0.55,
      4.2,
      12
    );
    this.updateCamera();
  }

  snapshot() {
    return {
      unitType: this.state.unitType,
      animationName: this.state.animationName,
      variant: this.state.variant,
      timeRatio: Number(this.state.timeRatio.toFixed(3)),
      markerCount: this.state.markerGroup?.children.length ?? 0
    };
  }
}

function createPreviewState() {
  return {
    unitType: DEFAULT_UNIT_TYPE,
    team: TEAMS.PLAYER,
    animationName: 'attack',
    variant: '',
    playing: true,
    timeRatio: 0,
    speed: 1,
    modelYaw: 0,
    showMarkers: false,
    visualRoot: null,
    fakeUnit: null,
    markerGroup: null
  };
}

function createMarker(name) {
  const geometry = new THREE.SphereGeometry(0.055, 8, 6);
  const color = name.includes('Socket')
    ? '#28d6ff'
    : name.includes('Pivot')
      ? '#ffbe42'
      : '#ffffff';
  const material = new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    transparent: true,
    opacity: 0.9
  });
  const marker = new THREE.Mesh(geometry, material);
  marker.name = `animationPreviewMarker:${name}`;
  marker.renderOrder = 30;
  return marker;
}

function stopPreviewEvent(event) {
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

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
