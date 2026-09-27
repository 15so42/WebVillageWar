import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { createWorld } from './world/createWorld.js';
import { createAltarModel } from './art/lowpoly.js';
import { ALTAR_DEFINITIONS } from './data/gameData.js';
import {
  TERRAIN_EDITOR_ASSET_CATALOG,
  TERRAIN_WFC_BOARD_BASE_HEIGHT,
  TERRAIN_WFC_HEIGHT_STEP,
  TERRAIN_WFC_TILE_SIZE,
  createTerrainEditorAsset,
  getTerrainEditorAssetDefinition,
  isTerrainEditorTileType,
  normalizeTerrainLayout,
  readStoredTerrainLayout,
  removeStoredTerrainLayout,
  writeStoredTerrainLayout
} from './world/terrainEditorAssets.js';
import { TERRAIN_EDITOR_PRESETS } from './world/terrainEditorPresets.js';
import { generateTerrainWfcLayout } from './world/terrainWfcGenerator.js';

const SCENE_KEY = 'snow-valley';
const WORLD_BOUNDS = { minX: -42, maxX: 42, minZ: -40, maxZ: 40 };
const CAMERA_HOME = {
  position: new THREE.Vector3(0.11, 33.698, 60.998),
  target: new THREE.Vector3(0, 4, 30)
};

const canvas = document.querySelector('#terrain-canvas');
const viewport = document.querySelector('#viewport');
const assetLibrary = document.querySelector('#asset-library');
const sceneList = document.querySelector('#scene-list');
const sceneCount = document.querySelector('#scene-count');
const emptyHint = document.querySelector('#empty-hint');
const toast = document.querySelector('#toast');
const saveStatus = document.querySelector('#save-status');
const selectionTitle = document.querySelector('#selection-title');
const selectionDescription = document.querySelector('#selection-description');
const transformFields = document.querySelector('#transform-fields');
const focusButton = document.querySelector('#focus-button');
const duplicateButton = document.querySelector('#duplicate-button');
const deleteButton = document.querySelector('#delete-button');
const blockingInput = document.querySelector('#blocking-input');
const snapEnabledInput = document.querySelector('#snap-enabled');
const snapSizeSelect = document.querySelector('#snap-size');
const gridVisibleInput = document.querySelector('#grid-visible');
const undoButton = document.querySelector('#undo-button');
const redoButton = document.querySelector('#redo-button');
const importFile = document.querySelector('#import-file');
const presetDialog = document.querySelector('#preset-dialog');
const presetGrid = document.querySelector('#preset-grid');
const wfcDialog = document.querySelector('#wfc-dialog');
const wfcSeedInput = document.querySelector('#wfc-seed');
const wfcStyleSelect = document.querySelector('#wfc-style');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvas.style.filter = 'brightness(1.02) contrast(1.12) saturate(1.04)';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.25, 500);
camera.position.copy(CAMERA_HOME.position);

const world = createWorld(scene, {
  sceneKey: SCENE_KEY,
  editorMode: true,
  sky: {
    bakedShadows: false,
    realtimeShadows: true,
    shadowMapSize: 2048
  },
  snowValleyScenery: {
    groundPatches: [],
    pathStones: { count: 0 }
  }
});
const defaultGroundMap = world.ground.material.map;
const defaultGroundColor = world.ground.material.color.clone();

applyEditorRenderTuning();
world.recoveryAura.visible = false;

const editorGroup = new THREE.Group();
editorGroup.name = 'TerrainEditorManualScenery';
scene.add(editorGroup);

const lockedReferenceGroup = new THREE.Group();
lockedReferenceGroup.name = 'TerrainEditorLockedReferences';
scene.add(lockedReferenceGroup);
createLockedAltarReferences();

const wfcRoadOverlay = createEditorWfcRoadOverlay();
scene.add(wfcRoadOverlay);

const surfaceGrid = createSurfaceGrid();
scene.add(surfaceGrid);

const orbitControls = new OrbitControls(camera, canvas);
orbitControls.target.copy(CAMERA_HOME.target);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.09;
orbitControls.minDistance = 12;
orbitControls.maxDistance = 110;
orbitControls.maxPolarAngle = Math.PI * 0.485;
orbitControls.screenSpacePanning = false;
orbitControls.mouseButtons.LEFT = null;
orbitControls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
orbitControls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
orbitControls.update();

const transformControls = new TransformControls(camera, canvas);
transformControls.setMode('translate');
transformControls.setSpace('world');
transformControls.setSize(0.88);
transformControls.showY = false;
scene.add(transformControls.getHelper());

const selectionBox = new THREE.BoxHelper(undefined, 0xe4b85f);
selectionBox.material.depthTest = false;
selectionBox.material.transparent = true;
selectionBox.material.opacity = 0.8;
selectionBox.renderOrder = 1500;
selectionBox.visible = false;
scene.add(selectionBox);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();
let selectedObject = null;
let activeMode = 'translate';
let toastTimer = 0;
let autosaveTimer = 0;
let transformChanged = false;
let transformPointerActive = false;
let grounding = false;
let history = [];
let historyIndex = -1;

buildAssetLibrary();
buildPresetLibrary();
bindToolbar();
bindInspector();
bindViewportSelection();
loadInitialLayout();
resizeRenderer();

const resizeObserver = new ResizeObserver(resizeRenderer);
resizeObserver.observe(viewport);
window.addEventListener('beforeunload', () => saveDraft(false));
window.addEventListener('keydown', handleKeyboardShortcut);

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  orbitControls.update();
  if (selectedObject) selectionBox.update();
  world.update?.(dt, orbitControls.target, camera);
  renderer.render(scene, camera);
});

function applyEditorRenderTuning() {
  const { sun, hemisphere, ambient } = world.lights;
  sun.color.set('#ffe0ad');
  sun.intensity = 2.75;
  sun.position.set(-104, 52, 88);
  sun.target.position.set(0, 0, 0);
  sun.target.updateMatrixWorld();
  sun.shadow.camera.left = -65;
  sun.shadow.camera.right = 65;
  sun.shadow.camera.top = 65;
  sun.shadow.camera.bottom = -65;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 190;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  if (sun.shadow) sun.shadow.intensity = 1;

  hemisphere.color.set('#b9c9cf');
  hemisphere.groundColor.set('#61705c');
  hemisphere.intensity = 0.95;
  ambient.color.set('#b7beb5');
  ambient.intensity = 0.52;

  scene.background = new THREE.Color('#aebbc0');
  if (scene.fog) {
    scene.fog.color.set('#aebbc0');
    scene.fog.near = 82;
    scene.fog.far = 245;
  }
  world.setMaterialColors?.({ snow: '#94a77f', rock: '#747970', tree: '#496448' });
}

function createLockedAltarReferences() {
  (world.config.altars ?? []).forEach((config) => {
    const definition = ALTAR_DEFINITIONS[config.type];
    if (!definition) return;
    const altar = createAltarModel(definition);
    altar.name = `LockedReference:${definition.name}`;
    altar.position.set(
      config.position.x,
      world.heightAt(config.position.x, config.position.z) + 0.12,
      config.position.z
    );
    altar.rotation.y = config.rotation ?? 0;
    const parts = altar.userData.parts;
    if (parts) {
      parts.areaDisc.visible = false;
      parts.areaRing.visible = false;
      parts.progressRing.visible = false;
      parts.ownerCrown.visible = false;
    }
    lockedReferenceGroup.add(altar);
  });
}

function createSurfaceGrid() {
  const positions = [];
  const step = 2;
  const lift = 0.09;
  for (let x = WORLD_BOUNDS.minX; x <= WORLD_BOUNDS.maxX; x += step) {
    for (let z = WORLD_BOUNDS.minZ; z < WORLD_BOUNDS.maxZ; z += step) {
      positions.push(x, world.heightAt(x, z) + lift, z);
      positions.push(x, world.heightAt(x, z + step) + lift, z + step);
    }
  }
  for (let z = WORLD_BOUNDS.minZ; z <= WORLD_BOUNDS.maxZ; z += step) {
    for (let x = WORLD_BOUNDS.minX; x < WORLD_BOUNDS.maxX; x += step) {
      positions.push(x, world.heightAt(x, z) + lift, z);
      positions.push(x + step, world.heightAt(x + step, z) + lift, z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x707b84,
    transparent: true,
    opacity: 0.18,
    depthWrite: false
  });
  const grid = new THREE.LineSegments(geometry, material);
  grid.name = 'TerrainSurfaceGrid';
  grid.renderOrder = 15;
  return grid;
}

function createEditorWfcRoadOverlay() {
  const points = (world.config.pathPoints ?? []).map((point) => (
    new THREE.Vector3(point.x, TERRAIN_WFC_BOARD_BASE_HEIGHT + 0.035, point.z)
  ));
  const curve = new THREE.CatmullRomCurve3(points);
  const samples = curve.getPoints(96);
  const positions = [];
  const indices = [];
  const halfWidth = (world.config.pathWidth ?? 8.2) * 0.36;
  samples.forEach((point, index) => {
    const previous = samples[Math.max(0, index - 1)];
    const next = samples[Math.min(samples.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    const widthNoise = Math.sin(index * 0.41 + point.z * 0.08) * 0.18;
    const width = halfWidth + widthNoise;
    positions.push(point.x + nx * width, point.y, point.z + nz * width);
    positions.push(point.x - nx * width, point.y, point.z - nz * width);
    if (index < samples.length - 1) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: '#aa8d6f',
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const road = new THREE.Mesh(geometry, material);
  road.name = 'TerrainEditorWfcRoad';
  road.receiveShadow = true;
  road.renderOrder = 20;
  road.visible = false;
  return road;
}

function buildAssetLibrary() {
  const categories = new Map();
  TERRAIN_EDITOR_ASSET_CATALOG.forEach((definition) => {
    if (!categories.has(definition.category)) categories.set(definition.category, []);
    categories.get(definition.category).push(definition);
  });
  categories.forEach((definitions, category) => {
    const section = document.createElement('section');
    section.className = 'asset-category';
    const heading = document.createElement('h2');
    heading.textContent = category;
    const grid = document.createElement('div');
    grid.className = 'asset-grid';
    definitions.forEach((definition) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'asset-card';
      button.dataset.assetType = definition.type;
      button.title = definition.description;
      button.innerHTML = `
        <span class="asset-icon" aria-hidden="true">${definition.icon}</span>
        <strong>${definition.name}</strong>
        <small>${definition.description}</small>
      `;
      button.addEventListener('click', () => addAsset(definition.type));
      grid.append(button);
    });
    section.append(heading, grid);
    assetLibrary.append(section);
  });
  document.querySelector('#asset-count').textContent = `${TERRAIN_EDITOR_ASSET_CATALOG.length}`;
}

function buildPresetLibrary() {
  TERRAIN_EDITOR_PRESETS.forEach((preset) => {
    const card = document.createElement('article');
    card.className = `preset-card preset-${preset.tone}`;
    const map = document.createElement('div');
    map.className = 'preset-map';
    map.setAttribute('aria-hidden', 'true');
    preset.layout.items.forEach((entry) => {
      const dot = document.createElement('span');
      dot.className = `preset-dot ${presetDotKind(entry.type)}`;
      dot.style.left = `${THREE.MathUtils.clamp((entry.position.x + 42) / 84 * 100, 2, 98)}%`;
      dot.style.top = `${THREE.MathUtils.clamp((entry.position.z + 40) / 80 * 100, 2, 98)}%`;
      map.append(dot);
    });
    const content = document.createElement('div');
    content.className = 'preset-card-content';
    content.innerHTML = `
      <div class="preset-card-title">
        <h3>${preset.name}</h3>
        ${preset.label ? `<span class="preset-recommended">${preset.label}</span>` : ''}
      </div>
      <p>${preset.description}</p>
      <span class="preset-focus">${preset.focus}</span>
      <div class="preset-card-footer">
        <span class="preset-object-count">${preset.layout.items.length} OBJECTS</span>
        <button type="button" class="load-preset-button">载入并编辑</button>
      </div>
    `;
    content.querySelector('.load-preset-button').addEventListener('click', () => loadPreset(preset));
    card.append(map, content);
    presetGrid.append(card);
  });
}

function presetDotKind(type) {
  if (type.includes('pine')) return 'tree';
  if (['cottage', 'banner-totem', 'guard-flag', 'monster-camp'].includes(type)) return 'landmark';
  return 'terrain';
}

function bindToolbar() {
  document.querySelectorAll('[data-transform-mode]').forEach((button) => {
    button.addEventListener('click', () => setTransformMode(button.dataset.transformMode));
  });
  snapEnabledInput.addEventListener('change', applySnapSettings);
  snapSizeSelect.addEventListener('change', applySnapSettings);
  gridVisibleInput.addEventListener('change', () => {
    surfaceGrid.visible = gridVisibleInput.checked;
  });
  document.querySelector('#undo-button').addEventListener('click', undo);
  document.querySelector('#redo-button').addEventListener('click', redo);
  document.querySelector('#save-button').addEventListener('click', () => saveDraft(true));
  document.querySelector('#apply-button').addEventListener('click', applyToLevel);
  document.querySelector('#preset-button').addEventListener('click', () => presetDialog.showModal());
  document.querySelector('#close-preset-dialog').addEventListener('click', () => presetDialog.close());
  presetDialog.addEventListener('click', (event) => {
    if (event.target === presetDialog) presetDialog.close();
  });
  document.querySelector('#wfc-button').addEventListener('click', openWfcDialog);
  document.querySelector('#close-wfc-dialog').addEventListener('click', () => wfcDialog.close());
  wfcDialog.addEventListener('click', (event) => {
    if (event.target === wfcDialog) wfcDialog.close();
  });
  document.querySelector('#randomize-wfc-seed').addEventListener('click', randomizeWfcSeed);
  document.querySelector('#generate-wfc-button').addEventListener('click', generateWfcScene);
  document.querySelector('#export-button').addEventListener('click', exportLayout);
  document.querySelector('#import-button').addEventListener('click', () => importFile.click());
  document.querySelector('#clear-layout-button').addEventListener('click', clearLayout);
  document.querySelector('#restore-procedural-button').addEventListener('click', restoreProceduralLayout);
  importFile.addEventListener('change', importLayout);
  applySnapSettings();
}

function randomWfcSeed() {
  return Math.floor(Math.random() * 999999) + 1;
}

function openWfcDialog() {
  if (!Number(wfcSeedInput.value)) wfcSeedInput.value = String(randomWfcSeed());
  wfcDialog.showModal();
}

function randomizeWfcSeed() {
  wfcSeedInput.value = String(randomWfcSeed());
}

function generateWfcScene() {
  const seed = Math.max(1, Math.floor(Number(wfcSeedInput.value) || randomWfcSeed()));
  wfcSeedInput.value = String(seed);

  try {
    const result = generateTerrainWfcLayout(wfcGenerationOptions(seed, wfcStyleSelect.value));

    replaceLayout(result.layout);
    pushHistory();
    saveDraft(false);
    wfcDialog.close();
    camera.position.copy(CAMERA_HOME.position);
    orbitControls.target.copy(CAMERA_HOME.target);
    orbitControls.update();
    showToast(
      `WFC 完整场景已生成 · ${result.terrainTileCount} 个地块 + ${result.decorationCount} 个布景`
    );
  } catch (error) {
    console.error('WFC generation failed', error);
    showToast('WFC 生成失败，请更换种子再试');
  }
}

function wfcGenerationOptions(seed, style = 'mixed') {
  return {
    sceneKey: SCENE_KEY,
    seed,
    style,
    cellSize: 6.5,
    bounds: WORLD_BOUNDS,
    pathPoints: world.config.pathPoints,
    pathWidth: world.config.pathWidth,
    altars: world.config.altars,
    playerBasePosition: world.config.playerBasePosition,
    enemyCampPosition: world.config.enemyCampPosition
  };
}

function loadPreset(preset) {
  replaceLayout(preset.layout);
  pushHistory();
  saveDraft(false);
  presetDialog.close();
  camera.position.copy(CAMERA_HOME.position);
  orbitControls.target.copy(CAMERA_HOME.target);
  orbitControls.update();
  showToast(`已载入预设：${preset.name}，现在可以逐个调整`);
}

function bindInspector() {
  document.querySelectorAll('[data-property]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!selectedObject) return;
      const value = Number(input.value);
      if (!Number.isFinite(value)) {
        updateInspector();
        return;
      }
      const [scope, axis] = input.dataset.property.split('.');
      if (scope === 'rotation') {
        selectedObject.rotation[axis] = THREE.MathUtils.degToRad(value);
      } else if (scope === 'scale') {
        selectedObject.scale[axis] = Math.max(0.05, value);
      } else {
        selectedObject.position[axis] = value;
      }
      snapObjectToGround(selectedObject);
      selectionBox.update();
      pushHistory();
      scheduleAutosave();
      renderSceneList();
      updateInspector();
    });
  });
  blockingInput.addEventListener('change', () => {
    if (!selectedObject) return;
    selectedObject.userData.terrainEditorBlocking = blockingInput.checked;
    pushHistory();
    scheduleAutosave();
  });
  focusButton.addEventListener('click', focusSelection);
  duplicateButton.addEventListener('click', duplicateSelected);
  deleteButton.addEventListener('click', deleteSelected);
}

function bindViewportSelection() {
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('click', (event) => {
    if (event.button !== 0) return;
    if (transformPointerActive) {
      transformPointerActive = false;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(editorGroup.children, true);
    selectObject(hits.length ? findAssetRoot(hits[0].object) : null);
  });

  transformControls.addEventListener('dragging-changed', (event) => {
    orbitControls.enabled = !event.value;
    if (event.value) {
      transformChanged = false;
      transformPointerActive = true;
    } else if (transformChanged) {
      pushHistory();
      scheduleAutosave();
      transformChanged = false;
      updateInspector();
      renderSceneList();
    }
    if (!event.value) {
      window.setTimeout(() => { transformPointerActive = false; }, 0);
    }
  });
  transformControls.addEventListener('objectChange', () => {
    if (!selectedObject || grounding) return;
    transformChanged = true;
    if (activeMode === 'translate') snapObjectToGround(selectedObject);
    selectionBox.update();
    updateInspector();
  });
}

function loadInitialLayout() {
  const draft = readStoredTerrainLayout(SCENE_KEY, 'draft');
  const active = readStoredTerrainLayout(SCENE_KEY, 'active');
  const stored = draft ?? active;
  const legacyBoxWfc = stored?.items?.some((item) => (
    isTerrainEditorTileType(item.type) && item.tile?.edgeWfc !== true
  ));
  const initial = legacyBoxWfc
    ? generateTerrainWfcLayout(wfcGenerationOptions(42, 'mixed')).layout
    : (stored ?? normalizeTerrainLayout({ sceneKey: SCENE_KEY, items: [] }));
  replaceLayout(initial);
  history = [layoutSnapshot()];
  historyIndex = 0;
  updateHistoryButtons();
  if (draft) saveStatus.textContent = `已恢复本地草稿 · ${draft.items.length} 个物体`;
}

function addAsset(type, sourceItem = null) {
  const definition = getTerrainEditorAssetDefinition(type);
  if (!definition) return null;
  const seed = sourceItem?.seed ?? Math.floor(Math.random() * 100000) + 1;
  const object = createTerrainEditorAsset(type, { seed, tile: sourceItem?.tile });
  if (!object) return null;

  const spawn = sourceItem
    ? new THREE.Vector3(sourceItem.position.x, 0, sourceItem.position.z)
    : getViewportGroundCenter();
  object.userData.terrainEditorAssetId = sourceItem?.id ?? makeAssetId();
  object.userData.terrainEditorBlocking = sourceItem?.blocking ?? definition.defaultBlocking;
  object.userData.terrainEditorSeed = seed;
  if (object.userData.terrainEditorTile) {
    object.userData.terrainEditorTileData = sourceItem?.tile ?? object.userData.terrainEditorTileData;
  }
  object.position.set(spawn.x, 0, spawn.z);
  object.rotation.set(
    sourceItem?.rotation?.x ?? 0,
    sourceItem?.rotation?.y ?? 0,
    sourceItem?.rotation?.z ?? 0
  );
  object.scale.set(
    sourceItem?.scale?.x ?? 1,
    sourceItem?.scale?.y ?? 1,
    sourceItem?.scale?.z ?? 1
  );
  object.userData.terrainEditorGroundOffset = sourceItem?.groundOffset ?? definition.groundOffset;
  snapObjectToGround(object);
  editorGroup.add(object);
  selectObject(object);
  renderSceneList();
  updateEmptyHint();
  if (!sourceItem) {
    pushHistory();
    scheduleAutosave();
    showToast(`已放置：${definition.name}`);
  }
  return object;
}

function getViewportGroundCenter() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = raycaster.intersectObject(world.ground, false)[0];
  const point = hit?.point ?? orbitControls.target;
  const snap = snapEnabledInput.checked ? Number(snapSizeSelect.value) : 0;
  const x = snap ? Math.round(point.x / snap) * snap : point.x;
  const z = snap ? Math.round(point.z / snap) * snap : point.z;
  return new THREE.Vector3(
    THREE.MathUtils.clamp(x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX),
    0,
    THREE.MathUtils.clamp(z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ)
  );
}

function selectObject(object) {
  selectedObject = object;
  if (object) {
    transformControls.attach(object);
    selectionBox.setFromObject(object);
    selectionBox.visible = true;
  } else {
    transformControls.detach();
    selectionBox.visible = false;
  }
  updateInspector();
  renderSceneList();
}

function findAssetRoot(object) {
  let current = object;
  while (current && current.parent !== editorGroup) current = current.parent;
  return current?.parent === editorGroup ? current : null;
}

function snapObjectToGround(object) {
  if (!object) return;
  grounding = true;
  const translationSnap = snapEnabledInput.checked ? Number(snapSizeSelect.value) : 0;
  if (translationSnap && activeMode === 'translate') {
    object.position.x = Math.round(object.position.x / translationSnap) * translationSnap;
    object.position.z = Math.round(object.position.z / translationSnap) * translationSnap;
  }
  object.position.x = THREE.MathUtils.clamp(object.position.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX);
  object.position.z = THREE.MathUtils.clamp(object.position.z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ);
  const offset = object.userData.terrainEditorGroundOffset ?? 0;
  object.position.y = object.userData.terrainEditorTile
    ? TERRAIN_WFC_BOARD_BASE_HEIGHT + offset
    : editorSurfaceHeightAt(object.position.x, object.position.z, object) + offset;
  grounding = false;
}

function editorSurfaceHeightAt(x, z, ignoredObject = null) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  editorGroup.children.forEach((candidate) => {
    if (candidate === ignoredObject || !candidate.userData.terrainEditorTile) return;
    const dx = Math.abs(x - candidate.position.x);
    const dz = Math.abs(z - candidate.position.z);
    const halfWidth = TERRAIN_WFC_TILE_SIZE * Math.max(0.05, candidate.scale.x) * 0.5;
    const halfDepth = TERRAIN_WFC_TILE_SIZE * Math.max(0.05, candidate.scale.z) * 0.5;
    if (dx > halfWidth || dz > halfDepth) return;
    const distance = dx * dx + dz * dz;
    if (distance >= nearestDistance) return;
    nearest = candidate;
    nearestDistance = distance;
  });
  if (!nearest) return world.heightAt(x, z);
  const corners = nearest.userData.terrainEditorTileData?.corners ?? [0, 0, 0, 0];
  const halfWidth = TERRAIN_WFC_TILE_SIZE * Math.max(0.05, nearest.scale.x) * 0.5;
  const halfDepth = TERRAIN_WFC_TILE_SIZE * Math.max(0.05, nearest.scale.z) * 0.5;
  const fx = THREE.MathUtils.clamp((x - nearest.position.x + halfWidth) / (halfWidth * 2), 0, 1);
  const fz = THREE.MathUtils.clamp((z - nearest.position.z + halfDepth) / (halfDepth * 2), 0, 1);
  const [nw, ne, se, sw] = corners.map((level) => level * TERRAIN_WFC_HEIGHT_STEP * nearest.scale.y);
  const localHeight = fx + fz <= 1
    ? nw + (ne - nw) * fx + (sw - nw) * fz
    : se + (sw - se) * (1 - fx) + (ne - se) * (1 - fz);
  return nearest.position.y + localHeight;
}

function refreshLockedReferenceHeights() {
  const base = world.config.playerBasePosition;
  const camp = world.config.enemyCampPosition;
  if (world.playerBaseModel && base) {
    world.playerBaseModel.position.y = editorSurfaceHeightAt(base.x, base.z);
  }
  if (world.enemyCampModel && camp) {
    world.enemyCampModel.position.y = editorSurfaceHeightAt(camp.x, camp.z);
  }
  lockedReferenceGroup.children.forEach((reference) => {
    reference.position.y = editorSurfaceHeightAt(reference.position.x, reference.position.z) + 0.12;
  });
}

function refreshEditorBoardBackdrop() {
  const hasTerrainTiles = editorGroup.children.some((object) => object.userData.terrainEditorTile);
  wfcRoadOverlay.visible = hasTerrainTiles;
  world.ground.material.map = hasTerrainTiles ? null : defaultGroundMap;
  world.ground.material.color.copy(
    hasTerrainTiles ? new THREE.Color('#70899e') : defaultGroundColor
  );
  world.ground.material.needsUpdate = true;
}

function setTransformMode(mode) {
  activeMode = mode;
  transformControls.setMode(mode);
  transformControls.setSpace(mode === 'scale' ? 'local' : 'world');
  transformControls.showX = true;
  transformControls.showY = mode !== 'translate' || mode === 'scale';
  transformControls.showZ = true;
  if (mode === 'rotate') {
    transformControls.showX = false;
    transformControls.showY = true;
    transformControls.showZ = false;
  }
  document.querySelectorAll('[data-transform-mode]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.transformMode === mode);
  });
  applySnapSettings();
}

function applySnapSettings() {
  const enabled = snapEnabledInput.checked;
  const translation = Number(snapSizeSelect.value);
  transformControls.setTranslationSnap(enabled ? translation : null);
  transformControls.setRotationSnap(enabled ? THREE.MathUtils.degToRad(15) : null);
  transformControls.setScaleSnap(enabled ? 0.1 : null);
  document.querySelectorAll('[data-property^="position"]').forEach((input) => {
    input.step = enabled ? `${translation}` : '0.1';
  });
}

function updateInspector() {
  const enabled = Boolean(selectedObject);
  transformFields.classList.toggle('is-disabled', !enabled);
  focusButton.disabled = !enabled;
  duplicateButton.disabled = !enabled;
  deleteButton.disabled = !enabled;
  if (!enabled) {
    selectionTitle.textContent = '未选择物体';
    selectionDescription.textContent = '在场景中点击物体，或从下方层级列表选择。';
    document.querySelectorAll('[data-property]').forEach((input) => { input.value = ''; });
    blockingInput.checked = false;
    return;
  }
  const definition = getTerrainEditorAssetDefinition(selectedObject.userData.terrainEditorType);
  selectionTitle.textContent = definition?.name ?? '场景物体';
  selectionDescription.textContent = definition?.description ?? '';
  setFieldValue('position.x', selectedObject.position.x, 2);
  setFieldValue('position.z', selectedObject.position.z, 2);
  setFieldValue('rotation.y', THREE.MathUtils.radToDeg(selectedObject.rotation.y), 1);
  setFieldValue('scale.x', selectedObject.scale.x, 2);
  setFieldValue('scale.y', selectedObject.scale.y, 2);
  setFieldValue('scale.z', selectedObject.scale.z, 2);
  blockingInput.checked = selectedObject.userData.terrainEditorBlocking !== false;
}

function setFieldValue(property, value, digits) {
  const input = document.querySelector(`[data-property="${property}"]`);
  if (document.activeElement !== input) input.value = Number(value.toFixed(digits));
}

function renderSceneList() {
  sceneList.replaceChildren();
  sceneCount.textContent = `${editorGroup.children.length}`;
  if (editorGroup.children.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'scene-list-empty';
    empty.textContent = '还没有手动布景。先从左侧放置两侧山体，建立关卡轮廓。';
    sceneList.append(empty);
    return;
  }
  editorGroup.children.forEach((object, index) => {
    const definition = getTerrainEditorAssetDefinition(object.userData.terrainEditorType);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scene-item';
    button.classList.toggle('is-selected', object === selectedObject);
    button.innerHTML = `
      <span class="scene-item-icon">${definition?.icon ?? '◇'}</span>
      <span class="scene-item-name">${definition?.name ?? object.name}</span>
      <span class="scene-item-index">${String(index + 1).padStart(2, '0')}</span>
    `;
    button.addEventListener('click', () => selectObject(object));
    button.addEventListener('dblclick', focusSelection);
    sceneList.append(button);
  });
}

function focusSelection() {
  if (!selectedObject) return;
  const box = new THREE.Box3().setFromObject(selectedObject);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  const offset = camera.position.clone().sub(orbitControls.target).normalize();
  orbitControls.target.copy(center);
  camera.position.copy(center).addScaledVector(offset, Math.max(10, size * 2.2));
  orbitControls.update();
}

function duplicateSelected() {
  if (!selectedObject) return;
  const item = serializeObject(selectedObject);
  item.id = makeAssetId();
  const step = snapEnabledInput.checked ? Number(snapSizeSelect.value) : 0.5;
  item.position.x += step;
  item.position.z += step;
  const clone = addAsset(item.type, item);
  if (!clone) return;
  pushHistory();
  scheduleAutosave();
  showToast('已复制选中物体');
}

function deleteSelected() {
  if (!selectedObject) return;
  const definition = getTerrainEditorAssetDefinition(selectedObject.userData.terrainEditorType);
  const nextIndex = Math.max(0, editorGroup.children.indexOf(selectedObject) - 1);
  const nextSelection = editorGroup.children.filter((item) => item !== selectedObject)[nextIndex] ?? null;
  transformControls.detach();
  editorGroup.remove(selectedObject);
  selectedObject = null;
  selectObject(nextSelection);
  renderSceneList();
  updateEmptyHint();
  pushHistory();
  scheduleAutosave();
  showToast(`已删除：${definition?.name ?? '物体'}`);
}

function clearLayout() {
  if (editorGroup.children.length === 0) return;
  if (!window.confirm('清空当前手动布景？保存的草稿会同步变为空布局。')) return;
  replaceLayout(normalizeTerrainLayout({ sceneKey: SCENE_KEY, items: [] }));
  pushHistory();
  saveDraft(false);
  showToast('已清空手动布景');
}

function restoreProceduralLayout() {
  window.clearTimeout(autosaveTimer);
  writeStoredTerrainLayout(currentLayout(), 'draft');
  removeStoredTerrainLayout(SCENE_KEY, 'active');
  saveStatus.textContent = '第一关已恢复原程序化布景；编辑器草稿仍保留';
  showToast('已恢复原程序化布景，刷新游戏即可查看');
}

function serializeObject(object) {
  const definition = getTerrainEditorAssetDefinition(object.userData.terrainEditorType);
  const item = {
    id: object.userData.terrainEditorAssetId,
    type: object.userData.terrainEditorType,
    seed: object.userData.terrainEditorSeed ?? 1,
    position: {
      x: Number(object.position.x.toFixed(3)),
      z: Number(object.position.z.toFixed(3))
    },
    rotation: {
      x: Number(object.rotation.x.toFixed(5)),
      y: Number(object.rotation.y.toFixed(5)),
      z: Number(object.rotation.z.toFixed(5))
    },
    scale: {
      x: Number(object.scale.x.toFixed(3)),
      y: Number(object.scale.y.toFixed(3)),
      z: Number(object.scale.z.toFixed(3))
    },
    groundOffset: object.userData.terrainEditorGroundOffset ?? definition?.groundOffset ?? 0,
    blocking: object.userData.terrainEditorBlocking !== false
  };
  if (object.userData.terrainEditorTile) {
    item.tile = object.userData.terrainEditorTileData;
  }
  return item;
}

function currentLayout() {
  return normalizeTerrainLayout({
    sceneKey: SCENE_KEY,
    manual: true,
    items: editorGroup.children.map(serializeObject)
  });
}

function layoutSnapshot() {
  return JSON.stringify(currentLayout());
}

function replaceLayout(layout) {
  selectObject(null);
  while (editorGroup.children.length) editorGroup.remove(editorGroup.children[0]);
  const normalized = normalizeTerrainLayout(layout, SCENE_KEY);
  const orderedItems = [...normalized.items].sort((a, b) => (
    Number(isTerrainEditorTileType(b.type)) - Number(isTerrainEditorTileType(a.type))
  ));
  orderedItems.forEach((item) => addAsset(item.type, item));
  selectObject(null);
  refreshLockedReferenceHeights();
  refreshEditorBoardBackdrop();
  renderSceneList();
  updateEmptyHint();
}

function pushHistory() {
  const snapshot = layoutSnapshot();
  if (history[historyIndex] === snapshot) return;
  history = history.slice(0, historyIndex + 1);
  history.push(snapshot);
  if (history.length > 80) history.shift();
  historyIndex = history.length - 1;
  updateHistoryButtons();
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex -= 1;
  replaceLayout(JSON.parse(history[historyIndex]));
  updateHistoryButtons();
  scheduleAutosave();
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex += 1;
  replaceLayout(JSON.parse(history[historyIndex]));
  updateHistoryButtons();
  scheduleAutosave();
}

function updateHistoryButtons() {
  undoButton.disabled = historyIndex <= 0;
  redoButton.disabled = historyIndex >= history.length - 1;
}

function scheduleAutosave() {
  window.clearTimeout(autosaveTimer);
  saveStatus.textContent = '有未保存的改动…';
  autosaveTimer = window.setTimeout(() => saveDraft(false), 500);
}

function saveDraft(notify = true) {
  window.clearTimeout(autosaveTimer);
  const saved = writeStoredTerrainLayout(currentLayout(), 'draft');
  const time = new Date(saved.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  saveStatus.textContent = `草稿已保存 · ${time} · ${saved.items.length} 个物体`;
  if (notify) showToast('草稿已保存在此浏览器');
}

function applyToLevel() {
  window.clearTimeout(autosaveTimer);
  const applied = writeStoredTerrainLayout(currentLayout(), 'active');
  writeStoredTerrainLayout(applied, 'draft');
  saveStatus.textContent = `已应用到第一关 · ${applied.items.length} 个手动物体`;
  showToast('已应用；刷新游戏第一关即可查看');
}

function exportLayout() {
  const layout = currentLayout();
  const blob = new Blob([`${JSON.stringify(layout, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `snow-valley-layout-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast('布局 JSON 已导出');
}

async function importLayout() {
  const [file] = importFile.files;
  importFile.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const imported = normalizeTerrainLayout(parsed, SCENE_KEY);
    replaceLayout(imported);
    pushHistory();
    saveDraft(false);
    showToast(`已导入 ${imported.items.length} 个物体`);
  } catch (error) {
    console.error(error);
    showToast('导入失败：JSON 格式不正确');
  }
}

function handleKeyboardShortcut(event) {
  const target = event.target;
  const editingText = target instanceof HTMLInputElement || target instanceof HTMLSelectElement;
  if (editingText && event.key !== 'Escape') return;
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) {
    if (key === 'z') {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    } else if (key === 'y') {
      event.preventDefault();
      redo();
    } else if (key === 'd') {
      event.preventDefault();
      duplicateSelected();
    } else if (key === 's') {
      event.preventDefault();
      saveDraft(true);
    }
    return;
  }
  if (key === 'w') setTransformMode('translate');
  else if (key === 'e') setTransformMode('rotate');
  else if (key === 'r') setTransformMode('scale');
  else if (key === 'f') focusSelection();
  else if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected();
  else if (event.key === 'Escape') selectObject(null);
}

function updateEmptyHint() {
  emptyHint.hidden = editorGroup.children.length > 0;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

function makeAssetId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `terrain-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function resizeRenderer() {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
