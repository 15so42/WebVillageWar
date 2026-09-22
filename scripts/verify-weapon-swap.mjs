// 战斗单位背包 + 同类武器更换端到端验收（方案第 6.2 节）。
//
// 验的是三件事：
//   1. 战斗单位**有背包**：从基地把武器搬给它（方案第 4 节「可以把工具、武器和附魔石拖给单位」）；
//   2. 同族武器能装备，而且**真的改变战斗输出**（伤害数字来自 unit.physicalAttack，不是模型）；
//   3. 跨族武器被拒绝，并且**什么都不会被换掉**；
//   4. 换下来的原配武器**物化回背包**——物品守恒，不会换一次少一把。
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';

const CDP_PORT = Number(process.env.ISLAND_CDP_PORT || 9235);
const BASE = process.env.ISLAND_URL || 'http://127.0.0.1:3000/';
const LEVEL_ID = process.env.ISLAND_LEVEL_ID || 'island-survival';

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
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const res = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
    timeout: 900000
  });
  if (res.exceptionDetails) {
    throw new Error('page eval failed: ' + (res.exceptionDetails.exception?.description ?? res.exceptionDetails.text));
  }
  return res.result.value;
};

await send('Page.navigate', { url: BASE });
const report = { page: BASE, levelId: LEVEL_ID, started: false, result: null, problems };
for (let i = 0; i < 60; i += 1) {
  await sleep(400);
  if (await ev(`!!document.querySelector('[data-action="levels"]')`)) break;
}
await ev(`document.querySelector('[data-action="levels"]')?.click(); true`);
await sleep(1200);
await ev(`(() => {
  const btn = [...document.querySelectorAll('[data-action="select-level"]')]
    .find((e) => e.offsetParent !== null && (e.dataset.levelId || '').includes(${JSON.stringify(LEVEL_ID)}));
  if (btn) btn.click();
  return true;
})()`);
await sleep(500);
await ev(`(()=>{const b=[...document.querySelectorAll('[data-action="start-level"]')].find(e=>e.offsetParent!==null);if(b)b.click();return true;})()`);
for (let i = 0; i < 60; i += 1) {
  await sleep(400);
  if (await ev(`!!window.__VILLAGE_WAR_DEBUG__?.game`)) { report.started = true; break; }
}

if (report.started) {
  await sleep(500);
  report.result = JSON.parse(await ev(`(async () => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const out = {};
    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    game.paused = false;
    const step = async (n) => {
      for (let i = 0; i < n; i += 1) {
        game.tick();
        if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };
    await step(8);
    game.pendingStrategyRewards = [];
    game.awaitingOpeningReward = false;
    if (game.strategyEvent) game.strategyEvent = null;
    if (game.strategyEventUi?.root) game.strategyEventUi.root.hidden = true;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
    // 清场：放过巢穴（全清会判胜、关卡结束、系统停推）与野生动物（要留一个当靶子）。
    (game.enemyUnits ?? []).slice().forEach((unit) => {
      if (!unit?.alive || unit.isSpawnPointNest || unit.isWildlife === true) return;
      unit.alive = false;
      game.handleUnitDeath(unit, null);
    });
    (game.spawnPoints?.points ?? []).forEach((point) => { point.timer = 9999; });
    game.work.setDemands([]);
    await step(4);

    const inventory = game.baseInventory;
    const openPanel = async () => {
      if (!game.baseStorage.isOpen()) game.baseStorage.open();
      game.baseStorage.setTab('unit');
      game.baseStorage.lastSignature = '';
      game.baseStorage.refresh();
      await step(1);
    };
    const bagOf = (unit) => unit?.workerInventory ?? unit?.itemBag ?? null;

    // ---- 0) 找一个近战战斗单位（出生护卫是蛮兵 + 弓手，没有剑士）----
    const fighter = (game.friendlyUnits ?? []).find((unit) => unit?.alive && unit.type === 'raider') ?? null;
    out.fighterFound = Boolean(fighter);
    out.fighterType = fighter?.type ?? null;
    out.fighterNativeFamily = fighter?.definition?.weapon?.family ?? null;
    out.fighterNativeDamage = fighter?.physicalAttack ?? null;
    out.fighterNativeDurability = fighter?.weapon?.maxDurability ?? null;
    // 同族升级件与异族武器各准备一件
    const similarItem = 'spikedClub';
    const foreignItem = 'steelSword';

    // ---- 1) 战斗单位有背包：先把武器搬过去 ----
    game.selectUnit(fighter);
    await step(1);
    out.bagCreatedOnDemand = Boolean(game.itemBagFor(fighter));
    out.bagCapacity = bagOf(fighter)?.capacity ?? null;
    inventory.slots.fill(null);
    inventory.add(similarItem, 1);
    inventory.add(foreignItem, 1);
    inventory.add('wood', 10);
    await step(1);
    const similarSlot = inventory.slots.findIndex((slot) => slot?.itemId === similarItem);
    const foreignSlot = inventory.slots.findIndex((slot) => slot?.itemId === foreignItem);
    const movedSimilar = game.transferBaseSlotToUnit(similarSlot, fighter);
    const movedForeign = game.transferBaseSlotToUnit(foreignSlot, fighter);
    out.swordMovedToBag = movedSimilar.ok === true;
    out.bowMovedToBag = movedForeign.ok === true;
    out.bagCounts = bagOf(fighter)?.countsByItem?.() ?? null;

    // ---- 2) 面板上：同族显示「装备」可用，异族不可用并给出原因 ----
    await openPanel();
    const unitChips = [...document.querySelectorAll('[data-storage-unit-items] .base-storage-item')];
    out.unitChipCount = unitChips.length;
    const swordChip = unitChips.find((chip) => chip.textContent.includes('狼牙棒'));
    const bowChip = unitChips.find((chip) => chip.textContent.includes('精钢剑'));
    out.swordEquipButtonFound = Boolean(swordChip?.querySelector('[data-equip-weapon]'));
    out.swordEquipEnabled = swordChip?.querySelector('[data-equip-weapon]')?.disabled === false;
    out.bowEquipDisabled = bowChip?.querySelector('[data-equip-weapon]')?.disabled === true;
    out.bowBlockedReason = bowChip?.querySelector('.base-storage-blocked')?.textContent ?? null;

    // ---- 3) 点击装备：伤害与耐久真的变了，原配武器回到背包 ----
    const swordIndex = Number(swordChip?.querySelector('[data-equip-weapon]')?.dataset.equipWeapon);
    out.swordSlotIndex = Number.isFinite(swordIndex) ? swordIndex : null;
    const bagBefore = bagOf(fighter)?.countsByItem?.() ?? {};
    swordChip?.querySelector('[data-equip-weapon]')?.click();
    await step(2);
    out.damageAfterEquip = fighter?.physicalAttack ?? null;
    out.durabilityAfterEquip = fighter?.weapon?.maxDurability ?? null;
    out.weaponNameAfterEquip = fighter?.weapon?.name ?? null;
    out.equippedItemId = fighter?.weaponItemId ?? null;
    const bagAfter = bagOf(fighter)?.countsByItem?.() ?? {};
    out.bagBeforeEquip = bagBefore;
    out.bagAfterEquip = bagAfter;
    // 物品守恒：少了升级件，多了原配的旧武器
    out.swordLeftBag = (bagBefore[similarItem] ?? 0) - (bagAfter[similarItem] ?? 0);
    out.baselineSwordReturned = (bagAfter.wornClub ?? 0) - (bagBefore.wornClub ?? 0);
    out.feedback = document.querySelector('[data-storage-feedback]')?.textContent ?? null;

    // ---- 4) 跨族装备被拒，且什么都不变 ----
    const foreignIndexBefore = bagOf(fighter)?.slots?.findIndex((slot) => slot?.itemId === foreignItem) ?? -1;
    const direct = game.equipWeaponFromBag(fighter, foreignIndexBefore);
    out.crossFamilyRejected = direct.ok === false && direct.reason === 'family_mismatch';
    out.crossFamilyLabel = direct.label ?? null;
    out.damageUnchangedAfterReject = fighter?.physicalAttack === out.damageAfterEquip;
    out.bowStillInBag = (bagOf(fighter)?.countOf?.(foreignItem) ?? 0) === 1;

    // ---- 5) 真的打起来：装上升级武器之后打一次，敌人确实掉血 ----
    const foe = (game.enemyUnits ?? []).find((unit) => unit?.alive && unit.isWildlife === true) ?? null;
    out.foeFound = Boolean(foe);
    if (foe && fighter) {
      foe.position.set(fighter.position.x + 1.1, foe.position.y, fighter.position.z + 1.1);
      foe.health = foe.maxHealth;
      foe.moveGoal = null;
      foe.commandMoveGoal = null;
      fighter.position.set(foe.position.x + 1.0, fighter.position.y, foe.position.z + 1.0);
      const foeHealthBefore = foe.health;
      let guard = 0;
      while (foe.health >= foeHealthBefore && guard < 400) {
        await step(1);
        guard += 1;
      }
      out.foeTookDamage = foe.health < foeHealthBefore;
      out.foeDamageTaken = Math.round((foeHealthBefore - foe.health) * 100) / 100;
      out.ticksToFirstHit = guard;
    }

    out.elapsedAdvanced = game.elapsedTime > 0;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));

  mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
  await ev(`(() => {
    const g = window.__VILLAGE_WAR_DEBUG__.game;
    const unit = (g.friendlyUnits ?? []).find((u) => u?.alive && u.type === 'swordsman') ?? g.playerBase;
    const p = unit.position;
    g.cameraTarget.set(p.x, p.y, p.z);
    g.camera.position.set(p.x + 12, p.y + 13, p.z + 12);
    g.camera.lookAt(p.x, p.y + 1, p.z);
    g.renderScene();
    return true;
  })()`);
  await sleep(200);
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync('C:/WebProjects/WebVillageWar/outputs/verify-weapon-swap.png', Buffer.from(shot.data, 'base64'));
}

const r = report.result;
report.verdict = r && !r.error ? {
  booted: true,
  // 战斗单位有背包，能接收基地搬来的东西
  combatBagWorks: r.fighterFound === true
    && r.bagCreatedOnDemand === true
    && r.bagCapacity > 0
    && r.swordMovedToBag === true
    && r.bowMovedToBag === true,
  // 面板：同族可装备、异族禁用并给原因
  panelShowsEquipState: r.swordEquipButtonFound === true
    && r.swordEquipEnabled === true
    && r.bowEquipDisabled === true
    && String(r.bowBlockedReason ?? '').includes('同类武器'),
  // 装备真的改战斗数值（原始 6 伤害 / 32 耐久 → 11 / 46）
  equipChangesCombatStats: r.fighterNativeDamage === 6
    && r.fighterNativeDurability === 32
    && r.damageAfterEquip === 11
    && r.durabilityAfterEquip === 46
    && r.equippedItemId === 'spikedClub',
  // 物品守恒：装上一把、换回一把
  swapConservesItems: r.swordLeftBag === 1 && r.baselineSwordReturned === 1,
  // 跨族被拒且无副作用
  crossFamilyBlocked: r.crossFamilyRejected === true
    && r.damageUnchangedAfterReject === true
    && r.bowStillInBag === true,
  // 真的打中了
  actuallyFights: r.foeFound === true && r.foeTookDamage === true,
  elapsedAdvanced: r.elapsedAdvanced === true
} : null;
console.log(JSON.stringify(report, null, 2));
const ok = report.verdict !== null
  && Object.values(report.verdict).every(Boolean)
  && problems.length === 0;
console.log(ok ? '\nWEAPON SWAP: PASS' : '\nWEAPON SWAP: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
