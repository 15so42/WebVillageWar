# DSH 实玩体验排查与修复 — 最终报告

状态：**完成（含明确列出的未验证项）**
工作目录：`F:\WebProjects\WebVillageWar`
时间：2026-10-05 晚 ~ 2026-10-06 17:57（多轮续跑；本轮 attempt 6 于 17:18–17:57 完成硬件渲染验证与实时复验）
本文件下半部分是滚动检查点原文归档（第 1–11 步），保留全部过程证据。

---

# 一、给玩家的一句话结论

默认开局现在**能玩**：唯一木傀儡按 **G 框选资源**就能自己去采集、走回基地卸货，基地库存真的增长
（实测 `石料 12 → 207`）；用这套真实材料可以合成并**真的建起**一栋建筑；顶部不再压着一条全屏「远征」横幅，
顶部详情只剩一句"眼下该干什么"；基地旁那些红圈现在写明是「箭塔位」；傀儡的遇敌策略有明确的当前模式与含义。
测试环境已确认跑在**正常硬件渲染**（NVIDIA RTX 2060 SUPER / ANGLE D3D11），服务器/浏览器不再处于软件渲染下。

---

# 二、本轮新增要求：正常硬件渲染（已满足）

用户要求：复用既有隔离 Chrome（9235），去掉 `--disable-gpu`、改用 `--use-angle=d3d11`，
确认实际 WebGL renderer 是硬件适配器，并给出正常计时下的帧率/帧耗时；禁止用软件渲染冒充正常性能；
禁止用篡改时钟/补帧冒充实时表现。

## 2.1 测试浏览器（复用，未重启、未改参数）

```
chrome.exe --headless=new --remote-debugging-port=9235
  --user-data-dir=C:\Users\A\.codex\tmp\dsh-playability-20261005\chrome-profile
  --no-first-run --no-default-browser-check --use-angle=d3d11
  --hide-scrollbars --window-size=1280,720 --autoplay-policy=no-user-gesture-required
```
GPU 进程实参：`--type=gpu-process --headless=new --use-angle=d3d11`（**无** `-warp` 后缀，不是 `d3d11-warp-webgl`）。
未触碰用户日常浏览器；未启动/停止任何用户服务（复用既有 dev server `http://127.0.0.1:3000/`）。

## 2.2 实际 WebGL renderer = 硬件适配器 ✅

游戏真实 three.js 上下文里读 `WEBGL_debug_renderer_info`（`unmasked: true`）：

- `UNMASKED_VENDOR_WEBGL` = `Google Inc. (NVIDIA)`
- `UNMASKED_RENDERER_WEBGL` = `ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER (0x00001F06) Direct3D11 vs_5_0 ps_5_0, D3D11)`
- `VERSION` = `WebGL 2.0 (OpenGL ES 3.0 Chromium)`；canvas 1280×720
- 新建离屏上下文得到同一串（不是只对游戏上下文生效）

Chrome 自己报告的 GPU 信息（浏览器级 CDP `SystemInfo.getInfo`）交叉验证一致：
`glRenderer = ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER (0x00001F06) Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.15.9186)`、
`glVendor = Google Inc. (NVIDIA)`、`gpu_compositing = enabled`；设备枚举为 `NVIDIA GeForce RTX 2060 SUPER`（驱动 32.0.15.9186）。
（枚举里另外出现的 `Microsoft Basic Render Driver` 是系统软件适配器，**没有被用作 WebGL renderer**。）

## 2.3 正常计时下的帧率/帧耗时（未篡改时钟）✅

**本轮所有性能读数均未挂钩时钟**：不注入 `RAF_DRIVER`、不调用 `__dshDriveFrames`/`__dshStep`、
不夹 `clock.getDelta`、不直接调 `game.tick()`。只额外注册一个只读 rAF 采样回调 + 读 three.js 自己的计数器。

| 指标 | 实测 |
|------|------|
| 采样窗口 | 20.0 s 墙上时间（另有 8 s、5 s 两次独立复测） |
| 浏览器 rAF 回调 | 2400 次 / 20.0 s = **120 /s**；帧间隔均值 **8.33 ms**，中位 8.3 ms，p95 8.4 ms，max 16.6 ms |
| 游戏实际渲染帧 | **约 60 fps**（8 s 内 961 次 rAF 回调中 481 次各渲染 3 次 `renderer.render()`，480 次不渲染） |
| `renderer.render()` 调用 | **180 /s**（= 60 游戏帧 × 3 次；每帧最后一次是 `calls:1 / triangles:1` 的全屏 pass） |
| 游戏自带 FPS 表（`#fps-meter`） | **`FPS 60`**（白天与夜间战斗中都读到；偶见 50） |
| **游戏时间推进比** | 20.01 s 游戏时间 / 20.0 s 真实时间 = **1.000**（复测 5.009 s → **1.002**） |
| 渲染进程 CPU（CDP `Performance.getMetrics`） | `TaskDuration` 7.629 s / 20 s = **38.1% 单核**；`ScriptDuration` 7.195 s；`LayoutDuration` 0.03 s；JS 堆 47.6 MB |

整机 CPU（PowerShell 采样 20.2 s，本机 16 逻辑核）：

| 进程 | CPU 秒 | 占单核 | 占整机 |
|------|-------|--------|--------|
| GPU 进程 | 3.78 | 18.7% | **1.17%** |
| 渲染进程 | 8.33 | 41.2% | **2.58%** |
| 全部 Chrome | 12.11 | 59.9% | **3.75%** |

对比用户描述的软件渲染（`d3d11-warp-webgl`，gpu-process 曾占整机约 **77%**）：
现在 GPU 进程占整机 **1.17%**、全部 Chrome **3.75%**。

**诚实限制**：这是 headless 环境，rAF 由合成器的合成 BeginFrame 驱动，不能等同有显示器/窗口的真实浏览器
（无法用 vsync 判定刷新率，还观测到少量负 `dt`）。因此"60 fps / 8.33 ms"应读作
"该 headless 硬件渲染环境下游戏循环跑满 60 fps 且游戏时间与真实时间 1:1"，
而不是"任何机器都 60 fps"。可靠的硬件结论是：renderer 字符串、GPU 进程不是 WARP、整机 CPU 占用个位数百分比。

---

# 三、用户五项问题逐项处理

| # | 用户问题 | 处理 | 真实 UI 验收证据 |
|---|---------|------|-----------------|
| 1 | 傀儡战斗模式改显式互斥 toggle，常驻当前模式与简短含义，重选/读档/多选混合一致 | 复用既有模式与规则，`puppetCombatMode.js` 新增 `PUPPET_COMBAT_MODE_MEANINGS`/`_MIXED_LABEL`/`summarizePuppetCombatModes`/`puppetCombatModeSummaryText`/`setPuppetCombatModeForUnits`；`BackpackUi` 改为 `role="radiogroup"` + `role="radio"` + `aria-checked`，标题右侧常驻模式徽标与一行说明；多选不同模式显示「混合」虚线态 | 探针实测：默认「战斗」徽标 + `aria-checked` 仅在战斗上；真实点击「避战」→ 单位字段 `workerCombatMode='avoid'`、徽标「避战」、`aria-checked` 转移；取消选中再点选仍为「避战」（与实际一致） |
| 2 | 移除屏幕顶部战役按钮 | 根因是 `index.html` 的 `#expedition-toggle` 落在高度塌成 0 的 `.hud-primary-top` 之后，被 `expedition.css` 的 `width:100%` 拉成 `[0,4,1280,37]` 全宽横幅；改为左下固定尺寸 chip（`width:max-content`），并加 `isRelevant()`：仅"已追踪路线"或"夜间巢穴真的在出兵"时出现；入口补齐到 `P` 键与帮助面板 | 修前 rect `[0,4,1280,37]` → 修后桌面 `[12,575,64,37]`；白天 `hidden:true / relevant:false / isNight:false`；真实按 `P` 仍能打开（4 张路线卡），面板打开时按钮保留以便收起 |
| 3 | 顶部详情只放当前对象/状态/操作信息，长篇说明迁到已有帮助入口 | 顶部目标句从 106 字压到一行「离入夜还有 5:00｜先给木傀儡做傀儡木棒（木材×12 + 石料×4）」；长文迁到新增的最小 `HelpPanelUi`（右上「?」按钮 / `H` 键，8 节 22 行，非模态不暂停） | 目标句 rect 高度 **55px → 20px**（宽度 630 不变）；帮助面板 `H` 打开、`?` 按钮关闭、点画布空白处收起，期间 `elapsedTime` 继续前进（不暂停） |
| 4 | 查清基地旁两个红圈用途，必要预警加短标签/图例，无用标记移除 | 查明用途：`defenseSlot` 是巢穴对应的**进攻驻守点**（夜袭单位先走这里再去基地），同时是箭塔吸附位，建成后 `claimDefenseSite()` 收圈。改为低饱和琥珀 `#d8b26a` / 不透明度 0.42，每个圈加世界短标签「箭塔位」（屏幕上即显示），帮助面板新增「基地旁的红圈」一节 | 修前 5 个圈在屏、仅 1 个有标签 → 修后 `labelHidden` 与 `onScreen` 完全一致（5 个在屏全有「箭塔位」，截图 16 / 44 目视不拥挤）；本轮硬件渲染截图 102 同样可见「箭塔位」标签 |
| 5 | 实测近距离怪物、生成布局、警戒/追击与采集路径；默认傀儡应能安全启动采集/运输/建造/供能 | 定位到真因不在采集状态机（见第四节撤回记录）；调整开局目标句顺序（先做武器再催清狼窝），保留扩张风险与夜袭压力；局部未改动敌人/夜袭/资源数量 | **正常实时、未篡改时钟**：真实 G 框选 → `harvesting` → `stone 12 → 207`、`harvested 280 / deposited 195`，傀儡存活（截图 110–114）；建造链见第五节 |

---

# 四、用户纠正（右键不是采集指令）的处理

**结论：已完全按纠正执行，错误结论已撤回，据错误测试所做的改动已只撤回自己那一处。**

1. **撤回**：早期检查点里"阻塞 A（严重）…真实右键采集指令下木傀儡 306 秒一无所获"的结论**作废**。
   右键本来就不是采集入口；右键后傀儡走到点附近待命属正常行为，不是"采集状态机卡死"。
2. **只纠正自己的改动**：早期我曾把 `issueHarvestOrders()` 接到 `commandSelectedUnits()`（即把右键变成采集派活），
   该调用**已删除**。`issueHarvestOrders()` 方法本身在 `HEAD` 就存在且无调用点，属用户既有代码，**保留未动**。
   现状：`Game.js:8872` 附近的右键分支仍是"放置/框选/连线模式下先取消 → 否则 `issueMoveCommand()`"，
   源码里留有注释「右键**不是**采集指令。采集走 G 键资源框选」。
3. **没有**把右键改成采集入口，**没有**回滚或删除用户改动；`WorkSystem` / `workOrders` / `UnitLogicSystem` /
   `resources` / `ResourceNodeSystem` 的移动、到达、采集状态机均未被本任务修改。
4. **同一错误认知还污染过我写的文案**（属"只纠正自己的改动"）：`HelpPanelUi.js` 原写「右键资源点标记采集」、
   `index.html` 顶部提示条缺 G 键 —— 均已改为「按 **G** 进入资源框选」，提示条补上「G 框选资源」。
5. **按正确流程重新验证并升级证据质量**：本轮用**正常实时（不挂钩时钟、不补帧）**重跑
   G 框选 → 采集 → 运输入库，结果与旧的时钟挂钩辅助验证**逐项吻合**
   （`harvested 280 / deposited 195 / stone 12→207 / 7 个标记点采空`），
   证明正确操作下这条链本身没有故障，且结论不依赖时钟篡改。

---

# 五、额外主动发现并修复的问题

| # | 问题 | 证据 | 修复 |
|---|------|------|------|
| 6 | 真实鼠标每次 `pointermove` 抛 `TypeError`（悬停高亮失效） | `onCanvasPointerMove` 里 `this.transportDrag?.pointerId === event.pointerId` 在两边都是 `undefined` 时成立，随后读 `null.startX` | 加存在性判空；`isCurrentSelectionEvent()` 改显式 pointerId 比较；`pointermove` 再补一次 `selectionDrag` 判空。修后真实鼠标移动 `problems: []` |
| 7 | 帮助面板写错采集指令（「右键资源点标记采集」） | 探针读 `#help-panel` 文案 + 截图 14（修前） | 改成「按 **G** 进入资源框选」，并补 F1–F12 优先级、`C` 取消模式 |
| 8 | 顶部操作提示条没有 G 键，正确采集入口不可发现 | 截图 11/30 左上提示条 | `index.html` 增加「G 框选资源」 |
| 9 | 帮助面板「?」按钮**关不掉**面板（window 捕获阶段的"点外部关闭"先关、按钮 `click` 又 toggle 回打开） | 修前探针 `help-panel-closed-by-button: open:true`；`elementFromPoint(1178,38)` = `game-help-button` | 捕获处理器跳过按钮自身（`this.button.contains(target)`）；修后真实点击 `open:false` 且 `paused:false` |
| 10 | 「远征」chip 从第一秒起常驻（`isRelevant()` 误把"还有没拆的巢穴"当成"正在出兵"） | 修前 `expedition-entry: hidden:false, activeRoutes:4, isNight:false` | 改为「追踪中 或 夜间出兵中」才显示；标题同步改「夜间巢穴正在出兵」 |
| 11 | 基地旁的圈看得见却没标签（旧的固定 34 m 镜头距离门槛太紧） | 修前 5 个 `onScreen=true`，仅 1 个有标签 | 标签出现条件改为"在屏幕上"（保留 120 m 宽松上限）；修后与 `onScreen` 完全一致 |

---

# 六、真实交互验证 vs 程序化验证（分开列出）

## 6.1 真实交互（真实 OS 级鼠标/键盘事件 + 真实 DOM 点击 + 截图）

| 验收项 | 手段 | 结果 |
|--------|------|------|
| 进入游戏 | 真实点击主菜单「开始游戏」 | ✅ 进入生存关卡 |
| 选傀儡 | 真实左键点选 | ✅ `selectedUnits=1`，`#selected-panel` 显示 `友军 木傀儡 #5` |
| **G 框选 → 采集 → 运输**（**正常实时，未篡改时钟**，本轮新增） | 真实 `G` + 真实左键拖拽 `(727,189)→(831,293)`，墙上时间等 120 s | ✅ `marked 7`、`planState` 在 `harvesting`/`moving_to_node` 轮转、`harvested 280 / deposited 195`、`stone 12 → 207`、`problems: []` |
| G 框选 → 采集 → 运输（旧，时钟挂钩辅助验证） | 同上但用 `__dshDriveFrames` 推帧 | ✅ 与上一行逐项吻合（作为交叉印证，**不作为性能证据**） |
| 合成「傀儡木棒」 | 真实 `B` 开背包 → 真实左键点配方 | ✅ `wood 20→8`、`stone 12→8`，产物 `puppetCudgel×1` 上手 |
| 装备 | 把产物放进傀儡背包（真实左键） | ✅ `weaponItemId='puppetCudgel'`，目标句从"先做木棒"变成"清掉西坡狼窝"（自动装备生效） |
| **建造**（真实 UI，`outputs/_dsh-build2.json`） | 真实 `B` → 真实左键点「树坑」配方 → 真实左键放入快捷栏 → 真实 **Ctrl+左键** 进放置 → 真实左键落地 | ✅ `placing={itemId:'treePit'}` → 192 个合法落点、最近点 `inPowerRange:true` → 落地 `treePit@(8.2,39.7) hp60/60 underConstruction:true` → 8 s 后 `underConstruction:false`（**真的建成**） |
| 供能读数 | 同上建筑 `buildingState` | ⚠️ 部分：`inSupplyRange:true`，但 `treePit` **不是耗能设施**（`isPowerReceiver:false`、`production:null`），**不能**证明耗能设施通电运转 |
| 遇敌策略 toggle | 真实 `B` → 真实左键点「避战」→ 取消选中 → 再点选 | ✅ 徽标与 `aria-checked` 每次都和单位实际字段一致 |
| 帮助面板 | 真实 `H` / 真实点「?」按钮 / 真实点画布空白 | ✅ 8 节 22 行；开/关都不暂停；「?」按钮能关掉 |
| 顶部与远征入口 | 真实按键 `P`、读取 `getBoundingClientRect()` | ✅ 顶部无全宽横幅；远征 chip 左下 `[12,575,64,37]`，白天隐藏、按 `P` 可开 |
| 硬件渲染下的实时游玩 | 真实进入游戏并持续游玩，读 `#fps-meter` | ✅ `FPS 60`；游戏时间/真实时间 = 1.000 |

## 6.2 程序化验证（诊断与只读探针，与上面的真实交互分开记录）

- `scripts/.dsh-probe-opening.mjs`：开局世界/资源/敌情/标记只读快照（基地 `(4,40)`、275 个资源点、最近敌营 14.2 m 等）。
- `scripts/.dsh-probe-hw.mjs`：WebGL renderer 字符串、rAF 帧间隔、`renderer.render()` 增量、CDP `Performance.getMetrics`。
- `scripts/.dsh-probe-hw-render-count.mjs`：每个 rAF 回调内 `render()` 次数分布（解释 120 rAF/s vs 180 render/s）。
- `scripts/.dsh-probe-hw-live.mjs`：实时游玩中的最终硬件证据快照（renderer + `#fps-meter` + 5 s 推进比）。
- `scripts/.dsh-probe-gselect-realtime.mjs`：**正常实时**的 G 框选链（不挂钩时钟）。
- `scripts/.dsh-probe-verify-fixes.mjs` / `.dsh-probe-labels.mjs`：五项修复的 DOM/状态断言。
- 所有 `__dshDriveFrames` / `RAF_DRIVER` 相关的采样（第 7 步、`_dsh-build2.json` 等）**一律只作辅助功能验证**，
  本次报告中**不作为实时性能或实时表现证据**。

---

# 七、命令与构建结果

| 命令 | 结果 |
|------|------|
| `node --check` × 8 个本任务改动源文件 | 全部 exit 0（0 失败） |
| `node --check` × 6 个本轮新增探针脚本 | 全部 exit 0 |
| `npm run build` | **exit 0**，`✓ 190 modules transformed`，`built in 1.04s`，产物 `dist/assets/index-CbyD6v6C.js` 2384 kB / gzip 685 kB |
| `git status --porcelain`（只读） | 仅查看，**未执行** commit / push / PR / deploy / 远程设置修改 |
| 全量回归测试套件 | **未重跑**（按交接文档"避免无理由重跑全量"；本任务改动的影响面已由上面的目标探针覆盖） |

---

# 八、截图（绝对路径）

硬件渲染与实时复验（本轮新增）：
- `F:\WebProjects\WebVillageWar\outputs\dsh-playability-100-hw-webgl.png`（硬件 renderer 证据页）
- `F:\WebProjects\WebVillageWar\outputs\dsh-playability-101-hw-realtime.png`（实时帧率采样期间）
- `F:\WebProjects\WebVillageWar\outputs\dsh-playability-102-hw-live.png`（实时游玩，右上 `FPS 60`，可见「箭塔位」标签与单行目标句）
- `F:\WebProjects\WebVillageWar\outputs\dsh-playability-110-rt-opening.png`（实时 G 流程开局）
- `F:\WebProjects\WebVillageWar\outputs\dsh-playability-111-rt-G-mode.png`（真实 G 进入资源框选）
- `F:\WebProjects\WebVillageWar\outputs\dsh-playability-112-rt-marked.png`（真实拖拽后 7 个点被标记）
- `F:\WebProjects\WebVillageWar\outputs\dsh-playability-113-rt-harvesting.png`（实时采集中）
- `F:\WebProjects\WebVillageWar\outputs\dsh-playability-114-rt-after-observe.png`（120 s 实时后，石料已入库）

五项修复与建造链：
- `...\outputs\dsh-playability-01-opening-raw.png`（修前：全宽「远征」横幅 + 106 字顶部长文 + 无说明红圈）
- `...\outputs\dsh-playability-14-help-panel.png`（帮助面板）
- `...\outputs\dsh-playability-16-defense-slot-labels.png` / `dsh-playability-44-defense-slots-map.png`（「箭塔位」标签）
- `...\outputs\dsh-playability-40-help-after-correction.png`（帮助文案改为 G 键后）
- `...\outputs\dsh-playability-31-G-boxselect-mode.png` / `32-marked.png` / `33-harvesting.png` / `34-after-6min.png`（G 流程）
- `...\outputs\dsh-playability-50-craft-tab.png` / `51-crafted.png`（合成）
- `...\outputs\dsh-playability-60-opening.png` / `61-cudgel-equipped.png` / `62-gather-marked.png` / `63-after-gather.png`（装备 + 采集）
- `...\outputs\dsh-playability-87-opening.png` / `88-crafted.png` / `89-placing.png` / `91-after-place.png` / `92-construction.png` / `93-built.png`
- `...\outputs\dsh-playability-95-opening.png` / `96-placing.png` / `97-preview.png` / `98-after-place.png` / `99-built.png`（建造链最终成功证据）

机器可读证据 JSON（本轮新增，已从临时目录复制到 `outputs/`）：
- `F:\WebProjects\WebVillageWar\outputs\_dsh-hw.json`（WebGL renderer 双来源 + 20 s 实时采样 + 渲染进程 CPU + Chrome `SystemInfo.getInfo`）
- `F:\WebProjects\WebVillageWar\outputs\_dsh-hw-live.json`（实时游玩中 5 s 推进比 + `#fps-meter`）
- `F:\WebProjects\WebVillageWar\outputs\_dsh-hw-render-per-frame.json`（每个 rAF 回调的 `render()` 次数分布）
- `F:\WebProjects\WebVillageWar\outputs\_dsh-gselect-realtime.json`（**正常实时** G 框选全流程 + 12 次时间线采样）
- `F:\WebProjects\WebVillageWar\outputs\_dsh-build2.json`（建造链最终成功证据，时钟挂钩的辅助验证）

---

# 九、遗留体验问题与未验证部分（如实列出）

**未验证**
1. **耗能设施通电运转未验证**：默认开局库存（木 20 / 石 12）买不起任何耗能设施
   （熔炉 石30+木20、魔力炉 石40+铁8+木20、科研站 石25+木30）。本轮只验证到
   "用真实材料建成一栋建筑且落点 `inSupplyRange:true`"，`treePit` 本身不耗能。
   需先采集到足够石料/铁才能真实验证"建成 → 通电 → 产出"。
   已有的 `power.summary()` 在实时游玩中出现 `supplied/consumed = 228.8/228.8、shortfall 0`，
   但那只是读数旁证，**不算**真实 UI 验收。
2. **多选不同傀儡显示"混合"态**：代码与渲染路径已实现（`state.classList.add('is-mixed')`、
   `PUPPET_COMBAT_MODE_MIXED_LABEL`），但默认开局**只有 1 只木傀儡**，
   本轮没有真实造出第二只来点选验证混合态，按未验证记录。
3. **读档一致性**：生存关卡无读档入口，该项未覆盖。
4. **完整 15–20 分钟体验**：默认开局无人防守时基地约在 **5:47** 陷落（夜袭压力），
   因此 15–20 分钟连续实玩无法在默认规则下完成；本轮覆盖的是"开局到首夜"这一段
   （远征/防守生存上一轮已有独立结果文档）。
   旁证：同一次会话里第二局按脚本做了 G 框选采集（石料做到 207）后撑到 **7:59** 才陷落
   —— 玩家操作确实延长了生存时间，但仍因没有战斗单位而失败，符合"保留防守压力"的设计意图。
5. **非 headless 真实显示器下的帧率**：见 2.3 的诚实限制。

**遗留体验问题（未改，留待后续）**
1. 开局第 2.8 s 唯一傀儡就已 `planState='engaging'`、最近敌人 **3.3 m**、血量 29/30；
   默认遇敌策略 `fight` 会让它在开局被迫接战（本次仍完成了 120 s 采集）。
   建议把新傀儡的默认遇敌策略改为「避战」，或让开局敌人保持 12 m 以上警戒。
2. 夜间（elapsed 453 s）唯一傀儡血量掉到 2/30 且孤军接战，玩家若不在首夜前造出战斗单位，
   约 5:47 必陷落。这属"保留的防守压力"，但开局到首夜的引导仍偏薄。
3. 远征面板默认 4 条路线全部"可追踪"，新手难以判断优先级；本轮只做了"不再常驻催促"这一层。
4. `HelpPanelUi` 是新增的最小帮助入口（8 节 22 行），内容仍偏少，缺少配图。

**未做（按用户边界）**：未扩经济/兵种/战役系统，未重写战斗与寻路架构，未执行任何 git 状态修改、
commit、push、PR、部署或远程设置变更，未创建嵌套 AI 代理，未读取或输出任何 API key / provider 配置。

---
---

# 附录：滚动检查点原文归档（第 1–11 步）

## ⚠ 用户纠正已收到（2026-10-06，最高优先级）

**纠正原文要点**：右键**不是**采集指令。真实采集操作是**按 G 键框选资源**，然后傀儡去采集。
先前用右键点击资源做的 306 秒观察**不能**证明采集逻辑或状态切换有故障。

**我（本任务执行者）的处置**：

1. **撤回结论**：第 6 步「阻塞 A（严重）…真实右键采集指令下木傀儡 306 秒一无所获」——
   该结论建立在错误操作上，**作废**。右键本来就不是采集入口，右键后傀儡走到点附近
   站着不动是"移动到位后待命"，不是"采集状态机卡死"。原结论及其"真因定位/局部修复"
   方向一并撤回，不再据此改动移动/到达/采集逻辑。
2. **核对并纠正我自己的改动**：本任务确实基于该错误测试在
   `src/systems/Game.js` 的 `commandSelectedUnits()` 里加了
   `const harvestAssigned = this.issueHarvestOrders(commandCenter, autoWorkers)`，
   即把右键接入采集派活（还顺带把 `autoWorkers` 改名 `idleAutoWorkers`）。
   **这正是用户禁止的"把右键改成采集入口"**，已按下面「纠错记录」移除，恢复原先
   的右键 = 集结/移动语义。
3. **未受影响的既有工作**（经核对**不是**本任务据错误测试所改，全部保留）：
   - `WorkSystem.js` / `workOrders.js` / `UnitLogicSystem.js` / `resources.js` /
     `ResourceNodeSystem.js` 的 mtime 均为 10-05，属于上一轮（资源可持续/防御生存）
     的既有工作，本任务未改其移动、到达、采集状态机。
   - `issueHarvestOrders()` 方法本身在 `HEAD` 就已存在（未接入任何调用点），
     不是本任务新增；本任务只是错误地调用了它，现撤回调用，**不删除用户该方法**。
4. **重新验证**：改按真实流程验证 G 键框选资源 → 傀儡采集 → 运输入库，
   不再用右键当作采集指令。


## 任务范围（来自 docs/DSH_PLAYABILITY_HANDOFF.md）

1. 傀儡战斗模式改为显式互斥 toggle，持续显示当前模式与简短含义（含多选混合态、重新选中、读档一致性）
2. 移除屏幕顶部战役按钮，保留玩家自主节奏；若为必要能力唯一入口则迁入既有界面
3. 顶部详情只放当前对象/状态/操作信息，长篇说明迁到已有帮助入口
4. 查清默认开局基地旁两个红圈的实际用途（截图 + 逻辑），保留必要预警，移除无用/调试标记
5. 实测近距离怪物、生成布局、警戒/追击与采集路径；默认初始傀儡应能安全启动采集/运输/建造/供能

## 进度日志

### 第 1 步：阅读交接文档并建立检查点
- 已读 `docs/DSH_PLAYABILITY_HANDOFF.md`（31 行）
- 已创建本检查点文件

### 第 2 步：环境与真实浏览器验收链建立
- 复用用户已在运行的 `http://127.0.0.1:3000/`（node PID 43776，未启动/停止任何用户服务）
- 自建隔离 headless Chrome：`C:\Program Files\Google\Chrome\Application\chrome.exe`，
  CDP `127.0.0.1:9235`，独立 `--user-data-dir=C:\Users\A\.codex\tmp\dsh-playability-20261005\chrome-profile`
  （未触碰用户日常浏览器）
- 新增本轮真实交互 harness：`scripts/dsh-playability-lib.mjs`
  - 真实鼠标：`Input.dispatchMouseEvent`（canvas 上的 pointerdown/up → 游戏自己的处理器）
  - 真实键盘：`Input.dispatchKeyEvent`
  - 时钟驱动：headless 合成器把 rAF 压到 ~5fps，仅把 `clock.getDelta` 夹到 1/60 并在同一帧
    补步进，使游戏时间接近真实秒；不直接改任何游戏状态
- 诊断探针：`scripts/.dsh-probe-opening.mjs`、`.dsh-probe-interaction.mjs`、`.dsh-probe-click.mjs`、`.dsh-probe-resources.mjs`

### 第 3 步：已确认的开局事实（探针实测，1280x720）
- 基地 `(4, 40)`；开局只有 1 支木傀儡 `(0.8, 43.4)`，无任何战斗单位
- 基地库存开局：`wood 20 / stone 12 / manaCore 1 / ration 12`
- 资源节点 275 个：最近的木料 `oak-2-16 (22.5, 37.9)` 距基地 **18.6m**；
  最近石堆 `stonePile-6-5 (-6.9, 28.2)` **16.1m**；最近纤维 16.1m
- 敌方：北路哨卡 2 哥布林士兵距基地 **14.2/15.8m**（警戒 9.8m）；西坡狼窝 2 狼 22.4/22.6m；
  东林盗伙弓手+狼 23.3m；北岬巢穴 30.2m
- 木傀儡实测会自己往西北走（朝北路哨卡方向），说明开局就被 14m 外的敌营吸引

### 第 4 步：已确认的缺陷（含真实 UI 证据）
1. **顶部「远征」按钮渲染成全宽横幅**：`#expedition-toggle` 的 `getBoundingClientRect()`
   为 `[0, 4, 1280, 37]`，文字「远征」孤立显示在屏幕最上方（截图 01）。
   根因：`index.html` 里它在 `.hud-primary-top`（`position:fixed`，高度塌成 0）之后，
   而 `.wave-command-panel` 是 `position:fixed` 脱离文档流；`expedition.css` 的
   `.hud-primary .expedition-toggle { position: static; width: 100% }` 于是被拉成整个视口宽。
   → 这正是用户第 2 项说的「屏幕顶部战役按钮」。
2. **顶部详情塞了 106 字玩法长文**：`#survival-objective` 文本
   「离入夜还有 5:00。木傀儡手里还没有专用武器，先合成并装备傀儡木棒（木材×12 + 石料×4）…」
   占据 `[325, 95, 630, 55]`（截图 01 与 03）。
3. **基地旁红圈无任何说明**：`placeDefenseSlotMarkers()` 在 8 个 `defenseSlot` 上各放一个
   `RingGeometry(1.15,1.55,24)` / `#c45a3a` / 不透明度 0.5 的环，不可点击、无标签、无图例。
   其中距基地最近的两个是 `(-4.5, 52.5)`（15.1m）与 `(3.5, -6)`（46m）。
4. **真实鼠标点选会抛异常**：`Input.dispatchMouseEvent` 派发的 `pointerdown` 的
   `pointerId` 为 `undefined`，命中 `onCanvasPointerDown` 里
   `this.transportDrag = dragOrigin ? {...} : null` 的 null 分支；随后
   `onCanvasPointerMove` 第 7944 行 `this.transportDrag?.pointerId === event.pointerId`
   变成 `undefined === undefined` → 进入分支后读 `this.transportDrag.startX` 抛
   `TypeError: Cannot read properties of null`（`[exception]` 已捕获）。
   （该次点击本身仍成功选中木傀儡，但每次移动都刷异常，并使悬停高亮被跳过。）
5. **傀儡战斗模式当前只是三个普通按钮**：`BackpackUi.renderWorkerCombatMode()` 渲染
   「避战/战斗/自动」三个 `.backpack-worker-combat-mode-btn`，只给激活项加 `is-active`
   类，没有 `aria-pressed`、没有当前模式文字、多选时完全看不到（第 1 项待改）。

## 问题清单（滚动更新）

| # | 触发步骤 | 玩家困惑/阻碍 | 证据 | 严重度 | 拟修方案 | 状态 |
|---|---------|--------------|------|-------|---------|------|
| 1 | 选中傀儡 → B 打开背包 → 遇敌策略 | 三个按钮无「当前模式」文字、无 aria 状态；多选不同模式完全看不到 | 代码 + 探针 | 高 | 改为显式互斥 toggle + 常驻当前模式与简短含义；单选/多选/重选一致 | 进行中 |
| 2 | 进入游戏看屏幕顶部 | 全宽「远征」横幅压在顶部中央 HUD 上 | 截图 01 + rect `[0,4,1280,37]` | 高 | 从顶部横幅移除；远征面板入口迁到既有暂停菜单，并按“有追踪/有威胁”条件在 HUD 上给紧凑入口 | 进行中 |
| 3 | 看顶部中央目标句 | 106 字玩法长文挤占顶部 | 截图 01/03 | 中 | 目标句缩短为“当前目标 + 剩余时间”，长文迁到既有暂停菜单的帮助入口 | 进行中 |
| 4 | 默认开局看基地旁红圈 | 8 个红圈含义不明、不可交互 | 探针 markers + 截图 01 | 中 | 保留（真实用途：防守驻守点位/箭塔吸附位），加短标签与选中反馈，按距离/关联度收敛显示 | 进行中 |
| 5 | 默认开局派傀儡采集 | 最近资源 16m，北路哨卡 14m 就在采集路上 | 探针 nodes/camps + 傀儡自动朝敌营走 | 高 | 实测后定位真因，调局部布局/警戒/开局节奏 | 进行中 |
| 6 | 真实鼠标移动 | 每次 pointermove 抛 TypeError，悬停高亮失效 | CDP `[exception]` 堆栈 | 中 | 修 `transportDrag` 的 pointerId 判空 | 进行中 |


### 第 5 步：五项修复实现（代码已落地，等待实玩复验）
1. **第 1 项 遇敌策略 toggle**（`src/systems/puppetCombatMode.js` / `BackpackUi.js` / `Game.js` / `styles.css`）
   - 新增 `PUPPET_COMBAT_MODE_MEANINGS` / `PUPPET_COMBAT_MODE_MIXED_LABEL` / `PUPPET_COMBAT_MODE_HINTS`、
     `summarizePuppetCombatModes()`、`puppetCombatModeSummaryText()`、`setPuppetCombatModeForUnits()`
   - 背包面板改成 `role="radiogroup"`，按钮带 `role="radio"` + `aria-checked`/`aria-pressed`，
     标题右侧常驻当前模式徽标，下方一行说明这条策略做什么；多选不同模式显示「混合」+ 虚线 partial 态
   - 多选时切换作用于**所有选中的木傀儡**，并给一条提示
   - 选中详情面板也写上「遇敌策略 战斗：遇敌主动迎战，打得过就打」（单选）/「木傀儡×N 遇敌策略：…」（多选）
2. **第 2 项 移除顶部远征横幅**（`index.html` / `expedition.css` / `ExpeditionPanelUi.js`）
   - 根因：`.hud-primary-top` 高度塌成 0 而 `.wave-command-panel` 是 fixed，
     `.hud-primary .expedition-toggle { position: static; width: 100% }` 被拉成 `[0,4,1280,37]` 全宽横幅
   - 改为固定尺寸 chip（桌面左下 `left:12px; bottom:108px`，窄屏左上），并 `width: max-content`
   - `syncButton()` 增加 `isRelevant()`：只有**已追踪路线**或 **forecast.activeRoutes 非空
     （某座巢穴真的在出兵）** 时才出现；面板开着时按钮保留以便收起
   - 功能入口补齐：`P` 键开关远征面板、帮助面板「夜袭与远征」一节说明入口
3. **第 3 项 顶部只留"眼下"**（`fieldCamps.js` / `expedition.js` / `ExpeditionSystem.js` / `Game.js` / `battleHud.css` / 新增 `HelpPanelUi.js` + `help.css`）
   - 新增 `survivalObjectiveCompactText()` / `survivalObjectiveDetailText()` / `openingLoadoutHint()`
   - 顶部一行改成 `离入夜还有 5:00｜先给木傀儡做傀儡木棒（木材×12 + 石料×4）`（17→35 字，原来是 106 字），
     CSS `white-space: nowrap` + ellipsis 保证永远一行（高度从 55px 回到 20px）
   - 长文迁到新的最小 `HelpPanelUi`（右上角「?」按钮 / `H` 键）：8 节 22 行，含「眼下」一节现读目标句
   - 帮助面板**非模态**：容器 `pointer-events: none`，只有 frame 接事件；打开/关闭都不暂停游戏
4. **第 4 项 红圈用途**（`Game.js` / `styles.css`）
   - 查明用途：`defenseSlot` = 巢穴对应的**进攻驻守点**，`orderEnemyAttack()` 让夜袭单位先走这个点再去基地；
     同时是放置箭塔的吸附位（`defenseSnapPoint` + `nearestDefenseSite`，只认 `arrowTower`）；
     建成后 `claimDefenseSite()` 会把圈收掉
   - 视觉改成低饱和琥珀 `#d8b26a` / 不透明度 0.42（原来是 `#c45a3a` / 0.5 的红色警报感）
   - 每个圈加世界 UI 短标签「箭塔位」，只对镜头 34m 内且屏幕内的圈显示
   - `claimDefenseSite()` 追加一条提示；帮助面板新增「基地旁的红圈」一节
5. **第 6 项（主动发现）真实鼠标异常**（`Game.js`）
   - `onCanvasPointerMove` 的 `this.transportDrag?.pointerId === event.pointerId` 在两边都是
     `undefined` 时成立，随后读 `null.startX` 抛 `TypeError`（真实鼠标每次移动都触发）
   - 加存在性判空；`isCurrentSelectionEvent()` 改成显式 pointerId 比较；`onCanvasPointerMove`
     再补一次 `selectionDrag` 判空
6. **第 5 项 开局节奏**（`ExpeditionSystem.objectiveCompactText`）
   - 顶部短句在"还没有专用武器"时先说「先给木傀儡做傀儡木棒（…）」，不再开局就催
     「清掉西坡狼窝」（那一趟要拿斧子打两只狼，是送死；完整目标句的原有顺序不变）

## 真实交互验收记录

### 检测脚本（真实 CDP 鼠标/键盘 + 浏览器派发 click）
- `scripts/dsh-playability-lib.mjs`：真实鼠标 `Input.dispatchMouseEvent`、真实键盘 `Input.dispatchKeyEvent`、
  确定性帧驱动 `__dshDriveFrames`（调真实 tick，不注入资源/不瞬移）
- `scripts/.dsh-probe-interaction.mjs`：开局 HUD → 点选木傀儡 → B 开背包 → 点「避战」→ 重选一致性
  → 帮助面板（H / ? 按钮 / 地图点击收起）→ 远征入口（P 与按钮）→ 防守位标签
- `scripts/.dsh-probe-gather.mjs`：点选 → 切避战 → F 跟随 → 右键标记纤维/石堆 → 6 分钟真实作业链观察
- `scripts/.dsh-probe-opening.mjs`：开局世界/资源/敌情/标记只读快照

### 已复验通过（真实 UI，1280x720）
- 真实左键点选木傀儡成功（`selectedUnits=1`，`#selected-panel` 显示 `友军 木傀儡 #5`）
- 顶部目标句：`离入夜还有 5:00｜先给木傀儡做傀儡木棒（木材×12 + 石料×4）`，
  rect 高度 **55px → 20px**，宽度 630 不变
- 遇敌策略：默认 `战斗`，徽标「战斗」，`aria-checked=true` 只在战斗上；真实点击「避战」后
  单位字段 `workerCombatMode='avoid'`、徽标「避战」、`aria-checked` 转到 avoid
- 重新取消选中再点选，徽标与 `aria-checked` 仍为 `避战`（与实际一致）
- 帮助面板：`H` 键打开（8 节 22 行，含「眼下」现读目标句）；打开期间 `elapsedTime` 继续前进
  （不暂停）；右上角「?」按钮可关闭；再开一次后用真实鼠标点画布空白处也能收起且不暂停
- 远征入口：桌面 rect `[12, 575, 64, 37]`（左下 chip，不再是顶部横幅）；开局面板上按钮
  仍按 `isRelevant()` 判定显示，`P` 键可打开面板（4 张路线卡）
- 防守位标签：8 个标签，只有镜头 34m 内且在视口内的显示（实测 `island-camp-north` 一个可见，
  其余 `hidden=true`）
- 控制台 `problems: []`（真实鼠标移动不再抛 `TypeError`）

## 程序化验证记录

| 命令 | 结果 |
|------|------|
| `node --check src/systems/Game.js`（及本任务全部改动 JS） | exit 0 |
| `npm run build` | exit 0，`✓ 190 modules transformed`，`built in 807ms` |

## 第 6 步（本轮续跑）：读取既有证据，发现真正的开局阻塞

上一轮在检查点（01:06）之后继续跑了三个探针（`outputs/_dsh-gather.json` 01:19、
`_dsh-mark.json` 01:25、`_dsh-path.json` 01:29），结论尚未写入检查点。本轮先复读这些证据：

**阻塞 A（严重，直接违反第 5 项）：真实右键采集指令下，木傀儡 306 秒一无所获。**
- 真实流程：点选木傀儡 → 切「避战」→ 右键点纤维 `fiberPlant-13-4 (6.3, 56.2)`（距基地 16.4m、
  距最近敌人 14.1m，探针判定的"安全候选"第一名）
- 结果：傀儡走到 `(6.1, 54.3)` 后**完全静止**（21s / 42s / … / 306s 位置逐帧一致），
  与目标 `(6.3, 55.0)` 相距约 1.2m，永远不进入采集中
- `baseInventory` 306 秒全程 `wood 20 / stone 12 / manaCore 1 / ration 12` **零变化**
- `_dsh-mark.json` 记录到卡住时的内部状态：`lastPlan.state = "moving_to_node"`、
  `action = "move_to_node"`、`note = "前往临时位置"`、`target = (6.3, 55.003, phase=moving)`；
  `taskName/workType/workState` 全为 `null` → 从未开工
- 阶段性结论：不是"敌人太近"的问题，是**傀儡到达节点作业位后没有切换到采集状态**（或作业位
  本身不可达但被判定为"已到位/临时位置"）。这正是玩家开局第一分钟就会撞上的死结。

**阻塞 B（中，诊断链路）：`_dsh-path.json` 记录 `Game.worldToScreen` 抛
`TypeError: position.clone is not a function`**（探针用普通对象调用所致）——
需确认生产代码中 `worldToScreen` 的调用方是否也有同类风险（红圈/标签/屏幕投影都走它）。

下一步：定位 `moving_to_node` / "前往临时位置" 的实际逻辑与到达判定，找真因后做局部修复。

---

## 第 7 步（本轮续跑）：纠正记录 + 用真实 G 框选复验 + 修复

### 7.1 收到用户纠正后的撤回与自我核对

- 撤回第 6 步「阻塞 A」的全部结论（它来自错误操作：把右键当采集指令）。该结论作废，
  不再作为"采集状态机故障"的证据，也不再据此改移动/到达/采集逻辑。
- **核对自己据错误测试做过的改动，只撤回这一处**：
  `src/systems/Game.js` → `commandSelectedUnits()` 里我加的
  `const harvestAssigned = this.issueHarvestOrders(commandCenter, autoWorkers);`
  以及随之而来的 `autoWorkers → idleAutoWorkers` 改名。**已删除**，恢复右键 = 集结/移动。
  `issueHarvestOrders()` 方法本身在 `HEAD` 就存在（未被任何地方调用），不是我新增的，
  **保留不动**，只是不再从右键调用它。
- 核对结论：`WorkSystem.js` / `workOrders.js` / `UnitLogicSystem.js` / `resources.js` /
  `ResourceNodeSystem.js` 的 mtime 全是 10-05，属上一轮既有工作，本任务**没有**改过
  移动、到达、采集状态机。除上面那一处外无其它"据错误测试"的改动。
- **错误还被写进了我新建的文案里**（同一错误认知的产物，属"只纠正自己的改动"范围）：
  `HelpPanelUi.js` 的「操作」写「右键资源点标记采集」、「采集与运输」写「右键点树、石堆或矿脉」，
  都已改成 G 键框选；`index.html` 顶部操作提示条原来也没有 G 键，已补「G 框选资源」。

### 7.2 真实 G 框选 → 采集 → 运输入库：**通过**（新证据）

探针 `scripts/.dsh-probe-gselect.mjs`：只用真实键盘 G + 真实鼠标左键拖拽，
不注入资源、不瞬移、不调用内部 `assignNode/markNodes`。开局快照 →
`resources/_dsh-gselect.json`、截图 30–34。

| 步骤 | 真实观测 |
|------|---------|
| 开局 | 木傀儡 `(0.8, 43.4)`，`lastPlan=idle`，`marked=0`，基地 `wood20/stone12/manaCore1/ration12` |
| 真实按 G | `resourceBoxSelect={mode:'mark',priority:4}`，HUD「资源框选 / 优先级 4 / 拖拽框选 · Esc 取消」 |
| 真实左键拖拽 | `markedNodes.size` 0 → **7**（`stonePile-5-0…5`，优先级 4），傀儡被自动派到 `stonePile-5-5` |
| 6 分钟作业链 | `planState` 反复 `harvesting`；`stats`：assigned 7 / harvestActions 56 / **harvested 280** / **deposited 195** / depletedTasks 7 |
| 库存 | `stone 12 → 292`（`wood` 未动，因为本次只框选了石堆） |
| 结束时 | `markedNodes` 归零（7 个点全采空，`WorkSystem` 采空即撤标记），傀儡回基地待命 |
| 控制台 | `problems: []`（无异常） |

**结论**：正确操作下，默认开局的唯一木傀儡可以在没有任何战斗单位的情况下完成
「框选 → 走过去 → 采集 → 走回基地卸货 → 继续采」，且全程有近距离敌人（最近 12–14m，
夜里一度 1.3m）——采集链本身没有故障。之前的 306 秒静止是**错误操作路径**造成的：
我那时调用的 `issueHarvestOrders` 绕过了 `markedNodes` 框选池，只写了一条 task，
没有走 `updateAutoAssign` 的正常派活/站位流程。

### 7.3 本轮新发现并修复的问题（真实 UI 复现后修）

| # | 问题 | 证据 | 修复 |
|---|------|------|------|
| 7 | 帮助面板写错采集指令：「右键资源点标记采集」「右键点树、石堆或矿脉」 | 探针读 `#help-panel` 文案 + 截图 14（修前） | `HelpPanelUi.js` 改成「按 **G** 进入资源框选」，并补 F1–F12 优先级、C 取消模式 |
| 8 | 顶部操作提示条没有 G 键，正确采集入口不可发现 | 截图 11/30 左上提示条；探针 `control-hints` | `index.html` 增加「G 框选资源」 |
| 9 | 帮助面板「?」按钮**关不掉**面板：window 捕获阶段的"点外部关闭"先把面板关掉，按钮自己的 `click` 又 `toggle` 回打开 | 探针 `help-panel-closed-by-button` 修前 `open:true`；`elementFromPoint(1178,38)` = `game-help-button` | `HelpPanelUi.js` 的捕获处理器跳过按钮自身（`this.button.contains(target)`） |
| 10 | 「远征」chip 从第一秒就常驻：`isRelevant()` 用 `activeRoutes`（只表示"还有没拆的巢穴"，开局四条全为真）当"正在出兵" | 修前探针 `expedition-entry`: `hidden:false, activeRoutes:4, isNight:false` | `ExpeditionPanelUi.js` 改为 `追踪中 或 夜间出兵中` 才显示；标题同步改成「夜间巢穴正在出兵」 |
| 11 | 基地旁的圈**看得见却没有标签**：默认镜头下 5 个圈在屏幕上、只有 1 个有「箭塔位」标签（旧的固定 34m 镜头距离门槛太紧） | 修前探针 `defense-slot-labels`：5 个 `onScreen=true`，仅 `island-camp-north` 有标签 | `Game.js` 标签出现条件改为「在屏幕上」（保留 120m 宽松上限）；纵向 `y>=0` 避免留不可见 DOM |

修后复验（探针 `scripts/.dsh-probe-verify-fixes.mjs` → `outputs/_dsh-verify-fixes.json`、
截图 40–43；标签分布 → `_dsh-labels3.txt`）：

- 提示条：`hasG: true`（列表里出现「G 框选资源」）
- 帮助「操作」：`采集：按 G 进入资源框选，拖拽框住要采的树、石堆或矿脉。`
- 帮助「采集与运输」：`按 G，拖拽框住…`、`F1–F12 设定优先级 1–12（默认 4）；按 C 进入取消标记模式`
- 「?」按钮：真实点击后 `open:false`（修前 `open:true`），且 `paused:false`
- 远征 chip：白天 `hidden:true / relevant:false / isNight:false`；真实按 `P` 仍能打开
  （`open:true`，4 张路线卡），面板打开时按钮保留以便收起
- 防守位标签：`labelHidden` 与 `onScreen` 完全一致（5 个在屏的全有「箭塔位」），
  截图 44 目视确认不拥挤、不再是"不知名的红圈"
- G 流程 60 秒复验：G→mark/优先级 4→拖拽 `marked:3`→自动派 `stonePile-6-5`，
  `stone 12 → 132`，`harvested 120`


---

## 第 8 步（本次续跑，attempt 4）：读取既有证据 → 记录剩余工作

上一执行器在检查点写完之后又跑了一步（5:36）没来得及写进检查点，本次先复读并归档：

### 8.1 新回收的证据：第 5 项链的「合成」环节**通过**（真实 UI）

探针 `scripts/.dsh-probe-craft.mjs` → `outputs/_dsh-craft.json`、截图 50/51（均为真实键鼠：
`B` 开背包 → 真实左键点合成页的「傀儡木棒」格子；唯一非交互动作是 `scrollIntoView`
把格子滚进可视区，等价于玩家向下滚合成列表，不写任何游戏状态）。

| 观测点 | 值 |
|--------|-----|
| 开局 | `wood 20 / stone 12 / manaCore 1 / ration 12`；目标句「离入夜还有 5:00｜先给木傀儡做傀儡木棒（木材×12 + 石料×4）」 |
| 背包合成页 | `open:true`，`activeTab: 合成`，`[data-recipe-id="puppetCudgel"]` 存在且 `is-craftable:true`，格子文案 `傀儡木棒×1 · 20/12 · 12/4` |
| 真实左键点击后 | `wood 20→8`、`stone 12→8`（**材料按配方扣除**），`cursorItem=puppetCudgel ×1`、`craftedFrom.recipeId=puppetCudgel`（产物在手上，等玩家放下） |
| 控制台 | `problems: []` |

结论：开局的第一个目标步骤在真实 UI 里可做，材料扣除与产物交接都正确。

### 8.2 更正核对（承 7.1，本次复核）

- `src/systems/Game.js`：`commandSelectedUnits()` 里**没有** `issueHarvestOrders` 调用
  （grep 全仓库只有 8943 行的定义本身）；右键分支（7810–7831）仍是
  「放置/框选/连线模式下先取消 → 否则 `issueMoveCommand()`」，即**右键 = 集结/移动**。
  源码里已写下注释说明「右键不是采集指令，采集走 G 框选」。
- `git show HEAD:src/systems/Game.js` 里 `issueHarvestOrders` **本来就存在** → 保留不动，
  未因错误测试删改用户既有代码。

### 8.3 剩余未完成工作（本次只做这些）

1. **第 5 项链的后半段**（尚未有真实 UI 证据）：
   - 合成产物「傀儡木棒」→ 放进傀儡**工具区** → 是否自动装备（`autoEquipWorkerGear`）
     且顶部目标句 / 选中详情随之变化；
   - **建造**：用开局可负担的真实材料合成一件可放置建筑（`treePit` 20 木材+10 石料），
     Ctrl+左键 → 进放置模式 → 真实左键落地 → 建筑是否真的建成；
   - **供能**：落点是否被判定在基地供能半径内、建成后是否 `powered`（建筑不工作要如实记录）。
2. 以上完成后跑 `node --check`（本任务改动文件）+ `npm run build`。
3. 补第 4 项（红圈）与第 1 项（toggle）的最终截图确认（已有证据在 7.3 / 第 5 步，若时间允许再取一张总览）。
4. 写最终报告（替换本文件的「进行中」状态），然后退出。

不做：不再重跑已通过的 G 采集 6 分钟链、不再动右键语义、不改战斗/寻路架构。

---

## 第 9 步（本次续跑，attempt 5）：授权续跑，先复读证据再收尾

用户已明确授权在 attempt 3（exit 1）之后续跑；launcher/executor 已消失，本轮**在现有工作树上继续**，不重做已完成的实现。

### 9.1 用户纠正再次确认（最高优先级）

纠正（2026-10-06）：**右键不是采集指令**，真实操作是**按 G 框选资源**；先前 306 秒右键观察**不构成采集故障证据**。
本轮再次核对并确认第 7.1 / 8.2 节的处置仍然成立：

- 仓库内 `issueHarvestOrders` 只剩**定义本身**（`src/systems/Game.js:8943`），**没有任何调用点**；
  我此前加在 `commandSelectedUnits()` 里的那次调用**已删除**。
- `commandSelectedUnits()`（Game.js:8860–8877）现在是：自动傀儡走 `work.beginRally`（右键 = 集结/移动），
  非自动单位走移动编队；源码里留有注释「右键**不是**采集指令，采集走 G 键资源框选」。
- 结论撤回：第 6 步「阻塞 A（采集状态机卡死）」**作废**，不作为缺陷记录在最终报告里。
- 未把右键改成采集入口；未动 `WorkSystem` / `workOrders` / `UnitLogicSystem` / `resources` / `ResourceNodeSystem`
  里任何用户既有逻辑（mtime 仍为 10-05）。

### 9.2 回收 attempt 4 的既有证据（此前未写进检查点）

`outputs/_dsh-equip-build.json`（第 5 项链前半段，真实 UI）：

- 合成「傀儡木棒」后把产物放进傀儡背包 → 傀儡 `weaponItemId='puppetCudgel'`、
  选中详情「武器 傀儡木棒 / 耐久 60/60」、`objective` 随之从"先做木棒"变成"清掉西坡狼窝"（**自动装备生效**）
- 随后真实 G 框选 + 拖拽 → `markedNodes` 建立 → `planState` 进入 `harvesting`
  → 库存 `stone 8 → 203`（**采集与运输入库成立**）
- 但该次跑动到 `gather-300s` 时 `worker` 为 null（傀儡在夜里阵亡），
  同一次运行的 `furnace-recipe` 记录为 `exists:false`——
  说明 attempt 4 的 `build` 阶段是被页面重载/阵亡打断的，**建造与供能两段没有有效证据**。

`outputs/_dsh-equip-build.log` 的 `Cannot read properties of undefined (reading 'game')` 属于 harness 侧的页面重载，
不是游戏运行时报错（同一次 JSON 的 `problems: []`）。

### 9.3 本轮剩余工作（只做这些，完成后写最终报告）

1. **建造与供能（第 5 项链唯一缺口）**：真实 UI 采集补齐材料 → 合成可放置建筑 →
   真实左键落地 → 是否真的建成 → 供能状态（`canPlaceAt().inPowerRange` + `power.summary()`）。
   注意：默认开局库存（木20/石12）**买不起任何耗能设施**（熔炉 石30+木20、魔力炉 石40+铁8+木20、
   科研站 石25+木30），所以本轮只做到"用真实材料建成一栋建筑并给出供能读数"，
   "耗能设施通电运转"按未验证如实记录。
2. `node --check`（本任务改动文件）+ `npm run build`。
3. 写最终报告（含五项逐项处理、真实交互/程序化验证分开、截图绝对路径、遗留问题），替换本文件状态。

不做：不再重跑已通过的 G 采集 6 分钟链（第 7.2 节已有 280 采集 / 195 入库证据）、
不再动右键语义、不改战斗/寻路架构、不做 git 状态修改。

---

## 第 10 步（本次续跑，attempt 6）：收到「硬件渲染」附注 + 回收 attempt 5 未归档证据

### 10.1 收到两条用户要求（最高优先级，均已确认）

**A. 用户纠正（右键不是采集指令）**——第 7.1 / 8.2 / 9.1 节的处置保持有效，无新增改动需要撤回：
- 仓库里 `issueHarvestOrders` 只有定义（`src/systems/Game.js:8943`），**无调用点**；
  我此前误加的右键采集调用已删除，右键仍是集结/移动。
- 第 6 步「阻塞 A（采集状态机卡死）」**结论作废**，不写入最终报告为缺陷。
- 未改 `WorkSystem` / `workOrders` / `UnitLogicSystem` / `resources` / `ResourceNodeSystem` 的
  用户既有逻辑（mtime 仍为 10-05）。

**B. 正常硬件渲染附注（本次新增）**——`docs/DSH_PLAYABILITY_HANDOFF.md` 第 42–46 行：
- 必须复用已在运行的隔离 Chrome（CDP 9235），**不带** `--disable-gpu`、使用 `--use-angle=d3d11`；
- 必须报告**真实 WebGL renderer**（是否为硬件适配器），以及**正常计时下的帧率/帧耗时**；
- **禁止**用 `--disable-gpu` / SwiftShader / WARP 软件渲染兜底冒充正常性能；
- **撤销时钟篡改类证据的性能含义**：`dsh-playability-lib.mjs` 的 `RAF_DRIVER`
  （把 `clock.getDelta` 夹到 1/60 并在同一帧补步进）与 `__dshDriveFrames`（固定 dt 跑 tick）
  属于"补帧/推进模拟"，按用户要求**只能算辅助功能验证，不得冒充实时性能**；
- 本轮不得再用它们来"代表正常实时游玩表现"。

### 10.2 回收 attempt 5 遗留、此前未写进检查点的证据（关键）

上次执行器在检查点写完后（16:54–17:17）又跑了两个真实 UI 探针，**第 9.3 节唯一的缺口
（建造 + 供能）已经完成**，只是没归档。证据在 `outputs/`：

`outputs/_dsh-place-build.json`（17:12，`clockHook:true`，**辅助功能验证**）：
真实 `B` → 真实左键点「树坑」配方 → 产物落进快捷栏 → 真实 **Ctrl+左键** 进放置模式，
但那次有 bug：Ctrl+左键后 `placing:null`、`buildings:[]`、`treePit` 仍留在背包 —— **放置失败**。

`outputs/_dsh-build2.json`（17:17，**最终成功证据**）：
| 步骤 | 真实观测 |
|------|---------|
| opening | `wood20/stone12/manaCore1/ration12`；`buildings:[]`；目标句「离入夜还有 4:59｜先给木傀儡做傀儡木棒（木材×12 + 石料×4）」 |
| after-craft | 真实左键点 `[data-backpack-recipe="treePit"]`（树坑，20木+10石）→ `cursor={itemId:'treePit',count:1}`，库存 `stone 12→2`、`wood 20→0`（按配方扣除） |
| after-drop | 真实左键点基地背包空格 → `cursor:null`、`slotIndex:0` |
| after-ctrl-click | 真实 Ctrl+左键 → `placing={itemId:'treePit'}`，库存出现 `treePit×1` → **进入放置模式** |
| place-scan | 扫描 192 个合法落点；最近点 `(722,396)` `ok:true` `reason:'none'` **`inPowerRange:true`** |
| after-place | 真实左键落地 → `placing:null`，建筑 `id20 treePit @(8.2,39.7) 距基地4.2m hp60/60 underConstruction:true`（先进入施工态） |
| build-8s | 同一建筑 `underConstruction:false` → **真的建成** |
| buildingState | `inSupplyRange:true`、`isPowerReceiver:false`、`production:null`、`receiverState:'out_of_range'`、`poweredDown:false` |
| 控制台 | `problems: []` |

截图：`outputs/dsh-playability-95-opening.png`、`96-placing.png`、`97-preview.png`、
`98-after-place.png`、`99-built.png`。

**供能读数的诚实结论**：`treePit`（树坑）本身**不是耗能设施**（`isPowerReceiver:false`、`production:null`），
所以它只能证明"落点被判定在基地供能半径内（`inSupplyRange:true`）"，**不能**证明耗能设施通电运转。
默认开局库存（木20/石12）也买不起任何耗能设施（熔炉 石30+木20、魔力炉 石40+铁8+木20、科研站 石25+木30）。
→ 最终报告按第 9.3 节的既定口径记为：**建造链已真实验证；"耗能设施通电运转"未验证**。

### 10.3 本轮剩余工作（只做这些）

1. **硬件渲染验证（本次用户新增的必做项）**：复用 9235 的既有隔离 Chrome，真实加载游戏页，
   读取 `WEBGL_debug_renderer_info` 的 `UNMASKED_VENDOR_WEBGL` / `UNMASKED_RENDERER_WEBGL`
   （必要时 `chrome://gpu` 兜底），确认是硬件适配器而非 SwiftShader/WARP；
   并记录 gpu-process 的实际命令行参数作为旁证。
2. **正常计时下的帧率/帧耗时**：**不挂钩 `clock.getDelta`、不调 `__dshDriveFrames`/`__dshStep`**，
   直接采样页面自己 rAF 的帧间隔与 `game.elapsedTime` 推进，报告实测 rAF 与实测 fps/frame time；
   若 headless 环境本身限帧，如实写明"这是 headless 测试环境的限制，不等于正常硬件性能"。
3. 写最终报告（替换本文件"进行中"状态），逐项列出五项问题、真实交互/程序化验证分开、
   截图绝对路径、遗留与未验证项，然后退出。

不做：不重跑已通过的 G 采集链与建造链、不动右键语义、不改战斗/寻路架构、不做 git 状态修改。

---

## 第 11 步：硬件渲染验证 + 正常实时（未篡改时钟）的采集复验 —— 两项均已通过

时间：2026-10-06 17:18–17:57（本轮）

### 11.1 复用的测试浏览器（未重启、未改启动参数）

`chrome.exe --headless=new --remote-debugging-port=9235 --user-data-dir=C:\Users\A\.codex\tmp\dsh-playability-20261005\chrome-profile --no-first-run --no-default-browser-check --use-angle=d3d11 --hide-scrollbars --window-size=1280,720 --autoplay-policy=no-user-gesture-required`

- 命令行里**没有** `--disable-gpu`，GPU 进程实参为 `--type=gpu-process --headless=new --use-angle=d3d11`
  （**没有** `-warp` 后缀，即不是 `d3d11-warp-webgl`）。
- 未触碰用户日常浏览器，未启动/停止任何用户服务（dev server 仍是既有的 `http://127.0.0.1:3000/`，HTTP 200）。

### 11.2 真实 WebGL renderer：**硬件适配器**（新证据，`outputs/_dsh-hw.json`）

从**游戏真实 three.js 上下文**读取 `WEBGL_debug_renderer_info`（`unmasked:true`）：

| 项 | 值 |
|----|----|
| `UNMASKED_VENDOR_WEBGL` | `Google Inc. (NVIDIA)` |
| `UNMASKED_RENDERER_WEBGL` | `ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER (0x00001F06) Direct3D11 vs_5_0 ps_5_0, D3D11)` |
| `VERSION` | `WebGL 2.0 (OpenGL ES 3.0 Chromium)` |
| 新建离屏上下文 | 同一串（不是仅游戏上下文特例） |
| canvas | 1280×720，`antialias:false`、`failIfMajorPerformanceCaveat:false` |

Chrome 自己报告的 GPU 信息（浏览器级 CDP `SystemInfo.getInfo`）交叉验证：

- `glRenderer` = `ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER (0x00001F06) Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.15.9186)`
- `glVendor` = `Google Inc. (NVIDIA)`；`gpu_compositing` = `enabled`
- 设备枚举：`NVIDIA GeForce RTX 2060 SUPER`（驱动 `32.0.15.9186`，两个条目）+ `Microsoft Basic Render Driver`
  （系统里的软件适配器，**仅被枚举，未被用作 WebGL renderer**）

→ **结论：当前测试浏览器是正常硬件渲染（NVIDIA RTX 2060 SUPER / ANGLE D3D11），不是 SwiftShader/WARP 软件渲染。**

### 11.3 正常计时下的帧率/帧耗时（**未篡改时钟**，新证据）

探针 `scripts/.dsh-probe-hw.mjs`、`.dsh-probe-hw-render-count.mjs`、`.dsh-probe-hw-live.mjs`：
**不注入 `RAF_DRIVER`、不调用 `__dshDriveFrames`/`__dshStep`、不夹 `clock.getDelta`、不直接调 `game.tick()`**，
只额外注册一个只读 rAF 采样回调 + 读 three.js 自己的计数器。

| 指标 | 实测 |
|------|------|
| 采样窗口 | 20.0 s 墙上时间（另有 8 s 与 5 s 两次独立复测） |
| 浏览器 rAF 回调 | 2400 次 / 20.0 s = **120 /s**，帧间隔均值 **8.33 ms**，p95 8.4 ms，max 16.6 ms |
| 游戏实际渲染帧 | **~60 fps**（8 s 窗口内 961 次 rAF 回调中 481 次各渲染 3 次 `renderer.render()`，480 次不渲染） |
| `renderer.render()` 调用 | **180 /s**（= 60 游戏帧 × 3 次；其中每帧最后一次是 `calls:1 / triangles:1` 的全屏 pass） |
| 游戏自带 FPS 表 `#fps-meter` | **`FPS 60`**（白天与夜间战斗中都读到 60，偶见 50） |
| **游戏时间推进比** | 20.01 s 游戏时间 / 20.0 s 真实时间 = **1.000**（另测 5.009 s → 1.002） |
| 渲染进程 CPU（CDP `Performance.getMetrics`） | `TaskDuration` 7.629 s / 20 s = **38.1% 单核**；`ScriptDuration` 7.195 s；`LayoutDuration` 0.03 s |
| JS 堆 | 47.6 MB |

整机 CPU 占用（PowerShell 采样 20.2 s，本机 16 逻辑核）：

| 进程 | CPU 秒 | 占单核 | 占整机（16 核） |
|------|-------|--------|----------------|
| GPU 进程 | 3.78 | 18.7% | **1.17%** |
| 渲染进程 | 8.33 | 41.2% | **2.58%** |
| 全部 Chrome | 12.11 | 59.9% | **3.75%** |

→ 与用户描述的软件渲染（`d3d11-warp-webgl`，gpu-process 曾占整机约 **77%**）相比，
当前硬件渲染下 GPU 进程只占整机 **1.17%**，全部 Chrome 合计 **3.75%**。

**诚实说明（headless 限制）**：本轮 rAF 由 headless 合成器的合成 BeginFrame 驱动，
不能等同于有窗口/显示器的真实浏览器（无法用 vsync 判定显示器刷新率，还观测到少量负的 `dt`）。
因此"**60 fps / 8.33 ms 帧间隔**"应读作"该 headless 硬件渲染环境下游戏循环跑满 60 fps 且游戏时间
与真实时间 1:1"，而不是"任何机器上都 60 fps"。真正可信的硬件结论是 renderer 字符串、
GPU 进程不是 WARP、以及整机 CPU 占用只有个位数百分比。

### 11.4 正常实时（未篡改时钟）的真实 G 框选 → 采集 → 运输入库：**通过**

探针 `scripts/.dsh-probe-gselect-realtime.mjs` → `outputs/_dsh-gselect-realtime.json`、截图 110–114。
**本轮不挂钩时钟、不推帧**，只用真实键鼠 + 墙上时间等待。

| 步骤 | 真实观测 |
|------|---------|
| 开局 | 木傀儡 `(-2.3, 46.3)` 距基地 8.9 m；基地库存 `wood20/stone12/manaCore1/ration12`；敌方存活 9 |
| 真实按 **G** | `resourceBoxSelect={mode:'mark', priority:4}`，HUD 标题「资源框选」 |
| 真实左键拖拽 `(727,189)→(831,293)` 框住石堆 | `markedCount 0 → 7`，`assigned 1`、`reservations 1`，自动派 `stonePile-5-5` |
| 10 s 后 | `planState='harvesting'`（首次进入采集） |
| 12 次 × 10 s 实时采样 | `planState` 在 `harvesting` / `moving_to_node` 之间正常轮转；`markedCount 7→6→5→4→3→2→1`（采空即撤标记） |
| 结束时（游戏时间 126 s） | 傀儡存活；`harvested 280`、`deposited 195`、`harvestActions 56`、`depletedTasks 7` |
| **基地库存** | `stone 12 → 207`（只框选了石堆，wood 未动）——**真的运输入库** |
| 无人机/无注入 | 全程未注入资源、未瞬移、未写内部状态；`problems: []`，`runtimeError: null` |
| 帧率 | 采样期间 `#fps-meter` = `FPS 60` |

**与第 7.2 节（时钟挂钩的辅助验证）逐项吻合**：同样 `harvested 280 / deposited 195 / stone 12→207 / 7 个标记点采空`。
→ 说明旧证据的**功能结论**没问题，本轮把它从"时钟挂钩的辅助验证"升级为"正常实时的真实验证"。

附带观测（如实记录，非阻塞）：
- 开局第 2.8 s 傀儡已处于 `planState='engaging'`、最近敌人 **3.3 m**、血量 29/30 —— 默认遇敌策略
  `fight` 会让唯一傀儡在开局就被迫接战（本次仍完成了 120 s 采集，未因此卡死）。
- 基地 `hp 50 / maxHp 50`（满血，未受损）；夜间（elapsed 453 s）傀儡血量掉到 2/30，
  与既有"默认开局约 5:47 后基地陷落"一致，属保留的防守压力。

### 11.5 本轮收尾验证命令

| 命令 | 结果 |
|------|------|
| `node --check` × 8 个本任务改动文件（`puppetCombatMode.js` / `BackpackUi.js` / `Game.js` / `ExpeditionPanelUi.js` / `ExpeditionSystem.js` / `HelpPanelUi.js` / `fieldCamps.js` / `expedition.js`） | 全部 exit 0（0 失败） |
| `node --check` × 6 个本轮新增探针脚本 | 全部 exit 0 |
| `npm run build` | exit 0，`✓ 190 modules transformed`，`built in 1.04s` |


