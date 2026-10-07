// 背包物品图标。
//
// 背包里的东西必须"看着像那件东西"，而不是一行文字——所以每种物品都有一张
// 内联 SVG 图。选 SVG 而不是贴图：不需要额外资源、随界面缩放不失真、
// 也能直接被 `innerHTML` 塞进格子（和符文石复用附魔卡美术的做法一致）。
//
// 图标是纯字符串常量，按 itemId 缓存；绘制只依赖配色常量，不依赖 THREE / DOM。
// 唯一的例外是符文石：它的图必须**跟着附魔走**（附魔卡时代留下的美术资产），
// 所以那一条走 `runeArtMarkup()`，按 enchantmentId 去 `cardArt.js` 取图。
import { ENCHANTMENTS } from '../data/gameData.js';
import { createCardArtMarkup } from './cardArt.js';

const P = {
  wood: '#8a5a2b',
  woodDark: '#5f3d1c',
  woodLight: '#b07c42',
  stone: '#8d8b83',
  stoneDark: '#63615b',
  stoneLight: '#b0ada3',
  iron: '#9aa0a6',
  ironDark: '#6a7076',
  ore: '#c9825a',
  leaf: '#4f8f45',
  leafDark: '#356b2d',
  leafLight: '#6fb45c',
  fire: '#ef8f34',
  fireHot: '#ffd979',
  mana: '#63c9ff',
  manaDark: '#2a76ac',
  manaHot: '#dcf5ff',
  rune: '#b78cff',
  metal: '#d3dae1',
  metalDark: '#8b95a0',
  paper: '#e9dcbe',
  seal: '#bb3a2c',
  soil: '#6b4a2c',
  cloth: '#c9b48a'
};

const wrap = (body) => `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`;

/** 一块石头/矿石的通用画法：底面多边形 + 亮面 + 暗面。 */
function rockBody(base, light, dark) {
  return `<polygon points="7,23 10,11 18,8 25,14 24,23" fill="${base}"/>`
    + `<polygon points="10,11 18,8 20,14 12,16" fill="${light}"/>`
    + `<polygon points="20,14 25,14 24,23 18,22" fill="${dark}"/>`;
}

const ICONS = {
  wood: wrap(
    `<rect x="4" y="8" width="24" height="8" rx="3" fill="${P.wood}"/>`
    + `<ellipse cx="7" cy="12" rx="2.6" ry="4" fill="${P.woodLight}"/>`
    + `<ellipse cx="7" cy="12" rx="1.2" ry="2" fill="${P.woodDark}"/>`
    + `<rect x="4" y="18" width="24" height="8" rx="3" fill="${P.woodDark}"/>`
    + `<ellipse cx="7" cy="22" rx="2.6" ry="4" fill="${P.woodLight}"/>`
    + `<ellipse cx="7" cy="22" rx="1.2" ry="2" fill="${P.woodDark}"/>`
  ),
  stone: wrap(rockBody(P.stone, P.stoneLight, P.stoneDark)),
  iron: wrap(
    rockBody(P.iron, P.ironDark, '#4f5459')
    + `<circle cx="14" cy="16" r="2.4" fill="${P.ore}"/>`
    + `<circle cx="20" cy="20" r="1.8" fill="${P.ore}"/>`
    + `<circle cx="19" cy="12" r="1.4" fill="${P.ore}"/>`
  ),
  food: wrap(
    `<circle cx="15" cy="19" r="9" fill="#c8402f"/>`
    + `<path d="M15 10c-2-3-5-4-8-3 2 3 5 4 8 3z" fill="${P.leaf}"/>`
    + `<rect x="14.4" y="6" width="1.4" height="5" rx="0.7" fill="${P.woodDark}"/>`
    + `<path d="M11 15c1.6-2.4 4-3.4 6.4-3" stroke="#e97a63" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
  ),
  fiber: wrap(
    `<path d="M16 27c0-8 1-13 5-18" stroke="${P.leaf}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
    + `<path d="M16 27c0-6-2-11-6-14" stroke="${P.leafDark}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
    + `<path d="M16 27c0-4 3-8 7-9" stroke="${P.leafLight}" stroke-width="2" fill="none" stroke-linecap="round"/>`
    + `<rect x="13" y="25" width="6" height="3" rx="1.4" fill="${P.wood}"/>`
  ),
  charcoal: wrap(
    `<polygon points="9,25 6,16 12,10 21,12 23,21 17,26" fill="#3b3b3f"/>`
    + `<polygon points="12,10 21,12 19,18 11,17" fill="#585860"/>`
    + `<circle cx="15" cy="20" r="1.4" fill="#202024"/>`
    + `<circle cx="19" cy="16" r="1.1" fill="#202024"/>`
  ),
  sapling: wrap(
    `<path d="M6 26h20c-2-4-6-5-10-5s-8 1-10 5z" fill="${P.soil}"/>`
    + `<rect x="15" y="12" width="2" height="10" rx="1" fill="${P.leafDark}"/>`
    + `<ellipse cx="11" cy="12" rx="5" ry="3.4" fill="${P.leaf}"/>`
    + `<ellipse cx="21" cy="10" rx="4.4" ry="3" fill="${P.leafLight}"/>`
  ),
  axe: wrap(
    `<rect x="14" y="6" width="3" height="21" rx="1.5" fill="${P.wood}" transform="rotate(18 15.5 16.5)"/>`
    + `<path d="M9 7c5-3 10-2 13 1-3 4-8 6-13 4z" fill="${P.metal}"/>`
    + `<path d="M9 7c4-2 8-2 11 0-3 2-7 3-11 1z" fill="#eef3f7"/>`
  ),
  pickaxe: wrap(
    `<rect x="14.5" y="9" width="3" height="19" rx="1.5" fill="${P.wood}" transform="rotate(12 16 18)"/>`
    + `<path d="M5 12c6-6 16-6 22 0-3 3-8 4-11 4s-8-1-11-4z" fill="${P.metal}"/>`
    + `<path d="M7 12c5-4 13-4 18 0-3 1-6 2-9 2s-6-1-9-2z" fill="#eef3f7"/>`
  ),
  ironAxe: wrap(
    `<rect x="14" y="6" width="3" height="21" rx="1.5" fill="${P.woodDark ?? P.wood}" transform="rotate(18 15.5 16.5)"/>`
    + `<path d="M8 6c6-4 12-2 15 2-4 5-9 7-15 4z" fill="#8d97a3"/>`
    + `<path d="M8 6c5-3 9-2 12 1-3 2-7 3-12 1z" fill="#d5dde6"/>`
  ),
  ironPickaxe: wrap(
    `<rect x="14.5" y="9" width="3" height="19" rx="1.5" fill="${P.wood}" transform="rotate(12 16 18)"/>`
    + `<path d="M4 12c7-7 17-7 24 0-4 4-9 5-12 5s-8-1-12-5z" fill="#8d97a3"/>`
    + `<path d="M6 12c6-4 14-4 20 0-3 2-7 2-10 2s-7 0-10-2z" fill="#d5dde6"/>`
  ),
  runeStone: wrap(
    `<polygon points="16,4 26,11 23,25 9,25 6,11" fill="rgba(183,140,255,0.9)"/>`
    + `<polygon points="16,8 22,12 20,21 12,21 10,12" fill="rgba(226,209,255,0.85)"/>`
    + `<circle cx="16" cy="15" r="2.6" fill="#ffffff" opacity="0.9"/>`
  ),
  manaStone: wrap(
    `<polygon points="16,3 27,12 22,28 10,28 5,12" fill="${P.manaDark}"/>`
    + `<polygon points="16,7 23,13 19,25 13,25 9,13" fill="${P.mana}"/>`
    + `<polygon points="16,11 20,15 17,22 15,22 12,15" fill="${P.manaHot}"/>`
  ),
  magicStone: wrap(
    `<polygon points="16,5 25,12 22,24 10,24 7,12" fill="#6a3d86"/>`
    + `<polygon points="16,8 22,13 19,21 13,21 10,13" fill="#c46bff"/>`
    + `<polygon points="16,11 19,14 17,19 15,19 13,14" fill="#ffe3a1"/>`
  ),
  deepCore: wrap(
    `<circle cx="16" cy="16" r="9" fill="#2b1b47"/>`
    + `<circle cx="16" cy="16" r="5.4" fill="#6b3fb0"/>`
    + `<circle cx="16" cy="16" r="2.4" fill="#e5d6ff"/>`
    + `<ellipse cx="16" cy="16" rx="13" ry="4.4" fill="none" stroke="#9a6fe0" stroke-width="1.6"/>`
    + `<ellipse cx="16" cy="16" rx="4.4" ry="13" fill="none" stroke="#9a6fe0" stroke-width="1.2" opacity="0.7"/>`
  ),
  recruitmentOrder: wrap(
    `<rect x="7" y="5" width="18" height="22" rx="2.5" fill="${P.paper}"/>`
    + `<rect x="7" y="5" width="18" height="4.5" rx="2.2" fill="#cbb98f"/>`
    + `<path d="M10.5 13h11M10.5 16.5h11M10.5 20h7" stroke="#8a7550" stroke-width="1.5" stroke-linecap="round"/>`
    + `<circle cx="22" cy="23" r="3.6" fill="${P.seal}"/>`
    + `<path d="M20.5 21.5l3 3M23.5 21.5l-3 3" stroke="#f3d9c6" stroke-width="1.1"/>`
  ),
  furnace: wrap(
    `<rect x="6" y="11" width="20" height="16" rx="2.5" fill="${P.stoneDark}"/>`
    + `<rect x="6" y="11" width="20" height="4" rx="2" fill="${P.stone}"/>`
    + `<rect x="11" y="18" width="10" height="9" rx="1.6" fill="#251c17"/>`
    + `<path d="M12 26c0-3 2-5 4-5s4 2 4 5z" fill="${P.fire}"/>`
    + `<path d="M14 26c0-2 1-3 2-3s2 1 2 3z" fill="${P.fireHot}"/>`
  ),
  manaFurnace: wrap(
    `<rect x="10" y="8" width="12" height="19" rx="2.5" fill="${P.stoneDark}"/>`
    + `<rect x="10" y="8" width="12" height="3.6" rx="1.8" fill="${P.stoneLight}"/>`
    + `<rect x="13" y="15" width="6" height="8" rx="1.4" fill="#1d2733"/>`
    + `<path d="M16 13c2.6 2 3.6 4.4 2.6 7-0.6 1.6-4.6 1.6-5.2 0-1-2.6 0-5 2.6-7z" fill="${P.mana}"/>`
    + `<circle cx="16" cy="18" r="1.6" fill="${P.manaHot}"/>`
  ),
  researchStation: wrap(
    `<rect x="4" y="19" width="24" height="4" rx="1.4" fill="${P.wood}"/>`
    + `<rect x="6" y="23" width="3" height="5" fill="${P.woodDark}"/>`
    + `<rect x="23" y="23" width="3" height="5" fill="${P.woodDark}"/>`
    + `<rect x="9" y="9" width="9" height="11" rx="1.6" fill="${P.cloth}"/>`
    + `<path d="M16 9h4a2 2 0 0 1 2 2v9h-6z" fill="#ded0ab"/>`
    + `<path d="M18 4l4 1.4-1.4 4-4-1.4z" fill="${P.mana}" opacity="0.9"/>`
  ),
  enchantTable: wrap(
    `<rect x="4" y="19" width="24" height="4" rx="1.4" fill="#4a3a63"/>`
    + `<rect x="6" y="23" width="3" height="5" fill="#372b4a"/>`
    + `<rect x="23" y="23" width="3" height="5" fill="#372b4a"/>`
    + `<polygon points="16,6 22,12 16,18 10,12" fill="${P.rune}"/>`
    + `<polygon points="16,9 19,12 16,15 13,12" fill="#efe4ff"/>`
    + `<path d="M11 21h10" stroke="#9a6fe0" stroke-width="1.6" stroke-linecap="round"/>`
  ),
  treePit: wrap(
    `<ellipse cx="16" cy="24" rx="12" ry="5" fill="${P.soil}"/>`
    + `<ellipse cx="16" cy="22.5" rx="8" ry="3" fill="#4d341d"/>`
    + `<rect x="15" y="10" width="2" height="12" rx="1" fill="${P.leafDark}"/>`
    + `<ellipse cx="11" cy="10" rx="5" ry="3.4" fill="${P.leaf}"/>`
    + `<ellipse cx="21" cy="8" rx="4.4" ry="3" fill="${P.leafLight}"/>`
  ),
  arrowTower: wrap(
    `<rect x="11" y="10" width="10" height="18" rx="2" fill="${P.wood}"/>`
    + `<rect x="9" y="7" width="14" height="4" rx="1.6" fill="${P.woodLight}"/>`
    + `<rect x="9" y="24" width="14" height="3.4" rx="1.4" fill="${P.woodDark}"/>`
    + `<path d="M16 2v8M16 2l-3 3M16 2l3 3" stroke="${P.metal}" stroke-width="2" stroke-linecap="round"/>`
  ),
  ballista: wrap(
    `<rect x="6" y="18" width="20" height="5" rx="1.6" fill="${P.woodDark}"/>`
    + `<rect x="14" y="8" width="4" height="16" rx="1.2" fill="${P.wood}"/>`
    + `<path d="M6 12c6-6 14-6 20 0" stroke="#8d97a3" stroke-width="2.4" fill="none"/>`
    + `<path d="M16 6v8" stroke="#d5dde6" stroke-width="2" stroke-linecap="round"/>`
  ),
  canteen: wrap(
    `<path d="M6 16h20c0 7-4 11-10 11S6 23 6 16z" fill="#5c5a55"/>`
    + `<rect x="4" y="13" width="24" height="4" rx="2" fill="${P.stoneLight}"/>`
    + `<path d="M11 9c0-3 3-3 3-6M17 9c0-3 3-3 3-6" stroke="#cfd6dd" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
  ),
  manaCore: wrap(
    `<circle cx="16" cy="16" r="9" fill="#3a6a8c"/>`
    + `<circle cx="16" cy="16" r="5.5" fill="#7ec8ff"/>`
    + `<circle cx="13" cy="13" r="2" fill="#e8f7ff" opacity="0.85"/>`
  ),
  woodPuppetKit: wrap(
    `<rect x="11" y="8" width="10" height="14" rx="2" fill="${P.wood}"/>`
    + `<rect x="9" y="6" width="14" height="4" rx="1.5" fill="${P.woodLight}"/>`
    + `<circle cx="13" cy="12" r="1.2" fill="#2a2018"/>`
    + `<circle cx="19" cy="12" r="1.2" fill="#2a2018"/>`
    + `<rect x="8" y="20" width="4" height="6" rx="1" fill="${P.woodDark}"/>`
    + `<rect x="20" y="20" width="4" height="6" rx="1" fill="${P.woodDark}"/>`
  ),
  wornSword: wrap(
    `<path d="M16 3l2.6 4v13h-5.2V7z" fill="${P.metalDark}"/>`
    + `<rect x="10" y="20" width="12" height="2.6" rx="1.3" fill="${P.wood}"/>`
    + `<rect x="14.6" y="22.6" width="2.8" height="6" rx="1.4" fill="${P.woodDark}"/>`
  ),
  steelSword: wrap(
    `<path d="M16 2l3 4.6V20h-6V6.6z" fill="${P.metal}"/>`
    + `<path d="M16 4l1.4 2.4v12h-1.4z" fill="#f4f8fb"/>`
    + `<rect x="9" y="20" width="14" height="3" rx="1.5" fill="#a8813c"/>`
    + `<rect x="14.4" y="23" width="3.2" height="6.4" rx="1.6" fill="#5f3d1c"/>`
  ),
  wornClub: wrap(
    `<path d="M12 28l3-8 6-2 4-8-6-4-7 6-2 7z" fill="${P.wood}"/>`
    + `<path d="M19 8l6 4-1.4 3-6-4z" fill="${P.woodLight}"/>`
  ),
  spikedClub: wrap(
    `<path d="M12 28l3-8 6-2 4-8-6-4-7 6-2 7z" fill="${P.wood}"/>`
    + `<path d="M19 8l6 4-1.4 3-6-4z" fill="${P.woodLight}"/>`
    + `<circle cx="17" cy="12" r="1.5" fill="${P.metal}"/>`
    + `<circle cx="21.5" cy="9.5" r="1.4" fill="${P.metal}"/>`
    + `<circle cx="22.5" cy="14" r="1.4" fill="${P.metal}"/>`
    + `<circle cx="14" cy="19" r="1.3" fill="${P.metal}"/>`
  ),
  wornBow: wrap(
    `<path d="M9 4c9 5 9 19 0 24" stroke="${P.wood}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
    + `<path d="M9 4l0 24" stroke="${P.paper}" stroke-width="1.2"/>`
    + `<path d="M9 16h13M22 16l-4-2M22 16l-4 2" stroke="${P.woodLight}" stroke-width="1.8" stroke-linecap="round" fill="none"/>`
  ),
  longBow: wrap(
    `<path d="M8 3c11 6 11 20 0 26" stroke="#7a4f22" stroke-width="2.8" fill="none" stroke-linecap="round"/>`
    + `<path d="M8 3l0 26" stroke="${P.paper}" stroke-width="1.2"/>`
    + `<circle cx="8" cy="16" r="1.6" fill="${P.metal}"/>`
    + `<path d="M8 16h16M24 16l-4.4-2.2M24 16l-4.4 2.2" stroke="${P.metal}" stroke-width="1.8" stroke-linecap="round" fill="none"/>`
  )
};

/** 没单独画过的物品用这一张：木箱，至少不是空白。 */
const FALLBACK = wrap(
  `<rect x="5" y="9" width="22" height="17" rx="2.5" fill="${P.wood}"/>`
  + `<rect x="5" y="9" width="22" height="5" rx="2" fill="${P.woodLight}"/>`
  + `<rect x="13.5" y="16" width="5" height="6" rx="1.2" fill="${P.woodDark}"/>`
);

const cache = new Map();

/** 物品图标（内联 SVG）。同类物品只算一次字符串。 */
export function itemArtMarkup(itemId) {
  const key = String(itemId ?? '');
  if (cache.has(key)) return cache.get(key);
  const markup = ICONS[key] ?? FALLBACK;
  cache.set(key, markup);
  return markup;
}

export function hasItemArt(itemId) {
  return Object.prototype.hasOwnProperty.call(ICONS, String(itemId ?? ''));
}

export const ITEM_ART_IDS = Object.keys(ICONS);

/**
 * 物品在格子里显示的一行小字（悬浮提示与 recipe 面板共用）。
 * 数值全部来自物品定义，不在这里重算规则。
 */
export function itemStatLines(itemId, definition) {
  const lines = [];
  if (!definition) return lines;
  if (definition.category === 'tool' && definition.tool) {
    lines.push(definition.tool === 'axe' ? '用途：砍树' : '用途：挖矿');
    if (definition.maxDurability) {
      lines.push(`耐久 ${definition.maxDurability}`);
    }
  }
  if (definition.category === 'building') lines.push('可放置到地面上');
  if (definition.manaBonus) lines.push(`最大魔力 +${definition.manaBonus}`);
  if (definition.weapon) {
    lines.push(`伤害 ${definition.weapon.damage} · 耐久 ${definition.weapon.maxDurability}`);
    lines.push(`家族 ${definition.weapon.family}`);
  }
  if (definition.category === 'consumable') lines.push('一次性消耗品');
  return lines;
}

// ---------------------------------------------------------------------------
// 符文石图标
//
// 符文石是唯一"图跟着数据走"的物品：它显示的是对应附魔的卡面美术。
// 映射表与缓存都是静态的，所以只算一次字符串。
// ---------------------------------------------------------------------------

const ENCHANT_ART_KEY_BY_ID = (() => {
  const map = new Map();
  Object.entries(ENCHANTMENTS ?? {}).forEach(([id, definition]) => {
    if (!id || map.has(id)) return;
    map.set(id, definition?.artKey ?? id);
  });
  return map;
})();

const runeArtCache = new Map();

/** 符文石的图：按 enchantmentId 取对应附魔的卡面。 */
export function runeArtMarkup(enchantmentId) {
  const key = String(enchantmentId ?? '');
  if (runeArtCache.has(key)) return runeArtCache.get(key);
  const artKey = ENCHANT_ART_KEY_BY_ID.get(key) ?? key;
  const markup = createCardArtMarkup({ id: artKey, artKey, kind: 'enchant' });
  runeArtCache.set(key, markup);
  return markup;
}

/**
 * 统一的"某件物品该画什么"：
 * 符文石走附魔卡面，其余走 itemId 对应的 SVG。
 */
export function itemArtForSlot(slot) {
  if (!slot?.itemId) return '';
  if (slot.itemId === 'runeStone') {
    return runeArtMarkup(slot.data?.enchantmentId ?? slot.data?.artKey ?? '');
  }
  return itemArtMarkup(slot.itemId);
}
