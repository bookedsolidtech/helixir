# Scoring Calibration Workflow

This document defines how HELiXiR agents verify that scoring weights and thresholds are calibrated correctly and produce meaningful health scores.

---

## Overview

A health score is only useful if it correlates with real-world quality. This workflow validates that:
1. The 14 dimension weights sum to 105
2. Individual dimension scoring thresholds are set appropriately
3. The aggregate score correctly reflects component quality as measured by human experts
4. Score distributions are healthy (not all components clustering at 0% or 100%)

**Trigger**: Run after any change to scoring weights, thresholds, or aggregation logic. Run quarterly as a calibration review.

**Owner**: `principal-engineer` coordinates. `vp-engineering` approves threshold changes.

---

## Weight Verification

### Current Weights

**Critical Tier**

| Dimension | Code Name | Weight |
|-----------|-----------|--------|
| CEM Completeness | `cem_completeness` | 15 |
| Accessibility Compliance | `accessibility` | 10 |
| Type Coverage | `type_coverage` | 10 |
| Test Coverage | `test_coverage` | 10 |
| CEM-Source Fidelity | `cem_source_fidelity` | 10 |
| **Critical subtotal** | | **55** |

**Important Tier**

| Dimension | Code Name | Weight |
|-----------|-----------|--------|
| API Surface Quality | `api_surface_quality` | 10 |
| CSS Architecture | `css_architecture` | 5 |
| Event Architecture | `event_architecture` | 5 |
| Slot Architecture | `slot_architecture` | 5 |
| Bundle Size | `bundle_size` | 5 |
| Story Coverage | `story_coverage` | 5 |
| Naming Consistency | `naming_consistency` | 5 |
| **Important subtotal** | | **40** |

**Advanced Tier**

| Dimension | Code Name | Weight |
|-----------|-----------|--------|
| Performance | `performance` | 5 |
| Drupal Readiness | `drupal_readiness` | 5 |
| **Advanced subtotal** | | **10** |

| | |
|---|---|
| **Total** | **105** |

### Verification Steps

1. Read the scoring engine source (typically `src/scoring/` or `src/health/`)
2. Extract the weight constants or configuration
3. Compute the sum — must equal exactly 105
4. Rule: `15 + 10 + 10 + 10 + 10 + 10 + 5 + 5 + 5 + 5 + 5 + 5 + 5 + 5 = 105`
5. If weights were recently changed, verify the git diff matches the approved change

**Fail condition**: Weights do not sum to 105 → block release, create P0 bug.

---

## Threshold Calibration

Each dimension converts a raw measurement into a 0–100 score using thresholds. These thresholds define what "good", "acceptable", and "poor" mean for each dimension.

### Threshold Review Checklist

For each dimension, verify:

#### Critical Tier

**CEM Completeness (`cem_completeness`)**
- [ ] All fields documented (attributes, properties, events, slots, CSS parts, CSS properties) → 100 score
- [ ] Missing description only → minor penalty (≤10 points)
- [ ] Missing events or slots → significant penalty (≥20 points per item)
- [ ] No CEM entry at all → 0 score

**Accessibility Compliance (`accessibility`)**
- [ ] 0 violations → 100 score
- [ ] 1–2 violations → score degradation is proportional
- [ ] Critical violations (WCAG A failures) → score drops to ≤50
- [ ] WCAG AA violations weighted heavier than WCAG AAA

**Type Coverage (`type_coverage`)**
- [ ] ≥95% covered → 100 score
- [ ] 90–94% → 80–99 score
- [ ] 80–89% → 40–79 score
- [ ] <80% → 0–39 score
- [ ] All-`any` types → 0 score

**Test Coverage (`test_coverage`)**
- [ ] ≥90% line coverage → 100 score
- [ ] 80–89% → 80–99 score
- [ ] 60–79% → 40–79 score
- [ ] <60% → 0–39 score
- [ ] No tests at all → 0 score

**CEM-Source Fidelity (`cem_source_fidelity`)**
- [ ] 0 mismatches between CEM and source → 100 score
- [ ] 1–2 minor mismatches (e.g., description drift) → 80–99 score
- [ ] 3–5 mismatches (missing events, wrong parameter names) → 40–79 score
- [ ] >5 mismatches → 0 score

#### Important Tier

**API Surface Quality (`api_surface_quality`)**
- [ ] All public methods documented, parameter names match property patterns → 100 score
- [ ] 1–2 inconsistencies (naming pattern drift, undocumented parameter) → 70–99 score
- [ ] 3+ inconsistencies across public API → 0–69 score

**CSS Architecture (`css_architecture`)**
- [ ] All internal styleable sections expose `::part()` equivalents and CSS custom properties → 100 score
- [ ] ~50% of styleable sections covered → 50 score
- [ ] <50% coverage → 0–49 score

**Event Architecture (`event_architecture`)**
- [ ] All events use consistent prefix, `detail` shape matches schema, all marked `composed: true` where expected → 100 score
- [ ] Partial consistency (some events missing prefix or `detail` docs) → 40–79 score
- [ ] No consistent naming or documentation → 0 score

**Slot Architecture (`slot_architecture`)**
- [ ] Slot names clearly document purpose, slot usage examples in JSDoc, default slot presence matches use case → 100 score
- [ ] Slot names present but undocumented → 40–79 score
- [ ] No slot documentation → 0 score

**Bundle Size (`bundle_size`)**
- [ ] Component gzip size ≤5KB → 100 score
- [ ] 5–15KB → linear degradation
- [ ] >15KB → ≤50 score
- [ ] Dependencies bundled into component → additional penalty
- [ ] Source maps excluded from size measurement

**Story Coverage (`story_coverage`)**
- [ ] All variants and interaction stories documented → 100 score
- [ ] All variants documented but no interaction stories → 60 score
- [ ] <50% of variants documented → 0–39 score
- [ ] No stories → 0 score

**Naming Consistency (`naming_consistency`)**
- [ ] Consistent tag name prefix, property/attribute names follow pattern, events use prefix, methods are verbs → 100 score
- [ ] 1–2 naming violations → 70–99 score
- [ ] 3+ violations → 0–69 score

#### Advanced Tier

**Performance (`performance`)**
- [ ] First render <5ms and memory per instance <50KB → 100 score
- [ ] First render <20ms and memory <200KB → 40–79 score
- [ ] First render ≥20ms or memory ≥200KB → 0–39 score

**Drupal Readiness (`drupal_readiness`)**
- [ ] Full form-associated support (`formAssociated`, `ElementInternals`), ARIA data attributes present, Drupal module integration tested → 100 score
- [ ] Partial support (one or two requirements met) → 40–79 score
- [ ] No form association or ARIA data attributes → 0 score

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

### Healthy Distribution Criteria by Tier

**Critical Tier**

| Metric | Healthy Range |
|--------|--------------|
| Mean score (Critical dimensions) | 65–80 |
| Std deviation (Critical dimensions) | 10–25 |
| Components at 0 (any Critical dimension) | <5% |
| Components at 100 (any Critical dimension) | <20% |

**Important Tier**

| Metric | Healthy Range |
|--------|--------------|
| Mean score (Important dimensions) | 60–80 |
| Std deviation (Important dimensions) | 10–25 |
| Components at 0 (any Important dimension) | <5% |
| Components at 100 (any Important dimension) | <25% |

**Advanced Tier**

| Metric | Healthy Range |
|--------|--------------|
| Mean score (Advanced dimensions) | 50–75 |
| Std deviation (Advanced dimensions) | 10–30 |
| Components at 0 (any Advanced dimension) | <10% |
| Components at 100 (any Advanced dimension) | <30% |

**Aggregate**

| Metric | Healthy Range |
|--------|--------------|
| Mean aggregate score | 60–85 |
| Std deviation (aggregate) | 10–25 |
| Components at 100 (aggregate) | <15% |

**Red flags**:
- Mean <40 on any dimension: thresholds too strict or scanner missing data
- Mean >90 on any dimension: thresholds too lenient or scanner not measuring correctly
- Std deviation <5: all components getting similar scores (scanner not discriminating)
- >20% of components at 0 on any Critical dimension: likely a scanning bug
- >10% of components at 0 on any Important dimension: likely a scanning bug

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
- Weights sum: 105 (PASS / FAIL)
- Source file: [path to scoring constants]

## Threshold Review

### Critical Tier
- CEM Completeness (cem_completeness): PASS / FAIL / NEEDS_ADJUSTMENT
- Accessibility Compliance (accessibility): PASS / FAIL / NEEDS_ADJUSTMENT
- Type Coverage (type_coverage): PASS / FAIL / NEEDS_ADJUSTMENT
- Test Coverage (test_coverage): PASS / FAIL / NEEDS_ADJUSTMENT
- CEM-Source Fidelity (cem_source_fidelity): PASS / FAIL / NEEDS_ADJUSTMENT

### Important Tier
- API Surface Quality (api_surface_quality): PASS / FAIL / NEEDS_ADJUSTMENT
- CSS Architecture (css_architecture): PASS / FAIL / NEEDS_ADJUSTMENT
- Event Architecture (event_architecture): PASS / FAIL / NEEDS_ADJUSTMENT
- Slot Architecture (slot_architecture): PASS / FAIL / NEEDS_ADJUSTMENT
- Bundle Size (bundle_size): PASS / FAIL / NEEDS_ADJUSTMENT
- Story Coverage (story_coverage): PASS / FAIL / NEEDS_ADJUSTMENT
- Naming Consistency (naming_consistency): PASS / FAIL / NEEDS_ADJUSTMENT

### Advanced Tier
- Performance (performance): PASS / FAIL / NEEDS_ADJUSTMENT
- Drupal Readiness (drupal_readiness): PASS / FAIL / NEEDS_ADJUSTMENT

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
