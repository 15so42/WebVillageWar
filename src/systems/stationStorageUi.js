// 基地 / 箱子 / 工作台：右侧「存放设置」共用 DOM（名单模式、优先级、拖放区）。
import { itemName } from './items.js';
import {
  STORE_PRIORITY,
  STORE_TASK_PRIORITY_MAX,
  STORE_TASK_PRIORITY_MIN,
  resolveStorePriority
} from './workTasks.js';

export { resolveStorePriority, STORE_TASK_PRIORITY_MIN, STORE_TASK_PRIORITY_MAX };

/**
 * @param {HTMLElement} host
 * @param {object} station
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.subtitle]
 * @param {string} options.filterHintWhitelist
 * @param {string} options.filterHintBlacklist
 * @param {{ mode: string, filter: string, filterItem: string, priorityDelta: string }} options.datasets
 * @param {boolean} [options.showStorePriority=true] 自动传输等场景不展示存放任务优先级
 */
export function mountStationStoragePane(host, station, options) {
  if (!host || !station) return;
  const showStorePriority = options.showStorePriority !== false;
  const mode = station.filter?.mode === 'blacklist' ? 'blacklist' : 'whitelist';
  const extra = options.hostClass ? `${options.hostClass} ` : '';
  host.className = `${extra}station-storage-pane is-${mode}`;
  host.textContent = '';

  const head = document.createElement('div');
  head.className = 'backpack-pane-head';
  const titleEl = document.createElement('span');
  titleEl.className = 'backpack-pane-title';
  titleEl.textContent = options.title ?? '存放设置';
  head.appendChild(titleEl);
  if (options.subtitle) {
    const sub = document.createElement('span');
    sub.className = 'backpack-pane-count';
    sub.textContent = options.subtitle;
    head.append(sub);
  }
  host.appendChild(head);

  const modeRow = document.createElement('div');
  modeRow.className = 'station-mode-row';
  const modeCaption = document.createElement('span');
  modeCaption.className = 'station-mode-caption';
  modeCaption.textContent = '名单模式';
  modeRow.appendChild(modeCaption);

  const modes = document.createElement('div');
  modes.className = 'station-mode-toggle';
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', '名单模式');
  ['whitelist', 'blacklist'].forEach((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    const selected = station.filter.mode === entry;
    button.className = selected
      ? 'station-mode-toggle-option is-selected'
      : 'station-mode-toggle-option';
    button.dataset[options.datasets.mode] = entry;
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.textContent = entry === 'whitelist' ? '白名单' : '黑名单';
    modes.appendChild(button);
  });
  modeRow.appendChild(modes);
  host.appendChild(modeRow);

  if (showStorePriority) {
    const priorityRow = document.createElement('div');
    priorityRow.className = 'station-storage-priority';
    const priorityLabel = document.createElement('span');
    priorityLabel.className = 'station-storage-priority-label';
    priorityLabel.textContent = '存放任务优先级';
    const dec = document.createElement('button');
    dec.type = 'button';
    dec.className = 'backpack-action station-priority-btn';
    dec.dataset[options.datasets.priorityDelta] = '-1';
    dec.textContent = '−';
    dec.title = '数字越小越先做';
    const value = document.createElement('span');
    value.className = 'station-storage-priority-value';
    value.textContent = String(resolveStorePriority(station));
    const inc = document.createElement('button');
    inc.type = 'button';
    inc.className = 'backpack-action station-priority-btn';
    inc.dataset[options.datasets.priorityDelta] = '1';
    inc.textContent = '+';
    inc.title = '数字越小越先做';
    priorityRow.append(priorityLabel, dec, value, inc);
    host.appendChild(priorityRow);
  }

  const note = document.createElement('p');
  note.className = 'backpack-grid-hint';
  note.textContent = mode === 'blacklist'
    ? options.filterHintBlacklist
    : options.filterHintWhitelist;
  host.appendChild(note);

  const drop = document.createElement('div');
  drop.className = 'station-filter';
  drop.dataset[options.datasets.filter] = 'true';
  if (!station.filter.itemIds.length) {
    const empty = document.createElement('p');
    empty.className = 'backpack-empty';
    empty.textContent = '把物品拖到这里';
    drop.appendChild(empty);
  } else {
    station.filter.itemIds.forEach((itemId) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'station-filter-chip';
      chip.dataset[options.datasets.filterItem] = itemId;
      chip.textContent = itemName(itemId);
      chip.title = '点一下移出名单';
      drop.appendChild(chip);
    });
  }
  host.appendChild(drop);
}

export const STATION_STORAGE_DATASETS = Object.freeze({
  panel: {
    mode: 'stationMode',
    filter: 'stationFilter',
    filterItem: 'stationFilterItem',
    priorityDelta: 'stationPriorityDelta'
  },
  backpackBase: {
    mode: 'backpackBaseMode',
    filter: 'backpackBaseFilter',
    filterItem: 'backpackBaseFilterItem',
    priorityDelta: 'backpackBasePriorityDelta'
  }
});

/** dataset 属性名（camelCase → data-* 在 DOM 里是小写连字符，由调用方用 bracket 赋值） */
export function storageDatasetAttrs(prefix) {
  return {
    mode: prefix.mode,
    filter: prefix.filter,
    filterItem: prefix.filterItem,
    priorityDelta: prefix.priorityDelta
  };
}

export function defaultStorePriorityFallback() {
  return STORE_PRIORITY;
}
