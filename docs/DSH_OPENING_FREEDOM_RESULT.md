# DSH 自由建塔与默认开局体验 — 进行中检查点

状态：**进行中**（第 3 次续跑：上一轮真实实玩在采集阶段就关卡失败，本轮已定位并修掉根因）
负责人：DSH agent（Codex 不审代码、不重跑测试）
授权来源：`docs/DSH_OPENING_FREEDOM_HANDOFF.md`

## 第 3 次续跑（2026-10-06 晚）— 真实实玩暴露的开局致命缺陷与修复

### 上一轮（accept2）真实实玩的真实结局

`_dsh-freedom-accept2.json`（正常实时、无注入、无 clock 挂钩、硬件 WebGL）：
`gatherAborted = 'game-lost'`，**wallSec = 113**。也就是：玩家按正常流程选中傀儡 → G 框选资源，
**唯一工人被打死 → 关卡在 1:48 直接失败**，连第一座建筑都没造出来。

| 时刻 | 真实观测 |
|------|---------|
| t=17~43s | 傀儡在 (21.9,42)~(25.1,40.2) 反复 `harvesting`，但基地库存**全程没涨**（一直 wood 20 / stone 12） |
| t=47~57s | `plan='low_power'`（没魔力了，去充电） |
| t=77s | 走到 (24.1,36.8)，hp 仍 30 |
| t=87s | (21.9,34)，hp **19.8**（被弓手打） |
| t=97s | (20.2,32.7)，hp **6.1**，`plan='idle'`（`avoid` 模式下逃跑但没跑掉） |
| t=107s | 工人死亡 → `friendlyUnits` 里没有工人 → **关卡失败** |

### 根因（只读诊断 `_dsh-diag-nodes.json`，275 个节点全量）

1. **清场圈比营地领地内缘还大。** 基地清场圈 `clearings` r=16 让所有资源点必须 ≥16m，
   而三处路边营地/野兽的领地内缘距基地只有 **12.6m(北) / 14.3m(东) / 14.4m(西)**。
   于是"清场圈外、领地外"这条安全带在东西北几乎没有厚度。
2. **威胁值在领地边缘会衰减到阈值以下。** 威胁数组用**索敌半径**做线性衰减，
   实测 `oak-2-16`(22.5,37.9) 距东林弓手领地只剩 1.0m、威胁值 2.17；
   `oak-2-12`(27,37.2) 距领地 0.7m、威胁值 1.76 —— 都低于 `maxNodeThreat = 2`，
   所以被判"可去"。但弓手的索敌是**按领地过滤**的（`TargetingSystem.isInsideGuardZone`），
   傀儡再挪一步跨进 9m 就会被动手。这就是工人死亡的位置。
3. 开局**没有安全的近处木材**：最安全的可去木材是 21.4m 外的 `oak-2-10`（领地余量仅 4.5m）。
   石料有 16.1m 的（余量 2.7m），木材没有对应物。

### 本轮实现（最小必要项，4 个文件）

| 文件 | 改动 | 理由 |
|------|------|------|
| `src/systems/WorkSystem.js` | 新增 `enemyTerritories()` / `nodeInEnemyTerritory()` / `countNodesInEnemyTerritory()` 与 `territoryMargin`（默认 2m）；`nodeIsWorkable()` 增加"不得落在敌人领地内"这条硬判据 | 与 `TargetingSystem.isInsideGuardZone` **同源**：领地内会被打，领地外不会被主动索敌。威胁值继续负责没有领地的敌人（夜袭巢穴） |
| `src/world/createWorld.js` | `resourceZones` 末尾追加基地南侧**安全起手林地** `{oak, x:3, z:24, rx:7, rz:4.5, count:10}` | 南侧没有任何营地；追加在数组末尾避免节点 id（含区号）位移、影响存档 |
| `src/systems/Game.js` | `finishResourceBoxSelect()` 在提示里加上「其中 N 个在敌人地盘里，傀儡不会去」 | handoff §2 要求"可理解的反馈"：否则玩家只看到标记亮着、工人不动 |
| `scripts/test-island-terrain.mjs` | 节点预算断言 264/275 → 274/285（上限 320 不变） | 保持预算不变量的断言为真，不是放宽断言 |

诊断复核（`_dsh-diag-nodes.json`，同一只读探针）：
- 新林地 10 棵橡树落在 (0~4, 19~24)，距基地 **16.1~20.8m**，距最近领地 **10.7~14.2m**，威胁值 0，全部 `workable`；
- 屏幕坐标 (564~636, 180~219) —— 在默认相机视角里**可见、可框选**；
- 领地内 +2m 余量的节点共 101/285 个，其中 `workable` 的现在是 **0** 个。
- 语义变化：营地没清掉时它地盘里的资源不可派活；**清掉营地后领地消失、资源重新可用** ——
  这正是"扩张风险"而不是"死区"。

### 本轮待办

1. [x] 复核上一轮 real-play 证据，定位关卡失败根因（领地/威胁/清空圈三条）
2. [x] 实现：领地硬判据 + 安全起手林地 + 框选反馈
3. [x] 目标回归：`test-island-terrain`(16/16)、`test-work-records`、`test-work-orders`(15/15)、
   `test-field-camps`(3/3)、`test-spawn-points`(15/15)、`test-targeting`、`test-resource-nodes`(15/15)
4. [x] 短程冒烟：`accept3` P0–P4 机械可跑（14s/20s 预算）
5. [ ] `accept3` 完整实时实玩（自由选址 ×2 + 非法点拒绝 + 熔炉真实出料 + 首夜 + ≥15 分钟）
6. [ ] `npm run build`
7. [ ] 最终报告

## 第 2 次续跑的关键更正（2026-10-06，务必先读）

上一轮（本文件旧内容）把 `dsh-freedom-09-tower-1-placed.png` / `dsh-freedom-10-towers-built.png`
记为「箭塔自选位置建成」。**实核为伪造性无效证据**：

- 这两张截图与 `dsh-freedom-01-opening.png` 同尺寸同内容：画面中央是**暂停菜单**（「游戏已暂停 / 暂停 / 继续 / 全屏 / 重玩 / 回到主菜单」），
  箭头/塔在画面里**根本不存在**。
- `_dsh-freedom-accept.json` 的 `towerPlacements[0] = { ok:false, reason:'not_placing' }`：
  Ctrl+左键点基地背包里的「箭塔」格**从未进入放置模式**（脚本先查格子再按 B，B 把背包关掉了 → 点空）。
  两座箭塔最后仍留在库存里（`arrowTower: 2`），`towerCheck.count = 0`。
- 同一 JSON 的 `final.buildings = []`、`defenseTowers = []`：连 P5 建成的熔炉在 t≈215 也已从
  `friendlyUnits` 消失，`production` 在 t=214.7 起全部 `reason:null/progress:0`。
- P6 结尾的 `Escape` **打开了暂停菜单**，游戏在 t=250.3 冻结；之后 P8 的「等入夜」循环空等 400 秒
  （`enteredNight:false`、`nightLog:[]`）。所以 `wallMinutes: 11` 不是真玩时长，首夜**从未验证**。

结论：上一轮真正成立的只有「G 框选采集 → 库存」「合成箭塔×2+熔炉」「熔炉落地并在 t≈200 运转过（progress 6.5/8）」。
自由建塔、耗能设施持续产出、首夜防守三项目前**没有有效证据**，本轮必须用真实 UI 重做。

### 本轮新查到的真实缺陷（诊断，程序化）

`scripts/.dsh-diag-furnace.mjs`（诊断：程序化放一座熔炉，只读采样 70 秒；**不作为实玩证据**）：
基地旁 (-2.8,47.4) 的熔炉被 **`wolf#3` 咬掉 24 点血**（t=4.3 起 `target=furnace#20`，距离 2-3m），
约 10 秒后狼回窝（home (-18,32)，`guardRadius 9`），熔炉随后自行恢复到 90/90。
→ 野生动物（西坡狼窝）在**开局头几秒就出现在基地空地**并攻击新建建筑；上一轮的 `guardRadius`
只覆盖了路边营地 goblin，**没有解释狼为什么会在开局离开 21m 外的领地进基地**。
正在用只读实时探针 `scripts/.dsh-probe-opening-v2.mjs`（75 秒、无注入、无建建筑）复核。

### 复核结果（只读、正常实时、无注入）

`_dsh-opening-v2.json` + `outputs/dsh-openv2-*.png`（75.6 秒真实时间，49 个采样）：
- 傀儡血量 **30/30 全程不变**，最近敌人 **15.4m**，`toBase < 16` 的入侵者 **0 个**，基地 50/50。
- → 上一轮对「开局 3 秒被接战」的修复（把北路哨卡移出基地空地 + 给路边营地/野生动物接上
  `guardRadius`/`homePoint`）**成立**：默认开局不再有敌人进基地空地。

`scripts/.dsh-diag-furnace2.mjs`（诊断；程序化放一座熔炉，只读采样 260 秒）：
- 熔炉全程 90/90 存活；只有开局 `wolf#3`（家 (-8,56)、领地 12m）在 t=3~11 咬过它，
  随后被基地激光打死。**没有"建筑莫名消失"的系统性缺陷**。
- 但结论也很清楚：**(-2.8,47.4) 这类"在供能范围内、离基地约 8m"的点落在 `wolf#3` 的 12m
  领地里**，玩家把熔炉/箭塔建在西北侧就会被野兽咬。这是保留的扩张风险，不是缺陷；
  但验收必须选**基地东/南侧不在任何敌人领地里的合法点**（本轮脚本已按此选点）。

### 本轮实现改动（最小必要项）

| 文件 | 改动 | 理由 |
|------|------|------|
| `src/systems/Game.js` | `setupSurvivalOpening()` 里把开局唯一的木傀儡默认遇敌策略设为 `avoid`（并 import `PUPPET_COMBAT_MODE`/`setPuppetCombatMode`） | handoff §2「初始工人优先经营」，复用现有三种策略，玩家随时可切回 |

### 本轮待办（执行顺序）

1. [x] 复核上一轮证据（已发现建塔/首夜证据无效）
2. [x] 只读复核开局接战（通过）
3. [x] 诊断耗能设施被摧毁的真实原因（wolf#3 领地，非缺陷）
4. [x] 开局工人默认策略改为避战
5. [ ] `scripts/.dsh-probe-freedom-accept2.mjs`：真实 UI 全链（自由选址 ×2 + 非法点拒绝 +
   耗能设施真实出料 + 首夜防守 + 打到 15 分钟）
6. [ ] `node --check` / `npm run build`（已过一次：190 modules，exit 0）
7. [ ] 写最终报告（含五项逐项、真实交互/程序化分开、截图绝对路径、遗留）

## 权威范围（来自 handoff）

### 1. 玩家自由选址（本轮新增）
- [ ] 去掉默认场景预设箭塔圈 + 「箭塔位」标签（不是改名/藏进帮助）
- [ ] 理解 `defenseSlot` 实际引用：保留敌军内部路线/集结逻辑，但不得限定/吸附/暗示玩家建筑位置
- [ ] 箭塔及同类防御建筑由玩家在合法地形自由选址；合法性由现有碰撞/地形/供能/建造范围/成本约束
- [ ] 移除对预设塔位的帮助文案及唯一槽位关联的奖励/放置依赖
- [ ] 若圈中某点确是真实危险预警 → 以真实危险事件触发，不能常驻成「箭塔位」
- [ ] 保留选中/放置预览，区分内部敌军路径点与玩家建筑
- [ ] 真实 UI 验证：≥2 个非原槽位合法位置放塔，选址不跳回槽位；非法位置仍被拒绝

### 2. 收口上轮未解决的开局接战
- [ ] 定位「约 3 秒唯一傀儡被敌军接战」的真实触发条件并修复
- [ ] 初始工人优先经营；玩家仍可主动切换战斗模式（复用现有模式，不加新系统）
- [ ] 若默认避战：验证不被敌军追到基地死循环，尊重玩家后续显式指令
- [ ] 开局有足够可达资源与安全经营空间（采集/运输/建造/供能/准备首夜防线）
- [ ] 不删除全部敌军/夜袭、不无限资源/无敌/免费军队/关战斗；保留扩张风险

### 3. 实际完成剩余体验验证（真实默认新游戏、实时键鼠）
- [ ] 选择傀儡 → G 框选资源 → 采集运输入库
- [ ] 合成装备与建筑 → 放置施工
- [ ] 耗能设施接电并**真实产出**（不是只看供能读数）
- [ ] 自选防御塔位置并准备首夜防守
- [ ] 覆盖 15–20 分钟或等效开局至首夜防守
- [ ] 初始库存买不起耗能设施 → 采集材料是待验流程本身

### 4. 边界与交付
- [ ] 不注入资源/瞬移/写内部状态/改 clock/补步进冒充实玩
- [ ] 诊断可程序化，但与实际交互证据分开记录
- [ ] 9235 隔离浏览器 + 真实硬件 WebGL renderer（无 --disable-gpu/WARP/SwiftShader）
- [ ] 不碰用户日常浏览器与现有服务
- [ ] 不清理/回滚用户改动；无 git commit/push/PR/部署/远程设置
- [ ] 不建嵌套代理
- [ ] UTF-8；有限超时；必要 node --check / npm run build
- [ ] 最终报告：自由选址前后行为、固定塔位移除、开局接战根因与调整、真实材料经济下耗能设施运行与首夜防守、真实操作时长、命令结果、截图绝对路径、完成/部分完成与遗留

## 待办清单（执行顺序）

1. [ ] 侦察：定位 defenseSlot / 箭塔位 / 预设塔圈的所有引用
2. [ ] 侦察：定位开局 3 秒接战的根因（敌军出生点、警戒半径、傀儡默认姿态）
3. [ ] 侦察：读取 DSH_PLAYABILITY_RESULT.md 的遗留项
4. [ ] 实现：自由选址
5. [ ] 实现：开局接战修复
6. [ ] 验证：node --check / npm run build
7. [ ] 验证：真实浏览器 UI 15–20 分钟开局
8. [ ] 报告：完成最终报告

## 侦察结论（代码 + 真实实时探针）

### `defenseSlot` 的真实引用（已全部查清）
| 位置 | 用途 | 本轮处置 |
|------|------|---------|
| `Game.placeDefenseSlotMarkers()` | 8 个地面琥珀圈 + 世界短标签「箭塔位」 | **删除** |
| `Game.updateDefenseSlotLabels()` | 每帧投影标签 | **删除** |
| `Game.defenseSnapPoint()` + `survivalExpansion.nearestDefenseSite/DEFENSE_SNAP_RADIUS` | 放置箭塔时把指针吸附到圈心 | **删除** |
| `Game.claimDefenseSite()` | 建成后 `slot.built=true`、收圈、发提示 | **删除** |
| `Game.raidDefenseSlot()` + `orderEnemyAttack()` | 夜袭单位先走到这个点再扑基地（**内部路线锚点**） | **保留**，与玩家建筑完全解耦 |
| `createWorld.placeResourceNodes` keepClear | 资源不压在锚点上 | **保留** |
| `survivalObjectiveInput.nests[].defenseBuilt` → `fieldCamps.defenseGapText` | 「北岬巢穴还没有箭塔」文案 | **删除**，改为不绑槽位的防御塔口径 |
| `HelpPanelUi`「基地旁的红圈」一节 | 教玩家圈是驻守点、箭塔能吸附 | **删除** |
| `styles.css .defense-slot-label` | 标签样式 | **删除** |

命名也会一起改：`defenseSlot` → `raidRally`（去掉 `building: 'arrowTower'` 与 `built`），
从字段名到数据都不再暗示"这是给玩家塔预留的位置"。

### 开局接战的真实根因（真实实时探针 `scripts/.dsh-probe-freedom-opening.mjs`）
不挂钩时钟、不注入、只读采样 30 秒：

| 时刻 | 真实观测 |
|------|---------|
| t=1.4s | 傀儡 `(-1.1,45.1)` 已被 `goblinSoldier` 锁住，最近敌人 **3.9m**，`planState='engaging'`，`workerCombatMode='fight'` |
| t=1.9s | 两只 `goblinSoldier` 到 `(-3.7,47.2)` / `(-6.6,49.9)`，`target=woodPuppet`，最近 **2.0m** |
| t=2.4s | 傀儡掉血 30 → 28.7 |
| t=4.5s | 两只哥布林被（基地激光 + 傀儡）打死后，最近敌人变成 10.5m 外的野狼 |

**根因**：
1. 「北路哨卡」路边营地原坐标 `(-8, 50)` 距基地 `(4,40)` 只有 **15.6m**，正落在
   基地开局空地 `clearings: {x:4,z:40,r:16}` 里面——出生点旁边就站着两个哥布林士兵。
2. `TargetingSystem.isCurrentTargetValid()` 第 118 行对敌方单位**永不脱战**：
   「接上目标后一直追，不因距离或离出生点多远脱战」。路边营地与野生动物没有
   任何领地/拴绳约束（`leashRadius`、wildlife 的 `radius` 字段被 normalize 后**从未接到行为上**），
   于是它们会一路追进基地，形成"被敌军追到基地死循环"。

### 处置方向（最小必要项）
- 营地守卫领地：复用既有但未接线的 `leashRadius` / wildlife `radius` → `unit.guardRadius` + `homePoint`；
  进入 `TargetingSystem` 的索敌与有效性判定，`UnitLogicSystem` 无目标时回家。
- 把「北路哨卡」移出基地空地（≥16m），并给路边营地一个守卫半径。
- 夜袭巢穴敌人（`spawnPointId` 来源）**不加领地**，仍会扑基地——保留夜袭压力。
- 傀儡默认遇敌策略保持现有 `fight`（自律模式下 `applyPuppetGear` 把 `aggroRange` 钉为 0，
  它不会主动找架打，只在被咬时自卫）——保留玩家可切换的现有三种模式，不加新系统。

## 证据

### 代码改动（已完成）
| 文件 | 改动 |
|------|------|
| `src/data/gameData.js` | 4 座内圈巢穴 `defenseSlot:{x,z,building:'arrowTower'}` → `raidRally:{x,z}` |
| `src/systems/survivalExpansion.js` | 外圈同改；删 `defenseSitesFromPoints`/`nearestDefenseSite`/`DEFENSE_SNAP_RADIUS`；三座路边营地加 `guardRadius`，北路哨卡 `(-8,50)` → `(-14,52)` |
| `src/systems/spawnPoints.js` | `normalizeDefenseSlot` → `normalizeRaidRally`（只留 x/z，去掉 `building`/`built`） |
| `src/systems/Game.js` | 删 `placeDefenseSlotMarkers`/`clearDefenseSlotMarkers`/`updateDefenseSlotLabels`/`claimDefenseSite`/`defenseSnapPoint`/`noticeRaidRallyPoint` 与两处每帧调用；`updatePlacementPreview`/`confirmPlacement` 去吸附；`raidDefenseSlot` → `raidRallyFor`；`spawnEnemyAt` 支持 `guardRadius`；`spawnFieldCamps`/`spawnWildlife` 接线守卫领地；`survivalObjectiveInput` 去掉 `defenseBuilt`、加 `hasDefenseTower` |
| `src/systems/TargetingSystem.js` | 新增 `isInsideGuardZone()`；索敌与目标有效性都按领地过滤 |
| `src/systems/UnitLogicSystem.js` | 有领地的敌方单位无目标时回自己的地盘 |
| `src/entities/UnitEntity.js` | 新增 `guardRadius = 0` |
| `src/systems/fieldCamps.js` | 防线文案不再绑巢穴槽位；`hasDefenseTower` 口径 |
| `src/systems/HelpPanelUi.js` | 删「基地旁的红圈」一节；建造节明确"塔建在哪由你决定" |
| `src/styles.css` | 删 `.defense-slot-label` |

### 单元测试（都在本机跑过）
| 脚本 | 结果 |
|------|------|
| `test-spawn-points.mjs` | 15/15 通过（新增 raidRally 白名单/旧字段清除断言） |
| `test-night-drive.mjs` | 4/4 通过 |
| `test-field-camps.mjs` | 3/3 通过（新增守卫领地与基地安全空间断言） |
| `test-island-terrain.mjs` | 16/16 通过 |
| `test-logistics-turing.mjs` | 全部通过（改为断言吸附 API 已删除） |
| `test-expedition.mjs` | 23/23 通过 |
| `test-targeting.mjs` | 通过（新增守卫领地判定断言） |
| `test-defense-survival.mjs` | 18/18 通过 |
| `npm run build` | exit 0，190 modules |

### 真实实时探针：开局接战（修前/修后）
`scripts/.dsh-probe-freedom-opening.mjs`，只读、无时钟挂钩、无注入：

| | 修前（本文件侦察节） | 修后 |
|---|---|---|
| t=1.4s 傀儡 | `planState='engaging'`，最近敌人 3.9m，hp 30 | `planState='idle'`，最近敌人 15.4m（野狼在领地内），hp 30 |
| t=2.4s | hp 30 → 28.7（被咬） | hp 30 不变 |
| t=42s | 两只哥布林冲进基地被打死 | 两只哥布林原地守在 `(-13.4,51.8)`/`(-13.9,52.6)`，距基地 21m |

### 真实实时实玩（`scripts/.dsh-probe-freedom-accept.mjs`）
进度检查点（`outputs/_dsh-freedom-*.png` + `C:/Users/A/.codex/tmp/dsh-opening-freedom-20261006/_dsh-freedom-accept.json`）：
- 真实 G 框选采集 173 秒 → 基地木 155 / 石 132（无注入）
- 真实 UI 合成：箭塔 ×2、熔炉 ×1
- 熔炉真实落地 `(-2.8,47.4)`：`inPowerRange:true`、`underConstruction:false`、`poweredDown:false`、`activityMana 24/24`
- 熔炉真实上料后 `production.statusOf().reason='working'`，`progress 1/8`，正在运转
- 待续：木炭产出、两座箭塔自选位置、首夜防守


## 关键约束备忘

- GPU 硬件加速，`9235` 端口隔离浏览器
- 禁止 `--disable-gpu` / WARP / SwiftShader / clock override
- 真实 UI 操作，禁止注入资源
- 保留旧报告 `DSH_PLAYABILITY_RESULT.md`（不覆盖）
