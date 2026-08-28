import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bindHorizontalDragScroll,
  createForgedCardMarkup
} from '../src/systems/CardSystem.js';

const listeners = new Map();
const classes = new Set();
let capturedPointerId = null;
const row = {
  scrollWidth: 420,
  clientWidth: 160,
  scrollLeft: 30,
  addEventListener(type, listener) {
    listeners.set(type, listener);
  },
  removeEventListener(type, listener) {
    if (listeners.get(type) === listener) listeners.delete(type);
  },
  setPointerCapture(pointerId) { capturedPointerId = pointerId; },
  hasPointerCapture(pointerId) { return capturedPointerId === pointerId; },
  releasePointerCapture(pointerId) {
    if (capturedPointerId === pointerId) capturedPointerId = null;
  },
  classList: {
    add(name) { classes.add(name); },
    remove(name) { classes.delete(name); }
  }
};

let dragStarts = 0;
const release = bindHorizontalDragScroll(row, {
  onDragStart: () => { dragStarts += 1; }
});
let downPrevented = false;
let downStopped = false;
listeners.get('pointerdown')({
  button: 0,
  pointerId: 7,
  clientX: 120,
  preventDefault() { downPrevented = true; },
  stopPropagation() { downStopped = true; }
});
assert.equal(downPrevented, true);
assert.equal(downStopped, true);
assert.equal(capturedPointerId, 7);
let prevented = false;
let moveStopped = false;
listeners.get('pointermove')({
  pointerId: 7,
  clientX: 70,
  preventDefault() { prevented = true; },
  stopPropagation() { moveStopped = true; }
});
assert.equal(row.scrollLeft, 80);
assert.equal(prevented, true);
assert.equal(moveStopped, true);
assert.equal(dragStarts, 1);
assert.equal(classes.has('is-scroll-grabbing'), true);
listeners.get('pointerup')({ pointerId: 7, stopPropagation() {} });
assert.equal(classes.has('is-scroll-grabbing'), false);
assert.equal(capturedPointerId, null);

prevented = false;
listeners.get('wheel')({
  deltaX: 0,
  deltaY: 35,
  preventDefault() { prevented = true; }
});
assert.equal(row.scrollLeft, 115);
assert.equal(prevented, true);

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const battleHudStyles = readFileSync(new URL('../src/battleHud.css', import.meta.url), 'utf8');
const cardSystemSource = readFileSync(new URL('../src/systems/CardSystem.js', import.meta.url), 'utf8');
const gameSource = readFileSync(new URL('../src/systems/Game.js', import.meta.url), 'utf8');
assert.match(
  styles,
  /body\.is-game-active\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/s,
  '战斗界面应统一禁止浏览器文字选中'
);
assert.match(
  styles,
  /body\.is-game-active :is\(input\[type="text"\], input\[type="number"\], textarea, \[contenteditable="true"\]\)\s*\{[^}]*user-select:\s*text;/s,
  '真正的可编辑控件仍应允许选择文字'
);
assert.match(styles, /\.ability-icon-row\s*\{[^}]*min-width:\s*0;/s);
assert.match(styles, /\.ability-icon-row\s*\{[^}]*touch-action:\s*none;/s);
assert.match(styles, /\.ability-icon-row\s*\{[^}]*pointer-events:\s*auto;/s);
assert.match(
  cardSystemSource,
  /element\.innerHTML\s*=\s*createForgedCardMarkup\(card,\s*\{\s*cooldownMarkup\s*\}\);/,
  'hand and temporary cards should render through the same forged card face'
);
assert.doesNotMatch(
  cardSystemSource,
  /element\.innerHTML\s*=\s*location\s*===\s*['"]hand['"]/,
  'temporary cards should not keep a separate legacy card face'
);
assert.match(
  cardSystemSource,
  /\['hand',\s*'temporary'\]\.includes\(element\.dataset\.cardLocation\)/,
  'hand and temporary cards should share compact mobile text fitting'
);
const levelMarkup = createForgedCardMarkup({
  id: 'roman-level-test',
  name: '等级测试',
  summary: '测试卡牌等级展示',
  label: '测',
  kind: 'summon',
  level: 11,
  energyCost: 3,
  color: '#ffffff'
});
assert.match(levelMarkup, /<div class="med-card-meta-row is-title-only">/);
assert.match(levelMarkup, /<div class="med-card-name" title="等级测试 XI">等级测试 XI<\/div>/);
assert.doesNotMatch(levelMarkup, /med-card-kind|med-card-type-icon|med-card-level|Lv\.|>11</);
assert.match(levelMarkup, /<div class="med-card-type-label" aria-hidden="true">单位卡<\/div>/);
for (const [kind, label] of [
  ['spell', '法术卡'],
  ['building', '建筑卡'],
  ['tactic', '战术卡'],
  ['ability', '能力卡'],
  ['enchant', '附魔卡']
]) {
  const markup = createForgedCardMarkup({
    id: `type-label-${kind}`,
    name: '类型测试',
    summary: '测试卡牌类型文字',
    label: '测',
    kind,
    level: 1,
    energyCost: 1,
    color: '#ffffff'
  });
  assert.match(markup, new RegExp(`<div class="med-card-type-label" aria-hidden="true">${label}<\\/div>`));
}
assert.match(
  battleHudStyles,
  /\.med-card-type-label\s*\{[^}]*top:\s*5px;[^}]*right:\s*5px;[^}]*display:\s*block;/s,
  'every forged card should show its text type marker at the top-right of the art panel'
);
assert.match(
  battleHudStyles,
  /:is\(\.card-hand,\s*\.temporary-card-slot,\s*\.wave-reward-card-frame\) \.med-card-face/,
  'hand, temporary and reward cards should share the exact forged face rules'
);
const trainingMarkup = createForgedCardMarkup({
  id: 'training-type-label',
  name: '训练测试',
  summary: '测试自定义类型文字',
  label: '训',
  kind: 'tactic',
  level: 1,
  energyCost: 0,
  color: '#ffffff'
}, { typeLabel: '训练卡' });
assert.match(trainingMarkup, /<div class="med-card-type-label" aria-hidden="true">训练卡<\/div>/);
assert.match(
  battleHudStyles,
  /:is\(\.card-hand,\s*\.temporary-card-slot,\s*\.wave-reward-card-frame\) \.med-card-meta-row\.is-title-only\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s
);
assert.doesNotMatch(gameSource, /wave-command-affixes/, '战斗顶部不应显示波次主题或附魔信息');
assert.doesNotMatch(gameSource, /function waveCommandAffixMarkup/, '顶部附魔令牌生成逻辑应移除');
assert.doesNotMatch(battleHudStyles, /\.wave-affix-token/, '顶部附魔令牌样式应移除');
assert.match(
  battleHudStyles,
  /\.wave-command-panel \.wave-command-info\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s,
  '移除附魔信息后波次摘要应占满中间区域'
);
assert.match(
  battleHudStyles,
  /\.wave-command-auto-skip\s*\{[^}]*display:\s*inline-flex;/s,
  '无尽自动跳过勾选框应显示在波次详情下方'
);
assert.match(
  battleHudStyles,
  /\.wave-command-panel \.wave-command-info\s*\{[^}]*pointer-events:\s*auto;/s,
  '波次详情必须接收指针事件，确保无尽自动跳过勾选框可操作'
);
assert.match(
  gameSource,
  /battleTimeLabel\) this\.dom\.battleTimeLabel\.textContent = '难度';\s*this\.dom\.battleTime\.textContent = Number\(this\.endlessDifficulty \|\| 0\)\.toFixed\(1\);/s,
  '无尽模式波次详情应只显示难度数值'
);
assert.doesNotMatch(gameSource, /难度 \/ 表现/, '无尽模式波次详情不应再显示表现标题');

release();
assert.equal(listeners.size, 0);
console.log('battle HUD horizontal ability scrolling checks passed');
