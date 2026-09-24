// 卡面/符文图标美术。从已删除的卡牌系统抽出，供符文背包与复活图标复用。
// Unit portraits share one explicit bitmap set so non-unit card art can keep
// using the existing lightweight symbolic SVG renderers.
const BITMAP_CARD_ART = {
  raider: 'card-art/raider-imagegen-lowpoly-v1.png',
  swordsman: 'card-art/swordsman-imagegen-lowpoly-v4.png',
  knight: 'card-art/knight-imagegen-lowpoly-v1.png',
  berserker: 'card-art/berserker-imagegen-lowpoly-v1.png',
  archer: 'card-art/archer-imagegen-lowpoly-v1.png',
  spearman: 'card-art/spearman-imagegen-lowpoly-v1.png',
  towerShield: 'card-art/towerShield-imagegen-lowpoly-v1.png',
  crossbowman: 'card-art/crossbowman-imagegen-lowpoly-v1.png',
  waterMage: 'card-art/waterMage-imagegen-lowpoly-v1.png',
  lightningMage: 'card-art/lightningMage-imagegen-lowpoly-v1.png',
  windMage: 'card-art/windMage-imagegen-lowpoly-v1.png',
  rogue: 'card-art/rogue-imagegen-lowpoly-v1.png',
  engineer: 'card-art/engineer-imagegen-lowpoly-v1.png',
  physician: 'card-art/physician-imagegen-lowpoly-v1.png',
  purifier: 'card-art/purifier-imagegen-lowpoly-v1.png',
  warder: 'card-art/warder-imagegen-lowpoly-v1.png'
};

function resolveCardArtAsset(path) {
  const base = import.meta.env?.BASE_URL || '/';
  return `${base}${path}`.replace(/([^:]\/)\/+/g, '$1');
}

export function createCardArtMarkup(card) {
  const key = safeArtKey(card.artKey ?? card.id ?? card.kind);
  const assetPath = BITMAP_CARD_ART[key];
  if (assetPath) {
    return `
      <div class="card-art card-art-${key} has-bitmap-art" aria-hidden="true">
        <img class="card-art-image" src="${resolveCardArtAsset(assetPath)}" alt="" draggable="false" loading="lazy" />
      </div>
    `;
  }
  const renderer = CARD_ART_RENDERERS[key] ?? CARD_ART_RENDERERS.default;
  return `<div class="card-art card-art-${key}" aria-hidden="true">${renderer()}</div>`;
}

function safeArtKey(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}

const CARD_ART_RENDERERS = {
  raider: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.24" cx="48" cy="56" rx="31" ry="6" />
    <polygon fill="#5b3b2d" points="18,43 25,36 63,57 58,63" />
    <polygon fill="#7a5237" points="17,25 31,17 40,34 23,41" />
    <polygon fill="#d8d0c2" points="19,23 14,17 24,20" />
    <polygon fill="#d8d0c2" points="31,18 31,9 38,19" />
    <polygon fill="#d8d0c2" points="39,32 48,32 42,39" />
    <polygon fill="#6f4735" points="28,52 34,35 48,28 62,35 69,52 57,59 39,59" />
    <polygon fill="#b9825f" points="36,27 48,14 60,27 56,40 40,40" />
    <polygon fill="#2c211d" points="36,26 48,12 61,26 55,30 48,24 41,30" />
    <polygon fill="#e1b48a" points="42,33 54,33 52,40 44,40" />
    <polygon fill="#8f4b36" points="39,41 57,41 60,51 48,57 36,51" />
    <path fill="none" stroke="#f5c978" stroke-width="2.4" d="M34 48 L48 57 L62 48" />
  `),
  swordsman: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.23" cx="48" cy="56" rx="29" ry="6" />
    <polygon fill="#e9edf0" points="49,5 56,30 50,58 44,30" />
    <polygon fill="#9fb3bc" points="49,5 50,58 44,30" />
    <rect fill="#7b5836" x="37" y="31" width="23" height="5" rx="1" />
    <polygon fill="#253954" points="29,53 35,30 47,20 61,30 68,53 56,60 40,60" />
    <polygon fill="#426f98" points="36,34 48,26 60,34 57,51 48,57 39,51" />
    <polygon fill="#c69b6d" points="42,24 48,15 55,24 52,33 44,33" />
    <polygon fill="#242829" points="40,24 48,12 57,24 52,27 48,24 44,28" />
    <polygon fill="#d8e6ee" opacity="0.72" points="51,9 54,29 50,44" />
    <path fill="none" stroke="#f1c778" stroke-width="2.2" d="M35 50 L48 57 L61 50" />
  `),
  knight: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.24" cx="49" cy="56" rx="31" ry="6" />
    <polygon fill="#cfd8dc" points="30,21 48,9 66,21 62,38 48,46 34,38" />
    <polygon fill="#7f929b" points="35,23 48,15 61,23 58,34 48,40 38,34" />
    <rect fill="#232d31" x="39" y="25" width="18" height="4" rx="1" />
    <polygon fill="#315a77" points="30,37 48,29 66,37 62,55 48,62 34,55" />
    <polygon fill="#d8c278" points="48,34 56,42 48,55 40,42" />
    <polygon fill="#fff1bf" points="47,34 49,34 49,55 47,55" />
    <polygon fill="#e7eef0" points="23,16 30,17 27,57 21,57" />
    <rect fill="#795a35" x="19" y="37" width="13" height="5" rx="1" />
    <path fill="none" stroke="#f4d98f" stroke-width="2.2" d="M34 55 L48 62 L62 55" />
  `),
  spearman: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.22" cx="48" cy="56" rx="30" ry="6" />
    <polygon fill="#6a7d4f" points="29,53 35,30 47,20 61,30 68,53 56,60 40,60" />
    <polygon fill="#8ea06f" points="36,34 48,26 60,34 57,51 48,57 39,51" />
    <polygon fill="#d8c278" points="42,24 48,15 55,24 52,33 44,33" />
    <polygon fill="#d8dce2" points="49,8 52,34 50,58 46,34" />
    <polygon fill="#9fb3bc" points="49,8 50,58 46,34" />
    <path fill="none" stroke="#f1c778" stroke-width="2.2" d="M35 50 L48 57 L61 50" />
  `),
  towerShield: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.24" cx="49" cy="56" rx="31" ry="6" />
    <polygon fill="#5a6a78" points="30,37 48,29 66,37 62,55 48,62 34,55" />
    <polygon fill="#7f929b" points="35,23 48,15 61,23 58,34 48,40 38,34" />
    <polygon fill="#cfd8dc" points="18,18 18,58 34,58 34,18" />
    <polygon fill="#9aa8b0" points="22,22 30,22 30,54 22,54" />
    <rect fill="#795a35" x="39" y="37" width="16" height="4" rx="1" />
    <path fill="none" stroke="#f4d98f" stroke-width="2.2" d="M34 55 L48 62 L62 55" />
  `),
  berserker: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.25" cx="48" cy="56" rx="32" ry="6" />
    <polygon fill="#5d3a2b" points="20,44 27,36 70,56 66,63" />
    <polygon fill="#d4dce0" points="60,16 83,25 74,42 51,32" />
    <polygon fill="#a6b2b8" points="77,23 89,34 73,43" />
    <polygon fill="#71342e" points="28,52 34,34 48,27 63,34 70,52 56,60 40,60" />
    <polygon fill="#ca7b55" points="37,26 48,13 60,26 56,38 40,38" />
    <polygon fill="#2c211f" points="36,25 48,11 61,25 56,29 48,24 40,30" />
    <polygon fill="#f06d3f" points="42,39 54,39 60,51 48,59 36,51" />
    <polygon fill="#efe6cf" points="37,24 29,17 39,18" />
    <polygon fill="#efe6cf" points="59,24 67,17 57,18" />
    <path fill="none" stroke="#ffd18a" stroke-width="2.4" d="M33 48 L48 59 L63 48" />
  `),
  archer: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.23" cx="48" cy="56" rx="30" ry="6" />
    <path fill="none" stroke="#5c3e2a" stroke-width="4.5" d="M68 12 C87 26 87 46 68 58" />
    <path fill="none" stroke="#f4e7bd" stroke-width="1.7" d="M68 12 L68 58" />
    <polygon fill="#f5e7bd" points="24,35 76,33 76,37 24,39" />
    <polygon fill="#f5e7bd" points="76,33 86,35 76,38" />
    <polygon fill="#274c37" points="30,54 35,31 48,20 62,31 67,54 56,60 40,60" />
    <polygon fill="#5f8e55" points="36,30 48,14 61,30 56,40 40,40" />
    <polygon fill="#d1a171" points="42,29 48,21 54,29 52,38 44,38" />
    <polygon fill="#203f31" points="38,29 48,16 59,29 54,32 48,28 42,33" />
    <polygon fill="#9ec77b" points="38,42 58,42 62,52 48,58 34,52" />
    <path fill="none" stroke="#f1d28e" stroke-width="2.2" d="M35 50 L48 58 L61 50" />
  `),
  crossbowman: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.24" cx="49" cy="56" rx="31" ry="6" />
    <polygon fill="#364b55" points="31,52 36,31 49,22 63,31 69,52 56,60 41,60" />
    <polygon fill="#7c8b91" points="39,22 49,13 60,22 57,34 42,34" />
    <rect fill="#222b2e" x="40" y="25" width="18" height="4" rx="1" />
    <polygon fill="#5f3f28" points="20,39 76,36 76,43 20,46" />
    <polygon fill="#2d2621" points="17,30 80,30 87,36 10,37" />
    <polygon fill="#2d2621" points="12,34 30,27 27,41" />
    <polygon fill="#2d2621" points="85,34 67,27 70,41" />
    <polygon fill="#dce6e8" points="39,34 84,33 84,37 39,38" />
    <polygon fill="#dce6e8" points="84,33 93,35 84,38" />
    <polygon fill="#8aa1a7" points="39,39 58,39 63,51 49,58 35,51" />
    <path fill="none" stroke="#f5d98e" stroke-width="2" d="M18 35 L82 35" />
  `),
  waterMage: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.22" cx="48" cy="56" rx="31" ry="6" />
    <circle fill="#65d8ff" opacity="0.18" cx="63" cy="35" r="22" />
    <path fill="none" stroke="#8feaff" stroke-width="2.4" d="M39 45 C51 56 72 55 84 42" />
    <path fill="none" stroke="#dff8ff" stroke-width="2" opacity="0.82" d="M45 38 C55 27 72 28 82 39" />
    <polygon fill="#214e78" points="30,54 36,29 48,17 62,29 68,54 56,61 40,61" />
    <polygon fill="#4b9fc4" points="38,31 48,21 58,31 57,49 48,57 39,49" />
    <polygon fill="#d5a878" points="43,30 48,23 54,30 52,37 44,37" />
    <polygon fill="#1e3f64" points="37,30 48,15 60,30 55,33 48,29 42,34" />
    <rect fill="#6b4b2f" x="72" y="9" width="5" height="50" rx="2" transform="rotate(8 74.5 34)" />
    <circle fill="#66dcff" cx="76" cy="12" r="7" />
    <circle fill="#e5fbff" opacity="0.85" cx="76" cy="12" r="3" />
    <circle fill="#66dcff" opacity="0.65" cx="64" cy="38" r="9" />
    <path fill="none" stroke="#f2fbff" stroke-width="1.8" d="M59 38 C64 33 70 34 73 39" />
  `),
  lightningMage: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.24" cx="48" cy="56" rx="31" ry="6" />
    <circle fill="#a995ff" opacity="0.15" cx="65" cy="31" r="23" />
    <polygon fill="#30345f" points="29,54 36,29 48,17 62,29 69,54 56,61 40,61" />
    <polygon fill="#535792" points="38,32 48,22 58,32 56,50 48,57 40,50" />
    <polygon fill="#d8a978" points="43,30 48,23 54,30 52,37 44,37" />
    <path fill="#d9bf62" d="M37 27 L42 15 L46 23 L49 9 L53 23 L59 15 L60 29 L54 32 L48 28 L42 33 Z" />
    <rect fill="#453927" x="70" y="9" width="5" height="51" rx="2" transform="rotate(8 72.5 34)" />
    <path fill="none" stroke="#e8e2ff" stroke-width="2.5" d="M76 11 L69 26 L79 27 L70 44 L84 29 L76 28 L84 11" />
    <path fill="none" stroke="#bba8ff" stroke-width="2.2" d="M52 39 L63 34 L59 44 L74 40 L68 52" />
  `),
  windMage: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.22" cx="48" cy="56" rx="31" ry="6" />
    <circle fill="#4fbfa8" opacity="0.16" cx="63" cy="35" r="22" />
    <path fill="none" stroke="#8ff0d8" stroke-width="2.4" d="M40 47 C52 58 72 54 82 40" />
    <path fill="none" stroke="#eafcff" stroke-width="2" opacity="0.8" d="M46 40 C57 30 73 31 82 41" />
    <polygon fill="#1f5a4d" points="30,54 36,29 48,17 62,29 68,54 56,61 40,61" />
    <polygon fill="#3fae9a" points="38,31 48,21 58,31 57,49 48,57 39,49" />
    <polygon fill="#d5a878" points="43,30 48,23 54,30 52,37 44,37" />
    <polygon fill="#194a3f" points="37,30 48,15 60,30 55,33 48,29 42,34" />
    <rect fill="#6b4b2f" x="72" y="9" width="5" height="50" rx="2" transform="rotate(8 74.5 34)" />
    <path fill="none" stroke="#8ff0d8" stroke-width="2.2" d="M69 15 C64 20 80 22 75 27 C70 32 82 33 78 38" />
    <circle fill="#a9f2df" cx="74.5" cy="12" r="6.5" />
    <circle fill="#eafcff" opacity="0.85" cx="74.5" cy="12" r="2.8" />
  `),
  rogue: () => symbolicUnitSvg(`
    <ellipse fill="#10231f" opacity="0.25" cx="48" cy="56" rx="31" ry="6" />
    <path fill="none" stroke="#dce8ee" stroke-width="2.4" opacity="0.74" d="M19 52 C39 37 58 23 80 11" />
    <path fill="none" stroke="#89a2b5" stroke-width="2" opacity="0.6" d="M77 52 C58 37 39 23 17 12" />
    <polygon fill="#dce6ea" points="60,17 83,10 69,27" />
    <polygon fill="#dce6ea" points="36,17 13,10 27,27" />
    <polygon fill="#202a35" points="29,54 35,30 48,18 62,30 69,54 56,61 40,61" />
    <polygon fill="#4a5670" points="38,32 48,22 58,32 56,49 48,57 40,49" />
    <polygon fill="#d3a477" points="43,30 48,24 53,30 51,37 45,37" />
    <polygon fill="#1c2631" points="36,29 48,14 61,29 55,33 48,28 41,34" />
    <polygon fill="#aebdc5" points="25,47 44,31 48,35 30,53" />
    <polygon fill="#aebdc5" points="71,47 52,31 48,35 66,53" />
    <rect fill="#6d4b31" x="21" y="49" width="12" height="5" rx="1" transform="rotate(-42 27 51)" />
    <rect fill="#6d4b31" x="63" y="49" width="12" height="5" rx="1" transform="rotate(42 69 51)" />
  `),
  engineer: () => artSvg(`
    <polygon fill="#342d27" points="0,51 18,42 42,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#9dd8ff" opacity="0.16" cx="52" cy="43" rx="32" ry="15" />
    <polygon fill="#d9aa78" points="47,13 55,23 41,23" />
    <polygon fill="#d09a5a" points="39,22 58,22 54,38 48,47 42,38" />
    <polygon fill="#7b5a38" points="36,29 61,29 66,51 49,59 32,51" />
    <polygon fill="#4d3a2a" points="41,34 57,34 59,52 49,56 39,52" />
    <polygon fill="#172325" points="40,52 49,52 47,60 39,60" />
    <polygon fill="#13201f" points="51,52 60,52 61,60 53,60" />
    <polygon fill="#8f9a9b" points="36,12 61,12 66,22 31,22" />
    <polygon fill="#d8c58d" points="38,17 59,17 59,21 38,21" />
    <polygon fill="#5a3a28" points="62,36 75,39 71,51 59,49" />
    <path fill="none" stroke="#5a3a28" stroke-width="5" stroke-linecap="round" d="M24 52 L42 34" />
    <polygon fill="#8f9a9b" points="39,29 54,35 49,43 34,37" />
    <path fill="none" stroke="#8f9a9b" stroke-width="4" stroke-linecap="round" d="M70 27 L58 47" />
    <polygon fill="#8f9a9b" points="66,23 78,27 73,32 62,29" />
    <circle fill="#9dd8ff" cx="51" cy="43" r="4" />
    <path fill="none" stroke="#eef7ff" stroke-width="2" opacity="0.68" d="M25 55 C39 46 55 47 72 36" />
  `),
  physician: () => artSvg(`
    <polygon fill="#263a2d" points="0,51 18,42 42,44 69,38 96,49 96,64 0,64" />
    <ellipse fill="#c7ffd1" opacity="0.24" cx="54" cy="36" rx="32" ry="19" />
    <polygon fill="#d9aa78" points="47,11 55,23 41,23" />
    <polygon fill="#3f7258" points="36,24 60,24 66,50 49,58 31,50" />
    <polygon fill="#5f9f73" points="40,28 58,28 61,48 49,54 37,48" />
    <polygon fill="#f5e5b2" points="35,36 62,36 61,40 36,40" />
    <polygon fill="#17212a" points="40,50 49,50 47,59 39,59" />
    <polygon fill="#17212a" points="51,50 60,50 61,59 53,59" />
    <polygon fill="#d9aa78" points="28,30 36,31 44,42 39,46" />
    <polygon fill="#d9aa78" points="64,30 71,32 60,43 55,40" />
    <polygon fill="#6a4a30" points="72,10 78,10 70,59 65,59" />
    <circle fill="#c7ffd1" cx="76" cy="10" r="7" />
    <circle fill="#ffffff" opacity="0.75" cx="76" cy="10" r="3" />
    <polygon fill="#f5e5b2" points="46,30 53,30 53,37 60,37 60,43 53,43 53,50 46,50 46,43 39,43 39,37 46,37" />
    <path fill="none" stroke="#9dffb0" stroke-width="2" opacity="0.75" d="M23 42 C37 30 55 28 75 11" />
  `),
  arrowTower: () => artSvg(`
    <polygon fill="#28333d" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#777d78" points="25,56 72,56 67,63 30,63" />
    <polygon fill="#6d4a30" points="30,55 37,55 42,23 35,23" />
    <polygon fill="#6d4a30" points="59,23 66,23 61,55 54,55" />
    <polygon fill="#3c2a22" points="30,43 66,43 66,48 30,48" />
    <polygon fill="#3c2a22" points="33,32 63,32 63,37 33,37" />
    <polygon fill="#84613f" points="25,21 71,21 76,37 48,48 20,37" />
    <polygon fill="#3e7cb1" points="48,5 78,23 18,23" />
    <polygon fill="#2d5c8d" points="48,10 69,22 27,22" />
    <path fill="none" stroke="#3c2a22" stroke-width="5" stroke-linecap="round" d="M34 36 C48 24 63 27 70 42" />
    <polygon fill="#efe8ca" points="41,35 75,34 75,37 41,38" />
    <polygon fill="#efe8ca" points="75,34 84,36 75,38" />
    <path fill="none" stroke="#fff2c7" stroke-width="2" opacity="0.58" d="M48 5 L48 48" />
  `),
  repairStation: () => artSvg(`
    <polygon fill="#263a42" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#777d78" points="18,56 78,56 70,63 26,63" />
    <polygon fill="#6b4a2f" points="24,39 73,39 70,53 27,53" />
    <polygon fill="#6b9ab8" points="29,30 54,30 58,43 25,43" />
    <polygon fill="#8f9a9b" points="59,31 73,35 67,45 55,41" />
    <polygon fill="#6b4a2f" points="45,16 51,16 51,55 45,55" />
    <polygon fill="#6b9ab8" points="30,13 66,13 70,28 26,28" />
    <circle fill="#9dd8ff" cx="48" cy="41" r="7" />
    <path fill="none" stroke="#eef7ff" stroke-width="3" stroke-linecap="round" d="M38 21 L58 21 M48 11 L48 31" />
    <path fill="none" stroke="#d8dde0" stroke-width="4" stroke-linecap="round" d="M63 18 C72 22 72 31 63 35" />
    <path fill="none" stroke="#d8dde0" stroke-width="3" stroke-linecap="round" d="M64 35 L55 48" />
  `),
  canteen: () => artSvg(`
    <polygon fill="#3a3028" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#777d78" points="17,56 79,56 71,63 25,63" />
    <polygon fill="#84613f" points="23,28 73,28 75,55 21,55" />
    <polygon fill="#b98758" points="48,8 80,29 16,29" />
    <polygon fill="#5a3a28" points="25,43 71,43 71,49 25,49" />
    <ellipse fill="#3e3a36" cx="48" cy="37" rx="16" ry="8" />
    <ellipse fill="#e0b36a" cx="48" cy="35" rx="13" ry="5" />
    <polygon fill="#5f564d" points="60,13 69,16 67,30 58,28" />
    <circle fill="#d8dde0" cx="32" cy="43" r="5" />
    <circle fill="#d8dde0" cx="64" cy="43" r="5" />
    <path fill="none" stroke="#fff2c7" stroke-width="2" opacity="0.7" d="M37 34 C41 29 45 33 48 29 C52 24 57 29 60 25" />
  `),
  beacon: () => artSvg(`
    <polygon fill="#26343b" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#9dd8ff" opacity="0.16" cx="49" cy="47" rx="34" ry="12" />
    <polygon fill="#777d78" points="20,56 76,56 69,63 27,63" />
    <polygon fill="#d8c58d" points="32,48 64,48 60,56 36,56" />
    <polygon fill="#777d78" points="43,23 53,23 56,49 40,49" />
    <ellipse fill="none" stroke="#d8c58d" stroke-width="4" cx="48" cy="26" rx="21" ry="8" />
    <polygon fill="#9dd8ff" points="48,4 62,23 48,42 34,23" />
    <polygon fill="#dff8ff" opacity="0.8" points="48,8 55,23 48,35 41,23" />
    <polygon fill="#d8c58d" points="48,1 57,8 48,14 39,8" />
    <path fill="none" stroke="#eef7ff" stroke-width="2" opacity="0.8" d="M21 49 C35 38 58 38 75 49" />
  `),
  purifier: () => artSvg(`
    <polygon fill="#263646" points="0,51 18,42 42,44 69,38 96,49 96,64 0,64" />
    <ellipse fill="#dff8ff" opacity="0.22" cx="54" cy="36" rx="32" ry="19" />
    <polygon fill="#d9aa78" points="47,11 55,23 41,23" />
    <polygon fill="#5666a4" points="36,24 60,24 66,50 49,58 31,50" />
    <polygon fill="#7889c7" points="40,28 58,28 61,48 49,54 37,48" />
    <polygon fill="#f0e8c6" points="35,36 62,36 61,40 36,40" />
    <polygon fill="#17212a" points="40,50 49,50 47,59 39,59" />
    <polygon fill="#17212a" points="51,50 60,50 61,59 53,59" />
    <polygon fill="#d9aa78" points="28,30 36,31 44,42 39,46" />
    <polygon fill="#d9aa78" points="64,30 71,32 60,43 55,40" />
    <polygon fill="#6a4a30" points="72,10 78,10 70,59 65,59" />
    <circle fill="#dff8ff" cx="76" cy="10" r="7" />
    <circle fill="#ffffff" opacity="0.75" cx="76" cy="10" r="3" />
    <path fill="none" stroke="#b7f3ff" stroke-width="2" opacity="0.75" d="M23 42 C37 30 55 28 75 11" />
    <path fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" d="M39 44 L58 27 M42 27 L59 44" />
  `),
  warder: () => artSvg(`
    <polygon fill="#243542" points="0,51 18,42 42,44 69,38 96,49 96,64 0,64" />
    <ellipse fill="#b7eaff" opacity="0.25" cx="51" cy="38" rx="34" ry="21" />
    <path fill="none" stroke="#dff8ff" stroke-width="3" d="M20 42 C31 20 67 20 80 42 C66 58 33 58 20 42 Z" />
    <polygon fill="#d9aa78" points="47,11 55,23 41,23" />
    <polygon fill="#466f8d" points="36,24 60,24 66,50 49,58 31,50" />
    <polygon fill="#6b9ab8" points="40,28 58,28 61,48 49,54 37,48" />
    <polygon fill="#dcefff" points="35,36 62,36 61,40 36,40" />
    <polygon fill="#17212a" points="40,50 49,50 47,59 39,59" />
    <polygon fill="#17212a" points="51,50 60,50 61,59 53,59" />
    <polygon fill="#d9aa78" points="28,30 36,31 44,42 39,46" />
    <polygon fill="#d9aa78" points="64,30 71,32 60,43 55,40" />
    <polygon fill="#6a4a30" points="72,10 78,10 70,59 65,59" />
    <circle fill="#b7eaff" cx="76" cy="10" r="7" />
    <circle fill="#ffffff" opacity="0.75" cx="76" cy="10" r="3" />
    <polygon fill="#dff8ff" points="49,27 63,34 60,48 49,55 38,48 35,34" />
    <polygon fill="#6b9ab8" points="49,32 57,36 55,45 49,49 43,45 41,36" />
  `),
  inspiration: () => artSvg(`
    <polygon fill="#243644" points="0,51 18,42 42,44 69,38 96,49 96,64 0,64" />
    <polygon fill="#567d91" points="22,24 58,24 70,35 34,35" />
    <polygon fill="#739fb0" points="26,17 62,17 73,28 37,28" />
    <polygon fill="#d9edf0" points="31,10 67,10 77,21 41,21" />
    <path fill="none" stroke="#fff4bd" stroke-width="3" d="M51 46 C51 37 55 31 63 26" />
    <polygon fill="#ffe58a" points="66,7 70,17 81,18 72,24 74,35 66,29 57,35 60,24 51,18 62,17" />
    <polygon fill="#fff7d5" points="66,12 68,19 74,20 69,23 70,29 66,26 61,29 63,23 58,20 64,19" />
    <circle fill="#8fd6e8" opacity="0.42" cx="34" cy="43" r="9" />
    <polygon fill="#d9edf0" points="34,34 38,42 46,44 38,47 34,55 30,47 22,44 30,42" />
  `),
  meteor: () => artSvg(`
    <polygon fill="#28333d" points="0,47 18,39 39,43 62,36 96,46 96,64 0,64" />
    <polygon fill="#ffe49a" opacity="0.9" points="20,2 68,31 59,39 12,10" />
    <polygon fill="#ff973f" points="27,8 66,31 58,36 20,14" />
    <polygon fill="#ff5d32" points="34,15 62,31 56,34 29,19" />
    <circle fill="#ffcf74" cx="67" cy="39" r="15" />
    <polygon fill="#f06b32" points="58,31 73,27 82,38 76,52 60,53 52,42" />
    <polygon fill="#6b4a35" points="63,34 74,32 79,41 72,49 61,47 56,40" />
    <polygon fill="#3f302c" points="67,36 75,38 72,46 61,43" />
    <polygon fill="#fff2c7" opacity="0.82" points="56,34 67,31 63,39" />
    <ellipse fill="#ffcf74" opacity="0.28" cx="67" cy="56" rx="28" ry="6" />
  `),
  fire: () => artSvg(`
    <polygon fill="#352f2a" points="0,50 20,41 43,44 66,38 96,48 96,64 0,64" />
    <polygon fill="#d7dde0" points="24,50 64,18 69,22 29,55" />
    <polygon fill="#7a4c30" points="18,54 28,47 34,54 24,60" />
    <polygon fill="#ff6b32" points="54,49 44,39 48,28 58,36 62,20 73,36 78,47 68,58" />
    <polygon fill="#ffd06b" points="60,50 54,41 58,34 64,41 68,30 72,43 70,53" />
    <polygon fill="#fff2c7" points="63,51 60,45 64,41 67,47" />
  `),
  thorns: () => artSvg(`
    <polygon fill="#243928" points="0,50 22,41 44,43 68,38 96,49 96,64 0,64" />
    <polygon fill="#9bbb6d" points="45,12 68,22 63,49 45,58 27,49 22,22" />
    <polygon fill="#314d2b" points="45,17 62,24 58,45 45,52 32,45 28,24" />
    <path fill="none" stroke="#d1f0a0" stroke-width="3" stroke-linecap="round" d="M18 46 C31 35 34 26 45 22 C55 18 64 21 78 13" />
    <path fill="none" stroke="#79b657" stroke-width="3" stroke-linecap="round" d="M17 55 C30 45 45 43 55 34 C62 28 66 21 78 18" />
    <polygon fill="#fff2c7" points="26,33 32,28 34,38" />
    <polygon fill="#fff2c7" points="58,27 65,22 65,33" />
    <polygon fill="#fff2c7" points="69,46 76,43 73,53" />
  `),
  judgment: () => artSvg(`
    <polygon fill="#302d2a" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#f4edcf" points="47,5 54,5 53,40 48,48 43,40" />
    <polygon fill="#aeb9bd" points="47,5 49,40 44,40" />
    <polygon fill="#d6aa4a" points="27,38 68,38 73,43 51,45 23,43" />
    <polygon fill="#6a4930" points="45,44 52,44 53,57 44,57" />
    <polygon fill="#d6aa4a" points="48,54 55,59 48,63 41,59" />
    <path fill="none" stroke="#ffe58a" stroke-width="2.5" d="M48 2 L48 13 M25 12 L34 21 M72 12 L62 22 M17 31 L31 32 M80 31 L66 32" />
    <polygon fill="#ffe58a" opacity="0.38" points="48,2 76,35 62,60 34,60 20,35" />
  `),
  bodyForging: () => artSvg(`
    <polygon fill="#3b2d28" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#9c5b43" points="30,22 41,12 55,12 67,22 63,49 48,58 33,49" />
    <polygon fill="#d99a74" points="39,14 48,8 57,14 54,26 42,26" />
    <polygon fill="#754330" points="34,28 46,23 48,35 50,23 62,28 59,48 48,55 37,48" />
    <polygon fill="#e9b084" points="31,25 20,34 24,43 39,32" />
    <polygon fill="#e9b084" points="65,25 76,34 72,43 57,32" />
    <polygon fill="#f0c46b" points="48,29 54,36 52,47 48,51 44,47 42,36" />
    <path fill="none" stroke="#ffe0a0" stroke-width="2.4" d="M48 32 L48 47 M39 39 L45 42 M57 39 L51 42" />
    <polygon fill="#d9875f" points="14,18 21,9 28,18 25,31 17,31" />
    <path fill="none" stroke="#ffe0a0" stroke-width="2" d="M21 12 L21 27 M16 21 L26 21" />
  `),
  toughness: () => artSvg(`
    <polygon fill="#3a352b" points="0,52 18,42 45,44 69,38 96,49 96,64 0,64" />
    <polygon fill="#fff2c7" opacity="0.18" points="48,7 76,27 68,57 48,62 28,57 20,27" />
    <path fill="none" stroke="#c4b06e" stroke-width="3" d="M25 52 C24 31 35 14 48 11 C61 14 72 31 71 52" />
    <polygon fill="#d1ad78" points="48,12 58,23 39,23" />
    <polygon fill="#6d744b" points="38,24 59,24 64,48 48,56 32,48" />
    <polygon fill="#4d5639" points="42,30 54,30 57,46 48,51 39,46" />
    <polygon fill="#d7a878" points="25,31 34,29 46,39 40,44" />
    <polygon fill="#d7a878" points="71,31 62,29 50,39 56,44" />
    <polygon fill="#f1c58a" points="36,39 46,35 51,40 41,47" />
    <polygon fill="#f1c58a" points="60,39 50,35 45,40 55,47" />
    <polygon fill="#fff2c7" opacity="0.6" points="34,30 43,35 39,39 29,34" />
    <polygon fill="#fff2c7" opacity="0.42" points="62,30 53,35 57,39 67,34" />
  `),
  protection: () => artSvg(`
    <polygon fill="#22364a" points="0,51 19,42 42,44 69,37 96,48 96,64 0,64" />
    <path fill="#8fc8ff" opacity="0.24" d="M20 51 C25 24 41 12 50 11 C66 13 76 28 78 51 Z" />
    <path fill="none" stroke="#dcefff" stroke-width="3" d="M20 51 C25 24 41 12 50 11 C66 13 76 28 78 51" />
    <polygon fill="#dcefff" points="49,17 66,24 62,44 49,53 36,44 32,24" />
    <polygon fill="#557fc9" points="49,22 60,27 57,41 49,47 41,41 38,27" />
    <polygon fill="#fff2c7" opacity="0.72" points="31,26 39,20 36,31" />
    <polygon fill="#fff2c7" opacity="0.5" points="67,33 74,42 65,40" />
  `),
  block: () => artSvg(`
    <polygon fill="#2c3338" points="0,51 19,42 42,44 69,37 96,48 96,64 0,64" />
    <path fill="#d8dde0" opacity="0.28" d="M20 51 C24 28 39 12 50 10 C64 13 76 28 78 51 C64 59 35 59 20 51 Z" />
    <path fill="none" stroke="#eef7ff" stroke-width="3" d="M20 51 C24 28 39 12 50 10 C64 13 76 28 78 51" />
    <polygon fill="#8f9a9b" points="50,16 67,25 63,45 50,55 37,45 33,25" />
    <polygon fill="#4f6f78" points="50,22 60,28 57,41 50,48 43,41 40,28" />
    <polygon fill="#fff2c7" points="26,53 70,53 72,58 24,58" />
    <polygon fill="#6a4a30" points="30,54 64,54 63,57 31,57" />
    <path fill="none" stroke="#ffffff" stroke-width="2" opacity="0.64" d="M35 30 L50 21 L65 30" />
    <circle fill="#eef7ff" opacity="0.74" cx="67" cy="20" r="3" />
  `),
  power: () => artSvg(`
    <polygon fill="#3a2e26" points="0,51 19,40 44,43 68,38 96,48 96,64 0,64" />
    <polygon fill="#fff2c7" opacity="0.26" points="47,4 66,34 47,60 28,34" />
    <polygon fill="#e8eef0" points="44,9 52,9 51,43 45,43" />
    <polygon fill="#f7d474" points="40,43 56,43 58,50 38,50" />
    <polygon fill="#7b4f2f" points="45,50 51,50 52,59 44,59" />
    <polygon fill="#f0b84d" points="23,30 36,27 31,36" />
    <polygon fill="#f0b84d" points="73,30 60,27 65,36" />
    <polygon fill="#ffe69f" points="47,14 50,33 46,33" />
  `),
  heavyStrike: () => artSvg(`
    <polygon fill="#3a2e26" points="0,51 19,40 44,43 68,38 96,48 96,64 0,64" />
    <polygon fill="#c8a56a" opacity="0.28" points="47,4 66,34 47,60 28,34" />
    <rect fill="#d8dde0" x="42" y="10" width="12" height="34" rx="1" />
    <polygon fill="#f7d474" points="40,43 56,43 58,50 38,50" />
    <polygon fill="#7b4f2f" points="45,50 51,50 52,59 44,59" />
    <path fill="none" stroke="#ffe08a" stroke-width="3" stroke-linecap="round" d="M24 36 H72" />
    <polygon fill="#f0b84d" points="68,28 78,34 68,40" />
  `),
  quickStrike: () => artSvg(`
    <polygon fill="#3a2818" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#ffb347" opacity="0.22" cx="50" cy="38" rx="34" ry="20" />
    <path fill="none" stroke="#ffd89a" stroke-width="4" stroke-linecap="round" d="M22 44 L48 18 L74 44" />
    <path fill="none" stroke="#fff2c7" stroke-width="3" stroke-linecap="round" d="M30 52 L48 30 L66 52" />
    <polygon fill="#ffb347" points="48,12 58,24 52,40 44,40 38,24" />
    <circle fill="#fff2c7" cx="24" cy="36" r="3" />
    <circle fill="#fff2c7" opacity="0.72" cx="76" cy="36" r="3" />
  `),
  explosion: () => artSvg(`
    <polygon fill="#3a2a24" points="0,51 19,40 44,43 68,38 96,48 96,64 0,64" />
    <circle fill="#ff6b35" opacity="0.92" cx="49" cy="35" r="19" />
    <circle fill="#ffb45c" opacity="0.86" cx="49" cy="35" r="12" />
    <circle fill="#fff2c7" opacity="0.92" cx="49" cy="35" r="6" />
    <polygon fill="#ffb45c" points="48,6 55,25 42,25" />
    <polygon fill="#ffb45c" points="48,64 41,45 56,45" />
    <polygon fill="#ff8c3a" points="18,21 38,28 29,39" />
    <polygon fill="#ff8c3a" points="80,20 67,39 58,28" />
    <polygon fill="#ffd166" points="15,47 35,41 34,54" />
    <polygon fill="#ffd166" points="82,47 63,54 62,41" />
    <circle fill="#fff2c7" opacity="0.7" cx="33" cy="20" r="3" />
    <circle fill="#fff2c7" opacity="0.55" cx="69" cy="51" r="3" />
  `),
  critical: () => artSvg(`
    <polygon fill="#342923" points="0,51 19,40 44,43 68,38 96,48 96,64 0,64" />
    <polygon fill="#ffd166" opacity="0.28" points="48,4 58,25 82,26 63,40 70,61 48,49 26,61 33,40 14,26 38,25" />
    <polygon fill="#e8eef0" points="45,11 53,11 52,42 46,42" />
    <polygon fill="#ffd166" points="39,42 59,42 61,49 37,49" />
    <polygon fill="#6a3f2b" points="45,49 52,49 53,61 44,61" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" stroke-linecap="round" d="M24 24 L72 52" />
    <path fill="none" stroke="#ff9f43" stroke-width="3" stroke-linecap="round" d="M72 24 L24 52" />
    <circle fill="#fff2c7" cx="72" cy="24" r="5" />
    <circle fill="#ffd166" opacity="0.86" cx="24" cy="52" r="4" />
  `),
  focus: () => artSvg(`
    <polygon fill="#22313e" points="0,51 19,42 43,44 70,38 96,48 96,64 0,64" />
    <ellipse fill="#b7e8ff" opacity="0.18" cx="48" cy="38" rx="34" ry="21" />
    <circle fill="#dff8ff" opacity="0.32" cx="48" cy="35" r="24" />
    <circle fill="none" stroke="#b7e8ff" stroke-width="4" opacity="0.78" cx="48" cy="35" r="18" />
    <circle fill="none" stroke="#fff2c7" stroke-width="3" opacity="0.7" cx="48" cy="35" r="8" />
    <path fill="none" stroke="#dff8ff" stroke-width="3" stroke-linecap="round" d="M48 10 L48 22 M48 48 L48 60 M23 35 L35 35 M61 35 L74 35" />
    <polygon fill="#e8eef0" points="45,17 52,17 51,54 46,54" />
    <polygon fill="#8ac7e8" points="40,42 58,42 60,49 38,49" />
    <circle fill="#fff2c7" cx="48" cy="35" r="4" />
    <path fill="none" stroke="#b7e8ff" stroke-width="2" opacity="0.75" d="M28 54 C40 48 56 48 68 54" />
  `),
  phoenix: () => artSvg(`
    <polygon fill="#3a2e26" points="0,51 19,40 44,43 68,38 96,48 96,64 0,64" />
    <path fill="#ff6b32" d="M48 59 C31 48 26 30 38 16 C39 30 50 31 52 10 C67 22 71 42 48 59 Z" />
    <path fill="#ffd06b" d="M49 53 C39 44 38 31 46 22 C47 32 55 33 56 20 C64 31 63 43 49 53 Z" />
    <path fill="#fff2c7" d="M49 46 C45 41 46 35 50 31 C51 36 55 37 55 32 C59 38 56 43 49 46 Z" />
    <polygon fill="#ff9a47" points="34,34 15,24 27,43" />
    <polygon fill="#ff9a47" points="62,34 82,23 70,43" />
    <circle fill="#fff2c7" opacity="0.85" cx="49" cy="27" r="3" />
    <path fill="none" stroke="#fff2c7" stroke-width="2" opacity="0.7" d="M27 52 C40 60 57 60 70 52" />
  `),
  rebirthTotem: () => artSvg(`
    <polygon fill="#2f3128" points="0,52 19,42 43,44 70,38 96,49 96,64 0,64" />
    <ellipse fill="#f1d97a" opacity="0.2" cx="48" cy="45" rx="36" ry="15" />
    <polygon fill="#6a5630" points="42,30 54,30 57,57 39,57" />
    <polygon fill="#8f743e" points="37,21 59,21 64,33 48,42 32,33" />
    <polygon fill="#f1d97a" points="48,11 58,25 48,36 38,25" />
    <polygon fill="#fff2c7" points="48,17 53,25 48,31 43,25" />
    <path fill="none" stroke="#f1d97a" stroke-width="3" stroke-linecap="round" d="M22 48 C35 36 61 36 74 48" />
    <path fill="none" stroke="#fff2c7" stroke-width="2" opacity="0.72" d="M29 54 C40 47 56 47 67 54" />
    <circle fill="#fff2c7" cx="27" cy="38" r="4" />
    <circle fill="#f1d97a" opacity="0.82" cx="70" cy="35" r="5" />
    <circle fill="#fff2c7" opacity="0.7" cx="48" cy="6" r="3" />
  `),
  spiritWeapon: () => artSvg(`
    <polygon fill="#22313e" points="0,51 19,42 43,44 70,38 96,48 96,64 0,64" />
    <polygon fill="#dff8ff" opacity="0.22" points="48,5 70,31 48,60 26,31" />
    <polygon fill="#e8eef0" points="45,8 53,8 52,43 46,43" />
    <polygon fill="#9dd8ff" points="41,42 57,42 59,50 39,50" />
    <polygon fill="#5a3a28" points="45,50 51,50 52,60 44,60" />
    <path fill="none" stroke="#dff8ff" stroke-width="3" opacity="0.85" d="M23 40 C34 22 62 22 74 40" />
    <circle fill="#ffffff" cx="31" cy="35" r="3" />
    <circle fill="#ffffff" opacity="0.7" cx="67" cy="35" r="3" />
    <path fill="none" stroke="#fff2c7" stroke-width="2" opacity="0.64" d="M32 54 C43 48 53 48 64 54" />
  `),
  soulEater: () => artSvg(`
    <polygon fill="#302638" points="0,51 19,42 43,44 70,38 96,48 96,64 0,64" />
    <ellipse fill="#9f6bff" opacity="0.22" cx="49" cy="43" rx="35" ry="16" />
    <polygon fill="#593a78" points="49,9 70,26 63,52 49,60 35,52 28,26" />
    <polygon fill="#24172f" points="49,18 62,29 58,47 49,53 40,47 36,29" />
    <circle fill="#caa7ff" cx="42" cy="34" r="5" />
    <circle fill="#caa7ff" cx="56" cy="34" r="5" />
    <polygon fill="#caa7ff" points="45,45 53,45 49,50" />
    <path fill="none" stroke="#d8b7ff" stroke-width="2" opacity="0.7" d="M17 48 C30 29 39 57 49 38 C58 20 69 50 82 31" />
  `),
  lifesteal: () => artSvg(`
    <polygon fill="#3a2729" points="0,51 18,41 43,44 68,37 96,49 96,64 0,64" />
    <path fill="#b54848" d="M48 56 C28 42 25 24 38 16 C45 12 49 19 49 19 C49 19 54 12 61 16 C74 24 69 43 48 56 Z" />
    <path fill="#ff9b9b" opacity="0.58" d="M48 49 C36 39 35 27 42 23 C47 20 49 25 49 25 C49 25 52 20 57 23 C65 28 60 40 48 49 Z" />
    <polygon fill="#d8dde0" points="29,52 66,18 72,24 36,57" />
    <polygon fill="#5a2a2a" points="23,57 34,49 40,56 29,62" />
    <path fill="none" stroke="#fff2c7" stroke-width="2" opacity="0.55" d="M31 51 C45 45 55 36 67 23" />
  `),
  drain: () => artSvg(`
    <polygon fill="#233832" points="0,51 18,41 43,44 68,37 96,49 96,64 0,64" />
    <ellipse fill="#7fd8b0" opacity="0.18" cx="50" cy="42" rx="34" ry="17" />
    <polygon fill="#d8dde0" points="28,52 64,18 70,24 35,57" />
    <polygon fill="#4a3026" points="22,57 33,49 39,56 28,62" />
    <circle fill="#7fd8b0" cx="68" cy="22" r="8" />
    <circle fill="#b7f3dd" opacity="0.85" cx="68" cy="22" r="4" />
    <path fill="none" stroke="#7fd8b0" stroke-width="4" stroke-linecap="round" opacity="0.88" d="M74 20 C82 27 79 41 66 43 C54 45 47 37 36 47" />
    <path fill="none" stroke="#dff8ff" stroke-width="2" stroke-linecap="round" opacity="0.7" d="M72 27 C74 36 65 38 56 36 C47 34 42 41 35 50" />
    <circle fill="#7fd8b0" opacity="0.7" cx="80" cy="37" r="4" />
    <circle fill="#b7f3dd" opacity="0.6" cx="58" cy="46" r="3" />
  `),
  poison: () => artSvg(`
    <polygon fill="#253a29" points="0,51 18,41 43,44 68,37 96,49 96,64 0,64" />
    <polygon fill="#dcefd0" points="45,13 59,13 57,22 47,22" />
    <polygon fill="#a2d77a" points="35,24 67,24 72,50 51,58 30,50" />
    <polygon fill="#5f9f4f" points="39,29 64,29 67,47 51,53 35,47" />
    <circle fill="#dff6a5" cx="44" cy="41" r="4" />
    <circle fill="#dff6a5" cx="58" cy="39" r="4" />
    <polygon fill="#2b542d" points="48,48 54,48 51,52" />
    <circle fill="#98d66a" opacity="0.8" cx="70" cy="18" r="4" />
    <circle fill="#98d66a" opacity="0.55" cx="25" cy="25" r="3" />
  `),
  poisonFog: () => artSvg(`
    <polygon fill="#253a29" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#78b85a" opacity="0.32" cx="48" cy="44" rx="39" ry="14" />
    <ellipse fill="#a2d77a" opacity="0.38" cx="34" cy="38" rx="18" ry="10" />
    <ellipse fill="#5f9f4f" opacity="0.42" cx="60" cy="36" rx="23" ry="12" />
    <ellipse fill="#dff6a5" opacity="0.35" cx="51" cy="29" rx="13" ry="8" />
    <circle fill="#dff6a5" cx="35" cy="36" r="4" />
    <circle fill="#dff6a5" opacity="0.72" cx="63" cy="34" r="5" />
    <circle fill="#98d66a" opacity="0.85" cx="72" cy="24" r="4" />
    <circle fill="#98d66a" opacity="0.65" cx="23" cy="28" r="3" />
    <path fill="none" stroke="#dff6a5" stroke-width="2" opacity="0.58" d="M18 44 C33 32 47 48 61 34 C70 25 80 30 86 24" />
  `),
  whiteSmoke: () => artSvg(`
    <polygon fill="#27333a" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#eef7ff" opacity="0.42" cx="49" cy="45" rx="40" ry="14" />
    <ellipse fill="#ffffff" opacity="0.56" cx="32" cy="39" rx="19" ry="10" />
    <ellipse fill="#dbe8ef" opacity="0.64" cx="58" cy="36" rx="24" ry="13" />
    <ellipse fill="#f8fbff" opacity="0.68" cx="50" cy="28" rx="14" ry="9" />
    <circle fill="#ffffff" opacity="0.82" cx="72" cy="24" r="5" />
    <circle fill="#dff8ff" opacity="0.78" cx="24" cy="29" r="4" />
    <circle fill="#ffffff" opacity="0.72" cx="40" cy="24" r="3" />
    <path fill="none" stroke="#ffffff" stroke-width="2" opacity="0.78" d="M14 43 C29 31 43 48 56 35 C66 25 78 33 87 24" />
    <path fill="none" stroke="#dff8ff" stroke-width="2" opacity="0.55" d="M22 53 C40 43 56 56 75 43" />
  `),
  tacticEnergySmall: () => artSvg(`
    <polygon fill="#2c3040" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#7f8fc7" opacity="0.2" cx="48" cy="43" rx="35" ry="16" />
    <polygon fill="#fff2c7" points="48,6 62,31 50,31 57,58 35,26 47,26" />
    <polygon fill="#7f8fc7" points="47,13 57,29 48,29 52,47 39,28 48,28" />
    <circle fill="#dff8ff" opacity="0.75" cx="28" cy="34" r="5" />
    <circle fill="#dff8ff" opacity="0.58" cx="71" cy="25" r="4" />
    <circle fill="#fff2c7" opacity="0.7" cx="68" cy="49" r="3" />
    <path fill="none" stroke="#dff8ff" stroke-width="2" opacity="0.7" d="M21 50 C35 38 59 53 76 34" />
  `),
  tacticEnergyLarge: () => artSvg(`
    <polygon fill="#252f46" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#7f8fc7" opacity="0.26" cx="48" cy="42" rx="38" ry="18" />
    <polygon fill="#fff2c7" points="47,3 66,31 52,31 60,62 31,25 45,25" />
    <polygon fill="#ffd166" points="48,11 59,29 49,29 54,50 38,28 48,28" />
    <path fill="none" stroke="#dff8ff" stroke-width="4" opacity="0.72" d="M18 42 C32 18 64 18 79 42" />
    <circle fill="#dff8ff" cx="25" cy="43" r="4" />
    <circle fill="#dff8ff" opacity="0.72" cx="73" cy="43" r="4" />
    <circle fill="#fff2c7" opacity="0.72" cx="49" cy="20" r="4" />
  `),
  tacticSilverGamble: () => artSvg(`
    <polygon fill="#3a3020" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#d8b85a" opacity="0.24" cx="48" cy="42" rx="36" ry="17" />
    <circle fill="#ffe08a" cx="34" cy="34" r="12" />
    <circle fill="#fff2c7" cx="34" cy="34" r="7" />
    <circle fill="#ffe08a" cx="62" cy="38" r="10" />
    <circle fill="#fff2c7" cx="62" cy="38" r="6" />
    <path fill="none" stroke="#fff2c7" stroke-width="3" opacity="0.85" d="M24 18 L72 52" />
    <path fill="none" stroke="#d8a0a0" stroke-width="2.5" opacity="0.8" d="M72 18 L24 52" />
    <text x="48" y="24" text-anchor="middle" fill="#fff2c7" font-size="11" font-weight="700">x2</text>
    <text x="48" y="58" text-anchor="middle" fill="#d8a0a0" font-size="10" font-weight="700">÷2</text>
  `),
  tacticUpgrade: () => artSvg(`
    <polygon fill="#302638" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#8a6fc4" opacity="0.28" points="48,5 78,27 67,58 29,58 18,27" />
    <polygon fill="#dff8ff" points="48,10 58,29 50,29 50,54 46,54 46,29 38,29" />
    <polygon fill="#fff2c7" points="31,37 65,37 65,44 31,44" />
    <polygon fill="#9f6bff" points="48,17 53,30 48,38 43,30" />
    <circle fill="#fff2c7" opacity="0.76" cx="26" cy="28" r="4" />
    <circle fill="#dff8ff" opacity="0.66" cx="70" cy="53" r="4" />
    <path fill="none" stroke="#caa7ff" stroke-width="2" opacity="0.75" d="M22 51 C34 42 58 41 74 27" />
  `),
  tacticExhaust: () => artSvg(`
    <polygon fill="#3a272c" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#f3e1c0" points="31,13 65,13 70,54 26,54" />
    <polygon fill="#9f6b70" points="35,18 61,18 64,49 32,49" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" stroke-linecap="round" d="M29 24 L67 50 M67 24 L29 50" />
    <polygon fill="#3a272c" opacity="0.72" points="24,54 72,54 67,61 29,61" />
    <circle fill="#fff2c7" opacity="0.7" cx="25" cy="19" r="4" />
    <circle fill="#ffb3b3" opacity="0.58" cx="72" cy="37" r="5" />
    <path fill="none" stroke="#ffb3b3" stroke-width="2" opacity="0.72" d="M20 47 C35 58 60 58 76 45" />
  `),
  abilityExhaustEnergy: () => artSvg(`
    <polygon fill="#203832" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#f3e1c0" points="28,15 62,12 69,50 35,56" />
    <polygon fill="#7fd8b0" points="34,21 57,19 62,45 39,49" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" stroke-linecap="round" d="M31 30 L62 42 M63 25 L35 48" />
    <polygon fill="#fff2c7" points="74,11 84,28 76,28 80,47 66,24 74,24" />
    <circle fill="#b7f3dd" opacity="0.82" cx="73" cy="48" r="5" />
  `),
  abilityPeriodicEnergy: () => artSvg(`
    <polygon fill="#252f46" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <circle fill="#7f8fc7" opacity="0.3" cx="48" cy="35" r="25" />
    <circle fill="none" stroke="#dff8ff" stroke-width="4" cx="48" cy="35" r="19" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" stroke-linecap="round" d="M48 35 L48 21 M48 35 L61 42" />
    <polygon fill="#fff2c7" points="24,41 35,28 36,45" />
    <polygon fill="#dff8ff" points="72,28 61,42 60,25" />
    <circle fill="#fff2c7" cx="48" cy="35" r="5" />
  `),
  abilityEnchantEcho: () => artSvg(`
    <polygon fill="#302638" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#b68cff" opacity="0.28" points="48,6 74,25 64,56 32,56 22,25" />
    <polygon fill="#d8dde0" points="31,51 60,20 66,26 38,56" />
    <polygon fill="#fff2c7" opacity="0.82" points="43,46 70,17 75,22 49,51" />
    <path fill="none" stroke="#caa7ff" stroke-width="3" opacity="0.85" d="M21 42 C33 24 47 58 59 38 C68 23 75 35 82 25" />
    <circle fill="#fff2c7" cx="75" cy="23" r="4" />
  `),
  abilityFireSpread: () => artSvg(`
    <polygon fill="#3a2418" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#ff823d" opacity="0.24" cx="48" cy="42" rx="36" ry="16" />
    <polygon fill="#ff823d" points="48,8 58,28 50,28 54,52 42,52 46,28 38,28" />
    <polygon fill="#ffd166" points="48,16 54,28 48,28 50,44 46,44 46,28 42,28" />
    <circle fill="#ffb45c" cx="28" cy="34" r="7" />
    <circle fill="#ffb45c" cx="68" cy="36" r="6" />
    <path fill="none" stroke="#ffe08a" stroke-width="2.5" opacity="0.85" d="M34 34 C42 26 54 30 62 36" />
    <path fill="none" stroke="#ffe08a" stroke-width="2.5" opacity="0.75" d="M28 40 C36 48 46 44 56 50" />
  `),
  plagueFog: () => artSvg(`
    <polygon fill="#243020" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#6a8a48" opacity="0.34" cx="48" cy="44" rx="39" ry="14" />
    <ellipse fill="#8aa860" opacity="0.36" cx="33" cy="38" rx="17" ry="10" />
    <ellipse fill="#4a6038" opacity="0.42" cx="61" cy="36" rx="22" ry="12" />
    <circle fill="#b8d88a" cx="36" cy="36" r="4" />
    <circle fill="#b8d88a" opacity="0.72" cx="58" cy="34" r="5" />
    <path fill="none" stroke="#dff6a5" stroke-width="2" opacity="0.65" d="M24 48 C36 36 56 52 74 40" />
    <polygon fill="#6a8a48" points="48,18 52,24 44,24" />
  `),
  abilityDeathExplosion: () => artSvg(`
    <polygon fill="#3a2a24" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#d8dde0" points="47,13 57,24 39,24" />
    <polygon fill="#6f718a" points="37,24 60,24 65,49 49,58 32,49" />
    <circle fill="#ff6b35" opacity="0.95" cx="63" cy="38" r="15" />
    <circle fill="#ffb45c" cx="63" cy="38" r="9" />
    <circle fill="#fff2c7" cx="63" cy="38" r="4" />
    <polygon fill="#ffd166" points="63,13 68,29 58,29" />
    <polygon fill="#ffd166" points="84,38 69,43 69,33" />
  `),
  abilityBuildingDurability: () => artSvg(`
    <polygon fill="#343128" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#777d78" points="21,55 75,55 68,63 28,63" />
    <polygon fill="#8b6840" points="25,30 71,30 73,55 23,55" />
    <polygon fill="#d8c58d" points="48,8 79,31 17,31" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" d="M24 51 C27 29 39 18 49 17 C61 19 71 30 73 51" />
    <polygon fill="#d8dde0" points="48,22 63,29 60,45 48,53 36,45 33,29" />
    <polygon fill="#6b9ab8" points="48,28 56,32 54,42 48,47 42,42 40,32" />
  `),
  abilityRandomHeal: () => artSvg(`
    <polygon fill="#243a2b" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#6edc8b" opacity="0.2" cx="49" cy="40" rx="36" ry="19" />
    <path fill="#6edc8b" d="M48 56 C29 43 25 25 38 17 C45 13 49 20 49 20 C49 20 54 13 61 17 C74 25 68 44 48 56 Z" />
    <polygon fill="#fff2c7" points="45,25 53,25 53,35 64,35 64,43 53,43 53,53 45,53 45,43 34,43 34,35 45,35" />
    <circle fill="#bff2c4" cx="25" cy="30" r="5" />
    <circle fill="#bff2c4" opacity="0.72" cx="74" cy="34" r="5" />
    <path fill="none" stroke="#fff2c7" stroke-width="2" opacity="0.72" d="M20 50 C33 43 63 43 77 28" />
  `),
  abilityVictoryGold: () => artSvg(`
    <polygon fill="#3a3426" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <circle fill="#ffd166" cx="48" cy="34" r="24" />
    <circle fill="#9a6b2f" opacity="0.35" cx="48" cy="34" r="18" />
    <path fill="none" stroke="#fff2c7" stroke-width="5" stroke-linecap="round" d="M38 29 C42 20 60 20 59 31 C58 44 39 35 38 47 C37 56 57 55 62 47" />
    <polygon fill="#fff2c7" points="48,4 56,17 40,17" />
    <polygon fill="#fff2c7" points="48,64 40,51 56,51" />
    <circle fill="#fff2c7" opacity="0.78" cx="75" cy="24" r="4" />
  `),
  abilityWarDrum: () => artSvg(`
    <polygon fill="#3a3424" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#8b5a2b" cx="48" cy="38" rx="24" ry="18" />
    <ellipse fill="#ffd166" cx="48" cy="38" rx="16" ry="11" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" stroke-linecap="round" d="M30 38 L66 38 M48 24 L48 52" />
    <circle fill="#fff2c7" cx="24" cy="22" r="4" />
    <circle fill="#ffb45c" cx="74" cy="24" r="5" />
  `),
  abilityArsenal: () => artSvg(`
    <polygon fill="#343128" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#777d78" points="24,55 72,55 66,63 30,63" />
    <polygon fill="#d8c58d" points="34,18 62,18 58,52 38,52" />
    <polygon fill="#fff2c7" points="48,12 54,22 42,22" />
    <rect fill="#5a4630" x="44" y="24" width="8" height="24" rx="2" />
    <path fill="none" stroke="#fff2c7" stroke-width="3" d="M22 40 L34 28 M74 40 L62 28" />
  `),
  abilityBloodRage: () => artSvg(`
    <polygon fill="#3a2424" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#6f718a" points="37,24 60,24 65,49 49,58 32,49" />
    <circle fill="#ff6b5a" opacity="0.92" cx="63" cy="36" r="16" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" stroke-linecap="round" d="M48 18 L48 30 M42 24 L54 24" />
    <path fill="none" stroke="#ffb3b3" stroke-width="3" d="M22 44 C34 56 62 56 76 42" />
  `),
  abilityDotAmplify: () => artSvg(`
    <polygon fill="#243428" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <circle fill="#78b85a" opacity="0.35" cx="48" cy="34" r="24" />
    <circle fill="none" stroke="#dff6a5" stroke-width="4" cx="48" cy="34" r="16" />
    <circle fill="#78b85a" cx="48" cy="34" r="7" />
    <path fill="none" stroke="#fff2c7" stroke-width="3" stroke-linecap="round" d="M24 48 C34 28 62 28 72 48" />
    <circle fill="#dff6a5" cx="24" cy="22" r="4" />
  `),
  tacticCorrupt: () => artSvg(`
    <polygon fill="#3a272c" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#f3e1c0" points="28,15 62,12 69,50 35,56" />
    <polygon fill="#9f6b70" points="34,21 57,19 62,45 39,49" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" stroke-linecap="round" d="M31 30 L62 42" />
    <circle fill="#fff2c7" cx="72" cy="20" r="8" />
    <text x="72" y="24" text-anchor="middle" fill="#3a272c" font-size="11" font-weight="700">0</text>
  `),
  meteorBarrage: () => artSvg(`
    <polygon fill="#3a2424" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <circle fill="#9a3f35" opacity="0.35" cx="48" cy="36" r="24" />
    <polygon fill="#b04a38" points="22,18 30,34 14,34" />
    <polygon fill="#d85a45" points="48,10 56,28 40,28" />
    <polygon fill="#9a3f35" points="74,16 82,32 66,32" />
    <circle fill="#ffb45c" cx="48" cy="44" r="10" />
    <circle fill="#fff2c7" cx="48" cy="44" r="4" />
  `),
  tacticRallyEnergy: () => artSvg(`
    <polygon fill="#252f46" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <circle fill="#7f8fc7" opacity="0.28" cx="48" cy="36" r="22" />
    <polygon fill="#6f718a" points="30,40 42,28 54,28 66,40 58,52 38,52" />
    <polygon fill="#fff2c7" points="48,14 56,30 40,30" />
    <circle fill="#dff8ff" cx="24" cy="24" r="5" />
    <circle fill="#dff8ff" cx="72" cy="24" r="5" />
    <circle fill="#fff2c7" cx="48" cy="36" r="6" />
  `),
  tacticHuntMark: () => artSvg(`
    <polygon fill="#3a2424" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <circle fill="none" stroke="#ff8866" stroke-width="4" cx="48" cy="36" r="20" />
    <circle fill="none" stroke="#ffb18a" stroke-width="2" cx="48" cy="36" r="12" />
    <circle fill="#ff8866" cx="48" cy="36" r="5" />
    <path fill="none" stroke="#fff2c7" stroke-width="3" stroke-linecap="round" d="M48 16 L48 24 M48 48 L48 56 M28 36 L36 36 M60 36 L68 36" />
  `),
  bleed: () => artSvg(`
    <polygon fill="#3a2729" points="0,51 18,41 43,44 68,37 96,49 96,64 0,64" />
    <polygon fill="#d8dde0" points="25,50 66,15 72,21 31,56" />
    <polygon fill="#7a4c30" points="18,54 29,47 35,54 24,60" />
    <polygon fill="#ffffff" opacity="0.45" points="42,36 66,18 69,21 45,39" />
    <path fill="#d65b4f" d="M62 35 C72 43 77 50 76 56 C75 62 66 62 63 57 C60 52 63 45 62 35 Z" />
    <path fill="#8f2f36" d="M45 42 C53 48 56 54 54 59 C51 64 43 61 42 56 C41 52 45 47 45 42 Z" />
    <circle fill="#d65b4f" cx="75" cy="31" r="4" />
    <circle fill="#8f2f36" opacity="0.82" cx="30" cy="28" r="3" />
    <path fill="none" stroke="#f6c0b0" stroke-width="2" opacity="0.7" d="M28 50 C42 46 54 42 67 35" />
  `),
  recovery: () => artSvg(`
    <polygon fill="#243a2b" points="0,51 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#f5e4b7" points="45,18 54,18 54,31 67,31 67,40 54,40 54,53 45,53 45,40 32,40 32,31 45,31" />
    <path fill="#6edc8b" d="M50 38 C42 27 35 22 25 20 C27 34 36 41 50 38 Z" />
    <path fill="#4b9f65" d="M50 39 C59 27 68 22 80 22 C78 36 66 43 50 39 Z" />
    <path fill="none" stroke="#fff2c7" stroke-width="2" d="M30 24 C39 30 44 34 50 38 C59 33 66 29 76 25" />
    <circle fill="#bff2c4" opacity="0.8" cx="29" cy="48" r="3" />
    <circle fill="#bff2c4" opacity="0.65" cx="73" cy="47" r="4" />
  `),
  spiritShield: () => artSvg(`
    <polygon fill="#22313e" points="0,51 19,42 43,44 70,38 96,48 96,64 0,64" />
    <ellipse fill="#dcefff" opacity="0.22" cx="50" cy="38" rx="34" ry="21" />
    <path fill="none" stroke="#f7fbff" stroke-width="3" d="M18 39 C30 17 68 17 82 39 C68 57 31 57 18 39 Z" />
    <polygon fill="#f7fbff" points="50,14 68,23 64,44 50,56 36,44 32,23" />
    <polygon fill="#8fb7dc" points="50,20 61,26 58,40 50,49 42,40 39,26" />
    <circle fill="#ffffff" cx="32" cy="25" r="3" />
    <circle fill="#ffffff" opacity="0.7" cx="71" cy="48" r="3" />
    <circle fill="#ffffff" opacity="0.55" cx="78" cy="28" r="2" />
  `),
  swarmPack: () => artSvg(`
    <polygon fill="#223827" points="0,51 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#93c86f" opacity="0.2" cx="50" cy="40" rx="36" ry="18" />
    <polygon fill="#93c86f" points="47,12 58,23 52,41 39,41 33,23" />
    <polygon fill="#3f6f35" points="47,19 53,25 50,38 41,38 38,25" />
    <circle fill="none" stroke="#d7f6b8" stroke-width="3" cx="50" cy="38" r="18" />
    <circle fill="none" stroke="#93c86f" stroke-width="2" cx="50" cy="38" r="11" />
    <circle fill="#d7f6b8" cx="27" cy="39" r="4" />
    <circle fill="#d7f6b8" opacity="0.72" cx="66" cy="25" r="4" />
    <circle fill="#d7f6b8" opacity="0.72" cx="72" cy="48" r="4" />
  `),
  waveArmored: () => artSvg(`
    <polygon fill="#26343b" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <path fill="#9fb1c1" opacity="0.24" d="M19 52 C22 28 38 12 49 10 C65 14 77 29 79 52 C62 60 36 60 19 52 Z" />
    <path fill="none" stroke="#e8eef0" stroke-width="3" d="M19 52 C22 28 38 12 49 10 C65 14 77 29 79 52" />
    <polygon fill="#9fb1c1" points="49,16 69,25 64,47 49,57 34,47 29,25" />
    <polygon fill="#56636b" points="49,23 60,29 57,42 49,49 41,42 38,29" />
    <polygon fill="#d8c58d" points="47,20 52,20 52,53 47,53" />
    <polygon fill="#d8c58d" points="34,34 64,34 64,39 34,39" />
    <circle fill="#eef7ff" cx="29" cy="26" r="3" />
    <circle fill="#eef7ff" opacity="0.65" cx="73" cy="45" r="3" />
  `),
  waveRush: () => artSvg(`
    <polygon fill="#3a3426" points="0,51 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#ffd166" opacity="0.28" points="22,53 44,9 43,32 68,16 54,41 79,38 48,59" />
    <polygon fill="#d7a878" points="47,12 56,23 40,23" />
    <polygon fill="#8f5d2c" points="38,24 60,24 64,47 49,56 34,47" />
    <polygon fill="#2b241f" points="39,47 48,47 45,59 37,59" />
    <polygon fill="#2b241f" points="52,47 61,47 63,59 54,59" />
    <path fill="none" stroke="#fff2c7" stroke-width="4" stroke-linecap="round" d="M18 45 C34 39 44 31 55 18" />
    <path fill="none" stroke="#ffd166" stroke-width="3" stroke-linecap="round" d="M28 56 C45 51 58 42 75 23" />
    <polygon fill="#fff2c7" points="70,18 84,17 76,30" />
  `),
  waveRanged: () => artSvg(`
    <polygon fill="#22313e" points="0,51 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#b7e8ff" opacity="0.2" cx="50" cy="36" rx="36" ry="20" />
    <path fill="none" stroke="#4a3026" stroke-width="4" stroke-linecap="round" d="M68 13 C86 27 85 49 67 59" />
    <path fill="none" stroke="#dff8ff" stroke-width="2" d="M68 13 L67 59" />
    <polygon fill="#dff8ff" points="21,34 75,32 75,37 21,39" />
    <polygon fill="#b7e8ff" points="75,31 88,35 75,39" />
    <path fill="none" stroke="#dff8ff" stroke-width="2" opacity="0.75" d="M18 25 C35 19 54 18 77 12" />
    <path fill="none" stroke="#b7e8ff" stroke-width="2" opacity="0.72" d="M15 48 C35 42 56 43 82 34" />
    <circle fill="#dff8ff" cx="32" cy="25" r="3" />
    <circle fill="#dff8ff" opacity="0.62" cx="61" cy="45" r="3" />
  `),
  waveSiege: () => artSvg(`
    <polygon fill="#3a2a24" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#ffb45c" opacity="0.22" cx="50" cy="45" rx="35" ry="16" />
    <polygon fill="#6d4a2c" points="27,15 35,11 76,54 68,59" />
    <polygon fill="#8b6037" points="22,13 36,8 43,18 28,24" />
    <circle fill="#ff6b35" cx="65" cy="42" r="16" />
    <circle fill="#ffb45c" cx="65" cy="42" r="9" />
    <circle fill="#fff2c7" cx="65" cy="42" r="4" />
    <polygon fill="#ffd166" points="65,16 70,33 59,33" />
    <polygon fill="#ffd166" points="87,42 70,47 70,36" />
    <polygon fill="#fff2c7" opacity="0.68" points="39,21 66,47 62,50 35,24" />
  `),
  wolfInstinct: () => artSvg(`
    <polygon fill="#26333a" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <path fill="#dbe8e9" opacity="0.18" d="M17 49 C30 31 41 20 51 18 C65 20 76 32 82 50 C64 58 35 58 17 49 Z" />
    <polygon fill="#8ea7b8" points="48,11 61,24 58,43 49,55 38,43 35,24" />
    <polygon fill="#5f7380" points="48,17 57,27 55,41 49,49 41,41 39,27" />
    <polygon fill="#dbe8e9" points="36,24 25,14 31,32" />
    <polygon fill="#dbe8e9" points="60,24 72,14 65,32" />
    <polygon fill="#142126" points="43,33 47,36 42,37" />
    <polygon fill="#142126" points="54,33 50,36 55,37" />
    <polygon fill="#eef5e8" points="47,42 51,42 49,46" />
    <path fill="none" stroke="#dbe8e9" stroke-width="2" opacity="0.8" d="M18 51 C29 42 39 38 49 38 C59 38 70 42 82 51" />
    <circle fill="#dbe8e9" opacity="0.65" cx="24" cy="44" r="3" />
    <circle fill="#dbe8e9" opacity="0.55" cx="74" cy="44" r="3" />
    <circle fill="#dbe8e9" opacity="0.45" cx="49" cy="53" r="2" />
  `),
  ursineSpirit: () => artSvg(`
    <polygon fill="#3b3028" points="0,52 18,42 43,44 68,38 96,49 96,64 0,64" />
    <ellipse fill="#ffe3a0" opacity="0.2" cx="50" cy="38" rx="35" ry="22" />
    <polygon fill="#b98758" points="48,9 64,22 67,41 58,55 39,55 29,41 32,22" />
    <polygon fill="#7a513b" points="48,17 59,26 61,40 54,49 42,49 35,40 38,26" />
    <circle fill="#b98758" cx="34" cy="20" r="8" />
    <circle fill="#b98758" cx="62" cy="20" r="8" />
    <circle fill="#2b201b" cx="43" cy="34" r="3" />
    <circle fill="#2b201b" cx="54" cy="34" r="3" />
    <polygon fill="#fff2c7" points="45,42 51,42 48,47" />
    <path fill="none" stroke="#ffe3a0" stroke-width="3" opacity="0.72" d="M21 47 C28 27 39 15 48 12 C59 15 70 27 77 47" />
    <polygon fill="#ffe3a0" opacity="0.75" points="22,38 34,34 29,45" />
    <polygon fill="#ffe3a0" opacity="0.75" points="74,38 62,34 67,45" />
  `),
  default: () => artSvg(`
    <polygon fill="#2d3f36" points="0,51 18,42 43,44 68,38 96,49 96,64 0,64" />
    <polygon fill="#fff2c7" opacity="0.8" points="48,10 68,32 48,54 28,32" />
    <polygon fill="#6ea370" points="48,17 61,32 48,47 35,32" />
  `)
};

function symbolicUnitSvg(content) {
  return `
    <svg class="card-art-svg card-art-symbolic-svg" viewBox="0 0 96 64" focusable="false" aria-hidden="true">
      <g stroke-linejoin="round" stroke-linecap="round">
        ${content}
      </g>
    </svg>
  `;
}

function artSvg(content) {
  return `
    <svg class="card-art-svg" viewBox="0 0 96 64" focusable="false" aria-hidden="true">
      <polygon fill="rgba(255,255,255,0.08)" points="0,0 96,0 96,64 0,64" />
      <polygon fill="rgba(255,255,255,0.1)" points="0,0 42,0 23,24 0,36" />
      <polygon fill="rgba(0,0,0,0.1)" points="96,0 96,64 66,64 76,28" />
      ${content}
    </svg>
  `;
}
