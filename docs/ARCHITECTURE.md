# 村落战争 3D 原型架构

本项目是 Vite + Three.js 的长期 RTS / 卡牌战斗原型。源码和文档必须保持 UTF-8 编码。

当前架构目标是：卡牌、单位、Buff、建筑和 AI 可以继续扩展，同时战斗帧不再依赖全局扫描和“大管家式”系统。单位生命周期、索敌、移动、攻击队列、伤害结算各自独立。

## 目录职责

- `src/data/gameData.js`：玩法注册表。单位、卡牌、Buff、附魔、关卡和基础数值优先从这里扩展。
- `src/entities/UnitEntity.js`：单位运行时对象。持有生命、耐久、Buff、附魔、状态、目标、模型引用和移动代理。
- `src/entities/MovementAgent.js`：单位自己的移动代理。保存目的地、路径、路径索引、击退速度和移动状态。
- `src/systems/UnitRegistry.js`：单位生命周期注册表。单位出生主动注册，死亡主动注销。
- `src/systems/UnitLogicSystem.js`：单位状态机更新入口。只迭代活动单位，让每个单位处理自己的决策和计时器。
- `src/systems/TargetingSystem.js`：索敌空间网格。周期性构建局部索引，给单位和穿透弹体查询附近目标。
- `src/systems/PathfindingSystem.js`：寻路入口。接收起点终点并返回路径，支持 worker。
- `src/systems/MovementSystem.js`：移动批处理。负责沿路径移动、击退落点、分离和贴地。
- `src/systems/AttackSystem.js`：攻击事件和投射物。负责攻击释放点、延迟命中、弹体池、弹体移动和命中检测。
- `src/systems/CombatSystem.js`：伤害结算。只处理攻击上下文、闪避、格挡/保护/护盾/生命扣除、击退、受击反馈和死亡触发。
- `src/systems/BuffSystem.js`：Buff、附魔和持续状态生命周期。负责 `modifyAttack`、`beforeDamage`、`afterDamage`、`receiveDamage`、`tick` 等事件钩子。
- `src/systems/AttributeSet.js`：属性容器。每个属性由基础值、加法修改器列表、乘法修改器列表计算最终值。
- `src/systems/ModifierSystem.js`：最终数值读取入口。单位和基地属性都从这里读。
- `src/systems/CardSystem.js`：卡牌手牌 UI、拖拽、目标预览、落点合法性和卡牌释放入口。
- `src/systems/CardEffectSystem.js`：卡牌效果分发。把 `spawn-units`、`cast-spell`、`apply-buff` 等数据效果转成系统调用。
- `src/systems/SpellSystem.js`：法术效果入口。
- `src/systems/BuildingSystem.js`：建筑建造、箭塔、维修站、食堂、信标和建筑 tick。
- `src/systems/RecoverySystem.js`：玩家基地回复范围。
- `src/systems/EffectsSystem.js`：视觉效果。粒子、命中特效、伤害飘字、范围环和缓存资源都在这里。
- `src/systems/Game.js`：组合各系统、主循环、RTS 相机与选中/指挥输入、波次、HUD 和调试状态。
- `src/art/visualRegistry.js`：视觉资源入口。单位模型、弹体、法术模型和动画语义都通过这里转发。
- `src/art/lowpoly.js`：低多边形程序化美术。
- `src/world/createWorld.js`：场景搭建和世界导航阻挡物注册。
- `src/world/NavigationGrid.js`：导航网格和可行走区域。
- `docs/PERFORMANCE_OPTIMIZATION.md`：性能优化思路和排查手册。

## 核心数据流

1. `CardSystem` 接收拖拽输入，解析地面落点、友军单位目标或区域目标。
2. 卡牌释放后交给 `CardEffectSystem`，根据 `card.effect.type` 分发到召唤、法术、Buff、建筑、战术或能力。
3. 召唤卡创建 `UnitEntity`，再通过 `UnitRegistry.register()` 进入生命周期集合。
4. 新单位获得 `MovementAgent`，并进入 `UnitLogicSystem` 的单位状态机。
5. 指挥系统或玩家输入给单位设置目的地。单位请求一次路径，之后由 `MovementAgent` 沿路径移动。
6. `TargetingSystem` 周期性重建空间网格。单位 AI 到索敌 tick 时只查询附近候选，不扫描全场。
7. 单位进入攻击状态后由 `AttackSystem` 创建攻击事件或投射物。
8. 攻击命中时调用 `CombatSystem.applyAttack()` 或对应伤害入口结算。
9. `CombatSystem` 触发 Buff 钩子、扣除护盾/耐久/生命、生成反馈，并在生命归零时触发死亡。
10. 单位死亡通过 `UnitRegistry.handleDeath()` 注销，再通知相关系统清理目标、攻击事件、UI 和特效引用。

## 单位状态机

单位建议保持少量稳定状态：

- `idle`：无目的地或等待下一次决策。
- `moving`：沿当前路径去目的地，周期性索敌。
- `chasing`：追踪当前目标。目标位置明显变化后才重新寻路。
- `attacking`：在攻击距离内等待冷却或释放攻击事件。
- `stunned` / `knockback`：暂停普通寻路，用击退速度移动；结束后重新进入移动或索敌。
- `dead`：已注销，不再参与逻辑。

指挥系统只设置战术目的地或目标，不直接替单位完成移动、寻路和攻击。单位自己的状态机决定何时索敌、追击、攻击或回到命令目的地。

## 移动和寻路

移动层只认导航网格，不模拟 Unity 物理碰撞：

- 树、地牢墙、沙漠柱子、基地、敌营、小屋和类似阻挡物应注册到 `NavigationGrid` 或世界导航阻挡物。
- `PathfindingSystem` 只负责返回路径。
- `MovementAgent` 只沿路径移动。
- 目的地不变、路径未阻断时，不重复寻路。
- 被击退时清掉旧路径；击退结束后由单位 AI 请求新路径。
- 普通移动不要重新做基地/小屋碰撞推开，也不要用运行时物理碰撞模拟可行走性。

## 索敌

索敌系统必须避免 O(N2)：

- `TargetingSystem` 每隔一段时间重建空间网格。
- 单位索敌时按自身索敌半径查询附近格子。
- 候选只做简单规则排序：阵营、距离、是否可攻击、守卫半径。
- 索敌阶段不跑 A*，不判断路径距离。
- 穿透投射物命中也使用局部查询，不扫描所有单位。

## 伤害与 Buff

`CombatSystem` 只做伤害流程，不做 AI、移动、索敌和攻击队列。

普通攻击契约：

- 近战攻击在释放点结算。
- 远程攻击由 `AttackSystem` 创建弹体，命中后结算。
- 武器耐久不足时单位不会普通攻击。
- 闪避只作用于普通攻击。
- Buff、DoT、法术和建筑效果按自己的伤害类型进入伤害流程。

Buff 实现使用事件钩子：

- `modifyAttack`：攻击结算前修改伤害、击退或伤害类型。
- `beforeDamage`：实际扣血前修改最终伤害，例如格挡、坚韧、保护。
- `afterDamage`：成功造成伤害后触发，例如火焰、吸血、汲取。
- `receiveDamage`：目标受到攻击后触发，例如荆棘反伤。
- `tick`：持续状态按计时器触发，例如燃烧、中毒、治疗。

属性数值使用 `AttributeSet`：

```txt
final = (base + sum(add modifiers)) * product(multiply modifiers)
```

火焰、毒、汲取、爆炸等事件效果不要硬塞成属性修改器。

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
  cost: 4,
  effect: {
    type: 'cast-spell',
    spellId: 'ice-nova'
  },
  artKey: 'spell-ice'
}
```

如果是已有类型：

- `kind: 'unit'`：补 `effect: { type: 'spawn-units', unitType, count }`。
- `kind: 'enchant'`：补 `effect: { type: 'apply-buff', buffId }`，并在 `BUFF_DEFINITIONS` 中注册。
- `kind: 'spell'`：补 `effect: { type: 'cast-spell', spellId }`，并在 `SpellSystem` 中注册处理器。
- `kind: 'building'`：补 `effect: { type: 'build-structure', buildingType }`，并在 `BuildingSystem` 中注册。

`CardSystem` 只负责输入、预览和目标选择，不写具体卡牌效果。

## 新增单位

1. 在 `UNIT_DEFINITIONS` 增加单位数值。
2. 在 `src/art/lowpoly.js` 增加模型工厂。
3. 在 `src/art/visualRegistry.js` 接入模型和动画语义。
4. 如需特殊攻击，优先接入 `AttackSystem` 或单位能力字段。
5. 如需持续效果，优先接入 `BuffSystem` 事件。

不要为了一个单位把目标选择、移动和伤害流程写回 `Game.js` 或 `CombatSystem.js`。

## 调试与验证

页面暴露了 `window.__VILLAGE_WAR_DEBUG__`：

- `snapshot()`：返回友军、敌军、波次、基地血量、选中单位和最后释放卡牌。
- `samplePixels()`：读取 WebGL 像素样本，用于确认画面不是空白。

常用验证：

```powershell
node --check src\systems\Game.js
npm run build
```

只改某个 JS 文件时，先对该文件跑 `node --check`。浏览器截图不稳定时，用 DOM、调试快照和像素样本替代。
