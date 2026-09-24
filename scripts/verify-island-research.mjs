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
    timeout: 600000
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

    // ---- 1) 科技与附魔台已经不在背包面板里（需求 7 前半条） ----
    fillMaterials();
    game.toggleBaseStorage();
    game.baseStorage.lastSignature = '';
    game.baseStorage.refresh();
    await step(2);
    out.panelOpen = game.baseStorage.isOpen() === true;
    out.stationReadyAtStart = game.research.stationReady();
    // 背包右侧只剩「合成 / 资源」：科技与附魔台的窗格必须整个消失
    out.panelTabIds = [...document.querySelectorAll('#backpack [data-backpack-tab]')]
      .map((tab) => tab.dataset.backpackTab);
    out.techPaneGoneFromPanel = document.querySelector('#backpack [data-backpack-techs]') === null;
    out.enchantPaneGoneFromPanel = document.querySelector('#backpack [data-backpack-enchants]') === null;
    // 没有科研站时接口本身也必须拒绝，并且给出"先建科研站"的原因
    const denied = game.research.research('enchanting');
    out.researchDeniedWithoutStation = denied.ok === false;
    out.researchDeniedLabel = denied.label ?? null;
    out.stillNotResearched = game.research.has('enchanting') === false;
    game.baseStorage.close();

    // ---- 2) 科技解锁前，附魔台配方不该出现在合成列表里 ----
    out.enchantTableHiddenBeforeTech = craft('enchantTable') === undefined;
    out.furnaceVisibleWithoutTech = craft('furnace') !== undefined;

    // ---- 3) 合成并放置科研站 ----
    const researchRecipe = craft('researchStation');
    out.researchRecipeListed = Boolean(researchRecipe);
    researchRecipe && document.querySelector('[data-backpack-recipe="researchStation"]')?.click();
    // 产物跟鼠标走（需求第 3 条）：点一个空格把它放下。
    const stationEmptySlot = inventory.slots.findIndex((slot) => !slot);
    if (stationEmptySlot >= 0) game.baseStorage.handleSlotClick(stationEmptySlot);
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

    // ---- 4) 从科研站的扇形菜单打开科技界面，研究「附魔工艺」 ----
    //
    // 需求：「这两个应该是科研站和附魔台的扇形菜单弹出的界面」。
    // 所以这里刻意走**扇形菜单那条路**（点建筑 → 点「科研站」按钮），
    // 而不是直接调 facilityPanel.openForUnit——直接调的话，
    // "菜单里到底有没有这个入口"就没被验到。
    const station = placedStation.unit ?? null;
    out.stationUnitFound = Boolean(station);
    game.selectUnit(station);
    game.unitActionMenu?.sync?.();
    const facilityButton = document.querySelector('#unit-action-menu [data-unit-action="facility"]');
    out.menuHasFacilityEntry = Boolean(facilityButton);
    out.menuFacilityLabel = facilityButton?.textContent ?? null;
    facilityButton?.click();
    await step(1);
    out.facilityPanelOpen = game.facilityPanel?.isOpen?.() === true;
    out.facilityPanelTarget = document.querySelector('#facility-panel')?.dataset.facility ?? null;
    const techCard2 = document.querySelector('[data-tech-id="enchanting"]');
    out.techCardListed = Boolean(techCard2);
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
    game.facilityPanel?.close?.();
    await step(1);
    out.facilityPanelClosed = game.facilityPanel?.isOpen?.() === false;

    // ---- 5) 解锁后附魔台配方出现，合成 + 放置 ----
    await openPanel();
    out.enchantTableVisibleAfterTech = craft('enchantTable') !== undefined;
    document.querySelector('[data-backpack-recipe="enchantTable"]')?.click();
    // 产物跟鼠标走（需求第 3 条）：点一个空格把它放下。
    const tableEmptySlot = inventory.slots.findIndex((slot) => !slot);
    if (tableEmptySlot >= 0) game.baseStorage.handleSlotClick(tableEmptySlot);
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

    // ---- 6) 从附魔台的扇形菜单打开界面，制作附魔石 ----
    // （本轮起符文石就是背包里的普通物品，不再有"符文系统 vs 物品库存"两套身份。）
    const table = placedTable.unit ?? null;
    game.selectUnit(table);
    game.unitActionMenu?.sync?.();
    const tableFacilityButton = document.querySelector('#unit-action-menu [data-unit-action="facility"]');
    out.tableMenuFacilityLabel = tableFacilityButton?.textContent ?? null;
    tableFacilityButton?.click();
    await step(1);
    out.enchantPanelTarget = document.querySelector('#facility-panel')?.dataset.facility ?? null;
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
    // 石头必须有且只有一个身份：基地背包里正好一块，且它的 instanceId 就是这块石头。
    // 这两条一起守住了"同一块石头不能有两个身份"（重复生成会立刻露馅）。
    out.stoneInItemBag = inventory.countOf('runeStone') === 1;
    out.stoneInstanceMatches = inventory.slots.some(
      (slot) => slot?.itemId === 'runeStone' && String(slot.instanceId) === String(crafted?.id)
    );
    out.stoneInBaseRuneBackpack = game.runeStones
      .baseStones(game.runeStones.localSlot())
      .some((entry) => entry.id === crafted?.id) === true;
    out.feedback = document.querySelector('[data-facility-feedback]')?.textContent ?? null;

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
    game.facilityPanel.lastSignature = '';
    game.facilityPanel.refresh();
    await step(1);
    const enchantCard3 = document.querySelector('[data-enchant-id="fire"]');
    out.enchantDisabledWhenShort = enchantCard3?.querySelector('[data-enchant-rune]')?.disabled === true;
    game.facilityPanel?.close?.();

    out.elapsedAdvanced = game.elapsedTime > 0;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));

  mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
  // 面板现在有 5 段（库存/单位背包/合成/科技/附魔台），科技与附魔台在最下面。
  // 截图前滚到底，否则拍到的只有库存和合成，看不到这次验收的重点。
  await ev(`(() => {
    const body = document.querySelector('#backpack .backpack-panel');
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
  panelOpens: r.panelOpen === true,
  // 0) 科技与附魔台已经搬出背包面板（需求 7 前半条）
  techAndEnchantLeftThePanel: JSON.stringify(r.panelTabIds ?? []) === JSON.stringify(['craft', 'resource'])
    && r.techPaneGoneFromPanel === true
    && r.enchantPaneGoneFromPanel === true,
  researchNeedsStation: r.stationReadyAtStart === false
    && r.researchDeniedWithoutStation === true
    && String(r.researchDeniedLabel ?? '').includes('科研站')
    && r.stillNotResearched === true,
  enchantLockedBeforeTech: r.enchantTableHiddenBeforeTech === true
    && r.furnaceVisibleWithoutTech === true,
  // 1) 入口在科研站的扇形菜单里，点开才出现科技界面
  facilityEntryInFanMenu: r.stationUnitFound === true
    && r.menuHasFacilityEntry === true
    && String(r.menuFacilityLabel ?? '').includes('科研站')
    && r.facilityPanelOpen === true
    && r.facilityPanelTarget === 'researchStation'
    && r.facilityPanelClosed === true,
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
  // 3) 附魔台界面同样从扇形菜单打开
  enchantFacilityEntry: String(r.tableMenuFacilityLabel ?? '').includes('附魔台')
    && r.enchantPanelTarget === 'enchantTable',
  // 4) 附魔石：材料扣除、作为一件物品进基地背包（instanceId 唯一）
  enchantListingWorks: r.enchantCardListed === true && r.enchantEnabled === true,
  enchantSpendsExactly: r.stoneCreated === true
    && r.ironSpentOnEnchant === 6 && r.charcoalSpentOnEnchant === 4,
  stoneIsSingleItem: r.craftedEnchantmentId === 'fire'
    && r.craftedLevel === 1
    && r.stoneInItemBag === true
    && r.stoneInstanceMatches === true
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
