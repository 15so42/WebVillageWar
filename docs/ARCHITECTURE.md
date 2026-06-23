# 村落战争 3D 原型架构

本项目使用 Vite + Three.js，源码和文档均使用 UTF-8 编码。当前目标是把玩法原型做成可长期扩展的“卡牌驱动战斗沙盘”，后续新增卡牌、单位、附魔、法术时尽量走数据注册表，而不是把逻辑写死在输入层。

## 目录职责

- `src/data/gameData.js`：玩法注册表。单位、卡牌、附魔和基础数值都集中在这里。
- `src/entities/UnitEntity.js`：单位运行时状态。包括生命、武器耐久、击退速度、燃烧状态、附魔列表和可选中模型引用。
- `src/systems/CardSystem.js`：卡牌手牌 UI、拖拽、目标预览、落点合法性和卡牌释放入口。
- `src/systems/CombatSystem.js`：索敌、移动、普通攻击、远程弹体、击退、火焰附加、荆棘反伤和死亡清理。
- `src/systems/RecoverySystem.js`：玩家基地回复范围。单位进入范围后回复生命和武器耐久。
- `src/systems/EffectsSystem.js`：视觉效果。陨石、命中特效、火焰、荆棘、回复粒子和范围环都在这里。
- `src/systems/Game.js`：组合各系统、主循环、波次、HUD、选中单位和调试状态。
- `src/art/visualRegistry.js`：视觉资源入口。单位模型、弹体、法术模型和动画语义都通过这里转发，后续替换正式 GLB 时优先改这个文件。
- `src/art/lowpoly.js`：低多边形程序化美术。剑士、弓兵、入侵者、基地、营地、树、石头、箭矢、选择环等模型都在这里。
- `src/world/createWorld.js`：场景搭建。地形、道路、玩家基地、敌方营地、装饰物和灯光。
- `docs/ASSET_PIPELINE.md`：正式模型、角色动画、特效替换的资源管线说明。
- `docs/VFX_GUIDE.md`：浏览器内 Three.js 特效、sprite、粒子、shader 和 DOM UI 特效的制作说明。
- `docs/CODEX_ART_WORKFLOW.md`：Codex 托管美术生产流程，明确用户不需要手动导入资源。

## 核心数据流

1. `CardSystem` 接收拖拽输入，使用射线检测得到地面落点或友军单位目标。
2. 卡牌释放后根据 `card.kind` 分发到召唤、法术或附魔。
3. 召唤卡创建 `UnitEntity`，并把单位加入 `friendlyUnits`。
4. 法术卡把效果交给 `EffectsSystem`，命中结算回调到 `CombatSystem`。
5. 附魔卡把附魔 ID 写入单位的 `enchantments`，普通攻击时由 `CombatSystem` 读取。
6. 每帧 `Game.tick()` 依次更新卡牌冷却、战斗、回复、特效、HUD 和渲染。

## 新增卡牌

优先在 `src/data/gameData.js` 的 `CARD_DEFINITIONS` 追加数据：

```js
{
  id: 'ice-nova',
  name: '寒冰新星',
  kind: 'spell',
  label: '冰',
  summary: '范围减速',
  target: 'ground',
  radius: 3,
  cooldown: 7,
  damage: 8,
  color: '#62b7d9'
}
```

如果是已有类型：

- `kind: 'summon'`：补 `unitType` 和 `count` 即可。
- `kind: 'enchant'`：补 `enchantmentId`，并在 `ENCHANTMENTS` 中注册。
- `kind: 'spell'`：如果不是陨石，需要在 `CardSystem.resolveCard()` 或独立法术系统中加一个效果分支。

后续卡牌数量变多时，建议新增 `SpellSystem`，让 `CardSystem` 只负责输入和目标选择。

## 新增单位

1. 在 `UNIT_DEFINITIONS` 增加单位数值。
2. 在 `src/art/lowpoly.js` 增加模型工厂。
3. 在 `src/art/visualRegistry.js` 的分发表中接入模型。
4. 如需特殊 AI，给单位定义增加能力标签，再由 `CombatSystem` 或未来的 `AbilitySystem` 读取。

当前普通攻击契约：

- 近战攻击立即结算，击退强。
- 远程攻击生成箭矢，命中后结算，击退弱。
- 武器耐久不足时单位不会普通攻击。
- 基地回复范围会恢复生命和耐久。

## 替换正式美术

当前程序化低多边形模型是 fallback。后续换正式资源时优先走 `docs/ASSET_PIPELINE.md` 的规则：

- 运行时 GLB/贴图放在 `public/assets/`。
- 玩法代码只引用 `unit.swordsman`、`vfx.meteor` 这类稳定 key。
- `visualRegistry` 负责把 key 变成 Three.js 模型、弹体、法术模型或动画。
- `CombatSystem` 只调用 `playUnitAnimation(unit, 'attack')` 这类语义动画，不直接依赖 GLB clip 名。
- 正式资源加载失败时保留 `lowpoly.js` fallback，方便长期开发中美术资源逐步替换。

## 新增附魔

附魔数据在 `ENCHANTMENTS`。当前已有：

- `fire`：普通攻击附加额外伤害，并让目标燃烧。
- `thorns`：受到普通攻击后对攻击者反弹伤害。

后续建议把附魔实现拆成事件钩子：

- `onBeforeAttack`
- `onAfterAttack`
- `onReceiveDamage`
- `onTick`

当前原型为了保持轻量，火焰和荆棘先在 `CombatSystem.applyAttack()` 中集中处理。

## 目标选择模式

卡牌通过 `target` 控制拖拽目标：

- `ground`：射线投到地面，显示圆形选取点或范围框。
- `friendly-unit`：射线检测友军单位，显示单位高亮环。

如果以后需要“框选多个单位”“路径释放”“墙体放置”，建议新增目标解析器：

- `GroundPointTarget`
- `AreaTarget`
- `UnitTarget`
- `BoxTarget`
- `PathTarget`

这样卡牌只声明目标类型，不关心输入细节。

## 调试与验证

页面暴露了 `window.__VILLAGE_WAR_DEBUG__`：

- `snapshot()`：返回友军、敌军、波次、基地血量、选中单位和最后释放卡牌。
- `samplePixels()`：读取 WebGL 像素样本，用于确认画面不是空白。

浏览器验证时优先使用真实本地服务器 URL，并检查 DOM/HUD、调试状态和 WebGL 像素样本。
