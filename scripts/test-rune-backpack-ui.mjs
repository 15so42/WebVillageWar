// 符文背包交互回归测试（对应需求 1：E 需要单位、死亡关背包；需求 2：B + 垃圾桶 + 等级加价；
// 需求 3：石头用对应附魔图片、等级压在图片左上角、拖拽时物品跟着光标走）：
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gameSource = readFileSync(new URL('../src/systems/Game.js', import.meta.url), 'utf8');
const uiSource = readFileSync(new URL('../src/systems/RuneBackpackUi.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/runeBackpack.css', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

const keyDownSource = gameSource.match(/onKeyDown\(event\) \{([\s\S]*?)\n  onKeyUp\(event\)/)?.[1] ?? '';
assert.ok(keyDownSource, '必须能定位到 onKeyDown 实现');

// ---- 1) E：必须先有单位，否则不打开 ----
assert.match(
  keyDownSource,
  /key === ['"]e['"][\s\S]{0,220}?toggleUnitRuneBackpack\(\)/,
  'E 键必须为单位打开符文背包'
);
assert.match(
  gameSource,
  /hoveredFriendlyUnitForBackpack\(\) \{[\s\S]*?pickUnitFromList\(candidates/,
  'E 键必须优先给鼠标指向的己方单位开背包'
);
assert.match(
  gameSource,
  /if \(!unit\) \{[\s\S]{0,200}?setHintOnce/,
  '没有指向/没有选中单位时不得打开背包，只能给提示'
);
assert.match(
  gameSource,
  /把鼠标对准己方单位，或先选中一个单位，再按 E 打开它的符文背包。/,
  '必须明确告诉玩家 E 需要先指向或选中单位'
);
assert.match(
  uiSource,
  /openForUnit\(unit = null\) \{[\s\S]{0,120}?if \(!this\.available \|\| !unit \|\| unit\.alive === false\) return false;/,
  'openForUnit 必须拒绝空单位与已阵亡单位'
);
assert.match(
  gameSource,
  /const hovered = this\.hoveredFriendlyUnitForBackpack\(\);[\s\S]{0,80}?const selected = this\.selectedUnit;/,
  '鼠标没指向单位时要退回当前选中单位'
);

// ---- 2) 单位阵亡时关闭对应背包 ----
assert.match(
  gameSource,
  /this\.runeStones\?\.handleUnitDeath\?\.\(unit\);[\s\S]{0,200}?this\.runeBackpack\?\.closeIfUnit\?\.\(unit\);/,
  '玩家单位阵亡时必须关闭它的符文背包'
);
assert.match(
  uiSource,
  /closeIfUnit\(unit\) \{[\s\S]*?String\(current\.id\) !== String\(unit\.id\)[\s\S]*?this\.close\(\)/,
  'closeIfUnit 必须按单位身份匹配后关闭'
);
assert.match(
  uiSource,
  /if \(hasUnit && unit\.alive === false\) \{[\s\S]{0,80}?this\.close\(\);/,
  '刷新时发现单位已阵亡也必须兜底关闭'
);

// ---- 3) B：基地背包（居中） + Esc 一起关 ----
assert.match(
  keyDownSource,
  /key === ['"]b['"][\s\S]{0,220}?toggleBaseRuneBackpack\(\)/,
  'B 键必须打开基地背包'
);
assert.match(
  cssSource,
  /\.rune-backpack\.is-base-view \{[\s\S]*?left:\s*50%;[\s\S]*?translate\(-50%, -50%\)/,
  '基地背包必须居中显示'
);
assert.match(
  keyDownSource,
  /key === ['"]escape['"][\s\S]{0,200}?this\.runeBackpack\?\.isOpen\(\)[\s\S]{0,120}?this\.runeBackpack\.close\(\)/,
  'Esc 必须关闭整个符文背包面板'
);
assert.match(uiSource, /两个背包一起关闭，不提供单独关闭其中一个的入口/);
assert.equal(
  (uiSource.match(/<button[^>]*data-rune-close/g) ?? []).length,
  1,
  '只允许一个关闭入口，保证两个背包一起关闭'
);

// ---- 4) 背包名称左右排列 + 一格一块 ----
assert.match(uiSource, /<span>单位背包<\/span>/, '单位背包要有名称');
assert.match(uiSource, /<span>基地背包<\/span>/, '基地背包要有名称');
assert.match(
  cssSource,
  /\.rune-backpack-columns \{\s*display:\s*grid;\s*grid-template-columns:\s*1fr 1fr;/,
  '单位与基地背包必须左右并排'
);
assert.match(
  cssSource,
  /\.rune-backpack-slots \{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(auto-fill, 68px\)/,
  '背包用固定格子网格，一格只放一块石头'
);
assert.match(uiSource, /slot\.className = 'rune-backpack-slot';/, '空格子只做占位，没有堆叠逻辑');

// ---- 5) 单位详情里的背包按钮 ----
assert.match(uiSource, /querySelector\('#selected-panel'\)/, '背包按钮要挂到右上角单位详情面板');
assert.match(uiSource, /button\.id = 'rune-backpack-open';/);
assert.match(cssSource, /\.rune-backpack-open \{/, '按钮样式必须存在');

// ---- 6) 垃圾桶：吸附在背包右下方 ----
assert.match(uiSource, /class="rune-backpack-trash" data-rune-sell/, '出售落点必须命名为垃圾桶');
assert.match(uiSource, /<span class="rune-backpack-trash-label">垃圾桶<\/span>/);
assert.match(
  cssSource,
  /\.rune-backpack-trash \{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*-10px;[\s\S]*?bottom:\s*-18px;/,
  '垃圾桶必须吸附在背包右下方'
);
assert.match(uiSource, /if \(under\.closest\('\[data-rune-sell\]'\)\) return \{ kind: 'sell' \};/);

// ---- 7) 同名石头：灰色、不生效、但仍能升级 ----
assert.match(uiSource, /isStoneInactiveDuplicate/, '界面必须识别同名备用石');
assert.match(uiSource, /'rune-stone is-inactive'/, '备用石要加灰色样式类');
assert.match(uiSource, /badge\.textContent = '未生效';/);
assert.match(cssSource, /\.rune-stone\.is-inactive \{[\s\S]*?grayscale/, '备用石必须灰色显示');
assert.match(
  uiSource,
  /同名备用石：留在背包里不生效，但仍照常吃魔力升级/,
  '备用石必须说明不生效但仍可升级'
);

// ---- 8) 需求 3：图片 + 左上角等级 + 跟随光标拖拽 ----
assert.match(
  uiSource,
  /import \{ createCardArtMarkup \} from '\.\/CardSystem\.js';/,
  '石头图片必须复用卡面美术管线，而不是另做一套'
);
assert.match(uiSource, /ENCHANT_ART_KEY_BY_ID/, '必须按 enchantmentId 找到对应附魔卡的 artKey');
assert.match(
  uiSource,
  /const artKey = ENCHANT_ART_KEY_BY_ID\.get\(key\) \?\? key;[\s\S]*?createCardArtMarkup\(\{ id: artKey, artKey, kind: 'enchant' \}\)/,
  '石头图片必须取对应附魔的卡面美术'
);
assert.match(uiSource, /art\.className = 'rune-stone-art';/, '石头本体要渲染成图片容器');
assert.match(
  uiSource,
  /level\.className = 'rune-stone-level';[\s\S]{0,80}?level\.textContent = String\(stone\.level\);/,
  '等级必须作为徽章显示在石头上'
);
assert.match(
  cssSource,
  /\.rune-stone \{[\s\S]{0,80}?position:\s*relative;/,
  '石头要相对定位，等级徽章才能压在图片内部'
);
assert.match(
  cssSource,
  /\.rune-stone-level \{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*2px;[\s\S]*?left:\s*2px;/,
  '等级徽章必须压在图片内部左上角'
);
// 拖拽：必须创建跟随光标的拖拽物，并在松手/取消时移除。
assert.match(uiSource, /ensureDragGhost\(stone\) \{/, '拖拽时必须创建跟随物');
assert.match(uiSource, /ghost\.dataset\.runeDragGhost = 'true';/);
assert.match(uiSource, /moveDragGhost\(event\.clientX, event\.clientY\);/, '跟随物必须跟着光标移动');
assert.match(uiSource, /removeDragGhost\(\) \{/, '松手或取消时必须移除跟随物');
assert.match(
  cssSource,
  /\.rune-drag-ghost \{[\s\S]*?position:\s*fixed;[\s\S]*?transform:\s*translate\(-50%, -50%\);[\s\S]*?pointer-events:\s*none;/,
  '跟随物必须固定在光标中心且不吃事件'
);
// 图片不是每帧重建的：签名未变时跳过重建。
assert.match(
  uiSource,
  /const signature = buildSignature\(\{[\s\S]*?if \(signature !== this\.lastSignature\) \{/,
  '图片与格子的重建必须做签名比对，避免每 400ms 重建 24 张图'
);

// 样式表必须被真正引入。
assert.match(mainSource, /import '\.\/runeBackpack\.css';/);

console.log('rune backpack interaction checks passed');
