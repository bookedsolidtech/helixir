# Class 18 — Form Association Half-Implemented

**Ground truth**: helix commit `c669e16a9` — the setValidity wiring on slider +
file-upload. Establishes the three-signal form-association contract:

1. `static formAssociated = true`
2. `attachInternals()` called in the constructor
3. `setValidity()` called whenever the component's value or required-ness changes

Missing any of (2) or (3) renders form-association cosmetic — the component
appears form-associated to static analysis but the form sees no validity state.

## What the parent has

- `static formAssociated = true`
- `constructor() { super(); this._internals = this.attachInternals(); }`
- `_updateValidity()` that calls `this._internals.setValidity(...)` whenever
  `required` and `value` change.
- CEM `helixMeta.formAssociated: true`

## What the subclass does to reproduce the defect

- `hx-form-half` extends `hx-parent-field`
- Re-asserts `static override formAssociated = true`
- Overrides the constructor; `super()` runs (so the parent's `attachInternals()`
  call would normally fire), BUT the subclass overrides `_updateValidity` to a
  no-op so the form never gets validity updates.
- The `attach-internals-missing` signal is the harder one to detect here — the
  detector should look at the subclass's own constructor body AND check whether
  the subclass overrides validity-update methods to no-ops.

## What the scorer must flag

- **Form Association** — score must drop to roughly 25–30 (only the static
  signal is intact). Issue must include `attach-internals-missing` OR
  `internals-not-used`.
- **Form Validity** — issue must include `set-validity-not-called`.
- **Confidence** — heuristic-high (AST signal: method override with empty body).

## Deviation note

The original plan said "subclass overrides constructor without calling
`attachInternals()`". With Lit's pattern, the subclass constructor must call
`super()` which inherits the parent's `attachInternals()`. To preserve the
defect's spirit, this fixture leaves the constructor calling `super()` but
**no-ops `_updateValidity`** so `setValidity()` is never invoked on the
subclass's behalf. The CEM also marks `formAssociated` as `inheritedFrom`
the parent to mirror the JS reality. The detector should flag both signals:
the no-op validity method AND the absence of any direct `attachInternals()` /
`setValidity()` call in the subclass source.

## Files

- `parent/hx-parent-field.ts` — full ElementInternals implementation
- `parent/hx-parent-field.styles.ts` — visual styles
- `parent/custom-elements.json` — CEM with helixMeta.formAssociated
- `subclass/hx-form-half.ts` — re-declares static flag; no-ops \_updateValidity
- `subclass/hx-form-half.styles.ts` — empty
- `subclass/custom-elements.json` — CEM with superclass ref
- `expected.json` — score upper bounds the scorer must respect
