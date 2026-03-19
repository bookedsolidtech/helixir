# Health Scanning Audit Workflow

This document defines how HELiXiR agents audit the accuracy of the health scoring system across all 7 quality dimensions.

---

## Overview

HELiXiR exposes MCP tools that scan web component libraries and return health scores. These scores must be accurate. This workflow verifies that what the scanner reports matches ground truth — what a human expert would find by manual inspection.

**Trigger**: Run this audit before any release that changes scoring logic, dimension weights, or scanning algorithms.

**Owner**: `principal-engineer` coordinates. Dimension specialists execute.

---

## Health Dimensions and Owners

| Dimension | Weight | Owner Agent |
|-----------|--------|-------------|
| Accessibility compliance | 20% | `accessibility-engineer` |
| CEM completeness | 20% | `technical-writer` (see `cem-validation-workflow.md`) |
| Test coverage | 15% | `test-architect` |
| Storybook coverage | 15% | `storybook-specialist` |
| TypeScript strictness | 15% | `typescript-specialist` |
| Bundle size | 10% | `performance-engineer` |
| Documentation | 5% | `technical-writer` |

---

## Audit Protocol

### Phase 1 — Baseline Capture

For the target library (e.g., HELiX `packages/web-components`):

1. Run each HELiXiR MCP tool and capture raw output:
   - `scan_accessibility` → capture score and violation list
   - `scan_test_coverage` → capture coverage percentages per component
   - `scan_storybook_coverage` → capture missing stories list
   - `scan_typescript_strictness` → capture error/warning counts
   - `scan_bundle_size` → capture per-component size data
   - `scan_documentation` → capture JSDoc coverage percentage
2. Record all outputs in `.automaker/reviews/health-audit-{date}.md`

### Phase 2 — Manual Spot-Check

Each dimension specialist performs a manual verification on a random sample of 5 components:

**Accessibility (`accessibility-engineer`)**:
- Run `axe-core` or equivalent against each component
- Compare violation list to what `scan_accessibility` reported
- Flag any false positives or false negatives

**Test Coverage (`test-architect`)**:
- Run `vitest --coverage` for the sampled components
- Compare Istanbul coverage numbers to `scan_test_coverage` output
- Acceptable variance: ±2 percentage points

**Storybook Coverage (`storybook-specialist`)**:
- Count stories manually for each sampled component
- Compare to `scan_storybook_coverage` missing list
- Verify no stories are double-counted or missed

**TypeScript Strictness (`typescript-specialist`)**:
- Run `tsc --strict --noEmit` on sampled components
- Compare error count to `scan_typescript_strictness` output
- Verify the scanner catches the same errors

**Bundle Size (`performance-engineer`)**:
- Run `vite build` with stats and measure output sizes
- Compare to `scan_bundle_size` per-component values
- Acceptable variance: ±5%

**Documentation (`technical-writer`)**:
- Count JSDoc comments manually for sampled components
- Compare to `scan_documentation` coverage percentage

### Phase 3 — Discrepancy Report

If any dimension shows variance beyond acceptable thresholds:

1. Document the discrepancy: what the scanner reported vs. ground truth
2. Identify the root cause: parsing bug, incorrect file glob, stale cache
3. Create a bug feature on the board with priority `P1`
4. Block release until fixed

### Phase 4 — Aggregate Score Validation

After verifying individual dimensions:
1. Compute the expected aggregate score using the dimension weights
2. Compare to `scan_health_score` output
3. Verify the weighted average is calculated correctly

---

## Audit Cadence

| Event | Audit Required |
|-------|---------------|
| Pre-release (any version bump) | Full audit (all 7 dimensions) |
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
- Dimensions checked: N/7
- Discrepancies found: N

## Dimension Results

### Accessibility
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
