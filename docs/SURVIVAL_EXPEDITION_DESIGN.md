# 海岛生存：远征与区域成长（设计与实际完成状态）

- 设计：Codex（`DSH_GAMEPLAY_HANDOFF.md` 内嵌的《海岛生存：远征与区域成长设计 2026-10-04》）
- 实现 / 测试 / 修复 / 验收：DSH / commandcode / deepseek-v4.1-flash，记录日期 2026-10-05
- 分支：`cursor/cloud-agent-1790593832279-e92v8`。**全部改动未提交**，因此本轮不递增 `GAME_VERSION`、不维护玩家更新日志。
- 本文记录**已经落地并有验收证据**的部分，以及**明确未做 / 已知失败**的部分。
  与 `DSH_GAMEPLAY_HANDOFF.md` 里的方案描述冲突时，以本文记录的代码现状与实测结果为准。

---

## 1. 一句话状态

四条远征路线（北 / 西 / 东 / 南）、区域图纸门槛、四项新科技的真实效果、夜袭预报与清线回报
**全部落地**；远征系统的端到端浏览器验收 **30 项判据全通过**（`ISLAND EXPEDITION: PASS`），
纯规则回归 **23/23 通过**，`npm run build` 通过，本轮直接相关的旧验收（熔炉生产链、昼夜夜袭）
中被发现的两处**过期夹具**已修好并重新转绿。

本轮**没有**引入新货币、额外刷兵、节日夜、无尽刷新或自动"一键完成"。

---

## 2. 数据入口与模块边界

| 关注点 | 位置 | 说明 |
| --- | --- | --- |
| 路线数据 | `src/data/gameData.js` → `SURVIVAL_EXPEDITIONS` | 只写路线 id / 内巢 id / 外巢 id / 科技 id / 一句策略；敌名、掉落、招募、图纸名一律现读 |
| 四项新科技 | `src/data/gameData.js` → `TECH_DEFINITIONS.{towerCalibration,woodlandLogistics,armsMaintenance,charcoalBellows}` | 新增 `requiresNestId`（区域图纸门槛）与 `effects.{attributes,harvest,production}` |
| 纯规则 | `src/systems/expedition.js` | 阶段推导、展示数据、装备判断、目标句、夜袭预报。不碰 THREE / DOM / Game |
| 运行时 | `src/systems/ExpeditionSystem.js` | 0.5 秒采样、追踪 id 落盘、只移动相机、清巢当帧提示 |
| 面板 | `src/systems/ExpeditionPanelUi.js` + `src/expedition.css` | 可收起、非暂停、closed 不建 DOM、签名变了才重画 |
| 科技规则 | `src/systems/research.js` | `normalizeTech` 显式保留 `requiresNestId`；`missingBlueprint` / `unitTechModifiersFor` / `productionPatchFor` |
| 科技运行时 | `src/systems/ResearchSystem.js` | 原子扣费、`reasonLabel`、按唯一 source 幂等挂载属性 |
| 接线 | `src/systems/Game.js` | `this.expeditions`（第 1280 行附近）、`this.expeditionPanel`、tick 内每帧采样（不在 HUD 节流内）、清巢回调 `onSpawnPointCleared` |

### 2.1 路线与真实点位

| 路线 | 内巢 → 外巢 | 图纸科技 | 敌型（现读） |
| --- | --- | --- | --- |
| 北岬线 | `island-camp-north` → `island-outer-north` | 哨站测距 | 哥布林士兵 / 蜘蛛 → 盾卫 / 巫师 |
| 西岭线 | `island-west-ridge` → `island-outer-northwest` | 林地采运 | 哥布林士兵 / 射手 / 野狼 → 狼 / 熊 |
| 东岬线 | `island-east-cape` → `island-outer-east` | 军械保养 | 哥布林士兵 / 射手 / 盾卫 → 射手 / 毒弓手 |
| 南林线 | `island-south-woods` → `island-outer-southwest` | 炭窑鼓风 | 哥布林士兵 / 猎手 / 食人魔 → 猎手 / 食人魔 |

阶段由点位真实 `cleared` 推导：内巢未清 → 外巢可进攻 → 全线清除。
外巢即使仍被 `gateNestId` 封印也能被打，UI 如实显示当前要打的**那个**点位的数据。

### 2.2 四项科技的实际效果

| 科技 | 消耗 | 效果 | 落点 |
| --- | --- | --- | --- |
| 哨站测距 | 木 18 + 铁 8 + 石 16 | 己方 `arrowTower` / `ballista` 的 `attackRange +1.5`（add 型修正） | `unitTechModifiersFor` → `AttributeSet` |
| 林地采运 | 木 24 + 纤维 16 + 石 12 | 每次采集动作 +1，与「采集效率」的 +2 相加（5 → 8） | `harvestPerActionBonus` |
| 军械保养 | 铁 12 + 炭 8 + 纤维 16 | 己方**移动且带武器**单位的 `durabilityCost × 0.8` | `unitTechModifiersFor`（`mobileOnly` + `excludeBuildings` + `weaponOnly`） |
| 炭窑鼓风 | 石 20 + 铁 12 + 炭 12 | 烧炭配方周期 8 → 6 秒，投入/产出不变 | `productionPatchFor` → `applyProductionPatch` |

工具磨损（`WorkSystem.spendWorkerToolWear`）直接扣 `slot.data.durability`，与
`attributes.durabilityCost` 不是同一条路，所以军械保养**不会**改变采集扣耗——这一点由
浏览器验收里"同一动作在有无军械保养下各量一次"的对照证明。

---

## 3. 本轮修掉的真实缺陷（不是改断言）

1. **自带武器的战斗单位被误判成"没有武器"**（`ExpeditionSystem.loadoutDescriptors`）。
   旧写法读 `unit.definition.weapon.damage`；而权威字段是
   `UNIT_DEFINITIONS[type].damage / physicalAttack / magicAttack`。
   实测：`weapon.damage` 对 `raider / archer / spearman / swordsman / towerShield / shieldBearer`
   **全部为 0 或 undefined**（6/6 误判）。后果是玩家已经招到弓兵/蛮兵了，HUD 还在喊"先给傀儡做木棒"。
   现在映射收敛到一个纯函数 `loadoutDescriptorFor` + `nativeWeaponDamage`，运行时与纯测试共用同一份；
   浏览器验收用**真实招募来的塔盾兵**证明：`nativeWeaponDamage = 5`、旧公式 `= 0`，且 HUD 不再催做木棒。
2. **熔炉进料格装料整笔失败**（验收夹具）。进料格只有 1 格、单格上限 200，而
   `Inventory.add` 默认"整笔成功或整笔失败"，旧夹具 `add('wood', 400)` 结果 `added = 0`：
   进料格恒为空 → `ProductionSystem` 报 `no_input` → `record.recipe` 为 `null` →
   读 `recipe.seconds` 抛 `Cannot read properties of null`，把基线阶段整段打断。
   修法是显式 `allowPartial` 并记录实际装料量，同时把"配方到底有没有解析出来"记成
   布尔判据（`recipeRegisteredBefore/After`）——**没有**用可选链把缺失的配方读成 `null` 蒙混过去。
3. **扣费差值符号混用**。研究阶段的 `costDeltas` 用 `after - before`，而采集效率那项用
   `before - after`，判据又照抄了错符号。现在统一为 `after - before`（花掉是负数），
   四项新科技与「采集效率」的扣费都按真实差值断言（-18/-8/-16、-24/-16/-12、-12/-8/-16、
   -20/-12/-12、-40/-25）。
4. **清线残兵实验的前置污染**。旧顺序是"先留残兵，再拆外巢"：内巢一拆，外巢就解除封印，
   在之前那几个阶段里一直出兵，这些兵混进来会让"只剩我们故意留的残兵"这条断言失真
   （旧结果 `westAliveAfter: 3`、`westOnlyResidual: false`）。现在先整条线清干净、
   把这条线上已在场的敌人清掉并记下数量，从已知状态开始留 2 个残兵。
5. **烧炭周期被供能停顿污染**。炭窑鼓风研究成功后，墙钟读数仍是 7.65 秒/周期，
   原因是这一段里熔炉的 `activityMana` 被共享的基地功率抽干，中途出现 112 tick 的 `no_power`
   停顿（配方本身已经是 6 秒）。现在周期测量把进度归零、这一段持续保证供能，
   并断言 `stalledTicks === 0`；"供能够不够"由 `verify-island-power` / `verify-island-fuel-power` 覆盖。
6. **两处过期夹具**（同一类：站点改造把熔炉拆成"进料格 / 燃料格 / 产出格"之后没有跟着改）：
   - `scripts/verify-island-tech-effects.mjs`：旧夹具把木材塞进基地背包、从基地背包量木炭，
     研究完成后 `cycles 0`、`stalledTicks 3932`。现在装进熔炉自己的进料格与燃料格，断言一条未减。
   - `scripts/verify-island-production.mjs`：只装进料不装燃料，永远停在 `no_fuel`。现在补上燃料，
     并在"缺料停摆"那一步显式清空**进料格**（燃料仍满），所以停摆原因真的是 `no_input`。
7. **`verify-island-day-night.mjs` 的两条量错了对象**（记录旧假设与新口径）：
   - `laterNightMore` 旧写法比"场上总数"（第 1 夜 10 个 vs 第 2 夜 4 个）。但第 1 夜是从
     开局就存在的 6 个驻军涨上来的、第 2 夜从 0 涨上来，两者基线不同；按**新刷出量**量是
     4 vs 4，与当前设计（`dayNight.js`：只抬难度、不再加数量）一致。
   - `noSpawnByDay` 旧写法要求 `afterDay === beforeDay`（严格相等）。白天一只驻军被打死就会
     让数量掉下来，于是被误判成"白天刷怪"。现在量的是"有没有新 id 出现 + 刷怪点出兵计数有没有涨"。

---

## 4. 验收证据（命令与结果）

浏览器：自建 headless Chromium / CDP `127.0.0.1:9235`（独立 user-data-dir），
复用本地 dev server `http://127.0.0.1:3000/`。所有命令在 `F:/WebProjects/WebVillageWar` 下执行。

| 命令 | 结果 |
| --- | --- |
| `node --check` 全部 51 个改动/新增的 `.js` / `.mjs` | 0 失败 |
| `npm run build` | `✓ built in 959ms`，180 个模块，仅有既存的 chunk 体积警告 |
| `node scripts/test-expedition.mjs` | **23/23 通过** |
| 全部 `test:*` 单元脚本（73 个） | 66 通过，7 个**既存失败**（见第 5 节，与本轮改动无关） |
| `node scripts/verify-island-expedition.mjs` | **ISLAND EXPEDITION: PASS**（30 项判据全 true、`errors` 空、页面 `problems` 空） |
| `node scripts/verify-island-tech-effects.mjs` | ISLAND TECH EFFECTS: **PASS**（修复过期夹具后转绿） |
| `node scripts/verify-island-production.mjs` | ISLAND PRODUCTION: **PASS**（修复过期夹具后转绿） |
| `node scripts/verify-island-day-night.mjs` | ISLAND DAY NIGHT: **PASS**（改成量新刷出量 / 新 id 后转绿） |
| `CHECK_CDP_PORT=9235 node scripts/check-game-boot.mjs` | exit 0，`page problems: 0` |
| `node scripts/check-dangling-calls.mjs src/systems/Game.js` | 疑似悬空调用 0 个名字 |
| `node scripts/verify-island-victory.mjs` | PASS（8 巢 + 残敌通关路径未被破坏） |
| `node scripts/verify-field-recruit.mjs` | PASS（野外招募链路未被破坏） |

`verify-island-expedition.mjs` 的 30 项判据（全部 true）：

```
booted, openingFacts, panelLazyAndOpens, panelShowsRealRouteData, openingObjective,
forecastMatchesGateTruth, trackingWorks, focusOnlyMovesCamera, moveCommandsUnaffected,
samplingFrameRateIndependent, blueprintGate, baselineMeasured, researchGatedByNests,
researchSpendsExactly, repeatResearchFree, towerCalibrationEffect, woodlandLogisticsEffect,
armsMaintenanceEffect, armsMaintenanceIdempotent, armsMaintenanceRecruit,
charcoalBellowsEffect, nativeWeaponLoadout, toolWearUnchanged, clearedLineStopsSpawns,
clearedRouteFocusDisabled, residualAndVictoryRetained, mobileLayout, escapeAndBackpack,
panelDomStability, restartLifecycle
```

关键实测值（取自最后一次通过的运行）：

- 开局：1 木傀儡、0 战斗护卫、8 刷怪点、3 野外营地；目标句要求先合成并装备傀儡木棒，
  且**没有**催去单挑营地。
- 夜袭预报：`正在威胁基地 4 座 · 被内巢封印 4 座 · 已清除 0/8 座`，与 `gateNestId` 真实状态一致。
- 追踪西岭线 → 点「查看位置」：`cameraFollowEnabled` 由 true 变 false，镜头落在西岭哨站 ±12 内，
  选中集合与所有单位 `moveGoal` 不变、镜头仍在战场边界内；
  面板开着 + 追踪生效时真实下达移动命令仍然生效（自治傀儡走 `work.beginRally`：
  `rallyBefore "none" → rallyAfter "7.5,36.5@moving"`，面板仍开、追踪仍是 `west`）。
- 采样与帧率无关：60fps 与 144fps 各自推进 0.5 秒都只重建 1 次。
- 图纸门槛：无权威来源时 `missing_blueprint`，文案是「还没有区域图纸：先拆掉北岬巢穴」，
  不扣任何材料；拆掉**无关**的南林深处后仍然锁着；拆掉北岬巢穴后 `blueprint.ready = true`
  且追踪目标自动换成北岬盾巢，HUD 同时给出"解除封印、这个方向开始出新兵"的警告。
- 原子扣费（`after - before`）：
  `towerCalibration {wood:-18, iron:-8, stone:-16}`、
  `woodlandLogistics {wood:-24, fiber:-16, stone:-12}`、
  `armsMaintenance {iron:-12, charcoal:-8, fiber:-16}`、
  `charcoalBellows {stone:-20, iron:-12, charcoal:-12}`；
  重复研究 `already_researched` 且库存逐字节不变；「采集效率」`{wood:-40, fiber:-25}`。
- 哨站测距：既有箭塔 9.2 → 10.7，新建弩炮 15.0（= 13.5 + 1.5），熔炉 `attackRange = 0`（不适用建筑不受影响）；
  当场重新生成的敌方剑士 `durabilityCost = 1.15 = definition`（敌人不享受）。
- 林地采运：采集动作产出 5 → 8，`harvestBonus = 3`。
- 军械保养：`getDurabilityCost` 1.15 → 0.92，真实攻击实测掉 0.92；
  连挂 3 次 / 全量刷新 / `applySnapshot` / 换武器（wornSword）/ 再次 `applySnapshot` 全是 0.92；
  `reset()` 后回到 1.15（证明是科技在生效、不是把定义改了）；`maxDurability` 未变；
  招募归队的塔盾兵 0.68 = 1.15 × 0.8 × …（实测与期望一致）。
- 工具磨损对照：有军械保养 1、无军械保养 1、规则值 1，`unchanged = true`。
- 炭窑鼓风：配方 8 → 6 秒（`recipeSecondsAfter = 6`、`recipeRegisteredAfter = true`），
  实测 6.05 秒/周期、产出 2、投入 4、燃料 2、`stalledTicks = 0`；
  叠上「高效烧炭」后产出 3、周期仍 6 秒。
- 清线回报：西线两点清完后运行 80 tick，只有我们留的 2 个残兵还在（`westNewUnits = 0`、
  `westOnlyResidual = true`），北岬盾巢作为对照照常出兵（`controlPointSpawned = true`）；
  预报把西线列进 `safeRoutes`；残兵在场时 `checkVictory()` 仍为 false。
- 清完整线后：西岭线卡片 `stateLabel = 全线清除`、`targetX = null`、「查看位置」按钮 `disabled`、
  `focusRoute('west')` 返回 `{ok:false, reason:'no_target'}` 且镜头坐标一格没动。
- 面板 DOM：关闭后根节点仍是同一个（只是 `hidden`），`refresh()` 在关闭时与内容未变时都返回 false
  且不换节点；重开后卡片文本一致。
- 布局：1280×720 与 390×844（2x）截图已自查；手机端文档无横向溢出、面板整体在视口内、
  卡片文字不溢出、列表可滚动。
- 生命周期：Esc 收起且不暂停、B 键规则不变、暂停后继续面板照常、重开后面板根节点 0 → 打开 1 个、
  `destroy()` 后 0 个且按钮隐藏。

### 4.1 截图（绝对路径）

- `C:\WebProjects\WebVillageWar\outputs\expedition-desktop-1280x720.png`
- `C:\WebProjects\WebVillageWar\outputs\expedition-mobile-390x844.png`

说明：脚本沿用同目录下其它验收脚本既有的产物目录写法（硬编码
`C:/WebProjects/WebVillageWar/outputs`，那是仓库早先位于 C 盘时的历史路径）。
图片内容就是 `http://127.0.0.1:3000/` 上真实运行的页面，与截图落地位置无关。
仓库自带的 `F:/WebProjects/WebVillageWar/outputs/` 下只有另外三个脚本（用相对路径）写的图。

---

## 5. 已知未解决 / 本轮未处理

1. **7 个既存单元测试失败**，全部落在本轮没有碰过的子系统，来自工作树里**未提交**的
   站点/运输/物品改造：
   `test:backpack-ui`（31/34，源码正则断言与 UI 结构）、`test:drops`（9/10）、
   `test:facilities`（7/8，供能停机）、`test:inventory`（14/17，`resourceNodeId`）、
   `test:inventory-transfer`（16/18，单格上限期望 200 而运行时是 64）、
   `test:passive-durability`、`test:worker-recharge`（该脚本长时间不退出，被手动结束）。
   本轮一共只改了 8 个文件：`src/systems/expedition.js`、`src/systems/ExpeditionSystem.js`、
   `src/systems/ExpeditionPanelUi.js`、`scripts/test-expedition.mjs`、`scripts/verify-island-expedition.mjs`、
   `scripts/verify-island-tech-effects.mjs`、`scripts/verify-island-production.mjs`、
   `scripts/verify-island-day-night.mjs`。这些失败脚本都不 import 它们。
2. **4 个既存浏览器验收仍红**，同样与本轮无关，且都能指出过期原因：
   - `verify-island-spawn-points`：夹具硬编码"4 个刷怪点"（现在是 8 个），
     并把野外营地（`fieldCamps.js`）刷出的野狼算成"没有归属点位的孤儿敌人"。
   - `verify-island-research`：附魔 / 魔力石相关判据（`stoneIsSingleItem`、`enchantListingWorks` 等）过期。
   - `verify-island-puppet-combat`：`unarmedFlees` / `toolOnlyAlsoFlees` / `prefersLowThreatNode` 几条逃跑判据过期。
   - `verify-island-recruit-source`：仅 `workerMenuShowsBackpackAndStop` 一条过期（单位扇形菜单的背包/停止入口）。
   这几项属于别的轮次（物品、营地、战斗逃跑、扇形菜单），本轮按"不做无关扩展"的原则没有改。
3. **`night1Count` 之类的总数口径**：`nightRaidModifiers` 现在恒返回 `extraAlive 0 / extraPerTick 0`
   （`dayNight.js` 明确写"只抬难度，不再加数量"），所以面板只在非零时才显示"存活上限 / 每批"，
   避免暗示一条并不存在的加成。要让后一夜真的"更多兵"，得先改 `DAY_NIGHT_RULES`——
   那属于平衡决策，本轮不动。
4. **熔炉不会从基地自动进料**：玩家要么用运输线把木料送进熔炉进料格，要么在站点面板手动装。
   这是工作树里站点改造的既定行为（不是本轮引入），但也是上面多条夹具过期的同一个根因；
   是否恢复"基地自动供料"需要单独的设计决定。
5. **本轮未做真机触屏手势验收**：手机布局只做了 390×844 的渲染与几何断言（无横向溢出、
   面板在视口内、卡片不溢出、列表可滚动），没有在真实触摸设备上验证拖拽与缩放。
6. **未做压力验收**：本轮没有在"大量单位 + 大量特效同屏"下测远征采样开销。
   已知采样是 0.5 秒一次、且只在 `rebuild()` 时读一次 `friendlyUnits`，
   但缺少同屏单位数很大时的实测帧时间。

---

## 6. 下一轮可选设计（不承诺）

1. **把过期夹具清一轮**：第 5 节列的 4 个浏览器验收 + 7 个单元脚本，需要的都是"跟上当前实现"
   而不是新功能；建议单独一轮专门做，避免和玩法改动混在一起。
2. **远征路线与运输/后勤联动**：清掉一条线后，可以在该线上开一条更短的补给线（例如外巢旧址当临时仓），
   让"打下来"直接变成"用得上"。当前只有图纸与停止出兵两种回报。
3. **图纸的第二层**：现在四项科技都是"清内巢 → 研究一次"。可以让外巢也挂一张图纸，
   给同一条线一个后期升级（例如哨站测距 II：+2.5m 或加暴击），但必须先确认不会变成纯数值膨胀。
4. **远征板上的敌群难度预估**：把 `nightRaidModifiers` 与实际点位 `enemyPool` 的权重合成一个
   "这一趟大概要带几支兵"的粗估，帮助玩家决定装备是否够。需要先有可信的兵力评估函数。
5. **夜袭预报与野外营地合并**：营地（`fieldCamps.js`）与刷怪点在提示层是两套口径，
   目前只统一了"防线缺口"那一句。可以把营地的残余敌人也纳入预报，让"还有谁在出兵"只有一个答案。

---

## 7. 本轮明确不做的事

- 不恢复卡牌、旧波次、商店或军需铺。
- 不新增背包物品、不做随机掉率来代表"图纸"；权威事实就是 `spawnPoints.points[].cleared`。
- 不消费深邃核心、不改既有科技门槛、不免费赠 buff。
- 不引入额外刷兵、节日夜、无尽重复刷新或新货币。
- 不改 `DAY_NIGHT_RULES` 的难度/人数曲线。
- 不提交、不推送、不建 PR、不部署公网，因此不改 `GAME_VERSION`、不写玩家更新日志。
