# Lit Best Practices Research — Expert Audit

**Author:** Kenji T. Nakamura (Lit Specialist)
**Date:** 2026-03-19
**Scope:** Comprehensive research of Lit framework patterns relevant to HELiXiR health scoring

---

## 1. Current HELiXiR Coverage Audit

### 1.1 Existing Analyzers and Their Lit Awareness

HELiXiR currently scores 14 health dimensions across 9 CEM-native and 5 external analyzers. None are Lit-specific. Here is what each analyzer measures and what Lit patterns it misses:

| Analyzer | What It Measures | Lit-Specific Gaps |
|----------|-----------------|-------------------|
| **CEM Completeness** | Description, property docs, event types/docs, CSS parts, slots | Does not distinguish `@property()` vs `@state()` — treats all fields equally |
| **Accessibility** | ARIA bindings, role assignments, keyboard handling, focus management | Framework-agnostic regex patterns; misses Lit-specific `@query` focus patterns |
| **Type Coverage** | Property types, event payloads, method return types | Does not check Lit property option `type` declarations (String/Number/Boolean) |
| **API Surface Quality** | Method docs, attribute reflection, defaults, property descriptions | Does not validate `reflect: true` appropriateness or `attribute: false` usage |
| **CSS Architecture** | Custom property descriptions, design token naming, CSS parts docs | Does not check for `static styles` usage vs inline styles, `adoptedStyleSheets` |
| **Event Architecture** | Kebab-case naming, typed payloads, event descriptions | Does not check `bubbles`/`composed` configuration, event cleanup in `disconnectedCallback` |
| **CEM-Source Fidelity** | Event/property/attribute alignment between CEM and source | Already extracts `@property()` decorators but ignores `@state()`, `@query`, lifecycle patterns |
| **Slot Architecture** | Default slot, named slots, type constraints, slot-property coherence | Does not analyze Lit template `<slot>` usage patterns |
| **Naming Consistency** | Event prefixes, property naming, CSS prefixes, attribute-property mapping | Does not validate Lit-specific conventions (e.g., `_` prefix for `@state()`) |
| **Test Coverage** | External — line coverage percentages | No Lit-specific test patterns |
| **Bundle Size** | External — gzip sizes | No detection of tree-shaking-friendly Lit patterns |
| **Story Coverage** | External — Storybook stories present | No Lit-specific story patterns |
| **Performance** | External — runtime metrics | No Lit render performance patterns |
| **Drupal Readiness** | External — CMS integration readiness | No Lit-specific SSR/hydration patterns |

### 1.2 Key Finding

The CEM-Source Fidelity analyzer (`cem-source-fidelity.ts`) already performs source code analysis with regex-based extraction. It:
- Reads component source files via `readComponentSource()`
- Follows inheritance chains via `resolveInheritanceChain()` from `mixin-resolver.ts`
- Extracts `@property()` decorators, `dispatchEvent()` calls, `observedAttributes`
- Compares source findings against CEM declarations

**This is the exact pattern a Lit Patterns analyzer should follow.** The infrastructure for source-level analysis exists — the gap is Lit-specific pattern detection logic.

---

## 2. Lit Reactive Property Patterns

### 2.1 @property() vs @state() Distinction

The fundamental Lit reactivity pattern: `@property()` declares public API (reflected to attributes, part of the component contract), while `@state()` declares internal reactive state (never exposed as attributes).

**What to detect:**
```typescript
// GOOD: Clear public/private distinction
@property({ type: String }) label = '';           // Public API
@state() private _isOpen = false;                 // Internal state

// BAD: Internal state exposed as public property
@property() private _isOpen = false;              // Anti-pattern
@property() isOpen = false;                       // Ambiguous — no type, leaks internal state?
```

**Detection signals (source regex):**
- `@property()` count vs `@state()` count — a component with many `@property()` and zero `@state()` may be leaking internal state
- `@property()` on private/underscore-prefixed fields — definite anti-pattern
- `@state()` without `private` modifier — weak signal (should be private)

**CEM gap:** CEM does not distinguish `@property()` from `@state()`. All decorated fields appear as `members` with `kind: 'field'`. The `@state()` fields are typically excluded from CEM by the analyzer, so their absence is the signal.

### 2.2 Property Type Declarations

Lit's `@property({ type: X })` tells the framework how to serialize/deserialize attribute values. Missing `type` means Lit defaults to `String`, which may cause bugs for Boolean/Number properties.

**What to detect:**
```typescript
// GOOD: Explicit type declaration
@property({ type: Boolean }) disabled = false;
@property({ type: Number }) count = 0;
@property({ type: Array }) items: string[] = [];

// BAD: Missing type (defaults to String)
@property() count = 0;          // Will receive "0" string from attribute
@property() disabled = false;   // Will receive "false" string from attribute
```

**Detection signals (source regex):**
- `@property()` with empty options or no `type:` key
- Cross-reference with TypeScript type annotation — if type is `number` or `boolean` but no `type:` in decorator options

### 2.3 Reflect and Attribute Options

```typescript
// Reflect: mirrors property changes back to HTML attributes
@property({ type: Boolean, reflect: true }) active = false;

// attribute: false — for non-serializable properties
@property({ attribute: false }) complexData: Map<string, Item> = new Map();

// Custom converter — for complex attribute serialization
@property({
  converter: {
    fromAttribute: (value: string) => JSON.parse(value),
    toAttribute: (value: unknown) => JSON.stringify(value),
  }
}) config: Config = {};
```

**Detection signals:**
- Properties with complex types (`Map`, `Set`, `Array`, `Object`) without `attribute: false` — potential serialization bugs
- `reflect: true` on object/array types — performance concern (serializing on every change)

---

## 3. Lifecycle Best Practices

### 3.1 connectedCallback / disconnectedCallback Cleanup

Components that register global event listeners, observers, or subscriptions in `connectedCallback` must clean them up in `disconnectedCallback` to prevent memory leaks.

**What to detect:**
```typescript
// GOOD: Cleanup pattern
connectedCallback() {
  super.connectedCallback();
  window.addEventListener('resize', this._handleResize);
}
disconnectedCallback() {
  super.disconnectedCallback();
  window.removeEventListener('resize', this._handleResize);
}

// BAD: Leak pattern
connectedCallback() {
  super.connectedCallback();
  window.addEventListener('resize', this._handleResize);
  // No disconnectedCallback — listener leaks!
}
```

**Detection signals:**
- `connectedCallback` with `addEventListener` but no `disconnectedCallback` or no `removeEventListener` — memory leak
- `connectedCallback` without `super.connectedCallback()` — Lit lifecycle break
- `disconnectedCallback` without `super.disconnectedCallback()` — Lit lifecycle break

### 3.2 willUpdate vs updated Usage

- `willUpdate(changedProperties)`: Runs before render. Best for computing derived state.
- `updated(changedProperties)`: Runs after render. Best for DOM interaction, side effects.

**Anti-patterns:**
- Modifying reactive properties in `updated()` — causes extra render cycles
- DOM queries in `willUpdate()` — DOM not yet updated
- `requestUpdate()` calls in `updated()` — infinite render loop risk

**Detection signals:**
- `this.requestUpdate()` usage count — should be rare (>2 occurrences is a warning)
- Property assignments (e.g., `this.x = ...`) inside `updated()` — triggers re-render
- DOM access (e.g., `this.shadowRoot`, `this.querySelector`) inside `willUpdate()` — premature

### 3.3 Super Call Compliance

```typescript
// REQUIRED: All lifecycle overrides must call super
connectedCallback() { super.connectedCallback(); /* ... */ }
disconnectedCallback() { super.disconnectedCallback(); /* ... */ }
```

**Detection:** Regex for lifecycle method definitions without corresponding `super.` calls.

---

## 4. Render Efficiency Patterns

### 4.1 Static Styles

```typescript
// GOOD: Static styles — parsed once, shared across instances
static styles = css`
  :host { display: block; }
`;

// BAD: Inline styles in render — creates new objects on every render
render() {
  return html`<div style="display: block"></div>`;
}
```

**Detection signals:**
- `static styles` or `static get styles()` — present = good
- `style=` inside `html\`` templates — inline style usage (warning, not error)

### 4.2 @query / @queryAll vs Manual DOM Lookups

```typescript
// GOOD: Lit's @query decorator — cached, type-safe
@query('#input') _input!: HTMLInputElement;

// BAD: Manual DOM lookup in render or lifecycle
this.shadowRoot?.querySelector('#input');
this.renderRoot.querySelector('#input');
```

**Detection signals:**
- `@query` / `@queryAll` decorator usage — positive signal
- `this.shadowRoot?.querySelector` or `this.renderRoot.querySelector` count — negative signal if excessive
- Presence of both is acceptable; exclusive use of manual queries when `@query` would work is suboptimal

### 4.3 Template Directives

Lit provides directives for render optimization:
- `repeat()` — keyed list rendering (avoids full re-render)
- `cache()` — caches template instances for conditional rendering
- `guard()` — prevents re-evaluation of expensive computations
- `nothing` — sentinel for conditional template exclusion
- `classMap()`, `styleMap()` — efficient class/style binding

**Detection signals:**
- Import statements for `lit/directives/repeat.js`, etc. — positive signal
- Usage of `Array.map()` in templates without `repeat()` — weak warning for large lists

---

## 5. Shadow DOM Patterns

### 5.1 CSS Custom Property Exposure

Well-designed Lit components expose CSS custom properties for theming:

```typescript
static styles = css`
  :host {
    --component-bg: var(--theme-surface, #fff);
    --component-text: var(--theme-on-surface, #000);
    color: var(--component-text);
    background: var(--component-bg);
  }
`;
```

**What HELiXiR already measures:** CSS Architecture analyzer checks `cssProperties` in CEM for descriptions and naming patterns.

**What it misses:** Whether `var()` usage in actual source styles matches CEM `cssProperties` declarations — the fidelity gap. Also whether `--` custom properties follow a component-namespaced pattern.

### 5.2 ::part() Export Strategy

```typescript
render() {
  return html`
    <div part="container">
      <slot part="content"></slot>
    </div>
  `;
}
```

**What HELiXiR already measures:** CSS Architecture checks `cssParts` documentation in CEM.

**What it misses:** Whether `part=` attributes in source templates match CEM `cssParts` — another fidelity check.

### 5.3 adoptedStyleSheets

Modern Lit components can use `adoptedStyleSheets` for shared styles:
```typescript
static styles = [sharedStyles, css`/* component-specific */`];
```

**Detection:** `static styles` as array = shared style composition pattern (positive signal).

---

## 6. Event Patterns

### 6.1 Custom Event Typing

```typescript
// GOOD: Strongly typed custom events
declare global {
  interface HTMLElementEventMap {
    'my-change': CustomEvent<{ value: string }>;
  }
}

this.dispatchEvent(new CustomEvent('my-change', {
  detail: { value: this.value },
  bubbles: true,
  composed: true,
}));

// BAD: Untyped events
this.dispatchEvent(new CustomEvent('change'));
```

**What HELiXiR already measures:** Event Architecture checks for typed payloads in CEM.
**What it misses:** Whether events have `bubbles: true, composed: true` for Shadow DOM traversal.

### 6.2 Event Bubbling/Composed Configuration

For events to cross Shadow DOM boundaries, they need `composed: true`. For events to bubble through the DOM tree, they need `bubbles: true`.

**Detection signals (source):**
- `new CustomEvent(` with `composed: true` — correctly configured for Shadow DOM
- `new CustomEvent(` without `composed` — event trapped inside shadow root
- `new Event(` — lacks `detail` payload (should usually be `CustomEvent`)

### 6.3 Event Cleanup on Disconnect

```typescript
// Events registered outside the component (window, document, ResizeObserver, etc.)
// must be cleaned up in disconnectedCallback
disconnectedCallback() {
  super.disconnectedCallback();
  window.removeEventListener('resize', this._onResize);
  this._resizeObserver?.disconnect();
}
```

**Detection:** Already covered in lifecycle cleanup analysis (Section 3.1).

---

## 7. Patterns Currently Unmeasured by HELiXiR

Summary of the 5 highest-value Lit patterns not currently scored:

| # | Pattern | Category | Detection Feasibility |
|---|---------|----------|-----------------------|
| 1 | `@property()` vs `@state()` usage | Reactive Properties | **High** — regex on source |
| 2 | Property `type` declarations | Reactive Properties | **High** — regex on source |
| 3 | Lifecycle cleanup (connect/disconnect symmetry) | Lifecycle | **High** — regex on source |
| 4 | `static styles` usage | Render Efficiency | **High** — regex on source |
| 5 | Event `composed`/`bubbles` configuration | Events | **Medium** — regex on source, may need context |
| 6 | `super.connectedCallback()` compliance | Lifecycle | **High** — regex on source |
| 7 | `@query` vs manual DOM lookup | Render Efficiency | **Medium** — regex count comparison |
| 8 | `requestUpdate()` overuse | Lifecycle | **High** — regex count |
| 9 | Complex type without `attribute: false` | Reactive Properties | **Low** — needs type inference |
| 10 | Template directive usage | Render Efficiency | **Medium** — import statement scan |

---

## 8. Detection Method Comparison

| Method | Pros | Cons | HELiXiR Precedent |
|--------|------|------|--------------------|
| CEM metadata | Fast, no source needed | Cannot detect Lit-specific patterns | All CEM-native analyzers |
| Source regex | Framework-specific, proven pattern | False positives possible, fragile | CEM-Source Fidelity, Source Accessibility |
| AST analysis | Precise, context-aware | New dependency, slower | None (not currently used) |
| Hybrid (CEM + source) | Best coverage | More complex implementation | Accessibility (30% CEM + 70% source) |

**Recommendation:** Follow the CEM-Source Fidelity analyzer pattern — source regex analysis with inheritance chain resolution. This is proven, requires no new dependencies, and aligns with HELiXiR's zero-dependency philosophy.

---

## 9. References

- [Lit Reactive Properties](https://lit.dev/docs/components/properties/)
- [Lit Lifecycle](https://lit.dev/docs/components/lifecycle/)
- [Lit Styles](https://lit.dev/docs/components/styles/)
- [Lit Events](https://lit.dev/docs/components/events/)
- [Lit Directives](https://lit.dev/docs/templates/directives/)
- [Custom Elements Manifest Spec](https://github.com/webcomponents/custom-elements-manifest)
