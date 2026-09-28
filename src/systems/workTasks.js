// 傀儡的工作任务（纯逻辑）。
//
// 采集优先级不是另一套系统：资源面板上点出来的数字，和合成、存放、取出，
// 都是任务，进同一条队列。差别只在任务种类：
//   - 每一次框选资源点 = 一条采集任务（不是把整片林子并进「木材需求」）
//   - 手动工作台能做配方 = 一条合成任务
//   - 箱子 / 基地 / 工作台按过滤收东西 = 一条存放任务（木傀儡从背包搬进容器）
//
// 队列里数字越小越先做。资源面板是反的（点「＋」数字变大、傀儡更想采），
// 所以进队列前要折一次：面板 5 → 任务 1，面板 3 → 任务 3，面板 1 → 任务 5。
// 这样默认的木材（3）仍排在「能合成（5）」和「存箱子（6）」前面，
// 工作台做不了任何配方时合成任务落到 12，几乎不会有人专门跑过去。
import { PRIORITY_MAX } from './resourcePriority.js';
import { canCraft } from './crafting.js';

export const CRAFT_READY_PRIORITY = 5;
export const STORE_PRIORITY = 6;
/** 存放任务优先级可调范围（数字越小越先做，与合成 5、默认存放 6 同尺度）。 */
export const STORE_TASK_PRIORITY_MIN = 1;
export const STORE_TASK_PRIORITY_MAX = 12;

export function resolveStorePriority(station, fallback = STORE_PRIORITY) {
  const value = Number(station?.storePriority);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(
    STORE_TASK_PRIORITY_MIN,
    Math.min(STORE_TASK_PRIORITY_MAX, Math.round(value))
  );
}
export const CRAFT_IDLE_PRIORITY = 12;
/** 框选到的资源在面板上是 0 / 禁止时，这条任务仍然要存在，只是排在存放之后。 */
export const MANUAL_BOX_GATHER_PRIORITY = 4;

const KIND_ORDER = {
  gather: 0,
  craft: 1,
  store: 2
};

/**
 * 资源面板上的优先级 → 任务队列优先级。
 * `<= 0`（不采 / 禁止）返回 null，调用方自己决定要不要改用手动框选的档位。
 */
export function gatherTaskPriority(resourcePriority) {
  const value = Math.round(Number(resourcePriority));
  if (!Number.isFinite(value) || value <= 0) return null;
  return (PRIORITY_MAX + 1) - value;
}

export function compareWorkTasks(a, b) {
  const priorityA = Number(a?.priority);
  const priorityB = Number(b?.priority);
  if (priorityA !== priorityB) return priorityA - priorityB;
  const kindA = KIND_ORDER[a?.kind] ?? 9;
  const kindB = KIND_ORDER[b?.kind] ?? 9;
  if (kindA !== kindB) return kindA - kindB;
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
}

/**
 * 这条差事要不要压过「按资源面板自动去采」。
 * 玩家刚框出来的采集在数字相同的时候优先：他指了哪几棵树，就先做那几棵。
 * 其它任务必须严格更急，才打断自动采集。
 */
export function errandBeatsAutoGather(errand, autoRank) {
  if (!errand || !Number.isFinite(Number(errand.priority))) return false;
  if (!Number.isFinite(autoRank)) return true;
  const priority = Number(errand.priority);
  if (errand.explicit === true && errand.kind === 'gather') return priority <= autoRank;
  return priority < autoRank;
}

export function firstCraftableRecipe(inventory, recipes = []) {
  if (!inventory) return null;
  for (const recipe of recipes) {
    if (!recipe?.id) continue;
    if (canCraft(inventory, recipe).ok) return recipe;
  }
  return null;
}

/** 工作台库存够做目录里任意一条配方 → 5，否则 12。 */
export function stationCraftPriority(inventory, recipes = []) {
  return firstCraftableRecipe(inventory, recipes)
    ? CRAFT_READY_PRIORITY
    : CRAFT_IDLE_PRIORITY;
}

/**
 * 存放 / 运输过滤（箱子、基地、运输线共用）。
 * 白名单：只收名单里的种类；名单为空 = 什么都不收。
 * 黑名单：除名单外都收；名单为空 = 什么都收。
 */
export function chestAcceptsItem(filter, itemId) {
  if (!itemId) return false;
  const ids = Array.isArray(filter?.itemIds) ? filter.itemIds : [];
  if (!ids.length) {
    return filter?.mode === 'blacklist';
  }
  const listed = ids.includes(itemId);
  if (filter?.mode === 'blacklist') return !listed;
  return listed;
}

export function normalizeChestFilter(filter = {}) {
  const mode = filter.mode === 'blacklist' ? 'blacklist' : 'whitelist';
  const itemIds = [];
  (filter.itemIds ?? []).forEach((itemId) => {
    const id = String(itemId ?? '');
    if (!id || itemIds.includes(id)) return;
    itemIds.push(id);
  });
  return { mode, itemIds };
}
