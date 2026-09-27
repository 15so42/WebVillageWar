// 统一背包界面、屏幕底部快捷栏与单位扇形菜单的结构回归。
//
// 这类断言守的是"需求里被明确点名的形态"，不是实现细节：
//   - 左下角不能再有符文背包按钮；
//   - B 打开基地背包、背包是 6x8=48 格；
//   - 数量在右下角、符文石等级在左上角；
//   - 材料不足的配方显示成灰的；
//   - 点单位后在其下方扇形展开圆形按钮；
//   - 快捷栏在**屏幕底部**、固定 9 格，并且能拖给单位 / 拖到地上建造；
//   - 背包右侧只剩「合成 / 资源」，科技与附魔台改由建筑的扇形菜单打开；
//   - 资源 tab 能加减优先级，并且真的改到采集需求上。
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const gameSource = read('src/systems/Game.js');
const uiSource = read('src/systems/BackpackUi.js');
const menuSource = read('src/systems/UnitActionMenu.js');
const cssSource = read('src/backpack.css');
const craftSource = read('src/systems/crafting.js');
const menuCss = read('src/unitActionMenu.css');
const mainSource = read('src/main.js');
const hotbarSource = read('src/systems/HotbarUi.js');
const hotbarCss = read('src/hotbar.css');
const facilitySource = read('src/systems/FacilityPanelUi.js');
const workSource = read('src/systems/WorkSystem.js');

const report = [];
function check(name, fn) {
  try {
    fn();
    report.push(`ok   ${name}`);
  } catch (error) {
    report.push(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

const keyDownSource = gameSource.match(/onKeyDown\(event\) \{([\s\S]*?)\n  onKeyUp\(event\)/)?.[1] ?? '';
assert.ok(keyDownSource, '必须能定位到 onKeyDown 实现');

// ---- 需求 2：左下角不再有符文背包按钮 ----

check('旧的符文背包面板与基地库存面板已经删除', () => {
  assert.equal(existsSync(new URL('../src/systems/RuneBackpackUi.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/systems/BaseStorageUi.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/runeBackpack.css', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/baseStorage.css', import.meta.url)), false);
});

check('没有任何地方再创建左下角的符文背包按钮', () => {
  assert.doesNotMatch(gameSource, /rune-backpack-button/, 'Game.js 里不得再有符文背包入口按钮');
  assert.doesNotMatch(uiSource, /rune-backpack-button/, '背包面板里不得再建符文背包按钮');
  // 新面板不提供常驻入口：B 键与"点单位"就是入口，少一个占屏幕的按钮。
  assert.doesNotMatch(uiSource, /ensureLauncher/, '统一背包面板不应再有常驻入口按钮');
});

check('E 与 B 各自打开单位背包与基地背包', () => {
  assert.match(keyDownSource, /key === ['"]e['"][\s\S]{0,200}?this\.toggleUnitBackpack\(\)/, 'E 必须开单位背包');
  assert.match(keyDownSource, /key === ['"]b['"][\s\S]{0,200}?this\.toggleBaseBackpack\(\)/, 'B 必须开基地背包');
  assert.doesNotMatch(keyDownSource, /key === ['"]i['"]/, 'I 键的旧基地库存入口必须删掉（B 已经承担）');
});

check('Esc 会关掉背包界面', () => {
  assert.match(keyDownSource, /key === ['"]escape['"][\s\S]{0,400}?this\.backpack\?\.isOpen\(\)[\s\S]{0,120}?this\.backpack\.close\(\)/);
});

// ---- 需求 2：背包是通用背包 ----

check('背包面板是同一个对象承担基地与单位两种视图', () => {
  assert.match(gameSource, /this\.backpack = new BackpackUi\(this/, '必须构造统一背包面板');
  assert.match(gameSource, /this\.baseStorage = this\.backpack/, 'baseStorage 只是旧名字的别名');
  assert.match(uiSource, /setMode\(mode\)/, '必须区分基地/单位两种视图');
  assert.match(uiSource, /openForUnit\(unit = null\)/, '必须支持打开某个单位的背包');
  assert.match(uiSource, /toggleBase\(\)/, '必须支持 B 键切换基地背包');
});

check('背包里的东西统一按"实例/堆叠"渲染，符文石只是其中一类物品', () => {
  assert.match(uiSource, /RUNE_STONE_ITEM_ID/, '符文石必须在同一个网格里渲染');
  assert.match(uiSource, /isManaStoneItem/, '魔力石必须和符文石共用同一个网格');
  assert.match(uiSource, /itemArtForSlot/, '所有物品共用一个取图入口');
});

check('魔力石会提高单位最大魔力（接在背包变化上）', () => {
  assert.match(gameSource, /refreshUnitManaCapacity\(unit\) \{/, '必须有重算最大魔力的方法');
  assert.match(gameSource, /effectiveManaCapacity\(base, bag\)/, '重算必须走纯逻辑模块');
  assert.match(gameSource, /onUnitBackpackChanged\(unit\) \{/, '背包变化必须有统一收尾入口');
  assert.match(gameSource, /this\.onUnitBackpackChanged\(unit\)/, '搬运/拾取必须调用统一收尾');
});

// ---- 需求 3：6x8 = 48 格 ----

check('基地背包是 6 行 × 8 列 = 48 格', () => {
  assert.match(uiSource, /const BASE_COLUMNS = 8;/, '列数必须是 8');
  assert.match(uiSource, /--backpack-columns/, '列数要写进 CSS 变量，网格才能按 8 列铺开');
  assert.match(gameSource, /baseInventorySlots: 48|ITEM_RULES\.baseInventorySlots/, '容量来自 ITEM_RULES');
});

check('背包网格是竖向铺开的方格', () => {
  assert.match(cssSource, /\.backpack-grid \{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(var\(--backpack-columns\), 54px\)/);
  assert.match(cssSource, /\.backpack-main \{[\s\S]*?grid-template-columns:\s*auto minmax\(340px, 1fr\)/, '左边背包、右边配方');
});

// ---- 需求 3：数量在右下角、等级在左上角 ----

check('数量压在图的右下角', () => {
  assert.match(uiSource, /backpack-slot-count/);
  assert.match(cssSource, /\.backpack-slot-count \{[\s\S]*?right:\s*3px;[\s\S]*?bottom:\s*1px;/);
});

check('符文石等级压在图的左上角，且不显示数量', () => {
  assert.match(uiSource, /backpack-slot-level/, '符文石必须有等级角标');
  assert.match(cssSource, /\.backpack-slot-level \{[\s\S]*?top:\s*1px;[\s\S]*?left:\s*3px;/);
  // 符文石不可堆叠：走 level 分支就不该再走 count 分支
  assert.match(uiSource, /if \(isStone\) \{[\s\S]{0,260}?backpack-slot-level[\s\S]{0,200}?\} else if \(\(slot\.count \?\? 1\) > 1\)/);
});

// ---- 需求 3：右侧配方网格 / 灰的表示材料不足 / 悬浮详情 / 点合成后跟着鼠标 ----

check('右侧是配方网格，材料不足显示成灰色', () => {
  assert.match(cssSource, /\.backpack-recipes \{[\s\S]*?display:\s*grid;/, '配方必须网格状显示');
  assert.match(cssSource, /\.backpack-recipe\.is-locked \{[\s\S]*?filter:\s*grayscale/, '材料不足必须灰显');
  assert.match(uiSource, /is-locked/, '不可合成时必须加 is-locked 类');
});

check('悬浮配方会显示详细信息', () => {
  assert.match(uiSource, /showRecipeDetail\(recipeId\)/);
  assert.match(uiSource, /part\.addEventListener\('pointerover'|root\.addEventListener\('pointerover'/);
  assert.match(uiSource, /材料：/, '详情里必须列出材料与缺口');
});

check('点击配方后产物跟鼠标走，再点空格放下', () => {
  assert.match(uiSource, /craftInto\(recipeId\)/, '点击配方必须走合成入口');
  assert.match(
    uiSource,
    /this\.cursor = \{[\s\S]{0,80}?\.\.\.lifted,[\s\S]{0,80}?from: \{ inventory, index: null \}/,
    '产物必须被拿到手上'
  );
  assert.match(uiSource, /backpack-cursor-ghost/, '手上那一叠必须有跟随光标的元素');
  assert.match(cssSource, /\.backpack-cursor-ghost \{[\s\S]*?position:\s*fixed;/, '光标元素必须固定在鼠标位置');
  // 必须按 instanceId 找出"刚做出来的那一件"，而不是新造一件
  assert.match(uiSource, /removeInstance\(created\.instanceId\)/);
});

check('手上拿着东西时关面板 / Esc 会放回原处，不吞物品', () => {
  assert.match(uiSource, /returnCursor\(\) \{/);
  assert.match(uiSource, /close\(\) \{[\s\S]{0,120}?this\.returnCursor\(\)/, 'close 必须先归还手上的东西');
});

// ---- 合成可撤销：产物还在手上时右键退回材料 ----

check('合成后右键可以取消并退回材料', () => {
  assert.match(uiSource, /onContextMenu\(event\)/, '必须处理右键');
  assert.match(uiSource, /cancelCraft\(\) \{/, '必须有撤销入口');
  // 撤销只认"刚做出来、还没放下"的那一叠：落格之后就不再记来源
  assert.match(uiSource, /craftedFrom/, '产物必须记住这次合成扣了什么材料');
  assert.match(uiSource, /this\.cursor\?\.craftedFrom/, '右键必须先判断这一叠是不是刚合成的');
  assert.match(gameSource, /refundCraftAtBase\(consumed\) \{/, 'Game 必须提供退款入口');
  assert.match(craftSource, /export function refundCraft\(inventory, consumed\)/, '退款规则必须是可单测的纯逻辑');
  // 撤销失败（材料放不回去）不许把产物也吞掉
  assert.match(uiSource, /if \(!result\.ok\) \{[\s\S]{0,300}?return null;/, '退款失败时必须原地保留产物');
});

check('右键遇到格子要让开，否则"右键放一个"会顺带撤掉整笔合成', () => {
  assert.match(
    uiSource,
    /onContextMenu\(event\) \{[\s\S]{0,400}?closest\?\.\('\[data-backpack-slot\]'\)\) return null;/,
    '格子上的右键是《我的世界》语义（拿一半/放一个），撤销必须跳过'
  );
});

// ---- 基地背包高度：缩小 20%，并把屏幕底部的快捷栏让出来 ----

check('基地背包面板高度缩小 20%', () => {
  assert.match(
    cssSource,
    /max-height:\s*min\(73\.6vh, 688px,/,
    '原来的 92vh / 860px 各缩 20%（73.6vh / 688px）'
  );
});

check('面板不许盖住屏幕底部的快捷栏', () => {
  assert.match(cssSource, /--backpack-hotbar-space:\s*96px/, '海岛关：快捷栏贴底，留出它那一条');
  assert.match(
    cssSource,
    /body:not\(\.is-survival-level\) \.backpack \{[\s\S]{0,80}?--backpack-hotbar-space:\s*346px/,
    '非海岛关：快捷栏被手牌顶到 268px，要让位整条'
  );
  assert.match(
    cssSource,
    /calc\(100vh - var\(--backpack-hotbar-space\) - 24px\)/,
    'max-height 必须带这条硬约束，屏幕矮的时候靠它兜底'
  );
  assert.match(cssSource, /\.backpack \{[\s\S]*?padding:\s*12px 0 var\(--backpack-hotbar-space\)/);
});

check('露出来的快捷栏还要能点到（背包遮罩是全屏的）', () => {
  assert.match(
    hotbarCss,
    /body:has\(\.backpack\.is-open\) \.item-hotbar \{[\s\S]{0,40}?z-index:\s*13;/,
    '背包打开时必须把快捷栏抬到背包遮罩（z-index 12）之上'
  );
});

// ---- 需求 6：快捷栏在屏幕下方，不在 B 面板里 ----

check('快捷栏是屏幕底部的常驻 9 格，已经从 B 面板里搬走', () => {
  // 面板里**一个都不能剩**：用户原文「不应该在 b 键面板内部」。
  assert.doesNotMatch(uiSource, /backpack-hotbar/, '背包面板里不得再渲染快捷栏');
  assert.doesNotMatch(cssSource, /\.backpack-hotbar/, '背包样式里不得再留快捷栏规则');
  // 屏幕底部那条必须是 9 个固定格子：槽位序号就是数字键 1..9 的含义。
  assert.match(hotbarSource, /export const HOTBAR_SLOT_COUNT = 9;/, '快捷栏必须是固定 9 格');
  assert.match(hotbarCss, /\.item-hotbar \{[\s\S]*?position:\s*fixed;[\s\S]*?bottom:\s*14px;/, '快捷栏必须贴在屏幕底部');
  assert.match(hotbarCss, /body:not\(\.is-survival-level\) \.item-hotbar \{[\s\S]*?bottom:\s*268px;/, '旧关卡要避开手牌区');
  assert.match(hotbarSource, /root\.id = 'item-hotbar'/, '快捷栏根节点必须挂在 body 上');
});

check('快捷栏里的东西能拖给单位，也能拖到地上建造', () => {
  assert.match(hotbarSource, /dropHotbarItemAt/, '快捷栏必须把拖拽落点交回 Game 判定');
  assert.match(hotbarSource, /pickUnitFromList/, '拖到单位身上必须有落点判定');
  assert.match(hotbarSource, /item-hotbar-drag-ghost/, '拖拽必须有跟手的图标');
  assert.match(hotbarCss, /\.item-hotbar-drag-ghost \{[\s\S]*?position:\s*fixed;/, '跟手图标必须固定在指针位置');
  assert.match(gameSource, /dropHotbarItemAt\(index, clientX, clientY\) \{/, 'Game 必须有落点处理入口');
  assert.match(gameSource, /giveItemToUnit\(itemId, unit, \{ source = null \} = \{\}\) \{/, '必须有"把物品交给单位"的入口');
  assert.match(gameSource, /entry\.useKind === ITEM_USE\.give && unit/, '装备掉在单位身上才算交给他');
  assert.match(gameSource, /if \(entry\.useKind === ITEM_USE\.place\) \{/, '建筑掉在地上才进入放置');
});

// ---- 快捷栏是一个容器（和基地背包同类），不是基地库存的投影 ----

check('快捷栏是 9 格的真容器，和基地背包同属 Inventory', () => {
  assert.match(gameSource, /this\.hotbarInventory = new Inventory\(\{ id: 'hotbar', capacity: HOTBAR_SLOT_COUNT \}\)/,
    '快捷栏必须是一个真正的 Inventory');
  assert.match(gameSource, /const inventory = this\.hotbarInventory;[\s\S]{0,120}?inventory\.slots\.slice\(0, HOTBAR_SLOT_COUNT\)\.map/,
    '快捷栏内容必须从它自己的格子读，而不是从基地库存推导');
  // 老实现是"从 baseInventory 里挑出可放置 / 可交给单位的，排序成 9 格"。
  // 那套一旦回来，快捷栏就又没有落点了（拖进去的东西无处存放）。
  assert.doesNotMatch(gameSource, /const totals = new Map\(\)/, '不得再按"基地库存投影"的方式生成快捷栏');
  assert.match(gameSource, /resolveItemSource\(itemId, source = null\)/,
    '放置 / 交给单位都必须能指定"从哪一格出"');
  assert.match(gameSource, /removeAt\(source\.slotIndex, 1\)|removeAt\(picked\.slotIndex, 1\)/,
    '按格扣除：扣错格子等于凭空换了一件');
});

check('用法分发只有一处：place / consume / give', () => {
  assert.match(read('src/systems/items.js'), /export function itemUseKind\(itemId\)/,
    '用途判定必须是可单测的纯逻辑');
  assert.match(gameSource, /useHotbarSlot\(index\) \{/, '使用入口必须收敛成一个');
  assert.match(gameSource, /activateHotbarSlot\(index\) \{[\s\S]{0,120}?return this\.useHotbarSlot\(index\);/,
    '旧名字要指回同一处实现，不能各写一套');
  assert.match(gameSource, /useConsumable\(itemId, \{ source = null \} = \{\}\) \{/,
    '消耗品的"用"必须只有一个实现（点与拖都走它）');
  // 数字键、点击、拖出去三条路径都不得绕过分发
  assert.doesNotMatch(gameSource, /if \(entry\.placeable\) \{\s*const started = this\.beginPlacement\(entry\.itemId\);/);
});

check('背包开着 = 搬运容器，关着 = 使用', () => {
  assert.match(hotbarSource, /isTransferMode\(\)[\s\S]{0,200}?backpack\?\.isOpen/,
    '模式必须由"背包面板开没开"决定');
  assert.match(hotbarSource, /backpack\?\.handleSlotClick\?\.\(index, \{[\s\S]{0,200}?HOTBAR_CONTAINER_KEY/,
    '搬运模式下点快捷栏格 = 交付给背包光标');
  assert.match(hotbarSource, /if \(this\.isTransferMode\(\)\) return;[\s\S]{0,160}?activateHotbarSlot/,
    '搬运模式下的点击绝不能走使用（否则"放进快捷栏"会顺手用掉）');
  assert.match(uiSource, /export const HOTBAR_CONTAINER_KEY = 'hotbar';/);
  assert.match(uiSource, /if \(key === HOTBAR_CONTAINER_KEY\) return this\.game\?\.hotbarInventory/,
    '背包光标必须把快捷栏当容器，这就是"两边互相拖"的接口');
  assert.match(hotbarSource, /is-transfer-mode/, '界面必须能看出当前是搬运模式');
});

check('拖出去松手才是使用，拖回自己身上算反悔', () => {
  assert.match(hotbarSource, /isPointerOverSelf\(event\.clientX, event\.clientY\)/,
    '松手落在快捷栏自己身上必须取消，否则会把建筑建到栏后面、或直接吃掉消耗品');
  assert.match(gameSource, /if \(entry\.useKind === ITEM_USE\.consume\) \{[\s\S]{0,300}?target: 'use'/,
    '消耗品拖出去松手就是用掉');
  assert.match(gameSource, /if \(this\.isPlacing\(\)\) \{\s*this\.cancelPlacement\(\);/,
    '放置模式下右键必须是取消');
});

// ---- 需求 7 前半条：科技 / 附魔台不再是背包的标签页 ----

check('背包右侧只保留合成，资源需求路线已去掉', () => {
  assert.doesNotMatch(uiSource, /data-backpack-tab="tech"/, '科技标签页必须从背包移除');
  assert.doesNotMatch(uiSource, /data-backpack-tab="enchant"/, '附魔台标签页必须从背包移除');
  assert.doesNotMatch(uiSource, /data-backpack-tab="resource"/, '资源需求标签页必须从背包移除');
  assert.doesNotMatch(uiSource, /renderTechs|renderEnchants/, '对应的渲染函数必须删除');
  assert.match(uiSource, /data-backpack-tab="craft"/, '合成标签页还在');
});

check('科技与附魔台改由建筑的扇形菜单打开', () => {
  assert.match(menuSource, /facilityPanelFor/, '扇形菜单必须按建筑类型决定入口');
  assert.match(menuSource, /id: 'facility'/, '必须有设施入口动作');
  assert.match(menuSource, /facilityPanel\?\.toggleForUnit/, '点击必须打开设施界面');
  assert.match(facilitySource, /FACILITY_PANELS/, '必须有"建筑 → 界面"的映射表');
  assert.match(facilitySource, /researchStation:/, '科研站必须有界面');
  assert.match(facilitySource, /enchantTable:/, '附魔台必须有界面');
  assert.match(facilitySource, /data-research-tech/, '科技界面必须能点研究');
  assert.match(facilitySource, /data-enchant-rune/, '附魔台界面必须能点制作');
  assert.match(gameSource, /new FacilityPanelUi\(this\)/, 'Game 必须持有设施界面');
});

// ---- 需求 7 后半条：资源 tab 的优先级 ----

check('采集不再走背包里的资源需求路线', () => {
  assert.doesNotMatch(uiSource, /data-backpack-tab="resource"/);
  assert.match(gameSource, /beginResourceBoxSelect\(/, '框选必须能带上优先级');
  assert.match(gameSource, /markNodes\?\.\(/, '框选结果必须交给作业系统');
  assert.match(workSource, /markedNodes/, '作业系统必须记住框选过的资源点');
});

// ---- 需求 3：底部快捷栏 ----

// ---- 需求 3：右侧列出已解锁的合成配方 ----

check('配方按"见过材料"解锁', () => {
  assert.match(uiSource, /seenItemIds/, '必须有"见过"集合');
  assert.match(uiSource, /visibleRecipes\(\) \{/, '必须有解锁过滤');
  assert.match(uiSource, /return inputs\.some\(\(entry\) => this\.seenItemIds\.has\(entry\.itemId\)\)/, '拿到任一材料即解锁相关配方');
});

// ---- 需求 1：快捷栏上方的单位操作条 ----

check('单选单位后在快捷栏上方展开圆形图标 + 文字', () => {
  assert.match(menuSource, /unit-action-icon[\s\S]{0,200}?unit-action-label/, '每个按钮是圆形图标 + 下方文字');
  assert.match(menuCss, /\.unit-action-button \{[\s\S]*?border-radius:\s*50%/, '按钮必须是圆形');
  assert.match(menuCss, /\.unit-action-menu[\s\S]*?bottom:\s*92px/, '菜单必须固定在快捷栏上方');
  assert.doesNotMatch(menuSource, /MENU_RADIUS/, '不再使用脚下扇形排布');
});

check('操作条只在单选时出现', () => {
  assert.match(menuSource, /selectedUnits\?\.length === 1/, '多选时不展开菜单');
  assert.match(gameSource, /this\.unitActionMenu\?\.sync\?\.\(\)/, '每帧必须同步操作条');
});

check('菜单里有背包与招募两个动作', () => {
  assert.match(menuSource, /id: 'backpack'/, '必须有背包动作');
  assert.match(menuSource, /id: 'recruit'/, '必须有招募动作（需求 1 点名的两项）');
  assert.match(menuSource, /recruitStatusFor\?\.\(unit\)/, '招募是否可用必须由 Game 判定');
});

// ---- 样式入口 ----

check('main.js 引入了新样式、不再引用旧面板样式', () => {
  assert.match(mainSource, /import '\.\/backpack\.css';/);
  assert.match(mainSource, /import '\.\/unitActionMenu\.css';/);
  assert.doesNotMatch(mainSource, /runeBackpack\.css|baseStorage\.css/);
});

console.log(report.join('\n'));
const failed = report.filter((line) => line.startsWith('FAIL')).length;
console.log(`\n背包界面与扇形菜单：${report.length - failed}/${report.length} 通过`);
