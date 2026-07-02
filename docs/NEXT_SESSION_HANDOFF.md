# 下一会话交接

更新日期：2026-07-02  
当前分支：`main`  
项目目录：`C:\Users\yangkun'\Documents\VillageWarTest`

## 项目定位

这是一个 Vite + Three.js 的长期 RTS / 卡牌战斗原型。目标是继续扩成真实可玩的策略游戏，不是静态演示。

玩家在地图上通过卡牌：

- 派遣单位。
- 给单位施加附魔。
- 释放区域法术。
- 建造建筑。
- 操控单位移动、停止、驻守、占领祭坛。
- 推进并摧毁敌方营地。

所有中文文件必须保持 UTF-8 编码。

## 运行方式

开发：

```powershell
npm install
npm run dev
```

构建：

```powershell
npm run build
```

预览：

```powershell
npm run preview
```

Windows 后台启动 npm 时，使用 `npm.cmd`。

临时公网预览曾使用 Cloudflare Tunnel 指向本地静态预览，地址会随会话失效。新会话如果要给用户访问，先 `npm run build`，再确认预览/隧道是否服务最新 `dist`。

## 当前架构状态

最近完成了一轮战斗与寻路性能重构。核心变化：

- `CombatSystem` 已缩小为伤害结算系统。
- 单位出生/死亡通过 `UnitRegistry` 主动注册/注销。
- 单位状态机在 `UnitLogicSystem`。
- 单位移动由 `MovementAgent` + `MovementSystem` 处理。
- 寻路入口是 `PathfindingSystem`，支持 worker。
- 索敌由 `TargetingSystem` 空间网格处理。
- 攻击延迟、攻击队列、投射物和弹体池由 `AttackSystem` 处理。
- 导航阻挡写入 `NavigationGrid`，不要用运行时物理碰撞模拟普通移动。

重点文档：

- `docs/ARCHITECTURE.md`
- `docs/WORLD_NAVIGATION.md`
- `docs/PERFORMANCE_OPTIMIZATION.md`

## 重要入口文件

- `src/data/gameData.js`：单位、卡牌、Buff、附魔、祭坛、关卡、基础平衡数值。
- `src/systems/Game.js`：主循环、相机、单位生成、关卡流程、HUD、暂停、移动指令、调试快照。
- `src/systems/CardSystem.js`：手牌、卡牌拖拽、目标选择、卡面 SVG、能量 UI、牌堆 UI。
- `src/systems/CardEffectSystem.js`：卡牌 effect 分发。
- `src/systems/BuffSystem.js`：附魔/Buff/DoT/吸血/格挡/爆炸/暴击/凝神等事件处理。
- `src/systems/CombatSystem.js`：伤害、闪避、护盾/生命、击退、死亡触发。
- `src/systems/AttackSystem.js`：攻击事件、投射物、弹体池、命中检测。
- `src/systems/UnitLogicSystem.js`：单位 AI 状态机。
- `src/systems/TargetingSystem.js`：空间网格索敌。
- `src/systems/PathfindingSystem.js`：A* 寻路和 worker 入口。
- `src/entities/MovementAgent.js`：单位自己的移动代理。
- `src/systems/BuildingSystem.js`：建筑建造、箭塔、维修站、食堂、信标。
- `src/systems/AreaEffectSystem.js`：毒雾、白烟等区域持续效果。
- `src/systems/MetaGameSystem.js`：主菜单、商店、升级、牌组、金币和局外存档。
- `src/art/lowpoly.js`：程序化低多边形模型。
- `src/art/visualRegistry.js`：模型、弹体、法术视觉的注册和分发。

## 玩法现状摘要

已接入的主要系统：

- 单位：剑士、骑士、弓兵、弩手、盗贼、水法师、牧师、矮人工匠等。
- 建筑：箭塔、维修站、食堂、信标。
- 附魔：火焰、毒、恢复、灵盾、格挡、不死鸟、灵武、噬魂、吸血、汲取、爆炸、暴击、凝神等。
- 法术：范围法术会影响敌我双方。
- 能力牌：消耗回能、周期回能、附魔重复释放、友军死亡爆炸、建筑耐久加成、随机治疗、胜利金币加成。
- 关卡：雪原、沙漠、地牢等关卡有不同阻挡和战术逻辑。
- 初始金币：`10000`。

## 性能注意事项

不要重新引入这些模式：

- 每帧全局扫描所有单位做死亡清理、索敌或建筑影响。
- 在索敌阶段跑 A*。
- 目的地没变仍然反复寻路。
- 普通移动时用基地/建筑碰撞推开来模拟可行走。
- 每次命中创建新的 canvas、texture、geometry、material 或 DOM。
- 把投射物、移动、索敌和伤害都塞回 `CombatSystem`。

当前 profiler 需要区分父级和子级：

- `单位循环总计` 是父级汇总。
- 投射物拆分为飞行、位置应用、查询、命中、回收。
- combat 行应只代表伤害流程。

## Codex Skill

已创建本机全局 skill：

```txt
C:\Users\yangkun'\.codex\skills\village-war-browser-rts
```

用途：做 Village War 风格的 Three.js RTS / 卡牌游戏时，复用架构、性能排查、导航和玩法扩展规则。

重要文件：

- `SKILL.md`
- `references/performance-playbook.md`

注意：`quick_validate.py` 依赖 `PyYAML`，当前系统 Python 环境没有安装该包；如果需要跑官方校验，先安装或换有 PyYAML 的 Python 环境。

## 当前验证方式

推荐每次改动后至少跑：

```powershell
node --check <changed-js-file>
npm run build
```

如果只改某个 JS 文件，先对该文件跑 `node --check`。

当前 `npm run build` 可能提示 Vite 大 chunk warning，这是已知警告，不等于构建失败。

浏览器验证优先看：

- 主菜单、商店、牌组、金币是否正常。
- 战斗界面能否进入关卡。
- 单位模型是否可见。
- 单位能否移动、索敌、攻击。
- 近战、远程、水球穿透、盗贼飞刀是否仍正常。
- 击退后单位能否恢复移动。
- `N` 可行走调试是否显示树、柱子、墙、基地、敌营、小屋等阻挡。
- 手机端 UI 是否不重叠，卡牌是否能看清。

## 设计约定

- 不要把新卡牌逻辑硬写进 `CardSystem`。
- 不要把具体附魔 ID 判断继续堆进 `CombatSystem`。
- 新单位优先从 `UNIT_DEFINITIONS`、`lowpoly.js`、`visualRegistry.js` 三处同步扩展。
- 新卡牌优先从 `CARD_DEFINITIONS` + `CardEffectSystem` handler 扩展。
- 新附魔/Buff 优先从 `BUFF_DEFINITIONS` + `BuffSystem` 事件扩展。
- 属性数值走 `AttributeSet` 的 add/multiply 修改器。
- 火焰、毒、汲取、爆炸等事件效果不要硬塞成属性修改器。
- 建筑单位不可移动、不可被附魔、免疫效果施加。
- 卡牌背景颜色按 `kind` 类型决定。

## 新会话建议

开始继续开发前先运行：

```powershell
git status --short
git pull --ff-only origin main
npm run build
```

如果 `git status` 不干净，先看清楚改动来源，不要直接重置。
