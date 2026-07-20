# Village War Prototype

低多边形 3D RTS / 卡牌战斗原型。玩家通过卡牌派遣单位、施加附魔、释放法术、建造建筑，并在不同关卡里争夺祭坛、推进路线和敌方营地。

## 运行

```powershell
npm install
npm run dev
```

构建检查：

```powershell
npm run build
```

本地预览：

```powershell
npm run preview
```

Windows 上如果需要后台启动 npm，优先使用 `npm.cmd`。

## 文档入口

- [下一会话交接](docs/NEXT_SESSION_HANDOFF.md)：当前项目状态、最近改动、下一步开发建议。
- [架构说明](docs/ARCHITECTURE.md)：系统职责、数据流、扩展边界。
- [性能优化](docs/PERFORMANCE_OPTIMIZATION.md)：战斗、寻路、索敌、投射物和 profiler 排查思路。
- [玩法效果扩展](docs/GAMEPLAY_EFFECTS.md)：卡牌、Buff、附魔、属性修改器约定。
- [世界与导航](docs/WORLD_NAVIGATION.md)：地图、路径、可行走区域和移动规则。
- [资源管线](docs/ASSET_PIPELINE.md)：后续替换正式模型、贴图、动画的规则。
- [特效指南](docs/VFX_GUIDE.md)：Three.js 特效、粒子、DOM UI 表现约定。
- [Codex 美术流程](docs/CODEX_ART_WORKFLOW.md)：由 Codex 托管程序化美术/资源迭代的流程。

## 关键约定

- 所有源码和文档使用 UTF-8。
- 主要玩法数据优先写在 `src/data/gameData.js`。
- 卡牌 UI 和卡面图在 `src/systems/CardSystem.js`。
- 程序化低多边形模型在 `src/art/lowpoly.js`，模型注册在 `src/art/visualRegistry.js`。
- 战斗架构按单位注册、单位逻辑、空间索敌、寻路移动、攻击事件、伤害结算分层；不要把这些职责重新堆进 `CombatSystem`。
- 修改后至少运行 `node --check <changed-js-file>` 和 `npm run build`。
