# 村落战争 3D 原型架构

本项目使用 Vite + Three.js，源码和文档均使用 UTF-8 编码。当前目标是把玩法原型做成可长期扩展的“卡牌驱动战斗沙盘”，后续新增卡牌、单位、附魔、法术时尽量走数据注册表，而不是把逻辑写死在输入层。

## 目录职责

- `src/data/gameData.js`：玩法注册表。单位、卡牌、Buff、附魔和基础数值都集中在这里。
- `src/entities/UnitEntity.js`：单位运行时状态。包括生命、武器耐久、击退速度、Buff、附魔列表和可选中模型引用。
- `src/systems/CardSystem.js`：卡牌手牌 UI、拖拽、目标预览、落点合法性和卡牌释放入口。
- `src/systems/CardEffectSystem.js`：卡牌效果分发。把 `spawn-units`、`cast-spell`、`apply-buff` 等数据效果转成系统调用。
- `src/systems/BuffSystem.js`：Buff、附魔和持续状态生命周期。负责 `modifyAttack`、`afterDamage`、`receiveDamage`、`tick` 等事件钩子。
- `src/systems/ModifierSystem.js`：数值修正入口。移动速度、攻击速度、伤害、击退、耐久消耗等都从这里读取，方便以后接减速、狂暴、光环。
- `src/systems/SpellSystem.js`：法术效果入口。当前承接陨石，后续冰环、治疗雨、地刺等法术放这里。
- `src/systems/CombatSystem.js`：索敌、移动、普通攻击、远程弹体、击退和死亡清理。具体附魔效果不写死在这里。
- `src/systems/RecoverySystem.js`：玩家基地回复范围。单位进入范围后回复生命和武器耐久。
- `src/systems/EffectsSystem.js`：视觉效果。陨石、命中特效、火焰、荆棘、回复粒子和范围环都在这里。
- `src/systems/Game.js`：组合各系统、主循环、RTS 相机与选中/指挥输入、波次、HUD 和调试状态。
- `src/art/visualRegistry.js`：视觉资源入口。单位模型、弹体、法术模型和动画语义都通过这里转发，后续替换正式 GLB 时优先改这个文件。
- `src/art/lowpoly.js`：低多边形程序化美术。剑士、弓兵、入侵者、基地、营地、树、石头、箭矢、选择环等模型都在这里。
- `src/world/createWorld.js`：场景搭建。地形、道路、玩家基地、敌方营地、装饰物和灯光。
- `docs/ASSET_PIPELINE.md`：正式模型、角色动画、特效替换的资源管线说明。
- `docs/VFX_GUIDE.md`：浏览器内 Three.js 特效、sprite、粒子、shader 和 DOM UI 特效的制作说明。
- `docs/CODEX_ART_WORKFLOW.md`：Codex 托管美术生产流程，明确用户不需要手动导入资源。
- `docs/GAMEPLAY_EFFECTS.md`：卡牌、Buff、附魔、数值修正和法术的长期扩展约定。

## 核心数据流

1. `CardSystem` 接收拖拽输入，使用射线检测得到地面落点或友军单位目标。
2. 卡牌释放后交给 `CardEffectSystem`，根据 `card.effect.type` 分发到召唤、法术或 Buff。
3. 召唤卡创建 `UnitEntity`，并把单位加入 `friendlyUnits`。
4. 法术卡进入 `SpellSystem`，表现交给 `EffectsSystem`，伤害结算回调到 `CombatSystem`。
5. 附魔卡通过 `BuffSystem.applyBuff()` 写入单位的 `buffs`，附魔只是 `category: 'enchantment'` 的 Buff。
6. 普通攻击创建攻击上下文，`ModifierSystem` 给出基础数值，`BuffSystem` 的事件钩子再修改伤害、点燃目标或触发反伤。
7. 每帧 `Game.tick()` 依次更新卡牌冷却、战斗、回复、特效、HUD 和渲染。

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
  effect: {
    type: 'cast-spell',
    spellId: 'ice-nova'
  },
  color: '#62b7d9'
}
```

如果是已有类型：

- `kind: 'summon'`：补 `effect: { type: 'spawn-units', unitType, count }`。
- `kind: 'enchant'`：补 `effect: { type: 'apply-buff', buffId }`，并在 `BUFF_DEFINITIONS` 中注册。
- `kind: 'spell'`：补 `effect: { type: 'cast-spell', spellId }`，并在 `SpellSystem` 中注册法术处理器。

`CardSystem` 只负责输入和目标选择，不写任何具体卡牌效果。

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

附魔数据在 `BUFF_DEFINITIONS`，`ENCHANTMENTS` 只是兼容旧 UI 和语义的子集。当前已有：

- `fire`：普通攻击附加额外伤害，并让目标燃烧。
- `thorns`：受到普通攻击后对攻击者反弹伤害。

附魔实现使用事件钩子：

- `modifyAttack`：攻击结算前修改伤害、击退或伤害类型。
- `afterDamage`：成功造成伤害后触发，例如火焰附加点燃目标、吸血回血。
- `receiveDamage`：目标受到攻击后触发，例如荆棘反伤、护盾吸收。
- `tick`：持续状态每隔一段时间触发，例如燃烧、中毒、治疗。

当前火焰和荆棘已经迁移到 `BuffSystem`，`CombatSystem.applyAttack()` 只负责创建攻击上下文和执行伤害入口。

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
