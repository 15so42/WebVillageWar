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
      // 单个特效的 update 抛错不能中断整条特效循环，否则其后所有特效（含死亡白烟）都会冻结
      try {
        effect.update?.(dt, effect.age / effect.duration);
      } catch (error) {
        console.error('[EffectsSystem] effect update failed', error);
      }
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
    // dispose 抛错也必须保证 scene.remove 与 splice 执行，避免坏特效卡在数组里每帧重复抛错、冻结整个特效系统
    let shouldDispose = true;
    try {
      shouldDispose = effect.dispose?.() !== false;
    } catch (error) {
      console.error('[EffectsSystem] effect dispose failed', error);
    }
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

  // —— 冲击环：径向羽化渐变（中央实、双缘透明）＋ 沿圆周轻微正弦扭曲 ——
  getShockRingGradientTexture() {
    if (this.shockRingGradientTexture) return this.shockRingGradientTexture;
    const size = 64;
    const data = new Uint8Array(size * 4);
    for (let i = 0; i < size; i += 1) {
      const t = i / (size - 1);
      const alpha = Math.pow(Math.sin(Math.PI * t), 0.8);
      const offset = i * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * 255);
    }
    const texture = new THREE.DataTexture(data, 1, size);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    texture.userData.isShockRingGradient = true;
    this.shockRingGradientTexture = texture;
    return texture;
  }

  createShockRingMesh(color, hdr = [3.4, 1.4, 0.3], options = {}) {
    const innerRadius = options.innerRadius ?? 0.72;
    const outerRadius = options.outerRadius ?? 1;
    const geometry = new THREE.RingGeometry(innerRadius, outerRadius, options.thetaSegments ?? 64, 10);
    // 轻微扭曲：轮廓按角度叠加多层正弦波动（3/5/7 波），不再是规整圆带
    const positions = geometry.attributes.position.array;
    const phase1 = Math.random() * Math.PI * 2;
    const phase2 = Math.random() * Math.PI * 2;
    const phase3 = Math.random() * Math.PI * 2;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const angle = Math.atan2(y, x);
      const baseRadius = Math.hypot(x, y);
      const wobble = 1
        + 0.055 * Math.sin(3 * angle + phase1)
        + 0.032 * Math.sin(5 * angle + phase2)
        + 0.018 * Math.sin(7 * angle + phase3);
      const radiusWobbled = baseRadius * wobble;
      positions[i] = Math.cos(angle) * radiusWobbled;
      positions[i + 1] = Math.sin(angle) * radiusWobbled;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({
      map: this.getShockRingGradientTexture(),
      color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false
    });
    material.color.setRGB(hdr[0], hdr[1], hdr[2]);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.userData.isGradientShockRing = true;
    return mesh;
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
      // 渐变 + 扭曲冲击环（不再是无渐变的规整圆带）
      const outer = this.createShockRingMesh('#ffe36a', [3.6, 1.8, 0.35]);
      const inner = this.createShockRingMesh('#fff1a0', [2.6, 1.5, 0.4], {
        innerRadius: 0.4,
        outerRadius: 0.62
      });
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
      // 烈阳脉冲密度 +50%（9 → 14 团火焰）
      for (let index = 0; index < 14; index += 1) {
        const flame = createSoftParticleSprite(index % 3 === 0 ? '#fff078' : '#ff9e31', {
          falloff: 'tight',
          opacity: 0,
          depthTest: true,
          toneMapped: false
        });
        flame.userData.angle = (index / 14) * Math.PI * 2;
        flame.userData.phase = index / 14;
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

  // 霜牙扑击拖影：白蓝半透明狼影沿冲锋路径快速掠过
  spawnFrostPounceTrail(start, end, duration = 0.42) {
    if (!start || !end) return false;
    const group = new THREE.Group();
    const trailMaterial = basicMat('#cfe9ff', {
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false
    }).clone();
    trailMaterial.color.setRGB(1.7, 2.1, 2.6);
    const streaks = [];
    for (let index = 0; index < 6; index += 1) {
      const streak = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.03, 0.16),
        trailMaterial
      );
      streak.userData.phase = index / 6;
      streak.userData.offset = (Math.random() - 0.5) * 0.5;
      group.add(streak);
      streaks.push(streak);
    }
    const startPoint = new THREE.Vector3(start.x, 0.5, start.z);
    const endPoint = new THREE.Vector3(end.x, 0.5, end.z);
    this.addEffect(group, duration, (dt, t) => {
      const fade = 1 - Math.pow(t, 1.4);
      streaks.forEach((streak) => {
        const pathT = clamp((t + streak.userData.phase * 0.14) / (1 + streak.userData.phase * 0.14), 0, 1);
        const eased = 1 - (1 - pathT) ** 2;
        streak.position.lerpVectors(startPoint, endPoint, eased);
        streak.position.y = 0.5 + Math.sin(pathT * Math.PI) * 0.55 + streak.userData.offset * 0.3;
        streak.scale.setScalar(0.7 + (1 - pathT) * 0.9);
        streak.material.opacity = 0.42 * fade * Math.sin(pathT * Math.PI);
      });
    }, () => {
      trailMaterial.dispose();
      return false;
    });
    return true;
  }

  // 冰镜结晶：目标周身悬浮六面冰晶护盾，随目标移动
  spawnIceMirrorAura(unit, duration = 6) {
    if (!unit?.position) return false;
    const group = new THREE.Group();
    const ring = this.createShockRingMesh('#dff2ff', [2.0, 2.5, 3.0], {
      innerRadius: 0.88,
      outerRadius: 0.98
    });
    ring.scale.setScalar(1.35);
    ring.position.y = 0.32;
    group.add(ring);
    const crystals = [];
    for (let index = 0; index < 6; index += 1) {
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.11, 0),
        basicMat('#e6f8ff', {
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false
        }).clone()
      );
      crystal.userData.angle = (index / 6) * Math.PI * 2;
      crystal.userData.orbit = 0.85;
      crystal.userData.speed = 1.4 + (index % 3) * 0.35;
      crystal.scale.setScalar(1 + (index % 2) * 0.35);
      group.add(crystal);
      crystals.push(crystal);
    }
    this.addEffect(group, Math.max(0.8, duration), (dt, t) => {
      if (!unit?.alive) return;
      group.position.copy(unit.position);
      group.position.y = (unit.position.y ?? 0) + 0.24;
      const alpha = Math.min(1, t / 0.2, (1 - t) / 0.25);
      ring.material.opacity = 0.34 * alpha;
      ring.rotation.z += dt * 0.7;
      crystals.forEach((crystal) => {
        crystal.userData.angle += dt * crystal.userData.speed;
        crystal.position.set(
          Math.cos(crystal.userData.angle) * crystal.userData.orbit,
          Math.sin(t * 2.2 + crystal.userData.angle) * 0.3,
          Math.sin(crystal.userData.angle) * crystal.userData.orbit
        );
        crystal.rotation.y += dt * 2.2;
        crystal.material.opacity = 0.92 * alpha;
      });
    });
    return true;
  }

  // 冰霜风暴：Boss 脚下的凛冽冰风区域——地面冰霜盘 + 旋转冰环 + 环绕冰晶 + 上升风丝
  spawnFrostStorm(position, radius = 4.2, duration = 3.5, options = {}, tracking = null) {
    if (!position) return false;
    const group = new THREE.Group();
    group.position.set(position.x, (position.y ?? 0) + 0.06, position.z);
    const color = options.color ?? '#9bdcff';
    const accent = options.accent ?? '#d5f4ff';
    // 地面冰霜盘（渐变羽化）
    const frostSheet = this.createShockRingMesh(accent, [1.9, 2.5, 3.0], {
      innerRadius: 0.04,
      outerRadius: 1
    });
    frostSheet.scale.setScalar(radius);
    frostSheet.material.opacity = 0.22;
    group.add(frostSheet);
    // 转动的冰风环
    const frostRing = this.createShockRingMesh(accent, [2.4, 3.0, 3.6], {
      innerRadius: 0.82,
      outerRadius: 0.94
    });
    frostRing.scale.setScalar(radius);
    frostRing.position.y = 0.05;
    group.add(frostRing);
    // 环绕上升的冰晶
    const crystals = [];
    for (let index = 0; index < 12; index += 1) {
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.06 + Math.random() * 0.05, 0),
        basicMat(accent, {
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false
        }).clone()
      );
      crystal.userData.angle = (index / 12) * Math.PI * 2;
      crystal.userData.orbit = radius * (0.24 + (index % 4) * 0.21);
      crystal.userData.speed = 1.5 + (index % 3) * 0.5;
      crystal.userData.height = 0.55 + Math.random() * 2.0;
      crystal.userData.phase = Math.random() * Math.PI * 2;
      group.add(crystal);
      crystals.push(crystal);
    }
    // 上升风丝（凛冽气流）
    const wisps = [];
    for (let index = 0; index < 7; index += 1) {
      const wisp = createSoftParticleSprite('#eaf9ff', {
        falloff: 'tight',
        opacity: 0,
        depthTest: true,
        toneMapped: false
      });
      wisp.material.color.multiplyScalar(2.2);
      wisp.userData.angle = (index / 7) * Math.PI * 2;
      wisp.userData.radiusScale = 0.28 + (index % 3) * 0.25;
      wisp.userData.phase = Math.random() * Math.PI * 2;
      group.add(wisp);
      wisps.push(wisp);
    }
    void color;
    this.addEffect(group, duration, (dt, t) => {
      if (tracking?.position) {
        group.position.set(tracking.position.x, (tracking.position.y ?? 0) + 0.06, tracking.position.z);
      }
      const age = t * duration;
      const fadeIn = Math.min(1, t / 0.25);
      const remainSeconds = (1 - t) * duration;
      const fadeOut = Math.min(1, remainSeconds / 0.45);
      const alpha = Math.min(fadeIn, fadeOut);
      // 每秒脉冲与伤害同拍
      const pulse = 0.8 + Math.sin(age * Math.PI * 2) * 0.2;
      frostSheet.material.opacity = 0.22 * alpha * pulse;
      frostRing.material.opacity = 0.3 * alpha * pulse;
      frostRing.rotation.z += dt * 0.9;
      crystals.forEach((crystal) => {
        crystal.userData.angle += dt * crystal.userData.speed;
        const cycle = (age * 0.9 + crystal.userData.phase) % 1;
        crystal.position.set(
          Math.cos(crystal.userData.angle) * crystal.userData.orbit,
          0.35 + cycle * crystal.userData.height,
          Math.sin(crystal.userData.angle) * crystal.userData.orbit
        );
        crystal.rotation.y += dt * 2.4;
        crystal.material.opacity = 0.9 * alpha * (0.5 + Math.sin(cycle * Math.PI) * 0.5);
      });
      wisps.forEach((wisp) => {
        wisp.userData.angle += dt * 2.3;
        const rise = (age * 1.5 + wisp.userData.phase) % 1;
        wisp.position.set(
          Math.cos(wisp.userData.angle) * radius * wisp.userData.radiusScale,
          0.2 + rise * 2.6,
          Math.sin(wisp.userData.angle) * radius * wisp.userData.radiusScale
        );
        const envelope = Math.sin(rise * Math.PI);
        const scale = radius * (0.03 + envelope * 0.045);
        wisp.scale.set(scale * 0.6, scale * 2.6, 1);
        wisp.material.opacity = 0.28 * alpha * envelope;
      });
    });
    return true;
  }

  // 风法师飓风：向前推进的龙卷——地面范围环（交代作用域）+ 螺旋上升的软边粒子漏斗柱
  // + 低多边形碎石/叶片碎片（有实体体积，靠自旋与明暗差异表现）+ 每 tickInterval 一次先快后慢的命中脉冲。
  // 主世界 layer 0、开启深度测试、不提高 renderOrder，被单位与场景正常遮挡（遵循特效渲染层级）。
  // 位置由确定性公式 start + direction × speed × age 自算，保证联机 host 与 client 视觉一致。
  spawnHurricane(state) {
    if (!state) return false;
    const readVec = (value, fallback) => {
      if (Array.isArray(value)) return new THREE.Vector3(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
      if (value && typeof value === 'object') return new THREE.Vector3(value.x ?? 0, value.y ?? 0, value.z ?? 0);
      if (fallback) return new THREE.Vector3(fallback.x ?? 0, fallback.y ?? 0, fallback.z ?? 0);
      return new THREE.Vector3();
    };
    const start = readVec(state.start, state.position);
    const direction = readVec(state.direction, null);
    if (direction.lengthSq() < 0.0001) direction.set(0, 0, -1);
    direction.normalize();
    const speed = Math.max(0.1, Number(state.speed) || 1.5);
    const radius = Math.max(0.5, Number(state.radius) || 2.5);
    const duration = Math.max(0.5, Number(state.duration) || 6);
    const tickInterval = Math.max(0.1, Number(state.tickInterval) || 0.4);
    const color = state.color ?? '#bfeaf0';
    const accent = state.accent ?? '#eafcff';

    const group = new THREE.Group();
    // 主世界特效：保留 layer 0（addEffect 不再强制置顶到覆盖通道）
    group.userData.preserveRenderLayers = true;
    group.position.copy(start);

    // —— 层 4：地面范围环，交代飓风作用域，贴合地面并略抬升避免 z-fighting ——
    const groundRing = this.createShockRingMesh(accent, [1.4, 2.0, 2.2], {
      innerRadius: 0.72,
      outerRadius: 1
    });
    groundRing.scale.setScalar(radius);
    groundRing.position.y = 0.07;
    groundRing.material.opacity = 0.15;
    group.add(groundRing);

    // —— 层 2：螺旋上升的软边粒子龙卷柱（倒漏斗：底部窄、顶部宽，两端淡出中段实） ——
    const columnColors = [accent, color, '#ffffff'];
    const column = [];
    for (let index = 0; index < 16; index += 1) {
      const sprite = createSoftParticleSprite(columnColors[index % 3], {
        falloff: index % 4 === 0 ? 'tight' : 'soft',
        opacity: 0,
        depthTest: true,
        toneMapped: false
      });
      // 少量 HDR 高亮核心负责短促辉光，其余为软边主体
      if (index % 4 === 0) sprite.material.color.multiplyScalar(1.6);
      sprite.userData.angle = (index / 16) * Math.PI * 2 + Math.random() * 0.4;
      sprite.userData.orbitSpeed = 2.2 + Math.random() * 1.6;
      sprite.userData.riseSpeed = 0.5 + Math.random() * 0.5;
      sprite.userData.cycle = Math.random();
      sprite.userData.height = 3.2 + Math.random() * 1.6;
      sprite.userData.swirl = 0.5 + Math.random() * 0.5;
      group.add(sprite);
      column.push(sprite);
    }

    // —— 层 3：低多边形碎石 / 叶片碎片（不透明硬边几何，靠大小/旋转/速度/明暗差异表现材质） ——
    const debrisGeometry = new THREE.TetrahedronGeometry(0.11, 0);
    const debrisColors = ['#7c8a6a', '#9a8f6d', '#5f7a72', '#a9c3b6'];
    const debris = [];
    for (let index = 0; index < 8; index += 1) {
      const mesh = new THREE.Mesh(
        debrisGeometry,
        basicMat(debrisColors[index % debrisColors.length], {
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: true,
          fog: false
        }).clone()
      );
      mesh.userData.angle = Math.random() * Math.PI * 2;
      mesh.userData.orbitSpeed = 2.6 + Math.random() * 2.2;
      mesh.userData.riseSpeed = 0.42 + Math.random() * 0.5;
      mesh.userData.cycle = Math.random();
      mesh.userData.riseHeight = 2.4 + Math.random() * 1.4;
      mesh.userData.spin = new THREE.Vector3(
        Math.random() * 6 - 3,
        Math.random() * 6 - 3,
        Math.random() * 6 - 3
      );
      mesh.userData.baseScale = 0.6 + Math.random() * 0.9;
      group.add(mesh);
      debris.push(mesh);
    }

    // —— 层 1：tick 命中脉冲环（固定 4 个环形缓冲，与伤害节拍对齐，先快后慢外扩 + 淡出） ——
    const pulseRings = [];
    for (let index = 0; index < 4; index += 1) {
      const ring = this.createShockRingMesh(accent, [2.2, 2.8, 3.2], {
        innerRadius: 0.5,
        outerRadius: 1
      });
      ring.visible = false;
      ring.position.set(0, 0.12, 0);
      group.add(ring);
      pulseRings.push({ mesh: ring, age: 0, life: Math.min(tickInterval * 2, 0.72) });
    }
    let nextPulseIndex = 0;
    const firePulse = () => {
      const pulse = pulseRings[nextPulseIndex];
      nextPulseIndex = (nextPulseIndex + 1) % pulseRings.length;
      pulse.age = 0;
      pulse.mesh.visible = true;
      pulse.mesh.scale.setScalar(radius * 0.2);
      pulse.mesh.material.opacity = 0;
    };

    let tickAccum = tickInterval;
    this.addEffect(group, duration, (dt, t) => {
      const age = t * duration;
      group.position.set(
        start.x + direction.x * speed * age,
        start.y,
        start.z + direction.z * speed * age
      );
      // 出现较快（0.2s 淡入），末段 0.5s 渐隐而非瞬间消失
      const fadeIn = Math.min(1, t / (0.2 / duration));
      const fadeOut = Math.min(1, ((1 - t) * duration) / 0.5);
      const alpha = Math.min(fadeIn, fadeOut);

      column.forEach((sprite) => {
        const data = sprite.userData;
        data.angle += dt * data.orbitSpeed;
        data.cycle += dt * data.riseSpeed;
        if (data.cycle >= 1) data.cycle -= 1;
        const heightT = data.cycle;
        const funnel = radius * (0.16 + Math.pow(heightT, 1.25) * 0.82);
        const swirl = data.angle + age * data.swirl;
        sprite.position.set(Math.cos(swirl) * funnel, 0.1 + heightT * data.height, Math.sin(swirl) * funnel);
        const envelope = Math.sin(heightT * Math.PI);
        const scale = radius * (0.16 + envelope * 0.26);
        sprite.scale.set(scale, scale * 1.4, 1);
        sprite.material.opacity = alpha * (0.16 + envelope * 0.4);
      });

      debris.forEach((mesh) => {
        const data = mesh.userData;
        data.angle += dt * data.orbitSpeed;
        data.cycle += dt * data.riseSpeed;
        if (data.cycle >= 1) data.cycle -= 1;
        const heightT = data.cycle;
        const funnel = radius * (0.2 + Math.pow(heightT, 1.2) * 0.8);
        const swirl = data.angle + age * data.orbitSpeed * 0.3;
        mesh.position.set(Math.cos(swirl) * funnel, 0.15 + heightT * data.riseHeight, Math.sin(swirl) * funnel);
        mesh.rotation.x += dt * data.spin.x;
        mesh.rotation.y += dt * data.spin.y;
        mesh.rotation.z += dt * data.spin.z;
        mesh.scale.setScalar(data.baseScale);
        mesh.material.opacity = alpha * Math.sin(heightT * Math.PI) * 0.9;
      });

      tickAccum += dt;
      if (tickAccum >= tickInterval) {
        tickAccum -= tickInterval;
        firePulse();
      }
      pulseRings.forEach((pulse) => {
        if (!pulse.mesh.visible) return;
        pulse.age += dt;
        const pt = pulse.age / pulse.life;
        if (pt >= 1) {
          pulse.mesh.visible = false;
          pulse.mesh.material.opacity = 0;
          return;
        }
        const ease = 1 - Math.pow(1 - pt, 2);
        pulse.mesh.scale.setScalar(radius * (0.2 + ease * 0.95));
        pulse.mesh.material.opacity = alpha * 0.5 * (1 - pt);
      });

      groundRing.rotation.z += dt * 0.6;
      groundRing.material.opacity = alpha * (0.14 + Math.sin(age * (Math.PI * 2 / tickInterval)) * 0.03);
    });
    return true;
  }

  // 近战溅射命中：半透明扰动冲击波 + 旋转风刃与涡旋风尘
  spawnHitSplashShockwave(position, radius = 2.6) {
    if (!position) return false;
    const group = new THREE.Group();
    group.position.set(position.x, (position.y ?? 0) + 0.1, position.z);
    const wave = this.createShockRingMesh('#eaf7ff', [2.8, 3.0, 3.6]);
    wave.scale.setScalar(0.15);
    group.add(wave);
    const waveBack = this.createShockRingMesh('#dff2ff', [2.0, 2.3, 2.7], {
      innerRadius: 0.62,
      outerRadius: 0.8
    });
    waveBack.scale.setScalar(0.1);
    waveBack.position.y = -0.02;
    group.add(waveBack);
    // 风刃：四片倾斜旋转的弧形薄片
    const windMaterial = basicMat('#eef9ff', {
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false
    }).clone();
    windMaterial.color.setRGB(1.7, 2.0, 2.3);
    const windGeometry = new THREE.RingGeometry(0.76, 0.86, 18, 1, 0, Math.PI * 1.18);
    const windBlades = [];
    for (let index = 0; index < 4; index += 1) {
      const blade = new THREE.Mesh(windGeometry, windMaterial);
      blade.rotation.x = -Math.PI / 2 + (index % 2 === 0 ? 0.5 : -0.45);
      blade.rotation.z = (index / 4) * Math.PI * 2;
      blade.position.y = 0.14 + (index % 2) * 0.1;
      group.add(blade);
      windBlades.push(blade);
    }
    // 风尘粒子：向外涡旋
    const dustColors = ['#f4fbff', '#dff2ff', '#ffffff'];
    const dusts = [];
    for (let index = 0; index < 10; index += 1) {
      const dust = createSoftParticleSprite(dustColors[index % 3], {
        falloff: 'tight',
        opacity: 0,
        depthTest: true,
        toneMapped: false
      });
      dust.userData.angle = (index / 10) * Math.PI * 2;
      dust.userData.phase = index / 10;
      group.add(dust);
      dusts.push(dust);
    }
    this.addEffect(group, 0.62, (dt, t) => {
      const burst = Math.min(1, t / 0.09);
      const fade = 1 - Math.pow(Math.max(0, (t - 0.3) / 0.32), 1.25);
      const ease = 1 - (1 - Math.min(1, t / 0.45)) ** 2;
      wave.scale.setScalar(0.15 + ease * radius);
      waveBack.scale.setScalar(0.1 + ease * radius * 0.74);
      wave.material.opacity = burst * fade * 0.5;
      waveBack.material.opacity = burst * fade * 0.34;
      windMaterial.opacity = burst * fade * 0.3;
      windBlades.forEach((blade, index) => {
        blade.rotation.y += dt * (3.6 + index * 0.55);
        blade.scale.setScalar(0.4 + ease * 1.05);
      });
      dusts.forEach((dust) => {
        dust.userData.angle += dt * 2.7;
        const distance = radius * (0.12 + ease * (0.5 + dust.userData.phase * 0.4));
        dust.position.set(
          Math.cos(dust.userData.angle) * distance,
          0.4 + Math.sin(t * 7 + dust.userData.phase * 9) * 0.24,
          Math.sin(dust.userData.angle) * distance
        );
        const scale = radius * (0.03 + (1 - t) * 0.028);
        dust.scale.set(scale, scale * 1.5, 1);
        dust.material.opacity = burst * fade * (0.3 + dust.userData.phase * 0.26);
      });
    });
    return true;
  }

  spawnFirework(position, radius = 5) {
    if (!position) return false;
    const poolKey = 'enchantment-firework';
    const group = this.acquirePooledEffect(poolKey, () => {
      const root = new THREE.Group();
      root.userData.isEnchantmentFirework = true;
      // 主世界层渲染：烟花不依赖覆盖通道，确保各环境可见且被场景正常遮挡
      root.userData.preserveRenderLayers = true;
      // 白热 HDR 核心：爆发瞬间一闪
      const core = createSoftParticleSprite('#fff7c2', {
        falloff: 'tight',
        opacity: 0,
        depthTest: true,
        toneMapped: false
      });
      core.material.color.multiplyScalar(3.6);
      core.userData.isFireworkCore = true;
      const colors = ['#ff6fb5', '#ffe36a', '#72e6ff', '#ff9a4d', '#b9ff7a', '#ff8299'];
      const sparks = [];
      // MC 烟花风格：瞬发球形爆裂 —— 彩色 HDR 粒子向全球面高速飞出，
      // 速度逐渐减缓、轻微重力下坠、亮度渐隐
      const sparkCount = 36;
      for (let index = 0; index < sparkCount; index += 1) {
        const spark = createSoftParticleSprite(colors[index % colors.length], {
          falloff: 'tight',
          opacity: 0,
          depthTest: true,
          toneMapped: false
        });
        spark.material.color.multiplyScalar(3.0);
        spark.userData.velocity = new THREE.Vector3();
        spark.userData.baseScale = 0.1 + (index % 6) * 0.018;
        spark.userData.phase = index / sparkCount;
        const echoes = [0.5, 0.22].map((opacity) => {
          const echo = createSoftParticleSprite(colors[index % colors.length], {
            falloff: 'tight',
            opacity: 0,
            depthTest: true,
            toneMapped: false
          });
          echo.material.color.multiplyScalar(1.5);
          echo.userData.echoOpacity = opacity;
          root.add(echo);
          return echo;
        });
        sparks.push({ spark, echoes });
        root.add(spark);
      }
      root.userData.parts = { core, sparks };
      return root;
    });
    // 大小与范围统一：爆炸粒子飞散半径 ≈ 实际作用半径
    const visualRadius = Math.max(1.2, Number(radius) || 5);
    const { core, sparks } = group.userData.parts;
    group.position.set(position.x, position.y ?? 1.8, position.z);
    core.position.set(0, 0, 0);
    core.scale.setScalar(visualRadius * 0.5);
    core.material.opacity = 1;
    sparks.forEach(({ spark, echoes }) => {
      // 全球面方向 + 初速（快速起爆）
      const direction = randomFireworkDirection();
      const speed = visualRadius * (1.7 + Math.random() * 0.85);
      spark.userData.velocity.copy(direction).multiplyScalar(speed);
      spark.position.set(0, 0, 0);
      spark.scale.setScalar(spark.userData.baseScale * 1.4);
      spark.material.opacity = 1;
      echoes.forEach((echo) => {
        echo.position.set(0, 0, 0);
        echo.scale.setScalar(spark.userData.baseScale * 0.7);
        echo.material.opacity = 0;
      });
    });
    this.addEffect(group, 1.15, (dt, t) => {
      // 核心：0.1s 内闪爆并急速缩小淡出
      core.scale.setScalar(visualRadius * (0.5 - t * 4.2));
      core.material.opacity = Math.max(0, 1 - t * 9);
      sparks.forEach(({ spark, echoes }) => {
        // 速度减缓 + 轻微重力
        spark.userData.velocity.y -= 0.5 * dt;
        spark.userData.velocity.multiplyScalar(Math.max(0, 1 - dt * 3.6));
        spark.position.addScaledVector(spark.userData.velocity, dt);
        // 亮度渐隐（先亮后快衰），尺寸缓慢缩小
        const fade = (1 - t) ** 1.7;
        const scale = spark.userData.baseScale * (0.7 + 0.5 * fade);
        spark.scale.set(scale * 0.72, scale * 1.25, 1);
        spark.material.opacity = fade * 0.95;
        // 拖尾依次滞后跟随
        let anchor = spark.position;
        echoes.forEach((echo, echoIndex) => {
          echo.position.lerp(anchor, 0.42 - echoIndex * 0.14);
          const echoScale = scale * (0.6 - echoIndex * 0.2);
          echo.scale.set(echoScale * 0.75, echoScale * 1.15, 1);
          echo.material.opacity = fade * echo.userData.echoOpacity;
          anchor = echo.position;
        });
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
    // 较扁的球：水平半径明显大于垂直厚度（形态更贴近压扁的椭球）
    const radius = 1.5 * visualScale;
    const thickness = 0.62 * visualScale;
    const group = new THREE.Group();
    // 保持主世界层（layer 0）：雷云与场景雾、描边、单位遮挡正确共处
    group.userData.preserveRenderLayers = true;
    group.position.set(state.position.x, (state.position.y ?? 0) + height, state.position.z);

    // —— 半透明黑色多面体云块：低分段 Dodecahedron 互相穿插叠加，融合成连续云团 ——
    // fog:false —— 第一关雪谷等场景有雾，默认材质会随距离把高空的雷云雾化成背景色，
    // 导致远处完全不可见；黑云必须保持自身轮廓。
    const BLOCK_OPACITIES = [0.48, 0.58, 0.55];
    const blockMaterials = [
      basicMat('#0d1017', {
        transparent: true,
        opacity: BLOCK_OPACITIES[0],
        depthWrite: false,
        fog: false
      }).clone(),
      basicMat('#07090f', {
        transparent: true,
        opacity: BLOCK_OPACITIES[1],
        depthWrite: false,
        fog: false
      }).clone(),
      basicMat('#131722', {
        transparent: true,
        opacity: BLOCK_OPACITIES[2],
        depthWrite: false,
        fog: false
      }).clone()
    ];
    blockMaterials.forEach((material, index) => {
      material.userData.baseOpacity = BLOCK_OPACITIES[index];
    });
    const blockGeometry = new THREE.DodecahedronGeometry(1, 0);
    // 融合排布：中心大块密叠成核团，向外逐层变疏变小，边缘小块爬散——
    // 半透明叠加让重叠处更浓、独立处更淡，看起来是一团连续的云而不是分离的砖块
    const blockLayout = [
      // 中心核团（密）
      [0.0, 0.12, 0.0, 1.05, 0.5, 1.0],
      [0.0, 0.34, 0.18, 0.95, 0.46, 0.92],
      [-0.18, 0.28, -0.1, 0.92, 0.48, 0.9],
      [0.2, 0.24, -0.14, 0.9, 0.44, 0.86],
      // 中层（较密）
      [-0.42, 0.36, 0.22, 0.86, 0.46, 0.82],
      [-0.48, 0.2, -0.32, 0.88, 0.44, 0.8],
      [-0.18, 0.44, -0.4, 0.9, 0.42, 0.84],
      [0.3, 0.42, -0.3, 0.94, 0.46, 0.9],
      [0.5, 0.3, 0.14, 0.86, 0.44, 0.84],
      [0.26, 0.3, 0.4, 0.88, 0.42, 0.84],
      [-0.3, -0.06, 0.46, 0.9, 0.4, 0.84],
      [0.05, -0.02, -0.52, 0.94, 0.42, 0.84],
      // 外层（渐疏渐小，爬散融合）
      [-0.8, 0.3, 0.1, 0.78, 0.4, 0.74],
      [-0.66, 0.14, -0.52, 0.8, 0.4, 0.72],
      [-0.5, 0.4, -0.62, 0.74, 0.38, 0.7],
      [-0.14, 0.5, -0.6, 0.8, 0.4, 0.76],
      [0.18, 0.52, -0.52, 0.82, 0.42, 0.78],
      [0.52, 0.44, -0.5, 0.78, 0.4, 0.74],
      [0.78, 0.34, -0.18, 0.8, 0.4, 0.76],
      [0.86, 0.12, 0.26, 0.76, 0.38, 0.72],
      [0.66, 0.02, 0.6, 0.8, 0.38, 0.74],
      [0.36, -0.14, 0.68, 0.82, 0.38, 0.76],
      [-0.08, -0.16, 0.7, 0.84, 0.4, 0.78],
      [-0.46, -0.14, 0.62, 0.8, 0.38, 0.74],
      [-0.78, -0.12, 0.4, 0.76, 0.36, 0.7],
      [-0.9, -0.14, 0.02, 0.78, 0.36, 0.72],
      [-0.82, -0.06, -0.4, 0.76, 0.36, 0.7],
      [-0.5, -0.2, -0.74, 0.78, 0.36, 0.7],
      [0.14, -0.24, -0.78, 0.8, 0.36, 0.72],
      [0.56, -0.2, -0.66, 0.76, 0.34, 0.68],
      [0.94, -0.08, -0.46, 0.78, 0.34, 0.7],
      [1.08, -0.04, -0.12, 0.74, 0.34, 0.66]
    ];
    const lobes = blockLayout.map(([x, y, z, sx, sy, sz], index) => {
      const lobe = new THREE.Mesh(blockGeometry, blockMaterials[index % blockMaterials.length]);
      lobe.position.set(x * radius, y * thickness, z * radius);
      lobe.scale.set(sx * visualScale, sy * visualScale, sz * visualScale);
      lobe.userData.basePosition = lobe.position.clone();
      lobe.userData.baseScale = lobe.scale.clone();
      lobe.userData.rollPhase = index * 0.83;
      // 每块独立的三轴翻滚速度与放大收缩节奏，模仿黑云翻涌
      lobe.userData.rollSpeed = new THREE.Vector3(
        0.36 + (index % 5) * 0.13,
        0.5 + (index % 4) * 0.17,
        0.28 + (index % 3) * 0.21
      );
      lobe.userData.swellSpeed = 0.9 + (index % 7) * 0.22;
      lobe.userData.swellPhase = index * 1.17;
      lobe.userData.swellAmp = 0.15 + (index % 5) * 0.05;
      lobe.userData.isThunderCloudLobe = true;
      lobe.renderOrder = 1870;
      return lobe;
    });

    // —— 中心核团：一块压扁的低多边形暗核，所有云块叠附其上，把分离的砖块感融合成连续整体 ——
    const cloudCoreMaterial = basicMat('#0a0e17', {
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      depthTest: true,
      fog: false
    }).clone();
    cloudCoreMaterial.userData.baseOpacity = 0.55;
    const cloudCoreGeometry = new THREE.IcosahedronGeometry(1, 1);
    const cloudCore = new THREE.Mesh(cloudCoreGeometry, cloudCoreMaterial);
    cloudCore.scale.set(radius * 1.04, thickness * 0.9, radius * 1.04);
    cloudCore.position.y = thickness * 0.1;
    cloudCore.renderOrder = 1868;
    cloudCore.userData.isThunderCloudCore = true;

    // —— 圆形假影子 ——
    const shadowMaterial = basicMat('#04060b', {
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
      fog: false
    }).clone();
    const groundShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 32), shadowMaterial);
    groundShadow.rotation.x = -Math.PI / 2;
    groundShadow.position.set(0, -(height - 0.06), 0);
    groundShadow.scale.set(radius * 1.18, radius * 1.18, 1);
    groundShadow.userData.baseScale = groundShadow.scale.clone();
    groundShadow.userData.isThunderCloudShadow = true;

    // —— 云内随机出现、反复穿梭的闪电：分段圆柱实体 + HDR 亮核 + 外层辉光 ——
    const boltCount = 4;
    // 分段更多：闪电路径更曲折细碎，不再是一根笔直粗线
    const boltSegmentCount = 8;
    const boltGeometry = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    // 更细的辉光与亮核，配合更低 HDR 让闪电柔和不刺眼
    const haloRadius = 0.034 * visualScale;
    const coreRadius = 0.011 * visualScale;
    const scratchDirection = new THREE.Vector3();
    const scratchMidpoint = new THREE.Vector3();
    const randomBoltPath = (points) => {
      const half = radius * 0.82;
      const start = new THREE.Vector3(
        (Math.random() * 2 - 1) * half,
        (Math.random() - 0.5) * thickness * 1.25,
        (Math.random() * 2 - 1) * half
      );
      const end = new THREE.Vector3(
        (Math.random() * 2 - 1) * half,
        (Math.random() - 0.5) * thickness * 1.25,
        (Math.random() * 2 - 1) * half
      );
      const direction = new THREE.Vector3().subVectors(end, start);
      const length = direction.length();
      const side = new THREE.Vector3(-direction.z, 0, direction.x);
      if (side.lengthSq() < 0.0001) side.set(1, 0, 0);
      side.normalize();
      const up = new THREE.Vector3().crossVectors(direction.normalize(), side).normalize();
      points[0].copy(start);
      for (let i = 1; i < boltSegmentCount; i += 1) {
        const t = i / boltSegmentCount;
        const width = Math.sin(Math.PI * t) * Math.min(0.46, length * 0.24);
        points[i]
          .copy(start)
          .lerp(end, t)
          .addScaledVector(side, (Math.random() - 0.5) * width * 2)
          .addScaledVector(up, (Math.random() - 0.5) * width * 1.1);
      }
      points[boltSegmentCount].copy(end);
    };
    const applyBoltPath = (bolt, points) => {
      for (let i = 0; i < boltSegmentCount; i += 1) {
        const segment = bolt.children[i];
        segment.visible = true;
        setLightningSegmentTransform(
          segment,
          points[i],
          points[i + 1],
          haloRadius,
          coreRadius,
          scratchDirection,
          scratchMidpoint
        );
      }
    };
    const bolts = [];
    const boltPoints = [];
    for (let index = 0; index < boltCount; index += 1) {
      const haloMaterial = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false
      });
      haloMaterial.color.setRGB(2.05, 1.9, 3.9);
      const coreMaterial = haloMaterial.clone();
      coreMaterial.color.setRGB(4.8, 4.6, 7.0);
      coreMaterial.opacity = 0;
      const points = new Array(boltSegmentCount + 1).fill(null).map(() => new THREE.Vector3());
      randomBoltPath(points);
      const bolt = createSegmentedLightningArc(points, {
        geometry: boltGeometry,
        haloMaterial,
        coreMaterial,
        haloRadius,
        coreRadius
      });
      bolt.userData.haloMaterial = haloMaterial;
      bolt.userData.coreMaterial = coreMaterial;
      bolt.userData.isThunderCloudBolt = true;
      // 错峰出现：初始随机延迟 + 每次闪后随机间隔，让闪电在云内随机反复穿梭
      bolt.userData.flashTimer = 0.35 + index * 0.5 + Math.random() * 0.4;
      bolt.userData.flashDuration = 0.16 + (index % 3) * 0.06;
      bolt.userData.flashing = false;
      bolt.renderOrder = 1874 + index;
      bolt.visible = false;
      bolts.push(bolt);
      boltPoints.push(points);
      group.add(bolt);
    }

    group.userData.thunderCloudVisual = {
      lobeCount: lobes.length,
      boltCount: bolts.length,
      shadowCount: 1,
      polygonal: true,
      shadowShape: 'circle'
    };
    group.add(groundShadow, cloudCore, ...lobes);

    this.addEffect(group, duration, (dt, progress) => {
      group.position.set(state.position.x, (state.position.y ?? 0) + height, state.position.z);
      // Host 持有的雷云状态会持续更新 age；Client 只收到一次生成事件，
      // 因此还要用本地特效进度驱动动画，避免联机雷云停在首帧。
      const visualAge = Math.max(Number(state.age) || 0, progress * duration);
      const fade = Math.min(1, progress * 6, (1 - progress) * 2.4);

      // 云块：持续放大收缩 + 三轴翻滚，模仿黑云翻涌
      lobes.forEach((lobe) => {
        const data = lobe.userData;
        const swell = 1 + Math.sin(visualAge * data.swellSpeed + data.swellPhase) * data.swellAmp;
        const spinBoost = 0.5 + swell;
        lobe.rotation.x += dt * data.rollSpeed.x * spinBoost;
        lobe.rotation.y += dt * data.rollSpeed.y * spinBoost;
        lobe.rotation.z += dt * data.rollSpeed.z * spinBoost;
        const orbit = 0.035 * visualScale * Math.sin(visualAge * 0.5 + data.rollPhase);
        lobe.position.set(
          data.basePosition.x + orbit,
          data.basePosition.y + Math.sin(visualAge * 1.3 + data.rollPhase) * 0.06 * visualScale,
          data.basePosition.z + Math.cos(visualAge * 0.45 + data.rollPhase) * orbit
        );
        lobe.scale.copy(data.baseScale).multiplyScalar(swell);
      });
      // 核团缓慢自转 + 轻微呼吸，带动整团云一起翻涌，强化整体感
      cloudCore.rotation.y += dt * 0.16;
      cloudCore.rotation.x += dt * 0.05;
      const coreSwell = 1 + Math.sin(visualAge * 0.65) * 0.045;
      cloudCore.scale.set(radius * 1.04 * coreSwell, thickness * 0.9 * coreSwell, radius * 1.04 * coreSwell);
      blockMaterials.forEach((material) => {
        material.opacity = material.userData.baseOpacity * fade;
      });
      cloudCoreMaterial.opacity = cloudCoreMaterial.userData.baseOpacity * fade;
      shadowMaterial.opacity = 0.28 * fade;
      const shadowPulse = 1 + Math.sin(visualAge * 0.9) * 0.03;
      groundShadow.scale.copy(groundShadow.userData.baseScale).multiplyScalar(shadowPulse);

      // 闪电：随机出现；闪亮期间每帧重排路径，像在云内来回穿梭
      bolts.forEach((bolt, index) => {
        const data = bolt.userData;
        if (data.flashing) {
          data.flashTimer -= dt;
          if (data.flashTimer <= 0) {
            data.flashing = false;
            bolt.visible = false;
            data.flashTimer = 0.45 + Math.random() * 1.35;
          } else {
            randomBoltPath(boltPoints[index]);
            applyBoltPath(bolt, boltPoints[index]);
            const intensity = Math.min(1, data.flashTimer / data.flashDuration);
            data.haloMaterial.opacity = (0.12 + 0.34 * intensity) * fade;
            data.coreMaterial.opacity = (0.48 + 0.26 * intensity) * fade;
            bolt.rotation.y = Math.sin(visualAge * 3.1 + index) * 0.06;
            bolt.rotation.x = Math.cos(visualAge * 2.4 + index * 0.8) * 0.05;
          }
        } else {
          data.flashTimer -= dt;
          if (data.flashTimer <= 0) {
            data.flashing = true;
            data.flashTimer = data.flashDuration;
            bolt.visible = true;
            randomBoltPath(boltPoints[index]);
            applyBoltPath(bolt, boltPoints[index]);
            // 闪现首帧立即点亮 HDR 材质，再逐帧衰减
            data.haloMaterial.opacity = 0.44 * fade;
            data.coreMaterial.opacity = 0.8 * fade;
          } else {
            bolt.visible = false;
          }
        }
      });
    }, () => {
      // 雷云每次施法创建独立材质，回收时统一释放，避免材质泄漏（几何体由默认 disposeObject3D 处理）
      blockMaterials.forEach((material) => material.dispose());
      cloudCoreMaterial.dispose();
      shadowMaterial.dispose();
      bolts.forEach((bolt) => {
        bolt.userData.haloMaterial.dispose();
        bolt.userData.coreMaterial.dispose();
      });
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
      depthTest: true,
      blending: THREE.NormalBlending
    }).clone();
    const flash = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.62, 32),
      flashMaterial
    );
    flash.rotation.x = -Math.PI / 2;
    flash.position.y = 0.08;
    group.add(flash);

    const smokePuffs = [];
    const smokeGeometry = new THREE.DodecahedronGeometry(1, 0);
    // 白烟：数量更多、块更大更厚，先快速外扩再慢速蒸腾（VFX_STYLE 低多边形烟块）
    for (let i = 0; i < 26; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = radius * (0.62 + Math.random() * 1.25);
      const sizeTier = i % 6;
      const coreBoost = i < 8 ? 0.3 : 0;
      const baseScale = radius * (
        0.62 + coreBoost + sizeTier * 0.12 + Math.random() * 0.16
      );
      const shaded = i % 4 === 0;
      const puff = new THREE.Mesh(
        smokeGeometry,
        mat(shaded ? '#c8d0d4' : (i % 3 === 0 ? '#ffffff' : '#edf2f4'), {
          transparent: true,
          opacity: shaded ? 0.55 : 0.7,
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
        radius * (0.5 + Math.random() * 1.1),
        Math.sin(angle) * speed
      );
      puff.userData.baseScale = baseScale;
      puff.userData.aspect = new THREE.Vector3(
        0.75 + Math.random() * 0.5,
        0.85 + Math.random() * 0.5,
        0.75 + Math.random() * 0.5
      );
      puff.userData.birth = i < 8 ? 0 : Math.random() * 0.075;
      puff.userData.baseOpacity = shaded ? 0.55 : 0.7;
      puff.userData.curl = (Math.random() - 0.5) * radius * 1.2;
      puff.userData.spin = new THREE.Vector3(
        (Math.random() - 0.5) * 2.4,
        (Math.random() - 0.5) * 2.8,
        (Math.random() - 0.5) * 2.4
      );
      puff.userData.isDeathSmoke = true;
      puff.layers.set(0);
      puff.scale.setScalar(0.02);
      smokePuffs.push(puff);
      group.add(puff);
    }

    // —— 底部扩散环：改为大小不一、速度不一、带阻尼的低多边形烟块带状环 ——
    // 替代原先整体缩放的实心 RingGeometry：贴地扁平烟块沿圆周径向爆发，先快后慢（阻尼）外扩并淡出
    const ringPuffs = [];
    const ringPuffCount = 18;
    for (let i = 0; i < ringPuffCount; i += 1) {
      const angle = (i / ringPuffCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.32;
      const speed = radius * (1.7 + Math.random() * 2.0);
      const shaded = i % 4 === 0;
      const baseScale = radius * (0.2 + Math.random() * 0.24);
      const puff = new THREE.Mesh(
        smokeGeometry,
        mat(shaded ? '#cdd5d9' : '#f2f6f8', {
          transparent: true,
          opacity: 0.6,
          depthTest: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          roughness: 0.9,
          flatShading: true
        }).clone()
      );
      puff.position.set(Math.cos(angle) * radius * 0.24, 0.1, Math.sin(angle) * radius * 0.24);
      puff.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        radius * (0.05 + Math.random() * 0.16),
        Math.sin(angle) * speed
      );
      puff.userData.damping = 2.5 + Math.random() * 1.6;
      puff.userData.baseScale = baseScale;
      // 扁平长宽比：让烟块贴地成“带状”而非圆球
      puff.userData.aspect = new THREE.Vector3(
        0.95 + Math.random() * 0.4,
        0.36 + Math.random() * 0.22,
        0.95 + Math.random() * 0.4
      );
      puff.userData.birth = Math.random() * 0.05;
      puff.userData.baseOpacity = shaded ? 0.5 : 0.62;
      puff.userData.spin = new THREE.Vector3(
        (Math.random() - 0.5) * 1.8,
        (Math.random() - 0.5) * 1.8,
        (Math.random() - 0.5) * 1.8
      );
      puff.userData.isDeathSmoke = true;
      puff.layers.set(0);
      puff.scale.setScalar(0.02);
      ringPuffs.push(puff);
      group.add(puff);
    }

    group.traverse((child) => child.layers.set(0));

    this.addEffect(group, 1.45, (dt, t) => {
      flash.scale.setScalar(1 + t * 4.6);
      flash.material.opacity = 0.24 * (1 - t) ** 2.4;
      ringPuffs.forEach((puff) => {
        const localT = clamp((t - puff.userData.birth) / Math.max(0.01, 1 - puff.userData.birth), 0, 1);
        puff.visible = t >= puff.userData.birth;
        if (!puff.visible) return;
        puff.position.addScaledVector(puff.userData.velocity, dt);
        // 阻尼：先快后慢地径向减速外扩
        puff.userData.velocity.multiplyScalar(Math.max(0, 1 - dt * puff.userData.damping));
        puff.rotation.x += puff.userData.spin.x * dt;
        puff.rotation.y += puff.userData.spin.y * dt;
        puff.rotation.z += puff.userData.spin.z * dt;
        const grow = 1 - (1 - Math.min(1, localT * 5.2)) ** 2;
        const scale = puff.userData.baseScale * (0.3 + grow * 0.7) * (1 - localT * 0.34);
        puff.scale.set(
          puff.userData.aspect.x * scale,
          puff.userData.aspect.y * scale,
          puff.userData.aspect.z * scale
        );
        const fadeIn = Math.min(1, localT * 10);
        puff.material.opacity = puff.userData.baseOpacity * fadeIn * (1 - localT) ** 1.15;
      });
      smokePuffs.forEach((puff) => {
        const localT = clamp((t - puff.userData.birth) / Math.max(0.01, 1 - puff.userData.birth), 0, 1);
        puff.visible = t >= puff.userData.birth;
        if (!puff.visible) return;
        puff.position.addScaledVector(puff.userData.velocity, dt);
        puff.userData.velocity.multiplyScalar(Math.max(0, 1 - dt * 1.55));
        puff.position.x += puff.userData.curl * dt * (0.2 + localT);
        puff.position.y += radius * dt * (0.38 + localT * 0.3);
        puff.rotation.x += puff.userData.spin.x * dt;
        puff.rotation.y += puff.userData.spin.y * dt;
        puff.rotation.z += puff.userData.spin.z * dt;
        const grow = 1 - (1 - Math.min(1, localT * 4.2)) ** 2;
        const scale = puff.userData.baseScale * (0.2 + grow * 0.8) * (1 - localT * 0.16);
        puff.scale.set(
          puff.userData.aspect.x * scale,
          puff.userData.aspect.y * scale,
          puff.userData.aspect.z * scale
        );
        const fadeIn = Math.min(1, localT * 9);
        puff.material.opacity = puff.userData.baseOpacity * fadeIn * (1 - localT) ** 0.6;
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
    const smokeCount = 26;
    const poolKey = `polygon-explosion:${smokeCount}`;
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

      // 中心火球：爆炸瞬间膨胀的橙黄软粒子光团（不只闪一个光块）
      const fireball = createSoftParticleSprite('#ff9a3d', {
        falloff: 'soft',
        opacity: 0,
        depthTest: false,
        toneMapped: false
      });
      fireball.material.color.multiplyScalar(3.2);
      fireball.userData.isExplosionFireball = true;
      root.add(fireball);

      // 扩散冲击环（渐变 + 轻微扭曲，HDR 加法）——交代实际爆炸范围
      const shockRing = this.createShockRingMesh('#ffb34d', [3.6, 1.6, 0.3], {
        innerRadius: 0.88,
        outerRadius: 1
      });
      shockRing.position.y = 0.1;
      shockRing.renderOrder = 1558;
      shockRing.userData.isSelfDestructShockRing = true;
      root.add(shockRing);
      root.userData.shockRing = shockRing;

      // 崩裂岩块：沿爆发面向外飞散并受重力回落（尘土感）
      const rockFragments = [];
      const rockMaterial = mat('#5a4638', {
        transparent: true,
        opacity: 0.95,
        roughness: 0.95,
        flatShading: true
      }).clone();
      for (let index = 0; index < 10; index += 1) {
        const fragment = new THREE.Mesh(
          new THREE.TetrahedronGeometry(0.08 + Math.random() * 0.12, 0),
          rockMaterial
        );
        fragment.userData.velocity = new THREE.Vector3();
        fragment.userData.spin = new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8
        );
        fragment.userData.birth = Math.random() * 0.08;
        fragment.userData.isExplosionRock = true;
        fragment.renderOrder = 1556;
        root.add(fragment);
        rockFragments.push(fragment);
      }
      root.userData.rockFragments = rockFragments;
      root.userData.rockMaterial = rockMaterial;

      const smokeGeometry = new THREE.DodecahedronGeometry(1, 0);
      const smokePuffs = [];
      // 灰阶烟：亮地表上白色半透明几乎不可见，中灰烟云才有对比度
      const smokeColors = ['#c6c9cd', '#9fa4a9', '#7d8288', '#b2b6bb'];
      for (let index = 0; index < smokeCount; index += 1) {
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
      root.userData.fireball = fireball;
      return root;
    });

    const core = group.userData.explosionCore;
    const smokePuffs = group.userData.explosionSmoke;
    const shockRing = group.userData.shockRing;
    const fireball = group.userData.fireball;
    const rockFragments = group.userData.rockFragments ?? [];
    // 视觉尺寸与实际伤害半径匹配：爆炸不能只闪一个小光块
    const visualRadius = isSelfDestruct
      ? clamp(effectRadius * 0.5, 1.7, 4.1)
      : clamp(effectRadius * 0.42, 0.9, 3.4);
    const duration = isSelfDestruct ? 2.2 : 1.7;
    const coreScale = visualRadius * (isSelfDestruct ? 0.95 : 0.9);
    group.position.set(position.x, (position.y ?? 0) + 0.08, position.z);
    group.userData.explosionRadius = effectRadius;
    core.position.set(0, visualRadius * 0.42, 0);
    core.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    core.scale.setScalar(coreScale);
    core.material.opacity = 1;
    fireball.position.set(0, visualRadius * 0.38, 0);
    fireball.scale.setScalar(visualRadius * 0.5);
    fireball.material.opacity = 0;
    shockRing.scale.setScalar(0.12);
    shockRing.material.opacity = 0;

    rockFragments.forEach((fragment, index) => {
      const angle = (index / rockFragments.length) * Math.PI * 2 + Math.random() * 0.55;
      const speed = effectRadius * (1.6 + Math.random() * 1.3);
      fragment.userData.velocity.set(
        Math.cos(angle) * speed,
        3.2 + Math.random() * 3.6,
        Math.sin(angle) * speed
      );
      fragment.position.set(
        Math.cos(angle) * effectRadius * 0.12,
        0.24 + Math.random() * 0.3,
        Math.sin(angle) * effectRadius * 0.12
      );
      fragment.material.opacity = 0.95;
    });

    smokePuffs.forEach((puff, index) => {
      const angle = (index / smokePuffs.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.54;
      const centerBias = index < 7 ? 0.12 : 0.28;
      const baseScale = visualRadius * (
        isSelfDestruct
          ? (0.52 + (index % 5) * 0.1 + Math.random() * 0.16)
          : (0.38 + (index % 5) * 0.075 + Math.random() * 0.12)
      );
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
      puff.userData.birth = index < 7 ? 0 : Math.random() * (isSelfDestruct ? 0.06 : 0.03);
      puff.userData.angle = angle;
      puff.userData.burstDistance = effectRadius * (
        0.74 + (index % 5) * 0.075 + Math.random() * 0.025
      );
      puff.userData.burstRise = visualRadius * (0.2 + Math.random() * 0.28);
      puff.userData.steamRise = visualRadius * (0.72 + Math.random() * 0.72);
      puff.userData.baseOpacity = isSelfDestruct ? 0.82 + Math.random() * 0.14 : 0.6 + Math.random() * 0.16;
      puff.scale.set(
        puff.userData.aspect.x * baseScale,
        puff.userData.aspect.y * baseScale,
        puff.userData.aspect.z * baseScale
      );
      puff.material.opacity = 0;
      puff.visible = index < 6;
    });

    this.addEffect(group, duration, (dt, t) => {
      const flashT = clamp(t / (isSelfDestruct ? 0.13 : 0.11), 0, 1);
      const flashScale = coreScale * (0.82 + Math.sin(flashT * Math.PI) * 0.42) * (1 - flashT * 0.32);
      core.scale.setScalar(Math.max(0.001, flashScale));
      core.rotation.x += dt * 12;
      core.rotation.y += dt * 15;
      core.material.opacity = (1 - flashT) ** 2;
      core.visible = flashT < 1;

      // 中心火球：0.22s 内膨胀扩散并快速淡出（爆炸的主体光团）
      const fireballT = clamp(t / 0.22, 0, 1);
      fireball.scale.setScalar(visualRadius * (0.5 + fireballT * 1.1));
      fireball.material.opacity = (1 - fireballT) ** 1.6 * 0.95;

      // 冲击环：扩散到实际伤害范围并淡出（交代爆炸覆盖半径）
      const ringT = clamp(t / 0.42, 0, 1);
      shockRing.scale.setScalar(0.2 + (1 - (1 - ringT) ** 2) * effectRadius * 0.98);
      shockRing.material.opacity = (1 - ringT) ** 1.4 * (isSelfDestruct ? 0.9 : 0.62);
      shockRing.visible = ringT < 1;

      // 崩裂岩块：向外飞散 + 重力回落
      rockFragments.forEach((fragment) => {
        const localT = clamp((t - fragment.userData.birth) / (1 - fragment.userData.birth), 0, 1);
        fragment.visible = t >= fragment.userData.birth;
        if (!fragment.visible) return;
        if (localT > 0.12) {
          fragment.userData.velocity.y -= 8.5 * dt;
        }
        fragment.position.addScaledVector(fragment.userData.velocity, dt);
        fragment.rotation.x += fragment.userData.spin.x * dt;
        fragment.rotation.y += fragment.userData.spin.y * dt;
        fragment.rotation.z += fragment.userData.spin.z * dt;
        fragment.scale.setScalar(1 - localT * 0.42);
        if (fragment.position.y <= 0.08 && fragment.userData.velocity.y < 0) {
          fragment.userData.velocity.y *= -0.3;
        }
        fragment.material.opacity = (1 - localT) * 0.95;
      });

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
    // 火焰中心抬到单位身体中段（而不是贴地），尺寸放大，确保在真实相机距离可见
    this.spawnFireParticlesAt(
      target.position,
      flameCount,
      0.68,
      0.46,
      Math.max(0.8, (target.projectileHitHeight ?? 1.2) * 0.72),
      {
        raiseY: (target.projectileHitHeight ?? 1.2) * 0.28,
        sizeBoost: 2.2,
        // 火焰分布在单位体型圆柱内，不向外扩散
        cylinderRadius: Math.max(0.12, (target.collisionRadius ?? 0.45) * 0.95)
      }
    );
  }

  spawnPoisonParticles(target, count = 2) {
    if (!target?.position) return;
    const poolKey = `poison:${count}`;
    // 低多边形实体毒泡：NormalBlending + emissive，颜色纯正、有体积感，
    // 覆盖层渲染（depthTest:false）不受描边影响
    const group = this.acquireParticleGroup(poolKey, count, () => {
      const bubble = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.09, 0),
        mat('#3ee88f', {
          transparent: true,
          opacity: 0.85,
          emissive: '#3ee88f',
          emissiveIntensity: 0.8,
          depthWrite: false,
          depthTest: false
        }).clone()
      );
      bubble.userData.velocity = new THREE.Vector3();
      bubble.userData.baseScale = 1;
      return bubble;
    });
    // 单位体型圆柱采样，气泡自下而上垂直流动
    const body = unitBuffCylinder(target, { radiusFactor: 0.9 });
    const height = Math.max(0.4, body.height);
    group.children.forEach((bubble) => {
      const color = Math.random() > 0.55 ? '#54f2a1' : (Math.random() > 0.45 ? '#3ee88f' : '#8cf6bd');
      setEffectMaterialColor(bubble.material, color, {
        opacity: 0.85,
        emissive: color,
        emissiveIntensity: 0.8
      });
      bubble.userData.baseScale = body.radius * (0.5 + Math.random() * 0.4);
      bubble.position.set(
        body.x + (Math.random() - 0.5) * 0.05,
        body.y + 0.18 + Math.random() * height * 0.42,
        body.z + (Math.random() - 0.5) * 0.05
      );
      bubble.rotation.set(0, 0, 0);
      bubble.scale.setScalar(bubble.userData.baseScale);
      bubble.userData.velocity.set(
        (Math.random() - 0.5) * 0.06,
        0.45 + Math.random() * 0.55,
        (Math.random() - 0.5) * 0.06
      );
    });

    this.addEffect(group, 1.05, (dt, t) => {
      group.children.forEach((bubble) => {
        bubble.position.addScaledVector(bubble.userData.velocity, dt);
        bubble.scale.setScalar(bubble.userData.baseScale * (1 - t * 0.35));
        bubble.material.opacity = 0.85 * (1 - t);
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
    // 单位体型圆柱采样：汲取能量从头到脚向下沉降（入体感）
    const body = unitBuffCylinder(target, { radiusFactor: 0.7 });
    const height = Math.max(0.4, body.height);
    group.children.forEach((mote) => {
      const color = Math.random() > 0.55 ? '#d4ff6a' : (Math.random() > 0.45 ? '#9be85c' : '#6fbf47');
      setEffectMaterialColor(mote.material, color, {
        opacity: 0.86,
        emissive: color,
        emissiveIntensity: 0.82
      });
      mote.userData.baseScale = body.radius * (0.4 + Math.random() * 0.3);
      mote.position.set(
        body.x + (Math.random() - 0.5) * 0.06,
        body.y + 0.28 + Math.random() * height * 0.68,
        body.z + (Math.random() - 0.5) * 0.06
      );
      mote.rotation.set(0, 0, 0);
      mote.scale.setScalar(mote.userData.baseScale);
      mote.userData.velocity.set(
        (Math.random() - 0.5) * 0.05,
        -(0.35 + Math.random() * 0.4),
        (Math.random() - 0.5) * 0.05
      );
      mote.userData.spin.set(
        Math.random() * 4.5,
        Math.random() * 4.5,
        Math.random() * 4.5
      );
    });

    this.addEffect(group, 0.95, (dt, t) => {
      group.children.forEach((mote) => {
        mote.position.addScaledVector(mote.userData.velocity, dt);
        mote.rotation.x += mote.userData.spin.x * dt;
        mote.rotation.y += mote.userData.spin.y * dt;
        mote.rotation.z += mote.userData.spin.z * dt;
        mote.scale.setScalar(mote.userData.baseScale * (1 - t * 0.5));
        mote.material.opacity = 0.86 * (1 - t);
      });
    }, () => this.releasePooledEffect(poolKey, group));
  }

  spawnBleedParticles(target, count = 2) {
    if (!target?.position) return;
    const group = new THREE.Group();
    const materials = [];
    // 单位体型圆柱采样：血滴在圆柱内垂直下落（不向外飞溅）
    const body = unitBuffCylinder(target, { radiusFactor: 0.75 });
    const height = Math.max(0.4, body.height);
    for (let i = 0; i < count; i += 1) {
      const color = Math.random() > 0.45 ? '#d65b4f' : '#8f2f36';
      const material = mat(color, {
        transparent: true,
        opacity: 0.82,
        emissive: '#8f2f36',
        emissiveIntensity: 0.28,
        depthWrite: false,
        depthTest: false
      }).clone();
      materials.push(material);
      const drop = new THREE.Mesh(
        new THREE.DodecahedronGeometry(body.radius * (0.34 + Math.random() * 0.28), 0),
        material
      );
      drop.position.set(
        body.x + (Math.random() - 0.5) * 0.05,
        body.y + 0.3 + Math.random() * height * 0.58,
        body.z + (Math.random() - 0.5) * 0.05
      );
      drop.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.05,
        -(0.1 + Math.random() * 0.3),
        (Math.random() - 0.5) * 0.05
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

  spawnChilledParticles(target, count = 1) {
    if (!target?.position) return;
    const poolKey = `chilled:${count}`;
    const group = this.acquireParticleGroup(poolKey, count, () => {
      const mote = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.09, 0),
        basicMat('#cdeeff', {
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false
        }).clone()
      );
      mote.userData.velocity = new THREE.Vector3();
      mote.userData.spin = new THREE.Vector3();
      mote.userData.baseScale = 1;
      return mote;
    });
    // 单位体型圆柱采样：冰晶在圆柱内垂直上浮（不环绕、不扩散）
    const body = unitBuffCylinder(target, { radiusFactor: 0.8 });
    const height = Math.max(0.4, body.height);
    group.children.forEach((mote) => {
      const color = Math.random() > 0.5 ? '#cdeeff' : (Math.random() > 0.5 ? '#9fdfff' : '#e6f7ff');
      setEffectMaterialColor(mote.material, color, {
        opacity: 0.88,
        emissive: color,
        emissiveIntensity: 0.5
      });
      mote.userData.baseScale = body.radius * (0.42 + Math.random() * 0.32);
      mote.position.set(
        body.x + (Math.random() - 0.5) * 0.06,
        body.y + 0.3 + Math.random() * height * 0.5,
        body.z + (Math.random() - 0.5) * 0.06
      );
      mote.rotation.set(0, 0, 0);
      mote.scale.setScalar(mote.userData.baseScale);
      mote.userData.velocity.set(
        (Math.random() - 0.5) * 0.05,
        0.35 + Math.random() * 0.4,
        (Math.random() - 0.5) * 0.05
      );
      mote.userData.spin.set(
        (Math.random() - 0.5) * 3.4,
        (Math.random() - 0.5) * 3.4,
        (Math.random() - 0.5) * 3.4
      );
    });

    this.addEffect(group, 1.0, (dt, t) => {
      group.children.forEach((mote) => {
        mote.position.addScaledVector(mote.userData.velocity, dt);
        mote.rotation.x += mote.userData.spin.x * dt;
        mote.rotation.y += mote.userData.spin.y * dt;
        mote.rotation.z += mote.userData.spin.z * dt;
        mote.scale.setScalar(mote.userData.baseScale * (0.72 + Math.sin(t * Math.PI) * 0.34));
        mote.material.opacity = 0.88 * (1 - t);
      });
    }, () => this.releasePooledEffect(poolKey, group));
  }

  spawnCurseParticles(target, count = 2) {
    if (!target?.position) return;
    const group = new THREE.Group();
    const materials = [];
    // 单位体型圆柱采样：诅咒烟雾在圆柱内垂直上浮（不向外扩散）
    const body = unitBuffCylinder(target, { radiusFactor: 0.85 });
    const height = Math.max(0.4, body.height);
    for (let i = 0; i < count; i += 1) {
      const color = Math.random() > 0.5 ? '#b46aff' : '#6f47c7';
      const material = mat(color, {
        transparent: true,
        opacity: 0.76,
        emissive: color,
        emissiveIntensity: 0.72,
        depthWrite: false,
        depthTest: false
      }).clone();
      materials.push(material);
      const mote = new THREE.Mesh(
        new THREE.DodecahedronGeometry(body.radius * (0.42 + Math.random() * 0.32), 0),
        material
      );
      mote.position.set(
        body.x + (Math.random() - 0.5) * 0.06,
        body.y + 0.24 + Math.random() * height * 0.5,
        body.z + (Math.random() - 0.5) * 0.06
      );
      mote.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.05,
        0.35 + Math.random() * 0.45,
        (Math.random() - 0.5) * 0.05
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

  spawnFireParticlesAt(position, count = 3, duration = 0.48, radius = 0.35, height = 1.1, options = {}) {
    const raiseY = Number.isFinite(options.raiseY) ? options.raiseY : 0;
    const sizeBoost = Number.isFinite(options.sizeBoost) ? options.sizeBoost : 1;
    // 火焰分布在单位体型圆柱内，不向外扩散
    const cylinderRadius = Number.isFinite(options.cylinderRadius)
      ? options.cylinderRadius
      : radius;
    const poolKey = `fire:${count}`;
    const group = this.acquireParticleGroup(poolKey, count, () => createPooledFireParticle());
    // 无 preserveRenderLayers → addEffect 归入 layer 1 覆盖通道，绕过屏幕描边
    const groundY = (position.y ?? 0) + 0.06 + raiseY;
    group.children.forEach((particle) => {
      // MC 风格：红→橙→黄→白的火焰粒子，从底部冒出向上飞升
      const depth = Math.random();
      const color = depth > 0.78
        ? '#fff7c2'
        : (depth > 0.5 ? '#ffd95a' : (depth > 0.16 ? '#ff8a32' : '#ff4a1a'));
      particle.material.color.set(color).multiplyScalar(2.4);
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * cylinderRadius;
      const baseX = position.x + Math.cos(angle) * distance;
      const baseZ = position.z + Math.sin(angle) * distance;
      particle.userData.base.set(baseX, groundY, baseZ);
      particle.userData.phase = Math.random() * Math.PI * 2;
      particle.userData.delay = Math.random() * 0.14;
      // 上升高度与粒子大小随火焰范围缩放
      particle.userData.flameHeight = Math.max(0.4, height * (0.55 + Math.random() * 0.45)) * (sizeBoost * 0.8);
      particle.userData.flameWidth = Math.max(0.08, cylinderRadius * (0.24 + Math.random() * 0.2) * sizeBoost);
      particle.userData.sway = 0.045 + Math.random() * 0.11;
      particle.userData.baseScale = 1;
      particle.position.set(baseX, groundY, baseZ);
      particle.scale.setScalar(particle.userData.flameWidth * 0.5);
      particle.rotation.z = 0;
    });

    this.addEffect(group, duration, (dt, t) => {
      group.children.forEach((particle) => {
        const localT = clamp((t - particle.userData.delay) / Math.max(0.01, 1 - particle.userData.delay), 0, 1);
        // 先快后慢上升：快速离火、逐渐减速
        const rise = 1 - (1 - localT) ** 2;
        const swayX = Math.sin(particle.userData.phase + localT * 7) * particle.userData.sway * rise;
        const swayZ = Math.cos(particle.userData.phase * 0.8 + localT * 5.5) * particle.userData.sway * rise;
        particle.position.set(
          particle.userData.base.x + swayX,
          particle.userData.base.y + particle.userData.flameHeight * rise,
          particle.userData.base.z + swayZ
        );
        // 上升中缩小、亮度渐隐
        const scale = particle.userData.flameWidth * (1.05 - rise * 0.75);
        particle.scale.set(scale * 0.8, scale * 1.25, 1);
        particle.material.opacity = Math.min(1, localT * 7) * (1 - localT) ** 1.5 * 0.92;
        particle.rotation.z += dt * 0.4;
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
    // 治疗区域：明亮翠绿的软边光点持续上升。采用共享软粒子纹理 + 加法混合：
    // 加法只增不减，任何底色上都不会发黑；透明度渐变由纹理 alpha 承担，
    // 粒子出现/消失由整体缩放包络驱动（快速淡入-保持-顶部急速收缩消逝）。
    // 刻意留在 layer 0 主通道：软边径向渐变的相邻像素色差低于屏幕空间描边阈值，
    // 不会被描边扫出硬边；而 layer 1 覆盖通道在部分浏览器环境下不渲染，不可依赖。
    const moteMaterial = createSoftParticleMaterial('#3dee8a', {
      opacity: 0.92,
      depthTest: true,
      toneMapped: false
    });
    // 拖尾共用两层递减透明度材质，跟随主体形成彗尾
    const trailMaterials = [0.38, 0.18].map((opacity) => createSoftParticleMaterial('#3dee8a', {
      opacity,
      depthTest: true,
      toneMapped: false
    }));
    const motes = [];
    const trails = [];
    const moteCount = 26;
    for (let index = 0; index < moteCount; index += 1) {
      const mote = new THREE.Sprite(moteMaterial);
      mote.userData.angle = Math.random() * Math.PI * 2;
      mote.userData.distance = Math.sqrt((index + 0.5) / moteCount);
      mote.userData.cycle = Math.random();
      // 从地面直线上升；尺寸与速度都有差异，避免完全一致。
      // 附带随机自旋，抵消 Sprite 方形边缘的呆板感。
      mote.userData.spin = (Math.random() - 0.5) * 0.9;
      mote.userData.riseSpeed = 0.5 + Math.random() * 0.38;
      mote.userData.baseScale = 0.2 + Math.random() * 0.15;
      group.add(mote);
      motes.push(mote);
      // 约三分之一粒子带拖尾：两节回声 Sprite 依次跟随前一节，形成渐隐彗尾
      if (index % 3 === 0) {
        const echoes = trailMaterials.map((material) => {
          const echo = new THREE.Sprite(material);
          group.add(echo);
          return echo;
        });
        trails.push({ echoes, mote });
      }
    }
    this.scene.add(group);
    this.recoveryAura = {
      group,
      center: nextCenter,
      radius: nextRadius,
      motes,
      trails,
      moteMaterial,
      trailMaterials,
      phase: 0
    };
    return true;
  }

  updateRecoveryAura(dt) {
    const aura = this.recoveryAura;
    if (!aura) return;
    aura.phase += dt;
    aura.group.position.copy(aura.center).addScaledVector(METEOR_TRAIL_AXIS, 0.055);
    const riseHeight = 2.1;
    aura.motes.forEach((mote) => {
      mote.userData.cycle = (mote.userData.cycle + dt * mote.userData.riseSpeed / riseHeight) % 1;
      const cycle = mote.userData.cycle;
      // 直线上升：水平位置固定，不随时间摆动
      const angle = mote.userData.angle;
      mote.position.set(
        Math.cos(angle) * aura.radius * mote.userData.distance,
        0.14 + cycle * riseHeight,
        Math.sin(angle) * aura.radius * mote.userData.distance
      );
      // 快速淡入后保持，顶部约 12% 生命周期内急速收缩消逝
      const fadeIn = Math.min(1, cycle / 0.09);
      const fadeOut = cycle > 0.88 ? Math.max(0, (1 - cycle) / 0.12) ** 0.75 : 1;
      const envelope = fadeIn * fadeOut;
      const moteScale = mote.userData.baseScale * (0.72 + 0.55 * envelope);
      mote.scale.set(moteScale, moteScale, 1);
      mote.rotation.z = (mote.userData.spin ?? 0) + Math.sin(aura.phase * 2.1 + angle) * 0.12;
    });

    // 拖尾回声依次跟随，靠阻尼滞后形成渐隐彗尾
    aura.trails.forEach(({ echoes, mote }) => {
      let target = mote.position;
      echoes.forEach((echo, echoIndex) => {
        echo.position.lerp(target, 0.4 - echoIndex * 0.12);
        const echoScale = mote.scale.x * (0.7 - echoIndex * 0.22);
        echo.scale.set(echoScale, echoScale, 1);
        target = echo.position;
      });
    });
  }

  clearRecoveryAura() {
    const aura = this.recoveryAura;
    if (!aura) return;
    aura.group.parent?.remove(aura.group);
    aura.moteMaterial.dispose();
    aura.trailMaterials.forEach((material) => material.dispose());
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

  spawnJudgmentSword(position, radius = 0.9, onImpact, options = {}) {
    // 剑体随攻击者体型缩放（小兵 ~0.6，Boss ~2 倍以上）；半径也随体型
    const scale = Math.max(0.5, Number(options.scale) || 1);
    const root = new THREE.Group();
    root.position.set(position.x, (position.y ?? 0) + 0.06, position.z);
    root.scale.setScalar(scale);
    root.userData.judgmentSwordScale = scale;

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
    // 落点环与冲击波：渐变 + 轻微扭曲，按目标体型缩放
    const ring = this.createShockRingMesh('#d6aa4a', [3.0, 1.9, 0.35]);
    ring.scale.setScalar(radius);
    ring.position.y = 0.012;
    group.add(ring);
    const shockwave = this.createShockRingMesh('#fff0ad', [3.2, 2.2, 0.5], {
      innerRadius: 0.3,
      outerRadius: 0.46
    });
    shockwave.scale.setScalar(radius);
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
      ring.scale.setScalar(radius * (1 + t * 1.6));
      ring.material.opacity = Math.max(0, (1 - t) * 0.68);
      shockwave.scale.setScalar(radius * (1 + t * 5.1));
      shockwave.material.opacity = Math.max(0, (1 - t) * 0.74);
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
      // ring/shockwave 由 createShockRingMesh 创建，各自持有独立材质（共享渐变纹理不受 material.dispose 影响）
      ring.material.dispose();
      shockwave.material.dispose();
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
    // 下落采用重力加速曲线（无末端减速），整体飞行时间缩短让落地更干脆。
    const flightDuration = 0.92;
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
      const ease = t * t;
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
      // 扬尘尺度加倍，让落地冲击更有分量
      puff.userData.baseScale = radius * (0.15 + Math.random() * 0.17);
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

    // —— 多道橙黄光束向上喷发：不再是单柱“喷泉” ——
    const beamMaterialHdr = basicMat('#ffb347', {
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false
    }).clone();
    beamMaterialHdr.color.setRGB(3.1, 1.5, 0.28);
    const beamCoreMaterialHdr = basicMat('#ffe08a', {
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false
    }).clone();
    beamCoreMaterialHdr.color.setRGB(3.8, 2.4, 0.55);
    const beams = [];
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2 + Math.random() * 0.4;
      const offset = radius * (0.06 + Math.random() * 0.1);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.2, 1, 7, 1, true),
        index % 3 === 0 ? beamCoreMaterialHdr : beamMaterialHdr
      );
      beam.position.set(
        Math.cos(angle) * offset,
        0,
        Math.sin(angle) * offset
      );
      beam.rotation.set(
        (Math.random() - 0.5) * 0.22,
        angle,
        (Math.random() - 0.5) * 0.18
      );
      beam.userData.angle = angle;
      beam.userData.height = radius * (1.35 + Math.random() * 0.55);
      beam.userData.phase = Math.random() * Math.PI * 2;
      beam.userData.delay = Math.random() * 0.12;
      beam.renderOrder = 1515;
      beams.push(beam);
      group.add(beam);
    }

    // —— 喷发粒子：沿光束高速向上穿行，顶部散开淡出 ——
    const eruptMaterial = createSoftParticleSprite('#ffc24d', {
      falloff: 'tight',
      opacity: 0,
      depthTest: false,
      toneMapped: false
    });
    eruptMaterial.material.color.multiplyScalar(3.0);
    const eruptCoreParticles = [];
    for (let index = 0; index < 26; index += 1) {
      const particle = createSoftParticleSprite(
        index % 4 === 0 ? '#fff0b3' : (index % 3 === 0 ? '#ff8f2e' : '#ffb347'),
        {
          falloff: 'tight',
          opacity: 0,
          depthTest: false,
          toneMapped: false
        }
      );
      particle.material.color.multiplyScalar(2.8);
      const beamIndex = index % beams.length;
      const beam = beams[beamIndex];
      particle.userData.beamIndex = beamIndex;
      particle.userData.height = beam.userData.height * (0.7 + Math.random() * 0.45);
      particle.userData.speed = 2.2 + Math.random() * 2.6;
      particle.userData.phase = Math.random() * Math.PI * 2;
      particle.userData.spread = 0.055 + Math.random() * 0.07;
      particle.userData.birth = Math.random() * 0.3;
      particle.userData.baseScale = radius * (0.05 + Math.random() * 0.05);
      eruptCoreParticles.push(particle);
      group.add(particle);
    }

    // 顶部溅落碎粒：喷到高处后向四周抛散回落
    const splashParticles = [];
    for (let index = 0; index < 14; index += 1) {
      const particle = createSoftParticleSprite('#ff9a3d', {
        falloff: 'tight',
        opacity: 0,
        depthTest: false,
        toneMapped: false
      });
      particle.material.color.multiplyScalar(2.6);
      particle.userData.angle = (index / 14) * Math.PI * 2 + Math.random() * 0.4;
      particle.userData.phase = Math.random() * Math.PI * 2;
      particle.userData.baseScale = radius * (0.04 + Math.random() * 0.04);
      splashParticles.push(particle);
      group.add(particle);
    }
    const plumeHeightRef = { value: Math.max(1, radius * 1.5) };

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
      const open = clamp(t / 0.12, 0, 1);
      const collapse = clamp((t - 0.68) / 0.3, 0, 1);
      const intensity = open * (1 - collapse);
      const plumeHeight = Math.max(0.1, radius * 1.5 * (0.55 + Math.sin(t * 11) * 0.08) * intensity);

      heatDisc.scale.setScalar(radius * (0.34 + t * 0.42));
      shockwave.scale.setScalar(radius * (0.24 + t * 0.94));
      heatMaterial.opacity = 0.44 * (1 - t) ** 1.25;
      crackMaterial.opacity = 0.76 * (1 - t * 0.7) * (0.78 + Math.sin(t * 40) * 0.12);
      cracks.forEach((crack) => {
        const crackFlicker = 0.88 + Math.sin(crack.userData.phase + t * 56) * 0.12;
        crack.scale.z = crackFlicker;
      });

      // 多道橙黄光束：从喷口向上喷发，带高频闪烁与轻微摇摆
      beams.forEach((beam) => {
        const localT = clamp((t - beam.userData.delay) / (1 - beam.userData.delay), 0, 1);
        const flicker = 0.86 + Math.sin(beam.userData.phase + t * 47) * 0.14;
        const heightScale = Math.max(0.01, beam.userData.height * Math.sin(localT * Math.PI) * flicker);
        const widthScale = Math.max(0.01, radius * (0.04 + intensity * 0.045));
        beam.position.y = heightScale * 0.5;
        beam.scale.set(widthScale, heightScale, widthScale);
        beam.rotation.z += Math.sin(beam.userData.phase + t * 9) * 0.012;
        beam.material.opacity = 0.85 * Math.sin(localT * Math.PI);
        beam.visible = localT > 0.01 && localT < 0.99;
      });

      // 喷发粒子：沿光束高速上冲，顶部散开淡出（先快后慢）
      eruptCoreParticles.forEach((particle) => {
        const localT = clamp((t - particle.userData.birth) / (1 - particle.userData.birth), 0, 1);
        if (particle.userData.birth > t) {
          particle.visible = false;
          return;
        }
        particle.visible = localT < 1;
        const beam = beams[particle.userData.beamIndex] ?? beams[0];
        const up = 1 - (1 - Math.min(1, localT * 1.5)) ** 2;
        const height = particle.userData.height * up;
        const fadeIn = Math.min(1, localT * 9);
        const fadeOut = 1 - Math.min(1, Math.max(0, localT - 0.62) / 0.38);
        particle.position.set(
          beam.position.x + Math.cos(particle.userData.phase) * particle.userData.spread * up,
          height + beam.userData.height * 0.1,
          beam.position.z + Math.sin(particle.userData.phase) * particle.userData.spread * up
        );
        const scale = particle.userData.baseScale * (0.75 + 0.5 * fadeOut);
        particle.scale.set(scale, scale * 1.6, 1);
        particle.material.opacity = fadeIn * fadeOut * 0.92;
      });

      // 顶部溅落碎粒：喷到高处向四周抛散回落
      splashParticles.forEach((particle) => {
        const localT = clamp((t - 0.22) / (1 - 0.22), 0, 1);
        if (t < 0.22) {
          particle.visible = false;
          return;
        }
        particle.visible = localT < 1;
        const rise = Math.sin(Math.min(1, localT * 1.3) * Math.PI);
        const h = plumeHeightRef.value * (0.62 + rise * 0.55);
        particle.position.set(
          Math.cos(particle.userData.angle) * radius * 0.22 * localT,
          h - localT * h * 0.85,
          Math.sin(particle.userData.angle) * radius * 0.22 * localT
        );
        const scale = particle.userData.baseScale * (1 - localT * 0.5);
        particle.scale.set(scale, scale, 1);
        particle.material.opacity = (1 - localT) * 0.9;
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

// 烟花火星方向：全球面均匀分布（MC 风格球形爆裂，不偏向上半球）
function randomFireworkDirection() {
  const z = Math.random() * 2 - 1;
  const phi = Math.random() * Math.PI * 2;
  const radial = Math.sqrt(Math.max(0, 1 - z * z));
  return new THREE.Vector3(
    Math.cos(phi) * radial,
    z,
    Math.sin(phi) * radial
  );
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
  // MC 风格火焰粒子：软边发光粒子（HDR 橙黄），不是锥形火苗
  const particle = createSoftParticleSprite('#ff8a32', {
    falloff: 'tight',
    opacity: 0,
    depthTest: false,
    toneMapped: false
  });
  particle.material.color.multiplyScalar(2.6);
  particle.userData.velocity = new THREE.Vector3();
  particle.userData.spin = new THREE.Vector3();
  particle.userData.base = new THREE.Vector3();
  particle.userData.baseScale = 1;
  particle.userData.phase = 0;
  particle.userData.delay = 0;
  particle.userData.flameHeight = 1;
  particle.userData.flameWidth = 0.2;
  particle.userData.sway = 0.05;
  return particle;
}

// buff 粒子单位体型圆柱采样：半径/高度随单位碰撞半径与命中高度缩放，
// 粒子只在圆柱体内垂直流动（向上或向下），不再向外扩散
function unitBuffCylinder(unit, { radiusFactor = 0.9, heightFactor = 0.75 } = {}) {
  const radius = Math.max(0.12, (unit.collisionRadius ?? 0.45) * radiusFactor);
  const height = Math.max(0.4, (unit.projectileHitHeight ?? 1.2) * heightFactor);
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.sqrt(Math.random()) * radius;
  return {
    x: unit.position.x + Math.cos(angle) * distance,
    y: unit.position.y ?? 0,
    z: unit.position.z + Math.sin(angle) * distance,
    radius,
    height
  };
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
