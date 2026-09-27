// 本轮两条改动的端到端验收（真浏览器 + 真 DOM，不是读源码）：
//
//   1) 基地背包面板高度缩小 20%，并且**不盖住屏幕底部的快捷栏**。
//      只断言"面板变矮了"是不够的：真正要守的是"面板下边缘在快捷栏上边缘之上"，
//      以及"快捷栏拿得到指针事件"——面板已经不重叠、但 .backpack 全屏遮罩
//      （inset:0 + pointer-events:auto）照样会把点击吃掉，那时快捷栏看得见点不到。
//      所以这里用 elementFromPoint 验"指针落在快捷栏上"。
//      两个分支都要验：海岛关快捷栏贴底（bottom:14px），非海岛关它被手牌顶到 268px。
//
//   2) 合成后按右键可以取消并返还资源。
//      验的是库存真的回到点击之前，以及两条不许撤销的边界：
//      · 落在格子上（《我的世界》语义的"拿一半 / 放一个"）不许顺带撤销整笔；
//      · 产物已经落格（不再是"刚做好、还拿在手上"）之后不许撤销。
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';

const CDP_PORT = Number(process.env.ISLAND_CDP_PORT || 9235);
const BASE = process.env.ISLAND_URL || 'http://127.0.0.1:3000/';
const OUT_DIR = 'outputs';
const OUT = `${OUT_DIR}/verify-backpack-craft-refund.png`;

const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page')
  ?? await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 0;
const pending = new Map();
const problems = [];
const send = (m, p = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method: m, params: p }));
});
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    problems.push('[exception] ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? ''));
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    problems.push('[console.error] ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
});
await new Promise((r, rej) => { ws.on('open', r); ws.on('error', rej); });
await send('Runtime.enable');
await send('Page.enable');
const VIEW = { width: 1600, height: 900 };
await send('Emulation.setDeviceMetricsOverride', { ...VIEW, deviceScaleFactor: 1, mobile: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    const detail = res.exceptionDetails.exception?.description ?? res.exceptionDetails.text ?? 'unknown';
    throw new Error('page eval failed: ' + detail);
  }
  return res.result.value;
};

const failures = [];
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`ok   ${name}`);
    return true;
  }
  console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
  failures.push(name);
  return false;
}

await send('Page.navigate', { url: BASE });
const started = await enterSurvivalGame(ev, sleep);
if (!started) {
  console.log('FAIL 没能进入游戏：window.__VILLAGE_WAR_DEBUG__.game 一直没有出现');
  problems.forEach((p) => console.log('     ' + p.slice(0, 240)));
  process.exit(1);
}
await sleep(600);
// 收掉开局三选一，免得模态盖住面板
await ev(`(() => {
  const g = window.__VILLAGE_WAR_DEBUG__.game;
  g.pendingStrategyRewards = [];
  g.awaitingOpeningReward = false;
  if (g.strategyEvent) g.strategyEvent = null;
  if (g.strategyEventUi?.root) g.strategyEventUi.root.hidden = true;
  document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
  return true;
})()`);
await sleep(300);

// ---------------------------------------------------------------- 准备库存
const prepared = await ev(`(() => {
  const g = window.__VILLAGE_WAR_DEBUG__.game;
  // 先清空，让"撤销后回到点击之前"这条断言有一个确定的起点
  g.baseInventory.loadSlots([]);
  g.baseInventory.add('deepCore', 3);
  g.baseInventory.add('wood', 200);
  g.backpack.close();
  return { ok: true, counts: g.baseInventory.countsByItem(), capacity: g.baseInventory.capacity };
})()`);
check('背包能拿到干净的材料起点', prepared.ok && prepared.counts.deepCore === 3 && prepared.counts.wood === 200,
  JSON.stringify(prepared.counts));

// ---------------------------------------------------------------- 1) 面板高度 / 快捷栏
const layout = await ev(`(() => {
  const g = window.__VILLAGE_WAR_DEBUG__.game;
  g.backpack.openBase();
  const panel = document.querySelector('.backpack-panel');
  const hotbar = document.querySelector('.item-hotbar');
  const measure = () => {
    const p = panel.getBoundingClientRect();
    const h = hotbar.getBoundingClientRect();
    const cx = h.left + h.width / 2;
    const cy = h.top + h.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return {
      survivalClass: document.body.classList.contains('is-survival-level'),
      panel: { top: Math.round(p.top), bottom: Math.round(p.bottom), height: Math.round(p.height) },
      hotbar: { top: Math.round(h.top), bottom: Math.round(h.bottom), height: Math.round(h.height) },
      hotbarHidden: hotbar.hidden,
      hotbarZ: getComputedStyle(hotbar).zIndex,
      overlapPx: Math.round(Math.max(0, p.bottom - h.top)),
      hitIsHotbar: Boolean(hit && hotbar.contains(hit)),
      hitTag: hit ? (hit.className || hit.tagName) : null,
      viewportHeight: window.innerHeight,
      cap20pct: Math.round(Math.min(window.innerHeight * 0.736, 688))
    };
  };
  const survival = measure();
  // 非海岛关：手牌区把快捷栏顶到 268px，面板要让的是这一整条
  document.body.classList.remove('is-survival-level');
  const carded = measure();
  document.body.classList.add('is-survival-level');
  return { survival, carded };
})()`);

console.log('\n--- 1) 基地背包高度与底部快捷栏 ---');
console.log('    海岛关 :', JSON.stringify(layout.survival));
console.log('    手牌关 :', JSON.stringify(layout.carded));

check('海岛关：面板与快捷栏不重叠', layout.survival.overlapPx === 0,
  `重叠 ${layout.survival.overlapPx}px`);
check('手牌关：面板与快捷栏不重叠', layout.carded.overlapPx === 0,
  `重叠 ${layout.carded.overlapPx}px`);
check('快捷栏在背包打开时仍然可见', !layout.survival.hotbarHidden && layout.survival.hotbar.height > 40);
check('快捷栏拿得到指针事件（不被全屏遮罩吃掉）',
  layout.survival.hitIsHotbar && layout.carded.hitIsHotbar,
  `elementFromPoint 命中：${layout.survival.hitTag} / ${layout.carded.hitTag}`);
check('快捷栏被抬到背包遮罩之上（z-index ≥ 13）',
  Number(layout.survival.hotbarZ) >= 13, `z-index=${layout.survival.hotbarZ}`);
check('面板高度不超过"缩小 20%"后的上限（73.6vh / 688px）',
  layout.survival.panel.height <= layout.survival.cap20pct + 1,
  `实际 ${layout.survival.panel.height}px > 上限 ${layout.survival.cap20pct}px`);
check('面板整体落在视口内', layout.survival.panel.top >= 0 && layout.survival.panel.bottom <= VIEW.height,
  JSON.stringify(layout.survival.panel));

// ---------------------------------------------------------------- 2) 合成后右键撤销
console.log('\n--- 2) 合成后右键取消并返还资源 ---');

const crafted = await ev(`(() => {
  const g = window.__VILLAGE_WAR_DEBUG__.game;
  const before = g.baseInventory.countsByItem();
  const tile = document.querySelector('[data-backpack-recipe="recruitmentOrder"]');
  if (!tile) return { ok: false, reason: '配方磁贴不存在（材料没被"见过"？）' };
  if (tile.classList.contains('is-locked')) return { ok: false, reason: '配方是灰的，材料不足' };
  tile.click();
  const cursor = g.backpack.cursor;
  return {
    ok: true,
    before,
    afterCraft: g.baseInventory.countsByItem(),
    hasCursor: Boolean(cursor),
    craftedFrom: cursor?.craftedFrom ?? null,
    ghost: Boolean(document.querySelector('.backpack-cursor-ghost')),
    outputInBag: g.baseInventory.countOf('recruitmentOrder')
  };
})()`);

check('点配方后产物上手，并记下了这次合成扣了什么',
  crafted.ok && crafted.hasCursor && Boolean(crafted.craftedFrom) && crafted.ghost,
  crafted.ok ? JSON.stringify({ hasCursor: crafted.hasCursor, craftedFrom: crafted.craftedFrom, ghost: crafted.ghost }) : crafted.reason);
check('合成确实先扣了材料（wood −20 / deepCore −1）',
  crafted.ok
  && crafted.afterCraft.wood === crafted.before.wood - 20
  && crafted.afterCraft.deepCore === crafted.before.deepCore - 1,
  JSON.stringify({ before: crafted.before, after: crafted.afterCraft }));
check('产物拿在手上，没有同时留在背包里', crafted.ok && crafted.outputInBag === 0);

// 在格子上右键：这是《我的世界》语义的"拿一半 / 放一个"，不许撤掉整笔合成
const slotRight = await ev(`(() => {
  const g = window.__VILLAGE_WAR_DEBUG__.game;
  const slot = document.querySelector('.backpack-slot');   // 面板里第一个格子（不是配方磁贴）
  slot.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
  return { cursorKept: Boolean(g.backpack.cursor), counts: g.baseInventory.countsByItem() };
})()`);
check('右键落在格子上不撤销（那边是"拿一半 / 放一个"）', slotRight.cursorKept === true);

// 在面板空白处右键：撤销，材料原样退回
const cancelled = await ev(`(() => {
  const g = window.__VILLAGE_WAR_DEBUG__.game;
  const panel = document.querySelector('.backpack-panel');
  panel.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
  g.backpack.refresh();
  return {
    cursor: g.backpack.cursor,
    counts: g.baseInventory.countsByItem(),
    ghost: Boolean(document.querySelector('.backpack-cursor-ghost')),
    feedback: g.backpack.feedback?.text ?? null,
    error: g.backpack.feedback?.error ?? null
  };
})()`);

check('右键撤销后手上空了', cancelled.cursor === null);
check('右键撤销后材料原样退回（wood / deepCore 回到点击之前）',
  cancelled.counts.wood === crafted.before.wood && cancelled.counts.deepCore === crafted.before.deepCore,
  JSON.stringify({ 期望: crafted.before, 实际: cancelled.counts }));
check('右键撤销后产物没有留在背包里', cancelled.counts.recruitmentOrder === undefined || cancelled.counts.recruitmentOrder === 0,
  JSON.stringify(cancelled.counts));
check('跟随光标的产物图标一并消失', cancelled.ghost === false);
check('界面给出了"已取消"的反馈', typeof cancelled.feedback === 'string' && cancelled.feedback.includes('取消'),
  String(cancelled.feedback));

// 产物落格之后就不再是"刚做好、还拿在手上"，右键不该还能撤
const afterPlaced = await ev(`(() => {
  const g = window.__VILLAGE_WAR_DEBUG__.game;
  const tile = document.querySelector('[data-backpack-recipe="recruitmentOrder"]');
  tile.click();                                  // 再做一笔
  const craftedCursor = Boolean(g.backpack.cursor?.craftedFrom);
  const empty = [...document.querySelectorAll('.backpack-slot.is-empty')].find(
    (el) => el.dataset.backpackContainer === 'base'
  );
  empty.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
  const placed = g.baseInventory.countOf('recruitmentOrder');
  const panel = document.querySelector('.backpack-panel');
  panel.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
  return { craftedCursor, placed, afterRightClick: g.baseInventory.countsByItem() };
})()`);
check('产物落格后右键不再撤销（已经是背包里的一件普通物品）',
  afterPlaced.craftedCursor === true
  && afterPlaced.placed === 1
  && afterPlaced.afterRightClick.recruitmentOrder === 1,
  JSON.stringify(afterPlaced));

// ---------------------------------------------------------------- 截图 + 收尾
mkdirSync(OUT_DIR, { recursive: true });
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log(`\n截图：${OUT}`);

const realProblems = problems.filter((p) => !/AudioContext|play\(\) failed|autoplay/i.test(p));
check('页面没有异常与 console.error', realProblems.length === 0, realProblems.slice(0, 3).join(' | ').slice(0, 300));

console.log(`\n=== ${failures.length === 0 ? '全部通过' : failures.length + ' 项失败'} ===`);
if (failures.length) console.log('失败项：' + failures.join(', '));
ws.close();
process.exit(failures.length === 0 ? 0 : 1);
