import * as THREE from 'three';
import { basicMat, mat } from '../art/lowpoly.js';
import { createAreaEffectVisual, updateAreaEffectVisual } from '../art/areaEffectVisual.js';
import { createSpellModel } from '../art/visualRegistry.js';
import { createSoftParticleMaterial, createSoftParticleSprite } from '../art/vfxMaterials.js';
import { disposeObject3D } from '../utils/dispose.js';
import { clamp, lerp } from '../utils/math.js';

const MAX_ACTIVE_EFFECTS = 260;
const MAX_POOLED_EFFECTS_PER_KEY = 56;
const LIGHTNING_MAX_SEGMENTS = 9;
const LIGHTNING_UP_AXIS = new THREE.Vector3(0, 1, 0);
const METEOR_TRAIL_AXIS = new THREE.Vector3(0, 1, 0);
const RECOVERY_PULSE_INTERVAL_SECONDS = 1;

export class EffectsSystem {
  constructor(scene) {
    this.scene = scene;
    this.effects = [];
    this.effectPools = new Map();
    this.damageNumberTextureCache = new Map();
    this.recoveryTimer = 0;
    this.recoveryAura = null;
  }

  update(dt) {
    this.recoveryTimer -= dt;
    this.updateRecoveryAura(dt);
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i];
      effect.age += dt;
      effect.update?.(dt, effect.age / effect.duration);
      if (effect.age >= effect.duration) {
        this.removeEffectAt(i);
      }
    }
  }

  addEffect(object, duration, update, dispose) {
    while (this.effects.length >= MAX_ACTIVE_EFFECTS) {
      this.removeEffectAt(0);
    }
    if (!object.userData?.preserveRenderLayers) {
      object.traverse((child) => {
        child.layers.set(1);
      });
    }
    this.scene.add(object);
    this.effects.push({
      object,
      duration,
      age: 0,
      update,
      dispose
    });
  }

  removeEffectAt(index) {
    const effect = this.effects[index];
    if (!effect) return;
    const shouldDispose = effect.dispose?.() !== false;
    this.scene.remove(effect.object);
    if (shouldDispose) {
      disposeObject3D(effect.object);
    }
    this.effects.splice(index, 1);
  }

  acquirePooledEffect(key, factory) {
    const pool = this.effectPools.get(key);
    const object = pool?.pop() ?? factory();
    object.visible = true;
    object.position.set(0, 0, 0);
    object.rotation.set(0, 0, 0);
    object.quaternion.identity();
    object.scale.set(1, 1, 1);
    object.traverse?.((child) => {
      child.visible = true;
    });
    return object;
  }

  releasePooledEffect(key, object) {
    object.visible = false;
    object.parent?.remove(object);
    const pool = this.effectPools.get(key) ?? [];
    if (pool.length < MAX_POOLED_EFFECTS_PER_KEY) {
      pool.push(object);
      this.effectPools.set(key, pool);
    } else {
      disposeObject3D(object);
    }
    return false;
  }

  acquireParticleGroup(key, count, factory) {
    return this.acquirePooledEffect(key, () => {
      const group = new THREE.Group();
      for (let i = 0; i < count; i += 1) {
        group.add(factory());
      }
      return group;
    });
  }

  destroy() {
    this.clearRecoveryAura();
    while (this.effects.length > 0) {
      this.removeEffectAt(this.effects.length - 1);
    }
    this.effectPools.forEach((pool) => {
      pool.forEach((object) => disposeObject3D(object));
    });
    this.effectPools.clear();
    this.damageNumberTextureCache.forEach((entry) => entry.texture.dispose());
    this.damageNumberTextureCache.clear();
  }

  spawnRing(position, color = '#ffffff', radius = 1, duration = 0.55) {
    const poolKey = 'ring';
    const ring = this.acquirePooledEffect(poolKey, () => new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 42),
      basicMat('#ffffff', {
        transparent: true,
        opacity: 0.76,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false
      }).clone()
    ));
    ring.material.color.set(color);
    ring.material.opacity = 0.76;
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, (position.y ?? 0) + 0.08, position.z);
    ring.renderOrder = 1500;
    ring.scale.setScalar(radius);
    this.addEffect(ring, duration, (_, t) => {
      ring.scale.setScalar(radius * (1 + t * 0.45));
      ring.material.opacity = 0.76 * (1 - t);
    }, () => this.releasePooledEffect(poolKey, ring));
  }

  spawnYellowShockwave(position, radius = 5) {
    if (!position) return false;
    const poolKey = 'yellow-shockwave';
    const group = this.acquirePooledEffect(poolKey, () => {
      const root = new THREE.Group();
      root.userData.isYellowShockwave = true;
      const outer = new THREE.Mesh(
        new THREE.RingGeometry(0.82, 1, 44),
        basicMat('#ffe36a', {
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false
        }).clone()
      );
      const inner = new THREE.Mesh(
        new THREE.RingGeometry(0.48, 0.66, 40),
        outer.material.clone()
      );
      outer.rotation.x = -Math.PI / 2;
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = 0.016;
      const sparks = [];
      for (let index = 0; index < 10; index += 1) {
        const spark = createSoftParticleSprite(index % 2 === 0 ? '#fff1a0' : '#f3c83f', {
          falloff: 'tight',
          opacity: 0,
          depthTest: true,
          toneMapped: false
        });
        spark.userData.angle = (index / 10) * Math.PI * 2 + (index % 2) * 0.17;
        spark.userData.phase = index / 10;
        sparks.push(spark);
        root.add(spark);
      }
      root.add(outer, inner);
      root.userData.parts = { outer, inner, sparks };
      return root;
    });
    const effectRadius = Math.max(0.2, Number(radius) || 5);
    const { outer, inner, sparks } = group.userData.parts;
    group.position.set(position.x, (position.y ?? 0) + 0.09, position.z);
    outer.scale.setScalar(0.08);
    inner.scale.setScalar(0.06);
    outer.material.opacity = 0;
    inner.material.opacity = 0;
    sparks.forEach((spark) => {
      spark.position.set(0, 0.06, 0);
      spark.scale.setScalar(0.02);
      spark.material.opacity = 0;
    });
    this.addEffect(group, 0.62, (_, t) => {
      const burst = Math.min(1, t / 0.12);
      const fade = 1 - Math.max(0, (t - 0.46) / 0.54);
      const easeOut = 1 - (1 - t) ** 3;
      outer.scale.setScalar(effectRadius * (0.08 + easeOut * 0.92));
      inner.scale.setScalar(effectRadius * (0.04 + easeOut * 0.72));
      outer.material.opacity = burst * fade * 0.82;
      inner.material.opacity = burst * fade * 0.46;
      sparks.forEach((spark) => {
        const distance = effectRadius * (0.12 + easeOut * (0.68 + spark.userData.phase * 0.2));
        spark.position.set(
          Math.cos(spark.userData.angle) * distance,
          0.08 + Math.sin(t * Math.PI) * (0.22 + spark.userData.phase * 0.16),
          Math.sin(spark.userData.angle) * distance
        );
        const scale = effectRadius * (0.026 + (1 - t) * 0.026);
        spark.scale.set(scale, scale * 0.72, 1);
        spark.material.opacity = burst * fade * (0.44 + spark.userData.phase * 0.28);
      });
    }, () => this.releasePooledEffect(poolKey, group));
    return true;
  }

  spawnSolarFlarePulse(position, radius = 5) {
    if (!position) return false;
    const poolKey = 'solar-flare-pulse';
    const group = this.acquirePooledEffect(poolKey, () => {
      const root = new THREE.Group();
      root.userData.isSolarFlarePulse = true;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.74, 1, 44),
        basicMat('#ffb43b', {
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false
        }).clone()
      );
      ring.rotation.x = -Math.PI / 2;
      const flames = [];
      for (let index = 0; index < 9; index += 1) {
        const flame = createSoftParticleSprite(index % 3 === 0 ? '#fff078' : '#ff9e31', {
          falloff: 'tight',
          opacity: 0,
          depthTest: true,
          toneMapped: false
        });
        flame.userData.angle = (index / 9) * Math.PI * 2;
        flame.userData.phase = index / 9;
        flames.push(flame);
        root.add(flame);
      }
      root.add(ring);
      root.userData.parts = { ring, flames };
      return root;
    });
    const effectRadius = Math.max(0.2, Number(radius) || 5);
    const { ring, flames } = group.userData.parts;
    group.position.set(position.x, (position.y ?? 0) + 0.09, position.z);
    ring.scale.setScalar(effectRadius * 0.18);
    ring.material.opacity = 0;
    flames.forEach((flame) => {
      flame.position.set(0, 0.1, 0);
      flame.scale.setScalar(0.02);
      flame.material.opacity = 0;
    });
    this.addEffect(group, 0.7, (_, t) => {
      const appear = Math.min(1, t / 0.14);
      const fade = 1 - Math.max(0, (t - 0.5) / 0.5);
      const expansion = 1 - (1 - t) ** 2;
      ring.scale.setScalar(effectRadius * (0.18 + expansion * 0.82));
      ring.material.opacity = appear * fade * 0.58;
      flames.forEach((flame) => {
        const distance = effectRadius * (0.12 + expansion * (0.72 + flame.userData.phase * 0.12));
        flame.position.set(
          Math.cos(flame.userData.angle) * distance,
          0.08 + Math.sin(t * Math.PI) * (0.42 + flame.userData.phase * 0.22),
          Math.sin(flame.userData.angle) * distance
        );
        const scale = effectRadius * (0.032 + Math.sin(t * Math.PI) * 0.024);
        flame.scale.set(scale * 0.72, scale * 1.35, 1);
        flame.material.opacity = appear * fade * (0.42 + flame.userData.phase * 0.38);
      });
    }, () => this.releasePooledEffect(poolKey, group));
    return true;
  }

  spawnFirework(position, radius = 7) {
    if (!position) return false;
    const poolKey = 'enchantment-firework';
    const group = this.acquirePooledEffect(poolKey, () => {
      const root = new THREE.Group();
      root.userData.isEnchantmentFirework = true;
      const core = createSoftParticleSprite('#fff7c2', {
        falloff: 'tight',
        opacity: 0,
        depthTest: true,
        toneMapped: false
      });
      const colors = ['#ff6fb5', '#ffe36a', '#72e6ff', '#ff9a4d'];
      const sparks = [];
      for (let index = 0; index < 16; index += 1) {
        const angle = (index / 16) * Math.PI * 2;
        const lift = 0.16 + (index % 5) * 0.13;
        const horizontal = Math.sqrt(Math.max(0.12, 1 - lift * lift));
        const spark = createSoftParticleSprite(colors[index % colors.length], {
          falloff: 'tight',
          opacity: 0,
          depthTest: true,
          toneMapped: false
        });
        spark.userData.direction = new THREE.Vector3(
          Math.cos(angle) * horizontal,
          lift,
          Math.sin(angle) * horizontal
        ).normalize();
        spark.userData.phase = index / 16;
        sparks.push(spark);
        root.add(spark);
      }
      root.add(core);
      root.userData.parts = { core, sparks };
      return root;
    });
    const visualRadius = clamp((Number(radius) || 7) * 0.3, 1.35, 2.4);
    const { core, sparks } = group.userData.parts;
    group.position.set(position.x, position.y ?? 1.8, position.z);
    core.position.set(0, 0, 0);
    core.scale.setScalar(0.05);
    core.material.opacity = 0;
    sparks.forEach((spark) => {
      spark.position.set(0, 0, 0);
      spark.scale.setScalar(0.03);
      spark.material.opacity = 0;
    });
    this.addEffect(group, 0.86, (_, t) => {
      const flash = 1 - Math.min(1, t / 0.24);
      const appear = Math.min(1, t / 0.08);
      const fade = 1 - Math.max(0, (t - 0.48) / 0.52);
      core.scale.setScalar(visualRadius * (0.12 + flash * 0.26));
      core.material.opacity = appear * flash * 0.92;
      sparks.forEach((spark) => {
        const phase = spark.userData.phase;
        const travel = visualRadius * (0.08 + (1 - (1 - t) ** 2) * (0.72 + phase * 0.2));
        spark.position.copy(spark.userData.direction).multiplyScalar(travel);
        spark.position.y -= visualRadius * t * t * (0.18 + phase * 0.12);
        const scale = visualRadius * (0.045 + (1 - t) * 0.035);
        spark.scale.set(scale * 0.68, scale * 1.2, 1);
        spark.material.opacity = appear * fade * (0.58 + phase * 0.36);
      });
    }, () => this.releasePooledEffect(poolKey, group));
    return true;
  }

  spawnUnitUpgrade(position, options = {}) {
    if (!position) return false;
    const poolKey = 'unit-upgrade';
    const group = this.acquirePooledEffect(poolKey, () => {
      const root = new THREE.Group();
      const orbitBeams = [
        { radius: 0.94, y: 0.3, tiltX: 0.08, tiltY: -0.12, direction: 1, phase: 0.04 },
        { radius: 0.78, y: 0.64, tiltX: -0.16, tiltY: 0.18, direction: -1, phase: 0.38 },
        { radius: 0.62, y: 0.98, tiltX: 0.14, tiltY: 0.1, direction: 1, phase: 0.7 }
      ].map((config, index) => {
        const beam = new THREE.Mesh(
          new THREE.RingGeometry(0.84, 1, 52),
          createUpgradeOrbitBeamMaterial('#ffd166')
        );
        beam.rotation.set(-Math.PI / 2 + config.tiltX, config.tiltY, 0);
        beam.position.y = config.y;
        beam.renderOrder = 0;
        beam.userData.isUnitUpgradeOrbitBeam = true;
        beam.userData.baseY = config.y;
        beam.userData.baseScale = config.radius * (0.82 + index * 0.02);
        beam.userData.baseRotation = beam.rotation.clone();
        beam.userData.direction = config.direction;
        beam.userData.phase = config.phase;
        root.add(beam);
        return beam;
      });

      const sparkles = [];
      for (let index = 0; index < 8; index += 1) {
        const sparkle = new THREE.Sprite(createUpgradeSparkleMaterial('#ffd166'));
        sparkle.renderOrder = 0;
        sparkle.userData.isUnitUpgradeSparkle = true;
        sparkle.userData.angle = (index / 8) * Math.PI * 2;
        sparkle.userData.phase = ((index * 5) % 8) / 8;
        sparkle.userData.heightOffset = 0.24 + (index % 4) * 0.2;
        root.add(sparkle);
        sparkles.push(sparkle);
      }

      root.userData.preserveRenderLayers = true;
      root.traverse((child) => {
        child.layers.set(0);
        child.renderOrder = 0;
        if (child.material) {
          child.material.depthTest = true;
          child.material.depthWrite = false;
        }
      });
      root.userData.parts = {
        orbitBeams,
        sparkles
      };
      root.userData.unitUpgradeVisual = {
        orbitBeamCount: orbitBeams.length,
        sparkleCount: sparkles.length,
        renderLayer: 0
      };
      return root;
    });

    const color = options.color ?? '#ffd166';
    const radius = Math.max(0.55, Number(options.radius) || 0.82);
    const height = Math.max(0.8, Number(options.height) || 1.55);
    const duration = Math.max(0.35, Number(options.duration) || 0.9);
    const parts = group.userData.parts;
    group.position.set(position.x, (position.y ?? 0) + 0.02, position.z);
    group.scale.set(radius, height / 1.55, radius);
    parts.orbitBeams.forEach((beam) => {
      beam.material.uniforms.uColor.value.set(color);
      beam.material.uniforms.uOpacity.value = 0;
      beam.material.uniforms.uPhase.value = beam.userData.phase;
      beam.position.y = beam.userData.baseY;
      beam.rotation.copy(beam.userData.baseRotation);
      beam.scale.setScalar(beam.userData.baseScale);
    });
    parts.sparkles.forEach((sparkle) => {
      sparkle.material.uniforms.uColor.value.set(color);
      sparkle.material.uniforms.uOpacity.value = 0;
      const angle = sparkle.userData.angle;
      sparkle.position.set(
        Math.cos(angle) * 0.68,
        sparkle.userData.heightOffset,
        Math.sin(angle) * 0.68
      );
      sparkle.scale.setScalar(0.01);
    });

    this.addEffect(group, duration, (_, t) => {
      const appear = Math.min(1, t / 0.14);
      const fade = 1 - Math.max(0, (t - 0.68) / 0.32);
      const envelope = appear * fade;
      parts.orbitBeams.forEach((beam, index) => {
        const direction = beam.userData.direction;
        const pulse = 0.88 + Math.sin((t * 2.4 + beam.userData.phase) * Math.PI * 2) * 0.12;
        beam.material.uniforms.uPhase.value = beam.userData.phase + direction * t * 1.36;
        beam.material.uniforms.uOpacity.value = envelope * pulse * (0.78 - index * 0.08);
        beam.position.y = beam.userData.baseY + t * 0.16 + Math.sin((t + index * 0.21) * Math.PI * 2) * 0.035;
        beam.rotation.y = beam.userData.baseRotation.y + direction * t * (0.58 + index * 0.12);
        const beamScale = beam.userData.baseScale + Math.sin(t * Math.PI) * (0.18 - index * 0.025);
        beam.scale.setScalar(beamScale);
      });
      parts.sparkles.forEach((sparkle, index) => {
        const phase = sparkle.userData.phase;
        const angle = sparkle.userData.angle + t * (1.7 + (index % 3) * 0.2);
        const orbit = 0.62 + Math.sin((t + phase) * Math.PI * 2) * 0.09;
        const flash = Math.max(0, Math.sin((t * 2.35 + phase) * Math.PI * 2));
        sparkle.position.x = Math.cos(angle) * orbit;
        sparkle.position.z = Math.sin(angle) * orbit;
        sparkle.position.y = sparkle.userData.heightOffset + t * 0.42 + Math.sin(angle * 1.7) * 0.06;
        sparkle.material.uniforms.uOpacity.value = envelope * (0.16 + flash * 0.84);
        sparkle.scale.setScalar((0.055 + flash * 0.16) * appear * Math.max(0.15, fade));
      });
    }, () => this.releasePooledEffect(poolKey, group));
    return true;
  }

  spawnRootWarning(position, radius = 4.8, duration = 0.72) {
    const group = new THREE.Group();
    group.position.set(position.x, (position.y ?? 0) + 0.075, position.z);
    const ringMaterial = basicMat('#9ebf68', {
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false
    }).clone();
    const innerMaterial = ringMaterial.clone();
    innerMaterial.color.set('#5f7f4a');
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.88, radius, 40), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 1510;
    const inner = new THREE.Mesh(new THREE.RingGeometry(radius * 0.48, radius * 0.55, 32), innerMaterial);
    inner.rotation.x = -Math.PI / 2;
    inner.renderOrder = 1510;
    group.add(ring, inner);
    this.addEffect(group, Math.max(0.2, duration), (_, t) => {
      const pulse = 0.82 + Math.sin(t * Math.PI * 5) * 0.08;
      ring.scale.setScalar(pulse);
      inner.scale.setScalar(0.9 + t * 0.1);
      ringMaterial.opacity = 0.22 + t * 0.46;
      innerMaterial.opacity = 0.18 + t * 0.34;
    });
  }

  spawnRootEruption(position, radius = 4.8) {
    const group = new THREE.Group();
    group.position.set(position.x, (position.y ?? 0) + 0.04, position.z);
    const rootMaterial = mat('#46513a', { roughness: 0.96 }).clone();
    const mossMaterial = mat('#789451', { roughness: 0.92 }).clone();
    const shardCount = 13;
    for (let index = 0; index < shardCount; index += 1) {
      const angle = (index / shardCount) * Math.PI * 2 + (index % 2) * 0.14;
      const distance = radius * (0.34 + ((index * 7) % 11) / 16);
      const height = 0.7 + ((index * 5) % 7) * 0.16;
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.16 + (index % 3) * 0.035, height, 5),
        index % 4 === 0 ? mossMaterial : rootMaterial
      );
      spike.position.set(Math.cos(angle) * distance, height * 0.5, Math.sin(angle) * distance);
      spike.rotation.z = Math.cos(angle) * 0.32;
      spike.rotation.x = -Math.sin(angle) * 0.32;
      spike.scale.y = 0.02;
      group.add(spike);
    }
    const ringMaterial = basicMat('#b8cf72', {
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false
    }).clone();
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.58, radius * 0.72, 40), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 1512;
    group.add(ring);
    this.addEffect(group, 0.62, (_, t) => {
      const rise = Math.min(1, t / 0.28);
      const sink = 1 - Math.max(0, (t - 0.68) / 0.32);
      group.children.forEach((child) => {
        if (child === ring) return;
        child.scale.y = Math.max(0.02, rise * sink);
      });
      ring.scale.setScalar(0.72 + t * 0.78);
      ringMaterial.opacity = (1 - t) * 0.68;
    });
  }

  spawnLightningChain(start, end, options = {}) {
    if (!start || !end) return;
    const distance = start.distanceTo(end);
    if (distance < 0.05) return;
    const color = options.color ?? '#bba8ff';
    const duration = Math.max(0.08, options.duration ?? 0.2);
    const points = lightningPoints(start, end, distance);
    const poolKey = `lightning-chain:${LIGHTNING_MAX_SEGMENTS}`;
    const group = this.acquirePooledEffect(poolKey, () => {
      const effect = new THREE.Group();
      const segmentGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
      const haloMaterial = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });
      const coreMaterial = haloMaterial.clone();
      coreMaterial.opacity = 0.98;
      const segments = Array.from({ length: LIGHTNING_MAX_SEGMENTS }, () => (
        createLightningSegmentNode(segmentGeometry, haloMaterial, coreMaterial)
      ));
      segments.forEach((segment) => effect.add(segment));
      const impactMaterial = haloMaterial.clone();
      impactMaterial.opacity = 0.95;
      const impact = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.11, 0),
        impactMaterial
      );
      impact.renderOrder = 1882;
      effect.add(impact);
      effect.userData.lightningSegments = segments;
      effect.userData.lightningHaloMaterial = haloMaterial;
      effect.userData.lightningCoreMaterial = coreMaterial;
      effect.userData.lightningImpact = impact;
      effect.userData.lightningImpactMaterial = impactMaterial;
      return effect;
    });
    const segments = group.userData.lightningSegments;
    const haloMaterial = group.userData.lightningHaloMaterial;
    const coreMaterial = group.userData.lightningCoreMaterial;
    const impact = group.userData.lightningImpact;
    const impactMaterial = group.userData.lightningImpactMaterial;
    const sourceColor = new THREE.Color(color);
    haloMaterial.color.copy(sourceColor).multiplyScalar(3.2);
    coreMaterial.color.setRGB(6.2, 5.8, 8.4);
    impactMaterial.color.setRGB(6.6, 5.9, 8.8);
    haloMaterial.opacity = 0.38;
    coreMaterial.opacity = 0.98;
    impactMaterial.opacity = 0.95;
    const thickness = Math.max(0.6, Number(options.thickness) || 1);
    const haloRadius = 0.075 * thickness;
    const coreRadius = 0.028 * thickness;
    const direction = new THREE.Vector3();
    const midpoint = new THREE.Vector3();
    segments.forEach((segment, index) => {
      const visible = index < points.length - 1;
      segment.visible = visible;
      if (!visible) return;
      setLightningSegmentTransform(
        segment,
        points[index],
        points[index + 1],
        haloRadius,
        coreRadius,
        direction,
        midpoint
      );
    });
    impact.position.copy(end);
    impact.scale.setScalar(1);
    group.userData.lightningChainVisual = {
      segmentCount: points.length - 1,
      haloRadius,
      coreRadius,
      hdrIntensity: 6.2
    };
    this.addEffect(group, duration, (_, t) => {
      const fade = Math.max(0, 1 - t * t);
      haloMaterial.opacity = 0.38 * fade;
      coreMaterial.opacity = 0.98 * fade;
      impactMaterial.opacity = 0.95 * fade;
      impact.scale.setScalar(1 + t * 2.2);
      impact.rotation.y += 0.24;
    }, () => this.releasePooledEffect(poolKey, group));
    if (options.impactRadius > 0) {
      this.spawnRing(end, color, options.impactRadius, Math.min(0.42, duration + 0.12));
    }
  }

  spawnThunderCloud(state) {
    if (!state?.position) return;
    const ability = state.ability ?? {};
    const duration = Math.max(0.1, ability.duration ?? 10);
    const height = Math.max(2.6, ability.height ?? 5.1);
    const visualScale = Math.max(0.1, Number(ability.visualScale) || 1);
    const group = new THREE.Group();
    const cloudMaterial = mat('#1d2539', {
      transparent: true,
      opacity: 0.94,
      emissive: '#161c35',
      emissiveIntensity: 0.44,
      depthWrite: false
    }).clone();
    const cloudLightMaterial = mat('#3f4a68', {
      transparent: true,
      opacity: 0.9,
      emissive: '#5e5598',
      emissiveIntensity: 0.54,
      depthWrite: false
    }).clone();
    const cloudUndersideMaterial = mat('#101627', {
      transparent: true,
      opacity: 0.96,
      emissive: '#352e66',
      emissiveIntensity: 0.42,
      depthWrite: false
    }).clone();
    [cloudMaterial, cloudLightMaterial, cloudUndersideMaterial].forEach((material) => {
      material.flatShading = true;
      material.needsUpdate = true;
    });
    const lobeSpecs = [
      [-0.94, 0.02, 0.02, 0.76, 0.62, 0.78, 0],
      [-0.67, 0.22, -0.18, 0.92, 0.76, 0.86, 1],
      [-0.32, 0.34, -0.13, 1.02, 0.84, 0.92, 0],
      [0.08, 0.4, -0.08, 1.08, 0.88, 0.96, 1],
      [0.48, 0.28, -0.17, 0.96, 0.8, 0.9, 0],
      [0.84, 0.08, -0.02, 0.78, 0.64, 0.78, 1],
      [-0.76, -0.05, 0.34, 0.78, 0.68, 0.86, 0],
      [-0.42, 0.08, 0.42, 0.94, 0.76, 0.94, 1],
      [-0.02, 0.1, 0.45, 1.06, 0.8, 0.98, 0],
      [0.4, 0.06, 0.4, 0.96, 0.74, 0.92, 1],
      [0.73, -0.06, 0.27, 0.78, 0.64, 0.8, 0],
      [-0.45, -0.17, 0.03, 0.9, 0.56, 0.9, 2],
      [-0.05, -0.22, 0.08, 1.02, 0.58, 0.94, 2],
      [0.38, -0.17, 0.05, 0.9, 0.56, 0.88, 2],
      [0.02, 0.05, -0.4, 0.9, 0.72, 0.86, 0]
    ];
    const cloudMaterials = [cloudMaterial, cloudLightMaterial, cloudUndersideMaterial];
    const cloudLobeGeometry = new THREE.DodecahedronGeometry(0.68, 0);
    const lobes = lobeSpecs.map(([x, y, z, sx, sy, sz, materialIndex], index) => {
      const lobe = new THREE.Mesh(
        cloudLobeGeometry,
        cloudMaterials[materialIndex] ?? cloudMaterial
      );
      lobe.position.set(x * visualScale, height + y * visualScale, z * visualScale);
      lobe.scale.set(sx * visualScale, sy * visualScale, sz * visualScale);
      lobe.userData.basePosition = lobe.position.clone();
      lobe.userData.baseScale = lobe.scale.clone();
      lobe.userData.stormPhase = index * 0.67;
      lobe.userData.stormOrbit = (0.025 + (index % 4) * 0.012) * visualScale;
      lobe.userData.isThunderCloudLobe = true;
      lobe.renderOrder = 1870;
      return lobe;
    });
    const groundShadowMaterial = basicMat('#111322', {
      transparent: true,
      opacity: 0.11,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true
    }).clone();
    const groundShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 28),
      groundShadowMaterial
    );
    groundShadow.rotation.x = -Math.PI / 2;
    groundShadow.position.set(0, 0.045, 0.08 * visualScale);
    groundShadow.scale.set(1.18 * visualScale, 0.88 * visualScale, 1);
    groundShadow.userData.baseScale = groundShadow.scale.clone();
    groundShadow.userData.isThunderCloudShadow = true;
    const glow = createSoftParticleSprite('#c3b4ff', {
      opacity: 0.18,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    glow.material.color.multiplyScalar(3.2);
    glow.position.y = height - 0.08 * visualScale;
    glow.scale.set(1.8 * visualScale, 1.18 * visualScale, 1);
    glow.userData.baseScale = glow.scale.clone();
    glow.renderOrder = 1869;

    const boltLayouts = [
      [[-0.84, 0.16, 0.08], [-0.56, -0.08, 0.16], [-0.24, 0.12, 0.02], [0.05, -0.12, 0.12]],
      [[-0.34, 0.34, -0.2], [-0.1, 0.06, -0.08], [0.18, 0.28, -0.16], [0.46, -0.02, -0.04]],
      [[0.1, -0.04, 0.34], [0.34, 0.18, 0.22], [0.62, -0.08, 0.28], [0.82, 0.1, 0.08]],
      [[-0.54, -0.14, 0.34], [-0.28, 0.1, 0.22], [0.04, -0.08, 0.28], [0.32, 0.14, 0.12]]
    ];
    const boltGeometry = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    const bolts = boltLayouts.map((layout, index) => {
      const haloMaterial = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });
      haloMaterial.color.setRGB(2.5, 2.2, 4.8);
      const coreMaterial = haloMaterial.clone();
      coreMaterial.color.setRGB(6.4, 6, 8.8);
      coreMaterial.opacity = 0.12;
      const points = layout.map(([x, y, z]) => new THREE.Vector3(
        x * visualScale,
        height + y * visualScale,
        z * visualScale
      ));
      const bolt = createSegmentedLightningArc(points, {
        geometry: boltGeometry,
        haloMaterial,
        coreMaterial,
        haloRadius: 0.032 * visualScale,
        coreRadius: 0.012 * visualScale
      });
      bolt.userData.stormPhase = index * 1.63;
      bolt.userData.haloMaterial = haloMaterial;
      bolt.userData.coreMaterial = coreMaterial;
      bolt.userData.isThunderCloudBolt = true;
      bolt.renderOrder = 1874 + index;
      return bolt;
    });
    const flashCoreMaterial = basicMat('#ffffff', {
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      depthTest: false,
      toneMapped: false
    }).clone();
    flashCoreMaterial.color.setRGB(4.8, 4.2, 7.8);
    flashCoreMaterial.blending = THREE.AdditiveBlending;
    const flashCore = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.28 * visualScale, 0),
      flashCoreMaterial
    );
    flashCore.position.set(0, height - 0.46 * visualScale, 0.04 * visualScale);
    flashCore.renderOrder = 1873;
    flashCore.userData.stormFlashCore = true;
    group.userData.thunderCloudVisual = {
      lobeCount: lobes.length,
      boltCount: bolts.length,
      shadowCount: 1,
      polygonal: true,
      shadowShape: 'ellipse'
    };
    group.add(groundShadow, glow, ...lobes, flashCore, ...bolts);
    this.addEffect(group, duration, (dt, progress) => {
      group.position.copy(state.position);
      // Host 持有的雷云状态会持续更新 age；Client 只收到一次生成事件，
      // 因此还要用本地特效进度驱动动画，避免联机雷云停在首帧。
      const visualAge = Math.max(Number(state.age) || 0, progress * duration);
      const fade = Math.min(1, progress * 6, (1 - progress) * 2.4);
      lobes.forEach((lobe) => {
        const phase = lobe.userData.stormPhase ?? 0;
        const basePosition = lobe.userData.basePosition;
        const orbit = lobe.userData.stormOrbit ?? 0;
        lobe.position.set(
          basePosition.x + Math.cos(visualAge * 0.82 + phase) * orbit,
          basePosition.y + Math.sin(visualAge * 1.7 + phase) * 0.075 * visualScale,
          basePosition.z + Math.sin(visualAge * 0.74 + phase) * orbit
        );
        lobe.rotation.y += dt * (0.16 + (phase % 1.4) * 0.08);
        lobe.rotation.z = Math.sin(visualAge * 0.74 + phase) * 0.085;
        const swell = 1 + Math.sin(visualAge * 1.34 + phase) * 0.045;
        lobe.scale.copy(lobe.userData.baseScale).multiplyScalar(swell);
      });
      const flashes = bolts.map((bolt) => {
        const phase = bolt.userData.stormPhase ?? 0;
        const flash = Math.pow(Math.max(0, Math.sin(visualAge * 6.4 + phase)), 12);
        bolt.userData.haloMaterial.opacity = (0.025 + flash * 0.52) * fade;
        bolt.userData.coreMaterial.opacity = (0.035 + flash * 0.98) * fade;
        bolt.position.x = Math.sin(visualAge * 1.8 + phase) * 0.025 * visualScale;
        bolt.rotation.y = Math.sin(visualAge * 1.2 + phase) * 0.08;
        return flash;
      });
      const strongestFlash = Math.max(...flashes, 0);
      const pulse = 0.96 + Math.sin(visualAge * 2.7) * 0.045 + strongestFlash * 0.14;
      glow.scale.copy(glow.userData.baseScale).multiplyScalar(pulse);
      glow.material.opacity = (0.08 + strongestFlash * 0.34) * fade;
      groundShadowMaterial.opacity = (0.08 + strongestFlash * 0.035) * fade;
      const shadowPulse = 1 + Math.sin(visualAge * 0.9) * 0.025;
      groundShadow.scale.copy(groundShadow.userData.baseScale).multiplyScalar(shadowPulse);
      flashCore.material.opacity = (0.12 + strongestFlash * 0.86) * fade;
      flashCore.scale.setScalar(0.8 + strongestFlash * 1.45);
      flashCore.rotation.y += dt * (0.8 + strongestFlash * 1.4);
      cloudMaterial.opacity = 0.94 * fade;
      cloudLightMaterial.opacity = (0.84 + strongestFlash * 0.1) * fade;
      cloudUndersideMaterial.opacity = 0.96 * fade;
      cloudLightMaterial.emissiveIntensity = 0.5 + strongestFlash * 1.45;
      cloudUndersideMaterial.emissiveIntensity = 0.4 + strongestFlash * 1.2;
    });
  }

  spawnNetworkAreaEffect(state) {
    if (!state?.id || !Array.isArray(state.position)) return false;
    if (this.effects.some((effect) => effect.networkAreaEffectId === state.id)) return true;
    const radius = Math.max(0.1, Number(state.radius) || 1);
    const duration = Math.max(0.01, Number(state.remaining) || 0.01);
    const kind = state.kind ?? 'fog';
    const object = createAreaEffectVisual({
      radius,
      kind,
      color: state.color ?? '#ffffff',
      accent: state.accent ?? '#ffffff'
    });
    object.position.set(
      Number(state.position[0]) || 0,
      Number(state.position[1]) || 0,
      Number(state.position[2]) || 0
    );
    this.addEffect(object, duration, (dt, progress) => {
      updateAreaEffectVisual(object, {
        age: progress * duration,
        duration,
        radius,
        kind
      }, dt);
    });
    this.effects[this.effects.length - 1].networkAreaEffectId = state.id;
    return true;
  }

  replaceNetworkAreaEffects(states = []) {
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      if (this.effects[i].networkAreaEffectId) this.removeEffectAt(i);
    }
    states.forEach((state) => this.spawnNetworkAreaEffect(state));
  }

  spawnMoveDestination(position, radius = 1, color = '#62d56f') {
    const group = new THREE.Group();
    group.position.set(position.x, (position.y ?? 0) + 0.09, position.z);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.74, 42),
      basicMat(color, {
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false
      }).clone()
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 1, 48),
      basicMat(color, {
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false
      }).clone()
    );
    const inner = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.34, 32),
      basicMat(color, {
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false
      }).clone()
    );
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.11, 1.35, 8),
      basicMat(color, {
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        depthTest: false
      }).clone()
    );

    [disc, ring, inner].forEach((mesh) => {
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 1600;
      group.add(mesh);
    });
    beam.position.y = 0.68;
    beam.renderOrder = 1601;
    group.add(beam);

    const baseScale = Math.max(0.8, radius * 0.78);
    group.scale.setScalar(baseScale);
    this.addEffect(group, 0.82, (_, t) => {
      const pulse = Math.sin(t * Math.PI);
      ring.scale.setScalar(1 + t * 0.42);
      inner.scale.setScalar(1 + pulse * 0.35);
      beam.scale.set(1 + pulse * 0.8, 1 - t * 0.42, 1 + pulse * 0.8);
      disc.material.opacity = 0.18 * (1 - t);
      ring.material.opacity = 0.95 * (1 - t);
      inner.material.opacity = 0.8 * (1 - t);
      beam.material.opacity = 0.38 * (1 - t);
    }, () => disposeObject3D(group, { materials: true }));
  }

  spawnHit(position, color = '#f6e7a0') {
    const poolKey = 'hit:7:soft-burst';
    const group = this.acquirePooledEffect(poolKey, () => {
      const pooledGroup = new THREE.Group();
      for (let i = 0; i < 7; i += 1) {
        const spark = createSoftParticleSprite('#f6e7a0', {
          opacity: 0.62,
          depthTest: false,
          blending: THREE.NormalBlending,
          toneMapped: true,
          falloff: 'tight'
        });
        spark.userData.velocity = new THREE.Vector3();
        spark.renderOrder = 1710;
        pooledGroup.add(spark);
      }
      return pooledGroup;
    });
    group.position.copy(position);
    group.children.forEach((spark, index) => {
      setEffectMaterialColor(spark.material, color, {
        opacity: 0.62
      });
      const angle = (index / group.children.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.48;
      const horizontalSpeed = 0.72 + Math.random() * 0.92;
      spark.position.set(
        Math.cos(angle) * 0.025,
        (Math.random() - 0.5) * 0.06,
        Math.sin(angle) * 0.025
      );
      spark.rotation.set(0, 0, 0);
      spark.userData.baseScale = 0.11 + Math.random() * 0.09;
      spark.scale.setScalar(spark.userData.baseScale * 0.28);
      spark.material.opacity = 0.62;
      spark.userData.velocity.set(
        Math.cos(angle) * horizontalSpeed,
        (Math.random() - 0.35) * 0.9,
        Math.sin(angle) * horizontalSpeed
      );
    });
    this.addEffect(group, 0.3, (dt, t) => {
      const expansion = 1 - (1 - Math.min(1, t * 5.5)) ** 2;
      const opacity = 0.62 * (1 - t) ** 1.35;
      group.children.forEach((spark) => {
        spark.position.addScaledVector(spark.userData.velocity, dt);
        spark.userData.velocity.multiplyScalar(Math.max(0, 1 - dt * 5.2));
        spark.scale.setScalar(spark.userData.baseScale * (0.28 + expansion * 0.9) * (1 - t * 0.42));
        spark.material.opacity = opacity;
      });
    }, () => this.releasePooledEffect(poolKey, group));
  }

  spawnProjectileTrail(start, end, color = '#f4fbff', options = {}) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    if (length < 0.08) return;

    const width = options.width ?? 0.075;
    const opacity = options.opacity ?? 0.86;
    const duration = options.duration ?? 0.22;
    const group = new THREE.Group();
    group.position.copy(start).addScaledVector(direction, 0.5);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
    group.renderOrder = 1810;

    const core = new THREE.Mesh(
      new THREE.BoxGeometry(width, width, length),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        depthTest: false
      })
    );
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(width * 2.7, width * 2.7, Math.max(0.08, length * 0.92)),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: opacity * 0.34,
        depthWrite: false,
        depthTest: false
      })
    );
    core.renderOrder = 1811;
    glow.renderOrder = 1810;
    group.add(glow, core);

    this.addEffect(group, duration, (_, t) => {
      const fade = Math.max(0, 1 - t);
      core.material.opacity = opacity * fade;
      glow.material.opacity = opacity * 0.34 * fade;
      group.scale.set(1 + t * 0.28, 1 + t * 0.28, Math.max(0.18, 1 - t * 0.5));
    });
  }

  spawnEnemyCampBlast(start, end, options = {}) {
    const startPoint = start.clone();
    const endPoint = end.clone();
    const direction = new THREE.Vector3().subVectors(endPoint, startPoint);
    const length = direction.length();
    if (length < 0.08) return;

    const color = options.color ?? '#ffcf7a';
    const hotColor = options.hotColor ?? '#ff8c3a';
    const duration = options.duration ?? 0.46;
    const hitAt = 0.34;
    const group = new THREE.Group();
    const forward = direction.clone().normalize();
    const side = new THREE.Vector3(-forward.z, 0, forward.x);
    if (side.lengthSq() < 0.001) side.set(1, 0, 0);
    side.normalize();
    const liftAxis = new THREE.Vector3().crossVectors(side, forward).normalize();

    const beam = new THREE.Group();
    beam.position.copy(startPoint);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), forward);
    beam.renderOrder = 1830;

    const beamMaterial = createSoftBeamMaterial(color, hotColor);
    const beamGeometry = new THREE.PlaneGeometry(length, 0.62, 1, 1);
    const beamFace = new THREE.Mesh(beamGeometry, beamMaterial);
    const beamCross = new THREE.Mesh(beamGeometry, beamMaterial);
    beamCross.rotation.x = Math.PI / 2;
    beamFace.renderOrder = 1832;
    beamCross.renderOrder = 1831;
    beam.add(beamFace, beamCross);

    const boltMaterial = mat(color, {
      transparent: true,
      opacity: 1,
      emissive: hotColor,
      emissiveIntensity: 2.15,
      depthWrite: false
    }).clone();
    const bolt = new THREE.Mesh(new THREE.OctahedronGeometry(0.19, 0), boltMaterial);
    bolt.position.copy(startPoint);
    bolt.scale.set(0.82, 0.82, 1.42);
    bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
    bolt.renderOrder = 1834;

    const sourceGroup = new THREE.Group();
    sourceGroup.position.copy(startPoint);
    const sourceDiscMaterial = basicMat(color, {
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const sourceRingMaterial = basicMat(color, {
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const sourceDisc = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 7), sourceDiscMaterial);
    const sourceRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.024, 5, 24), sourceRingMaterial);
    const sourceRingB = sourceRing.clone();
    sourceRing.rotation.y = Math.PI / 2;
    sourceRingB.rotation.x = Math.PI / 2;
    sourceRingB.rotation.z = Math.PI / 4;
    sourceDisc.renderOrder = 1828;
    sourceRing.renderOrder = 1829;
    sourceRingB.renderOrder = 1829;
    sourceGroup.add(sourceDisc, sourceRing, sourceRingB);

    const impactMaterial = mat('#ffdca3', {
      transparent: true,
      opacity: 0.96,
      emissive: hotColor,
      emissiveIntensity: 0.95,
      depthWrite: false
    }).clone();
    const impactGroup = new THREE.Group();
    impactGroup.position.copy(endPoint);
    impactGroup.visible = false;
    for (let i = 0; i < 10; i += 1) {
      const shard = new THREE.Mesh(new THREE.DodecahedronGeometry(0.045 + Math.random() * 0.045, 0), impactMaterial);
      const angle = Math.random() * Math.PI * 2;
      const lift = 0.45 + Math.random() * 0.95;
      shard.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * (1.15 + Math.random() * 2.1),
        lift,
        Math.sin(angle) * (1.15 + Math.random() * 2.1)
      );
      shard.userData.spin = new THREE.Vector3(
        Math.random() * 8,
        Math.random() * 8,
        Math.random() * 8
      );
      shard.userData.baseScale = 1;
      shard.renderOrder = 1833;
      impactGroup.add(shard);
    }

    const dissipateMaterial = createSoftParticleMaterial(color, {
      opacity: 0.88,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });
    const dissipateGroup = new THREE.Group();
    for (let index = 0; index < 18; index += 1) {
      const particle = new THREE.Sprite(dissipateMaterial);
      particle.userData.isSoftParticle = true;
      const distanceAlongBeam = length * (0.08 + Math.random() * 0.88);
      particle.position.copy(startPoint).addScaledVector(forward, distanceAlongBeam);
      particle.userData.origin = particle.position.clone();
      particle.userData.drift = side.clone().multiplyScalar((Math.random() - 0.5) * 2.1)
        .addScaledVector(liftAxis, (Math.random() - 0.35) * 1.65)
        .addScaledVector(forward, (Math.random() - 0.5) * 0.45);
      particle.userData.baseScale = 0.15 + Math.random() * 0.18;
      particle.userData.spin = (Math.random() - 0.5) * 12;
      particle.visible = false;
      particle.renderOrder = 1833;
      dissipateGroup.add(particle);
    }

    group.add(beam, bolt, sourceGroup, impactGroup, dissipateGroup);
    this.addEffect(group, duration, (dt, t) => {
      const flightT = clamp(t / hitAt, 0, 1);
      const easedFlight = 1 - (1 - flightT) ** 3;
      bolt.position.lerpVectors(startPoint, endPoint, easedFlight);
      bolt.rotation.x += dt * 7.5;
      bolt.rotation.z += dt * 10.5;

      const beamFade = Math.max(0, 1 - clamp((t - hitAt * 0.62) / (1 - hitAt * 0.62), 0, 1));
      const currentLength = length * Math.max(0.02, easedFlight);
      beam.position.copy(startPoint).addScaledVector(forward, currentLength * 0.5);
      beam.scale.set(Math.max(0.02, easedFlight), 1 + flightT * 0.08, 1 + flightT * 0.08);
      beamMaterial.uniforms.uOpacity.value = beamFade;
      bolt.material.opacity = Math.max(0, 1 - clamp((t - hitAt * 0.78) / 0.22, 0, 1));

      const sourcePulse = Math.sin(clamp(t / 0.56, 0, 1) * Math.PI);
      sourceGroup.scale.setScalar(0.72 + sourcePulse * 0.72 + t * 0.35);
      sourceGroup.rotation.y += dt * 5.2;
      sourceRingB.rotation.z -= dt * 7.4;
      sourceDisc.material.opacity = 0.42 * Math.max(0, 1 - t * 1.45);
      sourceRing.material.opacity = 0.9 * Math.max(0, 1 - t * 1.35) * (0.62 + sourcePulse * 0.38);

      if (t >= hitAt) {
        const impactT = clamp((t - hitAt) / Math.max(0.01, 1 - hitAt), 0, 1);
        impactGroup.visible = true;
        impactGroup.children.forEach((shard) => {
          shard.position.addScaledVector(shard.userData.velocity, dt);
          shard.userData.velocity.y -= 4.4 * dt;
          shard.rotation.x += shard.userData.spin.x * dt;
          shard.rotation.y += shard.userData.spin.y * dt;
          shard.rotation.z += shard.userData.spin.z * dt;
          shard.scale.setScalar(1 - impactT * 0.68);
        });
        impactMaterial.opacity = 0.96 * (1 - impactT);
      }

      const dissipateT = clamp((t - hitAt * 0.72) / Math.max(0.01, 1 - hitAt * 0.72), 0, 1);
      dissipateGroup.children.forEach((particle) => {
        particle.visible = dissipateT > 0;
        particle.position.copy(particle.userData.origin)
          .addScaledVector(particle.userData.drift, dissipateT * 0.72);
        particle.scale.setScalar(particle.userData.baseScale * (1 - dissipateT) ** 0.72);
      });
      dissipateMaterial.opacity = 0.88 * Math.sin(Math.min(1, dissipateT * 1.45) * Math.PI) ** 0.72;
    });
  }

  spawnDeathBurst(position, radius = 0.8) {
    const group = new THREE.Group();
    group.position.set(position.x, position.y ?? 0, position.z);
    group.userData.preserveRenderLayers = true;
    const flashMaterial = basicMat('#ffffff', {
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending
    }).clone();
    const smokeRingMaterial = basicMat('#f2f6f8', {
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false
    }).clone();

    const flash = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.62, 32),
      flashMaterial
    );
    flash.rotation.x = -Math.PI / 2;
    flash.position.y = 0.08;
    flash.renderOrder = 1728;
    const smokeRing = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.28, radius * 0.44, 36),
      smokeRingMaterial
    );
    smokeRing.rotation.x = -Math.PI / 2;
    smokeRing.position.y = 0.11;
    smokeRing.renderOrder = 1727;
    group.add(flash, smokeRing);

    const smokePuffs = [];
    const smokeGeometry = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 18; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = radius * (1.15 + Math.random() * 2.05);
      const sizeTier = i % 6;
      const coreBoost = i < 7 ? 0.18 : 0;
      const baseScale = radius * (
        0.48 + coreBoost + sizeTier * 0.11 + Math.random() * 0.14
      );
      const shaded = i % 4 === 0;
      const puff = new THREE.Mesh(
        smokeGeometry,
        mat(shaded ? '#c8d0d4' : (i % 3 === 0 ? '#ffffff' : '#edf2f4'), {
          transparent: true,
          opacity: shaded ? 0.48 : 0.62,
          depthTest: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          roughness: 0.9,
          flatShading: true
        }).clone()
      );
      puff.position.set(
        Math.cos(angle) * radius * Math.random() * 0.16,
        radius * (0.34 + Math.random() * 0.72),
        Math.sin(angle) * radius * Math.random() * 0.16
      );
      puff.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        radius * (0.74 + Math.random() * 1.55),
        Math.sin(angle) * speed
      );
      puff.userData.baseScale = baseScale;
      puff.userData.aspect = new THREE.Vector3(
        0.72 + Math.random() * 0.58,
        0.62 + Math.random() * 0.56,
        0.72 + Math.random() * 0.58
      );
      puff.userData.birth = i < 7 ? 0 : Math.random() * 0.075;
      puff.userData.baseOpacity = shaded ? 0.48 : 0.62;
      puff.userData.curl = (Math.random() - 0.5) * radius * 1.2;
      puff.userData.spin = new THREE.Vector3(
        (Math.random() - 0.5) * 2.4,
        (Math.random() - 0.5) * 2.8,
        (Math.random() - 0.5) * 2.4
      );
      puff.userData.isDeathSmoke = true;
      puff.renderOrder = 1730 + (i % 3);
      puff.layers.set(0);
      puff.scale.setScalar(0.02);
      smokePuffs.push(puff);
      group.add(puff);
    }

    group.traverse((child) => child.layers.set(0));

    this.addEffect(group, 0.92, (dt, t) => {
      flash.scale.setScalar(1 + t * 4.6);
      flash.material.opacity = 0.24 * (1 - t) ** 2.4;
      smokeRing.scale.setScalar(0.72 + t * 3.1);
      smokeRing.material.opacity = 0.32 * (1 - t) ** 1.5;
      smokePuffs.forEach((puff) => {
        const localT = clamp((t - puff.userData.birth) / Math.max(0.01, 1 - puff.userData.birth), 0, 1);
        puff.visible = t >= puff.userData.birth;
        if (!puff.visible) return;
        puff.position.addScaledVector(puff.userData.velocity, dt);
        puff.userData.velocity.multiplyScalar(Math.max(0, 1 - dt * 2.35));
        puff.position.x += puff.userData.curl * dt * (0.25 + localT);
        puff.position.y += radius * dt * (0.32 + localT * 0.24);
        puff.rotation.x += puff.userData.spin.x * dt;
        puff.rotation.y += puff.userData.spin.y * dt;
        puff.rotation.z += puff.userData.spin.z * dt;
        const grow = 1 - (1 - Math.min(1, localT * 5.4)) ** 2;
        const scale = puff.userData.baseScale * (0.18 + grow * 0.82) * (1 - localT * 0.24);
        puff.scale.set(
          puff.userData.aspect.x * scale,
          puff.userData.aspect.y * scale,
          puff.userData.aspect.z * scale
        );
        const fadeIn = Math.min(1, localT * 9);
        puff.material.opacity = puff.userData.baseOpacity * fadeIn * (1 - localT) ** 0.82;
      });
    }, () => {
      disposeObject3D(group, { materials: true });
      return false;
    });
  }

  spawnExplosion(position, radius = 2.4) {
    return this.spawnPolygonExplosion(position, radius, false);
  }

  spawnSelfDestructExplosion(position, radius = 6) {
    return this.spawnPolygonExplosion(position, radius, true);
  }

  spawnPolygonExplosion(position, radius, isSelfDestruct) {
    if (!position) return false;
    const effectRadius = Math.max(0.5, Number(radius) || (isSelfDestruct ? 6 : 2.4));
    const poolKey = 'polygon-explosion:20';
    const group = this.acquirePooledEffect(poolKey, () => {
      const root = new THREE.Group();
      const coreMaterial = basicMat('#ff7218', {
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      }).clone();
      coreMaterial.color.setRGB(6.4, 1.15, 0.08);
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), coreMaterial);
      core.userData.isExplosionCore = true;
      core.renderOrder = 1560;
      root.add(core);

      const smokeGeometry = new THREE.DodecahedronGeometry(1, 0);
      const smokePuffs = [];
      const smokeColors = ['#ffffff', '#f2f3ee', '#d9ddd9', '#faf9f2'];
      for (let index = 0; index < 20; index += 1) {
        const smokeMaterial = mat(smokeColors[index % smokeColors.length], {
          transparent: true,
          opacity: 0,
          depthTest: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          roughness: 0.92,
          flatShading: true
        }).clone();
        const puff = new THREE.Mesh(smokeGeometry, smokeMaterial);
        puff.userData.isExplosionSmoke = true;
        puff.userData.origin = new THREE.Vector3();
        puff.userData.spin = new THREE.Vector3();
        puff.userData.aspect = new THREE.Vector3(1, 1, 1);
        puff.renderOrder = 1550 + (index % 3);
        smokePuffs.push(puff);
        root.add(puff);
      }
      root.userData.explosionCore = core;
      root.userData.explosionSmoke = smokePuffs;
      return root;
    });

    const core = group.userData.explosionCore;
    const smokePuffs = group.userData.explosionSmoke;
    const visualRadius = clamp(effectRadius * 0.34, 0.78, 2.4);
    const coreScale = visualRadius * 0.72;
    group.position.set(position.x, (position.y ?? 0) + 0.08, position.z);
    group.userData.explosionRadius = effectRadius;
    core.position.set(0, visualRadius * 0.42, 0);
    core.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    core.scale.setScalar(coreScale);
    core.material.opacity = 1;

    smokePuffs.forEach((puff, index) => {
      const angle = (index / smokePuffs.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.54;
      const centerBias = index < 7 ? 0.12 : 0.28;
      const baseScale = visualRadius * (0.38 + (index % 5) * 0.07 + Math.random() * 0.12);
      puff.position.set(
        Math.cos(angle) * visualRadius * Math.random() * centerBias,
        visualRadius * (0.2 + Math.random() * 0.42),
        Math.sin(angle) * visualRadius * Math.random() * centerBias
      );
      puff.userData.origin.copy(puff.position);
      puff.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      puff.userData.spin.set(
        (Math.random() - 0.5) * 4.8,
        (Math.random() - 0.5) * 5.8,
        (Math.random() - 0.5) * 4.8
      );
      puff.userData.aspect.set(
        0.7 + Math.random() * 0.65,
        0.62 + Math.random() * 0.7,
        0.7 + Math.random() * 0.65
      );
      puff.userData.baseScale = baseScale;
      puff.userData.birth = index < 7 ? 0 : Math.random() * 0.03;
      puff.userData.angle = angle;
      puff.userData.burstDistance = effectRadius * (
        0.74 + (index % 5) * 0.075 + Math.random() * 0.025
      );
      puff.userData.burstRise = visualRadius * (0.2 + Math.random() * 0.28);
      puff.userData.steamRise = visualRadius * (0.72 + Math.random() * 0.72);
      puff.userData.baseOpacity = 0.72 + Math.random() * 0.18;
      puff.scale.set(
        puff.userData.aspect.x * baseScale,
        puff.userData.aspect.y * baseScale,
        puff.userData.aspect.z * baseScale
      );
      puff.material.opacity = 0;
      puff.visible = index < 6;
    });

    this.addEffect(group, 1.55, (dt, t) => {
      const flashT = clamp(t / 0.085, 0, 1);
      const flashScale = coreScale * (0.82 + Math.sin(flashT * Math.PI) * 0.42) * (1 - flashT * 0.32);
      core.scale.setScalar(Math.max(0.001, flashScale));
      core.rotation.x += dt * 12;
      core.rotation.y += dt * 15;
      core.material.opacity = (1 - flashT) ** 2;
      core.visible = flashT < 1;

      smokePuffs.forEach((puff) => {
        const birth = puff.userData.birth;
        const localT = clamp((t - birth) / Math.max(0.01, 1 - birth), 0, 1);
        puff.visible = t >= birth;
        if (!puff.visible) return;
        const burstT = clamp(localT / 0.28, 0, 1);
        const burstEase = 1 - (1 - burstT) ** 3;
        const steamT = clamp((localT - 0.18) / 0.82, 0, 1);
        const horizontalDistance = puff.userData.burstDistance * burstEase
          + visualRadius * 0.08 * steamT;
        puff.position.set(
          puff.userData.origin.x + Math.cos(puff.userData.angle) * horizontalDistance,
          puff.userData.origin.y + puff.userData.burstRise * burstEase
            + puff.userData.steamRise * steamT,
          puff.userData.origin.z + Math.sin(puff.userData.angle) * horizontalDistance
        );
        puff.rotation.x += puff.userData.spin.x * dt;
        puff.rotation.y += puff.userData.spin.y * dt;
        puff.rotation.z += puff.userData.spin.z * dt;
        const finalShrink = 1 - clamp((localT - 0.82) / 0.18, 0, 1) * 0.82;
        const shrink = Math.max(0.001, (1 - localT * 0.42) * finalShrink);
        const scale = puff.userData.baseScale * shrink;
        puff.scale.set(
          puff.userData.aspect.x * scale,
          puff.userData.aspect.y * scale,
          puff.userData.aspect.z * scale
        );
        const fadeIn = Math.min(1, localT * 18);
        const fadeOut = 1 - clamp((localT - 0.48) / 0.52, 0, 1);
        puff.material.opacity = puff.userData.baseOpacity * fadeIn * fadeOut ** 1.35;
      });
    }, () => this.releasePooledEffect(poolKey, group));
    return true;
  }

  spawnDamageNumber(position, amount, options = {}) {
    const value = Math.max(0, amount);
    if (value <= 0.01) return;
    const text = options.text ?? formatDamage(value);
    const damageType = options.damageType ?? 'normal';
    const color = options.color ?? damageNumberColor(damageType);
    const stroke = options.stroke ?? '#000000';
    const textureEntry = this.getDamageNumberTexture(text, {
      color,
      stroke,
      fontSize: options.fontSize ?? 116,
      strokeWidth: options.strokeWidth,
      wide: Boolean(options.text)
    });
    const material = new THREE.SpriteMaterial({
      map: textureEntry.texture,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    const drift = (Math.random() - 0.5) * 0.42;
    sprite.position.set(
      position.x + (Math.random() - 0.5) * 0.28,
      (position.y ?? 0) + (options.height ?? 1.35),
      position.z + (Math.random() - 0.5) * 0.28
    );
    const baseHeight = options.baseHeight ?? 0.66;
    const baseWidth = baseHeight * textureEntry.aspect;
    sprite.scale.set(baseWidth, baseHeight, 1);
    sprite.renderOrder = 1900;
    this.addEffect(sprite, options.duration ?? 0.82, (dt, t) => {
      sprite.position.x += drift * dt;
      sprite.position.y += (1.35 + t * 0.9) * dt;
      const scale = 1 + Math.sin(t * Math.PI) * 0.28;
      sprite.scale.set(baseWidth * scale, baseHeight * scale, 1);
      const fadeStart = options.fadeStart ?? 0.6;
      const fadeT = clamp((t - fadeStart) / Math.max(0.01, 1 - fadeStart), 0, 1);
      material.opacity = clamp(1 - fadeT ** 3, 0, 1);
    }, () => {
      material.dispose();
    });
  }

  getDamageNumberTexture(text, options) {
    const key = [
      text,
      options.color,
      options.stroke,
      options.fontSize,
      options.strokeWidth ?? '',
      options.wide ? 'wide' : 'normal'
    ].join('|');
    const cached = this.damageNumberTextureCache.get(key);
    if (cached) return cached;

    if (this.damageNumberTextureCache.size > 96) {
      const oldestKey = this.damageNumberTextureCache.keys().next().value;
      const oldest = this.damageNumberTextureCache.get(oldestKey);
      oldest?.texture.dispose();
      this.damageNumberTextureCache.delete(oldestKey);
    }

    const canvas = document.createElement('canvas');
    canvas.width = options.wide ? 768 : 512;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    let fontSize = options.fontSize;
    context.font = `900 ${fontSize}px Arial, sans-serif`;
    while (context.measureText(text).width > canvas.width - 72 && fontSize > 54) {
      fontSize -= 6;
      context.font = `900 ${fontSize}px Arial, sans-serif`;
    }
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = options.strokeWidth ?? Math.max(14, Math.round(fontSize * 0.22));
    context.lineJoin = 'round';
    context.miterLimit = 2;
    context.strokeStyle = options.stroke;
    context.fillStyle = options.color;
    context.strokeText(text, canvas.width * 0.5, 126);
    context.fillText(text, canvas.width * 0.5, 126);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const entry = {
      texture,
      aspect: canvas.width / canvas.height
    };
    this.damageNumberTextureCache.set(key, entry);
    return entry;
  }

  spawnHealNumber(position, amount, options = {}) {
    const displayAmount = Math.max(0, options.displayAmount ?? amount);
    if (displayAmount <= 0.01) return;
    this.spawnDamageNumber(position, displayAmount, {
      text: `+${formatDamage(displayAmount)}`,
      color: options.color ?? '#59ee73',
      stroke: options.stroke ?? '#102616',
      height: options.height ?? 1.52,
      duration: options.duration ?? 0.76,
      fontSize: options.fontSize ?? 104,
      baseHeight: options.baseHeight ?? 0.56,
      fadeStart: options.fadeStart ?? 0.58
    });
  }

  queueHealNumber(target, amount, dt, options = {}) {
    if (!target?.position || amount <= 0.01) return;
    const key = options.key ?? '__healFloat';
    const state = target[key] ?? {
      amount: 0,
      timer: options.interval ?? 0.7
    };
    state.amount += amount;
    state.timer = Math.max(0, state.timer - Math.max(0, dt));
    target[key] = state;

    const minAmount = options.minAmount ?? 0.8;
    const minDisplay = options.minDisplay ?? 0.28;
    if (state.amount < minAmount && (state.timer > 0 || state.amount < minDisplay)) return;

    this.spawnHealNumber(target.position, state.amount, options);
    state.amount = 0;
    state.timer = options.interval ?? 0.7;
  }

  spawnEnergyNumber(position, amount, options = {}) {
    if (amount <= 0.001) return;
    this.spawnDamageNumber(position, amount, {
      text: options.text ?? `能量+${formatResourceAmount(amount)}`,
      color: options.color ?? '#7ee8ff',
      stroke: options.stroke ?? '#12303a',
      height: options.height ?? 2.28,
      duration: options.duration ?? 0.95,
      fontSize: options.fontSize ?? 92,
      baseHeight: options.baseHeight ?? 0.54,
      fadeStart: options.fadeStart ?? 0.64
    });
  }

  spawnStructureDust(position, radius = 2.5, color = '#b9aa8d') {
    const group = new THREE.Group();
    const dustMaterial = mat(color, {
      transparent: true,
      opacity: 0.72,
      roughness: 0.95
    }).clone();

    for (let i = 0; i < 18; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * (0.35 + Math.random() * 0.65);
      const dust = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.055 + Math.random() * 0.055, 0),
        dustMaterial
      );
      dust.position.set(
        position.x + Math.cos(angle) * distance,
        (position.y ?? 0) + 0.45 + Math.random() * 1.65,
        position.z + Math.sin(angle) * distance
      );
      dust.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * (0.55 + Math.random() * 1.25),
        -0.55 - Math.random() * 1.4,
        Math.sin(angle) * (0.55 + Math.random() * 1.25)
      );
      dust.userData.spin = new THREE.Vector3(
        Math.random() * 2.2,
        Math.random() * 2.2,
        Math.random() * 2.2
      );
      group.add(dust);
    }

    this.addEffect(group, 0.72, (dt, t) => {
      group.children.forEach((dust) => {
        dust.userData.velocity.y -= 2.3 * dt;
        dust.position.addScaledVector(dust.userData.velocity, dt);
        dust.rotation.x += dust.userData.spin.x * dt;
        dust.rotation.y += dust.userData.spin.y * dt;
        dust.rotation.z += dust.userData.spin.z * dt;
        dust.scale.setScalar(1 - t * 0.55);
      });
      dustMaterial.opacity = 0.72 * (1 - t);
    }, () => dustMaterial.dispose());
  }

  spawnFire(position) {
    this.spawnFireParticlesAt(position, 9, 0.76, 0.46, 1.25);
  }

  spawnBurningParticles(target, count = 2) {
    if (!target?.position) return;
    const flameCount = Math.max(2, Math.floor(count));
    this.spawnFireParticlesAt(target.position, flameCount, 0.68, 0.46, target.projectileHitHeight ?? 1.2);
  }

  spawnPoisonParticles(target, count = 2) {
    if (!target?.position) return;
    const poolKey = `poison:${count}`;
    const group = this.acquireParticleGroup(poolKey, count, () => createPooledParticle('#1f6f37', {
      transparent: true,
      opacity: 0.78,
      emissive: '#1f6f37',
      emissiveIntensity: 0.68,
      depthWrite: false
    }));
    const height = target.projectileHitHeight ?? 1.2;
    group.children.forEach((bubble) => {
      const color = Math.random() > 0.55 ? '#1f6f37' : (Math.random() > 0.45 ? '#2b8a44' : '#133d26');
      setEffectMaterialColor(bubble.material, color, {
        opacity: 0.78,
        emissive: color,
        emissiveIntensity: 0.68
      });
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * 0.48;
      bubble.userData.baseScale = 0.032 + Math.random() * 0.05;
      bubble.position.set(
        target.position.x + Math.cos(angle) * distance,
        (target.position.y ?? 0) + 0.12 + Math.random() * height * 0.46,
        target.position.z + Math.sin(angle) * distance
      );
      bubble.rotation.set(0, 0, 0);
      bubble.scale.setScalar(bubble.userData.baseScale);
      bubble.userData.velocity.set(
        Math.cos(angle) * (0.03 + Math.random() * 0.16),
        0.95 + Math.random() * 0.95,
        Math.sin(angle) * (0.03 + Math.random() * 0.16)
      );
    });

    this.addEffect(group, 0.86, (dt, t) => {
      group.children.forEach((bubble) => {
        bubble.position.addScaledVector(bubble.userData.velocity, dt);
        bubble.scale.setScalar(bubble.userData.baseScale * (1 - t * 0.42));
        bubble.material.opacity = 0.78 * (1 - t);
      });
    }, () => this.releasePooledEffect(poolKey, group));
  }

  spawnDrainParticles(target, count = 2) {
    if (!target?.position) return;
    const poolKey = `drain:${count}`;
    const group = this.acquireParticleGroup(poolKey, count, () => createPooledParticle('#9be85c', {
      transparent: true,
      opacity: 0.86,
      emissive: '#9be85c',
      emissiveIntensity: 0.82,
      depthWrite: false
    }));
    const height = target.projectileHitHeight ?? 1.2;
    group.children.forEach((mote) => {
      const color = Math.random() > 0.55 ? '#d4ff6a' : (Math.random() > 0.45 ? '#9be85c' : '#6fbf47');
      setEffectMaterialColor(mote.material, color, {
        opacity: 0.86,
        emissive: color,
        emissiveIntensity: 0.82
      });
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * 0.24;
      mote.userData.baseScale = 0.04 + Math.random() * 0.052;
      mote.position.set(
        target.position.x + Math.cos(angle) * distance,
        (target.position.y ?? 0) + 0.28 + Math.random() * height * 0.58,
        target.position.z + Math.sin(angle) * distance
      );
      mote.rotation.set(0, 0, 0);
      mote.scale.setScalar(mote.userData.baseScale);
      mote.userData.velocity.set(
        Math.cos(angle) * (0.9 + Math.random() * 0.95),
        0.18 + Math.random() * 0.42,
        Math.sin(angle) * (0.9 + Math.random() * 0.95)
      );
      mote.userData.spin.set(
        Math.random() * 4.5,
        Math.random() * 4.5,
        Math.random() * 4.5
      );
    });

    this.addEffect(group, 0.68, (dt, t) => {
      group.children.forEach((mote) => {
        mote.position.addScaledVector(mote.userData.velocity, dt);
        mote.rotation.x += mote.userData.spin.x * dt;
        mote.rotation.y += mote.userData.spin.y * dt;
        mote.rotation.z += mote.userData.spin.z * dt;
        mote.scale.setScalar(mote.userData.baseScale * (1 - t * 0.58));
        mote.material.opacity = 0.86 * (1 - t);
      });
    }, () => this.releasePooledEffect(poolKey, group));
  }

  spawnBleedParticles(target, count = 2) {
    if (!target?.position) return;
    const group = new THREE.Group();
    const materials = [];
    const height = target.projectileHitHeight ?? 1.2;
    for (let i = 0; i < count; i += 1) {
      const color = Math.random() > 0.45 ? '#d65b4f' : '#8f2f36';
      const material = mat(color, {
        transparent: true,
        opacity: 0.82,
        emissive: '#8f2f36',
        emissiveIntensity: 0.28,
        depthWrite: false
      }).clone();
      materials.push(material);
      const drop = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.032 + Math.random() * 0.038, 0),
        material
      );
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * 0.34;
      drop.position.set(
        target.position.x + Math.cos(angle) * distance,
        (target.position.y ?? 0) + 0.36 + Math.random() * height * 0.52,
        target.position.z + Math.sin(angle) * distance
      );
      drop.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * (0.18 + Math.random() * 0.44),
        0.15 + Math.random() * 0.45,
        Math.sin(angle) * (0.18 + Math.random() * 0.44)
      );
      group.add(drop);
    }

    this.addEffect(group, 0.72, (dt, t) => {
      group.children.forEach((drop) => {
        drop.userData.velocity.y -= 1.8 * dt;
        drop.position.addScaledVector(drop.userData.velocity, dt);
        drop.scale.setScalar(1 - t * 0.52);
        drop.material.opacity = 0.82 * (1 - t);
      });
    }, () => {
      materials.forEach((material) => material.dispose());
    });
  }

  spawnCurseParticles(target, count = 2) {
    if (!target?.position) return;
    const group = new THREE.Group();
    const materials = [];
    const height = target.projectileHitHeight ?? 1.2;
    for (let i = 0; i < count; i += 1) {
      const color = Math.random() > 0.5 ? '#b46aff' : '#6f47c7';
      const material = mat(color, {
        transparent: true,
        opacity: 0.76,
        emissive: color,
        emissiveIntensity: 0.72,
        depthWrite: false
      }).clone();
      materials.push(material);
      const mote = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.038 + Math.random() * 0.048, 0),
        material
      );
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * 0.42;
      mote.position.set(
        target.position.x + Math.cos(angle) * distance,
        (target.position.y ?? 0) + 0.28 + Math.random() * height * 0.58,
        target.position.z + Math.sin(angle) * distance
      );
      mote.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * (0.06 + Math.random() * 0.2),
        0.75 + Math.random() * 0.62,
        Math.sin(angle) * (0.06 + Math.random() * 0.2)
      );
      mote.userData.spin = new THREE.Vector3(
        Math.random() * 3.5,
        Math.random() * 3.5,
        Math.random() * 3.5
      );
      group.add(mote);
    }

    this.addEffect(group, 0.9, (dt, t) => {
      group.children.forEach((mote) => {
        mote.position.addScaledVector(mote.userData.velocity, dt);
        mote.rotation.x += mote.userData.spin.x * dt;
        mote.rotation.y += mote.userData.spin.y * dt;
        mote.rotation.z += mote.userData.spin.z * dt;
        mote.scale.setScalar(1 - t * 0.5);
        mote.material.opacity = 0.76 * (1 - t);
      });
    }, () => {
      materials.forEach((material) => material.dispose());
    });
  }

  spawnFireParticlesAt(position, count = 3, duration = 0.48, radius = 0.35, height = 1.1) {
    const poolKey = `fire:${count}`;
    const group = this.acquireParticleGroup(poolKey, count, () => createPooledFireParticle());
    const groundY = (position.y ?? 0) + 0.06;
    group.children.forEach((particle) => {
      const warm = Math.random();
      const color = warm > 0.72 ? '#ffe58a' : (warm > 0.36 ? '#ff8a32' : '#e6421f');
      setEffectMaterialColor(particle.material, color, {
        opacity: particle.userData.isEmber ? 0.86 : 0.92,
        emissive: color,
        emissiveIntensity: 1
      });
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius;
      const baseX = position.x + Math.cos(angle) * distance;
      const baseZ = position.z + Math.sin(angle) * distance;
      particle.userData.base.set(baseX, groundY, baseZ);
      particle.userData.phase = Math.random() * Math.PI * 2;
      particle.userData.delay = Math.random() * 0.16;
      if (particle.userData.isEmber) {
        particle.userData.baseScale = 0.035 + Math.random() * 0.04;
        particle.position.set(baseX, groundY + 0.18 + Math.random() * height * 0.38, baseZ);
        particle.scale.setScalar(particle.userData.baseScale);
        particle.userData.velocity.set(
          Math.cos(angle) * (0.12 + Math.random() * 0.34),
          1.25 + Math.random() * 1.4,
          Math.sin(angle) * (0.12 + Math.random() * 0.34)
        );
        particle.userData.spin.set(
          5 + Math.random() * 6,
          4 + Math.random() * 6,
          5 + Math.random() * 6
        );
      } else {
        particle.userData.flameHeight = Math.max(0.42, height * (0.48 + Math.random() * 0.48));
        particle.userData.flameWidth = 0.095 + Math.random() * 0.075;
        particle.userData.sway = 0.045 + Math.random() * 0.105;
        particle.userData.rise = 0.12 + Math.random() * 0.24;
        particle.position.set(baseX, groundY + particle.userData.flameHeight * 0.5, baseZ);
        particle.rotation.set(
          (Math.random() - 0.5) * 0.28,
          Math.random() * Math.PI * 2,
          (Math.random() - 0.5) * 0.24
        );
        particle.scale.set(
          particle.userData.flameWidth,
          particle.userData.flameHeight,
          particle.userData.flameWidth
        );
      }
    });

    this.addEffect(group, duration, (dt, t) => {
      group.children.forEach((particle) => {
        const localT = clamp((t - particle.userData.delay) / (1 - particle.userData.delay), 0, 1);
        if (particle.userData.isEmber) {
          particle.position.addScaledVector(particle.userData.velocity, dt);
          particle.userData.velocity.y -= 1.9 * dt;
          particle.rotation.x += particle.userData.spin.x * dt;
          particle.rotation.y += particle.userData.spin.y * dt;
          particle.rotation.z += particle.userData.spin.z * dt;
          particle.scale.setScalar(particle.userData.baseScale * (1 - localT * 0.68));
          particle.material.opacity = 0.86 * (1 - localT);
          return;
        }
        const tongue = Math.sin(localT * Math.PI);
        const flicker = 0.86 + Math.sin(particle.userData.phase + t * 58) * 0.14
          + Math.sin(particle.userData.phase * 0.7 + t * 91) * 0.08;
        const heightScale = Math.max(0.01, particle.userData.flameHeight * (0.28 + tongue * 0.88) * flicker);
        const widthScale = Math.max(0.01, particle.userData.flameWidth * (0.72 + tongue * 0.64));
        const swayX = Math.cos(particle.userData.phase + t * 15) * particle.userData.sway * tongue;
        const swayZ = Math.sin(particle.userData.phase * 0.83 + t * 13) * particle.userData.sway * tongue;
        particle.position.set(
          particle.userData.base.x + swayX,
          particle.userData.base.y + heightScale * 0.5 + localT * particle.userData.rise,
          particle.userData.base.z + swayZ
        );
        particle.rotation.x = Math.sin(particle.userData.phase + t * 10) * 0.16;
        particle.rotation.y += dt * (2.8 + Math.sin(particle.userData.phase) * 0.7);
        particle.rotation.z = Math.cos(particle.userData.phase + t * 12) * 0.2;
        particle.scale.set(widthScale, heightScale, widthScale);
        particle.material.opacity = 0.92 * Math.min(1, tongue * 1.45) * (1 - localT * 0.24);
      });
    }, () => this.releasePooledEffect(poolKey, group));
  }

  spawnThorns(position) {
    const group = new THREE.Group();
    for (let i = 0; i < 8; i += 1) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.42, 5),
        mat('#79d27a', { emissive: '#275f2c', emissiveIntensity: 0.5 })
      );
      const angle = (i / 8) * Math.PI * 2;
      spike.position.set(position.x, 0.22, position.z);
      spike.rotation.z = Math.PI / 2;
      spike.rotation.y = -angle;
      spike.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * 3.8,
        0.8,
        Math.sin(angle) * 3.8
      );
      group.add(spike);
    }
    this.addEffect(group, 0.52, (dt, t) => {
      group.children.forEach((spike) => {
        spike.position.addScaledVector(spike.userData.velocity, dt);
        spike.scale.setScalar(1 - t * 0.55);
      });
    });
  }

  spawnRecoveryPulse(center, radius) {
    if (this.recoveryTimer > 0) return false;
    this.recoveryTimer = RECOVERY_PULSE_INTERVAL_SECONDS;
    const group = new THREE.Group();
    const material = mat('#78e3d0', {
      transparent: true,
      opacity: 0.76,
      emissive: '#4ae09a',
      emissiveIntensity: 0.65,
      depthWrite: false
    }).clone();

    for (let i = 0; i < 4; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius;
      const mote = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.055 + Math.random() * 0.045, 0),
        material
      );
      mote.position.set(
        center.x + Math.cos(angle) * distance,
        (center.y ?? 0) + 0.16 + Math.random() * 0.08,
        center.z + Math.sin(angle) * distance
      );
      mote.userData.rise = 0.9 + Math.random() * 0.9;
      mote.userData.drift = new THREE.Vector3(
        (Math.random() - 0.5) * 0.35,
        0,
        (Math.random() - 0.5) * 0.35
      );
      group.add(mote);
    }

    this.addEffect(group, 1.15, (dt, t) => {
      group.children.forEach((mote) => {
        mote.position.addScaledVector(mote.userData.drift, dt);
        mote.position.y += mote.userData.rise * dt;
        mote.scale.setScalar(1 - t * 0.45);
      });
      material.opacity = 0.76 * (1 - t);
    }, () => {
      material.dispose();
    });
    return true;
  }

  ensureRecoveryAura(center, radius) {
    const nextRadius = Math.max(0.5, Number(radius) || 1);
    const nextCenter = new THREE.Vector3(center?.x ?? 0, center?.y ?? 0, center?.z ?? 0);
    if (this.recoveryAura) {
      const changed = Math.abs(this.recoveryAura.radius - nextRadius) > 0.02
        || this.recoveryAura.center.distanceToSquared(nextCenter) > 0.0004;
      this.recoveryAura.radius = nextRadius;
      this.recoveryAura.center.copy(nextCenter);
      return changed;
    }

    const group = new THREE.Group();
    const outerMaterial = basicMat('#78e3d0', {
      transparent: true,
      opacity: 0.44,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone();
    const innerMaterial = basicMat('#c9fff3', {
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone();
    const outer = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), outerMaterial);
    outer.rotation.x = -Math.PI / 2;
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.51, 48), innerMaterial);
    inner.rotation.x = -Math.PI / 2;
    group.add(outer, inner);

    const motes = [];
    const moteMaterial = mat('#9affdd', {
      emissive: '#4ae09a',
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.78,
      depthWrite: false
    }).clone();
    for (let index = 0; index < 10; index += 1) {
      const mote = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07, 0), moteMaterial);
      mote.userData.phase = (index / 10) * Math.PI * 2;
      group.add(mote);
      motes.push(mote);
    }
    group.traverse((child) => child.layers.set(1));
    this.scene.add(group);
    this.recoveryAura = {
      group,
      center: nextCenter,
      radius: nextRadius,
      outer,
      inner,
      motes,
      outerMaterial,
      innerMaterial,
      moteMaterial,
      phase: 0
    };
    return true;
  }

  updateRecoveryAura(dt) {
    const aura = this.recoveryAura;
    if (!aura) return;
    aura.phase += dt;
    aura.group.position.copy(aura.center).addScaledVector(METEOR_TRAIL_AXIS, 0.055);
    aura.group.rotation.y += dt * 0.16;
    aura.outer.scale.setScalar(aura.radius);
    aura.inner.scale.setScalar(aura.radius);
    aura.outerMaterial.opacity = 0.36 + Math.sin(aura.phase * 2.2) * 0.08;
    aura.innerMaterial.opacity = 0.24 + Math.sin(aura.phase * 2.8 + 1) * 0.07;
    aura.motes.forEach((mote, index) => {
      const angle = mote.userData.phase + aura.phase * (0.7 + (index % 3) * 0.09);
      const distance = aura.radius * (0.42 + (index % 4) * 0.13);
      mote.position.set(
        Math.cos(angle) * distance,
        0.13 + Math.sin(aura.phase * 1.7 + index) * 0.07,
        Math.sin(angle) * distance
      );
      mote.scale.setScalar(0.72 + Math.sin(aura.phase * 2 + index) * 0.16);
    });
  }

  clearRecoveryAura() {
    const aura = this.recoveryAura;
    if (!aura) return;
    aura.group.parent?.remove(aura.group);
    aura.group.traverse((child) => {
      child.geometry?.dispose?.();
    });
    aura.outerMaterial.dispose();
    aura.innerMaterial.dispose();
    aura.moteMaterial.dispose();
    this.recoveryAura = null;
  }

  getRecoveryAuraState() {
    const aura = this.recoveryAura;
    if (!aura) return null;
    return {
      x: aura.center.x,
      y: aura.center.y,
      z: aura.center.z,
      radius: aura.radius
    };
  }

  spawnJudgmentSword(position, radius = 0.9, onImpact) {
    const root = new THREE.Group();
    root.position.set(position.x, (position.y ?? 0) + 0.06, position.z);

    const sword = new THREE.Group();
    const bladeMaterial = mat('#e8edf0', {
      emissive: '#d9c77b',
      emissiveIntensity: 0.28,
      metalness: 0.72,
      roughness: 0.28
    });
    const goldMaterial = mat('#d6aa4a', {
      emissive: '#f1d77d',
      emissiveIntensity: 0.36,
      metalness: 0.58,
      roughness: 0.3
    });
    const gripMaterial = mat('#443126', {
      metalness: 0.16,
      roughness: 0.72
    });

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.62, 4), bladeMaterial);
    tip.position.y = 0.31;
    tip.rotation.z = Math.PI;
    sword.add(tip);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.15, 0.18), bladeMaterial);
    blade.position.y = 2.15;
    sword.add(blade);

    const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.75, 0.195), goldMaterial);
    fuller.position.y = 2.28;
    sword.add(fuller);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.24, 0.32), goldMaterial);
    guard.position.y = 3.82;
    sword.add(guard);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.86, 6), gripMaterial);
    grip.position.y = 4.36;
    sword.add(grip);

    const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), goldMaterial);
    pommel.position.y = 4.92;
    sword.add(pommel);
    sword.rotation.y = 0.34;
    root.add(sword);

    const beamMaterial = basicMat('#ffe58a', {
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.62, 7.4, 8, 1, true), beamMaterial);
    beam.position.y = 4.1;
    root.add(beam);
    const beamCoreMaterial = basicMat('#fff5c6', {
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const beamCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.22, 7.7, 6, 1, true),
      beamCoreMaterial
    );
    beamCore.position.y = 4.1;
    root.add(beamCore);

    const markerMaterial = basicMat('#d6aa4a', {
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone();
    const marker = new THREE.Mesh(new THREE.RingGeometry(radius * 0.58, radius, 28), markerMaterial);
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.025;
    root.add(marker);

    const sigil = new THREE.Group();
    const sigilDiscMaterial = basicMat('#f0c85e', {
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const sigilDisc = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.78, 32), sigilDiscMaterial);
    sigilDisc.rotation.x = -Math.PI / 2;
    sigilDisc.position.y = 0.012;
    sigil.add(sigilDisc);

    const innerMarkerMaterial = basicMat('#ffe58a', {
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const innerMarker = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.22, radius * 0.3, 24),
      innerMarkerMaterial
    );
    innerMarker.rotation.x = -Math.PI / 2;
    innerMarker.position.y = 0.032;
    sigil.add(innerMarker);

    const runeMaterial = basicMat('#ffe9a6', {
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const rune = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 0.07, 0.026, radius * 0.24),
        runeMaterial
      );
      rune.position.set(
        Math.cos(angle) * radius * 0.53,
        0.038,
        Math.sin(angle) * radius * 0.53
      );
      rune.rotation.y = Math.PI / 2 - angle;
      sigil.add(rune);
    }
    root.add(sigil);

    sword.position.y = 8.8;
    let impacted = false;
    this.addEffect(root, 0.86, (_, t) => {
      const fallProgress = clamp(t / 0.82, 0, 1);
      const ease = fallProgress * fallProgress * (3 - 2 * fallProgress);
      sword.position.y = lerp(8.8, 0, ease);
      sword.rotation.y = 0.34 + t * 0.72;
      beam.scale.set(1 + (1 - t) * 0.5, 1, 1 + (1 - t) * 0.5);
      beamMaterial.opacity = 0.18 + (1 - fallProgress) * 0.28;
      beamCore.scale.set(0.82 + (1 - fallProgress) * 0.42, 1, 0.82 + (1 - fallProgress) * 0.42);
      beamCoreMaterial.opacity = 0.24 + (1 - fallProgress) * 0.52;
      marker.scale.setScalar(0.84 + fallProgress * 0.16);
      markerMaterial.opacity = 0.16 + fallProgress * 0.36;
      const sigilCharge = clamp(t / 0.42, 0, 1);
      sigil.rotation.y = -t * 2.8;
      sigil.scale.setScalar(0.68 + sigilCharge * 0.32);
      sigilDiscMaterial.opacity = 0.06 + sigilCharge * 0.18;
      innerMarkerMaterial.opacity = 0.18 + sigilCharge * 0.44;
      runeMaterial.opacity = 0.18 + sigilCharge * 0.5;
      if (!impacted && t >= 0.82) {
        impacted = true;
        this.spawnJudgmentImpact(position, radius);
        onImpact?.();
      }
    }, () => {
      bladeMaterial.dispose();
      goldMaterial.dispose();
      gripMaterial.dispose();
      beamMaterial.dispose();
      beamCoreMaterial.dispose();
      markerMaterial.dispose();
      sigilDiscMaterial.dispose();
      innerMarkerMaterial.dispose();
      runeMaterial.dispose();
    });
  }

  spawnJudgmentImpact(position, radius = 0.9) {
    const group = new THREE.Group();
    group.position.set(position.x, (position.y ?? 0) + 0.08, position.z);
    const flashMaterial = basicMat('#ffe58a', {
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const flash = new THREE.Mesh(new THREE.OctahedronGeometry(radius * 0.42, 0), flashMaterial);
    flash.position.y = radius * 0.35;
    group.add(flash);
    const ringMaterial = basicMat('#d6aa4a', {
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.56, radius * 0.72, 30), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    const shockwaveMaterial = basicMat('#fff0ad', {
      transparent: true,
      opacity: 0.74,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const shockwave = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.16, radius * 0.24, 36),
      shockwaveMaterial
    );
    shockwave.rotation.x = -Math.PI / 2;
    shockwave.position.y = 0.024;
    group.add(shockwave);
    const shardMaterial = basicMat('#fff3bc', {
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const shards = [];
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2 + Math.PI / 8;
      const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(radius * 0.1, 0), shardMaterial);
      shard.userData.angle = angle;
      shard.userData.spin = 5 + index * 0.9;
      shard.position.y = 0.12;
      shards.push(shard);
      group.add(shard);
    }
    this.addEffect(group, 0.42, (_, t) => {
      flash.scale.setScalar(1 + t * 2.4);
      flashMaterial.opacity = (1 - t) * 0.78;
      ring.scale.setScalar(1 + t * 1.6);
      ringMaterial.opacity = (1 - t) * 0.68;
      shockwave.scale.setScalar(1 + t * 5.1);
      shockwaveMaterial.opacity = (1 - t) * 0.74;
      shards.forEach((shard) => {
        const distance = radius * (0.14 + t * 0.92);
        shard.position.x = Math.cos(shard.userData.angle) * distance;
        shard.position.z = Math.sin(shard.userData.angle) * distance;
        shard.position.y = 0.12 + Math.sin(t * Math.PI) * radius * 0.5;
        shard.rotation.x += shard.userData.spin * 0.018;
        shard.rotation.z += shard.userData.spin * 0.013;
      });
      shardMaterial.opacity = (1 - t) * 0.86;
    }, () => {
      flashMaterial.dispose();
      ringMaterial.dispose();
      shockwaveMaterial.dispose();
      shardMaterial.dispose();
    });
  }

  spawnFallingStar(position, radius, onImpact) {
    const star = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32, 0),
      mat('#ffe08a', {
        emissive: '#fff6c7',
        emissiveIntensity: 0.92,
        metalness: 0.2,
        roughness: 0.35
      })
    );
    star.position.set(position.x - 1.4, 8.2, position.z - 1.1);
    star.rotation.set(0.6, 0.4, 0.2);
    let impacted = false;
    this.addEffect(star, 0.74, (_, t) => {
      const ease = t * t;
      star.position.x = lerp(position.x - 1.4, position.x, ease);
      star.position.y = lerp(8.2, 0.92, ease);
      star.position.z = lerp(position.z - 1.1, position.z, ease);
      star.rotation.x += 0.22;
      star.rotation.y += 0.16;
      if (!impacted && t > 0.8) {
        impacted = true;
        onImpact?.();
      }
    });
  }

  spawnMeteor(position, radius, onImpact) {
    const group = new THREE.Group();
    const meteor = createSpellModel('meteor');
    meteor.userData.isMeteorBody = true;
    const meteorScale = clamp(1.25 + radius * 0.14, 1.36, 1.82);
    meteor.scale.setScalar(meteorScale);
    meteor.rotation.set(0.8, 0.2, 0.5);
    meteor.traverse((child) => {
      if (!child.isMesh) return;
      child.renderOrder = Math.max(child.renderOrder ?? 0, 1600);
      if (!child.material) return;
      child.material = child.material.clone();
      child.material.depthTest = false;
      child.material.depthWrite = false;
    });
    group.add(meteor);

    const haloMaterial = basicMat('#ff6b25', {
      transparent: true,
      opacity: 0.44,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.16, 14, 9), haloMaterial);
    halo.renderOrder = 1599;
    group.add(halo);

    const coreFlareMaterial = basicMat('#ffe39a', {
      transparent: true,
      opacity: 0.78,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const coreFlare = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 8), coreFlareMaterial);
    coreFlare.renderOrder = 1603;
    meteor.add(coreFlare);

    const flameShellMaterial = createFireGradientMaterial('#ff5a1f', '#ffe39a');
    const flameShellGeometry = new THREE.ConeGeometry(0.24, 0.78, 7, 1, true);
    const flameShell = [];
    for (let index = 0; index < 10; index += 1) {
      const angle = index / 10 * Math.PI * 2 + Math.random() * 0.35;
      const flame = new THREE.Mesh(flameShellGeometry, flameShellMaterial);
      flame.userData.baseScale = 0.58 + Math.random() * 0.62;
      flame.userData.phase = Math.random() * Math.PI * 2;
      flame.userData.trailDistance = 0.42 + (index % 4) * 0.18 + Math.random() * 0.12;
      flame.userData.radialX = Math.cos(angle) * (0.18 + Math.random() * 0.18);
      flame.userData.radialY = Math.sin(angle) * (0.18 + Math.random() * 0.18);
      flame.userData.isMeteorFlame = true;
      flame.renderOrder = 1604;
      flameShell.push(flame);
      group.add(flame);
    }

    const trailBeamMaterial = createFireGradientMaterial('#ff5a1f', '#ffd36f');
    const trailBeam = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.4, 12, 1, true), trailBeamMaterial);
    trailBeam.renderOrder = 1598;
    group.add(trailBeam);

    const trail = [];
    for (let index = 0; index < 12; index += 1) {
      const ember = createSoftParticleSprite(index % 3 === 0 ? '#ffd36f' : '#ff7a2f', {
        opacity: 0.72,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        falloff: 'tight'
      });
      ember.userData.phase = Math.random() * Math.PI * 2;
      ember.userData.side = (Math.random() - 0.5) * (0.16 + index * 0.035);
      ember.userData.baseScale = 0.18 + index * 0.018;
      ember.renderOrder = 1604;
      trail.push(ember);
      group.add(ember);
    }

    const shadowMaterial = basicMat('#2b1712', {
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone();
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 30), shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(position.x, (position.y ?? 0) + 0.055, position.z);
    shadow.renderOrder = 1502;
    group.add(shadow);

    const warningGroup = new THREE.Group();
    warningGroup.position.set(position.x, (position.y ?? 0) + 0.072, position.z);
    warningGroup.userData.isMeteorTarget = true;
    const warningDiscMaterial = basicMat('#ff7a2d', {
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const warningRingMaterial = basicMat('#ffd083', {
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const warningDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), warningDiscMaterial);
    const warningRing = new THREE.Mesh(new THREE.RingGeometry(0.925, 1, 64), warningRingMaterial);
    const warningInner = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.5, 48), warningRingMaterial);
    [warningDisc, warningRing, warningInner].forEach((marker, index) => {
      marker.rotation.x = -Math.PI / 2;
      marker.renderOrder = 1588 + index;
      warningGroup.add(marker);
    });
    warningDisc.scale.setScalar(radius);
    warningRing.scale.setScalar(radius);
    warningInner.scale.setScalar(radius);
    const warningTickGeometry = new THREE.BoxGeometry(radius * 0.23, 0.018, radius * 0.04);
    for (let index = 0; index < 4; index += 1) {
      const angle = index * Math.PI * 0.5;
      const tick = new THREE.Mesh(warningTickGeometry, warningRingMaterial);
      tick.position.set(Math.cos(angle) * radius * 0.78, 0.012, Math.sin(angle) * radius * 0.78);
      tick.rotation.y = -angle;
      tick.renderOrder = 1591;
      warningGroup.add(tick);
    }
    const start = new THREE.Vector3(position.x - 2.7, (position.y ?? 0) + 9.8, position.z - 2.35);
    const end = new THREE.Vector3(position.x, (position.y ?? 0) + 1.08, position.z);
    const trailDirection = start.clone().sub(end).normalize();
    const trailSide = new THREE.Vector3(-trailDirection.z, 0, trailDirection.x).normalize();
    const trailLift = new THREE.Vector3().crossVectors(trailDirection, trailSide).normalize();
    const flightDuration = 1.18;
    const impactSeconds = flightDuration * 0.9;
    const warningFadeSeconds = 0.38;
    warningGroup.userData.preserveRenderLayers = true;
    warningGroup.traverse((child) => child.layers.set(0));
    this.addEffect(warningGroup, impactSeconds + warningFadeSeconds, (dt, warningT) => {
      const age = warningT * (impactSeconds + warningFadeSeconds);
      const flightT = clamp(age / flightDuration, 0, 1);
      const ease = flightT * flightT * (3 - 2 * flightT);
      const fadeAfterImpact = 1 - clamp((age - impactSeconds) / warningFadeSeconds, 0, 1);
      const warningPulse = 1 + Math.sin(flightT * 28) * 0.022;
      warningRing.scale.setScalar(radius * warningPulse);
      warningDisc.scale.setScalar(radius * (0.99 + Math.sin(flightT * 18) * 0.012));
      warningInner.scale.setScalar(radius * lerp(1.38, 0.26, ease));
      warningGroup.rotation.y += dt * 0.42;
      warningDiscMaterial.opacity = lerp(0.1, 0.26, ease) * fadeAfterImpact;
      warningRingMaterial.opacity = (0.64 + ease * 0.28) * fadeAfterImpact;
    }, () => {
      disposeObject3D(warningGroup, { materials: true });
      return false;
    });
    let impacted = false;
    this.addEffect(group, flightDuration, (dt, t) => {
      const ease = t * t * (3 - 2 * t);
      meteor.position.lerpVectors(start, end, ease);
      meteor.rotation.x += dt * 8.4;
      meteor.rotation.y += dt * 6.1;
      halo.position.copy(meteor.position);
      const flicker = 1 + Math.sin(t * 56) * 0.09;
      const flameFadeIn = clamp(t / 0.08, 0, 1);
      const flameFadeOut = 1 - clamp((t - 0.84) / 0.16, 0, 1);
      const flightAlpha = flameFadeIn * flameFadeOut;
      halo.scale.setScalar(meteorScale * (1.2 + (1 - t) * 0.3) * flicker);
      haloMaterial.opacity = (0.34 + (1 - t) * 0.24) * flightAlpha;
      coreFlare.scale.setScalar(0.8 + flicker * 0.18);
      coreFlareMaterial.opacity = (0.66 + (1 - t) * 0.22) * flightAlpha;
      flameShell.forEach((flame, index) => {
        const lick = 0.74 + Math.sin(flame.userData.phase + t * (44 + index)) * 0.2;
        flame.position.copy(meteor.position)
          .addScaledVector(trailDirection, flame.userData.trailDistance * (0.82 + lick * 0.28))
          .addScaledVector(trailSide, flame.userData.radialX * lick)
          .addScaledVector(trailLift, flame.userData.radialY * lick);
        flame.quaternion.setFromUnitVectors(METEOR_TRAIL_AXIS, trailDirection);
        flame.rotateY(flame.userData.phase + t * (2.4 + index * 0.08));
        flame.scale.set(
          flame.userData.baseScale * (0.74 + lick * 0.22),
          flame.userData.baseScale * (0.76 + lick * 0.58),
          flame.userData.baseScale * (0.74 + lick * 0.22)
        );
      });
      flameShellMaterial.uniforms.uOpacity.value = (0.58 + flicker * 0.16) * flightAlpha;
      trailBeam.position.copy(meteor.position).addScaledVector(trailDirection, 1.55);
      trailBeam.quaternion.setFromUnitVectors(METEOR_TRAIL_AXIS, trailDirection);
      trailBeam.scale.setScalar(0.72 + (1 - t) * 0.34);
      trailBeamMaterial.uniforms.uOpacity.value = (0.3 + (1 - t) * 0.46) * flightAlpha;

      trail.forEach((ember, index) => {
        const distance = 0.52 + index * 0.31;
        ember.position.copy(meteor.position).addScaledVector(trailDirection, distance);
        const side = ember.userData.side * (0.45 + t);
        ember.position.x += Math.sin(ember.userData.phase + t * 24) * side;
        ember.position.z += Math.cos(ember.userData.phase + t * 21) * side;
        const taper = 1 - index / (trail.length + 2);
        ember.scale.setScalar(
          ember.userData.baseScale * taper * (0.72 + Math.sin(ember.userData.phase + t * 40) * 0.18)
        );
        ember.material.opacity = (0.5 + (1 - t) * 0.4) * flightAlpha;
      });
      shadow.scale.setScalar(radius * lerp(0.22, 0.72, ease));
      shadowMaterial.opacity = lerp(0.08, 0.34, ease);
      if (!impacted && t > 0.9) {
        impacted = true;
        this.spawnMeteorImpact(position, radius);
        onImpact?.();
      }
    }, () => {
      disposeObject3D(group, { materials: true });
      return false;
    });
  }

  spawnMeteorImpact(position, radius) {
    const group = new THREE.Group();
    group.position.set(position.x, (position.y ?? 0) + 0.12, position.z);

    const flashMaterial = basicMat('#ffd27a', {
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.58, 14, 8), flashMaterial);
    flash.scale.set(1, 0.55, 1);
    group.add(flash);

    const impactCore = createSoftParticleSprite('#ffe2a0', {
      opacity: 0.74,
      depthTest: false,
      blending: THREE.NormalBlending,
      toneMapped: true,
      falloff: 'tight'
    });
    impactCore.position.y = radius * 0.22;
    impactCore.scale.setScalar(radius * 0.32);
    impactCore.renderOrder = 1750;
    impactCore.userData.isMeteorImpactCore = true;
    group.add(impactCore);

    const dustMaterial = basicMat('#c65c2f', {
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false
    }).clone();
    const dustRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.92, 36), dustMaterial);
    dustRing.rotation.x = -Math.PI / 2;
    group.add(dustRing);

    const fragmentMaterial = basicMat('#65483a').clone();
    const fragmentShadeMaterial = basicMat('#372b27').clone();
    const fragments = [];
    for (let index = 0; index < 22; index += 1) {
      const angle = (index / 22) * Math.PI * 2 + Math.random() * 0.34;
      const rockSize = clamp(radius * (0.035 + Math.random() * 0.025), 0.13, 0.3);
      const fragment = new THREE.Mesh(
        new THREE.TetrahedronGeometry(rockSize, 0),
        index % 3 === 0 ? fragmentShadeMaterial : fragmentMaterial
      );
      fragment.position.set(
        Math.cos(angle) * radius * Math.random() * 0.18,
        0.08 + Math.random() * 0.22,
        Math.sin(angle) * radius * Math.random() * 0.18
      );
      fragment.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * (radius * 0.72 + Math.random() * radius * 1.08),
        radius * (0.72 + Math.random() * 1.24),
        Math.sin(angle) * (radius * 0.72 + Math.random() * radius * 1.08)
      );
      fragment.userData.spin = new THREE.Vector3(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14
      );
      fragment.userData.baseScale = 0.82 + Math.random() * 0.55;
      fragment.userData.isMeteorRock = true;
      fragments.push(fragment);
      group.add(fragment);
    }

    const soilPuffs = [];
    for (let index = 0; index < 14; index += 1) {
      const angle = index / 14 * Math.PI * 2 + Math.random() * 0.42;
      const puff = createSoftParticleSprite(index % 3 === 0 ? '#755344' : '#b48766', {
        opacity: index % 3 === 0 ? 0.52 : 0.64,
        depthTest: false,
        blending: THREE.NormalBlending,
        toneMapped: true
      });
      puff.position.set(
        Math.cos(angle) * radius * (0.08 + Math.random() * 0.2),
        0.12 + Math.random() * 0.28,
        Math.sin(angle) * radius * (0.08 + Math.random() * 0.2)
      );
      puff.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * radius * (0.42 + Math.random() * 0.52),
        radius * (0.36 + Math.random() * 0.55),
        Math.sin(angle) * radius * (0.42 + Math.random() * 0.52)
      );
      puff.userData.baseScale = radius * (0.075 + Math.random() * 0.085);
      puff.userData.aspect = new THREE.Vector2(1.2 + Math.random() * 0.7, 0.7 + Math.random() * 0.4);
      puff.userData.baseOpacity = index % 3 === 0 ? 0.52 : 0.64;
      puff.userData.isMeteorSoil = true;
      puff.renderOrder = 1742 + (index % 3);
      soilPuffs.push(puff);
      group.add(puff);
    }

    const embers = [];
    for (let index = 0; index < 10; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const ember = createSoftParticleSprite('#ffb24f', {
        opacity: 0.78,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        falloff: 'tight'
      });
      ember.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * (1.5 + Math.random() * 3),
        2.2 + Math.random() * 3.6,
        Math.sin(angle) * (1.5 + Math.random() * 3)
      );
      ember.userData.baseScale = 0.07 + Math.random() * 0.055;
      embers.push(ember);
      group.add(ember);
    }

    this.addEffect(group, 1.08, (dt, t) => {
      const expansion = radius * (0.42 + t * 0.88);
      flash.scale.set(expansion, expansion * (0.42 + t * 0.3), expansion);
      flashMaterial.opacity = 0.88 * (1 - t) ** 2;
      impactCore.scale.setScalar(radius * (0.32 + t * 0.86));
      impactCore.material.opacity = 0.74 * (1 - t) ** 2.4;
      dustRing.scale.setScalar(radius * (0.72 + t * 0.7));
      dustMaterial.opacity = 0.58 * (1 - t);
      fragments.forEach((fragment) => {
        fragment.position.addScaledVector(fragment.userData.velocity, dt);
        fragment.userData.velocity.y -= radius * 3.2 * dt;
        fragment.rotation.x += fragment.userData.spin.x * dt;
        fragment.rotation.y += fragment.userData.spin.y * dt;
        fragment.rotation.z += fragment.userData.spin.z * dt;
        fragment.scale.setScalar(fragment.userData.baseScale * (1 - t * 0.38));
      });
      soilPuffs.forEach((puff) => {
        puff.position.addScaledVector(puff.userData.velocity, dt);
        puff.userData.velocity.multiplyScalar(Math.max(0, 1 - dt * 1.8));
        puff.userData.velocity.y -= radius * 0.72 * dt;
        const puffScale = puff.userData.baseScale * (0.35 + Math.sin(Math.min(1, t * 1.3) * Math.PI) * 1.35);
        puff.scale.set(
          puff.userData.aspect.x * puffScale,
          puff.userData.aspect.y * puffScale,
          1
        );
        puff.material.opacity = puff.userData.baseOpacity * Math.sin(Math.min(1, t * 1.25) * Math.PI) ** 0.72;
      });
      embers.forEach((ember) => {
        ember.position.addScaledVector(ember.userData.velocity, dt);
        ember.userData.velocity.y -= 4.6 * dt;
        ember.scale.setScalar(ember.userData.baseScale * (1 - t * 0.72));
        ember.material.opacity = 0.78 * (1 - t);
      });
    }, () => {
      disposeObject3D(group, { materials: true });
      return false;
    });
  }

  spawnLavaEruption(position, radius, onImpact) {
    const group = new THREE.Group();
    group.position.set(position.x, (position.y ?? 0) + 0.04, position.z);

    const magmaMaterial = basicMat('#ff6a23', {
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const coreMaterial = basicMat('#ffe08a', {
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const rockMaterial = mat('#332321', {
      emissive: '#a93618',
      emissiveIntensity: 0.48,
      roughness: 0.9,
      transparent: true,
      opacity: 0.96
    }).clone();
    const heatMaterial = basicMat('#ff3f18', {
      transparent: true,
      opacity: 0.44,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const crackMaterial = basicMat('#ffb347', {
      transparent: true,
      opacity: 0.76,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();

    const heatDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 42), heatMaterial);
    heatDisc.rotation.x = -Math.PI / 2;
    heatDisc.position.y = 0.012;
    heatDisc.renderOrder = 1510;
    group.add(heatDisc);

    const shockwave = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), heatMaterial);
    shockwave.rotation.x = -Math.PI / 2;
    shockwave.position.y = 0.02;
    shockwave.renderOrder = 1511;
    group.add(shockwave);

    const cracks = [];
    for (let index = 0; index < 9; index += 1) {
      const angle = (index / 9) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
      const length = radius * (0.38 + Math.random() * 0.42);
      const crack = new THREE.Mesh(new THREE.BoxGeometry(1, 0.022, 0.06), crackMaterial);
      crack.position.set(
        Math.cos(angle) * length * 0.42,
        0.028,
        Math.sin(angle) * length * 0.42
      );
      crack.rotation.y = -angle;
      crack.scale.set(length, 1, 0.78 + Math.random() * 0.8);
      crack.userData.phase = Math.random() * Math.PI * 2;
      cracks.push(crack);
      group.add(crack);
    }

    const mainColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.68, 1, 9, 1, true),
      magmaMaterial
    );
    mainColumn.renderOrder = 1515;
    group.add(mainColumn);

    const innerColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.34, 1, 8, 1, true),
      coreMaterial
    );
    innerColumn.renderOrder = 1516;
    group.add(innerColumn);

    const lavaCap = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 7), coreMaterial);
    lavaCap.renderOrder = 1517;
    group.add(lavaCap);

    const jets = [];
    for (let index = 0; index < 11; index += 1) {
      const angle = (index / 11) * Math.PI * 2 + (Math.random() - 0.5) * 0.34;
      const distance = radius * (0.13 + Math.random() * 0.35);
      const jet = new THREE.Mesh(
        new THREE.ConeGeometry(0.5, 1, 6, 1, true),
        index % 3 === 0 ? coreMaterial : magmaMaterial
      );
      jet.position.set(
        Math.cos(angle) * distance,
        0,
        Math.sin(angle) * distance
      );
      jet.rotation.set(
        (Math.random() - 0.5) * 0.32,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.32
      );
      jet.userData.base = jet.position.clone();
      jet.userData.height = radius * (0.34 + Math.random() * 0.5);
      jet.userData.width = 0.12 + Math.random() * 0.12;
      jet.userData.delay = Math.random() * 0.18;
      jet.userData.phase = Math.random() * Math.PI * 2;
      jet.renderOrder = 1514;
      jets.push(jet);
      group.add(jet);
    }

    const fragments = [];
    for (let index = 0; index < 24; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius * 0.18;
      const fragment = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.07 + Math.random() * 0.15, 0),
        index % 4 === 0 ? coreMaterial : (index % 2 === 0 ? magmaMaterial : rockMaterial)
      );
      fragment.position.set(
        Math.cos(angle) * distance,
        0.22 + Math.random() * 0.28,
        Math.sin(angle) * distance
      );
      fragment.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * (1.3 + Math.random() * radius * 1.05),
        3.1 + Math.random() * 5.4,
        Math.sin(angle) * (1.3 + Math.random() * radius * 1.05)
      );
      fragment.userData.spin = new THREE.Vector3(
        5 + Math.random() * 8,
        4 + Math.random() * 8,
        5 + Math.random() * 8
      );
      fragments.push(fragment);
      group.add(fragment);
    }

    const smokeMaterial = mat('#332a28', {
      transparent: true,
      opacity: 0.34,
      roughness: 0.95,
      depthWrite: false
    }).clone();
    const smokePuffs = [];
    for (let index = 0; index < 8; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.24, 0), smokeMaterial);
      puff.position.set(
        Math.cos(angle) * radius * (0.16 + Math.random() * 0.18),
        0.75 + Math.random() * 0.65,
        Math.sin(angle) * radius * (0.16 + Math.random() * 0.18)
      );
      puff.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * (0.12 + Math.random() * 0.35),
        0.58 + Math.random() * 0.5,
        Math.sin(angle) * (0.12 + Math.random() * 0.35)
      );
      puff.userData.baseScale = 0.6 + Math.random() * 0.55;
      smokePuffs.push(puff);
      group.add(puff);
    }

    let impacted = false;
    this.addEffect(group, 1.36, (dt, t) => {
      const open = clamp(t / 0.16, 0, 1);
      const collapse = clamp((t - 0.72) / 0.28, 0, 1);
      const intensity = open * (1 - collapse);
      const plumeHeight = Math.max(0.01, radius * (1.05 + Math.sin(t * 30) * 0.05) * intensity);
      const plumeWidth = Math.max(0.01, radius * (0.13 + intensity * 0.09));

      heatDisc.scale.setScalar(radius * (0.34 + t * 0.42));
      shockwave.scale.setScalar(radius * (0.24 + t * 0.94));
      heatMaterial.opacity = 0.44 * (1 - t) ** 1.25;
      crackMaterial.opacity = 0.76 * (1 - t * 0.7) * (0.78 + Math.sin(t * 40) * 0.12);
      cracks.forEach((crack) => {
        const crackFlicker = 0.88 + Math.sin(crack.userData.phase + t * 56) * 0.12;
        crack.scale.z = crackFlicker;
      });

      mainColumn.position.y = plumeHeight * 0.5;
      mainColumn.scale.set(plumeWidth, plumeHeight, plumeWidth);
      mainColumn.rotation.y += dt * 3.6;
      innerColumn.position.y = plumeHeight * 0.52;
      innerColumn.scale.set(plumeWidth * 0.55, plumeHeight * 1.03, plumeWidth * 0.55);
      innerColumn.rotation.y -= dt * 4.1;
      lavaCap.position.y = plumeHeight * 0.98;
      lavaCap.scale.setScalar(radius * (0.12 + intensity * 0.08) * (0.88 + Math.sin(t * 47) * 0.08));

      jets.forEach((jet) => {
        const localT = clamp((t - jet.userData.delay) / (1 - jet.userData.delay), 0, 1);
        const jetIntensity = Math.sin(localT * Math.PI) * open;
        const flicker = 0.82 + Math.sin(jet.userData.phase + t * 54) * 0.16;
        const heightScale = Math.max(0.01, jet.userData.height * jetIntensity * flicker);
        const widthScale = Math.max(0.01, jet.userData.width * (0.7 + jetIntensity * 0.8));
        jet.visible = jetIntensity > 0.025;
        jet.position.set(
          jet.userData.base.x + Math.sin(jet.userData.phase + t * 10) * 0.08 * jetIntensity,
          heightScale * 0.5,
          jet.userData.base.z + Math.cos(jet.userData.phase + t * 9) * 0.08 * jetIntensity
        );
        jet.scale.set(widthScale, heightScale, widthScale);
        jet.rotation.y += dt * (3.4 + jet.userData.width * 4);
      });

      fragments.forEach((fragment) => {
        fragment.position.addScaledVector(fragment.userData.velocity, dt);
        fragment.userData.velocity.y -= 8.7 * dt;
        fragment.rotation.x += fragment.userData.spin.x * dt;
        fragment.rotation.y += fragment.userData.spin.y * dt;
        fragment.rotation.z += fragment.userData.spin.z * dt;
        fragment.scale.setScalar(Math.max(0.12, 1 - t * 0.76));
      });
      smokePuffs.forEach((puff) => {
        puff.position.addScaledVector(puff.userData.velocity, dt);
        puff.scale.setScalar(puff.userData.baseScale * (0.7 + t * 0.85));
      });

      magmaMaterial.opacity = 0.94 * (0.2 + intensity * 0.8);
      coreMaterial.opacity = 0.86 * (0.12 + intensity * 0.88);
      rockMaterial.opacity = 0.96 * (1 - t);
      smokeMaterial.opacity = 0.34 * Math.sin(t * Math.PI);

      if (!impacted && t >= 0.14) {
        impacted = true;
        onImpact?.();
      }
    });
  }

  spawnJadeShatter(position, radius) {
    const group = new THREE.Group();
    group.position.set(position.x, (position.y ?? 0) + 0.14, position.z);
    const jadeMaterial = mat('#54d9b5', {
      emissive: '#1f8f78',
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.92,
      depthWrite: false
    }).clone();
    const flashMaterial = basicMat('#bfffe9', {
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 7), flashMaterial);
    flash.scale.set(1, 0.55, 1);
    group.add(flash);
    const shards = [];
    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2 + Math.random() * 0.2;
      const shard = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.1 + Math.random() * 0.15, 0),
        jadeMaterial
      );
      shard.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * radius * (1.4 + Math.random() * 0.7),
        1.2 + Math.random() * 2.4,
        Math.sin(angle) * radius * (1.4 + Math.random() * 0.7)
      );
      shards.push(shard);
      group.add(shard);
    }
    this.addEffect(group, 0.72, (dt, t) => {
      flash.scale.setScalar(radius * (0.3 + t * 0.85));
      flash.scale.y *= 0.48;
      flashMaterial.opacity = 0.78 * (1 - t) ** 2;
      jadeMaterial.opacity = 0.92 * (1 - t);
      shards.forEach((shard) => {
        shard.position.addScaledVector(shard.userData.velocity, dt);
        shard.userData.velocity.y -= 5.8 * dt;
        shard.rotation.x += dt * 9;
        shard.rotation.z += dt * 7;
        shard.scale.setScalar(1 - t * 0.58);
      });
    });
  }

  spawnCrater(position, radius) {
    const crater = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.72, 18),
      basicMat('#4c3830', {
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    crater.rotation.x = -Math.PI / 2;
    crater.position.set(position.x, 0.025, position.z);
    this.addEffect(crater, 4.5, (_, t) => {
      crater.material.opacity = 0.34 * (1 - t);
    });
  }
}

function createSoftBeamMaterial(color, hotColor) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uHotColor: { value: new THREE.Color(hotColor) },
      uOpacity: { value: 1 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uHotColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float edgeDistance = abs(vUv.y - 0.5) * 2.0;
        float softEdge = 1.0 - smoothstep(0.08, 1.0, edgeDistance);
        float hotCore = 1.0 - smoothstep(0.0, 0.24, edgeDistance);
        float alpha = (softEdge * 0.48 + hotCore * 0.72) * uOpacity;
        vec3 beamColor = mix(uColor, vec3(1.0), hotCore * 0.82);
        beamColor += uHotColor * hotCore * 0.62;
        gl_FragColor = vec4(beamColor, alpha);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
}

function createUpgradeOrbitBeamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0 },
      uPhase: { value: 0 }
    },
    vertexShader: `
      varying vec2 vLocalPosition;
      void main() {
        vLocalPosition = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uPhase;
      varying vec2 vLocalPosition;
      const float PI = 3.141592653589793;
      void main() {
        float radius = length(vLocalPosition);
        float radialDistance = abs(radius - 0.92) / 0.08;
        float softEdge = 1.0 - smoothstep(0.08, 1.0, radialDistance);
        float angle = fract((atan(vLocalPosition.y, vLocalPosition.x) + PI) / (PI * 2.0));
        float phase = fract(uPhase);
        float phaseDistance = abs(angle - phase);
        phaseDistance = min(phaseDistance, 1.0 - phaseDistance);
        float sweep = 1.0 - smoothstep(0.06, 0.3, phaseDistance);
        float oppositeDistance = abs(angle - fract(phase + 0.5));
        oppositeDistance = min(oppositeDistance, 1.0 - oppositeDistance);
        float echo = (1.0 - smoothstep(0.04, 0.2, oppositeDistance)) * 0.44;
        float alpha = softEdge * (0.12 + max(sweep, echo)) * uOpacity;
        vec3 beamColor = mix(uColor, vec3(1.0), sweep * 0.64 + softEdge * 0.16);
        gl_FragColor = vec4(beamColor, alpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
}

function createUpgradeSparkleMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 viewPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 worldScale = vec2(
          length(modelMatrix[0].xyz),
          length(modelMatrix[1].xyz)
        );
        viewPosition.xy += position.xy * worldScale;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 point = (vUv - 0.5) * 2.0;
        float horizontal = (1.0 - smoothstep(0.03, 0.34, abs(point.y)))
          * (1.0 - smoothstep(0.18, 1.0, abs(point.x)));
        float vertical = (1.0 - smoothstep(0.03, 0.34, abs(point.x)))
          * (1.0 - smoothstep(0.18, 1.0, abs(point.y)));
        float core = 1.0 - smoothstep(0.0, 0.3, length(point));
        float alpha = max(max(horizontal, vertical) * 0.78, core) * uOpacity;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.86), alpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
}

function createFireGradientMaterial(color, hotColor) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uHotColor: { value: new THREE.Color(hotColor) },
      uOpacity: { value: 0.72 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uHotColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float tipFade = smoothstep(0.0, 0.2, vUv.y) * smoothstep(0.0, 0.36, 1.0 - vUv.y);
        float sideFade = 1.0 - smoothstep(0.28, 0.5, abs(vUv.x - 0.5));
        float alpha = tipFade * (0.34 + sideFade * 0.66) * uOpacity;
        vec3 flameColor = mix(uColor, uHotColor, smoothstep(0.08, 0.82, vUv.y));
        gl_FragColor = vec4(flameColor, alpha);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
}

function formatDamage(value) {
  if (value >= 10) return String(Math.round(value));
  return value.toFixed(1).replace(/\.0$/, '');
}

function damageNumberColor(damageType) {
  if (damageType === 'true') return '#ffffff';
  if (damageType === 'magic') return '#9bdcff';
  return '#ff9b35';
}

function createLightningSegmentNode(geometry, haloMaterial, coreMaterial) {
  const segment = new THREE.Group();
  const halo = new THREE.Mesh(geometry, haloMaterial);
  const core = new THREE.Mesh(geometry, coreMaterial);
  halo.renderOrder = 1880;
  core.renderOrder = 1881;
  segment.add(halo, core);
  segment.userData.halo = halo;
  segment.userData.core = core;
  return segment;
}

function setLightningSegmentTransform(
  segment,
  start,
  end,
  haloRadius,
  coreRadius,
  direction = new THREE.Vector3(),
  midpoint = new THREE.Vector3()
) {
  direction.subVectors(end, start);
  const length = direction.length();
  if (length <= 0.0001) {
    segment.visible = false;
    return;
  }
  direction.multiplyScalar(1 / length);
  midpoint.lerpVectors(start, end, 0.5);
  segment.position.copy(midpoint);
  segment.quaternion.setFromUnitVectors(LIGHTNING_UP_AXIS, direction);
  segment.userData.halo.scale.set(haloRadius, length, haloRadius);
  segment.userData.core.scale.set(coreRadius, length, coreRadius);
}

function createSegmentedLightningArc(points, options = {}) {
  const arc = new THREE.Group();
  const direction = new THREE.Vector3();
  const midpoint = new THREE.Vector3();
  for (let index = 0; index < points.length - 1; index += 1) {
    const segment = createLightningSegmentNode(
      options.geometry,
      options.haloMaterial,
      options.coreMaterial
    );
    setLightningSegmentTransform(
      segment,
      points[index],
      points[index + 1],
      options.haloRadius,
      options.coreRadius,
      direction,
      midpoint
    );
    arc.add(segment);
  }
  return arc;
}

function lightningPoints(start, end, distance) {
  const segmentCount = Math.max(3, Math.min(9, Math.ceil(distance * 1.35)));
  const direction = new THREE.Vector3().subVectors(end, start).normalize();
  const side = new THREE.Vector3(-direction.z, 0, direction.x);
  if (side.lengthSq() < 0.001) side.set(1, 0, 0);
  side.normalize();
  const up = new THREE.Vector3().crossVectors(direction, side).normalize();
  const points = [start.clone()];
  for (let index = 1; index < segmentCount; index += 1) {
    const t = index / segmentCount;
    const width = Math.sin(Math.PI * t) * Math.min(0.52, distance * 0.12);
    const sideOffset = (Math.random() - 0.5) * width * 2;
    const upOffset = (Math.random() - 0.5) * width * 1.2;
    points.push(
      new THREE.Vector3()
        .lerpVectors(start, end, t)
        .addScaledVector(side, sideOffset)
        .addScaledVector(up, upOffset)
    );
  }
  points.push(end.clone());
  return points;
}

function formatResourceAmount(value) {
  if (value >= 1) return value.toFixed(1).replace(/\.0$/, '');
  return value.toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
}

function createPooledParticle(color, materialOptions = {}) {
  const particle = createSoftParticleSprite(color, materialOptions);
  particle.userData.velocity = new THREE.Vector3();
  particle.userData.spin = new THREE.Vector3();
  particle.userData.baseScale = 1;
  return particle;
}

function createPooledFireParticle() {
  const isEmber = Math.random() > 0.72;
  const particle = new THREE.Mesh(
    isEmber
      ? new THREE.OctahedronGeometry(1, 0)
      : new THREE.ConeGeometry(0.5, 1, 6, 1, true),
    basicMat('#ff7a2a', {
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone()
  );
  particle.userData.isEmber = isEmber;
  particle.userData.velocity = new THREE.Vector3();
  particle.userData.spin = new THREE.Vector3();
  particle.userData.base = new THREE.Vector3();
  particle.userData.baseScale = 1;
  particle.userData.phase = 0;
  particle.userData.delay = 0;
  return particle;
}

function setEffectMaterialColor(material, color, options = {}) {
  material.color?.set(color);
  if (material.emissive) {
    material.emissive.set(options.emissive ?? color);
  }
  if (typeof options.emissiveIntensity === 'number') {
    material.emissiveIntensity = options.emissiveIntensity;
  }
  if (typeof options.opacity === 'number') {
    material.opacity = options.opacity;
  }
}
