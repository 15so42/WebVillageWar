/**
 * 运输连线世界特效：直线管线 + 流向粒子 + 世界空间物品精灵。
 */
import * as THREE from 'three';
import { createSoftParticleSprite } from '../art/vfxMaterials.js';
import { itemArtMarkup } from './itemArt.js';
import { transportLinkEndpoints } from './transport.js';
import { importPortSortKey, normalizeStationImportPort } from './transportPorts.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ctrl = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _curve = new THREE.QuadraticBezierCurve3(
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3()
);
const _curvePoints = [];

function linkLateralOffset(link, allLinks, game) {
  if (!link || !allLinks?.length) return 0;
  const siblings = allLinks.filter((entry) => (
    entry.fromStationId === link.fromStationId && entry.toStationId === link.toStationId
  ));
  if (siblings.length < 2) return 0;
  const toStation = game?.stations?.stationById?.(link.toStationId);
  const sorted = [...siblings].sort((a, b) => {
    const pa = normalizeStationImportPort(toStation, a.toPort);
    const pb = normalizeStationImportPort(toStation, b.toPort);
    return importPortSortKey(pa) - importPortSortKey(pb);
  });
  const index = sorted.findIndex((entry) => entry.id === link.id);
  const spread = 1.85;
  return (index - (sorted.length - 1) / 2) * spread;
}

function linkBezierControl(start, end, lateral, target) {
  _dir.subVectors(end, start);
  const len = _dir.length();
  if (len < 0.08 || Math.abs(lateral) < 0.01) {
    target.copy(start).add(end).multiplyScalar(0.5);
    return target;
  }
  _right.set(-_dir.z / len, 0, _dir.x / len).multiplyScalar(lateral);
  return target.copy(start).add(end).multiplyScalar(0.5).add(_right);
}

function setLinkPathGeometry(geometry, start, end, lateral) {
  if (!geometry) return;
  if (Math.abs(lateral) < 0.01) {
    setSegmentGeometry(geometry, start, end);
    return;
  }
  linkBezierControl(start, end, lateral, _ctrl);
  _curve.v0.copy(start);
  _curve.v1.copy(_ctrl);
  _curve.v2.copy(end);
  const points = _curve.getPoints(28);
  geometry.setFromPoints(points);
}

function pointOnLinkPath(start, end, lateral, t, target) {
  const clamped = Math.max(0, Math.min(1, t));
  if (Math.abs(lateral) < 0.01) {
    return pointOnSegment(start, end, clamped, target);
  }
  linkBezierControl(start, end, lateral, _ctrl);
  _curve.v0.copy(start);
  _curve.v1.copy(_ctrl);
  _curve.v2.copy(end);
  return _curve.getPoint(clamped, target);
}

/** @type {Map<string, THREE.SpriteMaterial>} */
const itemSpriteMaterials = new Map();

function groundY(game, x, z) {
  if (typeof game?.groundHeightAt === 'function') {
    return game.groundHeightAt(new THREE.Vector3(x, 0, z)) + 0.12;
  }
  return 0.12;
}

function linkFlowsFromTo(link) {
  return 1;
}

function setSegmentGeometry(geometry, start, end) {
  const positions = geometry.getAttribute('position');
  if (!positions || positions.count < 2) {
    geometry.setFromPoints([start.clone(), end.clone()]);
    return;
  }
  positions.setXYZ(0, start.x, start.y, start.z);
  positions.setXYZ(1, end.x, end.y, end.z);
  positions.needsUpdate = true;
  geometry.computeBoundingSphere();
}

function pointOnSegment(start, end, t, target) {
  target.copy(start).lerp(end, t);
  return target;
}

function updatePickVolume(mesh, start, end) {
  if (!mesh) return;
  _dir.copy(end).sub(start);
  const len = _dir.length();
  if (len < 0.08) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  _mid.copy(start).lerp(end, 0.5);
  mesh.position.copy(_mid);
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(_up, _dir.normalize());
}

function spriteMaterialForItem(itemId) {
  const key = String(itemId ?? '');
  if (!key) return null;
  const cached = itemSpriteMaterials.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false
  });
  itemSpriteMaterials.set(key, material);

  if (typeof Image !== 'undefined') {
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(img, 0, 0, 64, 64);
      texture.needsUpdate = true;
    };
    const svg = itemArtMarkup(key);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  return material;
}

export class TransportLinkVisualSystem {
  constructor(game) {
    this.game = game ?? null;
    this.group = new THREE.Group();
    this.group.name = 'transport-links';
    this.linkGroups = new Map();
    this.dirty = true;
    this.flowTime = 0;
    /** @type {Map<string, THREE.Sprite>} */
    this.transitSprites = new Map();
    /** @type {{ group: THREE.Group, line: THREE.Line, geometry: THREE.BufferGeometry, material: THREE.LineBasicMaterial } | null} */
    this.previewEntry = null;
    /** @type {import('./transport.js').TransportEndpoint | null} */
    this.previewOrigin = null;
    this.previewTarget = new THREE.Vector3();
    this.previewSegmentStart = new THREE.Vector3();
    this.previewSegmentEnd = new THREE.Vector3();
    this.hoveredLinkId = null;
  }

  attach(scene) {
    scene?.add(this.group);
  }

  destroy() {
    this.clearLinkPreview();
    this.linkGroups.forEach((entry) => this.disposeLink(entry));
    this.linkGroups.clear();
    this.transitSprites.forEach((sprite) => {
      sprite.removeFromParent();
    });
    this.transitSprites.clear();
    this.group.removeFromParent();
  }

  markDirty() {
    this.dirty = true;
  }

  setHoveredLinkId(linkId) {
    this.hoveredLinkId = linkId ?? null;
    this.linkGroups.forEach((entry, id) => {
      if (!entry.material) return;
      const powered = this.game?.transport?.linkHasPower?.(entry.link) ?? false;
      const hovered = id === this.hoveredLinkId;
      if (hovered) {
        entry.material.color.setHex(powered ? 0xd8f4ff : 0xccaaaa);
        entry.material.opacity = powered ? 0.82 : 0.48;
      } else {
        entry.material.color.setHex(powered ? 0x7ec8ff : 0x886666);
        entry.material.opacity = powered ? 0.48 : 0.22;
      }
    });
  }

  linkOutlineMeshFor(linkId) {
    const entry = this.linkGroups.get(linkId);
    return entry?.pickMesh ?? null;
  }

  endpointPosition(endpoint, target) {
    const game = this.game;
    if (!endpoint) {
      target.set(0, 0, 0);
      return target;
    }
    if (endpoint.kind === 'station' && endpoint.stationId === 'player-base') {
      const base = game?.playerBase?.position;
      if (base) {
        target.copy(base);
        target.y = groundY(game, base.x, base.z) + (game.playerBase.statusHeight ?? 2.4) * 0.35;
        return target;
      }
    }
    if (endpoint.kind === 'station') {
      const station = game?.stations?.stationById?.(endpoint.stationId);
      const unit = station?.unit;
      if (unit?.position) {
        target.copy(unit.position);
        target.y = groundY(game, unit.position.x, unit.position.z) + 1.25;
        return target;
      }
    }
    target.set(0, 0, 0);
    return target;
  }

  pickLinkAt(clientX, clientY) {
    const game = this.game;
    if (!game?.camera || !game?.raycaster) return null;
    game.setPointerFromClient?.(clientX, clientY);
    game.raycaster.setFromCamera(game.pointer, game.camera);
    game.raycaster.params.Line = { threshold: 0.45 };
    const pickMeshes = [];
    const lineObjects = [];
    this.linkGroups.forEach((entry) => {
      if (entry.pickMesh?.visible) pickMeshes.push(entry.pickMesh);
      entry.curvePickMeshes?.forEach((mesh) => {
        if (mesh?.visible) pickMeshes.push(mesh);
      });
      if (entry.line) lineObjects.push(entry.line);
    });
    if (pickMeshes.length) {
      const meshHits = game.raycaster.intersectObjects(pickMeshes, false);
      if (meshHits.length) {
        return meshHits[0].object?.parent?.userData?.linkId ?? null;
      }
    }
    if (!lineObjects.length) return null;
    const hits = game.raycaster.intersectObjects(lineObjects, false);
    if (!hits.length) return null;
    const group = hits[0].object?.parent;
    return group?.userData?.linkId ?? null;
  }

  rebuildIfNeeded() {
    if (!this.dirty) return;
    this.dirty = false;
    const links = this.game?.transport?.links ?? [];
    const live = new Set(links.map((link) => link.id));
    [...this.linkGroups.keys()].forEach((id) => {
      if (!live.has(id)) {
        this.disposeLink(this.linkGroups.get(id));
        this.linkGroups.delete(id);
      }
    });
    links.forEach((link) => {
      if (this.linkGroups.has(link.id)) return;
      this.linkGroups.set(link.id, this.createLinkVisual(link));
    });
  }

  createLinkVisual(link) {
    const group = new THREE.Group();
    group.userData.linkId = link.id;
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const material = new THREE.LineBasicMaterial({
      color: 0x7ec8ff,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    group.add(line);
    const pickMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 1, 8, 1, true),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.001,
        depthWrite: false
      })
    );
    pickMesh.name = 'transport-link-pick';
    group.add(pickMesh);
    const flowSprites = [];
    for (let i = 0; i < 4; i += 1) {
      const sprite = createSoftParticleSprite('#9ee8ff', {
        opacity: 0.75,
        depthTest: true,
        depthWrite: false
      });
      sprite.scale.set(0.22, 0.22, 1);
      sprite.userData.phase = i * 0.22;
      group.add(sprite);
      flowSprites.push(sprite);
    }
    this.group.add(group);
    return {
      group,
      line,
      geometry,
      material,
      pickMesh,
      flowSprites,
      link,
      flowDirection: 1,
      lateral: 0,
      curvePickMeshes: null,
      segmentStart: new THREE.Vector3(),
      segmentEnd: new THREE.Vector3()
    };
  }

  updateCurvedPickMeshes(entry, start, end, lateral) {
    if (!entry?.pickMesh) return;
    entry.pickMesh.visible = false;
    linkBezierControl(start, end, lateral, _ctrl);
    _curve.v0.copy(start);
    _curve.v1.copy(_ctrl);
    _curve.v2.copy(end);
    _curvePoints.length = 0;
    _curvePoints.push(..._curve.getPoints(9));
    if (!entry.curvePickMeshes) {
      entry.curvePickMeshes = [];
      for (let i = 0; i < 8; i += 1) {
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.22, 1, 6, 1, true),
          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.001,
            depthWrite: false
          })
        );
        entry.group.add(mesh);
        entry.curvePickMeshes.push(mesh);
      }
    }
    entry.curvePickMeshes.forEach((mesh, index) => {
      const a = _curvePoints[index];
      const b = _curvePoints[index + 1];
      if (!a || !b) {
        mesh.visible = false;
        return;
      }
      updatePickVolume(mesh, a, b);
    });
  }

  disposeLink(entry) {
    if (!entry) return;
    entry.curvePickMeshes?.forEach((mesh) => {
      mesh.geometry?.dispose();
      mesh.material?.dispose();
      mesh.removeFromParent();
    });
    entry.geometry?.dispose();
    entry.material?.dispose();
    entry.pickMesh?.geometry?.dispose();
    entry.pickMesh?.material?.dispose();
    entry.flowSprites?.forEach((sprite) => {
      sprite.material?.map?.dispose?.();
      sprite.material?.dispose?.();
    });
    entry.group?.removeFromParent();
  }

  clearLinkPreview() {
    if (!this.previewEntry) {
      this.previewOrigin = null;
      return;
    }
    this.previewEntry.geometry?.dispose();
    this.previewEntry.material?.dispose();
    this.previewEntry.group?.removeFromParent();
    this.previewEntry = null;
    this.previewOrigin = null;
  }

  setLinkPreview(origin) {
    this.clearLinkPreview();
    if (!origin) return;
    this.previewOrigin = origin;
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const material = new THREE.LineBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    const group = new THREE.Group();
    group.name = 'transport-link-preview';
    group.add(line);
    this.group.add(group);
    this.previewEntry = { group, line, geometry, material };
  }

  setLinkPreviewTargetPoint(point) {
    if (!this.previewEntry || !point) return;
    this.previewTarget.copy(point);
    this.previewTarget.y = groundY(this.game, this.previewTarget.x, this.previewTarget.z) + 0.08;
    this.updatePreviewLine();
  }

  setLinkPreviewTargetEndpoint(endpoint) {
    if (!this.previewEntry || !endpoint) return;
    this.endpointPosition(endpoint, this.previewTarget);
    this.updatePreviewLine();
  }

  updatePreviewLine() {
    const entry = this.previewEntry;
    if (!entry || !this.previewOrigin) return;
    this.endpointPosition(this.previewOrigin, this.previewSegmentStart);
    this.previewSegmentEnd.copy(this.previewTarget);
    setSegmentGeometry(entry.geometry, this.previewSegmentStart, this.previewSegmentEnd);
  }

  updateLine(entry) {
    const { from, to } = transportLinkEndpoints(entry.link);
    this.endpointPosition(from, _a);
    this.endpointPosition(to, _b);
    entry.segmentStart.copy(_a);
    entry.segmentEnd.copy(_b);
    const allLinks = this.game?.transport?.links ?? [];
    entry.lateral = linkLateralOffset(entry.link, allLinks, this.game);
    setLinkPathGeometry(entry.geometry, _a, _b, entry.lateral);
    if (Math.abs(entry.lateral) > 0.05) {
      this.updateCurvedPickMeshes(entry, _a, _b, entry.lateral);
    } else {
      entry.curvePickMeshes?.forEach((mesh) => {
        mesh.visible = false;
      });
      entry.pickMesh.visible = true;
      updatePickVolume(entry.pickMesh, _a, _b);
    }
    entry.flowDirection = linkFlowsFromTo(entry.link);
    const powered = this.game?.transport?.linkHasPower?.(entry.link) ?? false;
    const hovered = entry.link.id === this.hoveredLinkId;
    if (!hovered) {
      entry.material.color.setHex(powered ? 0x7ec8ff : 0x886666);
      entry.material.opacity = powered ? 0.48 : 0.22;
    } else {
      entry.material.color.setHex(powered ? 0xd8f4ff : 0xccaaaa);
      entry.material.opacity = powered ? 0.82 : 0.48;
    }
  }

  update(dt) {
    this.rebuildIfNeeded();
    this.flowTime += Math.max(0, dt);
    if (this.previewEntry) {
      this.updatePreviewLine();
    }
    this.linkGroups.forEach((entry) => {
      this.updateLine(entry);
      const dir = entry.flowDirection ?? 1;
      entry.flowSprites.forEach((sprite, index) => {
        const t = (this.flowTime * 0.55 * dir + sprite.userData.phase + index * 0.08) % 1;
        const tt = dir >= 0 ? t : 1 - t;
        pointOnLinkPath(
          entry.segmentStart,
          entry.segmentEnd,
          entry.lateral ?? 0,
          Math.max(0, Math.min(1, tt)),
          _pos
        );
        sprite.position.copy(_pos);
        const fade = 0.35 + 0.65 * Math.sin(tt * Math.PI);
        sprite.material.opacity = 0.25 + fade * 0.55;
      });
    });
    this.updateTransitSprites();
  }

  updateTransitSprites() {
    const inTransit = this.game?.transport?.inTransit ?? [];
    const live = new Set();
    inTransit.forEach((entry, index) => {
      const linkEntry = this.linkGroups.get(entry.linkId);
      if (!linkEntry) return;
      const id = `${entry.linkId}:${index}:${entry.itemId}`;
      live.add(id);
      let sprite = this.transitSprites.get(id);
      const material = spriteMaterialForItem(entry.itemId);
      if (!material) return;
      if (!sprite) {
        sprite = new THREE.Sprite(material);
        sprite.name = 'transport-transit-item';
        sprite.renderOrder = 0;
        sprite.scale.set(0.42, 0.42, 1);
        this.group.add(sprite);
        this.transitSprites.set(id, sprite);
      } else if (sprite.material !== material) {
        sprite.material = material;
      }
      const dir = linkEntry.flowDirection ?? 1;
      const t = dir >= 0 ? entry.progress : 1 - entry.progress;
      pointOnSegment(linkEntry.segmentStart, linkEntry.segmentEnd, Math.max(0, Math.min(1, t)), _pos);
      sprite.position.copy(_pos);
      sprite.position.y += 0.08;
      sprite.visible = true;
    });
    this.transitSprites.forEach((sprite, id) => {
      if (live.has(id)) return;
      sprite.removeFromParent();
      this.transitSprites.delete(id);
    });
  }
}
