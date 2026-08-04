# Card Art Style

Village War card art should use the same low-poly ImageGen style as the current unit card refresh.

## Target Look

- Use ImageGen to create transparent PNG card art, then post-process locally.
- The visual should feel like a simple code-generated low-poly game asset, not a detailed AI fantasy illustration.
- Prefer chunky geometric silhouettes, paper-cut shapes, flat fills, and very low visible polygon counts.
- Keep equipment and effect shapes accurate and readable at small card size.
- Use large shapes and restrained colors. Avoid tiny facets, detailed anatomy, detailed faces, painterly texture, realistic 3D materials, gradients, cast shadows, scenery, text, labels, and card frames.
- Characters should use compact iconic poses. Effects, buildings, tactics, and abilities should be symbolic icons rather than scenes.
- Generate on a solid `#ff00ff` chroma-key background, remove it locally, and save final assets as transparent PNGs under `public/card-art`.

## Approved Unit Character Anchor

Use `public/card-art/swordsman-imagegen-lowpoly-v4.png` as the approved visual anchor for unit-card characters.

- Show one complete unit in a compact side or three-quarter combat pose rather than a front-facing class emblem.
- Build the figure from a small number of broad, hard-edged polygon planes. Faces stay blank or nearly featureless.
- Keep the weapon, helmet, stance, and profession silhouette readable at `96x64` card-art size.
- Prefer muted forest green, warm leather brown, desaturated steel, and one restrained class accent.
- The character art itself must remain frameless: no hexagon, badge, border, attribute row, text, scenery, ground plane, or cast shadow.
- Unit-card hand UI uses a dark forged-iron frame. Overlay the independently cropped `unit-cost-frame-v1.png` at the top-left using its original source-image proportions, then centre the energy numeral inside that component; do not reconstruct or align the housing with approximate CSS shapes. The cropped housing has its own fixed dark neutral centre and must never inherit or mix with the card-type colour. Directly below the character art, use a deliberately taller metadata row with a card-type icon on the left, the card name in the centre, and a numbered level badge on the right. Do not use text labels, sword icons, or heart icons for those edge slots. Centre the description, preserve the existing card-use system while placing its bar inside the bottom of the character-art panel, and keep the character-art region about 15% flatter than the previous hand-card layout.

## Unit Character Prompt Pattern

Use `public/card-art/swordsman-imagegen-lowpoly-v4.png` as the image reference for every unit portrait. Change the profession, equipment, pose, and restrained class accent while preserving the anchor's body proportions, front three-quarter camera, broad polygon planes, lighting, character scale, and empty padding.

```text
Create one new medieval <unit class> card-art character matching Image 1 closely in low-poly 3D style, body proportion, front three-quarter camera, lighting, simple faceted geometry, and framing. Image 1 is the approved style reference only.

Subject: one complete <unit class> facing screen-right in a compact readable pose. <Accurate profession silhouette, equipment, clothing palette, and one restrained class effect if essential.>

Center the complete character and all essential equipment with the same scale and padding as Image 1. Use broad hard-edged polygon planes, a very low visible polygon count, restrained matte medieval colors, and a blank or nearly featureless blocky face. The silhouette must remain readable at 96x64.

Use a perfectly flat solid #ff00ff chroma-key background edge-to-edge. No frame, hexagon, badge, text, UI, scenery, ground plane, cast shadow, large aura, extra particles, extra characters, or watermark. Do not use #ff00ff on the subject. Avoid flat vector art, painterly art, realism, detailed eyes, glossy plastic, texture noise, high-poly detail, and cropped equipment.
```

## Non-unit Symbolic Prompt Pattern

Use this prompt pattern for new card art:

```text
Create ONE very simple flat SVG-style icon for a tiny in-game card art slot.
Subject: <accurate card subject and key equipment/effect>.
Style: minimal flat vector SVG icon, intentionally crude low-poly, paper-cut shapes, about 10-18 large shapes total.
Composition: centered compact icon, generous padding, no crop, readable at small card size.
Background: perfectly flat solid #ff00ff chroma-key background for later background removal.
Avoid: AI fantasy illustration look, polished 3D render, many polygon facets, realistic anatomy, detailed eyes, scenery, card frame, text, labels, watermark.
```

## Processing

1. Copy the generated source image into `outputs/card-redraws/<batch>-source`.
2. Remove the chroma key with `remove_chroma_key.py`.
3. Crop to alpha bounds, center on a `512x288` transparent canvas, and lightly quantize colors to keep the low-detail look.
4. Save as `public/card-art/<artKey>-imagegen-lowpoly-vN.png`.
5. Add the asset to `BITMAP_CARD_ART` in `src/systems/CardSystem.js`.
