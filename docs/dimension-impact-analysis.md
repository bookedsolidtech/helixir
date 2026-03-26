# Dimension Impact Analysis — Lit Patterns

**Author:** Kenji T. Nakamura (Lit Specialist)
**Date:** 2026-03-19
**Purpose:** Quantitative assessment of grade impact when Lit Patterns dimension is added

---

## 1. Methodology

### Approach

Since HELiXiR's multi-dimensional scorer (`scoreComponentMultiDimensional`) normalizes by measured weight (excluding unmeasured dimensions from the denominator), the impact of adding a new dimension depends on:

1. Whether the dimension is measured (Lit component) or not (non-Lit component)
2. The Lit Patterns score relative to the component's average across other dimensions
3. The weight of the new dimension (proposed: 5)

### Component Archetypes

We analyze 5 representative Lit component archetypes reflecting real-world HELiX library patterns:

| Archetype   | Description                                  | Expected Lit Patterns Score |
| ----------- | -------------------------------------------- | --------------------------- |
| **Perfect** | Well-documented, all Lit best practices      | 95–100                      |
| **Typical** | Standard component, some gaps                | 60–75                       |
| **Legacy**  | Older patterns, missing modern Lit practices | 30–45                       |
| **Minimal** | Simple presentational component              | 80–90 (less to get wrong)   |
| **Non-Lit** | Vanilla web component                        | N/A (not measured)          |

---

## 2. Current Scoring Baseline (14 Dimensions)

### Current Weight Distribution

| Dimension           | Weight  | Tier                 |
| ------------------- | ------- | -------------------- |
| CEM Completeness    | 15      | Critical             |
| Accessibility       | 10      | Critical             |
| Type Coverage       | 10      | Critical             |
| CEM-Source Fidelity | 10      | Critical             |
| API Surface Quality | 10      | Important            |
| Test Coverage       | 10      | Critical (external)  |
| CSS Architecture    | 5       | Important            |
| Event Architecture  | 5       | Important            |
| Slot Architecture   | 5       | Important            |
| Naming Consistency  | 5       | Important            |
| Bundle Size         | 5       | Important (external) |
| Story Coverage      | 5       | Important (external) |
| Performance         | 5       | Advanced (external)  |
| Drupal Readiness    | 5       | Advanced (external)  |
| **Total**           | **105** |                      |

### Typical CEM-Native Measured Weight

For a Lit component with source code available, typically 7–9 CEM-native dimensions are measured (depending on whether the component has events, CSS properties, slots, etc.). External dimensions are typically untested unless history files exist.

**Typical measured weight (CEM-native only): 55–75**

---

## 3. Impact Scenarios

### Scenario A: Perfect Lit Component

**Current scores (no Lit Patterns):**

| Dimension           | Score | Weight | Measured |
| ------------------- | ----- | ------ | -------- |
| CEM Completeness    | 95    | 15     | Yes      |
| Accessibility       | 85    | 10     | Yes      |
| Type Coverage       | 90    | 10     | Yes      |
| CEM-Source Fidelity | 100   | 10     | Yes      |
| API Surface Quality | 88    | 10     | Yes      |
| CSS Architecture    | 92    | 5      | Yes      |
| Event Architecture  | 90    | 5      | Yes      |
| Slot Architecture   | 85    | 5      | Yes      |
| Naming Consistency  | 95    | 5      | Yes      |

**Current weighted score:** (95×15 + 85×10 + 90×10 + 100×10 + 88×10 + 92×5 + 90×5 + 85×5 + 95×5) / 75 = **91.3%** → Grade **A**

**With Lit Patterns (score: 98):**

Added dimension: Lit Patterns = 98, weight 5

**New weighted score:** (95×15 + 85×10 + 90×10 + 100×10 + 88×10 + 92×5 + 90×5 + 85×5 + 95×5 + 98×5) / 80 = **91.7%** → Grade **A**

**Delta: +0.4 points, no grade change.** The well-written component is slightly rewarded.

---

### Scenario B: Typical Lit Component

**Current scores:**

| Dimension           | Score | Weight | Measured      |
| ------------------- | ----- | ------ | ------------- |
| CEM Completeness    | 80    | 15     | Yes           |
| Accessibility       | 70    | 10     | Yes           |
| Type Coverage       | 75    | 10     | Yes           |
| CEM-Source Fidelity | 85    | 10     | Yes           |
| API Surface Quality | 65    | 10     | Yes           |
| CSS Architecture    | 70    | 5      | Yes           |
| Event Architecture  | 75    | 5      | Yes           |
| Slot Architecture   | null  | 5      | No (no slots) |
| Naming Consistency  | 80    | 5      | Yes           |

**Current weighted score:** (80×15 + 70×10 + 75×10 + 85×10 + 65×10 + 70×5 + 75×5 + 80×5) / 70 = **76.1%** → Grade **C**

**With Lit Patterns (score: 65):**

**New weighted score:** (80×15 + 70×10 + 75×10 + 85×10 + 65×10 + 70×5 + 75×5 + 80×5 + 65×5) / 75 = **75.4%** → Grade **C**

**Delta: -0.7 points, no grade change.** The slightly-below-average Lit score has minimal impact.

---

### Scenario C: Legacy Lit Component

**Current scores:**

| Dimension           | Score | Weight | Measured             |
| ------------------- | ----- | ------ | -------------------- |
| CEM Completeness    | 60    | 15     | Yes                  |
| Accessibility       | 45    | 10     | Yes                  |
| Type Coverage       | 55    | 10     | Yes                  |
| CEM-Source Fidelity | 70    | 10     | Yes                  |
| API Surface Quality | 40    | 10     | Yes                  |
| CSS Architecture    | null  | 5      | No (no CSS metadata) |
| Event Architecture  | 50    | 5      | Yes                  |
| Naming Consistency  | 60    | 5      | Yes                  |

**Current weighted score:** (60×15 + 45×10 + 55×10 + 70×10 + 40×10 + 50×5 + 60×5) / 65 = **55.4%** → Grade **F**

**With Lit Patterns (score: 35):**

**New weighted score:** (60×15 + 45×10 + 55×10 + 70×10 + 40×10 + 50×5 + 60×5 + 35×5) / 70 = **53.9%** → Grade **F**

**Delta: -1.5 points, no grade change.** The low Lit score slightly amplifies an already-F grade.

---

### Scenario D: Minimal Presentational Component

**Current scores:**

| Dimension           | Score | Weight | Measured                   |
| ------------------- | ----- | ------ | -------------------------- |
| CEM Completeness    | 85    | 15     | Yes                        |
| Accessibility       | 60    | 10     | Yes                        |
| Type Coverage       | 80    | 10     | Yes                        |
| CEM-Source Fidelity | 90    | 10     | Yes                        |
| API Surface Quality | null  | 10     | No (no methods/fields)     |
| CSS Architecture    | null  | 5      | No                         |
| Event Architecture  | null  | 5      | No                         |
| Slot Architecture   | null  | 5      | No                         |
| Naming Consistency  | null  | 5      | No (needs library context) |

**Current weighted score:** (85×15 + 60×10 + 80×10 + 90×10) / 45 = **80.6%** → Grade **B**

**With Lit Patterns (score: 85):**
Simple component — has `static styles`, uses `@property()` correctly, no lifecycle complexity.

**New weighted score:** (85×15 + 60×10 + 80×10 + 90×10 + 85×5) / 50 = **81.0%** → Grade **B**

**Delta: +0.4 points, no grade change.** Minimal but positive.

---

### Scenario E: Non-Lit Component (Vanilla/FAST/Stencil)

**Current scores:** Same as any scenario above.

**With Lit Patterns:** Dimension returns `null` (not applicable) → **not measured** → excluded from weighted score denominator.

**Delta: 0 points, no grade change.** Non-Lit components are completely unaffected.

---

## 4. Grade Boundary Analysis

The most important question: **Can the Lit Patterns dimension cause a grade change?**

### Downgrade Risk

For a grade change from B→C, a component would need its weighted score to drop below 70 (from ≥70).

With Lit Patterns weight = 5, the maximum possible drop from a 0/100 Lit score:

- Measured weight increases by 5
- Weighted sum stays the same (0 added)
- New score = old_sum / (old_weight + 5)

Example: A component at exactly 70% weighted score with measured weight 70:

- Old sum: 70 × 0.70 = 49
- New score with Lit=0: 49 / 75 = 65.3% → **Would drop from C to F**

However, this is an extreme case (Lit score = 0) at an exact grade boundary. In practice:

- Lit score = 0 requires a Lit component with zero best practices (extremely unlikely)
- Components at exact grade boundaries are rare
- The typical impact is ±0.5–1.5 points

### Upgrade Potential

A perfect Lit score (100) on a component near a grade boundary:

- Old sum: 70 × 0.70 = 49, with measured weight 70
- New sum: 49 + (100 × 0.05 × 1.0) = 49 + 5 = 54 (wrong calc, let me redo)
- Actually: new score = (49 + 5) / 75 = 72.0% → Could push from borderline C to solid C

Realistic upgrade scenario: component at 79.5% could reach 80%+ and move from C to B.

---

## 5. Weight Conflict Analysis

### Current Weight Sum: 105

Adding Lit Patterns at weight 5 → **110 total**

This does NOT conflict with existing dimensions because:

1. `computeWeightedScore()` divides by **measured** weight, not total weight
2. Unmeasured dimensions (external, notApplicable) are excluded from the denominator
3. The 5-point increase only affects components where Lit Patterns is actually measured

### Critical Dimension Gates

Lit Patterns is **Advanced tier**, not Critical. It does NOT participate in:

- Zero-score critical gate (grade cap at C)
- Below-50% critical gate (grade cap at D)
- Untested critical dimension limits

**No conflict with critical dimension gate logic.**

---

## 6. Summary

| Metric                     | Value                                  |
| -------------------------- | -------------------------------------- |
| Typical grade change risk  | **None** (±0.5–1.5 points)             |
| Maximum theoretical impact | **-4.7 points** (Lit=0, boundary case) |
| Non-Lit component impact   | **Zero** (dimension not measured)      |
| Critical gate conflicts    | **None** (Advanced tier)               |
| Weight redistribution      | **Minimal** (5/110 = 4.5% of total)    |

### Recommendation

The proposed weight of 5 (Advanced tier) is appropriately calibrated:

- Rewards Lit best practices without destabilizing existing grades
- Cannot single-handedly cause grade changes except in extreme boundary cases
- Has zero impact on non-Lit components
- No conflicts with existing dimension weights or critical gates

**Impact assessment: LOW RISK — suitable for direct implementation.**
