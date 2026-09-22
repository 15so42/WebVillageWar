# 海岛生存改版：实施进度与验收状态

对应方案：`SURVIVAL_LOGISTICS_GAMEPLAY_PLAN.md`
记录日期：2026-09-21。分支：`survival`。版本：0.2.174。

本文只记录**已经落地并有验收证据**的内容，以及**明确未做**的部分。
方案文档里的"建议"不等于已完成；本文与方案冲突时，以本文记录的代码现状为准。

---

## 1. 一句话状态

方案第 12 节的阶段 A、B 完成，**阶段 C 与 D 完成**（刷怪点、清点奖励、死亡掉落、
附魔成长迁移全部接入并有验收），**胜负判定第一次真正会走到**，
**基地库存与合成面板可用**，**野外招募闭环打通**，
**并且这条闭环现在真的能转起来**（出生护卫 + 弱化的起始巢穴，见"开局可通关性"）；
**物品可以在基地与单位之间搬运，工具可制作，建筑可以放置，熔炉能把木材烧成木炭，
魔力炉烧木炭为周围供能（生产链闭环），科研站解锁科技、附魔台用材料造附魔石
（不再依赖附魔卡），树坑让木材可再生，箭塔与食堂用魔力驱动，
科技能改已经在运转的设施与傀儡，战斗单位有背包且能换同类武器，
可放置建筑有空快捷栏，基地面板是分段标签页**。
方案第 9 节列的设施**全部做完**了。全部改动**未提交**。

全量单元测试 **63/63**（脚本数）。
游戏内验收：海岛 15 项 + 基地库存 1 项 + 物品搬运 1 项 + 快捷栏 1 项 + 野外招募 1 项
+ 符文石链路 1 项 + 换武器 1 项 + 截图 1 项，**全部 PASS**。

---

## 2. 已完成并且有独立验收的部分

### 阶段 A：物品与库存基础

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 物品定义（可堆叠 / 按实例管理两类） | `src/data/gameData.js` 的 `ITEM_DEFINITIONS` | `test:inventory` |
| 堆叠规则、实例 ID 发放、资源↔物品映射 | `src/systems/items.js` | 同上 |
| 库存容器：堆叠合并、整笔原子性、实例身份保持、序列化 | `src/systems/Inventory.js` | `test:inventory` 13/13 |
| 基地库存 | `Game.baseInventory` | 游戏内验收脚本 |

要点：

- **装不下必须整笔失败**，或显式传 `allowPartial` 并返回余量，任何情况都不静默吞物品。
- **取出不够必须整笔失败**，不能出现"扣了一半材料但东西没做出来"。
- **跨容器转移原子**：先确认目标装得下再动手，中途失败放回原处。
- **实例类物品（工具/附魔石）永不按名字合并**，转移的是同一件（`instanceId` 不变）。

### 阶段 B：采集、运输与供能

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 资源节点（有限存量、工具校验、采空后隐藏并解除寻路阻挡） | `src/systems/ResourceNodeSystem.js`、`resources.js` | `test:resource-nodes` 9/9、`verify-island-resources` |
| 寻路网格运行时局部重采样 | `src/world/NavigationGrid.js` 的 `refreshRegion()` | 同上 |
| 傀儡作业状态机（九种可见状态、任务预留、采集计时） | `src/systems/workOrders.js` | `test:work-orders` 14/14 |
| 傀儡作业系统（走 → 采 → 入包 → 运回 → 卸货） | `src/systems/WorkSystem.js` | `verify-island-worker` 9/9 |
| 供能与活动魔力（功率守恒、范围内外、不禁止离范围行动） | `src/systems/PowerSystem.js`、`power.js` | `test:power` 15/15、`verify-island-power` 8/8 |
| 采集需求优先级调度（达标/无资源不派人、确定性分摊） | `src/systems/workPriority.js` | `test:work-priority` 11/11 |

要点：

- 供能的硬约束是**一段 dt 内发出去的魔力总和不超过供能源当段可提供的量**，
  不能给范围内每个接收者各发一份完整功率。有一轮 400 组确定性随机对拍专门守这条。
- 活动魔力用 `activityMana` / `activityManaCapacity`，**与符文石上的 `mana` 完全分开**，
  有一条测试专门断言供能系统不会写符文字段。
- 傀儡**走直线转向（direct steering）**。导航转向 `safeSurfaceSteeringToward`
  在实测中会对"位置可走、目标合理"的情况返回空，导致一步不动；原因未查明，
  代价是傀儡不会自己绕路，障碍变密时需要回头查。

### 阶段 C：刷怪点与清点奖励

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 刷怪点规则（生成间隔、存活上限、永久摧毁、清除进度） | `src/systems/spawnPoints.js` | `test:spawn-points` 10/10 |
| 刷怪点系统（按点位生成敌人、不超上限、摧毁后停产） | `src/systems/SpawnPointSystem.js` | `verify-island-spawn-points` 12/12 |
| 清点奖励：资源掉落 + 劳动力（傀儡） | `Game.onSpawnPointCleared()`、`grantSpawnPointWorkerReward()` | `verify-island-rewards` 13/13 |
| 4 个点位的关卡数据（含 `drops` / `workerReward`） | `gameData.js` 的 `ISLAND_SPAWN_POINTS` | 同上 |
| 可被玩家攻击摧毁的巢穴 | `spawnPointNest` 单位定义 + `Game.spawnSpawnPointNests()` | 同上（含死亡链路） |
| HUD 清除进度（全清后追加"残敌 N"） | `index.html` 的 `#spawn-point-meter` | `verify-island-victory` |
| 海岛关屏蔽旧波次流程 | `Game.spawnEnemyWave()` 开头的关卡判断 | 五关启动回归 |

要点：

- 摧毁是**永久**的：`clearSpawnPoint` 幂等，之后再也不会产怪。
- 存活数**每帧从单位注册表现算**，不用自增计数器（敌人可能被法术/陷阱/同伴杀死）。
- 敌人归属用 **`unit.spawnPointId`**，不是 `unit.spawnPoint` —— 后者已被旧波次流程
  占用（存出生坐标 Vector3）。混用会产生 `"[object Object]"` 的假分组。
- 巢穴必须是**惰性建筑**（`isBuilding: true` / `canMove: false` / `aggroRange: 0`）。
  不要拿 `spiderEgg` 当占位：它是会孵化的活单位，会衍生出无归属敌人。
- **清点奖励挂在 `SpawnPointSystem.destroyPoint()` 的成功分支上**（通过
  `game.onSpawnPointCleared`），不在巢穴死亡处理里。`destroyPoint` 只在真正完成清除的
  那一次返回 true，所以奖励天然幂等，也覆盖"不经死亡链路直接清点"的调用。
- 新傀儡的落点必须过 `resolveWalkablePoint`：巢穴自己登记了寻路阻挡，按几何偏移直接
  落点会踩进阻挡格，那支傀儡就永远"想走但一步不动"（这个坑在开局傀儡上踩过一次）。
- 傀儡的启动工具（木斧 + 木镐）由 `Game.createWorkerBootstrapInventory()` 统一发放。
  **目前这是工具的唯一来源**（还没有工具制作链），合成接上之后要改成"只发开局那一支"。

### 阶段 D：死亡掉落与附魔成长（已接入游戏）

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 掉落与拾取的物品守恒（清空式转移、实例身份保持、防重复掉落） | `src/systems/drops.js` | `test:drops` 10/10 |
| 地面遗物包（场景模型、存留计时、走近自动拾取、装不下留原地） | `src/systems/GroundDropSystem.js` | `verify-island-drops` 30/30 |
| 阵亡结算接线（掉落 + 中断作业 + 释放任务预留） | `Game.dropUnitBelongingsOnDeath()` | 同上 |
| 附魔石永久成长的归属规则 | `src/systems/runeGrowth.js` | `test:rune-growth` 14/14 |
| 成长迁移到石头实例（字段、序列化、地面位置、拾取还原） | `runeStones.js`、`RuneStoneSystem.js` | `test:rune-stones`、`verify-island-drops` |
| 成长按石头实例投影成属性修改器 | `RuneStoneSystem.applyGrowthModifiers()` | `test:new-enchantments` |
| 淘汰 Buff/单位侧的独立累计值 | `BuffSystem.triumphOnKill`、`UnitEntity.js` | 同上（断言 Buff 上不再有该字段） |

要点（这一块的规则细节最容易踩）：

- **掉落是转移，不是复制。** `planDeathDrop` 是清空式转移：返回原物（含 `instanceId` 与
  `data`）并把源背包格子清空。调用方不要再复制一份。
- **附魔石本体不离开 `RuneStoneSystem.stones`**，阵亡时只把 `location` 改成
  `{ kind: 'ground', x, z, dropId, fallenUnitId, fallenUnitName }`。等级、魔力经验与
  累计成长因此天然保留，不存在"再来一份"的路径。
- **未知的位置类型必须原样保留**，不能静默改回基地。旧实现只认 base/unit，
  任何没见过的位置都会把地图上的掉落物无声地搬回玩家背包（方案 10.1 点名过）。
- **属性修改器来源按石头实例区分**（`rune-growth:<石头 id>`）。卸下一块只移除它自己的
  贡献；同单位两块同名石头互不影响。成长值为 0 的石头不产生修改器。
- **单位与 Buff 上不再保留第二份累计值。** `preserveEnchantmentRuntimeState` 不再搬运
  `triumphHealthBonus`，`restoreEnchantmentRuntimeModifiers` 也不再重建那条上限修改器。
  凯旋上限的唯一出口是石头 → `applyGrowthModifiers`。
- **`runeStoneId` 必须在 Buff 重建时显式继承或替换。** 这个字段此前没有任何人读，
  丢了也没人发现；现在它是"这个 Buff 的成长该写回哪块石头"的唯一线索。
  丢掉的后果是静默失效（成长不再累计，且不报错），所以 `addBuff` 里按
  "调用方传了就用新的、没传就沿用旧的"显式定优先级。
- **拾取不得改写归属。** 单位身上的 `ownerPlayerId` / `controllerPlayerId` 属于卡牌系统
  那套 id 空间（本地单机实测 `'p1'`），符文系统用的是 slot（`'local-player'`）。
  拿前者覆盖 `stone.playerId` 会让石头一被捡起来就从玩家自己的符文背包 UI 里消失。
  跨玩家拾取的归属规则方案里仍是待定项，因此保持原归属、不静默转移。
- **掉落物不自动消失**（`lifetimeSeconds: 0`）。方案把存留时间列为待定，而这一节的硬
  要求是物品守恒；给遗物加倒计时等于把"来不及捡"变成"东西没了"。
- **不做远程手动拾取**。方案明确把"是否允许远程手动拾取"列为待定，所以这里不实现，
  而不是顺手实现。地面上的石头也**故意不列进符文背包 UI 的"阵亡背包"列表**——
  那个列表里的石头可以拖拽，列进去等于开了远程拾取的后门。
- **复生单位不继承阵亡单位的石头**，否则同一块石头会同时存在于地面和新的身体里。
  `reassignUnitStones()` 已随这条规则删除。
- 目前**只有傀儡有物品背包**。战斗兵种走过来只能捡附魔石，捡不了货物——货物背包还没做。
  这不影响守恒（东西留在原地），但野外战斗单位无法回收货物，属于已知缺口。

---

### 合成、基地库存与野外招募

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 深邃核心（只从刷怪点掉） | `gameData.js` 的 `ITEM_DEFINITIONS.deepCore` + 各 `ISLAND_SPAWN_POINTS[].drops` | `verify-island-rewards` |
| 招募令配方（1 核心 + 20 木材） | `gameData.js` 的 `RECIPES.recruitmentOrder` | `test:crafting` |
| 合成规则（整笔原子、材料腾格算进产物空间、次数校验） | `src/systems/crafting.js` | `test:crafting` 13/13 |
| 合成入口与配方状态查询 | `Game.craftAtBase()`、`Game.recipeStatus()`、`Game.maxCraftableTimes()` | 同上 |
| **基地库存与合成面板**（I 键 + 左下角常驻入口） | `src/systems/BaseStorageUi.js`、`src/baseStorage.css` | `verify-base-storage-ui` 16/16 |
| **物品搬运（基地 ↔ 单位背包）** | `Game.transferBaseSlotToUnit()` / `transferUnitSlotToBase()` | `verify-item-transfer` 16/16 |
| 工具可制作（木斧 / 木镐） | `gameData.js` 的 `RECIPES.axe` / `RECIPES.pickaxe` | `test:crafting` + `verify-item-transfer` |

### 建造放置与生产链（阶段 E 第一块）

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 建筑放置（放置模式、预览、左键落地、右键/Esc 取消） | `Game.beginPlacement()` / `confirmPlacement()` / `canPlaceAt()` | `verify-island-production` 16/16 |
| 落点校验（地面可走 + 在供能半径内；不合规不扣物品） | `Game.canPlaceAt()` | 同上 |
| 生产规则（周期结算、缺料停摆、进度保留、不超产） | `src/systems/production.js` | `test:production` 8/8 |
| 生产运行时（按周期把基地库存的木材烧成木炭、吃活动魔力） | `src/systems/ProductionSystem.js` | `verify-island-production` |
| 熔炉（可放置建筑 + 低模模型 + 配方） | `UNIT_DEFINITIONS.furnace`、`RECIPES.furnace`、`lowpoly.createFurnaceModel()` | 同上 |

要点：

- **落点校验必须在扣物品之前**，而且不合规时什么都不扣、也不退出放置模式：
  "放了半天发现东西没了"是最糟糕的放置体验。验收里专门有两条：
  远处（可走但离供能太远）与障碍上（不可走）都要求"物品数不变 + 仍在放置模式"。
- **放置的两条规则**：地面可走（否则建筑卡在障碍里）＋ 在某座供能源半径内
  （设施是供能接收者，没电的生产设施是摆设）。第二条不是新发明的规则：
  方案第 9 节的魔力炉就是"为周围生产和战斗提供魔力"。
- **空转时间不能攒成工作量。** `advanceProduction` 的余数要 `min(余数, 一个周期)`：
  `cyclesAllowed` 是材料/空间给的"这一段最多做几次"，不是时间给的。
  按原始余数保留的话，一台饿了一百秒的熔炉会在木材到的瞬间一次做掉十几批。
  这一条是被单元测试逼出来的（第一版就是错的）。
- **缺料停摆要保留进度**：材料接上之后接着烧，而不是从头再来。缺料与"没电"要用
  不同的 `reason` 区分，HUD 与验收都要能分辨。
- **结成整笔原子**：先扣材料再加产物，加不进去就把材料退回去——
  "扣了木材但木炭没出来"这种半成品状态不允许出现。
- 输入输出都走**共享的基地库存**。方案第 5 节推荐的"容器连接 + 搬运"还没做，
  给设施再发一个独立缓冲会引入一套临时第二物流，接上真正的搬运时反而要拆掉。
- **木炭目前没有消费者**（消费者是魔力炉）。方案第 9 节要求"整条链净产出为正"，
  所以在魔力炉接上之前，这条链**只到燃料为止**，不要当成已经闭环的产出。

### 树坑与种植（阶段 E 最后一块设施）

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 种植规则（保留量、生长推进、净产出核对） | `src/systems/planting.js` | `test:planting` 8/8 |
| 种植运行时（种下 → 长成真实节点 → 等砍 → 补种） | `src/systems/PlantingSystem.js` | `verify-island-planting` 10/10 |
| 砍树掉树苗（整条链的入口） | `RESOURCE_NODE_DEFINITIONS.*.byproduct` + `ResourceNodeSystem.harvest` | 同上 |
| 运行时新增资源节点 | `world.spawnResourceNode()` + `ResourceNodeSystem.registerSpawnedNode()` | 同上 |

要点：

- **长出来的必须是真实资源节点**，不是"树坑自己按周期吐木材"。方案第 9 节写的是
  「种植、等待生长、**砍伐**」——砍伐要由傀儡去做，这样搬运、工具、寻路、掉落
  这些既有链路全部自动复用。让树坑自己吐木材等于绕过傀儡，把那套物流架空成数字转换器。
- **方案第 9 节的两条硬要求都做成了可断言的性质**：
  - **保留量**：`canPlant` 要求 `have >= saplingCost + reserveSaplings`，
    不是 `>= saplingCost`。写成后者的话最后一棵苗也会被种掉，
    一旦这一轮产出没跟上就再也没有下一轮。
  - **净产出为正**：`plantingYield()` 按数据直接算（一棵橡树 45 ÷ 15 = 3 棵苗，
    补种只花 1 棵），`test:planting` 里有一条"多个完整回合之后树苗净增长"的模拟。
- **副产物按累计采出量发，不做随机掉落**：随机会让"这条链能不能自持"变成看运气，
  而方案要求净产出是可核对的。
- 长成的树**不在坑的正中心**，而是坑边找一块可走的空地：坑自己已经登记了寻路阻挡，
  同一位置再叠一个阻挡会在 release 时互相影响。
- 副产物计数（`harvestedTotal` / `byproductGiven`）必须进 `normalizeResourceNodeState`
  的**显式白名单**，也必须进 `applySnapshot`。漏掉后者会让重载之后的树
  把已经发过的树苗再发一遍，并且突破 `maxPerNode` 上限——
  这个 bug 是被 `test:resource-nodes` 的"快照往返"断言抓出来的。

---

### 战斗单位背包与同类武器更换（方案第 6.2 节）

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 武器判据（家族 / 射程 / 投射物 / 攻击动作四项） | `src/systems/weapons.js` | `test:weapons` 11/11 |
| 战斗单位按需建背包 | `Game.itemBagFor()` | `verify-item-transfer` 16/16 |
| 同类武器换装（含原配武器物化回背包） | `Game.equipWeaponFromBag()` / `applyWeaponToUnit()` | `verify-weapon-swap` 8/8 |
| 面板上的「装备」按钮（异族禁用并给原因） | `BaseStorageUi.createMoveChip()` | 同上 |

要点：

- **背包的消费者是"换武器"**，不是"能装东西"。先有消费方再加容器，
  否则就只是一排能往里拖东西但没有任何作用的格子。
- **四项判据缺一不可**（方案第 6.2 节原文要求检查攻击动画、投射物、射程与耐力参数）：
  家族、射程、投射物、攻击动作。武器只能改伤害/耐久/耐力消耗/攻速——
  射程与动作由兼容性决定，**不写进武器补丁**，所以"只改模型"这种情况在结构上不可能发生。
- **要检查四项而不是只查家族**：同一家族里也可能有射程或动作不同的档位，
  只比 `family` 会放行一个动作对不上的武器。`test:weapons` 里用
  "临时塞一件违规武器进物品表、跑真实判定分支、再删掉"的方式逐条验过。
- **原配武器必须物化回背包**：单位最初手里那把不是物品。第一次换装时按家族
  物化成对应的"旧剑/旧木棒/旧弓"放回背包（`baselineWeaponItemFor`），
  否则换一次武器就凭空少一把。验收里断言"少了一把升级件、多了一把原配武器"。
- **`weapon.maxDurability` 与 `weapon.durabilityCost` 都只有 getter**
  （`bindAttributeGetter` 绑到 attributes 上），直接赋值会抛
  "Cannot set property ... which has only a getter"——和第 22 条 `maxHealth` 是同一类坑。
  这两项必须走 `attributes.setBase`；`weapon.durability` 是普通字段，可以写。
- **不是单位的东西没有背包**：`itemBagFor` 用 `definition` 作为"这是 UnitEntity"的判据。
  基地（`playerBase` 并不是 UnitEntity）与资源节点也有 `id`，早先的写法会给它们建出背包来。

---

### 科技效果：真的改运转参数（不只解锁配方）

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 科技效果解析（生产配方补丁、采集加成） | `src/systems/research.js` 的 `productionPatchFor` / `applyProductionPatch` / `harvestPerActionBonus` | `test:research` 17/17 |
| 已建设施的配方重新解析 | `ProductionSystem.refreshRecipes()`（研究完成时触发） | `verify-island-tech-effects` 8/8 |
| 「高效烧炭」「采集效率」两项科技 | `TECH_DEFINITIONS.effects` | 同上 |

要点：

- **`effects` 是"科技改运转参数"的统一入口**，目前有两类：
  `production: [{ recipeId, patch }]` 与 `harvest: { perActionBonus }`。
  以后加"塔射程""背包容量"之类也走这里，不必再把逻辑散到 Tech 之外。
- **必须研究时重新解析已经建好的设施**：玩家的实际顺序几乎总是"先建设施，后研究"。
  只在 `registerProducer` 时解析的话，"先建熔炉再研究高效烧炭"就不生效。
  重新解析做成**事件驱动**（研究完成那一刻调一次 `refreshRecipes()`），
  不是每帧给每座设施做一次对象合并。
- **补丁是纯函数、返回新对象**：配方表是共享数据，就地改会把补丁泄漏到下一局
  （`test:research` 里专门有一条断言原配方没被改动）。
- 补丁写坏要退回原值：产出数量 0/NaN、周期为负、耗魔为负都会被忽略，
  而不是产出 0 个或者变成负数。
- 「采集效率」的加成放在 `WorkSystem` 的调用点（`amount` 参数），不是改全局规则——
  这样"加成的来源"只有一处可查。

---

### 用魔力的功能设施：箭塔与食堂（阶段 E 收尾）

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 设施供能规则（耗尽停机 + 重启门槛滞回） | `src/systems/facilities.js` | `test:facilities` 8/8 |
| 设施运行时（登记成供能接收者、每帧判定开停） | `src/systems/FacilitySystem.js` | `verify-island-facilities` 11/11 |
| 箭塔与食堂的可合成/可放置 | `UNIT_DEFINITIONS` + `RECIPES` + `ITEM_DEFINITIONS.placeable` | 同上 |

要点：

- **这两座建筑在旧卡牌玩法里本来就有定义和模型**，这一轮补的只有两件事：
  变成可合成可放置的物品（放置流程是通用的，加一条配方就接上了），以及**用魔力驱动**。
  没有新写系统。
- **只在海岛生存关生效**（`FacilitySystem.rulesActive()` 走 `game.isSurvivalLevel()`）。
  另外四关的箭塔/食堂来自卡牌，那里没有供能网络，强行要求魔力会把已经验收过的老玩法改坏。
  判定写在运行时，消耗方（`UnitLogicSystem.updateStationaryCombatUnit`、
  `BuildingSystem.updateBuildingAura`）只读 `unit.poweredDown`，而它在别的关卡恒为 false。
- **必须有滞回**（`restartRatio`）：没有它的话魔力在 0 附近会让设施一帧开一帧停，
  箭塔表现成抽搐式射击。现在停机后要充到容量的 40% 才复工。
- **停机期间 `drainPerSecond` 要设成 0**，否则它永远充不起来（自己的消耗压着自己的回充）。
- 验收里的判据选择踩了两次坑（见第 4 节 27、28 条）：**不能用靶子掉血判断箭塔有没有开火**
  （旁边还有护卫和基地在打它），**也不能用武器耐久差值**（耐久会随时间回一点，
  实测停机 10 秒反而涨了 2）。最后用"处于攻击状态的帧数"逐帧计数。

---

### 基地库存面板的分段标签页

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 五段标签页（库存 / 单位背包 / 合成 / 科技 / 附魔台）+ 徽标 | `BaseStorageUi.setTab()` / `renderTabs()` | `verify-base-storage-ui` 22/22 |

要点：

- **徽标要显示"还没处理的量"，不是"现在能做的量"**：合成段用"可合成几项"，
  科技段用"还有几项没研究"。能研究的会立刻被研究掉，拿它当徽标等于没有提示作用。
- **库存徽标只放已用格数**（"3"），不放 "3/24"——段标题里已经有了，
  标签上再放一遍会把标签挤到折行（实测"库存"被折成"库"/"存"两行）。
- **必须有一段的可见性断言**：光看 DOM 里有按钮不够。验收里逐个切过去，
  每次都要求"可见段恰好一个，且就是点的那一段"，另外还要求切到合成段之后
  配方卡片**真的有尺寸**（高度 > 40），防止被 hidden 的祖先盖住却"看起来在 DOM 里"。
- **面板主体高度要降下来**（`max-height: min(52vh, 420px)`）：标签页的意义就是
  一次只渲染一段的高度。验收里有一条 `bodyStaysShort`。
- 面板关闭时也可能被外部切段（打开时重放 `applyTab()`），否则会出现
  "上次停在科技段，重新打开却显示库存段、但高亮在科技段"的错位。

---

### 物品快捷栏

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 快捷栏（数字键 1-9 / 点击进入放置模式，再按一次取消） | `src/systems/HotbarUi.js` + `Game.hotbarItems()` / `activateHotbarSlot()` | `verify-item-hotbar` 13/13 |

要点：

- **槽位来源不是手工配置，而是"基地里当前可放置的建筑"**（按物品定义里的 `placeable` 判定）。
  现在可放置的东西只有熔炉/魔力炉/科研站/附魔台，手工配一排固定槽位没有意义，
  而且会出现"库存里已经没有了、槽位还亮着"这种状态。
  以后出现"可使用物品"（药剂、卷轴之类）时再扩展 `Game.hotbarItems()` 的取材范围。
- **取消的判据是"当前正在放的就是这一件"，不是记住槽位号**：槽位按库存动态算，
  按键与物品的对应关系随时可能变。
- **没有可放置物品时整条藏起来**，不留一排空槽位占地方。
- 布局上必须让开手牌区（`.card-hand` 在 `bottom:30px`、卡高 220px），
  所以快捷栏放在 `bottom:268px`。验收里有一条**不依赖当前手牌内容**的判据
  （`hotbarRect.bottom <= innerHeight - 30 - 220`）：直接比矩形在手牌为空时恒真，
  因为空手牌的高度是 0。

---

### 科技与附魔台（不再依赖附魔卡）
| --- | --- | --- |
| 科技规则（前置、成本、科研站门槛、配方解锁） | `src/systems/research.js` | `test:research` 12/12 |
| 科技运行（研究消耗整笔原子） | `src/systems/ResearchSystem.js` | `verify-island-research` 14/14 |
| 附魔台制作附魔石（消耗材料 → 直接进符文系统） | `ResearchSystem.enchant()` | 同上 |
| 科技 / 附魔台两段界面 | `BaseStorageUi.renderTechs()` / `renderEnchants()` | 同上 |

要点：

- **科研站是研究的门槛**（`stationReady`：建好且不在施工中）。没有它，
  `canResearch` 返回 `no_station`，面板直接写"需要先建好科研站"——
  否则这座建筑没有任何存在意义。
- **科技锁住的配方根本不出现在合成列表里**（`recipeStatus()` 按已解锁科技过滤），
  而不是"显示成灰的"。玩家在解锁前不该知道有这么个东西，列表也不该被暂时用不了的条目撑满。
  实测断言：解锁前 `craft('enchantTable') === undefined`，而 `craft('furnace')` 照常可见。
- **研究消耗是整笔原子的**：先逐项扣，任何一项扣不动就把已经扣掉的退回去。
  和合成/搬运同一条纪律。
- **附魔石不先做成物品再搬运**，而是让附魔台直接 `RuneStoneSystem.createStone()`。
  石头是**实例**，带着等级、经验与成长，它的事实归属一直是 `RuneStoneSystem.stones`
  （符文背包 UI、装备、掉落全走那边）。先做成物品会造出"物品库存里有一块石头、
  符文系统里没有"的双重身份。方案第 10 节说的"迁移为通用物品基础"是更大的改造，
  留待专门一轮——这一轮刻意不去动那套已经验收过的符文链路。
- 验收里同时断言了这两面：`stoneNotInItemBag === true`（物品库存里没有符文石）
  且 `stoneInBaseRuneBackpack === true`（符文系统里有），
  最后还把那块石头装到单位身上确认附魔生效。
- **面板进入放置模式时会自动关掉**（玩家接下来要点地图）。任何"放置之后读面板 DOM"
  的验收都必须先重新打开面板：`refresh()` 在关闭状态下直接 early-return，
  不清签名也读不到新状态（这一版验收第一轮就栽在这里）。

---

### 燃料供能：魔力炉（生产链闭环）

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 燃料供能（魔力炉烧木炭，为周围生产与战斗供能） | `src/systems/fuelPower.js`、`FuelPowerSystem.js` | `verify-island-fuel-power` 9/9 |
| 供能源豁免放置校验 | `Game.canPlaceAt()` 里的 `definition.powerSource` 分支 | 同上 |

要点：

- **供能源必须豁免"附近要有供能"这条放置规则**（`definition.powerSource === true`）。
  魔力炉就是来给远处供能的，要求它先待在基地旁边等于把它的用途取消掉；
  它只需要地面可走。熔炉这类**接收者**才需要落在供能半径内。
- **有燃料才供能**：`active` 的判据是"手上还有燃料能覆盖下一份"，
  **不能**写成 `cyclesAvailable > 0 || progress > 0`。进度在缺料时是保留的，
  一旦把"有进度"也算成供能，一台烧到一半就断料的魔力炉会**永远白送电**。
  这一条是被验收脚本抓出来的（第一版就是那么写的）。
- **启动路径**：魔力炉的配方里**不能有木炭**（石料 + 铁矿 + 木材）。
  它是木炭的消费者，让它要求木炭就等于死循环。方案第 9 节明确要求
  "保证第一批燃料有启动路径"。铁矿在这里第一次有了用处。
- 更新顺序：`fuelPower.update` 必须在 `power.update` **之前**跑，
  否则这一段分配用的还是上一帧的功率。
- 实测出来的一个**自洽循环**：远处熔炉产木炭 → 喂给魔力炉 → 魔力炉给它供能。
  净产出为正（8 秒产 2 个木炭，20 秒才烧 2 个）。写验收时要注意：
  想测"没燃料会断供"就必须**每帧清掉木炭**，否则这个循环会把断言喂饱。
- 上游依赖 `advanceProduction` 的周期推进（纯时间/周期计算，不碰物品），
  所以"缺料停摆、空转不攒工作量"这两条与生产设施完全一致，不需要各写一遍。

合成与库存界面的要点：

- **合成必须是整笔事务**，所以 `craftRecipe` 先在 `Inventory.deserialize(serialize())`
  的副本上跑完整笔（扣材料 → 放产物），成功了才落回真库存。顺序调 `remove` + `add`
  会留下两种半成品：先扣料再发现放不下（材料白没），或者先查空位再扣料
  （材料腾出的格子本来够放，却被误判成放不下）。后一种有专门的用例守着。
- `times` 必须是**正整数**：静默 `floor` 会把 UI 传错值（2.7 期望两批）藏起来，
  而多做一批是要扣材料的，不能猜。
- 配方里的物品必须在 `ITEM_DEFINITIONS` 里存在，否则拒绝，而不是把未定义物品当空气。
- 招募令与深邃核心都做成**可堆叠材料**（`kind: 'stack'`）：它们没有需要跟随的个体数据，
  堆叠能省格子。附魔石/工具才是 `instance`。
- **界面里不重算库存规则**：能不能合成、缺什么、还差多少、最多连做几批，
  全部来自 `Game.recipeStatus()` / `maxCraftableTimes()`（内部就是 `crafting.js`）。
  UI 只负责渲染与点击，否则"按钮说能做、点了却失败"这类不一致迟早出现。
- 合成面板**故意不塞进符文背包**：那一套的语义是"每格一块石头、可拖拽转移、拖进垃圾桶
  出售"，而库存里是可堆叠材料、没有出售动作，混在一起两套规则会互相污染。两者主色
  也分开（符文紫 / 工坊青），可以同时开着。
- 面板刷新有**签名短路**：签名没变就完全不重建 DOM。否则 400ms 一次的重建会在鼠标
  按下与抬起之间把按钮换掉，出现"点了没反应"。
- **常驻入口必须在构造时就建出来**（`Game` 构造里显式 `ensureLauncher()`）。
  入口按钮原本是第一次打开面板时才创建的，于是"不知道怎么开面板"的玩家永远看不到入口。
  符文背包当初也踩过这个鸡生蛋问题。验收里专门有一条"打开之前入口就得在"。
- **搬运必须通知作业系统重算背包缓存**（`WorkSystem.notifyInventoryChanged()`）。
  工具列表与卸货清单都从缓存派生，不通知就会出现"背包里明明有斧子，规划器还说缺工具"。
- **实例类物品搬运要保持同一个 `instanceId`**：`transferInstanceTo` 会把它带下去，
  换成 `transferTo` 会因为"实例类不能按名字转移"直接失败，自己重发 ID 则等于凭空复制一件。
- **面板的 `max-height` 必须挂在 flex 容器上，并且子项要 `min-height: 0`。**
  只给块级父元素挂 `max-height` 不会约束子元素：配方从 1 条涨到 3 条之后面板比屏幕还高，
  底部按钮被顶出视口点不到。验收里加了"面板整体在视口内 + 最后一条配方的按钮滚动可达"。
- **列表的可见性判据要允许滚动**：第一版断言写成"不滚动就能看见最后一个按钮"，
  对可滚动列表是错的要求——正确写法是 `scrollIntoView` 之后仍落在面板内。
- **海岛关隐藏了顶部波次计数与波次情报**（`.wave-command-panel.is-survival`）。
  这一关的敌人全部来自刷怪点，显示"当前波次 1/21"是误导。注意 `.wave-command-info`
  自带 `display: grid !important`，光加 `[hidden]` 压不住，必须在 CSS 里用 `!important`。


- 交互：**点击目标单位，在右上角详情面板里出现"招募"按钮**。（已完成）
- 门槛：招募需要消耗一张**招募令**。（已完成）
- 招募令配方：**深邃核心 + 木材**；深邃核心只从摧毁刷怪点获得。（已完成）

野外招募的运行时实现：

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 中立可招募单位的生成 | `Game.spawnFieldRecruits()` + `BALANCE.world.fieldRecruits` | `verify-field-recruit` 14/14 |
| 中立契约（不主动打人、不被自动索敌、基地不误伤） | `TargetingSystem` 的 `isRecruitable` 过滤 + `systems/unitTeam.js` | 同上 |
| 详情面板的招募按钮 | `#selected-recruit` + `Game.recruitSelectedUnit()` | 同上 |
| 归队（换队伍、归属、可控） | `Game.recruitUnit()` + `UnitRegistry.changeTeam()` | 同上 |

要点：

- **队伍只有 player / enemy 两档**，所以野生动物和野外可招募单位都挂在 enemy 队伍里，
  以复用现有的注册、索敌索引、状态条与死亡链路。代价是"enemy 队伍 ≠ 敌人"，
  判定统一走 `systems/unitTeam.js` 的 `isHostileEnemy()`。
  做成**自由函数而不是 UnitEntity 上的 getter**：测试与联机镜像里存在大量普通对象
  充当单位，getter 只在原型上，遇到普通对象会静默变成 undefined，让过滤条件永远为假
  （`test:player-base` / `test:enemy-enchantments` / `test:endless` 三个测试当场挂掉）。
- 每次按队伍清点敌人的地方都要用 `isHostileEnemy()`。已修的三处：基地自动开火
  （**原先会把还没招募的野外单位直接打掉**）、敌方附魔候选人、祭坛光环目标。
- **招募不做距离限制**：用户指定的是"点开面板按按钮"，面板里再要求"必须站到旁边"
  就成了一条界面上看不出来的隐藏规则。招募令本身就是一道命令，远程下达是自洽的。
  要加距离门槛就改 `recruitUnit`，并同时给出提示文案。
- 中立单位**不设 moveGoal / wanderGoal / homePoint**：它们应该守在原地等着被发现，
  给 wanderGoal 会像野生动物一样自己走开。
- 招募按钮**在桌面端也要显示**（`.selected-recruit`），不能照抄"跟随镜头"那种
  只在触屏出现的做法——招募是这一关的核心操作之一。

---

### 开局可通关性（第一座巢穴必须打得下来）

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 出生护卫（2 蛮兵 + 2 弓手） | `BALANCE.world.survivalOpening` + `Game.spawnSurvivalEscorts()` | `verify-island-opening` 10/10 |
| 起始巢穴单独弱化（血量 / 存活上限） | `ISLAND_SPAWN_POINTS[0].nestHealth` + `Game.spawnSpawnPointNests()` | 同上 |
| 打通「巢穴 → 深邃核心 → 招募令 → 招募」的起点 | 同上 + `onSpawnPointCleared` | 同上 |

要点：

- **这是一个"能不能玩"的问题，不是平衡问题。** 用户定稿的招募链是
  「招募令 ← 深邃核心 ← 摧毁巢穴」，也就是**战斗单位本身来自巢穴**。
  出生只有一支木傀儡时，整条链是死循环。实测（改之前）：

  | 出生部队 | 结果 |
  | --- | --- |
  | 只有 1 支木傀儡 | 巢穴 0 伤害，傀儡阵亡 → 判负 `no_units_left` |
  | +1 蛮兵 | 巢穴 0 伤害，全灭 → 基地被拆 |
  | +4 个战斗单位 | 巢穴打到 236/252，全灭 → 基地被拆（差一点，仍输） |
  | +4 个战斗单位，且起始巢穴 120 血 / 存活上限 2 | **巢穴被拆，零损失，基地 70%** |

  所以修法是两条腿：**给出生护卫** + **把起始巢穴单独调弱**。
  两个都是配置值（`BALANCE.world.survivalOpening.escorts`、
  `ISLAND_SPAWN_POINTS[0].nestHealth` / `maxAlive`），要调平衡不用碰逻辑。
- 出生护卫的落点同样必须过 `resolveWalkablePoint`：基地自身有半径 2.25 的寻路阻挡，
  落在里面的单位会一直"想走但一步不动"。
- `nestHealth` 也是**显式白名单**字段，加进 `ISLAND_SPAWN_POINTS` 时必须同时在
  `normalizeSpawnPoint()` 里登记，否则运行时静默丢掉。只改 `health` 不改血条比例
  会让巢穴显示成满血。

---

### 胜负判定（第一次真正会走到）

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 胜：点位全清 **且** 残敌清空 | `SpawnPointSystem.checkVictory()` + `Game.checkSurvivalLevelEnd()` | `verify-island-victory` 12/12 |
| 负：基地被毁 | 同上 | 同上 |
| 负：单位全灭且无补充途径（5 秒宽限） | `Game.survivalStrandedLongEnough()` | 同上 |
| 敌营被毁**不算**海岛关通关 | `Game.updateEnemyCampHealth()` 里的关卡判断 | 同上 |
| HUD 在全清后追加"残敌 N" | `Game.updateHud()` | 同上 |

要点：

- 这套规则**此前一直没有生效**：`SpawnPointSystem.checkVictory()` 每次规划都在算，
  也把 `victoryDeclared` 置了真，但**没有任何地方读它**，所以海岛关从来不会赢。
  接线本身很小，坑在于"逻辑已写"和"逻辑生效"是两回事——本文第 3 节此前把这一条
  记成"逻辑已写，未触发过"，它确实就是字面意思。
- 胜利条件采用方案留白处的**较严**一侧：点位全清 **且** 它们放出来的敌人也清干净。
  口径与 `SpawnPointSystem.aliveByPoint()` 完全一致——**野生动物不算残敌**，
  否则玩家要为了通关满地图找最后一只兔子（当前岛上有 4 只野生动物）。
- 敌营在这张图上是**战术目标，不是通关按钮**：关卡副标题写的是"最终摧毁全部刷怪点"。
  它仍然会开火，打掉它仍然有意义，但摧毁时必须给一句明确提示，不能什么都不发生。
- 单位全灭的判负有一个 **5 秒宽限**，并且排除"重生队列非空 / 开局奖励流程中"两种情况：
  单位死亡与替补入场可能落在相邻帧，不设宽限会在"刚要有人"的瞬间误判失败。
- `survivalCanStillGetUnits()` 目前**恒为 false**，而且刷怪点奖励也救不了这个局面——
  巢穴里的傀儡要靠打掉巢穴才出得来，打巢穴又需要单位。所以"零单位 + 还有巢穴"
  仍然是必输局面，判负是对的。野外招募接上之后这个判断才可能真的返回 true。

---

## 3. 明确未做的部分

| 方案要求 | 状态 |
| --- | --- |
| E 键基地背包界面（现为 I 键）、合成预览 | **已做**（I 键基地库存 + 合成 + 搬运，见第 2 节） |
| 物品快捷栏 | **已做**（数字键 1-9，槽位来自基地里可放置的建筑）。等出现"可使用物品"后再扩展取材范围 |
| 野外招募战斗单位 | **已完成**（中立单位 + 详情面板招募按钮 + 消耗招募令） |
| 战斗兵种的物品背包 | **已做**（战斗单位按需建 6 格背包，可接收工具/武器/附魔石） |
| 同类武器更换 | **已做**：精钢剑 / 狼牙棒 / 长弓，四项判据（家族/射程/投射物/动作）全过才能装 |
| 生产与科技链（树坑种植、熔炉、魔力炉、科研站、附魔台） | **设施已齐**：熔炉 / 魔力炉 / 科研站 / 附魔台 / 树坑 / 箭塔 / 食堂，放置流程统一 |
| 工具制作 | **已做**（木斧/木镐配方 + 搬运给傀儡）；开局那支傀儡仍然白送一套，留着是因为制作链还没接全 |
| 附魔石自主生产（不再依赖附魔卡） | **已做**：科研站 → 附魔工艺 → 附魔台 → 附魔石 |
| 更多科技内容 | **已有三项**：附魔工艺（解锁附魔台）、高效烧炭（熔炉 +1 产出）、采集效率（每次采集 +2）。`effects` 已是可扩展入口 |
| 基地库存面板的信息密度 | **已解决**：改成分段标签页，一次只显示一段，面板高度从溢出屏幕降到约 360px |
| 基地供能之外的其它供能源（魔力炉） | **已做**：烧木炭，半径 16 米内供能 |
| 跨玩家拾取掉落的归属规则 | 方案列为待定；当前保持原归属、不转移 |
| 傀儡来源的形态（成品 vs 制造核心） | 暂定**成品傀儡**（每个点必掉一支），改 `workerReward` 字段即可 |
| 海岛关的"目标剩余"倒计时 | 关卡数据里是 1800 秒，但生存关没有时间限制，到点只显示"已超时"、不结算。属于待定的表现问题 |
| 招募的距离门槛 | 当前**不限制距离**（用户指定的交互是面板按钮）；要加就改 `recruitUnit` 并给提示 |
| 存档 / 联机快照覆盖新系统 | 各系统有 `serializeForSlot`，未接入联机 |

本轮从"未做"转为"已接入并验收"的：死亡掉落的场景表现与拾取交互、附魔成长迁移、
刷怪点清点奖励、胜负判定与软锁边界。

---

## 4. 已知坑（改之前先看这里）

1. **验收脚本自己会骗人。** 本项目在刷怪点这一小块上连续出现过五次由测量层引起的
   假信号（读错字段、漏走菜单步骤、口径错误、把野生动物算成污染等）。
   断言失败时**先怀疑断言**，再去查产品。
   本轮又添了四条，全部是测量层的问题而不是产品的问题：
   （a）"占满格子"不等于"装不下"——木材可堆叠，只要还有一个没堆满的木材格就照样收得下；
   （b）`Inventory.canAccept()` 返回的是**能收下的数量**，不是布尔值，写 `=== false` 必然失败；
   （c）`damageXxx(amount, { isAttack: true })` 会**忽略 amount**，改用
   `BALANCE.*.damagePerAttack`——想打致死必须走非攻击形式；
   （d）按"没有 testTag"之类的启发式认新单位会认到开局那支傀儡，要按 id 差集认。
2. **`unit.spawnPoint` 已被占用**，见上文。
3. **`normalizeSpawnPoint()` 是显式白名单。** 往 `ISLAND_SPAWN_POINTS` 里加的字段
   如果不在那个函数里登记，运行时会**静默丢掉**。`workerReward` 就这么丢过一次
   （现象是奖励函数直接返回 0，也就是"一点报错都没有"）。`name` 也一起丢了很久，
   所以点位名字一直回落成 id。加字段时记得两处一起改。
4. **基地实体坐标**：`Game` 构造函数里取 `playerBasePosition` 的那句跑在 `createWorld`
   之前，拿不到关卡预设，曾退回全局默认 `(0,30)` 与地图差 10 米。现在在
   `worldConfig` 解析完成后补了一次同步，改动时别把这段删掉。
5. **`BALANCE.battlefield`** 是全局常量，会把比走廊大的地图裁掉一圈。
   现在 `Game.battlefieldBounds()` 优先用关卡自己的 `navigationBounds`。
6. **headless 浏览器里 `requestAnimationFrame` 不推进**，游戏主循环等于停着。
   所有帧相关验收脚本都手动驱动 `game.tick()`（固定 dt），并断言
   `elapsedTime` 确实推进了。
7. **驱动 `game.tick()` 时必须定期让出事件循环，否则测不出寻路移动。**
   单位寻路走 Web Worker（`PathfindingSystem` → `postMessage` → `onmessage`），
   一次性 `for (i<N) game.tick()` 的同步循环里 worker 回包永远送不到：战斗单位会
   停在原地"追着目标一步不动"，只有傀儡那种走直线转向的单位会动。
   本轮就因此得出过"全场景 0 伤害"的假结论，差点把平衡结论整个搞反。
   **`verify-field-recruit` 也踩过同一个坑**（写在我学会这条之前），
   表现是"招募来的单位不参战"。外层 `Runtime.evaluate` 需要 `awaitPromise: true`，
   页内代码用 async IIFE：
   ```js
   for (let i = 0; i < ticks; i += 1) {
     game.tick();
     if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
   }
   ```
8. **测"奖励/掉落有没有发出去"要在发放的那一刻记录，不要事后数场上还剩什么。**
   巢穴奖励的傀儡就刷在巢穴旁边，而巢穴旁边正在打仗——它完全可能在同一帧里
   出生又阵亡，事后去数只会得到"没发奖励"这个错误结论。正确做法是给
   `onSpawnPointCleared` 挂一个测试侧 spy，记下返回值。
   同理，掉在地上的深邃核心可能已经被旁边的人捡走了，地上和背包里都要看。
9. **`CombatSystem.applyDamage` 第一件事是闪避判定**，一次 99999 也可能被躲掉。
   测试里要打到目标真的死（循环几次），不能打一下就假定击杀。
10. **隔离测试时不要把巢穴也清掉。** 把所有巢穴清掉＝清空全部刷怪点，
    胜负判定会立刻判胜、关卡结束、系统停止推进——表现为"建造永远完不成"。
11. **`Inventory.remove` 是整笔成功或整笔失败的。**
    `remove('charcoal', 99)` 在库存只有 16 个时会**直接失败什么都不做**，
    于是"我已经把燃料清空了"是个假象，后面的断言全在测一个有燃料的世界。
    清空某个物品必须按实际数量来（`remove(id, countOf(id))`）。
12. **同一段"验收脚本里的反引号"坑又踩了一次**（见第 14 条）。
    为了不让它再靠记性守，加了 `npm run test:scripts-syntax`：
    对 `scripts/` 下所有脚本跑一遍 `node --check`，全量测试会顺带守住它。
13. **队伍判定统一走 `isHostileEnemy()`。** 野生动物与野外可招募单位都挂在 enemy 队伍里
    （只有 player / enemy 两档），所以"清点敌人 / 给敌方上 Buff / 基地自动开火 / 祭坛光环"
    这类地方绝不能用 `team === 'enemy'`。它做成**自由函数**而不是 getter：
    测试与联机镜像里有大量普通对象充当单位，getter 只在原型上，遇到普通对象会静默变成
    undefined，让过滤条件永远为假。本轮先写成 getter，一次挂掉三个测试。
14. **`position: fixed` 的元素 `offsetParent` 恒为 null**，不能用它判断可见性。
    验收脚本要改看 `getBoundingClientRect()` 的宽高 + `getComputedStyle().visibility`。
15. **面板的常驻入口要在构造时就创建**，不要等第一次打开面板时才 `ensureLauncher()`——
    否则"不知道怎么开"的玩家永远看不到入口（符文背包当初也踩过）。
16. **不要用 PowerShell 改源码文件**（`Set-Content` / `Get-Content -replace` 会把 UTF-8 中文
    写成乱码，并且会顺手把注释和代码粘到同一行）。一律走 `write` / `edit` 工具。
    本轮又踩了一次：对验收脚本用 `-replace` 批量改名，整个文件的注释全变乱码、
    连带把 `const victimBag = victim.workerInventory` 改成了自引用。
17. **嵌套模板字符串**：验收脚本的页内代码本身在反引号里，内部再用反引号会直接语法错误，
    **注释里也不行**。这条已经踩过两次，所以加了 `test:scripts-syntax` 兜底。
18. **页内代码抛错时 `Runtime.evaluate` 只回一个 `undefined`。**
    验收脚本的 `ev()` 必须检查 `exceptionDetails` 并把它抛出来，
    否则所有失败都长成 `"undefined" is not valid JSON`，白白多花一轮排查。
19. **`unregisterWorker` 会把 `unit.workerInventory` 置空。** 阵亡链路里必须在注销
    **之前**结算掉落（`Game.dropUnitBelongingsOnDeath` 的顺序不能调换）；
    验收脚本要在死亡前自己留一份背包引用。
20. **符文系统的 slot 与卡牌系统的 playerSlot 不是同一个 id 空间**
    （本地单机实测 `'local-player'` vs `'p1'`）。任何"用单位归属字段改写石头归属"
    的写法都会让石头从玩家 UI 里消失。
21. **验收要看截图。** 两个真 bug（海岛关顶部还挂着波次计数、基地库存入口要等
    第一次打开面板才出现）都不是断言抓到的，是人工看截图看出来的。
    规则/交互断言写得再好，也盖不住"界面上根本不该有这行字"。
22. **`maxHealth` 是绑到属性上的 getter，赋值会抛错。** 想给单位一个"更低的血量上限"
    只能改 `health`（普通字段）并同步 `healthLagRatio`，巢穴的 `nestHealth` 覆盖就是这么做的。
23. **`canPlaceAt(point)` 只读 x/z，但 `buildStructureUnit` 要 Vector3。**
    `confirmPlacement` 现在自己统一转成 Vector3——同一个 API 不该一半接受普通对象、
    一半要求 Vector3，那会让调用方在运行时报 `point.clone is not a function`。
24. **模型部件的 `visible` / `scale` 每帧都会被 `resetAnimatedParts()` 还原。**
    `createUnitModel` 在建模时用 `captureAnimatedDefaults()` 把每个部件的
    位置/旋转/缩放/可见性存进 `userData.bindPose`，之后每帧恢复。
    所以"直接 `part.visible = true`"会被同一帧的后面盖掉，
    表现是"树苗永远不出现、也不长大"，而且**一点报错都没有**。
    要改的是**静息姿态本身**（连 `bindPose` 一起改，见
    `PlantingSystem.applyPartPose()`）。这一条花了整整一轮才查出来，
    最后是靠"手动同步一次能点亮、跑一帧又变回去"的分步探针定位的。
25. **给傀儡设 `controlMode = 'hold'` 会让它彻底停止工作。**
    `UnitLogicSystem` 里"hold 就原地待命"的分支排在"傀儡交给作业系统"**之前**，
    一旦设上，`WorkSystem.updateWorker` 整帧都不会被调用。
    验收脚本里想让傀儡别乱跑**不要**用 hold（那会连带把它派好的活也停掉）。
26. **`ResourceNodeSystem.attach()` 和 `applySnapshot()` 都是显式白名单。**
    给节点状态加字段（比如副产物计数）必须同时改
    `normalizeResourceNodeState`、`serializeResourceNodeState` **和** `applySnapshot`。
    漏掉最后那个不会报错，只会让重载后的树把已经发过的树苗再发一遍。
27. **验收里"某单位有没有开火"不能靠靶子掉血判断。** 靶子旁边往往还有别人在打它
    （护卫、基地、别的塔），"它掉血了"证明不了是这个单位打的；停机那一段更糟：
    别人还在打，于是"它还开着火"这个错误结论会被稳稳地断言出来。
    要用**只属于这个单位**的信号（攻击状态帧数、投射物来源）。
28. **武器耐久差值也不是干净的射击计数器。** 耐久会随时间缓慢回一点
    （实测停机 10 秒耐久反而 +2），拿差值当次数会算出负数。
29. **验收脚本里被传送的靶子会顺手拆掉你下一步要放的建筑。**
    为了测箭塔把野生动物传到塔边上，塔一挪走那只熊就蹲在食堂的建造位置上，
    食堂会在施工期间被打死——表现出来是"登记了又消失"，
    很容易误判成登记逻辑的 bug。跨阶段的测试要**在进入下一阶段前清场**。
30. **验收里的"消耗了多少"要在动作前后立刻量，不要用"初始值 - 结束值"。**
    熔炉一直在产木炭，"给了 60 个木炭，结束时剩 48 个，所以花了 12 个"是错的：
    真实消耗是点击前后的那一笔（20 个），净变化里混进了产出。
    同理，差值算法在有并发来源（生产、采集、卸货）时永远不可靠——
    要量动作本身，就贴着动作量。
31. **按固定秒数驱动的验收容易被时序搞成随机失败。**
    "跑 10 秒，一个周期 8 秒，所以应该做了 1 个周期"在"进来时进度已经攒了一半"
    或者"库存刚好被别的东西占住"时就不成立。改成**按完成的周期数驱动**
    （循环到 `stats.cycles` 增加够数为止），断言就变成确定性的了。
32. **`weapon.maxDurability` 与 `weapon.durabilityCost` 也只有 getter**
    （`bindAttributeGetter` 把武器上的这两项绑到单位 attributes 上）。
    直接赋值抛 "Cannot set property ... which has only a getter"，和第 22 条
    `maxHealth` 是同一类坑。武器换装必须写 `attributes.setBase('maxDurability'/'durabilityCost')`，
    `durability` 才是普通字段。
33. **改功能时记得回头改断言"旧限制"的验收。** `verify-item-transfer` 里有一条
    "战斗单位没有背包"——那是当时的**限制**而不是目标，做完背包之后它必然失败。
    这类断言要连同功能一起改：现在那条改成了"战斗单位有背包并能收东西"，
    另外补了一条"建筑没有背包"（这条仍然成立）。
34. **`Game.itemBagFor()` 这类"按需创建"的访问器要限定对象类型。**
    一开始只判 `unit.id`，于是给基地（`playerBase` 根本不是 UnitEntity）也建出了背包。
    要用 `definition` 作为"这是单位"的判据——`id` 这种东西谁都有。

---

## 5. 验收命令

```powershell
npm run build

# 全量单元测试：应当 63/63（脚本数；单个脚本内部的断言数见各自输出，例如
# test:research 17 条、test:weapons 11 条、test:facilities 8 条、test:planting 8 条）

npm run test:scripts-syntax   # 脚本语法兜底：页内模板里的反引号会让文件直接崩
npm run test:inventory
npm run test:resource-nodes
npm run test:power
npm run test:work-orders
npm run test:work-priority
npm run test:spawn-points
npm run test:drops
npm run test:rune-growth
npm run test:crafting
npm run test:production
npm run test:research
npm run test:planting
npm run test:facilities
npm run test:weapons
npm run test:rune-stones
npm run test:new-enchantments

# 需要的 headless 浏览器（独立 user-data-dir，端口 9235）
$env:ISLAND_CDP_PORT="9235"
node scripts/verify-island-opening.mjs        # 开局可通关性 10 项（会跑 150 秒模拟时间）
node scripts/verify-island-production.mjs     # 放置建筑 + 熔炉生产 16 项（含截图）
node scripts/verify-island-fuel-power.mjs     # 魔力炉燃料供能 9 项（含截图）
node scripts/verify-island-research.mjs       # 科技 → 附魔台 → 附魔石 14 项（含截图）
node scripts/verify-island-planting.mjs       # 树坑种植全回合 10 项（含截图）
node scripts/verify-island-facilities.mjs     # 箭塔/食堂用魔力驱动 11 项（含截图）
node scripts/verify-island-tech-effects.mjs   # 科技真的改运转参数 8 项（含截图）
node scripts/verify-weapon-swap.mjs           # 战斗单位背包与同类换武器 8 项（含截图）
node scripts/verify-island-resources.mjs
node scripts/verify-island-power.mjs
node scripts/verify-island-worker.mjs
node scripts/verify-island-spawn-points.mjs
node scripts/verify-island-drops.mjs        # 死亡掉落全链路 30 项
node scripts/verify-island-victory.mjs      # 胜负判定与软锁边界 12 项（会重载三次关卡）
node scripts/verify-island-rewards.mjs      # 刷怪点清点奖励 14 项
node scripts/verify-base-storage-ui.mjs     # 基地库存与合成面板 16 项（含截图）
node scripts/verify-item-transfer.mjs       # 物品搬运 16 项（合成→交给傀儡→砍树闭环）
node scripts/verify-item-hotbar.mjs         # 物品快捷栏 13 项（含截图）
node scripts/verify-field-recruit.mjs       # 野外招募全链路 14 项（含截图）
node scripts/capture-island-preview.mjs

# 符文石链路（这个脚本用的是 CHECK_CDP_PORT）
$env:CHECK_CDP_PORT="9235"; node scripts/verify-rune-stone-play.mjs

# 关卡启动自检（CHECK_LEVEL_ID 指定关卡）
$env:CHECK_CDP_PORT="9235"; $env:CHECK_LEVEL_ID="island-survival"; node scripts/check-game-boot.mjs
```

基线：全量测试 **56/56**（本轮已把长期失败的 4 条修完，见下）。

那 4 条失败的成因：**全部是断言（或死文案）没跟上后来有意做出的改动，产品侧没有回归**。
唯一的非测试改动是删掉 `deckRules.js` 里那条永远不会再被触发的提示文案。

| 测试 | 真实原因 |
| --- | --- |
| `test:effects-visual-quality` | 5 处断言过期：死亡白烟已从 26 块改为 26 块上升烟 + 18 块贴地扩散带；野火整组已改走主世界层（layer 0，靠 OutlineShader 的暖色豁免避开黑边）；建筑范围环新增了地面填充圆盘（`colorMeshes` 变成 25 且弧段 `renderOrder` 为 1）；Boss 调色板换了值；以及"高宽比"原来把横向巨锤算进体型里量 |
| `test:electric-mage` | 雷云闪电的分段数已从 5 提到 8（为了世界空间宽度更稳定），断言写死了 5。改为断言结构（至少 5 段、每段内核+外辉光、HDR 亮核），不再写死段数 |
| `test:building-range-ring` | 同上的地面填充圆盘 |
| `test:deck-rules` | 「牌组必须含单位卡」这条规则在 `f764db4`（单英雄流派构筑）里被**有意移除**：开局三选一直接给英雄，牌组不再需要单位卡。测试与 `deckValidationMessage` 里那条死文案都没同步，已一并清理 |

---

## 6. 建议的下一步顺序

1. **提交当前状态**。阶段 A～E 加合成面板、野外招募、开局可通关性、科技与附魔台、快捷栏
   都有独立验收证据，全量测试 60/60、十七项游戏内验收全绿、五关启动回归通过，
   是一个干净的提交点；未提交的工作量已经很大（90+ 个文件）。

2. **开局护卫的强度需要真人试玩确认**。现在是"2 蛮兵 + 2 弓手 vs 120 血的起始巢穴"，
   脚本跑出来是零损失、基地 70%——按脚本是稳过的，但脚本不会评估"打起来有没有意思"。
   要调只改 `BALANCE.world.survivalOpening.escorts` 与
   `ISLAND_SPAWN_POINTS[0].nestHealth / maxAlive` 两个地方，不用碰逻辑。

3. **阶段 E 收尾**：树坑种植是唯一还没动的设施；此外只有一项科技，
   方案第 9 节说的"更高级装备和能力"还没有对应科技条目。
   加科技只改 `TECH_DEFINITIONS` + 给配方挂 `tech` 字段，界面会自动多一条。

4. **武器家族只做了三族各两件**（剑/棍/弓）。方案第 6.2 节还提到"射程、投射物、
   攻击事件和耐力参数兼容"以及更细的家族划分（弓可换另一把弓），
   机制已经完整（四项判据都在 `weapons.js`），加武器只是加数据。
   另外武器还没挂科技门（加 `recipe.tech = 'weaponSmithing'` + 一条科技即可）。

5. **更多科技条目**。机制已经通了（`TECH_DEFINITIONS.effects` 加一条就生效），
   但只有三项。方案第 9 节说的"更高级装备"现在有了武器这条链，可以往上接科技了。

6. 开局那支傀儡仍然白送一套工具。制作链接全之后要改成"只发开局那一支"，
   让工具真正成为需要生产的东西。

7. 海岛关的"目标剩余"倒计时（见第 3 节末）需要决定：去掉、改成计时正数、还是给生存关
   一个真的时间限制。这是设计决定，不要默默改掉关卡数据里的 1800。

8. 招募的距离门槛（见第 3 节末）：目前不限制距离。要加就改 `recruitUnit` 并补提示文案。

~~死亡掉落的软锁边界~~ 已在本轮完成（基地被毁 / 单位全灭且无补充途径 → 判负）。

---

## 7. 给下一个会话的提醒

- **需要动 `Game.js`（一万两千行）与 `createWorld.js`（一万行）的接线要自己做，
  不要外包**；文件局部的活（单个数据模块、单个系统）才适合派给子代理。
  这条有实测依据：同样的委派方式，文件局部的任务一次成功，
  而两个需要在 `Game.js` 里定位接缝的任务，一个交出不可用的结果、一个三轮零落盘。
- 别凭感觉判断"上下文快满了"就缩小工作范围。会话上下文用量没有可从工具读到的指标
  （`DSH_*` 环境变量里没有），实际用量以 DSH Web GUI 显示为准。
  本项目进行中有过连续多轮因为误判"上下文饱和"而主动降低产出。
- 每次改完必须跑：`node --check`、`npm run build`、相关测试、以及**五关启动回归**
  （`CHECK_LEVEL_ID` 依次设成 island-survival / snow-valley / emerald-marsh /
  red-desert / dungeon-halls）。
- 帧相关的验收必须在 headless 里手动驱动 `game.tick()`（rAF 不推进），
  并断言 `elapsedTime` 确实增长——否则你测的是"页面打开了"，不是"逻辑跑了"。
- **验收要验链路，不要验"函数存在"。** 本轮真正有价值的发现（`pickUpStone` 改写归属
  导致石头从 UI 消失）不是任何单元测试抓到的，而是端到端脚本里一个
  `stoneCountUnchanged: false` 带出来的。写完接线后，务必写一个驱动真实
  `game.tick()` 的脚本把整条链路走一遍。
