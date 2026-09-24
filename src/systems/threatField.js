// 覆盖整个场景的「威胁度二维数组」（纯逻辑，不碰 THREE / DOM / Game）。
//
// 需求原文：「关于威胁度，可以单独维护一个二维数组，覆盖场景，敌人判断自己位置并
// 根据自己的半径叠加威胁度在数组中。木傀儡就可以判断哪里危险。」
//
// 所以这个模块只管三件事，别的都不管：
//   1. 开一块覆盖 `battlefieldBounds()` 的二维数组（`Float32Array`，一格 2m）；
//   2. 敌人把自己的战力按半径叠加进去（`addThreatCircle`）；
//   3. 傀儡读任意世界坐标的威胁值（`threatAt`），并挑一个低威胁的逃跑落点
//      （`chooseFleeTarget`）。
//
// 为什么不复用 `world.navGrid.walkable` 的网格：
//   - navGrid 的格子是 0.8m 的**可走性**网格，粒度细了 6 倍以上，逐帧清空+写入
//     的成本高很多，而威胁度是"区域"概念，2m 足够；
//   - navGrid 不是每个关卡都有，威胁度则要求"任何关卡都能用"。
//   两者互不依赖，运行时（ThreatFieldSystem）只把 `world.isWalkable` 当回调传进来。
//
// 为什么是**每帧清空后重写**而不是衰减累积：
//   清空是一次 `fill(0)`（岛上是 117×109 = 12753 个 float，代价可忽略），
//   语义也比"衰减"明确得多——数组永远等于"当前这一刻的威胁分布"，
//   不会因为掉帧或暂停残留上一层的历史值。

export const THREAT_RULES = {
  /** 一格多少米。2m 在 232×216 的地图上得到 117×109 格。 */
  cellSize: 2,
  /** 逃跑落点的搜索环 */
  fleeRings: 4,
  fleeSamplesPerRing: 12,
  /** 落点至少要比原地低这么多威胁值才值得动（防止贴着威胁边缘来回抖） */
  fleeImprovement: 0.25,
  /**
   * 兜底逃跑步长（米）。`retreatAwayFromThreat` 在没有 `stepSize` 时用它。
   *
   * 曾经这里没有这个键，而兜底路径写的是 `Number(options.stepSize) * 2 || this.rules.fleeDistance`——
   * `undefined * 2` 是 `NaN`，`NaN || undefined` 还是 `undefined`，于是落点算成 `NaN`，
   * 傀儡被逼到"一个安全格都找不到"时反而会原地不动。默认值堵掉这条静默路径。
   */
  fleeDistance: 10
};

export const THREAT_BAND = {
  none: 'none',
  low: 'low',
  medium: 'medium',
  high: 'high',
  extreme: 'extreme'
};

export const THREAT_BAND_LABELS = {
  [THREAT_BAND.none]: '安全',
  [THREAT_BAND.low]: '轻微',
  [THREAT_BAND.medium]: '危险',
  [THREAT_BAND.high]: '很危险',
  [THREAT_BAND.extreme]: '致命'
};

export function threatRules(overrides = {}) {
  return { ...THREAT_RULES, ...(overrides ?? {}) };
}

/** 按关卡边界建一块威胁度数组。`bounds` 用 `{minX,maxX,minZ,maxZ}`。 */
export function createThreatField(bounds = {}, options = {}) {
  const cellSize = Math.max(0.25, Number(options.cellSize) || THREAT_RULES.cellSize);
  const minX = Number.isFinite(bounds.minX) ? bounds.minX : -50;
  const maxX = Number.isFinite(bounds.maxX) ? bounds.maxX : 50;
  const minZ = Number.isFinite(bounds.minZ) ? bounds.minZ : -50;
  const maxZ = Number.isFinite(bounds.maxZ) ? bounds.maxZ : 50;
  const cols = Math.max(1, Math.ceil((maxX - minX) / cellSize));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / cellSize));
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    cellSize,
    cols,
    rows,
    data: new Float32Array(cols * rows),
    /** 这一帧写进去的最大威胁值。调试显示与色带归一化都读它。 */
    peak: 0,
    /** 这一帧有没有真的写过东西（决定调试层要不要重建） */
    written: 0
  };
}

export function clearThreatField(field) {
  if (!field) return field;
  field.data.fill(0);
  field.peak = 0;
  field.written = 0;
  return field;
}

export function threatInBounds(field, cx, cz) {
  return Boolean(field) && cx >= 0 && cz >= 0 && cx < field.cols && cz < field.rows;
}

export function fieldIndex(field, cx, cz) {
  return cz * field.cols + cx;
}

/** 世界坐标 → 格号（不裁剪；越界由调用方用 threatInBounds 判断）。 */
export function cellOfX(field, x) {
  return Math.floor((x - field.minX) / field.cellSize);
}

export function cellOfZ(field, z) {
  return Math.floor((z - field.minZ) / field.cellSize);
}

/** 格中心的世界坐标。刻意写成写进 `out` 的形式，避免每格 new 一个对象。 */
export function cellCenter(field, cx, cz, out = { x: 0, z: 0 }) {
  out.x = field.minX + (cx + 0.5) * field.cellSize;
  out.z = field.minZ + (cz + 0.5) * field.cellSize;
  return out;
}

/**
 * 把一个半径为 `radius`、强度为 `amount` 的威胁圆叠加进数组。
 * 衰减用线性 `1 - d/r`：中心最强、边缘为 0，保证"半径"这个参数真的等于影响范围，
 * 而不是一个和实际写法无关的装饰值。
 */
export function addThreatCircle(field, x, z, radius, amount) {
  if (!field) return 0;
  const power = Number(amount) || 0;
  const reach = Number(radius) || 0;
  if (power <= 0 || reach <= 0) return 0;
  const minCx = cellOfX(field, x - reach);
  const maxCx = cellOfX(field, x + reach);
  const minCz = cellOfZ(field, z - reach);
  const maxCz = cellOfZ(field, z + reach);
  let writes = 0;
  const center = { x: 0, z: 0 };
  for (let cz = Math.max(0, minCz); cz <= Math.min(field.rows - 1, maxCz); cz += 1) {
    for (let cx = Math.max(0, minCx); cx <= Math.min(field.cols - 1, maxCx); cx += 1) {
      cellCenter(field, cx, cz, center);
      const distance = Math.hypot(center.x - x, center.z - z);
      if (distance >= reach) continue;
      const value = power * (1 - distance / reach);
      const index = fieldIndex(field, cx, cz);
      field.data[index] += value;
      if (field.data[index] > field.peak) field.peak = field.data[index];
      writes += 1;
    }
  }
  field.written += writes;
  return writes;
}

/** 任意世界坐标的威胁值；越界返回 0（地图外不是"安全区"，但对傀儡没有意义）。 */
export function threatAt(field, x, z) {
  if (!field) return 0;
  const cx = cellOfX(field, x);
  const cz = cellOfZ(field, z);
  if (!threatInBounds(field, cx, cz)) return 0;
  return field.data[fieldIndex(field, cx, cz)];
}

/** 归一化到 0..1（相对这一帧的最大值）。色带与"这里到底多危险"的判断都用它。 */
export function threatRatio(field, x, z, peak = null) {
  const peakValue = Number.isFinite(peak) ? peak : field?.peak ?? 0;
  if (!(peakValue > 0)) return 0;
  return Math.min(1, Math.max(0, threatAt(field, x, z) / peakValue));
}

export function threatBandFor(value, peak = null) {
  const denominator = Number.isFinite(peak) && peak > 0 ? peak : null;
  const ratio = denominator ? value / denominator : value;
  if (!(ratio > 0.001)) return THREAT_BAND.none;
  if (ratio < 0.25) return THREAT_BAND.low;
  if (ratio < 0.5) return THREAT_BAND.medium;
  if (ratio < 0.8) return THREAT_BAND.high;
  return THREAT_BAND.extreme;
}

export function threatBandAt(field, x, z) {
  return threatBandFor(threatAt(field, x, z), field?.peak ?? 0);
}

/**
 * 逃命落点：以 `reach` 为半径环形采样，挑「**离最近的追兵最远**」的那个可走点。
 *
 * 与 `chooseFleeTarget` 的分工是刻意的，两个都在用：
 *   - `chooseFleeTarget` 回答"这一片哪里威胁值最低"——用于平时避开危险区，
 *     它按威胁值排序、距离只做同分时的次要判据；
 *   - 本函数回答"**怎么才能真的甩掉它**"，第一判据是离最近追兵的中心距。
 *     用威胁值排不出"3 米外"和"14 米外"的差别：威胁圈外一律是 0。
 *
 * Numen 把这件事写在同一处结论里：逃跑距离必须**远大于**危险半径——
 * "后者是'退出去就能接着打'的两三格，前者是'它已经跟不上了'。
 * 两件事共用一个数的时候，她退两格就判'跑掉了'、站住、被追上，于是走走停停"。
 * 用户报的「木傀儡和狼互相拉扯」就是这条。
 *
 * 排序：距最近追兵的距离（越大越好）→ 威胁值（越小越好）→ 路程（越短越好）。
 * 后两级保证"同样甩得掉时，往威胁小的方向、少走冤枉路"，也就是用户第 3 轮要的
 * 「逃跑要朝威胁小的方向跑」。
 *
 * 返回 `{ x, z, threat, clearance, distance, hasLine }`；一个可接受的落点都没有时返回
 * `null`（调用方退化为"背离最近威胁"的直线方向）。
 */
export function chooseEscapeTarget(field, from, threats = [], options = {}) {
  if (!field || !from) return null;
  const isWalkable = typeof options.isWalkable === 'function' ? options.isWalkable : () => true;
  const hasLine = typeof options.hasLine === 'function' ? options.hasLine : () => true;
  const reach = Math.max(field.cellSize, Number(options.reach) || field.cellSize * 4);
  const rings = Math.max(1, Math.floor(Number(options.rings) || 6));
  const samples = Math.max(4, Math.floor(Number(options.samplesPerRing) || 16));
  const stepSize = reach / rings;
  const improvement = Number.isFinite(options.improvement)
    ? Number(options.improvement)
    : threatRules(options.rules).fleeImprovement;

  /** 这一点离最近的追兵有多远。没有追兵时是 Infinity（"随便哪都行"）。 */
  const clearanceAt = (x, z) => {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < threats.length; i += 1) {
      const threat = threats[i];
      if (!threat) continue;
      const distance = Math.hypot((threat.x ?? 0) - x, (threat.z ?? 0) - z);
      if (distance < best) best = distance;
    }
    return best;
  };

  const hereClearance = clearanceAt(from.x, from.z);
  // "值得动"的门槛：离追兵至少要拉开这么多，否则会在原地一小步一小步地蹭。
  const required = hereClearance === Number.POSITIVE_INFINITY
    ? Number.NEGATIVE_INFINITY
    : hereClearance + improvement;

  const better = (candidate, incumbent) => {
    if (!incumbent) return true;
    if (candidate.clearance > incumbent.clearance + 1e-6) return true;
    if (candidate.clearance < incumbent.clearance - 1e-6) return false;
    if (candidate.threat < incumbent.threat - 1e-6) return true;
    if (candidate.threat > incumbent.threat + 1e-6) return false;
    return candidate.distance < incumbent.distance;
  };

  let bestWithLine = null;
  let bestAny = null;
  for (let ring = 1; ring <= rings; ring += 1) {
    const radius = stepSize * ring;
    for (let index = 0; index < samples; index += 1) {
      const angle = (index / samples) * Math.PI * 2;
      const x = from.x + Math.cos(angle) * radius;
      const z = from.z + Math.sin(angle) * radius;
      if (!isWalkable(x, z)) continue;
      const clearance = clearanceAt(x, z);
      if (!(clearance > required)) continue;
      const candidate = { x, z, threat: threatAt(field, x, z), clearance, distance: radius };
      if (better(candidate, bestAny)) bestAny = candidate;
      if (hasLine(from, candidate) && better(candidate, bestWithLine)) {
        bestWithLine = { ...candidate, hasLine: true };
      }
    }
  }
  // 先要有直线的（不容易卡在墙角），没有才用"可走但没直线"的——后者交给寻路绕
  const chosen = bestWithLine ?? bestAny;
  if (!chosen) return null;
  return { ...chosen, hasLine: Boolean(bestWithLine), source: 'escape' };
}

/**
 * 挑一个"逃到哪儿"的落点。
 *
 * 算法是**采样环**而不是梯度下降：环采样能明确回答"周围有没有可走且更安全的地方"，
 * 找不到就返回 null 让调用方原地不动；梯度下降在平坦区域会随机漂移，
 * 在威胁数组这种分段常数的场上尤其容易抖。
 *
 * 两条判据的分工（都是实测踩出来的）：
 *
 * 1. **在所有环里取威胁最小的那个方向**，而不是"最近的那一环里随便一个安全格"。
 *    用户原话：「逃跑要朝威胁小的方向跑」。早先的写法是找到第一个有安全格的环就
 *    停下来，于是"左边 3m 处威胁从 8 降到 6"会胜过"右边 9m 处威胁为 0"——
 *    傀儡会贴着威胁边缘横着挪，而不是真的跑开。现在威胁优先、距离只做同分时的
 *    次要判据（同样安全就走近的，少跑冤枉路）。
 *
 * 2. **优先要"直线可达"的落点**（`hasLine`），只有没有这样的落点时才退而求其次。
 *    光判断"这个点可走"是不够的：一堵墙后面隔一格就是可走的，但直线过去会撞墙。
 *    有直线的落点几乎不可能卡在墙角的凹槽里。剩下的情况交给寻路（`applyFlee` 走
 *    A* 路线），所以这条只是**降低**卡住的概率，不是唯一保障。
 *
 * `isWalkable(x, z)` / `hasLine(from, to)` 都由调用方注入（通常就是
 * `game.isPointWalkable` / `game.hasSafeSurfaceLine`），
 * 所以这个函数仍然与世界实现无关、可以单测。
 *
 * 返回 `{ x, z, threat, distance, hasLine }`，找不到返回 null。
 */
export function chooseFleeTarget(field, from, options = {}) {
  if (!field || !from) return null;
  const resolved = threatRules(options.rules);
  const isWalkable = typeof options.isWalkable === 'function' ? options.isWalkable : () => true;
  const hasLine = typeof options.hasLine === 'function' ? options.hasLine : () => true;
  // 环形采样半径：从一格开始，到 fleeDistance
  const stepSize = Math.max(field.cellSize, Number(options.stepSize) || field.cellSize * 1.5);
  const maxRings = Math.max(1, Math.floor(Number(options.rings) || resolved.fleeRings));
  const samples = Math.max(4, Math.floor(Number(options.samplesPerRing) || resolved.fleeSamplesPerRing));
  const improvement = Number.isFinite(options.improvement) ? Number(options.improvement) : resolved.fleeImprovement;

  const here = threatAt(field, from.x, from.z);
  // 「值得动」的门槛：既要有相对改善，也要有一个绝对下限，否则在威胁值极低时
  // 会把"0.01 → 0.005"当成值得跑一趟，傀儡就会一直在原地小步挪。
  const absoluteFloor = Math.max(0.05, here * improvement);
  const threshold = here - Math.max(improvement * here, absoluteFloor * 0.5);

  // 威胁更低者胜；威胁相同（差 < 1e-6）时取更近的
  const better = (candidate, incumbent) => {
    if (!incumbent) return true;
    if (candidate.threat < incumbent.threat - 1e-6) return true;
    if (candidate.threat > incumbent.threat + 1e-6) return false;
    return candidate.distance < incumbent.distance;
  };

  let bestWithLine = null;
  let bestAny = null;
  for (let ring = 1; ring <= maxRings; ring += 1) {
    const radius = stepSize * ring;
    for (let index = 0; index < samples; index += 1) {
      const angle = (index / samples) * Math.PI * 2;
      const x = from.x + Math.cos(angle) * radius;
      const z = from.z + Math.sin(angle) * radius;
      if (!isWalkable(x, z)) continue;
      const threat = threatAt(field, x, z);
      if (threat > threshold) continue;
      const candidate = { x, z, threat, distance: radius };
      if (better(candidate, bestAny)) bestAny = candidate;
      if (hasLine(from, candidate) && better(candidate, bestWithLine)) {
        bestWithLine = { ...candidate, hasLine: true };
      }
    }
  }
  // 先要有直线的（不容易卡在墙角），没有才用"可走但没直线"的——后者交给寻路绕
  const chosen = bestWithLine ?? bestAny;
  if (!chosen) return null;
  return { ...chosen, hasLine: Boolean(bestWithLine) };
}
