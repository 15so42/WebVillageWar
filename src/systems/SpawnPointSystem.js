// 刷怪点的状态归属方。
//
// spawnPoints.js 只回答「什么时候该生、还能生几个」；这里负责把它接到场景上：
// 按点位生成敌人、统计每个点当前还有多少存活、被摧毁后永久停止。
//
// 存活数**必须每帧从单位注册表现算**，不能用自己增减的计数器：
// 敌人可能被法术、陷阱、其它单位杀死，计数器不会跟着回滚，用久了必然漂移。
import {
  SPAWN_BLOCK_LABELS,
  SPAWN_POINT_RULES,
  clearSpawnPoint,
  clearedProgress,
  normalizeSpawnPoints,
  planSpawns,
  spawnPointHasAliveCap,
  spawnPointRules,
  spawnPointState
} from './spawnPoints.js';

// 规划不需要每帧跑：生成间隔以秒计，0.25 秒一次的精度绰绰有余
const PLAN_INTERVAL_SECONDS = 0.25;

export class SpawnPointSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = spawnPointRules(options.rules ?? SPAWN_POINT_RULES);
    this.points = [];
    this.planAccumulator = 0;
    this.stats = { spawned: 0, destroyed: 0, plans: 0 };
  }

  attach(definitions = []) {
    this.points = normalizeSpawnPoints(definitions, this.rules);
    this.planAccumulator = 0;
    this.stats = { spawned: 0, destroyed: 0, plans: 0 };
    return this;
  }

  pointById(pointId) {
    return this.points.find((point) => point.id === pointId) ?? null;
  }

  // 每个点当前还有多少敌人活着。来源是注册表，不是计数器。
  // 只认 spawnPointId：unit.spawnPoint 是旧波次流程在用的另一个字段（存坐标），
  // 两者混用会把旧敌人也算进来，并生成一个 "[object Object]" 的假分组。
  aliveByPoint() {
    const counts = {};
    const enemies = this.game?.enemyUnits
      ?? this.game?.unitRegistry?.enemyUnits
      ?? [];
    enemies.forEach((unit) => {
      const pointId = unit?.spawnPointId;
      if (!unit?.alive || typeof pointId !== 'string' || !pointId) return;
      // 巢穴自身也带 spawnPointId（用来关联摧毁），但它不是「这个点产出的敌人」，
      // 算进来会白白占掉一个存活名额。
      if (unit.isSpawnPointNest) return;
      counts[pointId] = (counts[pointId] ?? 0) + 1;
    });
    return counts;
  }

  update(dt) {
    if (!this.points.length) return;
    const step = Math.max(0, dt);
    this.planAccumulator += step;
    if (this.planAccumulator < PLAN_INTERVAL_SECONDS) return;
    const planDt = this.planAccumulator;
    this.planAccumulator = 0;
    this.stats.plans += 1;

    const alive = this.aliveByPoint();
    const raid = this.game?.nightRaidModifiers?.() ?? { extraAlive: 0, extraPerTick: 0 };
    const results = planSpawns(this.points, {
      dt: planDt,
      aliveByPoint: alive,
      rules: this.rules,
      extraAlive: raid.extraAlive,
      extraPerTick: raid.extraPerTick,
      allowSpawn: this.game?.canRaidSpawn?.() !== false
    });
    results.forEach((result) => {
      for (let i = 0; i < result.spawnCount; i += 1) {
        this.spawnOne(this.pointById(result.id), i);
      }
    });
    this.checkVictory();
  }

  spawnOne(point, index = 0) {
    if (!point) return null;
    const spawn = this.game?.spawnEnemyAt;
    if (typeof spawn !== 'function') return null;
    const type = this.pickType(point, index);
    if (!type) return null;
    const unit = spawn.call(this.game, type, { x: point.x, z: point.z }, {
      spawnPointId: point.id,
      leashRadius: point.leashRadius,
      radius: 1.4 + (index % 3) * 0.45,
      index,
      difficulty: this.game?.nightRaidDifficulty?.()
    });
    if (unit) this.stats.spawned += 1;
    return unit ?? null;
  }

  // 从点的敌人池里按权重挑一个。用点的 id + 已生成数做确定性选择，
  // 不用 Math.random：同一局的生成序列可复现，便于排查问题。
  pickType(point, index) {
    const pool = point.enemyPool ?? [];
    if (!pool.length) return null;
    const total = pool.reduce((sum, entry) => sum + Math.max(0, entry.weight ?? 1), 0);
    if (total <= 0) return pool[0].type;
    const seed = (this.stats.spawned * 7919 + index * 104729) % 1000;
    const target = (seed / 1000) * total;
    let cursor = 0;
    for (const entry of pool) {
      cursor += Math.max(0, entry.weight ?? 1);
      if (target <= cursor) return entry.type;
    }
    return pool[pool.length - 1].type;
  }

  // 摧毁一个点：永久停止产怪（clearSpawnPoint 是幂等的），并把"清掉这个点"这件事
  // 通知给 Game——掉落与劳动力奖励都在那边结算。
  // 返回 true 表示这**一次**真的完成了清除（重复调用返回 false），
  // 调用方据此保证奖励只发一次。
  destroyPoint(pointId) {
    const point = this.pointById(pointId);
    if (!point) return false;
    if (!clearSpawnPoint(point)) return false;
    this.stats.destroyed += 1;
    this.game?.onSpawnPointCleared?.(point);
    return true;
  }

  // 供 HUD 使用：每个点的可读状态
  progress() {
    const alive = this.aliveByPoint();
    const points = this.points.map((point) => {
      const aliveCount = alive[point.id] ?? 0;
      const capped = spawnPointHasAliveCap(point);
      const reason = point.cleared
        ? 'cleared'
        : (capped && aliveCount >= point.maxAlive ? 'at_capacity' : (point.timer > 0 ? 'cooling_down' : 'none'));
      return {
        id: point.id,
        name: point.name ?? point.id,
        state: spawnPointState(point),
        aliveCount,
        maxAlive: capped ? point.maxAlive : null,
        timer: Number((point.timer ?? 0).toFixed(1)),
        blockedReason: reason,
        blockedLabel: SPAWN_BLOCK_LABELS[reason] ?? ''
      };
    });
    return { ...clearedProgress(this.points), points };
  }

  // 胜负默认值（文档把这条列为待定）：全部点位被摧毁 **且** 没有残余敌人才算赢。
  // 只毁点不清场会让「最后一个点没了但怪还在打基地」永远结束不了。
  //
  // **这里刻意不带锁存**（曾经有一个 `victoryDeclared`）。
  // 为什么不能带：这个方法在同一帧会被调用两次——`update()` 每 0.25 秒调用一次
  // 并**丢掉返回值**，`Game.checkSurvivalLevelEnd()` 稍后又调用一次。
  // 带锁存时，只要「最后一个敌人死掉的那一帧」恰好是规划帧，第一次调用就把锁存置真、
  // 第二次调用直接返回 false，**通关被静默吞掉，而且之后再也不会赢**
  // （锁存已经为真，后续每次调用都返回 false）。
  // 玩家看到的就是「点位清光了、敌人也清光了，关卡却一直不结束」。
  // 幂等交给 `Game.finishLevel()`（它自己有 `levelFinished` 守卫）就够了。
  checkVictory() {
    if (!this.points.length) return false;
    const cleared = clearedProgress(this.points);
    if (!cleared.allCleared) return false;
    const alive = this.aliveByPoint();
    const remaining = Object.values(alive).reduce((sum, count) => sum + count, 0);
    return remaining <= 0;
  }

  serializeForSlot() {
    return {
      points: this.points.map((point) => ({
        id: point.id,
        cleared: point.cleared === true,
        timer: point.timer ?? 0
      }))
    };
  }

  applySnapshot(snapshot) {
    if (!snapshot?.points) return false;
    const byId = new Map(this.points.map((point) => [point.id, point]));
    snapshot.points.forEach((entry) => {
      const point = byId.get(entry?.id);
      if (!point) return;
      point.cleared = entry.cleared === true;
      point.timer = Number.isFinite(entry.timer) ? entry.timer : point.timer;
    });
    return true;
  }
}
