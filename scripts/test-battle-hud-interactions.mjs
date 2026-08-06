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
assert.match(styles, /\.ability-icon-row\s*\{[^}]*min-width:\s*0;/s);
assert.match(styles, /\.ability-icon-row\s*\{[^}]*touch-action:\s*none;/s);
assert.match(styles, /\.ability-icon-row\s*\{[^}]*pointer-events:\s*auto;/s);
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
assert.match(levelMarkup, /<div class="med-card-level"[^>]*>XI<\/div>/);
assert.doesNotMatch(levelMarkup, /med-card-level-icon|med-card-level-roman|Lv\.|>11</);
assert.match(
  battleHudStyles,
  /\.med-card-meta-row \.med-card-level\s*\{[^}]*font-family:\s*var\(--font-title\);[^}]*font-weight:\s*900;/s
);

release();
assert.equal(listeners.size, 0);
console.log('battle HUD horizontal ability scrolling checks passed');
