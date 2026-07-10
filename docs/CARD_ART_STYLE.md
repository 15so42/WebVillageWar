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

## Prompt Pattern

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
