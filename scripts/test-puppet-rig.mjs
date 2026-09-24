// 木傀儡骨架与动作的数值验收（本轮需求第 5 条）。
//
// 这个测试解决一个具体难题：**没有肉眼，怎么判断动作是对的？**
// 答案是量工具尖端的轨迹，而不是量关节角度——
//   砍树 = 斧子先被抬到最高，然后在命中帧急速下落，再收势回正；
//   挖矿 = 同一套节奏但幅度更小、更快。
// 所以这里跟踪 `toolSocket`（手掌上的工具挂点）的世界坐标：
//   最高点必须出现在命中帧**之前**；
//   最低点必须出现在命中帧**之后**；
//   下落最快的那个采样点必须落在命中帧附近。
// 如果关节方向写反了，轨迹会变成"先下后上"，这几条会立刻失败。
//
// 另一组断言守的是"重新挂载枢轴没有让几何错位"——把一条手臂拆成
// 肩 + 肘两层时最容易犯的错，是子节点被多减了一次偏移，
// 表现成手或工具凭空位移。这里直接比绝对坐标。
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createUnitModel, updateUnitAnimation, playUnitAnimation, stopUnitAnimation, getAnimationDuration, setUnitHeldTool } from '../src/art/visualRegistry.js';
import { UNIT_DEFINITIONS } from '../src/data/gameData.js';

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

const definition = UNIT_DEFINITIONS.woodPuppet;

function makeUnit(visualState = 'idle') {
  const visualRoot = createUnitModel('woodPuppet', 'player');
  const unit = {
    id: 7,
    type: 'woodPuppet',
    team: 'player',
    definition,
    visualRoot,
    visualState,
    isBuilding: false
  };
  return { unit, visualRoot, parts: visualRoot.userData.parts ?? {} };
}

/** 读某个节点的**世界**坐标。必须从根节点整体更新矩阵——
 *  只 updateMatrixWorld 该节点的话，父级矩阵是陈旧的，
 *  读到的其实是局部坐标（我第一次就栽在这里：膝读到的是"膝−胯"）。 */
function worldPosition(root, node) {
  root.updateMatrixWorld(true);
  return new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
}

/** 把一段 one-shot 播完，逐帧记录工具尖端的世界坐标。 */
function sampleSwing(name, steps = 72) {
  const { unit, visualRoot, parts } = makeUnit();
  playUnitAnimation(unit, name);
  const duration = getAnimationDuration(unit, name);
  const socket = parts.toolSocket;
  assert.ok(socket, '夹具前提：傀儡必须有 toolSocket');
  const samples = [];
  for (let i = 0; i <= steps; i += 1) {
    updateUnitAnimation(unit, i === 0 ? 0 : duration / steps);
    const position = worldPosition(visualRoot, socket);
    samples.push({ t: i / steps, y: position.y, x: position.x, z: position.z });
  }
  return { samples, duration, parts, visualRoot, unit };
}

function jointSignature(parts) {
  const keys = ['upperBodyPivot', 'headPivot', 'rightArmPivot', 'rightElbowPivot', 'leftArmPivot', 'leftKneePivot', 'rightKneePivot'];
  return keys.map((key) => {
    const node = parts[key];
    if (!node) return `${key}:missing`;
    const r = node.rotation;
    return `${key}=${r.x.toFixed(3)},${r.y.toFixed(3)},${r.z.toFixed(3)}`;
  }).join('|');
}

// ---- 1) 骨架契约 ----

check('骨架暴露了肩/肘/胯/膝四对关节与工具挂点', () => {
  const { parts } = makeUnit();
  const required = [
    'upperBodyPivot', 'headPivot',
    'leftArmPivot', 'rightArmPivot', 'leftElbowPivot', 'rightElbowPivot',
    'leftLegPivot', 'rightLegPivot', 'leftKneePivot', 'rightKneePivot',
    'toolSocket'
  ];
  const missing = required.filter((key) => !parts[key]?.isObject3D);
  assert.equal(missing.length, 0, `缺少关节/挂点：${missing.join('、')}`);
});

check('保持了与其它兵种一致的武器插槽别名（攻击系统在找它们）', () => {
  const { parts } = makeUnit();
  assert.ok(parts.weaponPivot?.isObject3D, 'weaponPivot 别名必须保留');
  assert.ok(parts.offhandPivot?.isObject3D, 'offhandPivot 别名必须保留');
  assert.equal(parts.weaponPivot, parts.rightArmPivot);
  assert.equal(parts.offhandPivot, parts.leftArmPivot);
});

// ---- 2) 重新挂载没有让几何错位 ----

check('肩→肘→腕的局部偏移之和不含重复减除（拆分两层最容易犯的错）', () => {
  const { parts } = makeUnit();
  // 为什么不用"世界坐标正好等于手碗原始坐标"来判：上半身有一个既有的
  // 驼背基准旋转（upperBodyPivot.rotation.x = 0.14），会把手的实际高度压低约 1.6cm。
  // 那条断言会把"本来就有的姿态"误报成错位（我第一版就是这么写的）。
  // 真正要守的是**链式局部偏移之和**：父枢轴在构造时从子节点里减掉过自己的原点，
  // 如果哪一层多减或少减一次，这里立刻对不上，而且与任何旋转无关。
  const sum = new THREE.Vector3()
    .add(parts.upperBodyPivot.position)
    .add(parts.rightArmPivot.position)
    .add(parts.rightElbowPivot.position)
    .add(parts.toolSocket.position);
  // `createPivot(name, position, children)` 会把父原点从子节点里减掉，
  // 所以"从模型根一路加到该节点的局部偏移之和"本来就**等于该节点的原始绝对坐标**。
  // （我在这里连着写错两次期望值：先忘了驼背旋转，又把 0.72 重复加了一遍。）
  // 模型里手腕的绝对坐标是 (0.34, 0.68, 0.12)。
  const expected = new THREE.Vector3(0.34, 0.68, 0.12);
  assert.ok(
    sum.distanceTo(expected) < 1e-9,
    `链式偏移之和为 (${sum.x.toFixed(4)}, ${sum.y.toFixed(4)}, ${sum.z.toFixed(4)})，应为 (0.34, 0.68, 0.12)`
  );
});

check('膝枢轴仍在膝的位置（胯→膝偏移之和正确）', () => {
  const { parts, visualRoot } = makeUnit();
  const left = worldPosition(visualRoot, parts.leftKneePivot);
  const right = worldPosition(visualRoot, parts.rightKneePivot);
  assert.ok(Math.abs(left.x + 0.18) < 1e-6 && Math.abs(left.y - 0.36) < 1e-6 && Math.abs(left.z - 0.02) < 1e-6,
    `左膝位置不对：(${left.x},${left.y},${left.z})`);
  assert.ok(Math.abs(right.x - 0.18) < 1e-6 && Math.abs(right.y - 0.36) < 1e-6 && Math.abs(right.z - 0.02) < 1e-6,
    `右膝位置不对：(${right.x},${right.y},${right.z})`);
  // 腿的父枢轴就是模型根（没有额外旋转），所以链式之和与绝对坐标应当一致
  [['left', parts.leftLegPivot, -1], ['right', parts.rightLegPivot, 1]].forEach(([label, leg, side]) => {
    const sum = new THREE.Vector3().add(leg.position)
      .add((label === 'left' ? parts.leftKneePivot : parts.rightKneePivot).position);
    const expected = new THREE.Vector3(0.18 * side, 0.36, 0.02);
    assert.ok(sum.distanceTo(expected) < 1e-9, `${label} 腿的链式偏移之和不对：${sum.toArray()}`);
  });
});

check('模型整体包围盒没变（脚在地上、头顶高度正常）', () => {
  const { visualRoot } = makeUnit();
  visualRoot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(visualRoot);
  assert.ok(Math.abs(box.min.y) < 0.02, `模型最低点 ${box.min.y.toFixed(3)}，应贴着地面`);
  assert.ok(box.max.y > 1.2 && box.max.y < 1.7, `模型最高点 ${box.max.y.toFixed(3)}，与 1.3 米出头的设计不符`);
});

check('肘确实是工具的祖先（旋转肘会带动工具）', () => {
  const { parts, visualRoot } = makeUnit();
  const before = worldPosition(visualRoot, parts.toolSocket).clone();
  parts.rightElbowPivot.rotation.x = 0.6;
  const after = worldPosition(visualRoot, parts.toolSocket);
  const moved = before.distanceTo(after);
  assert.ok(moved > 0.1, `旋转肘之后工具只移动了 ${moved.toFixed(3)}，说明它没挂在肘下面`);
  parts.rightElbowPivot.rotation.x = 0;
});

// ---- 3) 砍树：先抬起、命中帧急速下落 ----

check('砍树：工具尖端先升到最高，再在命中帧附近急速下落', () => {
  const timeline = definition.art.timelines.chop;
  const strikeAt = timeline.events.strike;
  const { samples } = sampleSwing('chop');
  const ys = samples.map((s) => s.y);
  const maxIndex = ys.indexOf(Math.max(...ys));
  const minIndex = ys.indexOf(Math.min(...ys));
  const maxT = samples[maxIndex].t;
  const minT = samples[minIndex].t;

  assert.ok(maxT < strikeAt, `最高点出现在 t=${maxT.toFixed(2)}，必须在命中帧 ${strikeAt} 之前（说明是"抬起"而不是"先下后上"）`);
  assert.ok(minT > strikeAt, `最低点出现在 t=${minT.toFixed(2)}，必须在命中帧 ${strikeAt} 之后`);
  assert.ok(
    Math.max(...ys) - Math.min(...ys) > 0.15,
    `挥击幅度只有 ${(Math.max(...ys) - Math.min(...ys)).toFixed(3)} 米，动作太小看不出来`
  );

  // 下落最快的采样点应当落在命中帧附近（±0.14 内）
  let fastestIndex = 0;
  let fastestDrop = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const drop = samples[i - 1].y - samples[i].y;
    if (drop > fastestDrop) {
      fastestDrop = drop;
      fastestIndex = i;
    }
  }
  const fastestT = samples[fastestIndex].t;
  assert.ok(
    Math.abs(fastestT - strikeAt) <= 0.14,
    `下落最快的一帧在 t=${fastestT.toFixed(2)}，离命中帧 ${strikeAt} 太远，动作与结算节拍对不上`
  );
});

check('砍树：屈肘是"起手折起来、命中时甩直"', () => {
  const timeline = definition.art.timelines.chop;
  const strikeAt = timeline.events.strike;
  const readElbow = (progress) => {
    const { unit, parts: p } = makeUnit();
    playUnitAnimation(unit, 'chop');
    const duration = getAnimationDuration(unit, 'chop');
    const steps = 60;
    const dt = duration / steps;
    for (let i = 0; i <= steps; i += 1) {
      updateUnitAnimation(unit, i === 0 ? 0 : dt);
      if (i / steps >= progress) break;
    }
    return p.rightElbowPivot.rotation.x;
  };
  const atWindup = readElbow(strikeAt * 0.7);
  const atStrike = readElbow(strikeAt + 0.02);
  assert.ok(Math.abs(atWindup) > 0.2, `起手时肘几乎没有折起来（${atWindup.toFixed(3)}），缺少蓄力`);
  assert.ok(Math.abs(atStrike) < Math.abs(atWindup) * 0.5, `命中时肘没有明显伸直（起手 ${atWindup.toFixed(3)} → 命中 ${atStrike.toFixed(3)}）`);
});

// ---- 4) 挖矿：同一套节奏，幅度更小 ----

check('挖矿：同样是先抬后砸，且比砍树更短促', () => {
  const timeline = definition.art.timelines.mine;
  const strikeAt = timeline.events.strike;
  const { samples, duration } = sampleSwing('mine');
  const ys = samples.map((s) => s.y);
  const maxIndex = ys.indexOf(Math.max(...ys));
  const minIndex = ys.indexOf(Math.min(...ys));
  assert.ok(samples[maxIndex].t < strikeAt, '挖矿的最高点也必须在命中帧之前');
  assert.ok(samples[minIndex].t > strikeAt, '挖矿的最低点也必须在命中帧之后');
  assert.ok(
    duration < definition.art.timelines.chop.duration,
    `挖矿时长 ${duration} 应当短于砍树 ${definition.art.timelines.chop.duration}（镐是短促下砸）`
  );
});

// ---- 5) 攻击动作存在且不是静止 ----

check('攻击：关节确实在动（不是静止不动）', () => {
  const timeline = definition.art.timelines.attack;
  assert.ok(timeline, '必须定义 attack 时间轴');
  const { parts, unit } = makeUnit();
  playUnitAnimation(unit, 'attack');
  const signature = new Set();
  const poses = [];
  const duration = getAnimationDuration(unit, 'attack');
  for (let i = 0; i <= 24; i += 1) {
    updateUnitAnimation(unit, i === 0 ? 0 : duration / 24);
    signature.add(jointSignature(parts));
    poses.push(parts.rightArmPivot.rotation.x);
  }
  assert.ok(signature.size >= 10, `attack 期间只出现了 ${signature.size} 种姿态，动作太单薄`);
  assert.ok(Math.max(...poses) - Math.min(...poses) > 0.4, '攻击的手臂摆幅太小');
});

// ---- 6) 走路与站立都要用上膝和肘 ----

check('走路时膝与肘都有屈度，站立时几乎不弯', () => {
  // ⚠️ 木傀儡的站姿是**按墙钟时间**算的（`applyWoodPuppetStance` 里的
  // `performance.now() * 0.001`），`updateUnitAnimation(unit, dt)` 的 dt 对它没有影响。
  // 所以"连续调 12 次、每次 0.11 秒"其实只采到了**同一个随机相位**
  // （12 次调用间隔是微秒级），测出来的是 `|knee(phase)|` 而不是一个周期里的峰值——
  // 这个断言因此一直在 0.24 上下抖动（阈值 0.25，实测三次里过一次）。
  //
  // 修法：把 `performance.now` 换成可控制的假时钟，**扫完整个周期**再取峰值。
  // 峰值可以解析地算出来：knee = 0.07 + max(0, -sin) * 0.4 → 0.27，
  // 所以"阈值 0.25"从此是一条确定的断言，而不是抽奖。
  const realNow = performance.now;
  try {
    const readStance = (visualState) => {
      const { unit, parts } = makeUnit(visualState);
      let knee = 0;
      let elbow = 0;
      // 摆动角速度 5.6 rad/s → 周期约 1.12 秒；扫 3 秒保证覆盖整周期
      for (let step = 0; step < 240; step += 1) {
        performance.now = () => step * (3000 / 240);
        updateUnitAnimation(unit, 0.01);
        knee = Math.max(
          knee,
          Math.abs(parts.leftKneePivot.rotation.x),
          Math.abs(parts.rightKneePivot.rotation.x)
        );
        elbow = Math.max(
          elbow,
          Math.abs(parts.leftElbowPivot.rotation.x),
          Math.abs(parts.rightElbowPivot.rotation.x)
        );
      }
      return { knee, elbow };
    };
    const walking = readStance('walk');
    const idle = readStance('idle');
    assert.ok(walking.knee > 0.25, `走路时膝盖最大只弯了 ${walking.knee.toFixed(3)}，看起来还是直腿`);
    assert.ok(walking.elbow > 0.2, `走路时肘最大只弯了 ${walking.elbow.toFixed(3)}`);
    assert.ok(walking.knee > idle.knee * 2, '走路与站立的屈膝应当有明显区别');
  } finally {
    performance.now = realNow;
  }
});

// ---- 7) 手里的工具挂件 ----

check('工具模型：斧与镐是两件不同的东西，都挂在手掌上（肘的子孙）', () => {
  const { unit, parts, visualRoot } = makeUnit();
  setUnitHeldTool(unit, 'axe');
  const axe = parts.toolSocket.getObjectByName('unitHeldTool:axe');
  assert.ok(axe?.isObject3D, '斧子模型必须挂在 toolSocket 上');
  assert.equal(axe.visible, true, '当前要采的是木头时斧子必须可见');

  setUnitHeldTool(unit, 'pickaxe');
  const pickaxe = parts.toolSocket.getObjectByName('unitHeldTool:pickaxe');
  assert.ok(pickaxe?.isObject3D, '镐模型必须挂在 toolSocket 上');
  assert.equal(pickaxe.visible, true);
  assert.equal(axe.visible, false, '换成镐之后斧子必须收起（不能两把一起举着）');

  // 两件工具的几何必须不同，否则只是"换了个名字"
  const meshCount = (group) => { let n = 0; group.traverse((node) => { if (node.isMesh) n += 1; }); return n; };
  assert.notEqual(meshCount(axe), meshCount(pickaxe), '斧与镐的构成应当不同');

  // 工具必须挂在肘下面：这样挥砍时它跟着小臂划弧
  const before = worldPosition(visualRoot, axe).clone();
  parts.rightElbowPivot.rotation.x = 0.7;
  const after = worldPosition(visualRoot, axe);
  assert.ok(before.distanceTo(after) > 0.15, `旋转肘时工具只动了 ${before.distanceTo(after).toFixed(3)}，说明没挂在肘下面`);
  parts.rightElbowPivot.rotation.x = 0;
});

check('空手时两把工具都收起，且反复切换不会建出重复模型', () => {
  const { unit, parts } = makeUnit();
  setUnitHeldTool(unit, 'axe');
  setUnitHeldTool(unit, 'pickaxe');
  setUnitHeldTool(unit, 'axe');
  setUnitHeldTool(unit, 'axe');
  const tools = parts.toolSocket.children.filter((child) => child.name.startsWith('unitHeldTool:'));
  assert.equal(tools.length, 2, `反复切换之后手掌上只应有 2 件工具模型，实际 ${tools.length}`);
  setUnitHeldTool(unit, null);
  assert.equal(tools.every((tool) => tool.visible === false), true, '空手时两件工具都必须收起');
});

check('挥砍动画期间工具的世界位置确实在动（它跟着手走）', () => {
  const { unit, parts, visualRoot } = makeUnit();
  setUnitHeldTool(unit, 'axe');
  const axe = parts.toolSocket.getObjectByName('unitHeldTool:axe');
  playUnitAnimation(unit, 'chop');
  const duration = getAnimationDuration(unit, 'chop');
  const positions = [];
  for (let i = 0; i <= 24; i += 1) {
    updateUnitAnimation(unit, i === 0 ? 0 : duration / 24);
    positions.push(worldPosition(visualRoot, axe).clone());
  }
  let maxMove = 0;
  for (let i = 1; i < positions.length; i += 1) {
    maxMove = Math.max(maxMove, positions[i - 1].distanceTo(positions[i]));
  }
  assert.ok(maxMove > 0.08, `相邻帧之间工具最多只移动了 ${maxMove.toFixed(3)} 米，看起来没跟着挥`);
});

// ---- 8) 动作结束后回到绑定姿态 ----

check('动作播完会回到绑定姿态（不留残余偏移）', () => {
  const { unit, parts } = makeUnit();
  playUnitAnimation(unit, 'chop');
  const duration = getAnimationDuration(unit, 'chop');
  for (let i = 0; i < 60; i += 1) updateUnitAnimation(unit, duration / 40);
  stopUnitAnimation(unit);
  updateUnitAnimation(unit, 0.016);
  const bind = parts.rightElbowPivot.userData.bindPose?.quaternion;
  assert.ok(bind, '肘枢轴必须有绑定姿态（captureAnimatedDefaults 生成的）');
  const now = parts.rightElbowPivot.quaternion;
  const drift = Math.abs(now.x - bind.x) + Math.abs(now.y - bind.y) + Math.abs(now.z - bind.z) + Math.abs(now.w - bind.w);
  assert.ok(drift < 1e-6, `动作结束后肘的姿态残留了 ${drift.toFixed(6)} 的偏移`);
});

console.log(report.join('\n'));
const failed = report.filter((line) => line.startsWith('FAIL')).length;
console.log(`\n木傀儡骨架与动作：${report.length - failed}/${report.length} 通过`);
