// 基础拾荒点：极低效率的木材/石料恢复路径（资源续航的兜底）。
//
// 为什么必须有这一条（docs/DSH_RESOURCE_SUSTAINABILITY.md「防止真正的资源软锁」）：
// 如果玩家把木材、石料、树苗和最后一把镐一起耗光，就没有任何路径能重做工具或
// 补种树坑——"基地和工人活着，却永远没有任何资源恢复操作"是隐藏死局。
//
// 三条硬约束：
//   1. 产量压到正规链的十分之一以下：单次 3 份 / 90 秒，而一次采集动作 5 份 / 1~2 秒；
//   2. **场上存量有上限**（maxOnGround），堆满就停，不会被无限刷；
//   3. 必须由傀儡实际走到跟前捡走（走 GroundDropSystem 的既有拾取链），
//      不是给基地无条件加钱；不生成铁矿、魔核、口粮。
//
// 计时走模拟时间：Game.tick 在暂停时直接 return，所以暂停期间不产出。
// 掉落物用**稳定 id**，重载不会在同一处再发一次。
//
// 本文件还负责**建筑材料回收**（同文档「材料回收缓冲失误」）：主动拆除约 60%、
// 被打毁的残骸约 20%。纯规则（比例、按真实投入计算）在 systems/buildingRepair.js
// 的 RECYCLE_RULES / recycleRefundFor，这里只做运行时落地：最多结算一次、
// 返还物**落地成掉落物**（需拾取/搬运），不直接进基地库存。
import * as THREE from 'three';
import { SALVAGE_RULES } from '../data/gameData.js';
import { RECYCLE_RULES, recycleRatioFor, recycleRefundFor } from './buildingRepair.js';

export class SalvageSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = { ...SALVAGE_RULES, ...(options.rules ?? {}) };
    this.recycleRules = { ...RECYCLE_RULES, ...(options.recycleRules ?? {}) };
    /** @type {Map<string, object>} pointId → { point, timer, produced } */
    this.points = new Map();
    this.markers = [];
    this.stats = { events: 0, produced: 0, blocked: 0 };
    /** 建筑回收的吞吐统计：结算次数与累计返还材料（界面读这里，不另记一份） */
    this.recycleStats = { settled: 0, materials: 0, refused: 0, lastReason: 'none' };
    this.attach();
  }

  get enabled() {
    return this.rules.enabled !== false && (this.rules.points ?? []).length > 0;
  }

  /** 拾荒点位置要落到可走地面上，否则傀儡走不到、东西也捡不走。 */
  resolvePoint(point) {
    const game = this.game;
    if (!game) return null;
    const raw = { x: Number(point.x) || 0, z: Number(point.z) || 0 };
    const resolved = game.resolveWalkablePoint?.({ x: raw.x, z: raw.z }) ?? raw;
    return { x: resolved.x ?? raw.x, z: resolved.z ?? raw.z };
  }

  attach() {
    if (!this.enabled) return this;
    (this.rules.points ?? []).forEach((point) => {
      if (!point?.id) return;
      const spot = this.resolvePoint(point) ?? { x: 0, z: 0 };
      this.points.set(point.id, {
        point: { ...point, x: spot.x, z: spot.z },
        // 初始计时错开半个周期：两个点不会在同一秒一起冒东西
        timer: Math.max(5, (Number(this.rules.secondsPerEvent) || 90) * 0.5),
        produced: 0
      });
    });
    this.buildMarkers();
    return this;
  }

  /**
   * 场上的拾荒点标记。
   *
   * 用低多边形小石块/枯枝做标记，**不进寻路阻挡**（寻路阻挡只在资源节点里登记），
   * 所以它不会围着拾荒点造出一堵墙。共享几何体与材质，避免每点一份 GPU 资源。
   */
  buildMarkers() {
    const scene = this.game?.scene;
    if (!scene) return;
    this.markers.forEach((marker) => scene.remove(marker));
    this.markers = [];
    this.points.forEach((entry) => {
      const marker = this.createMarker(entry.point);
      if (!marker) return;
      this.markers.push(marker);
      scene.add(marker);
    });
  }

  createMarker(point) {
    const group = new THREE.Group();
    group.name = `SalvageMarker:${point.id}`;
    const y = this.game?.groundHeightAt?.({ x: point.x, z: point.z }) ?? 0;
    group.position.set(point.x, y, point.z);
    // 视觉只做"这里有个旧堆"的暗示：三块小石头 + 两根枝条，不抢资源节点辨识
    const stoneGeometry = new THREE.DodecahedronGeometry(0.22, 0);
    const woodGeometry = new THREE.BoxGeometry(0.09, 0.09, 0.72);
    const stoneMaterial = new THREE.MeshLambertMaterial({ color: '#8d8a80' });
    const woodMaterial = new THREE.MeshLambertMaterial({ color: '#6b4a30' });
    group.userData.salvageGeometries = [stoneGeometry, woodGeometry];
    group.userData.salvageMaterials = [stoneMaterial, woodMaterial];
    for (let i = 0; i < 3; i += 1) {
      const mesh = new THREE.Mesh(stoneGeometry, stoneMaterial);
      const angle = (i / 3) * Math.PI * 2;
      mesh.position.set(Math.cos(angle) * 0.42, 0.1, Math.sin(angle) * 0.42);
      mesh.scale.setScalar(0.7 + (i % 2) * 0.5);
      group.add(mesh);
    }
    for (let i = 0; i < 2; i += 1) {
      const mesh = new THREE.Mesh(woodGeometry, woodMaterial);
      mesh.position.set(-0.2 + i * 0.38, 0.06, 0.3 - i * 0.5);
      mesh.rotation.set(0, 0.7 + i * 0.9, Math.PI / 2.4);
      group.add(mesh);
    }
    group.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        node.layers.set(0);
      }
    });
    return group;
  }

  /** 某个拾荒点现在在地上堆了多少份。 */
  onGroundCount(entry) {
    const drops = this.game?.drops;
    if (!drops) return 0;
    let total = 0;
    // 掉落物 id 是稳定的：`salvage:<pointId>:<序号>`，所以这里按前缀数。
    (drops.drops?.() ?? []).forEach((drop) => {
      if (!String(drop.id ?? '').startsWith(`salvage:${entry.point.id}:`)) return;
      drop.stacks.forEach((stack) => {
        if (stack.itemId !== entry.point.kind) return;
        total += Math.max(0, Math.floor(stack.count ?? 0));
      });
    });
    return total;
  }

  update(dt) {
    if (!this.enabled || !this.points.size) return;
    const step = Math.max(0, Number(dt) || 0);
    if (step <= 0) return;
    const interval = Math.max(5, Number(this.rules.secondsPerEvent) || 90);
    this.points.forEach((entry) => {
      entry.timer -= step;
      if (entry.timer > 0) return;
      entry.timer = interval;
      this.emit(entry);
    });
  }

  emit(entry) {
    const drops = this.game?.drops;
    if (!drops?.spawnFromStacks) return false;
    const onGround = this.onGroundCount(entry);
    const cap = Math.max(0, Math.floor(Number(this.rules.maxOnGround) || 0));
    if (onGround >= cap) {
      // 堆满就停：不无限积累，也不每帧尝试
      this.stats.blocked += 1;
      return false;
    }
    const amount = Math.max(1, Math.min(
      Math.floor(Number(this.rules.producePerEvent) || 3),
      cap - onGround
    ));
    const index = (entry.produced + 1);
    const drop = drops.spawnFromStacks(
      [{ itemId: entry.point.kind, count: amount }],
      {
        dropId: `salvage:${entry.point.id}:${index}`,
        x: entry.point.x,
        z: entry.point.z
      }
    );
    if (!drop) return false;
    entry.produced += 1;
    this.stats.events += 1;
    this.stats.produced += amount;
    return true;
  }

  serialize() {
    return [...this.points.values()].map((entry) => ({
      pointId: entry.point.id,
      timer: entry.timer,
      produced: entry.produced
    }));
  }

  // -------------------------------------------------------------------
  // 建筑回收（材料回收缓冲失误）
  // -------------------------------------------------------------------

  /**
   * 这栋建筑能不能回收。
   *
   * 排除项都不是保守估计，而是设计文档点名的红线：
   *   - 初始基地：拆基地绕过败局规则，明确禁止；
   *   - 免费/奖励/初始对象：`paidInvestment` 为空 → 返不出没支付过的成本；
   *   - 敌方/中立建筑与刷怪巢穴：不是玩家造的，谈不上"回收投入"。
   */
  canRecycle(unit) {
    if (!unit || unit.alive === false || unit.isBuilding !== true) {
      return { ok: false, reason: 'not_building' };
    }
    if (unit.team !== 'player') return { ok: false, reason: 'not_player' };
    if (unit === this.game?.playerBase || unit.isPlayerBase === true || unit.isSpawnPointNest === true) {
      return { ok: false, reason: 'protected_structure' };
    }
    if (unit.recycleSettled === true) return { ok: false, reason: 'already_settled' };
    const paid = unit.paidInvestment ?? [];
    if (!paid.length) return { ok: false, reason: 'no_paid_investment' };
    return { ok: true, reason: 'none' };
  }

  /**
   * 结算一次回收。**最多一次**：一开始就打上 `recycleSettled`，
   * 后面无论死亡通知、重载还是重复事件都进不来。
   *
   * @param {object} unit
   * @param {number} healthRatio 结算时的生命比例（主动拆除传当前值，残骸传 0）
   */
  settleRecycle(unit, healthRatio = 1) {
    const allowed = this.canRecycle(unit);
    if (!allowed.ok) {
      this.recycleStats.refused += 1;
      this.recycleStats.lastReason = allowed.reason;
      return { ok: false, reason: allowed.reason, refunded: [] };
    }
    const ratio = recycleRatioFor(healthRatio, this.recycleRules);
    const refunded = recycleRefundFor({
      unitType: unit.type,
      healthRatio,
      paidInvestment: unit.paidInvestment,
      rules: this.recycleRules
    });
    // 先打标记再落地：`spawnFromStacks` 用稳定 id，即使被重复调用也只会返回同一堆。
    unit.recycleSettled = true;
    const position = unit.position ?? { x: 0, z: 0 };
    const drop = refunded.length
      ? this.game?.drops?.spawnFromStacks?.(refunded, {
        dropId: `recycle:${unit.id}`,
        x: position.x,
        z: position.z,
        ownerId: unit.controllerPlayerId ?? unit.ownerPlayerId ?? this.game?.localPlayerSlot ?? null
      }) ?? null
      : null;
    const materials = refunded.reduce((sum, entry) => sum + entry.count, 0);
    if (materials > 0) {
      this.recycleStats.settled += 1;
      this.recycleStats.materials += materials;
    }
    this.recycleStats.lastReason = 'none';
    return { ok: true, reason: 'none', ratio, refunded, materials, drop };
  }

  /**
   * 主动拆除。玩家在扇形菜单上点"拆除"时走这条。
   * 拆除前的生命比例决定返还比例（完好 60%，残骸 20%），拆除本身沿用既有死亡路径。
   */
  demolishBuilding(unit) {
    const allowed = this.canRecycle(unit);
    if (!allowed.ok) return { ok: false, reason: allowed.reason, refunded: [] };
    const maxHealth = Math.max(0, Number(unit.maxHealth) || 0);
    const healthRatio = maxHealth > 0 ? Math.max(0, Math.min(1, (unit.health ?? 0) / maxHealth)) : 0;
    const settled = this.settleRecycle(unit, healthRatio);
    if (!settled.ok) return settled;
    // 走既有死亡路径：清建筑集合、注销站点/运输线、关掉停在这栋建筑上的界面。
    // 回收已经打过标记，所以这里不会再结算第二份残骸。
    this.game?.handleUnitDeath?.(unit, null);
    this.game?.hints?.setHintOnce?.(
      `已拆除${unit.name ?? '建筑'}：回收 ${settled.refunded.map((entry) => `${entry.itemId}×${entry.count}`).join('、') || '无'}，落在地上需要傀儡搬运`,
      `demolish:${unit.id}`
    );
    return settled;
  }

  /** 被摧毁的残骸自动回收（由 Game.handleUnitDeath 调用）。 */
  settleWreck(unit) {
    if (!this.canRecycle(unit).ok) return null;
    // 残骸：生命归零，比例落到 wreckRatio（默认 20%）
    return this.settleRecycle(unit, 0);
  }

  /** 供界面显示的一句回收说明（比例随生命变化，读同一份规则）。 */
  recyclePreview(unit) {
    const allowed = this.canRecycle(unit);
    const maxHealth = Math.max(0, Number(unit?.maxHealth) || 0);
    const healthRatio = maxHealth > 0 ? Math.max(0, Math.min(1, (unit?.health ?? 0) / maxHealth)) : 0;
    const refunded = allowed.ok
      ? recycleRefundFor({
        unitType: unit.type,
        healthRatio,
        paidInvestment: unit.paidInvestment,
        rules: this.recycleRules
      })
      : [];
    return {
      ok: allowed.ok,
      reason: allowed.reason,
      healthRatio,
      ratio: recycleRatioFor(healthRatio, this.recycleRules),
      refunded
    };
  }

  summary() {
    const list = [...this.points.values()].map((entry) => ({
      pointId: entry.point.id,
      name: entry.point.name,
      kind: entry.point.kind,
      x: entry.point.x,
      z: entry.point.z,
      onGround: this.onGroundCount(entry),
      maxOnGround: this.rules.maxOnGround,
      produced: entry.produced
    }));
    return {
      enabled: this.enabled,
      points: list,
      stats: { ...this.stats },
      recycle: { ...this.recycleStats, rules: { ...this.recycleRules } }
    };
  }

  reset() {
    this.points.forEach((entry) => {
      entry.timer = Math.max(5, (Number(this.rules.secondsPerEvent) || 90) * 0.5);
      entry.produced = 0;
    });
    // 拾荒与回收的掉落物都清掉：重开不该把上一局的回收物留在场上。
    (this.game?.drops?.drops?.() ?? []).forEach((drop) => {
      const id = String(drop.id ?? '');
      if (!id.startsWith('salvage:') && !id.startsWith('recycle:')) return;
      this.game?.drops?.removeEntry?.(drop.id, 'salvage_reset');
    });
    this.recycleStats = { settled: 0, materials: 0, refused: 0, lastReason: 'none' };
    return true;
  }

  destroy() {
    const scene = this.game?.scene;
    this.markers.forEach((marker) => {
      scene?.remove?.(marker);
      marker.userData?.salvageGeometries?.forEach((geometry) => geometry.dispose?.());
      marker.userData?.salvageMaterials?.forEach((material) => material.dispose?.());
    });
    this.markers = [];
    this.points.clear();
  }
}
