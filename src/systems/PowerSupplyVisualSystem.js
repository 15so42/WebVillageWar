/**
 * 供能范围与补魔连线的世界特效。
 *
 * - 每个供能源（基地、魔力炉…）在地表画出 supplyRadius 范围环与边界魔力粒子；
 * - 正在范围内补魔的接收者（当前：木傀儡）从头部连到供能源；
 * - 其它接收者类型通过 `receiverWantsPowerLink` 预留，后续接箭塔/食堂等。
 */
import * as THREE from 'three';
import { createSoftParticleSprite } from '../art/vfxMaterials.js';
import { powerDistance } from './power.js';

/** @typedef {{ ringColor: number, fillColor: number, fillOpacity: number, ringOpacity: number, particleColor: string, linkColor: number, linkGlow: number, activeWhen?: (supplier: object) => boolean }} SupplierVisualProfile */

/** 按供能源 kind 扩展；未列出的 kind 用 default。 */
export const SUPPLIER_VISUAL_PROFILES = Object.freeze({
  default: {
    ringColor: 0x9ee8ff,
    fillColor: 0x6fc8ff,
    fillOpacity: 0.07,
    ringOpacity: 0.38,
    particleColor: '#a8ecff',
    linkColor: 0xa8f0ff,
    linkGlow: 0x6fd4ff,
    activeWhen: () => true
  },
  base: {
    ringColor: 0x9ee8ff,
    fillColor: 0x6fc8ff,
    fillOpacity: 0.075,
    ringOpacity: 0.42,
    particleColor: '#b8f4ff',
    linkColor: 0xb0f2ff,
    linkGlow: 0x78dcff,
    activeWhen: () => true
  },
  /** 魔力炉：有功率时高亮，无燃料时仍显示范围但变淡（预留完整特效）。 */
  manaFurnace: {
    ringColor: 0xc8b0ff,
    fillColor: 0x9a7ae8,
    fillOpacity: 0.05,
    ringOpacity: 0.28,
    particleColor: '#d4c0ff',
    linkColor: 0xd8c8ff,
    linkGlow: 0xa888ff,
    activeWhen: (supplier) => (supplier.supplyPerSecond ?? 0) > 0
  }
});

const BOUNDARY_PARTICLE_COUNT = 28;
const LINK_PARTICLE_COUNT = 5;
const _up = new THREE.Vector3(0, 1, 0);
const _start = new THREE.Vector3();
const _end = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();

function profileForSupplier(supplier) {
  return SUPPLIER_VISUAL_PROFILES[supplier?.kind]
    ?? SUPPLIER_VISUAL_PROFILES.default;
}

function supplierGroundY(game, supplier) {
  const gx = supplier.x ?? 0;
  const gz = supplier.z ?? 0;
  if (typeof game?.groundHeightAt === 'function') {
    return game.groundHeightAt(new THREE.Vector3(gx, 0, gz)) + 0.06;
  }
  return 0.06;
}

function supplierLinkAnchor(game, supplier, target) {
  target.set(supplier.x ?? 0, 0, supplier.z ?? 0);
  if (supplier.kind === 'base' && game?.playerBase?.position) {
    target.copy(game.playerBase.position);
    target.y += game.playerBase.statusHeight ?? 2.6;
    return target;
  }
  if (supplier.kind === 'manaFurnace') {
    let furnaceUnit = null;
    game?.fuelPower?.burners?.forEach?.((record) => {
      if (record?.supplierId === supplier.id) furnaceUnit = record.unit;
    });
    if (furnaceUnit?.position) {
      target.copy(furnaceUnit.position);
      target.y += 2.1;
      return target;
    }
  }
  target.y = supplierGroundY(game, supplier) + 2.2;
  return target;
}

function receiverHeadAnchor(unit, target) {
  if (!unit?.position) {
    target.set(0, 0, 0);
    return target;
  }
  const scale = Math.max(1, Number(unit.runtimeStatusHeightScale) || 1);
  let height = 1.62;
  if (Number.isFinite(unit.definition?.statusHeight)) {
    height = unit.definition.statusHeight;
  } else if (unit.type === 'woodPuppet') {
    height = 1.48;
  } else if (unit.isBuilding) {
    height = 2.4;
  }
  target.set(unit.position.x, unit.position.y + height * scale * 0.9, unit.position.z);
  return target;
}

/** 预留：后续箭塔/食堂等接收者也可开连线。 */
export function receiverWantsPowerLink(receiver) {
  if (!receiver?.id) return false;
  if (receiver.isWorker === true) return true;
  // if (receiver.kind === 'building' && receiver.poweredDown !== undefined) return true;
  return false;
}

function nearestSupplierForReceiver(game, receiver) {
  const power = game?.power;
  if (!power) return null;
  const x = receiver.position?.x ?? 0;
  const z = receiver.position?.z ?? 0;
  let best = null;
  power.supplierList().forEach((supplier) => {
    const distance = powerDistance({ x, z }, supplier);
    const radius = Math.max(0, supplier.supplyRadius ?? 0);
    if (distance > radius) return;
    if (!best || distance < best.distance) best = { supplier, distance };
  });
  return best;
}

function createBoundaryParticles(group, color) {
  const particles = [];
  for (let i = 0; i < BOUNDARY_PARTICLE_COUNT; i += 1) {
    const sprite = createSoftParticleSprite(color, {
      opacity: 0.82,
      depthTest: true,
      depthWrite: false
    });
    sprite.scale.set(0.32, 0.32, 1);
    sprite.userData.baseAngle = (i / BOUNDARY_PARTICLE_COUNT) * Math.PI * 2;
    sprite.userData.phase = Math.random() * Math.PI * 2;
    group.add(sprite);
    particles.push(sprite);
  }
  return particles;
}

function createSupplierVisual(supplier, profile) {
  const group = new THREE.Group();
  group.name = `PowerSupply:${supplier.id}`;
  group.userData.supplierId = supplier.id;

  const fillMat = new THREE.MeshBasicMaterial({
    color: profile.fillColor,
    transparent: true,
    opacity: profile.fillOpacity,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 72), fillMat);
  fill.rotation.x = -Math.PI / 2;
  fill.name = 'fill';
  group.add(fill);

  const ringMat = new THREE.MeshBasicMaterial({
    color: profile.ringColor,
    transparent: true,
    opacity: profile.ringOpacity,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.996, 1.004, 80), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.025;
  ring.name = 'ring';
  group.add(ring);

  const particles = createBoundaryParticles(group, profile.particleColor);

  return {
    group,
    fill,
    ring,
    fillMat,
    ringMat,
    particles,
    profile,
    radius: Math.max(0.5, supplier.supplyRadius ?? 20)
  };
}

function createLinkVisual(profile) {
  const root = new THREE.Group();
  root.name = 'PowerLink';

  const coreGeom = new THREE.CylinderGeometry(0.028, 0.038, 1, 6, 1, true);
  const coreMat = new THREE.MeshBasicMaterial({
    color: profile.linkColor,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    toneMapped: false
  });
  const core = new THREE.Mesh(coreGeom, coreMat);
  root.add(core);

  const glowGeom = new THREE.CylinderGeometry(0.06, 0.08, 1, 6, 1, true);
  const glowMat = new THREE.MeshBasicMaterial({
    color: profile.linkGlow,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    toneMapped: false
  });
  const glow = new THREE.Mesh(glowGeom, glowMat);
  root.add(glow);

  const driftParticles = [];
  for (let i = 0; i < LINK_PARTICLE_COUNT; i += 1) {
    const sprite = createSoftParticleSprite(profile.particleColor, {
      opacity: 0.9,
      depthTest: true,
      depthWrite: false
    });
    sprite.scale.set(0.22, 0.22, 1);
    sprite.userData.phase = i / LINK_PARTICLE_COUNT;
    root.add(sprite);
    driftParticles.push(sprite);
  }

  return { root, core, glow, coreMat, glowMat, driftParticles };
}

function updateLinkVisual(link, start, end, time) {
  _dir.copy(end).sub(start);
  const len = _dir.length();
  if (len < 0.08) {
    link.root.visible = false;
    return;
  }
  link.root.visible = true;
  _mid.copy(start).lerp(end, 0.5);
  link.core.position.copy(_mid);
  link.glow.position.copy(_mid);
  link.core.scale.set(1, len, 1);
  link.glow.scale.set(1, len, 1);
  link.core.quaternion.setFromUnitVectors(_up, _dir.normalize());
  link.glow.quaternion.copy(link.core.quaternion);

  const pulse = 0.55 + 0.45 * Math.sin(time * 9);
  link.coreMat.opacity = 0.45 + 0.35 * pulse;
  link.glowMat.opacity = 0.12 + 0.18 * pulse;

  link.driftParticles.forEach((sprite, index) => {
    const t = (sprite.userData.phase + time * 0.35 + index * 0.07) % 1;
    sprite.position.copy(start).lerp(end, t);
    sprite.position.y += Math.sin(time * 6 + index) * 0.06;
    const s = 0.18 + 0.08 * Math.sin(time * 8 + index * 1.3);
    sprite.scale.set(s, s, 1);
  });
}

export class PowerSupplyVisualSystem {
  constructor(game) {
    this.game = game ?? null;
    this.root = new THREE.Group();
    this.root.name = 'PowerSupplyVisuals';
    /** @type {Map<string, object>} */
    this.supplierVisuals = new Map();
    /** @type {Map<string, object>} */
    this.linkVisuals = new Map();
    this.time = 0;
  }

  attach(scene) {
    if (!scene || this.root.parent === scene) return;
    scene.add(this.root);
  }

  destroy() {
    this.supplierVisuals.forEach((entry) => {
      this.root.remove(entry.group);
      disposeGroup(entry.group);
    });
    this.supplierVisuals.clear();
    this.linkVisuals.forEach((entry) => {
      this.root.remove(entry.root);
      disposeGroup(entry.root);
    });
    this.linkVisuals.clear();
    this.root.removeFromParent();
  }

  syncSupplierPositions() {
    const game = this.game;
    const power = game?.power;
    if (!power) return;
    const baseSupplier = power.suppliers?.get?.('player-base');
    if (baseSupplier && game.playerBase?.position) {
      baseSupplier.x = game.playerBase.position.x;
      baseSupplier.z = game.playerBase.position.z;
    }
    game.fuelPower?.burners?.forEach?.((record) => {
      const supplier = record.supplier;
      const unit = record.unit;
      if (!supplier || !unit?.position) return;
      supplier.x = unit.position.x;
      supplier.z = unit.position.z;
    });
  }

  update(dt = 0) {
    const game = this.game;
    if (!game?.scene || game.destroyed) return;
    this.time += Math.max(0, dt);
    this.syncSupplierPositions();
    this.syncSupplierVisuals();
    this.syncLinkVisuals();
  }

  syncSupplierVisuals() {
    const game = this.game;
    const suppliers = game?.power?.supplierList?.() ?? [];
    const seen = new Set();

    suppliers.forEach((supplier) => {
      if (!supplier?.id) return;
      seen.add(supplier.id);
      let entry = this.supplierVisuals.get(supplier.id);
      if (!entry) {
        const profile = profileForSupplier(supplier);
        entry = createSupplierVisual(supplier, profile);
        this.supplierVisuals.set(supplier.id, entry);
        this.root.add(entry.group);
      }
      const radius = Math.max(0.5, supplier.supplyRadius ?? entry.radius);
      entry.radius = radius;
      const profile = entry.profile;
      const active = profile.activeWhen?.(supplier) !== false;
      const strength = active ? 1 : 0.38;

      entry.group.position.set(
        supplier.x ?? 0,
        supplierGroundY(game, supplier),
        supplier.z ?? 0
      );
      entry.fill.scale.set(radius, radius, 1);
      entry.ring.scale.set(radius, radius, 1);
      entry.fillMat.opacity = profile.fillOpacity * strength;
      entry.ringMat.opacity = profile.ringOpacity * strength;

      const t = this.time;
      entry.particles.forEach((sprite, index) => {
        const angle = sprite.userData.baseAngle + t * 0.12;
        const wobble = Math.sin(t * 2.4 + sprite.userData.phase) * 0.1;
        const r = radius + wobble;
        sprite.position.set(
          Math.cos(angle) * r,
          0.1 + Math.sin(t * 3.2 + index * 0.4) * 0.05,
          Math.sin(angle) * r
        );
        const s = 0.26 + 0.1 * (0.5 + 0.5 * Math.sin(t * 4 + index));
        sprite.scale.set(s * strength, s * strength, 1);
        sprite.material.opacity = 0.55 * strength + 0.35 * (0.5 + 0.5 * Math.sin(t * 5 + index));
      });
    });

    [...this.supplierVisuals.entries()].forEach(([id, entry]) => {
      if (seen.has(id)) return;
      this.root.remove(entry.group);
      disposeGroup(entry.group);
      this.supplierVisuals.delete(id);
    });
  }

  syncLinkVisuals() {
    const game = this.game;
    const power = game?.power;
    if (!power) return;
    const seen = new Set();
    const entries = [...power.receivers.values()];

    entries.forEach((reg) => {
      const receiver = reg.receiver;
      if (!receiver?.id || !receiverWantsPowerLink(receiver)) return;
      if (!receiver.alive && receiver.alive !== undefined) return;

      const capacity = Math.max(0, receiver.manaCapacity ?? 0);
      const stored = Math.max(0, receiver.activityMana ?? 0);
      if (capacity <= 0 || stored >= capacity - 0.05) return;

      const nearest = nearestSupplierForReceiver(game, receiver);
      if (!nearest) return;

      const supplier = nearest.supplier;
      const profile = profileForSupplier(supplier);
      const key = String(receiver.id);
      seen.add(key);

      let link = this.linkVisuals.get(key);
      if (!link) {
        link = createLinkVisual(profile);
        this.linkVisuals.set(key, link);
        this.root.add(link.root);
      }

      receiverHeadAnchor(receiver, _start);
      supplierLinkAnchor(game, supplier, _end);
      updateLinkVisual(link, _start, _end, this.time);
    });

    [...this.linkVisuals.entries()].forEach(([id, link]) => {
      if (seen.has(id)) return;
      this.root.remove(link.root);
      disposeGroup(link.root);
      this.linkVisuals.delete(id);
    });
  }
}

function disposeGroup(object) {
  object.traverse((node) => {
    if (node.geometry && !node.geometry.userData?.sharedEffectResource) {
      node.geometry.dispose?.();
    }
    if (node.material) {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        if (material?.map?.userData?.sharedEffectResource) return;
        material.dispose?.();
      });
    }
  });
}
