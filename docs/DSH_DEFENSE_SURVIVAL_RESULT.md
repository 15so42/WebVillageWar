# DSH 执行结果：防御终端、维修调度、扩张压力与资源续航

> **状态：已完成（终版报告，2026-10-05 第二轮第四次续跑收尾）**
> 任务书：`docs/DSH_DEFENSE_SURVIVAL_DESIGN.md` + `docs/DSH_RESOURCE_SUSTAINABILITY.md`。
> 仓库：`F:/WebProjects/WebVillageWar`。执行模型：deepseek/deepseek-v4.1-flash。编码：UTF-8。
> 本轮为**续跑**：前三次执行被外部中断（HTTP 400、HTTP 400、2026-10-05 21:03 超时），
> 工作树与既有实现全部保留，本轮只补齐缺失的验证与文档，不重启已完成工作、不扩大范围。

## 0. 续跑说明与本轮实际做了什么

前几次中断前已经完成大部分实现，并在 `outputs/` 留下证据。本轮（21:41 起）的实际工作：

1. 复核既有证据，发现**一个关键缺口**：`scripts/verify-island-defense-survival.mjs` 在 `21:01:47` 被修改过，
   而最后一次浏览器验收是 `20:52:35`（**改之前**）。也就是说 20:52 的 PASS **不覆盖当前脚本**，
   因为该次改动之后紧接着就是 21:03 的超时中断，改动从未被验证过。→ 本轮重跑浏览器验收。
2. 跑 `node --check`（本轮 21 个源文件）与确认 `npm run build`。
3. 在**当前工作树**上重跑 6 个既存失败，取得当前证据而非引用旧日志。
4. 把未注册的 `scripts/test-midgame-content.mjs` 注册进 `package.json`（它一直在通过，但从不被执行）。
5. 把本文件从"进行中"改写为终版报告。

### 对上一版 checkpoint 的一处更正

上一版 checkpoint 写"浏览器验收 87 项全部 true"。实测该 PASS 报告的 `verdict` 对象是 **79 个键**，
不是 87。正确的说法是：**79 项判据全部 true，`problems: []`**。本报告以下数据均以实测为准。

## 1. 命令与结果（本轮在当前工作树上实测）

| # | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | `node --check` × 21 个本轮相关源文件 | **21/21 ok，0 失败** | 本报告第 1.1 节 |
| 2 | `npm run build`（vite build） | **✓ built in 1.00s**，188 modules | `outputs/_build-check.log`（21:34:55） |
| 2b | `npm run build`（注册 `test:midgame-content` **之后**复跑） | **✓ built in 892ms，exit 0**，产物 hash 不变 | `outputs/_build-check-post-edit.log`（22:14:35） |
| 3 | 相关单元测试 30 项（带 90s 单项超时） | **30 PASS / 0 FAIL** | `outputs/_unit-round3.log`（21:35:37） |
| 4 | 全量单元套件 77 项 | 71 PASS / **6 FAIL（全部为既存）** | `outputs/_unit-suite.log`（20:35:49） |
| 5 | 6 个既存失败在当前树上重跑 | **失败集合与计数完全一致** | `outputs/_unit-preexisting-recheck.log`（22:08:03） |
| 6 | `node scripts/test-midgame-content.mjs` | **6/6 通过**（已注册为 `test:midgame-content`） | 本报告第 1.3 节 |
| 7 | **浏览器端到端验收** `scripts/verify-island-defense-survival.mjs` | **79/79 true，problems `[]`，PASS** | `outputs/_verify-defense-6.log`（22:05:23） |

### 1.1 语法检查（本轮相关 21 个文件，全部 ok）

`src/data/defenseTiers.js`、`src/data/gameData.js`、`src/systems/TowerUpgradeSystem.js`、
`src/systems/TowerPanelUi.js`、`src/systems/RepairDispatchSystem.js`、`src/systems/buildingRepair.js`、
`src/systems/armyNeeds.js`、`src/systems/ArmyNeedsSystem.js`、`src/systems/SalvageSystem.js`、
`src/systems/survivalExpansion.js`、`src/systems/Game.js`、`src/systems/AttackSystem.js`、
`src/systems/UnitActionMenu.js`、`src/systems/BuildingSystem.js`、`src/systems/FacilitySystem.js`、
`src/systems/ProductionSystem.js`、`src/systems/PlantingSystem.js`、`src/systems/ResourceNodeSystem.js`、
`src/systems/WorkSystem.js`、`src/systems/UnitLogicSystem.js`、`src/world/createWorld.js`。

另有 `test:scripts-syntax`（对 `scripts/` 下**全部** `.mjs` 过 `node --check`，含验收脚本）
在本轮 30 项子集中 PASS（`15437ms`）。

### 1.2 相关单元测试 30 项（`outputs/_unit-round3.log`，全部 PASS）

本轮直接新增/相关的 5 项判据数：`test:defense-survival` 18/18、`test:building-repair` 19/19、
`test:army-needs` 15/15、`test:power-budget` 8/8、`test:night-drive` 夜袭驱动 4/4。

同批一起复核通过的回归：`test:expedition` 23/23、`test:facilities` 8/8、`test:logistics-turing`、
`test:field-camps` 3/3、`test:enchant-stones` 5/5、`test:production` 8/8、`test:research` 17/17、
`test:planting` 9/9、`test:resource-nodes` 15/15、`test:transport` 5/5、`test:work-orders` 15/15、
`test:power` 16/16、`test:player-base`、`test:scripts-syntax`、`test:crafting` 19/19、
`test:weapons` 11/11、`test:item-use` 7/7、`test:mana-stones` 10/10、`test:rune-stones`、
`test:spawn-points` 15/15、`test:work-priority` 11/11、`test:work-tasks`、`test:combat-plan`、
`test:threat-field`、`test:building-range-ring`。

> 注：`test:facilities` 在上一轮 `DSH_GAMEPLAY_RESULT.md` 里是**失败**项，本轮已通过——
> 既存失败从 7 项降到 6 项，是净改善，不是回归。

### 1.3 未注册测试的归属与处理

`scripts/test-midgame-content.mjs`（创建于 2026-10-04，属**上一轮**中段内容，非本轮新增）
测的是锻造/铁工具/弩炮/附魔/外圈巢穴，一直通过但**从未注册进 `package.json`**，
因此从不出现在 `npm run regression` 或全量套件里。本轮已注册为 `test:midgame-content`：

```
"test:midgame-content": "node scripts/test-midgame-content.mjs",
```

注册后 `test:*` 键从 77 增至 78；单独运行 **6/6 通过，exit 0**（含"弩炮比箭塔打得重、射得慢"，
与本节防御终端设计直接相关）。改动仅 1 行，`package.json` 无 BOM、保持 CRLF。

## 2. 浏览器端到端验收（本轮重跑，关键证据）

```
ISLAND DEFENSE SURVIVAL: PASS
started = true
checks  = 79    failed = 0    problems = []
```

环境（自建、隔离，未触碰用户日常浏览器）：headless Chrome `154.0.8037.95`，
CDP `127.0.0.1:9235`，独立 `--user-data-dir=C:\Users\A\.codex\tmp\dsh-dsv-20261005\chrome-profile`，
复用已在运行的本地 dev server `http://127.0.0.1:3000/`。本轮单次运行耗时约 22 分钟
（21:43:28 → 22:05:23）。

### 2.1 截图（本轮全部重新生成，绝对路径）

| 路径 | 时间 |
| --- | --- |
| `F:/WebProjects/WebVillageWar/outputs/dsv-towers-1280x720.png` | 21:47:20 |
| `F:/WebProjects/WebVillageWar/outputs/dsv-tower-tiers-1280x720.png` | 21:47:22 |
| `F:/WebProjects/WebVillageWar/outputs/dsv-tower-panel-1280x720.png` | 22:05:19 |
| `F:/WebProjects/WebVillageWar/outputs/dsv-tower-panel-390x844.png` | 22:05:21 |
| `F:/WebProjects/WebVillageWar/outputs/dsv-defense-line-1280x720.png` | 22:05:23 |

## 3. 最终参数表

### 3.1 防御终端：三级倍率（`src/data/defenseTiers.js`）

倍率**相对一级**，绝对值写死（不在二级上再乘），全部采用设计文档起点值，实测后未改动：

| 等级 | 生命 | 伤害 | 射程 | 功率 |
| --- | --- | --- | --- | --- |
| I | ×1 | ×1 | +0 | ×1 |
| II | ×1.3 | ×1.2 | +0.4 | ×1.2 |
| III | ×1.6 | ×1.45 | +0.8 | ×1.45 |

### 3.2 一级基准与实测三级绝对值

| 类型 | 生命 | 伤害 | 伤害类型 | 射程 | 攻速(间隔) | 功率 | 魔容 | 每发耗魔 | 溅射 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 箭塔 | 54 | 7 | 物理 | 9.2 | 1.08 (≈0.93s) | 3.6 | 30 | 2.0 | — |
| 弩炮 | 78 | 16 | 物理 | 13.5 | 0.42 (≈2.38s) | 4.86 | 36 | 3.5 | — |
| 震荡塔 | 58 | 5.6 | **魔法** | 10 | 0.4 (**2.5s**) | **6.48** | 48 | **3.6** | r=2.2 |

震荡塔其余溅射参数：副目标伤害 ×0.55、减速 0.7s 且**上限 25%**、最多 6 目标、VFX 半径 2.2（与真实作用半径一致）。
`shockPowerIs1_8x` 判据实测：3.6 / 2.0 = **1.8**（相对同级箭塔，含在基准里，等级倍率不再重复乘）。

浏览器实测的升级结果（`arrowTower`）：

| 项 | I | II | III |
| --- | --- | --- | --- |
| 单位类型 | `arrowTower` | `arrowTowerII` | `arrowTowerIII` |
| maxHealth | 54 | **70** (54×1.3=70.2) | **86** (54×1.6=86.4) |
| physicalAttack | 7 | — | **10.2** (7×1.45=10.15) |
| attackRange | 9.2 | — | **10.0** (9.2+0.8) |
| manaCapacity | 30 | 36 | 44 |
| manaPerShot | 2 | 2.4 | 2.9 |

取整规则：生命取整（`Math.round`）、伤害/射程/功率保留一位小数（`round1`）——
功率取整会把 1/1.2/1.45 压成同两个整数，等级差异会在数值上消失。

### 3.3 升级成本、施工与资格

| 类型 | 建造（一级） | II 级升级 | III 级升级 |
| --- | --- | --- | --- |
| 箭塔 | 木25 / 石20 | 木14 / 石10 / 铁4 | 木24 / 石22 / 铁10 / 木炭8 |
| 弩炮 | 木18 / 石24 / 铁8 | 木10 / 石14 / 铁8 / 木炭4 | 木18 / 石24 / 铁16 / 木炭12 |
| 震荡塔 | 木22 / 石16 / 铁4 | 木12 / 石12 / 铁6 | 木20 / 石20 / 铁14 / 木炭10 |

- 施工时间 **12 秒**（`TOWER_UPGRADE_SECONDS`），期间该塔**停火**；被攻击则暂停施工、保留进度。
- 资格：II 级需**完工的科研站**；III 级需**本类 II 级 + 对应路线全线清除 + 完工科研站**。
  路线绑定：箭塔→东岬线，弩炮→北岬线，震荡塔→南林线。
- 逐级投资、原子扣除；跳级/施工中重复付费/满级再点均被拒且**不扣费**（实测 `spent=10, refunded=10`，整笔退回）。
- 升级只夹到新上限，**不自动填满**：实测 `activityManaKept=36`、`manaCapacity=36`；反复 `refreshUnitManaCapacity` / `applyTeamUpgradesToUnit` / `status()` 后属性不变（`noStacking=true`）。

### 3.4 等级/类型的模型差异（拒绝换皮充当差异）

浏览器实测 3 类 × 3 级的网格数 / 高度 / 单件几何体占地：

| 类型 | I | II | III |
| --- | --- | --- | --- |
| 箭塔 | 21 网格 / h3.86 / fp2.16 | 28 / h3.86 / fp2.16 | 33 / **h4.12** / **fp2.32** |
| 弩炮 | 18 / h3.26 / fp1.84 | 25 / h3.26 / fp1.84 | 30 / **h3.59** / **fp2.32** |
| 震荡塔 | 21 / h4.27 / fp1.84 | 32 / h4.27 / fp1.84 | 37 / **h4.53** / **fp2.32** |

判据 `tiersDifferStructurally` / `typesDifferAtEachTier` / `tierScalesUpward` 全部 true——
同级跨类型结构不同，同类型跨等级结构不同且不退化（网格数、高度单调不减）。

### 3.5 脱战维修（`src/systems/buildingRepair.js`）

| 参数 | 值 |
| --- | --- |
| 脱战判定 `outOfCombatSeconds` | 8 秒 |
| 登记采样 `sampleSeconds` | 0.5 秒 |
| 每材料修复生命 `healthPerMaterial` | 8 点 |
| 每材料修复耐久 `durabilityPerMaterial` | 6 点 |
| 单批最多材料 `maxMaterialsPerBatch` | 2 |
| 单批施工 `batchSeconds` | 1.2 秒 |
| 傀儡够得着距离 `repairRange` | 3.4 米 |
| 急修阈值 `urgentHealthRatio` | 生命 < **35%** |
| 耐久登记门槛 `minDurabilityRatio` | 0.5 |
| 等待权重 `waitBonusSeconds` / `waitCreditPerSecond` | 150 秒 / 1 |
| 重要度权重 / 急修插队 / 缺损权重 / 距离权重 | 10 / 30 / 30 / 1 |

**重要度**（数字越小越先做）：基地 0 → 魔力炉·熔炉 1 → 三种防塔 3 → 食堂·菜圃·树坑 4 →
维修站·科研站·附魔台·采石场·深矿井 5 → 手工台·箱子 6（默认 6）。
**同时维修人数**：基地 2、魔力炉 2，其余 1（`REPAIR_MAX_WORKERS`）。
**材质→材料**：基地/魔力炉/维修站/弩炮→铁矿；熔炉/科研站/附魔台/深矿井/震荡塔→石料；
箭塔/食堂/菜圃/树坑/采石场→木材；默认木材。

浏览器实测：满血不登记；交战中登记但 `availableRequests()==0`（state `in_combat`）；
脱战后可派活；一批 `materials=1 → +8 生命`；第二名傀儡预留被拒；缺料返回 `no_material`；
`reset()` 清空请求；开关自动维修生效；五种状态文案齐全
（`交战中等待 / 待维修 / 缺材料 / 傀儡维修中 / 已恢复`）。

### 3.6 人类部队口粮（`src/systems/armyNeeds.js`）

| 参数 | 值 |
| --- | --- |
| 饱食度上限/初始 | 100 / 100 |
| 消耗 | **12 / 分钟** |
| 随身自动吃阈值 | ≤ **60** |
| 一份口粮恢复 | **40** |
| 饥饿档阈值 | ≤ **25** → 攻速 ×0.85、自然恢复 ×0.5 |
| 力竭档 | **0** → 攻速 ×0.70、自然恢复 **0**（两档互斥，不叠乘） |
| 采样 `sampleSeconds` | 0.5 秒 |
| 食堂就座范围 / 每餐份数 / 恢复 | 3.2 米 / 1 份 / 40 |

浏览器实测（走**真实招募**路径 `spawnEnemyAt → isRecruitable → recruitUnit`，非召唤/改定义）：
`towerShield` 换队到 player、`definition.foodConsumer === true`、饱食度初始化为 100；
饱食 55 时吃随身口粮 55→**95** 且**不改变玩家移动指令**；
饥饿档攻速 0.663 = 0.78×0.85，恢复 ×0.5；力竭档 0.546 = 0.78×0.70，恢复 0；
反复刷新不叠乘；吃饭后即时恢复 0.78、恢复系数 1.0；
食堂实际供餐消耗 1 份、饱食 40→**80**；显式命令不被吃饭抢走；
远离食堂且身上无粮时**基地库存一份不少**（不隔空吃）；
傀儡/敌人 `foodConsumer === false` 且饱食度不被追踪、给傀儡写假饱食度也不变。

### 3.7 食品链参数

| 项 | 值 |
| --- | --- |
| 起始口粮 | **12 份**（`Game.js` 开局入库；不含新增人类护卫） |
| 菜圃建造 | 木14 / 石6 / 纤维8 |
| 菜圃成熟 `growthSeconds` | **120 秒** |
| 菜圃产出 | 谷物节点 **总量 3**（`grainCrop`，`tool: null` 徒手可收） |
| 菜圃同时养 | 1 个逻辑节点（`maxGrownNodes: 1`）；**不消耗种子**（`saplingCost: 0`） |
| 食堂建造 | 木20 / 石14 / 铁4 |
| 食堂配方 | **谷物2 + 木炭1（燃料格）→ 口粮2，12 秒**，`drainPerSecond 0.8`，魔容 30 |
| 食堂恢复光环 | 半径 6.5、1s/tick、灶台耐久 0.66/s、2.4 生命/耐久、**0.05 口粮/生命**（有口粮才工作） |

浏览器实测：菜圃建成 → 长出 1 个谷物节点且 `amount=3` → 徒手采收 3、余量 0；
食堂配方实测 `input grain×2 / output ration×2 / seconds 12 / fuelPerCycle 1`，2 个周期产出 4 份口粮。

### 3.8 供能（`POWER_RULES`，收紧后的最终值）

| 参数 | 改前 | **改后（最终）** |
| --- | --- | --- |
| `baseSupplyPerSecond` | 2 | **2.2** |
| `baseManaCapacity` | 100 | **80** |
| `baseManaRegenPerSecond` | 2 | **1.6** |
| `workerManaCapacity` | 60 | **40** |
| `maxRechargePerSecond` | 2 | **2.2**（断言 ≤ 基地功率） |
| `baseSupplyRadius` | 20 | 20（文档已确认） |

行为耗魔：待机 0、移动 1.1、采集 2.2、搬运 1.7、战斗 1.6、**维修 1.9**；
`lowManaRatio 0.25`、`returnExtraSeconds 3`、运输 0.5 魔/物品、1 物品/秒/条线。
魔力炉：木炭 1 / 8 秒 → 20 魔力，容量随 `baseManaCapacity`。

浏览器实测 UI：`净余 2.2/秒`、`75.8/80 · 供 2.2/秒 · 需 0/秒`、零消耗时剩余时间显示 **"稳定"**（不是除零/无穷）、5 个接收者。

**自启动论证**（写入代码注释并有测试守）：基地 2.2/s 刚够一名满负荷采集傀儡（2.2/s）持平；
两名采集傀儡合计 4.4/s，缺口 2.2/s 吃 80 点存量约 1 分钟见底 → 扩张必须去建 木材→木炭→魔力炉 与物流。
改前（2 / 60 / 2）单傀儡净亏 0.2/s，表现为"起步就在掉电"，与文档"支持一名起始傀儡基本作业"矛盾。

### 3.9 深采与拾荒（资源续航）

| 设施 | 周期 | 每轮消耗 | 产出 | 活动魔力 | 魔容 | 建造 | 选址 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 采石场 `quarry` | **45 秒** | 木炭 **2**（进料1+燃料1） | 石料 **4** | 1.2/s（54 点/轮） | 26 | 木26 / 纤维10 | 石堆旁（半径 8） |
| 深矿井 `deepMine` | **45 秒** | 木炭 **2**（进料1+燃料1） | 铁矿 **2** | 1.4/s（63 点/轮） | 28 | 木28 / 石16 | 铁矿脉旁（半径 8） |

建造配方刻意不依赖自产矿：采石场用木材+纤维，深矿井用木材+石料 → 最后一块石头/铁用完也能起步。

**拾荒点**（`SALVAGE_RULES`）：2 个固定点（搁浅木料 x8,z24 出木材；碎石滩 x-24,z22 出石料），
每次事件 **3 份**、间隔 **90 秒**（模拟时间，暂停不产出）、单点地上上限 **9**、拾取距离 2.6 米。
产量约为正规采集（5/次）的一半以下且需傀儡实际去取，不直接进基地。

**回收**（`RECYCLE_RULES`）：完好 **60%**、残骸 **20%**（生命比例 < 0.35 起线性过渡），
基准是**实际支付过的投入**（建造 + 已付升级），免费/初始/奖励对象返不出没付过的成本。

浏览器实测（`outputs/_verify-defense-6.log`）：

- 采空真实石堆 → 贫矿址登记、世界标记存在、模型仍可见、**寻路阻挡已释放**；
- 采石场建在距基地 **22.6 米**处（> 基地半径 20）；
- **没有本地供能时**：`reason = no_power`，产出石料 **0**（不是静默产出）；
- 在矿址旁建魔力炉（喂 20 木炭）→ `active=true`、炉内 **24.4** 魔力、供能 **2.2/s**；
- 真跑 **2 个深采周期**：出石料 **8**、耗木炭 **4**（= 2 轮 × 2 份，守恒）、魔力消耗 1.2/s、全程仍在基地半径外；
- 拾荒：2 个点、地上合计 18、单点上限 9、场景内 2 个标记、掉落**落在地上**而非直接进基地；
  统计 `events 6 / produced 18 / blocked 8`（上限真的在拦）；
- 回收：实际投入 木25 + 石20 → 预览 60% = 木15 + 石12 → **掉落物与预览完全一致**、
  基地库存**不增加**、重复拆除被拒、`settled === 1`、**基地与免费对象均拒绝回收**。

## 4. 材料 / 供能 / 食品吞吐

| 链路 | 实测吞吐 | 说明 |
| --- | --- | --- |
| 菜圃 → 谷物 | 3 谷物 / 120 秒 = **1.5 谷物/分** | 单一逻辑节点，视觉植株数不是产量倍数 |
| 食堂 → 口粮 | 2 谷物 + 1 木炭 → 2 口粮 / 12 秒 | 谷物:口粮 = 1:1 |
| 单兵口粮消耗 | 12 饱食/分 ÷ 40 = **0.3 口粮/分** | |
| **一块菜圃可供养** | 1.5 ÷ 0.3 = **约 5 人** | 落在设计目标 4–6 人区间内 |
| 采石场 → 石料 | 4 石料 / 45 秒 = **5.33 石料/分**，代价 2.67 木炭/分 | 另需 1.2 活动魔力/秒 |
| 深矿井 → 铁矿 | 2 铁矿 / 45 秒 = **2.67 铁矿/分**，代价 2.67 木炭/分 | 另需 1.4 活动魔力/秒 |
| 对比：地表富矿 | 单次采集动作 5 份、约 1 秒 | 富矿效率仍是深采的数十倍（符合"深采可持续但不恢复原产量"） |
| 拾荒 | 3 份 / 90 秒 / 点 ≈ **2 份/分/点**（双点为 4） | 上限 9/点，堆满即停 |
| 建筑维修 | 1 材料 → **8 生命** 或 **6 耐久**，单批 ≤2 材料 | 16 点灶台耐久 ≈ 24 秒治疗窗口 |
| 回收 | 完好 60% / 残骸 20% | 只返实际付过的材料，落地需搬运 |
| 基地供能 | 供 2.2/s、池 80、再生 1.6/s | 单傀儡采集刚好持平，双傀儡必然缺口 |

## 5. 未解决问题与限制（如实记录）

### 5.1 6 个既存单元测试失败（**不是本轮回归**）

`test:backpack-ui`(31/34)、`test:drops`(9/10)、`test:inventory`(14/17)、
`test:inventory-transfer`(16/18)、`test:passive-durability`、`test:worker-recharge`。

判定依据（三重）：

1. 上一轮 `docs/DSH_GAMEPLAY_RESULT.md`（14:29，**早于本轮**）已记录同一批失败（当时 7 项，含
   `test:facilities`；该项本轮已通过，故 6 项）；
2. 本轮在**当前工作树**上重跑（22:08），失败集合与计数**逐项完全一致**：
   `31/34`、`9/10`、`14/17`、`16/18`；
3. 这 6 个脚本**均不 import 本轮的任何一个新模块**
   （`defenseTiers` / `TowerUpgradeSystem` / `TowerPanelUi` / `RepairDispatchSystem` /
   `buildingRepair` / `armyNeeds` / `ArmyNeedsSystem` / `SalvageSystem` / `survivalExpansion`）。

具体失败断言（实测）：
- `test:backpack-ui`：E 键开单位背包、Esc 关闭、点击配方走合成入口（工作树里未提交的背包改造）；
- `test:drops`："一点都装不下时应当失败"（部分装载语义）；
- `test:inventory`：`Cannot set properties of undefined (setting 'resourceNodeId')` ×3（资源账本统一未完成）；
- `test:inventory-transfer`：单格堆叠上限 200 与运行时不一致 ×2；
- `test:passive-durability`：`actual: 5, expected: 6`（恢复 tick 计数）。

诚实补充：其中 `test:inventory` 与 `test:worker-recharge` **会 import `src/data/gameData.js`**，
而该文件本轮确实被改过。但失败点在库存/堆叠语义（来自上一轮未提交的物品改造），
且计数在本轮开始前就已固定不变，故仍判为既存。若后续要彻底排除，
需要在干净基线上重跑这两项——本轮未做。

### 5.2 `test:worker-recharge` 长时间不退出

90 秒单项超时后被杀（`FAIL(timeout) 90036ms`）。上一轮报告也记录"该脚本长时间不退出，被手动结束"。
本轮**未**进一步区分它是"极慢"还是"真挂死"，也未修复——如实记为未解决。

### 5.3 深采"贫矿址分支"未被端到端断言

验收脚本里 `quarrySpotOnDepletedSite` 这个**探针字段**取值为 `false`：采石场最终解析到的是
旁边一个**仍然活着的石堆**（`kind: 'rich'`，同矿种、8 米内优先），而不是刚采空的那一个。
因此：
- 贫矿址的**登记 / 世界标记 / 寻路释放 / 快照往返**：已断言（`test:resource-nodes` 15/15 + 浏览器 4 项判据）；
- 采石场**能建在矿点旁**：已断言（`quarrySpotFound` + `quarryPlaced` + `quarryBuilt`）；
- `resolveResourceSiteFor` 的 **`kind: 'depleted'` 分支**（`Game.js` 6714–6715）已实现且可达，
  但**没有被任何通过的断言直接覆盖**。

这是一个验证深度上的真实缺口，不影响本轮已声明通过的功能，但不应被描述为"完全验证"。

### 5.4 深采木炭消耗与设计文档起始值的偏差（有意为之）

设计文档写"每个深采周期约 45 秒、**木炭 1**"。实现是**每周期木炭 2**（进料格 1 + 燃料格 1）。
原因：既有生产架构把"主料"（input 格）与"燃料"（fuel 格）分开，且 `fuelPerCycle` 被强制 ≥1
（`systems/production.js` 的 `normalizeProductionRecipe`），所以配方驱动设施每轮至少吃 1 份燃料。
两者都取下限 1，总消耗就是这类设施能压到的下限；替代方案（给深采开"不需燃料"的旁路）
会改动熔炉共用的稳定逻辑，收益不抵风险。该理由已写在 `gameData.js` 的配方注释里。
实测守恒：2 轮 = 4 份木炭、8 份石料。

### 5.5 移动端供能条横向可滚 84px

390×844 下塔界面本体**完全在视口内**（`panelRect = 0,0,390,844`、`frameScrollOverflow = 0`、
按钮在视口内），但 `#power-net-meter` 的 `scrollWidth - clientWidth = 84`。
判据只要求"不被视口裁掉"，该项通过；横向滚动是外观层面的小瑕疵，**未修**。

### 5.6 验收性质：程序化 + 浏览器驱动，不等于人类整局游玩

浏览器验收通过真实 `Game` 实例、真实放置/生产/科研/供能/招募链驱动，
但没有人类完整打通一局（八巢 + 残敌）。设计文档明确"程序化模拟可以验证规则，
但不能声称等于人类完成整局游玩"。本报告不作此声称。

### 5.7 既存未提交改动未清理

工作树里包含**多轮**未提交改动（上一轮的站点/运输/物品/远征改造与本轮改动混在一起），
本轮按约束**未做任何清理、回滚或提交**。因此"本轮改了哪些文件"只能按交付物清单界定，
无法给出与干净基线的逐行 diff。

## 6. 边界遵守

未执行 `git commit` / `git push` / PR / 公网部署 / 远程设置修改；未 `git stash` / `checkout` / 回滚；
未递增 `GAME_VERSION`、未写玩家更新日志（本轮不提交、不部署，故按项目规则不需要）；
未创建任何 AI 子代理；未改动与本轮无关的既有未提交改动；未触碰用户日常浏览器
（自建 headless Chrome + 独立 `user-data-dir` + 独立端口 9235）；未停止用户的服务
（复用已在运行的 :3000 dev server）；未新增版本库状态变更。

## 7. 可选下一轮建议（本轮不做）

1. 把 6 个既存失败收口，或在干净基线上重跑 `test:inventory` / `test:worker-recharge`
   以彻底排除与本轮的关系；顺带定位 `test:worker-recharge` 是慢还是挂死。
2. 给 `resolveResourceSiteFor` 的 `kind: 'depleted'` 分支补一条端到端断言
   （例如先把 8 米内所有同矿种节点采空，再断言采石场解析到贫矿址），
   把 5.3 的验证缺口补上。
3. 移动端供能条改为可换行或在窄视口下折叠，消除 84px 横向滚动（5.5）。
4. 深采燃料消耗若希望回到文档的 1 份/轮，需要在生产架构里给"无燃料配方"开一条
   受控旁路，并同时守住熔炉的净正循环与功率守恒——建议单独立项。
5. 补一次人类完整通关（八巢 + 残敌）以覆盖 5.6 未覆盖的部分。
