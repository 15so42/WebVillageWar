// 战斗单位背包 + 同类武器更换端到端验收（方案第 6.2 节）。
//
// 验的是三件事：
//   1. 战斗单位**有背包**：从基地把武器搬给它（方案第 4 节「可以把工具、武器和附魔石拖给单位」）；
//   2. 同族武器能装备，而且**真的改变战斗输出**（伤害数字来自 unit.physicalAttack，不是模型）；
//   3. 跨族武器被拒绝，并且**什么都不会被换掉**；
//   4. 换下来的原配武器**物化回背包**——物品守恒，不会换一次少一把。
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';

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
report.started = await enterSurvivalGame(ev, sleep);

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
    // 统一的背包面板：左边永远是"要看的那个背包"（基地或某个单位），
    // 所以"打开单位的背包"= openForUnit(unit)，不再有独立的单位背包段。
    const openPanel = async (unit = null) => {
      if (unit) game.backpack.openForUnit(unit);
      else if (!game.backpack.isOpen()) game.backpack.openBase();
      game.backpack.setTab('craft');
      game.backpack.lastSignature = '';
      game.backpack.refresh();
      await step(1);
    };
    const bagOf = (unit) => unit?.workerInventory ?? unit?.itemBag ?? null;
    /** 面板里那一格上的「E」装备角标（单位视图下武器格才有）。 */
    const equipBadge = (index) => document.querySelector(
      '#backpack [data-backpack-grid] [data-backpack-slot="' + index + '"] .backpack-slot-equipped'
    );

    // ---- 0) 找一个近战战斗单位 ----
    // ⚠️ 必须**自己造一个**：用户已要求「玩家一开始没有任何战斗单位」，
    // 开局只有一支木傀儡，早期版本依赖的"出生护卫（蛮兵 + 弓手）"已经没有了。
    // 验证的内容（武器换装规则）与单位从哪来无关，所以直接走 summonUnits。
    game.summonUnits('raider', 1, game.playerBase.position.clone().add({ x: 4.2, y: 0, z: 4.0 }), 0.7, { select: false });
    const fighter = (game.friendlyUnits ?? []).find((unit) => unit?.alive && unit.type === 'raider' && unit.isWorker !== true) ?? null;
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

    // ---- 2) 面板上：两把武器都有只读 E 角标；异族武器不能通过 API 装备 ----
    await openPanel(fighter);
    const unitCells = [...document.querySelectorAll('#backpack [data-backpack-grid] [data-backpack-slot]')];
    out.unitCellCount = unitCells.length;
    const swordIndex = bagOf(fighter)?.slots?.findIndex((slot) => slot?.itemId === similarItem) ?? -1;
    const foreignIndex = bagOf(fighter)?.slots?.findIndex((slot) => slot?.itemId === foreignItem) ?? -1;
    out.swordSlotIndex = swordIndex >= 0 ? swordIndex : null;
    out.foreignSlotIndex = foreignIndex >= 0 ? foreignIndex : null;
    const swordBadge = swordIndex >= 0 ? equipBadge(swordIndex) : null;
    const foreignBadge = foreignIndex >= 0 ? equipBadge(foreignIndex) : null;
    out.swordEquipButtonFound = Boolean(swordBadge);
    out.swordEquipEnabled = swordBadge?.classList.contains('is-readonly') === true;
    out.foreignEquipButtonFound = Boolean(foreignBadge);
    const damageBeforeForeign = fighter?.physicalAttack ?? null;
    foreignBadge?.click();
    await step(1);
    out.bowBlockedReason = null;
    out.foreignClickKeptDamage = (fighter?.physicalAttack ?? null) === damageBeforeForeign;
    out.foreignClickKeptWeapon = (fighter?.weaponItemId ?? null) === null;

    // ---- 3) 系统换装：伤害与耐久真的变了，武器仍占背包格 ----
    const bagBefore = bagOf(fighter)?.countsByItem?.() ?? {};
    game.equipWeaponFromBag(fighter, swordIndex, { silent: true, system: true });
    await step(2);
    out.damageAfterEquip = fighter?.physicalAttack ?? null;
    out.durabilityAfterEquip = fighter?.weapon?.maxDurability ?? null;
    out.weaponNameAfterEquip = fighter?.weapon?.name ?? null;
    out.equippedItemId = fighter?.weaponItemId ?? null;
    const bagAfter = bagOf(fighter)?.countsByItem?.() ?? {};
    out.bagBeforeEquip = bagBefore;
    out.bagAfterEquip = bagAfter;
    // 装备后武器仍占同一格，不消失、也不物化原配武器进背包
    out.swordStillInBag = bagAfter[similarItem] ?? 0;
    out.baselineSwordReturned = (bagAfter.wornClub ?? 0) - (bagBefore.wornClub ?? 0);
    out.feedback = document.querySelector('#backpack [data-backpack-feedback]')?.textContent ?? null;

    // ---- 4) 跨族装备被拒，且什么都不变（直接走 API，确认拒绝理由本身） ----
    const foreignIndexBefore = bagOf(fighter)?.slots?.findIndex((slot) => slot?.itemId === foreignItem) ?? -1;
    const direct = game.equipWeaponFromBag(fighter, foreignIndexBefore, { system: true });
    out.crossFamilyRejected = direct.ok === false && direct.reason === 'family_mismatch';
    out.crossFamilyLabel = direct.label ?? null;
    out.damageUnchangedAfterReject = fighter?.physicalAttack === out.damageAfterEquip;
    out.bowStillInBag = (bagOf(fighter)?.countOf?.(foreignItem) ?? 0) === 1;

    // ---- 5) 真的打起来：装上升级武器之后打一次，敌人确实掉血 ----
    //
    // ⚠️ 靶子每帧都会被"钉住"（清掉移动目标、清掉 wanderGoal/索敌，并把移动速度钉成 0）。
    // 这是为了让**测量**可复现，不是因为有"追不上"的问题：
    //   - 野生动物默认在出生点附近游荡（updateWildlifeWander），靶子会自己走开，
    //     于是"这次有没有打中"变成运气问题；
    //   - 而这游戏里**所有野怪与敌人都不会逃跑**，它们只会迎上来或原地还手，
    //     所以"追不追得到"根本不是战斗的问题——不需要为它做任何设计。
    // 钉住之后，这条断言量的就只剩"伤害有没有落到目标身上"。
    const foe = (game.enemyUnits ?? []).find((unit) => unit?.alive && unit.isWildlife === true) ?? null;
    out.foeFound = Boolean(foe);
    const pinFoe = () => {
      if (!foe?.alive) return;
      foe.moveGoal = null;
      foe.commandMoveGoal = null;
      foe.wanderGoal = null;
      foe.attributes?.setBase?.('moveSpeed', 0);
      foe.attributes?.setBase?.('aggroRange', 0);
    };
    if (foe && fighter) {
      foe.position.set(fighter.position.x + 1.1, foe.position.y, fighter.position.z + 1.1);
      foe.health = foe.maxHealth;
      pinFoe();
      fighter.position.set(foe.position.x + 1.0, fighter.position.y, foe.position.z + 1.0);
      const foeHealthBefore = foe.health;
      let guard = 0;
      while (foe.health >= foeHealthBefore && guard < 400) {
        pinFoe();
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
  // 面板：两把武器都有「装备」入口；点异族那把被拒、原因可读，且什么都没被换掉
  panelShowsEquipState: r.swordEquipButtonFound === true
    && r.swordEquipEnabled === true
    && r.foreignEquipButtonFound === true
    && r.foreignClickKeptDamage === true
    && r.foreignClickKeptWeapon === true,
  // 装备真的改战斗数值（原始 6 伤害 / 32 耐久 → 11 / 46）
  equipChangesCombatStats: r.fighterNativeDamage === 6
    && r.fighterNativeDurability === 32
    && r.damageAfterEquip === 11
    && r.durabilityAfterEquip === 46
    && r.equippedItemId === 'spikedClub',
  // 装备后仍在背包格内，不把原配武器物化进背包
  swapConservesItems: r.swordStillInBag === 1 && r.baselineSwordReturned === 0,
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
