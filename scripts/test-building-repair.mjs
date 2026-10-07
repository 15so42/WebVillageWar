// 建筑脱战维修与傀儡分派（运行时 + 纯规则回归）。
//
// 对应 docs/DSH_DEFENSE_SURVIVAL_DESIGN.md 第二节的每一条可断言要求：
//   1. 只有玩家**已建成、存活**的低血/低耐久建筑登记请求；施工中不登记；
//   2. 脱战 = 最后受伤/发起攻击满 8 秒；交战期间保留请求但不执行；
//   3. 请求按建筑 id 唯一，重复受伤只更新一份，重建时间不动；
//   4. 优先级：基地 > 供能 > 防塔 > 食堂/种植 > 普通生产；急修（<35%）插队；
//      等待时间会补偿，长时间排队不会永久饿死；
//   5. 每栋建筑同时只有 maxWorkers 名傀儡（基地 2 名），不能重复预留；
//   6. 材料从**可达到的**库存/背包取用：先背包、再基地库存；不足就转"待材料"，
//      不反复取不存在的材料、不锁死工人；
//   7. 一个材料换固定修复额度（有限），不会每帧被四舍五入成一个材料，
//      也不会扣一个材料无限修；
//   8. 断路 / 死亡 / 取消 / 重开 / 满血 / 被摧毁都不会永久锁住请求。
import assert from 'node:assert/strict';
import {
  BUILDING_REPAIR_RULES,
  RECYCLE_RULES,
  REPAIR_REQUEST_STATE,
  buildingRepairRules,
  buildingRepairStatus,
  maxRepairWorkersFor,
  pickRepairRequest,
  recycleRatioFor,
  recycleRefundFor,
  repairBatchPlan,
  repairImportanceFor,
  repairMaterialFor,
  repairPriorityScore
} from '../src/systems/buildingRepair.js';
import { RepairDispatchSystem } from '../src/systems/RepairDispatchSystem.js';
import { Inventory } from '../src/systems/Inventory.js';

const report = [];
function check(name, fn) {
  try {
    fn();
    report.push(`ok   ${name}`);
  } catch (error) {
    report.push(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

// --------------------------------------------------------------------- 夹具
function makeBuilding(id, {
  type = 'arrowTower',
  health = 100,
  maxHealth = 100,
  durability = 100,
  maxDurability = 100,
  x = 0,
  z = 0,
  underConstruction = false,
  definition = {}
} = {}) {
  const unit = {
    id,
    type,
    name: id,
    team: 'player',
    alive: true,
    isBuilding: true,
    underConstruction,
    definition,
    position: { x, y: 0, z },
    health,
    maxHealth,
    weapon: { name: '结构', durability, maxDurability, durabilityCost: 0 },
    restoreHealth(amount) {
      const before = this.health;
      this.health = Math.min(this.maxHealth, this.health + Math.max(0, amount));
      return this.health - before;
    },
    restoreDurability(amount) {
      const before = this.weapon.durability;
      this.weapon.durability = Math.min(this.weapon.maxDurability, this.weapon.durability + Math.max(0, amount));
      return this.weapon.durability - before;
    }
  };
  return unit;
}

function makeWorker(id, { x = 0, z = 0, carry = {} } = {}) {
  const inventory = new Inventory({ id: `worker:${id}`, capacity: 16 });
  Object.entries(carry).forEach(([itemId, count]) => inventory.add(itemId, count));
  return {
    id,
    type: 'woodPuppet',
    team: 'player',
    alive: true,
    isWorker: true,
    position: { x, y: 0, z },
    inventory
  };
}

function makeGame(buildings, { baseStock = {}, elapsedTime = 0 } = {}) {
  const baseInventory = new Inventory({ id: 'base', capacity: 64 });
  Object.entries(baseStock).forEach(([itemId, count]) => baseInventory.add(itemId, count));
  const buildingSet = new Set(buildings);
  return {
    elapsedTime,
    baseInventory,
    buildings: { buildings: buildingSet },
    effects: { rings: [], spawnRing() { this.rings.push(1); }, spawnStructureDust() {} },
    hints: { hints: [], setHintOnce(text) { this.hints.push(text); } },
    backpack: { markDirty() {} },
    hotbar: { refresh() {} },
    baseStorage: { markDirty() {} },
    stationPanel: { markDirty() {} },
    syncEquippedWeaponDurabilityToBag() {},
    work: {
      inventoryFor(unit) {
        return unit?.inventory ?? null;
      }
    }
  };
}

// --------------------------------------------------------------------- 纯规则
check('只有已建成、存活、有缺口的建筑才登记；施工中与满血都不登记', () => {
  const full = makeBuilding('b1');
  assert.equal(buildingRepairStatus(full), null, '满血满耐久不该有请求');
  const hurt = makeBuilding('b2', { health: 40 });
  const status = buildingRepairStatus(hurt);
  assert.ok(status, '低血建筑必须有请求');
  assert.equal(status.material, 'wood', '箭塔是木结构');
  assert.equal(status.urgent, false, '40% 还没到急修线');
  const critical = buildingRepairStatus(makeBuilding('b3', { health: 20 }));
  assert.equal(critical.urgent, true, '<35% 算急修');
  assert.equal(buildingRepairStatus(makeBuilding('b4', { underConstruction: true, health: 10 })), null,
    '施工未完成不能一边建设一边被当成健康不足维修');
  const dead = makeBuilding('b5', { health: 10 });
  dead.alive = false;
  assert.equal(buildingRepairStatus(dead), null);
  // 非建筑（单位）不登记
  assert.equal(buildingRepairStatus({ id: 'u', alive: true, isBuilding: false, maxHealth: 10, health: 1 }), null);
});

check('耐久缺口只在比例低于门槛时登记（避免与维修站光环每帧抖动）', () => {
  const slightly = makeBuilding('b1', { durability: 60, maxDurability: 100 });
  assert.equal(buildingRepairStatus(slightly), null, '60% 耐久不登记');
  const worn = makeBuilding('b2', { durability: 20, maxDurability: 100 });
  const status = buildingRepairStatus(worn);
  assert.ok(status);
  assert.equal(status.durabilityGap, 80);
  assert.ok(Math.abs(status.damageRatio - 0.8) < 1e-9);
});

check('维修材料随建筑材质决定，重要度顺序与设计文档一致', () => {
  assert.equal(repairMaterialFor('playerBase'), 'iron');
  assert.equal(repairMaterialFor('manaFurnace'), 'iron');
  assert.equal(repairMaterialFor('arrowTower'), 'wood');
  assert.equal(repairMaterialFor('ballista'), 'iron');
  assert.equal(repairMaterialFor('shockTower'), 'stone');
  assert.equal(repairMaterialFor('canteen'), 'wood');
  assert.equal(repairMaterialFor('未知建筑'), 'wood', '未登记的有默认材质');
  assert.ok(repairImportanceFor('playerBase') < repairImportanceFor('manaFurnace'));
  assert.ok(repairImportanceFor('manaFurnace') < repairImportanceFor('arrowTower'));
  assert.ok(repairImportanceFor('arrowTower') < repairImportanceFor('canteen'));
  assert.ok(repairImportanceFor('canteen') <= repairImportanceFor('chest'));
  assert.equal(maxRepairWorkersFor('playerBase'), 2, '基地这种大型结构允许两名');
  assert.equal(maxRepairWorkersFor('arrowTower'), 1);
});

check('一批维修吃有限个材料、换有限修复量（不会一个材料无限修）', () => {
  const status = buildingRepairStatus(makeBuilding('b1', { health: 0.1, maxHealth: 100 }));
  const plan = repairBatchPlan(status, { available: 99 });
  assert.ok(plan.materials > 0);
  assert.ok(plan.materials <= BUILDING_REPAIR_RULES.maxMaterialsPerBatch, '一批最多吃 maxMaterialsPerBatch 个');
  assert.ok(plan.health > 0);
  // 材料按 healthPerMaterial 折算，不是每帧四舍五入成一个
  assert.equal(plan.health, plan.materials * BUILDING_REPAIR_RULES.healthPerMaterial);
  // 没材料就什么都不修，且不产生 NaN
  const broke = repairBatchPlan(status, { available: 0 });
  assert.deepEqual(broke, { materials: 0, health: 0, durability: 0, material: status.material });
  assert.equal(repairBatchPlan(null).materials, 0);
  // 材料精确为 1 个时只修 1 个材料的量
  const one = repairBatchPlan(status, { available: 1 });
  assert.equal(one.materials, 1);
});

check('优先级：急修与关键建筑插队，等待时间会补偿（不会永久饿死）', () => {
  const rules = buildingRepairRules();
  const now = 100;
  const base = { id: 'base', x: 20, z: 0, createdAt: now, status: buildingRepairStatus(makeBuilding('x', { type: 'playerBase', health: 90, maxHealth: 100, healthRatio: 0.9 })) };
  const chest = { id: 'chest', x: 0, z: 0, createdAt: now, status: buildingRepairStatus(makeBuilding('y', { type: 'chest', health: 90 })) };
  const baseScore = repairPriorityScore(base, { unitX: 0, unitZ: 0, now, rules });
  const chestScore = repairPriorityScore(chest, { unitX: 0, unitZ: 0, now, rules });
  assert.ok(baseScore < chestScore, '基地必须排在箱子前面（即使更远）');

  const urgent = { id: 'urgent', x: 0, z: 0, createdAt: now, status: buildingRepairStatus(makeBuilding('z', { health: 10 })) };
  const healthy = { id: 'healthy', x: 0, z: 0, createdAt: now, status: buildingRepairStatus(makeBuilding('w', { health: 90 })) };
  assert.ok(
    repairPriorityScore(urgent, { now, rules }) < repairPriorityScore(healthy, { now, rules }),
    '同类型里急修插队'
  );
  // 等了 60 秒的普通请求，分数要好于刚到的高一档请求
  const waited = { id: 'waited', x: 0, z: 0, createdAt: 0, status: buildingRepairStatus(makeBuilding('a', { type: 'chest', health: 95 })) };
  const fresh = { id: 'fresh', x: 0, z: 0, createdAt: now, status: buildingRepairStatus(makeBuilding('b', { type: 'canteen', health: 95 })) };
  assert.ok(
    repairPriorityScore(waited, { now, rules }) < repairPriorityScore(fresh, { now, rules }),
    '等待补偿必须真的压过一档重要度差'
  );
  // 但不能反过来让"等了很久的普通生产"压过急修
  const urgentAlways = { id: 'urgent', x: 0, z: 0, createdAt: 0, status: buildingRepairStatus(makeBuilding('c', { health: 10 })) };
  assert.ok(
    repairPriorityScore(urgentAlways, { now, rules }) < repairPriorityScore(waited, { now, rules }),
    '急修永远排在普通维修前面，等待补偿不能把它翻过来'
  );
});

check('挑请求时尊重每栋建筑的名额，且跳过交战中的请求', () => {
  const statusA = buildingRepairStatus(makeBuilding('a', { health: 20 }));
  const statusB = buildingRepairStatus(makeBuilding('b', { type: 'playerBase', health: 20, maxHealth: 100 }));
  const entries = [
    { id: 'a', x: 1, z: 0, createdAt: 0, status: statusA, state: REPAIR_REQUEST_STATE.waiting },
    { id: 'b', x: 5, z: 0, createdAt: 0, status: statusB, state: REPAIR_REQUEST_STATE.waiting }
  ];
  const picked = pickRepairRequest(entries, { reservedCounts: null });
  assert.equal(picked.id, 'b', '基地重要度更高');
  // 基地已被占满 2 名
  const pickedFull = pickRepairRequest(entries, { reservedCounts: new Map([['b', 2]]) });
  assert.equal(pickedFull.id, 'a', '满员的关键建筑不能继续派人');
  // 交战中的请求不派活
  const inCombat = [{ ...entries[1], state: REPAIR_REQUEST_STATE.pending }];
  assert.equal(pickRepairRequest(inCombat), null);
  // 不可达（available: false）跳过
  assert.equal(pickRepairRequest([{ ...entries[0], available: false }]), null);
});

check('回收：出自真实投入、比例随生命过渡、免费对象返不出资源', () => {
  assert.ok(Math.abs(recycleRatioFor(1) - RECYCLE_RULES.intactRatio) < 1e-9);
  assert.ok(Math.abs(recycleRatioFor(0) - RECYCLE_RULES.wreckRatio) < 1e-9);
  assert.ok(recycleRatioFor(1.9) <= RECYCLE_RULES.intactRatio);
  const paid = [{ itemId: 'wood', count: 25 }, { itemId: 'stone', count: 20 }];
  assert.deepEqual(recycleRefundFor({ healthRatio: 1, paidInvestment: [] }), [],
    '没付过成本的对象不能返资源');
  const intact = recycleRefundFor({ healthRatio: 1, paidInvestment: paid });
  assert.equal(intact.find((entry) => entry.itemId === 'wood').count, Math.floor(25 * 0.6));
  const wreck = recycleRefundFor({ healthRatio: 0, paidInvestment: paid });
  assert.ok(wreck.reduce((sum, entry) => sum + entry.count, 0) < intact.reduce((sum, entry) => sum + entry.count, 0));
});

// --------------------------------------------------------------------- 运行时
check('登记：唯一请求、重复受伤只更新一份、满血自动清除', () => {
  const tower = makeBuilding('t1', { health: 50 });
  const game = makeGame([tower]);
  const dispatch = new RepairDispatchSystem(game);
  const first = dispatch.register(tower);
  assert.ok(first);
  assert.equal(dispatch.requests.size, 1);
  const createdAt = first.createdAt;
  game.elapsedTime = 5;
  tower.health = 30;
  const second = dispatch.register(tower);
  assert.equal(second, first, '必须还是同一份请求');
  assert.equal(dispatch.requests.size, 1, '重复受伤不能多出一份');
  assert.equal(second.createdAt, createdAt, '重建时间不能被刷新（那是等了多久的依据）');
  assert.equal(second.status.healthGap, 70);
  // 修满 → 请求消失
  tower.health = 100;
  assert.equal(dispatch.register(tower), null);
  assert.equal(dispatch.requests.size, 0);
  assert.equal(dispatch.requestFor('t1'), null);
});

check('脱战 8 秒：交战窗口内不派活，超过后同一份请求变成可派', () => {
  const tower = makeBuilding('t1', { health: 50 });
  const game = makeGame([tower]);
  const dispatch = new RepairDispatchSystem(game);
  tower.lastCombatAt = 0;
  game.elapsedTime = 4;
  dispatch.register(tower);
  assert.equal(dispatch.inCombatWindow(tower), true);
  assert.deepEqual(dispatch.availableRequests(), [], '交战期间不派活');
  assert.equal(dispatch.requests.get('t1').state, REPAIR_REQUEST_STATE.pending);
  game.elapsedTime = 8.5;
  const available = dispatch.availableRequests();
  assert.equal(available.length, 1, '脱战后同一个请求可派');
  assert.equal(available[0].state, REPAIR_REQUEST_STATE.waiting);
  // 重新交战：立刻回到"交战中等待"
  tower.lastCombatAt = 8.6;
  game.elapsedTime = 9;
  assert.deepEqual(dispatch.availableRequests(), []);
  assert.equal(dispatch.requests.get('t1').state, REPAIR_REQUEST_STATE.pending);
  // 可以自定义脱战秒数：2 秒窗口，t=10.5 时距上次交战 1.9 秒，仍在窗口内
  const custom = new RepairDispatchSystem(makeGame([tower]), { rules: { outOfCombatSeconds: 2 } });
  assert.equal(custom.rules.outOfCombatSeconds, 2);
  assert.equal(custom.inCombatWindow(tower, 10.5), true);
  assert.equal(custom.inCombatWindow(tower, 10.7), false);
  // 未登记过 lastCombatAt 的建筑默认就是脱战
  assert.equal(custom.inCombatWindow(makeBuilding('fresh'), 5), false);
});

check('分派：每栋建筑只有一名傀儡（基地两名），重复预留被拒绝', () => {
  const tower = makeBuilding('t1', { health: 20 });
  const base = makeBuilding('base', { type: 'playerBase', health: 20 });
  const game = makeGame([tower, base]);
  game.elapsedTime = 100;
  const dispatch = new RepairDispatchSystem(game);
  dispatch.register(tower);
  dispatch.register(base);
  const w1 = makeWorker('w1');
  const w2 = makeWorker('w2');
  const w3 = makeWorker('w3');
  const request = dispatch.pickFor(w1);
  assert.equal(request.id, 'base', '基地优先');
  assert.equal(dispatch.reserve(request, w1.id), true);
  assert.equal(dispatch.reserve(request, w2.id), true, '基地允许两名');
  assert.equal(dispatch.reserve(request, w3.id), false, '第三名被拒');
  const next = dispatch.pickFor(w3);
  assert.equal(next.id, 't1', '塔只有一个名额，基地满员后转向塔');
  assert.equal(dispatch.reserve(next, w3.id), true);
  assert.equal(dispatch.reserve(next, w1.id), false, '塔的第二名也被拒');
  // 释放后可以重新预留
  dispatch.release(next, w3.id);
  assert.equal(next.reservedWorkers.size, 0);
  assert.equal(dispatch.reserve(next, w1.id), true);
});

check('取料顺序：先自己的背包、再基地库存；两边都没有就转"待材料"', () => {
  const tower = makeBuilding('t1', { health: 40 });
  const game = makeGame([tower], { baseStock: {} });
  game.elapsedTime = 100;
  const dispatch = new RepairDispatchSystem(game);
  dispatch.register(tower);
  const request = dispatch.pickFor(makeWorker('w1'));
  const carrier = makeWorker('w1', { carry: { wood: 2 } });
  const fromCarry = dispatch.resolveRepairMaterial(carrier, request);
  assert.equal(fromCarry.ok, true);
  assert.equal(fromCarry.source, 'carry');
  assert.equal(carrier.inventory.countOf('wood'), 2, '背包取料不该被扣掉（结算时才扣）');

  const empty = makeWorker('w2');
  const none = dispatch.resolveRepairMaterial(empty, request);
  assert.equal(none.ok, false);
  assert.equal(none.reason, 'no_material');
  assert.equal(request.state, REPAIR_REQUEST_STATE.missingMaterial, '缺料要转成"待材料"');
  // 「缺材料」必须被汇总看见。旧行为是 summary() 把这个状态重新推导成 waiting，
  // 于是界面永远显示不出"缺材料"（byState 里也没有 missing_material），
  // 玩家只会看到工人闲着不修——这条断言以前写的是 0，等于把那个 bug 固定住了。
  const missingSummary = dispatch.summary();
  assert.equal(missingSummary.missingMaterial, 1, '缺材料要被 summary 统计');
  assert.equal(missingSummary.byState.missing_material, 1, '按状态分桶也要有 missing_material');
  // 但"缺材料"不等于永久死锁：补给回来以后必须能重新排队。
  assert.equal(dispatch.availableRequests().length, 0, '没料时不派活（允许傀儡转做别的）');
  game.baseInventory.add('wood', 1);
  assert.equal(dispatch.availableRequests().length, 1, '补给回来要重新可派');
  assert.equal(request.state, REPAIR_REQUEST_STATE.waiting, '恢复到"待维修"');
  // 还原成"基地也没料"的场景，让下面基地取料那一段的算术仍然成立
  game.baseInventory.remove('wood', 1);
  request.state = REPAIR_REQUEST_STATE.missingMaterial;

  // 基地有料：从基地领一份带到身上，傀儡真的背着它走
  game.baseInventory.add('wood', 3);
  const fromBase = dispatch.resolveRepairMaterial(empty, request);
  assert.equal(fromBase.ok, true);
  assert.equal(fromBase.source, 'base');
  assert.equal(game.baseInventory.countOf('wood'), 2, '基地库存真的少了一份');
  assert.equal(empty.inventory.countOf('wood'), 1, '材料进了傀儡背包');
});

check('结算：扣材料换有限修复量，生命与耐久都恢复，材料不足时不扣', () => {
  const tower = makeBuilding('t1', { type: 'shockTower', health: 40, durability: 100 });
  const game = makeGame([tower]);
  game.elapsedTime = 100;
  const dispatch = new RepairDispatchSystem(game);
  dispatch.register(tower);
  const request = dispatch.pickFor(makeWorker('w1'));
  const worker = makeWorker('w1', { carry: { stone: 4 } });
  const result = dispatch.applyRepairBatch(worker, request);
  assert.equal(result.ok, true);
  assert.equal(result.material, 'stone', '震荡塔是石结构');
  assert.ok(result.materials > 0 && result.materials <= BUILDING_REPAIR_RULES.maxMaterialsPerBatch);
  assert.equal(worker.inventory.countOf('stone'), 4 - result.materials, '材料必须真的被扣掉');
  assert.equal(tower.health, 40 + result.health);
  assert.equal(dispatch.stats.materialsSpent, result.materials);
  assert.equal(dispatch.stats.batches, 1);

  // 材料不足：状态转"待材料"，什么都不扣
  const broke = makeWorker('w2');
  tower.health = 40;
  const before = { health: tower.health, stone: broke.inventory.countOf('stone') };
  const failed = dispatch.applyRepairBatch(broke, request);
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'no_material');
  assert.equal(tower.health, before.health, '没材料不能白修');
  assert.equal(broke.inventory.countOf('stone'), before.stone);
  assert.equal(request.state, REPAIR_REQUEST_STATE.missingMaterial);
});

check('修满即清除：请求转 satisfied、预留归零、stats.satisfied 增加', () => {
  const tower = makeBuilding('t1', { health: 96 });
  const game = makeGame([tower]);
  game.elapsedTime = 100;
  const dispatch = new RepairDispatchSystem(game);
  dispatch.register(tower);
  const request = dispatch.pickFor(makeWorker('w1'));
  const worker = makeWorker('w1', { carry: { wood: 8 } });
  dispatch.reserve(request, worker.id);
  const result = dispatch.applyRepairBatch(worker, request);
  assert.equal(result.ok, true);
  assert.equal(result.health, 4, '缺口只有 4 点，一批只修 4 点（材料不浪费）');
  assert.equal(tower.health, 100, '修满');
  assert.equal(request.state, REPAIR_REQUEST_STATE.satisfied);
  assert.equal(request.reservedWorkers.size, 0, '修满要放掉预留');
  assert.ok(dispatch.stats.satisfied >= 1);
  // 修满之后请求必须从池子里消失：留着一个空请求只会让它每 0.5 秒被重新扫到
  assert.equal(dispatch.requests.size, 0);
  assert.equal(dispatch.requestFor('t1'), null);
  assert.deepEqual(dispatch.availableRequests(), []);
  // 再次采样也不会重新登记（满血）
  dispatch.sample();
  assert.equal(dispatch.requests.size, 0);
});

check('交战暂停：交战中不结算，保留实际已修的量，不站在炮火里修', () => {
  const tower = makeBuilding('t1', { health: 50 });
  const game = makeGame([tower]);
  game.elapsedTime = 100;
  const dispatch = new RepairDispatchSystem(game);
  dispatch.register(tower);
  // 先脱战修一批
  const request = dispatch.pickFor(makeWorker('w1'));
  assert.ok(request, '脱战状态下必须挑得到请求');
  const worker = makeWorker('w1', { carry: { wood: 4 } });
  const first = dispatch.applyRepairBatch(worker, request);
  assert.equal(first.ok, true);
  const healed = tower.health;
  assert.ok(healed > 50);
  // 重新交战：脱战窗口内不再派活，也不再结算
  tower.lastCombatAt = game.elapsedTime;
  assert.equal(dispatch.pickFor(worker), null, '交战中不该再派新活');
  const blocked = dispatch.applyRepairBatch(worker, request);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'in_combat');
  assert.equal(tower.health, healed, '交战中不能再修');
  assert.equal(request.state, REPAIR_REQUEST_STATE.pending);
  // 脱战后可以继续，且之前修的量还在
  game.elapsedTime += 9;
  const again = dispatch.applyRepairBatch(worker, request);
  assert.equal(again.ok, true);
  assert.ok(tower.health > healed, '脱战后继续修，之前修的没有回滚');
});

check('生命周期：建筑死亡 / 拆除 / 重开都不永久锁住请求与预留', () => {
  const tower = makeBuilding('t1', { health: 50 });
  const game = makeGame([tower]);
  game.elapsedTime = 100;
  const dispatch = new RepairDispatchSystem(game);
  dispatch.register(tower);
  const request = dispatch.pickFor(makeWorker('w1'));
  const worker = makeWorker('w1');
  dispatch.reserve(request, worker.id);
  // 建筑死亡
  tower.alive = false;
  dispatch.sample();
  assert.equal(dispatch.requests.size, 0, '死亡建筑必须清掉请求');
  assert.equal(dispatch.requestFor('t1'), null);
  // 建筑被拆（离开 buildings 集合）
  const tower2 = makeBuilding('t2', { health: 50 });
  game.buildings.buildings.add(tower2);
  dispatch.register(tower2);
  assert.equal(dispatch.requests.size, 1);
  game.buildings.buildings.delete(tower2);
  dispatch.sample();
  assert.equal(dispatch.requests.size, 0, '离开建筑集合的要清掉');
  // 傀儡死亡 / 取消任务：预留必须释放
  const tower3 = makeBuilding('t3', { health: 50 });
  game.buildings.buildings.add(tower3);
  const r3 = dispatch.register(tower3);
  dispatch.reserve(r3, worker.id);
  assert.equal(r3.reservedWorkers.size, 1);
  const released = dispatch.releaseWorkerEverywhere(worker.id);
  assert.equal(released, 1);
  assert.equal(r3.reservedWorkers.size, 0);
  assert.equal(r3.state, REPAIR_REQUEST_STATE.waiting);
  // reset
  dispatch.register(tower3);
  dispatch.reset();
  assert.equal(dispatch.requests.size, 0);
  assert.equal(dispatch.sampleTimer, 0);
});

check('采样只登记玩家已建成建筑：敌方 / 中立 / 巢穴不登记', () => {
  const own = makeBuilding('own', { health: 50 });
  const enemy = makeBuilding('enemy', { health: 50 });
  enemy.team = 'enemy';
  const nest = makeBuilding('nest', { health: 50, definition: { repairable: false } });
  const game = makeGame([own, enemy, nest]);
  const dispatch = new RepairDispatchSystem(game);
  dispatch.sample();
  assert.deepEqual([...dispatch.requests.keys()], ['own']);
});

check('自动维修可以关闭：关闭后不再登记新请求，已有请求也不再派活', () => {
  const tower = makeBuilding('t1', { health: 50 });
  const game = makeGame([tower]);
  const dispatch = new RepairDispatchSystem(game);
  game.autoBuildingRepair = false;
  dispatch.sample();
  assert.equal(dispatch.requests.size, 0);
  assert.equal(dispatch.enabled, false);
  assert.equal(dispatch.pickFor(makeWorker('w1')), null);
  game.autoBuildingRepair = true;
  dispatch.sample();
  assert.equal(dispatch.requests.size, 1);
});

check('有限频率采样：0.5 秒一次，不是每帧全量扫描', () => {
  const tower = makeBuilding('t1', { health: 50 });
  const game = makeGame([tower]);
  const dispatch = new RepairDispatchSystem(game);
  // 采样间隔从 rules 读（默认 0.5 秒）
  assert.ok(dispatch.rules.sampleSeconds >= 0.2 && dispatch.rules.sampleSeconds <= 1);
  dispatch.update(0.1);
  assert.equal(dispatch.requests.size, 1, '第一帧就走一次登记（启动时 sampleTimer 为 0）');
  // 0.5 秒内的连续帧不会再扫：手工清空请求，若扫描发生就会被重新登记
  dispatch.requests.clear();
  dispatch.update(0.1);
  dispatch.update(0.2);
  assert.equal(dispatch.requests.size, 0, '0.3 秒内不该再扫');
  dispatch.update(0.3);
  assert.equal(dispatch.requests.size, 1, '累计到 0.5 秒才再扫一遍');
});

check('配置化：改脱战秒数 / 每材料修复量后行为跟着变', () => {
  const tower = makeBuilding('t1', { health: 10, maxHealth: 100 });
  const game = makeGame([tower]);
  game.elapsedTime = 100;
  const dispatch = new RepairDispatchSystem(game, {
    rules: { healthPerMaterial: 2, maxMaterialsPerBatch: 1, outOfCombatSeconds: 3 }
  });
  dispatch.register(tower);
  const request = dispatch.pickFor(makeWorker('w1'));
  const worker = makeWorker('w1', { carry: { wood: 5 } });
  const result = dispatch.applyRepairBatch(worker, request);
  assert.equal(result.materials, 1);
  assert.equal(result.health, 2, '每材料 2 点，一批 1 个');
  // 默认规则没被就地改写
  assert.equal(BUILDING_REPAIR_RULES.healthPerMaterial, 8);
});

console.log(report.join('\n'));
console.log(`\n${report.filter((line) => line.startsWith('ok')).length}/${report.length} 通过`);
