import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RUN_SHOP_CATEGORIES,
  isRunShopCategoryAvailable
} from '../src/systems/runShopCatalog.js';
import { collectRunShopCardInstances } from '../src/systems/CardSystem.js';

assert.equal(isRunShopCategoryAvailable('card'), false);
assert.equal(RUN_SHOP_CATEGORIES.some((entry) => entry.key === 'card'), false);
for (const key of ['attribute', 'unit', 'trait', 'copy', 'remove', 'upgrade', 'energy', 'temporary']) {
  assert.equal(isRunShopCategoryAvailable(key), true, `${key} should remain available`);
}
const unitShopCategory = RUN_SHOP_CATEGORIES.find((entry) => entry.key === 'unit');
assert.equal(unitShopCategory?.picker, undefined);
assert.equal(unitShopCategory?.catalogPicker, undefined);
assert.equal(unitShopCategory?.title, '随机卡牌');
assert.equal(unitShopCategory?.prepaidChoices, true);
assert.match(unitShopCategory?.description ?? '', /立即付费.*剩余波次奖励.*三张.*不退款.*重新扣费/);

const ownedHandCard = { id: 'hand', instanceId: 'hand-1' };
const ownedDrawCard = { id: 'draw', instanceId: 'draw-1' };
const ownedDiscardCard = { id: 'discard', instanceId: 'discard-1' };
const temporaryCard = { id: 'temporary', instanceId: 'temporary-1' };
const reserveCard = { id: 'reserve', instanceId: 'reserve-1' };
assert.deepEqual(collectRunShopCardInstances({
  handCards: [ownedHandCard],
  drawPile: [ownedDrawCard],
  discardPile: [ownedDiscardCard],
  temporaryCards: [temporaryCard],
  reservePile: [reserveCard]
}), [ownedHandCard, ownedDrawCard, ownedDiscardCard]);

const battleHudStyles = readFileSync(new URL('../src/battleHud.css', import.meta.url), 'utf8');
const metaHudStyles = readFileSync(new URL('../src/metaHud.css', import.meta.url), 'utf8');
const indexMarkup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(
  metaHudStyles,
  /body\.is-meta-open \.meta-root \.meta-card > \.meta-card-level\s*\{[\s\S]*?border:\s*0\s*!important;[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?box-shadow:\s*none\s*!important;/,
  'main-menu cards should render the Roman level without a badge'
);
assert.match(
  battleHudStyles,
  /body\.is-game-active \.run-shop-panel \.run-shop-choice-card > \.card-level\s*\{[\s\S]*?border:\s*0\s*!important;[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?box-shadow:\s*none\s*!important;/,
  'legacy supply-shop cards should render the Roman level without a badge'
);
assert.match(
  battleHudStyles,
  /body\.is-game-active \.run-shop-panel \.med-card-level-icon\s*\{\s*display:\s*none\s*!important;/,
  'forged supply-shop cards must never display a level icon'
);
assert.match(
  battleHudStyles,
  /@media \(max-width: 900px\)[\s\S]*?\.run-shop-choice-list\.is-catalog-picker\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fill,\s*145px\)[\s\S]*?max-height:\s*none\s*!important;[\s\S]*?overflow:\s*visible\s*!important;/,
  'mobile catalog cards should use a non-nested 145px grid'
);
assert.match(
  battleHudStyles,
  /\.run-shop-choice-list\.is-compact-three-choice-picker\s+\.run-shop-reward-option\.is-forged-reward\s*\{[\s\S]*?width:\s*145px\s*!important;[\s\S]*?height:\s*229px\s*!important;/,
  'training, specialization and temporary cards should share the same mobile footprint'
);
assert.match(
  battleHudStyles,
  /\.run-shop-choice-list\.is-compact-three-choice-picker\s*\{[\s\S]*?display:\s*grid\s*!important;[\s\S]*?grid-template-columns:\s*repeat\(3,\s*145px\)\s*!important;[\s\S]*?overflow:\s*visible\s*!important;/,
  'three-choice mobile services should fit in one non-scrolling row'
);
assert.match(
  battleHudStyles,
  /\.attribute-training-title-row::after\s*\{[\s\S]*?bottom:\s*2px;[\s\S]*?height:\s*1px;/,
  'special-card title divider should sit below the name'
);
assert.match(
  battleHudStyles,
  /\.attribute-training-title-row \.med-card-name\s*\{[\s\S]*?margin-bottom:\s*0;[\s\S]*?padding-bottom:\s*0;[\s\S]*?border-bottom:\s*0\s*!important;/,
  'special-card names should not inherit the hand-card underline'
);
assert.match(
  battleHudStyles,
  /\.run-shop-choice-list\.is-scalable-card-picker\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fill,\s*var\(--run-shop-card-width,\s*184px\)\)/,
  'large owned-card pickers should expose a density-controlled grid'
);
assert.match(
  battleHudStyles,
  /\.run-shop-choice-list\.is-scalable-card-picker\s*\{[\s\S]*?column-gap:\s*var\(--run-shop-card-column-gap,\s*10px\)[\s\S]*?row-gap:\s*var\(--run-shop-card-row-gap,\s*12px\)/,
  'the owned-card density slider should shrink both grid gaps with card size'
);
assert.match(
  battleHudStyles,
  /\.run-shop-choice-list\.is-scalable-card-picker \.wave-reward-card-frame\s*\{[\s\S]*?scale\(var\(--run-shop-card-scale,\s*1\)\)/,
  'the card density slider should scale the forged card face with its grid cell'
);

const gameSource = readFileSync(new URL('../src/systems/Game.js', import.meta.url), 'utf8');
for (const className of ['is-training-card-picker', 'is-specialization-card-picker', 'is-temporary-card-picker', 'is-compact-three-choice-picker']) {
  assert.match(gameSource, new RegExp(`classList\\.toggle\\('${className}'`), `${className} should be toggled for its picker`);
  assert.match(gameSource, new RegExp(`'${className}'`), `${className} should be cleared when leaving the picker`);
}
assert.match(gameSource, /\['copy',\s*'remove',\s*'upgrade'\]\.includes\(this\.runShopActiveCategory\)/);
assert.match(gameSource, /--run-shop-card-column-gap',\s*`\$\{10 \* scale\}px`/);
assert.match(gameSource, /--run-shop-card-row-gap',\s*`\$\{12 \* scale\}px`/);
assert.match(gameSource, /id="run-shop-card-scale"[^>]*min="55"[^>]*max="100"/);
assert.match(indexMarkup, /id="run-shop-card-scale"[^>]*min="55"[^>]*max="100"/);
for (const temporaryChoiceId of [
  'temporary-immortality-card',
  'temporary-mana-surge-card',
  'temporary-rune-expansion-card'
]) {
  assert.match(gameSource, new RegExp(`id:\\s*'${temporaryChoiceId}'`), `${temporaryChoiceId} should remain in the temporary seal pool`);
}

console.log('Run-shop catalog checks passed.');
