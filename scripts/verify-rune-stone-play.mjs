// 在真实游戏里验收符文石改版：启动第一关 → 逐项检查祭坛/开局/基地恢复/背包入口，
// 再走一遍 生成石头 → 装备 → 同名拒绝 → 魔力成长 → 击杀结算 → 出售 → 死亡保留 的完整链路。
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';

const PORT = Number(process.env.CHECK_CDP_PORT || 9223);
const BASE = process.env.CHECK_URL || 'http://127.0.0.1:3000/';
const OUT = 'C:/WebProjects/WebVillageWar/outputs/verify-rune-stone.png';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const baseOrigin = new URL(BASE).origin;
let target = list.find((t) => t.type === 'page' && String(t.url).startsWith(baseOrigin));
if (!target) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' });
  target = await res.json();
}
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 0;
const pending = new Map();
const logs = [];
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
    logs.push('[exception] ' + (m.params.exceptionDetails?.text ?? '') + ' ' + (m.params.exceptionDetails?.exception?.description ?? ''));
  } else if (m.method === 'Runtime.consoleAPICalled') {
    const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    if (/error|fail|exception/i.test(text + (m.params.type || ''))) logs.push(`[console.${m.params.type}] ${text}`);
  }
});
await new Promise((r, rej) => { ws.on('open', r); ws.on('error', rej); });
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

for (let i = 0; i < 40; i += 1) { await sleep(500); if (await ev(`!!document.querySelector('[data-action="levels"]')`)) break; }
await sleep(600);
await ev(`document.querySelector('[data-action="levels"]')?.click(); true`);
await sleep(1200);
await ev(`(()=>{const s=[...document.querySelectorAll('[data-action="select-level"]')].find(e=>e.offsetParent!==null);if(s)s.click();return true;})()`);
await sleep(600);
await ev(`(()=>{const b=[...document.querySelectorAll('[data-action="start-level"]')].find(e=>e.offsetParent!==null);if(b)b.click();return true;})()`);

let started = false;
let launchError = null;
for (let i = 0; i < 60; i += 1) {
  await sleep(500);
  const raw = await ev(`JSON.stringify({err: window.__VILLAGE_WAR_LAST_LAUNCH_ERROR__?.message||null, ok: !!window.__VILLAGE_WAR_DEBUG__?.game})`);
  const v = JSON.parse(raw);
  if (v.err) { launchError = v.err; break; }
  if (v.ok) { started = true; break; }
}

const report = { started, launchError, static: null, flow: null, screen: null };
if (started) {
  report.static = JSON.parse(await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    const altars = g.altars?.altars ?? [];
    const manaAltar = altars.find((a) => a.type === 'mana');
    return JSON.stringify({
      hasRuneSystem: !!g.runeStones,
      hasBackpackUi: !!g.runeBackpack,
      launcherInDom: !!document.querySelector('#rune-backpack-button'),
      altarTypes: altars.map((a) => a.type),
      allAltarsShareRecovery: altars.every((a) => (a.definition?.effects ?? []).some((e) => e.op === 'restoreHealthPercent') && (a.definition?.effects ?? []).some((e) => e.op === 'restoreDurabilityPercent')),
      manaAltarOps: (manaAltar?.definition?.effects ?? []).map((e) => e.op),
      openingSteps: (g.openingRewardSteps?.() ?? []).map((s) => s.type),
      baseRecoveryFields: ['recoveryRadius','healthPerSecond','durabilityPerSecond'].filter((k) => g.playerBase?.[k] !== undefined),
      legacyRecoveryAuraApi: typeof g.effects?.ensureRecoveryAura === 'function',
      manaBurstApi: typeof g.effects?.spawnManaBurst === 'function',
      passiveDurabilityTimer: typeof g.recovery?.passiveDurabilityTimer === 'number',
      legacyHoldApis: ['maybeStartEnchantHold','startEnchantHold','tickEnchantHold','stopEnchantHold','rejectFullEnchantmentTarget']
        .filter((name) => typeof g.cardSystem?.[name] === 'function'),
      freeChargeFields: Object.keys(g.friendlyUnits?.[0] ?? {}).filter((k) => k.startsWith('freeEnchantment'))
    });
  })()`));

  report.flow = JSON.parse(await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    const out = {};
    const slot = g.localPlayerSlot ?? g.localPlayerId;
    g.summonUnits('knight', 1, g.playerBase.position.clone(), 0.8, { select: false });
    const unit = g.friendlyUnits.find((u) => u.team === 'player' && u.type === 'knight' && u.alive);
    out.unitFound = !!unit;
    if (!unit) return JSON.stringify(out);

    const card = { id: 'fire-enchant', kind: 'enchant', level: 1, enchantmentId: 'fire', energyCost: 2 };

    const toBase = g.runeStones.createFromCard(card, { playerId: slot, paidEnergy: 2 });
    out.toBaseBackpack = toBase.ok === true && toBase.placement === 'base';
    out.baseHadStone = g.runeStones.baseStones(slot).length === 1;
    out.inactiveInBase = unit.enchantments.has('fire') === false;

    const moved = g.runeStones.moveStone(toBase.stone.id, { kind: 'unit', unit });
    out.equipped = moved.ok === true && unit.enchantments.has('fire') === true;
    out.paidEnergyRecorded = g.runeStones.stoneById(toBase.stone.id)?.paidEnergy === 2;

    const dup = g.runeStones.createFromCard(card, { playerId: slot, targetUnit: unit, paidEnergy: 2 });
    out.duplicateAccepted = dup.ok === true;
    out.duplicateIsBackup = dup.ok === true && g.runeStones.isStoneInactiveDuplicate(dup.stone) === true;
    out.duplicateDidNotAddEnchant = unit.enchantments.size === 1;
    if (dup.ok) {
      const backupMana = dup.stone.mana;
      g.runeStones.awardMana(unit, 120);
      out.backupGainsMana = dup.stone.mana > backupMana || dup.stone.level > 1;
    }

    // 击杀魔力：携带值由「档位基础值 × 与生命/攻击同源的难度系数」决定，
    // 并且按携带数量均分给该单位身上所有的符文石（含同名备用石）。
    g.spawnEnemyWave(1);
    const victim = g.enemyUnits.find((u) => u.alive && u.team === 'enemy' && !u.isWildlife);
    out.enemyManaFactor = victim?.manaDifficultyFactor ?? null;
    out.enemyCarriedMana = victim?.manaValue ?? null;
    const manaStones = g.runeStones.stonesForUnit(unit);
    const sumMana = () => g.runeStones.stonesForUnit(unit)
      .reduce((sum, entry) => sum + entry.mana, 0);
    const sumBefore = sumMana();
    out.killManaSplitAcross = manaStones.length;
    if (victim) {
      g.combat.applyDamage(victim, 99999, unit, 0, { source: unit, target: victim, isAttack: true });
    }
    out.killManaGained = sumMana() - sumBefore;
    out.killManaMatches = victim
      ? Math.abs(out.killManaGained - (victim.manaValue ?? 0)) < 1e-6
      : false;

    // 魔力成长：攒够阈值必须升级，且单位身上的效果等级同步。
    const beforeLevel = unit.enchantments.get('fire')?.level ?? null;
    g.runeStones.awardMana(unit, 200);
    out.levelBefore = beforeLevel;
    out.levelAfter = unit.enchantments.get('fire')?.level ?? null;
    out.levelSynced = out.levelAfter > out.levelBefore;

    // 出售：实付能量 80% + 等级溢价（每级 +2）。
    // 卖掉生效的那一块后，同名备用石必须立刻顶上继续生效。
    const activeBeforeSell = g.runeStones.stonesForUnit(unit)
      .find((entry) => g.runeStones.isStoneActive(entry))?.id ?? null;
    const energyBefore = g.cardSystem.energy;
    const expectedRefund = Math.round((1.6 + Math.max(0, toBase.stone.level - 1) * 2) * 100) / 100;
    const sold = g.runeStones.sellStone(toBase.stone.id, { playerId: slot });
    const activeAfterSell = g.runeStones.stonesForUnit(unit)
      .find((entry) => g.runeStones.isStoneActive(entry))?.id ?? null;
    out.sellRefund = sold.refund;
    out.sellRefundExpected = expectedRefund;
    out.sellRefundCorrect = Math.abs(sold.refund - expectedRefund) < 1e-9;
    out.sellRefundAboveFlatPrice = sold.refund > 1.6;
    out.energyGained = g.cardSystem.energy - energyBefore;
    out.soldStoneGone = g.runeStones.stoneById(toBase.stone.id) === null;
    out.activeStoneBeforeSell = activeBeforeSell;
    out.activeStoneAfterSell = activeAfterSell;
    out.backupTakesOverAfterSell = activeBeforeSell !== null && activeAfterSell !== null
      && activeBeforeSell !== activeAfterSell;
    out.enchantKeptByBackup = unit.enchantments.has('fire') === true;

    // 阵亡掉落（生存方案第 7 节）：真正走一遍战斗死亡链路。
    // 石头必须**离开单位落地**成为可拾取遗物，不再留在阵亡单位背包里，也不自动回基地；
    // 等级、经验与身份必须原样保留，捡回后是同一块石头。
    const again = g.runeStones.createFromCard(card, { playerId: slot, targetUnit: unit, paidEnergy: 2 });
    out.stoneIdBeforeDeath = again.stone?.id ?? null;
    const stonesBeforeDeath = g.runeStones.unitStones(unit.id).length;
    out.stonesBeforeDeath = stonesBeforeDeath;
    const groundLevelBefore = again.stone?.level ?? null;
    g.spawnEnemyWave(1);
    const killer = g.enemyUnits.find((u) => u.alive && u.team === 'enemy' && !u.isWildlife);
    if (killer) g.combat.applyDamage(unit, 99999, killer, 0, { source: killer, target: unit, isAttack: true });
    out.unitDied = unit.alive === false;
    out.stoneLeftDeadUnit = g.runeStones.unitStones(unit.id).length === 0;
    out.notAutoReturned = g.runeStones.baseStones(slot).length === 0;
    out.strandedListStaysEmpty = g.runeStones.strandedBackpacks(slot).length === 0;
    const groundStone = g.runeStones.stoneById(out.stoneIdBeforeDeath);
    out.stoneDroppedToGround = groundStone?.location?.kind === 'ground';
    out.groundLevelKept = groundStone?.level === groundLevelBefore;
    out.deadUnitLostEnchant = unit.enchantments.has('fire') === false;
    const dropEntry = [...g.drops.entries.values()]
      .find((entry) => entry.drop.stacks.some((stack) => stack.instanceId === out.stoneIdBeforeDeath)) ?? null;
    out.groundDropExists = Boolean(dropEntry);
    out.groundDropHasStoneStack = Boolean(dropEntry)
      && dropEntry.drop.stacks.some((stack) => stack.itemId === 'runeStone');
    // 派人捡回：同一个实例回到新持有者身上，而不是新造一块
    const stonesBeforePick = g.runeStones.allStones({ playerId: slot }).length;
    g.summonUnits('knight', 1, g.playerBase.position.clone(), 0.8, { select: false });
    const picker = g.friendlyUnits.find((u) => u.team === 'player' && u.alive && u.type === 'knight') ?? null;
    const picked = dropEntry && picker ? g.drops.pickUp(dropEntry.drop.id, picker) : null;
    out.pickedUp = picked?.ok === true;
    out.pickerHasStone = Boolean(picker)
      && g.runeStones.stonesForUnit(picker).some((entry) => entry.id === out.stoneIdBeforeDeath);
    out.pickerEnchantActive = Boolean(picker) && picker.enchantments.has('fire') === true;
    out.stoneCountUnchanged = g.runeStones.allStones({ playerId: slot }).length === stonesBeforePick;
    out.groundStoneGone = g.runeStones.stoneById(out.stoneIdBeforeDeath)?.location?.kind === 'unit';
    return JSON.stringify(out);
  })()`));

  // 界面交互：E 需要单位、死亡关背包、图片+左上角等级、跟随光标的拖拽、B 居中、Esc 一起关。
  report.screen = JSON.parse(await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    const out = {};
    g.runeBackpack?.close?.();

    // 1) 没有任何单位指向/选中时，E 不得打开背包（否则玩家不知道开的是谁的）。
    g.selectedUnit = null;
    g.pointerScreen.set(2, 2); // 屏幕左上角，不可能落在单位上
    out.hoveredUnitIsNull = g.hoveredFriendlyUnitForBackpack() === null;
    g.toggleUnitRuneBackpack();
    out.eWithoutUnitDoesNotOpen = g.runeBackpack.isOpen() === false;

    // 2) 有单位时 E 打开单位背包（两个背包一起出现）。
    g.summonUnits('knight', 1, g.playerBase.position.clone(), 0.8, { select: false });
    const unit = g.friendlyUnits.find((u) => u.team === 'player' && u.type === 'knight' && u.alive) ?? null;
    out.hasLivingUnit = !!unit;
    g.selectedUnit = unit;
    g.toggleUnitRuneBackpack();
    const root = document.querySelector('#rune-backpack');
    const columnTitle = (selector) => root?.querySelector(selector)?.textContent?.trim() ?? null;
    out.unitModeOpen = !!root && !root.hidden && g.runeBackpack.mode === 'unit';
    out.unitModeHasBothColumns = !!root?.querySelector('[data-rune-drop="unit"]')
      && !!root?.querySelector('[data-rune-drop="base"]');
    out.unitColumnTitle = columnTitle('.rune-backpack-column.is-unit .rune-backpack-column-title span:first-child');
    out.baseColumnTitle = columnTitle('.rune-backpack-column.is-base .rune-backpack-column-title span:first-child');
    out.trashPresent = !!root?.querySelector('[data-rune-sell]');
    out.trashLabel = root?.querySelector('.rune-backpack-trash-label')?.textContent ?? null;
    out.selectedPanelButton = !!document.querySelector('#rune-backpack-open');

    // 3) 石头 = 对应附魔的图片，等级压在图片内部左上角。
    const tile = root?.querySelector('.rune-stone');
    out.stoneTileCount = root?.querySelectorAll('.rune-stone').length ?? 0;
    out.stoneHasArt = !!tile?.querySelector('.rune-stone-art svg, .rune-stone-art img');
    const badge = tile?.querySelector('.rune-stone-level');
    out.stoneLevelBadgeText = badge?.textContent ?? null;
    out.stoneLevelBadgeInsideTopLeft = (() => {
      if (!tile || !badge) return false;
      const t = tile.getBoundingClientRect();
      const b = badge.getBoundingClientRect();
      return b.left >= t.left - 1
        && b.top >= t.top - 1
        && b.right <= t.right + 1
        && b.bottom <= t.bottom + 1
        && b.top < t.top + t.height / 2
        && b.left < t.left + t.width / 2;
    })();

    // 4) 拖拽时物品跟着光标走（类似《我的世界》）。
    if (tile) {
      const rect = tile.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      tile.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse'
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, clientX: cx + 40, clientY: cy + 30, pointerId: 1, pointerType: 'mouse'
      }));
      const ghost = document.querySelector('[data-rune-drag-ghost]');
      out.dragGhostCreated = !!ghost;
      out.dragGhostHasArt = !!ghost?.querySelector('.rune-stone-art svg, .rune-stone-art img');
      out.dragGhostFollowsCursor = !!ghost
        && Math.abs(parseFloat(ghost.style.left) - (cx + 40)) < 2
        && Math.abs(parseFloat(ghost.style.top) - (cy + 30)) < 2;
      // 松手落在面板之外，确认不误触转移，同时跟随物被移除。
      window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, clientX: 4, clientY: 4, pointerId: 1, pointerType: 'mouse'
      }));
      out.dragGhostRemoved = !document.querySelector('[data-rune-drag-ghost]');
    }

    // 5) 单位阵亡时必须关闭它的背包。
    out.openForUnitBeforeDeath = g.runeBackpack.isOpen() && g.runeBackpack.unit === unit;
    g.spawnEnemyWave(1);
    const killer = g.enemyUnits.find((u) => u.alive && u.team === 'enemy' && !u.isWildlife);
    if (killer && unit?.alive) {
      g.combat.applyDamage(unit, 99999, killer, 0, { source: killer, target: unit, isAttack: true });
    }
    out.unitDied = unit ? unit.alive === false : false;
    out.deathClosesBackpack = g.runeBackpack.isOpen() === false;

    // 6) B：基地背包居中，单位背包列隐藏。
    g.toggleBaseRuneBackpack();
    out.baseModeOpen = !!root && !root.hidden && g.runeBackpack.mode === 'base';
    // 用真实几何验证「居中」：先关掉过渡，避免量到动画中途的位置。
    const previousTransition = root.style.transition;
    root.style.transition = 'none';
    void root.offsetWidth;
    out.baseModeCenteredRect = (() => {
      const rect = root?.getBoundingClientRect?.();
      if (!rect || !rect.width) return false;
      const dx = Math.abs((rect.left + rect.width / 2) - window.innerWidth / 2);
      const dy = Math.abs((rect.top + rect.height / 2) - window.innerHeight / 2);
      return dx < 2 && dy < 2;
    })();
    root.style.transition = previousTransition;
    const unitColumn = root?.querySelector('.rune-backpack-column.is-unit');
    out.baseModeHidesUnitColumn = !!unitColumn
      && getComputedStyle(unitColumn).display === 'none';
    out.baseCountText = root?.querySelector('[data-rune-base-count]')?.textContent ?? null;

    // 7) Esc：两个背包一起关闭。
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    out.escClosesBoth = !!root?.hidden;
    return JSON.stringify(out);
  })()`));
}

await sleep(1200);
mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
const capture = async (path) => {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  writeFileSync(path, Buffer.from(shot.data, 'base64'));
};
await capture(OUT);

if (started) {
  // 两种背包形态各留一张图，便于人工核对布局（左右并排 / 居中 + 垃圾桶）。
  // 开局三选一是模态弹窗且居中，会盖住居中的基地背包，截图前先把它收掉。
  await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    g.pendingStrategyRewards = [];
    g.awaitingOpeningReward = false;
    if (g.strategyEvent) g.strategyEvent = null;
    if (g.strategyEventUi?.root) g.strategyEventUi.root.hidden = true;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
    g.paused = false;
    return true;
  })()`);
  await sleep(400);

  await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    g.toggleUnitRuneBackpack();
    return true;
  })()`);
  await sleep(700);
  await capture('C:/WebProjects/WebVillageWar/outputs/verify-rune-backpack-unit.png');

  await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    g.runeBackpack.close();
    g.toggleBaseRuneBackpack();
    return true;
  })()`);
  await sleep(700);
  await capture('C:/WebProjects/WebVillageWar/outputs/verify-rune-backpack-base.png');
}

console.log(JSON.stringify(report, null, 2));
console.log('--- errors logged:', logs.length);
console.log(logs.slice(0, 12).join('\n'));
console.log('SCREENSHOT', OUT);
ws.close();
process.exit(0);
