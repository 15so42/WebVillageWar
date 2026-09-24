# 海岛生存改版：实施进度与验收状态

对应方案：`SURVIVAL_LOGISTICS_GAMEPLAY_PLAN.md`
记录日期：2026-09-21。分支：`survival`。版本：0.2.199。

本文只记录**已经落地并有验收证据**的内容，以及**明确未做**的部分。
方案文档里的"建议"不等于已完成；本文与方案冲突时，以本文记录的代码现状为准。

---

## 1. 一句话状态

方案第 12 节的阶段 A、B 完成，**阶段 C 与 D 完成**（刷怪点、清点奖励、死亡掉落、
附魔成长迁移全部接入并有验收），**胜负判定第一次真正会走到**，
**野外招募闭环打通**，
**并且这条闭环现在真的能转起来**（出生护卫 + 弱化的起始巢穴，见"开局可通关性"）；
**物品可以在基地与单位之间搬运，工具可制作，建筑可以放置，熔炉能把木材烧成木炭，
魔力炉烧木炭为周围供能（生产链闭环），科研站解锁科技、附魔台用材料造附魔石
（不再依赖附魔卡），树坑让木材可再生，箭塔与食堂用魔力驱动，
科技能改已经在运转的设施与傀儡，战斗单位有背包且能换同类武器，
可放置建筑有快捷栏，背包与合成合并成一个面板（B 键）**。
方案第 9 节列的设施**全部做完**了。全部改动**未提交**。

**本轮（v0.2.196～0.2.199）做了四件事**：

1. **把背包合并成一个**（v0.2.196）：符文石不再是独立的一套位置表，它就是背包里的
   一件普通物品；基地与单位共用同一套格子与搬运规则；点单位会在它脚下扇形展开
   圆形按钮（背包 / 招募 / 停止）；新增可按块叠加的「魔力石」。细节见第 7 节。
2. **海岛放大一倍并改为平坦地形**（v0.2.197）：水平尺寸全部 ×2、陆地整块等高、
   相机看得更远；顺带修掉一条潜伏的移动边界 bug（单位在大地图上会被一条看不见的
   固定边界挡住，表现为"在原地走"）。细节见第 9.1 节。
3. **木傀儡会用手脚干活了**（v0.2.198）：肩/肘/胯/膝四对关节做出来，
   新增砍树（抡斧）、挖矿（下砸）、攻击三套动作，走路会屈膝、站立不是木桩；
   手里真的握着斧/镐；**砍/挖的产物与木屑/碎石在同一帧出现**。
   顺带修掉一个会让整局永远赢不了的通关判定 bug。细节见第 9.2 节。
4. **可招募单位改成打点产出、血条改白**（v0.2.199）：不再开局散在野外，
   打掉哪个刷怪点就在那个点位上留下它配置的兵种；可招募单位血条为白色，
   招募后恢复友军颜色。细节见第 9.3 节。

**用户提的 6 条需求至此全部落地**（第 7 节记第 1/2/3 条，第 9 节逐条记第 4/5/6 条）。

全量回归 **85/85 通过，0 抖动**：58 个单元测试 + 启动检查 + 悬空调用静态检查
+ 25 项游戏内验收（`npm run regression`）。
本轮新增的单元测试是 `test:inventory-transfer` / `test:mana-stones` /
`test:backpack-ui`（背包改造）、`test:island-terrain` / `test:movement-clamp`（地形改造）、
`test:puppet-rig` / `test:work-swing`（傀儡动作），
新增的验收是 `verify-backpack-ui`（取代 `verify-base-storage-ui`）、
`verify-backpack-transfer` / `verify-island-work-animation` / `verify-island-recruit-source`。
全部改动**未提交**。

### 收官时发现并修掉的最后一处：CSS 级联冲突（影响第 1、3 条）

`verify-island-recruit-source` 在补"扇形菜单真的出现"这条行为验证时，
量到的按钮是 `border-radius: 5px` 而不是 `50%` —— **需求要的圆形图标其实不是圆的**。
根因是 `styles.css` 里有一条全局的桌游按钮皮肤：

```css
body.is-game-active button { border: ... !important; border-radius: 5px !important; ... }
body.is-game-active button:hover:not(:disabled) { transform: translateY(-2px) !important; }
```

它给游戏内**每一个** `<button>` 强制了边框/圆角/底色，`:hover` 还强制 `transform`。
两个后果都是实打实的显示错误：

1. 圆角被压成 5px（圆形图标变胶囊）；
2. **悬停时 transform 被整条替换**，扇形按钮会从自己的位置上跳回单位脚下
   ——扇形偏移本来就写在 `transform: translate(calc(-50% + var(--action-x))...)` 里。

修法：这两处按钮样式同样用 `!important`，并把选择器写得比 `body.is-game-active button`
更具体（0,2,1 > 0,1,2）；同时补 `aspect-ratio: 1`，因为 `border-radius: 50%` 作用在
52×40 上得到的是椭圆而不是圆。顺带覆盖了会伤到需求或明显错位的另外三处：
配方磁贴的"灰色不可合成"（原来只靠 `filter: grayscale`，而全局底色本身就是灰渐变，
灰度化之后看不出区别）、当前标签页高亮、格子内「放置/装备」小按钮的定位 transform。

**这条只能靠真实交互或计算样式发现**：源码级断言（`test:backpack-ui` 读的是 CSS 文本里
有没有 `border-radius: 50%`）完全测不出来——文本里确实有，只是被另一条 `!important` 压掉了。
所以新验收读的是 `getComputedStyle(button).borderTopLeftRadius`。

---

## 2. 已完成并且有独立验收的部分

### 生存化改造（进行中）

用户已确认的新方向：**彻底移除卡牌 RTS 那一套，改成纯生存游戏**。

- 主菜单只保留「开始游戏」与「更新日志」，点开始游戏**直接进入场景**
- 不需要关卡选择，地图以基地为中心、由近及远分布刷怪点
- 加入昼夜循环：怪物在黑夜进攻，随天数增长
- 已确认的决定：删除卡牌相关（保留联机入口但暂不可用）；刷怪点**永久可摧毁，清光即通关**；
  一天 = 白天 5 分钟 + 黑夜 3 分钟（数值可配）

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 0 | 提交改造前的状态作为回退点 | **已完成**（`64f0f48`，v0.2.187） |
| A | 启动路径：主菜单收敛 + 开始游戏直接进场景 | **已完成**（v0.2.188） |
| B | 移除卡牌系统、军需铺、炼金工坊、附魔图鉴及其调用点 | **已完成**（v0.2.193）：`CardSystem.js` / `CardEffectSystem.js` / `LootDropSystem.js` / `deckRules.js` / `waveRewardPool.js` 已删除；符文美术与战场提示拆成独立模块 |
| C | 昼夜循环 + 夜袭（怪物只在黑夜出兵、随天数增长） | **已完成**（v0.2.194）：白天 5 分 / 黑夜 3 分；白天冻结出兵、入夜按天数加量加强；灯光与 HUD 跟随昼夜 |
| D | 清理遗留（不可达的老地图与相关测试脚本）、文档与全量回归 | **已完成**（v0.2.195）：`LEVEL_DEFINITIONS` 只留 `island-survival`；旧关卡 id 映射到海岛；世界生成预设仍可给预览/调试用 |

阶段 A 的要点：

- **启动前置收敛成一个函数**：`scripts/lib/enter-game.mjs` 的 `enterSurvivalGame()`。
  此前 22 个脚本各自点三下菜单（选关 → 选关卡 → 开始），改菜单会让它们一起失效；
  现在每脚本只有一行，改入口不会再漏改。
- **空牌组直接进场景是可行的**：实测 `deck: []` 下海岛场景正常启动
  （木傀儡 + 2 蛮兵 + 2 弓手、4 个刷怪点、0 页面报错）。这为阶段 B 移除卡牌扫清了前提。
- **启动回归收窄到生存地图**：`check-game-boot.mjs` 现在验的是
  「菜单只有 start-game/coop/changelog/clear-save → 点开始游戏 → sceneKey 是 island-survival
  → 画布有尺寸 → 页面无报错」，并**额外断言主菜单没有残留旧入口**，
  同时把菜单截图写到 `outputs/boot-menu.png`（菜单是这一版改动最大的界面，留图便于复核）。
  **代价说清楚**：雪谷/沼泽/红漠/地牢这 4 张老地图失去启动覆盖——它们现在不可达，
  属于待定去留的遗留内容（用户选择"只删卡牌相关、保留联机"，所以暂未删除）。

阶段 B（卡牌移除）第四里程碑——**军需铺、开局三选一、波次奖励全部删除**：

- `Game.js` 从 **13276 行降到 9936 行**（少 3340 行）。删掉的东西：
  - 军需铺 **64 个方法**（界面、商品目录、Boss 整备、专精、补给、联机同步）
  - 开局三选一 / 策略事件与联机奖励等待 **40 个方法**
  - 波次奖励 **10 个方法**（银币、卡池、自动跳过）
  - 模块级辅助函数 9 个（军需铺 DOM 构造、策略事件 UI）+ 两个军需铺模块文件
  - 4 个卡牌时代测试脚本（军需铺 ×3、卡牌升级 ×1）与 3 个卡牌时代测试（能量经济、波次奖励池、开局奖励序列）
- 银币随军需铺一起消失（没有别的来源与用途）；`grantKillSilver` / `updateSilverHud` 一并删除。
- **删除方法论**（值得沿用）：
  1. **先删叶子文件，让构建器当预言机**——Vite 解析 import 时精确报出每个坏掉的引用，比 grep 全。
  2. **按方法名整块删除**，而不是"方法体里提到了某关键词"——后者会把 `withPlayerContext`、
     `onKeyDown`、`destroy` 这些**只是引用**它的方法也误删，而那些必须保留、只改调用点。
  3. 删完之后用**悬空调用静态检查**兜底（见下），而不是靠启动一次报一个错误。
- **新增 `scripts/check-dangling-calls.mjs`**：静态列出 `this.xxx(` 调用了但文件里没有定义的方法名。
  删方法之后，残留调用点只在"那条路径真的跑到"时才抛错，启动检查会漏（有些路径启动阶段不跑）。
  这个检查一次性列出全部——本轮它一次报出 8 个悬空方法 / 10 处调用，否则要启动十次。
  已纳入 `npm run regression`。
- **新增 `npm run regression`**：一条命令跑完 56 个单元测试 + 启动检查 + 悬空调用检查 + 21 项游戏内验收。
  失败自动重试一次，但把"重试才过"打印成 `PASS(retry)` 并列进"抖动项"——抖动可见，不会被当成正常通过吞掉。
  （此前这份清单只存在于每次手敲的命令行里，容易漏项也没记录。）

阶段 B（卡牌移除）第三里程碑——**附魔图鉴与炼金工坊已删除**：

- 删掉 `src/data/enchantmentEncyclopedia.js`（附魔百科数据）与 `renderEnchantmentEncyclopedia()`
  视图、`renderUpgrades()` / `upgradeCard()` / `upgradeCost()` 与 `CARD_UPGRADE_INITIAL_COST`
  （炼金工坊 = 卡牌升级），以及主菜单与结算屏上的对应入口。
- 删掉单元测试 `scripts/test-meta-upgrades.mjs`（它测的就是卡牌升级费用）与 package.json 里的条目。
- 做法：**先删叶子文件，让构建器当预言机**。Vite 解析 import 时会精确报出每个坏掉的引用，
  比 grep 全；每删一处就跑一次 build + 启动检查。

**军需铺的删除清单（已量好，下一轮直接执行）**：`Game.js` 里 **80 个方法 / 2473 行**
（约占该文件五分之一），另有模块级辅助函数 `createRunShopUi` / `ensureRunShopUi` /
`runShopSupplyItemMarkup` / `runShopServiceOptionMarkup` / `runShopChoiceUsesCardFace`
（约 11435–11590 行）。方法体之外的调用点必须跟着改：

| 位置 | 说明 |
| --- | --- |
| 构造函数 | `this.runShopUi = createRunShopUi()`、`bindRunShopUi()`、`document.body` 上的军需铺开关 |
| `destroy()` / `onKeyDown` | 军需铺的关闭与 Esc 处理 |
| `updateWaveFlow` / `completeCurrentWave` / `tryAutoSkipRunShopReward` | 波次结束触发军需铺（波次本身就是卡牌时代的） |
| `withPlayerContext`（**59 处**） | 联机按玩家分发时会走军需铺 |
| `updateSilverHud` / `grantSilver` / `grantKillSilver` | 银币是军需铺货币，军需铺没了它也没有用途 |
| `applyNetworkPrivateUi` / `applyNetworkShop*` / `finishCoopRunShop` / `openCoopRunShopForAll` | 军需铺的联机同步（用户已确认：**卡牌与军需铺相关的联机逻辑可以删，同步层保留**） |

**验收脚本的批量偶发**：连续跑 21 个脚本时，先后有 `verify-field-recruit` 与
`verify-rune-stone-play` 各失败一次、单独跑必过。定位为共享启动前置的等待预算在负载下不够，
已把 `enterSurvivalGame` 的预算从 24 秒提到约 40 秒并增加一次补点；之后批量 21/21 稳定通过。

阶段 B（卡牌移除）第二里程碑——**生存关不再经过任何卡牌时代流程**：

- 用探针（进入游戏后读状态 + HUD 可见性）查清"点开始游戏之后还有什么卡牌时代的东西在打断游戏"，
  结果比预期严重：`awaitingOpeningReward: true`、`pendingStrategyRewards: 2`、`strategyEvent: true`、
  `body.is-strategy-event-open` —— **开局三选一仍在排队并把游戏暂停住**，
  也就是说真人点开始游戏会迎面撞上一个卡牌选择弹窗；此外波次计数、手牌区、银币都还在界面上。
  （此前 21 个验收脚本都在开头手动清掉这些字段，所以这个问题一直没被暴露。）
- 启动分支为生存关单独开一条：不排开局奖励、不开策略事件，直接 `setupSurvivalOpening()`。
- 界面用 `body.is-survival-level` + 独立样式文件 `src/survivalUi.css` 收敛，
  压掉手牌区与银币。**刻意不压 `.wave-command-panel`**：生存关的顶部 HUD
  （目标剩余 + 刷怪点清除进度）就住在那个面板里，压掉会顺手把有用信息藏了。
- `check-game-boot.mjs` 增加两组断言把状态固定住：进入场景后不得有开局奖励/策略事件/暂停，
  且手牌与银币 hidden、波次计数 hidden、刷怪点进度 VISIBLE。
- **量可见性要沿祖先链**：探针一开始只读元素自身的 `computedStyle`，
  把"父元素带 hidden"的银币误报成 VISIBLE，害我顺着错线索改了一轮 CSS。

阶段 B（卡牌移除）第一里程碑：

- **做法是"先让运行时说话"**：`CardSystem.js` 有 3718 行、被 29 个文件引用、`Game.js` 里
  108 处提到它。靠 grep 列不全耦合点，所以直接在非联机分支里 `this.cardSystem = null`，
  再跑一遍全部验收——运行时给出的答案很干脆：
  **只有一处未加保护的调用打断了整帧**（`updateCardSystems()` 里 `cardSystem.update`），
  它一抛错，后续所有系统当帧都不再推进，于是 20/21 个验收脚本一起失败。
  删掉卡牌的每帧更新（连同两处 `runStep/runPerfStep` 调用）之后立刻回到 20/21。
- **符文石改成不经过卡牌**：新增 `RuneStoneSystem.createEnchantmentStone()`
  （带放置检查的无卡造石入口），附魔台与验收脚本共用它；原来的 `createFromCard()`
  退化成"解析卡 → 转交"，等文件删除时一起消失。
- **`verify-rune-stone-play` 此前永远 `process.exit(0)`**：它只打印报告、从不判定，
  所以任何回归都不会被发现——我数它进"21 项通过"其实是虚的。现在补了 13 项判定。
  补判定的同时暴露出它两个一直空转的断言：
  （a）取靶用的是 `spawnEnemyWave(1)`，而**海岛关不跑旧波次流程**，这个调用在这里是空操作，
  于是 `victim` 长期是 undefined、"击杀获得魔力"从来没被真正验证过；
  （b）"出售返还金额"依赖卡牌能量，卡牌移除后无从判定，已改为只验"石头消失 + 同名备用石接管"。
- **待你定的设计空档**：符文石**出售后该换回什么**。原本返还卡牌能量（已移除），
  现在 `sellStone` 卖出去没有任何回报。三个方向：换成材料（与附魔台成本对应）、
  换成银币、或者干脆去掉出售。
- **观察到的偶发**：`verify-field-recruit` 在一次批量回归里失败、单独跑 3/3 通过。
  批量是连续对同一个浏览器跑 21 个脚本，怀疑是负载下的等待超时，不是产品回归；
  但我没有再复现，所以只记录、不当成已修。

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

> ⚠️ **本节描述的是 v0.2.199 之前的状态，已被 v0.2.200 取代**（用户本轮需求 3：
> 「玩家一开始应该没有任何战斗单位」）。出生护卫已经取消（`escorts: []`），
> 替代路径是"合成傀儡武器 → 装给木傀儡 → 它自己去打"，逐条记录见 §10.2。
> 下面这张表和实测数据保留下来是为了说明**问题为什么曾经存在**，不要照着它改回去。

| 能力 | 入口 | 验收方式 |
| --- | --- | --- |
| 出生护卫（2 蛮兵 + 2 弓手） | ~~`BALANCE.world.survivalOpening` + `Game.spawnSurvivalEscorts()`~~ | 已取消；`escorts: []` |
| 起始巢穴单独弱化（血量 / 存活上限） | `ISLAND_SPAWN_POINTS[0].nestHealth` + `Game.spawnSpawnPointNests()` | `verify-island-puppet-combat` |
| 打通「巢穴 → 深邃核心 → 招募令 → 招募」的起点 | 同上 + `onSpawnPointCleared` | 同上（`starterNestDestroyed` / `nestClearGrantsNextUnit`） |

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

**首选一条命令**：`npm run regression`（= `node scripts/run-regression.mjs`）。
它按顺序跑全部 61 个 `test:*` 单元测试脚本 → `check-game-boot` →
`check-dangling-calls` → 25 项游戏内验收，失败重试一次并把"重试才过"单独记成**抖动**。
它自己会设好浏览器端口，并且在每两项游戏内验收之间等 1.5 秒
（见 `VERIFICATION_SETTLE_MS` 的注释：验收脚本会把截图写进 `outputs/`，
那会触发 Vite 整页重载，重载落在下一个脚本的 evaluate 里就会报
`Inspected target navigated or closed`，让无辜的脚本变红）。

```powershell
npm run build

# 全量单元测试：应当 61/61（脚本数；单个脚本内部的断言数见各自输出，例如
# test:puppet-arms 26 条、test:threat-field 14 条、test:resource-priority 21 条）

npm run test:scripts-syntax   # 脚本语法兜底：页内模板里的反引号会让文件直接崩
npm run test:inventory
npm run test:resource-nodes
npm run test:power
npm run test:work-orders
npm run test:work-priority
npm run test:puppet-arms      # 木傀儡战力：打还是逃
npm run test:threat-field     # 威胁度二维数组
npm run test:resource-priority # 资源优先级 → 采集需求
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
node scripts/verify-island-puppet-combat.mjs   # 开局编制/威胁/逃跑/迎战/拆巢奖励 17 项
node scripts/verify-island-production.mjs     # 放置建筑 + 熔炉生产 16 项（含截图）
node scripts/verify-island-fuel-power.mjs     # 魔力炉燃料供能 9 项（含截图）
node scripts/verify-island-research.mjs       # 扇形菜单开科研站/附魔台 → 附魔石 16 项（含截图）
node scripts/verify-island-planting.mjs       # 树坑种植全回合 10 项（含截图）
node scripts/verify-island-facilities.mjs     # 箭塔/食堂用魔力驱动 11 项（含截图）
node scripts/verify-island-tech-effects.mjs   # 科技真的改运转参数 8 项（含截图）
node scripts/verify-item-hotbar.mjs           # 屏幕底部快捷栏 + 真拖拽 16 项（含截图）
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

## 7. 统一背包与单位交互菜单（本轮：需求 1 / 2 / 3）

用户这一轮提了 6 条，本节记录**第 1、2、3 条**的落地（第 4、5、6 条见第 9 节"未做"）。
接口细节另有一份专门文档：`docs/BACKPACK_UI_CONTRACT.md`。

### 7.1 做了什么

| 需求原文 | 落地 | 验收 |
| --- | --- | --- |
| 点击单位后应该在单位下方扇形展开交互 UI，圆形图标加下方文字（比如背包、招募） | 新增 `src/systems/UnitActionMenu.js` + `src/unitActionMenu.css`：单选一个单位时按世界坐标投影在它脚下扇形展开圆形按钮（背包 / 招募 / 停止） | `test:backpack-ui`、`verify-backpack-ui` |
| 屏幕左下角不应该有符文背包按钮 | `RuneBackpackUi.js`、`BaseStorageUi.js`、`runeBackpack.css`、`baseStorage.css` 全部删除；不再有任何常驻背包按钮，B 键与"点单位"就是入口 | `test:backpack-ui` 断言这四个文件不存在、源码里不再出现 `rune-backpack-button` |
| 背包就是背包，不止放符文，还能放其他东西 | 符文石**改成库存物品**（详见 7.2），与材料/工具/魔力石共用同一批格子 | `test:mana-stones`、`verify-backpack-ui` |
| 魔力石提高最大魔力，类似电池；不可堆叠，占多个背包，效果叠加 | 新增 `ITEM_DEFINITIONS.manaStone`（`kind: 'instance'`、`stackLimit: 1`、`manaBonus: 15`）+ `src/systems/manaStones.js`（纯规则）；`Game.refreshUnitManaCapacity()` 把加成算进 `unit.manaCapacity` | `test:mana-stones` 10/10（含"反复重算不会越堆越高"） |
| 按 B 打开基地背包：左侧 6x8=48 格 | `ITEM_RULES.baseInventorySlots: 48`；`BackpackUi` 按 8 列铺格子 | `test:backpack-ui`、`verify-backpack-ui` |
| 右侧显示已解锁的合成配方网格，灰的表示材料不足，悬浮显示详情 | 右侧三段（合成网格 / 科技 / 附魔台）；不可合成加 `.is-locked`（`filter: grayscale`）；悬浮填充 `[data-backpack-detail]` | `verify-backpack-ui` |
| 点击后产物 UI 跟随鼠标，再点背包空格放下 | `BackpackUi.craftInto()` 合成后用 `removeInstance` 把**刚做出来的那一件**取到 `ui.cursor`，`.backpack-cursor-ghost` 跟随指针；`handleSlotClick()` 落格 | `test:backpack-ui`、`verify-backpack-ui` |
| 屏幕下方有一行快捷栏 | 面板底部 9 格 `[data-backpack-hotbar-slot]`，点一下走 `Game.activateHotbarSlot()`（`src/systems/HotbarUi.js` 的常驻快捷栏保留） | `verify-item-hotbar`、`verify-backpack-ui` |
| 物品按右下方数量、符文石等级显示在左上角 | `.backpack-slot-count`（`right:3px; bottom:1px`，数量 > 1 才出现）、`.backpack-slot-level`（`top:1px; left:3px`，仅符文石） | `test:backpack-ui` 直接断言 CSS 定位 |
| 物品转移和《我的世界》一样 | `src/systems/inventoryTransfer.js`：左键拿整叠 / 右键拿一半 / 同类合并 / 异类交换 / 关面板自动放回原处 | `test:inventory-transfer` 18/18（每条都断言物品守恒） |

新增/改动的文件：

- 新增：`src/systems/BackpackUi.js`、`src/systems/UnitActionMenu.js`、`src/systems/itemArt.js`、
  `src/systems/manaStones.js`、`src/systems/inventoryTransfer.js`、`src/backpack.css`、
  `src/unitActionMenu.css`、`docs/BACKPACK_UI_CONTRACT.md`
- 删除：`src/systems/RuneBackpackUi.js`、`src/systems/BaseStorageUi.js`、
  `src/runeBackpack.css`、`src/baseStorage.css`、`scripts/test-rune-backpack-ui.mjs`、
  `scripts/verify-base-storage-ui.mjs`
- 重写：`src/systems/RuneStoneSystem.js`（库存化）、`scripts/test-backpack-ui.mjs`
- 验收脚本新增/改名：`scripts/verify-backpack-ui.mjs`（取代 `verify-base-storage-ui.mjs`）、
  `scripts/verify-backpack-transfer.mjs`（跨容器搬运，见 7.6）

### 7.2 关键决定：符文石住进背包

这是本轮唯一一处**数据层**改造，也是"背包就是背包"这句话真正的落点。

| | 旧 | 新 |
| --- | --- | --- |
| 石头存在哪 | `RuneStoneSystem.stones[i].location = {kind:'base'/'unit'}` 一套独立位置表 | `game.baseInventory` / `game.itemBagFor(unit)` 的某个格子（`itemId: 'runeStone'`，`instanceId` 就是石头 id） |
| 容量 | `unitRuneCapacity()` / `baseRuneCapacity()` 两套 | 就是背包格数（基地 48 / 傀儡 16 / 战斗单位 10） |
| 搬运 | 符文系统自己的 `moveStone` 改写 location | 库存的原子转移；`location` 变成**读出来的**（`stoneForSlot()` 读到时顺手写回） |
| 掉落 | `location.kind = 'ground'` 不占格子 | 同样的 ground 语义，但拾取是"从原容器搬进新容器" |

两条纪律写在 `RuneStoneSystem` 的注释里，也写进了契约文档：

1. `this.stones` Map 是**等级/魔力/成长的权威**，格子里的 `data` 是**投影**；
   任何改动都要 `writeThrough()` 写回格子，否则存档与掉落会带着旧等级跑。
2. 落点（`stone.location`）是**读出来的**：`stoneForSlot()` 在被读到时把 location 写成
   它所在容器的位置，所以查询即重建，不需要额外的失效通知。

**踩到的坑（值得记）**：`pickUpStone()` 原本在"石头已经在某个背包里"时直接返回
`{ok: true, alreadyHeld: true}`——那在旧模型下是对的（石头没有位置=在地上），
在库存化之后却是错的：石头默认就在基地背包里，于是"拾取"变成了空操作，
`test:new-enchantments` 里"把石头装到单位身上"这一步静默失效。
现在它改成真正的**搬运**（取出 → 放入 → 放不进去就回滚），并在搬走时重算**原持有者**的
附魔与最大魔力——否则会出现"石头已经在你身上了，原来的主人还在享受加成"。

### 7.3 魔力石：为什么基础值要单独记

`Game.refreshUnitManaCapacity(unit)` 的定义是
`effectiveManaCapacity(unit.baseManaCapacity, bag)`，**每次都从基础值现算**。

如果直接拿 `unit.manaCapacity` 当基数去加，那么每次刷新（搬运、拾取、每帧的某个钩子）
都会再加一遍 15，十次之后傀儡的最大魔力就成了 210。所以：
`unit.baseManaCapacity` 是唯一的基础值来源（傀儡 60、设施配方各自的 `manaCapacity`），
`WorkSystem` / `ProductionSystem` / `FacilitySystem` 三个登记点都只写基础值。
`test:mana-stones` 里有一条专门把这个错误钉住（连刷 5 次必须仍然是 90）。

### 7.4 配方解锁的判据

需求原文是「基地背包获得任意物品后就解锁相关配方」。落地为
`BackpackUi.seenItemIds`：**配方里任意一种材料曾经出现在基地背包里，这条配方就出现**。

推论（写验收脚本时必须知道）：想让某个配方出现，先 `game.baseInventory.add(<任一材料>)`
再 `ui.refresh()`。这直接影响了 5 个 island 验收脚本——它们的
`[data-craft-recipe="X"]` 选择器要同时改成 `[data-backpack-recipe="X"]`。

另外两个连带改动，都是旧脚本在"合成后立刻读库存"时暴露的：

- **产物跟鼠标走**：`craftInto()` 会把产物从基地背包**取出来**放到 `ui.cursor`。
  所以旧脚本"点配方 → 读 `inventory.countOf(itemId)`"必然读到 0。
  正确写法是再点一个空格放下（这也正是需求要求的操作流程），5 个脚本已按此更新。
- **科技锁住的配方仍然不出现在列表里**（`recipeStatus()` 过滤），而不是"显示成灰的"。
  显示成灰的是"材料不足"，两者不是一回事。

### 7.5 新增的单元测试

| 测试 | 覆盖 |
| --- | --- |
| `test:inventory-transfer` 18/18 | 移到空格 / 同类合并 / 异类交换 / 实例身份保持 / 自动找位 / 装不下整笔失败且两边不变 / 右键拿一半放一个 / 塞进指定格返回余量；**每一条都断言物品守恒** |
| `test:mana-stones` 10/10 | 实例且不可堆叠 / 两格同步 / 加成线性叠加 / 有效上限=基础+加成 / 符文石与材料不加成 / 反复重算不越堆越高 / 移走后加成消失 / `maxPerUnit` 可配 |
| `test:backpack-ui` 21/21 | 旧面板与入口已删除 / E 与 B 的分工 / Esc 关闭 / 6x8=48 / 数量右下与等级左上 / 灰显与悬浮详情 / 产物跟鼠标 / 关面板归还 / 底部 9 格快捷栏 / 见过材料才解锁 / 扇形圆形菜单 / 样式入口 |

### 7.6 一次被验收脚本抓出来的界面退化（已修）

合并两个面板的第一版**只画了一块网格**（单位视图画单位的、基地视图画基地的）。
后果不是"少了点装饰"，而是**功能没了**：基地与单位之间没有任何可点的落点，
玩家能合成、能捡、能背，却没办法把基地里那把手斧交给傀儡——
`Game.transferBaseSlotToUnit()` 这些原子接口都还在，但 DOM 里一个搬运节点都没有。

这是委派出去的子代理在改验收脚本时发现的（它照旧脚本的意图找搬运入口，
发现只有 Game 层 API、没有界面路径）。发现方式值得记：**子代理的任务是让旧脚本变绿，
而"旧脚本能过"和"玩家点得到"是两件事**——它老老实实报告了"只能驱动 Game 层入口，
界面路径不存在"，而不是把脚本改成绕过界面就算完。

修法：单位视图改成**同时画两块网格**（单位的 + 基地的），与《我的世界》里
"打开箱子时同时看到自己的背包"同构。每格带 `data-backpack-container`，
`handleSlotClick()` 按格子所属容器落格，于是"从基地拿起、往单位放下"天然成立。

新增 `scripts/verify-backpack-transfer.mjs` 专门守这条路径（12 项判定），
它用**真实 `pointerdown` 事件**驱动，而不是直接调 API，断言包括：

- 单位视图确实有两块网格（单位 16 格在前、基地 48 格在后）且每格都标了所属容器；
- 点基地那块的斧子 → 上手（`.backpack-cursor-ghost` 出现）→ 点单位那块空格 → 落格，
  `instanceId` 不变，作业系统的工具缓存**已经被通知**（直接读 `record.pack.toolSet`，
  刻意不调 `refreshPack`，否则测的是"能算出来"而不是"被通知了"）；
- 反向搬回基地同样成立、`instanceId` 仍不变；
- 符文石搬进单位背包 → 附魔生效；搬回基地 → 附魔失效；
- 魔力石搬进单位背包 → 最大魔力 60 → 75；两块 → 60 → 90；搬回 → 回落；
- 关面板时手上还拿着 7 个石头 → 自动放回，一个不少。

### 7.7 已知缺口（本轮没做）

- 快捷栏的槽位来源仍然是"基地里当前可放置的建筑"（沿用 `Game.hotbarItems()`），
  **还不能手动把某件物品钉到某个槽位**。需求里"使用对应物品"那一半暂时没有可使用的物品。
- 垃圾桶只能销毁符文石，而且**销毁没有任何回报**（卡牌能量已经不存在）。
  这条从上一轮就挂着，本轮没动：三个方向仍是"换成材料 / 换成货币 / 干脆去掉"。
- 面板在窄屏（< 980px）下会退化成上下两栏，没有做更细的移动端适配。

---

## 8. 给下一个会话的提醒

- **需要动 `Game.js`（一万两千行）与 `createWorld.js`（一万行）的接线要自己做，
  不要外包**；文件局部的活（单个数据模块、单个系统）才适合派给子代理。
  这条有实测依据：同样的委派方式，文件局部的任务一次成功，
  而两个需要在 `Game.js` 里定位接缝的任务，一个交出不可用的结果、一个三轮零落盘。
- 别凭感觉判断"上下文快满了"就缩小工作范围。会话上下文用量没有可从工具读到的指标
  （`DSH_*` 环境变量里没有），实际用量以 DSH Web GUI 显示为准。
  本项目进行中有过连续多轮因为误判"上下文饱和"而主动降低产出。
- 每次改完必须跑：`node --check`、`npm run build`、相关测试、以及
  `npm run regression`（生存关启动 + 悬空调用 + 游戏内验收）。
  雪谷 / 沼泽 / 红漠 / 地牢已从可玩关卡目录移除，不再做五关启动回归。
- 帧相关的验收必须在 headless 里手动驱动 `game.tick()`（rAF 不推进），
  并断言 `elapsedTime` 确实增长——否则你测的是"页面打开了"，不是"逻辑跑了"。
- **验收要验链路，不要验"函数存在"。** 本轮真正有价值的发现（`pickUpStone` 改写归属
  导致石头从 UI 消失）不是任何单元测试抓到的，而是端到端脚本里一个
  `stoneCountUnchanged: false` 带出来的。写完接线后，务必写一个驱动真实
  `game.tick()` 的脚本把整条链路走一遍。

---

## 9. 需求 4 / 5 / 6 的逐条记录（三条都已完成）

用户这一轮一共提了 6 条：第 1/2/3 条见第 7 节，第 4/5/6 条分别是下面三节，
分别在 v0.2.197 / v0.2.198 / v0.2.199 完成。每节都保留了开工前的侦察笔记，
并把"实际与侦察不符"的地方标注出来。

### 9.1 场景放大一倍并改成平坦地形 —— **已完成**（v0.2.197）

落地方式与三处关键发现：

- **放大**：海岛预设里所有水平长度 ×2 —— `landmass.lobes`（主岛 46×40 → 92×80）、
  `ground`（200×184 → 400×368）、`navigationBounds`（±58/±54 → ±116/±108）、
  `pathPoints`、基地/敌营、`clearings`、`altars`、`wildlife`、`monsterCamp`、
  `resourceZones`、`shadowExtent`、`fogNear/fogFar`、`sunPosition`，以及
  `gameData.js` 里的 `ISLAND_SPAWN_POINTS` 与 `BALANCE.world.fieldRecruits`。
  **垂直方向不动**（`baseHeight` 仍是 1.35）：抬高陆地不是"场景放大"的一部分。
- **新增 `camera` 预设块**：岛放大后默认最远 78 只够看到六分之一，
  这张图单独给了 `distance 57 / min 20 / max 160`（`Game.applyInitialCameraConfig` 支持）。
- **平坦**：`terrain.flat: true` → `islandSurvivalHeightAt()` 直接返回 `baseHeight`。
  之所以不是"把 hills/ridges 清空"：清空之后仍然留着沙滩混合、基地平台混合与
  靠海粗糙度衰减三处高度变化，加起来依然是一层可感知的起伏。
  海岸线之外照常下沉到海床（那是海，不是起伏；否则岛会变成悬在水上的板）。
- **着色器必须一起改**：`applyGroundShader` 里有一层 `snoise * 0.12` 顶点位移，
  只改 CPU 高度会让"玩法是平的、画面还在抖"，单位看起来悬空或陷地，
  瞄准圈与范围提示全部错位。现在 `flatTerrain` 与 `storybookSnow` 一样会关掉它。
- **资源密度是显式决策**：面积变成 4 倍，数量只 ×2，也就是**密度减半**。
  刻意不按面积 ×4（那会把节点从约 141 推到 564，而放大后的导航网格本身已经从
  145×135 涨到约 290×270 格）。密度是平衡旋钮，改 `resourceZones[].count` 即可。

**两处侦察结论与实际不符**（已按事实纠正，原侦察笔记保留在下面备查）：

1. 侦察说"基地/敌营有 16m/14m 的强制陆地保留区，需要一起放大"——实际是
   `landmassMaskAt` 里写死的常量，**不是**配置值；而且因为两者的归一化位置没变，
   根本不需要动（我一开始照着侦察把它写成"32m/28m"，随后读码纠正了）。
2. 侦察说"要检查 `BALANCE.world.ground/pathPoints` 这些回退值"——海岛预设本身
   就定义了 `ground`/`pathPoints`，只有 `fieldRecruits` 真的走 `BALANCE` 回退
   （所以只有它需要同步）。判据是 `world.config.X ?? worldConfig ?? BALANCE.world.X`。

**并且抓出一条潜伏很久的真 bug（本次最大的收获）**：

`MovementAgent.clampToBattlefield()` 用的是**写死的** `BALANCE.battlefield`
（x ±42、z −40..40），而镜头与落点校验早就改成了 `Game.battlefieldBounds()`
（按地图自身的 `navigationBounds` 算）。两套边界不一致的后果极其隐蔽：

- 单位在导航分支里每帧朝目标走一步，紧接着被拉回那条固定线；
- `moveToward()` 返回 **true**、`aiState` 是 `moving`、`visualState` 是 `walk`，
  但 `position` 一动不动——从表面看完全像"寻路坏了"；
- 旧地图的内容恰好都在线内（基地 z=20、首巢 z=30），所以从没暴露；
- 岛放大之后基地正好落在 z=40 上，**去北边巢穴的护卫全部卡死在 z=40.00**，
  `nestDamageTaken: 0`，整条开局链（打巢穴 → 拿深邃核心 → 招募令）直接断掉。

定位过程值得记一笔（因为我先猜错了两次）：

1. 先猜"测试的模拟时长没跟着地图放大"——但 `verify-island-opening` 有 150 秒模拟时间，
   走 30 米绰绰有余，站不住。
2. 再猜"平坦地形让某个『安全地表』判据失效"——于是把 `flat` 临时改回 `false` 跑一次：
   **同样失败**。一次实验就排除了这个方向，比继续推理快得多。
3. 然后写临时探针把护卫每 5 秒的位置/状态/路径长度打出来：位置从第 5 秒起完全不变，
   却都处于 `walk/moving` 且有 33–37 个路径点。
4. 探针第一次**读错了字段**（`safeSurfaceSteeringToward` 返回 `{direction, debugTarget}`，
   我按 `{x,z}` 读，于是"看到"一堆 NaN 并差点顺着它改错方向）。读对之后拿到决定性数据：
   `direction=(0,1)`、`step=0.143`、`moveToward` 返回 `true`，但 `positionDelta = 0`。
   导航分支里紧跟其后的只有 `clampToBattlefield()`，当场定位。
5. 所有护卫都停在 **z=40.00**（不是 40.1、不是 39.8）——这个"精确等于边界值"的现象
   是最强的线索。

修复：`clampToBattlefield()` 改用 `game.battlefieldBounds()`（没有该方法时才退回旧值），
移动边界与镜头/落点校验从此统一。**一处修改同时让 `verify-island-opening` 与
`verify-island-worker` 由红转绿**——两个失败本来是同一个根因。

新增两个快速单元测试把这件事钉死（都不需要浏览器，合计一秒内）：

| 测试 | 覆盖 |
| --- | --- |
| `test:island-terrain` 13/13 | 平坦开关生效；`ground`/`navigationBounds`/主岛半径/相机都翻倍；**整个可走区域**逐格扫一遍证明陆地等高（只有水线边那一圈有 <5cm 的过渡）；内陆抽样独立复核；外海确实在水下；可走跨度约两倍且不越界；40 个关键点都没掉进海里；四个刷怪点落在干净地面（**不压在资源节点上**）；资源节点总数恰好翻倍且有上限；着色器顶点位移确实被关掉 |
| `test:movement-clamp` 4/4 | 有 `battlefieldBounds()` 时按它裁剪（放大后的地图不再被旧框挡住）；超界时按新边界裁剪；没有时退回旧值；放大后的关键点离边界仍有余量 |

**顺手修掉的一处内容错位**：按比例搬过去之后，`island-east-cape` 与
`island-south-woods` 正好压在 `ironVein` / `pine` 节点上（0.9m / 0.2m），
巢穴会长在那儿并和资源节点争同一块格子。用探针在目标点周围搜"可走 + 离任何资源节点
≥5m"的最近落点，四个巢穴都挪到了干净位置。

**已知取舍**：`pathWidth` 也跟着 ×2（2.6 → 5.2），因为这一版的口径是"所有水平长度同倍缩放"，
规则最好解释。若觉得路太宽，单独调它即可，不影响其它缩放。

`capture-island-preview.mjs` 的采样窗口同步放大到 ±160/±150（它只打印报告、
不做断言，所以真正的门禁是上面那个 `test:island-terrain`）。

### 9.2 木傀儡做成四肢可动 + 移动/砍树/挖矿/攻击动画 —— **已完成**（v0.2.198）

落地方式与关键决定：

- **骨架**（`lowpoly.js: createWoodPuppetModel`）：把原来的"一条手臂一个肩枢轴、
  一条腿一个胯枢轴"拆成两层——`buildArm` 里加 `leftElbowPivot`/`rightElbowPivot`
  （小臂 + 手掌 + 工具挂点归肘），`buildLeg` 里加 `leftKneePivot`/`rightKneePivot`
  （小腿 + 膝轴 + 脚归膝）；另加 `toolSocket`（手掌上的工具挂点）。
  `createPivot` 会把父原点从子节点里减掉，所以拆分后几何不会位移——
  这一点有专门的断言（见下）。
  **保留了 `weaponPivot`/`offhandPivot` 两个别名**：`AttackSystem` 的武器插槽查找在用。
- **关节方向是从模型坐标算出来的，不是试出来的**（写进注释里了）：
  肩枢轴 -X = 手臂向前上方抬起；肘枢轴 +X = 小臂往身后折（屈肘）；
  膝枢轴 +X = 小腿向后弯（正常屈膝）。
- **砍/挖动作**（`visualRegistry.js: applyWoodPuppetSwing`）：四段曲线，
  顺序刻意是"抬臂并屈肘 → **命中前把小臂甩直** → 肩部下砸 → 收势"。
  这里踩过一次坑：第一版把"伸直"放在命中**之后**，结果命中那一帧手臂还是折着的
  （起手 0.856 → 命中 0.914），看起来像用肘去撞树。伸直窗口必须在命中前结束，
  工具尖端才会在命中帧达到最高速。
- **时间轴数据**（`gameData.js` 的 `woodPuppet.art.timelines`）：`chop` 0.9s / 命中 0.46、
  `mine` 0.75s / 命中 0.42、`attack` 0.42s。命中点是**归一化进度**，动作与结算读同一份数据。
- **时机接线**（新增纯逻辑模块 `src/systems/workSwing.js` + `WorkSystem.applyHarvest`）：
  进度负责**吞吐**（多久出一份货），挥击只负责**节拍**（哪一帧出手、哪一帧冒木屑）。
  两者**并行**——第一版写成"挥砍期间不累积进度"，那会让一次采集变成
  「攒 1.6 秒 + 挥 0.9 秒」，速度直接掉三分之一。这是把表现需求做成了平衡改动，不能这么干。
  产物与打击特效都在 `advanceSwing()` 报告的命中帧落地。
- **手里的工具**（`createToolModel` + `visualRegistry.setUnitHeldTool`）：
  斧与镐两件模型都挂在手掌上，切换只改 `visible`（不新建也不销毁 GPU 资源）。
  可见性必须**同时写进 `userData.bindPose`**，否则 `resetAnimatedParts` 会在同一帧还原，
  表现成"工具永远不出现"——树苗那件事（`PlantingSystem` 注释）踩的是同一个坑。
- **打击特效**：`EffectsSystem.spawnWorkStrike(position, { resource, radius, kind })`，
  四层（HDR 亮核 + 软边尘埃 + 实体木屑/碎石 + 地面擦痕），走该文件既有的对象池，
  每次调用不产生 GPU 资源。接触点高度按节点类型取（`resourceNodeStrikeHeight`）：
  树 1.15m、石堆/矿脉 0.7m、浆果与纤维草 0.4m。

新增两个快速单元测试 + 一个端到端验收：

| 测试 | 覆盖 |
| --- | --- |
| `test:puppet-rig` 15/15 | 四对关节与工具挂点都在；**链式局部偏移之和等于原始绝对坐标**（拆分枢轴最容易犯的"多减一次偏移"）；肘是工具的祖先；砍树的工具尖端**先升到最高、再在命中帧附近急速下落**（这条是"没有肉眼也能判断动作对不对"的关键：关节方向写反会立刻失败）；屈肘起手折、命中直；挖矿更长更短促的对照；走路/站立的屈膝差异；工具模型切换与不重复创建；动作播完回到绑定姿态 |
| `test:work-swing` 11/11 | 动作名按工具选；时长与命中点来自定义；定义缺失/写坏时的兜底与夹取；**命中只发生一次且落在命中时刻**；产物次数严格守恒；挥击中途攒到的次数在下一次命中帧一起结算；一段超长 dt 同时跨过命中与结束时仍然结算；中断把未结算次数交回；进度单调到 1 |
| `verify-island-work-animation`（新增，13 项判定） | 局内模型带着完整骨架；砍树播 `chop`、握斧、**产物与木屑同一帧**；挖矿播 `mine`、握镐、**产物与碎石同一帧**；**吞吐没被拖慢**（判据是两次产物之间的间隔：实测中位数 1.65s vs 节点设定 1.6s） |

两条值得记下来的测试方法：

1. **"没有肉眼怎么判断动作对不对"**：量**工具尖端的世界坐标轨迹**，而不是量关节角度。
   砍树 = 最高点必须在命中帧之前、最低点必须在命中帧之后、下落最快的采样点必须落在
   命中帧附近。关节方向写反时轨迹会变成"先下后上"，这三条会立刻失败。
2. **吞吐不能按"我手动 tick 了几次"算**：页面的 rAF 循环**也在推进游戏**
   （headless=new 下它是活的）。第一版按手动帧数算，得出"45 木材 / 12 秒"这种
   不可能的数字（进度是 0.03125/帧，240 帧最多 7.5 次）。改成按
   `game.elapsedTime` 增量算之后真实模拟时长是 17.85 秒，数就对上了。
   最终判据换成"两次产物之间的间隔"，因为它不受节点存量上限影响
   （橡树一共 45 木材 = 9 次，采空之后总产出天然封顶）。

有一条**故意保留的简化**：采浆果与纤维草（没有工具）走的是 `chop` 那套动作，
即"伸手一拽"复用挥砍。为它们单独做一套采摘动作不在需求里，而且从俯视 RTS 的距离看不出差别。

#### 9.2.1 顺带修掉：通关判定被静默吞掉（既有 bug，v0.2.198）

这轮最大的意外收获不在需求里。`verify-island-victory` 在批量回归里失败，
单独复跑 3 次只过 1 次。我一开始按老经验猜"又是负载抖动"，但这次没有停在猜测上，
而是把诊断字段加进脚本，让失败时能直接看出卡在哪一条：

```
finalCleared: true, finalTaggedAlive: 0, finalAliveByPoint: {}, finalNestsAlive: 4,
finalLevelFinished: false, finalEndReason: null
```

**通关的前置条件全都满足，却就是不判胜**——这不是抖动，是逻辑矛盾。
顺着"同一帧被调用两次"这条线索读 `SpawnPointSystem.checkVictory()`，找到了根因：

```js
checkVictory() {
  if (this.victoryDeclared || ...) return false;   // ← 锁存
  ...
  this.victoryDeclared = true;                     // ← 置真
  return true;
}
```

它每 0.25 秒被 `update()` 调用一次并**丢掉返回值**，同一帧稍后又被
`Game.checkSurvivalLevelEnd()` 调用一次。于是只要「最后一个敌人被清掉的那一帧」
恰好撞上规划帧，第一次调用就把锁存置真、第二次返回 false，
**通关被静默吞掉，而且之后每次调用都返回 false，这局再也不可能赢**。
玩家看到的是「点位 4/4、残敌 0，关卡却一直不结束」——一个把整局卡死的 bug。

修法：把 `checkVictory()` 变成**纯判定**（不记"判过了"），幂等交给
`Game.finishLevel()`（它自己有 `levelFinished` 守卫）。同时在验收里加了一条
`victoryIsNotLatched`（连续调用两次都必须为真）把这个不变式钉住，
并把"清残敌"改成循环（蜘蛛卵会在点位被毁后继续孵化出带归属的敌人）。

判定本身没问题（白天不出兵也不会挡住它：`checkVictory()` 在 `update()` 里是无条件调用的），
所以这条纯粹是"状态标记"的错，不是规则错。

### 9.3 可招募敌人改成"击破刷怪点后在该点生成"，且可招募单位血条为白色 —— **已完成**（v0.2.199）

落地方式：

- **删掉旧的来源**：世界生成时撒野外的入口 `Game.spawnFieldRecruits()` 与
  `BALANCE.world.fieldRecruits` 数据都已删除（验收里有 `legacyWorldSpawnerRemoved`
  断言它不会回来——否则"不默认到处都有"只是"这次恰好没生成"）。
- **新来源**：`ISLAND_SPAWN_POINTS[].recruitReward = { types, count }`，
  由 `Game.grantSpawnPointRecruitReward(point, x, z)` 在清点那一刻执行，
  和资源掉落、傀儡奖励并排挂在 `Game.onSpawnPointCleared()` 上（那里天然幂等）。
  四个点各自给：北岬 1 蛮兵、西岭 1 长矛手、东岬 1 弓手、南林 2 支（前排 + 远程）。
- **为什么奖励不做随机池**（不像 `enemyPool` 带权重）：奖励是玩家打下来的结果，
  应该可预期、可断言；`types` 用尽就循环取，配 1 种要 3 支也有明确行为。
- **字段必须登记进白名单**：`normalizeSpawnPoint()` 是显式白名单，忘了登记就静默丢掉
  （`workerReward` 丢过一次）。所以 `recruitReward` 有专门的规范化函数与单元测试。
- **落点绕点位排一圈**（半径 3.6m）：巢穴自身登记了寻路阻挡，直接落在点上会踩进
  阻挡格，那支单位就会永远"想走但一步不动"。
- **白色血条**：新增 `.world-status.is-recruitable { --hp-color: #ffffff }`。
  位置很讲究——它和 `.world-status.is-enemy` **优先级相同**（都是 0,2,0），
  同优先级下靠**源码顺序**决定胜负，所以必须写在 `.is-enemy` 之后，否则白色不生效。
  类名在 `Game.updateUnitStatusElement()` 里按 `unit.isRecruitable` 每帧同步
  （状态条元素创建时只按队伍分色，而"可招募"是运行时标记、招募后还会被清掉）。
- **顺带修掉一处显示错误**：单位会被换队（招募走的就是 `changeTeam`），
  而状态条元素的阵营类名是**创建时**按当时队伍定的，于是招募过来的自家兵一直挂着
  `.is-enemy`——"自己的部队显示红血条"。现在阵营类名也在同一个地方每帧同步。

验收 `verify-island-recruit-source.mjs`（14 项判定）读的是**真实计算样式**
（`getComputedStyle(el).getPropertyValue('--hp-color')`）而不是类名——
类名写对了但被别的规则盖掉时，玩家看到的仍然是红的。
它还有一组**对照组**：开局若没有普通敌人就主动生成一个，断言它的血条仍是红色且没有白色标记，
否则"所有血条都变白"也能让白条断言通过。

#### 侦察笔记（保留备查）

- 现在可招募单位是**世界生成时静态摆在地上的**（`Game.spawnFieldRecruits()`，
  数据在 `BALANCE.world.fieldRecruits`），不是刷怪点产出的。
  需求要改成：打掉某个刷怪点之后，**在那个点位**生成可招募单位。
  挂钩点很清楚——`Game.onSpawnPointCleared(point)` 已经在发资源掉落和劳动力奖励，
  在这里追加"按点位生成可招募单位"即可。
- 可招募是**运行时标记**（`unit.isRecruitable = true`），`UNIT_DEFINITIONS` 里没有这个字段。
- 血条是 DOM：`UnitEntity.createUnitStatusElement(team)` → `.world-status.unit-status`
  + CSS 变量 `--hp-color`。默认绿 `#62d56f`，敌方红 `#e05d56`（`.is-enemy`）。
- **联机缺口（本轮仍未修）**：`SnapshotBuilder` 不序列化 `isRecruitable`，
  所以客户端看到的可招募单位也是红的、也不能区分中立与敌对。
  联机入口目前仍不可用，所以这条不影响单机，但接联机时要补。

侦察结论：

- 现在可招募单位是**世界生成时静态摆在地上的**（`Game.spawnFieldRecruits()`，
  数据在 `BALANCE.world.fieldRecruits`），不是刷怪点产出的。
  需求要改成：打掉某个刷怪点之后，**在那个点位**生成可招募单位。
  挂钩点很清楚——`Game.onSpawnPointCleared(point)` 已经在发资源掉落和劳动力奖励，
  在这里追加"按点位生成可招募单位"即可。
- 可招募是**运行时标记**（`unit.isRecruitable = true`），`UNIT_DEFINITIONS` 里没有这个字段。
- 血条是 DOM：`UnitEntity.createUnitStatusElement(team)` → `.world-status.unit-status`
  + CSS 变量 `--hp-color`。默认绿 `#62d56f`，敌方红 `#e05d56`（`.is-enemy`）。
  可招募单位现在是 `TEAMS.ENEMY`，所以显示成红色——需求要的白色**没有现成的类**，
  需要新增一个（例如 `is-recruitable` → `--hp-color: #ffffff`），
  并在 `Game.updateUnitStatusElement()` / `attachUnitStatus()` 的路径上按 `unit.isRecruitable` 加类。
- 顺带一条**联机缺口**：`SnapshotBuilder` 不序列化 `isRecruitable`，
  所以客户端看到的可招募单位也是红的。本轮不修（联机入口仍不可用），但要记着。

---

## 10. 需求 1 / 2 / 3 / 4 / 5 / 6 / 7 / 8 的逐条记录（全部已完成）v0.2.200 → 复查与重写见 §10.12 / §10.13 / §10.14

用户这一轮的原文（编号按用户给的顺序，第 7 条有两个，下文按 7a / 7b 区分）：

1. 木傀儡在没有武器的情况下需要会逃跑，在执行非战斗任务时要选择威胁度低的地方执行。
   威胁度可以单独维护一个二维数组覆盖场景，敌人判断自己位置并根据自己的半径叠加威胁度。
2. 友方单位的扇形菜单跟随有卡顿，需要修复。
3. 玩家一开始应该没有任何战斗单位，去掉现有的战斗单位。
4. 地图上不应该有连接到敌营的道路，那是之前的玩法了。
5. 地图上去掉小房子装饰物，令人困惑，之后会添加真的可修缮的功能性建筑。
6. 快捷栏应该在屏幕下方，这样才能拖拽相关东西给单位或者拖拽建筑进行建造，不应该在 b 键面板内部。
7a. b 键面板内部右侧不应该有科技和附魔台，这两个应该是科研站和附魔台的扇形菜单弹出的界面。
7b. b 键面板右侧除了合成外应该增加一个资源 tab，显示木傀儡可以采集到的、可以合成的所有物品，
    玩家点击对应物品可以增加或者减少优先级，AI 根据优先级去做相关任务。

用户对关键岔路的澄清（很重要，决定了实现方向）：

- 需求 1 + 3 的联动：**「需要增加木傀儡武器合成，同时斧头稿子也可以作战，
  但是斧头稿子战斗力弱，需要增加战力判断」**。
- 需求 7b：**「只影响采集：合成类物品自动换算成它的材料需求」**。
- 需求 1 的威胁度：**「加一个调试开关可叠加显示」**。

### 10.1 需求 3：开局没有任何战斗单位 —— **已完成**

- `BALANCE.world.survivalOpening.escorts` 改成 `[]`。**保留字段与 `spawnSurvivalEscorts()`
  方法**是刻意的：它是"要不要发开局护卫"的唯一开关，以后做高难度开局或关卡变体时改一行就能回退。
- 开局编制因此变成：1 支木傀儡 + 基地。`verify-island-puppet-combat` 直接断言
  `combatCount === 0 && workerCount === 1 && escorts.length === 0`。
- 连带影响（都改了）：4 个旧验收脚本此前靠"出生护卫"拿战斗单位，现在**自己 summon 一个**
  （`verify-item-transfer` / `verify-weapon-swap` / `verify-island-facilities`），
  并顺带发现 `verify-weapon-swap` 原本就在测"谁跑得快"而不是"武器有没有用"（见 10.6）。
- `verify-island-opening.mjs` **删除**：它的全部内容（开局编制、起始巢穴最弱、
  清点奖励、可通关性）已并入 `verify-island-puppet-combat.mjs`，
  留着会变成两个脚本断言同一件事。

### 10.2 需求 1 + 3 的联动：木傀儡武器 + 战力判断 —— **已完成**

**为什么必须一起做**：木傀儡原来的定义是 `physicalAttack: 0 / damage: 0 / aggroRange: 0`，
`weapon` 块里没有 `family`，所以它**装不上任何武器**、也打不动任何东西。
开局护卫一撤，玩家就没有任何手段打掉第一个刷巢穴 → 拿不到深邃核心 → 招不到战斗单位，
整条链死锁。所以"去掉开局战斗单位"这句话要成立，必须同时给出替代路径。

落地：

- **木傀儡能装武器了**：`woodPuppet.weapon` 补上 `family: 'puppetArm'` 与
  `profile: { attackRange: 0.9, projectileType: null, attackAnimation: 'Attack' }`。
  这三项必须与单位自身的 `attackRange` / 无投射物 / `art.clips.attack` 严格一致，
  否则 `canEquipWeapon` 会以"射程/投射/动作不匹配"拒绝——那是换装校验的既有规则，不能绕。
- **两件可合成的傀儡武器**：`puppetCudgel`（木棒，木材 12 + 石料 4，伤害 7）与
  `puppetGlaive`（木刃，木材 16 + 铁矿 6，伤害 12）。
  刻意**不写 `defaultFor`**：`defaultFor` 的语义是"单位一开始手里那把武器对应的物品"，
  而木傀儡一开始手里是"木质手臂"——那不是物品。写了它等于每支傀儡白送一根木棒。
- **战力公式**（`src/systems/puppetArms.js`，纯逻辑）：
  `战力 = 最大DPS × (1 + 有效血量/40)`，`有效血量 = (生命+护盾) × (1 + 护甲×0.02)`。
  需要留意的两条实现事实：
  1. **护甲是"每次受击的固定减伤"**（`CombatSystem.applyDefenseReduction`：
     `damage = max(0, damage - armor)`），不是百分比。所以巢穴（护甲 4）
     会把工具那点伤害直接抹平——这正好形成"想拆巢必须先合成武器"的门槛；
  2. 公式是**代理指标**，不是模拟对打。0.85 那类"略微劣势也敢打"的阈值
     会把"数值接近但实际必输"的情况放进来（实测：拿斧的傀儡 8.19 对盾卫 10.87
     按 0.85 判"敢打"，而实际对打是傀儡 18 秒拆不掉盾卫、盾卫 16.5 秒打死傀儡）。
     所以阈值取 1.0（"打得过才打"）。
  **当前标定值**（v0.2.202，改任何一个都要重跑 `test-puppet-arms.mjs`）：
  空手 0 / 镐 7.83 / 斧 8.19 / 木棒 13.53 / 木刃 23.14；
  哥布林弓手 4.88 / **野狼 7.69** / 蛮兵 8.54 / 蜘蛛 8.82 / 盾卫 10.87 / 食人魔 30.69。
  由此得到的界线是：**工具能清野狼、清不了成建制的敌人**。
- **威胁压力按距离衰减求和**，不是"取最近那个的战力"：后者会让一支傀儡被三只蛮兵
  骗过去送死。"抱团更危险"必须由公式自己表达出来，而不是另加一条特判。
- **`updateWorker` 可能把这一帧交回战斗 AI**：决定迎战时返回 `false`，
  让 `UnitLogicSystem` 跑既有的战斗 AI（索敌 / 追击 / 攻击 / 投射物 / 动画全套复用），
  作业任务**保留**，威胁散了自己回去干。为了做到这一点，威胁判断必须放在
  `unit.target = null` 那批清理**之前**。
- **每单位属性而不是改共享定义**：`applyPuppetGear()` 用
  `unit.attributes.setBase('physicalAttack'|'attackRate'|'aggroRange'|...)` 只写这一支傀儡。
  改 `UNIT_DEFINITIONS` 会让所有傀儡一起获得战力，而"拿斧子的能打、空手只会跑"
  正是需求要区分的东西。`aggroRange` 是"要不要打"的总开关：不迎战时钉死为 0。
- **索敌半径必须 ≥ 压力窗口**（`engageAggroRange 9 ≥ pressureRadius 8`）：
  否则会出现"压力够高判了迎战，可索敌够不着"——表现是傀儡站着不动，
  而且单测全绿（这条有专门的断言与注释）。
- **滞回**（两条都是实测抓出来的抽搐）：
  - 单阈值会让傀儡"追上去 → 压力升高 → 判逃 → 跑远 → 压力降低 → 判迎战 → 再追"，
    于是它一路追两步退两步地跟着敌人跑。所以加了 `disengagePowerRatio`（0.55）：
    已经在打就要压力明显超出才转逃。
  - 逃跑会被"一跑出窗口就回头"打断，在两个位置之间横跳。所以逃跑一旦开始就
    **跑到安全为止，中途不重新评估要不要打**。
- **压力的"当没看见"下限**（`safePressure 0.75`）：压力是按距离线性衰减的，
  窗口边缘永远是极小的正数（8m 外一只蛮兵只贡献 0.15）。没有这个下限时，
  木傀儡会在基地旁边砍树砍到一半，跑去追一只在窗口边缘的狼，**采集链整条断掉**
  ——这一条是 `verify-island-worker` 变红之后才查出来的，不是猜的。

### 10.3 需求 1：威胁度二维数组 + 低威胁选点 + 调试叠加 —— **已完成**

- 纯逻辑 `src/systems/threatField.js`：`Float32Array` 覆盖
  `game.battlefieldBounds()`，格边长 2m（岛上是 117×109 格）。
  API 是 `createThreatField / clearThreatField / addThreatCircle / threatAt /
  threatRatio / threatBandAt / chooseFleeTarget`。
- 运行时 `src/systems/ThreatFieldSystem.js`：**每帧清空后重写**。
  清空是一次 `fill(0)`（12k 个 float，代价可忽略），语义比"衰减累积"明确得多：
  数组永远等于"当前这一刻的威胁分布"，不会因为掉帧或暂停残留历史值。
- **自己持有网格而不是塞进 `world.navGrid`**：navGrid 是 0.8m 的可走性网格、
  而且不是每个关卡都有；威胁度要求"任何关卡都可用"，2m 粒度也够。
  两者互不依赖，`world.isWalkable` 只作为回调注入。
- **判据是 `isThreateningUnit` 而不是 `isHostileEnemy`**（新增在 `unitTeam.js`）：
  野生动物（狼、熊）会咬傀儡，但它们不算"敌军"（基地自动开火那条线刻意排除它们）。
  一开始用的是 `isHostileEnemy`，结果傀儡会在狼群里"判定为安全"继续砍树。
  这是**验尸报告之外的产品缺口**，由 `verify-island-puppet-combat` 暴露。
- **巢穴给固定 6 点"地标威胁"**：它自己不攻击（战力 0），但显然是危险地点，
  而且不会移动——给它一圈固定的领土，傀儡平时就会绕着它干活。
- **低威胁选点**在 `WorkSystem.nodeWorkScore()`：评分 = 距离 + 威胁值 × 2，
  也就是"多一点威胁等于多走两米"。所以仍然优先近处节点，但近处明显更危险就换远处。
  实测断言（`verify-island-puppet-combat` 的 `prefersLowThreatNode`）走的是
  **真实派活链路**：把同类节点全部推到岛外、只留两个等距候选、只给其中一个加威胁，
  然后看调度器派哪个——不是调用评分函数自证。
- **逃跑落点**用环采样（`chooseFleeTarget`）而不是梯度下降：
  环采样能明确回答"周围有没有可走且更安全的地方"，找不到就返回 null；
  梯度下降在分段常数的场上会随机漂移。
  兜底方向是"背离最近威胁"（`retreatAwayFromThreat`），
  否则被逼到海岸线时傀儡会站在原地被咬死——玩家看着它"有空地却不跑"。
- **调试叠加 Shift+G**（用户要求）：贴地热力网格，绿→黄→红，
  `InstancedMesh` 一次 draw call，只给"这一帧真的有威胁"的格子建实例（岛上通常几百到两千格）。
  关掉即隐藏；每 0.2s 重建一次并 **dispose 掉上一帧的几何体/材质**（只 remove 不 dispose 会漏 GPU 资源）。

### 10.4 需求 4 / 5：去掉通往敌营的路与小房子 —— **已完成**

- 路：海岛预设新增 `paths: false`，`createPath()` 的调用点加 `config.paths !== false` 门。
  **只关视觉路面，`pathPoints` 必须保留**——它还被两处真正吃：
  `landmassMaskAt()` 的 `roadReserve`（沿路 6.9m 内强制成陆）与
  `placeResourceNodes()` 的装饰让位。`pathPoints: []` 也不行：
  `CatmullRomCurve3` 拿到空点集会直接抛异常（实测）。
- 小房子：`placeLegacyPathDecor()` 的硬编码表改成
  `worldConfig().legacyPathDecor ?? [默认]`，海岛预设写 `[]`。
  与既有 `placeCottages()` 的 `worldConfig().cottages ?? [默认]` 完全同构。
  这些小屋不只是看着像房子，它们各自还注册了半径 `2.0 × scale` 的寻路阻挡，
  所以关掉之后可走区域只增不减。
- 回归守卫写进 `test-island-terrain.mjs`（新增 2 条，共 15/15）：按**材质颜色**
  在 Node 里遍历场景，断言没有路面 ribbon（`palette.path`）也没有小屋墙（`#baa58b`）
  ——两者都是各自唯一的用途，而网格本身没有名字（小屋还会被并进静态合批，
  世界坐标烤进几何，事后按名字或坐标都找不到）。

### 10.5 需求 6：快捷栏移到屏幕下方并可拖拽 —— **已完成**

- **删掉背包面板里的页脚快捷栏**（markup + `renderHotbar` + CSS 共 87 行），
  面板里一个格子都不剩（`test-backpack-ui` 与 `verify-backpack-ui` 都有断言）。
- `#item-hotbar` 改成**常驻屏幕底部的固定 9 格**（`bottom: 14px`），空槽也画出来。
  两个硬理由：
  1. 槽位序号就是数字键 1..9 的含义，"有几件画几格"会让按键含义随库存滑动；
  2. 空槽要能当**拖拽落点**，没有空格子就没有落点。
  旧关卡仍有手牌区，所以 `body:not(.is-survival-level)` 下退回到 `bottom: 268px`。
- **取材扩成两类**（`Game.hotbarItems()`）：可放置建筑 + 能交给单位的装备
  （新增纯谓词 `items.itemIsGivable()`：`category ∈ {tool, weapon, rune, manaStone}`，
  且不是可放置物）。木材石料这类纯材料不占格子——它们的作用是合成，
  让它们霸占快捷栏会把"能用的东西"挤掉。
  顺序固定为"先建筑、后装备，各自按 itemId 排序"，同一套库存永远同样的顺序。
- **真拖拽**（不是"点一下"）：`HotbarUi` 自己管理 pointerdown → 阈值 6px 才算拖 →
  跟手图标 + 落点高亮 → pointerup 时调 `Game.dropHotbarItemAt(index, x, y)`。
  落点判定顺序是"先看有没有单位、再看能不能放地上"：装备掉在单位身上才交出去，
  掉在空地上什么都不做；建筑掉在地上才进入放置（并直接在那个点落地）。
- 验收 `verify-item-hotbar.mjs` 重写为 16 项，用**真实 PointerEvent**
  走两条手势：把木刃拖到傀儡身上（断言背包里真的多了一件、基地里少了一件、
  拖拽过程中 `data-drop-target` 有落点名字、松手后图标不残留），
  以及把熔炉拖到地上（断言扣了物品、多了一栋建筑、且建在落点附近）。

### 10.6 需求 7a：科技与附魔台搬进建筑界面 —— **已完成**

- 背包右侧删掉 `科技` / `附魔台` 两个标签页与全部渲染函数；`setTab()` 把旧名字
  （`tech` / `enchant`）**映射到 craft 而不是报错**，让旧脚本不至于直接崩。
- 新增 `src/systems/FacilityPanelUi.js`：建筑类型 → 界面的映射表
  `FACILITY_PANELS`（科研站走 `techStatus()`，附魔台走 `enchantStatus()`），
  复用 `backpack.css` 的卡片样式（`.backpack-card` / `.backpack-input` /
  `.backpack-action` / `.backpack-blocked` 都是全局类选择器，再造一套只会让调色要改两处）。
- `UnitActionMenu.actionsFor()` 对建筑返回**它自己的那一个入口**（科研站 / 附魔台），
  其它建筑（熔炉、箭塔…）不给菜单——弹一个空菜单比不弹更让人困惑。
- 这修掉了一处自相矛盾的界面：以前不需要建站就能"翻到"科技页，
  页面上再告诉你"需要先建好科研站"——能看见却不能用。
- 验收：`verify-island-research.mjs` 现在**走扇形菜单那条路**
  （选建筑 → 点「科研站」按钮 → 断言面板打开且目标是 researchStation），
  而不是直接调 `openForUnit`；直接调的话"菜单里到底有没有这个入口"就没被验到。
  `verify-island-tech-effects.mjs` 同步改成从设施面板取科技卡片。

### 10.7 需求 7b：资源 tab + 优先级 —— **已完成**

- 纯逻辑 `src/systems/resourcePriority.js`：
  `gatherableResources / resourcePriorityRows / gatherableInputsFor /
  findRecipeOutputting / priorityByResource / demandsFromRows / demandsFromPriorities`。
- **合成类只折算成材料**（用户明确选的方向）：给「魔力石」加优先级 =
  多挖铁 + 多砍树，界面上直接把折算到的材料写出来。
  不写这行小字的话，玩家给「傀儡木刃」加优先级却看到傀儡去砍树，会以为是 bug。
- **折算要同时看两张配方表**：合成表（`RECIPES`）**和**生产表（`PRODUCTION_RECIPES`，熔炉烧炭）。
  只查合成表的话「魔力石」会被算成"只要铁"——因为木炭在合成表里找不到来源——
  于是给魔力石加优先级不会让傀儡去砍树，而玩家在界面上明明看到它需要木炭。
  这条有专门的数值断言：魔力石 4 铁 + 6 木炭 → 木炭按"4 木材 → 2 木炭"折算回 **12 木材**。
- **优先级可以降到负数 = 禁止采集**：只有 `0..N` 的话"这一项我现在不想要"没法表达，
  而那才是最常见的诉求（前期不想让傀儡跑去采纤维）。
- **默认值在"没被点过"的项上仍然生效**（木 3 / 石 2 / 食 1）：优先级字典一开始是空的，
  只有玩家点过的项才有键；如果漏了默认值，开局只会采木材。
- 界面（`BackpackUi.renderResources`）每行是「物品 + 库存 + −／优先级／＋」，
  资源行说明"傀儡会按这个顺序去采"，合成行说明"傀儡不会合成它，加优先级等于多采它的材料"。
- 每次改动立刻 `Game.refreshWorkDemands()` 重算并 `work.setDemands()`——
  只在"下一帧顺便读一下"是不行的，玩家点完「＋」要马上看到傀儡改去采那种资源。

### 10.8 需求 2：扇形菜单跟随卡顿 —— **已完成**

根因是**节流**：`unitActionMenu.sync()` 原本挂在 `updateHud()` 里，而 `updateHud`
有 `hudUpdateTimer = 0.1` 的节流，于是菜单只有 **10Hz** 的跟随——单位一走、镜头一推，
菜单就明显掉队再追上去。菜单的位置是世界坐标投影出来的，必须每帧算。

修法：抽出 `Game.syncUnitActionMenu()`，在 `tick()` 的三条渲染路径
（暂停帧 / 联机客户端帧 / 主线帧）里每帧调用一次。
按钮的 DOM 只在签名变化时重建（`UnitActionMenu.sync` 本来就是这样），
所以每帧成本只有一次投影与两次 style 写入。

### 10.9 本轮新增/改写的测试与验收

单元测试（`npm run regression` 会自动跑 `package.json` 里全部 `test:*`）：

| 脚本 | 条数 | 守什么 |
|---|---|---|
| `test-puppet-arms` | 25 | 装备判读、战力公式与**标定值**、空手必逃、斧镐弱、成群更危险、滞回、压力下限、单调性、确定性 |
| `test-threat-field` | 14 | 数组覆盖边界、线性衰减、叠加是相加、清空无残留、越界为 0、逃跑落点可走且更安全、确定性 |
| `test-resource-priority` | 21 | 两类行、合成→材料折算（含木炭回折木材）、负数禁止、默认值、目标库存上限、确定性 |

游戏内验收（新增 1 条、重写 1 条、改 5 条）：

| 脚本 | 变化 |
|---|---|
| `verify-island-puppet-combat` | **新增**（17 项）：开局编制、威胁数组覆盖、敌人写入、空手逃/工具逃、等距节点挑低威胁、合成+换装、迎战掉血、夜袭窗口、起始巢穴被打掉、清点奖励、调试开关 |
| `verify-item-hotbar` | **重写**（16 项）：常驻 9 格、取材两类别、顺序稳定、数字键、点击交付、**真拖拽给单位 / 真拖拽建造**、贴屏幕底 |
| `verify-island-opening` | **删除**（并入上一条） |
| `verify-island-research` | 改成走扇形菜单打开设施界面 |
| `verify-island-tech-effects` | 改成从设施面板取科技卡片 |
| `verify-island-worker` | 加威胁隔离（这一段测采集链，不测避险） |
| `verify-item-transfer` / `verify-weapon-swap` / `verify-island-facilities` | 战斗单位改成自己 summon |
| `verify-backpack-ui` | 快捷栏/标签页断言换成新形态，新增资源 tab 的加减与"改动传到需求表" |
| `test-backpack-ui` | 换成"快捷栏已搬出面板 + 设施菜单入口 + 资源 tab"的源码断言 |
| `test-difficulty-scaling` | 收紧旧威胁度禁令（见下） |
| `test-island-terrain` | 新增"没有路 / 没有小房子"两条 |

### 10.10 本轮改掉的既有 bug（都不在用户需求里，是被验收抓出来的）

1. **`test-difficulty-scaling` 的禁令过宽**：它禁止 `gameData.js` / `Game.js` 出现裸词
   `threat`，而本轮新增的威胁度数组合法地用了这个词。继续禁裸词会把两件不相干的事
   混在一起——每动一次威胁度数组就要来改这条断言，而它真正要守的
   （旧的"威胁度分级"难度缩放不许回来）反而被淹没。现在只禁 `threatTier | minThreat`，
   并反向钉住"没有按威胁度取档位的写法"。
2. **威胁判断把"窗口边缘的极小压力"当成威胁**：见 10.2 最后一条。后果是采集链断掉。
3. **`verify-weapon-swap` 一直在测"谁跑得快"**：它让一个蛮兵去打一只**野生动物**，
   而野生动物默认在出生点附近游荡（`updateWildlifeWander`），靶子会自己走开，
   于是"这次有没有打中"变成运气问题（狼恰好游荡进角落时才会过）。
   现在靶子被钉住（清移动目标、清 `wanderGoal`、把移动速度钉成 0），
   断言测的才是"伤害有没有落到身上"。
   **注意这里曾经被我写错过**：我一度把它记成"狼比蛮兵快所以近战杀不掉狼"的产品问题。
   那是错的——这游戏里**所有野怪与敌人都不会逃跑**，它们只会迎上来或原地还手，
   所以"追不追得到"根本不是战斗问题。钉住靶子纯粹是为了让测量可复现。
4. **`verify-island-worker` 的采集链会被避险打断**：不是产品 bug，
   而是"新增的避险行为"与"旧验收的隐含假设"冲突。这一段加威胁隔离，
   并在结论里带上 `clearedThreats` 以便区分。

### 10.11 已知缺口 / 留给下一轮

- **没有任何真人试玩过**。本轮的结论全部来自代码检查、构建、自动化测试
  （含真实 tick、真实 PointerEvent、真实计算样式）。手感类的问题
  ——威胁度阈值 0.75 是否合适、木棒/木刃的数值是否好玩、拖拽的 48px 判定半径是否顺手、
  快捷栏 9 格贴底会不会挡住底部单位——只有真人试玩能判断。
- **平衡数据是"能通关"级别，不是"好玩"级别**：起始巢穴 120 血、`maxAlive 2`、
  16 秒间隔，实测一支装了木刃的傀儡在夜袭窗口（14 秒、场上最多 13 个敌人）
  之后仍然活着（21/30 血）并把巢穴打掉了。这是"链走得通"的证据，不是难度曲线。
- **`SnapshotBuilder` 仍不序列化 `isRecruitable`**（联机缺口，上一轮就记着）。
- **资源 tab 的合成行只覆盖 `RECIPES`**，不覆盖 `PRODUCTION_RECIPES` 的产物
  （木炭自己不能单独设优先级，只能通过「魔力石」这类消费者间接抬高木材需求）。
- **`节点威胁阈值`（2.0）与逃跑落点复用时长（1.4s）也是标定值**，手感需要真人试玩。
- 几处刻意保留的简化：威胁数组的格边长固定 2m 不可配；
  快捷栏装备一格搬一件（实例物品 stackLimit 都是 1，所以"搬一格"就是"给一件"）。

### 10.12 用户复查后的三处修正（v0.2.201）

用户复查了 §10 之后给了三条，都改了：

1. **「木傀儡逃跑时要寻路，而不是只决定方向，不然撞墙卡死。并且逃跑要朝威胁小的方向跑」**
   - 逃跑原来用的是**直线转向**（`moveToward(..., { direct: true })`）。
     直线撞上障碍时 `tryApplyWalkableStep` 三次尝试全部失败 → 一帧都走不动，
     而威胁还在逼近，表现是"贴着一堵墙原地抽搐直到被咬死"。
   - 现在 `applyFlee` 先走**导航转向**（`moveToward` 不带 `direct` → `navGridSteeringToward`
     → A* 找路 → 沿路点走），拿不到安全方向时才退回直线兜底——
     兜底是必须留的（第一帧路线还在寻路 worker 里），但不能成为主要方式。
     验收断言 `fleeRouteFrames > fleeDirectSteeringFrames` 且路线帧数 ≥ 逃跑帧数的一半。
   - **落点要保持一小段时间**（`WorkSystem.resolveFleeTarget`，1.4 秒 / 走远 1.6m 才重算）。
     不这样做的话落点每帧都动 → `navGridSteeringToward` 每帧都判定"目标变了" →
     每帧的寻路请求都被重寻冷却（1.35 秒）挡回去 → 只能沿旧目标的路线走，
     **A\* 等于没接上**。1.4 > 1.35 这个大小关系是硬要求，代码里有注释钉着。
   - **"朝威胁小的方向跑"**：`chooseFleeTarget` 原来一找到某个环上有安全格就停下，
     于是"左边 3m 处威胁从 8 降到 6"会胜过"右边 9m 处威胁为 0"——
     傀儡贴着威胁边缘横着挪而不是真跑开。现在**在所有环里取威胁最小者**，
     距离只做同分时的次要判据。
   - 另外**优先选"直线可达"的落点**（新注入 `hasLine` = `game.hasSafeSurfaceLine`）：
     只判断"这个点可走"不够——墙后隔一格就是可走的，但直线过去会撞墙。
     一条直线都没有时**仍然要给出可走的落点**（交给寻路绕），返回 null 才是真的卡死。
     这一条在 `test-threat-field` 里有专门的断言。
2. **「所有野怪和敌人都不会逃跑，所以不用考虑追不追得到敌人」**
   - 确认属实：这套代码里没有任何敌人/野怪的逃跑行为（唯一的逃跑是木傀儡的避险）。
     所以"迎战之后追不上目标"不构成问题，不需要任何追击设计。
   - 相应地**改掉了我上一轮写错的一条结论**：我曾把 `verify-weapon-swap` 的抖动
     归因为"狼速度 3.55 > 蛮兵 2.45，近战杀不掉狼"的产品问题。真正的原因是
     野生动物在出生点附近**游荡**（`updateWildlifeWander`），靶子自己走开导致测量不可复现；
     钉住靶子是为了测量，不是为了对付逃跑。
3. **「野生动物不用排除在外，正常计算威胁」**
   - 实现上确实没有排除（`isThreateningUnit() = 队方为敌 && 不是可招募中立`，
     天然包含野生动物），但上一轮的验收**没有证明这一点**，只有一句"我改成这样了"。
     现在 `verify-island-puppet-combat` 多了一条 `wildlifeCountsAsThreat`，
     用**真正的野生动物**（`spawnWildlife()` 生成的那只，`isWildlife === true`）
     搬到傀儡旁边，断言三件事：威胁数组里的敌人数量在它死掉时**正好 -1**、
     决策列表 `threatsNear()` 里能看到它、傀儡状态进入 `fleeing`。
     注意不能用 `spawnEnemyAt('wolf')` 代替——那条路径**不设** `isWildlife`，
     "它是野生动物"这个前提就不成立（第一版就是这么写错的）。
   - 顺带把"威胁 ≠ 敌军"这条界线写清楚：基地自动开火用的是 `isHostileEnemy`
     （**故意**排除野生动物，否则基地会打路过的狼），
     威胁数组用的是 `isThreateningUnit`（包含野生动物，因为它们会咬傀儡）。
     两处判据不同是设计，不是遗漏。

### 10.13 用户第二次试玩反馈的两条（v0.2.202）

用户试玩之后问了两件事，都不是"没做"，而是**做错了**：

1. **「这个木傀儡不是有斧头和稿子吗，为什么不打狼」**
   - 先给结论：因为按当时的数值它**打不过**。旧数值下斧头 dps 3、狼有效血量 36
     → 打死狼要 12 秒；狼对傀儡（护甲 2）`(5.4−2)×1.15 = 3.91 dps` → 打死傀儡只要 7.7 秒。
     战力判断（5.34 vs 11.8）据此判逃，**符合"斧镐战斗力弱"的原始要求**。
   - 但问题在于这条界线画得太靠下：当时工具**只打得过哥布林弓手**（战力 4.88），
     其余 15 种敌人全部逃。所以"斧镐也可以作战"在体感上等于"从不还手"。
     另外根因还有一半在**狼本身**：24 血 + 12 护盾、伤害 5.4/攻速 1.15、速度 3.55，
     比哥布林士兵（18+9、5.5/0.92、2.9）**更肉、更能打、还更快**——
     一只野生动物同时占满三项是不合理的。
   - 用户选了「加强斧/镐 + 略微削弱狼」并「顺便把狼改成快但脆」。落地：
     - 狼：`maxHealth 24→13`、`maxShield 12→4`、`speed 3.55→3.9`、
       `damage 5.4→4.5`、`attackRate 1.15→1.2`、`dodgeChance 0.09→0.06`
       （闪避 0.09 等于"有效血量再 +10%"，与"脆"相反，所以一起降）；
     - 工具：`IMPROVISED_TOOL_DAMAGE` 斧 3→4.6、镐 2.5→4.4（傀儡攻速 1，所以伤害即 dps）；
     - 合成武器同步上调以保持梯度：木棒 `7/0.85 → 8/0.95`、木刃 `12/0.95 → 13/1.0`；
     - `engagePowerRatio 0.85 → 1.0`（理由见 §10.2 的实现事实第 2 条）。
   - 结果是一条刻意画出来的界线：**斧/镐能打赢野狼（约 4 秒，剩六成血），
     但打不过哥布林士兵（有盾）**。前者让"工具可以作战"看得见，
     后者保住"想清成建制的敌人还得合成傀儡武器"。
   - 验收：`test-puppet-arms` 新增两条钉住这条界线（打狼必迎战 / 打哥布林士兵必逃），
     `verify-island-puppet-combat` 新增 `toolBeatsWolfInGame`
     （拿斧头的傀儡遇到真狼，状态机必须是 `engaging`）。

2. **「一开始为什么还朝狼走，走过去又开始跑，跑一段又回头又接着跑」**
   - 这是**两个 bug 叠在一起**，而且都不会抛错，所以只能靠行为观察发现：
     1. **"打不打得过"用了带距离衰减的威胁值。** 那个值随距离变化：同一只敌人在
        远处显得弱、走近了显得强。于是傀儡在远处判"迎战"→ 交给战斗 AI **追击**
        （这就是"朝狼走"）→ 走近后压力升高、改判"打不过"→ 掉头跑（"走过去又开始跑"）。
        修法：`threatPowerAt()` 改成**合计战力**（`sum(power)`），与距离无关；
        距离衰减的压力只保留"这一片危不危险"的职责（选点、决定要不要停下手里的活）。
        一行注释把这个分工写在 `puppetArms.js` 里。
     2. **逃开之后会被派回同一个危险资源点。** 调度器只按"距离 + 威胁扣分"排序，
        扣分改变不了优先级：近处那个危险节点（5m、威胁 8 → 评分 21）依然赢过
        30m 外的安全节点（评分 30）。于是走回去 → 再逃 → 循环。
        修法：新增 `nodeIsWorkable()`（威胁 ≥ `maxNodeThreat` 2.0 的节点
        **直接不可选**，不是扣分），`updateAutoAssign` 的候选池显式过滤；
        另外逃跑时如果手上那个任务就在危险区里，`releaseTaskInDanger()` 直接把它放掉。
   - 附带两个小修：逃跑的进出门槛加了死区（`fleeReleaseRatio` 0.5：进入用 0.75、
     退出用 0.375），避免卡在边界上"逃一步停一下"；`disengagePowerRatio` 从 0.55 收到 0.95，
     因为翻面的根因（距离）已经消除，剩下的变化源只有"敌人数量的真实增减"——
     那是应该立刻反应的事（拿木棒的傀儡单挑蛮兵会一直打，第二只蛮兵一进窗口就撤，
     实测 2 打 1 是打不过的：它要 7.4 秒打完两只，而两只蛮兵 4.7 秒就能打死它）。
   - 验收：`test-puppet-arms` 新增「同一个敌人，距离远近不能改变"打不打"的结论」
     （1~7m 逐档断言），`verify-island-puppet-combat` 新增 `noWorkFleeLoop`
     ——把一只狼钉在"离傀儡最近的木节点"上、开回自动派活跑 20 秒，
     断言傀儡**全程没有被派到危险区里的节点**、逃跑状态翻面次数 ≤ 4。
     实测 `fleeFlips: 0`、`dangerousNodeAssigned: false`。

### 10.14 傀儡 AI 按 Numen 架构重写 + 基地激光哑火（v0.2.203）

用户第 5 轮的反馈是两条，加上一句方向性的要求：

> 「ai 得重新设计一下。你知道 Numen ai 这个仓库吗？你去看下里面的 minecraft 的 ai 怎么设计的？
> 它的 ai 在执行任务时会朝着目标前进，路上遇到怪有些会打有些不会打，很干脆，
> 在干其他活的时候遇到怪物也会先把怪物打了，我想做成他那样的。」

参考实现：[Dwinovo/minecraft-numen](https://github.com/Dwinovo/minecraft-numen)
（`core/combat/Menace.java`、`core/combat/AttackPlan.java`、`core/task/chain/MobDefenseChain.java`、
`core/task/survival/SurvivalDecisions.java`）。**只借鉴设计，没有引入任何依赖或代码。**

#### A. 从 Numen 抄来的六条规矩（这是本轮改动的骨架）

1. **反射 = 抢占 + 归还。** 自卫反射只是**借走**这一帧（甚至几秒），打完把身体原样还回去；
   `stop(PREEMPTED)` 明确不动任务字段——所以"打完接着砍原来那棵树"是免费的，
   不需要重新派活。顶掉任务则会让进度清零。
2. **触发用布尔，不用"我多想要身体"的浮点分。** 反射之间的先后是**固定**的
   （自卫永远压过作业），不随世界状态变。让每个反射返回一个浮点再挑最大的，
   就是用连续量表达一个固定序——那些数值会变成必须小心维护却没人看得懂的魔法数。
3. **一场战斗是一个状态，不是每帧一次重算。** 判据收**上一刻的决定**，提供两件事：
   迟滞（目标退开一点点不该重新起步）与**承诺**（选中一只就打完再换）。
4. **危险离开后有一段冷静宽限**（`calmGraceSeconds = 2`）。
   Numen 的原话：没有它，一只跟她跑得几乎一样快的怪会在边界上一进一出，
   每进出一次就重开一场仗。**这就是用户第 5 轮报的「互相拉扯」。**
5. **开打之后不设冷却、不设闹钟。** 终点只有一个：没人再追我。
   冷却只会在那几秒里让新出现的危险白打（Numen 实测四次重伤都发生在这个窗口）。
6. **判据与走位共用一把尺子。** 危险半径 = "它够得着我"，
   与 `AttackSystem` 的 `allowedRange = getAttackRange(source) + targetCombatRadius(target) + 0.85`
   是同一个公式。Numen 点名过两边各用各的度量的后果：
   "判据说快躲、寻路说'你已经躲开了'，导航一建就到达、一步不走，她站在原地被打死。"

另外照抄的两条 Numen 教训（都写进了代码注释）：

- **逃跑距离必须远大于危险半径。** "后者是'退出去就能接着打'的两三格，
  前者是'它已经跟不上了'。两件事共用一个数的时候，她退两格就判'跑掉了'、站住、被追上，
  于是走走停停。" 旧实现 `fleeDistance 10` / `pressureRadius 8` 正是这个毛病。
- **逃跑的终点不能是"威胁压力降下来了"。** 傀儡一跑起来那个值按定义就会降，
  起跑两秒就会被满足，而身后两格还跟着三只。

#### B. 落地：三个新模块 + 一次拆分

| 文件 | 对应 Numen | 职责 |
| --- | --- | --- |
| `src/systems/combatPlan.js`（新，纯逻辑） | `Menace` + `AttackPlan` | 危险半径、`tooClose`、`isEngagingMe`、战力判据、`decideCombatMove`（带记忆）、`isContactFoe` |
| `src/systems/combatReflex.js`（新，纯逻辑） | `MobDefenseChain` + `SurvivalDecisions` | `defenseTriggered`（布尔）、`shouldHoldForDefense`（唯一的冷静宽限）、`fightResolved`、`fleeResolved`、`fleeTimedOut`、`corneredReached` |
| `src/systems/threatField.js` 新增 `chooseEscapeTarget` | `GoalRunAway` | 逃命落点：**按"离最近追兵的距离"排**（旧 `chooseFleeTarget` 按威胁值排，用于平时避让） |
| `src/systems/puppetArms.js` | — | **删掉** `decidePuppetAction` / `threatPressureAt` / `threatPowerAt` / `PUPPET_COMBAT_RULES`：判据搬进上面两个模块，这里只留"手里拿的东西值多少战力" |

`WorkSystem.tickSelfDefense()` 是执行层：每帧算一次局面（`combatFoes`），
决定身体归谁（`selectBodyHolder`），再按 `record.combat.phase` 走
`engage`（把这一帧交回常规战斗 AI）/ `flee` / `hold`（宽限里警戒）/ `work` 四条路。

**触发线是两条，第二条是刻意比 Numen 宽的**，理由写在代码里：
Numen 的同伴是 LLM 智能体，"要不要打路过的怪"由模型看着局面决定；
我们的傀儡没有规划器，而需求原文是「在干其他活的时候遇到怪物也会先把怪物打了」。
所以除了 Numen 的「它正在打我 且 够得着我」，还加了
「**它已经进了我自己的攻击距离**」（傀儡约 2.2m，弓手约 9.7m）。
两条都不会让"8m 外的狼"打断傀儡——那正是用户第 4 轮报的毛病。

#### C. 用户报的两条

1. **「基地的激光攻击怎么没了」——是基地把自己的结构耐久当弹药。**
   复现出来的时间线：`attackDurabilityCost = 1`、`maxStructureDurability = 49`，
   而结构耐久在生存模式里**没有任何自然回复**（只有「维修」类建筑的
   `restoreDurability` 光环能补）。基地打满 37 发、约 25 秒后 durability 卡在 0，
   `updatePlayerBaseAttack` 直接 return：射程里还有敌人、
   `findPlayerBaseAttackTarget()` 照样返回目标，但**再也打不出一发**。
   - 修法：玩家基地 `attackDurabilityCost 1 → 0`，并且 `updatePlayerBaseAttack`
     的耐久门槛改成"消耗为 0 时不拿耐久当门槛"。基地挨打照样掉耐久
     （那是 `damagePlayerBase` 的事，与开火无关），敌营那条**不动**——
     它的耐久同时是攻城进度，掉光不再还击对玩家是有利的手感。
   - 验收：新增 `verify-island-base-laser`，连续开火 60 秒、逐 5 秒一段，
     断言 `emptyBlocks === 0`。修复前第 6 段起全是 0（实测时间线 8/7/7/7/5 → 0/0/0…），
     修复后 7~8 发/段、60 秒 89 发。**只测一两发的话修复前后都是绿的**，所以必须跑长。
   - 这个脚本还记下一条测试口径：基地激光带 1.35 的击退，站桩靶子会被推出射程
     （第一次跑的时候 28 秒后 `targetFound` 就变 false，看起来像"激光又没了"），
     所以靶子必须**每帧摆回原位**。

2. **「现在木傀儡和狼怎么互相拉扯啊」——两个原因叠加。**
   1. 判据每帧重算、而且**判定里含距离**：狼（3.9）和傀儡（2.85）速度接近，
      距离在 8m 窗口边界上来回穿，结论一帧一变，`unit.target` 被反复清空 →
      表现就是"走过去、掉头、又回头"。
      修法：改成上面第 3 条——一场战斗是**状态**，开打时判一次，之后只在
      "目标没了 / 来了新的敌人 / 我扛不住了 / 退无可退"上重判。
   2. **逃跑距离和压力窗口几乎相等**（10 vs 8），跑两格就判"跑掉了"，站住，被追上。
      修法：`fleeDistance 14`（远大于任何危险半径，也超过任何单位的索敌半径 9.5——
      `TargetingSystem.isCurrentTargetValid` 一旦超出 aggroRange 就会丢目标，
      所以跑出 14m 是真的跟不上了），并且**终点改成"身边没有追兵"**，
      不再看压力。追兵**比傀儡快**时（狼 3.9 > 2.85）距离永远拉不开，
      所以另加 `fleeMaxSeconds 10` 的兜底阀门 + `corneredSeconds 1.2` 的"退无可退"检测
      ——后者一闩住就转身打，避免"被堵在墙角逃到死"的活锁。
   - 附带发现并修掉一个**与本次需求无关的既有 bug**：`resetMoveGoal()` 只清
     `goalKind`、不清 `approachKind`，而 `applyMove` 的停机位是
     `approachKind !== goalKind` 才重算的。于是**换一个资源点之后傀儡会走到上一棵树
     的停机位站着不动**，工人状态却一直显示"前往资源点"。
     实测：把傀儡放到基地 34m 外再派一棵 5.8m 外的树，它朝反方向走到 17m 外的旧落点后卡死、
     `progress` 永远 0。修法是 `resetMoveGoal` 把 `approachKind/X/Z` 一起清掉。

#### D. 验收

- 纯逻辑（新增两个脚本，`package.json` 里 `test:combat-plan` / `test:combat-reflex`）：
  - `test-combat-plan`：危险半径按每只敌人自己的够到距离算、与 `AttackSystem` 同公式、
    只有"锁定我/刚打过我"才算在打我、**距离无关**（1~7m 逐档）、装备越好结论只会越好、
    三成血以下就跑、退无可退转身打（空手例外）、**承诺**（已在打的那只必须留着）、
    "挑不出目标但还有人追我"不许误判成"打不过就跑"（Numen 点过的错判）。
  - `test-combat-reflex`：两条触发线各自成立且不合并、固定优先序、
    冷静宽限的边界、**打完不设冷却**、**抖动模拟**（触发信号逐帧开关 120 帧，
    断言身体持有者的翻转次数 ≤ 2）、逃跑终点、兜底阀门、巢穴不算追兵。
  - `test-threat-field` 新增 `chooseEscapeTarget` 的六条（按离追兵的距离排、
    追兵不止一只时取最近的、拉不开距离返回 null、有直线的优先、没有追兵时不乱跑、
    兜底步长的默认值存在）。
- 游戏内（新增两个脚本）：
  - `verify-island-ai-combat`：旁边有敌人但没动手 → **一帧都不打断**（0 帧、0 场战斗）；
    被咬 → 只开 1 场、阶段翻转 ≤ 4（实测 2）、狼被打死、身体在 2.1 秒后才交还、
    任务不丢、**回去接着采**（累计采集次数真的又涨了）。
  - `verify-island-base-laser`：见上面 C-1。
  - `verify-island-puppet-combat` 的**判据口径**跟着改了：以前它用 `pin()` 把敌人钉成
    "威胁地标"（清 `target`、`aggroRange` 归零）来测逃跑，而新判据下这种敌人
    傀儡**根本不会理**（那正是要的行为）。所以测逃跑/迎战的那几段改用新的
    `holdAttacker()`：保留索敌（真的在打我）、只掐掉移动与伤害，
    并且站在 1.8m（在它自己的攻击距离里）。另外新增 `fleeCommitsWithoutFlapping`
    （整段逃跑里战斗阶段翻转 ≤ 2）。
- 回归：**92/92 通过、0 抖动**（单元脚本 63 + 启动/悬空检查 + 游戏内 27）。

#### E. 留给下一轮

- 傀儡的**作业移动**仍然走直线（`applyMove` 里的 `direct: true`），只有逃跑走 A*。
  岛上地形开阔时够用，障碍变密之后要回头把作业移动也接到导航转向。
  这是**既有的取舍**（`WorkSystem.applyMove` 的注释里有实测记录），本轮没有改。
- `SnapshotBuilder` 仍然不序列化 `isRecruitable`；资源 tab 的合成行只覆盖 `RECIPES`。
- 本轮所有数值（`engagePowerRatio 1` / `minHealthRatio 0.3` / `fleeDistance 14` /
  `calmGraceSeconds 2`）都是**代码标定 + 自动验收**，没有真人试玩。
  手感问题（逃多快算够、警戒那 2 秒会不会显得发呆）仍然需要用户试玩确认。
