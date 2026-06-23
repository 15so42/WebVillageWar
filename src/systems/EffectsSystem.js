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
        depthWrite: false
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, 0.08, position.z);
    ring.scale.setScalar(radius);
    this.addEffect(ring, duration, (_, t) => {
      ring.scale.setScalar(radius * (1 + t * 0.45));
      ring.material.opacity = 0.76 * (1 - t);
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

  spawnFire(position) {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.58, 6),
      mat('#ff823d', { emissive: '#ff4a1a', emissiveIntensity: 0.9 })
    );
    flame.position.set(position.x, position.y + 0.45, position.z);
    this.addEffect(flame, 0.44, (_, t) => {
      flame.position.y += 0.018;
      flame.scale.setScalar(1 + t * 0.5);
      flame.material.opacity = clamp(1 - t, 0, 1);
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
    this.recoveryTimer = 0.22;
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    const mote = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.08, 0),
      mat('#78e3b0', { emissive: '#4ae09a', emissiveIntensity: 0.75 })
    );
    mote.position.set(
      center.x + Math.cos(angle) * distance,
      0.18,
      center.z + Math.sin(angle) * distance
    );
    this.addEffect(mote, 0.9, (_, t) => {
      mote.position.y = lerp(0.18, 1.2, t);
      mote.scale.setScalar(1 - t * 0.3);
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
