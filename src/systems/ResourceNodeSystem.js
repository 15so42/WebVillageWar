// 资源节点的状态归属方。
//
// world 只负责把节点摆出来（模型 + 寻路阻挡）并给出句柄；这里负责「还剩多少」。
// 采空时通过 world.releaseResourceNode() 隐藏模型并解除阻挡，因此
// 「能看到的树」和「能采的树」始终是同一批。
//
// 采集产物目前先落在一个内部账本（bank）里：物品与库存系统（阶段 A）接入后
// 由库存接管，这里不做第二份所有权。
import {
  normalizeResourceNodeState,
  resolveHarvest,
  resourceAmountsByType,
  resourceItemId,
  resourceNodeDefinition,
  resourceNodeDisplayName,
  resourceNodeDistance,
  resourceNodeSurfaceDistance,
  resourceNodeIsDepleted,
  resourceNodeRequiredToolName,
  resourceNodeRules,
  resourceNodeToolSatisfied,
  resourceTypeName,
  serializeResourceNodeState,
  totalResourceAmount
} from './resources.js';
import {
  addToWorkerCargo,
  canAcceptInWorkerCargo,
  isWorkerInventory
} from './workerInventory.js';

export const RESOURCE_ERROR = {
  none: 'none',
  unknownNode: 'unknown_node',
  depleted: 'depleted',
  needsTool: 'needs_tool',
  outOfRange: 'out_of_range',
  noRequest: 'no_request',
  noCapacity: 'no_capacity'
};

export const RESOURCE_ERROR_LABELS = {
  [RESOURCE_ERROR.unknownNode]: '没有这个资源点',
  [RESOURCE_ERROR.depleted]: '这个资源点已经采空',
  [RESOURCE_ERROR.needsTool]: '需要工具才能采集',
  [RESOURCE_ERROR.outOfRange]: '离资源点太远',
  [RESOURCE_ERROR.noRequest]: '这次没有采到任何东西',
  [RESOURCE_ERROR.noCapacity]: '库存装不下这次采到的东西'
};

// 没有任何库存时的兜底落点：只记账，不设容量。
// 物品/库存系统接入后由 true 的 Inventory 顶替，避免出现两份所有权。
class BankDeposit {
  constructor() {
    this.counts = new Map();
  }

  canAccept(itemId, count) {
    return Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  }

  add(itemId, count) {
    const amount = Math.max(0, Math.floor(count));
    this.counts.set(itemId, (this.counts.get(itemId) ?? 0) + amount);
    return { ok: true, added: amount, remainder: 0 };
  }

  countOf(itemId) {
    return this.counts.get(itemId) ?? 0;
  }

  countsByItem() {
    return Object.fromEntries(this.counts.entries());
  }

  restore(counts) {
    this.counts = new Map(Object.entries(counts ?? {}));
  }
}

export class ResourceNodeSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = resourceNodeRules(options.rules);
    this.state = new Map();
    // 采集产物的落点。默认是只记账的内部账本；接上真正的库存后由库存持有，
    // 两者是互斥的，不会同时存在两份所有权。
    this.bankDeposit = new BankDeposit();
    this.depositTarget = options.depositTarget ?? this.bankDeposit;
    this.world = null;
    this.stats = { harvested: 0, depleted: 0, rejected: 0 };
  }

  // 换上真正的库存容器（需要实现 canAccept / add / countOf / countsByItem）。
  setDepositTarget(target) {
    this.depositTarget = target ?? this.bankDeposit;
    return this;
  }

  usesInternalBank() {
    return this.depositTarget === this.bankDeposit;
  }

  // 还能把多少资源放进落点。采集前先问，避免「从树上扣下来了但装不进去」。
  // target 可覆盖默认落点：傀儡采集时产物先进它自己的背包，由 WorkSystem 再运回基地。
  depositRoom(resourceId, count, target = null) {
    const itemId = resourceItemId(resourceId) ?? resourceId;
    const destination = target ?? this.depositTarget;
    if (isWorkerInventory(destination)) {
      return Math.max(0, Math.floor(canAcceptInWorkerCargo(destination, itemId, count) ?? 0));
    }
    return Math.max(0, Math.floor(destination?.canAccept?.(itemId, count) ?? 0));
  }

  attach(world) {
    this.world = world ?? null;
    this.state.clear();
    (world?.resourceNodes ?? []).forEach((node) => {
      if (!node?.id) return;
      this.state.set(node.id, normalizeResourceNodeState(node, node));
      const entry = this.state.get(node.id);
      entry.handle = node;
      const root = node?.object;
      if (root) root.userData.resourceNodeId = node.id;
    });
    return this;
  }

  nodeById(nodeId) {
    return this.state.get(nodeId) ?? null;
  }

  /**
   * 登记一个**运行时新增**的节点（树坑长成的树）。
   * 它和 build 时铺下的节点走完全相同的状态结构，所以采集、采空释放、
   * 工具判定、副产物都自动适用；这里只是把它加进状态表。
   */
  registerSpawnedNode(node) {
    if (!node?.id || this.state.has(node.id)) return null;
    const entry = normalizeResourceNodeState(node, node);
    entry.handle = node;
    const root = node?.object;
    if (root) root.userData.resourceNodeId = node.id;
    this.state.set(node.id, entry);
    return entry;
  }

  allNodes() {
    return [...this.state.values()];
  }

  nodesForResource(resourceId) {
    return this.allNodes().filter((node) => node.resource === resourceId);
  }

  // 还能采的节点（已采空的不返回，调用方不需要自己过滤）
  activeNodes() {
    return this.allNodes().filter((node) => !resourceNodeIsDepleted(node));
  }

  definitionOf(node) {
    return resourceNodeDefinition(node?.definitionId);
  }

  displayName(node) {
    return resourceNodeDisplayName(node?.definitionId);
  }

  // 判断能不能采：不修改任何状态，供 UI 提前标出「缺工具 / 太远 / 已采空」。
  canHarvest(nodeId, { toolIds = null, position = null } = {}) {
    const node = this.nodeById(nodeId);
    if (!node) return { ok: false, error: RESOURCE_ERROR.unknownNode };
    if (node.released || resourceNodeIsDepleted(node)) {
      return { ok: false, error: RESOURCE_ERROR.depleted };
    }
    if (!resourceNodeToolSatisfied(node.definitionId, toolIds)) {
      return {
        ok: false,
        error: RESOURCE_ERROR.needsTool,
        requiredTool: node.definitionId ? resourceNodeRequiredToolName(node.definitionId) : null
      };
    }
    if (position && resourceNodeSurfaceDistance(node, position) > this.rules.harvestRange) {
      return { ok: false, error: RESOURCE_ERROR.outOfRange };
    }
    return { ok: true, error: RESOURCE_ERROR.none };
  }

  // 采集一次。没有工具 / 已采空 / 太远 / 装不下都返回明确错误，而不是静默产出 0。
  // depositTarget 可以让这一次采集的产物落到别的容器（傀儡背包），
  // 但容量检查与「装不下就不扣节点」的规则完全一致。
  harvest(nodeId, { amount = null, toolIds = null, position = null, depositTarget = null } = {}) {
    const check = this.canHarvest(nodeId, { toolIds, position });
    if (!check.ok) {
      this.stats.rejected += 1;
      return { ok: false, error: check.error, requiredTool: check.requiredTool ?? null, taken: 0 };
    }
    const node = this.nodeById(nodeId);
    const wanted = resolveHarvest(node, amount ?? this.rules.harvestPerAction, this.rules);
    if (wanted.taken <= 0) {
      this.stats.rejected += 1;
      return { ok: false, error: RESOURCE_ERROR.noRequest, taken: 0 };
    }
    // 先问落点能不能装下：装不下的部分留在节点上，不能先扣树上的量再发现放不进背包
    const destination = depositTarget ?? this.depositTarget;
    const room = this.depositRoom(node.resource, wanted.taken, destination);
    const taken = Math.min(wanted.taken, room);
    if (taken <= 0) {
      this.stats.rejected += 1;
      return { ok: false, error: RESOURCE_ERROR.noCapacity, taken: 0 };
    }
    const itemId = resourceItemId(node.resource) ?? node.resource;
    const deposited = isWorkerInventory(destination)
      ? addToWorkerCargo(destination, itemId, taken, { allowPartial: true })
      : destination.add(itemId, taken, { allowPartial: true });
    const actuallyStored = Math.min(taken, deposited?.added ?? 0);
    if (actuallyStored <= 0) {
      this.stats.rejected += 1;
      return { ok: false, error: RESOURCE_ERROR.noCapacity, taken: 0 };
    }
    node.amount -= actuallyStored;
    node.harvestedTotal = (node.harvestedTotal ?? 0) + actuallyStored;
    this.stats.harvested += actuallyStored;
    // 副产物（砍树掉树苗）：按**累计采出量**跨过几个 N 来发，而不是随机掉。
    // 随机会让"种植链能不能自持"变成看运气，而方案第 9 节要求净产出是可核对的。
    const byproduct = this.byproductFor(node);
    let byproductGiven = 0;
    if (byproduct) {
      const already = Math.floor((node.harvestedTotal - actuallyStored) / byproduct.perAmount);
      const now = Math.floor(node.harvestedTotal / byproduct.perAmount);
      const available = Math.max(0, (byproduct.maxPerNode ?? Infinity) - (node.byproductGiven ?? 0));
      byproductGiven = Math.max(0, Math.min(now - already, available));
      if (byproductGiven > 0) {
        // 副产物放进同一个落点；装不下就**不发**（并发出去的不能凭空多出来），
        // 但不回滚主产物：主产物已经确定能装下。
        const result = destination.add(byproduct.itemId, byproductGiven, { allowPartial: true });
        byproductGiven = Math.min(byproductGiven, result?.added ?? 0);
        node.byproductGiven = (node.byproductGiven ?? 0) + byproductGiven;
      }
    }
    const depleted = node.amount <= 0;
    if (depleted) {
      this.stats.depleted += 1;
      this.release(nodeId);
    }
    return {
      ok: true,
      error: RESOURCE_ERROR.none,
      resource: node.resource,
      itemId,
      resourceName: resourceTypeName(node.resource),
      taken: actuallyStored,
      remaining: node.amount,
      depleted,
      byproduct: byproductGiven > 0
        ? { itemId: byproduct.itemId, count: byproductGiven }
        : null
    };
  }

  /**
   * 这个节点的副产物定义（从节点定义里取）。节点状态里没带定义时安静返回 null——
   * 副产物是附加产出，取不到不该让采集本身失败。
   */
  byproductFor(node) {
    const definition = this.definitionOf(node);
    const byproduct = definition?.byproduct;
    if (!byproduct?.itemId) return null;
    const perAmount = Math.floor(Number(byproduct.perAmount));
    if (!Number.isFinite(perAmount) || perAmount <= 0) return null;
    return {
      itemId: String(byproduct.itemId),
      perAmount,
      maxPerNode: Number.isFinite(Number(byproduct.maxPerNode))
        ? Math.max(0, Math.floor(Number(byproduct.maxPerNode)))
        : Infinity
    };
  }

  // 采空：隐藏模型 + 解除寻路阻挡并重采样那一小片网格。
  // 已经释放过的节点重复调用是安全的（不会重复掉落、不会重复统计）。
  release(nodeId) {
    const node = this.nodeById(nodeId);
    if (!node || node.released) return false;
    node.released = true;
    const handle = node.handle;
    if (handle && !handle.released) {
      this.world?.releaseResourceNode?.(nodeId);
    }
    return true;
  }

  bankAmount(resourceId) {
    const itemId = resourceItemId(resourceId) ?? resourceId;
    return this.depositTarget?.countOf?.(itemId) ?? 0;
  }

  bankSnapshot() {
    return this.depositTarget?.countsByItem?.() ?? {};
  }

  totals() {
    const nodes = this.allNodes();
    return {
      remaining: resourceAmountsByType(nodes),
      remainingTotal: totalResourceAmount(nodes),
      harvestedTotal: this.stats.harvested,
      activeNodes: this.activeNodes().length,
      nodes: nodes.length,
      depletedNodes: nodes.filter((node) => node.released).length
    };
  }

  serializeForSlot() {
    const payload = { nodes: this.allNodes().map(serializeResourceNodeState) };
    // 只有内部账本才随资源系统一起序列化；真正的库存有自己的存档路径，
    // 两边都存会让「谁拥有这批资源」出现两个答案。
    if (this.usesInternalBank()) payload.bank = this.bankDeposit.countsByItem();
    return payload;
  }

  // 联机/存档恢复：只接受已知节点的状态，未知 ID 忽略而不是凭空新建。
  applySnapshot(snapshot) {
    if (!snapshot) return false;
    (snapshot.nodes ?? []).forEach((raw) => {
      const node = this.nodeById(raw?.id);
      if (!node) return;
      const normalized = normalizeResourceNodeState(raw, node);
      node.amount = normalized.amount;
      node.maxAmount = normalized.maxAmount;
      // 副产物计数也要恢复：只恢复剩余量的话，重载之后一棵"已经砍掉一半"的树
      // 会把已经发过的树苗再发一遍，而且能突破 maxPerNode 的上限。
      node.harvestedTotal = normalized.harvestedTotal;
      node.byproductGiven = normalized.byproductGiven;
      // 注意先别写 released：release() 自己会用这个标记去重，
      // 提前置 true 会让它误判成「已经释放过」而跳过模型与阻挡的清理。
      if (normalized.released) this.release(node.id);
      else node.released = false;
    });
    if (snapshot.bank && this.usesInternalBank()) {
      this.bankDeposit.restore(snapshot.bank);
    }
    return true;
  }
}
