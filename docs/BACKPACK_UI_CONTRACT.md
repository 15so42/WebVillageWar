# 统一背包界面契约（v0.2.201）

本轮把「符文背包」和「基地库存/合成」两个面板合并成**一个** `BackpackUi`。
这份文档是给后续改验收脚本与继续开发用的**接口事实**——写脚本时照这里抄，
不要照着旧面板的 `[data-storage-*]` / `.rune-backpack-*` 选择器改。

> v0.2.200 的三处**结构变更**（用户本轮需求 6 / 7a / 7b），先看这里再看下面的旧章节：
> 1. **快捷栏搬出面板**，改成常驻屏幕底部的 `#item-hotbar`（固定 9 格 + 拖拽）；
> 2. **科技与附魔台搬出面板**，改成科研站 / 附魔台的扇形菜单打开的 `#facility-panel`；
> 3. 右侧新增 **资源优先级 tab**（`craft` + `resource` 两个标签页）。
> 第 3 节的选择器表已按新形态更新，并列出"已经不存在的东西"。

## 1. 为什么合并

需求原文：「背包就是背包，不止可以放符文，还可以放其他东西。比如魔力石」。
所以数据层也一起改了：**符文石不再是独立的位置表，它就是库存里的一件物品**。

| 旧模型 | 新模型 |
|---|---|
| `RuneStoneSystem.stones[i].location = {kind:'base'\|'unit'}` | 石头放在 `game.baseInventory` / `game.itemBagFor(unit)` 的某个格子里 |
| 符文容量 `unitRuneCapacity()` / `baseRuneCapacity()` | 就是背包格数（基地 48、傀儡 16、战斗单位 10） |
| 两个面板：`#rune-backpack` + `#base-storage` | 一个面板：`#backpack` |

石头物品的形状：

```js
{ itemId: 'runeStone', count: 1, instanceId: '<石头 id>', data: { enchantmentId, level, mana, paidEnergy, growth, ... } }
```

- `instanceId` 就是石头自己的 id（沿用 `rune-<n>`），掉落/搬运的是同一块，不会复制。
- 格子的 `data` 是**投影**，`RuneStoneSystem.stones` Map 是等级/魔力的**权威**；
  改动会由 `writeThrough()` 写回格子。

## 2. 对象与 API

`game.backpack` 是面板实例；`game.baseStorage` 只是**同一个对象的别名**（旧脚本兼容）。
旧的 `game.runeBackpack` 与 `RuneBackpackUi.js` / `BaseStorageUi.js` / `runeBackpack.css` /
`baseStorage.css` **已删除**。

```js
game.backpack.isOpen()            // 面板是否开着
game.backpack.mode                // 'base' | 'unit'
game.backpack.unit                // unit 视图下的单位，否则 null
game.backpack.cursor              // 手上拿着的那一叠（null = 空手）
game.backpack.activeTab           // 'craft' | 'tech' | 'enchant'
game.backpack.lastSignature       // 置 '' 可强制下次 refresh 重建 DOM
game.backpack.open()              // = openBase()
game.backpack.openBase()
game.backpack.openForUnit(unit)   // 打开该单位的背包（单位必须 alive 且有背包）
game.backpack.close()             // 会先把手上的东西放回原处
game.backpack.closeIfUnit(unit)
game.backpack.toggle() / toggleBase()
game.backpack.setTab(id)          // 'craft' | 'tech' | 'enchant'；旧名 'items'/'unit' 映射到 'craft'
game.backpack.markDirty()         // 清签名 + 立即重画
game.backpack.refresh()
```

**脚本驱动交互请直接用这两个方法**（它们就是真实鼠标走的那段代码，
不需要合成 pointer 事件，也就不会受面板布局/坐标影响）：

```js
// 点某一块网格里的第 index 格。不传 container 就是主容器
// （单位视图 = 单位背包，基地视图 = 基地背包）。
game.backpack.handleSlotClick(index, { right: false, container: 'base' })
game.backpack.handleSlotClick(index, { right: true,  container: 'unit' })
game.backpack.craftInto(recipeId)                       // 合成，产物上手
game.backpack.equipWeapon(slotIndex, 'unit')            // 单位视图里装备武器
game.backpack.beginPlacement(slotIndex, 'base')         // 基地视图里放置建筑
game.backpack.returnCursor()                            // 把手上的东西放回去
game.backpack.containerEntries()                        // [{key,inventory,title,location,unit,columns}]
game.backpack.containerFor('base' | 'unit')             // 取某一块的库存
```

**跨容器搬运就是"拿起 + 放到另一块"**：`handleSlotClick(a, {container:'base'})`
再 `handleSlotClick(b, {container:'unit'})`。想验真实鼠标路径就直接对格子派发
`new PointerEvent('pointerdown', { bubbles: true, button: 0 })`——
`onPointerDown` 会从 `data-backpack-container` 读出该格属于哪一块。
完整示例见 `scripts/verify-backpack-transfer.mjs`。

## 3. DOM 选择器

根：`#backpack`（class `backpack`，`is-base-view` / `is-unit-view`，`is-open`）
面板：`#backpack .backpack-panel`，主体：`.backpack-main`

**网格是多块的**：基地视图 1 块（`base`），单位视图 **2 块**（`unit` 在前、`base` 在后）。
两块同时可见是"物品能互相搬"的前提——只画一块的话，两个容器之间没有任何可点的落点，
玩家能合成能捡能背，却没办法把基地里那把手斧交给傀儡。

| 用途 | 选择器 |
|---|---|
| 网格容器 | `[data-backpack-grids]` |
| 一块网格 | `[data-backpack-grid-block="unit\|base"]` |
| 网格本体 | `[data-backpack-grid="unit\|base"]` |
| 网格标题 / 计数 | `[data-backpack-grid-title="unit\|base"]` / `[data-backpack-grid-count="unit\|base"]`（不带值时取第一块 = 单位视图里的单位背包） |
| 一个格子 | `[data-backpack-slot="N"]`（0 起）+ `[data-backpack-container="unit\|base"]` |
| 格子状态类 | `.backpack-slot.is-empty` / `.is-filled` / `.is-rune` / `.is-inactive` / `.is-mana` |
| 符文石等级（左上角） | `.backpack-slot-level` |
| 数量（右下角） | `.backpack-slot-count`（数量 > 1 才出现） |
| 格内「装备」（只在 unit 块） | `[data-backpack-equip="N"]` |
| 基地格直接使用 | 在 base 格上 **Ctrl+左键**（与快捷栏同一套 `itemUseKind`） |
| 提示行 | `[data-backpack-hint]` |
| 右侧标签 | `[data-backpack-tab="craft\|resource"]` |
| 合成网格 | `[data-backpack-recipes]` |
| 一个配方 | `[data-backpack-recipe="<recipeId>"]`，类 `.backpack-recipe.is-craftable` / `.is-locked` |
| 配方材料块 | `.backpack-input`，缺口 `.backpack-input.is-missing`，数量 `.backpack-input-have` |
| 阻塞原因 | `.backpack-blocked` |
| 悬浮详情 | `[data-backpack-detail]` |
| 资源优先级列表 | `[data-backpack-resources]` / `[data-backpack-resource-count]` |
| 资源行 | `[data-resource-row="<itemId>"]` + `[data-resource-kind="resource\|craft"]` |
| 优先级加减 | `[data-priority-item="<itemId>"][data-priority-delta="-1\|1"]`，当前值 `[data-priority-value]` |
| 关闭 | `[data-backpack-close]` |
| 销毁手上符文石 | `[data-backpack-trash]` |
| 收回失去落点的石头 | `[data-backpack-recover-stranded]` |
| 反馈条 | `[data-backpack-feedback]`（错误时带 `is-error`） |
| 跟着鼠标的产物 | `.backpack-cursor-ghost`（挂在 `document.body`） |

**屏幕底部的快捷栏**（v0.2.200 起**不在面板里**了，改由 `HotbarUi` 常驻屏幕底部）：

根：`#item-hotbar`（`hidden` 恒为假；`.is-dragging` 表示正在拖拽）
| 用途 | 选择器 |
|---|---|
| 一格（固定 9 格，含空槽） | `[data-hotbar-index="0..8"]`，空槽带 `.is-empty` |
| 槽内物品 / 类别 | `[data-item-id]` / `[data-hotbar-kind="placeable\|givable"]` |
| 数量 | `.item-hotbar-count` |
| 正在放置这一件 | `.is-active` |
| 拖拽落点提示 | 根上的 `data-drop-target="<单位名>"` |
| 跟手的拖拽图标 | `.item-hotbar-drag-ghost`（挂在 `document.body`） |

**科研站 / 附魔台的独立界面**（v0.2.200 起从建筑的扇形菜单打开，不在背包里）：

根：`#facility-panel`（`data-facility="researchStation\|enchantTable"`，`.is-open`）
科技卡片 `[data-tech-id]` + `[data-research-tech]`；附魔卡片 `[data-enchant-id]` + `[data-enchant-rune]`；
标题 `[data-facility-title]`、计数 `[data-facility-count]`、反馈 `[data-facility-feedback]`、关闭 `[data-facility-close]`。

**已经不存在的东西**（脚本里再出现就是错的）：
`#rune-backpack`、`#base-storage`、`#rune-backpack-button`、`#rune-backpack-open`、
`#base-storage-button`、`[data-storage-*]`、`.rune-backpack-*`、`.base-storage-*`、
`[data-backpack-hotbar-slot]`、`.backpack-hotbar*`、
`[data-backpack-tab="tech"]`、`[data-backpack-tab="enchant"]`、
`[data-backpack-techs]`、`[data-backpack-enchants]`。

## 4. 交互语义（《我的世界》）

- 左键点有东西的格子 → 整叠拿到手上（`ui.cursor`），该格立刻变空。
- 手上有东西时左键点空格 → 落下；点同类且没满 → 合并；点异类 → 交换。
  **点的是哪一块网格由格子自己决定**（`data-backpack-container`），
  所以"从基地拿起、往单位放下"天然成立，不需要额外的搬运按钮。
- 右键点整叠 → 拿一半；手上有东西时右键点空格/同类 → 放一个。
- 关面板、按 Esc、或 `destroy()` 时手上有东西 → 自动放回**原格 → 原容器 → 基地背包**，
  三级都放不下就继续留在手上并在反馈条里说明。**任何路径都不销毁物品。**
- 符文石不可堆叠：一格一块，所以只有它显示左上角等级、不显示数量。
- 每次搬运都会走 `BackpackUi.syncUnitState()`：单位视图下重算该单位的附魔与最大魔力，
  所以石头搬进来立刻生效、搬回基地立刻失效，原持有者的加成立刻撤销。
  `scripts/verify-backpack-transfer.mjs` 对这条逐项断言（含魔力石 60 → 75 → 60）。

## 5. 配方解锁（需求第 3 条）

「基地背包获得任意物品后就解锁相关配方」的落地：
`BackpackUi.seenItemIds` 记录**曾经出现在基地背包里**的物品 id；
一条配方只要它的**任意一种材料**被见过，就会出现在右侧合成网格里。

推论（写脚本时必须注意）：
- 想让某个配方出现，先 `game.baseInventory.add(<该配方任一材料>, n)`，再 `ui.refresh()`。
- 科技锁着的配方仍然由 `Game.recipeStatus()` 直接剔除（研究前不出现在列表里）。
- 材料不足的配方**在列表里显示成灰的**（`.backpack-recipe.is-locked`），不是隐藏。

## 6. 魔力石（需求第 2 条）

- 物品：`itemId: 'manaStone'`，`kind: 'instance'`、`stackLimit: 1`（不可堆叠、每块占一格）。
- 效果：每块 `+15` 最大活动魔力（`ITEM_DEFINITIONS.manaStone.manaBonus`），多块**线性叠加**。
- 生效条件：放在**单位背包**里。
- 实现：`Game.refreshUnitManaCapacity(unit)` = `effectiveManaCapacity(unit.baseManaCapacity, bag)`。
  基础值单独记在 `unit.baseManaCapacity`（傀儡 60、设施配方各自的 `manaCapacity`），
  所以反复刷新不会把加成越堆越高。
- 任何改变背包的入口都必须调 `Game.onUnitBackpackChanged(unit)`
  （重算最大魔力 + 通知作业系统缓存失效 + 让背包面板变脏）。

## 7. 单位扇形菜单（需求第 1 条）

`game.unitActionMenu`（`src/systems/UnitActionMenu.js`）：

- 只在**恰好选中一个**单位时出现（多选不出现）。
- 位置：`projectWorldUi(unit.position, 0.12)` 投影到屏幕，扇形向下展开。
  **每帧同步**（`Game.syncUnitActionMenu()`）；挂在 `updateHud()` 里会被它的
  0.1s 节流压成 10Hz，表现就是菜单"掉队再追上去"（v0.2.200 修的就是这个）。
- 按钮：`[data-unit-action="backpack"|"recruit"|"stop"|"facility"]`，圆形图标 + 下方文字。
- 招募的可用性由 `Game.recruitStatusFor(unit)` 判定（缺招募令时按钮禁用）。
- **建筑现在也出现菜单**，但只有"有界面"的那两种：科研站（`facility` → 科技）、
  附魔台（`facility` → 附魔石）。其它建筑（熔炉、箭塔…）不给菜单——
  弹一个空菜单比不弹更让人困惑。

## 8. 资源优先级（需求第 8 条）

纯逻辑在 `src/systems/resourcePriority.js`，界面在 `BackpackUi.renderResources`，
游戏侧入口是 `Game.resourcePriorityRows()` / `Game.setResourcePriority(itemId, delta)` /
`Game.refreshWorkDemands()`。

- 行来源：`gatherableResources()`（可采集）+ `RECIPES` 的每个产物（可合成）。
- **合成类只折算成材料**，不派"去合成"的活：`gatherableInputsFor()` 递归展开，
  并且**同时查 `RECIPES` 与 `PRODUCTION_RECIPES`**——只查合成表的话
  「魔力石」会被算成"只要铁"（木炭来自熔炉，合成表里找不到它）。
- 折算按配方占比分摊：魔力石 = 4 铁 + 6 木炭 → 木炭按「4 木材 → 2 木炭」回折成 12 木材，
  所以木材拿到的权重要高于铁。
- 输出是 `WorkSystem.setDemands()` 吃的需求表 `{id, resource, weight, targetStock, enabled}`；
  优先级 `<= 0` 不派活（`-1` = 禁止）。**默认值只在"没被点过"的项上生效**
  （木 3 / 石 2 / 食 1），否则开局只会采木材。
- 每次改动都立刻重算需求：只在"下一帧顺便读一下"是不行的，
  玩家点完「＋」要马上看到傀儡改去采那种资源。
