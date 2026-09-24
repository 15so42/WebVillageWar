// 刷怪点（纯逻辑）。
//
// 计划第 6 节的硬要求：
//   - 持续怪物压力来自地图刷怪点，最终目标是清除全部刷怪点；
//   - 摧毁刷怪点是「永久停止该点产怪」，不是只杀光当前这一批；
//   - 每个点要有生成间隔、存活上限与出击规则，移除波次不等于每帧无上限生成。
//
// 这里只做「什么时候该生、还能生几个、清没清干净」，不碰任何实体。
// 真正生成敌人由调用方按 planSpawns 的结果执行。
export const SPAWN_POINT_STATE = {
  active: 'active',
  cleared: 'cleared'
};

export const SPAWN_BLOCK_REASON = {
  none: 'none',
  cleared: 'cleared',
  coolingDown: 'cooling_down',
  atCapacity: 'at_capacity',
  outOfRange: 'out_of_range'
};

export const SPAWN_BLOCK_LABELS = {
  [SPAWN_BLOCK_REASON.none]: '',
  [SPAWN_BLOCK_REASON.cleared]: '已被摧毁',
  [SPAWN_BLOCK_REASON.coolingDown]: '生成冷却中',
  [SPAWN_BLOCK_REASON.atCapacity]: '存活数已达上限',
  [SPAWN_BLOCK_REASON.outOfRange]: '不在活动范围'
};

export const SPAWN_POINT_RULES = {
  // 默认生成间隔与存活上限；每个点可以各自覆盖，避免全场同节奏
  intervalSeconds: 12,
  maxAlive: 6,
  // 同一批最多一次生成几个，防止冷却结束后一口气堆一堆
  maxPerTick: 2,
  // 首次生成的额外延迟：刚进关就贴脸刷怪体验很差
  initialDelaySeconds: 8,
  // 击败一个存活单位后立刻重新计时的下限，避免「杀一个立刻补一个」
  minimumIntervalSeconds: 4
};

export function spawnPointRules(overrides = {}) {
  return { ...SPAWN_POINT_RULES, ...(overrides ?? {}) };
}

// 把配置规范成运行时可用的点。缺字段一律走默认值，不允许出现 undefined 参与计算。
export function normalizeSpawnPoint(definition, index = 0, rules = SPAWN_POINT_RULES) {
  const resolved = spawnPointRules(rules);
  const interval = Number.isFinite(definition.intervalSeconds)
    ? Math.max(resolved.minimumIntervalSeconds, definition.intervalSeconds)
    : resolved.intervalSeconds;
  return {
    id: definition.id ?? `spawn-${index}`,
    // 名字要显式带过来：下面的映射是白名单，不带就等于没有，
    // UI 与结算提示会一直回落成 "spawn-xxx" 这种 id。
    name: definition.name != null ? String(definition.name) : null,
    x: Number(definition.x) || 0,
    z: Number(definition.z) || 0,
    intervalSeconds: interval,
    maxAlive: Math.max(1, Math.round(definition.maxAlive ?? resolved.maxAlive)),
    maxPerTick: Math.max(1, Math.round(definition.maxPerTick ?? resolved.maxPerTick)),
    // 出击半径：0 表示只守在原地，不做远距离追击
    leashRadius: Math.max(0, Number(definition.leashRadius) || 0),
    enemyPool: Array.isArray(definition.enemyPool) ? definition.enemyPool : [],
    // 掉落与劳动力奖励都在清点这个点时结算（见 Game.onSpawnPointCleared）。
    // 注意：这里是**显式白名单**——往 ISLAND_SPAWN_POINTS 里加字段时
    // 必须同时在下面登记，否则运行时会静默丢掉（workerReward 就这么丢过一次）。
    drops: Array.isArray(definition.drops) ? definition.drops : [],
    workerReward: normalizeWorkerReward(definition.workerReward),
    // 可招募单位的来源（需求：击破刷怪点时才生成在这个点上，不再开局散在野外）。
    recruitReward: normalizeRecruitReward(definition.recruitReward),
    // 巢穴血量的按点覆盖：0/缺省表示用 unit 定义里的值。起始点靠它压低，
    // 保证出生部队打得掉第一座巢穴（否则招募链是死循环）。
    nestHealth: Number(definition.nestHealth) > 0 ? Number(definition.nestHealth) : 0,
    cleared: definition.cleared === true,
    timer: Number.isFinite(definition.timer)
      ? definition.timer
      : (Number.isFinite(definition.initialDelaySeconds)
        ? definition.initialDelaySeconds
        : resolved.initialDelaySeconds)
  };
}

/** 清点奖励：傀儡来源（方案第 6.1 条）。数量上下限与 normalizeSpawnPoint 同口径。 */
function normalizeWorkerReward(raw) {
  if (!raw || typeof raw !== 'object' || !raw.type) return null;
  return {
    type: String(raw.type),
    count: Math.max(1, Math.min(4, Math.round(Number(raw.count) || 1)))
  };
}

/**
 * 清点奖励：可招募单位的来源。
 *
 * 为什么不做随机池（不像 `enemyPool` 那样带权重）：奖励是玩家**打下来的结果**，
 * 应该可预期、可断言。给哪一种、给几支，由数据直接写死；
 * `count` 超过 `types` 长度时按顺序循环取，不会出现"要 3 支但只配了 1 种"的空洞。
 */
function normalizeRecruitReward(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rawTypes = Array.isArray(raw.types) ? raw.types : [raw.type];
  const types = rawTypes
    .filter((type) => typeof type === 'string' && type)
    .map((type) => String(type));
  if (!types.length) return null;
  return {
    types,
    count: Math.max(1, Math.min(4, Math.round(Number(raw.count) || 1)))
  };
}

export function normalizeSpawnPoints(definitions = [], rules = SPAWN_POINT_RULES) {
  return definitions.map((definition, index) => normalizeSpawnPoint(definition, index, rules));
}

export function spawnPointState(point) {
  return point?.cleared ? SPAWN_POINT_STATE.cleared : SPAWN_POINT_STATE.active;
}

// 这个点现在为什么不能生怪。返回 none 才表示可以生。
// 顺序固定：先看是否已被摧毁，再看存活上限，最后看冷却——保证原因唯一。
export function spawnBlockReason(point, aliveCount = 0, { extraAlive = 0 } = {}) {
  if (!point) return SPAWN_BLOCK_REASON.cleared;
  if (point.cleared) return SPAWN_BLOCK_REASON.cleared;
  const cap = effectiveAliveCap(point, extraAlive);
  if (aliveCount >= cap) return SPAWN_BLOCK_REASON.atCapacity;
  if ((point.timer ?? 0) > 0) return SPAWN_BLOCK_REASON.coolingDown;
  return SPAWN_BLOCK_REASON.none;
}

function effectiveAliveCap(point, extraAlive = 0) {
  return Math.max(1, (point?.maxAlive ?? 1) + Math.max(0, Math.floor(Number(extraAlive) || 0)));
}

function effectivePerTick(point, extraPerTick = 0) {
  return Math.max(1, (point?.maxPerTick ?? 1) + Math.max(0, Math.floor(Number(extraPerTick) || 0)));
}

// 推进一个点的时间轴，返回这一点本段该生成几个。
// 关键点：冷却到点后**不会**因为「好久没生」而一口气补齐历史欠账，
// 一次最多 maxPerTick 个，且不能超过存活上限。
export function advanceSpawnPoint(point, {
  dt = 0,
  aliveCount = 0,
  rules = SPAWN_POINT_RULES,
  extraAlive = 0,
  extraPerTick = 0,
  allowSpawn = true
} = {}) {
  const resolved = spawnPointRules(rules);
  if (!point || point.cleared) {
    return { spawnCount: 0, reason: SPAWN_BLOCK_REASON.cleared, point };
  }
  const step = Math.max(0, dt);
  point.timer = Math.max(0, (point.timer ?? 0) - step);
  if (!allowSpawn) {
    // 白天冻结出兵：冷却照走，但到点也不生。否则入夜会把白天攒下的欠账一次倒出来。
    if (point.timer <= 0) point.timer = 0;
    return { spawnCount: 0, reason: SPAWN_BLOCK_REASON.outOfRange, point };
  }
  const cap = effectiveAliveCap(point, extraAlive);
  if (aliveCount >= cap) {
    // 满员时不重置计时器：否则一旦有人死掉就会立刻补齐，读起来像「杀一个补一个」
    return { spawnCount: 0, reason: SPAWN_BLOCK_REASON.atCapacity, point };
  }
  if (point.timer > 0) {
    return { spawnCount: 0, reason: SPAWN_BLOCK_REASON.coolingDown, point };
  }
  const room = Math.max(0, cap - aliveCount);
  const spawnCount = Math.min(room, effectivePerTick(point, extraPerTick));
  if (spawnCount <= 0) {
    return { spawnCount: 0, reason: SPAWN_BLOCK_REASON.atCapacity, point };
  }
  point.timer = Math.max(resolved.minimumIntervalSeconds, point.intervalSeconds);
  return { spawnCount, reason: SPAWN_BLOCK_REASON.none, point };
}

// 摧毁一个点：永久停止产怪，并清掉它的计时器。
// 已经生出来的敌人不受影响——清场是另一件事，这里只负责「这个点以后不再产」。
export function clearSpawnPoint(point) {
  if (!point) return false;
  if (point.cleared) return false;
  point.cleared = true;
  point.timer = 0;
  return true;
}

// 一批点的推进结果。aliveByPoint 是 { pointId: 存活数 }。
export function planSpawns(points = [], {
  dt = 0,
  aliveByPoint = {},
  rules = SPAWN_POINT_RULES,
  extraAlive = 0,
  extraPerTick = 0,
  allowSpawn = true
} = {}) {
  const results = [];
  points.forEach((point) => {
    const aliveCount = Math.max(0, aliveByPoint[point.id] ?? 0);
    const advanced = advanceSpawnPoint(point, {
      dt,
      aliveCount,
      rules,
      extraAlive,
      extraPerTick,
      allowSpawn
    });
    results.push({
      id: point.id,
      spawnCount: advanced.spawnCount,
      reason: advanced.reason,
      reasonLabel: SPAWN_BLOCK_LABELS[advanced.reason] ?? '',
      state: spawnPointState(point),
      aliveCount,
      timer: point.timer ?? 0
    });
  });
  return results;
}

// 胜负判定用的清除进度。文档要求「清除全部刷怪点」才算赢，
// 所以这里同时给出比例与是否全部清除，避免调用方自己写循环写错。
export function clearedProgress(points = []) {
  const total = points.length;
  const cleared = points.filter((point) => point?.cleared === true).length;
  return {
    total,
    cleared,
    remaining: total - cleared,
    ratio: total === 0 ? 1 : cleared / total,
    allCleared: total > 0 && cleared === total
  };
}
