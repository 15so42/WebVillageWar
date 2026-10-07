# DSH 只修 bug — 最终报告

状态：**本轮收口完成**（1 个实际代码缺陷已修并验证；5 个既存失败定性为「旧断言与现规则/现源码不一致」，不是可边界修复的代码故障；`test:worker-recharge` 的挂起已定位到夹具循环，如实保留）
负责人：DSH agent（Codex 不审代码、不重跑测试）
授权来源：`docs/DSH_BUGFIX_HANDOFF.md`（覆盖此前的 15–20 分钟全流程 / 首夜 / 完整实玩验收要求）
上一阶段：`docs/DSH_OPENING_FREEDOM_RESULT.md`（未覆盖，保留）
工作目录：`F:\WebProjects\WebVillageWar`

## 一、本轮实际修复的代码 bug

### 1. `ResourceNodeSystem.attach()` 在节点缺 `userData` 时抛 `TypeError`（已修）

| 项 | 内容 |
|----|------|
| 文件 | `src/systems/ResourceNodeSystem.js`（`attach()` 第 133 行附近、`registerSpawnedNode()` 第 155 行附近） |
| 现象 | `const root = node?.object; if (root) root.userData.resourceNodeId = node.id;` —— `object` 存在但 **`userData` 为 undefined** 时抛 `TypeError: Cannot set properties of undefined (setting 'resourceNodeId')`。异常发生在 `attach()` 的 forEach 内部，**整张采集状态表都建不起来**（不是只丢一行便利字段） |
| 触发面 | 真实世界的节点由 three 创建，`userData` 必然存在，所以正式流程走不到；但**传入轻量节点桩的只读测试/工具**必崩（`test-inventory` 3 条断言全挂在这一处）。同文件的 `release()` 等都用了 `?.` 可选链，唯独这两行没有——属**同一文件里的既有遗漏** |
| 修复 | 两处改为 `if (root?.userData) root.userData.resourceNodeId = node.id;`（并补注释说明为何判空） |
| 是否改变玩法 | **否**。只是让「点模型反查节点」这条便利路径在缺 `userData` 时安静跳过，规则、数值、顺序全不变 |
| 验证 | `node --check` exit 0；`test:inventory` **14/17 → 17/17**；真实浏览器 boot 后 285/285 节点 `userData.resourceNodeId` 映射正确、0 mismatch（见第四节） |
| 附带 | 顺手修了同一 import 块里 `normalizeResourceNodeState,  resolveHarvest,` 两行挤在一行的问题（纯排版，无行为变化） |

### 没有其他「可边界修复的实际代码 bug」

用户点名的四类现象，逐项复核后**都已有落实的修复**（本轮不重做，仅做代码级 + 只读浏览器复核）：

| 用户点名 | 现状 | 复核结论 |
|---------|------|---------|
| 预设塔位 / 吸附错误 | `placeDefenseSlotMarkers` / `defenseSnapPoint` / `claimDefenseSite` **已删除**；`defenseSlot` → `raidRally` 只留 `x/z` 给**敌方内部集结** | 真实浏览器实测：三个函数 `typeof` 全部 `false`、`raidRallyFor` 存在；全仓库 `grep` 无任何 `defenseSlot` 字段/`箭塔位` 标签残留（只剩 2 处解释历史的注释） |
| 开局敌人越界攻击工人 | 北路哨卡移出基地空地 + `guardRadius`/`homePoint` + `TargetingSystem.isInsideGuardZone` 领地过滤 | 真实浏览器实测（本轮独立复测）：傀儡 30/30、`planState='idle'`、最近敌人 **15.4m**、基地 50/50、18 个敌人但 0 入侵 |
| 正常 G 键采集 / 运输入库 | `WorkSystem.nodeIsWorkable` 领地硬判据 + 南侧安全起手林地 + 框选反馈 | `test:work-orders` 15/15、`test:work-records` PASS、`test:resource-nodes` 15/15、`test:planting` 9/9；G 键入口、`nodeIsWorkable` 在真实实例上可调用 |
| 建筑放置 / 施工 / 供能 / 生产 | 无预设槽位依赖，合法性仍由碰撞/地形/供能范围/成本约束 | `test:building-repair` 19/19、`test:power-budget` 8/8、`test:facilities` 8/8、`test:power` 16/16、`test:island-terrain` 16/16、`test:spawn-points` 15/15、`test:targeting` PASS |

**保留项（逐条守约）**：玩家自由建塔语义、真实 G 框选采集语义、用户全部未提交改动、现有架构、UTF-8 编码。

## 二、6 个既存失败测试的逐项定性（本轮在**当前工作树**上全部复现）

| 测试 | 本轮实测 | 定性 | 依据 |
|------|---------|------|------|
| `test:inventory` | 14/17 → **17/17（已修）** | **实际代码故障** | 3 条断言全挂在同一个 `TypeError`（见第一节） |
| `test:backpack-ui` | 31/34（不变） | **旧断言与现源码不一致** | 3 条失败全是**源码文本正则**：`key === 'e'` 后接 `toggleUnitBackpack()`、`key === 'escape'` 后**紧跟** `backpack?.isOpen()`、字面量 `craftInto(recipeId)`。现实现是**有意的统一入口** `toggleInventoryShortcut()`（`Game.js:3291`，旧方法已标 `@deprecated`）与 `craftInto(id, {destination})`（`BackpackUi.js:1710`）。功能在，是断言把旧函数名/旧调用形状写死了 |
| `test:drops` | 9/10（不变） | **旧断言与现规则不一致** | 夹具用 `target.add('stone', 200)` 想把唯一一格占满；运行时单格上限是 **64**，该次整笔失败、那一格仍是空的，于是 `pickUpDrop` 正常成功。**不是游戏缺陷** |
| `test:inventory-transfer` | 16/18（不变） | **旧断言与现规则不一致** | 2 条断言写死「单格上限 200」（`190→200`、`added 200`），运行时是 64。同上 |
| `test:passive-durability` | `5 !== 6` | **旧断言与现架构不一致** | `RecoverySystem` 在 **HEAD `8a0ffc6`** 起已是 Bulwark 回血，被动耐久恢复已移除；`git diff` 对该文件为空（本工作树没动它），属既有架构变化 |
| `test:worker-recharge` | **挂起**（>2 分钟不退出；用 `>>CHK` 插桩定位到**第 6 条断言**） | **夹具循环与运行时规则不一致（脚本挂起）** | 定位到 `makeHarness` 里 `while (record.inventory.freeSlots() > 0) record.inventory.add('wood', 200)`：它假设「加 200 就占满一格」，而单格上限 64 → `add` 每次对整格补满也无济于事，`freeSlots()` 永不归零，**同步死循环**。游戏本体不参与该循环，故**不影响可玩性** |

### 关于「单格上限 64 vs 200」（**未改，如实记录为不一致**）

- `ITEM_RULES.defaultStackLimit = 64` 与 `items.js` 的 `Math.min(perDef, cap)` **在 HEAD 提交里就已存在**（`git show HEAD:src/systems/items.js` 已核），不是本轮引入。
- `docs/DSH_GAMEPLAY_RESULT.md`、`docs/DSH_DEFENSE_SURVIVAL_RESULT.md`（上一轮）也把它记为「运行时是 64」。
- `ITEM_DEFINITIONS` 里木材/石料写 `stackLimit: 200`，属**定义层的陈旧数值**。
- **为什么不改**：统一到 200 会改变实际存储容量（3 倍），并连带 `crafting.js`（`recipeOutputRoom`）、`production.js`（`stackLimit = 64` 默认参数）整条生产/搬运/合成链路，属**玩法平衡改动**。按 handoff §3「不能为了测试全绿修改正常玩法」，本轮**不动**，仅如实记录。
- 同理，`test:worker-recharge` 的挂起只需把夹具那一行改成按 `itemStackLimit('wood')` 填充即可解除，但那是**改测试让断言过**，不属本轮授权范围，故保留并如实列为「脚本挂起」。

## 三、命令结果（全部实际执行）

| 命令 | 结果 |
|------|------|
| `node --check src/systems/ResourceNodeSystem.js` | exit 0 |
| `node --check scripts/.dsh-probe-bugfix-verify.mjs` | exit 0 |
| `node scripts/test-inventory.mjs` | **17/17 通过**（修前 14/17） |
| `npm run test:work-orders` | 15/15 通过 |
| `npm run test:work-records` | PASS |
| `npm run test:resource-nodes` | 15/15 通过 |
| `npm run test:island-terrain` | 16/16 通过 |
| `npm run test:spawn-points` | 15/15 通过 |
| `npm run test:targeting` | 通过（Nearest-unit targeting checks passed） |
| `npm run test:planting` | 9/9 通过 |
| `npm run test:building-repair` | 19/19 通过 |
| `npm run test:power-budget` | 8/8 通过 |
| `npm run test:facilities` | 8/8 通过 |
| `npm run test:power` | 16/16 通过 |
| `npm run build` | **exit 0**，190 modules，`built in 876ms` |
| 逐项复现 6 个既存失败 | 见第二节（含 `test:worker-recharge` 的 45s/75s/120s 三次超时与插桩定位） |

所有外部命令均设了有限超时（单测 ≤75s，构建 180s，探针 180s），无挂起残留进程。

## 四、短程真实浏览器复核（复用既有隔离环境，未新开服务）

- **环境**：复用既有 `9235` 端口 headless Chrome（独立 `user-data-dir`）+ 既有 `http://127.0.0.1:3000/` dev server（HTTP 200）。**未**触碰用户日常浏览器、**未**启停任何用户服务。
- **渲染**：沿用该会话既有参数（`--use-angle=d3d11` 硬件路径），**未**加 `--disable-gpu`/WARP/SwiftShader，**未**改游戏时钟、**未**注入资源、**未**补帧、**未**调 `game.tick()`。
- **探针**：`scripts/.dsh-probe-bugfix-verify.mjs`（只读，仅 `Runtime.evaluate` 查询），运行约 40 秒。
- **结果**（`outputs/_dsh-bugfix-verify.json` / `C:/Users/A/.codex/tmp/dsh-bugfix-20261006/_dsh-bugfix-verify.json`）：

| 项 | 实测 |
|----|------|
| 浏览器 / 控制台问题 | `problems: []`（无异常、无 `console.error`）；`runtimeError: null` |
| 资源节点注册（本轮改动直接相关） | 节点 **285** 个；`withHandle 285`、`withUserData 285`、`resourceNodeId` **映射正确 285 / mismatch 0 / nullUserData 0**；`activeNodes 285` |
| 采集账本归属 | `usesInternalBank: false`、`depositTarget === baseInventory: true`（库存接管，无第二份所有权） |
| 自由建塔 | `placeDefenseSlotMarkers`/`defenseSnapPoint`/`claimDefenseSite` 全部 `typeof === 'undefined'`（已删）；`raidRallyFor` 存在（敌方内部路线保留） |
| 开局安全 | 唯一工人存在、`workerCombatMode: 'avoid'`、hp **30/30**、`planState: 'idle'`、最近敌人 **15.4m**、基地 50/50、敌人 18 个但无人入侵 |
| 截图 | `F:/WebProjects/WebVillageWar/outputs/dsh-bugfix-verify-01-boot.png` |

## 五、明确区分：已修 / 剩余 / 未验证

### 5.1 本轮已修并验证的实际 bug（1 项）
- `ResourceNodeSystem` 缺 `userData` 时的 `TypeError` → 修 + 17/17 单测 + 真实浏览器 285/285 映射。

### 5.2 剩余（**未修，如实保留**）
1. `test:worker-recharge` **脚本挂起**（夹具 `while (freeSlots() > 0) add('wood', 200)` 不收敛）。不是代码故障、不影响游戏，但脚本本身不可用。
2. **单格堆叠上限 64 与 `ITEM_DEFINITIONS` 的 200 不一致**（`test:drops` / `test:inventory-transfer` / `test:worker-recharge` 三处共同根因）。修它属玩法平衡改动，本轮未做。
3. `test:backpack-ui` 3 条**源码文本正则**断言未同步到「统一背包入口」。功能正常，是断言陈旧。
4. `test:passive-durability` 断言被动耐久恢复，该能力已在 HEAD 被移除。被测对象已不存在。
5. 上一轮已记录、本轮未处理的既有项：移动端供能条 84px 横向滚动；`resolveResourceSiteFor` 的 `kind:'depleted'` 分支缺端到端断言（均在 `docs/DSH_DEFENSE_SURVIVAL_RESULT.md` §5.3/5.5）。

### 5.3 仅「未验证」，**不等于 bug**
- 真实 UI 完整链（合成 → 放置施工 → 耗能设施**真实出料** → 自选塔位 → 首夜防守 → 15 分钟以上）**本轮未跑长实玩**——用户已明确取消该要求（「算了，让他把bug修了就行了」）。这些环节的规则侧由第三节的目标回归覆盖，但**没有本轮的人类级整局证据**；上一轮的 `_dsh-freedom-accept2.json` 记录了**关卡在 1:48 失败**（唯一工人被打死），应视为**当时的真实结果**，不能当作已通过的体验验收。
- 敌方夜袭巢穴的领地不设限（有意保留压力）→ 首夜仍可能冲基地，属设计而非缺陷，未验证其可操作性。
- 移动端布局、性能预算、联机路径本轮均未触碰、未验证。

## 六、边界与守约

- 未执行 `git commit` / `git push` / PR / 公网部署 / 远程设置修改；未 `git stash`/`checkout`/回滚任何用户改动。
- 未递增 `GAME_VERSION`、未写玩家可见更新日志（本轮不提交、不部署，按项目规则不需要）。
- 未创建任何 AI 子代理（无嵌套代理）；未读 API key / 配置；未请求任何权限。
- 未做全仓库扫描；未重跑全套测试；只跑了 6 个既存失败 + 与本轮改动/用户点名直接相关的 9 个目标回归。
- 新增文件：`docs/DSH_BUGFIX_RESULT.md`（本文件）、`scripts/.dsh-probe-bugfix-verify.mjs`（只读探针）；清理了自己产生的 2 个临时脚本（`.dsh-tmp-probe-inv.mjs`、`.dsh-tmp-recharge-debug.mjs`）。
- 未触碰 `~/.codex` 等仓库外目录的既有产物（探针 JSON 写在既有 `C:/Users/A/.codex/tmp/dsh-bugfix-20261006/`）。

## 七、给下一轮的最小建议（本轮不做）

1. 在**干净基线**上重跑 `test:inventory` / `test:worker-recharge`，彻底排除与未提交改动的耦合（上一轮就记为待办）。
2. 若要收口 `test:worker-recharge`，**改夹具**（按 `itemStackLimit('wood')` 填充）而不是改游戏规则；若要收口 `test:backpack-ui`，把源码文本正则换成行为断言。
3. 若确认要统一「单格上限 64 vs 200」，应单独立项并同时核算 `crafting.js` / `production.js` 的整条链路，不要在测试收口里顺手改。
4. 需要体验级证据时，再跑一次真实实时实玩（自由建塔 ×2 + 非法点拒绝 + 熔炉真实出料 + 首夜），复用上一轮的 `accept3` 脚本框架，不必重做已落实的修复。
