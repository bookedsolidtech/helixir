# Accessibility Dimension Enhancement Proposal

**Author:** accessibility-engineer agent
**Date:** 2026-03-19
**Status:** Proposal
**Dimension:** Accessibility (weight: 10, tier: Critical)

---

## Executive Summary

HELiXiR's accessibility scoring is more mature than the feature description suggests. The system already has **two analysis layers**: CEM-level heuristic analysis (8 signals) and source-level regex scanning (7 markers), blended at 30/70 weight. However, significant gaps remain against WCAG 2.1 AA requirements, the dimension weight undervalues its Critical tier importance, and the confidence level is permanently stuck at `heuristic` with no path to `verified`. This proposal recommends 5 concrete improvements ranked by impact.

---

## 1. Current State Assessment

### Layer 1: CEM Heuristic Analysis (`accessibility.ts`)

8 signals scored against CEM metadata. Total: 100 points.

| Signal | Weight | Detection Method | Known Issues |
|--------|--------|------------------|--------------|
| `hasDisabled` | 25 | Field named `disabled` | **False negative:** Components using `inert` or custom disabled patterns missed |
| `hasLabelSupport` | 20 | Slot or member named `label` | **False negative:** Components using `aria-label`/`aria-labelledby` instead of a `label` slot score 0 |
| `hasFocusMethod` | 20 | Method with "focus" in name | **False positive:** `unfocus()`, `focusOnInit()` match but aren't a11y patterns |
| `accessibilityDescription` | 10 | Description mentions a11y terms | **Fragile:** Depends on documentation quality, not implementation |
| `hasFormAssociation` | 10 | `formAssociated`, `internals`, name+value+disabled triple | Reasonably robust |
| `hasAriaRole` | 5 | CSS prop named "role", description, or tag-name suffix | **False positive:** Tag-name inference (`-button` suffix) assumes role without verifying |
| `hasAriaAttributes` | 5 | Members starting with `aria-` | Only detects documented attributes; misses runtime bindings |
| `hasKeyboardEvents` | 5 | Events named key*/focus/blur | Only detects documented events; misses source-level handlers |

**CEM-layer limitations:**
- Binary pass/fail per signal — no partial credit (e.g., having 1 ARIA attribute scores the same as having 10)
- No component-type awareness — a button is scored identically to a dialog
- Tag-name role inference has no validation against actual role assignment
- Weight distribution is heavily biased toward `disabled` (25%) and `label` (20%), underweighting ARIA patterns

### Layer 2: Source-Level Analysis (`source-accessibility.ts`)

7 markers scored via regex pattern matching against component source files. Total: 100 points.

| Marker | Weight | Patterns Detected | Known Issues |
|--------|--------|-------------------|--------------|
| `ariaBindings` | 25 | `aria-*=`, `.aria*`, `setAttribute('aria-` | Detects presence but not correctness of ARIA usage |
| `keyboardHandling` | 20 | `@keydown=`, `addEventListener('key`, key name literals | Detects handlers but not which keys — can't verify expected interaction patterns |
| `roleAssignments` | 15 | `role=`, `setAttribute('role'` | Detects assignment but not correct role for component type |
| `focusManagement` | 15 | `.focus(`, `tabindex`, `aria-activedescendant`, trap patterns | Good coverage of focus patterns |
| `formInternals` | 10 | `attachInternals()`, `setFormValue()`, `setValidity()` | Robust — uses specific APIs |
| `liveRegions` | 10 | `aria-live=`, `role="alert"/"status"`, `aria-atomic` | Good coverage |
| `screenReaderSupport` | 5 | `aria-hidden`, `.sr-only`, `aria-labelledby`, `aria-describedby` | Detects CSS classes and attributes |

**Source-layer limitations:**
- Regex-only — cannot understand AST structure or control flow
- Detects presence of patterns, not correctness (e.g., `role="button"` on a div vs. on a native button)
- No component-type-specific validation (dialog needs different patterns than checkbox)
- Deep scan (Phase 3) follows inheritance but still regex-based
- Confidence hardcoded to `heuristic` even when blended

### Blending Strategy (health.ts lines 863-890)

- When source available: `blendedScore = CEM * 0.3 + Source * 0.7`
- Fallback: CEM-only score
- Presentational components return `null` (excluded from scoring)
- Confidence always `heuristic`, even for CEM-only path (incorrectly marked `heuristic` in both branches)

---

## 2. WCAG 2.1 AA Gap Analysis

### Covered by Current Signals

| WCAG SC | Requirement | Covered By |
|---------|-------------|------------|
| 1.3.1 Info & Relationships | Semantic structure, ARIA roles | `hasAriaRole`, `ariaBindings`, `roleAssignments` (partial) |
| 2.1.1 Keyboard | All functionality keyboard-operable | `hasKeyboardEvents`, `keyboardHandling` (presence only) |
| 2.4.7 Focus Visible | Focus indicator visible | `hasFocusMethod`, `focusManagement` (indirect) |
| 4.1.2 Name, Role, Value | Accessible name, role, state | `hasAriaAttributes`, `hasLabelSupport`, `hasAriaRole` (partial) |

### NOT Covered — Critical Gaps

| WCAG SC | Requirement | Gap Description |
|---------|-------------|-----------------|
| **1.3.1** Info & Relationships | **ARIA pattern completeness** — A dialog must have `role="dialog"` + `aria-modal` + `aria-labelledby`. Current scoring gives credit for ANY role, not the CORRECT role with required companion attributes. | Missing: component-type-aware ARIA validation |
| **1.4.3** Contrast (Minimum) | Color contrast ratios ≥ 4.5:1 for text | Missing entirely — would require design token analysis or runtime rendering |
| **2.1.1** Keyboard | **Expected key handlers** — A combobox needs ArrowUp/Down, Enter, Escape. A dialog needs Escape. Current scoring detects any keyboard handler, not the expected ones. | Missing: component-type interaction pattern validation |
| **2.1.2** No Keyboard Trap | Focus must not be trapped except intentionally (modals) | Missing: focus trap detection for overlay components; no validation that trap can be escaped |
| **2.4.3** Focus Order | Logical tab sequence | Missing entirely — would require DOM analysis |
| **2.4.6** Headings & Labels | Descriptive labels for form inputs | `hasLabelSupport` is too narrow — only checks for slot/member named `label` |
| **3.2.1** On Focus | No context change on focus | Missing entirely — would require runtime analysis |
| **4.1.3** Status Messages | `aria-live` for dynamic status | `liveRegions` partially covers this at source level but not at CEM level |

### Coverage Summary

- **Partially covered:** 4 of 50 WCAG 2.1 AA success criteria
- **Not covered:** 46 success criteria (most require runtime analysis outside HELiXiR's scope)
- **Feasible to add with static analysis:** ~6 additional criteria (focus trap, ARIA pattern completeness, keyboard interaction coverage, live regions, heading structure, label association)

---

## 3. New Sub-Metric Definitions

### Sub-Metric 1: ARIA Pattern Completeness

**What it measures:** Whether a component implements the correct ARIA pattern for its type, including all required companion attributes.

**Component-type ARIA requirements:**

| Component Type | Required ARIA Pattern |
|---------------|----------------------|
| Dialog/Modal | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` |
| Alert | `role="alert"` or `aria-live="assertive"` |
| Combobox | `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant` |
| Menu | `role="menu"`, items have `role="menuitem"` |
| Tab | `role="tablist"`, tabs have `role="tab"`, panels have `role="tabpanel"`, `aria-selected` |
| Checkbox | `role="checkbox"`, `aria-checked` |
| Switch | `role="switch"`, `aria-checked` |
| Slider | `role="slider"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` |

**Scoring rules:**
- Identify component type from tag name (existing `ARIA_ROLE_TAG_PATTERNS`)
- Check source for each required attribute in the pattern
- Score = (attributes found / attributes required) * max_points
- Partial credit: 0-15 points based on completeness ratio
- Components not matching any known pattern: skip (don't penalize)

**Implementation approach:**
- Extend `source-accessibility.ts` with a `COMPONENT_ARIA_PATTERNS` registry
- After `scanSourceForA11yPatterns()`, run pattern-specific checks
- Return granular sub-metrics per ARIA attribute found/missing

### Sub-Metric 2: Keyboard Interaction Coverage

**What it measures:** Whether a component handles the expected keyboard interactions for its type per WAI-ARIA Authoring Practices.

**Component-type keyboard requirements:**

| Component Type | Required Keys |
|---------------|---------------|
| Button | Enter, Space |
| Dialog/Modal | Escape (close), Tab (focus trap cycling) |
| Combobox | ArrowUp, ArrowDown, Enter (select), Escape (close) |
| Menu | ArrowUp, ArrowDown, Enter, Escape, Home, End |
| Tab | ArrowLeft, ArrowRight (or Up/Down for vertical) |
| Checkbox | Space |
| Slider | ArrowLeft, ArrowRight, Home, End |
| Tree | ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Enter |

**Scoring rules:**
- Identify component type from tag name
- Search source for key name literals matching required keys
- Score = (keys found / keys required) * max_points
- Partial credit: 0-15 points based on coverage ratio
- Bonus: +2 for `aria-keyshortcuts` documentation

**Implementation approach:**
- Add `COMPONENT_KEYBOARD_PATTERNS` registry mapping component types to required key names
- Scan source for string literals matching key names within keyboard handler context
- Could leverage existing `keyboardHandling` marker as a prerequisite gate

### Sub-Metric 3: Focus Trap Detection

**What it measures:** Whether overlay/modal components implement proper focus trapping and restoration.

**Requirements for overlay components:**
1. Focus moves into the overlay on open
2. Tab cycling stays within the overlay (focus trap)
3. Focus returns to trigger element on close
4. Escape key dismisses the overlay

**Detection patterns (source-level):**
```
// Focus trap indicators
/(?:trap|contain|constrain).*focus/i
/firstFocusable|lastFocusable|focusableElements/
/document\.activeElement/  (save/restore trigger)
/sentinel|focus-trap|focus-guard/
/inert/  (background inertness)
```

**Scoring rules:**
- Only applies to components matching `/-dialog|-modal|-drawer|-overlay|-popover|-dropdown/i`
- Check for: focus move (3 pts), trap cycling (4 pts), focus restore (4 pts), escape dismiss (4 pts)
- Non-overlay components: skip
- Maximum: 15 points for overlay components, redistributed proportionally for non-overlay

### Sub-Metric 4: Screen Reader Announcements

**What it measures:** Whether components that change state dynamically provide screen reader announcements via live regions.

**Applicable components:**
- Toast/snackbar: must announce content
- Form validation: must announce errors
- Loading indicators: must announce state changes
- Auto-complete: must announce result count
- Inline editing: must announce mode changes

**Detection patterns:**
```
/aria-live\s*=\s*["'](?:polite|assertive)["']/
/role\s*=\s*["'](?:alert|status|log|timer|marquee)["']/
/aria-atomic\s*=\s*["']true["']/
/aria-relevant/
```

**Scoring rules:**
- Components with dynamic content changes (detected via state updates in render) should have live regions
- Score: 0-10 points
- Currently partially covered by `liveRegions` marker but not component-type-aware

---

## 4. Weight Rebalancing Recommendation

### Current Weight Distribution

| Dimension | Weight | Tier |
|-----------|--------|------|
| CEM Completeness | 15 | Critical |
| Accessibility | **10** | Critical |
| Type Coverage | 10 | Critical |
| Test Coverage | 10 | Critical |
| CEM-Source Fidelity | 10 | Critical |
| API Surface Quality | 10 | Important |
| CSS Architecture | 5 | Important |
| Event Architecture | 5 | Important |
| Slot Architecture | 5 | Important |
| Bundle Size | 5 | Important |
| Story Coverage | 5 | Important |
| Naming Consistency | 5 | Important |
| Performance | 5 | Advanced |
| Drupal Readiness | 5 | Advanced |
| **Total** | **105** | |

### Recommendation: Increase Accessibility from 10 to 15

**Justification:**

1. **Critical tier parity:** All other Critical tier dimensions except CEM-Source Fidelity weight 10+. CEM Completeness is 15. Accessibility should not be the lowest-weighted Critical dimension when it is arguably the most user-impacting.

2. **Legal and compliance risk:** Accessibility failures create legal liability (ADA, Section 508, EAA). No other dimension carries this regulatory weight. A component library with perfect CEM docs but poor accessibility is objectively worse than the reverse.

3. **Enterprise adoption gating:** Enterprise customers increasingly require VPAT/HECVAT documentation. Poor accessibility blocks adoption regardless of other quality metrics.

4. **Scoring discrimination:** With weight 10, a component scoring 0% on accessibility only loses 10 points from the weighted score — easily compensated by high scores elsewhere. At weight 15, this penalty better reflects the real-world impact.

5. **Precedent:** The health-scanning-audit-workflow.md lists Accessibility at 20% weight, while dimensions.ts has it at 10. This inconsistency suggests the weight was intentionally set lower during initial implementation with plans to increase.

### Impact Analysis

Moving Accessibility from 10 to 15 (and adjusting total to 110 or reducing another dimension by 5):

**Option A: Increase total to 110** (simplest)
- `computeWeightedScore()` normalizes by measured weight, so total sum doesn't matter for grade calculation
- No other dimension affected
- Score impact: components with low accessibility scores see ~5% decrease in weighted score

**Option B: Reduce Naming Consistency from 5 to 0** (remove dimension)
- Naming Consistency is Important tier, lowest priority
- Keeps total at 105
- More disruptive change

**Recommended: Option A** — increase to 15, accept total weight of 110. The normalization in `computeWeightedScore()` handles this correctly since it divides by measured weight sum.

---

## 5. Confidence Upgrade Path

### Current State

Both analysis paths return `confidence: 'heuristic'`:
- CEM-only: should be `'heuristic'` (inferred from metadata)
- CEM + Source blend: also `'heuristic'` (regex-based detection)

The `ConfidenceLevel` type supports `'verified' | 'heuristic' | 'untested'` but accessibility never reaches `'verified'`.

### Requirements for `verified` Confidence

**Phase 1: Source-verified (achievable now)**
- When source-level analysis detects ALL expected patterns for a component's type
- AND the ARIA pattern completeness sub-metric scores ≥ 80%
- AND keyboard interaction coverage sub-metric scores ≥ 80%
- Mark as `confidence: 'verified'` with note "Source-verified: ARIA and keyboard patterns confirmed"
- This doesn't mean the component is accessible — it means we've verified the presence of expected patterns

**Phase 2: Test-verified (future)**
- Integration with accessibility test results (axe-core, Playwright accessibility audit)
- If a component has passing a11y tests, confidence = `'verified'`
- Requires external data pipeline (Test Coverage dimension model)

**Phase 3: Runtime-verified (aspirational)**
- Puppeteer/Playwright-based runtime accessibility scan
- Renders component, runs axe-core, captures results
- Highest confidence level
- Significant infrastructure requirement — new MCP tool or CI integration

### Recommended Phase 1 Implementation

```typescript
// In health.ts, Accessibility case:
if (sourceA11y) {
  const blendedScore = Math.round(a11y.score * 0.3 + sourceA11y.score * 0.7);
  const subMetrics = [...cemSubMetrics, ...sourceA11y.subMetrics];

  // Upgrade confidence when source analysis is comprehensive
  const confidence: ConfidenceLevel =
    sourceA11y.score >= 80 ? 'verified' : 'heuristic';

  return { score: blendedScore, confidence, subMetrics };
}
```

This is a pragmatic first step. Source analysis at ≥80% means the component has most expected accessibility patterns present in code. It doesn't guarantee runtime correctness but provides significantly higher confidence than CEM-only inference.

---

## 6. Ranked Improvements

### Improvement 1: Component-Type-Aware ARIA Pattern Validation

**Description:** Add a pattern registry mapping component types (from tag name) to required ARIA attributes. Score components on whether they implement the correct ARIA pattern, not just whether they have any ARIA attributes.

**Impact:** HIGH — Directly addresses the largest false positive/negative gap. Currently, a dialog with `role="button"` scores the same as one with `role="dialog"` + `aria-modal` + `aria-labelledby`.

**Feasibility:** EASY — Extends existing `source-accessibility.ts` with a lookup table. No new dependencies. No architectural changes.

**Implementation steps:**
1. Create `COMPONENT_ARIA_PATTERNS` registry in `source-accessibility.ts`
2. Add `analyzeAriaPatternCompleteness(tagName: string, source: string): SubMetric` function
3. Call from `scoreSourceMarkers()` to add pattern-specific sub-metrics
4. Add unit tests with fixtures for dialog, combobox, tab, checkbox patterns

**Effort:** 1-2 days
**Dependencies:** None

---

### Improvement 2: Keyboard Interaction Coverage Validation

**Description:** Add expected keyboard interaction patterns per component type. Score whether the component handles the keys that WAI-ARIA Authoring Practices specifies for its role.

**Impact:** HIGH — Keyboard accessibility is the #1 WCAG failure for component libraries. Currently, any keyboard handler scores full points regardless of completeness.

**Feasibility:** MEDIUM — Requires careful mapping of component types to expected key handlers. The regex detection may have false positives on key name strings used in non-handler contexts.

**Implementation steps:**
1. Create `COMPONENT_KEYBOARD_PATTERNS` registry mapping component types to required keys
2. Add `analyzeKeyboardCoverage(tagName: string, source: string): SubMetric` function
3. Search for key name string literals within keyboard handler blocks
4. Return coverage ratio as sub-metric score
5. Add unit tests with component source fixtures

**Effort:** 2-3 days
**Dependencies:** None (but benefits from Improvement 1 for component type detection)

---

### Improvement 3: Focus Trap Detection for Overlay Components

**Description:** Detect whether modal/dialog/drawer components implement proper focus trapping, including focus containment, sentinel elements, and focus restoration on close.

**Impact:** MEDIUM — Affects only overlay components (~5-10% of a library) but those components have the highest a11y failure rate. Missing focus traps are critical WCAG 2.1.2 violations.

**Feasibility:** MEDIUM — Focus trap patterns vary widely across implementations (sentinel divs, `inert`, `MutationObserver`, third-party libraries like `focus-trap`). Regex detection needs broad pattern coverage.

**Implementation steps:**
1. Add `OVERLAY_TAG_PATTERNS` to identify overlay components
2. Create `analyzeFocusTrap(tagName: string, source: string): SubMetric | null`
3. Returns null for non-overlay components (no penalty)
4. Detect: focus move, trap cycling, focus restore, escape dismiss
5. Add unit tests with modal/dialog source fixtures

**Effort:** 2-3 days
**Dependencies:** None

---

### Improvement 4: Confidence Level Upgrade Logic

**Description:** Allow the accessibility dimension to reach `'verified'` confidence when source-level analysis covers ≥80% of expected patterns. Currently hardcoded to `'heuristic'`.

**Impact:** MEDIUM — Improves grade algorithm accuracy. Components with verified accessibility won't be penalized by untested-critical gates. Enables enterprise customers to distinguish between "we checked and it's accessible" vs. "we inferred from metadata."

**Feasibility:** EASY — Single conditional in `health.ts` Accessibility case. The `ConfidenceLevel` type already supports `'verified'`.

**Implementation steps:**
1. In `health.ts` line 881, change confidence from hardcoded `'heuristic'` to conditional
2. Threshold: source score ≥ 80 → `'verified'`, otherwise `'heuristic'`
3. Update unit tests in `multi-dimensional-health.test.ts`
4. Update CEM-only path to explicitly note `'heuristic'` reason

**Effort:** < 1 day
**Dependencies:** None (but most valuable after Improvements 1-2 increase source analysis depth)

---

### Improvement 5: Weight Increase from 10 to 15

**Description:** Increase the Accessibility dimension weight from 10 to 15 to match its Critical tier importance and align with the audit workflow documentation (which lists 20%).

**Impact:** MEDIUM — Better scoring discrimination for accessibility. Components with poor accessibility will see meaningful score decreases rather than being masked by strong performance in other dimensions.

**Feasibility:** EASY — Single number change in `DIMENSION_REGISTRY`. The `computeWeightedScore()` function normalizes by measured weight, so the total sum changing from 105 to 110 has no algorithmic impact.

**Implementation steps:**
1. Change `weight: 10` to `weight: 15` in `DIMENSION_REGISTRY` for Accessibility
2. Update `health-scanning-audit-workflow.md` weight table to match (currently shows 20%)
3. Run calibration: score reference library before/after, document score distribution impact
4. Update unit test assertions for weighted score calculations

**Effort:** < 1 day
**Dependencies:** Requires `vp-engineering` approval per `scoring-calibration-workflow.md`

---

## 7. Implementation Roadmap

### Phase 1: Quick Wins (< 1 week)

1. **Confidence upgrade logic** (Improvement 4) — < 1 day
2. **Weight increase to 15** (Improvement 5) — < 1 day, requires approval

### Phase 2: Pattern Validation (1-2 weeks)

3. **ARIA pattern completeness** (Improvement 1) — 1-2 days
4. **Keyboard interaction coverage** (Improvement 2) — 2-3 days

### Phase 3: Specialized Detection (1 week)

5. **Focus trap detection** (Improvement 3) — 2-3 days

### Phase 4: Future (backlog)

6. **Runtime accessibility testing** (axe-core integration) — requires infrastructure work
7. **Color contrast analysis** (design token integration) — requires token system
8. **Focus order validation** (DOM analysis) — requires rendering capability

---

## 8. Appendix: Current Scoring Flow

```
scoreComponentMultiDimensional()
  └─ case 'Accessibility':
       ├─ analyzeAccessibility(decl)          → CEM 8-signal score (0-100)
       │    └─ Binary pass/fail per signal
       ├─ analyzeSourceAccessibility(config, cem, decl)  → Source 7-marker score (0-100)
       │    ├─ resolveComponentSourceFilePath() → find .ts file
       │    ├─ scanSourceForA11yPatterns()     → regex scan
       │    ├─ isInteractiveComponent()        → skip presentational
       │    └─ scoreSourceMarkers()            → weighted sum
       └─ Blending: CEM * 0.3 + Source * 0.7 (if source available)
            └─ Always returns confidence: 'heuristic'
```

### Score Distribution Concern

The current CEM-layer weights heavily favor `hasDisabled` (25) and `hasLabelSupport` (20). A component with just these two signals scores 45/100 — nearly passing — even with zero ARIA support, zero keyboard handling, and zero focus management. This weight distribution should be revisited when implementing the new sub-metrics, potentially flattening CEM weights and adding more granularity through the source-level sub-metrics.
