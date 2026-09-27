import { normalizeTerrainLayout } from './terrainEditorAssets.js';

const SCENE_KEY = 'snow-valley';

function item(type, x, z, options = {}) {
  const scale = options.scale ?? 1;
  return {
    type,
    position: { x, z },
    rotation: {
      x: 0,
      y: (options.rotation ?? 0) * Math.PI / 180,
      z: 0
    },
    scale: {
      x: options.scaleX ?? scale,
      y: options.scaleY ?? scale,
      z: options.scaleZ ?? scale
    },
    blocking: options.blocking,
    seed: options.seed
  };
}

function makePreset(definition, items) {
  const layout = normalizeTerrainLayout({
    sceneKey: SCENE_KEY,
    manual: true,
    items: items.map((entry, index) => ({
      ...entry,
      id: `${definition.id}-${String(index + 1).padStart(2, '0')}`,
      seed: entry.seed ?? definition.seed + index * 37
    }))
  });
  return Object.freeze({ ...definition, layout });
}

const framedValley = makePreset({
  id: 'framed-valley',
  name: '围合高地',
  label: '推荐',
  seed: 1100,
  tone: 'rock',
  description: '两侧山体逐段向中间收束，开局画面饱满，中央路线仍保持清楚。',
  focus: '大形体框景 · 清晰中轴 · 易于继续调整'
}, [
  item('ridge', -18, 39, { rotation: 8, scaleX: 1.02, scaleY: 0.92, scaleZ: 0.94 }),
  item('ridge', 18, 39, { rotation: -9, scaleX: 1.02, scaleY: 0.92, scaleZ: 0.94 }),
  item('cliff-wide', -23, 34, { rotation: 8, scaleX: 1.2, scaleY: 1.08, scaleZ: 1.05 }),
  item('cliff-wide', 23, 34, { rotation: -11, scaleX: 1.18, scaleY: 1.04, scaleZ: 1.04 }),
  item('ridge', -27, 25, { rotation: 70, scale: 1.12 }),
  item('ridge', 27, 23, { rotation: 104, scale: 1.08 }),
  item('cliff-wide', -29, 14, { rotation: -8, scaleX: 1.1, scaleY: 1.1, scaleZ: 0.98 }),
  item('cliff-wide', 29, 11, { rotation: 13, scaleX: 1.14, scaleY: 1.04, scaleZ: 1.0 }),
  item('ridge', -31, 5, { rotation: 82, scale: 1.04 }),
  item('ridge', 31, 1, { rotation: 96, scale: 1.06 }),
  item('ridge', -31, -9, { rotation: 82, scale: 1.06 }),
  item('ridge', 31, -12, { rotation: 96, scale: 1.1 }),
  item('cliff-wide', -29, -18, { rotation: 9, scaleX: 1.08, scaleY: 1.02, scaleZ: 0.96 }),
  item('cliff-wide', 29, -21, { rotation: -12, scaleX: 1.1, scaleY: 1.04, scaleZ: 0.98 }),
  item('cliff-tall', -28, -28, { rotation: 12, scale: 1.08 }),
  item('cliff-tall', 28, -30, { rotation: -16, scale: 1.12 }),
  item('mountain', -39, -5, { rotation: 18, scale: 1.15 }),
  item('mountain', 39, 15, { rotation: -22, scale: 1.12 }),
  item('pine-cluster', -18, 29, { rotation: 12, scale: 1.08 }),
  item('pine-cluster', 18, 27, { rotation: -18, scale: 1.05 }),
  item('pine-cluster', -13, 37, { rotation: -14, scale: 0.96 }),
  item('pine-cluster', 13, 37, { rotation: 16, scale: 0.96 }),
  item('pine-cluster', -20, 18, { rotation: -8, scale: 1.12 }),
  item('pine-cluster', 21, 15, { rotation: 20, scale: 1.08 }),
  item('pine-cluster', -16, 10, { rotation: 18, scale: 0.94 }),
  item('pine-cluster', 19, 6, { rotation: -16, scale: 0.92 }),
  item('pine-cluster', -28, 0, { rotation: 14, scale: 1.08 }),
  item('pine-cluster', 26, -1, { rotation: -12, scale: 1.12 }),
  item('pine-cluster', -21, -18, { rotation: 28, scale: 1.04 }),
  item('pine-cluster', 21, -20, { rotation: -24, scale: 1.08 }),
  item('pine-cluster', -17, -10, { rotation: -18, scale: 0.9 }),
  item('pine-cluster', 24, -11, { rotation: 14, scale: 0.92 }),
  item('pine-cluster', -16, -35, { rotation: -9, scale: 0.96 }),
  item('pine-cluster', 16, -36, { rotation: 17, scale: 1.02 }),
  item('boulder-cluster', -14, 24, { rotation: 24, scale: 0.82 }),
  item('boulder-cluster', 15, 19, { rotation: -21, scale: 0.78 }),
  item('boulder-large', -15, -12, { rotation: 18, scale: 0.82 }),
  item('boulder-cluster', 14, -18, { rotation: -15, scale: 0.75 }),
  item('cottage', -22, 27, { rotation: 27, scale: 0.92 }),
  item('cottage', 23, -25, { rotation: -32, scale: 0.9 }),
  item('banner-totem', -11, 21, { rotation: -8, scale: 0.9 }),
  item('guard-flag', 11, -23, { rotation: 14, scale: 1.0, blocking: false })
]);

const pineGate = makePreset({
  id: 'pine-gate',
  name: '林团隘口',
  seed: 2200,
  tone: 'forest',
  description: '用连续林带代替满地散树，三处岩石门洞形成推进节奏。',
  focus: '林带层次 · 战斗口袋 · 视觉更柔和'
}, [
  item('cliff-wide', -30, 35, { rotation: 14, scaleX: 1.12, scaleY: 0.96, scaleZ: 1.0 }),
  item('cliff-wide', 29, 34, { rotation: -18, scaleX: 1.08, scaleY: 0.98, scaleZ: 1.04 }),
  item('ridge', -34, 8, { rotation: 82, scale: 1.08 }),
  item('ridge', 34, 5, { rotation: 98, scale: 1.1 }),
  item('cliff-tall', -30, -31, { rotation: 8, scale: 1.06 }),
  item('cliff-tall', 30, -32, { rotation: -12, scale: 1.08 }),
  item('boulder-cluster', -16, 24, { rotation: 25, scale: 0.9 }),
  item('boulder-cluster', 16, 20, { rotation: -23, scale: 0.88 }),
  item('boulder-cluster', -14, -12, { rotation: 18, scale: 0.82 }),
  item('boulder-cluster', 14, -17, { rotation: -15, scale: 0.82 }),
  item('pine-cluster', -22, 31, { rotation: 11, scale: 1.18 }),
  item('pine-cluster', -27, 25, { rotation: -19, scale: 1.12 }),
  item('pine-cluster', -20, 18, { rotation: 22, scale: 1.18 }),
  item('pine-cluster', -27, 12, { rotation: -9, scale: 1.12 }),
  item('pine-cluster', -29, -4, { rotation: 28, scale: 1.18 }),
  item('pine-cluster', -24, -13, { rotation: -14, scale: 1.12 }),
  item('pine-cluster', -20, -23, { rotation: 18, scale: 1.08 }),
  item('pine-cluster', -16, -35, { rotation: -25, scale: 1.02 }),
  item('pine-cluster', 22, 30, { rotation: -14, scale: 1.16 }),
  item('pine-cluster', 27, 23, { rotation: 17, scale: 1.1 }),
  item('pine-cluster', 21, 14, { rotation: -20, scale: 1.16 }),
  item('pine-cluster', 28, 10, { rotation: 9, scale: 1.08 }),
  item('pine-cluster', 28, -4, { rotation: -24, scale: 1.16 }),
  item('pine-cluster', 24, -14, { rotation: 15, scale: 1.12 }),
  item('pine-cluster', 20, -25, { rotation: -18, scale: 1.08 }),
  item('pine-cluster', 16, -36, { rotation: 22, scale: 1.0 }),
  item('pine-tall', -12, 29, { rotation: 12, scale: 1.05 }),
  item('pine-small', -12, 17, { rotation: -7, scale: 0.92 }),
  item('pine-tall', 12, 13, { rotation: 24, scale: 1.02 }),
  item('pine-small', 11, -14, { rotation: -20, scale: 0.9 }),
  item('cottage', -25, -20, { rotation: 34, scale: 0.86 }),
  item('banner-totem', 19, 25, { rotation: -15, scale: 0.9 }),
  item('guard-flag', -10, -25, { rotation: 8, blocking: false })
]);

const staggeredTerraces = makePreset({
  id: 'staggered-terraces',
  name: '错层岩台',
  seed: 3300,
  tone: 'terrace',
  description: '左右不做镜像，以高低错开的岩台制造空间纵深和独立游戏式构图。',
  focus: '不对称构图 · 高低错层 · 大块面优先'
}, [
  item('cliff-wide', -27, 34, { rotation: 6, scaleX: 1.28, scaleY: 1.12, scaleZ: 1.08 }),
  item('cliff-tall', 28, 31, { rotation: -13, scaleX: 1.05, scaleY: 1.12, scaleZ: 1.08 }),
  item('ridge', -31, 19, { rotation: 64, scaleX: 1.16, scaleY: 1.02, scaleZ: 1.08 }),
  item('cliff-wide', 31, 15, { rotation: 15, scaleX: 1.18, scaleY: 1.0, scaleZ: 1.02 }),
  item('cliff-tall', -33, 2, { rotation: -12, scaleX: 1.04, scaleY: 1.18, scaleZ: 1.02 }),
  item('ridge', 32, -4, { rotation: 108, scaleX: 1.16, scaleY: 1.04, scaleZ: 1.1 }),
  item('cliff-wide', -29, -17, { rotation: 11, scaleX: 1.16, scaleY: 1.0, scaleZ: 1.0 }),
  item('cliff-tall', 29, -23, { rotation: -16, scaleX: 1.08, scaleY: 1.14, scaleZ: 1.05 }),
  item('mountain', -36, -34, { rotation: 19, scale: 1.2 }),
  item('ridge', 18, -36, { rotation: 8, scale: 1.0 }),
  item('boulder-cluster', -17, 26, { rotation: 31, scale: 0.88 }),
  item('boulder-large', 18, 23, { rotation: -25, scale: 0.92 }),
  item('boulder-large', -24, 10, { rotation: 12, scale: 0.86 }),
  item('boulder-cluster', 24, 4, { rotation: -18, scale: 0.82 }),
  item('boulder-cluster', -19, -14, { rotation: 24, scale: 0.86 }),
  item('boulder-large', 18, -21, { rotation: -10, scale: 0.82 }),
  item('pine-cluster', -19, 31, { rotation: 16, scale: 1.0 }),
  item('pine-cluster', 20, 28, { rotation: -19, scale: 1.08 }),
  item('pine-cluster', -27, 13, { rotation: 26, scale: 0.98 }),
  item('pine-cluster', 23, 10, { rotation: -11, scale: 1.02 }),
  item('pine-cluster', -23, -8, { rotation: 9, scale: 1.08 }),
  item('pine-cluster', 24, -12, { rotation: -28, scale: 1.0 }),
  item('pine-cluster', -18, -26, { rotation: 15, scale: 0.96 }),
  item('pine-cluster', 18, -31, { rotation: -17, scale: 1.02 }),
  item('cottage', 22, 21, { rotation: -28, scale: 0.9 }),
  item('banner-totem', -12, 21, { rotation: 14, scale: 0.9 }),
  item('guard-flag', 10, -24, { rotation: -12, blocking: false })
]);

const frontierOutposts = makePreset({
  id: 'frontier-outposts',
  name: '边境前哨',
  seed: 4400,
  tone: 'outpost',
  description: '两侧建筑、旗帜和营地构成环境叙事，适合继续添加玩法据点。',
  focus: '建筑地标 · 阵营叙事 · 开阔战斗区'
}, [
  item('cliff-wide', -29, 35, { rotation: 10, scaleX: 1.12, scaleY: 1.02, scaleZ: 1.0 }),
  item('cliff-wide', 29, 34, { rotation: -12, scaleX: 1.1, scaleY: 1.02, scaleZ: 1.0 }),
  item('ridge', -34, 7, { rotation: 78, scale: 1.04 }),
  item('ridge', 34, 3, { rotation: 102, scale: 1.06 }),
  item('cliff-tall', -29, -31, { rotation: 14, scale: 1.04 }),
  item('cliff-tall', 29, -32, { rotation: -15, scale: 1.05 }),
  item('cottage', -22, 27, { rotation: 30, scale: 0.94 }),
  item('cottage', 23, 22, { rotation: -28, scale: 0.92 }),
  item('monster-camp', -25, -18, { rotation: 24, scale: 0.9 }),
  item('cottage', 24, -23, { rotation: -34, scale: 0.88 }),
  item('banner-totem', -17, 24, { rotation: 18, scale: 0.92 }),
  item('guard-flag', -13, 27, { rotation: -8, blocking: false }),
  item('banner-totem', 18, 18, { rotation: -16, scale: 0.92 }),
  item('guard-flag', 14, 22, { rotation: 12, blocking: false }),
  item('banner-totem', -17, -22, { rotation: 24, scale: 0.9 }),
  item('guard-flag', -12, -25, { rotation: -14, blocking: false }),
  item('banner-totem', 18, -26, { rotation: -18, scale: 0.9 }),
  item('pine-cluster', -28, 22, { rotation: 11, scale: 1.06 }),
  item('pine-cluster', 29, 15, { rotation: -15, scale: 1.08 }),
  item('pine-cluster', -28, -3, { rotation: 21, scale: 1.08 }),
  item('pine-cluster', 28, -8, { rotation: -22, scale: 1.08 }),
  item('pine-cluster', -19, -33, { rotation: 16, scale: 1.0 }),
  item('pine-cluster', 18, -35, { rotation: -12, scale: 1.0 }),
  item('boulder-cluster', -15, 17, { rotation: 27, scale: 0.78 }),
  item('boulder-large', 15, 13, { rotation: -21, scale: 0.8 }),
  item('boulder-cluster', -15, -10, { rotation: 15, scale: 0.76 }),
  item('boulder-large', 14, -17, { rotation: -13, scale: 0.78 })
]);

export const TERRAIN_EDITOR_PRESETS = Object.freeze([
  framedValley,
  pineGate,
  staggeredTerraces,
  frontierOutposts
]);

export function getTerrainEditorPreset(id) {
  return TERRAIN_EDITOR_PRESETS.find((preset) => preset.id === id) ?? null;
}
