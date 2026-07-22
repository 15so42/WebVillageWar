import * as THREE from 'three';
import { basicMat, mat } from './lowpoly.js';

const SMOKE_PARTICLE_COUNT = 22;

export function createAreaEffectVisual({ radius, color, accent, kind }) {
  const group = new THREE.Group();
  group.userData.baseRadius = radius;
  group.userData.kind = kind;
  // The smoke uses a lit material and must stay in the world pass. Only the
  // flat range markers belong in the layer-1 overlay pass.
  group.userData.preserveRenderLayers = true;

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    basicMat(color, {
      transparent: true,
      opacity: kind === 'whiteSmoke' ? 0.18 : 0.2,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone()
  );
  disc.rotation.x = -Math.PI / 2;
  disc.scale.setScalar(radius);
  disc.renderOrder = 1320;
  disc.layers.set(1);
  group.add(disc);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1, 64),
    basicMat(accent, {
      transparent: true,
      opacity: kind === 'whiteSmoke' ? 0.62 : 0.54,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone()
  );
  ring.rotation.x = -Math.PI / 2;
  ring.scale.setScalar(radius);
  ring.position.y = 0.012;
  ring.renderOrder = 1321;
  ring.layers.set(1);
  group.add(ring);

  const puffMaterial = mat(color, {
    transparent: true,
    opacity: kind === 'whiteSmoke' ? 0.42 : 0.34,
    emissive: accent,
    emissiveIntensity: kind === 'whiteSmoke' ? 0.08 : 0.18,
    depthWrite: false
  }).clone();
  for (let i = 0; i < SMOKE_PARTICLE_COUNT; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = radius * Math.sqrt(Math.random()) * 0.88;
    const puff = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.26, 0),
      puffMaterial
    );
    puff.position.set(
      Math.cos(angle) * distance,
      0.22 + Math.random() * 0.82,
      Math.sin(angle) * distance
    );
    puff.userData.base = puff.position.clone();
    puff.userData.phase = Math.random() * Math.PI * 2;
    puff.userData.speed = 0.35 + Math.random() * 0.55;
    puff.renderOrder = 1322;
    puff.layers.set(0);
    group.add(puff);
  }
  group.userData.disc = disc;
  group.userData.ring = ring;
  group.userData.puffMaterial = puffMaterial;
  return group;
}

export function updateAreaEffectVisual(group, { age, duration, radius, kind }, dt) {
  const t = Math.min(1, age / Math.max(0.01, duration));
  const fadeIn = Math.min(1, age / 0.45);
  const fadeOut = Math.min(1, (duration - age) / 0.9);
  const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
  const pulse = Math.sin((age * 1.9) + radius) * 0.035;
  group.userData.disc.scale.setScalar(radius * (1 + pulse));
  group.userData.ring.scale.setScalar(radius * (1 + pulse * 1.4));
  group.userData.disc.material.opacity = (kind === 'whiteSmoke' ? 0.18 : 0.2) * alpha;
  group.userData.ring.material.opacity = (kind === 'whiteSmoke' ? 0.62 : 0.54) * alpha;
  group.userData.puffMaterial.opacity = (kind === 'whiteSmoke' ? 0.42 : 0.34) * alpha;
  group.children.forEach((child, index) => {
    if (!child.userData.base) return;
    const phase = child.userData.phase + age * child.userData.speed;
    child.position.x = child.userData.base.x + Math.cos(phase) * 0.12;
    child.position.z = child.userData.base.z + Math.sin(phase * 0.84) * 0.12;
    child.position.y = child.userData.base.y + Math.sin(phase * 1.25) * 0.08;
    child.rotation.y += dt * (0.35 + index * 0.01);
    child.scale.setScalar(0.72 + Math.sin(phase) * 0.16 + Math.sin(t * Math.PI) * 0.18);
  });
}
