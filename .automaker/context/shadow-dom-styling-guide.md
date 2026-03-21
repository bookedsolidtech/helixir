# Shadow DOM Styling Guide — Agent Reference

This context file teaches agents how to correctly style web components that use Shadow DOM. It is based on analysis of 16 real-world component libraries (Shoelace, Spectrum, Material Web, Lion, FAST, Calcite, Carbon, Ionic, Vaadin, PatternFly, UI5, Porsche, FluentUI, Elix, Wired Elements).

## The #1 Rule: You Cannot Pierce Shadow DOM

**Shadow DOM creates a style boundary.** CSS selectors from the parent document do NOT reach into a component's Shadow DOM. This is the most common hallucination — agents write CSS that targets internal elements as if they were in the light DOM.

### WRONG (will never work):
```css
/* These selectors CANNOT reach inside Shadow DOM */
sl-button .button__label { color: red; }
sl-button > div { padding: 10px; }
hx-card .card-header { font-size: 20px; }

/* Class selectors don't pierce either */
.my-button-style .internal-element { ... }

/* Even IDs don't work */
#my-component #internal-div { ... }
```

### CORRECT approaches (in order of preference):

## 1. CSS Custom Properties (Design Tokens) — PREFERRED

CSS custom properties (aka CSS variables) are the ONLY CSS values that naturally cross Shadow DOM boundaries. They cascade from parent to child, including through shadow boundaries.

```css
/* Set tokens on the host or a parent */
sl-button {
  --sl-button-font-size: 16px;
  --sl-color-primary-600: #0066cc;
}

/* Or scope to a container */
.my-theme {
  --sl-spacing-medium: 1.5rem;
  --sl-border-radius-medium: 8px;
}
```

**How it works internally:** The component's Shadow DOM styles consume these via `var()`:
```css
/* Inside the component's Shadow DOM (you don't write this — the library does) */
:host {
  font-size: var(--sl-button-font-size, 14px);
  border-radius: var(--sl-border-radius-medium, 4px);
}
```

**Key rules:**
- Always check what custom properties a component exposes using `get_component` or `get_component_narrative`
- Use the component's documented property names exactly — don't guess
- Custom properties inherit, so setting them on a parent affects all descendants
- Always provide fallback values in your own `var()` calls: `var(--my-token, fallback)`

**Library-specific token prefixes (from real-world analysis):**
| Library | Prefix | Example |
|---|---|---|
| Shoelace | `--sl-` | `--sl-color-primary-600`, `--sl-spacing-medium` |
| Material Web | `--md-sys-` | `--md-sys-color-primary`, `--md-sys-typescale-body-large-size` |
| Spectrum | `--spectrum-` | `--spectrum-global-color-blue-400` |
| FAST | `--` (no prefix) | `--accent-fill-rest`, `--neutral-foreground-rest` |
| Calcite | `--calcite-` | `--calcite-color-brand`, `--calcite-font-size-0` |
| Ionic | `--ion-` | `--ion-color-primary`, `--ion-font-family` |
| Vaadin | `--lumo-` | `--lumo-primary-color`, `--lumo-space-m` |
| PatternFly | `--pf-v5-` | `--pf-v5-global--Color--100` |

## 2. CSS Parts (::part) — For Structural Customization

`::part()` allows styling specific named internal elements. The component must explicitly expose parts.

```css
/* Style the "base" part of a button */
sl-button::part(base) {
  border-radius: 0;
  text-transform: uppercase;
}

/* Style the label part */
sl-button::part(label) {
  font-weight: 700;
  letter-spacing: 0.05em;
}

/* Parts support pseudo-classes */
sl-button::part(base):hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

sl-button::part(base):focus-visible {
  outline: 2px solid var(--sl-color-primary-600);
  outline-offset: 2px;
}
```

**Key rules:**
- You can ONLY style parts that the component exposes — check with `get_component`
- `::part()` does NOT allow descendant selectors: `::part(base) span` is INVALID
- `::part()` does NOT allow class selectors: `::part(base).active` is INVALID
- Parts are flat — you can't chain them: `::part(base)::part(label)` is INVALID
- Parts DO support pseudo-classes: `::part(base):hover`, `::part(base):focus`
- Parts DO support pseudo-elements: `::part(base)::before`, `::part(base)::after`

**Coverage varies by library (from real analysis):**
- Shoelace: ~80% of components expose parts (excellent — gold standard)
- Material Web: ~0% parts (uses tokens + `--md-*` properties exclusively)
- Spectrum: ~1% parts (uses separate `spectrum-css` package for theming)
- Lion: 0% parts (unstyled white-label — consumers provide all styles)
- Calcite: Moderate parts coverage
- If a library has no parts, you MUST use custom properties

## 3. Host Styling (:host) — For the Component's Outer Box

You can style the custom element itself (the host) directly:

```css
/* Direct element selector */
sl-button {
  display: inline-block;
  margin: 0 8px;
}

/* Attribute selectors */
sl-button[variant="primary"] {
  --sl-color-primary-600: #custom-color;
}

/* Class-based */
sl-button.large {
  --sl-button-font-size: 18px;
}
```

**Inside the component, :host styles the element from within:**
```css
/* You don't write these — the library does */
:host {
  display: inline-block;
  font-family: var(--sl-font-sans);
}

:host([disabled]) {
  opacity: 0.5;
  pointer-events: none;
}
```

## 4. Slotted Content (::slotted) — For Light DOM Children

When you put content inside a component's slot, you can style it from outside OR the component can style it with `::slotted()`:

```html
<sl-card>
  <img slot="image" src="photo.jpg" class="card-image">
  <p>Card content goes here</p>
</sl-card>
```

```css
/* You CAN style your slotted content from the parent */
sl-card .card-image {
  border-radius: 8px;
}

sl-card p {
  color: var(--sl-color-neutral-700);
}
```

**Key rules:**
- Slotted content lives in the light DOM, so normal CSS selectors work on it
- `::slotted()` is used INSIDE Shadow DOM (component authors use it, not consumers)
- `::slotted()` only selects direct children: `::slotted(span)` works, `::slotted(div span)` doesn't
- Don't confuse slotted content (light DOM) with shadow DOM internals

## Common Anti-Patterns to Avoid

### 1. Using `!important` to "force" styles into Shadow DOM
```css
/* WRONG — !important doesn't pierce Shadow DOM */
sl-button { color: red !important; }
/* This only affects the host element, not internal text */
```

### 2. Trying to select internal class names
```css
/* WRONG — .button__label is inside Shadow DOM */
sl-button .button__label { ... }
```

### 3. Guessing custom property names
```css
/* WRONG — this property probably doesn't exist */
sl-button { --button-color: red; }
/* RIGHT — use the documented property name */
sl-button { --sl-color-primary-600: red; }
```

### 4. Forgetting that custom properties inherit
```css
/* This affects ALL sl-buttons, sl-inputs, sl-selects, etc. */
:root { --sl-color-primary-600: red; }
/* Scope it if you want to limit the effect */
.my-section { --sl-color-primary-600: red; }
```

### 5. Using JavaScript to inject styles
```javascript
// WRONG — don't reach into Shadow DOM with JS
element.shadowRoot.querySelector('.internal').style.color = 'red';
// This bypasses encapsulation and breaks on library updates
```

### 6. Using global CSS resets that expect light DOM
```css
/* WRONG — * selector won't reach inside Shadow DOM */
* { box-sizing: border-box; }
/* Components must set their own box-sizing internally */
```

### 7. Expecting Tailwind utility classes to work on internals
```html
<!-- WRONG — Tailwind classes on the host don't affect shadow internals -->
<sl-button class="text-red-500 font-bold">Click</sl-button>
<!-- text-red-500 only applies to the host element, not the internal label -->
<!-- Use CSS custom properties instead -->
```

## Light/Dark Mode Patterns — Real Library Implementations

### Shoelace (Class-Based + color-scheme)
Shoelace provides separate theme files. The `color-scheme` CSS property tells the browser which scheme the element prefers (affects form controls, scrollbars, etc.):

```html
<!-- Light theme (default) -->
<link rel="stylesheet" href="shoelace/themes/light.css">
<html class="sl-theme-light">

<!-- Dark theme -->
<link rel="stylesheet" href="shoelace/themes/dark.css">
<html class="sl-theme-dark">
```

The theme files override ALL tokens:
```css
/* light.css */
:root, :host, .sl-theme-light {
  color-scheme: light;
  --sl-color-gray-50: hsl(0 0% 97.5%);
  --sl-color-gray-900: hsl(240 5.9% 10%);
  /* ... 400+ tokens */
}

/* dark.css — inverts the scale */
:host, .sl-theme-dark {
  color-scheme: dark;
  --sl-color-gray-50: hsl(240 5.1% 15%);
  --sl-color-gray-900: hsl(240 9.1% 91.8%);
  /* ... 400+ tokens */
}
```

**To support prefers-color-scheme with Shoelace:**
```html
<link rel="stylesheet" href="themes/light.css" media="(prefers-color-scheme:light)">
<link rel="stylesheet" href="themes/dark.css" media="(prefers-color-scheme:dark)">
```

### Material Web (Sass Mixin + Token Override)
Material Web uses Sass mixins for theme application:
```scss
@use '@material/web/color/color';
@use '@material/web/color/typography';

:root {
  @include color.light-theme;
  @include typography.theme;

  @media (prefers-color-scheme: dark) {
    @include color.dark-theme;
  }
}
```

Or manual token override:
```css
:root {
  --md-sys-color-primary: #6750A4;
  --md-sys-color-surface: #FFFBFE;
}
@media (prefers-color-scheme: dark) {
  :root {
    --md-sys-color-primary: #D0BCFF;
    --md-sys-color-surface: #1C1B1F;
  }
}
```

### Elix (DarkModeMixin — Runtime Detection)
Elix has a unique approach — `DarkModeMixin` that automatically detects dark backgrounds by walking the DOM tree and checking computed background colors:
```javascript
// Component automatically sets dark=true if ancestor background is dark
// Checks: computedStyle.backgroundColor → convert to HSL → lightness < 50%
import DarkModeMixin from 'elix/src/base/DarkModeMixin.js';

class MyComponent extends DarkModeMixin(ReactiveElement) {
  // dark property is automatically set based on ancestor backgrounds
  // detectDarkMode: 'auto' | 'off' (default: 'auto')
}
```

### Ionic (CSS Variables + Media Query)
```css
:root {
  --ion-color-primary: #3880ff;
  --ion-background-color: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ion-color-primary: #428cff;
    --ion-background-color: #1e1e1e;
  }
}
```

### Vaadin (Lumo Theme + color-scheme)
```css
:root {
  color-scheme: light;
  --lumo-primary-color: hsl(214, 90%, 52%);
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --lumo-primary-color: hsl(214, 86%, 55%);
  }
}
```

## Key Takeaway for Dark Mode
**The pattern is universal:** override CSS custom properties in a dark context. The mechanism varies (class, media query, data attribute, mixin), but the principle is identical — swap token values, never try to restyle internals.

## Using helixir Tools for Styling

1. **`get_component`** — Returns CSS properties and CSS parts. Check these FIRST before writing any styles.
2. **`get_component_narrative`** — Prose description including theming section with custom properties and parts.
3. **`find_components_by_token`** — Find which components use a specific CSS custom property.
4. **`find_components_using_token`** — Impact analysis: which components would be affected by changing a token.
5. **`score_component`** — CSS Architecture dimension shows how well-documented the styling API is.

## Decision Tree: How Should I Style This Component?

```
Need to style a web component?
│
├─ Want to change colors/spacing/typography?
│  └─ Use CSS Custom Properties (check get_component for available properties)
│
├─ Want to change structure/layout of internal elements?
│  ├─ Component has ::part() exposed?
│  │  └─ Yes → Use ::part() selectors
│  │  └─ No → Use CSS Custom Properties or request parts from maintainers
│  │
│  └─ Want to change host element layout?
│     └─ Style the tag directly: my-component { display: flex; margin: ... }
│
├─ Want to style content you put inside the component?
│  └─ Style it normally — slotted content is in the light DOM
│
├─ Want dark mode support?
│  ├─ Library has official theme files? (e.g., Shoelace light.css/dark.css)
│  │  └─ Use them — swap stylesheet or toggle theme class
│  ├─ Library uses Sass mixins? (e.g., Material Web)
│  │  └─ Use @include dark-theme inside @media (prefers-color-scheme: dark)
│  └─ No official dark mode?
│     └─ Override CSS custom properties in @media (prefers-color-scheme: dark)
│
└─ Unsure which properties to use?
   └─ Run get_component to see all available CSS properties and parts
```

## Framework-Specific Gotchas

### React
```jsx
// WRONG — React style objects can't set CSS custom properties on shadow internals
<SlButton style={{ '--sl-color-primary-600': 'red' }}>Click</SlButton>
// RIGHT — This actually works! CSS custom properties can be set via style attribute
// But only if the component's shadow DOM consumes them via var()

// WRONG — className won't style shadow internals
<SlButton className="text-blue-500">Click</SlButton>
// This only styles the host element, not internal text
```

### Next.js / SSR
```jsx
// IMPORTANT: Web components require client-side JavaScript
// Wrap in dynamic import or 'use client' directive
'use client';
import '@shoelace-style/shoelace/dist/components/button/button.js';

// Theme stylesheets must be loaded — they won't inherit from server
import '@shoelace-style/shoelace/dist/themes/light.css';
```

### Astro
```astro
---
// Web components render in the client, but CSS custom properties
// can be set in Astro's scoped styles
---
<sl-button>Click me</sl-button>

<style>
  /* This works — sets tokens on the host */
  sl-button {
    --sl-color-primary-600: var(--brand-primary);
  }
  
  /* This does NOT work — can't reach shadow internals */
  sl-button .button__label {
    font-size: 18px;
  }
</style>
```
