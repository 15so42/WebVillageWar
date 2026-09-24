// 在真实游戏里验收符文石改版：启动第一关 → 逐项检查祭坛/开局/基地恢复/统一背包面板，
// 再走一遍 生成石头 → 装备 → 同名拒绝 → 魔力成长 → 击杀结算 → 出售 → 死亡保留 的完整链路。
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';

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
// 注意：页内代码抛错时 Runtime.evaluate 只回一个 undefined，
// 不检查 exceptionDetails 的话所有失败都长成 '"undefined" is not valid JSON'。
const ev = async (expr) => {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, timeout: 300000 });
  if (res.exceptionDetails) {
    throw new Error('page eval failed: ' + (res.exceptionDetails.exception?.description ?? res.exceptionDetails.text));
  }
  return res.result.value;
};

const started = await enterSurvivalGame(ev, sleep);
// 保留原有的启动诊断：把页面里的启动错误读出来
const launchError = await ev(`window.__VILLAGE_WAR_LAST_LAUNCH_ERROR__?.message ?? null`);

const report = { started, launchError, static: null, flow: null, screen: null };
if (started) {
  report.static = JSON.parse(await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    const altars = g.altars?.altars ?? [];
    const manaAltar = altars.find((a) => a.type === 'mana');
    return JSON.stringify({
      hasRuneSystem: !!g.runeStones,
      // 统一背包面板：game.backpack 是实例，game.baseStorage 只是它的别名，
      // 旧的符文背包面板（game.runeBackpack）已经不存在。
      hasBackpackUi: !!g.backpack && g.baseStorage === g.backpack,
      // 旧面板与旧入口必须彻底消失（再出现就是回归）
      legacyPanelsRemoved: !document.querySelector('#rune-backpack')
        && !document.querySelector('#rune-backpack-button')
        && !document.querySelector('#rune-backpack-open')
        && !document.querySelector('#base-storage')
        && !document.querySelector('#base-storage-button'),
      altarTypes: altars.map((a) => a.type),
      allAltarsShareRecovery: altars.every((a) => (a.definition?.effects ?? []).some((e) => e.op === 'restoreHealthPercent') && (a.definition?.effects ?? []).some((e) => e.op === 'restoreDurabilityPercent')),
      manaAltarOps: (manaAltar?.definition?.effects ?? []).map((e) => e.op),
      openingSteps: (g.openingRewardSteps?.() ?? []).map((s) => s.type),
      baseRecoveryFields: ['recoveryRadius','healthPerSecond','durabilityPerSecond'].filter((k) => g.playerBase?.[k] !== undefined),
      legacyRecoveryAuraApi: typeof g.effects?.ensureRecoveryAura === 'function',
      manaBurstApi: typeof g.effects?.spawnManaBurst === 'function',
      passiveDurabilityTimer: typeof g.recovery?.passiveDurabilityTimer === 'number',
      // 卡牌系统已移除：这里直接断言它不存在，比"找不到那些历史方法"更强
      cardSystemRemoved: g.cardSystem === null || g.cardSystem === undefined,
      legacyHoldApis: [],
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

    // 造石走**无卡入口**（附魔台用的就是它）：卡牌系统已移除，
    // 这里不再构造"附魔卡"这种中间物，直接指定附魔与等级。
    const toBase = g.runeStones.createEnchantmentStone({ enchantmentId: 'fire', level: 1, playerId: slot, paidEnergy: 2 });
    out.toBaseBackpack = toBase.ok === true && toBase.placement === 'base';
    out.baseHadStone = g.runeStones.baseStones(slot).length === 1;
    out.inactiveInBase = unit.enchantments.has('fire') === false;

    const moved = g.runeStones.moveStone(toBase.stone.id, { kind: 'unit', unit });
    out.equipped = moved.ok === true && unit.enchantments.has('fire') === true;
    out.paidEnergyRecorded = g.runeStones.stoneById(toBase.stone.id)?.paidEnergy === 2;

    const dup = g.runeStones.createEnchantmentStone({ enchantmentId: 'fire', level: 1, playerId: slot, targetUnit: unit, paidEnergy: 2 });
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
    //
    // 注意取靶方式：**海岛关不跑旧的波次流程**，spawnEnemyWave 在这里是空操作，
    // 按它取靶会拿到 undefined（这次就是因此才发现旧脚本的击杀断言一直是空转的）。
    // 所以直接取场上任意活着的敌人——它们都走过 assignEnemyManaValue。
    g.spawnEnemyWave(1);
    const victim = g.enemyUnits.find((u) => u.alive && u.team === 'enemy');
    out.victimFound = Boolean(victim);
    out.victimType = victim?.type ?? null;
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

    // 出售：卖掉生效的那一块后，同名备用石必须立刻顶上继续生效。
    // **返还金额不再断言**：原本返还的是卡牌能量，卡牌经济移除之后
    // "卖石头该换回什么"还没有定（见实施文档的待定项），所以这里只验"石头没了、备用石接管"。
    const activeBeforeSell = g.runeStones.stonesForUnit(unit)
      .find((entry) => g.runeStones.isStoneActive(entry))?.id ?? null;
    const sold = g.runeStones.sellStone(toBase.stone.id, { playerId: slot });
    const activeAfterSell = g.runeStones.stonesForUnit(unit)
      .find((entry) => g.runeStones.isStoneActive(entry))?.id ?? null;
    out.sellOk = sold.ok === true;
    out.soldStoneGone = g.runeStones.stoneById(toBase.stone.id) === null;
    out.activeStoneBeforeSell = activeBeforeSell;
    out.activeStoneAfterSell = activeAfterSell;
    out.backupTakesOverAfterSell = activeBeforeSell !== null && activeAfterSell !== null
      && activeBeforeSell !== activeAfterSell;
    out.enchantKeptByBackup = unit.enchantments.has('fire') === true;

    // 阵亡掉落（生存方案第 7 节）：真正走一遍战斗死亡链路。
    // 石头必须**离开单位落地**成为可拾取遗物，不再留在阵亡单位背包里，也不自动回基地；
    // 等级、经验与身份必须原样保留，捡回后是同一块石头。
    const again = g.runeStones.createEnchantmentStone({ enchantmentId: 'fire', level: 2, playerId: slot, targetUnit: unit, paidEnergy: 2 });
    out.stoneIdBeforeDeath = again.stone?.id ?? null;
    const stonesBeforeDeath = g.runeStones.unitStones(unit.id).length;
    out.stonesBeforeDeath = stonesBeforeDeath;
    const groundLevelBefore = again.stone?.level ?? null;
    g.spawnEnemyWave(1);
    const killer = g.enemyUnits.find((u) => u.alive && u.team === 'enemy');
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

  // 界面交互：E 需要单位、死亡关背包、图 + 左上角等级、"手上那一叠"跟随光标、B 居中、Esc 关闭。
  // 统一背包面板之后只有一个 `#backpack`：E 打开"这个单位的背包"，B 打开基地背包，
  // 两者共享同一套网格与《我的世界》式拿起/放下语义（不再有两个并排的列）。
  report.screen = JSON.parse(await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    const out = {};
    const panel = g.backpack;
    panel.close();

    // 1) 没有任何单位指向/选中时，E 不得打开背包（否则玩家不知道开的是谁的）。
    g.selectedUnit = null;
    g.pointerScreen.set(2, 2); // 屏幕左上角，不可能落在单位上
    out.hoveredUnitIsNull = g.hoveredFriendlyUnitForBackpack() === null;
    g.toggleUnitBackpack();
    out.eWithoutUnitDoesNotOpen = panel.isOpen() === false;

    // 2) 有单位时 E 打开单位背包：面板切到单位视图，左侧画的是**这个单位**的背包。
    g.summonUnits('knight', 1, g.playerBase.position.clone(), 0.8, { select: false });
    const unit = g.friendlyUnits.find((u) => u.team === 'player' && u.type === 'knight' && u.alive) ?? null;
    out.hasLivingUnit = !!unit;
    g.selectedUnit = unit;
    g.toggleUnitBackpack();
    const root = document.querySelector('#backpack');
    out.unitModeOpen = !!root && !root.hidden && panel.mode === 'unit' && panel.unit === unit;
    out.unitViewClass = !!root && root.classList.contains('is-unit-view');
    out.unitModeTitle = root?.querySelector('[data-backpack-grid-title]')?.textContent?.trim() ?? null;
    out.trashPresent = !!root?.querySelector('[data-backpack-trash]');
    out.trashLabel = root?.querySelector('.backpack-trash-label')?.textContent ?? null;
    // 新面板没有常驻入口按钮：B / E 就是入口（少一个占屏幕的按钮）。
    out.noLauncherButton = !document.querySelector('#rune-backpack-open')
      && !document.querySelector('#rune-backpack-button');

    // 3) 石头就是库存里的一件物品：对应附魔的图 + 左上角等级 + **没有**数量角标。
    const runeCells = () => [...(root?.querySelectorAll('[data-backpack-grid] [data-backpack-slot].is-rune') ?? [])];
    const tiles = runeCells();
    out.stoneTileCount = tiles.length;
    const tile = tiles[0] ?? null;
    out.stoneHasArt = !!tile?.querySelector('.backpack-slot-art svg, .backpack-slot-art img');
    const badge = tile?.querySelector('.backpack-slot-level');
    out.stoneLevelBadgeText = badge?.textContent ?? null;
    out.stoneLevelMatches = Number.isFinite(Number(badge?.textContent))
      && Number(badge.textContent) === (g.runeStones.stonesForUnit(unit)[0]?.level ?? -1);
    // 符文石不可堆叠：一格一块，所以它不显示数量。
    out.stoneHasNoCount = !tile?.querySelector('.backpack-slot-count');
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

    // 4) 左键拿起后物品跟着光标走（类似《我的世界》），松手不改状态、放回去不丢东西。
    if (tile) {
      const slotIndex = Number(tile.dataset.backpackSlot);
      const rect = tile.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      tile.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse', button: 0
      }));
      out.pickedStoneOntoCursor = panel.cursor?.itemId === 'runeStone';
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, clientX: cx + 40, clientY: cy + 30, pointerId: 1, pointerType: 'mouse'
      }));
      const ghost = document.querySelector('.backpack-cursor-ghost');
      out.dragGhostCreated = !!ghost;
      out.dragGhostHasArt = !!ghost?.querySelector('svg, img');
      out.dragGhostFollowsCursor = !!ghost
        && Math.abs(parseFloat(ghost.style.left) - (cx + 40)) < 2
        && Math.abs(parseFloat(ghost.style.top) - (cy + 30)) < 2;
      // 拿在手上再点同一格放回去：手要空、跟随物要消失、石头还在背包里（不销毁物品）。
      panel.handleSlotClick(slotIndex);
      out.cursorClearedAfterPlaceBack = panel.cursor === null;
      out.dragGhostRemoved = !document.querySelector('.backpack-cursor-ghost');
      out.stoneBackInGrid = runeCells().length === out.stoneTileCount;
    }

    // 5) 单位阵亡时必须关闭它的背包。
    out.openForUnitBeforeDeath = panel.isOpen() && panel.unit === unit;
    g.spawnEnemyWave(1);
    const killer = g.enemyUnits.find((u) => u.alive && u.team === 'enemy');
    if (killer && unit?.alive) {
      g.combat.applyDamage(unit, 99999, killer, 0, { source: killer, target: unit, isAttack: true });
    }
    out.unitDied = unit ? unit.alive === false : false;
    out.deathClosesBackpack = panel.isOpen() === false;

    // 6) B：基地背包居中，画的是基地那一套格子。
    g.toggleBaseBackpack();
    out.baseModeOpen = panel.isOpen() === true && panel.mode === 'base' && panel.unit === null;
    out.baseViewClass = !!root && root.classList.contains('is-base-view');
    out.baseModeTitle = root?.querySelector('[data-backpack-grid-title]')?.textContent?.trim() ?? null;
    // 用真实几何验证「居中」：面板在 inset:0 的遮罩里 flex 居中，
    // 所以要量 .backpack-panel（#backpack 本身铺满视口，量它恒为居中）。
    out.panelCenteredRect = (() => {
      const rect = root?.querySelector('.backpack-panel')?.getBoundingClientRect?.();
      if (!rect || !rect.width) return false;
      const dx = Math.abs((rect.left + rect.width / 2) - window.innerWidth / 2);
      const dy = Math.abs((rect.top + rect.height / 2) - window.innerHeight / 2);
      return dx < 2 && dy < 2;
    })();
    out.baseCountText = root?.querySelector('[data-backpack-grid-count]')?.textContent ?? null;
    out.baseGridCells = root?.querySelectorAll('[data-backpack-grid] [data-backpack-slot]').length ?? 0;

    // 7) Esc：关掉背包。
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    out.escClosesBoth = panel.isOpen() === false && root?.hidden === true;
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
  // 两种背包视图各留一张图，便于人工核对布局（单位背包 / 基地背包 + 合成）。
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
    // 上面那段把用来测背包的骑士打死了，这里重新挑一个活着的有背包单位。
    const unit = (g.friendlyUnits ?? []).find((u) => u?.alive && !u.isBuilding) ?? null;
    if (unit) g.backpack.openForUnit(unit);
    return true;
  })()`);
  await sleep(700);
  await capture('C:/WebProjects/WebVillageWar/outputs/verify-rune-backpack-unit.png');

  await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    g.backpack.close();
    g.toggleBaseBackpack();
    return true;
  })()`);
  await sleep(700);
  await capture('C:/WebProjects/WebVillageWar/outputs/verify-rune-backpack-base.png');
}

// 判定：这些是**生存玩法仍然依赖**的链路（符文石现在由附魔台产出，
// 装备 / 同名备用 / 出售后备用接管 / 击杀成长 / 阵亡落地 / 拾回同一块都必须成立）。
// 这个脚本原本只打印报告、永远 exit 0——那等于没有门槛，任何回归都不会被发现，
// 所以补上真正的退出码。出售返还金额不在这里判定（卡牌能量移除后尚未定，见实施文档）。
const verdict = {
  started: started === true,
  noLaunchError: !launchError,
  cardSystemRemoved: report.static?.cardSystemRemoved === true,
  runeSystemAlive: report.static?.hasRuneSystem === true
    && report.static?.hasBackpackUi === true
    && report.static?.legacyPanelsRemoved === true,
  stoneEquips: report.flow?.equipped === true && report.flow?.inactiveInBase === true,
  duplicateBecomesBackup: report.flow?.duplicateAccepted === true
    && report.flow?.duplicateIsBackup === true
    && report.flow?.duplicateDidNotAddEnchant === true,
  killAwardsMana: report.flow?.victimFound === true
    && (report.flow?.killManaGained ?? 0) > 0
    && report.flow?.killManaMatches === true,
  manaGrowsLevel: report.flow?.levelSynced === true,
  sellKeepsBackupActive: report.flow?.sellOk === true
    && report.flow?.soldStoneGone === true
    && report.flow?.backupTakesOverAfterSell === true
    && report.flow?.enchantKeptByBackup === true,
  deathDropsStone: report.flow?.stoneLeftDeadUnit === true
    && report.flow?.notAutoReturned === true
    && report.flow?.stoneDroppedToGround === true
    && report.flow?.groundDropExists === true
    && report.flow?.groundLevelKept === true,
  pickupRestoresSameStone: report.flow?.pickedUp === true
    && report.flow?.pickerHasStone === true
    && report.flow?.pickerEnchantActive === true
    && report.flow?.stoneCountUnchanged === true,
  // 统一背包面板：E 开单位背包（需要单位）、死亡自动关、石头画成物品、
  // 拿起时跟随光标且能放回、B 开基地背包且面板居中、Esc 关闭。
  backpackUiIntact: report.screen?.unitModeOpen === true
    && report.screen?.baseModeOpen === true
    && report.screen?.escClosesBoth === true
    && report.screen?.eWithoutUnitDoesNotOpen === true
    && report.screen?.panelCenteredRect === true
    && report.screen?.stoneHasArt === true
    && report.screen?.stoneLevelMatches === true
    && report.screen?.stoneHasNoCount === true
    && report.screen?.stoneLevelBadgeInsideTopLeft === true
    && report.screen?.pickedStoneOntoCursor === true
    && report.screen?.dragGhostFollowsCursor === true
    && report.screen?.dragGhostRemoved === true
    && report.screen?.cursorClearedAfterPlaceBack === true
    && report.screen?.stoneBackInGrid === true
    && report.screen?.deathClosesBackpack === true,
  noErrors: logs.length === 0
};
report.verdict = verdict;
console.log(JSON.stringify(report, null, 2));
console.log('--- errors logged:', logs.length);
console.log(logs.slice(0, 12).join('\n'));
console.log('SCREENSHOT', OUT);
const ok = Object.values(verdict).every(Boolean);
console.log(ok ? '\nRUNE STONE LIFECYCLE: PASS' : '\nRUNE STONE LIFECYCLE: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
