export const TEAMS = {
  PLAYER: 'player',
  ENEMY: 'enemy'
};

export const DECK_SIZE = 30;

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
    maxHealth: 34,
    maxShield: 20,
    speed: 2.85,
    attackRange: 1.35,
    attackRate: 1.05,
    damage: 5.5,
    armor: 5,
    magicResistance: 0,
    dodgeChance: 0.01,
    knockbackResistance: 0.25,
    knockback: 4.8,
    aggroRange: 11.2,
    weapon: {
      name: '铁剑',
      maxDurability: 40,
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
    maxHealth: 28,
    maxShield: 14,
    speed: 3.35,
    attackRange: 1.28,
    attackRate: 1.12,
    damage: 7,
    armor: 1,
    magicResistance: 1,
    dodgeChance: 0.05,
    knockback: 4.2,
    aggroRange: 11.2,
    weapon: {
      name: '铁剑',
      maxDurability: 35,
      durabilityCost: 1.15
    }
  },
  berserker: {
    name: '狂战士',
    role: 'melee',
    art: {
      modelKey: 'unit.berserker',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Axe_Attack',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.52,
          events: {
            impact: 0.58
          }
        },
        hit: {
          duration: 0.22
        }
      }
    },
    maxHealth: 38,
    maxShield: 16,
    speed: 3.25,
    attackRange: 1.32,
    attackRate: 0.96,
    damage: 8,
    armor: 1,
    magicResistance: 1,
    dodgeChance: 0.04,
    knockback: 4.4,
    aggroRange: 11.2,
    weapon: {
      name: '战斧',
      maxDurability: 37,
      durabilityCost: 1.35
    },
    traits: [
      {
        type: 'missingHealthAttackBonus',
        maxBonus: 0.5
      }
    ]
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
    maxShield: 10,
    speed: 2.85,
    attackRange: 8.4,
    attackRate: 0.72,
    damage: 5,
    armor: 1,
    magicResistance: 1,
    dodgeChance: 0.05,
    knockback: 1.45,
    aggroRange: 14.7,
    projectileSpeed: 20.25,
    weapon: {
      name: '短弓',
      maxDurability: 27,
      durabilityCost: 1
    }
  },
  crossbowman: {
    name: '弩手',
    role: 'ranged',
    art: {
      modelKey: 'unit.crossbowman',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Crossbow_Shot',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 1.08,
          events: {
            release: 0.48
          }
        },
        hit: {
          duration: 0.24
        }
      }
    },
    maxHealth: 19,
    maxShield: 9.5,
    speed: 2.55,
    attackRange: 8.8,
    attackRate: 1 / 3,
    damage: 16,
    armor: 1,
    magicResistance: 1,
    dodgeChance: 0.03,
    knockback: 6.3,
    aggroRange: 15.1,
    projectileSpeed: 16.5,
    projectileType: 'bolt',
    weapon: {
      name: '十字弩',
      maxDurability: 29,
      durabilityCost: 1.4
    }
  },
  waterMage: {
    name: '水法师',
    role: 'ranged',
    art: {
      modelKey: 'unit.waterMage',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Water_Cast',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 1.08,
          events: {
            release: 0.52
          }
        },
        hit: {
          duration: 0.24
        }
      }
    },
    maxHealth: 18,
    maxShield: 9,
    speed: 2.65,
    attackRange: 8.2,
    attackRate: 1 / 6,
    damage: 17,
    attackDamageType: 'magic',
    armor: 1,
    magicResistance: 6,
    dodgeChance: 0.03,
    knockback: 2.6,
    aggroRange: 14.8,
    projectileSpeed: 5.8,
    projectileType: 'waterOrb',
    projectileColor: '#65d8ff',
    projectilePierce: {
      radius: 1.03,
      maxDistance: 11.04,
      hitInterval: 0.08
    },
    weapon: {
      name: '潮汐杖',
      maxDurability: 22,
      durabilityCost: 1.5
    }
  },
  rogue: {
    name: '盗贼',
    role: 'melee',
    art: {
      modelKey: 'unit.rogue',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Dagger_Attack',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.42,
          events: {
            impact: 0.5,
            release: 0.5
          }
        },
        hit: {
          duration: 0.2
        }
      }
    },
    maxHealth: 22,
    maxShield: 10,
    speed: 3.75,
    attackRange: 1.12,
    attackRate: 1.28,
    damage: 6,
    armor: 1,
    magicResistance: 1,
    knockback: 2.4,
    aggroRange: 13.2,
    dodgeChance: 0.12,
    weaponAbility: {
      rangedProjectile: {
        key: 'throwDagger',
        cooldown: 7,
        initialCooldown: 0,
        range: 7.5,
        projectileType: 'dagger',
        projectileColor: '#f4fbff',
        projectileSpeed: 9.5,
        animationVariant: 'throw',
        damageMultiplier: 1,
        knockback: 1.2,
        attackLockSeconds: 0.38,
        durabilityCost: 0.7
      }
    },
    weapon: {
      name: '匕首',
      maxDurability: 28,
      durabilityCost: 0.75
    }
  },
  engineer: {
    name: '矮人工匠',
    role: 'melee',
    art: {
      modelKey: 'unit.engineer',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Wrench_Swing',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.5,
          events: {
            impact: 0.56
          }
        },
        hit: {
          duration: 0.22
        }
      }
    },
    maxHealth: 24,
    maxShield: 12,
    speed: 3.05,
    attackRange: 1.18,
    attackRate: 0.75,
    damage: 4,
    armor: 1,
    magicResistance: 1,
    dodgeChance: 0.04,
    knockback: 1.8,
    aggroRange: 9.1,
    support: {
      repairAura: {
        tickInterval: 7,
        initialCooldown: 7,
        range: 5.4,
        amount: 5,
        maxTargets: 1
      }
    },
    weapon: {
      name: '铁匠锤',
      maxDurability: 32,
      durabilityCost: 0.65
    }
  },
  physician: {
    name: '牧师',
    role: 'ranged',
    art: {
      modelKey: 'unit.physician',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Ward_Cast',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.76,
          events: {
            release: 0.52
          }
        },
        hit: {
          duration: 0.22
        }
      }
    },
    maxHealth: 18,
    maxShield: 9,
    speed: 2.76,
    attackRange: 5.9,
    attackRate: 0.5,
    damage: 4,
    attackDamageType: 'magic',
    armor: 1,
    magicResistance: 6,
    dodgeChance: 0.03,
    knockback: 0.55,
    aggroRange: 12.3,
    projectileSpeed: 10.2,
    projectileType: 'holyBolt',
    projectileColor: '#bff6c7',
    support: {
      heal: {
        cooldown: 5.5,
        initialCooldown: 1.6,
        range: 7.2,
        amount: 5
      }
    },
    weapon: {
      name: '治疗杖',
      maxDurability: 21,
      durabilityCost: 0.7
    },
    traits: [
      {
        type: 'damageMultiplierVsFamily',
        family: 'undead',
        multiplier: 2
      }
    ]
  },
  purifier: {
    name: '净咒师',
    role: 'ranged',
    art: {
      modelKey: 'unit.purifier',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Staff_Cast',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.76,
          events: {
            release: 0.52
          }
        },
        hit: {
          duration: 0.22
        }
      }
    },
    maxHealth: 18,
    maxShield: 9,
    speed: 2.72,
    attackRange: 6.3,
    attackRate: 0.55,
    damage: 5,
    attackDamageType: 'magic',
    armor: 1,
    magicResistance: 6,
    dodgeChance: 0.03,
    knockback: 0.85,
    aggroRange: 12.6,
    projectileSpeed: 10.5,
    projectileType: 'holyBolt',
    projectileColor: '#e9fbff',
    support: {
      cleanse: {
        cooldown: 14,
        initialCooldown: 4,
        range: 7.4,
        count: 1
      }
    },
    weapon: {
      name: '净化杖',
      maxDurability: 20,
      durabilityCost: 0.7
    }
  },
  warder: {
    name: '结界师',
    role: 'ranged',
    art: {
      modelKey: 'unit.warder',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Staff_Cast',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.76,
          events: {
            release: 0.52
          }
        },
        hit: {
          duration: 0.22
        }
      }
    },
    maxHealth: 20,
    maxShield: 10,
    speed: 2.65,
    attackRange: 6.1,
    attackRate: 0.5,
    damage: 4,
    attackDamageType: 'magic',
    armor: 1,
    magicResistance: 6,
    dodgeChance: 0.03,
    knockback: 0.7,
    aggroRange: 12.3,
    projectileSpeed: 4.3,
    projectileType: 'wardSigil',
    projectileColor: '#ffb347',
    support: {
      shield: {
        cooldown: 5.5,
        initialCooldown: 2.2,
        range: 7.2,
        amount: 4.5
      }
    },
    weapon: {
      name: '结界法阵',
      maxDurability: 21,
      durabilityCost: 0.7
    }
  },
  arrowTower: {
    name: '箭塔',
    role: 'ranged',
    isBuilding: true,
    canMove: false,
    canReceiveBuffs: false,
    immuneToStatusEffects: true,
    art: {
      modelKey: 'unit.arrowTower',
      rig: 'building',
      clips: {
        idle: 'Idle',
        attack: 'Tower_Shot',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.48,
          events: {
            release: 0.45
          }
        },
        hit: {
          duration: 0.12
        }
      }
    },
    maxHealth: 54,
    maxShield: 0,
    speed: 0,
    attackRange: 9.2,
    attackRate: 1.08,
    damage: 7,
    armor: 0,
    magicResistance: 0,
    dodgeChance: 0,
    knockback: 0.9,
    aggroRange: 14.3,
    projectileSpeed: 23.25,
    projectileType: 'arrow',
    projectileHitHeight: 3.25,
    collisionRadius: 0.62,
    weapon: {
      name: '箭塔',
      maxDurability: 30,
      durabilityCost: 0
    }
  },
  miniTurret: {
    name: '小炮台',
    role: 'ranged',
    art: {
      modelKey: 'unit.miniTurret',
      rig: 'building',
      clips: {
        idle: 'Idle',
        attack: 'Tower_Shot',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.42,
          events: {
            release: 0.42
          }
        },
        hit: {
          duration: 0.12
        }
      }
    },
    maxHealth: 18,
    maxShield: 0,
    speed: 0,
    attackRange: 6.4,
    attackRate: 0.86,
    damage: 3.5,
    armor: 0,
    magicResistance: 0,
    dodgeChance: 0,
    knockback: 0.55,
    aggroRange: 8.8,
    projectileSpeed: 16,
    projectileType: 'bolt',
    projectileColor: '#dff8ff',
    projectileHitHeight: 1.5,
    collisionRadius: 0.38,
    weapon: {
      name: '尖弹匣',
      maxDurability: 16,
      durabilityCost: 0
    }
  },
  repairStation: {
    name: '维修站',
    role: 'support',
    isBuilding: true,
    canMove: false,
    canReceiveBuffs: false,
    immuneToStatusEffects: true,
    art: {
      modelKey: 'unit.repairStation',
      rig: 'building',
      clips: {
        idle: 'Idle',
        hit: 'Hit',
        death: 'Death'
      }
    },
    maxHealth: 56,
    maxShield: 0,
    speed: 0,
    attackRange: 0,
    attackRate: 0,
    damage: 0,
    armor: 0,
    magicResistance: 0,
    dodgeChance: 0,
    knockback: 0,
    aggroRange: 0,
    projectileHitHeight: 2.1,
    collisionRadius: 0.68,
    buildingAura: {
      type: 'restoreDurability',
      radius: 4.1,
      durabilityPerSecond: 2.6,
      restorePerDurability: 1
    },
    weapon: {
      name: '维修储备',
      maxDurability: 54,
      durabilityCost: 0
    }
  },
  canteen: {
    name: '食堂',
    role: 'support',
    isBuilding: true,
    canMove: false,
    canReceiveBuffs: false,
    immuneToStatusEffects: true,
    art: {
      modelKey: 'unit.canteen',
      rig: 'building',
      clips: {
        idle: 'Idle',
        hit: 'Hit',
        death: 'Death'
      }
    },
    maxHealth: 50,
    maxShield: 0,
    speed: 0,
    attackRange: 0,
    attackRate: 0,
    damage: 0,
    armor: 0,
    magicResistance: 0,
    dodgeChance: 0,
    knockback: 0,
    aggroRange: 0,
    projectileHitHeight: 2.2,
    collisionRadius: 0.72,
    buildingAura: {
      type: 'restoreHealthFromDurability',
      radius: 4.1,
      durabilityPerSecond: 2,
      healthPerDurability: 1
    },
    weapon: {
      name: '食材储备',
      maxDurability: 44,
      durabilityCost: 0
    }
  },
  beacon: {
    name: '信标',
    role: 'support',
    isBuilding: true,
    deploymentBeacon: true,
    canMove: false,
    canReceiveBuffs: false,
    immuneToStatusEffects: true,
    deploymentRadius: 7.5,
    art: {
      modelKey: 'unit.beacon',
      rig: 'building',
      clips: {
        idle: 'Idle',
        hit: 'Hit',
        death: 'Death'
      }
    },
    maxHealth: 40,
    maxShield: 0,
    speed: 0,
    attackRange: 0,
    attackRate: 0,
    damage: 0,
    armor: 0,
    magicResistance: 0,
    dodgeChance: 0,
    knockback: 0,
    aggroRange: 0,
    projectileHitHeight: 2.5,
    collisionRadius: 0.58,
    weapon: {
      name: '信标核心',
      maxDurability: 36,
      durabilityCost: 0
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
    maxShield: 10,
    speed: 2.45,
    attackRange: 1.25,
    attackRate: 0.82,
    damage: 6,
    armor: 1,
    magicResistance: 1,
    dodgeChance: 0.04,
    knockback: 2.6,
    aggroRange: 9.8,
    weapon: {
      name: '木棒',
      maxDurability: 32,
      durabilityCost: 0
    }
  },
  enemyRaider: {
    name: '掠袭蛮兵',
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
    maxHealth: 18,
    maxShield: 9,
    speed: 2.55,
    attackRange: 1.22,
    attackRate: 0.9,
    damage: 5.6,
    armor: 1,
    magicResistance: 1,
    dodgeChance: 0.04,
    knockback: 2.25,
    aggroRange: 9.8,
    weapon: {
      name: '劫掠木棒',
      maxDurability: 28,
      durabilityCost: 0
    }
  },
  ogre: {
    name: '食人魔',
    role: 'melee',
    art: {
      modelKey: 'unit.ogre',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Heavy_Walk',
        attack: 'Heavy_Club_Attack',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.82,
          events: {
            impact: 0.62
          }
        },
        hit: {
          duration: 0.28
        }
      }
    },
    maxHealth: 110,
    maxShield: 55,
    speed: 1.58,
    attackRange: 1.72,
    attackRate: 0.42,
    damage: 13,
    armor: 6,
    magicResistance: 0,
    dodgeChance: 0.01,
    knockback: 6.6,
    knockbackResistance: 0.78,
    aggroRange: 11.5,
    weapon: {
      name: '巨棒',
      maxDurability: 42,
      durabilityCost: 0
    }
  },
  skeletonSoldier: {
    name: '骷髅兵',
    role: 'melee',
    family: 'undead',
    art: {
      modelKey: 'unit.skeletonSoldier',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Bone_Sword_Attack',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.46,
          events: {
            impact: 0.56
          }
        },
        hit: {
          duration: 0.2
        }
      }
    },
    maxHealth: 20,
    maxShield: 10,
    speed: 2.95,
    attackRange: 1.18,
    attackRate: 1.02,
    damage: 5,
    armor: 3,
    magicResistance: 1,
    dodgeChance: 0.02,
    knockback: 1.9,
    knockbackResistance: 0.25,
    aggroRange: 10.5,
    weapon: {
      name: '锈剑',
      maxDurability: 30,
      durabilityCost: 0
    },
    traits: [
      {
        type: 'statusImmune',
        statuses: ['poisoned', 'bleeding']
      }
    ]
  },
  skeletonArcher: {
    name: '骷髅射手',
    role: 'ranged',
    family: 'undead',
    art: {
      modelKey: 'unit.skeletonArcher',
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
    maxHealth: 18,
    maxShield: 9,
    speed: 2.82,
    attackRange: 7.6,
    attackRate: 0.7,
    damage: 5,
    armor: 1,
    magicResistance: 1,
    dodgeChance: 0.04,
    knockback: 0.95,
    aggroRange: 13.3,
    projectileSpeed: 12.4,
    projectileColor: '#d9d0b8',
    weapon: {
      name: '骨弓',
      maxDurability: 24,
      durabilityCost: 0
    },
    traits: [
      {
        type: 'statusImmune',
        statuses: ['poisoned', 'bleeding']
      }
    ]
  },
  wizard: {
    name: '巫师',
    role: 'ranged',
    art: {
      modelKey: 'unit.wizard',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Staff_Cast',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.78,
          events: {
            release: 0.54
          }
        },
        hit: {
          duration: 0.2
        }
      }
    },
    maxHealth: 22,
    maxShield: 11,
    speed: 2.38,
    attackRange: 6.8,
    attackRate: 1 / 6,
    damage: 5,
    attackDamageType: 'magic',
    armor: 1,
    magicResistance: 6,
    dodgeChance: 0.03,
    knockback: 0.55,
    aggroRange: 13.2,
    projectileSpeed: 9.8,
    projectileType: 'energyOrb',
    projectileColor: '#b46aff',
    startingBuffs: [
      {
        buffId: 'curse',
        level: 1,
        scalesWithDifficulty: true
      }
    ],
    weapon: {
      name: '诅咒杖',
      maxDurability: 20,
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
    maxShield: 9,
    speed: 2.75,
    attackRange: 1.15,
    attackRate: 0.92,
    damage: 5.5,
    armor: 1,
    magicResistance: 1,
    dodgeChance: 0.05,
    knockback: 2.1,
    aggroRange: 9.8,
    weapon: {
      name: '木棒',
      maxDurability: 28,
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
    maxShield: 7.5,
    speed: 2.65,
    attackRange: 7.2,
    attackRate: 0.62,
    damage: 5,
    armor: 1,
    magicResistance: 1,
    dodgeChance: 0.06,
    knockback: 1.05,
    aggroRange: 12.9,
    projectileSpeed: 12,
    weapon: {
      name: '短弓',
      maxDurability: 23,
      durabilityCost: 0
    }
  },
  goblinHunter: {
    name: '哥布林猎手',
    role: 'ranged',
    art: {
      modelKey: 'unit.goblinHunter',
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
          duration: 0.76,
          events: {
            release: 0.56
          }
        },
        hit: {
          duration: 0.2
        }
      }
    },
    maxHealth: 18,
    maxShield: 8,
    statusHeight: 1.78,
    projectileHitHeight: 1.43,
    speed: 2.92,
    attackRange: 7.8,
    attackRate: 0.74,
    damage: 5.2,
    armor: 1,
    magicResistance: 1,
    dodgeChance: 0.08,
    knockback: 0.75,
    aggroRange: 15.4,
    projectileSpeed: 13.4,
    projectileColor: '#d8ef9b',
    targetPriority: {
      roleWeights: {
        ranged: 7
      },
      supportWeight: 10,
      magicUserWeight: 4,
      backlineWeight: 4,
      woundedHealthRatio: 0.35,
      woundedWeight: 3,
      distanceWeight: 0.72
    },
    weapon: {
      name: '猎弓',
      maxDurability: 24,
      durabilityCost: 0
    }
  },
  goblinShaman: {
    name: '哥布林巫师',
    role: 'ranged',
    art: {
      modelKey: 'unit.goblinShaman',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Staff_Cast',
        support: 'Staff_Cast',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.78,
          events: {
            release: 0.54
          }
        },
        support: {
          duration: 0.78,
          events: {
            release: 0.54
          }
        },
        hit: {
          duration: 0.2
        }
      }
    },
    maxHealth: 20,
    maxShield: 14,
    statusHeight: 2.08,
    projectileHitHeight: 1.78,
    speed: 2.35,
    attackRange: 6.4,
    attackRate: 0.42,
    damage: 4.6,
    attackDamageType: 'magic',
    armor: 1,
    magicResistance: 6,
    dodgeChance: 0.03,
    knockback: 0.55,
    aggroRange: 12.8,
    projectileSpeed: 9.6,
    projectileType: 'energyOrb',
    projectileColor: '#9fe06f',
    support: {
      heal: {
        cooldown: 6.2,
        initialCooldown: 2.4,
        range: 7.2,
        amount: 5.5
      },
      shield: {
        cooldown: 7.4,
        initialCooldown: 3.2,
        range: 7.4,
        amount: 5
      }
    },
    weapon: {
      name: '巫毒杖',
      maxDurability: 22,
      durabilityCost: 0
    }
  },
  goblinTroll: {
    name: '哥布林巨魔',
    role: 'melee',
    art: {
      modelKey: 'unit.goblinTroll',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Heavy_Walk',
        attack: 'Club_Slam',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.62,
          events: {
            impact: 0.6
          }
        },
        hit: {
          duration: 0.26
        }
      }
    },
    maxHealth: 44,
    maxShield: 22,
    speed: 2.05,
    attackRange: 1.42,
    attackRate: 0.58,
    damage: 8,
    armor: 5,
    magicResistance: 0,
    dodgeChance: 0.01,
    knockback: 4.6,
    knockbackResistance: 0.62,
    aggroRange: 10.9,
    weapon: {
      name: '巨木棒',
      maxDurability: 38,
      durabilityCost: 0
    }
  },
  goblinBomber: {
    name: '哥布林爆破手',
    role: 'ranged',
    art: {
      modelKey: 'unit.goblinBomber',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Bomb_Throw',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.72,
          events: {
            release: 0.58
          }
        },
        hit: {
          duration: 0.2
        }
      }
    },
    maxHealth: 17,
    maxShield: 8,
    statusHeight: 1.74,
    projectileHitHeight: 1.38,
    speed: 2.72,
    attackRange: 4.25,
    attackRate: 0.62,
    damage: 5,
    armor: 1,
    magicResistance: 1,
    dodgeChance: 0.04,
    knockback: 2.45,
    aggroRange: 11.6,
    projectileSpeed: 6.7,
    projectileType: 'bomb',
    startingBuffs: [
      {
        buffId: 'explosion',
        level: 0,
        scalesWithDifficulty: true
      }
    ],
    weapon: {
      name: '炸药包',
      maxDurability: 24,
      durabilityCost: 0
    }
  },
  shieldBearer: {
    name: '哥布林盾卫',
    role: 'melee',
    art: {
      modelKey: 'unit.shieldBearer',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Heavy_Walk',
        attack: 'Club_Slam',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.62,
          events: {
            impact: 0.6
          }
        },
        hit: {
          duration: 0.26
        }
      }
    },
    maxHealth: 56,
    maxShield: 44,
    statusHeight: 2.02,
    projectileHitHeight: 1.66,
    speed: 1.78,
    attackRange: 1.32,
    attackRate: 0.52,
    damage: 5.5,
    armor: 6,
    magicResistance: 0,
    dodgeChance: 0.01,
    knockback: 4.2,
    knockbackResistance: 0.72,
    aggroRange: 10.8,
    startingBuffs: [
      {
        buffId: 'protection',
        level: 1,
        scalesWithDifficulty: true
      },
      {
        buffId: 'block',
        level: 1,
        scalesWithDifficulty: true
      }
    ],
    weapon: {
      name: '厚盾',
      maxDurability: 54,
      durabilityCost: 0
    }
  },
  venomArcher: {
    name: '哥布林毒箭手',
    role: 'ranged',
    art: {
      modelKey: 'unit.venomArcher',
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
    maxHealth: 17,
    maxShield: 8,
    statusHeight: 1.88,
    projectileHitHeight: 1.5,
    speed: 2.7,
    attackRange: 7.4,
    attackRate: 0.56,
    damage: 4.5,
    armor: 1,
    magicResistance: 1,
    dodgeChance: 0.06,
    knockback: 0.85,
    aggroRange: 13.1,
    projectileSpeed: 12,
    projectileType: 'venomArrow',
    projectileColor: '#87c75a',
    startingBuffs: [
      {
        buffId: 'poison',
        level: 1,
        scalesWithDifficulty: true
      }
    ],
    weapon: {
      name: '毒箭',
      maxDurability: 22,
      durabilityCost: 0
    }
  },
  elfSniper: {
    name: '精灵狙击手',
    role: 'ranged',
    art: {
      modelKey: 'unit.elfSniper',
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
          duration: 1.02,
          events: {
            release: 0.56
          }
        },
        hit: {
          duration: 0.2
        }
      }
    },
    maxHealth: 22,
    maxShield: 10,
    statusHeight: 2.08,
    projectileHitHeight: 1.7,
    speed: 2.58,
    attackRange: 10.8,
    attackRate: 0.34,
    damage: 9.5,
    armor: 1,
    magicResistance: 2,
    dodgeChance: 0.08,
    knockback: 1.8,
    aggroRange: 18,
    projectileSpeed: 20,
    projectileType: 'arrow',
    projectileColor: '#b7e8ff',
    weapon: {
      name: '长弓',
      maxDurability: 26,
      durabilityCost: 0
    }
  },
  frostAcolyte: {
    name: '寒霜学徒',
    role: 'ranged',
    art: {
      modelKey: 'unit.frostAcolyte',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Staff_Cast',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.78,
          events: {
            release: 0.54
          }
        },
        hit: {
          duration: 0.2
        }
      }
    },
    maxHealth: 24,
    maxShield: 12,
    statusHeight: 2.24,
    projectileHitHeight: 1.92,
    speed: 2.28,
    attackRange: 6.9,
    attackRate: 0.32,
    damage: 5,
    attackDamageType: 'magic',
    armor: 1,
    magicResistance: 6,
    dodgeChance: 0.03,
    knockback: 0.7,
    aggroRange: 13.2,
    projectileSpeed: 9.2,
    projectileType: 'iceShard',
    projectileColor: '#9bdcff',
    startingBuffs: [
      {
        buffId: 'frost',
        level: 1,
        scalesWithDifficulty: true
      }
    ],
    weapon: {
      name: '寒霜杖',
      maxDurability: 20,
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
    maxShield: 12,
    speed: 3.55,
    attackRange: 1.05,
    attackRate: 1.15,
    damage: 5.4,
    armor: 0,
    magicResistance: 1,
    dodgeChance: 0.09,
    knockback: 1.8,
    aggroRange: 9.5,
    weapon: {
      name: '利爪',
      maxDurability: 26,
      durabilityCost: 0
    },
    wildlife: {
      drops: [
        {
          cardId: 'wolf-instinct-enchant',
          chance: 0.55
        }
      ],
      scaling: {
        healthPerDifficulty: 0.14,
        shieldPerDifficulty: 0.14,
        damagePerDifficulty: 0.11
      }
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
    maxShield: 34,
    speed: 2.05,
    attackRange: 1.35,
    attackRate: 0.55,
    damage: 10,
    armor: 4,
    magicResistance: 0,
    dodgeChance: 0.01,
    knockback: 5.2,
    knockbackResistance: 0.68,
    aggroRange: 10.5,
    weapon: {
      name: '巨掌',
      maxDurability: 40,
      durabilityCost: 0
    },
    wildlife: {
      drops: [
        {
          cardId: 'ursine-spirit-enchant',
          chance: 0.65
        }
      ],
      scaling: {
        healthPerDifficulty: 0.16,
        shieldPerDifficulty: 0.16,
        damagePerDifficulty: 0.12
      }
    }
  },
  scorpion: {
    name: '毒蝎',
    role: 'melee',
    art: {
      modelKey: 'unit.scorpion',
      rig: 'beast',
      clips: {
        idle: 'Idle',
        walk: 'Skitter',
        attack: 'Sting_Attack',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.5,
          events: {
            impact: 0.54
          }
        },
        hit: {
          duration: 0.2
        }
      }
    },
    maxHealth: 26,
    maxShield: 13,
    speed: 3.05,
    attackRange: 1.18,
    attackRate: 0.86,
    damage: 4.6,
    armor: 3,
    magicResistance: 1,
    dodgeChance: 0.04,
    knockback: 1.65,
    knockbackResistance: 0.28,
    aggroRange: 11.3,
    startingBuffs: [
      {
        buffId: 'poison',
        level: 1,
        scalesWithDifficulty: true
      }
    ],
    weapon: {
      name: '毒刺',
      maxDurability: 27,
      durabilityCost: 0
    }
  },
  spider: {
    name: '蜘蛛',
    role: 'melee',
    art: {
      modelKey: 'unit.spider',
      rig: 'beast',
      clips: {
        idle: 'Idle',
        walk: 'Skitter',
        attack: 'Bite_Attack',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.44,
          events: {
            impact: 0.52
          }
        },
        hit: {
          duration: 0.18
        }
      }
    },
    maxHealth: 22,
    maxShield: 8,
    speed: 3.3,
    attackRange: 1.04,
    attackRate: 1.05,
    damage: 4.8,
    armor: 0,
    magicResistance: 1,
    dodgeChance: 0.08,
    knockback: 1.25,
    aggroRange: 10.6,
    weapon: {
      name: '毒牙',
      maxDurability: 22,
      durabilityCost: 0
    }
  },
  spiderEgg: {
    name: '蜘蛛卵',
    role: 'melee',
    art: {
      modelKey: 'unit.spiderEgg',
      rig: 'egg',
      clips: {
        idle: 'Idle',
        walk: 'Idle',
        attack: 'Idle',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.3,
          events: {
            impact: 1
          }
        },
        hit: {
          duration: 0.16
        }
      }
    },
    maxHealth: 15,
    maxShield: 0,
    speed: 0,
    attackRange: 0,
    attackRate: 1,
    damage: 0,
    dodgeChance: 0,
    knockback: 0,
    aggroRange: 0,
    weapon: {
      name: '卵壳',
      maxDurability: 15,
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
    burnDamagePerSecondPerLevel: 2.8,
    effects: [
      {
        event: 'afterDamage',
        op: 'applyBuff',
        buffId: 'burning',
        duration: 3.4,
        damagePerSecondPerLevel: 2.8,
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
        amountPerLevel: 4,
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
        amountPerLevel: 0.8
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
  block: {
    name: '格挡',
    category: 'enchantment',
    color: '#d8dde0',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'beforeDamage',
        op: 'absorbDamageWithDurability',
        absorbPerDurability: 2.2,
        absorbPerDurabilityPerLevel: 0.55,
        vfx: 'block'
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
        amountPerLevel: 1.5
      }
    ]
  },
  explosion: {
    name: '爆炸',
    category: 'enchantment',
    color: '#ffb45c',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'afterDamage',
        op: 'explodeOnHit',
        damagePerLevel: 3.2,
        radius: 2.65,
        knockback: 0.42,
        color: '#ffb45c'
      }
    ]
  },
  critical: {
    name: '暴击',
    category: 'enchantment',
    color: '#ffd166',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'modifyAttack',
        op: 'criticalHit',
        chancePerLevel: 0.05,
        multiplier: 3,
        color: '#ffd166'
      }
    ]
  },
  focus: {
    name: '凝神',
    category: 'enchantment',
    color: '#b7e8ff',
    duration: 999,
    level: 1,
    tickInterval: 5,
    effects: [
      {
        event: 'tick',
        op: 'accumulateFocusedRange',
        amountPerLevel: 0.2,
        color: '#b7e8ff'
      },
      {
        event: 'modifyAttack',
        op: 'consumeFocusedRange',
        color: '#b7e8ff'
      }
    ]
  },
  phoenix: {
    name: '不死鸟',
    category: 'enchantment',
    color: '#ffb66c',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'receiveDamage',
        op: 'restoreHealthMissingChance',
        amountPerLevel: 1.5,
        color: '#ffb66c'
      }
    ]
  },
  spiritWeapon: {
    name: '灵武',
    category: 'enchantment',
    color: '#dff8ff',
    duration: 999,
    level: 1,
    tickInterval: 5,
    effects: [
      {
        event: 'tick',
        op: 'restoreDurability',
        amountPerLevel: 2,
        color: '#dff8ff'
      }
    ]
  },
  soulEater: {
    name: '噬魂',
    category: 'enchantment',
    color: '#9f6bff',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'unitDeath',
        op: 'gainMaxHealthOnDeathNearby',
        amountPerLevel: 1,
        radius: 6,
        cooldown: 3,
        color: '#caa7ff'
      }
    ]
  },
  lifesteal: {
    name: '吸血',
    category: 'enchantment',
    color: '#b54848',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'afterDamage',
        op: 'lifestealFromDamage',
        percentBase: 0.1,
        percentPerLevel: 0.04,
        color: '#ff9b9b'
      }
    ]
  },
  drain: {
    name: '汲取',
    category: 'enchantment',
    color: '#7fd8b0',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'afterDamage',
        op: 'applyBuff',
        buffId: 'drained',
        duration: 3,
        damagePerSecondPerLevel: 1.2,
        healPerSecondPerLevel: 1.2,
        vfx: 'drain'
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
        maxHealthDamagePercentPerSecondBase: 0.012,
        maxHealthDamagePercentPerSecondPerLevel: 0.008,
        vfx: 'poison'
      }
    ]
  },
  bleed: {
    name: '流血附加',
    category: 'enchantment',
    color: '#b54848',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'afterDamage',
        op: 'applyBuff',
        buffId: 'bleeding',
        duration: 6,
        damagePerSecondPerLevel: 1.1,
        vfx: 'bleed'
      }
    ]
  },
  curse: {
    name: '诅咒附加',
    category: 'enchantment',
    color: '#9f6bff',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'afterDamage',
        op: 'applyBuff',
        buffId: 'cursed',
        duration: 5,
        damagePerSecondPerLevel: 2.4,
        vfx: 'curse'
      }
    ]
  },
  frost: {
    name: '寒霜附加',
    category: 'enchantment',
    color: '#9bdcff',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'afterDamage',
        op: 'applyBuff',
        buffId: 'chilled',
        duration: 2.8
      }
    ]
  },
  waveSwarm: {
    name: '虫群',
    category: 'enchantment',
    color: '#93c86f',
    duration: 999,
    level: 1,
    modifiers: [
      {
        stat: 'maxHealth',
        type: 'multiply',
        factor: 0.92,
        factorPerLevel: -0.02
      },
      {
        stat: 'attackDamage',
        type: 'multiply',
        factor: 0.97,
        factorPerLevel: -0.015
      },
      {
        stat: 'attackRate',
        type: 'multiply',
        factor: 1.06,
        factorPerLevel: 0.03
      },
      {
        stat: 'moveSpeed',
        type: 'multiply',
        factor: 1.02,
        factorPerLevel: 0.02
      }
    ]
  },
  waveArmored: {
    name: '重甲',
    category: 'enchantment',
    color: '#9fb1c1',
    duration: 999,
    level: 1,
    modifiers: [
      {
        stat: 'maxHealth',
        type: 'multiply',
        factor: 1.1,
        factorPerLevel: 0.025
      },
      {
        stat: 'maxShield',
        type: 'multiply',
        factor: 1.35,
        factorPerLevel: 0.08
      },
      {
        stat: 'armor',
        type: 'add',
        amount: 1.6,
        amountPerLevel: 0.45
      },
      {
        stat: 'knockbackResistance',
        type: 'add',
        amount: 0.16,
        amountPerLevel: 0.035
      }
    ]
  },
  waveRush: {
    name: '冲锋',
    category: 'enchantment',
    color: '#ffd166',
    duration: 999,
    level: 1,
    modifiers: [
      {
        stat: 'moveSpeed',
        type: 'multiply',
        factor: 1.2,
        factorPerLevel: 0.04
      },
      {
        stat: 'attackRate',
        type: 'multiply',
        factor: 1.06,
        factorPerLevel: 0.025
      }
    ]
  },
  waveRanged: {
    name: '远射',
    category: 'enchantment',
    color: '#b7e8ff',
    duration: 999,
    level: 1,
    modifiers: [
      {
        stat: 'attackRange',
        type: 'add',
        amount: 0.55,
        amountPerLevel: 0.18
      },
      {
        stat: 'projectileSpeed',
        type: 'multiply',
        factor: 1.06,
        factorPerLevel: 0.03
      },
      {
        stat: 'attackDamage',
        type: 'multiply',
        factor: 1.03,
        factorPerLevel: 0.02
      }
    ]
  },
  waveSiege: {
    name: '攻城',
    category: 'enchantment',
    color: '#ffb45c',
    duration: 999,
    level: 1,
    modifiers: [
      {
        stat: 'maxHealth',
        type: 'multiply',
        factor: 1.08,
        factorPerLevel: 0.025
      },
      {
        stat: 'attackDamage',
        type: 'multiply',
        factor: 1.14,
        factorPerLevel: 0.04
      },
      {
        stat: 'knockback',
        type: 'multiply',
        factor: 1.06,
        factorPerLevel: 0.03
      },
      {
        stat: 'knockbackResistance',
        type: 'add',
        amount: 0.08,
        amountPerLevel: 0.02
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
        amountPerLevel: 0.35
      }
    ]
  },
  immortality: {
    name: '不朽',
    category: 'enchantment',
    color: '#f1e7a8',
    duration: 999,
    level: 1,
    tickInterval: 1,
    effects: [
      {
        event: 'tick',
        op: 'restoreHealthPercent',
        percent: 0.02,
        color: '#f1e7a8'
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
        amountPerLevel: 0.8
      }
    ],
    effects: [
      {
        event: 'tick',
        op: 'restoreShield',
        amountPerLevel: 0.22
      }
    ]
  },
  wolfInstinct: {
    name: '狼性',
    category: 'enchantment',
    color: '#8ea7b8',
    duration: 999,
    level: 1,
    modifiers: [
      {
        stat: 'attackDamage',
        type: 'add',
        nearbyAllyAmountPerLevel: 1.2,
        radius: 6
      }
    ]
  },
  ursineSpirit: {
    name: '巨熊之魂',
    category: 'enchantment',
    color: '#b98758',
    duration: 999,
    level: 1,
    modifiers: [
      {
        stat: 'attackDamage',
        type: 'multiply',
        percentPerLevel: 0.25
      },
      {
        stat: 'maxHealth',
        type: 'multiply',
        percentPerLevel: 0.25
      }
    ]
  },
  burning: {
    name: '燃烧',
    category: 'status',
    color: '#ff823d',
    duration: 3.4,
    tickInterval: 0.45,
    damagePerSecond: 2.8,
    hidden: true,
    negative: true,
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
    maxHealthDamagePercentPerSecond: 0.02,
    hidden: true,
    negative: true,
    effects: [
      {
        event: 'tick',
        op: 'damageOverTime',
        vfx: 'poison'
      }
    ]
  },
  smokeDodge: {
    name: '烟雾闪避',
    category: 'status',
    color: '#eef7ff',
    duration: 1.2,
    modifiers: [
      {
        stat: 'dodgeChance',
        type: 'add',
        amount: 0.05,
        amountPerLevel: 0.05
      }
    ]
  },
  stunned: {
    name: '眩晕',
    category: 'status',
    color: '#ffd166',
    duration: 0.7,
    hidden: true,
    negative: true
  },
  waterSnared: {
    name: '水牢',
    category: 'status',
    color: '#76cfff',
    duration: 2.4,
    hidden: true,
    negative: true,
    modifiers: [
      {
        stat: 'moveSpeed',
        type: 'multiply',
        factor: 0.62
      }
    ]
  },
  armorShredded: {
    name: '破甲',
    category: 'status',
    color: '#d8c58d',
    duration: 3,
    hidden: true,
    negative: true,
    modifiers: [
      {
        stat: 'armor',
        type: 'add',
        amount: -1
      }
    ]
  },
  marked: {
    name: '标记',
    category: 'status',
    color: '#ffd166',
    duration: 3.5,
    hidden: true,
    negative: true,
    modifiers: [
      {
        stat: 'armor',
        type: 'add',
        amount: -1.5
      }
    ]
  },
  weakenedAttack: {
    name: '破胆',
    category: 'status',
    color: '#b9b07a',
    duration: 3.5,
    hidden: true,
    negative: true,
    modifiers: [
      {
        stat: 'attackDamage',
        type: 'multiply',
        factor: 0.9
      }
    ]
  },
  purifyGuard: {
    name: '净化守护',
    category: 'status',
    color: '#dcefff',
    duration: 5,
    modifiers: [
      {
        stat: 'magicResistance',
        type: 'add',
        amount: 3
      }
    ]
  },
  drained: {
    name: '汲取中',
    category: 'status',
    color: '#7fd8b0',
    duration: 3,
    tickInterval: 1,
    damagePerSecond: 1.2,
    healPerSecond: 1.2,
    hidden: true,
    negative: true,
    effects: [
      {
        event: 'tick',
        op: 'damageOverTimeAndHealSource',
        vfx: 'drain',
        healColor: '#b7f3dd'
      }
    ]
  },
  bleeding: {
    name: '流血',
    category: 'status',
    color: '#b54848',
    duration: 6,
    tickInterval: 1,
    damagePerSecond: 1.1,
    hidden: true,
    negative: true,
    effects: [
      {
        event: 'tick',
        op: 'damageOverTime',
        vfx: 'bleed'
      }
    ]
  },
  cursed: {
    name: '诅咒',
    category: 'status',
    color: '#9f6bff',
    duration: 5,
    tickInterval: 1,
    damagePerSecond: 2.4,
    hidden: true,
    negative: true,
    effects: [
      {
        event: 'tick',
        op: 'damageOverTime',
        vfx: 'curse'
      }
    ]
  },
  chilled: {
    name: '寒冷',
    category: 'status',
    color: '#9bdcff',
    duration: 2.8,
    hidden: true,
    negative: true,
    modifiers: [
      {
        stat: 'moveSpeed',
        type: 'multiply',
        amount: 0.78
      },
      {
        stat: 'attackRate',
        type: 'multiply',
        amount: 0.9
      }
    ]
  }
};

export const ENCHANTMENTS = {
  fire: BUFF_DEFINITIONS.fire,
  thorns: BUFF_DEFINITIONS.thorns,
  toughness: BUFF_DEFINITIONS.toughness,
  protection: BUFF_DEFINITIONS.protection,
  block: BUFF_DEFINITIONS.block,
  power: BUFF_DEFINITIONS.power,
  explosion: BUFF_DEFINITIONS.explosion,
  critical: BUFF_DEFINITIONS.critical,
  focus: BUFF_DEFINITIONS.focus,
  phoenix: BUFF_DEFINITIONS.phoenix,
  spiritWeapon: BUFF_DEFINITIONS.spiritWeapon,
  soulEater: BUFF_DEFINITIONS.soulEater,
  lifesteal: BUFF_DEFINITIONS.lifesteal,
  drain: BUFF_DEFINITIONS.drain,
  poison: BUFF_DEFINITIONS.poison,
  bleed: BUFF_DEFINITIONS.bleed,
  recovery: BUFF_DEFINITIONS.recovery,
  immortality: BUFF_DEFINITIONS.immortality,
  spiritShield: BUFF_DEFINITIONS.spiritShield,
  wolfInstinct: BUFF_DEFINITIONS.wolfInstinct,
  ursineSpirit: BUFF_DEFINITIONS.ursineSpirit,
  waveSwarm: BUFF_DEFINITIONS.waveSwarm,
  waveArmored: BUFF_DEFINITIONS.waveArmored,
  waveRush: BUFF_DEFINITIONS.waveRush,
  waveRanged: BUFF_DEFINITIONS.waveRanged,
  waveSiege: BUFF_DEFINITIONS.waveSiege
};

export const PLAYER_ABILITY_DEFINITIONS = {
  summonUseBonus: {
    id: 'summonUseBonus',
    name: '军团扩编',
    label: '编',
    color: '#8fdc9b',
    summary: '单位卡每次额外召唤增援'
  },
  exhaustEnergy: {
    id: 'exhaustEnergy',
    name: '节能术',
    label: '省',
    color: '#7fd8b0',
    summary: '打出有能量消耗的牌时概率返还能量'
  },
  periodicEnergy: {
    id: 'periodicEnergy',
    name: '魔力泉',
    label: '泉',
    color: '#7f8fc7',
    summary: '每 10 秒获得能量'
  },
  enchantEcho: {
    id: 'enchantEcho',
    name: '附魔回响',
    label: '响',
    color: '#b68cff',
    summary: '使用附魔牌时概率额外生效'
  },
  deathExplosion: {
    id: 'deathExplosion',
    name: '殉爆印记',
    label: '爆',
    color: '#ffb45c',
    summary: '友方单位死亡时爆炸'
  },
  buildingDurability: {
    id: 'buildingDurability',
    name: '加固工法',
    label: '固',
    color: '#d8c58d',
    summary: '之后新建建筑获得额外生命和耐久'
  },
  randomHealOnCard: {
    id: 'randomHealOnCard',
    name: '生机回流',
    label: '愈',
    color: '#6edc8b',
    summary: '打出牌时随机治疗友军'
  },
  victoryGold: {
    id: 'victoryGold',
    name: '凯旋税印',
    label: '金',
    color: '#ffd166',
    summary: '胜利后获得更多金币'
  }
};

export const WAVE_MONSTER_TYPES = [
  'enemyRaider',
  'goblinSoldier',
  'goblinArcher',
  'goblinHunter',
  'goblinShaman',
  'goblinBomber',
  'shieldBearer',
  'venomArcher',
  'elfSniper',
  'frostAcolyte',
  'goblinTroll',
  'skeletonSoldier',
  'skeletonArcher',
  'wizard',
  'scorpion',
  'spider',
  'ogre'
];

export const WAVE_BOSS_TYPES = [
  'goblinTroll',
  'ogre',
  'scorpion',
  'wizard'
];

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
    summary: '高护甲持盾近战，适合吸收物理攻击',
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
    id: 'berserkers',
    name: '派遣狂战士',
    kind: 'summon',
    label: '狂',
    artKey: 'berserker',
    summary: '血越低攻击越高，最多 +50%',
    target: 'ground',
    radius: 1.15,
    cooldown: 6.2,
    energyCost: 3,
    unitType: 'berserker',
    count: 1,
    effect: {
      type: 'spawn-units',
      unitType: 'berserker',
      count: 1
    },
    color: '#8f3240'
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
    id: 'crossbowmen',
    name: '派遣弩手',
    kind: 'summon',
    label: '弩',
    artKey: 'crossbowman',
    summary: '慢速重弩远程，单发高伤害且强击退',
    target: 'ground',
    radius: 1.15,
    cooldown: 8,
    energyCost: 4,
    unitType: 'crossbowman',
    count: 1,
    effect: {
      type: 'spawn-units',
      unitType: 'crossbowman',
      count: 1
    },
    color: '#4f6f78'
  },
  {
    id: 'water-mages',
    name: '派遣水法师',
    kind: 'summon',
    label: '水',
    artKey: 'waterMage',
    summary: '每 3 秒发射穿透水球，水球只会伤害同一单位一次',
    target: 'ground',
    radius: 1.15,
    cooldown: 8,
    energyCost: 4,
    unitType: 'waterMage',
    count: 1,
    effect: {
      type: 'spawn-units',
      unitType: 'waterMage',
      count: 1
    },
    color: '#4f9fbd'
  },
  {
    id: 'rogues',
    name: '派遣盗贼',
    kind: 'summon',
    label: '盗',
    artKey: 'rogue',
    summary: '近战匕首单位，每 7 秒投掷飞刀，12% 闪避普通攻击',
    target: 'ground',
    radius: 1.15,
    cooldown: 6,
    energyCost: 3,
    unitType: 'rogue',
    count: 1,
    effect: {
      type: 'spawn-units',
      unitType: 'rogue',
      count: 1
    },
    color: '#4f5f7c'
  },
  {
    id: 'engineers',
    name: '派遣矮人工匠',
    kind: 'summon',
    label: '工',
    artKey: 'engineer',
    summary: '每 7 秒为周围 1 个单位恢复 5 耐久',
    target: 'ground',
    radius: 1.15,
    cooldown: 7,
    energyCost: 4,
    unitType: 'engineer',
    count: 1,
    effect: {
      type: 'spawn-units',
      unitType: 'engineer',
      count: 1
    },
    color: '#6b9ab8'
  },
  {
    id: 'physicians',
    name: '派遣牧师',
    kind: 'summon',
    label: '医',
    artKey: 'physician',
    summary: '低攻击，周期性治疗受伤友军',
    target: 'ground',
    radius: 1.15,
    cooldown: 7,
    energyCost: 4,
    unitType: 'physician',
    count: 1,
    effect: {
      type: 'spawn-units',
      unitType: 'physician',
      count: 1
    },
    color: '#5f9f73'
  },
  {
    id: 'arrow-tower',
    name: '建造箭塔',
    kind: 'building',
    label: '塔',
    artKey: 'arrowTower',
    summary: '30 秒建成，建成后自动射击周围敌人',
    target: 'ground',
    radius: 1.35,
    cooldown: 16,
    energyCost: 5,
    unitType: 'arrowTower',
    buildSeconds: 30,
    effect: {
      type: 'build-structure',
      unitType: 'arrowTower',
      buildSeconds: 30
    },
    color: '#8f6a3f'
  },
  {
    id: 'repair-station',
    name: '建造维修站',
    kind: 'building',
    label: '修',
    artKey: 'repairStation',
    summary: '消耗自身耐久，缓慢恢复周围单位武器耐久',
    target: 'ground',
    radius: 1.45,
    cooldown: 18,
    energyCost: 5,
    unitType: 'repairStation',
    buildSeconds: 30,
    effect: {
      type: 'build-structure',
      unitType: 'repairStation',
      buildSeconds: 30
    },
    color: '#6b9ab8'
  },
  {
    id: 'canteen',
    name: '建造食堂',
    kind: 'building',
    label: '食',
    artKey: 'canteen',
    summary: '消耗自身耐久，缓慢治疗周围受伤单位',
    target: 'ground',
    radius: 1.55,
    cooldown: 18,
    energyCost: 5,
    unitType: 'canteen',
    buildSeconds: 30,
    effect: {
      type: 'build-structure',
      unitType: 'canteen',
      buildSeconds: 30
    },
    color: '#b98758'
  },
  {
    id: 'beacon',
    name: '建造信标',
    kind: 'building',
    label: '标',
    artKey: 'beacon',
    summary: '可建在任意可通行地面，建成后允许在附近派遣单位',
    target: 'ground',
    radius: 1.25,
    cooldown: 14,
    energyCost: 5,
    unitType: 'beacon',
    buildSeconds: 30,
    effect: {
      type: 'build-structure',
      unitType: 'beacon',
      buildSeconds: 30
    },
    color: '#dff8ff'
  },
  {
    id: 'purifiers',
    name: '派遣净咒师',
    kind: 'summon',
    label: '咒',
    artKey: 'purifier',
    summary: '低攻击，每 14 秒净化友军负面效果',
    target: 'ground',
    radius: 1.15,
    cooldown: 7,
    energyCost: 4,
    unitType: 'purifier',
    count: 1,
    effect: {
      type: 'spawn-units',
      unitType: 'purifier',
      count: 1
    },
    color: '#7f8fc7'
  },
  {
    id: 'warders',
    name: '派遣结界师',
    kind: 'summon',
    label: '界',
    artKey: 'warder',
    summary: '低攻击，周期性为友军补充护盾',
    target: 'ground',
    radius: 1.15,
    cooldown: 7,
    energyCost: 4,
    unitType: 'warder',
    count: 1,
    effect: {
      type: 'spawn-units',
      unitType: 'warder',
      count: 1
    },
    color: '#6b9ab8'
  },
  {
    id: 'meteor',
    name: '召唤陨石',
    kind: 'spell',
    label: '陨',
    artKey: 'meteor',
    summary: '敌我双方都会受到范围伤害与击退',
    target: 'ground',
    radius: 3.25,
    cooldown: 8.5,
    energyCost: 6,
    damage: 38,
    defenseDamageType: 'magic',
    knockback: 7,
    effect: {
      type: 'cast-spell',
      spellId: 'meteor'
    },
    color: '#9a3f35'
  },
  {
    id: 'poison-fog',
    name: '释放毒雾',
    kind: 'spell',
    label: '毒',
    artKey: 'poisonFog',
    summary: '10 秒毒雾，持续给区域内单位施加最大生命值中毒',
    target: 'ground',
    radius: 3.65,
    cooldown: 10.5,
    energyCost: 4,
    effect: {
      type: 'create-area-effect',
      areaEffect: {
        kind: 'poisonFog',
        target: 'all',
        duration: 10,
        radius: 3.65,
        applyInterval: 0.45,
        buffId: 'poisoned',
        buffDuration: 1.8,
        maxHealthDamagePercentPerSecondBase: 0.016,
        maxHealthDamagePercentPerSecondPerLevel: 0.01,
        color: '#78b85a',
        accent: '#dff6a5'
      }
    },
    color: '#78b85a'
  },
  {
    id: 'white-smoke',
    name: '释放白色烟雾',
    kind: 'spell',
    label: '烟',
    artKey: 'whiteSmoke',
    summary: '30 秒白烟，区域内单位获得等级相关闪避率',
    target: 'ground',
    radius: 3.45,
    cooldown: 16,
    energyCost: 4,
    effect: {
      type: 'create-area-effect',
      areaEffect: {
        kind: 'whiteSmoke',
        target: 'all',
        duration: 30,
        radius: 3.45,
        applyInterval: 0.5,
        buffId: 'smokeDodge',
        buffDuration: 1.35,
        color: '#eef7ff',
        accent: '#ffffff'
      }
    },
    color: '#eef7ff'
  },
  {
    id: 'focus-energy',
    name: '凝聚能量',
    kind: 'tactic',
    label: '能',
    artKey: 'tacticEnergySmall',
    summary: '获得 2 点能量；每级额外 +0.5',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 0,
    effect: {
      type: 'gain-energy',
      amountBase: 2,
      amountPerLevel: 0.5
    },
    color: '#6f718a'
  },
  {
    id: 'burst-energy',
    name: '爆发能量',
    kind: 'tactic',
    label: '涌',
    artKey: 'tacticEnergyLarge',
    summary: '获得 3 点能量；升级后每级额外 +1',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 0,
    effect: {
      type: 'gain-energy',
      amountBase: 3,
      amountPerLevel: 1
    },
    color: '#7f8fc7'
  },
  {
    id: 'field-upgrade',
    name: '战术调度',
    kind: 'tactic',
    label: '调',
    artKey: 'tacticUpgrade',
    summary: '从本局出战牌组调度 2 张临时牌；临时位满时排到抽牌堆顶',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 2,
    effect: {
      type: 'draw-temporary-cards',
      amountBase: 2,
      amountPerLevel: 1,
      temporaryLimit: 6,
      fallbackPool: 'selected-deck'
    },
    color: '#8a6fc4'
  },
  {
    id: 'exhaust-energy-ability',
    name: '节能术',
    kind: 'ability',
    label: '省',
    artKey: 'abilityExhaustEnergy',
    summary: '打出有能量消耗的牌时，概率返还 1 点能量',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 2,
    effect: {
      type: 'acquire-ability',
      abilityId: 'exhaustEnergy',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#7fd8b0'
  },
  {
    id: 'periodic-energy-ability',
    name: '魔力泉',
    kind: 'ability',
    label: '泉',
    artKey: 'abilityPeriodicEnergy',
    summary: '每 10 秒获得一次能量',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 3,
    effect: {
      type: 'acquire-ability',
      abilityId: 'periodicEnergy',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#7f8fc7'
  },
  {
    id: 'enchant-echo-ability',
    name: '附魔回响',
    kind: 'ability',
    label: '响',
    artKey: 'abilityEnchantEcho',
    summary: '使用附魔牌时有概率额外生效一次',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 4,
    effect: {
      type: 'acquire-ability',
      abilityId: 'enchantEcho',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#b68cff'
  },
  {
    id: 'death-explosion-ability',
    name: '殉爆印记',
    kind: 'ability',
    label: '爆',
    artKey: 'abilityDeathExplosion',
    summary: '友方单位死亡时产生爆炸',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 4,
    effect: {
      type: 'acquire-ability',
      abilityId: 'deathExplosion',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#ffb45c'
  },
  {
    id: 'building-durability-ability',
    name: '加固工法',
    kind: 'ability',
    label: '固',
    artKey: 'abilityBuildingDurability',
    summary: '之后新建建筑获得额外生命和耐久',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 3,
    effect: {
      type: 'acquire-ability',
      abilityId: 'buildingDurability',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#d8c58d'
  },
  {
    id: 'random-heal-ability',
    name: '生机回流',
    kind: 'ability',
    label: '愈',
    artKey: 'abilityRandomHeal',
    summary: '打出牌时随机治疗友军',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 4,
    effect: {
      type: 'acquire-ability',
      abilityId: 'randomHealOnCard',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#6edc8b'
  },
  {
    id: 'victory-gold-ability',
    name: '凯旋税印',
    kind: 'ability',
    label: '金',
    artKey: 'abilityVictoryGold',
    summary: '游戏胜利后获得更多金币',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 2,
    effect: {
      type: 'acquire-ability',
      abilityId: 'victoryGold',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#ffd166'
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
    id: 'block-enchant',
    name: '格挡附加',
    kind: 'enchant',
    label: '挡',
    artKey: 'block',
    summary: '受伤时优先消耗武器耐久吸收伤害，等级提高效率',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 3,
    enchantmentId: 'block',
    effect: {
      type: 'apply-buff',
      buffId: 'block'
    },
    color: '#d8dde0'
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
    id: 'explosion-enchant',
    name: '爆炸附加',
    kind: 'enchant',
    label: '爆',
    artKey: 'explosion',
    summary: '命中后在目标处爆炸，对周围敌人造成等级 x2 物理伤害',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 4,
    enchantmentId: 'explosion',
    effect: {
      type: 'apply-buff',
      buffId: 'explosion'
    },
    color: '#ffb45c'
  },
  {
    id: 'critical-enchant',
    name: '暴击附加',
    kind: 'enchant',
    label: '暴',
    artKey: 'critical',
    summary: '每级 +5% 暴击率，暴击造成三倍伤害；超过 100% 后转为提高暴击倍率',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 4,
    enchantmentId: 'critical',
    effect: {
      type: 'apply-buff',
      buffId: 'critical'
    },
    color: '#ffd166'
  },
  {
    id: 'focus-enchant',
    name: '凝神附加',
    kind: 'enchant',
    label: '凝',
    artKey: 'focus',
    summary: '待机每 5 秒增加等级 x0.1 攻击距离，下一次攻击转为额外伤害并清零',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 3,
    enchantmentId: 'focus',
    effect: {
      type: 'apply-buff',
      buffId: 'focus'
    },
    color: '#b7e8ff'
  },
  {
    id: 'phoenix-enchant',
    name: '不死鸟附加',
    kind: 'enchant',
    label: '凰',
    artKey: 'phoenix',
    summary: '受伤时按缺血比例概率恢复等级点生命',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 4,
    enchantmentId: 'phoenix',
    effect: {
      type: 'apply-buff',
      buffId: 'phoenix'
    },
    color: '#ff9a47'
  },
  {
    id: 'spirit-weapon-enchant',
    name: '灵武附加',
    kind: 'enchant',
    label: '灵',
    artKey: 'spiritWeapon',
    summary: '每 5 秒恢复等级 x2 的武器耐久',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 3,
    enchantmentId: 'spiritWeapon',
    effect: {
      type: 'apply-buff',
      buffId: 'spiritWeapon'
    },
    color: '#dff8ff'
  },
  {
    id: 'soul-eater-enchant',
    name: '噬魂附加',
    kind: 'enchant',
    label: '魂',
    artKey: 'soulEater',
    summary: '附近单位死亡时增加最大生命，3 秒冷却',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 4,
    enchantmentId: 'soulEater',
    effect: {
      type: 'apply-buff',
      buffId: 'soulEater'
    },
    color: '#9f6bff'
  },
  {
    id: 'lifesteal-enchant',
    name: '吸血附加',
    kind: 'enchant',
    label: '吸',
    artKey: 'lifesteal',
    summary: '按普通攻击伤害比例恢复生命',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 4,
    enchantmentId: 'lifesteal',
    effect: {
      type: 'apply-buff',
      buffId: 'lifesteal'
    },
    color: '#b54848'
  },
  {
    id: 'drain-enchant',
    name: '汲取附加',
    kind: 'enchant',
    label: '汲',
    artKey: 'drain',
    summary: '命中后汲取目标，3 秒内造成伤害并治疗自己',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 4,
    enchantmentId: 'drain',
    effect: {
      type: 'apply-buff',
      buffId: 'drain'
    },
    color: '#7fd8b0'
  },
  {
    id: 'poison-enchant',
    name: '毒附加',
    kind: 'enchant',
    label: '毒',
    artKey: 'poison',
    summary: '命中后造成最大生命值百分比毒伤',
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
    id: 'bleed-enchant',
    name: '流血附加',
    kind: 'enchant',
    label: '血',
    artKey: 'bleed',
    summary: '命中后造成低额持续伤害',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 3,
    enchantmentId: 'bleed',
    effect: {
      type: 'apply-buff',
      buffId: 'bleed'
    },
    color: '#9f3f3f'
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
  },
  {
    id: 'swarm-enchant',
    name: '虫群附魔',
    kind: 'enchant',
    label: '群',
    artKey: 'waveSwarm',
    summary: '生命和攻击略降，但移动与攻速提升',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 2,
    enchantmentId: 'waveSwarm',
    effect: {
      type: 'apply-buff',
      buffId: 'waveSwarm'
    },
    color: '#93c86f'
  },
  {
    id: 'armored-enchant',
    name: '重甲附魔',
    kind: 'enchant',
    label: '甲',
    artKey: 'waveArmored',
    summary: '提高最大生命、护盾与护甲，适合前排',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 4,
    enchantmentId: 'waveArmored',
    effect: {
      type: 'apply-buff',
      buffId: 'waveArmored'
    },
    color: '#9fb1c1'
  },
  {
    id: 'rush-enchant',
    name: '冲锋附魔',
    kind: 'enchant',
    label: '冲',
    artKey: 'waveRush',
    summary: '提高移动速度与攻击节奏',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 3,
    enchantmentId: 'waveRush',
    effect: {
      type: 'apply-buff',
      buffId: 'waveRush'
    },
    color: '#ffd166'
  },
  {
    id: 'ranged-enchant',
    name: '远射附魔',
    kind: 'enchant',
    label: '远',
    artKey: 'waveRanged',
    summary: '提高射程、弹速与少量伤害',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 3,
    enchantmentId: 'waveRanged',
    effect: {
      type: 'apply-buff',
      buffId: 'waveRanged'
    },
    color: '#b7e8ff'
  },
  {
    id: 'siege-enchant',
    name: '攻城附魔',
    kind: 'enchant',
    label: '城',
    artKey: 'waveSiege',
    summary: '提高伤害、击退和少量生命',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 4,
    enchantmentId: 'waveSiege',
    effect: {
      type: 'apply-buff',
      buffId: 'waveSiege'
    },
    color: '#ffb45c'
  },
  {
    id: 'wolf-instinct-enchant',
    name: '狼性',
    kind: 'enchant',
    label: '狼',
    artKey: 'wolfInstinct',
    summary: '附近每名友军每级 +1 攻击',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 1,
    enchantmentId: 'wolfInstinct',
    lootOnly: true,
    effect: {
      type: 'apply-buff',
      buffId: 'wolfInstinct'
    },
    color: '#6f8795'
  },
  {
    id: 'ursine-spirit-enchant',
    name: '巨熊之魂',
    kind: 'enchant',
    label: '熊',
    artKey: 'ursineSpirit',
    summary: '每级 +25% 攻击与最大生命',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 4,
    energyCost: 2,
    enchantmentId: 'ursineSpirit',
    lootOnly: true,
    effect: {
      type: 'apply-buff',
      buffId: 'ursineSpirit'
    },
    color: '#9a6b45'
  }
];

export const STARTER_CARD_IDS = [
  'barbarians',
  'archers',
  'swordsmen',
  'crossbowmen',
  'water-mages',
  'rogues',
  'knights',
  'berserkers',
  'engineers',
  'physicians',
  'arrow-tower',
  'repair-station',
  'canteen',
  'beacon',
  'purifiers',
  'warders',
  'meteor',
  'poison-fog',
  'white-smoke',
  'focus-energy',
  'burst-energy',
  'field-upgrade',
  'exhaust-energy-ability',
  'periodic-energy-ability',
  'fire-enchant',
  'recovery-enchant',
  'spirit-shield-enchant',
  'power-enchant',
  'toughness-enchant',
  'protection-enchant'
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
  crossbowmen: {
    buyCost: 150,
    upgradeBaseCost: 42
  },
  'water-mages': {
    buyCost: 155,
    upgradeBaseCost: 44
  },
  rogues: {
    buyCost: 100,
    upgradeBaseCost: 32
  },
  engineers: {
    buyCost: 115,
    upgradeBaseCost: 32
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
  'swarm-enchant': {
    buyCost: 105,
    upgradeBaseCost: 30
  },
  'armored-enchant': {
    buyCost: 135,
    upgradeBaseCost: 38
  },
  'rush-enchant': {
    buyCost: 115,
    upgradeBaseCost: 34
  },
  'ranged-enchant': {
    buyCost: 125,
    upgradeBaseCost: 36
  },
  'siege-enchant': {
    buyCost: 145,
    upgradeBaseCost: 42
  },
  swordsmen: {
    buyCost: 70,
    upgradeBaseCost: 26
  },
  knights: {
    buyCost: 110,
    upgradeBaseCost: 34
  },
  berserkers: {
    buyCost: 125,
    upgradeBaseCost: 34
  },
  physicians: {
    buyCost: 120,
    upgradeBaseCost: 34
  },
  'arrow-tower': {
    buyCost: 130,
    upgradeBaseCost: 40
  },
  'repair-station': {
    buyCost: 160,
    upgradeBaseCost: 44
  },
  canteen: {
    buyCost: 160,
    upgradeBaseCost: 44
  },
  beacon: {
    buyCost: 100,
    upgradeBaseCost: 34
  },
  purifiers: {
    buyCost: 150,
    upgradeBaseCost: 38
  },
  warders: {
    buyCost: 140,
    upgradeBaseCost: 36
  },
  meteor: {
    buyCost: 140,
    upgradeBaseCost: 45
  },
  'poison-fog': {
    buyCost: 120,
    upgradeBaseCost: 36
  },
  'white-smoke': {
    buyCost: 130,
    upgradeBaseCost: 38
  },
  'focus-energy': {
    buyCost: 95,
    upgradeBaseCost: 70
  },
  'burst-energy': {
    buyCost: 140,
    upgradeBaseCost: 90
  },
  'field-upgrade': {
    buyCost: 180,
    upgradeBaseCost: 110
  },
  'exhaust-energy-ability': {
    buyCost: 150,
    upgradeBaseCost: 95
  },
  'periodic-energy-ability': {
    buyCost: 165,
    upgradeBaseCost: 105
  },
  'enchant-echo-ability': {
    buyCost: 190,
    upgradeBaseCost: 125
  },
  'death-explosion-ability': {
    buyCost: 185,
    upgradeBaseCost: 120
  },
  'building-durability-ability': {
    buyCost: 170,
    upgradeBaseCost: 110
  },
  'random-heal-ability': {
    buyCost: 195,
    upgradeBaseCost: 125
  },
  'victory-gold-ability': {
    buyCost: 175,
    upgradeBaseCost: 115
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
  'block-enchant': {
    buyCost: 120,
    upgradeBaseCost: 34
  },
  'power-enchant': {
    buyCost: 95,
    upgradeBaseCost: 30
  },
  'explosion-enchant': {
    buyCost: 145,
    upgradeBaseCost: 40
  },
  'critical-enchant': {
    buyCost: 130,
    upgradeBaseCost: 38
  },
  'focus-enchant': {
    buyCost: 115,
    upgradeBaseCost: 36
  },
  'phoenix-enchant': {
    buyCost: 135,
    upgradeBaseCost: 38
  },
  'spirit-weapon-enchant': {
    buyCost: 105,
    upgradeBaseCost: 32
  },
  'soul-eater-enchant': {
    buyCost: 150,
    upgradeBaseCost: 42
  },
  'lifesteal-enchant': {
    buyCost: 140,
    upgradeBaseCost: 40
  },
  'drain-enchant': {
    buyCost: 135,
    upgradeBaseCost: 38
  },
  'poison-enchant': {
    buyCost: 120,
    upgradeBaseCost: 34
  },
  'bleed-enchant': {
    buyCost: 105,
    upgradeBaseCost: 30
  }
};

export const LEVEL_DEFINITIONS = [
  {
    id: 'snow-valley',
    name: '雪谷营地',
    subtitle: '怪物营地正在雪谷集结',
    baseReward: 45,
    targetTime: 180,
    name: '雪原营地',
    subtitle: '教学关：在雪原中熟悉出兵、附魔和基地推进',
    baseDifficulty: 1,
    waveDifficultyGrowth: 1,
    enemyPool: [
      { type: 'goblinSoldier', weight: 5, minThreat: 1, minDifficulty: 1 },
      { type: 'spider', weight: 1, minThreat: 2, minDifficulty: 1 },
      { type: 'goblinArcher', weight: 2, minThreat: 3, minDifficulty: 1 },
      { type: 'goblinHunter', weight: 1, minThreat: 5, minDifficulty: 2 }
    ],
    enemyStrategy: {
      profile: 'snow-control',
      squadSize: 3,
      thinkInterval: 3.4,
      captureWeight: 1.45,
      rallyWeight: 0.95,
      holdWeight: 0.55,
      attackWeight: 0.86,
      minAttackSquads: 2,
      rallyPathIndices: [2, 4, 6],
      chokePathIndices: [3, 5, 7],
      openingOrders: ['capture', 'rally', 'attack']
    },
    enemyDirector: {
      baseEnergyPerSecond: 0.56,
      threatPerSecond: 0.018
    },
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
    name: '幽暗地牢',
    subtitle: '地牢关：多个石台由狭窄通路连接，争夺平台之间的推进路线',
    baseDifficulty: 2,
    waveDifficultyGrowth: 1.08,
    enemyPool: [
      { type: 'goblinSoldier', weight: 5, minThreat: 1, minDifficulty: 1 },
      { type: 'goblinArcher', weight: 3, minThreat: 2, minDifficulty: 1 },
      { type: 'spider', weight: 1, minThreat: 2, minDifficulty: 1 },
      { type: 'goblinHunter', weight: 2, minThreat: 4, minDifficulty: 1 },
      { type: 'goblinShaman', weight: 1, minThreat: 5, minDifficulty: 2 },
      { type: 'skeletonSoldier', weight: 2, minThreat: 3, minDifficulty: 2 },
      { type: 'goblinTroll', weight: 1, minThreat: 4, minDifficulty: 2 }
    ],
    enemyStrategy: {
      profile: 'dungeon-choke',
      squadSize: 4,
      thinkInterval: 3,
      captureWeight: 0.85,
      rallyWeight: 1.15,
      holdWeight: 1.65,
      attackWeight: 0.72,
      minAttackSquads: 2,
      rallyPathIndices: [2, 5, 7],
      chokePathIndices: [2, 4, 6, 8],
      openingOrders: ['hold', 'rally', 'capture']
    },
    enemyDirector: {
      baseEnergyPerSecond: 0.62,
      threatPerSecond: 0.02
    },
    world: {
      sceneKey: 'dungeon-halls'
    }
  },
  {
    id: 'frozen-ridge',
    name: '霜脊前线',
    subtitle: '高难度怪物会获得更高成长',
    baseReward: 80,
    targetTime: 240,
    name: '赤岩沙漠',
    subtitle: '沙漠关：阳光会灼烧友军，利用巨岩阴影推进',
    baseDifficulty: 3,
    waveDifficultyGrowth: 1.16,
    enemyPool: [
      { type: 'goblinSoldier', weight: 4, minThreat: 1, minDifficulty: 1 },
      { type: 'goblinArcher', weight: 3, minThreat: 2, minDifficulty: 1 },
      { type: 'skeletonSoldier', weight: 3, minThreat: 2, minDifficulty: 1 },
      { type: 'spider', weight: 1, minThreat: 2, minDifficulty: 1 },
      { type: 'goblinHunter', weight: 2, minThreat: 3, minDifficulty: 1 },
      { type: 'goblinShaman', weight: 2, minThreat: 4, minDifficulty: 1 },
      { type: 'skeletonArcher', weight: 2, minThreat: 4, minDifficulty: 2 },
      { type: 'elfSniper', weight: 1, minThreat: 7, minDifficulty: 3 },
      { type: 'scorpion', weight: 2, minThreat: 3, minDifficulty: 1 },
      { type: 'ogre', weight: 1, minThreat: 5, minDifficulty: 2 }
    ],
    enemyStrategy: {
      profile: 'desert-pressure',
      squadSize: 3,
      thinkInterval: 2.8,
      captureWeight: 0.65,
      rallyWeight: 1.1,
      holdWeight: 0.5,
      attackWeight: 1.35,
      minAttackSquads: 1,
      rallyPathIndices: [2, 4, 6],
      flankPathIndices: [1, 5],
      chokePathIndices: [3, 5],
      openingOrders: ['rally', 'attack', 'capture']
    },
    enemyDirector: {
      baseEnergyPerSecond: 0.68,
      threatPerSecond: 0.022
    },
    world: {
      sceneKey: 'red-desert'
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
        amount: 0.5,
        intervalSeconds: 5
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
        percent: 0.05,
        intervalSeconds: 5
      },
      {
        op: 'restoreDurabilityPercent',
        percent: 0.05,
        intervalSeconds: 5
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
    recoveryRadius: 4.8,
    healthPerSecond: 0.55,
    durabilityPerSecond: 0.8,
    attackRange: 8.5,
    attackDamage: 7,
    attackInterval: 1
  },
  enemyCamp: {
    position: { x: 0, y: 0, z: -30 },
    maxHealth: 260,
    attackRange: 8.5,
    attackDamage: 7,
    attackInterval: 1
  },
  enemyDirector: {
    initialDelaySeconds: 7,
    startingEnergy: 0,
    maxEnergy: 30,
    baseEnergyPerSecond: 0.58,
    energyPerThreat: 0.11,
    decisionIntervalSeconds: 0.35,
    activeEnemyLimit: 12,
    baseThreat: 1,
    threatPerSecond: 0.02,
    threatPerFriendlyUnit: 0.12,
    threatPerPlayerAltar: 0.35,
    threatPerEnemyCampDamageRatio: 1.4,
    maxThreat: 10,
    normalCost: 4.2,
    normalSquadCost: 7.5,
    normalSquadThreat: 2,
    eliteCost: 11.5,
    eliteMinThreat: 2.8,
    eliteCooldownSeconds: 20,
    bossCost: 25,
    bossMinThreat: 4.8,
    bossCooldownSeconds: 60,
    reserveFraction: 0.72,
    openingThreatEnd: 2.4,
    openingHealthMultiplier: 0.62,
    openingDamageMultiplier: 0.56
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
