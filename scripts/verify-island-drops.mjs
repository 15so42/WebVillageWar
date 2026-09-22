// 海岛死亡掉落端到端验收（生存方案第 7、8 节）。
//
// 验的是**链路**，不是"函数存在"：
//   傀儡阵亡 → 背包与符文石一起落地 → 走进掉落物即被捡走 → 物品与成长守恒。
// 全部通过真实 game.tick() 驱动；headless 里 requestAnimationFrame 不推进，
// 所以必须手动 tick，并断言 elapsedTime 真的增长了（否则测的是"页面开着"）。
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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 页内代码抛错时 Runtime.evaluate 只回一个 undefined，看不出原因。
// 这里把 exceptionDetails 直接抛出来，否则所有失败都长成 "undefined is not valid JSON"。
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
for (let i = 0; i < 60; i += 1) {
  await sleep(500);
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
  await sleep(500);
  if (await ev(`!!window.__VILLAGE_WAR_DEBUG__?.game`)) { report.started = true; break; }
}

if (report.started) {
  report.result = JSON.parse(await ev(`(() => {
    const game = window.__VILLAGE_WAR_DEBUG__.game;
    const out = {};
    if (!game.drops) return JSON.stringify({ error: 'no_ground_drop_system' });
    if (!game.runeStones) return JSON.stringify({ error: 'no_rune_system' });
    const slot = game.localPlayerSlot ?? game.localPlayerId ?? 'local-player';
    const InventoryCtor = game.baseInventory.constructor;

    const originalDelta = game.clock.getDelta.bind(game.clock);
    game.clock.getDelta = () => 0.05;
    const wasPaused = game.paused;
    // 开局三选一会把 game.paused 置真，暂停帧不跑系统
    game.paused = false;
    const elapsedBefore = game.elapsedTime;
    const tick = (n) => { for (let i = 0; i < n; i += 1) game.tick(); };

    // 先让世界跑几帧，把开局那批单位的状态稳定下来
    tick(4);

    let tagCounter = 0;
    // 不依赖"最新加入的是哪一个"：按 id 差集取真正新生成的那一支。
    const spawnWorker = () => {
      const before = new Set((game.friendlyUnits ?? []).map((u) => u.id));
      const point = game.playerBase.position.clone();
      point.x += 6 + tagCounter * 1.5;
      game.summonUnits('woodPuppet', 1, point, 0.7, { select: false });
      const unit = (game.friendlyUnits ?? [])
        .find((u) => u.type === 'woodPuppet' && u.alive && !before.has(u.id)) ?? null;
      if (!unit) return null;
      tagCounter += 1;
      unit.testTag = 'test:' + tagCounter;
      game.work.registerWorker(unit, {
        inventory: new InventoryCtor({ id: unit.testTag, capacity: 8 })
      });
      return unit;
    };

    const victim = spawnWorker();
    const picker = spawnWorker();
    if (!victim || !picker) return JSON.stringify({ error: 'no_worker' });
    out.spawned = { victim: victim.id, picker: picker.id };
    // unregisterWorker 会把 unit.workerInventory 置空（注销就该断干净），
    // 所以这里自己留一份引用，否则阵亡后连"背包空了没"都读不到。
    const victimBag = victim.workerInventory;
    const pickerBag = picker.workerInventory;
    if (!victimBag || !pickerBag) return JSON.stringify({ error: 'no_worker_bag' });

    // ---- 准备持有物：工具 + 货物 + 一块带成长的符文石 ----
    const goods = { wood: 30, stone: 12, food: 5 };
    Object.keys(goods).forEach((itemId) => victimBag.add(itemId, goods[itemId]));
    victimBag.add('axe', 1);
    const axeInstance = victimBag.slots.find((entry) => entry?.itemId === 'axe')?.instanceId ?? null;

    const victimBaseMaxHealth = victim.maxHealth;
    const pickerBaseMaxHealth = picker.maxHealth;
    const stone = game.runeStones.createStone({ enchantmentId: 'triumph', level: 2, playerId: slot });
    const placed = game.runeStones.pickUpStone(stone.id, victim, null);
    // 先练出一点成长：这块数字必须跟着石头走，不能留在单位上
    game.runeStones.addStoneGrowth(stone.id, 7);
    out.before = {
      stoneId: stone.id,
      stonePlaced: placed.ok === true,
      stoneGrowth: game.runeStones.stoneGrowth(stone.id),
      stoneLevel: stone.level,
      baseMaxHealth: victimBaseMaxHealth,
      victimMaxHealth: victim.maxHealth,
      pickerBaseMaxHealth,
      victimHasTriumph: victim.enchantments.has('triumph') === true,
      inventoryCounts: victimBag.countsByItem(),
      axeInstance
    };

    // ---- 占一个资源点，用来验证阵亡后任务预留被释放 ----
    const node = game.resourceNodes.activeNodes()[0] ?? null;
    out.taskClaimed = false;
    if (node) {
      game.work.assignNode(victim, node.id);
      tick(1);
      out.taskClaimed = game.work.board.ownerOf(node.id) === victim.id;
      out.nodeId = node.id;
    }

    // ---- 把被害人挪到远离其他单位的地方，避免阵亡当帧就被旁人捡走 ----
    victim.position.set(40, victim.position.y, -36);
    const dropIdsBefore = new Set(game.drops.drops().map((entry) => entry.id));

    // 走真实死亡链路：用战斗伤害打死它
    const enemy = (game.enemyUnits ?? []).find((u) => u?.alive) ?? null;
    if (enemy) {
      game.combat.applyDamage(victim, 99999, enemy, 0, { source: enemy, target: victim, isAttack: true });
    } else {
      victim.alive = false;
      game.handleUnitDeath(victim, null);
    }
    out.deathPath = enemy ? 'combat_damage' : 'handle_unit_death';
    out.victimDied = victim.alive === false;

    const newDrops = game.drops.drops().filter((entry) => !dropIdsBefore.has(entry.id));
    out.dropsDelta = newDrops.length;
    const drop = newDrops[0] ?? null;
    out.dropPosition = drop ? { x: drop.x, z: drop.z } : null;
    // 掉落物必须真的进了场景、位置对得上（"规则对了但看不见"不算完成）
    const dropVisual = drop ? game.scene.getObjectByName('GroundDrop:' + drop.id) : null;
    out.dropVisualInScene = Boolean(dropVisual && dropVisual.parent)
      && Math.abs(dropVisual.position.x - drop.x) < 1e-6
      && Math.abs(dropVisual.position.z - drop.z) < 1e-6;
    out.dropStackItems = drop ? drop.stacks.map((stack) => ({
      itemId: stack.itemId,
      count: stack.count,
      instanceId: stack.instanceId ?? null,
      growth: stack.data?.growth ?? null
    })) : [];

    // 背包必须被清空：掉落是转移而不是复制
    out.inventoryEmptyAfterDeath = victimBag.slots.every((entry) => !entry);
    out.inventoryCountsAfterDeath = victimBag.countsByItem();

    // 符文石：离开单位、落地、成长原样
    const groundStone = game.runeStones.stoneById(stone.id);
    // 石头总数用系统里的实例总数：按 playerId 过滤会在归属字段与本地槽位
    // 不一致时返回 0，两边都是 0 的"守恒"等于没测。
    out.stoneTotalAfterDeath = game.runeStones.stones.size;
    out.stoneLocationKind = groundStone?.location?.kind ?? null;
    out.stoneGrowthAfterDeath = game.runeStones.stoneGrowth(stone.id);
    out.stoneLevelAfterDeath = groundStone?.level ?? null;
    out.stoneLeftUnit = game.runeStones.stonesForUnit(victim).length === 0;
    out.victimLostTriumph = victim.enchantments.has('triumph') === false;
    out.victimMaxHealthAfterDeath = victim.maxHealth;

    // 作业中断 + 任务预留释放（这一检查发生在任何 tick 之前：
    // 释放必须由死亡链路同步完成，不能指望下一帧的 work.update 顺手清掉）
    out.victimUnregistered = game.work.isWorker(victim) === false;
    out.nodeStillOwnedByVictim = node ? game.work.board.ownerOf(node.id) === victim.id : null;

    // 重复死亡通知不得再掉一份
    const dropsBeforeRepeat = game.drops.count;
    game.handleUnitDeath(victim, null);
    out.repeatDeathAddedDrop = game.drops.count - dropsBeforeRepeat;

    // ---- 拾取：把拾取者挪到掉落物上，靠 update 循环自动捡起 ----
    if (drop) {
      game.work.setDemands([]);
      game.work.clearTask(picker);
      picker.position.set(drop.x, picker.position.y, drop.z);
      let ticksUsed = 0;
      for (let i = 0; i < 12 && game.drops.count > 0; i += 1) { game.tick(); ticksUsed += 1; }
      out.pickupTicksUsed = ticksUsed;
      out.dropsAfterPickup = game.drops.count;
      out.pickerCounts = pickerBag.countsByItem();
      out.pickerAxeInstance = pickerBag.slots.find((entry) => entry?.itemId === 'axe')?.instanceId ?? null;
      out.pickerHasStone = game.runeStones.stonesForUnit(picker)
        .some((entry) => entry.id === stone.id);
      out.pickerStoneGrowth = game.runeStones.stoneGrowth(stone.id);
      out.pickerHasTriumph = picker.enchantments.has('triumph') === true;
      out.stoneTotalAfterPickup = game.runeStones.stones.size;
      out.pickerMaxHealth = picker.maxHealth;
    }

    // ---- 击杀成长：走真实战斗链路，确认成长写回石头而不是单位 ----
    if (drop) {
      const growthBefore = game.runeStones.stoneGrowth(stone.id);
      const maxHealthBefore = picker.maxHealth;
      const stoneLevel = game.runeStones.stoneById(stone.id)?.level ?? 1;
      const prey = (game.enemyUnits ?? []).find((u) => u?.alive) ?? null;
      // **攻击可能被闪避**：CombatSystem.applyDamage 第一件事就是 tryDodgeDamage，
      // 一次 99999 也照样可能被躲掉。所以要打到它真的死为止，而不是打一下就假定击杀。
      // （注意：这段注释在页内模板字符串里，不能出现反引号。）
      let attempts = 0;
      if (prey) {
        while (prey.alive && attempts < 6) {
          game.combat.applyDamage(prey, 99999, picker, 0, {
            source: picker,
            target: prey,
            isAttack: true,
            damageTypes: new Set(['true'])
          });
          attempts += 1;
        }
      }
      out.killGrowth = {
        hadPrey: Boolean(prey),
        preyType: prey?.type ?? null,
        preyAlive: prey ? prey.alive : null,
        attempts,
        level: stoneLevel,
        before: growthBefore,
        after: game.runeStones.stoneGrowth(stone.id),
        maxHealthBefore,
        maxHealthAfter: picker.maxHealth,
        // 迁移的核心：Buff 上不该再有独立的累计值
        buffAccumulator: picker.buffs.get('triumph')?.triumphHealthBonus ?? null
      };
      tick(1);
      out.afterKillTickMaxHealth = picker.maxHealth;
      out.afterKillTickStoneGrowth = game.runeStones.stoneGrowth(stone.id);
    }

    // ---- 装不下的部分必须留在原地，而且账面要守恒 ----
    //
    // 这里必须用一个**真正装不下木材**的拾取者：占满格子还不够，
    // 木材是可堆叠物品，只要有一个没堆满的木材格就还能塞进去
    // （第一版就是这么误判的：freeSlots() === 0 却照样收下了 50 根木头）。
    // 所以改用一个格子全被斧头（不可堆叠、不能与木材合并）占满、
    // 且木材数为 0 的傀儡。
    const blocked = spawnWorker();
    const second = spawnWorker();
    if (blocked && second) {
      const blockedBag = blocked.workerInventory;
      let guard = 0;
      while (blockedBag.freeSlots() > 0 && guard < 40) {
        if (blockedBag.add('axe', 1).added <= 0) break;
        guard += 1;
      }
      out.blockedFreeSlots = blockedBag.freeSlots();
      out.blockedWoodBefore = blockedBag.countOf('wood');
      out.blockedWoodCapacity = blockedBag.canAccept('wood', 1);

      const idsBefore = new Set(game.drops.drops().map((entry) => entry.id));
      second.workerInventory.add('wood', 50);
      second.position.set(-34, second.position.y, -30);
      second.alive = false;
      game.handleUnitDeath(second, null);
      const overflow = game.drops.drops().find((entry) => !idsBefore.has(entry.id)) ?? null;
      out.overflowWoodOnGround = overflow
        ? (overflow.stacks.find((stack) => stack.itemId === 'wood')?.count ?? 0)
        : 0;
      if (overflow) {
        blocked.position.set(overflow.x, blocked.position.y, overflow.z);
        for (let i = 0; i < 12 && game.drops.drops().includes(overflow); i += 1) game.tick();
        out.overflowStillOnGround = game.drops.drops().includes(overflow);
        out.overflowRemainingWood = overflow.stacks
          .find((stack) => stack.itemId === 'wood')?.count ?? 0;
        out.overflowPickerWoodGained = blockedBag.countOf('wood') - out.blockedWoodBefore;
        out.overflowConserved = out.overflowRemainingWood + out.overflowPickerWoodGained === 50;
      }
    }

    // 帧确实推进了：否则上面所有"没变化"都可能是循环没跑
    out.elapsedAdvanced = game.elapsedTime > elapsedBefore;
    out.elapsedDelta = Math.round((game.elapsedTime - elapsedBefore) * 1000) / 1000;

    game.paused = wasPaused;
    game.clock.getDelta = originalDelta;
    return JSON.stringify(out);
  })()`));
}

const r = report.result;
const expectedCounts = r?.before?.inventoryCounts ?? {};
const pickedCounts = r?.pickerCounts ?? {};
report.verdict = r && !r.error ? {
  booted: true,
  workersSpawned: Boolean(r.spawned?.victim && r.spawned?.picker),
  elapsedAdvanced: r.elapsedAdvanced === true,
  taskWasClaimed: r.taskClaimed === true,
  unitDied: r.victimDied === true,
  // 死亡产生掉落物（正好一个，不是零个也不是两个）
  oneDropAppeared: r.dropsDelta === 1,
  dropVisibleInScene: r.dropVisualInScene === true,
  // 背包被清空，掉落物拿到的正是原来那些东西
  bagEmptied: r.inventoryEmptyAfterDeath === true,
  goodsInDrop: ['wood', 'stone', 'food'].every((itemId) => (
    (r.dropStackItems ?? []).some((stack) => stack.itemId === itemId && stack.count === expectedCounts[itemId])
  )) && (r.dropStackItems ?? []).some((stack) => stack.itemId === 'axe' && stack.count === 1),
  // 实例类物品保持同一件
  axeInstanceKept: Boolean(r.before?.axeInstance)
    && (r.dropStackItems ?? []).some((stack) => stack.itemId === 'axe' && stack.instanceId === r.before.axeInstance),
  // 装备期间石头确实在提供加成（成长投影生效）
  growthAppliedWhileEquipped: r.before?.stonePlaced === true
    && r.before?.victimMaxHealth === r.before?.baseMaxHealth + 7
    && r.before?.victimHasTriumph === true,
  // 符文石落地：离开单位、位置变 ground、成长与等级不变
  stoneLeftUnit: r.stoneLeftUnit === true && r.stoneLocationKind === 'ground',
  stoneGrowthKept: r.stoneGrowthAfterDeath === 7 && r.before?.stoneGrowth === 7,
  stoneLevelKept: r.stoneLevelAfterDeath === r.before?.stoneLevel,
  stoneInDrop: (r.dropStackItems ?? []).some((stack) => stack.itemId === 'runeStone'
    && stack.instanceId === r.before?.stoneId
    && stack.growth?.triumphHealthBonus === 7),
  // 地面上的石头不再给原单位加成
  deadUnitLostBuff: r.victimLostTriumph === true,
  deadUnitLostGrowth: r.victimMaxHealthAfterDeath === r.before?.baseMaxHealth,
  // 作业中断 + 预留释放（同步完成）
  workInterrupted: r.victimUnregistered === true,
  reservationReleased: r.nodeStillOwnedByVictim === false,
  // 幂等：重复死亡通知不再掉一份
  repeatDeathIdempotent: r.repeatDeathAddedDrop === 0,
  // 拾取：走 update 循环自动完成
  pickedUpOnWalkOver: r.dropsAfterPickup === 0 && r.pickupTicksUsed > 0,
  goodsRecovered: ['wood', 'stone', 'food'].every((itemId) => pickedCounts[itemId] === expectedCounts[itemId])
    && pickedCounts.axe === 1,
  axeSameInstanceAfterPickup: r.pickerAxeInstance === r.before?.axeInstance,
  stoneBackOnPicker: r.pickerHasStone === true && r.pickerStoneGrowth === 7,
  stoneEnchantActiveAgain: r.pickerHasTriumph === true,
  growthFollowedStone: r.pickerMaxHealth === r.before?.pickerBaseMaxHealth + 7,
  // 击杀成长走真实战斗链路：写回石头 + 上限提高 + Buff 上没有第二份累计值
  killGrowthOnStone: r.killGrowth?.hadPrey === true
    && r.killGrowth?.preyAlive === false
    && r.killGrowth?.after === r.killGrowth?.before + r.killGrowth?.level
    && r.killGrowth?.maxHealthAfter === r.killGrowth?.maxHealthBefore + r.killGrowth?.level,
  killGrowthPersistsAfterTick: r.afterKillTickStoneGrowth === r.killGrowth?.after
    && r.afterKillTickMaxHealth === r.killGrowth?.maxHealthAfter,
  noBuffAccumulator: r.killGrowth?.buffAccumulator === null,
  noStoneDuplicated: r.stoneTotalAfterPickup === r.stoneTotalAfterDeath
    && r.stoneTotalAfterDeath === 1,
  // 装不下的留在原地，不静默销毁，且总量守恒。
  // 前提条件也要断言：拾取者必须真的装不下（格子全占 + 木材为 0 + canAccept 返回 0），
  // 否则这条"留在原地"等于什么都没测。canAccept 返回的是**能收下的数量**，不是布尔值。
  overflowStaysOnGround: r.blockedFreeSlots === 0
    && r.blockedWoodBefore === 0
    && r.blockedWoodCapacity === 0
    && r.overflowWoodOnGround === 50
    && r.overflowStillOnGround === true
    && r.overflowRemainingWood === 50
    && r.overflowPickerWoodGained === 0
    && r.overflowConserved === true
} : null;
console.log(JSON.stringify(report, null, 2));
const verdict = report.verdict;
const ok = Boolean(verdict) && Object.values(verdict).every(Boolean) && problems.length === 0;
console.log(ok ? '\nISLAND DEATH DROPS: PASS' : '\nISLAND DEATH DROPS: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
