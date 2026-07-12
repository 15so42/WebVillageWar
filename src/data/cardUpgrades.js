export const UNIT_GENERIC_UPGRADES = [
  {
    id: 'unit-vitality',
    kind: 'unit-generic',
    name: '强健体魄',
    summary: '全队生命与武器耐久 +10%（至少 +1）。',
    stat: 'vitality'
  },
  {
    id: 'unit-attack',
    kind: 'unit-generic',
    name: '锋刃训练',
    summary: '全队攻击力 +10%（至少 +1）。',
    stat: 'attack'
  },
  {
    id: 'unit-armor',
    kind: 'unit-generic',
    name: '披甲训练',
    summary: '全队护甲 +10%（至少 +1）。',
    stat: 'armor'
  },
  {
    id: 'unit-magic-resistance',
    kind: 'unit-generic',
    name: '抗咒训练',
    summary: '全队魔抗 +10%（至少 +1）。',
    stat: 'magicResistance'
  }
];

export const UNIT_SPECIAL_UPGRADES = {
  knight: [
    {
      id: 'knight-holy-shield',
      kind: 'unit-special',
      name: '圣盾',
      summary: '受到普通攻击时有 10% 概率获得 10 点护盾。',
      trait: 'holyShield'
    },
    {
      id: 'knight-shield-bash',
      kind: 'unit-special',
      name: '盾击',
      summary: '普通攻击有 30% 概率眩晕目标 0.7 秒。',
      trait: 'shieldBash'
    }
  ],
  swordsman: [
    {
      id: 'swordsman-sunder',
      kind: 'unit-special',
      name: '破甲斩',
      summary: '普通攻击使目标短时间护甲 -1。',
      trait: 'sunderArmor'
    },
    {
      id: 'swordsman-flurry',
      kind: 'unit-special',
      name: '连击',
      summary: '普通攻击有 22% 概率追加一次 45% 物理伤害。',
      trait: 'flurryStrike'
    }
  ],
  raider: [
    {
      id: 'raider-warcry',
      kind: 'unit-special',
      name: '战吼',
      summary: '攻击时附近敌人越多，伤害越高，最多 +4。',
      trait: 'warcryDamage'
    },
    {
      id: 'raider-intimidate',
      kind: 'unit-special',
      name: '破胆',
      summary: '普通攻击有 30% 概率降低目标攻击力。',
      trait: 'intimidate'
    }
  ],
  berserker: [
    {
      id: 'berserker-bloodthirst',
      kind: 'unit-special',
      name: '浴血',
      summary: '普通攻击造成伤害后回复伤害值 18% 的生命。',
      trait: 'bloodthirst'
    },
    {
      id: 'berserker-cleave',
      kind: 'unit-special',
      name: '旋斩',
      summary: '普通攻击有 35% 概率对目标周围敌人造成溅射伤害。',
      trait: 'cleave'
    }
  ],
  archer: [
    {
      id: 'archer-mark',
      kind: 'unit-special',
      name: '标记',
      summary: '命中后短时间降低目标护甲。',
      trait: 'markTarget'
    },
    {
      id: 'archer-eagle-eye',
      kind: 'unit-special',
      name: '鹰眼',
      summary: '射程 +1.2，弹速 +18%。',
      modifiers: [
        { stat: 'attackRange', type: 'add', amount: 1.2 },
        { stat: 'projectileSpeed', type: 'multiply', percent: 0.18 }
      ]
    }
  ],
  spearman: [
    {
      id: 'spearman-reach',
      kind: 'unit-special',
      name: '长距',
      summary: '攻击距离 +0.6。',
      modifiers: [
        { stat: 'attackRange', type: 'add', amount: 0.6 }
      ]
    },
    {
      id: 'spearman-phalanx',
      kind: 'unit-special',
      name: '方阵',
      summary: '护甲 +1，受到击退时额外抵抗。',
      modifiers: [
        { stat: 'armor', type: 'add', amount: 1 },
        { stat: 'knockbackResistance', type: 'add', amount: 0.12 }
      ]
    }
  ],
  towerShield: [
    {
      id: 'tower-shield-bulwark',
      kind: 'unit-special',
      name: '壁垒',
      summary: '护甲 +2，最大生命 +12%。',
      modifiers: [
        { stat: 'armor', type: 'add', amount: 2 },
        { stat: 'maxHealth', type: 'multiply', percent: 0.12 }
      ]
    },
    {
      id: 'tower-shield-ram',
      kind: 'unit-special',
      name: '盾冲',
      summary: '盾击额外提高 35% 击退。',
      trait: 'shieldRam'
    }
  ],
  crossbowman: [
    {
      id: 'crossbowman-piercer',
      kind: 'unit-special',
      name: '破甲弩',
      summary: '普通攻击计算护甲时忽略 35% 护甲。',
      trait: 'armorPierce'
    },
    {
      id: 'crossbowman-heavy-bolt',
      kind: 'unit-special',
      name: '重矢',
      summary: '普通攻击有 28% 概率提高 50% 伤害和击退。',
      trait: 'heavyBolt'
    }
  ],
  waterMage: [
    {
      id: 'water-mage-snare',
      kind: 'unit-special',
      name: '水牢',
      summary: '命中后使目标短时间减速。',
      trait: 'waterSnare'
    },
    {
      id: 'water-mage-great-orb',
      kind: 'unit-special',
      name: '大水弹',
      summary: '攻击有 30% 概率召唤更大的水弹，造成更高伤害。',
      trait: 'greatWaterOrb'
    }
  ],
  rogue: [
    {
      id: 'rogue-backstab',
      kind: 'unit-special',
      name: '背刺',
      summary: '攻击正在被其他友军缠住的目标时伤害 +35%。',
      trait: 'backstab'
    },
    {
      id: 'rogue-smoke-step',
      kind: 'unit-special',
      name: '烟步',
      summary: '攻击后获得短暂闪避提升。',
      trait: 'smokeStep'
    }
  ],
  engineer: [
    {
      id: 'engineer-rapid-repair',
      kind: 'unit-special',
      name: '快修',
      summary: '维修量 +35%，维修间隔缩短。',
      supportModifiers: {
        repairAura: {
          amountFactor: 1.35,
          tickIntervalFactor: 0.82
        }
      }
    },
    {
      id: 'engineer-mini-turret',
      kind: 'unit-special',
      name: '便携炮台',
      summary: '周期性部署 1 个低生命低耐久的小炮台，工匠可维修它。',
      trait: 'miniTurret'
    }
  ],
  physician: [
    {
      id: 'physician-strong-heal',
      kind: 'unit-special',
      name: '强效治疗',
      summary: '治疗量 +45%。',
      supportModifiers: {
        heal: {
          amountFactor: 1.45
        }
      }
    },
    {
      id: 'physician-overheal-shield',
      kind: 'unit-special',
      name: '余辉护盾',
      summary: '治疗目标时额外提供少量护盾。',
      trait: 'healShield'
    }
  ],
  purifier: [
    {
      id: 'purifier-guard',
      kind: 'unit-special',
      name: '净化守护',
      summary: '净化后使目标短时间获得魔抗。',
      trait: 'purifyGuard'
    },
    {
      id: 'purifier-exorcism',
      kind: 'unit-special',
      name: '驱邪',
      summary: '净化成功时对目标周围敌人造成魔法伤害。',
      trait: 'exorcism'
    }
  ],
  warder: [
    {
      id: 'warder-strong-ward',
      kind: 'unit-special',
      name: '强结界',
      summary: '护盾支援量 +40%。',
      supportModifiers: {
        shield: {
          amountFactor: 1.4
        }
      }
    },
    {
      id: 'warder-resonance',
      kind: 'unit-special',
      name: '结界共鸣',
      summary: '给友军护盾时同时提高其魔抗。',
      trait: 'wardResonance'
    }
  ]
};

export function runtimeUpgradeTitleForCard(card) {
  if (card?.kind === 'building') return '升级建筑卡';
  if (card?.kind === 'spell') return '升级地形/法术卡';
  if (card?.kind === 'enchant') return '升级附魔卡';
  if (card?.kind === 'tactic') return '升级战术卡';
  if (card?.kind === 'ability') return '升级能力卡';
  return '升级卡牌';
}

export function runtimeUpgradeSummaryForCard(card) {
  if (card?.kind === 'summon') return '提高同名单位卡召唤单位的全部属性，每级 +25%。';
  if (card?.kind === 'building') return '提升建筑核心效果，尽量强化功能而非肉度。';
  if (card?.id === 'meteor') return '提高陨石伤害、范围和击退。';
  if (card?.kind === 'spell') return '提高区域持续时间、范围或区域效果等级。';
  if (card?.kind === 'enchant') return '提高这张附魔牌施加的附魔等级，本局同名附魔都会同步。';
  if (card?.kind === 'tactic') return '提高战术牌的数值收益。';
  if (card?.kind === 'ability') return '提高局内被动层数，保持温和成长。';
  return '本局内提高这张卡的等级和效果。';
}
