# 玩法效果扩展架构

本项目后续会持续增加单位、卡牌、附魔、Buff、法术和特殊能力。原则是：新增内容优先写成数据和小处理器，避免把所有规则堆进 `CombatSystem` 或 `CardSystem`。

## 核心边界

- `CardSystem`：只负责拖拽输入、目标选择、预览和冷却显示。
- `CardEffectSystem`：把卡牌的 `effect.type` 分发给对应系统。
- `SpellSystem`：承接主动法术，例如陨石、冰环、治疗雨。
- `BuffSystem`：承接附魔、持续状态、光环、护盾、燃烧、中毒等。
- `AttributeSet`：实体属性容器。每个属性由基础值、加法修改器列表、乘法修改器列表计算最终值。
- `ModifierSystem`：统一读取单位和基地的最终数值，例如移速、攻速、伤害、击退、耐久消耗、基地回复范围。
- `CombatSystem`：保留攻击流程、投射物、移动、索敌和死亡清理，不写具体附魔名字。

## 卡牌数据

卡牌通过 `effect` 声明玩法效果：

```js
{
  id: 'fire-enchant',
  name: '火焰附加',
  kind: 'enchant',
  target: 'friendly-unit',
  effect: {
    type: 'apply-buff',
    buffId: 'fire'
  }
}
```

当前支持的效果类型：

- `spawn-units`：召唤单位。
- `cast-spell`：释放法术。
- `apply-buff`：给单位添加 Buff 或附魔。

新增卡牌时，如果只是换单位、换数量、换 Buff，通常只改 `gameData.js`。只有出现新交互类型时才扩展 `CardEffectSystem`。

## Buff 数据

Buff 统一注册在 `BUFF_DEFINITIONS`。附魔是 `category: 'enchantment'`，持续状态是 `category: 'status'`。

```js
poison: {
  name: '中毒',
  category: 'status',
  color: '#78b85a',
  duration: 4,
  tickInterval: 0.5,
  damagePerSecond: 1.8,
  effects: [
    {
      event: 'tick',
      op: 'damageOverTime'
    }
  ]
}
```

常用事件：

- `modifyAttack`：攻击造成伤害前，适合加伤害、加击退、标记真实伤害。
- `afterDamage`：攻击成功后，适合点燃、吸血、连锁闪电。
- `receiveDamage`：目标受到攻击后，适合荆棘反伤、格挡、护盾。
- `tick`：持续状态按间隔触发，适合燃烧、中毒、持续治疗。

常用操作：

- `addDamage`：给本次攻击增加伤害。
- `addDamageType`：给本次攻击追加伤害类型。目前只使用 `true` 表示真实伤害；未标记就是普通伤害。
- `applyBuff`：给目标添加另一个 Buff。
- `reflectDamage`：向攻击者反弹伤害。
- `damageOverTime`：按 tick 造成持续伤害。

当前伤害类型只分两种：

- 普通伤害：默认类型，橙色飘字黑色描边。
- 真实伤害：`damageTypes` 包含 `true` 时使用，白色飘字黑色描边。

## 属性修改器

需要影响移速、攻速、伤害、击退、耐久、基地血量或回复范围时，优先声明 `modifiers`。每个属性按以下公式计算：

```txt
final = (base + sum(add modifiers)) * product(multiply modifiers)
```

Buff 可以声明加法修改器：

```js
sharpness: {
  name: '锋锐',
  category: 'enchantment',
  level: 2,
  modifiers: [
    {
      stat: 'attackDamage',
      type: 'add',
      amountPerLevel: 1.5
    }
  ]
}
```

火焰附魔不使用攻击力修改器。它只在命中后施加燃烧，燃烧伤害用效果参数随附魔等级计算：

```js
fire: {
  name: '火焰附加',
  category: 'enchantment',
  level: 1,
  effects: [
    {
      event: 'afterDamage',
      op: 'applyBuff',
      buffId: 'burning',
      duration: 3.4,
      damagePerSecondPerLevel: 2.4
    }
  ]
}
```

也可以声明百分比修改器：

```js
frostSlow: {
  name: '寒霜减速',
  category: 'status',
  duration: 3,
  modifiers: [
    {
      stat: 'moveSpeed',
      type: 'multiply',
      factor: 0.55
    }
  ]
}
```

根据等级增加百分比攻击力：

```js
warSong: {
  name: '战歌',
  category: 'enchantment',
  level: 3,
  modifiers: [
    {
      stat: 'attackDamage',
      type: 'multiply',
      percentPerLevel: 0.08
    }
  ]
}
```

当前可修正的 stat：

- `moveSpeed`
- `maxHealth`
- `attackRate`
- `attackRange`
- `attackDamage`
- `knockback`
- `aggroRange`
- `projectileSpeed`
- `maxDurability`
- `durabilityCost`
- `collisionRadius`
- `attackRadius`
- `recoveryRadius`
- `healthPerSecond`
- `durabilityPerSecond`

其中 `collisionRadius`、`attackRadius`、`recoveryRadius`、`healthPerSecond`、`durabilityPerSecond` 主要用于基地和建筑。

## 新增内容流程

新增召唤卡：

1. 在 `UNIT_DEFINITIONS` 添加单位。
2. 在 `visualRegistry` 接入模型。
3. 在 `CARD_DEFINITIONS` 添加 `effect: { type: 'spawn-units' }`。

新增附魔卡：

1. 在 `BUFF_DEFINITIONS` 添加 Buff。
2. 在 `CARD_DEFINITIONS` 添加 `effect: { type: 'apply-buff' }`。
3. 如果需要新操作，再扩展 `BuffSystem.applyEffect()`。

新增法术卡：

1. 在 `CARD_DEFINITIONS` 添加 `effect: { type: 'cast-spell', spellId }`。
2. 在 `SpellSystem.handlers` 注册处理器。
3. 表现放在 `EffectsSystem`，伤害仍通过 `CombatSystem` 或 `BuffSystem` 结算。

## 维护规则

- 不要在 `CardSystem` 里写具体卡牌 ID 判断。
- 不要在 `CombatSystem.applyAttack()` 里继续堆具体附魔 ID 判断。
- 视觉特效只负责表现，不负责决定伤害。
- 伤害、击退、状态添加都通过明确系统入口完成。
- 新机制先做最小 handler，再补数据；不要为了一个特例改穿多个系统。
