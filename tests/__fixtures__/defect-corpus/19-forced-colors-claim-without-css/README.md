# Class 19 — Forced Colors Claim Without CSS

**Ground truth**: helix M5 verify-extension defect class 06 (forced-colors).
Establishes that a component claiming `helixMeta.forcedColorsSupported: true`
must ship an `@media (forced-colors: active)` block in its CSS. Inheriting the
claim through `superclass` while overriding styles to a block that has no
forced-colors media query reintroduces the class-06 defect.

## What the parent has

- `hx-parent-banner` with `helixMeta.forcedColorsSupported: true`
- CSS includes `@media (forced-colors: active) { :host { background: Canvas; color: CanvasText; ... } }`
- Honors the standard forced-colors system color keywords (Canvas, CanvasText,
  LinkText) and sets `forced-color-adjust: none` where required.

## What the subclass does to reproduce the defect

- `hx-forced-colors-overclaim` extends `hx-parent-banner`
- Re-asserts `helixMeta.forcedColorsSupported: true` (also inheritable from
  parent — both signals are present)
- Sets `static override styles = overrideStyles` (REPLACES, doesn't append)
- The override styles file has no `@media (forced-colors: active)` block.
- Result: claim says yes, rendered CSS provides no Windows high-contrast
  support — the exact M5 class-06 shape.

## What the scorer must flag

- **Forced Colors** — score must be at or near 0. Issue must include
  `claim-vs-evidence-mismatch`.
- **High Contrast** — issue must include `forced-colors-media-block-missing`.
- **Confidence** — heuristic-high (regex/AST: presence of
  `@media.*forced-colors` in the resolved CSS bundle).

## Detector requirement

The detector cannot trust the inherited CEM alone — it must inspect the
subclass's resolved `styles` array and check the actual CSS contents. A
naive scorer that only reads `helixMeta.forcedColorsSupported` would pass
this fixture incorrectly.

## Files

- `parent/hx-parent-banner.ts` — claims and implements forced-colors
- `parent/hx-parent-banner.styles.ts` — has the @media block
- `parent/custom-elements.json` — helixMeta.forcedColorsSupported: true
- `subclass/hx-forced-colors-overclaim.ts` — replaces styles array
- `subclass/hx-forced-colors-overclaim.styles.ts` — no @media block
- `subclass/custom-elements.json` — superclass ref + re-asserted claim
- `expected.json` — score upper bounds the scorer must respect
