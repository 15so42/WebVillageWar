// 威胁度的运行时：每帧把敌人写进二维数组，并给傀儡提供"哪里危险 / 该往哪逃"。
//
// 纯逻辑在 `threatField.js`（网格、叠加、采样、逃跑落点全都是无副作用的函数），
// 这里只做三件与世界相关的事：
//   1. 按 `battlefieldBounds()` 建数组，并在关卡换图/边界变化时重建；
//   2. 每帧清空后按敌人位置与半径重新写入（敌人一动，威胁分布就跟着动）；
//   3. 调试叠加显示（Shift+G）——用户要求"加一个调试开关可叠加显示"。
//
// 为什么自己持有网格而不是塞进 `world.navGrid`：navGrid 是 0.8m 的可走性网格，
// 而且不是每个关卡都有；威胁度需要"任何关卡、任何时刻"都可用，粒度 2m 也够。
import * as THREE from 'three';
import {
  addThreatCircle,
  chooseEscapeTarget,
  chooseFleeTarget,
  clearThreatField,
  createThreatField,
  threatAt,
  threatBandAt,
  threatRules,
  THREAT_BAND_LABELS
} from './threatField.js';
import { isMobileThreat } from './combatReflex.js';
import { isThreateningUnit } from './unitTeam.js';
import { unitCombatPower } from './puppetArms.js';

const DEBUG_REFRESH_SECONDS = 0.2;
const DEBUG_MAX_CELLS = 6000;

export class ThreatFieldSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = threatRules(options.rules ?? {});
    this.field = null;
    /** 建格时用的边界签名：关卡换了（或第一次拿到边界）就重建。 */
    this.boundsSignature = '';
    this.debugEnabled = false;
    this.debugGroup = null;
    this.debugMesh = null;
    this.debugRefresh = 0;
    this.debugCells = 0;
    this.scratchThreats = [];
    this.scratchPoint = { x: 0, z: 0 };
    this.scratchVector = new THREE.Vector3();
    /** 统计量，供验收脚本与调试面板读取。 */
    this.stats = { enemies: 0, writes: 0, peak: 0, rebuilds: 0 };
  }

  get cellSize() {
    return this.field?.cellSize ?? this.rules.cellSize;
  }

  /**
   * 场地尺寸取自 `game.battlefieldBounds()` —— 和镜头裁剪、信标落点用的是同一个矩形，
   * 所以威胁数组的覆盖范围**不会**和"能走的地方"错位。
   */
  ensureField() {
    const bounds = this.game?.battlefieldBounds?.() ?? null;
    if (!bounds) return null;
    const signature = `${bounds.minX}:${bounds.maxX}:${bounds.minZ}:${bounds.maxZ}`;
    if (this.field && signature === this.boundsSignature) return this.field;
    this.field = createThreatField(bounds, { cellSize: this.rules.cellSize });
    this.boundsSignature = signature;
    this.stats.rebuilds += 1;
    this.debugMesh = null;
    if (this.debugGroup) {
      this.debugGroup.clear();
    }
    return this.field;
  }

  /** 每帧：清空 → 把每个敌人按自己的半径与战力叠进去。 */
  update(dt = 0) {
    const field = this.ensureField();
    if (!field) return;
    clearThreatField(field);
    const enemies = this.game?.enemyUnits ?? [];
    let count = 0;
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      if (!enemy?.alive || !isThreateningUnit(enemy)) continue;
      const sample = this.threatSampleFor(enemy);
      if (!sample) continue;
      count += 1;
      addThreatCircle(field, sample.x, sample.z, sample.radius, sample.power);
    }
    this.stats.enemies = count;
    this.stats.writes = field.written;
    this.stats.peak = field.peak;
    if (this.debugEnabled) {
      this.debugRefresh -= Math.max(0, dt);
      if (this.debugRefresh <= 0) {
        this.debugRefresh = DEBUG_REFRESH_SECONDS;
        this.updateDebugOverlay();
      }
    }
  }

  /**
   * 一个敌人对威胁数组的贡献。
   *
   * 半径取「索敌半径」，因为那正好是"它开始咬人"的距离；没有索敌半径的单位
   * （巢穴、静止建筑）退回「攻击距离 + 3」，保证它们至少有一圈可见的领土。
   * 战力用与傀儡同一个公式——威胁度与"打不打得过"必须是同一把尺子。
   *
   * ⚠️ 判据是 `isThreateningUnit` 而不是 `isHostileEnemy`：野生动物（狼、熊）
   * 也会咬傀儡，但它们不算"敌军"（基地自动开火那条线刻意排除它们）。
   * 一开始这里用的是 `isHostileEnemy`，结果傀儡会在狼群里"判定为安全"继续砍树——
   * 这一条是验收脚本抓出来的。
   */
  threatSampleFor(unit) {
    const position = unit?.position;
    if (!position) return null;
    const modifiers = this.game?.modifiers;
    const definition = unit.definition ?? {};
    let power = unitCombatPower(unit);
    // 巢穴自己不出手（战力 0），但它显然是危险地点，而且它不会移动，
    // 所以给一个固定强度当"地标威胁"，让傀儡平时就绕着它干活。
    if (power <= 0) {
      if (unit.isSpawnPointNest) power = 6;
      else return null;
    }
    const aggro = Number(modifiers?.getAggroRange?.(unit)) || Number(definition.aggroRange) || 0;
    const attackRange = Number(modifiers?.getAttackRange?.(unit)) || Number(definition.attackRange) || 0;
    const radius = Math.max(3, aggro > 0 ? aggro : attackRange + 3);
    return { x: position.x, z: position.z, radius, power };
  }

  threatAt(x, z) {
    return threatAt(this.field, x, z);
  }

  threatAtUnit(unit) {
    const position = unit?.position;
    if (!position) return 0;
    return threatAt(this.field, position.x, position.z);
  }

  threatLabelAt(x, z) {
    return THREAT_BAND_LABELS[threatBandAt(this.field, x, z)] ?? '安全';
  }

  /**
   * 傀儡做决策用的威胁列表：传入 `{x,z}`，返回 `{x,z,power,distance}`。
   * 复用同一个数组，**不要**保留返回值——每帧会被重写。
   */
  threatsNear(point, radius = this.rules.pressureRadius) {
    const out = this.scratchThreats;
    out.length = 0;
    const enemies = this.game?.enemyUnits ?? [];
    if (!point) return out;
    const reach = Math.max(0, Number(radius) || 0);
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      if (!enemy?.alive || !isThreateningUnit(enemy)) continue;
      const sample = this.threatSampleFor(enemy);
      if (!sample) continue;
      const dx = sample.x - point.x;
      const dz = sample.z - point.z;
      const distance = Math.hypot(dx, dz);
      if (distance > reach) continue;
      out.push({ unit: enemy, x: sample.x, z: sample.z, power: sample.power, distance });
    }
    out.sort((a, b) => a.distance - b.distance);
    return out;
  }

  /**
   * 逃跑落点。两个注入的回调都来自游戏世界，所以落点不会掉进海里、也不会卡在墙后：
   *   - `isPointWalkable`：这个点能不能站人；
   *   - `hasSafeSurfaceLine`：从傀儡到落点有没有一条**直线可走**的路。
   *     只有前者是不够的——墙后隔一格就是可走的，但直线过去会撞墙。
   *
   * 找不到更安全的地方就走"背离最近威胁"的兜底方向。
   */
  fleeTargetFor(unit, options = {}) {
    if (!this.field || !unit?.position) return null;
    const point = this.scratchPoint;
    point.x = unit.position.x;
    point.z = unit.position.z;
    const target = chooseFleeTarget(this.field, point, {
      rules: this.rules,
      isWalkable: (x, z) => this.isWalkablePoint(x, z),
      hasLine: (from, to) => this.hasLineTo(from, to),
      rings: options.rings,
      stepSize: options.stepSize
    });
    if (target) {
      return {
        x: target.x,
        z: target.z,
        threat: target.threat,
        distance: target.distance,
        // 'safe-cell' 与 'away-from-threat' 的区分对验收有用：
        // 前者是"找到了低威胁格"，后者是"哪都不安全，只能背着敌人跑"。
        source: 'safe-cell',
        // 有没有直线可走：验收与调试用它区分"真的绕得过去"和"只能靠寻路硬绕"
        hasLine: target.hasLine === true
      };
    }
    return this.retreatAwayFromThreat(unit, options);
  }

  /**
   * **甩掉追兵**用的落点：跑到「离最近的追兵最远」的可走点，采样半径一直覆盖到 `reach`。
   *
   * 与 `fleeTargetFor` 的区别见 `threatField.chooseEscapeTarget` 的注释：
   * 那个按威胁值挑（平时避让用），这个按离追兵的距离挑（逃命用）。
   * 两个都在用，不是重复实现。
   */
  escapeTargetFor(unit, options = {}) {
    if (!this.field || !unit?.position) return null;
    const reach = Math.max(1, Number(options.reach) || this.rules.fleeDistance);
    const point = this.scratchPoint;
    point.x = unit.position.x;
    point.z = unit.position.z;
    const pursuers = this.pursuersNear(point, reach);
    const target = chooseEscapeTarget(this.field, point, pursuers, {
      rules: this.rules,
      reach,
      rings: options.rings,
      isWalkable: (x, z) => this.isWalkablePoint(x, z),
      hasLine: (from, to) => this.hasLineTo(from, to)
    });
    if (target) return target;
    // 一个"能拉开距离"的落点都没有（被逼到角落）：退化为背离最近威胁的直线方向。
    // 再不行返回 null，由逃跑阶段自己的"退无可退"检测（cornered）接手。
    const fallback = this.retreatAwayFromThreat(unit, { stepSize: reach / 2 });
    return fallback ? { ...fallback, clearance: 0 } : null;
  }

  /**
   * 追兵：`radius` 之内会主动伤人的**移动**单位。
   *
   * 巢穴不算——它在威胁数组里有固定强度（"危险地点"），但它不会追人。
   * 把它算进"身边还有没有威胁"的话，傀儡只要在巢穴 14m 之内就永远跑不完一趟，
   * 逃跑会变成一场没有终点的长跑。
   */
  pursuersNear(point, radius = this.rules.fleeDistance) {
    const all = this.threatsNear(point, radius);
    const out = [];
    for (let i = 0; i < all.length; i += 1) {
      if (isMobileThreat(all[i].unit)) out.push(all[i]);
    }
    return out;
  }

  /** 两点之间有没有直线可走的路径（没有导航网格时退化为"都算有"）。 */
  hasLineTo(from, to) {
    const hasLine = this.game?.hasSafeSurfaceLine;
    if (typeof hasLine !== 'function') return true;
    return hasLine.call(this.game, from, to) === true;
  }

  /**
   * 兜底逃跑方向：所有环上都没有"更安全的可走格"时（比如被逼到海岸线），
   * 至少朝着远离最近威胁的方向退一段。
   *
   * 没有这个兜底会出现最糟的表现：傀儡站在原地被咬死，而玩家看着它"有空地却不跑"。
   * 方向取"背离最近威胁"，落点仍然要过 `resolveWalkablePoint`，
   * 所以不会退进海里或障碍里。
   */
  retreatAwayFromThreat(unit, options = {}) {
    const threats = this.threatsNear({ x: unit.position.x, z: unit.position.z }, this.rules.pressureRadius);
    if (!threats.length) return null;
    const nearest = threats[0];
    const awayX = unit.position.x - nearest.x;
    const awayZ = unit.position.z - nearest.z;
    const length = Math.hypot(awayX, awayZ);
    if (!(length > 1e-3)) return null;
    // `stepSize` 没给就用兜底步长。**不能**让 `undefined * 2` 变成 `NaN`：
    // 那会让落点算成 NaN，而调用方只看到"找不到落点"，症状是傀儡被堵住时原地不动。
    const stepSize = Number(options.stepSize);
    const distance = Math.max(
      1,
      Number.isFinite(stepSize) && stepSize > 0 ? stepSize * 2 : this.rules.fleeDistance
    );
    // `resolveWalkablePoint` 内部会 clone 并可能交给 navGrid 的最近可走格查找，
    // 所以必须喂一个真的 Vector3，不能拿 {x,z} 字面量糊弄。
    const raw = this.scratchVector.set(
      unit.position.x + (awayX / length) * distance,
      0,
      unit.position.z + (awayZ / length) * distance
    );
    const resolve = this.game?.resolveWalkablePoint;
    const resolved = typeof resolve === 'function' ? resolve.call(this.game, raw) : raw;
    const x = resolved?.x ?? raw.x;
    const z = resolved?.z ?? raw.z;
    if (!this.isWalkablePoint(x, z)) return null;
    return { x, z, threat: threatAt(this.field, x, z), distance, source: 'away-from-threat' };
  }

  isWalkablePoint(x, z) {
    const isWalkable = this.game?.isPointWalkable;
    if (typeof isWalkable !== 'function') return true;
    return isWalkable.call(this.game, { x, z }) === true;
  }

  // ------------------------------------------------------------------ 调试叠加
  isDebugEnabled() {
    return this.debugEnabled;
  }

  setDebugEnabled(enabled) {
    this.debugEnabled = enabled === true;
    if (!this.debugEnabled) {
      if (this.debugGroup) this.debugGroup.visible = false;
      return false;
    }
    this.debugRefresh = 0;
    this.updateDebugOverlay();
    if (this.debugGroup) this.debugGroup.visible = true;
    return true;
  }

  toggleDebug() {
    return this.setDebugEnabled(!this.debugEnabled);
  }

  /**
   * 把威胁数组画成贴地的热力网格。
   *
   * 只给"这一帧真的有威胁"的格子建实例：岛上 117×109 格，全画是 12753 个面片，
   * 而实际有威胁的位置通常只有几百到两千格。用 `InstancedMesh` 一次 draw call 画完，
   * 关掉开关就整组隐藏，不进常规渲染路径。
   */
  updateDebugOverlay() {
    const scene = this.game?.scene;
    const field = this.field;
    if (!scene || !field || !this.debugEnabled) return;
    if (!this.debugGroup) {
      this.debugGroup = new THREE.Group();
      this.debugGroup.name = 'ThreatFieldDebug';
      scene.add(this.debugGroup);
    }
    const geometry = new THREE.PlaneGeometry(field.cellSize * 0.94, field.cellSize * 0.94);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      vertexColors: true,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.InstancedMesh(geometry, material, DEBUG_MAX_CELLS);
    mesh.frustumCulled = false;
    mesh.name = 'ThreatFieldDebugCells';

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const peak = Math.max(1e-6, field.peak);
    const center = { x: 0, z: 0 };
    let instances = 0;
    for (let cz = 0; cz < field.rows && instances < DEBUG_MAX_CELLS; cz += 1) {
      for (let cx = 0; cx < field.cols && instances < DEBUG_MAX_CELLS; cx += 1) {
        const value = field.data[cz * field.cols + cx];
        if (!(value > 0.01)) continue;
        center.x = field.minX + (cx + 0.5) * field.cellSize;
        center.z = field.minZ + (cz + 0.5) * field.cellSize;
        const y = (this.game.groundHeightAt?.(center) ?? 0) + 0.06;
        matrix.makeTranslation(center.x, y, center.z);
        mesh.setMatrixAt(instances, matrix);
        color.setHex(threatDebugColor(value / peak));
        mesh.setColorAt(instances, color);
        instances += 1;
      }
    }
    mesh.count = instances;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // 换掉上一帧的实例网格并释放它的几何体/材质：每 0.2s 一次，代价可忽略，
    // 但绝不能只是 remove 而不 dispose，否则开关一开一关就会漏 GPU 资源。
    const previous = this.debugMesh;
    this.debugGroup.clear();
    this.debugGroup.add(mesh);
    this.debugMesh = mesh;
    this.debugCells = instances;
    if (previous) {
      previous.geometry?.dispose?.();
      previous.material?.dispose?.();
      previous.dispose?.();
    }
  }

  destroy() {
    this.debugGroup?.removeFromParent?.();
    this.debugMesh?.geometry?.dispose?.();
    this.debugMesh?.material?.dispose?.();
    this.debugMesh?.dispose?.();
    this.debugGroup = null;
    this.debugMesh = null;
    this.field = null;
  }
}

/** 绿 → 黄 → 红：与"安全/危险"的直觉一致，避免用蓝紫这类不表达危险的颜色。 */
export function threatDebugColor(ratio) {
  const value = Math.min(1, Math.max(0, Number(ratio) || 0));
  if (value < 0.5) {
    const t = value / 0.5;
    return (Math.round(0x4c + (0xf2 - 0x4c) * t) << 16)
      | (Math.round(0xd1 + (0xd0 - 0xd1) * t) << 8)
      | Math.round(0x5a + (0x36 - 0x5a) * t);
  }
  const t = (value - 0.5) / 0.5;
  return (Math.round(0xf2 + (0xe0 - 0xf2) * t) << 16)
    | (Math.round(0xd0 + (0x3a - 0xd0) * t) << 8)
    | Math.round(0x36 + (0x2a - 0x36) * t);
}
