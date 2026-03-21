# Lit Patterns Dimension — Formal Proposal

**Author:** Kenji T. Nakamura (Lit Specialist)
**Date:** 2026-03-19
**Status:** Proposal — requires VP Engineering approval per delegation matrix

---

## 1. Dimension Metadata

| Field | Value |
|-------|-------|
| **Name** | Lit Patterns |
| **Weight** | 5 (out of current total 105 → new total 110) |
| **Tier** | Advanced |
| **Source** | cem-native (source analysis via regex, following CEM-Source Fidelity pattern) |
| **Phase** | cem-analysis |
| **Confidence** | heuristic (regex-based source analysis) |

### Weight Rationale

**Why 5 (Advanced tier), not higher:**
1. **Framework-specific** — this dimension only applies to Lit-based libraries. Non-Lit web component libraries (FAST, Stencil, vanilla) would score 0 or be marked not-applicable. A high weight would unfairly penalize non-Lit libraries.
2. **Complementary, not primary** — many Lit patterns overlap with existing dimensions (e.g., event typing is partially covered by Event Architecture, CSS custom properties by CSS Architecture). This dimension captures the _Lit-specific_ residual.
3. **Detection confidence** — regex-based analysis has inherent false positive risk. A lower weight limits scoring impact of detection errors.
4. **Precedent** — other Advanced-tier dimensions (Performance, Drupal Readiness) carry 5 weight. This follows the established pattern for specialized/optional dimensions.

**Why not integrate into existing dimensions:**
Distributing Lit patterns across existing dimensions (e.g., adding `@state()` checks to Type Coverage) would:
- Violate the single-responsibility principle of each analyzer
- Make scoring opaque — users wouldn't know if a deduction was for general type coverage or Lit-specific patterns
- Complicate the scoring for non-Lit libraries that shouldn't be penalized for missing Lit patterns
- Make it harder to enable/disable Lit-specific scoring

A standalone dimension keeps concerns separated and allows framework-aware opt-in.

---

## 2. Sub-Metrics

### Overview

| # | Sub-Metric | Points | Tier | Category |
|---|-----------|--------|------|----------|
| 1 | Reactive Property Hygiene | 25 | Critical | Reactive Properties |
| 2 | Lifecycle Compliance | 25 | Critical | Lifecycle |
| 3 | Static Styles Usage | 20 | Important | Render Efficiency |
| 4 | Event Composition | 15 | Important | Events |
| 5 | Render Optimization | 15 | Advanced | Render Efficiency |
| **Total** | | **100** | | |

---

### Sub-Metric 1: Reactive Property Hygiene (25 points)

**What it measures:** Correct usage of `@property()` vs `@state()` decorators, type declarations, and attribute options.

**Scoring breakdown:**

| Check | Points | Condition |
|-------|--------|-----------|
| `@state()` usage | 8 | At least one `@state()` field exists (component has internal reactive state) |
| No `@property()` on private fields | 7 | Zero `@property()` decorators on `_`-prefixed or `private` fields |
| Property type declarations | 5 | All `@property()` decorators include `type:` option (or property is `String` type) |
| Attribute option appropriateness | 5 | No complex types (Array/Object/Map/Set inferred from TS annotation) without `attribute: false` |

**Scoring logic:**
- Full points for each check that passes
- Proportional deduction for partial failures (e.g., 3/4 properties have types = 3.75 → round to 4 points)
- If no `@property()` or `@state()` found in source, return `notApplicable` (not a Lit component)

---

### Sub-Metric 2: Lifecycle Compliance (25 points)

**What it measures:** Correct lifecycle method usage, super call compliance, and cleanup symmetry.

**Scoring breakdown:**

| Check | Points | Condition |
|-------|--------|-----------|
| Super call compliance | 10 | All overridden lifecycle methods (`connectedCallback`, `disconnectedCallback`, `firstUpdated`, `updated`, `willUpdate`) call `super.*()` |
| Cleanup symmetry | 10 | Every `addEventListener` in `connectedCallback` has a matching `removeEventListener` in `disconnectedCallback` |
| `requestUpdate()` moderation | 5 | `requestUpdate()` appears ≤2 times in source (0–2 = full points, 3–4 = 3 points, 5+ = 0 points) |

**Scoring logic:**
- Super call check: 10 points × (methods with super / total overridden lifecycle methods)
- Cleanup symmetry: If `connectedCallback` exists with `addEventListener` but no `disconnectedCallback` with `removeEventListener`, deduct 10 points. If no `addEventListener` in `connectedCallback`, full points (nothing to clean up).
- If no lifecycle overrides found, full 25 points (Lit handles lifecycle internally)

---

### Sub-Metric 3: Static Styles Usage (20 points)

**What it measures:** Usage of Lit's `static styles` pattern instead of inline styles.

**Scoring breakdown:**

| Check | Points | Condition |
|-------|--------|-----------|
| `static styles` present | 12 | Component defines `static styles = css\`...\`` or `static get styles()` |
| Style composition | 4 | `static styles` is an array (composing shared styles) — bonus points |
| No excessive inline styles | 4 | `style=` usage in `html\`` templates ≤ 2 occurrences |

**Scoring logic:**
- If no `static styles` detected: 0 points for first check, but don't penalize if component has no styles at all (return `notApplicable`)
- Style composition: bonus 4 points if `static styles = [` pattern detected
- Inline style count: 4 points if ≤2, 2 points if 3–5, 0 if >5

---

### Sub-Metric 4: Event Composition (15 points)

**What it measures:** Correct `bubbles`/`composed` configuration on dispatched events.

**Scoring breakdown:**

| Check | Points | Condition |
|-------|--------|-----------|
| `composed: true` on custom events | 8 | All `new CustomEvent(` calls include `composed: true` |
| `bubbles: true` on custom events | 4 | All `new CustomEvent(` calls include `bubbles: true` |
| No bare `new Event()` | 3 | Component uses `CustomEvent` instead of `Event` for all dispatched events |

**Scoring logic:**
- Proportional: (events with composed / total events) × 8
- If no `dispatchEvent` calls in source, return full points (no events to configure)
- Note: this partially overlaps with Event Architecture's existing analysis but adds source-level composed/bubbles checks that CEM cannot capture

---

### Sub-Metric 5: Render Optimization (15 points)

**What it measures:** Usage of Lit-specific render optimization patterns.

**Scoring breakdown:**

| Check | Points | Condition |
|-------|--------|-----------|
| `@query` / `@queryAll` usage | 6 | Uses `@query`/`@queryAll` decorators instead of manual `querySelector` calls |
| Template directive imports | 5 | Imports from `lit/directives/*` detected (repeat, cache, guard, classMap, etc.) |
| No excessive manual DOM queries | 4 | `this.shadowRoot?.querySelector` / `this.renderRoot.querySelector` appears ≤ 3 times |

**Scoring logic:**
- `@query` check: 6 points if at least one `@query`/`@queryAll` present, OR if no DOM queries needed (component doesn't query its shadow DOM). 0 points if manual queries used without any `@query`.
- Directive imports: 5 points if any directive import detected, 0 otherwise. This is a bonus — many simple components don't need directives.
- Manual DOM queries: 4 points if ≤3 occurrences, 2 points if 4–6, 0 if >6.

---

## 3. Detection Architecture

```
┌──────────────────────────────────────────────────┐
│              Lit Patterns Analyzer                │
│                                                   │
│  Input: CemDeclaration + McpWcConfig + Cem       │
│                                                   │
│  1. Read component source (readComponentSource)   │
│  2. Resolve inheritance chain (resolveInheritance)│
│  3. Aggregate source content                      │
│  4. Run 5 sub-metric scorers (regex-based)        │
│  5. Return LitPatternsResult                      │
│                                                   │
│  Output: { score, confidence, subMetrics }        │
└──────────────────────────────────────────────────┘
```

**Key design decisions:**
- Follows `analyzeCemSourceFidelity()` pattern exactly
- Reuses `readComponentSource()` and `resolveInheritanceChain()` from existing infrastructure
- Returns `null` when source is unavailable (honest scoring, same as CEM-Source Fidelity)
- Returns `null` when no Lit-specific patterns detected (not a Lit component)
- All regex patterns are framework-specific but handle edge cases (multiline decorators, TypeScript generics)

---

## 4. Not-Applicable Handling

The Lit Patterns dimension must gracefully handle non-Lit components:

| Scenario | Behavior |
|----------|----------|
| No source code available | Return `null` → dimension marked `untested` |
| Source has no `@property()` or `@state()` or `LitElement` | Return `null` → dimension marked `notApplicable` |
| Source extends `LitElement` or uses Lit decorators | Score normally |
| Source extends `FASTElement` or uses Stencil `@Component` | Return `null` → not a Lit component |

**Detection of Lit component:** Check for any of:
- `extends LitElement`
- `extends Lit` (short form)
- `@customElement(` decorator
- `@property(` decorator (Lit-specific import)
- Import from `'lit'` or `'lit-element'`

---

## 5. Integration into Dimension Registry

### Proposed Registry Entry

```typescript
{
  name: 'Lit Patterns',
  weight: 5,
  tier: 'advanced',
  source: 'cem-native',
  phase: 'cem-analysis',
}
```

### Proposed Classification Update

```typescript
export const DIMENSION_CLASSIFICATION = {
  critical: [
    'CEM Completeness',
    'Accessibility',
    'Type Coverage',
    'Test Coverage',
    'CEM-Source Fidelity',
  ],
  important: [
    'API Surface Quality',
    'CSS Architecture',
    'Event Architecture',
    'Slot Architecture',
    'Bundle Size',
    'Story Coverage',
    'Naming Consistency',
  ],
  advanced: ['Performance', 'Drupal Readiness', 'Lit Patterns'],  // Added here
} as const;
```

### Weight Impact

| State | Total Weight | Measured Weight (typical) |
|-------|-------------|--------------------------|
| Current (14 dimensions) | 105 | ~55–70 (CEM-native only) |
| Proposed (15 dimensions) | 110 | ~60–75 (CEM-native only) |

The 5-point weight increase (105 → 110) has minimal impact because:
1. `computeWeightedScore()` normalizes by measured weight, not total weight
2. Non-Lit components won't have this dimension measured, so their scores are unaffected
3. Lit components gain a new dimension that rewards good practices without penalizing adequate ones

---

## 6. Grade Impact Analysis

### Will Lit Patterns change grades?

For a Lit component scoring 100/100 on Lit Patterns:
- The dimension adds 5 weight points to the measured pool
- If other dimensions score ~80%, the additional 100% dimension slightly _increases_ the weighted score
- Net effect: possible +1–2 point boost for well-written Lit components

For a Lit component scoring 0/100 on Lit Patterns:
- The dimension adds 5 weight points to the measured pool at 0%
- If other dimensions score ~80%, the additional 0% dimension slightly _decreases_ the weighted score
- Net effect: possible -1–3 point drop for poorly-written Lit components

**Critical gate impact:** Lit Patterns is Advanced tier, NOT Critical. It cannot trigger critical dimension gates (grade cap at C/D). This is intentional — Lit patterns are best practices, not correctness requirements.

---

## 7. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| False positives from regex detection | Incorrect scores for edge cases | Confidence: `heuristic`, low weight (5), mark aspirational patterns |
| Non-Lit libraries penalized | Unfair scoring | `notApplicable` return for non-Lit components |
| Overlap with existing dimensions | Double-counting | Event Composition checks `composed`/`bubbles` which Event Architecture does NOT check; no overlap |
| Weight sum changes | Grade redistribution | Minimal: 105→110, normalized by measured weight |
| Maintenance burden | Another analyzer to maintain | Follows established pattern, reuses existing infrastructure |

---

## 8. Implementation Priority

| Priority | Sub-Metric | Justification |
|----------|-----------|---------------|
| P1 | Reactive Property Hygiene | Highest Lit-specific value, catches real bugs |
| P1 | Lifecycle Compliance | Prevents memory leaks, critical for production |
| P2 | Static Styles Usage | Performance impact, easy to detect |
| P2 | Event Composition | Shadow DOM correctness |
| P3 | Render Optimization | Nice-to-have, many false positive risks |

---

## 9. Approval Required

Per the custom agent delegation matrix:
- **New health dimension proposal**: `principal-engineer` (assessment) → `vp-engineering` (approval)
- **Scoring weight changes**: `principal-engineer` (proposal) → `vp-engineering` (approval)

This proposal is ready for `principal-engineer` assessment.
