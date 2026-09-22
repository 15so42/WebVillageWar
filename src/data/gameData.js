export const TEAMS = {
  PLAYER: 'player',
  ENEMY: 'enemy'
};

export const DECK_SIZE = 18;
export const ACTIVE_DECK_SIZE = 12;
export const TERRAIN_CARD_IDS = [
  'meteor',
  'poison-fog',
  'white-smoke',
  'plague-field',
  'wildfire',
  'lava-eruption'
];
export const TERRAIN_CARD_COOLDOWN_SECONDS = 22;

export function isTerrainCard(card) {
  if (!card) return false;
  if (card.terrainCard === true) return true;
  return TERRAIN_CARD_IDS.includes(card.id);
}

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
      // 武器家族：换装必须同族（方案第 6.2 节），用配置标识判定而不是名字字符串
      family: 'sword',
      maxDurability: 35,
      durabilityCost: 1.15
    },
    traits: [
      {
        type: 'attackBlock',
        chance: 0.3,
        damageMultiplier: 0.5
      }
    ]
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
      family: 'bow',
      maxDurability: 27,
      durabilityCost: 1
    }
  },
  spearman: {
    name: '长矛兵',
    role: 'melee',
    art: {
      modelKey: 'unit.spearman',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Spear_Thrust',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.48,
          events: {
            impact: 0.52
          }
        },
        hit: {
          duration: 0.22
        }
      }
    },
    maxHealth: 25,
    maxShield: 12,
    speed: 3.05,
    attackRange: 2.5,
    attackRate: 1,
    damage: 5.5,
    armor: 0,
    magicResistance: 1,
    dodgeChance: 0.03,
    knockback: 2.8,
    aggroRange: 11.5,
    weapon: {
      name: '长矛',
      maxDurability: 30,
      durabilityCost: 1
    }
  },
  towerShield: {
    name: '塔盾兵',
    role: 'melee',
    art: {
      modelKey: 'unit.towerShield',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Heavy_Walk',
        attack: 'Shield_Push',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.56,
          events: {
            impact: 0.58
          }
        },
        hit: {
          duration: 0.24
        }
      }
    },
    maxHealth: 34,
    maxShield: 22,
    speed: 2.35,
    attackRange: 1.25,
    attackRate: 0.78,
    damage: 5,
    armor: 8,
    magicResistance: 0,
    dodgeChance: 0.01,
    knockback: 5.2,
    knockbackResistance: 0.35,
    aggroRange: 10.8,
    weapon: {
      name: '塔盾',
      maxDurability: 45,
      durabilityCost: 0.85
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
    attackRange: 11.0,
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
  lightningMage: {
    name: '雷法师',
    role: 'ranged',
    art: {
      modelKey: 'unit.lightningMage',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Lightning_Cast',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 1.16,
          events: {
            release: 0.54
          }
        },
        hit: {
          duration: 0.24
        }
      }
    },
    maxHealth: 15,
    maxShield: 7,
    speed: 2.55,
    attackRange: 8.6,
    attackRate: 1 / 5,
    damage: 20,
    attackDamageType: 'magic',
    armor: 0,
    magicResistance: 4,
    dodgeChance: 0.03,
    knockback: 0.8,
    aggroRange: 15.2,
    attackBehavior: {
      type: 'chainLightning',
      jumpRange: 4.4,
      color: '#bba8ff'
    },
    specialAbilities: {
      thunderCloud: {
        cooldown: 15,
        duration: 10,
        strikeInterval: 1.25,
        strikeRadius: 4.4,
        damageMultiplier: 0.7,
        driftRadius: 0.85,
        height: 5.1,
        visualScale: 2
      },
      lightningSiphon: {
        cooldown: 30,
        triggerDurability: 10,
        amount: 10,
        range: 9
      }
    },
    weapon: {
      name: '雷鸣法杖',
      maxDurability: 18,
      durabilityCost: 1.6
    }
  },
  windMage: {
    name: '风法师',
    role: 'ranged',
    art: {
      modelKey: 'unit.windMage',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Wind_Cast',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 1.24,
          events: {
            release: 0.56
          }
        },
        hit: {
          duration: 0.24
        }
      }
    },
    maxHealth: 16,
    maxShield: 8,
    speed: 2.5,
    attackRange: 8.4,
    attackRate: 1 / 7,
    damage: 4,
    attackDamageType: 'magic',
    armor: 0,
    magicResistance: 5,
    dodgeChance: 0.03,
    knockback: 0.5,
    aggroRange: 14.6,
    // 普通攻击不再发射投射物，而是向前推进一道飓风：
    // 每 tickInterval 秒对范围内敌人造成一次魔法伤害并吸引，附带命中特效。
    attackBehavior: {
      type: 'hurricane',
      radius: 2.5,
      advanceSpeed: 1.5,
      startOffset: 1.2,
      duration: 6,
      tickInterval: 0.4,
      tickDamageMultiplier: 1,
      pullStrength: 1.6,
      color: '#bfeaf0',
      accent: '#eafcff'
    },
    weapon: {
      name: '飓风杖',
      maxDurability: 16,
      durabilityCost: 1.4
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
    dodgeChance: 0.18,
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
        amount: 10,
        spellPowerFactor: 0.5,
        maxTargets: 1,
        includeBase: true,
        baseRange: 8.5,
        baseHealthPercent: 0.05,
        baseDurabilityPercent: 0.05
      }
    },
    weapon: {
      name: '铁匠锤',
      // 初始耐久 +60%（32 → 51）
      maxDurability: 51,
      durabilityCost: 0.65
    }
  },
  // 木傀儡：非战斗后勤单位，负责采集、搬运和跑腿，本身不参战。
  // role 用自由字符串 'worker'：全仓只有 'melee' / 'ranged' / 'support' 三处
  // 字符串比较（索敌、攻击动作、面板分类），新值走到的是"非远程非支援"的中性分支。
  // 伤害与索敌全部为 0，武器块仍然必须有：UnitEntity.createUnitAttributes 要读
  // weapon.maxDurability / weapon.durabilityCost，缺了会在生成时抛错。
  // 活动魔力（activityMana / manaCapacity / drainPerSecond / isWorker）是运行时实例字段，
  // 由供能系统写入，这里刻意不写进定义，避免"定义里像是有、实际没人读"的假字段。
  woodPuppet: {
    name: '木傀儡',
    role: 'worker',
    art: {
      modelKey: 'unit.woodPuppet',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        hit: {
          duration: 0.22
        }
      }
    },
    maxHealth: 30,
    maxShield: 0,
    speed: 2.85,
    canMove: true,
    // 非战斗：不造成任何伤害，也不主动索敌
    physicalAttack: 0,
    magicAttack: 0,
    damage: 0,
    aggroRange: 0,
    // 攻击相关字段保留成合法数值，避免除零或 NaN 扩散到索敌/动作计时
    attackRange: 0.9,
    attackRate: 1,
    attackRadius: 0.34,
    armor: 2,
    magicResistance: 0,
    dodgeChance: 0,
    knockback: 0,
    projectileHitHeight: 1.45,
    collisionRadius: 0.42,
    statusHeight: 1.72,
    traits: [],
    weapon: {
      name: '木质手臂',
      maxDurability: 40,
      // 非战斗单位不消耗耐久（与维修站/食堂一致）
      durabilityCost: 0
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
        amount: 5,
        spellPowerFactor: 0.5
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
        amount: 4.5,
        spellPowerFactor: 0.5
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
      durabilityCost: 1
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
    ownerRecall: {
      maxDistance: 12,
      returnRadius: 1.45,
      checkInterval: 0.25
    },
    weapon: {
      name: '尖弹匣',
      maxDurability: 16,
      durabilityCost: 0
    }
  },
  // 刷怪巢穴：海岛刷怪点在场景里的实体，玩家可以攻击并摧毁它。
  // 必须是「惰性建筑」——isBuilding + canMove:false + aggroRange:0，
  // 且不能是 spiderEgg 那种会自我转化/孵化的活单位：
  // 用活单位当占位会衍生出不带点位归属的敌人，把刷怪点的存活统计弄乱。
  spawnPointNest: {
    name: '刷怪巢穴',
    role: 'support',
    isBuilding: true,
    canMove: false,
    canReceiveBuffs: false,
    immuneToStatusEffects: true,
    art: {
      modelKey: 'unit.spawnPointNest',
      rig: 'building',
      clips: { idle: 'Idle', hit: 'Hit', death: 'Death' }
    },
    maxHealth: 420,
    maxShield: 0,
    speed: 0,
    attackRange: 0,
    attackRate: 0,
    damage: 0,
    armor: 4,
    magicResistance: 0,
    dodgeChance: 0,
    knockback: 0,
    aggroRange: 0,
    projectileHitHeight: 2.1,
    collisionRadius: 1.1,
    weapon: {
      name: '巢穴外壳',
      maxDurability: 60,
      durabilityCost: 0
    }
  },
  furnace: {
    name: '熔炉',
    role: 'support',
    isBuilding: true,
    canMove: false,
    canReceiveBuffs: false,
    immuneToStatusEffects: true,
    art: {
      modelKey: 'unit.furnace',
      rig: 'building',
      clips: { idle: 'Idle', hit: 'Hit', death: 'Death' }
    },
    maxHealth: 90,
    maxShield: 0,
    speed: 0,
    attackRange: 0,
    attackRate: 0,
    damage: 0,
    armor: 2,
    magicResistance: 0,
    dodgeChance: 0,
    knockback: 0,
    aggroRange: 0,
    projectileHitHeight: 2.2,
    collisionRadius: 0.9,
    weapon: {
      name: '石砌炉体',
      maxDurability: 40,
      durabilityCost: 0
    }
  },
  // 魔力炉：本身没有生产配方，它的作用写在 FUEL_POWER_CONFIGS 里（烧燃料供能）。
  // `powerSource: true` 让放置校验跳过"附近必须有供能"这条——它就是来供能的。
  manaFurnace: {
    name: '魔力炉',
    role: 'support',
    isBuilding: true,
    canMove: false,
    canReceiveBuffs: false,
    immuneToStatusEffects: true,
    powerSource: true,
    art: {
      modelKey: 'unit.manaFurnace',
      rig: 'building',
      clips: { idle: 'Idle', hit: 'Hit', death: 'Death' }
    },
    maxHealth: 110,
    maxShield: 0,
    speed: 0,
    attackRange: 0,
    attackRate: 0,
    damage: 0,
    armor: 3,
    magicResistance: 2,
    dodgeChance: 0,
    knockback: 0,
    aggroRange: 0,
    projectileHitHeight: 2.8,
    collisionRadius: 1,
    weapon: {
      name: '符文炉体',
      maxDurability: 50,
      durabilityCost: 0
    }
  },
  // 科研站：建造之后才能研究科技。本身不生产物品。
  researchStation: {
    name: '科研站',
    role: 'support',
    isBuilding: true,
    canMove: false,
    canReceiveBuffs: false,
    immuneToStatusEffects: true,
    art: {
      modelKey: 'unit.researchStation',
      rig: 'building',
      clips: { idle: 'Idle', hit: 'Hit', death: 'Death' }
    },
    maxHealth: 80,
    maxShield: 0,
    speed: 0,
    attackRange: 0,
    attackRate: 0,
    damage: 0,
    armor: 2,
    magicResistance: 2,
    dodgeChance: 0,
    knockback: 0,
    aggroRange: 0,
    projectileHitHeight: 2.4,
    collisionRadius: 0.85,
    weapon: {
      name: '书案与图纸',
      maxDurability: 36,
      durabilityCost: 0
    }
  },
  // 附魔台：用材料制作附魔石。必须由「附魔工艺」科技解锁配方。
  enchantTable: {
    name: '附魔台',
    role: 'support',
    isBuilding: true,
    canMove: false,
    canReceiveBuffs: false,
    immuneToStatusEffects: true,
    art: {
      modelKey: 'unit.enchantTable',
      rig: 'building',
      clips: { idle: 'Idle', hit: 'Hit', death: 'Death' }
    },
    maxHealth: 85,
    maxShield: 0,
    speed: 0,
    attackRange: 0,
    attackRate: 0,
    damage: 0,
    armor: 2,
    magicResistance: 4,
    dodgeChance: 0,
    knockback: 0,
    aggroRange: 0,
    projectileHitHeight: 2.3,
    collisionRadius: 0.88,
    weapon: {
      name: '符文台面',
      maxDurability: 40,
      durabilityCost: 0
    }
  },
  // 树坑：一块整好的苗床。不生产物品，靠 PlantingSystem 驱动"种下 → 长成 → 砍伐"。
  treePit: {
    name: '树坑',
    role: 'support',
    isBuilding: true,
    canMove: false,
    canReceiveBuffs: false,
    immuneToStatusEffects: true,
    art: {
      modelKey: 'unit.treePit',
      rig: 'building',
      clips: { idle: 'Idle', hit: 'Hit', death: 'Death' }
    },
    maxHealth: 60,
    maxShield: 0,
    speed: 0,
    attackRange: 0,
    attackRate: 0,
    damage: 0,
    armor: 1,
    magicResistance: 0,
    dodgeChance: 0,
    knockback: 0,
    aggroRange: 0,
    projectileHitHeight: 1.4,
    collisionRadius: 0.8,
    weapon: {
      name: '苗床',
      maxDurability: 30,
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
      restorePerDurability: 1,
      includeStructures: true,
      includeBuildings: true,
      structureHealthPercentPerSecond: 0.007,
      structureDurabilityPercentPerSecond: 0.005,
      buildingHealthPerSecond: 1.1
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
      radius: 8.2,
      durabilityPerSecond: 2,
      healthPerDurability: 1
    },
    weapon: {
      name: '食材储备',
      maxDurability: 88,
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
      family: 'club',
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
    attackRange: 2.58,
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
  // 凛霜狼王：第一关第二个特色 Boss——高速近战猎杀者，自带狼群附魔并持续召唤冰狼
  frostWolfBoss: {
    name: '凛霜狼王',
    role: 'melee',
    art: {
      modelKey: 'unit.frostWolfBoss',
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
            impact: 0.5
          }
        },
        hit: {
          duration: 0.24
        }
      }
    },
    maxHealth: 252,
    maxShield: 66,
    collisionRadius: 0.68,
    statusHeight: 2.05,
    projectileHitHeight: 1.52,
    speed: 3.2,
    attackRange: 1.5,
    attackRate: 0.62,
    damage: 13,
    armor: 4,
    magicResistance: 3,
    dodgeChance: 0.05,
    knockback: 4.4,
    knockbackResistance: 0.48,
    aggroRange: 11.5,
    monsterAbility: {
      type: 'frostPounce',
      key: 'frost-wolf-pounce',
      cooldown: 8,
      initialCooldown: 4.5,
      range: 6,
      pathRadius: 1.3,
      impactRadius: 1.9,
      damageMultiplier: 0.9,
      slowDuration: 1.5,
      statusBuffId: 'frostSnared',
      // 狼群附魔：每隔 summonInterval 秒自动召唤一只冰狼
      summonInterval: 7,
      summonCount: 1
    },
    weapon: {
      name: '霜牙',
      maxDurability: 64,
      durabilityCost: 0
    }
  },
  // 召唤的冰狼（狼群）
  frostWolf: {
    name: '冰狼',
    role: 'melee',
    art: {
      modelKey: 'unit.frostWolf',
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
          duration: 0.46,
          events: {
            impact: 0.46
          }
        },
        hit: {
          duration: 0.24
        }
      }
    },
    maxHealth: 26,
    maxShield: 0,
    collisionRadius: 0.44,
    statusHeight: 1.15,
    projectileHitHeight: 0.9,
    speed: 3.5,
    attackRange: 1.25,
    attackRate: 0.85,
    damage: 5,
    armor: 1,
    magicResistance: 1,
    dodgeChance: 0.04,
    knockback: 1.9,
    knockbackResistance: 0.22,
    aggroRange: 9.5,
    weapon: {
      name: '冰爪',
      maxDurability: 18,
      durabilityCost: 0
    }
  },
  // 冰川先知：第一关第三个特色 Boss——远程控场施法者，风暴追逐最近敌人，冰镜结晶反射基地激光
  frostOracleBoss: {
    name: '冰川先知',
    role: 'ranged',
    art: {
      modelKey: 'unit.frostOracleBoss',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Heavy_Walk',
        attack: 'Staff_Cast',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.92,
          events: {
            release: 0.58
          }
        },
        hit: {
          duration: 0.28
        }
      }
    },
    maxHealth: 228,
    maxShield: 84,
    collisionRadius: 0.6,
    statusHeight: 2.6,
    projectileHitHeight: 2.2,
    speed: 1.7,
    attackRange: 9.2,
    attackRate: 0.52,
    damage: 9,
    attackDamageType: 'magic',
    armor: 2,
    magicResistance: 8,
    dodgeChance: 0.03,
    knockback: 3.4,
    knockbackResistance: 0.3,
    aggroRange: 15.5,
    projectileSpeed: 10.5,
    projectileType: 'frostArrow',
    projectileColor: '#bcecff',
    monsterAbility: {
      type: 'frostStorm',
      key: 'frost-oracle-storm',
      cooldown: 10,
      initialCooldown: 5,
      radius: 3.8,
      duration: 4,
      tickSeconds: 1,
      damagePercentOfAttack: 1,
      statusBuffId: 'frostStorm',
      slowDuration: 3,
      // 风暴追逐最近的敌人
      tracking: 'nearestEnemy',
      chaseSpeed: 2.6,
      // 冰镜结晶：被动护盾 + 反弹基地激光
      iceMirrorInterval: 15,
      iceMirrorInitialDelay: 7,
      iceMirrorDuration: 6,
      iceMirrorAbsorb: 50
    },
    weapon: {
      name: '寒潮法杖',
      maxDurability: 66,
      durabilityCost: 0
    }
  },
  frostTrollBoss: {
    name: '冰霜巨魔',
    role: 'melee',
    art: {
      modelKey: 'unit.frostTrollBoss',
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
          duration: 0.72,
          events: {
            impact: 0.58
          }
        },
        hit: {
          duration: 0.28
        }
      }
    },
    maxHealth: 128,
    maxShield: 64,
    collisionRadius: 0.72,
    statusHeight: 2.85,
    projectileHitHeight: 2.4,
    speed: 1.85,
    attackRange: 2.2,
    attackRate: 0.48,
    damage: 11,
    armor: 7,
    magicResistance: 4,
    dodgeChance: 0.02,
    knockback: 5.8,
    knockbackResistance: 0.76,
    aggroRange: 12,
    monsterAbility: {
      type: 'frostStorm',
      key: 'frost-troll-storm',
      cooldown: 6,
      initialCooldown: 4,
      radius: 4.2,
      duration: 3.5,
      tickSeconds: 1,
      damagePercentOfAttack: 1,
      statusBuffId: 'frostStorm',
      slowDuration: 3
    },
    weapon: {
      name: '霜纹巨锤',
      maxDurability: 72,
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
  frostScout: {
    name: '霜箭斥候',
    role: 'ranged',
    art: {
      modelKey: 'unit.frostScout',
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
          duration: 0.8,
          events: {
            release: 0.56
          }
        },
        hit: {
          duration: 0.22
        }
      }
    },
    maxHealth: 64,
    maxShield: 32,
    collisionRadius: 0.42,
    statusHeight: 2.06,
    projectileHitHeight: 1.72,
    speed: 2.76,
    attackRange: 8.55,
    attackRate: 0.58,
    damage: 5.2,
    armor: 2,
    magicResistance: 3,
    dodgeChance: 0.08,
    knockback: 1.2,
    knockbackResistance: 0.18,
    aggroRange: 15.8,
    projectileSpeed: 15.8,
    projectileType: 'frostArrow',
    projectileColor: '#bcecff',
    monsterAbility: {
      type: 'scatterShot',
      key: 'frost-scout-scatter',
      cooldown: 7.6,
      initialCooldown: 2.8,
      range: 9.2,
      projectileCount: 3,
      spread: 0.34,
      slowDuration: 2.5,
      statusBuffId: 'frostSnared'
    },
    weapon: {
      name: '霜枝猎弓',
      maxDurability: 42,
      durabilityCost: 0
    }
  },
  snowDuskShaman: {
    name: '雪暮萨满',
    role: 'ranged',
    art: {
      modelKey: 'unit.snowDuskShaman',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Heavy_Walk',
        attack: 'Staff_Cast',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.92,
          events: {
            release: 0.58
          }
        },
        hit: {
          duration: 0.28
        }
      }
    },
    maxHealth: 116,
    maxShield: 60,
    collisionRadius: 0.66,
    statusHeight: 2.72,
    projectileHitHeight: 2.3,
    speed: 1.92,
    attackRange: 7.4,
    attackRate: 0.46,
    damage: 6.1,
    attackDamageType: 'magic',
    armor: 3,
    magicResistance: 8,
    dodgeChance: 0.02,
    knockback: 2.6,
    knockbackResistance: 0.58,
    aggroRange: 14.5,
    projectileSpeed: 9.6,
    projectileType: 'duskFrostOrb',
    projectileColor: '#dcefff',
    monsterAbility: {
      type: 'frostNova',
      key: 'snow-dusk-nova',
      cooldown: 10.5,
      initialCooldown: 4.8,
      range: 7.8,
      radius: 3.7,
      damage: 6.4,
      slowDuration: 2.8,
      statusBuffId: 'frostSnared'
    },
    weapon: {
      name: '暮雪图腾杖',
      maxDurability: 68,
      durabilityCost: 0
    }
  },
  tombLanternCrossbowman: {
    name: '墓灯弩手',
    role: 'ranged',
    family: 'undead',
    art: {
      modelKey: 'unit.tombLanternCrossbowman',
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
            release: 0.5
          }
        },
        hit: {
          duration: 0.24
        }
      }
    },
    maxHealth: 88,
    maxShield: 44,
    collisionRadius: 0.46,
    statusHeight: 2.18,
    projectileHitHeight: 1.82,
    speed: 2.38,
    attackRange: 10.1,
    attackRate: 0.42,
    damage: 8.4,
    armor: 3,
    magicResistance: 4,
    dodgeChance: 0.04,
    knockback: 3.8,
    knockbackResistance: 0.28,
    aggroRange: 17.2,
    projectileSpeed: 18.4,
    projectileType: 'lanternBolt',
    projectileColor: '#d7b66d',
    monsterAbility: {
      type: 'lanternBolt',
      key: 'tomb-lantern-bolt',
      cooldown: 8.4,
      initialCooldown: 3.6,
      range: 11.6,
      projectilePierce: 3,
      damage: 13.5,
      markDuration: 5
    },
    weapon: {
      name: '墓灯重弩',
      maxDurability: 54,
      durabilityCost: 0
    },
    traits: [
      {
        type: 'statusImmune',
        statuses: ['poisoned', 'bleeding']
      }
    ]
  },
  boneVoicePriest: {
    name: '骨语司祭',
    role: 'ranged',
    family: 'undead',
    art: {
      modelKey: 'unit.boneVoicePriest',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Heavy_Walk',
        attack: 'Staff_Cast',
        support: 'Staff_Cast',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.96,
          events: {
            release: 0.56
          }
        },
        support: {
          duration: 0.96,
          events: {
            release: 0.56
          }
        },
        hit: {
          duration: 0.28
        }
      }
    },
    maxHealth: 150,
    maxShield: 82,
    collisionRadius: 0.76,
    statusHeight: 2.88,
    projectileHitHeight: 2.42,
    speed: 1.82,
    attackRange: 8.2,
    attackRate: 0.4,
    damage: 6.8,
    attackDamageType: 'magic',
    armor: 4,
    magicResistance: 10,
    dodgeChance: 0.02,
    knockback: 2.8,
    knockbackResistance: 0.66,
    aggroRange: 15.5,
    projectileSpeed: 8.8,
    projectileType: 'boneChantOrb',
    projectileColor: '#a8d6c3',
    monsterAbility: {
      type: 'boneWard',
      key: 'bone-voice-ward',
      cooldown: 13.2,
      initialCooldown: 5.5,
      range: 8,
      radius: 4.5,
      shieldAmount: 34,
      summonCount: 2
    },
    weapon: {
      name: '骨语法杖',
      maxDurability: 76,
      durabilityCost: 0
    },
    traits: [
      {
        type: 'statusImmune',
        statuses: ['poisoned', 'bleeding']
      }
    ]
  },
  sandScorpionGuard: {
    name: '流沙蝎卫',
    role: 'melee',
    art: {
      modelKey: 'unit.sandScorpionGuard',
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
          duration: 0.56,
          events: {
            impact: 0.56
          }
        },
        hit: {
          duration: 0.24
        }
      }
    },
    maxHealth: 122,
    maxShield: 64,
    collisionRadius: 0.78,
    statusHeight: 1.72,
    projectileHitHeight: 1.38,
    speed: 3.12,
    attackRange: 1.36,
    attackRate: 0.72,
    damage: 8.6,
    armor: 6,
    magicResistance: 3,
    dodgeChance: 0.05,
    knockback: 3.2,
    knockbackResistance: 0.54,
    aggroRange: 13.8,
    monsterAbility: {
      type: 'venomTail',
      key: 'sand-scorpion-venom-tail',
      cooldown: 6.8,
      initialCooldown: 2.8,
      range: 2.35,
      damage: 10.4,
      poisonDuration: 4.2
    },
    weapon: {
      name: '流沙毒尾',
      maxDurability: 62,
      durabilityCost: 0
    }
  },
  yellowSandOgre: {
    name: '黄沙食人魔',
    role: 'melee',
    art: {
      modelKey: 'unit.yellowSandOgre',
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
          duration: 0.9,
          events: {
            impact: 0.64
          }
        },
        hit: {
          duration: 0.3
        }
      }
    },
    maxHealth: 188,
    maxShield: 104,
    collisionRadius: 1.05,
    statusHeight: 3.08,
    projectileHitHeight: 2.58,
    speed: 1.62,
    attackRange: 1.92,
    attackRate: 0.4,
    damage: 12.4,
    armor: 8,
    magicResistance: 3,
    dodgeChance: 0.01,
    knockback: 7.2,
    knockbackResistance: 0.82,
    aggroRange: 13.4,
    monsterAbility: {
      type: 'sandQuake',
      key: 'yellow-sand-quake',
      cooldown: 12.4,
      initialCooldown: 5.2,
      range: 3.8,
      radius: 4.4,
      damage: 14.5,
      stunDuration: 1.05
    },
    weapon: {
      name: '裂岩石槌',
      maxDurability: 88,
      durabilityCost: 0
    }
  },
  mireHunter: {
    name: '瘴沼猎手',
    role: 'ranged',
    art: {
      modelKey: 'unit.mireHunter',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        attack: 'Spear_Throw',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 0.82,
          events: {
            release: 0.58
          }
        },
        hit: {
          duration: 0.24
        }
      }
    },
    maxHealth: 142,
    maxShield: 72,
    collisionRadius: 0.5,
    statusHeight: 2.28,
    projectileHitHeight: 1.88,
    speed: 2.32,
    attackRange: 9.1,
    attackRate: 0.46,
    damage: 9.2,
    armor: 5,
    magicResistance: 7,
    dodgeChance: 0.04,
    knockback: 3.4,
    knockbackResistance: 0.36,
    aggroRange: 16.8,
    projectileSpeed: 16.2,
    projectileType: 'mireJavelin',
    projectileColor: '#8abf68',
    monsterAbility: {
      type: 'mireJavelin',
      key: 'mire-hunter-javelin',
      cooldown: 8.2,
      initialCooldown: 3.1,
      range: 10.8,
      damage: 14,
      projectilePierce: 2,
      poisonDuration: 4.5
    },
    weapon: {
      name: '瘴藤长矛',
      maxDurability: 68,
      durabilityCost: 0
    }
  },
  rotrootColossus: {
    name: '腐根巨像',
    role: 'ranged',
    art: {
      modelKey: 'unit.rotrootColossus',
      rig: 'humanoid',
      clips: {
        idle: 'Idle',
        walk: 'Heavy_Walk',
        attack: 'Vine_Cast',
        hit: 'Hit',
        death: 'Death'
      },
      timelines: {
        attack: {
          duration: 1.12,
          events: {
            release: 0.56
          }
        },
        hit: {
          duration: 0.32
        }
      }
    },
    maxHealth: 232,
    maxShield: 126,
    collisionRadius: 1.08,
    statusHeight: 3.18,
    projectileHitHeight: 2.62,
    speed: 1.42,
    attackRange: 8.6,
    attackRate: 0.5,
    damage: 12.5,
    attackDamageType: 'magic',
    armor: 9,
    magicResistance: 10,
    dodgeChance: 0,
    knockback: 2.2,
    knockbackResistance: 0.86,
    aggroRange: 16.2,
    projectileSpeed: 9.4,
    projectileType: 'thornVine',
    projectileColor: '#9fbd64',
    monsterAbility: {
      type: 'vineField',
      key: 'rotroot-vine-field',
      cooldown: 10.5,
      initialCooldown: 3.8,
      range: 10.5,
      radius: 3.2,
      duration: 5.4,
      tickInterval: 0.75,
      damagePerSecond: 5.6,
      slowDuration: 1.1,
      statusBuffId: 'mireSnared',
      attackLockSeconds: 0.96,
      animationVariant: 'monsterAbility'
    },
    weapon: {
      name: '棘藤之心',
      maxDurability: 96,
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

Object.values(UNIT_DEFINITIONS).forEach((definition) => {
  const legacyDamage = Number.isFinite(definition.damage) ? definition.damage : 0;
  const primaryType = definition.attackDamageType === 'magic' ? 'magic' : 'physical';
  if (!Number.isFinite(definition.physicalAttack)) {
    definition.physicalAttack = primaryType === 'physical' ? legacyDamage : 0;
  }
  if (!Number.isFinite(definition.magicAttack)) {
    definition.magicAttack = primaryType === 'magic' ? legacyDamage : 0;
  }
  if (!Number.isFinite(definition.damage)) {
    definition.damage = primaryType === 'magic'
      ? definition.magicAttack
      : definition.physicalAttack;
  }
});

export const BUFF_DEFINITIONS = {
  fire: {
    name: '燃烧',
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
  judgment: {
    name: '审判',
    category: 'enchantment',
    color: '#f2cf75',
    duration: 999,
    level: 1,
    effects: [
      {
        // 友方单位受到攻击时触发（含附魔持有者自身）：每个持有者按自身独立的 5 秒冷却
        // 对攻击者降下巨剑，不要求持有者本人被击中。
        event: 'allyDamaged',
        op: 'judgmentRetaliation',
        damagePerLevel: 2,
        cooldown: 5,
        color: '#f2cf75'
      }
    ]
  },
  bodyForging: {
    name: '锻体',
    category: 'enchantment',
    color: '#d9875f',
    duration: 999,
    level: 1,
    tickInterval: 5,
    effects: [
      {
        event: 'tick',
        op: 'gainMaxHealthChance',
        chanceBase: 0.2,
        chancePerLevel: 0.1,
        amount: 1,
        color: '#d9875f'
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
        stat: 'attackPower',
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
  rebirthTotem: {
    name: '复生图腾',
    category: 'enchantment',
    color: '#f1d97a',
    duration: 999,
    level: 1,
    retired: true
  },
  selfDestruct: {
    name: '自爆',
    category: 'enchantment',
    color: '#ff784f',
    duration: 999,
    level: 1
  },
  spiritWeapon: {
    name: '灵武',
    category: 'enchantment',
    color: '#dff8ff',
    duration: 999,
    level: 1,
    modifiers: [
      {
        stat: 'maxDurability',
        type: 'add',
        amountPerLevel: 2
      }
    ],
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
  swordSaint: {
    name: '剑圣',
    category: 'enchantment',
    color: '#ffd166',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'modifyAttack',
        op: 'swordSaintStrike',
        minimumDurabilityRatio: 0.3,
        spendDurabilityRatio: 0.7,
        color: '#ffd166'
      },
      {
        event: 'afterAttack',
        op: 'restoreSwordSaintDurability',
        maxDurabilityPercentPerLevel: 0.02,
        color: '#ffd166'
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
  undying: {
    name: '不灭',
    category: 'enchantment',
    color: '#ffd36a',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'modifyAttack',
        op: 'prepareUndyingStrike',
        maxHealthPercentBase: 0.06,
        maxHealthPercentPerLevel: 0.002,
        cooldown: 6,
        color: '#ffd36a'
      },
      {
        event: 'afterDamage',
        op: 'resolveUndyingStrike',
        color: '#ffe6a3'
      }
    ]
  },
  triumph: {
    name: '凯旋',
    category: 'enchantment',
    color: '#f7cf62',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'unitDeath',
        op: 'triumphOnKill',
        healPerLevel: 3,
        maxHealthPerLevel: 1,
        color: '#f7cf62'
      }
    ]
  },
  assault: {
    name: '强攻',
    category: 'enchantment',
    color: '#e36c43',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'modifyAttack',
        op: 'assaultStackDamage',
        damagePerStack: 1,
        color: '#e36c43'
      }
    ]
  },
  shockwave: {
    name: '震荡',
    category: 'enchantment',
    color: '#f3d35a',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'durabilityDepleted',
        op: 'durabilityShockwave',
        maxDurabilityPercentPerLevel: 0.02,
        radius: 5,
        cooldown: 4,
        color: '#f3d35a'
      }
    ]
  },
  solarFlare: {
    name: '烈阳',
    category: 'enchantment',
    color: '#ffba3d',
    duration: 999,
    level: 1,
    tickInterval: 5,
    effects: [
      {
        event: 'tick',
        op: 'solarFlarePulse',
        radius: 5,
        maxHealthPercentBase: 0.07,
        maxHealthPercentPerLevel: 0.003,
        color: '#ffba3d'
      }
    ]
  },
  fireworks: {
    name: '烟花',
    category: 'enchantment',
    color: '#ff78c8',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'afterDamage',
        op: 'fireworksOnAttack',
        radius: 5,
        damagePerLevel: 1,
        healPerLevel: 1,
        cooldown: 6,
        color: '#ff78c8'
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
    name: '出血',
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
    name: '寒霜',
    category: 'enchantment',
    color: '#9bdcff',
    duration: 999,
    level: 1,
    summary: '命中后使目标寒冷 2.8 秒：移速 -22%、攻速 -10%',
    effects: [
      {
        event: 'afterDamage',
        op: 'applyBuff',
        buffId: 'chilled',
        duration: 2.8
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
        factor: 1,
        factorPerLevel: 0.05
      },
      {
        stat: 'armor',
        type: 'add',
        amount: 0,
        amountPerLevel: 0.5
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
        factor: 1,
        factorPerLevel: 0.05
      },
      {
        stat: 'attackRate',
        type: 'multiply',
        factor: 1,
        factorPerLevel: 0.05
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
        type: 'multiply',
        factor: 1,
        factorPerLevel: 0.05
      },
      {
        stat: 'attackPower',
        type: 'multiply',
        factor: 1,
        factorPerLevel: 0.05
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
        stat: 'attackPower',
        type: 'multiply',
        factor: 1,
        factorPerLevel: 0.05
      },
      {
        stat: 'knockback',
        type: 'multiply',
        factor: 1,
        factorPerLevel: 0.05
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
  overhealShield: {
    name: '过量治疗',
    category: 'enchantment',
    color: '#9fffe8',
    duration: 999,
    level: 1,
    modifiers: [
      {
        stat: 'maxShield',
        type: 'add',
        amountPerLevel: 2
      }
    ],
    effects: [
      {
        event: 'overheal',
        op: 'convertOverhealToShield',
        ratio: 1,
        vfx: 'shield',
        color: '#9fffe8'
      }
    ]
  },
  shieldWard: {
    name: '护盾韧性',
    category: 'enchantment',
    color: '#a8d8ff',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'beforeShieldDamage',
        op: 'reduceShieldDamageFlat',
        amountPerLevel: 0.75
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
        stat: 'attackPower',
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
        stat: 'attackPower',
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
  heavyStrike: {
    name: '重击',
    category: 'enchantment',
    color: '#c49a6c',
    duration: 999,
    level: 1,
    effects: [
      {
        event: 'modifyAttack',
        op: 'addArmorRatioDamage',
        basePercent: 0.5,
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
  plague: {
    name: '瘟疫',
    category: 'status',
    color: '#6a8a48',
    duration: 3,
    level: 1,
    hidden: false,
    negative: true,
    modifiers: [
      {
        stat: 'armor',
        type: 'add',
        amount: -0.5,
        amountPerLevel: -0.5
      },
      {
        stat: 'magicResistance',
        type: 'add',
        amount: -0.5,
        amountPerLevel: -0.5
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
      },
      {
        stat: 'dodgeChance',
        type: 'add',
        amount: 0.05,
        amountPerLevel: 0.05,
        unitTypes: ['rogue']
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
    name: '水牢禁锢',
    category: 'status',
    color: '#76cfff',
    duration: 2.4,
    hidden: false,
    negative: true,
    modifiers: [
      {
        stat: 'moveSpeed',
        type: 'multiply',
        factor: 0
      }
    ]
  },
  frostSnared: {
    name: '冰缚',
    category: 'status',
    color: '#bcecff',
    duration: 2.5,
    hidden: false,
    negative: true,
    modifiers: [
      {
        stat: 'moveSpeed',
        type: 'multiply',
        factor: 0.58
      }
    ]
  },
  frostStorm: {
    name: '冰风',
    category: 'status',
    color: '#9bdcff',
    duration: 3,
    hidden: false,
    negative: true,
    modifiers: [
      {
        stat: 'moveSpeed',
        type: 'multiply',
        factor: 0.6
      },
      {
        stat: 'attackRate',
        type: 'multiply',
        factor: 0.6
      }
    ]
  },
  frostMirror: {
    name: '冰镜结晶',
    category: 'status',
    color: '#bcecff',
    duration: 6,
    hidden: false,
    negative: false,
    effects: [
      {
        event: 'beforeDamage',
        op: 'absorbFrostMirror'
      }
    ]
  },
  frostMirrorSlow: {
    name: '冰镜寒锋',
    category: 'status',
    color: '#cfeaff',
    duration: 1.5,
    hidden: true,
    negative: true,
    modifiers: [
      {
        stat: 'moveSpeed',
        type: 'multiply',
        factor: 0.7
      }
    ]
  },
  armorShredded: {
    name: '破甲',
    category: 'status',
    color: '#d8c58d',
    duration: 3,
    hidden: false,
    negative: true,
    modifiers: [
      {
        stat: 'armor',
        type: 'add',
        amount: -3
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
        amount: -4
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
        stat: 'attackPower',
        type: 'add',
        amount: -4
      }
    ]
  },
  purifyGuard: {
    name: '净化守护',
    category: 'status',
    color: '#9dffb0',
    duration: 5,
    tickInterval: 1,
    effects: [
      {
        event: 'tick',
        op: 'restoreHealthPercent',
        percent: 0.05,
        color: '#9dffb0'
      }
    ]
  },
  exorcismWard: {
    name: '驱邪守护',
    category: 'status',
    color: '#dcefff',
    duration: 30,
    modifiers: [
      {
        stat: 'magicResistance',
        type: 'add',
        amount: 12
      }
    ]
  },
  wardResonanceGuard: {
    name: '结界共鸣',
    category: 'status',
    color: '#ffcf7a',
    duration: 5,
    modifiers: [
      {
        stat: 'armor',
        type: 'add',
        amount: 7
      },
      {
        stat: 'magicResistance',
        type: 'add',
        amount: 7
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
    name: '出血',
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
  },
  mireSnared: {
    name: '泥沼缠身',
    category: 'status',
    color: '#78985d',
    duration: 2.8,
    hidden: true,
    negative: true,
    modifiers: [
      {
        stat: 'moveSpeed',
        type: 'multiply',
        amount: 0.65
      }
    ]
  }
};

export const ENCHANTMENTS = {
  fire: BUFF_DEFINITIONS.fire,
  thorns: BUFF_DEFINITIONS.thorns,
  judgment: BUFF_DEFINITIONS.judgment,
  bodyForging: BUFF_DEFINITIONS.bodyForging,
  toughness: BUFF_DEFINITIONS.toughness,
  protection: BUFF_DEFINITIONS.protection,
  block: BUFF_DEFINITIONS.block,
  power: BUFF_DEFINITIONS.power,
  explosion: BUFF_DEFINITIONS.explosion,
  critical: BUFF_DEFINITIONS.critical,
  focus: BUFF_DEFINITIONS.focus,
  phoenix: BUFF_DEFINITIONS.phoenix,
  rebirthTotem: BUFF_DEFINITIONS.rebirthTotem,
  selfDestruct: BUFF_DEFINITIONS.selfDestruct,
  spiritWeapon: BUFF_DEFINITIONS.spiritWeapon,
  swordSaint: BUFF_DEFINITIONS.swordSaint,
  soulEater: BUFF_DEFINITIONS.soulEater,
  lifesteal: BUFF_DEFINITIONS.lifesteal,
  undying: BUFF_DEFINITIONS.undying,
  triumph: BUFF_DEFINITIONS.triumph,
  assault: BUFF_DEFINITIONS.assault,
  shockwave: BUFF_DEFINITIONS.shockwave,
  solarFlare: BUFF_DEFINITIONS.solarFlare,
  fireworks: BUFF_DEFINITIONS.fireworks,
  drain: BUFF_DEFINITIONS.drain,
  poison: BUFF_DEFINITIONS.poison,
  bleed: BUFF_DEFINITIONS.bleed,
  recovery: BUFF_DEFINITIONS.recovery,
  immortality: BUFF_DEFINITIONS.immortality,
  spiritShield: BUFF_DEFINITIONS.spiritShield,
  overhealShield: BUFF_DEFINITIONS.overhealShield,
  shieldWard: BUFF_DEFINITIONS.shieldWard,
  wolfInstinct: BUFF_DEFINITIONS.wolfInstinct,
  ursineSpirit: BUFF_DEFINITIONS.ursineSpirit,
  heavyStrike: BUFF_DEFINITIONS.heavyStrike,
  waveArmored: BUFF_DEFINITIONS.waveArmored,
  waveRush: BUFF_DEFINITIONS.waveRush,
  waveRanged: BUFF_DEFINITIONS.waveRanged,
  waveSiege: BUFF_DEFINITIONS.waveSiege
};

export const PLAYER_ABILITY_DEFINITIONS = {
  inspiration: {
    id: 'inspiration',
    name: '灵感',
    label: '灵',
    color: '#8fd6e8',
    summary: '每层令下一张非灵感牌以 +1 级效果打出'
  },
  baseRecoveryPact: {
    id: 'baseRecoveryPact',
    name: '血契要塞',
    label: '契',
    color: '#c96857',
    summary: '基地最大生命 -40%，每 3 秒恢复 1 点生命与 1 点耐久'
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
  enchantResonance: {
    id: 'enchantResonance',
    name: '附魔共鸣',
    label: '响',
    color: '#b68cff',
    // 附魔卡改为一次性生成符文石后，同名石头同一单位只能带一块，
    // 无法再用「重复施加同名附魔」叠加等级。共鸣改为把额外次数折算成魔力，
    // 直接喂给该单位携带的符文石——等级成长统一由魔力系统负责。
    manaPerExtraEcho: 6,
    summary: '使用附魔牌时，每层提供 12% 额外共鸣；额外共鸣折算成魔力，均分给该单位携带的符文石'
  },
  martyrdomLine: {
    id: 'martyrdomLine',
    name: '殉爆阵线',
    label: '爆',
    color: '#ffb45c',
    summary: '友方单位死亡时爆炸，每层 +15 伤害并略增范围'
  },
  highExplosive: {
    id: 'highExplosive',
    name: '高爆',
    label: '爆',
    color: '#ff8d55',
    summary: '所有友方单位的爆炸伤害 +50%/层'
  },
  fortificationDoctrine: {
    id: 'fortificationDoctrine',
    name: '阵地工法',
    label: '固',
    color: '#d8c58d',
    summary: '之后新建建筑生命与耐久各 +25%/层'
  },
  randomHealOnCard: {
    id: 'randomHealOnCard',
    name: '生机回流',
    label: '愈',
    color: '#6edc8b',
    summary: '打出牌时随机治疗友军'
  },
  revivalMatrix: {
    id: 'revivalMatrix',
    name: '复苏矩阵',
    label: '阵',
    color: '#7dffb8',
    summary: '每次打出牌时，治疗血量最低的友军（每层 +12% 最大生命）'
  },
  victoryGold: {
    id: 'victoryGold',
    name: '凯旋税印',
    label: '金',
    color: '#ffd166',
    summary: '胜利后获得更多金币'
  },
  fireSpread: {
    id: 'fireSpread',
    name: '烈焰蔓延',
    label: '焰',
    color: '#ff823d',
    summary: '燃烧 tick 时向周围敌人传播并刷新燃烧'
  },
  legionExpansion: {
    id: 'legionExpansion',
    name: '军团扩编',
    label: '编',
    color: '#8fdc9b',
    summary: '打出单位卡时，每层有 50% 概率多召 1 名增援；概率溢出可继续判定'
  },
  killHarvest: {
    id: 'killHarvest',
    name: '猎魂潮汐',
    label: '潮',
    color: '#7f8fc7',
    summary: '击杀敌人时额外获得能量（每层 +0.2）'
  },
  venomSpread: {
    id: 'venomSpread',
    name: '剧毒蔓延',
    label: '毒',
    color: '#78b85a',
    summary: '友方施加的持续伤害增加 100%'
  },
  lootPouch: {
    id: 'lootPouch',
    name: '探囊',
    label: '囊',
    color: '#e8c56d',
    summary: '击杀单位时，每层额外获得 0.35 银币'
  },
  tacticalMaster: {
    id: 'tacticalMaster',
    name: '地形大师',
    label: '形',
    color: '#6f9fd8',
    summary: '陨石、毒雾、白雾等法术范围增加 50%（每层）'
  },
  rangedVolley: {
    id: 'rangedVolley',
    name: '齐射号令',
    label: '射',
    color: '#5f9a6f',
    summary: '攻击距离大于 5 的友方单位击中时，击退距离 +1/层'
  },
  frontlineBulwark: {
    id: 'frontlineBulwark',
    name: '铁壁前线',
    label: '壁',
    color: '#8a8f78',
    summary: '护甲高于 7 的友方单位每秒恢复 1 点生命/层'
  },
  summonEndurance: {
    id: 'summonEndurance',
    name: '整编耐久',
    label: '持',
    color: '#8fdc9b',
    summary: '新召唤的友军生命 +20%/层'
  },
  knockbackStarfall: {
    id: 'knockbackStarfall',
    name: '飞星余震',
    label: '星',
    color: '#ffe08a',
    summary: '敌人被友方击退结束后，按击退距离召唤飞星造成小范围伤害（每层强化）'
  },
  shieldAugment: {
    id: 'shieldAugment',
    name: '盾阵充能',
    label: '盾',
    color: '#8fb6ff',
    summary: '友方单位获得护盾时，额外获得 2 点护盾/层'
  },
  jadeShatter: {
    id: 'jadeShatter',
    name: '玉碎',
    label: '玉',
    color: '#65e0c1',
    summary: '友方单位护盾破碎时，对周围敌人造成其最大护盾 35%/层的魔法伤害（每单位 6 秒冷却）'
  },
  lookout: {
    id: 'lookout',
    name: '瞭望',
    label: '望',
    color: '#9ec7e8',
    summary: '基地攻击距离每层 +50%（按初始距离加算）'
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
  'frostTrollBoss',
  'frostWolfBoss',
  'frostOracleBoss',
  'goblinTroll',
  'ogre',
  'scorpion',
  'wizard'
];

export const CARD_DEFINITIONS = [
  {
    id: 'barbarians',
    name: '蛮兵',
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
    name: '剑士',
    kind: 'summon',
    label: '剑',
    artKey: 'swordsman',
    summary: '召唤 1 名无盾剑士；30% 概率格挡攻击，使本次攻击伤害减半',
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
    name: '骑士',
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
    name: '狂战士',
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
    name: '弓兵',
    kind: 'summon',
    label: '弓',
    artKey: 'archer',
    summary: '远程单位，持续输出稳定',
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
    id: 'spearmen',
    name: '长矛兵',
    kind: 'summon',
    label: '矛',
    artKey: 'spearman',
    summary: '中距离戳刺近战，血量护甲偏低但攻速快',
    target: 'ground',
    radius: 1.15,
    cooldown: 5.5,
    energyCost: 3,
    unitType: 'spearman',
    count: 1,
    effect: {
      type: 'spawn-units',
      unitType: 'spearman',
      count: 1
    },
    color: '#6a7d4f'
  },
  {
    id: 'tower-shields',
    name: '塔盾兵',
    kind: 'summon',
    label: '盾',
    artKey: 'towerShield',
    summary: '高护甲前排，移动缓慢，用盾牌推击敌人',
    target: 'ground',
    radius: 1.15,
    cooldown: 8,
    energyCost: 3,
    unitType: 'towerShield',
    count: 1,
    effect: {
      type: 'spawn-units',
      unitType: 'towerShield',
      count: 1
    },
    color: '#5a6a78'
  },
  {
    id: 'crossbowmen',
    name: '弩手',
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
    name: '水法师',
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
    id: 'lightning-mages',
    name: '雷法师',
    kind: 'summon',
    label: '电',
    artKey: 'lightningMage',
    summary: '每 5 秒释放可无限连锁的闪电链；每次只会命中同一敌人一次',
    target: 'ground',
    radius: 1.15,
    cooldown: 9,
    energyCost: 4,
    unitType: 'lightningMage',
    count: 1,
    effect: {
      type: 'spawn-units',
      unitType: 'lightningMage',
      count: 1
    },
    color: '#7566c7'
  },
  {
    id: 'wind-mages',
    name: '风法师',
    kind: 'summon',
    label: '风',
    artKey: 'windMage',
    summary: '每 7 秒唤出一道向前缓慢推进的飓风，每 0.4 秒对区域内敌人造成魔法伤害并将其吸引聚拢',
    target: 'ground',
    radius: 1.15,
    cooldown: 9,
    energyCost: 4,
    unitType: 'windMage',
    count: 1,
    effect: {
      type: 'spawn-units',
      unitType: 'windMage',
      count: 1
    },
    color: '#4fbfa8'
  },
  {
    id: 'rogues',
    name: '盗贼',
    kind: 'summon',
    label: '盗',
    artKey: 'rogue',
    summary: '近战匕首单位，每 7 秒投掷飞刀，18% 闪避普通攻击',
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
    name: '矮人工匠',
    kind: 'summon',
    label: '工',
    artKey: 'engineer',
    summary: '每 7 秒为周围 1 个单位恢复 10 + 50% 魔攻武器耐久；靠近基地时可修缮基地（+5% 血量与结构耐久）',
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
    name: '牧师',
    kind: 'summon',
    label: '医',
    artKey: 'physician',
    summary: '低攻击，周期治疗量为 5 + 当前魔法攻击力 ×0.5',
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
    name: '箭塔',
    kind: 'building',
    label: '塔',
    artKey: 'arrowTower',
    summary: '5 秒建成，建成后自动射击周围敌人',
    target: 'ground',
    radius: 1.35,
    cooldown: 16,
    energyCost: 4,
    unitType: 'arrowTower',
    buildSeconds: 5,
    effect: {
      type: 'build-structure',
      unitType: 'arrowTower',
      buildSeconds: 5
    },
    color: '#8f6a3f'
  },
  {
    id: 'repair-station',
    name: '维修站',
    kind: 'building',
    label: '修',
    artKey: 'repairStation',
    summary: '5 秒建成；消耗自身耐久，缓慢修复周围单位与建筑的血量、耐久；基地在范围内也会受益',
    target: 'ground',
    radius: 1.45,
    cooldown: 18,
    energyCost: 4,
    unitType: 'repairStation',
    buildSeconds: 5,
    effect: {
      type: 'build-structure',
      unitType: 'repairStation',
      buildSeconds: 5
    },
    color: '#6b9ab8'
  },
  {
    id: 'canteen',
    name: '食堂',
    kind: 'building',
    label: '食',
    artKey: 'canteen',
    summary: '5 秒建成；消耗自身耐久，缓慢治疗周围受伤单位',
    target: 'ground',
    radius: 1.55,
    cooldown: 18,
    energyCost: 4,
    unitType: 'canteen',
    buildSeconds: 5,
    effect: {
      type: 'build-structure',
      unitType: 'canteen',
      buildSeconds: 5
    },
    color: '#b98758'
  },
  {
    id: 'beacon',
    name: '信标',
    kind: 'building',
    label: '标',
    artKey: 'beacon',
    summary: '5 秒建成；可建在任意可通行地面，建成后允许在附近派遣单位',
    target: 'ground',
    radius: 1.25,
    cooldown: 14,
    energyCost: 4,
    unitType: 'beacon',
    buildSeconds: 5,
    effect: {
      type: 'build-structure',
      unitType: 'beacon',
      buildSeconds: 5
    },
    color: '#dff8ff'
  },
  {
    id: 'purifiers',
    name: '净咒师',
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
    name: '结界师',
    kind: 'summon',
    label: '界',
    artKey: 'warder',
    summary: '低攻击，周期护盾量为 4.5 + 当前魔法攻击力 ×0.5',
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
    name: '陨石',
    kind: 'spell',
    label: '陨',
    artKey: 'meteor',
    summary: '0 费地形牌。使用后留在手牌，22 秒冷却；主动下滑才会进入弃牌堆。',
    target: 'ground',
    radius: 3.25,
    terrainCard: true,
    cooldown: 22,
    energyCost: 0,
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
    name: '毒雾',
    kind: 'spell',
    label: '毒',
    artKey: 'poisonFog',
    summary: '0 费地形牌。12 秒强化毒雾，仅对敌方单位施加更高最大生命值中毒；使用后 22 秒冷却并留在手牌。',
    target: 'ground',
    radius: 4.15,
    terrainCard: true,
    cooldown: 22,
    energyCost: 0,
    effect: {
      type: 'create-area-effect',
      areaEffect: {
        kind: 'poisonFog',
        target: 'enemy',
        duration: 12,
        radius: 4.15,
        applyInterval: 0.32,
        buffId: 'poisoned',
        buffDuration: 2.4,
        maxHealthDamagePercentPerSecondBase: 0.026,
        maxHealthDamagePercentPerSecondPerLevel: 0.014,
        color: '#78b85a',
        accent: '#dff6a5'
      }
    },
    color: '#78b85a'
  },
  {
    id: 'white-smoke',
    name: '白烟',
    kind: 'spell',
    label: '烟',
    artKey: 'whiteSmoke',
    summary: '0 费地形牌。30 秒白烟，友方获得基础 +5%、每级再 +5% 闪避；盗贼获得双倍加成。使用后 22 秒冷却并留在手牌。',
    target: 'ground',
    radius: 3.45,
    terrainCard: true,
    cooldown: 22,
    energyCost: 0,
    effect: {
      type: 'create-area-effect',
      areaEffect: {
        kind: 'whiteSmoke',
        target: 'friendly',
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
    id: 'plague-field',
    name: '瘟疫',
    kind: 'spell',
    label: '疫',
    artKey: 'plagueFog',
    summary: '0 费地形牌。范围内敌人感染瘟疫，3 秒内降低护甲和魔抗；使用后 22 秒冷却并留在手牌。',
    target: 'ground',
    radius: 3.55,
    terrainCard: true,
    cooldown: 22,
    energyCost: 0,
    effect: {
      type: 'create-area-effect',
      areaEffect: {
        kind: 'plagueFog',
        target: 'enemy',
        duration: 12,
        radius: 3.55,
        applyInterval: 1,
        buffId: 'plague',
        buffDuration: 3,
        color: '#6a8a48',
        accent: '#b8d88a'
      }
    },
    color: '#6a8a48'
  },
  {
    id: 'wildfire',
    name: '野火',
    kind: 'spell',
    label: '火',
    artKey: 'fire',
    summary: '0 费地形牌。生成 12 秒火焰地形，持续点燃范围内敌人；使用后 22 秒冷却并留在手牌。',
    target: 'ground',
    radius: 3.45,
    terrainCard: true,
    cooldown: 22,
    energyCost: 0,
    effect: {
      type: 'create-area-effect',
      areaEffect: {
        kind: 'wildfire',
        target: 'enemy',
        duration: 12,
        radius: 3.45,
        applyInterval: 0.45,
        buffId: 'burning',
        buffDuration: 1.25,
        damagePerSecondBase: 3.6,
        damagePerSecondPerLevel: 1.2,
        color: '#c84622',
        accent: '#ffc75a'
      }
    },
    color: '#d9572b'
  },
  {
    id: 'lava-eruption',
    name: '熔岩喷发',
    kind: 'spell',
    label: '熔',
    artKey: 'meteor',
    summary: '0 费地形牌。立即对范围内敌人造成“本局已打出牌数 × 1”的魔法伤害（包含本牌）；使用后 22 秒冷却并留在手牌。',
    target: 'ground',
    radius: 3.5,
    terrainCard: true,
    cooldown: 22,
    energyCost: 0,
    effect: {
      type: 'cast-spell',
      spellId: 'lava-eruption'
    },
    color: '#e0522d'
  },
  {
    id: 'focus-energy',
    name: '凝聚能量',
    kind: 'tactic',
    label: '能',
    artKey: 'tacticEnergySmall',
    summary: '获得 2 点能量；每级额外 +0.5（本局 2 次）',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 0,
    uses: 2,
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
    summary: '获得 3 点能量；升级后每级额外 +1（本局 1 次）',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 0,
    uses: 1,
    effect: {
      type: 'gain-energy',
      amountBase: 3,
      amountPerLevel: 1
    },
    color: '#7f8fc7'
  },
  {
    id: 'silver-gamble',
    name: '银币博弈',
    kind: 'tactic',
    label: '赌',
    artKey: 'tacticSilverGamble',
    summary: '0 费：50% 概率将当前银币翻倍，50% 概率将银币清空',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 0,
    effect: {
      type: 'gamble-silver'
    },
    color: '#d8b85a'
  },
  {
    id: 'field-upgrade',
    name: '战术调度',
    kind: 'tactic',
    label: '调',
    artKey: 'tacticUpgrade',
    summary: '限用 3 次。从抽牌堆顶调度 2 张牌，优先填入手牌空位；牌堆不足时从波次奖励池补足，手牌满时排到抽牌堆顶',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 3,
    uses: 3,
    effect: {
      type: 'draw-temporary-cards',
      amountBase: 2,
      amountPerLevel: 1,
      temporaryLimit: 6,
      fallbackPool: 'wave-reward-pool'
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
    id: 'lookout-ability',
    name: '瞭望',
    kind: 'ability',
    label: '望',
    artKey: 'abilityArsenal',
    summary: '基地攻击距离翻倍；再次打出时每层再翻倍',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 2,
    effect: {
      type: 'acquire-ability',
      abilityId: 'lookout',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#9ec7e8'
  },
  {
    id: 'enchant-echo-ability',
    name: '附魔共鸣',
    kind: 'ability',
    label: '响',
    artKey: 'abilityEnchantEcho',
    summary: '使用附魔牌时，每层提供 12% 额外生效次数；超过 100% 时先保证整次，再判定余数',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 4,
    effect: {
      type: 'acquire-ability',
      abilityId: 'enchantResonance',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#b68cff'
  },
  {
    id: 'fire-spread-ability',
    name: '烈焰蔓延',
    kind: 'ability',
    label: '焰',
    artKey: 'abilityFireSpread',
    summary: '燃烧 tick 时向周围小范围敌人传播并互相刷新燃烧',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 5,
    effect: {
      type: 'acquire-ability',
      abilityId: 'fireSpread',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#ff823d'
  },
  {
    id: 'death-explosion-ability',
    name: '殉爆阵线',
    kind: 'ability',
    label: '爆',
    artKey: 'abilityDeathExplosion',
    summary: '友方单位死亡时爆炸（每层 +15 伤害，略增范围）',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 4,
    effect: {
      type: 'acquire-ability',
      abilityId: 'martyrdomLine',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#ffb45c'
  },
  {
    id: 'high-explosive-ability',
    name: '高爆',
    kind: 'ability',
    label: '爆',
    artKey: 'abilityDeathExplosion',
    summary: '所有友方单位的爆炸伤害 +50%/层',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 4,
    effect: {
      type: 'acquire-ability',
      abilityId: 'highExplosive',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#ff8d55'
  },
  {
    id: 'building-durability-ability',
    name: '阵地工法',
    kind: 'ability',
    label: '固',
    artKey: 'abilityBuildingDurability',
    summary: '之后新建建筑生命与耐久各 +25%/层',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 3,
    effect: {
      type: 'acquire-ability',
      abilityId: 'fortificationDoctrine',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#d8c58d'
  },
  {
    id: 'base-recovery-pact-ability',
    name: '血契要塞',
    kind: 'ability',
    label: '契',
    artKey: 'abilityBuildingDurability',
    summary: '基地最大生命 -40%，每 3 秒恢复 1 点生命与 1 点耐久',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 3,
    effect: {
      type: 'acquire-ability',
      abilityId: 'baseRecoveryPact',
      stacksBase: 1,
      stacksPerLevel: 0
    },
    color: '#c96857'
  },
  {
    id: 'random-heal-ability',
    name: '生机回流',
    kind: 'ability',
    label: '愈',
    artKey: 'abilityRandomHeal',
    summary: '打出牌时随机治疗友军（每层治疗 1 名，16% 最大生命）',
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
    id: 'legion-expansion-ability',
    name: '军团扩编',
    kind: 'ability',
    label: '编',
    artKey: 'abilityArsenal',
    summary: '打出单位卡时，每层 50% 概率多召 1 名增援',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 4,
    effect: {
      type: 'acquire-ability',
      abilityId: 'legionExpansion',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#8fdc9b'
  },
  {
    id: 'kill-harvest-ability',
    name: '猎魂潮汐',
    kind: 'ability',
    label: '潮',
    artKey: 'abilityBloodRage',
    summary: '击杀敌人时额外获得能量（每层 +0.2）',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 4,
    effect: {
      type: 'acquire-ability',
      abilityId: 'killHarvest',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#7f8fc7'
  },
  {
    id: 'revival-matrix-ability',
    name: '复苏矩阵',
    kind: 'ability',
    label: '阵',
    artKey: 'abilityRandomHeal',
    summary: '打出牌时治疗血量最低友军（每层 +12% 最大生命）',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 4,
    effect: {
      type: 'acquire-ability',
      abilityId: 'revivalMatrix',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#7dffb8'
  },
  {
    id: 'venom-spread-ability',
    name: '剧毒蔓延',
    kind: 'ability',
    label: '毒',
    artKey: 'abilityDotAmplify',
    summary: '友方施加的持续伤害增加 100%',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 5,
    effect: {
      type: 'acquire-ability',
      abilityId: 'venomSpread',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#78b85a'
  },
  {
    id: 'loot-pouch-ability',
    name: '探囊',
    kind: 'ability',
    label: '囊',
    artKey: 'abilityVictoryGold',
    summary: '击杀单位时，每层额外获得 0.35 银币',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 3,
    effect: {
      type: 'acquire-ability',
      abilityId: 'lootPouch',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#e8c56d'
  },
  {
    id: 'tactical-master-ability',
    name: '地形大师',
    kind: 'ability',
    label: '形',
    artKey: 'plagueFog',
    summary: '陨石、毒雾、白雾等法术范围 +50%/层',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 4,
    effect: {
      type: 'acquire-ability',
      abilityId: 'tacticalMaster',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#6f9fd8'
  },
  {
    id: 'ranged-volley-ability',
    name: '齐射号令',
    kind: 'ability',
    label: '射',
    artKey: 'abilityWarDrum',
    summary: '攻击距离 >5 的友方单位击中时，击退距离 +1/层',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 4,
    effect: {
      type: 'acquire-ability',
      abilityId: 'rangedVolley',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#5f9a6f'
  },
  {
    id: 'frontline-bulwark-ability',
    name: '铁壁前线',
    kind: 'ability',
    label: '壁',
    artKey: 'abilityBuildingDurability',
    summary: '护甲 >7 的友方单位每秒恢复 1 点生命/层',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 4,
    effect: {
      type: 'acquire-ability',
      abilityId: 'frontlineBulwark',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#8a8f78'
  },
  {
    id: 'summon-endurance-ability',
    name: '整编耐久',
    kind: 'ability',
    label: '持',
    artKey: 'abilityArsenal',
    summary: '新召唤的友军生命 +20%/层',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 3,
    effect: {
      type: 'acquire-ability',
      abilityId: 'summonEndurance',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#8fdc9b'
  },
  {
    id: 'knockback-starfall-ability',
    name: '飞星余震',
    kind: 'ability',
    label: '星',
    artKey: 'abilityDeathExplosion',
    summary: '敌人被友方击退结束后，按击退距离召唤飞星（每层强化）',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 5,
    effect: {
      type: 'acquire-ability',
      abilityId: 'knockbackStarfall',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#ffe08a'
  },
  {
    id: 'shield-augment-ability',
    name: '盾阵充能',
    kind: 'ability',
    label: '盾',
    artKey: 'abilityEnchantEcho',
    summary: '友方单位获得护盾时，额外获得 2 点护盾/层',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 4,
    effect: {
      type: 'acquire-ability',
      abilityId: 'shieldAugment',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#8fb6ff'
  },
  {
    id: 'jade-shatter-ability',
    name: '玉碎',
    kind: 'ability',
    label: '玉',
    artKey: 'abilityEnchantEcho',
    summary: '友方单位护盾破碎时，对周围敌人造成最大护盾 35%/层的魔法伤害；每单位 6 秒冷却。',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 4,
    effect: {
      type: 'acquire-ability',
      abilityId: 'jadeShatter',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#65e0c1'
  },
  {
    id: 'inspiration',
    name: '灵感',
    kind: 'tactic',
    label: '灵',
    artKey: 'inspiration',
    summary: '获得等同本牌等级的灵感层数；之后每层令下一张非灵感牌以 +1 级效果打出。',
    target: 'none',
    radius: 1,
    cooldown: 0,
    energyCost: 2,
    effect: {
      type: 'acquire-ability',
      abilityId: 'inspiration',
      stacksBase: 1,
      stacksPerLevel: 1
    },
    color: '#8fd6e8'
  },
  {
    id: 'rune-expansion',
    name: '符文扩容',
    kind: 'tactic',
    label: '槽',
    artKey: 'abilityEnchantEcho',
    summary: '使一个友方单位的附魔槽上限永久 +1（每级额外 +1）。',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 5,
    effect: {
      type: 'increase-enchantment-slots',
      amountBase: 1,
      amountPerLevel: 1
    },
    color: '#63e0c4'
  },
  {
    id: 'fire-enchant',
    name: '燃烧',
    kind: 'enchant',
    label: '燃',
    artKey: 'fire',
    summary: '普通攻击点燃目标',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'fire',
    effect: {
      type: 'apply-buff',
      buffId: 'fire'
    },
    color: '#c8642f'
  },
  {
    id: 'thorns-enchant',
    name: '荆棘',
    kind: 'enchant',
    label: '荆',
    artKey: 'thorns',
    summary: '受击时反弹伤害',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'thorns',
    effect: {
      type: 'apply-buff',
      buffId: 'thorns'
    },
    color: '#4f8f43'
  },
  {
    id: 'judgment-enchant',
    name: '审判',
    kind: 'enchant',
    label: '审',
    artKey: 'judgment',
    summary: '友方单位受到攻击时，对该攻击者降下巨剑，造成等级×2魔法伤害并触发自身攻击特效；每个持有者独立5秒冷却。',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'judgment',
    effect: {
      type: 'apply-buff',
      buffId: 'judgment'
    },
    color: '#f2cf75'
  },
  {
    id: 'body-forging-enchant',
    name: '锻体',
    kind: 'enchant',
    label: '锻',
    artKey: 'bodyForging',
    summary: '每5秒以（20+等级×10）%概率永久增加1点最大生命并恢复1点生命；概率溢出可循环判定。',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'bodyForging',
    effect: {
      type: 'apply-buff',
      buffId: 'bodyForging'
    },
    color: '#d9875f'
  },
  {
    id: 'toughness-enchant',
    name: '坚韧',
    kind: 'enchant',
    label: '韧',
    artKey: 'toughness',
    summary: '每级固定减免 0.5 伤害',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'toughness',
    effect: {
      type: 'apply-buff',
      buffId: 'toughness'
    },
    color: '#9f9253'
  },
  {
    id: 'protection-enchant',
    name: '保护',
    kind: 'enchant',
    label: '护',
    artKey: 'protection',
    summary: '按等级获得百分比减伤',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'protection',
    effect: {
      type: 'apply-buff',
      buffId: 'protection'
    },
    color: '#557fc9'
  },
  {
    id: 'block-enchant',
    name: '格挡',
    kind: 'enchant',
    label: '挡',
    artKey: 'block',
    summary: '受伤时消耗武器耐久吸收伤害（约 2.2 伤/点耐久），等级提高效率',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'block',
    effect: {
      type: 'apply-buff',
      buffId: 'block'
    },
    color: '#d8dde0'
  },
  {
    id: 'power-enchant',
    name: '力量',
    kind: 'enchant',
    label: '力',
    artKey: 'power',
    summary: '每级物理攻击力与魔法攻击力各 +1.5',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'power',
    effect: {
      type: 'apply-buff',
      buffId: 'power'
    },
    color: '#b97d2c'
  },
  {
    id: 'explosion-enchant',
    name: '爆炸',
    kind: 'enchant',
    label: '爆',
    artKey: 'explosion',
    summary: '命中后在目标处爆炸，对周围敌人造成等级 x2 物理伤害',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'explosion',
    effect: {
      type: 'apply-buff',
      buffId: 'explosion'
    },
    color: '#ffb45c'
  },
  {
    id: 'critical-enchant',
    name: '暴击',
    kind: 'enchant',
    label: '暴',
    artKey: 'critical',
    summary: '每级 +5% 暴击率，暴击造成三倍伤害；超过 100% 后转为提高暴击倍率',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'critical',
    effect: {
      type: 'apply-buff',
      buffId: 'critical'
    },
    color: '#ffd166'
  },
  {
    id: 'focus-enchant',
    name: '凝神',
    kind: 'enchant',
    label: '凝',
    artKey: 'focus',
    summary: '待机每 5 秒增加等级 x0.1 攻击距离，下一次攻击转为额外伤害并清零',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'focus',
    effect: {
      type: 'apply-buff',
      buffId: 'focus'
    },
    color: '#b7e8ff'
  },
  {
    id: 'phoenix-enchant',
    name: '不死鸟',
    kind: 'enchant',
    label: '凰',
    artKey: 'phoenix',
    summary: '受伤时按缺血比例概率恢复等级点生命',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'phoenix',
    effect: {
      type: 'apply-buff',
      buffId: 'phoenix'
    },
    color: '#ff9a47'
  },
  {
    id: 'rebirth-totem-enchant',
    name: '复生图腾',
    kind: 'enchant',
    label: '生',
    artKey: 'rebirthTotem',
    summary: '死亡后进入复活倒计时，60 秒后从基地复活；每级升级缩短 5 秒',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 3,
    enchantmentId: 'rebirthTotem',
    retired: true,
    effect: {
      type: 'apply-buff',
      buffId: 'rebirthTotem'
    },
    color: '#f1d97a'
  },
  {
    id: 'self-destruct-enchant',
    name: '自爆',
    kind: 'enchant',
    label: '爆',
    artKey: 'explosion',
    summary: '死亡时爆炸：对 6 范围内敌人造成等级 ×3 的物理伤害，并各进行一次普通攻击及其攻击特效；每级复活时间 -5%，最多 -90%',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 3,
    enchantmentId: 'selfDestruct',
    effect: {
      type: 'apply-buff',
      buffId: 'selfDestruct'
    },
    color: '#ff784f'
  },
  {
    id: 'spirit-weapon-enchant',
    name: '灵武',
    kind: 'enchant',
    label: '灵',
    artKey: 'spiritWeapon',
    summary: '每 5 秒恢复等级×2 武器耐久；武器耐久上限 +等级×2',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'spiritWeapon',
    effect: {
      type: 'apply-buff',
      buffId: 'spiritWeapon'
    },
    color: '#dff8ff'
  },
  {
    id: 'sword-saint-enchant',
    name: '剑圣',
    kind: 'enchant',
    label: '剑',
    artKey: 'critical',
    summary: '耐久高于 30% 时：本次攻击消耗当前耐久的 70%，伤害增加等量耐久；攻击后恢复等级×2%耐久上限',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'swordSaint',
    effect: {
      type: 'apply-buff',
      buffId: 'swordSaint'
    },
    color: '#ffd166'
  },
  {
    id: 'soul-eater-enchant',
    name: '噬魂',
    kind: 'enchant',
    label: '魂',
    artKey: 'soulEater',
    summary: '附近单位死亡时增加最大生命，3 秒冷却',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'soulEater',
    effect: {
      type: 'apply-buff',
      buffId: 'soulEater'
    },
    color: '#9f6bff'
  },
  {
    id: 'lifesteal-enchant',
    name: '吸血',
    kind: 'enchant',
    label: '吸',
    artKey: 'lifesteal',
    summary: '按普通攻击伤害比例恢复生命',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'lifesteal',
    effect: {
      type: 'apply-buff',
      buffId: 'lifesteal'
    },
    color: '#b54848'
  },
  {
    id: 'undying-enchant',
    name: '不灭',
    kind: 'enchant',
    label: '灭',
    artKey: 'lifesteal',
    summary: '攻击时附加最大生命值×（6%+等级×0.2%）伤害并恢复等量生命，6 秒冷却',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'undying',
    effect: {
      type: 'apply-buff',
      buffId: 'undying'
    },
    color: '#ffd36a'
  },
  {
    id: 'triumph-enchant',
    name: '凯旋',
    kind: 'enchant',
    label: '凯',
    artKey: 'soulEater',
    summary: '亲自击杀单位时恢复等级×3生命，并永久增加等级×1最大生命',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'triumph',
    effect: {
      type: 'apply-buff',
      buffId: 'triumph'
    },
    color: '#f7cf62'
  },
  {
    id: 'assault-enchant',
    name: '强攻',
    kind: 'enchant',
    label: '强',
    artKey: 'heavyStrike',
    summary: '每次攻击强攻层数+1并附加层数点伤害；层数超过附魔等级时归零',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'assault',
    effect: {
      type: 'apply-buff',
      buffId: 'assault'
    },
    color: '#e36c43'
  },
  {
    id: 'shockwave-enchant',
    name: '震荡',
    kind: 'enchant',
    label: '震',
    artKey: 'explosion',
    summary: '耐久耗尽时释放 5 米黄色震荡波，造成最大耐久×2%×等级的伤害，4 秒冷却',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'shockwave',
    effect: {
      type: 'apply-buff',
      buffId: 'shockwave'
    },
    color: '#f3d35a'
  },
  {
    id: 'solar-flare-enchant',
    name: '烈阳',
    kind: 'enchant',
    label: '阳',
    artKey: 'fire',
    summary: '每 5 秒对 5 米内敌人造成最大生命值×（7%+等级×0.3%）伤害',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'solarFlare',
    effect: {
      type: 'apply-buff',
      buffId: 'solarFlare'
    },
    color: '#ffba3d'
  },
  {
    id: 'fireworks-enchant',
    name: '烟花',
    kind: 'enchant',
    label: '花',
    artKey: 'explosion',
    summary: '命中后在目标头顶绽放半径 5 的烟花（6 秒冷却）：5 米内敌人受到等级点伤害并附加攻击特效，烟花附魔者与友军恢复等级点生命',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'fireworks',
    effect: {
      type: 'apply-buff',
      buffId: 'fireworks'
    },
    color: '#ff78c8'
  },
  {
    id: 'drain-enchant',
    name: '汲取',
    kind: 'enchant',
    label: '汲',
    artKey: 'drain',
    summary: '命中后汲取目标，3 秒内造成伤害并治疗自己',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'drain',
    effect: {
      type: 'apply-buff',
      buffId: 'drain'
    },
    color: '#7fd8b0'
  },
  {
    id: 'poison-enchant',
    name: '毒',
    kind: 'enchant',
    label: '毒',
    artKey: 'poison',
    summary: '命中后造成最大生命值百分比毒伤',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'poison',
    effect: {
      type: 'apply-buff',
      buffId: 'poison'
    },
    color: '#5f9f4f'
  },
  {
    id: 'bleed-enchant',
    name: '出血',
    kind: 'enchant',
    label: '出',
    artKey: 'bleed',
    summary: '命中后造成低额持续伤害',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'bleed',
    effect: {
      type: 'apply-buff',
      buffId: 'bleed'
    },
    color: '#9f3f3f'
  },
  {
    id: 'recovery-enchant',
    name: '恢复',
    kind: 'enchant',
    label: '愈',
    artKey: 'recovery',
    summary: '每秒恢复生命',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'recovery',
    effect: {
      type: 'apply-buff',
      buffId: 'recovery'
    },
    color: '#4b9f65'
  },
  {
    id: 'spirit-shield-enchant',
    name: '灵盾',
    kind: 'enchant',
    label: '盾',
    artKey: 'spiritShield',
    summary: '每秒获得护盾',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'spiritShield',
    effect: {
      type: 'apply-buff',
      buffId: 'spiritShield'
    },
    color: '#8fb7dc'
  },
  {
    id: 'overheal-shield-enchant',
    name: '过量治疗',
    kind: 'enchant',
    label: '溢',
    artKey: 'recovery',
    summary: '每级护盾上限 +2；溢出的治疗转化为护盾',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'overhealShield',
    effect: {
      type: 'apply-buff',
      buffId: 'overhealShield'
    },
    color: '#9fffe8'
  },
  {
    id: 'shield-ward-enchant',
    name: '护盾韧性',
    kind: 'enchant',
    label: '韧',
    artKey: 'spiritShield',
    summary: '护盾受到伤害时，每级固定减免 0.75 伤害',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'shieldWard',
    effect: {
      type: 'apply-buff',
      buffId: 'shieldWard'
    },
    color: '#a8d8ff'
  },
  {
    id: 'armored-enchant',
    name: '重甲',
    kind: 'enchant',
    label: '甲',
    artKey: 'waveArmored',
    summary: '每级：生命 +5%、护甲 +0.5',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'waveArmored',
    effect: {
      type: 'apply-buff',
      buffId: 'waveArmored'
    },
    color: '#9fb1c1'
  },
  {
    id: 'rush-enchant',
    name: '冲锋',
    kind: 'enchant',
    label: '冲',
    artKey: 'waveRush',
    summary: '每级：移速 +5%、攻速 +5%',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'waveRush',
    effect: {
      type: 'apply-buff',
      buffId: 'waveRush'
    },
    color: '#ffd166'
  },
  {
    id: 'ranged-enchant',
    name: '远射',
    kind: 'enchant',
    label: '远',
    artKey: 'waveRanged',
    summary: '每级：射程 +5%、攻击 +5%',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'waveRanged',
    effect: {
      type: 'apply-buff',
      buffId: 'waveRanged'
    },
    color: '#b7e8ff'
  },
  {
    id: 'siege-enchant',
    name: '攻城',
    kind: 'enchant',
    label: '城',
    artKey: 'waveSiege',
    summary: '每级：攻击 +5%、击退 +5%',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'waveSiege',
    effect: {
      type: 'apply-buff',
      buffId: 'waveSiege'
    },
    color: '#ffb45c'
  },
  {
    id: 'heavy-strike-enchant',
    name: '重击',
    kind: 'enchant',
    label: '击',
    artKey: 'heavyStrike',
    summary: '攻击时额外造成（50+等级×25）%护甲的伤害',
    target: 'friendly-unit',
    radius: 1.1,
    cooldown: 0,
    energyCost: 2,
    enchantmentId: 'heavyStrike',
    effect: {
      type: 'apply-buff',
      buffId: 'heavyStrike'
    },
    color: '#c49a6c'
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
    cooldown: 0,
    energyCost: 2,
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
    cooldown: 0,
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
  'spearmen',
  'crossbowmen',
  'water-mages',
  'rogues',
  'knights',
  'berserkers',
  'tower-shields',
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
  'fire-enchant',
  'recovery-enchant',
  'spirit-shield-enchant',
  'power-enchant',
  'toughness-enchant',
  'block-enchant',
  'exhaust-energy-ability',
  'periodic-energy-ability',
  'random-heal-ability',
  'legion-expansion-ability',
  'loot-pouch-ability',
  'frontline-bulwark-ability',
  'summon-endurance-ability'
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
  spearmen: {
    initial: true,
    buyCost: 0,
    upgradeBaseCost: 28
  },
  'tower-shields': {
    initial: true,
    buyCost: 0,
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
  'overheal-shield-enchant': {
    buyCost: 150,
    upgradeBaseCost: 42
  },
  'shield-ward-enchant': {
    buyCost: 145,
    upgradeBaseCost: 40
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
  wildfire: {
    buyCost: 145,
    upgradeBaseCost: 42
  },
  'lava-eruption': {
    buyCost: 190,
    upgradeBaseCost: 50
  },
  'focus-energy': {
    buyCost: 95,
    upgradeBaseCost: 70
  },
  'burst-energy': {
    buyCost: 140,
    upgradeBaseCost: 90
  },
  'jade-shatter-ability': {
    buyCost: 195,
    upgradeBaseCost: 125
  },
  'rune-expansion': {
    buyCost: 180,
    upgradeBaseCost: 80
  },
  'silver-gamble': {
    buyCost: 120,
    upgradeBaseCost: 36
  },
  'field-upgrade': {
    buyCost: 180,
    upgradeBaseCost: 110
  },
  'exhaust-energy-ability': {
    initial: true,
    buyCost: 0,
    upgradeBaseCost: 95
  },
  'periodic-energy-ability': {
    initial: true,
    buyCost: 0,
    upgradeBaseCost: 105
  },
  'random-heal-ability': {
    initial: true,
    buyCost: 0,
    upgradeBaseCost: 125
  },
  'legion-expansion-ability': {
    initial: true,
    buyCost: 0,
    upgradeBaseCost: 125
  },
  'loot-pouch-ability': {
    initial: true,
    buyCost: 0,
    upgradeBaseCost: 110
  },
  'frontline-bulwark-ability': {
    initial: true,
    buyCost: 0,
    upgradeBaseCost: 115
  },
  'summon-endurance-ability': {
    initial: true,
    buyCost: 0,
    upgradeBaseCost: 110
  },
  'enchant-echo-ability': {
    buyCost: 190,
    upgradeBaseCost: 125
  },
  'fire-spread-ability': {
    buyCost: 210,
    upgradeBaseCost: 130
  },
  'plague-field': {
    buyCost: 145,
    upgradeBaseCost: 38
  },
  'death-explosion-ability': {
    buyCost: 185,
    upgradeBaseCost: 120
  },
  'high-explosive-ability': {
    buyCost: 190,
    upgradeBaseCost: 125
  },
  'building-durability-ability': {
    buyCost: 170,
    upgradeBaseCost: 110
  },
  'base-recovery-pact-ability': {
    buyCost: 175,
    upgradeBaseCost: 115
  },
  'victory-gold-ability': {
    buyCost: 175,
    upgradeBaseCost: 115
  },
  'kill-harvest-ability': {
    buyCost: 185,
    upgradeBaseCost: 120
  },
  'revival-matrix-ability': {
    buyCost: 190,
    upgradeBaseCost: 125
  },
  'venom-spread-ability': {
    buyCost: 205,
    upgradeBaseCost: 130
  },
  'tactical-master-ability': {
    buyCost: 180,
    upgradeBaseCost: 115
  },
  'ranged-volley-ability': {
    buyCost: 185,
    upgradeBaseCost: 120
  },
  'knockback-starfall-ability': {
    buyCost: 210,
    upgradeBaseCost: 135
  },
  'shield-augment-ability': {
    buyCost: 185,
    upgradeBaseCost: 120
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
    initial: true,
    buyCost: 0,
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
  'rebirth-totem-enchant': {
    buyCost: 160,
    upgradeBaseCost: 46
  },
  'self-destruct-enchant': {
    buyCost: 170,
    upgradeBaseCost: 48
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
  'undying-enchant': {
    buyCost: 155,
    upgradeBaseCost: 44
  },
  'triumph-enchant': {
    buyCost: 150,
    upgradeBaseCost: 42
  },
  'assault-enchant': {
    buyCost: 120,
    upgradeBaseCost: 34
  },
  'shockwave-enchant': {
    buyCost: 125,
    upgradeBaseCost: 36
  },
  'solar-flare-enchant': {
    buyCost: 165,
    upgradeBaseCost: 46
  },
  'fireworks-enchant': {
    buyCost: 150,
    upgradeBaseCost: 42
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
  },
  'heavy-strike-enchant': {
    buyCost: 120,
    upgradeBaseCost: 32
  }
};

export const LEVEL_DEFINITIONS = [
  {
    id: 'snow-valley',
    name: '雪谷营地',
    subtitle: '教学关：在雪谷中熟悉出兵、附魔和基地推进',
    baseReward: 45,
    targetTime: 1080,
    baseDifficulty: 1,
    waveDifficultyGrowth: 1,
    enemyPool: [
      // 教学主力：哥布林三件套 + 蜘蛛，全程存在
      { type: 'goblinSoldier', weight: 5, minWave: 1, minDifficulty: 1 },
      { type: 'spider', weight: 1, minWave: 2, minDifficulty: 1 },
      // 狼：高速突袭，教玩家用近战拦截/保护远程（第 2 波起）
      { type: 'wolf', weight: 2, minWave: 2, minDifficulty: 1 },
      { type: 'goblinArcher', weight: 2, minWave: 3, minDifficulty: 1 },
      // 寒霜学徒：冰法远程，教玩家优先击杀施法者（第 4 波起）
      { type: 'frostAcolyte', weight: 2, minWave: 4, minDifficulty: 1 },
      { type: 'goblinHunter', weight: 1, minWave: 5, minDifficulty: 2 },
      // 盾卫：前排肉盾，教玩家绕开正面/用附魔破甲（第 5 波起）
      { type: 'shieldBearer', weight: 2, minWave: 5, minDifficulty: 1 },
      // 熊：慢速重型冲撞，中期压迫感（第 7 波起）
      { type: 'bear', weight: 1, minWave: 7, minDifficulty: 2 },
      // 哥布林巨魔：后期普通波里的小 Boss 压迫感（第 9 波起）
      { type: 'goblinTroll', weight: 1, minWave: 9, minDifficulty: 3 }
    ],
    elitePool: [
      { type: 'frostScout', weight: 1, minWave: 3, minDifficulty: 1 },
      { type: 'snowDuskShaman', weight: 1, minWave: 4, minDifficulty: 1 }
    ],
    bossPool: [
      { type: 'frostTrollBoss', weight: 1, minWave: 4.8, minDifficulty: 1 },
      { type: 'frostWolfBoss', weight: 1, minWave: 6.2, minDifficulty: 1 },
      { type: 'frostOracleBoss', weight: 1, minWave: 7.4, minDifficulty: 1 }
    ],
    // 单方向关卡：开局单位卡选择次数与开局能量按此数值计算。
    routeCount: 1,
    world: {
      sceneKey: 'snow-valley'
    }
  },
  {
    id: 'dungeon-halls',
    name: '幽暗地牢',
    subtitle: '地牢关：多个石台由狭窄通路连接，争夺平台之间的推进路线',
    baseReward: 60,
    targetTime: 1260,
    baseDifficulty: 2,
    waveDifficultyGrowth: 1.08,
    enemyPool: [
      { type: 'goblinSoldier', weight: 5, minWave: 1, minDifficulty: 1 },
      { type: 'goblinArcher', weight: 3, minWave: 2, minDifficulty: 1 },
      { type: 'spider', weight: 1, minWave: 2, minDifficulty: 1 },
      { type: 'goblinHunter', weight: 2, minWave: 4, minDifficulty: 1 },
      { type: 'goblinShaman', weight: 1, minWave: 5, minDifficulty: 2 },
      { type: 'skeletonSoldier', weight: 2, minWave: 3, minDifficulty: 2 }
    ],
    elitePool: [
      { type: 'tombLanternCrossbowman', weight: 1, minWave: 3.5, minDifficulty: 2 }
    ],
    bossPool: [
      { type: 'boneVoicePriest', weight: 1, minWave: 5.6, minDifficulty: 2 }
    ],
    routeCount: 1,
    world: {
      sceneKey: 'dungeon-halls'
    }
  },
  {
    id: 'red-desert',
    name: '赤岩沙漠',
    subtitle: '沙漠关：阳光会灼烧友军，利用巨岩阴影推进',
    baseReward: 80,
    targetTime: 1440,
    baseDifficulty: 3,
    waveDifficultyGrowth: 1.16,
    enemyPool: [
      { type: 'goblinSoldier', weight: 4, minWave: 1, minDifficulty: 1 },
      { type: 'goblinArcher', weight: 3, minWave: 2, minDifficulty: 1 },
      { type: 'skeletonSoldier', weight: 3, minWave: 2, minDifficulty: 1 },
      { type: 'spider', weight: 1, minWave: 2, minDifficulty: 1 },
      { type: 'goblinHunter', weight: 2, minWave: 3, minDifficulty: 1 },
      { type: 'goblinShaman', weight: 2, minWave: 4, minDifficulty: 1 },
      { type: 'skeletonArcher', weight: 2, minWave: 4, minDifficulty: 2 },
      { type: 'elfSniper', weight: 1, minWave: 7, minDifficulty: 3 }
    ],
    elitePool: [
      { type: 'sandScorpionGuard', weight: 1, minWave: 3.8, minDifficulty: 3 }
    ],
    bossPool: [
      { type: 'yellowSandOgre', weight: 1, minWave: 6.2, minDifficulty: 3 }
    ],
    routeCount: 1,
    world: {
      sceneKey: 'red-desert'
    }
  },
  {
    id: 'emerald-marsh',
    name: '翡翠沼泽',
    subtitle: '沿着沉木堤道穿过雾沼，摧毁腐根深处的敌营',
    baseReward: 100,
    targetTime: 1620,
    baseDifficulty: 4,
    waveDifficultyGrowth: 1.24,
    enemyPool: [
      { type: 'goblinSoldier', weight: 3, minWave: 1, minDifficulty: 1 },
      { type: 'spider', weight: 3, minWave: 2, minDifficulty: 1 },
      { type: 'goblinHunter', weight: 2, minWave: 3, minDifficulty: 2 },
      { type: 'goblinShaman', weight: 2, minWave: 4, minDifficulty: 2 },
      { type: 'venomArcher', weight: 2, minWave: 5, minDifficulty: 3 },
      { type: 'ogre', weight: 1, minWave: 6, minDifficulty: 3 }
    ],
    elitePool: [
      { type: 'mireHunter', weight: 1, minWave: 4.2, minDifficulty: 4 }
    ],
    bossPool: [
      { type: 'rotrootColossus', weight: 1, minWave: 6.8, minDifficulty: 4 }
    ],
    routeCount: 1,
    world: {
      sceneKey: 'emerald-marsh'
    }
  },
  {
    id: 'island-survival',
    name: '孤岛求生',
    subtitle: '海岛生存：环海岛链上采集、建造与防守，最终摧毁全部刷怪点',
    baseReward: 120,
    targetTime: 1800,
    baseDifficulty: 3,
    waveDifficultyGrowth: 1.1,
    // 生存玩法不使用波次敌人池。这里的名单只是刷怪点系统接入前的临时来源，
    // 接入后应由刷怪点配置（生成间隔/存活上限/掉落）接管，不要据此恢复波次。
    enemyPool: [
      { type: 'goblinSoldier', weight: 4, minWave: 1, minDifficulty: 1 },
      { type: 'goblinArcher', weight: 2, minWave: 1, minDifficulty: 1 },
      { type: 'spider', weight: 2, minWave: 1, minDifficulty: 1 },
      { type: 'wolf', weight: 2, minWave: 1, minDifficulty: 1 },
      { type: 'goblinHunter', weight: 2, minWave: 1, minDifficulty: 2 },
      { type: 'ogre', weight: 1, minWave: 1, minDifficulty: 3 }
    ],
    elitePool: [
      { type: 'frostScout', weight: 1, minWave: 1, minDifficulty: 1 }
    ],
    bossPool: [
      { type: 'frostTrollBoss', weight: 1, minWave: 1, minDifficulty: 1 }
    ],
    routeCount: 1,
    world: {
      sceneKey: 'island-survival'
    }
  }
];

// ---------------------------------------------------------------------------
// 资源节点（生存玩法）
//
// 地图上每一棵树 / 石头 / 矿脉都是一个有独立 ID 与剩余量的实例：可以采空，
// 采空后从场景隐藏并解除对寻路的阻挡。关卡如果在预设里给了 `resourceZones`，
// 就用这层资源节点替代原本纯装饰的森林与巨石群——避免出现「有些树能砍、
// 有些树砍不动」的歧义。所有数值都是配置默认值，可直接调。
// ---------------------------------------------------------------------------
export const RESOURCE_TYPES = {
  wood: { id: 'wood', name: '木材', unit: '份', stackLimit: 200 },
  stone: { id: 'stone', name: '石料', unit: '份', stackLimit: 200 },
  iron: { id: 'iron', name: '铁矿', unit: '份', stackLimit: 120 },
  food: { id: 'food', name: '食物', unit: '份', stackLimit: 120 },
  fiber: { id: 'fiber', name: '纤维', unit: '束', stackLimit: 120 }
};

// 采集工具：没有对应工具时节点会返回 needsTool，而不是静默失败。
export const TOOL_DEFINITIONS = {
  axe: { id: 'axe', name: '木斧', resource: 'wood' },
  pickaxe: { id: 'pickaxe', name: '木镐', resource: 'stone' }
};

export const RESOURCE_NODE_DEFINITIONS = {
  oak: {
    id: 'oak', name: '橡树', resource: 'wood', amount: 45, tool: 'axe',
    model: 'tree', scale: [1.55, 2.15], navRadius: 0.95, spacing: 3.2, groundOffset: 0,
    harvestSeconds: 1.6,
    // 副产物：砍树顺带得到树苗，供树坑补种（方案第 9 节「单位取得种子/树苗」）。
    // 做成"每累计砍够 N 木材出 1 棵树苗"而不是随机掉落：
    // 净产出必须是可计算的，随机会让"这条链能不能自持"变成看运气。
    byproduct: { itemId: 'sapling', perAmount: 15, maxPerNode: 3 }
  },
  pine: {
    id: 'pine', name: '松树', resource: 'wood', amount: 34, tool: 'axe',
    model: 'tree', scale: [1.15, 1.7], navRadius: 0.8, spacing: 2.8, groundOffset: 0,
    harvestSeconds: 1.3,
    byproduct: { itemId: 'sapling', perAmount: 15, maxPerNode: 2 }
  },
  stonePile: {
    id: 'stonePile', name: '石堆', resource: 'stone', amount: 40, tool: 'pickaxe',
    model: 'rock', scale: [1.2, 2.0], navRadius: 1.0, spacing: 3.6, groundOffset: -0.06,
    harvestSeconds: 1.5
  },
  ironVein: {
    id: 'ironVein', name: '铁矿脉', resource: 'iron', amount: 26, tool: 'pickaxe',
    model: 'ore', scale: [1.0, 1.6], navRadius: 1.05, spacing: 4.4, groundOffset: -0.08,
    harvestSeconds: 2.2
  },
  berryBush: {
    id: 'berryBush', name: '浆果丛', resource: 'food', amount: 14, tool: null,
    model: 'bush', scale: [0.95, 1.35], navRadius: 0, spacing: 2.4, groundOffset: 0,
    harvestSeconds: 0.9
  },
  fiberPlant: {
    id: 'fiberPlant', name: '纤维草', resource: 'fiber', amount: 12, tool: null,
    model: 'grass', scale: [0.85, 1.25], navRadius: 0, spacing: 2.0, groundOffset: 0,
    harvestSeconds: 0.7
  }
};

export function resourceNodeHarvestSeconds(definitionId) {
  return RESOURCE_NODE_DEFINITIONS[definitionId]?.harvestSeconds ?? 1.2;
}

// 采集规则：一次采集动作取出多少、以及节点采空后是否再生。
export const RESOURCE_NODE_RULES = {
  harvestPerAction: 5,
  // 采空后不再自动复活；种植/树场属于后续生产链，不在这里偷偷回血
  regrowSeconds: 0,
  // 采集者必须站到节点这个距离以内
  harvestRange: 2.6
};

// ---------------------------------------------------------------------------
// 树坑与种植（方案第 9 节：「单位取得种子/树苗，种植、等待生长、砍伐」）
//
// 一个完整回合：树坑消耗 1 棵树苗 → 等待生长 → 在坑边**生成一棵真实的资源节点**
// → 傀儡照常去砍它 → 砍完坑自动补种。
//
// 两条来自方案第 9 节的硬要求，都做成了可断言的性质：
//   1. **保留量**：「建议种植材料有保留量，避免把下一轮种植所需资源全部加工掉」。
//      所以树坑只在树苗数量**超过** `reserveSaplings` 时才补种，
//      永远不会把最后几棵苗也种掉（否则一旦这一轮产出不及预期就彻底断了）。
//   2. **净产出为正**：一棵橡树 45 木材 ÷ 15 = 3 棵树苗，而补种只要 1 棵；
//      松树 34 ÷ 15 = 2 棵。所以木材与树苗都是净增长的。
//      这条由 `test:planting` 直接按数据算，不靠手感。
// ---------------------------------------------------------------------------
export const PLANTING_CONFIGS = {
  treePit: {
    id: 'treePit',
    unitType: 'treePit',
    name: '树坑',
    saplingItemId: 'sapling',
    // 一次补种消耗几棵树苗
    saplingCost: 1,
    // 至少留几棵不种（保留量）
    reserveSaplings: 1,
    growthSeconds: 40,
    // 长成之后在坑边生成哪种资源节点
    nodeDefinitionId: 'oak',
    // 生成位置离坑多远（找可走的空位）
    spawnRadius: 3.4,
    // 同时最多养几棵，防止无限铺开把地图塞满
    maxGrownNodes: 2
  }
};

// ---------------------------------------------------------------------------
// 物品与库存
//
// 物品分两类，这是物品体系最关键的一条规则：
//   kind: 'stack'    —— 可按 itemId 合并的普通资源/耗材，占用一个格子装到 stackLimit
//   kind: 'instance' —— 携带独立数据的物品（附魔石、工具、武器），永不按名字合并，
//                       每件有唯一 instanceId，移动的是这一件本身而不是「一份副本」
// 资源节点的产出直接对应同名的 stack 物品，所以采到的东西不需要转换层。
// ---------------------------------------------------------------------------
export const ITEM_DEFINITIONS = {  wood: { id: 'wood', name: '木材', kind: 'stack', stackLimit: 200, category: 'resource', resource: 'wood' },
  stone: { id: 'stone', name: '石料', kind: 'stack', stackLimit: 200, category: 'resource', resource: 'stone' },
  iron: { id: 'iron', name: '铁矿', kind: 'stack', stackLimit: 120, category: 'resource', resource: 'iron' },
  food: { id: 'food', name: '食物', kind: 'stack', stackLimit: 120, category: 'resource', resource: 'food' },
  fiber: { id: 'fiber', name: '纤维', kind: 'stack', stackLimit: 120, category: 'resource', resource: 'fiber' },
  axe: { id: 'axe', name: '木斧', kind: 'instance', stackLimit: 1, category: 'tool', tool: 'axe' },
  pickaxe: { id: 'pickaxe', name: '木镐', kind: 'instance', stackLimit: 1, category: 'tool', tool: 'pickaxe' },
  // 附魔石也是实例物品：instanceId 就是石头自己的 id，掉落/拾取搬的是同一块。
  // 等级、魔力经验与累计成长都在 data 里跟随，绝不能按 itemId 合并成一块。
  runeStone: { id: 'runeStone', name: '符文石', kind: 'instance', stackLimit: 1, category: 'rune' },
  // 深邃核心：只从刷怪点掉出来，是招募令的材料。做成可堆叠材料而不是实例，
  // 因为它没有需要跟随的个体数据，堆叠能省格子。
  deepCore: { id: 'deepCore', name: '深邃核心', kind: 'stack', stackLimit: 20, category: 'material' },
  // 招募令：野外招募的消耗品，一次招募用掉一张。
  recruitmentOrder: { id: 'recruitmentOrder', name: '招募令', kind: 'stack', stackLimit: 20, category: 'consumable' },
  // 木炭：熔炉把木材加工出来的燃料。方案第 9 节：「建议木材产物命名为木炭」。
  charcoal: { id: 'charcoal', name: '木炭', kind: 'stack', stackLimit: 120, category: 'material' },
  // 树苗：砍树时的副产物，树坑补种要消耗它。
  sapling: { id: 'sapling', name: '树苗', kind: 'stack', stackLimit: 40, category: 'material' },
  // 熔炉（打包状态）：放置后变成一座玩家建筑。`placeable` 是放置流程唯一需要的标记，
  // 缺省表示这件物品不能放到地图上。
  furnace: {
    id: 'furnace',
    name: '熔炉',
    kind: 'stack',
    stackLimit: 5,
    category: 'building',
    placeable: { unitType: 'furnace' }
  },
  // 魔力炉：把木炭烧成魔力，为周围的生产与战斗供能（方案第 9 节）。
  // 它是**供能源**，所以放置时不要求"附近已有供能"——那正是它存在的意义。
  manaFurnace: {
    id: 'manaFurnace',
    name: '魔力炉',
    kind: 'stack',
    stackLimit: 5,
    category: 'building',
    placeable: { unitType: 'manaFurnace' }
  },
  // 科研站：建造之后才能投入资源研究科技（方案第 9 节）。
  researchStation: {
    id: 'researchStation',
    name: '科研站',
    kind: 'stack',
    stackLimit: 5,
    category: 'building',
    placeable: { unitType: 'researchStation' }
  },
  // 附魔台：由「附魔工艺」科技解锁，建好之后可以用材料制作附魔石。
  // 注意它的配方在 RECIPES 里带 `tech` 字段——没研究出科技就不出现在合成列表里。
  enchantTable: {
    id: 'enchantTable',
    name: '附魔台',
    kind: 'stack',
    stackLimit: 5,
    category: 'building',
    placeable: { unitType: 'enchantTable' }
  },
  // 树坑：种下树苗、等它长成一棵可砍的树。木材再生的入口。
  treePit: {
    id: 'treePit',
    name: '树坑',
    kind: 'stack',
    stackLimit: 5,
    category: 'building',
    placeable: { unitType: 'treePit' }
  },
  // 箭塔与食堂：旧玩法里就有的两座建筑，现在可以用材料做出来放在岛上。
  arrowTower: {
    id: 'arrowTower',
    name: '箭塔',
    kind: 'stack',
    stackLimit: 5,
    category: 'building',
    placeable: { unitType: 'arrowTower' }
  },
  canteen: {
    id: 'canteen',
    name: '食堂',
    kind: 'stack',
    stackLimit: 5,
    category: 'building',
    placeable: { unitType: 'canteen' }
  },

  // -------------------------------------------------------------------------
  // 武器（方案第 6.2 节「武器只能换成同类武器」）
  //
  // 武器是**实例**物品：每把有自己的耐久，按 instanceId 逐件管理。
  // `weapon.profile` 是"能不能装到某个单位身上"的判据，依据方案第 6.2 节
  // 「检查攻击动画、投射物、射程、攻击事件和耐力参数兼容，不能只改模型」：
  //   family          —— 家族（剑/棍/弓），跨家族一律不允许
  //   attackRange     —— 必须与单位当前射程一致（近战武器不能给弓手）
  //   projectileType  —— 必须一致（有没有投射物、什么投射物）
  //   attackAnimation —— 必须一致（攻击动作不能对不上）
  // 也就是说这一批是"同族升级件"：动作/射程/投射物完全相同，只有伤害、耐久、
  // 耐力消耗与攻速可以不同。跨族与跨动作的组合会被明确拒绝，并给出原因。
  //
  // `defaultFor` 指向同族的"原配武器"物品：单位一开始手里那把不是物品，
  // 第一次换装时会按这个映射**物化**成物品放回背包，保证换装不凭空吞掉东西。
  // -------------------------------------------------------------------------
  wornSword: {
    id: 'wornSword',
    name: '旧剑',
    kind: 'instance',
    category: 'weapon',
    weapon: {
      family: 'sword',
      profile: { attackRange: 1.28, projectileType: null, attackAnimation: 'Sword_Attack' },
      damage: 7,
      damageType: 'physical',
      maxDurability: 35,
      durabilityCost: 1.15,
      attackRate: 1.12,
      defaultFor: 'swordsman'
    }
  },
  steelSword: {
    id: 'steelSword',
    name: '精钢剑',
    kind: 'instance',
    category: 'weapon',
    weapon: {
      family: 'sword',
      profile: { attackRange: 1.28, projectileType: null, attackAnimation: 'Sword_Attack' },
      damage: 12,
      damageType: 'physical',
      maxDurability: 52,
      durabilityCost: 1.15,
      attackRate: 1.12
    }
  },
  wornClub: {
    id: 'wornClub',
    name: '旧木棒',
    kind: 'instance',
    category: 'weapon',
    weapon: {
      family: 'club',
      profile: { attackRange: 1.25, projectileType: null, attackAnimation: 'Club_Attack' },
      damage: 6,
      damageType: 'physical',
      maxDurability: 32,
      durabilityCost: 0,
      attackRate: 0.82,
      defaultFor: 'raider'
    }
  },
  spikedClub: {
    id: 'spikedClub',
    name: '狼牙棒',
    kind: 'instance',
    category: 'weapon',
    weapon: {
      family: 'club',
      profile: { attackRange: 1.25, projectileType: null, attackAnimation: 'Club_Attack' },
      damage: 11,
      damageType: 'physical',
      maxDurability: 46,
      durabilityCost: 0,
      attackRate: 0.82
    }
  },
  wornBow: {
    id: 'wornBow',
    name: '旧弓',
    kind: 'instance',
    category: 'weapon',
    weapon: {
      family: 'bow',
      profile: { attackRange: 8.4, projectileType: null, attackAnimation: 'Bow_Shot' },
      damage: 5,
      damageType: 'physical',
      maxDurability: 27,
      durabilityCost: 1,
      attackRate: 0.72,
      defaultFor: 'archer'
    }
  },
  longBow: {
    id: 'longBow',
    name: '长弓',
    kind: 'instance',
    category: 'weapon',
    weapon: {
      family: 'bow',
      profile: { attackRange: 8.4, projectileType: null, attackAnimation: 'Bow_Shot' },
      damage: 9,
      damageType: 'physical',
      maxDurability: 40,
      durabilityCost: 1,
      attackRate: 0.72
    }
  }
};

/** 野外招募消耗的物品 id。单独导出一个常量，避免各处写字符串字面量。 */
export const RECRUITMENT_ORDER_ITEM_ID = 'recruitmentOrder';

// ---------------------------------------------------------------------------
// 合成配方
//
// 与库存同源的三条硬要求（都由 crafting.js 保证，并有独立测试守着）：
//   1. 材料不够 → 整笔失败，不扣任何材料；
//   2. 产物放不下 → 整笔失败，同样不扣材料（不能"扣了才发现做出来的东西没地方放"）；
//   3. 材料腾出来的格子要算进产物的空间里——所以不能"先查空位再扣材料"。
//
// 配方数值都放在这里，改平衡不用碰逻辑。
// ---------------------------------------------------------------------------
export const RECIPES = {
  recruitmentOrder: {
    id: 'recruitmentOrder',
    name: '招募令',
    // 配方来源：深邃核心（破坏刷怪点获得）+ 木材
    inputs: [
      { itemId: 'deepCore', count: 1 },
      { itemId: 'wood', count: 20 }
    ],
    output: { itemId: 'recruitmentOrder', count: 1 },
    description: '用巢穴里的深邃核心与木材制成，用来把野外发现的战斗单位招募成自己人。'
  },
  // 工具可制作。此前工具的唯一来源是开局白送，傀儡阵亡把工具掉在危险地方之后就再也补不回来。
  // 产物是实例物品（每件有唯一身份），合成时会发一个新的 instanceId，这是对的：
  // 造出来的本来就是一件新工具，不是"把旧工具换个位置"。
  axe: {
    id: 'axe',
    name: '木斧',
    inputs: [
      { itemId: 'wood', count: 5 },
      { itemId: 'stone', count: 5 }
    ],
    output: { itemId: 'axe', count: 1 },
    description: '砍树用的木斧。做出来会放在基地库存里，需要到合成面板把它搬给傀儡。'
  },
  pickaxe: {
    id: 'pickaxe',
    name: '木镐',
    inputs: [
      { itemId: 'wood', count: 5 },
      { itemId: 'stone', count: 8 }
    ],
    output: { itemId: 'pickaxe', count: 1 },
    description: '挖石料与铁矿用的木镐。做出来会放在基地库存里，需要到合成面板把它搬给傀儡。'
  },
  furnace: {
    id: 'furnace',
    name: '熔炉',
    inputs: [
      { itemId: 'stone', count: 30 },
      { itemId: 'wood', count: 20 }
    ],
    output: { itemId: 'furnace', count: 1 },
    description: '烧炭用的石炉。做出来之后在基地库存面板里点"放置"，再点到地面上放下。'
  },
  // 注意配方里**不能有木炭**：方案第 9 节要求"保证第一批燃料有启动路径"，
  // 魔力炉是木炭的消费者而不是生产者，让它要求木炭就等于死循环。
  // 铁在这里第一次有了用处（此前铁矿只能堆着）。
  manaFurnace: {
    id: 'manaFurnace',
    name: '魔力炉',
    inputs: [
      { itemId: 'stone', count: 40 },
      { itemId: 'iron', count: 8 },
      { itemId: 'wood', count: 20 }
    ],
    output: { itemId: 'manaFurnace', count: 1 },
    description: '烧木炭产出魔力的石塔，为周围的生产与战斗供能。放在离基地较远的地方才有意义。'
  },
  researchStation: {
    id: 'researchStation',
    name: '科研站',
    inputs: [
      { itemId: 'stone', count: 25 },
      { itemId: 'wood', count: 30 }
    ],
    output: { itemId: 'researchStation', count: 1 },
    description: '建好之后才能在基地库存面板里投入资源研究科技。'
  },
  // `tech` 字段：没研究出对应科技时，这条配方根本不出现在合成列表里
  // （`recipeStatus()` 会按已解锁科技过滤），而不是"显示成灰的"。
  enchantTable: {
    id: 'enchantTable',
    name: '附魔台',
    inputs: [
      { itemId: 'stone', count: 30 },
      { itemId: 'iron', count: 10 }
    ],
    output: { itemId: 'enchantTable', count: 1 },
    tech: 'enchanting',
    description: '用材料制作附魔石，不再依赖附魔卡。需要先研究「附魔工艺」。'
  },
  treePit: {
    id: 'treePit',
    name: '树坑',
    inputs: [
      { itemId: 'wood', count: 20 },
      { itemId: 'stone', count: 10 }
    ],
    output: { itemId: 'treePit', count: 1 },
    description: '木材再生的设施：放好之后它会用库存里的树苗补种，长成后直接砍。'
  },
  // 武器：同族升级件。配方不需要科技（铁本身就要镐子才能挖）。
  steelSword: {
    id: 'steelSword',
    name: '精钢剑',
    inputs: [
      { itemId: 'iron', count: 8 },
      { itemId: 'wood', count: 5 }
    ],
    output: { itemId: 'steelSword', count: 1 },
    description: '比旧剑更耐用也更疼的剑。只能在单位面板里装给剑士。'
  },
  spikedClub: {
    id: 'spikedClub',
    name: '狼牙棒',
    inputs: [
      { itemId: 'iron', count: 6 },
      { itemId: 'wood', count: 8 }
    ],
    output: { itemId: 'spikedClub', count: 1 },
    description: '蛮兵的升级武器。'
  },
  longBow: {
    id: 'longBow',
    name: '长弓',
    inputs: [
      { itemId: 'iron', count: 6 },
      { itemId: 'fiber', count: 10 }
    ],
    output: { itemId: 'longBow', count: 1 },
    description: '弓手的升级武器。'
  },
  arrowTower: {
    id: 'arrowTower',
    name: '箭塔',
    inputs: [
      { itemId: 'wood', count: 25 },
      { itemId: 'stone', count: 20 }
    ],
    output: { itemId: 'arrowTower', count: 1 },
    description: '自动射击范围内敌人的箭塔。要消耗魔力，放在基地供能范围里才有用。'
  },
  canteen: {
    id: 'canteen',
    name: '食堂',
    inputs: [
      { itemId: 'wood', count: 20 },
      { itemId: 'food', count: 15 }
    ],
    output: { itemId: 'canteen', count: 1 },
    description: '治疗附近单位（消耗自身耐久）。要消耗魔力。'
  }
};

// ---------------------------------------------------------------------------
// 科技（方案第 9 节：「科研站与基地科技 | 投入资源解锁科技、更高级装备和能力」）
//
// 规则刻意保持最小：
//   - 研究需要**先建好科研站**（未完工不算），否则建筑没有意义；
//   - 科技有前置（`requires`），形成一条链而不是一堆并列项；
//   - `unlocks.recipes` 里的配方在没解锁前**不出现在合成列表**里；
//   - 研究消耗是整笔原子的：材料不够就什么都不扣（复用库存的原子接口）。
//
// 为什么第一个科技是「附魔工艺」：方案第 8.1 条明确「后续解锁附魔台制作附魔石，
// 不再依赖附魔卡生成」。接上之后整条附魔链就不需要卡牌系统了。
// ---------------------------------------------------------------------------
export const TECH_DEFINITIONS = {
  enchanting: {
    id: 'enchanting',
    name: '附魔工艺',
    description: '解锁附魔台的建造，并允许在附魔台上用材料制作附魔石。',
    cost: [
      { itemId: 'stone', count: 40 },
      { itemId: 'iron', count: 12 },
      { itemId: 'deepCore', count: 1 }
    ],
    requires: [],
    unlocks: { recipes: ['enchantTable'] }
  },
  // 下面两项是"更高级的能力"（方案第 9 节：科研站「投入资源解锁科技、更高级装备和能力」）。
  // 它们不改配方表，而是**改已经建好的设施的运转参数**，所以效果必须能被观察：
  //   高效烧炭 —— 熔炉每个周期多出 1 个木炭
  //   采集效率 —— 傀儡每次采集动作多采 2 个
  // `effects` 是这几类效果的统一入口；以后加"塔射程""背包容量"之类也走这里，
  // 不需要再往 Tech 之外散逻辑。
  efficientFuel: {
    id: 'efficientFuel',
    name: '高效烧炭',
    description: '熔炉每个周期多产出 1 个木炭（2 → 3）。',
    cost: [
      { itemId: 'stone', count: 30 },
      { itemId: 'charcoal', count: 20 }
    ],
    requires: [],
    unlocks: { recipes: [] },
    effects: {
      production: [
        { recipeId: 'furnace', patch: { output: { itemId: 'charcoal', count: 3 } } }
      ]
    }
  },
  harvesting: {
    id: 'harvesting',
    name: '采集效率',
    description: '傀儡每次采集动作多采 2 个资源（5 → 7）。',
    cost: [
      { itemId: 'wood', count: 40 },
      { itemId: 'fiber', count: 25 }
    ],
    requires: [],
    unlocks: { recipes: [] },
    effects: {
      harvest: { perActionBonus: 2 }
    }
  }
};

// 附魔台能做的附魔石：附魔种类 → 材料成本。
// 用的是现有 ENCHANTMENTS 里的 id，所以做出来的石头和附魔卡生成的完全同一种。
export const ENCHANT_RECIPES = [
  {
    enchantmentId: 'fire',
    cost: [
      { itemId: 'iron', count: 6 },
      { itemId: 'charcoal', count: 4 }
    ]
  },
  {
    enchantmentId: 'thorns',
    cost: [
      { itemId: 'fiber', count: 20 },
      { itemId: 'iron', count: 4 }
    ]
  },
  {
    enchantmentId: 'triumph',
    cost: [
      { itemId: 'deepCore', count: 1 },
      { itemId: 'iron', count: 8 }
    ]
  }
];

// 科技与附魔各自需要哪座建筑。做成配置而不是写死字符串：
// 以后加科研站等级或别的台子只改这里。
export const RESEARCH_RULES = {
  stationUnitType: 'researchStation',
  enchantUnitType: 'enchantTable'
};

// ---------------------------------------------------------------------------
// 需要魔力的功能设施（方案第 9 节：「箭塔、食堂 | 合成后放置，使用魔力提供对应作用」）
//
// 这两座在旧卡牌玩法里本来就有定义与模型，这里补的是两件事：
//   1. 变成可合成、可放置的物品（放置流程是通用的，加一条配方就接上了）；
//   2. **用魔力驱动**：登记成供能接收者，魔力耗尽就停机。
//
// `restartRatio` 是重启门槛（滞回）：停机之后要充到容量的这个比例才重新开工。
// 没有滞回的话，魔力在 0 附近会让设施一帧开一帧停，表现成箭塔抽搐式射击。
//
// 只在海岛生存关生效（见 FacilitySystem）：另外四关的箭塔/食堂来自卡牌，
// 那里没有供能网络，强行要求魔力会把老玩法直接改坏。
// ---------------------------------------------------------------------------
export const FACILITY_CONFIGS = {
  arrowTower: {
    id: 'arrowTower',
    unitType: 'arrowTower',
    name: '箭塔',
    drainPerSecond: 3,
    manaCapacity: 30,
    restartRatio: 0.4
  },
  canteen: {
    id: 'canteen',
    unitType: 'canteen',
    name: '食堂',
    drainPerSecond: 2,
    manaCapacity: 24,
    restartRatio: 0.4
  }
};

// ---------------------------------------------------------------------------
// 燃料供能设施（方案第 9 节：魔力炉「消耗燃料，为周围生产和战斗提供魔力」）
//
// 与生产设施共用同一套周期推进（缺料停摆、空转不攒工作量），区别只在于产物是**魔力**：
// 烧一份燃料换一段时间的供能功率，这段功率由 PowerSystem 按半径分配给接收者。
//
// 启动路径：木材 → 木炭（熔炉）→ 魔力炉。木炭不参与魔力炉自己的建造，
// 所以"第一批燃料"永远是拿得到的。
// ---------------------------------------------------------------------------
export const FUEL_POWER_CONFIGS = {
  manaFurnace: {
    id: 'manaFurnace',
    unitType: 'manaFurnace',
    name: '魔力炉',
    fuelItemId: 'charcoal',
    fuelPerCycle: 2,
    cycleSeconds: 20,
    supplyPerSecond: 14,
    supplyRadius: 16
  }
};

// ---------------------------------------------------------------------------
// 生产设施配方（方案第 9 节）
//
// 一座设施按周期把输入变成输出：每秒推进 progress，攒够 seconds 就结算一次。
// 三条约束：
//   1. **必须在供能范围内**（放置时校验）：设施是供能接收者，没魔力就停；
//   2. 缺料就停摆，进度保留，不会凭空产出；
//   3. 输入输出都走基地库存，且用库存自己的整笔原子接口——
//      先确认材料够、再扣、再产出，杜绝"扣了木材但木炭没出来"。
//
// 方案第 9 节要求整条链净产出为正、第一批燃料有启动路径：
// 木炭的消费者是魔力炉（尚未实现），所以在魔力炉接上之前，
// 这条链**只到燃料为止**，不要把它当成已经闭环的产出。
// ---------------------------------------------------------------------------
export const PRODUCTION_RECIPES = {
  furnace: {
    id: 'furnace',
    name: '烧炭',
    unitType: 'furnace',
    input: { itemId: 'wood', count: 4 },
    output: { itemId: 'charcoal', count: 2 },
    seconds: 8,
    // 干活才吃魔；停摆时由系统把 drainPerSecond 设回 0（和傀儡待机不吃魔同一套）
    drainPerSecond: 2.4,
    manaCapacity: 24
  }
};

export const ITEM_RULES = {
  // 基地库存格数；傀儡背包更小，容量做成参数而不是写死
  baseInventorySlots: 24,
  workerInventorySlots: 8,
  // 战斗单位的背包：比傀儡小。它是按需创建的（见 Game.itemBagFor），
  // 所以每个战斗单位不会白白多一个 Inventory 对象。
  combatInventorySlots: 6
};

// ---------------------------------------------------------------------------
// 基地供能与傀儡的活动魔力
//
// 必须和旧符文升级资源分开：那一份长在符文石实例上（石头自己的 mana/等级），
// 这一份是傀儡干活用的活动魔力，长在单位身上（activityMana / activityManaCapacity）。
// 两者字段、计量与 UI 文案都不共用；旧的那份后续应改称「符文经验」。
//
// 已确认：基地为周围约 20m 提供魔力，半径做成配置参数，供能有功率上限。
// 其余数值都是默认值，不是已批准的平衡值（文档里的 10/秒只是供需举例）。
// ---------------------------------------------------------------------------
export const POWER_RULES = {
  baseSupplyPerSecond: 12,
  // 文档明确「约 20m」，这条是已确认的，不是占位值
  baseSupplyRadius: 20,
  workerManaCapacity: 60,
  // 行为耗魔：待机不吃，移动/采集/搬运/战斗各不同
  workerDrainIdle: 0,
  workerDrainMove: 1.1,
  workerDrainHarvest: 2.2,
  workerDrainCarry: 1.7,
  workerDrainCombat: 1.6,
  // 单个接收者每段最多补多少，避免一进范围瞬间充满
  maxRechargePerSecond: 8,
  // 低于容量的这个比例就提示该回供能区了
  lowManaRatio: 0.25,
  // 返程储备额外留出的秒数，用于覆盖采集收尾与装卸
  returnExtraSeconds: 3
};

// ---------------------------------------------------------------------------
// 海岛刷怪点
//
// 生存玩法没有波次：地图上这些点持续产生怪物压力，最终目标是清除全部刷怪点。
// 摧毁一个点是「永久停止该点产怪」，不是只杀光当前一批，所以每个点都要有
// 生成间隔与存活上限——移除波次不等于每帧无上限生成。
// 位置按推进方向铺开：出生区附近只有一个弱化点，越往外越硬。
// 掉落里的傀儡来源尚未定稿（成品还是制造核心），这里先留数据钩子，不要写死配方。
// ---------------------------------------------------------------------------
export const ISLAND_SPAWN_POINTS = [
  {
    id: 'island-camp-north',
    name: '北岬巢穴',
    x: -6, z: 30,
    intervalSeconds: 16, maxAlive: 2, maxPerTick: 1,
    leashRadius: 9,
    // 起始巢穴：blood 明显低于其余三个点，让出生护卫能打得下来。
    // 这是链条的起点（打掉它才拿到第一个深邃核心），必须先能打。
    nestHealth: 120,
    enemyPool: [{ type: 'goblinSoldier', weight: 3 }, { type: 'spider', weight: 1 }],
    // 深邃核心只从刷怪点掉：它是招募令的材料，而招募令是野外招募的门槛。
    drops: [
      { itemId: 'deepCore', count: 1 },
      { itemId: 'wood', count: 12 },
      { itemId: 'stone', count: 8 }
    ],
    // 方案第 6.1 条已确认：新增傀儡的来源是刷怪点，不是抽卡也不是纯木石合成。
    // 方案第 6.2 条把「是否必掉、哪个点掉、掉成品还是制造核心」列为待定，
    // 这里选的是**每个点必掉一支成品傀儡**——理由是当前还没有工具/合成链，
    // 掉"制造核心"会让玩家拿到一个暂时用不上的东西。改动只需改这个字段。
    workerReward: { type: 'woodPuppet', count: 1 }
  },
  {
    id: 'island-west-ridge',
    name: '西岭哨站',
    x: -26, z: -6,
    intervalSeconds: 13, maxAlive: 5, maxPerTick: 2,
    leashRadius: 12,
    enemyPool: [{ type: 'goblinSoldier', weight: 2 }, { type: 'goblinArcher', weight: 2 }, { type: 'wolf', weight: 1 }],
    drops: [{ itemId: 'deepCore', count: 1 }, { itemId: 'iron', count: 6 }],
    workerReward: { type: 'woodPuppet', count: 1 }
  },
  {
    id: 'island-east-cape',
    name: '东岬营地',
    x: 26, z: 6,
    intervalSeconds: 13, maxAlive: 5, maxPerTick: 2,
    leashRadius: 12,
    enemyPool: [{ type: 'goblinSoldier', weight: 2 }, { type: 'goblinArcher', weight: 2 }, { type: 'shieldBearer', weight: 1 }],
    drops: [{ itemId: 'deepCore', count: 1 }, { itemId: 'iron', count: 6 }],
    workerReward: { type: 'woodPuppet', count: 1 }
  },
  {
    id: 'island-south-woods',
    name: '南林深处',
    x: 4, z: -26,
    intervalSeconds: 11, maxAlive: 6, maxPerTick: 2,
    leashRadius: 14,
    enemyPool: [{ type: 'goblinSoldier', weight: 2 }, { type: 'goblinHunter', weight: 2 }, { type: 'ogre', weight: 1 }],
    drops: [{ itemId: 'deepCore', count: 1 }, { itemId: 'iron', count: 8 }],
    workerReward: { type: 'woodPuppet', count: 1 }
  }
];

// 所有祭坛共享的恢复效果：占领后持续治疗范围内己方单位的生命与武器耐久。
// 基地不再提供恢复，前线恢复完全依赖祭坛，因此每个祭坛都必须带上这组效果。
const ALTAR_SHARED_RECOVERY_EFFECTS = [
  {
    op: 'restoreHealthPercent',
    percent: 0.04,
    intervalSeconds: 4
  },
  {
    op: 'restoreDurabilityPercent',
    percent: 0.04,
    intervalSeconds: 4
  }
];

export const ALTAR_DEFINITIONS = {
  energy: {
    name: '能量祭坛',
    color: '#35c7ff',
    captureSeconds: 6,
    captureRadius: 4.4,
    // 需要非零作用半径，共享恢复才能覆盖祭坛周围单位。
    effectRadius: 6.6,
    effects: [
      {
        op: 'restoreEnergy',
        amount: 0.5,
        intervalSeconds: 5
      },
      ...ALTAR_SHARED_RECOVERY_EFFECTS
    ]
  },
  shield: {
    name: '护盾祭坛',
    color: '#ffc75e',
    captureSeconds: 6,
    captureRadius: 4.4,
    effectRadius: 6.6,
    effects: [
      {
        op: 'restoreShield',
        amountPerSecond: 0.2
      },
      ...ALTAR_SHARED_RECOVERY_EFFECTS
    ]
  },
  // 原修养祭坛改为魔力祭坛：特色是持续向范围内单位给予魔力（符文石成长资源），
  // 同时保留所有祭坛共有的生命/耐久恢复。
  mana: {
    name: '魔力祭坛',
    color: '#b78cff',
    captureSeconds: 6,
    captureRadius: 4.4,
    effectRadius: 6.6,
    effects: [
      {
        op: 'grantMana',
        amount: 6,
        intervalSeconds: 6
      },
      ...ALTAR_SHARED_RECOVERY_EFFECTS
    ]
  }
};

export const BALANCE = {
  battlefield: {
    halfWidth: 42,
    minZ: -40,
    maxZ: 40
  },
  playerEnergy: {
    initial: 4,
    regenerationPerSecond: 0.1
  },
  // 开局配置：路线数取自关卡 LEVEL_DEFINITIONS[].routeCount。
  // 每多一条路线，除增加一次单位卡三选一外还额外增加开局能量。
  opening: {
    unitCardsPerRoute: 1,
    abilityCards: 1,
    terrainCards: 1,
    energyPerExtraRoute: 2
  },
  // 符文石：附魔卡一次性生成、可随时转移的培养资产。
  runes: {
    // 单位符文背包容量，沿用原附魔槽位上限语义。
    unitCapacity: 5,
    // 基地存储背包容量。
    baseCapacity: 24,
    // 出售返还生成时实际支付能量的比例。
    sellRefundRatio: 0.8,
    // 售价随等级增长：每提升一级额外加价（练出来的石头更值钱）。
    sellPricePerLevel: 2,
    maxLevel: 10,
    // 新石头的初始等级是否取附魔卡等级。
    initialLevelFromCard: true,
    // 第 n 级升到 n+1 级所需魔力，索引 0 对应 1→2 级。
    manaPerLevel: [30, 70, 130, 210, 320, 460, 640, 860, 1120],
    // 未携带符文时获得的魔力是否暂存（第 6.2 节未定，默认不暂存）。
    storeManaWhenNoStones: false
  },
  // 魔力：敌人生成时确定携带值，只有单位击杀才结算，与卡牌能量是两种资源。
  // 基础值对应难度 1 的口径，实际携带量再乘上与生命/攻击同源的难度系数。
  mana: {
    base: {
      normal: 5,
      elite: 20,
      boss: 75
    },
    // 难度系数取生命系数与攻击系数的加权平均，两者一起决定成长幅度。
    healthWeight: 0.5,
    damageWeight: 0.5
  },
  // 祭坛通用规则：占领后可作为单位卡部署点。
  altarRules: {
    deploymentRadius: 7.5
  },
  playerBase: {
    position: { x: 0, y: 0, z: 30 },
    maxHealth: 50,
    maxStructureDurability: 49,
    damagePerAttack: 1,
    energyRewardHealthLoss: 10,
    energyRewardAmount: 2,
    attackRange: 8.5,
    attackDamage: 7,
    attackKnockback: 1.35,
    attackInterval: 1,
    attackDurabilityCost: 1
  },
  enemyCamp: {
    position: { x: 0, y: 0, z: -30 },
    maxHealth: 50,
    maxStructureDurability: 49,
    damagePerAttack: 1,
    attackRange: 8.5,
    attackDamage: 7,
    attackInterval: 1,
    attackDurabilityCost: 1
  },
  runCurrency: {
    shop: {
      basePrice: 12,
      priceIncrement: 3
    },
    // Boss 后军需补给铺：直接展示 4～6 件明码标价的商品，买断即售罄。
    // 配额与补位顺序决定商品组合；价格按商品类别计。全部可配置，供后续实战调整。
    supply: {
      itemCount: 5,
      minItemCount: 4,
      maxItemCount: 6,
      itemCountPerRoute: 0,
      quotas: {
        unitCard: 1,
        enchant: 1,
        abilityTerrain: 1,
        attribute: 1,
        energy: 1
      },
      fillOrder: ['unitCard', 'enchant', 'abilityTerrain', 'attribute'],
      prices: {
        unitCard: 14,
        enchant: 16,
        abilityTerrain: 14,
        attribute: 18,
        energy: 8
      },
      energyAmount: 2,
      allowDuplicateEnchant: true,
      // 本局已获得兵种的全部专精都解锁后，专精步骤改领的银币补偿。
      specializationFallbackSilver: 6
    }
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
        id: 'mana-altar-south',
        type: 'mana',
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
    ],
    // 野外可招募的战斗单位（方案第 6.1 条：原有战斗单位可在野外发现并招募）。
    // 它们是**中立**的：不主动攻击，也不会被己方单位自动索敌；点开详情面板
    // 花一张招募令即可归队。位置铺在出生营地通往各刷怪点的路上，早期就能碰上。
    // 具体坐标不必是精确的可走点：生成时会过 resolveWalkablePoint 兜一层。
    fieldRecruits: [
      { type: 'raider', x: -8, z: 10 },
      { type: 'archer', x: 12, z: 9 },
      { type: 'spearman', x: -16, z: 2 }
    ],
    // 海岛开局的初始部队。
    //
    // 为什么必须有出生护卫：用户定稿的招募链是「招募令 ← 深邃核心 ← 摧毁巢穴」，
    // 也就是**战斗单位本身来自巢穴**。只给一支木傀儡的话整条链是死循环——
    // 实测（scripts/verify-island-opening.mjs 的前身探针）：只有傀儡时必定走到
    // 「no_units_left」判负，加 4 个战斗单位才勉强打掉第一座巢穴。
    // 方案第 6.2 条也要求出生区要撑得起第一轮推进（"战斗单位负责护卫进攻"）。
    survivalOpening: {
      workers: 1,
      escorts: ['raider', 'raider', 'archer', 'archer']
    }
  }
};

// 开局派生规则：关卡数据只存路线数，开局单位卡选择次数与开局能量都由这里集中换算。
export function levelRouteCount(level) {
  return Math.max(1, Math.floor(Number(level?.routeCount) || 1));
}

export function openingUnitCardCount(level, opening = BALANCE.opening) {
  const perRoute = Math.max(0, Math.floor(Number(opening?.unitCardsPerRoute) || 0));
  return Math.max(1, levelRouteCount(level) * perRoute);
}

export function openingEnergyForLevel(level, opening = BALANCE.opening) {
  const extra = Math.max(0, Math.floor(Number(opening?.energyPerExtraRoute) || 0))
    * (levelRouteCount(level) - 1);
  return Math.max(0, Number(BALANCE.playerEnergy?.initial) || 0) + extra;
}

// 敌人携带的魔力基础值（难度 1 口径）：精英与 Boss 用更高档位的基础值。
export function manaBaseForEnemy({ isBoss = false, isElite = false } = {}) {
  const base = BALANCE.mana?.base ?? {};
  const value = isBoss
    ? Number(base.boss ?? 0)
    : (isElite ? Number(base.elite ?? 0) : Number(base.normal ?? 0));
  return Math.max(0, value);
}

/**
 * 魔力难度系数：与 applyEnemyDifficulty 给生命、攻击用的系数同源，
 * 让敌人携带的魔力像生命值和攻击力一样随难度成长，而不是按档位取固定值。
 */
export function enemyManaFactor(healthFactor, damageFactor, mana = BALANCE.mana) {
  const healthWeight = Math.max(0, Number(mana?.healthWeight ?? 0.5));
  const damageWeight = Math.max(0, Number(mana?.damageWeight ?? 0.5));
  const total = healthWeight + damageWeight;
  if (total <= 0) return 1;
  const health = Number.isFinite(Number(healthFactor)) ? Number(healthFactor) : 1;
  const damage = Number.isFinite(Number(damageFactor)) ? Number(damageFactor) : health;
  return Math.max(0, (health * healthWeight + damage * damageWeight) / total);
}

/** 敌人生成时最终携带的魔力：档位基础值 × 与生命/攻击同源的难度系数。 */
export function manaValueForEnemy({ isBoss = false, isElite = false, factor = 1 } = {}) {
  const base = manaBaseForEnemy({ isBoss, isElite });
  const scale = Number.isFinite(Number(factor)) ? Math.max(0, Number(factor)) : 1;
  return Math.max(0, Math.round(base * scale));
}

export const PVE_ENEMY_SCALING_BY_PLAYER_COUNT = {
  2: { healthMult: 2, damageMult: 1.1 },
  3: { healthMult: 3, damageMult: 1.2 },
  4: { healthMult: 4, damageMult: 1.3 }
};

// Compatibility export for the current two-player product preset.
export const COOP_ENEMY_SCALING = PVE_ENEMY_SCALING_BY_PLAYER_COUNT[2];
