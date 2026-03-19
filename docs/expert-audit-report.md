# Expert Audit Report — Lit Web Component Best Practices in HELiXiR

**Author:** Kenji T. Nakamura (Lit Specialist)
**Date:** 2026-03-19
**Classification:** Architecture Review — requires `principal-engineer` assessment and `vp-engineering` approval

---

## Executive Summary

HELiXiR scores 14 health dimensions across 9 CEM-native and 5 external analyzers. **None are Lit-specific.** Since HELiX (the primary target library) is built with Lit, this represents a significant gap in framework-aware quality assessment.

This audit proposes a new **"Lit Patterns" dimension** with 5 sub-metrics, 100-point scoring, and Advanced tier classification (weight: 5). The dimension uses regex-based source analysis — the same proven pattern as the existing CEM-Source Fidelity analyzer — and requires zero new dependencies.

**Recommendation: Implement.** The dimension fills a genuine gap, has low grade redistribution risk, and positions HELiXiR as the only web component health tool with framework-aware scoring.

---

## 1. Audit Findings

### 1.1 Current Analyzer Inventory

HELiXiR has 9 CEM-native analyzers in `packages/core/src/handlers/analyzers/`:

| # | Analyzer | File | Lit-Specific? |
|---|---------|------|---------------|
| 1 | Type Coverage | `type-coverage.ts` | No — checks CEM type annotations generically |
| 2 | API Surface Quality | `api-surface.ts` | No — checks method docs, defaults, reflection |
| 3 | CSS Architecture | `css-architecture.ts` | No — checks CSS property/part documentation |
| 4 | Event Architecture | `event-architecture.ts` | No — checks naming, typing, descriptions |
| 5 | Source Accessibility | `source-accessibility.ts` | No — framework-agnostic regex patterns |
| 6 | CEM-Source Fidelity | `cem-source-fidelity.ts` | **Partial** — extracts `@property()` but ignores `@state()`, lifecycle |
| 7 | Slot Architecture | `slot-architecture.ts` | No — checks slot documentation quality |
| 8 | Naming Consistency | `naming-consistency.ts` | No — library-wide naming conventions |
| 9 | Mixin Resolver | `mixin-resolver.ts` | No — inheritance chain resolution utility |

### 1.2 Lit-Specific Gaps Identified

| Gap | Impact | Currently Measured By |
|-----|--------|----------------------|
| `@property()` vs `@state()` distinction | Public API leaks, internal state exposure | Nothing |
| Property `type:` declarations | Attribute serialization bugs | Nothing |
| Lifecycle cleanup symmetry | Memory leaks in production | Nothing |
| `super.connectedCallback()` compliance | Broken Lit lifecycle chain | Nothing |
| `static styles` usage | Performance (re-parsing CSS) | Nothing |
| Event `composed`/`bubbles` configuration | Events trapped in shadow DOM | Nothing |
| `@query` vs manual DOM lookups | Unnecessary DOM traversal | Nothing |
| Template directive usage | Render optimization opportunities | Nothing |
| `requestUpdate()` overuse | Infinite render loop risk | Nothing |
| Style composition patterns | Shared style management | Nothing |

**Key insight:** The CEM-Source Fidelity analyzer already reads component source code and follows inheritance chains. The infrastructure for Lit-specific detection exists — only the pattern-matching logic is missing.

### 1.3 What HELiXiR Does Well

- **Framework-agnostic CEM analysis** works for any web component library
- **Source-level analysis** via CEM-Source Fidelity and Source Accessibility is proven
- **Enterprise grade algorithm** with critical dimension gates prevents score gaming
- **Multi-dimensional architecture** cleanly separates concerns
- **notApplicable handling** prevents inflating scores for missing dimensions

---

## 2. Proposed Dimension: Lit Patterns

### 2.1 Dimension Configuration

| Field | Value | Rationale |
|-------|-------|-----------|
| Name | Lit Patterns | Clear, framework-specific |
| Weight | 5 | Advanced tier precedent (same as Performance, Drupal Readiness) |
| Tier | Advanced | Framework-specific, not universally applicable |
| Source | cem-native | Uses source analysis following CEM-Source Fidelity pattern |
| Phase | cem-analysis | Runs during CEM analysis pass |
| Confidence | heuristic | Regex-based detection |

### 2.2 Sub-Metrics (5 Scorable Patterns)

| # | Sub-Metric | Points | What It Detects |
|---|-----------|--------|-----------------|
| 1 | **Reactive Property Hygiene** | 25 | `@state()` usage, no `@property()` on private fields, `type:` declarations |
| 2 | **Lifecycle Compliance** | 25 | Super call compliance, cleanup symmetry, `requestUpdate()` moderation |
| 3 | **Static Styles Usage** | 20 | `static styles` present, style composition, inline style avoidance |
| 4 | **Event Composition** | 15 | `composed: true`, `bubbles: true`, no bare `new Event()` |
| 5 | **Render Optimization** | 15 | `@query` usage, directive imports, manual DOM query moderation |

**Total: 100 points**

### 2.3 Detection Methods

All detection is **source regex-based**, following the established CEM-Source Fidelity pattern:

| Sub-Metric | Primary Detection | Confidence | False Positive Risk |
|-----------|-------------------|------------|---------------------|
| Reactive Property Hygiene | `@property()`, `@state()` regex | Verified/Heuristic | Low–Medium |
| Lifecycle Compliance | Lifecycle method + `super.` regex | Verified/Heuristic | Low–Medium |
| Static Styles Usage | `static styles` regex | Verified | Low |
| Event Composition | `new CustomEvent(` options regex | Verified | Low |
| Render Optimization | `@query`, import regex | Verified | Low |

13 of 16 individual checks have **Verified** confidence with **Low** false positive risk.

### 2.4 Not-Applicable Handling

| Scenario | Behavior |
|----------|----------|
| No source code available | Returns `null` → `untested` |
| Not a Lit component (no LitElement/Lit imports) | Returns `null` → `notApplicable` |
| Lit component detected | Full scoring |

---

## 3. Impact Assessment

### 3.1 Grade Redistribution

| Component Type | Current Grade | With Lit Patterns | Delta |
|---------------|--------------|-------------------|-------|
| Perfect Lit (all best practices) | A (91.3%) | A (91.7%) | +0.4 |
| Typical Lit (some gaps) | C (76.1%) | C (75.4%) | -0.7 |
| Legacy Lit (old patterns) | F (55.4%) | F (53.9%) | -1.5 |
| Minimal presentational | B (80.6%) | B (81.0%) | +0.4 |
| Non-Lit (vanilla/FAST/Stencil) | Unchanged | Unchanged | 0.0 |

**No grade changes in any realistic scenario.** Maximum theoretical impact at exact grade boundaries is ±4.7 points, but this requires extreme conditions (Lit score = 0 at exact threshold).

### 3.2 Weight Conflicts

- Total weight: 105 → 110 (4.8% increase)
- No conflict with critical dimension gates (Advanced tier)
- Normalized by measured weight — unmeasured dimensions excluded
- Non-Lit components completely unaffected

---

## 4. Priority-Ranked Sub-Metrics

| Priority | Sub-Metric | Justification |
|----------|-----------|---------------|
| **P1** | Reactive Property Hygiene (25pts) | Catches real bugs: attribute serialization errors, public API leaks |
| **P1** | Lifecycle Compliance (25pts) | Prevents production memory leaks, broken lifecycle chains |
| **P2** | Static Styles Usage (20pts) | Performance impact, CSS re-parsing overhead |
| **P2** | Event Composition (15pts) | Shadow DOM correctness, events crossing boundaries |
| **P3** | Render Optimization (15pts) | Nice-to-have, optimization opportunities, higher false positive risk |

### Phased Implementation

**Phase 1 (P1):** Implement Reactive Property Hygiene + Lifecycle Compliance (50 points)
- Highest Lit-specific value
- Low false positive risk
- Catches real bugs and memory leaks

**Phase 2 (P2):** Add Static Styles Usage + Event Composition (35 points)
- Builds on Phase 1 infrastructure
- Moderate value, low risk

**Phase 3 (P3):** Add Render Optimization (15 points)
- Lower priority, some false positive risk
- Can be refined based on Phase 1/2 feedback

---

## 5. Implementation Recommendations

### 5.1 File Structure

```
packages/core/src/handlers/analyzers/
  lit-patterns.ts          ← New analyzer (follows cem-source-fidelity.ts pattern)
  index.ts                 ← Add export

packages/core/src/handlers/
  dimensions.ts            ← Add registry entry
  health.ts                ← Add case to scoreCemNativeDimension()

tests/handlers/
  lit-patterns.test.ts     ← Unit tests with source code fixtures
```

### 5.2 Reusable Infrastructure

The following existing functions should be reused directly:
- `readComponentSource()` from `cem-source-fidelity.ts` (needs extraction to shared module)
- `resolveInheritanceChain()` from `mixin-resolver.ts`
- `SubMetric` and `ConfidenceLevel` types from `dimensions.ts`

### 5.3 Testing Strategy

- **Unit tests with inline source fixtures** — embed Lit source code strings in test files
- **Perfect/typical/legacy/non-Lit archetypes** — test each returns expected scores
- **Edge cases:** multiline decorators, TypeScript generics in property types, mixin-heavy architectures
- **False positive tests:** ensure non-Lit source returns `null`

### 5.4 Configuration

Consider adding a config option to enable/disable framework-specific dimensions:
```typescript
interface McpWcConfig {
  // ... existing fields
  frameworkHints?: 'lit' | 'fast' | 'stencil' | 'auto';  // Future: auto-detect from imports
}
```

For now, auto-detection via `isLitComponent()` guard is sufficient.

---

## 6. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Regex false positives | Low | 13/16 checks have low risk; weight=5 limits impact |
| Non-Lit component penalty | None | `notApplicable` return → excluded from scoring |
| Maintenance burden | Low | Follows established pattern; one file to maintain |
| Detection accuracy for complex patterns | Medium | Mark aspirational patterns for future AST phase |
| Weight sum change (105→110) | Negligible | Normalized scoring; ±0.5–1.5 point impact |

---

## 7. Aspirational Patterns (Future Phases)

These patterns were evaluated but require capabilities beyond regex-based static analysis:

| Pattern | Prerequisite | Value |
|---------|-------------|-------|
| Reactive controller usage | AST import resolution | Medium |
| `willUpdate` vs `updated` appropriateness | Control flow analysis | Medium |
| Complex type without `attribute: false` (full) | TypeScript type resolver | High |
| Exact event listener matching (connect/disconnect) | AST scope analysis | High |
| Template re-render frequency | Runtime profiling | High |
| SSR/hydration readiness | Build system integration | Medium |

---

## 8. Conclusion

HELiXiR is well-architected for adding framework-specific scoring. The CEM-Source Fidelity analyzer proves the pattern, the mixin resolver handles inheritance chains, and the dimension registry supports clean extension.

The proposed Lit Patterns dimension:
- Fills a genuine gap with 5 scorable sub-metrics covering reactive properties, lifecycle, styles, events, and render optimization
- Uses proven source-regex detection with 13/16 checks at Verified confidence
- Has demonstrably low grade redistribution risk (±0.5–1.5 points typical)
- Positions HELiXiR as the only web component health tool with framework-aware Lit scoring
- Requires zero new dependencies and follows existing architectural patterns exactly

**Next steps:**
1. `principal-engineer` reviews this proposal
2. `vp-engineering` approves dimension weight and tier assignment
3. Implementation begins with Phase 1 (Reactive Property Hygiene + Lifecycle Compliance)

---

## Appendix A: Related Documents

| Document | Purpose |
|----------|---------|
| [lit-patterns-research.md](lit-patterns-research.md) | Comprehensive Lit best practices research |
| [lit-patterns-dimension-proposal.md](lit-patterns-dimension-proposal.md) | Formal dimension specification |
| [lit-pattern-detection-specs.md](lit-pattern-detection-specs.md) | Detection method for each sub-metric |
| [dimension-impact-analysis.md](dimension-impact-analysis.md) | Quantitative grade impact analysis |

## Appendix B: Acceptance Criteria Checklist

- [x] Documented audit of all existing analyzers identifying Lit-specific gaps (Section 1)
- [x] Proposed 'Lit Patterns' dimension with 5+ sub-metrics across reactive properties, lifecycle, render efficiency, shadow DOM, and event patterns (Section 2)
- [x] Detection method specifications for each metric defining CEM-based, source-based, or hybrid detection (Section 2.3, full specs in detection-specs.md)
- [x] Tier (Advanced) and weight (5) recommendation with impact justification (Sections 2.1, 3)
- [x] Impact analysis demonstrating grade changes on 5 component archetypes when dimension is applied (Section 3.1)
