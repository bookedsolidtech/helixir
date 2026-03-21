# Anti-Hallucination Validation Workflow

When writing code that uses web components, follow this workflow to prevent Shadow DOM, styling, and API mistakes.

## Quick Start: One-Call Validation

After generating any code that uses web components, call `validate_component_code` with your HTML, CSS, and JS. It runs 20 sub-validators in one shot:

```
validate_component_code({
  html: "<sl-button variant='primary'>Click</sl-button>",
  css: "sl-button { --sl-button-font-size: 1rem; }",
  code: "button.addEventListener('sl-click', handler);",
  tagName: "sl-button",
  framework: "html"  // or "react", "vue", "angular"
})
```

## Before Writing Code

1. **get_component_quick_ref** — Get the full API surface (attributes, events, slots, CSS parts, CSS custom properties)
2. **diagnose_styling** — Get Shadow DOM styling guide specific to that component

## After Writing Code

Run `validate_component_code` (all-in-one) OR individual validators:

### HTML Validators
| Tool | What it catches |
|---|---|
| `check_html_usage` | Invalid attributes, wrong enum values, boolean misuse |
| `check_slot_children` | Wrong child elements in constrained slots |
| `check_attribute_conflicts` | Conditional attributes without guard conditions |
| `check_a11y_usage` | Missing labels, manual role overrides |
| `check_component_imports` | Non-existent or misspelled tag names |
| `check_composition` | Tab/panel count mismatch, unlinked cross-references |

### CSS Validators
| Tool | What it catches |
|---|---|
| `check_shadow_dom_usage` | 15 patterns: descendant piercing, ::part() misuse (chaining, structural combining, descendant selectors), deprecated /deep/>>>/::deep, ::slotted() in consumer CSS + compound/descendant misuse, :host/:host-context() in consumer CSS, !important on tokens, display:contents on host, unknown parts, misspelled tokens |
| `check_css_vars` | Unknown CSS custom properties, typos |
| `check_token_fallbacks` | Missing var() fallbacks, hardcoded colors |
| `check_theme_compatibility` | Dark mode failures, contrast issues |
| `check_css_specificity` | !important, ID selectors, deep nesting, inline styles |
| `check_layout_patterns` | Display/dimension/position overrides on host elements |
| `check_css_scope` | Component tokens placed on :root/html/body instead of the component host |
| `check_css_shorthand` | Risky shorthand + var() combinations (border, background, font, etc.) |
| `check_color_contrast` | Low-contrast hardcoded color pairs, mixed token/hardcoded sources, low opacity on text |
| `check_transition_animation` | CSS transitions/animations on component hosts targeting standard properties (won't affect shadow internals) |

### JavaScript Validators
| Tool | What it catches |
|---|---|
| `check_event_usage` | React onXxx props on custom events, unknown events |
| `check_method_calls` | Hallucinated methods, property-as-method confusion |
| `check_shadow_dom_js` | shadowRoot.querySelector() bypass, attachShadow() on existing components, innerHTML on web components, style.cssText instead of CSS custom properties |

## When Fixes Are Needed

Call `suggest_fix` with the issue details to get copy-pasteable corrected code:

```
suggest_fix({
  type: "shadow-dom",          // or token-fallback, theme-compat, method-call, event-usage, specificity, layout
  issue: "descendant-piercing", // specific issue kind
  original: "sl-button .label { color: red; }",
  tagName: "sl-button",
  partNames: ["base", "label"]
})
```

### Shadow DOM fix types
| issue | Description |
|---|---|
| `descendant-piercing` | CSS trying to reach shadow internals |
| `direct-element-styling` | Targeting internal elements directly |
| `deprecated-deep` | Using removed /deep/, >>>, ::deep selectors |
| `part-structural` | ::part() combined with .class or [attr] selectors |
| `part-chain` | ::part()::part() chaining through nested shadows |
| `display-contents-host` | display:contents destroying the shadow root |
| `external-host` | :host/:host-context() used in consumer CSS |
| `slotted-descendant` | ::slotted(div) span — can't style descendants of slotted content |
| `slotted-compound` | ::slotted(div.foo) — only simple selectors allowed |

### Other fix types
| type | issue variants |
|---|---|
| `token-fallback` | `missing-fallback`, `hardcoded-color` |
| `theme-compat` | `hardcoded-color`, `contrast-pair` |
| `method-call` | `property-as-method`, `method-as-property`, `typo` |
| `event-usage` | `react-custom-event` |
| `specificity` | `important`, `id-selector`, `deep-nesting`, `inline-style` |
| `layout` | `host-display`, `fixed-dimensions`, `position-override`, `overflow-hidden` |

## Don't Know Which Validators to Run?

Call `recommend_checks` with your code — it analyzes the content type and returns a prioritized list.

## Critical Rules

1. **CSS selectors cannot pierce Shadow DOM** — use `::part()` or CSS custom properties
2. **`var()` always needs a fallback** — `var(--token, fallback-value)`
3. **Never use `!important` on component styles** — it prevents theming
4. **Don't set `display` on component hosts** — components manage their own layout
5. **React `onXxx` props don't work for custom events** — use `addEventListener` via refs
6. **`dialog.open()` might be a property, not a method** — check the API first
7. **Never chain `::part()::part()`** — parts don't forward through nested shadow roots without `exportparts`
8. **Don't combine `::part()` with `.class` or `[attr]`** — parts exist in a different DOM tree
9. **Don't use `/deep/`, `>>>`, or `::deep`** — deprecated and removed from all browsers
10. **Don't set `display: contents` on component hosts** — it destroys the shadow root attachment
11. **Put component tokens on the component host, not `:root`** — `:root` tokens can't reach through shadow boundaries
12. **Don't mix `var()` with literals in CSS shorthands** — if the var() is undefined, the entire shorthand fails
13. **`:host` and `:host-context()` only work inside shadow DOM** — in consumer CSS, target the tag name directly
14. **`::slotted()` only accepts simple selectors** — no compound selectors like `::slotted(div.foo)`, no descendants like `::slotted(div) span`
15. **Never access `.shadowRoot.querySelector()`** — component internals are private; use the public API (properties, methods, events, slots, CSS parts)
16. **Don't set `innerHTML` on web components** — use slot content or the component's properties/methods
17. **Don't transition standard CSS properties on component hosts** — transitions on `color`, `background`, etc. only affect the host box, not shadow internals. Transition CSS custom properties instead.
18. **Don't hardcode colors alongside design tokens** — if background uses a token but text color is hardcoded, theme changes will break contrast
