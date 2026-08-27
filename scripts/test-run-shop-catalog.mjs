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
const gameSource = readFileSync(new URL('../src/systems/Game.js', import.meta.url), 'utf8');
const metaGameSource = readFileSync(new URL('../src/systems/MetaGameSystem.js', import.meta.url), 'utf8');
const cardSystemSource = readFileSync(new URL('../src/systems/CardSystem.js', import.meta.url), 'utf8');
const lootDropSource = readFileSync(new URL('../src/systems/LootDropSystem.js', import.meta.url), 'utf8');
assert.match(metaGameSource, /<div class="meta-forged-card-shell">\s*\$\{createForgedCardMarkup\(card\)\}/);
assert.doesNotMatch(metaGameSource, /options\.handStyle|<div class="meta-card-face">/);
assert.match(metaHudStyles, /\.meta-forged-card-shell \.med-card-wrapper\s*\{/);
assert.match(cardSystemSource, /function createPileCardElement[\s\S]*?meta-forged-card-shell[\s\S]*?createForgedCardMarkup\(card\)/);
assert.match(lootDropSource, /this\.ui\.card\.innerHTML\s*=\s*`[\s\S]*?meta-forged-card-shell[\s\S]*?createForgedCardMarkup\(drop\.card\)/);
assert.doesNotMatch(gameSource, /runShopCardFaceInnerMarkup|runShopAttributeTrainingMarkup|unitSpecializationRewardMarkup/);
assert.match(
  gameSource,
  /options\.useAttributeTrainingStyle[\s\S]*?options\.useSpecializationStyle[\s\S]*?options\.useWaveRewardStyle[\s\S]*?runShopChoiceUsesCardFace\(choice\)[\s\S]*?strategyRewardMarkup\(choice, index/,
  'every supply-shop card path should use the wave-reward forged card renderer'
);
assert.doesNotMatch(gameSource, /class="(?:card-level|meta-card-level)"/);
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
assert.doesNotMatch(gameSource, /attribute-training-card|unit-specialization-card/);
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
