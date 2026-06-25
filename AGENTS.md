# AGENTS.md

必须使用 UTF-8 编码，否则中文会乱码。

## 值得注意

- 这是 Vite + Three.js 的长期 RTS/卡牌游戏原型，用户希望继续做成真实可玩的项目，不要只做静态演示。
- 当前场景、单位、武器、卡牌图、特效基本都是代码生成的低多边形风格，不是导入 `.glb/.fbx` 资产。不要默认引入外部美术导入流程。
- 主要数据入口在 `src/data/gameData.js`：单位、卡牌、附魔、Buff、基础数值都优先从这里扩展。
- 单位模型在 `src/art/lowpoly.js` 里用 Three.js 几何体拼出来，模型注册和动画姿态在 `src/art/visualRegistry.js`。
- 卡牌 UI 和卡面图在 `src/systems/CardSystem.js`，新增卡牌时记得配 `artKey`，并保持当前低多边形卡面 SVG 风格。
- 属性要走 `AttributeSet` 的加法/乘法修改器模式。元素效果不要硬塞成属性修改器，例如火焰是命中后燃烧，毒是命中后真实伤害 DoT。
- 现在的持盾单位叫 `knight` / 骑士；无盾拿剑单位才是 `swordsman` / 剑士。
- 世界血条是 DOM UI 投影，不是 Three.js 模型血条。血条有护盾层、耐久条、黄色扣血延迟条和附魔文字。
- 右键菜单要在游戏区域禁用；相机支持边缘移动、滚轮缩放、中键拖动。
- 工作区可能有很多用户认可的未提交改动，不要清理、回滚或重排无关文件。
- 常用验证：`node --check <changed-js-file>`，然后 `npm run build`。WebGL 截图在内置浏览器里可能不稳定，必要时用 DOM/状态检查替代。

