import * as THREE from 'three';
import { basicMat, mat } from '../art/lowpoly.js';
import { createSpellModel } from '../art/visualRegistry.js';
import { clamp, lerp } from '../utils/math.js';

export class EffectsSystem {
  constructor(scene) {
    this.scene = scene;
    this.effects = [];
    this.recoveryTimer = 0;
  }

  update(dt) {
    this.recoveryTimer -= dt;
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i];
      effect.age += dt;
      effect.update?.(dt, effect.age / effect.duration);
      if (effect.age >= effect.duration) {
        effect.dispose?.();
        this.scene.remove(effect.object);
        this.effects.splice(i, 1);
      }
    }
  }

  addEffect(object, duration, update, dispose) {
    this.scene.add(object);
    this.effects.push({
      object,
      duration,
      age: 0,
      update,
      dispose
    });
  }

  spawnRing(position, color = '#ffffff', radius = 1, duration = 0.55) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 42),
      basicMat(color, {
        transparent: true,
        opacity: 0.76,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false
      }).clone()
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, (position.y ?? 0) + 0.08, position.z);
    ring.renderOrder = 1500;
    ring.scale.setScalar(radius);
    this.addEffect(ring, duration, (_, t) => {
      ring.scale.setScalar(radius * (1 + t * 0.45));
      ring.material.opacity = 0.76 * (1 - t);
    });
  }

  spawnMoveDestination(position, radius = 1) {
    const group = new THREE.Group();
    group.position.set(position.x, (position.y ?? 0) + 0.09, position.z);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.74, 42),
      basicMat('#78e3ff', {
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false
      }).clone()
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 1, 48),
      basicMat('#fff2a8', {
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false
      }).clone()
    );
    const inner = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.34, 32),
      basicMat('#6ef0c4', {
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false
      }).clone()
    );
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.11, 1.35, 8),
      basicMat('#9dd8ff', {
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
    });
  }

  spawnHit(position, color = '#f6e7a0') {
    const group = new THREE.Group();
    for (let i = 0; i < 5; i += 1) {
      const spark = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.07, 0),
        mat(color, { emissive: color, emissiveIntensity: 0.45 })
      );
      spark.position.copy(position);
      spark.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        1 + Math.random() * 2,
        (Math.random() - 0.5) * 3
      );
      group.add(spark);
    }
    this.addEffect(group, 0.48, (dt, t) => {
      group.children.forEach((spark) => {
        spark.userData.velocity.y -= 5 * dt;
        spark.position.addScaledVector(spark.userData.velocity, dt);
        spark.scale.setScalar(1 - t * 0.7);
      });
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
    const color = options.color ?? (damageType === 'true' ? '#ffffff' : '#ff9b35');
    const stroke = options.stroke ?? '#000000';
    const canvas = document.createElement('canvas');
    canvas.width = options.text ? 768 : 512;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    let fontSize = options.fontSize ?? 116;
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
    context.strokeStyle = stroke;
    context.fillStyle = color;
    context.strokeText(text, 256, 126);
    context.fillText(text, 256, 126);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: texture,
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
    const baseWidth = baseHeight * (canvas.width / canvas.height);
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
      texture.dispose();
      material.dispose();
    });
  }

  spawnHealNumber(position, amount, options = {}) {
    if (amount <= 0.01) return;
    this.spawnDamageNumber(position, amount, {
      text: `+${formatDamage(amount)}`,
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
    this.spawnFireParticlesAt(position, 5, 0.44, 0.36);
  }

  spawnBurningParticles(target, count = 2) {
    if (!target?.position) return;
    this.spawnFireParticlesAt(target.position, count, 0.5, 0.42, target.projectileHitHeight ?? 1.2);
  }

  spawnPoisonParticles(target, count = 2) {
    if (!target?.position) return;
    const group = new THREE.Group();
    const materials = [];
    const height = target.projectileHitHeight ?? 1.2;
    for (let i = 0; i < count; i += 1) {
      const color = Math.random() > 0.5 ? '#a7e86d' : '#5cc66a';
      const material = mat(color, {
        transparent: true,
        opacity: 0.82,
        emissive: color,
        emissiveIntensity: 0.55,
        depthWrite: false
      }).clone();
      materials.push(material);
      const bubble = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.035 + Math.random() * 0.045, 0),
        material
      );
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * 0.38;
      bubble.position.set(
        target.position.x + Math.cos(angle) * distance,
        (target.position.y ?? 0) + 0.22 + Math.random() * height * 0.5,
        target.position.z + Math.sin(angle) * distance
      );
      bubble.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * (0.08 + Math.random() * 0.28),
        1.05 + Math.random() * 0.85,
        Math.sin(angle) * (0.08 + Math.random() * 0.28)
      );
      group.add(bubble);
    }

    this.addEffect(group, 0.76, (dt, t) => {
      group.children.forEach((bubble) => {
        bubble.position.addScaledVector(bubble.userData.velocity, dt);
        bubble.scale.setScalar(1 - t * 0.46);
        bubble.material.opacity = 0.82 * (1 - t);
      });
    }, () => {
      materials.forEach((material) => material.dispose());
    });
  }

  spawnFireParticlesAt(position, count = 3, duration = 0.48, radius = 0.35, height = 1.1) {
    const group = new THREE.Group();
    const materials = [];
    for (let i = 0; i < count; i += 1) {
      const warm = Math.random();
      const color = warm > 0.48 ? '#ffd35a' : '#ff5d2d';
      const material = mat(color, {
        transparent: true,
        opacity: 0.92,
        emissive: color,
        emissiveIntensity: 0.9,
        depthWrite: false
      }).clone();
      materials.push(material);
      const particle = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.045 + Math.random() * 0.045, 0),
        material
      );
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius;
      particle.position.set(
        position.x + Math.cos(angle) * distance,
        (position.y ?? 0) + 0.28 + Math.random() * Math.max(0.3, height * 0.45),
        position.z + Math.sin(angle) * distance
      );
      particle.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * (0.16 + Math.random() * 0.42),
        2.2 + Math.random() * 1.45,
        Math.sin(angle) * (0.16 + Math.random() * 0.42)
      );
      particle.userData.spin = new THREE.Vector3(
        Math.random() * 8,
        Math.random() * 8,
        Math.random() * 8
      );
      group.add(particle);
    }

    this.addEffect(group, duration, (dt, t) => {
      group.children.forEach((particle) => {
        particle.position.addScaledVector(particle.userData.velocity, dt);
        particle.rotation.x += particle.userData.spin.x * dt;
        particle.rotation.y += particle.userData.spin.y * dt;
        particle.rotation.z += particle.userData.spin.z * dt;
        particle.scale.setScalar(1 - t * 0.72);
        particle.material.opacity = 0.92 * (1 - t);
      });
    }, () => {
      materials.forEach((material) => material.dispose());
    });
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

  spawnMeteor(position, radius, onImpact) {
    const meteor = createSpellModel('meteor');
    meteor.position.set(position.x - 2.8, 13, position.z - 2.8);
    meteor.rotation.set(0.8, 0.2, 0.5);
    let impacted = false;
    this.addEffect(meteor, 1.18, (_, t) => {
      const ease = t * t;
      meteor.position.x = lerp(position.x - 2.8, position.x, ease);
      meteor.position.y = lerp(13, 0.82, ease);
      meteor.position.z = lerp(position.z - 2.8, position.z, ease);
      meteor.rotation.x += 0.14;
      meteor.rotation.y += 0.09;
      if (!impacted && t > 0.82) {
        impacted = true;
        onImpact();
        this.spawnRing(position, '#ff9a47', radius, 0.72);
        this.spawnCrater(position, radius);
      }
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

function formatResourceAmount(value) {
  if (value >= 1) return value.toFixed(1).replace(/\.0$/, '');
  return value.toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
}
