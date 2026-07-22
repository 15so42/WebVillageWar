import * as THREE from 'three';
import { createProjectileModel } from '../../art/visualRegistry.js';
import { disposeObject3D } from '../../utils/dispose.js';
import { SYNC } from '../protocol/syncConfig.js';

export class ProjectileMirror {
  constructor(game) {
    this.game = game;
    this.records = new Map();
    this.pools = new Map();
  }

  spawn(state) {
    const id = state?.projectileId;
    if (id == null) return null;
    this.remove(id, { immediate: true });
    const type = state.type ?? 'arrow';
    const color = state.color ?? '#f4fbff';
    const poolKey = `${type}:${color}`;
    const pool = this.pools.get(poolKey);
    const object = pool?.pop() ?? createProjectileModel(type, { color });
    object.visible = true;
    object.position.set(state.x ?? 0, state.y ?? 0, state.z ?? 0);
    object.quaternion.set(
      state.qx ?? 0,
      state.qy ?? 0,
      state.qz ?? 0,
      state.qw ?? 1
    ).normalize();
    object.scale.setScalar(Math.max(0.01, Number(state.scale) || 1));
    this.game.scene.add(object);
    const record = {
      object,
      poolKey,
      networkPosition: object.position.clone(),
      segmentStart: object.position.clone(),
      segmentTarget: object.position.clone(),
      segmentStartQuaternion: object.quaternion.clone(),
      segmentTargetQuaternion: object.quaternion.clone(),
      segmentProgress: 1,
      removeAfter: performance.now() + 70,
      pendingRemoval: false
    };
    this.records.set(id, record);
    return record;
  }

  applyTransforms(rows = [], { snap = false } = {}) {
    rows.forEach((state) => {
      const record = this.records.get(state.projectileId);
      if (!record) return;
      const nextPosition = tmpProjectilePosition.set(state.x, state.y, state.z);
      const nextQuaternion = tmpProjectileQuaternion.set(
        state.qx ?? record.segmentTargetQuaternion.x,
        state.qy ?? record.segmentTargetQuaternion.y,
        state.qz ?? record.segmentTargetQuaternion.z,
        state.qw ?? record.segmentTargetQuaternion.w
      ).normalize();
      if (snap) {
        record.object.position.copy(nextPosition);
        record.object.quaternion.copy(nextQuaternion);
        record.networkPosition.copy(nextPosition);
        record.segmentStart.copy(nextPosition);
        record.segmentTarget.copy(nextPosition);
        record.segmentStartQuaternion.copy(nextQuaternion);
        record.segmentTargetQuaternion.copy(nextQuaternion);
        record.segmentProgress = 1;
        return;
      }
      record.segmentStart.copy(record.object.position);
      record.segmentTarget.copy(nextPosition).addScaledVector(
        tmpProjectileDelta.copy(nextPosition).sub(record.networkPosition),
        SYNC.clientProjectileLead
      );
      record.networkPosition.copy(nextPosition);
      record.segmentStartQuaternion.copy(record.object.quaternion);
      record.segmentTargetQuaternion.copy(nextQuaternion);
      record.segmentProgress = 0;
    });
  }

  updateFrame(dt) {
    this.records.forEach((record) => {
      if (record.pendingRemoval && performance.now() >= record.removeAfter) {
        this.removeRecord(record);
        return;
      }
      record.segmentProgress = Math.min(
        1,
        record.segmentProgress + Math.max(0, dt) * SYNC.transformHz
      );
      record.object.position.lerpVectors(
        record.segmentStart,
        record.segmentTarget,
        record.segmentProgress
      );
      record.object.quaternion.slerpQuaternions(
        record.segmentStartQuaternion,
        record.segmentTargetQuaternion,
        record.segmentProgress
      );
    });
  }

  remove(id, { immediate = false } = {}) {
    const record = this.records.get(id);
    if (!record) return;
    if (!immediate && performance.now() < record.removeAfter) {
      record.pendingRemoval = true;
      return;
    }
    this.removeRecord(record);
  }

  clear() {
    [...this.records.keys()].forEach((id) => this.remove(id, { immediate: true }));
  }

  destroy() {
    this.clear();
    this.pools.forEach((pool) => pool.forEach((object) => disposeObject3D(object)));
    this.pools.clear();
  }

  removeRecord(record) {
    this.game.scene.remove(record.object);
    record.object.visible = false;
    const pool = this.pools.get(record.poolKey) ?? [];
    this.pools.set(record.poolKey, pool);
    if (pool.length < 40) pool.push(record.object);
    else disposeObject3D(record.object);
    for (const [id, candidate] of this.records) {
      if (candidate !== record) continue;
      this.records.delete(id);
      break;
    }
  }
}

const tmpProjectilePosition = new THREE.Vector3();
const tmpProjectileDelta = new THREE.Vector3();
const tmpProjectileQuaternion = new THREE.Quaternion();
