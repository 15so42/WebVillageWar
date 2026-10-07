// 树坑与种植的运行时。
//
// 一个回合：消耗树苗 → 等待生长 → 在坑边**生成一棵真实的资源节点** → 傀儡照常去砍
// → 砍完（节点被 release）坑自动回到空地、等下一棵苗补种。
//
// 为什么长出来的必须是真实资源节点，而不是"树坑自己按周期吐木材"：
//   - 方案第 9 节写的是「种植、等待生长、**砍伐**」——砍伐要由傀儡去做，
//     这样搬运、工具（斧子）、寻路、掉落这些既有链路全都自动复用；
//   - 如果树坑自己吐木材，就等于绕过傀儡与搬运，把那套物流架空成一个数字转换器。
//
// 落地位置：长成的树**不在坑的正中心**，而是坑边找一块可走的空地。
// 两个原因：一是坑自己已经登记了寻路阻挡，同一位置再叠一个阻挡会在 release 时互相影响；
// 二是视觉上"坑旁边长出一棵树"更自然。
import {
  PLANTING_STATE,
  advanceGrowth,
  canPlant,
  growthRatio,
  normalizePlantingConfig,
  plantingConfigForUnitType
} from './planting.js';

export class PlantingSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = options.rules ?? {};
    /** @type {Map<number, object>} unitId → { unit, config, state, progress, nodeId, offsetIndex } */
    this.plots = new Map();
    this.stats = { registered: 0, planted: 0, grown: 0, harvested: 0 };
  }

  registerPlot(unit, { config = null } = {}) {
    if (!unit?.id) return null;
    const resolved = normalizePlantingConfig(config) ?? plantingConfigForUnitType(unit.type);
    if (!resolved) return null;
    const record = {
      unit,
      config: resolved,
      state: PLANTING_STATE.empty,
      progress: 0,
      nodeId: null,
      offsetIndex: 0
    };
    this.plots.set(unit.id, record);
    this.stats.registered += 1;
    return record;
  }

  unregisterPlot(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    return this.plots.delete(unitId);
  }

  statusOf(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    const record = this.plots.get(unitId);
    if (!record) return null;
    return {
      unitId: record.unit.id,
      configId: record.config.id,
      state: record.state,
      progress: record.progress,
      growthSeconds: record.config.growthSeconds,
      ratio: growthRatio(record.progress, record.config.growthSeconds),
      nodeId: record.nodeId,
      saplingItemId: record.config.saplingItemId
    };
  }

  /** 统计一个坑当前养着几棵活着的树。 */
  grownNodeCount(record) {
    if (!record.nodeId) return 0;
    const node = this.game?.resourceNodes?.nodeById?.(record.nodeId) ?? null;
    if (!node || node.released) return 0;
    return 1;
  }

  update(dt) {
    if (!this.plots.size) return;
    this.plots.forEach((record, unitId) => {
      const unit = record.unit;
      if (!unit?.alive) {
        this.unregisterPlot(unitId);
        return;
      }
      // 建造还没完成就先不种：树坑自己是工地的时候长树很怪
      if (unit.underConstruction === true) return;
      this.tickPlot(record, dt);
    });
  }

  tickPlot(record, dt) {
    const { config } = record;

    if (record.state === PLANTING_STATE.grown) {
      // 看那棵树还在不在：采空会被 release，这里据此回到空地状态
      const node = this.game.resourceNodes?.nodeById?.(record.nodeId) ?? null;
      if (!node || node.released) {
        this.stats.harvested += 1;
        record.state = PLANTING_STATE.empty;
        record.progress = 0;
        record.nodeId = null;
        this.syncPlotVisual(record);
      }
      return;
    }

    if (record.state === PLANTING_STATE.growing) {
      const step = advanceGrowth({
        progress: record.progress,
        dt,
        growthSeconds: config.growthSeconds
      });
      record.progress = step.progress;
      this.syncPlotVisual(record);
      if (step.grown) this.completeGrowth(record);
      return;
    }

    // 空地：看看能不能补种
    this.tryPlant(record);
  }

  /** 有苗就种。保留量由 planting.js 的 canPlant 判定，这里不重复规则。 */
  tryPlant(record) {
    const game = this.game;
    const inventory = game?.baseInventory;
    if (!inventory) return { ok: false, reason: 'no_inventory' };
    const check = canPlant(record.config, {
      saplings: record.config.saplingItemId ? inventory.countOf(record.config.saplingItemId) : 0,
      grownNodes: this.grownNodeCount(record),
      state: record.state
    });
    if (!check.ok) return check;
    // 菜圃这类不需要种子的地块：`saplingItemId` 为 null 时整段扣费跳过，
    // 而不是去 remove(null, 0)——那会在库存里制造一条无名条目。
    if (record.config.saplingItemId && record.config.saplingCost > 0) {
      const spent = inventory.remove(record.config.saplingItemId, record.config.saplingCost);
      if (!spent.ok) return { ok: false, reason: 'no_sapling' };
    }
    record.state = PLANTING_STATE.growing;
    record.progress = 0;
    this.stats.planted += 1;
    this.syncPlotVisual(record);
    game.baseStorage?.markDirty?.();
    game.hints?.setHintOnce?.(
      record.config.saplingItemId
        ? `${record.config.name}已种下树苗，约 ${Math.round(record.config.growthSeconds)} 秒后长成`
        : `${record.config.name}已播种，约 ${Math.round(record.config.growthSeconds)} 秒后成熟`,
      `plant:${record.unit.id}`
    );
    return { ok: true };
  }

  /** 长成：在坑边找一块空地生成真实的资源节点。 */
  completeGrowth(record) {
    const game = this.game;
    const unit = record.unit;
    const spot = this.findSpawnSpot(record);
    if (!spot) {
      // 找不到地儿就先留在"长成"状态，下一帧再试（不消耗任何东西）
      record.state = PLANTING_STATE.grown;
      record.nodeId = null;
      return null;
    }
    const node = game.world?.spawnResourceNode?.(record.config.nodeDefinitionId, spot.x, spot.z) ?? null;
    if (!node) {
      record.state = PLANTING_STATE.grown;
      record.nodeId = null;
      return null;
    }
    game.resourceNodes?.registerSpawnedNode?.(node);
    record.state = PLANTING_STATE.grown;
    record.nodeId = node.id;
    record.offsetIndex += 1;
    this.stats.grown += 1;
    this.syncPlotVisual(record);
    game.hints?.setHintOnce?.(
      `${record.config.name}长出了一棵${node.definitionId === 'oak' ? '橡树' : '树'}，可以派人去砍了`,
      `grow:${unit.id}`
    );
    return node;
  }

  /**
   * 在坑边找一个能放树的位置。
   * 按固定角度序列依次试（每次长成换一个角度），要求：地面可走、离坑不超过 spawnRadius、
   * 不压在别的资源节点上。找不到就返回 null，调用方下一帧再试。
   */
  findSpawnSpot(record) {
    const game = this.game;
    const unit = record.unit;
    const world = game.world;
    if (!world?.isWalkable || !unit?.position) return null;
    const baseAngle = (record.offsetIndex * 1.9) % (Math.PI * 2);
    const nodes = game.resourceNodes?.allNodes?.() ?? [];
    for (let step = 0; step < 12; step += 1) {
      const angle = baseAngle + (step / 12) * Math.PI * 2;
      for (const radius of [record.config.spawnRadius, record.config.spawnRadius * 0.72, record.config.spawnRadius * 1.15]) {
        const x = unit.position.x + Math.cos(angle) * radius;
        const z = unit.position.z + Math.sin(angle) * radius;
        if (!world.isWalkable(x, z)) continue;
        const crowded = nodes.some((node) => (
          !node.released && Math.hypot(node.x - x, node.z - z) < 1.8
        ));
        if (crowded) continue;
        return { x, z };
      }
    }
    return null;
  }

  /**
   * 视觉：坑里的树苗随生长放大；长成之后坑自己不长东西（树是真实节点）。
   * 找不到模型部件时安静跳过——视觉不该让逻辑报错。
   *
   * **只改节点是不够的**：`visualRegistry.resetAnimatedParts()` 每帧会把部件的
   * 位置/旋转/缩放/可见性恢复成建模时捕获的 `userData.bindPose`，
   * 所以直接 `sapling.visible = true` 会在同一帧的后面被还原，
   * 表现为"树苗永远不出现、也不长大"（这一条花了整整一轮才查出来）。
   * 要改的是**静息姿态本身**。
   */
  syncPlotVisual(record) {
    // 部件挂在 `visualRoot`（createUnitModel 的产物）上，不是 `mesh`（单位自己的 Group）。
    const parts = record.unit?.visualRoot?.userData?.parts ?? record.unit?.mesh?.userData?.parts;
    const sapling = parts?.pitSapling;
    if (!sapling) return;
    const ratio = growthRatio(record.progress, record.config.growthSeconds);
    const growing = record.state === PLANTING_STATE.growing;
    const scale = growing ? 0.32 + ratio * 0.68 : 1;
    this.applyPartPose(sapling, { visible: growing, scale });
  }

  /** 同时改节点与它的静息姿态，否则下一帧就会被 resetAnimatedParts 还原。 */
  applyPartPose(part, { visible, scale = null } = {}) {
    if (!part) return false;
    if (typeof visible === 'boolean') part.visible = visible;
    if (Number.isFinite(scale)) part.scale.set(scale, scale, scale);
    const bindPose = part.userData?.bindPose;
    if (bindPose) {
      if (typeof visible === 'boolean') bindPose.visible = visible;
      if (Number.isFinite(scale)) bindPose.scale.set(scale, scale, scale);
    }
    return true;
  }

  serialize() {
    return [...this.plots.values()].map((record) => ({
      unitId: record.unit.id,
      configId: record.config.id,
      state: record.state,
      progress: record.progress,
      nodeId: record.nodeId
    }));
  }
}
