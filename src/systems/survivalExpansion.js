// 外圈地图规划（纯数据）。
//
// 出生岛的刷怪点保持手摆。推进后按环追加：更远的巢穴、富铁矿、以及每座巢穴的
// **敌军内部路线锚点**（`raidRally`：夜袭单位先走到这里再扑基地）。
//
// `raidRally` 只服务敌军路线。它**不是**玩家防御建筑的预留位：没有吸附、没有标签、
// 没有"建成才有效"的槽位关联。玩家在合法地形上自由选址（见
// docs/DSH_OPENING_FREEDOM_RESULT.md 第 1 节）。
// 这里不创建 THREE 物体，世界生成之后再按返回值挂到 SpawnPointSystem / ResourceNodeSystem。

const TAU = Math.PI * 2;

function pointOnRing(index, count, radius, center) {
  const angle = (index / Math.max(1, count)) * TAU + 0.35;
  return {
    x: Math.round((center.x + Math.cos(angle) * radius) * 10) / 10,
    z: Math.round((center.z + Math.sin(angle) * radius) * 10) / 10
  };
}

/**
 * @param {{ center?: {x:number,z:number}, radius?: number, nests?: number, crystals?: number, ringIndex?: number }} options
 */
export function planOuterRing({
  center = { x: 0, z: 0 },
  radius = 96,
  nests = 4,
  crystals = 6,
  ringIndex = 1
} = {}) {
  const nestCount = Math.max(1, Math.floor(nests));
  const crystalCount = Math.max(0, Math.floor(crystals));
  const spawnPoints = [];
  for (let i = 0; i < nestCount; i += 1) {
    const spot = pointOnRing(i, nestCount, radius, center);
    spawnPoints.push({
      id: `outer-ring-${ringIndex}-nest-${i}`,
      name: `外环${ringIndex}巢穴${i + 1}`,
      x: spot.x,
      z: spot.z,
      leashRadius: 22,
      nestHealth: 160 + ringIndex * 40,
      enemyPool: [
        { type: 'goblinSoldier', weight: 2 },
        { type: 'goblinArcher', weight: 2 },
        { type: 'wolf', weight: 1 }
      ],
      drops: [
        { itemId: 'deepCore', count: 1 },
        { itemId: 'iron', count: 8 }
      ],
      recruitReward: { types: ['raider'], count: 1 },
      workerReward: { type: 'woodPuppet', count: 1 },
      // 敌军内部路线锚点：夜袭单位先走到这里，再扑基地。
      // **不是**玩家建筑的预留位——玩家想在哪建防御塔就在哪建（见 docs/DSH_OPENING_FREEDOM_RESULT.md）。
      raidRally: {
        x: Math.round((spot.x + center.x) / 2 * 10) / 10,
        z: Math.round((spot.z + center.z) / 2 * 10) / 10
      }
    });
  }
  const resourceNodes = [];
  for (let i = 0; i < crystalCount; i += 1) {
    const spot = pointOnRing(i + 0.5, crystalCount, radius * 0.72, center);
    resourceNodes.push({
      id: `outer-ring-${ringIndex}-crystal-${i}`,
      definitionId: 'richIron',
      resource: 'iron',
      x: spot.x,
      z: spot.z,
      amount: 18,
      maxAmount: 18
    });
  }
  return { spawnPoints, resourceNodes, radius, ringIndex };
}

/** 与海岛 landmass.lobes 一致的椭圆，用来保证外圈落在陆地上。 */
const ISLAND_LOBES = [
  { x: 0, z: 0, rx: 92, rz: 80, rot: -0.06 },
  { x: -52, z: -44, rx: 60, rz: 48, rot: 0.55 },
  { x: 60, z: 26, rx: 56, rz: 44, rot: -0.32 },
  { x: -16, z: 64, rx: 48, rz: 40, rot: 0.2 }
];

export function islandContains(x, z) {
  return ISLAND_LOBES.some((lobe) => {
    const dx = x - lobe.x;
    const dz = z - lobe.z;
    const cos = Math.cos(-lobe.rot);
    const sin = Math.sin(-lobe.rot);
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    return (localX * localX) / (lobe.rx * lobe.rx) + (localZ * localZ) / (lobe.rz * lobe.rz) <= 0.92;
  });
}

/** 出生岛外圈：四座巢穴各打一种仗，避免清图时四次都是同一批哥布林。 */
export function islandOuterSpawnPoints() {
  const spots = [
    {
      id: 'island-outer-east',
      name: '东岬箭巢',
      gateNestId: 'island-east-cape',
      x: 90, z: 26,
      enemyPool: [
        { type: 'goblinArcher', weight: 3 },
        { type: 'venomArcher', weight: 1 }
      ],
      recruitReward: { types: ['crossbowman'], count: 1 },
      drops: [
        { itemId: 'deepCore', count: 1 },
        { itemId: 'iron', count: 6 },
        { itemId: 'fiber', count: 8 }
      ]
    },
    {
      id: 'island-outer-northwest',
      name: '西北兽穴',
      gateNestId: 'island-west-ridge',
      x: -78, z: -62,
      enemyPool: [
        { type: 'wolf', weight: 3 },
        { type: 'bear', weight: 1 }
      ],
      recruitReward: { types: ['spearman'], count: 1 },
      drops: [
        { itemId: 'deepCore', count: 1 },
        { itemId: 'iron', count: 4 },
        { itemId: 'fiber', count: 12 }
      ]
    },
    {
      id: 'island-outer-north',
      name: '北岬盾巢',
      gateNestId: 'island-camp-north',
      x: -14, z: 86,
      enemyPool: [
        { type: 'shieldBearer', weight: 2 },
        { type: 'goblinShaman', weight: 1 },
        { type: 'goblinSoldier', weight: 1 }
      ],
      recruitReward: { types: ['towerShield'], count: 1 },
      drops: [
        { itemId: 'deepCore', count: 1 },
        { itemId: 'iron', count: 8 },
        { itemId: 'stone', count: 10 }
      ]
    },
    {
      id: 'island-outer-southwest',
      name: '西南巨巢',
      gateNestId: 'island-south-woods',
      x: -70, z: -18,
      enemyPool: [
        { type: 'goblinHunter', weight: 2 },
        { type: 'ogre', weight: 1 }
      ],
      recruitReward: { types: ['berserker'], count: 1 },
      drops: [
        { itemId: 'deepCore', count: 2 },
        { itemId: 'iron', count: 10 }
      ]
    }
  ];
  return spots.map((spot) => ({
    id: spot.id,
    name: spot.name,
    x: spot.x,
    z: spot.z,
    leashRadius: 20,
    maxAlive: 2,
    gateNestId: spot.gateNestId,
    nestHealth: spot.id === 'island-outer-southwest' ? 260 : 200,
    enemyPool: spot.enemyPool,
    drops: spot.drops,
    recruitReward: spot.recruitReward,
    workerReward: { type: 'woodPuppet', count: 1 },
    // 敌军内部路线锚点（同 planOuterRing）：只有夜袭路线读它，玩家建筑完全自由选址。
    raidRally: {
      x: Math.round(((spot.x + 4) / 2) * 10) / 10,
      z: Math.round(((spot.z + 40) / 2) * 10) / 10
    }
  }));
}

/**
 * 出生岛到第一座巢穴之间的一次性营地。打掉不刷新，用来填上「只有砍树」的白天。
 *
 * `guardRadius` 是**守卫领地**：营地成员只打进入这块领地的人，不会跨岛追进基地。
 * 没有它时，敌人的"接上目标就永不脱战"会让出生点旁边的哨卡在开局 1.4 秒就把
 * 唯一的木傀儡拖进战斗（实测：`goblinsoldier` 2m 内），玩家连采集都开不了。
 * 领地范围内仍然是真风险：想走北路就得先清掉它。
 */
export function islandFieldCamps() {
  return [
    {
      id: 'west-wolves',
      name: '西坡狼窝',
      x: -18,
      z: 32,
      guardRadius: 9,
      brief: '西坡有两只狼。带斧子清掉，地上会留下木棒和魔石。',
      members: [{ type: 'wolf' }, { type: 'wolf' }],
      drops: [
        { itemId: 'puppetCudgel', count: 1 },
        { itemId: 'magicStone', count: 4 }
      ]
    },
    {
      id: 'north-post',
      name: '北路哨卡',
      // 原坐标 (-8, 50) 距基地只有 15.6m，正好落在基地开局空地（clearings r=16）里面，
      // 开局第一秒两个哥布林就站在出生点旁边。移到 21.6m 外、离北岬巢穴 13m 的北路旁：
      // 基地周围留出真正的安全经营空间，哨卡仍然是"想走北路就得先清"的关卡。
      x: -14,
      z: 52,
      guardRadius: 9,
      brief: '北路哨卡有两名哥布林。清掉才好接近北岬巢穴，会掉铁矿和魔石。',
      members: [{ type: 'goblinSoldier' }, { type: 'goblinSoldier' }],
      drops: [
        { itemId: 'iron', count: 10 },
        { itemId: 'magicStone', count: 6 }
      ]
    },
    {
      id: 'east-thicket',
      name: '东林盗伙',
      x: 24,
      z: 28,
      guardRadius: 9,
      brief: '东林有弓手和狼。清掉会掉纤维和魔石，够做一块普通附魔石的魔石部分。',
      members: [{ type: 'goblinArcher' }, { type: 'wolf' }],
      drops: [
        { itemId: 'fiber', count: 36 },
        { itemId: 'magicStone', count: 8 }
      ]
    }
  ];
}

export function islandOuterIronZones() {
  return [
    { node: 'richIron', x: 78, z: 36, rx: 6, rz: 5, count: 4, spacing: 2.2 },
    { node: 'richIron', x: -68, z: -48, rx: 6, rz: 5, count: 4, spacing: 2.2 },
    { node: 'richIron', x: -6, z: 82, rx: 5, rz: 4, count: 3, spacing: 2.2 }
  ];
}
