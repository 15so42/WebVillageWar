export const RUN_SHOP_CATEGORIES = [
  {
    key: 'attribute',
    title: '属性集训',
    description: '三选一全队属性强化，立即生效。',
    icon: '↑'
  },
  {
    key: 'unit',
    title: '随机卡牌',
    description: '立即付费，从本局剩余波次奖励牌组随机展示三张；返回不退款，再次购买会重新扣费刷新。',
    icon: '▦',
    prepaidChoices: true
  },
  {
    key: 'trait',
    title: '特性专精',
    description: '三选一兵种特性，每种仅一次。',
    icon: '★'
  },
  {
    key: 'copy',
    title: '复制卡牌',
    description: '从已有卡牌中选一张复制；手牌有空位则优先进手牌。',
    icon: '⧉',
    picker: true,
    catalogPicker: true
  },
  {
    key: 'remove',
    title: '移除卡牌',
    description: '从已有卡牌中选一张，移出本局全部同名卡牌。',
    icon: '✕',
    picker: true,
    catalogPicker: true
  },
  {
    key: 'upgrade',
    title: '升级卡牌',
    description: '从已有卡牌中选一张，该牌及同名牌等级 +1。',
    icon: '⬆',
    picker: true,
    catalogPicker: true
  },
  {
    key: 'energy',
    title: '购买能量',
    description: '立即获得 1 点能量。',
    icon: '⚡',
    fixedPrice: 4
  },
  {
    key: 'temporary',
    title: '临时咒印',
    description: '购置一张本局可用的临时牌。',
    icon: '⏱'
  }
];

export function isRunShopCategoryAvailable(category) {
  return RUN_SHOP_CATEGORIES.some((entry) => entry.key === category);
}
