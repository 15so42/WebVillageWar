// 扇形手牌几何回归测试：
// 1) JS 常量（CardSystem.FAN_HAND_GEOMETRY）与 battleHud.css 里 var(...) 兜底值一致；
// 2) 基准卡位公式与 CSS transform 语义（P = O + M(p - O)，O 为底部中点）一致；
// 3) 悬停摆正补偿：放大后卡面直立、水平中心不变、上抬固定像素；
// 4) 命中判定只用基准卡位，滑入侧边牌区域时不会被放大的顶层牌挡住
//    （同时复现旧行为：浏览器原生命中会停在放大牌上）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FAN_HAND_GEOMETRY as GEO } from '../src/systems/CardSystem.js';

const CSS = readFileSync(new URL('../src/battleHud.css', import.meta.url), 'utf8');
const deg = (degrees) => (degrees * Math.PI) / 180;

// ---- 1) JS 常量 <-> CSS 兜底值 ----
const cssExpectations = [
  [`var(--fan-hover-lift, ${GEO.HOVER_LIFT_PX}px)`, '悬停上抬量'],
  [`var(--fan-hover-scale, ${GEO.HOVER_SCALE})`, '悬停缩放']
];
cssExpectations.forEach(([needle, label]) => {
  assert.ok(CSS.includes(needle), `battleHud.css 中的${label}与 JS 常量不一致：缺少 ${needle}`);
});
assert.ok(
  CSS.includes(`@media ${GEO.LAYOUT_MEDIA_QUERY}`),
  `battleHud.css 扇形媒体查询与 JS 常量不一致：${GEO.LAYOUT_MEDIA_QUERY}`
);

// ---- 独立实现：按 CSS 语义 P = O + M(p - O) 计算变换后的屏幕坐标 ----
function applyTransform(point, origin, { dx, dy, rotate, scale }) {
  const vx = (point.x - origin.x) * scale;
  const vy = (point.y - origin.y) * scale;
  const cos = Math.cos(rotate);
  const sin = Math.sin(rotate);
  return {
    x: origin.x + (vx * cos - vy * sin) + dx,
    y: origin.y + (vx * sin + vy * cos) + dy
  };
}

function buildHand({ count, viewportWidth, viewportHeight, cardWidth, cardHeight }) {
  const totalSpread = count <= 1
    ? 0
    : Math.min(
        GEO.MAX_TOTAL_SPREAD_DEG,
        Math.max(GEO.MIN_TOTAL_SPREAD_DEG, (count - 1) * GEO.DEG_PER_CARD)
      );
  const maxFanWidth = Math.max(cardWidth, viewportWidth - 48);
  const packedSpacing = count > 1 ? (maxFanWidth - cardWidth) / (count - 1) : 0;
  const spacing = count <= 1
    ? 0
    : Math.max(
        cardWidth * GEO.MIN_VISIBLE_RATIO,
        Math.min(cardWidth * GEO.MAX_VISIBLE_RATIO, packedSpacing)
      );
  const center = (count - 1) / 2;
  const anchor = { x: viewportWidth / 2, y: viewportHeight - 26 };
  const cards = [];
  for (let index = 0; index < count; index += 1) {
    const offset = index - center;
    const t = count <= 1 ? 0 : offset / center;
    const tx = offset * spacing;
    const ty = t * t * GEO.ARC_DEPTH_PX;
    const rotateDeg = count <= 1 ? 0 : t * (totalSpread / 2);
    const rotateRad = deg(rotateDeg);
    // 被验代码中的基准卡位公式（CardSystem.handCardFrames）
    const frameCenter = {
      x: anchor.x + tx + (cardHeight / 2) * Math.sin(rotateRad),
      y: anchor.y + ty - (cardHeight / 2) * Math.cos(rotateRad)
    };
    // 浏览器语义：盒子 left=anchor.x / bottom=anchor.y；transform-origin: 50% 100%
    const transformOrigin = { x: anchor.x + cardWidth / 2, y: anchor.y };
    const boxCenter = { x: anchor.x + cardWidth / 2, y: anchor.y - cardHeight / 2 };
    const baseTransform = { dx: -cardWidth / 2 + tx, dy: ty, rotate: rotateRad, scale: 1 };
    // 被验代码中的悬停摆正补偿（CardSystem.layoutHandFan 下发的 --fan-hover-dx/dy）
    const hoverTransform = {
      dx: -cardWidth / 2 + tx + (cardHeight / 2) * Math.sin(rotateRad),
      dy: ty - GEO.HOVER_LIFT_PX + (cardHeight / 2) * (GEO.HOVER_SCALE - Math.cos(rotateRad)),
      rotate: 0,
      scale: GEO.HOVER_SCALE
    };
    cards.push({
      index,
      rotateRad,
      frameCenter,
      simulatedCenter: applyTransform(boxCenter, transformOrigin, baseTransform),
      simulatedHoverCenter: applyTransform(boxCenter, transformOrigin, hoverTransform)
    });
  }
  return { cards, cardWidth, cardHeight };
}

function pointInRotatedRect(point, card, size) {
  const dx = point.x - card.frameCenter.x;
  const dy = point.y - card.frameCenter.y;
  const cos = Math.cos(card.rotateRad);
  const sin = Math.sin(card.rotateRad);
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  return Math.abs(localX) <= size.width / 2 && Math.abs(localY) <= size.height / 2;
}

// 被验代码：从顶层向下、只用未放大未抬升的基准卡位判定（CardSystem.handCardHitAt）
function handCardHitAt(point, cards, size) {
  for (let i = cards.length - 1; i >= 0; i -= 1) {
    if (pointInRotatedRect(point, cards[i], size)) return cards[i].index;
  }
  return null;
}

// 浏览器原生命中：放大牌（z-index 最高）按画出来的几何抢占指针（旧行为）
function browserHitAt(point, cards, size, hoveredIndex) {
  const hovered = cards[hoveredIndex];
  const hoveredCenter = hovered.simulatedHoverCenter;
  if (
    Math.abs(point.x - hoveredCenter.x) <= (size.width * GEO.HOVER_SCALE) / 2
    && Math.abs(point.y - hoveredCenter.y) <= (size.height * GEO.HOVER_SCALE) / 2
  ) {
    return hoveredIndex;
  }
  for (let i = cards.length - 1; i >= 0; i -= 1) {
    if (i === hoveredIndex) continue;
    if (pointInRotatedRect(point, cards[i], size)) return cards[i].index;
  }
  return null;
}

const cases = [
  { count: 1, viewportWidth: 1600, viewportHeight: 900, cardWidth: 140, cardHeight: 220 },
  { count: 2, viewportWidth: 1600, viewportHeight: 900, cardWidth: 140, cardHeight: 220 },
  { count: 5, viewportWidth: 1600, viewportHeight: 900, cardWidth: 140, cardHeight: 220 },
  { count: 10, viewportWidth: 1600, viewportHeight: 900, cardWidth: 140, cardHeight: 220 },
  { count: 10, viewportWidth: 1280, viewportHeight: 720, cardWidth: 132, cardHeight: 208 }
];

let blockingBugReproduced = 0;
cases.forEach(({ count, viewportWidth, viewportHeight, cardWidth, cardHeight }) => {
  const hand = buildHand({ count, viewportWidth, viewportHeight, cardWidth, cardHeight });
  const size = { width: hand.cardWidth, height: hand.cardHeight };
  const label = `count=${count} ${viewportWidth}x${viewportHeight}`;

  hand.cards.forEach((card) => {
    const round = (value) => Math.round(value * 100) / 100;
    assert.equal(
      round(card.simulatedCenter.x),
      round(card.frameCenter.x),
      `${label} card=${card.index} 基准卡位中心 x 与 CSS 变换不一致`
    );
    assert.equal(
      round(card.simulatedCenter.y),
      round(card.frameCenter.y),
      `${label} card=${card.index} 基准卡位中心 y 与 CSS 变换不一致`
    );
    assert.equal(
      round(card.simulatedHoverCenter.x),
      round(card.frameCenter.x),
      `${label} card=${card.index} 悬停摆正后水平中心发生了位移`
    );
    assert.equal(
      round(card.simulatedHoverCenter.y),
      round(card.frameCenter.y - GEO.HOVER_LIFT_PX),
      `${label} card=${card.index} 悬停上抬量不等于 ${GEO.HOVER_LIFT_PX}px`
    );
  });

  hand.cards.forEach((card) => {
    const probe = {
      x: card.frameCenter.x - hand.cardWidth * 0.35,
      y: card.frameCenter.y
    };
    assert.ok(pointInRotatedRect(probe, card, size), `${label} 探针不在卡 ${card.index} 上`);
    assert.equal(
      handCardHitAt(probe, hand.cards, size),
      card.index,
      `${label} 探针应命中卡 ${card.index}`
    );
    // 左邻牌放大后压住右邻牌可视区域时，仍必须能划入右邻牌
    const right = hand.cards[card.index + 1];
    if (!right) return;
    const rightProbe = {
      x: right.frameCenter.x - hand.cardWidth * 0.35,
      y: right.frameCenter.y
    };
    assert.ok(pointInRotatedRect(rightProbe, right, size), `${label} 探针不在右邻牌上`);
    const coveredByUpperBase = hand.cards.some((other) => (
      other.index > right.index && pointInRotatedRect(rightProbe, other, size)
    ));
    if (coveredByUpperBase) return;
    assert.equal(
      handCardHitAt(rightProbe, hand.cards, size),
      right.index,
      `${label} 右邻牌可视区域应命中卡 ${right.index}`
    );
    if (browserHitAt(rightProbe, hand.cards, size, card.index) === card.index) {
      blockingBugReproduced += 1;
    }
  });
});

assert.ok(
  blockingBugReproduced > 0,
  '未复现“放大牌挡住侧边牌”的旧行为，测试失去意义'
);

// 指针停在摆正放大后的卡面（超出基准卡位）上时，应判定为仍在放大牌内
{
  const hand = buildHand({
    count: 5,
    viewportWidth: 1600,
    viewportHeight: 900,
    cardWidth: 140,
    cardHeight: 220
  });
  const size = { width: hand.cardWidth, height: hand.cardHeight };
  const card = hand.cards[4];
  const raised = { x: card.frameCenter.x, y: card.frameCenter.y - GEO.HOVER_LIFT_PX - 80 };
  assert.equal(handCardHitAt(raised, hand.cards, size), null, '上抬区域不应命中基准卡位');
  assert.ok(
    Math.abs(raised.x - card.frameCenter.x) <= (size.width * GEO.HOVER_SCALE) / 2
    && Math.abs(raised.y - (card.frameCenter.y - GEO.HOVER_LIFT_PX))
      <= (size.height * GEO.HOVER_SCALE) / 2,
    '上抬区域应判定为落在放大卡面内'
  );
}

console.log('hand-fan geometry OK');
console.log(`  复现旧遮挡行为场景数: ${blockingBugReproduced}`);
