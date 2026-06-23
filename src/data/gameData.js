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
          duration: 0.58,
          events: {
            release: 0.48
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
  }
};

export const ENCHANTMENTS = {
  fire: {
    name: '火焰附加',
    color: '#ff823d',
    duration: 999,
    burnSeconds: 3.4,
    burnDamagePerSecond: 2.4,
    bonusDamage: 1.4
  },
  thorns: {
    name: '荆棘反伤',
    color: '#79d27a',
    duration: 999,
    reflectDamage: 3.2
  }
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
    color: '#4f8f43'
  }
];

export const BALANCE = {
  battlefield: {
    halfWidth: 19,
    minZ: -18,
    maxZ: 18
  },
  playerBase: {
    position: { x: 0, y: 0, z: 13 },
    maxHealth: 320,
    recoveryRadius: 5.8,
    healthPerSecond: 6,
    durabilityPerSecond: 7.5
  },
  enemyCamp: {
    position: { x: 0, y: 0, z: -15 }
  }
};
