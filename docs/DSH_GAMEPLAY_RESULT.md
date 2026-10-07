# DSH 执行结果：海岛生存 · 远征与区域成长（2026-10-05）

- 任务书：`docs/DSH_GAMEPLAY_HANDOFF.md`
- 设计 / 状态 / 证据：`docs/SURVIVAL_EXPEDITION_DESIGN.md`（本轮新建，含方案与逐项完成状态）
- 仓库：`F:/WebProjects/WebVillageWar`，分支 `cursor/cloud-agent-1790593832279-e92v8`
- 执行模型：commandcode / deepseek/deepseek-v4.1-flash。全程 UTF-8。
- 结论：**本轮方案的四条路线、区域图纸门槛、四项科技真实效果、夜袭预报与清线回报全部落地并验收通过。**
  未提交、未推送、未部署；未递增版本号、未写玩家更新日志。

---

## 1. 实际修改的文件（全部为本地修改，无 git 状态变更）

| 文件 | 改动 |
| --- | --- |
| `src/systems/expedition.js` | 新增 `nativeWeaponDamage(definition)` 与 `loadoutDescriptorFor(unit, extra)`；`loadoutReadiness` 的文档改为按真实伤害字段判定。这是把"自带武器"的判定从 `weapon.damage` 修正为 `damage / physicalAttack / magicAttack` 的那一处 |
| `src/systems/ExpeditionSystem.js` | `loadoutDescriptors()` 改为经 `loadoutDescriptorFor` 映射（运行时与纯测试共用同一份口径），删掉读 `definition.weapon.damage` 的旧写法 |
| `src/systems/ExpeditionPanelUi.js` | 夜袭预报那一行：数量项（存活上限 / 每批）只在真的非零时才写，避免每天显示"存活上限 +0 · 每批 +0"暗示一条不存在的加成 |
| `scripts/test-expedition.mjs` | 装备判断测试改用真实 `UNIT_DEFINITIONS`（删掉"测试注入 18 点伤害"的写法）；新增"自带武器必须读真实伤害字段"测试；新增中立阵营与不适用建筑的作用域断言（23 项，全通过） |
| `scripts/verify-island-expedition.mjs` | 修好熔炉装料（`allowPartial`）+ 显式断言配方已解析；统一扣费差值符号；补 `recipeSecondsBefore/After`、`stalledTicks`、`reasons` 诊断；清线残兵实验改为先清整线再留残兵；新增"平移命令不受影响""清完整线禁用查看位置""面板 DOM 稳定性""真实招募单位的装备描述符""工具磨损不受军械保养影响"等判据（30 项，全通过） |
| `scripts/verify-island-tech-effects.mjs` | 过期夹具：按站点真实链路装进料格与燃料格，并从站点格子读周期与产出（断言一条未减） |
| `scripts/verify-island-production.mjs` | 过期夹具：补上熔炉燃料格；"缺料停摆"改为清空进料格（燃料仍满），使停摆原因真的是 `no_input` |
| `scripts/verify-island-day-night.mjs` | 两条判据量错了对象：`laterNightMore` 改为比"这一夜新刷出几个"；`noSpawnByDay` 改为比"有没有新 id + 刷怪点出兵计数"，不再用总数严格相等 |

临时探针：新建并已删除 `scripts/.tmp-furnace-probe.mjs`（用于定位烧炭周期读数被 `no_power` 污染）。
上一轮会话遗留的 `scripts/.tmp-expedition-probe.mjs`、`scripts/.tmp-canyon-world.mjs`
**未删除**（不属于本轮新增，按"只清理自己新增的临时文件"处理）。

未改动的既有实现（本轮只接续）：`SURVIVAL_EXPEDITIONS`、四项科技数据、`research.js` 的
`requiresNestId/normalizeTech/unitTechModifiersFor/productionPatchFor`、`ResearchSystem` 的
原子扣费与幂等挂载、`Game.js` 的接线与每帧采样。这些在接手时已经写好，本轮做的是核验、补测与修缺陷。

---

## 2. 命令与结果（全部在 `F:/WebProjects/WebVillageWar` 下执行）

| 命令 | 结果 |
| --- | --- |
| `node --check` × 51（`git status` 里全部改动的 `.js`/`.mjs`） | `checked=51 failures=0` |
| `npm run build` | `✓ built in 959ms`，180 modules；仅既存的 chunk >500kB 警告 |
| `node scripts/test-expedition.mjs` | **23/23 通过** |
| 73 个 `test:*` 单元脚本 | 66 通过 / 7 既存失败（见第 4 节） |
| `node scripts/check-dangling-calls.mjs src/systems/Game.js` | 疑似悬空调用 0 个名字 |
| `CHECK_CDP_PORT=9235 node scripts/check-game-boot.mjs` | exit 0，`page problems: 0` |
| `node scripts/verify-island-expedition.mjs` | **ISLAND EXPEDITION: PASS** — 30 项判据全 true、`errors: []`、`problems: []` |
| `node scripts/verify-island-tech-effects.mjs` | ISLAND TECH EFFECTS: **PASS** |
| `node scripts/verify-island-production.mjs` | ISLAND PRODUCTION: **PASS** |
| `node scripts/verify-island-day-night.mjs` | ISLAND DAY NIGHT: **PASS** |
| `node scripts/verify-island-victory.mjs` | PASS（8 巢 + 残敌通关路径保持） |
| `node scripts/verify-field-recruit.mjs` | PASS（野外招募链路保持） |

最后一次"本轮范围内"的连续验收（日志 `C:\Users\A\.codex\tmp\villagewar-design-20261004\expedition-final-verify.log`）：

```
PASS	check-game-boot
PASS	verify-island-tech-effects
PASS	verify-island-production
PASS	verify-island-day-night
PASS	verify-island-expedition
```

浏览器环境：自建 headless Chromium（Chrome 154）+ CDP `127.0.0.1:9235`，
独立 `--user-data-dir=C:\Users\A\.codex\tmp\villagewar-design-20261004\chrome-profile`，
复用既有本地服务 `http://127.0.0.1:3000/`。未操作任何用户日常浏览器，未停止其它服务。

### 2.1 关键实测数字（摘自通过的运行）

- 开局 1 木傀儡 / 0 战斗护卫 / 8 刷怪点 / 3 野外营地；目标句要求先合成并装备傀儡木棒，
  且不催去单挑营地。
- 夜袭预报：`正在威胁基地 4 座 · 被内巢封印 4 座 · 已清除 0/8 座`（与 `gateNestId` 真实状态一致）。
- 「查看位置」：解除相机跟随（true→false）、镜头落在目标点 ±12 内、选中集合与所有 `moveGoal` 不变、
  镜头仍在战场边界内；面板开着 + 追踪生效时真实移动命令照常生效
  （自治傀儡 `rally none → 7.5,36.5@moving`）。
- 采样与帧率无关：60fps 与 144fps 各推进 0.5 秒都只重建 1 次。
- 图纸锁定：`missing_blueprint` + 「还没有区域图纸：先拆掉北岬巢穴」，材料 0 扣除；
  拆无关巢穴仍锁着；拆对巢后 `blueprint.ready = true` 且目标自动换外巢、HUD 给出解封警告。
- 原子扣费（`after - before`）：`-18/-8/-16`、`-24/-16/-12`、`-12/-8/-16`、`-20/-12/-12`；
  重复研究库存逐字节不变；「采集效率」`{wood:-40, fiber:-25}`。
- 哨站测距：箭塔 9.2 → 10.7；新建弩炮 15.0（13.5 + 1.5）；熔炉 `0`；当场重生的敌方剑士 `1.15 = 定义值`。
- 林地采运：一次采集动作 5 → 8，`harvestBonus = 3`。
- 军械保养：`1.15 → 0.92`，真实攻击实测掉 0.92；连挂 3 次 / 全量刷新 / 快照 / 换武器 / 再快照都是 0.92；
  `reset()` 后回到 1.15；`maxDurability` 未变；招募归队的塔盾兵 0.68。
- 工具磨损：有军械保养 1 / 无军械保养 1 / 规则值 1（`unchanged = true`）。
- 炭窑鼓风：配方 8 → 6 秒，实测 6.05 秒/周期、产出 2、投入 4、燃料 2、`stalledTicks = 0`；
  叠「高效烧炭」后产出 3、周期仍 6 秒；基线（研究前）8.05 秒/周期、产出 2。
- 装备判定：真实招募的塔盾兵 `nativeWeaponDamage = 5` 而旧公式 `= 0`；有部队后 HUD 不再催做木棒。
- 清线：整线清完后 80 tick 只有故意留的 2 个残兵（`westNewUnits = 0`），
  北岬盾巢作为对照照常出兵；残兵在场时 `checkVictory() === false`；
  「查看位置」按钮 `disabled`、`focusRoute('west')` → `{ok:false, reason:'no_target'}` 且镜头未动。
- 面板 DOM：关闭后根节点仍是同一个（仅 `hidden`），内容未变时 `refresh()` 返回 `false` 且不换节点。
- 生命周期：Esc 收起不暂停、B 键规则不变、暂停后继续可用、重开后根节点 0 → 1、`destroy()` 后 0 且按钮隐藏。

### 2.2 截图（绝对路径，已逐一查看）

- `C:\WebProjects\WebVillageWar\outputs\expedition-desktop-1280x720.png`
- `C:\WebProjects\WebVillageWar\outputs\expedition-mobile-390x844.png`

桌面图为右侧可收起路线面板：夜袭预报 + 北岬线卡片（目标 / 敌群 / 实际掉落 / 木傀儡 / 待招募 /
区域图纸 / 收益理由 / 追踪 / 查看位置），棕灰中世纪皮肤，无紫蓝渐变、无卡片套卡片。
手机图（390×844，2x）里面板整体在视口内、文字换行不溢出、列表可滚动，
「西岭线（西）」在整线清除后显示「全线清除 / 当前目标：这个方向已经清空」。

**路径说明（真实情况）**：脚本沿用了同目录下十余个验收脚本既有的产物目录写法，硬编码
`C:/WebProjects/WebVillageWar/outputs`（仓库早先位于 C 盘时的历史路径）。仓库自带的
`F:/WebProjects/WebVillageWar/outputs/` 只有另外三个用相对路径的脚本写的图。
图片内容是 `http://127.0.0.1:3000/` 上真实运行的页面，与本轮代码一致；落地位置不影响结论，
但这是一个应当单独清理的历史遗留（见第 4 节）。

---

## 3. 已解决的问题（对应任务书第 13–20 行的 7 条核验点）

1. **伤害字段误判（第 1 条）**：`loadoutDescriptors` 原本读 `definition.weapon.damage`。
   实测 `raider / archer / spearman / swordsman / towerShield / shieldBearer` 的
   `weapon.damage` **全部为 0 或 undefined**，旧写法把 6 种自带武器的兵种全部误判成"没有武器"。
   现改为读 `damage / physicalAttack / magicAttack`，并由浏览器验收用**真实招募来的塔盾兵**证明
   （新口径 5、旧口径 0），没有靠"测试注入正伤害"过关。
2. **基线读空 recipe（第 2 条）**：真实原因是进料格只有 1 格、`Inventory.add` 默认整笔成功或整笔失败，
   旧夹具 `add('wood', 400)` 超容后 `added = 0`，熔炉始终 `no_input`、`record.recipe` 恒为 `null`。
   已修夹具并显式断言"配方已解析"（`recipeRegisteredBefore/After`），没有用可选链把缺失的配方蒙过去；
   每个阶段现在都会完整执行并把失败记进 `report.errors` / `verdict`。
3. **扣费符号（第 3 条）**：统一为 `after - before`，四项新科技与「采集效率」都按真实差值断言。
4. **图纸门槛与幂等（第 4 条）**：无权威来源即锁、无关巢穴不解锁、失败与重复研究不扣费、
   成功一次整笔扣费、属性效果经唯一 source 幂等（3 次挂载 / 全量刷新 / 快照 / 换武器 / reset 全不叠乘）。
5. **采样与 DOM（第 5 条）**：0.5 秒采样按真实累计帧时间（60fps 与 144fps 都只重建 1 次），
   且不在 HUD 的 0.1 秒节流里；关闭面板不重建 DOM；内容未变不反复重建；
   开局、招募、换装、快照、重开、`destroy()` 均通过。
6. **相机按钮与清线语义（第 6 条）**：整线清除后「查看位置」禁用且 `focusRoute` 返回 `no_target` 不动镜头；
   清内巢自动切外巢并明确警告外圈解封出兵；整线清除只停止新出兵，残敌仍在、仍须消灭。
7. **四项科技真实效果（第 7 条）**：8→6 秒且与产量科技叠加、采集 5→6→8、
   己方箭塔/弩炮 +1.5m、移动战斗单位耐久消耗 ×0.8，
   敌方 / 不适用建筑（熔炉）不获得效果，工具采集扣耗保持原规则（有/无科技各量一次，同为 1）。

额外修好的过期夹具（同一根因，直接关系到炭窑鼓风所改的生产链与夜袭预报）：
`verify-island-tech-effects`、`verify-island-production`、`verify-island-day-night` 三条现已转绿。

---

## 4. 未解决 / 限制（真实情况，不粉饰）

1. **7 个既存单元测试失败**，全部落在本轮未触碰的子系统，来自工作树里**未提交**的
   站点/运输/物品改造：`test:backpack-ui`(31/34)、`test:drops`(9/10)、`test:facilities`(7/8)、
   `test:inventory`(14/17)、`test:inventory-transfer`(16/18，期望单格上限 200 而运行时是 64)、
   `test:passive-durability`、`test:worker-recharge`（该脚本长时间不退出，被手动结束）。
   依据：本轮一共只改 8 个文件（见第 1 节），这些失败脚本都不 import 它们；
   它们依赖的文件（`items.js`、`Inventory.js`、`drops.js`、`WorkSystem.js` 等）在我开始前就是
   未提交的修改状态。
2. **4 个既存浏览器验收仍红**，都能指出过期原因，同样不属于本轮：
   - `verify-island-spawn-points`：夹具硬编码"4 个刷怪点"（现在是 8 个，
     4 内 + 4 外），并把野外营地（`fieldCamps.js`）刷出的野狼算成"没有归属点位的孤儿敌人"
     （实测 `untagged: 6`，其中 2 只是不带 `spawnPointId` 的野狼）。
   - `verify-island-research`：附魔 / 魔力石相关判据（`stoneIsSingleItem`、`enchantListingWorks`、
     `enchantSpendsExactly` 等）过期。
   - `verify-island-puppet-combat`：`unarmedFlees`、`toolOnlyAlsoFlees`、`prefersLowThreatNode` 过期。
   - `verify-island-recruit-source`：仅 `workerMenuShowsBackpackAndStop` 一条过期（单位扇形菜单入口）。
   按任务书"不做无关扩展、只处理当前任务相关文件"，我没有改这些脚本内部的业务断言。
3. **截图落地目录是历史遗留**：多个验收脚本硬编码 `C:/WebProjects/WebVillageWar/outputs`，
   而仓库现在在 F 盘。本轮沿用现状以免给一个已经全绿的脚本引入新的不确定性，
   但这是应当单独清理的一项。
4. **熔炉不会从基地自动进料**：玩家要用运输线或站点面板手动装料。这是工作树里站点改造的既定行为
   （不是本轮引入），也正是多条夹具过期的同一个根因；是否恢复自动供料需要单独的设计决定。
5. **未做真机触屏验收**：手机只做了 390×844 的渲染与几何断言，没有在真实触摸设备上验证拖拽/缩放。
6. **未做大规模压力验收**：没有在"大量单位 + 大量特效同屏"下实测远征采样与面板刷新开销。
   已知采样 0.5 秒一次、只在 `rebuild()` 时读一次 `friendlyUnits`，但缺同屏单位的实测帧时间。
7. **`nightRaidModifiers` 的 `extraAlive` / `extraPerTick` 目前恒为 0**（`DAY_NIGHT_RULES`
   明确"只抬难度，不再加数量"）。面板已改成非零才显示，避免暗示不存在的加成；
   要让后一夜真的"更多兵"需要先改平衡规则，本轮不动。

---

## 5. 下一轮可选设计建议

1. **专门一轮清理过期夹具**：第 4 节第 1、2 项共 11 个脚本，需要的是"跟上当前实现"而不是新功能，
   混在玩法改动里做会互相干扰。
2. **远征与后勤联动**：清掉一条线后在该方向开一条更短的补给线（例如用外巢旧址当临时仓），
   让"打下来"直接变成"用得上"。现在只有图纸与停止出兵两种回报。
3. **外巢第二张图纸**：给同一条线一个后期升级（如哨站测距 II），但必须先确认不会变成纯数值膨胀。
4. **远征板上的兵力粗估**：把 `nightRaidModifiers` 与点位 `enemyPool` 权重合成
   "这一趟大概要带几支兵"，前提是先有可信的兵力评估函数。
5. **统一"还有谁在出兵"的口径**：把野外营地（`fieldCamps.js`）的残余敌人也纳入夜袭预报，
   目前只有"防线缺口"那一句是共用的。

---

## 6. 授权与边界遵守情况

- 未执行 `git reset` / `checkout` / `clean` / `commit` / `push`，未创建 PR，未部署公网，未改远程设置；
  本轮只做了本地代码修改、测试与修复。
- 未递增 `GAME_VERSION`（未提交、未部署），未维护玩家更新日志。
- 未重置或覆盖任何既有未提交改动；本轮改动集中在 8 个文件，其余改动原样保留。
- 未创建任何 AI 子代理；未做全仓库反复阅读，按目标读取相关片段。
- 只在本地自建 headless Chromium（独立端口与 user-data-dir）中操作，未触碰用户日常浏览器，
  未停止其它服务。
