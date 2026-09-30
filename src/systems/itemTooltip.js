// 背包 / 站点格子悬浮提示的纯数据：名称、种类、攻击力、耐久、说明。
import { ENCHANTMENTS, RECIPES } from '../data/gameData.js';
import {
  itemDefinition,
  itemMaxDurability,
  itemName,
  slotDurability
} from './items.js';
import {
  RUNE_STONE_ITEM_ID,
  manaProgressForStone,
  manaThresholdForLevel
} from './runeStones.js';

const CATEGORY_LABEL = Object.freeze({
  resource: '资源',
  material: '材料',
  tool: '工具',
  weapon: '武器',
  building: '建筑',
  consumable: '消耗品',
  rune: '符文石',
  manaStone: '魔力石'
});

const WEAPON_FAMILY_LABEL = Object.freeze({
  sword: '剑',
  club: '棍',
  bow: '弓',
  glaive: '长刃'
});

const RESOURCE_BLURBS = Object.freeze({
  wood: '基础建材，可合成工具与建筑；傀儡可采集。',
  stone: '建筑与熔炉的原料；傀儡可开采石堆。',
  iron: '高级合成与武器的原料；傀儡可开采铁矿。',
  food: '后勤资源，部分配方需要。',
  fiber: '纤维，用于弓弦等合成。',
  charcoal: '熔炉产物，魔力炉的燃料。',
  sapling: '树坑补种用，砍树时偶尔获得。',
  deepCore: '击败巢穴敌人掉落，用于制作招募令。',
  manaCore: '开局自带，与木材合成木傀儡套件。'
});

let recipeDescriptionByItemId = null;

function descriptionsFromRecipes() {
  if (recipeDescriptionByItemId) return recipeDescriptionByItemId;
  recipeDescriptionByItemId = new Map();
  Object.values(RECIPES ?? {}).forEach((recipe) => {
    const itemId = recipe?.output?.itemId;
    if (!itemId || !recipe.description) return;
    if (!recipeDescriptionByItemId.has(itemId)) {
      recipeDescriptionByItemId.set(itemId, recipe.description);
    }
  });
  return recipeDescriptionByItemId;
}

export function itemCategoryLabel(definition) {
  if (!definition?.category) return '物品';
  return CATEGORY_LABEL[definition.category] ?? definition.category;
}

export function itemAttackText(definition) {
  const damage = definition?.weapon?.damage;
  if (Number.isFinite(damage)) {
    const kind = definition.weapon.damageType === 'magic' ? '魔法' : '物理';
    return `${damage}（${kind}）`;
  }
  return '—';
}

export function itemDurabilityText(slot, itemId = slot?.itemId) {
  const max = itemMaxDurability(itemId);
  if (max <= 0) return '—';
  const current = Math.round(slotDurability(slot, itemId));
  return `${current} / ${max}`;
}

function toolBlurb(definition) {
  if (definition?.tool === 'axe') return '砍树用的工具，交给傀儡后会自动装备。';
  if (definition?.tool === 'pickaxe') return '挖矿用的工具，交给傀儡后会自动装备。';
  return '工具类物品，通常交给傀儡使用。';
}

function weaponBlurb(definition) {
  const family = WEAPON_FAMILY_LABEL[definition?.weapon?.family] ?? definition?.weapon?.family ?? '武器';
  const damage = definition?.weapon?.damage;
  if (Number.isFinite(damage)) {
    return `${family}族武器，单次攻击约 ${damage} 点伤害。需装给兼容的单位。`;
  }
  return `${family}族武器，需装给动作与射程兼容的单位。`;
}

function buildingBlurb(definition) {
  if (definition?.placeable?.unitType) {
    return '可在基地背包或快捷栏进入放置模式，点到地面上建造。';
  }
  return '可放置的建筑。';
}

export function itemDescriptionText(itemId, definition = itemDefinition(itemId)) {
  if (!definition) return '未知物品。';
  if (definition.description) return String(definition.description);
  const fromRecipe = descriptionsFromRecipes().get(itemId);
  if (fromRecipe) return fromRecipe;
  if (RESOURCE_BLURBS[itemId]) return RESOURCE_BLURBS[itemId];
  if (definition.category === 'tool') return toolBlurb(definition);
  if (definition.category === 'weapon') return weaponBlurb(definition);
  if (definition.category === 'building') return buildingBlurb(definition);
  if (definition.category === 'resource') return '可堆叠资源，傀儡采集或运输线搬运。';
  if (definition.category === 'material') return '可堆叠材料，用于合成或作为设施原料。';
  if (definition.category === 'consumable') return '使用后消耗，具体效果因物品而异。';
  if (definition.category === 'manaStone' && definition.manaBonus) {
    return `放进傀儡背包可提高体力上限 +${definition.manaBonus}，并缓慢放电补魔；多块可叠加。`;
  }
  if (definition.category === 'rune') {
    return '附魔石实例，放进单位背包即生效；同名仅一块生效，其余仍会吃魔力升级。';
  }
  return '暂无说明。';
}

function runeTooltipExtras(slot, context = {}) {
  const stone = context.runeStone ?? null;
  const data = stone ?? slot?.data ?? context.slotData ?? {};
  const level = Math.max(1, Math.floor(Number(stone?.level ?? data?.level ?? 1)));
  const enchantId = stone?.enchantmentId ?? data?.enchantmentId ?? '';
  const enchantName = ENCHANTMENTS?.[enchantId]?.name ?? enchantId ?? '未知附魔';
  const progress = manaProgressForStone(stone ?? data);
  const need = manaThresholdForLevel(level);
  const lines = [`附魔：${enchantName}`, `等级 ${level}`];
  if (Number.isFinite(need)) {
    lines.push(`魔力经验 ${Math.floor(progress.have)}/${need}`);
  } else {
    lines.push('已满级');
  }
  if (stone && context.isInactiveDuplicate) {
    lines.push('同名备用石：不生效，但仍会消耗魔力升级。');
  }
  return lines.join(' ');
}

/**
 * @returns {{ name: string, category: string, attack: string, durability: string, description: string }}
 */
export function buildItemTooltipModel(slot, context = {}) {
  if (!slot?.itemId) return null;
  const definition = itemDefinition(slot.itemId);
  const count = slot.count ?? 1;
  const name = count > 1 ? `${itemName(slot.itemId)} ×${count}` : itemName(slot.itemId);
  if (slot.itemId === RUNE_STONE_ITEM_ID) {
    return {
      name,
      category: '符文石',
      attack: '—',
      durability: '—',
      description: runeTooltipExtras(slot, context)
    };
  }
  return {
    name,
    category: itemCategoryLabel(definition),
    attack: itemAttackText(definition),
    durability: itemDurabilityText(slot, slot.itemId),
    description: itemDescriptionText(slot.itemId, definition)
  };
}
