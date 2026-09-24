// 野外招募端到端验收（用户定稿的交互：选中野外中立单位 → 详情面板出现招募按钮 →
// 消耗一张招募令 → 单位归队）。
//
// 除了"能不能招募"，这里必须验三条容易漏的中立契约：
//   1) 中立单位不主动攻击，也不会被己方单位自动索敌；
//   2) 没有招募令时按钮禁用、点了不扣任何东西、单位也不归队；
//   3) 招募之后它必须真的变成可控制的己方单位，而且反过来开始正常索敌。
//
// 每次读面板之前都重新 `selectUnit` 一次：选中状态会被每帧的 updateSelection
// 重新校验，依赖"上一段代码留下的选中"来读 DOM 会让失败原因变得含糊。
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';

const CDP_PORT = Number(process.env.ISLAND_CDP_PORT || 9235);
const BASE = process.env.ISLAND_URL || 'http://127.0.0.1:3000/';
const LEVEL_ID = process.env.ISLAND_LEVEL_ID || 'island-survival';
const OUT = 'C:/WebProjects/WebVillageWar/outputs/verify-field-recruit.png';

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
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    const detail = res.exceptionDetails.exception?.description ?? res.exceptionDetails.text ?? 'unknown';
    throw new Error('page eval failed: ' + detail);
  }
  return res.result.value;
};

await send('Page.navigate', { url: BASE });
const report = { page: BASE, levelId: LEVEL_ID, started: false, result: null, problems };
report.started = await enterSurvivalGame(ev, sleep);

if (report.started) {
  await sleep(500);
  // 分两段跑：第一段停在"按钮已经亮起来"的状态，好在这一刻截图；
  // 第二段才真的点招募。否则截图拍到的永远是招募之后的界面。
  report.before = JSON.parse(await ev(`(() => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    window.__RECRUIT_TEST__ = { game };
    const out = {};
    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    window.__RECRUIT_TEST__.originalDelta = originalDelta;
    window.__RECRUIT_TEST__.wasPaused = game.paused;
    game.paused = false;
    const tick = (n) => { for (let i = 0; i < n; i += 1) game.tick(); };
    tick(6);
    game.pendingStrategyRewards = [];
    game.awaitingOpeningReward = false;
    if (game.strategyEvent) game.strategyEvent = null;
    if (game.strategyEventUi?.root) game.strategyEventUi.root.hidden = true;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');

    // 可招募单位现在**只在击破刷怪点时生成在该点位上**（需求第 6 条：
    // 「可招募敌人改成击破刷怪点时生成在刷怪点，不默认到处都有」）。
    // 这个脚本需要**两个**中立单位：一个测中立契约与招募流程，另一个放进基地射程里
    // 测"基地不误伤"。而一个点只按 recruitReward 给一支，所以要点亮足够的点位。
    const ensureNeutrals = (wanted) => {
      const alive = () => (game.enemyUnits ?? []).filter((u) => u?.alive && u.isRecruitable);
      const destroyed = [];
      (game.spawnPoints?.points ?? []).forEach((point) => {
        if (alive().length >= wanted || point.cleared) return;
        game.spawnPoints.destroyPoint(point.id);
        destroyed.push(point.id);
        tick(4);
      });
      return destroyed;
    };
    out.destroyedPointIds = ensureNeutrals(2);
    out.recruitablePointCount = (game.spawnPoints?.points ?? []).filter((p) => p.recruitReward).length;

    const neutrals = (game.enemyUnits ?? []).filter((u) => u?.alive && u.isRecruitable);
    out.neutralCount = neutrals.length;
    out.neutralTypes = neutrals.map((u) => u.type);
    const target = neutrals[0] ?? null;
    if (!target) return JSON.stringify({ ...out, error: 'no_field_recruits' });
    window.__RECRUIT_TEST__.target = target;
    out.targetId = target.id;
    out.targetType = target.type;
    out.spawnedOnWalkable = (() => {
      const cell = game.world?.navGrid?.pointToCell?.({ x: target.position.x, z: target.position.z });
      return cell ? game.world.navGrid.isCellWalkable(cell.x, cell.z) : null;
    })();

    // ---- 中立契约：不主动打人，也不被自动索敌 ----
    // 把一个己方单位贴到它旁边跑两秒。判断依据是"双方生命都没变 + 中立单位没拿到目标"，
    // 而不是去翻伤害日志——那本账在 Game 上并不存在。
    const mate = (game.friendlyUnits ?? []).find((u) => u?.alive) ?? null;
    out.mateFound = Boolean(mate);
    const mateHealthBefore = mate?.health ?? null;
    const neutralHealthBefore = target.health;
    if (mate) mate.position.set(target.position.x + 1.6, mate.position.y, target.position.z + 1.6);
    tick(40);
    out.neutralHasTarget = Boolean(target.target);
    out.neutralHealthUnchanged = target.health === neutralHealthBefore;
    out.mateHealthUnchanged = mate ? mate.health === mateHealthBefore : null;
    out.mateTargetsNeutral = mate ? mate.target === target : null;

    // ---- 基地不该把中立单位当敌人打 ----
    // 中立单位挂在 enemy 队伍里（复用现有链路），所以任何"按队伍清点敌人"的地方
    // 都可能误伤它们。这里直接把一个中立单位放到基地射程内，同时用
    // findPlayerBaseAttackTarget() 做直接断言。
    const other = neutrals[1] ?? null;
    out.baseRangeTested = Boolean(other);
    if (other) {
      other.position.set(
        game.playerBase.position.x + 3.2,
        other.position.y,
        game.playerBase.position.z + 3.2
      );
      const otherHealthBefore = other.health;
      out.basePicksNeutralAsTarget = game.findPlayerBaseAttackTarget() === other;
      tick(60);   // 3 秒模拟时间，足够基地开火好几轮
      out.baseDamagedNeutral = other.health < otherHealthBefore;
    }

    // ---- 没有招募令：按钮禁用，点了不扣东西也不归队 ----
    game.baseInventory.slots.fill(null);
    game.selectUnit(target);
    tick(2);
    const button = document.querySelector('#selected-recruit');
    out.buttonExists = Boolean(button);
    out.buttonVisibleWithoutOrder = Boolean(button) && button.hidden === false;
    out.panelName = document.querySelector('#selected-name')?.textContent ?? null;
    out.buttonLabelWithoutOrder = button?.textContent ?? null;
    out.buttonDisabledWithoutOrder = button?.disabled === true;
    button?.click();
    tick(2);
    out.orderAfterBlockedClick = game.baseInventory.countOf('recruitmentOrder');
    out.stillRecruitable = target.isRecruitable === true;
    out.stillEnemyTeam = target.team === 'enemy';

    // ---- 备好招募令，停在"按钮亮起"的状态等截图 ----
    game.baseInventory.add('recruitmentOrder', 2);
    game.baseStorage?.markDirty?.();
    game.selectUnit(target);
    tick(2);
    const ready = document.querySelector('#selected-recruit');
    out.buttonVisibleWithOrder = Boolean(ready) && ready.hidden === false;
    out.buttonEnabledWithOrder = ready?.disabled === false;
    out.buttonLabelWithOrder = ready?.textContent ?? null;
    out.buttonTitleWithOrder = ready?.title ?? null;
    out.panelNameWithOrder = document.querySelector('#selected-name')?.textContent ?? null;
    out.ordersBefore = game.baseInventory.countOf('recruitmentOrder');
    out.elapsedAdvanced = game.elapsedTime > 0;
    return JSON.stringify(out);
  })()`));

  mkdirSync('C:/WebProjects/WebVillageWar/outputs', { recursive: true });
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

  // 第二段：真的点招募按钮，再验归队结果与"反过来开始战斗"
  // 页内代码必须是 async IIFE：下面的战斗观察要在 tick 之间 await 让出事件循环。
  report.after = JSON.parse(await ev(`(async () => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const target = window.__RECRUIT_TEST__?.target ?? null;
    const out = {};
    const tick = (n) => { for (let i = 0; i < n; i += 1) game.tick(); };
    if (!target) return JSON.stringify({ error: 'no_target' });

    const ordersBefore = game.baseInventory.countOf('recruitmentOrder');
    document.querySelector('#selected-recruit')?.click();
    tick(2);
    out.ordersBefore = ordersBefore;
    out.ordersAfter = game.baseInventory.countOf('recruitmentOrder');
    out.recruitedTeam = target.team;
    out.recruitedFlagCleared = target.isRecruitable === false;
    out.inFriendlyList = (game.friendlyUnits ?? []).includes(target);
    out.stillInEnemyList = (game.unitRegistry?.enemyUnits ?? []).includes(target);
    out.isControllable = game.canControlUnit(target) === true;
    out.selectedAfterRecruit = game.selectedUnit === target;
    out.buttonHiddenAfter = document.querySelector('#selected-recruit')?.hidden === true;

    // ---- 招募后应当以普通战斗单位身份参战 ----
    // 注意：这里的 tick 循环必须让出事件循环。单位寻路走 Web Worker，
    // 死循环里 worker 回包送不到，单位会"追着目标一步不动"，看起来像没在战斗。
    const foe = (game.enemyUnits ?? []).find((u) => u?.alive && !u.isRecruitable && !u.isSpawnPointNest) ?? null;
    out.foeFound = Boolean(foe);
    out.foeType = foe?.type ?? null;
    if (foe) {
      target.position.set(foe.position.x + 1.2, target.position.y, foe.position.z + 1.2);
      const foeHealthBefore = foe.health;
      for (let i = 0; i < 80; i += 1) {
        game.tick();
        if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      out.foeTookDamage = foe.health < foeHealthBefore;
      out.foeHealthBefore = foeHealthBefore;
      out.foeHealthAfter = foe.health;
      out.recruitedAcquiredTarget = Boolean(target.target);
      out.recruitedAiState = target.aiState ?? null;
    }

    game.paused = window.__RECRUIT_TEST__.wasPaused;
    game.clock.getDelta = window.__RECRUIT_TEST__.originalDelta;
    delete window.__RECRUIT_TEST__;
    return JSON.stringify(out);
  })()`));
}

const r = { ...(report.before ?? {}), ...(report.after ?? {}) };
report.verdict = r && !r.error ? {
  booted: true,
  recruitsSpawned: r.neutralCount >= 1 && (r.neutralTypes?.length ?? 0) >= 1,
  recruitOnWalkableGround: r.spawnedOnWalkable === true,
  // 中立契约
  neutralDoesNotAttack: r.neutralHasTarget === false
    && r.mateHealthUnchanged === true
    && r.neutralHealthUnchanged === true,
  neutralNotAutoTargeted: r.mateTargetsNeutral === false,
  // 基地不会把中立单位当敌人（中立单位在 enemy 队伍里，这个坑很好踩）
  baseIgnoresNeutral: r.baseRangeTested === true
    && r.basePicksNeutralAsTarget === false
    && r.baseDamagedNeutral === false,
  // 没有招募令
  buttonShownForNeutral: r.buttonExists === true
    && String(r.panelName ?? '').startsWith('野外单位'),
  disabledWithoutOrder: r.buttonVisibleWithoutOrder === true
    && r.buttonDisabledWithoutOrder === true
    && String(r.buttonLabelWithoutOrder ?? '').includes('缺招募令')
    && r.orderAfterBlockedClick === 0
    && r.stillRecruitable === true
    && r.stillEnemyTeam === true,
  // 有招募令
  enabledWithOrder: r.buttonVisibleWithOrder === true
    && r.buttonEnabledWithOrder === true
    && String(r.buttonLabelWithOrder ?? '') === '招募'
    && String(r.buttonTitleWithOrder ?? '').includes('招募令'),
  orderConsumed: r.ordersBefore === 2 && r.ordersAfter === 1,
  // 归队结果
  joinedPlayerTeam: r.recruitedTeam === 'player'
    && r.recruitedFlagCleared === true
    && r.inFriendlyList === true
    && r.stillInEnemyList === false,
  becameControllable: r.isControllable === true && r.selectedAfterRecruit === true,
  buttonHiddenAfterRecruit: r.buttonHiddenAfter === true,
  // 反过来开始正常战斗
  // 判据用"敌人真的掉血了"，不要求此刻 unit.target 还在：
  // 攻击间隔之间 target 会被清掉再重新索敌，读到一个 null 并不代表它没在打。
  fightsAfterRecruit: r.foeFound === true
    && r.foeTookDamage === true
    && (r.recruitedAiState === 'attacking' || r.recruitedAiState === 'chasing')
} : null;
console.log(JSON.stringify(report, null, 2));
const ok = Object.values(report.verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nFIELD RECRUIT: PASS' : '\nFIELD RECRUIT: FAIL');
console.log('SCREENSHOT', OUT);
ws.close();
process.exit(ok ? 0 : 1);
