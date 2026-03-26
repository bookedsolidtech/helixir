# Lit Pattern Detection Specifications

**Author:** Kenji T. Nakamura (Lit Specialist)
**Date:** 2026-03-19
**Purpose:** Precise detection method for each Lit Patterns sub-metric

---

## Detection Architecture

All detection methods follow the CEM-Source Fidelity analyzer pattern:

```
1. Read source file via readComponentSource(config, cem, decl)
2. Resolve inheritance chain via resolveInheritanceChain()
3. Aggregate all source content into single string
4. Apply regex-based extractors to aggregated source
5. Score each sub-metric independently
6. Return combined result with sub-metric breakdown
```

**Framework guard:** Before running any sub-metric, verify the source is a Lit component:

```typescript
const LIT_COMPONENT_REGEX =
  /(?:extends\s+(?:Lit(?:Element)?|ReactiveElement))|(?:@customElement\s*\()|(?:import\s+.*from\s+['"]lit(?:-element)?['"])/;

function isLitComponent(source: string): boolean {
  return LIT_COMPONENT_REGEX.test(source);
}
```

If `isLitComponent()` returns false, the analyzer returns `null` (not applicable).

---

## Sub-Metric 1: Reactive Property Hygiene

### 1a. @state() Usage Detection

**Signal:** Component has internal reactive state via `@state()`.

**Regex:**

```typescript
const STATE_DECORATOR_REGEX = /@state\s*\(\s*\)/g;
```

**Scoring:**

- Count `@state()` occurrences
- ≥1 occurrence → 8 points
- 0 occurrences AND ≥3 `@property()` → 0 points (likely missing internal state)
- 0 occurrences AND <3 `@property()` → 8 points (simple component, may not need internal state)

**False positive risk:** LOW — `@state()` is unambiguous in Lit source.

**Confidence:** Verified (exact decorator match)

### 1b. No @property() on Private Fields

**Signal:** `@property()` should not be applied to fields prefixed with `_` or marked `private`.

**Regex:**

```typescript
// Match @property() followed by private or _-prefixed field
const PROPERTY_ON_PRIVATE_REGEX = /@property\s*\([^)]*\)\s*(?:(?:private|protected)\s+)?(?:_\w+)/g;
const EXPLICIT_PRIVATE_PROPERTY_REGEX = /@property\s*\([^)]*\)\s*private\s+\w+/g;
```

**Scoring:**

- Count matches
- 0 matches → 7 points
- 1+ matches → 0 points (anti-pattern present)

**False positive risk:** LOW — clear anti-pattern.

**Confidence:** Verified

### 1c. Property Type Declarations

**Signal:** `@property()` includes `type:` option for non-String properties.

**Regex:**

```typescript
// All @property() decorators
const ALL_PROPERTY_REGEX = /@property\s*\(\s*(\{[^}]*\})?\s*\)/g;

// @property() with type option
const PROPERTY_WITH_TYPE_REGEX = /@property\s*\(\s*\{[^}]*type\s*:/g;

// @property() with empty options (missing type)
const PROPERTY_NO_TYPE_REGEX = /@property\s*\(\s*\)/g;
```

**Scoring:**

- Total `@property()` count
- Properties with `type:` count
- Score: 5 × (withType / total), rounded
- Exception: `@property()` (no options) on a string-typed field is acceptable — but we can't easily determine TS type from regex alone, so treat missing `type:` as a weak signal

**False positive risk:** MEDIUM — string properties don't need `type:`. Score proportionally to limit impact.

**Confidence:** Heuristic

### 1d. Attribute Option Appropriateness

**Signal:** Complex-typed properties should use `attribute: false`.

**Regex approach:**

```typescript
// Properties with complex TS types but no attribute: false
// Step 1: Extract @property() with TS type annotations
const PROPERTY_WITH_COMPLEX_TYPE =
  /@property\s*\(\s*\{[^}]*\}\s*\)\s*(?:\w+\s*:\s*(Map|Set|Array|Object|Record|WeakMap|WeakSet|Function))/g;

// Step 2: Check if attribute: false is present in options
const HAS_ATTRIBUTE_FALSE = /attribute\s*:\s*false/;
```

**Per deviation rules:** This detection requires type inference beyond simple regex. Mark as **aspirational for future runtime analysis phase**. For now, only flag the obvious case: `@property()` with no options at all on fields whose TypeScript type annotation contains `Map`, `Set`, `Array<`, or `Record<`.

**Scoring (simplified):**

- Check for `@property()` (no options) on fields with complex type annotations
- 0 violations → 5 points
- 1+ violations → proportional deduction

**False positive risk:** HIGH — regex cannot reliably parse TS type annotations across multiline decorators.

**Confidence:** Heuristic (mark as aspirational)

---

## Sub-Metric 2: Lifecycle Compliance

### 2a. Super Call Compliance

**Signal:** Overridden lifecycle methods must call `super.<method>()`.

**Regex approach:**

```typescript
const LIFECYCLE_METHODS = [
  'connectedCallback',
  'disconnectedCallback',
  'firstUpdated',
  'updated',
  'willUpdate',
] as const;

// For each method, check if it's overridden and if super is called
function checkSuperCallCompliance(source: string): { total: number; withSuper: number } {
  let total = 0;
  let withSuper = 0;

  for (const method of LIFECYCLE_METHODS) {
    // Check if method is defined (class method definition)
    const methodRegex = new RegExp(
      `(?:async\\s+)?${method}\\s*\\([^)]*\\)\\s*(?::\\s*\\w+)?\\s*\\{`,
      'g',
    );

    if (methodRegex.test(source)) {
      total++;
      // Check if super.<method>() is called anywhere in the source
      const superRegex = new RegExp(`super\\.${method}\\s*\\(`, 'g');
      if (superRegex.test(source)) {
        withSuper++;
      }
    }
  }

  return { total, withSuper };
}
```

**Scoring:**

- If no lifecycle overrides: full 10 points
- Otherwise: 10 × (withSuper / total), rounded

**False positive risk:** LOW — `super.connectedCallback()` is unambiguous.

**Confidence:** Verified

### 2b. Cleanup Symmetry

**Signal:** `addEventListener` in `connectedCallback` must have matching `removeEventListener` in `disconnectedCallback`.

**Regex approach:**

```typescript
// Extract connectedCallback body
const CONNECTED_CALLBACK_REGEX = /connectedCallback\s*\(\s*\)\s*\{([\s\S]*?)(?=\n\s*\w|\n\s*\})/;

// Extract disconnectedCallback body
const DISCONNECTED_CALLBACK_REGEX =
  /disconnectedCallback\s*\(\s*\)\s*\{([\s\S]*?)(?=\n\s*\w|\n\s*\})/;

// Count addEventListener calls in connectedCallback
const ADD_LISTENER_REGEX = /addEventListener\s*\(/g;

// Count removeEventListener calls in disconnectedCallback
const REMOVE_LISTENER_REGEX = /removeEventListener\s*\(/g;
```

**Scoring:**

- Count `addEventListener` in connected scope
- Count `removeEventListener` in disconnected scope
- If add count > 0 AND remove count = 0: 0 points (leak)
- If add count > 0 AND remove count > 0: proportional (min(remove/add, 1) × 10)
- If add count = 0: full 10 points (nothing to clean up)

**Note:** This is a heuristic — we cannot match specific event names between add/remove without AST analysis. Per deviation rules, exact matching is marked as aspirational for future AST-based analysis. Current detection checks count parity as a proxy.

**False positive risk:** MEDIUM — cannot verify exact event name matching.

**Confidence:** Heuristic

### 2c. requestUpdate() Moderation

**Signal:** Excessive `requestUpdate()` calls suggest anti-patterns.

**Regex:**

```typescript
const REQUEST_UPDATE_REGEX = /this\.requestUpdate\s*\(/g;
```

**Scoring:**

- Count occurrences
- 0–2: 5 points
- 3–4: 3 points
- 5+: 0 points

**False positive risk:** LOW — `requestUpdate()` count is a clear signal.

**Confidence:** Verified

---

## Sub-Metric 3: Static Styles Usage

### 3a. static styles Present

**Regex:**

```typescript
const STATIC_STYLES_REGEX = /static\s+(?:get\s+)?styles\s*(?:=|\()/;
```

**Scoring:**

- Present: 12 points
- Absent AND component has template (`render()` method): 0 points
- Absent AND no template: return `notApplicable`

**False positive risk:** LOW

**Confidence:** Verified

### 3b. Style Composition

**Regex:**

```typescript
// static styles = [sharedStyles, css`...`]
const STYLE_COMPOSITION_REGEX = /static\s+styles\s*=\s*\[/;
```

**Scoring:**

- Array pattern detected: 4 bonus points
- Single styles declaration: 0 bonus points (not penalized)

**False positive risk:** LOW

**Confidence:** Verified

### 3c. Inline Style Count

**Regex:**

```typescript
// style= inside html`` template literals
const INLINE_STYLE_REGEX = /style\s*=\s*["'`$]/g;
```

**Scoring:**

- Count occurrences within `html\`` template blocks
- ≤2: 4 points
- 3–5: 2 points
- > 5: 0 points

**False positive risk:** MEDIUM — may match style attributes in non-template strings. Mitigate by only counting within `html\`` blocks if feasible, otherwise accept the noise at low weight.

**Confidence:** Heuristic

---

## Sub-Metric 4: Event Composition

### 4a. composed: true on Custom Events

**Regex:**

```typescript
// Extract all CustomEvent constructions
const CUSTOM_EVENT_REGEX = /new\s+CustomEvent\s*\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*\{([^}]*)\})?/g;

// Check for composed: true in options
const COMPOSED_TRUE_REGEX = /composed\s*:\s*true/;
```

**Scoring:**

- For each `new CustomEvent(` match:
  - Has options with `composed: true`: counts as composed
  - No options or `composed: false`/absent: counts as not composed
- Score: 8 × (composedCount / totalEvents), rounded
- If no events: full 8 points

**False positive risk:** LOW — regex reliably extracts CustomEvent options block.

**Confidence:** Verified

### 4b. bubbles: true on Custom Events

**Regex:**

```typescript
const BUBBLES_TRUE_REGEX = /bubbles\s*:\s*true/;
```

**Scoring:**

- Same approach as composed, applied to same extracted event options
- Score: 4 × (bubblesCount / totalEvents), rounded

**False positive risk:** LOW

**Confidence:** Verified

### 4c. No Bare new Event()

**Regex:**

```typescript
// new Event('name') — not new CustomEvent
const BARE_EVENT_REGEX = /new\s+Event\s*\(\s*['"`]/g;
```

**Scoring:**

- 0 bare `new Event()`: 3 points
- 1+: 0 points

**False positive risk:** LOW — `new Event(` is distinct from `new CustomEvent(`.

**Confidence:** Verified

---

## Sub-Metric 5: Render Optimization

### 5a. @query / @queryAll Usage

**Regex:**

```typescript
const QUERY_DECORATOR_REGEX = /@query(?:All)?\s*\(/g;
const MANUAL_QUERY_REGEX =
  /(?:this\.shadowRoot|this\.renderRoot)\??\.\s*querySelector(?:All)?\s*\(/g;
```

**Scoring:**

- Has `@query`/`@queryAll`: 6 points
- No `@query` AND has manual queries: 0 points
- No `@query` AND no manual queries: 6 points (no DOM queries needed)

**False positive risk:** LOW

**Confidence:** Verified

### 5b. Template Directive Imports

**Regex:**

```typescript
const DIRECTIVE_IMPORT_REGEX = /import\s+.*from\s+['"]lit\/directives\//g;
```

**Scoring:**

- Any directive import found: 5 points
- No directive imports: 0 points (not penalized heavily — many simple components don't need directives)

**False positive risk:** LOW

**Confidence:** Verified

### 5c. Manual DOM Query Count

Uses `MANUAL_QUERY_REGEX` from 5a.

**Scoring:**

- ≤3 occurrences: 4 points
- 4–6: 2 points
- > 6: 0 points

**False positive risk:** LOW

**Confidence:** Verified

---

## Implementation Code Skeleton

```typescript
// packages/core/src/handlers/analyzers/lit-patterns.ts

import type { McpWcConfig } from '../../config.js';
import type { Cem, CemDeclaration } from '../cem.js';
import type { SubMetric, ConfidenceLevel } from '../dimensions.js';

export interface LitPatternsResult {
  score: number;
  confidence: ConfidenceLevel;
  subMetrics: SubMetric[];
}

const LIT_COMPONENT_REGEX =
  /(?:extends\s+(?:Lit(?:Element)?|ReactiveElement))|(?:@customElement\s*\()|(?:import\s+.*from\s+['"]lit(?:-element)?['"])/;

export async function analyzeLitPatterns(
  config: McpWcConfig,
  cem: Cem,
  decl: CemDeclaration,
): Promise<LitPatternsResult | null> {
  // 1. Read source (reuse from cem-source-fidelity pattern)
  // 2. Guard: return null if not a Lit component
  // 3. Score each sub-metric
  // 4. Aggregate and return
}
```

---

## Detection Confidence Summary

| Sub-Metric                       | Detection Method            | Confidence               | False Positive Risk |
| -------------------------------- | --------------------------- | ------------------------ | ------------------- |
| @state() usage                   | Source regex                | Verified                 | Low                 |
| @property() on private           | Source regex                | Verified                 | Low                 |
| Property type declarations       | Source regex                | Heuristic                | Medium              |
| Attribute option appropriateness | Source regex + TS type      | Heuristic (aspirational) | High                |
| Super call compliance            | Source regex                | Verified                 | Low                 |
| Cleanup symmetry                 | Source regex (count parity) | Heuristic                | Medium              |
| requestUpdate() moderation       | Source regex (count)        | Verified                 | Low                 |
| static styles present            | Source regex                | Verified                 | Low                 |
| Style composition                | Source regex                | Verified                 | Low                 |
| Inline style count               | Source regex                | Heuristic                | Medium              |
| composed: true                   | Source regex                | Verified                 | Low                 |
| bubbles: true                    | Source regex                | Verified                 | Low                 |
| No bare Event()                  | Source regex                | Verified                 | Low                 |
| @query usage                     | Source regex                | Verified                 | Low                 |
| Directive imports                | Source regex                | Verified                 | Low                 |
| Manual DOM query count           | Source regex                | Verified                 | Low                 |

**Overall dimension confidence:** Heuristic (3 of 16 checks have medium false positive risk)

---

## Aspirational Patterns (Future Phase)

Per deviation rules, these patterns require runtime analysis or AST-based source analysis and are out-of-scope for the current static analysis phase:

| Pattern                                                 | Prerequisite                           | Proposed Phase                   |
| ------------------------------------------------------- | -------------------------------------- | -------------------------------- |
| Complex type without `attribute: false` (full accuracy) | TypeScript type resolver or AST parser | Phase 2: AST analysis            |
| Exact event listener name matching (connect/disconnect) | AST scope analysis                     | Phase 2: AST analysis            |
| `willUpdate` vs `updated` usage appropriateness         | Control flow analysis                  | Phase 3: Runtime instrumentation |
| Template re-render frequency                            | Runtime profiling                      | Phase 3: Runtime instrumentation |
| Reactive controller patterns                            | AST + import resolution                | Phase 2: AST analysis            |
