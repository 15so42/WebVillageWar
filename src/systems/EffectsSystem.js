import * as THREE from 'three';
import { basicMat, mat } from '../art/lowpoly.js';
import { createAreaEffectVisual, updateAreaEffectVisual } from '../art/areaEffectVisual.js';
import { createSpellModel } from '../art/visualRegistry.js';
import { disposeObject3D } from '../utils/dispose.js';
import { clamp, lerp } from '../utils/math.js';

const MAX_ACTIVE_EFFECTS = 260;
const MAX_POOLED_EFFECTS_PER_KEY = 56;
const METEOR_TRAIL_AXIS = new THREE.Vector3(0, 1, 0);

export class EffectsSystem {
  constructor(scene) {
    this.scene = scene;
    this.effects = [];
    this.effectPools = new Map();
    this.damageNumberTextureCache = new Map();
    this.recoveryTimer = 0;
  }

  update(dt) {
    this.recoveryTimer -= dt;
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
    const poolKey = 'hit:5';
    const group = this.acquirePooledEffect(poolKey, () => {
      const pooledGroup = new THREE.Group();
      for (let i = 0; i < 5; i += 1) {
        const spark = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.07, 0),
          mat('#f6e7a0', { emissive: '#f6e7a0', emissiveIntensity: 0.45 })
        );
        spark.userData.velocity = new THREE.Vector3();
        pooledGroup.add(spark);
      }
      return pooledGroup;
    });
    group.children.forEach((spark) => {
      setEffectMaterialColor(spark.material, color, {
        emissive: color,
        emissiveIntensity: 0.45
      });
      spark.position.copy(position);
      spark.rotation.set(0, 0, 0);
      spark.scale.setScalar(1);
      spark.userData.velocity.set(
        (Math.random() - 0.5) * 3,
        1 + Math.random() * 2,
        (Math.random() - 0.5) * 3
      );
    });
    this.addEffect(group, 0.48, (dt, t) => {
      group.children.forEach((spark) => {
        spark.userData.velocity.y -= 5 * dt;
        spark.position.addScaledVector(spark.userData.velocity, dt);
        spark.scale.setScalar(1 - t * 0.7);
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
    const duration = options.duration ?? 0.58;
    const hitAt = 0.58;
    const group = new THREE.Group();
    const forward = direction.clone().normalize();
    const beamCenter = startPoint.clone().addScaledVector(direction, 0.5);

    const beam = new THREE.Group();
    beam.position.copy(beamCenter);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
    beam.renderOrder = 1830;

    const coreMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      depthTest: false
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: hotColor,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      depthTest: false
    });
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, length), coreMaterial);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, Math.max(0.18, length * 0.96)), glowMaterial);
    core.renderOrder = 1832;
    glow.renderOrder = 1831;
    beam.add(glow, core);

    const boltMaterial = mat(color, {
      transparent: true,
      opacity: 1,
      emissive: hotColor,
      emissiveIntensity: 1.25,
      depthWrite: false
    }).clone();
    const bolt = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), boltMaterial);
    bolt.position.copy(startPoint);
    bolt.scale.set(0.9, 0.9, 1.28);
    bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
    bolt.renderOrder = 1834;

    const sourceY = Math.max(0.08, startPoint.y - 1.85);
    const sourceGroup = new THREE.Group();
    sourceGroup.position.set(startPoint.x, sourceY, startPoint.z);
    const sourceDiscMaterial = basicMat(hotColor, {
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false
    }).clone();
    const sourceRingMaterial = basicMat(color, {
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false
    }).clone();
    const sourceDisc = new THREE.Mesh(new THREE.CircleGeometry(0.72, 28), sourceDiscMaterial);
    const sourceRing = new THREE.Mesh(new THREE.RingGeometry(0.84, 1.02, 36), sourceRingMaterial);
    [sourceDisc, sourceRing].forEach((mesh) => {
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 1828;
      sourceGroup.add(mesh);
    });

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
    for (let i = 0; i < 12; i += 1) {
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

    group.add(beam, bolt, sourceGroup, impactGroup);
    this.addEffect(group, duration, (dt, t) => {
      const flightT = clamp(t / hitAt, 0, 1);
      const easedFlight = 1 - (1 - flightT) ** 2;
      bolt.position.lerpVectors(startPoint, endPoint, easedFlight);
      bolt.rotation.x += dt * 7.5;
      bolt.rotation.z += dt * 10.5;

      const beamFade = Math.max(0, 1 - t * 1.25);
      core.material.opacity = 0.92 * beamFade;
      glow.material.opacity = 0.32 * beamFade;
      beam.scale.set(1 + flightT * 0.08, 1 + flightT * 0.08, Math.max(0.16, 1 - flightT * 0.34));
      bolt.material.opacity = Math.max(0, 1 - clamp((t - hitAt * 0.78) / 0.22, 0, 1));

      const sourcePulse = Math.sin(clamp(t / 0.42, 0, 1) * Math.PI);
      sourceGroup.scale.setScalar(0.78 + t * 0.72);
      sourceDisc.material.opacity = 0.2 * Math.max(0, 1 - t * 1.4);
      sourceRing.material.opacity = 0.82 * Math.max(0, 1 - t * 1.5) * (0.65 + sourcePulse * 0.35);

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
    });
  }

  spawnDeathBurst(position, radius = 0.8) {
    const group = new THREE.Group();
    group.position.set(position.x, position.y ?? 0, position.z);

    const particleMaterial = mat('#f7fbff', {
      transparent: true,
      opacity: 0.92,
      emissive: '#ffffff',
      emissiveIntensity: 0.72,
      depthWrite: false
    }).clone();
    const flashMaterial = basicMat('#ffffff', {
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone();

    const flash = new THREE.Mesh(
      new THREE.CircleGeometry(0.56, 28),
      flashMaterial
    );
    flash.rotation.x = -Math.PI / 2;
    flash.position.y = 0.08;
    flash.renderOrder = 1700;
    group.add(flash);

    for (let i = 0; i < 22; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const lift = 0.25 + Math.random() * 1.15;
      const speed = 1.6 + Math.random() * 3.2;
      const baseScale = 0.045 + Math.random() * 0.075;
      const particle = new THREE.Mesh(
        new THREE.DodecahedronGeometry(baseScale, 0),
        particleMaterial
      );
      particle.position.set(
        (Math.random() - 0.5) * radius * 0.28,
        0.28 + Math.random() * 0.72,
        (Math.random() - 0.5) * radius * 0.28
      );
      particle.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * speed * (0.55 + Math.random() * 0.45),
        lift + Math.random() * 1.6,
        Math.sin(angle) * speed * (0.55 + Math.random() * 0.45)
      );
      particle.userData.spin = new THREE.Vector3(
        Math.random() * 10,
        Math.random() * 10,
        Math.random() * 10
      );
      particle.userData.baseScale = baseScale;
      group.add(particle);
    }

    this.addEffect(group, 0.68, (dt, t) => {
      flash.scale.setScalar(1 + t * 3.2);
      flash.material.opacity = 0.48 * (1 - t) ** 1.6;
      group.children.forEach((particle) => {
        if (!particle.userData.velocity) return;
        particle.userData.velocity.y -= 3.4 * dt;
        particle.position.addScaledVector(particle.userData.velocity, dt);
        particle.rotation.x += particle.userData.spin.x * dt;
        particle.rotation.y += particle.userData.spin.y * dt;
        particle.rotation.z += particle.userData.spin.z * dt;
        particle.scale.setScalar(1 - t * 0.72);
      });
      particleMaterial.opacity = 0.92 * (1 - t);
    }, () => {
      particleMaterial.dispose();
      flashMaterial.dispose();
    });
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
      text: `能量+${formatResourceAmount(amount)}`,
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
    if (this.recoveryTimer > 0) return;
    this.recoveryTimer = 0.11;
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

    const trailBeamMaterial = basicMat('#ff7a2f', {
      transparent: true,
      opacity: 0.72,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    }).clone();
    const trailBeam = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.4, 12, 1, true), trailBeamMaterial);
    trailBeam.renderOrder = 1598;
    group.add(trailBeam);

    const trailMaterial = basicMat('#ff9a3d', {
      transparent: true,
      opacity: 0.8,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const trail = [];
    for (let index = 0; index < 12; index += 1) {
      const ember = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.14 + index * 0.02, 0),
        trailMaterial
      );
      ember.userData.phase = Math.random() * Math.PI * 2;
      ember.userData.side = (Math.random() - 0.5) * (0.16 + index * 0.035);
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

    const start = new THREE.Vector3(position.x - 2.7, (position.y ?? 0) + 9.8, position.z - 2.35);
    const end = new THREE.Vector3(position.x, (position.y ?? 0) + 1.08, position.z);
    const trailDirection = start.clone().sub(end).normalize();
    let impacted = false;
    this.addEffect(group, 1.18, (dt, t) => {
      const ease = t * t * (3 - 2 * t);
      meteor.position.lerpVectors(start, end, ease);
      meteor.rotation.x += dt * 8.4;
      meteor.rotation.y += dt * 6.1;
      halo.position.copy(meteor.position);
      const flicker = 1 + Math.sin(t * 56) * 0.09;
      halo.scale.setScalar(meteorScale * (1.2 + (1 - t) * 0.3) * flicker);
      haloMaterial.opacity = 0.34 + (1 - t) * 0.24;
      coreFlare.scale.setScalar(0.8 + flicker * 0.18);
      coreFlareMaterial.opacity = 0.66 + (1 - t) * 0.22;
      trailBeam.position.copy(meteor.position).addScaledVector(trailDirection, 1.55);
      trailBeam.quaternion.setFromUnitVectors(METEOR_TRAIL_AXIS, trailDirection);
      trailBeam.scale.setScalar(0.72 + (1 - t) * 0.34);
      trailBeamMaterial.opacity = 0.3 + (1 - t) * 0.46;

      trail.forEach((ember, index) => {
        const distance = 0.52 + index * 0.31;
        ember.position.copy(meteor.position).addScaledVector(trailDirection, distance);
        const side = ember.userData.side * (0.45 + t);
        ember.position.x += Math.sin(ember.userData.phase + t * 24) * side;
        ember.position.z += Math.cos(ember.userData.phase + t * 21) * side;
        const taper = 1 - index / (trail.length + 2);
        ember.scale.setScalar(taper * (0.72 + Math.sin(ember.userData.phase + t * 40) * 0.18));
        ember.rotation.x += dt * (4 + index * 0.35);
        ember.rotation.y -= dt * (3 + index * 0.28);
      });
      trailMaterial.opacity = 0.5 + (1 - t) * 0.4;
      shadow.scale.setScalar(radius * lerp(0.22, 0.72, ease));
      shadowMaterial.opacity = lerp(0.08, 0.34, ease);

      if (!impacted && t > 0.9) {
        impacted = true;
        this.spawnMeteorImpact(position, radius);
        onImpact?.();
      }
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

    const dustMaterial = basicMat('#c65c2f', {
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
      depthWrite: false
    }).clone();
    const dustRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.92, 36), dustMaterial);
    dustRing.rotation.x = -Math.PI / 2;
    group.add(dustRing);

    const fragmentMaterial = mat('#5a4034', {
      emissive: '#7c2d16',
      emissiveIntensity: 0.46,
      roughness: 0.86
    }).clone();
    const fragments = [];
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2 + Math.random() * 0.28;
      const fragment = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.1 + Math.random() * 0.13, 0),
        fragmentMaterial
      );
      fragment.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * (2.2 + Math.random() * 2.4),
        1.4 + Math.random() * 2.8,
        Math.sin(angle) * (2.2 + Math.random() * 2.4)
      );
      fragments.push(fragment);
      group.add(fragment);
    }

    const emberMaterial = basicMat('#ffb24f', {
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }).clone();
    const embers = [];
    for (let index = 0; index < 10; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const ember = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), emberMaterial);
      ember.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * (1.5 + Math.random() * 3),
        2.2 + Math.random() * 3.6,
        Math.sin(angle) * (1.5 + Math.random() * 3)
      );
      embers.push(ember);
      group.add(ember);
    }

    this.addEffect(group, 0.78, (dt, t) => {
      const expansion = radius * (0.42 + t * 0.88);
      flash.scale.set(expansion, expansion * (0.42 + t * 0.3), expansion);
      flashMaterial.opacity = 0.88 * (1 - t) ** 2;
      dustRing.scale.setScalar(radius * (0.72 + t * 0.7));
      dustMaterial.opacity = 0.58 * (1 - t);
      fragments.forEach((fragment) => {
        fragment.position.addScaledVector(fragment.userData.velocity, dt);
        fragment.userData.velocity.y -= 7.5 * dt;
        fragment.rotation.x += dt * 8;
        fragment.rotation.z += dt * 6;
        fragment.scale.setScalar(1 - t * 0.45);
      });
      embers.forEach((ember) => {
        ember.position.addScaledVector(ember.userData.velocity, dt);
        ember.userData.velocity.y -= 4.6 * dt;
        ember.scale.setScalar(1 - t * 0.72);
      });
      emberMaterial.opacity = 0.9 * (1 - t);
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

function formatDamage(value) {
  if (value >= 10) return String(Math.round(value));
  return value.toFixed(1).replace(/\.0$/, '');
}

function damageNumberColor(damageType) {
  if (damageType === 'true') return '#ffffff';
  if (damageType === 'magic') return '#9bdcff';
  return '#ff9b35';
}

function formatResourceAmount(value) {
  if (value >= 1) return value.toFixed(1).replace(/\.0$/, '');
  return value.toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
}

function createPooledParticle(color, materialOptions = {}) {
  const particle = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1, 0),
    mat(color, materialOptions).clone()
  );
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
