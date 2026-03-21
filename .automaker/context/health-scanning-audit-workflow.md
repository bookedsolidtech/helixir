# Health Scanning Audit Workflow

This document defines how HELiXiR agents audit the accuracy of the health scoring system across all 14 quality dimensions.

---

## Overview

HELiXiR exposes MCP tools that scan web component libraries and return health scores. These scores must be accurate. This workflow verifies that what the scanner reports matches ground truth — what a human expert would find by manual inspection.

**Trigger**: Run this audit before any release that changes scoring logic, dimension weights, or scanning algorithms.

**Owner**: `principal-engineer` coordinates. Dimension specialists execute.

---

## Health Dimensions and Owners

### Critical Tier (weight subtotal: 55)

| Dimension | Code Name | Weight | Owner Agent |
|-----------|-----------|--------|-------------|
| CEM Completeness | `cem_completeness` | 15 | `technical-writer` (see `cem-validation-workflow.md`) |
| Accessibility Compliance | `accessibility` | 10 | `accessibility-engineer` |
| Type Coverage | `type_coverage` | 10 | `typescript-specialist` |
| Test Coverage | `test_coverage` | 10 | `test-architect` |
| CEM-Source Fidelity | `cem_source_fidelity` | 10 | `technical-writer` |

### Important Tier (weight subtotal: 40)

| Dimension | Code Name | Weight | Owner Agent |
|-----------|-----------|--------|-------------|
| API Surface Quality | `api_surface_quality` | 10 | `solutions-architect` |
| CSS Architecture | `css_architecture` | 5 | `performance-engineer` |
| Event Architecture | `event_architecture` | 5 | `solutions-architect` |
| Slot Architecture | `slot_architecture` | 5 | `component-architect` |
| Bundle Size | `bundle_size` | 5 | `performance-engineer` |
| Story Coverage | `story_coverage` | 5 | `storybook-specialist` |
| Naming Consistency | `naming_consistency` | 5 | `technical-writer` |

### Advanced Tier (weight subtotal: 10)

| Dimension | Code Name | Weight | Owner Agent |
|-----------|-----------|--------|-------------|
| Performance | `performance` | 5 | `performance-engineer` |
| Drupal Readiness | `drupal_readiness` | 5 | `cto` |

**Total weight: 105**

---

## Audit Protocol

### Phase 1 — Baseline Capture

For the target library (e.g., HELiX `packages/web-components`):

1. Run each HELiXiR MCP tool and capture raw output:
   - `scan_cem_completeness` → capture completeness score per component
   - `scan_accessibility` → capture score and violation list
   - `scan_type_coverage` → capture type coverage percentages per component
   - `scan_test_coverage` → capture coverage percentages per component
   - `scan_cem_source_fidelity` → capture mismatch count and detail
   - `scan_api_surface` → capture method/property consistency findings
   - `scan_css_architecture` → capture part exposure and token coverage
   - `scan_event_architecture` → capture event naming and bubbling audit
   - `scan_slot_architecture` → capture slot naming and documentation gaps
   - `scan_bundle_size` → capture per-component gzip size data
   - `scan_story_coverage` → capture missing stories list
   - `scan_naming_consistency` → capture naming violation list
   - `scan_performance` → capture render time and memory footprint
   - `scan_drupal_readiness` → capture form-association and ARIA data coverage
2. Record all outputs in `.automaker/reviews/health-audit-{date}.md`

### Phase 2 — Manual Spot-Check

Each dimension specialist performs a manual verification on a random sample of 5 components:

**CEM Completeness (`technical-writer`)**:
- Count documented fields (attributes, properties, events, slots, CSS parts, CSS properties) per component
- Compare to `scan_cem_completeness` output
- Acceptable variance: ±2 percentage points (Critical tier)

**Accessibility (`accessibility-engineer`)**:
- Run `axe-core` or equivalent against each component
- Compare violation list to what `scan_accessibility` reported
- Flag any false positives or false negatives
- Acceptable variance: ±2 percentage points (Critical tier)

**Type Coverage (`typescript-specialist`)**:
- Run `tsc --strict --noEmit` on sampled components; count untyped members and `any` usages
- Compare to `scan_type_coverage` output
- Acceptable variance: ±2 percentage points (Critical tier)

**Test Coverage (`test-architect`)**:
- Run `vitest --coverage` for the sampled components
- Compare Istanbul coverage numbers to `scan_test_coverage` output
- Acceptable variance: ±2 percentage points (Critical tier)

**CEM-Source Fidelity (`technical-writer`)**:
- For each sampled component, compare CEM entries (attributes, events, methods, slots) to actual source file
- Verify method signatures, parameter names, and visibility modifiers match
- Flag any CEM entry not present in source, or source API missing from CEM
- Acceptable variance: ±2 percentage points (Critical tier)

**API Surface Quality (`solutions-architect`)**:
- Review public method names and parameter patterns for consistency across similar components
- Compare return type documentation to actual return values
- Flag inconsistencies in naming patterns (verb vs. noun, camelCase vs. other)
- Acceptable variance: ±3 percentage points (Important tier)

**CSS Architecture (`performance-engineer`)**:
- Inventory all internal Shadow DOM sections requiring styleable surface
- Verify each section has a corresponding `::part()` or CSS custom property
- Check `:host()` patterns for consistency across components
- Acceptable variance: ±3 percentage points (Important tier)

**Event Architecture (`solutions-architect`)**:
- Verify all events follow a consistent naming prefix (e.g., `hx-`)
- Check that `detail` shape for each event matches documented schema
- Verify `composed` and `bubbles` flags are consistent for same event category
- Acceptable variance: ±3 percentage points (Important tier)

**Slot Architecture (`component-architect`)**:
- Verify slot names clearly document purpose (not generic: `slot="1"`)
- Check that JSDoc or component description includes slot usage examples
- Confirm default slot presence/absence matches the component's use case
- Acceptable variance: ±3 percentage points (Important tier)

**Bundle Size (`performance-engineer`)**:
- Run `vite build` with stats and measure gzip output sizes (source maps excluded)
- Compare to `scan_bundle_size` per-component values
- Acceptable variance: ±5% (Important tier)

**Story Coverage (`storybook-specialist`)**:
- Count stories manually for each sampled component; include variants and interaction stories
- Compare to `scan_story_coverage` missing list
- Verify no stories are double-counted or missed
- Acceptable variance: ±3 percentage points (Important tier)

**Naming Consistency (`technical-writer`)**:
- Audit tag name prefix usage, attribute/property naming conventions, and event prefix adherence
- Compare violations found manually to `scan_naming_consistency` output
- Acceptable variance: ±3 percentage points (Important tier)

**Performance (`performance-engineer`)**:
- Measure first-render time and per-instance memory footprint for sampled components in isolation
- Compare to `scan_performance` output
- Acceptable variance: ±5% (Advanced tier)

**Drupal Readiness (`cto`)**:
- Verify form-associated custom element support (`formAssociated`, `ElementInternals` usage)
- Check ARIA data attribute coverage and Drupal module integration readiness
- Compare to `scan_drupal_readiness` output
- Acceptable variance: ±5% (Advanced tier)

### Phase 3 — Discrepancy Report

If any dimension shows variance beyond acceptable thresholds:

1. Document the discrepancy: what the scanner reported vs. ground truth
2. Identify the root cause: parsing bug, incorrect file glob, stale cache
3. Create a bug feature on the board with priority `P1`
4. Block release until fixed

Variance thresholds by tier:
- **Critical dimensions**: acceptable variance ±2%
- **Important dimensions**: acceptable variance ±3%
- **Advanced dimensions**: acceptable variance ±5%

### Phase 4 — Aggregate Score Validation

After verifying individual dimensions:
1. Compute the expected aggregate score using the weighted sum formula:
   `(score₁×15 + score₂×10 + score₃×10 + score₄×10 + score₅×10 + score₆×10 + score₇×5 + score₈×5 + score₉×5 + score₁₀×5 + score₁₁×5 + score₁₂×5 + score₁₃×5 + score₁₄×5) / 105`
2. Compare to `scan_health_score` output
3. Verify the weighted sum uses 105 as the divisor (not 100)

---

## Audit Cadence

| Event | Audit Required |
|-------|---------------|
| Pre-release (any version bump) | Full audit (all 14 dimensions) |
| Post-refactor of scoring engine | Full audit |
| Post-refactor of a single scanner | That dimension only |
| Weekly regression check | Automated comparison only (no manual spot-check) |

---

## Output Format

Results go in `.automaker/reviews/health-audit-{YYYY-MM-DD}.md`:

```markdown
# Health Scan Audit — {date}

## Summary
- Overall: PASS / FAIL
- Dimensions checked: N/14
- Discrepancies found: N

## Dimension Results

### CEM Completeness (cem_completeness) — Critical
- Scanner score: X%
- Manual verification: X%
- Variance: X%
- Status: PASS / FAIL

### Accessibility (accessibility) — Critical
- Scanner score: X%
- Manual verification: X%
- Variance: X%
- Status: PASS / FAIL

[repeat for each dimension]

## Discrepancies
[list any issues found]

## Action Items
[features created for fixes]
```
