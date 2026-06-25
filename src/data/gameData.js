export const TEAMS = {
  PLAYER: 'player',
  ENEMY: 'enemy'
};

export const DECK_SIZE = 15;

export const UNIT_DEFINITIONS = {
  knight: {
    name: '骑士',
    role: 'melee',
    art: {
      modelKey: 'unit.knight',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Sword_Attack',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.46,
          events: {
            impact: 0.54
          }
        },
        hit: {
          duration: 0.24
        }
      }
    },
    maxHealth: 25,
    maxShield: 20,
    speed: 3.15,
    attackRange: 1.35,
    attackRate: 1.05,
    damage: 5,
    knockback: 4.8,
    aggroRange: 8,
    weapon: {
      name: '铁剑',
      maxDurability: 38,
      durabilityCost: 1.35
    }
  },
  swordsman: {
    name: '剑士',
    role: 'melee',
    art: {
      modelKey: 'unit.swordsman',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Sword_Attack',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.44,
          events: {
            impact: 0.54
          }
        },
        hit: {
          duration: 0.22
        }
      }
    },
    maxHealth: 20,
    maxShield: 20,
    speed: 3.35,
    attackRange: 1.28,
    attackRate: 1.12,
    damage: 5,
    knockback: 4.2,
    aggroRange: 8,
    weapon: {
      name: '铁剑',
      maxDurability: 34,
      durabilityCost: 1.15
    }
  },
  archer: {
    name: '弓兵',
    role: 'ranged',
    art: {
      modelKey: 'unit.archer',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Bow_Shot',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.86,
          events: {
            release: 0.57
          }
        },
        hit: {
          duration: 0.24
        }
      }
    },
    maxHealth: 20,
    maxShield: 20,
    speed: 2.85,
    attackRange: 8.4,
    attackRate: 0.72,
    damage: 4,
    knockback: 1.45,
    aggroRange: 10.5,
    projectileSpeed: 13.5,
    weapon: {
      name: '短弓',
      maxDurability: 34,
      durabilityCost: 1
    }
  },
  raider: {
    name: '蛮兵',
    role: 'melee',
    art: {
      modelKey: 'unit.raider',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Club_Attack',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.5,
          events: {
            impact: 0.58
          }
        },
        hit: {
          duration: 0.22
        }
      }
    },
    maxHealth: 20,
    maxShield: 20,
    speed: 2.45,
    attackRange: 1.25,
    attackRate: 0.82,
    damage: 4,
    knockback: 2.6,
    aggroRange: 7,
    weapon: {
      name: '木棒',
      maxDurability: 999,
      durabilityCost: 0
    }
  },
  goblinSoldier: {
    name: '哥布林士兵',
    role: 'melee',
    art: {
      modelKey: 'unit.goblinSoldier',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Club_Attack',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.48,
          events: {
            impact: 0.58
          }
        },
        hit: {
          duration: 0.2
        }
      }
    },
    maxHealth: 18,
    maxShield: 0,
    speed: 2.75,
    attackRange: 1.15,
    attackRate: 0.92,
    damage: 3.5,
    knockback: 2.1,
    aggroRange: 7,
    weapon: {
      name: '木棒',
      maxDurability: 999,
      durabilityCost: 0
    }
  },
  goblinArcher: {
    name: '哥布林射手',
    role: 'ranged',
    art: {
      modelKey: 'unit.goblinArcher',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Bow_Shot',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.78,
          events: {
            release: 0.57
          }
        },
        hit: {
          duration: 0.2
        }
      }
    },
    maxHealth: 15,
    maxShield: 0,
    speed: 2.65,
    attackRange: 7.2,
    attackRate: 0.62,
    damage: 3.1,
    knockback: 1.05,
    aggroRange: 9.2,
    projectileSpeed: 12,
    weapon: {
      name: '短弓',
      maxDurability: 999,
      durabilityCost: 0
    }
  },
  wolf: {
    name: '狼',
    role: 'melee',
    art: {
      modelKey: 'unit.wolf',
      rig: 'beast',
      clips: {
        idle: 'Idle',
        walk: 'Bound',
        attack: 'Bite_Attack',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.42,
          events: {
            impact: 0.5
          }
        },
        hit: {
          duration: 0.2
        }
      }
    },
    maxHealth: 24,
    speed: 3.55,
    attackRange: 1.05,
    attackRate: 1.15,
    damage: 3.8,
    knockback: 1.8,
    aggroRange: 6.8,
    weapon: {
      name: '利爪',
      maxDurability: 999,
      durabilityCost: 0
    }
  },
  bear: {
    name: '熊',
    role: 'melee',
    art: {
      modelKey: 'unit.bear',
      rig: 'beast',
      clips: {
        idle: 'Idle',
        walk: 'Heavy_Bound',
        attack: 'Maul_Attack',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.66,
          events: {
            impact: 0.6
          }
        },
        hit: {
          duration: 0.28
        }
      }
    },
    maxHealth: 68,
    speed: 2.05,
    attackRange: 1.35,
    attackRate: 0.55,
    damage: 8.5,
    knockback: 5.2,
    aggroRange: 7.5,
    weapon: {
      name: '巨掌',
      maxDurability: 999,
      durabilityCost: 0
    }
  }
};

export const BUFF_DEFINITIONS = {
  fire: {
    name: '火焰附加',
    category: 'enchantment',
    color: '#ff823d',
    duration: 999,
    level: 1,
    burnSeconds: 3.4,
    burnDamagePerSecondPerLevel: 2.4,
    effects: [
      {
        event: 'afterDamage',
        op: 'applyBuff',
        buffId: 'burning',
        duration: 3.4,
        damagePerSecondPerLevel: 2.4,
        vfx: 'fire'
      }
    ]
  },
  thorns: {
    name: '荆棘反伤',
    category: 'enchantment',
    color: '#79d27a',
    duration: 999,
    effects: [
      {
        event: 'receiveDamage',
        op: 'reflectDamage',
        amountPerLevel: 3.2,
        vfx: 'thorns'
      }
    ]
  },
  toughness: {
    name: '坚韧',
    category: 'enchantment',
    color: '#b9b07a',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'beforeDamage',
        op: 'reduceDamageFlat',
        amountPerLevel: 0.5
      }
    ]
  },
  protection: {
    name: '保护',
    category: 'enchantment',
    color: '#8fb6ff',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'beforeDamage',
        op: 'reduceDamagePercent',
        formula: 'levelOverLevelPlus',
        denominator: 5
      }
    ]
  },
  power: {
    name: '力量',
    category: 'enchantment',
    color: '#e7b64d',
    duration: 999,
    level: 1,
    modifiers: [
      {
        stat: 'attackDamage',
        type: 'add',
        amountPerLevel: 1
      }
    ]
  },
  poison: {
    name: '毒',
    category: 'enchantment',
    color: '#78b85a',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'afterDamage',
        op: 'applyBuff',
        buffId: 'poisoned',
        duration: 3,
        damagePerSecondPerLevel: 3,
        damageType: 'true',
        vfx: 'poison'
      }
    ]
  },
  recovery: {
    name: '恢复',
    category: 'enchantment',
    color: '#6edc8b',
    duration: 999,
    level: 1,
    tickInterval: 1,
    effects: [
      {
        event: 'tick',
        op: 'restoreHealth',
        amountPerLevel: 0.5
      }
    ]
  },
  spiritShield: {
    name: '灵盾',
    category: 'enchantment',
    color: '#dcefff',
    duration: 999,
    level: 1,
    tickInterval: 1,
    modifiers: [
      {
        stat: 'maxShield',
        type: 'add',
        amountPerLevel: 1
      }
    ],
    effects: [
      {
        event: 'tick',
        op: 'restoreShield',
        amountPerLevel: 0.3
      }
    ]
  },
  burning: {
    name: '燃烧',
    category: 'status',
    color: '#ff823d',
    duration: 3.4,
    tickInterval: 0.45,
    damagePerSecond: 2.4,
    hidden: true,
    effects: [
      {
        event: 'tick',
        op: 'damageOverTime',
        vfx: 'fire'
      }
    ]
  },
  poisoned: {
    name: '中毒',
    category: 'status',
    color: '#78b85a',
    duration: 3,
    tickInterval: 1,
    damagePerSecond: 3,
    damageType: 'true',
    hidden: true,
    effects: [
      {
        event: 'tick',
        op: 'damageOverTime',
        damageType: 'true',
        vfx: 'poison'
      }
    ]
  }
};

export const ENCHANTMENTS = {
  fire: BUFF_DEFINITIONS.fire,
  thorns: BUFF_DEFINITIONS.thorns,
  toughness: BUFF_DEFINITIONS.toughness,
  protection: BUFF_DEFINITIONS.protection,
  power: BUFF_DEFINITIONS.power,
  poison: BUFF_DEFINITIONS.poison,
  recovery: BUFF_DEFINITIONS.recovery,
  spiritShield: BUFF_DEFINITIONS.spiritShield
};

export const CARD_DEFINITIONS = [
  {
    id: 'barbarians',
    name: '派遣蛮兵',
    kind: 'summon',
    label: '蛮',
    artKey: 'raider',
    summary: '召唤 1 名木棒近战单位',
    target: 'ground',
    radius: 1.15,
    cooldown: 5.5,
    energyCost: 2,
    unitType: 'raider',
    count: 1,
    effect: {
      type: 'spawn-units',
      unitType: 'raider',
      count: 1
    },
    color: '#9a4d3b'
  },
  {
    id: 'swordsmen',
    name: '派遣剑士',
    kind: 'summon',
    label: '剑',
    artKey: 'swordsman',
    summary: '召唤 1 名无盾剑士',
    target: 'ground',
    radius: 1.15,
    cooldown: 5.5,
    energyCost: 2,
    unitType: 'swordsman',
    count: 1,
    effect: {
      type: 'spawn-units',
      unitType: 'swordsman',
      count: 1
    },
    color: '#8f5b3d'
  },
  {
    id: 'knights',
    name: '派遣骑士',
    kind: 'summon',
    label: '骑',
    artKey: 'knight',
    summary: '召唤 1 名持盾骑士',
    target: 'ground',
    radius: 1.15,
    cooldown: 6.5,
    energyCost: 3,
    unitType: 'knight',
    count: 1,
    effect: {
      type: 'spawn-units',
      unitType: 'knight',
      count: 1
    },
    color: '#6f6a4a'
  },
  {
    id: 'archers',
    name: '派遣弓兵',
    kind: 'summon',
    label: '弓',
    artKey: 'archer',
    summary: '召唤 1 名远程单位',
    target: 'ground',
    radius: 1.15,
    cooldown: 6.5,
    energyCost: 3,
    unitType: 'archer',
    count: 1,
    effect: {
      type: 'spawn-units',
      unitType: 'archer',
      count: 1
    },
    color: '#3f7d5b'
  },
  {
    id: 'meteor',
    name: '召唤陨石',
    kind: 'spell',
    label: '陨',
    artKey: 'meteor',
    summary: '范围伤害与击退',
    target: 'ground',
    radius: 3.25,
    cooldown: 8.5,
    energyCost: 6,
    damage: 38,
    knockback: 7,
    effect: {
      type: 'cast-spell',
      spellId: 'meteor'
    },
    color: '#9a3f35'
  },
  {
    id: 'fire-enchant',
    name: '火焰附加',
    kind: 'enchant',
    label: '火',
    artKey: 'fire',
    summary: '普通攻击点燃目标',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 3,
    enchantmentId: 'fire',
    effect: {
      type: 'apply-buff',
      buffId: 'fire'
    },
    color: '#c8642f'
  },
  {
    id: 'thorns-enchant',
    name: '荆棘附加',
    kind: 'enchant',
    label: '荆',
    artKey: 'thorns',
    summary: '受击时反弹伤害',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 4,
    enchantmentId: 'thorns',
    effect: {
      type: 'apply-buff',
      buffId: 'thorns'
    },
    color: '#4f8f43'
  },
  {
    id: 'toughness-enchant',
    name: '坚韧附加',
    kind: 'enchant',
    label: '韧',
    artKey: 'toughness',
    summary: '每级固定减免 0.5 伤害',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 3,
    enchantmentId: 'toughness',
    effect: {
      type: 'apply-buff',
      buffId: 'toughness'
    },
    color: '#9f9253'
  },
  {
    id: 'protection-enchant',
    name: '保护附加',
    kind: 'enchant',
    label: '护',
    artKey: 'protection',
    summary: '按等级获得百分比减伤',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 4,
    enchantmentId: 'protection',
    effect: {
      type: 'apply-buff',
      buffId: 'protection'
    },
    color: '#557fc9'
  },
  {
    id: 'power-enchant',
    name: '力量附加',
    kind: 'enchant',
    label: '力',
    artKey: 'power',
    summary: '每级 +1 基础攻击力',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 3,
    enchantmentId: 'power',
    effect: {
      type: 'apply-buff',
      buffId: 'power'
    },
    color: '#b97d2c'
  },
  {
    id: 'poison-enchant',
    name: '毒附加',
    kind: 'enchant',
    label: '毒',
    artKey: 'poison',
    summary: '命中后造成真实毒伤',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 4,
    enchantmentId: 'poison',
    effect: {
      type: 'apply-buff',
      buffId: 'poison'
    },
    color: '#5f9f4f'
  },
  {
    id: 'recovery-enchant',
    name: '恢复附加',
    kind: 'enchant',
    label: '愈',
    artKey: 'recovery',
    summary: '每秒恢复生命',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 3,
    enchantmentId: 'recovery',
    effect: {
      type: 'apply-buff',
      buffId: 'recovery'
    },
    color: '#4b9f65'
  },
  {
    id: 'spirit-shield-enchant',
    name: '灵盾附加',
    kind: 'enchant',
    label: '盾',
    artKey: 'spiritShield',
    summary: '每秒获得护盾',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 4,
    enchantmentId: 'spiritShield',
    effect: {
      type: 'apply-buff',
      buffId: 'spiritShield'
    },
    color: '#8fb7dc'
  }
];

export const STARTER_CARD_IDS = [
  'barbarians',
  'archers',
  'fire-enchant',
  'recovery-enchant',
  'spirit-shield-enchant'
];

export const CARD_META = {
  barbarians: {
    initial: true,
    buyCost: 0,
    upgradeBaseCost: 20
  },
  archers: {
    initial: true,
    buyCost: 0,
    upgradeBaseCost: 24
  },
  'fire-enchant': {
    initial: true,
    buyCost: 0,
    upgradeBaseCost: 26
  },
  'recovery-enchant': {
    initial: true,
    buyCost: 0,
    upgradeBaseCost: 22
  },
  'spirit-shield-enchant': {
    initial: true,
    buyCost: 0,
    upgradeBaseCost: 28
  },
  swordsmen: {
    buyCost: 70,
    upgradeBaseCost: 26
  },
  knights: {
    buyCost: 110,
    upgradeBaseCost: 34
  },
  meteor: {
    buyCost: 140,
    upgradeBaseCost: 45
  },
  'thorns-enchant': {
    buyCost: 90,
    upgradeBaseCost: 30
  },
  'toughness-enchant': {
    buyCost: 80,
    upgradeBaseCost: 26
  },
  'protection-enchant': {
    buyCost: 110,
    upgradeBaseCost: 34
  },
  'power-enchant': {
    buyCost: 95,
    upgradeBaseCost: 30
  },
  'poison-enchant': {
    buyCost: 120,
    upgradeBaseCost: 34
  }
};

export const LEVEL_DEFINITIONS = [
  {
    id: 'snow-valley',
    name: '雪谷营地',
    subtitle: '怪物营地正在雪谷集结',
    baseReward: 45,
    targetTime: 180,
    world: {
      sceneKey: 'snow-valley'
    }
  },
  {
    id: 'pine-pass',
    name: '松林通道',
    subtitle: '林带更密，敌方射手开始增多',
    baseReward: 60,
    targetTime: 210,
    world: {
      sceneKey: 'pine-pass'
    }
  },
  {
    id: 'frozen-ridge',
    name: '霜脊前线',
    subtitle: '高难度怪物会获得更高成长',
    baseReward: 80,
    targetTime: 240,
    world: {
      sceneKey: 'frozen-ridge'
    }
  }
];

export const ALTAR_DEFINITIONS = {
  energy: {
    name: '能量祭坛',
    color: '#69d9ff',
    captureSeconds: 6,
    captureRadius: 4.4,
    effectRadius: 0,
    effects: [
      {
        op: 'restoreEnergy',
        amount: 1,
        intervalSeconds: 10
      }
    ]
  },
  shield: {
    name: '护盾祭坛',
    color: '#e7f6ff',
    captureSeconds: 6,
    captureRadius: 4.4,
    effectRadius: 6.6,
    effects: [
      {
        op: 'restoreShield',
        amountPerSecond: 0.2
      }
    ]
  },
  respite: {
    name: '修养祭坛',
    color: '#8fe6a8',
    captureSeconds: 6,
    captureRadius: 4.4,
    effectRadius: 6.6,
    effects: [
      {
        op: 'restoreHealthPercent',
        percentPerSecond: 0.005
      },
      {
        op: 'restoreDurabilityPercent',
        percentPerSecond: 0.005
      }
    ]
  }
};

export const BALANCE = {
  battlefield: {
    halfWidth: 42,
    minZ: -40,
    maxZ: 40
  },
  playerBase: {
    position: { x: 0, y: 0, z: 30 },
    maxHealth: 320,
    recoveryRadius: 8.8,
    healthPerSecond: 3,
    durabilityPerSecond: 3.75
  },
  enemyCamp: {
    position: { x: 0, y: 0, z: -30 },
    maxHealth: 260
  },
  world: {
    ground: {
      width: 92,
      depth: 88
    },
    pathWidth: 3.25,
    pathPoints: [
      { x: 0, z: 30 },
      { x: -4, z: 25 },
      { x: -8, z: 19 },
      { x: -4, z: 12 },
      { x: 5, z: 7 },
      { x: 10, z: 1 },
      { x: 6, z: -7 },
      { x: -1, z: -13 },
      { x: -6, z: -20 },
      { x: -4, z: -26 },
      { x: 0, z: -30 }
    ],
    puddles: [
      { x: -18, z: 10, rx: 2.4, rz: 0.9, rot: 0.42 },
      { x: 17, z: 2, rx: 2.7, rz: 1.05, rot: -0.35 },
      { x: -23, z: -20, rx: 2.1, rz: 0.82, rot: 0.58 },
      { x: 22, z: 22, rx: 1.8, rz: 0.72, rot: -0.18 }
    ],
    altars: [
      {
        id: 'energy-altar-west',
        type: 'energy',
        position: { x: -13.2, z: 15.6 },
        rotation: -0.25,
        clearingRadius: 6.2
      },
      {
        id: 'shield-altar-east',
        type: 'shield',
        position: { x: 18.2, z: -7.8 },
        rotation: 0.45,
        clearingRadius: 6.2
      },
      {
        id: 'respite-altar-south',
        type: 'respite',
        position: { x: -10.8, z: -20.2 },
        rotation: 0.2,
        clearingRadius: 6.2
      }
    ],
    wildlife: [
      { type: 'wolf', x: 30, z: 12, radius: 5.6 },
      { type: 'wolf', x: 34, z: 6, radius: 5.2 },
      { type: 'bear', x: -31, z: -10, radius: 6 },
      { type: 'wolf', x: -35, z: -16, radius: 5.4 },
      { type: 'bear', x: 27, z: -18, radius: 5.9 },
      { type: 'wolf', x: 32, z: -24, radius: 5.5 }
    ]
  }
};
