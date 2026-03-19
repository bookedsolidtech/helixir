# CEM Validation Workflow

This document defines how HELiXiR agents validate the accuracy of Custom Elements Manifest (CEM) parsing against actual component APIs.

---

## Overview

HELiXiR's CEM completeness scanner reads `custom-elements.json` and measures how well each component's public API is documented. For this to be meaningful, the CEM must accurately reflect the actual source code. This workflow verifies CEM accuracy independently of what HELiXiR reports.

**Trigger**: Run before any scan that uses CEM data. Run after any change to `custom-elements-manifest.config.cjs` or the CEM analyzer plugins.

**Owner**: `technical-writer` coordinates. `typescript-specialist` assists on type accuracy.

---

## What CEM Must Capture

For each component, verify these fields in `custom-elements.json`:

| Field | Required | Verification Method |
|-------|----------|---------------------|
| `tagName` | Yes | Match against `customElements.define()` calls |
| `attributes` | Yes | Match against `@property()` decorators with `attribute: true` |
| `properties` | Yes | Match against all `@property()` and `@state()` decorators |
| `events` | Yes | Match against `this.dispatchEvent()` calls with `CustomEvent` |
| `slots` | Yes | Match against `<slot>` elements in render templates |
| `cssProperties` | Yes | Match against CSS custom property usage in component styles |
| `cssParts` | Yes | Match against `part="..."` attributes in render templates |
| `methods` | Conditional | Public methods not decorated with `@state` |
| `description` | Yes | Present and non-empty |

---

## Validation Protocol

### Step 1 — Generate Fresh CEM

```bash
npm run analyze:cem
```

This regenerates `custom-elements.json` from source. If the output differs from the committed version, the committed CEM is stale — flag this immediately.

### Step 2 — Select Sample Components

Pick 5–10 components that span:
- Simple components (1–3 properties)
- Complex components (10+ properties, multiple events)
- Form-associated components (using `ElementInternals`)
- Slotted components (multiple named slots)

### Step 3 — Source-to-CEM Comparison

For each sampled component, the `technical-writer` agent performs:

**Attributes/Properties**:
1. Read the component source file
2. Extract all `@property()` decorators
3. Compare to `custom-elements.json` → `members` array for that component
4. Flag any property in source that is missing from CEM
5. Flag any property in CEM that does not exist in source

**Events**:
1. Search for `new CustomEvent(` in the component source
2. Extract event names and types
3. Compare to CEM `events` array
4. Flag discrepancies

**Slots**:
1. Extract `<slot>` elements from render() method
2. Compare to CEM `slots` array
3. Verify named slots have correct `name` attribute

**CSS Custom Properties**:
1. Read component styles (inline or imported)
2. Extract `var(--hxr-*)` usages
3. Compare to CEM `cssProperties` array

**CSS Parts**:
1. Extract `part="..."` attributes from render template
2. Compare to CEM `cssParts` array

### Step 4 — HELiXiR Scanner Accuracy Check

After verifying CEM accuracy, verify that HELiXiR's CEM completeness scanner correctly reads the CEM:

1. Run `scan_cem_completeness` for the sampled components
2. For each component, manually compute the completeness score:
   - Count documented fields vs. total expected fields
   - Apply the scoring formula
3. Compare manual score to scanner output
4. Acceptable variance: 0% (CEM reading must be exact)

### Step 5 — Type Accuracy Review (TypeScript Specialist)

The `typescript-specialist` verifies that CEM type annotations match TypeScript types:

1. For each property in the CEM, check the `type.text` field
2. Compare to the actual TypeScript type in the source
3. Generics, unions, and complex types are common failure points
4. Flag any type mismatch as a CEM analyzer plugin issue

---

## Common CEM Failure Modes

| Failure | Cause | Fix |
|---------|-------|-----|
| Private properties in CEM | Analyzer picks up `_private` fields | Add `private` modifier or prefix filter to CEM config |
| Missing events | `dispatchEvent` inside lifecycle hooks | Ensure analyzer scans all methods, not just `render()` |
| Slots missing | Slot in conditional render branch | Verify analyzer handles conditional templates |
| Wrong attribute name | camelCase vs. kebab-case mismatch | Verify `attribute` option in `@property()` decorator |
| Stale CEM | CEM not regenerated after source change | Add CEM generation to pre-commit hook |

---

## Output Format

Document findings in `.automaker/reviews/cem-audit-{YYYY-MM-DD}.md`:

```markdown
# CEM Validation Audit — {date}

## Summary
- Components sampled: N
- CEM accuracy: PASS / FAIL
- HELiXiR scanner accuracy: PASS / FAIL
- Issues found: N

## Component Results

### hxr-{component-name}
- Properties: X/Y documented correctly
- Events: X/Y documented correctly
- Slots: X/Y documented correctly
- CSS Properties: X/Y documented correctly
- CSS Parts: X/Y documented correctly
- Type accuracy: PASS / FAIL
- Scanner score match: PASS / FAIL (scanner: X%, manual: X%)

## Issues Found
[list discrepancies with file:line references]

## Action Items
[features created for CEM analyzer fixes]
```
