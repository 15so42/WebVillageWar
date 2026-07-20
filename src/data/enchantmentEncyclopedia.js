import { BUFF_DEFINITIONS, CARD_DEFINITIONS } from './gameData.js';

const ENCHANTMENT_SECTIONS = [
  {
    title: '攻击与异常',
    description: '以普攻命中、暴击或异常状态为主的进攻型附魔。',
    ids: [
      'fire',
      'explosion',
      'critical',
      'focus',
      'heavyStrike',
      'poison',
      'bleed',
      'curse',
      'drain',
      'lifesteal',
      'frost'
    ]
  },
  {
    title: '防御与续航',
    description: '减伤、格挡、回复与武器耐久相关的生存附魔。',
    ids: [
      'thorns',
      'toughness',
      'protection',
      'block',
      'recovery',
      'phoenix',
      'spiritWeapon',
      'spiritShield',
      'immortality'
    ]
  },
  {
    title: '成长与协同',
    description: '随战斗推进或友军站位变强的附魔。',
    ids: [
      'power',
      'soulEater',
      'wolfInstinct',
      'ursineSpirit'
    ]
  },
  {
    title: '战术词缀',
    description: '原为敌军波次词缀，也可通过附魔牌施加给友军。',
    ids: [
      'waveSwarm',
      'waveArmored',
      'waveRush',
      'waveRanged',
      'waveSiege'
    ]
  }
];

function enchantCardById() {
  const map = new Map();
  CARD_DEFINITIONS.forEach((card) => {
    if (card.kind !== 'enchant') return;
    const enchantId = card.enchantmentId ?? card.effect?.buffId;
    if (!enchantId) return;
    map.set(enchantId, card);
  });
  return map;
}

function entryNote(card) {
  if (!card) return '敌军或环境效果';
  if (card.lootOnly) return '战利品 / 临时牌专属';
  if ((card.cooldown ?? 0) <= 0) return `${card.energyCost ?? 0} 能量`;
  return `${card.energyCost ?? 0} 能量 · 冷却 ${card.cooldown ?? 0}s`;
}

export function buildEnchantmentEncyclopediaSections() {
  const cards = enchantCardById();
  return ENCHANTMENT_SECTIONS.map((section) => ({
    title: section.title,
    description: section.description,
    entries: section.ids
      .filter((id) => BUFF_DEFINITIONS[id]?.category === 'enchantment')
      .map((id) => {
        const definition = BUFF_DEFINITIONS[id];
        const card = cards.get(id);
        return {
          id,
          name: definition.name,
          summary: card?.summary ?? definition.name,
          color: definition.color ?? card?.color ?? '#9eeedb',
          note: entryNote(card)
        };
      })
  }));
}
