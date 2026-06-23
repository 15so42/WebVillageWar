# Codex 美术生产工作流

本项目默认不要求用户手动导入任何美术资源。所有模型、动画、特效、卡牌图标、UI 视觉和资源接入，默认由 Codex 在项目内完成、提交和验证。

## 工作原则

- 用户只描述需求、风格和反馈，不手动导入资源。
- Codex 负责生成或编写资源、放到正确目录、接入运行时代码。
- 每个新增资源都必须能从仓库内容追溯来源：代码生成、AI 生成、程序化模型、SVG/Canvas、或明确的资源说明。
- 不把“需要用户去 Blender/Unity 导出一下”当作默认方案。
- 如果确实需要外部来源或专门工具，Codex 先给出可执行替代方案，优先选择项目内可自动化的路线。

## 默认资产路线

### 3D 单位和建筑

优先使用 Three.js 程序化低多边形模型。

适合：

- 剑士、弓兵、怪物、建筑、武器。
- 需要快速迭代外观的长期原型。
- 不想维护复杂 DCC 工具链的阶段。

位置：

- 代码源：`src/art/lowpoly.js`
- 运行入口：`src/art/visualRegistry.js`

如果后续需要更高质量的模型，Codex 可以在项目内新增生成脚本，输出 GLB/GLTF 或继续用 Three.js 组合模型。

### 动画

动画时机由数据配置控制，而不是写死在战斗逻辑里。

位置：

- 配置：`src/data/gameData.js` 的 `art.timelines`
- 播放入口：`src/art/visualRegistry.js`
- 触发结算：`src/systems/CombatSystem.js`

示例：

```js
timelines: {
  attack: {
    duration: 0.46,
    events: {
      impact: 0.54
    }
  }
}
```

这表示攻击动画播放到 54% 时才触发伤害。以后换成骨骼动画、程序化动画或 GLB 动画，都复用这个时间轴契约。

### 战斗特效

默认用 Three.js 程序化特效。

适合：

- 命中火花。
- 火焰附加。
- 荆棘反伤。
- 回复粒子。
- 陨石落地。
- 范围圈、选取框、击退冲击。

位置：

- 生命周期：`src/systems/EffectsSystem.js`
- 模型入口：`src/art/visualRegistry.js`

如果需要更精细表现，Codex 可以新增：

- SVG/Canvas 生成的 spritesheet。
- Three.js 粒子系统。
- InstancedMesh 粒子。
- Shader 效果。
- 程序化 GLB/GLTF。

### UI 和卡牌

UI 默认使用 HTML/CSS 制作。

适合：

- 卡牌手牌。
- 冷却条。
- HUD 面板。
- 选中单位信息。
- 浮动伤害数字。
- 屏幕提示和按钮。

位置：

- HTML：`index.html`
- 样式：`src/styles.css`
- 卡牌逻辑：`src/systems/CardSystem.js`

## 资源目录约定

Codex 生成的运行时资源放在：

```text
public/assets/generated/
  models/
  vfx/
  ui/
  cards/
```

如果某个资源有生成脚本，脚本放在：

```text
tools/art/
```

规则：

- 运行时读取 `public/assets/generated/`。
- 生成逻辑放在 `tools/art/` 或 `src/art/`。
- 不要求用户把外部文件拖进项目。

## 每次新增美术的交付标准

新增或替换美术时，Codex 需要完成：

1. 生成或编写资源。
2. 接入运行时代码或资源表。
3. 保留程序化 fallback，除非已经确认不需要。
4. 跑 `npm run build`。
5. 用浏览器验证画面、交互和控制台。
6. 在最终回复里说明改了哪些资源、如何验证。

## 用户需要做什么

用户只需要提供方向，例如：

- “剑士更像重甲骑士。”
- “火焰附魔要更明显。”
- “陨石要有拖尾和落地冲击波。”
- “卡牌更像桌游卡面。”

Codex 负责把这些需求转成可运行的资源和代码。
