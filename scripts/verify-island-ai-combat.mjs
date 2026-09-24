// 傀儡 AI（Numen 式：自卫反射 + 战斗承诺）的端到端验收。
//
// 这一轮用户的原话是「ai 得重新设计一下……它的 ai 在执行任务时会朝着目标前进，
// 路上遇到怪有些会打有些不会打，很干脆，在干其他活的时候遇到怪物也会先把怪物打了」，
// 以及第 5 轮报的「现在木傀儡和狼怎么互相拉扯啊」。
//
// 所以这个脚本量的不是"公式对不对"（那是 test-combat-plan / test-combat-reflex 的事），
// 而是**跨系统拼起来之后的四个可观测行为**：
//
//   1. 干活时旁边有敌人（但没打它、也够不着它）→ **不打断**。这正是用户第 4 轮报的
//      「一开始为什么还朝狼走」：旧实现按威胁压力判定，8m 外的狼也算危险。
//   2. 挨打/被贴身 → 立刻开一场仗，而且这一场**开着就一直打**（承诺），
//      不是每帧重判一次打还是逃。
//   3. 打完**接着干原来那件活**（任务与进度都不丢）。
//   4. 全程身体归属的翻转次数必须是常数级（旧实现是每帧翻一次 = 「互相拉扯」）。
//
// 隔离手法与 verify-island-puppet-combat 一致：把傀儡挪到远离基地的空地、清掉
// 除巢穴以外的敌人（基地 8.5m 的自动开火会把靶子打掉，测出来的掉血就不是傀儡打的）。
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';

const CDP_PORT = Number(process.env.ISLAND_CDP_PORT || 9235);
const BASE = process.env.ISLAND_URL || 'http://127.0.0.1:3000/';

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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
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
const report = { page: BASE, started: false, result: null, problems };
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
        if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
      }
    };
    const worker = (unit) => game.work.workerState(unit);
    // 收掉开局弹窗，否则模态会把 game.paused 置真、暂停帧不跑系统
    game.pendingStrategyRewards = [];
    game.awaitingOpeningReward = false;
    if (game.strategyEvent) game.strategyEvent = null;
    if (game.strategyEventUi?.root) game.strategyEventUi.root.hidden = true;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
    await step(6);

    const puppet = (game.friendlyUnits ?? []).find((u) => u?.alive && u.isWorker === true) ?? null;
    out.puppetFound = Boolean(puppet);
    if (!puppet) return JSON.stringify({ ...out, error: 'no_wood_puppet' });

    // ---- 隔离：清掉除巢穴以外的敌人，把傀儡挪到基地 30m 外
    const clearWorldEnemies = () => (game.enemyUnits ?? []).slice().forEach((u) => {
      if (u && u.alive && u.isSpawnPointNest !== true) { u.health = 0; u.alive = false; }
    });
    clearWorldEnemies();
    const home = game.resolveWalkablePoint(
      new (puppet.position.constructor)(game.playerBase.position.x - 34, 0, game.playerBase.position.z)
    );
    puppet.position.set(home.x, game.groundHeightAt(home), home.z);
    await step(4);
    out.isolated = {
      distanceFromBase: Math.round(Math.hypot(
        puppet.position.x - game.playerBase.position.x,
        puppet.position.z - game.playerBase.position.z
      ) * 100) / 100,
      enemies: (game.enemyUnits ?? []).filter((u) => u?.alive && u.isSpawnPointNest !== true).length
    };

    // 手里给一把斧头：按标定斧 8.19 > 狼 7.69，所以"打狼"这一档打得赢。
    // 走背包（而不是直接写属性），与玩家实际给工具是同一条路。
    const bag = game.work.inventoryFor(puppet);
    bag.add('axe', 1);
    game.onUnitBackpackChanged(puppet);
    await step(2);
    out.gear = worker(puppet).gearKind;

    /**
     * 活动魔力补满。
     *
     * 这段隔离把傀儡放到了基地 34m 之外，而傀儡的活动魔力只在**基地/供能范围**里回。
     * 不补的话它整段都卡在 low_power 状态里站着，progress 永远是 0——
     * 于是"有没有被打断"变成了一条无法证伪的断言（进度本来就不涨）。
     * 这段要测的是**战斗打断**，不是供能（那是 verify-island-power 的事），
     * 所以把魔力钉满属于正当的隔离手段，不是掩盖问题。
     */
    const topUpMana = () => {
      puppet.activityMana = puppet.manaCapacity ?? puppet.activityMana;
    };
    topUpMana();

    /**
     * 让这棵树一直有货。
     *
     * 一棵橡树几十下就采空了，采空后作业系统会**交掉任务**（那是正确行为），
     * 而这段隔离又关掉了自动派活，于是傀儡会变成 idle——"打完接着干原来那件活"
     * 就成了一条测不到东西的断言。这段要测的是战斗打断与恢复，不是采集容量。
     */
    let keepNodeStocked = () => {};

    // 一次只测一件事：先钉住一只**不索敌**的敌人，看傀儡会不会被打断。
    const pin = (unit) => {
      if (!unit) return;
      unit.moveGoal = null;
      unit.commandMoveGoal = null;
      unit.wanderGoal = null;
      unit.target = null;
      unit.attributes?.setBase?.('aggroRange', 0);
      unit.attributes?.setBase?.('moveSpeed', 0);
    };
    const holdAttacker = (unit) => {
      if (!unit) return;
      unit.moveGoal = null;
      unit.commandMoveGoal = null;
      unit.wanderGoal = null;
      unit.attributes?.setBase?.('moveSpeed', 0);
      unit.target = puppet;
    };
    const soften = (unit) => {
      if (!unit) return;
      unit.attributes?.setBase?.('physicalAttack', 0.2);
      unit.attributes?.setBase?.('attackRate', 0.05);
    };

    // ---- 1) 旁边有敌人但没动手、也够不着 → 不许打断手里的活
    //
    // 摆一个真的采集任务，再看它有没有被打断：只断言"状态是 working"是不够的，
    // 因为"没有任务时站着不动"也是 working 的近亲。
    game.work.setDemands([]);
    game.work.clearTask(puppet);
    const woodNodes = (game.resourceNodes?.activeNodes?.() ?? [])
      .filter((node) => node?.resource === 'wood' && (node.amount ?? 0) > 0)
      .sort((a, b) => (
        Math.hypot(a.x - puppet.position.x, a.z - puppet.position.z)
        - Math.hypot(b.x - puppet.position.x, b.z - puppet.position.z)
      ));
    const node = woodNodes[0] ?? null;
    out.workNode = node ? { id: node.id, distance: Math.round(
      Math.hypot(node.x - puppet.position.x, node.z - puppet.position.z) * 100) / 100 } : null;
    keepNodeStocked = () => {
      if (node && (node.amount ?? 0) < 120) node.amount = 500;
    };
    keepNodeStocked();
    const assigned = node ? game.work.assignNode(puppet, node.id) : false;
    out.taskAssigned = assigned === true;
    // 让傀儡先走到树边、真正开始砍（进度 > 0 才叫"在干活"）
    let warmup = 0;
    while (warmup < 400 && (worker(puppet).progress ?? 0) <= 0) {
      topUpMana();
      keepNodeStocked();
      game.tick();
      if (warmup % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
      warmup += 1;
    }
    out.warmupFrames = warmup;
    out.progressBefore = Math.round((worker(puppet).progress ?? 0) * 1000) / 1000;
    out.stateBefore = worker(puppet).state;

    const bystander = game.spawnEnemyAt('wolf', {
      x: puppet.position.x + 6,
      z: puppet.position.z
    }, { radius: 0.6 });
    pin(bystander);
    await step(2);
    let interrupted = 0;
    let phaseDuringBystander = new Set();
    let combatsBefore = game.work.stats.combats;
    for (let i = 0; i < 80; i += 1) {
      pin(bystander);
      topUpMana();
      keepNodeStocked();
      game.tick();
      if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
      const st = worker(puppet);
      phaseDuringBystander.add(st.combatPhase ?? 'none');
      if (st.combatPhase) interrupted += 1;
    }
    out.bystander = {
      alive: bystander?.alive === true,
      distance: bystander ? Math.round(Math.hypot(
        bystander.position.x - puppet.position.x,
        bystander.position.z - puppet.position.z
      ) * 100) / 100 : null,
      interruptedFrames: interrupted,
      combatsOpened: game.work.stats.combats - combatsBefore,
      phases: [...phaseDuringBystander],
      progressAfter: Math.round((worker(puppet).progress ?? 0) * 1000) / 1000,
      stateAfter: worker(puppet).state,
      bodyHolder: worker(puppet).bodyHolder,
      taskKept: (worker(puppet).nodeId ?? null) === (node?.id ?? null)
    };

    if (bystander) { bystander.health = 0; bystander.alive = false; }
    await step(4);

    // ---- 2/3/4) 狼**真的来咬**：开一场仗、打完、接着干原来那件活
    //
    // 狼（战力 7.69）对斧头（8.19）是"打得过"，所以这一档应当打而不是逃。
    // 让狼真的咬：保留索敌、压住伤害（否则量的是血量竞赛）。
    //
    // 距离取 1.0m 而不是 1.8m：spawnEnemyAt 会带一点散布（实测要的 1.8m 落在 2.47m），
    // 而两条触发线的上界就在 2.2~2.35m（我的一击之距 / 它的一击之距）。
    // 站到 2.47m 时**两条都不成立**——那是判据的正确行为（它这一刻确实打不到我），
    // 但会让这个脚本测不到东西，所以要放得明确一些。
    const wolf = game.spawnEnemyAt('wolf', {
      x: puppet.position.x + 1.0,
      z: puppet.position.z
    }, { radius: 0.6 });
    holdAttacker(wolf);
    soften(wolf);
    const combatsBeforeFight = game.work.stats.combats;
    const actionsBeforeFight = game.work.stats.harvestActions;
    const nodeIdAtFightStart = worker(puppet).nodeId ?? null;
    const phases = [];
    let phaseFlips = 0;
    let lastPhase = null;
    let attacksLanded = 0;
    let wolfHealthAtFightEnd = null;
    let fightFrames = 0;
    let handsBackAtFrame = null;
    let wolfDeathFrame = null;
    let wolfDeathTime = null;
    let handsBackTime = null;
    for (let i = 0; i < 400; i += 1) {
      if (wolf?.alive) holdAttacker(wolf);
      topUpMana();
      keepNodeStocked();
      game.tick();
      if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
      const st = worker(puppet);
      const phase = st.combatPhase ?? null;
      if (phase !== lastPhase) {
        phaseFlips += 1;
        phases.push({ frame: i, phase: phase ?? 'none', holder: st.bodyHolder, state: st.state });
      }
      lastPhase = phase;
      if (phase === 'fight') fightFrames += 1;
      // 傀儡真的打到了：狼掉血（走 combat AI，不是作业系统）
      if (wolf && wolf.alive && wolf.health < wolf.maxHealth) attacksLanded += 1;
      if (wolf && !wolf.alive && wolfDeathFrame === null) {
        wolfDeathFrame = i;
        // 冷静宽限是按**游戏时间**算的（2 秒），而 tick 的 dt 与帧号不必 1:1，
        // 所以这里记 elapsedTime；断言也用秒，不用帧。
        wolfDeathTime = game.elapsedTime ?? null;
        wolfHealthAtFightEnd = 0;
      }
      if (wolfDeathFrame !== null && handsBackAtFrame === null && st.bodyHolder === 'workOrder') {
        handsBackAtFrame = i;
        handsBackTime = game.elapsedTime ?? null;
      }
      if (handsBackAtFrame !== null && i - handsBackAtFrame > 40) break;
    }
    out.fight = {
      wolfSpawned: Boolean(wolf),
      spawnDistance: Math.round(Math.hypot(
        wolf.position.x - puppet.position.x,
        wolf.position.z - puppet.position.z
      ) * 100) / 100,
      combatsOpened: game.work.stats.combats - combatsBeforeFight,
      phaseFlips,
      phases: phases.slice(0, 12),
      fightFrames,
      attacksLanded,
      wolfAlive: wolf?.alive === true,
      wolfHealth: wolf ? Math.round(wolf.health * 100) / 100 : null,
      wolfDeathFrame,
      // 冷静宽限：狼死后身体还要在反射手里待 ≈2 秒才交回作业（按游戏时间量）
      calmGraceSeconds: (wolfDeathTime !== null && handsBackTime !== null)
        ? Math.round((handsBackTime - wolfDeathTime) * 100) / 100
        : null,
      calmGraceFrames: (wolfDeathFrame !== null && handsBackAtFrame !== null)
        ? handsBackAtFrame - wolfDeathFrame
        : null,
      handsBackAtFrame,
      // ---- 打完接着干原来那件活
      nodeIdBefore: nodeIdAtFightStart,
      nodeIdAfter: worker(puppet).nodeId ?? null,
      taskKept: nodeIdAtFightStart !== null && (worker(puppet).nodeId ?? null) === nodeIdAtFightStart,
      actionsBeforeFight,
      actionsAtFightEnd: game.work.stats.harvestActions,
      stateAfter: worker(puppet).state,
      puppetAlive: puppet.alive === true,
      puppetHealth: Math.round((puppet.health ?? 0) * 100) / 100
    };
    // 打完之后再跑一段：必须回到采集状态、并且**真的又采了一次**
    // （用累计计数而不是 progress：progress 每完成一次采集就归零，单点比较会假红）
    let resumeFrames = 0;
    let resumed = false;
    while (resumeFrames < 400) {
      topUpMana();
      keepNodeStocked();
      game.tick();
      if (resumeFrames % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
      resumeFrames += 1;
      const st = worker(puppet);
      if (!st.combatPhase && st.state === 'harvesting') {
        resumed = true;
        // 再跑一会儿，让它真的完成一次采集动作
        for (let k = 0; k < 120; k += 1) {
          topUpMana();
          keepNodeStocked();
          game.tick();
        }
        break;
      }
    }
    out.resume = {
      frames: resumeFrames,
      resumed,
      state: worker(puppet).state,
      bodyHolder: worker(puppet).bodyHolder,
      actionsAfter: game.work.stats.harvestActions,
      actionsGrew: game.work.stats.harvestActions > actionsBeforeFight
    };

    // ---- 7) 采空之后必须能接到新活（用户报的「砍完树后就在原地不动了」）
    //
    // 复现出来的 bug：clearTask(record) 是**静默空操作**——它内部写
    // unitId = typeof x === 'object' ? x?.id : x，而作业记录上没有 id（叫 unitId），
    // 于是 records.get(undefined) 是 undefined、方法直接 return false。
    // 后果：采空的节点每帧被判一次"已采空"，record.task 永远指着那棵空树，
    // 而 updateAutoAssign 只挑"手上没活"的傀儡 → 它**再也不会被派活**，
    // 站在原地待命到天荒地老，stats.depletedTasks 每帧 +1（实测 1500 帧 +1500）。
    //
    // 这一段就是那条的回归：把节点存货压到 1（走真实的采空路径），
    // 然后要求"任务被真正交掉、只记一次、并且很快被派到**另一个**节点"。
    // 就用手上这棵树：傀儡正站在它旁边砍它，跟用户描述的场景一致
    // （换一棵远处的树会被"作业移动走直线"那条既有取舍干扰，测的就不是这件事了）。
    game.refreshWorkDemands();   // 前面为了隔离关掉了自动派活，这里开回来
    const bagForNext = game.work.inventoryFor(puppet);
    bagForNext?.slots?.forEach((slot, index) => { if (slot) bagForNext.slots[index] = null; });
    // 清背包是为了清掉背着的木头（不然它会先去卸货，测不到"接着砍下一棵"）。
    // 但**斧头也在里面**：不清完再放回去的话，规划器会判 blocked / 缺工具，
    // 于是这一段测的就变成"没工具当然不干活"，而不是我们想守的那条。
    bagForNext?.add?.('axe', 1);
    if (bagForNext) game.onUnitBackpackChanged(puppet);
    const targetNode = node ?? null;
    let depletion = { nodeId: targetNode?.id ?? null };
    if (targetNode) {
      game.work.clearTask(puppet);
      game.work.assignNode(puppet, targetNode.id);
      // 压到 3：几下就采空，走的是资源系统真正的 released / depleted 那条路
      targetNode.amount = 3;
      const amountAfterWrite = targetNode.amount;
      game.tick();
      const amountAfterOneTick = targetNode.amount;
      const depletedBefore = game.work.stats.depletedTasks;
      let sawTaskCleared = false;
      let movedOnNodeId = null;
      let idleFramesAfterDepletion = 0;
      let depletedAtFrame = null;
      const trace = [];
      for (let i = 0; i < 1600; i += 1) {
        topUpMana();
        game.tick();
        const rec = game.work.records.get(puppet.id);
        const st = worker(puppet);
        if (rec && rec.task === null) sawTaskCleared = true;
        if (targetNode.released === true || (targetNode.amount ?? 0) <= 0) {
          if (depletedAtFrame === null) depletedAtFrame = i + 1;
        }
        if (depletedAtFrame !== null && st.nodeId && st.nodeId !== targetNode.id) movedOnNodeId = st.nodeId;
        if (depletedAtFrame !== null && depletedAtFrame + 30 < i
            && st.state === 'idle' && !st.nodeId) idleFramesAfterDepletion += 1;
        if (i % 200 === 0) {
          trace.push({
            f: i,
            state: st.state,
            nodeId: st.nodeId,
            amount: targetNode.amount,
            released: targetNode.released === true,
            progress: Math.round((st.progress ?? 0) * 100) / 100,
            error: st.error,
            depletedTasks: game.work.stats.depletedTasks
          });
        }
        if (depletedAtFrame !== null && movedOnNodeId !== null && i - depletedAtFrame > 60) break;
      }
      depletion = {
        nodeId: targetNode.id,
        amountAfterWrite,
        amountAfterOneTick,
        amountAtEnd: targetNode.amount,
        depletedAtFrame,
        sawTaskCleared,
        // 采空这件事只该被记一次；每帧都记就是那个静默空操作
        depletedDelta: game.work.stats.depletedTasks - depletedBefore,
        movedOnNodeId,
        movedOn: movedOnNodeId !== null,
        idleFramesAfterDepletion,
        finalTaskNodeId: worker(puppet).nodeId,
        finalState: worker(puppet).state,
        trace
      };
    }
    out.depletion = depletion;

    out.workStats = { ...game.work.stats };
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));
}

const r = report.result;
report.verdict = r && !r.error ? {
  booted: true,
  // 隔离成立：傀儡离基地够远，场上没有别的敌人
  isolatedForMeasurement: r.isolated?.distanceFromBase > 20 && r.isolated?.enemies === 0,
  // 真的在干活（有任务、进度 > 0），否则后面的"没被打断"证明不了什么
  wasWorkingBeforeInterrupt: r.taskAssigned === true
    && r.progressBefore > 0
    && (r.stateBefore === 'harvesting' || r.stateBefore === 'moving_to_node'),
  // 1) 旁边有敌人但没动手 → 一帧都不打断，也没开过战斗
  bystanderDoesNotInterrupt: r.bystander?.alive === true
    && r.bystander?.interruptedFrames === 0
    && r.bystander?.combatsOpened === 0
    && r.bystander?.phases?.length === 1
    && r.bystander?.phases?.[0] === 'none'
    && r.bystander?.bodyHolder === 'workOrder'
    && r.bystander?.taskKept === true
    && r.bystander?.progressAfter > r.progressBefore,
  // 2) 被咬 → 当场开一场仗（而且只开一场）
  attackOpensExactlyOneFight: r.fight?.combatsOpened === 1
    && r.fight?.fightFrames > 0
    && r.fight?.attacksLanded > 0,
  // 3) 承诺：整场战斗里阶段几乎不翻面（旧实现是每帧重判 → 每帧翻面 = "互相拉扯"）
  fightCommitsWithoutFlapping: r.fight?.phaseFlips <= 4,
  // 4) 打完狼死了（斧头 8.19 > 狼 7.69）
  wolfKilledInFight: r.fight?.wolfAlive === false,
  // 5) 冷静宽限：狼死后身体还在反射手里 ≈2 秒（按游戏时间），不是立刻交还
  calmGraceBeforeHandback: typeof r.fight?.calmGraceSeconds === 'number'
    && r.fight.calmGraceSeconds >= 1.8
    && r.fight.calmGraceSeconds <= 2.6,
  // 6) 打完接着干原来那件活：任务不丢、身体还给作业层、又采了一次
  resumesSameTaskAfterFight: r.fight?.taskKept === true
    && r.fight?.stateAfter !== 'engaging'
    && r.resume?.bodyHolder === 'workOrder'
    && r.resume?.resumed === true
    && r.resume?.actionsGrew === true,
  // 7) 采空之后必须能接到新活（用户报的「砍完树后就在原地不动了」）
  //    - 任务被真正交掉（不是静默空操作）
  //    - "已采空"只记一次，不是每帧一次
  //    - 很快被派到另一个节点，而不是原地待命
  handlesDepletedNode: r.depletion?.nodeId
    && r.depletion?.depletedAtFrame !== null
    && r.depletion?.sawTaskCleared === true
    && r.depletion?.depletedDelta <= 2
    && r.depletion?.movedOn === true
    && r.depletion?.movedOnNodeId !== r.depletion?.nodeId
    && r.depletion?.idleFramesAfterDepletion === 0,
  puppetSurvived: r.fight?.puppetAlive === true
} : null;
console.log(JSON.stringify(report, null, 2));
const failedChecks = Object.entries(report.verdict ?? {})
  .filter(([, passed]) => passed !== true)
  .map(([key]) => key);
if (failedChecks.length) console.log(`FAILED CHECKS: ${failedChecks.join(', ')}`);
const ok = failedChecks.length === 0 && problems.length === 0;
console.log(ok ? '\nISLAND AI COMBAT: PASS' : '\nISLAND AI COMBAT: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
