import { TEAMS } from '../data/gameData.js';

/**
 * 单位归属的语义判定。
 *
 * 队伍只有 `player` / `enemy` 两档，所以**野生动物（isWildlife）与野外可招募单位
 * （isRecruitable）都挂在 enemy 队伍里**——这是复用现有注册/索敌/状态条链路的代价。
 * 于是"enemy 队伍"不等于"敌人"：任何清点敌人、给敌方上 Buff、基地自动开火、
 * 祭坛光环选目标之类的逻辑，都必须用下面这个判断，而不是 `team === 'enemy'`。
 *
 * 做成**自由函数而不是 UnitEntity 上的 getter**：测试与联机镜像里存在大量普通对象
 * 充当单位，getter 只在原型上，遇到普通对象会静默变成 undefined 从而让过滤条件永远为假。
 */
export function isHostileEnemy(unit) {
  return unit?.team === TEAMS.ENEMY
    && unit.isWildlife !== true
    && unit.isRecruitable !== true;
}

/** 野外中立、尚未被招募的单位。 */
export function isFieldRecruit(unit) {
  return unit?.isRecruitable === true;
}
