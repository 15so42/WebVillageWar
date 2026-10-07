// 路边营地：不刷新、不挡通关，打完有明确战利品；界面始终有下一句该做什么。
import assert from 'node:assert/strict';
import { ITEM_DEFINITIONS, UNIT_DEFINITIONS, ISLAND_SPAWN_POINTS } from '../src/data/gameData.js';
import { islandContains, islandFieldCamps, islandOuterSpawnPoints } from '../src/systems/survivalExpansion.js';
import {
  createFieldCampState,
  noteFieldCampDeath,
  survivalObjectiveText
} from '../src/systems/fieldCamps.js';

const report = [];
function check(name, fn) {
  try {
    fn();
    report.push(`ok   ${name}`);
  } catch (error) {
    report.push(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

check('三座营地都在岛上，而且不压在刷怪点上', () => {
  const camps = islandFieldCamps();
  assert.equal(camps.length, 3);
  const nests = [...ISLAND_SPAWN_POINTS, ...islandOuterSpawnPoints()];
  const ids = new Set();
  camps.forEach((camp) => {
    assert.equal(ids.has(camp.id), false, camp.id);
    ids.add(camp.id);
    assert.equal(islandContains(camp.x, camp.z), true, camp.name);
    assert.ok(camp.members.length >= 2, camp.name);
    // 守卫领地：没有它，敌人"接上目标就永不脱战"会一路追进基地（开局 1.4 秒唯一傀儡被接战）。
    assert.ok(camp.guardRadius >= 6, `${camp.name} 缺少守卫领地半径`);
    camp.members.forEach((member) => {
      assert.ok(UNIT_DEFINITIONS[member.type], member.type);
    });
    assert.ok(camp.drops.some((drop) => drop.itemId === 'magicStone' && drop.count >= 1));
    camp.drops.forEach((drop) => {
      assert.ok(ITEM_DEFINITIONS[drop.itemId], drop.itemId);
      assert.notEqual(drop.itemId, 'food');
      assert.notEqual(drop.itemId, 'deepCore');
    });
    nests.forEach((nest) => {
      const distance = Math.hypot(camp.x - nest.x, camp.z - nest.z);
      assert.ok(distance >= 12, `${camp.name} 离 ${nest.name} 只有 ${distance.toFixed(1)}m`);
    });
  });
  // 开局安全空间：出生点必须在所有守卫领地之外，而且没有一块领地把基地圈进去。
  // 这是"唯一傀儡出门工作前就被接战"那条 bug 的直接回归断言。
  const BASE = { x: 4, z: 40 };
  const WORKER_SPAWN = { x: BASE.x - 3.6, z: BASE.z + 3.4 };
  camps.forEach((camp) => {
    const toBase = Math.hypot(camp.x - BASE.x, camp.z - BASE.z);
    assert.ok(
      toBase - camp.guardRadius >= 10,
      `${camp.name} 的守卫范围逼到基地${(toBase - camp.guardRadius).toFixed(1)}m`
    );
    const toSpawn = Math.hypot(camp.x - WORKER_SPAWN.x, camp.z - WORKER_SPAWN.z);
    assert.ok(
      toSpawn > camp.guardRadius,
      `${camp.name} 的守卫范围盖住了傀儡出生点（${toSpawn.toFixed(1)}m ≤ ${camp.guardRadius}m）`
    );
  });
});

check('营地要全灭才清，而且只发一次', () => {
  const state = createFieldCampState(islandFieldCamps());
  const wolves = [
    { alive: true, fieldCampId: 'west-wolves' },
    { alive: false, fieldCampId: 'west-wolves' }
  ];
  const first = noteFieldCampDeath(state, 'west-wolves', wolves);
  assert.equal(first.justCleared, false);
  wolves[0].alive = false;
  const second = noteFieldCampDeath(state, 'west-wolves', wolves);
  assert.equal(second.justCleared, true);
  assert.equal(second.camp.drops[0].itemId, 'puppetCudgel');
  const again = noteFieldCampDeath(state, 'west-wolves', wolves);
  assert.equal(again.justCleared, false);
});

check('眼下这句话会随营地、昼夜和防线缺口变化', () => {
  const camps = islandFieldCamps();
  const cleared = new Set();
  const first = survivalObjectiveText({
    camps,
    clearedIds: cleared,
    isNight: false,
    secondsRemaining: 240
  });
  assert.match(first, /离入夜还有 4:00/);
  assert.match(first, /西坡/);
  cleared.add('west-wolves');
  assert.match(survivalObjectiveText({
    camps,
    clearedIds: cleared,
    secondsRemaining: 180
  }), /北路/);
  cleared.add('north-post');
  cleared.add('east-thicket');
  const night = survivalObjectiveText({
    camps,
    clearedIds: cleared,
    isNight: true,
    secondsRemaining: 90,
    nests: [{ id: 'island-camp-north', name: '北岬巢穴', x: -13, z: 65 }]
  });
  assert.match(night, /这一夜还剩 1:30/);
  // 只说"还没有防御塔"，不再说"北岬巢穴还没有箭塔"（预设塔位已删除）。
  assert.match(night, /先造防御塔/);
  assert.match(night, /熔炉/);
  const day = survivalObjectiveText({
    camps,
    clearedIds: cleared,
    isNight: false,
    secondsRemaining: 60,
    hasFurnace: true,
    hasManaFurnace: true,
    manaFurnaceFueled: true,
    nests: []
  });
  assert.match(day, /已经拆完/);
});

console.log(report.join('\n'));
if (process.exitCode) process.exit(process.exitCode);
console.log(`\n路边营地：${report.length}/${report.length} 通过`);
