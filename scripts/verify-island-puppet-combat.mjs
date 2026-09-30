// 木傀儡「威胁度 / 逃跑 / 迎战」与「开局没有战斗单位」的端到端验收。
//
// 覆盖用户本轮的三条需求：
//   1. 木傀儡在没有武器的情况下会逃跑；执行非战斗任务时去威胁度低的地方；
//      威胁度是一个覆盖场景的二维数组，敌人按自己的位置与半径叠进去；
//   3. 玩家开局没有任何战斗单位，去掉现有的战斗单位。
//
// 为什么必须端到端跑：这三条的核心是**跨系统的因果**
//   「敌人写进数组」→「傀儡读到危险」→「按战力决定打或逃」→「真的位移/真的掉血」。
// 单测只能证明每一段的公式对，证明不了它们被接在一起。特别是"迎战"这条路
// 依赖 WorkSystem 把这一帧**交回**给 UnitLogicSystem 的战斗 AI——一旦交不回去，
// 表现是"傀儡站着不动"，而所有单测仍然是绿的。
//
// 隔离手法（都是刻意的，写在这里免得下次误以为是漏测）：
//   - 威胁源用 `spawnEnemyAt` 真生成一个敌人，但每帧把它的索敌钉成 0、清掉移动目标：
//     这样它只当"威胁地标"，不会追着傀儡打。否则测的就是"谁跑得快"而不是
//     "威胁度有没有被读到"。
//   - 武器不靠拖拽 UI，直接走 `craftAtBase` + `equipWeaponFromBag` 这条真实的
//     合成/换装链（拖拽 UI 由 verify-backpack-* 覆盖）。
//   - 拆巢穴分两段：先"单挑巢穴"（必须成功，这是链路能不能走的底线），
//     再"开夜袭一起打"（**只报告不判定**，它是难度数据，不是正确性）。
//     把难度写进判定会让这个脚本在调平衡时反复变红，而它要守的是"能不能"。
import WebSocket from 'ws';
import { enterSurvivalGame } from './lib/enter-game.mjs';

const CDP_PORT = Number(process.env.ISLAND_CDP_PORT || 9235);
const BASE = process.env.ISLAND_URL || 'http://127.0.0.1:3000/';
const SIM_SECONDS = Number(process.env.PUPPET_SIM_SECONDS || 120);

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
const report = { page: BASE, simSeconds: SIM_SECONDS, started: false, result: null, problems };
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
    await step(8);
    // 收掉开局弹窗，否则模态会把 game.paused 置真、暂停帧不跑系统
    game.pendingStrategyRewards = [];
    game.awaitingOpeningReward = false;
    if (game.strategyEvent) game.strategyEvent = null;
    if (game.strategyEventUi?.root) game.strategyEventUi.root.hidden = true;
    document.body.classList.remove('is-game-paused', 'is-strategy-event-open');
    await step(4);

    /**
     * 把一支敌人钉成"威胁地标"：不索敌、不移动、不还手。
     *
     * 必须连**移动速度与游荡目标**一起钉：野生动物走的是 updateWildlifeWander
     * 那条分支（UnitLogicSystem 的 "else if (unit.isWildlife)"），只清 moveGoal
     * 是拦不住它的——它会一边游荡一边把威胁源带走，测量就飘了。
     */
    const pin = (unit) => {
      if (!unit) return;
      unit.moveGoal = null;
      unit.commandMoveGoal = null;
      unit.wanderGoal = null;
      unit.target = null;
      unit.attributes?.setBase?.('aggroRange', 0);
      unit.attributes?.setBase?.('moveSpeed', 0);
    };

    /**
     * 把一支敌人变成**正在打傀儡的攻击者**：钉住移动（不追人），但保留它的索敌，
     * 并把伤害压到几乎为零（否则量的是"谁先把谁打死"，不是"傀儡怎么决策"）。
     *
     * 为什么本轮必须新加这个助手：傀儡的触发判据变了。现在只有
     * 「它正在打我 且 够得着我」或「它已经进了我的攻击距离」才算危险
     * （见 combatReflex.defenseTriggered）——旧的 pin() 会把 target 清空、
     * aggroRange 归零，于是它在傀儡眼里只是"旁边站着的怪"，傀儡照常干活。
     * **那正是需求要的行为**，但它再也证明不了"空手会逃跑"：
     * 要测逃跑，敌人必须真的在打。
     */
    const holdAttacker = (unit) => {
      if (!unit) return;
      unit.moveGoal = null;
      unit.commandMoveGoal = null;
      unit.wanderGoal = null;
      unit.attributes?.setBase?.('moveSpeed', 0);
      unit.target = puppet;
    };
    const softenAttacker = (unit) => {
      if (!unit) return;
      unit.attributes?.setBase?.('physicalAttack', 0.2);
      unit.attributes?.setBase?.('attackRate', 0.05);
    };

    // ---------------------------------------------------------- 1) 开局编制
    const alive = () => (game.friendlyUnits ?? []).filter((u) => u?.alive);
    out.openingTypes = alive().map((u) => u.type);
    out.openingCount = alive().length;
    out.combatCount = alive().filter((u) => u.isWorker !== true && u.isBuilding !== true).length;
    out.workerCount = alive().filter((u) => u.isWorker === true).length;
    out.structureCount = alive().filter((u) => u.isBuilding === true).length;
    out.escortConfig = game.world?.config?.survivalOpening ?? game.worldConfig?.survivalOpening ?? null;

    const puppet = alive().find((u) => u.isWorker === true);
    out.puppetFound = Boolean(puppet);
    if (!puppet) return JSON.stringify({ ...out, error: 'no_wood_puppet' });
    out.puppetGearStart = game.work.workerState(puppet).gearKind;
    out.puppetStartTools = (game.work.inventoryFor(puppet)?.slots ?? [])
      .filter(Boolean).map((s) => s.itemId);

    // ---------------------------------------------------------- 2) 威胁度数组
    const field = game.threat.field;
    out.threatFieldShape = field ? { cols: field.cols, rows: field.rows, cellSize: field.cellSize } : null;
    out.threatBounds = game.battlefieldBounds();
    out.threatCoversBounds = Boolean(field)
      && field.cols * field.cellSize >= (out.threatBounds.maxX - out.threatBounds.minX) - 1e-6
      && field.rows * field.cellSize >= (out.threatBounds.maxZ - out.threatBounds.minZ) - 1e-6;
    // 开局这一刻傀儡脚下的威胁值**只作报告**：岛上 4 处野生动物会游荡，
    // 它完全可能开局就不为 0。判定必须用下面隔离之后的基线，否则这条断言会偶发变红
    // （实测踩过：同一个脚本连跑三次，一次通过、两次红）。
    out.threatAtPuppetAtStart = game.threat.threatAt(puppet.position.x, puppet.position.z);

    // ---------------------------------------------------------- 3) 隔离
    // 把傀儡挪到离基地 30m 的空地上，并清掉场上除巢穴以外的一切敌人。
    // 两条都是必须的，而且都是**被实测打脸之后**才加上的：
    //   1. 基地有自动开火（attackRange 8.5）。傀儡出生点离基地只有 5m，
    //      在它旁边放靶子会被基地几秒内打掉——测出来的"敌人掉血"根本不是傀儡打的；
    //   2. 岛上还有 4 处野生动物（狼/熊），它们会咬傀儡。留着它们，
    //      "傀儡为什么死了"就分不清是靶子打的还是狼咬的。
    // 巢穴留着（后面的判定要用），它们不会主动攻击。
    //
    // 但**先留下一只真的野生动物**：后面 4c 要用它验"野生动物算威胁"。
    // 注意不能拿 spawnEnemyAt('wolf') 代替——那条路径**不会**设 isWildlife
    // （只有 spawnWildlife 会），于是"它是野生动物"这个前提就不成立了。
    // 这里把它挪到远处的海面上并钉住，隔离阶段就干扰不到测量。
    const realWildlife = (game.enemyUnits ?? []).find((u) => u?.alive && u.isWildlife === true) ?? null;
    const clearWorldEnemies = () => (game.enemyUnits ?? []).slice().forEach((u) => {
      if (u && u.alive && u.isSpawnPointNest !== true && u !== realWildlife) {
        u.health = 0;
        u.alive = false;
      }
    });
    clearWorldEnemies();
    if (realWildlife) {
      realWildlife.position.set(100, game.groundHeightAt({ x: 100, z: -90 }), -90);
      pin(realWildlife);
    }
    const homeSpot = game.resolveWalkablePoint(
      new (puppet.position.constructor)(game.playerBase.position.x - 30, 0, game.playerBase.position.z)
    );
    puppet.position.set(homeSpot.x, game.groundHeightAt(homeSpot), homeSpot.z);
    // 关掉自动派活：这一段要的是"傀儡站在原地做决定"，而不是满地图跑去砍树
    game.work.setDemands([]);
    game.work.clearTask(puppet);
    await step(2);
    out.isolation = {
      distanceFromBase: Math.round(Math.hypot(
        puppet.position.x - game.playerBase.position.x,
        puppet.position.z - game.playerBase.position.z
      ) * 100) / 100,
      // 刻意留下的那只野生动物（挪到远海、钉住不动）不算"干扰源"，
      // 后面 4c 要用它；它离傀儡 130m 以上，进不了任何压力窗口。
      otherEnemies: (game.enemyUnits ?? []).filter((u) => u?.alive
        && u.isSpawnPointNest !== true && u !== realWildlife).length,
      parkedWildlife: realWildlife
        ? Math.round(Math.hypot(
          realWildlife.position.x - puppet.position.x,
          realWildlife.position.z - puppet.position.z
        ) * 100) / 100
        : null
    };
    // 隔离之后的基线：只剩巢穴、而巢穴都在 28m 之外，所以这里必须恰好是 0。
    // 有了它，"敌人写进数组"就变成一条**有对照的**断言（放敌人之前 0、之后 > 0），
    // 而不是"开局恰好没有野生动物路过"。
    out.threatAtPuppetIsolated = game.threat.threatAt(puppet.position.x, puppet.position.z);

    // ---------------------------------------------------------- 4) 空手必须逃
    //
    // 敌人放在 1.8m（在它自己的攻击距离里）并且**保留索敌**：傀儡这时是真的在挨打。
    // 上一版这里用 pin() 造"威胁地标"，在新判据下傀儡不会理它——
    // 那是"看见了不打"的正确行为，所以必须在别的段落测。
    let sparring = game.spawnEnemyAt('goblinSoldier', {
      x: puppet.position.x + 1.8,
      z: puppet.position.z
    }, { radius: 0.5 });
    holdAttacker(sparring);
    softenAttacker(sparring);
    await step(2);
    out.threatSourceFound = Boolean(sparring?.alive);
    out.threatAtPuppetWithEnemy = game.threat.threatAt(puppet.position.x, puppet.position.z);
    out.threatPeak = Math.round((field?.peak ?? 0) * 1000) / 1000;
    out.threatCellsWritten = field?.written ?? 0;
    out.threatEnemies = game.threat.stats.enemies;
    out.threatLabel = game.threat.threatLabelAt(puppet.position.x, puppet.position.z);

    const startDistance = null;
    // 距离一律对着**威胁源出生点**量，而不是对着那个单位对象：
    // 傀儡在逃跑过程中完全可能顺手把它打死（那正是"迎战"生效的证据），
    // 一旦对象死了，后面对着它算的距离就全是 null。
    const threatOrigin = sparring
      ? { x: sparring.position.x, z: sparring.position.z }
      : null;
    // 清空傀儡的双手，先测"真的什么都没有"这一档；开局的斧/镐是"临时工具"那一档，
    // 两者都会逃，但只有前者能证明「没有武器就逃跑」是公式的必然结果。
    const stripHands = () => {
      const workerBag = game.work.inventoryFor(puppet);
      if (!workerBag) return;
      workerBag.slots.forEach((slot, index) => {
        if (slot) workerBag.slots[index] = null;
      });
      game.onUnitBackpackChanged(puppet);
    };
    stripHands();
    await step(2);
    const distanceToThreatOrigin = threatOrigin
      ? Math.round(Math.hypot(puppet.position.x - threatOrigin.x, puppet.position.z - threatOrigin.z) * 100) / 100
      : null;
    out.unarmed = { gearAfterStrip: game.work.workerState(puppet).gearKind };
    const startX = puppet.position.x;
    const startZ = puppet.position.z;
    let unarmedFled = false;
    const unarmedStates = new Set();
    // 逃跑必须**走寻路**（用户原话：「逃跑时要寻路，而不是只决定方向，不然撞墙卡死」）。
    // 观测点：unit.route 是 A* 找出来的路线（由 navGridSteeringToward 写入），
    // 而 moveGoalUsesDirectSteering 是我们自己设的开关。两者一起看——
    // 只看"它动了"是不够的，直线也能让它动，而直线正是撞墙的根源。
    let fleeRouteSeen = 0;
    let fleeDirectSteeringSeen = 0;
    let fleeFrames = 0;
    // 身体归属的翻转次数：这一轮新增的观测点（见 combatReflex 的"拉扯"回归）。
    // 旧实现每帧重算一次打/逃，这个数会飙到几十；新实现一场战斗只开一次。
    let bodyFlips = 0;
    let lastPhase = null;
    for (let i = 0; i < 80; i += 1) {
      holdAttacker(sparring);
      game.tick();
      if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
      const st = game.work.workerState(puppet);
      unarmedStates.add(st.state);
      if (st.combatPhase !== lastPhase) bodyFlips += 1;
      lastPhase = st.combatPhase;
      if (st.state === 'fleeing') {
        unarmedFled = true;
        fleeFrames += 1;
        if (Array.isArray(puppet.route) && puppet.route.length > 0) fleeRouteSeen += 1;
        if (puppet.moveGoalUsesDirectSteering === true) fleeDirectSteeringSeen += 1;
      }
    }
    out.unarmed.bodyFlips = bodyFlips;
    out.unarmed.fleeFrames = fleeFrames;
    out.unarmed.fleeRouteFrames = fleeRouteSeen;
    out.unarmed.fleeDirectSteeringFrames = fleeDirectSteeringSeen;
    out.unarmed.fled = unarmedFled;
    out.unarmed.gear = game.work.workerState(puppet).gearKind;
    out.unarmed.states = [...unarmedStates];
    out.unarmed.startDistance = distanceToThreatOrigin;
    out.unarmed.endDistance = threatOrigin
      ? Math.round(Math.hypot(puppet.position.x - threatOrigin.x, puppet.position.z - threatOrigin.z) * 100) / 100
      : null;
    out.unarmed.traveled = Math.round(Math.hypot(puppet.position.x - startX, puppet.position.z - startZ) * 100) / 100;
    out.unarmed.alive = puppet.alive === true;
    out.unarmed.threatSourceAlive = sparring?.alive === true;
    // 工具那一档：把斧子放回去，并在傀儡**当前位置**重新放一个威胁源再逃一次。
    // 不能沿用上面那个威胁源：傀儡已经跑出压力窗口了，那时它判的是"可以干活"，
    // 断言"还在逃"就会假红——那不是行为错，是观测点选错了。
    //
    // 威胁源刻意换成盾卫而不是蛮兵：标定下来"拿斧头的傀儡"战力 5.34 与蛮兵的
    // 单挑压力 5.45 **只差 2%**，站在 2.0m 还是 2.3m 会得出完全相反的结论。
    // 用盾卫（战力 10.87）把结论拉开，测的才是"工具很弱所以逃"，不是"恰好站在阈值哪一侧"。
    const workerBag = game.work.inventoryFor(puppet);
    workerBag.add('axe', 1);
    game.onUnitBackpackChanged(puppet);
    sparring = game.spawnEnemyAt('shieldBearer', {
      x: puppet.position.x + 1.8,
      z: puppet.position.z
    }, { radius: 0.5 });
    holdAttacker(sparring);
    softenAttacker(sparring);
    await step(2);
    let toolFled = false;
    const toolStates = new Set();
    for (let i = 0; i < 60; i += 1) {
      holdAttacker(sparring);
      game.tick();
      if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
      const st = game.work.workerState(puppet);
      toolStates.add(st.state);
      if (st.state === 'fleeing') toolFled = true;
      if (!sparring?.alive) break;
    }
    out.toolOnly = {
      gear: game.work.workerState(puppet).gearKind,
      fled: toolFled,
      states: [...toolStates],
      threatSourceAlive: sparring?.alive === true
    };

    // ---------------------------------------------------------- 4c) 野生动物也算威胁
    //
    // 用户原话：「野生动物不用排除在外，正常计算威胁」。
    // 这一条在实现上其实分两处，容易只做对一半：
    //   - 威胁数组的写入（ThreatFieldSystem）：必须把狼/熊也算进去；
    //   - 傀儡的决策列表（threatsNear）：同一套判据，否则"数组里有、决策看不见"。
    // 所以这里放一只真狼在傀儡旁边，同时断言**数组读数和状态机行为**都对。
    // 对照的是 Game.findPlayerBaseAttackTarget 那条线——那里用的是
    // isHostileEnemy，野生动物**故意**不算（否则基地会打路过的狼）。
    // 两条线的差别必须保持清楚：威胁≠敌军。
    clearWorldEnemies();
    await step(2);   // 让威胁统计刷新到"只剩巢穴"，否则读到的是上一帧的旧值
    const wolf = realWildlife;
    if (wolf) {
      wolf.alive = true;
      wolf.health = wolf.maxHealth;
      // 1.8m：明确落在傀儡自己的攻击距离里（触发线 ②「遇上了就先打」），
      // 这样这条断言不依赖"狼有没有锁上傀儡"这种会被缰绳/游荡影响的状态。
      wolf.position.set(
        puppet.position.x + 1.8,
        game.groundHeightAt({ x: puppet.position.x + 1.8, z: puppet.position.z }),
        puppet.position.z
      );
      pin(wolf);
    }
    await step(2);
    const wolfHere = { x: puppet.position.x, z: puppet.position.z };
    const threatEnemiesWithWildlife = game.threat.stats.enemies;
    out.wildlife = {
      spawned: Boolean(wolf?.alive),
      isWildlife: wolf?.isWildlife === true,
      threatAtPuppet: Math.round(game.threat.threatAt(wolfHere.x, wolfHere.z) * 100) / 100,
      listedInThreatWindow: game.threat.threatsNear(wolfHere, 8)
        .filter((entry) => entry.unit === wolf).length,
      // 傀儡这时拿的是斧头：按新标定它**打得过**一只狼，所以这里应当是"迎战"。
      // 但断言只要求"确实对这只狼做出了反应"（迎战或逃跑），不绑死是哪一种——
      // 这一条要证明的是"野生动物被算进了威胁"，打/逃的取舍由 test-puppet-arms 覆盖。
      state: game.work.workerState(puppet).state,
      gear: game.work.workerState(puppet).gearKind,
      threatEnemiesWithWildlife
    };
    // 把它杀掉再看一次统计：数量必须**正好 -1**。
    // 这是"野生动物确实被算进威胁"最干净的证据——比"脚下威胁 > 0"强得多
    // （巢穴本身也贡献威胁，后者证明不了是这只狼贡献的）。
    if (wolf) {
      wolf.health = 0;
      wolf.alive = false;
    }
    await step(2);
    out.wildlife.threatEnemiesWithoutWildlife = game.threat.stats.enemies;
    out.wildlife.threatDropAfterKill = (out.wildlife.threatEnemiesWithWildlife ?? 0)
      - (out.wildlife.threatEnemiesWithoutWildlife ?? 0);

    // ---------------------------------------------------------- 4d) 不会"跑一段又回头又接着跑"
    //
    // 这一条复现的是**用户在试玩里报的现象**：
    //   傀儡朝狼走过去 → 走到跟前掉头跑 → 跑一段又回头 → 接着跑……
    // 根因有两个，都在这里被钉住：
    //   1. "打不打得过"以前用按距离衰减的压力值算，同一只敌人在远处显得弱、近处显得强，
    //      结论随它的逼近翻面（远处判"迎战"→追击，近处判"打不过"→掉头）。
    //      现在改成**合计战力**，与距离无关（test-puppet-arms 有专门断言）。
    //   2. 逃开之后会被重新派回**同一个危险节点**，于是走回去→再逃。
    //      现在危险节点直接不可选（nodeIsWorkable），跑掉就是跑掉了。
    // 这里的观测点就是"它有没有被派进危险区"以及"逃跑状态翻了几次面"。
    clearWorldEnemies();
    await step(2);
    game.work.clearTask(puppet);
    game.work.setDemands([]);
    const nearestWood = (game.resourceNodes?.activeNodes?.() ?? [])
      .filter((node) => node?.resource === 'wood' && (node.amount ?? 0) > 0)
      .sort((a, b) => (
        Math.hypot(a.x - puppet.position.x, a.z - puppet.position.z)
        - Math.hypot(b.x - puppet.position.x, b.z - puppet.position.z)
      ))[0] ?? null;
    let nodeGuard = null;
    if (nearestWood) {
      nodeGuard = game.spawnEnemyAt('wolf', { x: nearestWood.x, z: nearestWood.z }, { radius: 0.6 });
      pin(nodeGuard);
    }
    // 开回自动派活：这一段测的正是"调度器会不会把它派回危险点"
    game.refreshWorkDemands();
    await step(4);
    out.oscillation = {
      nodeFound: Boolean(nearestWood),
      nearestNodeThreat: nearestWood
        ? Math.round(game.threat.threatAt(nearestWood.x, nearestWood.z) * 100) / 100
        : null,
      nearestNodeWorkable: nearestWood ? game.work.nodeIsWorkable(nearestWood) : null,
      maxNodeThreat: game.work.maxNodeThreat
    };
    let fleeFlips = 0;
    let lastFleeing = null;
    let dangerousNodeAssigned = false;
    const visitedNodes = new Set();
    for (let i = 0; i < 400; i += 1) {
      pin(nodeGuard);
      game.tick();
      if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
      const st = game.work.workerState(puppet);
      const fleeing = st.state === 'fleeing';
      if (lastFleeing !== null && fleeing !== lastFleeing) fleeFlips += 1;
      lastFleeing = fleeing;
      if (st.nodeId) {
        visitedNodes.add(st.nodeId);
        const node = game.resourceNodes.nodeById(st.nodeId);
        if (node && !game.work.nodeIsWorkable(node)) dangerousNodeAssigned = true;
      }
      if (!puppet.alive) break;
    }
    out.oscillation.fleeFlips = fleeFlips;
    out.oscillation.visitedNodeCount = visitedNodes.size;
    out.oscillation.dangerousNodeAssigned = dangerousNodeAssigned;
    out.oscillation.puppetAlive = puppet.alive === true;
    if (nodeGuard) {
      nodeGuard.health = 0;
      nodeGuard.alive = false;
    }
    game.work.clearTask(puppet);
    game.work.setDemands([]);
    await step(2);


    //
    // 需求原文：「在执行非战斗任务时要选择威胁度低的地方执行」。
    // 测法是走**真实的派活链路**，而不是调用评分函数自证：
    //   把两个同类资源节点搬到傀儡左右等距的位置，只给左边的那个加威胁，
    //   然后让调度器重新派活——它必须派右边那个。
    // 三个细节都是必须的：
    //   1. 距离取 20m 而不是 7m：威胁源要压在节点上，如果节点离傀儡不到 8m，
    //      傀儡自己也会进入压力窗口（变成"逃跑"而不是"干活"），测的就不是派活了；
    //   2. 把**其余同类节点全部推到岛外**：调度器是在全部节点里挑评分最低的，
    //      只搬两个的话它完全可能选第三个（实测就是这样，选走了 oak-0-5）；
    //   3. 节点坐标直接改状态字段，因为 node.x / node.z 是调度器唯一读的位置来源。
    // 先把前面几个阶段留下的靶子清掉：它们是"钉住不动"的，傀儡跑了它们还在原地，
    // 不清的话会正好落在傀儡旁边，让"傀儡自己在无威胁状态"这条前提不成立。
    clearWorldEnemies();
    game.work.setDemands([]);
    const activeNodes = game.resourceNodes?.activeNodes?.() ?? [];
    const woodNodes = activeNodes.filter((node) => node?.resource === 'wood' && (node.amount ?? 0) > 0);
    out.lowThreatWork = { candidates: woodNodes.length };
    if (woodNodes.length >= 2) {
      const base = { x: puppet.position.x, z: puppet.position.z };
      const originals = woodNodes.map((node) => ({ node, x: node.x, z: node.z }));
      woodNodes.forEach((node) => { node.x = 400; node.z = 400; });
      const risky = woodNodes[0];
      const safe = woodNodes[1];
      risky.x = base.x - 20; risky.z = base.z;
      safe.x = base.x + 20; safe.z = base.z;
      // 威胁只压左边那个节点；20m 外傀儡自己的压力窗口是空的，所以它会安心"干活"
      const guard = game.spawnEnemyAt('shieldBearer', { x: risky.x, z: risky.z }, { radius: 0.5 });
      pin(guard);
      await step(2);
      game.work.setDemands([{ id: 'low-threat-probe', resource: 'wood', weight: 100, targetStock: 0 }]);
      game.work.clearTask(puppet);
      game.work.autoAssignCooldown = 0;
      game.work.update(0.1);
      const assigned = game.work.taskFor(puppet);
      const here = { x: puppet.position.x, z: puppet.position.z };
      out.lowThreatWork = {
        candidates: woodNodes.length,
        // 傀儡自己要处在"无威胁"状态，否则测的是逃跑而不是派活
        gridThreatAtPuppet: Math.round(game.threat.threatAt(here.x, here.z) * 100) / 100,
        pressureWindowThreats: game.threat.threatsNear(here, 8).length,
        threatAtRisky: Math.round(game.threat.threatAt(risky.x, risky.z) * 100) / 100,
        threatAtSafe: Math.round(game.threat.threatAt(safe.x, safe.z) * 100) / 100,
        // 危险节点是**不可选**（不是"分高一点"）：nodeWorkScore 会给出 Infinity，
        // 而 JSON 里 Infinity 会变成 null，所以这里同时报一个明确的布尔值。
        riskyNodeWorkable: game.work.nodeIsWorkable(risky),
        safeNodeWorkable: game.work.nodeIsWorkable(safe),
        maxNodeThreat: game.work.maxNodeThreat,
        scoreSafe: Math.round(game.work.nodeWorkScore(safe, here.x, here.z) * 100) / 100,
        assignedNodeId: assigned?.nodeId ?? null,
        riskyNodeId: risky.id,
        safeNodeId: safe.id,
        pickedSafe: assigned?.nodeId === safe.id
      };
      // 复原，别影响后面的阶段
      originals.forEach((entry) => { entry.node.x = entry.x; entry.node.z = entry.z; });
      game.work.clearTask(puppet);
      game.work.setDemands([]);
      if (guard) { guard.health = 0; guard.alive = false; }
    }

    // ---------------------------------------------------------- 6) 合成武器 → 迎战
    game.baseInventory.add('wood', 120);
    game.baseInventory.add('stone', 120);
    game.baseInventory.add('iron', 60);
    const craft = game.craftAtBase('puppetGlaive', { times: 1 });
    out.weaponCrafted = craft.ok === true && craft.crafted === 1;
    const bag = game.itemBagFor(puppet, { create: true });
    bag.add('puppetGlaive', 1);
    game.onUnitBackpackChanged(puppet);
    const bagIndex = bag.slots.findIndex((slot) => slot?.itemId === 'puppetGlaive');
    const equip = game.equipWeaponFromBag(puppet, bagIndex, { system: true, silent: true });
    out.weaponEquipped = equip.ok === true;
    out.weaponEquipReason = equip.ok ? null : (equip.label ?? equip.reason ?? null);
    await step(2);
    out.puppetGearArmed = game.work.workerState(puppet).gearKind;
    out.puppetAttackAfterArm = Math.round(game.modifiers.getPhysicalAttack(puppet) * 100) / 100;
    out.puppetWeaponName = puppet.weapon?.name ?? null;

    // 同一个威胁位置：现在必须是"迎战"，而且敌人真的掉血。
    // 敌人保留索敌（正在打傀儡）、伤害压低：这样量到的是"傀儡还手"，不是"谁先打死谁"。
    clearWorldEnemies();
    if (!sparring?.alive) {
      sparring = game.spawnEnemyAt('goblinSoldier', {
        x: puppet.position.x + 1.8,
        z: puppet.position.z
      }, { radius: 0.5 });
    }
    holdAttacker(sparring);
    softenAttacker(sparring);
    const sparringHealth0 = sparring?.health ?? 0;
    let engaged = false;
    const armedStates = new Set();
    for (let i = 0; i < 160; i += 1) {
      holdAttacker(sparring);
      game.tick();
      if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
      const st = game.work.workerState(puppet);
      armedStates.add(st.state);
      if (st.state === 'engaging' || st.engaging === true) engaged = true;
      if (!sparring?.alive || !puppet.alive) break;
    }
    out.armed = {
      engaged,
      states: [...armedStates],
      enemyHealthDrop: Math.round((sparringHealth0 - (sparring?.alive ? sparring.health : 0)) * 100) / 100,
      enemyAlive: sparring?.alive === true,
      puppetAlive: puppet.alive === true
    };

    // ---------------------------------------------------------- 5) 起始巢穴打得动吗
    //
    // 分成两段，顺序是刻意的：先开夜袭打 30 秒（真实开局的压力），再关掉夜袭、
    // 清掉守卫继续打。这样一次性回答两个问题："夜袭下顶不顶得住"（报告）
    // 和"到底打不打得掉"（判定）。反过来做就没法在同一局里量夜袭了——
    // 巢穴一旦被拆，刷怪点就清了，这一局再也不会出兵。
    const nest = (game.enemyUnits ?? []).find((u) => u?.isSpawnPointNest && u.alive
      && u.spawnPointId === 'island-camp-north') ?? null;
    out.starterNestFound = Boolean(nest);
    if (nest && puppet.alive) {
      out.starterNestMaxHealth = Math.round(nest.maxHealth);
      out.starterNestHealthBefore = Math.round(nest.health);
      // 起始巢穴必须是全场最弱的那个点：它是整条链的起点（打掉它才拿到第一个
      // 深邃核心与第二支傀儡），开局只有一支傀儡时这一点尤其关键。
      out.starterNestIsWeakest = (game.spawnPoints?.points ?? [])
        .slice()
        .sort((a, b) => (a.nestHealth || 9999) - (b.nestHealth || 9999))[0]?.id === 'island-camp-north';
      // 奖励发放的观测点必须挂在销毁当帧：奖励的傀儡就刷在巢穴旁边、正在打仗，
      // 事后去数只能得到"没发奖励"这个错误结论。
      let rewardWorkers = 0;
      let rewardCores = 0;
      const originalCleared = game.onSpawnPointCleared?.bind(game) ?? null;
      game.onSpawnPointCleared = (point) => {
        const result = originalCleared ? originalCleared(point) : null;
        rewardWorkers += result?.workers ?? 0;
        if (result?.drop) {
          rewardCores += result.drop.stacks
            .filter((stack) => stack.itemId === 'deepCore')
            .reduce((sum, stack) => sum + stack.count, 0);
        }
        return result;
      };
      out.starterPointConfig = (() => {
        const point = game.spawnPoints?.pointById?.('island-camp-north');
        return point
          ? { maxAlive: point.maxAlive, nestHealth: point.nestHealth, intervalSeconds: point.intervalSeconds }
          : null;
      })();
      const spot = game.resolveWalkablePoint(nest.position.clone().add(new (nest.position.constructor)(1.6, 0, 1.6)));
      puppet.position.set(spot.x, game.groundHeightAt(spot), spot.z);
      const clearGuards = () => (game.enemyUnits ?? []).slice().forEach((u) => {
        if (u && u.alive && u !== nest && u.isSpawnPointNest !== true && u.isRecruitable !== true) {
          u.health = 0;
          u.alive = false;
        }
      });
      clearGuards();
      const countGuards = () => (game.enemyUnits ?? []).filter((u) => u?.alive
        && u.isSpawnPointNest !== true && u.isRecruitable !== true).length;

      // 5a) 夜袭窗口（只报告，不作判定）。
      // 14 秒是量出来的：再长一点这支傀儡就会在窗口内把巢穴拆掉，
      // 后面的"单挑巢穴"就没有对象可打了。它要回答的是"夜袭下会不会被磨死"。
      const raidBefore = Math.round(nest.health);
      let peakGuards = countGuards();
      if (game.dayNight) {
        game.dayNight.phase = 'night';
        game.dayNight.phaseElapsed = 0;
        game.prepareNightRaid?.();
      }
      for (let i = 0; i < Math.round(14 / 0.05); i += 1) {
        game.tick();
        if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
        peakGuards = Math.max(peakGuards, countGuards());
        if (nest.alive === false || !puppet.alive || game.levelFinished) break;
      }
      out.nestRaidWindow = {
        damage: Math.round(raidBefore - (nest.alive ? nest.health : 0)),
        peakGuards,
        nestDestroyed: nest.alive === false,
        puppetAlive: puppet.alive === true,
        puppetHealth: puppet.alive ? Math.round(puppet.health) : 0
      };

      // 5b) 单挑巢穴（判定）
      if (game.dayNight) {
        game.dayNight.phase = 'day';
        game.dayNight.phaseElapsed = 0;
      }
      clearGuards();
      const soloBefore = Math.round(nest.health);
      let firstDamageTick = null;
      const ticks = Math.round(${SIM_SECONDS} / 0.05);
      for (let i = 0; i < ticks; i += 1) {
        game.tick();
        if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
        if (firstDamageTick === null && nest.health < soloBefore) firstDamageTick = i;
        if (nest.alive === false || !puppet.alive || game.levelFinished) break;
      }
      out.nestSolo = {
        skipped: nest.alive === false,
        healthBefore: soloBefore,
        destroyed: nest.alive === false,
        damage: Math.round(soloBefore - (nest.alive ? nest.health : 0)),
        firstDamageSeconds: firstDamageTick === null ? null : Math.round(firstDamageTick * 5) / 100,
        puppetAlive: puppet.alive === true,
        puppetHealth: puppet.alive ? Math.round(puppet.health) : 0
      };
      out.starterNestDestroyed = nest.alive === false;
      out.starterNestTotalDamage = Math.round(out.starterNestHealthBefore
        - (nest.alive ? nest.health : 0));
      // 清点奖励：一支木傀儡 + 一个深邃核心（招募链的起点）。
      // 这是"打掉巢穴之后玩家才拿得到第二支部队"的唯一证据。
      out.nestClearReward = {
        workers: rewardWorkers,
        cores: rewardCores,
        coreOnGround: (game.drops?.drops?.() ?? []).some((entry) => (
          entry.stacks.some((stack) => stack.itemId === 'deepCore')
        )),
        // 深邃核心掉在地上之后会被路过的己方单位自动捡走，所以"还在不在原地"
        // 不是可靠判据。两者取或：掉出来了（rewardCores）**且**还能找到它
        // （在地上或在某个单位背包里）。
        coreInBags: (game.friendlyUnits ?? []).some((unit) => (
          (unit?.workerInventory?.countOf?.('deepCore') ?? 0) > 0
          || (unit?.itemBag?.countOf?.('deepCore') ?? 0) > 0
        ))
      };
    }

    // ---------------------------------------------------------- 6) 调试叠加开关
    const beforeToggle = game.threat.isDebugEnabled?.() === true;
    const toggledOn = game.threat.toggleDebug?.() === true;
    out.threatDebug = {
      defaultOff: beforeToggle === false,
      toggledOn,
      groupVisible: game.threat.debugGroup?.visible === true,
      cells: game.threat.debugCells ?? 0
    };
    game.threat.setDebugEnabled(false);
    out.threatDebug.offAfterDisable = game.threat.isDebugEnabled?.() === false;

    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));
}

const r = report.result;
report.verdict = r && !r.error ? {
  booted: true,
  // 需求 3：开局没有任何战斗单位，只有一支木傀儡
  openingHasNoCombatUnits: r.combatCount === 0,
  openingHasExactlyOneWorker: r.workerCount === 1,
  openingForceIsWoodPuppet: Array.isArray(r.openingTypes)
    && r.openingTypes.filter((t) => t === 'woodPuppet').length === 1,
  escortConfigEmpty: Array.isArray(r.escortConfig?.escorts) && r.escortConfig.escorts.length === 0,
  // 需求 1：威胁度是覆盖整个场景边界的二维数组
  threatArrayCoversBounds: r.threatCoversBounds === true
    && r.threatFieldShape?.cols > 0
    && r.threatFieldShape?.rows > 0
    && r.threatFieldShape?.cellSize > 0,
  // 敌人按自己的位置与半径写进了数组：隔离后基线为 0，放一个敌人立刻 > 0
  enemyWroteThreat: r.threatAtPuppetIsolated === 0
    && r.threatAtPuppetWithEnemy > 0
    && r.threatPeak > 0
    && r.threatEnemies >= 1,
  // 空手会逃跑：状态机真的进入 fleeing，并且真的往远处挪了
  unarmedFlees: r.unarmed?.gearAfterStrip === 'unarmed'
    && r.unarmed?.gear === 'unarmed'
    && r.unarmed?.fled === true
    && r.unarmed?.endDistance > r.unarmed?.startDistance
    && r.unarmed?.traveled > 1
    && r.unarmed?.alive === true,
  // 逃跑主要靠**寻路**（A* 路线），不是直线：
  // 至少拿到过路线，且拿到路线的帧数明显多于退回直线的帧数。
  // 退回直线本身是**有意的兜底**（第一帧路线还在寻路 worker 里、或被同伴挤住），
  // 所以不能要求"一帧都不退"；但如果它成了主要方式，就说明寻路根本没接上。
  fleeUsesPathfinding: r.unarmed?.fleeFrames > 0
    && r.unarmed?.fleeRouteFrames > 0
    && r.unarmed?.fleeRouteFrames >= Math.ceil(r.unarmed.fleeFrames * 0.5)
    && r.unarmed?.fleeRouteFrames > r.unarmed?.fleeDirectSteeringFrames,
  // 不会"互相拉扯"：整段逃跑里战斗阶段几乎不翻面。
  // 旧实现**每帧**用连续量重判一次打/逃，这个数会飙到几十（用户第 5 轮报的现象）；
  // 新实现一场战斗只开一次、逃跑跑到"身边没有追兵"为止。
  fleeCommitsWithoutFlapping: typeof r.unarmed?.bodyFlips === 'number'
    && r.unarmed.bodyFlips <= 2,
  // 野生动物正常计入威胁：写进数组的敌人数量在它死掉时正好 -1、
  // 决策列表里能看到它、傀儡真的对这只狼做出了反应（斧头 → 迎战；逃也算"反应"）
  wildlifeCountsAsThreat: r.wildlife?.spawned === true
    && r.wildlife?.isWildlife === true
    && r.wildlife?.threatDropAfterKill === 1
    && r.wildlife?.threatAtPuppet > 0
    && r.wildlife?.listedInThreatWindow === 1
    && (r.wildlife?.state === 'fleeing' || r.wildlife?.state === 'engaging'),
  // 用户试玩报的那一条：拿斧/镐应当**敢打野狼**（新标定下斧 8.19 > 狼 7.69）
  toolBeatsWolfInGame: r.wildlife?.gear === 'tool' && r.wildlife?.state === 'engaging',
  // 「斧头也可以作战，但是战斗力弱」：只拿工具时遇到蛮兵同样选择逃
  toolOnlyAlsoFlees: r.toolOnly?.gear === 'tool'
    && r.toolOnly?.fled === true
    && r.toolOnly?.threatSourceAlive === true,
  // 隔离成立：傀儡离基地足够远（基地自动开火够不着）、场上没有别的敌人、
  // 留下的那只野生动物被挪到了 100m 之外
  isolatedForMeasurement: r.isolation?.distanceFromBase > 20
    && r.isolation?.otherEnemies === 0
    && r.isolation?.parkedWildlife > 100,
  // 「非战斗任务优先去威胁度低的地方」：危险节点直接不可选，安全节点被选中
  prefersLowThreatNode: r.lowThreatWork?.pressureWindowThreats === 0
    && r.lowThreatWork?.threatAtRisky > 0
    && r.lowThreatWork?.threatAtSafe === 0
    && r.lowThreatWork?.riskyNodeWorkable === false
    && r.lowThreatWork?.safeNodeWorkable === true
    && r.lowThreatWork?.pickedSafe === true,
  // 不会"跑一段又回头又接着跑"：傀儡全程没有被派到危险区里的节点
  noWorkFleeLoop: r.oscillation?.nearestNodeWorkable === false
    && r.oscillation?.dangerousNodeAssigned === false
    && r.oscillation?.fleeFlips <= 4
    && r.oscillation?.puppetAlive === true,
  // 合成 + 换装都走通，攻击力真的被写进单位
  weaponCraftAndEquip: r.weaponCrafted === true
    && r.weaponEquipped === true
    && r.puppetGearArmed === 'weapon'
    && r.puppetAttackAfterArm > 0,
  // 有武器就不逃，改为迎战，而且敌人真的掉血
  armedEngages: r.armed?.engaged === true
    && r.armed?.enemyHealthDrop > 0
    && r.armed?.puppetAlive === true,
  // 开局链条走得通：一支武装傀儡能把起始巢穴拆掉，自己在打完时还活着
  starterNestDestroyed: r.starterNestDestroyed === true
    && r.starterNestTotalDamage > 0
    && (r.nestSolo?.skipped === true || r.nestSolo?.puppetAlive === true),
  // 起始巢穴是全场最弱的点，且清掉之后奖励真的发出来了
  starterNestIsWeakest: r.starterNestIsWeakest === true,
  nestClearGrantsNextUnit: r.nestClearReward?.workers >= 1
    && r.nestClearReward?.cores >= 1
    && (r.nestClearReward?.coreOnGround === true || r.nestClearReward?.coreInBags === true),
  // 需求 1 的调试开关：默认关闭、打开后有实例、关掉后隐藏
  threatDebugToggle: r.threatDebug?.defaultOff === true
    && r.threatDebug?.toggledOn === true
    && r.threatDebug?.groupVisible === true
    && r.threatDebug?.cells > 0
    && r.threatDebug?.offAfterDisable === true
} : null;
console.log(JSON.stringify(report, null, 2));
// 单行列出哪几项判定是假的。批量回归里 runner 只回显失败输出里匹配
// "false|Error|FAIL" 的**末尾几行**，而 JSON 里的 false 散在几百行里，
// 于是"哪一项红了"经常被截掉看不到。这一行保证它一定被回显。
const failedChecks = Object.entries(report.verdict ?? {})
  .filter(([, passed]) => passed !== true)
  .map(([key]) => key);
if (failedChecks.length) console.log(`FAILED CHECKS: ${failedChecks.join(', ')}`);
const ok = failedChecks.length === 0 && problems.length === 0;
console.log(ok ? '\nISLAND PUPPET COMBAT: PASS' : '\nISLAND PUPPET COMBAT: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
