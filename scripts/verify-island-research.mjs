// 科技 → 附魔台 → 附魔石 端到端验收（方案第 9 节）。
//
// 这条链的意义：方案第 8.1 条要求"后续解锁附魔台制作附魔石，不再依赖附魔卡生成"。
// 验的就是这句：
//   1. 没建科研站 → 研究被拒（面板也直接说清要先建科研站）；
//   2. 建好科研站 → 材料齐了才能研究「附魔工艺」，研究消耗严格按配方；
//   3. 研究前「附魔台」配方**不出现**在合成列表里，研究后才出现；
//   4. 合成并放置附魔台 → 附魔列表可用；
//   5. 制作附魔石 → 材料按配方扣除，石头直接进符文系统（不是物品库存）；
//   6. 这块石头能被搬运/装备到单位身上——复用已有的符文背包路径。
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
    timeout: 600000
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
    // 清场（放过巢穴：全清会判胜、关卡结束、系统停推）
    (game.enemyUnits ?? []).slice().forEach((unit) => {
      if (!unit?.alive || unit.isSpawnPointNest || unit.isRecruitable) return;
      unit.alive = false;
      game.handleUnitDeath(unit, null);
    });
    (game.spawnPoints?.points ?? []).forEach((point) => { point.timer = 9999; });
    await step(4);

    const inventory = game.baseInventory;
    // 面板在进入放置模式时会自动关掉（玩家接下来要点地图），
    // 所以每次放置之后想读 DOM 必须**先重新打开**——
    // refresh() 在面板关闭时直接 early-return，不清签名也读不到新状态。
    // （注意：这段注释在页内模板字符串里，不能出现反引号。）
    const openPanel = async () => {
      if (!game.baseStorage.isOpen()) game.baseStorage.open();
      game.baseStorage.lastSignature = '';
      game.baseStorage.refresh();
      await step(1);
    };
    const fillMaterials = () => {
      inventory.slots.fill(null);
      inventory.add('stone', 200);
      inventory.add('iron', 60);
      inventory.add('wood', 120);
      inventory.add('fiber', 60);
      inventory.add('charcoal', 20);
      inventory.add('deepCore', 3);
    };
    const craft = (recipeId) => {
      const recipe = game.recipeStatus().find((entry) => entry.id === recipeId);
      return recipe;
    };

    // ---- 1) 没有科研站：研究被拒，且面板说明要先建科研站 ----
    fillMaterials();
    game.toggleBaseStorage();
    game.baseStorage.lastSignature = '';
    game.baseStorage.refresh();
    await step(2);
    out.panelOpen = game.baseStorage.isOpen() === true;
    out.stationReadyAtStart = game.research.stationReady();
    const techCard = document.querySelector('[data-tech-id="enchanting"]');
    out.techCardListed = Boolean(techCard);
    const researchButton = techCard?.querySelector('[data-research-tech]');
    out.researchDisabledWithoutStation = researchButton?.disabled === true;
    out.researchBlockedLabel = techCard?.querySelector('.base-storage-blocked')?.textContent ?? null;
    out.enchantSectionHint = document.querySelector('[data-storage-enchants]')?.textContent ?? null;
    const beforeNoStation = inventory.countOf('stone');
    researchButton?.click();
    await step(1);
    out.researchSpentNothingWithoutStation = inventory.countOf('stone') === beforeNoStation;
    out.stillNotResearched = game.research.has('enchanting') === false;

    // ---- 2) 科技解锁前，附魔台配方不该出现在合成列表里 ----
    out.enchantTableHiddenBeforeTech = craft('enchantTable') === undefined;
    out.furnaceVisibleWithoutTech = craft('furnace') !== undefined;

    // ---- 3) 合成并放置科研站 ----
    const researchRecipe = craft('researchStation');
    out.researchRecipeListed = Boolean(researchRecipe);
    researchRecipe && document.querySelector('[data-craft-recipe="researchStation"]')?.click();
    out.researchStationInBag = inventory.countOf('researchStation');
    await step(1);
    const beginResearch = game.beginPlacement('researchStation');
    out.researchStationPlacementBegun = beginResearch.ok === true;
    const stationSpot = game.playerBase.position.clone();
    stationSpot.x -= 5.5;
    stationSpot.z += 1.5;
    const placedStation = game.confirmPlacement(stationSpot);
    out.researchStationPlaced = placedStation.ok === true;
    await step(200);   // 10 秒：走完建造
    out.stationReadyAfterBuild = game.research.stationReady() === true;

    // ---- 4) 研究「附魔工艺」：材料按配方扣除 ----
    await openPanel();
    const techCard2 = document.querySelector('[data-tech-id="enchanting"]');
    const researchButton2 = techCard2?.querySelector('[data-research-tech]');
    out.researchEnabledWithStation = researchButton2?.disabled === false;
    const costBefore = { stone: inventory.countOf('stone'), iron: inventory.countOf('iron'), deepCore: inventory.countOf('deepCore') };
    researchButton2?.click();
    await step(2);
    out.researched = game.research.has('enchanting') === true;
    out.stoneSpent = costBefore.stone - inventory.countOf('stone');
    out.ironSpent = costBefore.iron - inventory.countOf('iron');
    out.deepCoreSpent = costBefore.deepCore - inventory.countOf('deepCore');
    out.techCardShowsUnlocked = document.querySelector('[data-tech-id="enchanting"]')
      ?.textContent.includes('已解锁') === true;

    // ---- 5) 解锁后附魔台配方出现，合成 + 放置 ----
    await openPanel();
    out.enchantTableVisibleAfterTech = craft('enchantTable') !== undefined;
    document.querySelector('[data-craft-recipe="enchantTable"]')?.click();
    out.enchantTableInBag = inventory.countOf('enchantTable');
    await step(1);
    game.beginPlacement('enchantTable');
    const tableSpot = game.playerBase.position.clone();
    tableSpot.z -= 5.5;
    tableSpot.x += 1.5;
    const placedTable = game.confirmPlacement(tableSpot);
    out.enchantTablePlaced = placedTable.ok === true;
    await step(200);
    out.tableReadyAfterBuild = game.research.tableReady() === true;

    // ---- 6) 制作附魔石：材料扣除，石头进符文系统（不是物品库存） ----
    await openPanel();
    const enchantCard = document.querySelector('[data-enchant-id="fire"]');
    out.enchantCardListed = Boolean(enchantCard);
    const enchantButton = enchantCard?.querySelector('[data-enchant-rune]');
    out.enchantEnabled = enchantButton?.disabled === false;
    const stonesBefore = game.runeStones.stones.size;
    const ironBefore = inventory.countOf('iron');
    const charcoalBefore = inventory.countOf('charcoal');
    enchantButton?.click();
    await step(2);
    out.stoneCreated = game.runeStones.stones.size === stonesBefore + 1;
    out.ironSpentOnEnchant = ironBefore - inventory.countOf('iron');
    out.charcoalSpentOnEnchant = charcoalBefore - inventory.countOf('charcoal');
    const crafted = [...game.runeStones.stones.values()].at(-1) ?? null;
    out.craftedEnchantmentId = crafted?.enchantmentId ?? null;
    out.craftedLevel = crafted?.level ?? null;
    // 石头不该出现在物品库存里（那会导致同一块石头有两个身份）
    out.stoneNotInItemBag = inventory.countOf('runeStone') === 0;
    out.stoneInBaseRuneBackpack = game.runeStones
      .baseStones(game.runeStones.localSlot())
      .some((entry) => entry.id === crafted?.id) === true;
    out.feedback = document.querySelector('[data-storage-feedback]')?.textContent ?? null;

    // ---- 7) 这块石头能装到单位身上（复用已有符文路径） ----
    const unit = (game.friendlyUnits ?? []).find((u) => u?.alive && u.team === 'player' && !u.isBuilding) ?? null;
    out.unitFound = Boolean(unit);
    if (unit && crafted) {
      const moved = game.runeStones.moveStone(crafted.id, { kind: 'unit', unit });
      out.stoneEquipped = moved.ok === true;
      out.unitHasEnchant = unit.enchantments.has('fire') === true;
    }

    // ---- 8) 附魔台没燃料需求，但缺材料时按钮应当变灰 ----
    inventory.remove('iron', inventory.countOf('iron'));
    await openPanel();
    const enchantCard3 = document.querySelector('[data-enchant-id="fire"]');
    out.enchantDisabledWhenShort = enchantCard3?.querySelector('[data-enchant-rune]')?.disabled === true;

    out.elapsedAdvanced = game.elapsedTime > 0;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));

  mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
  // 面板现在有 5 段（库存/单位背包/合成/科技/附魔台），科技与附魔台在最下面。
  // 截图前滚到底，否则拍到的只有库存和合成，看不到这次验收的重点。
  await ev(`(() => {
    const body = document.querySelector('#base-storage .base-storage-body');
    if (body) body.scrollTop = body.scrollHeight;
    return true;
  })()`);
  await sleep(150);
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync('C:/WebProjects/WebVillageWar/outputs/verify-island-research.png', Buffer.from(shot.data, 'base64'));
}

const r = report.result;
report.verdict = r && !r.error ? {
  booted: true,
  panelOpens: r.panelOpen === true && r.techCardListed === true,
  // 1) 没科研站：拒绝研究、不扣材料，面板说清原因
  researchNeedsStation: r.stationReadyAtStart === false
    && r.researchDisabledWithoutStation === true
    && r.researchBlockedLabel === '需要先建好科研站'
    && r.researchSpentNothingWithoutStation === true
    && r.stillNotResearched === true,
  enchantLockedBeforeTech: r.enchantTableHiddenBeforeTech === true
    && r.furnaceVisibleWithoutTech === true,
  enchantSectionGuides: String(r.enchantSectionHint ?? '').includes('科研站'),
  // 2) 建站 → 研究 → 配方解锁
  stationGatesResearch: r.researchRecipeListed === true
    && r.researchStationPlacementBegun === true
    && r.researchStationPlaced === true
    && r.stationReadyAfterBuild === true
    && r.researchEnabledWithStation === true,
  researchSpendsExactly: r.researched === true
    && r.stoneSpent === 40 && r.ironSpent === 12 && r.deepCoreSpent === 1
    && r.techCardShowsUnlocked === true,
  techUnlocksRecipe: r.enchantTableVisibleAfterTech === true
    && r.enchantTableInBag === 1
    && r.enchantTablePlaced === true
    && r.tableReadyAfterBuild === true,
  // 3) 附魔石：材料扣除、进符文系统、不进物品库存
  enchantListingWorks: r.enchantCardListed === true && r.enchantEnabled === true,
  enchantSpendsExactly: r.stoneCreated === true
    && r.ironSpentOnEnchant === 6 && r.charcoalSpentOnEnchant === 4,
  stoneGoesToRuneSystem: r.craftedEnchantmentId === 'fire'
    && r.craftedLevel === 1
    && r.stoneNotInItemBag === true
    && r.stoneInBaseRuneBackpack === true,
  stoneEquippable: r.unitFound === true && r.stoneEquipped === true && r.unitHasEnchant === true,
  enchantBlockedWhenShort: r.enchantDisabledWhenShort === true,
  elapsedAdvanced: r.elapsedAdvanced === true
} : null;
console.log(JSON.stringify(report, null, 2));
const ok = Object.values(report.verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nISLAND RESEARCH: PASS' : '\nISLAND RESEARCH: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
