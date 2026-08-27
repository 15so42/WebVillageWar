import * as THREE from 'three';
import { basicMat, mat } from './lowpoly.js';

const SMOKE_PARTICLE_COUNT = 22;
const WILDFIRE_FLAME_COUNT = 34;
const WILDFIRE_TRACE_COUNT = 14;
const TOXIC_ATMOSPHERE_COUNT = 10;
const TOXIC_MOTE_COUNT = 16;
const ROOT_VINE_COUNT = 15;
const UP_AXIS = new THREE.Vector3(0, 1, 0);

export function createAreaEffectVisual({ radius, color, accent, kind }) {
  if (kind === 'rootVines') {
    return createRootVinesVisual(radius, color, accent);
  }
  const group = new THREE.Group();
  group.userData.baseRadius = radius;
  group.userData.kind = kind;
  const isWildfire = kind === 'wildfire';
  const isToxic = kind === 'poisonFog' || kind === 'plagueFog';
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

  if (isWildfire) {
    const scorchMaterial = basicMat('#28140f', {
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone();
    const emberTraceMaterial = basicMat('#ff6a22', {
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const scorchGeometry = new THREE.CircleGeometry(1, 12);
    const traceGeometry = new THREE.RingGeometry(0.72, 1, 12, 1, 0, Math.PI * 1.18);
    const groundTraces = [];
    for (let index = 0; index < WILDFIRE_TRACE_COUNT; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * Math.sqrt(Math.random()) * 0.78;
      const width = radius * (0.07 + Math.random() * 0.12);
      const length = radius * (0.12 + Math.random() * 0.22);
      const patch = new THREE.Mesh(scorchGeometry, scorchMaterial);
      patch.position.set(Math.cos(angle) * distance, 0.016 + index * 0.0003, Math.sin(angle) * distance);
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = angle + (Math.random() - 0.5) * 0.8;
      patch.scale.set(width, length, 1);
      patch.renderOrder = 1321;
      patch.layers.set(1);
      const emberTrace = new THREE.Mesh(traceGeometry, emberTraceMaterial);
      emberTrace.position.copy(patch.position);
      emberTrace.position.y += 0.006;
      emberTrace.rotation.x = -Math.PI / 2;
      emberTrace.rotation.z = patch.rotation.z + Math.random() * 0.5;
      emberTrace.scale.set(width * 0.74, length * 0.72, 1);
      emberTrace.userData.phase = Math.random() * Math.PI * 2;
      emberTrace.renderOrder = 1322;
      emberTrace.layers.set(1);
      groundTraces.push({ patch, emberTrace });
      group.add(patch, emberTrace);
    }
    group.userData.groundTraces = groundTraces;
    group.userData.scorchMaterial = scorchMaterial;
    group.userData.emberTraceMaterial = emberTraceMaterial;
  }

  if (isToxic) {
    const stainMaterial = basicMat(kind === 'plagueFog' ? '#27351f' : '#314a25', {
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone();
    const atmosphereMaterial = mat(color, {
      transparent: true,
      opacity: kind === 'plagueFog' ? 0.2 : 0.17,
      emissive: accent,
      emissiveIntensity: kind === 'plagueFog' ? 0.16 : 0.22,
      roughness: 0.46,
      depthWrite: false,
      side: THREE.DoubleSide
    }).clone();
    const toxicMoteMaterial = basicMat(accent, {
      transparent: true,
      opacity: 0.64,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const stainGeometry = new THREE.CircleGeometry(1, 14);
    const atmosphereGeometry = new THREE.SphereGeometry(1, 12, 8);
    const toxicMoteGeometry = new THREE.OctahedronGeometry(0.035, 0);
    const stains = [];
    for (let index = 0; index < 8; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * Math.sqrt(Math.random()) * 0.7;
      const stain = new THREE.Mesh(stainGeometry, stainMaterial);
      stain.position.set(Math.cos(angle) * distance, 0.014 + index * 0.0002, Math.sin(angle) * distance);
      stain.rotation.x = -Math.PI / 2;
      stain.rotation.z = Math.random() * Math.PI;
      stain.scale.set(radius * (0.1 + Math.random() * 0.16), radius * (0.08 + Math.random() * 0.14), 1);
      stain.renderOrder = 1321;
      stain.layers.set(1);
      stains.push(stain);
      group.add(stain);
    }
    const atmospherePuffs = [];
    for (let index = 0; index < TOXIC_ATMOSPHERE_COUNT; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * Math.sqrt(Math.random()) * 0.7;
      const puff = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
      puff.position.set(
        Math.cos(angle) * distance,
        0.24 + Math.random() * 1.12,
        Math.sin(angle) * distance
      );
      puff.userData.base = puff.position.clone();
      puff.userData.phase = Math.random() * Math.PI * 2;
      puff.userData.speed = 0.2 + Math.random() * 0.42;
      puff.userData.atmosphere = true;
      puff.userData.baseScale = radius * (0.18 + Math.random() * 0.2);
      puff.userData.aspect = new THREE.Vector3(
        1.2 + Math.random() * 0.75,
        0.48 + Math.random() * 0.36,
        1.05 + Math.random() * 0.7
      );
      puff.renderOrder = 1320;
      puff.layers.set(0);
      atmospherePuffs.push(puff);
      group.add(puff);
    }
    const toxicMotes = [];
    for (let index = 0; index < TOXIC_MOTE_COUNT; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * Math.sqrt(Math.random()) * 0.82;
      const mote = new THREE.Mesh(toxicMoteGeometry, toxicMoteMaterial);
      mote.position.set(Math.cos(angle) * distance, 0.15 + Math.random() * 1.5, Math.sin(angle) * distance);
      mote.userData.base = mote.position.clone();
      mote.userData.phase = Math.random() * Math.PI * 2;
      mote.userData.speed = 0.34 + Math.random() * 0.7;
      mote.userData.toxicMote = true;
      mote.userData.baseScale = 0.6 + Math.random() * 1.25;
      mote.layers.set(0);
      toxicMotes.push(mote);
      group.add(mote);
    }
    group.userData.stains = stains;
    group.userData.stainMaterial = stainMaterial;
    group.userData.atmospherePuffs = atmospherePuffs;
    group.userData.atmosphereMaterial = atmosphereMaterial;
    group.userData.toxicMotes = toxicMotes;
    group.userData.toxicMoteMaterial = toxicMoteMaterial;
  }

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
  if (kind === 'rootVines') {
    updateRootVinesVisual(group, age, duration, radius, dt);
    return;
  }
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
  if (kind === 'wildfire' && group.userData.groundTraces) {
    group.userData.scorchMaterial.opacity = 0.34 * alpha;
    group.userData.emberTraceMaterial.opacity = (0.42 + Math.sin(age * 8.4) * 0.1) * alpha;
    group.userData.groundTraces.forEach(({ patch, emberTrace }, index) => {
      const flicker = 0.92 + Math.sin(age * (5.8 + index * 0.08) + emberTrace.userData.phase) * 0.09;
      emberTrace.scale.x = patch.scale.x * 0.74 * flicker;
      emberTrace.scale.y = patch.scale.y * 0.72 * flicker;
      emberTrace.rotation.z += dt * (index % 2 ? -0.045 : 0.045);
    });
  }
  if ((kind === 'poisonFog' || kind === 'plagueFog') && group.userData.atmospherePuffs) {
    group.userData.stainMaterial.opacity = 0.24 * alpha;
    group.userData.atmosphereMaterial.opacity = (kind === 'plagueFog' ? 0.2 : 0.17) * alpha;
    group.userData.toxicMoteMaterial.opacity = 0.64 * alpha;
    group.userData.atmospherePuffs.forEach((puff, index) => {
      const phase = puff.userData.phase + age * puff.userData.speed;
      puff.position.x = puff.userData.base.x + Math.cos(phase * 0.72) * radius * 0.055;
      puff.position.z = puff.userData.base.z + Math.sin(phase * 0.64) * radius * 0.055;
      puff.position.y = puff.userData.base.y + Math.sin(phase) * 0.16;
      const breathe = puff.userData.baseScale * (0.86 + Math.sin(phase * 1.3 + index) * 0.12);
      puff.scale.copy(puff.userData.aspect).multiplyScalar(breathe);
      puff.rotation.y += dt * (0.08 + index * 0.006);
    });
    group.userData.toxicMotes.forEach((mote, index) => {
      const phase = mote.userData.phase + age * mote.userData.speed;
      mote.position.x = mote.userData.base.x + Math.cos(phase + index) * 0.12;
      mote.position.z = mote.userData.base.z + Math.sin(phase * 0.8 + index) * 0.12;
      mote.position.y = mote.userData.base.y + Math.sin(phase * 1.4) * 0.18;
      mote.rotation.y += dt * (1.2 + index * 0.04);
      mote.scale.setScalar(mote.userData.baseScale * (0.72 + Math.sin(phase * 2.2) * 0.24));
    });
  }
  group.children.forEach((child, index) => {
    if (!child.userData.base) return;
    if (child.userData.atmosphere || child.userData.toxicMote) return;
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

function createRootVinesVisual(radius, color, accent) {
  const group = new THREE.Group();
  group.userData.baseRadius = radius;
  group.userData.kind = 'rootVines';
  group.userData.preserveRenderLayers = true;

  const discMaterial = basicMat('#263a25', {
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false
  }).clone();
  const ringMaterial = basicMat(accent, {
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    depthWrite: false
  }).clone();
  const vineMaterial = mat(color, {
    transparent: true,
    opacity: 0.94,
    roughness: 0.96
  }).clone();
  const thornMaterial = mat('#cadb8d', {
    transparent: true,
    opacity: 0.9,
    emissive: '#6e873c',
    emissiveIntensity: 0.16,
    roughness: 0.86
  }).clone();

  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), discMaterial);
  disc.rotation.x = -Math.PI / 2;
  disc.scale.setScalar(radius);
  disc.renderOrder = 1320;
  disc.layers.set(1);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.scale.setScalar(radius);
  ring.position.y = 0.016;
  ring.renderOrder = 1321;
  ring.layers.set(1);
  group.add(disc, ring);

  const roots = [];
  const rootSegmentGeometry = new THREE.CylinderGeometry(0.045, 0.11, 1, 5);
  const rootTipGeometry = new THREE.ConeGeometry(0.085, 1, 5);
  const thornGeometry = new THREE.ConeGeometry(0.042, 1, 4);
  for (let index = 0; index < ROOT_VINE_COUNT; index += 1) {
    const angle = (index / ROOT_VINE_COUNT) * Math.PI * 2 + (index % 3) * 0.17;
    const distance = radius * (0.2 + ((index * 7) % 11) / 19);
    const length = radius * (0.22 + ((index * 5) % 7) / 24);
    const direction = new THREE.Vector3(Math.cos(angle), 0.05, Math.sin(angle)).normalize();
    const root = new THREE.Group();
    root.position.set(Math.cos(angle) * distance, 0.07, Math.sin(angle) * distance);
    root.userData.phase = index * 0.73;
    root.userData.baseScale = 0.82 + (index % 4) * 0.055;

    const segment = new THREE.Mesh(
      rootSegmentGeometry,
      vineMaterial
    );
    segment.position.copy(direction).multiplyScalar(length * 0.36);
    segment.scale.y = length;
    segment.quaternion.setFromUnitVectors(UP_AXIS, direction);
    const tip = new THREE.Mesh(
      rootTipGeometry,
      vineMaterial
    );
    tip.position.copy(direction).multiplyScalar(length * 0.83);
    tip.scale.y = length * 0.42;
    tip.quaternion.setFromUnitVectors(UP_AXIS, direction);
    root.add(segment, tip);

    for (let thornIndex = 0; thornIndex < 2; thornIndex += 1) {
      const thorn = new THREE.Mesh(
        thornGeometry,
        thornMaterial
      );
      const thornDistance = length * (0.36 + thornIndex * 0.3);
      thorn.position.copy(direction).multiplyScalar(thornDistance);
      thorn.position.y += 0.08;
      thorn.scale.y = 0.2 + (index % 3) * 0.025;
      thorn.rotation.z = (thornIndex === 0 ? -1 : 1) * (0.24 + (index % 2) * 0.1);
      root.add(thorn);
    }
    root.scale.setScalar(0.02);
    roots.push(root);
    group.add(root);
  }

  group.userData.disc = disc;
  group.userData.ring = ring;
  group.userData.roots = roots;
  group.userData.vineMaterial = vineMaterial;
  group.userData.thornMaterial = thornMaterial;
  return group;
}

function updateRootVinesVisual(group, age, duration, radius, dt) {
  const fadeIn = Math.min(1, age / 0.36);
  const fadeOut = Math.min(1, (duration - age) / 0.72);
  const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
  const pulse = Math.sin(age * 2.25) * 0.025;
  group.userData.disc.scale.setScalar(radius * (1 + pulse));
  group.userData.ring.scale.setScalar(radius * (1 + pulse * 1.5));
  group.userData.disc.material.opacity = 0.24 * alpha;
  group.userData.ring.material.opacity = 0.62 * alpha;
  group.userData.vineMaterial.opacity = 0.94 * alpha;
  group.userData.thornMaterial.opacity = 0.9 * alpha;
  group.userData.roots.forEach((root, index) => {
    const growth = Math.min(1, age / (0.28 + index * 0.018));
    const breathe = 1 + Math.sin(age * 2.8 + root.userData.phase) * 0.045;
    const scale = root.userData.baseScale * growth * breathe;
    root.scale.setScalar(Math.max(0.02, scale));
    root.rotation.y = Math.sin(age * 1.35 + root.userData.phase) * 0.035;
    root.position.y = 0.07 + Math.sin(age * 2.1 + root.userData.phase) * 0.018;
    root.children.forEach((child, childIndex) => {
      if (childIndex < 2) return;
      child.rotation.y += dt * (0.18 + index * 0.004);
    });
  });
}
