# Scoring Calibration Workflow

This document defines how HELiXiR agents verify that scoring weights and thresholds are calibrated correctly and produce meaningful health scores.

---

## Overview

A health score is only useful if it correlates with real-world quality. This workflow validates that:
1. The 7 dimension weights sum to 100%
2. Individual dimension scoring thresholds are set appropriately
3. The aggregate score correctly reflects component quality as measured by human experts
4. Score distributions are healthy (not all components clustering at 0% or 100%)

**Trigger**: Run after any change to scoring weights, thresholds, or aggregation logic. Run quarterly as a calibration review.

**Owner**: `principal-engineer` coordinates. `vp-engineering` approves threshold changes.

---

## Weight Verification

### Current Weights

| Dimension | Expected Weight |
|-----------|----------------|
| Accessibility compliance | 20% |
| CEM completeness | 20% |
| Test coverage | 15% |
| Storybook coverage | 15% |
| TypeScript strictness | 15% |
| Bundle size | 10% |
| Documentation | 5% |
| **Total** | **100%** |

### Verification Steps

1. Read the scoring engine source (typically `src/scoring/` or `src/health/`)
2. Extract the weight constants or configuration
3. Compute the sum — must equal exactly 1.0 (or 100)
4. If weights were recently changed, verify the git diff matches the approved change

**Fail condition**: Weights do not sum to 100% → block release, create P0 bug.

---

## Threshold Calibration

Each dimension converts a raw measurement into a 0–100 score using thresholds. These thresholds define what "good", "acceptable", and "poor" mean for each dimension.

### Threshold Review Checklist

For each dimension, verify:

**Accessibility**
- [ ] 0 violations → 100 score
- [ ] 1–2 violations → score degradation is proportional
- [ ] Critical violations (WCAG A failures) → score drops to ≤50
- [ ] WCAG AA violations weighted heavier than WCAG AAA

**CEM Completeness**
- [ ] All fields documented → 100 score
- [ ] Missing description only → minor penalty (≤10 points)
- [ ] Missing events or slots → significant penalty (≥20 points per item)
- [ ] No CEM entry at all → 0 score

**Test Coverage**
- [ ] ≥90% line coverage → 100 score
- [ ] 80–89% → 80–99 score (linear interpolation)
- [ ] 60–79% → 40–79 score
- [ ] <60% → 0–39 score
- [ ] No tests at all → 0 score

**Storybook Coverage**
- [ ] All variants covered → 100 score
- [ ] Missing interaction stories → penalty applied
- [ ] No stories → 0 score

**TypeScript Strictness**
- [ ] Zero strict-mode errors → 100 score
- [ ] `any` usage → penalty per occurrence
- [ ] Strict null check failures → penalty per occurrence
- [ ] Score floor at 0 (never negative)

**Bundle Size**
- [ ] Component gzip size ≤5KB → 100 score
- [ ] 5–15KB → linear degradation
- [ ] >15KB → ≤50 score
- [ ] Dependencies included in component bundle → additional penalty

**Documentation**
- [ ] 100% JSDoc coverage on public API → 100 score
- [ ] Missing `@param` or `@returns` on public methods → penalty
- [ ] Missing `@fires` on events → penalty

### How to Verify Thresholds

1. Create test fixtures representing known quality levels (excellent, acceptable, poor)
2. Run `scan_health_score` on each fixture
3. Verify the output score matches the expected range for that quality level
4. Document any calibration issues found

---

## Distribution Analysis

Run the full scanner against a representative library (HELiX `packages/web-components` is the reference):

1. Collect scores for all components across all dimensions
2. Compute distribution statistics:
   - Mean score per dimension
   - Standard deviation per dimension
   - Count of components scoring 0 (potential false negatives)
   - Count of components scoring 100 (potential false positives)

### Healthy Distribution Criteria

| Metric | Healthy Range |
|--------|--------------|
| Mean aggregate score | 60–85 |
| Std deviation (aggregate) | 10–25 |
| Components at 0 (any dimension) | <5% |
| Components at 100 (aggregate) | <15% |

**Red flags**:
- Mean <40: thresholds too strict or scanner missing data
- Mean >90: thresholds too lenient or scanner not measuring correctly
- Std deviation <5: all components getting similar scores (scanner not discriminating)
- >20% of components at 0 on any dimension: likely a scanning bug

---

## Calibration Change Process

If thresholds need adjustment:

1. `principal-engineer` proposes new thresholds with justification
2. `vp-engineering` approves (threshold changes affect product direction)
3. Changes implemented with before/after score comparison on reference library
4. Changes documented in `.automaker/reviews/calibration-change-{date}.md`
5. Full health audit (see `health-scanning-audit-workflow.md`) run post-change

---

## Output Format

Document results in `.automaker/reviews/calibration-audit-{YYYY-MM-DD}.md`:

```markdown
# Scoring Calibration Audit — {date}

## Weight Verification
- Weights sum: X% (PASS / FAIL)
- Source file: [path to scoring constants]

## Threshold Review
- Accessibility: PASS / FAIL / NEEDS_ADJUSTMENT
- CEM Completeness: PASS / FAIL / NEEDS_ADJUSTMENT
- Test Coverage: PASS / FAIL / NEEDS_ADJUSTMENT
- Storybook Coverage: PASS / FAIL / NEEDS_ADJUSTMENT
- TypeScript Strictness: PASS / FAIL / NEEDS_ADJUSTMENT
- Bundle Size: PASS / FAIL / NEEDS_ADJUSTMENT
- Documentation: PASS / FAIL / NEEDS_ADJUSTMENT

## Distribution Analysis (HELiX reference library)
- Components scanned: N
- Mean aggregate: X
- Std deviation: X
- Components at 0: N (X%)
- Components at 100: N (X%)

## Issues Found
[list calibration issues]

## Recommended Changes
[proposed threshold adjustments with justification]
```
