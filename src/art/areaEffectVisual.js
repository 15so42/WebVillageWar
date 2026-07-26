import * as THREE from 'three';
import { basicMat, mat } from './lowpoly.js';

const SMOKE_PARTICLE_COUNT = 22;
const WILDFIRE_FLAME_COUNT = 34;

export function createAreaEffectVisual({ radius, color, accent, kind }) {
  const group = new THREE.Group();
  group.userData.baseRadius = radius;
  group.userData.kind = kind;
  const isWildfire = kind === 'wildfire';
  // The smoke uses a lit material and must stay in the world pass. Only the
  // flat range markers belong in the layer-1 overlay pass.
  group.userData.preserveRenderLayers = true;

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    basicMat(color, {
      transparent: true,
      opacity: isWildfire ? 0.1 : (kind === 'whiteSmoke' ? 0.18 : 0.2),
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
      opacity: isWildfire ? 0.36 : (kind === 'whiteSmoke' ? 0.62 : 0.54),
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

  const puffMaterial = isWildfire
    ? basicMat('#ff7a2d', {
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone()
    : mat(color, {
      transparent: true,
      opacity: kind === 'whiteSmoke' ? 0.42 : 0.34,
      emissive: accent,
      emissiveIntensity: kind === 'whiteSmoke' ? 0.08 : 0.18,
      depthWrite: false
    }).clone();
  const particleCount = isWildfire ? WILDFIRE_FLAME_COUNT : SMOKE_PARTICLE_COUNT;
  for (let i = 0; i < particleCount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = radius * Math.sqrt(Math.random()) * 0.88;
    const flameHeight = 0.55 + Math.random() * 0.88;
    const flameWidth = 0.14 + Math.random() * 0.15;
    const puff = new THREE.Mesh(
      isWildfire
        ? new THREE.ConeGeometry(0.5, 1, 6, 1, true)
        : new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.26, 0),
      puffMaterial
    );
    puff.position.set(
      Math.cos(angle) * distance,
      isWildfire ? flameHeight * 0.5 : 0.22 + Math.random() * 0.82,
      Math.sin(angle) * distance
    );
    puff.userData.base = isWildfire
      ? new THREE.Vector3(puff.position.x, 0.045, puff.position.z)
      : puff.position.clone();
    puff.userData.phase = Math.random() * Math.PI * 2;
    puff.userData.speed = isWildfire ? 0.75 + Math.random() * 0.85 : 0.35 + Math.random() * 0.55;
    puff.userData.isFlame = isWildfire;
    puff.userData.flameHeight = flameHeight;
    puff.userData.flameWidth = flameWidth;
    puff.userData.sway = 0.08 + Math.random() * 0.18;
    if (isWildfire) {
      puff.scale.set(flameWidth, flameHeight, flameWidth);
      puff.rotation.set(
        (Math.random() - 0.5) * 0.24,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.24
      );
    }
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
  group.userData.disc.material.opacity = (
    kind === 'wildfire' ? 0.1 : (kind === 'whiteSmoke' ? 0.18 : 0.2)
  ) * alpha;
  group.userData.ring.material.opacity = (
    kind === 'wildfire' ? 0.36 : (kind === 'whiteSmoke' ? 0.62 : 0.54)
  ) * alpha;
  group.userData.puffMaterial.opacity = (
    kind === 'wildfire' ? 0.9 : (kind === 'whiteSmoke' ? 0.42 : 0.34)
  ) * alpha;
  group.children.forEach((child, index) => {
    if (!child.userData.base) return;
    const phase = child.userData.phase + age * child.userData.speed;
    if (child.userData.isFlame) {
      const lick = 0.76 + Math.sin(phase * 5.3) * 0.14 + Math.sin(age * 13 + index) * 0.11;
      const heat = 0.84 + Math.sin(t * Math.PI) * 0.18;
      const heightScale = child.userData.flameHeight * Math.max(0.42, lick * heat);
      const widthScale = child.userData.flameWidth * (0.78 + Math.sin(phase * 3.1) * 0.12);
      child.position.x = child.userData.base.x + Math.cos(phase * 1.2) * child.userData.sway;
      child.position.z = child.userData.base.z + Math.sin(phase) * child.userData.sway;
      child.position.y = child.userData.base.y + heightScale * 0.5 + Math.sin(phase * 2.4) * 0.04;
      child.rotation.x = Math.sin(phase * 0.9) * 0.18;
      child.rotation.y += dt * (1.1 + index * 0.015);
      child.rotation.z = Math.cos(phase * 1.1) * 0.2;
      child.scale.set(widthScale, heightScale, widthScale);
      return;
    }
    child.position.x = child.userData.base.x + Math.cos(phase) * 0.12;
    child.position.z = child.userData.base.z + Math.sin(phase * 0.84) * 0.12;
    child.position.y = child.userData.base.y + Math.sin(phase * 1.25) * 0.08;
    child.rotation.y += dt * (0.35 + index * 0.01);
    const scale = 0.72 + Math.sin(phase) * 0.16 + Math.sin(t * Math.PI) * 0.18;
    child.scale.setScalar(scale);
  });
}
