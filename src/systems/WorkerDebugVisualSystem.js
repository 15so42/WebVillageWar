/**
 * 调试：木傀儡脚底状态 + 到当前任务资源点的虚线。
 * 仅生存关启用，方便查「站着不采」是距离、工具还是规划问题。
 */
import * as THREE from 'three';
import { resourceNodeSurfaceDistance } from './resources.js';
import { workReasonLabel } from './workOrders.js';

const _feet = new THREE.Vector3();
const _node = new THREE.Vector3();
const LABEL_HEIGHT = 0.22;
const LINE_LIFT = 0.35;

function makeLabelSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 1850;
  sprite.scale.set(2.35, 0.95, 1);
  return {
    sprite,
    canvas,
    ctx,
    texture,
    material,
    setText(lines) {
      const text = (lines ?? []).filter(Boolean).join('\n');
      if (text === this.lastText) return;
      this.lastText = text;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!text) {
        texture.needsUpdate = true;
        sprite.visible = false;
        return;
      }
      sprite.visible = true;
      const fontSize = 34;
      ctx.font = `700 ${fontSize}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const rows = text.split('\n');
      const lineHeight = fontSize * 1.15;
      const startY = canvas.height / 2 - ((rows.length - 1) * lineHeight) / 2;
      rows.forEach((row, index) => {
        const y = startY + index * lineHeight;
        ctx.strokeStyle = '#0a1218';
        ctx.lineWidth = 6;
        ctx.strokeText(row, canvas.width / 2, y);
        ctx.fillStyle = '#e8f7ff';
        ctx.fillText(row, canvas.width / 2, y);
      });
      texture.needsUpdate = true;
    },
    lastText: ''
  };
}

function makeDashedLine() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(6);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineDashedMaterial({
    color: 0x7fd4ff,
    dashSize: 0.4,
    gapSize: 0.28,
    transparent: true,
    opacity: 0.82,
    depthTest: true,
    depthWrite: false
  });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  return { line, geometry, material, positions };
}

export class WorkerDebugVisualSystem {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'WorkerDebugVisuals';
    /** @type {Map<string, { label: object, link: object }>} */
    this.entries = new Map();
    this.enabled = true;
  }

  attach(scene) {
    scene?.add(this.group);
  }

  destroy() {
    this.entries.forEach((entry) => {
      this.group.remove(entry.label.sprite);
      this.group.remove(entry.link.line);
      entry.label.material.dispose();
      entry.label.texture.dispose();
      entry.link.geometry.dispose();
      entry.link.material.dispose();
    });
    this.entries.clear();
    this.group.removeFromParent();
  }

  ensureEntry(unitId) {
    let entry = this.entries.get(unitId);
    if (entry) return entry;
    const label = makeLabelSprite();
    const link = makeDashedLine();
    this.group.add(label.sprite, link.line);
    entry = { label, link };
    this.entries.set(unitId, entry);
    return entry;
  }

  removeEntry(unitId) {
    const entry = this.entries.get(unitId);
    if (!entry) return;
    this.group.remove(entry.label.sprite);
    this.group.remove(entry.link.line);
    entry.label.material.dispose();
    entry.label.texture.dispose();
    entry.link.geometry.dispose();
    entry.link.material.dispose();
    this.entries.delete(unitId);
  }

  update(_dt) {
    if (!this.enabled || !this.game?.isSurvivalLevel?.()) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const work = this.game.work;
    const nodes = this.game.resourceNodes;
    const active = new Set();
    const units = this.game.friendlyUnits ?? [];
    units.forEach((unit) => {
      if (unit.isWorker !== true || unit.alive === false) return;
      active.add(unit.id);
      const entry = this.ensureEntry(unit.id);
      const state = work?.workerState?.(unit) ?? null;
      const record = work?.recordFor?.(unit) ?? null;
      const nodeId = state?.nodeId ?? null;
      const node = nodeId ? nodes?.nodeById?.(nodeId) : null;

      const groundY = this.game.groundHeightAt?.(unit.position) ?? unit.position.y;
      _feet.set(unit.position.x, groundY + LABEL_HEIGHT, unit.position.z);
      entry.label.sprite.position.copy(_feet);

      const surfaceDist = node
        ? resourceNodeSurfaceDistance(node, unit.position).toFixed(2)
        : '—';
      const lines = [
        state?.note ?? '—',
        state?.planAction ? `动作:${state.planAction}` : null,
        node ? `目标:${node.definitionId ?? nodeId} 距表面${surfaceDist}m` : '目标:无',
        state?.error ? `错:${state.error}` : null,
        record?.move?.unreachable ? '移动:不可达' : null,
        unit.pendingRouteRequestId != null ? '寻路:计算中' : null
      ];
      if (state?.reason && state.reason !== 'none') {
        lines.push(`因:${workReasonLabel(state.reason) || state.reason}`);
      }
      entry.label.setText(lines);

      if (node) {
        const nodeY = (node.y ?? groundY) + LINE_LIFT;
        _node.set(node.x ?? 0, nodeY, node.z ?? 0);
        const startY = groundY + 0.28;
        entry.link.positions[0] = unit.position.x;
        entry.link.positions[1] = startY;
        entry.link.positions[2] = unit.position.z;
        entry.link.positions[3] = _node.x;
        entry.link.positions[4] = _node.y;
        entry.link.positions[5] = _node.z;
        entry.link.geometry.attributes.position.needsUpdate = true;
        entry.link.line.computeLineDistances();
        entry.link.line.visible = true;
      } else {
        entry.link.line.visible = false;
      }
    });

    this.entries.forEach((_entry, unitId) => {
      if (!active.has(unitId)) this.removeEntry(unitId);
    });
  }
}
