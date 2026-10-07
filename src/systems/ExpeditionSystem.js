// 远征的运行时状态归属方。
//
// expedition.js 只回答"四条路线现在各自是什么阶段、目标点上有什么"；
// 这里负责把它接到活的游戏上：
//   1. 按固定节奏（0.5 秒）采样点位与己方装备，而不是每帧全量扫单位/敌人；
//   2. 追踪状态只保存一个路线 id（可选落盘），目标每帧从点位真实 `cleared` 现推；
//   3. "查看位置"只移动相机：解除跟随、按既有边界夹紧，绝不给单位下任何指令；
//   4. 清掉内巢当帧发区域图纸提示、并明确警告外圈新来源开始出兵。
//
// 刻意不碰 DOM：面板（ExpeditionPanelUi）只读这里的快照，纯规则测试也能直接跑这个类
// （传一个最小 game 壳即可）。
import { ITEM_DEFINITIONS } from '../data/gameData.js';
import { phaseRemaining } from './dayNight.js';
import { survivalObjectiveCompactText, survivalObjectiveDetailText } from './fieldCamps.js';
import {
  EXPEDITION_STATE,
  EXPEDITION_TRACK_STORAGE_KEY,
  allExpeditionBriefs,
  allExpeditions,
  expeditionByInnerNest,
  expeditionObjectiveText,
  isDefensePriority,
  loadoutDescriptorFor,
  loadoutReadiness,
  openingLoadoutHint,
  openingLoadoutText,
  pointMapOf,
  raidForecast,
  resolveTrackedExpedition,
  routeClearedNotice
} from './expedition.js';

/** 采样周期：点位状态以秒计变，0.5 秒足够，且不会每帧扫全表。 */
const SAMPLE_INTERVAL_SECONDS = 0.5;

export class ExpeditionSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.routes = allExpeditions();
    this.sampleAccumulator = SAMPLE_INTERVAL_SECONDS;
    /** 每次重建自增：面板据此判断"这次要不要重画"，而不是每帧重算签名。 */
    this.sampleVersion = 0;
    this.cache = null;
    this.storage = options.storage ?? safeStorage();
    this.storageKey = options.storageKey ?? EXPEDITION_TRACK_STORAGE_KEY;
    this.trackedId = this.readTrackedId();
    /** 已经播报过"全线清除"的路线 id，避免同一句话反复弹。 */
    this.notifiedCleared = new Set();
  }

  // ---- 追踪状态 ------------------------------------------------------------

  readTrackedId() {
    try {
      const raw = this.storage?.getItem?.(this.storageKey) ?? null;
      if (!raw) return null;
      return this.routes.some((route) => route.id === String(raw)) ? String(raw) : null;
    } catch {
      return null;
    }
  }

  writeTrackedId(id) {
    try {
      if (id) this.storage?.setItem?.(this.storageKey, String(id));
      else this.storage?.removeItem?.(this.storageKey);
    } catch {
      // 存不下不影响本局：追踪本来就是本局状态
    }
  }

  track(routeId) {
    const route = this.routes.find((entry) => entry.id === String(routeId)) ?? null;
    if (!route) return { ok: false, reason: 'unknown_route' };
    this.trackedId = route.id;
    this.writeTrackedId(route.id);
    this.invalidate();
    const brief = this.briefById(route.id);
    this.game?.hints?.setHintOnce?.(
      `已追踪${route.name}：目标${brief?.targetName ?? '（点位缺失）'}`,
      `expedition-track:${route.id}`
    );
    return { ok: true, route, brief };
  }

  untrack() {
    const previous = this.trackedId;
    this.trackedId = null;
    this.writeTrackedId(null);
    this.invalidate();
    if (previous) this.game?.hints?.setHintOnce?.('已取消追踪，目标句回到默认提示', 'expedition-untrack');
    return { ok: true, previous };
  }

  toggleTrack(routeId) {
    if (this.isTracked(routeId)) return this.untrack();
    return this.track(routeId);
  }

  isTracked(routeId) {
    return Boolean(this.trackedId) && String(routeId) === this.trackedId;
  }

  // ---- 采样与缓存 ----------------------------------------------------------

  /** 点位表：唯一权威是 SpawnPointSystem 维护的真实点位。 */
  points() {
    const points = this.game?.spawnPoints?.points;
    return Array.isArray(points) ? points : [];
  }

  invalidate() {
    this.cache = null;
    this.sampleVersion += 1;
    this.sampleAccumulator = SAMPLE_INTERVAL_SECONDS;
  }

  /**
   * 采样节拍由**真实帧时间**累加而来（`dt` 就是这一帧的秒数），
   * 所以 60fps 与 144fps 下都是每 0.5 秒重建一次，不随帧率漂移。
   * 调用点必须在每帧只跑一次、且不受 HUD 那个 0.1 秒节流影响（见 Game.tick）。
   */
  update(dt = 0) {
    if (!this.cache) {
      this.rebuild();
      return this.cache;
    }
    this.sampleAccumulator += Math.max(0, Number(dt) || 0);
    // 留一点浮点余量：60fps 下 30 帧 × (1/60) 累加未必正好等于 0.5，
    // 差一个 ULP 就会把"每 0.5 秒一次"变成"每 0.5 秒差一次"。
    if (this.sampleAccumulator < SAMPLE_INTERVAL_SECONDS - 1e-6) return this.cache;
    return this.rebuild();
  }

  rebuild() {
    this.sampleAccumulator = 0;
    const pointsById = pointMapOf(this.points());
    const researched = this.game?.research?.researched ?? new Set();
    const briefs = allExpeditionBriefs({ pointsById, researched });
    const resolved = resolveTrackedExpedition(briefs, this.trackedId);
    const forecast = this.buildForecast(pointsById);
    // 贵的那部分（防线建筑扫描、最近威胁巢穴）每 0.5 秒算一次就够；
    // 每帧要变的只有倒计时秒数，由 objectiveText 现算，不重复扫单位。
    const staticInput = this.fallbackInput();
    this.cache = {
      pointsById,
      briefs,
      tracked: resolved.tracked,
      trackedCompleted: resolved.completed,
      trackedNext: resolved.next,
      forecast,
      staticInput,
      nearestNest: this.nearestSpawningNest(staticInput.nests ?? []),
      loadout: loadoutReadiness(this.loadoutDescriptors()),
      sampledAt: Number(this.game?.elapsedTime) || 0
    };
    this.sampleVersion += 1;
    this.notifyRouteCleared();
    return this.cache;
  }

  /** 供面板/目标句读取的快照（必要时立即重建）。 */
  snapshot() {
    return this.cache ?? this.rebuild();
  }

  briefs() {
    return this.snapshot().briefs;
  }

  briefById(routeId) {
    return this.briefs().find((brief) => brief.id === String(routeId)) ?? null;
  }

  /**
   * 这条路线是否"全线清除"。
   *
   * 防御终端的**三级资格**要读这一个判据（东岬线 → 箭塔 / 北岬线 → 弩炮 /
   * 南林线 → 震荡塔），所以它必须是远征模块自己给出的结论，
   * 而不是让塔升级逻辑去重新推导一遍"哪些点属于哪条线"。
   */
  isRouteCleared(routeId) {
    const brief = this.briefById(routeId);
    if (!brief) return false;
    return brief.stage === EXPEDITION_STATE.cleared;
  }

  trackedBrief() {
    return this.snapshot().tracked;
  }

  isTrackedComplete() {
    return this.snapshot().trackedCompleted === true;
  }

  // ---- 装备与防线输入 ------------------------------------------------------

  /**
   * 己方单位的装备描述符。只读背包与装备标记，不主动装备任何东西。
   * 采样周期 0.5 秒，且只在需要重建快照时跑一次。
   *
   * "自带武器的战斗单位"这一项交给 `loadoutDescriptorFor` / `nativeWeaponDamage`
   * 现读 `UNIT_DEFINITIONS` 的 damage / physicalAttack / magicAttack——
   * 不能读 `definition.weapon.damage`（蛮兵/弓兵那儿是 undefined，会把有部队的
   * 局面误判成"没有武器"）。映射只有一份，纯规则测试用的是同一个函数。
   */
  loadoutDescriptors() {
    const units = this.game?.friendlyUnits;
    if (!Array.isArray(units)) return [];
    return units
      .filter((unit) => unit?.alive)
      .map((unit) => loadoutDescriptorFor(unit, { toolIds: this.toolIdsFor(unit) }));
  }

  toolIdsFor(unit) {
    const pack = this.game?.work?.recordFor?.(unit)?.pack ?? null;
    if (Array.isArray(pack?.toolIds) && pack.toolIds.length) return [...pack.toolIds];
    const slots = unit?.workerInventory?.slots ?? unit?.itemBag?.slots ?? [];
    const tools = [];
    slots.forEach((slot) => {
      const tool = slot?.itemId ? ITEM_DEFINITIONS[slot.itemId]?.tool : null;
      if (tool) tools.push(tool);
    });
    return tools;
  }

  /** 未追踪时用于组装默认目标句的输入（复用 Game 那份，保证口径一致）。 */
  fallbackInput() {
    return this.game?.survivalObjectiveInput?.() ?? {};
  }

  buildForecast(pointsById) {
    const dayNight = this.game?.dayNight ?? null;
    const aliveByPoint = this.game?.spawnPoints?.aliveByPoint?.() ?? {};
    return raidForecast({
      points: [...pointsById.values()],
      routes: this.routes,
      dayNumber: dayNight?.dayNumber ?? 1,
      isNight: dayNight?.phase === 'night',
      rules: dayNight?.rules ?? undefined,
      aliveByPoint
    });
  }

  // ---- 目标句 --------------------------------------------------------------

  /**
   * 顶部那句"眼下"。有追踪 → 追踪目标 + 这一趟的真实收益；
   * 没追踪 → 入夜/临夜走防线口径，白天没有专用武器先说装备，否则保留既有提示。
   *
   * 每帧只现算倒计时（`phaseRemaining`），点位/防线/装备都读 0.5 秒那份快照。
   */
  objectiveText() {
    const snap = this.snapshot();
    const staticInput = snap.staticInput ?? {};
    const clock = {
      isNight: this.game?.dayNight?.phase === 'night',
      secondsRemaining: phaseRemaining(this.game?.dayNight),
      dayNumber: this.game?.dayNight?.dayNumber ?? 1
    };
    const merged = { ...staticInput, ...clock };
    return expeditionObjectiveText({
      ...merged,
      loadout: snap.loadout,
      tracked: {
        tracked: snap.tracked,
        completed: snap.trackedCompleted,
        next: snap.trackedNext
      },
      nearestNest: snap.nearestNest ?? null,
      defense: staticInput,
      fallback: merged
    });
  }

  /**
   * 顶部那一行**短提示**：追踪路线时说"去哪个点"，否则按与完整目标句相同的
   * 优先级给一句短话。完整的长篇玩法说明迁到了帮助面板（见 Game.helpPanelText），
   * 这里只回答"眼下做什么"。
   */
  objectiveCompactText() {
    const snap = this.snapshot();
    const staticInput = snap.staticInput ?? {};
    const merged = {
      ...staticInput,
      isNight: this.game?.dayNight?.phase === 'night',
      secondsRemaining: phaseRemaining(this.game?.dayNight),
      dayNumber: this.game?.dayNight?.dayNumber ?? 1
    };
    const tracked = snap.tracked;
    if (tracked && snap.trackedCompleted !== true) {
      const stage = tracked.stateLabel ? `（${tracked.stateLabel}）` : '';
      return `追踪${tracked.name}：去${tracked.targetName ?? '目标点'}${stage}`;
    }
    if (isDefensePriority(merged)) {
      // 入夜/临夜优先说防线，这一段本来就是短句（循环里。
      return survivalObjectiveCompactText(merged);
    }
    // 白天且还没有专用武器：先说"先做哪一件"，不催着玩家拿斧子去清营地。
    const opening = openingLoadoutHint(snap.loadout);
    if (opening) return opening;
    return survivalObjectiveCompactText(merged);
  }

  /** 帮助面板里的完整开局说明：顶部那一行放不下的长文都这里。 */
  objectiveDetailLines() {
    const snap = this.snapshot();
    const staticInput = snap.staticInput ?? {};
    return survivalObjectiveDetailText(staticInput, openingLoadoutText(snap.loadout));
  }

  /** 与 fieldCamps 同口径的"最近一座还在出兵的巢穴"（防线文案要用名字）。 */  nearestSpawningNest(nests = []) {
    const points = this.points();
    const cleared = new Set(points.filter((point) => point.cleared).map((point) => point.id));
    const base = this.game?.playerBase?.position ?? { x: 4, z: 40 };
    const open = (nests ?? []).filter((nest) => {
      if (!nest || nest.cleared) return false;
      if (nest.gateNestId && !cleared.has(nest.gateNestId)) return false;
      return true;
    });
    open.sort((a, b) => (
      Math.hypot((Number(a.x) || 0) - (base.x ?? 0), (Number(a.z) || 0) - (base.z ?? 0))
      - Math.hypot((Number(b.x) || 0) - (base.x ?? 0), (Number(b.z) || 0) - (base.z ?? 0))
    ));
    return open[0] ?? null;
  }

  // ---- 相机（只移动镜头，不下指令） ---------------------------------------

  /**
   * 查看某条路线的当前位置。
   * 只做三件事：解除单位跟随、把镜头中心移到目标点、按既有战场边界夹紧。
   * 不改变选中、不下移动命令、不碰任何单位。
   */
  focusRoute(routeId) {
    const brief = this.briefById(routeId);
    if (!brief || !Number.isFinite(brief.targetX) || !Number.isFinite(brief.targetZ)) {
      return { ok: false, reason: 'no_target' };
    }
    return this.focusPoint(brief.targetX, brief.targetZ, brief.targetName);
  }

  focusPoint(x, z, label = '') {
    const game = this.game;
    if (!game?.cameraTarget) return { ok: false, reason: 'no_camera' };
    game.setCameraFollowEnabled?.(false);
    game.cameraTarget.x = Number(x) || 0;
    game.cameraTarget.z = Number(z) || 0;
    game.clampCameraTarget?.();
    game.updateCamera?.(0);
    if (label) {
      game.hints?.setHintOnce?.(`镜头已移到${label}`, `expedition-focus:${label}`);
    }
    return { ok: true, x: game.cameraTarget.x, z: game.cameraTarget.z, label };
  }

  // ---- 清巢当帧：图纸与警告 -----------------------------------------------

  /**
   * 一个刷怪点被摧毁时调用。
   *
   * 只处理"内圈巢穴"这一种情况：发图纸提示 + 警告外圈开始出兵。
   * **不能**说"内巢被拆了整个方向就安全"——外巢还在，只是从封印变成会出兵。
   */
  onSpawnPointCleared(point) {
    if (!point?.id) return null;
    const route = expeditionByInnerNest(point.id);
    this.invalidate();
    if (!route) return null;
    const brief = this.briefById(route.id);
    const blueprint = brief?.blueprint ?? null;
    const outerName = brief?.outerNest?.name ?? route.outerNestId;
    const outerCleared = brief?.outerCleared === true;
    const parts = [];
    if (blueprint) {
      parts.push(`取得区域图纸「${blueprint.name}」→ 到科研站研究`);
    }
    if (!outerCleared) {
      parts.push(`警告：${outerName}解除封印，这个方向开始出新兵`);
    } else {
      parts.push(`${route.name}全线清除`);
    }
    const text = parts.join(' · ');
    if (text) this.game?.hints?.setHintOnce?.(text, `expedition-nest:${point.id}`);
    return { route, blueprint, outerName, outerCleared, text };
  }

  /** 整条路线清完时说一句（采样时发现状态变化才说一次）。 */
  notifyRouteCleared() {
    const briefs = this.cache?.briefs ?? [];
    briefs.forEach((brief) => {
      if (brief.stage !== EXPEDITION_STATE.cleared) {
        this.notifiedCleared.delete(brief.id);
        return;
      }
      if (this.notifiedCleared.has(brief.id)) return;
      this.notifiedCleared.add(brief.id);
      this.game?.hints?.setHintOnce?.(routeClearedNotice(brief), `expedition-route-cleared:${brief.id}`);
    });
  }

  serialize() {
    return { trackedId: this.trackedId };
  }

  applySnapshot(snapshot) {
    const id = snapshot?.trackedId ?? null;
    this.trackedId = id && this.routes.some((route) => route.id === String(id)) ? String(id) : null;
    this.writeTrackedId(this.trackedId);
    this.invalidate();
    return true;
  }
}

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
