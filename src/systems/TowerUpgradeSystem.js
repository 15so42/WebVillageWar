// 防御终端升级：原地施工、交战暂停、材料原子结算。
//
// 设计约束（docs/DSH_DEFENSE_SURVIVAL_DESIGN.md 第一节）：
//   1. 升级在**同一建筑原地**进行，不让玩家拆塔重放；
//   2. 不制造"瞬间满血、回满耐久或免费供能"漏洞：完成时保留升级开始时
//      生命/耐久/活动魔力的**绝对值**，只夹到新上限内；新增容量不会自动填满；
//   3. 材料原子扣除、不能跳级、不能重复付费或重复叠加；
//   4. 有短施工时间，期间该塔停火；**被攻击则暂停施工**，不能把升级当战斗中的免费治疗；
//   5. 取消/摧毁沿既有建设规则结算（材料退还），不另发明一套退款。
//
// 升级通过**替换单位类型**实现（arrowTower → arrowTowerII）。理由：
// 属性来源唯一、可快照、可重载，且不用改共享单位定义去升级某一栋塔。
// 生命周期由 UnitRegistry 管，所以这里手动搬移注册表里的实例。
import {
  TIER3_ROUTE_BY_TOWER,
  TIER3_ROUTE_LABELS,
  TOWER_TIER_LABELS,
  TOWER_UPGRADE_SECONDS,
  UPGRADE_ERROR,
  UPGRADE_ERROR_LABELS,
  canUpgradeTower,
  investedCostFor,
  missingUpgradeInputs,
  towerIdentityFor,
  towerRoleInfoFor,
  towerUnitTypeFor,
  upgradeCarryOver,
  upgradeCostFor
} from '../data/defenseTiers.js';
import { FACILITY_CONFIGS, UNIT_DEFINITIONS } from '../data/gameData.js';

export class TowerUpgradeSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = { seconds: TOWER_UPGRADE_SECONDS, ...(options.rules ?? {}) };
    /** @type {Map<number, object>} unitId → { unit, towerId, fromTier, toTier, cost, progress, blocked } */
    this.jobs = new Map();
    this.stats = { started: 0, completed: 0, cancelled: 0, pauses: 0, refused: 0 };
  }

  /** 完工的科研站：二级与三级的共同资格。 */
  hasResearchStation() {
    return (this.game?.friendlyUnits ?? []).some((unit) => (
      unit?.alive
      && unit.type === 'researchStation'
      && unit.underConstruction !== true
    ));
  }

  /** 对应路线是否全线清除（三级资格）。 */
  routeClearedFor(towerId) {
    const route = TIER3_ROUTE_BY_TOWER[towerId] ?? null;
    if (!route) return false;
    const expeditions = this.game?.expeditions ?? null;
    if (expeditions?.isRouteCleared) return expeditions.isRouteCleared(route) === true;
    const brief = expeditions?.briefById?.(route) ?? null;
    if (brief) return brief.stage === 'cleared';
    // 拿不到远征口径时退回"这条线上的巢穴是否全部清除"，
    // 判据仍然只有一份权威：spawnPoints 的 cleared 事实。
    const points = this.game?.spawnPoints?.points ?? [];
    const routeNestIds = {
      east: ['island-east-cape', 'island-outer-east'],
      north: ['island-camp-north', 'island-outer-north'],
      south: ['island-south-woods', 'island-outer-southwest']
    }[route] ?? [];
    if (!routeNestIds.length) return false;
    return routeNestIds.every((nestId) => (
      points.find((point) => point.id === nestId)?.cleared === true
    ));
  }

  jobFor(unitOrId) {
    const unitId = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
    if (unitId === null || unitId === undefined) return null;
    return this.jobs.get(unitId) ?? null;
  }

  isUpgrading(unitOrId) {
    return this.jobFor(unitOrId) !== null;
  }

  /** 这栋塔当前的实际等级。 */
  tierOf(unit) {
    return towerIdentityFor(unit?.type)?.tier ?? 0;
  }

  /**
   * 升级资格 + 材料检查（只读，不扣费）。
   * `label` 可以直接显示给玩家。
   */
  upgradeStatus(unit) {
    const identity = towerIdentityFor(unit?.type);
    if (!identity) {
      return { ok: false, reason: UPGRADE_ERROR.notTower, label: UPGRADE_ERROR_LABELS[UPGRADE_ERROR.notTower] };
    }
    const targetTier = identity.tier + 1;
    const check = canUpgradeTower({
      unitType: unit.type,
      targetTier,
      hasResearch: this.hasResearchStation(),
      routeCleared: this.routeClearedFor(identity.towerId),
      underConstruction: unit.underConstruction === true,
      alive: unit.alive !== false,
      upgrading: this.isUpgrading(unit)
    });
    if (!check.ok) return check;
    const stock = this.game?.baseInventory ?? null;
    const missing = missingUpgradeInputs(check.cost, (itemId) => stock?.countOf?.(itemId) ?? 0);
    if (missing.length) {
      return {
        ...check,
        ok: false,
        reason: UPGRADE_ERROR.missingMaterials,
        label: `缺少${missing.map((entry) => `${entry.itemId}×${entry.missing}`).join('、')}`,
        missing
      };
    }
    return { ...check, missing: [] };
  }

  /**
   * 开始升级。**先扣材料**（原子），成功后才进入施工。
   * 失败时什么都不扣。
   */
  beginUpgrade(unit) {
    const status = this.upgradeStatus(unit);
    if (!status.ok) {
      this.stats.refused += 1;
      this.game?.hints?.setHintOnce?.(`不能升级：${status.label}`, `tower-upgrade:${unit?.id}`);
      return status;
    }
    const stock = this.game?.baseInventory;
    if (!stock) return { ok: false, reason: UPGRADE_ERROR.missingMaterials, label: '没有库存' };
    // 原子扣费：整笔先验证再扣，任何一项不够就整笔失败。
    const missing = missingUpgradeInputs(status.cost, (itemId) => stock.countOf(itemId));
    if (missing.length) {
      this.stats.refused += 1;
      return {
        ok: false,
        reason: UPGRADE_ERROR.missingMaterials,
        label: `缺少${missing.map((entry) => `${entry.itemId}×${entry.missing}`).join('、')}`,
        missing
      };
    }
    const spent = [];
    for (const entry of status.cost) {
      const removed = stock.remove(entry.itemId, entry.count);
      if (!removed?.ok) {
        // 理论上不可达（刚验证过），但真发生了就把已扣的还回去，绝不留半笔账。
        spent.forEach((paid) => stock.add(paid.itemId, paid.count));
        return { ok: false, reason: UPGRADE_ERROR.missingMaterials, label: '扣费失败' };
      }
      spent.push(entry);
    }
    const job = {
      unit,
      towerId: status.towerId,
      fromTier: status.fromTier,
      toTier: status.toTier,
      cost: status.cost.map((entry) => ({ ...entry })),
      progress: 0,
      blocked: false,
      // 升级开始时把绝对值记下来：完成时按这三项还原（只夹到新上限内）
      carried: {
        health: unit.health,
        durability: unit.weapon?.durability ?? 0,
        activityMana: unit.activityMana ?? 0
      },
      startedAt: this.game?.elapsedTime ?? 0
    };
    this.jobs.set(unit.id, job);
    // 施工期间停火：控制模式切到 hold，并把攻击计时器顶住。
    unit.towerUpgrading = true;
    unit.controlMode = 'hold';
    unit.target = null;
    unit.attackTimer = Math.max(unit.attackTimer ?? 0, this.rules.seconds);
    this.stats.started += 1;
    this.game?.effects?.spawnRing?.(unit.position, '#ffe9a8', 1.2, 0.7);
    this.game?.hints?.setHintOnce?.(
      `${UNIT_DEFINITIONS[unit.type]?.name ?? '防御终端'}开始升级施工，${Math.round(this.rules.seconds)} 秒后完工（交战中会暂停）`,
      `tower-upgrade:${unit.id}`
    );
    this.game?.baseStorage?.markDirty?.();
    return { ...status, ok: true, job };
  }

  /** 取消升级：材料按**未施工**全额退回（沿既有退款语义：没用到就还回来）。 */
  cancelUpgrade(unitOrId, { refund = true } = {}) {
    const job = this.jobFor(unitOrId);
    if (!job) return { ok: false, reason: 'no_job' };
    this.jobs.delete(job.unit.id);
    job.unit.towerUpgrading = false;
    job.unit.controlMode = 'normal';
    if (refund) {
      const stock = this.game?.baseInventory;
      job.cost.forEach((entry) => stock?.add?.(entry.itemId, entry.count));
      this.game?.baseStorage?.markDirty?.();
    }
    this.stats.cancelled += 1;
    return { ok: true, refunded: refund ? job.cost : [] };
  }

  /** 每帧推进施工。被攻击（交战窗口内）就暂停，进度保留。 */
  update(dt) {
    if (!this.jobs.size) return;
    const step = Math.max(0, Number(dt) || 0);
    const seconds = Math.max(0.5, Number(this.rules.seconds) || TOWER_UPGRADE_SECONDS);
    const outOfCombat = this.game?.repairDispatch?.rules?.outOfCombatSeconds ?? 8;
    const now = this.game?.elapsedTime ?? 0;
    [...this.jobs.values()].forEach((job) => {
      const unit = job.unit;
      if (!unit || unit.alive === false) {
        // 施工中被摧毁：材料不退（已经花掉了），请求也要清干净。
        this.jobs.delete(job.unit?.id ?? job.unitId);
        this.stats.cancelled += 1;
        return;
      }
      if (unit.underConstruction === true) return;
      const lastCombatAt = Number(unit.lastCombatAt);
      const inCombat = Number.isFinite(lastCombatAt) && (now - lastCombatAt) < outOfCombat;
      if (inCombat) {
        if (!job.blocked) this.stats.pauses += 1;
        job.blocked = true;
        unit.towerUpgradeProgress = job.progress / seconds;
        return;
      }
      job.blocked = false;
      job.progress += step;
      unit.towerUpgradeProgress = Math.min(1, job.progress / seconds);
      if (job.progress >= seconds) this.completeUpgrade(job);
    });
  }

  /**
   * 完工：替换单位类型，并保留升级开始时记录的绝对值。
   *
   * 为什么是"替换类型"而不是改属性：属性来源必须唯一、可快照、可重载。
   * 直接在一栋塔上叠加修正，重载或重复刷新就会叠乘（设计文档明确禁止）。
   */
  completeUpgrade(job) {
    const unit = job.unit;
    this.jobs.delete(unit.id);
    const nextType = towerUnitTypeFor(job.towerId, job.toTier);
    const nextDefinition = UNIT_DEFINITIONS[nextType];
    const previousType = unit.type;
    if (!nextDefinition) {
      // 目标定义缺失：把材料还回来，别让玩家白花一笔
      job.cost.forEach((entry) => this.game?.baseInventory?.add?.(entry.itemId, entry.count));
      this.stats.cancelled += 1;
      return { ok: false, reason: 'missing_definition' };
    }

    // 记录"实际投入"：三级回收按它算，不凭等级猜一份资源。
    const paid = new Map((unit.paidInvestment ?? []).map((entry) => [entry.itemId, entry.count]));
    job.cost.forEach((entry) => paid.set(entry.itemId, (paid.get(entry.itemId) ?? 0) + entry.count));

    unit.type = nextType;
    unit.definition = nextDefinition;
    unit.name = nextDefinition.name;
    unit.defenseTowerId = job.towerId;
    unit.defenseTowerTier = job.toTier;
    unit.paidInvestment = [...paid.entries()].map(([itemId, count]) => ({ itemId, count }));
    // 属性基础值换成新一级的数值；加成项不动（科技/等级修正由各自 source 持有）。
    unit.attributes?.setBase?.('maxHealth', nextDefinition.maxHealth, { min: 1 });
    unit.attributes?.setBase?.('attackRange', nextDefinition.attackRange, { min: 0 });
    unit.attributes?.setBase?.(
      nextDefinition.attackDamageType === 'magic' ? 'magicAttack' : 'physicalAttack',
      nextDefinition.damage,
      { min: 0 }
    );
    unit.attributes?.setBase?.('attackRate', nextDefinition.attackRate, { min: 0.01 });
    unit.attributes?.setBase?.('aggroRange', nextDefinition.aggroRange, { min: 0 });
    unit.attributes?.setBase?.('maxDurability', nextDefinition.weapon.maxDurability, { min: 0 });

    const facilityConfig = FACILITY_CONFIGS[nextType] ?? null;
    if (facilityConfig) {
      unit.baseManaCapacity = facilityConfig.manaCapacity;
      unit.manaCapacity = facilityConfig.manaCapacity;
      unit.facilityConfigId = facilityConfig.id;
    }

    // 保留绝对值，只夹到新上限（**不回满**）。
    const carry = upgradeCarryOver({
      health: job.carried.health,
      durability: job.carried.durability,
      activityMana: job.carried.activityMana,
      nextMaxHealth: unit.maxHealth,
      nextMaxDurability: unit.weapon.maxDurability,
      nextManaCapacity: unit.manaCapacity ?? 0
    });
    unit.health = carry.health;
    unit.weapon.durability = carry.durability;
    if (Number.isFinite(unit.activityMana)) unit.activityMana = carry.activityMana;
    unit.clampToAttributeCaps?.();

    unit.towerUpgrading = false;
    unit.towerUpgradeProgress = 1;
    unit.controlMode = 'normal';
    unit.attackTimer = Math.min(unit.attackTimer ?? 0, 0.6);
    unit.statusUiDirty = true;

    // 命中/射程环按新数值重画
    this.game?.buildings?.removeBuildingRangeVisual?.(unit);
    this.game?.buildings?.updateBuildingRangeVisual?.(unit);

    this.stats.completed += 1;
    this.game?.effects?.spawnRing?.(unit.position, '#ffe9a8', 1.5, 0.8);
    this.game?.effects?.spawnStructureDust?.(unit.position, 1.8, '#d8c8a8');
    this.game?.hints?.setHintOnce?.(
      `${nextDefinition.name}升级完工（生命 ${Math.round(unit.health)}/${Math.round(unit.maxHealth)}，耐久 ${Math.round(unit.weapon.durability)}/${Math.round(unit.weapon.maxDurability)}）`,
      `tower-upgraded:${unit.id}`
    );
    this.game?.baseStorage?.markDirty?.();
    this.game?.stationPanel?.markDirty?.();
    return { ok: true, unit, previousType, nextType, carry, invested: investedCostFor(job.towerId, job.toTier) };
  }

  /** 供 UI 使用的"下一级材料/资格"说明。 */
  describeNextTier(unit) {
    const identity = towerIdentityFor(unit?.type);
    if (!identity) return null;
    if (identity.tier >= 3) {
      return { tier: identity.tier, maxed: true, cost: [], label: '已经三级' };
    }
    const targetTier = identity.tier + 1;
    const cost = upgradeCostFor(identity.towerId, targetTier);
    const status = this.upgradeStatus(unit);
    return {
      tier: identity.tier,
      targetTier,
      maxed: false,
      cost,
      ok: status.ok === true,
      reason: status.reason,
      label: status.label ?? '',
      missing: status.missing ?? []
    };
  }

  /**
   * 建筑界面要的一份完整快照：类型 / 等级 / 用途 / 下一级材料与资格 / 当前耗能 / 状态。
   *
   * 为什么要集中成一个方法：UI 与验收脚本必须读**同一份**口径。
   * 界面自己拼一套"下一级要多少材料"，测试就只能去验证另一套逻辑。
   */
  status(unit) {
    const identity = towerIdentityFor(unit?.type);
    if (!identity) return null;
    const next = this.describeNextTier(unit);
    const stock = this.game?.baseInventory ?? null;
    const cost = (next?.cost ?? []).map((entry) => ({
      ...entry,
      have: Math.max(0, Math.floor(stock?.countOf?.(entry.itemId) ?? 0))
    }));
    const job = this.jobFor(unit);
    const routeCleared = this.routeClearedFor(identity.towerId);
    const hasResearch = this.hasResearchStation();
    return {
      unitId: unit.id,
      towerId: identity.towerId,
      tier: identity.tier,
      tierLabel: TOWER_TIER_LABELS[identity.tier - 1] ?? `${identity.tier}`,
      role: towerRoleInfoFor(identity.towerId),
      maxed: next?.maxed === true,
      targetTier: next?.targetTier ?? null,
      cost,
      ok: next?.ok === true,
      reason: next?.reason ?? null,
      label: next?.label ?? '',
      /**
       * 资格拆成两条给人看：二级只看科研站，三级还要对应路线。
       * 不分开展示的话，玩家在二级会看到"需要先建好科研站"，
       * 而其实他缺的是清线——提示会指向错误的方向。
       */
      gates: {
        research: { ok: hasResearch, label: '完工的科研站' },
        route: identity.tier + 1 >= 3
          ? {
            ok: routeCleared,
            label: `${TIER3_ROUTE_LABELS[TIER3_ROUTE_BY_TOWER[identity.towerId]] ?? '对应路线'}全线清除`
          }
          : null
      },
      underConstruction: unit.underConstruction === true,
      upgrading: Boolean(job),
      progress: job ? Math.min(1, job.progress / Math.max(0.5, this.rules.seconds)) : 0,
      blocked: job?.blocked === true,
      seconds: this.rules.seconds,
      // 耗能与供能：级别越高越吃燃料吞吐（`power` 来自定义，不是这里另算的）
      power: {
        drainPerSecond: unit.definition?.drainPerSecond ?? 0,
        manaPerShot: FACILITY_CONFIGS[unit.type]?.manaPerShot ?? null,
        mana: Math.round((unit.activityMana ?? 0) * 10) / 10,
        manaCapacity: Math.round((unit.manaCapacity ?? 0) * 10) / 10
      },
      health: { current: Math.round(unit.health ?? 0), max: Math.round(unit.maxHealth ?? 0) }
    };
  }

  summary() {
    return {
      active: this.jobs.size,
      jobs: [...this.jobs.values()].map((job) => ({
        unitId: job.unit.id,
        towerId: job.towerId,
        fromTier: job.fromTier,
        toTier: job.toTier,
        progress: job.progress,
        blocked: job.blocked
      })),
      stats: { ...this.stats }
    };
  }

  serialize() {
    return [...this.jobs.values()].map((job) => ({
      unitId: job.unit.id,
      towerId: job.towerId,
      toTier: job.toTier,
      progress: job.progress,
      cost: job.cost.map((entry) => ({ ...entry }))
    }));
  }

  reset() {
    this.jobs.forEach((job) => {
      job.unit.towerUpgrading = false;
      job.unit.controlMode = 'normal';
      job.unit.towerUpgradeProgress = 0;
    });
    this.jobs.clear();
    return true;
  }
}
