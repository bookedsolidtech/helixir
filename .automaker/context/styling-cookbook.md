# Web Component Styling Cookbook — Common Recipes

Concrete styling recipes for common patterns. Use these as-is or adapt them. Every recipe follows Shadow DOM rules (CSS custom properties + ::part selectors only).

## Recipe 1: Customize Button Colors

```css
/* Override the button's color scheme */
sl-button {
  --sl-color-primary-600: #2563eb;
  --sl-color-primary-500: #3b82f6;
  --sl-color-primary-700: #1d4ed8;
}

/* Style the button's internal structure via ::part */
sl-button::part(base) {
  border-radius: 9999px; /* pill shape */
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Hover state on the part */
sl-button::part(base):hover {
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
}
```

## Recipe 2: Card with Custom Header Styling

```css
/* Card container */
sl-card {
  --sl-card-border-color: transparent;
  --sl-card-border-radius: 12px;
}

/* Card's internal regions via ::part */
sl-card::part(base) {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

sl-card::part(header) {
  background: var(--surface-secondary, #f8fafc);
  border-bottom: 1px solid var(--border-default, #e2e8f0);
  padding: 1rem 1.5rem;
}

sl-card::part(body) {
  padding: 1.5rem;
}

/* Slotted content (light DOM — normal selectors work) */
sl-card img[slot="image"] {
  width: 100%;
  height: 200px;
  object-fit: cover;
  border-radius: 12px 12px 0 0;
}
```

## Recipe 3: Form Input with Validation States

```css
/* Base input styling via tokens */
sl-input {
  --sl-input-border-radius: 8px;
  --sl-input-font-size-medium: 16px;
}

/* Error state — scope tokens to the invalid attribute */
sl-input[data-user-invalid] {
  --sl-input-border-color: var(--sl-color-danger-600);
  --sl-input-focus-ring-color: var(--sl-color-danger-300);
}

/* Success state */
sl-input[data-user-valid] {
  --sl-input-border-color: var(--sl-color-success-600);
}

/* Help text styling (if exposed as a slot — it's light DOM) */
sl-input .help-text {
  font-size: 0.875rem;
  color: var(--sl-color-neutral-500);
}
```

## Recipe 4: Dialog/Modal Overlay

```css
/* Dialog overlay and panel */
sl-dialog {
  --sl-panel-background-color: white;
  --sl-panel-border-radius: 16px;
}

sl-dialog::part(overlay) {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

sl-dialog::part(panel) {
  max-width: 560px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

sl-dialog::part(header) {
  padding: 1.5rem;
  border-bottom: 1px solid var(--sl-color-neutral-200);
}

sl-dialog::part(body) {
  padding: 1.5rem;
}

sl-dialog::part(footer) {
  padding: 1rem 1.5rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}
```

## Recipe 5: Dark Mode Toggle

```css
/* Define both themes via CSS custom properties */
:root,
.theme-light {
  --surface-primary: #ffffff;
  --surface-secondary: #f8fafc;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --border-default: #e2e8f0;
  
  /* Override component library tokens */
  --sl-color-neutral-0: #ffffff;
  --sl-color-neutral-900: #0f172a;
  --sl-color-neutral-1000: #000000;
}

.theme-dark {
  --surface-primary: #0f172a;
  --surface-secondary: #1e293b;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --border-default: #334155;
  
  /* Override component library tokens for dark */
  --sl-color-neutral-0: #0f172a;
  --sl-color-neutral-900: #f1f5f9;
  --sl-color-neutral-1000: #ffffff;
}

/* Respect system preference */
@media (prefers-color-scheme: dark) {
  :root:not(.theme-light) {
    --surface-primary: #0f172a;
    --surface-secondary: #1e293b;
    --text-primary: #f1f5f9;
    --text-secondary: #94a3b8;
    --border-default: #334155;
    
    --sl-color-neutral-0: #0f172a;
    --sl-color-neutral-900: #f1f5f9;
    --sl-color-neutral-1000: #ffffff;
  }
}
```

## Recipe 6: Navigation/Tab Styling

```css
/* Tab group container */
sl-tab-group {
  --sl-spacing-small: 0.25rem;
}

/* Individual tabs via ::part */
sl-tab::part(base) {
  padding: 0.75rem 1.25rem;
  font-weight: 500;
  border-radius: 8px 8px 0 0;
}

sl-tab::part(base):hover {
  background: var(--surface-secondary, #f1f5f9);
}

/* Active tab indicator */
sl-tab-group::part(active-tab-indicator) {
  background: var(--sl-color-primary-600);
  height: 3px;
  border-radius: 3px 3px 0 0;
}

/* Tab panel content */
sl-tab-panel::part(base) {
  padding: 1.5rem;
}
```

## Recipe 7: High Contrast / Forced Colors Mode

```css
/* Some libraries handle forced-colors internally, but you can enhance: */
@media (forced-colors: active) {
  sl-button::part(base) {
    border: 2px solid ButtonText;
  }
  
  sl-button::part(base):hover {
    border-color: Highlight;
  }
  
  sl-button::part(base):focus-visible {
    outline: 2px solid Highlight;
    outline-offset: 2px;
  }
}
```

## Anti-Pattern Recognition Quick Reference

| What you wrote | Why it fails | What to write instead |
|---|---|---|
| `sl-button .label { }` | Descendant selector can't pierce Shadow DOM | `sl-button::part(label) { }` |
| `sl-button { color: red; }` | Only affects host, not internal text | `sl-button { --sl-color-primary-600: red; }` |
| `sl-input input { }` | Internal `<input>` is in Shadow DOM | `sl-input::part(input) { }` or use CSS custom properties |
| `document.querySelector('sl-button').shadowRoot.style` | Bypasses encapsulation | Use CSS custom properties |
| `sl-button::part(base) .icon { }` | Can't nest selectors after ::part | `sl-button::part(base) { }` (style the whole part) |
| `::slotted(div span) { }` | ::slotted only selects direct children | `::slotted(div) { }` (direct child only) |
| `.wrapper sl-button { all: unset; }` | `all: unset` doesn't reach Shadow DOM | Override specific CSS custom properties |

## Debugging Checklist

If a style isn't working on a web component:

1. **Open DevTools** → Elements panel → find the component → expand its #shadow-root
2. **Check if the element you're targeting is inside Shadow DOM** — if yes, normal selectors won't work
3. **Check available CSS parts** — look for `part="..."` attributes on internal elements
4. **Check available CSS custom properties** — use `getComputedStyle(element).getPropertyValue('--property-name')`
5. **Verify your custom property name** — typos are the #1 cause of "it's not working"
6. **Check inheritance** — is another ancestor overriding the same property?
7. **Check specificity** — `:host` styles inside the component may need higher specificity to override
