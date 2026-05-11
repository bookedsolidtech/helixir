# Class 16 — Keyboard Contract Drift

**Ground truth**: helix commit `bf315a2fd` — the APG keyboard contract
implementation pattern. Establishes that every interactive component declares
its key bindings via `@keyboard-contract` JSDoc and `helixMeta.keyboardContract`
in the CEM. Subclasses that add or remove key handlers without updating the
contract create silent drift.

## What the parent has

- `hx-parent-checkbox` implementing APG checkbox pattern
- JSDoc: `@aria-pattern checkbox` + `@keyboard-contract activate=Space,Enter; disabled-suppresses=true`
- CEM `helixMeta.keyboardContract = { activate: ["Space", "Enter"], disabledSuppresses: true }`
- `_onKeydown` honors Space + Enter, no-ops when disabled.

## What the subclass does to reproduce the defect

- `hx-keyboard-drift` extends `hx-parent-checkbox`
- Overrides `connectedCallback` to attach an additional keydown listener
- New listener handles `Escape` → dismiss + `this.remove()`
- Does NOT update `@keyboard-contract` JSDoc
- CEM `helixMeta.keyboardContract` is still the inherited Space/Enter contract

## What the scorer must flag

- **APG Keyboard Contract** — verdict should be `unknown` (parent contract no
  longer authoritative for the subclass) OR score must drop with issue
  `parent-contract-no-longer-applies`.
- **Keyboard Interaction** — issue must include `undeclared-key-handler`
  (Escape handler observed but not in contract).
- **Confidence** — heuristic-low (source-grep against contract).

## Files

- `parent/hx-parent-checkbox.ts` — APG checkbox with Space/Enter activation
- `parent/hx-parent-checkbox.styles.ts` — visual styles
- `parent/custom-elements.json` — CEM with helixMeta.keyboardContract
- `subclass/hx-keyboard-drift.ts` — adds Escape handler without contract update
- `subclass/hx-keyboard-drift.styles.ts` — empty (defect is keyboard-only)
- `subclass/custom-elements.json` — CEM with inherited (stale) contract
- `expected.json` — verdict + score upper bounds the scorer must respect
