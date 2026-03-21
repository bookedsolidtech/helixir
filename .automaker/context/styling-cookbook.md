# Web Component Styling Cookbook — Common Recipes

Concrete styling recipes for common patterns. Every recipe follows Shadow DOM rules (CSS custom properties + ::part selectors only). Examples use generic `my-*` prefixes — replace with your library's actual tag names and tokens.

## Before Writing Any CSS

**Always call `styling_preflight` first** to discover the component's actual API:

```
styling_preflight({
  cssText: "my-button::part(base) { border-radius: 8px; }",
  tagName: "my-button"
})
```

This returns: available parts, tokens, slots, validation issues, and a correct CSS snippet. Never guess part or token names — verify them against the CEM.

## Recipe 1: Customize Button Colors

```css
/* Override the button's color tokens on the host */
my-button {
  --button-bg: #2563eb;
  --button-color: #ffffff;
  --button-hover-bg: #1d4ed8;
}

/* Style the button's internal structure via ::part */
my-button::part(base) {
  border-radius: 9999px; /* pill shape */
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Hover state on the part */
my-button::part(base):hover {
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
}
```

## Recipe 2: Card with Custom Header Styling

```css
/* Card container tokens */
my-card {
  --card-border-color: transparent;
  --card-border-radius: 12px;
}

/* Card's internal regions via ::part */
my-card::part(base) {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

my-card::part(header) {
  background: var(--surface-secondary, #f8fafc);
  border-bottom: 1px solid var(--border-default, #e2e8f0);
  padding: 1rem 1.5rem;
}

my-card::part(body) {
  padding: 1.5rem;
}

/* Slotted content — light DOM selectors work on slotted elements */
my-card > img[slot="image"] {
  width: 100%;
  height: 200px;
  object-fit: cover;
  border-radius: 12px 12px 0 0;
}
```

## Recipe 3: Form Input with Validation States

```css
/* Base input tokens */
my-input {
  --input-border-radius: 8px;
  --input-font-size: 16px;
}

/* Error state — scope tokens to a state attribute */
my-input[data-user-invalid] {
  --input-border-color: var(--color-danger, #dc2626);
  --input-focus-ring-color: var(--color-danger-light, #fca5a5);
}

/* Success state */
my-input[data-user-valid] {
  --input-border-color: var(--color-success, #16a34a);
}

/* Slotted help text (light DOM) */
my-input > .help-text {
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
}
```

## Recipe 4: Dialog/Modal Overlay

```css
/* Dialog tokens */
my-dialog {
  --dialog-width: 560px;
  --dialog-border-radius: 16px;
}

my-dialog::part(overlay) {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

my-dialog::part(panel) {
  max-width: var(--dialog-width, 560px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

my-dialog::part(header) {
  padding: 1.5rem;
  border-bottom: 1px solid var(--border-default, #e2e8f0);
}

my-dialog::part(body) {
  padding: 1.5rem;
}

my-dialog::part(footer) {
  padding: 1rem 1.5rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}
```

## Recipe 5: Dark Mode with Token Switching

```css
/* Define both themes via CSS custom properties */
:root,
.theme-light {
  --surface-primary: #ffffff;
  --surface-secondary: #f8fafc;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --border-default: #e2e8f0;
}

.theme-dark {
  --surface-primary: #0f172a;
  --surface-secondary: #1e293b;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --border-default: #334155;
}

/* Respect system preference */
@media (prefers-color-scheme: dark) {
  :root:not(.theme-light) {
    --surface-primary: #0f172a;
    --surface-secondary: #1e293b;
    --text-primary: #f1f5f9;
    --text-secondary: #94a3b8;
    --border-default: #334155;
  }
}

/* Components consume YOUR tokens, not hardcoded colors */
my-card {
  --card-bg: var(--surface-primary);
  --card-text: var(--text-primary);
  --card-border: var(--border-default);
}
```

## Recipe 6: Slot Styling (Light DOM CSS)

```css
/* Default slot — style all direct children */
my-card > * {
  font-family: inherit;
  line-height: 1.5;
}

/* Named slot — target by slot attribute */
my-card > [slot="header"] {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

my-card > [slot="footer"] {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  padding-top: 1rem;
  border-top: 1px solid var(--border-default, #e2e8f0);
}

/*
  Remember: font styles (color, font-size, line-height) INHERIT through
  Shadow DOM. Layout styles (margin, padding, display, width) do NOT —
  they must be set here in light DOM CSS.
*/
```

## Recipe 7: High Contrast / Forced Colors

```css
@media (forced-colors: active) {
  my-button::part(base) {
    border: 2px solid ButtonText;
  }

  my-button::part(base):hover {
    border-color: Highlight;
  }

  my-button::part(base):focus-visible {
    outline: 2px solid Highlight;
    outline-offset: 2px;
  }
}
```

## Anti-Pattern Recognition Quick Reference

| What you wrote | Why it fails | What to write instead |
|---|---|---|
| `my-button .label { }` | Descendant selector can't pierce Shadow DOM | `my-button::part(label) { }` |
| `my-button { color: red; }` | Only affects host box, not internal text | `my-button { --button-text-color: red; }` |
| `my-input input { }` | Internal `<input>` is in Shadow DOM | `my-input::part(input) { }` or use tokens |
| `el.shadowRoot.style` | Bypasses encapsulation | Use CSS custom properties |
| `my-button::part(base) .icon { }` | Can't nest selectors after ::part | `my-button::part(base) { }` (style the whole part) |
| `::slotted(div span) { }` | ::slotted only selects direct children | `::slotted(div) { }` (direct child only) |
| `.wrapper my-button { all: unset; }` | `all: unset` doesn't reach Shadow DOM | Override specific CSS custom properties |
| `my-button { --token: var(--token); }` | Self-referential — resolves to empty | `my-button { --token: #value; }` |
| `my-button { --token: initial; }` | `initial` resets to empty for custom props | `my-button { --token: #value; }` |

## Validation Workflow

After writing CSS for any component:

1. **Preflight check**: `styling_preflight({ cssText, tagName })` — one call validates everything
2. **If issues found**: Fix based on the `issues` array and `correctSnippet`
3. **Full validation**: `validate_component_code({ html, css, code, tagName })` — runs 20 validators
4. **Get auto-fixes**: `suggest_fix({ type, issue, original })` — copy-pasteable corrected code
