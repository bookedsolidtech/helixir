# Class 15 — AAA Cert Overclaim

**Ground truth**: helix commit `e54e069ff` — the cert-claim overclaim gap that was
closed before staging → main. A component claimed WCAG 2.2 AAA conformance for
SC 2.4.13 (Focus Appearance) while shipping a 1px focus ring; the audit caught it
in staging.

## What the parent has

- `hx-parent-button` with `helixMeta.aaa = { certified: true, criteria: [..., "2.4.13"] }`
- `:focus-visible { outline: 2px solid var(--hx-focus-ring-color, #0f7078); outline-offset: 2px; }`
- Matches the cert claim (criteria includes 2.4.13, CSS matches the 2px contract).

## What the subclass does to reproduce the defect

- `hx-cert-overclaim` extends `hx-parent-button`
- Inherits the parent's AAA cert block (also explicitly re-declares it in CEM and JSDoc)
- Overrides the focus-ring CSS to `outline: 1px solid #888; outline-offset: 0`
- Cert claim still asserts SC 2.4.13, but the 1px outline cannot meet 2.4.13's
  minimum area / thickness contract.

## What the scorer must flag

- **WCAG Conformance** — score must drop because the cert claim contradicts
  the rendered evidence. Issue must include `cert-claim-evidence-mismatch`.
- **Focus Indicator** — score must be at or near 0. Issue must include
  `focus-ring-degraded` (or equivalent — `focus-visible-rule-degraded`).
- **Confidence** — heuristic-level (CSS string match against contract); not low,
  not user-verified.

## Files

- `parent/hx-parent-button.ts` — minimal parent with AAA-compliant focus ring
- `parent/hx-parent-button.styles.ts` — 2px outline matching the cert claim
- `parent/custom-elements.json` — CEM with `helixMeta.aaa` block
- `subclass/hx-cert-overclaim.ts` — subclass that re-asserts the cert claim
- `subclass/hx-cert-overclaim.styles.ts` — 1px outline that breaks the contract
- `subclass/custom-elements.json` — CEM with `superclass` and re-asserted cert
- `expected.json` — score upper bounds the scorer must respect
