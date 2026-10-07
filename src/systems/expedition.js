// 远征与区域成长（纯规则，不碰 THREE / DOM / Game）。
//
// 这一轮补的是"玩家看不到选择的回报"这个缺口，所以规则必须能单独断言：
//   1. 四条路线绑的是**真实点位**（内巢 / 外巢）与**真实科技**，不另维护一份完成进度；
//   2. 路线的当前目标由点位真实 `cleared` 推导：内巢未清 → 外巢可进攻 → 全线清除；
//   3. 目标句给的是收益理由（这张图纸干什么用），不是"去清下一个点"这种泛化提示；
//   4. 没有专用武器的唯一傀儡不该被目标句直接催去单挑两只狼/两只哥布林——
//      手里只有斧镐时先说清"先合成并装备傀儡武器"，而**不是**说它不能还手。
//
// 敌名 / 掉落 / 图纸名一律从 `UNIT_DEFINITIONS` / `ITEM_DEFINITIONS` / `TECH_DEFINITIONS`
// 现读，不在这里抄第二份数字（抄一份就一定会和点位数据漂移）。
import {
  ITEM_DEFINITIONS,
  RECIPES,
  SURVIVAL_EXPEDITIONS,
  TECH_DEFINITIONS,
  UNIT_DEFINITIONS
} from '../data/gameData.js';
import { DAY_NIGHT_RULES, nightRaidModifiers } from './dayNight.js';
import { defenseGapSentence, nearestSpawningNest, survivalClockText, survivalObjectiveText } from './fieldCamps.js';
import { isPuppetWeaponItem } from './puppetArms.js';

export const EXPEDITION_STATE = {
  inner: 'inner',
  outer: 'outer',
  cleared: 'cleared'
};

export const EXPEDITION_STATE_LABELS = {
  [EXPEDITION_STATE.inner]: '内巢未清',
  [EXPEDITION_STATE.outer]: '外巢可进攻',
  [EXPEDITION_STATE.cleared]: '全线清除'
};

export const EXPEDITION_TRACK_STORAGE_KEY = 'village-war-expedition-track';

/** 夜里攻击射程这类"守家"提示的提前量：入夜前 60 秒就切到防线/燃料口径。 */
export const NIGHTFALL_WARNING_SECONDS = 60;

export function unitName(type) {
  return UNIT_DEFINITIONS[type]?.name ?? String(type ?? '');
}

export function itemName(itemId) {
  return ITEM_DEFINITIONS[itemId]?.name ?? String(itemId ?? '');
}

export function techName(techId) {
  return TECH_DEFINITIONS[techId]?.name ?? String(techId ?? '');
}

export function normalizeExpedition(raw) {
  if (!raw?.id || !raw?.innerNestId || !raw?.outerNestId) return null;
  return {
    id: String(raw.id),
    name: raw.name != null ? String(raw.name) : String(raw.id),
    direction: raw.direction != null ? String(raw.direction) : '',
    innerNestId: String(raw.innerNestId),
    outerNestId: String(raw.outerNestId),
    techId: raw.techId ? String(raw.techId) : null,
    strategy: raw.strategy != null ? String(raw.strategy) : ''
  };
}

export function allExpeditions() {
  return (SURVIVAL_EXPEDITIONS ?? []).map(normalizeExpedition).filter(Boolean);
}

export function expeditionById(id) {
  if (!id) return null;
  return allExpeditions().find((route) => route.id === String(id)) ?? null;
}

/** 内巢 id → 路线（清巢当帧要靠它决定发哪张图纸）。 */
export function expeditionByInnerNest(nestId) {
  if (!nestId) return null;
  return allExpeditions().find((route) => route.innerNestId === String(nestId)) ?? null;
}

/**
 * 点位表：接受数组或 Map，两种调用方式在运行时都有（数组来自 spawnPoints.points，
 * 纯测试里用 Map 更省事）。
 */
export function pointMapOf(points) {
  if (points instanceof Map) return points;
  const map = new Map();
  (points ?? []).forEach((point) => {
    if (point?.id) map.set(String(point.id), point);
  });
  return map;
}

function pointOf(pointsById, pointId) {
  return pointsById?.get?.(String(pointId)) ?? null;
}

/**
 * 一条路线的真实阶段。
 *
 * 注意外巢：`gateNestId` 只决定它**出不出兵**，不决定能不能被打。
 * 所以即使还封印着，UI 也必须如实显示"内巢已清、外巢还没清"。
 */
export function expeditionStage(route, pointsById) {
  const inner = pointOf(pointsById, route.innerNestId);
  const outer = pointOf(pointsById, route.outerNestId);
  const innerCleared = inner?.cleared === true;
  const outerCleared = outer?.cleared === true;
  if (!innerCleared) {
    return {
      state: EXPEDITION_STATE.inner,
      stateLabel: EXPEDITION_STATE_LABELS[EXPEDITION_STATE.inner],
      targetPointId: route.innerNestId,
      target: inner,
      innerCleared: false,
      outerCleared,
      gateOpen: false
    };
  }
  if (!outerCleared) {
    return {
      state: EXPEDITION_STATE.outer,
      stateLabel: EXPEDITION_STATE_LABELS[EXPEDITION_STATE.outer],
      targetPointId: route.outerNestId,
      target: outer,
      innerCleared: true,
      outerCleared: false,
      gateOpen: true
    };
  }
  return {
    state: EXPEDITION_STATE.cleared,
    stateLabel: EXPEDITION_STATE_LABELS[EXPEDITION_STATE.cleared],
    targetPointId: null,
    target: null,
    innerCleared: true,
    outerCleared: true,
    gateOpen: true
  };
}

function enemyWeight(entry) {
  const weight = Number(entry?.weight ?? 1);
  return Number.isFinite(weight) ? Math.max(0, weight) : 1;
}

function enemyLines(point) {
  return (point?.enemyPool ?? [])
    .filter((entry) => entry?.type && enemyWeight(entry) > 0)
    .map((entry) => ({
      type: String(entry.type),
      name: unitName(entry.type),
      weight: enemyWeight(entry)
    }));
}

function dropLines(point) {
  return (point?.drops ?? [])
    .filter((entry) => entry?.itemId && Number(entry.count) > 0)
    .map((entry) => ({
      itemId: String(entry.itemId),
      name: itemName(entry.itemId),
      count: Math.max(1, Math.floor(Number(entry.count)))
    }));
}

/**
 * 待招募兵种：按 `Game.grantSpawnPointRecruitReward` 的真实分配口径聚合——
 * `types` 用尽就循环取，所以 `{ types:['raider','archer'], count:3 }` 实际留下
 * 蛮兵×2 + 弓兵×1，而不是"两种各一支"。UI 显示的就是会真的站出来的那几支。
 */
export function recruitLines(point) {
  const reward = point?.recruitReward;
  const types = (reward?.types ?? []).filter((type) => typeof type === 'string' && type);
  if (!types.length) return [];
  const count = Math.max(1, Math.min(4, Math.floor(Number(reward.count) || 1)));
  const tally = new Map();
  for (let i = 0; i < count; i += 1) {
    const type = types[i % types.length];
    if (!UNIT_DEFINITIONS[type]) continue;
    tally.set(type, (tally.get(type) ?? 0) + 1);
  }
  return [...tally.entries()].map(([type, amount]) => ({
    type,
    name: unitName(type),
    count: amount
  }));
}

function workerLine(point) {
  const reward = point?.workerReward;
  if (!reward?.type) return null;
  return {
    type: String(reward.type),
    name: unitName(reward.type),
    count: Math.max(1, Math.floor(Number(reward.count) || 1))
  };
}

/**
 * 一条路线的完整展示数据。目标点位的一切（敌群 / 掉落 / 傀儡 / 待招募）都从**当前目标**
 * 点位现读：内巢阶段显示内巢的，外巢阶段显示外巢的——玩家看到的永远是接下来要打的那个点。
 */
export function expeditionBrief(route, { pointsById = new Map(), researched = new Set() } = {}) {
  const stage = expeditionStage(route, pointsById);
  const target = stage.target;
  const tech = route.techId ? TECH_DEFINITIONS[route.techId] ?? null : null;
  const owned = researched instanceof Set ? researched : new Set(researched ?? []);
  const blueprintReady = Boolean(tech) && stage.innerCleared;
  // 坐标只在**真的有目标点**时才给：整线清完后不能回落成 0，否则"查看位置"会把
  // 镜头挪到地图原点（那儿既不是敌人的位置，也不是任何目标）。
  const hasTarget = Boolean(target) && Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.z));
  return {
    id: route.id,
    name: route.name,
    direction: route.direction,
    strategy: route.strategy,
    stage: stage.state,
    stateLabel: stage.stateLabel,
    innerNestId: route.innerNestId,
    outerNestId: route.outerNestId,
    innerNest: pointOf(pointsById, route.innerNestId),
    outerNest: pointOf(pointsById, route.outerNestId),
    innerCleared: stage.innerCleared,
    outerCleared: stage.outerCleared,
    gateOpen: stage.gateOpen,
    targetPointId: stage.targetPointId,
    targetName: target?.name ?? null,
    targetX: hasTarget ? Number(target.x) : null,
    targetZ: hasTarget ? Number(target.z) : null,
    targetNestHealth: hasTarget && Number(target.nestHealth) > 0 ? Number(target.nestHealth) : null,
    enemies: enemyLines(target),
    drops: dropLines(target),
    recruits: recruitLines(target),
    worker: workerLine(target),
    blueprint: tech
      ? {
        techId: tech.id,
        name: tech.name,
        description: tech.description ?? '',
        ready: blueprintReady,
        researched: owned.has(tech.id),
        nestId: route.innerNestId,
        nestName: pointOf(pointsById, route.innerNestId)?.name ?? route.innerNestId,
        cost: (tech.cost ?? []).map((entry) => ({ ...entry, name: itemName(entry.itemId) }))
      }
      : null,
    /** 收益理由：这句话是"为什么值得打这条线"，不是重复目标名。 */
    payoff: tech
      ? (tech.description || `${tech.name}：清掉${pointOf(pointsById, route.innerNestId)?.name ?? route.innerNestId}即可取得区域图纸。`)
      : ''
  };
}

export function allExpeditionBriefs({ pointsById = new Map(), researched = new Set() } = {}) {
  return allExpeditions().map((route) => expeditionBrief(route, { pointsById, researched }));
}

/** 还没打完的路线里，第一条（没有 excludeId 时就是第一条未完成）。 */
export function nextUnfinishedExpedition(briefs = [], excludeId = null) {
  return briefs.find((brief) => brief.stage !== EXPEDITION_STATE.cleared && brief.id !== excludeId) ?? null;
}

/**
 * 追踪解析：追踪只保存一个路线 id，目标每帧从点位真实状态重新推导。
 * 内巢清掉 → 目标自动换到外巢；整线清完 → `completed` 为真并把下一条未完成路线带出来，
 * 但**不自动改追踪**（保留玩家主动选择，面板上给一个显式按钮）。
 */
export function resolveTrackedExpedition(briefs = [], trackedId = null) {
  if (!trackedId) return { tracked: null, completed: false, next: null };
  const tracked = briefs.find((brief) => brief.id === String(trackedId)) ?? null;
  if (!tracked) return { tracked: null, completed: false, next: null };
  const completed = tracked.stage === EXPEDITION_STATE.cleared;
  return {
    tracked,
    completed,
    next: completed ? nextUnfinishedExpedition(briefs, tracked.id) : null
  };
}

/**
 * 单位自带的攻击伤害（纯规则）。
 *
 * **权威字段是 `UNIT_DEFINITIONS[type].damage / physicalAttack / magicAttack`**，
 * 不是 `weapon.damage`：蛮兵/弓兵/长矛兵/盾卫这些"自带武器"的战斗单位，
 * `weapon` 块里常常只有名字、家族与耐久参数，`weapon.damage` 是 `undefined` 或 0。
 * 只读 `weapon.damage` 的写法会把一支弓兵当成"没有武器"，于是玩家已经有成建制
 * 部队时 HUD 还在喊"先给傀儡做木棒"——这正是要避免的误判。
 *
 * `weapon.damage` 仍作为兜底参与取最大值（某些定义只写在 weapon 块里），
 * 但空手傀儡（全为 0）必须仍然算出 0。
 */
export function nativeWeaponDamage(definition) {
  if (!definition) return 0;
  return Math.max(
    0,
    Number(definition.damage) || 0,
    Number(definition.physicalAttack) || 0,
    Number(definition.magicAttack) || 0,
    Number(definition.weapon?.damage) || 0
  );
}

/**
 * 把一个真实单位（或 `{ type }` 类型引用）映射成装备判断用的描述符。
 *
 * 存在的意义是**只有一份映射**：运行时（ExpeditionSystem.loadoutDescriptors）与
 * 纯规则测试走同一个函数，所以测试里给的就是真实 `UNIT_DEFINITIONS` 的结论，
 * 不会出现"测试注入正伤害所以通过、真实招募的弓兵仍然算没有武器"。
 *
 * `definition` 缺省时按 `UNIT_DEFINITIONS[type]` 现读；工具的**实例**只存在于背包与
 * 作业记录里，不属于单位定义，所以由 `extra.toolIds` 由调用方补进来。
 */
export function loadoutDescriptorFor(unit, extra = {}) {
  const definition = unit?.definition ?? UNIT_DEFINITIONS[unit?.type] ?? null;
  return {
    id: unit?.id ?? null,
    type: unit?.type ?? null,
    name: unit?.name ?? definition?.name ?? null,
    isWorker: unit?.isWorker === true,
    isBuilding: unit?.isBuilding === true || definition?.canMove === false,
    canMove: definition?.canMove !== false,
    weaponItemId: unit?.weaponItemId ?? null,
    nativeWeaponDamage: nativeWeaponDamage(definition),
    toolIds: [...(extra.toolIds ?? unit?.toolIds ?? [])]
  };
}

/**
 * 出发前的装备判断（纯规则）。
 *
 * 入参是描述符数组，由 `loadoutDescriptorFor` 从真实单位/背包映射出来：
 *   { isWorker, weaponItemId, toolIds: [...], canMove, nativeWeaponDamage }
 * 只回答"现在推不推得动"，不回答"该打谁"。
 *
 * 关键区分（否则开局提示会对着已经有一队弓兵手的局面喊"你什么都没有"）：
 *   - `dedicated`：装了**傀儡专用武器**的移动单位（木棒/木刃/铁刃）；
 *   - `nativeArmed`：本来就带武器的战斗单位（蛮兵/弓兵/长矛兵…），他们的
 *     `damage / physicalAttack / magicAttack > 0`（见 `nativeWeaponDamage`），
 *     不需要傀儡武器也能推；
 *   - `toolOnly` / `unarmed`：只有斧镐或空手的傀儡。
 * `needsWeapon` 只在"有移动单位、既没有傀儡武器、也没有天生带武器的战斗单位"时为真——
 * 也就是开局那支唯一木傀儡的情形。没有任何可移动单位（只剩建筑/全灭）时为假，
 * 目标句会退回既有营地/巢穴口径，而不是喊一个不存在的单位去装备。
 */
export function loadoutReadiness(units = []) {
  const mobile = (units ?? []).filter((unit) => unit && unit.isBuilding !== true && unit.canMove !== false);
  const dedicated = mobile.filter((unit) => isPuppetWeaponItem(unit.weaponItemId));
  const nativeArmed = mobile.filter((unit) => (
    !isPuppetWeaponItem(unit.weaponItemId)
    && Math.max(0, Number(unit.nativeWeaponDamage) || 0) > 0
  ));
  const unarmedWorkers = mobile.filter((unit) => (
    unit.isWorker === true
    && !isPuppetWeaponItem(unit.weaponItemId)
    && Math.max(0, Number(unit.nativeWeaponDamage) || 0) <= 0
  ));
  const toolOnly = unarmedWorkers.filter((unit) => (
    (unit.toolIds ?? []).some((toolId) => toolId === 'axe' || toolId === 'pickaxe')
  ));
  const unarmed = unarmedWorkers.filter((unit) => (
    !(unit.toolIds ?? []).some((toolId) => toolId === 'axe' || toolId === 'pickaxe')
  ));
  return {
    mobileCount: mobile.length,
    dedicatedWeaponCount: dedicated.length,
    dedicatedWeaponNames: [...new Set(dedicated.map((unit) => itemName(unit.weaponItemId)))],
    nativeArmedCount: nativeArmed.length,
    nativeArmedNames: [...new Set(nativeArmed.map((unit) => unit.name ?? unitName(unit.type)))],
    toolOnlyCount: toolOnly.length,
    unarmedCount: unarmed.length,
    /** 只剩傀儡、且手里没有傀儡武器 → 目标句必须先说装备，而不是催着去清营地。 */
    needsWeapon: dedicated.length === 0 && nativeArmed.length === 0 && mobile.length > 0,
    canFightBack: dedicated.length > 0 || nativeArmed.length > 0 || toolOnly.length > 0
  };
}

/** 可合成的傀儡武器配方（真实材料，用于目标句里的具体数字）。 */
export function craftablePuppetWeapons() {
  return ['puppetCudgel', 'puppetGlaive']
    .map((recipeId) => RECIPES[recipeId] ?? null)
    .filter(Boolean)
    .map((recipe) => ({
      recipeId: recipe.id,
      name: recipe.name ?? itemName(recipe.output?.itemId),
      outputName: itemName(recipe.output?.itemId),
      inputs: (recipe.inputs ?? []).map((entry) => ({
        itemId: entry.itemId,
        name: itemName(entry.itemId),
        count: Math.max(1, Math.floor(Number(entry.count) || 1))
      }))
    }));
}

function materialsText(inputs = []) {
  return inputs.map((entry) => `${entry.name}×${entry.count}`).join(' + ');
}

/**
 * 开局装备提示：手里没有专用武器时，先说清"合成并装备哪一件、要多少材料"。
 * 措辞刻意写成"先装备"而不是"不能还手"——斧镐本来就能打，只是打不动成建制的敌人。
 */
export function openingLoadoutText(loadout) {
  if (!loadout?.needsWeapon) return null;
  const weapons = craftablePuppetWeapons();
  const cheapest = weapons[0] ?? null;
  if (!cheapest) return '木傀儡还没有专用武器。先给它合成并装备一件傀儡武器再往外推。';
  const rest = weapons.slice(1).map((weapon) => `${weapon.outputName}（${materialsText(weapon.inputs)}）`);
  return `木傀儡手里还没有专用武器，先合成并装备${cheapest.outputName}（${materialsText(cheapest.inputs)}）`
    + (rest.length ? `，材料够了再做${rest.join('、')}` : '')
    + '；拖进它的背包格就会自动装备。手里有斧镐能自保，但打不动成群敌人。';
}

/**
 * 顶部那一行能放下的**短版开局装备提示**：只说"先做哪一件、要多少材料"。
 * 完整解释（还能做哪些、拖进背包就自动装备、斧镐打不动成群敌人）留在帮助面板。
 */
export function openingLoadoutHint(loadout) {
  if (!loadout?.needsWeapon) return null;
  const cheapest = craftablePuppetWeapons()[0] ?? null;
  if (!cheapest) return '先给木傀儡合成一件专用武器（按 B 打开合成）';
  return `先给木傀儡做${cheapest.outputName}（${materialsText(cheapest.inputs)}）`;
}

/** 当前是不是"防线优先"时段：已入夜，或离入夜不到 60 秒。 */
export function isDefensePriority(input = {}) {
  if (input.isNight) return true;
  const remaining = Number(input.secondsRemaining);
  return Number.isFinite(remaining) && remaining <= NIGHTFALL_WARNING_SECONDS;
}

/**
 * 追踪中的目标句：说清"打哪个点、这一趟具体拿什么"。
 *
 * 收益理由按**当前阶段**给：
 *   - 内巢阶段：图纸还没到手 → 说"拆掉它取得图纸 X（再到科研站研究）"；
 *   - 外巢阶段：图纸已经到手（或已研究）→ 不再重复讲图纸，改说这个点真实会掉什么
 *     （掉落 / 木傀儡 / 待招募），以及"清完整条线这个方向停止出兵"；
 *   - 整线清完：显示完成，并把下一条未完成路线作为建议带出来（不自动切换追踪）。
 */
export function trackedObjectiveText(resolved) {
  const tracked = resolved?.tracked ?? null;
  if (!tracked) return null;
  if (resolved.completed) {
    const next = resolved.next;
    return `${tracked.name}已全线清除，这个方向不再出新兵`
      + (next ? `；下一条可追：${next.name}（${next.targetName ?? ''}）` : '；四条路线都清完了');
  }
  const head = `追踪${tracked.name}：目标${tracked.targetName ?? '（点位缺失）'}（${tracked.stateLabel}）`;
  const loot = lootSummary(tracked);
  if (tracked.stage === EXPEDITION_STATE.outer) {
    return `${head}。这一趟：${loot}；清完这条线这个方向停止出兵`
      + (tracked.blueprint && !tracked.blueprint.researched ? `（图纸「${tracked.blueprint.name}」已到手，去科研站研究）` : '');
  }
  const blueprint = tracked.blueprint;
  if (blueprint && !blueprint.researched) {
    return `${head}。拆掉它取得区域图纸「${blueprint.name}」，再去科研站投入材料研究。`;
  }
  return `${head}。这一趟：${loot}`;
}

/** 目标点真实会给的东西（掉落 / 木傀儡 / 待招募）。 */
export function lootSummary(brief) {
  const parts = [];
  const drops = (brief?.drops ?? []).map((drop) => `${drop.name}×${drop.count}`);
  if (drops.length) parts.push(drops.join('、'));
  if (brief?.worker) parts.push(`${brief.worker.name}×${brief.worker.count}`);
  const recruits = (brief?.recruits ?? []).map((recruit) => `${recruit.name}×${recruit.count ?? 1}`);
  if (recruits.length) parts.push(`可招募 ${recruits.join('、')}`);
  return parts.length ? parts.join('，') : '清掉这里的敌人';
}

/**
 * 顶部目标句的最终组装（远征版）。
 *
 * 优先级：
 *   1. 追踪中的路线 → 当前目标 + 收益理由（目标随内巢清除自动换到外巢）；
 *   2. 未追踪 + 入夜/入夜前 60 秒 → 真实防线或燃料缺口（复用既有防线文案）；
 *   3. 未追踪 + 白天 + 没有专用武器 → 先装备傀儡武器（不催着去单挑营地）；
 *   4. 未追踪 + 白天 → 保留既有提示逻辑（下一座营地 / 最近还在出兵的巢穴）。
 */
export function expeditionObjectiveText(input = {}) {
  const clock = survivalClockText(input);
  const tracked = trackedObjectiveText(input.tracked);
  if (tracked) return `${clock}。${tracked}`;
  if (isDefensePriority(input)) {
    // 最近一座还在出兵的巢穴：运行时会把算好的结果放在 nearestNest 里（每 0.5 秒一次），
    // 纯规则调用方没传就地按同一口径推一次，避免两处算法漂移。
    const nearest = input.nearestNest
      ?? nearestSpawningNest(input.nests ?? [], input.baseX ?? 4, input.baseZ ?? 40);
    // defense 缺省时退回整份输入：防线缺口读的就是那几项（熔炉 / 魔力炉燃料 / 箭塔），
    // 调用方少传一项也不该突然说"还没有熔炉"。
    return `${clock}。${defenseGapSentence(input.defense ?? input, nearest)}`;
  }
  const opening = openingLoadoutText(input.loadout);
  if (opening) return `${clock}。${opening}`;
  return survivalObjectiveText(input.fallback ?? input);
}

/**
 * 夜袭预报（清线回报那一节的规则层）。
 *
 * 全部数字都从**真实点位**与**真实昼夜规则**推导：
 *   - `cleared`    已被摧毁的点（这个方向不再出新兵）；
 *   - `sealed`     还没拆、但被内巢封印着（gateNestId 未清）的点；
 *   - `threatening` 现在就在威胁基地的点（没有 gate，或 gate 已清）。
 * 残兵数按"已清点位上的存活敌人"算——兵不会凭空消失，预报必须说清楚。
 */
export function raidForecast({
  points = [],
  routes = [],
  dayNumber = 1,
  isNight = false,
  rules = DAY_NIGHT_RULES,
  aliveByPoint = {}
} = {}) {
  const list = (points ?? []).filter((point) => point?.id);
  const clearedIds = new Set(list.filter((point) => point.cleared === true).map((point) => String(point.id)));
  const classify = (point) => {
    if (point.cleared === true) return 'cleared';
    const gate = point.gateNestId ? String(point.gateNestId) : null;
    if (gate && !clearedIds.has(gate)) return 'sealed';
    return 'threatening';
  };
  const groups = { threatening: [], sealed: [], cleared: [] };
  list.forEach((point) => {
    groups[classify(point)].push(point);
  });
  const counted = (entries) => entries.map((point) => ({
    id: String(point.id),
    name: point.name ?? String(point.id),
    x: Number(point.x) || 0,
    z: Number(point.z) || 0,
    gateNestId: point.gateNestId ? String(point.gateNestId) : null,
    enemies: enemyLines(point),
    maxAlive: Number(point.maxAlive) > 0 ? Number(point.maxAlive) : null
  }));
  const routeStates = (routes ?? []).map((route) => {
    const inner = list.find((point) => String(point.id) === String(route.innerNestId)) ?? null;
    const outer = list.find((point) => String(point.id) === String(route.outerNestId)) ?? null;
    const innerCleared = inner?.cleared === true;
    const outerCleared = outer?.cleared === true;
    const active = !innerCleared ? inner : (!outerCleared ? outer : null);
    return {
      id: String(route.id),
      name: route.name ?? String(route.id),
      innerNestId: String(route.innerNestId),
      outerNestId: String(route.outerNestId),
      innerCleared,
      outerCleared,
      cleared: innerCleared && outerCleared,
      active: active ? { id: String(active.id), name: active.name ?? String(active.id) } : null,
      activeKind: !innerCleared ? 'inner' : (!outerCleared ? 'outer' : null)
    };
  });
  const activeRoutes = routeStates.filter((route) => !route.cleared && route.active);
  const safeRoutes = routeStates.filter((route) => route.cleared);
  const nextNightNumber = isNight
    ? Math.max(1, Math.floor(Number(dayNumber) || 1)) + 1
    : Math.max(1, Math.floor(Number(dayNumber) || 1));
  const currentNightNumber = isNight ? Math.max(1, Math.floor(Number(dayNumber) || 1)) : null;
  let residual = 0;
  clearedIds.forEach((pointId) => {
    residual += Math.max(0, Math.floor(Number(aliveByPoint?.[pointId]) || 0));
  });
  return {
    isNight,
    dayNumber: Math.max(1, Math.floor(Number(dayNumber) || 1)),
    currentNightNumber,
    nextNightNumber,
    nextNightRaid: nightRaidModifiers(nextNightNumber, rules),
    currentNightRaid: currentNightNumber != null ? nightRaidModifiers(currentNightNumber, rules) : null,
    counts: {
      total: list.length,
      cleared: groups.cleared.length,
      sealed: groups.sealed.length,
      threatening: groups.threatening.length
    },
    threatening: counted(groups.threatening),
    sealed: counted(groups.sealed),
    cleared: counted(groups.cleared),
    activeRoutes,
    safeRoutes,
    routeStates,
    residual,
    /** 还有没有敌人会从**新**点位出来：被封印的点不算（它们要等 gate 被拆）。 */
    hasOpenSource: groups.threatening.length > 0
  };
}

/** 一条路线被清掉时该说的话（面板与提示共用，保证口径一致）。 */
export function routeClearedNotice(brief) {
  if (!brief) return '';
  const blueprint = brief.blueprint;
  return blueprint
    ? `${brief.name}全线清除，这个方向不再出新兵；区域图纸「${blueprint.name}」已到手。`
    : `${brief.name}全线清除，这个方向不再出新兵。`;
}
