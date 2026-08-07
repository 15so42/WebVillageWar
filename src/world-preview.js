// 雪谷场景独立预览页：只创建世界（地形/山体/布景/基地/敌营），
// 不跑战斗逻辑与 HUD，供截图与像素采样分析场景构图使用。
// 入口：world-preview.html（Vite 多页面：/world-preview.html）
import * as THREE from 'three';
import { createWorld } from './world/createWorld.js';

const canvas = document.getElementById('preview-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// 与游戏内 SNOW_VALLEY_HEAD_RENDER_TUNING 的色调映射/曝光保持一致
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;

const scene = new THREE.Scene();
const world = createWorld(scene, { sceneKey: 'snow-valley', sky: { bakedShadows: false } });
const sun = world.lights.sun;
sun.shadow.camera.left = -100;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100;
sun.shadow.camera.bottom = -100;

// 始终锁定 16:9 视口：窗口非 16:9 时用 CSS 把 canvas 居中成 16:9 信箱，
// 渲染分辨率跟随 canvas 实际尺寸，截图看到的就是真实 16:9 画面
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
  camera.aspect = 16 / 9;
  camera.updateProjectionMatrix();
}

const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 600);
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

const VIEWS = {
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
}

const initialView = new URLSearchParams(location.search).get('view');
if (initialView && VIEWS[initialView]) {
  setView(initialView);
} else {
  setView('overview');
}

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
  if (event.key === '1') setView('overview');
  else if (event.key === '2') setView('player');
  else if (event.key === '3') setView('ridge');
  else if (event.key === '4') setView('horizon');
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
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- 自动化接口（供 browser-use 截图/采样） ----------
function samplePixels(points) {
  renderer.render(scene, camera);
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
  },
  samplePixels
};
console.log('world preview ready: window.worldPreview');
