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
    summary: '全队物理攻击力与魔法攻击力各 +10%（各至少 +1）。',
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
      summary: '受到普通攻击时有 25% 概率获得 10 点护盾。',
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
      summary: '普通攻击使目标护甲 -3，持续 3 秒。',
      trait: 'sunderArmor'
    },
    {
      id: 'swordsman-flurry',
      kind: 'unit-special',
      name: '连击',
      summary: '普通攻击有 45% 概率追加一次以结算前伤害为基础的 100% 物理伤害。',
      trait: 'flurryStrike'
    }
  ],
  raider: [
    {
      id: 'raider-warcry',
      kind: 'unit-special',
      name: '战吼',
      summary: '攻击时 10 范围内每有一个敌人，伤害 +1，没有上限。',
      trait: 'warcryDamage'
    },
    {
      id: 'raider-intimidate',
      kind: 'unit-special',
      name: '破胆',
      summary: '普通攻击必定使目标物理与魔法攻击力 -4。',
      trait: 'intimidate'
    }
  ],
  berserker: [
    {
      id: 'berserker-bloodthirst',
      kind: 'unit-special',
      name: '浴血',
      summary: '普通攻击造成伤害后，恢复自身已损失生命值的 8%。',
      trait: 'bloodthirst'
    },
    {
      id: 'berserker-cleave',
      kind: 'unit-special',
      name: '旋斩',
      summary: '普通攻击必定对目标周围 4 范围敌人造成以结算前伤害为基础的溅射伤害。',
      trait: 'cleave'
    }
  ],
  archer: [
    {
      id: 'archer-mark',
      kind: 'unit-special',
      name: '标记',
      summary: '命中后使目标护甲 -4，持续 3.5 秒。',
      trait: 'markTarget'
    },
    {
      id: 'archer-eagle-eye',
      kind: 'unit-special',
      name: '鹰眼',
      summary: '射程 +1.8。',
      modifiers: [
        { stat: 'attackRange', type: 'add', amount: 1.8 }
      ]
    }
  ],
  spearman: [
    {
      id: 'spearman-reach',
      kind: 'unit-special',
      name: '长距',
      summary: '攻击距离 +1.2。',
      modifiers: [
        { stat: 'attackRange', type: 'add', amount: 1.2 }
      ]
    },
    {
      id: 'spearman-phalanx',
      kind: 'unit-special',
      name: '方阵',
      summary: '护甲 +3，抗击退 +22%。',
      modifiers: [
        { stat: 'armor', type: 'add', amount: 3 },
        { stat: 'knockbackResistance', type: 'add', amount: 0.22 }
      ]
    }
  ],
  towerShield: [
    {
      id: 'tower-shield-bulwark',
      kind: 'unit-special',
      name: '壁垒',
      summary: '护甲 +4，最大生命 +28%。',
      modifiers: [
        { stat: 'armor', type: 'add', amount: 4 },
        { stat: 'maxHealth', type: 'multiply', percent: 0.28 }
      ]
    },
    {
      id: 'tower-shield-ram',
      kind: 'unit-special',
      name: '盾冲',
      summary: '普通攻击附加自身当前武器耐久 10% 的物理伤害。',
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
      summary: '普通攻击必定造成 1.5 倍伤害并提高击退。',
      trait: 'heavyBolt'
    }
  ],
  waterMage: [
    {
      id: 'water-mage-snare',
      kind: 'unit-special',
      name: '水牢',
      summary: '命中后禁锢目标 2.4 秒，使其无法移动但仍可攻击。',
      trait: 'waterSnare'
    },
    {
      id: 'water-mage-great-orb',
      kind: 'unit-special',
      name: '大水弹',
      summary: '攻击必定发射 1.7 倍大小与碰撞体积的大水弹，伤害与击退更高。',
      trait: 'greatWaterOrb'
    }
  ],
  lightningMage: [
    {
      id: 'lightning-mage-thunder-cloud',
      kind: 'unit-special',
      name: '雷云',
      summary: '攻击时在目标区域召唤双倍大小雷云；雷云持续 10 秒，每 1.25 秒降下落雷，对 4.4 范围造成 70% 魔法攻击的魔法伤害。冷却 15 秒。',
      trait: 'thunderCloud'
    },
    {
      id: 'lightning-mage-durability-siphon',
      kind: 'unit-special',
      name: '耐久汲取',
      summary: '自身武器耐久低于 10 时，吸取 9 范围内最近敌方单位至多 10 点武器耐久并恢复等量耐久。冷却 30 秒。',
      trait: 'lightningSiphon'
    }
  ],
  rogue: [
    {
      id: 'rogue-backstab',
      kind: 'unit-special',
      name: '背刺',
      summary: '目标在 3 秒内被其他单位伤害过时，本次攻击伤害 +50%。',
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
      summary: '维修量翻倍，维修间隔缩短。',
      supportModifiers: {
        repairAura: {
          amountFactor: 2,
          tickIntervalFactor: 0.82
        }
      }
    },
    {
      id: 'engineer-mini-turret',
      kind: 'unit-special',
      name: '便携炮台',
      summary: '周期性部署 1 个小炮台，继承工匠生命、攻击、双抗与耐久成长，保留炮台自己的远程射程与索敌；距离工匠超过 12 时瞬移回其身边。',
      trait: 'miniTurret'
    }
  ],
  physician: [
    {
      id: 'physician-strong-heal',
      kind: 'unit-special',
      name: '强效治疗',
      summary: '治疗量 ×1.7。',
      supportModifiers: {
        heal: {
          amountFactor: 1.7
        }
      }
    },
    {
      id: 'physician-overheal-shield',
      kind: 'unit-special',
      name: '余辉护盾',
      summary: '治疗目标时额外提供治疗量 40% 的护盾。',
      trait: 'healShield'
    }
  ],
  purifier: [
    {
      id: 'purifier-guard',
      kind: 'unit-special',
      name: '净化守护',
      summary: '净化成功后，使目标持续 5 秒每秒恢复 5% 最大生命。',
      trait: 'purifyGuard'
    },
    {
      id: 'purifier-exorcism',
      kind: 'unit-special',
      name: '驱邪',
      summary: '净化成功后，使目标魔抗 +12，持续 30 秒。',
      trait: 'exorcism'
    }
  ],
  warder: [
    {
      id: 'warder-strong-ward',
      kind: 'unit-special',
      name: '强结界',
      summary: '护盾支援量 ×1.7。',
      supportModifiers: {
        shield: {
          amountFactor: 1.7
        }
      }
    },
    {
      id: 'warder-resonance',
      kind: 'unit-special',
      name: '结界共鸣',
      summary: '给友军护盾时，使目标护甲与魔抗各 +7，持续 5 秒。',
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
  if (card?.kind === 'summon') return '提高同名单位卡召唤单位的生命、护盾、攻击、双抗与武器耐久，每级 +25%。';
  if (card?.kind === 'building') return '提升建筑核心效果，尽量强化功能而非肉度。';
  if (card?.id === 'meteor') return '提高陨石伤害、范围和击退。';
  if (card?.kind === 'spell') return '提高区域持续时间、范围或区域效果等级。';
  if (card?.kind === 'enchant') return '提高这张附魔牌施加的附魔等级，本局同名附魔都会同步。';
  if (card?.kind === 'tactic') return '提高战术牌的数值收益。';
  if (card?.kind === 'ability') return '提高局内被动层数，保持温和成长。';
  return '本局内提高这张卡的等级和效果。';
}
