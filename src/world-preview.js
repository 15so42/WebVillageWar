// 雪谷场景独立预览页：只创建世界（地形/山体/布景/基地/敌营），
// 不跑战斗逻辑与 HUD，供截图与像素采样分析场景构图使用。
// 入口：world-preview.html（Vite 多页面：/world-preview.html）
// 本页完全复刻游戏内 L1（snow-valley）的 SNOW_VALLEY_HEAD_RENDER_TUNING：
// 色调映射/曝光、CSS 滤镜、bloom、暗角、太阳/半球/环境光、背景/雾、材质前景色（树=绿）。
import * as THREE from 'three';
import { createWorld } from './world/createWorld.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// 与 Game.js SNOW_VALLEY_HEAD_RENDER_TUNING 保持一致（白天暖阳）
const L1_TUNING = {
  toneMapping: 'aces', exposure: 1.04,
  brightness: 1.05, contrast: 1.18, saturation: 1.02, hue: 0, warmth: 0,
  sunColor: '#ffcf9e', sunIntensity: 3.5, sunX: -22, sunY: 42, sunZ: 88, shadowIntensity: 1,
  hemiSky: '#b7c9e8', hemiGround: '#3b4a68', hemiIntensity: 0.78,
  ambientColor: '#a9b2c6', ambientIntensity: 0.6,
  background: '#c8cddc', fogColor: '#c8cddc', fogNear: 48, fogFar: 215,
  bloomStrength: 0.12, vignetteStrength: 0.06,
  snowColor: '#e9eef6', rockColor: '#7c7f85', treeColor: '#46685a'
};

// 海岛生存预览调色：亮白天光 + 高饱和植被，和关卡预设里的光照/雾保持一致
const ISLAND_TUNING = {
  toneMapping: 'aces', exposure: 1.02,
  brightness: 1.03, contrast: 1.14, saturation: 1.06, hue: 0, warmth: 0,
  sunColor: '#fff2d5', sunIntensity: 3.35, sunX: -54, sunY: 76, sunZ: 62, shadowIntensity: 0.88,
  hemiSky: '#bfe4ff', hemiGround: '#43593a', hemiIntensity: 1.12,
  ambientColor: '#9fbfd0', ambientIntensity: 0.56,
  background: '#8fc9e6', fogColor: '#bcdcea', fogNear: 130, fogFar: 420,
  bloomStrength: 0.1, vignetteStrength: 0.05,
  snowColor: '#6f9a52', rockColor: '#8b8577', treeColor: '#3f6b3a'
};

// 预览页支持 ?scene=<sceneKey>，默认仍是雪谷；可用的 key 与 WORLD_PRESETS 一致。
const PREVIEW_SCENE_KEY = new URLSearchParams(location.search).get('scene') ?? 'snow-valley';
const TUNING = PREVIEW_SCENE_KEY === 'island-survival' ? ISLAND_TUNING : L1_TUNING;

const canvas = document.getElementById('preview-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = TUNING.exposure;
canvas.style.filter = [
  `brightness(${TUNING.brightness})`,
  `contrast(${TUNING.contrast})`,
  `saturate(${TUNING.saturation})`,
  `hue-rotate(${TUNING.hue}deg)`,
  `sepia(${TUNING.warmth})`
].join(' ');
// 暗角近似（vignetteStrength 0.06）
const previewVignette = document.createElement('div');
previewVignette.style.cssText = [
  'position:fixed', 'inset:0', 'pointer-events:none',
  `background:radial-gradient(ellipse at center, transparent 58%, rgba(10,16,26,${TUNING.vignetteStrength}) 100%)`,
  'z-index:5'
].join(';');
document.body.appendChild(previewVignette);

const scene = new THREE.Scene();
// 与正式游戏一致：启用静态烘焙地面阴影
const world = createWorld(scene, PREVIEW_SCENE_KEY === 'island-survival'
  ? { sceneKey: PREVIEW_SCENE_KEY }
  : { sceneKey: PREVIEW_SCENE_KEY, sky: { bakedShadows: true } });

const sun = world.lights.sun;
sun.shadow.camera.left = -100;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100;
sun.shadow.camera.bottom = -100;

// 复刻 applyRenderTuning：光照/背景/雾/材质前景色
sun.color.set(TUNING.sunColor);
sun.intensity = TUNING.sunIntensity;
sun.position.set(TUNING.sunX, TUNING.sunY, TUNING.sunZ);
sun.target?.updateMatrixWorld?.();
if (sun.shadow) sun.shadow.intensity = TUNING.shadowIntensity;
const hemisphere = world.lights.hemisphere;
if (hemisphere) {
  hemisphere.color.set(TUNING.hemiSky);
  hemisphere.groundColor.set(TUNING.hemiGround);
  hemisphere.intensity = TUNING.hemiIntensity;
}
const ambient = world.lights.ambient;
if (ambient) {
  ambient.color.set(TUNING.ambientColor);
  ambient.intensity = TUNING.ambientIntensity;
}
scene.background = new THREE.Color(TUNING.background);
if (scene.fog) {
  scene.fog.color.set(TUNING.fogColor);
  scene.fog.near = TUNING.fogNear;
  scene.fog.far = TUNING.fogFar;
}
world.setMaterialColors?.({
  snow: TUNING.snowColor,
  rock: TUNING.rockColor,
  tree: TUNING.treeColor
});

// 始终锁定 16:9 视口（fov 35 与游戏一致）
const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.5, 600);

// 后处理：真实 bloom（白天低强度）+ OutputPass，与游戏内对齐
const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.addPass(new RenderPass(scene, camera));
const previewBloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  TUNING.bloomStrength, 0.4, 0.85
);
composer.addPass(previewBloom);
composer.addPass(new OutputPass());

function applyViewport() {
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const targetW = Math.min(winW, winH * (16 / 9));
  const targetH = targetW * (9 / 16);
  canvas.style.width = `${targetW}px`;
  canvas.style.height = `${targetH}px`;
  canvas.style.position = 'fixed';
  canvas.style.left = `${(winW - targetW) / 2}px`;
  canvas.style.top = `${(winH - targetH) / 2}px`;
  renderer.setSize(targetW, targetH, false);
  composer.setSize(targetW, targetH);
  camera.aspect = 16 / 9;
  camera.updateProjectionMatrix();
}
applyViewport();
window.addEventListener('resize', applyViewport);

// ---------- 轨道相机 ----------
const orbit = {
  target: new THREE.Vector3(0, 2, 0),
  yaw: Math.PI * 0.5,
  pitch: 0.9,
  distance: 92,
  autoRotate: false
};

function applyOrbit() {
  const cosPitch = Math.cos(orbit.pitch);
  camera.position.set(
    orbit.target.x + Math.cos(orbit.yaw) * cosPitch * orbit.distance,
    orbit.target.y + Math.sin(orbit.pitch) * orbit.distance,
    orbit.target.z + Math.sin(orbit.yaw) * cosPitch * orbit.distance
  );
  camera.lookAt(orbit.target);
}

const VIEWS = PREVIEW_SCENE_KEY === 'island-survival'
  ? {
      // 海岛：先看全岛轮廓与环海，再看海岸线、沙滩、岛心高地
      overview: { target: [0, 2, 0], yaw: Math.PI * 0.5, pitch: 0.86, distance: 168 },
      coast: { target: [-6, 2, 26], yaw: Math.PI * 0.7, pitch: 0.36, distance: 92 },
      beach: { target: [-22, 2, 24], yaw: Math.PI * 0.34, pitch: 0.26, distance: 58 },
      highland: { target: [-2, 7, -4], yaw: Math.PI * 0.5, pitch: 0.55, distance: 104 },
      horizon: { target: [0, 5, -12], yaw: Math.PI * 0.5, pitch: 0.1, distance: 96 }
    }
  : {
      overview: { target: [0, 2, 0], yaw: Math.PI * 0.5, pitch: 0.95, distance: 96 },
      player: { target: [-1, 3, 8], yaw: Math.PI * 0.62, pitch: 0.72, distance: 52 },
      ridge: { target: [-10, 5, 4], yaw: Math.PI * 0.28, pitch: 0.22, distance: 58 },
      horizon: { target: [0, 8, -6], yaw: Math.PI * 0.5, pitch: 0.07, distance: 46 }
    };

function setView(name) {
  const view = VIEWS[name];
  if (!view) return;
  orbit.target.set(view.target[0], view.target[1], view.target[2]);
  orbit.yaw = view.yaw;
  orbit.pitch = view.pitch;
  orbit.distance = view.distance;
  // headless 下 requestAnimationFrame 会被节流，机位必须立即应用，
  // 否则自动截图拿到的是上一个机位。
  applyOrbit();
}

const initialView = new URLSearchParams(location.search).get('view');
if (initialView && VIEWS[initialView]) setView(initialView);
else setView('overview');

// ---------- 交互 ----------
let dragging = 0; // 1 左键旋转 2 右键平移
let lastX = 0;
let lastY = 0;
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('pointerdown', (event) => {
  dragging = event.button === 2 ? 2 : 1;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const dx = event.clientX - lastX;
  const dy = event.clientY - lastY;
  lastX = event.clientX;
  lastY = event.clientY;
  if (dragging === 1) {
    orbit.yaw += dx * 0.0052;
    orbit.pitch = Math.min(1.45, Math.max(0.02, orbit.pitch + dy * 0.004));
  } else {
    const forward = new THREE.Vector3(-Math.cos(orbit.yaw), 0, -Math.sin(orbit.yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const panScale = orbit.distance * 0.0016;
    orbit.target.addScaledVector(right, -dx * panScale);
    orbit.target.addScaledVector(forward, dy * panScale);
  }
});
canvas.addEventListener('pointerup', () => { dragging = 0; });
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  orbit.distance = Math.min(220, Math.max(14, orbit.distance * (1 + Math.sign(event.deltaY) * 0.09)));
}, { passive: false });
window.addEventListener('keydown', (event) => {
  // 数字键按当前场景的机位顺序切换，不再写死雪谷的机位名
  const viewNames = Object.keys(VIEWS);
  const viewIndex = Number(event.key) - 1;
  if (Number.isInteger(viewIndex) && viewNames[viewIndex]) setView(viewNames[viewIndex]);
  else if (event.key === 'o' || event.key === 'O') orbit.autoRotate = !orbit.autoRotate;
});

// ---------- 渲染循环 ----------
let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (orbit.autoRotate && !dragging) orbit.yaw += dt * 0.06;
  applyOrbit();
  world.update(dt, orbit.target, camera, {});
  composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- 自动化接口（供 browser-use 截图/采样） ----------
function samplePixels(points) {
  composer.render();
  const gl = renderer.getContext();
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const pixel = new Uint8Array(4);
  return points.map(({ x, y }) => {
    const px = Math.round(Math.min(0.999, Math.max(0, x)) * width);
    const py = Math.round(Math.min(0.999, Math.max(0, 1 - y)) * height);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return { x, y, r: pixel[0], g: pixel[1], b: pixel[2] };
  });
}

window.worldPreview = {
  scene,
  camera,
  renderer,
  world,
  orbit,
  views: Object.keys(VIEWS),
  setView,
  setCamera({ target, yaw, pitch, distance } = {}) {
    if (Array.isArray(target)) orbit.target.set(target[0], target[1], target[2]);
    if (typeof yaw === 'number') orbit.yaw = yaw;
    if (typeof pitch === 'number') orbit.pitch = pitch;
    if (typeof distance === 'number') orbit.distance = distance;
    applyOrbit(); // 立即应用，headless 下 rAF 可能被节流
  },
  samplePixels
};
console.log('world preview ready: window.worldPreview');
