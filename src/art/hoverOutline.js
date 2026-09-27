import * as THREE from 'three';

export const HOVER_OUTLINE_COLORS = {
  resource: 0xf0c020,
  friendly: 0x5fd068,
  enemy: 0xe84848
};

/** @type {import('three/examples/jsm/postprocessing/OutlinePass.js').OutlinePass | null} */
let hoverPass = null;
/** @type {import('three/examples/jsm/postprocessing/OutlinePass.js').OutlinePass | null} */
let resourcePass = null;

/** @type {{ root: THREE.Object3D, scope: string, color: number } | null} */
let hoverTarget = null;

/** @type {{ root: THREE.Object3D, scope: string }[]} */
let resourceTargets = [];

const _color = new THREE.Color();

function configurePass(pass, { strength = 3.2, thickness = 1.15 } = {}) {
  if (!pass) return;
  pass.edgeStrength = strength;
  pass.edgeThickness = thickness;
  pass.edgeGlow = 0;
  pass.pulsePeriod = 0;
  pass.downSampleRatio = 2;
  pass.enabled = false;
}

function syncHoverPass() {
  if (!hoverPass) return;
  const root = hoverTarget?.root ?? null;
  hoverPass.selectedObjects = root ? [root] : [];
  if (!root) {
    hoverPass.enabled = false;
    return;
  }
  _color.setHex(hoverTarget.color);
  hoverPass.visibleEdgeColor.copy(_color);
  hoverPass.hiddenEdgeColor.copy(_color);
  hoverPass.enabled = true;
}

function syncResourcePass() {
  if (!resourcePass) return;
  const objects = [];
  const seen = new Set();
  resourceTargets.forEach((entry) => {
    if (!entry?.root || seen.has(entry.root.uuid)) return;
    seen.add(entry.root.uuid);
    objects.push(entry.root);
  });
  resourcePass.selectedObjects = objects;
  if (!objects.length) {
    resourcePass.enabled = false;
    return;
  }
  _color.setHex(HOVER_OUTLINE_COLORS.resource);
  resourcePass.visibleEdgeColor.copy(_color);
  resourcePass.hiddenEdgeColor.copy(_color);
  resourcePass.enabled = true;
}

function syncPasses() {
  syncHoverPass();
  syncResourcePass();
}

export function bindHoverOutlinePasses({ hover, resource }) {
  hoverPass = hover ?? null;
  resourcePass = resource ?? null;
  configurePass(hoverPass);
  configurePass(resourcePass);
  syncPasses();
}

/** @deprecated 单 pass 旧接口；请用 bindHoverOutlinePasses */
export function bindHoverOutlinePass(pass) {
  bindHoverOutlinePasses({ hover: pass, resource: null });
}

export function resizeHoverOutlinePass(width, height) {
  hoverPass?.setSize?.(width, height);
  resourcePass?.setSize?.(width, height);
}

export function applyHoverOutline(root, color, { scope = 'subtree' } = {}) {
  if (!root) return;
  void scope;
  hoverTarget = { root, scope: 'subtree', color: typeof color === 'number' ? color : new THREE.Color(color).getHex() };
  syncHoverPass();
}

export function clearHoverOutline() {
  hoverTarget = null;
  syncHoverPass();
}

export function setResourceHighlightOutlines(entries = []) {
  resourceTargets = entries
    .filter((entry) => entry?.root)
    .map((entry) => ({ root: entry.root, scope: entry.scope ?? 'subtree' }));
  syncResourcePass();
}

export function clearResourceHighlightOutlines() {
  resourceTargets = [];
  syncResourcePass();
}
