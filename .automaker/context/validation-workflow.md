# Anti-Hallucination Validation Workflow

When writing code that uses web components, follow this workflow to prevent Shadow DOM, styling, and API mistakes.

## Quick Start: One-Call Validation

After generating any code that uses web components, call `validate_component_code` with your HTML, CSS, and JS. It runs 17 sub-validators in one shot:

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
| `check_shadow_dom_usage` | 12 patterns: descendant piercing, ::part() misuse (chaining, structural combining, descendant selectors), deprecated /deep/>>>/::deep, ::slotted() in consumer CSS, !important on tokens, display:contents on host, unknown parts, misspelled tokens |
| `check_css_vars` | Unknown CSS custom properties, typos |
| `check_token_fallbacks` | Missing var() fallbacks, hardcoded colors |
| `check_theme_compatibility` | Dark mode failures, contrast issues |
| `check_css_specificity` | !important, ID selectors, deep nesting, inline styles |
| `check_layout_patterns` | Display/dimension/position overrides on host elements |
| `check_css_scope` | Component tokens placed on :root/html/body instead of the component host |
| `check_css_shorthand` | Risky shorthand + var() combinations (border, background, font, etc.) |

### JavaScript Validators
| Tool | What it catches |
|---|---|
| `check_event_usage` | React onXxx props on custom events, unknown events |
| `check_method_calls` | Hallucinated methods, property-as-method confusion |

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
