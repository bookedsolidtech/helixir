# Framework Integration Patterns for Web Components

## React Integration

### The Problem
React uses a virtual DOM and synthetic events. Web components use the real DOM and `CustomEvent`. React doesn't natively forward unknown props to custom element attributes or bind to custom events.

### Correct Patterns

**Event Listening — use refs, not onXxx props:**
```tsx
// WRONG — React ignores custom events via JSX props
<my-button onMyClick={handler} />

// CORRECT — use ref + addEventListener
function MyApp() {
  const buttonRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      console.log(detail);
    };
    el.addEventListener('my-click', handler);
    return () => el.removeEventListener('my-click', handler);
  }, []);

  return <my-button ref={buttonRef}>Click me</my-button>;
}
```

**React 19+ handles this natively** — custom events work as props when the component is defined. For React 18 and below, always use refs.

**Boolean attributes:**
```tsx
// React passes boolean props as properties, not attributes
// This works for Lit components (they use property reflection)
<my-button disabled={true} />

// For non-Lit components that only check attributes:
<my-button disabled="" />  // attribute present = truthy
```

**Wrapper Components (Shoelace pattern):**
Libraries like Shoelace generate React wrapper components that handle event binding and property forwarding automatically. If the library provides React wrappers, prefer those over raw custom elements.

```tsx
// Shoelace provides @shoelace-style/shoelace/dist/react/
import { SlButton } from '@shoelace-style/shoelace/dist/react';

// Events work as expected
<SlButton onSlClick={handler}>Click</SlButton>
```

### Import Registration
```tsx
// Always import the component definition to register it
import '@my-lib/components/my-button';

// Do this ONCE at the app entry point, not in every component
```

## Next.js / SSR Integration

### The Problem
Web components use `customElements.define()` which requires the DOM — it doesn't exist during server-side rendering. Accessing `window`, `document`, or `HTMLElement` during SSR crashes the build.

### Correct Patterns

**Dynamic imports with `next/dynamic`:**
```tsx
import dynamic from 'next/dynamic';

const MyButton = dynamic(
  () => import('@my-lib/components/my-button').then(() => {
    // Component is now registered, render it
    return { default: () => <my-button>Click</my-button> };
  }),
  { ssr: false }
);
```

**`'use client'` directive (App Router):**
```tsx
'use client';
import '@my-lib/components/my-button';

export function MyButtonWrapper({ children, ...props }) {
  return <my-button {...props}>{children}</my-button>;
}
```

**Check for browser environment:**
```tsx
if (typeof window !== 'undefined') {
  import('@my-lib/components/my-button');
}
```

### Key Rules
1. NEVER import web component registration at the top level of a server component
2. Always use `'use client'` or `dynamic(() => ..., { ssr: false })`
3. The HTML tag renders as an unknown element during SSR — this is OK, it upgrades on hydration
4. Use `suppressHydrationWarning` if the component renders differently client-side

## Vue Integration

### Correct Patterns

**Configure Vue to skip web components:**
```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // Tell Vue to skip custom elements with these prefixes
          isCustomElement: (tag) => tag.startsWith('my-') || tag.startsWith('sl-')
        }
      }
    })
  ]
});
```

**Event handling — use native event syntax:**
```vue
<!-- Vue 3 handles custom events natively -->
<my-button @my-click="handleClick">Click</my-button>

<!-- v-model doesn't work with web components by default -->
<!-- Use explicit value binding + event listener instead -->
<my-input
  :value="text"
  @my-input="text = $event.detail.value"
/>
```

**Property vs attribute binding:**
```vue
<!-- Use .prop modifier for property binding -->
<my-select .value="selectedItems" />

<!-- Without .prop, Vue sets as attribute (string only) -->
<my-select :value="selectedItems" />
```

## Astro Integration

### Correct Patterns

**Client directives for interactivity:**
```astro
---
// Web components need client-side JS to function
import '@my-lib/components/my-button';
---

<!-- client:load — component hydrates immediately -->
<my-button client:load>Click me</my-button>

<!-- client:visible — component hydrates when visible -->
<my-accordion client:visible>
  <my-accordion-item>Content</my-accordion-item>
</my-accordion>
```

**Script tag registration:**
```astro
---
// For simple usage, import in a script tag
---
<my-button>Click</my-button>

<script>
  import '@my-lib/components/my-button';
</script>
```

**Island architecture — web components ARE islands:**
Web components with Shadow DOM are natural islands — they encapsulate their own styles and behavior. Astro's island architecture works well with web components.

### Key Rules
1. Import the component registration in a `<script>` tag or component frontmatter
2. Use `client:load` for interactive components above the fold
3. Use `client:visible` for below-the-fold components
4. CSS custom properties work across island boundaries — tokens inherit normally

## Angular Integration

### Correct Patterns

**Enable custom elements schema:**
```ts
// In your module or component
@Component({
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  // ...
})
```

**Event handling:**
```html
<!-- Angular handles custom events natively -->
<my-button (my-click)="handleClick($event)">Click</my-button>
```

**Two-way binding:**
```html
<!-- Use standard Angular binding syntax -->
<my-input [value]="text" (my-input)="onInput($event)"></my-input>
```

## Common Anti-Patterns Across All Frameworks

| Anti-Pattern | Why It Fails | Fix |
|---|---|---|
| Importing WC registration in SSR context | `customElements` doesn't exist on server | Dynamic import or client-only boundary |
| Using framework-specific event syntax | Framework may not forward to DOM events | Use ref + addEventListener (React) or native syntax (Vue/Angular) |
| Setting complex objects as attributes | Attributes are always strings | Use property binding (`.prop` in Vue, ref in React) |
| Styling with framework scoped CSS | Scoped CSS can't pierce Shadow DOM | Use CSS custom properties or `::part()` |
| Wrapping in framework state management | WC has its own internal state | Sync via properties in, events out |

## Event Naming Conventions by Library

| Library | Event Prefix | Example | Detail Type |
|---|---|---|---|
| Shoelace | `sl-` | `sl-change`, `sl-show` | Varies per event |
| Material Web | No prefix | `change`, `close` | Native-like |
| Spectrum | `sp-` | `sp-opened` | Varies |
| FAST | `change` | Standard names | Native-like |
| Vaadin | Component name | `value-changed` | `{value: T}` |
| Lion | No prefix | `model-value-changed` | Varies |
| HELiX | `hx-` | `hx-change`, `hx-click` | Custom per event |

## Import Pattern Quick Reference

```ts
// Side-effect import (registers the element)
import '@my-lib/components/my-button';

// Named import (for TypeScript types)
import type { MyButton } from '@my-lib/components/my-button';

// React wrapper import (if library provides them)
import { MyButton } from '@my-lib/react';

// CDN usage (no bundler)
<script type="module" src="https://cdn.jsdelivr.net/npm/@my-lib/components/my-button.js"></script>
```
