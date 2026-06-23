export const TEAMS = {
  PLAYER: 'player',
  ENEMY: 'enemy'
};

export const UNIT_DEFINITIONS = {
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
    maxHealth: 46,
    speed: 3.15,
    attackRange: 1.35,
    attackRate: 1.05,
    damage: 7,
    knockback: 4.8,
    aggroRange: 8,
    weapon: {
      name: '铁剑',
      maxDurability: 38,
      durabilityCost: 1.35
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
    maxHealth: 32,
    speed: 2.85,
    attackRange: 8.4,
    attackRate: 0.72,
    damage: 4.8,
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
    name: '入侵者',
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
    maxHealth: 30,
    speed: 2.45,
    attackRange: 1.25,
    attackRate: 0.82,
    damage: 4.2,
    knockback: 2.6,
    aggroRange: 7,
    weapon: {
      name: '木棒',
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
    burnSeconds: 3.4,
    burnDamagePerSecond: 2.4,
    bonusDamage: 1.4,
    effects: [
      {
        event: 'modifyAttack',
        op: 'addDamage',
        amount: 1.4,
        damageType: 'fire'
      },
      {
        event: 'afterDamage',
        op: 'applyBuff',
        buffId: 'burning',
        duration: 3.4,
        damagePerSecond: 2.4,
        vfx: 'fire'
      }
    ]
  },
  thorns: {
    name: '荆棘反伤',
    category: 'enchantment',
    color: '#79d27a',
    duration: 999,
    reflectDamage: 3.2,
    effects: [
      {
        event: 'receiveDamage',
        op: 'reflectDamage',
        amount: 3.2,
        vfx: 'thorns'
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
        damageType: 'fire',
        vfx: 'fire'
      }
    ]
  }
};

export const ENCHANTMENTS = {
  fire: BUFF_DEFINITIONS.fire,
  thorns: BUFF_DEFINITIONS.thorns
};

export const CARD_DEFINITIONS = [
  {
    id: 'swordsmen',
    name: '派遣剑士',
    kind: 'summon',
    label: '剑',
    summary: '3 名近战单位',
    target: 'ground',
    radius: 2.25,
    cooldown: 5.5,
    unitType: 'swordsman',
    count: 3,
    effect: {
      type: 'spawn-units',
      unitType: 'swordsman',
      count: 3
    },
    color: '#8f5b3d'
  },
  {
    id: 'archers',
    name: '派遣弓兵',
    kind: 'summon',
    label: '弓',
    summary: '2 名远程单位',
    target: 'ground',
    radius: 2.4,
    cooldown: 6.5,
    unitType: 'archer',
    count: 2,
    effect: {
      type: 'spawn-units',
      unitType: 'archer',
      count: 2
    },
    color: '#3f7d5b'
  },
  {
    id: 'meteor',
    name: '召唤陨石',
    kind: 'spell',
    label: '陨',
    summary: '范围伤害与击退',
    target: 'ground',
    radius: 3.25,
    cooldown: 8.5,
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
    summary: '普通攻击点燃目标',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
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
    summary: '受击时反弹伤害',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    enchantmentId: 'thorns',
    effect: {
      type: 'apply-buff',
      buffId: 'thorns'
    },
    color: '#4f8f43'
  }
];

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
    healthPerSecond: 6,
    durabilityPerSecond: 7.5
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
    pathWidth: 4.8,
    pathPoints: [
      { x: 0, z: 30 },
      { x: -8, z: 24 },
      { x: -5, z: 17 },
      { x: 10, z: 10 },
      { x: 6, z: 3 },
      { x: -2, z: -5 },
      { x: -8, z: -12 },
      { x: -12, z: -17 },
      { x: -7, z: -25 },
      { x: 0, z: -30 }
    ],
    puddles: [
      { x: -24, z: 5, rx: 3.8, rz: 1.55, rot: 0.25 },
      { x: 21, z: -5, rx: 3.2, rz: 1.35, rot: -0.55 },
      { x: -30, z: -28, rx: 2.6, rz: 1.1, rot: 0.42 },
      { x: 14, z: 23, rx: 2.2, rz: 0.95, rot: -0.2 }
    ],
    wildlife: [
      { type: 'wolf', x: -14, z: 22, radius: 6.8 },
      { type: 'wolf', x: 18, z: 12, radius: 6.4 },
      { type: 'bear', x: -24, z: -19, radius: 7.2 },
      { type: 'wolf', x: 20, z: -21, radius: 6.6 },
      { type: 'bear', x: 4, z: -33, radius: 7.6 },
      { type: 'wolf', x: -7, z: -32, radius: 6.4 }
    ]
  }
};
