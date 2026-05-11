# Class 17 — Focus Ring Degraded

**Ground truth**: helix commit `b011d70f4` — the 8-component bump to 2px AAA
outlines. Establishes the project-wide focus-visible contract:
`outline: 2px solid var(--hx-focus-ring-color, …); outline-offset: 2px`. Any
subclass that removes or degrades this rule re-introduces the regression that
commit fixed.

## What the parent has

- `hx-parent-tab` with `:host(:focus-visible) { outline: 2px solid …; outline-offset: 2px }`
- Token-bound color via `var(--hx-focus-ring-color, #0f7078)`
- APG-conformant `tab` pattern with proper roving tabindex.

## What the subclass does to reproduce the defect

- `hx-focus-degraded` extends `hx-parent-tab`
- Appends an override style that does `:host(:focus-visible) { outline: none }`
- The cascade order is `[parent.styles, override.styles]`, so the override wins.
- Tabs are now keyboard-focusable but have no visible focus indicator → SC 2.4.7 failure.

## What the scorer must flag

- **Focus Indicator** — score must be at or near 0. Issue must include
  `focus-visible-rule-degraded`.
- **WCAG Conformance** — drop because SC 2.4.7 (Focus Visible) fails. Issue
  substring `sc-2-4-7`.
- **Confidence** — heuristic-high (clear CSS pattern: `outline: none` in a
  `:focus-visible` selector).

## Files

- `parent/hx-parent-tab.ts` — APG tab with AAA focus ring
- `parent/hx-parent-tab.styles.ts` — 2px outline contract
- `parent/custom-elements.json` — CEM with helixMeta
- `subclass/hx-focus-degraded.ts` — composes parent styles + override
- `subclass/hx-focus-degraded.styles.ts` — `outline: none` override
- `subclass/custom-elements.json` — CEM with `superclass` ref
- `expected.json` — score upper bounds the scorer must respect
