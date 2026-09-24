// 可招募单位的**来源与血条颜色**验收（本轮需求第 6 条）。
//
// 需求原文两句：
//   1.「可招募敌人改成击破刷怪点时生成在刷怪点，不默认到处都有」；
//   2.「可招募单位的血条应该是白色」。
//
// 这个脚本就守这两句，外加一条防止旧设计回来的结构断言：
//   - 开局地图上**一只可招募单位都没有**；
//   - 旧的"世界生成时撒野外"入口（`spawnFieldRecruits`）已经不存在；
//   - 打掉哪个点，就在**那个点位上**冒出它配置的可招募单位（数量与兵种都对得上，
//     而且离被清的点很近、离别的点很远）；
//   - 它们的血条是白的（读的是真实计算样式，不是类名），普通敌人仍然是红的；
//   - 招募之后白条恢复成友军颜色（标记被清掉，类名也跟着摘掉）。
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

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
    timeout: 300000
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
    const tick = (n) => { for (let i = 0; i < n; i += 1) game.tick(); };
    tick(8);
    game.pendingStrategyRewards = [];
    game.awaitingOpeningReward = false;
    if (game.strategyEvent) game.strategyEvent = null;
    if (game.strategyEventUi?.root) game.strategyEventUi.root.hidden = true;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
    tick(4);

    const neutrals = () => (game.enemyUnits ?? []).filter((u) => u?.alive && u.isRecruitable);
    const hostiles = () => (game.enemyUnits ?? []).filter((u) => (
      u?.alive && !u.isRecruitable && !u.isSpawnPointNest && !u.isWildlife
    ));
    // 读真实计算样式，而不是只看类名：类名写对了但样式被别的规则盖掉，
    // 玩家看到的仍然是红的（.is-enemy 与 .is-recruitable 同优先级，靠源码顺序）。
    const hpColorOf = (unit) => {
      const element = unit?.statusElement;
      if (!element) return null;
      const raw = getComputedStyle(element).getPropertyValue('--hp-color').trim().toLowerCase();
      return raw || null;
    };
    const isWhite = (value) => value === '#fff' || value === '#ffffff' || value === 'rgb(255, 255, 255)' || value === 'white';

    // ---- 1) 开局地图上一只可招募单位都没有 ----
    out.neutralsAtStart = neutrals().length;
    out.recruitableHostilesAtStart = hostiles().filter((u) => u.isRecruitable).length;
    // 旧入口必须真的没了——否则"不默认到处都有"只是当前没生成而已
    out.legacySpawnerGone = typeof game.spawnFieldRecruits === 'undefined';

    const points = game.spawnPoints?.points ?? [];
    out.pointCount = points.length;
    out.pointsWithReward = points.filter((p) => (p.recruitReward?.types?.length ?? 0) > 0).length;
    out.rewardSummary = points.map((p) => ({
      id: p.id,
      types: p.recruitReward?.types ?? null,
      count: p.recruitReward?.count ?? null
    }));

    // ---- 2) 打掉一个点 → 在**那个点位**上生成它配置的可招募单位 ----
    const distanceTo = (point, unit) => Math.hypot(
      (unit.position?.x ?? 0) - point.x,
      (unit.position?.z ?? 0) - point.z
    );
    const clearAndObserve = (point) => {
      const before = new Set(neutrals().map((u) => u.id));
      game.spawnPoints.destroyPoint(point.id);
      tick(6);
      const fresh = neutrals().filter((u) => !before.has(u.id));
      const others = points.filter((entry) => entry.id !== point.id);
      return {
        pointId: point.id,
        expectedTypes: point.recruitReward?.types ?? [],
        expectedCount: point.recruitReward?.count ?? 0,
        spawned: fresh.length,
        types: fresh.map((u) => u.type),
        // 离被清点位的最大距离：落点绕着点排一圈（半径 3.6），所以应当在几米内
        maxDistanceToPoint: fresh.length ? Math.max(...fresh.map((u) => distanceTo(point, u))) : null,
        // 离其它点位的最近距离：用来证明"生成在这个点上"而不是"随便找地方"
        minDistanceToOtherPoints: otherDistance(fresh, others),
        walkable: fresh.every((u) => game.isPointWalkable({ x: u.position.x, z: u.position.z })),
        hpColors: fresh.map((u) => hpColorOf(u)),
        classFlags: fresh.map((u) => u.statusElement?.classList?.contains('is-recruitable') === true),
        sampleUnitId: fresh[0]?.id ?? null
      };
    };
    function otherDistance(fresh, others) {
      if (!fresh.length || !others.length) return null;
      let min = Infinity;
      fresh.forEach((unit) => {
        others.forEach((point) => { min = Math.min(min, distanceTo(point, unit)); });
      });
      return min;
    }

    const firstPoint = points.find((p) => p.recruitReward) ?? null;
    const secondPoint = points.filter((p) => p.recruitReward && p.id !== firstPoint?.id)[0] ?? null;
    out.firstClear = firstPoint ? clearAndObserve(firstPoint) : null;
    out.secondClear = secondPoint ? clearAndObserve(secondPoint) : null;

    // ---- 3) 普通敌人的血条仍然是红的（对照组） ----
    // 开局可能还没有普通敌人（刷怪点间隔十几秒），那就**主动放一个**：
    // 没有对照组的话，"所有血条都是白的"也能让白条断言通过。
    if (!hostiles().length) {
      const anchor = game.playerBase?.position ?? { x: 0, z: 0 };
      game.spawnEnemyAt?.('goblinSoldier', { x: anchor.x + 10, z: anchor.z }, {});
      tick(4);
    }
    const hostileSample = hostiles()[0] ?? null;
    out.hostileFound = Boolean(hostileSample);
    out.hostileHpColor = hostileSample ? hpColorOf(hostileSample) : null;
    out.hostileClassFlag = hostileSample
      ? hostileSample.statusElement?.classList?.contains('is-recruitable') === true
      : null;

    // ---- 4) 招募之后白条恢复成友军颜色 ----
    const target = neutrals()[0] ?? null;
    out.recruitTargetFound = Boolean(target);
    if (target) {
      out.targetHpColorBefore = hpColorOf(target);
      game.baseInventory.slots.fill(null);
      game.baseInventory.add('recruitmentOrder', 1);
      game.selectUnit(target);
      tick(2);
      const button = document.querySelector('#selected-recruit');
      out.recruitButtonEnabled = button?.disabled === false;
      button?.click();
      tick(4);
      out.recruitedTeam = target.team;
      out.recruitableFlagCleared = target.isRecruitable === false;
      out.targetHpColorAfter = hpColorOf(target);
      out.classFlagClearedAfterRecruit = target.statusElement?.classList?.contains('is-recruitable') === false;
      out.panelHiddenAfterRecruit = document.querySelector('#selected-recruit')?.hidden === true;
    }

    // ---- 5) 单位扇形菜单（需求第 1 条）：点单位 → 它脚下展开圆形按钮 ----
    // 这一条此前只有源码级断言（test:backpack-ui 读的是代码结构），
    // 这里补上真正的行为验证：菜单真的出现、动作项对、点了「背包」真的打开那个单位的背包。
    const menuRoot = () => document.querySelector('#unit-action-menu');
    const menuButtons = () => [...(menuRoot()?.querySelectorAll('[data-unit-action]') ?? [])];
    const menuOpen = () => {
      const root = menuRoot();
      return Boolean(root) && root.hidden === false && root.classList.contains('is-open') === true;
    };
    const menuShape = () => menuButtons().map((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return {
        action: button.dataset.unitAction,
        label: button.querySelector('.unit-action-label')?.textContent ?? null,
        hasIcon: Boolean(button.querySelector('.unit-action-icon')),
        // 圆形：宽高相等 + 圆角不是 0
        square: Math.abs(rect.width - rect.height) <= 1,
        radius: style.borderTopLeftRadius,
        disabled: button.disabled === true
      };
    });

    const worker = (game.friendlyUnits ?? []).find((u) => u?.alive && u.isWorker) ?? null;
    out.workerFoundForMenu = Boolean(worker);
    if (worker) {
      game.selectUnit(worker);
      tick(3);
      out.workerMenuOpen = menuOpen();
      out.workerMenu = menuShape();
      // 点「背包」应当打开**这个单位**的背包
      menuButtons().find((b) => b.dataset.unitAction === 'backpack')?.click();
      tick(2);
      out.backpackOpenedFromMenu = game.backpack?.isOpen() === true
        && game.backpack?.mode === 'unit'
        && game.backpack?.unit === worker;
      game.backpack?.close?.();
      tick(1);
    }

    // 可招募单位：菜单里应当有「招募」，缺招募令时它是禁用的
    const menuTarget = neutrals().find((u) => u.isRecruitable) ?? null;
    out.menuTargetFound = Boolean(menuTarget);
    if (menuTarget) {
      // 把镜头/单位挪到基地旁边：扇形菜单按世界坐标投影，单位在屏幕外时菜单会隐藏，
      // 那样测出来的会是"没显示"而不是"动作项不对"。
      const anchor = game.playerBase?.position ?? { x: 0, z: 0 };
      menuTarget.position.set(anchor.x + 3, menuTarget.position.y, anchor.z + 3);
      game.baseInventory.slots.fill(null);
      game.selectUnit(menuTarget);
      tick(3);
      out.recruitMenuOpen = menuOpen();
      out.recruitMenu = menuShape();
      const recruitButton = menuButtons().find((b) => b.dataset.unitAction === 'recruit');
      out.recruitMenuLabel = recruitButton?.querySelector('.unit-action-label')?.textContent ?? null;
      out.recruitMenuDisabledWithoutOrder = recruitButton?.disabled === true;
      // 菜单多选时不出现。用 direct 而不是 box：box 只收"可控"单位，
      // 会把不可控的中立单位过滤掉，结果只剩一个单位、菜单照样开着。
      game.selectUnits([worker, menuTarget].filter(Boolean), { mode: 'direct' });
      tick(3);
      out.multiSelectCount = (game.selectedUnits ?? []).length;
      out.menuHiddenForMultiSelect = menuOpen() === false;
    }

    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));
}

mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
if (report.started) {
  // 截图留档：把一支可招募单位放在镜头中间，能看清白色血条。
  await ev(`(async () => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    game.paused = false;
    const point = (game.spawnPoints?.points ?? []).find((p) => p.recruitReward && !p.cleared);
    if (!point) return false;
    game.spawnPoints.destroyPoint(point.id);
    for (let i = 0; i < 8; i += 1) {
      game.tick();
      if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 16));
    }
    const unit = (game.enemyUnits ?? []).find((u) => u?.alive && u.isRecruitable);
    if (!unit) return false;
    game.cameraTarget.set(unit.position.x, 4, unit.position.z);
    game.cameraDistance = 22;
    for (let i = 0; i < 20; i += 1) {
      game.tick();
      if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 16));
    }
    return true;
  })()`);
  await sleep(300);
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync('C:/WebProjects/WebVillageWar/outputs/verify-recruit-source.png', Buffer.from(shot.data, 'base64'));
}

const r = report.result;
const matchesReward = (run) => Boolean(run)
  && run.spawned === run.expectedCount
  && run.types.length === run.expectedCount
  && run.types.every((type, index) => type === run.expectedTypes[index % run.expectedTypes.length]);

report.verdict = r && !r.error ? {
  booted: true,
  // 1) 不默认到处都有
  noRecruitsAtStart: r.neutralsAtStart === 0,
  legacyWorldSpawnerRemoved: r.legacySpawnerGone === true,
  // 2) 每个点位都配了可招募奖励
  everyPointHasReward: r.pointCount > 0 && r.pointsWithReward === r.pointCount,
  // 3) 击破点在**该点位上**生成，数量与兵种都对
  firstPointSpawnsItsReward: matchesReward(r.firstClear),
  secondPointSpawnsItsReward: matchesReward(r.secondClear),
  spawnedAtTheClearedPoint: Boolean(r.firstClear)
    && r.firstClear.spawned > 0
    && r.firstClear.maxDistanceToPoint !== null
    && r.firstClear.maxDistanceToPoint <= 8,
  notAtAnotherPoint: Boolean(r.firstClear)
    && r.firstClear.minDistanceToOtherPoints !== null
    && r.firstClear.minDistanceToOtherPoints > r.firstClear.maxDistanceToPoint,
  spawnedOnWalkableGround: Boolean(r.firstClear) && r.firstClear.walkable === true,
  // 4) 血条白色（读真实计算样式）
  recruitBarsAreWhite: Boolean(r.firstClear)
    && r.firstClear.hpColors.length > 0
    && r.firstClear.hpColors.every((color) => color === '#ffffff' || color === '#fff' || color === 'rgb(255, 255, 255)'),
  recruitBarsCarryClass: Boolean(r.firstClear)
    && r.firstClear.classFlags.length > 0
    && r.firstClear.classFlags.every(Boolean),
  // 5) 对照组：普通敌人仍然是红的，而且没有白色标记
  hostileBarsStayRed: r.hostileFound !== true
    || (r.hostileHpColor !== '#ffffff' && r.hostileClassFlag === false),
  // 6) 招募之后恢复成友军颜色
  recruitClearsWhiteBar: r.recruitTargetFound === true
    && r.recruitButtonEnabled === true
    && r.recruitableFlagCleared === true
    && r.classFlagClearedAfterRecruit === true
    && r.targetHpColorAfter !== '#ffffff'
    && r.targetHpColorAfter !== r.targetHpColorBefore
    // 招募过来就是自家兵，血条不能再是敌方的红色。
    // （状态条元素的阵营类名是按创建时的队伍定的，换队之后必须同步，
    // 否则"自己的部队显示红血条"。）
    && r.targetHpColorAfter !== '#e05d56',
  // 7) 单位扇形菜单（需求第 1 条）：圆形图标 + 下方文字，动作项与点击行为都对
  workerMenuShowsBackpackAndStop: r.workerFoundForMenu === true
    && r.workerMenuOpen === true
    && Array.isArray(r.workerMenu)
    && r.workerMenu.some((entry) => entry.action === 'backpack')
    && r.workerMenu.some((entry) => entry.action === 'stop')
    && r.workerMenu.every((entry) => entry.hasIcon && Boolean(entry.label) && entry.square && entry.radius !== '0px'),
  menuBackpackOpensThatUnit: r.backpackOpenedFromMenu === true,
  recruitMenuOffersRecruit: r.menuTargetFound === true
    && r.recruitMenuOpen === true
    && (r.recruitMenu ?? []).some((entry) => entry.action === 'recruit')
    && r.recruitMenuDisabledWithoutOrder === true,
  menuHiddenForMultiSelect: r.multiSelectCount >= 2 && r.menuHiddenForMultiSelect === true,
  noErrors: problems.length === 0
} : null;

console.log(JSON.stringify(report, null, 2));
const ok = Object.values(report.verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nRECRUIT SOURCE: PASS' : '\nRECRUIT SOURCE: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
